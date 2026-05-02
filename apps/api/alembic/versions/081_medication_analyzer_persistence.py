"""Medication Analyzer research-grade persistence (audit, notes, timeline).

Adds durable tables for clinician-visible medication analyzer workflows:

* ``medication_analyzer_audit`` — structured audit rows (QA / research traceability)
* ``medication_analyzer_review_notes`` — persisted review documentation
* ``medication_analyzer_timeline_events`` — clinician timeline annotations

Revision ID: 081_medication_analyzer_persistence
Revises: 080_resolver_coaching_digest_preference
Create Date: 2026-05-03
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "081_medication_analyzer_persistence"
down_revision = "080_resolver_coaching_digest_preference"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "medication_analyzer_audit"):
        op.create_table(
            "medication_analyzer_audit",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), nullable=False),
            sa.Column("actor_id", sa.String(64), nullable=False),
            sa.Column("action", sa.String(64), nullable=False),
            sa.Column("audit_ref", sa.String(96), nullable=True),
            sa.Column("ruleset_version", sa.String(64), nullable=True),
            sa.Column("detail_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_med_az_audit_patient", "medication_analyzer_audit", ["patient_id"]
        )
        op.create_index(
            "ix_med_az_audit_actor", "medication_analyzer_audit", ["actor_id"]
        )
        op.create_index(
            "ix_med_az_audit_action", "medication_analyzer_audit", ["action"]
        )
        op.create_index(
            "ix_med_az_audit_ref", "medication_analyzer_audit", ["audit_ref"]
        )
        op.create_index(
            "ix_med_az_audit_created", "medication_analyzer_audit", ["created_at"]
        )

    if not _has_table(bind, "medication_analyzer_review_notes"):
        op.create_table(
            "medication_analyzer_review_notes",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), nullable=False),
            sa.Column("actor_id", sa.String(64), nullable=False),
            sa.Column("note_text", sa.Text(), nullable=False),
            sa.Column("linked_recommendation_ids_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_med_az_note_patient", "medication_analyzer_review_notes", ["patient_id"]
        )
        op.create_index(
            "ix_med_az_note_actor", "medication_analyzer_review_notes", ["actor_id"]
        )
        op.create_index(
            "ix_med_az_note_created", "medication_analyzer_review_notes", ["created_at"]
        )

    if not _has_table(bind, "medication_analyzer_timeline_events"):
        op.create_table(
            "medication_analyzer_timeline_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("patient_id", sa.String(36), nullable=False),
            sa.Column("actor_id", sa.String(64), nullable=False),
            sa.Column("event_type", sa.String(48), nullable=False),
            sa.Column("occurred_at", sa.String(64), nullable=False),
            sa.Column("medication_id", sa.String(36), nullable=True),
            sa.Column("payload_json", sa.Text(), nullable=False),
            sa.Column("source_origin", sa.String(48), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_med_az_tl_patient", "medication_analyzer_timeline_events", ["patient_id"]
        )
        op.create_index(
            "ix_med_az_tl_med", "medication_analyzer_timeline_events", ["medication_id"]
        )
        op.create_index(
            "ix_med_az_tl_type", "medication_analyzer_timeline_events", ["event_type"]
        )
        op.create_index(
            "ix_med_az_tl_created", "medication_analyzer_timeline_events", ["created_at"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    for t in (
        "medication_analyzer_timeline_events",
        "medication_analyzer_review_notes",
        "medication_analyzer_audit",
    ):
        if _has_table(bind, t):
            op.drop_table(t)
