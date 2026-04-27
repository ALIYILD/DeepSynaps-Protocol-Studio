"""Clinical decision-support scores — unified ScoreResponse adapters.

This module is owned by Stream 4 (Risk / Scoring). It does NOT compute
biomarker features; it CONSUMES upstream payloads (qEEG ``risk_scores``,
qEEG/MRI ``brain_age``, longitudinal trajectory, adherence summary,
validated assessments) and packages them into the unified
``ScoreResponse`` envelope defined in
``packages/evidence/src/deepsynaps_evidence/score_response.py``.

Eight scores are exposed:

* ``anxiety``       — primary GAD-7 / HAM-A; supporting qEEG ``anxiety_like``.
* ``depression``    — primary PHQ-9 / HAM-D / BDI-II; supporting qEEG ``mdd_like``.
* ``stress``        — primary PSS-10 (when present); supporting wearable HRV / mood.
* ``mci``           — primary MoCA / MMSE (when present); supporting qEEG
                      ``cognitive_decline_like``.
* ``brain_age``     — biomarker model output; no PROM anchor.
* ``relapse_risk``  — research_grade; PROM trajectory + adverse events.
* ``adherence_risk``— research_grade; descriptive home-device aggregates.
* ``response_probability`` — research_grade; cohort-similarity prior.

Hard rules (decision-support, NOT diagnostic):

* Validated assessments are PRIMARY anchors. Biomarkers are SUPPORTING.
* Wording is hedged ("may indicate", "consistent with",
  "discuss with clinician"). NEVER "diagnose".
* Confidence is capped via :func:`deepsynaps_evidence.cap_confidence`:
  no validated anchor → cannot reach ``high``; research-grade → cannot
  exceed ``med``.
* Every score logs ``inputs_hash + version + confidence`` for audit.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from deepsynaps_evidence.score_response import (
    Caution,
    ConfidenceBand,
    EvidenceRef,
    MethodProvenance,
    ScoreResponse,
    ScoreScale,
    TopContributor,
    cap_confidence,
    hash_inputs,
)

log = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

#: Validated assessment scales — score_id → (anchor_label, max, severity_thresholds).
#: Thresholds are standard published cutoffs.
ASSESSMENT_ANCHORS: dict[str, dict[str, Any]] = {
    "anxiety": {
        "preferred_order": ["gad7", "hama"],
        "labels": {"gad7": "GAD-7", "hama": "HAM-A"},
        "max": {"gad7": 21, "hama": 56},
        "thresholds": {
            # GAD-7: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe.
            "gad7": [(5, "minimal"), (10, "mild"), (15, "moderate"), (22, "severe")],
            # HAM-A: 0-7 none, 8-14 mild, 15-23 moderate, 24+ severe.
            "hama": [(8, "none"), (15, "mild"), (24, "moderate"), (57, "severe")],
        },
    },
    "depression": {
        "preferred_order": ["phq9", "hamd", "bdi2", "bdi"],
        "labels": {"phq9": "PHQ-9", "hamd": "HAM-D", "bdi2": "BDI-II", "bdi": "BDI"},
        "max": {"phq9": 27, "hamd": 52, "bdi2": 63, "bdi": 63},
        "thresholds": {
            # PHQ-9: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 mod-severe, 20+ severe.
            "phq9": [(5, "minimal"), (10, "mild"), (15, "moderate"), (20, "moderately-severe"), (28, "severe")],
            "hamd": [(8, "normal"), (14, "mild"), (19, "moderate"), (23, "severe"), (53, "very-severe")],
            "bdi2": [(14, "minimal"), (20, "mild"), (29, "moderate"), (64, "severe")],
            "bdi": [(14, "minimal"), (20, "mild"), (29, "moderate"), (64, "severe")],
        },
    },
    "stress": {
        # PSS-10 is not yet in assessment_scoring._PREFIX_SCORING (catalog gap).
        # We will accept it via assessments[].score_numeric when template_id starts with "pss".
        "preferred_order": ["pss10", "pss"],
        "labels": {"pss10": "PSS-10", "pss": "PSS"},
        "max": {"pss10": 40, "pss": 56},
        "thresholds": {
            # PSS-10: 0-13 low, 14-26 moderate, 27-40 high.
            "pss10": [(14, "low"), (27, "moderate"), (41, "high")],
            "pss": [(14, "low"), (27, "moderate"), (57, "high")],
        },
    },
    "mci": {
        # MoCA / MMSE not yet catalogued — same gap as PSS-10.
        "preferred_order": ["moca", "mmse"],
        "labels": {"moca": "MoCA", "mmse": "MMSE"},
        "max": {"moca": 30, "mmse": 30},
        "thresholds": {
            # MoCA: <26 suggestive of cognitive impairment.
            "moca": [(26, "impaired"), (31, "normal")],
            # MMSE: 24-30 normal, 19-23 mild, 10-18 moderate, <10 severe.
            "mmse": [(10, "severe"), (19, "moderate"), (24, "mild"), (31, "normal")],
        },
    },
}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _latest_assessment(assessments: list[dict], template_prefix: str) -> Optional[dict]:
    """Return the most recent completed assessment whose template_id starts with prefix."""
    for a in assessments or []:
        tid = (a.get("template_id") or "").lower()
        if tid.startswith(template_prefix.lower()):
            return a
    return None


def _interp_threshold(value: float, thresholds: list[tuple[int, str]]) -> str:
    """Return the band label for a value given ascending (cutoff, label) tuples."""
    for cutoff, label in thresholds:
        if value < cutoff:
            return label
    return thresholds[-1][1] if thresholds else ""


def _emit_log(
    score_id: str,
    provenance: MethodProvenance,
    confidence: ConfidenceBand,
) -> None:
    """Emit a structured audit log line per task spec."""
    log.info(
        "clinical_score: score_id=%s model_id=%s version=%s inputs_hash=%s confidence=%s upstream_is_stub=%s",
        score_id,
        provenance.model_id,
        provenance.version,
        provenance.inputs_hash,
        confidence,
        provenance.upstream_is_stub,
    )


def _no_data_response(
    score_id: str,
    scale: ScoreScale,
    *,
    cautions: Optional[list[Caution]] = None,
    model_id: str = "no-data",
    inputs: Optional[dict] = None,
) -> ScoreResponse:
    provenance = MethodProvenance(
        model_id=model_id,
        version="v1",
        inputs_hash=hash_inputs(inputs or {}),
        upstream_is_stub=False,
    )
    out = ScoreResponse(
        score_id=score_id,
        value=None,
        scale=scale,
        interpretation="Insufficient data — discuss with clinician.",
        confidence="no_data",
        uncertainty_band=None,
        top_contributors=[],
        assessment_anchor=None,
        evidence_refs=[],
        cautions=cautions or [Caution(code="missing-inputs", severity="info",
                                       message="No qualifying inputs available to compute this score.")],
        method_provenance=provenance,
        computed_at=_now(),
    )
    _emit_log(score_id, provenance, "no_data")
    return out


# ── PROM-anchored scores ─────────────────────────────────────────────────────


def _prom_anchored_score(
    *,
    score_id: str,
    assessments: list[dict],
    biomarker_payload: Optional[dict],
    biomarker_label: Optional[str],
    biomarker_score_field: str,
    evidence_refs: Optional[list[EvidenceRef]] = None,
    extra_cautions: Optional[list[Caution]] = None,
) -> ScoreResponse:
    """Build a ScoreResponse for a PROM-anchored score (anxiety, depression,
    stress, mci).

    PRIMARY anchor: validated assessment when present.
    SUPPORTING: biomarker similarity index from the qEEG payload.
    """
    cfg = ASSESSMENT_ANCHORS[score_id]
    anchor_assessment: Optional[dict] = None
    anchor_key: Optional[str] = None
    for key in cfg["preferred_order"]:
        a = _latest_assessment(assessments, key)
        if a is not None:
            anchor_assessment = a
            anchor_key = key
            break

    cautions: list[Caution] = list(extra_cautions or [])
    contributors: list[TopContributor] = []
    biomarker_value: Optional[float] = None
    biomarker_ci: Optional[tuple[float, float]] = None
    upstream_stub = False

    # Biomarker contributor (always supporting only)
    if biomarker_payload and biomarker_label and isinstance(biomarker_payload, dict):
        bm_block = biomarker_payload.get(biomarker_label)
        if isinstance(bm_block, dict):
            biomarker_value = _safe_float(bm_block.get(biomarker_score_field))
            ci = bm_block.get("ci95")
            if isinstance(ci, (list, tuple)) and len(ci) == 2:
                lo, hi = _safe_float(ci[0]), _safe_float(ci[1])
                if lo is not None and hi is not None:
                    biomarker_ci = (lo, hi)
            drivers = bm_block.get("drivers") or []
            for d in drivers[:3]:
                if isinstance(d, dict):
                    contributors.append(
                        TopContributor(
                            feature=str(d.get("feature") or "biomarker"),
                            weight=_safe_float(d.get("value")),
                            direction=str(d.get("direction")) if d.get("direction") else None,
                            value=d.get("value"),
                        )
                    )
        # Surface upstream stub flag if present
        cal = biomarker_payload.get("calibration")
        if isinstance(cal, dict) and cal.get("status", "").startswith("not_clinic"):
            cautions.append(
                Caution(
                    code="uncalibrated-biomarker",
                    severity="warning",
                    message=(
                        "Supporting biomarker score is uncalibrated to a clinical population; "
                        "interpret as pattern similarity only."
                    ),
                )
            )
        if isinstance(bm_block, dict) and bm_block.get("calibration") == "uncalibrated_stub":
            upstream_stub = True

    # PROM path -------------------------------------------------------------
    if anchor_assessment is not None and anchor_key is not None:
        score_value = _safe_float(
            anchor_assessment.get("score_numeric") or anchor_assessment.get("score")
        )
        if score_value is None:
            cautions.append(
                Caution(
                    code="anchor-missing-score",
                    severity="warning",
                    message=f"{cfg['labels'][anchor_key]} record found but no numeric score.",
                )
            )
            confidence: ConfidenceBand = "low"
            interpretation = (
                f"{cfg['labels'][anchor_key]} record present but unscored; "
                f"discuss with clinician."
            )
            value = None
            band = None
        else:
            band_label = _interp_threshold(score_value, cfg["thresholds"][anchor_key])
            confidence = "high"
            interpretation = (
                f"{cfg['labels'][anchor_key]} = {score_value:g} ({band_label}); "
                f"may indicate {band_label} {score_id} symptoms — discuss with clinician."
            )
            value = score_value
            band = None
            contributors.insert(
                0,
                TopContributor(
                    feature=f"{anchor_key}_total",
                    weight=score_value,
                    direction="higher_when_more_severe",
                    value=score_value,
                ),
            )

        # Special: PHQ-9 item 9 safety surface
        if score_id == "depression" and anchor_key == "phq9":
            items = anchor_assessment.get("items") or {}
            if isinstance(items, dict):
                item9 = items.get("phq9_9") or items.get("9") or items.get("item_9")
                try:
                    item9_int = int(item9) if item9 is not None else 0
                except (TypeError, ValueError):
                    item9_int = 0
                if item9_int >= 1:
                    cautions.append(
                        Caution(
                            code="phq9-item9-positive",
                            severity="block" if item9_int >= 2 else "warning",
                            message=(
                                f"PHQ-9 item 9 = {item9_int}: suicidality screen required — "
                                f"see /api/v1/risk/patient/{{id}} suicide_risk category."
                            ),
                        )
                    )

        provenance = MethodProvenance(
            model_id=f"{score_id}-anchor-{anchor_key}",
            version="v1",
            inputs_hash=hash_inputs(
                {
                    "anchor": anchor_key,
                    "score": score_value,
                    "biomarker_value": biomarker_value,
                }
            ),
            upstream_is_stub=upstream_stub,
        )
        confidence = cap_confidence(
            confidence,
            has_validated_anchor=True,
            research_grade=False,
        )
        out = ScoreResponse(
            score_id=score_id,
            value=value,
            scale="raw_assessment",
            interpretation=interpretation,
            confidence=confidence,
            uncertainty_band=band,
            top_contributors=contributors,
            assessment_anchor=cfg["labels"][anchor_key],
            evidence_refs=evidence_refs or [],
            cautions=cautions,
            method_provenance=provenance,
            computed_at=_now(),
        )
        _emit_log(score_id, provenance, confidence)
        return out

    # No PROM anchor — fall back to biomarker-only (capped at MED) ----------
    cautions.append(
        Caution(
            code="missing-validated-anchor",
            severity="warning",
            message=(
                f"No validated {score_id} assessment "
                f"({', '.join(cfg['labels'].values())}) on file. "
                "Biomarker similarity index is supporting evidence only."
            ),
        )
    )
    if biomarker_value is None:
        return _no_data_response(
            score_id,
            "similarity_index",
            cautions=cautions,
            model_id=f"{score_id}-biomarker-fallback",
            inputs={"biomarker_label": biomarker_label},
        )

    confidence = cap_confidence(
        "med",
        has_validated_anchor=False,
        research_grade=False,
    )
    interpretation = (
        f"qEEG '{biomarker_label}' similarity = {biomarker_value:.2f}; "
        f"may indicate biomarker pattern consistent with {score_id} — "
        f"discuss with clinician. NOT diagnostic."
    )
    provenance = MethodProvenance(
        model_id=f"{score_id}-biomarker-fallback",
        version="v1",
        inputs_hash=hash_inputs(
            {
                "biomarker_label": biomarker_label,
                "biomarker_value": biomarker_value,
            }
        ),
        upstream_is_stub=upstream_stub,
    )
    out = ScoreResponse(
        score_id=score_id,
        value=biomarker_value,
        scale="similarity_index",
        interpretation=interpretation,
        confidence=confidence,
        uncertainty_band=biomarker_ci,
        top_contributors=contributors,
        assessment_anchor=None,
        evidence_refs=evidence_refs or [],
        cautions=cautions,
        method_provenance=provenance,
        computed_at=_now(),
    )
    _emit_log(score_id, provenance, confidence)
    return out


# ── Public score builders ────────────────────────────────────────────────────


def build_anxiety_score(
    *,
    assessments: list[dict],
    qeeg_risk_payload: Optional[dict] = None,
    evidence_refs: Optional[list[EvidenceRef]] = None,
) -> ScoreResponse:
    return _prom_anchored_score(
        score_id="anxiety",
        assessments=assessments,
        biomarker_payload=qeeg_risk_payload,
        biomarker_label="anxiety_like",
        biomarker_score_field="score",
        evidence_refs=evidence_refs,
    )


def build_depression_score(
    *,
    assessments: list[dict],
    qeeg_risk_payload: Optional[dict] = None,
    evidence_refs: Optional[list[EvidenceRef]] = None,
) -> ScoreResponse:
    return _prom_anchored_score(
        score_id="depression",
        assessments=assessments,
        biomarker_payload=qeeg_risk_payload,
        biomarker_label="mdd_like",
        biomarker_score_field="score",
        evidence_refs=evidence_refs,
    )


def build_stress_score(
    *,
    assessments: list[dict],
    wearable_summary: Optional[dict] = None,
    evidence_refs: Optional[list[EvidenceRef]] = None,
) -> ScoreResponse:
    """Stress: PSS-10 primary; supporting wearable HRV / mood when present.

    PSS-10 / PSS are NOT yet in ``assessment_scoring._PREFIX_SCORING`` so
    the assessment will only land here if the front-end submits a record
    with ``template_id`` starting with ``"pss"``. Until that catalogue
    gap is closed, most patients land in the wearable-only branch and
    are flagged research-grade.
    """
    extra_cautions: list[Caution] = []
    contributors: list[TopContributor] = []
    cfg = ASSESSMENT_ANCHORS["stress"]

    # PROM path
    for key in cfg["preferred_order"]:
        a = _latest_assessment(assessments, key)
        if a is not None:
            return _prom_anchored_score(
                score_id="stress",
                assessments=assessments,
                biomarker_payload=None,
                biomarker_label=None,
                biomarker_score_field="score",
                evidence_refs=evidence_refs,
            )

    # No PROM — wearable-only research-grade
    extra_cautions.append(
        Caution(
            code="missing-validated-anchor",
            severity="warning",
            message="No PSS-10 / PSS on file — stress score is research-grade.",
        )
    )
    extra_cautions.append(
        Caution(
            code="research-grade-score",
            severity="info",
            message="Stress score from wearable HRV / mood is research-grade only.",
        )
    )

    if not wearable_summary:
        return _no_data_response(
            "stress",
            "research_grade",
            cautions=extra_cautions,
            model_id="stress-wearable-fallback",
        )

    mood = _safe_float(wearable_summary.get("mood_score"))
    anxiety = _safe_float(wearable_summary.get("anxiety_score"))
    sleep = _safe_float(wearable_summary.get("sleep_hours"))
    hrv = _safe_float(wearable_summary.get("hrv_ms"))

    signals = [v for v in (mood, anxiety, sleep, hrv) if v is not None]
    if not signals:
        return _no_data_response(
            "stress",
            "research_grade",
            cautions=extra_cautions,
            model_id="stress-wearable-fallback",
        )

    # Naive composite ∈ [0,1]: weight mood (lower=worse) + anxiety (higher=worse)
    components: list[float] = []
    if mood is not None:
        components.append(max(0.0, min(1.0, (10.0 - mood) / 10.0)))
        contributors.append(TopContributor(feature="wearable_mood", weight=mood, direction="lower_when_worse", value=mood))
    if anxiety is not None:
        components.append(max(0.0, min(1.0, anxiety / 10.0)))
        contributors.append(TopContributor(feature="wearable_anxiety", weight=anxiety, direction="higher_when_worse", value=anxiety))
    if hrv is not None:
        # Lower HRV → higher stress; 30ms = high, 80ms = low. Map crudely.
        components.append(max(0.0, min(1.0, (80.0 - hrv) / 50.0)))
        contributors.append(TopContributor(feature="wearable_hrv", weight=hrv, direction="lower_when_worse", value=hrv))
    if sleep is not None:
        components.append(max(0.0, min(1.0, (8.0 - sleep) / 8.0)))
        contributors.append(TopContributor(feature="wearable_sleep_hours", weight=sleep, direction="lower_when_worse", value=sleep))
    composite = sum(components) / max(len(components), 1)

    confidence = cap_confidence(
        "med" if len(signals) >= 3 else "low",
        has_validated_anchor=False,
        research_grade=True,
    )
    provenance = MethodProvenance(
        model_id="stress-wearable-fallback",
        version="v1",
        inputs_hash=hash_inputs({"mood": mood, "anxiety": anxiety, "sleep": sleep, "hrv": hrv}),
    )
    out = ScoreResponse(
        score_id="stress",
        value=round(composite, 3),
        scale="research_grade",
        interpretation=(
            f"Composite wearable stress index = {composite:.2f} (research-grade); "
            "may indicate elevated stress patterns — discuss with clinician."
        ),
        confidence=confidence,
        uncertainty_band=None,
        top_contributors=contributors,
        assessment_anchor=None,
        evidence_refs=evidence_refs or [],
        cautions=extra_cautions,
        method_provenance=provenance,
        computed_at=_now(),
    )
    _emit_log("stress", provenance, confidence)
    return out


def build_mci_score(
    *,
    assessments: list[dict],
    qeeg_risk_payload: Optional[dict] = None,
    chronological_age: Optional[int] = None,
    evidence_refs: Optional[list[EvidenceRef]] = None,
) -> ScoreResponse:
    """MCI / cognitive risk: MoCA / MMSE primary, supporting
    ``cognitive_decline_like`` qEEG similarity. Adds out-of-distribution
    caution when chronological_age < 40.
    """
    extra_cautions: list[Caution] = []
    if chronological_age is not None and chronological_age < 40:
        extra_cautions.append(
            Caution(
                code="out-of-distribution-age",
                severity="warning",
                message=(
                    "qEEG cognitive-decline biomarker priors are calibrated for older adults "
                    "(>=40); interpretation in younger patients is exploratory."
                ),
            )
        )

    return _prom_anchored_score(
        score_id="mci",
        assessments=assessments,
        biomarker_payload=qeeg_risk_payload,
        biomarker_label="cognitive_decline_like",
        biomarker_score_field="score",
        evidence_refs=evidence_refs,
        extra_cautions=extra_cautions,
    )


def build_brain_age_score(
    *,
    brain_age_payload: Optional[dict] = None,
    chronological_age: Optional[int] = None,
    evidence_refs: Optional[list[EvidenceRef]] = None,
    source: str = "qeeg",
) -> ScoreResponse:
    """Brain-age: consume the upstream payload (qEEG ``predict_brain_age``
    or MRI brain-age) safely. Validate range, surface confidence, flag
    stub.

    The payload shape we consume::

        {
          "predicted_years": float,
          "chronological_years": int | None,
          "gap_years": float | None,
          "gap_percentile": float,
          "confidence": "low" | "moderate" | "high",
          "is_stub": bool,
          "electrode_importance": dict[str, float] | None,
        }
    """
    cautions: list[Caution] = []
    if not isinstance(brain_age_payload, dict):
        return _no_data_response(
            "brain_age",
            "years",
            cautions=[Caution(code="missing-inputs", severity="info",
                              message="No brain-age payload available.")],
            model_id=f"brain-age-{source}",
        )

    predicted = _safe_float(brain_age_payload.get("predicted_years"))
    if predicted is None:
        return _no_data_response(
            "brain_age",
            "years",
            cautions=[Caution(code="malformed-payload", severity="warning",
                              message="Brain-age payload missing predicted_years.")],
            model_id=f"brain-age-{source}",
        )

    # Range validation — guard against nonsense
    if predicted < 5.0 or predicted > 95.0:
        cautions.append(
            Caution(
                code="out-of-range-brain-age",
                severity="warning",
                message=f"Predicted brain-age {predicted:.1f} years is outside the supported [5, 95] range.",
            )
        )

    is_stub = bool(brain_age_payload.get("is_stub"))
    if is_stub:
        cautions.append(
            Caution(
                code="stub-model-fallback",
                severity="warning",
                message="Brain-age model fell back to deterministic stub — interpret with caution.",
            )
        )

    chrono = brain_age_payload.get("chronological_years")
    if chrono is None:
        chrono = chronological_age
    gap = _safe_float(brain_age_payload.get("gap_years"))
    if gap is None and chrono is not None:
        gap = predicted - float(chrono)

    if gap is not None and abs(gap) > 10.0:
        cautions.append(
            Caution(
                code="large-brain-age-gap",
                severity="warning",
                message=f"|gap_years| = {abs(gap):.1f} > 10 — may reflect noise rather than pathology.",
            )
        )

    if chrono is None:
        cautions.append(
            Caution(
                code="missing-chronological-age",
                severity="info",
                message="No chronological age on file — gap_years not computed.",
            )
        )

    raw_confidence = str(brain_age_payload.get("confidence") or "low").lower()
    confidence_map = {"high": "high", "moderate": "med", "med": "med", "low": "low", "no_data": "no_data"}
    confidence: ConfidenceBand = confidence_map.get(raw_confidence, "low")  # type: ignore[assignment]
    confidence = cap_confidence(
        confidence,
        has_validated_anchor=False,  # brain-age has no PROM anchor by design
        research_grade=is_stub,
    )

    contributors: list[TopContributor] = []
    importance = brain_age_payload.get("electrode_importance") or {}
    if isinstance(importance, dict):
        ranked = sorted(
            ((ch, _safe_float(w) or 0.0) for ch, w in importance.items()),
            key=lambda kv: kv[1],
            reverse=True,
        )[:3]
        for ch, w in ranked:
            contributors.append(
                TopContributor(
                    feature=f"electrode_{ch}",
                    weight=w,
                    direction="higher_importance_when_elevated",
                    value=w,
                )
            )

    interp_bits = [f"Predicted brain-age {predicted:.1f} years"]
    if chrono is not None:
        interp_bits.append(f"vs chronological {chrono} ({(gap or 0.0):+.1f} y gap)")
    interp_bits.append("research-supportive metric — discuss with clinician")
    interpretation = "; ".join(interp_bits) + "."

    provenance = MethodProvenance(
        model_id=f"brain-age-{source}",
        version="v1",
        inputs_hash=hash_inputs(
            {
                "predicted_years": predicted,
                "chronological_years": chrono,
                "is_stub": is_stub,
            }
        ),
        upstream_is_stub=is_stub,
    )
    out = ScoreResponse(
        score_id="brain_age",
        value=predicted,
        scale="years",
        interpretation=interpretation,
        confidence=confidence,
        uncertainty_band=None,
        top_contributors=contributors,
        assessment_anchor=None,
        evidence_refs=evidence_refs or [],
        cautions=cautions,
        method_provenance=provenance,
        computed_at=_now(),
    )
    _emit_log("brain_age", provenance, confidence)
    return out


def build_relapse_risk_score(
    *,
    trajectory_change_scores: Optional[dict] = None,
    adverse_event_count: int = 0,
    evidence_refs: Optional[list[EvidenceRef]] = None,
) -> ScoreResponse:
    """Relapse risk — research-grade; PROM trajectory + adverse events.

    Aggregates a coarse 0..1 risk index from:
        * fraction of significantly worsening features (FDR-corrected),
        * unresolved adverse-event count (cap at 3 → 1.0).
    """
    cautions: list[Caution] = [
        Caution(
            code="research-grade-score",
            severity="warning",
            message="Relapse risk has no validated assessment anchor — research-grade only.",
        )
    ]

    if not trajectory_change_scores and not adverse_event_count:
        return _no_data_response(
            "relapse_risk",
            "research_grade",
            cautions=cautions,
            model_id="relapse-trajectory-v1",
        )

    contributors: list[TopContributor] = []
    sig_fraction = 0.0
    if trajectory_change_scores:
        total = len(trajectory_change_scores)
        sig = sum(1 for v in trajectory_change_scores.values()
                  if isinstance(v, dict) and v.get("significant") and (v.get("delta") or 0) > 0)
        sig_fraction = (sig / total) if total else 0.0
        # Top 3 worsening features by RCI magnitude
        ranked = sorted(
            (
                (k, v)
                for k, v in trajectory_change_scores.items()
                if isinstance(v, dict) and isinstance(v.get("rci"), (int, float))
            ),
            key=lambda kv: abs(kv[1]["rci"]),
            reverse=True,
        )[:3]
        for k, v in ranked:
            contributors.append(
                TopContributor(
                    feature=k,
                    weight=_safe_float(v.get("rci")),
                    direction="higher_when_worsening",
                    value=v.get("delta"),
                )
            )

    ae_component = min(1.0, adverse_event_count / 3.0)
    composite = round(0.6 * sig_fraction + 0.4 * ae_component, 3)
    confidence = cap_confidence(
        "med" if (trajectory_change_scores and adverse_event_count >= 0) else "low",
        has_validated_anchor=False,
        research_grade=True,
    )

    provenance = MethodProvenance(
        model_id="relapse-trajectory-v1",
        version="v1",
        inputs_hash=hash_inputs(
            {
                "sig_fraction": sig_fraction,
                "adverse_event_count": adverse_event_count,
            }
        ),
    )
    out = ScoreResponse(
        score_id="relapse_risk",
        value=composite,
        scale="research_grade",
        interpretation=(
            f"Relapse-risk research index = {composite:.2f} "
            f"({int(sig_fraction*100)}% features worsening, {adverse_event_count} unresolved AEs); "
            "may indicate increased relapse risk — discuss with clinician."
        ),
        confidence=confidence,
        uncertainty_band=None,
        top_contributors=contributors,
        assessment_anchor=None,
        evidence_refs=evidence_refs or [],
        cautions=cautions,
        method_provenance=provenance,
        computed_at=_now(),
    )
    _emit_log("relapse_risk", provenance, confidence)
    return out


def build_adherence_risk_score(
    *,
    adherence_summary: Optional[dict] = None,
    evidence_refs: Optional[list[EvidenceRef]] = None,
) -> ScoreResponse:
    """Adherence risk — research-grade; wraps ``home_device_adherence`` aggregates.

    HIGH risk when:
      * adherence_rate_pct < 50, OR
      * open_flags >= 1, OR
      * side_effect_count >= 3.
    """
    cautions: list[Caution] = [
        Caution(
            code="research-grade-score",
            severity="info",
            message="Adherence risk is descriptive — research-grade only.",
        )
    ]
    if not adherence_summary:
        return _no_data_response(
            "adherence_risk",
            "research_grade",
            cautions=cautions,
            model_id="adherence-rules-v1",
        )

    rate = _safe_float(adherence_summary.get("adherence_rate_pct"))
    expected = adherence_summary.get("sessions_expected")
    open_flags = int(adherence_summary.get("open_flags") or 0)
    side_effects = int(adherence_summary.get("side_effect_count") or 0)

    if expected is None:
        cautions.append(
            Caution(
                code="missing-planned-sessions",
                severity="warning",
                message="No planned_total_sessions on assignment — adherence_rate not computed.",
            )
        )

    risk_components: list[float] = []
    if rate is not None:
        # Lower rate → higher risk. 100% → 0; 0% → 1.
        risk_components.append(max(0.0, min(1.0, (100.0 - rate) / 100.0)))
    risk_components.append(min(1.0, open_flags / 1.0))
    risk_components.append(min(1.0, side_effects / 3.0))
    composite = round(sum(risk_components) / len(risk_components), 3)

    contributors = [
        TopContributor(feature="adherence_rate_pct", weight=rate, direction="lower_when_worse", value=rate),
        TopContributor(feature="open_flags", weight=float(open_flags), direction="higher_when_worse", value=open_flags),
        TopContributor(feature="side_effect_count", weight=float(side_effects), direction="higher_when_worse", value=side_effects),
    ]

    high_risk = (
        (rate is not None and rate < 50)
        or open_flags >= 1
        or side_effects >= 3
    )
    confidence = cap_confidence(
        "med" if rate is not None else "low",
        has_validated_anchor=False,
        research_grade=True,
    )
    band_label = "high" if high_risk else "moderate" if (rate is not None and rate < 75) else "low"
    interpretation = (
        f"Adherence-risk research index = {composite:.2f} ({band_label}); "
        f"{int(rate) if rate is not None else 'unknown'}% adherence, "
        f"{open_flags} open flag(s), {side_effects} side-effect event(s). "
        "Discuss with clinician."
    )

    provenance = MethodProvenance(
        model_id="adherence-rules-v1",
        version="v1",
        inputs_hash=hash_inputs(
            {
                "rate": rate,
                "open_flags": open_flags,
                "side_effects": side_effects,
            }
        ),
    )
    out = ScoreResponse(
        score_id="adherence_risk",
        value=composite,
        scale="research_grade",
        interpretation=interpretation,
        confidence=confidence,
        uncertainty_band=None,
        top_contributors=contributors,
        assessment_anchor=None,
        evidence_refs=evidence_refs or [],
        cautions=cautions,
        method_provenance=provenance,
        computed_at=_now(),
    )
    _emit_log("adherence_risk", provenance, confidence)
    return out


def build_response_probability_score(
    *,
    qeeg_risk_payload: Optional[dict] = None,
    primary_target: str = "depression",
    evidence_refs: Optional[list[EvidenceRef]] = None,
) -> ScoreResponse:
    """Response probability — research-grade; cohort-similarity prior.

    NEVER asserts a calibrated probability. Uses the qEEG ``*_like``
    similarity index for the primary target as a *prior* and explicitly
    caps confidence at MED.
    """
    cautions: list[Caution] = [
        Caution(
            code="research-grade-score",
            severity="warning",
            message=(
                "Response probability has no calibrated clinical model. "
                "Surfaced as research-grade prior only — NOT a probability of clinical response."
            ),
        ),
        Caution(
            code="evidence-pending",
            severity="info",
            message="Per-score evidence references are not yet wired — pending Evidence stream.",
        ),
    ]

    target_to_label = {
        "depression": "mdd_like",
        "anxiety": "anxiety_like",
        "mci": "cognitive_decline_like",
        "adhd": "adhd_like",
        "tbi": "tbi_residual_like",
        "insomnia": "insomnia_like",
    }
    label = target_to_label.get(primary_target.lower(), "mdd_like")

    if not isinstance(qeeg_risk_payload, dict):
        return _no_data_response(
            "response_probability",
            "research_grade",
            cautions=cautions,
            model_id="response-cohort-prior-v1",
        )
    block = qeeg_risk_payload.get(label)
    sim = _safe_float(block.get("score")) if isinstance(block, dict) else None
    if sim is None:
        return _no_data_response(
            "response_probability",
            "research_grade",
            cautions=cautions,
            model_id="response-cohort-prior-v1",
        )

    # Higher similarity → higher prior of response (very rough!) — cap at 0.7.
    prior = round(min(0.7, max(0.05, sim * 0.85)), 3)
    contributors = [
        TopContributor(
            feature=label,
            weight=sim,
            direction="higher_when_better_match",
            value=sim,
        )
    ]
    confidence = cap_confidence(
        "med",
        has_validated_anchor=False,
        research_grade=True,
    )
    provenance = MethodProvenance(
        model_id="response-cohort-prior-v1",
        version="v1",
        inputs_hash=hash_inputs({"label": label, "sim": sim, "target": primary_target}),
        upstream_is_stub=True,
    )
    out = ScoreResponse(
        score_id="response_probability",
        value=prior,
        scale="research_grade",
        interpretation=(
            f"Cohort-similarity prior = {prior:.2f} for target '{primary_target}'; "
            "may indicate alignment with responder cohort — NOT a calibrated probability. "
            "Discuss with clinician."
        ),
        confidence=confidence,
        uncertainty_band=None,
        top_contributors=contributors,
        assessment_anchor=None,
        evidence_refs=evidence_refs or [],
        cautions=cautions,
        method_provenance=provenance,
        computed_at=_now(),
    )
    _emit_log("response_probability", provenance, confidence)
    return out


# ── Aggregator ───────────────────────────────────────────────────────────────


SCORE_IDS = (
    "anxiety",
    "depression",
    "stress",
    "mci",
    "brain_age",
    "relapse_risk",
    "adherence_risk",
    "response_probability",
)


def build_all_clinical_scores(
    *,
    assessments: Optional[list[dict]] = None,
    qeeg_risk_payload: Optional[dict] = None,
    brain_age_payload: Optional[dict] = None,
    wearable_summary: Optional[dict] = None,
    trajectory_change_scores: Optional[dict] = None,
    adverse_event_count: int = 0,
    adherence_summary: Optional[dict] = None,
    chronological_age: Optional[int] = None,
    response_target: str = "depression",
    evidence_refs_by_score: Optional[dict[str, list[EvidenceRef]]] = None,
) -> dict[str, ScoreResponse]:
    """Convenience: build every score in scope, returning a dict keyed by score_id.

    Failures in one score do not crash the others — each is wrapped in
    its own try/except so the API can return partial results.
    """
    refs = evidence_refs_by_score or {}
    out: dict[str, ScoreResponse] = {}
    a = assessments or []

    builders: list[tuple[str, Any]] = [
        ("anxiety", lambda: build_anxiety_score(
            assessments=a, qeeg_risk_payload=qeeg_risk_payload,
            evidence_refs=refs.get("anxiety"))),
        ("depression", lambda: build_depression_score(
            assessments=a, qeeg_risk_payload=qeeg_risk_payload,
            evidence_refs=refs.get("depression"))),
        ("stress", lambda: build_stress_score(
            assessments=a, wearable_summary=wearable_summary,
            evidence_refs=refs.get("stress"))),
        ("mci", lambda: build_mci_score(
            assessments=a, qeeg_risk_payload=qeeg_risk_payload,
            chronological_age=chronological_age,
            evidence_refs=refs.get("mci"))),
        ("brain_age", lambda: build_brain_age_score(
            brain_age_payload=brain_age_payload,
            chronological_age=chronological_age,
            evidence_refs=refs.get("brain_age"))),
        ("relapse_risk", lambda: build_relapse_risk_score(
            trajectory_change_scores=trajectory_change_scores,
            adverse_event_count=adverse_event_count,
            evidence_refs=refs.get("relapse_risk"))),
        ("adherence_risk", lambda: build_adherence_risk_score(
            adherence_summary=adherence_summary,
            evidence_refs=refs.get("adherence_risk"))),
        ("response_probability", lambda: build_response_probability_score(
            qeeg_risk_payload=qeeg_risk_payload,
            primary_target=response_target,
            evidence_refs=refs.get("response_probability"))),
    ]
    for sid, fn in builders:
        try:
            out[sid] = fn()
        except Exception:
            log.exception("clinical_scores: builder for %s failed", sid)
            out[sid] = _no_data_response(
                sid,
                "research_grade",
                cautions=[Caution(code="builder-error", severity="warning",
                                  message="Score computation failed — manual review required.")],
                model_id=f"{sid}-error",
            )
    return out


__all__ = [
    "ASSESSMENT_ANCHORS",
    "SCORE_IDS",
    "build_adherence_risk_score",
    "build_all_clinical_scores",
    "build_anxiety_score",
    "build_brain_age_score",
    "build_depression_score",
    "build_mci_score",
    "build_relapse_risk_score",
    "build_response_probability_score",
    "build_stress_score",
]
