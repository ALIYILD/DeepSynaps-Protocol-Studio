"""
Evidence Router — FastAPI endpoints for querying and managing the evidence store.

All endpoints are prefixed with /knowledge/evidence when included in the main app.
"""

import os
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Query, HTTPException, BackgroundTasks, Depends, status
from pydantic import BaseModel, Field

from evidence_store import EvidenceStore

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DB_PATH = os.getenv("EVIDENCE_DB_PATH", "/data/evidence.db")
ADMIN_TOKEN = os.getenv("EVIDENCE_ADMIN_TOKEN", "dev-token")

# ---------------------------------------------------------------------------
# Singleton store instance (thread-safe)
# ---------------------------------------------------------------------------
_store: Optional[EvidenceStore] = None


def get_store() -> EvidenceStore:
    """Return singleton EvidenceStore instance."""
    global _store
    if _store is None:
        _store = EvidenceStore(db_path=DB_PATH)
    return _store


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class EvidenceRecord(BaseModel):
    adapter_key: str
    source_database: str
    source_id: Optional[str] = None
    source_url: Optional[str] = None
    entity_type: str
    title: Optional[str] = None
    abstract: Optional[str] = None
    value: Optional[str] = None
    unit: Optional[str] = None
    confidence_overall: Optional[float] = None
    confidence_data_quality: Optional[float] = None
    confidence_evidence_strength: Optional[float] = None
    confidence_sample_size: Optional[float] = None
    confidence_replication: Optional[float] = None
    confidence_consistency: Optional[float] = None
    confidence_temporal: Optional[float] = None
    confidence_population: Optional[float] = None
    data: dict = Field(default_factory=dict)
    provenance: dict = Field(default_factory=dict)
    retrieved_at: Optional[str] = None


class EvidenceResponse(BaseModel):
    id: int
    adapter_key: str
    source_database: str
    source_id: Optional[str] = None
    source_url: Optional[str] = None
    entity_type: str
    title: Optional[str] = None
    abstract: Optional[str] = None
    value: Optional[str] = None
    unit: Optional[str] = None
    confidence_overall: Optional[float] = None
    data: dict
    provenance: dict
    retrieved_at: Optional[str] = None
    created_at: Optional[str] = None


class SearchResult(BaseModel):
    results: List[EvidenceResponse]
    total: int
    limit: int
    offset: int
    query_params: dict


class StatsResponse(BaseModel):
    total_entries: int
    by_adapter: dict
    by_entity_type: dict
    by_source_database: dict
    confidence_stats: dict
    entries_last_24h: int
    unique_adapters: int
    unique_entity_types: int
    confidence_tiers: dict
    generated_at: str


class SeedRequest(BaseModel):
    adapter_keys: Optional[List[str]] = None
    force_full: bool = False


class SeedResponse(BaseModel):
    status: str
    message: str
    adapters_scheduled: List[str]
    started_at: str


class ClearResponse(BaseModel):
    status: str
    deleted_count: int


class AdapterMetadata(BaseModel):
    adapter_key: str
    adapter_name: Optional[str] = None
    adapter_version: Optional[str] = None
    source_url: Optional[str] = None
    last_run_at: Optional[str] = None
    records_count: int = 0
    status: str = "active"
    config: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Router definition
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/knowledge/evidence", tags=["evidence"])


# ---------------------------------------------------------------------------
# Background seeding helpers
# ---------------------------------------------------------------------------
def _seed_adapter(adapter_key: str, store: EvidenceStore) -> int:
    """
    Simulate seeding from a single adapter.
    In production this calls the actual adapter fetch pipeline.
    """
    count = 0
    # Simulate fetching records for this adapter
    sample_records = _generate_sample_records(adapter_key)
    if sample_records:
        count = store.bulk_insert(sample_records)
    store.update_adapter_metadata(
        adapter_key,
        {
            "adapter_name": adapter_key.replace("_", " ").title(),
            "last_run_at": datetime.utcnow().isoformat(),
            "records_count": count,
            "status": "active",
            "config": {"batch_size": 1000, "source": "simulated"}
        }
    )
    return count


