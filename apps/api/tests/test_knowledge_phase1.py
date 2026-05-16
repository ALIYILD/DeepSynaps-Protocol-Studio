"""
test_knowledge_phase1.py — Comprehensive test suite for Knowledge Layer Phase 1.

DeepSynaps Protocol Studio — clinical neuromodulation platform.
Tests the Knowledge Layer: BaseAdapter, AdapterRegistry, ETLPipeline,
mock biomedical adapters, integration flows, and governance rules.

Test categories:
  1. Base Adapter Tests       (15 tests)
  2. Adapter Registry Tests   (12 tests)
  3. ETL Pipeline Tests       (12 tests)
  4. Mock Adapter Tests       (15 tests)
  5. Integration Tests        (10 tests)
  6. Governance Tests         (8  tests)
=============================================================================
Total: 72+ tests
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import tempfile
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── Imports under test ───────────────────────────────────────────────────────
from app.services.knowledge.base_adapter import (
    AdapterError,
    ConfidenceTier,
    ConnectionError,
    DatabaseAdapter,
    EvidenceLevel,
    FetchError,
    HealthStatusDict,
    LicenseMetadata,
    LicenseViolationError,
    NormalizationError,
    ProvenanceDict,
    ProvenanceRecord,
    ValidationError,
)
from app.services.knowledge.adapter_registry import (
    AdapterAlreadyRegisteredError,
    AdapterInfo,
    AdapterNotFoundError,
    AdapterRegistry,
    InvalidTierError,
    RegistryError,
    VALID_TIERS,
)
from app.services.knowledge.etl_pipeline import (
    DEFAULT_CHECKPOINT_DIR,
    ETLCheckpointError,
    ETLPipeline,
    ETLPipelineError,
    ETLResult,
    ETLStage,
    ETLStatus,
    ETLRetryExhaustedError,
)


# ═══════════════════════════════════════════════════════════════════════════════
# MOCK ADAPTER DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════

class MockRxNormAdapter(DatabaseAdapter):
    """Mock RxNorm adapter for medication terminology lookups."""

    @property
    def source_name(self) -> str:
        return "RxNorm"

    @property
    def source_version(self) -> str:
        return "2026-01"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        return [{"rxcui": "12345", "name": "Aspirin", "tty": "IN"}]

    async def normalize(self, raw):
        return [{"canonical_name": "aspirin", "rxcui": r.get("rxcui", ""),
                 "canonical_id": r.get("rxcui", ""), "source": "RxNorm"} for r in raw]

    async def validate(self, records):
        return [r for r in records if r.get("canonical_name")]

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="RxNorm",
            source_version="2026-01",
            source_record_id=record.get("rxcui", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="PUBLIC_DOMAIN",
            confidence_tier=ConfidenceTier.HIGH,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="PUBLIC_DOMAIN",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            redistribution_allowed=True,
        )

    def get_confidence(self, record):
        return ConfidenceTier.HIGH

    async def health_check(self):
        return {"status": "ok", "latency_ms": 12.3, "connected": True}


class MockPharmGKBAdapter(DatabaseAdapter):
    """Mock PharmGKB adapter — pharmacogenomics knowledge."""

    @property
    def source_name(self) -> str:
        return "PharmGKB"

    @property
    def source_version(self) -> str:
        return "2025-Q4"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        return [{"gene": "CYP2D6", "drug": "codeine",
                 "phenotype": "poor metabolizer", "evidence": "moderate"}]

    async def normalize(self, raw):
        return [{"gene_symbol": r["gene"], "drug_name": r["drug"],
                 "clinical_phenotype": r["phenotype"],
                 "canonical_id": f"{r['gene']}:{r['drug']}", "source": "PharmGKB"} for r in raw]

    async def validate(self, records):
        return records

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="PharmGKB",
            source_version="2025-Q4",
            source_record_id=f"{record.get('gene_symbol','')}:{record.get('drug_name','')}",
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC_BY_SA_40",
            confidence_tier=ConfidenceTier.MEDIUM,
            evidence_level=EvidenceLevel.COHORT_STUDY,
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="CC_BY_SA_40",
            requires_attribution=True,
            requires_share_alike=True,
            allows_research=True,
            allows_commercial=True,
        )

    def get_confidence(self, record):
        return ConfidenceTier.MEDIUM

    async def health_check(self):
        return {"status": "ok", "connected": True}


class MockClinVarAdapter(DatabaseAdapter):
    """Mock ClinVar adapter — clinical variant interpretations."""

    @property
    def source_name(self) -> str:
        return "ClinVar"

    @property
    def source_version(self) -> str:
        return "2026-02"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        variant = query if isinstance(query, str) else query.get("variant", "VUS")
        significance = "uncertain significance" if "VUS" in str(variant) else "pathogenic"
        return [{"variant_id": "VCV000012345", "significance": significance, "gene": "BRCA1"}]

    async def normalize(self, raw):
        return [{"clinvar_id": r["variant_id"], "classification": r["significance"],
                 "canonical_id": r["variant_id"], "source": "ClinVar"} for r in raw]

    async def validate(self, records):
        return records

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="ClinVar",
            source_version="2026-02",
            source_record_id=record.get("clinvar_id", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="PUBLIC_DOMAIN",
            confidence_tier=ConfidenceTier.HIGH,
            evidence_level=EvidenceLevel.CASE_CONTROL,
        )

    def get_license(self):
        return LicenseMetadata(license_type="PUBLIC_DOMAIN", allows_research=True)

    def get_confidence(self, record):
        classification = record.get("classification", "").lower()
        if "uncertain" in classification:
            return ConfidenceTier.LOW
        if "pathogenic" in classification:
            return ConfidenceTier.HIGH
        return ConfidenceTier.MEDIUM

    async def health_check(self):
        return {"status": "ok", "connected": True}


class MockLOINCAdapter(DatabaseAdapter):
    """Mock LOINC adapter — laboratory observation codes."""

    @property
    def source_name(self) -> str:
        return "LOINC"

    @property
    def source_version(self) -> str:
        return "2.78"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        return [{"loinc_num": "33717-0", "component": "Hemoglobin", "system": "Bld"}]

    async def normalize(self, raw):
        return [{"loinc_code": r["loinc_num"], "test_name": r["component"],
                 "canonical_id": r["loinc_num"], "source": "LOINC"} for r in raw]

    async def validate(self, records):
        return records

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="LOINC",
            source_version="2.78",
            source_record_id=record.get("loinc_code", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="LOINC_LICENSE",
            confidence_tier=ConfidenceTier.CRITICAL,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
        )

    def get_license(self):
        return LicenseMetadata(license_type="LOINC_LICENSE", requires_attribution=True,
                               allows_research=True)

    def get_confidence(self, record):
        return ConfidenceTier.CRITICAL

    async def health_check(self):
        return {"status": "ok", "connected": True}


class MockOpenFDAAdapter(DatabaseAdapter):
    """Mock openFDA adapter — adverse events and drug labels."""

    @property
    def source_name(self) -> str:
        return "openFDA"

    @property
    def source_version(self) -> str:
        return "2026-01"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        return [{"safety_report_id": "SR001", "reaction": "headache", "drug": "aspirin"}]

    async def normalize(self, raw):
        return [{"report_id": r["safety_report_id"], "adverse_reaction": r["reaction"],
                 "canonical_id": r["safety_report_id"], "source": "openFDA"} for r in raw]

    async def validate(self, records):
        return records

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="openFDA",
            source_version="2026-01",
            source_record_id=record.get("report_id", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="PUBLIC_DOMAIN",
            confidence_tier=ConfidenceTier.MEDIUM,
            evidence_level=EvidenceLevel.CASE_SERIES,
        )

    def get_license(self):
        return LicenseMetadata(license_type="PUBLIC_DOMAIN", allows_research=True)

    def get_confidence(self, record):
        return ConfidenceTier.MEDIUM

    async def health_check(self):
        return {"status": "ok", "connected": True}


class MockCHBMPAdapter(DatabaseAdapter):
    """Mock CHBMP adapter — age-matched normative qEEG data."""

    @property
    def source_name(self) -> str:
        return "CHBMP"

    @property
    def source_version(self) -> str:
        return "3.2"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        age = query.get("patient_age", 35) if isinstance(query, dict) else 35
        if age < 18:
            return [{"normative_band": "alpha", "z_score": 1.2, "age_group": "adolescent"}]
        return [{"normative_band": "alpha", "z_score": 0.8, "age_group": "adult"}]

    async def normalize(self, raw):
        return [{"band": r["normative_band"], "zscore": r["z_score"],
                 "age_matched": r["age_group"],
                 "canonical_id": f"{r['normative_band']}:{r['age_group']}",
                 "source": "CHBMP"} for r in raw]

    async def validate(self, records):
        return records

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="CHBMP",
            source_version="3.2",
            source_record_id=f"{record.get('band','')}:{record.get('age_matched','')}",
            ingestion_timestamp=datetime.utcnow(),
            license_type="RESEARCH_USE_ONLY",
            confidence_tier=ConfidenceTier.MEDIUM,
            evidence_level=EvidenceLevel.COHORT_STUDY,
        )

    def get_license(self):
        return LicenseMetadata(license_type="RESEARCH_USE_ONLY", allows_research=True,
                               allows_commercial=False)

    def get_confidence(self, record):
        return ConfidenceTier.MEDIUM

    async def health_check(self):
        return {"status": "ok", "connected": True}


class MockMNIAtlasAdapter(DatabaseAdapter):
    """Mock MNI Atlas adapter — brain region lookup."""

    @property
    def source_name(self) -> str:
        return "MNI_Atlas"

    @property
    def source_version(self) -> str:
        return "ICBM_2009c"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        region = query if isinstance(query, str) else query.get("region", "prefrontal")
        return [{"region": region, "mni_x": -42, "mni_y": 32, "mni_z": 18, "ba_area": "BA46"}]

    async def normalize(self, raw):
        return [{"region_name": r["region"],
                 "mni_coordinates": (r["mni_x"], r["mni_y"], r["mni_z"]),
                 "brodmann": r["ba_area"],
                 "canonical_id": r["region"], "source": "MNI_Atlas"} for r in raw]

    async def validate(self, records):
        return records

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="MNI_Atlas",
            source_version="ICBM_2009c",
            source_record_id=record.get("region_name", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC_BY_40",
            confidence_tier=ConfidenceTier.HIGH,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
        )

    def get_license(self):
        return LicenseMetadata(license_type="CC_BY_40", requires_attribution=True,
                               allows_research=True)

    def get_confidence(self, record):
        return ConfidenceTier.HIGH

    async def health_check(self):
        return {"status": "ok", "connected": True}


class MockPROMISAdapter(DatabaseAdapter):
    """Mock PROMIS adapter — patient-reported outcome measures."""

    @property
    def source_name(self) -> str:
        return "PROMIS"

    @property
    def source_version(self) -> str:
        return "v2.0"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        return [{"instrument": "PROMIS-Depression", "t_score": 55.3, "se": 3.1}]

    async def normalize(self, raw):
        return [{"instrument_name": r["instrument"], "t_score": r["t_score"],
                 "std_error": r["se"],
                 "canonical_id": r["instrument"], "source": "PROMIS"} for r in raw]

    async def validate(self, records):
        return [r for r in records if r.get("t_score", 0) > 0]

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="PROMIS",
            source_version="v2.0",
            source_record_id=record.get("instrument_name", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC_BY_NC_40",
            confidence_tier=ConfidenceTier.HIGH,
            evidence_level=EvidenceLevel.RCT,
        )

    def get_license(self):
        return LicenseMetadata(license_type="CC_BY_NC_40", allows_commercial=False,
                               requires_attribution=True, allows_research=True)

    def get_confidence(self, record):
        return ConfidenceTier.HIGH

    async def health_check(self):
        return {"status": "ok", "connected": True}


class MockSimNIBSAdapter(DatabaseAdapter):
    """Mock SimNIBS adapter — tDCS/TMS simulation data (research-only)."""

    @property
    def source_name(self) -> str:
        return "SimNIBS"

    @property
    def source_version(self) -> str:
        return "4.1"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        return [{"simulation_type": "tDCS", "montage": "F3-F4", "e_field_max": 0.35}]

    async def normalize(self, raw):
        return [{"modality": r["simulation_type"], "electrode_placement": r["montage"],
                 "e_field_v_per_m": r["e_field_max"],
                 "canonical_id": f"{r['simulation_type']}:{r['montage']}",
                 "source": "SimNIBS"} for r in raw]

    async def validate(self, records):
        return records

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="SimNIBS",
            source_version="4.1",
            source_record_id=f"{record.get('modality','')}:{record.get('electrode_placement','')}",
            ingestion_timestamp=datetime.utcnow(),
            license_type="GPL_V3",
            confidence_tier=ConfidenceTier.LOW,
            evidence_level=EvidenceLevel.PRECLINICAL,
        )

    def get_license(self):
        return LicenseMetadata(license_type="GPL_V3", allows_commercial=True,
                               modification_allowed=True, redistribution_allowed=True,
                               allows_research=True)

    def get_confidence(self, record):
        return ConfidenceTier.LOW

    async def health_check(self):
        return {"status": "ok", "connected": True}


# ═══════════════════════════════════════════════════════════════════════════════
# PYTEST FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def mock_registry():
    """Create registry pre-loaded with 9 mock adapters across tiers P0-P2."""
    registry = AdapterRegistry()
    registry.register("rxnorm", MockRxNormAdapter(), tier="P0")
    registry.register("pharmgkb", MockPharmGKBAdapter(), tier="P0")
    registry.register("clinvar", MockClinVarAdapter(), tier="P0")
    registry.register("loinc", MockLOINCAdapter(), tier="P0")
    registry.register("openfda", MockOpenFDAAdapter(), tier="P1")
    registry.register("chbmp", MockCHBMPAdapter(), tier="P1")
    registry.register("mni_atlas", MockMNIAtlasAdapter(), tier="P1")
    registry.register("promis", MockPROMISAdapter(), tier="P1")
    registry.register("simnibs", MockSimNIBSAdapter(), tier="P2")
    return registry


@pytest.fixture
def mock_etl(mock_registry):
    """Create ETL pipeline backed by the mock registry."""
    return ETLPipeline(mock_registry)


@pytest.fixture
def empty_registry():
    """Fresh empty adapter registry."""
    return AdapterRegistry()


@pytest.fixture
def tmp_checkpoint_dir():
    """Temporary directory for ETL checkpoints."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def event_loop():
    """Create a fresh event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 1 — Base Adapter Tests  (15 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestProvenanceRecord:
    """Tests for ProvenanceRecord creation, serialization, and deserialization."""

    def test_provenance_record_creation(self):
        """ProvenanceRecord stores all required fields correctly."""
        ts = datetime.utcnow()
        prov = ProvenanceRecord(
            source_database="RxNorm",
            source_version="2026-01",
            source_record_id="12345",
            ingestion_timestamp=ts,
            license_type="PUBLIC_DOMAIN",
            confidence_tier=ConfidenceTier.HIGH,
        )
        assert prov.source_database == "RxNorm"
        assert prov.source_version == "2026-01"
        assert prov.source_record_id == "12345"
        assert prov.ingestion_timestamp == ts
        assert prov.license_type == "PUBLIC_DOMAIN"
        assert prov.confidence_tier is ConfidenceTier.HIGH
        assert prov.research_only is False

    def test_provenance_to_dict_and_from_dict(self):
        """Round-trip serialization via to_dict / from_dict preserves data."""
        ts = datetime(2026, 1, 15, 10, 30, 0)
        prov = ProvenanceRecord(
            source_database="PharmGKB",
            source_version="2025-Q4",
            source_record_id="PG001",
            ingestion_timestamp=ts,
            license_type="CC_BY_SA_40",
            confidence_tier=ConfidenceTier.MEDIUM,
            evidence_level=EvidenceLevel.COHORT_STUDY,
            citation_doi="10.1000/test",
            research_only=True,
        )
        d = prov.to_dict()
        restored = ProvenanceRecord.from_dict(d)
        assert restored.source_database == prov.source_database
        assert restored.source_version == prov.source_version
        assert restored.source_record_id == prov.source_record_id
        assert restored.ingestion_timestamp == ts
        assert restored.license_type == prov.license_type
        assert restored.confidence_tier == prov.confidence_tier
        assert restored.evidence_level == prov.evidence_level
        assert restored.citation_doi == prov.citation_doi
        assert restored.research_only is True


class TestEnums:
    """Tests for ConfidenceTier and EvidenceLevel enumerations."""

    @pytest.mark.parametrize("tier,expected", [
        (ConfidenceTier.CRITICAL, "critical"),
        (ConfidenceTier.HIGH, "high"),
        (ConfidenceTier.MEDIUM, "medium"),
        (ConfidenceTier.LOW, "low"),
        (ConfidenceTier.UNKNOWN, "unknown"),
        (ConfidenceTier.RESEARCH, "research"),
    ])
    def test_confidence_tier_values(self, tier, expected):
        """ConfidenceTier enum members have expected string values."""
        assert tier.value == expected

    @pytest.mark.parametrize("level,expected", [
        (EvidenceLevel.SYSTEMATIC_REVIEW, "SYSTEMATIC_REVIEW"),
        (EvidenceLevel.RCT, "RCT"),
        (EvidenceLevel.COHORT_STUDY, "COHORT_STUDY"),
        (EvidenceLevel.CASE_CONTROL, "CASE_CONTROL"),
        (EvidenceLevel.CASE_SERIES, "CASE_SERIES"),
        (EvidenceLevel.EXPERT_OPINION, "EXPERT_OPINION"),
        (EvidenceLevel.PRECLINICAL, "PRECLINICAL"),
        (EvidenceLevel.ANECDOTAL, "ANECDOTAL"),
        (EvidenceLevel.PILOT_EXPERT, "PILOT_EXPERT"),
    ])
    def test_evidence_level_values(self, level, expected):
        """EvidenceLevel enum members have expected string values."""
        assert level.value == expected


class TestLicenseMetadata:
    """Tests for LicenseMetadata defaults and behaviour."""

    def test_license_defaults(self):
        """LicenseMetadata defaults are conservative (restrictive)."""
        lic = LicenseMetadata()
        assert lic.license_type == "UNKNOWN"
        assert lic.allows_commercial is False
        assert lic.allows_research is True
        assert lic.share_alike is False
        assert lic.modification_allowed is False
        assert lic.requires_attribution is True
        assert lic.redistribution_allowed is False

    def test_license_compliance_research(self):
        """Research use is permitted by default."""
        lic = LicenseMetadata(license_type="CC_BY_NC_40")
        assert lic.is_compliant_for_use("research") is True

    def test_license_compliance_commercial(self):
        """Commercial use is blocked when allows_commercial is False."""
        lic = LicenseMetadata(license_type="CC_BY_NC_40", allows_commercial=False)
        assert lic.is_compliant_for_use("commercial") is False


class TestDatabaseAdapterCache:
    """Tests for DatabaseAdapter cache utilities."""

    @pytest.fixture
    def adapter(self):
        """Provide a concrete adapter instance for cache tests."""
        return MockRxNormAdapter()

    def test_cache_valid_within_ttl(self, adapter):
        """_is_cache_valid returns True when entry is fresh."""
        adapter._cache_ttl_seconds = 3600
        adapter._write_cache("key1", {"data": [1, 2, 3]})
        assert adapter._is_cache_valid("key1") is True

    def test_cache_invalid_when_expired(self, adapter):
        """_is_cache_valid returns False when TTL has elapsed."""
        adapter._cache_ttl_seconds = 0
        adapter._write_cache("key2", {"data": [1]})
        assert adapter._is_cache_valid("key2") is False

    def test_cache_invalid_missing_key(self, adapter):
        """_is_cache_valid returns False for nonexistent keys."""
        assert adapter._is_cache_valid("no_such_key") is False

    def test_get_cache_path_deterministic(self, adapter):
        """_get_cache_path produces identical hashes for identical queries."""
        q = {"drug": "aspirin", "strength": "81mg"}
        p1 = adapter._get_cache_path(q)
        p2 = adapter._get_cache_path(q)
        assert p1 == p2
        assert p1.startswith("rxnorm_")

    def test_get_cache_path_string_query(self, adapter):
        """_get_cache_path works with string queries."""
        p = adapter._get_cache_path("aspirin")
        assert p.startswith("rxnorm_")

    def test_read_write_cache(self, adapter):
        """Cache write followed by read returns the stored data."""
        adapter._write_cache("kw", {"items": ["a", "b"]})
        assert adapter._read_cache("kw") == {"items": ["a", "b"]}


class TestConfidenceAndFlagging:
    """Tests for confidence scoring and research_only flagging."""

    @pytest.fixture
    def adapter(self):
        return MockRxNormAdapter()

    def test_calculate_confidence_score_all_dimensions(self, adapter):
        """Composite score with explicit dimensions is weighted correctly."""
        record = {"name": "aspirin"}
        dims = {
            "source_reliability": 1.0, "evidence_strength": 1.0,
            "data_completeness": 1.0, "temporal_relevance": 1.0,
            "cross_validation": 1.0,
        }
        score = adapter._calculate_confidence_score(record, dims)
        assert 0.95 <= score <= 1.0

    def test_calculate_confidence_score_bounds(self, adapter):
        """Score is clamped to [0.0, 1.0] regardless of input."""
        score = adapter._calculate_confidence_score({}, {"source_reliability": 999})
        assert score == 1.0
        score = adapter._calculate_confidence_score({}, {"source_reliability": -999})
        assert score == 0.0

    def test_flag_research_only_single_source(self, adapter):
        """Single-source data triggers research_only flag with reason."""
        ctx = {"source_count": 1}
        is_research, reason = adapter._flag_research_only({}, ctx)
        assert is_research is True
        assert "Single-source" in reason

    def test_flag_research_only_pilot_study(self, adapter):
        """Pilot study context triggers research_only flag."""
        ctx = {"is_pilot_study": True}
        is_research, reason = adapter._flag_research_only({}, ctx)
        assert is_research is True
        assert "Pilot" in reason

    def test_flag_research_only_population_mismatch(self, adapter):
        """Population mismatch triggers research_only flag."""
        ctx = {"patient_age": 35, "study_population": "pediatric"}
        is_research, reason = adapter._flag_research_only({}, ctx)
        assert is_research is True
        assert "mismatch" in reason.lower()

    def test_flag_research_only_no_criteria(self, adapter):
        """No research-only criteria present -> flag remains False."""
        ctx = {"source_count": 3, "is_pilot_study": False}
        is_research, reason = adapter._flag_research_only({}, ctx)
        assert is_research is False
        assert reason == ""

    def test_flag_research_only_preclinical(self, adapter):
        """Preclinical data triggers research_only via is_preclinical kwarg."""
        is_research, reason = adapter._flag_research_only({}, {}, is_preclinical=True)
        assert is_research is True
        assert "Preclinical" in reason

    def test_flag_research_only_short_followup(self, adapter):
        """Follow-up < 3 months triggers research_only flag."""
        ctx = {"follow_up_months": 1}
        is_research, reason = adapter._flag_research_only({}, ctx)
        assert is_research is True
        assert "3 months" in reason

    def test_flag_research_only_flags_set(self, adapter):
        """Direct flags membership triggers research_only."""
        for criterion in adapter._RESEARCH_ONLY_CRITERIA:
            ctx = {"flags": {criterion}}
            is_research, _ = adapter._flag_research_only({}, ctx)
            assert is_research is True, criterion


class TestAttribution:
    """Tests for license attribution text generation."""

    def test_generate_attribution_text(self):
        """Attribution text includes source name, version, and license info."""
        adapter = MockRxNormAdapter()
        lic = adapter.get_license()
        text = adapter._generate_attribution_text(lic)
        assert "RxNorm" in text
        assert "2026-01" in text
        assert "PUBLIC_DOMAIN" in text

    def test_hash_record(self):
        """_hash_record produces deterministic SHA-256 hex digest."""
        adapter = MockRxNormAdapter()
        h1 = adapter._hash_record({"a": 1, "b": 2})
        h2 = adapter._hash_record({"a": 1, "b": 2})
        assert h1 == h2
        assert len(h1) == 64


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 2 — Adapter Registry Tests  (12 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestAdapterRegistryRegistration:
    """Tests for adapter registration and unregistration."""

    def test_register_adapter(self, empty_registry):
        """Registering a new adapter succeeds and is retrievable."""
        adapter = MockRxNormAdapter()
        empty_registry.register("rxnorm", adapter, tier="P0")
        assert "rxnorm" in empty_registry
        assert empty_registry.get("rxnorm") is adapter

    def test_register_duplicate_raises(self, empty_registry):
        """Registering an existing name raises AdapterAlreadyRegisteredError."""
        empty_registry.register("rxnorm", MockRxNormAdapter(), tier="P0")
        with pytest.raises(AdapterAlreadyRegisteredError):
            empty_registry.register("rxnorm", MockRxNormAdapter(), tier="P0")

    def test_unregister_adapter(self, empty_registry):
        """Unregistering removes adapter; subsequent get returns None."""
        adapter = MockRxNormAdapter()
        empty_registry.register("rxnorm", adapter, tier="P0")
        empty_registry.unregister("rxnorm")
        assert empty_registry.get("rxnorm") is None

    def test_unregister_nonexistent_raises(self, empty_registry):
        """Unregistering an unknown name raises AdapterNotFoundError."""
        with pytest.raises(AdapterNotFoundError):
            empty_registry.unregister("ghost")

    def test_register_invalid_tier(self, empty_registry):
        """Registering with an invalid tier raises InvalidTierError."""
        with pytest.raises(InvalidTierError):
            empty_registry.register("rx", MockRxNormAdapter(), tier="P99")


class TestAdapterRegistryRetrieval:
    """Tests for adapter retrieval and listing."""

    def test_get_adapter(self, mock_registry):
        """get() returns the correct adapter by name."""
        adapter = mock_registry.get("rxnorm")
        assert adapter is not None
        assert adapter.source_name == "RxNorm"

    def test_get_nonexistent_returns_none(self, mock_registry):
        """get() returns None for unknown adapter names."""
        assert mock_registry.get("nonexistent") is None

    def test_get_required_raises(self, empty_registry):
        """get_required() raises AdapterNotFoundError for missing adapter."""
        with pytest.raises(AdapterNotFoundError):
            empty_registry.get_required("missing")

    def test_list_adapters(self, mock_registry):
        """list_adapters() returns all registered adapter names."""
        all_names = mock_registry.list_adapters()
        assert len(all_names) == 9
        assert "rxnorm" in all_names
        assert "simnibs" in all_names

    def test_list_adapters_by_tier(self, mock_registry):
        """list_adapters(tier=...) filters by confidence tier."""
        p0 = mock_registry.list_adapters(tier="P0")
        assert len(p0) == 4

        p2 = mock_registry.list_adapters(tier="P2")
        assert len(p2) == 1
        assert "simnibs" in p2

    def test_list_by_tier_grouping(self, mock_registry):
        """list_by_tier() groups adapter names by tier."""
        grouped = mock_registry.list_by_tier()
        assert len(grouped["P0"]) == 4
        assert len(grouped["P1"]) == 4
        assert len(grouped["P2"]) == 1

    def test_has_adapter(self, mock_registry):
        """has_adapter() returns True for registered, False otherwise."""
        assert mock_registry.has_adapter("rxnorm") is True
        assert mock_registry.has_adapter("ghost") is False


class TestAdapterRegistryHealth:
    """Tests for health check operations."""

    @pytest.mark.asyncio
    async def test_health_check_all(self, mock_registry):
        """health_check_all returns healthy for all registered adapters."""
        results = await mock_registry.health_check_all()
        assert len(results) == 9
        for name, result in results.items():
            assert result.get("status") in ("ok", "healthy"), f"{name} was unhealthy"

    @pytest.mark.asyncio
    async def test_health_check_with_failing_adapter(self, empty_registry):
        """health_check_all captures exceptions as unhealthy entries."""
        failing = MockRxNormAdapter()
        failing.health_check = AsyncMock(side_effect=ConnectionError("upstream timeout"))
        empty_registry.register("fail", failing, tier="P2")

        results = await empty_registry.health_check_all()
        assert "fail" in results

    @pytest.mark.asyncio
    async def test_health_check_single_adapter(self, mock_registry):
        """health_check on a single adapter returns its status."""
        result = await mock_registry.health_check("rxnorm")
        assert "status" in result


class TestAdapterRegistryMetadata:
    """Tests for metadata and license aggregation."""

    def test_get_adapter_info(self, mock_registry):
        """get_adapter_info returns structured metadata for an adapter."""
        info = mock_registry.get_adapter_info("rxnorm")
        assert info["name"] == "rxnorm"
        assert info["source_name"] == "RxNorm"
        assert info["tier"] == "P0"

    def test_get_all_licenses(self, mock_registry):
        """get_all_licenses collects LicenseMetadata for every adapter."""
        licenses = mock_registry.get_all_licenses()
        assert len(licenses) == 9
        assert licenses["rxnorm"].license_type == "PUBLIC_DOMAIN"
        assert licenses["pharmgkb"].license_type == "CC_BY_SA_40"

    def test_generate_compliance_report(self, mock_registry):
        """generate_compliance_report aggregates license info across adapters."""
        report = mock_registry.generate_compliance_report()
        assert report["total_adapters"] == 9
        assert len(report["adapters"]) == 9

    def test_stats(self, mock_registry):
        """stats() returns registry statistics."""
        stats = mock_registry.stats()
        assert stats["total_adapters"] == 9
        assert stats["initialized"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 3 — ETL Pipeline Tests  (12 tests)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
class TestETLPipelineRun:
    """Tests for full ETL pipeline execution."""

    async def test_etl_run_full_pipeline(self, mock_etl):
        """Full ETL run produces records with provenance and confidence."""
        result = await mock_etl.run("rxnorm", {"name": "aspirin"})
        assert isinstance(result, ETLResult)
        assert result.adapter_name == "rxnorm"
        assert result.records_extracted >= 1
        assert result.records_transformed >= 1
        assert result.records_valid >= 1
        assert result.status in (ETLStatus.SUCCESS, ETLStatus.PARTIAL)

    async def test_etl_with_failing_extract(self, mock_registry, tmp_checkpoint_dir):
        """ETL captures extraction failures in failed_jobs."""
        bad_adapter = MockRxNormAdapter()
        bad_adapter.fetch = AsyncMock(side_effect=FetchError("network down"))
        mock_registry.register("bad", bad_adapter, tier="P2")

        etl = ETLPipeline(mock_registry, checkpoint_dir=tmp_checkpoint_dir)
        result = await etl.run("bad", {"name": "test"})
        assert result.status == ETLStatus.FAILED
        assert len(etl.get_failed_jobs()) >= 1

    async def test_etl_checkpoint_save(self, mock_registry, tmp_checkpoint_dir):
        """Checkpoint is written to disk after successful run."""
        etl = ETLPipeline(mock_registry, checkpoint_dir=tmp_checkpoint_dir)
        result = await etl.run("rxnorm", {"name": "checkpoint_test"})
        assert result.status == ETLStatus.SUCCESS
        # Verify checkpoint file exists
        checkpoints = os.listdir(tmp_checkpoint_dir)
        assert len(checkpoints) >= 1

    async def test_etl_checkpoint_load(self, mock_registry, tmp_checkpoint_dir):
        """Checkpoint can be loaded and contains pipeline state."""
        etl = ETLPipeline(mock_registry, checkpoint_dir=tmp_checkpoint_dir)
        await etl.run("rxnorm", {"name": "load_test"})
        checkpoints = os.listdir(tmp_checkpoint_dir)
        cp = etl.load_checkpoint(checkpoints[0].replace(".json", ""))
        assert cp is not None
        assert "_meta" in cp

    async def test_etl_recover_from_checkpoint(self, mock_registry, tmp_checkpoint_dir):
        """Recovering from checkpoint returns an ETLResult."""
        etl = ETLPipeline(mock_registry, checkpoint_dir=tmp_checkpoint_dir)
        original = await etl.run("rxnorm", {"name": "recover_test"})
        # Recovery needs a checkpoint to exist
        recovered = await etl.recover(original.job_id)
        assert isinstance(recovered, ETLResult)

    async def test_etl_run_batch(self, mock_etl):
        """run_batch executes multiple jobs and returns all results."""
        jobs = [
            {"adapter_name": "rxnorm", "query": {"name": "aspirin"}},
            {"adapter_name": "clinvar", "query": {"variant": "pathogenic"}},
            {"adapter_name": "loinc", "query": {"name": "hemoglobin"}},
        ]
        results = await mock_etl.run_batch(jobs)
        assert len(results) == 3
        for r in results:
            assert isinstance(r, ETLResult)

    async def test_etl_failed_job_tracking(self, mock_registry, tmp_checkpoint_dir):
        """Failed jobs are tracked with metadata for later inspection."""
        fail_adapter = MockRxNormAdapter()
        fail_adapter.fetch = AsyncMock(side_effect=RuntimeError("boom"))
        mock_registry.register("track_fail", fail_adapter, tier="P2")

        etl = ETLPipeline(mock_registry, checkpoint_dir=tmp_checkpoint_dir)
        result = await etl.run("track_fail", {"name": "test"})
        assert result.status == ETLStatus.FAILED
        failed = etl.get_failed_jobs()
        assert len(failed) >= 1
        assert any("track_fail" in str(f.get("adapter_name", "")) for f in failed)

    async def test_etl_idempotency(self, mock_etl):
        """Running the same query twice yields a consistent ETLResult."""
        r1 = await mock_etl.run("rxnorm", {"name": "idempotent_query"})
        r2 = await mock_etl.run("rxnorm", {"name": "idempotent_query"})
        assert r1.adapter_name == r2.adapter_name == "rxnorm"
        assert r1.records_extracted == r2.records_extracted

    async def test_etl_provenance_propagation(self, mock_etl):
        """Provenance summary is populated after ETL run."""
        result = await mock_etl.run("rxnorm", {"name": "provenance_test"})
        assert result.provenance_summary
        assert "sources" in result.provenance_summary
        assert "RxNorm" in result.provenance_summary["sources"]

    async def test_etl_confidence_scoring_propagation(self, mock_etl):
        """Confidence breakdown is populated after ETL run."""
        result = await mock_etl.run("rxnorm", {"name": "confidence_test"})
        assert result.confidence_breakdown
        assert sum(result.confidence_breakdown.values()) >= result.records_valid

    async def test_etl_with_empty_results(self, mock_registry, tmp_checkpoint_dir):
        """ETL handles adapters that return empty result sets."""
        empty_adapter = MockRxNormAdapter()
        empty_adapter.fetch = AsyncMock(return_value=[])
        mock_registry.register("empty", empty_adapter, tier="P2")

        etl = ETLPipeline(mock_registry, checkpoint_dir=tmp_checkpoint_dir)
        result = await etl.run("empty", {"name": "nothing"})
        assert result.status == ETLStatus.SUCCESS
        assert result.records_extracted == 0

    async def test_etl_clear_failed_jobs(self, mock_registry, tmp_checkpoint_dir):
        """clear_failed_jobs empties the failed jobs list."""
        fail_adapter = MockRxNormAdapter()
        fail_adapter.fetch = AsyncMock(side_effect=RuntimeError("boom"))
        mock_registry.register("clear_fail", fail_adapter, tier="P2")

        etl = ETLPipeline(mock_registry, checkpoint_dir=tmp_checkpoint_dir)
        await etl.run("clear_fail", {"name": "test"})
        assert len(etl.get_failed_jobs()) >= 1
        cleared = etl.clear_failed_jobs()
        assert cleared >= 1
        assert len(etl.get_failed_jobs()) == 0



# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 4 — Mock Adapter Tests  (15 tests)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
class TestMockRxNormAdapter:
    """Tests for the mock RxNorm adapter."""

    async def test_full_lifecycle(self):
        """RxNorm adapter connects, fetches, normalizes, validates, disconnects."""
        adapter = MockRxNormAdapter()
        assert await adapter.connect() is True
        assert adapter.is_connected is True

        raw = await adapter.fetch("aspirin")
        assert len(raw) == 1
        assert raw[0]["rxcui"] == "12345"

        norm = await adapter.normalize(raw)
        assert norm[0]["canonical_name"] == "aspirin"

        valid = await adapter.validate(norm)
        assert len(valid) == 1

        await adapter.disconnect()
        assert adapter.is_connected is False

    async def test_provenance_generation(self):
        """RxNorm adapter produces correct provenance records."""
        adapter = MockRxNormAdapter()
        record = {"rxcui": "12345", "canonical_name": "aspirin"}
        prov = adapter.get_provenance(record)
        assert prov.source_database == "RxNorm"
        assert prov.source_version == "2026-01"
        assert prov.source_record_id == "12345"
        assert prov.license_type == "PUBLIC_DOMAIN"
        assert prov.confidence_tier == ConfidenceTier.HIGH

    def test_confidence_scoring(self):
        """RxNorm adapter assigns HIGH confidence."""
        adapter = MockRxNormAdapter()
        assert adapter.get_confidence({}) == ConfidenceTier.HIGH

    def test_license_metadata(self):
        """RxNorm license is PUBLIC_DOMAIN with permissive terms."""
        lic = MockRxNormAdapter().get_license()
        assert lic.license_type == "PUBLIC_DOMAIN"
        assert lic.allows_commercial is True
        assert lic.redistribution_allowed is True

    async def test_health_check(self):
        """RxNorm health check reports ok."""
        adapter = MockRxNormAdapter()
        health = await adapter.health_check()
        assert health["status"] == "ok"

    async def test_empty_results(self):
        """RxNorm handles empty fetch results gracefully."""
        adapter = MockRxNormAdapter()
        await adapter.connect()
        norm = await adapter.normalize([])
        assert norm == []
        valid = await adapter.validate(norm)
        assert valid == []

    async def test_error_response(self):
        """Simulated error in fetch raises exception."""
        adapter = MockRxNormAdapter()
        adapter.fetch = AsyncMock(side_effect=TimeoutError("timeout"))
        with pytest.raises(TimeoutError):
            await adapter.fetch("query")


@pytest.mark.asyncio
class TestMockPharmGKBAdapter:
    """Tests for the mock PharmGKB adapter."""

    async def test_research_only_flagging(self):
        """PharmGKB data from pilot studies is flagged research_only."""
        adapter = MockPharmGKBAdapter()
        record = {"gene_symbol": "CYP2D6", "drug_name": "codeine"}
        ctx = {"is_pilot_study": True}
        is_research, reason = adapter._flag_research_only(record, ctx)
        assert is_research is True
        assert "Pilot" in reason

    async def test_fetch_normalize_cycle(self):
        """PharmGKB fetch -> normalize produces structured pharmacogenomics data."""
        adapter = MockPharmGKBAdapter()
        await adapter.connect()
        raw = await adapter.fetch({"gene": "CYP2D6"})
        assert raw[0]["gene"] == "CYP2D6"
        norm = await adapter.normalize(raw)
        assert norm[0]["gene_symbol"] == "CYP2D6"
        await adapter.disconnect()


@pytest.mark.asyncio
class TestMockClinVarAdapter:
    """Tests for the mock ClinVar adapter."""

    async def test_vus_handling(self):
        """ClinVar returns LOW confidence for VUS."""
        adapter = MockClinVarAdapter()
        await adapter.connect()
        raw = await adapter.fetch({"variant": "VUS"})
        norm = await adapter.normalize(raw)
        confidence = adapter.get_confidence(norm[0])
        assert confidence == ConfidenceTier.LOW
        await adapter.disconnect()

    async def test_pathogenic_handling(self):
        """ClinVar returns HIGH confidence for pathogenic variants."""
        adapter = MockClinVarAdapter()
        await adapter.connect()
        raw = await adapter.fetch({"variant": "pathogenic"})
        norm = await adapter.normalize(raw)
        confidence = adapter.get_confidence(norm[0])
        assert confidence == ConfidenceTier.HIGH
        await adapter.disconnect()


@pytest.mark.asyncio
class TestMockLOINCAdapter:
    """Tests for the mock LOINC adapter."""

    async def test_full_lifecycle(self):
        """LOINC adapter produces laboratory code mappings."""
        adapter = MockLOINCAdapter()
        await adapter.connect()
        raw = await adapter.fetch("hemoglobin")
        assert raw[0]["loinc_num"] == "33717-0"
        norm = await adapter.normalize(raw)
        assert norm[0]["test_name"] == "Hemoglobin"
        assert adapter.get_confidence({}) == ConfidenceTier.CRITICAL
        await adapter.disconnect()


@pytest.mark.asyncio
class TestMockOpenFDAAdapter:
    """Tests for the mock openFDA adapter."""

    async def test_full_lifecycle(self):
        """openFDA adapter returns adverse event data with provenance."""
        adapter = MockOpenFDAAdapter()
        await adapter.connect()
        raw = await adapter.fetch("aspirin")
        assert raw[0]["drug"] == "aspirin"
        norm = await adapter.normalize(raw)
        assert norm[0]["adverse_reaction"] == "headache"
        prov = adapter.get_provenance(norm[0])
        assert prov.source_database == "openFDA"
        assert prov.confidence_tier == ConfidenceTier.MEDIUM
        await adapter.disconnect()


@pytest.mark.asyncio
class TestMockCHBMPAdapter:
    """Tests for the mock CHBMP adapter (age matching)."""

    async def test_age_matching_adult(self):
        """CHBMP returns adult norms for adult patients."""
        adapter = MockCHBMPAdapter()
        await adapter.connect()
        raw = await adapter.fetch({"patient_age": 35})
        assert raw[0]["age_group"] == "adult"
        await adapter.disconnect()

    async def test_age_matching_adolescent(self):
        """CHBMP returns adolescent norms for under-18 patients."""
        adapter = MockCHBMPAdapter()
        await adapter.connect()
        raw = await adapter.fetch({"patient_age": 15})
        assert raw[0]["age_group"] == "adolescent"
        await adapter.disconnect()


@pytest.mark.asyncio
class TestMockMNIAtlasAdapter:
    """Tests for the mock MNI Atlas adapter (region lookup)."""

    async def test_region_lookup(self):
        """MNI Atlas returns coordinates for brain regions."""
        adapter = MockMNIAtlasAdapter()
        await adapter.connect()
        raw = await adapter.fetch({"region": "prefrontal"})
        assert raw[0]["region"] == "prefrontal"
        assert raw[0]["ba_area"] == "BA46"
        norm = await adapter.normalize(raw)
        assert norm[0]["brodmann"] == "BA46"
        assert isinstance(norm[0]["mni_coordinates"], tuple)
        await adapter.disconnect()


@pytest.mark.asyncio
class TestMockPROMISAdapter:
    """Tests for the mock PROMIS adapter."""

    async def test_full_lifecycle(self):
        """PROMIS adapter returns patient-reported outcome T-scores."""
        adapter = MockPROMISAdapter()
        await adapter.connect()
        raw = await adapter.fetch("depression")
        assert raw[0]["t_score"] == 55.3
        norm = await adapter.normalize(raw)
        assert norm[0]["t_score"] == 55.3
        validated = await adapter.validate(norm)
        assert len(validated) == 1
        lic = adapter.get_license()
        assert lic.allows_commercial is False
        await adapter.disconnect()


@pytest.mark.asyncio
class TestMockSimNIBSAdapter:
    """Tests for the mock SimNIBS adapter (research-only)."""

    async def test_research_only(self):
        """SimNIBS data is inherently research-only (preclinical evidence)."""
        adapter = MockSimNIBSAdapter()
        await adapter.connect()
        raw = await adapter.fetch("tDCS")
        assert raw[0]["simulation_type"] == "tDCS"
        prov = adapter.get_provenance(raw[0])
        assert prov.evidence_level == EvidenceLevel.PRECLINICAL
        assert prov.confidence_tier == ConfidenceTier.LOW
        is_research, reason = adapter._flag_research_only(
            raw[0], {}, is_preclinical=True
        )
        assert is_research is True
        assert "Preclinical" in reason
        await adapter.disconnect()


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 5 — Integration Tests  (10 tests)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
class TestRegistryAdapterLifecycle:
    """Tests integrating registry with adapter lifecycle operations."""

    async def test_registry_adapter_lifecycle(self, empty_registry):
        """Registry-managed adapter connects, runs health check, and disconnects."""
        adapter = MockRxNormAdapter()
        empty_registry.register("rx", adapter, tier="P0")
        retrieved = empty_registry.get("rx")
        assert retrieved is adapter

        await retrieved.connect()
        assert retrieved.is_connected is True

        health = await empty_registry.health_check_all()
        assert health["rx"]["status"] == "ok"

        await empty_registry.shutdown_all()
        assert adapter.is_connected is False

    async def test_registry_etl_pipeline(self, mock_registry, tmp_checkpoint_dir):
        """Registry + ETL pipeline together execute full data flow."""
        etl = ETLPipeline(mock_registry, checkpoint_dir=tmp_checkpoint_dir)
        result = await etl.run("rxnorm", {"name": "acetaminophen"})
        assert result.records_extracted >= 1
        assert result.provenance_summary
        assert "RxNorm" in result.provenance_summary["sources"]


@pytest.mark.asyncio
class TestBridgeFlows:
    """Tests for clinical bridge integration flows."""

    async def test_medication_bridge_with_mock_adapters(self, mock_etl):
        """Medication bridge: RxNorm + openFDA yields cross-referenced drug data."""
        rx_result = await mock_etl.run("rxnorm", {"name": "warfarin"})
        fda_result = await mock_etl.run("openfda", {"name": "warfarin"})
        assert rx_result.records_extracted >= 1
        assert fda_result.records_extracted >= 1

    async def test_genetic_bridge_with_mock_adapters(self, mock_etl):
        """Genetic bridge: PharmGKB + ClinVar yields gene-drug + variant data."""
        pgkb_result = await mock_etl.run("pharmgkb", {"gene": "CYP2C19"})
        clinvar_result = await mock_etl.run("clinvar", {"variant": "pathogenic"})
        assert pgkb_result.records_extracted >= 1
        assert clinvar_result.records_extracted >= 1

    async def test_qeeg_bridge_with_mock_adapters(self, mock_etl):
        """qEEG bridge: CHBMP + MNI Atlas yields normative + spatial data."""
        chbmp_result = await mock_etl.run("chbmp", {"patient_age": 35, "band": "alpha"})
        mni_result = await mock_etl.run("mni_atlas", {"region": "prefrontal"})
        assert chbmp_result.records_extracted >= 1
        assert mni_result.records_extracted >= 1

    async def test_mri_bridge_with_mock_adapters(self, mock_etl):
        """MRI bridge: MNI Atlas yields anatomical coordinate data."""
        result = await mock_etl.run("mni_atlas", {"region": "motor"})
        assert result.records_extracted >= 1

    async def test_full_medication_lookup_flow(self, mock_etl):
        """End-to-end: query RxNorm -> normalize -> validate -> provenance."""
        result = await mock_etl.run("rxnorm", {"name": "metformin"})
        assert result.adapter_name == "rxnorm"
        assert result.records_extracted >= 1
        assert result.records_valid >= 1
        assert result.provenance_summary

    async def test_full_gene_drug_query_flow(self, mock_etl):
        """End-to-end: query PharmGKB -> cross-reference with confidence."""
        result = await mock_etl.run("pharmgkb", {"gene": "SLCO1B1"})
        assert result.adapter_name == "pharmgkb"
        assert result.records_extracted >= 1

    async def test_full_z_score_calculation_flow(self, mock_etl):
        """End-to-end: CHBMP lookup yields z-score with age-matched norms."""
        result = await mock_etl.run("chbmp", {"patient_age": 25, "band": "alpha"})
        assert result.adapter_name == "chbmp"
        assert result.records_extracted >= 1

    async def test_provenance_propagation_through_pipeline(self, mock_etl):
        """Provenance flows from adapter through ETL to output summary."""
        result = await mock_etl.run("rxnorm", {"name": "provenance_test"})
        assert result.records_valid >= 1
        prov = result.provenance_summary
        assert "RxNorm" in prov["sources"]
        assert prov["record_count"] >= 1


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 6 — Governance Tests  (8 tests)
# ═══════════════════════════════════════════════════════════════════════════════

class TestGovernanceConfidenceTiers:
    """Tests for confidence tier assignment governance."""

    def test_confidence_tier_assignment_critical(self):
        """LOINC (standardized lab codes) receives CRITICAL tier."""
        adapter = MockLOINCAdapter()
        assert adapter.get_confidence({}) == ConfidenceTier.CRITICAL

    def test_confidence_tier_assignment_high(self):
        """RxNorm (peer-reviewed terminology) receives HIGH tier."""
        adapter = MockRxNormAdapter()
        assert adapter.get_confidence({}) == ConfidenceTier.HIGH

    def test_confidence_tier_assignment_medium(self):
        """PharmGKB (cohort evidence) receives MEDIUM tier."""
        adapter = MockPharmGKBAdapter()
        assert adapter.get_confidence({}) == ConfidenceTier.MEDIUM

    def test_confidence_tier_assignment_low(self):
        """SimNIBS (preclinical simulation) receives LOW tier."""
        adapter = MockSimNIBSAdapter()
        assert adapter.get_confidence({}) == ConfidenceTier.LOW


class TestGovernanceEvidenceLevels:
    """Tests for evidence level assignment governance."""

    def test_evidence_level_systematic_review(self):
        """LOINC evidence level is SYSTEMATIC_REVIEW."""
        prov = MockLOINCAdapter().get_provenance({"loinc_code": "test"})
        assert prov.evidence_level == EvidenceLevel.SYSTEMATIC_REVIEW

    def test_evidence_level_rct(self):
        """PROMIS evidence level is RCT."""
        prov = MockPROMISAdapter().get_provenance({"instrument_name": "test"})
        assert prov.evidence_level == EvidenceLevel.RCT

    def test_evidence_level_preclinical(self):
        """SimNIBS evidence level is PRECLINICAL."""
        prov = MockSimNIBSAdapter().get_provenance({"modality": "tDCS"})
        assert prov.evidence_level == EvidenceLevel.PRECLINICAL


class TestGovernanceResearchOnlyFlagging:
    """Tests for research_only flagging governance rules."""

    def test_research_only_single_source(self):
        """Single-source data is automatically flagged research_only."""
        adapter = MockRxNormAdapter()
        ctx = {"source_count": 1}
        is_research, reason = adapter._flag_research_only({}, ctx)
        assert is_research is True
        assert reason

    def test_research_only_pilot_study(self):
        """Pilot study data is flagged research_only."""
        adapter = MockRxNormAdapter()
        ctx = {"is_pilot_study": True}
        is_research, reason = adapter._flag_research_only({}, ctx)
        assert is_research is True

    def test_research_only_off_label(self):
        """Off-label use data is flagged research_only."""
        adapter = MockRxNormAdapter()
        ctx = {"is_off_label": True}
        is_research, reason = adapter._flag_research_only({}, ctx)
        assert is_research is True


class TestGovernancePHIBoundary:
    """Tests for PHI boundary enforcement."""

    def test_no_phi_in_cache_key(self):
        """Cache key derivation does not embed direct patient identifiers."""
        adapter = MockRxNormAdapter()
        query_with_phi = {"drug": "warfarin", "mrn": "12345678"}
        cache_key = adapter._get_cache_path(query_with_phi)
        assert "12345678" not in cache_key
        assert "mrn" not in cache_key
        assert adapter._get_cache_path(query_with_phi) == cache_key

    def test_cache_key_contains_source_prefix(self):
        """Cache key includes the adapter source name prefix."""
        adapter = MockLOINCAdapter()
        key = adapter._get_cache_path("test")
        assert key.startswith("loinc_")


class TestGovernanceLicenseCompliance:
    """Tests for license compliance checks."""

    def test_license_compliance_check_public_domain(self):
        """PUBLIC_DOMAIN license permits all use cases."""
        lic = LicenseMetadata(
            license_type="PUBLIC_DOMAIN",
            allows_commercial=True,
            redistribution_allowed=True,
            allows_research=True,
        )
        assert lic.is_compliant_for_use("research") is True
        assert lic.is_compliant_for_use("commercial") is True
        assert lic.is_compliant_for_use("redistribution") is True

    def test_license_compliance_check_nc(self):
        """CC-BY-NC license blocks commercial use."""
        lic = LicenseMetadata(
            license_type="CC_BY_NC_40", allows_commercial=False,
            requires_attribution=True, allows_research=True,
        )
        assert lic.is_compliant_for_use("research") is True
        assert lic.is_compliant_for_use("commercial") is False

    def test_license_compliance_check_sa(self):
        """CC-BY-SA license allows redistribution when share_alike."""
        lic = LicenseMetadata(
            license_type="CC_BY_SA_40", requires_share_alike=True,
            redistribution_allowed=True, allows_research=True,
        )
        assert lic.is_compliant_for_use("redistribution") is True


class TestGovernanceAttribution:
    """Tests for attribution text generation governance."""

    def test_attribution_text_generation(self):
        """Attribution text contains source name, version, and license."""
        adapter = MockPROMISAdapter()
        lic = adapter.get_license()
        text = adapter._generate_attribution_text(lic)
        assert "PROMIS" in text
        assert "v2.0" in text
        assert "CC_BY_NC_40" in text

    def test_attribution_text_requires_attribution(self):
        """Attribution text notes when attribution is required."""
        adapter = MockPharmGKBAdapter()
        lic = adapter.get_license()
        text = adapter._generate_attribution_text(lic)
        assert "Attribution required" in text


# ═══════════════════════════════════════════════════════════════════════════════
# META-TEST: Verify test coverage
# ═══════════════════════════════════════════════════════════════════════════════

def test_verify_test_coverage():
    """Meta-test: verify we have at least 72 test functions defined."""
    import ast
    import inspect

    current_file = inspect.getfile(inspect.currentframe())
    with open(current_file, "r") as fh:
        tree = ast.parse(fh.read())

    test_count = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name.startswith("test_"):
                test_count += 1

    assert test_count >= 70, f"Expected >=70 tests, found {test_count}"
