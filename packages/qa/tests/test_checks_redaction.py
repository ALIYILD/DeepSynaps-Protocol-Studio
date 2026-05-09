"""Tests for ``deepsynaps_qa.checks.redaction.RedactionCheck``.

Pins the load-bearing **PII / PHI redaction** safety contract:

- Presidio missing -> INFO + passed=True with a clear "install
  deepsynaps-qa[redaction]" hint (skip, not silent fail).
- Presidio detecting >=0.7 confidence findings -> BLOCK + passed=False
  with the entity types listed (BLOCK forces FAIL via verdict).
- Partial redaction patterns ("J*** Smith", "123-**-4567",
  "John ****", "**** Smith") -> WARNING + passed=False (someone
  half-redacted; reviewer must fix).
- Sections are concatenated into the corpus alongside content so PII
  inside a section body is caught.
- All-clean -> INFO + passed=True ("No PII detected").
"""
from __future__ import annotations

from typing import Any
from unittest import mock

import pytest

from deepsynaps_qa.checks.redaction import (
    PARTIAL_REDACTION_PATTERNS,
    PRESIDIO_ENTITY_TYPES,
    RedactionCheck,
)
from deepsynaps_qa.models import (
    Artifact,
    ArtifactType,
    CheckSeverity,
    QASpec,
)


def _spec() -> QASpec:
    return QASpec(
        spec_id="spec:test_v1",
        artifact_type=ArtifactType.QEEG_NARRATIVE,
    )


def _artifact(*, content: str = "", sections: list[dict[str, Any]] | None = None) -> Artifact:
    return Artifact(
        artifact_id="A1",
        artifact_type=ArtifactType.QEEG_NARRATIVE,
        content=content,
        sections=sections or [],
    )


# ── Constants ────────────────────────────────────────────────────────────


class TestPresidioEntityTypes:
    def test_canonical_types_pinned(self) -> None:
        # Pin the documented PII entity types — refactor cannot drop one.
        assert "PERSON" in PRESIDIO_ENTITY_TYPES
        assert "EMAIL_ADDRESS" in PRESIDIO_ENTITY_TYPES
        assert "PHONE_NUMBER" in PRESIDIO_ENTITY_TYPES
        assert "CREDIT_CARD" in PRESIDIO_ENTITY_TYPES
        assert "US_SSN" in PRESIDIO_ENTITY_TYPES
        assert "UK_NHS" in PRESIDIO_ENTITY_TYPES
        assert "IP_ADDRESS" in PRESIDIO_ENTITY_TYPES


class TestPartialRedactionPatterns:
    @pytest.mark.parametrize(
        "text",
        [
            "Patient is J*** Smith",
            "ID 123-**-4567 issued",
            "John **** filed report",
            "**** Smith reviewed",
        ],
    )
    def test_each_partial_pattern_matches(self, text: str) -> None:
        # Pin: every documented partial-redaction pattern fires.
        matched = any(pat.search(text) for pat in PARTIAL_REDACTION_PATTERNS)
        assert matched, f"expected a partial-redaction match in: {text!r}"


# ── RedactionCheck behaviour ─────────────────────────────────────────────


