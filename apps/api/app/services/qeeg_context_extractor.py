"""qEEG clinical context extraction helpers.

The frontend embeds a structured clinical-context survey into the qEEG
record's ``summary_notes`` field using stable delimiters so downstream
LLM workflows can recover the survey verbatim without a schema change.

Format written by the frontend::

    <<qeeg_context_v1>>
    {"schema":"deepsynaps.qeeg_clinical_context.v1", ...}
    <</qeeg_context_v1>>

Helpers here are deliberately tolerant: missing block → ``None``,
malformed JSON → ``None`` (logged), extra whitespace ignored. They never
raise on bad input so the AI report pipeline continues to function even
when a record has free-text notes only.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

_log = logging.getLogger(__name__)

CONTEXT_BLOCK_START = "<<qeeg_context_v1>>"
CONTEXT_BLOCK_END = "<</qeeg_context_v1>>"

_BLOCK_RE = re.compile(
    re.escape(CONTEXT_BLOCK_START) + r"\s*(.*?)\s*" + re.escape(CONTEXT_BLOCK_END),
    re.DOTALL,
)


def extract_qeeg_context(notes: Optional[str]) -> Optional[dict[str, Any]]:
    """Extract the embedded clinical-context JSON from a notes blob.

    Returns ``None`` when the block is absent or the JSON is malformed.
    """
    if not notes:
        return None
    match = _BLOCK_RE.search(notes)
    if not match:
        return None
    payload = match.group(1).strip()
    if not payload:
        return None
    try:
        ctx = json.loads(payload)
    except (ValueError, TypeError) as exc:
        _log.warning("qEEG context block present but JSON invalid: %s", exc)
        return None
    if not isinstance(ctx, dict):
        return None
    return ctx


def wrap_qeeg_context(survey: dict[str, Any] | str) -> str:
    """Wrap a survey dict (or validated JSON string) in stable delimiters."""
    if isinstance(survey, str):
        # Round-trip to validate + normalise formatting.
        try:
            parsed = json.loads(survey)
        except (ValueError, TypeError) as exc:
            raise ValueError(f"survey string is not valid JSON: {exc}") from exc
        payload = json.dumps(parsed, separators=(",", ":"))
    else:
        payload = json.dumps(survey, separators=(",", ":"))
    return f"{CONTEXT_BLOCK_START}\n{payload}\n{CONTEXT_BLOCK_END}"


def strip_qeeg_context(notes: Optional[str]) -> str:
    """Return ``notes`` with any embedded context block removed.

    Useful when the caller wants to render only the clinician's free-text
    notes without the machine-readable JSON payload.
    """
    if not notes:
        return ""
    return _BLOCK_RE.sub("", notes).strip()


def format_context_for_prompt(ctx: dict[str, Any]) -> str:
    """Render a survey dict as a compact LLM-prompt block.

    The embedded ``_instructions_for_llm`` field (if present) is surfaced
    as a preamble so the model sees the intent before the JSON body. The
    full JSON follows so the model can reason over any field it needs.
    """
    instructions = ctx.get("_instructions_for_llm")
    red_flags = ctx.get("red_flags") or {}
    active_flags = [k for k, v in red_flags.items() if v]
    header_lines = ["## CLINICIAN-PROVIDED CLINICAL CONTEXT"]
    if instructions:
        header_lines.append(str(instructions))
    if active_flags:
        header_lines.append("RED FLAGS RAISED: " + ", ".join(active_flags))
    header = "\n".join(header_lines)
    body = json.dumps(ctx, indent=2, sort_keys=False)
    return f"{header}\n\n```json\n{body}\n```"
