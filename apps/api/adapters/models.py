#!/usr/bin/env python3
"""
Canonical data models for Batch C adapters.

Maps raw API/scrape responses to normalized:
- Medication  (pharma products)
- Substance   (active ingredients / chemicals)
- EvidenceEntry (clinical trials / systematic reviews)
- Reference   (external identifier / citation)
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────

class ConfidenceTier(str, Enum):
    """Data-source reliability tier."""

    AUTHORITY = "A"      # Government regulator, gold-standard
    FILTERED = "B"       # Curated evidence DB
    INGESTED = "C"       # Aggregated / tertiary


class TeCode(str, Enum):
    """Therapeutic Equivalence Code (Orange Book)."""

    AA = "AA"   # conventional EQ
    AB = "AB"   # bio-equivalent
    AN = "AN"   # aerosol EQ
    AO = "AO"   # injectable EQ
    AP = "AP"   # injectable, alternatives
    AT = "AT"   # topical EQ
    BC = "BC"   # controlled release
    BD = "BD"   # documented bioinequivalence
    BN = "BN"   # not bioequivalent
    BS = "BS"   # not standard
    BX = "BX"   # insufficient data
    NA = "NA"   # not applicable
    UNKNOWN = "?"


class ProductType(str, Enum):
    """FDA product type classification."""

    SINGLE = "single"           # single ingredient
    COMBINATION = "combination"  # multiple active ingredients
    UNKNOWN = "unknown"


class EvidenceType(str, Enum):
    """Evidence classification for OT / PT reviews."""

    SYSTEMATIC_REVIEW = "systematic_review"
    RCT = "randomized_controlled_trial"
    CLINICAL_TRIAL = "clinical_trial"
    COHORT_STUDY = "cohort_study"
    CASE_CONTROL = "case_control"
    CASE_SERIES = "case_series"
    EXPERT_OPINION = "expert_opinion"
    PRACTICE_GUIDELINE = "practice_guideline"
    UNKNOWN = "unknown"


# ──────────────────────────────────────────────
# Core dataclasses
# ──────────────────────────────────────────────

@dataclass
class Provenance:
    """Lineage of a record."""

    source: str = ""
    source_url: str = ""
    retrieved_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    adapter_version: str = "1.0.0"
    confidence_tier: ConfidenceTier = ConfidenceTier.INGESTED
    raw_hash: str = ""          # sha256 hex digest of raw payload
    row_count: int = 0


@dataclass
class Medication:
    """Normalized pharmaceutical product."""

    # identifiers
    name: str = ""                      # proprietary / brand name
    generic_name: str = ""              # non-proprietary name
    active_ingredients: List[str] = field(default_factory=list)
    strength: str = ""                  # e.g. "10 mg"
    dosage_form: str = ""               # e.g. "TABLET", "INJECTION"

    # regulatory
    applicant: str = ""                 # e.g. "Teva Pharmaceuticals"
    application_number: str = ""        # e.g. "ANDA077900"
    approval_date: Optional[date] = None
    approval_status: str = ""           # e.g. "Prescription", "Over-the-counter"

    # equivalence
    te_code: TeCode = TeCode.UNKNOWN
    reference_standard: bool = False     # is this the RLD?

    # NDC / packaging
    ndc_package_codes: List[str] = field(default_factory=list)

    # provenance
    provenance: Provenance = field(default_factory=Provenance)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "generic_name": self.generic_name,
            "active_ingredients": self.active_ingredients,
            "strength": self.strength,
            "dosage_form": self.dosage_form,
            "applicant": self.applicant,
            "application_number": self.application_number,
            "approval_date": self.approval_date.isoformat() if self.approval_date else None,
            "approval_status": self.approval_status,
            "te_code": self.te_code.value,
            "reference_standard": self.reference_standard,
            "ndc_package_codes": self.ndc_package_codes,
            "provenance": {
                "source": self.provenance.source,
                "source_url": self.provenance.source_url,
                "confidence_tier": self.provenance.confidence_tier.value,
            },
        }


@dataclass
class Substance:
    """Chemical / biological substance identifier."""

    name: str = ""                       # preferred name
    synonyms: List[str] = field(default_factory=list)
    unii_code: str = ""                  # 10-char alphanumeric FDA identifier
    substance_type: str = ""             # e.g. "chemical", "biological"
    inchikey: Optional[str] = None
    cas_number: Optional[str] = None

    provenance: Provenance = field(default_factory=Provenance)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "synonyms": self.synonyms,
            "unii_code": self.unii_code,
            "substance_type": self.substance_type,
            "inchikey": self.inchikey,
            "cas_number": self.cas_number,
            "provenance": {
                "source": self.provenance.source,
                "confidence_tier": self.provenance.confidence_tier.value,
            },
        }


@dataclass
class EvidenceEntry:
    """A single evidence record (trial or review)."""

    title: str = ""
    authors: List[str] = field(default_factory=list)
    year: Optional[int] = None
    journal: str = ""
    abstract: str = ""

    # identifiers
    doi: Optional[str] = None
    pmid: Optional[int] = None
    external_id: str = ""               # DB-specific ID (PEDro, OTseeker)

    # evidence classification
    evidence_type: EvidenceType = EvidenceType.UNKNOWN
    study_design: str = ""              # e.g. "parallel_group_rct"
    sample_size: Optional[int] = None
    quality_score: Optional[float] = None   # PEDro 0-10, OTseeker 0-5, etc.

    # interventions & outcomes
    interventions: List[str] = field(default_factory=list)
    conditions: List[str] = field(default_factory=list)
    outcomes: List[str] = field(default_factory=list)

    # metadata
    language: str = "en"
    url: str = ""

    provenance: Provenance = field(default_factory=Provenance)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "authors": self.authors,
            "year": self.year,
            "journal": self.journal,
            "abstract": self.abstract,
            "doi": self.doi,
            "pmid": self.pmid,
            "external_id": self.external_id,
            "evidence_type": self.evidence_type.value,
            "study_design": self.study_design,
            "sample_size": self.sample_size,
            "quality_score": self.quality_score,
            "interventions": self.interventions,
            "conditions": self.conditions,
            "outcomes": self.outcomes,
            "language": self.language,
            "url": self.url,
            "provenance": {
                "source": self.provenance.source,
                "source_url": self.provenance.source_url,
                "confidence_tier": self.provenance.confidence_tier.value,
            },
        }


@dataclass
class Reference:
    """Minimal external identifier / citation stub."""

    code: str = ""
    name: str = ""
    code_system: str = ""               # e.g. "UNII", "NDC", "ANDA"
    url: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "code": self.code,
            "name": self.name,
            "code_system": self.code_system,
            "url": self.url,
        }
        d.update(self.extra)
        return d


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────

def compute_hash(payload: bytes) -> str:
    """Return sha256 hex digest of *payload*."""
    return hashlib.sha256(payload).hexdigest()
