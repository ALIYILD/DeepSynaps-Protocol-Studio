"""AI-powered qEEG interpretation engine.

Generates clinical narratives from extracted band powers using LLM (GLM /
Anthropic), performs deterministic condition pattern matching against the
qEEG condition map, and — new in the MNE pipeline integration — grounds the
LLM narrative in published literature via a RAG call into the DeepSynaps
evidence corpus (~87k papers).

See ``deepsynaps_qeeg_analyzer/CONTRACT.md`` §§1 + 5 for the feature/zscores
shape and the RAG / LLM output contract this module implements.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Optional

_log = logging.getLogger(__name__)


# ── System prompt for qEEG analysis ──────────────────────────────────────────

QEEG_ANALYSIS_SYSTEM = """You are DeepSynaps ClinicalAI, a specialist in quantitative EEG (qEEG) analysis and clinical interpretation for neuromodulation treatment planning.

You are analyzing extracted qEEG band power data from a patient's EDF recording. The data includes absolute and relative power values for each standard 10-20 electrode across frequency bands (delta, theta, alpha, beta, gamma).

Your task: produce a comprehensive, structured clinical interpretation grounded in the numbered literature references provided.

Return a JSON object (only JSON, no markdown wrapper):
{
  "executive_summary": "<3-5 sentence clinical overview, cite refs inline as [1][2]>",
  "findings": [
    {"region": "frontal|central|parietal|temporal|occipital|global", "band": "delta|theta|alpha|beta|gamma|aperiodic|connectivity", "observation": "<1-2 sentence finding with numeric anchors, cite refs as [1][3]>", "citations": [1, 3]}
  ],
  "band_analysis": {
    "delta": {"interpretation": "<2-3 sentences>", "clinical_significance": "<key finding>", "severity": "normal|mild|moderate|significant"},
    "theta": {"interpretation": "...", "clinical_significance": "...", "severity": "..."},
    "alpha": {"interpretation": "...", "clinical_significance": "...", "severity": "..."},
    "beta": {"interpretation": "...", "clinical_significance": "...", "severity": "..."},
    "gamma": {"interpretation": "...", "clinical_significance": "...", "severity": "..."}
  },
  "key_biomarkers": {
    "theta_beta_ratio": {"value_summary": "...", "interpretation": "...", "clinical_relevance": "..."},
    "frontal_alpha_asymmetry": {"value_summary": "...", "interpretation": "...", "clinical_relevance": "..."},
    "alpha_peak_frequency": {"value_summary": "...", "interpretation": "...", "clinical_relevance": "..."}
  },
  "condition_correlations": ["<condition 1 with explanation>", "<condition 2>", ...],
  "protocol_recommendations": [
    {"modality": "...", "target": "...", "rationale": "...", "evidence_level": "..."}
  ],
  "clinical_flags": ["<any concerning patterns>"],
  "confidence_level": "high|moderate|low",
  "disclaimer": "For research/wellness reference only — verify with a qualified clinician. AI-generated interpretation requires clinician review before clinical use."
}

Rules:
- Be clinically precise and evidence-based
- Reference specific electrode sites and frequency ranges
- Flag any patterns suggestive of unusual findings (focal slowing, asymmetries, epileptiform features)
- Link findings to known qEEG biomarkers for conditions (depression FAA, ADHD TBR, etc.)
- Suggest neuromodulation protocols with targets and rationale (as protocol considerations, NOT treatment recommendations)
- Never state a diagnosis; NEVER use the words "diagnose", "diagnostic", "diagnosis", or "treatment recommendation". Use language like "finding consistent with", "suggestive of", "protocol consideration"
- Cite the numbered references like [1], [2] inside executive_summary and every findings[*].observation when supporting a clinical claim; the citations array for each finding must list only integers that match the reference numbers you were given
- Include the disclaimer in every response"""

# ── Prompt for comparison reports ────────────────────────────────────────────

QEEG_COMPARISON_SYSTEM = """You are DeepSynaps ClinicalAI comparing two qEEG recordings (baseline vs follow-up) for the same patient.

Analyze the changes between recordings and produce a structured comparison report grounded in the numbered literature references provided.

