#!/usr/bin/env python3
"""
Test suite for the DeepSynaps Evidence Store Seeding Pipeline.

Covers:
  - Database schema initialization
  - Adapter instantiation and registration (all 67 adapters)
  - Connection validation
  - Search and canonical transformation
  - Batched insertion
  - Resume / checkpointing
  - Graceful failure handling
  - Rate limiting
  - CLI argument parsing
  - End-to-end dry-run

Usage:
    pytest test_seed_pipeline.py -v
    python3 test_seed_pipeline.py          # runs via unittest
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

# Ensure the module under test is importable
sys.path.insert(0, str(Path(__file__).parent))

from seed_evidence_store import (
    ADAPTER_REGISTRY,
    BaseAdapter,
    CanonicalRecord,
    ConfidenceScores,
    DatabaseManager,
    Provenance,
    SeedingPipeline,
    get_adapter,
    list_adapters,
    main,
    setup_logging,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


class InMemoryDBManager(DatabaseManager):
    """DatabaseManager that uses a shared :memory: database for fast tests.

    SQLite :memory: creates a new DB per connection by default.
    We keep a persistent connection alive so all connections share the same data.
    """

    _counter = 0
    _keepers: dict = {}  # class-level persistent connections

    def __init__(self, **kwargs: Any) -> None:
        InMemoryDBManager._counter += 1
        self._instance_id = InMemoryDBManager._counter
        # Use a named in-memory DB; first connection becomes the keeper
        db_path = f"file:memdb{self._instance_id}?mode=memory&cache=shared"
        kwargs.setdefault("batch_size", kwargs.get("batch_size", 100))
        super().__init__(db_path=db_path, **kwargs)
        # Open keeper connection immediately so DB stays alive
        self._keeper = sqlite3.connect(self.db_path, uri=True)
        InMemoryDBManager._keepers[self._instance_id] = self._keeper

    @contextmanager
    def connection(self):
        """Override to use uri=True for shared in-memory databases."""
        conn = sqlite3.connect(self.db_path, uri=True, timeout=30.0)
        try:
            conn.execute("PRAGMA journal_mode=MEMORY")
            conn.execute("PRAGMA synchronous=OFF")
            conn.execute("PRAGMA temp_store=MEMORY")
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            conn.close()

    def close(self) -> int:
        """Close keeper connection and return total inserted."""
        result = super().close()
        keeper = InMemoryDBManager._keepers.pop(self._instance_id, None)
        if keeper:
            keeper.close()
        return result


class FailingAdapter(BaseAdapter):
    """Adapter that always fails — for testing graceful degradation."""

    ADAPTER_KEY = "failing_adapter"
    DATABASE_NAME = "FailingDB"

    def validate_connection(self) -> bool:
        raise ConnectionError("Simulated connection failure")

    def search(self, query: str, **kwargs: Any) -> List[dict]:
        raise RuntimeError("Simulated search failure")

    def transform_to_canonical(self, raw: dict, query: str) -> CanonicalRecord:
        raise RuntimeError("Simulated transform failure")


class EmptyAdapter(BaseAdapter):
    """Adapter that returns no results."""

    ADAPTER_KEY = "empty_adapter"
    DATABASE_NAME = "EmptyDB"

    def validate_connection(self) -> bool:
        self._connection_validated = True
        return True

    def search(self, query: str, **kwargs: Any) -> List[dict]:
        return []

    def transform_to_canonical(self, raw: dict, query: str) -> CanonicalRecord:
        raise NotImplementedError("Should never be called")


class CustomMockAdapter(BaseAdapter):
    """Adapter with deterministic output for assertions."""

    ADAPTER_KEY = "custom_mock"
    DATABASE_NAME = "CustomMockDB"
    SUPPORTED_ENTITY_TYPES = ["evidence"]

    def __init__(self, records_to_return: int = 3, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.records_to_return = records_to_return
        self.search_calls: List[str] = []
        self.transform_calls: List[dict] = []

    def validate_connection(self) -> bool:
        self._connection_validated = True
        return True

    def search(self, query: str, **kwargs: Any) -> List[dict]:
        self.search_calls.append(query)
        return [
            {
                "raw_id": f"CMOCK_{i:03d}",
                "title": f"Result {i} for {query}",
                "value": i * 10,
            }
            for i in range(self.records_to_return)
        ]

    def transform_to_canonical(self, raw: dict, query: str) -> CanonicalRecord:
        self.transform_calls.append(raw)
        confidence = ConfidenceScores(
            overall=0.85,
            data_quality=0.90,
            evidence_strength=0.80,
            sample_size=0.75,
            replication=0.70,
            consistency=0.85,
            temporal=0.80,
            population=0.75,
        )
        provenance = Provenance(
            adapter_key=self.ADAPTER_KEY,
            source_database=self.DATABASE_NAME,
            query_used=query,
        )
        return CanonicalRecord(
            adapter_key=self.ADAPTER_KEY,
            source_database=self.DATABASE_NAME,
            source_id=raw["raw_id"],
            entity_type="evidence",
            title=raw.get("title"),
            value=str(raw.get("value")),
            confidence=confidence,
            data=raw,
            provenance=provenance,
        )


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------


class TestAdapterRegistry(unittest.TestCase):
    """Ensure all 67 adapters are registered and instantiable."""

    def test_registry_has_67_adapters(self) -> None:
        self.assertEqual(len(ADAPTER_REGISTRY), 67, "Expected 67 adapters")

    def test_all_keys_are_lowercase(self) -> None:
        for key in ADAPTER_REGISTRY:
            self.assertEqual(key, key.lower(), f"Adapter key {key!r} is not lowercase")

    def test_no_duplicate_keys(self) -> None:
        keys = list(ADAPTER_REGISTRY.keys())
        self.assertEqual(len(keys), len(set(keys)), "Duplicate adapter keys found")

    def test_list_adapters_returns_sorted_list(self) -> None:
        adapters = list_adapters()
        self.assertEqual(len(adapters), 67)
        self.assertEqual(adapters, sorted(adapters))

    def test_every_adapter_is_subclass_of_base(self) -> None:
        for key, cls in ADAPTER_REGISTRY.items():
            self.assertTrue(
                issubclass(cls, BaseAdapter),
                f"{key}: {cls} is not a subclass of BaseAdapter",
            )

    def test_every_adapter_has_key_and_name(self) -> None:
        import logging
        logger = logging.getLogger("test")
        for key in list_adapters():
            adapter = get_adapter(key, logger)
            self.assertTrue(adapter.ADAPTER_KEY, f"{key}: missing ADAPTER_KEY")
            self.assertTrue(adapter.DATABASE_NAME, f"{key}: missing DATABASE_NAME")

    def test_get_adapter_unknown_key_raises(self) -> None:
        import logging
        with self.assertRaises(ValueError) as ctx:
            get_adapter("nonexistent_adapter", logging.getLogger("test"))
        self.assertIn("nonexistent_adapter", str(ctx.exception))


class TestDataModels(unittest.TestCase):
    """Unit tests for dataclasses and serialization."""

    def test_confidence_scores_default(self) -> None:
        c = ConfidenceScores()
        self.assertEqual(c.overall, 0.0)
        self.assertEqual(c.data_quality, 0.0)

    def test_confidence_to_dict(self) -> None:
        c = ConfidenceScores(overall=0.9, data_quality=0.8)
        d = c.to_dict()
        self.assertEqual(d["overall"], 0.9)
        self.assertEqual(d["data_quality"], 0.8)

    def test_provenance_to_dict(self) -> None:
        p = Provenance(
            adapter_key="pubmed",
            source_database="PubMed",
            query_used="depression",
        )
        d = p.to_dict()
        self.assertEqual(d["adapter_key"], "pubmed")
        self.assertEqual(d["query_used"], "depression")
        self.assertIn("retrieval_timestamp", d)

    def test_canonical_record_to_insert_tuple(self) -> None:
        record = CanonicalRecord(
            adapter_key="pubmed",
            source_database="PubMed",
            source_id="PMID:12345",
            entity_type="publication",
            title="Test Title",
            confidence=ConfidenceScores(overall=0.75),
            provenance=Provenance("pubmed", "PubMed", query_used="test"),
        )
        tup = record.to_insert_tuple()
        self.assertEqual(len(tup), 20)
        self.assertEqual(tup[0], "pubmed")
        self.assertEqual(tup[4], "publication")
        self.assertEqual(tup[9], 0.75)


class TestDatabaseManager(unittest.TestCase):
    """Tests for DatabaseManager — schema, insertion, checkpointing."""

    def setUp(self) -> None:
        self.db = InMemoryDBManager()
        self.db.initialize_schema()

    def test_schema_creates_tables(self) -> None:
        with self.db.connection() as conn:
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_entries'"
            )
            self.assertIsNotNone(cur.fetchone())

    def test_schema_creates_checkpoint_table(self) -> None:
        with self.db.connection() as conn:
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='_seed_checkpoint'"
            )
            self.assertIsNotNone(cur.fetchone())

    def test_schema_creates_indexes(self) -> None:
        with self.db.connection() as conn:
            cur = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
            )
            indexes = {row[0] for row in cur.fetchall()}
        expected = {"idx_adapter", "idx_entity", "idx_database", "idx_confidence"}
        self.assertTrue(expected.issubset(indexes), f"Missing indexes: {expected - indexes}")

    def test_enqueue_and_flush(self) -> None:
        record = CanonicalRecord(
            adapter_key="test",
            source_database="TestDB",
            source_id="T1",
            entity_type="evidence",
            title="Test",
            confidence=ConfidenceScores(overall=0.5),
            provenance=Provenance("test", "TestDB"),
        )
        self.db.enqueue(record)
        inserted = self.db.flush()
        self.assertEqual(inserted, 1)

    def test_batch_flush_automatic(self) -> None:
        """Buffer should auto-flush when batch_size reached."""
        small_db = InMemoryDBManager(batch_size=3)
        small_db.initialize_schema()
        for i in range(5):
            record = CanonicalRecord(
                adapter_key="test",
                source_database="TestDB",
                source_id=f"T{i}",
                entity_type="evidence",
                confidence=ConfidenceScores(),
                provenance=Provenance("test", "TestDB"),
            )
            small_db.enqueue(record)
        # After 5 enqueues with batch_size=3, buffer should have 2
        self.assertEqual(len(small_db._buffer), 2)
        small_db.close()

    def test_checkpoint_mark_and_check(self) -> None:
        self.db.mark_adapter_status("pubmed", "completed", records_count=42)
        self.assertTrue(self.db.is_adapter_seeded("pubmed"))
        self.assertFalse(self.db.is_adapter_seeded("drugbank"))

    def test_checkpoint_upsert(self) -> None:
        self.db.mark_adapter_status("pubmed", "failed", error_message="timeout")
        self.db.mark_adapter_status("pubmed", "completed", records_count=10)
        with self.db.connection() as conn:
            cur = conn.execute(
                "SELECT status, error_message FROM _seed_checkpoint WHERE adapter_key='pubmed'"
            )
            row = cur.fetchone()
        self.assertEqual(row["status"], "completed")
        # Error message should be cleared on upsert
        self.assertIsNone(row["error_message"])

    def test_dry_run_no_persist(self) -> None:
        dry_db = InMemoryDBManager(dry_run=True)
        dry_db.initialize_schema()
        record = CanonicalRecord(
            adapter_key="test",
            source_database="TestDB",
            source_id="T1",
            entity_type="evidence",
            confidence=ConfidenceScores(),
            provenance=Provenance("test", "TestDB"),
        )
        dry_db.enqueue(record)
        dry_db.close()
        # Buffer should be empty after close in dry-run
        self.assertEqual(len(dry_db._buffer), 0)

    def test_flush_returns_zero_on_empty_buffer(self) -> None:
        self.assertEqual(self.db.flush(), 0)


class TestBaseAdapter(unittest.TestCase):
    """Tests for BaseAdapter behaviour and mock subclasses."""

    def test_mock_pubmed_search_returns_records(self) -> None:
        import logging
        adapter = get_adapter("pubmed", logging.getLogger("test"))
        self.assertTrue(adapter.validate_connection())
        results = adapter.search("depression", max_results=5)
        self.assertEqual(len(results), 5)
        self.assertIn("raw_id", results[0])
        self.assertIn("title", results[0])

    def test_mock_pubmed_transform(self) -> None:
        import logging
        adapter = get_adapter("pubmed", logging.getLogger("test"))
        adapter.validate_connection()
        raw = adapter.search("depression", max_results=1)[0]
        canonical = adapter.transform_to_canonical(raw, "depression")
        self.assertIsInstance(canonical, CanonicalRecord)
        self.assertEqual(canonical.adapter_key, "pubmed")
        self.assertEqual(canonical.source_database, "PubMed")
        self.assertIsNotNone(canonical.provenance)

    def test_mock_clinicaltrials_search(self) -> None:
        import logging
        adapter = get_adapter("clinicaltrials", logging.getLogger("test"))
        self.assertTrue(adapter.validate_connection())
        results = adapter.search("tDCS", max_results=3)
        self.assertEqual(len(results), 3)
        self.assertIn("status", results[0])
        self.assertIn("phase", results[0])

    def test_mock_drugbank_search(self) -> None:
        import logging
        adapter = get_adapter("drugbank", logging.getLogger("test"))
        self.assertTrue(adapter.validate_connection())
        results = adapter.search("sertraline", max_results=2)
        self.assertEqual(len(results), 2)
        self.assertIn("mechanism", results[0])

    def test_mock_genetics_search(self) -> None:
        import logging
        adapter = get_adapter("clinvar", logging.getLogger("test"))
        self.assertTrue(adapter.validate_connection())
        results = adapter.search("BDNF", max_results=4)
        self.assertEqual(len(results), 4)
        self.assertIn("variant_id", results[0])

    def test_mock_neuroimaging_search(self) -> None:
        import logging
        adapter = get_adapter("neurovault", logging.getLogger("test"))
        self.assertTrue(adapter.validate_connection())
        results = adapter.search("depression", max_results=2)
        self.assertEqual(len(results), 2)
        self.assertIn("modality", results[0])
        self.assertIn("brain_region", results[0])

    def test_mock_adverse_event_search(self) -> None:
        import logging
        adapter = get_adapter("faers", logging.getLogger("test"))
        self.assertTrue(adapter.validate_connection())
        results = adapter.search("sertraline", max_results=3)
        self.assertEqual(len(results), 3)
        self.assertIn("reaction", results[0])
        self.assertIn("seriousness", results[0])

    def test_mock_guideline_search(self) -> None:
        import logging
        adapter = get_adapter("nice", logging.getLogger("test"))
        self.assertTrue(adapter.validate_connection())
        results = adapter.search("depression", max_results=2)
        self.assertEqual(len(results), 2)
        self.assertIn("recommendation_strength", results[0])

    def test_mock_biomarker_search(self) -> None:
        import logging
        adapter = get_adapter("biomarker_db", logging.getLogger("test"))
        self.assertTrue(adapter.validate_connection())
        results = adapter.search("cortisol", max_results=2)
        self.assertEqual(len(results), 2)
        self.assertIn("sensitivity", results[0])
        self.assertIn("auroc", results[0])

    def test_search_without_validation_raises(self) -> None:
        import logging
        adapter = get_adapter("pubmed", logging.getLogger("test"))
        # Do NOT validate
        with self.assertRaises(RuntimeError):
            adapter.search("depression")

    def test_compute_confidence_returns_scores(self) -> None:
        import logging
        adapter = get_adapter("pubmed", logging.getLogger("test"))
        scores = adapter.compute_confidence({"sample": "data"})
        self.assertIsInstance(scores, ConfidenceScores)
        self.assertGreaterEqual(scores.overall, 0.0)
        self.assertLessEqual(scores.overall, 1.0)


class TestSeedingPipeline(unittest.TestCase):
    """Integration tests for the full seeding pipeline."""

    def setUp(self) -> None:
        self.seed_queries = {
            "evidence": ["depression", "anxiety"],
            "pharmaceutical": ["sertraline"],
        }

    def test_pipeline_with_custom_mock_adapter(self) -> None:
        import logging
        db = InMemoryDBManager(batch_size=5)
        db.initialize_schema()

        # Temporarily register custom adapter
        from seed_evidence_store import ADAPTER_REGISTRY as reg
        reg["custom_mock"] = CustomMockAdapter

        try:
            pipeline = SeedingPipeline(
                db_manager=db,
                seed_queries=self.seed_queries,
                adapters=["custom_mock"],
                rate_limit_delay=0,
                max_results_per_query=3,
                logger=logging.getLogger("test"),
            )
            report = pipeline.run()

            self.assertIn("custom_mock", report["adapter_breakdown"])
            # 2 query categories x 2/1 queries x 3 results = 9 or more
            self.assertGreater(report["total_records"], 0)
            self.assertEqual(report["failed"], 0)
        finally:
            del reg["custom_mock"]

    def test_pipeline_skips_already_seeded_on_resume(self) -> None:
        import logging
        db = InMemoryDBManager()
        db.initialize_schema()
        db.mark_adapter_status("pubmed", "completed", records_count=100)

        # Patch ADAPTER_REGISTRY with just pubmed
        with patch.dict(
            ADAPTER_REGISTRY, {"pubmed": ADAPTER_REGISTRY["pubmed"]}, clear=True
        ):
            # Need to also patch list_adapters
            with patch("seed_evidence_store.list_adapters", return_value=["pubmed"]):
                pipeline = SeedingPipeline(
                    db_manager=db,
                    seed_queries=self.seed_queries,
                    adapters=["pubmed"],
                    rate_limit_delay=0,
                    resume=True,
                    logger=logging.getLogger("test"),
                )
                report = pipeline.run()

        self.assertEqual(report["skipped"], 1)
        self.assertEqual(report["total_records"], 0)

    def test_pipeline_graceful_failure(self) -> None:
        import logging
        db = InMemoryDBManager()
        db.initialize_schema()

        with patch.dict(ADAPTER_REGISTRY, {"failing_adapter": FailingAdapter}):
            with patch("seed_evidence_store.list_adapters", return_value=["failing_adapter"]):
                pipeline = SeedingPipeline(
                    db_manager=db,
                    seed_queries=self.seed_queries,
                    adapters=["failing_adapter"],
                    rate_limit_delay=0,
                    logger=logging.getLogger("test"),
                )
                report = pipeline.run()

        self.assertEqual(report["failed"], 1)
        self.assertEqual(report["total_records"], 0)

    def test_empty_adapter_produces_no_records(self) -> None:
        import logging
        db = InMemoryDBManager()
        db.initialize_schema()

        with patch.dict(ADAPTER_REGISTRY, {"empty_adapter": EmptyAdapter}):
            with patch("seed_evidence_store.list_adapters", return_value=["empty_adapter"]):
                pipeline = SeedingPipeline(
                    db_manager=db,
                    seed_queries=self.seed_queries,
                    adapters=["empty_adapter"],
                    rate_limit_delay=0,
                    logger=logging.getLogger("test"),
                )
                report = pipeline.run()

        self.assertEqual(report["total_records"], 0)
        self.assertEqual(report["successful"], 1)

    def test_rate_limit_is_applied(self) -> None:
        import logging
        db = InMemoryDBManager()
        db.initialize_schema()

        with patch.dict(ADAPTER_REGISTRY, {"custom_mock": CustomMockAdapter}):
            with patch("seed_evidence_store.list_adapters", return_value=["custom_mock"]):
                pipeline = SeedingPipeline(
                    db_manager=db,
                    seed_queries={"evidence": ["q1"]},
                    adapters=["custom_mock"],
                    rate_limit_delay=0.1,
                    max_results_per_query=1,
                    logger=logging.getLogger("test"),
                )
                t0 = time.time()
                pipeline.run()
                elapsed = time.time() - t0
                # With 0.1s rate limit and at least 1 query, should take >= 0.1s
                self.assertGreaterEqual(elapsed, 0.05)


class TestCLI(unittest.TestCase):
    """Tests for command-line interface."""

    def test_parse_defaults(self) -> None:
        from seed_evidence_store import parse_args
        args = parse_args([])
        self.assertEqual(args.adapters, "all")
        self.assertEqual(args.batch_size, 100)
        self.assertFalse(args.dry_run)
        self.assertFalse(args.resume)

    def test_parse_dry_run(self) -> None:
        from seed_evidence_store import parse_args
        args = parse_args(["--dry-run"])
        self.assertTrue(args.dry_run)

    def test_parse_resume(self) -> None:
        from seed_evidence_store import parse_args
        args = parse_args(["--resume"])
        self.assertTrue(args.resume)

    def test_parse_custom_adapters(self) -> None:
        from seed_evidence_store import parse_args
        args = parse_args(["--adapters", "pubmed,drugbank"])
        self.assertEqual(args.adapters, "pubmed,drugbank")

    def test_parse_batch_size(self) -> None:
        from seed_evidence_store import parse_args
        args = parse_args(["--batch-size", "250"])
        self.assertEqual(args.batch_size, 250)

    def test_parse_rate_limit(self) -> None:
        from seed_evidence_store import parse_args
        args = parse_args(["--rate-limit", "3.5"])
        self.assertEqual(args.rate_limit, 3.5)

    def test_parse_invalid_adapter_returns_error(self) -> None:
        with patch("sys.argv", ["seed_evidence_store.py", "--adapters", "bogus"]), \
             patch("seed_evidence_store.setup_logging"), \
             patch("seed_evidence_store.DatabaseManager") as mock_db:
            # Prevent actual DB initialization
            mock_db.return_value = MagicMock()
            rc = main()
            self.assertEqual(rc, 1)


class TestLoggingSetup(unittest.TestCase):
    """Ensure logging infrastructure works."""

    def test_setup_logging_returns_logger(self) -> None:
        logger = setup_logging()
        self.assertIsInstance(logger, type(logging.getLogger("test")))

    def test_setup_logging_level(self) -> None:
        import logging
        logger = setup_logging(logging.DEBUG)
        self.assertEqual(logger.level, logging.DEBUG)


class TestConcurrencyAndIsolation(unittest.TestCase):
    """Verify thread-safety assumptions of DatabaseManager."""

    def test_multiple_db_managers_independent(self) -> None:
        db1 = InMemoryDBManager()
        db1.initialize_schema()
        db2 = InMemoryDBManager()
        db2.initialize_schema()

        # Insert into db1
        record = CanonicalRecord(
            adapter_key="test",
            source_database="TestDB",
            source_id="T1",
            entity_type="evidence",
            confidence=ConfidenceScores(),
            provenance=Provenance("test", "TestDB"),
        )
        db1.enqueue(record)
        db1.close()

        # db2 should be empty
        with db2.connection() as conn:
            cur = conn.execute("SELECT COUNT(*) FROM evidence_entries")
            count = cur.fetchone()[0]
        self.assertEqual(count, 0)


class TestSeedQueriesJson(unittest.TestCase):
    """Validate the seed_queries.json file."""

    def test_json_file_exists(self) -> None:
        path = Path(__file__).with_name("seed_queries.json")
        self.assertTrue(path.exists(), f"{path} not found")

    def test_json_is_valid(self) -> None:
        path = Path(__file__).with_name("seed_queries.json")
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        self.assertIsInstance(data, dict)

    def test_expected_categories_present(self) -> None:
        path = Path(__file__).with_name("seed_queries.json")
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        expected = {
            "neuroimaging", "genetics", "pharmaceutical",
            "evidence", "adverse_event", "biomarker", "device",
        }
        self.assertTrue(expected.issubset(set(data.keys())))

    def test_all_values_are_non_empty_lists(self) -> None:
        path = Path(__file__).with_name("seed_queries.json")
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        for category, queries in data.items():
            self.assertIsInstance(queries, list, f"{category} is not a list")
            self.assertGreater(len(queries), 0, f"{category} is empty")
            for q in queries:
                self.assertIsInstance(q, str)
                self.assertTrue(q.strip(), f"Empty query in {category}")

    def test_no_duplicate_queries_within_category(self) -> None:
        path = Path(__file__).with_name("seed_queries.json")
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        for category, queries in data.items():
            self.assertEqual(len(queries), len(set(queries)),
                             f"Duplicates in {category}")


class TestIntegrationEndToEnd(unittest.TestCase):
    """Full end-to-end test with a temporary on-disk database."""

    def test_e2e_three_adapters(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
            db_path = tmp.name

        try:
            from seed_evidence_store import DatabaseManager, SeedingPipeline
            import logging

            db = DatabaseManager(
                db_path=db_path,
                batch_size=10,
                logger=logging.getLogger("e2e"),
            )
            db.initialize_schema()

            seed_queries = {
                "evidence": ["depression"],
                "pharmaceutical": ["sertraline"],
            }

            pipeline = SeedingPipeline(
                db_manager=db,
                seed_queries=seed_queries,
                adapters=["pubmed", "drugbank", "clinicaltrials"],
                rate_limit_delay=0,
                max_results_per_query=2,
                logger=logging.getLogger("e2e"),
            )
            report = pipeline.run()

            self.assertGreater(report["total_records"], 0)
            self.assertEqual(report["failed"], 0)

            # Verify records actually in DB
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            cur = conn.execute("SELECT COUNT(*) AS cnt FROM evidence_entries")
            db_count = cur.fetchone()["cnt"]
            conn.close()

            self.assertEqual(db_count, report["total_records"])
        finally:
            os.unlink(db_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    unittest.main(verbosity=2)
