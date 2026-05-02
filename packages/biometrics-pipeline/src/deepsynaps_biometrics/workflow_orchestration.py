"""Batch orchestration hooks for workers (Celery / APScheduler) — wire in apps/api."""

from __future__ import annotations

from deepsynaps_biometrics.enums import SyncStatus


def run_scheduled_biometric_sync(connection_id: str) -> SyncStatus:
    del connection_id
    return SyncStatus.PENDING
