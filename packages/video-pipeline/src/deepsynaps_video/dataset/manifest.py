"""Manifest schema for labeled clips.

A manifest is a parquet (or DB-table-shaped) file with one row per clip and
strict patient-level splits — no patient ID may appear in both ``train`` and
``test``.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ManifestRow:
    clip_id: str
    patient_id: str
    task_id: str
    side: str
    ground_truth_score: int | None
    capture_context: dict[str, str] = field(default_factory=dict)
    split: str = "train"  # train | val | test
    consent_id: str | None = None


def write_manifest(rows: list[ManifestRow], path: str) -> None:
    """Write a labeled-clip manifest to parquet. TODO(impl)."""

    raise NotImplementedError


def load_manifest(path: str) -> list[ManifestRow]:
    """Load and validate a manifest (patient-level split check). TODO(impl)."""

    raise NotImplementedError


__all__ = ["ManifestRow", "load_manifest", "write_manifest"]
