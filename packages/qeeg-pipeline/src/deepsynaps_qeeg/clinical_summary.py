"""Clinical decision-support summary for qEEG analyzer outputs.

This module turns low-level pipeline dictionaries into a stable, cautious
report block. It does not add new inference; it documents observed findings,
data quality, uncertainty, limitations, and provenance so downstream reports
and APIs can present qEEG results in a clinically reviewable way.

Output schema additions (2026-04-26 night-shift upgrade):
- ``qc_flags``: structured list (code/severity/message/affected) instead of
  buried text — top-level so frontend can render badges per finding.
- ``method_provenance``: explicit pipeline / detector / tool fingerprints.
- ``limitations``: structured array (code/severity/message) so callers can
  filter ("hide low-severity") instead of parsing prose.
- ``observed_findings`` and ``derived_interpretations`` stay separated: the
  first is "this is in the signal" (no inference), the second is "this is what
  a model would infer" (always hedged).
- Each finding now carries an ``evidence`` block: either real PubMed/RAG hits
  from the evidence layer, OR ``status='evidence_pending'`` when the layer is
  not reachable. We never fabricate citations.
- Stage errors are wrapped in a structured envelope (code / severity /
  recoverable / partial_output) instead of a raw string.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

log_ = logging.getLogger(__name__)

MIN_REVIEWABLE_EPOCHS = 20
TARGET_CLEAN_EPOCHS = 40
HIGH_BAD_CHANNEL_RATIO = 0.20

METHOD_CITATIONS: list[dict[str, str]] = [
    {
        "id": "mne",
        "label": "MNE-Python",
        "purpose": "EEG file I/O, filtering, epoching, spectra, and source-model support.",
        "url": "https://mne.tools/",
    },
    {
        "id": "pyprep",
        "label": "PyPREP / PREP-style robust referencing",
        "purpose": "Bad-channel detection and robust average-reference workflow.",
        "url": "https://pyprep.readthedocs.io/",
    },
    {
        "id": "autoreject",
        "label": "autoreject",
        "purpose": "Residual epoch-level artifact handling when available.",
        "url": "https://autoreject.github.io/",
    },
    {
        "id": "specparam",
        "label": "SpecParam / FOOOF",
        "purpose": "Aperiodic spectral parameterization and peak-alpha support.",
        "url": "https://fooof-tools.github.io/fooof/",
    },
]


def build_clinical_summary(
    *,
    features: dict[str, Any] | None,
    zscores: dict[str, Any] | None,
    quality: dict[str, Any] | None,
    age: int | None = None,
    sex: str | None = None,
    evidence_lookup: Callable[[str], list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    """Build a cautious, machine-readable qEEG decision-support block.

    Parameters
    ----------
    features, zscores, quality
        Pipeline outputs (see ``CONTRACT.md §1``).
    age, sex
        Patient context, used as-is in the response.
    evidence_lookup
        Optional callable ``(finding_label) -> list[citation_dict]``. If
        provided and reachable, each ``observed_findings`` entry will carry up
        to 3 supporting citations. Citations must be real (the callable is
        responsible for that — typically the ``deepsynaps_evidence`` layer).
        When the callable is absent, raises, or returns an empty list, the
        finding is marked ``evidence={"status": "evidence_pending", ...}`` —
        we never fabricate citations.
    """
    features = features or {}
    zscores = zscores or {}
    quality = quality or {}

    flags = _quality_flags(quality)
    confidence = _confidence_from_quality(quality, flags)
    observed = _observed_findings(features, zscores, evidence_lookup=evidence_lookup)
    derived = _derived_interpretations(observed, confidence, features)
    structured_stage_errors = _structured_stage_errors(quality.get("stage_errors") or {})
    limitations = _structured_limitations(features, quality, zscores, flags)

    return {
        "module": "qEEG Analyzer",
        "patient_context": {"age": age, "sex": sex},
        "confidence": confidence,
        # Top-level QC flags array (promoted out of data_quality so downstream
        # consumers — frontend, report renderer, fusion — can read it without
        # nested traversal). data_quality.flags kept as alias for backwards
        # compatibility with existing callers/tests.
        "qc_flags": flags,
        "data_quality": {
            "confidence": confidence,
            "flags": flags,
            "clean_epochs": _safe_int(quality.get("n_epochs_retained")),
            "total_epochs": _safe_int(quality.get("n_epochs_total")),
            "bad_channels": list(quality.get("bad_channels") or []),
            "stage_errors": dict(quality.get("stage_errors") or {}),
            "stage_errors_structured": structured_stage_errors,
            "bad_channel_detector": quality.get("bad_channel_detector"),
        },
        "observed_findings": observed,
        "derived_interpretations": derived,
        "limitations": limitations,
        "recommended_review_items": _review_items(flags, observed),
        "method_provenance": _method_provenance(quality, zscores, features),
        "safety_statement": (
            "Decision support only. Separate observed signal features from model-derived "
            "interpretation and review alongside history, examination, assessments, and imaging."
        ),
    }


def _structured_limitations(
    features: dict[str, Any],
    quality: dict[str, Any],
    zscores: dict[str, Any],
    flags: list[dict[str, str]],
) -> list[dict[str, Any]]:
    """Promote the previous prose limitations into a structured array.

    Frontends can filter by severity, search by code, or render a "show all
    limitations" toggle without text parsing. Backwards compatibility: the
    semantics of the original three statements are preserved verbatim in
    ``message``.
    """
    out: list[dict[str, Any]] = [
        {
            "code": "decision_support_only",
            "severity": "info",
            "message": "qEEG findings are observations from this recording and require clinical correlation.",
        },
        {
            "code": "not_a_diagnosis",
            "severity": "info",
            "message": "Similarity indices and normative deviations are not standalone clinical determinations.",
        },
    ]
    n_retained = _safe_int(quality.get("n_epochs_retained")) or 0
    if n_retained < TARGET_CLEAN_EPOCHS:
        out.append({
            "code": "low_clean_epoch_count",
            "severity": "high" if n_retained < MIN_REVIEWABLE_EPOCHS else "medium",
            "message": (
                f"Only {n_retained} clean epochs available; spectral, connectivity, and "
                "source estimates may be less stable than typical clinical recordings."
            ),
        })
    if quality.get("bad_channel_detector") == "correlation_deviation_fallback":
        out.append({
            "code": "fallback_bad_channel_detector",
            "severity": "low",
            "message": (
                "PyPREP was unavailable; bad channels were detected with a "
                "correlation+deviation fallback. PyPREP-grade detection is recommended."
            ),
        })
    if any(f.get("code", "").startswith("stage_error_") for f in flags):
        out.append({
            "code": "partial_pipeline_output",
            "severity": "high",
            "message": (
                "One or more pipeline stages reported errors; the report below is partial. "
                "Re-run the analysis or inspect data_quality.stage_errors_structured."
            ),
        })
    if not (features.get("source") or {}).get("method"):
        out.append({
            "code": "no_source_localization",
            "severity": "low",
            "message": "Source localization was skipped; ROI-level interpretation is not available.",
        })
    return out


def _method_provenance(
    quality: dict[str, Any],
    zscores: dict[str, Any],
    features: dict[str, Any],
) -> dict[str, Any]:
    """Top-level method provenance dict, including per-stage tool fingerprints."""
    spectral_prov = (features.get("spectral") or {}).get("method_provenance") or {}
    asym_prov = (features.get("asymmetry") or {}).get("method_provenance") or {}
    source_prov = features.get("source") or {}
    return {
        "pipeline_version": quality.get("pipeline_version"),
        "norm_db_version": zscores.get("norm_db_version"),
        "preprocessing": {
            "bandpass": quality.get("bandpass"),
            "notch_hz": quality.get("notch_hz"),
            "sfreq_input": quality.get("sfreq_input"),
            "sfreq_output": quality.get("sfreq_output"),
            "prep_used": bool(quality.get("prep_used")),
            "bad_channel_detector": quality.get("bad_channel_detector"),
            "iclabel_used": bool(quality.get("iclabel_used")),
            "autoreject_used": bool(quality.get("autoreject_used")),
        },
        "spectral": spectral_prov,
        "asymmetry": asym_prov,
        "source": {
            "method": source_prov.get("method"),
            "skipped_reason": quality.get("source_skipped_reason"),
        },
        "citations": METHOD_CITATIONS,
    }


def _structured_stage_errors(stage_errors: dict[str, Any]) -> list[dict[str, Any]]:
    """Wrap each stage error string into a structured envelope.

    Distinguishes recoverable vs hard failures using a small allow-list. Stages
    not in the list default to ``recoverable=False`` (safer for review).
    """
    recoverable_stages = {
        "embeddings", "longitudinal", "report", "source", "clinical_summary",
        "asymmetry", "graph",  # downstream metrics whose absence does not block reading the rest
    }
    out: list[dict[str, Any]] = []
    if not isinstance(stage_errors, dict):
        return out
    for stage, err in stage_errors.items():
        if not err:
            continue
        out.append({
            "code": f"stage_error_{stage}",
            "stage": str(stage),
            "severity": "high" if stage not in recoverable_stages else "medium",
            "message": str(err),
            "recoverable": stage in recoverable_stages,
            "partial_output_available": stage in recoverable_stages,
        })
    return out


def _quality_flags(quality: dict[str, Any]) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    retained = _safe_int(quality.get("n_epochs_retained"))
    if retained is not None and retained < TARGET_CLEAN_EPOCHS:
        severity = "high" if retained < MIN_REVIEWABLE_EPOCHS else "medium"
        flags.append({
            "severity": severity,
            "code": "low_clean_epoch_count",
            "message": (
                f"Only {retained} clean epochs retained; spectral and connectivity estimates "
                "may be less stable."
            ),
        })

    n_input = _safe_int(quality.get("n_channels_input"))
    n_bad = len(quality.get("bad_channels") or [])
    if n_input:
        ratio = n_bad / max(n_input, 1)
        if ratio >= HIGH_BAD_CHANNEL_RATIO:
            flags.append({
                "severity": "medium",
                "code": "high_bad_channel_ratio",
                "message": f"{n_bad}/{n_input} channels were marked bad or interpolated.",
            })

    for key, label in (
        ("prep_used", "PyPREP robust referencing was unavailable or skipped."),
        ("iclabel_used", "ICLabel artifact labeling was unavailable or skipped."),
        ("autoreject_used", "autoreject epoch cleanup was unavailable or skipped."),
    ):
        if quality.get(key) is False:
            flags.append({"severity": "medium", "code": f"{key}_false", "message": label})

    if quality.get("source_skipped_reason"):
        flags.append({
            "severity": "low",
            "code": "source_localization_skipped",
            "message": f"Source localization skipped: {quality.get('source_skipped_reason')}.",
        })

    stage_errors = quality.get("stage_errors") or {}
    if isinstance(stage_errors, dict):
        for stage, err in stage_errors.items():
            if err:
                flags.append({
                    "severity": "high",
                    "code": f"stage_error_{stage}",
                    "message": f"{stage} stage reported an error; downstream outputs may be partial.",
                })
    return flags


def _confidence_from_quality(
    quality: dict[str, Any],
    flags: list[dict[str, str]],
) -> dict[str, Any]:
    score = 0.92
    penalties = {"high": 0.22, "medium": 0.10, "low": 0.04}
    for flag in flags:
        score -= penalties.get(flag.get("severity", "low"), 0.04)
    retained = _safe_int(quality.get("n_epochs_retained"))
    if retained is None:
        score -= 0.08
    elif retained >= TARGET_CLEAN_EPOCHS:
        score += 0.03
    score = max(0.15, min(0.97, score))
    if score >= 0.78:
        level = "high"
    elif score >= 0.55:
        level = "moderate"
    else:
        level = "low"
    return {
        "score": round(score, 2),
        "level": level,
        "rationale": "Derived from clean epochs, bad-channel burden, optional artifact tooling, and stage errors.",
    }


def _observed_findings(
    features: dict[str, Any],
    zscores: dict[str, Any],
    *,
    evidence_lookup: Callable[[str], list[dict[str, Any]]] | None = None,
) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    flagged = zscores.get("flagged") or []
    if isinstance(flagged, list):
        for item in flagged[:6]:
            if not isinstance(item, dict):
                continue
            findings.append({
                "type": "normative_deviation",
                "label": str(item.get("metric") or "qEEG metric"),
                "location": item.get("channel"),
                "value": item.get("z"),
                "unit": "z",
                "statement": (
                    f"Observed {item.get('metric', 'qEEG metric')} deviation"
                    + (f" at {item.get('channel')}" if item.get("channel") else "")
                    + (f" (z={float(item.get('z')):.2f})." if _is_number(item.get("z")) else ".")
                ),
            })

    paf_values = [
        float(v)
        for v in ((features.get("spectral") or {}).get("peak_alpha_freq") or {}).values()
        if _is_number(v)
    ]
    if paf_values:
        mean_paf = sum(paf_values) / len(paf_values)
        findings.append({
            "type": "spectral_parameter",
            "label": "mean_peak_alpha_frequency",
            "value": round(mean_paf, 2),
            "unit": "Hz",
            "statement": f"Mean peak alpha frequency across available channels was {mean_paf:.2f} Hz.",
        })

    asym = (features.get("asymmetry") or {}).get("frontal_alpha_F3_F4")
    if _is_number(asym):
        findings.append({
            "type": "asymmetry",
            "label": "frontal_alpha_F3_F4",
            "value": round(float(asym), 3),
            "unit": "log-ratio",
            "statement": f"Frontal alpha asymmetry F3/F4 value was {float(asym):.3f}.",
        })

    # Attach per-finding evidence (real citations from the evidence layer, OR
    # an explicit "evidence_pending" marker). Never fabricate.
    for finding in findings:
        finding["evidence"] = _attach_evidence(finding, evidence_lookup)

    return findings


def _attach_evidence(
    finding: dict[str, Any],
    evidence_lookup: Callable[[str], list[dict[str, Any]]] | None,
) -> dict[str, Any]:
    """Attach 1-3 supporting citations to a finding via the evidence layer.

    The evidence layer must return a list of dicts with at least ``title`` and
    ``url`` (PubMed-style). If unreachable or returns nothing, we mark the
    finding as ``evidence_pending`` so the frontend can render a clear chip
    instead of fabricating references.
    """
    if evidence_lookup is None:
        return {"status": "evidence_pending", "reason": "no_evidence_lookup_provided"}
    label = str(finding.get("label") or finding.get("type") or "qEEG_finding")
    try:
        hits = evidence_lookup(label) or []
    except Exception as exc:  # pragma: no cover — defensive
        log_.warning("Evidence lookup raised for %s (%s).", label, exc)
        return {"status": "evidence_pending", "reason": f"lookup_error: {type(exc).__name__}"}
    if not isinstance(hits, list) or not hits:
        return {"status": "evidence_pending", "reason": "no_matches"}
    # Trim to 3 strongest hits, filter to dicts with at least a title or url.
    cleaned: list[dict[str, Any]] = []
    for h in hits[:3]:
        if not isinstance(h, dict):
            continue
        if not (h.get("title") or h.get("url") or h.get("pmid")):
            continue
        cleaned.append({
            "title": h.get("title"),
            "url": h.get("url"),
            "pmid": h.get("pmid"),
            "year": h.get("year"),
            "evidence_level": h.get("evidence_level"),
        })
    if not cleaned:
        return {"status": "evidence_pending", "reason": "no_well_formed_hits"}
    return {"status": "found", "citations": cleaned}


def _derived_interpretations(
    observed: list[dict[str, Any]],
    confidence: dict[str, Any],
    features: dict[str, Any],
) -> list[dict[str, Any]]:
    derived: list[dict[str, Any]] = []
    if not observed:
        derived.append({
            "label": "no_salient_qeeg_deviation",
            "confidence": confidence["level"],
            "statement": "No salient qEEG deviations were selected for interpretation in this run.",
        })
    else:
        derived.append({
            "label": "clinician_review_required",
            "confidence": confidence["level"],
            "statement": (
                "Observed qEEG features may help guide clinical review, but should be interpreted "
                "with symptoms, validated assessments, medication state, sleep, and imaging."
            ),
        })

    source = features.get("source") or {}
    if isinstance(source, dict) and source.get("method"):
        derived.append({
            "label": "source_localization_available",
            "confidence": "moderate",
            "statement": (
                f"{source.get('method')} source estimates are model-derived and should be "
                "reviewed as approximate ROI-level support, not direct neural measurement."
            ),
        })
    return derived


def _review_items(
    flags: list[dict[str, str]],
    observed: list[dict[str, Any]],
) -> list[str]:
    items = []
    if flags:
        items.append("Review data-quality flags before relying on spectral, connectivity, or source estimates.")
    if any(f.get("type") == "normative_deviation" for f in observed):
        items.append("Check whether flagged channels match symptoms, montage quality, and artifact distribution.")
    items.append("Document clinician interpretation separately from model-derived narrative.")
    return items


def _safe_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _is_number(value: Any) -> bool:
    try:
        return value is not None and float(value) == float(value)
    except (TypeError, ValueError):
        return False
