#!/usr/bin/env python3
"""
Unit tests for all Batch C adapters.

Each test class covers one adapter with mocked HTTP and validation
of the full pipeline: fetch → transform → validate → save.

Run:  python -m pytest tests/test_adapters.py -v
"""

from __future__ import annotations

import gzip
import json
import pickle
from datetime import date
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pytest
import requests

from adapters import (
    OrangeBookAdapter,
    NdcDirectoryAdapter,
    UniiAdapter,
    OtseekerAdapter,
    PedroAdapter,
)
from adapters.models import (
    ConfidenceTier,
    EvidenceEntry,
    Medication,
    Provenance,
    Substance,
    TeCode,
)


# ===========================================================================
# Orange Book Adapter Tests
# ===========================================================================

class TestOrangeBookAdapter:
    """Tests for OrangeBookAdapter."""

    def test_fetch_returns_dict(self, tmp_cache_dir, mock_orange_book_raw):
        """fetch() should return a dict with products, patents, exclusivity keys."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir)
        adapter._save_raw_to_cache(mock_orange_book_raw)
        result = adapter.fetch()
        assert isinstance(result, dict)
        assert "products" in result
        assert "patents" in result
        assert "exclusivity" in result
        assert len(result["products"]) == 2

    def test_transform_returns_medications(self, tmp_cache_dir, mock_orange_book_raw):
        """transform() should return list of Medication objects."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        meds = adapter.transform(mock_orange_book_raw)
        assert isinstance(meds, list)
        assert len(meds) == 2
        assert all(isinstance(m, Medication) for m in meds)

    def test_medication_fields(self, tmp_cache_dir, mock_orange_book_raw):
        """Check specific fields are correctly parsed."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        meds = adapter.transform(mock_orange_book_raw)

        advil = [m for m in meds if m.name == "ADVIL"][0]
        assert advil.generic_name == "IBUPROFEN"
        assert "IBUPROFEN" in advil.active_ingredients
        assert advil.strength == "200 MG"
        assert advil.applicant == "Pfizer Inc"
        assert advil.application_number == "ANDA077900"
        assert advil.approval_date == date(2008, 1, 15)
        assert advil.te_code == TeCode.AB
        assert advil.reference_standard is True
        assert advil.dosage_form == "TABLET"
        assert advil.provenance.confidence_tier == ConfidenceTier.AUTHORITY

        tylenol = [m for m in meds if m.name == "TYLENOL"][0]
        assert tylenol.application_number == "NDA021123"
        assert tylenol.te_code == TeCode.AA
        assert tylenol.reference_standard is True

    def test_validation_pass(self, tmp_cache_dir, mock_orange_book_raw):
        """Valid medications should pass validation."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        meds = adapter.transform(mock_orange_book_raw)
        passed, report = adapter.validate(meds)
        assert all(passed)
        assert report["passed"] == 2
        assert report["failed"] == 0

    def test_validation_fail_empty_name(self, tmp_cache_dir):
        """Medication with no name should fail validation."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        bad_med = Medication(
            name="", generic_name="", active_ingredients=["TEST"],
            application_number="ANDA000001",
        )
        ok, err = adapter._validate_one(bad_med)
        assert ok is False
        assert "missing" in (err or "").lower()

    def test_date_parsing_variants(self, tmp_cache_dir):
        """Date parser should handle multiple formats."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        assert adapter._parse_date("Jan 15, 2008") == date(2008, 1, 15)
        assert adapter._parse_date("2023-06-01") == date(2023, 6, 1)
        assert adapter._parse_date("03/22/2001") == date(2001, 3, 22)
        assert adapter._parse_date("") is None
        assert adapter._parse_date("invalid") is None

    def test_df_route_split(self, tmp_cache_dir):
        """Dosage form / route splitting."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        assert adapter._split_df_route("TABLET;ORAL") == ("TABLET", "ORAL")
        assert adapter._split_df_route("INJECTION;IV") == ("INJECTION", "IV")
        assert adapter._split_df_route("CREAM") == ("CREAM", "")

    @patch("adapters.orange_book_adapter.requests.Session.get")
    def test_fetch_live_mock(self, mock_get, tmp_cache_dir, mock_orange_book_zip):
        """fetch() should download and parse a real ZIP file."""
        mock_resp = MagicMock()
        mock_resp.content = mock_orange_book_zip
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        result = adapter.fetch()
        assert "products" in result
        assert len(result["products"]) == 3  # 3 products in mock

    def test_to_dict(self, tmp_cache_dir, mock_orange_book_raw):
        """Medication.to_dict() should serialize correctly."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        meds = adapter.transform(mock_orange_book_raw)
        d = meds[0].to_dict()
        assert "name" in d
        assert "generic_name" in d
        assert "active_ingredients" in d
        assert "approval_date" in d
        assert "provenance" in d
        assert d["provenance"]["confidence_tier"] == "A"

    def test_run_pipeline(self, tmp_cache_dir, mock_orange_book_raw):
        """Full pipeline should produce a summary dict."""
        adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir)
        # Pre-populate cache
        adapter._save_raw_to_cache(mock_orange_book_raw)
        summary = adapter.run()
        assert summary["source"] == "orange_book"
        assert summary["tier"] == "A"
        assert summary["canonical_records"] == 2
        assert summary["valid_records"] == 2


