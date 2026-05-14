"""Movement Analyzer API — multimodal movement workspace (decision-support).

GET    /api/v1/movement/analyzer/patient/{patient_id}
POST   /api/v1/movement/analyzer/patient/{patient_id}/recompute
POST   /api/v1/movement/analyzer/patient/{patient_id}/annotation
POST   /api/v1/movement/analyzer/patient/{patient_id}/review
GET    /api/v1/movement/analyzer/patient/{patient_id}/export.json
GET    /api/v1/movement/analyzer/patient/{patient_id}/audit
"""
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role, require_patient_owner
from app.database import get_db_session
from app.errors import ApiServiceError
from app.limiter import limiter
from app.repositories.patients import resolve_patient_clinic_id
from app.services.consent_enforcement import require_ai_analysis_consent, ConsentMissingError
from app.services.movement_analyzer import (
    append_audit,
    build_movement_workspace_payload,
    list_audit_events,
    load_snapshot,
    persist_snapshot,
)

router = APIRouter(prefix="/api/v1/movement/analyzer", tags=["Movement Analyzer"])


# core-schema-exempt: minimal router-local request body; not reused outside this router
class RecomputeRequest(BaseModel):
    reason: Optional[str] = None


# core-schema-exempt: minimal router-local request body; accepts {message} (frontend) or {note} (legacy); not reused outside this router
class AnnotationRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=8000)
    message: Optional[str] = Field(default=None, max_length=8000)

    def text(self) -> str:
        return (self.message or self.note or "").strip()


# core-schema-exempt: integration branch; migrate to core-schema in follow-up PR
class ReviewAckRequest(BaseModel):
    """Clinician attestation that the movement workspace was reviewed (audit only)."""

    note: str = Field(..., min_length=1, max_length=4000, description="Required review note / attestation.")


def _require_authenticated_clinician(actor: AuthenticatedActor) -> None:
    if actor.role == "guest" and actor.token_id is None:
        raise ApiServiceError(
            code="auth_required",
            message="Authentication is required for this action.",
            status_code=401,
        )
    require_minimum_role(actor, "clinician")


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _require_movement_analyzer_consent(
    *,
    db: Session,
    actor: AuthenticatedActor,
    patient_id: str,
) -> None:
    """Require ai_analysis consent with legacy fallback for movement analyzer.

    Accepts explicit AI consent; falls back to patient-level consent_signed
    for legacy records that predate centralized ai_analysis consent.
    """
    try:
        require_ai_analysis_consent(db, patient_id, actor, ai_modality="movement")
        return
    except ConsentMissingError:
        pass

    # Legacy fallback: check patient-level consent flag
    from app.persistence.models import Patient as _Patient

    patient = db.query(_Patient).filter(_Patient.id == patient_id).first()
    if patient and bool(getattr(patient, "consent_signed", False)):
        return

    raise ApiServiceError(
        code="consent_missing",
        message="ai_analysis consent required",
        status_code=403,
    )


@router.get("/patient/{patient_id}")
def get_movement_analyzer(
    request: Request,
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return Movement Analyzer workspace for the patient.

    Uses cached snapshot when fresh (same day UTC); otherwise recomputes.
    """
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)
    _require_movement_analyzer_consent(db=db, actor=actor, patient_id=patient_id)

    append_audit(patient_id, "viewed", actor.actor_id, {"message": "Movement workspace viewed"}, db)

    from datetime import datetime, timezone

    snap = load_snapshot(patient_id, db)
    needs_fresh = True
    if snap and snap.get("generated_at"):
        try:
            gen = datetime.fromisoformat(snap["generated_at"].replace("Z", "+00:00"))
            if gen.tzinfo is None:
                gen = gen.replace(tzinfo=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - gen).total_seconds() / 3600
            if age_hours < 24:
                needs_fresh = False
        except (TypeError, ValueError):
            needs_fresh = True

    if needs_fresh or snap is None:
        payload = build_movement_workspace_payload(patient_id, db)
        persist_snapshot(patient_id, payload, db)
    else:
        payload = dict(snap)

    audit = list_audit_events(patient_id, db, limit=12)
    payload = dict(payload)
    payload["audit_tail"] = audit
    return payload


@router.post("/patient/{patient_id}/recompute")
@limiter.limit("30/minute")
def recompute_movement_analyzer(
    request: Request,
    patient_id: str,
    body: RecomputeRequest | None = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Force rebuild of movement workspace and persist cache."""
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)
    _require_movement_analyzer_consent(db=db, actor=actor, patient_id=patient_id)

    payload = build_movement_workspace_payload(patient_id, db)
    persist_snapshot(patient_id, payload, db)
    reason = ((body.reason if body else None) or "").strip() or "manual"
    append_audit(
        patient_id,
        "recompute",
        actor.actor_id,
        {"reason": reason},
        db,
    )
    out = dict(payload)
    out["audit_tail"] = list_audit_events(patient_id, db, limit=12)
    return out


