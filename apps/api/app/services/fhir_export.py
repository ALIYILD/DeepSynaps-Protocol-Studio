"""FHIR R4 DiagnosticReport bundle export for qEEG + MRI analyses.

Implements CONTRACT_V3 §5.1 by serialising a qEEG or MRI analysis row
into a hand-built FHIR R4 ``Bundle`` of type ``document`` containing:

* 1 × ``DiagnosticReport`` (category: NEU, LOINC coded)
* N × ``Observation`` resources for every flagged z-score / stim target
* 1 × ``Patient`` reference-only resource (no PHI — only a pseudo id)
* N × ``DocumentReference`` resources for attached artifacts (PDF, NIfTI)

No external ``fhir.resources`` dependency — bundles are plain Python
dicts so they can be written without extra imports and round-tripped
through ``json.dumps``.

Notes
-----
* LOINC codes used:
    - qEEG → ``80419-7`` (Electroencephalogram)
    - MRI  → ``36573-0`` (MR Imaging Brain)
    The broader category ``NEU`` (neurology) is attached via
    ``http://terminology.hl7.org/CodeSystem/v2-0074``.
* All free-text fields pass through :func:`_sanitise_text` which strips
  the banned words (``diagnos*``, ``treatment recommendation``) from
  CONTRACT_V3 §8 before emission.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.errors import ApiServiceError
from app.persistence.models import MriAnalysis, OutcomeEvent, OutcomeSeries, Patient, QEEGAnalysis, TreatmentCourse

_log = logging.getLogger(__name__)


# ── Banned-word sanitiser (CONTRACT_V3 §8) ───────────────────────────────────

_BANNED_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bdiagnos\w*\b", re.IGNORECASE),
    re.compile(r"\btreatment\s+recommendation\w*\b", re.IGNORECASE),
)


def _sanitise_text(text: str | None) -> str:
    """Strip banned words from any free-text string before FHIR emission.

    Parameters
    ----------
    text : str or None
        Candidate free-text. ``None`` returns an empty string.

    Returns
    -------
    str
        Sanitised text with banned tokens replaced by ``[removed]``.
    """
    if not text:
        return ""
    out = str(text)
    for pat in _BANNED_PATTERNS:
        out = pat.sub("[removed]", out)
    return out


# ── JSON helpers ─────────────────────────────────────────────────────────────

def _maybe_json(raw: Any) -> Any:
    """Decode a JSON string column, returning None on malformed input."""
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        _log.warning("fhir_export: skipping malformed JSON column")
        return None


def _iso(dt: datetime | None) -> str:
    """Return an ISO-8601 timestamp (UTC) for ``dt``; now when missing."""
    if dt is None:
        return datetime.now(timezone.utc).isoformat()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _new_fullurl(resource_type: str, rid: str) -> str:
    """Return a URN-style ``fullUrl`` for a bundle entry."""
    return f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, f'{resource_type}/{rid}')}"


# ── DiagnosticReport builders ────────────────────────────────────────────────

def _diagnostic_report(
    *,
    report_id: str,
    patient_ref: str,
    loinc_code: str,
    loinc_display: str,
    effective: str,
    presented_form_url: str | None,
    result_refs: list[dict[str, str]],
    text_summary: str,
) -> dict[str, Any]:
    """Build a FHIR R4 ``DiagnosticReport`` resource dict.

    Parameters
    ----------
    report_id : str
        Logical identifier for the resource.
    patient_ref : str
        ``Patient/<id>`` reference string.
    loinc_code, loinc_display : str
        LOINC code + display text for ``code.coding[0]``.
    effective : str
        ISO-8601 ``effectiveDateTime``.
    presented_form_url : str or None
        URL pointing to the HTML render (optional).
    result_refs : list of dict
        Pre-built ``{"reference": "Observation/..."}`` entries for
        ``result``.
    text_summary : str
        Sanitised narrative text for the ``text.div`` block.

    Returns
    -------
    dict
        A FHIR R4 ``DiagnosticReport`` resource dict.
    """
    resource: dict[str, Any] = {
        "resourceType": "DiagnosticReport",
        "id": report_id,
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                        "code": "NEU",
                        "display": "Neurology",
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": loinc_code,
                    "display": loinc_display,
                }
            ]
        },
        "subject": {"reference": patient_ref},
        "effectiveDateTime": effective,
        "issued": effective,
        "result": result_refs,
        "text": {
            "status": "generated",
            "div": (
                '<div xmlns="http://www.w3.org/1999/xhtml">'
                f"{_sanitise_text(text_summary)}"
                "</div>"
            ),
        },
    }
    if presented_form_url:
        resource["presentedForm"] = [
            {
                "contentType": "text/html",
                "url": presented_form_url,
            }
        ]
    return resource


def _observation(
    *,
    obs_id: str,
    patient_ref: str,
    display_text: str,
    value: float | None,
    unit: str,
    z_score: float | None,
    ref_low: float = -1.96,
    ref_high: float = 1.96,
) -> dict[str, Any]:
    """Build a FHIR R4 ``Observation`` resource dict for a flagged finding.

    Parameters
    ----------
    obs_id : str
        Logical id for the resource.
    patient_ref : str
        ``Patient/<id>`` reference string.
    display_text : str
        Human-readable ``code.text`` (sanitised).
    value : float or None
        Numeric value (``valueQuantity.value``). ``None`` omits the quantity.
    unit : str
        Unit for the quantity (e.g. ``"z"`` or ``"µV²"``).
    z_score : float or None
        Signed z-score used to decide ``interpretation.coding[0].code``.
    ref_low, ref_high : float
        Reference range boundaries (default ±1.96).

    Returns
    -------
    dict
        A FHIR R4 ``Observation`` resource dict.
    """
    interp_code = "N"
    interp_display = "Normal"
    if z_score is not None:
        if z_score > ref_high:
            interp_code, interp_display = "HH", "Critically high"
        elif z_score < ref_low:
            interp_code, interp_display = "LL", "Critically low"

    resource: dict[str, Any] = {
        "resourceType": "Observation",
        "id": obs_id,
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "procedure",
                    }
                ]
            }
        ],
        "code": {"text": _sanitise_text(display_text)},
        "subject": {"reference": patient_ref},
        "interpretation": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                        "code": interp_code,
                        "display": interp_display,
                    }
                ]
            }
        ],
        "referenceRange": [
            {
                "low": {"value": ref_low, "unit": unit},
                "high": {"value": ref_high, "unit": unit},
            }
        ],
    }
    if value is not None:
        resource["valueQuantity"] = {"value": float(value), "unit": unit}
    return resource


def _patient_resource(patient_pseudo_id: str) -> dict[str, Any]:
    """Build a PHI-free ``Patient`` resource (id only — no name or dob)."""
    return {
        "resourceType": "Patient",
        "id": patient_pseudo_id,
        "active": True,
        "meta": {
            "tag": [
                {
                    "system": "http://deepsynaps.ai/fhir/tag",
                    "code": "pseudo-id",
                    "display": "Pseudo identifier — no PHI in this export",
                }
            ]
        },
    }


def _document_reference(
    *,
    ref_id: str,
    patient_ref: str,
    url: str,
    content_type: str,
    description: str,
) -> dict[str, Any]:
    """Build a ``DocumentReference`` resource for an attached artifact."""
    return {
        "resourceType": "DocumentReference",
        "id": ref_id,
        "status": "current",
        "subject": {"reference": patient_ref},
        "description": _sanitise_text(description),
        "content": [
            {
                "attachment": {
                    "contentType": content_type,
                    "url": url,
                }
            }
        ],
    }


def _wrap_bundle(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Wrap resource entries in a ``Bundle`` of type ``document``."""
    return {
        "resourceType": "Bundle",
        "type": "document",
        "timestamp": _iso(None),
        "entry": entries,
    }


