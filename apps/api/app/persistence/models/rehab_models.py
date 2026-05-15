"""Rehabilitation platform models — physical therapy, occupational therapy,
and neuro-rehabilitation patient management.

Tables
------
- rehab_patients          : enrolled rehab patients with diagnosis & phase
- rehab_assessments       : standardized outcome measures (FM, BBS, TUG, etc.)
- rehab_exercises         : exercise library with evidence grading
- rehab_protocols         : individualized rehab programs
- rehab_sessions          : per-session completion & adherence tracking
"""
from __future__ import annotations

from ._base import (
    Base,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Mapped,
    Optional,
    String,
    Text,
    datetime,
    mapped_column,
    timezone,
    uuid,
)


class RehabPatient(Base):
    """An enrolled rehabilitation patient with diagnosis, phase, and goals."""

    __tablename__ = "rehab_patients"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    clinic_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("clinics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    diagnosis: Mapped[str] = mapped_column(Text(), nullable=False)
    injury_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="stroke",
        comment="stroke, tbi, sci, ms, parkinsons, acl, back_pain, other",
    )
    rehab_phase: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="acute",
        comment="acute, subacute, chronic, maintenance",
    )
    current_protocol_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    goals_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON array of rehab goals"
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        comment="active, completed, paused, discharged",
    )
    assigned_clinician_id: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class RehabAssessment(Base):
    """Standardized rehabilitation outcome measure recording.

    Supports: Fugl-Meyer, Berg Balance Scale, Timed Up & Go,
    6-Minute Walk Test, 10-Meter Walk Test, Modified Ashworth Scale,
    Range of Motion, Manual Muscle Test.
    """

    __tablename__ = "rehab_assessments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    rehab_patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rehab_patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assessment_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="fugl_meyer, berg_balance, tug, six_mwt, ten_mwt, ashworth, rom, mmt",
    )
    scores_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON object with all item scores"
    )
    total_score: Mapped[Optional[float]] = mapped_column(
        Float(), nullable=True
    )
    max_score: Mapped[Optional[float]] = mapped_column(
        Float(), nullable=True
    )
    percentage: Mapped[Optional[float]] = mapped_column(
        Float(), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    assessed_by: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class RehabExercise(Base):
    """Exercise library entry with evidence grading and progression criteria."""

    __tablename__ = "rehab_exercises"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="strengthening, stretching, balance, gait, cardio, neuromuscular",
    )
    body_part: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False)
    sets: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    reps: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    frequency: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    progression_criteria: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True
    )
    contraindications: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True
    )
    evidence_grade: Mapped[Optional[str]] = mapped_column(
        String(5),
        nullable=True,
        comment="A, B, C, D evidence grading",
    )
    video_url: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class RehabProtocol(Base):
    """Individualized rehabilitation protocol / program for a patient.

    Can also serve as a template when status='template'.
    """

    __tablename__ = "rehab_protocols"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    rehab_patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rehab_patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    clinic_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("clinics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="custom or template name"
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    exercises_json: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="JSON array of {exercise_id, order, sets, reps, frequency, notes}",
    )
    goals_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON array of protocol goals"
    )
    outcome_measures_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON array of outcome measure IDs"
    )
    duration_weeks: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True
    )
    frequency_per_week: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True
    )
    progression_rules: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        comment="active, completed, template",
    )
    created_by: Mapped[str] = mapped_column(
        String(36), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class RehabSession(Base):
    """A single rehab session — completion, adherence, and patient-reported outcomes."""

    __tablename__ = "rehab_sessions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    rehab_patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rehab_patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    protocol_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("rehab_protocols.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_number: Mapped[int] = mapped_column(
        Integer(), nullable=False
    )
    exercises_completed_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON array of completed exercise details"
    )
    pain_level: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True, comment="0-10 pain scale"
    )
    fatigue_level: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True, comment="0-10 fatigue scale"
    )
    difficulty_level: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True, comment="0-10 difficulty scale"
    )
    clinician_notes: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True
    )
    duration_minutes: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True
    )
    adherence_pct: Mapped[Optional[float]] = mapped_column(
        Float(), nullable=True, comment="Percentage of prescribed exercises completed"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
