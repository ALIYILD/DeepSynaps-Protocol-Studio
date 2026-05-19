"""PyBIDS query helpers.

BIDS subject IDs are already pseudonymous by spec; we hash them again so any
incidentally-real identifiers (e.g. clinic MRNs accidentally used as IDs)
cannot leak.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

try:
    from bids import BIDSLayout
    HAS_PYBIDS: bool = True
except ImportError:
    BIDSLayout = None  # type: ignore[assignment,misc]
    HAS_PYBIDS = False

from app.services.neuroimaging.schemas import BIDSFileRef, LayoutSummary


def _pseudo_subject(subject: str) -> str:
    """Return a 12-char hex pseudonym for *subject* via SHA-256."""
    return hashlib.sha256(subject.encode()).hexdigest()[:12]


def open_layout(root: str | Path, *, database_path: str | None = None):
    """Open a BIDSLayout for *root*.

    Raises ImportError if pybids is not installed.
    """
    if not HAS_PYBIDS:
        raise ImportError("pybids is not installed")
    kwargs: dict[str, Any] = {}
    if database_path is not None:
        kwargs["database_path"] = database_path
    return BIDSLayout(str(root), **kwargs)


def summarise_layout(layout) -> LayoutSummary:
    """Return a LayoutSummary for an open BIDSLayout."""
    if not HAS_PYBIDS:
        raise ImportError("pybids is not installed")
    subjects = layout.get_subjects()
    sessions = layout.get_sessions()
    try:
        modalities = layout.get_datatypes()
    except Exception:
        modalities = []
    tasks = layout.get_tasks()
    return LayoutSummary(
        n_subjects=len(subjects),
        n_sessions=len(sessions),
        modalities=sorted(modalities),
        tasks=sorted(tasks),
        validated=False,
    )


def query_files(layout, **filters) -> list[BIDSFileRef]:
    """Query a BIDSLayout and return BIDSFileRef list with pseudonymised subject IDs."""
    if not HAS_PYBIDS:
        raise ImportError("pybids is not installed")
    files = layout.get(**filters)
    refs: list[BIDSFileRef] = []
    for f in files:
        entities = f.get_entities()
        raw_subject = entities.get("subject")
        pseudo_subject = _pseudo_subject(raw_subject) if raw_subject else None
        refs.append(
            BIDSFileRef(
                path=str(f.path),
                subject=pseudo_subject,
                session=entities.get("session"),
                task=entities.get("task"),
                modality=entities.get("datatype"),
                suffix=entities.get("suffix"),
            )
        )
    return refs
