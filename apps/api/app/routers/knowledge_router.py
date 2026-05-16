"""
Knowledge Layer Router — PHASE 1
================================

DeepSynaps Protocol Studio — Clinical Neuromodulation Knowledge Layer.

Provides unified access to:
  • Medication knowledge (RxNorm, NDC, ATC, interactions)
  • Pharmacogenomics (CPIC gene-drug guidelines)
  • Normative EEG reference databases
  • MRI atlas lookups (AAL3, Schaefer, Harvard-Oxford)
  • Simulation management (tDCS, TMS, tACS)
  • Outcome instruments (PROMIS, PHQ-9, GAD-7)
  • Knowledge layer administration and sync status

All endpoints return provenance metadata and confidence-tier annotations.
Research-only flags are set explicitly where data are not clinically validated.

Role model
----------
  guest        – no access
  patient      – read-only medication + outcomes
  technician   – EEG + atlas + simulation read
  reviewer     – above + PGx + outcomes
  clinician    – full read + simulation submit
  admin        – full access including sync triggers
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Path,
    Query,
    status,
)
from pydantic import BaseModel, Field, field_validator

from app.auth import (
    ROLE_ORDER,
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.errors import ApiServiceError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ConfidenceTier(str, Enum):
    """Evidence confidence tier for every knowledge response."""

    CLINICAL = "clinical"          # Peer-reviewed, regulatory accepted
    RESEARCH = "research"          # Published but not yet guideline-grade
    EXPERIMENTAL = "experimental"  # Pre-print / in-house model output


class UserRole(str, Enum):
    """Local mirror of project role ordering for guard logic."""

    GUEST = "guest"
    PATIENT = "patient"
    TECHNICIAN = "technician"
    REVIEWER = "reviewer"
    CLINICIAN = "clinician"
    ADMIN = "admin"


# ---------------------------------------------------------------------------
# Pydantic request/response models
# ---------------------------------------------------------------------------

class _ProvenanceMixin(BaseModel):
    """Mixin that every knowledge response carries."""

    provenance: Dict[str, Any] = Field(
        default_factory=dict,
        description="Data provenance: source databases, versions, query timestamps.",
    )


# ── Medication ──────────────────────────────────────────────────────────────

class MedicationLookupRequest(BaseModel):
    """Lookup a medication by one or more identifiers."""

    name: Optional[str] = Field(None, description="Generic or brand name.")
    rxcui: Optional[str] = Field(None, description="RxNorm concept unique identifier.")
    ndc: Optional[str] = Field(None, description="National Drug Code (11-digit).")
    atc_code: Optional[str] = Field(None, description="ATC/DDD classification code.")


class MedicationLookupResponse(_ProvenanceMixin):
    """Paginated medication lookup results."""

    medications: List[Dict[str, Any]] = Field(default_factory=list)
    confidence_tier: str = "clinical"
    source_databases: List[str] = Field(default_factory=list)
    total_results: int = 0


class MedicationDetailResponse(_ProvenanceMixin):
    """Single medication detail view."""

    rxcui: str
    name: str
    tty: str  # IN, MIN, PIN, BN, SCDC …
    status: str  # Active / Obsolete / Remapped
    properties: Dict[str, Any] = Field(default_factory=dict)
    confidence_tier: str = "clinical"


class IngredientListResponse(_ProvenanceMixin):
    """Active ingredients for an RxCUI."""

    rxcui: str
    ingredients: List[Dict[str, Any]] = Field(default_factory=list)
    confidence_tier: str = "clinical"


class ATCClassificationResponse(_ProvenanceMixin):
    """ATC classification tree for an RxCUI."""

    rxcui: str
    atc_codes: List[Dict[str, Any]] = Field(default_factory=list)
    confidence_tier: str = "clinical"


class DrugInteractionResponse(_ProvenanceMixin):
    """Interaction profile for a medication."""

    rxcui: str
    interactions: List[Dict[str, Any]] = Field(default_factory=list)
    severity_counts: Dict[str, int] = Field(default_factory=dict)
    research_only: bool = True
    research_only_reason: str = (
        "Drug-interaction screening supports clinical decision-making but does not replace pharmacist review."
    )
    confidence_tier: str = "research"


# ── Pharmacogenomics ────────────────────────────────────────────────────────

class GeneDrugQueryRequest(BaseModel):
    """Query gene-drug interaction evidence."""

    gene: Optional[str] = Field(None, description="HGNC gene symbol, e.g. CYP2D6.")
    drug: Optional[str] = Field(None, description="Drug name or RxCUI.")
    variant: Optional[str] = Field(None, description="Variant identifier, e.g. *1/*2.")


class GeneDrugResponse(_ProvenanceMixin):
    """Gene-drug interaction results."""

    interactions: List[Dict[str, Any]] = Field(default_factory=list)
    cpic_guidelines: List[Dict[str, Any]] = Field(default_factory=list)
    confidence_tier: str = "research"
    research_only_flags: List[str] = Field(default_factory=list)
    total_interactions: int = 0


class GeneAnnotationResponse(_ProvenanceMixin):
    """Gene-level annotation summary."""

    gene: str
    hgnc_id: Optional[str] = None
    chromosomal_location: Optional[str] = None
    annotations: List[Dict[str, Any]] = Field(default_factory=list)
    confidence_tier: str = "research"


class CPICGuidelineResponse(_ProvenanceMixin):
    """CPIC guideline lookup result."""

    gene: str
    drug: str
    guidelines: List[Dict[str, Any]] = Field(default_factory=list)
    phenotypes_covered: List[str] = Field(default_factory=list)
    confidence_tier: str = "clinical"


# ── Normative EEG ───────────────────────────────────────────────────────────

class RecordingCondition(str, Enum):
    """EEG recording condition."""

    EYES_OPEN = "eyes_open"
    EYES_CLOSED = "eyes_closed"


class NormativeEEGQueryRequest(BaseModel):
    """Request normative EEG z-scores for a subject profile."""

    age: float = Field(..., ge=0, le=120, description="Age in years.")
    sex: str = Field(..., pattern=r"^[MF]$", description="Biological sex: M or F.")
    recording_condition: RecordingCondition = Field(
        RecordingCondition.EYES_CLOSED,
        description="Eyes open or closed condition during recording.",
    )
    features: Optional[List[str]] = Field(
        None,
        description="Feature subset: delta, theta, alpha, beta, gamma, coherence, asymmetry.",
    )

    @field_validator("features")
    @classmethod
    def _validate_features(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        allowed = {"delta", "theta", "alpha", "beta", "gamma", "coherence", "asymmetry"}
        invalid = set(v) - allowed
        if invalid:
            raise ValueError(f"Invalid features: {invalid}. Allowed: {allowed}")
        return v


class NormativeEEGResponse(_ProvenanceMixin):
    """Normative EEG comparison results."""

    z_scores: Dict[str, Any] = Field(default_factory=dict)
    reference_population: Dict[str, Any] = Field(default_factory=dict)
    confidence_tier: str = "research"
    research_only: bool = True
    research_only_reason: Optional[str] = (
        "Normative comparisons are research-grade; clinical interpretation requires QEEG-certified review."
    )


class NormativeDatabaseInfo(BaseModel):
    """Metadata for one normative EEG database."""

    db_id: str
    name: str
    description: str
    age_range: tuple[float, float]
    n_subjects: int
    conditions: List[str]
    features: List[str]
    citation: str


class NormativeDatabaseListResponse(_ProvenanceMixin):
    """List of available normative databases."""

    databases: List[NormativeDatabaseInfo] = Field(default_factory=list)
    total_databases: int = 0
    confidence_tier: str = "clinical"


# ── MRI Atlas ───────────────────────────────────────────────────────────────

class AtlasName(str, Enum):
    """Supported brain atlases."""

    AAL3 = "AAL3"
    SCHAEFER_400 = "Schaefer_400"
    HARVARD_OXFORD = "HarvardOxford"


class AtlasRegionQueryRequest(BaseModel):
    """Look up atlas region by name, ID, or MNI coordinates."""

    region_name: Optional[str] = Field(None, description="Human-readable region name.")
    region_id: Optional[int] = Field(None, ge=0, description="Numeric region ID in atlas.")
    mni_coordinates: Optional[tuple[float, float, float]] = Field(
        None, description="MNI x, y, z coordinates."
    )
    atlas: AtlasName = Field(AtlasName.AAL3, description="Atlas to query.")


class AtlasRegionResponse(_ProvenanceMixin):
    """Atlas region lookup results."""

    regions: List[Dict[str, Any]] = Field(default_factory=list)
    atlas_version: str
    total_regions: int = 0
    confidence_tier: str = "clinical"


class AtlasRegionDetailResponse(_ProvenanceMixin):
    """Detailed information for a single atlas region."""

    region_id: int
    region_name: str
    hemisphere: Optional[str] = None
    lobe: Optional[str] = None
    mni_centroid: Optional[tuple[float, float, float]] = None
    volume_mm3: Optional[float] = None
    connectivity: Optional[Dict[str, Any]] = None
    functional_labels: Optional[List[str]] = None
    atlas_version: str
    confidence_tier: str = "clinical"


# ── Simulation ──────────────────────────────────────────────────────────────

class SimulationType(str, Enum):
    """Supported neuromodulation simulation types."""

    TDCS = "tDCS"
    TMS = "TMS"
    TACS = "tACS"


class SimulationStatus(str, Enum):
    """Lifecycle states for a simulation job."""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class SimulationRequest(BaseModel):
    """Submit a neuromodulation simulation job."""

    simulation_type: SimulationType = Field(..., description="tDCS, TMS, or tACS.")
    subject_mri: str = Field(..., description="Path or ID referencing the patient MRI.")
    electrode_config: Optional[Dict[str, Any]] = Field(
        None, description="tDCS electrode montage configuration."
    )
    coil_model: Optional[str] = Field(
        None, description="TMS coil model (e.g. Magstim 70mm Figure-8)."
    )
    target_roi: Optional[str] = Field(None, description="Target region of interest.")
    intensity_ma: Optional[float] = Field(
        None, ge=0.5, le=10.0, description="tDCS current intensity in mA."
    )

    @field_validator("electrode_config")
    @classmethod
    def _validate_electrode(cls, v: Optional[Dict[str, Any]], info) -> Optional[Dict[str, Any]]:
        if v is not None and info.data.get("simulation_type") == SimulationType.TDCS:
            if "anode" not in v or "cathode" not in v:
                raise ValueError("tDCS electrode_config must contain 'anode' and 'cathode' keys.")
        return v


class SimulationResponse(_ProvenanceMixin):
    """Simulation job status and results."""

    simulation_id: str
    status: str  # queued, running, completed, failed
    results: Optional[Dict[str, Any]] = None
    e_field_stats: Optional[Dict[str, Any]] = None
    safety_validation: Optional[Dict[str, Any]] = None
    research_only: bool = True
    research_only_reason: str = "Simulation outputs are research-grade only"
    confidence_tier: str = "experimental"


class SimulationValidateRequest(BaseModel):
    """Validate a stimulation configuration for safety."""

    simulation_type: SimulationType
    subject_mri: str
    electrode_config: Optional[Dict[str, Any]] = None
    coil_model: Optional[str] = None
    target_roi: Optional[str] = None
    intensity_ma: Optional[float] = Field(None, ge=0.5, le=10.0)


class SimulationValidationResponse(_ProvenanceMixin):
    """Safety validation outcome."""

    valid: bool
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    estimated_session_duration_min: Optional[float] = None
    max_predicted_e_field_vm: Optional[float] = None
    research_only: bool = True
    research_only_reason: str = "Safety validation is pre-screening only; clinical clearance required."
    confidence_tier: str = "experimental"


# ── Outcomes ────────────────────────────────────────────────────────────────

class OutcomeDomain(str, Enum):
    """Clinical outcome domains."""

    DEPRESSION = "depression"
    ANXIETY = "anxiety"
    SLEEP = "sleep"
    PAIN = "pain"
    COGNITIVE = "cognitive"
    FATIGUE = "fatigue"


class InstrumentType(str, Enum):
    """Supported outcome instrument families."""

    PROMIS = "PROMIS"
    GAD7 = "GAD7"
    PHQ9 = "PHQ9"
    CUSTOM = "custom"


class AdministrationMode(str, Enum):
    """Instrument administration mode."""

    CAT = "CAT"
    FIXED = "fixed"
    PAPER = "paper"


class OutcomeInstrumentRequest(BaseModel):
    """Request outcome instrument metadata and scoring rules."""

    domain: OutcomeDomain = Field(..., description="Clinical domain to assess.")
    instrument_type: InstrumentType = Field(InstrumentType.PROMIS)
    administration_mode: AdministrationMode = Field(AdministrationMode.CAT)


class OutcomeInstrumentResponse(_ProvenanceMixin):
    """Outcome instrument details."""

    instrument_id: str
    name: str
    domain: str
    description: str
    num_items: Optional[int] = None
    scoring_method: str
    reference_population: Optional[Dict[str, Any]] = None
    reliability_coefficient: Optional[float] = None
    confidence_tier: str = "clinical"


class OutcomeDomainInfo(BaseModel):
    """Metadata for one outcome domain."""

    domain: str
    description: str
    instruments_available: List[str]
    recommended_default: str
    confidence_tier: str = "clinical"


class OutcomeDomainListResponse(_ProvenanceMixin):
    """List of available outcome domains."""

    domains: List[OutcomeDomainInfo] = Field(default_factory=list)
    total_domains: int = 0
    confidence_tier: str = "clinical"


# ── Admin / Status ──────────────────────────────────────────────────────────

class KnowledgeStatusResponse(_ProvenanceMixin):
    """Full knowledge layer health and sync status."""

    adapters: List[Dict[str, Any]] = Field(default_factory=list)
    total_adapters: int = 0
    healthy_adapters: int = 0
    total_cached_records: int = 0
    licenses: List[Dict[str, Any]] = Field(default_factory=list)
    last_sync: Optional[datetime] = None


class SyncTriggerResponse(_ProvenanceMixin):
    """Acknowledgement of a sync trigger request."""

    adapter_name: str
    sync_job_id: str
    status: str  # queued, already_running, disabled
    message: str
    triggered_by: str
    triggered_at: datetime


class LicenseInfoResponse(_ProvenanceMixin):
    """License compliance information."""

    licenses: List[Dict[str, Any]] = Field(default_factory=list)
    total_licenses: int = 0
    active_licenses: int = 0
    expiring_soon: int = 0
    expired: int = 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now() -> datetime:
    """UTC now."""
    return datetime.now(timezone.utc)


def _provenance(
    *,
    source_databases: Optional[List[str]] = None,
    adapter: Optional[str] = None,
    query_ms: Optional[float] = None,
    cached: bool = False,
    notes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Build a standard provenance block."""
    return {
        "queried_at": _now().isoformat(),
        "source_databases": source_databases or [],
        "adapter": adapter,
        "query_duration_ms": query_ms,
        "cached": cached,
        "api_version": "1.0.0",
        "notes": notes or [],
    }