@router.post("/patient/{patient_id}/annotation")
@limiter.limit("30/minute")
def annotate_movement_analyzer(
    request: Request,
    patient_id: str,
    body: AnnotationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Append clinician note to Movement Analyzer audit trail.

    Accepts either ``{message: str}`` (frontend contract from PR #452) or the
    legacy ``{note: str}`` field. At least one must be non-empty.
    """
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)

    text = body.text()
    if not text:
        raise HTTPException(status_code=422, detail="annotation message required")

    append_audit(patient_id, "annotated", actor.actor_id, {"note": text, "message": text}, db)
    return {"ok": True, "patient_id": patient_id}


@router.post("/patient/{patient_id}/review")
@limiter.limit("30/minute")
def review_ack_movement_analyzer(
    request: Request,
    patient_id: str,
    body: ReviewAckRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Record clinician review acknowledgment (audit trail only — not a clinical sign-off)."""
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)

    note = body.note.strip()
    if not note:
        raise HTTPException(status_code=422, detail="review note required")
    append_audit(
        patient_id,
        "review_ack",
        actor.actor_id,
        {"note": note, "message": note, "kind": "movement_workspace_review"},
        db,
    )
    return {"ok": True, "patient_id": patient_id}


_RETENTION_POLICY = {"retention_days": 2555, "retention_policy": "7-year clinical record retention"}


@router.get("/patient/{patient_id}/export.json")
def export_movement_analyzer_json(
    request: Request,
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """Download serialised workspace JSON for documentation (clinician scope only)."""
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)

    snap = load_snapshot(patient_id, db)
    if snap is None:
        payload = build_movement_workspace_payload(patient_id, db)
    else:
        payload = dict(snap)

    append_audit(
        patient_id,
        "exported",
        actor.actor_id,
        {"message": "Movement workspace JSON export", "format": "json"},
        db,
    )

    from datetime import datetime, timezone

    bundle = {
        "export_meta": {
            "format": "movement_analyzer_workspace_v1",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "patient_id": patient_id,
            "disclaimer": (
                "Decision-support export for clinician review. Not a diagnosis, "
                "fall-risk determination, or treatment authorization."
            ),
            **_RETENTION_POLICY,
        },
        "workspace": payload,
    }
    body = json.dumps(bundle, indent=2, default=str)
    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="movement-workspace-{patient_id[:8]}.json"',
        },
    )


