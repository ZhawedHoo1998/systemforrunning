import uuid
import os
import mimetypes
import json
import aiofiles
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend import crud
from backend.auth import get_current_user
from backend.models import User

router = APIRouter(
    prefix="/api/materials",
    tags=["materials"],
    dependencies=[Depends(get_current_user)],
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

UPLOAD_CHUNK_SIZE = 1024 * 1024
MAX_UPLOAD_SIZE = 200 * 1024 * 1024
MAX_UPLOAD_SIZE_MB = MAX_UPLOAD_SIZE // (1024 * 1024)
VIDEO_EXTENSIONS = {".m4v", ".mov", ".mp4", ".webm"}
MATERIAL_SCOPES = {"vehicle", "general"}


class MaterialCreate(BaseModel):
    title: str
    material_scope: str = "vehicle"
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
    source_metadata: Optional[dict] = None


class MaterialUpdate(BaseModel):
    title: Optional[str] = None
    material_scope: Optional[str] = None
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
    source_metadata: Optional[dict] = None


def material_to_dict(material, is_favorite: bool = False):
    return {
        "id": str(material.id),
        "title": material.title,
        "material_scope": material.material_scope,
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
        "source_metadata": material.source_metadata,
        "is_favorite": is_favorite,
        "created_at": material.created_at.isoformat() if material.created_at else None,
        "updated_at": material.updated_at.isoformat() if material.updated_at else None,
    }


def normalize_scope_fields(
    material_scope: str,
    brand: Optional[str],
    car_model: Optional[str],
):
    if material_scope not in MATERIAL_SCOPES:
        raise HTTPException(status_code=422, detail="请选择有效的素材范围")

    normalized_brand = brand.strip() if brand else None
    normalized_car_model = car_model.strip() if car_model else None
    if material_scope == "vehicle":
        if not normalized_brand or not normalized_car_model:
            raise HTTPException(status_code=422, detail="车型相关素材必须填写品牌和车型")
        return normalized_brand, normalized_car_model

    return None, None


def parse_json_list(value: str, field_label: str):
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError) as error:
        raise HTTPException(status_code=422, detail=f"{field_label}格式不正确") from error
    if not isinstance(parsed, list):
        raise HTTPException(status_code=422, detail=f"{field_label}必须是列表")
    return parsed


def parse_json_object(value: str, field_label: str):
    if len(value.encode("utf-8")) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"{field_label}不能超过 2MB")
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError) as error:
        raise HTTPException(status_code=422, detail=f"{field_label}格式不正确") from error
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail=f"{field_label}必须是对象")
    return parsed


async def save_uploads(files: List[UploadFile]):
    uploaded_attachments = []
    saved_filepaths = []

    try:
        for upload in files:
            if not upload.filename:
                continue

            ext = os.path.splitext(upload.filename)[1].lower()
            content_type = (
                upload.content_type
                or mimetypes.guess_type(upload.filename)[0]
                or "application/octet-stream"
            )
            is_video = content_type.startswith("video/") or ext in VIDEO_EXTENSIONS
            if is_video and ext not in VIDEO_EXTENSIONS:
                raise HTTPException(
                    status_code=415,
                    detail="暂不支持该视频格式，请上传 MP4、WebM、MOV 或 M4V",
                )

            file_id = uuid.uuid4().hex
            filename = f"{file_id}{ext}"
            filepath = os.path.join(UPLOAD_DIR, filename)
            saved_filepaths.append(filepath)

            total_size = 0
            try:
                async with aiofiles.open(filepath, "wb") as out:
                    while chunk := await upload.read(UPLOAD_CHUNK_SIZE):
                        total_size += len(chunk)
                        if total_size > MAX_UPLOAD_SIZE:
                            raise HTTPException(
                                status_code=413,
                                detail=f"单个附件不能超过 {MAX_UPLOAD_SIZE_MB}MB",
                            )
                        await out.write(chunk)
            finally:
                await upload.close()

            uploaded_attachments.append({
                "name": upload.filename,
                "path": f"/uploads/{filename}",
                "type": content_type,
                "size": total_size,
            })
    except Exception:
        for filepath in saved_filepaths:
            if os.path.exists(filepath):
                os.remove(filepath)
        raise

    return uploaded_attachments


