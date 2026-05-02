"""Biometrics analytics façade — reads ``WearableDailySummary`` / observations and
delegates statistics to ``deepsynaps_biometrics``. Used by ``/api/biometrics`` routes.

Separate from clinician triage ``WearableAlertFlag`` — ``PredictiveAlert`` here is
research-grade z-score / rule output for dashboards and AI analytics disclaimers.
"""

from __future__ import annotations

import json
import logging
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import numpy as np
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, require_patient_owner
from app.errors import ApiServiceError
from app.persistence.models import (
    DeviceConnection,
    Patient,
    User,
    WearableDailySummary,
    WearableObservation,
)
from app.repositories.patients import resolve_patient_clinic_id
from app.settings import get_settings
from deepsynaps_biometrics.baseline import estimate_personal_baseline_and_deviation
from deepsynaps_biometrics.correlation import compute_biomarker_correlation_matrix
from deepsynaps_biometrics.prediction import generate_biometric_alerts
from deepsynaps_biometrics.schemas import PersonalBaselineProfile, PredictiveAlert
from app.services.wearable_flags import run_flag_checks

_logger = logging.getLogger(__name__)

_MAX_SYNC_BATCH = 5_000
_MAX_DATA_JSON_BYTES = 32 * 1024

_FEATURE_FIELDS = (
    "rhr_bpm",
    "hrv_ms",
    "sleep_duration_h",
    "sleep_consistency_score",
    "steps",
    "spo2_pct",
    "skin_temp_delta",
    "readiness_score",
    "mood_score",
    "pain_score",
    "anxiety_score",
)

_DEMO_PATIENT_ACTOR_ID = "actor-patient-demo"
_DEMO_ALLOWED_ENVS = frozenset({"development", "test"})


def resolve_analytics_patient_id(
    actor: AuthenticatedActor,
    db: Session,
    *,
    patient_id: Optional[str],
) -> str:
    """Return the Patient.id for analytics scope; enforce authz."""
    if actor.role == "guest":
        raise ApiServiceError(
            code="authentication_required",
            message="Authentication is required.",
            status_code=401,
        )

    if patient_id:
        exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
        if not exists:
            raise ApiServiceError(code="not_found", message="Patient not found.", status_code=404)

        if actor.role == "patient":
            own = _patient_id_for_actor(actor, db)
            if own != patient_id:
                raise ApiServiceError(
                    code="cross_clinic_access_denied",
                    message="Patients may only access their own biometrics.",
                    status_code=403,
                )
            return patient_id

        if actor.role in ("clinician", "supervisor", "reviewer", "technician", "admin"):
            require_patient_owner(actor, clinic_id)
            return patient_id

        raise ApiServiceError(code="forbidden", message="Insufficient permissions.", status_code=403)

    # Implicit self — patient portal users only
    if actor.role != "patient":
        raise ApiServiceError(
            code="patient_id_required",
            message="Specify patient_id for clinician or staff access.",
            status_code=400,
        )
    return _patient_id_for_actor(actor, db)


def _patient_id_for_actor(actor: AuthenticatedActor, db: Session) -> str:
    """Mirror patient portal email match + demo bypass."""
    if actor.role not in ("patient", "admin"):
        raise ApiServiceError(code="patient_role_required", message="Patient role required.", status_code=403)

    if actor.actor_id == _DEMO_PATIENT_ACTOR_ID:
        settings = get_settings()
        app_env = (getattr(settings, "app_env", None) or "production").lower()
        if app_env not in _DEMO_ALLOWED_ENVS:
            raise ApiServiceError(code="demo_disabled", message="Demo bypass unavailable.", status_code=403)
        patient = (
            db.query(Patient)
            .filter(Patient.email.in_(["patient@deepsynaps.com", "patient@demo.com"]))
            .first()
        )
        if patient:
            return patient.id
        raise ApiServiceError(code="patient_not_linked", message="No demo patient record.", status_code=404)

    user = db.query(User).filter_by(id=actor.actor_id).first()
    if user is None:
        raise ApiServiceError(code="not_found", message="User account not found.", status_code=404)
    patient = db.query(Patient).filter(Patient.email == user.email).first()
    if patient is None:
        raise ApiServiceError(code="patient_not_linked", message="No patient record linked.", status_code=404)
    return patient.id


def load_summaries_window(
    db: Session,
    patient_id: str,
    *,
    days: int,
) -> list[WearableDailySummary]:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    return (
        db.query(WearableDailySummary)
        .filter(
            WearableDailySummary.patient_id == patient_id,
            WearableDailySummary.date >= cutoff,
        )
        .order_by(WearableDailySummary.date.asc())
        .all()
    )


