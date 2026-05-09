"""Supplementary tests for ``deepsynaps_qeeg.report.rag``.

The existing test_rag.py has 2 tests covering the happy-path JSON
fallback. This file fills the gaps: postgres dispatch + failure path,
explicit fallback_path arg, malformed-JSON / wrong-shape JSON,
no-fallback-file path, env-var DSN selection.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest import mock

import pytest

from deepsynaps_qeeg.report.rag import _load_fallback, query_literature


# ── Fallback file edge cases ───────────────────────────────────────────────


class TestLoadFallback:
    def test_missing_fallback_file_returns_empty_with_warning(
        self,
        tmp_path: Path,
    ) -> None:
        out = _load_fallback(
            ["adhd"], [], 5, fallback_path=tmp_path / "does-not-exist.json"
        )
        assert out == []

    def test_malformed_json_returns_empty(self, tmp_path: Path) -> None:
        path = tmp_path / "bad.json"
        path.write_text("not json", encoding="utf-8")
        out = _load_fallback(["adhd"], [], 5, fallback_path=path)
        assert out == []

    def test_wrong_shape_returns_empty(self, tmp_path: Path) -> None:
        # Pin: a JSON file that's not a list (e.g., dict at the top
        # level) returns [] rather than raising — defensive parsing.
        path = tmp_path / "wrong.json"
        path.write_text('{"papers": []}', encoding="utf-8")
        out = _load_fallback(["adhd"], [], 5, fallback_path=path)
        assert out == []

    def test_explicit_fallback_path_is_used(self, tmp_path: Path) -> None:
        path = tmp_path / "custom.json"
        papers = [
            {
                "pmid": "P1",
                "doi": "10.1/x",
                "title": "Custom paper",
                "authors": "A.",
                "year": 2024,
                "journal": "J",
                "abstract": "abs",
                "conditions": ["adhd"],
                "modalities": ["neurofeedback"],
            }
        ]
        path.write_text(json.dumps(papers), encoding="utf-8")
        out = _load_fallback(["adhd"], ["neurofeedback"], 5, fallback_path=path)
        assert len(out) == 1
        assert out[0]["pmid"] == "P1"
        # relevance_score reflects the 1 condition + 1 modality match.
        assert out[0]["relevance_score"] == 2.0

    def test_no_filter_returns_all_when_lists_empty(
        self,
        tmp_path: Path,
    ) -> None:
        # When BOTH conditions and modalities are empty, every paper
        # passes the score==0 filter (because cond_set + mod_set are
        # both empty, the early continue isn't triggered).
        path = tmp_path / "all.json"
        path.write_text(
            json.dumps(
                [
                    {"pmid": "P-irrelevant", "title": "X", "conditions": [], "modalities": []},
                ]
            ),
            encoding="utf-8",
        )
        out = _load_fallback([], [], 5, fallback_path=path)
        assert len(out) == 1

    def test_top_k_caps_results(self, tmp_path: Path) -> None:
        path = tmp_path / "many.json"
        papers = [
            {
                "pmid": f"P{i}",
                "title": f"T{i}",
                "conditions": ["adhd"],
            }
            for i in range(10)
        ]
        path.write_text(json.dumps(papers), encoding="utf-8")
        out = _load_fallback(["adhd"], [], 3, fallback_path=path)
        assert len(out) == 3


# ── Postgres path dispatch ─────────────────────────────────────────────────


class TestQueryLiterature:
    def test_db_url_kwarg_attempts_postgres_then_falls_back(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # When db_url is given, Postgres is attempted first. Make
        # _query_postgres raise to force the fallback path. Verify
        # the result still returns (no exception bubbles up).
        from deepsynaps_qeeg.report import rag as rag_mod

        def _boom(*args, **kwargs):
            raise RuntimeError("simulated db down")

        monkeypatch.setattr(rag_mod, "_query_postgres", _boom)
        # Should NOT raise — falls through to fallback JSON.
        out = query_literature(["adhd"], ["neurofeedback"], top_k=5, db_url="postgres://x")
        assert isinstance(out, list)

    def test_env_var_dsn_used_when_no_kwarg(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Env var DEEPSYNAPS_DB_URL becomes the DSN when db_url=None.
        from deepsynaps_qeeg.report import rag as rag_mod

        captured: dict[str, str] = {}

        def _capture_dsn(dsn, conditions, modalities, top_k):
            captured["dsn"] = dsn
            return []

        monkeypatch.setenv("DEEPSYNAPS_DB_URL", "postgres://from-env")
        monkeypatch.setattr(rag_mod, "_query_postgres", _capture_dsn)
        query_literature(["adhd"], [], top_k=3)
        assert captured["dsn"] == "postgres://from-env"

    def test_no_dsn_anywhere_uses_fallback(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.delenv("DEEPSYNAPS_DB_URL", raising=False)
        out = query_literature(["adhd"], ["neurofeedback"], top_k=5)
        assert isinstance(out, list)
        # Toy fixture has the ADHD paper.
        assert any(p.get("pmid") == "30000001" for p in out)

    def test_postgres_path_emits_psycopg_unavailable_when_missing(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # If psycopg isn't importable, _query_postgres raises RuntimeError
        # — the wrapper catches that and falls back to JSON.
        from deepsynaps_qeeg.report import rag as rag_mod

        # Block psycopg import.
        original_import = __import__

        def _blocked_import(name, *args, **kwargs):
            if name == "psycopg":
                raise ImportError("simulated missing psycopg")
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr("builtins.__import__", _blocked_import)
        out = query_literature(["adhd"], [], top_k=5, db_url="postgres://x")
        # Falls back, doesn't raise.
        assert isinstance(out, list)


# ── _query_postgres shape ──────────────────────────────────────────────────


class TestQueryPostgresShape:
    def test_query_postgres_emits_relevance_score_from_hit_counts(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Wire a fake psycopg.connect that yields fixed rows. Verify the
        # _query_postgres emitter shapes them into the contract dict
        # with the relevance_score = condition_hits + modality_hits.
        from deepsynaps_qeeg.report import rag as rag_mod

        class _FakeCursor:
            def __init__(self, rows):
                self._rows = rows

            def execute(self, *args, **kwargs):
                pass

            def fetchall(self):
                return self._rows

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        class _FakeConn:
            def __init__(self, rows):
                self._rows = rows

            def cursor(self):
                return _FakeCursor(self._rows)

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        rows = [
            ("12345", "10.1/x", "Title", "A; B", 2024, "Journal", "abs", 2, 1),
            ("67890", None, "T2", "C", None, None, None, 0, 0),
        ]
        fake_psycopg = mock.MagicMock()
        fake_psycopg.connect.return_value = _FakeConn(rows)
        monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)

        out = rag_mod._query_postgres(
            "postgres://fake", ["adhd"], ["neurofeedback"], top_k=5
        )
        assert len(out) == 2
        assert out[0]["pmid"] == "12345"
        assert out[0]["relevance_score"] == 3.0
        assert out[0]["year"] == 2024
        # year=None and chits/mhits=0 produce relevance_score=0 + year=None.
        assert out[1]["year"] is None
        assert out[1]["relevance_score"] == 0.0
