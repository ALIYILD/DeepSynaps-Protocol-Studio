"""Tests for ``deepsynaps_qa.checks.citations`` edge cases.

The existing engine-level golden/broken tests cover the happy path
and the no-citations BLOCK. This file pins three citation-edge
contracts that don't surface elsewhere:

- **Malformed PMID**: a non-numeric or wrong-length PMID string emits
  a WARNING (``citations.missing_pmid``). The check accepts only
  7-8 digit PMIDs (the canonical PubMed range).
- **No PMID + no DOI**: a citation with neither a valid PMID nor a
  DOI emits a WARNING. Decision-support reports cannot ship with
  un-locatable references.
- **No PMID + valid DOI**: DOI alone is acceptable (does NOT WARN
  on missing-pmid). DOI-only citations are common for non-PubMed
  journals and must remain valid.
"""
from __future__ import annotations

import pytest

from deepsynaps_qa.checks.citations import CitationsCheck
from deepsynaps_qa.models import (
    Artifact,
    ArtifactType,
    CheckSeverity,
    QASpec,
)


def _spec(citation_floor: int = 1) -> QASpec:
    return QASpec(
        spec_id="spec:test_v1",
        artifact_type=ArtifactType.QEEG_NARRATIVE,
        citation_floor=citation_floor,
    )


def _artifact_with_citations(citations: list[dict]) -> Artifact:
    return Artifact(
        artifact_id="A-1",
        artifact_type=ArtifactType.QEEG_NARRATIVE,
        content="claim with citation [1].",
        citations=citations,
    )


class TestMalformedPmid:
    @pytest.mark.parametrize(
        "bad_pmid",
        [
            "12345",         # too short (5 digits)
            "abcdefg",       # not numeric
            "123456789",     # too long (9 digits)
            "12-345-67",     # has separators
        ],
    )
    def test_malformed_pmid_emits_missing_pmid_warning(
        self, bad_pmid: str
    ) -> None:
        # Pin: PMID outside the 7-8 digit canonical range emits a
        # WARNING with check_id citations.missing_pmid. The location
        # carries the bad value so reviewers can find it.
        out = CitationsCheck().run(
            _artifact_with_citations([{"pmid": bad_pmid, "title": "T"}]),
            _spec(),
        )
        warnings = [
            r for r in out
            if r.check_id == "citations.missing_pmid"
            and r.severity == CheckSeverity.WARNING
        ]
        assert len(warnings) >= 1
        assert any(bad_pmid in (r.location or "") for r in warnings)
        assert all(r.passed is False for r in warnings)


class TestNoPmidNoDoi:
    def test_blank_pmid_blank_doi_warns(self) -> None:
        # Pin: a citation with neither PMID nor DOI is un-locatable
        # and must trigger a WARNING. Decision-support reports
        # cannot ship with refs the reader can't follow.
        out = CitationsCheck().run(
            _artifact_with_citations([{"pmid": "", "doi": ""}]),
            _spec(),
        )
        warnings = [
            r for r in out
            if r.check_id == "citations.missing_pmid"
            and r.severity == CheckSeverity.WARNING
            and r.location == "citations"
        ]
        assert len(warnings) >= 1
        # message explicitly mentions both PMID and DOI absence.
        assert any(
            "PMID" in r.message and "DOI" in r.message
            for r in warnings
        )

    def test_doi_string_without_doi_pattern_warns(self) -> None:
        # Pin: a "doi" field that doesn't match the DOI regex (e.g.
        # arbitrary text) is rejected. Only canonical 10.NNNN/...
        # DOIs satisfy the missing-PMID fallback.
        out = CitationsCheck().run(
            _artifact_with_citations(
                [{"pmid": "", "doi": "not-a-doi-just-text"}]
            ),
            _spec(),
        )
        warnings = [
            r for r in out
            if r.check_id == "citations.missing_pmid"
            and r.severity == CheckSeverity.WARNING
        ]
        assert len(warnings) >= 1


class TestDoiOnlyAccepted:
    def test_valid_doi_no_pmid_does_not_warn(self) -> None:
        # Pin: DOI-only citations are common for non-PubMed journals
        # and must remain valid. A canonical 10.XXXX/... DOI in the
        # 'doi' field satisfies the missing-pmid fallback — no
        # WARNING for that citation.
        out = CitationsCheck().run(
            _artifact_with_citations(
                [{"pmid": "", "doi": "10.1038/nature12345"}]
            ),
            _spec(citation_floor=0),  # so we don't trip below_floor
        )
        # The missing_pmid warning for THIS citation must NOT fire
        # (DOI satisfies the fallback). Other citation warnings
        # for things like below_floor are fine.
        missing_pmid = [
            r for r in out
            if r.check_id == "citations.missing_pmid"
            and r.severity == CheckSeverity.WARNING
            and r.location == "citations"
        ]
        # No "Citation lacks a valid PMID or DOI" should have fired.
        assert all(
            "lacks a valid PMID or DOI" not in r.message
            for r in missing_pmid
        )
