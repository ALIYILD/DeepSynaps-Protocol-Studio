"""DeepTwin 360 Dashboard payload builder.

Aggregates real, observed patient data across 22 clinical domains for the
DeepTwin 360 view. The contract is defined in
``docs/deeptwin/deeptwin-360-dashboard.md``.

Honesty rules (enforced here, not in the UI):

- Each domain is reported with one of: ``available``, ``partial``,
  ``missing``, ``unavailable``. We never invent values.
- ``unavailable`` is reserved for domains that the platform has no
  ingestion path for at all (no ORM model, no service). The dashboard
  surfaces this so a clinician knows the gap is structural, not data-
  collection.
- ``missing`` means the platform supports the domain but this patient has
  no rows yet.
- ``partial`` means rows exist but coverage is sparse (e.g. <5
  assessments in 90 days).
- ``available`` means rows exist with reasonable coverage.

Prediction confidence is reported with ``status="placeholder"`` and
``real_ai=False`` until a validated model is wired in. We never claim
calibrated confidence we don't have.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    AudioAnalysis,
    ClinicalSession,
    Message,
    MriAnalysis,
    OutcomeEvent,
    OutcomeSeries,
    Patient,
    PatientMedication,
    PhenotypeAssignment,
    QEEGRecord,
    VideoAnalysis,
    VoiceAnalysis,
    WearableAlertFlag,
    WearableDailySummary,
    WearableObservation,
)

DOMAIN_KEYS = (
    "identity",
    "diagnosis",
    "symptoms_goals",
    "assessments",
    "qeeg",
    "mri",
    "video",
    "voice",
    "text",
    "biometrics",
    "wearables",
    "cognitive_tasks",
    "medications",
    "labs",
    "treatment_sessions",
    "safety_flags",
    "lifestyle",
    "environment",
    "caregiver_reports",
    "clinical_documents",
    "outcomes",
    "twin_predictions",
)
assert len(DOMAIN_KEYS) == 22

DOMAIN_LABELS: dict[str, str] = {
    "identity": "Identity / demographics",
    "diagnosis": "Diagnosis / phenotype",
    "symptoms_goals": "Symptoms / goals",
    "assessments": "Assessments",
    "qeeg": "EEG / qEEG",
    "mri": "MRI / imaging",
    "video": "Video",
    "voice": "Voice",
    "text": "Text / language",
    "biometrics": "Biometrics",
    "wearables": "Wearables",
    "cognitive_tasks": "Cognitive tasks",
    "medications": "Medication / supplements",
    "labs": "Labs / blood biomarkers",
    "treatment_sessions": "Treatment sessions",
    "safety_flags": "Adverse events / safety flags",
    "lifestyle": "Lifestyle / sleep / diet",
    "environment": "Environment",
    "caregiver_reports": "Family / teacher / caregiver reports",
    "clinical_documents": "Clinical documents",
    "outcomes": "Outcomes",
    "twin_predictions": "DeepTwin predictions and confidence",
}

# Domains the platform has no real ingestion path for yet — the dashboard
# is honest about it instead of inventing values.
UNAVAILABLE_DOMAINS = frozenset({
    "cognitive_tasks",
    "labs",
    "environment",
    "caregiver_reports",
})

DASHBOARD_DISCLAIMER = (
    "Decision-support only. Requires clinician review. "
    "Correlation does not imply causation. Predictions are uncalibrated "
    "unless validated. Not an autonomous treatment recommendation."
)


# ---------------------------------------------------------------------------
# Per-domain builders
# ---------------------------------------------------------------------------

def _count_and_latest(
    session: Session, model: Any, patient_id: str, ts_col: str | None = None
) -> tuple[int, str | None]:
    """Return (count, latest_iso) for rows on this model with patient_id."""
    if not hasattr(model, "patient_id"):
        return 0, None
    n = session.scalar(
        select(func.count()).select_from(model).where(model.patient_id == patient_id)
    ) or 0
    latest_iso: str | None = None
    if n and ts_col and hasattr(model, ts_col):
        latest = session.scalar(
            select(func.max(getattr(model, ts_col))).where(model.patient_id == patient_id)
        )
        if latest is not None:
            latest_iso = latest.isoformat() if hasattr(latest, "isoformat") else str(latest)
    return int(n), latest_iso


def _status_from_count(n: int, *, partial_below: int = 1) -> str:
    if n == 0:
        return "missing"
    if n < partial_below:
        return "partial"
    return "available"


def _domain(
    key: str,
    *,
    status: str,
    record_count: int = 0,
    last_updated: str | None = None,
    summary: str = "",
    warnings: list[str] | None = None,
    source_links: list[dict[str, str]] | None = None,
    upload_links: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "key": key,
        "label": DOMAIN_LABELS[key],
        "status": status,
        "record_count": int(record_count),
        "last_updated": last_updated,
        "summary": summary,
        "warnings": list(warnings or []),
        "source_links": list(source_links or []),
        # Quick-upload entry points so the doctor can add data directly from
        # the 360 dashboard. Each entry is a {label, href, kind} hint that
        # the frontend renders as a button. ``href`` points to the existing
        # upload surface (e.g. qEEG analyzer, assessments hub) — we never
        # invent a new one here.
        "upload_links": list(upload_links or []),
    }


def _identity(session: Session, patient: Patient) -> dict[str, Any]:
    return _domain(
        "identity",
        status="available",
        record_count=1,
        last_updated=patient.updated_at.isoformat() if patient.updated_at else None,
        summary=(
            f"{patient.first_name or ''} {patient.last_name or ''}".strip()
            or patient.id
        ),
        upload_links=[{"label": "Edit profile", "href": f"/patients/{patient.id}", "kind": "profile"}],
    )


def _decode_secondary_conditions(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if isinstance(decoded, list):
        return [str(x) for x in decoded if x]
    return []


def _diagnosis(session: Session, patient: Patient) -> dict[str, Any]:
    n_phen = session.scalar(
        select(func.count()).select_from(PhenotypeAssignment).where(
            PhenotypeAssignment.patient_id == patient.id
        )
    ) or 0
    primary = (patient.primary_condition or "").strip()
    secondary = _decode_secondary_conditions(getattr(patient, "secondary_conditions", None))
    has_dx = bool(primary or secondary or n_phen)
    summary = primary or "No primary diagnosis recorded."
    if secondary:
        summary += f" · {len(secondary)} secondary condition(s)."
    if n_phen:
        summary += f" · {n_phen} phenotype assignment(s)."
    return _domain(
        "diagnosis",
        status="available" if has_dx else "missing",
        record_count=int(bool(primary)) + len(secondary) + int(n_phen),
        last_updated=patient.updated_at.isoformat() if patient.updated_at else None,
        summary=summary,
    )


def _symptoms_goals(session: Session, patient: Patient) -> dict[str, Any]:
    notes = (getattr(patient, "notes", None) or "").strip()
    n_msg = session.scalar(
        select(func.count()).select_from(Message).where(
            Message.patient_id == patient.id
        )
    ) or 0
    if not notes and not n_msg:
        return _domain("symptoms_goals", status="missing", summary="No intake notes or goals on file.")
    summary_parts = []
    if notes:
        summary_parts.append(f"Intake notes: {len(notes)} chars.")
    if n_msg:
        summary_parts.append(f"{n_msg} message(s) on file.")
    return _domain(
        "symptoms_goals", status="partial" if not notes else "available",
        record_count=int(bool(notes)) + int(n_msg),
        summary=" ".join(summary_parts),
        warnings=["Free-text intake; no structured goal scoring yet."] if not notes else [],
    )


def _assessments(session: Session, patient_id: str) -> dict[str, Any]:
    n, latest = _count_and_latest(session, AssessmentRecord, patient_id, ts_col="created_at")
    if n == 0:
        return _domain("assessments", status="missing", summary="No assessment scores on file.")
    status = "available" if n >= 5 else "partial"
    return _domain(
        "assessments", status=status, record_count=n, last_updated=latest,
        summary=f"{n} assessment submission(s) on file.",
        warnings=[] if status == "available" else ["Sparse assessment history (<5 in lifetime)."],
        source_links=[{"label": "Open assessments", "href": f"/patients/{patient_id}/assessments"}],
        upload_links=[{"label": "Submit assessment", "href": f"/patients/{patient_id}/assessments/new", "kind": "assessment"}],
    )


def _qeeg(session: Session, patient_id: str) -> dict[str, Any]:
    n, latest = _count_and_latest(session, QEEGRecord, patient_id, ts_col="created_at")
    if n == 0:
        return _domain(
            "qeeg", status="missing", summary="No qEEG records on file.",
            upload_links=[{"label": "Upload qEEG", "href": "/qeeg-analysis", "kind": "qeeg"}],
        )
    return _domain(
        "qeeg", status="available", record_count=n, last_updated=latest,
        summary=f"{n} qEEG record(s) on file.",
        source_links=[{"label": "Open qEEG analyzer", "href": "/qeeg-analysis"}],
        upload_links=[{"label": "Upload qEEG", "href": "/qeeg-analysis", "kind": "qeeg"}],
    )


def _mri(session: Session, patient_id: str) -> dict[str, Any]:
    n, latest = _count_and_latest(session, MriAnalysis, patient_id, ts_col="created_at")
    upload = [{"label": "Upload MRI", "href": "/mri-analysis", "kind": "mri"}]
    if n == 0:
        return _domain("mri", status="missing", summary="No MRI analyses on file.", upload_links=upload)
    return _domain("mri", status="available", record_count=n, last_updated=latest,
                   summary=f"{n} MRI analysis row(s) on file.",
                   source_links=[{"label": "Open MRI analyzer", "href": "/mri-analysis"}],
                   upload_links=upload)


def _video(session: Session, patient_id: str) -> dict[str, Any]:
    n, latest = _count_and_latest(session, VideoAnalysis, patient_id, ts_col="created_at")
    upload = [{"label": "Upload video", "href": f"/patients/{patient_id}/media/upload?kind=video", "kind": "video"}]
    if n == 0:
        return _domain("video", status="missing", summary="No video analyses on file.", upload_links=upload)
    return _domain("video", status="available", record_count=n, last_updated=latest,
                   summary=f"{n} video analysis row(s) on file.", upload_links=upload)


def _voice(session: Session, patient_id: str) -> dict[str, Any]:
    n_vc, latest_vc = _count_and_latest(session, VoiceAnalysis, patient_id, ts_col="created_at")
    n_bio, latest_bio = _count_and_latest(session, AudioAnalysis, patient_id, ts_col="created_at")
    n = n_vc + n_bio
    _dates = [x for x in (latest_vc, latest_bio) if x]
    latest = max(_dates) if _dates else None
    upload = [
        {"label": "Voice Analyzer", "href": "/voice-analyzer", "kind": "voice_analyzer"},
        {"label": "Upload voice clip", "href": f"/patients/{patient_id}/media/upload?kind=audio", "kind": "voice"},
    ]
    source_links = [{"label": "Open Voice Analyzer", "href": "/voice-analyzer"}]
    if n == 0:
        return _domain(
            "voice",
            status="missing",
            summary="No voice biomarker analyses on file.",
            upload_links=upload,
            source_links=source_links,
        )
    parts = []
    if n_bio:
        parts.append(f"{n_bio} acoustic biomarker run(s)")
    if n_vc:
        parts.append(f"{n_vc} virtual-care voice segment(s)")
    summary = "; ".join(parts) + "."
    return _domain(
        "voice",
        status="available",
        record_count=n,
        last_updated=latest,
        summary=summary,
        upload_links=upload,
        source_links=source_links,
    )


def _text(session: Session, patient_id: str) -> dict[str, Any]:
    # Only structured patient-facing text we have today is Message rows.
    n, latest = _count_and_latest(session, Message, patient_id, ts_col="created_at")
    upload = [{"label": "Add note", "href": f"/patients/{patient_id}/notes/new", "kind": "note"}]
    if n == 0:
        return _domain("text", status="missing", summary="No journal or message text on file.", upload_links=upload)
    return _domain(
        "text", status="partial", record_count=n, last_updated=latest,
        summary=f"{n} message(s); structured journal not yet ingested.",
        warnings=["No clinical-NLP analysis on this text yet."],
        upload_links=upload,
    )


def _biometrics(session: Session, patient_id: str) -> dict[str, Any]:
    # Biometrics here = raw observations; wearables card covers daily summaries.
    n, latest = _count_and_latest(session, WearableObservation, patient_id, ts_col="observed_at")
    upload = [{"label": "Connect device", "href": f"/patients/{patient_id}/devices", "kind": "device"}]
    if n == 0:
        return _domain("biometrics", status="missing", summary="No biometric observations on file.", upload_links=upload)
    return _domain("biometrics", status="available", record_count=n, last_updated=latest,
                   summary=f"{n} biometric observation(s) on file.", upload_links=upload)


def _wearables(session: Session, patient_id: str) -> dict[str, Any]:
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()
    n_total = session.scalar(
        select(func.count()).select_from(WearableDailySummary).where(
            WearableDailySummary.patient_id == patient_id
        )
    ) or 0
    n_recent = session.scalar(
        select(func.count()).select_from(WearableDailySummary).where(
            WearableDailySummary.patient_id == patient_id,
            WearableDailySummary.date >= cutoff_date,
        )
    ) or 0
    upload = [{"label": "Connect wearable", "href": f"/patients/{patient_id}/devices", "kind": "wearable"}]
    if n_total == 0:
        return _domain("wearables", status="missing", summary="No wearable daily summaries on file.", upload_links=upload)
    status = "available" if n_recent >= 14 else "partial"
    return _domain(
        "wearables", status=status, record_count=int(n_total),
        summary=f"{n_recent}/30 days covered in the last 30-day window.",
        warnings=[] if status == "available" else ["Sparse wearable coverage in the last 30 days."],
        upload_links=upload,
    )


def _cognitive_tasks(_session: Session, _patient_id: str) -> dict[str, Any]:
    return _domain(
        "cognitive_tasks", status="unavailable",
        summary="No cognitive-task ingestion path in the platform yet.",
        warnings=["Domain is structurally unavailable, not data-missing."],
    )


def _medications(session: Session, patient_id: str) -> dict[str, Any]:
    n, latest = _count_and_latest(session, PatientMedication, patient_id, ts_col="updated_at")
    upload = [{"label": "Add medication", "href": f"/patients/{patient_id}/medications/new", "kind": "medication"}]
    if n == 0:
        return _domain("medications", status="missing", summary="No medications on file.", upload_links=upload)
    return _domain("medications", status="available", record_count=n, last_updated=latest,
                   summary=f"{n} medication record(s) on file.", upload_links=upload)


def _labs(_session: Session, _patient_id: str) -> dict[str, Any]:
    return _domain(
        "labs", status="unavailable",
        summary="No labs/biomarker ingestion path in the platform yet.",
        warnings=["Domain is structurally unavailable, not data-missing."],
    )


def _treatment_sessions(session: Session, patient_id: str) -> dict[str, Any]:
    n, latest = _count_and_latest(session, ClinicalSession, patient_id, ts_col="created_at")
    upload = [{"label": "Log session", "href": f"/patients/{patient_id}/sessions/new", "kind": "session"}]
    if n == 0:
        return _domain("treatment_sessions", status="missing", summary="No treatment sessions on file.", upload_links=upload)
    return _domain("treatment_sessions", status="available", record_count=n, last_updated=latest,
                   summary=f"{n} clinical session(s) on file.", upload_links=upload)


def _safety_flags(session: Session, patient_id: str) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (domain card, adverse_events list, wearable_alert list).

    Wearable alert flags + adverse events feed both the domain card and
    the top-level ``safety`` block.
    """
    ae_rows = list(session.scalars(
        select(AdverseEvent).where(AdverseEvent.patient_id == patient_id).order_by(AdverseEvent.reported_at.desc()).limit(20)
    ).all())
    flag_rows = list(session.scalars(
        select(WearableAlertFlag).where(WearableAlertFlag.patient_id == patient_id).order_by(WearableAlertFlag.triggered_at.desc()).limit(20)
    ).all())
    n = len(ae_rows) + len(flag_rows)
    upload = [{"label": "Report adverse event", "href": f"/patients/{patient_id}/adverse-events/new", "kind": "adverse_event"}]
    if n == 0:
        card = _domain("safety_flags", status="missing", summary="No adverse events or safety flags on file.", upload_links=upload)
    else:
        ae_ts = [r.reported_at for r in ae_rows if getattr(r, "reported_at", None)]
        flag_ts = [r.triggered_at for r in flag_rows if getattr(r, "triggered_at", None)]
        latest = max(ae_ts + flag_ts, default=None)
        card = _domain(
            "safety_flags", status="available", record_count=n,
            last_updated=latest.isoformat() if latest else None,
            summary=f"{len(ae_rows)} adverse event(s) and {len(flag_rows)} wearable flag(s) on file.",
            warnings=["Review safety panel below for details."] if ae_rows else [],
            upload_links=upload,
        )

    adverse_events = [
        {
            "id": getattr(ae, "id", None),
            "severity": getattr(ae, "severity", None),
            "description": (getattr(ae, "description", "") or "")[:240],
            "occurred_at": ae.reported_at.isoformat() if getattr(ae, "reported_at", None) else None,
        }
        for ae in ae_rows
    ]
    flags = [
        {
            "id": getattr(f, "id", None),
            "kind": getattr(f, "flag_type", None),
            "severity": getattr(f, "severity", None),
            "description": (getattr(f, "detail", "") or "")[:240],
            "raised_at": f.triggered_at.isoformat() if getattr(f, "triggered_at", None) else None,
        }
        for f in flag_rows
    ]
    return card, adverse_events, flags


