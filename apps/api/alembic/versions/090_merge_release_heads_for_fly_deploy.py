"""Merge remaining Alembic heads for release deployability.

Revision ID: 090_merge_release_heads_for_fly_deploy
Revises: 081_video_assessment_sessions, 081_medication_analyzer_persistence,
    083_neuromodulation_bio_database_slice, 089_merge_heads_risk_analyzer
Create Date: 2026-05-04
"""
from __future__ import annotations

from typing import Sequence, Union


revision: str = "090_merge_release_heads_for_fly_deploy"
down_revision: Union[str, Sequence[str], None] = (
    "081_video_assessment_sessions",
    "081_medication_analyzer_persistence",
    "083_neuromodulation_bio_database_slice",
    "089_merge_heads_risk_analyzer",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
