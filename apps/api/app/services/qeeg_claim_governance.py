"""qEEG Claim Governance Engine.

Labels AI report statements and blocks unsafe claims.
All outputs are decision-support only and require clinician review.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

_log = logging.getLogger(__name__)


# ── Claim type definitions ───────────────────────────────────────────────────
CLAIM_TYPES = ("OBSERVED", "COMPUTED", "INFERRED", "PROTOCOL_LINKED", "UNSUPPORTED", "BLOCKED")

# ── Blocked unsafe patterns ──────────────────────────────────────────────────
# These are regex patterns that must never appear in patient-facing or
# un-reviewed clinical copy.
_BLOCKED_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bdiagnoses?\s+(ADHD|autism|depression|bipolar|anxiety|OCD|PTSD|dementia|epilepsy|schizophrenia)\b", re.IGNORECASE), "BLOCKED_DIAGNOSIS"),
    (re.compile(r"\bconfirms?\s+(ADHD|autism|depression|bipolar|anxiety|OCD|PTSD|dementia|epilepsy|schizophrenia)\b", re.IGNORECASE), "BLOCKED_CONFIRMATION"),
    (re.compile(r"\bproves?\s+(depression|anxiety|ADHD|autism|bipolar|OCD|PTSD|dementia|epilepsy|schizophrenia)\b", re.IGNORECASE), "BLOCKED_PROOF"),
    (re.compile(r"\bguarantees?\s+(treatment\s+response|response|outcome|improvement|cure)\b", re.IGNORECASE), "BLOCKED_GUARANTEE"),
    (re.compile(r"\bcures?\s+(depression|anxiety|ADHD|autism|bipolar|OCD|PTSD|dementia|epilepsy|schizophrenia)\b", re.IGNORECASE), "BLOCKED_CURE"),
    (re.compile(r"\bdisease[- ]?modifying\b(?!.*evidence[- ]?approved)", re.IGNORECASE), "BLOCKED_DISEASE_MODIFYING"),
    (re.compile(r"\bFDA\s+approved?\s+so\s+it\s+works\b", re.IGNORECASE), "BLOCKED_FDA_IMPLIES_EFFICACY"),
    (re.compile(r"\bno\s+side\s+effects\b", re.IGNORECASE), "BLOCKED_NO_SIDE_EFFECTS"),
    (re.compile(r"\btreatment\s+recommendation\b", re.IGNORECASE), "BLOCKED_TREATMENT_REC"),
    (re.compile(r"\bprobability\s+of\s+disease\b", re.IGNORECASE), "BLOCKED_PROB_DISEASE"),
]

# ── Banned words for any clinical-facing output ──────────────────────────────
_BANNED_WORDS = ["diagnose", "diagnostic", "diagnosis", "probability of disease"]
_PATIENT_FACING_INTERNAL_KEYS = {
    "raw_review_handoff",
    "medication_confounds",
    "internal_review_notes",
    "courseware_guidance",
    "local_research",
    "local_grounding",
}


def classify_claims(ai_narrative: dict) -> list[dict]:
    """Walk an AI narrative and label every statement with a claim type.

    Returns a list of finding dicts augmented with ``claim_type`` and
    ``block_reason`` keys.
    """
    findings: list[dict] = []

    # 1. Executive summary
    exec_summary = ai_narrative.get("executive_summary") or ""
    if exec_summary:
        claim_type, block_reason = _classify_text(exec_summary)
        findings.append({
            "section": "executive_summary",
            "finding_text": exec_summary,
            "claim_type": claim_type,
            "block_reason": block_reason,
            "evidence_grade": None,
        })

    # 2. Per-finding observations
    for idx, finding in enumerate(ai_narrative.get("findings") or []):
        obs = finding.get("observation") or ""
        claim_type, block_reason = _classify_text(obs)
        # Citations present → at least PROTOCOL_LINKED or COMPUTED
        citations = finding.get("citations") or []
        if claim_type != "BLOCKED" and citations:
            # If it mentions a protocol or target, mark PROTOCOL_LINKED
            if _mentions_protocol(obs):
                claim_type = "PROTOCOL_LINKED"
            elif _is_numeric_measurement(obs):
                claim_type = "COMPUTED"
            else:
                claim_type = "INFERRED"
        elif claim_type != "BLOCKED" and _is_numeric_measurement(obs):
            claim_type = "OBSERVED"
        elif claim_type != "BLOCKED":
            claim_type = "INFERRED"

        findings.append({
            "section": f"findings[{idx}]",
            "finding_text": obs,
            "claim_type": claim_type,
            "block_reason": block_reason,
            "evidence_grade": None,
            "citations": citations,
        })

    # 3. Condition correlations
    for idx, corr in enumerate(ai_narrative.get("condition_correlations") or []):
        text = corr if isinstance(corr, str) else str(corr)
        claim_type, block_reason = _classify_text(text)
        if claim_type != "BLOCKED":
            claim_type = "INFERRED"
        findings.append({
            "section": f"condition_correlations[{idx}]",
            "finding_text": text,
            "claim_type": claim_type,
            "block_reason": block_reason,
            "evidence_grade": None,
        })

    # 4. Protocol recommendations
    for idx, proto in enumerate(ai_narrative.get("protocol_recommendations") or []):
        text = proto.get("rationale") or ""
        claim_type, block_reason = _classify_text(text)
        if claim_type != "BLOCKED":
            claim_type = "PROTOCOL_LINKED"
        findings.append({
            "section": f"protocol_recommendations[{idx}]",
            "finding_text": text,
            "claim_type": claim_type,
            "block_reason": block_reason,
            "evidence_grade": proto.get("evidence_level") or None,
        })

    blocked = [f for f in findings if f["claim_type"] == "BLOCKED"]
    if blocked:
        _log.warning(
            "qeeg_claim_blocked",
            extra={
                "event": "qeeg_claim_blocked",
                "blocked_count": len(blocked),
                "block_reasons": list({f["block_reason"] for f in blocked if f["block_reason"]}),
                "sections": [f["section"] for f in blocked],
            },
        )

    # 5. Band analysis interpretations
    for band, payload in (ai_narrative.get("band_analysis") or {}).items():
        interp = payload.get("interpretation") or ""
        claim_type, block_reason = _classify_text(interp)
        if claim_type != "BLOCKED":
            claim_type = "INFERRED"
        findings.append({
            "section": f"band_analysis.{band}",
            "finding_text": interp,
            "claim_type": claim_type,
            "block_reason": block_reason,
            "evidence_grade": None,
        })

    # 6. Key biomarkers
    for biomarker, payload in (ai_narrative.get("key_biomarkers") or {}).items():
        text = payload.get("interpretation") or ""
        claim_type, block_reason = _classify_text(text)
        if claim_type != "BLOCKED":
            claim_type = "COMPUTED"
        findings.append({
            "section": f"key_biomarkers.{biomarker}",
            "finding_text": text,
            "claim_type": claim_type,
            "block_reason": block_reason,
            "evidence_grade": None,
        })

    return findings


def sanitize_for_patient(report: dict) -> dict:
    """Produce a patient-safe version of an AI report.

    - Removes BLOCKED claims entirely.
    - Softens INFERRED claims with hedges.
    - Removes technical jargon (z-scores, coherence, etc.).
    - Adds decision-support disclaimer.
    """
    sanitized: dict[str, Any] = {"disclaimer": "This is a research/wellness summary. Please discuss with your clinician."}

    # Copy safe top-level fields
    for key in ("confidence_level", "clinical_flags"):
        if key in report:
            sanitized[key] = report[key]

    # Executive summary — strip blocked / technical language
    exec_summary = report.get("executive_summary") or ""
    exec_summary = _soften_text(_remove_blocked(exec_summary))
    exec_summary = _remove_technical_jargon(exec_summary)
    sanitized["executive_summary"] = exec_summary

    # Findings — keep only safe ones, soften language
    safe_findings: list[dict] = []
    for finding in report.get("findings") or []:
        text = finding.get("observation") or ""
        if _is_blocked(text):
            continue
        text = _soften_text(_remove_technical_jargon(text))
        safe_findings.append({
            "region": finding.get("region"),
            "observation": text,
        })
    sanitized["findings"] = safe_findings

    # Protocol recommendations — simplified
    safe_protocols: list[dict] = []
    for proto in report.get("protocol_recommendations") or []:
        safe_protocols.append({
            "modality": proto.get("modality"),
            "target": proto.get("target"),
            "rationale": _soften_text(proto.get("rationale") or ""),
        })
    sanitized["protocol_recommendations"] = safe_protocols

    # Remove condition correlations (too inferred for patients)
    # Keep band analysis at high level only
    band_summary: dict[str, str] = {}
    for band, payload in (report.get("band_analysis") or {}).items():
        sev = payload.get("severity") or "unknown"
        band_summary[band] = f"{band.title()} activity appears {sev}."
    sanitized["band_summary"] = band_summary

    return _scrub_patient_facing_payload(sanitized)


def resolve_patient_facing_report(
    *,
    ai_narrative_json: Optional[str] = None,
    report_payload: Optional[str] = None,
    patient_facing_report_json: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Resolve the safest patient-facing payload from available report fields.

    Order matters:
    1. Current clinician AI narrative, re-sanitized on read
    2. Legacy report payload, re-sanitized on read
    3. Stored patient-facing payload, re-sanitized on read
    """
    for raw in (ai_narrative_json, report_payload, patient_facing_report_json):
        decoded = _load_json_dict(raw)
        if decoded is not None:
            return sanitize_for_patient(decoded)
    return None


