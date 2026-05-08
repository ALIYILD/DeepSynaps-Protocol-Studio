"""Unified analyzer AI report generator.

Single entry point for AI-driven clinical decision-support reports across
every analyzer surface (MRI, voice, video, biometrics, labs, nutrition,
phenotype, digital phenotyping, risk, movement, text, treatment-sessions,
deeptwin). Each analyzer type registers a loader function (returns a
normalized payload from the persistence layer) and a system prompt; the
generator handles RAG, prompt assembly, LLM call, JSON parsing, and the
deterministic fallback.

Mirrors the qEEG pattern in ``services/qeeg_ai_interpreter.generate_ai_report``
but is analyzer-agnostic — qEEG keeps its bespoke pipeline because its
prompt is highly contract-specific.
"""

from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

_log = logging.getLogger(__name__)


# ── Output schema ────────────────────────────────────────────────────────────
# All analyzer narratives return the same JSON shape so the PDF template
# and the frontend modal can render every report with one renderer.

DECISION_SUPPORT_SCHEMA: dict[str, Any] = {
    "executive_summary": "str — 2-4 sentence top-line read",
    "key_findings": [
        {
            "title": "str",
            "observation": "str — cite refs as [1][2] when refs given",
            "severity": "low|moderate|high|critical",
            "confidence": "0.0-1.0 float",
        }
    ],
    "clinical_significance": "str — what this means clinically",
    "differential_considerations": ["str", "..."],
    "recommended_followup": ["str", "..."],
    "decision_support_notes": "str — explicit decision-support framing, NOT a diagnosis",
    "limitations": ["str", "..."],
    "confidence_overall": "low|moderate|high",
}


# ── Registry types ───────────────────────────────────────────────────────────


@dataclass
class AnalyzerPayload:
    """Normalized payload returned by every analyzer loader."""

    patient_id: str
    analyzer_type: str
    analysis_id: str
    title: str  # human-readable analyzer label
    summary_features: dict[str, Any]  # structured data the LLM will see
    flagged_conditions: list[str]
    charts: list[dict[str, Any]]  # {label, kind, data_uri OR svg, caption}
    metadata: dict[str, Any]  # acquired_at, device, modality, etc.


LoaderFn = Callable[[str, Any], Optional[AnalyzerPayload]]
"""(analysis_id, db_session) -> AnalyzerPayload | None"""


_REGISTRY: dict[str, dict[str, Any]] = {}


def register_analyzer(
    analyzer_type: str,
    *,
    loader: LoaderFn,
    system_prompt: str,
    rag_modalities: Optional[list[str]] = None,
) -> None:
    """Register an analyzer type with its loader + LLM system prompt.

    Called once at module import (see ``_register_default_analyzers`` below).
    Tests can register fakes by calling this directly.
    """
    _REGISTRY[analyzer_type] = {
        "loader": loader,
        "system_prompt": system_prompt,
        "rag_modalities": rag_modalities or [],
    }


def is_registered(analyzer_type: str) -> bool:
    return analyzer_type in _REGISTRY


def list_registered() -> list[str]:
    return sorted(_REGISTRY.keys())


def get_registration(analyzer_type: str) -> Optional[dict[str, Any]]:
    return _REGISTRY.get(analyzer_type)


# ── Shared system prompt scaffolding ─────────────────────────────────────────

DECISION_SUPPORT_PREAMBLE = """You are DeepSynaps ClinicalAI, a decision-support assistant for licensed
clinicians. You are NOT a diagnostic tool. Your output is ALWAYS reviewed
by a clinician before any patient-facing action is taken.

CRITICAL RULES — these are non-negotiable:
1. NEVER use the words "diagnose", "diagnostic", "diagnosis", "treatment recommendation",
   "prescribe", or "you should". Use "consider", "supports", "is consistent with",
   "may warrant clinical correlation".
2. EVERY substantive observation must cite numbered references [1]..[N] when literature
   is provided in the prompt. If no refs are provided, do NOT fabricate citations —
   cite only from training knowledge and clearly mark the inference.
3. Output VALID JSON only. No markdown code fences, no preamble, no postscript.
4. Confidence levels must be honest. Sparse data → "low".
5. Always populate `limitations` with the data quality / sample size / generalizability
   caveats relevant to THIS analysis.
6. `recommended_followup` should be concrete clinical actions a clinician can verify
   (repeat measurement, additional assessment, MDT discussion) — never patient-facing
   instructions.

Output schema (return exactly these keys):

{
  "executive_summary": "<str>",
  "key_findings": [
    {"title": "<str>", "observation": "<str with [n] cites>",
     "severity": "low|moderate|high|critical", "confidence": <float 0-1>}
  ],
  "clinical_significance": "<str>",
  "differential_considerations": ["<str>", "..."],
  "recommended_followup": ["<str>", "..."],
  "decision_support_notes": "<str>",
  "limitations": ["<str>", "..."],
  "confidence_overall": "low|moderate|high"
}
"""


# ── Helpers ──────────────────────────────────────────────────────────────────


