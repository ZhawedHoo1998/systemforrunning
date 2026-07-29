import re
from collections import Counter
from datetime import datetime
from typing import Any, Optional
from urllib.parse import quote, urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from backend.auth import get_current_user, require_manager
from backend.database import get_db
from backend.models import CreatorAccount, User
from backend.routers.xiaohongshu import run_xhs_command


router = APIRouter(prefix="/api/creator-accounts", tags=["creator-accounts"])

MAX_PROFILE_NOTES = 8


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


def creator_account_to_dict(account: CreatorAccount) -> dict[str, Any]:
    return {
        "id": account.id,
        "name": account.name,
        "xhs_user_id": account.xhs_user_id,
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


def _first_image_url(cover: Any) -> str:
    if not isinstance(cover, dict):
        return ""
    for key in ("url_default", "url_pre", "url"):
        value = cover.get(key)
        if isinstance(value, str) and value:
            return value.replace("http://", "https://", 1)
    for item in cover.get("info_list") or []:
        if isinstance(item, dict) and isinstance(item.get("url"), str) and item["url"]:
            return item["url"].replace("http://", "https://", 1)
    return ""


def _profile_summary(profile_data: dict[str, Any], resolved_user_id: str) -> dict[str, Any]:
    basic = profile_data.get("basic_info") if isinstance(profile_data.get("basic_info"), dict) else {}
    interactions = profile_data.get("interactions") if isinstance(profile_data.get("interactions"), list) else []
    interaction_counts = {
        str(item.get("type") or item.get("name") or ""): _number(item.get("count"))
        for item in interactions
        if isinstance(item, dict)
    }
    return {
        "user_id": resolved_user_id,
        "nickname": str(basic.get("nickname") or "").strip(),
        "red_id": str(basic.get("red_id") or "").strip(),
        "bio": str(basic.get("desc") or "").strip(),
        "ip_location": str(basic.get("ip_location") or "").strip(),
        "avatar_url": str(basic.get("imageb") or basic.get("images") or "").strip(),
        "followers": interaction_counts.get("fans", 0),
        "following": interaction_counts.get("follows", 0),
        "total_engagement": interaction_counts.get("interaction", 0),
    }


async def _resolve_xhs_user_id(value: str) -> str:
    if re.fullmatch(r"[0-9a-fA-F]{24}", value):
        return value

    search_data = await run_xhs_command("search-user", value, timeout_seconds=45)
    results = search_data.get("user_info_dtos")
    if not isinstance(results, list):
        results = []
    candidates = []
    for result in results:
        if not isinstance(result, dict):
            continue
        user = result.get("user_base_dto")
        if not isinstance(user, dict):
            continue
        user_id = str(user.get("user_id") or "").strip()
        red_id = str(user.get("red_id") or "").strip()
        nickname = str(user.get("user_nickname") or "").strip()
        if user_id:
            candidates.append({"user_id": user_id, "red_id": red_id, "nickname": nickname})

    exact = [
        candidate for candidate in candidates
        if candidate["red_id"] == value or candidate["nickname"].casefold() == value.casefold()
    ]
    if len(exact) == 1:
        return exact[0]["user_id"]
    if not exact:
        raise HTTPException(
            status_code=422,
            detail="没有找到对应的小红书账号，请填写准确的小红书号或账号主页链接",
        )
    raise HTTPException(
        status_code=422,
        detail="搜索到多个同名账号，请改用账号主页链接",
    )


def _note_card(note_data: dict[str, Any]) -> dict[str, Any]:
    items = note_data.get("items") if isinstance(note_data.get("items"), list) else []
    for item in items:
        if not isinstance(item, dict):
            continue
        card = item.get("note_card")
        if isinstance(card, dict):
            return card
    return {}


def _note_from_listing(item: dict[str, Any]) -> dict[str, Any]:
    interactions = item.get("interact_info") if isinstance(item.get("interact_info"), dict) else {}
    corner = item.get("corner") if isinstance(item.get("corner"), dict) else {}
    return {
        "id": str(item.get("note_id") or item.get("id") or "").strip(),
        "title": str(item.get("display_title") or item.get("title") or "").strip(),
        "content": "",
        "cover_url": _first_image_url(item.get("cover")),
        "note_type": str(item.get("type") or "normal"),
        "is_private": str(corner.get("type") or "").lower() == "private",
        "liked_count": _number(interactions.get("liked_count")),
        "comment_count": _number(interactions.get("comment_count")),
        "collected_count": _number(interactions.get("collected_count")),
        "share_count": _number(interactions.get("share_count")),
        "tags": [],
        "published_at": None,
        "xsec_token": str(item.get("xsec_token") or "").strip(),
    }


def _merge_note_detail(note: dict[str, Any], card: dict[str, Any]) -> dict[str, Any]:
    interactions = card.get("interact_info") if isinstance(card.get("interact_info"), dict) else {}
    timestamp = card.get("time")
    published_at = None
    if isinstance(timestamp, (int, float)) and timestamp > 0:
        try:
            published_at = datetime.utcfromtimestamp(timestamp / 1000).isoformat()
        except (OverflowError, OSError, ValueError):
            published_at = None
    tags = [
        str(tag.get("name") or "").strip()
        for tag in card.get("tag_list") or []
        if isinstance(tag, dict) and str(tag.get("name") or "").strip()
    ]
    return {
        **note,
        "title": str(card.get("title") or note["title"]).strip(),
        "content": str(card.get("desc") or "").strip()[:12000],
        "cover_url": _first_image_url((card.get("image_list") or [{}])[0]) or note["cover_url"],
        "note_type": str(card.get("type") or note["note_type"]),
        "liked_count": _number(interactions.get("liked_count")) or note["liked_count"],
        "comment_count": _number(interactions.get("comment_count")),
        "collected_count": _number(interactions.get("collected_count")),
        "share_count": _number(interactions.get("share_count")),
        "tags": list(dict.fromkeys(tags)),
        "published_at": published_at,
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
        key=lambda note: note.get("liked_count", 0) + note.get("comment_count", 0) * 2 + note.get("collected_count", 0),
        reverse=True,
    )[:5]
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
        "average_comments": round(sum(note.get("comment_count", 0) for note in usable) / len(usable), 1) if usable else 0,
        "hook_patterns": hook_patterns,
        "top_topics": top_topics,
        "top_notes": [
            {
                "id": note["id"],
                "title": note["title"],
                "liked_count": note.get("liked_count", 0),
                "comment_count": note.get("comment_count", 0),
                "collected_count": note.get("collected_count", 0),
            }
            for note in top_notes
        ],
        "positioning_summary": positioning_summary,
        "style_summary": "；".join(style_parts) + ("。" if style_parts else "样本不足，暂时无法判断稳定风格。"),
        "profile_metrics": {
            "followers": profile.get("followers", 0),
            "following": profile.get("following", 0),
            "total_engagement": profile.get("total_engagement", 0),
        },
        "warnings": warnings,
    }


