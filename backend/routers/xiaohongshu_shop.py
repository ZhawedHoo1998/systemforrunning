import hashlib
import os
import time
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth import require_admin
from backend.database import get_db
from backend.models import User, XiaohongshuShopConnection


router = APIRouter(
    prefix="/api/xiaohongshu/shop",
    tags=["xiaohongshu-shop"],
    dependencies=[Depends(require_admin)],
)

XHS_VERSION = "2.0"
DEFAULT_API_BASE = "https://ark.xiaohongshu.com"
TOKEN_REFRESH_BUFFER = timedelta(minutes=30)


class XiaohongshuConnectRequest(BaseModel):
    code: str = Field(min_length=5, max_length=500)
    state: Optional[str] = Field(default=None, max_length=500)


class ProductImportRequest(BaseModel):
    item: dict[str, Any]


def _xhs_config() -> dict[str, str]:
    api_base = os.getenv("XHS_OPEN_API_BASE", DEFAULT_API_BASE).rstrip("/")
    return {
        "app_id": os.getenv("XHS_OPEN_APP_ID", "").strip(),
        "app_secret": os.getenv("XHS_OPEN_APP_SECRET", "").strip(),
        "redirect_uri": os.getenv("XHS_OPEN_REDIRECT_URI", "").strip(),
        "api_url": os.getenv(
            "XHS_OPEN_API_URL",
            f"{api_base}/ark/open_api/v3/common_controller",
        ).strip(),
        "auth_url": os.getenv(
            "XHS_OPEN_AUTH_URL",
            f"{api_base}/ark/authorization",
        ).strip(),
    }


def _require_xhs_config() -> dict[str, str]:
    config = _xhs_config()
    missing = [
        name
        for name in ("app_id", "app_secret", "redirect_uri", "api_url", "auth_url")
        if not config[name]
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"小红书开放平台配置不完整：{', '.join(missing)}",
        )
    return config


def _authorization_url(state: str) -> str | None:
    config = _xhs_config()
    if not config["app_id"] or not config["redirect_uri"] or not config["auth_url"]:
        return None
    params = urlencode({
        "appId": config["app_id"],
        "redirectUri": config["redirect_uri"],
        "state": state,
    })
    return f"{config['auth_url']}?{params}"


def _sign(method: str, app_id: str, timestamp: str, app_secret: str) -> str:
    source = f"{method}?appId={app_id}&timestamp={timestamp}&version={XHS_VERSION}{app_secret}"
    return hashlib.md5(source.encode("utf-8")).hexdigest()


def _ms_epoch_to_datetime(value: Any) -> datetime:
    try:
        timestamp = int(value)
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=502, detail="小红书令牌过期时间格式不正确") from error
    if timestamp > 100_000_000_000:
        timestamp = timestamp // 1000
    return datetime.utcfromtimestamp(timestamp)


def _get_connection(db: Session) -> XiaohongshuShopConnection | None:
    return (
        db.query(XiaohongshuShopConnection)
        .order_by(XiaohongshuShopConnection.updated_at.desc())
        .first()
    )


def _connection_to_status(
    connection: XiaohongshuShopConnection | None,
    current_user: User,
) -> dict[str, Any]:
    config = _xhs_config()
    configured = all(config[key] for key in ("app_id", "app_secret", "redirect_uri"))
    state = f"ruby-rain-{current_user.id[:8]}"
    now = datetime.utcnow()
    refresh_expired = bool(
        connection and connection.refresh_token_expires_at <= now
    )
    access_expired = bool(
        connection and connection.access_token_expires_at <= now
    )

    return {
        "configured": configured,
        "connected": connection is not None and not refresh_expired,
        "seller_id": connection.seller_id if connection else None,
        "seller_name": connection.seller_name if connection else None,
        "access_token_expires_at": (
            connection.access_token_expires_at.isoformat() if connection else None
        ),
        "refresh_token_expires_at": (
            connection.refresh_token_expires_at.isoformat() if connection else None
        ),
        "access_expired": access_expired,
        "refresh_expired": refresh_expired,
        "authorization_url": _authorization_url(state),
        "redirect_uri": config["redirect_uri"] or None,
        "api_url": config["api_url"] or None,
        "missing_config": [
            key
            for key in ("app_id", "app_secret", "redirect_uri")
            if not config[key]
        ],
    }


async def _call_gateway(
    method: str,
    params: dict[str, Any] | None = None,
    access_token: str | None = None,
) -> dict[str, Any]:
    config = _require_xhs_config()
    timestamp = str(int(time.time()))
    body: dict[str, Any] = {
        "appId": config["app_id"],
        "timestamp": timestamp,
        "version": XHS_VERSION,
        "method": method,
        "sign": _sign(method, config["app_id"], timestamp, config["app_secret"]),
    }
    if access_token:
        body["accessToken"] = access_token
    for key, value in (params or {}).items():
        if value is not None:
            body[key] = value

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            response = await client.post(
                config["api_url"],
                json=body,
                headers={"Content-Type": "application/json;charset=utf-8"},
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail=f"小红书接口请求失败：{error}") from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail="小红书接口返回了非 JSON 内容") from error

    error_code = payload.get("error_code")
    success = payload.get("success")
    if success is False or error_code not in (None, 0, "0"):
        message = (
            payload.get("error_msg")
            or payload.get("message")
            or payload.get("msg")
            or "未知错误"
        )
        raise HTTPException(
            status_code=502,
            detail=f"小红书接口错误 {error_code}: {message}",
        )

    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def _save_token_response(
    db: Session,
    current_user: User,
    token_data: dict[str, Any],
) -> XiaohongshuShopConnection:
    required_keys = [
        "accessToken",
        "accessTokenExpiresAt",
        "refreshToken",
        "refreshTokenExpiresAt",
        "sellerId",
    ]
    missing = [key for key in required_keys if key not in token_data]
    if missing:
        raise HTTPException(
            status_code=502,
            detail=f"小红书授权响应缺少字段：{', '.join(missing)}",
        )

    existing_connections = db.query(XiaohongshuShopConnection).all()
    for connection in existing_connections:
        db.delete(connection)
    db.flush()

    connection = XiaohongshuShopConnection(
        user_id=current_user.id,
        seller_id=str(token_data["sellerId"]),
        seller_name=str(token_data.get("sellerName") or ""),
        access_token=str(token_data["accessToken"]),
        access_token_expires_at=_ms_epoch_to_datetime(token_data["accessTokenExpiresAt"]),
        refresh_token=str(token_data["refreshToken"]),
        refresh_token_expires_at=_ms_epoch_to_datetime(token_data["refreshTokenExpiresAt"]),
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)
    return connection


async def _refresh_connection(
    db: Session,
    current_user: User,
    connection: XiaohongshuShopConnection,
) -> XiaohongshuShopConnection:
    if connection.refresh_token_expires_at <= datetime.utcnow():
        raise HTTPException(status_code=409, detail="小红书授权已过期，请重新授权店铺")

    token_data = await _call_gateway(
        "oauth.refreshToken",
        {"refreshToken": connection.refresh_token},
    )
    return _save_token_response(db, current_user, token_data)


async def _ensure_access_token(
    db: Session,
    current_user: User,
) -> XiaohongshuShopConnection:
    connection = _get_connection(db)
    if not connection:
        raise HTTPException(status_code=409, detail="尚未接入小红书店铺")
    if connection.access_token_expires_at <= datetime.utcnow() + TOKEN_REFRESH_BUFFER:
        return await _refresh_connection(db, current_user, connection)
    return connection


@router.get("/status")
async def get_shop_status(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return _connection_to_status(_get_connection(db), current_user)


@router.post("/connect")
async def connect_shop(
    request: XiaohongshuConnectRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    token_data = await _call_gateway(
        "oauth.getAccessToken",
        {"code": request.code.strip()},
    )
    connection = _save_token_response(db, current_user, token_data)
    return _connection_to_status(connection, current_user)


@router.post("/refresh")
async def refresh_shop_token(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    connection = _get_connection(db)
    if not connection:
        raise HTTPException(status_code=409, detail="尚未接入小红书店铺")
    refreshed = await _refresh_connection(db, current_user, connection)
    return _connection_to_status(refreshed, current_user)


@router.delete("")
async def disconnect_shop(db: Session = Depends(get_db)):
    connection = _get_connection(db)
    if connection:
        db.delete(connection)
        db.commit()
    return {"status": "ok"}


@router.get("/products")
async def list_shop_products(
    id: Optional[str] = None,
    barcode: Optional[str] = None,
    skucode: Optional[str] = None,
    buyable: Optional[bool] = None,
    page_no: int = Query(1, ge=1, le=500),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    connection = await _ensure_access_token(db, current_user)
    data = await _call_gateway(
        "product.getBasicItemList",
        {
            "id": id,
            "barcode": barcode,
            "skucode": skucode,
            "buyable": buyable,
            "pageNo": page_no,
            "pageSize": page_size,
        },
        access_token=connection.access_token,
    )
    return {
        "items": data.get("hits") if isinstance(data.get("hits"), list) else [],
        "current_page": data.get("currentPage", page_no),
        "page_size": data.get("pageSize", page_size),
        "total": data.get("total", 0),
        "raw": data,
    }


@router.get("/materials")
async def list_shop_materials(
    material_id: Optional[str] = None,
    name: Optional[str] = None,
    type: Optional[str] = None,
    status: Optional[int] = Query(None, ge=1, le=3),
    page_no: int = Query(1, ge=1, le=500),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    connection = await _ensure_access_token(db, current_user)
    data = await _call_gateway(
        "material.queryMaterial",
        {
            "materialId": material_id,
            "name": name,
            "type": type,
            "status": status,
            "pageNo": page_no,
            "pageSize": page_size,
        },
        access_token=connection.access_token,
    )
    items = data.get("materialDetailList")
    return {
        "items": items if isinstance(items, list) else [],
        "current_page": page_no,
        "page_size": page_size,
        "total": len(items) if isinstance(items, list) else 0,
        "raw": data,
    }
