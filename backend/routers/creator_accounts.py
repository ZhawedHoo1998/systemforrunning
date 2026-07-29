import asyncio
import os
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Awaitable, Callable, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from backend.auth import get_current_user, require_account_query_operator, require_manager
from backend.database import SessionLocal, get_db
from backend.models import (
    CreatorAccount,
    CreatorAccountNote,
    CreatorAccountNoteSnapshot,
    CreatorAccountSnapshot,
    User,
)
from backend.routers.xiaohongshu import UPLOAD_DIR, download_images, download_video
from backend.xhs_public_data import (
    discover_public_accounts,
    fetch_cli_note_detail,
    normalize_note,
    public_source_status,
    sync_public_account,
    sync_with_cli,
)


router = APIRouter(prefix="/api/creator-accounts", tags=["creator-accounts"])

MAX_PROFILE_NOTES = 12
HISTORY_ARCHIVE_MAX_PAGES = 1000
ArchivePageCallback = Callable[[list[dict[str, Any]], dict[str, Any]], Awaitable[None]]
AccountKind = Literal["owned", "competitor"]
DataSource = Literal["auto", "cli", "tikhub"]


def _normalize_xhs_user_id(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        return normalized
    if "://" in normalized:
        parsed = urlparse(normalized)
        match = re.search(r"/user/profile/([^/?#]+)", parsed.path)
        if not match:
            raise ValueError("请输入有效的小红书账号主页链接或用户 ID")
        normalized = match.group(1)
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,100}", normalized):
        raise ValueError("小红书用户 ID 格式不正确")
    return normalized


def _clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _clean_list(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value.strip()))[:20]


class CreatorAccountCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    xhs_user_id: str = Field(min_length=1, max_length=1000)
    account_kind: AccountKind = "owned"
    data_source: DataSource = "auto"
    positioning: Optional[str] = Field(default=None, max_length=5000)
    target_audience: Optional[str] = Field(default=None, max_length=5000)
    tone_style: Optional[str] = Field(default=None, max_length=5000)
    content_pillars: list[str] = Field(default_factory=list, max_length=20)
    title_guidelines: Optional[str] = Field(default=None, max_length=5000)
    body_guidelines: Optional[str] = Field(default=None, max_length=5000)
    conversion_goal: Optional[str] = Field(default=None, max_length=5000)
    prohibited_terms: Optional[str] = Field(default=None, max_length=5000)
    is_active: bool = True

    @field_validator("xhs_user_id")
    @classmethod
    def normalize_user_id(cls, value: str):
        return _normalize_xhs_user_id(value)

    @field_validator("content_pillars")
    @classmethod
    def normalize_pillars(cls, values: list[str]):
        return _clean_list(values)


class CreatorAccountUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    xhs_user_id: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    account_kind: Optional[AccountKind] = None
    data_source: Optional[DataSource] = None
    positioning: Optional[str] = Field(default=None, max_length=5000)
    target_audience: Optional[str] = Field(default=None, max_length=5000)
    tone_style: Optional[str] = Field(default=None, max_length=5000)
    content_pillars: Optional[list[str]] = Field(default=None, max_length=20)
    title_guidelines: Optional[str] = Field(default=None, max_length=5000)
    body_guidelines: Optional[str] = Field(default=None, max_length=5000)
    conversion_goal: Optional[str] = Field(default=None, max_length=5000)
    prohibited_terms: Optional[str] = Field(default=None, max_length=5000)
    is_active: Optional[bool] = None

    @field_validator("xhs_user_id")
    @classmethod
    def normalize_user_id(cls, value: Optional[str]):
        return _normalize_xhs_user_id(value) if value is not None else value

    @field_validator("content_pillars")
    @classmethod
    def normalize_pillars(cls, values: Optional[list[str]]):
        return _clean_list(values) if values is not None else values


class CreatorDiscoveryRequest(BaseModel):
    keywords: list[str] = Field(min_length=1, max_length=20)
    source: DataSource = "auto"
    pages_per_keyword: int = Field(default=1, ge=1, le=3)

    @field_validator("keywords")
    @classmethod
    def normalize_keywords(cls, values: list[str]):
        normalized = list(dict.fromkeys(
            value.strip()[:50] for value in values if value.strip()
        ))
        if not normalized:
            raise ValueError("至少需要一个搜索关键词")
        return normalized


def creator_account_to_dict(account: CreatorAccount) -> dict[str, Any]:
    return {
        "id": account.id,
        "name": account.name,
        "xhs_user_id": account.xhs_user_id,
        "account_kind": account.account_kind or "owned",
        "data_source": account.data_source or "auto",
        "last_sync_source": account.last_sync_source,
        "last_sync_status": account.last_sync_status or "never",
        "last_sync_error": account.last_sync_error,
        "synced_note_count": account.synced_note_count or 0,
        "red_id": account.red_id,
        "nickname": account.nickname,
        "avatar_url": account.avatar_url,
        "profile_url": account.profile_url,
        "bio": account.bio,
        "ip_location": account.ip_location,
        "positioning": account.positioning,
        "target_audience": account.target_audience,
        "tone_style": account.tone_style,
        "content_pillars": account.content_pillars or [],
        "title_guidelines": account.title_guidelines,
        "body_guidelines": account.body_guidelines,
        "conversion_goal": account.conversion_goal,
        "prohibited_terms": account.prohibited_terms,
        "profile_data": account.profile_data or {},
        "sample_notes": account.sample_notes or [],
        "analysis": account.analysis or {},
        "is_active": account.is_active,
        "last_analyzed_at": account.last_analyzed_at.isoformat() if account.last_analyzed_at else None,
        "created_at": account.created_at.isoformat() if account.created_at else None,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
    }


