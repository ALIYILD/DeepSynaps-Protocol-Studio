"""AI-powered qEEG interpretation engine.

Generates clinical narratives from extracted band powers using LLM (GLM/Anthropic),
performs deterministic condition pattern matching against the qEEG condition map,
and links to relevant literature.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional

_log = logging.getLogger(__name__)

# ── System prompt for qEEG analysis ──────────────────────────────────────────

QEEG_ANALYSIS_SYSTEM = """You are DeepSynaps ClinicalAI, a specialist in quantitative EEG (qEEG) analysis and clinical interpretation for neuromodulation treatment planning.

You are analyzing extracted qEEG band power data from a patient's EDF recording. The data includes absolute and relative power values for each standard 10-20 electrode across frequency bands (delta, theta, alpha, beta, gamma).

Your task: produce a comprehensive, structured clinical interpretation.

Return a JSON object (only JSON, no markdown wrapper):
{
  "executive_summary": "<3-5 sentence clinical overview>",
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
  "disclaimer": "For clinical reference only — verify with a qualified clinician. AI-generated interpretation requires clinician review before clinical use."
}

Rules:
- Be clinically precise and evidence-based
- Reference specific electrode sites and frequency ranges
- Flag any patterns suggestive of pathology (focal slowing, asymmetries, epileptiform features)
- Link findings to known qEEG biomarkers for conditions (depression FAA, ADHD TBR, etc.)
- Suggest neuromodulation protocols with targets and rationale
- Never state a diagnosis; use language like "consistent with", "suggestive of"
- Include the disclaimer in every response"""

# ── Prompt for comparison reports ────────────────────────────────────────────

QEEG_COMPARISON_SYSTEM = """You are DeepSynaps ClinicalAI comparing two qEEG recordings (baseline vs follow-up) for the same patient.

Analyze the changes between recordings and produce a structured comparison report.

Return a JSON object (only JSON, no markdown wrapper):
{
  "comparison_summary": "<3-5 sentence overview of changes>",
  "improvement_areas": [{"region": "...", "band": "...", "change": "...", "clinical_meaning": "..."}],
  "deterioration_areas": [{"region": "...", "band": "...", "change": "...", "clinical_meaning": "..."}],
  "stable_areas": ["<areas with minimal change>"],
  "treatment_response_assessment": "<overall response evaluation>",
  "protocol_adjustment_suggestions": ["<suggestion 1>", "<suggestion 2>"],
  "prognosis_indicators": "<forward-looking clinical notes>",
  "disclaimer": "For clinical reference only — verify with a qualified clinician."
}

Rules:
- Quantify changes (percentage, absolute values)
- Interpret changes in context of the patient's condition
- Distinguish clinically meaningful changes from noise
- Suggest protocol adjustments based on observed changes"""

# ── Prompt for prediction reports ────────────────────────────────────────────

QEEG_PREDICTION_SYSTEM = """You are DeepSynaps ClinicalAI generating a treatment response prediction based on a patient's qEEG profile.

Based on known qEEG biomarkers and the latest evidence, predict likely treatment response.

