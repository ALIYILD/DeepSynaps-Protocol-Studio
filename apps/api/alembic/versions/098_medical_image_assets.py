"""Promote MIQ-inspired medical-image previews from sidecar JSON to DB.

PR #619 shipped the medical-image preview surface with file-based sidecar
JSON persistence, deferring a DB-backed model. This migration lands the
``medical_image_assets`` table — one row per non-diagnostic preview,
mirroring the sidecar payload one-to-one. The router dual-writes (sidecar
+ DB row) so the legacy file-based reader keeps working through the
migration window. The report-context layer prefers the DB query and falls
back to the sidecar scan only when no DB row exists yet (legacy uploads
that pre-date this migration).

Design contract
---------------
* Additive only — one new table, nothing else touched.
* SQLite-safe — ``op.create_table`` only, stdlib SQLAlchemy types.
* FK on ``clinic_id`` with ``SET NULL`` on cascade so dropping a clinic
  doesn't orphan the file-based blob (the storage_path still resolves;
  the row simply loses its tenant gate, which is acceptable because the
  router will refuse to serve it without a clinic match).
* No FK on ``patient_id`` — uploads can be standalone (clinician
  previewing a file before linking to a patient), and the patient model
  carries its own clinic-id gate.
* Indexes tuned for the actual query patterns: ``patient_id``
  (latest-by-patient), ``clinic_id`` (admin lists), ``created_by`` (audit).

Revision ID: 098_medical_image_assets
Revises: 097_agent_hires
Create Date: 2026-05-08
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "098_medical_image_assets"
down_revision = "097_agent_hires"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "medical_image_assets"):
        return

    op.create_table(
        "medical_image_assets",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("patient_id", sa.Text(), nullable=True),
        sa.Column("upload_id", sa.String(64), nullable=True),
        sa.Column("filename", sa.Text(), nullable=True),
        sa.Column("file_format", sa.String(32), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(32),
            nullable=False,
            server_default="ready",
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("preview_paths_json", sa.Text(), nullable=True),
        sa.Column("warning_flags_json", sa.Text(), nullable=True),
        sa.Column("clinician_imaging_note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(64), nullable=True),
        sa.Column("created_by_role", sa.String(32), nullable=True),
        sa.Column(
            "clinic_id",
            sa.String(36),
            sa.ForeignKey("clinics.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
    )

    op.create_index(
        "ix_medical_image_assets_patient_id",
        "medical_image_assets",
        ["patient_id"],
    )
    op.create_index(
        "ix_medical_image_assets_clinic_id",
        "medical_image_assets",
        ["clinic_id"],
    )
    op.create_index(
        "ix_medical_image_assets_created_by",
        "medical_image_assets",
        ["created_by"],
    )
    op.create_index(
        "ix_medical_image_assets_created_at",
        "medical_image_assets",
        ["created_at"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "medical_image_assets"):
        return
    op.drop_index(
        "ix_medical_image_assets_created_at", table_name="medical_image_assets"
    )
    op.drop_index(
        "ix_medical_image_assets_created_by", table_name="medical_image_assets"
    )
    op.drop_index(
        "ix_medical_image_assets_clinic_id", table_name="medical_image_assets"
    )
    op.drop_index(
        "ix_medical_image_assets_patient_id", table_name="medical_image_assets"
    )
    op.drop_table("medical_image_assets")