def summaries_to_feature_matrix(
    summaries: list[WearableDailySummary],
) -> dict[str, list[float]]:
    """One scalar per calendar day per feature — mean across sources when duplicated."""
    by_date: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for s in summaries:
        for field in _FEATURE_FIELDS:
            v = getattr(s, field, None)
            if v is not None:
                by_date[s.date][field].append(float(v))
    dates = sorted(by_date.keys())
    matrix: dict[str, list[float]] = {}
    for field in _FEATURE_FIELDS:
        col: list[float] = []
        for d in dates:
            vals = by_date[d].get(field, [])
            col.append(float(np.nanmean(vals)) if vals else float("nan"))
        # only include if any non-nan
        if any(np.isfinite(x) for x in col):
            matrix[field] = col
    return matrix


def biometrics_summary_payload(
    db: Session,
    patient_id: str,
    *,
    days: int,
) -> dict[str, Any]:
    summaries = load_summaries_window(db, patient_id, days=days)
    by_source: dict[str, int] = defaultdict(int)
    for s in summaries:
        by_source[s.source] += 1
    obs_count = (
        db.query(WearableObservation)
        .filter(WearableObservation.patient_id == patient_id)
        .count()
    )
    return {
        "patient_id": patient_id,
        "window_days": days,
        "daily_summary_rows": len(summaries),
        "by_source": dict(by_source),
        "observation_count_total": obs_count,
        "disclaimer": (
            "Consumer wearable metrics are informational; correlation and z-score "
            "outputs are for analytics only and are not diagnostic."
        ),
    }


def correlation_payload(matrix: dict[str, list[float]]) -> dict[str, Any]:
    clean = {k: v for k, v in matrix.items() if len(v) >= 3}
    if len(clean) < 2:
        return {
            "matrix": {},
            "note": "Need at least two features with ≥3 days of data for correlation.",
            "feature_keys_used": list(clean.keys()),
        }
    # align lengths — take minimum length (truncate tail)
    n = min(len(v) for v in clean.values())
    aligned = {k: v[-n:] for k, v in clean.items()}
    mat = compute_biomarker_correlation_matrix(aligned)
    flat = {f"{a}:{b}": v for (a, b), v in mat.items()}
    return {
        "matrix": flat,
        "n_days_aligned": n,
        "feature_keys_used": list(aligned.keys()),
        "disclaimer": "Correlation is associative only and does not imply causation.",
    }


def features_payload(matrix: dict[str, list[float]]) -> dict[str, Any]:
    """Daily aggregates + simple rolling where enough history exists."""
    out: dict[str, Any] = {"daily": {}, "rolling_7d": {}}
    for key, series in matrix.items():
        arr = np.asarray(series, dtype=float)
        finite = arr[np.isfinite(arr)]
        if finite.size:
            out["daily"][f"{key}_mean"] = float(np.nanmean(arr))
            out["daily"][f"{key}_std"] = float(np.nanstd(arr))
        if len(arr) >= 7:
            tail = arr[-7:]
            tail = tail[np.isfinite(tail)]
            if tail.size:
                out["rolling_7d"][f"{key}_mean_7d"] = float(np.mean(tail))
    out["engine"] = "deepsynaps_biometrics.features"
    return out


def baseline_payload(
    matrix: dict[str, list[float]],
    *,
    patient_id: str,
    feature: str,
) -> PersonalBaselineProfile | dict[str, str]:
    if feature not in matrix:
        return {
            "message": f"No data for feature '{feature}'. Try: {sorted(matrix.keys())}",
        }
    series = matrix[feature]
    clean = [float(x) for x in series if np.isfinite(x)]
    if len(clean) < 4:
        return {"message": "Need at least 4 days with values for baseline."}
    try:
        profile, z = estimate_personal_baseline_and_deviation(
            clean,
            user_id=patient_id,
            feature_name=feature,
            window_days=len(clean),
            effective_from_utc=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        )
        del z  # exposed via separate key if needed
        return profile
    except ValueError as e:
        return {"message": str(e)}


def alerts_payload(
    matrix: dict[str, list[float]],
    *,
    patient_id: str,
) -> list[PredictiveAlert]:
    z_map: dict[str, float] = {}
    for key, series in matrix.items():
        clean = [float(x) for x in series if np.isfinite(x)]
        if len(clean) < 4:
            continue
        try:
            _, z = estimate_personal_baseline_and_deviation(
                clean,
                user_id=patient_id,
                feature_name=key,
                window_days=len(clean) - 1,
                effective_from_utc=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            )
            z_map[key] = z
        except ValueError:
            continue
    return generate_biometric_alerts(user_id=patient_id, z_scores=z_map)


