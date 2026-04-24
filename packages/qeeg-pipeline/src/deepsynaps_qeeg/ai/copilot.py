"""Clinician copilot chat tools for the DeepSynaps qEEG Analyzer.

Upgrade 10 in ``AI_UPGRADES.md`` / ``CONTRACT_V2.md`` §1.10. The WebSocket
endpoint lives in ``apps/api/app/routers/qeeg_copilot_router.py``; this
module ONLY exposes:

1. Four tool functions the endpoint can dispatch to:
   * :func:`tool_search_papers`
   * :func:`tool_explain_feature`
   * :func:`tool_compare_to_norm`
   * :func:`tool_get_recommendation_detail`
2. A safety gate (:func:`is_unsafe_query` + :data:`SAFETY_REFUSAL_PATTERNS`).
3. A system-prompt template (:data:`SYSTEM_PROMPT_TEMPLATE`) with a
   :func:`render_system_prompt` helper that hydrates it from analysis
   payload + retrieval output.

The module is import-safe: it never raises at import time even if the
sibling ``ai.medrag`` module is missing (retrieval is then stubbed).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Iterable

log = logging.getLogger(__name__)


# ── Safety gate ─────────────────────────────────────────────────────────────

# Patterns that should trigger a safety refusal. Keep the list tight and
# explicitly clinical — the copilot is allowed to *explain* features and
# cite papers, but it must NOT give direct medical advice, diagnose, or
# change prescriptions.
SAFETY_REFUSAL_PATTERNS: list[str] = [
    r"\bshould i (?:take|stop|change|increase|decrease)\b",
    r"\b(?:change|increase|decrease|stop|start)\s+(?:my|the)\s+(?:dose|dosage|prescription|medication)\b",
    r"\bprescribe\b",
    r"\bcan you diagnose\b",
    r"\bdiagnos(?:e|is) me\b",
    r"\bam i (?:depressed|schizophrenic|bipolar|autistic|adhd)\b",
    r"\bdo i have\s+(?:depression|adhd|anxiety|schizophrenia|dementia|alzheimer)\b",
    r"\bcure\s+my\b",
    r"\btreat(?:ment)? (?:recommendation|plan) for me\b",
    r"\bwhich (?:drug|medication|SSRI|stimulant) should i\b",
    r"\b(?:dose|dosage) (?:for|of) me\b",
    r"\bsuicide\b",
    r"\bkill myself\b",
    r"\bself.?harm\b",
]

_COMPILED_REFUSAL = [re.compile(p, re.IGNORECASE) for p in SAFETY_REFUSAL_PATTERNS]


REFUSAL_MESSAGE: str = (
    "I can help explain qEEG features, citations, and the current "
    "report — but I can't give personal medical advice, adjust "
    "medication, or diagnose. Please consult your clinician."
)


def is_unsafe_query(text: str) -> bool:
    """Return True when *text* matches any safety-refusal pattern.

    The copilot router should short-circuit and reply with
    :data:`REFUSAL_MESSAGE` when this returns True.
    """
    if not text:
        return False
    for pat in _COMPILED_REFUSAL:
        if pat.search(text):
            return True
    return False


# ── Feature encyclopedia ────────────────────────────────────────────────────


_FEATURE_ENCYCLOPEDIA: dict[str, dict[str, str]] = {
    "frontal_alpha_asymmetry": {
        "name": "Frontal alpha asymmetry (FAA)",
        "definition": (
            "ln(alpha power at F4) − ln(alpha power at F3). Positive values "
            "indicate relative left-frontal hypoactivation (less alpha on the "
            "left side)."
        ),
        "clinical_relevance": (
            "Associated with approach/avoidance motivation and studied as a "
            "biomarker for depression (Davidson et al.). Not a standalone "
            "marker — interpret alongside behavioural assessment."
        ),
        "normal_range": "-0.10 to +0.10 (ln-power difference, eyes-closed rest)",
    },
    "theta_beta_ratio": {
        "name": "Theta/Beta ratio (TBR)",
        "definition": (
            "Ratio of absolute theta (4-8 Hz) to beta (13-30 Hz) power, "
            "typically averaged over frontocentral sites."
        ),
        "clinical_relevance": (
            "Historically elevated in ADHD research; FDA-cleared as an adjunct "
            "to ADHD assessment in 2013. Sensitivity and specificity are "
            "modest — use with clinical judgement."
        ),
        "normal_range": "1.0 to 2.5 (resting adult, eyes-open)",
    },
    "peak_alpha_frequency": {
        "name": "Peak alpha frequency (PAF / iAPF)",
        "definition": (
            "The frequency (Hz) of the dominant alpha peak in the resting "
            "power spectrum, usually computed at posterior sites."
        ),
        "clinical_relevance": (
            "Declines with age and in cognitive decline; slowing can track "
            "with post-concussive symptoms and depression chronicity."
        ),
        "normal_range": "9.5 - 11.0 Hz (healthy adults, eyes-closed)",
    },
    "aperiodic_slope": {
        "name": "Aperiodic (1/f) slope",
        "definition": (
            "Exponent of the aperiodic component of the power spectrum, "
            "fit by SpecParam (FOOOF) over 2-40 Hz."
        ),
        "clinical_relevance": (
            "Flatter slopes are reported in ADHD, schizophrenia, and with "
            "ageing; steeper slopes correlate with inhibitory tone."
        ),
        "normal_range": "0.8 to 1.8 (scalp, eyes-closed rest)",
    },
    "dmn_coherence": {
        "name": "Default mode network (DMN) coherence",
        "definition": (
            "Average coherence (or wPLI) between midline parietal, frontal, "
            "and temporal electrodes that approximate DMN source projections."
        ),
        "clinical_relevance": (
            "Hyperconnectivity in the DMN is implicated in rumination and "
            "major depression; hypoconnectivity in some dementias."
        ),
        "normal_range": "0.25 - 0.55 (alpha band wPLI)",
    },
    "mdd_like": {
        "name": "MDD-like similarity index",
        "definition": (
            "A similarity index (0-1) derived from the spectral, asymmetry, "
            "and connectivity features that co-vary with major depressive "
            "disorder cohorts in the research literature."
        ),
        "clinical_relevance": (
            "Research tool only. NOT a probability of depression. Intended "
            "to flag EEG patterns that warrant a fuller clinical evaluation."
        ),
        "normal_range": "< 0.3 typical healthy cohort; > 0.6 resembles MDD cohort",
    },
    "adhd_like": {
        "name": "ADHD-like similarity index",
        "definition": (
            "Similarity index derived from theta/beta ratio, aperiodic slope, "
            "and connectivity features associated with ADHD cohorts."
        ),
        "clinical_relevance": (
            "Research tool. Not a diagnostic score. Elevated values warrant "
            "clinical follow-up with a trained clinician."
        ),
        "normal_range": "< 0.35 typical; > 0.65 resembles ADHD cohort",
    },
    "anxiety_like": {
        "name": "Anxiety-like similarity index",
        "definition": (
            "Similarity index leveraging elevated beta, cortical arousal, "
            "and reduced alpha features seen in anxiety research.."
        ),
        "clinical_relevance": (
            "Research tool. Often co-varies with MDD-like index; interpret "
            "together, not in isolation."
        ),
        "normal_range": "< 0.3 typical; > 0.6 resembles anxiety cohort",
    },
    "cognitive_decline_like": {
        "name": "Cognitive-decline similarity index",
        "definition": (
            "Similarity index reflecting patterns associated with MCI and "
            "early cognitive decline (slowed PAF, theta excess)."
        ),
        "clinical_relevance": (
            "Research tool. Should be correlated with neuropsych screening; "
            "EEG alone is not sufficient for any dementia determination."
        ),
        "normal_range": "< 0.3 typical; > 0.6 resembles MCI cohort",
    },
    "brain_age_gap": {
        "name": "Brain-age gap (predicted − chronological)",
        "definition": (
            "Difference in years between a model's predicted brain age and "
            "the subject's true chronological age."
        ),
        "clinical_relevance": (
            "Positive gaps (older than age) can be associated with stress, "
            "sleep deprivation, or neurodegeneration research signals."
        ),
        "normal_range": "-5 to +5 years in healthy adults",
    },
}


def tool_explain_feature(feature_name: str) -> dict[str, str]:
    """Return a small encyclopedia entry describing a qEEG feature.

    Parameters
    ----------
    feature_name : str
        Free-text feature name. Normalised (lowercase, underscores).

    Returns
    -------
    dict with keys ``name``, ``definition``, ``clinical_relevance``,
    ``normal_range``. Missing features fall back to a generic entry
    so the tool never errors.
    """
    if not feature_name:
        feature_name = ""
    key = re.sub(r"[^a-z0-9]+", "_", feature_name.strip().lower()).strip("_")
    # Alias normalisation
    aliases = {
        "faa": "frontal_alpha_asymmetry",
        "frontal_alpha_asymmetry_f3_f4": "frontal_alpha_asymmetry",
        "tbr": "theta_beta_ratio",
        "theta_to_beta_ratio": "theta_beta_ratio",
        "paf": "peak_alpha_frequency",
        "iaf": "peak_alpha_frequency",
        "iapf": "peak_alpha_frequency",
        "one_over_f": "aperiodic_slope",
        "aperiodic_1_f": "aperiodic_slope",
        "dmn": "dmn_coherence",
        "default_mode_network": "dmn_coherence",
        "mdd": "mdd_like",
        "adhd": "adhd_like",
        "anxiety": "anxiety_like",
        "cognitive_decline": "cognitive_decline_like",
    }
    key = aliases.get(key, key)
    entry = _FEATURE_ENCYCLOPEDIA.get(key)
    if entry is not None:
        return dict(entry)
    # Generic fallback
    return {
        "name": feature_name or "Unknown feature",
        "definition": (
            "No encyclopedia entry available for this feature. "
            "It may still be present in the analysis object — check the "
            "`features` payload in the current report."
        ),
        "clinical_relevance": (
            "Unknown. Use the tool to search the literature for this term."
        ),
        "normal_range": "unknown",
    }


# ── Search papers (via medrag) ──────────────────────────────────────────────


def tool_search_papers(
    query: str,
    *,
    k: int = 5,
    db_session: Any = None,
) -> list[dict[str, Any]]:
    """Delegate to :func:`deepsynaps_qeeg.ai.medrag.retrieve`.

    When the retrieval module can't be imported (e.g. Agent F hasn't
    landed the sentence-transformer extras yet) we return an empty list
    rather than crashing. The copilot endpoint can then fall back to a
    "no papers found" reply.
    """
    if not query or not query.strip():
        return []
    try:
        from . import medrag  # type: ignore[attr-defined]
    except Exception as exc:  # pragma: no cover
        log.warning("tool_search_papers: medrag unavailable: %s", exc)
        return []

    try:
        # MedRAG's public signature is ``retrieve(eeg_features, patient_meta,
        # k=..., db_session=...)``. For free-text copilot queries we wrap
        # the query string in a fake "notes" field so the retriever's
        # text-similarity path treats it as the search target.
        fake_features = {"notes": query}
        fake_meta = {"query": query}
        results = medrag.retrieve(
            fake_features,
            fake_meta,
            k=int(k or 5),
            db_session=db_session,
        )
    except Exception as exc:
        log.warning("tool_search_papers: retrieve failed: %s", exc)
        return []

    # Coerce to plain dicts — the retriever may return richer objects.
    cleaned: list[dict[str, Any]] = []
    for r in results or []:
        if isinstance(r, dict):
            cleaned.append(
                {
                    "pmid": r.get("pmid"),
                    "doi": r.get("doi"),
                    "title": r.get("title"),
                    "year": r.get("year"),
                    "authors": r.get("authors"),
                    "url": r.get("url"),
                    "relevance_score": r.get("relevance_score"),
                }
            )
    return cleaned


# ── Compare to norm ─────────────────────────────────────────────────────────


def _normal_sf(z: float) -> float:
    """Approximate survival function of the standard normal."""
    from math import erfc
    return float(0.5 * erfc(z / (2.0 ** 0.5)))


def _centile_from_z(z: float) -> float:
    """Return the centile (0-100) corresponding to a z-score under N(0,1)."""
    if z >= 0:
        return float(100.0 * (1.0 - _normal_sf(z)))
    return float(100.0 * _normal_sf(-z))


def tool_compare_to_norm(
    feature_name: str,
    value: float,
    *,
    age: int | None = None,
    sex: str | None = None,
    db: Any = None,  # noqa: ARG001 — reserved for future normative DB query
) -> dict[str, Any]:
    """Return centile + direction + magnitude for a feature value.

    Uses a simple N(0,1) cumulative when a proper normative curve is
    unavailable — the returned dict is marked ``is_stub=True`` in that
    case so the UI can badge the result as an approximation.
    """
    # Treat the input as a z-score if it's in a plausible z-range; otherwise
    # normalise crudely around known feature means (table below).
    _MEAN_SD: dict[str, tuple[float, float]] = {
        "theta_beta_ratio": (1.8, 0.6),
        "peak_alpha_frequency": (10.2, 0.8),
        "aperiodic_slope": (1.3, 0.25),
        "frontal_alpha_asymmetry": (0.0, 0.08),
        "brain_age_gap": (0.0, 4.0),
    }
    key = re.sub(r"[^a-z0-9]+", "_", (feature_name or "").lower()).strip("_")
    mean, sd = _MEAN_SD.get(key, (0.0, 1.0))
    z = (float(value) - mean) / (sd if sd else 1.0)
    centile = _centile_from_z(z)

    if abs(z) < 0.5:
        direction = "within normal range"
        magnitude = "small"
    elif abs(z) < 1.96:
        direction = "above norm" if z > 0 else "below norm"
        magnitude = "moderate"
    else:
        direction = "well above norm" if z > 0 else "well below norm"
        magnitude = "large"

    return {
        "feature": feature_name,
        "value": float(value),
        "centile": float(round(centile, 1)),
        "z_score": float(round(z, 2)),
        "direction": direction,
        "magnitude": magnitude,
        "age": age,
        "sex": sex,
        "is_stub": key not in _MEAN_SD,
    }


# ── Recommendation detail ───────────────────────────────────────────────────


def tool_get_recommendation_detail(
    section: str,
    recommendation: dict[str, Any],
) -> dict[str, Any]:
    """Zoom into a single section of a ``ProtocolRecommendation``.

    Valid sections: ``modality``, ``dose``, ``session_plan``, ``induction``,
    ``consolidation``, ``maintenance``, ``contraindications``,
    ``citations``, ``rationale``, ``alternatives`` (and aliases). Unknown
    sections return the full recommendation with a ``warning`` key.
    """
    if not isinstance(recommendation, dict):
        recommendation = {}
    key = (section or "").strip().lower()

    direct_paths: dict[str, list[str]] = {
        "modality": ["primary_modality"],
        "target": ["target_region"],
        "dose": ["dose"],
        "sessions": ["dose", "sessions"],
        "intensity": ["dose", "intensity"],
        "duration": ["dose", "duration_min"],
        "frequency": ["dose", "frequency"],
        "session_plan": ["session_plan"],
        "induction": ["session_plan", "induction"],
        "consolidation": ["session_plan", "consolidation"],
        "maintenance": ["session_plan", "maintenance"],
        "contraindications": ["contraindications"],
        "citations": ["citations"],
        "confidence": ["confidence"],
        "rationale": ["rationale"],
        "alternatives": ["alternative_protocols"],
        "alternative_protocols": ["alternative_protocols"],
        "response_window": ["expected_response_window_weeks"],
    }
    path = direct_paths.get(key)
    if not path:
        return {
            "section": section,
            "detail": recommendation,
            "warning": f"Unknown section '{section}'; returning full recommendation.",
        }

    cur: Any = recommendation
    for seg in path:
        if isinstance(cur, dict):
            cur = cur.get(seg)
        else:
            cur = None
            break

    return {
        "section": section,
        "detail": cur,
    }


# ── System prompt ───────────────────────────────────────────────────────────


SYSTEM_PROMPT_TEMPLATE: str = """You are the DeepSynaps qEEG Copilot — a clinician-facing research assistant.