@router.get("/patient/{patient_id}/audit")
def movement_analyzer_audit(
    request: Request,
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Paginated audit trail for Movement Analyzer."""
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)

    append_audit(patient_id, "audit_viewed", actor.actor_id, {"message": "Movement workspace audit log viewed"}, db)

    items = list_audit_events(patient_id, db, limit=100)
    return {"patient_id": patient_id, "items": items}


# ---------------------------------------------------------------------------
# Movement Biomarkers (decision-support: evidence-based, clinician-reviewed)
# ---------------------------------------------------------------------------

#: Evidence-based movement biomarker definitions
_MOVEMENT_BIOMARKERS = {
    "gait_speed": {
        "display_name": "Gait Speed",
        "unit": "m/s",
        "evidence_grade": "A",
        "clinical_reference": "6MWT/Bohannon 2006; ICC=0.92 video+wearable vs instrumented mat",
        "normal_range": ">=1.0 m/s",
        "clinical_wording": "Gait speed is a validated functional indicator. Values below 1.0 m/s warrant clinical attention.",
    },
    "stride_length": {
        "display_name": "Stride Length",
        "unit": "m",
        "evidence_grade": "A",
        "clinical_reference": "Salarian et al. 2004; ICC=0.92 wearable vs GAITRite",
        "normal_range": ">=1.2 m",
        "clinical_wording": "Stride length is a reliable marker of gait impairment. Shortened stride may indicate bradykinesia or postural instability.",
    },
    "arm_swing_amplitude": {
        "display_name": "Arm Swing Amplitude",
        "unit": "degrees",
        "evidence_grade": "B",
        "clinical_reference": "Gallagher et al. 2011; ICC=0.89 accelerometer vs video",
        "normal_range": "20-40 degrees",
        "clinical_wording": "Reduced arm swing amplitude is associated with bradykinesia. Asymmetry may indicate unilateral motor involvement.",
    },
    "tremor_band_power_4_6hz": {
        "display_name": "Tremor Band Power (4-6 Hz)",
        "unit": "arbitrary",
        "evidence_grade": "B",
        "clinical_reference": "Heldman et al. 2011; ICC=0.94 video vs EMG accelerometer",
        "normal_range": "<2.0 (normalized)",
        "clinical_wording": "Elevated 4-6 Hz power is associated with parkinsonian rest tremor. Requires confirmation by clinician examination.",
    },
    "postural_sway_area": {
        "display_name": "Postural Sway Area",
        "unit": "mm\u00b2",
        "evidence_grade": "A",
        "clinical_reference": "Rocchi et al. 2006; COP AP+ML ICC=0.92 force-plate vs video",
        "normal_range": "<200 mm\u00b2 (eyes open)",
        "clinical_wording": "Increased postural sway is associated with balance impairment and elevated fall risk. Interpret with clinical context.",
    },
    "movement_smoothness": {
        "display_name": "Movement Smoothness",
        "unit": "dimensionless",
        "evidence_grade": "B",
        "clinical_reference": "Log-dimensionless jerk; Teulings et al. 2002",
        "normal_range": ">-5.0",
        "clinical_wording": "Reduced movement smoothness (more negative values) indicates dyskinesia or movement fragmentation.",
    },
    "asymmetry_index": {
        "display_name": "Asymmetry Index",
        "unit": "ratio",
        "evidence_grade": "B",
        "clinical_reference": "Left-right movement ratio; Heldman et al. 2011",
        "normal_range": "0.8-1.2",
        "clinical_wording": "Asymmetry index compares left and right limb movement. Values outside 0.8-1.2 suggest unilateral motor involvement.",
    },
}


# core-schema-exempt: biomarker response; not reused outside this router
class MovementBiomarkerValue(BaseModel):
    """Single biomarker value with clinical context."""
    biomarker_id: str
    display_name: str
    value: float | None = None
    unit: str
    evidence_grade: str
    clinical_reference: str
    confidence: float = 0.0
    trend_direction: str = "unknown"  # "improving", "stable", "worsening", "unknown"
    safe_clinical_wording: str
    normal_range: str
    recorded_at: str | None = None


# core-schema-exempt: biomarker list response; not reused outside this router
class MovementBiomarkersResponse(BaseModel):
    """Available movement biomarkers for a patient with latest values."""
    patient_id: str
    biomarkers: list[MovementBiomarkerValue]
    available_count: int
    disclaimer: str = (
        "Decision-support only. Movement biomarkers require clinician review and "
        "correlation with in-person examination before clinical interpretation."
    )
    generated_at: str


@router.get("/patient/{patient_id}/biomarkers", response_model=MovementBiomarkersResponse)
def get_movement_biomarkers(
    request: Request,
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> MovementBiomarkersResponse:
    """Return available movement biomarkers for the patient.

    Each biomarker includes evidence grade, clinical reference,
    latest value with confidence, safe clinical wording, and trend direction.

    Decision-support only: not a diagnosis.
    """
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)
    _require_movement_analyzer_consent(db=db, actor=actor, patient_id=patient_id)

    append_audit(
        patient_id, "biomarkers_viewed", actor.actor_id,
        {"message": "Movement biomarkers viewed"}, db,
    )

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    # Load workspace to extract any available biomarker values
    # Use cached snapshot when fresh (same day UTC); otherwise recomputes
    from app.services.movement_analyzer import load_snapshot

    snap = load_snapshot(patient_id, db)

    biomarkers: list[MovementBiomarkerValue] = []
    for bmid, meta in _MOVEMENT_BIOMARKERS.items():
        # Extract value from snapshot if available, otherwise None
        value: float | None = None
        confidence = 0.0
        trend = "unknown"
        recorded_at: str | None = None

        if snap:
            # Try to extract from modalities or metrics
            modalities = snap.get("modalities") or {}
            metrics = snap.get("metrics") or {}

            # Map biomarker ID to potential data sources
            value, confidence = _extract_biomarker_value(bmid, modalities, metrics)

            if value is not None:
                recorded_at = snap.get("generated_at")
                trend = _compute_trend_direction(bmid, snap)

        biomarkers.append(
            MovementBiomarkerValue(
                biomarker_id=bmid,
                display_name=meta["display_name"],
                value=value,
                unit=meta["unit"],
                evidence_grade=meta["evidence_grade"],
                clinical_reference=meta["clinical_reference"],
                confidence=confidence,
                trend_direction=trend,
                safe_clinical_wording=meta["clinical_wording"],
                normal_range=meta["normal_range"],
                recorded_at=recorded_at,
            )
        )

    return MovementBiomarkersResponse(
        patient_id=patient_id,
        biomarkers=biomarkers,
        available_count=sum(1 for b in biomarkers if b.value is not None),
        generated_at=now,
    )


def _extract_biomarker_value(
    biomarker_id: str,
    modalities: dict[str, Any],
    metrics: dict[str, Any],
) -> tuple[float | None, float]:
    """Extract a biomarker value from movement workspace data."""
    # Direct metrics lookup
    if biomarker_id in metrics and metrics[biomarker_id] is not None:
        try:
            return float(metrics[biomarker_id]), 0.75
        except (TypeError, ValueError):
            pass

    # Modality-based extraction
    modality_map = {
        "gait_speed": ("gait", "speed_ms"),
        "stride_length": ("gait", "stride_length_m"),
        "arm_swing_amplitude": ("gait", "arm_swing_deg"),
        "tremor_band_power_4_6hz": ("tremor", "band_power_4_6hz"),
        "postural_sway_area": ("posture_balance", "sway_area_mm2"),
        "movement_smoothness": ("bradykinesia", "smoothness_score"),
        "asymmetry_index": ("gait", "asymmetry_ratio"),
    }

    if biomarker_id in modality_map:
        modality_key, metric_key = modality_map[biomarker_id]
        modality = modalities.get(modality_key) or {}
        if isinstance(modality, dict):
            raw = modality.get(metric_key)
            if raw is not None:
                try:
                    return float(raw), modality.get("confidence", 0.6)
                except (TypeError, ValueError):
                    pass

    return None, 0.0


def _compute_trend_direction(biomarker_id: str, snap: dict[str, Any]) -> str:
    """Compute trend direction from prior scores if available."""
    prior_scores = snap.get("prior_scores") or []
    if len(prior_scores) < 2:
        return "unknown"

    # Filter scores for this biomarker (mapped by modality)
    modality_map = {
        "gait_speed": "gait",
        "stride_length": "gait",
        "arm_swing_amplitude": "gait",
        "tremor_band_power_4_6hz": "tremor",
        "postural_sway_area": "posture_balance",
        "movement_smoothness": "bradykinesia",
        "asymmetry_index": "gait",
    }
    modality = modality_map.get(biomarker_id)
    if not modality:
        return "unknown"

    values = [
        ps.get("score") for ps in prior_scores
        if ps.get("modality") == modality and ps.get("score") is not None
    ]
    if len(values) < 2:
        return "unknown"

    # For most biomarkers, higher is better (except sway, tremor power, asymmetry)
    decreasing_is_good = biomarker_id in {"postural_sway_area", "tremor_band_power_4_6hz", "asymmetry_index"}
    recent = values[-1]
    previous = values[-2]

    delta = recent - previous
    if abs(delta) < 0.05:
        return "stable"
    if decreasing_is_good:
        return "improving" if delta < 0 else "worsening"
    return "improving" if delta > 0 else "worsening"
