"""Tests for ``deepsynaps_render_engine.payload`` (the report payload schema).

Pins the load-bearing **decision-support / clinician-review** safety
contract:

- ``ReportPayload.decision_support_disclaimer`` MUST always carry the
  fixed wording: "This report is a clinical decision-support tool",
  "does not replace independent clinical judgement", "Verify all
  findings with the patient's qualified clinician before acting."
  Refactor cannot dilute these phrases.
- ``SuggestedAction.requires_clinician_review`` defaults to True so
  every suggestion is presented as "consider", never "do".
- ``InterpretationItem.evidence_strength`` defaults to
  "Evidence pending" — explicit, no implicit "high" claim.
- ``ReportSection.cautions`` + ``limitations`` default to [] but are
  always rendered (the renderer's responsibility) so missing-data
  signals can never be silently swallowed.
- ``CitationRef`` URL helpers: ``doi_url``, ``pubmed_url``,
  ``best_link`` resolve correctly for known + missing identifiers.
- ``ReportPayload.audience`` default is "both" so the renderer
  produces a toggle UI by default — the patient + clinician views
  must always co-exist.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from deepsynaps_render_engine.payload import (
    REPORT_GENERATOR_VERSION_DEFAULT,
    REPORT_PAYLOAD_SCHEMA_ID,
    CitationRef,
    InterpretationItem,
    ReportPayload,
    ReportSection,
    SuggestedAction,
)


# ── ReportPayload defaults + decision-support disclaimer ──────────────────


class TestReportPayloadDefaults:
    def test_required_fields_minimal_construction(self) -> None:
        rp = ReportPayload(title="X")
        assert rp.title == "X"

    def test_audience_default_is_both(self) -> None:
        # Pin: default is "both" so the renderer produces toggle UI;
        # patient + clinician views co-exist by default.
        rp = ReportPayload(title="X")
        assert rp.audience == "both"

    def test_decision_support_disclaimer_phrases_pinned(self) -> None:
        # Pin the load-bearing safety wording: every key phrase MUST
        # remain in the disclaimer string. Refactor cannot dilute them.
        rp = ReportPayload(title="X")
        d = rp.decision_support_disclaimer
        assert "clinical decision-support tool" in d
        assert "does not replace independent clinical judgement" in d
        assert "Verify all findings" in d
        assert "qualified clinician" in d

    def test_schema_id_and_generator_version_pinned(self) -> None:
        # Stamp on every payload so deploy comparisons are stable.
        rp = ReportPayload(title="X")
        assert rp.schema_id == REPORT_PAYLOAD_SCHEMA_ID
        assert rp.generator_version == REPORT_GENERATOR_VERSION_DEFAULT

    def test_generated_at_is_iso_utc(self) -> None:
        rp = ReportPayload(title="X")
        # ISO 8601 string parses to a UTC datetime.
        ts = datetime.fromisoformat(rp.generated_at)
        assert ts.tzinfo is not None

    def test_default_lists_are_empty(self) -> None:
        rp = ReportPayload(title="X")
        assert rp.sections == []
        assert rp.citations == []
        assert rp.global_cautions == []
        assert rp.global_limitations == []


# ── SuggestedAction safety contract ───────────────────────────────────────


class TestSuggestedAction:
    def test_default_requires_clinician_review_true(self) -> None:
        # Pin: every suggestion defaults to "consider", never "do".
        # Setting False is reserved for purely informational messages.
        a = SuggestedAction(text="Consider increasing follow-up cadence.")
        assert a.requires_clinician_review is True

    def test_can_set_review_false_for_informational(self) -> None:
        a = SuggestedAction(
            text="Patient reports good adherence.",
            requires_clinician_review=False,
        )
        assert a.requires_clinician_review is False


# ── InterpretationItem evidence-strength default ─────────────────────────


class TestInterpretationItem:
    def test_evidence_strength_defaults_to_pending(self) -> None:
        # Pin: no implicit "high" claim. Default is "Evidence pending"
        # so the renderer must badge it as such.
        i = InterpretationItem(text="x")
        assert i.evidence_strength == "Evidence pending"

    def test_evidence_refs_default_empty(self) -> None:
        i = InterpretationItem(text="x")
        assert i.evidence_refs == []
        assert i.counter_evidence_refs == []


# ── ReportSection cautions / limitations contract ────────────────────────


class TestReportSection:
    def test_cautions_and_limitations_default_to_empty_lists(self) -> None:
        # Pin: defaults are [] but the renderer ALWAYS renders the
        # block (even when empty) so missing-data signals can never be
        # silently swallowed. The schema-level pin is "always present
        # as a list, never None".
        s = ReportSection(section_id="s1", title="t")
        assert s.cautions == []
        assert s.limitations == []

    def test_confidence_default_is_none(self) -> None:
        # Optional — pin so missing confidence doesn't render as
        # accidentally "high".
        s = ReportSection(section_id="s1", title="t")
        assert s.confidence is None


# ── CitationRef URL helpers ──────────────────────────────────────────────


class TestCitationRefDoiUrl:
    def test_with_doi(self) -> None:
        c = CitationRef(citation_id="C1", doi="10.1/abc")
        assert c.doi_url() == "https://doi.org/10.1/abc"

    def test_doi_already_starts_with_http_returned_as_is(self) -> None:
        c = CitationRef(citation_id="C1", doi="https://doi.org/10.1/abc")
        # Pin: a DOI already in URL form passes through unchanged.
        assert c.doi_url() == "https://doi.org/10.1/abc"

    def test_doi_strip_whitespace(self) -> None:
        c = CitationRef(citation_id="C1", doi="  10.1/abc  ")
        assert c.doi_url() == "https://doi.org/10.1/abc"

    def test_no_doi_returns_none(self) -> None:
        c = CitationRef(citation_id="C1")
        assert c.doi_url() is None


class TestCitationRefPubmedUrl:
    def test_with_pmid(self) -> None:
        c = CitationRef(citation_id="C1", pmid="12345")
        assert c.pubmed_url() == "https://pubmed.ncbi.nlm.nih.gov/12345/"

    def test_pmid_strip_whitespace(self) -> None:
        c = CitationRef(citation_id="C1", pmid=" 12345 ")
        assert c.pubmed_url() == "https://pubmed.ncbi.nlm.nih.gov/12345/"

    def test_no_pmid_returns_none(self) -> None:
        c = CitationRef(citation_id="C1")
        assert c.pubmed_url() is None


class TestCitationRefBestLink:
    def test_doi_preferred_over_pmid(self) -> None:
        # Pin link priority: DOI > PMID > url.
        c = CitationRef(citation_id="C1", doi="10.1/x", pmid="999", url="https://example.org")
        assert c.best_link() == "https://doi.org/10.1/x"

    def test_pmid_when_no_doi(self) -> None:
        c = CitationRef(citation_id="C1", pmid="999", url="https://example.org")
        assert c.best_link() == "https://pubmed.ncbi.nlm.nih.gov/999/"

    def test_url_when_no_doi_and_no_pmid(self) -> None:
        c = CitationRef(citation_id="C1", url="https://example.org/paper")
        assert c.best_link() == "https://example.org/paper"

    def test_no_links_returns_none(self) -> None:
        c = CitationRef(citation_id="C1")
        assert c.best_link() is None


# ── CitationRef status default ───────────────────────────────────────────


class TestCitationRefStatus:
    def test_default_is_unverified(self) -> None:
        # Pin: a fresh CitationRef is NOT verified by default — the
        # renderer must badge it accordingly. Auto-verified citations
        # are an explicit upgrade.
        c = CitationRef(citation_id="C1")
        assert c.status == "unverified"
