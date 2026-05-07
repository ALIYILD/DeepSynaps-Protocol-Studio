"""Deterministic synthetic demo seed for Clinician Digest.

This seed exists only to make the Clinician Digest page "doctor-demo-ready"
in controlled preview environments.

Rules:
- Synthetic, non-PHI demo data only.
- Must never run implicitly in production/staging.
- Must only run when explicitly enabled via env flags.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.persistence.models import (
    AdverseEvent,
    AuditEventRecord,
    Patient,
    PatientAdherenceEvent,
    WearableAlertFlag,
    WellnessCheckin,
)
from app.settings import settings


DEMO_PATIENT_SPECS = [
    ("demo-pt-samantha-li", "Samantha", "Li"),
    ("demo-pt-elena-vasquez", "Elena", "Vasquez"),
    ("demo-pt-marcus-chen", "Marcus", "Chen"),
    ("demo-pt-omar-haddad", "Omar", "Haddad"),
    ("demo-pt-amelia-brown", "Amelia", "Brown"),
]


def _truthy_env(v: str | None) -> bool:
    return bool(v and v.strip().lower() in {"1", "true", "yes", "on"})


def demo_clinic_seed_enabled() -> bool:
    """Explicit gate for digest demo seed.

    Required:
    - settings.app_env in {"development","test"}
    - DEEPSYNAPS_DEMO_CLINIC_SEED=1
    """

    if settings.app_env not in ("development", "test"):
        return False
    return _truthy_env(os.getenv("DEEPSYNAPS_DEMO_CLINIC_SEED"))


def seed_demo_clinic_digest(session: Session) -> dict[str, int]:
    """Seed minimal cross-surface activity so Clinician Digest looks alive.

    Idempotent: safe to call multiple times; it will not duplicate the fixed
    patient ids, and audit rows are keyed with unique uuids to avoid collisions.
    """

    now = datetime.now(timezone.utc)
    seeded: dict[str, int] = {
        "patients": 0,
        "audit_events": 0,
        "wearable_flags": 0,
        "adherence_events": 0,
        "wellness_checkins": 0,
        "adverse_events": 0,
    }

    # Use the dev/test demo clinician id that main.py seeds for demo tokens.
    clinician_id = "actor-clinician-demo"

    # 1) Patients (fixed ids, synthetic non-PHI)
    for pid, first, last in DEMO_PATIENT_SPECS:
        existing = session.query(Patient).filter_by(id=pid).first()
        if existing is None:
            session.add(
                Patient(
                    id=pid,
                    clinician_id=clinician_id,
                    first_name=first,
                    last_name=last,
                    email=f"{pid}@example.com",
                    consent_signed=True,
                    status="active",
                    notes="[DEMO] Clinician Digest synthetic preview patient (non-PHI).",
                )
            )
            seeded["patients"] += 1

    session.flush()

    # 2) Hub tables: OPEN items so "Open" count is meaningful.
    for i, (pid, _first, _last) in enumerate(DEMO_PATIENT_SPECS):
        # Wearables Workbench: open flags
        session.add(
            WearableAlertFlag(
                id=str(uuid.uuid4()),
                patient_id=pid,
                flag_type="signal_dropout" if i % 2 == 0 else "hrv_anomaly",
                severity="urgent" if i % 2 == 0 else "warning",
                detail="Synthetic demo wearable alert flag (preview only).",
                metric_snapshot="{}",
                triggered_at=now - timedelta(hours=6, minutes=10 + i),
                workbench_status="open",
                dismissed=False,
            )
        )
        seeded["wearable_flags"] += 1

        # Adherence Hub: open events
        session.add(
            PatientAdherenceEvent(
                id=str(uuid.uuid4()),
                patient_id=pid,
                assignment_id=None,
                course_id=None,
                event_type="side_effect" if i % 2 == 0 else "missed_session",
                severity="moderate" if i % 2 == 0 else "low",
                report_date=(now - timedelta(days=1)).date().isoformat(),
                body="Synthetic demo adherence event for Clinician Digest preview.",
                structured_json="{}",
                status="open",
                acknowledged_by=None,
                acknowledged_at=None,
                resolution_note=None,
                created_at=now - timedelta(hours=8, minutes=5 + i),
            )
        )
        seeded["adherence_events"] += 1

        # Wellness Hub: open check-ins
        session.add(
            WellnessCheckin(
                id=str(uuid.uuid4()),
                patient_id=pid,
                author_actor_id="actor-patient-demo",
                mood=3 if i % 2 == 0 else 4,
                anxiety=4 if i % 2 == 0 else 2,
                sleep=2 if i % 2 == 0 else 3,
                energy=3 if i % 2 == 0 else 4,
                clinician_status="open",
                clinician_acted_at=None,
                deleted_at=None,
                created_at=now - timedelta(hours=10, minutes=2 + i),
                updated_at=now - timedelta(hours=10, minutes=2 + i),
            )
        )
        seeded["wellness_checkins"] += 1

        # AE Hub: open drafts (unsigned and unresolved)
        if i in (1, 4):
            session.add(
                AdverseEvent(
                    id=str(uuid.uuid4()),
                    patient_id=pid,
                    course_id=None,
                    session_id=None,
                    clinician_id=clinician_id,
                    event_type="tolerability",
                    severity="mild",
                    description="Synthetic demo AE draft (preview only).",
                    onset_timing="during_session",
                    resolution="ongoing",
                    action_taken="continue_monitor",
                    reported_at=now - timedelta(days=2, hours=3),
                    resolved_at=None,
                    signed_at=None,
                )
            )
            seeded["adverse_events"] += 1

    # 3) Audit events: handled/escalated/paged + a deterministic SLA breach.
    def add_audit(*, target_type: str, action: str, target_id: str, note: str, created_at: datetime) -> None:
        nonlocal seeded
        session.add(
            AuditEventRecord(
                event_id=f"demo-cdg-{uuid.uuid4().hex}",
                target_id=target_id,
                target_type=target_type,
                action=action,
                role="clinician",
                actor_id=clinician_id,
                note=note,
                created_at=created_at.isoformat(),
            )
        )
        seeded["audit_events"] += 1

    # Window-friendly handled/escalated
    add_audit(
        target_type="clinician_inbox",
        action="clinician_inbox.item_acknowledged",
        target_id="inbox-ack-1",
        note="patient=demo-pt-samantha-li; reviewed",
        created_at=now - timedelta(hours=2),
    )
    add_audit(
        target_type="wearables_workbench",
        action="wearables_workbench.flag_acknowledged",
        target_id="flag-ack-1",
        note="patient=demo-pt-marcus-chen; wearable triage",
        created_at=now - timedelta(hours=3),
    )
    add_audit(
        target_type="clinician_adherence_hub",
        action="clinician_adherence_hub.event_escalated",
        target_id="adh-esc-1",
        note="priority=high; patient=demo-pt-elena-vasquez; severity=urgent",
        created_at=now - timedelta(hours=4),
    )

    # Two PAGED rows so "Today's clinical priorities" shows items.
    add_audit(
        target_type="clinician_inbox",
        action="inbox.item_paged_to_oncall",
        target_id="page-1",
        note="patient=demo-pt-omar-haddad; manual page",
        created_at=now - timedelta(hours=1, minutes=10),
    )
    add_audit(
        target_type="clinician_inbox",
        action="inbox.item_paged_to_oncall",
        target_id="page-2",
        note="patient=demo-pt-amelia-brown; manual page",
        created_at=now - timedelta(hours=1, minutes=35),
    )

    # SLA breach candidate: HIGH priority row, older than wearables SLA, unacknowledged.
    add_audit(
        target_type="wearables_workbench",
        action="wearables_workbench.flag_created",
        target_id="flag-open-sla",
        note="priority=high; patient=demo-pt-samantha-li; severity=high",
        created_at=now - timedelta(hours=3, minutes=20),
    )

    session.commit()
    return seeded


def maybe_seed_demo_clinic_digest(session: Session) -> dict[str, int] | None:
    """Seed digest demo data when explicitly enabled; otherwise do nothing."""

    if not demo_clinic_seed_enabled():
        return None
    return seed_demo_clinic_digest(session)

