from datetime import datetime
from typing import Optional, List
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from backend.models import Creation, Material, UserFavorite


CONTENT_TYPES = [
    "用户使用痛点",
    "专业知识分享",
    "香味分享",
    "车型知识",
    "产品卖点",
    "用户案例",
    "笔记灵感",
    "爆款参考",
    "竞品种草",
    "标题灵感",
    "视频灵感",
    "活动素材",
]

VEHICLE_CONTENT_TYPES = [
    "用户使用痛点",
    "专业知识分享",
    "香味分享",
    "车型知识",
    "产品卖点",
    "用户案例",
    "竞品种草",
]

GENERAL_CONTENT_TYPES = [
    "笔记灵感",
    "爆款参考",
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
    user_id: str,
    q: Optional[str] = None,
    material_scope: Optional[str] = None,
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
                Material.car_model.ilike(search),
            )
        )

    if material_scope:
        query = query.filter(Material.material_scope == material_scope)

    if brand:
        query = query.filter(Material.brand == brand)

    if car_model:
        query = query.filter(Material.car_model == car_model)

    if source_type:
        query = query.filter(Material.source_type == source_type)

    if content_types:
        query = query.filter(Material.content_types.contains(content_types))

    if is_favorite is True:
        query = query.join(
            UserFavorite,
            UserFavorite.material_id == Material.id,
        ).filter(UserFavorite.user_id == user_id)
    elif is_favorite is False:
        query = query.outerjoin(
            UserFavorite,
            and_(
                UserFavorite.material_id == Material.id,
                UserFavorite.user_id == user_id,
            ),
        ).filter(UserFavorite.user_id.is_(None))

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
    db.query(UserFavorite).filter(UserFavorite.material_id == material_id).delete(
        synchronize_session=False
    )
    db.delete(material)
    db.commit()
    return True


def get_favorite_material_ids(
    db: Session,
    user_id: str,
    material_ids: Optional[List[str]] = None,
) -> set[str]:
    query = db.query(UserFavorite.material_id).filter(
        UserFavorite.user_id == user_id
    )
    if material_ids is not None:
        if not material_ids:
            return set()
        query = query.filter(UserFavorite.material_id.in_(material_ids))
    return {material_id for (material_id,) in query.all()}


def toggle_favorite(
    db: Session,
    user_id: str,
    material_id: str,
) -> Optional[tuple[Material, bool]]:
    material = get_material(db, material_id)
    if not material:
        return None
    favorite = db.query(UserFavorite).filter(
        UserFavorite.user_id == user_id,
        UserFavorite.material_id == material_id,
    ).first()
    if favorite:
        db.delete(favorite)
        is_favorite = False
    else:
        db.add(UserFavorite(user_id=user_id, material_id=material_id))
        is_favorite = True
    db.commit()
    return material, is_favorite


def add_favorite(db: Session, user_id: str, material_id: str):
    existing = db.query(UserFavorite).filter(
        UserFavorite.user_id == user_id,
        UserFavorite.material_id == material_id,
    ).first()
    if not existing:
        db.add(UserFavorite(user_id=user_id, material_id=material_id))
        db.commit()


def get_favorites(db: Session, user_id: str, page: int = 1, page_size: int = 20):
    query = db.query(Material).join(
        UserFavorite,
        UserFavorite.material_id == Material.id,
    ).filter(UserFavorite.user_id == user_id)
    total = query.count()
    items = query.order_by(UserFavorite.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def get_recent(db: Session, limit: int = 30):
    return db.query(Material).order_by(Material.created_at.desc()).limit(limit).all()


def get_options(db: Session):
    brands = db.query(Material.brand).filter(Material.brand.isnot(None)).distinct().all()
    car_models = db.query(Material.car_model).filter(Material.car_model.isnot(None)).distinct().all()
    vehicle_rows = (
        db.query(Material.brand, Material.car_model)
        .filter(
            Material.material_scope == "vehicle",
            Material.brand.isnot(None),
            Material.car_model.isnot(None),
        )
        .distinct()
        .order_by(Material.brand.asc(), Material.car_model.asc())
        .all()
    )
    return {
        "brands": [b[0] for b in brands if b[0]],
        "car_models": [c[0] for c in car_models if c[0]],
        "vehicles": [
            {"brand": brand, "car_model": car_model}
            for brand, car_model in vehicle_rows
            if brand and car_model
        ],
        "source_types": SOURCE_TYPES,
        "content_types": CONTENT_TYPES,
        "content_type_groups": {
            "vehicle": VEHICLE_CONTENT_TYPES,
            "general": GENERAL_CONTENT_TYPES,
        },
    }


def get_content_type_counts(
    db: Session,
    material_scope: str,
    brand: Optional[str] = None,
    car_model: Optional[str] = None,
):
    query = db.query(Material.content_types).filter(
        Material.material_scope == material_scope
    )
    if brand:
        query = query.filter(Material.brand == brand)
    if car_model:
        query = query.filter(Material.car_model == car_model)

    counts = {}
    total = 0
    for (content_types,) in query.all():
        total += 1
        for content_type in content_types or []:
            counts[content_type] = counts.get(content_type, 0) + 1
    return {"total": total, "content_types": counts}


def get_creations(
    db: Session,
    user_id: str,
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    query = db.query(Creation).filter(Creation.user_id == user_id)
    if q:
        search = f"%{q}%"
        query = query.filter(
            or_(
                Creation.title.ilike(search),
                Creation.summary.ilike(search),
                Creation.original_content.ilike(search),
            )
        )

    total = query.count()
    items = (
        query.order_by(Creation.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def get_creation(db: Session, user_id: str, creation_id: str) -> Optional[Creation]:
    return db.query(Creation).filter(
        Creation.id == creation_id,
        Creation.user_id == user_id,
    ).first()


def create_creation(db: Session, creation_data: dict) -> Creation:
    creation = Creation(**creation_data)
    db.add(creation)
    db.commit()
    db.refresh(creation)
    return creation


def update_creation(db: Session, user_id: str, creation_id: str, creation_data: dict) -> Optional[Creation]:
    creation = get_creation(db, user_id, creation_id)
    if not creation:
        return None
    for key, value in creation_data.items():
        setattr(creation, key, value)
    creation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(creation)
    return creation


def delete_creation(db: Session, user_id: str, creation_id: str) -> bool:
    creation = get_creation(db, user_id, creation_id)
    if not creation:
        return False
    db.delete(creation)
    db.commit()
    return True
