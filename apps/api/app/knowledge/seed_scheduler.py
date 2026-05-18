"""
Seed Scheduler — Background task scheduler for evidence store re-seeding.

Supports both APScheduler (in-process) and Celery (distributed) backends.
Provides a unified interface for scheduling periodic or one-off seed jobs.
"""

import os
import time
import threading
from typing import Callable, Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Status enums
# ---------------------------------------------------------------------------
class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SchedulerBackend(str, Enum):
    APSCHEDULER = "apscheduler"
    CELERY = "celery"
    THREAD = "thread"


# ---------------------------------------------------------------------------
# Job result tracking
# ---------------------------------------------------------------------------
class SeedJob:
    """Represents a scheduled seed job."""

    def __init__(
        self,
        job_id: str,
        adapter_keys: Optional[List[str]] = None,
        schedule_type: str = "immediate",  # immediate, periodic, cron
        interval_minutes: Optional[int] = None,
        status: JobStatus = JobStatus.PENDING,
    ):
        self.job_id = job_id
        self.adapter_keys = adapter_keys or []
        self.schedule_type = schedule_type
        self.interval_minutes = interval_minutes
        self.status = status
        self.created_at = datetime.utcnow().isoformat()
        self.started_at: Optional[str] = None
        self.finished_at: Optional[str] = None
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "adapter_keys": self.adapter_keys,
            "schedule_type": self.schedule_type,
            "interval_minutes": self.interval_minutes,
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "result": self.result,
            "error": self.error,
        }


# ---------------------------------------------------------------------------
# In-memory job registry
# ---------------------------------------------------------------------------
_registry_lock = threading.Lock()
_jobs: Dict[str, SeedJob] = {}


def register_job(job: SeedJob) -> None:
    with _registry_lock:
        _jobs[job.job_id] = job


def get_job(job_id: str) -> Optional[SeedJob]:
    with _registry_lock:
        return _jobs.get(job_id)


def list_jobs() -> List[Dict[str, Any]]:
    with _registry_lock:
        return [job.to_dict() for job in _jobs.values()]