def _generate_sample_records(adapter_key: str) -> List[dict]:
    """Generate sample records for demonstration / testing."""
    import random
    bases = {
        "drugbank": [
            {"source_database": "DrugBank", "entity_type": "drug", "title": "Metformin", "value": "antidiabetic"},
            {"source_database": "DrugBank", "entity_type": "drug", "title": "Aspirin", "value": "analgesic"},
        ],
        "pubmed": [
            {"source_database": "PubMed", "entity_type": "publication", "title": "Genomic study of diabetes", "value": "GWAS"},
            {"source_database": "PubMed", "entity_type": "publication", "title": "Metabolic syndrome review", "value": "review"},
        ],
        "clinvar": [
            {"source_database": "ClinVar", "entity_type": "variant", "title": "BRCA1 c.5096G>A", "value": "pathogenic"},
            {"source_database": "ClinVar", "entity_type": "variant", "title": "APOE e4", "value": "risk factor"},
        ],
        "reactome": [
            {"source_database": "Reactome", "entity_type": "pathway", "title": "Glycolysis", "value": "metabolic"},
            {"source_database": "Reactome", "entity_type": "pathway", "title": "Insulin signaling", "value": "signaling"},
        ],
        "uniprot": [
            {"source_database": "UniProt", "entity_type": "protein", "title": "P53_HUMAN", "value": "tumor suppressor"},
            {"source_database": "UniProt", "entity_type": "protein", "title": "INS_HUMAN", "value": "hormone"},
        ],
    }
    templates = bases.get(adapter_key, [
        {"source_database": adapter_key.upper(), "entity_type": "unknown", "title": f"Record from {adapter_key}", "value": "data"}
    ])
    records = []
    for t in templates:
        r = t.copy()
        r["adapter_key"] = adapter_key
        r["confidence_overall"] = round(random.uniform(0.4, 0.99), 2)
        r["confidence_data_quality"] = round(random.uniform(0.5, 0.95), 2)
        r["confidence_evidence_strength"] = round(random.uniform(0.5, 0.95), 2)
        r["data"] = {"mock": True, "seeded": True}
        r["provenance"] = {"adapter": adapter_key, "version": "1.0"}
        r["retrieved_at"] = datetime.utcnow().isoformat()
        records.append(r)
    return records


def run_full_seed(store: EvidenceStore, adapter_keys: Optional[List[str]] = None):
    """Background task: re-seed the evidence store."""
    all_adapters = adapter_keys or [
        "drugbank", "pubmed", "clinvar", "reactome", "uniprot",
        "gwas_catalog", "disgenet", "string", "opentargets",
    ]
    total = 0
    for key in all_adapters:
        try:
            count = _seed_adapter(key, store)
            total += count
        except Exception as exc:
            # Log and continue; don't let one adapter kill the batch
            import logging
            logging.getLogger(__name__).warning(f"Seeding failed for {key}: {exc}")
    import logging
    logging.getLogger(__name__).info(f"Full seed complete: {total} records inserted")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/search", response_model=SearchResult)