def _safe_parse_json(raw: str) -> Optional[dict[str, Any]]:
    """Parse the LLM's JSON output, tolerating accidental markdown fences."""
    if not raw:
        return None
    txt = raw.strip()
    # Strip ```json ... ``` and ``` ... ``` fences defensively
    if txt.startswith("```"):
        first_nl = txt.find("\n")
        if first_nl != -1:
            txt = txt[first_nl + 1 :]
        if txt.rstrip().endswith("```"):
            txt = txt.rstrip()[:-3]
    try:
        parsed = json.loads(txt)
    except (TypeError, ValueError):
        # Try to recover the first {...} object
        start = txt.find("{")
        end = txt.rfind("}")
        if start != -1 and end > start:
            try:
                parsed = json.loads(txt[start : end + 1])
            except (TypeError, ValueError):
                return None
        else:
            return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def _format_features_for_prompt(features: dict[str, Any]) -> str:
    """Pretty-print structured features for the LLM. Truncates long arrays."""
    try:
        return json.dumps(features, indent=2, default=str, sort_keys=True)[:6000]
    except (TypeError, ValueError):
        return str(features)[:6000]


def _format_references_block(refs: list[dict[str, Any]]) -> str:
    if not refs:
        return ""
    lines = ["", "Literature references (cite as [1]..[N]):"]
    for i, r in enumerate(refs, 1):
        title = r.get("title") or "(untitled)"
        authors = r.get("authors") or ""
        year = r.get("year") or ""
        journal = r.get("journal") or ""
        lines.append(f"  [{i}] {title} — {authors} ({year}, {journal})")
    return "\n".join(lines)


def _deterministic_fallback(
    payload: AnalyzerPayload, prompt_hash: str, refs: list[dict[str, Any]]
) -> dict[str, Any]:
    """Returned when the LLM is unconfigured or fails to produce valid JSON."""
    feature_keys = list(payload.summary_features.keys())[:6]
    summary = (
        f"Deterministic summary for {payload.title} "
        f"(analysis {payload.analysis_id[:8]}). "
        f"Captured features: {', '.join(feature_keys) or 'none'}. "
        "AI narrative unavailable — clinician review required."
    )
    findings = []
    if payload.flagged_conditions:
        findings.append(
            {
                "title": "Pipeline-flagged conditions",
                "observation": (
                    "Pipeline flagged: "
                    + ", ".join(payload.flagged_conditions[:6])
                    + ". Consider clinical correlation."
                ),
                "severity": "moderate",
                "confidence": 0.4,
            }
        )
    return {
        "success": True,
        "source": "deterministic_fallback",
        "data": {
            "executive_summary": summary,
            "key_findings": findings,
            "clinical_significance": (
                "Decision-support narrative unavailable. The captured features "
                "are stored verbatim; clinician interpretation is required."
            ),
            "differential_considerations": [],
            "recommended_followup": [
                "Re-run AI report once LLM provider is reachable.",
                "Clinician to review raw analyzer features and document findings.",
            ],
            "decision_support_notes": (
                "This output is a deterministic fallback. It is not a diagnosis "
                "and contains no LLM-generated inference."
            ),
            "limitations": [
                "AI narrative not generated for this run.",
                "Confidence cannot be assessed without LLM grounding.",
            ],
            "confidence_overall": "low",
        },
        "literature_refs": refs,
        "prompt_hash": prompt_hash,
        "model_used": None,
    }


def _normalize_validated(parsed: dict[str, Any]) -> dict[str, Any]:
    """Coerce the LLM output into the expected schema, filling missing keys."""
    out: dict[str, Any] = {}
    out["executive_summary"] = str(parsed.get("executive_summary") or "").strip()
    findings_raw = parsed.get("key_findings") or []
    findings: list[dict[str, Any]] = []
    if isinstance(findings_raw, list):
        for f in findings_raw[:12]:
            if not isinstance(f, dict):
                continue
            try:
                conf = float(f.get("confidence") or 0.0)
            except (TypeError, ValueError):
                conf = 0.0
            sev = str(f.get("severity") or "moderate").lower()
            if sev not in {"low", "moderate", "high", "critical"}:
                sev = "moderate"
            findings.append(
                {
                    "title": str(f.get("title") or "").strip(),
                    "observation": str(f.get("observation") or "").strip(),
                    "severity": sev,
                    "confidence": max(0.0, min(1.0, conf)),
                }
            )
    out["key_findings"] = findings
    out["clinical_significance"] = str(parsed.get("clinical_significance") or "").strip()
    out["differential_considerations"] = [
        str(d).strip()
        for d in (parsed.get("differential_considerations") or [])
        if isinstance(d, (str, int, float))
    ][:8]
    out["recommended_followup"] = [
        str(r).strip()
        for r in (parsed.get("recommended_followup") or [])
        if isinstance(r, (str, int, float))
    ][:8]
    out["decision_support_notes"] = str(parsed.get("decision_support_notes") or "").strip()
    out["limitations"] = [
        str(lim).strip()
        for lim in (parsed.get("limitations") or [])
        if isinstance(lim, (str, int, float))
    ][:8]
    conf_overall = str(parsed.get("confidence_overall") or "moderate").lower()
    if conf_overall not in {"low", "moderate", "high"}:
        conf_overall = "moderate"
    out["confidence_overall"] = conf_overall
    return out


