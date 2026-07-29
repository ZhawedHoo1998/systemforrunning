import asyncio
import logging
import math
import os
from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from backend.database import SessionLocal
from backend.models import (
    CreatorAccount,
    CreatorAccountMonitorRun,
    CreatorAccountNote,
    CreatorAccountNoteSnapshot,
    CreatorAccountSnapshot,
    CreatorPerformanceAlert,
    CreatorPerformanceAlertReceipt,
    User,
)
from backend.routers.creator_accounts import sync_account


logger = logging.getLogger(__name__)
METRIC_FIELDS = ("liked_count", "collected_count", "comment_count", "share_count")


def _bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(value, maximum))


def _monitor_timezone() -> ZoneInfo:
    name = os.getenv("XHS_OWNED_MONITOR_TIMEZONE", "Asia/Shanghai").strip() or "Asia/Shanghai"
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Asia/Shanghai")


def _monitor_enabled() -> bool:
    return os.getenv("XHS_OWNED_MONITOR_ENABLED", "true").strip().lower() in {"1", "true", "yes"}


def _monitor_source() -> str:
    source = os.getenv("XHS_OWNED_MONITOR_SOURCE", "auto").strip().lower()
    return source if source in {"auto", "cli", "tikhub"} else "auto"


def _as_utc(value: datetime | None = None) -> datetime:
    current = value or datetime.utcnow()
    if current.tzinfo is None:
        return current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc)


def _naive_utc(value: datetime) -> datetime:
    return _as_utc(value).replace(tzinfo=None)


def monitor_schedule_status(now_utc: datetime | None = None) -> dict[str, Any]:
    timezone_info = _monitor_timezone()
    hour = _bounded_int("XHS_OWNED_MONITOR_HOUR", 9, 0, 23)
    now_local = _as_utc(now_utc).astimezone(timezone_info)
    next_run = now_local.replace(hour=hour, minute=0, second=0, microsecond=0)
    if next_run <= now_local:
        next_run += timedelta(days=1)
    source = _monitor_source()
    return {
        "enabled": _monitor_enabled(),
        "timezone": str(timezone_info),
        "hour": hour,
        "time_label": f"每天 {hour:02d}:00",
        "max_pages": _bounded_int("XHS_OWNED_MONITOR_MAX_PAGES", 3, 1, 10),
        "source": source,
        "strategy": "tikhub_metrics_cli_fallback" if source == "auto" else f"{source}_only",
        "window_days": 7,
        "detail_notes": 0,
        "next_run_at": next_run.isoformat(),
    }


def _interaction_total(metrics: dict[str, Any]) -> int:
    return sum(max(0, int(metrics.get(field) or 0)) for field in METRIC_FIELDS)


