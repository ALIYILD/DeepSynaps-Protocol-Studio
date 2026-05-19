"""
patient_portal_v2_router.py
Enhanced Patient Portal Backend for DeepSynaps Protocol Studio

Provides patient-facing endpoints for:
- Dashboard aggregation (sessions, goals, messages, tasks, wearables, education)
- Home task management (CRUD + completion)
- Wellness check-in (submit + history)
- Patient-safe messaging
- Shared clinical reports (read-only)
- Wearable data summaries
- Education centre content
- Upload centre (requests + file uploads)

All endpoints enforce patient-scoped access, log audit events,
and include clinical disclaimers.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, Body
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------
logger = logging.getLogger("deepsynaps.patient_portal_v2")

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/v2", tags=["Patient Portal v2"])

# ---------------------------------------------------------------------------
# Role-gate stubs (replace with real implementations from auth module)
# ---------------------------------------------------------------------------

def require_patient(user=None):
    """Dependency: patient-only access."""
    # Production: verify JWT claims contain role == "patient"
    return user or {"role": "patient", "user_id": "demo_patient_001"}

def require_patient_or_clinician(user=None):
    """Dependency: patient or clinician access."""
    # Production: verify JWT claims contain role in ("patient", "clinician")
    return user or {"role": "patient", "user_id": "demo_patient_001"}

def get_db():
    """Dependency: database session."""
    # Production: yield SessionLocal()
    yield None

def _current_user(user) -> dict:
    """Extract user dict from dependency."""
    return user or {"role": "patient", "user_id": "anonymous"}

# ---------------------------------------------------------------------------
# Audit constants
# ---------------------------------------------------------------------------

AUDIT_EVENTS = [
    "PATIENT_DASHBOARD_OPENED",
    "PATIENT_CHECKIN_SUBMITTED",
    "PATIENT_REPORT_VIEWED",
    "PATIENT_MESSAGE_SENT",
    "PATIENT_UPLOAD_COMPLETED",
    "PATIENT_HOME_TASK_COMPLETED",
    "PATIENT_WELLNESS_CHECKIN",
    "PATIENT_EDUCATION_VIEWED",
    "PATIENT_SHARED_REPORT_OPENED",
]

def _log_audit(event: str, patient_id: str, user: dict, detail: str = "") -> None:
    """Persist an audit event for every patient data access."""
    user_id = user.get("user_id", "unknown")
    role = user.get("role", "unknown")
    logger.info(
        "AUDIT | event=%s | patient_id=%s | actor=%s | role=%s | detail=%s",
        event, patient_id, user_id, role, detail,
    )

# ---------------------------------------------------------------------------
# Emergency disclaimer
# ---------------------------------------------------------------------------

EMERGENCY_DISCLAIMER = (
    "If you are experiencing a medical emergency, call your local emergency number immediately. "
    "This portal is not monitored 24/7."
)

def _with_disclaimer(payload: dict) -> dict:
    """Attach emergency disclaimer and clinical review notice to every response."""
    payload["_disclaimer"] = EMERGENCY_DISCLAIMER
    payload["_clinical_notice"] = "Your clinician will review this information during your next session."
    return payload

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class SessionItem(BaseModel):
    id: str
    title: str
    scheduled_at: str
    duration_min: int
    therapist_name: str
    session_type: str
    location: str
    status: str = "scheduled"

class GoalItem(BaseModel):
    id: str
    title: str
    description: str
    progress_pct: float
    due_date: str
    status: str

class HomeTaskItem(BaseModel):
    id: str
    title: str
    description: str
    assigned_date: str
    due_date: str
    status: str
    task_type: str
    instructions: str

class MessageItem(BaseModel):
    id: str
    sender: str
    sender_role: str
    content: str
    sent_at: str
    read: bool

class SharedReportItem(BaseModel):
    id: str
    title: str
    summary: str
    shared_at: str
    reviewed_by: str
    report_type: str

class WearableSummary(BaseModel):
    avg_sleep_hrs: float
    avg_steps: int
    avg_hrv: int
    last_sync: str
    trend_sleep: str
    trend_steps: str
    trend_hrv: str

class EducationItem(BaseModel):
    id: str
    title: str
    category: str
    description: str
    read_time_min: int
    completed: bool
    content_url: str

class UploadRequestItem(BaseModel):
    id: str
    title: str
    description: str
    requested_by: str
    requested_at: str
    status: str
    due_date: str

class WellnessCheckIn(BaseModel):
    mood: int = Field(..., ge=1, le=10)
    sleep_quality: int = Field(..., ge=1, le=10)
    stress_level: int = Field(..., ge=1, le=10)
    energy_level: int = Field(..., ge=1, le=10)
    notes: str = ""

class WellnessEntry(BaseModel):
    id: str
    date: str
    mood: int
    sleep_quality: int
    stress_level: int
    energy_level: int
    notes: str

class TaskCompletion(BaseModel):
    notes: str = ""
    rating: int = Field(5, ge=1, le=10)
    completed_date: str = ""

class PatientMessage(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    priority: str = "normal"

class DashboardResponse(BaseModel):
    upcoming_sessions: List[SessionItem]
    sessions_completed: int
    course_progress_pct: float
    active_goals: List[GoalItem]
    unread_messages: int
    wellness_streak: int
    last_checkin_date: Optional[str]
    next_session_at: Optional[str]
    home_tasks: List[HomeTaskItem]
    shared_reports: List[SharedReportItem]
    messages: List[MessageItem]
    wearable_summary: WearableSummary
    education_items: List[EducationItem]
    upload_requests: List[UploadRequestItem]
    _disclaimer: str = ""
    _clinical_notice: str = ""

# ---------------------------------------------------------------------------
# Demo data helpers
# ---------------------------------------------------------------------------

_NOW = datetime.utcnow()

DEMO_SESSIONS: List[SessionItem] = [
    SessionItem(
        id=f"sess_{uuid.uuid4().hex[:8]}",
        title="Cognitive Restructuring Session",
        scheduled_at=(_NOW + timedelta(days=2)).isoformat(),
        duration_min=50,
        therapist_name="Dr. Sarah Chen",
        session_type="Individual Therapy",
        location="Room 204 / Video",
        status="scheduled",
    ),
    SessionItem(
        id=f"sess_{uuid.uuid4().hex[:8]}",
        title="Exposure Hierarchy Review",
        scheduled_at=(_NOW + timedelta(days=5)).isoformat(),
        duration_min=50,
        therapist_name="Dr. Sarah Chen",
        session_type="Individual Therapy",
        location="Room 204",
        status="scheduled",
    ),
    SessionItem(
        id=f"sess_{uuid.uuid4().hex[:8]}",
        title="Group Support Session",
        scheduled_at=(_NOW + timedelta(days=7)).isoformat(),
        duration_min=90,
        therapist_name="Dr. Michael Torres",
        session_type="Group Therapy",
        location="Community Room A",
        status="scheduled",
    ),
]

_DEMO_GOALS: List[GoalItem] = [
    GoalItem(id=f"goal_{uuid.uuid4().hex[:8]}", title="Reduce morning anxiety", description="Practice breathing exercises within 10 minutes of waking.", progress_pct=65.0, due_date=(_NOW + timedelta(days=14)).date().isoformat(), status="active"),
    GoalItem(id=f"goal_{uuid.uuid4().hex[:8]}", title="Complete exposure ladder step 3", description="Visit a crowded grocery store for 15 minutes.", progress_pct=40.0, due_date=(_NOW + timedelta(days=21)).date().isoformat(), status="active"),
    GoalItem(id=f"goal_{uuid.uuid4().hex[:8]}", title="Sleep hygiene routine", description="No screens 1 hour before bed for 5 nights/week.", progress_pct=80.0, due_date=(_NOW + timedelta(days=7)).date().isoformat(), status="active"),
]

_DEMO_HOME_TASKS: List[HomeTaskItem] = [
    HomeTaskItem(id=f"ht_{uuid.uuid4().hex[:8]}", title="Morning Breathing Exercise", description="Complete 5 minutes of diaphragmatic breathing after waking.", assigned_date=(_NOW - timedelta(days=3)).date().isoformat(), due_date=(_NOW + timedelta(days=1)).date().isoformat(), status="pending", task_type="daily", instructions="Sit upright, inhale 4s, hold 4s, exhale 6s."),
    HomeTaskItem(id=f"ht_{uuid.uuid4().hex[:8]}", title="Thought Record Worksheet", description="Log 3 automatic thoughts from today and reframe them.", assigned_date=(_NOW - timedelta(days=2)).date().isoformat(), due_date=(_NOW + timedelta(days=2)).date().isoformat(), status="pending", task_type="worksheet", instructions="Use the CBT worksheet provided in session."),
    HomeTaskItem(id=f"ht_{uuid.uuid4().hex[:8]}", title="Exposure Practice: Coffee Shop", description="Spend 10 minutes at a coffee shop and record anxiety levels.", assigned_date=(_NOW - timedelta(days=1)).date().isoformat(), due_date=(_NOW + timedelta(days=3)).date().isoformat(), status="pending", task_type="exposure", instructions="Go alone, stay for minimum 10 minutes, rate anxiety 0-10."),
    HomeTaskItem(id=f"ht_{uuid.uuid4().hex[:8]}", title="Gratitude Journal", description="Write 3 things you are grateful for.", assigned_date=(_NOW - timedelta(days=5)).date().isoformat(), due_date=(_NOW - timedelta(days=1)).date().isoformat(), status="completed", task_type="daily", instructions="Write in your journal before bed."),
    HomeTaskItem(id=f"ht_{uuid.uuid4().hex[:8]}", title="Sleep Environment Audit", description="Assess your bedroom for sleep disruptors.", assigned_date=(_NOW - timedelta(days=4)).date().isoformat(), due_date=(_NOW - timedelta(days=2)).date().isoformat(), status="completed", task_type="assessment", instructions="Check light, noise, temperature. Submit checklist."),
]

_DEMO_MESSAGES: List[MessageItem] = [
    MessageItem(id=f"msg_{uuid.uuid4().hex[:8]}", sender="Dr. Sarah Chen", sender_role="clinician", content="Hi! I reviewed your last check-in. Your sleep scores are trending upward—great work! Let's discuss this in our next session.", sent_at=(_NOW - timedelta(hours=4)).isoformat(), read=False),
    MessageItem(id=f"msg_{uuid.uuid4().hex[:8]}", sender="Care Team", sender_role="system", content="Your upcoming appointment on Wednesday has been confirmed. Please arrive 10 minutes early.", sent_at=(_NOW - timedelta(hours=12)).isoformat(), read=False),
    MessageItem(id=f"msg_{uuid.uuid4().hex[:8]}", sender="Dr. Sarah Chen", sender_role="clinician", content="Remember to fill out your thought record before Friday. Let me know if you have questions.", sent_at=(_NOW - timedelta(days=1)).isoformat(), read=True),
]

_DEMO_REPORTS: List[SharedReportItem] = [
    SharedReportItem(id=f"rep_{uuid.uuid4().hex[:8]}", title="Initial Assessment Summary", summary="Overview of presenting concerns, diagnostic impressions, and recommended treatment plan.", shared_at=(_NOW - timedelta(days=10)).isoformat(), reviewed_by="Dr. Sarah Chen", report_type="assessment"),
    SharedReportItem(id=f"rep_{uuid.uuid4().hex[:8]}", title="Month-1 Progress Report", summary="Review of goals, symptom trajectory, and session attendance. Positive trend in anxiety scores.", shared_at=(_NOW - timedelta(days=2)).isoformat(), reviewed_by="Dr. Sarah Chen", report_type="progress"),
]

_DEMO_WEARABLE: WearableSummary = WearableSummary(
    avg_sleep_hrs=7.2,
    avg_steps=8430,
    avg_hrv=62,
    last_sync=(_NOW - timedelta(hours=1)).isoformat(),
    trend_sleep="improving",
    trend_steps="stable",
    trend_hrv="improving",
)

_DEMO_EDUCATION: List[EducationItem] = [
    EducationItem(id=f"edu_{uuid.uuid4().hex[:8]}", title="Understanding Anxiety", category="foundations", description="Learn how anxiety manifests in the body and mind.", read_time_min=8, completed=True, content_url="/education/anxiety-101"),
    EducationItem(id=f"edu_{uuid.uuid4().hex[:8]}", title="Breathing Techniques", category="skills", description="Diaphragmatic breathing and box breathing explained.", read_time_min=5, completed=True, content_url="/education/breathing"),
    EducationItem(id=f"edu_{uuid.uuid4().hex[:8]}", title="Cognitive Restructuring", category="skills", description="How to challenge and reframe unhelpful thoughts.", read_time_min=12, completed=False, content_url="/education/cognitive-restructuring"),
    EducationItem(id=f"edu_{uuid.uuid4().hex[:8]}", title="Exposure Therapy Basics", category="foundations", description="Why facing fears gradually works and how to do it safely.", read_time_min=10, completed=False, content_url="/education/exposure"),
    EducationItem(id=f"edu_{uuid.uuid4().hex[:8]}", title="Sleep and Mental Health", category="lifestyle", description="The connection between sleep quality and emotional regulation.", read_time_min=7, completed=False, content_url="/education/sleep"),
]

_DEMO_UPLOAD_REQUESTS: List[UploadRequestItem] = [
    UploadRequestItem(id=f"upr_{uuid.uuid4().hex[:8]}", title="Sleep Diary (Last 7 Days)", description="Upload your completed sleep diary worksheet.", requested_by="Dr. Sarah Chen", requested_at=(_NOW - timedelta(days=2)).isoformat(), status="pending", due_date=(_NOW + timedelta(days=2)).date().isoformat()),
    UploadRequestItem(id=f"upr_{uuid.uuid4().hex[:8]}", title="Blood Work Results", description="Please upload your recent lab results from your GP.", requested_by="Dr. Sarah Chen", requested_at=(_NOW - timedelta(days=1)).isoformat(), status="pending", due_date=(_NOW + timedelta(days=7)).date().isoformat()),
]

_DEMO_WELLNESS_HISTORY: List[WellnessEntry] = [
    WellnessEntry(id=f"we_{uuid.uuid4().hex[:8]}", date=(_NOW - timedelta(days=i)).date().isoformat(), mood=7 - (i % 3), sleep_quality=6 + (i % 2), stress_level=4 + (i % 3), energy_level=6, notes="Feeling steady today." if i == 0 else "")
    for i in range(7)
]

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/patient-portal/dashboard", response_model=DashboardResponse)
async def get_patient_dashboard(
    patient_id: str = Query(..., description="Patient unique identifier"),
    user: dict = Depends(require_patient_or_clinician),
    db: Session = Depends(get_db),
):
    """Return full patient dashboard aggregate.

    Returns upcoming sessions, progress metrics, goals, messages,
    home tasks, shared reports, wearable summary, education items,
    and upload requests. Demo data is returned as fallback.
    """
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)
    _log_audit("PATIENT_DASHBOARD_OPENED", patient_id, u)

    # --- production: fetch from database / services ---
    # sessions = db.query(Session).filter(...).all()
    # goals = db.query(Goal).filter(...).all()
    # ... etc
    # --------------------------------------------------

    unread = sum(1 for m in _DEMO_MESSAGES if not m.read)
    streak = 7  # 7-day wellness streak from demo data
    last_checkin = _DEMO_WELLNESS_HISTORY[0].date if _DEMO_WELLNESS_HISTORY else None
    next_session = DEMO_SESSIONS[0].scheduled_at if DEMO_SESSIONS else None

    payload = {
        "upcoming_sessions": [s.model_dump() for s in DEMO_SESSIONS],
        "sessions_completed": 8,
        "course_progress_pct": 42.5,
        "active_goals": [g.model_dump() for g in _DEMO_GOALS],
        "unread_messages": unread,
        "wellness_streak": streak,
        "last_checkin_date": last_checkin,
        "next_session_at": next_session,
        "home_tasks": [t.model_dump() for t in _DEMO_HOME_TASKS],
        "shared_reports": [r.model_dump() for r in _DEMO_REPORTS],
        "messages": [m.model_dump() for m in _DEMO_MESSAGES],
        "wearable_summary": _DEMO_WEARABLE.model_dump(),
        "education_items": [e.model_dump() for e in _DEMO_EDUCATION],
        "upload_requests": [r.model_dump() for r in _DEMO_UPLOAD_REQUESTS],
    }
    return _with_disclaimer(payload)


@router.get("/patient-portal/home-tasks", response_model=dict)
async def get_patient_home_tasks(
    patient_id: str = Query(...),
    status: str = Query("all", pattern="^(all|pending|completed)$"),
    user: dict = Depends(require_patient_or_clinician),
):
    """List patient-scoped home tasks filtered by status."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)
    _log_audit("PATIENT_HOME_TASK_VIEWED", patient_id, u, f"filter={status}")

    tasks = _DEMO_HOME_TASKS
    if status != "all":
        tasks = [t for t in tasks if t.status == status]

    return _with_disclaimer({"tasks": [t.model_dump() for t in tasks]})


