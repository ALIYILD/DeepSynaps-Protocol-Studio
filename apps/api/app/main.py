import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.limiter import limiter
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from deepsynaps_core_schema import (
    BrainRegionListResponse,
    CaseSummaryRequest,
    CaseSummaryResponse,
    DeviceListResponse,
    ErrorResponse,
    EvidenceListResponse,
    HandbookGenerateRequest,
    HandbookGenerateResponse,
    IntakePreviewRequest,
    IntakePreviewResponse,
    ProtocolDraftRequest,
    ProtocolDraftResponse,
    QEEGBiomarkerListResponse,
    QEEGConditionMapListResponse,
    ReviewActionRequest,
    ReviewActionResponse,
)

from app.auth import AuthenticatedActor, get_authenticated_actor
from app.database import SessionLocal, get_db_session, init_database
from app.errors import ApiServiceError
from app.logging_setup import configure_logging, get_logger
from app.repositories.clinical import get_latest_snapshot
from app.routers.auth_router import router as auth_router
from app.routers.assessments_router import router as assessments_router
from app.routers.chat_router import router as chat_router
from app.routers.registries_router import router as registries_router
from app.routers.telegram_router import router as telegram_router
from app.routers.export_router import router as export_router
from app.routers.personalization_router import router as personalization_router
from app.routers.patients_router import router as patients_router
from app.routers.payments_router import router as payments_router
from app.routers.agent_billing_router import router as agent_billing_router
from app.routers.finance_router import router as finance_router
from app.routers.sessions_router import router as sessions_router
from app.routers.treatment_courses_router import router as treatment_courses_router
from app.routers.treatment_courses_router import review_router as review_queue_router
from app.routers.adverse_events_router import router as adverse_events_router
from app.routers.population_analytics_router import router as population_analytics_router
from app.routers.outcomes_router import router as outcomes_router
from app.routers.qeeg_records_router import router as qeeg_records_router
from app.routers.phenotype_router import router as phenotype_router
from app.routers.consent_router import router as consent_router
from app.routers.patient_portal_router import router as patient_portal_router
from app.routers.notifications_router import router as notifications_router
from app.routers.wearable_router import router as wearable_router
from app.routers.patient_wearables_router import router as patient_wearables_router
from app.routers.wearables_workbench_router import router as wearables_workbench_router
from app.routers.clinician_inbox_router import router as clinician_inbox_router
from app.routers.care_team_coverage_router import router as care_team_coverage_router
from app.routers.media_router import router as media_router
from app.routers.home_devices_router import router as home_devices_router
from app.routers.home_device_portal_router import router as home_device_portal_router
from app.routers.marketplace_router import router as marketplace_router
from app.routers.marketplace_seller_router import router as marketplace_seller_router
from app.routers.virtual_care_router import router as virtual_care_router
from app.routers.forms_router import router as forms_router
from app.routers.medications_router import router as medications_router
from app.routers.consent_management_router import router as consent_management_router
from app.routers.home_program_tasks_router import router as home_program_tasks_router
from app.routers.patient_home_program_tasks_router import (
    router as patient_home_program_tasks_router,
)
from app.routers.home_task_templates_router import router as home_task_templates_router
from app.routers.agent_skills_router import router as agent_skills_router
from app.routers.annotations_router import router as annotations_router
from app.routers.reminders_router import router as reminders_router
from app.routers.irb_router import router as irb_router
from app.routers.irb_manager_router import router as irb_manager_router
from app.routers.irb_amendment_workflow_router import (
    router as irb_amendment_workflow_router,
)
from app.routers.irb_amendment_reviewer_workload_router import (
    router as irb_amendment_reviewer_workload_router,
)
from app.routers.evidence_router import router as evidence_router
from app.routers.literature_router import router as literature_router
from app.routers.literature_watch_router import router as literature_watch_router
from app.routers.library_router import router as library_router
from app.routers.reports_router import router as reports_router
from app.routers.documents_router import router as documents_router
from app.routers.documents_router import patient_docs_router
from app.routers.recordings_router import router as recordings_router
from app.routers.protocols_saved_router import router as protocols_saved_router
from app.routers.protocols_generate_router import router as protocols_generate_router
from app.routers.leads_reception_router import router as leads_reception_router
from app.routers.onboarding_router import router as onboarding_router
from app.routers.symptom_journal_router import router as symptom_journal_router
from app.routers.wellness_hub_router import router as wellness_hub_router
from app.routers.patient_messages_router import router as patient_messages_router
from app.routers.home_devices_patient_router import router as home_devices_patient_router
from app.routers.adherence_events_router import router as adherence_events_router
from app.routers.clinician_adherence_router import router as clinician_adherence_router
from app.routers.clinician_wellness_router import router as clinician_wellness_router
from app.routers.clinician_digest_router import router as clinician_digest_router
from app.routers.auto_page_worker_router import router as auto_page_worker_router
from app.routers.escalation_policy_router import router as escalation_policy_router
from app.routers.patient_oncall_router import router as patient_oncall_router
from app.routers.patient_digest_router import router as patient_digest_router
from app.routers.caregiver_consent_router import router as caregiver_consent_router
from app.routers.caregiver_email_digest_router import router as caregiver_email_digest_router
from app.routers.channel_misconfiguration_detector_router import (
    router as channel_misconfiguration_detector_router,
)
from app.routers.channel_auth_health_probe_router import (
    router as channel_auth_health_probe_router,
)
from app.routers.channel_auth_drift_resolution_router import (
    router as channel_auth_drift_resolution_router,
)
from app.routers.channel_auth_drift_resolution_audit_hub_router import (
    router as channel_auth_drift_resolution_audit_hub_router,
)
from app.routers.auth_drift_rotation_policy_advisor_router import (
    router as auth_drift_rotation_policy_advisor_router,
)
from app.routers.rotation_policy_advisor_threshold_tuning_router import (
    router as rotation_policy_advisor_threshold_tuning_router,
)
from app.routers.rotation_policy_advisor_outcome_tracker_router import (
    router as rotation_policy_advisor_outcome_tracker_router,
)
from app.routers.rotation_policy_advisor_threshold_adoption_outcome_tracker_router import (
    router as rotation_policy_advisor_threshold_adoption_outcome_tracker_router,
)
from app.routers.caregiver_delivery_concern_aggregator_router import (
    router as caregiver_delivery_concern_aggregator_router,
)
from app.routers.caregiver_delivery_concern_resolution_router import (
    router as caregiver_delivery_concern_resolution_router,
)
from app.routers.caregiver_delivery_concern_resolution_audit_hub_router import (
    router as caregiver_delivery_concern_resolution_audit_hub_router,
)
from app.routers.caregiver_delivery_concern_resolution_outcome_tracker_router import (
    router as caregiver_delivery_concern_resolution_outcome_tracker_router,
)
from app.routers.resolver_coaching_inbox_router import (
    router as resolver_coaching_inbox_router,
)
from app.routers.resolver_coaching_self_review_digest_router import (
    router as resolver_coaching_self_review_digest_router,
)
from app.routers.resolver_coaching_digest_audit_hub_router import (
    router as resolver_coaching_digest_audit_hub_router,
)
from app.routers.coaching_digest_delivery_failure_drilldown_router import (
    router as coaching_digest_delivery_failure_drilldown_router,
)
from app.routers.audit_trail_router import router as audit_trail_router
# Settings API routers (foundation scaffolded by backend subagent #1; endpoints
# fleshed out by backend subagents #3–#6). See apps/api/SETTINGS_API_DESIGN.md.
from app.routers.profile_router import router as profile_router
from app.routers.clinic_router import router as clinic_router
from app.routers.team_router import router as team_router
from app.routers.preferences_router import router as preferences_router
from app.routers.data_privacy_router import router as data_privacy_router
from app.routers.risk_stratification_router import router as risk_stratification_router
from app.routers.movement_analyzer_router import router as movement_analyzer_router
from app.routers.qeeg_analysis_router import router as qeeg_analysis_router
from app.routers.qeeg_live_router import router as qeeg_live_router
from app.routers.qeeg_copilot_router import router as qeeg_copilot_router
from app.routers.qeeg_viz_router import router as qeeg_viz_router
from app.routers.mri_analysis_router import router as mri_analysis_router
from app.routers.audio_analysis_router import router as audio_analysis_router
from app.routers.fusion_router import router as fusion_router
from app.routers.patient_summary_router import router as patient_summary_router
from app.routers.patient_timeline_router import router as patient_timeline_router
from app.routers.clinical_text_router import router as clinical_text_router
from app.routers.agents_router import router as agents_router
from app.routers.agent_admin_router import router as agent_admin_router
from app.routers.admin_pgvector_router import router as admin_pgvector_router
from app.routers.fusion_router import router as fusion_router
from app.routers.monitor_router import router as monitor_router
from app.routers.deeptwin_router import brain_twin_router, router as deeptwin_router
from app.routers.feature_store_router import router as feature_store_router
from app.routers.citation_validator_router import router as citation_validator_router
from app.routers.command_center_router import router as command_center_router
from app.routers.dashboard_router import router as dashboard_router
from app.routers.schedules_router import router as schedules_router
from app.routers.device_sync_router import router as device_sync_router
try:
    from app.routers.qa_router import router as qa_router
    _HAS_QA_ROUTER = True