def build_seven_day_analysis(
    current_notes: list[dict[str, Any]],
    historical_notes: list[dict[str, Any]],
    previous_metrics: dict[str, dict[str, int]],
    now_utc: datetime,
    *,
    followers: int = 0,
    follower_delta: int = 0,
) -> dict[str, Any]:
    now = _naive_utc(now_utc)
    window_start = now - timedelta(days=7)
    baseline_start = now - timedelta(days=37)

    recent = [
        note for note in current_notes
        if isinstance(note.get("published_at"), datetime)
        and note["published_at"] >= window_start
    ]
    baseline = [
        note for note in historical_notes
        if isinstance(note.get("published_at"), datetime)
        and baseline_start <= note["published_at"] < window_start
    ]
    if len(baseline) < 5:
        baseline = [
            note for note in historical_notes
            if isinstance(note.get("published_at"), datetime)
            and note["published_at"] < window_start
        ]

    baseline_totals = [_interaction_total(note) for note in baseline]
    if not baseline_totals:
        baseline_totals = [_interaction_total(note) for note in recent]
    baseline_median = float(median(baseline_totals)) if baseline_totals else 0.0
    high_threshold = max(15, math.ceil(baseline_median * 1.5))
    growth_threshold = max(8, math.ceil(high_threshold * 0.25))

    totals = {field: 0 for field in METRIC_FIELDS}
    deltas = {field: 0 for field in METRIC_FIELDS}
    ranked_notes: list[dict[str, Any]] = []
    for note in recent:
        note_id = str(note.get("id") or "")
        metrics = {field: max(0, int(note.get(field) or 0)) for field in METRIC_FIELDS}
        previous = previous_metrics.get(note_id)
        metric_delta = {
            field: max(0, metrics[field] - int((previous or {}).get(field) or 0))
            if previous is not None else 0
            for field in METRIC_FIELDS
        }
        for field in METRIC_FIELDS:
            totals[field] += metrics[field]
            deltas[field] += metric_delta[field]

        interactions = _interaction_total(metrics)
        interaction_delta = _interaction_total(metric_delta)
        previous_interactions = _interaction_total(previous or {})
        is_high_performing = interactions >= high_threshold and (
            metrics["liked_count"] + metrics["collected_count"] >= 8
        )
        should_alert = is_high_performing and (
            previous is None
            or previous_interactions < high_threshold <= interactions
            or interaction_delta >= growth_threshold
        )
        ranked_notes.append({
            "id": note_id,
            "title": note.get("title") or "无标题笔记",
            "source_url": note.get("source_url") or f"https://www.xiaohongshu.com/explore/{note_id}",
            "published_at": note["published_at"].isoformat(),
            **metrics,
            "interactions": interactions,
            "delta": {**metric_delta, "interactions": interaction_delta},
            "is_high_performing": is_high_performing,
            "should_alert": should_alert,
        })

    ranked_notes.sort(
        key=lambda note: (
            note["is_high_performing"],
            note["interactions"],
            note["delta"]["interactions"],
        ),
        reverse=True,
    )
    interactions = sum(totals.values())
    interaction_delta = sum(deltas.values())
    count = len(recent)
    return {
        "version": 1,
        "window_days": 7,
        "window_start": window_start.isoformat(),
        "window_end": now.isoformat(),
        "post_count": count,
        "followers": max(0, int(followers or 0)),
        "follower_delta": int(follower_delta or 0),
        "totals": {**totals, "interactions": interactions},
        "deltas": {**deltas, "interactions": interaction_delta},
        "averages": {
            **{field: round(totals[field] / count, 1) if count else 0 for field in METRIC_FIELDS},
            "interactions": round(interactions / count, 1) if count else 0,
        },
        "baseline_median_interactions": round(baseline_median, 1),
        "high_performance_threshold": high_threshold,
        "growth_alert_threshold": growth_threshold,
        "high_performing_count": sum(note["is_high_performing"] for note in ranked_notes),
        "high_performing_notes": [note for note in ranked_notes if note["is_high_performing"]][:5],
        "top_notes": ranked_notes[:5],
    }


def _clear_monitor_run_data(db, run_id: str) -> None:
    alert_ids = [
        alert_id for (alert_id,) in db.query(CreatorPerformanceAlert.id).filter(
            CreatorPerformanceAlert.monitor_run_id == run_id
        ).all()
    ]
    if alert_ids:
        db.query(CreatorPerformanceAlertReceipt).filter(
            CreatorPerformanceAlertReceipt.alert_id.in_(alert_ids)
        ).delete(synchronize_session=False)
    db.query(CreatorPerformanceAlert).filter(
        CreatorPerformanceAlert.monitor_run_id == run_id
    ).delete(synchronize_session=False)
    db.query(CreatorAccountNoteSnapshot).filter(
        CreatorAccountNoteSnapshot.monitor_run_id == run_id
    ).delete(synchronize_session=False)


def _serialize_run(run: CreatorAccountMonitorRun) -> dict[str, Any]:
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


