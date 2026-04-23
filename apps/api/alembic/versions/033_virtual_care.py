"""Virtual care — sessions, biometrics, voice & video analysis.

Revision ID: 033_virtual_care
Revises: 032_marketplace
Create Date: 2026-04-23
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "033_virtual_care"
down_revision = "032_marketplace"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "virtual_care_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("clinician_id", sa.String(36), nullable=True, index=True),
        sa.Column("appointment_id", sa.String(64), nullable=True, index=True),
        sa.Column("session_type", sa.String(20), nullable=False, server_default="video"),
        sa.Column("status", sa.String(20), nullable=False, server_default="scheduled"),
        sa.Column("room_name", sa.String(255), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("transcript_json", sa.Text(), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("session_type IN ('video','voice')", name="ck_vc_session_type"),
        sa.CheckConstraint("status IN ('scheduled','active','ended','cancelled')", name="ck_vc_session_status"),
    )
    op.create_table(
        "biometrics_snapshots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("virtual_care_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("source", sa.String(50), nullable=False, server_default="wearable"),
        sa.Column("heart_rate_bpm", sa.Integer(), nullable=True),
        sa.Column("hrv_ms", sa.Float(), nullable=True),
        sa.Column("spo2_pct", sa.Float(), nullable=True),
        sa.Column("blood_pressure_sys", sa.Integer(), nullable=True),
        sa.Column("blood_pressure_dia", sa.Integer(), nullable=True),
        sa.Column("stress_score", sa.Integer(), nullable=True),
        sa.Column("sleep_hours_last_night", sa.Float(), nullable=True),
        sa.Column("steps_today", sa.Integer(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_table(
        "voice_analysis",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("virtual_care_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("segment_start_sec", sa.Integer(), nullable=False, default=0),
        sa.Column("segment_end_sec", sa.Integer(), nullable=False, default=0),
        sa.Column("sentiment", sa.String(20), nullable=False, server_default="neutral"),
        sa.Column("stress_level", sa.Integer(), nullable=False, default=0),
        sa.Column("energy_level", sa.Integer(), nullable=False, default=50),
        sa.Column("speech_pace_wpm", sa.Integer(), nullable=True),
        sa.Column("mood_tags_json", sa.Text(), nullable=True),
        sa.Column("ai_insights", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("sentiment IN ('positive','neutral','negative','distressed')", name="ck_voice_sentiment"),
    )
    op.create_table(
        "video_analysis",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("session_id", sa.String(36), sa.ForeignKey("virtual_care_sessions.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("patient_id", sa.String(36), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("segment_start_sec", sa.Integer(), nullable=False, default=0),
        sa.Column("segment_end_sec", sa.Integer(), nullable=False, default=0),
        sa.Column("engagement_score", sa.Integer(), nullable=False, default=50),
        sa.Column("facial_expression", sa.String(20), nullable=False, server_default="neutral"),
        sa.Column("eye_contact_pct", sa.Integer(), nullable=True),
        sa.Column("posture_score", sa.Integer(), nullable=True),
        sa.Column("attention_flags_json", sa.Text(), nullable=True),
        sa.Column("ai_insights", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("facial_expression IN ('happy','neutral','sad','anxious','frustrated')", name="ck_video_expression"),
    )


def downgrade() -> None:
    op.drop_table("video_analysis")
    op.drop_table("voice_analysis")
    op.drop_table("biometrics_snapshots")
    op.drop_table("virtual_care_sessions")
