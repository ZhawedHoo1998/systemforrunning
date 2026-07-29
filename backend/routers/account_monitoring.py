from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.account_monitor import monitor_owned_account, monitor_schedule_status
from backend.auth import get_current_user, require_account_query_operator
from backend.database import get_db
from backend.models import (
    CreatorAccount,
    CreatorAccountMonitorRun,
    CreatorPerformanceAlert,
    CreatorPerformanceAlertReceipt,
    User,
)


router = APIRouter(prefix="/api/account-monitoring", tags=["account-monitoring"])


class AlertsSeenRequest(BaseModel):
    alert_ids: list[str] = Field(min_length=1, max_length=100)


def _run_to_dict(run: CreatorAccountMonitorRun | None) -> dict[str, Any] | None:
    if not run:
        return None
    return {
        "id": run.id,
        "account_id": run.creator_account_id,
        "monitor_date": run.monitor_date.isoformat(),
        "status": run.status,
        "data_source": run.data_source,
        "pages_fetched": run.pages_fetched or 0,
        "notes_checked": run.notes_checked or 0,
        "analysis": run.analysis or {},
        "error": run.error,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }


@router.get("/status")
async def get_monitoring_status(
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    accounts = db.query(CreatorAccount).filter(
        CreatorAccount.account_kind == "owned",
        CreatorAccount.is_active == True,
    ).order_by(CreatorAccount.name.asc()).all()
    items = []
    for account in accounts:
        latest = db.query(CreatorAccountMonitorRun).filter(
            CreatorAccountMonitorRun.creator_account_id == account.id
        ).order_by(CreatorAccountMonitorRun.monitor_date.desc()).first()
        items.append({
            "account_id": account.id,
            "account_name": account.name,
            "latest_run": _run_to_dict(latest),
        })
    return {"schedule": monitor_schedule_status(), "accounts": items}


@router.post("/run/{account_id}")
async def run_account_monitoring(
    account_id: str,
    _: User = Depends(require_account_query_operator),
):
    return await monitor_owned_account(account_id, force=True)


@router.get("/alerts")
async def get_performance_alerts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role != "writer":
        return {"count": 0, "items": []}
    rows = db.query(
        CreatorPerformanceAlertReceipt,
        CreatorPerformanceAlert,
        CreatorAccount,
    ).join(
        CreatorPerformanceAlert,
        CreatorPerformanceAlert.id == CreatorPerformanceAlertReceipt.alert_id,
    ).join(
        CreatorAccount,
        CreatorAccount.id == CreatorPerformanceAlert.creator_account_id,
    ).filter(
        CreatorPerformanceAlertReceipt.user_id == user.id,
        CreatorPerformanceAlertReceipt.seen_at.is_(None),
    ).order_by(CreatorPerformanceAlert.created_at.desc()).limit(20).all()
    return {
        "count": len(rows),
        "items": [{
            "id": alert.id,
            "account_id": alert.creator_account_id,
            "account_name": account.name,
            "note_id": alert.xhs_note_id,
            "title": alert.title,
            "message": alert.message,
            "source_url": alert.source_url,
            "metrics": alert.metrics or {},
            "created_at": alert.created_at.isoformat(),
        } for _, alert, account in rows],
    }


@router.post("/alerts/seen")
async def mark_performance_alerts_seen(
    payload: AlertsSeenRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    receipts = db.query(CreatorPerformanceAlertReceipt).filter(
        CreatorPerformanceAlertReceipt.user_id == user.id,
        CreatorPerformanceAlertReceipt.alert_id.in_(payload.alert_ids),
    ).all()
    for receipt in receipts:
        receipt.seen_at = now
    db.commit()
    return {"status": "ok", "seen_count": len(receipts)}