except ImportError as _qa_imp_err:
    qa_router = None  # type: ignore[assignment]
    _HAS_QA_ROUTER = False
    import logging as _logging
    _logging.getLogger(__name__).warning(
        "QA router unavailable (deepsynaps_qa not installed): %s", _qa_imp_err
    )
from app.routers.qeeg_raw_router import router as qeeg_raw_router
from app.routers.qeeg_ai_router import router as qeeg_ai_router
from app.sentry_setup import init_sentry
from app.settings import get_settings
from app.services.brain_regions import list_brain_regions
from app.services.brain_targets import (
    get_brain_target,
    list_brain_targets,
)
from app.services.agent_scheduler import shutdown_scheduler, start_scheduler
from app.workers.auto_page_worker import (
    shutdown_worker as shutdown_auto_page_worker,
    start_worker_if_enabled as start_auto_page_worker,
)
from app.workers.caregiver_email_digest_worker import (
    shutdown_worker as shutdown_caregiver_email_digest_worker,
    start_worker_if_enabled as start_caregiver_email_digest_worker,
)
from app.workers.channel_misconfiguration_detector_worker import (
    shutdown_worker as shutdown_channel_misconfig_detector_worker,
    start_worker_if_enabled as start_channel_misconfig_detector_worker,
)
from app.workers.channel_auth_health_probe_worker import (
    shutdown_worker as shutdown_channel_auth_health_probe_worker,
    start_worker_if_enabled as start_channel_auth_health_probe_worker,
)
from app.workers.irb_reviewer_sla_worker import (
    shutdown_worker as shutdown_irb_reviewer_sla_worker,
    start_worker_if_enabled as start_irb_reviewer_sla_worker,
)
from app.workers.rotation_policy_advisor_snapshot_worker import (
    shutdown_worker as shutdown_rotation_policy_advisor_snapshot_worker,
    start_worker_if_enabled as start_rotation_policy_advisor_snapshot_worker,
)
from app.workers.caregiver_delivery_concern_aggregator_worker import (
    shutdown_worker as shutdown_caregiver_delivery_concern_aggregator_worker,
    start_worker_if_enabled as start_caregiver_delivery_concern_aggregator_worker,
)
from app.workers.resolver_coaching_self_review_digest_worker import (
    shutdown_worker as shutdown_resolver_coaching_self_review_digest_worker,
    start_worker_if_enabled as start_resolver_coaching_self_review_digest_worker,
)
from app.services.agent_skills_seed import seed_default_agent_skills
from app.services.clinical_data import seed_clinical_dataset
from app.services.devices import list_devices
from app.services.evidence import list_evidence
from app.services.generation import generate_handbook, generate_protocol_draft
from app.services.log_sanitizer import sanitize_path
from app.services.preview import build_intake_preview
from app.services.qeeg import list_qeeg_biomarkers, list_qeeg_condition_map
from app.services.review import record_review_action
from app.services.uploads import build_case_summary

settings = get_settings()
configure_logging(settings)
logger = get_logger(__name__)
init_sentry(settings.sentry_dsn, settings.app_env)


