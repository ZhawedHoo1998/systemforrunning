from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from backend.auth import get_current_user, require_manager
from backend.database import get_db
from backend.models import TaskFeedback, User, WeeklyGoal, WorkTask
from backend.routers.materials import save_uploads


router = APIRouter(prefix="/api/tasks", tags=["tasks"])

TaskPriority = Literal["urgent", "high", "normal", "low"]
TaskStatus = Literal["todo", "in_progress", "completed", "cancelled"]
GoalStatus = Literal["draft", "active", "completed", "archived"]


class RoleTarget(BaseModel):
    role: Literal["studio", "manager", "writer"]
    metric: str = Field(min_length=1, max_length=200)
    target: str = Field(min_length=1, max_length=100)
    unit: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=1000)


class WeeklyGoalCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=5000)
    week_start: date
    status: GoalStatus = "active"
    role_targets: list[RoleTarget] = Field(default_factory=list, max_length=30)


class WeeklyGoalUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=5000)
    week_start: Optional[date] = None
    status: Optional[GoalStatus] = None
    role_targets: Optional[list[RoleTarget]] = Field(default=None, max_length=30)


class WorkTaskCreateRequest(BaseModel):
    weekly_goal_id: Optional[str] = Field(default=None, max_length=36)
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: Optional[str] = Field(default=None, max_length=100)
    priority: TaskPriority = "normal"
    assignee_user_id: str = Field(min_length=1, max_length=36)
    start_at: Optional[datetime] = None
    due_at: datetime
    target_metric_label: Optional[str] = Field(default=None, max_length=200)
    target_metric_value: Optional[float] = None
    metric_unit: Optional[str] = Field(default=None, max_length=50)
    feedback_required: bool = True

    @field_validator("due_at")
    @classmethod
    def validate_due_at(cls, value: datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value

    @field_validator("start_at")
    @classmethod
    def validate_start_at(cls, value: Optional[datetime]):
        return value.replace(tzinfo=None) if value and value.tzinfo else value


class WorkTaskUpdateRequest(BaseModel):
    weekly_goal_id: Optional[str] = Field(default=None, max_length=36)
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: Optional[str] = Field(default=None, max_length=100)
    priority: Optional[TaskPriority] = None
    status: Optional[TaskStatus] = None
    assignee_user_id: Optional[str] = Field(default=None, max_length=36)
    start_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    target_metric_label: Optional[str] = Field(default=None, max_length=200)
    target_metric_value: Optional[float] = None
    metric_unit: Optional[str] = Field(default=None, max_length=50)
    feedback_required: Optional[bool] = None

    @field_validator("due_at")
    @classmethod
    def validate_due_at(cls, value: Optional[datetime]):
        return value.replace(tzinfo=None) if value and value.tzinfo else value

    @field_validator("start_at")
    @classmethod
    def validate_start_at(cls, value: Optional[datetime]):
        return value.replace(tzinfo=None) if value and value.tzinfo else value


class TaskStatusRequest(BaseModel):
    status: Literal["todo", "in_progress"]


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _week_end(week_start: date) -> date:
    return week_start + timedelta(days=6)


def _user_dict(user: Optional[User]) -> Optional[dict[str, Any]]:
    if not user:
        return None
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role,
        "is_active": user.is_active,
    }


def _goal_dict(goal: WeeklyGoal, task_counts: Optional[dict[str, int]] = None) -> dict[str, Any]:
    counts = task_counts or {}
    return {
        "id": goal.id,
        "title": goal.title,
        "description": goal.description,
        "week_start": goal.week_start.isoformat(),
        "week_end": goal.week_end.isoformat(),
        "status": goal.status,
        "role_targets": goal.role_targets or [],
        "task_count": counts.get("total", 0),
        "completed_task_count": counts.get("completed", 0),
        "created_by_user_id": goal.created_by_user_id,
        "created_at": goal.created_at.isoformat() if goal.created_at else None,
        "updated_at": goal.updated_at.isoformat() if goal.updated_at else None,
    }


def _timing_state(task: WorkTask, now: datetime) -> str:
    if task.status == "completed":
        return "completed"
    if task.status == "cancelled":
        return "cancelled"
    if task.due_at < now:
        return "overdue"
    if task.due_at.date() == now.date():
        return "due_today"
    if task.due_at <= now + timedelta(hours=24):
        return "due_soon"
    return "scheduled"


