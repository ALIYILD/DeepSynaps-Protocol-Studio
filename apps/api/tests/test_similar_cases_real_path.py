"""Tests for the pgvector real-path in ``similar_cases.find_similar``.

Covers the five contract points from the task brief:

1. ``_pgvector_similar`` returns ``None`` when the bridge is missing.
2. ``_pgvector_similar`` returns K rows when the bridge returns K.
3. Privacy fallback: real path yielding K<5 collapses to aggregate.
4. PHI scrubber drops every banned key from real-path rows.
5. Deterministic stub still wins when real path returns an empty list.
"""
from __future__ import annotations

import sys
from typing import Any

import pytest


sim = pytest.importorskip("deepsynaps_qeeg.ai.similar_cases")


# ----------------------------------------------------------------- helpers
class _StubSession:
    """Placeholder — the real helper only needs truthiness."""


def _stub_embedding(dim: int = 200) -> list[float]:
    return [0.01 * (i % 7) for i in range(dim)]


# ----------------------------------------------------------------- tests
def test_pgvector_similar_returns_none_when_bridge_missing(monkeypatch):
    """When ``HAS_PGVECTOR_RUNTIME=False`` the helper MUST return ``None``.

    The caller in ``find_similar`` relies on the ``None`` sentinel to
    fall through to the legacy psycopg path / stub cases.
    """
    monkeypatch.setattr(sim, "HAS_PGVECTOR_RUNTIME", False)
    monkeypatch.setattr(sim, "cosine_similar", None)

    out = sim._pgvector_similar(
        _stub_embedding(),
        k=10,
        filters={},
        db_session=_StubSession(),
    )
    assert out is None


def test_pgvector_similar_returns_k_rows_when_bridge_returns_k(monkeypatch):
    """Bridge rows are normalised to the canonical schema and returned."""
    def _fake_bridge(
        table: str,
        column: str,
        q: list[float],
        *,
        k: int,
        filters: dict[str, Any],
        db_session: Any,
    ) -> list[dict[str, Any]]:
        assert table == "qeeg_analyses"
        assert column == "embedding"
        return [
            {
                "analysis_id": f"a-{i}",
                "distance": 0.05 * i,
                "age": 30 + i,
                "sex": "F" if i % 2 else "M",
                "flagged_conditions": ["mdd_like"],
                "responder": i % 2 == 0,
                "response_delta": 0.1 + 0.02 * i,
                "summary_deidentified": f"case {i} synopsis",
            }
            for i in range(k)
        ]

    monkeypatch.setattr(sim, "HAS_PGVECTOR_RUNTIME", True)
    monkeypatch.setattr(sim, "cosine_similar", _fake_bridge)

    out = sim._pgvector_similar(
        _stub_embedding(), k=7, filters={"sex": "M"}, db_session=_StubSession()
    )
    assert isinstance(out, list)
    assert len(out) == 7
    first = out[0]
    assert first["case_id"] == "a-0"
    assert first["similarity_score"] == pytest.approx(1.0, rel=1e-6)
    assert "flagged_conditions" in first
    assert first["outcome"]["responder"] is True


def test_find_similar_real_path_privacy_fallback_when_k_lt_5(monkeypatch):
    """Real path returning 3 rows must collapse to aggregate-only."""
    def _fake_bridge(*_args, **_kwargs):
        return [
            {
                "analysis_id": f"a-{i}",
                "distance": 0.1 * i,
                "age": 40,
                "sex": "F",
                "flagged_conditions": ["anxiety_like"],
                "responder": True,
                "response_delta": 0.3,
                "summary_deidentified": "syn",
            }
            for i in range(3)
        ]

    monkeypatch.setattr(sim, "HAS_PGVECTOR_RUNTIME", True)
    monkeypatch.setattr(sim, "cosine_similar", _fake_bridge)

    result = sim.find_similar(
        _stub_embedding(),
        k=10,  # caller asked for 10 but only 3 rows came back
        filters={"sex": "F"},
        db_session=_StubSession(),
        deterministic_seed=42,
    )
    assert isinstance(result, dict)
    assert "aggregate" in result
    assert result["aggregate"]["n"] == 3


def test_pgvector_similar_scrubs_phi_from_every_row(monkeypatch):
    """Every forbidden key must be stripped — never trust SQL output."""
    def _fake_bridge(*_args, **_kwargs):
        return [
            {
                "analysis_id": "a-0",
                "distance": 0.1,
                "name": "LEAKED",
                "mrn": "M-123",
                "email": "p@example.com",
                "dob": "1980-01-01",
                "age": 44,
                "sex": "M",
                "flagged_conditions": ["tbi_residual_like"],
                "responder": False,
                "response_delta": -0.05,
                "summary_deidentified": "ok",
            }
        ]

    monkeypatch.setattr(sim, "HAS_PGVECTOR_RUNTIME", True)
    monkeypatch.setattr(sim, "cosine_similar", _fake_bridge)

    out = sim._pgvector_similar(
        _stub_embedding(), k=1, filters={}, db_session=_StubSession()
    )
    assert out is not None and len(out) == 1
    row = out[0]
    for banned in ("name", "mrn", "email", "dob",
                   "first_name", "last_name", "phone",
                   "address", "ssn", "nhs_number", "date_of_birth"):
        assert banned not in row, f"PHI key leaked: {banned}"
    assert row["age"] == 44  # non-PHI fields survive


def test_deterministic_stub_wins_when_real_path_returns_empty(monkeypatch):
    """When bridge returns ``[]`` we must fall through to the stub path."""
    def _fake_bridge(*_args, **_kwargs):
        return []

    monkeypatch.setattr(sim, "HAS_PGVECTOR_RUNTIME", True)
    monkeypatch.setattr(sim, "cosine_similar", _fake_bridge)
    # Keep legacy psycopg path unreachable so we test the stub, not that path.
    monkeypatch.setattr(sim, "HAS_PGVECTOR", False)
    monkeypatch.setattr(sim, "HAS_PSYCOPG", False)

    result = sim.find_similar(
        _stub_embedding(),
        k=10,
        filters={},
        db_session=_StubSession(),
        deterministic_seed=12345,
    )
    assert isinstance(result, list)
    assert len(result) == 10
    # Stub cases carry the 'syn-' case_id prefix.
    assert all(c["case_id"].startswith("syn-") for c in result)

    # Determinism: same seed → same case_ids.
    result2 = sim.find_similar(
        _stub_embedding(),
        k=10,
        filters={},
        db_session=_StubSession(),
        deterministic_seed=12345,
    )
    assert [c["case_id"] for c in result] == [c["case_id"] for c in result2]
