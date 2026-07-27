from datetime import datetime
from typing import Optional, List
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from backend.models import Material


CONTENT_TYPES = [
    "用户使用痛点",
    "专业知识分享",
    "香味分享",
    "车型知识",
    "产品卖点",
    "用户案例",
    "爆款参考",
    "竞品种草",
    "标题灵感",
    "视频灵感",
    "活动素材",
]

SOURCE_TYPES = [
    ("self_experience", "自家经验"),
    ("product资料", "产品资料"),
    ("customer_feedback", "客户反馈"),
    ("xiaohongshu", "小红书博主"),
    ("douyin", "抖音博主"),
    ("bilibili", "B站内容"),
    ("competitor", "竞品账号"),
    ("car_group", "车友群"),
    ("sales_feedback", "销售反馈"),
    ("wechat_article", "公众号文章"),
    ("other", "其他"),
]

SOURCE_TYPE_LABELS = {k: v for k, v in SOURCE_TYPES}


def get_materials(
    db: Session,
    q: Optional[str] = None,
    brand: Optional[str] = None,
    car_model: Optional[str] = None,
    source_type: Optional[str] = None,
    content_types: Optional[List[str]] = None,
    is_favorite: Optional[bool] = None,
    sort: str = "created_at",
    order: str = "desc",
    page: int = 1,
    page_size: int = 20,
):
    query = db.query(Material)

    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                Material.title.ilike(search),
                Material.summary.ilike(search),
                Material.author.ilike(search),
                Material.brand.ilike(search),
            )
        )

    if brand:
        query = query.filter(Material.brand == brand)

    if car_model:
        query = query.filter(Material.car_model == car_model)

    if source_type:
        query = query.filter(Material.source_type == source_type)

    if content_types:
        query = query.filter(Material.content_types.contains(content_types))

    if is_favorite is not None:
        query = query.filter(Material.is_favorite == is_favorite)

    sort_column = getattr(Material, sort, Material.created_at)
    if order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return {"items": items, "total": total, "page": page, "page_size": page_size}


def get_material(db: Session, material_id: str) -> Optional[Material]:
    return db.query(Material).filter(Material.id == material_id).first()


def create_material(db: Session, material_data: dict) -> Material:
    material = Material(**material_data)
    db.add(material)
    db.commit()
    db.refresh(material)
    return material


def update_material(db: Session, material_id: str, material_data: dict) -> Optional[Material]:
    material = get_material(db, material_id)
    if not material:
        return None
    for key, value in material_data.items():
        setattr(material, key, value)
    material.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(material)
    return material


def delete_material(db: Session, material_id: str) -> bool:
    material = get_material(db, material_id)
    if not material:
        return False
    db.delete(material)
    db.commit()
    return True


def toggle_favorite(db: Session, material_id: str) -> Optional[Material]:
    material = get_material(db, material_id)
    if not material:
        return None
    material.is_favorite = not material.is_favorite
    db.commit()
    db.refresh(material)
    return material


def get_favorites(db: Session, page: int = 1, page_size: int = 20):
    query = db.query(Material).filter(Material.is_favorite == True)
    total = query.count()
    items = query.order_by(Material.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def get_recent(db: Session, limit: int = 30):
    return db.query(Material).order_by(Material.created_at.desc()).limit(limit).all()


def get_options(db: Session):
    brands = db.query(Material.brand).filter(Material.brand.isnot(None)).distinct().all()
    car_models = db.query(Material.car_model).filter(Material.car_model.isnot(None)).distinct().all()
    return {
        "brands": [b[0] for b in brands if b[0]],
        "car_models": [c[0] for c in car_models if c[0]],
        "source_types": SOURCE_TYPES,
        "content_types": CONTENT_TYPES,
    }
