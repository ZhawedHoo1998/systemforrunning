from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