# ── Main entry point ────────────────────────────────────────────────────────


async def generate_decision_support_report(
    *,
    analyzer_type: str,
    payload: AnalyzerPayload,
    patient_context: Optional[str] = None,
    db_session: Any = None,
) -> dict[str, Any]:
    """Generate a decision-support narrative for any registered analyzer.

    Returns a CONTRACT-shaped dict::

        {
          "success": bool,
          "source": "llm" | "deterministic_fallback",
          "data": <decision_support_schema>,
          "literature_refs": [...],
          "prompt_hash": str,
          "model_used": str | None,
        }
    """
    reg = _REGISTRY.get(analyzer_type)
    if not reg:
        # Treat unknown analyzer types as a deterministic fallback rather
        # than raising — the router enforces "registered" before getting here.
        return _deterministic_fallback(payload, "unregistered", [])

    # ── RAG: fetch literature refs (best-effort) ─────────────────────────
    rag_refs: list[dict[str, Any]] = []
    try:
        from app.services import qeeg_rag

        rag_raw = await qeeg_rag.query_literature(
            conditions=payload.flagged_conditions or [],
            modalities=reg.get("rag_modalities") or [],
            top_k=8,
            db_session=db_session,
        )
        if isinstance(rag_raw, list):
            for r in rag_raw[:8]:
                if not isinstance(r, dict):
                    continue
                rag_refs.append(
                    {
                        "pmid": r.get("pmid") or "",
                        "doi": r.get("doi") or "",
                        "title": r.get("title") or "",
                        "authors": r.get("authors") or "",
                        "year": r.get("year") or "",
                        "journal": r.get("journal") or "",
                    }
                )
    except Exception as exc:  # pragma: no cover — best-effort
        _log.warning("analyzer RAG failed for %s: %s", analyzer_type, exc)

    # ── Build the prompt ─────────────────────────────────────────────────
    features_text = _format_features_for_prompt(payload.summary_features)
    refs_text = _format_references_block(rag_refs)

    user_parts = [
        f"Analyzer: {payload.title} ({analyzer_type})",
        f"Analysis ID: {payload.analysis_id[:12]}",
        "",
        "Captured features:",
        features_text,
    ]
    if payload.flagged_conditions:
        user_parts.append("\nFlagged conditions: " + ", ".join(payload.flagged_conditions))
    if payload.metadata:
        meta_short = {k: v for k, v in list(payload.metadata.items())[:6]}
        user_parts.append("\nMetadata:\n" + _format_features_for_prompt(meta_short))
    if patient_context:
        user_parts.append("\nClinical context (clinician-supplied):\n" + patient_context.strip())
    if refs_text:
        user_parts.append(refs_text)
    if rag_refs:
        user_parts.append(
            "\nRemember: cite numbered references [1]..[{n}] in observations. "
            "Never use 'diagnose' / 'diagnostic' / 'treatment recommendation'.".format(
                n=len(rag_refs)
            )
        )
    else:
        user_parts.append(
            "\nNo literature retrieved — do NOT use bracketed [1]..[N] citations. "
            "Cite from training knowledge and mark inferences. "
            "Never use 'diagnose' / 'diagnostic' / 'treatment recommendation'."
        )

    user_prompt = "\n".join(user_parts)
    system_prompt = reg["system_prompt"]
    prompt_hash = hashlib.sha256(
        (system_prompt + user_prompt).encode("utf-8", errors="replace")
    ).hexdigest()[:16]

    # ── Call the LLM ─────────────────────────────────────────────────────
    try:
        from app.services.chat_service import _llm_chat_async

        raw = await _llm_chat_async(
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            max_tokens=2048,
            temperature=0.3,
            not_configured_message="",
        )
    except Exception as exc:  # pragma: no cover — defensive
        _log.warning("LLM call failed for %s: %s", analyzer_type, exc)
        raw = ""

    if not raw:
        return _deterministic_fallback(payload, prompt_hash, rag_refs)

    parsed = _safe_parse_json(raw)
    if not parsed:
        _log.warning("LLM output for %s did not parse as JSON; using fallback", analyzer_type)
        return _deterministic_fallback(payload, prompt_hash, rag_refs)

    return {
        "success": True,
        "source": "llm",
        "data": _normalize_validated(parsed),
        "literature_refs": rag_refs,
        "prompt_hash": prompt_hash,
        "model_used": None,
    }


# ── Register the default analyzers ───────────────────────────────────────────


def _register_default_analyzers() -> None:
    """Import and register loaders for every supported analyzer type.

    Each loader lives in :mod:`app.services.analyzer_loaders` so that this
    module stays focused on the prompt + LLM plumbing.
    """
    try:
        from app.services import analyzer_loaders as _loaders
    except Exception as exc:  # pragma: no cover — should not happen in tests
        _log.error("analyzer_loaders import failed: %s", exc)
        return

    _loaders.register_all(register_analyzer)


_register_default_analyzers()
