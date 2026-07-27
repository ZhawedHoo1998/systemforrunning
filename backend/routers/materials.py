import uuid
import os
import aiofiles
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend import crud

router = APIRouter(prefix="/api/materials", tags=["materials"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class MaterialCreate(BaseModel):
    title: str
    brand: Optional[str] = None
    car_model: Optional[str] = None
    source_type: str
    source_platform: Optional[str] = None
    author: Optional[str] = None
    source_url: Optional[str] = None
    content_types: List[str] = []
    summary: Optional[str] = None
    original_content: Optional[str] = None
    save_reason: Optional[str] = None
    learning_points: Optional[str] = None
    suggest_title: Optional[str] = None
    tags: List[str] = []


class MaterialUpdate(BaseModel):
    title: Optional[str] = None
    brand: Optional[str] = None
    car_model: Optional[str] = None
    source_type: Optional[str] = None
    source_platform: Optional[str] = None
    author: Optional[str] = None
    source_url: Optional[str] = None
    content_types: Optional[List[str]] = None
    summary: Optional[str] = None
    original_content: Optional[str] = None
    save_reason: Optional[str] = None
    learning_points: Optional[str] = None
    suggest_title: Optional[str] = None
    tags: Optional[List[str]] = None


def material_to_dict(material):
    return {
        "id": str(material.id),
        "title": material.title,
        "brand": material.brand,
        "car_model": material.car_model,
        "source_type": material.source_type,
        "source_platform": material.source_platform,
        "author": material.author,
        "source_url": material.source_url,
        "content_types": material.content_types or [],
        "summary": material.summary,
        "original_content": material.original_content,
        "save_reason": material.save_reason,
        "learning_points": material.learning_points,
        "suggest_title": material.suggest_title,
        "tags": material.tags or [],
        "attachments": material.attachments or [],
        "is_favorite": material.is_favorite,
        "created_at": material.created_at.isoformat() if material.created_at else None,
        "updated_at": material.updated_at.isoformat() if material.updated_at else None,
    }


@router.get("")
async def list_materials(
    q: Optional[str] = None,
    brand: Optional[str] = None,
    car_model: Optional[str] = None,
    source_type: Optional[str] = None,
    content_types: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    sort: str = "created_at",
    order: str = "desc",
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    content_types_list = content_types.split(",") if content_types else None
    result = crud.get_materials(
        db, q, brand, car_model, source_type, content_types_list, is_favorite, sort, order, page, page_size
    )
    result["items"] = [material_to_dict(m) for m in result["items"]]
    return result


@router.get("/favorites")
async def list_favorites(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    result = crud.get_favorites(db, page, page_size)
    result["items"] = [material_to_dict(m) for m in result["items"]]
    return result


@router.get("/recent")
async def list_recent(
    limit: int = 30,
    db: Session = Depends(get_db),
):
    materials = crud.get_recent(db, limit)
    return [material_to_dict(m) for m in materials]


@router.get("/options")
async def get_options(db: Session = Depends(get_db)):
    return crud.get_options(db)


@router.get("/{material_id}")
async def get_material(material_id: str, db: Session = Depends(get_db)):
    material = crud.get_material(db, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material_to_dict(material)


@router.post("")
async def create_material(
    title: str = Form(...),
    brand: Optional[str] = Form(None),
    car_model: Optional[str] = Form(None),
    source_type: str = Form(...),
    source_platform: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    source_url: Optional[str] = Form(None),
    content_types: str = Form("[]"),
    summary: Optional[str] = Form(None),
    original_content: Optional[str] = Form(None),
    save_reason: Optional[str] = Form(None),
    learning_points: Optional[str] = Form(None),
    suggest_title: Optional[str] = Form(None),
    tags: str = Form("[]"),
    attachments: str = Form("[]"),
    files: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
):
    import json
    content_types_list = json.loads(content_types)
    tags_list = json.loads(tags)
    attachments_list = json.loads(attachments)

    uploaded_attachments = []
    for f in files:
        if f.filename:
            file_id = uuid.uuid4().hex
            ext = os.path.splitext(f.filename)[1]
            filename = f"{file_id}{ext}"
            filepath = os.path.join(UPLOAD_DIR, filename)
            async with aiofiles.open(filepath, "wb") as out:
                content = await f.read()
                await out.write(content)
            uploaded_attachments.append({
                "name": f.filename,
                "path": f"/uploads/{filename}",
                "type": f.content_type,
            })

    all_attachments = attachments_list + uploaded_attachments

    material_data = {
        "title": title,
        "brand": brand,
        "car_model": car_model,
        "source_type": source_type,
        "source_platform": source_platform,
        "author": author,
        "source_url": source_url,
        "content_types": content_types_list,
        "summary": summary,
        "original_content": original_content,
        "save_reason": save_reason,
        "learning_points": learning_points,
        "suggest_title": suggest_title,
        "tags": tags_list,
        "attachments": all_attachments,
    }

    material = crud.create_material(db, material_data)
    return material_to_dict(material)


@router.put("/{material_id}")
async def update_material(
    material_id: str,
    title: Optional[str] = Form(None),
    brand: Optional[str] = Form(None),
    car_model: Optional[str] = Form(None),
    source_type: Optional[str] = Form(None),
    source_platform: Optional[str] = Form(None),
    author: Optional[str] = Form(None),
    source_url: Optional[str] = Form(None),
    content_types: Optional[str] = Form(None),
    summary: Optional[str] = Form(None),
    original_content: Optional[str] = Form(None),
    save_reason: Optional[str] = Form(None),
    learning_points: Optional[str] = Form(None),
    suggest_title: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    attachments: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    import json
    material_data = {}
    if title is not None:
        material_data["title"] = title
    if brand is not None:
        material_data["brand"] = brand
    if car_model is not None:
        material_data["car_model"] = car_model
    if source_type is not None:
        material_data["source_type"] = source_type
    if source_platform is not None:
        material_data["source_platform"] = source_platform
    if author is not None:
        material_data["author"] = author
    if source_url is not None:
        material_data["source_url"] = source_url
    if content_types is not None:
        material_data["content_types"] = json.loads(content_types)
    if summary is not None:
        material_data["summary"] = summary
    if original_content is not None:
        material_data["original_content"] = original_content
    if save_reason is not None:
        material_data["save_reason"] = save_reason
    if learning_points is not None:
        material_data["learning_points"] = learning_points
    if suggest_title is not None:
        material_data["suggest_title"] = suggest_title
    if tags is not None:
        material_data["tags"] = json.loads(tags)
    if attachments is not None:
        material_data["attachments"] = json.loads(attachments)

    material = crud.update_material(db, material_id, material_data)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material_to_dict(material)


@router.delete("/{material_id}")
async def delete_material(material_id: str, db: Session = Depends(get_db)):
    success = crud.delete_material(db, material_id)
    if not success:
        raise HTTPException(status_code=404, detail="Material not found")
    return {"status": "ok"}


@router.post("/{material_id}/favorite")
async def toggle_favorite(material_id: str, db: Session = Depends(get_db)):
    material = crud.toggle_favorite(db, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    return material_to_dict(material)
