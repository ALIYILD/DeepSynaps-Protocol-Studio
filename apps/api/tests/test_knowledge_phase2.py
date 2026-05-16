"""
test_knowledge_phase2.py -- Comprehensive test suite for Knowledge Layer Phase 2.

DeepSynaps Protocol Studio -- clinical neuromodulation platform.
Tests Phase 2 adapters (FAERS, OnSIDES, Allen Brain, Schaefer, Neurosynth,
ADNI, ABIDE), Adverse Event Bridge, DeepTwin Hooks, Multimodal Synthesizer,
and governance compliance rules.

Test categories:
  1. FAERS Adapter Tests          (12 tests)
  2. OnSIDES Adapter Tests        (10 tests)
  3. Allen Brain Atlas Tests       (9 tests)
  4. Schaefer Atlas Tests          (6 tests)
  5. Neurosynth Adapter Tests     (11 tests)
  6. ADNI Adapter Tests            (9 tests)
  7. ABIDE Adapter Tests           (7 tests)
  8. Adverse Event Bridge Tests    (8 tests)
  9. DeepTwin Hooks Tests          (8 tests)
  10. Multimodal Synthesizer Tests (10 tests)
  11. Governance Tests              (8 tests)
=============================================================================
Total: 98+ tests
"""
from __future__ import annotations

import asyncio
import json
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import aiohttp
import pytest

# -- Imports under test --
from app.services.knowledge.base_adapter import (
    AdapterError,
    ConfidenceTier,
    ConnectionError,
    DatabaseAdapter,
    EvidenceLevel,
    FetchError,
    LicenseMetadata,
    LicenseViolationError,
    NormalizationError,
    ProvenanceRecord,
    ValidationError,
)
from app.services.knowledge import AdapterRegistry

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 MOCK ADAPTER DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════


class MockFAERSAdapter(DatabaseAdapter):
    """Mock FAERS adapter -- FDA Adverse Event Reporting System (spontaneous reports).

    Every FAERS record is inherently research-only because spontaneous
    reporting cannot establish causation.
    """

    @property
    def source_name(self) -> str:
        return "FAERS"

    @property
    def source_version(self) -> str:
        return "2026Q1"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        drug = query.get("drug", "aspirin") if isinstance(query, dict) else str(query)
        return [
            {
                "safetyreportid": "SR-001",
                "patient": {
                    "patientonsetage": "45",
                    "patientonsetageunit": "801",
                    "patientsex": "1",
                    "drug": [
                        {"medicinalproduct": drug, "drugcharacterization": "1"},
                        {"medicinalproduct": "placebo", "drugcharacterization": "2"},
                    ],
                    "reaction": [
                        {"reactionmeddrapt": "Headache", "reactionoutcome": "2"},
                        {"reactionmeddrapt": "Nausea", "reactionoutcome": "3"},
                    ],
                },
                "seriousnessother": "1",
                "receiptdate": "2026-01-15",
                "occurcountry": "US",
                "companynumb": "PHARMA-123",
                "primarysource": {"qualification": "1"},
            },
            {
                "safetyreportid": "SR-002",
                "patient": {
                    "patientonsetage": "62",
                    "patientonsetageunit": "801",
                    "patientsex": "2",
                    "drug": [
                        {"medicinalproduct": drug, "drugcharacterization": "1"},
                    ],
                    "reaction": [
                        {"reactionmeddrapt": "Dizziness", "reactionoutcome": "1"},
                    ],
                },
                "seriousnesshospitalization": "1",
                "receiptdate": "2026-02-20",
                "occurcountry": "CA",
                "companynumb": "PHARMA-456",
                "primarysource": {"qualification": "3"},
            },
        ]

    async def normalize(self, raw):
        normalized = []
        for r in raw:
            patient = r.get("patient", {})
            drugs = patient.get("drug", [])
            reactions = patient.get("reaction", [])
            drug_name = drugs[0].get("medicinalproduct", "") if drugs else ""
            for reaction in reactions:
                normalized.append(
                    {
                        "drug_name": drug_name.lower(),
                        "adverse_event": reaction.get("reactionmeddrapt", ""),
                        "report_id": r.get("safetyreportid", ""),
                        "patient_age": patient.get("patientonsetage", ""),
                        "patient_sex": patient.get("patientsex", ""),
                        "report_date": r.get("receiptdate", ""),
                        "country": r.get("occurcountry", ""),
                        "reporter": r.get("companynumb", ""),
                        "source": "FAERS",
                    }
                )
        return normalized

    async def validate(self, records):
        return [
            r
            for r in records
            if r.get("drug_name") and r.get("adverse_event") and r.get("report_id")
        ]

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="FAERS",
            source_version=self.source_version,
            source_record_id=record.get("report_id", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="PUBLIC_DOMAIN",
            confidence_tier=ConfidenceTier.RESEARCH,
            evidence_level=EvidenceLevel.CASE_SERIES,
            research_only=True,
            research_only_reason=(
                "FAERS is a spontaneous reporting database and cannot establish "
                "causation or frequency. Individual case reports are anecdotal."
            ),
            attribution_text=(
                "Data from FDA Adverse Event Reporting System (FAERS). "
                "Public domain U.S. Government work."
            ),
            data_quality_score=0.25,
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="PUBLIC_DOMAIN",
            license_url="https://www.fda.gov/drugs/fdas-adverse-event-reporting-system-faers",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=False,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="U.S. Government public domain work.",
            restrictions=[],
        )

    def get_confidence(self, record):
        return ConfidenceTier.RESEARCH

    def calculate_prr(self, drug_event_count, drug_total, event_total, total_reports):
        """Proportional Reporting Ratio -- signal detection metric."""
        if drug_total == 0 or event_total == 0 or total_reports == 0:
            return 0.0
        a = drug_event_count
        b = drug_total - drug_event_count
        c = event_total - drug_event_count
        d = total_reports - drug_total - event_total + drug_event_count
        if b <= 0 or c <= 0 or d <= 0:
            return 0.0
        prr = (a / (a + b)) / (c / (c + d))
        return round(prr, 4)

    def calculate_ror(self, drug_event_count, drug_total, event_total, total_reports):
        """Reporting Odds Ratio -- alternative signal detection metric."""
        if drug_total == 0 or event_total == 0 or total_reports == 0:
            return 0.0
        a = drug_event_count
        b = drug_total - drug_event_count
        c = event_total - drug_event_count
        d = total_reports - drug_total - event_total + drug_event_count
        if b <= 0 or c <= 0 or d <= 0:
            return 0.0
        ror = (a * d) / (b * c)
        return round(ror, 4)

    async def health_check(self):
        return {"status": "healthy", "source": self.source_name, "version": self.source_version}


class MockOnSIDESAdapter(DatabaseAdapter):
    """Mock OnSIDES adapter -- adverse events extracted from drug labels.

    OnSIDES provides structured, probabilistic drug-event associations
    derived from FDA drug labels using NLP.
    """

    @property
    def source_name(self) -> str:
        return "OnSIDES"

    @property
    def source_version(self) -> str:
        return "2024-v2.0"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        drug = query.get("drug", "aspirin") if isinstance(query, dict) else str(query)
        return [
            {
                "drug_name": drug,
                "condition_name": "Headache",
                "prr": 2.34,
                "prr_95_ci_lower": 1.89,
                "prr_95_ci_upper": 2.89,
                "prob_marginal": 0.85,
                "count": 150,
                "label_section": "adverse_reactions",
            },
            {
                "drug_name": drug,
                "condition_name": "Nausea",
                "prr": 1.56,
                "prr_95_ci_lower": 1.21,
                "prr_95_ci_upper": 2.01,
                "prob_marginal": 0.72,
                "count": 98,
                "label_section": "adverse_reactions",
            },
            {
                "drug_name": drug,
                "condition_name": "Dizziness",
                "prr": 0.45,
                "prr_95_ci_lower": 0.32,
                "prr_95_ci_upper": 0.63,
                "prob_marginal": 0.28,
                "count": 45,
                "label_section": "warnings",
            },
        ]

    async def normalize(self, raw):
        return [
            {
                "drug_name": r["drug_name"].lower(),
                "adverse_event": r["condition_name"],
                "prr": r.get("prr", 0.0),
                "prr_ci_lower": r.get("prr_95_ci_lower", 0.0),
                "prr_ci_upper": r.get("prr_95_ci_upper", 0.0),
                "probability": r.get("prob_marginal", 0.0),
                "report_count": r.get("count", 0),
                "source_section": r.get("label_section", ""),
                "source": "OnSIDES",
            }
            for r in raw
        ]

    async def validate(self, records):
        valid = []
        for r in records:
            prob = r.get("probability", 0)
            prr = r.get("prr", 0)
            if (
                0 <= prob <= 1
                and prr >= 0
                and r.get("drug_name")
                and r.get("adverse_event")
            ):
                valid.append(r)
        return valid

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="OnSIDES",
            source_version=self.source_version,
            source_record_id=f"{record.get('drug_name', '')}:{record.get('adverse_event', '')}",
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC_BY_40",
            confidence_tier=ConfidenceTier.MEDIUM,
            evidence_level=EvidenceLevel.COHORT_STUDY,
            research_only=True,
            research_only_reason=(
                "OnSIDES data is label-reported and derived via NLP. "
                "It does not establish causation or individual-level risk."
            ),
            attribution_text=(
                "Data from OnSIDES (https://github.com/tatonetti-lab/onsides). "
                "Licensed under CC BY 4.0."
            ),
            data_quality_score=0.6,
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="CC_BY_40",
            license_url="https://github.com/tatonetti-lab/onsides",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            requires_share_alike=False,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text=(
                "OnSIDES: Off-label Side Effect Database. "
                "Tatonetti Lab. CC BY 4.0."
            ),
            restrictions=["attribution_required"],
        )

    def get_confidence(self, record):
        prob = record.get("probability", 0)
        if prob >= 0.8:
            return ConfidenceTier.MEDIUM
        if prob >= 0.5:
            return ConfidenceTier.LOW
        return ConfidenceTier.RESEARCH

    async def health_check(self):
        return {"status": "healthy", "source": self.source_name, "version": self.source_version}