def _representative_notes(notes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates = [note for note in notes if not note["is_private"]]
    ranked = sorted(candidates, key=lambda note: note["liked_count"], reverse=True)
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for note in [*candidates[:4], *ranked]:
        if not note["id"] or note["id"] in seen:
            continue
        seen.add(note["id"])
        selected.append(note)
        if len(selected) >= MAX_PROFILE_NOTES:
            break
    return selected


def _contains_emoji(value: str) -> bool:
    return bool(re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", value))


def _percentage(count: int, total: int) -> int:
    return round(count * 100 / total) if total else 0


def build_basic_analysis(notes: list[dict[str, Any]], profile: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    usable = [note for note in notes if note.get("title") or note.get("content")]
    titles = [note["title"] for note in usable if note.get("title")]
    bodies = [note["content"] for note in usable if note.get("content")]
    topics = Counter(
        topic
        for note in usable
        for topic in note.get("tags") or []
        if 1 < len(topic) <= 20
    )
    hook_counts = {
        "问句": sum("?" in title or "？" in title for title in titles),
        "感叹": sum("!" in title or "！" in title for title in titles),
        "表情符号": sum(_contains_emoji(title) for title in titles),
        "数字信息": sum(bool(re.search(r"\d", title)) for title in titles),
        "人群点名": sum(bool(re.search(r"宝子|姐妹|车主|新手|打工人|宝宝|朋友们", title)) for title in titles),
        "紧迫或提醒": sum(bool(re.search(r"速看|避雷|别错过|紧急|求助|劝|注意|必看", title)) for title in titles),
    }
    hook_patterns = [
        {"name": name, "count": count, "ratio": _percentage(count, len(titles))}
        for name, count in hook_counts.items()
        if count
    ]
    paragraphs = [len([line for line in body.splitlines() if line.strip()]) for body in bodies]
    list_bodies = sum(bool(re.search(r"(?m)^\s*(?:[-•]|\d+[.、]|[📌✅🙋])", body)) for body in bodies)
    emoji_bodies = sum(_contains_emoji(body) for body in bodies)
    average_title_length = round(sum(len(title) for title in titles) / len(titles), 1) if titles else 0
    average_body_length = round(sum(len(body) for body in bodies) / len(bodies)) if bodies else 0
    average_paragraphs = round(sum(paragraphs) / len(paragraphs), 1) if paragraphs else 0
    top_topics = [{"name": name, "count": count} for name, count in topics.most_common(8)]
    top_notes = sorted(
        usable,
        key=lambda note: (
            note.get("liked_count", 0)
            + note.get("collected_count", 0)
            + note.get("comment_count", 0) * 2
            + note.get("share_count", 0) * 2
        ),
        reverse=True,
    )[:5]
    notes_with_likes = [note for note in usable if note.get("liked_count", 0) > 0]
    topic_names = "、".join(item["name"] for item in top_topics[:4])
    common_hooks = "、".join(item["name"] for item in sorted(hook_patterns, key=lambda item: item["count"], reverse=True)[:3])
    positioning_summary = (
        f"近期内容主要围绕{topic_names}。" if topic_names else "近期笔记主题较分散，建议由管理员补充明确的账号定位。"
    )
    style_parts = [f"标题平均约 {average_title_length:g} 字"] if average_title_length else []
    if common_hooks:
        style_parts.append(f"较常使用{common_hooks}")
    if average_body_length:
        style_parts.append(f"正文平均约 {average_body_length} 字、{average_paragraphs:g} 个段落")
    if bodies:
        style_parts.append(f"{_percentage(list_bodies, len(bodies))}% 的样本使用列表式结构")
        style_parts.append(f"{_percentage(emoji_bodies, len(bodies))}% 的样本在正文使用表情符号")
    return {
        "version": 1,
        "sample_count": len(usable),
        "body_sample_count": len(bodies),
        "average_title_length": average_title_length,
        "average_body_length": average_body_length,
        "average_paragraphs": average_paragraphs,
        "average_likes": round(sum(note.get("liked_count", 0) for note in usable) / len(usable), 1) if usable else 0,
        "average_collections": round(sum(note.get("collected_count", 0) for note in usable) / len(usable), 1) if usable else 0,
        "average_comments": round(sum(note.get("comment_count", 0) for note in usable) / len(usable), 1) if usable else 0,
        "average_shares": round(sum(note.get("share_count", 0) for note in usable) / len(usable), 1) if usable else 0,
        "average_save_like_ratio": round(
            sum(note.get("collected_count", 0) / note["liked_count"] for note in notes_with_likes)
            / len(notes_with_likes),
            3,
        ) if notes_with_likes else 0,
        "hook_patterns": hook_patterns,
        "top_topics": top_topics,
        "top_notes": [
            {
                "id": note["id"],
                "title": note["title"],
                "liked_count": note.get("liked_count", 0),
                "comment_count": note.get("comment_count", 0),
                "collected_count": note.get("collected_count", 0),
                "share_count": note.get("share_count", 0),
            }
            for note in top_notes
        ],
        "positioning_summary": positioning_summary,
        "style_summary": "；".join(style_parts) + ("。" if style_parts else "样本不足，暂时无法判断稳定风格。"),
        "profile_metrics": {
            "followers": profile.get("followers", 0),
            "following": profile.get("following", 0),
            "total_engagement": profile.get("total_engagement", 0),
            "note_count": (profile.get("public_metrics") or {}).get("note_count", 0),
        },
        "warnings": warnings,
    }


def _local_attachments(source_data: dict[str, Any]) -> list[dict[str, Any]]:
    values = source_data.get("local_attachments")
    if not isinstance(values, list):
        return []
    return [
        value for value in values
        if isinstance(value, dict)
        and isinstance(value.get("path"), str)
        and value["path"].startswith("/uploads/")
    ]


def _local_attachment_exists(attachment: dict[str, Any]) -> bool:
    relative_path = str(attachment.get("path") or "").removeprefix("/uploads/")
    if not relative_path:
        return False
    filepath = (UPLOAD_DIR / relative_path).resolve()
    try:
        filepath.relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        return False
    return filepath.is_file() and filepath.stat().st_size > 0


def _source_media_urls(source_data: dict[str, Any]) -> list[str]:
    image_urls = [
        str(url) for url in source_data.get("image_urls") or []
        if isinstance(url, str) and url.startswith(("http://", "https://"))
    ]
    video_url = source_data.get("video_url")
    if isinstance(video_url, str) and video_url.startswith(("http://", "https://")):
        image_urls.append(video_url)
    return image_urls


def _note_media_is_complete(note: CreatorAccountNote) -> bool:
    source_data = note.source_data if isinstance(note.source_data, dict) else {}
    if not source_data.get("media_archived_at"):
        return False
    attachments = _local_attachments(source_data)
    expected_urls = _source_media_urls(source_data)
    return source_data.get("media_source_urls") == expected_urls and len(attachments) == len(expected_urls) and all(
        _local_attachment_exists(attachment) for attachment in attachments
    )


def _merge_creator_note_source_data(
    current: dict[str, Any],
    incoming: dict[str, Any],
) -> dict[str, Any]:
    merged = {**current, **incoming}
    current_has_detail = bool(current.get("raw_detail") or current.get("detail_fetched_at"))
    incoming_has_detail = bool(incoming.get("raw_detail") or incoming.get("detail_fetched_at"))
    if current_has_detail and not incoming_has_detail:
        for key in ("image_urls", "video", "video_url", "raw_detail", "detail_fetched_at"):
            if key in current:
                merged[key] = current[key]
    return merged


def _restore_note_media_from_raw_detail(note: CreatorAccountNote) -> bool:
    source_data = dict(note.source_data or {})
    raw_detail = source_data.get("raw_detail")
    if not isinstance(raw_detail, dict):
        return False
    recovered = normalize_note(raw_detail, raw_source="detail").get("source_data")
    if not isinstance(recovered, dict):
        return False

    changed = False
    recovered_images = recovered.get("image_urls")
    current_images = source_data.get("image_urls")
    if (
        isinstance(recovered_images, list)
        and recovered_images
        and (
            not isinstance(current_images, list)
            or len(recovered_images) > len(current_images)
        )
    ):
        source_data["image_urls"] = recovered_images
        changed = True
    for key in ("video", "video_url"):
        if recovered.get(key) not in (None, "", [], {}) and recovered.get(key) != source_data.get(key):
            source_data[key] = recovered[key]
            changed = True
    if changed:
        note.source_data = source_data
    return changed


def creator_note_to_dict(note: CreatorAccountNote) -> dict[str, Any]:
    source_data = note.source_data if isinstance(note.source_data, dict) else {}
    image_urls = source_data.get("image_urls")
    if not isinstance(image_urls, list):
        image_urls = []
    attachments = _local_attachments(source_data)
    local_cover = next(
        (
            attachment.get("path") for attachment in attachments
            if str(attachment.get("type") or "").startswith("image/")
        ),
        "",
    )
    engagement_score = (
        note.liked_count + note.collected_count
        + note.comment_count * 2 + note.share_count * 2
    )
    return {
        "id": note.xhs_note_id,
        "title": note.title or "",
        "content": note.content or "",
        "cover_url": local_cover or note.cover_url or "",
        "source_url": note.source_url or "",
        "note_type": note.note_type or "normal",
        "is_private": bool(note.is_private),
        "liked_count": note.liked_count or 0,
        "collected_count": note.collected_count or 0,
        "comment_count": note.comment_count or 0,
        "share_count": note.share_count or 0,
        "engagement_score": engagement_score,
        "save_like_ratio": (
            round((note.collected_count or 0) / note.liked_count, 3)
            if note.liked_count else 0
        ),
        "tags": note.tags or [],
        "published_at": note.published_at.isoformat() if note.published_at else None,
        "first_seen_at": note.first_seen_at.isoformat() if note.first_seen_at else None,
        "last_seen_at": note.last_seen_at.isoformat() if note.last_seen_at else None,
        "image_count": len(image_urls),
        "has_video": bool(source_data.get("video_url") or source_data.get("video")),
        "detail_archived": bool(source_data.get("detail_fetched_at")),
        "media_archived": _note_media_is_complete(note),
        "attachments": attachments,
    }


def _history_archive_summary(account: CreatorAccount, notes: list[CreatorAccountNote]) -> dict[str, Any]:
    public_notes = [note for note in notes if not note.is_private]
    body_note_count = sum(bool((note.content or "").strip()) for note in public_notes)
    detail_note_count = sum(
        bool((note.source_data or {}).get("detail_fetched_at"))
        for note in public_notes
        if isinstance(note.source_data, dict)
    )
    media_note_count = sum(_note_media_is_complete(note) for note in public_notes)
    local_attachments = [
        attachment
        for note in public_notes
        for attachment in _local_attachments(
            note.source_data if isinstance(note.source_data, dict) else {}
        )
        if _local_attachment_exists(attachment)
    ]
    previous = (account.analysis or {}).get("history_archive")
    status = previous if isinstance(previous, dict) else {}
    return {
        **status,
        "total_notes": len(public_notes),
        "body_note_count": body_note_count,
        "missing_body_count": max(0, len(public_notes) - body_note_count),
        "detail_note_count": detail_note_count,
        "missing_detail_count": max(0, len(public_notes) - detail_note_count),
        "media_note_count": media_note_count,
        "missing_media_count": max(0, len(public_notes) - media_note_count),
        "local_image_count": sum(
            str(attachment.get("type") or "").startswith("image/")
            for attachment in local_attachments
        ),
        "local_video_count": sum(
            str(attachment.get("type") or "").startswith("video/")
            for attachment in local_attachments
        ),
    }


def _queue_owned_account_archive(
    account: CreatorAccount,
    db: Session,
    background_tasks: BackgroundTasks,
) -> None:
    notes = db.query(CreatorAccountNote).filter(
        CreatorAccountNote.creator_account_id == account.id,
    ).all()
    archive = _history_archive_summary(account, notes)
    archive.update({
        "status": "queued",
        "source": "cli",
        "stage": "listing",
        "pages_fetched": 0,
        "detail_completed": archive["detail_note_count"],
        "detail_failed": 0,
        "media_completed": archive["media_note_count"],
        "media_failed": 0,
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "last_progress_at": datetime.utcnow().isoformat(),
        "error": None,
    })
    account.analysis = {**(account.analysis or {}), "history_archive": archive}
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    background_tasks.add_task(_archive_owned_account, account.id)


def _archive_int_setting(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(value, maximum))


def _archive_float_setting(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(value, maximum))


def _creator_note_sync_payload(note: CreatorAccountNote) -> dict[str, Any]:
    return {
        "xhs_note_id": note.xhs_note_id,
        "title": note.title or "",
        "content": note.content or "",
        "cover_url": note.cover_url or "",
        "source_url": note.source_url or "",
        "note_type": note.note_type or "normal",
        "is_private": bool(note.is_private),
        "liked_count": note.liked_count or 0,
        "collected_count": note.collected_count or 0,
        "comment_count": note.comment_count or 0,
        "share_count": note.share_count or 0,
        "tags": note.tags or [],
        "source_data": dict(note.source_data or {}),
        "published_at": note.published_at,
    }


def _update_archive_progress(
    db: Session,
    account: CreatorAccount,
    **updates: Any,
) -> dict[str, Any]:
    db.flush()
    notes = db.query(CreatorAccountNote).filter(
        CreatorAccountNote.creator_account_id == account.id,
    ).all()
    archive = _history_archive_summary(account, notes)
    archive.update(updates)
    archive["last_progress_at"] = datetime.utcnow().isoformat()
    account.synced_note_count = archive["total_notes"]
    account.analysis = {
        **(account.analysis or {}),
        "synced_note_count": archive["total_notes"],
        "public_note_count": archive["total_notes"],
        "body_note_count": archive["body_note_count"],
        "history_archive": archive,
    }
    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    return archive


async def _fetch_archive_note_detail(
    note: dict[str, Any],
    retries: int,
) -> tuple[dict[str, Any] | None, str | None]:
    last_error = "帖子详情读取失败"
    for attempt in range(1, retries + 1):
        try:
            return await fetch_cli_note_detail(note), None
        except Exception as error:
            last_error = str(getattr(error, "detail", error))[:1000]
            if attempt < retries:
                await asyncio.sleep(min(1.5 * attempt, 5.0))
    return None, last_error


async def _fetch_archive_note_media(
    account_id: str,
    note: dict[str, Any],
    retries: int,
) -> tuple[dict[str, Any], list[str]]:
    source_data = dict(note.get("source_data") or {})
    media_urls = _source_media_urls(source_data)
    video_url = source_data.get("video_url")
    if not isinstance(video_url, str) or video_url not in media_urls:
        video_url = None
    image_urls = media_urls[:-1] if video_url else media_urls
    filename_prefix = f"creator-{account_id[:8]}-{note['xhs_note_id']}"
    last_errors: list[str] = []

    for attempt in range(1, retries + 1):
        attachments, image_errors = await download_images(
            image_urls,
            filename_prefix=filename_prefix,
        )
        video_attachment, video_error = await download_video(
            video_url,
            filename_prefix=filename_prefix,
        )
        if video_attachment:
            attachments.append(video_attachment)
        errors = [*image_errors, *([video_error] if video_error else [])]
        expected_count = len(image_urls) + bool(video_url)
        complete = len(attachments) == expected_count and not errors
        source_data["local_attachments"] = attachments
        source_data["media_source_urls"] = media_urls
        source_data["media_attempted_at"] = datetime.utcnow().isoformat()
        source_data["media_errors"] = errors
        if complete:
            source_data["media_archived_at"] = datetime.utcnow().isoformat()
            return source_data, []
        source_data.pop("media_archived_at", None)
        last_errors = errors or ["本地媒体数量与帖子详情不一致"]
        if attempt < retries:
            await asyncio.sleep(min(1.5 * attempt, 5.0))

    return source_data, last_errors


async def _archive_owned_account(account_id: str, *, resume: bool = False) -> None:
    with SessionLocal() as db:
        account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
        if not account:
            return
        previous_archive = (account.analysis or {}).get("history_archive")
        resume_details = bool(
            resume
            and isinstance(previous_archive, dict)
            and previous_archive.get("stage") in {"details", "media"}
            and previous_archive.get("has_more") is False
            and previous_archive.get("total_notes")
        )
        archive = _update_archive_progress(
            db,
            account,
            status="running",
            source="cli",
            stage="details" if resume_details else "listing",
            completed_at=None,
            error=None,
        )
        try:
            async def persist_page(
                page_notes: list[dict[str, Any]],
                progress: dict[str, Any],
            ) -> None:
                _upsert_account_notes(db, account, page_notes, datetime.utcnow())
                _update_archive_progress(
                    db,
                    account,
                    status="running",
                    source="cli",
                    stage="listing",
                    pages_fetched=progress["pages_fetched"],
                    has_more=progress["has_more"],
                    error=None,
                )

            if resume_details:
                synced = account
            else:
                synced = await sync_account(
                    account,
                    db,
                    "cli",
                    HISTORY_ARCHIVE_MAX_PAGES,
                    detail_notes=0,
                    page_callback=persist_page,
                )
            note_rows = db.query(CreatorAccountNote).filter(
                CreatorAccountNote.creator_account_id == synced.id,
                CreatorAccountNote.is_private == False,
            ).order_by(
                CreatorAccountNote.published_at.desc(),
                CreatorAccountNote.first_seen_at.desc(),
            ).all()
            pending = [
                _creator_note_sync_payload(note)
                for note in note_rows
                if not isinstance(note.source_data, dict)
                or not note.source_data.get("detail_fetched_at")
            ]
            detail_total = len(note_rows)
            detail_completed = detail_total - len(pending)
            _update_archive_progress(
                db,
                synced,
                status="running",
                source="cli",
                stage="details",
                pages_fetched=(synced.analysis or {}).get("pages_fetched", 0),
                detail_total=detail_total,
                detail_completed=detail_completed,
                detail_failed=0,
                error=None,
            )

            concurrency = _archive_int_setting("XHS_ARCHIVE_DETAIL_CONCURRENCY", 2, 1, 5)
            retries = _archive_int_setting("XHS_ARCHIVE_DETAIL_RETRIES", 2, 1, 4)
            batch_delay = _archive_float_setting(
                "XHS_ARCHIVE_DETAIL_BATCH_DELAY_SECONDS", 0.75, 0.2, 10.0,
            )
            detail_failed = 0
            detail_errors: list[str] = []
            for offset in range(0, len(pending), concurrency):
                batch = pending[offset:offset + concurrency]
                results = await asyncio.gather(*(
                    _fetch_archive_note_detail(note, retries)
                    for note in batch
                ))
                now = datetime.utcnow()
                for candidate, (detail, error) in zip(batch, results):
                    if detail:
                        _upsert_account_notes(db, synced, [detail], now)
                        detail_completed += 1
                        continue
                    detail_failed += 1
                    if error and len(detail_errors) < 20:
                        detail_errors.append(f"{candidate['xhs_note_id']}: {error}")
                    row = db.query(CreatorAccountNote).filter(
                        CreatorAccountNote.creator_account_id == synced.id,
                        CreatorAccountNote.xhs_note_id == candidate["xhs_note_id"],
                    ).first()
                    if row:
                        source_data = dict(row.source_data or {})
                        source_data["detail_error"] = error
                        source_data["detail_attempted_at"] = now.isoformat()
                        row.source_data = source_data
                        row.updated_at = now
                _update_archive_progress(
                    db,
                    synced,
                    status="running",
                    source="cli",
                    stage="details",
                    detail_total=detail_total,
                    detail_completed=detail_completed,
                    detail_failed=detail_failed,
                    detail_errors=detail_errors,
                    error=None,
                )
                if offset + concurrency < len(pending):
                    await asyncio.sleep(batch_delay)

            media_rows = db.query(CreatorAccountNote).filter(
                CreatorAccountNote.creator_account_id == synced.id,
                CreatorAccountNote.is_private == False,
            ).order_by(
                CreatorAccountNote.published_at.desc(),
                CreatorAccountNote.first_seen_at.desc(),
            ).all()
            for media_row in media_rows:
                _restore_note_media_from_raw_detail(media_row)
            media_pending = [
                _creator_note_sync_payload(note)
                for note in media_rows
                if isinstance(note.source_data, dict)
                and note.source_data.get("detail_fetched_at")
                and not _note_media_is_complete(note)
            ]
            media_total = len(media_rows)
            media_completed = sum(_note_media_is_complete(note) for note in media_rows)
            _update_archive_progress(
                db,
                synced,
                status="running",
                source="cli",
                stage="media",
                media_total=media_total,
                media_completed=media_completed,
                media_failed=0,
                error=None,
            )

            media_concurrency = _archive_int_setting("XHS_ARCHIVE_MEDIA_CONCURRENCY", 4, 1, 4)
            media_retries = _archive_int_setting("XHS_ARCHIVE_MEDIA_RETRIES", 2, 1, 4)
            media_batch_delay = _archive_float_setting(
                "XHS_ARCHIVE_MEDIA_BATCH_DELAY_SECONDS", 0.2, 0.1, 10.0,
            )
            media_failed = 0
            media_errors: list[str] = []
            for offset in range(0, len(media_pending), media_concurrency):
                batch = media_pending[offset:offset + media_concurrency]
                results = await asyncio.gather(*(
                    _fetch_archive_note_media(synced.id, note, media_retries)
                    for note in batch
                ))
                now = datetime.utcnow()
                for candidate, (source_data, errors) in zip(batch, results):
                    row = db.query(CreatorAccountNote).filter(
                        CreatorAccountNote.creator_account_id == synced.id,
                        CreatorAccountNote.xhs_note_id == candidate["xhs_note_id"],
                    ).first()
                    if row:
                        row.source_data = source_data
                        row.updated_at = now
                    if errors:
                        media_failed += 1
                        if len(media_errors) < 20:
                            media_errors.append(
                                f"{candidate['xhs_note_id']}: {'；'.join(errors)}"
                            )
                    else:
                        media_completed += 1
                _update_archive_progress(
                    db,
                    synced,
                    status="running",
                    source="cli",
                    stage="media",
                    media_total=media_total,
                    media_completed=media_completed,
                    media_failed=media_failed,
                    media_errors=media_errors,
                    error=None,
                )
                if offset + media_concurrency < len(media_pending):
                    await asyncio.sleep(media_batch_delay)

            notes = db.query(CreatorAccountNote).filter(
                CreatorAccountNote.creator_account_id == synced.id,
            ).order_by(
                CreatorAccountNote.published_at.desc(),
                CreatorAccountNote.first_seen_at.desc(),
            ).all()
            public_notes = [creator_note_to_dict(note) for note in notes if not note.is_private]
            archive = _history_archive_summary(synced, notes)
            page_limit_reached = bool((synced.analysis or {}).get("page_limit_reached"))
            archive.update({
                "status": (
                    "complete"
                    if not page_limit_reached
                    and archive["missing_detail_count"] == 0
                    and archive["missing_media_count"] == 0
                    else "partial"
                ),
                "source": "cli",
                "stage": "complete",
                "pages_fetched": (synced.analysis or {}).get("pages_fetched", 0),
                "has_more": bool((synced.analysis or {}).get("has_more")),
                "page_limit_reached": page_limit_reached,
                "detail_total": len(public_notes),
                "detail_completed": archive["detail_note_count"],
                "detail_failed": archive["missing_detail_count"],
                "detail_errors": detail_errors,
                "media_total": len(public_notes),
                "media_completed": archive["media_note_count"],
                "media_failed": archive["missing_media_count"],
                "media_errors": media_errors,
                "completed_at": datetime.utcnow().isoformat(),
                "last_progress_at": datetime.utcnow().isoformat(),
                "error": None,
            })
            previous_analysis = synced.analysis or {}
            refreshed_analysis = {
                **previous_analysis,
                **build_basic_analysis(
                    public_notes,
                    synced.profile_data or {},
                    previous_analysis.get("warnings") or [],
                ),
                "synced_note_count": len(notes),
                "public_note_count": len(public_notes),
                "body_note_count": archive["body_note_count"],
                "history_archive": archive,
            }
            synced.sample_notes = _representative_notes(public_notes)
            synced.analysis = refreshed_analysis
            synced.synced_note_count = len(notes)
            synced.last_analyzed_at = datetime.utcnow()
            synced.updated_at = datetime.utcnow()
            db.commit()
        except Exception as error:
            db.rollback()
            current = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
            if not current:
                return
            notes = db.query(CreatorAccountNote).filter(
                CreatorAccountNote.creator_account_id == current.id,
            ).all()
            archive = _history_archive_summary(current, notes)
            archive.update({
                "status": "failed",
                "completed_at": datetime.utcnow().isoformat(),
                "last_progress_at": datetime.utcnow().isoformat(),
                "error": str(getattr(error, "detail", error))[:2000],
            })
            current.analysis = {**(current.analysis or {}), "history_archive": archive}
            current.updated_at = datetime.utcnow()
            db.commit()


async def resume_incomplete_owned_account_archives() -> None:
    with SessionLocal() as db:
        accounts = db.query(CreatorAccount).filter(
            CreatorAccount.account_kind == "owned",
            CreatorAccount.is_active == True,
        ).all()
        account_ids = [
            account.id
            for account in accounts
            if isinstance((account.analysis or {}).get("history_archive"), dict)
            and (account.analysis or {})["history_archive"].get("status") in {"queued", "running"}
        ]
    if account_ids:
        await asyncio.gather(*(
            _archive_owned_account(account_id, resume=True)
            for account_id in account_ids
        ))


def _upsert_account_notes(
    db: Session,
    account: CreatorAccount,
    notes: list[dict[str, Any]],
    now: datetime,
) -> int:
    note_ids = [note.get("xhs_note_id") for note in notes if note.get("xhs_note_id")]
    existing = {
        row.xhs_note_id: row
        for row in db.query(CreatorAccountNote).filter(
            CreatorAccountNote.creator_account_id == account.id,
            CreatorAccountNote.xhs_note_id.in_(note_ids),
        ).all()
    } if note_ids else {}

    fields = (
        "title", "content", "cover_url", "source_url", "note_type", "is_private",
        "liked_count", "collected_count", "comment_count", "share_count", "tags",
        "source_data", "published_at",
    )
    metric_fields = {"liked_count", "collected_count", "comment_count", "share_count"}
    for note_data in notes:
        note_id = str(note_data.get("xhs_note_id") or "").strip()
        if not note_id:
            continue
        row = existing.get(note_id)
        if row is None:
            row = CreatorAccountNote(
                creator_account_id=account.id,
                xhs_note_id=note_id,
                first_seen_at=now,
            )
            db.add(row)
            existing[note_id] = row
        for field in fields:
            value = note_data.get(field)
            current = getattr(row, field, None)
            if field == "source_data":
                value = _merge_creator_note_source_data(
                    current if isinstance(current, dict) else {},
                    value if isinstance(value, dict) else {},
                )
            elif field in metric_fields:
                value = max(int(current or 0), int(value or 0))
            elif field == "is_private":
                value = bool(current or value)
            elif value in (None, "", [], {}) and current not in (None, "", [], {}):
                continue
            setattr(row, field, value)
        row.last_seen_at = now
        row.updated_at = now
    db.flush()
    return len(note_ids)


async def sync_account(
    account: CreatorAccount,
    db: Session,
    requested_source: Optional[DataSource],
    max_pages: int,
    monitor_run_id: Optional[str] = None,
    detail_notes: Optional[int] = None,
    preferred_source: Optional[Literal["cli", "tikhub"]] = None,
    published_since: Optional[datetime] = None,
    page_callback: Optional[ArchivePageCallback] = None,
) -> CreatorAccount:
    source = requested_source or account.data_source or "auto"
    identifier = account.xhs_user_id
    resolved_user_id = (account.profile_data or {}).get("user_id")
    if source in {"auto", "tikhub"} and isinstance(resolved_user_id, str):
        if re.fullmatch(r"[0-9a-fA-F]{24}", resolved_user_id):
            identifier = resolved_user_id
    if page_callback and source == "cli":
        result = await sync_with_cli(
            identifier,
            max_pages,
            detail_notes=detail_notes,
            published_since=published_since,
            page_callback=page_callback,
        )
    else:
        result = await sync_public_account(
            identifier,
            source,
            max_pages,
            detail_notes=detail_notes,
            preferred_source=preferred_source,
            published_since=published_since,
        )
    profile = result["profile"]
    warnings = result.get("warnings") or []
    now = datetime.utcnow()
    _upsert_account_notes(db, account, result.get("notes") or [], now)
    if monitor_run_id:
        for note in result.get("notes") or []:
            note_id = str(note.get("xhs_note_id") or "").strip()
            if not note_id:
                continue
            db.add(CreatorAccountNoteSnapshot(
                creator_account_id=account.id,
                monitor_run_id=monitor_run_id,
                xhs_note_id=note_id,
                liked_count=int(note.get("liked_count") or 0),
                collected_count=int(note.get("collected_count") or 0),
                comment_count=int(note.get("comment_count") or 0),
                share_count=int(note.get("share_count") or 0),
                captured_at=now,
            ))

    note_rows = (
        db.query(CreatorAccountNote)
        .filter(CreatorAccountNote.creator_account_id == account.id)
        .order_by(CreatorAccountNote.published_at.desc(), CreatorAccountNote.first_seen_at.desc())
        .limit(2000)
        .all()
    )
    public_notes = [creator_note_to_dict(note) for note in note_rows if not note.is_private]
    representative = _representative_notes(public_notes)
    previous_analysis = account.analysis or {}
    analysis = build_basic_analysis(public_notes, profile, warnings)
    analysis.update({
        "data_source": result["source"],
        "pages_fetched": result.get("pages_fetched", 0),
        "synced_note_count": len(note_rows),
        "public_note_count": len(public_notes),
        "last_sync_new_or_updated": len(result.get("notes") or []),
        "data_scope": "public",
        "has_more": bool(result.get("has_more")),
        "page_limit_reached": bool(result.get("page_limit_reached")),
        "window_covered": bool(result.get("window_covered")),
        "body_note_count": sum(bool((note.get("content") or "").strip()) for note in public_notes),
    })
    for key in ("history_archive", "monitoring_7d"):
        if key in previous_analysis:
            analysis[key] = previous_analysis[key]

    account.red_id = profile.get("red_id") or account.red_id
    account.nickname = profile.get("nickname") or account.nickname
    account.avatar_url = profile.get("avatar_url") or account.avatar_url
    account.bio = profile.get("bio") or account.bio
    account.ip_location = profile.get("ip_location") or account.ip_location
    resolved_user_id = profile.get("user_id") or account.xhs_user_id
    account.profile_url = f"https://www.xiaohongshu.com/user/profile/{resolved_user_id}"
    account.profile_data = profile
    account.sample_notes = representative
    account.analysis = analysis
    account.last_sync_source = result["source"]
    account.last_sync_status = "success"
    account.last_sync_error = None
    account.synced_note_count = len(note_rows)
    account.last_analyzed_at = now
    account.updated_at = now
    db.add(CreatorAccountSnapshot(
        creator_account_id=account.id,
        data_source=result["source"],
        followers=profile.get("followers", 0),
        following=profile.get("following", 0),
        total_engagement=profile.get("total_engagement", 0),
        note_count=len(note_rows),
        fetched_at=now,
    ))
    db.commit()
    db.refresh(account)
    return account


@router.get("")
async def list_creator_accounts(
    active_only: bool = False,
    account_kind: Optional[AccountKind] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CreatorAccount)
    if account_kind:
        query = query.filter(CreatorAccount.account_kind == account_kind)
    if active_only or user.role not in {"admin", "manager"}:
        query = query.filter(CreatorAccount.is_active == True)
    accounts = query.order_by(CreatorAccount.is_active.desc(), CreatorAccount.name.asc()).all()
    return [creator_account_to_dict(account) for account in accounts]


@router.post("")
async def create_creator_account(
    payload: CreatorAccountCreateRequest,
    background_tasks: BackgroundTasks,
    admin: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    if db.query(CreatorAccount).filter(CreatorAccount.xhs_user_id == payload.xhs_user_id).first():
        raise HTTPException(status_code=409, detail="这个小红书账号已经配置过了")
    account = CreatorAccount(
        name=payload.name.strip(),
        xhs_user_id=payload.xhs_user_id,
        account_kind=payload.account_kind,
        data_source=payload.data_source,
        profile_url=f"https://www.xiaohongshu.com/user/profile/{payload.xhs_user_id}",
        positioning=_clean_text(payload.positioning),
        target_audience=_clean_text(payload.target_audience),
        tone_style=_clean_text(payload.tone_style),
        content_pillars=payload.content_pillars,
        title_guidelines=_clean_text(payload.title_guidelines),
        body_guidelines=_clean_text(payload.body_guidelines),
        conversion_goal=_clean_text(payload.conversion_goal),
        prohibited_terms=_clean_text(payload.prohibited_terms),
        is_active=payload.is_active,
        created_by_user_id=admin.id,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    if account.account_kind == "owned":
        _queue_owned_account_archive(account, db, background_tasks)
    return creator_account_to_dict(account)


@router.put("/{account_id}")
async def update_creator_account(
    account_id: str,
    payload: CreatorAccountUpdateRequest,
    _: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="创作账号不存在")
    updates = payload.model_dump(exclude_unset=True)
    if "xhs_user_id" in updates and updates["xhs_user_id"] != account.xhs_user_id:
        existing = db.query(CreatorAccount).filter(
            CreatorAccount.xhs_user_id == updates["xhs_user_id"],
            CreatorAccount.id != account.id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail="这个小红书账号已经配置过了")
        account.profile_url = f"https://www.xiaohongshu.com/user/profile/{updates['xhs_user_id']}"
        account.profile_data = {}
        account.sample_notes = []
        account.analysis = {}
        account.last_analyzed_at = None
        account.last_sync_source = None
        account.last_sync_status = "never"
        account.last_sync_error = None
        account.synced_note_count = 0
        db.query(CreatorAccountNote).filter(
            CreatorAccountNote.creator_account_id == account.id
        ).delete(synchronize_session=False)
        db.query(CreatorAccountSnapshot).filter(
            CreatorAccountSnapshot.creator_account_id == account.id
        ).delete(synchronize_session=False)

    text_fields = {
        "positioning", "target_audience", "tone_style", "title_guidelines",
        "body_guidelines", "conversion_goal", "prohibited_terms",
    }
    for field, value in updates.items():
        if field == "name":
            value = value.strip()
        elif field in text_fields:
            value = _clean_text(value)
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return creator_account_to_dict(account)


@router.post("/{account_id}/analyze")
async def analyze_creator_account(
    account_id: str,
    source: Optional[DataSource] = Query(default=None),
    max_pages: int = Query(default=10, ge=1, le=100),
    _: User = Depends(require_account_query_operator),
    db: Session = Depends(get_db),
):
    account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="创作账号不存在")
    try:
        synced = await sync_account(account, db, source, max_pages)
    except HTTPException as error:
        account.last_sync_status = "failed"
        account.last_sync_error = str(error.detail)[:2000]
        account.updated_at = datetime.utcnow()
        db.commit()
        raise
    return creator_account_to_dict(synced)


@router.post("/{account_id}/archive")
async def archive_creator_account(
    account_id: str,
    background_tasks: BackgroundTasks,
    _: User = Depends(require_account_query_operator),
    db: Session = Depends(get_db),
):
    account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="创作账号不存在")
    if account.account_kind != "owned":
        raise HTTPException(status_code=422, detail="只有自有账号可以归档历史帖子")

    existing = (account.analysis or {}).get("history_archive")
    if isinstance(existing, dict) and existing.get("status") in {"queued", "running"}:
        last_progress = existing.get("last_progress_at") or existing.get("started_at")
        try:
            still_active = (
                datetime.fromisoformat(str(last_progress))
                >= datetime.utcnow() - timedelta(minutes=10)
            )
        except (TypeError, ValueError):
            still_active = False
        if still_active:
            return creator_account_to_dict(account)

    _queue_owned_account_archive(account, db, background_tasks)
    return creator_account_to_dict(account)


@router.get("/status/public-data")
async def get_public_data_status(_: User = Depends(get_current_user)):
    from backend.account_monitor import monitor_schedule_status

    status = await public_source_status()
    status["daily_monitor"] = monitor_schedule_status()
    return status


@router.post("/discover")
async def discover_creator_accounts(
    payload: CreatorDiscoveryRequest,
    _: User = Depends(require_account_query_operator),
):
    return await discover_public_accounts(
        payload.keywords,
        payload.source,
        payload.pages_per_keyword,
    )


@router.get("/{account_id}/notes")
async def list_creator_account_notes(
    account_id: str,
    sort: Literal["published_at", "engagement", "likes", "collections", "comments"] = "engagement",
    order: Literal["asc", "desc"] = "desc",
    q: Optional[str] = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=500),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="创作账号不存在")
    query = db.query(CreatorAccountNote).filter(
        CreatorAccountNote.creator_account_id == account_id,
        CreatorAccountNote.is_private == False,
    )
    if q and q.strip():
        keyword = f"%{q.strip()}%"
        query = query.filter(
            CreatorAccountNote.title.ilike(keyword)
            | CreatorAccountNote.content.ilike(keyword)
        )
    total = query.count()
    body_count = query.filter(CreatorAccountNote.content.isnot(None)).filter(
        CreatorAccountNote.content != "",
    ).count()
    if sort == "engagement":
        expression = (
            CreatorAccountNote.liked_count
            + CreatorAccountNote.collected_count
            + CreatorAccountNote.comment_count * 2
            + CreatorAccountNote.share_count * 2
        )
    else:
        expression = {
            "published_at": CreatorAccountNote.published_at,
            "likes": CreatorAccountNote.liked_count,
            "collections": CreatorAccountNote.collected_count,
            "comments": CreatorAccountNote.comment_count,
        }[sort]
    query = query.order_by(
        expression.asc() if order == "asc" else expression.desc(),
        CreatorAccountNote.published_at.desc(),
    )
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [creator_note_to_dict(row) for row in rows],
        "total": total,
        "body_count": body_count,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{account_id}/notes/{note_id}")
async def get_creator_account_note(
    account_id: str,
    note_id: str,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    note = db.query(CreatorAccountNote).filter(
        CreatorAccountNote.creator_account_id == account_id,
        CreatorAccountNote.xhs_note_id == note_id,
        CreatorAccountNote.is_private == False,
    ).first()
    if not note:
        raise HTTPException(status_code=404, detail="账号帖子不存在或不可用")
    return creator_note_to_dict(note)


@router.get("/{account_id}/snapshots")
async def list_creator_account_snapshots(
    account_id: str,
    limit: int = Query(default=30, ge=1, le=180),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(CreatorAccountSnapshot)
        .filter(CreatorAccountSnapshot.creator_account_id == account_id)
        .order_by(CreatorAccountSnapshot.fetched_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "data_source": row.data_source,
            "followers": row.followers,
            "following": row.following,
            "total_engagement": row.total_engagement,
            "note_count": row.note_count,
            "fetched_at": row.fetched_at.isoformat(),
        }
        for row in rows
    ]
