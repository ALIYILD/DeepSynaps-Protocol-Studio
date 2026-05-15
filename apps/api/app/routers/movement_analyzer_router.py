"""Movement Analyzer API -- multimodal movement workspace (decision-support).

GET    /api/v1/movement/analyzer/patient/{patient_id}
POST   /api/v1/movement/analyzer/patient/{patient_id}/recompute
POST   /api/v1/movement/analyzer/patient/{patient_id}/annotation
POST   /api/v1/movement/analyzer/patient/{patient_id}/review
GET    /api/v1/movement/analyzer/patient/{patient_id}/export.json
GET    /api/v1/movement/analyzer/patient/{patient_id}/audit
GET    /api/v1/movement/analyzer/patient/{patient_id}/biomarkers
GET    /api/v1/movement/analyzer/patient/{patient_id}/biomarkers/summary
POST   /api/v1/movement/analyzer/patient/{patient_id}/multimodal-correlation
POST   /api/v1/movement/analyzer/patient/{patient_id}/fall-risk-score
GET    /api/v1/movement/analyzer/patient/{patient_id}/progression
"""
from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timezone
from typing import Any, Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from scipy import stats
from sqlalchemy import and_, desc, select, text
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

# Pipeline imports for recompute wiring
from app.services.gait_analysis_pipeline import analyze_gait
from app.services.tremor_analysis_pipeline import analyze_tremor
from app.services.finger_tap_pipeline import analyze_finger_tapping
from app.services.posture_analysis_pipeline import analyze_posture

from app.persistence.models import (
    MovementBiomarkerTrend,
    MovementFallRiskScore,
    MovementMultimodalCorrelation,
    MovementAnalyzerSnapshot,
)

router = APIRouter(prefix="/api/v1/movement/analyzer", tags=["Movement Analyzer"])
_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

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


# Multimodal correlation request
class MultimodalCorrelationRequest(BaseModel):
    video_analysis_id: str = Field(..., description="ID of the video analysis session")
    voice_analysis_id: str = Field(..., description="ID of the voice analysis session")
    correlation_type: str = Field(default="pearson", description="pearson or spearman")


# Fall risk score request
class FallRiskRequest(BaseModel):
    session_date: Optional[str] = Field(default=None, description="ISO date of assessment; defaults to today")
    include_medications: bool = Field(default=True, description="Include medication data if available")


# ---------------------------------------------------------------------------
# Helper: auth / consent gating
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Existing endpoints (preserved)
# ---------------------------------------------------------------------------

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
    """Force rebuild of movement workspace, run movement pipelines, and persist cache."""
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)
    _require_movement_analyzer_consent(db=db, actor=actor, patient_id=patient_id)

    # 1. Build base workspace payload
    payload = build_movement_workspace_payload(patient_id, db)

    # 2. Check if pose data exists and run appropriate pipelines
    pose_data = _fetch_latest_pose_data(patient_id, db)
    pipeline_results: dict[str, Any] = {}

    if pose_data:
        task_type = pose_data.get("task_type", "gait")  # Default to gait analysis
        frames = pose_data.get("frames", [])
        fps = pose_data.get("fps", 30.0)
        duration_s = pose_data.get("duration_s", len(frames) / fps if fps > 0 else 0)

        pose_sequence = {
            "frames": frames,
            "fps": fps,
            "duration_s": duration_s,
            "summary": pose_data.get("summary", {}),
        }

        if task_type == "gait":
            try:
                result = analyze_gait(pose_sequence)
                pipeline_results["gait_pipeline"] = result
                _store_biomarker_results(patient_id, actor, "gait", result, db)
            except Exception as e:
                _log.warning("Gait analysis pipeline failed: %s", e)
                pipeline_results["gait_pipeline"] = {"error": str(e), "evidence_summary": "Pipeline unavailable — decision-support deferred."}

        elif task_type == "tremor":
            try:
                side = pose_data.get("side", "right")
                result = analyze_tremor(pose_sequence, side=side)
                pipeline_results["tremor_pipeline"] = result
                _store_biomarker_results(patient_id, actor, "tremor", result, db)
            except Exception as e:
                _log.warning("Tremor analysis pipeline failed: %s", e)
                pipeline_results["tremor_pipeline"] = {"error": str(e), "evidence_summary": "Pipeline unavailable — decision-support deferred."}

        elif task_type == "finger_tap":
            try:
                side = pose_data.get("side", "right")
                result = analyze_finger_tapping(pose_sequence, side=side)
                pipeline_results["finger_tap_pipeline"] = result
                _store_biomarker_results(patient_id, actor, "finger_tap", result, db)
            except Exception as e:
                _log.warning("Finger tap pipeline failed: %s", e)
                pipeline_results["finger_tap_pipeline"] = {"error": str(e), "evidence_summary": "Pipeline unavailable — decision-support deferred."}

        elif task_type == "posture":
            try:
                eyes_closed = pose_data.get("eyes_closed_segment")
                result = analyze_posture(pose_sequence, eyes_closed_segment=eyes_closed)
                pipeline_results["posture_pipeline"] = result
                _store_biomarker_results(patient_id, actor, "posture", result, db)
            except Exception as e:
                _log.warning("Posture analysis pipeline failed: %s", e)
                pipeline_results["posture_pipeline"] = {"error": str(e), "evidence_summary": "Pipeline unavailable — decision-support deferred."}

        # 3. Store results with evidence grades and safe wording
        payload["pipeline_results"] = pipeline_results
        payload["pipeline_executed_at"] = datetime.now(timezone.utc).isoformat()
        payload["pose_data_available"] = True
        payload["task_type"] = task_type
    else:
        payload["pipeline_results"] = {}
        payload["pose_data_available"] = False
        payload["evidence_note"] = "No pose data available for pipeline execution. Upload video assessment data to enable movement analysis."

    # 4. Persist and audit
    persist_snapshot(patient_id, payload, db)
    reason = ((body.reason if body else None) or "").strip() or "manual"
    append_audit(
        patient_id,
        "recompute",
        actor.actor_id,
        {"reason": reason, "pipelines_run": list(pipeline_results.keys()), "pose_available": bool(pose_data)},
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
    """Record clinician review acknowledgment (audit trail only -- not a clinical sign-off)."""
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
    biomarker_type: str
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
    biomarker_type: str = "all",
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
        {"message": "Movement biomarkers viewed", "biomarker_type": biomarker_type}, db,
    )

    now = datetime.now(timezone.utc).isoformat()

    # Load workspace to extract any available biomarker values
    snap = load_snapshot(patient_id, db)

    biomarkers: list[MovementBiomarkerValue] = []
    for bmid, meta in _MOVEMENT_BIOMARKERS.items():
        # Filter by biomarker_type if specified
        if biomarker_type != "all":
            modality_map = {
                "gait_speed": "gait", "stride_length": "gait",
                "arm_swing_amplitude": "gait", "asymmetry_index": "gait",
                "tremor_band_power_4_6hz": "tremor",
                "postural_sway_area": "posture", "movement_smoothness": "bradykinesia",
            }
            if modality_map.get(bmid) != biomarker_type:
                continue

        value: float | None = None
        confidence = 0.0
        trend = "unknown"
        recorded_at: str | None = None

        if snap:
            modalities = snap.get("modalities") or {}
            metrics = snap.get("metrics") or {}
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
        biomarker_type=biomarker_type,
        biomarkers=biomarkers,
        available_count=sum(1 for b in biomarkers if b.value is not None),
        generated_at=now,
    )


