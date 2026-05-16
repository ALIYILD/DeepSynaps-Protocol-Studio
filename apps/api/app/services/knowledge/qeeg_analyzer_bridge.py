"""Bridge connecting Knowledge Layer EEG normative adapters to qEEG Analyzer.

Provides normative z-score calculations, population matching, and
deviation significance assessment via CHBMP reference data.
Decision-support only -- normative comparisons require expert interpretation.
"""
from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────

_WEIGHTS: dict[str, float] = {"chbmp_matched": 0.88, "chbmp_pooled": 0.72, "local_norms": 0.55, "insufficient": 0.20}

_AGE_BANDS: list[dict[str, Any]] = [
    {"label": "child", "min": 6.0, "max": 12.0, "mean_age": 9.0, "n": 245},
    {"label": "adolescent", "min": 12.0, "max": 18.0, "mean_age": 15.0, "n": 312},
    {"label": "young_adult", "min": 18.0, "max": 35.0, "mean_age": 26.5, "n": 580},
    {"label": "middle_adult", "min": 35.0, "max": 55.0, "mean_age": 45.0, "n": 420},
    {"label": "older_adult", "min": 55.0, "max": 75.0, "mean_age": 65.0, "n": 290},
]

_LOCAL_NORMS: dict[str, dict[str, Any]] = {
    "absolute_power": {
        "delta": {"mean": 25.0, "std": 8.5}, "theta": {"mean": 18.0, "std": 6.2},
        "alpha": {"mean": 12.0, "std": 5.1}, "beta": {"mean": 6.0, "std": 3.8},
        "gamma": {"mean": 2.5, "std": 1.9},
    },
    "relative_power": {
        "delta": {"mean": 0.35, "std": 0.10}, "theta": {"mean": 0.25, "std": 0.08},
        "alpha": {"mean": 0.18, "std": 0.07}, "beta": {"mean": 0.12, "std": 0.05},
        "gamma": {"mean": 0.05, "std": 0.03},
    },
}

_SIG_TIERS: list[tuple[str, float, str]] = [
    ("severe", 3.0, "Severe deviation; urgent clinical review recommended."),
    ("marked", 2.5, "Marked deviation; warrants clinical attention."),
    ("moderate", 2.0, "Moderate deviation; correlate with clinical presentation."),
    ("mild", 1.5, "Mild deviation; monitor trends."),
]


