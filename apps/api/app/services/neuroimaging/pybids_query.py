"""PyBIDS query helpers with pseudo-ID redaction applied to subject fields."""
from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from bids import BIDSLayout
    HAS_PYBIDS: bool = True
except ImportError:
    BIDSLayout = None  # type: ignore[assignment,misc]
    HAS_PYBIDS = False

from app.qeeg.services.phi_redaction import redact_phi
from app.services.neuroimaging.schemas import BIDSFileRef, LayoutSummary


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
    """Query a BIDSLayout and return redacted BIDSFileRef list."""
    if not HAS_PYBIDS:
        raise ImportError("pybids is not installed")
    files = layout.get(**filters)
    refs: list[BIDSFileRef] = []
    for f in files:
        entities = f.get_entities()
        raw_subject = entities.get("subject")
        redacted_subject = (
            redact_phi(raw_subject).redacted_text if raw_subject else None
        )
        refs.append(
            BIDSFileRef(
                path=str(f.path),
                subject=redacted_subject,
                session=entities.get("session"),
                task=entities.get("task"),
                modality=entities.get("datatype"),
                suffix=entities.get("suffix"),
            )
        )
    return refs