# ── qEEG bundle ──────────────────────────────────────────────────────────────

def qeeg_to_fhir_bundle(analysis: Any) -> dict[str, Any]:
    """Serialise a :class:`QEEGAnalysis` row into a FHIR R4 document bundle.

    Parameters
    ----------
    analysis : QEEGAnalysis
        Persisted analysis row (SQLA model). Only the id + JSON columns
        are read — no PHI is exposed.

    Returns
    -------
    dict
        FHIR R4 ``Bundle`` dict. Always returns a well-formed bundle
        even when most optional columns are empty.
    """
    patient_ref = f"Patient/{analysis.patient_id}"
    report_id = f"qeeg-{analysis.id}"
    effective = _iso(getattr(analysis, "analyzed_at", None) or getattr(analysis, "created_at", None))

    # Build Observation resources from flagged z-scores.
    zscores = _maybe_json(getattr(analysis, "normative_zscores_json", None)) or {}
    flagged = zscores.get("flagged") if isinstance(zscores, dict) else None
    flagged = flagged if isinstance(flagged, list) else []

    observations: list[dict[str, Any]] = []
    result_refs: list[dict[str, str]] = []
    for idx, flag in enumerate(flagged):
        if not isinstance(flag, dict):
            continue
        metric = str(flag.get("metric") or flag.get("feature") or "z-score")
        channel = str(flag.get("channel") or flag.get("roi") or "")
        z_val = flag.get("z")
        try:
            z = float(z_val) if z_val is not None else None
        except (TypeError, ValueError):
            z = None
        display = f"{channel} {metric} z-score".strip() if channel else f"{metric} z-score"
        obs_id = f"{report_id}-obs-{idx}"
        observations.append(_observation(
            obs_id=obs_id,
            patient_ref=patient_ref,
            display_text=display,
            value=z,
            unit="z",
            z_score=z,
        ))
        result_refs.append({"reference": f"Observation/{obs_id}"})

    # Attach report HTML + any referenced PDF.
    html_url = f"/api/v1/qeeg-analysis/{analysis.id}/report/html"
    diag = _diagnostic_report(
        report_id=report_id,
        patient_ref=patient_ref,
        loinc_code="80419-7",
        loinc_display="Electroencephalogram",
        effective=effective,
        presented_form_url=html_url,
        result_refs=result_refs,
        text_summary=(
            f"qEEG analysis {analysis.id} — {len(observations)} flagged findings. "
            "Research/wellness use — not a medical device."
        ),
    )

    entries: list[dict[str, Any]] = [
        {"fullUrl": _new_fullurl("DiagnosticReport", report_id), "resource": diag},
        {"fullUrl": _new_fullurl("Patient", analysis.patient_id),
         "resource": _patient_resource(analysis.patient_id)},
    ]
    for obs in observations:
        entries.append({
            "fullUrl": _new_fullurl("Observation", obs["id"]),
            "resource": obs,
        })

    # PDF DocumentReference when available.
    if getattr(analysis, "file_ref", None):
        doc_ref_id = f"{report_id}-src"
        entries.append({
            "fullUrl": _new_fullurl("DocumentReference", doc_ref_id),
            "resource": _document_reference(
                ref_id=doc_ref_id,
                patient_ref=patient_ref,
                url=str(analysis.file_ref),
                content_type="application/octet-stream",
                description="Source EDF/BDF recording",
            ),
        })
    return _wrap_bundle(entries)


