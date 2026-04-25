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
    AuditTrailResponse,
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
from app.routers.finance_router import router as finance_router
from app.routers.sessions_router import router as sessions_router
from app.routers.treatment_courses_router import router as treatment_courses_router
from app.routers.treatment_courses_router import review_router as review_queue_router
from app.routers.adverse_events_router import router as adverse_events_router
from app.routers.outcomes_router import router as outcomes_router
from app.routers.qeeg_records_router import router as qeeg_records_router
from app.routers.phenotype_router import router as phenotype_router
from app.routers.consent_router import router as consent_router
from app.routers.patient_portal_router import router as patient_portal_router
from app.routers.notifications_router import router as notifications_router
from app.routers.wearable_router import router as wearable_router
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
from app.routers.home_task_templates_router import router as home_task_templates_router
from app.routers.agent_skills_router import router as agent_skills_router
from app.routers.annotations_router import router as annotations_router
from app.routers.reminders_router import router as reminders_router
from app.routers.irb_router import router as irb_router
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
# Settings API routers (foundation scaffolded by backend subagent #1; endpoints
# fleshed out by backend subagents #3–#6). See apps/api/SETTINGS_API_DESIGN.md.
from app.routers.profile_router import router as profile_router
from app.routers.clinic_router import router as clinic_router
from app.routers.team_router import router as team_router
from app.routers.preferences_router import router as preferences_router
from app.routers.data_privacy_router import router as data_privacy_router
from app.routers.risk_stratification_router import router as risk_stratification_router
from app.routers.qeeg_analysis_router import router as qeeg_analysis_router
from app.routers.qeeg_live_router import router as qeeg_live_router
from app.routers.qeeg_copilot_router import router as qeeg_copilot_router
from app.routers.qeeg_viz_router import router as qeeg_viz_router
from app.routers.mri_analysis_router import router as mri_analysis_router
from app.routers.admin_pgvector_router import router as admin_pgvector_router
from app.routers.fusion_router import router as fusion_router
from app.routers.monitor_router import router as monitor_router
from app.routers.deeptwin_router import brain_twin_router, router as deeptwin_router
from app.routers.feature_store_router import router as feature_store_router
from app.routers.citation_validator_router import router as citation_validator_router
from app.routers.qa_router import router as qa_router
from app.routers.qeeg_raw_router import router as qeeg_raw_router
from app.sentry_setup import init_sentry
from app.settings import get_settings
from app.services.audit import get_audit_trail
from app.services.brain_regions import list_brain_regions
from app.services.agent_skills_seed import seed_default_agent_skills
from app.services.clinical_data import seed_clinical_dataset
from app.services.devices import list_devices
from app.services.evidence import list_evidence
from app.services.generation import generate_handbook, generate_protocol_draft
from app.services.preview import build_intake_preview
from app.services.qeeg import list_qeeg_biomarkers, list_qeeg_condition_map
from app.services.review import record_review_action
from app.services.uploads import build_case_summary

settings = get_settings()
configure_logging(settings)
logger = get_logger(__name__)
init_sentry(settings.sentry_dsn, settings.app_env)



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
        app_instance.state.clinical_snapshot_id = snapshot.snapshot_id
        logger.info(
            "application startup complete",
            extra={"snapshot_id": snapshot.snapshot_id},
        )
    finally:
        session.close()
    yield


app = FastAPI(title=settings.api_title, version=settings.api_version, lifespan=lifespan)
app.include_router(auth_router)
app.include_router(payments_router)
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
app.include_router(home_program_tasks_router)
app.include_router(home_task_templates_router)
app.include_router(agent_skills_router)
app.include_router(annotations_router)
app.include_router(reminders_router)
app.include_router(irb_router)
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
# Settings API (scaffolded 024_settings_schema) — stubs; endpoints arrive in
# follow-up subagents. Grouped together for discoverability.
app.include_router(profile_router)
app.include_router(clinic_router)
app.include_router(team_router)
app.include_router(preferences_router)
app.include_router(data_privacy_router)
app.include_router(risk_stratification_router)
app.include_router(qeeg_analysis_router)
app.include_router(qeeg_live_router)
app.include_router(qeeg_copilot_router)
app.include_router(qeeg_viz_router)
app.include_router(mri_analysis_router)
app.include_router(fusion_router)
app.include_router(monitor_router)
app.include_router(deeptwin_router)
app.include_router(brain_twin_router)
app.include_router(admin_pgvector_router)
app.include_router(feature_store_router)
app.include_router(citation_validator_router)
app.include_router(qa_router)
app.include_router(qeeg_raw_router)

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
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 10 * 1024 * 1024:  # 10MB
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
        "connect-src 'self'; "
        "frame-ancestors 'none';"
    )
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


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
                "path": request.url.path,
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
            "path": request.url.path,
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
            "path": request.url.path,
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


@app.get("/api/v1/audit-trail", response_model=AuditTrailResponse)
def audit_trail(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    session: Session = Depends(get_db_session),
) -> AuditTrailResponse:
    return get_audit_trail(actor, session)


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
