"""Complementary therapy platform models — acupuncture, neurofeedback,
Cranial Electrical Stimulation (CES), photobiomodulation (PBM), mind-body,
massage, and music/art therapy.

Tables
------
- complementary_patients     : enrolled complementary therapy patients
- complementary_sessions     : per-session therapy data and outcomes
- complementary_protocols    : individualized therapy plans
- therapy_library_entries    : master therapy type definitions & evidence
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


class ComplementaryPatient(Base):
    """An enrolled complementary therapy patient with active therapies."""

    __tablename__ = "complementary_patients"

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
    active_therapies_json: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="JSON array of active therapy types",
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


class ComplementarySession(Base):
    """A single complementary therapy session with therapy-specific data.

    The ``session_data_json`` column stores therapy-type-specific details:
    - acupuncture: needle points, retention time, deqi response
    - neurofeedback: protocol, thresholds, reward band, artifacts
    - ces: device, current (uA), frequency, electrode placement
    - pbm: wavelength, power density, exposure time, target area
    - mindbody: modality (meditation/breathing/yoga), guided/self, duration
    - massage: technique, body areas, pressure level
    - music_art: modality, engagement level, emotional response
    """

    __tablename__ = "complementary_sessions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    complementary_patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("complementary_patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    therapy_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="acupuncture, neurofeedback, ces, pbm, mindbody, massage, music_art",
    )
    session_number: Mapped[int] = mapped_column(
        Integer(), nullable=False
    )
    session_data_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="Therapy-type-specific session data (JSON)"
    )
    outcome_scores_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON array of outcome scores pre/post"
    )
    clinician_notes: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True
    )
    safety_flags_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON array of safety observations"
    )
    practitioner_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    practitioner_credentials: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class ComplementaryProtocol(Base):
    """Individualized complementary therapy protocol / plan."""

    __tablename__ = "complementary_protocols"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    complementary_patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("complementary_patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    therapy_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        comment="acupuncture, neurofeedback, ces, pbm, mindbody, massage, music_art",
    )
    template_name: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, comment="custom or template name"
    )
    total_sessions: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True
    )
    frequency: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, comment="e.g. '2x/week', 'bi-weekly'"
    )
    goals: Mapped[Optional[str]] = mapped_column(Text(), nullable=True)
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


class TherapyLibraryEntry(Base):
    """Master catalogue of available complementary therapy types.

    Serves as the reference data for therapy selection, evidence grading,
    and contraindication checking across the complementary platform.
    """

    __tablename__ = "therapy_library_entries"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="energy_based, body_based, mind_body, sensory, manual",
    )
    description: Mapped[str] = mapped_column(Text(), nullable=False)
    conditions_json: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="JSON array of indicated conditions"
    )
    evidence_grade: Mapped[Optional[str]] = mapped_column(
        String(5),
        nullable=True,
        comment="A, B, C, D evidence grading",
    )
    contraindications: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True
    )
    practitioner_required: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, default=True
    )
    session_structure: Mapped[Optional[str]] = mapped_column(
        Text(), nullable=True, comment="Typical session flow / structure"
    )
    typical_frequency: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True, comment="e.g. '1-2x/week'"
    )
    duration_minutes: Mapped[Optional[int]] = mapped_column(
        Integer(), nullable=True, comment="Typical session duration in minutes"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