Return a JSON object (only JSON, no markdown wrapper):
{
  "comparison_summary": "<3-5 sentence overview of changes, cite refs as [1][2]>",
  "executive_summary": "<duplicate of comparison_summary for schema compatibility>",
  "findings": [
    {"region": "...", "band": "...", "observation": "<finding with [1] citations>", "citations": [1]}
  ],
  "improvement_areas": [{"region": "...", "band": "...", "change": "...", "clinical_meaning": "..."}],
  "deterioration_areas": [{"region": "...", "band": "...", "change": "...", "clinical_meaning": "..."}],
  "stable_areas": ["<areas with minimal change>"],
  "treatment_response_assessment": "<overall response evaluation>",
  "protocol_adjustment_suggestions": ["<suggestion 1>", "<suggestion 2>"],
  "prognosis_indicators": "<forward-looking notes>",
  "confidence_level": "high|moderate|low",
  "disclaimer": "For research/wellness reference only — verify with a qualified clinician."
}

Rules:
- Quantify changes (percentage, absolute values)
- Interpret changes in context of the patient's condition
- Distinguish meaningful changes from noise
- Suggest protocol adjustments based on observed changes (as protocol considerations, NOT treatment recommendations)
- Never use "diagnose", "diagnostic", "diagnosis", or "treatment recommendation"
- Cite numbered references [1][2] inside the narrative"""

# ── Prompt for prediction reports ────────────────────────────────────────────

QEEG_PREDICTION_SYSTEM = """You are DeepSynaps ClinicalAI generating a response prediction based on a patient's qEEG profile.

Based on known qEEG biomarkers and the numbered literature references provided, predict likely response.

Return a JSON object (only JSON, no markdown wrapper):
{
  "prediction_summary": "<2-3 sentence prediction, cite refs as [1]>",
  "executive_summary": "<duplicate of prediction_summary for schema compatibility>",
  "findings": [
    {"region": "...", "band": "...", "observation": "...", "citations": [1]}
  ],
  "responder_likelihood": "likely|possible|unlikely",
  "confidence": "high|moderate|low",
  "confidence_level": "high|moderate|low",
  "supporting_biomarkers": [{"marker": "...", "value": "...", "prediction_implication": "..."}],
  "recommended_protocol_adjustments": ["<adjustment 1>"],
  "monitoring_recommendations": ["<what to track>"],
  "evidence_basis": ["<key studies or patterns referenced>"],
  "disclaimer": "Predictive analysis for research/wellness reference only. Decisions must be made by qualified clinicians."
}

