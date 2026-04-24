"""Tests for ``scripts/embed_papers.py``.

We do not exercise the real sentence-transformers encoder here — that
requires a multi-GB model download. Instead we verify:

1. The CLI module imports cleanly (no side-effects at import time).
2. ``--dry-run`` prints the pending count and issues no UPDATE.
3. The CLI returns a clear error envelope when sentence-transformers is
   missing from the environment.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))


@pytest.fixture
def embed_papers_mod():
    """Fresh import each test so monkeypatches do not bleed across."""
    if "embed_papers" in sys.modules:
        del sys.modules["embed_papers"]
    import embed_papers  # type: ignore

    return embed_papers


def test_cli_imports_cleanly(embed_papers_mod):
    """Importing the script module MUST NOT raise or perform IO.

    Also sanity-check the canonical constants and the ``main`` callable
    are exposed at module level.
    """
    assert callable(embed_papers_mod.main)
    assert callable(embed_papers_mod.run_embedding)
    assert embed_papers_mod.EMBEDDING_DIM == 200
    assert embed_papers_mod.DEFAULT_MODEL.startswith("BAAI/")


def test_dry_run_does_not_write(embed_papers_mod, monkeypatch, capsys):
    """``--dry-run`` must report the pending count without calling the encoder."""
    calls = {"pending": 0, "update": 0, "encode": 0}

    class _FakeResult:
        def __init__(self, value: int) -> None:
            self._value = value

        def first(self):
            return (self._value,)

        def fetchall(self):  # unused in dry-run
            return []

    class _FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def execute(self, *_args, **_kwargs):
            calls["pending"] += 1
            return _FakeResult(42)

        def commit(self):  # pragma: no cover - not reached
            calls["update"] += 1

    class _FakeSessionFactory:
        def __call__(self):
            return _FakeSession()

    class _FakeEngine:
        pass

    def _fake_create_engine(_url, **_kw):
        return _FakeEngine()

    def _fake_sessionmaker(**_kw):
        return _FakeSessionFactory()

    monkeypatch.setenv("DEEPSYNAPS_DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setattr(
        "sqlalchemy.create_engine", _fake_create_engine, raising=False
    )
    monkeypatch.setattr(
        "sqlalchemy.orm.sessionmaker", _fake_sessionmaker, raising=False
    )

    # Encoder loader should NEVER be called under --dry-run.
    def _boom(_model):
        calls["encode"] += 1
        raise AssertionError("encoder must not load under --dry-run")

    monkeypatch.setattr(embed_papers_mod, "_load_encoder", _boom)

    rc = embed_papers_mod.main(["--dry-run"])
    assert rc == 0
    captured = capsys.readouterr()
    assert "pending: 42 papers" in captured.out
    assert calls["encode"] == 0
    assert calls["update"] == 0


def test_error_envelope_when_sentence_transformers_missing(
    embed_papers_mod, monkeypatch, capsys
):
    """If ``_load_encoder`` returns ``None`` the script exits 3 with a hint."""
    class _FakeResult:
        def first(self):
            return (5,)

        def fetchall(self):
            return []

    class _FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def execute(self, *_args, **_kwargs):
            return _FakeResult()

        def commit(self):  # pragma: no cover - not reached
            pass

    class _FakeSessionFactory:
        def __call__(self):
            return _FakeSession()

    def _fake_create_engine(_url, **_kw):
        return object()

    def _fake_sessionmaker(**_kw):
        return _FakeSessionFactory()

    monkeypatch.setenv("DEEPSYNAPS_DATABASE_URL", "sqlite:///:memory:")
    monkeypatch.setattr(
        "sqlalchemy.create_engine", _fake_create_engine, raising=False
    )
    monkeypatch.setattr(
        "sqlalchemy.orm.sessionmaker", _fake_sessionmaker, raising=False
    )
    monkeypatch.setattr(embed_papers_mod, "_load_encoder", lambda _m: None)

    rc = embed_papers_mod.main([])  # no --dry-run
    assert rc == 3
    err = capsys.readouterr().err
    assert "sentence_transformers missing" in err
    assert "pip install sentence-transformers" in err
