"""Laboratory result persistence — clinician-entered or imported rows."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, String

from ._base import Base, Mapped, mapped_column, Optional, uuid


class PatientLabResult(Base):
    """One analyte result bound to a patient (DeepSynaps-entered or sync).

    Used when external FHIR/LIMS integrations are absent — clinicians can
    record values so the Labs Analyzer reflects real chart data.
    """

    __tablename__ = "patient_lab_results"
    __table_args__ = (Index("ix_patient_lab_results_patient_created", "patient_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clinician_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    analyte_code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    analyte_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    panel_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    value_numeric: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    value_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    unit_ucum: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ref_low: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    ref_high: Mapped[Optional[float]] = mapped_column(Float(), nullable=True)
    ref_text: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sample_collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(), nullable=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    is_demo: Mapped[bool] = mapped_column(Boolean(), nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )
