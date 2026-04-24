"""Tests for :mod:`deepsynaps_qeeg.ai.medrag` — stub / toy path only."""
from __future__ import annotations

from deepsynaps_qeeg.ai import medrag as medrag_mod


EXPECTED_KEYS = {
    "paper_id", "relevance", "evidence_chain",
    "pmid", "doi", "title", "year", "url", "abstract",
}


def test_medrag_toy_fallback_returns_results():
    """``MedRAG()`` with no db_url must fall back to toy_papers.json."""
    rag = medrag_mod.MedRAG(db_url=None)
    results = rag.retrieve(
        {"flagged_conditions": ["adhd"], "modalities": ["neurofeedback"]},
        {"age": 30, "sex": "M"},
        k=4,
    )
    assert isinstance(results, list)
    assert len(results) > 0
    assert len(results) <= 4
    for row in results:
        assert EXPECTED_KEYS.issubset(row.keys())
        # evidence_chain must be a (possibly empty) list of dicts
        assert isinstance(row["evidence_chain"], list)


def test_medrag_module_retrieve_singleton():
    """Module-level ``retrieve`` returns the same shape via singleton."""
    results = medrag_mod.retrieve(
        {"flagged_conditions": ["anxiety"]},
        {},
        k=3,
    )
    assert isinstance(results, list)
    assert len(results) <= 3
    for row in results:
        assert EXPECTED_KEYS.issubset(row.keys())


def test_medrag_kg_seeded_in_memory():
    rag = medrag_mod.MedRAG(db_url=None)
    ent, edge = rag.build_kg()
    # no DB = (0, 0) returned but in-memory cache still populated
    assert ent == 0 and edge == 0
    assert rag._kg_cache.entities, "entities must be cached in memory"
    assert rag._kg_cache.hyperedges, "hyperedges must be cached in memory"


def test_medrag_evidence_chain_filters_on_condition():
    rag = medrag_mod.MedRAG(db_url=None)
    results = rag.retrieve(
        {"flagged_conditions": ["depression"]},
        {},
        k=5,
    )
    # at least one result should surface a depression-related hyperedge
    chains = [r["evidence_chain"] for r in results]
    flat = [e for ch in chains for e in ch]
    assert any("depression" in (e.get("entities") or []) for e in flat)


def test_medrag_dep_flags_are_booleans():
    assert isinstance(medrag_mod.HAS_PGVECTOR, bool)
    assert isinstance(medrag_mod.HAS_SENTENCE_TRANSFORMERS, bool)


def test_medrag_build_paper_index_no_db_is_noop():
    rag = medrag_mod.MedRAG(db_url=None)
    assert rag.build_paper_index() == 0
