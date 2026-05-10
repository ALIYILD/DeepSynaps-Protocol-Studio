"""Merge multiple migration heads into single branch.

This migration merges:
- 098_add_mesh_terms_to_papers
- 098_brainmap_plan_persistence
- 100_add_mri_viewer_state
- e2c4a3a5eb8b

Creating single linear history for deployment.

Revision ID: 101_merge_multiple_heads
Revises: 100_add_mri_viewer_state, 098_add_mesh_terms_to_papers, 098_brainmap_plan_persistence, e2c4a3a5eb8b
Create Date: 2026-05-11
"""
from __future__ import annotations

from alembic import op

revision = "101_merge_multiple_heads"
down_revision = (
    "100_add_mri_viewer_state",
    "098_add_mesh_terms_to_papers",
    "098_brainmap_plan_persistence",
    "e2c4a3a5eb8b",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    """No structural changes. This is purely a merge operation."""
    pass


def downgrade() -> None:
    """No structural changes to undo."""
    pass
