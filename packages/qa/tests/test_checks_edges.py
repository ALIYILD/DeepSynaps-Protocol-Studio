"""Edge-case tests for ``deepsynaps_qa.checks`` modules.

Pins three contracts not surfaced by the engine-level golden tests:

- **PlaceholdersCheck** flags numeric-stub values (``0.00``, ``N/A``,
  bare em-dash) as WARNING per section. Stub numerics are the
  classic "report shipped with sample data" failure mode.
- **SectionsCheck** flags out-of-canonical-order sections as INFO
  (passed=False). Reports must follow the spec ordering for
  reviewer ergonomics.
- **LanguageCheck** degrades to INFO + passed=True when textstat is
  not installed (slim install path) — never blocks reading-level
  on a missing optional dep.
"""
from __future__ import annotations

from unittest import mock

import pytest

from deepsynaps_qa.checks.language import LanguageCheck
from deepsynaps_qa.checks.placeholders import PlaceholdersCheck
from deepsynaps_qa.checks.sections import SectionsCheck
from deepsynaps_qa.models import (
    Artifact,
    ArtifactType,
    CheckSeverity,
    QASpec,
)


def _spec(**overrides) -> QASpec:
    base = dict(
        spec_id="spec:test_v1",
        artifact_type=ArtifactType.QEEG_NARRATIVE,
    )
    base.update(overrides)
    return QASpec(**base)


# ── PlaceholdersCheck.numeric_stub ──────────────────────────────────


class TestPlaceholdersNumericStub:
    @pytest.mark.parametrize(
        "stub_text",
        [
            "Score: 0.00 reported.",
            "Result is N/A in this section.",
            "Reading is — ; reviewer to confirm.",
        ],
    )
    def test_numeric_stub_emits_warning(self, stub_text: str) -> None:
        # Pin: stub numerics in a section body emit a WARNING with
        # check_id placeholders.numeric_stub. This is the "report
        # shipped with sample data" failure mode that fooled
        # downstream readers in past incidents.
        art = Artifact(
            artifact_id="A",
            artifact_type=ArtifactType.QEEG_NARRATIVE,
            content="Some narrative text here.",
            sections=[{"section_id": "findings", "body": stub_text}],
        )
        out = PlaceholdersCheck().run(art, _spec())
        warnings = [
            r for r in out
            if r.check_id == "placeholders.numeric_stub"
            and r.severity == CheckSeverity.WARNING
        ]
        assert len(warnings) >= 1
        # location includes the section_id so the reviewer can find it.
        assert any("findings" in (r.location or "") for r in warnings)
        assert all(r.passed is False for r in warnings)

    def test_clean_section_no_warning(self) -> None:
        # Pin: a section with real numbers does NOT trigger the stub
        # warning.
        art = Artifact(
            artifact_id="A",
            artifact_type=ArtifactType.QEEG_NARRATIVE,
            content="Narrative.",
            sections=[{"section_id": "findings", "body": "Score: 0.42 reported."}],
        )
        out = PlaceholdersCheck().run(art, _spec())
        assert all(
            r.check_id != "placeholders.numeric_stub"
            for r in out
        )


# ── SectionsCheck.ordering_violation ────────────────────────────────


class TestSectionsOrdering:
    def test_out_of_order_emits_info(self) -> None:
        # Pin: required sections present but in the wrong order
        # emits an INFO ordering_violation. Reports must follow the
        # spec ordering for reviewer ergonomics; the INFO doesn't
        # BLOCK but does surface the issue in the QA result.
        spec = _spec(required_sections=["intro", "findings", "limitations"])
        # Provide all 3 sections (with enough words to skip empty
        # warning) but in the wrong order.
        body = " ".join(["word"] * 60)  # 60 words > 50 threshold
        art = Artifact(
            artifact_id="A",
            artifact_type=ArtifactType.QEEG_NARRATIVE,
            content="Narrative.",
            sections=[
                {"section_id": "limitations", "body": body},
                {"section_id": "intro", "body": body},
                {"section_id": "findings", "body": body},
            ],
        )
        out = SectionsCheck().run(art, spec)
        violations = [
            r for r in out
            if r.check_id == "sections.ordering_violation"
            and r.severity == CheckSeverity.INFO
        ]
        assert len(violations) == 1
        assert violations[0].passed is False
        assert "canonical order" in violations[0].message

    def test_in_order_no_violation(self) -> None:
        # Pin: correct order produces NO ordering_violation result.
        spec = _spec(required_sections=["intro", "findings"])
        body = " ".join(["word"] * 60)
        art = Artifact(
            artifact_id="A",
            artifact_type=ArtifactType.QEEG_NARRATIVE,
            content="Narrative.",
            sections=[
                {"section_id": "intro", "body": body},
                {"section_id": "findings", "body": body},
            ],
        )
        out = SectionsCheck().run(art, spec)
        assert all(
            r.check_id != "sections.ordering_violation"
            for r in out
        )


# ── LanguageCheck textstat-not-installed skip ───────────────────────


class TestLanguageTextstatMissing:
    def test_textstat_unavailable_emits_info_passed(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: when textstat is not installed, the reading-level
        # check skips with INFO + passed=True. The QA runner must
        # NEVER block on a missing OPTIONAL dep — a regression that
        # downgraded this to WARNING/BLOCK would crash the slim
        # install path that doesn't ship textstat.
        monkeypatch.setattr(
            "deepsynaps_qa.checks.language.get_textstat",
            lambda: None,
        )
        art = Artifact(
            artifact_id="A",
            artifact_type=ArtifactType.QEEG_NARRATIVE,
            content="Some narrative content with strong confidence.",
        )
        out = LanguageCheck().run(art, _spec())
        skips = [
            r for r in out
            if r.check_id == "language.reading_level_out_of_range"
            and r.severity == CheckSeverity.INFO
            and r.passed is True
            and "textstat" in r.message
        ]
        assert len(skips) == 1
