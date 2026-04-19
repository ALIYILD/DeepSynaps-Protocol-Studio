"""Demo seed script — creates representative demo data for local development.

Usage (from apps/api directory):
    python scripts/seed_demo.py

Idempotent: skips creation if the demo clinician email already exists.

All seeded patients carry the "[DEMO]" prefix in their notes field so the UI
can render a "Demo Data" banner and distinguish them from real patient records.
"""
from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure apps/api is on the path when run directly
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal, init_database
from app.persistence.models import (
    AdverseEvent,
    AssessmentRecord,
    DeviceSessionLog,
    HomeDeviceAssignment,
    OutcomeSeries,
    Patient,
    PatientAdherenceEvent,
    PatientMedication,
    TreatmentCourse,
    User,
)

_CLINICIAN_EMAIL = "demo@deepsynaps.com"
_PATIENT_EMAIL = "patient@deepsynaps.com"
_DEMO_TAG = "[DEMO]"

# bcrypt hash for "demo2026"
# Generated with: import bcrypt; bcrypt.hashpw(b"demo2026", bcrypt.gensalt()).decode()
_DEMO_PASSWORD_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGrmkzRaZQpWnrCWXuH2PgSXl8C"


def _make_id() -> str:
    return str(uuid.uuid4())


def _demo_note(text: str) -> str:
    return f"{_DEMO_TAG} {text}"


def _seed_primary_portal_patient(session, clinician_id: str, patient_user_id: str, now: datetime) -> str:
    """Original demo patient with device assignment, session logs, adherence events.

    Kept for parity with the patient-portal demo login flow.
    """
    patient_id = _make_id()
    patient = Patient(
        id=patient_id,
        clinician_id=clinician_id,
        first_name="Demo",
        last_name="Patient",
        dob="1985-06-15",
        email=_PATIENT_EMAIL,
        phone="+1-555-0100",
        gender="prefer_not_to_say",
        primary_condition="Major Depressive Disorder",
        primary_modality="tDCS",
        consent_signed=True,
        consent_date="2026-01-01",
        status="active",
        notes=_demo_note("Primary portal demo account (patient@deepsynaps.com / demo2026)."),
    )
    session.add(patient)
    session.flush()

    course_id = _make_id()
    course = TreatmentCourse(
        id=course_id,
        patient_id=patient_id,
        clinician_id=clinician_id,
        protocol_id="tdcs-mdd-dlpfc-anodal",
        condition_slug="major-depressive-disorder",
        modality_slug="tdcs",
        device_slug="starstim-home",
        target_region="DLPFC",
        evidence_grade="A",
        on_label=True,
        planned_sessions_total=20,
        planned_sessions_per_week=5,
        planned_session_duration_minutes=30,
        status="active",
        sessions_delivered=3,
        review_required=False,
    )
    session.add(course)

    assignment_id = _make_id()
    assignment = HomeDeviceAssignment(
        id=assignment_id,
        patient_id=patient_id,
        course_id=course_id,
        assigned_by=clinician_id,
        device_name="Fisher Wallace Stimulator",
        device_model="FW-100",
        device_category="CES",
        parameters_json=(
            '{"intensity_ma": 1, "frequency_hz": "15-500Hz", '
            '"duration_min": 20, "electrode_placement": "bilateral mastoid"}'
        ),
        instructions_text=(
            "Use every morning after waking up. Apply electrodes to both sides of "
            "your head per the diagram provided. Duration: 20 minutes per session. "
            "Contact the clinic immediately if you experience unusual symptoms."
        ),
        session_frequency_per_week=5,
        planned_total_sessions=20,
        status="active",
        created_at=now - timedelta(days=14),
        updated_at=now - timedelta(days=14),
    )
    session.add(assignment)

    session_data = [
        (12, True, 4, 3, 4, None),
        (10, True, 4, 3, 4, None),
        (8,  True, 3, 2, 3, "Mild tingling at electrode sites."),
        (6,  True, 3, 3, 4, None),
        (4,  True, 4, 3, 5, None),
    ]
    for i, (days_ago, completed, tolerance, mood_b, mood_a, side_eff) in enumerate(session_data):
        log_date = (now - timedelta(days=days_ago)).date().isoformat()
        log = DeviceSessionLog(
            id=_make_id(),
            assignment_id=assignment_id,
            patient_id=patient_id,
            course_id=course_id,
            session_date=log_date,
            logged_at=now - timedelta(days=days_ago),
            duration_minutes=20,
            completed=completed,
            actual_intensity="1mA",
            electrode_placement="bilateral mastoid",
            side_effects_during=side_eff,
            tolerance_rating=tolerance,
            mood_before=mood_b,
            mood_after=mood_a,
            notes=f"Session {i + 1} — self-reported.",
            status="reviewed" if i < 3 else "pending_review",
            reviewed_by=clinician_id if i < 3 else None,
            reviewed_at=now - timedelta(days=days_ago - 1) if i < 3 else None,
            created_at=now - timedelta(days=days_ago),
        )
        session.add(log)

    for ev_data in (
        {
            "event_type": "side_effect",
            "severity": "low",
            "report_date": (now - timedelta(days=8)).date().isoformat(),
            "body": "Mild tingling sensation during session 3. Resolved within minutes.",
            "status": "acknowledged",
            "acknowledged_by": clinician_id,
            "acknowledged_at": now - timedelta(days=7),
            "resolution_note": "Expected low-level side effect. Patient advised to continue.",
        },
        {
            "event_type": "positive_feedback",
            "severity": None,
            "report_date": (now - timedelta(days=4)).date().isoformat(),
            "body": "Feeling more energetic and less low in mood after last two sessions.",
            "status": "open",
            "acknowledged_by": None,
            "acknowledged_at": None,
            "resolution_note": None,
        },
    ):
        ev = PatientAdherenceEvent(
            id=_make_id(),
            patient_id=patient_id,
            assignment_id=assignment_id,
            course_id=course_id,
            event_type=ev_data["event_type"],
            severity=ev_data["severity"],
            report_date=ev_data["report_date"],
            body=ev_data["body"],
            structured_json="{}",
            status=ev_data["status"],
            acknowledged_by=ev_data["acknowledged_by"],
            acknowledged_at=ev_data["acknowledged_at"],
            resolution_note=ev_data["resolution_note"],
            created_at=now - timedelta(days=4),
        )
        session.add(ev)

    _add_outcomes(session, patient_id, course_id, clinician_id, now,
                  template_id="phq-9", template_title="PHQ-9 Depression",
                  baseline=18, midpoint=12)
    _add_assessments(session, patient_id, clinician_id, now,
                     [("phq-9", "PHQ-9 Depression", "completed", None, "12"),
                      ("gad-7", "GAD-7 Anxiety", "pending", -2, None)])
    _add_medications(session, patient_id, clinician_id, [
        ("Escitalopram", "escitalopram", "SSRI", "10 mg", "qAM", "oral", "MDD"),
    ])

    print(f"Created portal demo patient: {patient_id}")
    return patient_id


