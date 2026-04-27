"""DeepTwin decision-support helpers.

Adds the safety / transparency primitives the clinician page needs but
that are easy to forget when adding new endpoints:

- ``confidence_tier()`` — high/medium/low chip computed from model
  confidence + input-quality score + evidence-strength score.
- ``derive_top_drivers()`` — patient-specific top-k contributing
  factors for any recommendation. Magnitudes are heuristic (the engine
  is rule-based today) but the **set of drivers** is derived from the
  actual request, so two different patients see two different lists.
- ``soften_language()`` — converts assertive "Best current use is X"
  phrasing into "Consider X" / "May benefit from X" phrasing. Refuses
  to emit "diagnose" / "prescribe" / "guarantee".
- ``build_provenance()`` — single source of truth for the provenance
  block. Adds ``schema_version``, ``inputs_hash``, ``model_id`` that
  were missing from the engine's existing dicts.
- ``build_uncertainty_block()`` — structured 3-component uncertainty
  (epistemic / aleatoric / calibration), each labelled with method
  and a "uncalibrated" / "unavailable" status when we don't honestly
  have it. **We never report a calibration probability we don't have.**
- ``build_calibration_status()`` — top-level field stating that the
  current twin is uncalibrated; do not silently report fake calibrated
  probabilities.
- ``build_scenario_comparison()`` — structured payload comparing N
  scenarios with delta-prediction, delta-confidence, recommendation
  change.

This module is the only place that knows the confidence-tier
thresholds and the language rules. Tests in
``apps/api/tests/test_deeptwin_router.py`` assert the API contract
exposed by these helpers.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Iterable, Literal

ConfidenceTier = Literal["high", "medium", "low"]
EvidenceStatus = Literal["linked", "pending", "unavailable"]

# Bumped on any breaking change to the response shapes documented in the
# DeepTwin section of docs/overnight/2026-04-26-night/digital_twin_audit.md.
SCHEMA_VERSION: str = "deeptwin.simulate.v2.0"
ANALYZE_SCHEMA_VERSION: str = "deeptwin.analyze.v2.0"

# A stable identifier for the twin "model". The engine is rule-based +
# RNG-seeded, so the model_id reflects that — clinicians can audit which
# scoring engine produced an output.
MODEL_ID: str = "deeptwin_engine.deterministic_rules"
MODEL_VERSION: str = "2026.04.26-night"

# Words we will not let through into clinician-facing copy. If any of
# these appear, ``soften_language`` rewrites the whole sentence to a
# cautious version.
_FORBIDDEN_TERMS = (
    "diagnose",
    "prescribe",
    "guarantee",
    "cures",
    "definitely",
    "must take",
    "should take",
    "will heal",
)

# Hard rewrites: prefix → softened replacement.
_HARD_PHRASE_REWRITES: tuple[tuple[str, str], ...] = (
    ("Best current use is", "Consider using this for"),
    ("Best use is", "Consider using this for"),
    ("Lead biomarker expected to move first", "The lead biomarker may move first"),
    ("Predicts", "Suggests"),
    ("Will improve", "May improve"),
    ("Will reduce", "May reduce"),
)


def confidence_tier(
    *,
    model_confidence: float,
    input_quality: float,
    evidence_strength: float,
) -> ConfidenceTier:
    """Combine three independent quality signals into a 3-tier label.

    Each input is clamped to [0,1]. Equal weight; thresholds tuned
    conservatively (it's harder to reach "high" than "low").
    """

    def clamp(x: float) -> float:
        try:
            return max(0.0, min(1.0, float(x)))
        except (TypeError, ValueError):
            return 0.0

    score = (clamp(model_confidence) + clamp(input_quality) + clamp(evidence_strength)) / 3.0
    if score >= 0.70:
        return "high"
    if score >= 0.45:
        return "medium"
    return "low"


def derive_top_drivers(
    *,
    inputs: dict[str, Any],
    base_drivers: list[dict[str, Any]] | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Build a per-recommendation top-k drivers list.

    Drivers are derived from the actual request. Two different patients
    with different `modalities`, `adherence`, or `contraindications`
    will see two different driver lists. Magnitudes are heuristic
    (rule-based engine), in [0, 1]; direction is one of
    ``positive`` / ``negative`` / ``neutral``.
    """
    drivers: list[dict[str, Any]] = list(base_drivers or [])

    modalities = inputs.get("modalities") or []
    if isinstance(modalities, list) and modalities:
        coverage_score = min(1.0, 0.25 + 0.12 * len(modalities))
        drivers.append(
            {
                "factor": "modality_coverage",
                "magnitude": round(coverage_score, 3),
                "direction": "positive",
                "detail": (
                    f"{len(modalities)} modality channel(s) supplied — "
                    "more channels generally tighten the prediction."
                ),
            }
        )

    if "adherence_assumption_pct" in inputs:
        try:
            adh = float(inputs["adherence_assumption_pct"])
        except (TypeError, ValueError):
            adh = 80.0
        adh = max(0.0, min(100.0, adh))
        magnitude = round(abs(adh - 50.0) / 50.0, 3)
        direction = "positive" if adh >= 70 else ("negative" if adh < 50 else "neutral")
        drivers.append(
            {
                "factor": "adherence_assumption_pct",
                "magnitude": magnitude,
                "direction": direction,
                "detail": (
                    f"Assumed adherence {int(adh)}%. Predicted effect scales "
                    "with adherence; below 60% the model widens uncertainty."
                ),
            }
        )

    contraindications = inputs.get("contraindications") or []
    if isinstance(contraindications, list) and contraindications:
        drivers.append(
            {
                "factor": "contraindications",
                "magnitude": round(min(1.0, 0.4 + 0.2 * len(contraindications)), 3),
                "direction": "negative",
                "detail": (
                    f"{len(contraindications)} contraindication(s) flagged: "
                    + ", ".join(str(c) for c in contraindications[:5])
                ),
            }
        )

    if "frequency_hz" in inputs and inputs["frequency_hz"] is not None:
        try:
            freq = float(inputs["frequency_hz"])
        except (TypeError, ValueError):
            freq = 0.0
        if freq > 0:
            drivers.append(
                {
                    "factor": "stimulation_frequency_hz",
                    "magnitude": round(min(1.0, freq / 30.0), 3),
                    "direction": "neutral",
                    "detail": (
                        f"Frequency {freq} Hz selected. High-frequency rTMS (>20 Hz) "
                        "raises seizure-screening review burden."
                    ),
                }
            )

    if "weeks" in inputs and inputs["weeks"]:
        try:
            weeks = int(inputs["weeks"])
        except (TypeError, ValueError):
            weeks = 5
        drivers.append(
            {
                "factor": "protocol_duration_weeks",
                "magnitude": round(min(1.0, weeks / 12.0), 3),
                "direction": "positive" if weeks >= 4 else "neutral",
                "detail": (
                    f"{weeks}-week protocol. Most neuromodulation evidence is at "
                    "4–6 weeks; shorter trials carry larger uncertainty."
                ),
            }
        )

    # If the caller seeded none and we still have nothing, emit a neutral
    # placeholder so the contract (>=1 driver) holds without lying.
    if not drivers:
        drivers.append(
            {
                "factor": "input_set",
                "magnitude": 0.0,
                "direction": "neutral",
                "detail": "No driver signals available from the supplied inputs.",
            }
        )

    # Sort by magnitude desc, keep top-k.
    drivers.sort(key=lambda d: float(d.get("magnitude") or 0.0), reverse=True)
    return drivers[: max(1, int(limit))]


def soften_language(text: str | None) -> str:
    """Rewrite assertive clinical copy to cautious decision-support copy.

    - Refuses to pass forbidden terms; replaces the whole sentence with
      a cautious template if any appear.
    - Applies hard prefix rewrites ("Best current use is …" → "Consider …").
    - Adds a "Consider" opener if the sentence starts with a bare verb
      that asserts a clinical action.
    """
    if not text:
        return ""
    out = str(text).strip()
    lowered = out.lower()
    for term in _FORBIDDEN_TERMS:
        if term in lowered:
            return (
                "Decision-support output only — the original phrasing was "
                "rewritten because it implied a clinical action. Discuss "
                "with the responsible clinician."
            )
    for prefix, replacement in _HARD_PHRASE_REWRITES:
        if out.startswith(prefix):
            out = replacement + out[len(prefix):]
            break
    # Soften absolute openers.
    out = re.sub(r"^This is\b", "This may be", out)
    out = re.sub(r"^It is\b", "It may be", out)
    return out


def soften_recommendation_block(payload: dict[str, Any], fields: Iterable[str]) -> dict[str, Any]:
    """Apply ``soften_language`` to the named string fields in a dict
    (in place) and return the dict for chainability."""
    for field in fields:
        if field in payload and isinstance(payload[field], str):
            payload[field] = soften_language(payload[field])
    return payload


def _hash_inputs(inputs: dict[str, Any]) -> str:
    """Stable SHA-256 of the inputs dict (sorted keys, JSON encoding).

    Used in provenance so a clinician can ask "is this exactly what was
    sent?" The first 16 hex chars are returned, with the algorithm
    prefix, so it's compact but unambiguous.
    """
    try:
        encoded = json.dumps(inputs, sort_keys=True, default=str).encode("utf-8")
    except (TypeError, ValueError):
        encoded = repr(sorted(inputs.items())).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()[:16]


def build_provenance(
    *,
    surface: str,
    inputs: dict[str, Any],
    schema_version: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Standard provenance block for any DeepTwin response."""
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    out = {
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "engine": "deeptwin_engine",
        "engine_mode": "deterministic_rules",
        "schema_version": schema_version or SCHEMA_VERSION,
        "surface": surface,
        "inputs_hash": _hash_inputs(inputs),
        "generated_at": now,
        "calibration_status": "uncalibrated",
        "decision_support_only": True,
    }
    if extra:
        out.update(extra)
    return out


def build_calibration_status(method: str = "uncalibrated") -> dict[str, Any]:
    """Top-level calibration field. We do not report calibrated probabilities
    we do not have.
    """
    return {
        "method": method,
        "status": "uncalibrated",
        "note": (
            "No clinical calibration set is wired to DeepTwin yet. "
            "Probabilities are illustrative scoring outputs and should "
            "not be read as reliability-calibrated probabilities."
        ),
        "planned_method": "platt_or_isotonic_with_outcome_cohort",
    }


def build_uncertainty_block(
    *,
    horizon_days: int | None = None,
    width: float | None = None,
) -> dict[str, Any]:
    """3-component uncertainty block (epistemic / aleatoric / calibration).

    Each component is honestly labelled. Where we do not have a
    real estimate we use ``status: "unavailable"`` rather than fake a number.
    """
    return {
        "method": "deterministic_scenario_band",
        "components": {
            "epistemic": {
                "status": "unavailable",
                "method": "mc_dropout_or_ensembling_planned",
                "note": (
                    "Model uncertainty (lack of training data) is not "
                    "estimated by the current rule-based engine. Plan: "
                    "MC-dropout or deep ensemble once a learned twin exists."
                ),
            },
            "aleatoric": {
                "status": "unavailable",
                "method": "heteroscedastic_head_planned",
                "note": (
                    "Irreducible noise (signal volatility) is not separately "
                    "estimated; widening the CI band is currently a proxy."
                ),
            },
            "calibration": {
                "status": "uncalibrated",
                "method": "platt_or_isotonic_planned",
                "note": (
                    "No reliability calibration applied. CI95 is a "
                    "deterministic illustrative band, not a coverage "
                    "guarantee."
                ),
            },
        },
        "ci95_interpretation": "illustrative interval, not calibrated clinical prediction interval",
        "widens_with_horizon": True,
        "horizon_days": horizon_days,
        "width": width,
    }


def build_scenario_comparison(scenarios: list[dict[str, Any]]) -> dict[str, Any]:
    """Structured comparison payload across N scenarios.

    For each pair of consecutive scenarios we surface delta-prediction,
    delta-confidence, and a flag for whether the recommendation changed.
    Designed to be safe to call with 0, 1, or many scenarios.
    """
    if not scenarios:
        return {
            "count": 0,
            "items": [],
            "deltas": [],
            "summary": "No scenarios to compare.",
        }
    items: list[dict[str, Any]] = []
    for sim in scenarios:
        if not isinstance(sim, dict):
            continue
        curve = sim.get("predicted_curve") or {}
        delta_curve = curve.get("delta_outcome_score") or []
        endpoint = float(delta_curve[-1]) if delta_curve else 0.0
        items.append(
            {
                "scenario_id": sim.get("scenario_id"),
                "modality": (sim.get("input") or {}).get("modality"),
                "endpoint_delta": round(endpoint, 3),
                "responder_probability": sim.get("responder_probability"),
                "confidence_tier": sim.get("confidence_tier"),
                "evidence_grade": sim.get("evidence_grade"),
                "non_responder_flag": sim.get("non_responder_flag"),
            }
        )
    deltas: list[dict[str, Any]] = []
    for i in range(1, len(items)):
        prev, curr = items[i - 1], items[i]

        def _f(v: Any) -> float:
            try:
                return float(v) if v is not None else 0.0
            except (TypeError, ValueError):
                return 0.0

        deltas.append(
            {
                "from_scenario_id": prev["scenario_id"],
                "to_scenario_id": curr["scenario_id"],
                "delta_endpoint": round(_f(curr["endpoint_delta"]) - _f(prev["endpoint_delta"]), 3),
                "delta_responder_probability": round(
                    _f(curr["responder_probability"]) - _f(prev["responder_probability"]), 3
                ),
                "confidence_tier_changed": (
                    prev.get("confidence_tier") != curr.get("confidence_tier")
                ),
                "recommendation_changed": (
                    prev.get("modality") != curr.get("modality")
                ),
            }
        )
    summary = (
        f"Compared {len(items)} scenario(s). "
        f"{sum(1 for d in deltas if d['recommendation_changed'])} change(s) in modality, "
        f"{sum(1 for d in deltas if d['confidence_tier_changed'])} change(s) in confidence tier."
    )
    return {
        "count": len(items),
        "items": items,
        "deltas": deltas,
        "summary": summary,
    }


def evidence_status_for(item: dict[str, Any]) -> EvidenceStatus:
    """Map a recommendation dict to an explicit evidence status.

    Per audit finding A8 we never want a recommendation to silently
    omit its evidence position. Returns one of the three enum values.
    """
    if not isinstance(item, dict):
        return "unavailable"
    refs = item.get("evidence_refs") or item.get("citations") or []
    if isinstance(refs, list) and refs:
        return "linked"
    grade = item.get("evidence_grade")
    if grade in ("low", "moderate", "high"):
        return "pending"
    return "unavailable"
