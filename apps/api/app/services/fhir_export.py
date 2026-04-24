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