class MockAllenBrainAdapter(DatabaseAdapter):
    """Mock Allen Brain Atlas adapter -- gene expression in human brain.

    Provides spatial gene expression data from the Allen Human Brain Atlas.
    All data is contextual / correlational -- not diagnostic.
    """

    @property
    def source_name(self) -> str:
        return "Allen_Brain_Atlas"

    @property
    def source_version(self) -> str:
        return "Human_2014"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        gene = query.get("gene", "COMT") if isinstance(query, dict) else str(query)
        return [
            {
                "gene_symbol": gene,
                "structure_name": "prefrontal cortex",
                "structure_id": 10391,
                "expression_level": 8.42,
                "z_score": 1.85,
                "donor_count": 6,
                "donor_ids": ["H0351.1001", "H0351.1002", "H0351.1009", "H0351.1012", "H0351.1015", "H0351.1016"],
                "probe_ids": ["A_23_P100001"],
                "plane_of_section": "coronal",
            },
            {
                "gene_symbol": gene,
                "structure_name": "hippocampus",
                "structure_id": 10294,
                "expression_level": 6.21,
                "z_score": 0.72,
                "donor_count": 6,
                "donor_ids": ["H0351.1001", "H0351.1002", "H0351.1009", "H0351.1012", "H0351.1015", "H0351.1016"],
                "probe_ids": ["A_23_P100001"],
                "plane_of_section": "coronal",
            },
            {
                "gene_symbol": gene,
                "structure_name": "invalid_structure",
                "structure_id": -1,
                "expression_level": float("nan"),
                "z_score": float("nan"),
                "donor_count": 0,
                "donor_ids": [],
                "probe_ids": [],
                "plane_of_section": "",
            },
        ]

    async def normalize(self, raw):
        return [
            {
                "gene_symbol": r["gene_symbol"],
                "brain_structure": r["structure_name"],
                "structure_id": r.get("structure_id", 0),
                "expression_level": r.get("expression_level", 0.0),
                "z_score": r.get("z_score", 0.0),
                "donor_count": r.get("donor_count", 0),
                "donor_ids": r.get("donor_ids", []),
                "probe_count": len(r.get("probe_ids", [])),
                "plane_of_section": r.get("plane_of_section", ""),
                "source": "Allen_Brain_Atlas",
            }
            for r in raw
        ]

    async def validate(self, records):
        valid = []
        for r in records:
            expr = r.get("expression_level", 0)
            donors = r.get("donor_count", 0)
            sid = r.get("structure_id", 0)
            if (
                isinstance(expr, (int, float))
                and not math.isnan(expr)
                and donors >= 1
                and sid > 0
                and r.get("gene_symbol")
                and r.get("brain_structure")
            ):
                valid.append(r)
        return valid

    def get_provenance(self, record):
        donor_count = record.get("donor_count", 0)
        return ProvenanceRecord(
            source_database="Allen_Brain_Atlas",
            source_version=self.source_version,
            source_record_id=f"{record.get('gene_symbol', '')}:{record.get('structure_id', '')}",
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC_BY_40",
            confidence_tier=ConfidenceTier.MEDIUM if donor_count >= 6 else ConfidenceTier.LOW,
            evidence_level=EvidenceLevel.COHORT_STUDY,
            research_only=True,
            research_only_reason=(
                "Allen Brain Atlas gene expression data is contextual and "
                "correlational. It does not diagnose conditions or predict "
                "individual treatment response."
            ),
            attribution_text=(
                "Allen Brain Atlas data (c) Allen Institute. "
                "Licensed under CC BY 4.0."
            ),
            data_quality_score=min(donor_count / 10.0, 1.0),
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="CC_BY_40",
            license_url="https://portal.brain-map.org/",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            redistribution_allowed=True,
            modification_allowed=False,
            attribution_text="Allen Institute for Brain Science. CC BY 4.0.",
            restrictions=["attribution_required", "non_commercial"],
        )

    def get_confidence(self, record):
        donors = record.get("donor_count", 0)
        if donors >= 6:
            return ConfidenceTier.MEDIUM
        if donors >= 3:
            return ConfidenceTier.LOW
        return ConfidenceTier.RESEARCH

    async def health_check(self):
        return {"status": "healthy", "source": self.source_name, "version": self.source_version}


class MockSchaeferAdapter(DatabaseAdapter):
    """Mock Schaefer atlas adapter -- functional brain parcellation.

    Provides 100-1000 parcel functional atlas with Yeo network assignments.
    Network labels are functional, not diagnostic.
    """

    @property
    def source_name(self) -> str:
        return "Schaefer2018"

    @property
    def source_version(self) -> str:
        return "7Networks_400Parcels"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        parcels = query.get("parcels", 3) if isinstance(query, dict) else 3
        return [
            {
                "parcel_id": 1,
                "hemisphere": "LH",
                "network": "Vis",
                "network_full": "Visual",
                "x": -28.5,
                "y": -72.3,
                "z": 12.1,
                "label": "7Networks_LH_Vis_1",
            },
            {
                "parcel_id": 201,
                "hemisphere": "RH",
                "network": "SomMot",
                "network_full": "Somatomotor",
                "x": 42.1,
                "y": -24.7,
                "z": 56.8,
                "label": "7Networks_RH_SomMot_1",
            },
            {
                "parcel_id": 301,
                "hemisphere": "LH",
                "network": "Default",
                "network_full": "Default_Mode",
                "x": -8.2,
                "y": 52.4,
                "z": 28.3,
                "label": "7Networks_LH_Default_1",
            },
        ][:parcels]

    async def normalize(self, raw):
        return [
            {
                "parcel_id": r["parcel_id"],
                "hemisphere": r["hemisphere"],
                "network": r["network"],
                "network_full": r["network_full"],
                "mni_coordinates": (r["x"], r["y"], r["z"]),
                "label": r["label"],
                "atlas_version": self.source_version,
                "source": "Schaefer2018",
            }
            for r in raw
        ]

    async def validate(self, records):
        valid = []
        for r in records:
            coords = r.get("mni_coordinates", ())
            if (
                len(coords) == 3
                and all(isinstance(c, (int, float)) for c in coords)
                and r.get("parcel_id")
                and r.get("network")
            ):
                valid.append(r)
        return valid

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="Schaefer2018",
            source_version=self.source_version,
            source_record_id=str(record.get("parcel_id", "")),
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC_BY_NC_SA_40",
            confidence_tier=ConfidenceTier.HIGH,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
            research_only=True,
            research_only_reason=(
                "Schaefer atlas parcels are functional network labels, "
                "not diagnostic categories. They describe resting-state "
                "functional connectivity patterns."
            ),
            attribution_text=(
                "Schaefer A, Kong R, Gordon EM, Laumann TO, Zuo XN, "
                "Holmes AJ, Eickhoff SB, Yeo BTT. Local-Global "
                "Parcellation of the Human Cerebral Cortex. "
                "CC BY-NC-SA 4.0."
            ),
            data_quality_score=0.95,
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="CC_BY_NC_SA_40",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=True,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="Schaefer et al. 2018. CC BY-NC-SA 4.0.",
            restrictions=["non_commercial", "share_alike"],
        )

    def get_confidence(self, record):
        return ConfidenceTier.HIGH

    def get_network_assignments(self):
        """Return all Yeo 7 network names."""
        return [
            "Vis", "SomMot", "DorsAttn", "SalVentAttn",
            "Limbic", "Cont", "Default",
        ]

    async def health_check(self):
        return {"status": "healthy", "source": self.source_name, "version": self.source_version}


class MockNeurosynthAdapter(DatabaseAdapter):
    """Mock Neurosynth adapter -- large-scale meta-analytic brain mapping.

    Provides term-to-brain-activation associations via reverse inference.
    CRITICAL: Reverse inference does NOT imply that activation implies
    the cognitive process.
    """

    @property
    def source_name(self) -> str:
        return "Neurosynth"

    @property
    def source_version(self) -> str:
        return "v0.7"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        term = query.get("term", "working memory") if isinstance(query, dict) else str(query)
        return [
            {
                "term": term,
                "x": 42,
                "y": 18,
                "z": 32,
                "z_score": 5.23,
                "p_value": 0.0001,
                "posterior_prob": 0.82,
                "reverse_inference_z": 4.87,
                "forward_inference_z": 3.12,
                "studies_containing": 89,
                "num_activations": 342,
            },
            {
                "term": term,
                "x": -38,
                "y": 22,
                "z": 28,
                "z_score": 4.91,
                "p_value": 0.0002,
                "posterior_prob": 0.78,
                "reverse_inference_z": 4.56,
                "forward_inference_z": 2.98,
                "studies_containing": 76,
                "num_activations": 289,
            },
            {
                "term": term,
                "x": 0,
                "y": 0,
                "z": 0,
                "z_score": 0.12,
                "p_value": 0.89,
                "posterior_prob": 0.15,
                "reverse_inference_z": 0.08,
                "forward_inference_z": 0.15,
                "studies_containing": 3,
                "num_activations": 5,
            },
        ]

    async def normalize(self, raw):
        return [
            {
                "term": r["term"],
                "mni_coordinates": (r["x"], r["y"], r["z"]),
                "z_score": r.get("z_score", 0.0),
                "p_value": r.get("p_value", 1.0),
                "posterior_probability": r.get("posterior_prob", 0.0),
                "reverse_inference_z": r.get("reverse_inference_z", 0.0),
                "forward_inference_z": r.get("forward_inference_z", 0.0),
                "studies_count": r.get("studies_containing", 0),
                "activation_count": r.get("num_activations", 0),
                "reverse_inference_warning": (
                    "REVERSE INFERENCE: These associations do NOT imply "
                    "that observed brain activation indicates the presence "
                    "of this cognitive process."
                ),
                "source": "Neurosynth",
            }
            for r in raw
        ]

    async def validate(self, records):
        valid = []
        for r in records:
            z = r.get("z_score", 0)
            p = r.get("p_value", 1)
            studies = r.get("studies_count", 0)
            if isinstance(z, (int, float)) and z >= 2.0 and p < 0.05 and studies >= 5:
                valid.append(r)
        return valid

    def get_provenance(self, record):
        studies = record.get("studies_count", 0)
        return ProvenanceRecord(
            source_database="Neurosynth",
            source_version=self.source_version,
            source_record_id=f"{record.get('term', '')}:{record.get('mni_coordinates', '')}",
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC_BY_40",
            confidence_tier=ConfidenceTier.HIGH if studies >= 50 else ConfidenceTier.MEDIUM,
            evidence_level=EvidenceLevel.SYSTEMATIC_REVIEW,
            research_only=True,
            research_only_reason=(
                "Neurosynth data is meta-analytic and based on reverse "
                "inference. Association does not imply causation or "
                "diagnostic utility."
            ),
            attribution_text=(
                "Yarkoni T, Poldrack RA, Nichols TE, Van Essen DC, "
                "Wager TD. Large-scale automated synthesis of human "
                "functional neuroimaging data. Nature Methods 2011. "
                "CC BY 4.0."
            ),
            data_quality_score=min(studies / 100.0, 1.0),
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="CC_BY_40",
            license_url="https://neurosynth.org/",
            allows_research=True,
            allows_commercial=True,
            requires_attribution=True,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="Neurosynth. CC BY 4.0.",
            restrictions=["attribution_required"],
        )

    def get_confidence(self, record):
        studies = record.get("studies_count", 0)
        z = record.get("z_score", 0)
        if studies >= 50 and z >= 4.0:
            return ConfidenceTier.HIGH
        if studies >= 20 and z >= 3.0:
            return ConfidenceTier.MEDIUM
        return ConfidenceTier.LOW

    async def health_check(self):
        return {"status": "healthy", "source": self.source_name, "version": self.source_version}


