"""Wellness platform models — holistic wellness coaching, sleep tracking,
and lifestyle intervention management.

Tables
------
- wellness_patients       : enrolled wellness patients with domain focus
- sleep_diary_entries     : nightly sleep diary logs
- wellness_assessments    : standardized wellness questionnaires
- wellness_protocols      : individualized wellness programs
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


class WellnessPatient(Base):
    """An enrolled wellness patient with domain focus and active protocol."""

    __tablename__ = "wellness_patients"

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
    wellness_domains_json: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="JSON array: sleep, stress, exercise, nutrition, social, purpose",
    )
    current_protocol_id: Mapped[Optional[str]] = mapped_column(
        String(36), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        comment="active, completed, paused, discharged",
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


class SleepDiaryEntry(Base):
    """A single nightly sleep diary entry with full sleep architecture."""

    __tablename__ = "sleep_diary_entries"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    wellness_patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("wellness_patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    bed_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True
    )
    wake_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(), nullable=True
    )
    sleep_onset_minutes: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True, comment="Minutes to fall asleep"
    )
    awakenings: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True, comment="Number of nighttime awakenings"
    )
    total_sleep_minutes: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True
    )
    time_in_bed_minutes: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True
    )
    sleep_efficiency: Mapped[Optional[float]] = mapped_column(
        Float(), nullable=True, comment="total_sleep / time_in_bed * 100"
    )
    sleep_quality: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True, comment="1-10 subjective sleep quality"
    )
    sleep_aids: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    notes: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class WellnessAssessment(Base):
    """Standardized wellness questionnaire result.

    Supports: WHO-5, SF-12, PSS-10, DASS-21, MEQ, UCLA Loneliness Scale,
    Mediterranean Diet Score.
    """

    __tablename__ = "wellness_assessments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    wellness_patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("wellness_patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assessment_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="who5, sf12, pss10, dass21, meq, ucla_loneliness, mediterranean_diet",
    )
    scores_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON object with all item scores"
    )
    total_score: Mapped[Optional[float]] = mapped_column(
        Float(), nullable=True
    )
    interpretation: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class WellnessProtocol(Base):
    """Individualized wellness program targeting specific wellness domains."""

    __tablename__ = "wellness_protocols"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    wellness_patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("wellness_patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="custom or template name"
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    domains_json: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="JSON array of targeted wellness domains",
    )
    activities_json: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="JSON array of wellness activities",
    )
    duration_weeks: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        comment="active, completed, template",
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
