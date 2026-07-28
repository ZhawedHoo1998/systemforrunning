import io
import json
import os
import re
import zipfile
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from backend import crud
from backend.auth import get_current_user
from backend.database import get_db
from backend.models import User
from backend.routers.materials import parse_json_list, parse_json_object, save_uploads

router = APIRouter(
    prefix="/api/creations",
    tags=["creations"],
    dependencies=[Depends(get_current_user)],
)

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads"))


def sanitize_export_name(value: str):
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" ._")
    return (cleaned or "小红书笔记")[:80]


def resolve_export_attachment(attachment: dict):
    path = attachment.get("path") if isinstance(attachment, dict) else None
    if not isinstance(path, str) or not path.startswith("/uploads/"):
        return None
    filepath = os.path.abspath(os.path.join(UPLOAD_DIR, os.path.basename(path)))
    if os.path.commonpath([UPLOAD_DIR, filepath]) != UPLOAD_DIR or not os.path.isfile(filepath):
        return None
    return filepath


def creation_to_dict(creation):
    return {
        "id": str(creation.id),
        "title": creation.title,
        "summary": creation.summary,
        "original_content": creation.original_content,
        "tags": creation.tags or [],
        "attachments": creation.attachments or [],
        "ai_conversation": creation.ai_conversation,
        "created_at": creation.created_at.isoformat() if creation.created_at else None,
        "updated_at": creation.updated_at.isoformat() if creation.updated_at else None,
    }


def parse_conversation(value: str):
    return parse_json_object(value, "AI 会话")


def apply_uploaded_reference(conversation: dict, uploaded_attachments: list[dict]):
    if uploaded_attachments:
        conversation["reference_image_attachment"] = uploaded_attachments[-1]
        conversation["active_reference_attachment"] = uploaded_attachments[-1]


@router.get("")
async def list_creations(
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = crud.get_creations(
        db,
        user_id=current_user.id,
        q=q,
        page=page,
        page_size=page_size,
    )
    result["items"] = [creation_to_dict(creation) for creation in result["items"]]
    return result


@router.get("/{creation_id}")
async def get_creation(
    creation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    creation = crud.get_creation(db, current_user.id, creation_id)
    if not creation:
        raise HTTPException(status_code=404, detail="Creation not found")
    return creation_to_dict(creation)


@router.post("/{creation_id}/export")
async def export_creation(
    creation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    creation = crud.get_creation(db, current_user.id, creation_id)
    if not creation:
        raise HTTPException(status_code=404, detail="Creation not found")

    conversation = creation.ai_conversation or {}
    draft = conversation.get("draft") or {}
    title = str(draft.get("title") or creation.title or "小红书笔记").strip()
    content = str(draft.get("content") or creation.original_content or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="最终文稿内容为空，无法导出")

    attachments_by_path = {
        attachment.get("path"): attachment
        for attachment in (creation.attachments or [])
        if isinstance(attachment, dict) and isinstance(attachment.get("path"), str)
    }
    selected_paths = draft.get("selected_asset_paths") or []
    if not isinstance(selected_paths, list):
        raise HTTPException(status_code=422, detail="导出配图数据无效")
    cover_path = draft.get("cover_asset_path")
    ordered_paths = []
    if cover_path in selected_paths:
        ordered_paths.append(cover_path)
    ordered_paths.extend(path for path in selected_paths if path != cover_path)

    selected_attachments = []
    for path in ordered_paths:
        attachment = attachments_by_path.get(path)
        filepath = resolve_export_attachment(attachment) if attachment else None
        if not filepath:
            raise HTTPException(status_code=422, detail="导出配图不存在或无权访问")
        selected_attachments.append((attachment, filepath))

    folder_name = sanitize_export_name(title)
    full_text = f"{title}\n\n{content}\n"
    metadata = {
        "title": title,
        "content": content,
        "brand": conversation.get("brand"),
        "car_model": conversation.get("car_model"),
        "cover_asset_path": cover_path if cover_path in ordered_paths else None,
        "images": [attachment for attachment, _ in selected_attachments],
        "exported_from_creation_id": str(creation.id),
    }

    archive_buffer = io.BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"{folder_name}/01-完整文案.txt", full_text)
        archive.writestr(f"{folder_name}/02-标题.txt", f"{title}\n")
        archive.writestr(f"{folder_name}/03-正文.txt", f"{content}\n")
        archive.writestr(f"{folder_name}/04-文案备份.md", f"# {title}\n\n{content}\n")
        archive.writestr(
            f"{folder_name}/note.json",
            json.dumps(metadata, ensure_ascii=False, indent=2),
        )
        for index, (attachment, filepath) in enumerate(selected_attachments, start=1):
            extension = os.path.splitext(filepath)[1].lower() or ".png"
            role = "首图" if index == 1 and cover_path else "配图"
            archive.write(filepath, f"{folder_name}/images/{index:02d}-{role}{extension}")

    archive_name = f"{folder_name}-发布包.zip"
    return Response(
        content=archive_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f"attachment; filename=xiaohongshu-package.zip; "
                f"filename*=UTF-8''{quote(archive_name)}"
            ),
        },
    )


@router.post("")
async def create_creation(
    title: str = Form(...),
    summary: Optional[str] = Form(None),
    original_content: Optional[str] = Form(None),
    tags: str = Form("[]"),
    attachments: str = Form("[]"),
    ai_conversation: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tags_list = parse_json_list(tags, "标签")
    attachments_list = parse_json_list(attachments, "附件")
    conversation = parse_conversation(ai_conversation)
    uploaded_attachments = await save_uploads(files)
    apply_uploaded_reference(conversation, uploaded_attachments)

    creation = crud.create_creation(db, {
        "user_id": current_user.id,
        "title": title,
        "summary": summary,
        "original_content": original_content,
        "tags": tags_list,
        "attachments": attachments_list + uploaded_attachments,
        "ai_conversation": conversation,
    })
    return creation_to_dict(creation)


@router.put("/{creation_id}")
async def update_creation(
    creation_id: str,
    title: Optional[str] = Form(None),
    summary: Optional[str] = Form(None),
    original_content: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    attachments: Optional[str] = Form(None),
    ai_conversation: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = crud.get_creation(db, current_user.id, creation_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Creation not found")

    data = {}
    if title is not None:
        data["title"] = title
    if summary is not None:
        data["summary"] = summary
    if original_content is not None:
        data["original_content"] = original_content
    if tags is not None:
        data["tags"] = parse_json_list(tags, "标签")

    uploaded_attachments = await save_uploads(files)
    if ai_conversation is not None:
        conversation = parse_conversation(ai_conversation)
        apply_uploaded_reference(conversation, uploaded_attachments)
        data["ai_conversation"] = conversation
    if attachments is not None or uploaded_attachments:
        retained_attachments = (
            parse_json_list(attachments, "附件")
            if attachments is not None
            else (existing.attachments or [])
        )
        data["attachments"] = retained_attachments + uploaded_attachments

    creation = crud.update_creation(db, current_user.id, creation_id, data)
    return creation_to_dict(creation)


@router.delete("/{creation_id}")
async def delete_creation(
    creation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not crud.delete_creation(db, current_user.id, creation_id):
        raise HTTPException(status_code=404, detail="Creation not found")
    return {"status": "ok"}
