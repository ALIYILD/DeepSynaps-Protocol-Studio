"""Pydantic schemas for Brain Map Planner API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class BrainMapPlanCreate(BaseModel):
    """Input schema for creating a brain map plan."""
    patient_id: Optional[str] = Field(None, description="Patient ID; nullable for demo plans")
    region: Optional[str] = Field(None, description="Target region code, e.g. 'DLPFC-L'")
    target_anchor: Optional[str] = Field(None, description="10-20 electrode anchor, e.g. 'F3'")
    protocol_id: Optional[str] = Field(None, description="Selected protocol ID from catalog")
    protocol_name: Optional[str] = Field(None, description="Protocol name/title")
    intensity_ma: Optional[float] = Field(None, description="Stimulation intensity in mA")
    frequency_hz: Optional[float] = Field(None, description="Frequency in Hz")
    session_duration_min: Optional[int] = Field(None, description="Session duration in minutes")
    num_sessions: Optional[int] = Field(None, description="Number of sessions")
    qeeg_analysis_id: Optional[str] = Field(None, description="Linked qEEG analysis ID if present")
    analyzer_fit: Optional[dict[str, Any]] = Field(None, description="Full analyzer fit payload")
    demo_stamp: bool = Field(False, description="Whether this is demo data")
    full_artifact: dict[str, Any] = Field(..., description="Full artifact JSON for audit")
    notes: Optional[str] = Field(None, description="Clinician notes")


class BrainMapPlanResponse(BaseModel):
    """Full brain map plan response."""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Plan ID")
    patient_id: Optional[str] = Field(None, description="Patient ID")
    created_by: str = Field(..., description="Creator actor_id")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    updated_at: Optional[str] = Field(None, description="ISO 8601 update timestamp")
    status: str = Field("draft", description="Plan status: draft | approved | archived")
    region: Optional[str] = Field(None, description="Target region")
    target_anchor: Optional[str] = Field(None, description="10-20 anchor")
    protocol_id: Optional[str] = Field(None, description="Protocol ID")
    protocol_name: Optional[str] = Field(None, description="Protocol name")
    intensity_ma: Optional[float] = Field(None, description="Intensity mA")
    frequency_hz: Optional[float] = Field(None, description="Frequency Hz")
    session_duration_min: Optional[int] = Field(None, description="Duration minutes")
    num_sessions: Optional[int] = Field(None, description="Number of sessions")
    qeeg_analysis_id: Optional[str] = Field(None, description="Linked qEEG analysis")
    analyzer_fit: Optional[dict[str, Any]] = Field(None, description="Analyzer fit data")
    demo_stamp: bool = Field(False, description="Demo flag")
    full_artifact: dict[str, Any] = Field(..., description="Full artifact JSON")
    notes: Optional[str] = Field(None, description="Notes")


class BrainMapPlanListResponse(BaseModel):
    """List of brain map plans."""
    plans: list[BrainMapPlanResponse]
    total: int = Field(..., description="Total count")
    offset: int = Field(0, description="Query offset")
    limit: int = Field(50, description="Query limit")


class BrainMapPlanStatusUpdate(BaseModel):
    """Update status of a brain map plan."""
    status: str = Field(..., description="New status: draft | approved | archived")
    notes: Optional[str] = Field(None, description="Optional status change notes")


class BrainMapPlanAuditEvent(BaseModel):
    """Audit trail entry for a brain map plan."""
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="Audit event ID")
    plan_id: str = Field(..., description="Plan ID")
    actor_id: str = Field(..., description="Actor who performed action")
    action: str = Field(..., description="Action: create | read | update | archive | export_json | export_pdf")
    timestamp: str = Field(..., description="ISO 8601 timestamp")
    metadata: Optional[dict[str, Any]] = Field(None, description="Action metadata")


class BrainMapPlanAuditResponse(BaseModel):
    """Audit trail for a plan."""
    plan_id: str
    events: list[BrainMapPlanAuditEvent]


class BrainMapProtocolItem(BaseModel):
    """Protocol catalog item for search."""
    id: str
    name: str
    indication: Optional[str] = None
    modality: Optional[str] = None
    anode_region: Optional[str] = None
    cathode_region: Optional[str] = None
    evidence_grade: Optional[str] = None
    source: Optional[str] = None


class BrainMapProtocolCatalogResponse(BaseModel):
    """Protocol catalog search results."""
    protocols: list[BrainMapProtocolItem]
    total: int
    query: dict[str, Any]