async def analyze_account(account: CreatorAccount) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    resolved_user_id = await _resolve_xhs_user_id(account.xhs_user_id)
    profile_data = await run_xhs_command("user", resolved_user_id, timeout_seconds=45)
    posts_data = await run_xhs_command("user-posts", resolved_user_id, timeout_seconds=60)
    profile = _profile_summary(profile_data, resolved_user_id)
    raw_notes = posts_data.get("notes") if isinstance(posts_data.get("notes"), list) else []
    listed_notes = [_note_from_listing(item) for item in raw_notes if isinstance(item, dict)]
    selected_notes = _representative_notes(listed_notes)
    detailed_notes: list[dict[str, Any]] = []
    warnings: list[str] = []

    for note in selected_notes:
        target = note["id"]
        if note["xsec_token"]:
            target = (
                f"https://www.xiaohongshu.com/explore/{note['id']}"
                f"?xsec_token={quote(note['xsec_token'], safe='')}&xsec_source=pc_user"
            )
        try:
            note_data = await run_xhs_command("read", target, timeout_seconds=45)
            detailed_notes.append(_merge_note_detail(note, _note_card(note_data)))
        except HTTPException:
            detailed_notes.append(note)
            warnings.append(f"《{note['title'] or note['id']}》正文读取失败，仅分析标题和互动数据")

    analysis = build_basic_analysis(detailed_notes, profile, warnings)
    stored_profile = {
        **profile,
        "tags": profile_data.get("tags") if isinstance(profile_data.get("tags"), list) else [],
    }
    stored_notes = [{key: value for key, value in note.items() if key != "xsec_token"} for note in detailed_notes]
    return stored_profile, stored_notes, analysis


@router.get("")
async def list_creator_accounts(
    active_only: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CreatorAccount)
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
    _: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="创作账号不存在")
    profile, notes, analysis = await analyze_account(account)
    account.red_id = profile.get("red_id") or account.red_id
    account.nickname = profile.get("nickname") or account.nickname
    account.avatar_url = profile.get("avatar_url") or account.avatar_url
    account.bio = profile.get("bio") or account.bio
    account.ip_location = profile.get("ip_location") or account.ip_location
    account.profile_url = f"https://www.xiaohongshu.com/user/profile/{profile.get('user_id') or account.xhs_user_id}"
    account.profile_data = profile
    account.sample_notes = notes
    account.analysis = analysis
    account.last_analyzed_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    return creator_account_to_dict(account)
