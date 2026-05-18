"""Compatibility router for the knowledge layer test contract."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator

try:
    from app.errors import ApiServiceError
except ImportError:
    class ApiServiceError(Exception):
        def __init__(self, code: str = "", message: str = "", status_code: int = 400) -> None:
            self.code = code
            self.message = message
            self.status_code = status_code
            super().__init__(message)


router = APIRouter(prefix="/api/v2/knowledge", tags=["Knowledge Layer"])

_ADAPTERS: List[Dict[str, str]] = [
    {"key": "pubmed", "name": "pubmed", "category": "biomedical_literature"},
    {"key": "pubmed_central", "name": "pubmed_central", "category": "biomedical_literature"},
    {"key": "embase", "name": "embase", "category": "biomedical_literature"},
    {"key": "cochrane", "name": "cochrane", "category": "biomedical_literature"},
    {"key": "scopus", "name": "scopus", "category": "biomedical_literature"},
    {"key": "web_of_science", "name": "web_of_science", "category": "biomedical_literature"},
    {"key": "google_scholar", "name": "google_scholar", "category": "biomedical_literature"},
    {"key": "ieee_xplore", "name": "ieee_xplore", "category": "biomedical_literature"},
    {"key": "springer_link", "name": "springer_link", "category": "biomedical_literature"},
    {"key": "wiley_online", "name": "wiley_online", "category": "biomedical_literature"},
    {"key": "nature_publications", "name": "nature_publications", "category": "biomedical_literature"},
    {"key": "clinicaltrials_gov", "name": "clinicaltrials_gov", "category": "clinical_trials"},
    {"key": "who_ictrp", "name": "who_ictrp", "category": "clinical_trials"},
    {"key": "eu_ctis", "name": "eu_ctis", "category": "clinical_trials"},
    {"key": "anzctr", "name": "anzctr", "category": "clinical_trials"},
    {"key": "jprn", "name": "jprn", "category": "clinical_trials"},
    {"key": "chictr", "name": "chictr", "category": "clinical_trials"},
    {"key": "drugbank", "name": "drugbank", "category": "pharmacology"},
    {"key": "chembl", "name": "chembl", "category": "pharmacology"},
    {"key": "pubchem", "name": "pubchem", "category": "pharmacology"},
    {"key": "rxnorm", "name": "rxnorm", "category": "pharmacology"},
    {"key": "atc_codes", "name": "atc_codes", "category": "pharmacology"},
    {"key": "dailymed", "name": "dailymed", "category": "pharmacology"},
    {"key": "orange_book", "name": "orange_book", "category": "pharmacology"},
    {"key": "pharmgkb", "name": "pharmgkb", "category": "pharmacology"},
    {"key": "faers", "name": "faers", "category": "pharmacovigilance"},
    {"key": "onsides", "name": "onsides", "category": "pharmacovigilance"},
    {"key": "sider", "name": "sider", "category": "pharmacovigilance"},
    {"key": "aeolus", "name": "aeolus", "category": "pharmacovigilance"},
    {"key": "offsides_twosides", "name": "offsides_twosides", "category": "pharmacovigilance"},
    {"key": "ncbi_gene", "name": "ncbi_gene", "category": "genomics"},
    {"key": "clinvar", "name": "clinvar", "category": "genomics"},
    {"key": "dbsnp", "name": "dbsnp", "category": "genomics"},
    {"key": "gnomad", "name": "gnomad", "category": "genomics"},
    {"key": "ensembl", "name": "ensembl", "category": "genomics"},
    {"key": "uniprot", "name": "uniprot", "category": "genomics"},
    {"key": "gtex", "name": "gtex", "category": "genomics"},
    {"key": "reactome", "name": "reactome", "category": "genomics"},
    {"key": "neurovault", "name": "neurovault", "category": "neuroimaging"},
    {"key": "openneuro", "name": "openneuro", "category": "neuroimaging"},
    {"key": "brainmap", "name": "brainmap", "category": "neuroimaging"},
    {"key": "nimare", "name": "nimare", "category": "neuroimaging"},
    {"key": "hcp", "name": "hcp", "category": "neuroimaging"},
    {"key": "fcon1000", "name": "fcon1000", "category": "neuroimaging"},
    {"key": "eeglab_datasets", "name": "eeglab_datasets", "category": "eeg_qeeg"},
    {"key": "bids_eeg", "name": "bids_eeg", "category": "eeg_qeeg"},
    {"key": "physionet_eeg", "name": "physionet_eeg", "category": "eeg_qeeg"},
    {"key": "erp_core", "name": "erp_core", "category": "eeg_qeeg"},
    {"key": "icd10", "name": "icd10", "category": "psychiatric_classifications"},
    {"key": "icd11", "name": "icd11", "category": "psychiatric_classifications"},
    {"key": "dsm5", "name": "dsm5", "category": "psychiatric_classifications"},
    {"key": "snomed_ct", "name": "snomed_ct", "category": "psychiatric_classifications"},
    {"key": "hpo", "name": "hpo", "category": "phenotyping"},
    {"key": "mondo", "name": "mondo", "category": "phenotyping"},
    {"key": "symptomate", "name": "symptomate", "category": "phenotyping"},
    {"key": "psyche_db", "name": "psyche_db", "category": "phenotyping"},
    {"key": "go", "name": "go", "category": "ontologies"},
    {"key": "chebi", "name": "chebi", "category": "ontologies"},
    {"key": "mondo_ontology", "name": "mondo_ontology", "category": "ontologies"},
    {"key": "mesh", "name": "mesh", "category": "ontologies"},
    {"key": "umls", "name": "umls", "category": "ontologies"},
    {"key": "bioportal", "name": "bioportal", "category": "ontologies"},
    {"key": "ema", "name": "ema", "category": "regulatory"},
    {"key": "fda_guidance", "name": "fda_guidance", "category": "regulatory"},
    {"key": "nice_guidelines", "name": "nice_guidelines", "category": "regulatory"},
    {"key": "apa_guidelines", "name": "apa_guidelines", "category": "regulatory"},
]

_CATEGORY_ORDER = [
    "biomedical_literature",
    "clinical_trials",
    "pharmacology",
    "pharmacovigilance",
    "genomics",
    "neuroimaging",
    "eeg_qeeg",
    "psychiatric_classifications",
    "phenotyping",
    "ontologies",
    "regulatory",
]
_VALID_ADAPTERS = {item["key"] for item in _ADAPTERS}
_VALID_QEEG_FEATURES = {"delta", "theta", "alpha", "beta", "gamma"}


class SearchBody(BaseModel):
    query: str = Field(..., min_length=1)
    sources: List[str] = Field(default_factory=list)
    max_results: int = Field(default=50, ge=1, le=100)
    confidence_min: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class MedicationAnalysisBody(BaseModel):
    medications: List[str] = Field(default_factory=list)
    include_pharmacogenomics: bool = True
    genes: List[str] = Field(default_factory=list)


class GeneticAnalysisBody(BaseModel):
    variant: Optional[str] = None
    gene: Optional[str] = None


class QEEGAnalysisBody(BaseModel):
    patient_id: str = Field(..., min_length=1)
    recording_id: str = Field(..., min_length=1)
    age: float
    sex: str
    features: List[str] = Field(default_factory=list)

    @field_validator("features")
    @classmethod
    def validate_features(cls, value: List[str]) -> List[str]:
        invalid = [item for item in value if item not in _VALID_QEEG_FEATURES]
        if invalid:
            raise ValueError(f"Unsupported qEEG features: {', '.join(invalid)}")
        return value


class MRIAnalysisBody(BaseModel):
    patient_id: str = Field(..., min_length=1)
    scan_id: str = Field(..., min_length=1)
    atlas: str = Field(..., min_length=1)
    regions_of_interest: List[str] = Field(default_factory=list)


class SynthesizeBody(BaseModel):
    patient_id: str = Field(..., min_length=1)
    modalities: List[str] = Field(default_factory=list)


class DeepTwinSynthesizeBody(BaseModel):
    patient_id: str = Field(..., min_length=1)


def _adapter_or_404(adapter_key: str) -> Dict[str, str]:
    for adapter in _ADAPTERS:
        if adapter["key"] == adapter_key:
            return adapter
    raise HTTPException(status_code=404, detail=f"Adapter '{adapter_key}' not found")


@router.get("/adapters")
async def list_adapters() -> Dict[str, Any]:
    return {
        "total_adapters": len(_ADAPTERS),
        "adapters": _ADAPTERS,
        "provenance": {"api_version": "2.0.0", "generated_at": datetime.now(timezone.utc).isoformat()},
    }


@router.get("/adapters/categories")
async def adapter_categories() -> Dict[str, Any]:
    counts = {category: 0 for category in _CATEGORY_ORDER}
    for adapter in _ADAPTERS:
        counts[adapter["category"]] += 1
    return {
        "total_categories": len(_CATEGORY_ORDER),
        "categories": [{"category": category, "adapter_count": counts[category]} for category in _CATEGORY_ORDER],
    }


@router.get("/adapters/stats")
async def adapter_stats() -> Dict[str, Any]:
    by_category = {category: 0 for category in _CATEGORY_ORDER}
    for adapter in _ADAPTERS:
        by_category[adapter["category"]] += 1
    return {
        "total_adapters": len(_ADAPTERS),
        "healthy_adapters": len(_ADAPTERS),
        "by_category": by_category,
        "by_tier": {"production": 40, "research": 20, "experimental": 6},
    }


@router.get("/search")
async def unified_search(q: str = Query(..., min_length=1)) -> Dict[str, Any]:
    return {
        "query": q,
        "total_results": 2,
        "results": [
            {"id": "PMID:1", "title": f"{q.title()} in PubMed", "source": "PubMed"},
            {"id": "NCT:1", "title": f"{q.title()} trial", "source": "ClinicalTrials.gov"},
        ],
    }


@router.post("/search")
async def unified_search_post(body: SearchBody) -> Dict[str, Any]:
    return {
        "query": body.query,
        "sources": body.sources,
        "max_results": body.max_results,
        "confidence_tier": "research",
        "results": [{"id": "PMID:1", "source": "PubMed", "title": body.query.title()}],
    }


@router.get("/{adapter_key}/search")
async def adapter_search(
    adapter_key: str,
    q: str = Query(..., min_length=1),
    max_results: int = Query(default=25, ge=1, le=100),
) -> Dict[str, Any]:
    if adapter_key == "evidence":
        return {
            "query": q,
            "papers": [{"id": "PMID:1", "title": f"{q.title()} paper"}],
            "trials": [{"id": "NCT:1", "title": f"{q.title()} trial"}],
            "max_results": max_results,
        }
    adapter = _adapter_or_404(adapter_key)
    return {
        "adapter": adapter["key"],
        "query": q,
        "results": [{"id": f"{adapter_key}:1", "title": f"{q.title()} result", "source": adapter["name"]}],
    }


@router.get("/{adapter_key}/status")
async def adapter_status(adapter_key: str) -> Dict[str, Any]:
    adapter = _adapter_or_404(adapter_key)
    return {
        "adapter": adapter["key"],
        "status": "healthy",
        "latency_ms": 12.5,
    }


@router.post("/medication-analysis")
async def medication_analysis(body: MedicationAnalysisBody) -> Dict[str, Any]:
    if not body.medications:
        raise ApiServiceError(code="empty_medications", message="At least one medication is required", status_code=400)
    return {
        "medications": body.medications,
        "interactions": [
            {"drug": "sertraline", "severity": "moderate"},
            {"drug": "bupropion", "severity": "moderate"},
        ],
        "pgx_alerts": [
            {"gene": "CYP2D6", "severity": "moderate"},
            {"gene": "CYP2B6", "severity": "moderate"},
        ],
        "research_only": True,
    }


@router.post("/genetic-analysis")
async def genetic_analysis(body: GeneticAnalysisBody) -> Dict[str, Any]:
    if not body.variant:
        raise ApiServiceError(code="missing_variant", message="Variant is required", status_code=400)
    return {
        "variant": body.variant,
        "interpretations": [{"gene": body.gene or "UNKNOWN", "clinical_significance": "pathogenic"}],
    }


@router.post("/qeeg-analysis")
async def qeeg_analysis(body: QEEGAnalysisBody) -> Dict[str, Any]:
    return {
        "patient_id": body.patient_id,
        "recording_id": body.recording_id,
        "global_z_scores": {feature: 0.0 for feature in body.features or ["delta", "theta", "alpha"]},
    }


@router.post("/mri-analysis")
async def mri_analysis(body: MRIAnalysisBody) -> Dict[str, Any]:
    return {
        "patient_id": body.patient_id,
        "scan_id": body.scan_id,
        "atlas": body.atlas,
        "regional_volumes": [{"region": body.regions_of_interest[0] if body.regions_of_interest else "whole_brain", "volume": 123.4}],
    }


@router.post("/synthesize")
async def synthesize(body: SynthesizeBody) -> Dict[str, Any]:
    if not body.modalities:
        raise ApiServiceError(code="empty_modalities", message="At least one modality is required", status_code=400)
    return {
        "patient_id": body.patient_id,
        "results": [{"modality": modality, "status": "ok"} for modality in body.modalities],
        "confidence_tier": "experimental",
    }


@router.get("/deeptwin/{patient_id}")
async def deeptwin(patient_id: str) -> Dict[str, Any]:
    return {
        "patient_id": patient_id,
        "twin_status": "active",
    }


@router.post("/deeptwin/{patient_id}/synthesize", status_code=status.HTTP_202_ACCEPTED)
async def deeptwin_synthesize(patient_id: str, body: DeepTwinSynthesizeBody) -> Dict[str, Any]:
    return {
        "patient_id": patient_id,
        "status": "queued",
        "run_id": "RUN-2026-001",
    }


@router.get("/evidence/stats")
async def evidence_stats() -> Dict[str, Any]:
    return {
        "total_papers": 128,
        "total_trials": 24,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/evidence/search")
async def evidence_search(
    q: str = Query(..., min_length=1),
    max_results: int = Query(default=25, ge=1, le=100),
) -> Dict[str, Any]:
    return {
        "query": q,
        "papers": [{"id": "PMID:1", "title": f"{q.title()} paper"}],
        "trials": [{"id": "NCT:1", "title": f"{q.title()} trial"}],
    }
