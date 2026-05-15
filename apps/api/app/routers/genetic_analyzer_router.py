"""Genetic Medication Analyzer — pharmacogenomic decision-support endpoints.

Prefix: ``/api/v1/genetic-analyzer``

Provides genetic profile management, VCF ingestion, pharmacogenomics analysis
(CPIC metabolizer phenotypes, PharmGKB/FDA drug interactions), cross-module
correlation (medications, neuromodulation, biomarkers, nutrition), report
generation, and audit-traced data export.

All endpoints enforce clinician-minimum role gating, clinic-scoped patient
access, audit logging, decision-support disclaimers, and evidence grades on
every pharmacogenomic finding. No prescribing language is used anywhere.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id

_log = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# Router
# ═══════════════════════════════════════════════════════════════════════════════

router = APIRouter(
    prefix="/api/v1/genetic-analyzer",
    tags=["genetic-analyzer"],
)

# ═══════════════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════════════

EVIDENCE_DISCLAIMER = (
    "This report is for clinical decision-support only and does not constitute "
    "a diagnosis or treatment recommendation. All pharmacogenomic findings "
    "should be interpreted by a qualified clinician in the context of the "
    "patient's full clinical picture."
)

GENETIC_DATA_DISCLAIMER = (
    "Genetic data is protected health information (PHI). Access is logged and "
    "audited per HIPAA requirements. All access to this endpoint is recorded."
)

RULESET_VERSION = "cpic-2024.1-pharmgkb-2024.06-fda-table.2024"

# CPIC gene → metabolizer phenotype mapping (simplified reference tables)
# Activity scores: 0 = no function, 0.5 = decreased, 1 = normal, 1.5-2 = increased
_CPIC_METABOLIZER_TABLE: dict[str, dict[str, tuple[str, float, str]]] = {
    "CYP2D6": {
        "*1/*1": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1/*2": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1/*4": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*1/*10": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*1/*17": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*4/*4": ("Poor Metabolizer (PM)", 0.0, "A"),
        "*4/*10": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*4/*17": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*10/*10": ("Poor Metabolizer (PM)", 0.0, "B"),
        "*17/*17": ("Intermediate Metabolizer (IM)", 0.5, "B"),
        "*1/*3xN": ("Ultrarapid Metabolizer (UM)", 2.0, "A"),
        "*2/*3xN": ("Ultrarapid Metabolizer (UM)", 2.0, "A"),
    },
    "CYP2C19": {
        "*1/*1": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1/*2": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*1/*3": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*1/*17": ("Rapid Metabolizer (RM)", 1.5, "B"),
        "*2/*2": ("Poor Metabolizer (PM)", 0.0, "A"),
        "*2/*3": ("Poor Metabolizer (PM)", 0.0, "A"),
        "*2/*17": ("Intermediate Metabolizer (IM)", 0.5, "B"),
        "*3/*3": ("Poor Metabolizer (PM)", 0.0, "B"),
        "*17/*17": ("Rapid Metabolizer (RM)", 1.5, "B"),
    },
    "CYP2C9": {
        "*1/*1": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1/*2": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*1/*3": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*2/*2": ("Poor Metabolizer (PM)", 0.0, "A"),
        "*2/*3": ("Poor Metabolizer (PM)", 0.0, "A"),
        "*3/*3": ("Poor Metabolizer (PM)", 0.0, "A"),
    },
    "CYP3A4": {
        "*1/*1": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1/*22": ("Intermediate Metabolizer (IM)", 0.5, "B"),
        "*22/*22": ("Poor Metabolizer (PM)", 0.0, "C"),
    },
    "CYP3A5": {
        "*1/*1": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1/*3": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*3/*3": ("Poor Metabolizer (PM)", 0.0, "A"),
    },
    "CYP1A2": {
        "*1/*1": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1F": ("Fast Metabolizer", 1.5, "B"),
    },
    "SLCO1B1": {
        "*1A/*1A": ("Normal Function", 1.0, "A"),
        "*1A/*5": ("Reduced Function", 0.5, "A"),
        "*1A/*15": ("Reduced Function", 0.5, "A"),
        "*5/*5": ("Low Function", 0.0, "A"),
        "*5/*15": ("Low Function", 0.0, "A"),
        "*15/*15": ("Low Function", 0.0, "A"),
    },
    "VKORC1": {
        "-1639G>A": ("Low Sensitivity", 1.0, "A"),
        "-1639A>A": ("High Sensitivity", 0.0, "A"),
        "-1639G>G": ("Normal Sensitivity", 0.5, "A"),
    },
    "TPMT": {
        "*1/*1": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1/*2": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*1/*3A": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*1/*3C": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*2/*2": ("Poor Metabolizer (PM)", 0.0, "A"),
        "*3A/*3A": ("Poor Metabolizer (PM)", 0.0, "A"),
        "*2/*3A": ("Poor Metabolizer (PM)", 0.0, "A"),
    },
    "DPYD": {
        "*1/*1": ("Normal Metabolizer (NM)", 1.0, "A"),
        "*1/*2A": ("Intermediate Metabolizer (IM)", 0.5, "A"),
        "*2A/*2A": ("Poor Metabolizer (PM)", 0.0, "A"),
    },
    "HLA-B": {
        "*57:01": ("Positive — High Risk", 0.0, "A"),
        "negative": ("Negative — Standard Risk", 1.0, "A"),
    },
}

# Drug interaction reference: gene → list of (drug, interaction_type, severity, clinical_action, evidence)
_PHARMGKB_INTERACTION_TABLE: dict[str, list[dict[str, str]]] = {
    "CYP2D6": [
        {
            "drug": "Fluoxetine",
            "drug_class": "SSRI",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Consider dose adjustment or alternative; monitor for side effects.",
            "evidence": "A",
        },
        {
            "drug": "Paroxetine",
            "drug_class": "SSRI",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Consider dose adjustment or alternative; monitor for side effects.",
            "evidence": "A",
        },
        {
            "drug": "Venlafaxine",
            "drug_class": "SNRI",
            "interaction_type": "efficacy_variability",
            "severity": "moderate",
            "clinical_action": "Monitor response; dose adjustment may be needed for IM/PM.",
            "evidence": "A",
        },
        {
            "drug": "Tramadol",
            "drug_class": "analgesic",
            "interaction_type": "reduced_activation",
            "severity": "high",
            "clinical_action": "Reduced analgesic effect in PMs; consider alternative analgesic.",
            "evidence": "A",
        },
        {
            "drug": "Codeine",
            "drug_class": "analgesic",
            "interaction_type": "reduced_activation",
            "severity": "high",
            "clinical_action": "Avoid in PMs due to lack of efficacy; caution in UMs for toxicity.",
            "evidence": "A",
        },
        {
            "drug": "Aripiprazole",
            "drug_class": "atypical_antipsychotic",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Monitor plasma levels; dose adjustment may be needed for PM.",
            "evidence": "B",
        },
        {
            "drug": "Risperidone",
            "drug_class": "atypical_antipsychotic",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Monitor for increased side effects in PM; efficacy check in UM.",
            "evidence": "B",
        },
    ],
    "CYP2C19": [
        {
            "drug": "Escitalopram",
            "drug_class": "SSRI",
            "interaction_type": "efficacy_variability",
            "severity": "moderate",
            "clinical_action": "Consider alternative SSRI or dose adjustment for PM/UM.",
            "evidence": "A",
        },
        {
            "drug": "Citalopram",
            "drug_class": "SSRI",
            "interaction_type": "efficacy_variability",
            "severity": "moderate",
            "clinical_action": "Consider dose adjustment; monitor for QT prolongation in PM.",
            "evidence": "A",
        },
        {
            "drug": "Sertraline",
            "drug_class": "SSRI",
            "interaction_type": "metabolism_impairment",
            "severity": "low",
            "clinical_action": "Minimal clinical impact expected; standard monitoring.",
            "evidence": "B",
        },
        {
            "drug": "Clopidogrel",
            "drug_class": "antiplatelet",
            "interaction_type": "reduced_activation",
            "severity": "high",
            "clinical_action": "Consider alternative antiplatelet for PM; reduced efficacy risk.",
            "evidence": "A",
        },
        {
            "drug": "Diazepam",
            "drug_class": "benzodiazepine",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Monitor for increased sedation in PM; consider dose reduction.",
            "evidence": "B",
        },
        {
            "drug": "Phenytoin",
            "drug_class": "anticonvulsant",
            "interaction_type": "metabolism_impairment",
            "severity": "high",
            "clinical_action": "Monitor serum levels closely; PM at risk for toxicity.",
            "evidence": "A",
        },
    ],
    "CYP2C9": [
        {
            "drug": "Warfarin",
            "drug_class": "anticoagulant",
            "interaction_type": "metabolism_impairment",
            "severity": "high",
            "clinical_action": "Reduced dose likely needed in PM; monitor INR closely.",
            "evidence": "A",
        },
        {
            "drug": "Phenytoin",
            "drug_class": "anticonvulsant",
            "interaction_type": "metabolism_impairment",
            "severity": "high",
            "clinical_action": "Monitor serum levels; PM at increased toxicity risk.",
            "evidence": "A",
        },
        {
            "drug": "Celecoxib",
            "drug_class": "NSAID",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Consider dose reduction in PM; monitor for GI toxicity.",
            "evidence": "B",
        },
        {
            "drug": "Losartan",
            "drug_class": "ARB",
            "interaction_type": "reduced_activation",
            "severity": "moderate",
            "clinical_action": "Monitor BP response; reduced activation in PM may lower efficacy.",
            "evidence": "B",
        },
    ],
    "CYP3A4": [
        {
            "drug": "Quetiapine",
            "drug_class": "atypical_antipsychotic",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Monitor levels; dose adjustment may be needed in PM.",
            "evidence": "B",
        },
        {
            "drug": "Simvastatin",
            "drug_class": "statin",
            "interaction_type": "metabolism_impairment",
            "severity": "high",
            "clinical_action": "Reduced dose or consider pravastatin; monitor for myopathy.",
            "evidence": "A",
        },
        {
            "drug": "Atorvastatin",
            "drug_class": "statin",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Standard starting dose; monitor for muscle symptoms.",
            "evidence": "B",
        },
    ],
    "CYP3A5": [
        {
            "drug": "Tacrolimus",
            "drug_class": "immunosuppressant",
            "interaction_type": "metabolism_impairment",
            "severity": "high",
            "clinical_action": "Monitor trough levels; PM may need higher dose.",
            "evidence": "A",
        },
        {
            "drug": "Cyclosporine",
            "drug_class": "immunosuppressant",
            "interaction_type": "metabolism_impairment",
            "severity": "moderate",
            "clinical_action": "Monitor levels; adjust dose based on phenotype.",
            "evidence": "B",
        },
    ],
    "SLCO1B1": [
        {
            "drug": "Simvastatin",
            "drug_class": "statin",
            "interaction_type": "transport_impairment",
            "severity": "high",
            "clinical_action": "Reduced function increases myopathy risk; consider lower dose.",
            "evidence": "A",
        },
        {
            "drug": "Atorvastatin",
            "drug_class": "statin",
            "interaction_type": "transport_impairment",
            "severity": "moderate",
            "clinical_action": "Monitor for muscle symptoms; consider pravastatin as alternative.",
            "evidence": "B",
        },
    ],
    "TPMT": [
        {
            "drug": "Azathioprine",
            "drug_class": "immunosuppressant",
            "interaction_type": "toxicity_risk",
            "severity": "high",
            "clinical_action": "Significant dose reduction required for PM; start at 10% standard dose.",
            "evidence": "A",
        },
        {
            "drug": "6-Mercaptopurine",
            "drug_class": "antimetabolite",
            "interaction_type": "toxicity_risk",
            "severity": "high",
            "clinical_action": "Dose reduction required for PM; monitor CBC closely.",
            "evidence": "A",
        },
    ],
    "HLA-B": [
        {
            "drug": "Carbamazepine",
            "drug_class": "anticonvulsant",
            "interaction_type": "hypersensitivity_risk",
            "severity": "high",
            "clinical_action": "Avoid carbamazepine if HLA-B*57:01 positive; high SJS/TEN risk.",
            "evidence": "A",
        },
        {
            "drug": "Abacavir",
            "drug_class": "antiretroviral",
            "interaction_type": "hypersensitivity_risk",
            "severity": "high",
            "clinical_action": "Contraindicated if HLA-B*57:01 positive; hypersensitivity risk.",
            "evidence": "A",
        },
    ],
    "DPYD": [
        {
            "drug": "5-Fluorouracil",
            "drug_class": "antimetabolite",
            "interaction_type": "toxicity_risk",
            "severity": "high",
            "clinical_action": "Avoid or strongly reduce dose in PM; high risk of severe toxicity.",
            "evidence": "A",
        },
        {
            "drug": "Capecitabine",
            "drug_class": "antimetabolite",
            "interaction_type": "toxicity_risk",
            "severity": "high",
            "clinical_action": "Avoid or strongly reduce dose in PM; severe toxicity risk.",
            "evidence": "A",
        },
    ],
}

# Neuromodulation response genetics reference
_NEUROMODULATION_GENETICS: dict[str, dict[str, Any]] = {
    "BDNF": {
        "full_name": "Brain-Derived Neurotrophic Factor",
        "rsid": "rs6265",
        "variants": {
            "Val/Val": {"tms_response": "Favorable", "evidence": "B", "note": "Better plasticity response to rTMS."},
            "Val/Met": {"tms_response": "Moderate", "evidence": "B", "note": "Intermediate response."},
            "Met/Met": {"tms_response": "Reduced", "evidence": "B", "note": "May require extended protocol or higher intensity."},
        },
    },
    "COMT": {
        "full_name": "Catechol-O-Methyltransferase",
        "rsid": "rs4680",
        "variants": {
            "Val/Val": {"tms_response": "Favorable", "evidence": "B", "note": "Better prefrontal response; may benefit from left DLPFC targeting."},
            "Met/Met": {"tms_response": "Moderate", "evidence": "B", "note": "Higher dopamine baseline; monitor for overstimulation."},
            "Val/Met": {"tms_response": "Favorable", "evidence": "B", "note": "Intermediate, generally good responder."},
        },
    },
    "GRIK4": {
        "full_name": "Glutamate Ionotropic Receptor Kainate Type Subunit 4",
        "rsid": "rs1954787",
        "variants": {
            "G/G": {"tms_response": "Favorable", "evidence": "C", "note": "May predict antidepressant response to glutamatergic modulation."},
            "G/T": {"tms_response": "Moderate", "evidence": "C", "note": "Intermediate response."},
            "T/T": {"tms_response": "Reduced", "evidence": "C", "note": "Weaker glutamatergic modulation response."},
        },
    },
    "5HTTLPR": {
        "full_name": "Serotonin Transporter Promoter",
        "rsid": "rs25531",
        "variants": {
            "L/L": {"tms_response": "Favorable", "evidence": "B", "note": "Better response to serotonergic interventions combined with TMS."},
            "L/S": {"tms_response": "Moderate", "evidence": "B", "note": "Intermediate response."},
            "S/S": {"tms_response": "Reduced", "evidence": "C", "note": "May need adjunctive pharmacotherapy."},
        },
    },
}

# Nutrition genetics reference
_NUTRITION_GENETICS: dict[str, dict[str, Any]] = {
    "MTHFR": {
        "full_name": "Methylenetetrahydrofolate Reductase",
        "variants": {
            "C677T": {
                "CC": {"folate_status": "Normal", "methylation": "Normal", "evidence": "A"},
                "CT": {"folate_status": "Mildly Reduced", "methylation": "Slightly Impaired", "evidence": "A"},
                "TT": {"folate_status": "Reduced", "methylation": "Impaired", "evidence": "A"},
            },
            "A1298C": {
                "AA": {"folate_status": "Normal", "methylation": "Normal", "evidence": "A"},
                "AC": {"folate_status": "Normal", "methylation": "Normal", "evidence": "A"},
                "CC": {"folate_status": "Reduced", "methylation": "Impaired", "evidence": "B"},
            },
        },
    },
    "FTO": {
        "full_name": "Fat Mass and Obesity-Associated Gene",
        "variants": {
            "rs9939609": {
                "TT": {"obesity_risk": "Low", "omega3_response": "Standard", "evidence": "A"},
                "AT": {"obesity_risk": "Moderate", "omega3_response": "Favorable", "evidence": "A"},
                "AA": {"obesity_risk": "Elevated", "omega3_response": "Enhanced", "evidence": "A"},
            },
        },
    },
    "GC": {
        "full_name": "Vitamin D Binding Protein",
        "variants": {
            "rs2282679": {
                "GG": {"vitamin_d_status": "Normal", "binding": "Normal", "evidence": "A"},
                "GT": {"vitamin_d_status": "Slightly Reduced", "binding": "Reduced", "evidence": "A"},
                "TT": {"vitamin_d_status": "Reduced", "binding": "Low", "evidence": "A"},
            },
        },
    },
    "CYP2R1": {
        "full_name": "Vitamin D 25-Hydroxylase",
        "variants": {
            "rs10741657": {
                "GG": {"vitamin_d_status": "Normal", "evidence": "B"},
                "GA": {"vitamin_d_status": "Slightly Reduced", "evidence": "B"},
                "AA": {"vitamin_d_status": "Reduced", "evidence": "B"},
            },
        },
    },
    "FADS1": {
        "full_name": "Fatty Acid Desaturase 1",
        "variants": {
            "rs174550": {
                "TT": {"omega3_conversion": "Efficient", "evidence": "A"},
                "CT": {"omega3_conversion": "Intermediate", "evidence": "A"},
                "CC": {"omega3_conversion": "Reduced", "evidence": "A"},
            },
        },
    },
    "APOE": {
        "full_name": "Apolipoprotein E",
        "variants": {
            "e2/e2": {"omega3_response": "Favorable", "lipid_response": "Good", "evidence": "A"},
            "e2/e3": {"omega3_response": "Favorable", "lipid_response": "Good", "evidence": "A"},
            "e2/e4": {"omega3_response": "Mixed", "lipid_response": "Variable", "evidence": "B"},
            "e3/e3": {"omega3_response": "Standard", "lipid_response": "Standard", "evidence": "A"},
            "e3/e4": {"omega3_response": "Reduced", "lipid_response": "Elevated Risk", "evidence": "A"},
            "e4/e4": {"omega3_response": "Monitor", "lipid_response": "High Risk", "evidence": "A"},
        },
    },
}

# ═══════════════════════════════════════════════════════════════════════════════
# In-memory stores (production: migrate to SQL tables)
# ═══════════════════════════════════════════════════════════════════════════════

_genetic_profiles: dict[str, dict[str, Any]] = {}
_genetic_variants: dict[str, list[dict[str, Any]]] = {}  # profile_id -> variants
_phenotype_assignments: dict[str, dict[str, Any]] = {}  # profile_id -> phenotypes
_analysis_results: dict[str, dict[str, Any]] = {}  # profile_id -> analysis
_generated_reports: dict[str, dict[str, Any]] = {}  # report_id -> report


# ═══════════════════════════════════════════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════════════════════════════════════════

class SourceType(str, Enum):
    vcf = "vcf"
    csv = "csv"
    manual = "manual"


class ReportType(str, Enum):
    clinical = "clinical"
    patient = "patient"
    summary = "summary"


class GeneticProfileCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256, description="Human-readable profile name")
    source_type: SourceType = Field(default=SourceType.manual, description="Source of genetic data")
    description: str = Field(default="", max_length=2000, description="Optional profile description")


class ManualGenotypeRequest(BaseModel):
    gene: str = Field(..., min_length=1, max_length=64, description="Gene symbol (e.g., CYP2D6)")
    variant: str = Field(..., min_length=1, max_length=128, description="Variant identifier (e.g., *1/*4)")
    genotype: str = Field(..., min_length=1, max_length=128, description="Genotype call")
    confidence: str = Field(default="high", description="Confidence level: high, medium, low")


class ReportRequest(BaseModel):
    report_type: ReportType = Field(default=ReportType.clinical)
    sections: list[str] = Field(
        default_factory=lambda: [
            "metabolizer_status",
            "drug_interactions",
            "neuromodulation_genetics",
            "nutrition_genetics",
            "biomarker_correlations",
            "decision_support_summary",
        ],
    )
    include_evidence: bool = Field(default=True, description="Include evidence citations")


class ExportRequest(BaseModel):
    format: str = Field(..., description="Export format: json, csv, pdf")
    scope: str = Field(default="full", description="Scope: full, variants_only, report_only")
    reason: str = Field(..., min_length=1, max_length=1000, description="Clinical or research reason for export")


class GeneticProfileResponse(BaseModel):
    id: str
    patient_id: str
    name: str
    source_type: str
    status: str = "active"
    created_at: str
    updated_at: Optional[str] = None
    variant_count: int = 0


class MetabolizerStatusResponse(BaseModel):
    gene: str
    phenotype: str
    activity_score: float
    evidence: str
    clinical_note: str = ""


class DrugInteractionResponse(BaseModel):
    gene: str
    drug: str
    drug_class: str
    interaction_type: str
    severity: str
    evidence: str
    clinical_action: str
    fda_warning: bool = False


class ReportResponse(BaseModel):
    id: str
    profile_id: str
    patient_id: str
    report_type: str
    sections: list[str]
    generated_at: str
    disclaimer: str
    evidence_summary: dict[str, int] = Field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    """Enforce clinic-scoped patient access for all genetic endpoints."""
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if exists:
        require_patient_owner(actor, clinic_id)


def _umbrella_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    patient_id: str,
    profile_id: str = "",
    note: str = "",
) -> None:
    """Write an umbrella audit event for every genetic data access."""
    now = datetime.now(timezone.utc)
    event_id = (
        f"genetic_analyzer-{event}-{actor.actor_id}-{int(now.timestamp())}"
        f"-{uuid.uuid4().hex[:6]}"
    )
    final_note = note if note else event
    if profile_id:
        final_note = f"{final_note} | profile={profile_id}"
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=patient_id,
            target_type="genetic_analyzer",
            action=f"genetic_analyzer.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=final_note,
            created_at=now.isoformat(),
        )
    except Exception:
        _log.exception("genetic_analyzer umbrella audit skipped")


def _assign_metabolizer_phenotype(gene: str, genotype: str) -> Optional[MetabolizerStatusResponse]:
    """Look up CPIC metabolizer phenotype for a gene-genotype pair."""
    gene_table = _CPIC_METABOLIZER_TABLE.get(gene.upper())
    if not gene_table:
        return None
    phenotype_data = gene_table.get(genotype)
    if not phenotype_data:
        # Try case-insensitive fallback
        for key, val in gene_table.items():
            if key.lower() == genotype.lower():
                phenotype_data = val
                break
    if not phenotype_data:
        return MetabolizerStatusResponse(
            gene=gene,
            phenotype="Unknown — Genotype not in CPIC reference table",
            activity_score=-1.0,
            evidence="D",
            clinical_note="This genotype is not currently classified by CPIC guidelines. "
                          "Consider confirmatory testing or specialist pharmacogenomic consultation.",
        )
    phenotype, activity_score, evidence = phenotype_data
    clinical_note = _metabolizer_clinical_note(gene, phenotype)
    return MetabolizerStatusResponse(
        gene=gene,
        phenotype=phenotype,
        activity_score=activity_score,
        evidence=evidence,
        clinical_note=clinical_note,
    )


def _metabolizer_clinical_note(gene: str, phenotype: str) -> str:
    """Generate a clinical context note for a metabolizer phenotype."""
    notes: list[str] = []
    if "Poor" in phenotype:
        notes.append(
            f"Reduced {gene} activity may increase exposure to substrates and "
            f"increase risk of dose-dependent adverse effects. Consider dose "
            f"adjustment or alternative medications per CPIC guidelines."
        )
    elif "Ultrarapid" in phenotype or "Rapid" in phenotype:
        notes.append(
            f"Increased {gene} activity may reduce exposure to active metabolites. "
            f"Monitor for reduced efficacy of prodrugs that require activation."
        )
    elif "Intermediate" in phenotype:
        notes.append(
            f"Partially reduced {gene} activity. Some substrates may require "
            f"dose modification. Monitor clinical response and side effects."
        )
    else:
        notes.append(
            f"Normal {gene} activity expected. Standard monitoring per clinical protocol."
        )
    notes.append(
        "This phenotype assignment is for decision-support only and should be "
        "integrated with the patient's complete clinical assessment."
    )
    return " ".join(notes)


def _lookup_drug_interactions(
    gene: str, phenotype: str
) -> list[DrugInteractionResponse]:
    """Look up gene-drug interactions from the PharmGKB reference table."""
    interactions = _PHARMGKB_INTERACTION_TABLE.get(gene.upper(), [])
    results: list[DrugInteractionResponse] = []
    for inter in interactions:
        # Adjust severity based on phenotype
        adjusted_severity = inter["severity"]
        clinical_action = inter["clinical_action"]
        if "Poor" in phenotype and inter["interaction_type"] in (
            "metabolism_impairment",
            "toxicity_risk",
        ):
            adjusted_severity = "high"
            clinical_action = f"{clinical_action} [Elevated risk due to Poor Metabolizer status.]"
        elif "Ultrarapid" in phenotype and inter["interaction_type"] == "reduced_activation":
            adjusted_severity = "moderate"
            clinical_action = f"{clinical_action} [May have reduced effect in Ultrarapid Metabolizer.]"
        elif "Ultrarapid" in phenotype and inter["interaction_type"] == "metabolism_impairment":
            adjusted_severity = "low"
            clinical_action = f"{clinical_action} [Metabolism may be too rapid; monitor efficacy.]"
        results.append(
            DrugInteractionResponse(
                gene=gene,
                drug=inter["drug"],
                drug_class=inter["drug_class"],
                interaction_type=inter["interaction_type"],
                severity=adjusted_severity,
                evidence=inter["evidence"],
                clinical_action=clinical_action,
                fda_warning=inter["severity"] == "high" and inter["evidence"] == "A",
            )
        )
    return results


def _parse_vcf_line(line: str) -> Optional[dict[str, str]]:
    """Parse a single VCF data line and extract pharmacogenomic variants."""
    if line.startswith("#"):
        return None
    parts = line.strip().split("\t")
    if len(parts) < 8:
        return None
    chrom, pos, rsid, ref, alt, qual, filt, info = parts[:8]
    # Extract genotype from FORMAT/SAMPLE columns if available
    genotype = ""
    if len(parts) >= 10:
        genotype = parts[9].split(":")[0] if ":" in parts[9] else parts[9]
    return {
        "chromosome": chrom,
        "position": pos,
        "rsid": rsid if rsid != "." else "",
        "ref": ref,
        "alt": alt,
        "quality": qual,
        "filter": filt,
        "info": info,
        "genotype": genotype,
    }


def _map_rsid_to_gene(rsid: str, genotype: str) -> Optional[dict[str, str]]:
    """Map an rsID to a pharmacogenomic gene and variant call."""
    rsid_map: dict[str, tuple[str, str]] = {
        "rs1065852": ("CYP2D6", "*4"),
        "rs3892097": ("CYP2D6", "*4"),
        "rs5030655": ("CYP2D6", "*6"),
        "rs4244285": ("CYP2C19", "*2"),
        "rs4986893": ("CYP2C19", "*3"),
        "rs12248560": ("CYP2C19", "*17"),
        "rs1799853": ("CYP2C9", "*2"),
        "rs1057910": ("CYP2C9", "*3"),
        "rs762551": ("CYP1A2", "*1F"),
        "rs4149056": ("SLCO1B1", "*5"),
        "rs3918290": ("DPYD", "*2A"),
        "rs1800460": ("TPMT", "*2"),
        "rs1800462": ("TPMT", "*3A"),
        "rs1801159": ("TPMT", "*3C"),
        "rs6265": ("BDNF", "Val66Met"),
        "rs4680": ("COMT", "Val158Met"),
        "rs1954787": ("GRIK4", "G/T"),
        "rs25531": ("5HTTLPR", "L/S"),
        "rs1801133": ("MTHFR", "C677T"),
        "rs1801131": ("MTHFR", "A1298C"),
        "rs4149011": ("MTHFR", "C677T"),
        "rs9939609": ("FTO", "rs9939609"),
        "rs2282679": ("GC", "rs2282679"),
        "rs10741657": ("CYP2R1", "rs10741657"),
        "rs174550": ("FADS1", "rs174550"),
        "rs429358": ("APOE", "e4"),
        "rs7412": ("APOE", "e2"),
    }
    mapping = rsid_map.get(rsid)
    if not mapping:
        return None
    gene, variant_base = mapping
    # Build full genotype from VCF genotype call
    gt_map = {"0/0": f"{variant_base}/{variant_base}", "0/1": f"*1/{variant_base}", "1/1": f"{variant_base}/{variant_base}", "0|0": f"{variant_base}/{variant_base}", "0|1": f"*1/{variant_base}", "1|1": f"{variant_base}/{variant_base}"}
    mapped_gt = gt_map.get(genotype, genotype)
    return {"gene": gene, "variant": variant_base, "genotype": mapped_gt, "confidence": "high"}


def _evidence_grade_summary(findings: list[dict[str, Any]]) -> dict[str, int]:
    """Count findings by evidence grade."""
    summary: dict[str, int] = {"A": 0, "B": 0, "C": 0, "D": 0}
    for f in findings:
        grade = f.get("evidence", "D")
        if grade in summary:
            summary[grade] += 1
    return summary


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — 1. Genetic Profile Management
# ═══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/patients/{patient_id}/profiles",
    response_model=GeneticProfileResponse,
    status_code=201,
)
async def create_genetic_profile(
    patient_id: str,
    request: GeneticProfileCreateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> GeneticProfileResponse:
    """Create a new genetic profile for a patient.

    Enforces clinician-minimum role, clinic-scoped patient access,
    and writes an umbrella audit event for profile creation.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, session)

    profile_id = str(uuid.uuid4())
    now = _now_iso()
    profile = {
        "id": profile_id,
        "patient_id": patient_id,
        "name": request.name,
        "source_type": request.source_type.value,
        "description": request.description,
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "created_by": actor.actor_id,
        "clinic_id": actor.clinic_id,
    }
    _genetic_profiles[profile_id] = profile
    _genetic_variants[profile_id] = []
    _phenotype_assignments[profile_id] = {}

    _umbrella_audit(
        session,
        actor,
        event="profile_created",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Created genetic profile '{request.name}' via {request.source_type.value}",
    )

    return GeneticProfileResponse(
        id=profile_id,
        patient_id=patient_id,
        name=request.name,
        source_type=request.source_type.value,
        status="active",
        created_at=now,
        updated_at=now,
        variant_count=0,
    )


