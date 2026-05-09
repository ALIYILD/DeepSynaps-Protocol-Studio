"""Tests for deepsynaps_render_engine.payload.

The payload schema is the single source of truth for downstream
consumers (HTML/PDF viewers persist by schema_id). Pin the contract.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from deepsynaps_render_engine import (
    REPORT_GENERATOR_VERSION_DEFAULT,
    REPORT_PAYLOAD_SCHEMA_ID,
    CitationRef,
    InterpretationItem,
    ReportPayload,
    ReportSection,
    SuggestedAction,
)


class TestSchemaConstants:
    def test_schema_id_is_v1(self) -> None:
        assert REPORT_PAYLOAD_SCHEMA_ID == "deepsynaps.report-payload/v1"

    def test_generator_version_set(self) -> None:
        assert REPORT_GENERATOR_VERSION_DEFAULT
        assert "deepsynaps-render-engine" in REPORT_GENERATOR_VERSION_DEFAULT


class TestCitationRefIdentifierUrls:
    def test_doi_url_builds_https_doi_dot_org(self) -> None:
        c = CitationRef(citation_id="C1", doi="10.1001/jama.2020.1234")
        assert c.doi_url() == "https://doi.org/10.1001/jama.2020.1234"

    def test_doi_url_passes_through_full_url(self) -> None:
        c = CitationRef(citation_id="C1", doi="https://doi.org/10.1/x")
        assert c.doi_url() == "https://doi.org/10.1/x"

    def test_doi_url_strips_whitespace(self) -> None:
        c = CitationRef(citation_id="C1", doi="  10.1/x  ")
        assert c.doi_url() == "https://doi.org/10.1/x"

    def test_doi_url_none_when_no_doi(self) -> None:
        c = CitationRef(citation_id="C1")
        assert c.doi_url() is None

    def test_pubmed_url_builds(self) -> None:
        c = CitationRef(citation_id="C1", pmid="12345")
        assert c.pubmed_url() == "https://pubmed.ncbi.nlm.nih.gov/12345/"

    def test_pubmed_url_strips_whitespace(self) -> None:
        c = CitationRef(citation_id="C1", pmid="  12345  ")
        assert c.pubmed_url() == "https://pubmed.ncbi.nlm.nih.gov/12345/"

    def test_pubmed_url_none_when_no_pmid(self) -> None:
        c = CitationRef(citation_id="C1")
        assert c.pubmed_url() is None

    def test_best_link_prefers_doi(self) -> None:
        c = CitationRef(
            citation_id="C1",
            doi="10.1/x",
            pmid="12345",
            url="https://other.example/p",
        )
        assert c.best_link() == "https://doi.org/10.1/x"

    def test_best_link_falls_back_to_pubmed(self) -> None:
        c = CitationRef(citation_id="C1", pmid="12345", url="https://other/p")
        assert c.best_link() == "https://pubmed.ncbi.nlm.nih.gov/12345/"

    def test_best_link_falls_back_to_url(self) -> None:
        c = CitationRef(citation_id="C1", url="https://other/p")
        assert c.best_link() == "https://other/p"

    def test_best_link_none_when_nothing_present(self) -> None:
        c = CitationRef(citation_id="C1", raw_text="some text")
        assert c.best_link() is None


class TestCitationRefDefaults:
    def test_default_status_is_unverified(self) -> None:
        c = CitationRef(citation_id="C1")
        assert c.status == "unverified"

    def test_default_authors_empty_list(self) -> None:
        c = CitationRef(citation_id="C1")
        assert c.authors == []

    def test_year_optional(self) -> None:
        c = CitationRef(citation_id="C1")
        assert c.year is None


class TestInterpretationItem:
    def test_default_evidence_strength_is_evidence_pending(self) -> None:
        # The "Evidence pending" default is the "honest answer" — pin so a
        # PR can't silently flip the default to something stronger.
        item = InterpretationItem(text="finding")
        assert item.evidence_strength == "Evidence pending"

    def test_evidence_refs_default_empty(self) -> None:
        item = InterpretationItem(text="finding")
        assert item.evidence_refs == []
        assert item.counter_evidence_refs == []

    def test_explicit_strength(self) -> None:
        item = InterpretationItem(text="x", evidence_strength="Strong")
        assert item.evidence_strength == "Strong"

    @pytest.mark.parametrize(
        "strength",
        ["Strong", "Moderate", "Limited", "Conflicting", "Evidence pending"],
    )
    def test_evidence_strength_values(self, strength: str) -> None:
        item = InterpretationItem(text="x", evidence_strength=strength)  # type: ignore[arg-type]
        assert item.evidence_strength == strength


class TestSuggestedAction:
    def test_requires_clinician_review_default_true(self) -> None:
        # Decision-support contract — every suggestion is "consider", never
        # "do" by default. Pin so a refactor can't flip the default.
        a = SuggestedAction(text="x")
        assert a.requires_clinician_review is True

    def test_can_disable_review_for_informational(self) -> None:
        a = SuggestedAction(text="x", requires_clinician_review=False)
        assert a.requires_clinician_review is False


class TestReportSection:
    def test_minimal_construction(self) -> None:
        s = ReportSection(section_id="s1", title="Section 1")
        assert s.observed == []
        assert s.interpretations == []
        assert s.suggested_actions == []
        assert s.cautions == []
        assert s.limitations == []
        assert s.confidence is None

    def test_observed_passthrough(self) -> None:
        s = ReportSection(section_id="s1", title="t", observed=["x", "y"])
        assert s.observed == ["x", "y"]


class TestReportPayload:
    def _minimal(self) -> ReportPayload:
        return ReportPayload(title="Test report")

    def test_default_schema_id_set(self) -> None:
        p = self._minimal()
        assert p.schema_id == REPORT_PAYLOAD_SCHEMA_ID

    def test_default_generator_version_set(self) -> None:
        p = self._minimal()
        assert p.generator_version == REPORT_GENERATOR_VERSION_DEFAULT

    def test_default_audience_is_both(self) -> None:
        p = self._minimal()
        assert p.audience == "both"

    def test_default_decision_support_disclaimer_present(self) -> None:
        p = self._minimal()
        assert "decision-support" in p.decision_support_disclaimer
        assert "qualified clinician" in p.decision_support_disclaimer

    def test_generated_at_is_iso_utc(self) -> None:
        p = self._minimal()
        # ISO-8601 timestamp parses
        parsed = datetime.fromisoformat(p.generated_at)
        assert parsed.tzinfo is not None  # tz-aware

    def test_section_round_trip(self) -> None:
        p = ReportPayload(
            title="t",
            sections=[
                ReportSection(
                    section_id="s1",
                    title="S",
                    observed=["o1"],
                    interpretations=[
                        InterpretationItem(text="i", evidence_strength="Moderate"),
                    ],
                    suggested_actions=[SuggestedAction(text="a")],
                ),
            ],
        )
        # Pydantic round-trip via model_dump → model_validate.
        round_tripped = ReportPayload.model_validate(p.model_dump())
        assert round_tripped.sections[0].interpretations[0].evidence_strength == "Moderate"

    def test_global_cautions_default_empty(self) -> None:
        p = self._minimal()
        assert p.global_cautions == []
        assert p.global_limitations == []

    def test_audience_can_be_clinician_or_patient(self) -> None:
        for audience in ("clinician", "patient", "both"):
            p = ReportPayload(title="t", audience=audience)  # type: ignore[arg-type]
            assert p.audience == audience
