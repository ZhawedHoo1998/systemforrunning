import asyncio
import os
import re
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import quote

import httpx
from fastapi import HTTPException

from backend.routers.xiaohongshu import _get_cli_path, run_xhs_command


PublicDataSource = Literal["auto", "cli", "tikhub"]
TIKHUB_DEFAULT_BASE_URL = "https://api.tikhub.io"
MAX_SYNC_PAGES = 30
MAX_DETAIL_NOTES = 12


async def public_source_status() -> dict[str, Any]:
    try:
        cli_path = _get_cli_path()
    except HTTPException:
        cli_path = None
    configured_default = os.getenv("XHS_PUBLIC_DATA_SOURCE", "auto").strip().lower()
    if configured_default not in {"auto", "cli", "tikhub"}:
        configured_default = "auto"
    status = {
        "cli_installed": bool(cli_path),
        "cli_path": cli_path,
        "cli_authenticated": False,
        "cli_user": None,
        "tikhub_configured": bool(os.getenv("TIKHUB_API_KEY", "").strip()),
        "default_source": configured_default,
        "default_max_pages": bounded_int("XHS_ACCOUNT_SYNC_MAX_PAGES", 10, 1, MAX_SYNC_PAGES),
        "public_data_scope": True,
        "private_analytics_configured": False,
    }
    if cli_path:
        try:
            data = await run_xhs_command("status", "", timeout_seconds=20)
            status["cli_authenticated"] = bool(data.get("authenticated"))
            user = data.get("user") if isinstance(data.get("user"), dict) else None
            if user:
                status["cli_user"] = {
                    "id": _text(user.get("id") or user.get("user_id")),
                    "name": _text(user.get("name") or user.get("nickname")),
                    "red_id": _text(user.get("red_id") or user.get("username")),
                }
        except HTTPException:
            pass
    return status


def bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(value, maximum))


def bounded_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(value, maximum))


def _number(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if not isinstance(value, str):
        return 0
    normalized = value.strip().replace(",", "")
    multiplier = 1
    if normalized.endswith("万"):
        normalized = normalized[:-1]
        multiplier = 10_000
    elif normalized.endswith("亿"):
        normalized = normalized[:-1]
        multiplier = 100_000_000
    try:
        return int(float(normalized) * multiplier)
    except ValueError:
        return 0


def _text(value: Any) -> str:
    return str(value or "").strip()


def _image_url(value: Any) -> str:
    if isinstance(value, str):
        return value.replace("http://", "https://", 1)
    if isinstance(value, list):
        for item in value:
            resolved = _image_url(item)
            if resolved:
                return resolved
        return ""
    if not isinstance(value, dict):
        return ""
    for key in (
        "url_default", "url_pre", "url", "original_url", "image", "imageb",
        "master_url", "url_size_large",
    ):
        resolved = _image_url(value.get(key))
        if resolved:
            return resolved
    for key in ("info_list", "images_list", "image_list", "backup_urls"):
        resolved = _image_url(value.get(key))
        if resolved:
            return resolved
    return ""


def _timestamp(value: Any) -> datetime | None:
    if isinstance(value, str) and value.isdigit():
        value = int(value)
    if not isinstance(value, (int, float)) or value <= 0:
        return None
    timestamp = float(value)
    if timestamp > 100_000_000_000:
        timestamp /= 1000
    try:
        return datetime.fromtimestamp(timestamp, timezone.utc).replace(tzinfo=None)
    except (OverflowError, OSError, ValueError):
        return None


def _interaction_value(card: dict[str, Any], *keys: str) -> int:
    interaction = card.get("interact_info")
    if isinstance(interaction, dict):
        for key in keys:
            value = _number(interaction.get(key))
            if value:
                return value
    for key in keys:
        value = _number(card.get(key))
        if value:
            return value
    return 0


def _page_reaches_cutoff(
    notes: list[dict[str, Any]],
    published_since: datetime | None,
) -> bool:
    if published_since is None:
        return False
    published = [
        note.get("published_at")
        for note in notes
        if isinstance(note.get("published_at"), datetime)
    ]
    # Old pinned notes may appear at the start of the first page. The last dated
    # note is a safer signal that normal reverse-chronological pagination crossed the window.
    return bool(published and published[-1] <= published_since)


def normalize_note(item: dict[str, Any]) -> dict[str, Any]:
    if isinstance(item.get("note_card"), dict):
        card = item["note_card"]
    elif isinstance(item.get("note"), dict):
        card = item["note"]
    elif isinstance(item.get("data"), dict):
        card = item["data"]
    else:
        card = item
    note_id = _text(
        item.get("id")
        or item.get("note_id")
        or card.get("id")
        or card.get("note_id")
    )
    images = (
        card.get("images_list")
        or card.get("image_list")
        or card.get("cover")
        or item.get("cover")
    )
    tags = []
    for tag in card.get("tag_list") or card.get("tags") or []:
        name = _text(tag.get("name")) if isinstance(tag, dict) else _text(tag)
        if name and name not in tags:
            tags.append(name)
    corner = card.get("corner") if isinstance(card.get("corner"), dict) else {}
    created = (
        card.get("create_time")
        or card.get("time")
        or card.get("publish_time")
        or item.get("create_time")
    )
    share_info = card.get("share_info") if isinstance(card.get("share_info"), dict) else {}
    return {
        "xhs_note_id": note_id,
        "title": _text(card.get("display_title") or card.get("title"))[:500],
        "content": _text(card.get("desc") or card.get("content"))[:30000],
        "cover_url": _image_url(images),
        "source_url": f"https://www.xiaohongshu.com/explore/{note_id}" if note_id else "",
        "note_type": _text(card.get("type") or "normal")[:30],
        "is_private": _text(corner.get("type") or card.get("privacy_status")).lower() == "private",
        "liked_count": _interaction_value(card, "liked_count", "likes", "nice_count"),
        "collected_count": _interaction_value(card, "collected_count", "infavs", "collected"),
        "comment_count": _interaction_value(card, "comment_count", "comments_count", "comments"),
        "share_count": _interaction_value(card, "share_count", "shares"),
        "tags": tags[:30],
        "published_at": _timestamp(created),
        "source_data": {
            "xsec_token": _text(item.get("xsec_token") or card.get("xsec_token") or share_info.get("xsec_token")),
            "cursor": _text(item.get("cursor") or card.get("cursor")),
        },
    }


def merge_note_detail(
    listing: dict[str, Any],
    detail: dict[str, Any],
) -> dict[str, Any]:
    """Merge a detail response without erasing valid listing metrics."""
    merged = dict(listing)
    for key in (
        "title", "content", "cover_url", "source_url", "note_type",
        "published_at", "tags",
    ):
        value = detail.get(key)
        if value not in (None, "", [], {}):
            merged[key] = value
    for key in ("liked_count", "collected_count", "comment_count", "share_count"):
        merged[key] = max(_number(listing.get(key)), _number(detail.get(key)))
    merged["is_private"] = bool(listing.get("is_private") or detail.get("is_private"))
    merged["source_data"] = {
        **(listing.get("source_data") if isinstance(listing.get("source_data"), dict) else {}),
        **(detail.get("source_data") if isinstance(detail.get("source_data"), dict) else {}),
    }
    return merged


def _nested_containers(data: dict[str, Any]) -> list[dict[str, Any]]:
    containers = [data]
    current = data
    for _ in range(3):
        nested = current.get("data")
        if not isinstance(nested, dict) or nested in containers:
            break
        containers.append(nested)
        current = nested
    return containers


def _extract_note_items(data: dict[str, Any]) -> list[dict[str, Any]]:
    for container in _nested_containers(data):
        for key in ("notes", "items", "note_list"):
            values = container.get(key)
            if isinstance(values, list):
                return [value for value in values if isinstance(value, dict)]
        for key in ("note", "note_card"):
            value = container.get(key)
            if isinstance(value, dict):
                return [value]
        if any(key in container for key in ("note_id", "display_title", "interact_info")):
            return [container]
    return []


def normalize_cli_profile(data: dict[str, Any], user_id: str) -> dict[str, Any]:
    basic = data.get("basic_info") if isinstance(data.get("basic_info"), dict) else data
    interactions = data.get("interactions") if isinstance(data.get("interactions"), list) else []
    stats: dict[str, int] = {}
    for item in interactions:
        if not isinstance(item, dict):
            continue
        key = _text(item.get("type") or item.get("name")).lower()
        stats[key] = _number(item.get("count"))
    avatar = _image_url(
        basic.get("imageb")
        or basic.get("images")
        or basic.get("avatar")
        or data.get("avatar")
    )
    return {
        "user_id": _text(basic.get("user_id") or data.get("user_id") or user_id),
        "red_id": _text(basic.get("red_id") or data.get("red_id")),
        "nickname": _text(basic.get("nickname") or basic.get("nick_name") or data.get("nickname")),
        "bio": _text(basic.get("desc") or data.get("desc")),
        "ip_location": _text(basic.get("ip_location") or data.get("ip_location")),
        "avatar_url": avatar,
        "followers": stats.get("fans", _number(data.get("fans"))),
        "following": stats.get("follows", _number(data.get("follows"))),
        "total_engagement": stats.get(
            "interaction",
            _number(data.get("liked")) + _number(data.get("collected")),
        ),
        "tags": data.get("tags") if isinstance(data.get("tags"), list) else [],
        "public_metrics": stats,
    }


def normalize_tikhub_profile(data: dict[str, Any], user_id: str) -> dict[str, Any]:
    containers = _nested_containers(data)
    profile = next(
        (
            container for container in reversed(containers)
            if any(key in container for key in ("red_id", "nickname", "nick_name", "user_id"))
        ),
        containers[-1],
    )
    share_info = profile.get("share_info") if isinstance(profile.get("share_info"), dict) else {}
    interactions = profile.get("interactions") if isinstance(profile.get("interactions"), list) else []
    public_metrics: dict[str, int] = {}
    for item in interactions:
        if not isinstance(item, dict):
            continue
        key = _text(item.get("type") or item.get("name")).lower()
        if key:
            public_metrics[key] = _number(item.get("count"))
    metric_fields = {
        "fans": ("fans", "fans_count", "followers", "followers_count"),
        "follows": ("follows", "following_count", "following"),
        "liked": ("liked", "liked_count", "likes"),
        "collected": ("collected", "collected_count", "collections"),
        "note_count": ("note_count", "notes_count", "posted_note_count"),
    }
    for metric, aliases in metric_fields.items():
        value = next((_number(profile.get(alias)) for alias in aliases if profile.get(alias) is not None), 0)
        if value or metric not in public_metrics:
            public_metrics[metric] = value
    followers = public_metrics.get("fans", 0)
    following = public_metrics.get("follows", 0)
    total_engagement = public_metrics.get(
        "interaction",
        public_metrics.get("liked", 0) + public_metrics.get("collected", 0),
    )
    return {
        "user_id": _text(profile.get("user_id") or profile.get("id") or user_id),
        "red_id": _text(profile.get("red_id")),
        "nickname": _text(share_info.get("title") or profile.get("nickname") or profile.get("nick_name")),
        "bio": _text(profile.get("desc")),
        "ip_location": _text(profile.get("ip_location") or profile.get("location")),
        "avatar_url": _image_url(profile.get("imageb") or profile.get("images") or profile.get("avatar")),
        "followers": followers,
        "following": following,
        "total_engagement": total_engagement,
        "tags": profile.get("tags") if isinstance(profile.get("tags"), list) else [],
        "public_metrics": public_metrics,
        "verified": bool(profile.get("verified") or profile.get("is_verified")),
        "verification": _text(
            profile.get("verified_reason")
            or profile.get("verification")
            or profile.get("official_verify_content")
        ),
    }


def _search_candidates(data: dict[str, Any]) -> list[dict[str, str]]:
    containers = _nested_containers(data)
    raw_users: list[Any] = []
    for container in containers:
        for key in ("user_info_dtos", "users", "items"):
            if isinstance(container.get(key), list):
                raw_users = container[key]
                break
        if raw_users:
            break
    candidates = []
    for item in raw_users:
        if not isinstance(item, dict):
            continue
        user = item.get("user_base_dto") if isinstance(item.get("user_base_dto"), dict) else item
        user_id = _text(user.get("user_id") or user.get("userid") or user.get("id"))
        if not user_id:
            continue
        candidates.append({
            "user_id": user_id,
            "red_id": _text(user.get("red_id")),
            "nickname": _text(user.get("user_nickname") or user.get("nickname") or user.get("nick_name")),
        })
    return candidates


def _select_candidate(identifier: str, candidates: list[dict[str, str]]) -> str:
    exact = [
        candidate for candidate in candidates
        if candidate["red_id"] == identifier
        or candidate["nickname"].casefold() == identifier.casefold()
        or candidate["user_id"] == identifier
    ]
    if len(exact) == 1:
        return exact[0]["user_id"]
    if not exact and len(candidates) == 1:
        return candidates[0]["user_id"]
    if not exact:
        raise HTTPException(
            status_code=422,
            detail="没有找到对应的小红书账号，请填写准确的小红书号或账号主页链接",
        )
    raise HTTPException(status_code=422, detail="搜索到多个同名账号，请改用账号主页链接")


async def resolve_cli_user_id(identifier: str) -> str:
    if re.fullmatch(r"[0-9a-fA-F]{24}", identifier):
        return identifier
    data = await run_xhs_command("search-user", identifier, timeout_seconds=45)
    return _select_candidate(identifier, _search_candidates(data))


async def _cli_note_detail(note: dict[str, Any]) -> dict[str, Any]:
    token = _text(note.get("source_data", {}).get("xsec_token"))
    target = note["xhs_note_id"]
    if token:
        target = (
            f"https://www.xiaohongshu.com/explore/{note['xhs_note_id']}"
            f"?xsec_token={quote(token, safe='')}&xsec_source=pc_user"
        )
    data = await run_xhs_command("read", target, timeout_seconds=45)
    items = _extract_note_items(data)
    if not items:
        return note
    detail = normalize_note(items[0])
    if not detail["xhs_note_id"]:
        detail["xhs_note_id"] = note["xhs_note_id"]
    return merge_note_detail(note, detail)


def _detail_candidates(notes: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    public = [note for note in notes if note["xhs_note_id"] and not note["is_private"]]
    ranked = sorted(
        public,
        key=lambda note: (
            note["liked_count"] + note["collected_count"]
            + note["comment_count"] * 2 + note["share_count"] * 2
        ),
        reverse=True,
    )
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for note in [*public[: max(4, limit // 2)], *ranked]:
        if note["xhs_note_id"] in seen:
            continue
        seen.add(note["xhs_note_id"])
        selected.append(note)
        if len(selected) >= limit:
            break
    return selected


async def sync_with_cli(
    identifier: str,
    max_pages: int,
    detail_notes: int | None = None,
    published_since: datetime | None = None,
) -> dict[str, Any]:
    user_id = await resolve_cli_user_id(identifier)
    profile_data = await run_xhs_command("user", user_id, timeout_seconds=45)
    profile = normalize_cli_profile(profile_data, user_id)
    notes_by_id: dict[str, dict[str, Any]] = {}
    cursor = ""
    pages_fetched = 0
    warnings: list[str] = []
    has_more = False
    cutoff_reached = False
    request_delay = bounded_float("XHS_CLI_REQUEST_DELAY_SECONDS", 1.5, 0.5, 10.0)

    for _ in range(max_pages):
        extra_args = ["--cursor", cursor] if cursor else []
        page = await run_xhs_command(
            "user-posts",
            user_id,
            timeout_seconds=60,
            extra_args=extra_args,
        )
        raw_notes = page.get("notes") if isinstance(page.get("notes"), list) else []
        page_notes: list[dict[str, Any]] = []
        for item in raw_notes:
            if not isinstance(item, dict):
                continue
            note = normalize_note(item)
            if note["xhs_note_id"]:
                page_notes.append(note)
                notes_by_id[note["xhs_note_id"]] = note
        pages_fetched += 1
        next_cursor = _text(page.get("cursor"))
        has_more = bool(page.get("has_more") and raw_notes and next_cursor and next_cursor != cursor)
        cutoff_reached = _page_reaches_cutoff(page_notes, published_since)
        if cutoff_reached:
            break
        if not has_more:
            break
        cursor = next_cursor
        await asyncio.sleep(request_delay)

    page_limit_reached = bool(has_more and pages_fetched >= max_pages and not cutoff_reached)
    if page_limit_reached:
        warnings.append(f"账号仍有更多公开笔记，本次已达到 {max_pages} 页同步上限")

    notes = list(notes_by_id.values())
    configured_detail_limit = (
        bounded_int("XHS_ACCOUNT_DETAIL_NOTES", 8, 0, MAX_DETAIL_NOTES)
        if detail_notes is None
        else max(0, min(detail_notes, MAX_DETAIL_NOTES))
    )
    detail_limit = min(configured_detail_limit, len(notes))
    details = _detail_candidates(notes, detail_limit)
    for note in details:
        try:
            notes_by_id[note["xhs_note_id"]] = await _cli_note_detail(note)
        except HTTPException:
            warnings.append(f"《{note['title'] or note['xhs_note_id']}》正文读取失败，仅保留标题和互动数据")
        await asyncio.sleep(request_delay)

    return {
        "source": "cli",
        "profile": profile,
        "notes": list(notes_by_id.values()),
        "pages_fetched": pages_fetched,
        "has_more": has_more,
        "page_limit_reached": page_limit_reached,
        "window_covered": bool(published_since is not None and (cutoff_reached or not has_more)),
        "warnings": warnings,
    }


async def _tikhub_get(
    client: httpx.AsyncClient,
    endpoint: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    try:
        response = await client.get(endpoint, params=params)
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPStatusError as error:
        if error.response.status_code in {401, 403}:
            detail = "TikHub API Key 无效或没有小红书接口权限"
        elif error.response.status_code == 402:
            detail = "TikHub 账户余额、套餐或接口额度不足，请先在 TikHub 控制台处理"
        elif error.response.status_code == 429:
            detail = "TikHub 请求频率受限，请稍后重试"
        else:
            detail = f"TikHub 请求失败：HTTP {error.response.status_code}"
        raise HTTPException(status_code=502, detail=detail) from error
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail="TikHub 暂时不可用或返回格式异常") from error

    if not isinstance(payload, dict):
        raise HTTPException(status_code=502, detail="TikHub 返回格式异常")
    code = payload.get("code")
    if code not in (None, 0, 200, "0", "200"):
        message = _text(payload.get("message") or payload.get("msg") or payload.get("detail"))
        raise HTTPException(status_code=502, detail=f"TikHub 接口错误：{message or code}")
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


async def resolve_tikhub_user_id(client: httpx.AsyncClient, identifier: str) -> str:
    if re.fullmatch(r"[0-9a-fA-F]{24}", identifier):
        return identifier
    data = await _tikhub_get(
        client,
        "/api/v1/xiaohongshu/app_v2/search_users",
        {"keyword": identifier, "page": 1},
    )
    return _select_candidate(identifier, _search_candidates(data))


def _tikhub_notes_container(data: dict[str, Any]) -> dict[str, Any]:
    containers = _nested_containers(data)
    return next(
        (
            container for container in reversed(containers)
            if any(key in container for key in ("notes", "items", "note_list", "has_more", "cursor"))
        ),
        containers[-1],
    )


async def _tikhub_note_detail(
    client: httpx.AsyncClient,
    note: dict[str, Any],
) -> dict[str, Any]:
    endpoint = (
        "/api/v1/xiaohongshu/app_v2/get_video_note_detail"
        if "video" in _text(note.get("note_type")).lower()
        else "/api/v1/xiaohongshu/app_v2/get_image_note_detail"
    )
    data = await _tikhub_get(client, endpoint, {"note_id": note["xhs_note_id"]})
    items = _extract_note_items(data)
    if not items:
        return note
    detail = normalize_note(items[0])
    if not detail["xhs_note_id"]:
        detail["xhs_note_id"] = note["xhs_note_id"]
    return merge_note_detail(note, detail)


async def sync_with_tikhub(
    identifier: str,
    max_pages: int,
    detail_notes: int | None = None,
    published_since: datetime | None = None,
) -> dict[str, Any]:
    api_key = os.getenv("TIKHUB_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="后台尚未配置 TIKHUB_API_KEY")
    base_url = os.getenv("TIKHUB_BASE_URL", TIKHUB_DEFAULT_BASE_URL).strip().rstrip("/")
    timeout = httpx.Timeout(45.0, connect=15.0)
    headers = {"Authorization": f"Bearer {api_key}"}
    request_delay = bounded_float("XHS_TIKHUB_REQUEST_DELAY_SECONDS", 0.6, 0.2, 10.0)
    async with httpx.AsyncClient(base_url=base_url, headers=headers, timeout=timeout) as client:
        user_id = await resolve_tikhub_user_id(client, identifier)
        profile_data = await _tikhub_get(
            client,
            "/api/v1/xiaohongshu/app_v2/get_user_info",
            {"user_id": user_id},
        )
        profile = normalize_tikhub_profile(profile_data, user_id)
        notes_by_id: dict[str, dict[str, Any]] = {}
        cursor = ""
        pages_fetched = 0
        has_more = False
        cutoff_reached = False
        warnings: list[str] = []

        for _ in range(max_pages):
            params = {"user_id": user_id, "cursor": cursor}
            page_data = await _tikhub_get(
                client,
                "/api/v1/xiaohongshu/app_v2/get_user_posted_notes",
                params,
            )
            page = _tikhub_notes_container(page_data)
            raw_notes = _extract_note_items(page)
            page_notes: list[dict[str, Any]] = []
            for item in raw_notes:
                if not isinstance(item, dict):
                    continue
                note = normalize_note(item)
                if note["xhs_note_id"]:
                    page_notes.append(note)
                    notes_by_id[note["xhs_note_id"]] = note
            pages_fetched += 1
            next_cursor = ""
            if raw_notes and isinstance(raw_notes[-1], dict):
                next_cursor = _text(
                    raw_notes[-1].get("cursor")
                    or raw_notes[-1].get("note_id")
                    or raw_notes[-1].get("id")
                )
            next_cursor = _text(page.get("cursor") or page.get("next_cursor") or next_cursor)
            has_more_value = page.get("has_more")
            has_more = bool(
                raw_notes
                and next_cursor
                and next_cursor != cursor
                and (has_more_value is None or bool(has_more_value))
            )
            cutoff_reached = _page_reaches_cutoff(page_notes, published_since)
            if cutoff_reached:
                break
            if not has_more:
                break
            cursor = next_cursor
            await asyncio.sleep(request_delay)

        page_limit_reached = bool(has_more and pages_fetched >= max_pages and not cutoff_reached)
        if page_limit_reached:
            warnings.append(f"账号仍有更多公开笔记，本次已达到 {max_pages} 页同步上限")

        notes = list(notes_by_id.values())
        configured_detail_limit = (
            bounded_int("XHS_ACCOUNT_DETAIL_NOTES", 8, 0, MAX_DETAIL_NOTES)
            if detail_notes is None
            else max(0, min(detail_notes, MAX_DETAIL_NOTES))
        )
        detail_limit = min(configured_detail_limit, len(notes))
        for note in _detail_candidates(notes, detail_limit):
            try:
                notes_by_id[note["xhs_note_id"]] = await _tikhub_note_detail(client, note)
            except HTTPException:
                warnings.append(f"《{note['title'] or note['xhs_note_id']}》正文读取失败，仅保留标题和互动数据")
            await asyncio.sleep(request_delay)

    return {
        "source": "tikhub",
        "profile": profile,
        "notes": list(notes_by_id.values()),
        "pages_fetched": pages_fetched,
        "has_more": has_more,
        "page_limit_reached": page_limit_reached,
        "window_covered": bool(published_since is not None and (cutoff_reached or not has_more)),
        "warnings": warnings,
    }


async def sync_public_account(
    identifier: str,
    source: PublicDataSource,
    max_pages: int,
    detail_notes: int | None = None,
    preferred_source: Literal["cli", "tikhub"] | None = None,
    published_since: datetime | None = None,
) -> dict[str, Any]:
    max_pages = max(1, min(max_pages, MAX_SYNC_PAGES))
    if source == "cli":
        return await sync_with_cli(identifier, max_pages, detail_notes, published_since)
    if source == "tikhub":
        return await sync_with_tikhub(identifier, max_pages, detail_notes, published_since)

    configured_default = os.getenv("XHS_PUBLIC_DATA_SOURCE", "auto").strip().lower()
    tikhub_available = bool(os.getenv("TIKHUB_API_KEY", "").strip())
    preferred = preferred_source or (
        configured_default if configured_default in {"cli", "tikhub"} else "cli"
    )
    if preferred == "tikhub" and not tikhub_available:
        preferred = "cli"
    providers = [preferred]
    fallback = "cli" if preferred == "tikhub" else "tikhub"
    if fallback == "cli" or tikhub_available:
        providers.append(fallback)

    first_error: HTTPException | None = None
    for index, provider in enumerate(providers):
        try:
            result = await (
                sync_with_tikhub(identifier, max_pages, detail_notes, published_since)
                if provider == "tikhub"
                else sync_with_cli(identifier, max_pages, detail_notes, published_since)
            )
            if index and first_error:
                failed_provider = "TikHub" if preferred == "tikhub" else "CLI"
                result["warnings"].insert(
                    0,
                    f"{failed_provider} 同步失败，已回退到 {provider.upper()}：{first_error.detail}",
                )
            return result
        except HTTPException as error:
            first_error = first_error or error
    if first_error:
        raise first_error
    raise HTTPException(status_code=503, detail="没有可用的小红书公开数据源")


def _discovery_candidate(item: dict[str, Any], keyword: str) -> dict[str, Any] | None:
    card = item.get("note_card") if isinstance(item.get("note_card"), dict) else item.get("note")
    if not isinstance(card, dict):
        card = item
    user = card.get("user") if isinstance(card.get("user"), dict) else {}
    user_id = _text(user.get("user_id") or user.get("userid") or user.get("id"))
    nickname = _text(user.get("nickname") or user.get("nick_name") or user.get("name"))
    if not user_id or not nickname:
        return None
    note = normalize_note({**item, "note_card": card})
    return {
        "user_id": user_id,
        "red_id": _text(user.get("red_id")),
        "nickname": nickname,
        "avatar_url": _image_url(user.get("images") or user.get("image") or user.get("avatar")),
        "keyword": keyword,
        "note": note,
    }


def _rank_discovery(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    accounts: dict[str, dict[str, Any]] = {}
    seen_matches: set[tuple[str, str, str]] = set()
    for candidate in candidates:
        user_id = candidate["user_id"]
        note_id = _text(candidate.get("note", {}).get("xhs_note_id"))
        match_key = (user_id, candidate["keyword"], note_id)
        if note_id and match_key in seen_matches:
            continue
        seen_matches.add(match_key)
        account = accounts.setdefault(user_id, {
            "user_id": user_id,
            "red_id": candidate["red_id"],
            "nickname": candidate["nickname"],
            "avatar_url": candidate["avatar_url"],
            "keywords": set(),
            "matched_notes": 0,
            "total_likes": 0,
            "total_collections": 0,
            "total_comments": 0,
            "sample_notes": [],
        })
        account["keywords"].add(candidate["keyword"])
        account["matched_notes"] += 1
        note = candidate["note"]
        account["total_likes"] += note["liked_count"]
        account["total_collections"] += note["collected_count"]
        account["total_comments"] += note["comment_count"]
        if len(account["sample_notes"]) < 5 and note["xhs_note_id"]:
            account["sample_notes"].append({
                "id": note["xhs_note_id"],
                "title": note["title"],
                "liked_count": note["liked_count"],
                "collected_count": note["collected_count"],
            })
    ranked = []
    for account in accounts.values():
        keywords = sorted(account.pop("keywords"))
        account["keywords"] = keywords
        account["score"] = (
            len(keywords) * 20_000
            + account["total_likes"]
            + account["total_collections"]
        )
        ranked.append(account)
    return sorted(ranked, key=lambda account: account["score"], reverse=True)


async def discover_public_accounts(
    keywords: list[str],
    source: PublicDataSource,
    pages_per_keyword: int,
) -> dict[str, Any]:
    auto_requested = source == "auto"
    normalized_source = source
    if normalized_source == "auto":
        configured_default = os.getenv("XHS_PUBLIC_DATA_SOURCE", "auto").strip().lower()
        if configured_default in {"cli", "tikhub"}:
            normalized_source = configured_default  # type: ignore[assignment]
        else:
            normalized_source = "cli"
    if (
        normalized_source == "tikhub"
        and auto_requested
        and not os.getenv("TIKHUB_API_KEY", "").strip()
    ):
        normalized_source = "cli"
    pages_per_keyword = max(1, min(pages_per_keyword, 3))
    found: list[dict[str, Any]] = []
    warnings: list[str] = []

    if normalized_source == "tikhub":
        api_key = os.getenv("TIKHUB_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=503, detail="后台尚未配置 TIKHUB_API_KEY")
        base_url = os.getenv("TIKHUB_BASE_URL", TIKHUB_DEFAULT_BASE_URL).strip().rstrip("/")
        async with httpx.AsyncClient(
            base_url=base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=httpx.Timeout(45.0, connect=15.0),
        ) as client:
            for keyword in keywords:
                search_id = ""
                search_session_id = ""
                for page_number in range(1, pages_per_keyword + 1):
                    try:
                        data = await _tikhub_get(
                            client,
                            "/api/v1/xiaohongshu/app_v2/search_notes",
                            {
                                "keyword": keyword,
                                "page": page_number,
                                "sort_type": "general",
                                "note_type": "不限",
                                "time_filter": "不限",
                                "search_id": search_id,
                                "search_session_id": search_session_id,
                                "source": "explore_feed",
                                "ai_mode": 0,
                            },
                        )
                    except HTTPException as error:
                        warnings.append(f"“{keyword}”第 {page_number} 页失败：{error.detail}")
                        break
                    page = _tikhub_notes_container(data)
                    search_id = _text(page.get("search_id") or data.get("search_id") or search_id)
                    search_session_id = _text(
                        page.get("search_session_id")
                        or data.get("search_session_id")
                        or search_session_id
                    )
                    items = _extract_note_items(page)
                    for item in items:
                        if isinstance(item, dict):
                            candidate = _discovery_candidate(item, keyword)
                            if candidate:
                                found.append(candidate)
                    if not items or page.get("has_more") is False:
                        break
                    await asyncio.sleep(
                        bounded_float("XHS_TIKHUB_REQUEST_DELAY_SECONDS", 0.6, 0.2, 10.0)
                    )
    else:
        for keyword in keywords:
            for page_number in range(1, pages_per_keyword + 1):
                try:
                    data = await run_xhs_command(
                        "search",
                        keyword,
                        timeout_seconds=60,
                        extra_args=["--page", str(page_number), "--sort", "general"],
                    )
                except HTTPException as error:
                    warnings.append(f"“{keyword}”第 {page_number} 页失败：{error.detail}")
                    break
                items = data.get("items") if isinstance(data.get("items"), list) else []
                for item in items:
                    if isinstance(item, dict):
                        candidate = _discovery_candidate(item, keyword)
                        if candidate:
                            found.append(candidate)
                if not items or data.get("has_more") is False:
                    break
                await asyncio.sleep(2)

    fallback_source = None
    if auto_requested and not found:
        if normalized_source == "tikhub":
            fallback_source = "cli"
        elif os.getenv("TIKHUB_API_KEY", "").strip():
            fallback_source = "tikhub"
    if fallback_source:
        fallback = await discover_public_accounts(keywords, fallback_source, pages_per_keyword)
        fallback["warnings"] = [
            *warnings,
            f"{normalized_source.upper()} 未返回可用候选，已回退到 {fallback_source.upper()} 搜索",
            *fallback["warnings"],
        ]
        return fallback

    return {
        "source": normalized_source,
        "keywords": keywords,
        "candidates": _rank_discovery(found)[:100],
        "warnings": warnings,
    }
