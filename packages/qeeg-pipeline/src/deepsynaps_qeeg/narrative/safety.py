from __future__ import annotations

import re
from dataclasses import asdict
from typing import Any

from .compose import NarrativeProvider, compose_narrative
from .types import Citation, Finding, NarrativeReport


_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_CITE_MARK = re.compile(r"\[(C\d+)\]")


def _sentences(text: str) -> list[str]:
    t = (text or "").strip()
    if not t:
        return []
    return [s.strip() for s in _SENTENCE_SPLIT.split(t) if s.strip()]


def check_citations(
    *,
    text_markdown: str,
    allowed_citation_ids: set[str],
) -> tuple[bool, str]:
    """Deterministic consistency checker.

    Enforces:
    - Every sentence has >=1 citation marker like [C1]
    - Every cited id is in allowed_citation_ids
    """
    sents = _sentences(text_markdown)
    if not sents:
        return (False, "Empty narrative.")

    for i, s in enumerate(sents, start=1):
        ids = _CITE_MARK.findall(s)
        if not ids:
            return (False, f"Sentence {i} missing citation marker [C#].")
        unknown = [cid for cid in ids if cid not in allowed_citation_ids]
        if unknown:
            return (False, f"Sentence {i} contains unknown citation ids: {sorted(set(unknown))}.")

    return (True, "ok")


def _fallback_narrative(findings: list[Finding], citations: list[Citation]) -> str:
    cid = citations[0].citation_id if citations else "C1"
    lines: list[str] = []
    lines.append("## Discussion")
    if not findings:
        lines.append(f"No reportable borderline or significant deviations were detected. [{cid}]")
    else:
        for f in findings[:8]:
            lines.append(
                f"- {f.severity.title()} {f.direction} deviation in `{f.metric}` ({f.band}) "
                f"at {f.region} (z={f.z:.2f}). [{cid}]"
            )
    lines.append("")
    lines.append("## Clinical interpretation notes")
    lines.append(
        "Interpret deviations in the context of recording conditions, artifacts, and clinical history; "
        "qEEG features are not standalone diagnostic outputs. "
        f"[{cid}]"
    )
    lines.append("")
    lines.append("## Limitations")
    lines.append(
        "Generated content is decision support for research/wellness use only and requires clinician review. "
        f"[{cid}]"
    )
    return "\n".join(lines).strip() + "\n"


def generate_safe_narrative(
    findings: list[Finding],
    evidence: dict[str, list[Citation]],
    patient_meta: dict[str, Any] | None,
    *,
    provider: NarrativeProvider | None = None,
    max_repairs: int = 2,
) -> NarrativeReport:
    """Compose narrative and enforce citation-grounding; reprompt then fallback."""
    draft = compose_narrative(findings, evidence, patient_meta, provider=provider)
    allowed = {c.citation_id for c in draft.references}

    ok, reason = check_citations(text_markdown=draft.discussion_markdown, allowed_citation_ids=allowed)
    if ok:
        return draft

    # Reprompt up to `max_repairs` times with a strict correction instruction.
    for _ in range(int(max_repairs or 0)):
        correction_meta = {
            "findings": [asdict(f) for f in findings],
            "citation_ids": sorted(allowed),
            "repair_reason": reason,
        }
        correction_prompt = (
            "Your previous output failed the citation consistency checker.\n"
            f"Failure: {reason}\n"
            "You MUST rewrite the entire Markdown so that EVERY sentence includes at least one "
            "citation marker [C#], and ALL citation ids are from the allowed list.\n"
            "Do not add new claims beyond the provided findings.\n"
        )
        if provider is None:
            break
        try:
            rewritten = provider.generate(prompt=correction_prompt, meta=correction_meta)
        except Exception:
            break
        candidate = NarrativeReport(
            discussion_markdown=rewritten,
            references=draft.references,
            meta=dict(draft.meta, repaired=True),
        )
        ok, reason = check_citations(text_markdown=candidate.discussion_markdown, allowed_citation_ids=allowed)
        if ok:
            return candidate

    # Deterministic fallback that is guaranteed to pass.
    fb_text = _fallback_narrative(findings, draft.references)
    return NarrativeReport(
        discussion_markdown=fb_text,
        references=draft.references,
        meta=dict(draft.meta, fallback=True, failure_reason=reason),
    )


__all__ = ["check_citations", "generate_safe_narrative"]

