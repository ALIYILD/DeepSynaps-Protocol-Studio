"""Tests for ``app.services.qeeg_rag.query_literature``.

Verifies the three-level fallback chain:

1. Sibling ``deepsynaps_qeeg.report.rag.query_literature`` (unavailable in
   this repo — simulated via ``ImportError``).
2. On-disk sqlite evidence DB (not present in test env).
3. SQLAlchemy session against ``literature_papers`` (populated inline).
4. No backend → ``[]`` + logged warning, never raises.
"""
from __future__ import annotations

import asyncio
import sys
from unittest import mock


def _run(coro):
    return asyncio.run(coro)


def test_query_literature_returns_empty_when_no_backend(monkeypatch, tmp_path):
    """With no sibling package, no evidence.db, and no DB session → []."""
    import builtins

    # Simulate ImportError for deepsynaps_qeeg — ensure it's not cached.
    for mod_name in list(sys.modules):
        if mod_name.startswith("deepsynaps_qeeg"):
            monkeypatch.delitem(sys.modules, mod_name, raising=False)

    real_import = builtins.__import__

    def _blocked_import(name, *args, **kwargs):
        if name.startswith("deepsynaps_qeeg"):
            raise ImportError(f"simulated: {name} not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _blocked_import)

    # Point EVIDENCE_DB_PATH at a non-existent path so the sqlite path is skipped.
    monkeypatch.setenv("EVIDENCE_DB_PATH", str(tmp_path / "does_not_exist.db"))

    import app.services.qeeg_rag as qeeg_rag

    result = _run(qeeg_rag.query_literature(
        conditions=["adhd"],
        modalities=["tdcs"],
        top_k=5,
        db_session=None,
    ))

    assert result == []


def test_query_literature_empty_inputs_returns_empty():
    """Empty conditions + modalities should short-circuit to []."""
    import app.services.qeeg_rag as qeeg_rag

    result = _run(qeeg_rag.query_literature(
        conditions=[],
        modalities=[],
        top_k=5,
        db_session=None,
    ))
    assert result == []


def test_query_literature_sqlalchemy_fallback(monkeypatch, tmp_path):
    """When sibling + sqlite paths fail, falls back to SQLAlchemy literature_papers."""
    import builtins

    monkeypatch.setenv("EVIDENCE_DB_PATH", str(tmp_path / "does_not_exist.db"))

    real_import = builtins.__import__

    def _blocked_import(name, *args, **kwargs):
        if name.startswith("deepsynaps_qeeg"):
            raise ImportError(f"simulated: {name} not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _blocked_import)

    import app.services.qeeg_rag as qeeg_rag

    # Seed a couple of LiteraturePaper rows via the in-memory test DB.
    from app.database import get_db_session, reset_database
    from app.persistence.models import LiteraturePaper

    reset_database()

    session_iter = get_db_session()
    db = next(session_iter)
    try:
        db.add_all([
            LiteraturePaper(
                id="p1",
                added_by="tester",
                title="Theta-beta ratio predicts ADHD response",
                authors="[\"Smith J\", \"Doe A\"]",
                journal="Clin EEG",
                year=2022,
                doi="10.1000/x1",
                pubmed_id="111",
                abstract="We show elevated theta/beta ratio in ADHD...",
                modality="neurofeedback",
                condition="adhd",
                tags_json="[]",
            ),
            LiteraturePaper(
                id="p2",
                added_by="tester",
                title="Unrelated cardiology trial",
                authors="Brown B",
                journal="Cardio J",
                year=2020,
                doi=None,
                pubmed_id="222",
                abstract="ACE inhibitors in heart failure",
                modality=None,
                condition="heart_failure",
                tags_json="[]",
            ),
        ])
        db.commit()

        result = _run(qeeg_rag.query_literature(
            conditions=["adhd"],
            modalities=["neurofeedback"],
            top_k=5,
            db_session=db,
        ))
    finally:
        try:
            next(session_iter)
        except StopIteration:
            pass

    assert len(result) >= 1
    titles = [r["title"] for r in result]
    assert any("ADHD" in t or "adhd" in t.lower() for t in titles)
    # Shape check.
    first = result[0]
    assert set(first.keys()) == {
        "pmid", "doi", "title", "authors", "year", "journal", "abstract", "relevance_score"
    }
    assert isinstance(first["authors"], list)


def test_query_literature_normalises_sibling_output(monkeypatch):
    """When the sibling package IS importable, its result is normalised to CONTRACT §5 shape."""
    import app.services.qeeg_rag as qeeg_rag

    fake_refs = [
        {
            "pmid": "12345",
            "doi": "10.1/abc",
            "title": "Fake paper",
            "authors": "Smith, Doe",   # string should be split
            "year": "2024",             # string should coerce to int
            "journal": "Neuro J",
            "abstract": "blah",
            "relevance_score": "0.87",
        },
    ]

    async def _fake_sibling(conditions, modalities, top_k):
        return fake_refs

    class _SiblingModule:
        query_literature = staticmethod(_fake_sibling)

    monkeypatch.setitem(
        sys.modules, "deepsynaps_qeeg", mock.MagicMock()
    )
    monkeypatch.setitem(
        sys.modules, "deepsynaps_qeeg.report", mock.MagicMock()
    )
    monkeypatch.setitem(
        sys.modules, "deepsynaps_qeeg.report.rag", _SiblingModule()
    )

    result = _run(qeeg_rag.query_literature(
        conditions=["adhd"],
        modalities=["tdcs"],
        top_k=5,
    ))

    # Clean up sys.modules entries (monkeypatch.setitem auto-restores, so this
    # is just defensive).
    assert len(result) == 1
    item = result[0]
    assert item["pmid"] == "12345"
    assert item["year"] == 2024
    assert isinstance(item["authors"], list) and item["authors"]
    assert isinstance(item["relevance_score"], float)