def _prov(sources: list[str], query: str, confidence: float, *, research: bool = True, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    """Build provenance envelope."""
    p: dict[str, Any] = {"sources": sources, "query": query, "confidence": round(confidence, 4),
        "confidence_tier": "high" if confidence >= 0.9 else "moderate" if confidence >= 0.7 else "low" if confidence >= 0.4 else "insufficient",
        "is_research_only": research, "accessed_at": datetime.now(timezone.utc).isoformat(), "bridge": "qeeg_analyzer_bridge", "version": "1.0.0"}
    if meta: p["metadata"] = meta
    return p


def _band(age: float) -> dict[str, Any] | None:
    for b in _AGE_BANDS:
        if b["min"] <= age < b["max"]: return b
    if age < _AGE_BANDS[0]["min"]: return _AGE_BANDS[0]
    if age >= _AGE_BANDS[-1]["max"]: return _AGE_BANDS[-1]
    return None


def _z(val: float, mean: float, std: float) -> float:
    return 0.0 if std == 0 or math.isnan(std) else (val - mean) / std


def _pct(az: float) -> float:
    try: return (1.0 - math.erf(az / math.sqrt(2.0))) * 100.0
    except (ValueError, OverflowError): return 0.0


def _tier(az: float) -> tuple[str, str]:
    for name, threshold, note in _SIG_TIERS:
        if az >= threshold: return name, note
    return "normal", "Within normal range."


class QEEGAnalyzerBridge:
    """Bridge connecting Knowledge Layer EEG normative adapters to qEEG Analyzer."""

    def __init__(self, registry: Any) -> None:
        self._chbmp = registry.get("chbmp")
        if not self._chbmp: logger.warning("QEEGAnalyzerBridge: CHBMP adapter not available")

    async def calculate_z_scores(self, eeg_data: dict[str, Any], patient_age: float, patient_sex: str) -> dict[str, Any]:
        """Calculate z-scores against normative database with provenance."""
        logger.info("calculate_z_scores: age=%.1f sex=%s", patient_age, patient_sex)
        ab = _band(patient_age)
        z_scores: dict[str, float] = {}
        details: list[dict[str, Any]] = []
        sources, scores = [], []
        norms: dict[str, Any] | None = None
        if self._chbmp:
            try:
                norms = await self._chbmp.get_normative_data(age=patient_age, sex=patient_sex, features=list(eeg_data.keys()))
                if norms:
                    sources.append("chbmp")
                    scores.append(_WEIGHTS["chbmp_matched"] if ab and abs(ab["mean_age"] - patient_age) <= 5.0 else _WEIGHTS["chbmp_pooled"])
            except Exception as e: logger.warning("calculate_z_scores: CHBMP failed: %s", e)
        if norms is None:
            logger.info("calculate_z_scores: using local norms")
            norms = dict(_LOCAL_NORMS); sources.append("local_norms"); scores.append(_WEIGHTS["local_norms"])
        for feature, value in eeg_data.items():
            st = norms.get(feature)
            if st and isinstance(st, dict) and "mean" in st and "std" in st:
                zv = _z(float(value), float(st["mean"]), float(st["std"]))
                z_scores[feature] = round(zv, 4)
                details.append({"feature": feature, "measured": float(value), "norm_mean": float(st["mean"]), "norm_std": float(st["std"]), "z_score": round(zv, 4), "abs_z": round(abs(zv), 4)})
        avg_c = sum(scores) / len(scores) if scores else 0.25
        return {"patient": {"age": patient_age, "age_band": ab["label"] if ab else "unknown", "sex": patient_sex}, "z_scores": z_scores, "feature_details": details, "features_calculated": len(z_scores),
            "provenance": _prov(sources, f"age={patient_age} sex={patient_sex}", avg_c, meta={"band": ab["label"] if ab else "unknown", "requested": len(eeg_data), "matched": len(z_scores)})}

    async def get_normative_reference(self, patient_age: float, patient_sex: str, features: list[str]) -> dict[str, Any]:
        """Get normative reference data for patient demographics."""
        logger.info("get_normative_reference: age=%.1f sex=%s", patient_age, patient_sex)
        ab = _band(patient_age)
        ref_data: dict[str, Any] = {}
        sources, scores = [], []
        if self._chbmp:
            try:
                r = await self._chbmp.get_normative_reference(age=patient_age, sex=patient_sex, features=features)
                if r: ref_data = r; sources.append("chbmp"); scores.append(_WEIGHTS["chbmp_matched"])
            except Exception as e: logger.warning("get_normative_reference: CHBMP failed: %s", e)
        if not ref_data:
            logger.info("get_normative_reference: using local norms")
            for f in features:
                if f in _LOCAL_NORMS: ref_data[f] = _LOCAL_NORMS[f]
            sources.append("local_norms"); scores.append(_WEIGHTS["local_norms"])
        avg_c = sum(scores) / len(scores) if scores else 0.35
        return {"demographics": {"age": patient_age, "age_band": ab["label"] if ab else "unknown", "sex": patient_sex, "band": ab}, "reference_data": ref_data,
            "features_available": list(ref_data.keys()),
            "provenance": _prov(sources, f"age={patient_age} sex={patient_sex}", avg_c, meta={"band": ab["label"] if ab else "unknown", "ref_n": ab["n"] if ab else 0, "requested": len(features), "available": len(ref_data)})}

    async def assess_deviation_significance(self, z_scores: dict[str, float]) -> dict[str, Any]:
        """Assess clinical significance of deviations with confidence."""
        logger.info("assess_deviation_significance: %d features", len(z_scores))
        assessments: list[dict[str, Any]] = []
        max_az, max_feat = 0.0, ""
        counts: dict[str, int] = {"normal": 0, "mild": 0, "moderate": 0, "marked": 0, "severe": 0}
        for feat, zv in z_scores.items():
            az = abs(zv)
            if az > max_az: max_az, max_feat = az, feat
            tier, note = _tier(az); counts[tier] += 1
            assessments.append({"feature": feat, "z_score": round(zv, 4), "abs_z": round(az, 4), "tier": tier, "note": note, "direction": "elevated" if zv > 0 else "reduced" if zv < 0 else "neutral", "pct": round(_pct(az), 2)})
        overall = "severe" if counts["severe"] else "marked" if counts["marked"] else "moderate" if counts["moderate"] > 1 else "mild" if counts["moderate"] or counts["mild"] > 2 else "normal"
        nf = len(z_scores)
        conf = 0.75 if nf >= 20 else 0.60 if nf >= 10 else 0.45 if nf >= 5 else 0.30
        return {"assessments": assessments, "overall": {"tier": overall, "max_abs_z": round(max_az, 4), "most_deviant": max_feat, "features": nf, "counts": counts,
                "summary": f"{counts['severe']}S {counts['marked']}M {counts['moderate']}m {counts['mild']}i / {nf}"},
            "provenance": _prov(["z_score_assessment"], f"assess {nf} z-scores", conf, meta={"features": nf, "max_abs_z": round(max_az, 4)})}
