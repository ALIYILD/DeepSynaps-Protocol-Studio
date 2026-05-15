"""Add rehab, wellness, and complementary therapy tables

Revision ID: 104_add_rehab_wellness_complementary_tables
Revises: 103_research_dataset
Create Date: 2026-05-15 00:00:00.000000

Tables created
--------------
Rehabilitation (5 tables):
  - rehab_patients          enrolled rehab patients with diagnosis & phase
  - rehab_assessments       standardized outcome measures
  - rehab_exercises         exercise library with evidence grading
  - rehab_protocols         individualized rehab programs
  - rehab_sessions          per-session completion & adherence

Wellness (4 tables):
  - wellness_patients       enrolled wellness patients
  - sleep_diary_entries     nightly sleep diary logs
  - wellness_assessments    standardized wellness questionnaires
  - wellness_protocols      individualized wellness programs

Complementary (4 tables):
  - complementary_patients     enrolled complementary therapy patients
  - complementary_sessions     per-session therapy data and outcomes
  - complementary_protocols    individualized therapy plans
  - therapy_library_entries    master therapy type definitions & evidence

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "104_add_rehab_wellness_complementary_tables"
down_revision: Union[str, None] = "103_research_dataset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Rehabilitation ───────────────────────────────────────────────────────────

def _create_rehab_patients() -> None:
    op.create_table(
        "rehab_patients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("clinic_id", sa.String(36), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("diagnosis", sa.Text(), nullable=False),
        sa.Column("injury_type", sa.String(50), nullable=False, server_default="stroke"),
        sa.Column("rehab_phase", sa.String(20), nullable=False, server_default="acute"),
        sa.Column("current_protocol_id", sa.String(36), nullable=True),
        sa.Column("goals_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("assigned_clinician_id", sa.String(36), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_rehab_patients_patient_id", "rehab_patients", ["patient_id"], unique=False)
    op.create_index("ix_rehab_patients_clinic_id", "rehab_patients", ["clinic_id"], unique=False)
    op.create_index("ix_rehab_patients_status", "rehab_patients", ["status"], unique=False)


def _create_rehab_assessments() -> None:
    op.create_table(
        "rehab_assessments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("rehab_patient_id", sa.String(36), sa.ForeignKey("rehab_patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("assessment_type", sa.String(30), nullable=False),
        sa.Column("scores_json", sa.Text(), nullable=True),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("max_score", sa.Float(), nullable=True),
        sa.Column("percentage", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("assessed_by", sa.String(36), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_rehab_assessments_patient_id", "rehab_assessments", ["rehab_patient_id"], unique=False)
    op.create_index("ix_rehab_assessments_type", "rehab_assessments", ["assessment_type"], unique=False)


def _create_rehab_exercises() -> None:
    op.create_table(
        "rehab_exercises",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("body_part", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("sets", sa.String(50), nullable=True),
        sa.Column("reps", sa.String(50), nullable=True),
        sa.Column("frequency", sa.String(100), nullable=True),
        sa.Column("progression_criteria", sa.Text(), nullable=True),
        sa.Column("contraindications", sa.Text(), nullable=True),
        sa.Column("evidence_grade", sa.String(5), nullable=True),
        sa.Column("video_url", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_rehab_exercises_category", "rehab_exercises", ["category"], unique=False)


def _create_rehab_protocols() -> None:
    op.create_table(
        "rehab_protocols",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("rehab_patient_id", sa.String(36), sa.ForeignKey("rehab_patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("clinic_id", sa.String(36), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("template_name", sa.String(255), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("exercises_json", sa.Text(), nullable=True),
        sa.Column("goals_json", sa.Text(), nullable=True),
        sa.Column("outcome_measures_json", sa.Text(), nullable=True),
        sa.Column("duration_weeks", sa.Integer(), nullable=True),
        sa.Column("frequency_per_week", sa.Integer(), nullable=True),
        sa.Column("progression_rules", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_by", sa.String(36), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_rehab_protocols_patient_id", "rehab_protocols", ["rehab_patient_id"], unique=False)
    op.create_index("ix_rehab_protocols_clinic_id", "rehab_protocols", ["clinic_id"], unique=False)
    op.create_index("ix_rehab_protocols_status", "rehab_protocols", ["status"], unique=False)


def _create_rehab_sessions() -> None:
    op.create_table(
        "rehab_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("rehab_patient_id", sa.String(36), sa.ForeignKey("rehab_patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("protocol_id", sa.String(36), sa.ForeignKey("rehab_protocols.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("session_number", sa.Integer(), nullable=False),
        sa.Column("exercises_completed_json", sa.Text(), nullable=True),
        sa.Column("pain_level", sa.Integer(), nullable=True),
        sa.Column("fatigue_level", sa.Integer(), nullable=True),
        sa.Column("difficulty_level", sa.Integer(), nullable=True),
        sa.Column("clinician_notes", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("adherence_pct", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_rehab_sessions_patient_id", "rehab_sessions", ["rehab_patient_id"], unique=False)
    op.create_index("ix_rehab_sessions_protocol_id", "rehab_sessions", ["protocol_id"], unique=False)


# ── Wellness ─────────────────────────────────────────────────────────────────

def _create_wellness_patients() -> None:
    op.create_table(
        "wellness_patients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("clinic_id", sa.String(36), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("wellness_domains_json", sa.Text(), nullable=True),
        sa.Column("current_protocol_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_wellness_patients_patient_id", "wellness_patients", ["patient_id"], unique=False)
    op.create_index("ix_wellness_patients_clinic_id", "wellness_patients", ["clinic_id"], unique=False)
    op.create_index("ix_wellness_patients_status", "wellness_patients", ["status"], unique=False)


def _create_sleep_diary_entries() -> None:
    op.create_table(
        "sleep_diary_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("wellness_patient_id", sa.String(36), sa.ForeignKey("wellness_patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("bed_time", sa.DateTime(), nullable=True),
        sa.Column("wake_time", sa.DateTime(), nullable=True),
        sa.Column("sleep_onset_minutes", sa.Integer(), nullable=True),
        sa.Column("awakenings", sa.Integer(), nullable=True),
        sa.Column("total_sleep_minutes", sa.Integer(), nullable=True),
        sa.Column("time_in_bed_minutes", sa.Integer(), nullable=True),
        sa.Column("sleep_efficiency", sa.Float(), nullable=True),
        sa.Column("sleep_quality", sa.Integer(), nullable=True),
        sa.Column("sleep_aids", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_sleep_diary_patient_id", "sleep_diary_entries", ["wellness_patient_id"], unique=False)


def _create_wellness_assessments() -> None:
    op.create_table(
        "wellness_assessments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("wellness_patient_id", sa.String(36), sa.ForeignKey("wellness_patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("assessment_type", sa.String(30), nullable=False),
        sa.Column("scores_json", sa.Text(), nullable=True),
        sa.Column("total_score", sa.Float(), nullable=True),
        sa.Column("interpretation", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_wellness_assessments_patient_id", "wellness_assessments", ["wellness_patient_id"], unique=False)
    op.create_index("ix_wellness_assessments_type", "wellness_assessments", ["assessment_type"], unique=False)


def _create_wellness_protocols() -> None:
    op.create_table(
        "wellness_protocols",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("wellness_patient_id", sa.String(36), sa.ForeignKey("wellness_patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("template_name", sa.String(255), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("domains_json", sa.Text(), nullable=True),
        sa.Column("activities_json", sa.Text(), nullable=True),
        sa.Column("duration_weeks", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_wellness_protocols_patient_id", "wellness_protocols", ["wellness_patient_id"], unique=False)
    op.create_index("ix_wellness_protocols_status", "wellness_protocols", ["status"], unique=False)


# ── Complementary ────────────────────────────────────────────────────────────

def _create_complementary_patients() -> None:
    op.create_table(
        "complementary_patients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("clinic_id", sa.String(36), sa.ForeignKey("clinics.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("active_therapies_json", sa.Text(), nullable=True),
        sa.Column("current_protocol_id", sa.String(36), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comp_patients_patient_id", "complementary_patients", ["patient_id"], unique=False)
    op.create_index("ix_comp_patients_clinic_id", "complementary_patients", ["clinic_id"], unique=False)
    op.create_index("ix_comp_patients_status", "complementary_patients", ["status"], unique=False)


def _create_complementary_sessions() -> None:
    op.create_table(
        "complementary_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("complementary_patient_id", sa.String(36), sa.ForeignKey("complementary_patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("therapy_type", sa.String(30), nullable=False),
        sa.Column("session_number", sa.Integer(), nullable=False),
        sa.Column("session_data_json", sa.Text(), nullable=True),
        sa.Column("outcome_scores_json", sa.Text(), nullable=True),
        sa.Column("clinician_notes", sa.Text(), nullable=True),
        sa.Column("safety_flags_json", sa.Text(), nullable=True),
        sa.Column("practitioner_name", sa.String(255), nullable=True),
        sa.Column("practitioner_credentials", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comp_sessions_patient_id", "complementary_sessions", ["complementary_patient_id"], unique=False)
    op.create_index("ix_comp_sessions_therapy_type", "complementary_sessions", ["therapy_type"], unique=False)


def _create_complementary_protocols() -> None:
    op.create_table(
        "complementary_protocols",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("complementary_patient_id", sa.String(36), sa.ForeignKey("complementary_patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("therapy_type", sa.String(30), nullable=False),
        sa.Column("template_name", sa.String(255), nullable=True),
        sa.Column("total_sessions", sa.Integer(), nullable=True),
        sa.Column("frequency", sa.String(100), nullable=True),
        sa.Column("goals", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_comp_protocols_patient_id", "complementary_protocols", ["complementary_patient_id"], unique=False)
    op.create_index("ix_comp_protocols_status", "complementary_protocols", ["status"], unique=False)


def _create_therapy_library_entries() -> None:
    op.create_table(
        "therapy_library_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("conditions_json", sa.Text(), nullable=True),
        sa.Column("evidence_grade", sa.String(5), nullable=True),
        sa.Column("contraindications", sa.Text(), nullable=True),
        sa.Column("practitioner_required", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("session_structure", sa.Text(), nullable=True),
        sa.Column("typical_frequency", sa.String(100), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_therapy_lib_category", "therapy_library_entries", ["category"], unique=False)


# ── Upgrade / Downgrade ──────────────────────────────────────────────────────

def upgrade() -> None:
    # Rehabilitation
    _create_rehab_patients()
    _create_rehab_assessments()
    _create_rehab_exercises()
    _create_rehab_protocols()
    _create_rehab_sessions()

    # Wellness
    _create_wellness_patients()
    _create_sleep_diary_entries()
    _create_wellness_assessments()
    _create_wellness_protocols()

    # Complementary
    _create_complementary_patients()
    _create_complementary_sessions()
    _create_complementary_protocols()
    _create_therapy_library_entries()


def _drop_if_exists(table: str) -> None:
    try:
        op.drop_table(table)
    except Exception:
        pass


def downgrade() -> None:
    # Complementary (drop in FK reverse order)
    _drop_if_exists("therapy_library_entries")
    _drop_if_exists("complementary_sessions")
    _drop_if_exists("complementary_protocols")
    _drop_if_exists("complementary_patients")

    # Wellness
    _drop_if_exists("sleep_diary_entries")
    _drop_if_exists("wellness_protocols")
    _drop_if_exists("wellness_assessments")
    _drop_if_exists("wellness_patients")

    # Rehabilitation
    _drop_if_exists("rehab_sessions")
    _drop_if_exists("rehab_protocols")
    _drop_if_exists("rehab_assessments")
    _drop_if_exists("rehab_exercises")
    _drop_if_exists("rehab_patients")