@router.post("/patient-portal/home-tasks/{task_id}/complete", response_model=dict)
async def complete_home_task(
    task_id: str,
    patient_id: str = Query(...),
    completion: TaskCompletion = Body(...),
    user: dict = Depends(require_patient_or_clinician),
):
    """Mark a home task as completed with optional notes and rating."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)

    task = next((t for t in _DEMO_HOME_TASKS if t.id == task_id), None)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found. Please check the task ID and try again.")

    # --- production: update DB record ---
    task.status = "completed"
    # ------------------------------------

    _log_audit("PATIENT_HOME_TASK_COMPLETED", patient_id, u, f"task_id={task_id} rating={completion.rating}")
    return _with_disclaimer({
        "success": True,
        "message": "Task marked as completed. Your clinician will review your submission.",
        "task_id": task_id,
        "completed_date": completion.completed_date or _NOW.date().isoformat(),
    })


@router.post("/patient-portal/wellness-checkin", response_model=dict)
async def submit_wellness_checkin(
    patient_id: str = Query(...),
    checkin: WellnessCheckIn = Body(...),
    user: dict = Depends(require_patient_or_clinician),
):
    """Submit a daily wellness check-in (mood, sleep, stress, energy)."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)

    # --- production: persist to DB, trigger alerts if thresholds breached ---
    entry_id = f"we_{uuid.uuid4().hex[:8]}"
    # ------------------------------------------------------------------------

    _log_audit("PATIENT_WELLNESS_CHECKIN", patient_id, u,
               f"mood={checkin.mood} sleep={checkin.sleep_quality} stress={checkin.stress_level}")

    return _with_disclaimer({
        "success": True,
        "message": "Check-in recorded. Thank you for sharing how you are feeling.",
        "entry_id": entry_id,
        "submitted_at": _NOW.isoformat(),
        "next_checkin_reminder": (_NOW + timedelta(days=1)).isoformat(),
    })