# ===========================================================================
# NDC Directory Adapter Tests
# ===========================================================================

class TestNdcDirectoryAdapter:
    """Tests for NdcDirectoryAdapter."""

    def test_fetch_returns_dict(self, tmp_cache_dir, mock_ndc_zip):
        """fetch() should return products and packages dicts."""
        adapter = NdcDirectoryAdapter(cache_dir=tmp_cache_dir)
        # Manually simulate parsed data
        raw = {
            "products": [
                {
                    "PRODUCTNDC": "00143-9508",
                    "PROPRIETARYNAME": "LIPITOR",
                    "NONPROPRIETARYNAME": "ATORVASTATIN CALCIUM",
                    "SUBSTANCENAME": "ATORVASTATIN CALCIUM",
                    "ACTIVE_NUMERATOR_STRENGTH": "10",
                    "ACTIVE_INGREDIENT_UNIT": "mg/kg",
                    "DOSAGEFORMNAME": "TABLET",
                    "ROUTENAME": "ORAL",
                    "LABELERNAME": "Pfizer Inc",
                    "STARTMARKETINGDATE": "19970101",
                    "PRODUCTTYPENAME": "HUMAN PRESCRIPTION DRUG",
                    "MARKETINGCATEGORYNAME": "NDA",
                    "APPLICATIONNUMBER": "NDA020702",
                },
            ],
            "packages": [
                {
                    "PRODUCTNDC": "00143-9508",
                    "NDCPACKAGECODE": "00143-9508-01",
                },
                {
                    "PRODUCTNDC": "00143-9508",
                    "NDCPACKAGECODE": "00143-9508-02",
                },
            ],
        }
        adapter._save_raw_to_cache(raw)
        result = adapter.fetch()
        assert "products" in result
        assert "packages" in result

    def test_transform_returns_medications(self, tmp_cache_dir):
        """transform() should produce Medication list."""
        adapter = NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = {
            "products": [
                {
                    "PRODUCTNDC": "00143-9508",
                    "PROPRIETARYNAME": "LIPITOR",
                    "PROPRIETARYNAMESUFFIX": "",
                    "NONPROPRIETARYNAME": "ATORVASTATIN CALCIUM",
                    "SUBSTANCENAME": "ATORVASTATIN CALCIUM",
                    "ACTIVE_NUMERATOR_STRENGTH": "10",
                    "ACTIVE_INGREDIENT_UNIT": "mg/kg",
                    "DOSAGEFORMNAME": "TABLET",
                    "ROUTENAME": "ORAL",
                    "LABELERNAME": "Pfizer Inc",
                    "STARTMARKETINGDATE": "19970101",
                    "PRODUCTTYPENAME": "HUMAN PRESCRIPTION DRUG",
                    "MARKETINGCATEGORYNAME": "NDA",
                    "APPLICATIONNUMBER": "NDA020702",
                },
            ],
            "packages": [
                {"PRODUCTNDC": "00143-9508", "NDCPACKAGECODE": "00143-9508-01"},
                {"PRODUCTNDC": "00143-9508", "NDCPACKAGECODE": "00143-9508-02"},
            ],
        }
        meds = adapter.transform(raw)
        assert len(meds) == 1
        assert isinstance(meds[0], Medication)

    def test_ndc_package_codes(self, tmp_cache_dir):
        """Medication should include NDC package codes."""
        adapter = NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = {
            "products": [
                {
                    "PRODUCTNDC": "00143-9508",
                    "PROPRIETARYNAME": "LIPITOR",
                    "NONPROPRIETARYNAME": "ATORVASTATIN CALCIUM",
                    "SUBSTANCENAME": "ATORVASTATIN CALCIUM",
                    "ACTIVE_NUMERATOR_STRENGTH": "10",
                    "ACTIVE_INGREDIENT_UNIT": "mg/kg",
                    "DOSAGEFORMNAME": "TABLET",
                    "ROUTENAME": "ORAL",
                    "LABELERNAME": "Pfizer Inc",
                    "STARTMARKETINGDATE": "19970101",
                    "PRODUCTTYPENAME": "HUMAN PRESCRIPTION DRUG",
                    "MARKETINGCATEGORYNAME": "NDA",
                    "APPLICATIONNUMBER": "NDA020702",
                },
            ],
            "packages": [
                {"PRODUCTNDC": "00143-9508", "NDCPACKAGECODE": "00143-9508-01"},
                {"PRODUCTNDC": "00143-9508", "NDCPACKAGECODE": "00143-9508-02"},
            ],
        }
        meds = adapter.transform(raw)
        assert meds[0].ndc_package_codes == ["00143-9508-01", "00143-9508-02"]

    def test_date_parsing(self, tmp_cache_dir):
        """FDA date parsing handles YYYYMMDD."""
        adapter = NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        assert adapter._parse_fda_date("19970101") == date(1997, 1, 1)
        assert adapter._parse_fda_date("") is None
        assert adapter._parse_fda_date("invalid") is None

    def test_strength_parsing(self, tmp_cache_dir):
        """Strength with units should be combined."""
        adapter = NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = {
            "products": [
                {
                    "PRODUCTNDC": "00143-9508",
                    "PROPRIETARYNAME": "DRUG",
                    "NONPROPRIETARYNAME": "GENERIC",
                    "SUBSTANCENAME": "INGREDIENT A|INGREDIENT B",
                    "ACTIVE_NUMERATOR_STRENGTH": "10; 20",
                    "ACTIVE_INGRED_UNIT": "mg; mg",
                    "DOSAGEFORMNAME": "TABLET",
                    "LABELERNAME": "Test Inc",
                    "STARTMARKETINGDATE": "20200101",
                    "PRODUCTTYPENAME": "HUMAN PRESCRIPTION DRUG",
                    "MARKETINGCATEGORYNAME": "NDA",
                    "APPLICATIONNUMBER": "NDA000001",
                },
            ],
            "packages": [],
        }
        meds = adapter.transform(raw)
        assert "10 mg" in meds[0].strength
        assert len(meds[0].active_ingredients) == 2

    @patch("adapters.ndc_directory_adapter.requests.Session.get")
    def test_fetch_live_mock(self, mock_get, tmp_cache_dir, mock_ndc_zip):
        """fetch() with mocked HTTP should download and parse ZIP."""
        mock_resp = MagicMock()
        mock_resp.content = mock_ndc_zip
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_resp.iter_content = MagicMock(return_value=[mock_ndc_zip[i:i+8192] for i in range(0, len(mock_ndc_zip), 8192)])
        mock_get.return_value = mock_resp

        adapter = NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        result = adapter.fetch()
        assert "products" in result
        assert len(result["products"]) >= 1

    def test_validation(self, tmp_cache_dir):
        """Validation should flag empty records."""
        adapter = NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        good = Medication(
            name="TEST", generic_name="GENERIC",
            active_ingredients=["INGREDIENT"], application_number="ANDA001",
        )
        bad = Medication(name="", generic_name="", active_ingredients=[])
        assert adapter._validate_one(good)[0] is True
        assert adapter._validate_one(bad)[0] is False