@router.get("")
async def list_materials(
    q: Optional[str] = None,
    material_scope: Optional[str] = None,
    brand: Optional[str] = None,
    car_model: Optional[str] = None,
    source_type: Optional[str] = None,
    content_types: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    sort: str = "created_at",
    order: str = "desc",
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if material_scope and material_scope not in MATERIAL_SCOPES:
        raise HTTPException(status_code=422, detail="请选择有效的素材范围")
    content_types_list = content_types.split(",") if content_types else None
    result = crud.get_materials(
        db,
        user_id=current_user.id,
        q=q,
        material_scope=material_scope,
        brand=brand,
        car_model=car_model,
        source_type=source_type,
        content_types=content_types_list,
        is_favorite=is_favorite,
        sort=sort,
        order=order,
        page=page,
        page_size=page_size,
    )
    favorite_ids = crud.get_favorite_material_ids(
        db,
        current_user.id,
        [material.id for material in result["items"]],
    )
    result["items"] = [
        material_to_dict(material, material.id in favorite_ids)
        for material in result["items"]
    ]
    return result


@router.get("/favorites")
async def list_favorites(
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = crud.get_favorites(db, current_user.id, page, page_size)
    result["items"] = [material_to_dict(m, True) for m in result["items"]]
    return result


@router.get("/recent")
async def list_recent(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    materials = crud.get_recent(db, limit)
    favorite_ids = crud.get_favorite_material_ids(
        db,
        current_user.id,
        [material.id for material in materials],
    )
    return [
        material_to_dict(material, material.id in favorite_ids)
        for material in materials
    ]


@router.get("/options")
async def get_options(db: Session = Depends(get_db)):
    return crud.get_options(db)


@router.get("/facets")
async def get_facets(
    material_scope: str,
    brand: Optional[str] = None,
    car_model: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if material_scope not in MATERIAL_SCOPES:
        raise HTTPException(status_code=422, detail="请选择有效的素材范围")
    return crud.get_content_type_counts(db, material_scope, brand, car_model)


@router.get("/{material_id}")
async def get_material(
    material_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    material = crud.get_material(db, material_id)
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    favorite_ids = crud.get_favorite_material_ids(db, current_user.id, [material.id])
    return material_to_dict(material, material.id in favorite_ids)


@router.post("")
async def create_material(
    title: str = Form(...),
    material_scope: str = Form("vehicle"),
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
    source_metadata: str = Form("{}"),
    attachments: str = Form("[]"),
    is_favorite: bool = Form(False),
    files: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content_types_list = parse_json_list(content_types, "内容类型")
    tags_list = parse_json_list(tags, "标签")
    source_metadata_object = parse_json_object(source_metadata, "来源信息")
    attachments_list = parse_json_list(attachments, "附件")
    brand, car_model = normalize_scope_fields(material_scope, brand, car_model)

    uploaded_attachments = await save_uploads(files)

    all_attachments = attachments_list + uploaded_attachments

    material_data = {
        "title": title,
        "material_scope": material_scope,
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
        "source_metadata": source_metadata_object or None,
    }

    material = crud.create_material(db, material_data)
    if is_favorite:
        crud.add_favorite(db, current_user.id, material.id)
    return material_to_dict(material, is_favorite)


@router.put("/{material_id}")
async def update_material(
    material_id: str,
    title: Optional[str] = Form(None),
    material_scope: Optional[str] = Form(None),
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
    source_metadata: Optional[str] = Form(None),
    attachments: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing_material = crud.get_material(db, material_id)
    if not existing_material:
        raise HTTPException(status_code=404, detail="Material not found")

    material_data = {}
    effective_scope = material_scope or existing_material.material_scope
    effective_brand = brand if brand is not None else existing_material.brand
    effective_car_model = car_model if car_model is not None else existing_material.car_model
    effective_brand, effective_car_model = normalize_scope_fields(
        effective_scope,
        effective_brand,
        effective_car_model,
    )
    material_data["material_scope"] = effective_scope
    material_data["brand"] = effective_brand
    material_data["car_model"] = effective_car_model
    if title is not None:
        material_data["title"] = title
    if source_type is not None:
        material_data["source_type"] = source_type
    if source_platform is not None:
        material_data["source_platform"] = source_platform
    if author is not None:
        material_data["author"] = author
    if source_url is not None:
        material_data["source_url"] = source_url
    if content_types is not None:
        material_data["content_types"] = parse_json_list(content_types, "内容类型")
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
        material_data["tags"] = parse_json_list(tags, "标签")
    if source_metadata is not None:
        source_metadata_object = parse_json_object(source_metadata, "来源信息")
        material_data["source_metadata"] = source_metadata_object or None
    uploaded_attachments = await save_uploads(files)
    if attachments is not None or uploaded_attachments:
        retained_attachments = (
            parse_json_list(attachments, "附件")
            if attachments is not None
            else (existing_material.attachments or [])
        )
        material_data["attachments"] = retained_attachments + uploaded_attachments

    material = crud.update_material(db, material_id, material_data)
    favorite_ids = crud.get_favorite_material_ids(db, current_user.id, [material.id])
    return material_to_dict(material, material.id in favorite_ids)


@router.delete("/{material_id}")
async def delete_material(material_id: str, db: Session = Depends(get_db)):
    success = crud.delete_material(db, material_id)
    if not success:
        raise HTTPException(status_code=404, detail="Material not found")
    return {"status": "ok"}


@router.post("/{material_id}/favorite")
async def toggle_favorite(
    material_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = crud.toggle_favorite(db, current_user.id, material_id)
    if not result:
        raise HTTPException(status_code=404, detail="Material not found")
    material, is_favorite = result
    return material_to_dict(material, is_favorite)
