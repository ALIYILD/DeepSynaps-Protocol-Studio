"""Tests for DrugBank integration stub.

Covers:
- Local cache query tests
- Evidence grade mapping tests
- Drug interaction search
- Drug detail retrieval
- Pair interaction checking
- Severe interaction listing
- Database statistics
"""
from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path
from typing import Any

import pytest

from app.services.drugbank_integration import (
    EVIDENCE_GRADE,
    PRELOADED_DRUG_COUNT,
    DrugBankClient,
    get_client,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def temp_db():
    """Temporary SQLite database for each test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    yield db_path
    try:
        os.unlink(db_path)
    except FileNotFoundError:
        pass


@pytest.fixture
def client(temp_db):
    """Fresh DrugBankClient with temporary DB."""
    return DrugBankClient(temp_db)


# ── Initialization tests ─────────────────────────────────────────────────────


class TestInitialization:
    """Tests for DrugBankClient initialization."""

    def test_db_creation(self, temp_db):
        """Database and tables are created on init."""
        client = DrugBankClient(temp_db)
        assert client._db_ok
        assert client._initialized

        # Verify tables
        with sqlite3.connect(temp_db) as conn:
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            table_names = [t[0] for t in tables]
            assert "drugbank_drugs" in table_names
            assert "drugbank_interactions" in table_names

    def test_preloaded_data(self, client):
        """50 psychiatric drugs are pre-loaded."""
        drugs = client.get_all_drugs()
        assert len(drugs) == PRELOADED_DRUG_COUNT
        assert len(drugs) == 50

    def test_memory_fallback(self):
        """Client works from memory when DB is unavailable."""
        # Use a path that cannot be created (simulating failure)
        client = DrugBankClient("/nonexistent/path/that/fails/db.db")
        assert not client._db_ok

        # Should still work from memory
        drugs = client.get_all_drugs()
        assert len(drugs) == PRELOADED_DRUG_COUNT

    def test_singleton(self):
        """get_client returns singleton."""
        c1 = get_client()
        c2 = get_client()
        assert c1 is c2


# ── Search interactions tests ────────────────────────────────────────────────


class TestSearchInteractions:
    """Tests for search_interactions."""

    def test_basic_search(self, client):
        """Searching for sertraline returns interactions."""
        result = client.search_interactions("sertraline")

        assert len(result) > 0
        assert all(isinstance(ix, dict) for ix in result)

    def test_interaction_structure(self, client):
        """Each interaction has required fields."""
        result = client.search_interactions("sertraline")

        for ix in result:
            assert "drug_name" in ix
            assert "with_drug" in ix
            assert "severity" in ix
            assert "mechanism" in ix
            assert "management" in ix
            assert "evidence_level" in ix
            assert "evidence_grade" in ix
            assert "pmids" in ix

    def test_severity_ordering(self, client):
        """Severe interactions come before moderate ones."""
        result = client.search_interactions("sertraline")
        severities = [ix["severity"] for ix in result]

        # Contraindicated/major should appear before moderate/minor
        severity_order = {"contraindicated": 0, "major": 1, "moderate": 2, "minor": 3}
        numeric = [severity_order.get(s, 4) for s in severities]
        assert numeric == sorted(numeric)

    def test_empty_name(self, client):
        """Empty drug name returns empty list."""
        result = client.search_interactions("")
        assert result == []

    def test_whitespace_name(self, client):
        """Whitespace-only name returns empty list."""
        result = client.search_interactions("   ")
        assert result == []

    def test_unknown_drug(self, client):
        """Unknown drug returns empty list."""
        result = client.search_interactions("unknown_drug_xyz_999")
        assert result == []

    def test_deduplication(self, client):
        """Duplicate interactions are deduplicated."""
        # Search by drug that appears in multiple records
        result = client.search_interactions("MAOI")
        # Deduplication should prevent identical pairs
        seen = set()
        for ix in result:
            key = f"{ix['drug_name']}:{ix['with_drug']}:{ix['mechanism']}"
            assert key not in seen, f"Duplicate interaction: {key}"
            seen.add(key)


# ── Get drug details tests ───────────────────────────────────────────────────


class TestGetDrugDetails:
    """Tests for get_drug_details."""

    def test_known_drug(self, client):
        """Known drug returns details."""
        result = client.get_drug_details("sertraline")

        assert result is not None
        assert result["name"] == "Sertraline"
        assert result["generic_name"] == "sertraline"
        assert "interactions" in result

    def test_by_brand_name(self, client):
        """Search works for known drug name variations."""
        result = client.get_drug_details("Sertraline")
        assert result is not None
        assert result["generic_name"] == "sertraline"

    def test_unknown_drug(self, client):
        """Unknown drug returns None."""
        result = client.get_drug_details("unknown_xyz")
        assert result is None

    def test_evidence_grade(self, client):
        """Drug details carry evidence grade B."""
        result = client.get_drug_details("sertraline")
        assert result["evidence_grade"] == EVIDENCE_GRADE


# ── Search by class tests ────────────────────────────────────────────────────


class TestSearchByClass:
    """Tests for search_by_class."""

    def test_ssri_class(self, client):
        """Searching for SSRI returns SSRI drugs."""
        result = client.search_by_class("SSRI")

        assert len(result) > 0
        drug_names = [d["name"] for d in result]
        assert "Sertraline" in drug_names or "Fluoxetine" in drug_names

    def test_antipsychotic_class(self, client):
        """Searching for antipsychotic returns relevant drugs."""
        result = client.search_by_class("antipsychotic")

        assert len(result) > 0
        drug_names = [d["name"] for d in result]
        assert any(name in drug_names for name in ["Clozapine", "Olanzapine", "Risperidone"])

    def test_unknown_class(self, client):
        """Unknown class returns empty list."""
        result = client.search_by_class("nonexistent_class_xyz")
        assert result == []


# ── Pair interaction tests ───────────────────────────────────────────────────


class TestCheckPairInteraction:
    """Tests for check_pair_interaction."""

    def test_known_pair(self, client):
        """Known drug pair returns interaction."""
        result = client.check_pair_interaction("sertraline", "tramadol")

        assert result is not None
        assert result["severity"] in ["major", "contraindicated"]

    def test_unknown_pair(self, client):
        """Unknown pair returns None."""
        result = client.check_pair_interaction("sertraline", "unknown_xyz")
        assert result is None

    def test_empty_inputs(self, client):
        """Empty inputs return None."""
        assert client.check_pair_interaction("", "drug") is None
        assert client.check_pair_interaction("drug", "") is None

    def test_tramadol_ssri_pair(self, client):
        """Tramadol + SSRI is flagged as major."""
        result = client.check_pair_interaction("sertraline", "tramadol")
        assert result is not None
        assert "serotonin" in result["mechanism"].lower()


# ── Severe interactions tests ────────────────────────────────────────────────


class TestListSevereInteractions:
    """Tests for list_severe_interactions."""

    def test_severe_in_list(self, client):
        """Severe interactions are identified."""
        result = client.list_severe_interactions(["sertraline", "tramadol"])

        # Should find the sertraline-tramadol major interaction
        assert len(result) > 0
        assert all(
            ix["severity"] in ["major", "contraindicated", "severe"]
            for ix in result
        )

    def test_no_severe(self, client):
        """No severe interactions returns empty list."""
        result = client.list_severe_interactions(["sertraline"])
        assert result == []

    def test_matched_pair_field(self, client):
        """Matched pair field is present."""
        result = client.list_severe_interactions(["sertraline", "tramadol"])
        if result:
            assert "matched_pair" in result[0]


# ── Evidence grade tests ─────────────────────────────────────────────────────


class TestEvidenceGrade:
    """Tests for evidence grade consistency."""

    def test_grade_b(self, client):
        """All results carry evidence grade B."""
        interactions = client.search_interactions("sertraline")
        assert all(ix["evidence_grade"] == "B" for ix in interactions)

    def test_evidence_source(self, client):
        """Evidence source is DrugBank."""
        interactions = client.search_interactions("sertraline")
        assert all("DrugBank" in ix.get("evidence_source", "") for ix in interactions)

    def test_disclaimer_present(self, client):
        """Disclaimer is present on all results."""
        interactions = client.search_interactions("sertraline")
        assert all("disclaimer" in ix for ix in interactions)

    def test_drug_details_grade(self, client):
        """Drug details carry evidence grade B."""
        drug = client.get_drug_details("sertraline")
        assert drug["evidence_grade"] == "B"


# ── Statistics tests ─────────────────────────────────────────────────────────


class TestGetStats:
    """Tests for get_stats."""

    def test_stats_structure(self, client):
        """Stats have expected structure."""
        stats = client.get_stats()

        assert "drug_count" in stats
        assert "interaction_count" in stats
        assert stats["drug_count"] == PRELOADED_DRUG_COUNT
        assert stats["interaction_count"] > 0
        assert stats["evidence_grade"] == EVIDENCE_GRADE
        assert stats["source"] == "DrugBank stub (local cache)"

    def test_severity_breakdown(self, client):
        """Severity breakdown is present."""
        stats = client.get_stats()

        assert "severity_breakdown" in stats
        assert isinstance(stats["severity_breakdown"], dict)

    def test_db_ok_flag(self, client):
        """DB status is reported."""
        stats = client.get_stats()
        assert "db_ok" in stats


# ── Full DrugBank XML placeholder tests ──────────────────────────────────────


class TestParseFullDrugbankXML:
    """Tests for parse_full_drugbank_xml placeholder."""

    def test_not_configured(self, client):
        """Unconfigured XML path returns not_configured."""
        result = client.parse_full_drugbank_xml()
        assert result["status"] == "not_configured"
        assert "academic license" in result["message"].lower()

    def test_file_not_found(self, client):
        """Nonexistent file returns file_not_found."""
        result = client.parse_full_drugbank_xml("/nonexistent/path/drugbank.xml")
        assert result["status"] == "file_not_found"

    def test_evidence_grade_in_response(self, client):
        """XML placeholder response includes evidence grade."""
        result = client.parse_full_drugbank_xml()
        assert result["evidence_grade"] == EVIDENCE_GRADE


# ── Memory-only mode tests ───────────────────────────────────────────────────


class TestMemoryOnlyMode:
    """Tests for memory-only operation when DB fails."""

    def test_memory_search(self):
        """Search works from memory."""
        client = DrugBankClient("/nonexistent/fails")
        result = client.search_interactions("sertraline")
        assert len(result) > 0

    def test_memory_get_details(self):
        """Get details works from memory."""
        client = DrugBankClient("/nonexistent/fails")
        result = client.get_drug_details("sertraline")
        assert result is not None
        assert result["name"] == "Sertraline"

    def test_memory_stats(self):
        """Stats work from memory."""
        client = DrugBankClient("/nonexistent/fails")
        stats = client.get_stats()
        assert stats["drug_count"] == PRELOADED_DRUG_COUNT
        assert not stats["db_ok"]

    def test_memory_pair_check(self):
        """Pair interaction check works from memory."""
        client = DrugBankClient("/nonexistent/fails")
        result = client.check_pair_interaction("sertraline", "tramadol")
        assert result is not None