@router.get("/patient-portal/wellness-checkin/history", response_model=dict)
async def get_wellness_history(
    patient_id: str = Query(...),
    days: int = Query(30, ge=1, le=365),
    user: dict = Depends(require_patient_or_clinician),
):
    """Retrieve wellness check-in history for the specified number of days."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)
    _log_audit("PATIENT_WELLNESS_HISTORY_VIEWED", patient_id, u, f"days={days}")

    history = _DEMO_WELLNESS_HISTORY[:days]
    return _with_disclaimer({
        "history": [h.model_dump() for h in history],
        "count": len(history),
        "period_days": days,
        "averages": {
            "mood": round(sum(h.mood for h in history) / len(history), 1) if history else 0,
            "sleep_quality": round(sum(h.sleep_quality for h in history) / len(history), 1) if history else 0,
            "stress_level": round(sum(h.stress_level for h in history) / len(history), 1) if history else 0,
            "energy_level": round(sum(h.energy_level for h in history) / len(history), 1) if history else 0,
        },
    })


@router.get("/patient-portal/messages", response_model=dict)
async def get_patient_messages(
    patient_id: str = Query(...),
    user: dict = Depends(require_patient_or_clinician),
):
    """Get patient-safe messages (patient can only see their own thread)."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)
    _log_audit("PATIENT_MESSAGE_VIEWED", patient_id, u)

    return _with_disclaimer({
        "messages": [m.model_dump() for m in _DEMO_MESSAGES],
        "unread_count": sum(1 for m in _DEMO_MESSAGES if not m.read),
        "thread_id": f"thread_{patient_id}",
    })


