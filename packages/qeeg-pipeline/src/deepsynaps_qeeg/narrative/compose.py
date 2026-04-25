from __future__ import annotations

import os
from dataclasses import asdict
from typing import Any, Protocol

from .types import Citation, Finding, NarrativeReport


class NarrativeProvider(Protocol):
    """Provider abstraction for narrative generation (no hardcoded vendor)."""

    def generate(self, *, prompt: str, meta: dict[str, Any]) -> str:
        ...


class MockNarrativeProvider:
    """Deterministic provider used when no external LLM backend is configured."""

    def generate(self, *, prompt: str, meta: dict[str, Any]) -> str:  # noqa: ARG002
        findings: list[dict[str, Any]] = meta.get("findings") or []
        citation_ids: list[str] = meta.get("citation_ids") or []
        cid = citation_ids[0] if citation_ids else "C1"

        lines: list[str] = []
        lines.append("## Discussion")
        if not findings:
            lines.append(f"No reportable borderline or significant deviations were detected. [{cid}]")
        else:
            lines.append(
                "The following discussion summarizes borderline/significant normative deviations "
                "observed in the current qEEG features and links each statement to retrieved "
                "literature references. "
                f"[{cid}]"
            )
            for f in findings[:6]:
                metric = f.get("metric", "metric")
                band = f.get("band", "band")
                region = f.get("region", "region")
                z = f.get("z", 0.0)
                direction = f.get("direction", "normal")
                sev = f.get("severity", "borderline")
                lines.append(
                    f"- {sev.title()} {direction} deviation in `{metric}` ({band}) at {region} "
                    f"(z={float(z):.2f}). [{cid}]"
                )

        lines.append("")
        lines.append("## Limitations")
        lines.append(
            "This narrative is decision support for research/wellness use only and must be "
            "interpreted by a qualified clinician in the full clinical context. "
            f"[{cid}]"
        )
        return "\n".join(lines).strip() + "\n"


def _select_provider(provider: NarrativeProvider | None = None) -> NarrativeProvider:
    if provider is not None:
        return provider
    # Default: deterministic mock. A real provider can be wired by higher layers
    # (API service) without changing this module.
    if (os.getenv("DEEPSYNAPS_NARRATIVE_PROVIDER") or "").strip().lower() == "mock":
        return MockNarrativeProvider()
    return MockNarrativeProvider()


def _prompt_for(
    findings: list[Finding],
    citations: list[Citation],
    patient_meta: dict[str, Any] | None,
) -> str:
    # PHI constraints: only allow de-identified metadata fields through.
    safe_meta: dict[str, Any] = {}
    for k in ("age", "sex", "handedness", "recording_state", "protocol"):
        if patient_meta and k in patient_meta:
            safe_meta[k] = patient_meta.get(k)

    cite_list = "\n".join(
        [
            f"- [{c.citation_id}] {c.title or 'Untitled'} ({c.year or 'n.d.'}) "
            f"{(c.doi or c.pmid or '').strip()}"
            for c in citations
        ]
    ) or "(none)"

    findings_json = [asdict(f) for f in findings]
    return (
        "You are generating the Discussion section for a clinician-facing qEEG report.\n"
        "\n"
        "Hard requirements:\n"
        "- Use ONLY the provided findings and ONLY the provided citations.\n"
        "- Every sentence MUST include at least one citation marker in the form [C#].\n"
        "- You MUST NOT use any citation ids that are not in the provided list.\n"
        "- Do not include PHI. Do not invent patient identifiers.\n"
        "- Keep regulatory posture: decision support, research/wellness use only.\n"
        "- Output Markdown with these sections, in this order:\n"
        "  1) '## Discussion'\n"
        "  2) '## Clinical interpretation notes'\n"
        "  3) '## Limitations'\n"
        "\n"
        f"De-identified patient context (JSON): {safe_meta}\n"
        f"Findings (JSON): {findings_json}\n"
        "Citations available:\n"
        f"{cite_list}\n"
    )


def compose_narrative(
    findings: list[Finding],
    evidence: dict[str, list[Citation]],
    patient_meta: dict[str, Any] | None,
    *,
    provider: NarrativeProvider | None = None,
) -> NarrativeReport:
    """Compose a narrative report from findings + evidence.

    This function does not perform final safety gating; `safety.generate_safe_narrative`
    wraps it with consistency checking + reprompt + fallback.
    """
    # Flatten citations in deterministic order, preserving only retrieved set.
    citations: list[Citation] = []
    seen: set[str] = set()
    for f in findings:
        for c in (evidence.get(f.key) or []):
            if c.citation_id in seen:
                continue
            seen.add(c.citation_id)
            citations.append(c)

    prompt = _prompt_for(findings, citations, patient_meta or {})
    prov = _select_provider(provider)

    # Provide structured meta for deterministic mock and for audit trails (no PHI).
    meta = {
        "findings": [asdict(f) for f in findings],
        "citation_ids": [c.citation_id for c in citations],
    }
    discussion_md = prov.generate(prompt=prompt, meta=meta)

    return NarrativeReport(
        discussion_markdown=discussion_md,
        references=citations,
        meta={"provider": type(prov).__name__},
    )


__all__ = [
    "NarrativeProvider",
    "MockNarrativeProvider",
    "compose_narrative",
]