def _add_outcomes(session, patient_id, course_id, clinician_id, now,
                  template_id, template_title, baseline, midpoint):
    for days_ago, score, point in (
        (45, baseline, "baseline"),
        (14, midpoint, "mid_treatment"),
    ):
        session.add(OutcomeSeries(
            id=_make_id(),
            patient_id=patient_id,
            course_id=course_id,
            template_id=template_id,
            template_title=template_title,
            score=str(score),
            score_numeric=float(score),
            measurement_point=point,
            administered_at=now - timedelta(days=days_ago),
            clinician_id=clinician_id,
        ))


def _add_assessments(session, patient_id, clinician_id, now, entries):
    """entries: [(template_id, title, status, due_offset_days_or_none, score)].

    due_offset_days is added to `now` to form due_date; negative => overdue.
    """
    for tpl, title, status, due_offset, score in entries:
        due = now + timedelta(days=due_offset) if due_offset is not None else None
        session.add(AssessmentRecord(
            id=_make_id(),
            patient_id=patient_id,
            clinician_id=clinician_id,
            template_id=tpl,
            template_title=title,
            data_json="{}",
            status=status,
            score=score,
            respondent_type="patient",
            due_date=due,
            source="demo_seed",
        ))


def _add_medications(session, patient_id, clinician_id, meds):
    """meds: [(name, generic, drug_class, dose, frequency, route, indication)]."""
    for name, generic, drug_class, dose, freq, route, indication in meds:
        session.add(PatientMedication(
            id=_make_id(),
            patient_id=patient_id,
            clinician_id=clinician_id,
            name=name,
            generic_name=generic,
            drug_class=drug_class,
            dose=dose,
            frequency=freq,
            route=route,
            indication=indication,
            active=True,
        ))


