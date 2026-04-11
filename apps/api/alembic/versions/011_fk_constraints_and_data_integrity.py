"""Add FK constraints, Patient.email unique, AssessmentRecord.patient_id NOT NULL

Revision ID: 011_fk_constraints
Revises: 010_wave15_new_tables
Create Date: 2026-04-11

"""
from alembic import op
import sqlalchemy as sa

revision = '011_fk_constraints'
down_revision = '010_wave15_new_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Patient.email: add unique constraint ───────────────────────────────────
    # Note: existing duplicate emails must be resolved before running this migration.
    with op.batch_alter_table('patients') as batch_op:
        batch_op.create_unique_constraint('uq_patient_email', ['email'])

    # ── AssessmentRecord.patient_id: make NOT NULL ─────────────────────────────
    # Requires all existing NULL patient_id rows to be handled first.
    with op.batch_alter_table('assessment_records') as batch_op:
        batch_op.alter_column('patient_id', existing_type=sa.String(36), nullable=False)

    # ── Foreign key constraints ────────────────────────────────────────────────
    # SQLite does not enforce FK constraints by default. These are added for
    # documentation and future PostgreSQL/MySQL compatibility.
    # For SQLite, FK enforcement requires PRAGMA foreign_keys = ON per connection.

    with op.batch_alter_table('clinical_sessions') as batch_op:
        batch_op.create_foreign_key(
            'fk_clinical_sessions_patient_id', 'patients', ['patient_id'], ['id']
        )

    with op.batch_alter_table('assessment_records') as batch_op:
        batch_op.create_foreign_key(
            'fk_assessment_records_patient_id', 'patients', ['patient_id'], ['id']
        )

    with op.batch_alter_table('treatment_courses') as batch_op:
        batch_op.create_foreign_key(
            'fk_treatment_courses_patient_id', 'patients', ['patient_id'], ['id']
        )


def downgrade() -> None:
    with op.batch_alter_table('treatment_courses') as batch_op:
        batch_op.drop_constraint('fk_treatment_courses_patient_id', type_='foreignkey')

    with op.batch_alter_table('assessment_records') as batch_op:
        batch_op.drop_constraint('fk_assessment_records_patient_id', type_='foreignkey')
        batch_op.alter_column('patient_id', existing_type=sa.String(36), nullable=True)

    with op.batch_alter_table('clinical_sessions') as batch_op:
        batch_op.drop_constraint('fk_clinical_sessions_patient_id', type_='foreignkey')

    with op.batch_alter_table('patients') as batch_op:
        batch_op.drop_constraint('uq_patient_email', type_='unique')
