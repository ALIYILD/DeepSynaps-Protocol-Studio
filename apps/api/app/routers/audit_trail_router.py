"""Audit Trail router (launch-audit 2026-04-30).

Endpoints
---------
GET    /api/v1/audit-trail                    List audit events (filters)
GET    /api/v1/audit-trail/summary            Counts: total / per surface / per day (30d)
GET    /api/v1/audit-trail/export.csv         Filter-aware CSV export
GET    /api/v1/audit-trail/export.ndjson      Filter-aware NDJSON export (regulator)
GET    /api/v1/audit-trail/{event_id}         Event detail

The events read here are the same `audit_events` rows written by the
qEEG Analyzer / Brain Map Planner / Session Runner / Adverse Events
launch audits via ``app.repositories.audit.create_audit_event``. Surface
attribution is preserved through ``target_type`` (e.g. ``adverse_events``,
``qeeg``, ``session_runner``, ``brain_map_planner``, ``audit_trail``) and
``action`` (e.g. ``adverse_events.create``, ``qeeg.export_csv``).

Role gate
---------
``clinician`` minimum. Admins see all clinics; clinicians see only events
that match their own ``actor_id`` (the audit table does not currently
carry ``clinic_id`` so we use actor-scoped rather than clinic-scoped
filtering — this is honest about the data we have today). Documented in
the response disclaimers.

Audit of the audit
------------------
The Audit Trail page itself logs ``audit_trail.viewed`` /
``audit_trail.export_csv`` / ``audit_trail.export_ndjson`` events through
the shared ``/api/v1/qeeg-analysis/audit-events`` ingestion endpoint, so
regulator review can see who looked at the trail and what they exported.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import logging as _logging
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AuditEventRecord
from app.registries.audit import AUDIT_DISCLAIMERS, AUDIT_EVENTS
from app.repositories.audit import seed_audit_events


_log = _logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/audit-trail", tags=["Audit Trail"])


# Surface whitelist mirrored from qeeg-analysis/audit-events ingestion +
# the umbrella ``audit_trail`` for self-events. Free-form values logged
# before this whitelist existed (e.g. legacy ``evidence`` / ``upload``)
# are still listed truthfully — we never silently rewrite history.
KNOWN_SURFACES = {
    "qeeg",
    "brain_map_planner",
    "session_runner",
    "adverse_events",
    # ``adverse_events_hub`` is the page-level surface for the Adverse
    # Events Hub launch audit (2026-05-01). Distinct from ``adverse_events``
    # which scopes per-record events (create / patch / review / escalate /
    # close / reopen). The Hub surface carries page-load audits, filter
    # changes, drill-in views from patient_profile / course_detail /
    # clinical_trials, and exports.
    "adverse_events_hub",
    "audit_trail",
    "reports",
    "documents",
    # ``documents_hub`` is the page-level surface for the Documents Hub
    # drill-in audit (2026-04-30 launch audit). Distinct from ``documents``
    # which scopes per-record events (sign / supersede / export.zip).
    "documents_hub",
    "quality_assurance",
    "irb_manager",
    "clinical_trials",
    # Course Detail emits drill-out URLs that target documents-hub; when the
    # documents-hub filter banner emits an audit event back-pointing to the
    # course, the drill-in tracker must accept ``course_detail`` as the
    # ``source_target_type`` rather than rewriting it. The course_detail
    # surface itself is recorded by ``app/routers/treatment_courses_router``.
    "course_detail",
    "patient_profile",
    # Onboarding Wizard launch-audit (2026-05-01). Page-level surface for
    # the first-run setup wizard: view, step_started, step_completed,
    # step_skipped, wizard_completed, wizard_abandoned, seed_demo, edit
    # demographics. Distinct from the funnel telemetry rows in
    # ``onboarding_events`` (which feed conversion analytics, not the
    # regulatory audit trail).
    "onboarding_wizard",
    # Symptom Journal launch-audit (2026-05-01). Patient-facing surface —
    # patient logs symptoms, optionally shares with care team. Events:
    # view, entry_logged, entry_edited, entry_deleted, entry_shared,
    # entry_shared_to_clinician (clinician-visible), export_csv, export_ndjson,
    # summary_viewed.
    "symptom_journal",
    # Wellness Hub launch-audit (2026-05-01). Second patient-facing surface —
    # patient logs multi-axis wellness check-ins (mood, energy, sleep,
    # anxiety, focus, pain), optionally shares with care team. Events:
    # view, checkin_logged, checkin_edited, checkin_deleted, checkin_shared,
    # checkin_shared_to_clinician (clinician-visible), export_csv,
    # export_ndjson, summary_viewed, cross_link_journal_clicked.
    "wellness_hub",
    # Patient Reports view-side launch-audit (2026-05-01). Third patient-facing
    # surface. Distinct from the clinician-side ``reports`` surface (which
    # tracks generation / sign / supersede / export). The patient_reports
    # surface tracks what the patient does AFTER a report is delivered:
    # list_viewed, summary_viewed, report_viewed, report_acknowledged
    # (and the clinician-visible mirror report_acknowledged_to_clinician),
    # report_share_back_requested, report_question_started, plus the
    # page-level events posted via /api/v1/reports/patient/audit-events
    # (filter_changed, report_opened, report_downloaded, etc).
    "patient_reports",
    # Patient Messages launch-audit (2026-05-01). Fourth patient-facing
    # surface. Tracks the patient inbox lifecycle: view, thread_opened,
    # message_read, message_sent, urgent_marked, urgent_unmarked,
    # urgent_flag_to_clinician (clinician-visible mirror),
    # attachment_clicked, clinician_reply_visible, thread_resolved,
    # plus the page-level events posted via
    # /api/v1/messages/audit-events (filter_changed, deep_link_followed,
    # demo_banner_shown, consent_banner_shown). The Patient Reports
    # ``start-question`` handler creates threads keyed
    # ``thread_id=report-{report_id}`` so the inbox can deep-link the
    # patient straight to the report-question thread.
    "patient_messages",
    # Patient Home Devices launch-audit (2026-05-01). Fifth patient-facing
    # surface. Higher regulatory weight: device session logs feed Course
    # Detail telemetry, AE Hub adverse-event detection, and signed
    # completion reports. Events: view, device_registered, device_decommissioned,
    # device_marked_faulty, session_logged, calibration_run, settings_changed,
    # export, plus the page-level events posted via
    # /api/v1/home-devices/audit-events (filter_changed, demo_banner_shown,
    # consent_banner_shown, deep_link_followed). The mark-faulty event also
    # emits a clinician-visible mirror audit row at HIGH priority because a
    # faulty home neuromodulation device is a clinical-safety signal that
    # must surface in the care-team feed without exposing PHI.
    "home_devices",
    # Patient Adherence Events launch-audit (2026-05-01). Sixth patient-facing
    # surface. Closes the home-therapy patient-side chain (register →
    # log session → adherence event → side-effect → escalate). Events:
    # view, summary_viewed, event_viewed, task_completed, task_skipped,
    # task_partial, side_effect_logged, escalated_to_clinician, export,
    # plus the page-level events posted via /api/v1/adherence/audit-events
    # (filter_changed, deep_link_followed, demo_banner_shown,
    # consent_banner_shown). Side-effects with severity >= 7 emit a
    # clinician-visible mirror at HIGH priority. Escalation creates an
    # AdverseEvent draft (status='reported') that surfaces in the AE Hub
    # so the regulatory chain stays intact end-to-end.
    "adherence_events",
    # Patient Home Program Tasks (Homework) launch-audit (2026-05-01).
    # Seventh patient-facing surface. Closes the home-therapy regulator
    # loop end-to-end: clinician assigns home-program tasks → patient
    # SEES tasks here → patient LOGS completion via Adherence Events
    # (#350) → side-effect with severity >= 7 escalates to AE Hub
    # (#342) → safety review in QA Hub (#321). Events: view, today_viewed,
    # upcoming_viewed, completed_viewed, summary_viewed, task_viewed,
    # task_started, task_started_to_clinician (clinician-visible mirror),
    # task_completed_via_adherence, task_skipped_via_adherence,
    # task_help_requested, task_help_urgent_to_clinician (HIGH-priority
    # clinician-visible mirror), export, plus the page-level events
    # posted via /api/v1/home-program-tasks/patient/audit-events
    # (filter_changed, deep_link_followed, demo_banner_shown,
    # consent_banner_shown). Help-request creates a Message thread keyed
    # ``thread_id="task-{task_id}"`` so the inbox deep-links straight to
    # the help-request thread (mirror of the report-question pattern from
    # #346/#347). Task completion is NOT logged on this surface — the
    # "Log now" CTA deep-links the patient into the Adherence Events
    # surface so completion stays in a single source of truth.
    "home_program_tasks",
    # Patient Wearables launch-audit (2026-05-01). EIGHTH and final
    # patient-facing surface. Closes the patient-side data-coverage
    # story by adding the audit chain, consent-revoked write gate,
    # IDOR regression and DEMO honesty layer that every other patient
    # surface enforces. Wearable observations already feed Course Detail
    # telemetry, AE Hub detection, and Outcome Series — this surface
    # records what the PATIENT does on the wearables page (view,
    # devices_viewed, summary_viewed, device_viewed, observations_viewed,
    # wearable_connected, wearable_disconnected,
    # wearable_disconnected_to_clinician (clinician-visible mirror),
    # sync_triggered, observation_anomaly_to_clinician (HIGH-priority
    # clinician-visible mirror when HR > 180 / HR < 30 / SpO2 < 88
    # samples are ingested via patient-initiated sync), export, plus the
    # page-level events posted via /api/v1/patient-wearables/audit-events
    # (filter_changed, deep_link_followed, demo_banner_shown,
    # consent_banner_shown). Anomaly escalation creates an AdverseEvent
    # draft (status='reported') that surfaces in the AE Hub so the
    # regulatory chain stays intact end-to-end (mirrors the Adherence
    # Events #350 escalation pattern).
    "wearables",
    # Clinician Wearables Triage Workbench launch-audit (2026-05-01).
    # Bidirectional counterpart to the patient-facing ``wearables`` surface
    # added in #352. The patient surface records what the PATIENT does on the
    # Wearables page (sync, disconnect, anomaly escalations); the
    # ``wearables_workbench`` surface records what the CLINICIAN does on the
    # triage queue: view, filter_changed, flag_viewed, flag_acknowledged,
    # flag_escalated (HIGH-priority — creates AdverseEvent draft visible
    # across the clinic), flag_resolved, export, deep_link_followed,
    # demo_banner_shown. The escalate flow mirrors the regulatory chain
    # already used by Adherence Events #350 → AE Hub #342, so a wearable
    # alert flagged by the deterministic ``wearable_flags`` rule engine OR
    # by the patient-side anomaly path can graduate into an AdverseEvent
    # without dropping audit continuity. Resolved flags are immutable —
    # any subsequent state change attempts return 409 so the regulator
    # sees a clean ack → escalate (optional) → resolve transcript per row.
    "wearables_workbench",
    # Population Analytics launch-audit (2026-05-01). Clinician-facing
    # cohort hub. Closes the regulator chain on the population /
    # aggregate-stats side after Patient Profile (#338) closed it on the
    # per-patient side. Events: view, cohort_filter_changed,
    # chart_drilled_out, export_csv, export_ndjson, plus the page-level
    # events posted via /api/v1/population-analytics/audit-events. All
    # numbers on the page trace to a real SQL aggregate over patients /
    # treatment_courses / outcome_series / adverse_events — no AI
    # fabrication; PHI is not exposed in cohort previews.
    "population_analytics",
    # Clinician Inbox / Notifications Hub launch-audit (2026-05-01). Top-of-day
    # workflow surface that aggregates the HIGH-priority clinician-visible
    # mirror audit rows emitted by every patient-facing launch audit
    # (Patient Messages #347, Adherence Events #350, Home Program Tasks #351,
    # Patient Wearables #352, Wearables Workbench #353). Events: view,
    # items_listed, summary_viewed, item_opened, item_acknowledged,
    # item_drilled_out, bulk_acknowledged, export, filter_changed,
    # polling_tick. The Inbox does not write new clinical data; it reads
    # audit_events and stores acknowledgements as their own audit rows so
    # the regulator audit transcript stays single-sourced.
    "clinician_inbox",
    # Care Team Coverage / Staff Scheduling launch-audit (2026-05-01).
    # Owns the on-call schedule + per-surface SLA + escalation chain that
    # turn Clinician Inbox HIGH-priority predicate breaches into a real
    # human page. Events: view, roster_viewed, roster_edited,
    # sla_config_viewed, sla_edited, chain_viewed, chain_edited,
    # oncall_viewed, sla_breaches_viewed, manual_page_fired,
    # auto_page_fired. The page-on-call action itself is recorded under
    # the existing ``clinician_inbox`` surface as
    # ``inbox.item_paged_to_oncall`` so the Inbox audit transcript stays
    # the single source of truth for "an item was paged".
    "care_team_coverage",
    # Clinician Adherence Hub launch-audit (2026-05-01). Bidirectional
    # counterpart to the patient-facing ``adherence_events`` surface added
    # in #350. The patient surface records what the PATIENT does on the
    # adherence page (log, side-effect, escalate-to-clinician); the
    # ``clinician_adherence_hub`` surface records what the CLINICIAN does
    # on the cross-patient triage queue: view, events_listed, summary_viewed,
    # event_viewed, event_acknowledged, event_escalated (HIGH-priority —
    # creates AdverseEvent draft visible across the clinic), event_resolved,
    # bulk_acknowledged, export, deep_link_followed, demo_banner_shown.
    # The escalate flow mirrors the regulatory chain already used by
    # Wearables Workbench #353 → AE Hub #342, so an adherence event that a
    # clinician deems clinically meaningful can graduate into an
    # AdverseEvent without dropping audit continuity. Resolved events are
    # immutable — any subsequent state change attempts return 409 so the
    # regulator sees a clean ack → escalate (optional) → resolve transcript
    # per row.
    "clinician_adherence_hub",
    # Clinician Wellness Hub launch-audit (2026-05-01). Bidirectional
    # counterpart to the patient-facing ``wellness_hub`` surface added in
    # #345. The patient surface records what the PATIENT does on the
    # wellness page (log check-in, share, soft-delete); the
    # ``clinician_wellness_hub`` surface records what the CLINICIAN does
    # on the cross-patient triage queue: view, checkins_listed,
    # summary_viewed, checkin_viewed, checkin_acknowledged,
    # checkin_escalated (HIGH-priority — creates AdverseEvent draft visible
    # across the clinic), checkin_resolved, bulk_acknowledged, export,
    # deep_link_followed, demo_banner_shown. The escalate flow mirrors the
    # regulatory chain already used by Clinician Adherence Hub #361 → AE
    # Hub #342, so a wellness check-in flagged by the deterministic
    # severity-band rule (anxiety/pain >= 7 OR mood <= 3) can graduate
    # into an AdverseEvent without dropping audit continuity. Resolved
    # check-ins are immutable — any subsequent state change attempts
    # return 409 so the regulator sees a clean ack → escalate (optional)
    # → resolve transcript per row.
    "clinician_wellness_hub",
    # Clinician Notifications Pulse / Daily Digest launch-audit (2026-05-01).
    # End-of-shift summary across the four clinician hubs (Inbox #354,
    # Wearables Workbench #353, Adherence Hub #361, Wellness Hub #365)
    # plus AE Hub #342 escalations. Page-level surface that records
    # what the on-call clinician did with the digest: view,
    # summary_viewed, sections_viewed, events_listed, filter_changed,
    # date_range_changed, drill_out, email_initiated, email_sent,
    # colleague_share_initiated, colleague_shared, export,
    # demo_banner_shown. Email + colleague-share record a regulator-
    # credible audit row even though SMTP / Slack / pager wire-up is
    # documented as out-of-scope (delivery_status='queued') — the audit
    # row is enough to prove intent, recipient, and headline counts.
    "clinician_digest",
    # Auto-Page Worker launch-audit (2026-05-01). Closes the real-time
    # half of the Care Team Coverage launch loop (#357). Background
    # worker scans SLA breaches every 60s and fires the same
    # page-oncall handler the manual button uses (in-process, not HTTP
    # roundtrip). Page-level events recorded here: view, polling_tick,
    # status_viewed, start_clicked, stop_clicked, tick_once_clicked,
    # filter_changed, demo_banner_shown. The auto-fired page itself is
    # recorded as ``inbox.item_paged_to_oncall`` under the existing
    # ``clinician_inbox`` whitelist entry (single-sourced with the
    # manual page-on-call so the regulator transcript stays consistent).
    # Each cron tick also emits ONE ``auto_page_worker.tick`` row with
    # note encoding clinics_scanned/breaches_found/paged/skipped_cooldown/
    # errors/elapsed_ms so ops gets a per-tick transcript without
    # scanning oncall_pages. delivery_status='queued' until a real
    # Slack/Twilio/PagerDuty adapter is wired (PR section F).
    "auto_page_worker",
    # On-Call Delivery launch-audit (2026-05-01). Closes the LAST gap in
    # the on-call escalation chain (Care Team Coverage #357 → Auto-Page
    # Worker #372 → THIS surface). Records each adapter dispatch attempt
    # under target_type='oncall_delivery' so regulators see a per-attempt
    # transcript: which adapter (slack|twilio|pagerduty), what status
    # (sent|failed|queued|mock), the provider-side message id (Slack ts,
    # Twilio SID, PagerDuty dedup_key), and any failure reason. The page
    # row itself is still recorded under ``clinician_inbox`` as
    # ``inbox.item_paged_to_oncall`` (single-sourced); this surface is
    # ONLY for the per-adapter delivery telemetry. Events: dispatch,
    # adapter_test, adapter_failed, mock_send.
    "oncall_delivery",
    # Escalation Policy Editor launch-audit (2026-05-01). Closes the LAST
    # operational gap of the on-call escalation chain (#357 → #372 →
    # #373 → THIS PR). Records every admin edit to the per-clinic
    # dispatch order, per-surface override matrix, and per-user contact
    # mapping (Slack / PagerDuty / Twilio). Events: view,
    # dispatch_order_viewed, dispatch_order_changed,
    # surface_overrides_viewed, override_changed, user_mappings_viewed,
    # user_mapping_changed, policy_tested. Each row carries the policy
    # version so reviewers can correlate a delivery attempt with the
    # exact policy that was active at the time.
    "escalation_policy",
    # Patient On-Call Visibility launch-audit (2026-05-01). Patient-facing
    # surface — read-only "Care team contact" card on the Patient Profile
    # that shows abstract on-call state (coverage_hours, in_hours_now,
    # urgent_path) WITHOUT exposing any PHI of the on-call clinician
    # (no name, phone, Slack handle, or PagerDuty user-id). Events: view,
    # oncall_status_seen, urgent_message_started, learn_more_clicked,
    # demo_banner_shown. Closes the patient-side complement to the
    # admin-side Escalation Policy editor (#374) — admins control the
    # dispatch order, patients see WHEN they will reach a clinician and
    # HOW to escalate without ever seeing the clinician's identity.
    "patient_oncall_visibility",
    # Patient Digest launch-audit (2026-05-01). Patient-side mirror of the
    # Clinician Digest (#366). Daily/weekly self-summary the patient sees
    # on demand: sessions completed, adherence streak, wellness trends,
    # pending messages, recent reports. Scoped to actor.patient_id; NO PHI
    # of OTHER patients leaks. Events: view, summary_viewed,
    # sections_viewed, date_range_changed, section_drill_out,
    # email_initiated, email_sent, caregiver_share_initiated,
    # caregiver_shared, export, demo_banner_shown.
    "patient_digest",
}


# Honest disclaimers always rendered on the page so reviewers know the
# regulatory ceiling of this view.
AUDIT_TRAIL_PAGE_DISCLAIMERS = [
    "Audit trail records clinical actions for regulatory review.",
    "Events are immutable; redactions require admin sign-off and create their own audit event.",
    "Demo events are not regulator-submittable.",
]


# ── Schemas ─────────────────────────────────────────────────────────────────


class AuditEventOut(BaseModel):
    event_id: str
    target_id: str
    target_type: str
    action: str
    role: str
    actor_id: str
    note: str
    created_at: str
    surface: str
    event_type: str
    is_demo: bool = False
    payload_hash: Optional[str] = None


class AuditTrailListResponse(BaseModel):
    items: list[AuditEventOut] = Field(default_factory=list)
    total: int
    limit: int
    offset: int
    disclaimers: list[str] = Field(default_factory=lambda: list(AUDIT_TRAIL_PAGE_DISCLAIMERS))


class AuditTrailSummaryResponse(BaseModel):
    total: int
    by_surface: dict[str, int] = Field(default_factory=dict)
    by_day_30d: list[dict[str, int | str]] = Field(default_factory=list)
    sae_related: int = 0
    regulatory_flagged: int = 0
    disclaimers: list[str] = Field(default_factory=lambda: list(AUDIT_TRAIL_PAGE_DISCLAIMERS))


# ── Helpers ─────────────────────────────────────────────────────────────────


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Accept bare date or full ISO.
        if "T" not in s:
            return datetime.fromisoformat(s + "T00:00:00+00:00")
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _split_surface(record: AuditEventRecord) -> tuple[str, str]:
    """Return ``(surface, event_type)`` derived from the audit row.

    Modern rows use ``target_type`` for the surface and ``action`` of the
    form ``surface.event``. Legacy rows (e.g. ``target_type='evidence'``,
    ``action='reviewed'``) fall back to the action verb as the event_type
    and the target_type as the surface.
    """
    surface = (record.target_type or "").strip() or "unknown"
    action = (record.action or "").strip() or "unknown"
    if "." in action:
        prefix, _, suffix = action.partition(".")
        if prefix:
            surface = prefix
        return surface, suffix or action
    return surface, action


def _is_demo_row(record: AuditEventRecord) -> bool:
    note = (record.note or "").upper()
    return note.startswith("DEMO") or "; DEMO" in note


def _payload_hash(record: AuditEventRecord) -> str:
    raw = "|".join(
        [
            record.event_id or "",
            record.target_id or "",
            record.target_type or "",
            record.action or "",
            record.role or "",
            record.actor_id or "",
            record.note or "",
            record.created_at or "",
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]


def _to_out(record: AuditEventRecord) -> AuditEventOut:
    surface, event_type = _split_surface(record)
    return AuditEventOut(
        event_id=record.event_id,
        target_id=record.target_id or "",
        target_type=record.target_type or "",
        action=record.action or "",
        role=record.role or "",
        actor_id=record.actor_id or "",
        note=record.note or "",
        created_at=record.created_at or "",
        surface=surface,
        event_type=event_type,
        is_demo=_is_demo_row(record),
        payload_hash=_payload_hash(record),
    )


def _gate_role(actor: AuthenticatedActor) -> None:
    """Allow clinician+ (clinician, admin, plus reviewer/technician/patient if they
    somehow reach here — no, only clinician minimum). Cross-clinic isolation
    is enforced in :func:`_apply_scope`.
    """
    require_minimum_role(
        actor,
        "clinician",
        warnings=[
            "Audit trail visibility is restricted to clinical staff and admins.",
        ],
    )


def _apply_scope(q, actor: AuthenticatedActor):
    """Cross-clinic ownership guard.

    The ``audit_events`` table does not (yet) have a ``clinic_id`` column,
    so the strongest honest scoping we can apply is "actor sees only their
    own events". Admins keep full visibility.
    """
    if actor.role == "admin":
        return q
    return q.filter(AuditEventRecord.actor_id == actor.actor_id)


def _apply_filters(
    q,
    *,
    surface: Optional[str],
    event_type: Optional[str],
    actor_id: Optional[str],
    target_type: Optional[str],
    target_id: Optional[str],
    since: Optional[str],
    until: Optional[str],
    q_text: Optional[str],
):
    if surface:
        s = surface.strip().lower()
        # Surface is encoded both ways: target_type==surface (modern) or
        # action LIKE 'surface.%' (any case). Match both.
        q = q.filter(
            or_(
                AuditEventRecord.target_type == s,
                AuditEventRecord.action.like(f"{s}.%"),
            )
        )
    if event_type:
        et = event_type.strip().lower()
        q = q.filter(
            or_(
                AuditEventRecord.action == et,
                AuditEventRecord.action.like(f"%.{et}"),
            )
        )
    if actor_id:
        q = q.filter(AuditEventRecord.actor_id == actor_id)
    if target_type:
        q = q.filter(AuditEventRecord.target_type == target_type)
    if target_id:
        q = q.filter(AuditEventRecord.target_id == target_id)
    if since:
        # ``created_at`` is stored as a string ISO timestamp. Lexicographic
        # comparison is correct for ISO-8601 with the same offset.
        q = q.filter(AuditEventRecord.created_at >= since)
    if until:
        # Inclusive day end if a bare date was passed.
        upper = until + "T23:59:59" if "T" not in until else until
        q = q.filter(AuditEventRecord.created_at <= upper)
    if q_text:
        like = f"%{q_text.strip()}%"
        q = q.filter(
            or_(
                AuditEventRecord.actor_id.like(like),
                AuditEventRecord.target_id.like(like),
                AuditEventRecord.note.like(like),
                AuditEventRecord.action.like(like),
            )
        )
    return q


def _self_audit(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    target_id: str,
    note: str,
) -> None:
    """Best-effort self-audit. Audit-of-the-audit must not block reads."""
    try:
        from app.repositories.audit import create_audit_event

        now = datetime.now(timezone.utc)
        event_id = (
            f"audit_trail-{event}-{actor.actor_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
        )
        create_audit_event(
            db,
            event_id=event_id,
            target_id=str(target_id) or actor.actor_id,
            target_type="audit_trail",
            action=f"audit_trail.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=(note or event)[:1024],
            created_at=now.isoformat(),
        )
    except Exception:  # pragma: no cover — audit must never block UI
        _log.debug("Audit-trail self-audit skipped", exc_info=True)


# ── GET / ───────────────────────────────────────────────────────────────────


@router.get("", response_model=AuditTrailListResponse)
def list_audit_trail(
    surface: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    actor_id: Optional[str] = Query(default=None),
    target_type: Optional[str] = Query(default=None),
    target_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditTrailListResponse:
    _gate_role(actor)

    # Seed the canonical demo events the existing get_audit_trail used to
    # surface. Idempotent thanks to seed_audit_events' early-return.
    try:
        seed_audit_events(db, AUDIT_EVENTS)
    except Exception:  # pragma: no cover
        _log.debug("audit-trail seed skipped", exc_info=True)

    base = _apply_scope(db.query(AuditEventRecord), actor)
    filtered = _apply_filters(
        base,
        surface=surface,
        event_type=event_type,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        since=since,
        until=until,
        q_text=q,
    )
    total = filtered.count()
    rows = (
        filtered.order_by(AuditEventRecord.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    _self_audit(
        db,
        actor,
        event="viewed",
        target_id="list",
        note=(
            f"surface={surface or '-'} q={(q or '-')[:80]} "
            f"limit={limit} offset={offset} total={total}"
        ),
    )

    return AuditTrailListResponse(
        items=[_to_out(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


# ── GET /summary ────────────────────────────────────────────────────────────


@router.get("/summary", response_model=AuditTrailSummaryResponse)
def audit_trail_summary(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditTrailSummaryResponse:
    _gate_role(actor)

    try:
        seed_audit_events(db, AUDIT_EVENTS)
    except Exception:  # pragma: no cover
        _log.debug("audit-trail seed skipped", exc_info=True)

    rows = _apply_scope(db.query(AuditEventRecord), actor).all()
    total = len(rows)

    by_surface: Counter[str] = Counter()
    sae_related = 0
    regulatory_flagged = 0
    by_day: Counter[str] = Counter()

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    for r in rows:
        surface, event_type = _split_surface(r)
        by_surface[surface] += 1
        # Cheap heuristics — honest because they read off real action /
        # target_type, never invented.
        if surface == "adverse_events" or "sae" in (r.note or "").lower():
            sae_related += 1
        action_lc = (r.action or "").lower()
        note_lc = (r.note or "").lower()
        if (
            event_type in ("escalate", "report", "regulator", "sign_off")
            or "irb" in note_lc
            or "regulator" in note_lc
            or "sign" in action_lc
        ):
            regulatory_flagged += 1
        # By-day rollup (last 30d).
        ts = _parse_iso(r.created_at)
        if ts is not None and ts >= cutoff:
            by_day[ts.date().isoformat()] += 1

    by_day_30d = [
        {"date": d, "count": c}
        for d, c in sorted(by_day.items())
    ]

    return AuditTrailSummaryResponse(
        total=total,
        by_surface=dict(by_surface),
        by_day_30d=by_day_30d,
        sae_related=sae_related,
        regulatory_flagged=regulatory_flagged,
    )


# ── GET /export.csv ─────────────────────────────────────────────────────────


CSV_COLUMNS = [
    "event_id",
    "created_at",
    "surface",
    "event_type",
    "actor_id",
    "role",
    "target_type",
    "target_id",
    "note",
    "is_demo",
    "payload_hash",
]


@router.get("/export.csv")
def export_audit_trail_csv(
    surface: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    actor_id: Optional[str] = Query(default=None),
    target_type: Optional[str] = Query(default=None),
    target_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_role(actor)

    base = _apply_scope(db.query(AuditEventRecord), actor)
    filtered = _apply_filters(
        base,
        surface=surface,
        event_type=event_type,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        since=since,
        until=until,
        q_text=q,
    )
    rows = filtered.order_by(AuditEventRecord.id.desc()).limit(10_000).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_COLUMNS)
    for r in rows:
        out = _to_out(r)
        writer.writerow(
            [
                out.event_id,
                out.created_at,
                out.surface,
                out.event_type,
                out.actor_id,
                out.role,
                out.target_type,
                out.target_id,
                (out.note or "").replace("\n", " ").replace("\r", " "),
                int(out.is_demo),
                out.payload_hash or "",
            ]
        )

    _self_audit(
        db,
        actor,
        event="export_csv",
        target_id=surface or "all",
        note=f"rows={len(rows)} surface={surface or '-'} q={(q or '-')[:80]}",
    )

    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=audit_trail.csv",
            "Cache-Control": "no-store",
            "X-Audit-Demo-Rows": str(sum(1 for r in rows if _is_demo_row(r))),
        },
    )


# ── GET /export.ndjson ──────────────────────────────────────────────────────


@router.get("/export.ndjson")
def export_audit_trail_ndjson(
    surface: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    actor_id: Optional[str] = Query(default=None),
    target_type: Optional[str] = Query(default=None),
    target_id: Optional[str] = Query(default=None),
    since: Optional[str] = Query(default=None),
    until: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    _gate_role(actor)

    base = _apply_scope(db.query(AuditEventRecord), actor)
    filtered = _apply_filters(
        base,
        surface=surface,
        event_type=event_type,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        since=since,
        until=until,
        q_text=q,
    )
    rows = filtered.order_by(AuditEventRecord.id.desc()).limit(10_000).all()

    lines = []
    demo_rows = 0
    for r in rows:
        out = _to_out(r)
        if out.is_demo:
            demo_rows += 1
        lines.append(json.dumps(out.model_dump(), separators=(",", ":")))
    body = "\n".join(lines) + ("\n" if lines else "")

    _self_audit(
        db,
        actor,
        event="export_ndjson",
        target_id=surface or "all",
        note=f"rows={len(rows)} surface={surface or '-'} q={(q or '-')[:80]}",
    )

    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": "attachment; filename=audit_trail.ndjson",
            "Cache-Control": "no-store",
            "X-Audit-Demo-Rows": str(demo_rows),
        },
    )


# ── GET /{event_id} ─────────────────────────────────────────────────────────


@router.get("/{event_id}", response_model=AuditEventOut)
def get_audit_trail_event(
    event_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> AuditEventOut:
    _gate_role(actor)

    record = (
        _apply_scope(db.query(AuditEventRecord), actor)
        .filter(AuditEventRecord.event_id == event_id)
        .one_or_none()
    )
    if record is None:
        raise ApiServiceError(
            code="audit_event_not_found",
            message="Audit event not found or not visible at your role.",
            warnings=["Cross-clinic events are hidden from non-admin roles."],
            status_code=404,
        )
    _self_audit(
        db,
        actor,
        event="event_viewed",
        target_id=record.event_id,
        note=f"target_type={record.target_type or '-'} action={record.action or '-'}",
    )
    return _to_out(record)