def _med_history(sections: dict, safety: dict, meta_note: str) -> str:
    """Serialize a medical_history blob matching the patients_router shape."""
    return json.dumps({
        "sections": sections,
        "safety": safety,
        "meta": {
            "version": 1,
            "source": "demo_seed",
            "reviewed_at": None,
            "reviewed_by": None,
            "note": meta_note,
        },
    })


# ── Additional realistic demo patients ──────────────────────────────────────
# Each entry drives Patient + TreatmentCourse + meds + assessments + outcomes.

_DEMO_COHORT = [
    {
        "first_name": "Sarah", "last_name": "Chen", "dob": "1991-03-08", "gender": "female",
        "email": "sarah.chen+demo@deepsynaps.com", "phone": "+1-555-0111",
        "condition": "Generalized Anxiety Disorder", "modality": "rTMS", "status": "active",
        "course": {"protocol": "rtms-gad-dmpfc", "target": "DMPFC", "on_label": True,
                   "planned": 25, "delivered": 12, "review_required": False, "status": "active"},
        "assessments": [("gad-7", "GAD-7 Anxiety", "completed", None, "9"),
                        ("gad-7", "GAD-7 Anxiety", "pending", 5, None)],
        "outcomes": ("gad-7", "GAD-7 Anxiety", 17, 9),
        "meds": [("Sertraline", "sertraline", "SSRI", "100 mg", "qAM", "oral", "GAD")],
        "history": {
            "sections": {
                "psychiatric": "Anxiety symptoms since adolescence; no prior hospitalizations.",
                "medical": "Unremarkable. Normal labs 2026-01.",
                "substance": "Denies tobacco/illicit use. Occasional social alcohol.",
                "family": "Mother: GAD. No family history of bipolar or psychosis.",
                "allergies": "NKDA",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "Good candidate for DMPFC rTMS; SSRI continued per referring PCP.",
        },
        "ae": None, "offlabel": False,
    },
    {
        "first_name": "Marcus", "last_name": "Johnson", "dob": "1967-11-22", "gender": "male",
        "email": "marcus.johnson+demo@deepsynaps.com", "phone": "+1-555-0112",
        "condition": "Treatment-Resistant Depression", "modality": "rTMS", "status": "active",
        "course": {"protocol": "rtms-trd-dlpfc", "target": "L-DLPFC", "on_label": True,
                   "planned": 30, "delivered": 22, "review_required": True, "status": "active"},
        "assessments": [("phq-9", "PHQ-9 Depression", "completed", None, "14"),
                        ("phq-9", "PHQ-9 Depression", "pending", -3, None)],  # overdue
        "outcomes": ("phq-9", "PHQ-9 Depression", 22, 14),
        "meds": [("Venlafaxine XR", "venlafaxine", "SNRI", "225 mg", "qAM", "oral", "TRD"),
                 ("Aripiprazole", "aripiprazole", "Atypical antipsychotic", "5 mg", "qHS", "oral", "Augmentation")],
        "history": {
            "sections": {
                "psychiatric": "4 prior major depressive episodes; 2 failed SSRI trials and 1 SNRI trial.",
                "medical": "Hypertension controlled; no cardiac history.",
                "substance": "Former smoker (quit 2018). No current use.",
                "family": "Father: bipolar II. Brother: MDD.",
                "allergies": "Bupropion — rash.",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "Midpoint review required — modest PHQ-9 improvement but below 50% target.",
        },
        "ae": None, "offlabel": False,
    },
    {
        "first_name": "Elena", "last_name": "Okafor", "dob": "1983-07-14", "gender": "female",
        "email": "elena.okafor+demo@deepsynaps.com", "phone": "+1-555-0113",
        "condition": "Post-Traumatic Stress Disorder", "modality": "tDCS", "status": "active",
        "course": {"protocol": "tdcs-ptsd-vmpfc", "target": "VMPFC", "on_label": False,
                   "planned": 20, "delivered": 6, "review_required": True, "status": "active"},
        "assessments": [("pcl-5", "PCL-5 PTSD Checklist", "completed", None, "48"),
                        ("phq-9", "PHQ-9 Depression", "pending", 2, None)],
        "outcomes": ("pcl-5", "PCL-5 PTSD Checklist", 58, 48),
        "meds": [("Prazosin", "prazosin", "Alpha-1 antagonist", "2 mg", "qHS", "oral", "PTSD nightmares")],
        "history": {
            "sections": {
                "psychiatric": "PTSD after MVA 2024; sleep disturbance and hyperarousal predominant.",
                "medical": "Post-concussive headaches — resolving.",
                "substance": "Denies.",
                "family": "Non-contributory.",
                "allergies": "NKDA",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "Off-label protocol — documented clinician rationale and patient consent on file.",
        },
        "ae": {"event_type": "side_effect", "severity": "mild",
               "description": "Transient skin redness at anodal site; resolved within 2h.",
               "days_ago": 5, "resolved": True},
        "offlabel": True,
    },
    {
        "first_name": "David", "last_name": "Wu", "dob": "1996-05-03", "gender": "male",
        "email": "david.wu+demo@deepsynaps.com", "phone": "+1-555-0114",
        "condition": "Chronic Migraine", "modality": "tDCS", "status": "active",
        "course": {"protocol": "tdcs-migraine-m1", "target": "M1", "on_label": True,
                   "planned": 20, "delivered": 14, "review_required": False, "status": "active"},
        "assessments": [("midas", "MIDAS Migraine Disability", "completed", None, "18")],
        "outcomes": ("midas", "MIDAS Migraine Disability", 34, 18),
        "meds": [("Topiramate", "topiramate", "Anticonvulsant", "50 mg", "bid", "oral", "Migraine prophylaxis")],
        "history": {
            "sections": {
                "psychiatric": "No psychiatric history.",
                "medical": "Chronic migraine 8+ days/month for 3 years.",
                "substance": "Denies.",
                "family": "Mother: migraine.",
                "allergies": "NKDA",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "High adherence; tracking monthly headache diary.",
        },
        "ae": None, "offlabel": False,
        "home_high_adherence": True,
    },
    {
        "first_name": "Priya", "last_name": "Nambiar", "dob": "1978-09-30", "gender": "female",
        "email": "priya.nambiar+demo@deepsynaps.com", "phone": "+1-555-0115",
        "condition": "Obsessive-Compulsive Disorder", "modality": "rTMS", "status": "active",
        "course": {"protocol": "drtms-ocd-mpfc-acc", "target": "mPFC/ACC", "on_label": True,
                   "planned": 29, "delivered": 18, "review_required": True, "status": "active"},
        "assessments": [("y-bocs", "Y-BOCS OCD Severity", "completed", None, "22"),
                        ("y-bocs", "Y-BOCS OCD Severity", "pending", -7, None)],  # overdue
        "outcomes": ("y-bocs", "Y-BOCS OCD Severity", 30, 22),
        "meds": [("Fluoxetine", "fluoxetine", "SSRI", "60 mg", "qAM", "oral", "OCD")],
        "history": {
            "sections": {
                "psychiatric": "OCD — contamination and checking subtypes. Prior CBT partial response.",
                "medical": "Unremarkable.",
                "substance": "Denies.",
                "family": "Sister: anxiety.",
                "allergies": "Penicillin — rash.",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "Midpoint Y-BOCS reassessment overdue; schedule before session 20.",
        },
        "ae": None, "offlabel": False,
    },
    {
        "first_name": "Rafael", "last_name": "Figueroa", "dob": "1962-01-19", "gender": "male",
        "email": "rafael.figueroa+demo@deepsynaps.com", "phone": "+1-555-0116",
        "condition": "Post-Stroke Motor Recovery", "modality": "tDCS", "status": "discharged",
        "course": {"protocol": "tdcs-stroke-m1-contra", "target": "Contralesional M1", "on_label": True,
                   "planned": 30, "delivered": 30, "review_required": False, "status": "completed"},
        "assessments": [("fma-ue", "Fugl-Meyer UE", "completed", None, "52")],
        "outcomes": ("fma-ue", "Fugl-Meyer UE", 34, 52),
        "meds": [("Aspirin", "aspirin", "Antiplatelet", "81 mg", "qAM", "oral", "Secondary stroke prevention")],
        "history": {
            "sections": {
                "psychiatric": "Adjustment disorder post-stroke — resolved.",
                "medical": "R MCA ischemic stroke 2024-11; residual mild UE weakness.",
                "substance": "Former smoker.",
                "family": "Father: stroke age 70.",
                "allergies": "NKDA",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "Course complete. FMA-UE gain 18 pts — clinically meaningful. Discharged to PT.",
        },
        "ae": None, "offlabel": False,
    },
    {
        "first_name": "Aisha", "last_name": "Haddad", "dob": "1989-04-25", "gender": "female",
        "email": "aisha.haddad+demo@deepsynaps.com", "phone": "+1-555-0117",
        "condition": "Peripartum Depression", "modality": "rTMS", "status": "on_hold",
        "course": {"protocol": "rtms-mdd-dlpfc", "target": "L-DLPFC", "on_label": True,
                   "planned": 20, "delivered": 8, "review_required": False, "status": "paused"},
        "assessments": [("epds", "EPDS Postnatal Depression", "completed", None, "13")],
        "outcomes": ("epds", "EPDS Postnatal Depression", 19, 13),
        "meds": [],
        "history": {
            "sections": {
                "psychiatric": "Peripartum depression. Prior MDD resolved with SSRI.",
                "medical": "6 weeks postpartum. Breastfeeding.",
                "substance": "Denies.",
                "family": "Mother: postpartum depression.",
                "allergies": "NKDA",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True,
                       "note": "Currently breastfeeding — medication-sparing treatment preferred."},
            "note": "Course paused 1 week for intercurrent viral illness. Resume once afebrile 48h.",
        },
        "ae": None, "offlabel": False,
    },
    {
        "first_name": "James", "last_name": "Abernathy", "dob": "1973-08-11", "gender": "male",
        "email": "james.abernathy+demo@deepsynaps.com", "phone": "+1-555-0118",
        "condition": "Fibromyalgia", "modality": "tDCS", "status": "active",
        "course": {"protocol": "tdcs-fibro-m1", "target": "M1", "on_label": True,
                   "planned": 20, "delivered": 9, "review_required": False, "status": "active"},
        "assessments": [("fiq-r", "FIQ-R Fibromyalgia Impact", "completed", None, "64")],
        "outcomes": ("fiq-r", "FIQ-R Fibromyalgia Impact", 72, 64),
        "meds": [("Duloxetine", "duloxetine", "SNRI", "60 mg", "qAM", "oral", "Fibromyalgia pain"),
                 ("Pregabalin", "pregabalin", "Anticonvulsant", "75 mg", "bid", "oral", "Neuropathic pain")],
        "history": {
            "sections": {
                "psychiatric": "Depression secondary to chronic pain.",
                "medical": "Fibromyalgia dx 2022. Hypothyroid — stable on levothyroxine.",
                "substance": "Denies.",
                "family": "Non-contributory.",
                "allergies": "Sulfa — hives.",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "Adherence has dipped — only 32% of home sessions logged in last 30 days.",
        },
        "ae": None, "offlabel": False,
        "home_low_adherence": True,
    },
    {
        "first_name": "Nora", "last_name": "Iyer", "dob": "2000-12-05", "gender": "female",
        "email": "nora.iyer+demo@deepsynaps.com", "phone": "+1-555-0119",
        "condition": "Generalized Anxiety with Insomnia", "modality": "CES", "status": "active",
        "course": {"protocol": "ces-anxiety-insomnia", "target": "Bilateral mastoid", "on_label": True,
                   "planned": 40, "delivered": 11, "review_required": False, "status": "active"},
        "assessments": [("gad-7", "GAD-7 Anxiety", "completed", None, "11"),
                        ("isi", "Insomnia Severity Index", "completed", None, "16")],
        "outcomes": ("gad-7", "GAD-7 Anxiety", 15, 11),
        "meds": [("Melatonin", "melatonin", "OTC sleep aid", "3 mg", "qHS", "oral", "Sleep onset")],
        "history": {
            "sections": {
                "psychiatric": "Anxiety and chronic insomnia since college.",
                "medical": "Healthy.",
                "substance": "Occasional cannabis for sleep — counseled to discontinue during trial.",
                "family": "Mother: anxiety.",
                "allergies": "NKDA",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "Wearable sync disconnected 6 days — follow up to reconnect before next review.",
        },
        "ae": None, "offlabel": False,
    },
    {
        "first_name": "Samantha", "last_name": "Li", "dob": "1981-02-17", "gender": "female",
        "email": "samantha.li+demo@deepsynaps.com", "phone": "+1-555-0120",
        "condition": "Chronic Subjective Tinnitus", "modality": "rTMS", "status": "active",
        "course": {"protocol": "rtms-tinnitus-ac", "target": "L-auditory cortex", "on_label": False,
                   "planned": 10, "delivered": 4, "review_required": True, "status": "active"},
        "assessments": [("thi", "Tinnitus Handicap Inventory", "completed", None, "56")],
        "outcomes": ("thi", "Tinnitus Handicap Inventory", 68, 56),
        "meds": [],
        "history": {
            "sections": {
                "psychiatric": "Mild anxiety driven by tinnitus distress.",
                "medical": "Bilateral tinnitus 2 years post noise exposure. Audiogram mild HFHL.",
                "substance": "Denies.",
                "family": "Non-contributory.",
                "allergies": "NKDA",
            },
            "safety": {"suicide_ideation": False, "homicidal_ideation": False, "self_harm": False,
                       "siezure_history": False, "metal_implants": False, "pregnancy": False,
                       "acknowledged": True},
            "note": "Off-label indication — IRB-equivalent internal review on file; shared-decision documented.",
        },
        "ae": {"event_type": "tolerability", "severity": "mild",
               "description": "Transient scalp discomfort at coil site; self-limited.",
               "days_ago": 3, "resolved": True},
        "offlabel": True,
    },
]


def _seed_cohort_patient(session, clinician_id: str, entry: dict, now: datetime) -> str:
    pid = _make_id()
    patient = Patient(
        id=pid,
        clinician_id=clinician_id,
        first_name=entry["first_name"],
        last_name=entry["last_name"],
        dob=entry["dob"],
        email=entry["email"],
        phone=entry["phone"],
        gender=entry["gender"],
        primary_condition=entry["condition"],
        primary_modality=entry["modality"],
        consent_signed=True,
        consent_date=(now - timedelta(days=60)).date().isoformat(),
        status=entry["status"],
        notes=_demo_note(entry["history"]["note"]),
        medical_history=_med_history(
            entry["history"]["sections"],
            entry["history"]["safety"],
            entry["history"]["note"],
        ),
    )
    session.add(patient)
    # Flush so AssessmentRecord + TreatmentCourse FKs to patients.id resolve.
    session.flush()

    course_id = _make_id()
    c = entry["course"]
    planned = c["planned"]
    delivered = c["delivered"]
    session.add(TreatmentCourse(
        id=course_id,
        patient_id=pid,
        clinician_id=clinician_id,
        protocol_id=c["protocol"],
        condition_slug=entry["condition"].lower().replace(" ", "-"),
        modality_slug=entry["modality"].lower(),
        device_slug=None,
        target_region=c["target"],
        evidence_grade="B" if c["on_label"] else "C",
        on_label=c["on_label"],
        planned_sessions_total=planned,
        planned_sessions_per_week=5,
        planned_session_duration_minutes=30,
        status=c["status"],
        sessions_delivered=delivered,
        review_required=c["review_required"],
        started_at=now - timedelta(days=max(delivered * 2, 7)),
        approved_by=clinician_id,
        approved_at=now - timedelta(days=max(delivered * 2 + 2, 9)),
    ))

    _add_medications(session, pid, clinician_id, entry["meds"])
    _add_assessments(session, pid, clinician_id, now, entry["assessments"])
    tpl, title, baseline, midpoint = entry["outcomes"]
    _add_outcomes(session, pid, course_id, clinician_id, now, tpl, title, baseline, midpoint)

    # Seed DeviceSessionLog rows so last_session_date / home_adherence populate.
    assignment_id = _make_id()
    session.add(HomeDeviceAssignment(
        id=assignment_id,
        patient_id=pid,
        course_id=course_id,
        assigned_by=clinician_id,
        device_name=f"{entry['modality']} home device",
        device_model="SIM-100",
        device_category=entry["modality"],
        parameters_json="{}",
        instructions_text="Demo assignment — see protocol doc.",
        session_frequency_per_week=5,
        planned_total_sessions=planned,
        status="active" if entry["status"] == "active" else "paused",
        created_at=now - timedelta(days=delivered * 2 + 1),
        updated_at=now - timedelta(days=1),
    ))
    # Adherence pattern: high = nearly all completed; low = ~30% completed
    is_high = entry.get("home_high_adherence", False)
    is_low = entry.get("home_low_adherence", False)
    num_logs = min(delivered, 10)
    for i in range(num_logs):
        days_ago = max(1, int((i + 1) * (delivered / max(num_logs, 1))))
        # Determine completion flag
        if is_low:
            completed = (i % 3 == 0)  # ~33%
        elif is_high:
            completed = True
        else:
            completed = (i != 2)  # mostly completed, one missed
        sess_date = (now - timedelta(days=days_ago)).date().isoformat()
        session.add(DeviceSessionLog(
            id=_make_id(),
            assignment_id=assignment_id,
            patient_id=pid,
            course_id=course_id,
            session_date=sess_date,
            logged_at=now - timedelta(days=days_ago),
            duration_minutes=30,
            completed=completed,
            actual_intensity="1.5mA" if entry["modality"] == "tDCS" else None,
            status="reviewed" if i < (num_logs - 2) else "pending_review",
            reviewed_by=clinician_id if i < (num_logs - 2) else None,
            reviewed_at=(now - timedelta(days=days_ago - 1)) if i < (num_logs - 2) else None,
            created_at=now - timedelta(days=days_ago),
        ))

    # Adverse event if flagged
    ae = entry.get("ae")
    if ae:
        session.add(AdverseEvent(
            id=_make_id(),
            patient_id=pid,
            course_id=course_id,
            session_id=None,
            clinician_id=clinician_id,
            event_type=ae["event_type"],
            severity=ae["severity"],
            description=ae["description"],
            onset_timing="during_session",
            resolution="resolved" if ae.get("resolved") else "ongoing",
            action_taken="continue_monitor",
            reported_at=now - timedelta(days=ae["days_ago"]),
            resolved_at=(now - timedelta(days=ae["days_ago"] - 1)) if ae.get("resolved") else None,
        ))

    return pid


def seed(session) -> None:
    # ── 1. Clinician user ─────────────────────────────────────────────────────
    clinician = session.query(User).filter(User.email == _CLINICIAN_EMAIL).first()
    if clinician is not None:
        print(f"Demo clinician already exists ({_CLINICIAN_EMAIL}). Skipping seed.")
        return

    clinician_id = _make_id()
    clinician = User(
        id=clinician_id,
        email=_CLINICIAN_EMAIL,
        display_name="Dr. Demo Clinician",
        hashed_password=_DEMO_PASSWORD_HASH,
        role="clinician",
        package_id="clinician_pro",
        is_verified=True,
        is_active=True,
    )
    session.add(clinician)
    print(f"Created clinician: {_CLINICIAN_EMAIL}")

    # ── 2. Patient portal login user ──────────────────────────────────────────
    patient_user_id = _make_id()
    patient_user = User(
        id=patient_user_id,
        email=_PATIENT_EMAIL,
        display_name="Demo Patient",
        hashed_password=_DEMO_PASSWORD_HASH,
        role="patient",
        package_id="explorer",
        is_verified=True,
        is_active=True,
    )
    session.add(patient_user)
    print(f"Created patient portal user: {_PATIENT_EMAIL}")

    now = datetime.now(timezone.utc)

    # ── 3. Primary portal-linked demo patient (historical parity) ─────────────
    _seed_primary_portal_patient(session, clinician_id, patient_user_id, now)

    # ── 4. Additional cohort patients ─────────────────────────────────────────
    for entry in _DEMO_COHORT:
        pid = _seed_cohort_patient(session, clinician_id, entry, now)
        print(f"  + {entry['first_name']} {entry['last_name']:<12} {entry['condition']:<38} [{pid[:8]}]")

    session.commit()
    total = 1 + len(_DEMO_COHORT)
    print(f"\nDemo seed complete — {total} patients created.")
    print(f"  Clinician login : {_CLINICIAN_EMAIL}  /  demo2026")
    print(f"  Patient login   : {_PATIENT_EMAIL}  /  demo2026")


def main() -> None:
    init_database()
    db = SessionLocal()
    try:
        seed(db)
    except Exception as exc:
        db.rollback()
        print(f"Seed failed: {exc}", file=sys.stderr)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