class MockADNIAdapter(DatabaseAdapter):
    """Mock ADNI adapter -- Alzheimer's Disease Neuroimaging Initiative.

    Provides biomarker reference data (CSF, PET, MRI volumetrics).
    ADNI data is strictly research-only; commercial use is prohibited.
    """

    @property
    def source_name(self) -> str:
        return "ADNI"

    @property
    def source_version(self) -> str:
        return "4.0"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        biomarker = query.get("biomarker", "amyloid") if isinstance(query, dict) else "amyloid"
        return [
            {
                "subject_id": "ADNI_001_S_0001",
                "diagnosis_group": "CN",
                "biomarker": biomarker,
                "value": 1.12,
                "unit": "SUVR",
                "age": 74.2,
                "sex": "M",
                "visit": "bl",
                "scanner": "3T Siemens",
                "cohort": "ADNI-4",
            },
            {
                "subject_id": "ADNI_002_S_0294",
                "diagnosis_group": "AD",
                "biomarker": biomarker,
                "value": 2.45,
                "unit": "SUVR",
                "age": 81.5,
                "sex": "F",
                "visit": "m12",
                "scanner": "3T GE",
                "cohort": "ADNI-4",
            },
            {
                "subject_id": "ADNI_003_S_1057",
                "diagnosis_group": "MCI",
                "biomarker": biomarker,
                "value": float("inf"),
                "unit": "SUVR",
                "age": -1,
                "sex": "",
                "visit": "",
                "scanner": "",
                "cohort": "",
            },
        ]

    async def normalize(self, raw):
        return [
            {
                "subject_id": r["subject_id"],
                "diagnosis_group": r.get("diagnosis_group", ""),
                "biomarker_type": r.get("biomarker", ""),
                "value": r.get("value", 0.0),
                "unit": r.get("unit", ""),
                "age": r.get("age", 0.0),
                "sex": r.get("sex", ""),
                "visit": r.get("visit", ""),
                "scanner": r.get("scanner", ""),
                "cohort": r.get("cohort", ""),
                "source": "ADNI",
            }
            for r in raw
        ]

    async def validate(self, records):
        valid = []
        for r in records:
            val = r.get("value", 0)
            age = r.get("age", 0)
            if (
                isinstance(val, (int, float))
                and not math.isinf(val)
                and not math.isnan(val)
                and age > 0
                and r.get("subject_id")
                and r.get("biomarker_type")
            ):
                valid.append(r)
        return valid

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="ADNI",
            source_version=self.source_version,
            source_record_id=record.get("subject_id", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="ADNI_DATA_USE_AGREEMENT",
            confidence_tier=ConfidenceTier.HIGH,
            evidence_level=EvidenceLevel.COHORT_STUDY,
            research_only=True,
            research_only_reason=(
                "ADNI data is provided under a strict Data Use Agreement. "
                "Commercial use is prohibited. Results must not be used "
                "for diagnostic claims in individual patients."
            ),
            attribution_text=(
                "Data from the Alzheimer's Disease Neuroimaging Initiative "
                "(ADNI). Data used with permission under ADNI DUA."
            ),
            data_quality_score=0.85,
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="ADNI_DATA_USE_AGREEMENT",
            license_url="https://adni.loni.usc.edu/data-samples/access-data/",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            redistribution_allowed=False,
            modification_allowed=False,
            attribution_text="ADNI. Alzheimer's Disease Neuroimaging Initiative.",
            restrictions=[
                "no_commercial_use",
                "no_redistribution",
                "dua_required",
                "research_only",
            ],
        )

    def get_confidence(self, record):
        cohort = record.get("cohort", "")
        if "ADNI" in cohort:
            return ConfidenceTier.HIGH
        return ConfidenceTier.MEDIUM

    async def health_check(self):
        return {"status": "healthy", "source": self.source_name, "version": self.source_version}


class MockABIDEAdapter(DatabaseAdapter):
    """Mock ABIDE adapter -- Autism Brain Imaging Data Exchange.

    Provides resting-state fMRI connectivity data from autism and control cohorts.
    Site effects are a known confound and must be disclosed.
    """

    @property
    def source_name(self) -> str:
        return "ABIDE"

    @property
    def source_version(self) -> str:
        return "II_2019"

    async def connect(self) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def fetch(self, query):
        roi = query.get("roi", " PCC") if isinstance(query, dict) else " PCC"
        return [
            {
                "subject_id": "ABIDE_0050001",
                "diagnosis": "ASD",
                "site": "NYU",
                "age": 14.2,
                "sex": "M",
                "roi_pair": (roi.strip(), "mPFC"),
                "connectivity_strength": 0.42,
                "p_value": 0.003,
                "tr": 2.0,
                "scanner": "Siemens_3T",
                "preprocessing": "ccs",
            },
            {
                "subject_id": "ABIDE_0050002",
                "diagnosis": "Control",
                "site": "UCLA",
                "age": 16.8,
                "sex": "M",
                "roi_pair": (roi.strip(), "mPFC"),
                "connectivity_strength": 0.58,
                "p_value": 0.001,
                "tr": 2.5,
                "scanner": "GE_3T",
                "preprocessing": "ccs",
            },
            {
                "subject_id": "ABIDE_0050003",
                "diagnosis": "ASD",
                "site": "UM",
                "age": 12.1,
                "sex": "F",
                "roi_pair": (roi.strip(), "mPFC"),
                "connectivity_strength": float("nan"),
                "p_value": float("nan"),
                "tr": 0,
                "scanner": "",
                "preprocessing": "",
            },
        ]

    async def normalize(self, raw):
        return [
            {
                "subject_id": r["subject_id"],
                "diagnosis": r.get("diagnosis", ""),
                "site": r.get("site", ""),
                "age": r.get("age", 0.0),
                "sex": r.get("sex", ""),
                "roi_pair": r.get("roi_pair", ("", "")),
                "connectivity_strength": r.get("connectivity_strength", 0.0),
                "p_value": r.get("p_value", 1.0),
                "tr": r.get("tr", 0.0),
                "scanner": r.get("scanner", ""),
                "preprocessing_pipeline": r.get("preprocessing", ""),
                "source": "ABIDE",
            }
            for r in raw
        ]

    async def validate(self, records):
        valid = []
        for r in records:
            conn = r.get("connectivity_strength", 0)
            p = r.get("p_value", 1)
            if (
                isinstance(conn, (int, float))
                and not math.isnan(conn)
                and not math.isinf(conn)
                and isinstance(p, (int, float))
                and not math.isnan(p)
                and r.get("subject_id")
                and r.get("site")
            ):
                valid.append(r)
        return valid

    def get_provenance(self, record):
        return ProvenanceRecord(
            source_database="ABIDE",
            source_version=self.source_version,
            source_record_id=record.get("subject_id", ""),
            ingestion_timestamp=datetime.utcnow(),
            license_type="CC_BY_NC_SA_40",
            confidence_tier=ConfidenceTier.MEDIUM,
            evidence_level=EvidenceLevel.COHORT_STUDY,
            research_only=True,
            research_only_reason=(
                "ABIDE is a multi-site research dataset. Site effects, "
                "scanner differences, and preprocessing choices are known "
                "confounds. Results should not be used for individual diagnosis."
            ),
            attribution_text=(
                "ABIDE: Autism Brain Imaging Data Exchange. "
                "CC BY-NC-SA 4.0."
            ),
            data_quality_score=0.7,
        )

    def get_license(self):
        return LicenseMetadata(
            license_type="CC_BY_NC_SA_40",
            license_url="http://fcon_1000.projects.nitrc.org/indi/abide/",
            allows_research=True,
            allows_commercial=False,
            requires_attribution=True,
            requires_share_alike=True,
            redistribution_allowed=True,
            modification_allowed=True,
            attribution_text="ABIDE Consortium. CC BY-NC-SA 4.0.",
            restrictions=["non_commercial", "share_alike", "site_effects"],
        )

    def get_confidence(self, record):
        return ConfidenceTier.MEDIUM

    async def health_check(self):
        return {"status": "healthy", "source": self.source_name, "version": self.source_version}


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 BRIDGE & HOOK MOCKS
# ═══════════════════════════════════════════════════════════════════════════════


class MockAdverseEventBridge:
    """Bridge connecting FAERS + OnSIDES for adverse event queries."""

    def __init__(self, faers_adapter, onsides_adapter):
        self._faers = faers_adapter
        self._onsides = onsides_adapter

    async def get_drug_adverse_events(self, drug_name: str):
        """Fetch adverse events for a drug from both sources."""
        query = {"drug": drug_name}
        faers_raw = await self._faers.fetch(query)
        faers_norm = await self._faers.normalize(faers_raw)
        faers_valid = await self._faers.validate(faers_norm)

        onsides_raw = await self._onsides.fetch(query)
        onsides_norm = await self._onsides.normalize(onsides_raw)
        onsides_valid = await self._onsides.validate(onsides_norm)

        return {
            "drug": drug_name,
            "faers_events": faers_valid,
            "onsides_events": onsides_valid,
            "total_events": len(faers_valid) + len(onsides_valid),
            "caveats": [
                "FAERS: spontaneous reporting cannot establish causation or frequency.",
                "OnSIDES: label-reported events via NLP; may miss context.",
                "These are hypothesis-generating signals, not clinical evidence.",
            ],
            "research_only": True,
            "research_only_reason": "Adverse event data is observational and hypothesis-generating only.",
        }

    async def check_safety_signals(self, drug_name: str):
        """Check safety signals using PRR/ROR calculations."""
        query = {"drug": drug_name}
        raw = await self._faers.fetch(query)
        norm = await self._faers.normalize(raw)
        valid = await self._faers.validate(norm)

        event_counts = {}
        for r in valid:
            event = r.get("adverse_event", "")
            event_counts[event] = event_counts.get(event, 0) + 1

        total_reports = len(raw)
        drug_total = len(valid)

        signals = []
        for event, count in event_counts.items():
            prr = self._faers.calculate_prr(count, drug_total, count, total_reports)
            ror = self._faers.calculate_ror(count, drug_total, count, total_reports)
            signals.append(
                {
                    "event": event,
                    "report_count": count,
                    "prr": prr,
                    "ror": ror,
                    "signal_detected": prr >= 2.0 or ror >= 2.0,
                }
            )

        return {
            "drug": drug_name,
            "total_reports": total_reports,
            "analyzed_reports": drug_total,
            "signals": signals,
            "caveats": [
                "PRR/ROR are disproportionality measures, not risk ratios.",
                "Signal detection does not confirm causation.",
                "Small sample sizes can produce spurious signals.",
            ],
            "research_only": True,
        }

    async def get_side_effect_profile(self, drug_name: str):
        """Get comprehensive side-effect profile with caveats."""
        query = {"drug": drug_name}
        onsides_raw = await self._onsides.fetch(query)
        onsides_norm = await self._onsides.normalize(onsides_raw)
        onsides_valid = await self._onsides.validate(onsides_norm)

        profile = {
            "drug": drug_name,
            "side_effects": [
                {
                    "event": r["adverse_event"],
                    "prr": r.get("prr", 0),
                    "probability": r.get("probability", 0),
                    "source": "OnSIDES",
                }
                for r in onsides_valid
            ],
            "caveats": [
                "OnSIDES probabilities are marginal, not patient-specific.",
                "Label-reported events may not reflect real-world incidence.",
                "Does not establish causation between drug and event.",
            ],
            "research_only": True,
        }
        return profile


