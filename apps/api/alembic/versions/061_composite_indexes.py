"""Add composite indexes and claim unique constraint.

Revision ID: 061_composite_indexes
Revises: 060_qeeg_analysis_medication_confounds
Create Date: 2026-04-30

Adds:
- Composite indexes on high-frequency query patterns:
  - assessment_records (clinician_id, patient_id)
  - clinical_sessions (patient_id, clinician_id)
  - treatment_courses (clinician_id, patient_id)
  - outcome_series (patient_id, created_at)
  - invoices (clinician_id, issue_date)
- Unique index on insurance_claims (clinician_id, claim_number)
  to prevent race conditions in claim number allocation.

SQLite compatibility:
  SQLite does not support ALTER TABLE ADD CONSTRAINT. We use
  ``create_index(..., unique=True)`` instead of ``create_unique_constraint``
  which produces a ``CREATE UNIQUE INDEX`` statement supported by both
  SQLite and PostgreSQL. The env.py ``IF NOT EXISTS`` hook makes
  this idempotent if the ORM already created the index via create_all().

Pre-existing duplicate data:
  If the insurance_claims table already contains duplicate
  (clinician_id, claim_number) pairs, this migration will fail.
  Fix: ``DELETE FROM insurance_claims WHERE rowid NOT IN
  (SELECT MIN(rowid) FROM insurance_claims
   GROUP BY clinician_id, claim_number)``
  before running the migration.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "061_composite_indexes"
down_revision = "060_qeeg_analysis_medication_confounds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Composite indexes for common JOIN/filter patterns
    op.create_index(
        "ix_assessments_clinician_patient",
        "assessment_records",
        ["clinician_id", "patient_id"],
    )
    op.create_index(
        "ix_sessions_patient_clinician",
        "clinical_sessions",
        ["patient_id", "clinician_id"],
    )
    op.create_index(
        "ix_courses_clinician_patient",
        "treatment_courses",
        ["clinician_id", "patient_id"],
    )
    op.create_index(
        "ix_outcome_series_patient_created",
        "outcome_series",
        ["patient_id", "created_at"],
    )
    op.create_index(
        "ix_invoices_clinician_issue_date",
        "invoices",
        ["clinician_id", "issue_date"],
    )
    # Unique index on claim numbers to prevent race conditions.
    # Uses create_index(unique=True) instead of create_unique_constraint
    # because SQLite does not support ALTER TABLE ADD CONSTRAINT.
    op.create_index(
        "uq_claims_clinician_number",
        "insurance_claims",
        ["clinician_id", "claim_number"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_claims_clinician_number", table_name="insurance_claims")
    op.drop_index("ix_invoices_clinician_issue_date", table_name="invoices")
    op.drop_index("ix_outcome_series_patient_created", table_name="outcome_series")
    op.drop_index("ix_courses_clinician_patient", table_name="treatment_courses")
    op.drop_index("ix_sessions_patient_clinician", table_name="clinical_sessions")
    op.drop_index("ix_assessments_clinician_patient", table_name="assessment_records")