# ---------------------------------------------------------------------------
# Scheduler interface
# ---------------------------------------------------------------------------
class EvidenceSeedScheduler:
    """
    Unified scheduler for evidence store seeding.

    Usage (APScheduler):
        sched = EvidenceSeedScheduler(backend=SchedulerBackend.APSCHEDULER)
        sched.schedule_periodic(["drugbank", "pubmed"], interval_minutes=60)
        sched.start()

    Usage (Celery):
        sched = EvidenceSeedScheduler(backend=SchedulerBackend.CELERY)
        # Requires celery beat + worker setup

    Usage (Thread — lightweight, no external deps):
        sched = EvidenceSeedScheduler(backend=SchedulerBackend.THREAD)
        sched.schedule_periodic(["drugbank"], interval_minutes=5)
        sched.start()
    """

    def __init__(
        self,
        backend: SchedulerBackend = SchedulerBackend.THREAD,
        store_factory: Optional[Callable] = None,
        seed_func: Optional[Callable] = None,
    ):
        self.backend = backend
        self.store_factory = store_factory
        self.seed_func = seed_func
        self._scheduler = None
        self._threads: Dict[str, threading.Thread] = {}
        self._stop_events: Dict[str, threading.Event] = {}

    # -----------------------------------------------------------------------
    # 1. APScheduler backend
    # -----------------------------------------------------------------------
    def _init_apscheduler(self):
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
            from apscheduler.triggers.interval import IntervalTrigger
            self._scheduler = BackgroundScheduler()
            self._IntervalTrigger = IntervalTrigger
            logger.info("APScheduler backend initialized")
        except ImportError:
            raise RuntimeError(
                "APScheduler backend requested but 'apscheduler' not installed. "
                "Install with: pip install apscheduler"
            )

    def _ap_schedule_periodic(self, adapter_keys: List[str], interval_minutes: int, job_id: str):
        trigger = self._IntervalTrigger(minutes=interval_minutes)

        def _job_wrapper():
            job = get_job(job_id)
            if job:
                job.status = JobStatus.RUNNING
                job.started_at = datetime.utcnow().isoformat()
            try:
                store = self.store_factory() if self.store_factory else None
                if self.seed_func and store:
                    self.seed_func(store, adapter_keys)
                if job:
                    job.status = JobStatus.COMPLETED
                    job.finished_at = datetime.utcnow().isoformat()
                    job.result = {"adapters": adapter_keys, "store": str(store)}
            except Exception as exc:
                logger.exception("Periodic seed job failed")
                if job:
                    job.status = JobStatus.FAILED
                    job.error = str(exc)

        self._scheduler.add_job(
            _job_wrapper,
            trigger=trigger,
            id=job_id,
            replace_existing=True,
        )
        logger.info(f"APScheduler periodic job {job_id} registered ({interval_minutes} min)")

    # -----------------------------------------------------------------------
    # 2. Celery backend
    # -----------------------------------------------------------------------
    def _init_celery(self):
        try:
            from celery import Celery
            self._celery_app = Celery("evidence_seed")
            logger.info("Celery backend initialized")
        except ImportError:
            raise RuntimeError(
                "Celery backend requested but 'celery' not installed. "
                "Install with: pip install celery"
            )

    def _celery_schedule_periodic(self, adapter_keys: List[str], interval_minutes: int, job_id: str):
        # In a real deployment this is driven by celery beat schedule config.
        # We provide a stub that enqueues an immediate task.
        @self._celery_app.task(bind=True, max_retries=3)
        def seed_task(task_self, adapters):
            job = get_job(job_id)
            if job:
                job.status = JobStatus.RUNNING
                job.started_at = datetime.utcnow().isoformat()
            try:
                store = self.store_factory() if self.store_factory else None
                if self.seed_func and store:
                    self.seed_func(store, adapters)
                if job:
                    job.status = JobStatus.COMPLETED
                    job.finished_at = datetime.utcnow().isoformat()
                    job.result = {"adapters": adapters}
            except Exception as exc:
                logger.exception("Celery seed task failed")
                if job:
                    job.status = JobStatus.FAILED
                    job.error = str(exc)
                raise task_self.retry(exc=exc, countdown=60)

        # Enqueue one immediate run; beat handles the recurrence
        seed_task.delay(adapter_keys)
        logger.info(f"Celery task {job_id} enqueued for {adapter_keys}")

    # -----------------------------------------------------------------------
    # 3. Thread backend (lightweight, pure stdlib)
    # -----------------------------------------------------------------------
    def _thread_schedule_periodic(self, adapter_keys: List[str], interval_minutes: int, job_id: str):
        stop_event = threading.Event()
        self._stop_events[job_id] = stop_event

        def _loop():
            job = get_job(job_id)
            while not stop_event.is_set():
                if job:
                    job.status = JobStatus.RUNNING
                    job.started_at = datetime.utcnow().isoformat()
                try:
                    store = self.store_factory() if self.store_factory else None
                    if self.seed_func and store:
                        self.seed_func(store, adapter_keys)
                    if job:
                        job.status = JobStatus.COMPLETED
                        job.finished_at = datetime.utcnow().isoformat()
                        job.result = {"adapters": adapter_keys}
                except Exception as exc:
                    logger.exception("Thread seed loop failed")
                    if job:
                        job.status = JobStatus.FAILED
                        job.error = str(exc)
                # Sleep until next interval
                stop_event.wait(timeout=interval_minutes * 60)

        t = threading.Thread(target=_loop, name=f"seed-{job_id}", daemon=True)
        self._threads[job_id] = t
        t.start()
        logger.info(f"Thread periodic job {job_id} started ({interval_minutes} min)")

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------
    def schedule_periodic(
        self,
        adapter_keys: List[str],
        interval_minutes: int = 60,
        job_id: Optional[str] = None,
    ) -> str:
        """Schedule a periodic re-seeding job. Returns job_id."""
        job_id = job_id or f"periodic-{adapter_keys[0]}-{int(time.time())}"
        job = SeedJob(
            job_id=job_id,
            adapter_keys=adapter_keys,
            schedule_type="periodic",
            interval_minutes=interval_minutes,
        )
        register_job(job)

        if self.backend == SchedulerBackend.APSCHEDULER:
            if self._scheduler is None:
                self._init_apscheduler()
            self._ap_schedule_periodic(adapter_keys, interval_minutes, job_id)

        elif self.backend == SchedulerBackend.CELERY:
            if not hasattr(self, "_celery_app"):
                self._init_celery()
            self._celery_schedule_periodic(adapter_keys, interval_minutes, job_id)

        elif self.backend == SchedulerBackend.THREAD:
            self._thread_schedule_periodic(adapter_keys, interval_minutes, job_id)

        else:
            raise ValueError(f"Unknown backend: {self.backend}")

        return job_id

    def run_once(
        self,
        adapter_keys: List[str],
        job_id: Optional[str] = None,
        background: bool = True,
    ) -> str:
        """Run a one-off seed job. Returns job_id."""
        job_id = job_id or f"onetime-{int(time.time())}"
        job = SeedJob(
            job_id=job_id,
            adapter_keys=adapter_keys,
            schedule_type="immediate",
        )
        register_job(job)

        def _run():
            job.status = JobStatus.RUNNING
            job.started_at = datetime.utcnow().isoformat()
            try:
                store = self.store_factory() if self.store_factory else None
                if self.seed_func and store:
                    self.seed_func(store, adapter_keys)
                job.status = JobStatus.COMPLETED
                job.finished_at = datetime.utcnow().isoformat()
                job.result = {"adapters": adapter_keys}
            except Exception as exc:
                logger.exception("One-off seed job failed")
                job.status = JobStatus.FAILED
                job.error = str(exc)

        if background:
            t = threading.Thread(target=_run, name=f"onetime-{job_id}", daemon=True)
            t.start()
        else:
            _run()

        return job_id

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a running or pending job."""
        job = get_job(job_id)
        if not job:
            return False

        if self.backend == SchedulerBackend.APSCHEDULER and self._scheduler:
            try:
                self._scheduler.remove_job(job_id)
            except Exception:
                pass

        elif self.backend == SchedulerBackend.THREAD:
            stop_event = self._stop_events.pop(job_id, None)
            if stop_event:
                stop_event.set()
            thread = self._threads.pop(job_id, None)
            if thread and thread.is_alive():
                thread.join(timeout=5)

        job.status = JobStatus.CANCELLED
        return True

    def start(self) -> None:
        """Start the scheduler (only needed for APScheduler)."""
        if self.backend == SchedulerBackend.APSCHEDULER and self._scheduler:
            self._scheduler.start()
            logger.info("APScheduler started")

    def shutdown(self, wait: bool = True) -> None:
        """Gracefully shut down the scheduler."""
        if self.backend == SchedulerBackend.APSCHEDULER and self._scheduler:
            self._scheduler.shutdown(wait=wait)
            logger.info("APScheduler shut down")

        elif self.backend == SchedulerBackend.THREAD:
            for job_id, stop_event in list(self._stop_events.items()):
                stop_event.set()
            for job_id, t in list(self._threads.items()):
                if t.is_alive():
                    t.join(timeout=5 if wait else 1)
            self._stop_events.clear()
            self._threads.clear()
            logger.info("Thread scheduler shut down")

    def health(self) -> Dict[str, Any]:
        """Return scheduler health status."""
        return {
            "backend": self.backend.value,
            "running": bool(
                self._scheduler and self._scheduler.running
            ) if self.backend == SchedulerBackend.APSCHEDULER else True,
            "active_jobs": len(_jobs),
            "jobs": list_jobs(),
        }


# ---------------------------------------------------------------------------
# Convenience: default scheduler instance
# ---------------------------------------------------------------------------
def get_default_scheduler(
    store_factory: Optional[Callable] = None,
    seed_func: Optional[Callable] = None,
) -> EvidenceSeedScheduler:
    """Create a default scheduler instance using the THREAD backend."""
    backend_name = os.getenv("SEED_SCHEDULER_BACKEND", "thread").lower()
    try:
        backend = SchedulerBackend(backend_name)
    except ValueError:
        backend = SchedulerBackend.THREAD
    return EvidenceSeedScheduler(backend=backend, store_factory=store_factory, seed_func=seed_func)
