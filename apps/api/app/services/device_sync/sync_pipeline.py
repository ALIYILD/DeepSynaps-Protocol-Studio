"""Sync pipeline — orchestrates pull -> normalize -> store cycle.

Entry point: ``sync_connection(connection_id, db)``
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .adapter_registry import get_adapter, is_demo_mode
from .base_adapter import SyncResult
from .demo_data_generator import generate_sync_events

_logger = logging.getLogger(__name__)


def _import_models():
    """Lazy import to avoid circular dependencies."""
    from app.persistence.models import (
        DeviceConnection,
        DeviceSyncEvent,
        WearableDailySummary,
        WearableObservation,
    )
    return DeviceConnection, DeviceSyncEvent, WearableDailySummary, WearableObservation


def sync_connection(connection_id: str, db: Session) -> SyncResult:
    """Run a full sync cycle for a device connection.

    1. Load DeviceConnection
    2. Resolve adapter by source slug
    3. Fetch daily summaries since last_sync_at (or 30 days)
    4. Upsert into WearableDailySummary
    5. Fetch observations
    6. Insert into WearableObservation
    7. Log DeviceSyncEvent
    8. Update connection.last_sync_at
    9. Run wearable flag checks
    """
    DeviceConnection, DeviceSyncEvent, WearableDailySummary, WearableObservation = _import_models()

    conn = db.query(DeviceConnection).filter_by(id=connection_id).first()
    if conn is None:
        return SyncResult(success=False, error="Connection not found")

    try:
        adapter = get_adapter(conn.source)
    except KeyError:
        return SyncResult(success=False, error=f"No adapter for source: {conn.source}")

    demo = is_demo_mode(conn.source)
    access_token = conn.access_token_enc or ""

    # Date range: last_sync_at -> now, or default 30 days
    now = datetime.now(timezone.utc)
    if conn.last_sync_at:
        date_from = conn.last_sync_at.strftime("%Y-%m-%d")
    else:
        date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    date_to = now.strftime("%Y-%m-%d")

    # ── Fetch and upsert daily summaries ──────────────────────────────────
    summaries = adapter.fetch_daily_summary(
        access_token=access_token,
        date_from=date_from,
        date_to=date_to,
        patient_id=conn.patient_id,
    )
    summaries_upserted = 0
    for s in summaries:
        existing = (
            db.query(WearableDailySummary)
            .filter_by(patient_id=conn.patient_id, source=conn.source, date=s.date)
            .first()
        )
        if existing:
            for field in (
                "rhr_bpm", "hrv_ms", "sleep_duration_h", "sleep_consistency_score",
                "steps", "spo2_pct", "skin_temp_delta", "readiness_score",
                "mood_score", "pain_score", "anxiety_score",
            ):
                val = getattr(s, field, None)
                if val is not None:
                    setattr(existing, field, val)
            existing.synced_at = now
        else:
            db.add(WearableDailySummary(
                id=str(uuid.uuid4()),
                patient_id=conn.patient_id,
                source=conn.source,
                date=s.date,
                rhr_bpm=s.rhr_bpm,
                hrv_ms=s.hrv_ms,
                sleep_duration_h=s.sleep_duration_h,
                sleep_consistency_score=s.sleep_consistency_score,
                steps=s.steps,
                spo2_pct=s.spo2_pct,
                skin_temp_delta=s.skin_temp_delta,
                readiness_score=s.readiness_score,
                mood_score=s.mood_score,
                pain_score=s.pain_score,
                anxiety_score=s.anxiety_score,
                synced_at=now,
            ))
        summaries_upserted += 1

    # ── Fetch and insert observations ─────────────────────────────────────
    observations = adapter.fetch_observations(
        access_token=access_token,
        date_from=date_from,
        date_to=date_to,
        patient_id=conn.patient_id,
    )
    obs_inserted = 0
    for o in observations:
        db.add(WearableObservation(
            id=str(uuid.uuid4()),
            patient_id=conn.patient_id,
            connection_id=conn.id,
            source=conn.source,
            source_type=conn.source_type,
            metric_type=o.metric_type,
            value=o.value,
            value_text=o.value_text,
            unit=o.unit,
            observed_at=datetime.fromisoformat(o.observed_at) if o.observed_at else now,
            aggregation_window=o.aggregation_window,
            quality_flag=o.quality_flag,
            synced_at=now,
        ))
        obs_inserted += 1

    # ── Log sync event ────────────────────────────────────────────────────
    db.add(DeviceSyncEvent(
        id=str(uuid.uuid4()),
        patient_id=conn.patient_id,
        event_type="sync_completed",
        event_data=json.dumps({
            "summaries_upserted": summaries_upserted,
            "observations_inserted": obs_inserted,
            "demo_mode": demo,
        }),
        source="vendor_api" if not demo else "manual",
        occurred_at=now,
        synced_at=now,
    ))

    # ── Update connection ─────────────────────────────────────────────────
    conn.last_sync_at = now
    conn.status = "connected"
    conn.updated_at = now

    db.commit()

    # ── Run flag checks (best-effort) ─────────────────────────────────────
    try:
        from app.services.wearable_flags import run_flag_checks
        run_flag_checks(conn.patient_id, None, db)
    except Exception:
        _logger.warning("Flag checks failed for patient %s", conn.patient_id, exc_info=True)

    return SyncResult(
        success=True,
        summaries_upserted=summaries_upserted,
        observations_inserted=obs_inserted,
        demo_mode=demo,
    )


def get_device_dashboard_data(
    connection_id: str,
    db: Session,
    days: int = 30,
) -> dict:
    """Aggregate data for a per-device dashboard view."""
    DeviceConnection, DeviceSyncEvent, WearableDailySummary, WearableObservation = _import_models()

    conn = db.query(DeviceConnection).filter_by(id=connection_id).first()
    if conn is None:
        return {"error": "Connection not found"}

    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    demo = is_demo_mode(conn.source)

    # Daily summaries
    summaries = (
        db.query(WearableDailySummary)
        .filter(
            WearableDailySummary.patient_id == conn.patient_id,
            WearableDailySummary.source == conn.source,
            WearableDailySummary.date >= cutoff,
        )
        .order_by(WearableDailySummary.date.asc())
        .all()
    )

    # If no real data and demo mode, generate in-memory
    if not summaries and demo:
        from .demo_data_generator import generate_daily_summaries
        date_from = cutoff
        date_to = now.strftime("%Y-%m-%d")
        demo_summaries = generate_daily_summaries(conn.source, conn.patient_id, date_from, date_to)
        daily = [
            {
                "date": s.date, "rhr_bpm": s.rhr_bpm, "hrv_ms": s.hrv_ms,
                "sleep_duration_h": s.sleep_duration_h, "steps": s.steps,
                "spo2_pct": s.spo2_pct, "skin_temp_delta": s.skin_temp_delta,
                "readiness_score": s.readiness_score, "mood_score": s.mood_score,
            }
            for s in demo_summaries
        ]
    else:
        daily = [
            {
                "date": s.date, "rhr_bpm": s.rhr_bpm, "hrv_ms": s.hrv_ms,
                "sleep_duration_h": s.sleep_duration_h, "steps": s.steps,
                "spo2_pct": s.spo2_pct, "skin_temp_delta": s.skin_temp_delta,
                "readiness_score": s.readiness_score, "mood_score": s.mood_score,
            }
            for s in summaries
        ]

    # Sync history
    sync_events = (
        db.query(DeviceSyncEvent)
        .filter(DeviceSyncEvent.patient_id == conn.patient_id)
        .order_by(DeviceSyncEvent.occurred_at.desc())
        .limit(20)
        .all()
    )

    if not sync_events and demo:
        history = generate_sync_events(conn.source, conn.patient_id)
    else:
        history = [
            {
                "event_type": e.event_type,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
                "source": e.source,
                "event_data": e.event_data,
            }
            for e in sync_events
        ]

    # Latest values
    latest = daily[-1] if daily else {}

    return {
        "connection": {
            "id": conn.id,
            "source": conn.source,
            "source_type": conn.source_type,
            "display_name": conn.display_name,
            "status": conn.status,
            "connected_at": conn.connected_at.isoformat() if conn.connected_at else None,
            "last_sync_at": conn.last_sync_at.isoformat() if conn.last_sync_at else None,
        },
        "daily_summaries": daily,
        "latest": latest,
        "sync_history": history,
        "demo_mode": demo,
        "days": days,
    }