def scan_for_banned_words(text: str) -> list[str]:
    """Return list of banned words found in text (case-insensitive)."""
    found: list[str] = []
    lowered = text.lower()
    for word in _BANNED_WORDS:
        if word.lower() in lowered:
            found.append(word)
    return found


# ── Internal helpers ─────────────────────────────────────────────────────────

def _classify_text(text: str) -> tuple[str, Optional[str]]:
    for pattern, reason in _BLOCKED_PATTERNS:
        if pattern.search(text):
            return "BLOCKED", reason
    return "INFERRED", None


def _is_blocked(text: str) -> bool:
    return _classify_text(text)[0] == "BLOCKED"


def _remove_blocked(text: str) -> str:
    # If the whole text is blocked, return a safe replacement
    if _is_blocked(text):
        return "[Content removed — requires clinician review.]"
    return text


def _is_numeric_measurement(text: str) -> bool:
    return bool(re.search(r"\d+\.?\d*\s*(µV²|uV2|Hz|z-score|z score|%|percent)", text))


def _mentions_protocol(text: str) -> bool:
    return bool(re.search(r"\b(rTMS|tDCS|tACS|tRNS|CES|VNS|DBS|protocol|target|montage)\b", text, re.IGNORECASE))


def _soften_text(text: str) -> str:
    replacements = [
        (r"\bis\s+consistent\s+with\b", "may be consistent with"),
        (r"\bindicates\b", "may suggest"),
        (r"\bsuggests\b", "may suggest"),
        (r"\bshows\b", "appears to show"),
        (r"\bevidence\s+of\b", "possible evidence of"),
        (r"\bconsistent\s+with\b", "possibly consistent with"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def _remove_technical_jargon(text: str) -> str:
    # Replace technical terms with plain language or remove them
    replacements = [
        (r"z-score\s+of\s+-?\d+\.?\d*", ""),
        (r"\bz-score\b", "deviation from typical"),
        (r"\bcoherence\b", "connection pattern"),
        (r"\bconnectivity\b", "connection pattern"),
        (r"\bspectral\s+power\b", "activity level"),
        (r"\babsolute\s+power\b", "activity level"),
        (r"\brelative\s+power\b", "proportion of activity"),
        (r"\bμV²\b", ""),
        (r"\buV2\b", ""),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    # Clean up extra spaces
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _scrub_patient_facing_payload(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for key, item in value.items():
            if key in _PATIENT_FACING_INTERNAL_KEYS:
                continue
            cleaned[key] = _scrub_patient_facing_payload(item)
        return cleaned
    if isinstance(value, list):
        return [_scrub_patient_facing_payload(item) for item in value]
    return value


def _load_json_dict(raw: Optional[str]) -> Optional[dict[str, Any]]:
    if not raw:
        return None
    try:
        decoded = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return decoded if isinstance(decoded, dict) else None
