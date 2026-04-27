"""Safety + interpretation wrappers for the MRI Analyzer.

Three concerns live here, all narrow utilities the rest of the pipeline
calls right before returning a payload to the API surface:

1. :func:`safe_brain_age` — sanity-checks a :class:`BrainAgePrediction`
   so the API never returns an implausible age (negative, > 100 y, |gap|
   > 30 y). Wraps the raw model output with a confidence band derived
   from the model's reference MAE, calibration provenance, and a
   "not_estimable" status when the model misbehaves.

2. :func:`build_finding` / :func:`format_observation_text` — copy
   helpers that wrap raw region metrics in the safer "observation /
   finding / requires clinical correlation" idiom required by UK MHRA
   and FDA decision-support guidance. The pipeline never says
   "diagnosis"; it surfaces "observations" that "require clinical
   correlation".

3. :func:`to_fusion_payload` — produces a stable, narrow payload the
   qEEG-MRI fusion router can consume without walking the entire
   :class:`MRIReport` tree. The goal is symmetry with what qEEG already
   exports so the fusion stream can compose without reaching into
   modality-specific schemas.

All three are pure functions of their inputs (no I/O, no global state)
so they are trivial to unit-test and safe to call from any pipeline
stage.

Decision-support tool only — not a medical device.
"""
from __future__ import annotations

import logging
from typing import Any

from .schemas import (
    BrainAgePrediction,
    MRIReport,
    NormedValue,
    StimTarget,
)

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Brain-age safety
# ---------------------------------------------------------------------------

# Plausible age bounds for any human brain scan. Values outside this band
# are *always* a model failure or a misregistered scan, never a true age.
BRAIN_AGE_MIN_YEARS: float = 3.0
BRAIN_AGE_MAX_YEARS: float = 100.0

# Plausible brain-age gap. Beyond this we don't trust the prediction.
BRAIN_AGE_GAP_MAX_YEARS: float = 30.0

# Default calibration provenance string when the model didn't supply one.
DEFAULT_BRAIN_AGE_PROVENANCE: str = (
    "Open-weights 3D CNN. Calibrated on healthy adults aged ~18-95 y "
    "(Alzheimer's Res Ther 2025, PMC12125894; reference MAE 3.30 y). "
    "Predictions outside this age range are treated as not_estimable."
)


