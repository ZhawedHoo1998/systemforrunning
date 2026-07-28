from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
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
