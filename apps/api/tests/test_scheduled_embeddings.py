"""Tests for ``app.services.scheduled_embeddings.run_embed_papers_cycle``.

Covers two points:

1. The envelope shape is
   ``{"embedded": int, "pending": int, "elapsed_sec": float}`` even when
   no papers were processed.
2. If sentence-transformers is missing, the cycle surfaces an ``error``
   key rather than raising.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import pytest


def _run(coro):
    return asyncio.run(coro)


@pytest.fixture
def scheduled_mod(monkeypatch):
    import app.services.scheduled_embeddings as scheduled

    return scheduled


@dataclass
class _FakeSummary:
    embedded: int = 0
    batches: int = 0
    elapsed_sec: float = 0.01
    pending_before: int = 0
    error: str | None = None


def test_run_embed_papers_cycle_envelope_shape(monkeypatch, scheduled_mod):
    """Happy-path: returns {embedded, pending, elapsed_sec}."""
    class _FakeEmbed:
        @staticmethod
        def run_embedding(**kwargs: Any) -> _FakeSummary:
            assert kwargs["batch_size"] == 64
            assert kwargs["max_batches"] == 10
            assert kwargs["dry_run"] is False
            return _FakeSummary(
                embedded=32, batches=1, elapsed_sec=1.25, pending_before=40
            )

    monkeypatch.setattr(
        scheduled_mod,
        "_run_cycle_sync",
        lambda url, *, batch_size, max_batches: {
            "embedded": 32,
            "pending": 8,
            "elapsed_sec": 1.25,
        },
    )
    monkeypatch.setenv("DEEPSYNAPS_DATABASE_URL", "sqlite:///:memory:")

    envelope = _run(
        scheduled_mod.run_embed_papers_cycle(
            None, batch_size=64, max_batches=10
        )
    )
    assert set(envelope.keys()) >= {"embedded", "pending", "elapsed_sec"}
    assert isinstance(envelope["embedded"], int)
    assert isinstance(envelope["pending"], int)
    assert isinstance(envelope["elapsed_sec"], float)
    assert envelope["embedded"] == 32
    assert envelope["pending"] == 8


def test_run_embed_papers_cycle_missing_dep_envelope(monkeypatch, scheduled_mod):
    """sentence-transformers missing → error envelope, no exception."""
    monkeypatch.setattr(
        scheduled_mod,
        "_run_cycle_sync",
        lambda url, *, batch_size, max_batches: {
            "embedded": 0,
            "pending": 12,
            "elapsed_sec": 0.0,
            "error": "sentence_transformers missing",
        },
    )
    monkeypatch.setenv("DEEPSYNAPS_DATABASE_URL", "sqlite:///:memory:")

    envelope = _run(
        scheduled_mod.run_embed_papers_cycle(None, batch_size=16, max_batches=2)
    )
    assert envelope["embedded"] == 0
    assert envelope["error"] == "sentence_transformers missing"
    assert envelope["pending"] == 12
    assert envelope["elapsed_sec"] == 0.0