def safe_brain_age(
    prediction: BrainAgePrediction | None,
    *,
    min_age: float = BRAIN_AGE_MIN_YEARS,
    max_age: float = BRAIN_AGE_MAX_YEARS,
    max_abs_gap: float = BRAIN_AGE_GAP_MAX_YEARS,
    provenance: str = DEFAULT_BRAIN_AGE_PROVENANCE,
) -> BrainAgePrediction:
    """Wrap a raw :class:`BrainAgePrediction` with safety checks.

    Behaviour
    ---------
    * ``None`` input → an envelope with ``status='dependency_missing'``.
    * Status already ``failed`` / ``dependency_missing`` → returned as-is
      with provenance attached so the API surface always carries it.
    * Predicted age outside ``[min_age, max_age]`` → status flipped to
      ``not_estimable`` with ``not_estimable_reason`` populated; the
      original numeric value is preserved on a separate ``error_message``
      field for audit but ``predicted_age_years`` is wiped to ``None``.
    * Brain-age gap larger than ``max_abs_gap`` in absolute value → same
      treatment.
    * Otherwise: status stays ``ok``; we add ``confidence_band_years`` =
      ``(predicted - mae, predicted + mae)``, clamp to ``[min_age,
      max_age]``, attach ``calibration_provenance``.
    """
    if prediction is None:
        return BrainAgePrediction(
            status="dependency_missing",
            error_message="No brain-age prediction returned by upstream model.",
            calibration_provenance=provenance,
        )

    # Defensive copy — never mutate caller input.
    data = prediction.model_dump()
    data.setdefault("calibration_provenance", provenance)
    if not data.get("calibration_provenance"):
        data["calibration_provenance"] = provenance

    status = data.get("status")
    if status in ("dependency_missing", "failed", "not_estimable"):
        return BrainAgePrediction(**data)

    predicted = data.get("predicted_age_years")
    gap = data.get("brain_age_gap_years")
    mae = data.get("mae_years_reference") or 3.3

    reasons: list[str] = []
    if predicted is None:
        reasons.append("model returned no predicted_age_years")
    else:
        try:
            pv = float(predicted)
        except (TypeError, ValueError):
            reasons.append("predicted_age_years was not numeric")
        else:
            if pv != pv:  # NaN
                reasons.append("predicted_age_years was NaN")
            elif pv < min_age:
                reasons.append(
                    f"predicted_age_years {pv:.2f} below plausibility floor "
                    f"({min_age} y)"
                )
            elif pv > max_age:
                reasons.append(
                    f"predicted_age_years {pv:.2f} above plausibility ceiling "
                    f"({max_age} y)"
                )

    if gap is not None:
        try:
            gv = float(gap)
        except (TypeError, ValueError):
            reasons.append("brain_age_gap_years was not numeric")
        else:
            if abs(gv) > max_abs_gap:
                reasons.append(
                    f"|brain_age_gap_years| = {abs(gv):.2f} exceeds plausible "
                    f"max ({max_abs_gap} y)"
                )

    if reasons:
        # Convert to a "not_estimable" envelope rather than returning
        # garbage. Audit trail preserved in error_message.
        original_value = predicted
        return BrainAgePrediction(
            status="not_estimable",
            predicted_age_years=None,
            chronological_age_years=data.get("chronological_age_years"),
            brain_age_gap_years=None,
            gap_zscore=None,
            cognition_cdr_estimate=None,
            model_id=data.get("model_id") or "brainage_cnn_v1",
            mae_years_reference=mae,
            runtime_sec=data.get("runtime_sec"),
            error_message=(
                f"safe_brain_age: original predicted={original_value}; "
                + "; ".join(reasons)
            ),
            not_estimable_reason="; ".join(reasons),
            calibration_provenance=data["calibration_provenance"],
        )

    pv = float(predicted)
    band_low = max(min_age, pv - mae)
    band_high = min(max_age, pv + mae)
    data["confidence_band_years"] = (round(band_low, 3), round(band_high, 3))
    return BrainAgePrediction(**data)


# ---------------------------------------------------------------------------
# Safer interpretation language
# ---------------------------------------------------------------------------
_SEVERITY_BY_ABS_Z = (
    (3.0, "marked"),
    (2.0, "moderate"),
    (1.5, "mild"),
)


def severity_label_from_z(z: float | None) -> str | None:
    """Bucket a z-score into a hedged severity label.

    >>> severity_label_from_z(-2.4)
    'moderate'
    >>> severity_label_from_z(-1.0)
    >>> severity_label_from_z(None)
    """
    if z is None:
        return None
    try:
        absz = abs(float(z))
    except (TypeError, ValueError):
        return None
    for threshold, label in _SEVERITY_BY_ABS_Z:
        if absz >= threshold:
            return label
    return None


def format_observation_text(
    *,
    region: str,
    metric: str,
    value: float | None,
    unit: str | None,
    z: float | None,
) -> str:
    """Build a hedged human-readable observation string.

    Pattern: "Observation: [region] [metric] is [hedged severity] below /
    above normative reference (z = …); requires clinical correlation."

    No diagnosis verbs; no causal claims; always trailed by the safer
    "requires clinical correlation" qualifier.
    """
    direction = ""
    if z is not None:
        try:
            zf = float(z)
            direction = "below" if zf < 0 else "above"
        except (TypeError, ValueError):
            direction = ""
    severity = severity_label_from_z(z) or ""
    severity_text = f" {severity}ly" if severity else ""
    z_text = f" (z = {z:+.2f})" if isinstance(z, (int, float)) else ""
    value_text = ""
    if value is not None and unit:
        value_text = f" measured at {value} {unit}"
    elif value is not None:
        value_text = f" measured at {value}"
    parts = [f"Observation: {region} {metric}"]
    if value_text:
        parts.append(value_text)
    if direction:
        parts.append(f" is{severity_text} {direction} normative reference")
    parts.append(z_text)
    parts.append("; requires clinical correlation.")
    return "".join(parts).replace("  ", " ").strip()


