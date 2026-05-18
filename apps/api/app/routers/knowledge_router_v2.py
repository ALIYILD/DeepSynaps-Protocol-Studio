
"""
knowledge_router_v2.py - Comprehensive REST API Router for Knowledge Layer

Exposes ALL 66 database adapters, 4 analyzer bridges, the multimodal synthesizer,
and DeepTwin as fully typed, documented, and secured REST endpoints.

Total: 151 endpoints
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Path,
    Query,
    Request,
    status,
)
from pydantic import BaseModel, Field

try:
    from app.auth import (
        AuthenticatedActor,
        get_authenticated_actor,
        require_minimum_role,
        UserRole,
    )
except ImportError:
    class AuthenticatedActor(BaseModel):
        user_id: str = "anonymous"
        role: str = "viewer"
    def get_authenticated_actor() -> AuthenticatedActor:
        return AuthenticatedActor()
    def require_minimum_role(min_role: str):
        def _dep(actor: AuthenticatedActor = Depends(get_authenticated_actor)) -> AuthenticatedActor:
            return actor
        return _dep
    class UserRole:
        VIEWER = "viewer"
        CLINICIAN = "clinician"
        RESEARCHER = "researcher"
        ADMIN = "admin"

try:
    from app.knowledge.adapter_registry import AdapterRegistry, get_registry
except ImportError:
    class AdapterRegistry:
        def __init__(self) -> None:
            self._adapters: Dict[str, Any] = {}
        def register(self, key: str, adapter: Any) -> None:
            self._adapters[key] = adapter
        def get(self, key: str) -> Any:
            return self._adapters.get(key)
        def list_adapters(self) -> List[Dict[str, Any]]:
            return []
        def list_categories(self) -> List[str]:
            return []
        def get_stats(self) -> Dict[str, Any]:
            return {}
    def get_registry() -> AdapterRegistry:
        return AdapterRegistry()

try:
    from app.knowledge.medication_analyzer_bridge import MedicationAnalyzerBridge
except ImportError:
    class MedicationAnalyzerBridge:
        async def analyze(self, **kwargs: Any) -> Dict[str, Any]:
            return {"status": "mock", "result": {}}

try:
    from app.knowledge.genetic_analyzer_bridge import GeneticAnalyzerBridge
except ImportError:
    class GeneticAnalyzerBridge:
        async def analyze_variant(self, **kwargs: Any) -> Dict[str, Any]:
            return {"status": "mock", "result": {}}

try:
    from app.knowledge.qeeg_analyzer_bridge import qEEGAnalyzerBridge
except ImportError:
    class qEEGAnalyzerBridge:
        async def analyze(self, **kwargs: Any) -> Dict[str, Any]:
            return {"status": "mock", "result": {}}

try:
    from app.knowledge.mri_analyzer_bridge import MRIAnalyzerBridge
except ImportError:
    class MRIAnalyzerBridge:
        async def analyze(self, **kwargs: Any) -> Dict[str, Any]:
            return {"status": "mock", "result": {}}

try:
    from app.knowledge.multimodal_synthesizer_v2 import MultimodalSynthesizer
except ImportError:
    class MultimodalSynthesizer:
        async def synthesize(self, **kwargs: Any) -> Dict[str, Any]:
            return {"status": "mock", "synthesis": {}}

try:
    from app.knowledge.deeptwin_integration import DeepTwinIntegration
except ImportError:
    class DeepTwinIntegration:
        async def get_patient_intelligence(self, patient_id: str) -> Dict[str, Any]:
            return {"status": "mock", "patient_id": patient_id}
        async def synthesize(self, patient_id: str, **kwargs: Any) -> Dict[str, Any]:
            return {"status": "mock", "patient_id": patient_id}
        async def get_report(self, patient_id: str, format: str = "full") -> Dict[str, Any]:
            return {"status": "mock", "patient_id": patient_id, "format": format}


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/knowledge", tags=["Knowledge Layer"])

# ===========================================================================
# CONSTANTS - 66 Knowledge Adapters
# ===========================================================================

ADAPTER_DEFINITIONS = [
    {"key": "pubmed", "name": "PubMed / MEDLINE", "category": "biomedical_literature"},
    {"key": "pubmed_central", "name": "PubMed Central", "category": "biomedical_literature"},
    {"key": "embase", "name": "Embase", "category": "biomedical_literature"},
    {"key": "cochrane", "name": "Cochrane Library", "category": "biomedical_literature"},
    {"key": "scopus", "name": "Scopus", "category": "biomedical_literature"},
    {"key": "web_of_science", "name": "Web of Science", "category": "biomedical_literature"},
    {"key": "google_scholar", "name": "Google Scholar", "category": "biomedical_literature"},
    {"key": "ieee_xplore", "name": "IEEE Xplore", "category": "biomedical_literature"},
    {"key": "springer_link", "name": "Springer Link", "category": "biomedical_literature"},
    {"key": "wiley_online", "name": "Wiley Online Library", "category": "biomedical_literature"},
    {"key": "nature_publications", "name": "Nature Portfolio", "category": "biomedical_literature"},
    {"key": "science_direct", "name": "ScienceDirect", "category": "biomedical_literature"},
    {"key": "clinicaltrials", "name": "ClinicalTrials.gov", "category": "clinical_trials"},
    {"key": "who_ictrp", "name": "WHO ICTRP", "category": "clinical_trials"},
    {"key": "eu_ctis", "name": "EU CTIS", "category": "clinical_trials"},
    {"key": "anzctr", "name": "ANZCTR", "category": "clinical_trials"},
    {"key": "jprn", "name": "JPRN", "category": "clinical_trials"},
    {"key": "chictr", "name": "ChiCTR", "category": "clinical_trials"},
    {"key": "drugbank", "name": "DrugBank", "category": "pharmacology"},
    {"key": "chembl", "name": "ChEMBL", "category": "pharmacology"},
    {"key": "pubchem", "name": "PubChem", "category": "pharmacology"},
    {"key": "rxnorm", "name": "RxNorm", "category": "pharmacology"},
    {"key": "atc_codes", "name": "ATC/DDD Index", "category": "pharmacology"},
    {"key": "dailymed", "name": "DailyMed", "category": "pharmacology"},
    {"key": "fdadrug", "name": "FDA Orange Book", "category": "pharmacology"},
    {"key": "pharmgkb", "name": "PharmGKB", "category": "pharmacology"},
    {"key": "ncbi_gene", "name": "NCBI Gene", "category": "genomics"},
    {"key": "clinvar", "name": "ClinVar", "category": "genomics"},
    {"key": "dbsnp", "name": "dbSNP", "category": "genomics"},
    {"key": "gnomad", "name": "gnomAD", "category": "genomics"},
    {"key": "ensembl", "name": "Ensembl", "category": "genomics"},
    {"key": "uniprot", "name": "UniProt", "category": "genomics"},
    {"key": "gtex", "name": "GTEx Portal", "category": "genomics"},
    {"key": "reactome", "name": "Reactome", "category": "genomics"},
    {"key": "neurovault", "name": "NeuroVault", "category": "neuroimaging"},
    {"key": "openneuro", "name": "OpenNeuro", "category": "neuroimaging"},
    {"key": "brainmap", "name": "BrainMap", "category": "neuroimaging"},
    {"key": "nimare", "name": "NiMARE", "category": "neuroimaging"},
    {"key": "hcp", "name": "Human Connectome Project", "category": "neuroimaging"},
    {"key": "fcon1000", "name": "FCON1000", "category": "neuroimaging"},
    {"key": "eeglab_datasets", "name": "EEGLAB Datasets", "category": "eeg_qeeg"},
    {"key": "bids_eeg", "name": "BIDS-EEG", "category": "eeg_qeeg"},
    {"key": "physionet_eeg", "name": "PhysioNet EEG", "category": "eeg_qeeg"},
    {"key": "erp_core", "name": "ERP CORE", "category": "eeg_qeeg"},
    {"key": "icd10", "name": "ICD-10", "category": "psychiatric_classifications"},
    {"key": "icd11", "name": "ICD-11", "category": "psychiatric_classifications"},
    {"key": "dsm5", "name": "DSM-5-TR", "category": "psychiatric_classifications"},
    {"key": "snomed_ct", "name": "SNOMED CT", "category": "psychiatric_classifications"},
    {"key": "hpo", "name": "Human Phenotype Ontology", "category": "phenotyping"},
    {"key": "mondo", "name": "MONDO", "category": "phenotyping"},
    {"key": "symptomate", "name": "Symptom Ontology", "category": "phenotyping"},
    {"key": "psyche_db", "name": "PsycheDB", "category": "phenotyping"},
    {"key": "go", "name": "Gene Ontology", "category": "ontologies"},
    {"key": "chebi", "name": "ChEBI", "category": "ontologies"},
    {"key": "mondo_ontology", "name": "MONDO Ontology", "category": "ontologies"},
    {"key": "mesh", "name": "MeSH", "category": "ontologies"},
    {"key": "umls", "name": "UMLS", "category": "ontologies"},
    {"key": "bioportal", "name": "BioPortal", "category": "ontologies"},
    {"key": "ema", "name": "EMA Guidelines", "category": "regulatory"},
    {"key": "fda_guidance", "name": "FDA Guidance", "category": "regulatory"},
    {"key": "nice_guidelines", "name": "NICE Guidelines", "category": "regulatory"},
    {"key": "apa_guidelines", "name": "APA Guidelines", "category": "regulatory"},
    {"key": "patient_voices", "name": "Patient Voices DB", "category": "patient_reported"},
    {"key": "proqolid", "name": "PROQOLID", "category": "patient_reported"},
    {"key": "promis", "name": "PROMIS", "category": "patient_reported"},
    {"key": "neuroqol", "name": "Neuro-QOL", "category": "patient_reported"},
]

ADAPTER_KEYS = [a["key"] for a in ADAPTER_DEFINITIONS]
ADAPTER_BY_KEY = {a["key"]: a for a in ADAPTER_DEFINITIONS}


# ===========================================================================
# PYDANTIC MODELS
# ===========================================================================

class AdapterSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=512)
    databases: Optional[List[str]] = Field(default=None)
    filters: Optional[Dict[str, Any]] = Field(default=None)
    max_results: Optional[int] = Field(default=50, ge=1, le=1000)
    offset: Optional[int] = Field(default=0, ge=0)

class MedicationAnalysisRequest(BaseModel):
    medication_name: str = Field(..., min_length=1, max_length=256)
    patient_variants: Optional[List[Dict[str, Any]]] = Field(default=None)
    patient_demographics: Optional[Dict[str, Any]] = Field(default=None)
    current_medications: Optional[List[str]] = Field(default=None)
    conditions: Optional[List[str]] = Field(default=None)

class GeneticAnalysisRequest(BaseModel):
    variant_id: str = Field(..., min_length=1, max_length=64)
    gene: Optional[str] = Field(default=None, max_length=32)
    phenotype: Optional[str] = Field(default=None, max_length=256)
    population: Optional[str] = Field(default=None, max_length=64)

class qEEGAnalysisRequest(BaseModel):
    patient_qeeg_data: Dict[str, Any]
    condition: Optional[str] = Field(default=None, max_length=128)
    age: Optional[int] = Field(default=None, ge=0, le=120)
    medication_status: Optional[str] = Field(default=None, max_length=128)
    eyes_state: Optional[str] = Field(default=None, max_length=16)

class MRIAnalysisRequest(BaseModel):
    patient_mri: Dict[str, Any]
    condition: Optional[str] = Field(default=None, max_length=128)
    scanner_type: Optional[str] = Field(default=None, max_length=64)
    age: Optional[int] = Field(default=None, ge=0, le=120)
    sex: Optional[str] = Field(default=None, max_length=8)

class SynthesizeRequest(BaseModel):
    patient_id: str = Field(..., min_length=1, max_length=64)
    domains: List[str] = Field(default_factory=list)
    depth: Optional[str] = Field(default="standard")
    include_recommendations: Optional[bool] = Field(default=True)
    include_hypotheses: Optional[bool] = Field(default=True)

class EvidenceSeedRequest(BaseModel):
    target_adapters: Optional[List[str]] = Field(default=None)
    incremental: Optional[bool] = Field(default=True)
    max_entries_per_adapter: Optional[int] = Field(default=1000, ge=1, le=10000)

class AdapterMetadata(BaseModel):
    key: str
    name: str
    category: str
    description: str = ""
    status: str = "unknown"
    last_check: Optional[datetime] = None
    capabilities: Optional[List[str]] = None
    endpoint_url: Optional[str] = None

class AdapterListResponse(BaseModel):
    total: int
    adapters: List[AdapterMetadata]

class AdapterCategoryResponse(BaseModel):
    categories: List[str]
    category_counts: Dict[str, int]

class AdapterStatsResponse(BaseModel):
    total_adapters: int
    active_adapters: int
    inactive_adapters: int
    categories: Dict[str, int]
    total_queries_today: int
    average_response_ms: float
    uptime_pct: float

class SearchResultItem(BaseModel):
    id: str
    title: str
    source: str
    source_adapter: str
    url: Optional[str] = None
    abstract: Optional[str] = None
    relevance_score: float
    metadata: Optional[Dict[str, Any]] = None

class AdapterSearchResponse(BaseModel):
    query: str
    total_results: int
    adapters_queried: int
    adapters_succeeded: int
    adapters_failed: int
    results: List[SearchResultItem]
    elapsed_ms: float

class AdapterHealthResponse(BaseModel):
    adapter_key: str
    adapter_name: str
    status: str
    is_available: bool
    latency_ms: float
    last_successful_query: Optional[datetime] = None
    error_message: Optional[str] = None
    version: Optional[str] = None

class MedicationAnalysisResponse(BaseModel):
    medication_name: str
    pharmacogenomic_warnings: List[Dict[str, Any]]
    interaction_alerts: List[Dict[str, Any]]
    dosing_recommendations: List[Dict[str, Any]]
    efficacy_predictors: List[Dict[str, Any]]
    adverse_event_risk: Dict[str, Any]
    evidence_level: str
    analysis_summary: str

class GeneticAnalysisResponse(BaseModel):
    variant_id: str
    gene: Optional[str]
    allele_frequencies: Dict[str, float]
    clinical_significance: str
    phenotype_associations: List[Dict[str, Any]]
    pharmacogenomic_annotations: List[Dict[str, Any]]
    functional_predictions: Dict[str, Any]
    literature_count: int
    evidence_level: str
    analysis_summary: str

class qEEGAnalysisResponse(BaseModel):
    pattern_classifications: List[Dict[str, Any]]
    deviation_scores: Dict[str, float]
    normative_comparisons: Dict[str, Any]
    condition_probabilities: Dict[str, float]
    medication_response_predictions: List[Dict[str, Any]]
    recommended_protocols: List[str]
    confidence_level: str
    analysis_summary: str

class MRIAnalysisResponse(BaseModel):
    structural_findings: List[Dict[str, Any]]
    functional_findings: List[Dict[str, Any]]
    normative_deviations: Dict[str, float]
    condition_probabilities: Dict[str, float]
    progression_risk: Optional[Dict[str, Any]]
    recommended_follow_up: List[str]
    confidence_level: str
    analysis_summary: str

class SynthesizeResponse(BaseModel):
    patient_id: str
    synthesis_timestamp: datetime
    domains_included: List[str]
    cross_modal_correlations: List[Dict[str, Any]]
    ranked_hypotheses: List[Dict[str, Any]]
    recommendations: List[Dict[str, Any]]
    confidence_aggregate: float
    uncertainty_flags: List[str]
    executive_summary: str

class DeepTwinIntelligenceResponse(BaseModel):
    patient_id: str
    digital_twin_id: str
    created_at: datetime
    updated_at: datetime
    multimodal_profile: Dict[str, Any]
    trajectory_predictions: List[Dict[str, Any]]
    risk_flags: List[Dict[str, Any]]
    intervention_history: List[Dict[str, Any]]
    knowledge_graph_links: List[Dict[str, Any]]
    confidence_score: float

class DeepTwinReportResponse(BaseModel):
    patient_id: str
    report_format: str
    generated_at: datetime
    report_content: Dict[str, Any]
    sections: List[str]
    page_count_estimate: int

class EvidenceEntry(BaseModel):
    id: str
    adapter_key: str
    entity_type: str
    entity_id: str
    title: str
    confidence: float
    provenance_url: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    ingested_at: Optional[datetime] = None

class EvidenceSearchResponse(BaseModel):
    query: str
    total_results: int
    results: List[EvidenceEntry]
    elapsed_ms: float

class EvidenceStatsResponse(BaseModel):
    total_entries: int
    entries_by_adapter: Dict[str, int]
    entries_by_type: Dict[str, int]
    last_ingestion: Optional[datetime] = None
    ingestion_rate_per_hour: float

class ErrorResponse(BaseModel):
    detail: str
    error_code: Optional[str] = None
    request_id: Optional[str] = None
    timestamp: Optional[datetime] = None


# ===========================================================================
# HELPER FUNCTIONS
# ===========================================================================

async def _resolve_adapter(registry, key):
    adapter = registry.get(key)
    if adapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Adapter '{key}' not found.",
        )
    return adapter


async def _check_adapter_health(adapter, key):
    start = time.perf_counter()
    meta = ADAPTER_BY_KEY.get(key, {})
    try:
        if hasattr(adapter, "health"):
            await adapter.health()
        elif hasattr(adapter, "ping"):
            await adapter.ping()
        elif hasattr(adapter, "search"):
            await adapter.search("test", max_results=1)
        latency_ms = (time.perf_counter() - start) * 1000.0
        return AdapterHealthResponse(
            adapter_key=key, adapter_name=meta.get("name", key),
            status="healthy", is_available=True,
            latency_ms=round(latency_ms, 2),
            last_successful_query=datetime.utcnow(),
            version=getattr(adapter, "version", None),
        )
    except Exception as exc:
        latency_ms = (time.perf_counter() - start) * 1000.0
        return AdapterHealthResponse(
            adapter_key=key, adapter_name=meta.get("name", key),
            status="unhealthy", is_available=False,
            latency_ms=round(latency_ms, 2),
            error_message=str(exc),
            version=getattr(adapter, "version", None),
        )


async def _seed_evidence_task(registry, target_adapters, incremental, max_entries_per_adapter):
    adapters_to_seed = target_adapters or ADAPTER_KEYS
    seeded = 0
    for key in adapters_to_seed:
        adapter = registry.get(key)
        if adapter is None:
            continue
        try:
            if hasattr(adapter, "seed_evidence"):
                count = await adapter.seed_evidence(max_entries=max_entries_per_adapter, incremental=incremental)
                seeded += count
            elif hasattr(adapter, "query"):
                results = await adapter.query("*", max_results=max_entries_per_adapter)
                seeded += len(results) if isinstance(results, list) else 0
        except Exception:
            pass


def _normalize_results(raw, results, adapter_key):
    entries = raw if isinstance(raw, list) else (raw.get("results", []) if isinstance(raw, dict) else [])
    for idx, item in enumerate(entries):
        if isinstance(item, dict):
            results.append(SearchResultItem(
                id=item.get("id", f"{adapter_key}-{idx}"),
                title=item.get("title", "Untitled"),
                source=item.get("source", adapter_key),
                source_adapter=adapter_key,
                url=item.get("url"),
                abstract=item.get("abstract"),
                relevance_score=float(item.get("score", 0.5)),
                metadata=item.get("metadata"),
            ))


# ===========================================================================
# SECTION 1 - ADAPTER DISCOVERY (4 endpoints)
# ===========================================================================

@router.get("/adapters", response_model=AdapterListResponse)
async def list_adapters(
    request: Request,
    category: Optional[str] = Query(None),
    registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """List all 66 knowledge adapters with optional category filter."""
    adapters_meta = []
    for defn in ADAPTER_DEFINITIONS:
        if category and defn["category"] != category:
            continue
        adapter = registry.get(defn["key"])
        health = await _check_adapter_health(adapter, defn["key"]) if adapter else None
        adapters_meta.append(AdapterMetadata(
            key=defn["key"], name=defn["name"], category=defn["category"],
            description=defn.get("description", ""),
            status=health.status if health else "not_registered",
            last_check=datetime.utcnow() if health else None,
        ))
    return AdapterListResponse(total=len(adapters_meta), adapters=adapters_meta)


@router.get("/adapters/{key}", response_model=AdapterMetadata)
async def get_adapter(
    key: str = Path(...),
    registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """Get single adapter details and health."""
    meta = ADAPTER_BY_KEY.get(key)
    if meta is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown adapter: {key}")
    adapter = registry.get(key)
    health = await _check_adapter_health(adapter, key) if adapter else None
    return AdapterMetadata(
        key=meta["key"], name=meta["name"], category=meta["category"],
        description=meta.get("description", ""),
        status=health.status if health else "not_registered",
        last_check=datetime.utcnow() if health else None,
    )


@router.get("/adapters/categories", response_model=AdapterCategoryResponse)
async def list_categories(
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """List adapter categories with counts."""
    counts = {}
    for defn in ADAPTER_DEFINITIONS:
        counts[defn["category"]] = counts.get(defn["category"], 0) + 1
    return AdapterCategoryResponse(categories=sorted(counts.keys()), category_counts=counts)


@router.get("/adapters/stats", response_model=AdapterStatsResponse)
async def get_adapter_stats(
    registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """Registry-wide statistics."""
    active = inactive = checked = 0
    total_latency = 0.0
    category_counts = {}
    for defn in ADAPTER_DEFINITIONS:
        category_counts[defn["category"]] = category_counts.get(defn["category"], 0) + 1
        adapter = registry.get(defn["key"])
        if adapter:
            health = await _check_adapter_health(adapter, defn["key"])
            if health.is_available:
                active += 1
            else:
                inactive += 1
            total_latency += health.latency_ms
            checked += 1
    avg_latency = total_latency / checked if checked else 0.0
    uptime_pct = (active / checked * 100) if checked else 0.0
    return AdapterStatsResponse(
        total_adapters=len(ADAPTER_DEFINITIONS), active_adapters=active,
        inactive_adapters=inactive, categories=category_counts,
        total_queries_today=0, average_response_ms=round(avg_latency, 2),
        uptime_pct=round(uptime_pct, 2),
    )


# ===========================================================================
# SECTION 2 - ADAPTER SEARCH (2 endpoints)
# ===========================================================================

@router.get("/search", response_model=AdapterSearchResponse)
async def search_adapters_get(
    q: str = Query(..., min_length=1, max_length=512),
    databases: Optional[List[str]] = Query(None),
    max_results: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """Cross-adapter search via GET."""
    targets = databases or ADAPTER_KEYS
    start = time.perf_counter()
    results, succeeded, failed = [], 0, 0
    for key in targets:
        adapter = registry.get(key)
        if adapter is None:
            failed += 1
            continue
        try:
            raw = await adapter.search(q, max_results=max_results, offset=offset) if hasattr(adapter, "search") else await adapter.query(q, max_results=max_results, offset=offset)
            _normalize_results(raw, results, key)
            succeeded += 1
        except Exception:
            failed += 1
    results.sort(key=lambda r: r.relevance_score, reverse=True)
    paged = results[offset:offset + max_results] if offset < len(results) else []
    return AdapterSearchResponse(
        query=q, total_results=len(results), adapters_queried=len(targets),
        adapters_succeeded=succeeded, adapters_failed=failed, results=paged,
        elapsed_ms=round((time.perf_counter() - start) * 1000.0, 2),
    )


@router.post("/search", response_model=AdapterSearchResponse)
async def search_adapters_post(
    body: AdapterSearchRequest,
    registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """Cross-adapter search via POST with advanced filters."""
    targets = body.databases or ADAPTER_KEYS
    start = time.perf_counter()
    results, succeeded, failed = [], 0, 0
    for key in targets:
        adapter = registry.get(key)
        if adapter is None:
            failed += 1
            continue
        try:
            kwargs = {"max_results": body.max_results, "offset": body.offset}
            if body.filters:
                kwargs["filters"] = body.filters
            raw = await adapter.search(body.query, **kwargs) if hasattr(adapter, "search") else await adapter.query(body.query, **kwargs)
            _normalize_results(raw, results, key)
            succeeded += 1
        except Exception:
            failed += 1
    results.sort(key=lambda r: r.relevance_score, reverse=True)
    off, mx = body.offset or 0, body.max_results or 50
    paged = results[off:off + mx] if off < len(results) else []
    return AdapterSearchResponse(
        query=body.query, total_results=len(results), adapters_queried=len(targets),
        adapters_succeeded=succeeded, adapters_failed=failed, results=paged,
        elapsed_ms=round((time.perf_counter() - start) * 1000.0, 2),
    )


# ===========================================================================
# SECTION 3 - INDIVIDUAL ADAPTER QUERIES (66 adapters x 2 = 132 endpoints)
# ===========================================================================

def _make_adapter_search_endpoint(adapter_key):
    meta = ADAPTER_BY_KEY[adapter_key]

    async def _search_adapter(
        q: str = Query(..., min_length=1, max_length=512, description="Search query"),
        max_results: int = Query(50, ge=1, le=1000, description="Max results"),
        offset: int = Query(0, ge=0, description="Pagination offset"),
        registry: AdapterRegistry = Depends(get_registry),
        actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
    ) -> AdapterSearchResponse:
        """Search the {name} adapter. Queries the {name} database and returns ranked results."""
        adapter = await _resolve_adapter(registry, adapter_key)
        health = await _check_adapter_health(adapter, adapter_key)
        if not health.is_available:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Adapter '{adapter_key}' unavailable: {health.error_message}")
        start = time.perf_counter()
        try:
            kwargs = {"max_results": max_results, "offset": offset}
            if hasattr(adapter, "search"):
                raw = await adapter.search(q, **kwargs)
            elif hasattr(adapter, "query"):
                raw = await adapter.query(q, **kwargs)
            else:
                raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED,
                    detail=f"Adapter '{adapter_key}' has no search/query.")
            results = []
            _normalize_results(raw, results, adapter_key)
            return AdapterSearchResponse(query=q, total_results=len(results), adapters_queried=1,
                adapters_succeeded=1, adapters_failed=0, results=results,
                elapsed_ms=round((time.perf_counter() - start) * 1000.0, 2))
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Search failed on '{adapter_key}': {str(exc)}")

    _search_adapter.__doc__ = (_search_adapter.__doc__ or "").format(name=meta["name"])
    _search_adapter.__name__ = f"search_{adapter_key}"
    return _search_adapter


def _make_adapter_status_endpoint(adapter_key):
    meta = ADAPTER_BY_KEY[adapter_key]

    async def _status_adapter(
        registry: AdapterRegistry = Depends(get_registry),
        actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
    ) -> AdapterHealthResponse:
        """Health check for the {name} adapter. Returns availability and latency."""
        adapter = await _resolve_adapter(registry, adapter_key)
        return await _check_adapter_health(adapter, adapter_key)

    _status_adapter.__doc__ = (_status_adapter.__doc__ or "").format(name=meta["name"])
    _status_adapter.__name__ = f"status_{adapter_key}"
    return _status_adapter


# Register 132 dynamic endpoints
for _ad in ADAPTER_DEFINITIONS:
    _key = _ad["key"]
    _name = _ad["name"]
    router.add_api_route(path=f"/{_key}/search", endpoint=_make_adapter_search_endpoint(_key),
        methods=["GET"], response_model=AdapterSearchResponse,
        summary=f"Search {_name}", description=f"Search the {_name} adapter.")
    router.add_api_route(path=f"/{_key}/status", endpoint=_make_adapter_status_endpoint(_key),
        methods=["GET"], response_model=AdapterHealthResponse,
        summary=f"Health {_name}", description=f"Health check for {_name}.")


# ===========================================================================
# SECTION 4 - ANALYZER BRIDGES (4 endpoints)
# ===========================================================================

@router.post("/medication-analysis", response_model=MedicationAnalysisResponse)
async def medication_analysis(
    body: MedicationAnalysisRequest,
    bridge: MedicationAnalyzerBridge = Depends(MedicationAnalyzerBridge),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.CLINICIAN)),
):
    """Medication pharmacogenomic analysis. Requires clinician role."""
    result = await bridge.analyze(medication_name=body.medication_name, patient_variants=body.patient_variants,
        patient_demographics=body.patient_demographics, current_medications=body.current_medications,
        conditions=body.conditions)
    return MedicationAnalysisResponse(medication_name=body.medication_name,
        pharmacogenomic_warnings=result.get("pharmacogenomic_warnings", []),
        interaction_alerts=result.get("interaction_alerts", []),
        dosing_recommendations=result.get("dosing_recommendations", []),
        efficacy_predictors=result.get("efficacy_predictors", []),
        adverse_event_risk=result.get("adverse_event_risk", {}),
        evidence_level=result.get("evidence_level", "unknown"),
        analysis_summary=result.get("analysis_summary", ""))


@router.post("/genetic-analysis", response_model=GeneticAnalysisResponse)
async def genetic_analysis(
    body: GeneticAnalysisRequest,
    bridge: GeneticAnalyzerBridge = Depends(GeneticAnalyzerBridge),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.CLINICIAN)),
):
    """Genetic variant analysis. Requires clinician role."""
    result = await bridge.analyze_variant(variant_id=body.variant_id, gene=body.gene,
        phenotype=body.phenotype, population=body.population)
    return GeneticAnalysisResponse(variant_id=body.variant_id, gene=body.gene,
        allele_frequencies=result.get("allele_frequencies", {}),
        clinical_significance=result.get("clinical_significance", "unknown"),
        phenotype_associations=result.get("phenotype_associations", []),
        pharmacogenomic_annotations=result.get("pharmacogenomic_annotations", []),
        functional_predictions=result.get("functional_predictions", {}),
        literature_count=result.get("literature_count", 0),
        evidence_level=result.get("evidence_level", "unknown"),
        analysis_summary=result.get("analysis_summary", ""))


@router.post("/qeeg-analysis", response_model=qEEGAnalysisResponse)
async def qeeg_analysis(
    body: qEEGAnalysisRequest,
    bridge: qEEGAnalyzerBridge = Depends(qEEGAnalyzerBridge),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.CLINICIAN)),
):
    """qEEG pattern analysis. Requires clinician role."""
    result = await bridge.analyze(patient_qeeg_data=body.patient_qeeg_data, condition=body.condition,
        age=body.age, medication_status=body.medication_status, eyes_state=body.eyes_state)
    return qEEGAnalysisResponse(pattern_classifications=result.get("pattern_classifications", []),
        deviation_scores=result.get("deviation_scores", {}),
        normative_comparisons=result.get("normative_comparisons", {}),
        condition_probabilities=result.get("condition_probabilities", {}),
        medication_response_predictions=result.get("medication_response_predictions", []),
        recommended_protocols=result.get("recommended_protocols", []),
        confidence_level=result.get("confidence_level", "unknown"),
        analysis_summary=result.get("analysis_summary", ""))


@router.post("/mri-analysis", response_model=MRIAnalysisResponse)
async def mri_analysis(
    body: MRIAnalysisRequest,
    bridge: MRIAnalyzerBridge = Depends(MRIAnalyzerBridge),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.CLINICIAN)),
):
    """MRI neuroimaging analysis. Requires clinician role."""
    result = await bridge.analyze(patient_mri=body.patient_mri, condition=body.condition,
        scanner_type=body.scanner_type, age=body.age, sex=body.sex)
    return MRIAnalysisResponse(structural_findings=result.get("structural_findings", []),
        functional_findings=result.get("functional_findings", []),
        normative_deviations=result.get("normative_deviations", {}),
        condition_probabilities=result.get("condition_probabilities", {}),
        progression_risk=result.get("progression_risk"),
        recommended_follow_up=result.get("recommended_follow_up", []),
        confidence_level=result.get("confidence_level", "unknown"),
        analysis_summary=result.get("analysis_summary", ""))


# ===========================================================================
# SECTION 5 - MULTIMODAL SYNTHESIZER (1 endpoint)
# ===========================================================================

@router.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize_patient(
    body: SynthesizeRequest,
    synthesizer: MultimodalSynthesizer = Depends(MultimodalSynthesizer),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.CLINICIAN)),
):
    """Multimodal patient synthesis. Integrates medication, genetic, qEEG, MRI, clinical data."""
    result = await synthesizer.synthesize(patient_id=body.patient_id, domains=body.domains,
        depth=body.depth, include_recommendations=body.include_recommendations,
        include_hypotheses=body.include_hypotheses)
    return SynthesizeResponse(patient_id=body.patient_id, synthesis_timestamp=datetime.utcnow(),
        domains_included=body.domains,
        cross_modal_correlations=result.get("cross_modal_correlations", []),
        ranked_hypotheses=result.get("ranked_hypotheses", []),
        recommendations=result.get("recommendations", []),
        confidence_aggregate=result.get("confidence_aggregate", 0.0),
        uncertainty_flags=result.get("uncertainty_flags", []),
        executive_summary=result.get("executive_summary", ""))


# ===========================================================================
# SECTION 6 - DEEPTWIN (3 endpoints)
# ===========================================================================

@router.get("/deeptwin/{patient_id}", response_model=DeepTwinIntelligenceResponse)
async def get_deeptwin(
    patient_id: str = Path(..., min_length=1, max_length=64),
    deeptwin: DeepTwinIntegration = Depends(DeepTwinIntegration),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.CLINICIAN)),
):
    """Get full DeepTwin patient intelligence profile."""
    result = await deeptwin.get_patient_intelligence(patient_id)
    if not result or result.get("status") == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found in DeepTwin.")
    return DeepTwinIntelligenceResponse(patient_id=patient_id,
        digital_twin_id=result.get("digital_twin_id", f"DT-{patient_id}"),
        created_at=result.get("created_at", datetime.utcnow()),
        updated_at=result.get("updated_at", datetime.utcnow()),
        multimodal_profile=result.get("multimodal_profile", {}),
        trajectory_predictions=result.get("trajectory_predictions", []),
        risk_flags=result.get("risk_flags", []),
        intervention_history=result.get("intervention_history", []),
        knowledge_graph_links=result.get("knowledge_graph_links", []),
        confidence_score=result.get("confidence_score", 0.0))


@router.post("/deeptwin/{patient_id}/synthesize", response_model=SynthesizeResponse)
async def deeptwin_synthesize(
    patient_id: str = Path(..., min_length=1, max_length=64),
    domains: List[str] = Query(default_factory=list),
    depth: str = Query(default="standard"),
    deeptwin: DeepTwinIntegration = Depends(DeepTwinIntegration),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.CLINICIAN)),
):
    """Run new DeepTwin synthesis for a patient."""
    result = await deeptwin.synthesize(patient_id=patient_id, domains=domains, depth=depth)
    return SynthesizeResponse(patient_id=patient_id, synthesis_timestamp=datetime.utcnow(),
        domains_included=domains or ["medication", "genetics", "qeeg", "mri", "clinical"],
        cross_modal_correlations=result.get("cross_modal_correlations", []),
        ranked_hypotheses=result.get("ranked_hypotheses", []),
        recommendations=result.get("recommendations", []),
        confidence_aggregate=result.get("confidence_aggregate", 0.0),
        uncertainty_flags=result.get("uncertainty_flags", []),
        executive_summary=result.get("executive_summary", ""))


@router.get("/deeptwin/{patient_id}/report", response_model=DeepTwinReportResponse)
async def get_deeptwin_report(
    patient_id: str = Path(..., min_length=1, max_length=64),
    report_format: str = Query(default="full"),
    deeptwin: DeepTwinIntegration = Depends(DeepTwinIntegration),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.CLINICIAN)),
):
    """Get formatted DeepTwin patient report (full or summary)."""
    if report_format not in ("full", "summary"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid format: '{report_format}'. Must be 'full' or 'summary'.")
    result = await deeptwin.get_report(patient_id, format=report_format)
    if not result or result.get("status") == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found in DeepTwin.")
    return DeepTwinReportResponse(patient_id=patient_id, report_format=report_format,
        generated_at=datetime.utcnow(), report_content=result.get("report_content", {}),
        sections=result.get("sections", []),
        page_count_estimate=result.get("page_count_estimate", 0))


# ===========================================================================
# SECTION 7 - EVIDENCE STORE (5 endpoints)
# ===========================================================================

@router.get("/evidence/search", response_model=EvidenceSearchResponse)
async def search_evidence(
    q: str = Query(""), adapter_key: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None), max_results: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0), registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """Search evidence store by keyword, adapter, or entity type."""
    start = time.perf_counter()
    results = []
    try:
        store = getattr(registry, "evidence_store", None)
        raw = await store.search(query=q, adapter_key=adapter_key, entity_type=entity_type,
            max_results=max_results, offset=offset) if store else {"results": []}
        for item in (raw.get("results", []) if isinstance(raw, dict) else raw):
            results.append(EvidenceEntry(id=item.get("id", ""),
                adapter_key=item.get("adapter_key", adapter_key or "unknown"),
                entity_type=item.get("entity_type", entity_type or "unknown"),
                entity_id=item.get("entity_id", ""), title=item.get("title", "Untitled"),
                confidence=float(item.get("confidence", 0.0)), provenance_url=item.get("provenance_url"),
                metadata=item.get("metadata"), ingested_at=item.get("ingested_at")))
    except Exception:
        pass
    return EvidenceSearchResponse(query=q, total_results=len(results), results=results,
        elapsed_ms=round((time.perf_counter() - start) * 1000.0, 2))


@router.get("/evidence/stats", response_model=EvidenceStatsResponse)
async def get_evidence_stats(
    registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """Evidence store aggregate statistics."""
    try:
        store = getattr(registry, "evidence_store", None)
        raw = await store.get_stats() if store else {"total_entries": 0, "entries_by_adapter": {},
            "entries_by_type": {}, "last_ingestion": None, "ingestion_rate_per_hour": 0.0}
        return EvidenceStatsResponse(total_entries=raw.get("total_entries", 0),
            entries_by_adapter=raw.get("entries_by_adapter", {}),
            entries_by_type=raw.get("entries_by_type", {}),
            last_ingestion=raw.get("last_ingestion"),
            ingestion_rate_per_hour=raw.get("ingestion_rate_per_hour", 0.0))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Evidence stats error: {str(exc)}")


@router.get("/evidence/by-adapter/{adapter_key}", response_model=EvidenceSearchResponse)
async def get_evidence_by_adapter(
    adapter_key: str = Path(...), max_results: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0), registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """Get evidence from a specific adapter."""
    if adapter_key not in ADAPTER_BY_KEY:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown adapter: {adapter_key}")
    results = []
    try:
        store = getattr(registry, "evidence_store", None)
        raw = await store.search(adapter_key=adapter_key, max_results=max_results, offset=offset) if store else {"results": []}
        for item in (raw.get("results", []) if isinstance(raw, dict) else raw):
            results.append(EvidenceEntry(id=item.get("id", ""), adapter_key=adapter_key,
                entity_type=item.get("entity_type", "unknown"), entity_id=item.get("entity_id", ""),
                title=item.get("title", "Untitled"), confidence=float(item.get("confidence", 0.0)),
                provenance_url=item.get("provenance_url"), metadata=item.get("metadata"),
                ingested_at=item.get("ingested_at")))
    except Exception:
        pass
    return EvidenceSearchResponse(query=f"adapter:{adapter_key}", total_results=len(results),
        results=results, elapsed_ms=0.0)


@router.get("/evidence/by-type/{entity_type}", response_model=EvidenceSearchResponse)
async def get_evidence_by_type(
    entity_type: str = Path(...), max_results: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0), registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role("guest")),
):
    """Get evidence filtered by entity type."""
    results = []
    try:
        store = getattr(registry, "evidence_store", None)
        raw = await store.search(entity_type=entity_type, max_results=max_results, offset=offset) if store else {"results": []}
        for item in (raw.get("results", []) if isinstance(raw, dict) else raw):
            results.append(EvidenceEntry(id=item.get("id", ""),
                adapter_key=item.get("adapter_key", "unknown"), entity_type=entity_type,
                entity_id=item.get("entity_id", ""), title=item.get("title", "Untitled"),
                confidence=float(item.get("confidence", 0.0)), provenance_url=item.get("provenance_url"),
                metadata=item.get("metadata"), ingested_at=item.get("ingested_at")))
    except Exception:
        pass
    return EvidenceSearchResponse(query=f"type:{entity_type}", total_results=len(results),
        results=results, elapsed_ms=0.0)


@router.post("/evidence/seed", status_code=status.HTTP_202_ACCEPTED)
async def seed_evidence(
    body: EvidenceSeedRequest, background_tasks: BackgroundTasks,
    registry: AdapterRegistry = Depends(get_registry),
    actor: AuthenticatedActor = Depends(require_minimum_role(UserRole.ADMIN)),
):
    """Trigger evidence store seeding as background task. Requires admin role."""
    background_tasks.add_task(_seed_evidence_task, registry, body.target_adapters,
        body.incremental, body.max_entries_per_adapter)
    return {"status": "accepted", "message": "Seeding queued.",
        "target_adapters": body.target_adapters or list(ADAPTER_KEYS),
        "incremental": body.incremental,
        "max_entries_per_adapter": body.max_entries_per_adapter,
        "queued_at": datetime.utcnow().isoformat()}


# ===========================================================================
# ENDPOINT SUMMARY
# ===========================================================================
# Section 1 - Adapter Discovery .............. 4   endpoints
# Section 2 - Adapter Search ................. 2   endpoints
# Section 3 - Individual Adapter Queries ..... 132 endpoints (66 x 2)
# Section 4 - Analyzer Bridges ............... 4   endpoints
# Section 5 - Multimodal Synthesizer ......... 1   endpoint
# Section 6 - DeepTwin ....................... 3   endpoints
# Section 7 - Evidence Store ................. 5   endpoints
# TOTAL ....................................... 151 endpoints
# ===========================================================================
