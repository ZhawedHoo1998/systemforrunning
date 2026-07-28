import os
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User, UserSession
from backend.security import create_session_token, hash_session_token


SESSION_COOKIE_NAME = "ruby_rain_session"
SESSION_DAYS = max(1, min(int(os.getenv("SESSION_DAYS", "14")), 90))
SESSION_COOKIE_SECURE_MODE = os.getenv("SESSION_COOKIE_SECURE", "auto").strip().lower()


def use_secure_session_cookie(request: Request) -> bool:
    if SESSION_COOKIE_SECURE_MODE in {"true", "1", "yes"}:
        return True
    if SESSION_COOKIE_SECURE_MODE in {"false", "0", "no"}:
        return False

    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    forwarded_proto = forwarded_proto.split(",", 1)[0].strip().lower()
    return request.url.scheme == "https" or forwarded_proto == "https"


def create_user_session(db: Session, user: User) -> tuple[str, datetime]:
    token, token_hash = create_session_token()
    expires_at = datetime.utcnow() + timedelta(days=SESSION_DAYS)
    db.add(UserSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    ))
    db.commit()
    return token, expires_at


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录",
        )

    session = db.query(UserSession).filter(
        UserSession.token_hash == hash_session_token(token)
    ).first()
    if not session or session.expires_at <= datetime.utcnow():
        if session:
            db.delete(session)
            db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登录已过期，请重新登录",
        )

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="账号已停用",
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅管理员可以执行此操作",
        )
    return user
