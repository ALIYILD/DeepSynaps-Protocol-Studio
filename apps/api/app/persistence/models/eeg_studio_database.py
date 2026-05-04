"""EEG Studio database — WinEEG `eegbase`-style recordings tied to patients."""

from __future__ import annotations

from ._base import (
    Base,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Mapped,
    String,
    Text,
    datetime,
    mapped_column,
    timezone,
    uuid,
)


class EegStudioProfileRevision(Base):
    """Append-only snapshot whenever ``Patient.eeg_studio_profile_json`` changes."""

    __tablename__ = "eeg_studio_profile_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    snapshot_json: Mapped[str] = mapped_column(Text(), nullable=False)
    editor_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class EegStudioRecording(Base):
    """Continuous EEG / ERP acquisition row — raw bytes on disk or S3."""

    __tablename__ = "eeg_studio_recordings"
    __table_args__ = (
        Index("ix_eegsr_patient_recorded", "patient_id", "recorded_at"),
        Index("ix_eegsr_clinician", "clinician_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    recorded_at: Mapped[datetime] = mapped_column(DateTime(), nullable=False)
    operator_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    equipment: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sample_rate_hz: Mapped[float | None] = mapped_column(Float(), nullable=True)
    calibration_file_ref: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cap_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    impedance_log_json: Mapped[str | None] = mapped_column(Text(), nullable=True)

    raw_storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    duration_sec: Mapped[float] = mapped_column(Float(), nullable=False, default=0.0)
    metadata_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")

    search_blob: Mapped[str | None] = mapped_column(Text(), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class EegStudioDerivative(Base):
    """Filtered / ICA / spectra / ERP / report artifacts derived from a recording."""

    __tablename__ = "eeg_studio_derivatives"
    __table_args__ = (Index("ix_eegsd_recording_kind", "recording_id", "kind"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    recording_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("eeg_studio_recordings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    metadata_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