# ── Sync persistence (mirrors wearable_router caps) ───────────────────────────


def persist_biometric_sync_batch(
    db: Session,
    patient_id: str,
    *,
    batch: list[dict[str, Any]],
    run_flag_checks_after: bool = True,
) -> dict[str, Any]:
    if len(batch) > _MAX_SYNC_BATCH:
        raise ApiServiceError(
            code="batch_too_large",
            message=f"At most {_MAX_SYNC_BATCH} rows per request.",
            status_code=422,
        )

    created_obs = 0
    skipped_obs = 0
    upserted_summaries = 0
    for raw in batch:
        kind = raw.get("kind") or raw.get("type") or "observation"
        if kind in ("daily_summary", "daily-summary"):
            if _upsert_one_summary(db, patient_id, raw, commit=False):
                upserted_summaries += 1
        else:
            c, sk = _insert_one_observation(db, patient_id, raw, commit=False)
            created_obs += c
            skipped_obs += sk

    db.commit()

    new_flags = 0
    if run_flag_checks_after and (created_obs or upserted_summaries):
        flags = run_flag_checks(patient_id, None, db)
        new_flags = len(flags)

    return {
        "created_observations": created_obs,
        "skipped_observations": skipped_obs,
        "upserted_daily_summaries": upserted_summaries,
        "new_clinical_flags": new_flags,
    }


def _upsert_one_summary(
    db: Session, patient_id: str, raw: dict[str, Any], *, commit: bool
) -> bool:
    source = raw.get("source")
    date = raw.get("date")
    if not source or not date:
        return False
    existing = (
        db.query(WearableDailySummary)
        .filter_by(patient_id=patient_id, source=source, date=date)
        .first()
    )
    dj = raw.get("data_json")
    data_json_str = json.dumps(dj) if dj else None
    if data_json_str is not None and len(data_json_str) > _MAX_DATA_JSON_BYTES:
        raise ApiServiceError(
            code="data_json_too_large",
            message=f"data_json exceeds {_MAX_DATA_JSON_BYTES} bytes.",
            status_code=422,
        )

    fields = (
        "rhr_bpm",
        "hrv_ms",
        "sleep_duration_h",
        "sleep_consistency_score",
        "steps",
        "spo2_pct",
        "skin_temp_delta",
        "readiness_score",
        "mood_score",
        "pain_score",
        "anxiety_score",
    )

    if existing:
        for field in fields:
            if raw.get(field) is not None:
                setattr(existing, field, raw.get(field))
        if data_json_str:
            existing.data_json = data_json_str
        existing.synced_at = datetime.now(timezone.utc)
    else:
        db.add(
            WearableDailySummary(
                id=str(uuid.uuid4()),
                patient_id=patient_id,
                source=source,
                date=date,
                **{f: raw.get(f) for f in fields},
                data_json=data_json_str,
            )
        )
    if commit:
        db.commit()
    return True


def _insert_one_observation(
    db: Session, patient_id: str, raw: dict[str, Any], *, commit: bool
) -> tuple[int, int]:
    source = raw.get("source")
    metric_type = raw.get("metric_type")
    observed_at_raw = raw.get("observed_at")
    if not source or not metric_type or not observed_at_raw:
        return 0, 1
    try:
        observed_at = datetime.fromisoformat(str(observed_at_raw).replace("Z", "+00:00"))
    except ValueError:
        return 0, 1

    db.add(
        WearableObservation(
            id=str(uuid.uuid4()),
            patient_id=patient_id,
            connection_id=raw.get("connection_id"),
            source=source,
            source_type=raw.get("source_type") or "wearable",
            metric_type=metric_type,
            value=raw.get("value"),
            value_text=raw.get("value_text"),
            unit=raw.get("unit"),
            observed_at=observed_at,
            aggregation_window=raw.get("aggregation_window"),
            quality_flag=raw.get("quality_flag") or "good",
        )
    )
    if commit:
        db.commit()
    return 1, 0


def touch_connection_last_sync(
    db: Session, connection_id: Optional[str], patient_id: str
) -> None:
    if not connection_id:
        return
    conn = (
        db.query(DeviceConnection)
        .filter_by(id=connection_id, patient_id=patient_id)
        .first()
    )
    if conn is None:
        return
    now = datetime.now(timezone.utc)
    conn.last_sync_at = now
    conn.updated_at = now
    db.commit()