# ===========================================================================
# UNII Adapter Tests
# ===========================================================================

class TestUniiAdapter:
    """Tests for UniiAdapter."""

    def test_fetch_returns_list(self, tmp_cache_dir):
        """fetch() should return list of dicts."""
        adapter = UniiAdapter(cache_dir=tmp_cache_dir)
        raw = [
            {
                "NAME": "IBUPROFEN", "TYPE": "INGREDIENT", "UNII": "WK2XYI10QM",
                "DISPLAY_NAME": "Ibuprofen",
                "INCHIKEY": "HEFNNWSXXWATRW-UHFFFAOYSA-N",
                "CAS_NUMBER": "15687-27-1",
            },
            {
                "NAME": "", "TYPE": "INGREDIENT", "UNII": "362O9ITL9D",
                "DISPLAY_NAME": "Acetaminophen",
                "INCHIKEY": "RZVAJINKPMORJF-UHFFFAOYSA-N",
                "CAS_NUMBER": "103-90-2",
            },
        ]
        adapter._save_raw_to_cache(raw)
        result = adapter.fetch()
        assert isinstance(result, list)
        assert len(result) == 2

    def test_transform_returns_substances(self, tmp_cache_dir):
        """transform() should produce Substance list."""
        adapter = UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = [
            {
                "NAME": "IBUPROFEN", "TYPE": "INGREDIENT", "UNII": "WK2XYI10QM",
                "DISPLAY_NAME": "Ibuprofen",
                "INCHIKEY": "HEFNNWSXXWATRW-UHFFFAOYSA-N",
                "CAS_NUMBER": "15687-27-1",
            },
        ]
        subs = adapter.transform(raw)
        assert len(subs) == 1
        assert isinstance(subs[0], Substance)
        assert subs[0].name == "IBUPROFEN"
        assert subs[0].unii_code == "WK2XYI10QM"
        assert subs[0].inchikey == "HEFNNWSXXWATRW-UHFFFAOYSA-N"
        assert subs[0].cas_number == "15687-27-1"
        assert subs[0].substance_type == "INGREDIENT"
        assert subs[0].provenance.confidence_tier == ConfidenceTier.AUTHORITY

    def test_display_name_fallback(self, tmp_cache_dir):
        """When NAME is empty, DISPLAY_NAME should be used."""
        adapter = UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = [
            {
                "NAME": "", "TYPE": "INGREDIENT", "UNII": "362O9ITL9D",
                "DISPLAY_NAME": "Acetaminophen", "INCHIKEY": "", "CAS_NUMBER": "",
            },
        ]
        subs = adapter.transform(raw)
        assert subs[0].name == "Acetaminophen"

    def test_deduplication(self, tmp_cache_dir):
        """Duplicate UNII codes should be deduplicated."""
        adapter = UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = [
            {"NAME": "A", "TYPE": "INGREDIENT", "UNII": "DUP0000001"},
            {"NAME": "B", "TYPE": "INGREDIENT", "UNII": "DUP0000001"},
        ]
        subs = adapter.transform(raw)
        assert len(subs) == 1

    def test_validation(self, tmp_cache_dir):
        """Validation checks."""
        adapter = UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        good = Substance(name="IBUPROFEN", unii_code="WK2XYI10QM")
        bad_no_name = Substance(name="", unii_code="VALID00123")
        bad_short_code = Substance(name="X", unii_code="AB")
        assert adapter._validate_one(good)[0] is True
        assert adapter._validate_one(bad_no_name)[0] is False
        assert adapter._validate_one(bad_short_code)[0] is False

    @patch("adapters.unii_adapter.requests.Session.get")
    def test_fetch_live_mock(self, mock_get, tmp_cache_dir, mock_unii_zip):
        """fetch() with mocked HTTP should download and parse ZIP."""
        mock_resp = MagicMock()
        mock_resp.content = mock_unii_zip
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        adapter = UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        result = adapter.fetch()
        assert isinstance(result, list)
        assert len(result) == 3  # 3 substances in mock