# ===========================================================================
# 1. GET /biomarkers/summary -- Full biomarker summary with trends
# ===========================================================================

@router.get("/patient/{patient_id}/biomarkers/summary")
def get_biomarker_summary(
    request: Request,
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return comprehensive movement biomarker summary with trends and alerts.

    Queries the movement_biomarker_trends table for historical values
    per biomarker and includes the latest analysis, trend series,
    generated alerts, and an evidence summary.

    Decision-support only: not a diagnosis.
    """
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)
    _require_movement_analyzer_consent(db=db, actor=actor, patient_id=patient_id)

    append_audit(
        patient_id, "biomarker_summary_viewed", actor.actor_id,
        {"message": "Biomarker summary viewed"}, db,
    )

    now = datetime.now(timezone.utc)

    # --- Load latest snapshot for current analysis ---
    snap = load_snapshot(patient_id, db)

    # --- Extract latest analysis per modality ---
    latest_analysis: dict[str, Any] = {}

    # Gait features
    gait_speed_val, gait_speed_conf = _extract_biomarker_value("gait_speed", snap.get("modalities") or {} if snap else {}, snap.get("metrics") or {} if snap else {})
    stride_val, stride_conf = _extract_biomarker_value("stride_length", snap.get("modalities") or {} if snap else {}, snap.get("metrics") or {} if snap else {})
    cadence = 0.0
    if snap and snap.get("modalities"):
        gait_mod = snap["modalities"].get("gait") or {}
        cadence = float(gait_mod.get("cadence_steps_per_min") or gait_mod.get("cadence") or 0)

    latest_analysis["gait"] = {
        "stride_length": {
            "value": stride_val,
            "unit": "m",
            "confidence": stride_conf,
            "grade": "A",
            "safe_wording": _MOVEMENT_BIOMARKERS["stride_length"]["clinical_wording"],
        },
        "cadence": {
            "value": round(cadence, 1) if cadence else None,
            "unit": "steps/min",
            "confidence": 0.75 if cadence else 0.0,
            "grade": "A",
            "safe_wording": "Cadence estimate derived from video pose; may support clinical observation but requires confirmation.",
        },
        "gait_speed": {
            "value": gait_speed_val,
            "unit": "m/s",
            "confidence": gait_speed_conf,
            "grade": "A",
            "safe_wording": _MOVEMENT_BIOMARKERS["gait_speed"]["clinical_wording"],
        },
    }

    # Tremor features
    tremor_dom_freq = None
    tremor_amp = None
    tremor_classification = "no_data"
    if snap and snap.get("modalities"):
        tremor_mod = snap["modalities"].get("tremor") or {}
        tremor_dom_freq = tremor_mod.get("dominant_frequency_hz") or tremor_mod.get("dominant_frequency")
        tremor_amp = tremor_mod.get("amplitude_px") or tremor_mod.get("tremor_amplitude")
        tremor_classification = tremor_mod.get("classification", "no_data")

    latest_analysis["tremor"] = {
        "dominant_frequency": {
            "value": round(float(tremor_dom_freq), 2) if tremor_dom_freq is not None else None,
            "unit": "Hz",
            "confidence": 0.82 if tremor_dom_freq is not None else 0.0,
            "grade": "B",
            "classification": tremor_classification,
            "safe_wording": "Tremor frequency features are model-assisted observation cues. Camera artifacts may mimic tremor -- requires clinician review.",
        },
        "tremor_amplitude": {
            "value": round(float(tremor_amp), 3) if tremor_amp is not None else None,
            "unit": "px",
            "confidence": 0.60 if tremor_amp is not None else 0.0,
            "grade": "C",
            "safe_wording": "Tremor amplitude is a derived displacement metric. Camera motion may confound.",
        },
    }

    # Finger tap features
    taps_val = None
    decay_val = None
    if snap and snap.get("modalities"):
        brady_mod = snap["modalities"].get("bradykinesia") or {}
        taps_val = brady_mod.get("taps_per_10s") or brady_mod.get("finger_tap_rate")
        decay_val = brady_mod.get("amplitude_decay_ratio") or brady_mod.get("decay_ratio")

    latest_analysis["finger_tap"] = {
        "taps_per_10s": {
            "value": round(float(taps_val), 1) if taps_val is not None else None,
            "unit": "taps",
            "confidence": 0.85 if taps_val is not None else 0.0,
            "grade": "A",
            "safe_wording": "Finger tapping speed is the strongest validated single bradykinesia predictor (Grade A, AUC 0.85-0.94).",
        },
        "amplitude_decay_ratio": {
            "value": round(float(decay_val), 3) if decay_val is not None else None,
            "unit": "ratio",
            "confidence": 0.65 if decay_val is not None else 0.0,
            "grade": "B",
            "safe_wording": "Amplitude decay may support review of motor fatiguing. Not a standalone diagnosis.",
        },
    }

    # Posture features
    sway_val = None
    balance_score = None
    if snap and snap.get("modalities"):
        post_mod = snap["modalities"].get("posture_balance") or {}
        sway_val = post_mod.get("sway_area_mm2") or post_mod.get("sway_area")
        balance_score = post_mod.get("balance_confidence_score") or post_mod.get("balance_score")

    latest_analysis["posture"] = {
        "sway_area": {
            "value": round(float(sway_val), 2) if sway_val is not None else None,
            "unit": "mm\u00b2",
            "confidence": 0.80 if sway_val is not None else 0.0,
            "grade": "A",
            "safe_wording": _MOVEMENT_BIOMARKERS["postural_sway_area"]["clinical_wording"],
        },
        "balance_confidence_score": {
            "value": round(float(balance_score), 1) if balance_score is not None else None,
            "unit": "0-100",
            "confidence": 0.65 if balance_score is not None else 0.0,
            "grade": "C",
            "safe_wording": "Balance confidence score is a composite index. Not a clinical balance scale replacement.",
        },
    }

    # --- Query trends from movement_biomarker_trends table ---
    trends: dict[str, list[dict[str, Any]]] = {
        "gait_speed": [],
        "step_time_variability": [],
        "tremor_amplitude": [],
    }

    trend_rows = (
        db.query(MovementBiomarkerTrend)
        .filter(
            MovementBiomarkerTrend.patient_id == patient_id,
            MovementBiomarkerTrend.biomarker_type.in_([
                "gait_speed", "step_time_variability", "tremor_amplitude",
                "stride_length", "cadence", "sway_area",
            ]),
        )
        .order_by(desc(MovementBiomarkerTrend.session_date))
        .limit(100)
        .all()
    )

    for row in trend_rows:
        entry = {
            "date": row.session_date.isoformat() if row.session_date else None,
            "value": row.value,
            "confidence": row.confidence,
            "evidence_grade": row.evidence_grade,
        }
        if row.biomarker_type in trends:
            trends[row.biomarker_type].append(entry)
        # Also map stride_length to gait_speed trends if gait_speed empty
        elif row.biomarker_type == "stride_length" and not trends["gait_speed"]:
            trends["gait_speed"].append(entry)

    # Reverse so oldest first for display
    for key in trends:
        trends[key].reverse()

    # --- Generate alerts ---
    alerts: list[dict[str, str]] = []

    # Gait speed alert
    if gait_speed_val is not None and float(gait_speed_val) < 1.0:
        alerts.append({
            "type": "progression",
            "biomarker": "gait_speed",
            "message": (
                f"Gait speed {float(gait_speed_val):.2f} m/s is below the 1.0 m/s threshold. "
                "This may indicate functional decline and warrants clinical review. "
                "Evidence grade A (Bohannon 2006)."
            ),
            "severity": "moderate",
        })

    # Sway area alert
    if sway_val is not None and float(sway_val) > 200:
        alerts.append({
            "type": "risk",
            "biomarker": "postural_sway_area",
            "message": (
                f"Postural sway area {float(sway_val):.1f} mm\u00b2 exceeds the 200 mm\u00b2 threshold (eyes open). "
                "Increased sway is associated with elevated fall risk. "
                "Evidence grade A (Rocchi et al. 2006)."
            ),
            "severity": "moderate",
        })

    # Tremor alert
    if tremor_dom_freq is not None and 4.0 <= float(tremor_dom_freq) <= 6.0:
        alerts.append({
            "type": "observation",
            "biomarker": "tremor_dominant_frequency",
            "message": (
                f"Dominant tremor frequency {float(tremor_dom_freq):.1f} Hz falls within the parkinsonian "
                "range (4-6 Hz). Requires clinician confirmation. Camera artifacts may confound."
            ),
            "severity": "low",
        })

    # Trend-based alerts
    for biomarker_key, trend_series in trends.items():
        if len(trend_series) >= 3:
            recent = [t["value"] for t in trend_series[-3:] if t["value"] is not None]
            if len(recent) >= 3:
                pct_change = ((recent[-1] - recent[0]) / abs(recent[0])) * 100 if recent[0] else 0
                if biomarker_key == "gait_speed" and pct_change < -10:
                    alerts.append({
                        "type": "progression",
                        "biomarker": biomarker_key,
                        "message": (
                            f"Gait speed declining: {pct_change:.1f}% change over last {len(recent)} measurements. "
                            "May indicate disease progression. Evidence grade A."
                        ),
                        "severity": "high",
                    })

    # --- Evidence summary ---
    evidence_summary = (
        "Movement biomarker summary: gait features (Grade A, ICC 0.92), "
        "tremor frequency (Grade B, ICC 0.87), postural sway (Grade A, ICC 0.92). "
        "Trends computed from longitudinal biomarker storage. "
        "Decision-support only -- requires clinician review and correlation with in-person examination."
    )

    return {
        "patient_id": patient_id,
        "latest_analysis": latest_analysis,
        "trends": trends,
        "alerts": alerts,
        "evidence_summary": evidence_summary,
        "disclaimer": (
            "Decision-support only. Movement biomarkers require clinician review and "
            "correlation with in-person examination before clinical interpretation."
        ),
        "generated_at": now.isoformat(),
    }


# ===========================================================================
# 2. POST /multimodal-correlation -- Video + Voice correlation
# ===========================================================================

@router.post("/patient/{patient_id}/multimodal-correlation")
def post_multimodal_correlation(
    request: Request,
    patient_id: str,
    body: MultimodalCorrelationRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Compute video-voice multimodal correlation for a patient.

    Accepts analysis IDs for video and voice analyses, extracts relevant
    features, computes correlation coefficients with p-values, and returns
    evidence-based interpretation.

    Decision-support only: correlation does not imply causation.
    """
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)
    _require_movement_analyzer_consent(db=db, actor=actor, patient_id=patient_id)

    append_audit(
        patient_id, "multimodal_correlation", actor.actor_id,
        {"video_analysis_id": body.video_analysis_id, "voice_analysis_id": body.voice_analysis_id}, db,
    )

    # Fetch video features from snapshot
    snap = load_snapshot(patient_id, db)
    video_features: dict[str, float | None] = {
        "gait_speed": None,
        "tremor_amplitude": None,
        "movement_smoothness": None,
    }
    if snap:
        modalities = snap.get("modalities") or {}
        metrics = snap.get("metrics") or {}
        video_features["gait_speed"], _ = _extract_biomarker_value("gait_speed", modalities, metrics)
        tremor_mod = modalities.get("tremor") or {}
        video_features["tremor_amplitude"] = tremor_mod.get("amplitude_px") or tremor_mod.get("tremor_amplitude")
        video_features["movement_smoothness"] = metrics.get("smoothness_score") if metrics else None

    # Fetch voice features from AudioAnalysis (voice_report_json)
    voice_features: dict[str, float | None] = {
        "cpp": None,
        "speech_rate": None,
        "pause_duration": None,
    }
    from app.persistence.models import AudioAnalysis
    audio_row = (
        db.query(AudioAnalysis)
        .filter(
            AudioAnalysis.patient_id == patient_id,
            AudioAnalysis.analysis_id == body.voice_analysis_id,
        )
        .first()
    )
    if audio_row and audio_row.voice_report_json:
        try:
            voice_report = json.loads(audio_row.voice_report_json)
            voice_features["cpp"] = voice_report.get("cpp") or voice_report.get("cepstral_peak_prominence")
            voice_features["speech_rate"] = voice_report.get("speech_rate_wpm") or voice_report.get("speech_rate")
            voice_features["pause_duration"] = voice_report.get("mean_pause_duration_s") or voice_report.get("pause_duration")
        except (json.JSONDecodeError, TypeError):
            pass

    # Also try VoiceAnalysis table
    from app.persistence.models import VoiceAnalysis
    voice_row = (
        db.query(VoiceAnalysis)
        .filter(
            VoiceAnalysis.patient_id == patient_id,
        )
        .order_by(desc(VoiceAnalysis.created_at))
        .first()
    )
    if voice_row:
        if voice_features["speech_rate"] is None and voice_row.speech_pace_wpm:
            voice_features["speech_rate"] = float(voice_row.speech_pace_wpm)

    # Compute correlations between video and voice features
    correlations: list[dict[str, Any]] = []

    # We need arrays for correlation -- use historical biomarker trends + voice history
    # For single-session: compute point-wise correlation report
    # For longitudinal: query trend data and compute proper correlation

    video_biomarker_keys = ["gait_speed", "tremor_amplitude", "movement_smoothness"]
    voice_feature_keys = ["cpp", "speech_rate", "pause_duration"]

    # Build paired data from biomarker trends and voice analyses
    video_series = _query_biomarker_series(db, patient_id, "gait_speed", limit=20)
    voice_series = _query_voice_series(db, patient_id, limit=20)

    for vb_key in video_biomarker_keys:
        for vf_key in voice_feature_keys:
            corr_entry: dict[str, Any] = {
                "video_feature": vb_key,
                "voice_feature": vf_key,
                "correlation_coefficient": None,
                "p_value": None,
                "n_pairs": 0,
                "interpretation": "Insufficient paired data for correlation computation.",
                "evidence_grade": "C",
            }

            if video_series and voice_series:
                # Align by date (nearest match within 7 days)
                paired_video, paired_voice = _align_series_by_date(video_series, voice_series, max_days=7)

                if len(paired_video) >= 3 and len(paired_voice) >= 3:
                    try:
                        if body.correlation_type == "spearman":
                            coeff, pval = stats.spearmanr(paired_video, paired_voice)
                        else:
                            coeff, pval = stats.pearsonr(paired_video, paired_voice)

                        coeff = float(coeff) if coeff is not None and not math.isnan(coeff) else None
                        pval = float(pval) if pval is not None and not math.isnan(pval) else None

                        corr_entry["correlation_coefficient"] = round(coeff, 4) if coeff is not None else None
                        corr_entry["p_value"] = round(pval, 6) if pval is not None else None
                        corr_entry["n_pairs"] = len(paired_video)

                        if coeff is not None:
                            abs_coeff = abs(coeff)
                            if abs_coeff >= 0.5:
                                strength = "moderate-to-strong"
                            elif abs_coeff >= 0.3:
                                strength = "weak-to-moderate"
                            elif abs_coeff >= 0.1:
                                strength = "weak"
                            else:
                                strength = "negligible"

                            direction = "positive" if coeff > 0 else "negative"
                            sig_text = "statistically significant" if pval is not None and pval < 0.05 else "not statistically significant"

                            corr_entry["interpretation"] = (
                                f"{direction} {strength} correlation ({coeff:.3f}) between "
                                f"{vb_key.replace('_', ' ')} and {vf_key.replace('_', ' ')}. "
                                f"{sig_text} (p={pval:.4f}, n={len(paired_video)}). "
                                "Correlation does not imply causation. Grade C evidence."
                            )
                            corr_entry["evidence_grade"] = "C"
                    except Exception as e:
                        _log.warning("Correlation computation failed: %s", e)
                        corr_entry["interpretation"] = f"Computation error: {str(e)}"
                else:
                    corr_entry["n_pairs"] = len(paired_video)
                    corr_entry["interpretation"] = (
                        f"Only {len(paired_video)} paired observations available "
                        "(minimum 3 required). Collect more longitudinal data."
                    )

            correlations.append(corr_entry)

    # Store results
    for corr in correlations:
        if corr["correlation_coefficient"] is not None:
            db.add(MovementMultimodalCorrelation(
                patient_id=patient_id,
                clinic_id=actor.clinic_id,
                video_analysis_id=body.video_analysis_id,
                voice_analysis_id=body.voice_analysis_id,
                video_biomarker=corr["video_feature"],
                voice_feature=corr["voice_feature"],
                correlation_coefficient=corr["correlation_coefficient"],
                p_value=corr["p_value"],
                n_pairs=corr["n_pairs"],
                interpretation=corr["interpretation"],
                evidence_grade=corr["evidence_grade"],
                correlation_type=body.correlation_type,
                session_date=datetime.now(timezone.utc),
            ))
    db.commit()

    return {
        "patient_id": patient_id,
        "video_analysis_id": body.video_analysis_id,
        "voice_analysis_id": body.voice_analysis_id,
        "correlation_type": body.correlation_type,
        "correlations": correlations,
        "evidence_summary": (
            "Video-voice multimodal correlation provides exploratory cross-domain associations. "
            "Grade C evidence -- limited validation for video-voice movement correlation. "
            "Requires clinician interpretation. Correlation does not imply causation."
        ),
        "warning": (
            "These correlations are computed from limited paired observations and should be "
            "interpreted cautiously. False correlations may arise from small sample sizes."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ===========================================================================
# 3. POST /fall-risk-score -- Tinetti-style composite
# ===========================================================================

@router.post("/patient/{patient_id}/fall-risk-score")
def post_fall_risk_score(
    request: Request,
    patient_id: str,
    body: FallRiskRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Compute fall risk score combining video posture data with demographics.

    Returns Tinetti-style score (0-28) with evidence link.
    Grade C (limited evidence) -- shows appropriate warning.
    """
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)
    _require_movement_analyzer_consent(db=db, actor=actor, patient_id=patient_id)

    append_audit(
        patient_id, "fall_risk_scored", actor.actor_id,
        {"session_date": body.session_date}, db,
    )

    # Fetch patient age
    from app.persistence.models import Patient
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    patient_age: int | None = None
    if patient and patient.date_of_birth:
        try:
            dob = datetime.fromisoformat(str(patient.date_of_birth).replace("Z", "+00:00"))
            patient_age = int((datetime.now(timezone.utc) - dob).days / 365.25)
        except (ValueError, TypeError):
            patient_age = getattr(patient, "age", None)
    if patient_age is None:
        patient_age = getattr(patient, "age", 65) if patient else 65

    # Fetch latest snapshot for movement features
    snap = load_snapshot(patient_id, db)
    gait_speed: float | None = None
    sway_area: float | None = None

    if snap:
        modalities = snap.get("modalities") or {}
        metrics = snap.get("metrics") or {}
        gait_speed, _ = _extract_biomarker_value("gait_speed", modalities, metrics)
        sway_mod = modalities.get("posture_balance") or {}
        sway_area = sway_mod.get("sway_area_mm2") or sway_mod.get("sway_area")

    # Fetch medication data if available
    medication_risk_factor = 0.0
    if body.include_medications:
        from app.persistence.models import PatientMedication
        med_count = (
            db.query(PatientMedication)
            .filter(PatientMedication.patient_id == patient_id)
            .count()
        )
        # Polypharmacy (>5 meds) adds risk
        if med_count >= 5:
            medication_risk_factor = 1.0
        elif med_count >= 3:
            medication_risk_factor = 0.5

    # --- Compute Tinetti-style score (0-28) ---
    # Grade C: limited evidence for video-derived Tinetti proxy
    gait_score = 0.0
    balance_score = 0.0

    # Gait subscale (0-12) -- based on gait speed
    if gait_speed is not None:
        gs = float(gait_speed)
        if gs >= 1.2:
            gait_score = 12.0
        elif gs >= 1.0:
            gait_score = 10.0
        elif gs >= 0.8:
            gait_score = 8.0
        elif gs >= 0.6:
            gait_score = 6.0
        elif gs >= 0.4:
            gait_score = 4.0
        else:
            gait_score = 2.0
    else:
        gait_score = 6.0  # Unknown -- assign middle value

    # Balance subscale (0-16) -- based on sway area + age + meds
    if sway_area is not None:
        sa = float(sway_area)
        if sa < 100:
            balance_score = 12.0
        elif sa < 200:
            balance_score = 9.0
        elif sa < 400:
            balance_score = 6.0
        elif sa < 800:
            balance_score = 3.0
        else:
            balance_score = 1.0
    else:
        balance_score = 8.0  # Unknown -- assign middle value

    # Age adjustment (0-2 points deducted)
    age_component = 0.0
    if patient_age >= 80:
        age_component = 0.0
    elif patient_age >= 70:
        age_component = 1.0
    elif patient_age >= 60:
        age_component = 1.5
    else:
        age_component = 2.0

    # Medication adjustment
    med_component = 2.0 - medication_risk_factor  # Deduct up to 2 points

    # Compute total (Tinetti: gait 0-12 + balance 0-16 = 0-28)
    # We rescale: gait_score (0-12) + balance_score_adjusted (0-16)
    total_score = min(28.0, max(0.0, gait_score + balance_score + age_component + med_component - 2.0))
    total_score = round(total_score, 1)

    # Risk category
    if total_score >= 24:
        risk_category = "low"
        risk_interpretation = "Low fall risk. Continue monitoring."
    elif total_score >= 19:
        risk_category = "moderate"
        risk_interpretation = "Moderate fall risk. Consider fall prevention strategies."
    else:
        risk_category = "high"
        risk_interpretation = "High fall risk. Comprehensive fall assessment recommended."

    # Grade C warning
    warning_text = (
        "WARNING: This fall risk score is based on Grade C (limited evidence) video-derived "
        "proxies for Tinetti scale components. It is NOT a substitute for the validated "
        "Tinetti Performance-Oriented Mobility Assessment (POMA) administered by a clinician. "
        "Video-based balance assessment has not been prospectively validated against falls. "
        "Always confirm with in-person clinical evaluation."
    )

    session_date = datetime.now(timezone.utc)
    if body.session_date:
        try:
            session_date = datetime.fromisoformat(body.session_date.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            pass

    # Store result
    fall_risk = MovementFallRiskScore(
        patient_id=patient_id,
        clinic_id=actor.clinic_id,
        total_score=total_score,
        gait_score=round(gait_score, 1),
        balance_score=round(balance_score, 1),
        sway_component=round(balance_score, 1),
        speed_component=round(gait_score, 1),
        age_component=round(age_component, 1),
        medication_component=round(med_component, 1),
        risk_category=risk_category,
        evidence_grade="C",
        interpretation=risk_interpretation,
        warning_text=warning_text,
        session_date=session_date,
    )
    db.add(fall_risk)
    db.commit()

    return {
        "patient_id": patient_id,
        "tinetti_style_score": {
            "total": total_score,
            "max_possible": 28,
            "gait_subscale": round(gait_score, 1),
            "balance_subscale": round(balance_score, 1),
        },
        "components": {
            "gait_speed_m_s": gait_speed,
            "sway_area_mm2": sway_area,
            "age_years": patient_age,
            "age_component": round(age_component, 1),
            "medication_risk_factor": medication_risk_factor,
            "medication_component": round(med_component, 1),
        },
        "risk_category": risk_category,
        "interpretation": risk_interpretation,
        "evidence_grade": "C",
        "evidence_link": (
            "Tinetti ME. Performance-oriented assessment of mobility problems in elderly patients. "
            "J Am Geriatr Soc. 1986;34(2):119-126. Video proxy: Grade C -- limited validation."
        ),
        "warning": warning_text,
        "disclaimer": (
            "Decision-support only. This is NOT a clinical fall-risk determination. "
            "Requires in-person Tinetti or Berg Balance Scale assessment by a qualified clinician."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ===========================================================================
# 4. GET /progression -- Longitudinal progression tracking
# ===========================================================================

@router.get("/patient/{patient_id}/progression")
def get_progression(
    request: Request,
    patient_id: str,
    biomarker_filter: Optional[str] = None,
    months: int = 12,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Return longitudinal progression tracking for all movement biomarkers.

    Time series of all biomarkers across sessions with:
    - Rate of change per biomarker (% change per month)
    - Trajectory classification: stable / improving / declining / fluctuating
    - Confidence intervals on trends
    - Evidence-based interpretation
    """
    _require_authenticated_clinician(actor)
    _gate_patient_access(actor, patient_id, db)
    _require_movement_analyzer_consent(db=db, actor=actor, patient_id=patient_id)

    append_audit(
        patient_id, "progression_viewed", actor.actor_id,
        {"months": months, "biomarker_filter": biomarker_filter}, db,
    )

    from_date = datetime.now(timezone.utc)
    try:
        # SQLAlchemy text() for date arithmetic
        result = db.execute(
            text("SELECT NOW() - INTERVAL '{} months'".format(months))
        ).scalar()
        if result:
            from_date = result
    except Exception:
        from_date = datetime.now(timezone.utc)

    # Query biomarker trends
    query = db.query(MovementBiomarkerTrend).filter(
        MovementBiomarkerTrend.patient_id == patient_id,
        MovementBiomarkerTrend.session_date >= from_date,
    )
    if biomarker_filter:
        query = query.filter(MovementBiomarkerTrend.biomarker_type == biomarker_filter)

    rows = query.order_by(MovementBiomarkerTrend.session_date).all()

    # Group by biomarker type
    biomarker_series: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        bt = row.biomarker_type
        if bt not in biomarker_series:
            biomarker_series[bt] = []
        biomarker_series[bt].append({
            "date": row.session_date.isoformat() if row.session_date else None,
            "value": row.value,
            "confidence": row.confidence,
            "evidence_grade": row.evidence_grade,
            "source": row.source_type,
        })

    # Compute progression metrics per biomarker
    progression: dict[str, Any] = {}
    overall_trend_scores: list[float] = []

    for bt, series in biomarker_series.items():
        if not series:
            continue

        values = [s["value"] for s in series if s["value"] is not None]
        dates = [s["date"] for s in series if s["value"] is not None]

        if len(values) < 2:
            progression[bt] = {
                "time_series": series,
                "n_sessions": len(series),
                "rate_of_change_pct_per_month": None,
                "trajectory": "insufficient_data",
                "confidence_interval": None,
                "evidence_grade": "C",
                "interpretation": "Insufficient data for trend analysis (need >= 2 measurements).",
            }
            continue

        # Rate of change: linear regression on values vs time index
        x = np.arange(len(values), dtype=float)
        y = np.array(values, dtype=float)

        try:
            slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
        except Exception:
            slope, r_value, p_value, std_err = 0.0, 0.0, 1.0, 0.0

        # Mean value for % change calculation
        mean_val = float(np.mean(y)) if len(y) > 0 else 0.0
        if abs(mean_val) < 1e-12:
            mean_val = 1e-12

        # Time span in months
        time_span_months = max(0.1, months)
        rate_pct_per_month = (slope / mean_val) * 100.0 if mean_val != 0 else 0.0
        rate_pct_per_month = round(float(rate_pct_per_month), 4)

        # Trajectory classification
        if len(values) >= 3:
            std_val = float(np.std(y))
            cv = std_val / abs(mean_val) if mean_val != 0 else 0.0

            if cv > 0.3:
                trajectory = "fluctuating"
            elif abs(rate_pct_per_month) < 2.0:
                trajectory = "stable"
            elif rate_pct_per_month > 0:
                # For most biomarkers, higher is better (gait_speed, stride_length)
                # For sway_area and tremor, higher is worse
                if bt in {"sway_area", "tremor_amplitude", "step_time_variability"}:
                    trajectory = "declining"
                else:
                    trajectory = "improving"
            else:
                if bt in {"sway_area", "tremor_amplitude", "step_time_variability"}:
                    trajectory = "improving"
                else:
                    trajectory = "declining"
        else:
            if abs(rate_pct_per_month) < 2.0:
                trajectory = "stable"
            elif rate_pct_per_month > 0:
                trajectory = "improving" if bt not in {"sway_area", "tremor_amplitude", "step_time_variability"} else "declining"
            else:
                trajectory = "declining" if bt not in {"sway_area", "tremor_amplitude", "step_time_variability"} else "improving"

        # 95% CI on slope
        ci_half_width = 1.96 * std_err if std_err else 0.0
        confidence_interval = {
            "slope_95_ci": [round(float(slope - ci_half_width), 6), round(float(slope + ci_half_width), 6)],
            "r_squared": round(float(r_value ** 2), 4) if r_value is not None else None,
            "p_value": round(float(p_value), 6) if p_value is not None else None,
        }

        # Evidence grade based on number of sessions
        n_sessions = len(series)
        if n_sessions >= 10:
            evidence_grade = "B"
        elif n_sessions >= 5:
            evidence_grade = "B"
        else:
            evidence_grade = "C"

        # Safe clinical interpretation
        biomarker_labels = {
            "gait_speed": "Gait speed",
            "stride_length": "Stride length",
            "cadence": "Cadence",
            "step_time_variability": "Step time variability",
            "tremor_amplitude": "Tremor amplitude",
            "tremor_dominant_frequency": "Tremor dominant frequency",
            "taps_per_10s": "Finger tapping rate",
            "sway_area": "Postural sway area",
            "sway_velocity": "Sway velocity",
            "asymmetry_index": "Asymmetry index",
            "arm_swing_amplitude": "Arm swing amplitude",
            "movement_smoothness": "Movement smoothness",
            "finger_tap_iti_cv": "Finger tap interval variability",
            "dual_task_cost": "Dual-task gait cost",
            "postural_sway_area": "Postural sway area",
            "body_lean_angle": "Body lean angle",
            "balance_confidence": "Balance confidence",
            "tremor_band_power_4_6hz": "Tremor band power (4-6 Hz)",
            "tremor_band_power_8_12hz": "Tremor band power (8-12 Hz)",
        }
        label = biomarker_labels.get(bt, bt)

        if trajectory == "stable":
            interpretation = (
                f"{label} is stable over {n_sessions} sessions ({time_span_months:.1f} months). "
                f"Rate of change: {rate_pct_per_month:.2f}% per month. "
                f"No significant change detected. Continue routine monitoring."
            )
        elif trajectory == "improving":
            interpretation = (
                f"{label} shows improvement over {n_sessions} sessions ({time_span_months:.1f} months). "
                f"Rate of change: {rate_pct_per_month:.2f}% per month. "
                f"Positive trend observed. May indicate treatment response or measurement variability."
            )
        elif trajectory == "declining":
            interpretation = (
                f"{label} shows decline over {n_sessions} sessions ({time_span_months:.1f} months). "
                f"Rate of change: {rate_pct_per_month:.2f}% per month. "
                f"Declining trend may indicate disease progression. "
                f"Warrants clinical review and correlation with symptom assessment."
            )
        else:  # fluctuating
            interpretation = (
                f"{label} shows fluctuating pattern over {n_sessions} sessions ({time_span_months:.1f} months). "
                f"High variability (CV={cv:.2f}) suggests inconsistent measurements or variable clinical state. "
                f"Consider standardizing assessment conditions or investigate confounding factors."
            )

        progression[bt] = {
            "time_series": series,
            "n_sessions": n_sessions,
            "rate_of_change_pct_per_month": rate_pct_per_month,
            "trajectory": trajectory,
            "confidence_interval": confidence_interval,
            "evidence_grade": evidence_grade,
            "interpretation": interpretation,
        }

        overall_trend_scores.append(rate_pct_per_month)

    # Overall summary
    if overall_trend_scores:
        avg_change = float(np.mean(overall_trend_scores))
        declining_count = sum(1 for s in overall_trend_scores if s < -2.0)
        improving_count = sum(1 for s in overall_trend_scores if s > 2.0)
        stable_count = len(overall_trend_scores) - declining_count - improving_count

        if declining_count > improving_count and declining_count > stable_count:
            overall_trajectory = "declining"
        elif improving_count > declining_count and improving_count > stable_count:
            overall_trajectory = "improving"
        else:
            overall_trajectory = "stable_or_mixed"
    else:
        avg_change = 0.0
        overall_trajectory = "insufficient_data"

    evidence_summary = (
        f"Longitudinal progression analysis over {months} months. "
        f"{len(biomarker_series)} biomarkers tracked across {sum(len(s) for s in biomarker_series.values())} total measurements. "
        f"Overall trend: {overall_trajectory}. "
        "Decision-support only -- trends require clinician interpretation and correlation with clinical assessment. "
        "Individual variability, measurement conditions, and medication changes may confound trend analysis."
    )

    return {
        "patient_id": patient_id,
        "analysis_window_months": months,
        "biomarker_progression": progression,
        "overall_summary": {
            "trajectory": overall_trajectory,
            "average_rate_of_change_pct_per_month": round(avg_change, 4),
            "biomarkers_tracked": len(biomarker_series),
            "total_measurements": sum(len(s) for s in biomarker_series.values()),
        },
        "evidence_summary": evidence_summary,
        "disclaimer": (
            "Decision-support only. Longitudinal trends require clinician review and "
            "correlation with in-person examination. Measurement variability and confounding "
            "factors may affect trend validity."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

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


def _fetch_latest_pose_data(patient_id: str, db: Session) -> dict[str, Any] | None:
    """Fetch the latest pose data for a patient from video assessment sessions.

    Returns pose sequence dict with frames, fps, task_type, etc.
    Returns None if no pose data is available.
    """
    from app.persistence.models import VideoAssessmentSession

    # Try video assessment sessions
    va_session = (
        db.query(VideoAssessmentSession)
        .filter(VideoAssessmentSession.patient_id == patient_id)
        .filter(VideoAssessmentSession.overall_status == "completed")
        .order_by(desc(VideoAssessmentSession.updated_at))
        .first()
    )
    if va_session and va_session.session_json:
        try:
            session_data = json.loads(va_session.session_json)
            pose_data = session_data.get("pose_data") or session_data.get("pose_sequence")
            if pose_data and pose_data.get("frames"):
                return {
                    "frames": pose_data["frames"],
                    "fps": pose_data.get("fps", 30.0),
                    "duration_s": pose_data.get("duration_s") or pose_data.get("duration_sec"),
                    "task_type": session_data.get("task_type", "gait"),
                    "side": session_data.get("side", "right"),
                    "summary": pose_data.get("summary", {}),
                    "eyes_closed_segment": pose_data.get("eyes_closed_segment"),
                }
        except (json.JSONDecodeError, TypeError):
            pass

    # Try movement snapshot for embedded pose data
    snap = load_snapshot(patient_id, db)
    if snap:
        embedded_pose = snap.get("pose_data") or snap.get("pose_sequence")
        if embedded_pose and embedded_pose.get("frames"):
            return {
                "frames": embedded_pose["frames"],
                "fps": embedded_pose.get("fps", 30.0),
                "duration_s": embedded_pose.get("duration_s"),
                "task_type": embedded_pose.get("task_type", "gait"),
                "side": embedded_pose.get("side", "right"),
                "summary": embedded_pose.get("summary", {}),
            }

    return None


def _store_biomarker_results(
    patient_id: str,
    actor: AuthenticatedActor,
    task_type: str,
    pipeline_result: dict[str, Any],
    db: Session,
) -> None:
    """Store pipeline biomarker results into MovementBiomarkerTrend table.

    Extracts key biomarker values from pipeline results and stores them
    with evidence grades and confidence scores for longitudinal tracking.
    """
    now = datetime.now(timezone.utc)

    # Mapping of task_type to biomarker extraction rules
    extraction_rules: dict[str, list[tuple[str, str, str]]] = {
        "gait": [
            ("gait_speed", "gait_analysis.gait_speed.value", "A"),
            ("stride_length", "gait_analysis.stride_length.value", "A"),
            ("cadence", "gait_analysis.cadence.value", "A"),
            ("step_time_variability", "gait_analysis.step_time_variability_cv.value", "A"),
            ("asymmetry_index", "gait_analysis.asymmetry_index.value", "B"),
            ("arm_swing_amplitude", "gait_analysis.arm_swing_amplitude_left.value", "B"),
            ("dual_task_cost", "gait_analysis.dual_task_cost.value", "A"),
        ],
        "tremor": [
            ("tremor_amplitude", "tremor_analysis.tremor_amplitude.value", "C"),
            ("tremor_dominant_frequency", "tremor_analysis.dominant_frequency.value", "B"),
            ("tremor_band_power_4_6hz", "tremor_analysis.band_power_4_6_hz.value", "B"),
            ("tremor_band_power_8_12hz", "tremor_analysis.band_power_8_12_hz.value", "B"),
        ],
        "finger_tap": [
            ("taps_per_10s", "finger_tap_analysis.taps_per_10s.value", "A"),
            ("finger_tap_iti_cv", "finger_tap_analysis.inter_tap_interval_cv.value", "B"),
            ("movement_smoothness", "finger_tap_analysis.regularity_score.value", "C"),
        ],
        "posture": [
            ("sway_area", "posture_analysis.sway_area.value", "B"),
            ("sway_velocity", "posture_analysis.sway_velocity.value", "B"),
            ("body_lean_angle", "posture_analysis.body_lean_angle.value", "C"),
            ("balance_confidence", "posture_analysis.balance_confidence_score.value", "C"),
        ],
    }

    rules = extraction_rules.get(task_type, [])
    for biomarker_type, path, default_grade in rules:
        value = _get_nested_value(pipeline_result, path)
        if value is not None:
            try:
                float_val = float(value)
                # Get confidence from nested result
                conf_path = path.rsplit(".", 1)[0] + ".confidence"
                confidence = _get_nested_value(pipeline_result, conf_path) or 0.5
                # Get grade
                grade_path = path.rsplit(".", 1)[0] + ".grade"
                grade = _get_nested_value(pipeline_result, grade_path) or default_grade

                trend = MovementBiomarkerTrend(
                    patient_id=patient_id,
                    clinic_id=actor.clinic_id,
                    biomarker_type=biomarker_type,
                    value=float_val,
                    confidence=float(confidence) if confidence else 0.5,
                    evidence_grade=grade or default_grade,
                    session_date=now,
                    source_analysis_id=None,
                    source_type="movement_analyzer",
                    metadata_json=json.dumps({"task_type": task_type, "pipeline_version": "1.0.0"}),
                )
                db.add(trend)
            except (ValueError, TypeError):
                pass

    db.commit()


def _get_nested_value(data: dict[str, Any], path: str) -> Any:
    """Get a nested dictionary value by dot-separated path."""
    keys = path.split(".")
    current: Any = data
    for key in keys:
        if isinstance(current, dict) and key in current:
            current = current[key]
        else:
            return None
    return current


def _query_biomarker_series(
    db: Session, patient_id: str, biomarker_type: str, limit: int = 20
) -> list[tuple[str, float]]:
    """Query biomarker trend series as list of (date_iso, value) tuples."""
    rows = (
        db.query(MovementBiomarkerTrend)
        .filter(
            MovementBiomarkerTrend.patient_id == patient_id,
            MovementBiomarkerTrend.biomarker_type == biomarker_type,
            MovementBiomarkerTrend.value.isnot(None),
        )
        .order_by(MovementBiomarkerTrend.session_date)
        .limit(limit)
        .all()
    )
    return [
        (r.session_date.isoformat() if r.session_date else "", float(r.value))
        for r in rows if r.value is not None
    ]


def _query_voice_series(
    db: Session, patient_id: str, limit: int = 20
) -> list[tuple[str, float]]:
    """Query voice analysis series as list of (date_iso, speech_rate) tuples."""
    from app.persistence.models import AudioAnalysis
    rows = (
        db.query(AudioAnalysis)
        .filter(
            AudioAnalysis.patient_id == patient_id,
            AudioAnalysis.voice_report_json.isnot(None),
        )
        .order_by(AudioAnalysis.created_at)
        .limit(limit)
        .all()
    )
    result: list[tuple[str, float]] = []
    for row in rows:
        try:
            report = json.loads(row.voice_report_json or "{}")
            sr = report.get("speech_rate_wpm") or report.get("speech_rate")
            if sr is not None:
                result.append((row.created_at.isoformat() if row.created_at else "", float(sr)))
        except (json.JSONDecodeError, ValueError, TypeError):
            continue
    return result


def _align_series_by_date(
    series_a: list[tuple[str, float]],
    series_b: list[tuple[str, float]],
    max_days: int = 7,
) -> tuple[list[float], list[float]]:
    """Align two time series by nearest date match within max_days.

    Returns paired (values_a, values_b) lists.
    """
    from datetime import timedelta

    paired_a: list[float] = []
    paired_b: list[float] = []

    for date_a_str, val_a in series_a:
        try:
            date_a = datetime.fromisoformat(date_a_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            continue

        best_b: float | None = None
        best_delta = timedelta(days=max_days + 1)

        for date_b_str, val_b in series_b:
            try:
                date_b = datetime.fromisoformat(date_b_str.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                continue
            delta = abs(date_a - date_b)
            if delta <= timedelta(days=max_days) and delta < best_delta:
                best_delta = delta
                best_b = val_b

        if best_b is not None:
            paired_a.append(val_a)
            paired_b.append(best_b)

    return paired_a, paired_b