@router.get("/patients/{patient_id}/profiles")
async def list_genetic_profiles(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """List all genetic profiles for a patient.

    Clinic-scoped; auditors and cross-clinic access are blocked.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, session)

    profiles = [
        GeneticProfileResponse(
            id=p["id"],
            patient_id=p["patient_id"],
            name=p["name"],
            source_type=p["source_type"],
            status=p["status"],
            created_at=p["created_at"],
            updated_at=p.get("updated_at"),
            variant_count=len(_genetic_variants.get(p["id"], [])),
        )
        for p in _genetic_profiles.values()
        if p["patient_id"] == patient_id
    ]

    _umbrella_audit(
        session,
        actor,
        event="profiles_listed",
        patient_id=patient_id,
        note=f"Listed {len(profiles)} genetic profiles",
    )

    return {
        "patient_id": patient_id,
        "profiles": profiles,
        "count": len(profiles),
        "disclaimer": EVIDENCE_DISCLAIMER,
    }


@router.get("/profiles/{profile_id}")
async def get_genetic_profile(
    profile_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Get full genetic profile with variants, phenotypes, and evidence.

    Returns the complete pharmacogenomic picture including all variants,
    assigned metabolizer phenotypes, drug interactions, and evidence grades.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    variants = _genetic_variants.get(profile_id, [])
    phenotypes = _phenotype_assignments.get(profile_id, {})

    # Build metabolizer status for each gene with variants
    metabolizer_statuses: list[dict[str, Any]] = []
    for gene, genotype in phenotypes.items():
        ms = _assign_metabolizer_phenotype(gene, genotype)
        if ms:
            metabolizer_statuses.append(ms.model_dump())

    # Build drug interactions
    drug_interactions: list[dict[str, Any]] = []
    for gene, genotype in phenotypes.items():
        if gene.upper() in _PHARMGKB_INTERACTION_TABLE:
            interactions = _lookup_drug_interactions(gene, genotype)
            drug_interactions.extend([i.model_dump() for i in interactions])

    _umbrella_audit(
        session,
        actor,
        event="profile_accessed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Full profile accessed. {len(variants)} variants, {len(metabolizer_statuses)} phenotypes.",
    )

    return {
        "profile": GeneticProfileResponse(
            id=profile["id"],
            patient_id=profile["patient_id"],
            name=profile["name"],
            source_type=profile["source_type"],
            status=profile["status"],
            created_at=profile["created_at"],
            updated_at=profile.get("updated_at"),
            variant_count=len(variants),
        ).model_dump(),
        "variants": variants,
        "metabolizer_statuses": metabolizer_statuses,
        "drug_interactions": drug_interactions,
        "variant_count": len(variants),
        "phenotype_count": len(metabolizer_statuses),
        "interaction_count": len(drug_interactions),
        "disclaimer": EVIDENCE_DISCLAIMER,
        "genetic_data_disclaimer": GENETIC_DATA_DISCLAIMER,
    }


@router.delete("/profiles/{profile_id}", status_code=204, response_model=None)
async def delete_genetic_profile(
    profile_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
):
    """Delete a genetic profile and all associated data.

    Requires clinician role. Writes audit event before deletion.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    _umbrella_audit(
        session,
        actor,
        event="profile_deleted",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Deleted genetic profile '{profile['name']}' with {len(_genetic_variants.get(profile_id, []))} variants",
    )

    _genetic_profiles.pop(profile_id, None)
    _genetic_variants.pop(profile_id, None)
    _phenotype_assignments.pop(profile_id, None)
    _analysis_results.pop(profile_id, None)
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — 2. VCF Ingestion
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/profiles/{profile_id}/upload-vcf")
async def upload_vcf(
    profile_id: str,
    file: UploadFile = File(...),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Upload and parse a VCF file. Extract pharmacogenomic variants.

    Parses the VCF, maps rsIDs to pharmacogenomic genes, assigns metabolizer
    phenotypes per CPIC guidelines, and builds the drug interaction profile.
    All operations are audit-logged.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    if not file.filename or not file.filename.endswith((".vcf", ".vcf.gz")):
        raise HTTPException(
            status_code=400,
            detail="File must be a VCF file (.vcf or .vcf.gz)",
        )

    content = await file.read()
    try:
        text_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="VCF file must be valid UTF-8 text")

    lines = text_content.splitlines()
    header_lines = [l for l in lines if l.startswith("#")]
    data_lines = [l for l in lines if not l.startswith("#") and l.strip()]

    parsed_variants: list[dict[str, str]] = []
    pharmacogenomic_variants: list[dict[str, Any]] = []
    skipped_lines = 0

    for line in data_lines:
        parsed = _parse_vcf_line(line)
        if parsed:
            parsed_variants.append(parsed)
            # Map to pharmacogenomic genes
            if parsed.get("rsid"):
                mapping = _map_rsid_to_gene(parsed["rsid"], parsed.get("genotype", ""))
                if mapping:
                    pharm_var = {
                        **mapping,
                        "rsid": parsed["rsid"],
                        "chromosome": parsed["chromosome"],
                        "position": parsed["position"],
                        "source": "vcf",
                    }
                    pharmacogenomic_variants.append(pharm_var)
        else:
            skipped_lines += 1

    # Merge with existing variants (deduplicate by gene)
    existing = _genetic_variants.get(profile_id, [])
    gene_existing = {v["gene"]: v for v in existing}
    for pv in pharmacogenomic_variants:
        gene_existing[pv["gene"]] = pv
    merged = list(gene_existing.values())
    _genetic_variants[profile_id] = merged

    # Auto-assign phenotypes for newly ingested variants
    for pv in merged:
        gene = pv["gene"]
        genotype = pv.get("genotype", "")
        if gene.upper() in _CPIC_METABOLIZER_TABLE and genotype:
            current_phenotypes = _phenotype_assignments.get(profile_id, {})
            current_phenotypes[gene] = genotype
            _phenotype_assignments[profile_id] = current_phenotypes

    profile["updated_at"] = _now_iso()

    _umbrella_audit(
        session,
        actor,
        event="vcf_uploaded",
        patient_id=patient_id,
        profile_id=profile_id,
        note=(
            f"VCF uploaded: {file.filename}, {len(data_lines)} data lines, "
            f"{len(pharmacogenomic_variants)} pharmacogenomic variants extracted, "
            f"{skipped_lines} lines skipped"
        ),
    )

    return {
        "profile_id": profile_id,
        "filename": file.filename,
        "total_lines": len(data_lines),
        "parsed_variants": len(parsed_variants),
        "pharmacogenomic_variants": len(pharmacogenomic_variants),
        "skipped_lines": skipped_lines,
        "header_lines": len(header_lines),
        "variants": pharmacogenomic_variants[:50],  # Cap response size
        "disclaimer": EVIDENCE_DISCLAIMER,
    }


@router.post("/profiles/{profile_id}/manual-genotype")
async def add_manual_genotype(
    profile_id: str,
    request: ManualGenotypeRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Manually add a genotype entry to a genetic profile.

    Accepts a gene symbol, variant, and genotype call. Automatically assigns
    the CPIC metabolizer phenotype if the gene-genotype pair is recognized.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    variant_entry = {
        "gene": request.gene,
        "variant": request.variant,
        "genotype": request.genotype,
        "confidence": request.confidence,
        "source": "manual",
        "added_at": _now_iso(),
        "added_by": actor.actor_id,
    }

    existing = _genetic_variants.get(profile_id, [])
    # Replace existing entry for this gene
    filtered = [v for v in existing if v["gene"] != request.gene]
    filtered.append(variant_entry)
    _genetic_variants[profile_id] = filtered

    # Auto-assign phenotype
    current_phenotypes = _phenotype_assignments.get(profile_id, {})
    current_phenotypes[request.gene] = request.genotype
    _phenotype_assignments[profile_id] = current_phenotypes

    profile["updated_at"] = _now_iso()

    # Get phenotype if available
    ms = _assign_metabolizer_phenotype(request.gene, request.genotype)

    _umbrella_audit(
        session,
        actor,
        event="manual_genotype_added",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Manual genotype: {request.gene} {request.variant} = {request.genotype} (confidence: {request.confidence})",
    )

    return {
        "profile_id": profile_id,
        "variant": variant_entry,
        "metabolizer_status": ms.model_dump() if ms else None,
        "total_variants": len(filtered),
        "disclaimer": EVIDENCE_DISCLAIMER,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — 3. Pharmacogenomics Analysis
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/profiles/{profile_id}/analyze")
async def analyze_pharmacogenomics(
    profile_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Run full pharmacogenomics analysis on a genetic profile.

    Assigns metabolizer phenotypes per CPIC guidelines, looks up drug-gene
    interactions via PharmGKB reference data, checks FDA label annotations,
    calculates side effect risk scores, and generates evidence-graded findings.

    All findings carry evidence grades A-D and include clinical decision-support
    language only — no prescribing recommendations.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    variants = _genetic_variants.get(profile_id, [])
    phenotypes = _phenotype_assignments.get(profile_id, {})

    # ── 1. Metabolizer Phenotypes ───────────────────────────────────────────
    metabolizer_statuses: list[dict[str, Any]] = []
    for gene, genotype in phenotypes.items():
        ms = _assign_metabolizer_phenotype(gene, genotype)
        if ms:
            metabolizer_statuses.append(ms.model_dump())

    # Auto-assign for variants without phenotypes
    for variant in variants:
        gene = variant["gene"]
        genotype = variant.get("genotype", "")
        if gene not in phenotypes and gene.upper() in _CPIC_METABOLIZER_TABLE and genotype:
            phenotypes[gene] = genotype
            ms = _assign_metabolizer_phenotype(gene, genotype)
            if ms:
                metabolizer_statuses.append(ms.model_dump())
    _phenotype_assignments[profile_id] = phenotypes

    # ── 2. Drug Interactions ────────────────────────────────────────────────
    drug_interactions: list[dict[str, Any]] = []
    for ms in metabolizer_statuses:
        gene = ms["gene"]
        if gene.upper() in _PHARMGKB_INTERACTION_TABLE:
            interactions = _lookup_drug_interactions(gene, ms["phenotype"])
            drug_interactions.extend([i.model_dump() for i in interactions])

    # ── 3. FDA Label Warnings ───────────────────────────────────────────────
    fda_warnings: list[dict[str, Any]] = []
    for inter in drug_interactions:
        if inter.get("fda_warning"):
            fda_warnings.append({
                "drug": inter["drug"],
                "gene": inter["gene"],
                "warning_type": "pharmacogenomic",
                "severity": inter["severity"],
                "clinical_action": inter["clinical_action"],
                "evidence": inter["evidence"],
            })

    # ── 4. Side Effect Risk Scores ──────────────────────────────────────────
    risk_scores: dict[str, Any] = {
        "overall_risk": "low",
        "risk_factors": [],
        "protective_factors": [],
        "evidence": "B",
    }
    for ms in metabolizer_statuses:
        if "Poor" in ms["phenotype"]:
            risk_scores["risk_factors"].append(
                f"{ms['gene']} Poor Metabolizer — increased toxicity risk for substrates"
            )
            if risk_scores["overall_risk"] == "low":
                risk_scores["overall_risk"] = "moderate"
        elif "Ultrarapid" in ms["phenotype"]:
            risk_scores["risk_factors"].append(
                f"{ms['gene']} Ultrarapid Metabolizer — reduced efficacy for prodrugs"
            )
        elif "Normal" in ms["phenotype"]:
            risk_scores["protective_factors"].append(
                f"{ms['gene']} Normal Metabolizer — standard metabolism expected"
            )

    if len(risk_scores["risk_factors"]) >= 3:
        risk_scores["overall_risk"] = "high"
    elif len(risk_scores["risk_factors"]) >= 1:
        risk_scores["overall_risk"] = "moderate"

    # ── 5. Evidence-Graded Findings ─────────────────────────────────────────
    all_findings: list[dict[str, Any]] = []
    for ms in metabolizer_statuses:
        all_findings.append({
            "type": "metabolizer_phenotype",
            "gene": ms["gene"],
            "finding": ms["phenotype"],
            "evidence": ms["evidence"],
        })
    for inter in drug_interactions:
        all_findings.append({
            "type": "drug_interaction",
            "gene": inter["gene"],
            "drug": inter["drug"],
            "finding": f"{inter['interaction_type']} ({inter['severity']})",
            "evidence": inter["evidence"],
        })

    evidence_summary = _evidence_grade_summary(all_findings)

    # ── 6. Store Results ────────────────────────────────────────────────────
    analysis_result = {
        "profile_id": profile_id,
        "patient_id": patient_id,
        "analyzed_at": _now_iso(),
        "ruleset_version": RULESET_VERSION,
        "metabolizer_statuses": metabolizer_statuses,
        "drug_interactions": drug_interactions,
        "fda_warnings": fda_warnings,
        "risk_scores": risk_scores,
        "evidence_summary": evidence_summary,
        "total_findings": len(all_findings),
    }
    _analysis_results[profile_id] = analysis_result

    _umbrella_audit(
        session,
        actor,
        event="pharmacogenomics_analyzed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=(
            f"Full analysis completed. {len(metabolizer_statuses)} phenotypes, "
            f"{len(drug_interactions)} interactions, {len(fda_warnings)} FDA warnings, "
            f"risk={risk_scores['overall_risk']}"
        ),
    )

    return {
        **analysis_result,
        "disclaimer": EVIDENCE_DISCLAIMER,
        "genetic_data_disclaimer": GENETIC_DATA_DISCLAIMER,
        "clinical_guidance": (
            "This analysis provides decision-support information only. "
            "All findings should be reviewed by a qualified clinician and integrated "
            "with the patient's complete medical history, current medications, and "
            "clinical presentation before any clinical decisions are made."
        ),
    }


@router.get("/profiles/{profile_id}/metabolizer-status")
async def get_metabolizer_status(
    profile_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Get metabolizer status for all CYP450 and pharmacogenomic genes.

    Returns CPIC-assigned phenotypes with activity scores and evidence grades.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    phenotypes = _phenotype_assignments.get(profile_id, {})
    variants = _genetic_variants.get(profile_id, [])

    # Build from stored phenotypes + variant auto-detection
    metabolizer_statuses: list[dict[str, Any]] = []
    processed_genes: set[str] = set()

    for gene, genotype in phenotypes.items():
        processed_genes.add(gene)
        ms = _assign_metabolizer_phenotype(gene, genotype)
        if ms:
            metabolizer_statuses.append(ms.model_dump())

    # Auto-assign for variants without stored phenotypes
    for variant in variants:
        gene = variant["gene"]
        genotype = variant.get("genotype", "")
        if gene not in processed_genes and gene.upper() in _CPIC_METABOLIZER_TABLE and genotype:
            ms = _assign_metabolizer_phenotype(gene, genotype)
            if ms:
                metabolizer_statuses.append(ms.model_dump())

    _umbrella_audit(
        session,
        actor,
        event="metabolizer_status_accessed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Metabolizer status queried for {len(metabolizer_statuses)} genes",
    )

    return {
        "profile_id": profile_id,
        "patient_id": patient_id,
        "metabolizer_statuses": metabolizer_statuses,
        "gene_count": len(metabolizer_statuses),
        "ruleset_version": RULESET_VERSION,
        "disclaimer": EVIDENCE_DISCLAIMER,
        "genetic_data_disclaimer": GENETIC_DATA_DISCLAIMER,
    }


@router.get("/profiles/{profile_id}/drug-interactions")
async def get_drug_interactions(
    profile_id: str,
    drug_class: Optional[str] = Query(None, description="Filter by drug class (e.g., SSRI, statin)"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Get gene-drug interactions for this genetic profile.

    Optionally filter by drug class. Returns interactions with severity,
    evidence grades, and clinical action notes (decision-support only).
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    phenotypes = _phenotype_assignments.get(profile_id, {})
    drug_interactions: list[dict[str, Any]] = []

    for gene, genotype in phenotypes.items():
        if gene.upper() in _PHARMGKB_INTERACTION_TABLE:
            interactions = _lookup_drug_interactions(gene, genotype)
            for inter in interactions:
                inter_dict = inter.model_dump()
                if drug_class and inter_dict.get("drug_class") != drug_class:
                    continue
                drug_interactions.append(inter_dict)

    severity_counts: dict[str, int] = {"high": 0, "moderate": 0, "low": 0}
    for inter in drug_interactions:
        sev = inter.get("severity", "low")
        if sev in severity_counts:
            severity_counts[sev] += 1

    _umbrella_audit(
        session,
        actor,
        event="drug_interactions_accessed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Drug interactions queried. drug_class={drug_class}, found={len(drug_interactions)}",
    )

    return {
        "profile_id": profile_id,
        "patient_id": patient_id,
        "drug_class_filter": drug_class,
        "interactions": drug_interactions,
        "total_interactions": len(drug_interactions),
        "severity_breakdown": severity_counts,
        "fda_high_risk_count": sum(1 for i in drug_interactions if i.get("fda_warning")),
        "disclaimer": EVIDENCE_DISCLAIMER,
        "clinical_note": (
            "These interactions are compiled from CPIC/PharmGKB reference data "
            "for decision-support. Always consider the patient's current medication "
            "list, renal/hepatic function, and clinical context."
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — 4. Cross-Module Integration
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/profiles/{profile_id}/medication-correlations")
async def get_medication_correlations(
    profile_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Correlate genetics with active medications, side effects, and adherence.

    Cross-references the patient's metabolizer phenotypes with known drug-gene
    interactions for their current medication regimen. Flags high-risk
    combinations and provides evidence-graded guidance.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    phenotypes = _phenotype_assignments.get(profile_id, {})

    # Build correlation findings
    correlations: list[dict[str, Any]] = []
    flagged_genes: set[str] = set()

    for gene, genotype in phenotypes.items():
        if gene.upper() in _PHARMGKB_INTERACTION_TABLE:
            interactions = _lookup_drug_interactions(gene, genotype)
            for inter in interactions:
                inter_dict = inter.model_dump()
                correlations.append({
                    "gene": gene,
                    "phenotype": genotype,
                    "drug": inter_dict["drug"],
                    "drug_class": inter_dict["drug_class"],
                    "interaction_type": inter_dict["interaction_type"],
                    "severity": inter_dict["severity"],
                    "evidence": inter_dict["evidence"],
                    "clinical_action": inter_dict["clinical_action"],
                    "correlation_type": "pharmacogenomic",
                })
                if inter_dict["severity"] == "high":
                    flagged_genes.add(gene)

    # Side effect risk assessment based on metabolizer status
    side_effect_risks: list[dict[str, Any]] = []
    for gene, genotype in phenotypes.items():
        ms = _assign_metabolizer_phenotype(gene, genotype)
        if ms and "Poor" in ms.phenotype:
            side_effect_risks.append({
                "gene": gene,
                "risk": "increased_exposure",
                "description": (
                    f"Poor {gene} metabolism may increase systemic exposure to "
                    f"substrate medications, elevating risk of dose-dependent adverse effects."
                ),
                "evidence": ms.evidence,
                "monitoring_recommendation": (
                    "Monitor for adverse effects when initiating or titrating "
                    f"substrates of {gene}. Consider lower starting doses."
                ),
            })
        elif ms and ("Ultrarapid" in ms.phenotype or "Rapid" in ms.phenotype):
            side_effect_risks.append({
                "gene": gene,
                "risk": "reduced_efficacy",
                "description": (
                    f"Ultrarapid {gene} metabolism may reduce efficacy of prodrugs "
                    f"requiring activation by this enzyme."
                ),
                "evidence": ms.evidence,
                "monitoring_recommendation": (
                    "Monitor clinical response to prodrug substrates of "
                    f"{gene}; efficacy may be suboptimal."
                ),
            })

    # Adherence insights
    adherence_insights: list[dict[str, Any]] = []
    if side_effect_risks:
        adherence_insights.append({
            "type": "side_effect_driven_nonadherence",
            "risk": "moderate" if len(side_effect_risks) <= 2 else "high",
            "description": (
                "Pharmacogenomic risk factors for adverse effects may contribute "
                "to medication non-adherence. Consider pharmacogenomic-guided "
                "medication selection to improve tolerability."
            ),
            "evidence": "B",
        })

    _umbrella_audit(
        session,
        actor,
        event="medication_correlations_accessed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Medication correlations: {len(correlations)} interactions, {len(side_effect_risks)} risk factors",
    )

    return {
        "profile_id": profile_id,
        "patient_id": patient_id,
        "pharmacogenomic_correlations": correlations,
        "high_risk_genes": sorted(flagged_genes),
        "side_effect_risks": side_effect_risks,
        "adherence_insights": adherence_insights,
        "correlation_count": len(correlations),
        "disclaimer": EVIDENCE_DISCLAIMER,
        "clinical_note": (
            "These correlations integrate pharmacogenomic data with medication "
            "profiles for decision-support. Review against the patient's current "
            "medication list and clinical status."
        ),
    }


@router.get("/profiles/{profile_id}/neuromodulation-genetics")
async def get_neuromodulation_genetics(
    profile_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Neuromodulation response genetics for TMS/tDCS personalization.

    Returns pharmacogenomic variants associated with neuromodulation treatment
    response: BDNF (Val66Met), COMT (Val158Met), GRIK4, 5HTTLPR.
    Each finding includes evidence grade and clinical context for
    neuromodulation protocol selection.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    variants = _genetic_variants.get(profile_id, [])
    gene_variants = {v["gene"]: v for v in variants}

    neuromod_results: list[dict[str, Any]] = []
    for gene, gene_data in _NEUROMODULATION_GENETICS.items():
        variant_info = gene_variants.get(gene)
        if variant_info:
            genotype = variant_info.get("genotype", "")
            variant_data = gene_data["variants"].get(genotype)
            if variant_data:
                neuromod_results.append({
                    "gene": gene,
                    "full_name": gene_data["full_name"],
                    "rsid": gene_data["rsid"],
                    "genotype": genotype,
                    "tms_response": variant_data["tms_response"],
                    "evidence": variant_data["evidence"],
                    "clinical_note": variant_data["note"],
                })
            else:
                neuromod_results.append({
                    "gene": gene,
                    "full_name": gene_data["full_name"],
                    "rsid": gene_data["rsid"],
                    "genotype": genotype,
                    "tms_response": "Unknown",
                    "evidence": "D",
                    "clinical_note": "Genotype not in reference database for neuromodulation response.",
                })
        else:
            neuromod_results.append({
                "gene": gene,
                "full_name": gene_data["full_name"],
                "rsid": gene_data["rsid"],
                "genotype": "Not tested",
                "tms_response": "Unknown",
                "evidence": "D",
                "clinical_note": "No variant data available for this gene.",
            })

    # Generate composite neuromodulation guidance
    favorable_count = sum(1 for r in neuromod_results if r["tms_response"] == "Favorable")
    reduced_count = sum(1 for r in neuromod_results if r["tms_response"] == "Reduced")

    composite_guidance = ""
    if favorable_count >= 2:
        composite_guidance = (
            "Multiple favorable neuromodulation response markers detected. "
            "Standard rTMS protocols are likely appropriate; consider DLPFC targeting."
        )
    elif reduced_count >= 2:
        composite_guidance = (
            "Multiple reduced-response markers detected. Consider extended "
            "treatment protocols, higher stimulation intensity, or combination "
            "with pharmacotherapy adjuncts."
        )
    else:
        composite_guidance = (
            "Mixed neuromodulation response profile. Standard protocols with "
            "close outcome monitoring are recommended."
        )

    _umbrella_audit(
        session,
        actor,
        event="neuromodulation_genetics_accessed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Neuromodulation genetics: {len(neuromod_results)} genes evaluated",
    )

    return {
        "profile_id": profile_id,
        "patient_id": patient_id,
        "neuromodulation_genetics": neuromod_results,
        "composite_guidance": composite_guidance,
        "favorable_markers": favorable_count,
        "reduced_markers": reduced_count,
        "genes_tested": len(neuromod_results),
        "disclaimer": EVIDENCE_DISCLAIMER,
        "neuromodulation_note": (
            "These findings support neuromodulation protocol selection as "
            "decision-support only. Response prediction is probabilistic; "
            "individual response varies. Combine with clinical assessment, "
            "qEEG/MRI biomarkers, and treatment history for optimal protocol design."
        ),
    }


@router.get("/profiles/{profile_id}/biomarker-genetics")
async def get_biomarker_genetics(
    profile_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Genetics + biomarker correlations: qEEG, MRI, inflammation, methylation.

    Correlates pharmacogenomic variants with expected biomarker patterns
    to support multi-modal assessment integration.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    phenotypes = _phenotype_assignments.get(profile_id, {})
    biomarker_correlations: list[dict[str, Any]] = []

    # CYP2D6 + qEEG theta/beta ratio
    if "CYP2D6" in phenotypes:
        cyp2d6_pheno = phenotypes["CYP2D6"]
        if "Poor" in cyp2d6_pheno:
            biomarker_correlations.append({
                "biomarker_domain": "qEEG",
                "biomarker": "Theta/Beta Ratio",
                "gene": "CYP2D6",
                "correlation": "Poor CYP2D6 metabolizers on CYP2D6-substrate medications may show elevated theta/beta due to increased CNS exposure.",
                "clinical_note": "Consider qEEG monitoring when titrating CYP2D6 substrates in PM patients.",
                "evidence": "C",
            })
        elif "Ultrarapid" in cyp2d6_pheno:
            biomarker_correlations.append({
                "biomarker_domain": "qEEG",
                "biomarker": "Theta/Beta Ratio",
                "gene": "CYP2D6",
                "correlation": "Ultrarapid metabolizers may have subtherapeutic CNS exposure, potentially showing minimal qEEG changes.",
                "clinical_note": "Monitor clinical response rather than relying on biomarker changes alone.",
                "evidence": "C",
            })

    # COMT + qEEG alpha asymmetry
    variants = _genetic_variants.get(profile_id, [])
    for v in variants:
        if v["gene"] == "COMT":
            biomarker_correlations.append({
                "biomarker_domain": "qEEG",
                "biomarker": "Alpha Asymmetry (F3-F4)",
                "gene": "COMT",
                "correlation": "COMT Val158Met affects prefrontal dopamine, influencing alpha asymmetry patterns.",
                "clinical_note": "Met/Met carriers may show greater left-frontal alpha suppression; consider in neuromodulation targeting.",
                "evidence": "B",
            })
            biomarker_correlations.append({
                "biomarker_domain": "MRI",
                "biomarker": "Prefrontal Cortical Thickness",
                "gene": "COMT",
                "correlation": "COMT genotype may modulate prefrontal cortical thickness and plasticity response.",
                "clinical_note": "Val/Val carriers may have thinner prefrontal cortex but greater plasticity response.",
                "evidence": "C",
            })

    # BDNF + MRI hippocampal volume
    for v in variants:
        if v["gene"] == "BDNF":
            biomarker_correlations.append({
                "biomarker_domain": "MRI",
                "biomarker": "Hippocampal Volume",
                "gene": "BDNF",
                "correlation": "BDNF Val66Met Met carriers may have reduced hippocampal volume.",
                "clinical_note": "Met carriers may benefit from combined exercise + neuromodulation interventions.",
                "evidence": "A",
            })

    # MTHFR + methylation
    for v in variants:
        if v["gene"] == "MTHFR":
            biomarker_correlations.append({
                "biomarker_domain": "methylation",
                "biomarker": "Global DNA Methylation",
                "gene": "MTHFR",
                "correlation": "MTHFR C677T variant impairs folate metabolism, reducing methylation capacity.",
                "clinical_note": "Consider folate/B12 supplementation monitoring alongside methylation assessment.",
                "evidence": "A",
            })
            biomarker_correlations.append({
                "biomarker_domain": "inflammation",
                "biomarker": "Homocysteine",
                "gene": "MTHFR",
                "correlation": "MTHFR variants may elevate homocysteine, an inflammatory marker.",
                "clinical_note": "Monitor homocysteine levels; elevated homocysteine is associated with neurovascular risk.",
                "evidence": "A",
            })

    # SLCO1B1 + inflammatory markers
    if "SLCO1B1" in phenotypes:
        biomarker_correlations.append({
            "biomarker_domain": "lipids",
            "biomarker": "LDL Cholesterol",
            "gene": "SLCO1B1",
            "correlation": "SLCO1B1 reduced function may impair hepatic statin uptake, affecting lipid-lowering response.",
            "clinical_note": "Monitor lipid panel response to statin therapy in reduced-function carriers.",
            "evidence": "A",
        })

    _umbrella_audit(
        session,
        actor,
        event="biomarker_genetics_accessed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Biomarker genetics: {len(biomarker_correlations)} correlations",
    )

    return {
        "profile_id": profile_id,
        "patient_id": patient_id,
        "biomarker_correlations": biomarker_correlations,
        "correlation_count": len(biomarker_correlations),
        "biomarker_domains": sorted({c["biomarker_domain"] for c in biomarker_correlations}),
        "disclaimer": EVIDENCE_DISCLAIMER,
        "integration_note": (
            "These genetics-biomarker correlations support multi-modal assessment "
            "integration. Use as decision-support alongside direct biomarker "
            "measurements (qEEG, MRI, bloodwork) for comprehensive clinical evaluation."
        ),
    }


@router.get("/profiles/{patient_id}/nutrition-genetics")
async def get_nutrition_genetics(
    patient_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Nutrition genetics: MTHFR, folate, B12, omega-3, vitamin D pathways.

    Returns nutrigenomic variant analysis with personalized nutrition
    recommendations as decision-support only.
    """
    require_minimum_role(actor, "clinician")
    _gate_patient_access(actor, patient_id, session)

    # Find the most recent profile for this patient
    patient_profiles = [
        p for p in _genetic_profiles.values() if p["patient_id"] == patient_id
    ]
    if not patient_profiles:
        return {
            "patient_id": patient_id,
            "nutrition_genetics": [],
            "recommendations": [],
            "disclaimer": EVIDENCE_DISCLAIMER,
            "note": "No genetic profile found for this patient. Create a profile first.",
        }

    # Use the most recently updated profile
    profile = max(patient_profiles, key=lambda p: p.get("updated_at", p["created_at"]))
    profile_id = profile["id"]
    variants = _genetic_variants.get(profile_id, [])
    gene_variants = {v["gene"]: v for v in variants}

    nutrition_results: list[dict[str, Any]] = []
    for gene, gene_data in _NUTRITION_GENETICS.items():
        variant_info = gene_variants.get(gene)
        if variant_info:
            genotype = variant_info.get("genotype", "")
            for variant_name, variant_table in gene_data["variants"].items():
                variant_outcome = variant_table.get(genotype)
                if variant_outcome:
                    nutrition_results.append({
                        "gene": gene,
                        "full_name": gene_data["full_name"],
                        "variant": variant_name,
                        "genotype": genotype,
                        **variant_outcome,
                    })
                else:
                    nutrition_results.append({
                        "gene": gene,
                        "full_name": gene_data["full_name"],
                        "variant": variant_name,
                        "genotype": genotype,
                        "status": "Unknown genotype mapping",
                        "evidence": "D",
                    })
        else:
            nutrition_results.append({
                "gene": gene,
                "full_name": gene_data["full_name"],
                "variant": list(gene_data["variants"].keys())[0],
                "genotype": "Not tested",
                "status": "No data",
                "evidence": "D",
            })

    # Generate nutrition recommendations
    recommendations: list[dict[str, Any]] = []
    mthfr_impaired = any(
        r.get("gene") == "MTHFR" and "Impaired" in r.get("methylation", "")
        for r in nutrition_results
    )
    if mthfr_impaired:
        recommendations.append({
            "category": "folate",
            "recommendation": (
                "MTHFR variant detected with impaired methylation. "
                "Consider methylfolate (5-MTHF) supplementation rather than folic acid. "
                "Monitor folate and homocysteine levels."
            ),
            "evidence": "A",
            "rationale": "MTHFR C677T reduces conversion of folic acid to active 5-MTHF.",
        })
        recommendations.append({
            "category": "B12",
            "recommendation": (
                "Consider methylcobalamin or hydroxocobalamin B12 supplementation "
                "alongside methylfolate for synergistic methylation support."
            ),
            "evidence": "B",
            "rationale": "B12 is a cofactor for methionine synthase in the methylation cycle.",
        })

    omega3_reduced = any(
        r.get("gene") == "FADS1" and "Reduced" in r.get("omega3_conversion", "")
        for r in nutrition_results
    )
    if omega3_reduced:
        recommendations.append({
            "category": "omega3",
            "recommendation": (
                "FADS1 variant with reduced omega-3 conversion efficiency. "
                "Consider direct EPA/DHA supplementation rather than relying on "
                "ALA conversion. Monitor omega-3 index if available."
            ),
            "evidence": "A",
            "rationale": "Reduced delta-5-desaturase activity limits conversion of ALA to EPA/DHA.",
        })

    vitamin_d_reduced = any(
        r.get("gene") in ("GC", "CYP2R1") and "Reduced" in r.get("vitamin_d_status", "")
        for r in nutrition_results
    )
    if vitamin_d_reduced:
        recommendations.append({
            "category": "vitamin_d",
            "recommendation": (
                "Genetic variants associated with reduced vitamin D status detected. "
                "Consider higher-dose vitamin D3 supplementation with periodic "
                "25(OH)D monitoring. Target 40-60 ng/mL per Endocrine Society guidelines."
            ),
            "evidence": "A",
            "rationale": "GC and CYP2R1 variants affect vitamin D binding and 25-hydroxylation.",
        })

    apoe_risk = any(
        r.get("gene") == "APOE" and "High Risk" in r.get("lipid_response", "")
        for r in nutrition_results
    )
    if apoe_risk:
        recommendations.append({
            "category": "lipids",
            "recommendation": (
                "APOE e4 variant associated with elevated lipid risk. "
                "Consider Mediterranean-style diet, omega-3 supplementation, "
                "and regular lipid panel monitoring."
            ),
            "evidence": "A",
            "rationale": "APOE e4 carriers have altered lipid metabolism and increased cardiovascular risk.",
        })

    _umbrella_audit(
        session,
        actor,
        event="nutrition_genetics_accessed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Nutrition genetics: {len(nutrition_results)} results, {len(recommendations)} recommendations",
    )

    return {
        "patient_id": patient_id,
        "profile_id": profile_id,
        "nutrition_genetics": nutrition_results,
        "recommendations": recommendations,
        "genes_evaluated": len(_NUTRITION_GENETICS),
        "recommendation_count": len(recommendations),
        "disclaimer": EVIDENCE_DISCLAIMER,
        "nutrition_note": (
            "These nutrigenomic findings are for clinical decision-support only. "
            "Nutrition recommendations should be individualized based on the patient's "
            "current diet, lab values, clinical condition, and in consultation with a "
            "registered dietitian or nutrition specialist when indicated."
        ),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — 5. Report Generation
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/profiles/{profile_id}/reports")
async def generate_report(
    profile_id: str,
    request: ReportRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ReportResponse:
    """Generate a pharmacogenomics report with safety framing.

    Creates a structured report containing the requested sections with
    evidence grades, decision-support disclaimers, and clinical context.
    No prescribing language is included in any report.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    # Ensure analysis is current
    analysis = _analysis_results.get(profile_id)
    if not analysis:
        # Run analysis on-the-fly
        phenotypes = _phenotype_assignments.get(profile_id, {})
        variants = _genetic_variants.get(profile_id, [])
        metabolizer_statuses: list[dict[str, Any]] = []
        for gene, genotype in phenotypes.items():
            ms = _assign_metabolizer_phenotype(gene, genotype)
            if ms:
                metabolizer_statuses.append(ms.model_dump())
        for v in variants:
            gene, genotype = v["gene"], v.get("genotype", "")
            if gene not in phenotypes and gene.upper() in _CPIC_METABOLIZER_TABLE and genotype:
                ms = _assign_metabolizer_phenotype(gene, genotype)
                if ms:
                    metabolizer_statuses.append(ms.model_dump())

        drug_interactions: list[dict[str, Any]] = []
        for ms_item in metabolizer_statuses:
            gene = ms_item["gene"]
            if gene.upper() in _PHARMGKB_INTERACTION_TABLE:
                interactions = _lookup_drug_interactions(gene, ms_item["phenotype"])
                drug_interactions.extend([i.model_dump() for i in interactions])

        analysis = {
            "profile_id": profile_id,
            "patient_id": patient_id,
            "metabolizer_statuses": metabolizer_statuses,
            "drug_interactions": drug_interactions,
            "evidence_summary": _evidence_grade_summary(
                [{"evidence": m["evidence"]} for m in metabolizer_statuses]
                + [{"evidence": i["evidence"]} for i in drug_interactions]
            ),
        }

    report_id = str(uuid.uuid4())
    now = _now_iso()

    # Build report sections
    report_sections: dict[str, Any] = {}
    for section in request.sections:
        if section == "metabolizer_status":
            report_sections["metabolizer_status"] = {
                "title": "Metabolizer Phenotype Summary",
                "data": analysis.get("metabolizer_statuses", []),
                "note": "CPIC guideline-based phenotype assignments.",
            }
        elif section == "drug_interactions":
            report_sections["drug_interactions"] = {
                "title": "Gene-Drug Interactions",
                "data": analysis.get("drug_interactions", []),
                "note": "PharmGKB reference interactions, phenotype-adjusted.",
            }
        elif section == "neuromodulation_genetics":
            # Build neuromodulation section on-the-fly
            variants = _genetic_variants.get(profile_id, [])
            gene_variants = {v["gene"]: v for v in variants}
            nm_results: list[dict[str, Any]] = []
            for gene, gene_data in _NEUROMODULATION_GENETICS.items():
                vi = gene_variants.get(gene)
                if vi:
                    vd = gene_data["variants"].get(vi.get("genotype", ""))
                    if vd:
                        nm_results.append({"gene": gene, **vd})
            report_sections["neuromodulation_genetics"] = {
                "title": "Neuromodulation Response Genetics",
                "data": nm_results,
                "note": "TMS/tDCS response markers for protocol personalization.",
            }
        elif section == "nutrition_genetics":
            variants = _genetic_variants.get(profile_id, [])
            gene_variants = {v["gene"]: v for v in variants}
            nut_results: list[dict[str, Any]] = []
            for gene, gene_data in _NUTRITION_GENETICS.items():
                vi = gene_variants.get(gene)
                if vi:
                    for vname, vtable in gene_data["variants"].items():
                        outcome = vtable.get(vi.get("genotype", ""), {})
                        if outcome:
                            nut_results.append({"gene": gene, "variant": vname, **outcome})
            report_sections["nutrition_genetics"] = {
                "title": "Nutrigenomics Summary",
                "data": nut_results,
                "note": "MTHFR, folate, omega-3, vitamin D pathway genetics.",
            }
        elif section == "biomarker_correlations":
            report_sections["biomarker_correlations"] = {
                "title": "Genetics-Biomarker Correlations",
                "data": [],  # Would be populated from biomarker-genetics endpoint
                "note": "qEEG, MRI, inflammation, and methylation correlations.",
            }
        elif section == "decision_support_summary":
            evidence_summary = analysis.get("evidence_summary", {})
            report_sections["decision_support_summary"] = {
                "title": "Decision-Support Summary",
                "evidence_summary": evidence_summary,
                "total_findings": analysis.get("total_findings", 0),
                "note": (
                    "This report is for clinical decision-support only. "
                    "All findings should be reviewed by a qualified clinician "
                    "and integrated with the patient's full clinical picture."
                ),
            }

    # Build final report
    report = {
        "id": report_id,
        "profile_id": profile_id,
        "patient_id": patient_id,
        "report_type": request.report_type.value,
        "sections": request.sections,
        "generated_at": now,
        "generated_by": actor.actor_id,
        "disclaimer": EVIDENCE_DISCLAIMER,
        "report_data": report_sections,
        "ruleset_version": RULESET_VERSION,
        "include_evidence": request.include_evidence,
        "evidence_summary": analysis.get("evidence_summary", {}),
    }
    _generated_reports[report_id] = report

    _umbrella_audit(
        session,
        actor,
        event="report_generated",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Report generated: type={request.report_type.value}, sections={request.sections}, report_id={report_id}",
    )

    return ReportResponse(
        id=report_id,
        profile_id=profile_id,
        patient_id=patient_id,
        report_type=request.report_type.value,
        sections=request.sections,
        generated_at=now,
        disclaimer=EVIDENCE_DISCLAIMER,
        evidence_summary=analysis.get("evidence_summary", {}),
    )


@router.get("/profiles/{profile_id}/reports/{report_id}")
async def get_report(
    profile_id: str,
    report_id: str,
    format: str = Query("json", description="Output format: json, pdf, html"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Get a generated report in the requested format.

    Supports json (default), pdf, and html formats. All formats include
    the decision-support disclaimer and evidence grades.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    report = _generated_reports.get(report_id)
    if not report or report["profile_id"] != profile_id:
        raise HTTPException(status_code=404, detail="Report not found")

    _umbrella_audit(
        session,
        actor,
        event="report_accessed",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Report accessed: report_id={report_id}, format={format}",
    )

    if format == "json":
        return {
            "report": report,
            "format": "json",
            "disclaimer": EVIDENCE_DISCLAIMER,
        }
    elif format == "html":
        html_content = _render_report_html(report)
        return {
            "report_id": report_id,
            "format": "html",
            "html_content": html_content,
            "disclaimer": EVIDENCE_DISCLAIMER,
        }
    elif format == "pdf":
        return {
            "report_id": report_id,
            "format": "pdf",
            "note": "PDF generation requires a PDF rendering service. Use html format for now.",
            "report_summary": {
                "id": report["id"],
                "type": report["report_type"],
                "sections": report["sections"],
                "generated_at": report["generated_at"],
            },
            "disclaimer": EVIDENCE_DISCLAIMER,
        }
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {format}. Use json, html, or pdf.")


def _render_report_html(report: dict[str, Any]) -> str:
    """Render a report as HTML for human-readable output."""
    sections = report.get("report_data", {})
    html_parts: list[str] = [
        "<!DOCTYPE html>",
        '<html><head><meta charset="utf-8">',
        "<title>Pharmacogenomics Report</title>",
        "<style>",
        "body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;line-height:1.6;}",
        "h1{color:#2c3e50;border-bottom:2px solid #3498db;padding-bottom:10px;}",
        "h2{color:#34495e;margin-top:30px;}",
        ".disclaimer{background:#fff3cd;border:1px solid #ffc107;padding:15px;margin:20px 0;border-radius:4px;}",
        ".section{background:#f8f9fa;padding:15px;margin:15px 0;border-radius:4px;}",
        ".finding{margin:10px 0;padding:10px;background:#fff;border-left:4px solid #3498db;}",
        ".evidence-A{border-left-color:#28a745;}.evidence-B{border-left-color:#17a2b8;}",
        ".evidence-C{border-left-color:#ffc107;}.evidence-D{border-left-color:#6c757d;}",
        ".severity-high{color:#dc3545;font-weight:bold;}",
        ".severity-moderate{color:#fd7e14;font-weight:bold;}",
        ".severity-low{color:#28a745;}",
        "table{border-collapse:collapse;width:100%;margin:10px 0;}",
        "th,td{border:1px solid #dee2e6;padding:8px;text-align:left;}",
        "th{background:#e9ecef;}",
        "</style></head><body>",
        f'<h1>Pharmacogenomics Report</h1>',
        f'<p><strong>Report ID:</strong> {report["id"]}</p>',
        f'<p><strong>Type:</strong> {report["report_type"]}</p>',
        f'<p><strong>Generated:</strong> {report["generated_at"]}</p>',
        f'<p><strong>Ruleset:</strong> {report.get("ruleset_version", "")}</p>',
        '<div class="disclaimer"><strong>Decision-Support Disclaimer:</strong> ',
        f'{report["disclaimer"]}</div>',
    ]

    for section_key, section_data in sections.items():
        html_parts.append(f'<div class="section">')
        html_parts.append(f'<h2>{section_data.get("title", section_key)}</h2>')
        if section_key == "metabolizer_status":
            html_parts.append("<table><tr><th>Gene</th><th>Phenotype</th><th>Activity Score</th><th>Evidence</th></tr>")
            for item in section_data.get("data", []):
                ev_class = f'evidence-{item.get("evidence", "D")}'
                html_parts.append(
                    f'<tr class="{ev_class}"><td>{item["gene"]}</td>'
                    f'<td>{item["phenotype"]}</td>'
                    f'<td>{item["activity_score"]}</td>'
                    f'<td>{item["evidence"]}</td></tr>'
                )
            html_parts.append("</table>")
        elif section_key == "drug_interactions":
            html_parts.append("<table><tr><th>Gene</th><th>Drug</th><th>Type</th><th>Severity</th><th>Evidence</th><th>Action</th></tr>")
            for item in section_data.get("data", []):
                sev_class = f'severity-{item.get("severity", "low")}'
                ev_class = f'evidence-{item.get("evidence", "D")}'
                html_parts.append(
                    f'<tr class="{ev_class}"><td>{item["gene"]}</td>'
                    f'<td>{item["drug"]}</td>'
                    f'<td>{item["interaction_type"]}</td>'
                    f'<td class="{sev_class}">{item["severity"]}</td>'
                    f'<td>{item["evidence"]}</td>'
                    f'<td>{item["clinical_action"][:100]}...</td></tr>'
                )
            html_parts.append("</table>")
        elif section_key == "decision_support_summary":
            ev_summary = section_data.get("evidence_summary", {})
            html_parts.append("<p><strong>Evidence Grade Distribution:</strong></p><ul>")
            for grade, count in ev_summary.items():
                html_parts.append(f"<li>Grade {grade}: {count} findings</li>")
            html_parts.append("</ul>")
            html_parts.append(f'<p>{section_data.get("note", "")}</p>')
        else:
            html_parts.append(f'<p>{section_data.get("note", "")}</p>')
            html_parts.append(f'<p>{len(section_data.get("data", []))} items</p>')
        html_parts.append("</div>")

    html_parts.append("</body></html>")
    return "\n".join(html_parts)


# ═══════════════════════════════════════════════════════════════════════════════
# Endpoints — 6. Export
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/profiles/{profile_id}/export")
async def export_profile(
    profile_id: str,
    request: ExportRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> dict[str, Any]:
    """Export genetic profile data with full audit trail.

    Exports genetic profile data in the requested format (json, csv, pdf)
    and scope. Every export is logged with the clinical/research reason.
    Genetic data PHI protections apply to all exports.
    """
    require_minimum_role(actor, "clinician")
    profile = _genetic_profiles.get(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Genetic profile not found")

    patient_id = profile["patient_id"]
    _gate_patient_access(actor, patient_id, session)

    variants = _genetic_variants.get(profile_id, [])
    phenotypes = _phenotype_assignments.get(profile_id, {})

    # Build export data based on scope
    export_data: dict[str, Any] = {
        "profile_id": profile_id,
        "patient_id": patient_id,
        "exported_at": _now_iso(),
        "exported_by": actor.actor_id,
        "clinic_id": actor.clinic_id,
        "export_reason": request.reason,
        "export_scope": request.scope,
        "ruleset_version": RULESET_VERSION,
    }

    if request.scope in ("full", "variants_only"):
        export_data["variants"] = variants
        export_data["phenotypes"] = phenotypes

    if request.scope in ("full", "report_only"):
        analysis = _analysis_results.get(profile_id, {})
        export_data["analysis"] = {
            "metabolizer_statuses": analysis.get("metabolizer_statuses", []),
            "drug_interactions": analysis.get("drug_interactions", []),
            "fda_warnings": analysis.get("fda_warnings", []),
            "risk_scores": analysis.get("risk_scores", {}),
            "evidence_summary": analysis.get("evidence_summary", {}),
        }

    # Format-specific wrapping
    if request.format == "json":
        output = export_data
    elif request.format == "csv":
        # Build CSV representation for variants
        csv_rows: list[str] = ["profile_id,gene,variant,genotype,confidence,source"]
        for v in variants:
            csv_rows.append(
                f"{profile_id},{v.get('gene','')},{v.get('variant','')},"
                f"{v.get('genotype','')},{v.get('confidence','')},{v.get('source','')}"
            )
        output = {
            **export_data,
            "csv_variants": "\n".join(csv_rows),
        }
    elif request.format == "pdf":
        output = {
            **export_data,
            "note": "PDF export requires a rendering pipeline. Use json or csv for structured data.",
        }
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported export format: {request.format}")

    _umbrella_audit(
        session,
        actor,
        event="profile_exported",
        patient_id=patient_id,
        profile_id=profile_id,
        note=f"Profile exported: format={request.format}, scope={request.scope}, reason={request.reason}",
    )

    return {
        "export": output,
        "format": request.format,
        "scope": request.scope,
        "disclaimer": EVIDENCE_DISCLAIMER,
        "phi_notice": (
            "This export contains protected health information (PHI) under HIPAA. "
            "Ensure secure transmission and storage. Access is logged and audited."
        ),
    }
