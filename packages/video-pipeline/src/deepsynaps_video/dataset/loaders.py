"""Dataset loaders for public + clinic-internal labeled video sets."""

from __future__ import annotations

from pathlib import Path

from .manifest import ManifestRow


def load_pd4t(root: Path) -> list[ManifestRow]:
    """Load the PD4T public Parkinson's task dataset. TODO(impl)."""

    _ = root
    raise NotImplementedError


def load_internal_clinic(root: Path, *, clinic_id: str) -> list[ManifestRow]:
    """Load a clinic-internal labeled set, with consent-row enforcement.

    TODO(impl): refuse rows without an active consent_id.
    """

    _ = (root, clinic_id)
    raise NotImplementedError


__all__ = ["load_internal_clinic", "load_pd4t"]
