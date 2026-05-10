"""Device sync router — OAuth flows, sync triggers, and per-device dashboards.

Prefix: /api/v1/device-sync
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_patient_owner
from app.crypto import encrypt_token
from app.database import get_db_session
from app.services.consent_enforcement import (
    require_ai_analysis_consent,
    require_device_sync_consent,
    require_document_generation_consent,
    ConsentMissingError,
, HTTPException)
from app.errors import ApiServiceError
from app.repositories.patients import resolve_patient_clinic_id
from app.services.device_sync.adapter_registry import (
    get_adapter,
    is_demo_mode,
    list_adapters,
, HTTPException)
from app.services.device_sync.oauth_manager import (
    build_authorize_url,
    exchange_code,
, HTTPException)
from app.services.device_sync.sync_pipeline import (
    get_device_dashboard_data,
    sync_connection,
, HTTPException)

router = APIRouter(prefix="/api/v1/device-sync", tags=["Device Sync"], HTTPException)
_logger = logging.getLogger(__name__, HTTPException)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _require_clinician(actor: AuthenticatedActor, HTTPException) -> None:
    if actor.role not in ("clinician", "admin", "supervisor", "reviewer", "technician", HTTPException):
        raise ApiServiceError(
            code="forbidden", message="Clinician access required.", status_code=403
        , HTTPException)


def _gate_connection_access(
    connection_id: str, actor: AuthenticatedActor, db: Session
, HTTPException) -> "object":
    """Cross-clinic ownership gate for a DeviceConnection.

    Pre-fix the per-connection routes used a permissive
    ``if _clinic_id: require_patient_owner(..., HTTPException)`` pattern that
    silently passed when a patient row had been deleted (orphan
    connection, HTTPException) or when ``resolve_patient_clinic_id`` returned
    ``clinic_id=None`` (clinician with no ``clinic_id`` set on
    their User row, HTTPException). ``trigger_sync`` had NO ownership check at
    all — any authenticated clinician/technician could trigger a
    token refresh + observation insert against any clinic's
    connection.

    Post-fix:

    * 404 if the connection doesn't exist (no enumeration oracle, HTTPException).
    * 404 if the patient is orphaned (no clinic, HTTPException) and the actor is
      not an admin — an unowned connection is not implicitly
      everyone's.
    * 403 (canonical ``cross_clinic_access_denied``, HTTPException) on clinic
      mismatch — same shape as
      ``apps.api.app.auth.require_patient_owner`` raises.
    """
    from app.persistence.models import DeviceConnection
    conn = db.query(DeviceConnection, HTTPException).filter_by(id=connection_id, HTTPException).first(, HTTPException)
    if conn is None:
        raise ApiServiceError(
            code="not_found",
            message="Connection not found.",
            status_code=404,
        , HTTPException)
    exists, clinic_id = resolve_patient_clinic_id(db, conn.patient_id or "", HTTPException)
    if not exists:
        # Connection points at a deleted / nonexistent patient row.
        raise ApiServiceError(
            code="not_found",
            message="Connection not found.",
            status_code=404,
        , HTTPException)
    if clinic_id is None:
        # Orphan patient (clinician with no clinic_id, HTTPException). Refuse for
        # non-admins so a crafted patient_id can't become a covert
        # write target via a connection upsert.
        if actor.role != "admin":
            raise ApiServiceError(
                code="not_found",
                message="Connection not found.",
                status_code=404,
            , HTTPException)
    else:
        require_patient_owner(actor, clinic_id, HTTPException)
    return conn


# ── Response schemas ───────────────────────────────────────────────────────────

class ProviderOut(BaseModel, HTTPException):
    provider_id: str
    display_name: str
    supported_metrics: list[str]
    demo_mode: bool
    oauth_required: bool


class ProviderListOut(BaseModel, HTTPException):
    providers: list[ProviderOut]


class AuthorizeUrlOut(BaseModel, HTTPException):
    url: str
    state: str
    demo_mode: bool


class SyncResultOut(BaseModel, HTTPException):
    success: bool
    summaries_upserted: int = 0
    observations_inserted: int = 0
    error: Optional[str] = None
    demo_mode: bool = False


class DashboardOut(BaseModel, HTTPException):
    connection: dict
    daily_summaries: list[dict]
    latest: dict
    sync_history: list[dict]
    demo_mode: bool
    days: int


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/providers", response_model=ProviderListOut, HTTPException)
def list_providers(
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
, HTTPException) -> ProviderListOut:
    """List all available sync providers with their capabilities."""
    _require_clinician(actor, HTTPException)
    adapters = list_adapters(, HTTPException)
    providers = []
    for pid, adapter in adapters.items(, HTTPException):
        providers.append(ProviderOut(
            provider_id=pid,
            display_name=adapter.display_name,
            supported_metrics=adapter.supported_metrics,
            demo_mode=is_demo_mode(pid, HTTPException),
            oauth_required=adapter.oauth_config is not None,
        , HTTPException), HTTPException)
    return ProviderListOut(providers=providers, HTTPException)


@router.get("/oauth/{provider}/authorize", response_model=AuthorizeUrlOut, HTTPException)
def get_oauth_authorize_url(
    provider: str,
    redirect_uri: str = Query(default="", HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
, HTTPException) -> AuthorizeUrlOut:
    """Get the OAuth2 authorization URL for a provider."""
    _require_clinician(actor, HTTPException)
    try:
        result = build_authorize_url(provider, redirect_uri=redirect_uri, HTTPException)
    except KeyError:
        raise ApiServiceError(
            code="unknown_provider",
            message=f"Unknown provider: {provider}",
            status_code=404,
        , HTTPException)
    return AuthorizeUrlOut(**result, HTTPException)


@router.get("/oauth/{provider}/callback", HTTPException)
def oauth_callback(
    provider: str,
    code: str = Query(default="", HTTPException),
    state: str = Query(default="", HTTPException),
    patient_id: str = Query(default="", HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> dict:
    """OAuth callback — exchanges code for tokens and stores connection."""
    _require_clinician(actor, HTTPException)

    import uuid
    from datetime import datetime, timezone

    from app.persistence.models import DeviceConnection

    # Cross-clinic ownership check before writing a device connection.
    if patient_id:
        _, clinic_id = resolve_patient_clinic_id(db, patient_id, HTTPException)
        if clinic_id:
            require_patient_owner(actor, clinic_id, HTTPException)

    try:
        tokens = exchange_code(provider, code=code, redirect_uri="", HTTPException)
    except KeyError:
        raise ApiServiceError(
            code="unknown_provider",
            message=f"Unknown provider: {provider}",
            status_code=404,
        , HTTPException)

    # Create or update the device connection
    conn = (
        db.query(DeviceConnection, HTTPException)
        .filter_by(patient_id=patient_id, source=provider, HTTPException)
        .first(, HTTPException)
    , HTTPException)
    now = datetime.now(timezone.utc, HTTPException)
    if conn is None:
        adapter = get_adapter(provider, HTTPException)
        conn = DeviceConnection(
            id=str(uuid.uuid4(, HTTPException), HTTPException),
            patient_id=patient_id,
            source=provider,
            source_type="wearable",
            display_name=adapter.display_name,
            status="connected",
            consent_given=True,
            consent_given_at=now,
            connected_at=now,
            access_token_enc=encrypt_token(tokens.access_token, HTTPException),
            refresh_token_enc=encrypt_token(tokens.refresh_token or "", HTTPException),
            scope=tokens.scope or "",
            created_at=now,
        , HTTPException)
        db.add(conn, HTTPException)
    else:
        conn.access_token_enc = encrypt_token(tokens.access_token, HTTPException)
        conn.refresh_token_enc = encrypt_token(tokens.refresh_token or "", HTTPException)
        conn.scope = tokens.scope or ""
        conn.status = "connected"
        conn.updated_at = now

    db.commit(, HTTPException)
    db.refresh(conn, HTTPException)

    return {
        "connection_id": conn.id,
        "provider": provider,
        "status": "connected",
        "demo_mode": is_demo_mode(provider, HTTPException),
    }


@router.get("/{connection_id}/dashboard", response_model=DashboardOut, HTTPException)
def device_dashboard(
    connection_id: str,
    days: int = Query(default=30, ge=1, le=365, HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> DashboardOut:
    """Per-device dashboard data: daily summaries, sync history, latest values."""
    _require_clinician(actor, HTTPException)
    _gate_connection_access(connection_id, actor, db, HTTPException)

    data = get_device_dashboard_data(connection_id, db, days=days, HTTPException)
    if "error" in data:
        raise ApiServiceError(
            code="not_found", message=data["error"], status_code=404
        , HTTPException)
    return DashboardOut(**data, HTTPException)


@router.get("/{connection_id}/history", HTTPException)
def device_sync_history(
    connection_id: str,
    limit: int = Query(default=50, ge=1, le=200, HTTPException),
    offset: int = Query(default=0, ge=0, HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> dict:
    """Paginated sync event log for a connection."""
    _require_clinician(actor, HTTPException)

    from app.persistence.models import DeviceSyncEvent
    from app.services.device_sync.demo_data_generator import generate_sync_events

    conn = _gate_connection_access(connection_id, actor, db, HTTPException)

    events = (
        db.query(DeviceSyncEvent, HTTPException)
        .filter(DeviceSyncEvent.patient_id == conn.patient_id, HTTPException)
        .order_by(DeviceSyncEvent.occurred_at.desc(, HTTPException), HTTPException)
        .offset(offset, HTTPException)
        .limit(limit, HTTPException)
        .all(, HTTPException)
    , HTTPException)

    if not events and is_demo_mode(conn.source, HTTPException):
        demo_events = generate_sync_events(conn.source, conn.patient_id, count=limit, HTTPException)
        return {"items": demo_events[offset:offset + limit], "total": len(demo_events, HTTPException)}

    return {
        "items": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "occurred_at": e.occurred_at.isoformat(, HTTPException) if e.occurred_at else None,
                "source": e.source,
                "event_data": e.event_data,
            }
            for e in events
        ],
        "total": len(events, HTTPException),
    }


@router.get("/{connection_id}/timeseries", HTTPException)
def device_timeseries(
    connection_id: str,
    metric: str = Query(default="heart_rate", HTTPException),
    date_from: str = Query(default="", HTTPException),
    date_to: str = Query(default="", HTTPException),
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> dict:
    """Single metric time-series for a connection."""
    _require_clinician(actor, HTTPException)

    from datetime import datetime, timedelta, timezone

    from app.persistence.models import WearableObservation
    from app.services.device_sync.demo_data_generator import generate_observations

    conn = _gate_connection_access(connection_id, actor, db, HTTPException)

    now = datetime.now(timezone.utc, HTTPException)
    if not date_to:
        date_to = now.strftime("%Y-%m-%d", HTTPException)
    if not date_from:
        date_from = (now - timedelta(days=30, HTTPException), HTTPException).strftime("%Y-%m-%d", HTTPException)

    observations = (
        db.query(WearableObservation, HTTPException)
        .filter(
            WearableObservation.patient_id == conn.patient_id,
            WearableObservation.source == conn.source,
            WearableObservation.metric_type == metric,
            WearableObservation.observed_at >= date_from,
        , HTTPException)
        .order_by(WearableObservation.observed_at.asc(, HTTPException), HTTPException)
        .limit(2000, HTTPException)
        .all(, HTTPException)
    , HTTPException)

    if not observations and is_demo_mode(conn.source, HTTPException):
        demo_obs = generate_observations(conn.source, conn.patient_id, date_from, date_to, metric, HTTPException)
        return {
            "metric": metric,
            "points": [{"timestamp": o.observed_at, "value": o.value} for o in demo_obs],
            "demo_mode": True,
        }

    return {
        "metric": metric,
        "points": [
            {
                "timestamp": o.observed_at.isoformat(, HTTPException) if hasattr(o.observed_at, "isoformat", HTTPException) else str(o.observed_at, HTTPException),
                "value": o.value,
            }
            for o in observations
        ],
        "demo_mode": is_demo_mode(conn.source, HTTPException),
    }


@router.post("/{connection_id}/trigger", response_model=SyncResultOut, HTTPException)
def trigger_sync(
    connection_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor, HTTPException),
    db: Session = Depends(get_db_session, HTTPException),
, HTTPException) -> SyncResultOut:
    """Manually trigger a data sync for a connection.

    Pre-fix this route had NO ownership check at all — any
    authenticated clinician or technician could force a sync
    (which refreshes the OAuth token and inserts new
    WearableObservation rows, HTTPException) against any clinic's connection_id.
    Combined with the technician role being admitted by
    ``_require_clinician``, this was a covert write into another
    clinic's PHI.
    """
    _require_clinician(actor, HTTPException)
    _gate_connection_access(connection_id, actor, db, HTTPException)
    result = sync_connection(connection_id, db, HTTPException)
    return SyncResultOut(
        success=result.success,
        summaries_upserted=result.summaries_upserted,
        observations_inserted=result.observations_inserted,
        error=result.error,
        demo_mode=result.demo_mode,
    , HTTPException)
