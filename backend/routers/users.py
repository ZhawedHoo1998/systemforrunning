import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth import (
    SESSION_COOKIE_NAME,
    SESSION_COOKIE_SECURE,
    SESSION_DAYS,
    create_user_session,
    get_current_user,
    require_admin,
)
from backend.database import get_db
from backend.models import User, UserSession
from backend.security import hash_password, hash_session_token, verify_password


auth_router = APIRouter(prefix="/api/auth", tags=["auth"])
users_router = APIRouter(prefix="/api/users", tags=["users"])
USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{2,49}$")


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["admin", "writer"] = "writer"


class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    role: Optional[Literal["admin", "writer"]] = None
    is_active: Optional[bool] = None


def normalize_username(username: str) -> str:
    normalized = username.strip().lower()
    if not USERNAME_PATTERN.fullmatch(normalized):
        raise HTTPException(
            status_code=422,
            detail="用户名需为 3-50 位小写字母、数字、点、下划线或短横线",
        )
    return normalized


def user_to_dict(user: User):
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


@auth_router.post("/login")
async def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    username = payload.username.strip().lower()
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码不正确",
        )

    token, _ = create_user_session(db, user)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/",
    )
    return user_to_dict(user)


@auth_router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        db.query(UserSession).filter(
            UserSession.token_hash == hash_session_token(token)
        ).delete(synchronize_session=False)
        db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"status": "ok"}


@auth_router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@auth_router.put("/password")
async def change_password(
    payload: PasswordChangeRequest,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=422, detail="当前密码不正确")
    user.password_hash = hash_password(payload.new_password)
    db.query(UserSession).filter(UserSession.user_id == user.id).delete(
        synchronize_session=False
    )
    db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"status": "ok"}


@users_router.get("")
async def list_users(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at.asc()).all()
    return [user_to_dict(user) for user in users]


@users_router.post("")
async def create_user(
    payload: UserCreateRequest,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    username = normalize_username(payload.username)
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=409, detail="用户名已存在")
    user = User(
        username=username,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@users_router.put("/{user_id}")
async def update_user(
    user_id: str,
    payload: UserUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == admin.id and (
        payload.is_active is False or payload.role == "writer"
    ):
        raise HTTPException(status_code=422, detail="不能停用自己或移除自己的管理员权限")

    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        db.query(UserSession).filter(UserSession.user_id == user.id).delete(
            synchronize_session=False
        )

    db.commit()
    db.refresh(user)
    return user_to_dict(user)