def _lifestyle(session: Session, patient_id: str) -> dict[str, Any]:
    """Sleep is partially observable from wearable summaries; rest is unavailable."""
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()
    n_recent = session.scalar(
        select(func.count()).select_from(WearableDailySummary).where(
            WearableDailySummary.patient_id == patient_id,
            WearableDailySummary.date >= cutoff_date,
        )
    ) or 0
    if n_recent == 0:
        return _domain(
            "lifestyle", status="missing",
            summary="No lifestyle / sleep observations available; diet not ingested.",
            warnings=["Diet and exercise are not currently ingested."],
        )
    return _domain(
        "lifestyle", status="partial", record_count=int(n_recent),
        summary=f"Sleep approximated from {n_recent} day(s) of wearable data.",
        warnings=["Diet and exercise are not currently ingested."],
    )


def _environment(_session: Session, _patient_id: str) -> dict[str, Any]:
    return _domain(
        "environment", status="unavailable",
        summary="No environmental-context ingestion path in the platform yet.",
        warnings=["Domain is structurally unavailable, not data-missing."],
    )


def _caregiver_reports(_session: Session, _patient_id: str) -> dict[str, Any]:
    return _domain(
        "caregiver_reports", status="unavailable",
        summary="No family/teacher/caregiver-report ingestion path yet.",
        warnings=["Domain is structurally unavailable, not data-missing."],
    )