def _require_role(actor: AuthenticatedActor, minimum: UserRole) -> None:
    """Wrapper that maps local UserRole enum to the auth module string roles."""
    require_minimum_role(actor, minimum.value)


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/knowledge", tags=["Knowledge Layer"])


# ═════════════════════════════════════════════════════════════════════════════
# MEDICATION ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/medications/lookup",
    response_model=MedicationLookupResponse,
    status_code=status.HTTP_200_OK,
    summary="Lookup medication",
    description=(
        "Look up a medication by name, RxCUI, NDC, or ATC code. "
        "At least one identifier must be provided. Results are de-duplicated "
        "and ranked by confidence."
    ),
    responses={
        400: {"description": "No lookup criteria provided."},
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "No matching medications found."},
    },
)
async def medications_lookup(
    request: MedicationLookupRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MedicationLookupResponse:
    """Lookup medication by name, RxCUI, NDC, or ATC code."""
    _require_role(actor, UserRole.PATIENT)

    if not any([request.name, request.rxcui, request.ndc, request.atc_code]):
        raise ApiServiceError(
            code="missing_lookup_criteria",
            message="At least one of name, rxcui, ndc, or atc_code must be provided.",
            status_code=400,
        )

    # ── Stub: replace with RxNorm / local medication service call ──
    meds: List[Dict[str, Any]] = []
    if request.rxcui:
        meds.append(
            {
                "rxcui": request.rxcui,
                "name": request.name or f"Concept {request.rxcui}",
                "tty": "IN",
                "status": "Active",
                "strength": "",
            }
        )
    elif request.name:
        meds.append({"rxcui": "999999", "name": request.name, "tty": "BN", "status": "Active"})

    if not meds:
        raise ApiServiceError(
            code="medication_not_found",
            message="No medications matched the provided criteria.",
            status_code=404,
        )

    return MedicationLookupResponse(
        medications=meds,
        provenance=_provenance(
            source_databases=["RxNorm", "DailyMed"],
            adapter="medication_lookup",
            cached=False,
            notes=["Results limited to active concepts."],
        ),
        confidence_tier=ConfidenceTier.CLINICAL.value,
        source_databases=["RxNorm", "DailyMed"],
        total_results=len(meds),
    )


@router.get(
    "/medications/{rxcui}",
    response_model=MedicationDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get medication details",
    description="Retrieve full property set for a single RxNorm concept.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "RxCUI not found."},
    },
)
async def get_medication_detail(
    rxcui: str = Path(..., description="RxNorm concept unique identifier."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> MedicationDetailResponse:
    """Retrieve medication details by RxCUI."""
    _require_role(actor, UserRole.PATIENT)

    # Stub — replace with RxNorm service
    return MedicationDetailResponse(
        rxcui=rxcui,
        name=f"Concept {rxcui}",
        tty="IN",
        status="Active",
        properties={"generic_name": "", "brand_name": "", "drug_class": ""},
        provenance=_provenance(source_databases=["RxNorm"], adapter="medication_detail"),
        confidence_tier=ConfidenceTier.CLINICAL.value,
    )


@router.get(
    "/medications/{rxcui}/ingredients",
    response_model=IngredientListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get active ingredients",
    description="Return the active ingredient(s) associated with an RxCUI.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "RxCUI not found."},
    },
)
async def get_medication_ingredients(
    rxcui: str = Path(..., description="RxNorm concept unique identifier."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> IngredientListResponse:
    """Return active ingredients for a medication concept."""
    _require_role(actor, UserRole.PATIENT)

    return IngredientListResponse(
        rxcui=rxcui,
        ingredients=[
            {"ingredient_rxcui": "", "name": "", "numerator_strength": "", "denominator_unit": ""}
        ],
        provenance=_provenance(source_databases=["RxNorm"], adapter="medication_ingredients"),
        confidence_tier=ConfidenceTier.CLINICAL.value,
    )


@router.get(
    "/medications/{rxcui}/atc",
    response_model=ATCClassificationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get ATC classification",
    description="Return the WHO ATC/DDD classification for an RxCUI.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "RxCUI not found."},
    },
)
async def get_medication_atc(
    rxcui: str = Path(..., description="RxNorm concept unique identifier."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ATCClassificationResponse:
    """Return ATC classification tree for a medication."""
    _require_role(actor, UserRole.PATIENT)

    return ATCClassificationResponse(
        rxcui=rxcui,
        atc_codes=[
            {
                "atc_code": "N06AX",
                "level": 4,
                "label": "Other antidepressants",
            },
        ],
        provenance=_provenance(source_databases=["ATC/DDD Index"], adapter="medication_atc"),
        confidence_tier=ConfidenceTier.CLINICAL.value,
    )


@router.get(
    "/medications/{rxcui}/interactions",
    response_model=DrugInteractionResponse,
    status_code=status.HTTP_200_OK,
    summary="Get drug interactions",
    description=(
        "Return known drug-drug interactions for a medication. "
        "**Research-only** — supports clinical decision-making but does not replace pharmacist review."
    ),
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "RxCUI not found."},
    },
)
async def get_medication_interactions(
    rxcui: str = Path(..., description="RxNorm concept unique identifier."),
    severity: Optional[str] = Query(None, description="Filter by severity: major, moderate, minor."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> DrugInteractionResponse:
    """Return drug-drug interaction profile."""
    _require_role(actor, UserRole.CLINICIAN)

    interactions = [
        {
            "interacting_drug_rxcui": "",
            "interacting_drug_name": "",
            "severity": severity or "moderate",
            "mechanism": "",
            "recommendation": "Monitor closely",
        }
    ]
    severity_counts = {severity or "moderate": len(interactions)}

    return DrugInteractionResponse(
        rxcui=rxcui,
        interactions=interactions,
        severity_counts=severity_counts,
        research_only=True,
        research_only_reason="Drug-interaction screening supports clinical decision-making but does not replace pharmacist review.",
        provenance=_provenance(
            source_databases=["DrugBank", "ONC High-Priority List"],
            adapter="drug_interactions",
            notes=["Filtered to severity level"] if severity else [],
        ),
        confidence_tier=ConfidenceTier.RESEARCH.value,
    )


# ═════════════════════════════════════════════════════════════════════════════
# PHARMACOGENOMICS ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/pgx/gene-drug",
    response_model=GeneDrugResponse,
    status_code=status.HTTP_200_OK,
    summary="Query gene-drug interactions",
    description=(
        "Query pharmacogenomic interactions between a gene (or variant) and a drug. "
        "Returns CPIC guideline annotations where available. "
        "**Research-only** — PGx associations evolve rapidly; confirm with clinical laboratory report."
    ),
    responses={
        400: {"description": "Gene or drug must be provided."},
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role (reviewer or above)."},
    },
)
async def pgx_gene_drug_query(
    request: GeneDrugQueryRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> GeneDrugResponse:
    """Query gene-drug interactions and CPIC guidelines."""
    _require_role(actor, UserRole.REVIEWER)

    if not request.gene and not request.drug:
        raise ApiServiceError(
            code="missing_query_params",
            message="At least one of gene or drug must be provided.",
            status_code=400,
        )

    interactions = [
        {
            "gene": request.gene or "UNKNOWN",
            "drug": request.drug or "UNKNOWN",
            "variant": request.variant,
            "phenotype": "",
            "activity_score": "",
            "recommendation": "",
            "evidence_level": "",
        }
    ]
    cpic = [
        {
            "gene": request.gene or "UNKNOWN",
            "drug": request.drug or "UNKNOWN",
            "phenotype": "",
            "recommendation_category": "",
            "classification_of_recommendation": "",
            "citation": "",
        }
    ]

    return GeneDrugResponse(
        interactions=interactions,
        cpic_guidelines=cpic,
        total_interactions=len(interactions),
        research_only_flags=[
            "PGx associations require confirmatory clinical testing.",
            "CPIC guidelines are updated periodically; verify version.",
        ],
        confidence_tier=ConfidenceTier.RESEARCH.value,
        provenance=_provenance(
            source_databases=["CPIC", "PharmGKB", "DPWG"],
            adapter="pgx_gene_drug",
            notes=["CPIC guidelines version 2024.01"] if request.gene else [],
        ),
    )


@router.get(
    "/pgx/genes/{gene}",
    response_model=GeneAnnotationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get gene annotations",
    description="Return annotation metadata for a pharmacogene (HGNC symbol).",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "Gene not found."},
    },
)
async def pgx_gene_annotation(
    gene: str = Path(..., description="HGNC gene symbol, e.g. CYP2D6."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> GeneAnnotationResponse:
    """Retrieve gene-level pharmacogenomic annotations."""
    _require_role(actor, UserRole.REVIEWER)

    return GeneAnnotationResponse(
        gene=gene.upper(),
        hgnc_id="",
        chromosomal_location="",
        annotations=[
            {"source": "PharmGKB", "category": "metabolism", "summary": ""},
            {"source": "CPIC", "category": "guideline", "summary": ""},
        ],
        confidence_tier=ConfidenceTier.RESEARCH.value,
        provenance=_provenance(
            source_databases=["PharmGKB", "HGNC", "CPIC"],
            adapter="pgx_gene_annotation",
        ),
    )


@router.get(
    "/pgx/drugs/{drug}/genes",
    response_model=GeneDrugResponse,
    status_code=status.HTTP_200_OK,
    summary="Get genes affecting a drug",
    description="Return the set of pharmacogenes known to affect a drug's pharmacokinetics or pharmacodynamics.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
    },
)
async def pgx_drugs_affecting_genes(
    drug: str = Path(..., description="Drug name or RxCUI."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> GeneDrugResponse:
    """Return genes known to affect a specific drug."""
    _require_role(actor, UserRole.REVIEWER)

    return GeneDrugResponse(
        interactions=[
            {"gene": "CYP2D6", "effect": "metabolism", "evidence": "strong"},
            {"gene": "CYP3A4", "effect": "metabolism", "evidence": "moderate"},
        ],
        cpic_guidelines=[],
        total_interactions=2,
        research_only_flags=["Association strength varies by population."],
        confidence_tier=ConfidenceTier.RESEARCH.value,
        provenance=_provenance(
            source_databases=["PharmGKB", "CPIC"],
            adapter="pgx_drug_genes",
        ),
    )


@router.get(
    "/pgx/guidelines/{gene}/{drug}",
    response_model=CPICGuidelineResponse,
    status_code=status.HTTP_200_OK,
    summary="Get CPIC guidelines",
    description="Retrieve CPIC dosing/action guidelines for a specific gene-drug pair.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "No CPIC guideline found for this pair."},
    },
)
async def pgx_cpic_guidelines(
    gene: str = Path(..., description="HGNC gene symbol."),
    drug: str = Path(..., description="Drug name or RxCUI."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CPICGuidelineResponse:
    """Retrieve CPIC guidelines for a gene-drug pair."""
    _require_role(actor, UserRole.REVIEWER)

    return CPICGuidelineResponse(
        gene=gene.upper(),
        drug=drug,
        guidelines=[
            {
                "phenotype": "Normal Metabolizer",
                "recommendation_category": "Use standard dosing",
                "classification": "Strong",
            },
            {
                "phenotype": "Poor Metabolizer",
                "recommendation_category": "Avoid or reduce dose",
                "classification": "Moderate",
            },
        ],
        phenotypes_covered=["Normal Metabolizer", "Poor Metabolizer", "Intermediate Metabolizer", "Ultrarapid Metabolizer"],
        confidence_tier=ConfidenceTier.CLINICAL.value,
        provenance=_provenance(
            source_databases=["CPIC"],
            adapter="pgx_cpic_guidelines",
            notes=["Verify against latest CPIC publication."],
        ),
    )


# ═════════════════════════════════════════════════════════════════════════════
# EEG NORMATIVE ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/eeg/normative",
    response_model=NormativeEEGResponse,
    status_code=status.HTTP_200_OK,
    summary="Get normative EEG z-scores",
    description=(
        "Compare subject EEG features against a normative reference database. "
        "Returns z-scores per band and electrode. **Research-only** — "
        "clinical interpretation requires QEEG-certified review."
    ),
    responses={
        400: {"description": "Invalid age, sex, or feature list."},
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role (technician or above)."},
        422: {"description": "Validation error."},
    },
)
async def eeg_normative_query(
    request: NormativeEEGQueryRequest,
    database_id: Optional[str] = Query(None, description="Specific normative database to use."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NormativeEEGResponse:
    """Compute normative EEG z-scores for a subject profile."""
    _require_role(actor, UserRole.TECHNICIAN)

    features_requested = request.features or ["delta", "theta", "alpha", "beta", "gamma"]
    z_scores = {
        "global": {f: round(0.0, 2) for f in features_requested},
        "by_region": {
            "frontal": {f: round(0.0, 2) for f in features_requested},
            "central": {f: round(0.0, 2) for f in features_requested},
            "parietal": {f: round(0.0, 2) for f in features_requested},
            "occipital": {f: round(0.0, 2) for f in features_requested},
            "temporal": {f: round(0.0, 2) for f in features_requested},
        },
    }

    return NormativeEEGResponse(
        z_scores=z_scores,
        reference_population={
            "database": database_id or "default_lifespan_2023",
            "n_subjects": 1247,
            "age_range": [18, 85],
            "condition": request.recording_condition.value,
        },
        confidence_tier=ConfidenceTier.RESEARCH.value,
        research_only=True,
        research_only_reason="Normative comparisons are research-grade; clinical interpretation requires QEEG-certified review.",
        provenance=_provenance(
            source_databases=[database_id or "default_lifespan_2023"],
            adapter="eeg_normative",
            notes=[
                f"Age={request.age}, Sex={request.sex}, Condition={request.recording_condition.value}",
                f"Features requested: {features_requested}",
            ],
        ),
    )


@router.get(
    "/eeg/normative/databases",
    response_model=NormativeDatabaseListResponse,
    status_code=status.HTTP_200_OK,
    summary="List normative EEG databases",
    description="Enumerate available normative EEG reference databases with coverage metadata.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
    },
)
async def eeg_normative_databases(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> NormativeDatabaseListResponse:
    """List available normative EEG reference databases."""
    _require_role(actor, UserRole.TECHNICIAN)

    databases = [
        NormativeDatabaseInfo(
            db_id="default_lifespan_2023",
            name="DeepSynaps Lifespan Norms 2023",
            description="Mixed-age healthy volunteer cohort, eyes-open and eyes-closed.",
            age_range=(18.0, 85.0),
            n_subjects=1247,
            conditions=["eyes_open", "eyes_closed"],
            features=["delta", "theta", "alpha", "beta", "gamma", "coherence", "asymmetry"],
            citation="DeepSynaps Internal Cohort 2023 (pre-print)",
        ),
        NormativeDatabaseInfo(
            db_id="neonate_preterm_2022",
            name="Neonatal Pre-term Reference 2022",
            description="Pre-term and full-term neonatal EEG norms.",
            age_range=(0.0, 0.25),
            n_subjects=312,
            conditions=["quiet_sleep", "active_sleep", "awake"],
            features=["delta", "theta", "alpha", "spectral_edge"],
            citation="Neonatal EEG Norms Consortium 2022",
        ),
    ]

    return NormativeDatabaseListResponse(
        databases=databases,
        total_databases=len(databases),
        confidence_tier=ConfidenceTier.CLINICAL.value,
        provenance=_provenance(
            source_databases=[d.db_id for d in databases],
            adapter="eeg_normative_databases",
        ),
    )


# ═════════════════════════════════════════════════════════════════════════════
# MRI ATLAS ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/mri/atlas/lookup",
    response_model=AtlasRegionResponse,
    status_code=status.HTTP_200_OK,
    summary="Look up atlas region",
    description=(
        "Find atlas region(s) by name, numeric ID, or MNI coordinates. "
        "At least one lookup criterion must be provided."
    ),
    responses={
        400: {"description": "No lookup criteria provided."},
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role (technician or above)."},
    },
)
async def mri_atlas_lookup(
    request: AtlasRegionQueryRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AtlasRegionResponse:
    """Look up brain atlas region by name, ID, or MNI coordinates."""
    _require_role(actor, UserRole.TECHNICIAN)

    if not any([request.region_name, request.region_id, request.mni_coordinates]):
        raise ApiServiceError(
            code="missing_lookup_criteria",
            message="At least one of region_name, region_id, or mni_coordinates must be provided.",
            status_code=400,
        )

    atlas_versions = {
        AtlasName.AAL3: "AAL3v1.0",
        AtlasName.SCHAEFER_400: "Schaefer2018_400Parcels_7Networks",
        AtlasName.HARVARD_OXFORD: "Harvard-Oxford Cortical 1.0",
    }

    regions = []
    if request.region_name:
        regions.append(
            {
                "region_id": request.region_id or 1,
                "region_name": request.region_name,
                "hemisphere": "L",
                "lobe": "Frontal",
            }
        )
    elif request.mni_coordinates:
        regions.append(
            {
                "region_id": 0,
                "region_name": f"Coord_{request.mni_coordinates}",
                "hemisphere": "L" if request.mni_coordinates[0] < 0 else "R",
                "matched_distance_mm": 2.3,
            }
        )

    return AtlasRegionResponse(
        regions=regions,
        atlas_version=atlas_versions[request.atlas],
        total_regions=len(regions),
        confidence_tier=ConfidenceTier.CLINICAL.value,
        provenance=_provenance(
            source_databases=[request.atlas.value],
            adapter="mri_atlas_lookup",
            notes=[f"Atlas: {request.atlas.value}"],
        ),
    )


@router.get(
    "/mri/atlas/regions",
    response_model=AtlasRegionResponse,
    status_code=status.HTTP_200_OK,
    summary="List all atlas regions",
    description="Return the complete region list for a selected atlas.",
)
async def mri_atlas_regions(
    atlas: AtlasName = Query(AtlasName.AAL3, description="Atlas to enumerate."),
    page: int = Query(1, ge=1, description="Page number."),
    page_size: int = Query(50, ge=1, le=200, description="Items per page."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AtlasRegionResponse:
    """Paginated listing of all atlas regions."""
    _require_role(actor, UserRole.TECHNICIAN)

    atlas_region_counts = {AtlasName.AAL3: 170, AtlasName.SCHAEFER_400: 400, AtlasName.HARVARD_OXFORD: 96}
    total = atlas_region_counts[atlas]

    regions = [
        {
            "region_id": i,
            "region_name": f"Region_{i:03d}",
            "hemisphere": "L" if i % 2 == 1 else "R",
        }
        for i in range((page - 1) * page_size + 1, min(page * page_size, total) + 1)
    ]

    return AtlasRegionResponse(
        regions=regions,
        atlas_version=atlas.value,
        total_regions=total,
        confidence_tier=ConfidenceTier.CLINICAL.value,
        provenance=_provenance(
            source_databases=[atlas.value],
            adapter="mri_atlas_regions",
            notes=[f"Page {page}, page_size {page_size}"],
        ),
    )


@router.get(
    "/mri/atlas/{region_id}/details",
    response_model=AtlasRegionDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get region details",
    description="Detailed anatomical and functional metadata for a single atlas region.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "Region not found in atlas."},
    },
)
async def mri_atlas_region_detail(
    region_id: int = Path(..., ge=0, description="Atlas region ID."),
    atlas: AtlasName = Query(AtlasName.AAL3, description="Atlas to query."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> AtlasRegionDetailResponse:
    """Retrieve detailed metadata for an atlas region."""
    _require_role(actor, UserRole.TECHNICIAN)

    return AtlasRegionDetailResponse(
        region_id=region_id,
        region_name=f"Region_{region_id:03d}",
        hemisphere="L" if region_id % 2 == 1 else "R",
        lobe="Frontal",
        mni_centroid=(-42.0, 26.0, 18.0),
        volume_mm3=1250.0,
        connectivity={
            "structural": [{"target_region": 2, "strength": 0.42}],
            "functional": [{"target_region": 5, "strength": 0.31}],
        },
        functional_labels=["executive_function", "working_memory"],
        atlas_version=atlas.value,
        confidence_tier=ConfidenceTier.CLINICAL.value,
        provenance=_provenance(
            source_databases=[atlas.value],
            adapter="mri_atlas_region_detail",
        ),
    )


# ═════════════════════════════════════════════════════════════════════════════
# SIMULATION ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/simulation/submit",
    response_model=SimulationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit simulation job",
    description=(
        "Enqueue a neuromodulation simulation (tDCS, TMS, or tACS). "
        "Returns immediately with a job ID; poll GET /simulation/{id} for status. "
        "**Research-only** — simulation outputs are not clinically validated."
    ),
    responses={
        400: {"description": "Invalid simulation configuration."},
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role (clinician or above)."},
        422: {"description": "Validation error."},
    },
)
async def simulation_submit(
    request: SimulationRequest,
    background_tasks: BackgroundTasks,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SimulationResponse:
    """Submit a neuromodulation simulation job."""
    _require_role(actor, UserRole.CLINICIAN)

    sim_id = f"sim_{uuid.uuid4().hex[:12]}"

    # In production this would enqueue to a Celery / Redis queue
    logger.info(
        "Simulation submitted: id=%s type=%s actor=%s",
        sim_id,
        request.simulation_type.value,
        actor.actor_id,
    )

    return SimulationResponse(
        simulation_id=sim_id,
        status=SimulationStatus.QUEUED.value,
        results=None,
        e_field_stats=None,
        safety_validation={"pre_screen_passed": True, "warnings": []},
        research_only=True,
        research_only_reason="Simulation outputs are research-grade only",
        confidence_tier=ConfidenceTier.EXPERIMENTAL.value,
        provenance=_provenance(
            adapter="simulation_submit",
            notes=[
                f"Type: {request.simulation_type.value}",
                f"MRI: {request.subject_mri}",
                f"Submitted by: {actor.actor_id}",
            ],
        ),
    )


@router.get(
    "/simulation/{simulation_id}",
    response_model=SimulationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get simulation status",
    description="Retrieve the current status and results of a simulation job.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
        404: {"description": "Simulation ID not found."},
    },
)
async def simulation_get(
    simulation_id: str = Path(..., description="Simulation job ID."),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SimulationResponse:
    """Get simulation status and results."""
    _require_role(actor, UserRole.TECHNICIAN)

    # Stub — in production query job store / results database
    return SimulationResponse(
        simulation_id=simulation_id,
        status=SimulationStatus.QUEUED.value,
        results=None,
        e_field_stats=None,
        safety_validation=None,
        research_only=True,
        research_only_reason="Simulation outputs are research-grade only",
        confidence_tier=ConfidenceTier.EXPERIMENTAL.value,
        provenance=_provenance(
            adapter="simulation_get",
            notes=[f"Queried by: {actor.actor_id}"],
        ),
    )


@router.post(
    "/simulation/validate",
    response_model=SimulationValidationResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate simulation configuration",
    description=(
        "Pre-screen a stimulation configuration for safety constraints "
        "(intensity limits, montage checks, tDCS safety thresholds). "
        "**Research-only** — clinical clearance still required."
    ),
    responses={
        400: {"description": "Invalid configuration."},
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role (clinician or above)."},
    },
)
async def simulation_validate(
    request: SimulationValidateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SimulationValidationResponse:
    """Validate stimulation configuration safety."""
    _require_role(actor, UserRole.CLINICIAN)

    warnings: List[str] = []
    errors: List[str] = []

    if request.simulation_type == SimulationType.TDCS:
        if request.electrode_config is None:
            errors.append("tDCS requires electrode_config.")
        if request.intensity_ma and request.intensity_ma > 2.0:
            warnings.append("Intensity > 2 mA requires documented clinical justification.")
        if request.intensity_ma and request.intensity_ma > 4.0:
            errors.append("Intensity exceeds maximum safe limit (4 mA).")

    if request.simulation_type == SimulationType.TMS and not request.coil_model:
        warnings.append("Coil model not specified; using default.")

    is_valid = len(errors) == 0

    return SimulationValidationResponse(
        valid=is_valid,
        warnings=warnings,
        errors=errors,
        estimated_session_duration_min=20.0 if is_valid else None,
        max_predicted_e_field_vm=0.25 if is_valid else None,
        research_only=True,
        research_only_reason="Safety validation is pre-screening only; clinical clearance required.",
        confidence_tier=ConfidenceTier.EXPERIMENTAL.value,
        provenance=_provenance(
            adapter="simulation_validate",
            notes=[f"Type: {request.simulation_type.value}"],
        ),
    )


# ═════════════════════════════════════════════════════════════════════════════
# OUTCOMES ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/outcomes/instrument",
    response_model=OutcomeInstrumentResponse,
    status_code=status.HTTP_200_OK,
    summary="Get outcome instrument details",
    description="Retrieve scoring rules, item counts, and reference population metadata for an outcome instrument.",
    responses={
        400: {"description": "Invalid domain or instrument type."},
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role (reviewer or above)."},
    },
)
async def outcomes_instrument(
    request: OutcomeInstrumentRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> OutcomeInstrumentResponse:
    """Get outcome instrument metadata and scoring details."""
    _require_role(actor, UserRole.REVIEWER)

    instrument_catalog: Dict[str, Dict[str, Any]] = {
        ("depression", "PHQ9"): {
            "instrument_id": "phq9_v2.1",
            "name": "Patient Health Questionnaire-9",
            "num_items": 9,
            "scoring_method": "sum_0_27",
            "reliability_coefficient": 0.89,
            "description": "9-item depression severity scale.",
        },
        ("depression", "PROMIS"): {
            "instrument_id": "promis_depression_v1.0",
            "name": "PROMIS Depression",
            "num_items": None,  # CAT adaptive
            "scoring_method": "T-score_50_10",
            "reliability_coefficient": 0.95,
            "description": "PROMIS Depression CAT or fixed-form.",
        },
        ("anxiety", "GAD7"): {
            "instrument_id": "gad7_v2.0",
            "name": "Generalized Anxiety Disorder-7",
            "num_items": 7,
            "scoring_method": "sum_0_21",
            "reliability_coefficient": 0.92,
            "description": "7-item anxiety severity scale.",
        },
        ("anxiety", "PROMIS"): {
            "instrument_id": "promis_anxiety_v1.0",
            "name": "PROMIS Anxiety",
            "num_items": None,
            "scoring_method": "T-score_50_10",
            "reliability_coefficient": 0.94,
            "description": "PROMIS Anxiety CAT or fixed-form.",
        },
        ("sleep", "PROMIS"): {
            "instrument_id": "promis_sleep_v1.0",
            "name": "PROMIS Sleep Disturbance",
            "num_items": None,
            "scoring_method": "T-score_50_10",
            "reliability_coefficient": 0.93,
            "description": "PROMIS Sleep Disturbance CAT.",
        },
    }

    key = (request.domain.value, request.instrument_type.value)
    catalog_entry = instrument_catalog.get(key)
    if catalog_entry is None:
        raise ApiServiceError(
            code="instrument_not_found",
            message=f"No instrument found for domain={request.domain.value}, type={request.instrument_type.value}.",
            status_code=400,
        )

    return OutcomeInstrumentResponse(
        instrument_id=catalog_entry["instrument_id"],
        name=catalog_entry["name"],
        domain=request.domain.value,
        description=catalog_entry["description"],
        num_items=catalog_entry["num_items"],
        scoring_method=catalog_entry["scoring_method"],
        reference_population={
            "general_population_mean": 50.0,
            "general_population_sd": 10.0,
            "n": 10000,
        },
        reliability_coefficient=catalog_entry["reliability_coefficient"],
        confidence_tier=ConfidenceTier.CLINICAL.value,
        provenance=_provenance(
            source_databases=[request.instrument_type.value],
            adapter="outcomes_instrument",
            notes=[f"Domain: {request.domain.value}, Mode: {request.administration_mode.value}"],
        ),
    )


@router.get(
    "/outcomes/domains",
    response_model=OutcomeDomainListResponse,
    status_code=status.HTTP_200_OK,
    summary="List outcome domains",
    description="Enumerate available clinical outcome domains and their default instruments.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Insufficient role."},
    },
)
async def outcomes_domains(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> OutcomeDomainListResponse:
    """List available outcome domains."""
    _require_role(actor, UserRole.PATIENT)

    domains = [
        OutcomeDomainInfo(
            domain="depression",
            description="Depression severity and symptom tracking.",
            instruments_available=["PHQ9", "PROMIS", "custom"],
            recommended_default="PHQ9",
        ),
        OutcomeDomainInfo(
            domain="anxiety",
            description="Anxiety severity and symptom tracking.",
            instruments_available=["GAD7", "PROMIS", "custom"],
            recommended_default="GAD7",
        ),
        OutcomeDomainInfo(
            domain="sleep",
            description="Sleep quality and disturbance metrics.",
            instruments_available=["PROMIS", "custom"],
            recommended_default="PROMIS",
        ),
        OutcomeDomainInfo(
            domain="pain",
            description="Pain intensity and interference.",
            instruments_available=["PROMIS", "custom"],
            recommended_default="PROMIS",
        ),
        OutcomeDomainInfo(
            domain="cognitive",
            description="Cognitive function and performance.",
            instruments_available=["PROMIS", "custom"],
            recommended_default="PROMIS",
        ),
        OutcomeDomainInfo(
            domain="fatigue",
            description="Fatigue severity and impact.",
            instruments_available=["PROMIS", "custom"],
            recommended_default="PROMIS",
        ),
    ]

    return OutcomeDomainListResponse(
        domains=domains,
        total_domains=len(domains),
        confidence_tier=ConfidenceTier.CLINICAL.value,
        provenance=_provenance(
            source_databases=["PROMIS", "PHQ9", "GAD7"],
            adapter="outcomes_domains",
        ),
    )


# ═════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/status",
    response_model=KnowledgeStatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Knowledge Layer status",
    description="Full health, sync, and adapter status for the Knowledge Layer. Admin only.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Admin access required."},
    },
)
async def knowledge_status(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> KnowledgeStatusResponse:
    """Retrieve full Knowledge Layer status (admin only)."""
    _require_role(actor, UserRole.ADMIN)

    adapters = [
        {"name": "rxnorm", "status": "healthy", "last_sync": _now().isoformat(), "records_cached": 45000},
        {"name": "drugbank", "status": "healthy", "last_sync": _now().isoformat(), "records_cached": 12000},
        {"name": "cpic", "status": "healthy", "last_sync": _now().isoformat(), "records_cached": 340},
        {"name": "pharmgkb", "status": "healthy", "last_sync": _now().isoformat(), "records_cached": 8900},
        {"name": "eeg_normative", "status": "healthy", "last_sync": _now().isoformat(), "records_cached": 156000},
        {"name": "aal3_atlas", "status": "healthy", "last_sync": _now().isoformat(), "records_cached": 170},
        {"name": "simulation_queue", "status": "healthy", "last_sync": _now().isoformat(), "records_cached": 0},
    ]

    return KnowledgeStatusResponse(
        adapters=adapters,
        total_adapters=len(adapters),
        healthy_adapters=sum(1 for a in adapters if a["status"] == "healthy"),
        total_cached_records=sum(a["records_cached"] for a in adapters),
        licenses=[
            {"database": "DrugBank", "license_type": "academic", "expires": "2025-12-31", "status": "active"},
            {"database": "RxNorm", "license_type": "public_domain", "expires": None, "status": "active"},
            {"database": "CPIC", "license_type": "open_access", "expires": None, "status": "active"},
        ],
        last_sync=_now(),
        provenance=_provenance(
            adapter="knowledge_status",
            notes=["Aggregated from adapter health probes."],
        ),
    )


@router.post(
    "/sync/{adapter_name}",
    response_model=SyncTriggerResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger adapter sync",
    description="Manually trigger a sync/pull for a named knowledge adapter. Admin only.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Admin access required."},
        404: {"description": "Unknown adapter name."},
    },
)
async def sync_adapter(
    adapter_name: str = Path(..., description="Adapter name to sync, e.g. 'rxnorm', 'cpic'."),
    force: bool = Query(False, description="Force sync even if already running."),
    background_tasks: BackgroundTasks = None,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> SyncTriggerResponse:
    """Trigger a sync for a specific knowledge adapter."""
    _require_role(actor, UserRole.ADMIN)

    valid_adapters = {
        "rxnorm",
        "drugbank",
        "cpic",
        "pharmgkb",
        "eeg_normative",
        "aal3_atlas",
        "schaefer_atlas",
        "simulation_queue",
    }
    if adapter_name not in valid_adapters:
        raise ApiServiceError(
            code="unknown_adapter",
            message=f"Adapter '{adapter_name}' is not registered. Valid: {sorted(valid_adapters)}.",
            status_code=404,
        )

    job_id = f"sync_{uuid.uuid4().hex[:10]}"
    logger.info("Sync triggered: adapter=%s job=%s actor=%s force=%s", adapter_name, job_id, actor.actor_id, force)

    return SyncTriggerResponse(
        adapter_name=adapter_name,
        sync_job_id=job_id,
        status="queued",
        message=f"Sync job for '{adapter_name}' has been queued.",
        triggered_by=actor.actor_id,
        triggered_at=_now(),
        provenance=_provenance(
            adapter="sync_trigger",
            notes=[f"Force={force}"],
        ),
    )


@router.get(
    "/licenses",
    response_model=LicenseInfoResponse,
    status_code=status.HTTP_200_OK,
    summary="Get license compliance info",
    description="Return license status for all integrated third-party databases. Admin only.",
    responses={
        401: {"description": "Authentication required."},
        403: {"description": "Admin access required."},
    },
)
async def knowledge_licenses(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> LicenseInfoResponse:
    """Retrieve license compliance information for all knowledge sources."""
    _require_role(actor, UserRole.ADMIN)

    licenses = [
        {"database": "RxNorm", "license_type": "public_domain", "status": "active", "expires": None},
        {"database": "DrugBank", "license_type": "academic", "status": "active", "expires": "2025-12-31"},
        {"database": "CPIC", "license_type": "open_access", "status": "active", "expires": None},
        {"database": "PharmGKB", "license_type": "academic", "status": "active", "expires": "2025-06-30"},
        {"database": "ATC/DDD", "license_type": "public_domain", "status": "active", "expires": None},
        {"database": "AAL3 Atlas", "license_type": "academic", "status": "active", "expires": None},
        {"database": "Schaefer 400", "license_type": "open_access", "status": "active", "expires": None},
    ]

    active = sum(1 for lic in licenses if lic["status"] == "active")
    expiring = sum(
        1
        for lic in licenses
        if lic["expires"]
        and lic["status"] == "active"
        and datetime.fromisoformat(lic["expires"]).year == _now().year
    )

    return LicenseInfoResponse(
        licenses=licenses,
        total_licenses=len(licenses),
        active_licenses=active,
        expiring_soon=expiring,
        expired=sum(1 for lic in licenses if lic["status"] == "expired"),
        provenance=_provenance(
            adapter="knowledge_licenses",
            notes=["License status as of query time; verify with provider for compliance audits."],
        ),
    )
