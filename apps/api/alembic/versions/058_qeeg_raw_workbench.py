"""qEEG Raw Cleaning Workbench tables.

Three additive tables for the full-page Raw EEG Cleaning Workbench:

* ``qeeg_cleaning_versions`` — saved cleaning versions per analysis.
* ``qeeg_cleaning_annotations`` — per-action records (mark bad
  segment/channel, reject epoch, AI suggestion accepted, ...).
* ``qeeg_cleaning_audit_events`` — append-only audit log (one row per
  mutation; never updated or deleted).

Cross-dialect: stdlib SQLAlchemy types only (Integer, String, Text, Float,
DateTime) so the SQLite test harness and Postgres production engine both
run this migration unchanged. Defensive ``upgrade``/``downgrade`` mirror
prior tables — both are no-ops if the table is in the unexpected state.

Original raw EEG remains untouched. The workbench writes only to these
tables and never mutates ``qeeg_analyses`` source columns.

Revision ID: 058_qeeg_raw_workbench
Revises: 057_merge_056_heads
Create Date: 2026-04-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "058_qeeg_raw_workbench"
down_revision = "057_merge_056_heads"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    return table_name in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "qeeg_cleaning_versions"):
        op.create_table(
            "qeeg_cleaning_versions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "analysis_id",
                sa.String(36),
                sa.ForeignKey("qeeg_analyses.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("label", sa.String(120), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("bad_channels_json", sa.Text(), nullable=True),
            sa.Column("rejected_segments_json", sa.Text(), nullable=True),
            sa.Column("rejected_epochs_json", sa.Text(), nullable=True),
            sa.Column("rejected_ica_components_json", sa.Text(), nullable=True),
            sa.Column("interpolated_channels_json", sa.Text(), nullable=True),
            sa.Column("cleaned_summary_json", sa.Text(), nullable=True),
            sa.Column("review_status", sa.String(30), nullable=False, server_default="draft"),
            sa.Column("derived_analysis_id", sa.String(36), nullable=True),
            sa.Column("created_by_actor_id", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_qeeg_cleaning_versions_analysis_id",
            "qeeg_cleaning_versions",
            ["analysis_id"],
        )
        op.create_index(
            "ix_qeeg_cleaning_versions_derived_analysis_id",
            "qeeg_cleaning_versions",
            ["derived_analysis_id"],
        )
        op.create_index(
            "ix_qeeg_cleaning_versions_created_by_actor_id",
            "qeeg_cleaning_versions",
            ["created_by_actor_id"],
        )

    if not _has_table(bind, "qeeg_cleaning_annotations"):
        op.create_table(
            "qeeg_cleaning_annotations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "analysis_id",
                sa.String(36),
                sa.ForeignKey("qeeg_analyses.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("kind", sa.String(40), nullable=False),
            sa.Column("channel", sa.String(40), nullable=True),
            sa.Column("start_sec", sa.Float(), nullable=True),
            sa.Column("end_sec", sa.Float(), nullable=True),
            sa.Column("ica_component", sa.Integer(), nullable=True),
            sa.Column("ai_confidence", sa.Float(), nullable=True),
            sa.Column("ai_label", sa.String(40), nullable=True),
            sa.Column("source", sa.String(30), nullable=False, server_default="clinician"),
            sa.Column("decision_status", sa.String(30), nullable=False, server_default="suggested"),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("actor_id", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_qeeg_cleaning_annotations_analysis_id",
            "qeeg_cleaning_annotations",
            ["analysis_id"],
        )
        op.create_index(
            "ix_qeeg_cleaning_annotations_kind",
            "qeeg_cleaning_annotations",
            ["kind"],
        )
        op.create_index(
            "ix_qeeg_cleaning_annotations_actor_id",
            "qeeg_cleaning_annotations",
            ["actor_id"],
        )

    if not _has_table(bind, "qeeg_cleaning_audit_events"):
        op.create_table(
            "qeeg_cleaning_audit_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "analysis_id",
                sa.String(36),
                sa.ForeignKey("qeeg_analyses.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("cleaning_version_id", sa.String(36), nullable=True),
            sa.Column("action_type", sa.String(40), nullable=False),
            sa.Column("channel", sa.String(40), nullable=True),
            sa.Column("start_sec", sa.Float(), nullable=True),
            sa.Column("end_sec", sa.Float(), nullable=True),
            sa.Column("ica_component", sa.Integer(), nullable=True),
            sa.Column("previous_value_json", sa.Text(), nullable=True),
            sa.Column("new_value_json", sa.Text(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("source", sa.String(30), nullable=False, server_default="clinician"),
            sa.Column("actor_id", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_qeeg_cleaning_audit_events_analysis_id",
            "qeeg_cleaning_audit_events",
            ["analysis_id"],
        )
        op.create_index(
            "ix_qeeg_cleaning_audit_events_cleaning_version_id",
            "qeeg_cleaning_audit_events",
            ["cleaning_version_id"],
        )
        op.create_index(
            "ix_qeeg_cleaning_audit_events_action_type",
            "qeeg_cleaning_audit_events",
            ["action_type"],
        )
        op.create_index(
            "ix_qeeg_cleaning_audit_events_actor_id",
            "qeeg_cleaning_audit_events",
            ["actor_id"],
        )
        op.create_index(
            "ix_qeeg_cleaning_audit_events_created_at",
            "qeeg_cleaning_audit_events",
            ["created_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    for table in (
        "qeeg_cleaning_audit_events",
        "qeeg_cleaning_annotations",
        "qeeg_cleaning_versions",
    ):
        if _has_table(bind, table):
            op.drop_table(table)
