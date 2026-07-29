from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./data/materials.db"
)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def migrate_multi_user_data():
    """Add ownership fields and move legacy personal data to the first admin."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        if "creations" in tables:
            creation_columns = {
                column["name"] for column in inspector.get_columns("creations")
            }
            if "user_id" not in creation_columns:
                connection.execute(text(
                    "ALTER TABLE creations ADD COLUMN user_id VARCHAR(36)"
                ))

        if "ai_feedback" in tables:
            feedback_columns = {
                column["name"] for column in inspector.get_columns("ai_feedback")
            }
            if "user_id" not in feedback_columns:
                connection.execute(text(
                    "ALTER TABLE ai_feedback ADD COLUMN user_id VARCHAR(36)"
                ))

    from backend.models import AiFeedback, Creation, Material, User, UserFavorite, UserSession
    from backend.security import hash_password

    username = os.getenv("INITIAL_ADMIN_USERNAME", "admin").strip().lower()
    display_name = os.getenv("INITIAL_ADMIN_DISPLAY_NAME", "系统管理员").strip()
    password = os.getenv("INITIAL_ADMIN_PASSWORD", "RubyRain2026!")

    with SessionLocal() as db:
        admin = db.query(User).filter(User.username == username).first()
        if not admin:
            admin = db.query(User).order_by(User.created_at.asc()).first()
        if not admin:
            admin = User(
                username=username,
                display_name=display_name or "系统管理员",
                password_hash=hash_password(password),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.flush()

        db.query(Creation).filter(Creation.user_id.is_(None)).update(
            {Creation.user_id: admin.id},
            synchronize_session=False,
        )
        db.query(AiFeedback).filter(AiFeedback.user_id.is_(None)).update(
            {AiFeedback.user_id: admin.id},
            synchronize_session=False,
        )

        legacy_favorites = (
            db.query(Material.id)
            .filter(Material.is_favorite == True)
            .all()
        )
        for (material_id,) in legacy_favorites:
            exists = db.query(UserFavorite).filter(
                UserFavorite.user_id == admin.id,
                UserFavorite.material_id == material_id,
            ).first()
            if not exists:
                db.add(UserFavorite(user_id=admin.id, material_id=material_id))

        db.query(Material).filter(Material.is_favorite == True).update(
            {Material.is_favorite: False},
            synchronize_session=False,
        )
        db.query(UserSession).filter(UserSession.expires_at <= datetime.utcnow()).delete(
            synchronize_session=False,
        )
        db.commit()


def migrate_material_scope():
    """Add and backfill material_scope for databases created before this field existed."""
    inspector = inspect(engine)
    if "materials" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("materials")}
    with engine.begin() as connection:
        if "material_scope" not in columns:
            connection.execute(text(
                "ALTER TABLE materials ADD COLUMN material_scope VARCHAR(20)"
            ))

        connection.execute(text("""
            UPDATE materials
            SET material_scope = CASE
                WHEN car_model IS NOT NULL AND TRIM(car_model) <> '' THEN 'vehicle'
                ELSE 'general'
            END
            WHERE material_scope IS NULL OR TRIM(material_scope) = ''
        """))


def migrate_material_ai_conversation():
    """Add persisted AI conversation state to existing material databases."""
    inspector = inspect(engine)
    if "materials" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("materials")}
    if "ai_conversation" not in columns:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE materials ADD COLUMN ai_conversation JSON"
            ))


def migrate_material_source_metadata():
    """Add structured source metadata for imported platform content."""
    inspector = inspect(engine)
    if "materials" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("materials")}
    if "source_metadata" not in columns:
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE materials ADD COLUMN source_metadata JSON"
            ))


def migrate_creator_account_intelligence():
    """Backfill public-data sync fields for existing creator accounts."""
    inspector = inspect(engine)
    if "creator_accounts" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("creator_accounts")}
    definitions = {
        "account_kind": "VARCHAR(20) DEFAULT 'owned'",
        "data_source": "VARCHAR(20) DEFAULT 'auto'",
        "last_sync_source": "VARCHAR(20)",
        "last_sync_status": "VARCHAR(20) DEFAULT 'never'",
        "last_sync_error": "TEXT",
        "synced_note_count": "INTEGER DEFAULT 0",
    }
    with engine.begin() as connection:
        for name, definition in definitions.items():
            if name not in columns:
                connection.execute(text(
                    f"ALTER TABLE creator_accounts ADD COLUMN {name} {definition}"
                ))

        connection.execute(text("""
            UPDATE creator_accounts
            SET account_kind = 'owned'
            WHERE account_kind IS NULL OR TRIM(account_kind) = ''
        """))
        connection.execute(text("""
            UPDATE creator_accounts
            SET data_source = 'auto'
            WHERE data_source IS NULL OR TRIM(data_source) = ''
        """))
        connection.execute(text("""
            UPDATE creator_accounts
            SET last_sync_status = CASE
                WHEN last_analyzed_at IS NULL THEN 'never'
                ELSE 'success'
            END
            WHERE last_sync_status IS NULL OR TRIM(last_sync_status) = ''
        """))
        connection.execute(text("""
            UPDATE creator_accounts
            SET synced_note_count = 0
            WHERE synced_note_count IS NULL
        """))


def migrate_ai_materials_to_creations():
    """Move legacy AI workspaces out of the material library on startup."""
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "materials" not in tables or "creations" not in tables:
        return

    # Import here because models import Base from this module during startup.
    from backend.models import Creation, Material, User

    with SessionLocal() as db:
        default_user = db.query(User).order_by(User.created_at.asc()).first()
        if not default_user:
            return
        legacy_creations = (
            db.query(Material)
            .filter(Material.source_type == "ai_generated")
            .all()
        )
        for material in legacy_creations:
            existing = db.query(Creation).filter(Creation.id == material.id).first()
            if not existing:
                content = material.original_content or material.summary or ""
                conversation = material.ai_conversation or {
                    "version": 1,
                    "task": "concept",
                    "messages": (
                        [{"role": "assistant", "content": content}]
                        if content else []
                    ),
                    "selected_material_ids": [],
                    "scope_filter": "all",
                    "material_search": "",
                    "brand": material.brand,
                    "car_model": material.car_model,
                    "image_prompt": "",
                    "generated_images": [],
                    "image_messages": [],
                    "reference_image_attachment": None,
                    "active_reference_attachment": None,
                    "prompt_version": "legacy-ai-material",
                    "saved_at": (
                        (material.updated_at or material.created_at).isoformat()
                        if material.updated_at or material.created_at
                        else ""
                    ),
                }
                db.add(Creation(
                    id=material.id,
                    user_id=default_user.id,
                    title=material.title,
                    summary=material.summary,
                    original_content=material.original_content,
                    tags=material.tags or [],
                    attachments=material.attachments or [],
                    ai_conversation=conversation,
                    created_at=material.created_at,
                    updated_at=material.updated_at,
                ))
            db.delete(material)
        db.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