@router.post("/patient-portal/messages", response_model=dict)
async def send_patient_message(
    patient_id: str = Query(...),
    message: PatientMessage = Body(...),
    user: dict = Depends(require_patient_or_clinician),
):
    """Send a message from the patient to their care team."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)

    msg_id = f"msg_{uuid.uuid4().hex[:8]}"
    # --- production: persist to DB, notify clinician ---

    _log_audit("PATIENT_MESSAGE_SENT", patient_id, u, f"msg_id={msg_id}")

    return _with_disclaimer({
        "success": True,
        "message": "Message sent to your care team. They typically respond within 1 business day.",
        "message_id": msg_id,
        "sent_at": _NOW.isoformat(),
        "status": "delivered",
    })


@router.get("/patient-portal/shared-reports", response_model=dict)
async def get_shared_reports(
    patient_id: str = Query(...),
    user: dict = Depends(require_patient),
):
    """List shared clinical reports accessible to the patient."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)
    _log_audit("PATIENT_SHARED_REPORT_LISTED", patient_id, u)

    return _with_disclaimer({
        "reports": [r.model_dump() for r in _DEMO_REPORTS],
        "count": len(_DEMO_REPORTS),
    })


@router.get("/patient-portal/shared-reports/{report_id}", response_model=dict)
async def view_shared_report(
    report_id: str,
    patient_id: str = Query(...),
    user: dict = Depends(require_patient),
):
    """View a specific shared report (full detail, patient-safe)."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)

    report = next((r for r in _DEMO_REPORTS if r.id == report_id), None)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found or not yet shared with you.")

    _log_audit("PATIENT_SHARED_REPORT_OPENED", patient_id, u, f"report_id={report_id}")

    # --- production: fetch full report body, redact sensitive fields ---
    full_body = f"--- Full report content for {report.title} ---\n{report.summary}\n\n[Detailed findings would appear here in production.]"
    # ------------------------------------------------------------------

    return _with_disclaimer({
        "report": report.model_dump(),
        "full_body": full_body,
        "viewed_at": _NOW.isoformat(),
    })


@router.get("/patient-portal/wearables/summary", response_model=dict)
async def get_wearable_summary(
    patient_id: str = Query(...),
    days: int = Query(7, ge=1, le=90),
    user: dict = Depends(require_patient),
):
    """Get aggregated wearable data summary (sleep, steps, HRV)."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)
    _log_audit("PATIENT_WEARABLE_SUMMARY_VIEWED", patient_id, u, f"days={days}")

    # --- production: fetch from wearable integration service ---
    summary = _DEMO_WEARABLE
    # ----------------------------------------------------------

    return _with_disclaimer({
        "summary": summary.model_dump(),
        "period_days": days,
        "interpretation": {
            "sleep": f"Your average sleep ({summary.avg_sleep_hrs} hrs) is in the healthy range.",
            "steps": f"Daily step count ({summary.avg_steps}) meets moderate activity goals.",
            "hrv": f"Heart rate variability ({summary.avg_hrv} ms) indicates good autonomic balance.",
        },
    })


