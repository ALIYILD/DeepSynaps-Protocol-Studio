"""MRI Claim Governance Engine.

Labels AI-generated statements and blocks unsafe claims.
All outputs are decision-support only and require clinician review.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

_log = logging.getLogger(__name__)

CLAIM_TYPES = ("OBSERVED", "COMPUTED", "INFERRED", "RADIOLOGY_REVIEW_REQUIRED", "PROTOCOL_LINKED", "UNSUPPORTED", "BLOCKED")

_BLOCKED_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bMRI\s+confirms?\s+(dementia|ADHD|autism|depression|bipolar|anxiety|OCD|PTSD|schizophrenia|epilepsy|stroke|tumou?r)\b", re.IGNORECASE), "BLOCKED_MRI_CONFIRMS_DISEASE"),
    (re.compile(r"\bMRI\s+diagnoses?\s+(dementia|ADHD|autism|depression|bipolar|anxiety|OCD|PTSD|schizophrenia|epilepsy|stroke|tumou?r)\b", re.IGNORECASE), "BLOCKED_MRI_DIAGNOSIS"),
    (re.compile(r"\blesion\s+detected\b", re.IGNORECASE), "BLOCKED_LESION_DETECTED"),
    (re.compile(r"\btumou?r\s+detected\b", re.IGNORECASE), "BLOCKED_TUMOUR_DETECTED"),
    (re.compile(r"\bstroke\s+detected\b", re.IGNORECASE), "BLOCKED_STROKE_DETECTED"),
    (re.compile(r"\bno\s+abnormalit(?:y|ies)\b", re.IGNORECASE), "BLOCKED_NO_ABNORMALITY"),
    (re.compile(r"\bsafe\s+to\s+treat\b", re.IGNORECASE), "BLOCKED_SAFE_TO_TREAT"),
    (re.compile(r"\bguaranteed?\s+(response|outcome|improvement)\b", re.IGNORECASE), "BLOCKED_GUARANTEE"),
    (re.compile(r"\bno\s+side\s+effects\b", re.IGNORECASE), "BLOCKED_NO_SIDE_EFFECTS"),
    (re.compile(r"\bprobability\s+of\s+disease\b", re.IGNORECASE), "BLOCKED_PROB_DISEASE"),
]

_BANNED_WORDS = ["diagnose", "diagnostic", "diagnosis", "lesion detected", "tumour detected", "tumor detected", "stroke detected", "safe to treat"]


def classify_mri_claims(ai_narrative: dict) -> list[dict]:
    """Walk an MRI AI narrative and label every statement with a claim type."""
    findings: list[dict] = []

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

    for idx, finding in enumerate(ai_narrative.get("findings") or []):
        obs = finding.get("observation") or ""
        claim_type, block_reason = _classify_text(obs)
        citations = finding.get("citations") or []
        if claim_type != "BLOCKED" and citations:
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

    blocked = [f for f in findings if f["claim_type"] == "BLOCKED"]
    if blocked:
        _log.warning(
            "mri_claim_blocked",
            extra={
                "event": "mri_claim_blocked",
                "blocked_count": len(blocked),
                "block_reasons": list({f["block_reason"] for f in blocked if f["block_reason"]}),
                "sections": [f["section"] for f in blocked],
            },
        )

    return findings


def sanitize_for_patient(report: dict) -> dict:
    """Produce a patient-safe version of an MRI report."""
    sanitized: dict[str, Any] = {"disclaimer": "This is a research/wellness summary. Please discuss with your clinician and radiologist."}

    for key in ("confidence_level", "clinical_flags"):
        if key in report:
            sanitized[key] = report[key]

    exec_summary = report.get("executive_summary") or ""
    exec_summary = _soften_text(_remove_blocked(exec_summary))
    exec_summary = _remove_technical_jargon(exec_summary)
    sanitized["executive_summary"] = exec_summary

    safe_findings: list[dict] = []
    for finding in report.get("findings") or []:
        text = finding.get("observation") or ""
        if _is_blocked(text):
            continue
        text = _soften_text(_remove_technical_jargon(text))
        safe_findings.append({"region": finding.get("region"), "observation": text})
    sanitized["findings"] = safe_findings

    safe_protocols: list[dict] = []
    for proto in report.get("protocol_recommendations") or []:
        safe_protocols.append({
            "modality": proto.get("modality"),
            "target": proto.get("target"),
            "rationale": _soften_text(proto.get("rationale") or ""),
        })
    sanitized["protocol_recommendations"] = safe_protocols

    band_summary: dict[str, str] = {}
    for band, payload in (report.get("band_analysis") or {}).items():
        sev = payload.get("severity") or "unknown"
        band_summary[band] = f"{band.title()} activity appears {sev}."
    sanitized["band_summary"] = band_summary

    return sanitized


def scan_for_banned_words(text: str) -> list[str]:
    found: list[str] = []
    lowered = text.lower()
    for word in _BANNED_WORDS:
        if word.lower() in lowered:
            found.append(word)
    return found


def _classify_text(text: str) -> tuple[str, Optional[str]]:
    for pattern, reason in _BLOCKED_PATTERNS:
        if pattern.search(text):
            return "BLOCKED", reason
    return "INFERRED", None


def _is_blocked(text: str) -> bool:
    return _classify_text(text)[0] == "BLOCKED"


def _remove_blocked(text: str) -> str:
    if _is_blocked(text):
        return "[Content removed — requires clinician and radiology review.]"
    return text


def _is_numeric_measurement(text: str) -> bool:
    return bool(re.search(r"\d+\.?\d*\s*(mm|cm|mm³|voxels|Hz|mT|V/m|%|percent)", text))


def _mentions_protocol(text: str) -> bool:
    return bool(re.search(r"\b(TPS|tFUS|rTMS|tDCS|tACS|tRNS|protocol|target|montage)\b", text, re.IGNORECASE))


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
    replacements = [
        (r"z-score\s+of\s+-?\d+\.?\d*", ""),
        (r"\bz-score\b", "deviation from typical"),
        (r"\bMNI\s+coordinate\b", "brain location"),
        (r"\bMNI\b", "standard brain space"),
        (r"\bvoxel\b", "3D pixel"),
        (r"\bregistration\b", "alignment"),
        (r"\bsegmentation\b", "tissue mapping"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text
