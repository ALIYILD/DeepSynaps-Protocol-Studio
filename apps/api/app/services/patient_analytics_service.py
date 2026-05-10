"""Patient analytics data aggregation service.

Builds cross-modality summaries for dashboards:
- Timeline of all events (uploads, analyses, AI runs)
- Risk signals and flags
- Analytics by modality
- Consent and audit status
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.persistence.models import (
    Patient, User, AIAnalysisRun, SafetyFlag, 
    ConsentRecord, AuditEventRecord, PatientDataAsset
)
import logging
import json

logger = logging.getLogger(__name__)


def get_patient_timeline(
    session: Session, 
    patient_id: str,
    days: int = 90,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Get recent activity timeline for patient.
    
    Combines uploads, analyses, AI runs, flags.
    
    Args:
        session: Database session
        patient_id: Patient ID
        days: Look back this many days
        limit: Max events to return
        
    Returns:
        List of timeline events (dicts) sorted by date descending
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    events = []
    
    # AI analysis runs
    ai_runs = session.query(AIAnalysisRun).filter(
        and_(
            AIAnalysisRun.patient_id == patient_id,
            AIAnalysisRun.created_at >= cutoff,
        )
    ).all()
    for run in ai_runs:
        events.append({
            "type": "ai_analysis",
            "id": run.id,
            "timestamp": run.created_at.isoformat(),
            "analysis_type": run.analysis_type,
            "status": run.status,
            "clinician_review_status": run.clinician_review_status,
        })
    
    # Safety flags
    flags = session.query(SafetyFlag).filter(
        and_(
            SafetyFlag.patient_id == patient_id,
            SafetyFlag.created_at >= cutoff,
        )
    ).all()
    for flag in flags:
        events.append({
            "type": "safety_flag",
            "id": flag.id,
            "timestamp": flag.created_at.isoformat(),
            "severity": flag.severity,
            "message": flag.message,
            "status": flag.status,
        })
    
    # Data uploads
    assets = session.query(PatientDataAsset).filter(
        and_(
            PatientDataAsset.patient_id == patient_id,
            PatientDataAsset.created_at >= cutoff,
        )
    ).all()
    for asset in assets:
        events.append({
            "type": "data_upload",
            "id": asset.id,
            "timestamp": asset.created_at.isoformat(),
            "asset_type": asset.asset_type,
            "filename": asset.original_filename or asset.filename,
            "processing_status": asset.processing_status,
        })
    
    # Sort by timestamp descending, limit
    events = sorted(events, key=lambda x: x["timestamp"], reverse=True)[:limit]
    
    return events


def get_patient_risk_summary(
    session: Session, patient_id: str
) -> Dict[str, Any]:
    """Get summary of patient's risk flags and concerns.
    
    Args:
        session: Database session
        patient_id: Patient ID
        
    Returns:
        Dict with active flags by severity level
    """
    flags = session.query(SafetyFlag).filter(
        and_(
            SafetyFlag.patient_id == patient_id,
            SafetyFlag.status == "active",
        )
    ).all()
    
    summary = {
        "critical": [],
        "high": [],
        "warning": [],
        "info": [],
    }
    
    for flag in flags:
        entry = {
            "id": flag.id,
            "flag_type": flag.flag_type,
            "message": flag.message,
            "created_at": flag.created_at.isoformat(),
        }
        summary[flag.severity].append(entry)
    
    return summary


def get_patient_analytics_summary(
    session: Session, patient_id: str
) -> Dict[str, Any]:
    """Get comprehensive analytics summary for patient.
    
    Args:
        session: Database session
        patient_id: Patient ID
        
    Returns:
        Dict with analytics metrics
    """
    patient = session.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        return {}
    
    # Count AI runs by status
    ai_runs = session.query(AIAnalysisRun).filter(
        AIAnalysisRun.patient_id == patient_id
    ).all()
    
    ai_summary = {
        "total": len(ai_runs),
        "pending": sum(1 for r in ai_runs if r.status == "pending"),
        "processing": sum(1 for r in ai_runs if r.status == "processing"),
        "completed": sum(1 for r in ai_runs if r.status == "completed"),
        "failed": sum(1 for r in ai_runs if r.status in ["failed", "errored"]),
        "pending_review": sum(1 for r in ai_runs if r.clinician_review_status == "pending"),
    }
    
    # Count data assets
    assets = session.query(PatientDataAsset).filter(
        PatientDataAsset.patient_id == patient_id
    ).all()
    
    asset_summary = {
        "total": len(assets),
        "by_type": {},
    }
    for asset in assets:
        asset_type = asset.asset_type
        asset_summary["by_type"][asset_type] = asset_summary["by_type"].get(asset_type, 0) + 1
    
    # Consent status
    consent_records = session.query(ConsentRecord).filter(
        ConsentRecord.patient_id == patient_id
    ).all()
    
    consent_summary = {
        "total": len(consent_records),
        "active": sum(1 for c in consent_records if c.status == "active"),
        "withdrawn": sum(1 for c in consent_records if c.status == "withdrawn"),
        "expired": sum(1 for c in consent_records if c.status == "expired"),
    }
    
    # Risk flags
    risk_summary = get_patient_risk_summary(session, patient_id)
    active_flags = sum(len(v) for v in risk_summary.values())
    
    return {
        "patient_id": patient_id,
        "created_at": patient.created_at.isoformat(),
        "ai_analysis": ai_summary,
        "data_assets": asset_summary,
        "consent": consent_summary,
        "risk_flags": {
            "active": active_flags,
            "by_severity": risk_summary,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def get_patient_audit_log(
    session: Session,
    patient_id: str,
    days: int = 30,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Get audit trail for patient PHI access.
    
    Args:
        session: Database session
        patient_id: Patient ID
        days: Look back this many days
        limit: Max events to return
        
    Returns:
        List of audit events (dicts) sorted by date descending
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    
    audit_events = session.query(AuditEventRecord).filter(
        and_(
            AuditEventRecord.patient_id == patient_id,
            AuditEventRecord.created_at >= cutoff,
        )
    ).order_by(AuditEventRecord.created_at.desc()).limit(limit).all()
    
    return [
        {
            "id": event.id,
            "actor_id": event.actor_user_id,
            "action": event.action,
            "resource_type": event.resource_type,
            "result": event.result,
            "timestamp": event.created_at.isoformat(),
            "reason": event.reason,
        }
        for event in audit_events
    ]


def get_patient_signal_count(
    session: Session, patient_id: str, signal_type: str
) -> int:
    """Count signals of a specific type for patient.
    
    Args:
        session: Database session
        patient_id: Patient ID
        signal_type: Type of signal (safety_flag, ai_pending_review, etc.)
        
    Returns:
        Count of signals
    """
    if signal_type == "safety_flag":
        return session.query(SafetyFlag).filter(
            and_(
                SafetyFlag.patient_id == patient_id,
                SafetyFlag.status == "active",
            )
        ).count()
    elif signal_type == "ai_pending_review":
        return session.query(AIAnalysisRun).filter(
            and_(
                AIAnalysisRun.patient_id == patient_id,
                AIAnalysisRun.clinician_review_status == "pending",
            )
        ).count()
    elif signal_type == "consent_missing":
        # Check for gaps in required consent types
        required_types = ["general", "ai_analysis"]
        missing_count = 0
        for consent_type in required_types:
            if not session.query(ConsentRecord).filter(
                and_(
                    ConsentRecord.patient_id == patient_id,
                    ConsentRecord.consent_type == consent_type,
                    ConsentRecord.status == "active",
                )
            ).first():
                missing_count += 1
        return missing_count
    
    return 0
