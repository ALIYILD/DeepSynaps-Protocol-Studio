"""
Clinical Data Platform — Patient Analytics and Data Console Schemas

Request/response types for patient analytics and data console APIs.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


# ============================================================================
# PATIENT ANALYTICS SCHEMAS
# ============================================================================

class AIAnalyticsSummary(BaseModel):
    """Summary of AI analysis runs."""
    total_runs: int = Field(..., description="Total number of AI analysis runs")
    last_run_date: Optional[datetime] = Field(None, description="Date of most recent AI run")
    pending_analysis: int = Field(default=0, description="Number of pending AI analyses")


class DataAssetSummary(BaseModel):
    """Summary of patient data assets."""
    total_assets: int = Field(..., description="Total number of patient data assets")
    asset_types: Dict[str, int] = Field(default_factory=dict, description="Count by asset type")


class ConsentSummary(BaseModel):
    """Summary of patient consent status."""
    ai_analysis_consent: bool = Field(..., description="Consent for AI analysis")
    device_data_consent: bool = Field(..., description="Consent for device data collection")
    document_generation_consent: bool = Field(..., description="Consent for document generation")


class RiskFlagDetail(BaseModel):
    """Details of a single risk flag."""
    id: str = Field(..., description="Unique flag identifier")
    title: str = Field(..., description="Flag title")
    severity: str = Field(..., description="Severity: warning, caution, or info")


class RiskFlagSummary(BaseModel):
    """Summary of patient risk flags."""
    critical_flags: int = Field(default=0, description="Number of critical flags")
    warning_flags: int = Field(default=0, description="Number of warning flags")
    caution_flags: int = Field(default=0, description="Number of caution flags")


class PatientAnalyticsSummary(BaseModel):
    """Complete patient analytics summary."""
    patient_id: str = Field(..., description="Patient identifier")
    clinic_id: str = Field(..., description="Clinic identifier")
    ai_summary: AIAnalyticsSummary = Field(..., description="AI analysis summary")
    assets: DataAssetSummary = Field(..., description="Data assets summary")
    consent: ConsentSummary = Field(..., description="Consent status")
    risk_flags: RiskFlagSummary = Field(..., description="Risk flags summary")
    last_updated: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")


class TimelineEvent(BaseModel):
    """Single timeline event."""
    timestamp: datetime = Field(..., description="Event timestamp")
    event_type: str = Field(..., description="Event type: ai_run, upload, flag, etc.")
    description: str = Field(..., description="Event description")
    data: Dict[str, Any] = Field(default_factory=dict, description="Event data")


class PatientTimelineResponse(BaseModel):
    """Patient timeline (last 90 days)."""
    patient_id: str = Field(..., description="Patient identifier")
    clinic_id: str = Field(..., description="Clinic identifier")
    events: List[TimelineEvent] = Field(default_factory=list, description="Timeline events")
    total_count: int = Field(default=0, description="Total events in window")


class AuditEventDetail(BaseModel):
    """Single audit log entry."""
    timestamp: datetime = Field(..., description="Audit timestamp")
    actor_id: str = Field(..., description="User/system actor")
    action: str = Field(..., description="Action taken")
    resource_type: str = Field(..., description="Resource type (patient, data, document)")
    resource_id: str = Field(..., description="Resource identifier")


class PatientAuditLogResponse(BaseModel):
    """Audit log for PHI access."""
    patient_id: str = Field(..., description="Patient identifier")
    clinic_id: str = Field(..., description="Clinic identifier")
    events: List[AuditEventDetail] = Field(default_factory=list, description="Audit events")
    total_count: int = Field(default=0, description="Total events")


class SignalCount(BaseModel):
    """Count of signals by severity."""
    critical: int = Field(default=0, description="Critical signals")
    warning: int = Field(default=0, description="Warning signals")
    info: int = Field(default=0, description="Info signals")


class PatientSignalsResponse(BaseModel):
    """Patient safety signals summary."""
    patient_id: str = Field(..., description="Patient identifier")
    clinic_id: str = Field(..., description="Clinic identifier")
    signals: SignalCount = Field(..., description="Signal counts")
    details: List[RiskFlagDetail] = Field(default_factory=list, description="Signal details")


# ============================================================================
# DATA CONSOLE SCHEMAS
# ============================================================================

class DataSourceInfo(BaseModel):
    """Information about a data source."""
    name: str = Field(..., description="Data source name")
    description: str = Field(..., description="Data source description")
    row_count: int = Field(default=0, description="Approximate row count")
    sample_fields: List[str] = Field(default_factory=list, description="Sample field names")


class DataSourcesResponse(BaseModel):
    """List of available data sources."""
    patient_id: str = Field(..., description="Patient identifier")
    clinic_id: str = Field(..., description="Clinic identifier")
    sources: List[DataSourceInfo] = Field(default_factory=list, description="Data sources")
    total_sources: int = Field(default=0, description="Total available sources")


class PatientDataSummary(BaseModel):
    """Summary of patient data in a source."""
    source_name: str = Field(..., description="Data source name")
    row_count: int = Field(default=0, description="Number of rows")
    column_count: int = Field(default=0, description="Number of columns")


class DataRow(BaseModel):
    """Single row of data (with PHI masking indicators)."""
    id: str = Field(..., description="Row identifier")
    data: Dict[str, Any] = Field(..., description="Row data")
    masked_fields: List[str] = Field(default_factory=list, description="Fields that are masked")


class PatientRowsResponse(BaseModel):
    """Paginated data rows."""
    patient_id: str = Field(..., description="Patient identifier")
    clinic_id: str = Field(..., description="Clinic identifier")
    source_name: str = Field(..., description="Data source name")
    rows: List[DataRow] = Field(default_factory=list, description="Data rows")
    total_rows: int = Field(default=0, description="Total rows in source")
    page: int = Field(default=1, description="Current page")
    page_size: int = Field(default=20, description="Rows per page")


class AuditEventEntry(BaseModel):
    """Data Console audit entry."""
    timestamp: datetime = Field(..., description="Audit timestamp")
    actor_id: str = Field(..., description="User/system actor")
    action: str = Field(..., description="Action: view_source, view_rows, export, etc.")
    source_name: str = Field(..., description="Data source accessed")


class PatientAuditLogResponse(BaseModel):
    """Data Console audit log."""
    patient_id: str = Field(..., description="Patient identifier")
    clinic_id: str = Field(..., description="Clinic identifier")
    events: List[AuditEventEntry] = Field(default_factory=list, description="Audit events")
    total_count: int = Field(default=0, description="Total events")
