from __future__ import annotations

import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.persistence.models import QeegAnalysisJob

_log = logging.getLogger(__name__)


@dataclass
class WorkerStatus:
    running: bool = False
    last_tick_at: Optional[str] = None
    last_error: Optional[str] = None
    last_error_at: Optional[str] = None
    interval_sec: int = 2
    processed_last_hour: int = 0
    errors_last_hour: int = 0


_LOCK = threading.Lock()
_INSTANCE: "Optional[Qeeg105Worker]" = None


def env_enabled() -> bool:
    return os.environ.get("DEEPSYNAPS_QEEG_105_WORKER_ENABLED", "").strip() == "1"


def env_interval_sec() -> int:
    raw = os.environ.get("DEEPSYNAPS_QEEG_105_WORKER_INTERVAL_SEC", "").strip()
    try:
        v = int(raw) if raw else 2
    except ValueError:
        v = 2
    return max(1, v)


class Qeeg105Worker:
    def __init__(self) -> None:
        self.status = WorkerStatus(interval_sec=env_interval_sec())
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self.status.running = True
        self._thread = threading.Thread(target=self._run_loop, name="qeeg-105-worker", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self.status.running = False

    def _run_loop(self) -> None:
        while not self._stop.is_set():
            started = time.time()
            try:
                self.tick()
                self.status.last_error = None
            except Exception as exc:  # pragma: no cover
                _log.exception("qeeg-105 worker tick failed")
                self.status.last_error = f"{type(exc).__name__}: {exc}"
                self.status.last_error_at = datetime.now(timezone.utc).isoformat()
                self.status.errors_last_hour += 1
            self.status.last_tick_at = datetime.now(timezone.utc).isoformat()
            elapsed = time.time() - started
            sleep_for = max(0.0, float(self.status.interval_sec) - elapsed)
            self._stop.wait(timeout=sleep_for)

    def tick(self) -> int:
        """Claim and process at most one queued job.

        Phase 0: compute is not implemented. We atomically claim a job row and
        transition it to failed with an honest message. This proves the queue +
        audit path without falsely claiming analysis outputs.
        """
        db = SessionLocal()
        try:
            claimed = self._claim_one(db)
            if claimed is None:
                return 0
            job_id, analysis_code = claimed
            job = db.query(QeegAnalysisJob).filter(QeegAnalysisJob.id == job_id).first()
            if job is None:
                return 0
            job.status = "failed"
            job.completed_at = datetime.now(timezone.utc)
            job.error_message = (
                f"Phase 0 stub: compute() not implemented for '{analysis_code}'. "
                "This job runner is a scaffold only."
            )
            db.commit()
            self.status.processed_last_hour += 1
            return 1
        finally:
            db.close()

    def _claim_one(self, db: Session) -> Optional[tuple[str, str]]:
        # Postgres-only: use SKIP LOCKED to allow multiple workers without
        # double-claiming. In SQLite test envs this will fail; Phase 0 does not
        # run the worker in CI.
        row = db.execute(
            text(
                """
                SELECT id, analysis_code
                FROM qeeg_analysis_jobs
                WHERE status = 'queued'
                ORDER BY created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """
            )
        ).fetchone()
        if row is None:
            return None
        job_id, analysis_code = str(row[0]), str(row[1])
        db.execute(
            text(
                "UPDATE qeeg_analysis_jobs SET status='running', started_at=now() WHERE id=:id"
            ),
            {"id": job_id},
        )
        db.commit()
        return job_id, analysis_code


def get_worker() -> Qeeg105Worker:
    global _INSTANCE
    with _LOCK:
        if _INSTANCE is None:
            _INSTANCE = Qeeg105Worker()
        return _INSTANCE


def start_worker_if_enabled() -> None:
    if not env_enabled():
        _log.info("qeeg-105 worker disabled via env")
        return
    get_worker().start()


def shutdown_worker() -> None:
    global _INSTANCE
    with _LOCK:
        if _INSTANCE is None:
            return
        _INSTANCE.stop()
        _INSTANCE = None

