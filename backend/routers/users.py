from collections import defaultdict, deque
import ipaddress
import math
import os
import re
from threading import Lock
from time import monotonic
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth import (
    SESSION_COOKIE_NAME,
    SESSION_DAYS,
    create_user_session,
    get_current_user,
    require_admin,
    use_secure_session_cookie,
)
from backend.database import get_db
from backend.models import User, UserSession
from backend.security import hash_password, hash_session_token, verify_password


auth_router = APIRouter(prefix="/api/auth", tags=["auth"])
users_router = APIRouter(prefix="/api/users", tags=["users"])
USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{2,49}$")
LOGIN_RATE_WINDOW_SECONDS = max(
    60,
    min(int(os.getenv("LOGIN_RATE_WINDOW_SECONDS", "900")), 3600),
)
LOGIN_RATE_IP_ATTEMPTS = max(
    5,
    min(int(os.getenv("LOGIN_RATE_IP_ATTEMPTS", "30")), 200),
)
LOGIN_RATE_ACCOUNT_ATTEMPTS = max(
    3,
    min(int(os.getenv("LOGIN_RATE_ACCOUNT_ATTEMPTS", "8")), 50),
)
_login_attempts: dict[str, deque[float]] = defaultdict(deque)
_login_attempts_lock = Lock()
_dummy_password_hash = hash_password("ruby-rain-invalid-login-placeholder")


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


def _client_address(request: Request) -> str:
    candidates = [
        request.headers.get("cf-connecting-ip", ""),
        request.headers.get("x-forwarded-for", "").split(",", 1)[0],
        request.client.host if request.client else "",
    ]
    for candidate in candidates:
        try:
            return str(ipaddress.ip_address(candidate.strip()))
        except ValueError:
            continue
    return "unknown"


def _rate_limit_keys(request: Request, username: str) -> list[tuple[str, int]]:
    address = _client_address(request)
    return [
        (f"ip:{address}", LOGIN_RATE_IP_ATTEMPTS),
        (f"account:{address}:{username}", LOGIN_RATE_ACCOUNT_ATTEMPTS),
    ]


def _trim_login_attempts(attempts: deque[float], now: float) -> None:
    cutoff = now - LOGIN_RATE_WINDOW_SECONDS
    while attempts and attempts[0] <= cutoff:
        attempts.popleft()


def _check_login_rate_limit(request: Request, username: str) -> None:
    now = monotonic()
    with _login_attempts_lock:
        for key, limit in _rate_limit_keys(request, username):
            attempts = _login_attempts[key]
            _trim_login_attempts(attempts, now)
            if len(attempts) >= limit:
                retry_after = max(
                    1,
                    math.ceil(LOGIN_RATE_WINDOW_SECONDS - (now - attempts[0])),
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="登录尝试过于频繁，请稍后再试",
                    headers={"Retry-After": str(retry_after)},
                )


def _record_failed_login(request: Request, username: str) -> None:
    now = monotonic()
    with _login_attempts_lock:
        for key, _ in _rate_limit_keys(request, username):
            attempts = _login_attempts[key]
            _trim_login_attempts(attempts, now)
            attempts.append(now)


def _clear_login_attempts(request: Request, username: str) -> None:
    with _login_attempts_lock:
        for key, _ in _rate_limit_keys(request, username):
            _login_attempts.pop(key, None)


@auth_router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    username = payload.username.strip().lower()
    _check_login_rate_limit(request, username)
    user = db.query(User).filter(User.username == username).first()
    password_hash = user.password_hash if user else _dummy_password_hash
    password_matches = verify_password(payload.password, password_hash)
    if not user or not user.is_active or not password_matches:
        _record_failed_login(request, username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码不正确",
        )

    _clear_login_attempts(request, username)
    token, _ = create_user_session(db, user)
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=use_secure_session_cookie(request),
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
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=use_secure_session_cookie(request),
        httponly=True,
        samesite="lax",
    )
    return {"status": "ok"}


@auth_router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@auth_router.put("/password")
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
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
    response.delete_cookie(
        SESSION_COOKIE_NAME,
        path="/",
        secure=use_secure_session_cookie(request),
        httponly=True,
        samesite="lax",
    )
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