async def monitor_owned_account(
    account_id: str,
    *,
    monitor_date: date | None = None,
    force: bool = False,
) -> dict[str, Any]:
    now_utc = datetime.utcnow()
    local_date = monitor_date or _as_utc(now_utc).astimezone(_monitor_timezone()).date()
    with SessionLocal() as db:
        account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
        if not account:
            raise HTTPException(status_code=404, detail="监测账号不存在")
        if account.account_kind != "owned":
            raise HTTPException(status_code=422, detail="每日监测只适用于自有账号")
        if not account.is_active:
            raise HTTPException(status_code=422, detail="停用账号不会执行每日监测")

        run = db.query(CreatorAccountMonitorRun).filter(
            CreatorAccountMonitorRun.creator_account_id == account_id,
            CreatorAccountMonitorRun.monitor_date == local_date,
        ).first()
        if run and run.status == "success" and not force:
            return _serialize_run(run)
        if run and run.status == "running" and not force:
            stale_before = now_utc - timedelta(hours=2)
            if run.started_at and run.started_at > stale_before:
                return _serialize_run(run)
        if run:
            _clear_monitor_run_data(db, run.id)
            run.status = "running"
            run.error = None
            run.analysis = {}
            run.pages_fetched = 0
            run.notes_checked = 0
            run.started_at = now_utc
            run.completed_at = None
        else:
            run = CreatorAccountMonitorRun(
                creator_account_id=account_id,
                monitor_date=local_date,
                status="running",
                started_at=now_utc,
            )
            db.add(run)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.query(CreatorAccountMonitorRun).filter(
                CreatorAccountMonitorRun.creator_account_id == account_id,
                CreatorAccountMonitorRun.monitor_date == local_date,
            ).first()
            if existing:
                return _serialize_run(existing)
            raise
        db.refresh(run)
        run_id = run.id

    try:
        with SessionLocal() as db:
            account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
            if not account:
                raise HTTPException(status_code=404, detail="监测账号不存在")
            monitor_source = _monitor_source()
            await sync_account(
                account,
                db,
                monitor_source,
                _bounded_int("XHS_OWNED_MONITOR_MAX_PAGES", 3, 1, 10),
                monitor_run_id=run_id,
                detail_notes=0,
                preferred_source="tikhub" if monitor_source == "auto" else None,
                published_since=now_utc - timedelta(days=7),
            )

        with SessionLocal() as db:
            run = db.query(CreatorAccountMonitorRun).filter(
                CreatorAccountMonitorRun.id == run_id
            ).first()
            account = db.query(CreatorAccount).filter(CreatorAccount.id == account_id).first()
            if not run or not account:
                raise HTTPException(status_code=404, detail="监测记录不存在")

            current_snapshots = db.query(CreatorAccountNoteSnapshot).filter(
                CreatorAccountNoteSnapshot.monitor_run_id == run_id
            ).all()
            note_ids = [snapshot.xhs_note_id for snapshot in current_snapshots]
            note_rows = db.query(CreatorAccountNote).filter(
                CreatorAccountNote.creator_account_id == account_id,
                CreatorAccountNote.xhs_note_id.in_(note_ids),
                CreatorAccountNote.is_private == False,
            ).all() if note_ids else []
            snapshot_by_note = {snapshot.xhs_note_id: snapshot for snapshot in current_snapshots}
            current_notes = [{
                "id": note.xhs_note_id,
                "title": note.title,
                "source_url": note.source_url,
                "published_at": note.published_at,
                **{
                    field: int(getattr(snapshot_by_note[note.xhs_note_id], field) or 0)
                    for field in METRIC_FIELDS
                },
            } for note in note_rows if note.xhs_note_id in snapshot_by_note]

            previous_rows = db.query(CreatorAccountNoteSnapshot).join(
                CreatorAccountMonitorRun,
                CreatorAccountMonitorRun.id == CreatorAccountNoteSnapshot.monitor_run_id,
            ).filter(
                CreatorAccountNoteSnapshot.creator_account_id == account_id,
                CreatorAccountNoteSnapshot.xhs_note_id.in_(note_ids),
                CreatorAccountNoteSnapshot.monitor_run_id != run_id,
                CreatorAccountMonitorRun.status == "success",
            ).order_by(CreatorAccountNoteSnapshot.captured_at.desc()).all() if note_ids else []
            previous_metrics: dict[str, dict[str, int]] = {}
            for snapshot in previous_rows:
                if snapshot.xhs_note_id in previous_metrics:
                    continue
                previous_metrics[snapshot.xhs_note_id] = {
                    field: int(getattr(snapshot, field) or 0) for field in METRIC_FIELDS
                }

            historical_rows = db.query(CreatorAccountNote).filter(
                CreatorAccountNote.creator_account_id == account_id,
                CreatorAccountNote.is_private == False,
            ).all()
            historical_notes = [{
                "id": note.xhs_note_id,
                "published_at": note.published_at,
                **{field: int(getattr(note, field) or 0) for field in METRIC_FIELDS},
            } for note in historical_rows]
            account_snapshots = db.query(CreatorAccountSnapshot).filter(
                CreatorAccountSnapshot.creator_account_id == account_id
            ).order_by(CreatorAccountSnapshot.fetched_at.desc()).limit(2).all()
            followers = account_snapshots[0].followers if account_snapshots else 0
            follower_delta = (
                followers - account_snapshots[1].followers
                if len(account_snapshots) > 1 else 0
            )
            analysis = build_seven_day_analysis(
                current_notes,
                historical_notes,
                previous_metrics,
                now_utc,
                followers=followers,
                follower_delta=follower_delta,
            )
            oldest_checked = min(
                (note["published_at"] for note in current_notes if note.get("published_at")),
                default=None,
            )
            window_start = datetime.fromisoformat(analysis["window_start"])
            analysis.update({
                "last_run_at": now_utc.isoformat(),
                "data_source": account.last_sync_source,
                "pages_fetched": int((account.analysis or {}).get("pages_fetched") or 0),
                "notes_checked": len(current_snapshots),
                "collection_strategy": (
                    "tikhub_metrics" if account.last_sync_source == "tikhub" else "cli_fallback"
                ),
                "detail_requests": 0,
                "coverage_complete": bool(
                    (account.analysis or {}).get("window_covered")
                    or not (account.analysis or {}).get("has_more")
                    or (oldest_checked and oldest_checked <= window_start)
                ),
            })

            alert_candidates = [
                note for note in analysis["high_performing_notes"] if note["should_alert"]
            ][:3]
            writers = db.query(User).filter(User.role == "writer", User.is_active == True).all()
            for note in alert_candidates:
                delta = note["delta"]
                alert = CreatorPerformanceAlert(
                    creator_account_id=account_id,
                    monitor_run_id=run_id,
                    xhs_note_id=note["id"],
                    title=f"高表现笔记：{note['title']}",
                    message=(
                        f"近 7 天表现突出：赞 {note['liked_count']}、藏 {note['collected_count']}、"
                        f"互动 {note['interactions']}；较上次监测新增互动 {delta['interactions']}。"
                    ),
                    source_url=note["source_url"],
                    metrics=note,
                    created_at=now_utc,
                )
                db.add(alert)
                db.flush()
                for writer in writers:
                    db.add(CreatorPerformanceAlertReceipt(
                        alert_id=alert.id,
                        user_id=writer.id,
                        created_at=now_utc,
                    ))

            analysis["generated_alert_count"] = len(alert_candidates)
            account.analysis = {**(account.analysis or {}), "monitoring_7d": analysis}
            run.status = "success"
            run.data_source = account.last_sync_source
            run.pages_fetched = analysis["pages_fetched"]
            run.notes_checked = len(current_snapshots)
            run.analysis = analysis
            run.error = None
            run.completed_at = now_utc
            db.commit()
            db.refresh(run)
            return _serialize_run(run)
    except Exception as error:
        with SessionLocal() as db:
            run = db.query(CreatorAccountMonitorRun).filter(
                CreatorAccountMonitorRun.id == run_id
            ).first()
            if run:
                run.status = "failed"
                run.error = str(getattr(error, "detail", error))[:2000]
                run.completed_at = datetime.utcnow()
                db.commit()
        raise


