import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey, JSON
from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(100), nullable=False, unique=True, index=True)
    display_name = Column(String(200), nullable=False)
    password_hash = Column(String(500), nullable=False)
    role = Column(String(20), nullable=False, default="writer", index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


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
    source_metadata = Column(JSON, nullable=True)
    ai_conversation = Column(JSON, nullable=True)
    is_favorite = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserFavorite(Base):
    __tablename__ = "user_favorites"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    material_id = Column(String(36), ForeignKey("materials.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class Creation(Base):
    __tablename__ = "creations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    summary = Column(Text, nullable=True)
    original_content = Column(Text, nullable=True)
    tags = Column(JSON, default=list)
    attachments = Column(JSON, default=list)
    ai_conversation = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AiFeedback(Base):
    __tablename__ = "ai_feedback"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    task = Column(String(30), nullable=False)
    rating = Column(String(20), nullable=False)
    comment = Column(Text, nullable=True)
    idea = Column(Text, nullable=True)
    assistant_content = Column(Text, nullable=False)
    material_ids = Column(JSON, default=list)
    brand = Column(String(200), nullable=True)
    car_model = Column(String(200), nullable=True)
    prompt_version = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class XiaohongshuShopConnection(Base):
    __tablename__ = "xiaohongshu_shop_connections"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    seller_id = Column(String(100), nullable=False, index=True)
    seller_name = Column(String(300), nullable=True)
    access_token = Column(Text, nullable=False)
    access_token_expires_at = Column(DateTime, nullable=False, index=True)
    refresh_token = Column(Text, nullable=False)
    refresh_token_expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
