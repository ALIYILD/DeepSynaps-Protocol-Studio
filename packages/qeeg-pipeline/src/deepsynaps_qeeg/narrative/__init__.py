"""Narrative RAG for clinician-facing qEEG discussion text.

This package turns normative deviations ("findings") into a structured,
citation-grounded Discussion + References section for the PDF/HTML report.

PHI constraints:
- Only de-identified findings/patient metadata may be sent to any LLM provider.
- All citations must originate from the DeepSynaps literature DB retrieval set.
"""

from .types import Citation, Finding, NarrativeReport
from .findings import extract_findings
from .retrieve import retrieve_evidence
from .compose import compose_narrative
from .safety import generate_safe_narrative

__all__ = [
    "Citation",
    "Finding",
    "NarrativeReport",
    "extract_findings",
    "retrieve_evidence",
    "compose_narrative",
    "generate_safe_narrative",
]

