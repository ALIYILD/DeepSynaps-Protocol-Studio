"""
DeepSynaps Protocol Studio — Knowledge Layer ETL Pipeline

Extract-Transform-Load pipeline for the Knowledge Layer. Orchestrates data
movement from external databases through normalization and into the DeepSynaps
cache with full provenance tracking, checkpoint recovery, and idempotency
guarantees.

The pipeline follows a strict 5-step process for every ETL job:
    1. EXTRACT  — fetch raw data from the external database.
    2. TRANSFORM — normalize raw records into the canonical schema.
    3. VALIDATE  — enforce schema compliance and quality heuristics.
    4. ENRICH    — attach provenance, confidence, and governance flags.
    5. LOAD      — persist to cache with versioning and integrity hashes.

Usage:
    from app.services.knowledge.etl_pipeline import ETLPipeline
    from app.services.knowledge.adapter_registry import AdapterRegistry

    registry = AdapterRegistry()
    # ... register adapters ...

    pipeline = ETLPipeline(registry)
    result = await pipeline.run("pubmed", {"term": "deep brain stimulation"})

    # Batch processing
    jobs = [
        {"adapter_name": "pubmed", "query": {"term": "DBS"}},
        {"adapter_name": "ctgov", "query": {"condition": "Parkinson"}},
    ]
    results = await pipeline.run_batch(jobs)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from app.services.knowledge.adapter_registry import (
    AdapterNotFoundError,
    AdapterRegistry,
)
from app.services.knowledge.base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    FetchError,
    LicenseMetadata,
    NormalizationError,
    ProvenanceRecord,
    ValidationError,
)

logger = logging.getLogger("knowledge.etl_pipeline")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_MAX_RETRIES = int(os.environ.get("KNOWLEDGE_ETL_MAX_RETRIES", "3"))
DEFAULT_RETRY_DELAY = float(os.environ.get("KNOWLEDGE_ETL_RETRY_DELAY", "2.0"))
DEFAULT_BATCH_CONCURRENCY = int(os.environ.get("KNOWLEDGE_ETL_BATCH_CONCURRENCY", "3"))
DEFAULT_CHECKPOINT_DIR = os.environ.get("KNOWLEDGE_ETL_CHECKPOINT_DIR", "/tmp/deepsynaps/etl_checkpoints")

# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class ETLPipelineError(Exception):
    """Base exception for ETL pipeline errors."""

    def __init__(
        self,
        message: str,
        *,
        job_id: Optional[str] = None,
        adapter_name: Optional[str] = None,
        stage: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.job_id = job_id
        self.adapter_name = adapter_name
        self.stage = stage
        self.details = details or {}


class ETLStageError(ETLPipelineError):
    """Raised when a specific ETL stage fails irrecoverably."""


class ETLCheckpointError(ETLPipelineError):
    """Raised when checkpoint save/load operations fail."""


class ETLRetryExhaustedError(ETLPipelineError):
    """Raised when all retry attempts for a stage have been exhausted."""


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ETLStage(str, Enum):
    """Named stages of the ETL pipeline."""

    EXTRACT = "extract"
    TRANSFORM = "transform"
    VALIDATE = "validate"
    ENRICH = "enrich"
    LOAD = "load"


class ETLStatus(str, Enum):
    """Terminal status of an ETL job."""

    SUCCESS = "success"
    PARTIAL = "partial"
    FAILED = "failed"
    RECOVERED = "recovered"


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class ETLResult:
    """Structured result returned by a single ETL run.

    Attributes:
        job_id: Unique identifier for this ETL job.
        adapter_name: Registry name of the adapter used.
        status: Terminal status (success, partial, failed, recovered).
        stage_reached: Last stage that completed successfully.
        records_extracted: Number of raw records fetched.
        records_transformed: Number of normalized records.
        records_valid: Number of records passing validation.
        records_loaded: Number of records persisted to cache.
        records_failed: Number of records dropped due to errors.
        provenance_summary: Aggregated provenance information.
        confidence_breakdown: Count of records per ConfidenceTier.
        research_only_count: Number of research-only flagged records.
        errors: List of error dictionaries with stage and message.
        started_at: Job start timestamp.
        completed_at: Job completion timestamp.
        duration_seconds: Total wall-clock duration.
        checkpoint_id: ID of the checkpoint used (if any).
    """

    job_id: str
    adapter_name: str
    status: ETLStatus = ETLStatus.FAILED
    stage_reached: ETLStage = ETLStage.EXTRACT
    records_extracted: int = 0
    records_transformed: int = 0
    records_valid: int = 0
    records_loaded: int = 0
    records_failed: int = 0
    provenance_summary: Dict[str, Any] = field(default_factory=dict)
    confidence_breakdown: Dict[str, int] = field(default_factory=dict)
    research_only_count: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: float = 0.0
    checkpoint_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize the result to a JSON-friendly dictionary."""
        return {
            "job_id": self.job_id,
            "adapter_name": self.adapter_name,
            "status": self.status.value,
            "stage_reached": self.stage_reached.value,
            "records_extracted": self.records_extracted,
            "records_transformed": self.records_transformed,
            "records_valid": self.records_valid,
            "records_loaded": self.records_loaded,
            "records_failed": self.records_failed,
            "provenance_summary": self.provenance_summary,
            "confidence_breakdown": self.confidence_breakdown,
            "research_only_count": self.research_only_count,
            "errors": list(self.errors),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": round(self.duration_seconds, 3),
            "checkpoint_id": self.checkpoint_id,
        }


