"""Add MNE-pipeline output columns to qeeg_analyses.

Persists the richer feature dict produced by the sibling
``deepsynaps_qeeg`` MNE pipeline (aperiodic / PAF / connectivity /
asymmetry / graph metrics / source-space ROI power / normative z-scores /
flagged conditions / quality metrics / pipeline + norm-db versions).

All new columns are nullable and additive — the existing
``band_powers_json`` / ``artifact_rejection_json`` / ``advanced_analyses_json``
columns remain populated in parallel for backward compatibility with the
legacy spectral analysis pipeline.

``flagged_conditions`` is stored as a JSON-encoded text column (not a
PG ARRAY) so SQLite-backed test DBs can round-trip the data without a
dialect-specific type adapter — this matches Studio's convention of
``*_json`` TEXT columns throughout ``qeeg_analyses``.

Revision ID: 037_qeeg_mne_pipeline_fields
Revises: 036_qeeg_advanced_analyses
Create Date: 2026-04-24
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "037_qeeg_mne_pipeline_fields"
down_revision = "036_qeeg_advanced_analyses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "qeeg_analyses",
        sa.Column("aperiodic_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("peak_alpha_freq_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("connectivity_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("asymmetry_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("graph_metrics_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("source_roi_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("normative_zscores_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("flagged_conditions", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("quality_metrics_json", sa.Text(), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("pipeline_version", sa.String(16), nullable=True),
    )
    op.add_column(
        "qeeg_analyses",
        sa.Column("norm_db_version", sa.String(16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("qeeg_analyses", "norm_db_version")
    op.drop_column("qeeg_analyses", "pipeline_version")
    op.drop_column("qeeg_analyses", "quality_metrics_json")
    op.drop_column("qeeg_analyses", "flagged_conditions")
    op.drop_column("qeeg_analyses", "normative_zscores_json")
    op.drop_column("qeeg_analyses", "source_roi_json")
    op.drop_column("qeeg_analyses", "graph_metrics_json")
    op.drop_column("qeeg_analyses", "asymmetry_json")
    op.drop_column("qeeg_analyses", "connectivity_json")
    op.drop_column("qeeg_analyses", "peak_alpha_freq_json")
    op.drop_column("qeeg_analyses", "aperiodic_json")
