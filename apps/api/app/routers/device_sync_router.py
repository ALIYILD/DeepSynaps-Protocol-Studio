"""Device sync router — OAuth flows, sync triggers, and per-device dashboards.

Prefix: /api/v1/device-sync
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import get_db_session
from app.errors import ApiServiceError
from app.services.device_sync.adapter_registry import (
    get_adapter,
    is_demo_mode,
    list_adapters,
)
from app.services.device_sync.oauth_manager import (
    build_authorize_url,
    exchange_code,
)
from app.services.device_sync.sync_pipeline import (
    get_device_dashboard_data,
    sync_connection,
)

router = APIRouter(prefix="/api/v1/device-sync", tags=["Device Sync"])
_logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _require_clinician(actor: AuthenticatedActor) -> None:
    if actor.role not in ("clinician", "admin", "supervisor", "reviewer", "technician"):
        raise ApiServiceError(
            code="forbidden", message="Clinician access required.", status_code=403
        )


# ── Response schemas ───────────────────────────────────────────────────────────

class ProviderOut(BaseModel):
    provider_id: str
    display_name: str
    supported_metrics: list[str]
    demo_mode: bool
    oauth_required: bool


class ProviderListOut(BaseModel):
    providers: list[ProviderOut]


class AuthorizeUrlOut(BaseModel):
    url: str
    state: str
    demo_mode: bool


class SyncResultOut(BaseModel):
    success: bool
    summaries_upserted: int = 0
    observations_inserted: int = 0
    error: Optional[str] = None
    demo_mode: bool = False


class DashboardOut(BaseModel):
    connection: dict
    daily_summaries: list[dict]
    latest: dict
    sync_history: list[dict]
    demo_mode: bool
    days: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/providers", response_model=ProviderListOut)
def list_providers(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProviderListOut:
    """List all available sync providers with their capabilities."""
    _require_clinician(actor)
    adapters = list_adapters()
    providers = []
    for pid, adapter in adapters.items():
        providers.append(ProviderOut(
            provider_id=pid,
            display_name=adapter.display_name,
            supported_metrics=adapter.supported_metrics,
            demo_mode=is_demo_mode(pid),
            oauth_required=adapter.oauth_config is not None,
        ))
    return ProviderListOut(providers=providers)


@router.get("/oauth/{provider}/authorize", response_model=AuthorizeUrlOut)
def get_oauth_authorize_url(
    provider: str,
    redirect_uri: str = Query(default=""),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AuthorizeUrlOut:
    """Get the OAuth2 authorization URL for a provider."""
    _require_clinician(actor)
    try:
        result = build_authorize_url(provider, redirect_uri=redirect_uri)
    except KeyError:
        raise ApiServiceError(
            code="unknown_provider",
            message=f"Unknown provider: {provider}",
            status_code=404,
        )
    return AuthorizeUrlOut(**result)


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    code: str = Query(default=""),
    state: str = Query(default=""),
    patient_id: str = Query(default=""),
    db: Session = Depends(get_db_session),
) -> dict:
    """OAuth callback — exchanges code for tokens and stores connection."""
    import uuid
    from datetime import datetime, timezone

    from app.persistence.models import DeviceConnection

    try:
        tokens = exchange_code(provider, code=code, redirect_uri="")
    except KeyError:
        raise ApiServiceError(
            code="unknown_provider",
            message=f"Unknown provider: {provider}",
            status_code=404,
        )

    # Create or update the device connection
    conn = (
        db.query(DeviceConnection)
        .filter_by(patient_id=patient_id, source=provider)
        .first()
    )
    now = datetime.now(timezone.utc)
    if conn is None:
        adapter = get_adapter(provider)
        conn = DeviceConnection(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            source=provider,
            source_type="wearable",
            display_name=adapter.display_name,
            status="connected",
            consent_given=True,
            consent_given_at=now,
            connected_at=now,
            access_token_enc=tokens.access_token,
            refresh_token_enc=tokens.refresh_token or "",
            scope=tokens.scope or "",
            created_at=now,
        )
        db.add(conn)
    else:
        conn.access_token_enc = tokens.access_token
        conn.refresh_token_enc = tokens.refresh_token or ""
        conn.scope = tokens.scope or ""
        conn.status = "connected"
        conn.updated_at = now

    db.commit()
    db.refresh(conn)

    return {
        "connection_id": conn.id,
        "provider": provider,
        "status": "connected",
        "demo_mode": is_demo_mode(provider),
    }


@router.get("/{connection_id}/dashboard", response_model=DashboardOut)
def device_dashboard(
    connection_id: str,
    days: int = Query(default=30, ge=1, le=365),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> DashboardOut:
    """Per-device dashboard data: daily summaries, sync history, latest values."""
    _require_clinician(actor)
    data = get_device_dashboard_data(connection_id, db, days=days)
    if "error" in data:
        raise ApiServiceError(
            code="not_found", message=data["error"], status_code=404
        )
    return DashboardOut(**data)


@router.get("/{connection_id}/history")
def device_sync_history(
    connection_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Paginated sync event log for a connection."""
    _require_clinician(actor)

    from app.persistence.models import DeviceConnection, DeviceSyncEvent
    from app.services.device_sync.demo_data_generator import generate_sync_events

    conn = db.query(DeviceConnection).filter_by(id=connection_id).first()
    if conn is None:
        raise ApiServiceError(code="not_found", message="Connection not found.", status_code=404)

    events = (
        db.query(DeviceSyncEvent)
        .filter(DeviceSyncEvent.patient_id == conn.patient_id)
        .order_by(DeviceSyncEvent.occurred_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    if not events and is_demo_mode(conn.source):
        demo_events = generate_sync_events(conn.source, conn.patient_id, count=limit)
        return {"items": demo_events[offset:offset + limit], "total": len(demo_events)}

    return {
        "items": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
                "source": e.source,
                "event_data": e.event_data,
            }
            for e in events
        ],
        "total": len(events),
    }