# ── MRI bundle ───────────────────────────────────────────────────────────────

def mri_to_fhir_bundle(analysis: Any) -> dict[str, Any]:
    """Serialise a :class:`MriAnalysis` row into a FHIR R4 document bundle.

    Parameters
    ----------
    analysis : MriAnalysis
        Persisted analysis row (SQLA model). Only the id + JSON columns
        are read — no PHI is exposed.

    Returns
    -------
    dict
        FHIR R4 ``Bundle`` dict per CONTRACT_V3 §5.1.
    """
    patient_ref = f"Patient/{analysis.patient_id}"
    report_id = f"mri-{analysis.analysis_id}"
    effective = _iso(getattr(analysis, "created_at", None))

    # Observations → one per stim target finding.
    stim_targets = _maybe_json(getattr(analysis, "stim_targets_json", None)) or []
    stim_targets = stim_targets if isinstance(stim_targets, list) else []

    observations: list[dict[str, Any]] = []
    result_refs: list[dict[str, str]] = []
    for idx, target in enumerate(stim_targets):
        if not isinstance(target, dict):
            continue
        name = str(target.get("target_id") or target.get("name") or f"target_{idx}")
        region = str(target.get("region") or target.get("anatomy") or "")
        score = target.get("score")
        try:
            val = float(score) if score is not None else None
        except (TypeError, ValueError):
            val = None
        display = f"{name} ({region})" if region else name
        obs_id = f"{report_id}-obs-{idx}"
        observations.append(_observation(
            obs_id=obs_id,
            patient_ref=patient_ref,
            display_text=display,
            value=val,
            unit="score",
            z_score=None,
        ))
        result_refs.append({"reference": f"Observation/{obs_id}"})

    diag = _diagnostic_report(
        report_id=report_id,
        patient_ref=patient_ref,
        loinc_code="36573-0",
        loinc_display="MR Imaging Brain",
        effective=effective,
        presented_form_url=f"/api/v1/mri/report/{analysis.analysis_id}/html",
        result_refs=result_refs,
        text_summary=(
            f"MRI analysis {analysis.analysis_id} — {len(observations)} "
            "stim-target findings. Research/wellness use — not a medical device."
        ),
    )

    entries: list[dict[str, Any]] = [
        {"fullUrl": _new_fullurl("DiagnosticReport", report_id), "resource": diag},
        {"fullUrl": _new_fullurl("Patient", analysis.patient_id),
         "resource": _patient_resource(analysis.patient_id)},
    ]
    for obs in observations:
        entries.append({
            "fullUrl": _new_fullurl("Observation", obs["id"]),
            "resource": obs,
        })

    # DocumentReference for source NIfTI upload.
    if getattr(analysis, "upload_ref", None):
        doc_ref_id = f"{report_id}-src"
        entries.append({
            "fullUrl": _new_fullurl("DocumentReference", doc_ref_id),
            "resource": _document_reference(
                ref_id=doc_ref_id,
                patient_ref=patient_ref,
                url=str(analysis.upload_ref),
                content_type="application/octet-stream",
                description="Source NIfTI / DICOM upload",
            ),
        })
    return _wrap_bundle(entries)


