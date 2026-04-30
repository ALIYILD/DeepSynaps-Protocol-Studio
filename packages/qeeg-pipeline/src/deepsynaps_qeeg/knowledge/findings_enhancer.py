"""Enhance raw pipeline findings with artifact awareness and normative context.

This module sits **between** ``findings.extract_findings`` and
``narrative.compose_narrative``. It annotates each ``Finding`` with advisory
context that helps the narrative generator (and clinician) distinguish true
pathology from artifact, age-appropriate variation, or state confounds.

No finding is ever suppressed — only enriched with structured advisory fields.
"""
from __future__ import annotations

from typing import Any

from ..narrative.types import Finding
from .artifact_atlas import flag_artifact_confounds
from .medication_eeg import flag_medication_confounds
from .normative import NormativeContext, age_aware_band_range


def enhance_findings(
    findings: list[Finding],
    *,
    age_months: int | None = None,
    recording_state: str = "unspecified",
    patient_meta: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return enriched findings ready for narrative composition.

    Each output dict contains the original finding fields plus:

    * ``artifact_flags`` — list of possible artifact confounds for the channel/band
    * ``medication_flags`` — list of possible medication confounds for the band
    * ``normative_context`` — age/state-aware interpretation of the band
    * ``clinical_note`` — one-sentence synthesis of the above

    Parameters
    ----------
    findings : list of Finding
        Raw significant/borderline findings from ``findings.extract_findings``.
    age_months : int or None
        Patient age in months. If None, adult norms are assumed.
    recording_state : str
        One of ``awake_ec``, ``awake_eo``, ``drowsy``, ``stage_i``,
        ``stage_ii``, ``rem``, or ``unspecified``.
    patient_meta : dict or None
        May contain ``medications`` — a list of medication name strings.

    Returns
    -------
    list of dict
        JSON-serializable enriched findings. Safe for LLM prompts (no PHI).
    """
    enriched: list[dict[str, Any]] = []
    safe_age = age_months if age_months is not None else 300  # default adult
    medications: list[str] = []
    if patient_meta and "medications" in patient_meta:
        meds = patient_meta["medications"]
        if isinstance(meds, (list, tuple)):
            medications = [str(m) for m in meds]

    for f in findings:
        # Artifact advisory.
        artifact_flags = flag_artifact_confounds(f.region, f.band, f.metric)

        # Medication advisory.
        medication_flags = flag_medication_confounds(f.band, medications) if medications else []

        # Normative context.
        norm_ctx = age_aware_band_range(f.band, safe_age, recording_state)  # type: ignore[arg-type]

        # One-sentence clinical synthesis (deterministic, no LLM).
        clinical_note = _synthesize_note(f, artifact_flags, medication_flags, norm_ctx, safe_age)

        enriched.append(
            {
                "region": f.region,
                "band": f.band,
                "metric": f.metric,
                "value": f.value,
                "z": f.z,
                "direction": f.direction,
                "severity": f.severity,
                "artifact_flags": artifact_flags,
                "medication_flags": medication_flags,
                "normative_context": {
                    "expected_pdr_min_hz": norm_ctx.expected_pdr_min_hz,
                    "expected_pdr_max_hz": norm_ctx.expected_pdr_max_hz,
                    "band_in_context": norm_ctx.band_in_context,
                    "developmental_note": norm_ctx.developmental_note,
                },
                "clinical_note": clinical_note,
            }
        )

    return enriched


def _synthesize_note(
    finding: Finding,
    artifact_flags: list[dict[str, str]],
    medication_flags: list[dict[str, str]],
    norm_ctx: NormativeContext,
    age_months: int,
) -> str:
    """Build a deterministic one-sentence advisory note."""
    parts: list[str] = []

    # Direction + severity.
    parts.append(
        f"{finding.severity.title()} {finding.direction} {finding.band} at {finding.region} (z={finding.z:.2f})."
    )

    # Artifact caveat.
    high_conf = [a for a in artifact_flags if a["confidence"] == "high"]
    if high_conf:
        names = ", ".join(a["artifact_type"] for a in high_conf)
        parts.append(f"High-confidence artifact confounds to rule out: {names}.")
    elif artifact_flags:
        names = ", ".join(a["artifact_type"] for a in artifact_flags)
        parts.append(f"Consider ruling out: {names}.")

    # Medication caveat.
    if medication_flags:
        names = ", ".join(m["medication"].split("(")[0].strip() for m in medication_flags)
        parts.append(f"Medication confounds to consider: {names}.")

    # Developmental context.
    if age_months < 216:  # < 18 years
        parts.append(norm_ctx.developmental_note or "")

    # State context for adults.
    if age_months >= 216 and norm_ctx.band_in_context:
        parts.append(norm_ctx.band_in_context)

    return " ".join(p for p in parts if p)