def _seed_demo_users_for_dev(db: Session) -> None:
    """Idempotently seed demo Clinic + Users so demo tokens lift a real clinic_id.

    This makes the cross-clinic ownership gate work out-of-the-box in
    development, test, and smoke-test environments without requiring
    manual fixture setup.
    """
    if settings.app_env not in ("development", "test"):
        return
    from app.persistence.models import Clinic, User
    clinic_id = "clinic-demo-default"
    if db.query(Clinic).filter_by(id=clinic_id).first() is None:
        db.add(Clinic(id=clinic_id, name="Demo Clinic"))
        db.flush()
    demo_users = [
        {
            "id": "actor-clinician-demo",
            "email": "demo_clinician@example.com",
            "display_name": "Verified Clinician Demo",
            "role": "clinician",
            "package_id": "clinician_pro",
        },
        {
            "id": "actor-admin-demo",
            "email": "demo_admin@example.com",
            "display_name": "Admin Demo User",
            "role": "admin",
            "package_id": "enterprise",
        },
    ]
    for spec in demo_users:
        existing = db.query(User).filter_by(id=spec["id"]).first()
        if existing is None:
            db.add(User(
                id=spec["id"],
                email=spec["email"],
                display_name=spec["display_name"],
                hashed_password="x",
                role=spec["role"],
                package_id=spec["package_id"],
                clinic_id=clinic_id,
            ))
        elif existing.clinic_id is None:
            existing.clinic_id = clinic_id
    db.commit()


@asynccontextmanager
async def lifespan(app_instance: FastAPI) -> AsyncIterator[None]:
    # Ensure media storage directory exists before anything else
    os.makedirs(settings.media_storage_root, exist_ok=True)

    init_database()
    session = SessionLocal()
    try:
        snapshot = seed_clinical_dataset(session)
        # Seed AI Practice Agent skill catalogue when the table is empty.
        # Idempotent — covers schemas bootstrapped via Base.metadata.create_all
        # (e.g. tests) where alembic seed didn't run.
        seed_default_agent_skills(session)
        # Seed demo Clinic + User rows so demo tokens resolve with a real
        # clinic_id and cross-clinic gates work in dev/test/smoke runs.
        _seed_demo_users_for_dev(session)
        app_instance.state.clinical_snapshot_id = snapshot.snapshot_id
        logger.info(
            "application startup complete",
            extra={"snapshot_id": snapshot.snapshot_id},
        )
    finally:
        session.close()
    # Phase 9 — boot the agent-ops cron (gated on
    # DEEPSYNAPS_AGENT_CRON_ENABLED so tests / CI don't fire jobs).
    start_scheduler()
    # Auto-Page Worker (2026-05-01) — gated on
    # DEEPSYNAPS_AUTO_PAGE_ENABLED so tests / CI don't fire pages.
    # Per-clinic enable lives on escalation_chains.auto_page_enabled.
    start_auto_page_worker()
    # Caregiver Email Digest Worker (2026-05-01) — gated on
    # DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED so tests / CI don't fire
    # dispatches. Per-caregiver enable lives on
    # caregiver_digest_preferences.enabled.
    start_caregiver_email_digest_worker()
    # Channel Misconfiguration Detector Worker (2026-05-01) — gated on
    # DEEPSYNAPS_CHANNEL_DETECTOR_ENABLED so tests / CI don't fire flags.
    # Nightly scan that turns the override admin tab's misconfig flag
    # (#387) into an active HIGH-priority inbox row so admins don't have
    # to discover the misconfig manually.
    start_channel_misconfig_detector_worker()
    # Channel-Specific Auth Health Probe Worker (CSAHP1, 2026-05-02) — gated
    # on CHANNEL_AUTH_HEALTH_PROBE_ENABLED so tests / CI don't fire HTTP
    # probes against real adapter endpoints. Periodic probe of each
    # configured adapter's credentials (Slack OAuth, SendGrid API key,
    # Twilio account auth, PagerDuty token) — emits an
    # ``auth_drift_detected`` audit row BEFORE the next digest dispatch
    # fails so admins can rotate creds without missing a digest. The
    # admin can still manually invoke /tick at any time regardless of
    # the env flag.
    start_channel_auth_health_probe_worker()
    # Rotation Policy Advisor Snapshot Worker (CSAHP5, 2026-05-02) — gated
    # on ROTATION_POLICY_ADVISOR_SNAPSHOT_ENABLED so tests / CI don't
    # generate snapshot rows unprompted. Daily snapshot of CSAHP4 advice
    # cards so the CSAHP5 outcome-tracker can pair "card at T" with
    # "card at T+14d" and report predictive accuracy.
    start_rotation_policy_advisor_snapshot_worker()
    # Caregiver Delivery Concern Aggregator (2026-05-01) — gated on
    # DEEPSYNAPS_CG_CONCERN_AGGREGATOR_ENABLED so tests / CI don't fire
    # flags. Rolling-window scan that flags caregivers with N+ delivery
    # concerns within the configured window (default 3 in 7d) and emits
    # a HIGH-priority inbox row so admins see the recurring delivery
    # problem without per-caregiver drill-down.
    start_caregiver_delivery_concern_aggregator_worker()
    # Resolver Coaching Self-Review Digest Worker (DCRO3, 2026-05-02) — gated
    # on RESOLVER_COACHING_DIGEST_ENABLED so tests / CI don't fire dispatches.
    # Honest opt-in default off — closes the loop end-to-end:
    # DCRO1 measures (#393) → DCRO2 self-corrects (#397) → DCRO3 nudges.
    # Per-resolver opt-in lives on resolver_coaching_digest_preferences.opted_in.
    start_resolver_coaching_self_review_digest_worker()
    # IRB Reviewer SLA Worker (IRB-AMD2, 2026-05-02) — gated on
    # IRB_REVIEWER_SLA_ENABLED so tests / CI don't fire breach rows
    # unprompted. Daily scan that surfaces per-reviewer queue snapshots
    # for the IRB-AMD1 amendment workflow (#446) and emits a HIGH-priority
    # queue_breach_detected audit row when a reviewer's queue exceeds
    # the configured thresholds (default ≥5 pending for ≥7d). Closes
    # "workflow exists" → "workflow has SLA enforcement".
    start_irb_reviewer_sla_worker()
    try:
        yield
    finally:
        shutdown_scheduler()
        shutdown_auto_page_worker()
        shutdown_caregiver_email_digest_worker()
        shutdown_channel_misconfig_detector_worker()
        shutdown_channel_auth_health_probe_worker()
        shutdown_rotation_policy_advisor_snapshot_worker()
        shutdown_caregiver_delivery_concern_aggregator_worker()
        shutdown_resolver_coaching_self_review_digest_worker()
        shutdown_irb_reviewer_sla_worker()


