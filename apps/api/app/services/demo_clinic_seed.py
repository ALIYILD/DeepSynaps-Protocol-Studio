from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.persistence.models import (
    AdverseEvent,
    AuditEventRecord,
    ClinicalSession,
    ConsentRecord,
    Patient,
    PatientAdherenceEvent,
    PatientMediaUpload,
    ReviewQueueItem,
    RiskStratificationResult,
    TreatmentCourse,
    WearableAlertFlag,
    WearableDailySummary,
    WellnessCheckin,
)


DEMO_CLINIC_ID = "clinic-demo-default"
DEMO_CLINICIAN_ID = "actor-clinician-demo"

DEMO_DIGEST_PATIENT_SPECS = [
    ("demo-pt-samantha-li", "Samantha", "Li"),
    ("demo-pt-elena-vasquez", "Elena", "Vasquez"),
    ("demo-pt-marcus-chen", "Marcus", "Chen"),
    ("demo-pt-omar-haddad", "Omar", "Haddad"),
    ("demo-pt-amelia-brown", "Amelia", "Brown"),
]


def _env_truthy(name: str) -> bool:
    return (os.environ.get(name, "") or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def demo_seed_enabled(app_env: str) -> bool:
    """Enable demo clinic seeding only when explicitly requested in non-prod envs."""
    if (app_env or "production").lower() not in {"development", "test"}:
        return False
    return _env_truthy("DEEPSYNAPS_DEMO_CLINIC_SEED")


def demo_seed_env_ok() -> bool:
    """Env-only gate for ``apps/api/scripts/seed_demo.py``.

    Both ``DEEPSYNAPS_APP_ENV`` (development|test) and
    ``DEEPSYNAPS_DEMO_CLINIC_SEED=1`` must be set. See
    ``docs/patients-hub-live-readiness.md``.
    """
    env = (os.getenv("DEEPSYNAPS_APP_ENV") or "").strip().lower()
    if env not in ("development", "test"):
        return False
    return os.getenv("DEEPSYNAPS_DEMO_CLINIC_SEED") == "1"


def seed_demo_clinic_data(db: Session) -> dict[str, int]:
    """Idempotently seed a synthetic demo clinic dataset (non-PHI) for live demos.

    IMPORTANT:
    - Must never run in production.
    - All records must be clearly marked as demo (e.g. Patient.notes "[DEMO] ...",
      AdverseEvent.is_demo=True).
    - IDs are deterministic-ish but remain UUIDs to match schema constraints.
    """
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()

    # ── Patients ────────────────────────────────────────────────────────────
    demo_patients = [
        # Names are synthetic; no real addresses/phones; no PHI-like notes.
        ("DEMO Samantha", "Li", "1985-03-12", "Major Depressive Disorder (demo)"),
        ("DEMO Marcus", "Reilly", "1978-07-22", "Anxious depression (demo)"),
        ("DEMO Priya", "Nambiar", "1990-11-04", "GAD (demo)"),
        ("DEMO Jamal", "Thompson", "2011-05-30", "ADHD pediatric (demo)"),
        ("DEMO Elena", "Okafor", "1992-08-19", "Adult ADHD (demo)"),
        ("DEMO Terence", "Wu", "1980-02-14", "PTSD (demo)"),
    ]

    patients: list[Patient] = []
    for i, (first, last, dob, cond) in enumerate(demo_patients, start=1):
        email = f"demo.patient{i}@example.invalid"
        row = db.query(Patient).filter(Patient.email == email).one_or_none()
        if row is None:
            row = Patient(
                id=str(uuid.uuid4()),
                clinician_id=DEMO_CLINICIAN_ID,
                first_name=first,
                last_name=last,
                dob=dob,
                email=email,
                phone=None,
                gender=None,
                primary_condition=cond,
                primary_modality=None,
                consent_signed=False,
                status="active",
                notes="[DEMO] Synthetic demo record — not real patient data.",
            )
            db.add(row)
        patients.append(row)
    db.flush()

    # ── Courses ─────────────────────────────────────────────────────────────
    course_specs = [
        (0, "proto-demo-tdcs-mdd", "mdd", "tDCS", "active", 12, 20, True, "A", False),
        (1, "proto-demo-itbs-ad", "anxious-depression", "rTMS-iTBS", "active", 6, 20, True, "A", False),
        (2, "proto-demo-tacs-gad", "gad", "tACS", "active", 18, 30, True, "B", True),  # review_required for sign-off chip
        (3, "proto-demo-nfb-adhd", "adhd-pediatric", "Neurofeedback", "active", 8, 20, False, "C", True),
        (5, "proto-demo-tdcs-ptsd", "ptsd", "tDCS", "active", 19, 20, True, "B", False),
        (4, "proto-demo-intake-adhd", "adhd-adult", "Intake", "pending_approval", 0, 0, True, "B", True),
    ]
    courses: list[TreatmentCourse] = []
    for idx, protocol_id, cond_slug, mod_slug, status, delivered, total, on_label, grade, review_required in course_specs:
        patient_id = patients[idx].id
        existing = (
            db.query(TreatmentCourse)
            .filter(TreatmentCourse.patient_id == patient_id, TreatmentCourse.protocol_id == protocol_id)
            .one_or_none()
        )
        if existing is None:
            existing = TreatmentCourse(
                id=str(uuid.uuid4()),
                patient_id=patient_id,
                clinician_id=DEMO_CLINICIAN_ID,
                protocol_id=protocol_id,
                condition_slug=cond_slug,
                modality_slug=mod_slug,
                device_slug=None,
                target_region=None,
                phenotype_id=None,
                evidence_grade=grade,
                on_label=bool(on_label),
                planned_sessions_total=int(total),
                planned_sessions_per_week=3 if mod_slug in {"tDCS", "tACS"} else 5,
                planned_session_duration_minutes=40,
                planned_frequency_hz=None,
                planned_intensity=None,
                coil_placement=None,
                status=status,
                sessions_delivered=int(delivered),
                clinician_notes="[DEMO] Synthetic course — for UI demo only.",
                protocol_json="{}",
                review_required=bool(review_required),
                started_at=now - timedelta(days=14),
                updated_at=now,
            )
            db.add(existing)
        courses.append(existing)
    db.flush()

    # ── Today's schedule ────────────────────────────────────────────────────
    # Ensure a few sessions exist with scheduled_at starting with YYYY-MM-DD
    slots = [
        ("09:00", 0, 0, "scheduled"),
        ("09:30", 1, 1, "confirmed"),
        ("10:30", 2, 2, "checked_in"),
        ("11:00", 3, 3, "scheduled"),
        ("14:00", 4, 4, "scheduled"),
        ("15:30", 5, 5, "scheduled"),
    ]
    for hhmm, course_i, sess_num, status in slots:
        scheduled_at = f"{today}T{hhmm}:00+00:00"
        existing = (
            db.query(ClinicalSession)
            .filter(
                ClinicalSession.patient_id == patients[course_i].id,
                ClinicalSession.scheduled_at == scheduled_at,
            )
            .one_or_none()
        )
        if existing is None:
            db.add(
                ClinicalSession(
                    id=str(uuid.uuid4()),
                    patient_id=patients[course_i].id,
                    clinician_id=DEMO_CLINICIAN_ID,
                    scheduled_at=scheduled_at,
                    duration_minutes=40,
                    modality=courses[course_i].modality_slug,
                    protocol_ref=courses[course_i].protocol_id,
                    session_number=sess_num + 1,
                    total_sessions=courses[course_i].planned_sessions_total or None,
                    appointment_type="session",
                    status=status,
                    room_id="Room A",
                    device_id=None,
                )
            )

    # ── Pending reviews (review queue) ──────────────────────────────────────
    for i, c in enumerate(courses[:3]):
        # One pending review item per course
        existing = (
            db.query(ReviewQueueItem)
            .filter(ReviewQueueItem.target_id == c.id, ReviewQueueItem.status == "pending")
            .one_or_none()
        )
        if existing is None:
            db.add(
                ReviewQueueItem(
                    id=str(uuid.uuid4()),
                    item_type="protocol_review",
                    target_id=c.id,
                    target_type="treatment_course",
                    patient_id=c.patient_id,
                    assigned_to=None,
                    priority="high" if i == 0 else "normal",
                    status="pending",
                    created_by=DEMO_CLINICIAN_ID,
                    due_by=now + timedelta(days=1),
                    notes="[DEMO] Review required: synthetic pending sign-off.",
                )
            )

    # ── Consents ────────────────────────────────────────────────────────────
    # Mix of signed/expiring/missing. Dashboard uses ConsentRecord + Patient.consent_signed.
    for i, p in enumerate(patients):
        expires_at = now + timedelta(days=(10 if i % 2 == 0 else -3))  # some expired
        existing = (
            db.query(ConsentRecord)
            .filter(
                ConsentRecord.patient_id == p.id,
                ConsentRecord.consent_type == "treatment",
            )
            .one_or_none()
        )
        if existing is None:
            signed = i % 3 != 0
            db.add(
                ConsentRecord(
                    id=str(uuid.uuid4()),
                    patient_id=p.id,
                    clinician_id=DEMO_CLINICIAN_ID,
                    consent_type="treatment",
                    modality_slug=courses[i].modality_slug if i < len(courses) else None,
                    status="active",
                    signed=signed,
                    signed_at=(now - timedelta(days=30)) if signed else None,
                    expires_at=expires_at,
                    notes="[DEMO] Synthetic consent record — not a legal document.",
                )
            )
            p.consent_signed = signed

    # ── Adverse events ──────────────────────────────────────────────────────
    # Seed one serious unresolved + one mild resolved.
    if not db.query(AdverseEvent).filter(AdverseEvent.is_demo.is_(True)).first():
        db.add(
            AdverseEvent(
                id=str(uuid.uuid4()),
                patient_id=patients[1].id,
                course_id=courses[1].id,
                clinician_id=DEMO_CLINICIAN_ID,
                event_type="headache",
                severity="serious",
                description="[DEMO] Synthetic adverse event example for UI demo.",
                onset_timing="during_session",
                resolution=None,
                action_taken="paused",
                reported_at=now - timedelta(hours=5),
                resolved_at=None,
                is_serious=True,
                reportable=False,
                is_demo=True,
            )
        )
        db.add(
            AdverseEvent(
                id=str(uuid.uuid4()),
                patient_id=patients[0].id,
                course_id=courses[0].id,
                clinician_id=DEMO_CLINICIAN_ID,
                event_type="scalp_tingling",
                severity="mild",
                description="[DEMO] Synthetic mild adverse event (resolved).",
                onset_timing="post_session",
                resolution="resolved",
                action_taken="reassured",
                reported_at=now - timedelta(days=2),
                resolved_at=now - timedelta(days=1),
                is_serious=False,
                reportable=False,
                is_demo=True,
            )
        )

    # ── Wearables: summaries + alerts ───────────────────────────────────────
    for p in patients[:3]:
        for d in range(7):
            date = (now.date() - timedelta(days=(6 - d))).isoformat()
            exists = (
                db.query(WearableDailySummary)
                .filter_by(patient_id=p.id, source="demo", date=date)
                .one_or_none()
            )
            if exists is None:
                db.add(
                    WearableDailySummary(
                        id=str(uuid.uuid4()),
                        patient_id=p.id,
                        source="demo",
                        date=date,
                        rhr_bpm=62 + (d % 3),
                        hrv_ms=38 + (d % 5) * 2,
                        sleep_duration_h=6.5 + (d % 4) * 0.3,
                        steps=6000 + d * 500,
                        spo2_pct=97.5,
                        mood_score=3.0 + (d % 3) * 0.3,
                        anxiety_score=4.0 - (d % 2) * 0.5,
                        data_json=None,
                    )
                )

    existing_alert = (
        db.query(WearableAlertFlag)
        .filter(
            WearableAlertFlag.patient_id == patients[2].id,
            WearableAlertFlag.flag_type == "sleep_disruption",
            WearableAlertFlag.dismissed.is_(False),
        )
        .one_or_none()
    )
    if existing_alert is None:
        db.add(
            WearableAlertFlag(
                id=str(uuid.uuid4()),
                patient_id=patients[2].id,
                course_id=courses[2].id,
                flag_type="sleep_disruption",
                severity="urgent",
                detail="[DEMO] Sleep duration fell below threshold for 3 nights.",
                metric_snapshot='{"sleep_duration_h": 4.2, "baseline_h": 6.8}',
                triggered_at=now - timedelta(hours=8),
                dismissed=False,
                auto_generated=True,
                workbench_status="open",
            )
        )

    # ── Risk stratification ─────────────────────────────────────────────────
    categories = [
        ("suicide_risk", "green"),
        ("self_harm", "green"),
        ("mental_crisis", "amber"),
        ("harm_to_others", "green"),
        ("allergy", "red"),
        ("seizure_risk", "green"),
        ("implant_risk", "green"),
        ("medication_interaction", "amber"),
    ]
    for cat, level in categories:
        existing = (
            db.query(RiskStratificationResult)
            .filter(RiskStratificationResult.patient_id == patients[1].id, RiskStratificationResult.category == cat)
            .one_or_none()
        )
        if existing is None:
            db.add(
                RiskStratificationResult(
                    id=str(uuid.uuid4()),
                    patient_id=patients[1].id,
                    clinician_id=DEMO_CLINICIAN_ID,
                    category=cat,
                    level=level,
                    confidence="high" if level != "green" else "no_data",
                    rationale="[DEMO] Synthetic risk level for UI demo. Not a diagnosis.",
                    data_sources_json='["demo_seed"]',
                    evidence_refs_json="[]",
                    computed_at=now,
                )
            )

    # ── Clinician inbox: high priority audit events ─────────────────────────
    # Clinician inbox /summary reads high-priority audit rows.
    demo_inbox_events = [
        # Keep `action` <= 32 chars (AuditEventRecord.action is String(32)).
        ("patient_messages", "patient_messages_to_clinician", patients[1].id, "New patient message flagged urgent."),
        ("wearables_workbench", "wearables_workbench_to_clinician", patients[2].id, "Wearable alert escalated by system."),
    ]
    for target_type, action, patient_id, msg in demo_inbox_events:
        event_id = f"demo-inbox-{target_type}-{patient_id[:8]}"
        exists = db.query(AuditEventRecord).filter(AuditEventRecord.event_id == event_id).one_or_none()
        if exists is None:
            db.add(
                AuditEventRecord(
                    event_id=event_id,
                    target_id=patient_id,
                    target_type=target_type,
                    action=action,
                    role="clinician",
                    actor_id=DEMO_CLINICIAN_ID,
                    note=f"[DEMO] priority=high patient_id={patient_id} {msg} No clinical action taken.",
                    created_at=now.isoformat(),
                )
            )

    # ── Media review queue seed ─────────────────────────────────────────────
    # Seed uploads that will appear in /media/review-queue.
    if not db.query(PatientMediaUpload).filter(PatientMediaUpload.uploaded_by == DEMO_CLINICIAN_ID).first():
        db.add(
            PatientMediaUpload(
                id=str(uuid.uuid4()),
                patient_id=patients[0].id,
                course_id=courses[0].id,
                session_id=None,
                uploaded_by=DEMO_CLINICIAN_ID,
                media_type="voice",
                file_ref=None,
                file_size_bytes=None,
                duration_seconds=45,
                text_content=None,
                patient_note="[DEMO] Synthetic upload for review queue demo.",
                status="pending_review",
                consent_id=None,
                expires_at=now + timedelta(days=7),
            )
        )
        db.add(
            PatientMediaUpload(
                id=str(uuid.uuid4()),
                patient_id=patients[2].id,
                course_id=courses[2].id,
                session_id=None,
                uploaded_by=DEMO_CLINICIAN_ID,
                media_type="text",
                file_ref=None,
                file_size_bytes=None,
                duration_seconds=None,
                text_content="[DEMO] 'Felt more anxious after yesterday’s session; sleep was poor.'",
                patient_note=None,
                status="pending_review",
                consent_id=None,
                expires_at=now + timedelta(days=7),
            )
        )

    db.commit()

    return {
        "patients": len(patients),
        "courses": len(courses),
    }


def seed_demo_clinic_digest(session: Session) -> dict[str, int]:
    """Seed minimal cross-surface activity so Clinician Digest renders non-zero
    counts in controlled preview environments.

    Idempotent: patient ids are fixed and skipped if present; audit rows use
    fresh uuids so re-runs don't collide on event_id.
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
    clinician_id = DEMO_CLINICIAN_ID

    for pid, first, last in DEMO_DIGEST_PATIENT_SPECS:
        if session.query(Patient).filter_by(id=pid).first() is None:
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

    for i, (pid, _first, _last) in enumerate(DEMO_DIGEST_PATIENT_SPECS):
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

    def _add_audit(*, target_type: str, action: str, target_id: str, note: str, created_at: datetime) -> None:
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

    _add_audit(
        target_type="clinician_inbox",
        action="clinician_inbox.item_acknowledged",
        target_id="inbox-ack-1",
        note="patient=demo-pt-samantha-li; reviewed",
        created_at=now - timedelta(hours=2),
    )
    _add_audit(
        target_type="wearables_workbench",
        action="wearables_workbench.flag_acknowledged",
        target_id="flag-ack-1",
        note="patient=demo-pt-marcus-chen; wearable triage",
        created_at=now - timedelta(hours=3),
    )
    _add_audit(
        target_type="clinician_adherence_hub",
        action="clinician_adherence_hub.event_escalated",
        target_id="adh-esc-1",
        note="priority=high; patient=demo-pt-elena-vasquez; severity=urgent",
        created_at=now - timedelta(hours=4),
    )
    _add_audit(
        target_type="clinician_inbox",
        action="inbox.item_paged_to_oncall",
        target_id="page-1",
        note="patient=demo-pt-omar-haddad; manual page",
        created_at=now - timedelta(hours=1, minutes=10),
    )
    _add_audit(
        target_type="clinician_inbox",
        action="inbox.item_paged_to_oncall",
        target_id="page-2",
        note="patient=demo-pt-amelia-brown; manual page",
        created_at=now - timedelta(hours=1, minutes=35),
    )
    _add_audit(
        target_type="wearables_workbench",
        action="wearables_workbench.flag_created",
        target_id="flag-open-sla",
        note="priority=high; patient=demo-pt-samantha-li; severity=high",
        created_at=now - timedelta(hours=3, minutes=20),
    )

    session.commit()
    return seeded
