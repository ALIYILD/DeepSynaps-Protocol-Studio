"""Agent admin endpoints (Phase 7).

Two surfaces live here:

* ``POST /api/v1/agent-admin/ops/scan-abuse`` — manually trigger the
  Slack-abuse scanner. Super-admin only. Re-uses the same SQL logic
  the existing ``/api/v1/agents/ops/abuse-signals`` endpoint exposes,
  with the addition of an in-memory dedupe so polling does not spam
  Slack.
* ``POST /api/v1/agent-admin/patient-activations`` and friends — the
  clinic-level activation flow for patient-facing agents. Super-admin
  records a written attestation that the clinical PM signed off the
  safety prompt for a named clinic.

All write endpoints require an authenticated super-admin (role=admin
AND ``actor.clinic_id is None``). Read-only ``check`` permits any
authenticated actor — the patient web UI calls it to decide whether
to render the agent tile.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.services import ops_alerting, patient_agent_activation

router = APIRouter(prefix="/api/v1/agent-admin", tags=["agent-admin"])


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def _require_super_admin(actor: AuthenticatedActor) -> None:
    """Mirror the gate from :mod:`app.routers.agents_router` — admin AND
    ``actor.clinic_id is None``. Clinic-bound admins are rejected so the
    cross-tenant ops surface stays opt-in.
    """
    require_minimum_role(actor, "admin")
    if actor.clinic_id is not None:
        raise ApiServiceError(
            code="ops_admin_required",
            message="Cross-clinic ops requires a super-admin actor.",
            warnings=["This endpoint is reserved for platform operators."],
            status_code=403,
        )


# ---------------------------------------------------------------------------
# Slack abuse-signal scanner
# ---------------------------------------------------------------------------


class ScanAbuseResponse(BaseModel):
    scanned: int
    posted: int
    dedupe_skipped: int


@router.post("/ops/scan-abuse", response_model=ScanAbuseResponse)
@limiter.limit("6/minute")
def scan_abuse(
    request: Request,
    window_minutes: int = Query(60, ge=1, le=1440),
    severity_threshold: str = Query("high"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ScanAbuseResponse:
    """Trigger an immediate scan of agent run audit rows and post Slack
    alerts for any (clinic, agent) pair at-or-above ``severity_threshold``.

    Idempotent within the current process: a pair that was already
    alerted in the current UTC hour is silently skipped via the
    in-memory dedupe (``ops_alerting._DEDUPE_KEYS``).
    """
    _require_super_admin(actor)
    if severity_threshold not in {"low", "med", "high"}:
        raise ApiServiceError(
            code="invalid_severity_threshold",
            message="severity_threshold must be one of: low, med, high",
            status_code=422,
        )
    result = ops_alerting.scan_and_alert_abuse_signals(
        db,
        window_minutes=window_minutes,
        severity_threshold=severity_threshold,
    )
    return ScanAbuseResponse(**result)


# ---------------------------------------------------------------------------
# Patient agent activation flow
# ---------------------------------------------------------------------------


class PatientActivationCreate(BaseModel):
    clinic_id: str = Field(..., min_length=1, max_length=200)
    agent_id: str = Field(..., min_length=1, max_length=200)
    attestation: str = Field(..., min_length=1, max_length=4000)


class PatientActivationOut(BaseModel):
    clinic_id: str
    agent_id: str
    attestation: str
    attested_by: str
    attested_at: str


class PatientActivationListResponse(BaseModel):
    activations: list[PatientActivationOut]
    env_flag_enabled: bool


class PatientActivationCheckResponse(BaseModel):
    activated: bool
    env_flag_enabled: bool


def _service_error_to_api(error: str | None) -> ApiServiceError:
    """Translate a service-layer error code into an :class:`ApiServiceError`."""
    code = error or "patient_activation_failed"
    if error == "agent_id_not_patient_facing":
        return ApiServiceError(
            code=error,
            message="Activation is only available for patient-facing agents (id must start with 'patient.').",
            status_code=422,
        )
    if error == "attestation_too_short":
        return ApiServiceError(
            code=error,
            message="Attestation must be at least 32 characters describing the clinical sign-off.",
            warnings=[
                "Include who signed off, what they reviewed, and the date of sign-off."
            ],
            status_code=422,
        )
    return ApiServiceError(
        code=code,
        message="Could not record patient agent activation.",
        status_code=422,
    )


@router.post(
    "/patient-activations",
    response_model=PatientActivationOut,
)
@limiter.limit("20/minute")
def create_patient_activation(
    request: Request,
    payload: PatientActivationCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientActivationOut:
    """Record a clinic-level activation for a patient-facing agent.

    The activation alone does **not** flip the production gate — see the
    ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED`` env var documented on
    :func:`patient_agent_activation.is_activated`.
    """
    _require_super_admin(actor)
    result = patient_agent_activation.activate(
        db=db,
        clinic_id=payload.clinic_id,
        agent_id=payload.agent_id,
        attestation=payload.attestation,
        attested_by=actor.actor_id,
    )
    if not result.get("ok"):
        raise _service_error_to_api(result.get("error"))
    activation = result["activation"]
    return PatientActivationOut(**activation)


@router.delete("/patient-activations/{clinic_id}/{agent_id}")
@limiter.limit("20/minute")
def delete_patient_activation(
    request: Request,
    clinic_id: str,
    agent_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, bool]:
    """Soft-delete a (clinic, agent) activation.

    Idempotent — deactivating a pair with no active row still returns
    200. The response ``removed`` flag tells the caller whether state
    actually changed. Phase 8 records ``deactivated_by`` from the actor
    so the audit row preserves the operator that flipped it off.
    """
    _require_super_admin(actor)
    result = patient_agent_activation.deactivate(
        db=db,
        clinic_id=clinic_id,
        agent_id=agent_id,
        deactivated_by=actor.actor_id,
    )
    return {"ok": bool(result["ok"]), "removed": bool(result["removed"])}


@router.get(
    "/patient-activations",
    response_model=PatientActivationListResponse,
)
def list_patient_activations(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientActivationListResponse:
    """List all current activations and report the env-flag state.

    ``env_flag_enabled`` reflects ``DEEPSYNAPS_PATIENT_AGENTS_ACTIVATED``;
    even with activations recorded, agents stay locked unless the flag is
    set. The UI surfaces this so operators don't get a false sense of
    "live" from a populated list.
    """
    _require_super_admin(actor)
    rows = patient_agent_activation.list_activations(db=db)
    return PatientActivationListResponse(
        activations=[PatientActivationOut(**r) for r in rows],
        env_flag_enabled=patient_agent_activation.env_flag_enabled(),
    )


@router.get(
    "/patient-activations/check",
    response_model=PatientActivationCheckResponse,
)
def check_patient_activation(
    clinic_id: str = Query(..., min_length=1, max_length=200),
    agent_id: str = Query(..., min_length=1, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> PatientActivationCheckResponse:
    """Return whether ``(clinic_id, agent_id)`` is callable for the actor.

    Any authenticated actor can hit this — the patient web UI uses it to
    decide whether to surface the agent tile on the marketplace.

    ``activated=True`` requires *both* the env flag to be set *and* an
    active row in the activation table for the pair.
    """
    require_minimum_role(actor, "guest")  # any authenticated identity passes
    activated = patient_agent_activation.is_activated(
        db=db, clinic_id=clinic_id, agent_id=agent_id
    )
    return PatientActivationCheckResponse(
        activated=activated,
        env_flag_enabled=patient_agent_activation.env_flag_enabled(),
    )


__all__ = ["router"]