app = FastAPI(title=settings.api_title, version=settings.api_version, lifespan=lifespan)
app.include_router(auth_router)
app.include_router(payments_router)
app.include_router(agent_billing_router)
app.include_router(finance_router)
app.include_router(export_router)
app.include_router(personalization_router)
app.include_router(patients_router)
app.include_router(sessions_router)
app.include_router(assessments_router)
app.include_router(telegram_router)
app.include_router(chat_router)
app.include_router(registries_router)
app.include_router(treatment_courses_router)
app.include_router(review_queue_router)
app.include_router(adverse_events_router)
app.include_router(population_analytics_router)
app.include_router(outcomes_router)
app.include_router(qeeg_records_router)
app.include_router(phenotype_router)
app.include_router(consent_router)
app.include_router(patient_portal_router)
app.include_router(notifications_router)
app.include_router(wearable_router)
app.include_router(media_router)
app.include_router(home_devices_router)
app.include_router(home_device_portal_router)
app.include_router(marketplace_router)
app.include_router(marketplace_seller_router)
app.include_router(virtual_care_router)
app.include_router(forms_router)
app.include_router(medications_router)
app.include_router(consent_management_router)
# Patient Home Program Tasks (Homework) launch-audit (2026-05-01).
# Mounted BEFORE the clinician-side ``home_program_tasks_router`` so the
# patient-scope ``/patient/...`` sub-paths under
# ``/api/v1/home-program-tasks`` are resolved first. The clinician-side
# router still owns the bare ``/api/v1/home-program-tasks`` path
# (list / create / single-id CRUD) for clinicians.
app.include_router(patient_home_program_tasks_router)
app.include_router(home_program_tasks_router)
app.include_router(home_task_templates_router)
app.include_router(agent_skills_router)
app.include_router(annotations_router)
app.include_router(reminders_router)
app.include_router(irb_router)
app.include_router(irb_manager_router)
app.include_router(irb_amendment_workflow_router)
app.include_router(irb_amendment_reviewer_workload_router)
app.include_router(literature_router)
app.include_router(literature_watch_router)
app.include_router(evidence_router)
app.include_router(library_router)
app.include_router(reports_router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(documents_router)
app.include_router(patient_docs_router)
app.include_router(recordings_router)
app.include_router(protocols_saved_router)
app.include_router(protocols_generate_router)
app.include_router(leads_reception_router)
app.include_router(onboarding_router)
app.include_router(symptom_journal_router)
app.include_router(wellness_hub_router)
app.include_router(patient_messages_router)
# Patient Home Devices launch-audit (2026-05-01). Distinct from the
# clinician-side ``home_devices_router`` (registered later under the
# clinician group) — this one carries the patient-side
# /devices CRUD + audit ingestion.
app.include_router(home_devices_patient_router)
# Patient Adherence Events launch-audit (2026-05-01). Sixth patient-facing
# launch-audit surface — closes the home-therapy patient-side regulator
# chain (register → log session → adherence event → side-effect →
# escalate to AE Hub draft).
app.include_router(adherence_events_router)
# Patient Wearables launch-audit (2026-05-01). EIGHTH and final patient-
# facing launch-audit surface — adds the audit chain, consent-revoked
# write gate, IDOR regression and DEMO honesty layer on top of the
# existing ``wearable_router`` clinician queue and patient_portal_router
# wearable connect / sync helpers.
app.include_router(patient_wearables_router)
# Wearables Workbench launch-audit (2026-05-01). Bidirectional counterpart
# to #352 — exposes the clinician triage queue over wearable_alert_flags
# (acknowledge / escalate / resolve) with full audit, AE-draft creation
# on escalate, IDOR cross-clinic gate, and DEMO-prefixed exports.
app.include_router(wearables_workbench_router)
# Clinician Inbox / Notifications Hub launch-audit (2026-05-01). Aggregates
# HIGH-priority clinician-visible mirror audit rows from every patient-facing
# launch audit (Patient Messages #347, Adherence Events #350, Home Program
# Tasks #351, Patient Wearables #352, Wearables Workbench #353) into a
# workflow-friendly triage inbox. Reads the audit_events table only — no
# new schema; acknowledgements are stored as their own audit rows.
app.include_router(clinician_inbox_router)
app.include_router(care_team_coverage_router)
# Clinician Adherence Hub launch-audit (2026-05-01). Bidirectional
# counterpart to Adherence Events #350 — exposes a CROSS-PATIENT triage
# queue over patient_adherence_events scoped to the clinic so a clinician
# can clear today's backlog in bulk (acknowledge / escalate / resolve /
# bulk-acknowledge) instead of opening one Inbox detail at a time.
# Cross-clinic gated; admins see all. Closes the regulator chain on
# home-therapy adherence: patient logs (#350) → clinician triages
# (THIS) → SLA breach via Care Team Coverage (#357) → on-call paging.
app.include_router(clinician_adherence_router)
# Clinician Wellness Hub launch-audit (2026-05-01). Bidirectional
# counterpart to Wellness Hub #345 — exposes a CROSS-PATIENT triage
# queue over wellness_checkins scoped to the clinic so a clinician can
# clear today's wellness backlog in bulk (acknowledge / escalate /
# resolve / bulk-acknowledge) instead of opening one Inbox detail at a
# time. Cross-clinic gated; admins see all. Closes the regulator chain
# on early disengagement detection: patient logs (#345) → clinician
# triages (THIS) → SLA breach via Care Team Coverage (#357) → on-call
# paging.
app.include_router(clinician_wellness_router)
# Clinician Notifications Pulse / Daily Digest launch-audit (2026-05-01).
# End-of-shift summary across the four clinician hubs (Inbox #354,
# Wearables Workbench #353, Adherence Hub #361, Wellness Hub #365) plus
# AE Hub #342 escalations. Top-of-loop telemetry the Care Team Coverage
# SLA chain (#357) lacks: tells the on-call clinician at the end of
# their shift "here's what happened, here's what's still open, here's
# what got escalated". Read-only aggregator + email/colleague-share
# audit rows; SMTP wire-up tracked in PR section F.
app.include_router(clinician_digest_router)
# Auto-Page Worker launch-audit (2026-05-01). Closes the real-time half
# of the Care Team Coverage launch loop (#357). Background worker scans
# SLA breaches every 60s and fires the same page-oncall handler the
# manual button uses (in-process, not HTTP roundtrip). Per-clinic
# enable via escalation_chains.auto_page_enabled; process-wide enable
# via DEEPSYNAPS_AUTO_PAGE_ENABLED=1 env var.
app.include_router(auto_page_worker_router)
# Channel Misconfiguration Detector launch-audit (2026-05-01). Closes
# section I rec from the Clinic Caregiver Channel Override (#387).
# Nightly scan that walks every CaregiverDigestPreference row, evaluates
# adapter_available per row, and emits HIGH-priority audit rows so the
# Clinician Inbox aggregator surfaces channel misconfigs without the
# admin having to manually open the "Caregiver channels" tab.
app.include_router(channel_misconfiguration_detector_router)
# Channel-Specific Auth Health Probe launch-audit (CSAHP1, 2026-05-02). Closes
# section I rec from the Coaching Digest Delivery Failure Drilldown (DCRO5,
# #406). Periodic probe of each configured adapter's credentials so admins
# learn about an OAuth-token drift / expired API key BEFORE the next digest
# dispatch fails. The auth_drift_detected row joins back into DCRO5's
# has_matching_misconfig_flag click-through via the (channel, week) key.
app.include_router(channel_auth_health_probe_router)
# Channel Auth Drift Resolution Tracker launch-audit (CSAHP2, 2026-05-02).
# Closes the proactive-credential-monitoring loop opened by CSAHP1 (#417).
# Admin marks an auth_drift_detected row as rotated; the CSAHP1 worker
# pairs the rotation with the next successful probe within 24h and emits
# auth_drift_resolved_confirmed when the cycle closes. Mirrors the
# DCA → DCR loop (#392 → #393) — admin-side resolution surface that the
# worker honors so the same drift isn't re-flagged after rotation.
app.include_router(channel_auth_drift_resolution_router)
# Channel Auth Drift Resolution Audit Hub (CSAHP3, 2026-05-02). Cohort
# dashboard built on the audit trail emitted by CSAHP1 (#417) and
# CSAHP2 (#422). Mirrors the DCR2 → DCRO1 pattern (#392/#393): pure
# read-side analytics, no migration, no worker. Surfaces the drift →
# mark → confirm rotation funnel + per-channel time-to-rotate /
# time-to-confirm + per-channel re-flag-within-30d rate (leading
# indicator of credential storage / policy issues) + top rotators
# leaderboard. Read-only, clinician minimum, strict cross-clinic
# scoping. Page-level events: view, window_changed, top_rotators_view,
# audit_hub_link_clicked.
app.include_router(channel_auth_drift_resolution_audit_hub_router)
# Auth Drift Rotation Policy Advisor (CSAHP4, 2026-05-02). Read-only
# advisor surface that consumes CSAHP3's per-channel re-flag-rate /
# manual-rotation-share / auth-error-class signals and emits heuristic
# recommendation cards. No new audit rows, no schema, no worker —
# pure presentation building on the leading-indicator signals CSAHP3
# already exposes. Mirrors the DCRO5 / CSAHP3 read-only advisor pattern.
app.include_router(auth_drift_rotation_policy_advisor_router)
# Rotation Policy Advisor Outcome Tracker (CSAHP5, 2026-05-02). Closes
# the section I rec from CSAHP4 (#428) — pair each advice card snapshot
# at time T with the same-key snapshot at T+14d (±2d tolerance) and
# compute per-advice-code predictive accuracy (card_disappeared_pct).
# Backed by the daily CSAHP5 background snapshot worker (default-off,
# opt-in via ROTATION_POLICY_ADVISOR_SNAPSHOT_ENABLED) which emits
# advice_snapshot + snapshot_run audit rows for each clinic. Pure
# read-side analytics on top of the existing audit_event_records table —
# no new schema, no migration. Page-level events: view, window_changed,
# run_snapshot_now_clicked, demo_banner_shown.
app.include_router(rotation_policy_advisor_outcome_tracker_router)
# Rotation Policy Advisor Threshold Tuning Console (CSAHP6, 2026-05-02).
# Closes the recursion loop opened by CSAHP5 (#434). Lets admins propose
# new thresholds for any of the 3 advice rules (REFLAG_HIGH /
# MANUAL_REFLAG / AUTH_DOMINANT), replay them against the last 90 days
# of frozen ``advice_snapshot`` rows, and adopt the new threshold when
# the replay shows higher predictive accuracy. Adopted values take
# effect immediately on the next CSAHP4 ``/advice`` call. Same
# calibration chain logic, applied recursively to the heuristic itself.
app.include_router(rotation_policy_advisor_threshold_tuning_router)
# Rotation Policy Advisor Threshold Adoption Outcome Tracker (CSAHP7,
# 2026-05-02). Closes the meta-loop on the meta-loop opened by CSAHP6
# (#438): pair each ``threshold_adopted`` audit row at time T with the
# same (advice_code, threshold_key) pair's measured predictive accuracy
# at T+30d (post-adoption window) versus the baseline accuracy at T.
# Did the adopted threshold actually move the needle in production?
# Outcome classes: improved (delta >= +5pp) / regressed (<= -5pp) /
# flat / pending (window not elapsed) / insufficient_data (<3 paired
# cards in either window). Per-adopter calibration_score = (improved -
# regressed) / total_adoptions. Pure read-side analytics on the
# existing audit_event_records table — no new schema, no migration.
# Page-level events: view, window_changed, list_filter_changed.
app.include_router(rotation_policy_advisor_threshold_adoption_outcome_tracker_router)
# Caregiver Delivery Concern Aggregator launch-audit (2026-05-01). Closes
# section I rec from the Channel Misconfiguration Detector (#389).
# Rolling-window scan that flags caregivers with N+ delivery concerns
# within the configured window (default 3 within 7d) and emits a HIGH-
# priority audit row so admins see recurring delivery problems via the
# Clinician Inbox aggregator (#354) without per-caregiver drill-down.
app.include_router(caregiver_delivery_concern_aggregator_router)
# Caregiver Delivery Concern Resolution launch-audit (2026-05-02). Closes
# the DCA loop opened by #390 — admin-side "Mark as resolved" surface
# inside the Care Team Coverage "Caregiver channels" tab. Emits
# ``caregiver_portal.delivery_concern_resolved`` audit rows that the DCA
# worker consults so resolved caregivers are not re-flagged inside the
# cooldown window. Pure CRUD/action router; no companion worker.
app.include_router(caregiver_delivery_concern_resolution_router)
# Caregiver Delivery Concern Resolution Audit Hub (DCR2, 2026-05-02). Cohort
# dashboard built on the DCR1 audit trail — distribution of resolution reasons
# (concerns_addressed / false_positive / caregiver_replaced / other) over time
# so admins can calibrate the DCA threshold (high false_positive → raise) and
# invest in delivery infrastructure when caregiver_replaced spikes. Read-only,
# clinician minimum, no companion worker. Source data is the existing
# caregiver_portal.delivery_concern_resolved audit rows emitted by DCR1.
app.include_router(caregiver_delivery_concern_resolution_audit_hub_router)
# Caregiver Delivery Concern Resolution Outcome Tracker (DCRO1, 2026-05-02).
# Calibration-accuracy dashboard built on top of the DCR1 + DCR2 audit
# trail. Pairs each ``caregiver_portal.delivery_concern_resolved`` row
# with the NEXT ``caregiver_portal.delivery_concern_threshold_reached``
# row for the same caregiver to record stayed_resolved vs
# re_flagged_within_30d, then computes per-resolver calibration
# accuracy: when an admin marks a caregiver "false_positive", does the
# DCA worker re-flag them within 30 days? If yes, the admin was wrong.
# No schema change — pure pairing of existing audit rows.
app.include_router(caregiver_delivery_concern_resolution_outcome_tracker_router)
# Resolver Coaching Inbox (DCRO2, 2026-05-02). Private, read-only inbox
# view per resolver showing their wrong false_positive calls — i.e.,
# resolutions where the resolver said "false_positive" but the DCA
# worker re-flagged the same caregiver within 30 days. Each row carries
# the caregiver's subsequent concern_count, adapter list, and a
# self-review-notes field. Mirrors the Wearables Workbench → Clinician
# Inbox handoff (#353/#354): admins do NOT drill into individual
# resolver inboxes — coaching is resolver-led self-correction. Admins
# use the admin-overview endpoint to see who needs coaching without
# violating individual privacy. No new schema; pure UI on top of
# DCRO1's paired-outcome data plus a self-review-note audit row.
app.include_router(resolver_coaching_inbox_router)
# Resolver Coaching Self-Review Digest Worker (DCRO3, 2026-05-02). Closes
# the resolver-side loop: DCRO1 (#393) measures calibration → DCRO2 (#397)
# gives each resolver a private self-review surface → DCRO3 (THIS) nudges
# them weekly via their preferred on-call channel when they have un-self-
# reviewed wrong false_positive calls. Honest opt-in default OFF at both
# system level (RESOLVER_COACHING_DIGEST_ENABLED env) and per-resolver
# level (ResolverCoachingDigestPreference.opted_in). Reuses the
# EscalationPolicy + oncall_delivery adapters from #374. Per-resolver
# weekly cooldown (default 144h = 6 days) prevents weekly-overlap dispatch.
app.include_router(resolver_coaching_self_review_digest_router)
# Resolver Coaching Digest Audit Hub launch-audit (DCRO4, 2026-05-02).
# Admin-side cohort dashboard built on the DCRO3 dispatched audit row
# stream + the ResolverCoachingDigestPreference table. Three views:
# (a) opted-in vs opted-out resolver counts, (b) digest delivery
# success/failure rate per channel, (c) per-resolver weekly wrong-call
# backlog trajectory (shrinking / flat / growing). Read-only — there
# is no companion worker. Closes the resolver-side coaching loop:
# DCRO1 measures → DCRO2 self-corrects → DCRO3 nudges → DCRO4 admins
# audit. Clinician minimum; cross-clinic data hidden behind the
# canonical ``clinic_id={cid}`` substring needle on every read path.
app.include_router(resolver_coaching_digest_audit_hub_router)
# Coaching Digest Delivery Failure Drilldown (DCRO5, 2026-05-02). Operational
# drill-down over the DCRO3 dispatched audit row stream filtered to
# delivery_status=failed and grouped by (channel, error_class). DCRO4 (#402)
# surfaces the failure rate; DCRO5 makes it actionable with click-through to
# the Channel Misconfig Detector (#389) when a matching
# caregiver_portal.channel_misconfigured_detected row exists in the same ISO
# week + clinic + channel. Read-only; clinician minimum; no schema change; no
# companion worker (reuses the existing DCRO3 audit row stream).
app.include_router(coaching_digest_delivery_failure_drilldown_router)
# Escalation Policy Editor (2026-05-01) — admin-only configurable
# dispatch order + per-surface override matrix + per-user contact mapping.
# Replaces the hard-coded DEFAULT_ADAPTER_ORDER and contact_handle path
# flagged by the On-Call Delivery agent (#373) as the last operational
# gap. OncallDeliveryService consults EscalationPolicy at construction
# time and falls back to the static default when no policy exists, so
# every existing deploy keeps working unchanged.
app.include_router(escalation_policy_router)
# Patient On-Call Visibility launch-audit (2026-05-01). Patient-facing
# complement to the admin-side Escalation Policy editor (#374): patients
# get a read-only "Care team contact" card on their Patient Profile
# (pages-patient.js::pgPatientProfile) showing abstract availability
# state (coverage hours, in-hours-now, urgent path) WITHOUT exposing
# any PHI of the on-call clinician — no name, phone, Slack handle, or
# PagerDuty user-id surfaces here. Closes the patient-side gap flagged
# by the Escalation Policy agent now that admin-side dispatch order is
# editable.
app.include_router(patient_oncall_router)
# Patient Digest launch-audit (2026-05-01). Patient-side mirror of the
# Clinician Digest (#366). Daily/weekly self-summary the patient sees
# on demand: sessions completed, adherence streak, wellness trends,
# pending messages, recent reports — all scoped to actor.patient_id;
# NO PHI of OTHER patients leaks into the response. The IDOR regression
# test asserts that a clinician hitting the patient endpoints with a
# forged patient_id query param still gets a 404.
app.include_router(patient_digest_router)
# Caregiver Consent Grants launch-audit (2026-05-01). Closes the
# caregiver-share loop opened by Patient Digest #376. Patient grants
# create durable rows in ``caregiver_consent_grants`` with a JSON
# ``scope`` (digest / messages / reports / wearables); revoke stamps
# ``revoked_at`` + ``revocation_reason`` and the grant becomes
# immutable. Patient Digest's share-caregiver endpoint consults
# ``has_active_grant`` and flips ``delivery_status='sent'`` honestly
# when ``scope.digest=True`` — otherwise stays ``queued``. Cross-
# patient access blocked at the router (404). Caregivers see grants
# pointed at them via ``/grants/by-caregiver``.
app.include_router(caregiver_consent_router)
# Caregiver Email Digest (2026-05-01) — closes the bidirectional
# notification loop opened by Caregiver Notification Hub #379. Daily
# roll-up of unread caregiver notifications via the on-call delivery
# adapters in mock mode unless real env vars set. Caregivers opt in via
# ``caregiver_digest_preferences``; the daily worker
# (DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED=1) honours a 24h per-caregiver
# cooldown.
app.include_router(caregiver_email_digest_router)
# Audit Trail launch-audit (2026-04-30) — was previously included via
# legacy main.py routes. The router carries its own filters, summary,
# CSV / NDJSON exports, single-event detail, and audits its own reads.
# A concurrent session reverted this include during PR #386's merge
# storm; restoring it here so audit-trail surface tests pass and the
# regulator transcript surface is reachable.
app.include_router(audit_trail_router)
# Settings API (scaffolded 024_settings_schema) — stubs; endpoints arrive in
# follow-up subagents. Grouped together for discoverability.
app.include_router(profile_router)
app.include_router(clinic_router)
app.include_router(team_router)
app.include_router(preferences_router)
app.include_router(data_privacy_router)
app.include_router(risk_stratification_router)
app.include_router(movement_analyzer_router)
app.include_router(qeeg_analysis_router)
app.include_router(qeeg_live_router)
app.include_router(qeeg_copilot_router)
app.include_router(qeeg_viz_router)
app.include_router(mri_analysis_router)
app.include_router(audio_analysis_router)
app.include_router(fusion_router)
app.include_router(monitor_router)
app.include_router(deeptwin_router)
app.include_router(brain_twin_router)
app.include_router(patient_summary_router)
app.include_router(patient_timeline_router)
app.include_router(clinical_text_router)
app.include_router(agents_router)
app.include_router(agent_admin_router)
app.include_router(admin_pgvector_router)
app.include_router(feature_store_router)
app.include_router(citation_validator_router)
app.include_router(command_center_router)
app.include_router(schedules_router)
app.include_router(dashboard_router)
app.include_router(device_sync_router)
if _HAS_QA_ROUTER and qa_router is not None:
    app.include_router(qa_router)
app.include_router(qeeg_raw_router)
app.include_router(qeeg_ai_router)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "Accept"],
)