def build_neuromodulation_fhir_bundle(
    db: Session,
    patient_id: str,
    *,
    qeeg_analysis_id: str | None = None,
    mri_analysis_id: str | None = None,
) -> dict[str, Any]:
    """Build the legacy patient-level FHIR bundle expected by export_router."""
    qeeg_query = db.query(QEEGAnalysis).filter(QEEGAnalysis.patient_id == patient_id)
    if qeeg_analysis_id:
        qeeg_query = qeeg_query.filter(QEEGAnalysis.id == qeeg_analysis_id)
    qeeg_row = qeeg_query.order_by(QEEGAnalysis.created_at.desc()).first()

    mri_query = db.query(MriAnalysis).filter(MriAnalysis.patient_id == patient_id)
    if mri_analysis_id:
        mri_query = mri_query.filter(MriAnalysis.analysis_id == mri_analysis_id)
    mri_row = mri_query.order_by(MriAnalysis.created_at.desc()).first()

    outcome_rows = (
        db.query(OutcomeSeries)
        .filter(OutcomeSeries.patient_id == patient_id)
        .order_by(OutcomeSeries.administered_at.asc())
        .all()
    )
    event_rows = (
        db.query(OutcomeEvent)
        .filter(OutcomeEvent.patient_id == patient_id)
        .order_by(OutcomeEvent.recorded_at.desc())
        .limit(25)
        .all()
    )

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if patient is None and qeeg_row is None and mri_row is None and not outcome_rows:
        raise ApiServiceError(code="patient_not_found", message="Patient not found", status_code=404)
    if patient is None:
        patient = Patient(
            id=patient_id,
            clinician_id="unknown",
            first_name=f"Patient {patient_id}",
            last_name="",
            status="active",
        )

    course_rows = (
        db.query(TreatmentCourse)
        .filter(TreatmentCourse.patient_id == patient_id)
        .order_by(TreatmentCourse.created_at.desc())
        .all()
    )

    entries: list[dict[str, Any]] = []
    patient_ref = f"Patient/{patient.id}"
    entries.append(
        {
            "fullUrl": patient_ref,
            "resource": {
                "resourceType": "Patient",
                "id": patient.id,
                "name": [{"text": f"{patient.first_name} {patient.last_name}".strip()}],
                "gender": (patient.gender or "").lower() or None,
                "birthDate": patient.dob,
                "telecom": ([{"system": "email", "value": patient.email}] if patient.email else []),
            },
        }
    )

    if patient.primary_condition:
        entries.append(
            {
                "fullUrl": f"Condition/{patient.id}-primary",
                "resource": {
                    "resourceType": "Condition",
                    "id": f"{patient.id}-primary",
                    "subject": {"reference": patient_ref},
                    "clinicalStatus": {"text": patient.status},
                    "code": {"text": patient.primary_condition},
                },
            }
        )

    for course in course_rows[:5]:
        entries.append(
            {
                "fullUrl": f"CarePlan/{course.id}",
                "resource": {
                    "resourceType": "CarePlan",
                    "id": course.id,
                    "subject": {"reference": patient_ref},
                    "status": "active" if course.status in {"active", "pending_approval"} else "completed",
                    "intent": "plan",
                    "title": f"{course.modality_slug} neuromodulation course",
                    "description": f"{course.condition_slug} · {course.protocol_id}",
                    "period": {"start": _iso(course.started_at), "end": _iso(course.completed_at)},
                },
            }
        )

    if qeeg_row is not None:
        entries.append(
            {
                "fullUrl": f"DiagnosticReport/qeeg-{qeeg_row.id}",
                "resource": {
                    "resourceType": "DiagnosticReport",
                    "id": f"qeeg-{qeeg_row.id}",
                    "status": "final" if qeeg_row.analysis_status == "completed" else "registered",
                    "code": {"text": "qEEG analysis"},
                    "subject": {"reference": patient_ref},
                    "effectiveDateTime": _iso(qeeg_row.analyzed_at or qeeg_row.created_at),
                    "presentedForm": [
                        {
                            "contentType": "application/json",
                            "title": "qEEG summary",
                            "data": json.dumps(
                                {
                                    "status": qeeg_row.analysis_status,
                                    "recording_date": qeeg_row.recording_date,
                                    "eyes_condition": qeeg_row.eyes_condition,
                                    "channels": qeeg_row.channel_count,
                                    "sample_rate_hz": qeeg_row.sample_rate_hz,
                                    "flagged_conditions": _maybe_json(qeeg_row.flagged_conditions) or [],
                                    "bands_present": sorted(
                                        list((_maybe_json(qeeg_row.band_powers_json) or {}).keys())
                                    )[:10]
                                    if isinstance(_maybe_json(qeeg_row.band_powers_json), dict)
                                    else [],
                                }
                            ),
                        }
                    ],
                },
            }
        )

    if mri_row is not None:
        entries.append(
            {
                "fullUrl": f"DiagnosticReport/mri-{mri_row.analysis_id}",
                "resource": {
                    "resourceType": "DiagnosticReport",
                    "id": f"mri-{mri_row.analysis_id}",
                    "status": "final" if (mri_row.state or "").lower() == "success" else "registered",
                    "code": {"text": "MRI analysis"},
                    "subject": {"reference": patient_ref},
                    "effectiveDateTime": _iso(mri_row.created_at),
                    "presentedForm": [
                        {
                            "contentType": "application/json",
                            "title": "MRI summary",
                            "data": json.dumps(
                                {
                                    "state": mri_row.state,
                                    "condition": mri_row.condition,
                                    "pipeline_version": mri_row.pipeline_version,
                                    "norm_db_version": mri_row.norm_db_version,
                                    "modalities_present": _maybe_json(mri_row.modalities_present_json) or [],
                                    "stim_target_count": len(_maybe_json(mri_row.stim_targets_json) or []),
                                    "qc_passed": (_maybe_json(mri_row.qc_json) or {}).get("passed")
                                    if isinstance(_maybe_json(mri_row.qc_json), dict)
                                    else None,
                                }
                            ),
                        }
                    ],
                },
            }
        )

    for idx, row in enumerate(outcome_rows[:50], start=1):
        entries.append(
            {
                "fullUrl": f"Observation/outcome-{row.id}",
                "resource": {
                    "resourceType": "Observation",
                    "id": f"outcome-{row.id}",
                    "status": "final",
                    "code": {"text": row.template_title or row.template_id},
                    "subject": {"reference": patient_ref},
                    "effectiveDateTime": _iso(row.administered_at),
                    "valueQuantity": (
                        {"value": row.score_numeric, "unit": "score"} if row.score_numeric is not None else None
                    ),
                    "valueString": row.score if row.score_numeric is None else None,
                    "note": [{"text": f"{row.measurement_point} assessment #{idx}"}],
                },
            }
        )

    for row in event_rows:
        entries.append(
            {
                "fullUrl": f"ClinicalImpression/{row.id}",
                "resource": {
                    "resourceType": "ClinicalImpression",
                    "id": row.id,
                    "status": "completed",
                    "subject": {"reference": patient_ref},
                    "date": _iso(row.recorded_at),
                    "summary": row.title,
                    "description": row.summary,
                    "note": [
                        {
                            "text": json.dumps(
                                {
                                    "event_type": row.event_type,
                                    "severity": row.severity,
                                    "source_type": row.source_type,
                                    "source_id": row.source_id,
                                }
                            )
                        }
                    ],
                },
            }
        )

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "identifier": {"system": "urn:deepsynaps:fhir-export", "value": f"neuromod-{patient.id}"},
        "entry": entries,
    }
