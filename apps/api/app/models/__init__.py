"""Slim ``app.models`` package.

Most ORM classes live in :mod:`app.persistence.models` (a domain-split
package — see its docstring). New Slice C work introduces a small
``app.models`` namespace for tables that are *not* part of any existing
persistence bucket and that we want to keep visually segregated from
the clinical-PHI surface — research dataset specs being the first.

The model in :mod:`app.models.research_dataset` re-exports from
:mod:`app.persistence.models` so Alembic + downstream callers can import
either path without surprise.
"""
from __future__ import annotations

from app.models.research_dataset import ResearchDataset  # noqa: F401

__all__ = ["ResearchDataset"]