def _task_rank(task: WorkTask, now: datetime) -> tuple[Any, ...]:
    if task.status in {"completed", "cancelled"}:
        return (9, task.due_at, task.title)
    timing = _timing_state(task, now)
    timing_rank = {
        "overdue": 0,
        "due_today": 1,
        "due_soon": 2,
        "scheduled": 3,
    }.get(timing, 4)
    priority_rank = {"urgent": 0, "high": 1, "normal": 2, "low": 3}.get(task.priority, 2)
    status_rank = 0 if task.status == "in_progress" else 1
    return (timing_rank, priority_rank, status_rank, task.due_at, task.title)


def _task_dict(
    task: WorkTask,
    users: dict[str, User],
    goals: dict[str, WeeklyGoal],
    feedbacks: list[TaskFeedback],
    now: datetime,
    include_feedbacks: bool = False,
) -> dict[str, Any]:
    latest_feedback = feedbacks[-1] if feedbacks else None
    payload = {
        "id": task.id,
        "weekly_goal_id": task.weekly_goal_id,
        "weekly_goal": _goal_dict(goals[task.weekly_goal_id]) if task.weekly_goal_id in goals else None,
        "title": task.title,
        "description": task.description,
        "category": task.category,
        "priority": task.priority,
        "status": task.status,
        "timing_state": _timing_state(task, now),
        "assignee": _user_dict(users.get(task.assignee_user_id)),
        "created_by": _user_dict(users.get(task.created_by_user_id)),
        "start_at": task.start_at.isoformat() if task.start_at else None,
        "due_at": task.due_at.isoformat(),
        "target_metric_label": task.target_metric_label,
        "target_metric_value": task.target_metric_value,
        "metric_unit": task.metric_unit,
        "actual_metric_value": task.actual_metric_value,
        "feedback_required": task.feedback_required,
        "feedback_count": len(feedbacks),
        "latest_progress_percent": latest_feedback.progress_percent if latest_feedback else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }
    if include_feedbacks:
        payload["feedbacks"] = [
            {
                "id": feedback.id,
                "task_id": feedback.task_id,
                "user": _user_dict(users.get(feedback.user_id)),
                "feedback_type": feedback.feedback_type,
                "content": feedback.content,
                "attachments": feedback.attachments or [],
                "progress_percent": feedback.progress_percent,
                "actual_metric_value": feedback.actual_metric_value,
                "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
            }
            for feedback in feedbacks
        ]
    return payload


def _task_scope(query, user: User, mine_only: bool):
    if user.role not in {"admin", "manager"} or mine_only:
        return query.filter(WorkTask.assignee_user_id == user.id)
    return query