Rules:
- Never use "diagnose", "diagnostic", "diagnosis", or "treatment recommendation"
- Cite numbered references [1][2] inside the narrative"""


# ── Condition → modality map (top 3) ─────────────────────────────────────────

#: Map from lower-case condition slug to the top-N neuromodulation modalities
#: that are typically considered for that condition. Used to constrain the RAG
#: query so the retrieved abstracts are both condition-relevant and modality-
#: relevant. The list is conservative and evidence-informed; it is NOT a
#: treatment recommendation. Only the top 3 entries per slug are used at call
#: time (see ``_modalities_for_conditions``).
MODALITY_MAP: dict[str, list[str]] = {
    "adhd": ["neurofeedback", "tdcs", "eeg_training"],
    "depression": ["tms", "tdcs", "neurofeedback"],
    "anxiety": ["neurofeedback", "breathwork", "taVNS"],
    "ptsd": ["neurofeedback", "eye_movement", "taVNS"],
    "ocd": ["tms", "neurofeedback", "tdcs"],
    "insomnia": ["neurofeedback", "cranial_estim", "breathwork"],
    "autism": ["neurofeedback", "tdcs", "taVNS"],
    "mild_cognitive_impairment": ["tdcs", "tms", "neurofeedback"],
    "mci": ["tdcs", "tms", "neurofeedback"],
    "alzheimers": ["tdcs", "tms", "photobiomodulation"],
    "dementia": ["tdcs", "tms", "photobiomodulation"],
    "stroke": ["tdcs", "tms", "neurofeedback"],
    "traumatic_brain_injury": ["photobiomodulation", "neurofeedback", "tdcs"],
    "tbi": ["photobiomodulation", "neurofeedback", "tdcs"],
    "chronic_pain": ["tdcs", "tms", "neurofeedback"],
    "fibromyalgia": ["tdcs", "tms", "neurofeedback"],
    "migraine": ["taVNS", "tdcs", "neurofeedback"],
    "epilepsy": ["neurofeedback", "vns", "responsive_stimulation"],
    "addiction": ["tms", "neurofeedback", "tdcs"],
    "substance_use": ["tms", "neurofeedback", "tdcs"],
    "schizophrenia": ["tms", "tdcs", "neurofeedback"],
    "bipolar": ["tms", "tdcs", "neurofeedback"],
    "tinnitus": ["tms", "tdcs", "neurofeedback"],
    "burnout": ["neurofeedback", "breathwork", "hrv_biofeedback"],
    "sleep_apnea": ["cpap", "neurofeedback", "breathwork"],
}

# Default modalities when no condition match is found.
_DEFAULT_MODALITIES: list[str] = ["neurofeedback", "tdcs", "tms"]


# ── Banned-word sanitiser (CONTRACT §6) ──────────────────────────────────────

#: Regulatory rule from scaffold CLAUDE.md + CONTRACT §6: these words must
#: never reach user-facing strings until CE Class IIa is secured. Order matters
#: — longer phrases must match before their single-word subsets.
_BANNED_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\btreatment\s+recommendations?\b", re.IGNORECASE), "protocol consideration"),
    (re.compile(r"\bdiagnoses\b", re.IGNORECASE), "findings"),
    (re.compile(r"\bdiagnosis\b", re.IGNORECASE), "finding"),
    (re.compile(r"\bdiagnostic\b", re.IGNORECASE), "finding-oriented"),
    (re.compile(r"\bdiagnose(s|d)?\b", re.IGNORECASE), "identify"),
]


def _sanitise_banned_words(text: Optional[str]) -> tuple[Optional[str], int]:
    """Replace banned words in-place. Returns (new_text, n_replacements)."""
    if not text or not isinstance(text, str):
        return text, 0
    total = 0
    out = text
    for pat, repl in _BANNED_PATTERNS:
        out, n = pat.subn(repl, out)
        total += n
    return out, total


def _sanitise_report_data(data: dict) -> dict:
    """Scrub ``executive_summary`` + every ``findings[*].observation`` of banned words."""
    if not isinstance(data, dict):
        return data
    total = 0
    exec_sum = data.get("executive_summary")
    new_sum, n1 = _sanitise_banned_words(exec_sum)
    if isinstance(exec_sum, str):
        data["executive_summary"] = new_sum
    total += n1

    findings = data.get("findings")
    if isinstance(findings, list):
        for f in findings:
            if not isinstance(f, dict):
                continue
            obs = f.get("observation")
            new_obs, n = _sanitise_banned_words(obs)
            if isinstance(obs, str):
                f["observation"] = new_obs
            total += n

    if total:
        _log.warning(
            "qeeg_ai_interpreter: sanitised %d banned-word occurrence(s) from LLM output",
            total,
        )
    return data


# ── Feature-dict adapters (legacy ↔ CONTRACT §1.1) ──────────────────────────


def _legacy_band_powers_from_features(features: dict) -> dict:
    """Synthesise the legacy ``band_powers`` dict from a CONTRACT §1.1 features dict.

    The legacy shape is consumed by :func:`match_condition_patterns` and by the
    prompt formatter. We derive ``relative_pct`` from ``relative`` (fraction →
    percent) and expose the same ``channels`` / ``derived_ratios`` layout.
    """
    spectral = (features or {}).get("spectral") or {}
    bands_in = spectral.get("bands") or {}
    freq_windows = {
        "delta": (1.0, 4.0),
        "theta": (4.0, 8.0),
        "alpha": (8.0, 13.0),
        "beta": (13.0, 30.0),
        "gamma": (30.0, 45.0),
    }

    bands_out: dict[str, Any] = {}
    for band, info in bands_in.items():
        abs_map = (info or {}).get("absolute_uv2") or {}
        rel_map = (info or {}).get("relative") or {}
        channels: dict[str, dict[str, float]] = {}
        for ch in sorted(set(abs_map.keys()) | set(rel_map.keys())):
            abs_val = float(abs_map.get(ch, 0.0) or 0.0)
            rel_frac = float(rel_map.get(ch, 0.0) or 0.0)
            channels[ch] = {
                "absolute_uv2": abs_val,
                "relative_pct": rel_frac * 100.0 if rel_frac <= 1.0 else rel_frac,
            }
        bands_out[band] = {
            "hz_range": list(freq_windows.get(band, (0.0, 0.0))),
            "channels": channels,
        }

    # Derived ratios — TBR, FAA, APF
    derived: dict[str, Any] = {}
    theta_rel = (bands_in.get("theta") or {}).get("relative") or {}
    beta_rel = (bands_in.get("beta") or {}).get("relative") or {}
    tbr_channels: dict[str, float] = {}
    for ch in theta_rel:
        b = float(beta_rel.get(ch, 0.0) or 0.0)
        t = float(theta_rel.get(ch, 0.0) or 0.0)
        if b > 0:
            tbr_channels[ch] = round(t / b, 3)
    if tbr_channels:
        derived["theta_beta_ratio"] = {"channels": tbr_channels}

    asymmetry = (features or {}).get("asymmetry") or {}
    faa: dict[str, float] = {}
    if "frontal_alpha_F3_F4" in asymmetry:
        faa["F3_F4"] = float(asymmetry["frontal_alpha_F3_F4"] or 0.0)
    if "frontal_alpha_F7_F8" in asymmetry:
        faa["F7_F8"] = float(asymmetry["frontal_alpha_F7_F8"] or 0.0)
    if faa:
        derived["frontal_alpha_asymmetry"] = faa

    paf = spectral.get("peak_alpha_freq") or {}
    apf_channels = {
        ch: float(v) for ch, v in paf.items() if v is not None
    }
    if apf_channels:
        derived["alpha_peak_frequency"] = {"channels": apf_channels}

    return {
        "bands": bands_out,
        "derived_ratios": derived,
        "_origin": "features_contract_1_1",
    }


def _is_features_shape(payload: dict) -> bool:
    """Detect a CONTRACT §1.1 features dict vs the legacy band_powers dict."""
    if not isinstance(payload, dict):
        return False
    spectral = payload.get("spectral")
    if isinstance(spectral, dict) and isinstance(spectral.get("bands"), dict):
        return True
    return False


# ── Prompt helpers ──────────────────────────────────────────────────────────


def _format_band_powers_for_prompt(band_powers: dict) -> str:
    """Format band powers data into a compact text table for LLM consumption."""
    lines = []
    bands_data = band_powers.get("bands", {})
    for band_name, band_info in bands_data.items():
        hz_range = band_info.get("hz_range", [])
        channels = band_info.get("channels", {})
        if hz_range and len(hz_range) >= 2:
            lines.append(f"\n{band_name.upper()} ({hz_range[0]}-{hz_range[1]} Hz):")
        else:
            lines.append(f"\n{band_name.upper()}:")
        for ch, vals in sorted(channels.items()):
            abs_val = vals.get("absolute_uv2", 0)
            rel_val = vals.get("relative_pct", 0)
            lines.append(f"  {ch}: {abs_val:.2f} uV2 ({rel_val:.1f}%)")

    derived = band_powers.get("derived_ratios", {})
    if derived:
        lines.append("\nDERIVED RATIOS:")
        tbr = derived.get("theta_beta_ratio", {}).get("channels", {})
        if tbr:
            lines.append("  Theta/Beta Ratio:")
            for ch, val in sorted(tbr.items()):
                lines.append(f"    {ch}: {val}")
        faa = derived.get("frontal_alpha_asymmetry", {})
        if faa:
            lines.append("  Frontal Alpha Asymmetry:")
            for pair, val in faa.items():
                lines.append(f"    {pair}: {val}")
        apf = derived.get("alpha_peak_frequency", {}).get("channels", {})
        if apf:
            lines.append("  Alpha Peak Frequency:")
            for ch, val in sorted(apf.items()):
                lines.append(f"    {ch}: {val} Hz")
    return "\n".join(lines)


def _format_zscore_highlights(zscores: Optional[dict]) -> str:
    """Summarise flagged z-scores for the LLM prompt."""
    if not isinstance(zscores, dict):
        return ""
    flagged = zscores.get("flagged") or []
    if not flagged:
        return ""
    lines = ["\nNORMATIVE Z-SCORE FLAGS (|z| >= 1.96):"]
    for entry in flagged[:20]:
        metric = entry.get("metric", "?")
        ch = entry.get("channel", "?")
        z = entry.get("z", 0.0)
        try:
            z_f = float(z)
        except (TypeError, ValueError):
            z_f = 0.0
        lines.append(f"  {metric} @ {ch}: z={z_f:+.2f}")
    norm_ver = zscores.get("norm_db_version")
    if norm_ver:
        lines.append(f"  (normative DB: {norm_ver})")
    return "\n".join(lines)


def _format_quality_summary(quality: Optional[dict]) -> str:
    if not isinstance(quality, dict):
        return ""
    lines = ["\nDATA QUALITY:"]
    if "n_channels_input" in quality:
        lines.append(
            f"  Channels: {quality.get('n_channels_input', '?')} input, "
            f"{quality.get('n_channels_rejected', 0)} rejected "
            f"(bad: {', '.join(quality.get('bad_channels') or []) or 'none'})"
        )
    if "n_epochs_retained" in quality:
        lines.append(
            f"  Epochs retained: {quality.get('n_epochs_retained', '?')} / "
            f"{quality.get('n_epochs_total', '?')}"
        )
    if quality.get("ica_labels_dropped"):
        dropped = ", ".join(
            f"{k}={v}" for k, v in (quality.get("ica_labels_dropped") or {}).items()
        )
        lines.append(f"  ICA components dropped: {dropped}")
    if quality.get("pipeline_version"):
        lines.append(f"  Pipeline: v{quality['pipeline_version']}")
    return "\n".join(lines)


def _format_references_block(refs: list[dict]) -> str:
    """Format numbered literature refs for embedding in the prompt."""
    if not refs:
        return ""
    lines = ["\nLITERATURE REFERENCES (cite these numerically [1]..[N]):"]
    for ref in refs:
        n = ref.get("n")
        title = ref.get("title") or ""
        year = ref.get("year") or ""
        authors = ref.get("authors") or []
        first_author = authors[0] if authors else ""
        abstract = (ref.get("abstract") or "")[:600]
        cite = f"[{n}]"
        header = f"{cite} {title}".strip()
        if first_author or year:
            header += f" ({first_author}{', ' if first_author and year else ''}{year})"
        lines.append(header)
        if abstract:
            lines.append(f"    Abstract: {abstract}")
    return "\n".join(lines)


def _build_literature_refs(rag_results: list[dict]) -> list[dict]:
    """Convert RAG query results into the numbered ``literature_refs`` payload."""
    out: list[dict] = []
    for i, item in enumerate(rag_results, start=1):
        pmid = item.get("pmid") or None
        doi = item.get("doi") or None
        if pmid:
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        elif doi:
            url = f"https://doi.org/{doi}"
        else:
            url = ""
        out.append({
            "n": i,
            "pmid": pmid,
            "doi": doi,
            "title": item.get("title") or "",
            "year": item.get("year"),
            "url": url,
        })
    return out


def _modalities_for_conditions(flagged: list[str]) -> list[str]:
    """Pick the top-3 unique modalities implied by the flagged conditions."""
    seen: list[str] = []
    for cond in flagged or []:
        key = str(cond).strip().lower()
        for mod in MODALITY_MAP.get(key, []):
            if mod not in seen:
                seen.append(mod)
        if len(seen) >= 3:
            break
    if not seen:
        seen = list(_DEFAULT_MODALITIES)
    return seen[:3]


# ── Condition pattern matcher (accepts legacy OR CONTRACT §1.1) ─────────────


def match_condition_patterns(band_powers_or_features: dict) -> list[dict]:
    """Deterministic condition matching against ``qeeg_condition_map.csv``.

    Accepts either the legacy ``band_powers`` dict (with ``bands[band].channels``)
    or a CONTRACT §1.1 ``features`` dict (with ``spectral.bands[band]``). In
    the latter case the input is adapted on-the-fly via
    :func:`_legacy_band_powers_from_features`.

    Returns ranked list of matching conditions with confidence scores.
    """
    from app.services.neuro_csv import list_qeeg_condition_map_from_csv

    if _is_features_shape(band_powers_or_features):
        band_powers = _legacy_band_powers_from_features(band_powers_or_features)
    else:
        band_powers = band_powers_or_features or {}

    condition_map = list_qeeg_condition_map_from_csv()
    bands_data = band_powers.get("bands", {})
    derived = band_powers.get("derived_ratios", {})
    matches: list[dict] = []

    for item in condition_map.items:
        score = 0
        max_score = 0
        evidence_points: list[str] = []

        patterns_text = (item.qeeg_patterns or "").lower()
        key_sites_text = (item.key_qeeg_electrode_sites or "").lower()

        if "theta" in patterns_text and ("frontal" in patterns_text or "fz" in key_sites_text):
            max_score += 1
            theta_data = bands_data.get("theta", {}).get("channels", {})
            fz_theta = theta_data.get("Fz", {}).get("relative_pct", 0)
            if fz_theta > 25:
                score += 1
                evidence_points.append(f"Elevated frontal theta at Fz ({fz_theta:.1f}%)")

        if "asymmetry" in patterns_text or "faa" in patterns_text.replace(" ", ""):
            max_score += 1
            faa = derived.get("frontal_alpha_asymmetry", {})
            f3_f4 = faa.get("F3_F4")
            if f3_f4 is not None:
                if "r>l" in patterns_text or "right" in patterns_text:
                    if f3_f4 > 0.1:
                        score += 1
                        evidence_points.append(f"Right-dominant frontal alpha asymmetry (F3_F4={f3_f4:.3f})")
                elif "l>r" in patterns_text or "left" in patterns_text:
                    if f3_f4 < -0.1:
                        score += 1
                        evidence_points.append(f"Left-dominant frontal alpha asymmetry (F3_F4={f3_f4:.3f})")

        if "theta/beta" in patterns_text or "tbr" in patterns_text:
            max_score += 1
            tbr = derived.get("theta_beta_ratio", {}).get("channels", {})
            cz_tbr = tbr.get("Cz", 0)
            if cz_tbr > 3.0:
                score += 1
                evidence_points.append(f"Elevated theta/beta ratio at Cz ({cz_tbr:.2f})")

        if "alpha" in patterns_text and ("slow" in patterns_text or "apf" in patterns_text):
            max_score += 1
            apf = derived.get("alpha_peak_frequency", {}).get("channels", {})
            mean_apf = sum(apf.values()) / len(apf) if apf else 10.0
            if mean_apf < 9.0:
                score += 1
                evidence_points.append(f"Slowed alpha peak frequency (mean APF={mean_apf:.1f} Hz)")

        if "beta" in patterns_text and ("increas" in patterns_text or "excess" in patterns_text or "elevat" in patterns_text):
            max_score += 1
            beta_data = bands_data.get("beta", {}).get("channels", {})
            avg_beta = sum(v.get("relative_pct", 0) for v in beta_data.values()) / max(len(beta_data), 1)
            if avg_beta > 30:
                score += 1
                evidence_points.append(f"Elevated beta power (avg relative={avg_beta:.1f}%)")

        if "delta" in patterns_text and ("increas" in patterns_text or "slow" in patterns_text or "elevat" in patterns_text):
            max_score += 1
            delta_data = bands_data.get("delta", {}).get("channels", {})
            avg_delta = sum(v.get("relative_pct", 0) for v in delta_data.values()) / max(len(delta_data), 1)
            if avg_delta > 35:
                score += 1
                evidence_points.append(f"Elevated delta power (avg relative={avg_delta:.1f}%)")

        if max_score > 0 and score > 0:
            confidence = round(score / max_score, 2)
            matches.append({
                "condition_id": item.id,
                "condition_name": item.condition_name,
                "confidence": confidence,
                "matched_patterns": score,
                "total_patterns": max_score,
                "evidence": evidence_points,
                "recommended_techniques": item.recommended_neuromod_techniques,
                "stimulation_targets": item.primary_stimulation_targets,
                "network_dysfunction": item.network_dysfunction_pattern,
            })

    matches.sort(key=lambda x: x["confidence"], reverse=True)
    return matches


# ── Main entry point ────────────────────────────────────────────────────────


async def generate_ai_report(
    *,
    band_powers: Optional[dict] = None,
    features: Optional[dict] = None,
    zscores: Optional[dict] = None,
    flagged_conditions: Optional[list[str]] = None,
    quality: Optional[dict] = None,
    patient_context: Optional[str] = None,
    condition_matches: Optional[list[dict]] = None,
    report_type: str = "standard",
    db_session: Optional[Any] = None,
) -> dict[str, Any]:
    """Generate an AI interpretation report grounded in RAG literature.

    Supports both the legacy ``band_powers`` path (Studio's in-house spectral
    analyser) and the new CONTRACT §1.1 ``features`` path (MNE pipeline). When
    ``features`` is provided, a legacy ``band_powers`` dict is derived for
    reuse by the condition-pattern matcher and the prompt formatter.

    Parameters
    ----------
    band_powers
        Legacy Studio band-powers payload. Optional when ``features`` is set.
    features
        CONTRACT §1.1 feature dict (``spectral`` / ``connectivity`` / ...).
    zscores
        CONTRACT §1.2 z-score payload. Flagged metrics drive the LLM prompt.
    flagged_conditions
        Lowercase condition slugs from the pipeline's normative flagging step.
    quality
        CONTRACT §1.3 quality dict (channel/epoch rejection, ICA labels, ...).
    patient_context
        Free-text clinical context supplied by the clinician.
    condition_matches
        Output of :func:`match_condition_patterns`. Computed by caller.
    report_type
        ``"standard"`` | ``"comparison"`` | ``"prediction"``.
    db_session
        Optional SQLAlchemy session for the RAG fallback path.

    Returns
    -------
    dict
        CONTRACT §5.4-shaped payload with ``data``, ``literature_refs``,
        ``model_used``, ``prompt_hash``, ``source``, ``success``.
    """
    from app.services.chat_service import _llm_chat_async
    from app.services import qeeg_rag

    # ── Resolve features ↔ band_powers ───────────────────────────────────
    if features is None and band_powers is None:
        band_powers_local: dict = {}
    elif features is not None:
        band_powers_local = _legacy_band_powers_from_features(features)
    else:
        band_powers_local = band_powers or {}
        # If a caller passed band_powers that actually happens to be a features
        # dict (CONTRACT §1.1 shape), adapt it transparently.
        if _is_features_shape(band_powers_local):
            band_powers_local = _legacy_band_powers_from_features(band_powers_local)

    flagged = [str(c).strip().lower() for c in (flagged_conditions or []) if c]
    # If nothing was flagged upstream but deterministic matching found conditions,
    # use the top matches as the RAG query terms.
    if not flagged and condition_matches:
        flagged = [
            str(m.get("condition_name") or "").strip().lower()
            for m in condition_matches[:3]
            if m.get("condition_name")
        ]

    # ── RAG: fetch top-N literature refs ─────────────────────────────────
    modalities = _modalities_for_conditions(flagged)
    rag_failed = False
    try:
        rag_raw = await qeeg_rag.query_literature(
            conditions=flagged,
            modalities=modalities,
            top_k=10,
            db_session=db_session,
        )
    except Exception as exc:  # pragma: no cover - defensive
        _log.warning(
            "qeeg_rag.query_literature raised (treated as empty): conditions=%s modalities=%s exc=%s: %s",
            flagged, modalities, exc.__class__.__name__, exc,
        )
        rag_raw = []
        rag_failed = True

    if not isinstance(rag_raw, list):
        rag_raw = []
    literature_refs = _build_literature_refs(rag_raw[:10])
    # When RAG returns nothing, the prompt currently says "cite [1]…[N]"
    # with N=0 — the LLM has no anchors and tends to hallucinate citations.
    # Emit a structured note (also surfaced in the audit log via prompt_hash)
    # so the LLM is told explicitly not to cite.
    rag_empty_notice = ""
    if not literature_refs:
        rag_empty_notice = (
            "\n\nNOTE: No literature references were retrieved for this analysis "
            f"({'RAG query failed' if rag_failed else 'no matching corpus papers'}). "
            "Do NOT use bracketed citations [1]..[N] in your output; cite only "
            "from your training data and clearly mark inferences as such."
        )

    # ── Build the LLM prompt ─────────────────────────────────────────────
    powers_text = _format_band_powers_for_prompt(band_powers_local)
    z_text = _format_zscore_highlights(zscores)
    q_text = _format_quality_summary(quality)
    refs_text = _format_references_block(literature_refs)

    user_parts = [f"qEEG Band Power Data:\n{powers_text}"]
    if z_text:
        user_parts.append(z_text)
    if q_text:
        user_parts.append(q_text)
    if flagged:
        user_parts.append("\nPIPELINE-FLAGGED CONDITIONS: " + ", ".join(flagged))
    if patient_context:
        user_parts.append(f"\nPatient Clinical Context:\n{patient_context}")
    if condition_matches:
        top_matches = condition_matches[:5]
        match_text = "\n".join(
            f"  - {m['condition_name']} (confidence: {m['confidence']:.0%}): "
            f"{', '.join(m.get('evidence', [])[:2])}"
            for m in top_matches
        )
        user_parts.append(f"\nDeterministic Condition Pattern Matches:\n{match_text}")
    if refs_text:
        user_parts.append(refs_text)
    if rag_empty_notice:
        user_parts.append(rag_empty_notice)
    if literature_refs:
        user_parts.append(
            "\nRemember: cite the numbered references [1]..[{n}] in your "
            "executive_summary and every findings[*].observation. Never use "
            "'diagnose', 'diagnostic', 'diagnosis', or 'treatment recommendation'.".format(
                n=len(literature_refs)
            )
        )
    else:
        user_parts.append(
            "\nRemember: do NOT use bracketed citations [1]..[N] (no "
            "literature was retrieved). Never use 'diagnose', 'diagnostic', "
            "'diagnosis', or 'treatment recommendation'."
        )

    user_prompt = "\n".join(user_parts)

    system_prompts = {
        "standard": QEEG_ANALYSIS_SYSTEM,
        "comparison": QEEG_COMPARISON_SYSTEM,
        "prediction": QEEG_PREDICTION_SYSTEM,
    }
    system = system_prompts.get(report_type, QEEG_ANALYSIS_SYSTEM)

    prompt_hash = hashlib.sha256((system + user_prompt).encode()).hexdigest()[:16]

    try:
        raw_response = await _llm_chat_async(
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=2048,
            temperature=0.3,
            not_configured_message="",
        )

        if not raw_response:
            return _deterministic_fallback(
                band_powers_local, condition_matches, prompt_hash, literature_refs
            )

        parsed = _safe_parse_json(raw_response)
        if not parsed:
            return _deterministic_fallback(
                band_powers_local, condition_matches, prompt_hash, literature_refs
            )

        # CONTRACT §6: sanitise banned words before returning.
        parsed = _sanitise_report_data(parsed)

        # Ensure findings key exists with correct shape — the frontend expects it.
        if "findings" not in parsed or not isinstance(parsed.get("findings"), list):
            parsed["findings"] = []

        return {
            "success": True,
            "source": "llm",
            "data": parsed,
            "literature_refs": literature_refs,
            "prompt_hash": prompt_hash,
            "model_used": None,
        }

    except Exception as exc:
        _log.warning("qEEG AI report generation failed: %s", exc)
        return _deterministic_fallback(
            band_powers_local, condition_matches, prompt_hash, literature_refs
        )


def _deterministic_fallback(
    band_powers: dict,
    condition_matches: Optional[list[dict]],
    prompt_hash: str,
    literature_refs: Optional[list[dict]] = None,
) -> dict[str, Any]:
    """Generate a structured report without LLM using deterministic analysis."""
    bands = band_powers.get("bands", {})
    derived = band_powers.get("derived_ratios", {})

    band_summaries = {}
    for band_name, band_info in bands.items():
        channels = band_info.get("channels", {})
        if not channels:
            continue
        avg_rel = sum(v.get("relative_pct", 0) for v in channels.values()) / len(channels)
        avg_abs = sum(v.get("absolute_uv2", 0) for v in channels.values()) / len(channels)
        band_summaries[band_name] = {
            "interpretation": f"Average {band_name} power: {avg_abs:.2f} uV2 ({avg_rel:.1f}% relative)",
            "clinical_significance": "See condition matches for clinical interpretation",
            "severity": "normal" if avg_rel < 30 else "mild" if avg_rel < 40 else "moderate",
        }

    condition_correlations = []
    if condition_matches:
        for m in condition_matches[:5]:
            condition_correlations.append(
                f"{m['condition_name']} ({m['confidence']:.0%} match): {'; '.join(m.get('evidence', [])[:2])}"
            )

    data = {
        "executive_summary": "Deterministic analysis — AI narrative unavailable. "
                            "Band powers extracted and condition pattern matching completed. "
                            "Review the numerical data and matched conditions below.",
        "findings": [],
        "band_analysis": band_summaries,
        "key_biomarkers": {},
        "condition_correlations": condition_correlations,
        "protocol_recommendations": [],
        "clinical_flags": [],
        "confidence_level": "low",
        "disclaimer": "Deterministic analysis only — AI interpretation not available. "
                     "For research/wellness reference only — verify with a qualified clinician.",
    }

    tbr = derived.get("theta_beta_ratio", {}).get("channels", {})
    if tbr:
        cz_tbr = tbr.get("Cz", tbr.get(list(tbr.keys())[0], 0) if tbr else 0)
        data["key_biomarkers"]["theta_beta_ratio"] = {
            "value_summary": f"Cz TBR = {cz_tbr:.2f}",
            "interpretation": "Elevated" if cz_tbr > 3.0 else "Normal range",
            "clinical_relevance": "Key ADHD biomarker (TBR > 3.0 suggestive)",
        }

    faa = derived.get("frontal_alpha_asymmetry", {})
    if faa:
        f3_f4 = faa.get("F3_F4")
        if f3_f4 is not None:
            data["key_biomarkers"]["frontal_alpha_asymmetry"] = {
                "value_summary": f"F3-F4 FAA = {f3_f4:.4f}",
                "interpretation": "Right-dominant (depression risk)" if f3_f4 > 0.1
                                 else "Left-dominant" if f3_f4 < -0.1
                                 else "Symmetric",
                "clinical_relevance": "Depression biomarker (positive = R>L frontal alpha)",
            }

    data = _sanitise_report_data(data)

    return {
        "success": True,
        "source": "deterministic_stub",
        "data": data,
        "literature_refs": literature_refs or [],
        "prompt_hash": prompt_hash,
        "model_used": None,
    }


def _safe_parse_json(text: str) -> Optional[dict]:
    """Parse JSON from LLM response, handling markdown code fences."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        return None