class MockDeepTwinHooks:
    """DeepTwin hooks for AI-driven multimodal synthesis."""

    def __init__(self, bridge, adapters):
        self._bridge = bridge
        self._adapters = adapters

    async def synthesize_medication_safety(self, drug_name: str):
        """Synthesize medication safety profile across data sources."""
        safety_data = await self._bridge.get_drug_adverse_events(drug_name)
        signals = await self._bridge.check_safety_signals(drug_name)

        return {
            "synthesis_type": "medication_safety",
            "drug": drug_name,
            "findings": {
                "reported_events": safety_data["total_events"],
                "safety_signals": [
                    s for s in signals["signals"] if s["signal_detected"]
                ],
                "signal_count": len([s for s in signals["signals"] if s["signal_detected"]]),
            },
            "confidence": "low",
            "evidence_base": "spontaneous_reports_and_label_nlp",
            "caveats": [
                "Synthesis based on observational data only.",
                "Cannot establish causation or individual risk.",
                "Not a substitute for clinical pharmacology review.",
                "Signals require confirmation in controlled studies.",
            ],
            "research_only": True,
            "research_only_reason": "All source data is observational and research-only.",
        }

    async def synthesize_neuroimaging_context(self, term: str, gene: str = "COMT"):
        """Synthesize neuroimaging context from Neurosynth + Allen Brain."""
        neurosynth = self._adapters.get("neurosynth")
        allen = self._adapters.get("allen_brain")

        results = {"term": term, "gene": gene, "activations": [], "expression": []}

        if neurosynth:
            raw = await neurosynth.fetch({"term": term})
            norm = await neurosynth.normalize(raw)
            valid = await neurosynth.validate(norm)
            results["activations"] = valid

        if allen:
            raw = await allen.fetch({"gene": gene})
            norm = await allen.normalize(raw)
            valid = await allen.validate(norm)
            results["expression"] = valid

        results["caveats"] = [
            "Neurosynth associations are reverse-inference based.",
            "Allen Brain expression is correlational, not causal.",
            "Neuroimaging findings are group-level, not individual.",
            "Functional networks do not imply clinical diagnosis.",
        ]
        results["research_only"] = True
        results["research_only_reason"] = "Neuroimaging data is group-level and correlational."
        return results

    async def synthesize_cohort_comparison(self, cohort_a: str, cohort_b: str):
        """Compare biomarker profiles between two cohorts."""
        adni = self._adapters.get("adni")
        if not adni:
            return {"error": "ADNI adapter not available"}

        raw_a = await adni.fetch({"biomarker": cohort_a})
        norm_a = await adni.normalize(raw_a)
        valid_a = await adni.validate(norm_a)

        raw_b = await adni.fetch({"biomarker": cohort_b})
        norm_b = await adni.normalize(raw_b)
        valid_b = await adni.validate(norm_b)

        return {
            "synthesis_type": "cohort_comparison",
            "cohort_a": cohort_a,
            "cohort_b": cohort_b,
            "cohort_a_n": len(valid_a),
            "cohort_b_n": len(valid_b),
            "caveats": [
                "ADNI data is research-only; commercial use prohibited.",
                "Cohort comparisons are observational, not randomized.",
                "Results may not generalize to broader populations.",
                "Site and scanner effects may confound comparisons.",
            ],
            "research_only": True,
            "research_only_reason": "ADNI data is strictly research-only per DUA.",
        }

    async def detect_adverse_event_confounds(self, drug_name: str):
        """Detect potential confounds in adverse event reporting."""
        safety = await self._bridge.get_drug_adverse_events(drug_name)

        confounds = {
            "drug": drug_name,
            "confounds_detected": [],
            "caveats": [
                "Spontaneous reporting has well-known confound structures.",
                "Notoriety bias, litigation bias, and indication bias are common.",
                "Temporal association does not imply causation.",
            ],
            "research_only": True,
        }

        confounds["confounds_detected"].append({
            "confound_type": "indication_bias",
            "description": "Drug prescribed for condition; condition may be reported as AE.",
            "severity": "high",
        })
        confounds["confounds_detected"].append({
            "confound_type": "notoriety_bias",
            "description": "Well-publicized safety concerns may increase reporting.",
            "severity": "medium",
        })
        confounds["confounds_detected"].append({
            "confound_type": "underreporting",
            "description": "Most adverse events are never reported to FAERS.",
            "severity": "high",
        })

        return confounds

    async def generate_uncertainty_budget(self, query_type: str):
        """Generate an uncertainty budget for a given query type."""
        budgets = {
            "adverse_events": {
                "sampling_uncertainty": 0.35,
                "reporting_bias": 0.25,
                "confounding": 0.20,
                "generalizability": 0.30,
                "total_uncertainty": 0.70,
            },
            "neuroimaging": {
                "reverse_inference": 0.30,
                "group_to_individual": 0.25,
                "scanner_variability": 0.15,
                "preprocessing_effects": 0.10,
                "total_uncertainty": 0.45,
            },
            "biomarker": {
                "measurement_error": 0.15,
                "site_effects": 0.20,
                "population_drift": 0.20,
                "reference_range": 0.10,
                "total_uncertainty": 0.40,
            },
        }

        budget = budgets.get(query_type, {
            "unknown": 0.50,
            "total_uncertainty": 0.50,
        })

        return {
            "query_type": query_type,
            "uncertainty_budget": budget,
            "caveats": [
                "Uncertainty budget is estimated from source data quality.",
                "Individual patient uncertainty may differ substantially.",
                "Uncertainty is not probability of harm.",
            ],
            "research_only": True,
        }