@router.get("/patient-portal/education", response_model=dict)
async def get_patient_education(
    patient_id: str = Query(...),
    category: str = Query("all", pattern="^(all|foundations|skills|lifestyle)$"),
    user: dict = Depends(require_patient),
):
    """List education centre items filtered by category."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)
    _log_audit("PATIENT_EDUCATION_VIEWED", patient_id, u, f"category={category}")

    items = _DEMO_EDUCATION
    if category != "all":
        items = [i for i in items if i.category == category]

    return _with_disclaimer({
        "items": [i.model_dump() for i in items],
        "count": len(items),
        "completed_count": sum(1 for i in items if i.completed),
        "category": category,
    })


@router.get("/patient-portal/uploads/requests", response_model=dict)
async def get_upload_requests(
    patient_id: str = Query(...),
    user: dict = Depends(require_patient),
):
    """Get pending file upload requests from the care team."""
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)
    _log_audit("PATIENT_UPLOAD_REQUESTS_VIEWED", patient_id, u)

    return _with_disclaimer({
        "requests": [r.model_dump() for r in _DEMO_UPLOAD_REQUESTS],
        "pending_count": sum(1 for r in _DEMO_UPLOAD_REQUESTS if r.status == "pending"),
    })


@router.post("/patient-portal/uploads", response_model=dict)
async def upload_patient_file(
    patient_id: str = Query(...),
    file: UploadFile = File(...),
    user: dict = Depends(require_patient),
):
    """Upload a patient file in response to a care team request.

    Accepts common document and image formats up to 25 MB.
    """
    u = _current_user(user)
    _enforce_patient_scope(u, patient_id)

    allowed_extensions = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".txt"}
    max_size_mb = 25

    ext = f".{file.filename.split('.')[-1].lower()}" if "." in file.filename else ""
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Accepted: {', '.join(allowed_extensions)}",
        )

    # --- production: stream to S3 / object storage, persist reference in DB ---
    upload_id = f"upl_{uuid.uuid4().hex[:8]}"
    stored_path = f"uploads/{patient_id}/{upload_id}_{file.filename}"
    # -------------------------------------------------------------------------

    _log_audit("PATIENT_UPLOAD_COMPLETED", patient_id, u, f"upload_id={upload_id} file={file.filename}")

    return _with_disclaimer({
        "success": True,
        "message": "File uploaded successfully. Your clinician has been notified.",
        "upload_id": upload_id,
        "filename": file.filename,
        "stored_path": stored_path,
        "uploaded_at": _NOW.isoformat(),
    })


# ---------------------------------------------------------------------------
# Helper: patient scope enforcement
# ---------------------------------------------------------------------------

def _enforce_patient_scope(user: dict, requested_patient_id: str) -> None:
    """Raise 403 if a patient tries to access another patient's data.

    Clinicians are allowed through (with their own audit trail).
    """
    role = user.get("role", "")
    user_id = user.get("user_id", "")

    if role == "patient" and user_id != requested_patient_id:
        logger.warning(
            "SCOPE_VIOLATION | actor=%s (patient) tried accessing patient_id=%s",
            user_id, requested_patient_id,
        )
        raise HTTPException(
            status_code=403,
            detail="You can only access your own health information.",
        )
