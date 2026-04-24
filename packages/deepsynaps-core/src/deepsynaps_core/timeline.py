"""
PatientGraph — the append-only event log that every DeepSynaps subsystem
reads from and writes to.

Every qEEG analysis, MRI analysis, protocol, stim session, wearable day,
PROM, crisis alert, and agent action is one row in ``patient_events``.
This module is the Pydantic contract plus the insert/query helpers.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Event kinds — the closed set of event types Core understands.
# Subsystems MUST use one of these. New kinds require a migration.
# ---------------------------------------------------------------------------
class EventKind(str, Enum):
    # Analyzer outputs
    qeeg_analysis    = "qeeg_analysis"
    mri_analysis     = "mri_analysis"
    # Interventions
    protocol_generated = "protocol_generated"
    protocol_accepted  = "protocol_accepted"
    stim_session       = "stim_session"
    medication_change  = "medication_change"
    # Patient-reported
    prom_score         = "prom_score"
    patient_chat       = "patient_chat"
    # Ambient / continuous
    wearable_day       = "wearable_day"
    wearable_realtime  = "wearable_realtime"
    # Safety
    crisis_alert       = "crisis_alert"
    crisis_resolved    = "crisis_resolved"
    # Agent layer
    agent_action       = "agent_action"
    agent_draft        = "agent_draft"
    clinician_review   = "clinician_review"
    # Audit / system
    ingest             = "ingest"
    system_note        = "system_note"


Source = Literal[
    "qeeg_analyzer", "mri_analyzer",
    "protocol_generator", "dashboard",
    "wearable_apple", "wearable_oura", "wearable_fitbit", "wearable_garmin", "wearable_whoop",
    "prom_app", "patient_chat_app",
    "risk_engine", "openclaw_agent", "clinician",
    "other",
]


class PatientEvent(BaseModel):
    """One immutable event in a patient's longitudinal record."""

    event_id: UUID = Field(default_factory=uuid4)
    patient_id: str
    kind: EventKind
    t_utc: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    t_patient_local: datetime | None = None

    source: Source
    source_version: str | None = None

    # The payload IS the subsystem's native output object (MRIReport,
    # QEEGReport, SOZOProtocol, DailyBioSummary, etc.) serialized to JSON.
    # Core does not parse it — it just stores + indexes.
    payload: dict[str, Any] = Field(default_factory=dict)

    # Idempotency — resending the same event must be a no-op.
    idempotency_key: str | None = None

    # Provenance
    upstream_event_ids: list[UUID] = Field(default_factory=list)
    created_by: str | None = None      # user_id or agent_id
    created_by_kind: Literal["user", "agent", "system"] = "system"

    # Access control
    contains_phi: bool = True
    visibility: Literal["clinician", "patient", "internal", "audit_only"] = "clinician"


# ---------------------------------------------------------------------------
# Convenience constructors that encode the conventions for each subsystem.
# ---------------------------------------------------------------------------
def from_mri_report(patient_id: str, report_dict: dict) -> PatientEvent:
    return PatientEvent(
        patient_id=patient_id,
        kind=EventKind.mri_analysis,
        source="mri_analyzer",
        source_version=report_dict.get("pipeline_version"),
        payload=report_dict,
        idempotency_key=f"mri::{report_dict.get('analysis_id')}",
    )


def from_qeeg_report(patient_id: str, report_dict: dict) -> PatientEvent:
    return PatientEvent(
        patient_id=patient_id,
        kind=EventKind.qeeg_analysis,
        source="qeeg_analyzer",
        source_version=report_dict.get("pipeline_version"),
        payload=report_dict,
        idempotency_key=f"qeeg::{report_dict.get('analysis_id')}",
    )


def from_wearable_day(patient_id: str, source: Source, day_iso: str, summary: dict) -> PatientEvent:
    return PatientEvent(
        patient_id=patient_id,
        kind=EventKind.wearable_day,
        source=source,
        payload={"date": day_iso, **summary},
        idempotency_key=f"{source}::{day_iso}",
    )


def from_prom(patient_id: str, instrument: str, score: float, answers: dict) -> PatientEvent:
    return PatientEvent(
        patient_id=patient_id,
        kind=EventKind.prom_score,
        source="prom_app",
        payload={"instrument": instrument, "total": score, "answers": answers},
    )


def from_crisis_alert(
    patient_id: str, risk: float, tier: Literal["green", "yellow", "orange", "red"],
    drivers: list[dict],
) -> PatientEvent:
    return PatientEvent(
        patient_id=patient_id,
        kind=EventKind.crisis_alert,
        source="risk_engine",
        payload={"risk": risk, "tier": tier, "drivers": drivers},
        visibility="clinician",
    )


def from_agent_action(
    patient_id: str, agent_id: str, action_type: str,
    draft: bool, content: dict, sources: list[str] | None = None,
) -> PatientEvent:
    return PatientEvent(
        patient_id=patient_id,
        kind=EventKind.agent_draft if draft else EventKind.agent_action,
        source="openclaw_agent",
        payload={
            "agent_id": agent_id,
            "action_type": action_type,
            "content": content,
            "sources": sources or [],
        },
        created_by=agent_id,
        created_by_kind="agent",
    )
