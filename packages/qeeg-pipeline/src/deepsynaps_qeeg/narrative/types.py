from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


Direction = Literal["elevated", "reduced", "normal"]
Severity = Literal["borderline", "significant"]


@dataclass(frozen=True)
class Finding:
    region: str
    band: str
    metric: str
    value: float | None
    z: float
    direction: Direction
    severity: Severity

    @property
    def key(self) -> str:
        # Stable key for mapping evidence -> finding
        return f"{self.metric}|{self.band}|{self.region}"


@dataclass(frozen=True)
class Citation:
    """A single literature citation originating from the MedRAG DB path."""

    citation_id: str  # e.g. "C1"
    pmid: str | None = None
    doi: str | None = None
    title: str | None = None
    year: int | None = None
    url: str | None = None
    relevance: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def doi_url(self) -> str | None:
        if self.doi:
            return f"https://doi.org/{self.doi}"
        return None


@dataclass(frozen=True)
class NarrativeReport:
    """Structured narrative ready to be injected into the HTML report."""

    discussion_markdown: str
    references: list[Citation]
    # Provider/backend metadata for audit trails (no PHI).
    meta: dict[str, Any] = field(default_factory=dict)