def search_evidence(
    q: Optional[str] = Query(None, description="Free-text search across title, abstract, value"),
    adapter: Optional[str] = Query(None, description="Filter by adapter key"),
    entity_type: Optional[str] = Query(None, alias="type", description="Filter by entity type"),
    source_database: Optional[str] = Query(None, description="Filter by source database"),
    min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum overall confidence"),
    limit: int = Query(100, ge=1, le=1000, description="Page size"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    sort_by: str = Query("confidence_overall", description="Sort field"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="Sort direction"),
    store: EvidenceStore = Depends(get_store),
):
    """
    Search evidence entries with free-text, filters, sorting, and pagination.
    """
    results = store.search(
        query=q,
        adapter_key=adapter,
        entity_type=entity_type,
        source_database=source_database,
        min_confidence=min_confidence,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    # Compute total for pagination (same filters, no limit/offset)
    total = store.count(
        query=q, adapter_key=adapter, entity_type=entity_type,
        source_database=source_database
    )

    return SearchResult(
        results=results,
        total=total,
        limit=limit,
        offset=offset,
        query_params={
            "q": q,
            "adapter": adapter,
            "entity_type": entity_type,
            "source_database": source_database,
            "min_confidence": min_confidence,
            "sort_by": sort_by,
            "sort_order": sort_order,
        },
    )


@router.get("/stats", response_model=StatsResponse)
def get_stats(store: EvidenceStore = Depends(get_store)):
    """Return aggregate statistics for the evidence store."""
    stats = store.get_stats()
    return StatsResponse(**stats)


@router.get("/by-adapter/{adapter_key}")
def get_by_adapter(
    adapter_key: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    store: EvidenceStore = Depends(get_store),
):
    """Retrieve all evidence from a specific adapter."""
    results = store.get_by_adapter(adapter_key, limit=limit, offset=offset)
    total = store.count(adapter_key=adapter_key)
    return {
        "adapter_key": adapter_key,
        "results": results,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/by-type/{entity_type}")
def get_by_type(
    entity_type: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    store: EvidenceStore = Depends(get_store),
):
    """Retrieve all evidence of a specific entity type."""
    results = store.get_by_type(entity_type, limit=limit, offset=offset)
    total = store.count(entity_type=entity_type)
    return {
        "entity_type": entity_type,
        "results": results,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/by-id/{record_id}")
def get_by_id(record_id: int, store: EvidenceStore = Depends(get_store)):
    """Retrieve a single evidence record by its ID."""
    record = store.get_by_id(record_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")
    return record


@router.post("/seed", response_model=SeedResponse)
def seed_evidence(
    request: Optional[SeedRequest] = None,
    background_tasks: BackgroundTasks = None,
    store: EvidenceStore = Depends(get_store),
):
    """
    Trigger asynchronous background seeding of the evidence store.

    If `adapter_keys` is provided only those adapters are re-seeded.
    If `force_full` is True the store is cleared before seeding.
    """
    adapters = request.adapter_keys if request else None
    force_full = request.force_full if request else False

    if force_full:
        store.clear()

    scheduled = adapters or [
        "drugbank", "pubmed", "clinvar", "reactome", "uniprot",
        "gwas_catalog", "disgenet", "string", "opentargets",
    ]

    background_tasks.add_task(run_full_seed, store, adapters)

    return SeedResponse(
        status="scheduled",
        message=f"Seeding {len(scheduled)} adapter(s) in background",
        adapters_scheduled=scheduled,
        started_at=datetime.utcnow().isoformat(),
    )


@router.delete("/clear")
def clear_evidence(
    admin_token: str = Query(..., description="Admin token for destructive operation"),
    store: EvidenceStore = Depends(get_store),
):
    """Clear all evidence entries (admin only)."""
    if admin_token != ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin token"
        )
    deleted = store.clear()
    return ClearResponse(status="ok", deleted_count=deleted)


@router.get("/adapters")
def list_adapters(store: EvidenceStore = Depends(get_store)):
    """List all adapters and their record counts."""
    stats = store.get_stats()
    return {
        "adapters": stats.get("by_adapter", {}),
        "total_adapters": stats.get("unique_adapters", 0),
        "total_entries": stats.get("total_entries", 0),
    }


@router.get("/adapters/{adapter_key}/metadata")
def get_adapter_metadata(adapter_key: str, store: EvidenceStore = Depends(get_store)):
    """Get metadata for a specific adapter."""
    meta = store.get_adapter_metadata(adapter_key)
    if not meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Adapter '{adapter_key}' not found"
        )
    return meta[0]


@router.post("/adapters/{adapter_key}/metadata")
def update_adapter_metadata(
    adapter_key: str,
    metadata: AdapterMetadata,
    admin_token: str = Query(..., description="Admin token"),
    store: EvidenceStore = Depends(get_store),
):
    """Update adapter metadata (admin only)."""
    if admin_token != ADMIN_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin token"
        )
    store.update_adapter_metadata(adapter_key, metadata.model_dump())
    return {"status": "ok", "adapter_key": adapter_key}