def build_finding(
    *,
    region: str,
    metric: str,
    value: float | None,
    unit: str | None = None,
    z: float | None = None,
    percentile: float | None = None,
    reference_range: tuple[float, float] | None = None,
    confidence: str | None = None,
    model_id: str | None = None,
) -> dict:
    """Produce a structured "finding" record with safer language.

    The shape is intentionally narrow and stable — it is what the API
    surface exposes and what the multimodal fusion stream will consume.
    Numeric fields are optional so the helper can be used for partial
    observations.

    Schema
    ------
    ``{
        "region_name": str,
        "metric": str,
        "value": float | None,
        "unit": str | None,
        "z": float | None,
        "percentile": float | None,
        "reference_range": [low, high] | None,
        "confidence": "low"/"medium"/"high" | None,
        "severity": "mild"/"moderate"/"marked" | None,
        "model_id": str | None,
        "observation_text": str,
        "requires_clinical_correlation": True,
    }``
    """
    return {
        "region_name": region,
        "metric": metric,
        "value": value,
        "unit": unit,
        "z": z,
        "percentile": percentile,
        "reference_range": list(reference_range) if reference_range else None,
        "confidence": confidence,
        "severity": severity_label_from_z(z),
        "model_id": model_id,
        "observation_text": format_observation_text(
            region=region, metric=metric, value=value, unit=unit, z=z,
        ),
        "requires_clinical_correlation": True,
    }


def findings_from_structural(structural: Any) -> list[dict]:
    """Convert a ``StructuralMetrics`` (or its dict form) into findings.

    Skips regions that lack a flagged z-score so the output stays
    clinically actionable and short.
    """
    if structural is None:
        return []
    findings: list[dict] = []

    cortical = _ensure_dict(_get(structural, "cortical_thickness_mm"))
    for region, nv in cortical.items():
        nv_dict = nv.model_dump() if isinstance(nv, NormedValue) else dict(nv or {})
        if not nv_dict.get("flagged") and nv_dict.get("z") is None:
            continue
        findings.append(build_finding(
            region=region,
            metric="cortical_thickness",
            value=nv_dict.get("value"),
            unit=nv_dict.get("unit") or "mm",
            z=nv_dict.get("z"),
            percentile=nv_dict.get("percentile"),
            reference_range=_tuple_or_none(nv_dict.get("reference_range")),
            confidence=nv_dict.get("confidence"),
            model_id=nv_dict.get("model_id"),
        ))

    subcort = _ensure_dict(_get(structural, "subcortical_volume_mm3"))
    for region, nv in subcort.items():
        nv_dict = nv.model_dump() if isinstance(nv, NormedValue) else dict(nv or {})
        if not nv_dict.get("flagged") and nv_dict.get("z") is None:
            continue
        findings.append(build_finding(
            region=region,
            metric="subcortical_volume",
            value=nv_dict.get("value"),
            unit=nv_dict.get("unit") or "mm^3",
            z=nv_dict.get("z"),
            percentile=nv_dict.get("percentile"),
            reference_range=_tuple_or_none(nv_dict.get("reference_range")),
            confidence=nv_dict.get("confidence"),
            model_id=nv_dict.get("model_id"),
        ))

    return findings


def _get(obj: Any, key: str) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _ensure_dict(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if value is None:
        return {}
    if hasattr(value, "model_dump"):
        try:
            d = value.model_dump()
            if isinstance(d, dict):
                return d
        except Exception:  # noqa: BLE001
            pass
    return {}


def _tuple_or_none(value: Any) -> tuple[float, float] | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)) and len(value) == 2:
        try:
            return (float(value[0]), float(value[1]))
        except (TypeError, ValueError):
            return None
    return None


# ---------------------------------------------------------------------------
# Fusion payload
# ---------------------------------------------------------------------------

FUSION_PAYLOAD_VERSION: str = "mri.v1"


