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


async def generate_ai_report(
    band_powers: dict,
    patient_context: Optional[str] = None,
    condition_matches: Optional[list[dict]] = None,
    report_type: str = "standard",
) -> dict[str, Any]:
    """Generate an AI interpretation report using the LLM.

    Falls back to deterministic output if LLM is not configured.
    """
    from app.services.chat_service import _llm_chat_async

    # Build the user prompt
    powers_text = _format_band_powers_for_prompt(band_powers)

    user_parts = [f"qEEG Band Power Data:\n{powers_text}"]

    if patient_context:
        user_parts.append(f"\nPatient Clinical Context:\n{patient_context}")

    if condition_matches:
        top_matches = condition_matches[:5]
        match_text = "\n".join(
            f"  - {m['condition_name']} (confidence: {m['confidence']:.0%}): {', '.join(m['evidence'][:2])}"
            for m in top_matches
        )
        user_parts.append(f"\nDeterministic Condition Pattern Matches:\n{match_text}")

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

    try:
        raw_response = await _llm_chat_async(
            system=system,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=2048,
            temperature=0.3,
            not_configured_message="",
        )

        if not raw_response:
            return _deterministic_fallback(band_powers, condition_matches, prompt_hash)

        # Parse JSON from response
        parsed = _safe_parse_json(raw_response)
        if not parsed:
            return _deterministic_fallback(band_powers, condition_matches, prompt_hash)

        return {
            "success": True,
            "source": "llm",
            "data": parsed,
            "prompt_hash": prompt_hash,
            "model_used": "z-ai/glm-4.5-air:free",
        }

    except Exception as exc:
        _log.warning("qEEG AI report generation failed: %s", exc)
        return _deterministic_fallback(band_powers, condition_matches, prompt_hash)


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