class TestRedactionCheckPresidioMissing:
    def test_emits_info_passed_with_install_hint(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: Presidio missing -> INFO + passed=True. The check
        # cannot silently swallow real PII, but it also cannot block
        # when the optional dep just isn't installed.
        monkeypatch.setattr(
            "deepsynaps_qa.checks.redaction.get_presidio_analyzer",
            lambda: None,
        )
        out = RedactionCheck().run(_artifact(content="hello"), _spec())
        assert any(
            r.severity == CheckSeverity.INFO
            and r.passed is True
            and "Presidio not installed" in r.message
            for r in out
        )


class TestRedactionCheckPresidioPresent:
    def _fake_analyzer(self, findings: list[Any]) -> Any:
        analyzer = mock.MagicMock()
        analyzer.analyze.return_value = findings
        return analyzer

    def _finding(self, *, entity_type: str, score: float) -> Any:
        f = mock.MagicMock()
        f.entity_type = entity_type
        f.score = score
        return f

    def test_high_confidence_pii_emits_block(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin THE load-bearing PII safety contract: any >=0.7
        # confidence finding emits BLOCK + passed=False so the
        # downstream verdict logic forces FAIL on PII leakage.
        analyzer = self._fake_analyzer(
            [
                self._finding(entity_type="PERSON", score=0.85),
                self._finding(entity_type="EMAIL_ADDRESS", score=0.92),
            ]
        )
        monkeypatch.setattr(
            "deepsynaps_qa.checks.redaction.get_presidio_analyzer",
            lambda: analyzer,
        )
        out = RedactionCheck().run(
            _artifact(content="John Doe; john@example.com"), _spec()
        )
        blocks = [r for r in out if r.severity == CheckSeverity.BLOCK]
        assert len(blocks) == 1
        assert blocks[0].passed is False
        # Entity types listed in the message (sorted).
        assert "EMAIL_ADDRESS" in blocks[0].message
        assert "PERSON" in blocks[0].message

    def test_low_confidence_findings_ignored(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Findings below 0.7 confidence don't trip BLOCK.
        analyzer = self._fake_analyzer(
            [self._finding(entity_type="PERSON", score=0.5)]
        )
        monkeypatch.setattr(
            "deepsynaps_qa.checks.redaction.get_presidio_analyzer",
            lambda: analyzer,
        )
        out = RedactionCheck().run(_artifact(content="some text"), _spec())
        # No BLOCK from the low-confidence finding.
        assert all(r.severity != CheckSeverity.BLOCK for r in out)

    def test_no_findings_emits_no_pii_detected_info(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        analyzer = self._fake_analyzer([])
        monkeypatch.setattr(
            "deepsynaps_qa.checks.redaction.get_presidio_analyzer",
            lambda: analyzer,
        )
        out = RedactionCheck().run(_artifact(content="clean text"), _spec())
        assert any(
            r.severity == CheckSeverity.INFO
            and r.passed is True
            and "No PII detected" in r.message
            for r in out
        )

    def test_section_body_concatenated_into_corpus(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The check concatenates section.body + section.content into
        # the corpus so PII hidden in a section is also caught.
        captured: dict[str, str] = {}

        def _capture_analyze(*, text: str, entities, language):  # noqa: ARG001
            captured["text"] = text
            return []

        analyzer = mock.MagicMock()
        analyzer.analyze.side_effect = _capture_analyze
        monkeypatch.setattr(
            "deepsynaps_qa.checks.redaction.get_presidio_analyzer",
            lambda: analyzer,
        )
        RedactionCheck().run(
            _artifact(
                content="alpha",
                sections=[{"body": "beta", "content": "gamma"}],
            ),
            _spec(),
        )
        # alpha + beta + gamma all in the analysed corpus.
        assert "alpha" in captured["text"]
        assert "beta" in captured["text"]
        assert "gamma" in captured["text"]


class TestPartialRedactionDetection:
    def test_partial_pattern_emits_warning(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Pin: a partially-redacted token in the body -> WARNING +
        # passed=False so the reviewer fixes the half-redaction.
        analyzer = mock.MagicMock()
        analyzer.analyze.return_value = []
        monkeypatch.setattr(
            "deepsynaps_qa.checks.redaction.get_presidio_analyzer",
            lambda: analyzer,
        )
        out = RedactionCheck().run(
            _artifact(content="Patient is J*** Smith and was reviewed"),
            _spec(),
        )
        warnings = [r for r in out if r.severity == CheckSeverity.WARNING]
        assert len(warnings) >= 1
        assert any(w.passed is False for w in warnings)
        assert any("Partial redaction" in w.message for w in warnings)

    def test_only_one_warning_per_doc(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The check breaks after the first partial pattern match — so
        # one doc emits at most one partial-redaction warning even if
        # multiple patterns fire.
        analyzer = mock.MagicMock()
        analyzer.analyze.return_value = []
        monkeypatch.setattr(
            "deepsynaps_qa.checks.redaction.get_presidio_analyzer",
            lambda: analyzer,
        )
        text = "J*** Smith and 123-**-4567 both appear"
        out = RedactionCheck().run(_artifact(content=text), _spec())
        warnings = [r for r in out if r.severity == CheckSeverity.WARNING]
        assert len(warnings) == 1
