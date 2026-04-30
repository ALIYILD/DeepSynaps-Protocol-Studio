"""Clinician copilot chat tools for the DeepSynaps qEEG Analyzer.

Upgrade 10 in ``AI_UPGRADES.md`` / ``CONTRACT_V2.md`` §1.10. The WebSocket
endpoint lives in ``apps/api/app/routers/qeeg_copilot_router.py``; this
module exposes:

1. Six tool functions the endpoint can dispatch to:
   * :func:`tool_search_papers`
   * :func:`tool_explain_feature`
   * :func:`tool_explain_channel`
   * :func:`tool_compare_to_norm`
   * :func:`tool_get_recommendation_detail`
   * :func:`tool_explain_medication`
2. A safety gate (:func:`is_unsafe_query` + :data:`SAFETY_REFUSAL_PATTERNS`).
3. A system-prompt template (:data:`SYSTEM_PROMPT_TEMPLATE`) with a
   :func:`render_system_prompt` helper that hydrates it from analysis
   payload + retrieval output.
4. A deterministic mock dispatch (:func:`mock_llm_tool_dispatch`) used
   for tests and offline demos.
5. A real streaming tool-calling LLM dispatcher
   (:func:`real_llm_tool_dispatch`) with Anthropic-primary / OpenAI
   fallback / mock last-resort selection.

The module is import-safe: it never raises at import time even if the
sibling ``ai.medrag`` module is missing (retrieval is then stubbed) or
if the Anthropic/OpenAI SDKs are absent.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, AsyncIterator, Iterable, Literal

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


def tool_explain_channel(channel_name: str) -> dict[str, Any]:
    """Return channel anatomy + expected artifact profiles for a qEEG channel.

    Uses the knowledge-base ``ChannelAtlas`` and ``ArtifactAtlas`` to
    give deterministic, citation-free advisory context.
    """
    if not channel_name:
        return {"channel": "", "anatomy": "", "artifacts": []}

    try:
        from deepsynaps_qeeg.knowledge import (
            ArtifactAtlas,
            ChannelAtlas,
            explain_channel,
        )
    except Exception as exc:
        log.warning("Knowledge layer unavailable for tool_explain_channel: %s", exc)
        return {"channel": channel_name, "anatomy": "", "artifacts": []}

    anatomy = explain_channel(channel_name)
    artifacts: list[dict[str, Any]] = []
    try:
        for profile in ArtifactAtlas.lookup(channel_name):
            artifacts.append(
                {
                    "artifact_type": profile.artifact_type,
                    "typical_bands": list(profile.typical_bands),
                    "signature": profile.signature,
                    "differentiation_tip": profile.differentiation_tip,
                }
            )
    except Exception:
        pass

    return {
        "channel": channel_name,
        "anatomy": anatomy,
        "artifacts": artifacts,
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


def tool_explain_medication(medication_name: str) -> dict[str, Any]:
    """Return EEG-effect profile for a medication.

    Uses the knowledge-base ``MedicationEEGAtlas`` to give deterministic,
    citation-free advisory context about expected EEG changes.
    """
    if not medication_name:
        return {"name": "", "drug_class": "", "eeg_effects": [], "clinical_note": ""}

    try:
        from deepsynaps_qeeg.knowledge import MedicationEEGAtlas
    except Exception as exc:
        log.warning("Knowledge layer unavailable for tool_explain_medication: %s", exc)
        return {"name": medication_name, "drug_class": "", "eeg_effects": [], "clinical_note": ""}

    profile = MedicationEEGAtlas.lookup(medication_name)
    if profile is None:
        return {
            "name": medication_name,
            "drug_class": "Unknown",
            "eeg_effects": [],
            "affected_bands": [],
            "clinical_note": "No EEG-effect profile found for this medication.",
        }

    return {
        "name": profile.name,
        "drug_class": profile.drug_class,
        "eeg_effects": list(profile.eeg_effects),
        "affected_bands": list(profile.affected_bands),
        "typical_channels": list(profile.typical_channels),
        "onset_hours": profile.onset_hours,
        "washout_days": profile.washout_days,
        "clinical_note": profile.clinical_note,
    }


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
- tool_explain_channel(channel): channel anatomy + expected artifacts
- tool_compare_to_norm(feature_name, value, age, sex): centile lookup
- tool_get_recommendation_detail(section, recommendation): protocol drill-down
- tool_explain_medication(medication_name): medication EEG effects

Current analysis context (id={analysis_id}):

Features summary:
{features_summary}

Z-scores flagged:
{zscores_summary}

Similarity indices (research-only):
{risk_summary}

Protocol recommendation:
{recommendation_summary}

Medication / confound awareness:
{medication_confounds_summary}

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
    medication_confounds: Any = None,
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

    medication_confounds_summary = _safe(medication_confounds)

    return SYSTEM_PROMPT_TEMPLATE.format(
        refusal_message=REFUSAL_MESSAGE,
        analysis_id=analysis_id or "(unknown)",
        features_summary=_safe(features),
        zscores_summary=_safe(zscores),
        risk_summary=_safe(risk_scores),
        recommendation_summary=_safe(recommendation),
        medication_confounds_summary=medication_confounds_summary,
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

    if lower.startswith("medication:"):
        med = text.split(":", 1)[1].strip()
        res = tool_explain_medication(med)
        return {
            "tool": "tool_explain_medication",
            "result": res,
            "reply": f"tool result: {res.get('name', med)}",
        }

    return {"tool": None, "result": None, "reply": f"tool result: {text[:200]}"}


# ── Real LLM dispatch (streaming, tool-use) ─────────────────────────────────

# Sanitiser rewrites banned vocabulary on every assistant-produced chunk
# BEFORE the chunk is yielded to the caller. The replacements are
# intentionally case-insensitive so "Diagnosis" and "diagnostic" are both
# rewritten. Keep this list aligned with the prohibitions in
# :data:`SYSTEM_PROMPT_TEMPLATE` and :mod:`packages/qeeg-pipeline/CLAUDE.md`.
_BANNED_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\btreatment\s+recommendation\b", re.IGNORECASE), "protocol suggestion"),
    (re.compile(r"\btreatment\s+recommendations\b", re.IGNORECASE), "protocol suggestions"),
    (re.compile(r"\bdiagnostic\b", re.IGNORECASE), "finding"),
    (re.compile(r"\bdiagnosis\b", re.IGNORECASE), "finding"),
    (re.compile(r"\bdiagnoses\b", re.IGNORECASE), "findings"),
    (re.compile(r"\bdiagnosing\b", re.IGNORECASE), "noting"),
    (re.compile(r"\bdiagnose\b", re.IGNORECASE), "note"),
]


def _sanitize_banned_words(text: str) -> str:
    """Rewrite banned vocabulary (``diagnos*``, ``treatment recommendation``).

    Parameters
    ----------
    text : str
        LLM-produced chunk text.

    Returns
    -------
    str
        The same text with clinical-assertion vocabulary rewritten into
        research-only synonyms. Unconditional and case-insensitive.
    """
    if not text:
        return text
    out = text
    for pat, replacement in _BANNED_REPLACEMENTS:
        out = pat.sub(replacement, out)
    return out


# ── Tool schema + backend selection ─────────────────────────────────────────


def _tools_schema() -> list[dict[str, Any]]:
    """Return Anthropic/OpenAI-compatible JSON schema for the 4 tools.

    Returns
    -------
    list of dict
        Each dict has ``name``, ``description``, and ``input_schema``
        (JSON Schema). The schema shape matches Anthropic's tool-use
        spec; the OpenAI branch wraps each entry as
        ``{"type": "function", "function": {...}}`` at call time.
    """
    return [
        {
            "name": "tool_search_papers",
            "description": (
                "Search the DeepSynaps research literature database for "
                "papers matching a free-text query. Returns a list of "
                "citations with pmid/doi/title/year."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Free-text query, e.g. 'theta beta ratio ADHD'.",
                    },
                    "k": {
                        "type": "integer",
                        "description": "Maximum number of papers to return.",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
        {
            "name": "tool_explain_feature",
            "description": (
                "Return the feature-encyclopedia entry (definition, "
                "clinical relevance, typical normal range) for a qEEG "
                "feature."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "feature_name": {
                        "type": "string",
                        "description": (
                            "Feature name, e.g. 'theta_beta_ratio' or "
                            "'frontal_alpha_asymmetry'."
                        ),
                    },
                },
                "required": ["feature_name"],
            },
        },
        {
            "name": "tool_explain_channel",
            "description": (
                "Return channel anatomy and expected artifact profiles "
                "for an EEG channel (e.g. 'Fp1', 'F3', 'O1')."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "channel_name": {
                        "type": "string",
                        "description": "EEG channel name, e.g. 'Fp1' or 'Cz'.",
                    },
                },
                "required": ["channel_name"],
            },
        },
        {
            "name": "tool_compare_to_norm",
            "description": (
                "Compare a feature value to the normative distribution, "
                "returning centile, z-score, direction and magnitude."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "feature_name": {"type": "string"},
                    "value": {"type": "number"},
                    "age": {"type": ["integer", "null"]},
                    "sex": {"type": ["string", "null"]},
                },
                "required": ["feature_name", "value"],
            },
        },
        {
            "name": "tool_get_recommendation_detail",
            "description": (
                "Drill into a single section of the current protocol "
                "recommendation (modality/dose/session_plan/"
                "contraindications/citations/alternatives/rationale)."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "section": {
                        "type": "string",
                        "description": "Section name, e.g. 'dose' or 'contraindications'.",
                    },
                },
                "required": ["section"],
            },
        },
    ]


# Cached lazy singletons — avoid re-building the SDK client on every
# WebSocket message.
_ANTHROPIC_CLIENT_CACHE: Any = None
_OPENAI_CLIENT_CACHE: Any = None
_CLIENT_CACHE_SENTINEL: Any = object()


def _get_anthropic_client() -> Any:
    """Lazy singleton Anthropic ``AsyncAnthropic`` client or ``None``.

    Returns
    -------
    anthropic.AsyncAnthropic or None
        Returns ``None`` when the SDK is not installed OR
        ``ANTHROPIC_API_KEY`` is not set in the environment.
    """
    global _ANTHROPIC_CLIENT_CACHE
    if _ANTHROPIC_CLIENT_CACHE is _CLIENT_CACHE_SENTINEL:
        return None
    if _ANTHROPIC_CLIENT_CACHE is not None:
        return _ANTHROPIC_CLIENT_CACHE
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        _ANTHROPIC_CLIENT_CACHE = _CLIENT_CACHE_SENTINEL
        return None
    try:
        import anthropic as _anthropic  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover - SDK absent
        log.warning("Anthropic SDK unavailable: %s", exc)
        _ANTHROPIC_CLIENT_CACHE = _CLIENT_CACHE_SENTINEL
        return None
    try:
        _ANTHROPIC_CLIENT_CACHE = _anthropic.AsyncAnthropic(api_key=api_key)
    except Exception as exc:  # pragma: no cover
        log.warning("Anthropic client init failed: %s", exc)
        _ANTHROPIC_CLIENT_CACHE = _CLIENT_CACHE_SENTINEL
        return None
    return _ANTHROPIC_CLIENT_CACHE


def _get_openai_client() -> Any:
    """Lazy singleton OpenAI ``AsyncOpenAI`` client or ``None``.

    Returns
    -------
    openai.AsyncOpenAI or None
        Returns ``None`` when the SDK is not installed OR no
        ``OPENAI_API_KEY`` / ``GLM_API_KEY`` env var is present. When
        ``LLM_BASE_URL`` is set (e.g. OpenRouter), it is threaded into
        the client constructor so GLM-free works too.
    """
    global _OPENAI_CLIENT_CACHE
    if _OPENAI_CLIENT_CACHE is _CLIENT_CACHE_SENTINEL:
        return None
    if _OPENAI_CLIENT_CACHE is not None:
        return _OPENAI_CLIENT_CACHE
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("GLM_API_KEY")
    if not api_key:
        _OPENAI_CLIENT_CACHE = _CLIENT_CACHE_SENTINEL
        return None
    try:
        from openai import AsyncOpenAI  # type: ignore[import-not-found]
    except Exception as exc:  # pragma: no cover
        log.warning("OpenAI SDK unavailable: %s", exc)
        _OPENAI_CLIENT_CACHE = _CLIENT_CACHE_SENTINEL
        return None
    try:
        base_url = os.getenv("LLM_BASE_URL")
        if base_url:
            _OPENAI_CLIENT_CACHE = AsyncOpenAI(api_key=api_key, base_url=base_url)
        else:
            _OPENAI_CLIENT_CACHE = AsyncOpenAI(api_key=api_key)
    except Exception as exc:  # pragma: no cover
        log.warning("OpenAI client init failed: %s", exc)
        _OPENAI_CLIENT_CACHE = _CLIENT_CACHE_SENTINEL
        return None
    return _OPENAI_CLIENT_CACHE


def _reset_llm_client_caches() -> None:
    """Reset the cached SDK clients. Test-only helper."""
    global _ANTHROPIC_CLIENT_CACHE, _OPENAI_CLIENT_CACHE
    _ANTHROPIC_CLIENT_CACHE = None
    _OPENAI_CLIENT_CACHE = None


def _select_backend(
    *,
    anthropic_client: Any = None,
    openai_client: Any = None,
) -> Literal["anthropic", "openai", "mock"]:
    """Pick a backend using env override then SDK availability.

    Selection order:

    1. ``DEEPSYNAPS_LLM_BACKEND`` env var (``anthropic`` / ``openai`` /
       ``mock``) — if the requested backend has a client available, use
       it. Falls through to auto-selection otherwise.
    2. Anthropic if a client is available.
    3. OpenAI if a client is available.
    4. ``mock`` as a last resort.

    Parameters
    ----------
    anthropic_client : Any, optional
        Explicitly passed-in client (used by the real-dispatcher's test
        harness). When ``None``, falls back to the lazy singleton.
    openai_client : Any, optional
        Same as ``anthropic_client`` but for OpenAI.

    Returns
    -------
    str
        One of ``"anthropic"``, ``"openai"``, or ``"mock"``.
    """
    override = (os.getenv("DEEPSYNAPS_LLM_BACKEND") or "").strip().lower()
    anth = anthropic_client if anthropic_client is not None else _get_anthropic_client()
    oai = openai_client if openai_client is not None else _get_openai_client()
    if override == "anthropic" and anth is not None:
        return "anthropic"
    if override == "openai" and oai is not None:
        return "openai"
    if override == "mock":
        return "mock"
    if anth is not None:
        return "anthropic"
    if oai is not None:
        return "openai"
    return "mock"


# ── Tool execution helpers ──────────────────────────────────────────────────


def _dispatch_tool_call(
    tool_name: str,
    tool_input: dict[str, Any],
    context: dict[str, Any],
) -> Any:
    """Execute a named tool against the request context.

    Parameters
    ----------
    tool_name : str
        One of the 4 registered tool names.
    tool_input : dict
        Arguments from the model's tool-use block.
    context : dict
        Session context (``db``, ``recommendation``, ``age``, ``sex`` …).

    Returns
    -------
    Any
        The raw tool result (JSON-serialisable). Unknown tools return
        an ``{"error": "..."}`` dict so the model can recover gracefully.
    """
    tool_input = tool_input or {}
    try:
        if tool_name == "tool_search_papers":
            return tool_search_papers(
                str(tool_input.get("query", "")),
                k=int(tool_input.get("k", 5) or 5),
                db_session=context.get("db"),
            )
        if tool_name == "tool_explain_feature":
            return tool_explain_feature(str(tool_input.get("feature_name", "")))
        if tool_name == "tool_explain_channel":
            return tool_explain_channel(str(tool_input.get("channel_name", "")))
        if tool_name == "tool_compare_to_norm":
            return tool_compare_to_norm(
                str(tool_input.get("feature_name", "")),
                float(tool_input.get("value", 0.0) or 0.0),
                age=tool_input.get("age") or context.get("age"),
                sex=tool_input.get("sex") or context.get("sex"),
                db=context.get("db"),
            )
        if tool_name == "tool_get_recommendation_detail":
            section = str(tool_input.get("section", ""))
            rec = context.get("recommendation") or {}
            return tool_get_recommendation_detail(section, rec)
    except Exception as exc:  # pragma: no cover — defensive
        log.warning("Tool %s failed: %s", tool_name, exc)
        return {"error": f"{type(exc).__name__}: {exc}"}
    return {"error": f"Unknown tool '{tool_name}'"}


def _render_context_system_prompt(context: dict[str, Any]) -> str:
    """Build a system prompt from the dispatch context via
    :func:`render_system_prompt`.

    Missing keys fall back to ``(none)``; the copilot router is
    responsible for passing a rich context.
    """
    return render_system_prompt(
        analysis_id=str(context.get("analysis_id") or "(unknown)"),
        features=context.get("features"),
        zscores=context.get("zscores"),
        risk_scores=context.get("risk_scores"),
        recommendation=context.get("recommendation"),
        papers=context.get("papers") or [],
        medication_confounds=context.get("medication_confounds"),
    )


# ── Anthropic streaming branch ──────────────────────────────────────────────


async def _dispatch_anthropic(
    user_message: str,
    context: dict[str, Any],
    *,
    history: list[dict[str, Any]],
    client: Any,
) -> AsyncIterator[dict[str, Any]]:
    """Stream via Anthropic ``messages.stream`` with tool-use loop.

    Yields
    ------
    dict
        Chunk dicts shaped as
        ``{"type": "delta"|"tool_use"|"tool_result"|"final"|"error", ...}``.
    """
    model = os.getenv("DEEPSYNAPS_COPILOT_ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
    max_tokens = int(os.getenv("DEEPSYNAPS_COPILOT_MAX_TOKENS", "1024"))

    system_prompt = _render_context_system_prompt(context)
    # Build message history; assume ``history`` is already in anthropic
    # format (role/content dicts). Append the new user turn.
    messages: list[dict[str, Any]] = list(history or [])
    messages.append({"role": "user", "content": user_message})

    tools = _tools_schema()
    accumulated_text: list[str] = []

    # Bounded loop to prevent runaway tool calls.
    for _ in range(4):
        final_message: Any = None
        try:
            stream_ctx = client.messages.stream(
                model=model,
                max_tokens=max_tokens,
                system=system_prompt,
                tools=tools,
                messages=messages,
            )
        except Exception as exc:  # pragma: no cover — guarded at caller
            yield {"type": "error", "text": f"{type(exc).__name__}: {exc}", "tool": None}
            return

        try:
            async with stream_ctx as stream:
                async for event in stream:
                    etype = getattr(event, "type", None)
                    if etype == "content_block_start":
                        block = getattr(event, "content_block", None)
                        if block is not None and getattr(block, "type", None) == "tool_use":
                            yield {
                                "type": "tool_use",
                                "tool": getattr(block, "name", None),
                                "text": "",
                            }
                    elif etype == "content_block_delta":
                        delta = getattr(event, "delta", None)
                        dtype = getattr(delta, "type", None) if delta else None
                        if dtype == "text_delta":
                            raw = getattr(delta, "text", "") or ""
                            clean = _sanitize_banned_words(raw)
                            if clean:
                                accumulated_text.append(clean)
                                yield {"type": "delta", "text": clean, "tool": None}
                final_message = await stream.get_final_message()
        except Exception as exc:
            yield {"type": "error", "text": f"{type(exc).__name__}: {exc}", "tool": None}
            return

        # Inspect the final message for tool_use blocks we must service.
        stop_reason = getattr(final_message, "stop_reason", None)
        content_blocks = list(getattr(final_message, "content", []) or [])
        tool_uses = [
            b for b in content_blocks if getattr(b, "type", None) == "tool_use"
        ]

        if stop_reason == "tool_use" and tool_uses:
            # Append assistant turn (the raw content blocks) + tool_result
            # turn, then continue looping.
            serialised_assistant: list[dict[str, Any]] = []
            for b in content_blocks:
                btype = getattr(b, "type", None)
                if btype == "text":
                    serialised_assistant.append(
                        {"type": "text", "text": getattr(b, "text", "")}
                    )
                elif btype == "tool_use":
                    serialised_assistant.append(
                        {
                            "type": "tool_use",
                            "id": getattr(b, "id", ""),
                            "name": getattr(b, "name", ""),
                            "input": getattr(b, "input", {}) or {},
                        }
                    )
            messages.append({"role": "assistant", "content": serialised_assistant})

            tool_results: list[dict[str, Any]] = []
            for b in tool_uses:
                name = getattr(b, "name", "")
                tool_in = getattr(b, "input", {}) or {}
                result = _dispatch_tool_call(name, tool_in, context)
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": getattr(b, "id", ""),
                        "content": json.dumps(result, default=str),
                    }
                )
                yield {
                    "type": "tool_result",
                    "tool": name,
                    "text": "",
                }
            messages.append({"role": "user", "content": tool_results})
            continue

        # End-turn: emit the final response.
        final_text = _sanitize_banned_words("".join(accumulated_text))
        yield {"type": "final", "text": final_text, "tool": None}
        return

    # Too many tool rounds — degrade gracefully.
    yield {
        "type": "final",
        "text": _sanitize_banned_words("".join(accumulated_text))
        or "(tool-use loop exceeded)",
        "tool": None,
    }


# ── OpenAI streaming branch ─────────────────────────────────────────────────


async def _dispatch_openai(
    user_message: str,
    context: dict[str, Any],
    *,
    history: list[dict[str, Any]],
    client: Any,
) -> AsyncIterator[dict[str, Any]]:
    """Stream via OpenAI ``chat.completions.create`` with tool-calls.

    The schema shape of Anthropic's ``input_schema`` matches OpenAI's
    ``parameters`` so we can reuse :func:`_tools_schema` with a minimal
    wrap.
    """
    model = os.getenv(
        "DEEPSYNAPS_COPILOT_OPENAI_MODEL",
        os.getenv("LLM_MODEL", "gpt-4o-mini"),
    )
    max_tokens = int(os.getenv("DEEPSYNAPS_COPILOT_MAX_TOKENS", "1024"))

    system_prompt = _render_context_system_prompt(context)
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for h in history or []:
        messages.append(h)
    messages.append({"role": "user", "content": user_message})

    tools = [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in _tools_schema()
    ]

    accumulated_text: list[str] = []

    for _ in range(4):
        try:
            resp = await client.chat.completions.create(
                model=model,
                messages=messages,
                tools=tools,
                stream=True,
                max_tokens=max_tokens,
            )
        except Exception as exc:
            yield {"type": "error", "text": f"{type(exc).__name__}: {exc}", "tool": None}
            return

        assistant_text_parts: list[str] = []
        tool_calls_buf: dict[int, dict[str, Any]] = {}
        finish_reason: str | None = None

        try:
            async for chunk in resp:
                choices = getattr(chunk, "choices", []) or []
                if not choices:
                    continue
                choice = choices[0]
                delta = getattr(choice, "delta", None)
                fr = getattr(choice, "finish_reason", None)
                if fr:
                    finish_reason = fr
                if delta is None:
                    continue
                text = getattr(delta, "content", None)
                if text:
                    clean = _sanitize_banned_words(text)
                    if clean:
                        assistant_text_parts.append(clean)
                        accumulated_text.append(clean)
                        yield {"type": "delta", "text": clean, "tool": None}
                tcs = getattr(delta, "tool_calls", None) or []
                for tc in tcs:
                    idx = getattr(tc, "index", 0) or 0
                    slot = tool_calls_buf.setdefault(
                        idx, {"id": "", "name": "", "arguments": ""}
                    )
                    tc_id = getattr(tc, "id", None)
                    if tc_id:
                        slot["id"] = tc_id
                    fn = getattr(tc, "function", None)
                    if fn is not None:
                        fn_name = getattr(fn, "name", None)
                        if fn_name:
                            slot["name"] = fn_name
                        fn_args = getattr(fn, "arguments", None)
                        if fn_args:
                            slot["arguments"] += fn_args
        except Exception as exc:
            yield {"type": "error", "text": f"{type(exc).__name__}: {exc}", "tool": None}
            return

        if finish_reason == "tool_calls" and tool_calls_buf:
            # Signal each tool_use to the client, service it, then loop.
            ordered = [tool_calls_buf[i] for i in sorted(tool_calls_buf.keys())]
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": "".join(assistant_text_parts) or None,
                "tool_calls": [
                    {
                        "id": tc["id"] or f"call_{i}",
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc["arguments"] or "{}",
                        },
                    }
                    for i, tc in enumerate(ordered)
                ],
            }
            messages.append(assistant_msg)
            for i, tc in enumerate(ordered):
                yield {"type": "tool_use", "tool": tc["name"], "text": ""}
                try:
                    parsed = json.loads(tc["arguments"] or "{}")
                except (TypeError, ValueError):
                    parsed = {}
                result = _dispatch_tool_call(tc["name"], parsed, context)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc["id"] or f"call_{i}",
                        "content": json.dumps(result, default=str),
                    }
                )
                yield {"type": "tool_result", "tool": tc["name"], "text": ""}
            continue

        final_text = _sanitize_banned_words("".join(accumulated_text))
        yield {"type": "final", "text": final_text, "tool": None}
        return

    yield {
        "type": "final",
        "text": _sanitize_banned_words("".join(accumulated_text))
        or "(tool-use loop exceeded)",
        "tool": None,
    }


# ── Public real dispatch ────────────────────────────────────────────────────


async def real_llm_tool_dispatch(
    user_message: str,
    context: dict[str, Any],
    *,
    history: list[dict[str, Any]] | None = None,
    anthropic_client: Any = None,
    openai_client: Any = None,
    stream_chunk_callback: Any = None,
) -> AsyncIterator[dict[str, Any]]:
    """Stream a tool-calling LLM response for the qEEG copilot.

    This is the production-facing async iterator. Each yielded chunk
    has the shape ``{"type": ..., "text": str, "tool": str | None}``
    where ``type`` is one of:

    - ``delta`` — incremental assistant text (already sanitised).
    - ``tool_use`` — the model has requested a tool call; ``tool`` is
      the tool name.
    - ``tool_result`` — the tool returned; the chip can be cleared.
    - ``final`` — the full (sanitised) assistant reply text.
    - ``error`` — backend failure; ``text`` carries the error message.

    Parameters
    ----------
    user_message : str
        The incoming user turn.
    context : dict
        Session context used by :func:`render_system_prompt` and the
        tool dispatcher (``analysis_id``, ``features``, ``zscores``,
        ``risk_scores``, ``recommendation``, ``db``, ``age``, ``sex``).
    history : list of dict, optional
        Prior assistant/user turns in the message format the underlying
        SDK expects. Defaults to empty.
    anthropic_client : Any, optional
        Override the lazy singleton Anthropic client. Used by tests.
    openai_client : Any, optional
        Override the lazy singleton OpenAI client. Used by tests.
    stream_chunk_callback : callable, optional
        If provided, each chunk is passed to this callback in addition
        to being yielded. Useful for side-channel logging.

    Yields
    ------
    dict
        Streaming chunks. The consumer should treat ``final`` as the
        terminal event and stop reading.
    """
    history = list(history or [])

    # Hard safety gate — short-circuit before any LLM call.
    if is_unsafe_query(user_message):
        chunk = {
            "type": "final",
            "text": "I can't provide medical advice — please consult your clinician.",
            "tool": None,
        }
        if stream_chunk_callback is not None:
            try:
                stream_chunk_callback(chunk)
            except Exception:  # pragma: no cover
                pass
        yield chunk
        return

    backend = _select_backend(
        anthropic_client=anthropic_client,
        openai_client=openai_client,
    )
    log.info("real_llm_tool_dispatch backend=%s", backend)

    async def _forward(
        gen: AsyncIterator[dict[str, Any]],
    ) -> AsyncIterator[dict[str, Any]]:
        async for c in gen:
            if stream_chunk_callback is not None:
                try:
                    stream_chunk_callback(c)
                except Exception:  # pragma: no cover
                    pass
            yield c

    if backend == "anthropic":
        client = anthropic_client if anthropic_client is not None else _get_anthropic_client()
        async for c in _forward(
            _dispatch_anthropic(user_message, context, history=history, client=client)
        ):
            yield c
        return

    if backend == "openai":
        client = openai_client if openai_client is not None else _get_openai_client()
        async for c in _forward(
            _dispatch_openai(user_message, context, history=history, client=client)
        ):
            yield c
        return

    # ── Last-resort fallback: mock dispatch ─────────────────────────────
    try:
        result = mock_llm_tool_dispatch(user_message, context)
    except Exception as exc:  # pragma: no cover
        chunk = {
            "type": "error",
            "text": f"{type(exc).__name__}: {exc}",
            "tool": None,
        }
        if stream_chunk_callback is not None:
            try:
                stream_chunk_callback(chunk)
            except Exception:
                pass
        yield chunk
        return

    mock_text = f"<mock>{_sanitize_banned_words(result.get('reply', '') or '')}"
    final_chunk = {
        "type": "final",
        "text": mock_text,
        "tool": result.get("tool"),
    }
    if stream_chunk_callback is not None:
        try:
            stream_chunk_callback(final_chunk)
        except Exception:  # pragma: no cover
            pass
    yield final_chunk


__all__ = [
    "SAFETY_REFUSAL_PATTERNS",
    "REFUSAL_MESSAGE",
    "SYSTEM_PROMPT_TEMPLATE",
    "is_unsafe_query",
    "tool_search_papers",
    "tool_explain_feature",
    "tool_explain_channel",
    "tool_compare_to_norm",
    "tool_get_recommendation_detail",
    "render_system_prompt",
    "mock_llm_tool_dispatch",
    "real_llm_tool_dispatch",
]