Your role:
- Explain qEEG features, z-scores, similarity indices, and the current
  protocol recommendation.
- Surface citations from the research literature (use the
  tool_search_papers tool when asked for evidence).
- Refuse to give personal medical advice, diagnose, or adjust
  medications. If the user asks for any of those, reply:
  "{refusal_message}"
- Never use the words "diagnose", "diagnostic", or "treatment
  recommendation". Similarity indices are "similarity indices (research
  only)", not "depression probability" or "MDD score".
- Cite every claim using the numbered reference list below.

Tools available:
- tool_search_papers(query): literature retrieval
- tool_explain_feature(feature_name): feature encyclopedia
- tool_compare_to_norm(feature_name, value, age, sex): centile lookup
- tool_get_recommendation_detail(section, recommendation): protocol drill-down

Current analysis context (id={analysis_id}):

Features summary:
{features_summary}

Z-scores flagged:
{zscores_summary}

Similarity indices (research-only):
{risk_summary}

Protocol recommendation:
{recommendation_summary}

Cited papers:
{papers_summary}
"""


def _truncate(value: Any, limit: int = 600) -> str:
    s = json.dumps(value, default=str) if value is not None else ""
    if len(s) <= limit:
        return s
    return s[: limit - 3] + "..."


def render_system_prompt(
    *,
    analysis_id: str,
    features: Any = None,
    zscores: Any = None,
    risk_scores: Any = None,
    recommendation: Any = None,
    papers: Iterable[dict[str, Any]] | None = None,
) -> str:
    """Hydrate :data:`SYSTEM_PROMPT_TEMPLATE` with the live analysis payload.

    All inputs are optional; missing fields render as ``"(none)"``.
    """
    def _safe(obj: Any, fallback: str = "(none)") -> str:
        if obj is None:
            return fallback
        if isinstance(obj, str) and not obj.strip():
            return fallback
        return _truncate(obj)

    papers_list = list(papers or [])
    papers_summary_lines: list[str] = []
    for i, p in enumerate(papers_list, start=1):
        title = p.get("title", "Untitled")
        year = p.get("year") or "n.d."
        pmid = p.get("pmid") or p.get("doi") or ""
        papers_summary_lines.append(f"[{i}] {title} ({year}) {pmid}")
    papers_summary = "\n".join(papers_summary_lines) or "(none)"

    return SYSTEM_PROMPT_TEMPLATE.format(
        refusal_message=REFUSAL_MESSAGE,
        analysis_id=analysis_id or "(unknown)",
        features_summary=_safe(features),
        zscores_summary=_safe(zscores),
        risk_summary=_safe(risk_scores),
        recommendation_summary=_safe(recommendation),
        papers_summary=papers_summary,
    )


# ── Tool dispatcher (pseudo-LLM for tests) ──────────────────────────────────


def mock_llm_tool_dispatch(user_message: str, context: dict[str, Any]) -> dict[str, Any]:
    """A deterministic, test-friendly stand-in for a real LLM backend.

    Parses a handful of prefixes to pick a tool:
    - "search: <query>" -> tool_search_papers
    - "explain: <feature>" -> tool_explain_feature
    - "norm: <feature>=<value>" -> tool_compare_to_norm
    - "section: <name>" -> tool_get_recommendation_detail
    - anything else -> plain echo

    Returns a dict ``{"tool": str | None, "result": Any, "reply": str}``.
    """
    text = (user_message or "").strip()
    lower = text.lower()

    if is_unsafe_query(text):
        return {"tool": None, "result": None, "reply": REFUSAL_MESSAGE}

    if lower.startswith("search:"):
        query = text.split(":", 1)[1].strip()
        results = tool_search_papers(query, db_session=context.get("db"))
        return {"tool": "tool_search_papers", "result": results, "reply": f"tool result: {len(results)} papers"}

    if lower.startswith("explain:"):
        feature = text.split(":", 1)[1].strip()
        entry = tool_explain_feature(feature)
        return {"tool": "tool_explain_feature", "result": entry, "reply": f"tool result: {entry.get('name')}"}

    if lower.startswith("norm:"):
        body = text.split(":", 1)[1].strip()
        if "=" in body:
            feature, raw_val = body.split("=", 1)
            try:
                val = float(raw_val.strip())
            except ValueError:
                return {"tool": None, "result": None, "reply": "Could not parse numeric value."}
            res = tool_compare_to_norm(
                feature.strip(),
                val,
                age=context.get("age"),
                sex=context.get("sex"),
                db=context.get("db"),
            )
            return {
                "tool": "tool_compare_to_norm",
                "result": res,
                "reply": f"tool result: {res['feature']} -> centile={res['centile']}",
            }

    if lower.startswith("section:"):
        section = text.split(":", 1)[1].strip()
        rec = context.get("recommendation") or {}
        res = tool_get_recommendation_detail(section, rec)
        return {
            "tool": "tool_get_recommendation_detail",
            "result": res,
            "reply": f"tool result: section={res.get('section')}",
        }

    return {"tool": None, "result": None, "reply": f"tool result: {text[:200]}"}


__all__ = [
    "SAFETY_REFUSAL_PATTERNS",
    "REFUSAL_MESSAGE",
    "SYSTEM_PROMPT_TEMPLATE",
    "is_unsafe_query",
    "tool_search_papers",
    "tool_explain_feature",
    "tool_compare_to_norm",
    "tool_get_recommendation_detail",
    "render_system_prompt",
    "mock_llm_tool_dispatch",
]