def _clinical_documents(session: Session, patient_id: str) -> dict[str, Any]:
    # Clinical-document repo is keyed by template, not patient.
    # We surface it as "partial" — templates exist but per-patient generated
    # docs are not modelled in this dashboard yet.
    return _domain(
        "clinical_documents", status="partial",
        summary="Document templates exist; per-patient generated documents not yet aggregated here.",
        warnings=["Per-patient clinical-document timeline is on the roadmap."],
        source_links=[{"label": "Open patient reports", "href": f"/patients/{patient_id}/reports"}],
    )


def _outcomes(session: Session, patient_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    n_series, latest_series = _count_and_latest(session, OutcomeSeries, patient_id, ts_col="created_at")
    n_events, latest_events = _count_and_latest(session, OutcomeEvent, patient_id, ts_col="created_at")
    n = n_series + n_events
    latest = max(filter(None, [latest_series, latest_events]), default=None)
    if n == 0:
        card = _domain("outcomes", status="missing", summary="No outcome series or events on file.")
        outcomes_block = {"series_count": 0, "event_count": 0, "summary": "No outcomes on file."}
    else:
        card = _domain(
            "outcomes", status="available", record_count=n, last_updated=latest,
            summary=f"{n_series} outcome series and {n_events} event(s) on file.",
        )
        outcomes_block = {
            "series_count": n_series,
            "event_count": n_events,
            "summary": f"{n_series} series, {n_events} events.",
        }
    return card, outcomes_block


def _twin_predictions(_session: Session, _patient_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Honest placeholder: model is deterministic synthetic, not validated."""
    card = _domain(
        "twin_predictions", status="partial",
        summary="DeepTwin predictions are model-estimated and uncalibrated.",
        warnings=[
            "DeepTwin model is currently a deterministic placeholder; "
            "no validated outcome calibration.",
        ],
    )
    pred_block = {
        "status": "placeholder",
        "real_ai": False,
        "confidence": None,
        "confidence_label": "Not calibrated",
        "summary": "Decision-support only. Requires clinician review.",
        "drivers": [],
        "limitations": [
            "No validated outcome dataset bound to this engine.",
            "Encoders are deterministic feature extractors, not trained ML.",
            "Predictions must not be used as autonomous treatment recommendations.",
        ],
    }
    return card, pred_block


# ---------------------------------------------------------------------------
# Top-level builder
# ---------------------------------------------------------------------------

def _completeness(domains: list[dict[str, Any]]) -> dict[str, Any]:
    available = [d for d in domains if d["status"] == "available"]
    partial = [d for d in domains if d["status"] == "partial"]
    missing = [d for d in domains if d["status"] == "missing"]
    high_priority = [
        d["key"] for d in domains
        if d["status"] in {"missing", "unavailable"}
        and d["key"] in {"qeeg", "assessments", "treatment_sessions", "safety_flags", "outcomes"}
    ]
    # Score: 1.0 for every available domain, 0.5 for partial, 0 for the rest.
    score = round(
        (len(available) + 0.5 * len(partial)) / float(len(DOMAIN_KEYS)),
        3,
    )
    return {
        "score": score,
        "available_domains": len(available),
        "partial_domains": len(partial),
        "missing_domains": len(missing),
        "high_priority_missing": high_priority,
    }


def _patient_summary(patient: Patient) -> dict[str, Any]:
    name = f"{patient.first_name or ''} {patient.last_name or ''}".strip() or patient.id
    age = None
    dob_raw = getattr(patient, "dob", None)
    if dob_raw:
        try:
            dob = datetime.fromisoformat(str(dob_raw))
            today = datetime.now(timezone.utc)
            age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        except (TypeError, ValueError):
            age = None
    secondary = _decode_secondary_conditions(getattr(patient, "secondary_conditions", None))
    diagnosis = ([patient.primary_condition] if patient.primary_condition else []) + secondary
    return {
        "name": name,
        "age": age,
        "diagnosis": diagnosis,
        "phenotype": [],
        "primary_goals": [],
        "risk_level": "unknown",
    }


def build_dashboard_payload(session: Session, patient: Patient) -> dict[str, Any]:
    """Compose the full DeepTwin 360 dashboard payload for one patient.

    Caller is responsible for cross-clinic auth gating. This function only
    reads from approved domain tables and never invents values.
    """
    pid = patient.id
    domains: list[dict[str, Any]] = [
        _identity(session, patient),
        _diagnosis(session, patient),
        _symptoms_goals(session, patient),
        _assessments(session, pid),
        _qeeg(session, pid),
        _mri(session, pid),
        _video(session, pid),
        _voice(session, pid),
        _text(session, pid),
        _biometrics(session, pid),
        _wearables(session, pid),
        _cognitive_tasks(session, pid),
        _medications(session, pid),
        _labs(session, pid),
        _treatment_sessions(session, pid),
    ]
    safety_card, adverse_events, wearable_flags = _safety_flags(session, pid)
    domains.append(safety_card)
    domains.append(_lifestyle(session, pid))
    domains.append(_environment(session, pid))
    domains.append(_caregiver_reports(session, pid))
    domains.append(_clinical_documents(session, pid))
    outcomes_card, outcomes_block = _outcomes(session, pid)
    domains.append(outcomes_card)
    twin_card, prediction_block = _twin_predictions(session, pid)
    domains.append(twin_card)

    safety_block = {
        "adverse_events": adverse_events,
        "contraindications": [],  # no first-class contraindication model yet
        "red_flags": wearable_flags,
        "medication_confounds": [],  # left empty until med-confound rules are wired
    }

    return {
        "patient_id": pid,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "patient_summary": _patient_summary(patient),
        "completeness": _completeness(domains),
        "safety": safety_block,
        "domains": domains,
        "timeline": [],          # populated by deeptwin v1 timeline endpoint
        "correlations": [],      # populated by deeptwin v1 correlations endpoint
        "outcomes": outcomes_block,
        "prediction_confidence": prediction_block,
        "clinician_notes": [],
        "review": {
            "reviewed": False,
            "reviewed_by": None,
            "reviewed_at": None,
        },
        "disclaimer": DASHBOARD_DISCLAIMER,
    }