app.add_middleware(SlowAPIMiddleware)


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Reject oversized requests before they hit the route handler.

    The limit is read from ``settings.media_max_upload_bytes`` so that the
    middleware ceiling and the media-router upload ceiling cannot drift
    apart. Previously a hard-coded 10 MiB cap rejected uploads under the
    50 MiB media limit with a 413 before they reached the router.
    """

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.media_max_upload_bytes:
            return JSONResponse({"error": "Request body too large"}, status_code=413)
        return await call_next(request)


app.add_middleware(MaxBodySizeMiddleware)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https:; "
        # Allow the Sentry browser SDK to POST events / session replays.
        # Without these origins the in-browser SDK is silently blocked by CSP.
        "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io; "
        "frame-ancestors 'none';"
    )
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def _safe_log_path(request: Request) -> str:
    """Return a PHI-safe path label for structured logs / Sentry.

    Prefers the matched route template (`/api/v1/patients/{patient_id}/timeline`)
    so identifiers never reach the log payload. Falls back to a sanitised raw
    path when no route matched (404, malformed path, ASGI-level errors). See
    apps/api/app/services/log_sanitizer.py for the redaction rules.
    """
    route = request.scope.get("route") if hasattr(request, "scope") else None
    template = getattr(route, "path", None) if route is not None else None
    if isinstance(template, str) and template:
        return template
    return sanitize_path(request.url.path)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))
    start = perf_counter()
    request.state.request_id = request_id

    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((perf_counter() - start) * 1000, 2)
        logger.exception(
            "request failed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": _safe_log_path(request),
                "duration_ms": duration_ms,
            },
        )
        raise

    duration_ms = round((perf_counter() - start) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "request completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": _safe_log_path(request),
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


# ── SPA fallback middleware ──────────────────────────────────────────────────
# Client-side routes (e.g. /patient-education) must serve index.html so the
# React router can handle them. This middleware intercepts 404s from the
# StaticFiles mount and rewrites them to index.html, preserving API 404s.
_frontend_dist = Path(__file__).resolve().parents[3] / "apps" / "web" / "dist"

@app.middleware("http")
async def spa_fallback_middleware(request: Request, call_next):
    response = await call_next(request)
    if response.status_code == 404:
        path = request.url.path
        # Don't rewrite API or static uploads
        if not path.startswith("/api/") and not path.startswith("/static/"):
            # Only rewrite if the file doesn't actually exist in dist
            file_path = _frontend_dist / path.lstrip("/")
            if not file_path.exists() or not file_path.is_file():
                new_response = FileResponse(_frontend_dist / "index.html")
                # Preserve security headers added by inner middleware
                for header, value in response.headers.items():
                    h = header.lower()
                    if h not in ("content-length", "content-type", "etag", "last-modified", "accept-ranges"):
                        new_response.headers[header] = value
                return new_response
    return response


def _health_payload(session: Session) -> dict[str, object]:
    session.execute(text("SELECT 1"))
    snapshot = get_latest_snapshot(session)
    return {
        "status": "ok",
        "db": "connected",
        "environment": settings.app_env,
        "version": settings.api_version,
        "database": "ok",
        "clinical_snapshot": {
            "snapshot_id": snapshot.snapshot_id if snapshot is not None else None,
            "total_records": snapshot.total_records if snapshot is not None else 0,
        },
    }


@app.get("/health")
def health(session: Session = Depends(get_db_session)) -> dict[str, object]:
    return _health_payload(session)


@app.get("/healthz")
def healthz(session: Session = Depends(get_db_session)) -> dict[str, object]:
    return _health_payload(session)


@app.get("/api/v1/health")
def health_v1(session: Session = Depends(get_db_session)) -> dict[str, object]:
    """Versioned health check — returns {status, db, version} plus richer diagnostics."""
    return _health_payload(session)


@app.exception_handler(ApiServiceError)
async def api_service_error_handler(
    _request: Request,
    exc: ApiServiceError,
) -> JSONResponse:
    payload = ErrorResponse(
        code=exc.code,
        message=exc.message,
        warnings=exc.warnings,
        details=exc.details,
    )
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump(exclude_none=True))


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    payload = ErrorResponse(
        code="invalid_request",
        message="One or more request fields are missing or invalid.",
        warnings=[error["msg"] for error in exc.errors()],
    )
    return JSONResponse(status_code=422, content=payload.model_dump())


@app.exception_handler(Exception)
async def unexpected_error_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    logger.exception(
        "unhandled application error",
        extra={
            "request_id": getattr(request.state, "request_id", None),
            "method": request.method,
            "path": _safe_log_path(request),
        },
    )
    payload = ErrorResponse(
        code="internal_error",
        message="The server could not complete the request.",
        warnings=["Retry the request or review the API logs for the associated request id."],
    )
    return JSONResponse(status_code=500, content=payload.model_dump())


@app.post(
    "/api/v1/intake/preview",
    response_model=IntakePreviewResponse,
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
@limiter.limit("30/minute")
def intake_preview(request: Request, payload: IntakePreviewRequest) -> IntakePreviewResponse:
    return build_intake_preview(payload)


@app.get("/api/v1/evidence", response_model=EvidenceListResponse)
def evidence() -> EvidenceListResponse:
    return list_evidence()


@app.get("/api/v1/devices", response_model=DeviceListResponse)
def devices() -> DeviceListResponse:
    return list_devices()


@app.get("/api/v1/brain-regions", response_model=BrainRegionListResponse)
def brain_regions() -> BrainRegionListResponse:
    return list_brain_regions()


# Brain Map Planner — clinical target registry (deterministic, no AI).
# Frontend `pgBrainMapPlanner` uses these to resolve canonical targets
# (DLPFC-L, mPFC, M1, etc.) to anchor 10-20 electrodes + MNI coordinates +
# evidence grade. See `app/services/brain_targets.py` for the full schema and
# adding-a-target rules.
@app.get("/api/v1/brain-targets")
def brain_targets() -> dict:
    return list_brain_targets()


@app.get("/api/v1/brain-targets/{target_id}")
def brain_target_detail(target_id: str) -> dict:
    entry = get_brain_target(target_id)
    if not entry:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail=f"Unknown brain target: {target_id}")
    return entry


@app.get("/api/v1/qeeg/biomarkers", response_model=QEEGBiomarkerListResponse)
def qeeg_biomarkers() -> QEEGBiomarkerListResponse:
    return list_qeeg_biomarkers()


@app.get("/api/v1/qeeg/condition-map", response_model=QEEGConditionMapListResponse)
def qeeg_condition_map() -> QEEGConditionMapListResponse:
    return list_qeeg_condition_map()


@app.post("/api/v1/uploads/case-summary", response_model=CaseSummaryResponse)
def case_summary(
    payload: CaseSummaryRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> CaseSummaryResponse:
    return build_case_summary(payload, actor)


@app.post(
    "/api/v1/protocols/generate-draft",
    response_model=ProtocolDraftResponse,
    responses={
        403: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)
@limiter.limit("10/minute")
def protocol_draft(
    request: Request,
    payload: ProtocolDraftRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> ProtocolDraftResponse:
    return generate_protocol_draft(payload, actor)


@app.post(
    "/api/v1/handbooks/generate",
    response_model=HandbookGenerateResponse,
    responses={403: {"model": ErrorResponse}},
)
@limiter.limit("10/minute")
def handbook(
    request: Request,
    payload: HandbookGenerateRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> HandbookGenerateResponse:
    return generate_handbook(payload, actor)


@app.post(
    "/api/v1/review-actions",
    response_model=ReviewActionResponse,
    responses={403: {"model": ErrorResponse}},
)
def review_action(
    payload: ReviewActionRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> ReviewActionResponse:
    return record_review_action(payload, actor, session)


# NOTE: GET /api/v1/audit-trail moved to apps/api/app/routers/audit_trail_router.py
# (launch-audit 2026-04-30). The router exposes filters, summary, NDJSON / CSV
# exports, single-event detail, and audits its own reads — all required for
# regulator-credible review. The legacy admin-only endpoint that lived here is
# subsumed by router.list_audit_trail (clinician minimum + admin sees-all).


# ── Static asset mounts ──────────────────────────────────────────────────────
# `/static` serves user-uploaded avatars + clinic logos (written by
# profile_router + clinic_router). Must be mounted BEFORE the `/` frontend
# catch-all so the static-file routes take precedence.
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_DATA_DIR.mkdir(exist_ok=True)
(_DATA_DIR / "avatars").mkdir(exist_ok=True)
(_DATA_DIR / "clinics").mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_DATA_DIR)), name="static")

# Serve React frontend — must be mounted after all API routes.
# SPA fallback is handled by spa_fallback_middleware above.
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
