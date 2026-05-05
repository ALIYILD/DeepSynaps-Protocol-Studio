"""QEEG-105 analysis job queue + audit tables.

Tables are additive and intentionally do not replace legacy qEEG pipeline rows
(``qeeg_analyses``). QEEG-105 jobs reference EEG Studio recordings so multiple
analyses can be run per recording with stable params hashing.
"""

from __future__ import annotations

import uuid

from ._base import (  # noqa: F401
    Base,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Mapped,
    String,
    Text,
    UniqueConstraint,
    datetime,
    mapped_column,
    timezone,
)


class QeegAnalysisJob(Base):
    __tablename__ = "qeeg_analysis_jobs"
    __table_args__ = (
        Index("ix_qeeg_analysis_jobs_recording_code", "recording_id", "analysis_code"),
        UniqueConstraint(
            "recording_id",
            "analysis_code",
            "params_hash",
            name="uq_qeeg_analysis_jobs_recording_code_params_hash",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    recording_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("eeg_studio_recordings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("patients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    analysis_code: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    params_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    params_json: Mapped[str] = mapped_column(Text(), nullable=False, default="{}")

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)
    priority: Mapped[str] = mapped_column(String(16), nullable=False, default="normal")
    estimated_runtime_sec: Mapped[int | None] = mapped_column(Integer(), nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(), nullable=True)
    result_s3_key: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text(), nullable=True)

    created_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc), index=True
    )


class QeegAnalysisAudit(Base):
    __tablename__ = "qeeg_analysis_audit"
    __table_args__ = (Index("ix_qeeg_analysis_audit_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer(), primary_key=True, autoincrement=True)
    job_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("qeeg_analysis_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    metadata_json: Mapped[str | None] = mapped_column(Text(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc), index=True
    )


class QeegAnalysisDefinitionsCache(Base):
    __tablename__ = "qeeg_analysis_definitions_cache"

    code: Mapped[str] = mapped_column(String(120), primary_key=True)
    definition_json: Mapped[str] = mapped_column(Text(), nullable=False)
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

