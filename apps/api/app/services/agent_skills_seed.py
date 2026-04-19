"""Default AgentSkill rows mirroring the bundled `CLINICIAN_SKILLS` constant in
`apps/web/src/pages-agents.js`.

Two consumers:

1. The 031_agent_skills alembic migration imports `DEFAULT_AGENT_SKILLS` and
   inserts every row on first upgrade so production databases ship with the
   existing UX preserved.

2. The FastAPI lifespan startup hook calls `seed_default_agent_skills(session)`
   so test runs (which use `Base.metadata.create_all`, not alembic) and any
   environment whose schema was created without alembic still get the same
   defaults. The seed is idempotent — it no-ops once the table has any rows.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import AgentSkill


DEFAULT_AGENT_SKILLS: tuple[dict, ...] = (
    # Communication
    {"id": "msg-patient",        "cat": "comms",    "icon": "\U0001f4ac", "label": "Message Patient",       "desc": "Draft and send a message to a patient",          "prompt": "I need to send a message to a patient. Help me draft a professional, caring message. Ask me which patient and what the message is about."},
    {"id": "call-patient",       "cat": "comms",    "icon": "\U0001f4de", "label": "Call Patient",          "desc": "Prepare talking points for a patient call",       "prompt": "I need to call a patient. Help me prepare talking points and key items to discuss. Ask me which patient and the purpose of the call."},
    {"id": "email-report",       "cat": "comms",    "icon": "\U0001f4e7", "label": "Email Report",          "desc": "Email a clinical report or summary",              "prompt": "I want to email a report or clinical summary. Help me draft the email with the key findings. Ask me which patient and what type of report."},
    {"id": "remind-patient",     "cat": "comms",    "icon": "\U0001f514", "label": "Send Reminder",         "desc": "Send appointment or homework reminder",           "prompt": "Draft an appointment reminder for a patient. Make it professional and reassuring. Ask me which patient and when their appointment is."},
    {"id": "tg-notify",          "cat": "comms",    "icon": "\u2708\ufe0f", "label": "Telegram Notify",     "desc": "Send a notification via Telegram",                "prompt": "I want to send a Telegram notification. What should I send and to whom? Help me compose the message."},
    # Clinical
    {"id": "check-report",       "cat": "clinical", "icon": "\U0001f4c4", "label": "Check Report",          "desc": "Review a patient report or assessment",           "prompt": "I need to review a patient report. Give me a summary of their latest assessment scores, treatment progress, and any flags. Ask me which patient."},
    {"id": "review-ae",          "cat": "clinical", "icon": "\u26a0\ufe0f", "label": "Review Adverse Event", "desc": "Document and assess an adverse event",           "prompt": "Help me document an adverse event. Walk me through the standard reporting process: what happened, severity, causality, and action taken. Ask me about the patient and event."},
    {"id": "protocol-rec",       "cat": "clinical", "icon": "\U0001f9e0", "label": "Protocol Advice",       "desc": "Get protocol recommendations",                    "prompt": "I need help choosing or adjusting a treatment protocol. Consider the evidence base, patient history, and best practices. Ask me about the patient and their condition."},
    {"id": "check-outcomes",     "cat": "clinical", "icon": "\U0001f4c8", "label": "Check Outcomes",        "desc": "Review patient outcome trends",                   "prompt": "Show me the outcome trends for a patient. Compare baseline to latest scores, calculate improvement percentage, and flag any concerns. Ask me which patient."},
    {"id": "session-prep",       "cat": "clinical", "icon": "\u26a1",     "label": "Prep Session",          "desc": "Prepare for the next treatment session",          "prompt": "Help me prepare for an upcoming treatment session. Review the patient history, last session notes, and any adjustments needed. Ask me which patient and session number."},
    # Administration
    {"id": "schedule-apt",       "cat": "admin",    "icon": "\U0001f4c5", "label": "Schedule Appointment",  "desc": "Schedule or reschedule an appointment",           "prompt": "I need to schedule an appointment. Help me find a suitable time and draft a confirmation. Ask me which patient, preferred time, and appointment type."},
    {"id": "check-queue",        "cat": "admin",    "icon": "\U0001f4cb", "label": "Check Review Queue",    "desc": "See what needs approval",                         "prompt": "What items are currently in my review queue? Summarise pending approvals, reviews, and any overdue items that need my attention."},
    {"id": "patient-intake",     "cat": "admin",    "icon": "\U0001f464", "label": "Patient Intake",        "desc": "Help with new patient onboarding",                "prompt": "I have a new patient to onboard. Walk me through the intake process: demographics, medical history, consent, and initial assessment scheduling. Ask me about the patient."},
    {"id": "daily-summary",      "cat": "admin",    "icon": "\u2600\ufe0f", "label": "Daily Summary",       "desc": "Get today's clinic overview",                     "prompt": "Give me a complete daily summary: how many patients today, pending reviews, any overdue tasks, adverse events to follow up on, and what I should prioritise."},
    {"id": "manage-tasks",       "cat": "admin",    "icon": "\u2705",     "label": "Manage Tasks",          "desc": "View and manage clinic tasks",                    "prompt": "Show me all my current tasks. Which are overdue? What should I tackle first? Help me prioritise and update statuses."},
    # Reports
    {"id": "gen-report",         "cat": "reports",  "icon": "\U0001f4dd", "label": "Generate Report",       "desc": "Generate a clinical or admin report",             "prompt": "I need to generate a report. What type? Options: treatment summary, outcome report, adverse event log, clinic utilisation, or patient progress. Ask me what I need."},
    {"id": "export-data",        "cat": "reports",  "icon": "\U0001f4e6", "label": "Export Data",           "desc": "Export clinical data for research",               "prompt": "I need to export clinical data. Help me select the right data domains, de-identification method, and export format. Walk me through the process."},
    {"id": "clinic-stats",       "cat": "reports",  "icon": "\U0001f4ca", "label": "Clinic Statistics",     "desc": "View clinic performance metrics",                 "prompt": "Give me the key clinic statistics: patient volume, treatment completion rates, average improvement scores, revenue trends, and any KPIs that need attention."},
    {"id": "compare-protocols",  "cat": "reports",  "icon": "\U0001f52c", "label": "Compare Protocols",     "desc": "Compare protocol effectiveness",                  "prompt": "Help me compare treatment protocols across my patient cohort. Which protocols have the best response rates? Any patterns by condition or demographics?"},
)


def _payload_for(default: dict) -> str:
    return json.dumps({"prompt": default["prompt"]}, ensure_ascii=False, separators=(",", ":"))


def default_agent_skill_rows() -> list[dict]:
    """Return seed rows shaped for `AgentSkill` (used by the alembic migration)."""
    now = datetime.now(timezone.utc)
    rows: list[dict] = []
    for index, default in enumerate(DEFAULT_AGENT_SKILLS):
        rows.append({
            "id": str(uuid.uuid4()),
            "category_id": default["cat"],
            "label": default["label"],
            "description": default["desc"],
            "icon": default["icon"],
            "run_payload_json": _payload_for(default),
            "enabled": True,
            "sort_order": index,
            "created_at": now,
            "updated_at": now,
        })
    return rows


def seed_default_agent_skills(session: Session) -> int:
    """Insert default rows when the table is empty. Returns rows inserted."""
    existing = session.scalar(select(AgentSkill.id).limit(1))
    if existing is not None:
        return 0
    for row in default_agent_skill_rows():
        session.add(AgentSkill(**row))
    session.commit()
    return len(DEFAULT_AGENT_SKILLS)
