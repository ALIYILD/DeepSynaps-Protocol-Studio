"""
Tests for Evidence Store, Evidence Router, and Seed Scheduler.

Uses temporary SQLite databases and FastAPI TestClient.
"""

import os
import sys
import json
import pytest
import tempfile
import time
from datetime import datetime
from typing import Generator

# Ensure the module under test is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from evidence_store import EvidenceStore
from evidence_router import router as evidence_router, get_store, ADMIN_TOKEN
from seed_scheduler import (
    EvidenceSeedScheduler,
    SchedulerBackend,
    SeedJob,
    JobStatus,
    get_default_scheduler,
    list_jobs,
    get_job,
    register_job,
)

from fastapi import FastAPI
from fastapi.testclient import TestClient


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def temp_db_path() -> Generator[str, None, None]:
    """Provide a temporary file path for a SQLite database."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    yield path
    os.unlink(path)


@pytest.fixture
def store(temp_db_path: str) -> EvidenceStore:
    """Provide a fresh EvidenceStore instance backed by a temporary DB."""
    return EvidenceStore(db_path=temp_db_path)


@pytest.fixture
def client(store: EvidenceStore) -> Generator[TestClient, None, None]:
    """Provide a FastAPI TestClient wired to the temporary store."""
    app = FastAPI()

    def override_get_store():
        return store

    evidence_router.dependencies = []
    app.include_router(evidence_router)

    # Override the dependency
    from evidence_router import get_store as original_get_store
    app.dependency_overrides[original_get_store] = override_get_store

    with TestClient(app) as tc:
        yield tc

    app.dependency_overrides.clear()


@pytest.fixture
def sample_records() -> list:
    """Sample evidence records for testing."""
    now = datetime.utcnow().isoformat()
    return [
        {
            "adapter_key": "drugbank",
            "source_database": "DrugBank",
            "entity_type": "drug",
            "title": "Metformin",
            "abstract": "First-line antidiabetic medication",
            "value": "antidiabetic",
            "unit": "class",
            "confidence_overall": 0.95,
            "confidence_data_quality": 0.92,
            "confidence_evidence_strength": 0.94,
            "data": {"pubchem_cid": 4091, "synonyms": ["Glucophage"]},
            "provenance": {"version": "5.1.10"},
            "retrieved_at": now,
        },
        {
            "adapter_key": "pubmed",
            "source_database": "PubMed",
            "entity_type": "publication",
            "title": "Genomic study of type 2 diabetes",
            "abstract": "GWAS identifies 50 novel loci",
            "value": "GWAS",
            "unit": "study_type",
            "confidence_overall": 0.88,
            "confidence_data_quality": 0.85,
            "confidence_evidence_strength": 0.90,
            "data": {"pmid": "12345678", "doi": "10.1000/test"},
            "provenance": {"date": "2024-01-15"},
            "retrieved_at": now,
        },
        {
            "adapter_key": "clinvar",
            "source_database": "ClinVar",
            "entity_type": "variant",
            "title": "BRCA1 c.5096G>A",
            "abstract": "Pathogenic variant associated with breast cancer",
            "value": "pathogenic",
            "unit": "classification",
            "confidence_overall": 0.92,
            "confidence_data_quality": 0.91,
            "confidence_evidence_strength": 0.93,
            "data": {"hgvs": "NM_007294.3:c.5096G>A"},
            "provenance": {"submitter": "BRCA Exchange"},
            "retrieved_at": now,
        },
        {
            "adapter_key": "drugbank",
            "source_database": "DrugBank",
            "entity_type": "drug",
            "title": "Aspirin",
            "abstract": "Salicylate analgesic",
            "value": "analgesic",
            "unit": "class",
            "confidence_overall": 0.78,
            "confidence_data_quality": 0.80,
            "confidence_evidence_strength": 0.75,
            "data": {"pubchem_cid": 2244},
            "provenance": {"version": "5.1.10"},
            "retrieved_at": now,
        },
        {
            "adapter_key": "reactome",
            "source_database": "Reactome",
            "entity_type": "pathway",
            "title": "Glycolysis",
            "abstract": "Metabolic pathway converting glucose to pyruvate",
            "value": "metabolic",
            "unit": "category",
            "confidence_overall": 0.85,
            "confidence_data_quality": 0.82,
            "confidence_evidence_strength": 0.87,
            "data": {"pathway_id": "R-HSA-70171"},
            "provenance": {"release": 86},
            "retrieved_at": now,
        },
    ]


# ============================================================================
# EvidenceStore tests
# ============================================================================

class TestEvidenceStore:

    def test_init_db(self, store: EvidenceStore):
        """Database initializes with correct tables."""
        # Should not raise; tables exist
        stats = store.get_stats()
        assert stats["total_entries"] == 0

    def test_insert_and_get(self, store: EvidenceStore, sample_records: list):
        """Insert a record and retrieve it by ID."""
        record = sample_records[0]
        row_id = store.insert(record)
        assert row_id > 0

        fetched = store.get_by_id(row_id)
        assert fetched is not None
        assert fetched["adapter_key"] == "drugbank"
        assert fetched["title"] == "Metformin"
        assert fetched["data"]["pubchem_cid"] == 4091
        assert fetched["provenance"]["version"] == "5.1.10"

    def test_bulk_insert(self, store: EvidenceStore, sample_records: list):
        """Bulk insert returns correct count."""
        count = store.bulk_insert(sample_records)
        assert count == len(sample_records)
        assert store.count() == len(sample_records)

    def test_search_no_filters(self, store: EvidenceStore, sample_records: list):
        """Search with no filters returns all records."""
        store.bulk_insert(sample_records)
        results = store.search()
        assert len(results) == len(sample_records)

    def test_search_by_query(self, store: EvidenceStore, sample_records: list):
        """Free-text search across title/abstract/value."""
        store.bulk_insert(sample_records)
        results = store.search(query="Metformin")
        assert len(results) == 1
        assert results[0]["title"] == "Metformin"

    def test_search_by_adapter(self, store: EvidenceStore, sample_records: list):
        """Filter by adapter key."""
        store.bulk_insert(sample_records)
        results = store.search(adapter_key="drugbank")
        assert len(results) == 2
        assert all(r["adapter_key"] == "drugbank" for r in results)

    def test_search_by_entity_type(self, store: EvidenceStore, sample_records: list):
        """Filter by entity type."""
        store.bulk_insert(sample_records)
        results = store.search(entity_type="variant")
        assert len(results) == 1
        assert results[0]["entity_type"] == "variant"

    def test_search_by_min_confidence(self, store: EvidenceStore, sample_records: list):
        """Filter by minimum confidence."""
        store.bulk_insert(sample_records)
        results = store.search(min_confidence=0.90)
        assert len(results) == 2
        assert all(r["confidence_overall"] >= 0.90 for r in results)

    def test_search_combined_filters(self, store: EvidenceStore, sample_records: list):
        """Combine multiple filters."""
        store.bulk_insert(sample_records)
        results = store.search(adapter_key="drugbank", min_confidence=0.80)
        assert len(results) == 1
        assert results[0]["title"] == "Metformin"

    def test_search_sorting(self, store: EvidenceStore, sample_records: list):
        """Sorting by confidence_overall desc."""
        store.bulk_insert(sample_records)
        results = store.search(sort_by="confidence_overall", sort_order="desc")
        scores = [r["confidence_overall"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_search_pagination(self, store: EvidenceStore, sample_records: list):
        """Limit and offset pagination."""
        store.bulk_insert(sample_records)
        page1 = store.search(limit=2, offset=0)
        page2 = store.search(limit=2, offset=2)
        assert len(page1) == 2
        assert len(page2) == 2
        # Pages should not overlap
        ids1 = {r["id"] for r in page1}
        ids2 = {r["id"] for r in page2}
        assert not ids1 & ids2

    def test_get_by_adapter(self, store: EvidenceStore, sample_records: list):
        """Retrieve by adapter key."""
        store.bulk_insert(sample_records)
        results = store.get_by_adapter("pubmed")
        assert len(results) == 1
        assert results[0]["adapter_key"] == "pubmed"

    def test_get_by_type(self, store: EvidenceStore, sample_records: list):
        """Retrieve by entity type."""
        store.bulk_insert(sample_records)
        results = store.get_by_type("drug")
        assert len(results) == 2

    def test_get_by_source_database(self, store: EvidenceStore, sample_records: list):
        """Retrieve by source database."""
        store.bulk_insert(sample_records)
        results = store.get_by_source_database("DrugBank")
        assert len(results) == 2

    def test_count(self, store: EvidenceStore, sample_records: list):
        """Count with and without filters."""
        store.bulk_insert(sample_records)
        assert store.count() == 5
        assert store.count(adapter_key="drugbank") == 2
        assert store.count(entity_type="publication") == 1
        assert store.count(source_database="ClinVar") == 1

    def test_stats(self, store: EvidenceStore, sample_records: list):
        """Statistics aggregation."""
        store.bulk_insert(sample_records)
        stats = store.get_stats()
        assert stats["total_entries"] == 5
        assert stats["by_adapter"]["drugbank"] == 2
        assert stats["by_entity_type"]["drug"] == 2
        assert stats["confidence_stats"]["count"] == 5
        assert stats["unique_adapters"] == 4
        assert stats["unique_entity_types"] == 4
        assert stats["confidence_tiers"]["high"] >= 2
        assert "generated_at" in stats

    def test_clear(self, store: EvidenceStore, sample_records: list):
        """Clear removes all records."""
        store.bulk_insert(sample_records)
        assert store.count() == 5
        deleted = store.clear()
        assert deleted == 5
        assert store.count() == 0

    def test_delete_by_adapter(self, store: EvidenceStore, sample_records: list):
        """Delete by adapter key."""
        store.bulk_insert(sample_records)
        deleted = store.delete_by_adapter("drugbank")
        assert deleted == 2
        assert store.count() == 3
        assert store.count(adapter_key="drugbank") == 0

    def test_adapter_metadata(self, store: EvidenceStore):
        """CRUD for adapter metadata."""
        meta = {
            "adapter_name": "DrugBank Adapter",
            "adapter_version": "2.1.0",
            "source_url": "https://go.drugbank.com/",
            "records_count": 42,
            "status": "active",
            "config": {"batch_size": 500},
        }
        store.update_adapter_metadata("drugbank", meta)
        fetched = store.get_adapter_metadata("drugbank")
        assert len(fetched) == 1
        assert fetched[0]["adapter_name"] == "DrugBank Adapter"
        assert fetched[0]["config"]["batch_size"] == 500

        all_meta = store.get_adapter_metadata()
        assert len(all_meta) == 1

    def test_cache(self, store: EvidenceStore):
        """Cache set/get/expiration."""
        store.set_cache("mykey", "myvalue", ttl_seconds=3600)
        assert store.get_cache("mykey") == "myvalue"
        assert store.get_cache("missing") is None

    def test_cache_expired(self, store: EvidenceStore):
        """Cache entry with a negative TTL should not be retrievable."""
        store.set_cache("quick", "value", ttl_seconds=-1)
        assert store.get_cache("quick") is None

    def test_thread_safety(self, store: EvidenceStore):
        """Concurrent insertions work correctly."""
        import threading

        errors = []
        row_ids = []

        def _insert(i):
            try:
                rid = store.insert({
                    "adapter_key": "thread_test",
                    "source_database": "TestDB",
                    "entity_type": "test",
                    "title": f"Thread record {i}",
                })
                row_ids.append(rid)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=_insert, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"Thread errors: {errors}"
        assert store.count() == 20

    def test_invalid_sort_by_fallback(self, store: EvidenceStore, sample_records: list):
        """Invalid sort_by falls back to confidence_overall."""
        store.bulk_insert(sample_records)
        # Should not raise; uses fallback
        results = store.search(sort_by="invalid_column")
        assert len(results) == len(sample_records)


# ============================================================================
# Evidence Router (FastAPI) tests
# ============================================================================

class TestEvidenceRouter:

    def test_search_endpoint(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """GET /knowledge/evidence/search returns paginated results."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/search?q=Metformin")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert any("Metformin" in r.get("title", "") for r in data["results"])

    def test_search_by_adapter(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """Filter by adapter via query param."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/search?adapter=pubmed")
        assert response.status_code == 200
        data = response.json()
        assert all(r["adapter_key"] == "pubmed" for r in data["results"])

    def test_search_by_entity_type(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """Filter by entity type via query param."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/search?type=variant")
        assert response.status_code == 200
        data = response.json()
        assert all(r["entity_type"] == "variant" for r in data["results"])

    def test_search_min_confidence(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """Filter by min_confidence."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/search?min_confidence=0.90")
        assert response.status_code == 200
        data = response.json()
        assert all(r["confidence_overall"] >= 0.90 for r in data["results"])

    def test_stats_endpoint(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """GET /knowledge/evidence/stats returns statistics."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["total_entries"] == 5
        assert "by_adapter" in data
        assert "confidence_stats" in data

    def test_by_adapter_endpoint(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """GET /knowledge/evidence/by-adapter/{key} returns adapter records."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/by-adapter/drugbank")
        assert response.status_code == 200
        data = response.json()
        assert data["adapter_key"] == "drugbank"
        assert data["total"] == 2

    def test_by_type_endpoint(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """GET /knowledge/evidence/by-type/{type} returns typed records."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/by-type/pathway")
        assert response.status_code == 200
        data = response.json()
        assert data["entity_type"] == "pathway"
        assert data["total"] == 1

    def test_by_id_endpoint(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """GET /knowledge/evidence/by-id/{id} returns a single record."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/by-id/1")
        assert response.status_code == 200
        assert "adapter_key" in response.json()

    def test_by_id_not_found(self, client: TestClient, store: EvidenceStore):
        """GET /knowledge/evidence/by-id/{id} 404 for missing ID."""
        response = client.get("/knowledge/evidence/by-id/9999")
        assert response.status_code == 404

    def test_seed_endpoint(self, client: TestClient):
        """POST /knowledge/evidence/seed schedules background seeding."""
        response = client.post("/knowledge/evidence/seed")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "scheduled"
        assert "adapters_scheduled" in data

    def test_seed_endpoint_with_body(self, client: TestClient):
        """POST /knowledge/evidence/seed with explicit adapter list."""
        payload = {"adapter_keys": ["drugbank", "pubmed"], "force_full": False}
        response = client.post("/knowledge/evidence/seed", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert "drugbank" in data["adapters_scheduled"]
        assert "pubmed" in data["adapters_scheduled"]

    def test_clear_endpoint_forbidden(self, client: TestClient):
        """DELETE /knowledge/evidence/clear without token fails."""
        response = client.delete("/knowledge/evidence/clear?admin_token=bad-token")
        assert response.status_code == 403

    def test_clear_endpoint_authorized(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """DELETE /knowledge/evidence/clear with correct token succeeds."""
        store.bulk_insert(sample_records)
        response = client.delete(f"/knowledge/evidence/clear?admin_token={ADMIN_TOKEN}")
        assert response.status_code == 200
        data = response.json()
        assert data["deleted_count"] == 5
        assert store.count() == 0

    def test_list_adapters_endpoint(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """GET /knowledge/evidence/adapters lists adapter counts."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/adapters")
        assert response.status_code == 200
        data = response.json()
        assert data["total_adapters"] == 4
        assert "drugbank" in data["adapters"]

    def test_adapter_metadata_endpoint(self, client: TestClient, store: EvidenceStore):
        """GET /knowledge/evidence/adapters/{key}/metadata returns metadata."""
        store.update_adapter_metadata("drugbank", {"adapter_name": "DrugBank", "records_count": 10})
        response = client.get("/knowledge/evidence/adapters/drugbank/metadata")
        assert response.status_code == 200
        data = response.json()
        assert data["adapter_key"] == "drugbank"
        assert data["adapter_name"] == "DrugBank"

    def test_adapter_metadata_not_found(self, client: TestClient):
        """GET metadata for unknown adapter returns 404."""
        response = client.get("/knowledge/evidence/adapters/unknown/metadata")
        assert response.status_code == 404

    def test_update_adapter_metadata_admin(self, client: TestClient, store: EvidenceStore):
        """POST metadata update requires admin token."""
        payload = {
            "adapter_key": "test",
            "adapter_name": "Test Adapter",
            "records_count": 5,
            "status": "active",
            "config": {},
        }
        response = client.post(
            f"/knowledge/evidence/adapters/test/metadata?admin_token={ADMIN_TOKEN}",
            json=payload,
        )
        assert response.status_code == 200
        assert store.get_adapter_metadata("test")[0]["adapter_name"] == "Test Adapter"

    def test_search_pagination_via_endpoint(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """Pagination query params work via endpoint."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/search?limit=2&offset=0")
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 2
        assert data["limit"] == 2
        assert data["offset"] == 0

    def test_search_sort_params(self, client: TestClient, store: EvidenceStore, sample_records: list):
        """Sort params work via endpoint."""
        store.bulk_insert(sample_records)
        response = client.get("/knowledge/evidence/search?sort_by=confidence_overall&sort_order=asc")
        assert response.status_code == 200
        data = response.json()
        scores = [r["confidence_overall"] for r in data["results"] if r["confidence_overall"] is not None]
        assert scores == sorted(scores)


# ============================================================================
# Seed Scheduler tests
# ============================================================================

class TestSeedScheduler:

    def test_scheduler_init_thread(self):
        """Thread scheduler initializes cleanly."""
        sched = EvidenceSeedScheduler(backend=SchedulerBackend.THREAD)
        assert sched.backend == SchedulerBackend.THREAD

    def test_run_once_sync(self, temp_db_path: str, sample_records: list):
        """Run a one-off seed synchronously."""
        store = EvidenceStore(db_path=temp_db_path)

        def _seed(store_instance, adapters):
            for rec in sample_records:
                rec_copy = rec.copy()
                rec_copy["adapter_key"] = adapters[0]
                store_instance.insert(rec_copy)

        sched = EvidenceSeedScheduler(
            backend=SchedulerBackend.THREAD,
            store_factory=lambda: store,
            seed_func=_seed,
        )
        job_id = sched.run_once(["drugbank"], background=False)
        assert job_id is not None
        job = get_job(job_id)
        assert job is not None
        assert job.status == JobStatus.COMPLETED
        assert store.count() == len(sample_records)

    def test_run_once_background(self, temp_db_path: str, sample_records: list):
        """Run a one-off seed in background and wait for completion."""
        store = EvidenceStore(db_path=temp_db_path)

        def _seed(store_instance, adapters):
            for rec in sample_records[:2]:
                rec_copy = rec.copy()
                rec_copy["adapter_key"] = adapters[0]
                store_instance.insert(rec_copy)

        sched = EvidenceSeedScheduler(
            backend=SchedulerBackend.THREAD,
            store_factory=lambda: store,
            seed_func=_seed,
        )
        job_id = sched.run_once(["pubmed"], background=True)
        # Wait a bit for background thread
        time.sleep(0.5)
        job = get_job(job_id)
        assert job.status == JobStatus.COMPLETED
        assert store.count() == 2

    def test_periodic_job_thread(self, temp_db_path: str, sample_records: list):
        """Periodic thread job runs at least once."""
        store = EvidenceStore(db_path=temp_db_path)
        call_count = [0]

        def _seed(store_instance, adapters):
            call_count[0] += 1
            for rec in sample_records[:1]:
                rec_copy = rec.copy()
                rec_copy["adapter_key"] = adapters[0]
                store_instance.insert(rec_copy)

        sched = EvidenceSeedScheduler(
            backend=SchedulerBackend.THREAD,
            store_factory=lambda: store,
            seed_func=_seed,
        )
        job_id = sched.schedule_periodic(["drugbank"], interval_minutes=0.01)  # ~0.6 sec
        time.sleep(0.3)  # Wait for at least one iteration
        sched.cancel_job(job_id)
        assert call_count[0] >= 1
        assert store.count() >= 1

    def test_cancel_job(self, temp_db_path: str):
        """Cancelling a job updates its status."""
        store = EvidenceStore(db_path=temp_db_path)
        sched = EvidenceSeedScheduler(
            backend=SchedulerBackend.THREAD,
            store_factory=lambda: store,
            seed_func=lambda s, a: None,
        )
        job_id = sched.schedule_periodic(["x"], interval_minutes=1)
        assert sched.cancel_job(job_id) is True
        job = get_job(job_id)
        assert job.status == JobStatus.CANCELLED

    def test_cancel_nonexistent_job(self):
        """Cancelling unknown job returns False."""
        sched = EvidenceSeedScheduler(backend=SchedulerBackend.THREAD)
        assert sched.cancel_job("nonexistent") is False

    def test_health(self):
        """Health endpoint returns status."""
        sched = EvidenceSeedScheduler(backend=SchedulerBackend.THREAD)
        h = sched.health()
        assert h["backend"] == "thread"
        assert "active_jobs" in h

    def test_default_scheduler_factory(self):
        """get_default_scheduler creates a scheduler."""
        sched = get_default_scheduler()
        assert sched is not None

    def test_job_registry(self):
        """Jobs can be registered and retrieved."""
        job = SeedJob(job_id="test-1", adapter_keys=["a"])
        register_job(job)
        fetched = get_job("test-1")
        assert fetched is not None
        assert fetched.job_id == "test-1"

    def test_list_jobs(self):
        """list_jobs returns all registered jobs."""
        register_job(SeedJob(job_id="lj-1"))
        register_job(SeedJob(job_id="lj-2"))
        jobs = list_jobs()
        ids = {j["job_id"] for j in jobs}
        assert "lj-1" in ids
        assert "lj-2" in ids

    def test_apscheduler_import_error(self):
        """APScheduler backend raises if not installed."""
        # This will fail because apscheduler is not installed
        with pytest.raises(RuntimeError):
            sched = EvidenceSeedScheduler(backend=SchedulerBackend.APSCHEDULER)
            # Force initialization by scheduling
            sched._init_apscheduler()

    def test_seed_job_to_dict(self):
        """SeedJob serializes correctly."""
        job = SeedJob(
            job_id="jd-1",
            adapter_keys=["drugbank"],
            schedule_type="periodic",
            interval_minutes=60,
            status=JobStatus.PENDING,
        )
        d = job.to_dict()
        assert d["job_id"] == "jd-1"
        assert d["schedule_type"] == "periodic"
        assert d["status"] == "pending"

    def test_scheduler_shutdown(self, temp_db_path: str):
        """Shutdown cleans up thread resources."""
        store = EvidenceStore(db_path=temp_db_path)
        sched = EvidenceSeedScheduler(
            backend=SchedulerBackend.THREAD,
            store_factory=lambda: store,
            seed_func=lambda s, a: None,
        )
        job_id = sched.schedule_periodic(["a"], interval_minutes=60)
        sched.shutdown(wait=False)
        # After shutdown, the thread should have been cleaned up
        assert job_id not in sched._threads


# ============================================================================
# Integration tests
# ============================================================================

class TestIntegration:

    def test_full_workflow(self, temp_db_path: str, sample_records: list):
        """End-to-end: seed via scheduler, query via store, verify via router."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        store = EvidenceStore(db_path=temp_db_path)

        # 1. Seed via scheduler
        def _seed(store_instance, adapters):
            for rec in sample_records:
                rec_copy = rec.copy()
                store_instance.insert(rec_copy)

        sched = EvidenceSeedScheduler(
            backend=SchedulerBackend.THREAD,
            store_factory=lambda: store,
            seed_func=_seed,
        )
        job_id = sched.run_once(["drugbank", "pubmed", "clinvar"], background=False)
        assert get_job(job_id).status == JobStatus.COMPLETED
        assert store.count() == len(sample_records)

        # 2. Build router with this store
        app = FastAPI()
        from evidence_router import get_store as original_get_store
        app.include_router(evidence_router)
        app.dependency_overrides[original_get_store] = lambda: store

        with TestClient(app) as client:
            # 3. Query via endpoints
            resp = client.get("/knowledge/evidence/search?q=BRCA1")
            assert resp.status_code == 200
            data = resp.json()
            assert data["total"] == 1

            resp = client.get("/knowledge/evidence/stats")
            assert resp.status_code == 200
            stats = resp.json()
            assert stats["total_entries"] == len(sample_records)

            # 4. Clear via endpoint
            resp = client.delete(f"/knowledge/evidence/clear?admin_token={ADMIN_TOKEN}")
            assert resp.status_code == 200
            assert resp.json()["deleted_count"] == len(sample_records)
            assert store.count() == 0

        sched.shutdown(wait=False)