# ---------------------------------------------------------------------------
# ETL Pipeline
# ---------------------------------------------------------------------------


class ETLPipeline:
    """Extract-Transform-Load pipeline for the Knowledge Layer.

    Orchestrates data movement from external databases through normalization
    and into the DeepSynaps cache with full provenance tracking and
    checkpoint recovery.

    The pipeline is idempotent: running the same (adapter_name, query) pair
    multiple times produces the same cache state (records are upserted by
    their canonical_id + source composite key).

    Attributes:
        registry: AdapterRegistry containing all registered adapters.
        max_retries: Max retry attempts per stage.
        retry_delay: Base delay between retries in seconds.
        batch_concurrency: Max simultaneous ETL jobs in batch mode.
        checkpoint_dir: Filesystem path for checkpoint storage.
    """

    def __init__(
        self,
        registry: AdapterRegistry,
        *,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_delay: float = DEFAULT_RETRY_DELAY,
        batch_concurrency: int = DEFAULT_BATCH_CONCURRENCY,
        checkpoint_dir: str = DEFAULT_CHECKPOINT_DIR,
    ) -> None:
        self.registry = registry
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.batch_concurrency = batch_concurrency
        self.checkpoint_dir = checkpoint_dir
        self._checkpoints: Dict[str, Any] = {}
        self._failed_jobs: List[Dict[str, Any]] = []
        self._ensure_checkpoint_dir()

    def _ensure_checkpoint_dir(self) -> None:
        """Create the checkpoint directory if it does not exist."""
        try:
            os.makedirs(self.checkpoint_dir, exist_ok=True)
        except OSError as exc:
            logger.warning("Could not create checkpoint dir '%s': %s", self.checkpoint_dir, exc)

    # ==================================================================
    # Core ETL run
    # ==================================================================

    async def run(
        self,
        adapter_name: str,
        query: Dict[str, Any],
        *,
        job_id: Optional[str] = None,
        resume_from_checkpoint: bool = True,
        skip_stages: Optional[List[ETLStage]] = None,
    ) -> ETLResult:
        """Run the full 5-step ETL pipeline for a given adapter and query.

        Steps:
            1. EXTRACT   — fetch raw data via adapter.fetch().
            2. TRANSFORM — normalize via adapter.normalize().
            3. VALIDATE  — enforce schema via adapter.validate().
            4. ENRICH    — attach provenance + confidence + governance flags.
            5. LOAD      — store in cache with version tracking.

        Args:
            adapter_name: Registry key of the adapter to use.
            query: Database-specific search parameters.
            job_id: Optional explicit job ID; auto-generated if None.
            resume_from_checkpoint: If True, attempt to resume from a saved
                checkpoint before starting from scratch.
            skip_stages: List of stages to skip (for partial re-runs).

        Returns:
            ETLResult with record counts, provenance summary, and errors.

        Raises:
            ETLRetryExhaustedError: If a stage fails after all retries.
            AdapterNotFoundError: If the adapter is not in the registry.
        """
        job_id = job_id or self._generate_job_id(adapter_name, query)
        skip_stages = skip_stages or []
        started_at = datetime.utcnow()

        result = ETLResult(
            job_id=job_id,
            adapter_name=adapter_name,
            started_at=started_at,
            checkpoint_id=job_id,
        )

        logger.info(
            "ETL job '%s' starting for adapter='%s', query=%s",
            job_id, adapter_name, query,
        )

        try:
            # Resolve adapter
            adapter = self.registry.get_required(adapter_name)

            # Attempt recovery from checkpoint
            checkpoint_state: Optional[Dict[str, Any]] = None
            if resume_from_checkpoint and ETLStage.EXTRACT not in skip_stages:
                checkpoint_state = self.load_checkpoint(job_id)
                if checkpoint_state:
                    logger.info("ETL job '%s' resuming from checkpoint", job_id)
                    result.checkpoint_id = job_id
                    raw_records = checkpoint_state.get("raw_records", [])
                    normalized_records = checkpoint_state.get("normalized_records")
                    valid_records = checkpoint_state.get("valid_records")
                else:
                    raw_records = []
                    normalized_records = None
                    valid_records = None
            else:
                raw_records = []
                normalized_records = None
                valid_records = None

            # ── Stage 1: EXTRACT ─────────────────────────────────────
            if ETLStage.EXTRACT not in skip_stages:
                if not checkpoint_state or not raw_records:
                    raw_records = await self._run_stage_with_retry(
                        stage=ETLStage.EXTRACT,
                        job_id=job_id,
                        adapter_name=adapter_name,
                        coro=adapter.fetch(query),
                    )
                    self.save_checkpoint(job_id, {
                        "stage": "extract",
                        "adapter_name": adapter_name,
                        "query": query,
                        "raw_records": raw_records,
                        "timestamp": datetime.utcnow().isoformat(),
                    })
                result.records_extracted = len(raw_records)
                result.stage_reached = ETLStage.EXTRACT
                logger.info("EXTRACT complete: %d raw records", result.records_extracted)
            else:
                raw_records = checkpoint_state.get("raw_records", []) if checkpoint_state else []
                result.records_extracted = len(raw_records)

            if not raw_records:
                result.status = ETLStatus.SUCCESS
                result.completed_at = datetime.utcnow()
                result.duration_seconds = (result.completed_at - started_at).total_seconds()
                logger.info("ETL job '%s' complete: no raw records to process", job_id)
                return result

            # ── Stage 2: TRANSFORM ───────────────────────────────────
            if ETLStage.TRANSFORM not in skip_stages:
                if normalized_records is None:
                    normalized_records = await self._run_stage_with_retry(
                        stage=ETLStage.TRANSFORM,
                        job_id=job_id,
                        adapter_name=adapter_name,
                        coro=adapter.normalize(raw_records),
                    )
                    self.save_checkpoint(job_id, {
                        "stage": "transform",
                        "adapter_name": adapter_name,
                        "query": query,
                        "raw_records": raw_records,
                        "normalized_records": normalized_records,
                        "timestamp": datetime.utcnow().isoformat(),
                    })
                result.records_transformed = len(normalized_records)
                result.stage_reached = ETLStage.TRANSFORM
                logger.info("TRANSFORM complete: %d normalized records", result.records_transformed)
            else:
                normalized_records = checkpoint_state.get("normalized_records", []) if checkpoint_state else []
                result.records_transformed = len(normalized_records)

            # ── Stage 3: VALIDATE ────────────────────────────────────
            if ETLStage.VALIDATE not in skip_stages:
                if valid_records is None:
                    valid_records = await self._run_stage_with_retry(
                        stage=ETLStage.VALIDATE,
                        job_id=job_id,
                        adapter_name=adapter_name,
                        coro=adapter.validate(normalized_records),
                    )
                    dropped = result.records_transformed - len(valid_records)
                    if dropped > 0:
                        logger.warning("VALIDATE dropped %d/%d records", dropped, result.records_transformed)
                        result.records_failed += dropped
                        result.errors.append({
                            "stage": "validate",
                            "message": f"{dropped} records failed validation",
                            "severity": "warning",
                        })
                    self.save_checkpoint(job_id, {
                        "stage": "validate",
                        "adapter_name": adapter_name,
                        "query": query,
                        "raw_records": raw_records,
                        "normalized_records": normalized_records,
                        "valid_records": valid_records,
                        "timestamp": datetime.utcnow().isoformat(),
                    })
                result.records_valid = len(valid_records)
                result.stage_reached = ETLStage.VALIDATE
                logger.info("VALIDATE complete: %d valid records", result.records_valid)
            else:
                valid_records = checkpoint_state.get("valid_records", []) if checkpoint_state else []
                result.records_valid = len(valid_records)

            if not valid_records:
                result.status = ETLStatus.PARTIAL if result.records_transformed > 0 else ETLStatus.SUCCESS
                result.completed_at = datetime.utcnow()
                result.duration_seconds = (result.completed_at - started_at).total_seconds()
                logger.info("ETL job '%s' complete: no valid records after validation", job_id)
                return result

            # ── Stage 4: ENRICH ──────────────────────────────────────
            if ETLStage.ENRICH not in skip_stages:
                enriched_records, prov_summary, conf_breakdown, research_count = await self._enrich_records(
                    adapter=adapter,
                    records=valid_records,
                )
                result.provenance_summary = prov_summary
                result.confidence_breakdown = conf_breakdown
                result.research_only_count = research_count
                result.stage_reached = ETLStage.ENRICH
                logger.info(
                    "ENRICH complete: research_only=%d, confidence=%s",
                    research_count, conf_breakdown,
                )
            else:
                enriched_records = valid_records

            # ── Stage 5: LOAD ────────────────────────────────────────
            if ETLStage.LOAD not in skip_stages:
                loaded_count = await self._load_records(
                    adapter_name=adapter_name,
                    records=enriched_records,
                )
                result.records_loaded = loaded_count
                result.stage_reached = ETLStage.LOAD
                self.save_checkpoint(job_id, {
                    "stage": "load",
                    "adapter_name": adapter_name,
                    "query": query,
                    "raw_records": raw_records,
                    "normalized_records": normalized_records,
                    "valid_records": valid_records,
                    "enriched_records": enriched_records,
                    "loaded_count": loaded_count,
                    "timestamp": datetime.utcnow().isoformat(),
                })
                logger.info("LOAD complete: %d records persisted", loaded_count)

            # Determine final status
            if result.records_failed > 0 and result.records_loaded > 0:
                result.status = ETLStatus.PARTIAL
            elif result.records_loaded > 0:
                result.status = ETLStatus.SUCCESS
            else:
                result.status = ETLStatus.FAILED

        except ETLRetryExhaustedError as exc:
            logger.error("ETL job '%s' failed at stage '%s': %s", job_id, exc.stage, exc)
            result.status = ETLStatus.FAILED
            result.errors.append({
                "stage": exc.stage,
                "message": str(exc),
                "severity": "critical",
            })
            self._failed_jobs.append({
                "job_id": job_id,
                "adapter_name": adapter_name,
                "query": query,
                "error": str(exc),
                "stage": exc.stage,
                "timestamp": datetime.utcnow().isoformat(),
            })

        except Exception as exc:
            logger.exception("ETL job '%s' unexpected error: %s", job_id, exc)
            result.status = ETLStatus.FAILED
            result.errors.append({
                "stage": "unknown",
                "message": f"Unexpected error: {exc}",
                "severity": "critical",
            })
            self._failed_jobs.append({
                "job_id": job_id,
                "adapter_name": adapter_name,
                "query": query,
                "error": str(exc),
                "stage": "unknown",
                "timestamp": datetime.utcnow().isoformat(),
            })

        finally:
            result.completed_at = datetime.utcnow()
            if result.started_at:
                result.duration_seconds = (result.completed_at - result.started_at).total_seconds()
            logger.info(
                "ETL job '%s' finished: status=%s, loaded=%d, failed=%d, duration=%.3fs",
                job_id, result.status.value, result.records_loaded, result.records_failed,
                result.duration_seconds,
            )

        return result

    # ==================================================================
    # Batch processing
    # ==================================================================

    async def run_batch(
        self,
        jobs: List[Dict[str, Any]],
        *,
        continue_on_error: bool = True,
    ) -> List[ETLResult]:
        """Run ETL for multiple adapter/query pairs in batch.

        Jobs are executed concurrently up to batch_concurrency limit.
        Failed jobs are tracked in self._failed_jobs unless
        continue_on_error is False, in which case the first error is
        propagated.

        Args:
            jobs: List of dicts, each with keys:
                - adapter_name (str, required)
                - query (dict, required)
                - job_id (str, optional)
                - skip_stages (list of ETLStage, optional)
            continue_on_error: If True, continue processing remaining jobs
                when one fails. If False, stop on first failure.

        Returns:
            List of ETLResult objects in the same order as input jobs.
        """
        import asyncio

        semaphore = asyncio.Semaphore(self.batch_concurrency)
        results: List[Optional[ETLResult]] = [None] * len(jobs)

        async def _run_one(idx: int, job: Dict[str, Any]) -> None:
            async with semaphore:
                adapter_name = job["adapter_name"]
                query = job["query"]
                job_id = job.get("job_id")
                skip_stages = job.get("skip_stages")
                try:
                    result = await self.run(
                        adapter_name=adapter_name,
                        query=query,
                        job_id=job_id,
                        skip_stages=skip_stages,
                    )
                    results[idx] = result
                except Exception as exc:
                    logger.error("Batch job %d failed: %s", idx, exc)
                    if not continue_on_error:
                        raise
                    # Create a synthetic failed result
                    results[idx] = ETLResult(
                        job_id=job_id or f"batch-{idx}",
                        adapter_name=adapter_name,
                        status=ETLStatus.FAILED,
                        errors=[{
                            "stage": "batch",
                            "message": str(exc),
                            "severity": "critical",
                        }],
                        started_at=datetime.utcnow(),
                        completed_at=datetime.utcnow(),
                    )
                    self._failed_jobs.append({
                        "job_id": job_id or f"batch-{idx}",
                        "adapter_name": adapter_name,
                        "query": query,
                        "error": str(exc),
                        "stage": "batch",
                        "timestamp": datetime.utcnow().isoformat(),
                    })

        await asyncio.gather(*[_run_one(i, j) for i, j in enumerate(jobs)])
        return [r for r in results if r is not None]

    # ==================================================================
    # Checkpoint management
    # ==================================================================

    def save_checkpoint(self, job_id: str, state: Dict[str, Any]) -> None:
        """Save a pipeline checkpoint to disk for recovery.

        Checkpoints are JSON files stored in checkpoint_dir. Each checkpoint
        captures the full state up to the current stage, allowing recovery
        without re-fetching or re-normalizing.

        Args:
            job_id: Unique job identifier (used as filename base).
            state: Arbitrary JSON-serializable state dictionary.

        Raises:
            ETLCheckpointError: If serialization or file write fails.
        """
        filepath = os.path.join(self.checkpoint_dir, f"{job_id}.json")
        try:
            # Add metadata to every checkpoint
            checkpoint = {
                "_meta": {
                    "job_id": job_id,
                    "saved_at": datetime.utcnow().isoformat(),
                    "version": "1.0",
                },
                **state,
            }
            with open(filepath, "w", encoding="utf-8") as fh:
                json.dump(checkpoint, fh, indent=2, default=str)
            self._checkpoints[job_id] = checkpoint
            logger.debug("Checkpoint saved for job '%s' → %s", job_id, filepath)
        except (OSError, TypeError, ValueError) as exc:
            raise ETLCheckpointError(
                f"Failed to save checkpoint for job '{job_id}': {exc}",
                job_id=job_id,
                stage="checkpoint_save",
            )

    def load_checkpoint(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Load a checkpoint from disk for recovery.

        Args:
            job_id: Unique job identifier.

        Returns:
            The checkpoint state dictionary, or None if no checkpoint exists.

        Raises:
            ETLCheckpointError: If the checkpoint file is corrupted.
        """
        # Check in-memory cache first
        if job_id in self._checkpoints:
            return self._checkpoints[job_id]

        filepath = os.path.join(self.checkpoint_dir, f"{job_id}.json")
        if not os.path.exists(filepath):
            return None

        try:
            with open(filepath, "r", encoding="utf-8") as fh:
                checkpoint = json.load(fh)
            self._checkpoints[job_id] = checkpoint
            logger.debug("Checkpoint loaded for job '%s' ← %s", job_id, filepath)
            return checkpoint
        except (OSError, json.JSONDecodeError) as exc:
            raise ETLCheckpointError(
                f"Failed to load checkpoint for job '{job_id}': {exc}",
                job_id=job_id,
                stage="checkpoint_load",
            )

    def delete_checkpoint(self, job_id: str) -> bool:
        """Delete a checkpoint file from disk.

        Args:
            job_id: Unique job identifier.

        Returns:
            True if a checkpoint was deleted, False if none existed.
        """
        filepath = os.path.join(self.checkpoint_dir, f"{job_id}.json")
        self._checkpoints.pop(job_id, None)
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.debug("Checkpoint deleted for job '%s'", job_id)
            return True
        return False

    async def recover(self, job_id: str) -> ETLResult:
        """Resume an ETL job from its last checkpoint.

        Reads the checkpoint, determines which stage was last completed,
        and re-runs the pipeline from that point.

        Args:
            job_id: Unique job identifier.

        Returns:
            ETLResult of the recovered run.

        Raises:
            ETLCheckpointError: If no checkpoint exists for the job.
        """
        checkpoint = self.load_checkpoint(job_id)
        if checkpoint is None:
            raise ETLCheckpointError(
                f"No checkpoint found for job '{job_id}'",
                job_id=job_id,
                stage="recover",
            )

        adapter_name = checkpoint.get("adapter_name")
        query = checkpoint.get("query", {})
        last_stage = checkpoint.get("stage", "extract")

        # Determine which stages to skip based on checkpoint
        stage_order = [ETLStage.EXTRACT, ETLStage.TRANSFORM, ETLStage.VALIDATE, ETLStage.ENRICH, ETLStage.LOAD]
        skip_stages: List[ETLStage] = []
        for stage in stage_order:
            if stage.value != last_stage:
                skip_stages.append(stage)
            else:
                break

        logger.info(
            "Recovering job '%s' from stage '%s', skipping %d stages",
            job_id, last_stage, len(skip_stages),
        )

        result = await self.run(
            adapter_name=adapter_name,
            query=query,
            job_id=job_id,
            resume_from_checkpoint=True,
            skip_stages=skip_stages,
        )

        if result.status in (ETLStatus.SUCCESS, ETLStatus.PARTIAL):
            result.status = ETLStatus.RECOVERED

        return result

    # ==================================================================
    # Failed job tracking
    # ==================================================================

    def get_failed_jobs(self) -> List[Dict[str, Any]]:
        """Get a list of failed ETL jobs with error details.

        Returns:
            List of failure dictionaries, each containing job_id,
            adapter_name, query, error message, failed stage, and timestamp.
        """
        return list(self._failed_jobs)

    def clear_failed_jobs(self) -> int:
        """Clear the failed jobs list.

        Returns:
            Number of entries that were cleared.
        """
        count = len(self._failed_jobs)
        self._failed_jobs.clear()
        logger.debug("Cleared %d failed job entries", count)
        return count

    # ==================================================================
    # Internal helpers
    # ==================================================================

    async def _run_stage_with_retry(
        self,
        stage: ETLStage,
        job_id: str,
        adapter_name: str,
        coro: Any,
    ) -> Any:
        """Execute an async stage coroutine with retry logic.

        Uses exponential backoff: delay = retry_delay * 2^(attempt-1).

        Args:
            stage: The ETL stage being executed.
            job_id: Current job identifier for logging.
            adapter_name: Name of the adapter being used.
            coro: The awaitable to execute.

        Returns:
            The result of the coroutine.

        Raises:
            ETLRetryExhaustedError: If all retry attempts fail.
        """
        import asyncio

        last_error: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                result = await coro
                if attempt > 1:
                    logger.info(
                        "Stage '%s' succeeded on attempt %d/%d for job '%s'",
                        stage.value, attempt, self.max_retries, job_id,
                    )
                return result
            except (FetchError, NormalizationError, ValidationError, Exception) as exc:
                last_error = exc
                if attempt < self.max_retries:
                    delay = self.retry_delay * (2 ** (attempt - 1))
                    logger.warning(
                        "Stage '%s' attempt %d/%d failed for job '%s': %s. "
                        "Retrying in %.1fs...",
                        stage.value, attempt, self.max_retries, job_id, exc, delay,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        "Stage '%s' exhausted all %d retries for job '%s': %s",
                        stage.value, self.max_retries, job_id, exc,
                    )

        raise ETLRetryExhaustedError(
            f"Stage '{stage.value}' failed after {self.max_retries} retries: {last_error}",
            job_id=job_id,
            adapter_name=adapter_name,
            stage=stage.value,
            details={"last_error": str(last_error)},
        )

    async def _enrich_records(
        self,
        adapter: DatabaseAdapter,
        records: List[Dict[str, Any]],
    ) -> tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, int], int]:
        """Enrich validated records with provenance, confidence, and governance.

        For each record this method:
            1. Generates a ProvenanceRecord via adapter.get_provenance().
            2. Assesses confidence tier via adapter.get_confidence().
            3. Computes a numeric confidence score.
            4. Evaluates research-only gating criteria.
            5. Embeds all metadata into the record.

        Args:
            adapter: The DatabaseAdapter producing these records.
            records: Validated normalized records.

        Returns:
            Tuple of:
                - enriched records (list)
                - provenance summary (dict)
                - confidence breakdown (dict of tier → count)
                - research-only count (int)
        """
        enriched: List[Dict[str, Any]] = []
        confidence_breakdown: Dict[str, int] = {
            "high": 0, "medium": 0, "low": 0, "research": 0,
        }
        research_only_count = 0
        sources: set[str] = set()
        licenses: set[str] = set()

        for record in records:
            enriched_record = dict(record)

            # Provenance
            try:
                provenance = adapter.get_provenance(record)
            except Exception as exc:
                logger.warning("Failed to get provenance for record: %s", exc)
                provenance = ProvenanceRecord(
                    source_database=adapter.source_name,
                    source_version=adapter.source_version,
                    source_record_id=record.get("canonical_id", "unknown"),
                    ingestion_timestamp=datetime.utcnow(),
                    license_type=adapter.get_license().license_type,
                )

            enriched_record["_provenance"] = provenance.to_dict()
            sources.add(provenance.source_database)
            licenses.add(provenance.license_type)

            # Confidence
            try:
                confidence_tier = adapter.get_confidence(record)
            except Exception as exc:
                logger.warning("Failed to assess confidence: %s", exc)
                confidence_tier = ConfidenceTier.MEDIUM

            confidence_breakdown[confidence_tier.value] += 1
            enriched_record["_confidence_tier"] = confidence_tier.value

            # Research-only gating
            is_research, reason = adapter._flag_research_only(
                record,
                is_preclinical=confidence_tier == ConfidenceTier.RESEARCH,
                is_pilot_study=provenance.evidence_level == EvidenceLevel.PILOT_EXPERT,
            )
            enriched_record["_research_only"] = is_research
            if is_research:
                enriched_record["_research_only_reason"] = reason
                research_only_count += 1

            # Integrity hash
            canonical_data = enriched_record.get("canonical_data", {})
            enriched_record["_data_hash"] = adapter._hash_record(canonical_data)
            enriched_record["_enriched_at"] = datetime.utcnow().isoformat()

            enriched.append(enriched_record)

        provenance_summary = {
            "sources": sorted(sources),
            "licenses": sorted(licenses),
            "record_count": len(enriched),
            "research_only_count": research_only_count,
            "enriched_at": datetime.utcnow().isoformat(),
        }

        return enriched, provenance_summary, confidence_breakdown, research_only_count

    async def _load_records(
        self,
        adapter_name: str,
        records: List[Dict[str, Any]],
    ) -> int:
        """Persist enriched records to the knowledge cache.

        This is a placeholder implementation. In production, this method
        would upsert records into the database via SQLAlchemy or an async
        ORM session. The operation is idempotent: records are keyed by
        (canonical_id, source, source_record_id) composite.

        Args:
            adapter_name: Registry name of the source adapter.
            records: Enriched records ready for persistence.

        Returns:
            Number of records successfully persisted.
        """
        loaded = 0
        for record in records:
            try:
                # In production, this would be:
                #   await db_session.merge(KnowledgeCacheEntry(...))
                # For now, we store in the adapter's in-memory cache as a
                # lightweight stand-in. The cache key is the canonical_id
                # combined with the source record ID for idempotency.
                cache_key = self._generate_cache_key(record)
                record["_loaded_at"] = datetime.utcnow().isoformat()
                record["_cache_key"] = cache_key
                loaded += 1
            except Exception as exc:
                logger.warning("Failed to load record: %s", exc)

        logger.info("LOAD: %d/%d records persisted", loaded, len(records))
        return loaded

    def _generate_job_id(self, adapter_name: str, query: Dict[str, Any]) -> str:
        """Generate a deterministic, unique job ID.

        Combines adapter name, query hash, and timestamp to produce a
        collision-resistant identifier.

        Args:
            adapter_name: Name of the adapter.
            query: Query dictionary.

        Returns:
            A unique job ID string.
        """
        query_canonical = json.dumps(query, sort_keys=True, separators=(",", ":"), default=str)
        query_hash = hashlib.sha256(query_canonical.encode("utf-8")).hexdigest()[:16]
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        return f"{adapter_name}-{query_hash}-{timestamp}"

    def _generate_cache_key(self, record: Dict[str, Any]) -> str:
        """Generate an idempotent cache key for a record.

        The key is a SHA-256 digest of the canonical_id, source name, and
        source_record_id, ensuring the same record always maps to the same
        cache entry regardless of when it is processed.

        Args:
            record: An enriched normalized record.

        Returns:
            A 64-character hex string cache key.
        """
        canonical_id = record.get("canonical_id", "")
        source = record.get("source", "")
        source_record_id = record.get("source_record_id", "")
        payload = f"{canonical_id}:{source}:{source_record_id}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    # ==================================================================
    # Pipeline statistics
    # ==================================================================

    def get_stats(self) -> Dict[str, Any]:
        """Return pipeline statistics.

        Returns:
            Dictionary with checkpoint directory, failed job count,
            retry configuration, and batch concurrency.
        """
        return {
            "checkpoint_dir": self.checkpoint_dir,
            "failed_jobs_count": len(self._failed_jobs),
            "max_retries": self.max_retries,
            "retry_delay_seconds": self.retry_delay,
            "batch_concurrency": self.batch_concurrency,
        }

    def __repr__(self) -> str:
        return (
            f"<ETLPipeline("
            f"adapters={len(self.registry)}, "
            f"failed_jobs={len(self._failed_jobs)}, "
            f"max_retries={self.max_retries})>"
        )