# ===========================================================================
# OTseeker Adapter Tests
# ===========================================================================

class TestOtseekerAdapter:
    """Tests for OtseekerAdapter (mock data)."""

    def test_fetch_returns_mock_list(self, tmp_cache_dir):
        """fetch() should return mock data without HTTP."""
        adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        result = adapter.fetch()
        assert isinstance(result, list)
        assert len(result) > 0
        assert "title" in result[0]

    def test_transform_returns_evidence(self, tmp_cache_dir):
        """transform() should produce EvidenceEntry list."""
        adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = adapter.fetch()
        entries = adapter.transform(raw)
        assert isinstance(entries, list)
        assert len(entries) > 0
        assert all(isinstance(e, EvidenceEntry) for e in entries)

    def test_evidence_fields(self, tmp_cache_dir):
        """Check OT-specific evidence fields."""
        adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        entries = adapter.transform(adapter.fetch())
        entry = entries[0]
        assert entry.title
        assert entry.authors
        assert entry.year
        assert entry.journal
        assert entry.evidence_type
        assert entry.conditions
        assert entry.interventions
        assert entry.provenance.confidence_tier == ConfidenceTier.FILTERED
        assert entry.provenance.source == "otseeker"

    def test_search_by_condition(self, tmp_cache_dir):
        """Search should filter by condition."""
        adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        adapter.transform(adapter.fetch())  # warm cache
        stroke_results = adapter.search_by_condition("stroke")
        assert isinstance(stroke_results, list)
        assert all("stroke" in " ".join(r.conditions).lower() for r in stroke_results)

    def test_search_by_intervention(self, tmp_cache_dir):
        """Search should filter by intervention."""
        adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        adapter.transform(adapter.fetch())
        results = adapter.search_by_intervention("splint")
        assert isinstance(results, list)

    def test_validation(self, tmp_cache_dir):
        """Validation checks for evidence entries."""
        adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        good = EvidenceEntry(
            title="A valid systematic review title here",
            conditions=["stroke"], interventions=["exercise"],
        )
        bad = EvidenceEntry(title="", conditions=[], interventions=[])
        assert adapter._validate_one(good)[0] is True
        assert adapter._validate_one(bad)[0] is False

    def test_run_pipeline(self, tmp_cache_dir):
        """Full pipeline should complete without error."""
        adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        summary = adapter.run()
        assert summary["source"] == "otseeker"
        assert summary["tier"] == "B"
        assert summary["canonical_records"] > 0


# ===========================================================================
# PEDro Adapter Tests
# ===========================================================================

class TestPedroAdapter:
    """Tests for PedroAdapter."""

    def test_fetch_returns_list(self, tmp_cache_dir):
        """fetch() should return list of dicts."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        result = adapter.fetch()
        assert isinstance(result, list)
        assert len(result) > 0
        assert "title" in result[0]

    def test_transform_returns_evidence(self, tmp_cache_dir):
        """transform() should produce EvidenceEntry list."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = adapter.fetch()
        entries = adapter.transform(raw)
        assert isinstance(entries, list)
        assert len(entries) > 0
        assert all(isinstance(e, EvidenceEntry) for e in entries)

    def test_evidence_fields(self, tmp_cache_dir):
        """Check PEDro-specific evidence fields."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        # Force mock fallback for consistent testing
        with patch.object(adapter, '_fetch_live', return_value=None):
            entries = adapter.transform(adapter.fetch())
        entry = entries[0]
        assert entry.title
        assert entry.year
        assert entry.journal
        assert entry.evidence_type
        assert entry.conditions
        assert entry.interventions
        assert entry.provenance.confidence_tier == ConfidenceTier.FILTERED
        assert entry.provenance.source == "pedro"

    def test_quality_score_range(self, tmp_cache_dir):
        """PEDro scores should be 0-10."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        entries = adapter.transform(adapter.fetch())
        for e in entries:
            if e.quality_score is not None:
                assert 0 <= e.quality_score <= 10

    def test_high_quality_filter(self, tmp_cache_dir):
        """high_quality() should return only high-scoring trials."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        adapter.transform(adapter.fetch())  # warm
        hq = adapter.high_quality(min_score=8.0)
        assert all(e.quality_score is not None and e.quality_score >= 8.0 for e in hq)

    def test_search_by_condition(self, tmp_cache_dir):
        """Search should filter by condition."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        adapter.transform(adapter.fetch())
        results = adapter.search_by_condition("stroke")
        assert isinstance(results, list)

    def test_search_by_intervention(self, tmp_cache_dir):
        """Search should filter by intervention."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        adapter.transform(adapter.fetch())
        results = adapter.search_by_intervention("exercise")
        assert isinstance(results, list)

    def test_validation_score_range(self, tmp_cache_dir):
        """Validation should catch out-of-range PEDro scores."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        good = EvidenceEntry(
            title="Valid physiotherapy trial", conditions=["LBP"],
            interventions=["exercise"], quality_score=7.0,
        )
        bad = EvidenceEntry(
            title="Invalid score", conditions=["LBP"],
            interventions=["exercise"], quality_score=15.0,
        )
        assert adapter._validate_one(good)[0] is True
        assert adapter._validate_one(bad)[0] is False

    def test_run_pipeline(self, tmp_cache_dir):
        """Full pipeline should complete without error."""
        adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        summary = adapter.run()
        assert summary["source"] == "pedro"
        assert summary["tier"] == "B"
        assert summary["canonical_records"] > 0


# ===========================================================================
# Cross-Adapter Integration Tests
# ===========================================================================

class TestCrossAdapter:
    """Integration tests across multiple adapters."""

    def test_all_adapters_have_confidence_tier(self, tmp_cache_dir):
        """Every adapter must declare a confidence tier."""
        adapters = [
            OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
            NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
            UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
            OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
            PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
        ]
        for a in adapters:
            assert hasattr(a, "confidence_tier")
            assert a.confidence_tier in ("A", "B", "C")

    def test_all_adapters_have_source_name(self, tmp_cache_dir):
        """Every adapter must declare a source name."""
        adapters = [
            OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
            NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
            UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
            OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
            PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True),
        ]
        for a in adapters:
            assert hasattr(a, "source_name")
            assert isinstance(a.source_name, str)
            assert len(a.source_name) > 0

    def test_pharma_adapters_tier_a(self, tmp_cache_dir):
        """Pharma adapters should be tier A."""
        assert OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True).confidence_tier == "A"
        assert NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True).confidence_tier == "A"
        assert UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True).confidence_tier == "A"

    def test_evidence_adapters_tier_b(self, tmp_cache_dir):
        """Evidence adapters should be tier B."""
        assert OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True).confidence_tier == "B"
        assert PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True).confidence_tier == "B"

    def test_medication_cross_reference(self, tmp_cache_dir):
        """Orange Book and NDC medications should share a compatible schema."""
        ob_adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        ndc_adapter = NdcDirectoryAdapter(cache_dir=tmp_cache_dir, force_refresh=True)

        ob_raw = {
            "products": [
                {
                    "ingredient": "IBUPROFEN", "df;route": "TABLET;ORAL",
                    "trade_name": "ADVIL", "applicant_full_name": "Pfizer",
                    "strength": "200 MG", "appl_type": "ANDA",
                    "appl_no": "077900", "product_no": "001",
                    "te_code": "AB", "approval_date": "Jan 15, 2008",
                    "rld": "", "rs": "Y", "type": "", "applicant": "Pfizer",
                },
            ],
            "patents": [], "exclusivity": [],
        }
        ndc_raw = {
            "products": [
                {
                    "PRODUCTNDC": "0573-0160", "PROPRIETARYNAME": "ADVIL",
                    "NONPROPRIETARYNAME": "IBUPROFEN",
                    "SUBSTANCENAME": "IBUPROFEN",
                    "ACTIVE_NUMERATOR_STRENGTH": "200", "ACTIVE_INGREDIENT_UNIT": "mg",
                    "DOSAGEFORMNAME": "TABLET", "LABELERNAME": "Pfizer",
                    "STARTMARKETINGDATE": "19840501",
                    "PRODUCTTYPENAME": "HUMAN OTC DRUG",
                    "MARKETINGCATEGORYNAME": "NDA", "APPLICATIONNUMBER": "NDA019012",
                },
            ],
            "packages": [{"PRODUCTNDC": "0573-0160", "NDCPACKAGECODE": "0573-0160-10"}],
        }

        ob_meds = ob_adapter.transform(ob_raw)
        ndc_meds = ndc_adapter.transform(ndc_raw)

        assert len(ob_meds) == 1
        assert len(ndc_meds) == 1
        assert ob_meds[0].name == ndc_meds[0].name  # both "ADVIL"
        assert "IBUPROFEN" in ob_meds[0].active_ingredients
        assert "IBUPROFEN" in ndc_meds[0].active_ingredients

    def test_unii_to_medication_ingredient_link(self, tmp_cache_dir):
        """UNII substances should be linkable to medication ingredients."""
        unii_adapter = UniiAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = [
            {
                "NAME": "IBUPROFEN", "TYPE": "INGREDIENT",
                "UNII": "WK2XYI10QM", "DISPLAY_NAME": "Ibuprofen",
                "INCHIKEY": "HEFNNWSXXWATRW-UHFFFAOYSA-N",
                "CAS_NUMBER": "15687-27-1",
            },
        ]
        subs = unii_adapter.transform(raw)
        assert len(subs) == 1
        assert subs[0].unii_code == "WK2XYI10QM"
        # This UNII code could be linked to NDC ingredient

    def test_evidence_entry_schema_consistency(self, tmp_cache_dir):
        """OTseeker and PEDro should produce compatible EvidenceEntry schemas."""
        ot_adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        pd_adapter = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)

        ot_entries = ot_adapter.transform(ot_adapter.fetch())
        pd_entries = pd_adapter.transform(pd_adapter.fetch())

        assert len(ot_entries) > 0
        assert len(pd_entries) > 0

        # Both should have the same dataclass fields
        ot_fields = set(ot_entries[0].to_dict().keys())
        pd_fields = set(pd_entries[0].to_dict().keys())
        assert ot_fields == pd_fields

    def test_tier_a_records_have_authority_provenance(self, tmp_cache_dir):
        """Tier A adapter outputs should carry AUTHORITY provenance."""
        ob_adapter = OrangeBookAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        raw = {
            "products": [
                {
                    "ingredient": "TEST", "df;route": "TABLET;ORAL",
                    "trade_name": "TESTDRUG", "applicant_full_name": "TestCo",
                    "strength": "10 MG", "appl_type": "ANDA", "appl_no": "001",
                    "product_no": "001", "te_code": "AB",
                    "approval_date": "Jan 01, 2020", "rld": "", "rs": "",
                    "type": "", "applicant": "TestCo",
                },
            ],
            "patents": [], "exclusivity": [],
        }
        meds = ob_adapter.transform(raw)
        assert meds[0].provenance.confidence_tier == ConfidenceTier.AUTHORITY

    def test_tier_b_records_have_filtered_provenance(self, tmp_cache_dir):
        """Tier B adapter outputs should carry FILTERED provenance."""
        ot_adapter = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        entries = ot_adapter.transform(ot_adapter.fetch())
        assert entries[0].provenance.confidence_tier == ConfidenceTier.FILTERED

    def test_all_adapters_support_run(self, tmp_cache_dir):
        """Every adapter should support the full run() pipeline."""
        # Orange Book
        ob = OrangeBookAdapter(cache_dir=tmp_cache_dir)
        ob._save_raw_to_cache({
            "products": [{"ingredient": "X", "df;route": "TAB;ORAL",
                "trade_name": "Y", "applicant_full_name": "Z",
                "strength": "1", "appl_type": "ANDA", "appl_no": "1",
                "product_no": "1", "te_code": "AB", "approval_date": "",
                "rld": "", "rs": "", "type": "", "applicant": "Z"}],
            "patents": [], "exclusivity": [],
        })
        s1 = ob.run()
        assert s1["source"] == "orange_book"

        # NDC
        ndc = NdcDirectoryAdapter(cache_dir=tmp_cache_dir)
        ndc._save_raw_to_cache({
            "products": [{"PRODUCTNDC": "1", "PROPRIETARYNAME": "A",
                "NONPROPRIETARYNAME": "B", "SUBSTANCENAME": "B",
                "ACTIVE_NUMERATOR_STRENGTH": "1", "ACTIVE_INGRED_UNIT": "mg",
                "DOSAGEFORMNAME": "TAB", "LABELERNAME": "C",
                "STARTMARKETINGDATE": "20200101",
                "PRODUCTTYPENAME": "HUMAN", "MARKETINGCATEGORYNAME": "OTC",
                "APPLICATIONNUMBER": "ANDA001"}],
            "packages": [],
        })
        s2 = ndc.run()
        assert s2["source"] == "ndc_directory"

        # UNII
        unii = UniiAdapter(cache_dir=tmp_cache_dir)
        unii._save_raw_to_cache([{"NAME": "X", "TYPE": "INGREDIENT", "UNII": "ABCD123456"}])
        s3 = unii.run()
        assert s3["source"] == "unii"

        # OTseeker
        ot = OtseekerAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        s4 = ot.run()
        assert s4["source"] == "otseeker"

        # PEDro
        pd = PedroAdapter(cache_dir=tmp_cache_dir, force_refresh=True)
        s5 = pd.run()
        assert s5["source"] == "pedro"
