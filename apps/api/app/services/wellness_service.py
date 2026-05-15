"""Wellness & Lifestyle Platform service layer.

Provides business logic for:
- Sleep optimization (diary, efficiency calculation, CBT-I)
- Stress/resilience (PSS-10, DASS-21, HRV biofeedback)
- Exercise prescription (FITT-VP, mood correlation)
- Lifestyle assessments (WHO-5, SF-12, MEQ, MDS, UCLA, PROMIS)
- Protocol builder (10 evidence-based templates)
- Wellness wheel (6-domain holistic assessment)
- Progress tracking and clinical alerts
- Wearable data integration

All functions accept a SQLAlchemy session and are clinic-scoped where applicable.
"""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.errors import ApiServiceError


# ═══════════════════════════════════════════════════════════════════════════════
# Constants & Reference Data
# ═══════════════════════════════════════════════════════════════════════════════


# PSS-10 reverse-scored items (0-indexed: items 4, 5, 7, 8)
PSS10_REVERSE_ITEMS = {3, 4, 6, 7}

# PSS-10 severity thresholds
PSS10_SEVERITY = [
    (0, 13, "Low stress"),
    (14, 19, "Mild stress"),
    (20, 26, "Moderate stress"),
    (27, 40, "High perceived stress"),
]

# DASS-21 severity thresholds (multiplied ×2)
DASS_SEVERITY = [
    (0, 14, "Normal"),
    (15, 18, "Mild"),
    (19, 25, "Moderate"),
    (26, 33, "Severe"),
    (34, 42, "Extremely severe"),
]

# Sleep efficiency thresholds (AASM)
SLEEP_EFFICIENCY_THRESHOLDS = [
    (0, 69, "Poor — CBT-I strongly recommended"),
    (70, 84, "Moderate — consider sleep hygiene optimization"),
    (85, 89, "Good"),
    (90, 100, "Excellent"),
]

# MEQ chronotype thresholds
MEQ_CHRONOTYPES = [
    (70, 86, "Definite Morning (Lark)"),
    (59, 69, "Moderate Morning"),
    (42, 58, "Intermediate"),
    (31, 41, "Moderate Evening (Owl)"),
    (16, 30, "Definite Evening"),
]

# WHO-5 well-being thresholds
WHO5_THRESHOLDS = [
    (0, 27, "Poor well-being — clinical follow-up recommended"),
    (28, 49, "Below average well-being"),
    (50, 69, "Moderate well-being"),
    (70, 100, "Good well-being"),
]

# UCLA Loneliness thresholds
UCLA_THRESHOLDS = [
    (20, 34, "Low loneliness"),
    (35, 49, "Moderate loneliness"),
    (50, 80, "High loneliness — intervention recommended"),
]

# Mediterranean Diet Score thresholds
MDS_THRESHOLDS = [
    (0, 3, "Very low adherence — comprehensive nutrition program needed"),
    (4, 6, "Low adherence — nutrition intervention recommended"),
    (7, 9, "Moderate adherence — targeted improvements"),
    (10, 14, "High adherence — maintain current pattern"),
]

# In-memory stores for MVP (replace with database tables in production)
_sleep_diary_store: dict[str, list[dict[str, Any]]] = {}
_stress_assessment_store: dict[str, list[dict[str, Any]]] = {}
_exercise_log_store: dict[str, list[dict[str, Any]]] = {}
_wellness_assessment_store: dict[str, list[dict[str, Any]]] = {}
_wellness_protocol_store: dict[str, list[dict[str, Any]]] = {}
_wellness_session_store: dict[str, list[dict[str, Any]]] = {}
_wellness_wheel_store: dict[str, list[dict[str, Any]]] = {}
_patient_wellness_profile: dict[str, dict[str, Any]] = {}


# ═══════════════════════════════════════════════════════════════════════════════
# Patient Management
# ═══════════════════════════════════════════════════════════════════════════════


