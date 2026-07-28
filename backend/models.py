import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, DateTime, JSON
from backend.database import Base


class Material(Base):
    __tablename__ = "materials"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(500), nullable=False)
    material_scope = Column(String(20), nullable=False, default="vehicle", index=True)
    brand = Column(String(200), nullable=True)
    car_model = Column(String(200), nullable=True)
    source_type = Column(String(50), nullable=False)
    source_platform = Column(String(100), nullable=True)
    author = Column(String(200), nullable=True)
    source_url = Column(String(1000), nullable=True)
    content_types = Column(JSON, default=list)
    summary = Column(Text, nullable=True)
    original_content = Column(Text, nullable=True)
    save_reason = Column(Text, nullable=True)
    learning_points = Column(Text, nullable=True)
    suggest_title = Column(Text, nullable=True)
    tags = Column(JSON, default=list)
    attachments = Column(JSON, default=list)
    is_favorite = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
