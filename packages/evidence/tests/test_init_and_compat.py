"""Tests for ``deepsynaps_evidence.__init__`` and ``_compat``.

Pins the **degrade-don't-crash** shims that older qEEG callers rely on
when the API ``app.database`` stack is not importable:

- ``_compat.HAS_PGVECTOR`` / ``HAS_SENTENCE_TRANSFORMERS`` are booleans
  produced from a guarded import — they must exist regardless of
  whether the optional dep is installed.
- ``grade_evidence(...)`` is the legacy alias that forwards to
  ``scoring.assign_grade``.
- ``search_papers("")`` returns ``[]`` without touching the DB.
- ``search_papers("query")`` returns ``[]`` if ``app.database`` cannot
  be imported (e.g. the slim install) — never raises.
- ``search_papers("query")`` projects ``Citation`` rows to lightweight
  dicts with only documented keys.
"""
from __future__ import annotations

import sys
import types
from typing import Any
from unittest import mock

import deepsynaps_evidence as evidence
from deepsynaps_evidence import _compat


class TestCompatFlags:
    def test_pgvector_flag_is_bool(self) -> None:
        # Pin: HAS_PGVECTOR is always a bool — never None, never raises.
        assert isinstance(_compat.HAS_PGVECTOR, bool)

    def test_sentence_transformers_flag_is_bool(self) -> None:
        assert isinstance(_compat.HAS_SENTENCE_TRANSFORMERS, bool)

    def test_pgvector_attr_present(self) -> None:
        # Pin: PgVector attr is exported (either the real class or None
        # — but the attribute exists for downstream type-checking).
        assert hasattr(_compat, "PgVector")

    def test_all_exports_match(self) -> None:
        # Pin: __all__ contract — refactor cannot silently drop a name.
        assert set(_compat.__all__) == {
            "HAS_PGVECTOR",
            "HAS_SENTENCE_TRANSFORMERS",
            "PgVector",
        }


class TestGradeEvidenceShim:
    def test_delegates_to_assign_grade(self) -> None:
        # Pin: grade_evidence(None, None) returns whatever assign_grade
        # returns. The shim exists so older qEEG callers can probe for
        # the symbol — it must not silently return a different value.
        from deepsynaps_evidence.scoring import assign_grade

        assert evidence.grade_evidence(None, None) == assign_grade(None, None)


class TestSearchPapersDegrade:
    def test_empty_query_returns_empty(self) -> None:
        # Pin: empty / whitespace query short-circuits to [] before any
        # DB import is attempted.
        assert evidence.search_papers("") == []
        assert evidence.search_papers("   ") == []

    def test_missing_app_database_returns_empty(
        self, monkeypatch: Any
    ) -> None:
        # Pin: when app.database cannot be imported (slim install path),
        # search_papers must return [] instead of raising. This is the
        # whole reason the shim exists — older qEEG callers probe it
        # without the API stack present.
        # Force the inner import to fail.
        original_import = __builtins__["__import__"] if isinstance(__builtins__, dict) else __builtins__.__import__

        def _block_app_database(name: str, *args, **kwargs):
            if name == "app.database":
                raise ImportError("forced for test")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr("builtins.__import__", _block_app_database)
        assert evidence.search_papers("alpha rhythm") == []

    def test_corpus_adapter_failure_returns_empty(
        self, monkeypatch: Any
    ) -> None:
        # Pin: even if app.database imports cleanly, an exception from
        # corpus_adapter.find_similar_text must NOT propagate.
        fake_session = mock.MagicMock()
        fake_session_local = mock.MagicMock(return_value=fake_session)

        # Inject a fake app.database module exposing SessionLocal.
        fake_app = types.ModuleType("app")
        fake_db = types.ModuleType("app.database")
        fake_db.SessionLocal = fake_session_local  # type: ignore[attr-defined]
        fake_app.database = fake_db  # type: ignore[attr-defined]
        monkeypatch.setitem(sys.modules, "app", fake_app)
        monkeypatch.setitem(sys.modules, "app.database", fake_db)

        # Make corpus_adapter.find_similar_text blow up.
        monkeypatch.setattr(
            "deepsynaps_evidence.corpus_adapter.find_similar_text",
            mock.MagicMock(side_effect=RuntimeError("boom")),
        )

        out = evidence.search_papers("alpha rhythm")
        assert out == []
        # Session must still be closed even on failure.
        fake_session.close.assert_called_once()

    def test_projects_citations_to_dicts(
        self, monkeypatch: Any
    ) -> None:
        # Pin: a successful search returns lightweight dicts with the
        # documented keys — not the full Citation pydantic model. The
        # legacy qEEG caller depends on the dict shape.
        fake_hit = mock.MagicMock()
        fake_hit.title = "Alpha rhythm review"
        fake_hit.url = "https://example.org/p/1"
        fake_hit.pmid = "12345"
        fake_hit.year = 2020
        fake_hit.evidence_grade = "B"

        fake_session = mock.MagicMock()
        fake_session_local = mock.MagicMock(return_value=fake_session)

        fake_app = types.ModuleType("app")
        fake_db = types.ModuleType("app.database")
        fake_db.SessionLocal = fake_session_local  # type: ignore[attr-defined]
        fake_app.database = fake_db  # type: ignore[attr-defined]
        monkeypatch.setitem(sys.modules, "app", fake_app)
        monkeypatch.setitem(sys.modules, "app.database", fake_db)

        monkeypatch.setattr(
            "deepsynaps_evidence.corpus_adapter.find_similar_text",
            mock.MagicMock(return_value=[fake_hit]),
        )

        out = evidence.search_papers("alpha rhythm", limit=2)
        assert len(out) == 1
        # Pin the documented keys.
        assert set(out[0].keys()) == {
            "title",
            "url",
            "pmid",
            "year",
            "evidence_level",
        }
        # evidence_level mirrors evidence_grade on the citation row.
        assert out[0]["evidence_level"] == "B"
        assert out[0]["pmid"] == "12345"
        assert out[0]["year"] == 2020
        # Session closed even on success.
        fake_session.close.assert_called_once()


class TestPackageExports:
    def test_top_level_all_pinned(self) -> None:
        # Pin: __all__ exports cannot silently drop a public name.
        expected = {
            "Caution",
            "Citation",
            "CitationType",
            "Claim",
            "ConfidenceBand",
            "ConfidenceLabel",
            "EvidenceGrade",
            "EvidenceRef",
            "IssueSeverity",
            "IssueType",
            "MethodProvenance",
            "ScoreResponse",
            "ScoreScale",
            "TopContributor",
            "ValidationIssue",
            "ValidationRequest",
            "ValidationResult",
            "grade_evidence",
            "search_papers",
            "cap_confidence",
            "hash_inputs",
        }
        assert set(evidence.__all__) == expected

    def test_all_names_are_attrs(self) -> None:
        # Each __all__ name must actually be importable from the package.
        for name in evidence.__all__:
            assert hasattr(evidence, name), f"{name} missing from package"