def get_wellness_patients(
    session: Session,
    clinic_id: str,
    query: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Get patients enrolled in wellness programs, scoped to clinic.

    In MVP, returns synthetic patients for the clinic. In production,
    query the patient_enrollment table filtered by clinic_id and
    wellness_program enrollment.
    """
    # In production: query database for patients with wellness enrollment
    # patients = session.query(Patient).filter(Patient.clinic_id == clinic_id).all()

    # Synthetic data for MVP
    demo_patients = [
        {
            "patient_id": "demo-pt-samantha-li",
            "patient_name": "Samantha Li",
            "age": 34,
            "gender": "F",
            "status": "active",
            "enrollment_date": "2025-01-01",
            "primary_protocol": "Stress Resilience Training",
            "clinic_id": clinic_id,
        },
        {
            "patient_id": "demo-pt-marcus-chen",
            "patient_name": "Marcus Chen",
            "age": 42,
            "gender": "M",
            "status": "active",
            "enrollment_date": "2024-12-15",
            "primary_protocol": "Sleep Restoration Program",
            "clinic_id": clinic_id,
        },
        {
            "patient_id": "demo-pt-elena-vasquez",
            "patient_name": "Elena Vasquez",
            "age": 29,
            "gender": "F",
            "status": "active",
            "enrollment_date": "2025-01-08",
            "primary_protocol": "Mood Boost Through Movement",
            "clinic_id": clinic_id,
        },
        {
            "patient_id": "demo-pt-omar-haddad",
            "patient_name": "Omar Haddad",
            "age": 55,
            "gender": "M",
            "status": "active",
            "enrollment_date": "2024-11-20",
            "primary_protocol": "Comprehensive Wellness Program",
            "clinic_id": clinic_id,
        },
        {
            "patient_id": "demo-pt-amelia-brown",
            "patient_name": "Amelia Brown",
            "age": 31,
            "gender": "F",
            "status": "active",
            "enrollment_date": "2025-01-03",
            "primary_protocol": "Mind-Body Integration",
            "clinic_id": clinic_id,
        },
    ]

    if query:
        q = query.lower()
        demo_patients = [p for p in demo_patients if q in p["patient_name"].lower() or q in p["patient_id"].lower()]

    if status:
        demo_patients = [p for p in demo_patients if p.get("status") == status]

    # Inject computed wellness KPIs
    for p in demo_patients:
        profile = _patient_wellness_profile.get(p["patient_id"], _generate_default_profile(p))
        p["sleep_score"] = profile.get("sleep_score", 70)
        p["hrv_trend"] = profile.get("hrv_trend", 48)
        p["stress_level"] = profile.get("stress_level", "moderate")
        p["activity_minutes"] = profile.get("activity_minutes", 120)
        p["mood_trend"] = profile.get("mood_trend", "stable")

    return demo_patients[offset : offset + limit]


def get_wellness_profile(session: Session, patient_id: str) -> dict[str, Any] | None:
    """Get comprehensive wellness profile for a patient."""
    if patient_id in _patient_wellness_profile:
        return _patient_wellness_profile[patient_id]

    # Generate default profile
    profile = _generate_default_profile({"patient_id": patient_id})
    _patient_wellness_profile[patient_id] = profile
    return profile


def _generate_default_profile(patient_stub: dict[str, Any]) -> dict[str, Any]:
    """Generate a default wellness profile from patient demographics."""
    pid = patient_stub.get("patient_id", "unknown")
    age = patient_stub.get("age", 40)

    # Age-adjusted defaults
    sleep_score = max(40, 85 - (age - 30) // 5 * 3 + hash(pid) % 20 - 10)
    hrv_trend = max(25, 60 - (age - 25) // 5 * 2 + hash(pid) % 20 - 10)

    # Map from known demo patients
    defaults = {
        "demo-pt-samantha-li": {"sleep_score": 72, "hrv_trend": 45, "stress_level": "moderate", "activity_minutes": 150, "mood_trend": "stable"},
        "demo-pt-marcus-chen": {"sleep_score": 58, "hrv_trend": 38, "stress_level": "high", "activity_minutes": 80, "mood_trend": "declining"},
        "demo-pt-elena-vasquez": {"sleep_score": 85, "hrv_trend": 62, "stress_level": "low", "activity_minutes": 210, "mood_trend": "improving"},
        "demo-pt-omar-haddad": {"sleep_score": 45, "hrv_trend": 32, "stress_level": "severe", "activity_minutes": 45, "mood_trend": "declining"},
        "demo-pt-amelia-brown": {"sleep_score": 78, "hrv_trend": 55, "stress_level": "moderate", "activity_minutes": 120, "mood_trend": "stable"},
    }
    base = defaults.get(pid, {
        "sleep_score": sleep_score,
        "hrv_trend": hrv_trend,
        "stress_level": "moderate",
        "activity_minutes": 100,
        "mood_trend": "stable",
    })

    return {
        "patient_id": pid,
        "patient_name": patient_stub.get("patient_name", "Unknown"),
        "age": age,
        "gender": patient_stub.get("gender", "U"),
        "sleep_score": base["sleep_score"],
        "hrv_trend": base["hrv_trend"],
        "stress_level": base["stress_level"],
        "activity_minutes": base["activity_minutes"],
        "mood_trend": base["mood_trend"],
        "last_assessment": None,
        "active_protocols": _wellness_protocol_store.get(pid, []),
        "alerts": _generate_alerts(base),
    }


def _generate_alerts(data: dict[str, Any]) -> list[str]:
    """Generate clinical alerts from wellness data."""
    alerts = []
    if data.get("sleep_score", 100) < 60:
        alerts.append("Poor sleep score — consider CBT-I referral")
    if data.get("hrv_trend", 100) < 40:
        alerts.append("Low HRV — stress/recovery concern, consider HRV biofeedback")
    if data.get("activity_minutes", 200) < 100:
        alerts.append("Sedentary — below WHO 150 min/week guideline")
    if data.get("stress_level", "low") in ("high", "severe"):
        alerts.append("Elevated perceived stress — stress resilience protocol recommended")
    return alerts


# ═══════════════════════════════════════════════════════════════════════════════
# Sleep Optimization
# ═══════════════════════════════════════════════════════════════════════════════


def submit_sleep_diary(
    session: Session,
    patient_id: str,
    entry: dict[str, Any],
) -> dict[str, Any]:
    """Submit a sleep diary entry and compute sleep efficiency.

    Args:
        session: SQLAlchemy session
        patient_id: Patient identifier
        entry: Dict with date, bedtime, wake_time, awakenings, quality, sleep_latency

    Returns:
        Dict with entry_id, computed sleep_efficiency, and interpretation
    """
    # Compute sleep efficiency
    bedtime = entry.get("bedtime", "23:00")
    wake_time = entry.get("wake_time", "07:00")
    awakenings = int(entry.get("awakenings", 0))
    sleep_latency = int(entry.get("sleep_latency", 15))

    time_in_bed = _compute_hours_between(bedtime, wake_time)
    awake_time = (awakenings * 10 / 60) + (sleep_latency / 60)  # Estimate awake
    total_sleep = max(0, time_in_bed - awake_time)
    efficiency = calculate_sleep_efficiency(time_in_bed, total_sleep)

    entry_record = {
        "id": f"sd-{uuid.uuid4().hex[:8]}",
        "patient_id": patient_id,
        "date": entry.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "bedtime": bedtime,
        "wake_time": wake_time,
        "awakenings": awakenings,
        "quality": int(entry.get("quality", 5)),
        "sleep_latency": sleep_latency,
        "duration_hours": round(total_sleep, 2),
        "efficiency": efficiency,
        "notes": entry.get("notes"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # Store
    if patient_id not in _sleep_diary_store:
        _sleep_diary_store[patient_id] = []
    _sleep_diary_store[patient_id].append(entry_record)

    # Update patient profile
    _update_sleep_score(patient_id)

    return {
        "id": entry_record["id"],
        "sleep_efficiency": efficiency,
        "efficiency_interpretation": _interpret_sleep_efficiency(efficiency),
        "time_in_bed_hours": round(time_in_bed, 2),
        "total_sleep_hours": round(total_sleep, 2),
        "patient_id": patient_id,
    }


def get_sleep_history(
    session: Session,
    patient_id: str,
    days: int = 30,
) -> list[dict[str, Any]]:
    """Get sleep diary history for a patient."""
    store = _sleep_diary_store.get(patient_id, [])
    if not store:
        # Return synthetic history for demo
        return _generate_synthetic_sleep_history(patient_id)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    return [e for e in store if e.get("date", "") >= cutoff]


def calculate_sleep_efficiency(time_in_bed: float, total_sleep: float) -> float:
    """Calculate sleep efficiency percentage.

    Sleep Efficiency = (Total Sleep Time / Time in Bed) × 100

    Args:
        time_in_bed: Total time spent in bed (hours)
        total_sleep: Actual sleep time (hours)

    Returns:
        Sleep efficiency as percentage (0-100)

    Reference:
        AASM Clinical Practice Guideline for Insomnia (2021)
    """
    if not time_in_bed or time_in_bed <= 0:
        return 0.0
    total_sleep = max(0, total_sleep)
    return min(100.0, round((total_sleep / time_in_bed) * 100, 1))


def _interpret_sleep_efficiency(efficiency: float) -> str:
    """Interpret sleep efficiency score clinically."""
    for lo, hi, interp in SLEEP_EFFICIENCY_THRESHOLDS:
        if lo <= efficiency <= hi:
            return interp
    return "Unknown"


def _compute_hours_between(start_time: str, end_time: str) -> float:
    """Compute hours between two HH:MM times, handling overnight."""
    try:
        sh, sm = map(int, start_time.split(":"))
        eh, em = map(int, end_time.split(":"))
        start_min = sh * 60 + sm
        end_min = eh * 60 + em
        if end_min < start_min:
            end_min += 24 * 60  # Overnight
        return (end_min - start_min) / 60
    except (ValueError, IndexError):
        return 8.0  # Default fallback


def _update_sleep_score(patient_id: str) -> None:
    """Update patient's sleep score from recent diary entries."""
    history = _sleep_diary_store.get(patient_id, [])
    if not history:
        return
    recent = history[-7:]  # Last 7 entries
    avg_eff = sum(e.get("efficiency", 0) for e in recent) / len(recent)
    avg_qual = sum(e.get("quality", 0) for e in recent) / len(recent)
    # Composite score: 50% efficiency + 50% quality normalized to 100
    score = int((avg_eff * 0.5) + (avg_qual * 10 * 0.5))
    if patient_id not in _patient_wellness_profile:
        _patient_wellness_profile[patient_id] = {"patient_id": patient_id}
    _patient_wellness_profile[patient_id]["sleep_score"] = min(100, max(0, score))


def _generate_synthetic_sleep_history(patient_id: str) -> list[dict[str, Any]]:
    """Generate synthetic sleep history for demo patients."""
    templates = {
        "demo-pt-marcus-chen": [
            {"date": "2025-01-08", "bedtime": "00:15", "wake_time": "06:30", "awakenings": 3, "quality": 4, "duration": 6.25, "efficiency": 68},
            {"date": "2025-01-07", "bedtime": "23:30", "wake_time": "07:00", "awakenings": 2, "quality": 6, "duration": 7.5, "efficiency": 78},
            {"date": "2025-01-06", "bedtime": "01:00", "wake_time": "07:00", "awakenings": 4, "quality": 3, "duration": 6.0, "efficiency": 55},
            {"date": "2025-01-05", "bedtime": "23:00", "wake_time": "07:00", "awakenings": 2, "quality": 7, "duration": 8.0, "efficiency": 85},
            {"date": "2025-01-04", "bedtime": "00:30", "wake_time": "06:30", "awakenings": 3, "quality": 4, "duration": 6.0, "efficiency": 62},
            {"date": "2025-01-03", "bedtime": "22:45", "wake_time": "07:15", "awakenings": 1, "quality": 8, "duration": 8.5, "efficiency": 88},
            {"date": "2025-01-02", "bedtime": "23:15", "wake_time": "07:00", "awakenings": 2, "quality": 5, "duration": 7.75, "efficiency": 72},
        ],
        "demo-pt-samantha-li": [
            {"date": "2025-01-08", "bedtime": "23:00", "wake_time": "07:00", "awakenings": 1, "quality": 7, "duration": 8.0, "efficiency": 85},
            {"date": "2025-01-07", "bedtime": "22:30", "wake_time": "06:30", "awakenings": 2, "quality": 7, "duration": 8.0, "efficiency": 82},
            {"date": "2025-01-06", "bedtime": "23:30", "wake_time": "07:30", "awakenings": 1, "quality": 6, "duration": 8.0, "efficiency": 80},
            {"date": "2025-01-05", "bedtime": "22:00", "wake_time": "06:45", "awakenings": 1, "quality": 8, "duration": 8.75, "efficiency": 90},
            {"date": "2025-01-04", "bedtime": "23:00", "wake_time": "07:00", "awakenings": 2, "quality": 6, "duration": 8.0, "efficiency": 78},
            {"date": "2025-01-03", "bedtime": "22:45", "wake_time": "07:00", "awakenings": 1, "quality": 7, "duration": 8.25, "efficiency": 86},
            {"date": "2025-01-02", "bedtime": "23:00", "wake_time": "07:00", "awakenings": 2, "quality": 6, "duration": 8.0, "efficiency": 80},
        ],
    }
    return [dict(e, patient_id=patient_id) for e in templates.get(patient_id, templates.get("demo-pt-samantha-li", []))]



# ═══════════════════════════════════════════════════════════════════════════════
# Stress & Resilience
# ═══════════════════════════════════════════════════════════════════════════════


def submit_stress_assessment(
    session: Session,
    patient_id: str,
    pss_scores: list[int],
    dass_stress_items: list[int] | None = None,
    dass_anxiety_items: list[int] | None = None,
    dass_depression_items: list[int] | None = None,
    hrv_rmssd: float | None = None,
    coherence: float | None = None,
    assessment_date: str | None = None,
) -> dict[str, Any]:
    """Submit a stress assessment with PSS-10 and optional DASS-21 scoring.

    Args:
        session: SQLAlchemy session
        patient_id: Patient identifier
        pss_scores: 10 PSS-10 item scores (0-4 each)
        dass_stress_items: 7 DASS-21 stress items
        dass_anxiety_items: 7 DASS-21 anxiety items
        dass_depression_items: 7 DASS-21 depression items
        hrv_rmssd: Optional HRV reading
        coherence: Optional coherence score
        assessment_date: Optional date string

    Returns:
        Dict with assessment_id, pss_score, pss_interpretation, dass_scores
    """
    # Score PSS-10
    pss_score = score_pss10(pss_scores)
    pss_interp = interpret_pss10(pss_score)

    # Score DASS-21 if provided
    dass_result = None
    dass_interp = None
    if dass_stress_items and dass_anxiety_items and dass_depression_items:
        dass_result = score_dass21(dass_stress_items, dass_anxiety_items, dass_depression_items)
        dass_interp = interpret_dass21(
            dass_result["stress"],
            dass_result["anxiety"],
            dass_result["depression"],
        )

    assessment_id = f"sa-{uuid.uuid4().hex[:8]}"
    record = {
        "id": assessment_id,
        "patient_id": patient_id,
        "date": assessment_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "pss_score": pss_score,
        "pss_interpretation": pss_interp,
        "dass_scores": dass_result,
        "dass_interpretation": dass_interp,
        "hrv_rmssd": hrv_rmssd,
        "coherence": coherence,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if patient_id not in _stress_assessment_store:
        _stress_assessment_store[patient_id] = []
    _stress_assessment_store[patient_id].append(record)

    # Update profile
    if patient_id not in _patient_wellness_profile:
        _patient_wellness_profile[patient_id] = {"patient_id": patient_id}

    _patient_wellness_profile[patient_id]["pss_score"] = pss_score
    if hrv_rmssd is not None:
        _patient_wellness_profile[patient_id]["hrv_trend"] = round(hrv_rmssd)

    # Update stress level from PSS
    if pss_score <= 13:
        _patient_wellness_profile[patient_id]["stress_level"] = "low"
    elif pss_score <= 26:
        _patient_wellness_profile[patient_id]["stress_level"] = "moderate"
    else:
        _patient_wellness_profile[patient_id]["stress_level"] = "high"

    return {
        "id": assessment_id,
        "pss_score": pss_score,
        "pss_interpretation": pss_interp,
        "dass_scores": dass_result,
        "dass_interpretation": dass_interp,
        "patient_id": patient_id,
    }


def get_stress_history(
    session: Session,
    patient_id: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Get stress assessment history for a patient."""
    store = _stress_assessment_store.get(patient_id, [])
    if not store:
        return _generate_synthetic_stress_history(patient_id)
    return sorted(store, key=lambda x: x.get("date", ""), reverse=True)[:limit]


def score_pss10(scores: list[int]) -> int:
    """Score the Perceived Stress Scale (PSS-10).

    Items 4, 5, 7, 8 (0-indexed: 3, 4, 6, 7) are reverse-scored.
    Total range: 0-40. Higher = more perceived stress.

    Reference:
        Cohen, S., Kamarck, T., & Mermelstein, R. (1983).
        A global measure of perceived stress. JHSB, 24(4), 385-396.
    """
    if not scores or len(scores) != 10:
        raise ValueError("PSS-10 requires exactly 10 scores")
    total = 0
    for i, s in enumerate(scores):
        score = max(0, min(4, int(s)))
        if i in PSS10_REVERSE_ITEMS:
            total += 4 - score
        else:
            total += score
    return total


def interpret_pss10(score: int) -> str:
    """Interpret PSS-10 score clinically."""
    for lo, hi, label in PSS10_SEVERITY:
        if lo <= score <= hi:
            return label
    return "Unknown"


def score_dass21(
    stress_items: list[int],
    anxiety_items: list[int],
    depression_items: list[int],
) -> dict[str, int]:
    """Score the DASS-21 subscales.

    Each subscale has 7 items. Scores are multiplied by 2.
    Total range per subscale: 0-42.

    Reference:
        Lovibond, P.F. & Lovibond, S.H. (1995).
        Manual for the Depression Anxiety Stress Scales. Psychology Foundation.
    """
    stress_sum = sum(max(0, min(3, int(s))) for s in (stress_items or []))
    anxiety_sum = sum(max(0, min(3, int(s))) for s in (anxiety_items or []))
    depression_sum = sum(max(0, min(3, int(s))) for s in (depression_items or []))

    return {
        "stress": stress_sum * 2,
        "anxiety": anxiety_sum * 2,
        "depression": depression_sum * 2,
    }


def interpret_dass21(stress: int, anxiety: int, depression: int) -> dict[str, str]:
    """Interpret DASS-21 subscale scores."""
    def _interp(val: int) -> str:
        for lo, hi, label in DASS_SEVERITY:
            if lo <= val <= hi:
                return label
        return "Unknown"

    return {
        "stress": _interp(stress),
        "anxiety": _interp(anxiety),
        "depression": _interp(depression),
    }


def _generate_synthetic_stress_history(patient_id: str) -> list[dict[str, Any]]:
    """Generate synthetic stress assessment history."""
    templates = {
        "demo-pt-marcus-chen": [
            {"date": "2025-01-08", "pss_score": 26, "dass_stress": 22, "dass_anxiety": 16, "dass_depression": 14, "hrv_rmssd": 35, "coherence": 52},
            {"date": "2025-01-01", "pss_score": 28, "dass_stress": 24, "dass_anxiety": 18, "dass_depression": 16, "hrv_rmssd": 32, "coherence": 48},
            {"date": "2024-12-25", "pss_score": 24, "dass_stress": 20, "dass_anxiety": 14, "dass_depression": 12, "hrv_rmssd": 38, "coherence": 55},
        ],
        "demo-pt-samantha-li": [
            {"date": "2025-01-08", "pss_score": 16, "dass_stress": 12, "dass_anxiety": 10, "dass_depression": 8, "hrv_rmssd": 48, "coherence": 72},
            {"date": "2025-01-01", "pss_score": 18, "dass_stress": 14, "dass_anxiety": 12, "dass_depression": 10, "hrv_rmssd": 45, "coherence": 68},
        ],
        "demo-pt-elena-vasquez": [
            {"date": "2025-01-08", "pss_score": 10, "dass_stress": 8, "dass_anxiety": 6, "dass_depression": 6, "hrv_rmssd": 58, "coherence": 80},
        ],
        "demo-pt-omar-haddad": [
            {"date": "2025-01-08", "pss_score": 30, "dass_stress": 26, "dass_anxiety": 20, "dass_depression": 18, "hrv_rmssd": 28, "coherence": 40},
        ],
    }
    return [dict(e, patient_id=patient_id) for e in templates.get(patient_id, [])]


# ═══════════════════════════════════════════════════════════════════════════════
# Exercise Prescription
# ═══════════════════════════════════════════════════════════════════════════════


def log_exercise(
    session: Session,
    patient_id: str,
    exercise_data: dict[str, Any],
) -> dict[str, Any]:
    """Log an exercise session for a patient.

    Args:
        session: SQLAlchemy session
        patient_id: Patient identifier
        exercise_data: Dict with date, type, duration, intensity, mood_before, mood_after, enjoyment

    Returns:
        Dict with entry_id and mood_delta
    """
    mood_before = exercise_data.get("mood_before")
    mood_after = exercise_data.get("mood_after")
    mood_delta = None
    if mood_before is not None and mood_after is not None:
        mood_delta = int(mood_after) - int(mood_before)

    entry_id = f"ex-{uuid.uuid4().hex[:8]}"
    record = {
        "id": entry_id,
        "patient_id": patient_id,
        "date": exercise_data.get("date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "type": exercise_data.get("type", "Walking"),
        "duration": int(exercise_data.get("duration", 30)),
        "intensity": exercise_data.get("intensity", "moderate"),
        "mood_before": mood_before,
        "mood_after": mood_after,
        "mood_delta": mood_delta,
        "enjoyment": exercise_data.get("enjoyment"),
        "notes": exercise_data.get("notes"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if patient_id not in _exercise_log_store:
        _exercise_log_store[patient_id] = []
    _exercise_log_store[patient_id].append(record)

    # Update activity minutes
    _update_activity_minutes(patient_id)

    return {
        "id": entry_id,
        "mood_delta": mood_delta,
        "patient_id": patient_id,
    }


def get_exercise_history(
    session: Session,
    patient_id: str,
    days: int = 30,
) -> list[dict[str, Any]]:
    """Get exercise history for a patient."""
    store = _exercise_log_store.get(patient_id, [])
    if not store:
        return _generate_synthetic_exercise_history(patient_id)

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    return [e for e in store if e.get("date", "") >= cutoff]


def _update_activity_minutes(patient_id: str) -> None:
    """Update patient's weekly activity minutes from recent exercise logs."""
    store = _exercise_log_store.get(patient_id, [])
    if not store:
        return
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    recent = [e for e in store if e.get("date", "") >= week_ago]
    total_min = sum(e.get("duration", 0) for e in recent)
    if patient_id not in _patient_wellness_profile:
        _patient_wellness_profile[patient_id] = {"patient_id": patient_id}
    _patient_wellness_profile[patient_id]["activity_minutes"] = total_min


def _generate_synthetic_exercise_history(patient_id: str) -> list[dict[str, Any]]:
    """Generate synthetic exercise history for demo patients."""
    templates = {
        "demo-pt-marcus-chen": [
            {"date": "2025-01-08", "type": "Walking", "duration": 20, "intensity": "light", "enjoyment": 5, "mood_before": 4, "mood_after": 5},
            {"date": "2025-01-06", "type": "Walking", "duration": 15, "intensity": "light", "enjoyment": 5, "mood_before": 4, "mood_after": 5},
            {"date": "2025-01-04", "type": "Strength", "duration": 30, "intensity": "moderate", "enjoyment": 6, "mood_before": 3, "mood_after": 6},
        ],
        "demo-pt-elena-vasquez": [
            {"date": "2025-01-08", "type": "Running", "duration": 45, "intensity": "vigorous", "enjoyment": 9, "mood_before": 6, "mood_after": 9},
            {"date": "2025-01-07", "type": "Yoga", "duration": 60, "intensity": "light", "enjoyment": 9, "mood_before": 5, "mood_after": 8},
            {"date": "2025-01-06", "type": "Cycling", "duration": 40, "intensity": "moderate", "enjoyment": 8, "mood_before": 6, "mood_after": 8},
            {"date": "2025-01-05", "type": "Strength", "duration": 50, "intensity": "vigorous", "enjoyment": 8, "mood_before": 5, "mood_after": 9},
        ],
        "demo-pt-samantha-li": [
            {"date": "2025-01-08", "type": "Walking", "duration": 30, "intensity": "moderate", "enjoyment": 7, "mood_before": 5, "mood_after": 7},
            {"date": "2025-01-07", "type": "Strength", "duration": 45, "intensity": "vigorous", "enjoyment": 8, "mood_before": 4, "mood_after": 8},
            {"date": "2025-01-06", "type": "Yoga", "duration": 60, "intensity": "light", "enjoyment": 9, "mood_before": 5, "mood_after": 8},
            {"date": "2025-01-05", "type": "Walking", "duration": 30, "intensity": "moderate", "enjoyment": 7, "mood_before": 5, "mood_after": 7},
        ],
    }
    return [dict(e, patient_id=patient_id) for e in templates.get(patient_id, [])]


def generate_fittv_recommendation(
    age: int | None,
    stress_level: str | None,
    sleep_score: int | None,
    conditions: list[str] | None = None,
) -> dict[str, Any]:
    """Generate a FITT-VP exercise recommendation based on patient profile.

    Uses ACSM 2022 Guidelines for Exercise Testing and Prescription.

    Args:
        age: Patient age
        stress_level: low/moderate/high/severe
        sleep_score: 0-100
        conditions: List of medical conditions

    Returns:
        Dict with frequency, intensity, time, type, volume, progression
    """
    conditions = conditions or []
    has_cv_risk = any(c in conditions for c in ["hypertension", "diabetes", "CVD", "obesity"])
    is_older = (age or 40) > 65

    # Frequency
    frequency = 5 if has_cv_risk else 4 if is_older else 5

    # Intensity
    if has_cv_risk or is_older:
        intensity = "50-60% HRmax (light-moderate)"
        intensity_rpe = "11-13 (Fairly light to somewhat hard)"
    elif stress_level in ("high", "severe"):
        intensity = "60-70% HRmax (moderate)"
        intensity_rpe = "12-14 (Somewhat hard)"
    else:
        intensity = "60-80% HRmax (moderate-vigorous)"
        intensity_rpe = "12-16 (Somewhat hard to hard)"

    # Time per session
    time_min = 20 if has_cv_risk else 30

    # Type
    if sleep_score and sleep_score < 60:
        exercise_type = "Morning aerobic (walking, cycling, swimming) + strength"
    elif stress_level in ("high", "severe"):
        exercise_type = "Aerobic + yoga/tai chi + social exercise"
    else:
        exercise_type = "Mixed: aerobic + resistance + flexibility"

    # Volume
    weekly_volume = time_min * frequency

    # Progression
    progression = "Gradual (10% rule)" if (has_cv_risk or is_older) else "Standard progressive overload"

    return {
        "frequency_days_per_week": frequency,
        "intensity_hrmax": intensity,
        "intensity_rpe": intensity_rpe,
        "time_per_session_minutes": time_min,
        "type": exercise_type,
        "weekly_volume_minutes": weekly_volume,
        "progression": progression,
        "strength_sessions": 2,
        "flexibility_sessions": 2,
        "evidence": "ACSM Guidelines for Exercise Testing and Prescription, 11th Ed. (2022)",
        "special_considerations": conditions if conditions else None,
    }



# ═══════════════════════════════════════════════════════════════════════════════
# Wellness Assessments
# ═══════════════════════════════════════════════════════════════════════════════


def submit_wellness_assessment(
    session: Session,
    patient_id: str,
    assessment_type: str,
    scores: dict[str, Any],
    assessment_date: str | None = None,
) -> dict[str, Any]:
    """Submit and score a wellness assessment.

    Supports: WHO-5, SF-12, PSS-10, MEQ, MDS (Mediterranean Diet),
    UCLA Loneliness, PROMIS, and CUSTOM assessments.

    Args:
        session: SQLAlchemy session
        patient_id: Patient identifier
        assessment_type: Type of assessment
        scores: Assessment-specific score dict
        assessment_date: Optional date override

    Returns:
        Dict with assessment_id, computed_scores, interpretation
    """
    assessment_type = assessment_type.upper().strip()
    date_str = assessment_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")

    computed = {}
    interpretation = ""

    if assessment_type == "WHO-5":
        raw_scores = scores.get("scores", scores.get("items", []))
        computed = score_who5(raw_scores)
        interpretation = interpret_who5(computed.get("percentage", 0))

    elif assessment_type == "SF-12":
        computed = score_sf12(scores)
        interpretation = interpret_sf12(computed)

    elif assessment_type == "PSS-10":
        pss_scores = scores.get("scores", scores.get("items", []))
        if isinstance(pss_scores, dict):
            pss_scores = [pss_scores.get(f"pss_{i}", 2) for i in range(10)]
        pss = score_pss10(pss_scores)
        computed = {"pss_score": pss, "max": 40}
        interpretation = interpret_pss10(pss)

    elif assessment_type in ("MEQ", "CHRONOTYPE"):
        meq_scores = scores.get("scores", scores.get("items", []))
        if isinstance(meq_scores, dict):
            meq_scores = [meq_scores.get(f"meq_{i}", 3) for i in range(19)]
        computed = score_meq(meq_scores)
        interpretation = f"{computed['chronotype']} (score: {computed['score']}/86)"

    elif assessment_type in ("MDS", "MEDITERRANEAN", "MEDITERRANEAN DIET"):
        items = scores.get("scores", scores.get("items", []))
        if isinstance(items, dict):
            items = [bool(items.get(f"mds_{i}", False)) for i in range(14)]
        computed = score_mediterranean_diet(items)
        interpretation = interpret_mediterranean_diet(computed["score"])

    elif assessment_type in ("UCLA", "UCLA LONELINESS"):
        items = scores.get("scores", scores.get("items", []))
        if isinstance(items, dict):
            items = [items.get(f"ucla_{i}", 3) for i in range(20)]
        computed = score_ucla_loneliness(items)
        interpretation = interpret_ucla_loneliness(computed["score"])

    elif assessment_type == "PROMIS":
        computed = score_promis(scores)
        interpretation = scores.get("interpretation", "PROMIS T-scores computed.")

    else:
        # Custom assessment — pass through
        computed = scores
        interpretation = scores.get("interpretation", "Custom assessment — no standard scoring available.")

    assessment_id = f"wa-{uuid.uuid4().hex[:8]}"
    record = {
        "id": assessment_id,
        "patient_id": patient_id,
        "type": assessment_type,
        "date": date_str,
        "computed_scores": computed,
        "interpretation": interpretation,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if patient_id not in _wellness_assessment_store:
        _wellness_assessment_store[patient_id] = []
    _wellness_assessment_store[patient_id].append(record)

    return {
        "id": assessment_id,
        "computed_scores": computed,
        "interpretation": interpretation,
        "patient_id": patient_id,
    }


def get_assessment_history(
    session: Session,
    patient_id: str,
    assessment_type: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Get wellness assessment history for a patient."""
    store = _wellness_assessment_store.get(patient_id, [])
    if not store:
        return _generate_synthetic_assessment_history(patient_id)

    items = sorted(store, key=lambda x: x.get("date", ""), reverse=True)
    if assessment_type:
        items = [i for i in items if i.get("type", "").upper() == assessment_type.upper()]
    return items[:limit]


# ─── WHO-5 Well-being Index ───────────────────────────────────────────────────


def score_who5(scores: list[Any]) -> dict[str, Any]:
    """Score the WHO-5 Well-being Index.

    5 items, each scored 0-5. Raw score 0-25.
    Percentage score = raw × 4 (0-100).

    Reference:
        Topp, C.W., et al. (2015). The WHO-5 Well-Being Index.
        Past and Future. Psychotherapy and Psychosomatics, 84(2), 132.
    """
    if not scores or len(scores) != 5:
        raise ValueError("WHO-5 requires exactly 5 scores (0-5 each)")
    raw = sum(max(0, min(5, int(s))) for s in scores)
    return {"raw": raw, "max_raw": 25, "percentage": raw * 4}


def interpret_who5(percentage: float) -> str:
    """Interpret WHO-5 percentage score."""
    for lo, hi, label in WHO5_THRESHOLDS:
        if lo <= percentage <= hi:
            return label
    return "Unknown"


# ─── SF-12 Health Survey ──────────────────────────────────────────────────────


def score_sf12(scores: dict[str, Any]) -> dict[str, float]:
    """Score SF-12 Physical Component Summary (PCS) and Mental Component Summary (MCS).

    Uses US population-based scoring (Ware et al., 1996).
    Mean = 50, SD = 10 for both PCS and MCS in US population.

    This is a simplified scoring. Production should use official
    SF-12 scoring algorithms with item weights.

    Reference:
        Ware, J., Kosinski, M., & Keller, S.D. (1996).
        A 12-Item Short-Form Health Survey. Medical Care, 34(3), 220-233.
    """
    gh = scores.get("general_health", scores.get("sf12_gh", 3))
    pf1 = scores.get("physical_functioning_1", scores.get("sf12_pf", 2))
    pf2 = scores.get("physical_functioning_2", scores.get("sf12_pf2", 2))
    rp = scores.get("role_physical", scores.get("sf12_rp", 1))
    bp = scores.get("bodily_pain", scores.get("sf12_bp", 3))
    mh = scores.get("mental_health", scores.get("sf12_mh", 3))
    vt = scores.get("vitality", scores.get("sf12_vt", 3))
    re = scores.get("role_emotional", scores.get("sf12_re", 1))
    sf = scores.get("social_functioning", scores.get("sf12_sf", 3))
    mh2 = scores.get("mental_health_2", scores.get("sf12_mh2", 3))

    # Simplified PCS calculation
    pcs = (
        (6 - int(gh)) * 3.5
        + int(pf1) * 2.1
        + int(pf2) * 1.8
        + (2 - int(rp)) * 3.2
        + (6 - int(bp)) * 2.5
        + int(vt) * 1.2
    ) + 20

    # Simplified MCS calculation
    mcs = (
        (6 - int(mh)) * 4.5
        + int(vt) * 1.5
        + (2 - int(re)) * 3.4
        + int(sf) * 2.1
        + (6 - int(mh2)) * 3.8
    ) + 20

    # Normalize to T-scores (mean 50, SD 10)
    pcs_t = min(70, max(10, 50 + (pcs - 50) * 0.8))
    mcs_t = min(70, max(10, 50 + (mcs - 50) * 0.8))

    return {"pcs": round(pcs_t, 1), "mcs": round(mcs_t, 1), "note": "Simplified scoring — use official algorithm for research"}


def interpret_sf12(scores: dict[str, float]) -> str:
    """Interpret SF-12 PCS and MCS scores."""
    pcs = scores.get("pcs", 50)
    mcs = scores.get("mcs", 50)
    parts = []
    if pcs < 40:
        parts.append("Physical health below population average.")
    elif pcs > 55:
        parts.append("Physical health above population average.")
    else:
        parts.append("Physical health near population average.")

    if mcs < 40:
        parts.append("Mental health below population average — consider follow-up.")
    elif mcs > 55:
        parts.append("Mental health above population average.")
    else:
        parts.append("Mental health near population average.")

    return " ".join(parts)


# ─── MEQ Chronotype ───────────────────────────────────────────────────────────


def score_meq(scores: list[Any]) -> dict[str, Any]:
    """Score the Morningness-Eveningness Questionnaire (MEQ).

    19 items, total score range 16-86.

    Reference:
        Horne, J.A. & Ostberg, O. (1976). A self-assessment questionnaire
        to determine morningness-eveningness in human circadian rhythms.
        Int J Chronobiology, 4(2), 97-110.
    """
    if not scores:
        scores = [3] * 19
    total = sum(int(s) for s in scores if s is not None)
    for lo, hi, chronotype in MEQ_CHRONOTYPES:
        if lo <= total <= hi:
            return {"score": total, "chronotype": chronotype, "max": 86}
    return {"score": total, "chronotype": "Intermediate", "max": 86}


# ─── Mediterranean Diet Score ─────────────────────────────────────────────────


def score_mediterranean_diet(items: list[Any]) -> dict[str, Any]:
    """Score Mediterranean Diet adherence (14-point PREDIMED screener).

    Reference:
        Martinez-Gonzalez, M.A., et al. (2012). A 14-item Mediterranean
        diet assessment tool. PLoS ONE, 7(8), e43134.
    """
    checked = sum(1 for item in items if item)
    return {"score": checked, "max": 14}


def interpret_mediterranean_diet(score: int) -> str:
    """Interpret Mediterranean Diet Score."""
    for lo, hi, label in MDS_THRESHOLDS:
        if lo <= score <= hi:
            return label
    return "Unknown"


# ─── UCLA Loneliness Scale ────────────────────────────────────────────────────


def score_ucla_loneliness(scores: list[Any]) -> dict[str, Any]:
    """Score the UCLA Loneliness Scale (Version 3).

    20 items, each 1-4. Total range 20-80.
    Higher = more lonely.

    Reference:
        Russell, D.W. (1996). UCLA Loneliness Scale (Version 3):
        Reliability, validity, and factor structure. J Pers Assess, 66(1), 20-40.
    """
    if not scores or len(scores) < 10:
        scores = scores + [3] * (20 - len(scores)) if scores else [3] * 20
    total = sum(max(1, min(4, int(s))) for s in scores)
    return {"score": total, "max": 80}


def interpret_ucla_loneliness(score: int) -> str:
    """Interpret UCLA Loneliness Scale score."""
    for lo, hi, label in UCLA_THRESHOLDS:
        if lo <= score <= hi:
            return label
    return "Unknown"


# ─── PROMIS Scoring ───────────────────────────────────────────────────────────


def score_promis(scores: dict[str, Any]) -> dict[str, Any]:
    """Score PROMIS measures (simplified T-score computation).

    PROMIS uses IRT-based scoring calibrated to the US general population.
    T-scores have mean = 50, SD = 10.

    Reference:
        Cella, D., et al. (2010). The Patient-Reported Outcomes Measurement
        Information System (PROMIS). Medical Care, 48(9 Suppl), S1-S2.
    """
    result = {}
    for domain, items in scores.items():
        if domain in ("scores", "items", "interpretation"):
            continue
        if isinstance(items, list):
            avg = sum(int(i) for i in items if i is not None) / max(len(items), 1)
            # Convert to approximate T-score (simplified)
            t_score = 50 + (avg - 2.5) * 8
            result[domain] = {"raw_mean": round(avg, 2), "t_score": round(t_score, 1)}
        elif isinstance(items, dict):
            result[domain] = items
    return result


def _generate_synthetic_assessment_history(patient_id: str) -> list[dict[str, Any]]:
    """Generate synthetic assessment history for demo patients."""
    templates = {
        "demo-pt-marcus-chen": [
            {"date": "2025-01-08", "type": "WHO-5", "computed_scores": {"raw": 12, "percentage": 48}, "interpretation": "Below average well-being"},
            {"date": "2025-01-08", "type": "SF-12", "computed_scores": {"pcs": 44.2, "mcs": 38.5}, "interpretation": "Physical below avg. Mental health below avg."},
            {"date": "2025-01-01", "type": "PSS-10", "computed_scores": {"pss_score": 26, "max": 40}, "interpretation": "Moderate stress"},
            {"date": "2024-12-20", "type": "MEQ", "computed_scores": {"score": 38, "chronotype": "Moderate Evening (Owl)", "max": 86}, "interpretation": "Moderate Evening"},
        ],
        "demo-pt-elena-vasquez": [
            {"date": "2025-01-08", "type": "WHO-5", "computed_scores": {"raw": 18, "percentage": 72}, "interpretation": "Good well-being"},
            {"date": "2025-01-01", "type": "PSS-10", "computed_scores": {"pss_score": 10, "max": 40}, "interpretation": "Low stress"},
            {"date": "2024-12-20", "type": "MEQ", "computed_scores": {"score": 62, "chronotype": "Moderate Morning", "max": 86}, "interpretation": "Moderate Morning"},
        ],
    }
    return [dict(e, patient_id=patient_id) for e in templates.get(patient_id, [])]



# ═══════════════════════════════════════════════════════════════════════════════
# Protocol Builder
# ═══════════════════════════════════════════════════════════════════════════════


# 10 evidence-based wellness protocol templates
WELLNESS_PROTOCOL_TEMPLATES = [
    {
        "id": "sleep-restoration",
        "name": "Sleep Restoration Program",
        "template": "Sleep restoration (4-week CBT-I based)",
        "duration_weeks": 4,
        "category": "sleep",
        "evidence_grade": "A",
        "evidence_source": "AASM Clinical Practice Guideline for Insomnia, 2021; Morin et al., 2006",
        "description": "Structured CBT-I protocol combining stimulus control, sleep restriction, cognitive restructuring, and sleep hygiene education.",
        "inclusion_criteria": [
            "Chronic insomnia (>3 months)",
            "Sleep efficiency <85%",
            "ISI score >7",
        ],
        "exclusion_criteria": [
            "Untreated sleep apnea",
            "Bipolar disorder (mania risk with sleep restriction)",
            "Active substance abuse",
        ],
        "phases": [
            {
                "week": "1",
                "focus": "Sleep diary + assessment; stimulus control education; sleep hygiene review",
                "tasks": [
                    "Complete sleep diary daily (bedtime, wake time, awakenings, quality)",
                    "Implement stimulus control (bed = sleep only)",
                    "Complete sleep hygiene checklist (12 items)",
                    "Establish fixed wake time",
                ],
                "outcomes": ["Sleep diary completed 7/7 days", "Stimulus control adherence >80%"],
            },
            {
                "week": "2",
                "focus": "Sleep restriction therapy initiation; sleep efficiency optimization",
                "tasks": [
                    "Set prescribed sleep window (TIB = average TST, min 5h)",
                    "No naps during restriction phase",
                    "Wind-down routine established",
                    "Monitor daytime sleepiness (Epworth)",
                ],
                "outcomes": ["Sleep efficiency >80%", "No safety incidents"],
            },
            {
                "week": "3",
                "focus": "Cognitive restructuring; rumination management; relaxation training",
                "tasks": [
                    "Thought records for catastrophic sleep thoughts",
                    "Progressive muscle relaxation (PMR) daily",
                    "Worry time scheduling (before bed)",
                    "Paradoxical intention technique",
                ],
                "outcomes": ["Reduction in sleep effort/anxiety", "Sleep efficiency >85%"],
            },
            {
                "week": "4",
                "focus": "Relapse prevention; schedule adjustment; tapering support",
                "tasks": [
                    "Relapse prevention plan written",
                    "Gradual TIB expansion (+15 min when SE >85%)",
                    "Self-efficacy building",
                    "Long-term maintenance schedule",
                ],
                "outcomes": ["Sleep efficiency >85% sustained", "ISI <8", "Self-management plan in place"],
            },
        ],
        "outcome_measures": [
            {"name": "Sleep Efficiency", "target": ">85%", "timeframe": "Week 4"},
            {"name": "Insomnia Severity Index (ISI)", "target": "<8", "timeframe": "Week 4"},
            {"name": "Pittsburgh Sleep Quality Index (PSQI)", "target": "<5", "timeframe": "Week 4"},
        ],
    },
    {
        "id": "stress-resilience",
        "name": "Stress Resilience Training",
        "template": "Stress resilience (6-week HRV + mindfulness)",
        "duration_weeks": 6,
        "category": "stress",
        "evidence_grade": "B",
        "evidence_source": "Lehrer et al., 2003; Goyal et al., 2014 (JAMA IM)",
        "description": "HRV biofeedback training combined with mindfulness-based stress reduction techniques for physiological regulation.",
        "inclusion_criteria": [
            "PSS-10 score >14",
            "HRV RMSSD <50ms",
            "Willing to practice daily",
        ],
        "exclusion_criteria": [
            "Severe cardiovascular disease (without clearance)",
            "Active psychosis",
        ],
        "phases": [
            {
                "week": "1-2",
                "focus": "HRV baseline; breath awareness; diaphragmatic breathing",
                "tasks": [
                    "Daily HRV measurement (morning, supine)",
                    "10 min breath awareness meditation",
                    "Diaphragmatic breathing practice",
                    "HRV tracking log",
                ],
                "outcomes": ["Baseline HRV established", "Breathing technique mastered"],
            },
            {
                "week": "3-4",
                "focus": "HRV coherence training; body scan meditation; box breathing",
                "tasks": [
                    "Coherence training 15 min daily (resonant frequency)",
                    "Body scan meditation 20 min",
                    "Box breathing 3x daily (4-4-4-4)",
                    "Stress journal",
                ],
                "outcomes": ["Coherence score >70%", "PSS-10 reduction >10%"],
            },
            {
                "week": "5-6",
                "focus": "Resonant breathing; autogenic training; integration",
                "tasks": [
                    "Resonant breathing 20 min (5.5 breaths/min)",
                    "Autogenic training sequence",
                    "Stress inoculation practice",
                    "Real-world application exercises",
                ],
                "outcomes": ["HRV RMSSD increase >10%", "PSS-10 <14", "Coherence >75%"],
            },
        ],
        "outcome_measures": [
            {"name": "HRV RMSSD", "target": "Increase >10%", "timeframe": "Week 6"},
            {"name": "PSS-10", "target": "<14 or 20% reduction", "timeframe": "Week 6"},
            {"name": "Coherence Score", "target": ">75%", "timeframe": "Week 6"},
        ],
    },
    {
        "id": "mood-movement",
        "name": "Mood Boost Through Movement",
        "template": "Mood boost through movement (8-week exercise)",
        "duration_weeks": 8,
        "category": "exercise",
        "evidence_grade": "A",
        "evidence_source": "Blumenthal et al., 2007; Schuch et al., 2018 (JAMA Psychiatry)",
        "description": "Structured exercise program leveraging exercise-induced mood enhancement and neuroplasticity.",
        "inclusion_criteria": [
            "PHQ-9 >5 or self-reported low mood",
            "Medically cleared for exercise",
        ],
        "exclusion_criteria": [
            "Unstable cardiovascular condition",
            "Severe orthopedic limitation",
        ],
        "phases": [
            {
                "week": "1-2",
                "focus": "Assessment; enjoyable activity identification; baseline FITT-VP",
                "tasks": [
                    "Physical readiness questionnaire (PAR-Q+)",
                    "Activity preference survey",
                    "Baseline mood scores (PHQ-9, GAD-7)",
                    "First enjoyable activity session",
                ],
                "outcomes": ["PAR-Q+ cleared", "Preferred activity identified", "Baseline mood recorded"],
            },
            {
                "week": "3-4",
                "focus": "Aerobic base building; mood-exercise correlation tracking",
                "tasks": [
                    "3x30 min moderate aerobic activity",
                    "Mood pre/post exercise tracking",
                    "Step count goal (6,000-8,000/day)",
                    "Social exercise opportunity",
                ],
                "outcomes": [">=3 sessions/week completed", "Mood improvement post-exercise"],
            },
            {
                "week": "5-6",
                "focus": "Strength integration; outdoor/green exercise sessions",
                "tasks": [
                    "2x strength training sessions/week",
                    "1x outdoor activity (green exercise)",
                    "Mindful movement practice",
                    "Exercise buddy pairing",
                ],
                "outcomes": [">=4 sessions/week", "PHQ-9 reduction >3 points"],
            },
            {
                "week": "7-8",
                "focus": "Habit consolidation; long-term planning; relapse prevention",
                "tasks": [
                    "Self-directed exercise program design",
                    "Barrier planning worksheet",
                    "Goal reset for maintenance",
                    "Community resource connection",
                ],
                "outcomes": ["Self-directed program active", "PHQ-9 <5", ">=150 min/week sustained"],
            },
        ],
        "outcome_measures": [
            {"name": "PHQ-9", "target": "Reduction >5 points", "timeframe": "Week 8"},
            {"name": "Weekly Activity", "target": ">=150 min moderate", "timeframe": "Week 8"},
            {"name": "Mood Delta", "target": ">1.5 point improvement", "timeframe": "Ongoing"},
        ],
    },
    {
        "id": "nutrition-reset",
        "name": "Nutrition Reset Program",
        "template": "Nutrition reset (6-week Mediterranean)",
        "duration_weeks": 6,
        "category": "nutrition",
        "evidence_grade": "A",
        "evidence_source": "Estruch et al., 2013 (PREDIMED); Sofi et al., 2014 meta-analysis",
        "description": "Mediterranean diet adoption with structured meal planning, cooking skills, and behavioral nutrition strategies.",
        "inclusion_criteria": ["MDS <10", "Interest in dietary change"],
        "exclusion_criteria": ["Active eating disorder", "Food insecurity"],
        "phases": [
            {
                "week": "1",
                "focus": "Diet quality assessment; Mediterranean diet education; pantry reset",
                "tasks": [
                    "Mediterranean Diet Score (14-item PREDIMED)",
                    "Pantry audit and restocking",
                    "Shopping list creation",
                    "Cooking oil transition to EVOO",
                ],
                "outcomes": ["MDS baseline recorded", "Pantry stocked with Mediterranean foods"],
            },
            {
                "week": "2-3",
                "focus": "Olive oil transition; increased plant foods; fish introduction",
                "tasks": [
                    "4 tbsp extra virgin olive oil daily",
                    "5+ servings fruits/vegetables daily",
                    "2+ servings fish/week",
                    "Nut snack (walnuts/almonds) daily",
                ],
                "outcomes": ["MDS increase >=2 points", "Fish consumption >=2x/week"],
            },
            {
                "week": "4-5",
                "focus": "Red meat reduction; legume increase; cooking workshops",
                "tasks": [
                    "Red meat <1 serving/week",
                    "3+ servings legumes/week",
                    "Mediterranean recipe practice (2 new recipes)",
                    "Sofrito preparation",
                ],
                "outcomes": ["Red meat reduced", "Legumes >=3x/week", "MDS >=7"],
            },
            {
                "week": "6",
                "focus": "Sustainability planning; social eating; long-term adherence",
                "tasks": [
                    "Weekly meal prep routine",
                    "Social Mediterranean meal hosting",
                    "Self-monitoring plan",
                    "Barrier management strategies",
                ],
                "outcomes": ["MDS increase >=3 points", "Self-sustaining meal plan", "Follow-up MDS >=8"],
            },
        ],
        "outcome_measures": [
            {"name": "Mediterranean Diet Score", "target": "Increase >=3 points", "timeframe": "Week 6"},
            {"name": "Weight", "target": "Stable or reduced 2-3%", "timeframe": "Week 6"},
            {"name": "Lipid Panel", "target": "LDL reduction >5%", "timeframe": "12 weeks"},
        ],
    },
    {
        "id": "circadian-reset",
        "name": "Circadian Reset Protocol",
        "template": "Circadian reset (3-week chronotherapy)",
        "duration_weeks": 3,
        "category": "sleep",
        "evidence_grade": "B",
        "evidence_source": "Lack et al., 2008; Terman & Terman, 2005",
        "description": "Chronotype-optimized light therapy and behavioral scheduling to reset circadian phase.",
        "inclusion_criteria": ["MEQ <42 (evening type)", "Social jetlag >2h", "Delayed sleep phase"],
        "exclusion_criteria": ["Bipolar disorder", "Retinal disease", "Photosensitive epilepsy"],
        "phases": [
            {
                "week": "1",
                "focus": "MEQ assessment; light exposure audit; chronotype classification",
                "tasks": [
                    "MEQ completion and scoring",
                    "7-day light exposure diary",
                    "Baseline DLMO (if available via melatonin assay)",
                    "Actigraphy baseline",
                ],
                "outcomes": ["Chronotype classified", "Light exposure pattern documented"],
            },
            {
                "week": "2",
                "focus": "Bright light therapy; melatonin timing; schedule shift",
                "tasks": [
                    "10,000 lux bright light box × 30 min within 30 min of waking",
                    "Dim light in evening (<50 lux after 8 PM)",
                    "Bedtime/wake time shift 30 min earlier",
                    "Blue light blocking glasses evening",
                ],
                "outcomes": ["Sleep onset 30+ min earlier", "Morning alertness improved"],
            },
            {
                "week": "3",
                "focus": "Consolidation; social jetlag reduction; long-term plan",
                "tasks": [
                    "Weekend schedule consistency (+/- 30 min)",
                    "Work schedule negotiation (if applicable)",
                    "Travel protocol (east/west)",
                    "Maintenance light therapy schedule",
                ],
                "outcomes": ["MEQ shift >=5 points", "Social jetlag <1h", "Sustained earlier phase"],
            },
        ],
        "outcome_measures": [
            {"name": "MEQ Score", "target": "Shift >=5 points", "timeframe": "Week 3"},
            {"name": "DLMO", "target": "Shift >=30 min earlier", "timeframe": "Week 3"},
            {"name": "Subjective Energy", "target": "Morning energy improved", "timeframe": "Week 3"},
        ],
    },
    {
        "id": "social-connection",
        "name": "Social Connection Program",
        "template": "Social connection (8-week social prescribing)",
        "duration_weeks": 8,
        "category": "social",
        "evidence_grade": "B",
        "evidence_source": "Masi et al., 2011 meta-analysis; Holt-Lunstad et al., 2015",
        "description": "Social prescribing model linking patients to community resources, group activities, and structured social engagement.",
        "inclusion_criteria": ["UCLA Loneliness Scale >=35", "Interest in social activities"],
        "exclusion_criteria": ["Severe social anxiety (untreated)", "Active psychosis"],
        "phases": [
            {
                "week": "1-2",
                "focus": "UCLA Loneliness Scale; social network mapping; interest inventory",
                "tasks": [
                    "UCLA v3 assessment",
                    "Social network diagram (concentric circles)",
                    "Community resource directory review",
                    "Interest and values exploration",
                ],
                "outcomes": ["Loneliness baseline recorded", "Social needs identified"],
            },
            {
                "week": "3-4",
                "focus": "Group activity engagement; volunteer opportunity; skill-sharing",
                "tasks": [
                    "Attend 1 group activity (book club, walking group, class)",
                    "Volunteer 1x at local organization",
                    "Skill class enrollment (cooking, art, music)",
                    "Peer buddy assignment",
                ],
                "outcomes": [">=2 social activities completed", "Volunteer experience logged"],
            },
            {
                "week": "5-6",
                "focus": "Relationship deepening; peer support; communication skills",
                "tasks": [
                    "Weekly social contact (in-person or video)",
                    "Peer support session attendance",
                    "Communication skills workshop",
                    "Shared meal with friend/family",
                ],
                "outcomes": ["Social contacts/week increased", "Communication skills improved"],
            },
            {
                "week": "7-8",
                "focus": "Sustainability; social roles; ongoing community integration",
                "tasks": [
                    "Mentor/mentee role establishment",
                    "Regular activity commitment (>=2x/week)",
                    "Community belonging plan",
                    "Relapse prevention for isolation",
                ],
                "outcomes": ["UCLA reduction >=10 points", ">=3 regular social activities", "Community role identified"],
            },
        ],
        "outcome_measures": [
            {"name": "UCLA Loneliness Scale", "target": "Reduction >=10 points", "timeframe": "Week 8"},
            {"name": "Social Contacts/Week", "target": "Increase >=3", "timeframe": "Week 8"},
            {"name": "Community Belonging Scale", "target": "Score >=4/5", "timeframe": "Week 8"},
        ],
    },
    {
        "id": "mind-body",
        "name": "Mind-Body Integration Program",
        "template": "Mind-body integration (6-week yoga + meditation)",
        "duration_weeks": 6,
        "category": "stress",
        "evidence_grade": "B",
        "evidence_source": "Cramer et al., 2014 meta-analysis; Streeter et al., 2010",
        "description": "Yoga-based movement combined with seated meditation for autonomic regulation and interoceptive awareness.",
        "inclusion_criteria": ["Elevated stress or anxiety", "Physical capability for yoga", "Interest in mind-body approaches"],
        "exclusion_criteria": ["Unstable spinal condition", "Uncontrolled hypertension", "Recent surgery"],
        "phases": [
            {
                "week": "1-2",
                "focus": "Gentle yoga foundations; breath-movement coordination; body awareness",
                "tasks": [
                    "3x yoga sessions/week (30 min, Hatha or restorative)",
                    "Daily 5 min breath focus meditation",
                    "Body scan practice (10 min)",
                    "Yoga journal",
                ],
                "outcomes": ["Yoga practice established", "Breath awareness baseline"],
            },
            {
                "week": "3-4",
                "focus": "Intermediate sequences; meditation extension; pranayama",
                "tasks": [
                    "4x yoga sessions/week (45 min, Vinyasa or Iyengar)",
                    "Daily 15 min mindfulness meditation",
                    "Alternate nostril breathing (Nadi Shodhana)",
                    "Yoga nidra introduction",
                ],
                "outcomes": ["Flexibility improved", "Meditation comfort 15+ min"],
            },
            {
                "week": "5-6",
                "focus": "Advanced integration; self-practice; yoga nidra",
                "tasks": [
                    "Self-directed home practice (4-5x/week)",
                    "Yoga nidra 2x/week (guided deep relaxation)",
                    "Teaching readiness (optional: lead 1 pose)",
                    "Integration into daily routine",
                ],
                "outcomes": ["PSS-10 reduction >15%", "HRV improvement", "Self-practice sustainable"],
            },
        ],
        "outcome_measures": [
            {"name": "PSS-10", "target": "Reduction >=15%", "timeframe": "Week 6"},
            {"name": "Flexibility (sit-reach)", "target": "Improvement >=2 cm", "timeframe": "Week 6"},
            {"name": "Interoceptive Awareness", "target": "MAIA increase", "timeframe": "Week 6"},
        ],
    },
    {
        "id": "nature-immersion",
        "name": "Nature Immersion Program",
        "template": "Nature immersion (4-week green exercise)",
        "duration_weeks": 4,
        "category": "exercise",
        "evidence_grade": "B",
        "evidence_source": "Berman et al., 2012; White et al., 2019 (Sci Rep); Roe & Aspinall, 2011",
        "description": "Structured outdoor nature exposure combining walking, mindfulness, and ecological engagement.",
        "inclusion_criteria": ["Access to green space", "No severe mobility limitation"],
        "exclusion_criteria": ["Severe pollen allergy (untreated)", "Extreme weather risk"],
        "phases": [
            {
                "week": "1",
                "focus": "Nature accessibility audit; baseline mood/outdoor time; first guided walk",
                "tasks": [
                    "Map accessible green spaces within 30 min",
                    "Baseline mood and rumination measures",
                    "1x guided 45-min nature walk",
                    "Nature journaling introduction",
                ],
                "outcomes": ["Green space map completed", "Baseline measures recorded"],
            },
            {
                "week": "2",
                "focus": "Independent walks; nature journaling; biophilic activities",
                "tasks": [
                    "3x 30-min outdoor walks in varied settings",
                    "Nature journal entries (3+)",
                    "Plant/animal identification activity",
                    "Mindful walking practice",
                ],
                "outcomes": [">=3 nature sessions", "Rumination score reduced"],
            },
            {
                "week": "3",
                "focus": "Green exercise (vigorous); forest bathing; social nature activity",
                "tasks": [
                    "1x vigorous outdoor activity (hiking, cycling, running)",
                    "Shinrin-yoku (forest bathing) session 2+ hours",
                    "Group outdoor activity with friend/family",
                    "Nature photography practice",
                ],
                "outcomes": ["Forest bathing completed", "Social nature activity done"],
            },
            {
                "week": "4",
                "focus": "Integration; year-round plan; nature advocacy",
                "tasks": [
                    "Monthly outdoor activity calendar created",
                    "Nature advocacy action (community garden, conservation)",
                    "Long-term goal setting (120 min/week nature)",
                    "Nature connection assessment",
                ],
                "outcomes": ["Monthly calendar set", "Nature connectedness improved", "120 min/week commitment"],
            },
        ],
        "outcome_measures": [
            {"name": "Nature Connectedness Scale", "target": "Increase >=2 points", "timeframe": "Week 4"},
            {"name": "Rumination", "target": "RRS reduction >10%", "timeframe": "Week 4"},
            {"name": "Cortisol Awakening Response", "target": "Improved CAR slope", "timeframe": "Week 4"},
        ],
    },
    {
        "id": "digital-wellness",
        "name": "Digital Wellness Program",
        "template": "Digital wellness (4-week screen-time + mindfulness)",
        "duration_weeks": 4,
        "category": "stress",
        "evidence_grade": "C",
        "evidence_source": "Twenge et al., 2018; Odgers & Jensen, 2020",
        "description": "Screen-time reduction paired with mindfulness training to address digital distraction and cognitive overload.",
        "inclusion_criteria": ["Screen time >4h/day recreational", "Self-reported digital distraction", "Interest in mindfulness"],
        "exclusion_criteria": ["Work requires constant connectivity (without flexibility)"],
        "phases": [
            {
                "week": "1",
                "focus": "Screen-time audit; baseline scales; notification audit",
                "tasks": [
                    "7-day screen-time tracking (iOS Screen Time or Android Digital Wellbeing)",
                    "MAAS (Mindful Attention Awareness Scale)",
                    "Notification audit (count per day)",
                    "App usage inventory",
                ],
                "outcomes": ["Baseline screen-time documented", "Problematic apps identified"],
            },
            {
                "week": "2",
                "focus": "Digital declutter; phone-free periods; bedtime device removal",
                "tasks": [
                    "Remove non-essential apps",
                    "Phone-free meals (all meals)",
                    "Charging station outside bedroom",
                    "Grayscale mode on phone",
                ],
                "outcomes": ["Screen-time reduced >=15%", "Phone-free meals >=5 days"],
            },
            {
                "week": "3",
                "focus": "Mindful tech use; single-tasking; deep work blocks",
                "tasks": [
                    "Intentional app opening (3-breath pause)",
                    "Pomodoro technique (25/5 or 50/10)",
                    "Deep work blocks (90 min, no notifications)",
                    "Mindful scrolling practice",
                ],
                "outcomes": ["Screen-time reduced >=25%", "Deep work >=1 block/day"],
            },
            {
                "week": "4",
                "focus": "Digital Sabbath; sustainable boundaries; ongoing monitoring",
                "tasks": [
                    "1 day/week digital Sabbath (no recreational screens)",
                    "Ongoing screen-time goals (<3h/day recreational)",
                    "Accountability partner arrangement",
                    "Relapse prevention plan",
                ],
                "outcomes": ["Screen-time reduced >=30%", "Digital Sabbath practiced", "Sustainable boundaries set"],
            },
        ],
        "outcome_measures": [
            {"name": "Screen Time", "target": "Reduction >=30%", "timeframe": "Week 4"},
            {"name": "MAAS", "target": "Increase >=10%", "timeframe": "Week 4"},
            {"name": "PSQI", "target": "Improvement >=2 points", "timeframe": "Week 4"},
        ],
    },
    {
        "id": "comprehensive-wellness",
        "name": "Comprehensive Wellness Program",
        "template": "Comprehensive wellness (12-week multi-domain)",
        "duration_weeks": 12,
        "category": "multi",
        "evidence_grade": "B",
        "evidence_source": "Prochaska & DiClemente TTM; Rollnick & Miller MI; Integrative Medicine model",
        "description": "Integrated multi-domain wellness addressing sleep, stress, exercise, nutrition, social connection, and purpose.",
        "inclusion_criteria": [
            "Multiple wellness domains below target",
            "Commitment to 12-week program",
            "Primary care clearance",
        ],
        "exclusion_criteria": ["Active crisis requiring immediate intervention"],
        "phases": [
            {
                "week": "1-2",
                "focus": "Comprehensive assessment; goal setting; priority domain selection",
                "tasks": [
                    "Wellness wheel assessment (6 domains)",
                    "All baseline measures (WHO-5, PSS-10, MEQ, MDS, UCLA)",
                    "Priority domain ranking with patient",
                    "Values clarification exercise",
                    "Motivational interviewing session",
                ],
                "outcomes": ["Wellness wheel completed", "Priority domains identified", "Goals set (SMART)"],
            },
            {
                "week": "3-4",
                "focus": "Foundation building; habit stacking; quick wins",
                "tasks": [
                    "Sleep hygiene optimization",
                    "Daily movement (walking baseline)",
                    "Morning wellness routine (30 min)",
                    "Hydration and nutrition basics",
                ],
                "outcomes": ["Sleep efficiency >80%", "Daily movement established", "Morning routine consistent"],
            },
            {
                "week": "5-8",
                "focus": "Intensive intervention in priority domains; skill building",
                "tasks": [
                    "CBT-I if sleep priority (weeks 5-8)",
                    "HRV training if stress priority (weeks 5-8)",
                    "FITT-VP program if exercise priority (weeks 5-8)",
                    "Mediterranean transition if nutrition priority",
                    "Social prescribing if connection priority",
                ],
                "outcomes": ["Priority domain score improvement >=20%", "Skills learned and practiced"],
            },
            {
                "week": "9-10",
                "focus": "Secondary domains; integration; lifestyle design",
                "tasks": [
                    "Address secondary wellness domains",
                    "Integration of multiple practices",
                    "Environmental design (home, work)",
                    "Social support network strengthening",
                    "Purpose exploration (values, meaning, legacy)",
                ],
                "outcomes": ["All domains improving", "Integrated routine established"],
            },
            {
                "week": "11-12",
                "focus": "Consolidation; self-efficacy; long-term wellness plan",
                "tasks": [
                    "Self-directed wellness program design",
                    "Relapse prevention planning (all domains)",
                    "Annual wellness calendar creation",
                    "Progress celebration and reflection",
                    "Maintenance schedule (booster sessions)",
                ],
                "outcomes": [
                    "Wellness wheel all domains >=70%",
                    "WHO-5 >=60",
                    "Sustained behavior change plan",
                    "Self-efficacy high",
                ],
            },
        ],
        "outcome_measures": [
            {"name": "Wellness Wheel", "target": "All domains >=70%", "timeframe": "Week 12"},
            {"name": "WHO-5", "target": ">=60", "timeframe": "Week 12"},
            {"name": "PSS-10", "target": "<14", "timeframe": "Week 12"},
            {"name": "Behavior Change", "target": "Sustained >=6 months", "timeframe": "Follow-up"},
        ],
    },
]



def create_wellness_protocol(
    session: Session,
    patient_id: str,
    protocol_data: dict[str, Any],
) -> dict[str, Any]:
    """Create and assign a wellness protocol to a patient.

    Looks up the protocol template by ID and creates an active
    protocol instance for the patient.

    Args:
        session: SQLAlchemy session
        patient_id: Patient identifier
        protocol_data: Dict with name, template, duration_weeks, category, etc.

    Returns:
        Dict with protocol_id, name, status, and patient_id
    """
    template_id = protocol_data.get("template_id") or protocol_data.get("id")
    template = None
    if template_id:
        template = next((t for t in WELLNESS_PROTOCOL_TEMPLATES if t["id"] == template_id), None)

    protocol_id = f"wp-{uuid.uuid4().hex[:8]}"
    record = {
        "id": protocol_id,
        "patient_id": patient_id,
        "name": protocol_data.get("name", "Unnamed Protocol"),
        "template": protocol_data.get("template", ""),
        "template_id": template_id,
        "status": "active",
        "week": 1,
        "total_weeks": protocol_data.get("duration_weeks", template["duration_weeks"] if template else 4),
        "category": protocol_data.get("category", template["category"] if template else "general"),
        "evidence_grade": protocol_data.get("evidence_grade", template["evidence_grade"] if template else "C"),
        "start_date": protocol_data.get("start_date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "clinician_notes": protocol_data.get("clinician_notes"),
        "phases": [p for p in (template["phases"] if template else [])],
        "outcome_measures": [o for o in (template["outcome_measures"] if template else [])],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if patient_id not in _wellness_protocol_store:
        _wellness_protocol_store[patient_id] = []
    _wellness_protocol_store[patient_id].append(record)

    return {
        "id": protocol_id,
        "name": record["name"],
        "status": record["status"],
        "patient_id": patient_id,
    }


def get_patient_protocols(
    session: Session,
    patient_id: str,
    status: str | None = None,
) -> list[dict[str, Any]]:
    """Get wellness protocols assigned to a patient."""
    store = _wellness_protocol_store.get(patient_id, [])
    if status:
        store = [p for p in store if p.get("status") == status]
    if not store:
        return _generate_synthetic_protocols(patient_id)
    return sorted(store, key=lambda x: x.get("created_at", ""), reverse=True)


def _generate_synthetic_protocols(patient_id: str) -> list[dict[str, Any]]:
    """Generate synthetic active protocols for demo patients."""
    templates = {
        "demo-pt-marcus-chen": [
            {
                "id": "wp-1", "name": "Sleep Restoration Program", "template": "Sleep restoration (4-week CBT-I based)",
                "status": "active", "week": 2, "total_weeks": 4, "category": "sleep", "evidence_grade": "A",
                "start_date": "2025-01-01",
            },
            {
                "id": "wp-2", "name": "Stress Resilience Training", "template": "Stress resilience (6-week HRV + mindfulness)",
                "status": "active", "week": 1, "total_weeks": 6, "category": "stress", "evidence_grade": "B",
                "start_date": "2025-01-08",
            },
        ],
        "demo-pt-elena-vasquez": [
            {
                "id": "wp-3", "name": "Mood Boost Through Movement", "template": "Mood boost through movement (8-week exercise)",
                "status": "active", "week": 3, "total_weeks": 8, "category": "exercise", "evidence_grade": "A",
                "start_date": "2024-12-15",
            },
        ],
        "demo-pt-samantha-li": [
            {
                "id": "wp-4", "name": "Stress Resilience Training", "template": "Stress resilience (6-week HRV + mindfulness)",
                "status": "active", "week": 2, "total_weeks": 6, "category": "stress", "evidence_grade": "B",
                "start_date": "2024-12-28",
            },
            {
                "id": "wp-5", "name": "Mind-Body Integration", "template": "Mind-body integration (6-week yoga + meditation)",
                "status": "active", "week": 1, "total_weeks": 6, "category": "stress", "evidence_grade": "B",
                "start_date": "2025-01-08",
            },
        ],
    }
    return [dict(p, patient_id=patient_id) for p in templates.get(patient_id, [])]


# ═══════════════════════════════════════════════════════════════════════════════
# Wellness Session Logging
# ═══════════════════════════════════════════════════════════════════════════════


def log_wellness_session(
    session: Session,
    patient_id: str,
    session_data: dict[str, Any],
) -> dict[str, Any]:
    """Log a wellness session delivery note.

    Args:
        session: SQLAlchemy session
        patient_id: Patient identifier
        session_data: Dict with protocol_id, session_date, duration_minutes, notes

    Returns:
        Dict with session_id
    """
    session_id = f"ws-{uuid.uuid4().hex[:8]}"
    record = {
        "id": session_id,
        "patient_id": patient_id,
        "protocol_id": session_data.get("protocol_id"),
        "session_date": session_data.get("session_date", datetime.now(timezone.utc).strftime("%Y-%m-%d")),
        "duration_minutes": int(session_data.get("duration_minutes", 30)),
        "session_type": session_data.get("session_type"),
        "notes": session_data.get("notes"),
        "adherence_rating": session_data.get("adherence_rating"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if patient_id not in _wellness_session_store:
        _wellness_session_store[patient_id] = []
    _wellness_session_store[patient_id].append(record)

    return {"id": session_id, "patient_id": patient_id}


# ═══════════════════════════════════════════════════════════════════════════════
# Progress Summary
# ═══════════════════════════════════════════════════════════════════════════════


def get_progress_summary(
    session: Session,
    patient_id: str,
) -> dict[str, Any]:
    """Get comprehensive wellness progress summary for a patient.

    Aggregates data from all wellness modules to provide a holistic
    progress overview with clinical alerts.

    Args:
        session: SQLAlchemy session
        patient_id: Patient identifier

    Returns:
        Dict with overall score, domain summaries, and alerts
    """
    profile = _patient_wellness_profile.get(patient_id, _generate_default_profile({"patient_id": patient_id}))

    # Sleep summary
    sleep_entries = _sleep_diary_store.get(patient_id, [])
    sleep_summary = None
    if sleep_entries:
        recent = sleep_entries[-7:]
        avg_eff = sum(e.get("efficiency", 0) for e in recent) / len(recent)
        avg_dur = sum(e.get("duration_hours", 0) for e in recent) / len(recent)
        sleep_summary = {
            "entries_last_7_days": len(recent),
            "avg_efficiency": round(avg_eff, 1),
            "avg_duration_hours": round(avg_dur, 1),
            "score": profile.get("sleep_score", 0),
        }

    # Stress summary
    stress_entries = _stress_assessment_store.get(patient_id, [])
    stress_summary = None
    if stress_entries:
        latest = stress_entries[-1]
        stress_summary = {
            "latest_pss": latest.get("pss_score"),
            "latest_hrv": latest.get("hrv_rmssd"),
            "assessments_count": len(stress_entries),
            "level": profile.get("stress_level", "unknown"),
        }

    # Exercise summary
    exercise_entries = _exercise_log_store.get(patient_id, [])
    exercise_summary = None
    if exercise_entries:
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        recent = [e for e in exercise_entries if e.get("date", "") >= week_ago]
        total_min = sum(e.get("duration", 0) for e in recent)
        sessions = len(recent)
        exercise_summary = {
            "sessions_last_7_days": sessions,
            "total_minutes_last_7_days": total_min,
            "avg_mood_delta": round(sum(e.get("mood_delta", 0) or 0 for e in recent) / max(len(recent), 1), 1) if recent else None,
        }

    # Assessment summary
    assessment_entries = _wellness_assessment_store.get(patient_id, [])
    assessment_summary = None
    if assessment_entries:
        latest_who5 = next((a for a in reversed(assessment_entries) if a.get("type") == "WHO-5"), None)
        latest_pss = next((a for a in reversed(assessment_entries) if a.get("type") == "PSS-10"), None)
        assessment_summary = {
            "total_assessments": len(assessment_entries),
            "latest_who5": latest_who5.get("computed_scores", {}).get("percentage") if latest_who5 else None,
            "latest_pss": latest_pss.get("computed_scores", {}).get("pss_score") if latest_pss else None,
        }

    # Protocol summary
    protocols = _wellness_protocol_store.get(patient_id, [])
    if not protocols:
        protocols = _generate_synthetic_protocols(patient_id)
    active_protocols = [p for p in protocols if p.get("status") == "active"]
    protocol_summary = {
        "total_protocols": len(protocols),
        "active": len(active_protocols),
        "completed": len([p for p in protocols if p.get("status") == "completed"]),
        "active_names": [p.get("name") for p in active_protocols],
    }

    # Overall wellness score (0-100)
    scores = []
    if profile.get("sleep_score"):
        scores.append(profile["sleep_score"])
    if profile.get("hrv_trend"):
        scores.append(min(100, profile["hrv_trend"] * 1.5))  # Normalize HRV
    if profile.get("activity_minutes"):
        scores.append(min(100, profile["activity_minutes"] / 1.5))  # Normalize to 150 min

    overall = round(sum(scores) / len(scores), 1) if scores else None

    # Generate alerts
    alerts = _generate_alerts(profile)

    return {
        "patient_id": patient_id,
        "overall_wellness_score": overall,
        "sleep_summary": sleep_summary,
        "stress_summary": stress_summary,
        "exercise_summary": exercise_summary,
        "assessment_summary": assessment_summary,
        "protocol_summary": protocol_summary,
        "alerts": alerts,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Wellness Wheel
# ═══════════════════════════════════════════════════════════════════════════════


def get_wellness_wheel_data(
    session: Session,
    patient_id: str,
) -> list[dict[str, Any]]:
    """Get wellness wheel data (6-domain holistic assessment).

    The wellness wheel evaluates 6 core domains:
    - Sleep quality and duration
    - Stress management and resilience
    - Physical activity and exercise
    - Nutrition quality
    - Social connection
    - Purpose and meaning

    Args:
        session: SQLAlchemy session
        patient_id: Patient identifier

    Returns:
        List of domain dicts with name and score (0-100)
    """
    cached = _wellness_wheel_store.get(patient_id)
    if cached:
        return cached

    # Generate from profile
    profile = _patient_wellness_profile.get(patient_id, _generate_default_profile({"patient_id": patient_id}))

    sleep_score = profile.get("sleep_score", 70)
    hrv_trend = profile.get("hrv_trend", 48)
    stress_level = profile.get("stress_level", "moderate")
    activity_minutes = profile.get("activity_minutes", 100)

    # Map stress level to score
    stress_scores = {"low": 80, "moderate": 55, "high": 35, "severe": 20}
    stress_score = stress_scores.get(stress_level, 50)

    # Normalize HRV (25-80ms range)
    hrv_normalized = min(100, max(0, (hrv_trend - 25) / 55 * 100))

    # Exercise score
    exercise_score = min(100, (activity_minutes / 150) * 100)

    # Demo-specific adjustments
    domain_scores = {
        "demo-pt-samantha-li": {"sleep": 72, "stress": 55, "exercise": 65, "nutrition": 70, "social": 60, "purpose": 65},
        "demo-pt-marcus-chen": {"sleep": 45, "stress": 35, "exercise": 50, "nutrition": 60, "social": 55, "purpose": 50},
        "demo-pt-elena-vasquez": {"sleep": 88, "stress": 82, "exercise": 90, "nutrition": 75, "social": 70, "purpose": 78},
        "demo-pt-omar-haddad": {"sleep": 35, "stress": 20, "exercise": 30, "nutrition": 45, "social": 40, "purpose": 35},
        "demo-pt-amelia-brown": {"sleep": 78, "stress": 60, "exercise": 70, "nutrition": 68, "social": 62, "purpose": 70},
    }

    demo_scores = domain_scores.get(patient_id)
    if demo_scores:
        domains = [
            {"domain": "sleep", "score": demo_scores["sleep"], "label": "Sleep", "color": "#60a5fa"},
            {"domain": "stress", "score": demo_scores["stress"], "label": "Stress", "color": "#f87171"},
            {"domain": "exercise", "score": demo_scores["exercise"], "label": "Exercise", "color": "#34d399"},
            {"domain": "nutrition", "score": demo_scores["nutrition"], "label": "Nutrition", "color": "#fbbf24"},
            {"domain": "social", "score": demo_scores["social"], "label": "Social", "color": "#a78bfa"},
            {"domain": "purpose", "score": demo_scores["purpose"], "label": "Purpose", "color": "#f472b6"},
        ]
    else:
        domains = [
            {"domain": "sleep", "score": sleep_score, "label": "Sleep", "color": "#60a5fa"},
            {"domain": "stress", "score": stress_score, "label": "Stress", "color": "#f87171"},
            {"domain": "exercise", "score": round(exercise_score), "label": "Exercise", "color": "#34d399"},
            {"domain": "nutrition", "score": 65, "label": "Nutrition", "color": "#fbbf24"},
            {"domain": "social", "score": 60, "label": "Social", "color": "#a78bfa"},
            {"domain": "purpose", "score": 60, "label": "Purpose", "color": "#f472b6"},
        ]

    _wellness_wheel_store[patient_id] = domains
    return domains


def compute_wheel_overall(domains: list[dict[str, Any]]) -> float:
    """Compute overall wellness score from wheel domains.

    Uses area-weighted calculation (geometric mean of domain scores),
    which rewards balance across domains over single-domain excellence.
    """
    if not domains:
        return 0.0
    scores = [d.get("score", 0) for d in domains]
    # Geometric mean
    product = 1.0
    for s in scores:
        product *= max(1, s)
    return round(product ** (1 / len(scores)), 1)



# ═══════════════════════════════════════════════════════════════════════════════
# Breathing Exercise Specifications
# ═══════════════════════════════════════════════════════════════════════════════


BREATHING_EXERCISES = [
    {
        "id": "box",
        "name": "Box Breathing",
        "inhale_sec": 4,
        "hold1_sec": 4,
        "exhale_sec": 4,
        "hold2_sec": 4,
        "total_cycle_sec": 16,
        "breaths_per_minute": 3.75,
        "description": "Equal-duration breathing phases used by Navy SEALs for stress control under pressure.",
        "evidence_summary": "Ma et al. (2017): box breathing reduces salivary cortisol and improves HRV coherence within 5 minutes of practice.",
        "clinical_indications": ["Acute stress", "Pre-sleep wind-down", "Performance anxiety", "Public speaking"],
        "contraindications": ["Severe COPD (adapt timing)", "Unstable cardiac rhythm"],
        "physiological_mechanism": "Equal phase durations balance sympathetic and parasympathetic tone, entraining baroreflex sensitivity.",
    },
    {
        "id": "4-7-8",
        "name": "4-7-8 Breathing",
        "inhale_sec": 4,
        "hold1_sec": 7,
        "exhale_sec": 8,
        "hold2_sec": 0,
        "total_cycle_sec": 19,
        "breaths_per_minute": 3.16,
        "description": "Extended exhalation with breath hold activates the parasympathetic nervous system for relaxation.",
        "evidence_summary": "Extended exhalation ratio promotes vagal tone and has been shown to reduce sleep latency in anxious individuals.",
        "clinical_indications": ["Insomnia", "Generalized anxiety", "Panic symptoms", "Hypertension"],
        "contraindications": ["Severe asthma (may trigger bronchospasm)", "Recent abdominal surgery"],
        "physiological_mechanism": "Extended exhalation at 8 seconds entrains vagal efferent activity, reducing heart rate and blood pressure.",
    },
    {
        "id": "resonant",
        "name": "Resonant Breathing",
        "inhale_sec": 5.5,
        "hold1_sec": 0,
        "exhale_sec": 5.5,
        "hold2_sec": 0,
        "total_cycle_sec": 11,
        "breaths_per_minute": 5.45,
        "description": "Breathing at resonant frequency (~5.5 breaths/min) maximizes HRV amplitude and baroreflex gain.",
        "evidence_summary": "Lehrer et al. (2003): HRV biofeedback at resonant frequency improves autonomic regulation, reduces anxiety and depression scores.",
        "clinical_indications": ["HRV training", "Autonomic dysregulation", "Chronic stress", "Depression", "PTSD"],
        "contraindications": ["None significant"],
        "physiological_mechanism": "Resonant frequency breathing (5-6 breaths/min) matches Mayer wave oscillation, maximizing RSA amplitude.",
    },
    {
        "id": "coherent",
        "name": "Coherent Breathing",
        "inhale_sec": 5,
        "hold1_sec": 0,
        "exhale_sec": 5,
        "hold2_sec": 0,
        "total_cycle_sec": 10,
        "breaths_per_minute": 6.0,
        "description": "6 breaths per minute to synchronize heart rate oscillations and promote autonomic coherence.",
        "evidence_summary": "McCraty et al. (2014): HeartMath coherence training at 6 bpm improves emotional regulation and executive function.",
        "clinical_indications": ["Emotional regulation", "Performance optimization", "PTSD", "ADHD"],
        "contraindications": ["None significant"],
        "physiological_mechanism": "6 breaths/min entrains cardiac oscillation to baroreflex resonance, producing smooth sinusoidal HRV pattern.",
    },
    {
        "id": "paced",
        "name": "Slow Paced Breathing",
        "inhale_sec": 4,
        "hold1_sec": 2,
        "exhale_sec": 6,
        "hold2_sec": 0,
        "total_cycle_sec": 12,
        "breaths_per_minute": 5.0,
        "description": "Extended exhalation with brief pause for general relaxation and stress reduction.",
        "evidence_summary": "Russo et al. (2017): slow breathing (4-6 breaths/min) increases HRV and reduces sympathetic tone.",
        "clinical_indications": ["General stress", "Mild hypertension", "Pre-procedure anxiety"],
        "contraindications": ["Severe respiratory disease"],
        "physiological_mechanism": "Slow breathing with extended exhalation maximizes vagal tone and reduces chemoreflex sensitivity.",
    },
]


def get_breathing_exercise(exercise_id: str) -> dict[str, Any] | None:
    """Get breathing exercise specification by ID."""
    for ex in BREATHING_EXERCISES:
        if ex["id"] == exercise_id:
            return ex
    return None


def get_breathing_exercises_by_indication(indication: str) -> list[dict[str, Any]]:
    """Get breathing exercises filtered by clinical indication."""
    indication = indication.lower()
    return [
        ex for ex in BREATHING_EXERCISES
        if any(indication in ind.lower() for ind in ex.get("clinical_indications", []))
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# Sleep Hygiene Checklist
# ═══════════════════════════════════════════════════════════════════════════════


SLEEP_HYGIENE_ITEMS = [
    {
        "id": "sh_1",
        "item": "Consistent sleep/wake schedule (±30 minutes)",
        "category": "schedule",
        "evidence": "AASM Grade A: regular sleep-wake schedule improves circadian entrainment",
        "priority": "high",
    },
    {
        "id": "sh_2",
        "item": "Bedroom dark, cool (60-67°F / 15-19°C), quiet",
        "category": "environment",
        "evidence": "Cool ambient temperature facilitates sleep onset via thermoregulation",
        "priority": "high",
    },
    {
        "id": "sh_3",
        "item": "No screens (phone, tablet, TV) 1 hour before bed",
        "category": "stimulus",
        "evidence": "Blue light suppresses melatonin; content activates arousal systems",
        "priority": "high",
    },
    {
        "id": "sh_4",
        "item": "No caffeine after 2:00 PM",
        "category": "substance",
        "evidence": "Caffeine half-life 5-6 hours; delays circadian melatonin phase",
        "priority": "high",
    },
    {
        "id": "sh_5",
        "item": "No alcohol within 3 hours of bedtime",
        "category": "substance",
        "evidence": "Alcohol fragments sleep architecture, suppresses REM in second half of night",
        "priority": "high",
    },
    {
        "id": "sh_6",
        "item": "No heavy meals within 2 hours of bedtime",
        "category": "substance",
        "evidence": "Late eating activates digestive system and raises core temperature",
        "priority": "medium",
    },
    {
        "id": "sh_7",
        "item": "Regular exercise (not within 3 hours of bed)",
        "category": "lifestyle",
        "evidence": "Exercise improves sleep quality; late exercise raises core temperature",
        "priority": "high",
    },
    {
        "id": "sh_8",
        "item": "Wind-down routine established (30-60 min)",
        "category": "routine",
        "evidence": "Predictable pre-sleep routine cues circadian and homeostatic systems",
        "priority": "medium",
    },
    {
        "id": "sh_9",
        "item": "Bed used only for sleep and intimacy",
        "category": "stimulus",
        "evidence": "AASM Grade A: stimulus control strengthens bed-sleep association",
        "priority": "high",
    },
    {
        "id": "sh_10",
        "item": "Naps limited to 20-30 minutes, before 3:00 PM",
        "category": "schedule",
        "evidence": "Long/late naps reduce sleep pressure and delay nocturnal sleep onset",
        "priority": "medium",
    },
    {
        "id": "sh_11",
        "item": "Morning light exposure (15-30 minutes outdoor)",
        "category": "circadian",
        "evidence": "Bright morning light advances circadian phase, improves alertness",
        "priority": "high",
    },
    {
        "id": "sh_12",
        "item": "Worries written down before bed (worry journal)",
        "category": "cognitive",
        "evidence": "Expressive writing reduces pre-sleep cognitive arousal",
        "priority": "medium",
    },
]


def score_sleep_hygiene(answered_items: list[str]) -> dict[str, Any]:
    """Score sleep hygiene checklist.

    Args:
        answered_items: List of item IDs that the patient adheres to

    Returns:
        Dict with score, max, percentage, priority breakdown
    """
    total = len(SLEEP_HYGIENE_ITEMS)
    checked = len([i for i in answered_items if any(i == item["id"] for item in SLEEP_HYGIENE_ITEMS)])
    pct = round((checked / total) * 100, 1) if total else 0

    high_priority = [item for item in SLEEP_HYGIENE_ITEMS if item["priority"] == "high"]
    high_checked = len([i for i in answered_items if any(i == hp["id"] for hp in high_priority)])
    high_pct = round((high_checked / len(high_priority)) * 100, 1) if high_priority else 0

    interpretation = ""
    if pct >= 80:
        interpretation = "Good sleep hygiene — maintain current practices"
    elif pct >= 60:
        interpretation = "Moderate sleep hygiene — focus on high-priority items"
    elif pct >= 40:
        interpretation = "Below average — structured intervention recommended"
    else:
        interpretation = "Poor sleep hygiene — CBT-I or sleep hygiene education needed"

    return {
        "score": checked,
        "max": total,
        "percentage": pct,
        "high_priority": {"checked": high_checked, "total": len(high_priority), "percentage": high_pct},
        "missing_items": [item["item"] for item in SLEEP_HYGIENE_ITEMS if item["id"] not in answered_items],
        "interpretation": interpretation,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# CBT-I Protocol Detail
# ═══════════════════════════════════════════════════════════════════════════════


def get_cbti_protocol_detail() -> dict[str, Any]:
    """Get detailed CBT-I protocol specification.

    Returns the full AASM-endorsed CBT-I protocol with all four core
    components, session-by-session structure, and outcome targets.
    """
    return {
        "name": "Cognitive Behavioral Therapy for Insomnia (CBT-I)",
        "duration_weeks": 4,
        "sessions": 4,
        "evidence_grade": "A",
        "evidence_source": "AASM Clinical Practice Guideline for the Treatment of Insomnia, 2021",
        "efficacy": {
            "sleep_efficiency_improvement": "15-25% absolute increase",
            "is_i_reduction": "8-10 point reduction",
            "effect_size": "d=0.74-1.09 (large)",
            "durability": "Benefits sustained at 6-12 month follow-up",
        },
        "core_components": [
            {
                "name": "Stimulus Control Therapy",
                "priority": "Core",
                "instructions": [
                    "1. Go to bed only when sleepy",
                    "2. Use the bed only for sleep and sexual activity",
                    "3. If unable to sleep after ~20 minutes, leave bed and do quiet activity",
                    "4. Return to bed only when sleepy",
                    "5. Maintain a fixed wake time every day",
                    "6. Avoid napping during treatment period",
                ],
                "rationale": "Weakens the association between bed and wakefulness/arousal; strengthens bed-sleep association",
                "evidence": "AASM Grade A recommendation",
            },
            {
                "name": "Sleep Restriction Therapy",
                "priority": "Core",
                "instructions": [
                    "1. Calculate average total sleep time from 1-week sleep diary",
                    "2. Set time in bed (TIB) = average TST (minimum 5 hours)",
                    "3. Fix wake time; bedtime = wake time - TIB window",
                    "4. When sleep efficiency >=85% for 1 week, increase TIB by 15 minutes",
                    "5. When SE <80%, decrease TIB by 15 minutes",
                    "6. Never reduce TIB below 5 hours",
                ],
                "rationale": "Creates mild sleep deprivation that increases homeostatic sleep drive and consolidates sleep",
                "evidence": "AASM Grade A recommendation",
                "cautions": [
                    "Daytime sleepiness is expected initially",
                    "Avoid driving or operating machinery when sleepy",
                    "Reduce TIB if dangerous sleepiness occurs",
                    "Contraindicated in bipolar disorder (mania risk)",
                ],
            },
            {
                "name": "Cognitive Restructuring",
                "priority": "Core",
                "instructions": [
                    "1. Identify dysfunctional sleep cognitions (catastrophic thinking)",
                    "2. Examine evidence for and against sleep-related beliefs",
                    "3. Generate balanced alternative thoughts",
                    "4. Practice thought records for nighttime rumination",
                    "5. Address performance anxiety about sleep",
                    "6. Normalize occasional poor sleep nights",
                ],
                "rationale": "Modifies unhelpful beliefs that perpetuate insomnia through arousal and sleep effort",
                "evidence": "AASM Grade B recommendation",
            },
            {
                "name": "Sleep Hygiene Education",
                "priority": "Adjunct",
                "instructions": [
                    "1. Consistent sleep-wake schedule (+/- 30 min)",
                    "2. Optimize bedroom environment (dark, cool, quiet)",
                    "3. Eliminate evening screen exposure (blue light)",
                    "4. Caffeine cutoff 8+ hours before bed",
                    "5. Alcohol avoidance within 3 hours of bed",
                    "6. Regular exercise (not within 3h of bedtime)",
                    "7. Morning light exposure 15-30 minutes",
                ],
                "rationale": "Removes environmental and behavioral obstacles to sleep",
                "evidence": "AASM: insufficient evidence as monotherapy; used as adjunct",
            },
        ],
        "session_structure": {
            "session_1": "Assessment, psychoeducation, sleep diary initiation, stimulus control",
            "session_2": "Sleep restriction initiation, review diary, troubleshoot barriers",
            "session_3": "Cognitive restructuring, relaxation training, adjust sleep window",
            "session_4": "Relapse prevention, taper support, long-term maintenance plan",
        },
        "outcome_targets": [
            {"measure": "Sleep Efficiency", "target": ">=85%", "assessment": "Sleep diary"},
            {"measure": "Insomnia Severity Index (ISI)", "target": "<8", "assessment": "Questionnaire"},
            {"measure": "Pittsburgh Sleep Quality Index (PSQI)", "target": "<5", "assessment": "Questionnaire"},
            {"measure": "Sleep Onset Latency", "target": "<30 minutes", "assessment": "Sleep diary"},
            {"measure": "Wake After Sleep Onset", "target": "<20 minutes", "assessment": "Sleep diary"},
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Clinical Reference Data
# ═══════════════════════════════════════════════════════════════════════════════


def get_wellness_references() -> dict[str, list[dict[str, str]]]:
    """Get evidence references for all wellness interventions.

    Returns structured citation data for clinical documentation.
    """
    return {
        "sleep": [
            {"reference": "AASM (2021). Clinical Practice Guideline for Treatment of Insomnia. JCSM.", "grade": "A"},
            {"reference": "Morin et al. (2006). Psychological and behavioral treatment of insomnia. Sleep, 29(11), 1398-1414.", "grade": "A"},
            {"reference": "Manber et al. (2008). Cognitive behavioral therapy for insomnia enhances depression outcome. SLEEP, 31(4), 489-495.", "grade": "A"},
        ],
        "stress": [
            {"reference": "Lehrer et al. (2003). Heart rate variability biofeedback. Appl Psychophysiol Biofeedback, 28(2), 93-95.", "grade": "B"},
            {"reference": "Goyal et al. (2014). Meditation programs for psychological stress. JAMA IM, 174(3), 357-368.", "grade": "A"},
            {"reference": "Manzoni et al. (2008). Relaxation training for anxiety. BMC Psychiatry, 8, 41.", "grade": "B"},
        ],
        "exercise": [
            {"reference": "Blumenthal et al. (2007). Exercise and pharmacotherapy in the treatment of MDD. Psychosom Med, 69(7), 587-596.", "grade": "A"},
            {"reference": "Schuch et al. (2018). Exercise as treatment for depression. JAMA Psychiatry, 75(6), 566-576.", "grade": "A"},
            {"reference": "ACSM (2022). Guidelines for Exercise Testing and Prescription, 11th Ed.", "grade": "A"},
        ],
        "nutrition": [
            {"reference": "Estruch et al. (2013). Primary prevention of CVD with Mediterranean diet. NEJM, 368(14), 1279-1290.", "grade": "A"},
            {"reference": "Sofi et al. (2014). Mediterranean diet and health status. AJCN, 99(3), 583S.", "grade": "A"},
        ],
        "circadian": [
            {"reference": "Lack et al. (2008). Chronobiological therapy for DSPD. Sleep Medicine, 9(8), 838-844.", "grade": "B"},
            {"reference": "Terman & Terman (2005). Light therapy for circadian rhythm disorders. Sleep Medicine Reviews, 9(6), 449-460.", "grade": "B"},
        ],
        "social": [
            {"reference": "Masi et al. (2011). A meta-analysis of interventions to reduce loneliness. Pers Soc Psychol Rev, 15(3), 219-266.", "grade": "B"},
            {"reference": "Holt-Lunstad et al. (2015). Loneliness and social isolation as risk factors. Perspect Psychol Sci, 10(2), 227-237.", "grade": "B"},
        ],
        "nature": [
            {"reference": "Berman et al. (2012). The cognitive benefits of interacting with nature. Psychol Sci, 23(10), 1207-1212.", "grade": "B"},
            {"reference": "White et al. (2019). Spending at least 120 minutes a week in nature. Sci Rep, 9, 7730.", "grade": "B"},
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Utility Functions
# ═══════════════════════════════════════════════════════════════════════════════


def normalize_wellness_score(
    raw_value: float,
    min_expected: float,
    max_expected: float,
    invert: bool = False,
) -> float:
    """Normalize a raw wellness metric to a 0-100 scale.

    Args:
        raw_value: The raw measured value
        min_expected: Expected minimum for population
        max_expected: Expected maximum for population
        invert: If True, lower raw values are better (e.g., PSS-10 score)

    Returns:
        Normalized score 0-100
    """
    if max_expected <= min_expected:
        return 50.0
    normalized = (raw_value - min_expected) / (max_expected - min_expected)
    normalized = max(0, min(1, normalized))
    if invert:
        normalized = 1 - normalized
    return round(normalized * 100, 1)


def compute_wellness_composite(scores: dict[str, float]) -> dict[str, Any]:
    """Compute composite wellness score from multiple domain scores.

    Uses weighted average with domain weights reflecting clinical importance.
    """
    weights = {
        "sleep": 0.25,
        "stress": 0.20,
        "exercise": 0.20,
        "nutrition": 0.15,
        "social": 0.10,
        "purpose": 0.10,
    }
    weighted_sum = 0.0
    total_weight = 0.0
    domain_results = {}

    for domain, weight in weights.items():
        score = scores.get(domain)
        if score is not None:
            weighted_sum += score * weight
            total_weight += weight
            domain_results[domain] = {"score": score, "weight": weight}

    composite = round(weighted_sum / total_weight, 1) if total_weight > 0 else None
    return {
        "composite_score": composite,
        "domain_scores": domain_results,
        "total_weight": total_weight,
    }


def generate_wellness_report(
    patient_id: str,
    patient_name: str,
    start_date: str,
    end_date: str,
) -> dict[str, Any]:
    """Generate a structured wellness report for clinical documentation.

    Args:
        patient_id: Patient identifier
        patient_name: Patient name for report header
        start_date: Report period start (ISO date)
        end_date: Report period end (ISO date)

    Returns:
        Dict with report sections ready for PDF generation
    """
    profile = _patient_wellness_profile.get(
        patient_id, _generate_default_profile({"patient_id": patient_id, "patient_name": patient_name})
    )
    wheel = get_wellness_wheel_data(None, patient_id)
    progress = get_progress_summary(None, patient_id)

    return {
        "report_meta": {
            "patient_id": patient_id,
            "patient_name": patient_name,
            "period": f"{start_date} to {end_date}",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "disclaimer": "This report is for clinical decision-support only. Not a substitute for clinical judgment.",
        },
        "executive_summary": {
            "overall_score": progress.get("overall_wellness_score"),
            "primary_concerns": progress.get("alerts", []),
            "status": "Review recommended" if progress.get("alerts") else "Stable",
        },
        "wellness_wheel": wheel,
        "sleep_summary": progress.get("sleep_summary"),
        "stress_summary": progress.get("stress_summary"),
        "exercise_summary": progress.get("exercise_summary"),
        "assessment_summary": progress.get("assessment_summary"),
        "protocol_summary": progress.get("protocol_summary"),
        "evidence_references": get_wellness_references(),
    }


# Audit logging helper
def audit_wellness_action(
    action: str,
    patient_id: str,
    actor_id: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create an audit log entry for wellness platform actions.

    Args:
        action: Action name (e.g., 'sleep_diary_submitted')
        patient_id: Patient identifier
        actor_id: Actor/clinician identifier
        details: Optional additional details

    Returns:
        Audit log entry dict
    """
    return {
        "id": f"audit-{uuid.uuid4().hex[:12]}",
        "action": action,
        "patient_id": patient_id,
        "actor_id": actor_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": details or {},
    }
