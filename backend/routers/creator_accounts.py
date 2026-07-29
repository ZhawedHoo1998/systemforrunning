import re
from collections import Counter
from datetime import datetime
from typing import Any, Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from backend.auth import get_current_user, require_account_query_operator, require_manager
from backend.database import get_db
from backend.models import (
    CreatorAccount,
    CreatorAccountNote,
    CreatorAccountNoteSnapshot,
    CreatorAccountSnapshot,
    User,
)
from backend.xhs_public_data import (
    discover_public_accounts,
    public_source_status,
    sync_public_account,
)


router = APIRouter(prefix="/api/creator-accounts", tags=["creator-accounts"])

MAX_PROFILE_NOTES = 12
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


def creator_note_to_dict(note: CreatorAccountNote) -> dict[str, Any]:
    engagement_score = (
        note.liked_count + note.collected_count
        + note.comment_count * 2 + note.share_count * 2
    )
    return {
        "id": note.xhs_note_id,
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
        "engagement_score": engagement_score,
        "save_like_ratio": (
            round((note.collected_count or 0) / note.liked_count, 3)
            if note.liked_count else 0
        ),
        "tags": note.tags or [],
        "published_at": note.published_at.isoformat() if note.published_at else None,
        "first_seen_at": note.first_seen_at.isoformat() if note.first_seen_at else None,
        "last_seen_at": note.last_seen_at.isoformat() if note.last_seen_at else None,
    }


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
            if field in {"content", "cover_url", "source_url"} and not value and getattr(row, field, None):
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
) -> CreatorAccount:
    source = requested_source or account.data_source or "auto"
    identifier = account.xhs_user_id
    resolved_user_id = (account.profile_data or {}).get("user_id")
    if source in {"auto", "tikhub"} and isinstance(resolved_user_id, str):
        if re.fullmatch(r"[0-9a-fA-F]{24}", resolved_user_id):
            identifier = resolved_user_id
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
    })

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
    max_pages: int = Query(default=10, ge=1, le=30),
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
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
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
    total = query.count()
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
        "page": page,
        "page_size": page_size,
    }


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