def to_fusion_payload(
    report: MRIReport | dict,
    *,
    subject_id: str | None = None,
    pipeline_version: str | None = None,
) -> dict:
    """Build a narrow payload the qEEG-MRI fusion stream can consume.

    Output shape::

        {
          "schema_version": "mri.v1",
          "subject_id": str | None,
          "modality": "mri",
          "qc": {
              "passed": bool,
              "warnings": list[str],
              "mriqc_status": str | None,
              "incidental_status": str | None,
              "any_incidental_flagged": bool,
          },
          "findings": list[finding-dict],   # see :func:`build_finding`
          "brain_age": {
              "status": str,
              "predicted_age_years": float | None,
              "confidence_band_years": [low, high] | None,
              "calibration_provenance": str | None,
          } | None,
          "stim_targets": [
              {target_id, modality, region_name, mni_xyz,
               confidence, method, requires_clinician_review: True}
          ],
          "provenance": {
              "pipeline_version": str,
              "norm_db_version": str,
              "disclaimer": str,
          },
        }
    """
    rep_dict: dict = report.model_dump(mode="json") if isinstance(report, MRIReport) else dict(report or {})

    patient = rep_dict.get("patient") or {}
    qc_block = rep_dict.get("qc") or {}
    structural = rep_dict.get("structural")

    incidental = qc_block.get("incidental") or {}
    mriqc_block = qc_block.get("mriqc") or {}
    qc_warnings = list(rep_dict.get("qc_warnings") or [])

    findings = findings_from_structural(structural)

    brain_age_block: dict | None = None
    structural_dict = structural if isinstance(structural, dict) else (
        structural.model_dump() if structural is not None and hasattr(structural, "model_dump") else None
    )
    if structural_dict and structural_dict.get("brain_age"):
        ba = structural_dict["brain_age"]
        brain_age_block = {
            "status": ba.get("status"),
            "predicted_age_years": ba.get("predicted_age_years"),
            "brain_age_gap_years": ba.get("brain_age_gap_years"),
            "confidence_band_years": ba.get("confidence_band_years"),
            "calibration_provenance": ba.get("calibration_provenance"),
            "model_id": ba.get("model_id"),
            "not_estimable_reason": ba.get("not_estimable_reason"),
        }

    stim_targets_out = []
    for t in rep_dict.get("stim_targets") or []:
        if not isinstance(t, dict):
            continue
        stim_targets_out.append({
            "target_id": t.get("target_id"),
            "modality": t.get("modality"),
            "region_name": t.get("region_name"),
            "mni_xyz": t.get("mni_xyz"),
            "confidence": t.get("confidence"),
            "method": t.get("method"),
            "requires_clinician_review": True,
        })

    return {
        "schema_version": FUSION_PAYLOAD_VERSION,
        "subject_id": subject_id or patient.get("patient_id"),
        "modality": "mri",
        "qc": {
            "passed": bool(qc_block.get("passed", True)),
            "warnings": qc_warnings,
            "mriqc_status": mriqc_block.get("status"),
            "incidental_status": incidental.get("status"),
            "any_incidental_flagged": bool(incidental.get("any_flagged", False)),
        },
        "findings": findings,
        "brain_age": brain_age_block,
        "stim_targets": stim_targets_out,
        "provenance": {
            "pipeline_version": pipeline_version
                or rep_dict.get("pipeline_version") or "0.1.0",
            "norm_db_version": rep_dict.get("norm_db_version") or "ISTAGING-v1",
            "disclaimer": (
                "Decision-support tool. Not a medical device. "
                "All findings require clinical correlation."
            ),
        },
    }


__all__ = [
    "BRAIN_AGE_MIN_YEARS",
    "BRAIN_AGE_MAX_YEARS",
    "BRAIN_AGE_GAP_MAX_YEARS",
    "DEFAULT_BRAIN_AGE_PROVENANCE",
    "FUSION_PAYLOAD_VERSION",
    "build_finding",
    "findings_from_structural",
    "format_observation_text",
    "safe_brain_age",
    "severity_label_from_z",
    "to_fusion_payload",
]
