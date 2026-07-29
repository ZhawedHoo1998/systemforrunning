import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, UniqueConstraint
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


class MaterialNotificationState(Base):
    __tablename__ = "material_notification_states"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    seen_through = Column(DateTime, nullable=True, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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


class CreatorAccount(Base):
    __tablename__ = "creator_accounts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(200), nullable=False)
    xhs_user_id = Column(String(100), nullable=False, unique=True, index=True)
    account_kind = Column(String(20), nullable=False, default="owned", index=True)
    data_source = Column(String(20), nullable=False, default="auto", index=True)
    last_sync_source = Column(String(20), nullable=True)
    last_sync_status = Column(String(20), nullable=False, default="never", index=True)
    last_sync_error = Column(Text, nullable=True)
    synced_note_count = Column(Integer, nullable=False, default=0)
    red_id = Column(String(100), nullable=True, index=True)
    nickname = Column(String(200), nullable=True)
    avatar_url = Column(String(1000), nullable=True)
    profile_url = Column(String(1000), nullable=True)
    bio = Column(Text, nullable=True)
    ip_location = Column(String(100), nullable=True)
    positioning = Column(Text, nullable=True)
    target_audience = Column(Text, nullable=True)
    tone_style = Column(Text, nullable=True)
    content_pillars = Column(JSON, default=list)
    title_guidelines = Column(Text, nullable=True)
    body_guidelines = Column(Text, nullable=True)
    conversion_goal = Column(Text, nullable=True)
    prohibited_terms = Column(Text, nullable=True)
    profile_data = Column(JSON, default=dict)
    sample_notes = Column(JSON, default=list)
    analysis = Column(JSON, default=dict)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    last_analyzed_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CreatorAccountNote(Base):
    __tablename__ = "creator_account_notes"
    __table_args__ = (
        UniqueConstraint("creator_account_id", "xhs_note_id", name="uq_creator_account_note"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    creator_account_id = Column(
        String(36),
        ForeignKey("creator_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    xhs_note_id = Column(String(100), nullable=False, index=True)
    title = Column(String(500), nullable=False, default="")
    content = Column(Text, nullable=True)
    cover_url = Column(String(2000), nullable=True)
    source_url = Column(String(2000), nullable=True)
    note_type = Column(String(30), nullable=False, default="normal")
    is_private = Column(Boolean, nullable=False, default=False)
    liked_count = Column(Integer, nullable=False, default=0, index=True)
    collected_count = Column(Integer, nullable=False, default=0, index=True)
    comment_count = Column(Integer, nullable=False, default=0, index=True)
    share_count = Column(Integer, nullable=False, default=0, index=True)
    tags = Column(JSON, default=list)
    source_data = Column(JSON, default=dict)
    published_at = Column(DateTime, nullable=True, index=True)
    first_seen_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_seen_at = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CreatorAccountSnapshot(Base):
    __tablename__ = "creator_account_snapshots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    creator_account_id = Column(
        String(36),
        ForeignKey("creator_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_source = Column(String(20), nullable=False)
    followers = Column(Integer, nullable=False, default=0)
    following = Column(Integer, nullable=False, default=0)
    total_engagement = Column(Integer, nullable=False, default=0)
    note_count = Column(Integer, nullable=False, default=0)
    fetched_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class WeeklyGoal(Base):
    __tablename__ = "weekly_goals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    week_start = Column(Date, nullable=False, index=True)
    week_end = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="active", index=True)
    role_targets = Column(JSON, default=list)
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WorkTask(Base):
    __tablename__ = "work_tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    weekly_goal_id = Column(String(36), ForeignKey("weekly_goals.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=True, index=True)
    priority = Column(String(20), nullable=False, default="normal", index=True)
    status = Column(String(20), nullable=False, default="todo", index=True)
    assignee_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    created_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    start_at = Column(DateTime, nullable=True)
    due_at = Column(DateTime, nullable=False, index=True)
    target_metric_label = Column(String(200), nullable=True)
    target_metric_value = Column(Float, nullable=True)
    metric_unit = Column(String(50), nullable=True)
    actual_metric_value = Column(Float, nullable=True)
    feedback_required = Column(Boolean, nullable=False, default=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TaskFeedback(Base):
    __tablename__ = "task_feedback"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String(36), ForeignKey("work_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    feedback_type = Column(String(20), nullable=False, default="progress", index=True)
    content = Column(Text, nullable=True)
    attachments = Column(JSON, default=list)
    progress_percent = Column(Integer, nullable=True)
    actual_metric_value = Column(Float, nullable=True)
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