@router.get("/{connection_id}/timeseries")
def device_timeseries(
    connection_id: str,
    metric: str = Query(default="heart_rate"),
    date_from: str = Query(default=""),
    date_to: str = Query(default=""),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Single metric time-series for a connection."""
    _require_clinician(actor)

    from datetime import datetime, timedelta, timezone

    from app.persistence.models import DeviceConnection, WearableObservation
    from app.services.device_sync.demo_data_generator import generate_observations

    conn = db.query(DeviceConnection).filter_by(id=connection_id).first()
    if conn is None:
        raise ApiServiceError(code="not_found", message="Connection not found.", status_code=404)

    now = datetime.now(timezone.utc)
    if not date_to:
        date_to = now.strftime("%Y-%m-%d")
    if not date_from:
        date_from = (now - timedelta(days=30)).strftime("%Y-%m-%d")

    observations = (
        db.query(WearableObservation)
        .filter(
            WearableObservation.patient_id == conn.patient_id,
            WearableObservation.source == conn.source,
            WearableObservation.metric_type == metric,
            WearableObservation.observed_at >= date_from,
        )
        .order_by(WearableObservation.observed_at.asc())
        .limit(2000)
        .all()
    )

    if not observations and is_demo_mode(conn.source):
        demo_obs = generate_observations(conn.source, conn.patient_id, date_from, date_to, metric)
        return {
            "metric": metric,
            "points": [{"timestamp": o.observed_at, "value": o.value} for o in demo_obs],
            "demo_mode": True,
        }

    return {
        "metric": metric,
        "points": [
            {
                "timestamp": o.observed_at.isoformat() if hasattr(o.observed_at, "isoformat") else str(o.observed_at),
                "value": o.value,
            }
            for o in observations
        ],
        "demo_mode": is_demo_mode(conn.source),
    }


@router.post("/{connection_id}/trigger", response_model=SyncResultOut)
def trigger_sync(
    connection_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SyncResultOut:
    """Manually trigger a data sync for a connection."""
    _require_clinician(actor)
    result = sync_connection(connection_id, db)
    return SyncResultOut(
        success=result.success,
        summaries_upserted=result.summaries_upserted,
        observations_inserted=result.observations_inserted,
        error=result.error,
        demo_mode=result.demo_mode,
    )