async def run_due_owned_account_monitors(*, force: bool = False) -> list[dict[str, Any]]:
    if not _monitor_enabled() and not force:
        return []
    now_local = datetime.now(_monitor_timezone())
    monitor_hour = _bounded_int("XHS_OWNED_MONITOR_HOUR", 9, 0, 23)
    if not force and now_local.hour < monitor_hour:
        return []
    with SessionLocal() as db:
        account_ids = [
            account_id for (account_id,) in db.query(CreatorAccount.id).filter(
                CreatorAccount.account_kind == "owned",
                CreatorAccount.is_active == True,
            ).all()
        ]
    results = []
    for account_id in account_ids:
        try:
            results.append(await monitor_owned_account(account_id, force=force))
        except Exception:
            logger.exception("Owned account monitoring failed for %s", account_id)
    return results


async def account_monitor_scheduler(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            await run_due_owned_account_monitors()
        except Exception:
            logger.exception("Daily owned-account monitoring cycle failed")
        schedule = monitor_schedule_status()
        next_run = datetime.fromisoformat(schedule["next_run_at"])
        now_local = datetime.now(_monitor_timezone())
        seconds_until_run = max(60.0, (next_run - now_local).total_seconds())
        timeout = min(seconds_until_run, 30 * 60)
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass
