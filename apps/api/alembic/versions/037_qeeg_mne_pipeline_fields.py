"""qEEG MNE-pipeline fields — SpecParam, connectivity, source-ROI, normative z-scores.

Revision ID: 037_qeeg_mne_pipeline_fields
Revises: 035_qeeg_analysis_pipeline
Create Date: 2026-04-24

Adds 11 nullable columns to ``qeeg_analyses`` so the full MNE-Python /
SpecParam / eLORETA / normative-z pipeline described in the
``deepsynaps_qeeg_analyzer`` CONTRACT (§2) can persist its outputs alongside
the existing legacy Welch ``band_powers_json`` column.

All columns are nullable so legacy rows written before this migration are
still valid. The existing ``band_powers_json``, ``artifact_rejection_json``
and ``advanced_analyses_json`` columns are **untouched** — the new pipeline
populates them in parallel for backward compatibility.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "037_qeeg_mne_pipeline_fields"
# Migration 036 does not exist at time of writing; chain to the current head
# 035_qeeg_analysis_pipeline. If 036 lands later it must re-chain.
down_revision = "035_qeeg_analysis_pipeline"
branch_labels = None
depends_on = None


_NEW_TEXT_COLUMNS = (
    "aperiodic_json",
    "peak_alpha_freq_json",
    "connectivity_json",
    "asymmetry_json",
    "graph_metrics_json",
    "source_roi_json",
    "normative_zscores_json",
    "flagged_conditions",        # JSON array of lowercase condition slugs
    "quality_metrics_json",
)

_NEW_VARCHAR16_COLUMNS = (
    "pipeline_version",
    "norm_db_version",
)


def upgrade() -> None:
    """Add 11 nullable columns to ``qeeg_analyses``.

    Uses a batch op so the migration works on SQLite (test DB) as well as
    Postgres (production).
    """
    with op.batch_alter_table("qeeg_analyses") as batch_op:
        for col in _NEW_TEXT_COLUMNS:
            batch_op.add_column(sa.Column(col, sa.Text(), nullable=True))
        for col in _NEW_VARCHAR16_COLUMNS:
            batch_op.add_column(sa.Column(col, sa.String(16), nullable=True))


def downgrade() -> None:
    """Drop the 11 columns added in :func:`upgrade`."""
    with op.batch_alter_table("qeeg_analyses") as batch_op:
        for col in _NEW_VARCHAR16_COLUMNS:
            batch_op.drop_column(col)
        for col in _NEW_TEXT_COLUMNS:
            batch_op.drop_column(col)