Return a JSON object (only JSON, no markdown wrapper):
{
  "prediction_summary": "<2-3 sentence prediction>",
  "responder_likelihood": "likely|possible|unlikely",
  "confidence": "high|moderate|low",
  "supporting_biomarkers": [{"marker": "...", "value": "...", "prediction_implication": "..."}],
  "recommended_protocol_adjustments": ["<adjustment 1>"],
  "monitoring_recommendations": ["<what to track>"],
  "evidence_basis": ["<key studies or patterns referenced>"],
  "disclaimer": "Predictive analysis for clinical reference only. Treatment decisions must be made by qualified clinicians."
}"""


def _format_band_powers_for_prompt(band_powers: dict) -> str:
    """Format band powers data into a compact text table for LLM consumption."""
    lines = []
    bands_data = band_powers.get("bands", {})
    for band_name, band_info in bands_data.items():
        hz_range = band_info.get("hz_range", [])
        channels = band_info.get("channels", {})
        lines.append(f"\n{band_name.upper()} ({hz_range[0]}-{hz_range[1]} Hz):")
        for ch, vals in sorted(channels.items()):
            abs_val = vals.get("absolute_uv2", 0)
            rel_val = vals.get("relative_pct", 0)
            lines.append(f"  {ch}: {abs_val:.2f} uV2 ({rel_val:.1f}%)")

    # Derived ratios
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


def match_condition_patterns(band_powers: dict) -> list[dict]:
    """Deterministic condition matching against qeeg_condition_map.csv patterns.

    Compares extracted band powers against known qEEG signatures for 24 conditions.
    Returns ranked list of matching conditions with confidence scores.
    """
    from app.services.neuro_csv import list_qeeg_condition_map_from_csv

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

        # Check theta elevation (frontal)
        if "theta" in patterns_text and ("frontal" in patterns_text or "fz" in key_sites_text):
            max_score += 1
            theta_data = bands_data.get("theta", {}).get("channels", {})
            fz_theta = theta_data.get("Fz", {}).get("relative_pct", 0)
            if fz_theta > 25:  # Elevated frontal theta
                score += 1
                evidence_points.append(f"Elevated frontal theta at Fz ({fz_theta:.1f}%)")

        # Check alpha asymmetry
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

        # Check theta/beta ratio elevation
        if "theta/beta" in patterns_text or "tbr" in patterns_text:
            max_score += 1
            tbr = derived.get("theta_beta_ratio", {}).get("channels", {})
            cz_tbr = tbr.get("Cz", 0)
            if cz_tbr > 3.0:
                score += 1
                evidence_points.append(f"Elevated theta/beta ratio at Cz ({cz_tbr:.2f})")

        # Check alpha slowing (APF)
        if "alpha" in patterns_text and ("slow" in patterns_text or "apf" in patterns_text):
            max_score += 1
            apf = derived.get("alpha_peak_frequency", {}).get("channels", {})
            mean_apf = sum(apf.values()) / len(apf) if apf else 10.0
            if mean_apf < 9.0:
                score += 1
                evidence_points.append(f"Slowed alpha peak frequency (mean APF={mean_apf:.1f} Hz)")

        # Check beta elevation
        if "beta" in patterns_text and ("increas" in patterns_text or "excess" in patterns_text or "elevat" in patterns_text):
            max_score += 1
            beta_data = bands_data.get("beta", {}).get("channels", {})
            avg_beta = sum(v.get("relative_pct", 0) for v in beta_data.values()) / max(len(beta_data), 1)
            if avg_beta > 30:
                score += 1
                evidence_points.append(f"Elevated beta power (avg relative={avg_beta:.1f}%)")

        # Check delta elevation
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

    # Sort by confidence descending
    matches.sort(key=lambda x: x["confidence"], reverse=True)
    return matches


# ── Condition → modality mapping (CONTRACT §5, scaffold report/rag.py) ──────
# Top 3 modalities implied by each flagged condition slug. Used to narrow the
# literature RAG query. Keys are lowercase slugs emitted by the pipeline.
_CONDITION_MODALITY_MAP: dict[str, list[str]] = {
    "depression":   ["tdcs", "rtms", "neurofeedback"],
    "adhd":         ["neurofeedback", "tdcs"],
    "anxiety":      ["neurofeedback", "hrv", "ces"],
    "ptsd":         ["emdr", "neurofeedback", "tdcs"],
    "chronic_pain": ["tdcs", "tens", "neurofeedback"],
}
_DEFAULT_MODALITIES: list[str] = ["neurofeedback", "tdcs", "rtms"]


def _modalities_for_conditions(flagged_conditions: Optional[list[str]]) -> list[str]:
    """Return the union of top-3 modalities implied by flagged conditions.

    Parameters
    ----------
    flagged_conditions : list of str or None
        Lowercase condition slugs as emitted by the pipeline
        (``adhd``, ``depression``, ``anxiety``, ``ptsd``, ``chronic_pain``).

    Returns
    -------
    list of str
        De-duplicated modality slugs preserving insertion order. If the
        input is empty or no known conditions match, returns the default
        ``["neurofeedback", "tdcs", "rtms"]``.
    """
    if not flagged_conditions:
        return list(_DEFAULT_MODALITIES)
    out: list[str] = []
    seen: set[str] = set()
    for cond in flagged_conditions:
        mods = _CONDITION_MODALITY_MAP.get((cond or "").lower())
        if not mods:
            continue
        for m in mods:
            if m not in seen:
                seen.add(m)
                out.append(m)
    return out or list(_DEFAULT_MODALITIES)


def _format_features_for_prompt(features: dict) -> str:
    """Format the new MNE-pipeline ``features`` dict into a compact text block.

    Parameters
    ----------
    features : dict
        CONTRACT §1.1 feature dict (spectral / connectivity / asymmetry / …).

    Returns
    -------
    str
        Multi-line string suitable for inclusion in the LLM user prompt.
    """
    lines: list[str] = []
    spectral = (features or {}).get("spectral", {}) or {}
    aperiodic = spectral.get("aperiodic") or {}
    if aperiodic:
        slope = aperiodic.get("slope") or {}
        if slope:
            avg_slope = sum(slope.values()) / max(len(slope), 1)
            lines.append(f"Aperiodic 1/f slope (mean across channels): {avg_slope:.3f}")
    paf = spectral.get("peak_alpha_freq") or {}
    if paf:
        vals = [v for v in paf.values() if v is not None]
        if vals:
            lines.append(f"Peak alpha frequency (mean): {sum(vals)/len(vals):.2f} Hz")
    asymmetry = (features or {}).get("asymmetry", {}) or {}
    for key, val in asymmetry.items():
        lines.append(f"{key}: {val:.4f}")
    source = (features or {}).get("source", {}) or {}
    if source.get("method"):
        lines.append(f"Source method: {source.get('method')}")
    return "\n".join(lines) if lines else "(no advanced features present)"


def _format_zscores_for_prompt(zscores: dict) -> str:
    """Format the top |z| findings from the normative z-score dict."""
    if not zscores:
        return "(no normative z-scores present)"
    flagged = zscores.get("flagged") or []
    if not flagged:
        return "No channels exceed |z| ≥ 1.96."
    lines = ["Top normative deviations:"]
    for item in flagged[:10]:
        metric = item.get("metric", "?")
        ch = item.get("channel", "?")
        z = item.get("z", 0.0)
        lines.append(f"  {metric} @ {ch}: z = {z:+.2f}")
    return "\n".join(lines)


def _format_quality_for_prompt(quality: dict) -> str:
    """Format the quality dict into a single-line summary."""
    if not quality:
        return ""
    parts = []
    if quality.get("n_epochs_retained") is not None:
        parts.append(f"retained_epochs={quality.get('n_epochs_retained')}")
    if quality.get("n_channels_rejected") is not None:
        parts.append(f"rejected_channels={quality.get('n_channels_rejected')}")
    if quality.get("ica_components_dropped") is not None:
        parts.append(f"ics_dropped={quality.get('ica_components_dropped')}")
    if quality.get("pipeline_version"):
        parts.append(f"pipeline_version={quality.get('pipeline_version')}")
    return "Quality: " + ", ".join(parts) if parts else ""


def _format_literature_for_prompt(refs: list[dict]) -> str:
    """Render the RAG literature hits as numbered citation anchors."""
    if not refs:
        return ""
    lines = ["Literature context (cite as [n]):"]
    for idx, paper in enumerate(refs[:10], start=1):
        title = paper.get("title") or "(untitled)"
        year = paper.get("year") or "?"
        journal = paper.get("journal") or ""
        abstract = (paper.get("abstract") or "")[:500]
        lines.append(f"[{idx}] {title} ({journal} {year})\n    {abstract}")
    return "\n".join(lines)


def _build_literature_refs(refs: list[dict]) -> list[dict]:
    """Return the CONTRACT §5.4 ``literature_refs`` shape with numbered hits."""
    out: list[dict] = []
    for idx, paper in enumerate(refs[:10], start=1):
        pmid = paper.get("pmid")
        doi = paper.get("doi")
        if pmid:
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        elif doi:
            url = f"https://doi.org/{doi}"
        else:
            url = None
        out.append(
            {
                "n": idx,
                "pmid": pmid,
                "doi": doi,
                "title": paper.get("title"),
                "year": paper.get("year"),
                "url": url,
            }
        )
    return out


def _synthesise_band_powers_from_features(features: dict) -> dict:
    """Build a legacy ``band_powers`` dict from the new features shape.

    Used when callers pass ``features`` but omit ``band_powers`` — keeps the
    legacy deterministic fallback / condition-matching code paths working.
    """
    spectral = (features or {}).get("spectral", {}) or {}
    bands_in = spectral.get("bands", {}) or {}
    FREQ_BANDS = {
        "delta": [1.0, 4.0],
        "theta": [4.0, 8.0],
        "alpha": [8.0, 13.0],
        "beta": [13.0, 30.0],
        "gamma": [30.0, 45.0],
    }
    legacy_bands: dict[str, Any] = {}
    for band_name, band_info in bands_in.items():
        abs_map = (band_info or {}).get("absolute_uv2", {}) or {}
        rel_map = (band_info or {}).get("relative", {}) or {}
        ch_out: dict[str, Any] = {}
        for ch in set(abs_map) | set(rel_map):
            ch_out[ch] = {
                "absolute_uv2": float(abs_map.get(ch, 0.0) or 0.0),
                "relative_pct": float(rel_map.get(ch, 0.0) or 0.0) * 100.0,
            }
        legacy_bands[band_name] = {
            "hz_range": FREQ_BANDS.get(band_name, [0.0, 0.0]),
            "channels": ch_out,
        }
    derived: dict[str, Any] = {}
    asym = (features or {}).get("asymmetry", {}) or {}
    faa = {}
    if "frontal_alpha_F3_F4" in asym:
        faa["F3_F4"] = float(asym["frontal_alpha_F3_F4"])
    if "frontal_alpha_F7_F8" in asym:
        faa["F7_F8"] = float(asym["frontal_alpha_F7_F8"])
    if faa:
        derived["frontal_alpha_asymmetry"] = faa
    paf = spectral.get("peak_alpha_freq") or {}
    if paf:
        derived["alpha_peak_frequency"] = {
            "channels": {ch: v for ch, v in paf.items() if v is not None}
        }
    return {"bands": legacy_bands, "derived_ratios": derived}


def _query_rag_literature(
    flagged_conditions: Optional[list[str]],
    modalities: list[str],
) -> tuple[list[dict], bool]:
    """Call ``deepsynaps_qeeg.report.rag.query_literature`` with graceful fallback.

    Parameters
    ----------
    flagged_conditions : list of str or None
        Lowercase condition slugs.
    modalities : list of str
        Lowercase modality slugs (top 3 per condition, de-duplicated).

    Returns
    -------
    (list of dict, bool)
        Tuple of (literature hits, grounded_flag). ``grounded_flag`` is
        ``True`` iff RAG returned a non-empty list; callers use it to
        decide whether to append ``"qeeg_rag_literature"`` to the audit
        sources or label the report as non-grounded.
    """
    try:
        from deepsynaps_qeeg.report.rag import query_literature  # type: ignore
    except Exception as exc:
        _log.info(
            "deepsynaps_qeeg.report.rag unavailable (%s); "
            "AI report will be non-grounded.",
            exc,
        )
        return ([], False)

    try:
        hits = query_literature(
            list(flagged_conditions or []),
            modalities=list(modalities or []),
            top_k=10,
        )
    except Exception as exc:
        _log.warning("RAG query_literature failed: %s", exc)
        return ([], False)

    if not isinstance(hits, list):
        return ([], False)
    return (hits, bool(hits))


async def generate_ai_report(
    band_powers: Optional[dict] = None,
    patient_context: Optional[str] = None,
    condition_matches: Optional[list[dict]] = None,
    report_type: str = "standard",
    *,
    features: Optional[dict] = None,
    zscores: Optional[dict] = None,
    flagged_conditions: Optional[list[str]] = None,
    quality: Optional[dict] = None,
) -> dict[str, Any]:
    """Generate an AI interpretation report using the LLM.

    Accepts the legacy ``band_powers`` argument as well as the new MNE-pipeline
    kwargs (``features``, ``zscores``, ``flagged_conditions``, ``quality``).
    When ``features`` is supplied without ``band_powers``, a legacy
    band-powers dict is synthesised from ``features.spectral.bands`` so
    deterministic fallback / condition-matching keeps working.

    When the new kwargs are present, a RAG query is run against
    ``deepsynaps_qeeg.report.rag.query_literature`` and the top-10 papers
    are embedded into the prompt with numbered citation anchors ``[1]..[10]``.

    Parameters
    ----------
    band_powers : dict, optional
        Legacy band-powers dict (see ``_format_band_powers_for_prompt``).
    patient_context : str, optional
        Free-text clinical context (wrapped survey JSON etc.).
    condition_matches : list of dict, optional
        Deterministic condition matches from
        :func:`match_condition_patterns`.
    report_type : str
        One of ``standard`` | ``comparison`` | ``prediction``.
    features : dict, optional
        MNE-pipeline features dict (CONTRACT §1.1).
    zscores : dict, optional
        MNE-pipeline normative z-score dict (CONTRACT §1.2).
    flagged_conditions : list of str, optional
        Lowercase condition slugs flagged by the pipeline.
    quality : dict, optional
        Pipeline quality dict (CONTRACT §1.3).

    Returns
    -------
    dict
        The CONTRACT §5.4 shape::

            {
              "data": {...},
              "literature_refs": [{"n": 1, "pmid": ..., "doi": ..., ...}],
              "model_used": str,
              "prompt_hash": str,
            }

        Legacy keys ``success`` / ``source`` are kept for backward
        compatibility with existing call sites.
    """
    from app.services.chat_service import _llm_chat_async

    # Legacy compat: synthesise band_powers from features if the caller omitted it.
    if not band_powers and features:
        band_powers = _synthesise_band_powers_from_features(features)
    if band_powers is None:
        band_powers = {}

    # Build the user prompt
    powers_text = _format_band_powers_for_prompt(band_powers)

    user_parts = [f"qEEG Band Power Data:\n{powers_text}"]

    if features:
        user_parts.append(f"\nAdvanced Features:\n{_format_features_for_prompt(features)}")

    if zscores:
        user_parts.append(f"\nNormative Z-scores:\n{_format_zscores_for_prompt(zscores)}")

    if quality:
        q_line = _format_quality_for_prompt(quality)
        if q_line:
            user_parts.append(f"\n{q_line}")

    if flagged_conditions:
        user_parts.append(
            "\nPipeline-flagged conditions (research/wellness): "
            + ", ".join(flagged_conditions)
        )

    if patient_context:
        user_parts.append(f"\nPatient Clinical Context:\n{patient_context}")

    if condition_matches:
        top_matches = condition_matches[:5]
        match_text = "\n".join(
            f"  - {m['condition_name']} (confidence: {m['confidence']:.0%}): {', '.join(m['evidence'][:2])}"
            for m in top_matches
        )
        user_parts.append(f"\nDeterministic Condition Pattern Matches:\n{match_text}")

    # RAG literature — only query when we have advanced context (features /
    # zscores / flagged_conditions). The module-missing fallback returns
    # (empty_list, False).
    literature_hits: list[dict] = []
    grounded = False
    if features or zscores or flagged_conditions:
        modalities = _modalities_for_conditions(flagged_conditions)
        literature_hits, grounded = _query_rag_literature(flagged_conditions, modalities)
        lit_block = _format_literature_for_prompt(literature_hits)
        if lit_block:
            user_parts.append("\n" + lit_block)

    user_prompt = "\n".join(user_parts)

    # Select system prompt based on report type
    system_prompts = {
        "standard": QEEG_ANALYSIS_SYSTEM,
        "comparison": QEEG_COMPARISON_SYSTEM,
        "prediction": QEEG_PREDICTION_SYSTEM,
    }
    system = system_prompts.get(report_type, QEEG_ANALYSIS_SYSTEM)

    # Compute prompt hash for audit
    prompt_hash = hashlib.sha256((system + user_prompt).encode()).hexdigest()[:16]

    literature_refs = _build_literature_refs(literature_hits)

    try:
        raw_response = await _llm_chat_async(
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=2048,
            temperature=0.3,
            not_configured_message="",
        )

        if not raw_response:
            fallback = _deterministic_fallback(band_powers, condition_matches, prompt_hash)
            fallback["literature_refs"] = literature_refs
            if not grounded:
                fallback["model_used"] = (fallback.get("model_used") or "deterministic") + " (non-grounded)"
            return fallback

        # Parse JSON from response
        parsed = _safe_parse_json(raw_response)
        if not parsed:
            fallback = _deterministic_fallback(band_powers, condition_matches, prompt_hash)
            fallback["literature_refs"] = literature_refs
            if not grounded:
                fallback["model_used"] = (fallback.get("model_used") or "deterministic") + " (non-grounded)"
            return fallback

        model_used = "z-ai/glm-4.5-air:free"
        if not grounded:
            model_used = model_used + " (non-grounded)"

        return {
            "success": True,
            "source": "llm",
            "data": parsed,
            "literature_refs": literature_refs,
            "prompt_hash": prompt_hash,
            "model_used": model_used,
        }

    except Exception as exc:
        _log.warning("qEEG AI report generation failed: %s", exc)
        fallback = _deterministic_fallback(band_powers, condition_matches, prompt_hash)
        fallback["literature_refs"] = literature_refs
        if not grounded:
            fallback["model_used"] = (fallback.get("model_used") or "deterministic") + " (non-grounded)"
        return fallback


def _deterministic_fallback(
    band_powers: dict,
    condition_matches: Optional[list[dict]],
    prompt_hash: str,
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
                f"{m['condition_name']} ({m['confidence']:.0%} match): {'; '.join(m['evidence'][:2])}"
            )

    data = {
        "executive_summary": "Deterministic analysis — AI narrative unavailable. "
                            "Band powers extracted and condition pattern matching completed. "
                            "Review the numerical data and matched conditions below.",
        "band_analysis": band_summaries,
        "key_biomarkers": {},
        "condition_correlations": condition_correlations,
        "protocol_recommendations": [],
        "clinical_flags": [],
        "confidence_level": "low",
        "disclaimer": "Deterministic analysis only — AI interpretation not available. "
                     "For clinical reference only — verify with a qualified clinician.",
    }

    # Add biomarker summaries
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

    return {
        "success": True,
        "source": "deterministic_stub",
        "data": data,
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