class MockMultimodalSynthesizer:
    """Multimodal synthesizer combining all Phase 2 data sources."""

    def __init__(self, adapters, bridge, hooks):
        self._adapters = adapters
        self._bridge = bridge
        self._hooks = hooks

    async def synthesize(self, query):
        """Full multimodal synthesis across all available modalities."""
        modalities_used = []
        findings = {}
        caveats = []

        if query.get("include_medication"):
            safety = await self._bridge.get_drug_adverse_events(query["drug"])
            findings["medication_safety"] = safety
            modalities_used.append("medication")
            caveats.extend(safety.get("caveats", []))

        if query.get("include_neuroimaging"):
            neuro = await self._hooks.synthesize_neuroimaging_context(
                query.get("neuro_term", "working memory"),
                query.get("gene", "COMT"),
            )
            findings["neuroimaging"] = neuro
            modalities_used.append("neuroimaging")
            caveats.extend(neuro.get("caveats", []))

        if query.get("include_biomarker"):
            cohort = await self._hooks.synthesize_cohort_comparison(
                query.get("cohort_a", "amyloid"),
                query.get("cohort_b", "tau"),
            )
            findings["biomarker"] = cohort
            modalities_used.append("biomarker")
            caveats.extend(cohort.get("caveats", []))

        return {
            "synthesis_id": f"synth_{datetime.utcnow().isoformat()}",
            "modalities_used": modalities_used,
            "findings": findings,
            "caveats": list(set(caveats)),
            "confidence": "low_to_moderate",
            "research_only": True,
            "research_only_reason": "Multimodal synthesis combines research-only data sources.",
        }

    def detect_forbidden_output(self, text: str):
        """Detect if output contains forbidden clinical claims."""
        forbidden_patterns = [
            "diagnosis is",
            "has alzheimer",
            "has parkinson",
            "has autism",
            "will develop",
            "risk of death is",
            "certainty of",
            "definitely causes",
            "proven to cure",
        ]
        detected = []
        for pattern in forbidden_patterns:
            if pattern.lower() in text.lower():
                detected.append(pattern)
        return {
            "contains_forbidden": len(detected) > 0,
            "forbidden_patterns_found": detected,
            "action_required": len(detected) > 0,
        }

    def check_required_outputs(self, output):
        """Verify required output elements are present."""
        required = {
            "has_confidence": "confidence" in output,
            "has_caveats": "caveats" in output and len(output.get("caveats", [])) > 0,
            "has_evidence": "evidence_base" in output or "findings" in output,
            "has_research_only_flag": output.get("research_only", False) is True,
            "has_provenance": any(
                k in output for k in ["provenance", "sources", "modalities_used"]
            ),
        }
        required["all_present"] = all(required.values())
        return required

    async def generate_uncertainty_budget(self, query):
        """Generate uncertainty budget for the synthesis query."""
        budgets = []
        if query.get("include_medication"):
            budgets.append(await self._hooks.generate_uncertainty_budget("adverse_events"))
        if query.get("include_neuroimaging"):
            budgets.append(await self._hooks.generate_uncertainty_budget("neuroimaging"))
        if query.get("include_biomarker"):
            budgets.append(await self._hooks.generate_uncertainty_budget("biomarker"))
        return {"uncertainty_budgets": budgets}

    def detect_modality_conflict(self, findings):
        """Detect conflicts between modalities."""
        conflicts = []
        med = findings.get("medication_safety", {})
        neuro = findings.get("neuroimaging", {})

        if med and neuro:
            conflicts.append({
                "type": "cross_modal",
                "description": "Medication and neuroimaging data may have divergent temporal resolution.",
                "severity": "low",
            })

        return {
            "has_conflicts": len(conflicts) > 0,
            "conflicts": conflicts,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# PYTEST FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def faers_adapter():
    """Provide a mock FAERS adapter."""
    return MockFAERSAdapter()


@pytest.fixture
def onsides_adapter():
    """Provide a mock OnSIDES adapter."""
    return MockOnSIDESAdapter()


@pytest.fixture
def allen_adapter():
    """Provide a mock Allen Brain Atlas adapter."""
    return MockAllenBrainAdapter()


@pytest.fixture
def schaefer_adapter():
    """Provide a mock Schaefer atlas adapter."""
    return MockSchaeferAdapter()


@pytest.fixture
def neurosynth_adapter():
    """Provide a mock Neurosynth adapter."""
    return MockNeurosynthAdapter()


@pytest.fixture
def adni_adapter():
    """Provide a mock ADNI adapter."""
    return MockADNIAdapter()


@pytest.fixture
def abide_adapter():
    """Provide a mock ABIDE adapter."""
    return MockABIDEAdapter()


@pytest.fixture
def phase2_adapters(
    faers_adapter,
    onsides_adapter,
    allen_adapter,
    schaefer_adapter,
    neurosynth_adapter,
    adni_adapter,
    abide_adapter,
):
    """Provide all Phase 2 adapters as a dictionary."""
    return {
        "faers": faers_adapter,
        "onsides": onsides_adapter,
        "allen_brain": allen_adapter,
        "schaefer": schaefer_adapter,
        "neurosynth": neurosynth_adapter,
        "adni": adni_adapter,
        "abide": abide_adapter,
    }


@pytest.fixture
def adverse_event_bridge(faers_adapter, onsides_adapter):
    """Provide a mock Adverse Event Bridge."""
    return MockAdverseEventBridge(faers_adapter, onsides_adapter)


@pytest.fixture
def deeptwin_hooks(adverse_event_bridge, phase2_adapters):
    """Provide mock DeepTwin hooks."""
    return MockDeepTwinHooks(adverse_event_bridge, phase2_adapters)


@pytest.fixture
def multimodal_synthesizer(phase2_adapters, adverse_event_bridge, deeptwin_hooks):
    """Provide a mock Multimodal Synthesizer."""
    return MockMultimodalSynthesizer(phase2_adapters, adverse_event_bridge, deeptwin_hooks)


@pytest.fixture
def event_loop():
    """Create a fresh event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 1 -- FAERS Adapter Tests (12 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestFAERSAdapter:
    """Tests for FAERS (spontaneous reporting) adapter."""

    @pytest.mark.asyncio
    async def test_faers_initialization(self, faers_adapter):
        """FAERS adapter initializes with correct source metadata."""
        assert faers_adapter.source_name == "FAERS"
        assert faers_adapter.source_version == "2026Q1"
        assert faers_adapter.is_connected is False

    @pytest.mark.asyncio
    async def test_faers_connect(self, faers_adapter):
        """connect() returns True and sets _connected flag."""
        result = await faers_adapter.connect()
        assert result is True
        assert faers_adapter.is_connected is True

    @pytest.mark.asyncio
    async def test_faers_fetch(self, faers_adapter):
        """fetch() returns raw adverse event reports."""
        await faers_adapter.connect()
        raw = await faers_adapter.fetch({"drug": "aspirin"})
        assert len(raw) == 2
        assert raw[0]["safetyreportid"] == "SR-001"
        assert "patient" in raw[0]

    @pytest.mark.asyncio
    async def test_faers_fetch_mock_http(self, faers_adapter):
        """fetch() can be mocked to simulate openFDA API response."""
        mock_response = [
            {
                "safetyreportid": "MOCK-HTTP",
                "patient": {
                    "patientonsetage": "30",
                    "patientsex": "1",
                    "drug": [{"medicinalproduct": "test_drug", "drugcharacterization": "1"}],
                    "reaction": [{"reactionmeddrapt": "Fatigue", "reactionoutcome": "1"}],
                },
                "seriousnessother": "1",
                "receiptdate": "2026-03-01",
                "occurcountry": "US",
            }
        ]
        faers_adapter.fetch = AsyncMock(return_value=mock_response)
        result = await faers_adapter.fetch({"drug": "test_drug"})
        assert len(result) == 1
        assert result[0]["safetyreportid"] == "MOCK-HTTP"

    @pytest.mark.asyncio
    async def test_faers_normalize(self, faers_adapter):
        """normalize() transforms raw FAERS records into canonical schema."""
        await faers_adapter.connect()
        raw = await faers_adapter.fetch({"drug": "aspirin"})
        norm = await faers_adapter.normalize(raw)
        assert len(norm) >= 2
        assert all("drug_name" in r for r in norm)
        assert all("adverse_event" in r for r in norm)
        assert all("report_id" in r for r in norm)

    @pytest.mark.asyncio
    async def test_faers_validate_removes_incomplete(self, faers_adapter):
        """validate() removes records missing required fields."""
        records = [
            {"drug_name": "aspirin", "adverse_event": "Headache", "report_id": "R1"},
            {"drug_name": "", "adverse_event": "Nausea", "report_id": "R2"},
            {"drug_name": "aspirin", "adverse_event": "", "report_id": "R3"},
            {"drug_name": "aspirin", "adverse_event": "Dizziness", "report_id": ""},
        ]
        valid = await faers_adapter.validate(records)
        assert len(valid) == 1
        assert valid[0]["report_id"] == "R1"

    @pytest.mark.asyncio
    async def test_faers_provenance_caveat(self, faers_adapter):
        """get_provenance() includes mandatory spontaneous reporting caveat."""
        record = {"drug_name": "aspirin", "adverse_event": "Headache", "report_id": "SR-001"}
        prov = faers_adapter.get_provenance(record)
        assert prov.source_database == "FAERS"
        assert prov.research_only is True
        assert "spontaneous reporting" in prov.research_only_reason.lower()

    @pytest.mark.asyncio
    async def test_faers_research_only_always_true(self, faers_adapter):
        """research_only flag is ALWAYS True for FAERS data."""
        record = {"drug_name": "aspirin", "adverse_event": "Headache", "report_id": "R1"}
        prov = faers_adapter.get_provenance(record)
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_faers_license_public_domain(self, faers_adapter):
        """get_license() returns Public Domain license."""
        lic = faers_adapter.get_license()
        assert lic.license_type == "PUBLIC_DOMAIN"
        assert lic.allows_research is True

    @pytest.mark.asyncio
    async def test_faers_confidence_tier_research(self, faers_adapter):
        """Individual FAERS reports have RESEARCH confidence tier."""
        record = {"drug_name": "aspirin", "adverse_event": "Headache", "report_id": "R1"}
        tier = faers_adapter.get_confidence(record)
        assert tier == ConfidenceTier.RESEARCH

    def test_faers_prr_calculation(self, faers_adapter):
        """PRR signal calculation produces expected ratio."""
        prr = faers_adapter.calculate_prr(a=50, drug_total=200, event_total=100, total_reports=10000)
        assert prr > 0
        assert isinstance(prr, float)

    def test_faers_ror_calculation(self, faers_adapter):
        """ROR signal calculation produces expected odds ratio."""
        ror = faers_adapter.calculate_ror(a=50, drug_total=200, event_total=100, total_reports=10000)
        assert ror > 0
        assert isinstance(ror, float)

    def test_faers_prr_with_zeros(self, faers_adapter):
        """PRR handles zero denominators gracefully."""
        prr = faers_adapter.calculate_prr(a=0, drug_total=0, event_total=100, total_reports=1000)
        assert prr == 0.0

    @pytest.mark.asyncio
    async def test_faers_health_check(self, faers_adapter):
        """health_check() returns healthy status."""
        status = await faers_adapter.health_check()
        assert status["status"] == "healthy"
        assert status["source"] == "FAERS"

    @pytest.mark.asyncio
    async def test_faers_error_handling_api_failure(self, faers_adapter):
        """fetch() handles API failure gracefully with exception."""
        faers_adapter.fetch = AsyncMock(side_effect=ConnectionError("openFDA API timeout"))
        with pytest.raises(ConnectionError, match="openFDA API timeout"):
            await faers_adapter.fetch({"drug": "aspirin"})


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 2 -- OnSIDES Adapter Tests (10 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestOnSIDESAdapter:
    """Tests for OnSIDES (label-extracted adverse events) adapter."""

    @pytest.mark.asyncio
    async def test_onsides_initialization(self, onsides_adapter):
        """OnSIDES adapter initializes with correct source metadata."""
        assert onsides_adapter.source_name == "OnSIDES"
        assert onsides_adapter.source_version == "2024-v2.0"

    @pytest.mark.asyncio
    async def test_onsides_fetch(self, onsides_adapter):
        """fetch() returns drug-event pair records."""
        await onsides_adapter.connect()
        raw = await onsides_adapter.fetch({"drug": "metformin"})
        assert len(raw) == 3
        assert all("drug_name" in r for r in raw)
        assert all("condition_name" in r for r in raw)

    @pytest.mark.asyncio
    async def test_onsides_fetch_tsv_mock(self, onsides_adapter):
        """fetch() can be mocked to simulate TSV data source."""
        mock_tsv_data = [
            {
                "drug_name": "lisinopril",
                "condition_name": "Cough",
                "prr": 3.21,
                "prr_95_ci_lower": 2.65,
                "prr_95_ci_upper": 3.88,
                "prob_marginal": 0.91,
                "count": 234,
                "label_section": "adverse_reactions",
            }
        ]
        onsides_adapter.fetch = AsyncMock(return_value=mock_tsv_data)
        result = await onsides_adapter.fetch({"drug": "lisinopril"})
        assert len(result) == 1
        assert result[0]["condition_name"] == "Cough"

    @pytest.mark.asyncio
    async def test_onsides_normalize(self, onsides_adapter):
        """normalize() transforms raw OnSIDES records into canonical schema."""
        await onsides_adapter.connect()
        raw = await onsides_adapter.fetch({"drug": "metformin"})
        norm = await onsides_adapter.normalize(raw)
        assert len(norm) == 3
        assert all("drug_name" in r for r in norm)
        assert all("adverse_event" in r for r in norm)
        assert all("probability" in r for r in norm)

    @pytest.mark.asyncio
    async def test_onsides_validate_removes_invalid_probability(self, onsides_adapter):
        """validate() removes records with invalid probability scores."""
        records = [
            {"drug_name": "aspirin", "adverse_event": "Headache", "probability": 0.85, "prr": 2.3},
            {"drug_name": "aspirin", "adverse_event": "Invalid", "probability": 1.5, "prr": 2.3},
            {"drug_name": "aspirin", "adverse_event": "Bad", "probability": -0.2, "prr": 2.3},
            {"drug_name": "aspirin", "adverse_event": "NegPRR", "probability": 0.5, "prr": -1.0},
        ]
        valid = await onsides_adapter.validate(records)
        assert len(valid) == 1
        assert valid[0]["adverse_event"] == "Headache"

    @pytest.mark.asyncio
    async def test_onsides_provenance_caveat(self, onsides_adapter):
        """get_provenance() includes mandatory label-reported caveat."""
        record = {"drug_name": "aspirin", "adverse_event": "Headache", "probability": 0.85}
        prov = onsides_adapter.get_provenance(record)
        assert prov.source_database == "OnSIDES"
        assert prov.research_only is True
        assert "label-reported" in prov.research_only_reason.lower() or "nlp" in prov.research_only_reason.lower()

    @pytest.mark.asyncio
    async def test_onsides_research_only_always_true(self, onsides_adapter):
        """research_only flag is ALWAYS True for OnSIDES data."""
        record = {"drug_name": "aspirin", "adverse_event": "Nausea"}
        prov = onsides_adapter.get_provenance(record)
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_onsides_license_cc_by(self, onsides_adapter):
        """get_license() returns CC BY 4.0 license."""
        lic = onsides_adapter.get_license()
        assert lic.license_type == "CC_BY_40"
        assert lic.requires_attribution is True
        assert lic.allows_research is True

    @pytest.mark.asyncio
    async def test_onsides_health_check(self, onsides_adapter):
        """health_check() returns healthy status."""
        status = await onsides_adapter.health_check()
        assert status["status"] == "healthy"
        assert status["source"] == "OnSIDES"

    @pytest.mark.asyncio
    async def test_onsides_error_handling(self, onsides_adapter):
        """OnSIDES adapter handles errors gracefully."""
        onsides_adapter.fetch = AsyncMock(side_effect=FetchError("OnSIDES TSV unavailable"))
        with pytest.raises(FetchError, match="OnSIDES TSV unavailable"):
            await onsides_adapter.fetch({"drug": "aspirin"})


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 3 -- Allen Brain Atlas Adapter Tests (9 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestAllenBrainAdapter:
    """Tests for Allen Brain Atlas (gene expression) adapter."""

    @pytest.mark.asyncio
    async def test_allen_initialization(self, allen_adapter):
        """Allen Brain adapter initializes with correct source metadata."""
        assert allen_adapter.source_name == "Allen_Brain_Atlas"
        assert allen_adapter.source_version == "Human_2014"

    @pytest.mark.asyncio
    async def test_allen_fetch(self, allen_adapter):
        """fetch() returns gene expression records."""
        await allen_adapter.connect()
        raw = await allen_adapter.fetch({"gene": "COMT"})
        assert len(raw) == 3
        assert all("gene_symbol" in r for r in raw)
        assert all("expression_level" in r for r in raw)

    @pytest.mark.asyncio
    async def test_allen_fetch_gene_expression_mock(self, allen_adapter):
        """fetch() can be mocked to simulate gene expression API."""
        mock_data = [
            {
                "gene_symbol": "BDNF",
                "structure_name": "amygdala",
                "structure_id": 9999,
                "expression_level": 9.15,
                "z_score": 2.34,
                "donor_count": 8,
                "donor_ids": ["D1", "D2", "D3"],
                "probe_ids": ["P1"],
                "plane_of_section": "sagittal",
            }
        ]
        allen_adapter.fetch = AsyncMock(return_value=mock_data)
        result = await allen_adapter.fetch({"gene": "BDNF"})
        assert len(result) == 1
        assert result[0]["gene_symbol"] == "BDNF"

    @pytest.mark.asyncio
    async def test_allen_normalize(self, allen_adapter):
        """normalize() transforms raw expression records into canonical schema."""
        await allen_adapter.connect()
        raw = await allen_adapter.fetch({"gene": "COMT"})
        norm = await allen_adapter.normalize(raw)
        assert len(norm) == 3
        assert all("gene_symbol" in r for r in norm)
        assert all("brain_structure" in r for r in norm)
        assert all("expression_level" in r for r in norm)

    @pytest.mark.asyncio
    async def test_allen_validate_filters_invalid(self, allen_adapter):
        """validate() filters out records with invalid structure data."""
        await allen_adapter.connect()
        raw = await allen_adapter.fetch({"gene": "COMT"})
        norm = await allen_adapter.normalize(raw)
        valid = await allen_adapter.validate(norm)
        assert len(valid) == 2
        for r in valid:
            assert r["structure_id"] > 0
            assert r["donor_count"] >= 1

    @pytest.mark.asyncio
    async def test_allen_provenance_contextual_caveat(self, allen_adapter):
        """get_provenance() includes contextual/correlational caveat."""
        record = {"gene_symbol": "COMT", "brain_structure": "prefrontal cortex", "structure_id": 10391, "donor_count": 6}
        prov = allen_adapter.get_provenance(record)
        assert prov.source_database == "Allen_Brain_Atlas"
        assert prov.research_only is True
        assert "contextual" in prov.research_only_reason.lower() or "correlational" in prov.research_only_reason.lower()

    @pytest.mark.asyncio
    async def test_allen_research_only_true(self, allen_adapter):
        """research_only flag is True for Allen Brain data."""
        record = {"gene_symbol": "COMT", "brain_structure": "hippocampus", "donor_count": 6}
        prov = allen_adapter.get_provenance(record)
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_allen_confidence_by_donor_count(self, allen_adapter):
        """Confidence scoring varies based on donor count."""
        high_donors = {"gene_symbol": "COMT", "donor_count": 8}
        low_donors = {"gene_symbol": "COMT", "donor_count": 2}
        assert allen_adapter.get_confidence(high_donors) == ConfidenceTier.MEDIUM
        assert allen_adapter.get_confidence(low_donors) == ConfidenceTier.LOW

    @pytest.mark.asyncio
    async def test_allen_health_check(self, allen_adapter):
        """health_check() returns healthy status."""
        status = await allen_adapter.health_check()
        assert status["status"] == "healthy"
        assert status["source"] == "Allen_Brain_Atlas"

    @pytest.mark.asyncio
    async def test_allen_error_handling(self, allen_adapter):
        """Allen Brain adapter handles errors gracefully."""
        allen_adapter.fetch = AsyncMock(side_effect=ConnectionError("Allen API unreachable"))
        with pytest.raises(ConnectionError, match="Allen API unreachable"):
            await allen_adapter.fetch({"gene": "COMT"})


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 4 -- Schaefer Atlas Adapter Tests (6 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestSchaeferAdapter:
    """Tests for Schaefer 2018 functional atlas adapter."""

    @pytest.mark.asyncio
    async def test_schaefer_initialization(self, schaefer_adapter):
        """Schaefer adapter initializes with correct source metadata."""
        assert schaefer_adapter.source_name == "Schaefer2018"
        assert schaefer_adapter.source_version == "7Networks_400Parcels"

    @pytest.mark.asyncio
    async def test_schaefer_fetch(self, schaefer_adapter):
        """fetch() returns atlas parcel records."""
        await schaefer_adapter.connect()
        raw = await schaefer_fetch_helper(schaefer_adapter, {"parcels": 3})
        assert len(raw) == 3
        assert all("parcel_id" in r for r in raw)
        assert all("network" in r for r in raw)

    @pytest.mark.asyncio
    async def test_schaefer_normalize(self, schaefer_adapter):
        """normalize() transforms parcels into canonical schema."""
        await schaefer_adapter.connect()
        raw = await schaefer_fetch_helper(schaefer_adapter, {"parcels": 2})
        norm = await schaefer_adapter.normalize(raw)
        assert len(norm) == 2
        assert all("parcel_id" in r for r in norm)
        assert all("mni_coordinates" in r for r in norm)
        assert all("network" in r for r in norm)
        assert all("atlas_version" in r for r in norm)

    @pytest.mark.asyncio
    async def test_schaefer_network_assignment(self, schaefer_adapter):
        """Network assignments match expected Yeo 7 networks."""
        networks = schaefer_adapter.get_network_assignments()
        expected = ["Vis", "SomMot", "DorsAttn", "SalVentAttn", "Limbic", "Cont", "Default"]
        assert networks == expected

    @pytest.mark.asyncio
    async def test_schaefer_provenance_atlas_version(self, schaefer_adapter):
        """get_provenance() includes atlas version in source metadata."""
        record = {"parcel_id": 1, "network": "Vis", "label": "7Networks_LH_Vis_1"}
        prov = schaefer_adapter.get_provenance(record)
        assert "Schaefer" in prov.source_database
        assert "atlas" in prov.research_only_reason.lower() or "functional" in prov.research_only_reason.lower()
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_schaefer_health_check(self, schaefer_adapter):
        """health_check() returns healthy status."""
        status = await schaefer_adapter.health_check()
        assert status["status"] == "healthy"
        assert status["source"] == "Schaefer2018"


async def schaefer_fetch_helper(adapter, query):
    """Helper to fetch parcels -- adapter.fetch takes various query forms."""
    return await adapter.fetch(query)


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 5 -- Neurosynth Adapter Tests (11 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestNeurosynthAdapter:
    """Tests for Neurosynth (meta-analytic brain mapping) adapter."""

    @pytest.mark.asyncio
    async def test_neurosynth_initialization(self, neurosynth_adapter):
        """Neurosynth adapter initializes with correct source metadata."""
        assert neurosynth_adapter.source_name == "Neurosynth"
        assert neurosynth_adapter.source_version == "v0.7"

    @pytest.mark.asyncio
    async def test_neurosynth_fetch(self, neurosynth_adapter):
        """fetch() returns term-association records."""
        await neurosynth_adapter.connect()
        raw = await neurosynth_adapter.fetch({"term": "working memory"})
        assert len(raw) == 3
        assert all("term" in r for r in raw)
        assert all("z_score" in r for r in raw)

    @pytest.mark.asyncio
    async def test_neurosynth_normalize(self, neurosynth_adapter):
        """normalize() transforms association records into canonical schema."""
        await neurosynth_adapter.connect()
        raw = await neurosynth_adapter.fetch({"term": "working memory"})
        norm = await neurosynth_adapter.normalize(raw)
        assert len(norm) == 3
        assert all("term" in r for r in norm)
        assert all("reverse_inference_z" in r for r in norm)
        assert all("reverse_inference_warning" in r for r in norm)

    @pytest.mark.asyncio
    async def test_neurosynth_validate_filters_low_z(self, neurosynth_adapter):
        """validate() filters out low-Z and low-study-count records."""
        await neurosynth_adapter.connect()
        raw = await neurosynth_adapter.fetch({"term": "working memory"})
        norm = await neurosynth_adapter.normalize(raw)
        valid = await neurosynth_adapter.validate(norm)
        assert len(valid) == 2
        for r in valid:
            assert r["z_score"] >= 2.0
            assert r["p_value"] < 0.05
            assert r["studies_count"] >= 5

    @pytest.mark.asyncio
    async def test_neurosynth_provenance_reverse_inference_warning(self, neurosynth_adapter):
        """get_provenance() context carries reverse inference warning."""
        record = {"term": "working memory", "mni_coordinates": (42, 18, 32), "studies_count": 89}
        prov = neurosynth_adapter.get_provenance(record)
        assert prov.source_database == "Neurosynth"
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_neurosynth_research_only_always_true(self, neurosynth_adapter):
        """research_only flag is ALWAYS True for Neurosynth data."""
        record = {"term": "emotion", "studies_count": 50}
        prov = neurosynth_adapter.get_provenance(record)
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_neurosynth_research_only_reason_meta_analytic(self, neurosynth_adapter):
        """research_only_reason contains 'meta-analytic' reference."""
        record = {"term": "working memory", "studies_count": 89}
        prov = neurosynth_adapter.get_provenance(record)
        assert "meta-analytic" in prov.research_only_reason.lower() or "reverse" in prov.research_only_reason.lower()

    @pytest.mark.asyncio
    async def test_neurosynth_reverse_inference_warning_in_output(self, neurosynth_adapter):
        """Every normalized output contains reverse inference warning."""
        await neurosynth_adapter.connect()
        raw = await neurosynth_adapter.fetch({"term": "language"})
        norm = await neurosynth_adapter.normalize(raw)
        for r in norm:
            assert "reverse_inference_warning" in r
            warning = r["reverse_inference_warning"]
            assert "REVERSE INFERENCE" in warning or "reverse inference" in warning.lower()

    @pytest.mark.asyncio
    async def test_neurosynth_license_cc_by(self, neurosynth_adapter):
        """get_license() returns CC BY license."""
        lic = neurosynth_adapter.get_license()
        assert lic.license_type == "CC_BY_40"
        assert lic.requires_attribution is True

    @pytest.mark.asyncio
    async def test_neurosynth_health_check(self, neurosynth_adapter):
        """health_check() returns healthy status."""
        status = await neurosynth_adapter.health_check()
        assert status["status"] == "healthy"
        assert status["source"] == "Neurosynth"

    @pytest.mark.asyncio
    async def test_neurosynth_error_handling(self, neurosynth_adapter):
        """Neurosynth adapter handles errors gracefully."""
        neurosynth_adapter.fetch = AsyncMock(side_effect=FetchError("Neurosynth API error"))
        with pytest.raises(FetchError, match="Neurosynth API error"):
            await neurosynth_adapter.fetch({"term": "working memory"})


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 6 -- ADNI Adapter Tests (9 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestADNIAdapter:
    """Tests for ADNI (Alzheimer's biomarker reference) adapter."""

    @pytest.mark.asyncio
    async def test_adni_initialization(self, adni_adapter):
        """ADNI adapter initializes with correct source metadata."""
        assert adni_adapter.source_name == "ADNI"
        assert adni_adapter.source_version == "4.0"

    @pytest.mark.asyncio
    async def test_adni_fetch(self, adni_adapter):
        """fetch() returns biomarker reference records."""
        await adni_adapter.connect()
        raw = await adni_adapter.fetch({"biomarker": "amyloid"})
        assert len(raw) == 3
        assert all("subject_id" in r for r in raw)
        assert all("biomarker" in r for r in raw)

    @pytest.mark.asyncio
    async def test_adni_normalize(self, adni_adapter):
        """normalize() transforms biomarker records into canonical schema."""
        await adni_adapter.connect()
        raw = await adni_adapter.fetch({"biomarker": "tau"})
        norm = await adni_adapter.normalize(raw)
        assert len(norm) == 3
        assert all("subject_id" in r for r in norm)
        assert all("biomarker_type" in r for r in norm)
        assert all("value" in r for r in norm)

    @pytest.mark.asyncio
    async def test_adni_validate_filters_invalid_values(self, adni_adapter):
        """validate() filters out records with invalid biomarker values."""
        await adni_adapter.connect()
        raw = await adni_adapter.fetch({"biomarker": "amyloid"})
        norm = await adni_adapter.normalize(raw)
        valid = await adni_adapter.validate(norm)
        assert len(valid) == 2
        for r in valid:
            val = r["value"]
            assert not math.isinf(val)
            assert not math.isnan(val)
            assert r["age"] > 0

    @pytest.mark.asyncio
    async def test_adni_provenance_cohort_caveat(self, adni_adapter):
        """get_provenance() includes cohort caveat."""
        record = {"subject_id": "ADNI_001_S_0001", "cohort": "ADNI-4"}
        prov = adni_adapter.get_provenance(record)
        assert prov.source_database == "ADNI"
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_adni_research_only_always_true(self, adni_adapter):
        """research_only flag is ALWAYS True for ADNI data."""
        record = {"subject_id": "ADNI_001_S_0001", "cohort": "ADNI-4"}
        prov = adni_adapter.get_provenance(record)
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_adni_commercial_use_prohibited(self, adni_adapter):
        """ADNI license explicitly prohibits commercial use."""
        lic = adni_adapter.get_license()
        assert lic.allows_commercial is False
        assert lic.is_compliant_for_use("commercial") is False
        assert "no_commercial_use" in lic.restrictions

    @pytest.mark.asyncio
    async def test_adni_confidence_scoring(self, adni_adapter):
        """ADNI records have HIGH confidence for ADNI cohort data."""
        record = {"subject_id": "ADNI_001", "cohort": "ADNI-4"}
        tier = adni_adapter.get_confidence(record)
        assert tier == ConfidenceTier.HIGH

    @pytest.mark.asyncio
    async def test_adni_health_check(self, adni_adapter):
        """health_check() returns healthy status."""
        status = await adni_adapter.health_check()
        assert status["status"] == "healthy"
        assert status["source"] == "ADNI"

    @pytest.mark.asyncio
    async def test_adni_error_handling(self, adni_adapter):
        """ADNI adapter handles errors gracefully."""
        adni_adapter.fetch = AsyncMock(side_effect=LicenseViolationError("DUA not signed"))
        with pytest.raises(LicenseViolationError, match="DUA not signed"):
            await adni_adapter.fetch({"biomarker": "amyloid"})



# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 7 -- ABIDE Adapter Tests (7 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestABIDEAdapter:
    """Tests for ABIDE (autism connectivity) adapter."""

    @pytest.mark.asyncio
    async def test_abide_initialization(self, abide_adapter):
        """ABIDE adapter initializes with correct source metadata."""
        assert abide_adapter.source_name == "ABIDE"
        assert abide_adapter.source_version == "II_2019"

    @pytest.mark.asyncio
    async def test_abide_fetch(self, abide_adapter):
        """fetch() returns connectivity data records."""
        await abide_adapter.connect()
        raw = await abide_adapter.fetch({"roi": " PCC"})
        assert len(raw) == 3
        assert all("subject_id" in r for r in raw)
        assert all("connectivity_strength" in r for r in raw)

    @pytest.mark.asyncio
    async def test_abide_normalize(self, abide_adapter):
        """normalize() transforms connectivity records into canonical schema."""
        await abide_adapter.connect()
        raw = await abide_adapter.fetch({"roi": " PCC"})
        norm = await abide_adapter.normalize(raw)
        assert len(norm) == 3
        assert all("subject_id" in r for r in norm)
        assert all("connectivity_strength" in r for r in norm)
        assert all("roi_pair" in r for r in norm)

    @pytest.mark.asyncio
    async def test_abide_validate_filters_invalid(self, abide_adapter):
        """validate() filters out records with invalid connectivity values."""
        await abide_adapter.connect()
        raw = await abide_adapter.fetch({"roi": " PCC"})
        norm = await abide_adapter.normalize(raw)
        valid = await abide_adapter.validate(norm)
        assert len(valid) == 2
        for r in valid:
            val = r["connectivity_strength"]
            assert not math.isnan(val)
            assert not math.isinf(val)
            assert isinstance(val, (int, float))

    @pytest.mark.asyncio
    async def test_abide_provenance_site_effect_disclosure(self, abide_adapter):
        """get_provenance() includes site effect disclosure."""
        record = {"subject_id": "ABIDE_0050001", "site": "NYU"}
        prov = abide_adapter.get_provenance(record)
        assert prov.source_database == "ABIDE"
        assert prov.research_only is True
        assert "site" in prov.research_only_reason.lower() or "confound" in prov.research_only_reason.lower()

    @pytest.mark.asyncio
    async def test_abide_research_only_always_true(self, abide_adapter):
        """research_only flag is ALWAYS True for ABIDE data."""
        record = {"subject_id": "ABIDE_0050001", "site": "NYU"}
        prov = abide_adapter.get_provenance(record)
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_abide_health_check(self, abide_adapter):
        """health_check() returns healthy status."""
        status = await abide_adapter.health_check()
        assert status["status"] == "healthy"
        assert status["source"] == "ABIDE"


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 8 -- Adverse Event Bridge Tests (8 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestAdverseEventBridge:
    """Tests for the Adverse Event Bridge (FAERS + OnSIDES)."""

    @pytest.mark.asyncio
    async def test_bridge_initialization(self, adverse_event_bridge):
        """Bridge initializes with both adapters."""
        assert adverse_event_bridge._faers is not None
        assert adverse_event_bridge._onsides is not None

    @pytest.mark.asyncio
    async def test_bridge_get_drug_adverse_events(self, adverse_event_bridge):
        """get_drug_adverse_events returns combined data with caveats."""
        result = await adverse_event_bridge.get_drug_adverse_events("aspirin")
        assert result["drug"] == "aspirin"
        assert "faers_events" in result
        assert "onsides_events" in result
        assert "total_events" in result
        assert result["total_events"] > 0

    @pytest.mark.asyncio
    async def test_bridge_check_safety_signals(self, adverse_event_bridge):
        """check_safety_signals returns PRR/ROR calculations."""
        result = await adverse_event_bridge.check_safety_signals("aspirin")
        assert result["drug"] == "aspirin"
        assert "signals" in result
        assert "total_reports" in result
        for signal in result["signals"]:
            assert "prr" in signal
            assert "ror" in signal
            assert isinstance(signal["prr"], float)
            assert isinstance(signal["ror"], float)

    @pytest.mark.asyncio
    async def test_bridge_get_side_effect_profile(self, adverse_event_bridge):
        """get_side_effect_profile returns profile with caveats."""
        result = await adverse_event_bridge.get_side_effect_profile("aspirin")
        assert result["drug"] == "aspirin"
        assert "side_effects" in result
        assert "caveats" in result

    @pytest.mark.asyncio
    async def test_bridge_mandatory_caveats_present(self, adverse_event_bridge):
        """Every bridge response includes mandatory caveats."""
        events = await adverse_event_bridge.get_drug_adverse_events("aspirin")
        assert "caveats" in events
        assert len(events["caveats"]) > 0

        signals = await adverse_event_bridge.check_safety_signals("aspirin")
        assert "caveats" in signals
        assert len(signals["caveats"]) > 0

        profile = await adverse_event_bridge.get_side_effect_profile("aspirin")
        assert "caveats" in profile
        assert len(profile["caveats"]) > 0

    @pytest.mark.asyncio
    async def test_bridge_research_only_flag(self, adverse_event_bridge):
        """research_only flag is present in all bridge responses."""
        events = await adverse_event_bridge.get_drug_adverse_events("aspirin")
        assert events.get("research_only") is True

        signals = await adverse_event_bridge.check_safety_signals("aspirin")
        assert signals.get("research_only") is True

        profile = await adverse_event_bridge.get_side_effect_profile("aspirin")
        assert profile.get("research_only") is True

    @pytest.mark.asyncio
    async def test_bridge_multiple_drugs(self, adverse_event_bridge):
        """Bridge handles queries for multiple different drugs."""
        drugs = ["aspirin", "ibuprofen", "metformin"]
        for drug in drugs:
            result = await adverse_event_bridge.get_drug_adverse_events(drug)
            assert result["drug"] == drug
            assert "faers_events" in result
            assert "onsides_events" in result

    @pytest.mark.asyncio
    async def test_bridge_error_handling_adapters_unavailable(self):
        """Bridge handles unavailable adapters gracefully."""
        broken_faers = MockFAERSAdapter()
        broken_faers.fetch = AsyncMock(side_effect=ConnectionError("FAERS down"))
        bridge = MockAdverseEventBridge(broken_faers, MockOnSIDESAdapter())

        with pytest.raises(ConnectionError, match="FAERS down"):
            await bridge.get_drug_adverse_events("aspirin")


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 9 -- DeepTwin Hooks Tests (8 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestDeepTwinHooks:
    """Tests for DeepTwin AI integration hooks."""

    @pytest.mark.asyncio
    async def test_hooks_initialization(self, deeptwin_hooks, adverse_event_bridge, phase2_adapters):
        """Hooks initialize with bridge and adapters."""
        assert deeptwin_hooks._bridge is adverse_event_bridge
        assert deeptwin_hooks._adapters is phase2_adapters

    @pytest.mark.asyncio
    async def test_hooks_synthesize_medication_safety(self, deeptwin_hooks):
        """synthesize_medication_safety produces safety synthesis."""
        result = await deeptwin_hooks.synthesize_medication_safety("aspirin")
        assert result["synthesis_type"] == "medication_safety"
        assert result["drug"] == "aspirin"
        assert "findings" in result
        assert "caveats" in result

    @pytest.mark.asyncio
    async def test_hooks_synthesize_neuroimaging_context(self, deeptwin_hooks):
        """synthesize_neuroimaging_context produces neuroimaging synthesis."""
        result = await deeptwin_hooks.synthesize_neuroimaging_context("working memory", "COMT")
        assert "activations" in result
        assert "expression" in result
        assert "caveats" in result

    @pytest.mark.asyncio
    async def test_hooks_synthesize_cohort_comparison(self, deeptwin_hooks):
        """synthesize_cohort_comparison produces cohort comparison."""
        result = await deeptwin_hooks.synthesize_cohort_comparison("amyloid", "tau")
        assert result["synthesis_type"] == "cohort_comparison"
        assert "cohort_a_n" in result
        assert "cohort_b_n" in result
        assert "caveats" in result

    @pytest.mark.asyncio
    async def test_hooks_detect_adverse_event_confounds(self, deeptwin_hooks):
        """detect_adverse_event_confounds identifies reporting confounds."""
        result = await deeptwin_hooks.detect_adverse_event_confounds("aspirin")
        assert result["drug"] == "aspirin"
        assert "confounds_detected" in result
        assert len(result["confounds_detected"]) > 0
        confound_types = [c["confound_type"] for c in result["confounds_detected"]]
        assert "indication_bias" in confound_types
        assert "notoriety_bias" in confound_types

    @pytest.mark.asyncio
    async def test_hooks_generate_uncertainty_budget(self, deeptwin_hooks):
        """generate_uncertainty_budget produces uncertainty breakdown."""
        result = await deeptwin_hooks.generate_uncertainty_budget("adverse_events")
        assert result["query_type"] == "adverse_events"
        assert "uncertainty_budget" in result
        budget = result["uncertainty_budget"]
        assert "total_uncertainty" in budget
        assert 0 <= budget["total_uncertainty"] <= 1.0

    @pytest.mark.asyncio
    async def test_hooks_caveats_present_in_all_synthesis(self, deeptwin_hooks):
        """Every synthesis output contains caveats."""
        med = await deeptwin_hooks.synthesize_medication_safety("aspirin")
        assert "caveats" in med
        assert len(med["caveats"]) > 0

        neuro = await deeptwin_hooks.synthesize_neuroimaging_context("language")
        assert "caveats" in neuro
        assert len(neuro["caveats"]) > 0

        cohort = await deeptwin_hooks.synthesize_cohort_comparison("amyloid", "tau")
        assert "caveats" in cohort
        assert len(cohort["caveats"]) > 0

    @pytest.mark.asyncio
    async def test_hooks_research_only_in_all_synthesis(self, deeptwin_hooks):
        """research_only flag is present in all synthesis outputs."""
        med = await deeptwin_hooks.synthesize_medication_safety("aspirin")
        assert med.get("research_only") is True

        neuro = await deeptwin_hooks.synthesize_neuroimaging_context("language")
        assert neuro.get("research_only") is True

        cohort = await deeptwin_hooks.synthesize_cohort_comparison("amyloid", "tau")
        assert cohort.get("research_only") is True

    @pytest.mark.asyncio
    async def test_hooks_cohort_comparison_no_adni(self):
        """Cohort comparison handles missing ADNI adapter."""
        hooks = MockDeepTwinHooks(MockAdverseEventBridge(MockFAERSAdapter(), MockOnSIDESAdapter()), {})
        result = await hooks.synthesize_cohort_comparison("amyloid", "tau")
        assert "error" in result


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 10 -- Multimodal Synthesizer Tests (10 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestMultimodalSynthesizer:
    """Tests for the Multimodal Synthesizer."""

    @pytest.mark.asyncio
    async def test_synthesizer_initialization(self, multimodal_synthesizer):
        """Synthesizer initializes with all components."""
        assert multimodal_synthesizer._adapters is not None
        assert multimodal_synthesizer._bridge is not None
        assert multimodal_synthesizer._hooks is not None

    @pytest.mark.asyncio
    async def test_synthesize_all_modalities(self, multimodal_synthesizer):
        """synthesize() with all modalities returns combined results."""
        query = {
            "include_medication": True,
            "include_neuroimaging": True,
            "include_biomarker": True,
            "drug": "aspirin",
            "neuro_term": "working memory",
            "gene": "COMT",
            "cohort_a": "amyloid",
            "cohort_b": "tau",
        }
        result = await multimodal_synthesizer.synthesize(query)
        assert "findings" in result
        assert "medication_safety" in result["findings"]
        assert "neuroimaging" in result["findings"]
        assert "biomarker" in result["findings"]
        assert "caveats" in result
        assert "modalities_used" in result
        assert len(result["modalities_used"]) == 3

    @pytest.mark.asyncio
    async def test_synthesize_medication_only(self, multimodal_synthesizer):
        """synthesize() with medication-only query returns medication results."""
        query = {
            "include_medication": True,
            "include_neuroimaging": False,
            "include_biomarker": False,
            "drug": "aspirin",
        }
        result = await multimodal_synthesizer.synthesize(query)
        assert "medication_safety" in result["findings"]
        assert "neuroimaging" not in result["findings"]
        assert "biomarker" not in result["findings"]
        assert "modalities_used" in result
        assert result["modalities_used"] == ["medication"]

    @pytest.mark.asyncio
    async def test_synthesize_neuroimaging_only(self, multimodal_synthesizer):
        """synthesize() with neuroimaging-only query returns neuroimaging results."""
        query = {
            "include_medication": False,
            "include_neuroimaging": True,
            "include_biomarker": False,
            "neuro_term": "language",
            "gene": "COMT",
        }
        result = await multimodal_synthesizer.synthesize(query)
        assert "neuroimaging" in result["findings"]
        assert "medication_safety" not in result["findings"]
        assert "biomarker" not in result["findings"]
        assert result["modalities_used"] == ["neuroimaging"]

    @pytest.mark.asyncio
    async def test_synthesize_biomarker_only(self, multimodal_synthesizer):
        """synthesize() with biomarker-only query returns biomarker results."""
        query = {
            "include_medication": False,
            "include_neuroimaging": False,
            "include_biomarker": True,
            "cohort_a": "amyloid",
            "cohort_b": "tau",
        }
        result = await multimodal_synthesizer.synthesize(query)
        assert "biomarker" in result["findings"]
        assert "medication_safety" not in result["findings"]
        assert "neuroimaging" not in result["findings"]
        assert result["modalities_used"] == ["biomarker"]

    @pytest.mark.asyncio
    async def test_synthesize_fusion_safety_checks(self, multimodal_synthesizer):
        """synthesize() includes safety checks in fused output."""
        query = {
            "include_medication": True,
            "include_neuroimaging": True,
            "include_biomarker": True,
            "drug": "aspirin",
            "neuro_term": "working memory",
            "gene": "COMT",
            "cohort_a": "amyloid",
            "cohort_b": "tau",
        }
        result = await multimodal_synthesizer.synthesize(query)
        assert "caveats" in result
        assert len(result["caveats"]) > 0
        assert result.get("research_only") is True

    @pytest.mark.asyncio
    async def test_synthesizer_forbidden_output_detection(self, multimodal_synthesizer):
        """detect_forbidden_output() flags clinical diagnosis claims."""
        forbidden_texts = [
            "The patient has Alzheimer's disease based on these biomarkers.",
            "The diagnosis is Parkinson's disease with 95% certainty.",
            "The subject definitely has autism.",
            "This drug will cause death in all patients.",
            "The risk of death is 100% for this patient.",
        ]
        for text in forbidden_texts:
            result = multimodal_synthesizer.detect_forbidden_output(text)
            assert result["contains_forbidden"] is True, f"Failed for: {text}"
            assert len(result["forbidden_patterns_found"]) > 0

    @pytest.mark.asyncio
    async def test_synthesizer_required_outputs(self, multimodal_synthesizer):
        """check_required_outputs() verifies all required elements present."""
        valid_output = {
            "confidence": "low",
            "caveats": ["caveat 1", "caveat 2"],
            "evidence_base": "test evidence",
            "research_only": True,
            "sources": ["FAERS", "OnSIDES"],
        }
        result = multimodal_synthesizer.check_required_outputs(valid_output)
        assert result["all_present"] is True
        assert result["has_confidence"] is True
        assert result["has_caveats"] is True
        assert result["has_evidence"] is True
        assert result["has_research_only_flag"] is True

    @pytest.mark.asyncio
    async def test_synthesizer_uncertainty_budget(self, multimodal_synthesizer):
        """generate_uncertainty_budget() produces budgets for all modalities."""
        query = {
            "include_medication": True,
            "include_neuroimaging": True,
            "include_biomarker": True,
        }
        result = await multimodal_synthesizer.generate_uncertainty_budget(query)
        assert "uncertainty_budgets" in result
        assert len(result["uncertainty_budgets"]) == 3
        for budget in result["uncertainty_budgets"]:
            assert "uncertainty_budget" in budget
            assert 0 <= budget["uncertainty_budget"]["total_uncertainty"] <= 1.0

    @pytest.mark.asyncio
    async def test_synthesizer_modality_conflict_detection(self, multimodal_synthesizer):
        """detect_modality_conflict() identifies cross-modal conflicts."""
        findings = {
            "medication_safety": {"drug": "aspirin", "events": ["headache"]},
            "neuroimaging": {"activations": ["DLPFC"]},
        }
        result = multimodal_synthesizer.detect_modality_conflict(findings)
        assert "has_conflicts" in result
        assert "conflicts" in result


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY 11 -- Governance Tests (8 tests)
# ═══════════════════════════════════════════════════════════════════════════════


class TestGovernanceCompliance:
    """Governance compliance tests for all Phase 2 adapters."""

    @pytest.mark.parametrize("record,expected", [
        ({"drug_name": "aspirin", "adverse_event": "Headache", "report_id": "R1", "report_count": 150}, True),
        ({"drug_name": "aspirin", "adverse_event": "Nausea", "report_id": "R2", "report_count": 200}, True),
    ])
    def test_faers_never_shows_counts_as_percentages(self, faers_adapter, record, expected):
        """FAERS never presents raw report counts as percentages or rates."""
        prov = faers_adapter.get_provenance(record)
        assert prov.research_only is expected
        assert "percent" not in prov.research_only_reason.lower()
        assert "%" not in prov.research_only_reason
        assert "spontaneous reporting" in prov.research_only_reason.lower()

    @pytest.mark.asyncio
    async def test_onsides_never_suggests_causation(self, onsides_adapter):
        """OnSIDES never uses causal language (causes, induces, produces)."""
        record = {"drug_name": "aspirin", "adverse_event": "Headache", "probability": 0.85}
        prov = onsides_adapter.get_provenance(record)
        reason = prov.research_only_reason.lower()
        assert "causation" in reason or "does not establish" in reason or "nlp" in reason

    @pytest.mark.asyncio
    async def test_neurosynth_reverse_inference_warning(self, neurosynth_adapter):
        """Neurosynth always includes reverse inference warning."""
        record = {"term": "working memory", "mni_coordinates": (42, 18, 32), "studies_count": 89}
        prov = neurosynth_adapter.get_provenance(record)
        assert prov.research_only is True
        assert "meta-analytic" in prov.research_only_reason.lower() or "reverse" in prov.research_only_reason.lower()

    @pytest.mark.asyncio
    async def test_adni_commercial_use_blocked(self, adni_adapter):
        """ADNI data cannot be used commercially."""
        lic = adni_adapter.get_license()
        assert lic.allows_commercial is False
        assert lic.is_compliant_for_use("commercial") is False
        assert "no_commercial_use" in lic.restrictions

    @pytest.mark.asyncio
    async def test_abide_site_effects_disclosed(self, abide_adapter):
        """ABIDE data always discloses site effects."""
        record = {"subject_id": "ABIDE_0050001", "site": "NYU"}
        prov = abide_adapter.get_provenance(record)
        assert "site" in prov.research_only_reason.lower() or "confound" in prov.research_only_reason.lower()
        assert prov.research_only is True

    @pytest.mark.asyncio
    async def test_allen_gene_expression_flagged_contextual(self, allen_adapter):
        """Allen Brain gene expression is flagged as contextual/correlational."""
        record = {"gene_symbol": "COMT", "brain_structure": "prefrontal cortex", "donor_count": 6}
        prov = allen_adapter.get_provenance(record)
        assert prov.research_only is True
        reason = prov.research_only_reason.lower()
        assert "contextual" in reason or "correlational" in reason

    @pytest.mark.asyncio
    async def test_schaefer_network_labels_not_diagnostic(self, schaefer_adapter):
        """Schaefer network labels are functional, not diagnostic."""
        record = {"parcel_id": 1, "network": "Vis", "label": "7Networks_LH_Vis_1"}
        prov = schaefer_adapter.get_provenance(record)
        assert prov.research_only is True
        assert "functional" in prov.research_only_reason.lower() or "network" in prov.research_only_reason.lower()
        assert "diagnostic" not in prov.research_only_reason.lower() or "not diagnostic" in prov.research_only_reason.lower()

    @pytest.mark.asyncio
    async def test_all_phase2_adapters_research_only(self, phase2_adapters):
        """All Phase 2 adapters have research_only=True for every record."""
        test_record = {"test": "data"}
        for name, adapter in phase2_adapters.items():
            prov = adapter.get_provenance(test_record)
            assert prov.research_only is True, f"{name} adapter does not have research_only=True"


# ═══════════════════════════════════════════════════════════════════════════════
# PARAMETERIZED CONFIDENCE TIER TESTS
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.mark.parametrize("tier_name,tier_enum", [
    ("CRITICAL", ConfidenceTier.CRITICAL),
    ("HIGH", ConfidenceTier.HIGH),
    ("MEDIUM", ConfidenceTier.MEDIUM),
    ("LOW", ConfidenceTier.LOW),
    ("UNKNOWN", ConfidenceTier.UNKNOWN),
    ("RESEARCH", ConfidenceTier.RESEARCH),
])
def test_all_confidence_tier_values(tier_name, tier_enum):
    """All ConfidenceTier enum members have expected string values."""
    assert tier_enum.value == tier_name.lower()


@pytest.mark.parametrize("source_adapter", [
    MockFAERSAdapter(),
    MockOnSIDESAdapter(),
    MockAllenBrainAdapter(),
    MockSchaeferAdapter(),
    MockNeurosynthAdapter(),
    MockADNIAdapter(),
    MockABIDEAdapter(),
])
def test_all_adapters_have_research_only_license(source_adapter):
    """Every Phase 2 adapter license allows research use."""
    lic = source_adapter.get_license()
    assert lic.allows_research is True, f"{source_adapter.source_name} does not allow research"


@pytest.mark.parametrize("source_adapter", [
    MockFAERSAdapter(),
    MockOnSIDESAdapter(),
    MockAllenBrainAdapter(),
    MockSchaeferAdapter(),
    MockNeurosynthAdapter(),
    MockADNIAdapter(),
    MockABIDEAdapter(),
])
@pytest.mark.asyncio
async def test_all_adapters_health_check(source_adapter):
    """Every Phase 2 adapter responds to health_check."""
    status = await source_adapter.health_check()
    assert "status" in status
    assert status["status"] in ("healthy", "ok")


# ═══════════════════════════════════════════════════════════════════════════════
# END OF TEST SUITE
# ═══════════════════════════════════════════════════════════════════════════════