def _load_task_context(db: Session, tasks: list[WorkTask]):
    user_ids = {task.assignee_user_id for task in tasks} | {task.created_by_user_id for task in tasks}
    goal_ids = {task.weekly_goal_id for task in tasks if task.weekly_goal_id}
    task_ids = [task.id for task in tasks]
    users = {
        user.id: user for user in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    goals = {
        goal.id: goal for goal in db.query(WeeklyGoal).filter(WeeklyGoal.id.in_(goal_ids)).all()
    } if goal_ids else {}
    feedback_rows = (
        db.query(TaskFeedback)
        .filter(TaskFeedback.task_id.in_(task_ids))
        .order_by(TaskFeedback.created_at.asc())
        .all()
    ) if task_ids else []
    feedbacks: dict[str, list[TaskFeedback]] = defaultdict(list)
    for feedback in feedback_rows:
        feedbacks[feedback.task_id].append(feedback)
        if feedback.user_id not in users:
            feedback_user = db.query(User).filter(User.id == feedback.user_id).first()
            if feedback_user:
                users[feedback_user.id] = feedback_user
    return users, goals, feedbacks


@router.get("/assignees")
async def list_assignees(
    _: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    users = db.query(User).filter(User.is_active == True).order_by(User.display_name.asc()).all()
    return [_user_dict(user) for user in users]


@router.get("/goals")
async def list_weekly_goals(
    week_start: Optional[date] = None,
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(WeeklyGoal)
    if week_start:
        query = query.filter(WeeklyGoal.week_start == week_start)
    goals = query.order_by(WeeklyGoal.week_start.desc(), WeeklyGoal.created_at.desc()).all()
    task_rows = db.query(WorkTask.weekly_goal_id, WorkTask.status).filter(
        WorkTask.weekly_goal_id.in_([goal.id for goal in goals])
    ).all() if goals else []
    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "completed": 0})
    for goal_id, status in task_rows:
        counts[goal_id]["total"] += 1
        if status == "completed":
            counts[goal_id]["completed"] += 1
    return [_goal_dict(goal, counts.get(goal.id)) for goal in goals]


@router.post("/goals")
async def create_weekly_goal(
    payload: WeeklyGoalCreateRequest,
    manager: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    goal = WeeklyGoal(
        title=payload.title.strip(),
        description=_clean(payload.description),
        week_start=payload.week_start,
        week_end=_week_end(payload.week_start),
        status=payload.status,
        role_targets=[target.model_dump() for target in payload.role_targets],
        created_by_user_id=manager.id,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _goal_dict(goal)


@router.put("/goals/{goal_id}")
async def update_weekly_goal(
    goal_id: str,
    payload: WeeklyGoalUpdateRequest,
    _: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    goal = db.query(WeeklyGoal).filter(WeeklyGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="周目标不存在")
    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates:
        updates["title"] = updates["title"].strip()
    if "description" in updates:
        updates["description"] = _clean(updates["description"])
    if "week_start" in updates:
        updates["week_end"] = _week_end(updates["week_start"])
    if "role_targets" in updates and updates["role_targets"] is not None:
        updates["role_targets"] = [
            target.model_dump() if isinstance(target, RoleTarget) else target
            for target in payload.role_targets or []
        ]
    for field, value in updates.items():
        setattr(goal, field, value)
    db.commit()
    db.refresh(goal)
    return _goal_dict(goal)


@router.get("/summary")
async def task_summary(
    mine_only: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now()
    query = _task_scope(db.query(WorkTask), user, mine_only)
    tasks = query.all()
    active = [task for task in tasks if task.status not in {"completed", "cancelled"}]
    week_start = now.date() - timedelta(days=now.weekday())
    completed_this_week = sum(
        task.status == "completed"
        and task.completed_at is not None
        and task.completed_at.date() >= week_start
        for task in tasks
    )
    all_notifications = []
    for task in sorted(active, key=lambda item: _task_rank(item, now)):
        timing = _timing_state(task, now)
        if timing not in {"overdue", "due_today", "due_soon"} and task.priority not in {"urgent", "high"}:
            continue
        all_notifications.append({
            "task_id": task.id,
            "title": task.title,
            "priority": task.priority,
            "timing_state": timing,
            "due_at": task.due_at.isoformat(),
            "message": (
                "任务已逾期，请立即处理并提交反馈"
                if timing == "overdue"
                else "任务今天截止，请安排完成"
                if timing == "due_today"
                else "任务将在 24 小时内截止"
                if timing == "due_soon"
                else "高优先级任务待处理"
            ),
        })
    return {
        "total_active": len(active),
        "overdue": sum(_timing_state(task, now) == "overdue" for task in active),
        "due_today": sum(_timing_state(task, now) == "due_today" for task in active),
        "urgent_high": sum(task.priority in {"urgent", "high"} for task in active),
        "completed_this_week": completed_this_week,
        "notification_count": len(all_notifications),
        "notifications": all_notifications[:8],
    }


@router.get("")
async def list_tasks(
    mine_only: bool = False,
    status: Optional[str] = None,
    weekly_goal_id: Optional[str] = None,
    assignee_user_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = _task_scope(db.query(WorkTask), user, mine_only)
    if status:
        statuses = [item.strip() for item in status.split(",") if item.strip()]
        query = query.filter(WorkTask.status.in_(statuses))
    if weekly_goal_id:
        query = query.filter(WorkTask.weekly_goal_id == weekly_goal_id)
    if assignee_user_id and user.role in {"admin", "manager"}:
        query = query.filter(WorkTask.assignee_user_id == assignee_user_id)
    tasks = query.all()
    now = datetime.now()
    tasks.sort(key=lambda task: _task_rank(task, now))
    users, goals, feedbacks = _load_task_context(db, tasks)
    return [_task_dict(task, users, goals, feedbacks[task.id], now) for task in tasks]


@router.post("")
async def create_task(
    payload: WorkTaskCreateRequest,
    manager: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    assignee = db.query(User).filter(
        User.id == payload.assignee_user_id,
        User.is_active == True,
    ).first()
    if not assignee:
        raise HTTPException(status_code=422, detail="任务负责人不存在或已停用")
    if payload.weekly_goal_id and not db.query(WeeklyGoal).filter(WeeklyGoal.id == payload.weekly_goal_id).first():
        raise HTTPException(status_code=422, detail="选择的周目标不存在")
    if payload.start_at and payload.start_at > payload.due_at:
        raise HTTPException(status_code=422, detail="开始时间不能晚于截止时间")
    task = WorkTask(
        weekly_goal_id=payload.weekly_goal_id,
        title=payload.title.strip(),
        description=_clean(payload.description),
        category=_clean(payload.category),
        priority=payload.priority,
        status="todo",
        assignee_user_id=payload.assignee_user_id,
        created_by_user_id=manager.id,
        start_at=payload.start_at,
        due_at=payload.due_at,
        target_metric_label=_clean(payload.target_metric_label),
        target_metric_value=payload.target_metric_value,
        metric_unit=_clean(payload.metric_unit),
        feedback_required=payload.feedback_required,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    users, goals, feedbacks = _load_task_context(db, [task])
    return _task_dict(task, users, goals, feedbacks[task.id], datetime.now())


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(WorkTask).filter(WorkTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if user.role not in {"admin", "manager"} and task.assignee_user_id != user.id:
        raise HTTPException(status_code=403, detail="无权查看这个任务")
    users, goals, feedbacks = _load_task_context(db, [task])
    return _task_dict(task, users, goals, feedbacks[task.id], datetime.now(), include_feedbacks=True)


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    payload: WorkTaskUpdateRequest,
    _: User = Depends(require_manager),
    db: Session = Depends(get_db),
):
    task = db.query(WorkTask).filter(WorkTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    updates = payload.model_dump(exclude_unset=True)
    if "assignee_user_id" in updates:
        assignee = db.query(User).filter(User.id == updates["assignee_user_id"], User.is_active == True).first()
        if not assignee:
            raise HTTPException(status_code=422, detail="任务负责人不存在或已停用")
    if updates.get("weekly_goal_id") and not db.query(WeeklyGoal).filter(WeeklyGoal.id == updates["weekly_goal_id"]).first():
        raise HTTPException(status_code=422, detail="选择的周目标不存在")
    if "title" in updates:
        updates["title"] = updates["title"].strip()
    for field in ("description", "category", "target_metric_label", "metric_unit"):
        if field in updates:
            updates[field] = _clean(updates[field])
    if updates.get("status") == "completed":
        has_feedback = db.query(TaskFeedback).filter(TaskFeedback.task_id == task.id).first()
        if not has_feedback:
            raise HTTPException(status_code=422, detail="请先提交任务反馈再完成任务")
    start_at = updates.get("start_at", task.start_at)
    due_at = updates.get("due_at", task.due_at)
    if start_at and due_at and start_at > due_at:
        raise HTTPException(status_code=422, detail="开始时间不能晚于截止时间")
    for field, value in updates.items():
        setattr(task, field, value)
    if updates.get("status") == "completed":
        task.completed_at = datetime.now()
    elif "status" in updates and updates["status"] != "completed":
        task.completed_at = None
    db.commit()
    db.refresh(task)
    users, goals, feedbacks = _load_task_context(db, [task])
    return _task_dict(task, users, goals, feedbacks[task.id], datetime.now())


@router.post("/{task_id}/status")
async def update_task_status(
    task_id: str,
    payload: TaskStatusRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(WorkTask).filter(WorkTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if user.role not in {"admin", "manager"} and task.assignee_user_id != user.id:
        raise HTTPException(status_code=403, detail="无权更新这个任务")
    task.status = payload.status
    task.completed_at = None
    db.commit()
    db.refresh(task)
    users, goals, feedbacks = _load_task_context(db, [task])
    return _task_dict(task, users, goals, feedbacks[task.id], datetime.now())


@router.post("/{task_id}/feedback")
async def submit_task_feedback(
    task_id: str,
    content: Optional[str] = Form(None, max_length=10000),
    progress_percent: Optional[int] = Form(None, ge=0, le=100),
    actual_metric_value: Optional[float] = Form(None),
    complete: bool = Form(False),
    files: list[UploadFile] = File(default=[]),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(WorkTask).filter(WorkTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if user.role not in {"admin", "manager"} and task.assignee_user_id != user.id:
        raise HTTPException(status_code=403, detail="无权提交这个任务的反馈")
    cleaned_content = _clean(content)
    if not cleaned_content and not files:
        raise HTTPException(status_code=422, detail="请填写反馈内容或上传反馈附件")
    attachments = await save_uploads(files)
    feedback = TaskFeedback(
        task_id=task.id,
        user_id=user.id,
        feedback_type="completion" if complete else "progress",
        content=cleaned_content,
        attachments=attachments,
        progress_percent=100 if complete else progress_percent,
        actual_metric_value=actual_metric_value,
    )
    db.add(feedback)
    if actual_metric_value is not None:
        task.actual_metric_value = actual_metric_value
    if complete:
        task.status = "completed"
        task.completed_at = datetime.now()
    elif task.status == "todo":
        task.status = "in_progress"
    db.commit()
    db.refresh(task)
    users, goals, feedbacks = _load_task_context(db, [task])
    return _task_dict(task, users, goals, feedbacks[task.id], datetime.now(), include_feedbacks=True)
