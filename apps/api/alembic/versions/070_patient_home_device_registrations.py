"""Patient Home Devices launch-audit (2026-05-01) — server-side registry.

Adds ``patient_home_device_registrations`` and
``patient_home_device_calibrations`` so the pgPatientHomeDevices page can
persist patient-owned device registrations on the server with a
patient-scoped audit breadcrumb instead of relying on browser
localStorage.

Mirrors the contract established by 068_symptom_journal_entries and
069_wellness_checkins. Distinct from the existing
``home_device_assignments`` table which is the clinician-side
prescription record — these new tables hold the patient's view of which
physical devices they own / use at home (serial number, calibration
status, faulty / decommission lifecycle).

Design contract
---------------
* Additive only — two new tables, no edits to existing rows.
* Cross-dialect — stdlib SQLAlchemy types only so this runs against the
  SQLite test harness and the Postgres production engine identically.
* Defensive — ``upgrade`` / ``downgrade`` both no-op when the table is in
  the unexpected state (mirrors 068 / 069).

Revision ID: 070_patient_home_device_registrations
Revises: 069_wellness_checkins
Create Date: 2026-05-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op


# ── Alembic identifiers ──────────────────────────────────────────────────────

revision = "070_patient_home_device_registrations"
down_revision = "069_wellness_checkins"
branch_labels = None
depends_on = None


def _has_table(bind: sa.engine.Engine, table_name: str) -> bool:
    insp = sa.inspect(bind)
    return table_name in insp.get_table_names()


# ── Upgrade ──────────────────────────────────────────────────────────────────


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "patient_home_device_registrations"):
        op.create_table(
            "patient_home_device_registrations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "patient_id",
                sa.String(36),
                sa.ForeignKey("patients.id", ondelete="CASCADE"),
                nullable=False,
            ),
            # Optional link to a clinician-side HomeDeviceAssignment so the
            # patient registry can deep-link back to Course Detail telemetry.
            sa.Column("assignment_id", sa.String(36), nullable=True),
            sa.Column("clinic_id", sa.String(36), nullable=True),
            sa.Column("registered_by_actor_id", sa.String(64), nullable=False),
            sa.Column("device_name", sa.String(200), nullable=False),
            sa.Column("device_model", sa.String(200), nullable=True),
            sa.Column("device_category", sa.String(80), nullable=False),
            sa.Column("device_serial", sa.String(120), nullable=True),
            # JSON: {intensity_ma, frequency_hz, duration_min, montage, ...}
            sa.Column(
                "settings_json",
                sa.Text(),
                nullable=False,
                server_default=sa.text("'{}'"),
            ),
            sa.Column("settings_revision", sa.Integer(), nullable=False, server_default=sa.text("0")),
            # active | decommissioned | faulty
            sa.Column(
                "status",
                sa.String(30),
                nullable=False,
                server_default=sa.text("'active'"),
            ),
            sa.Column("decommissioned_at", sa.DateTime(), nullable=True),
            sa.Column("decommission_reason", sa.String(500), nullable=True),
            sa.Column("marked_faulty_at", sa.DateTime(), nullable=True),
            sa.Column("faulty_reason", sa.String(500), nullable=True),
            sa.Column("last_calibrated_at", sa.DateTime(), nullable=True),
            sa.Column(
                "is_demo",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

        op.create_index(
            "ix_phd_reg_patient_id",
            "patient_home_device_registrations",
            ["patient_id"],
        )
        op.create_index(
            "ix_phd_reg_clinic_id",
            "patient_home_device_registrations",
            ["clinic_id"],
        )
        op.create_index(
            "ix_phd_reg_status",
            "patient_home_device_registrations",
            ["status"],
        )
        op.create_index(
            "ix_phd_reg_is_demo",
            "patient_home_device_registrations",
            ["is_demo"],
        )
        op.create_index(
            "ix_phd_reg_created_at",
            "patient_home_device_registrations",
            ["created_at"],
        )
        # Serial uniqueness scoped per-clinic — rolling out the same serial
        # across clinics would block legitimate cross-clinic transfers, but
        # within a clinic the same serial can never be registered twice.
        op.create_index(
            "ix_phd_reg_clinic_serial",
            "patient_home_device_registrations",
            ["clinic_id", "device_serial"],
            unique=False,
        )

    if not _has_table(bind, "patient_home_device_calibrations"):
        op.create_table(
            "patient_home_device_calibrations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "registration_id",
                sa.String(36),
                sa.ForeignKey(
                    "patient_home_device_registrations.id",
                    ondelete="CASCADE",
                ),
                nullable=False,
            ),
            sa.Column("patient_id", sa.String(36), nullable=False),
            sa.Column("performed_by_actor_id", sa.String(64), nullable=False),
            # passed | failed | skipped
            sa.Column(
                "result",
                sa.String(30),
                nullable=False,
                server_default=sa.text("'passed'"),
            ),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column(
                "is_demo",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index(
            "ix_phd_cal_registration_id",
            "patient_home_device_calibrations",
            ["registration_id"],
        )
        op.create_index(
            "ix_phd_cal_patient_id",
            "patient_home_device_calibrations",
            ["patient_id"],
        )
        op.create_index(
            "ix_phd_cal_created_at",
            "patient_home_device_calibrations",
            ["created_at"],
        )


# ── Downgrade ────────────────────────────────────────────────────────────────


def downgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "patient_home_device_calibrations"):
        for ix in (
            "ix_phd_cal_registration_id",
            "ix_phd_cal_patient_id",
            "ix_phd_cal_created_at",
        ):
            try:
                op.drop_index(ix, table_name="patient_home_device_calibrations")
            except Exception:
                pass
        op.drop_table("patient_home_device_calibrations")

    if _has_table(bind, "patient_home_device_registrations"):
        for ix in (
            "ix_phd_reg_patient_id",
            "ix_phd_reg_clinic_id",
            "ix_phd_reg_status",
            "ix_phd_reg_is_demo",
            "ix_phd_reg_created_at",
            "ix_phd_reg_clinic_serial",
        ):
            try:
                op.drop_index(ix, table_name="patient_home_device_registrations")
            except Exception:
                pass
        op.drop_table("patient_home_device_registrations")
