"""Server-side canonical scoring for the 14 go-live instruments.

Mirrors apps/web/src/scoring-engine.js for the subset used by the Library
form-filler + pgAssessmentsHub. Any computed total here is used by the PATCH
endpoint to VALIDATE client-submitted scores within a 5% tolerance.

For licensed score-only instruments (WAB-R, MIDAS, BPI) we accept clinician
entered totals verbatim; we still normalize severity via severity_for_score.
"""
from __future__ import annotations

from typing import Any, Optional

from app.services.assessment_summary import (
    _template_key,
    normalize_assessment_score,
)


# ── Item response → integer response ─────────────────────────────────────────
_LIKERT4_MAP = {
    "Not at all": 0,
    "Several days": 1,
    "More than half the days": 2,
    "Nearly every day": 3,
}
_LIKERT5_MAP = {
    "Not at all": 0,
    "A little bit": 1,
    "Moderately": 2,
    "Quite a bit": 3,
    "Extremely": 4,
}
_DASS_MAP = {
    "Never": 0,
    "Sometimes": 1,
    "Often": 2,
    "Almost Always": 3,
}
_YBOCS_MAP = {"None": 0, "Mild": 1, "Moderate": 2, "Severe": 3, "Extreme": 4}


def _coerce_item_value(value: Any) -> Optional[int]:
    """Coerce a heterogeneous item value into an int response (0-4)."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return 1 if value else 0
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        s = value.strip()
        if s.isdigit() or (s.startswith("-") and s[1:].isdigit()):
            try:
                return int(s)
            except ValueError:
                return None
        for mapping in (_LIKERT4_MAP, _LIKERT5_MAP, _DASS_MAP, _YBOCS_MAP):
            if s in mapping:
                return mapping[s]
    return None


# ── Canonical scoring ────────────────────────────────────────────────────────

# Prefix-based summation (fallback). Each key lists its item_id prefix; if the
# instrument has subscales we compute them too. For Y-BOCS obsessions are items
# 1-5 and compulsions 6-10.
_PREFIX_SCORING: dict[str, dict[str, Any]] = {
    "phq9":   {"prefix": "phq9_",  "count": 9,  "max": 27},
    "gad7":   {"prefix": "gad7_",  "count": 7,  "max": 21},
    "pcl5":   {"prefix": "pcl5_",  "count": 20, "max": 80},
    "hamd":   {"prefix": "hamd_",  "count": 17, "max": 52},
    "hama":   {"prefix": "hama_",  "count": 14, "max": 56},
    "aq10":   {"prefix": "aq10_",  "count": 10, "max": 10},
    "asrs":   {"prefix": "asrs_",  "count": 18, "max": 72},
    "isi":    {"prefix": "isi_",   "count": 7,  "max": 28},
    "bdi":    {"prefix": "bdi_",   "count": 21, "max": 63},
    "bdi2":   {"prefix": "bdi_",   "count": 21, "max": 63},
    "ybocs":  {
        "prefix": "ybocs_", "count": 10, "max": 40,
        "subscales": {"obsessions": (1, 5), "compulsions": (6, 10)},
    },
    "dass21": {"prefix": "dass21_", "count": 21, "max": 63},
    # WAB-R, MIDAS, BPI, EQ-5D rely on clinician-entered totals or composite.
}


_SCORE_ONLY = {"wabr", "midas", "bpi", "eq5d"}


def _sum_items(items: dict[str, Any], prefix: str, start: int, end: int) -> int:
    total = 0
    for i in range(start, end + 1):
        key = f"{prefix}{i}"
        v = _coerce_item_value(items.get(key))
        if v is not None:
            total += v
    return total


def compute_canonical_score(template_id: str, items: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """Given item-level responses, compute total + subscales for the instrument.

    Returns None if the instrument is score-only or no rule is defined, so the
    caller should accept the client-submitted total verbatim.
    """
    if not items or not isinstance(items, dict):
        return None
    key = _template_key(template_id)
    if key in _SCORE_ONLY:
        return None
    rule = _PREFIX_SCORING.get(key)
    if not rule:
        return None
    prefix = rule["prefix"]
    count = int(rule["count"])
    total = _sum_items(items, prefix, 1, count)
    result: dict[str, Any] = {"score": float(total), "max": rule["max"]}
    subs = rule.get("subscales") or {}
    if subs:
        result["subscales"] = {
            name: _sum_items(items, prefix, rng[0], rng[1]) for name, rng in subs.items()
        }
    return result


def severity_for_score(template_id: str, score_value: Optional[float]) -> dict[str, Any]:
    """Public wrapper: always returns the normalized severity dict."""
    return normalize_assessment_score(template_id, score_value)


def validate_submitted_score(
    template_id: str,
    submitted_score: Optional[float],
    items: Optional[dict[str, Any]],
    tolerance_pct: float = 5.0,
) -> dict[str, Any]:
    """Validate a client-submitted score against the canonical server computation.

    Returns dict:
      - ok: bool
      - canonical_score: float | None (None when no server rule is available)
      - submitted_score: float | None
      - delta_pct: float | None
      - reason: str | None (set when ok=False)
      - subscales: dict | None
    """
    canon = compute_canonical_score(template_id, items)
    if canon is None:
        return {
            "ok": True,
            "canonical_score": None,
            "submitted_score": submitted_score,
            "delta_pct": None,
            "reason": None,
            "subscales": None,
        }
    canonical_score = float(canon["score"])
    subscales = canon.get("subscales")
    if submitted_score is None:
        return {
            "ok": True,
            "canonical_score": canonical_score,
            "submitted_score": None,
            "delta_pct": None,
            "reason": None,
            "subscales": subscales,
        }
    # Absolute tolerance of 1 point OR tolerance_pct of max range, whichever larger.
    try:
        submitted_f = float(submitted_score)
    except (TypeError, ValueError):
        return {
            "ok": False,
            "canonical_score": canonical_score,
            "submitted_score": submitted_score,
            "delta_pct": None,
            "reason": "submitted_score is not numeric",
            "subscales": subscales,
        }
    max_range = float(canon.get("max") or 0) or max(canonical_score, 1.0)
    allowed = max(1.0, max_range * (tolerance_pct / 100.0))
    delta = abs(submitted_f - canonical_score)
    delta_pct = (delta / max_range) * 100.0 if max_range else 0.0
    if delta > allowed:
        return {
            "ok": False,
            "canonical_score": canonical_score,
            "submitted_score": submitted_f,
            "delta_pct": round(delta_pct, 2),
            "reason": (
                f"Submitted score {submitted_f} differs from canonical {canonical_score} "
                f"by {delta_pct:.1f}% (> {tolerance_pct}% tolerance)."
            ),
            "subscales": subscales,
        }
    return {
        "ok": True,
        "canonical_score": canonical_score,
        "submitted_score": submitted_f,
        "delta_pct": round(delta_pct, 2),
        "reason": None,
        "subscales": subscales,
    }


def detect_red_flags(template_id: str, items: Optional[dict[str, Any]], score: Optional[float]) -> list[str]:
    """Return a list of red-flag strings — e.g. PHQ-9 item 9 positive.

    Used both by the escalate endpoint (auto-suggest reason) and the AI summary
    endpoint (seed the prompt with concrete concerns).
    """
    flags: list[str] = []
    key = _template_key(template_id)
    if not items:
        items = {}
    if key == "phq9":
        item9 = _coerce_item_value(items.get("phq9_9"))
        if item9 is not None and item9 > 0:
            flags.append(f"PHQ-9 Item 9 (suicidality) = {item9} — non-zero response requires safety screen.")
    if key == "c_ssrs" and score is not None and score >= 2:
        flags.append(f"C-SSRS level {score} — active ideation; follow crisis protocol.")
    if key == "pcl5" and score is not None and score >= 33:
        flags.append("PCL-5 >= 33 — probable PTSD threshold reached.")
    return flags
