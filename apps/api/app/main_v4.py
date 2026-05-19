"""
DeepSynaps Protocol Studio — Intelligent Synaps v4
Complete FastAPI application with ALL components wired.

This is the central wiring file that connects:
- 66 specialty adapters (pharmaceutical, genetic, neuroimaging, evidence,
  terminology, adverse events, AI literature, pending)
- 9 Intelligent Synaps components (orchestrator, confidence engine,
  cross-reference mesh, evidence fusion, smart cache, query planner,
  response synthesizer, governance layer)
- 4 Analyzer Bridges (efficacy, safety, comparator, biomarker)
- Multimodal Synthesizer, Protocol Generator, Evidence Store
- 40+ API routers with proper prefixes and tags
- Full health check endpoints for every subsystem
- Graceful degradation — app starts even if some adapters fail

Usage:
    uvicorn app.main_v4:app --host 0.0.0.0 --port 8000

Environment:
    LOG_LEVEL=INFO|DEBUG|WARNING|ERROR
    CORS_ORIGINS=http://localhost:3000,https://app.deepsynaps.io
    PORT=8000
    HOST=0.0.0.0
    RELOAD=false|true
"""

from __future__ import annotations

import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

# ═══════════════════════════════════════════════════════════════════════════════
#  LIFESPAN IMPORT
# ═══════════════════════════════════════════════════════════════════════════════

# Import the v4 lifespan manager — fault-tolerant with full graceful degradation
try:
    from app.lifespan_v4 import deepsynaps_lifespan, get_component_status, get_overall_status
    _HAS_LIFESPAN_V4 = True
except Exception as _lifespan_exc:
    _HAS_LIFESPAN_V4 = False
    # Define a minimal fallback lifespan
    @asynccontextmanager
    async def deepsynaps_lifespan(app: FastAPI):  # type: ignore[misc]
        logging.getLogger("deepsynaps").warning(
            "lifespan_v4 not available, using fallback: %s", _lifespan_exc
        )
        yield

# ═══════════════════════════════════════════════════════════════════════════════
#  LOGGING CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.environ.get(
    "LOG_FORMAT",
    "%(asctime)s | %(name)-30s | %(levelname)-7s | %(message)s",
)

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format=LOG_FORMAT,
    stream=sys.stdout,
)
logger = logging.getLogger("deepsynaps")

# Suppress noisy third-party loggers
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("asyncio").setLevel(logging.WARNING)

# ═══════════════════════════════════════════════════════════════════════════════
#  SAFE IMPORT HELPER
# ═══════════════════════════════════════════════════════════════════════════════

_component_status: dict[str, dict[str, Any]] = {}


def _safe_import(module_path: str, attr_name: str | None = None) -> Any:
    """Gracefully import a module or attribute; return None on failure."""
    try:
        module = __import__(module_path, fromlist=[attr_name] if attr_name else [])
        if attr_name is None:
            return module
        return getattr(module, attr_name)
    except Exception as exc:
        logger.debug("Import failed for %s.%s: %s", module_path, attr_name or "*", exc)
        return None


def _safe_import_router(module_path: str, router_attr: str = "router") -> Any:
    """Safely import a router module, handling various naming conventions."""
    try:
        module = __import__(module_path, fromlist=[router_attr])
        router = getattr(module, router_attr)
        return router
    except Exception as exc:
        logger.debug("Router import failed for %s.%s: %s", module_path, router_attr, exc)
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  FASTAPI APPLICATION
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="DeepSynaps Protocol Studio",
    description=(
        "Intelligent Synaps v4 — Clinical Neuromodulation Operating System.\n\n"
        "Wires 66 specialty adapters across 8 categories "
        "(pharmaceutical, genetic, neuroimaging, evidence, terminology, "
        "adverse events, AI literature, pending), 9 intelligent Synaps components, "
        "4 analyzer bridges, multimodal synthesis, protocol generation, "
        "evidence storage, neuroimaging pipeline, knowledge router v2, "
        "and real-time health monitoring."
    ),
    version="4.0.0",
    lifespan=deepsynaps_lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=[
        {"name": "Health", "description": "System health and readiness probes"},
        {"name": "Intelligent Synaps", "description": "AI-powered clinical intelligence"},
        {"name": "Knowledge", "description": "Knowledge base queries and search"},
        {"name": "Evidence", "description": "Evidence retrieval and synthesis"},
        {"name": "Synthesis", "description": "Multimodal evidence synthesis"},
        {"name": "Protocol", "description": "Neuromodulation protocol generation"},
        {"name": "Analysis", "description": "Clinical analyzers (efficacy, safety, etc.)"},
        {"name": "Admin", "description": "Administrative and configuration endpoints"},
        {"name": "Monitoring", "description": "System monitoring and observability"},
        {"name": "Meta", "description": "Version and system metadata"},
    ],
)

# ═══════════════════════════════════════════════════════════════════════════════
#  CORS CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

_cors_origins_raw = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,https://app.deepsynaps.io,"
    "https://deepsynaps-studio.fly.dev,https://*.deepsynaps.io",
)
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Correlation-ID",
        "X-Request-Duration",
        "X-Request-ID",
        "X-Adapter-Count",
        "X-Component-Status",
    ],
)

# ═══════════════════════════════════════════════════════════════════════════════
#  MIDDLEWARE
# ═══════════════════════════════════════════════════════════════════════════════


@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    """Attach a unique correlation-id to every request for distributed tracing."""
    request.state.correlation_id = request.headers.get(
        "X-Correlation-ID", str(uuid.uuid4())
    )
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = request.state.correlation_id
    return response


@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    """Record request duration for performance monitoring."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    response.headers["X-Request-Duration"] = f"{elapsed:.4f}s"
    logger.debug(
        "request=%s method=%s path=%s duration=%.4fs status=%s",
        request.state.correlation_id,
        request.method,
        request.url.path,
        elapsed,
        response.status_code,
    )
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


# ═══════════════════════════════════════════════════════════════════════════════
#  GLOBAL EXCEPTION HANDLERS
# ═══════════════════════════════════════════════════════════════════════════════

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle FastAPI HTTPExceptions with correlation-id."""
    logger.warning(
        "HTTP %s — %s (correlation=%s)",
        exc.status_code,
        exc.detail,
        getattr(request.state, "correlation_id", "n/a"),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": str(exc.detail),
            "correlation_id": getattr(request.state, "correlation_id", None),
            "status_code": exc.status_code,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled exceptions."""
    correlation_id = getattr(request.state, "correlation_id", None)
    logger.error(
        "Unhandled exception [correlation=%s]: %s",
        correlation_id,
        exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "correlation_id": correlation_id,
            "type": exc.__class__.__name__,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  HEALTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health", tags=["Health"], response_model=dict, summary="Liveness probe")
async def health_check() -> dict[str, Any]:
    """Lightweight liveness probe for load balancers."""
    return {
        "status": "healthy",
        "version": "4.0.0",
        "codename": "Intelligent Synaps",
        "service": "deepsynaps-protocol-studio",
    }


@app.get("/health/ready", tags=["Health"], response_model=dict, summary="Readiness probe")
async def health_ready(request: Request) -> dict[str, Any]:
    """Readiness probe — checks all subsystems and returns detailed status."""
    checks: dict[str, Any] = {}

    # Core intelligent components
    for attr, label in [
        ("orchestrator", "orchestrator"),
        ("registry", "adapter_registry"),
        ("cache", "smart_cache"),
        ("governance", "governance_layer"),
        ("confidence_engine", "confidence_engine"),
        ("cross_ref_mesh", "cross_reference_mesh"),
        ("evidence_fusion", "evidence_fusion"),
        ("query_planner", "query_planner"),
        ("response_synthesizer", "response_synthesizer"),
        ("multimodal_synthesizer", "multimodal_synthesizer"),
        ("protocol_generator", "protocol_generator"),
        ("evidence_store", "evidence_store"),
        ("neuroimaging_pipeline", "neuroimaging_pipeline"),
        ("knowledge_router", "knowledge_router"),
    ]:
        instance = getattr(request.app.state, attr, None)
        checks[label] = {
            "available": instance is not None,
            "status": "ready" if instance is not None else "unavailable",
        }

    # Analyzer bridges
    for bridge_name in ["efficacy_analyzer", "safety_analyzer", "comparator_analyzer", "biomarker_analyzer"]:
        instance = getattr(request.app.state, bridge_name, None)
        checks[bridge_name] = {
            "available": instance is not None,
            "status": "ready" if instance is not None else "unavailable",
        }

    all_ready = all(c["available"] for c in checks.values())
    any_ready = any(c["available"] for c in checks.values())

    return {
        "status": "ready" if all_ready else "degraded" if any_ready else "unavailable",
        "version": "4.0.0",
        "checks": checks,
        "ready_count": sum(1 for c in checks.values() if c["available"]),
        "total_count": len(checks),
    }


@app.get("/health/detailed", tags=["Health"], response_model=dict, summary="Detailed health report")
async def health_detailed(request: Request) -> dict[str, Any]:
    """Detailed health report with adapter inventory and component diagnostics."""
    adapters: list[dict[str, str]] = []

    # Try to enumerate adapters from registry
    registry = getattr(request.app.state, "registry", None)
    if registry is not None:
        try:
            if hasattr(registry, "list_available_adapters"):
                for name in registry.list_available_adapters():
                    adapters.append({"name": name, "status": "available"})
            if hasattr(registry, "list_failed_adapters"):
                for name in registry.list_failed_adapters():
                    adapters.append({"name": name, "status": "failed"})
            if hasattr(registry, "list_pending_adapters"):
                for name in registry.list_pending_adapters():
                    adapters.append({"name": name, "status": "pending"})
        except Exception as exc:
            logger.warning("Could not enumerate adapters from registry: %s", exc)

    # Fallback: try adapter_wiring
    wiring = getattr(request.app.state, "adapter_wiring", None)
    if wiring is not None and not adapters:
        try:
            status = wiring.get_status()
            for cat_data in status.get("categories", {}).values():
                for adapter in cat_data.get("adapters", []):
                    adapters.append({
                        "name": adapter["name"],
                        "status": adapter["status"],
                    })
        except Exception as exc:
            logger.warning("Could not enumerate adapters from wiring: %s", exc)

    # Component availability checks
    components = {}
    for attr, label in [
        ("orchestrator", "intelligent_orchestrator"),
        ("registry", "adapter_registry"),
        ("cache", "smart_cache"),
        ("governance", "governance_layer"),
        ("confidence_engine", "confidence_engine"),
        ("cross_ref_mesh", "cross_reference_mesh"),
        ("evidence_fusion", "evidence_fusion"),
        ("query_planner", "query_planner"),
        ("response_synthesizer", "response_synthesizer"),
        ("multimodal_synthesizer", "multimodal_synthesizer"),
        ("protocol_generator", "protocol_generator"),
        ("evidence_store", "evidence_store"),
        ("neuroimaging_pipeline", "neuroimaging_pipeline"),
        ("knowledge_router", "knowledge_router"),
        ("efficacy_analyzer", "efficacy_analyzer"),
        ("safety_analyzer", "safety_analyzer"),
        ("comparator_analyzer", "comparator_analyzer"),
        ("biomarker_analyzer", "biomarker_analyzer"),
    ]:
        instance = getattr(request.app.state, attr, None)
        components[label] = instance is not None

    return {
        "version": "4.0.0",
        "codename": "Intelligent Synaps",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "adapters": {
            "total": 66,
            "loaded": len([a for a in adapters if a["status"] == "available"]),
            "failed": len([a for a in adapters if a["status"] == "failed"]),
            "pending": len([a for a in adapters if a["status"] == "pending"]),
            "inventory": adapters,
        },
        "components": components,
        "component_status_detail": get_component_status() if _HAS_LIFESPAN_V4 else {},
        "overall": get_overall_status() if _HAS_LIFESPAN_V4 else {},
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  ROOT / META ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/", tags=["Meta"], response_model=dict, include_in_schema=False)
async def root() -> dict[str, Any]:
    """Welcome endpoint with complete system overview."""
    return {
        "name": "DeepSynaps Protocol Studio",
        "version": "4.0.0",
        "codename": "Intelligent Synaps",
        "description": "Clinical Neuromodulation Operating System",
        "documentation": "/docs",
        "redoc": "/redoc",
        "endpoints": {
            "health": "/health",
            "health_ready": "/health/ready",
            "health_detailed": "/health/detailed",
            "version": "/version",
            "adapters": "/adapters",
            "components": "/components",
            "docs": "/docs",
            "redoc": "/redoc",
        },
        "adapters": {
            "total": 66,
            "categories": [
                "pharmaceutical (9)",
                "genetic (10)",
                "neuroimaging (12)",
                "evidence (9)",
                "terminology (5)",
                "adverse_events (5)",
                "ai_literature (6)",
                "pending (10)",
            ],
        },
        "intelligent_synaps_components": [
            "Intelligent Orchestrator",
            "7D Confidence Engine",
            "Cross-Reference Mesh",
            "Evidence Fusion",
            "Smart Cache",
            "Query Planner",
            "Response Synthesizer",
            "Governance Layer",
            "Knowledge Router v2",
        ],
        "analyzer_bridges": [
            "Efficacy Analyzer",
            "Safety Analyzer",
            "Comparator Analyzer",
            "Biomarker Analyzer",
        ],
        "synthesis_engines": [
            "Multimodal Synthesizer",
            "Protocol Generator",
            "Evidence Store",
            "Neuroimaging Pipeline",
        ],
        "deployment": {
            "platform": "Fly.io",
            "url": "https://deepsynaps-studio.fly.dev",
            "repo": "ALIYILD/DeepSynaps-Protocol-Studio",
        },
    }


@app.get("/version", tags=["Meta"], response_model=dict)
async def version_info() -> dict[str, str]:
    """Return precise version and environment info."""
    return {
        "version": "4.0.0",
        "codename": "Intelligent Synaps",
        "build": "2025.05.19-v4-full",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "platform": sys.platform,
    }


@app.get("/adapters", tags=["Meta"], response_model=dict)
async def list_adapters(request: Request) -> dict[str, Any]:
    """List all 66 adapters with their status."""
    # Try adapter_wiring first
    wiring = getattr(request.app.state, "adapter_wiring", None)
    if wiring is not None:
        try:
            return wiring.get_status()
        except Exception as exc:
            logger.warning("Could not get adapter status from wiring: %s", exc)

    # Fallback: try registry
    registry = getattr(request.app.state, "registry", None)
    if registry is not None:
        try:
            available = []
            failed = []
            if hasattr(registry, "list_available_adapters"):
                available = registry.list_available_adapters()
            if hasattr(registry, "list_failed_adapters"):
                failed = registry.list_failed_adapters()
            return {
                "total": 66,
                "available": len(available),
                "failed": len(failed),
                "available_adapters": available,
                "failed_adapters": failed,
            }
        except Exception as exc:
            logger.warning("Could not get adapter status from registry: %s", exc)

    return {
        "total": 66,
        "note": "Adapter status unavailable — check /health/detailed",
    }


@app.get("/components", tags=["Meta"], response_model=dict)
async def list_components() -> dict[str, Any]:
    """List all Intelligent Synaps components and their status."""
    if _HAS_LIFESPAN_V4:
        return get_overall_status()
    return {"status": "unknown", "note": "lifespan_v4 not loaded"}


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTER WIRING
# ═══════════════════════════════════════════════════════════════════════════════
# All routers are registered with graceful degradation — failures are logged
# but never fatal. Each router is wrapped in try/except.

_ROUTER_TABLE: list[tuple[str, str, str, str | None, list[str]]] = [
    # ── Intelligent Synaps Routers ──
    (
        "app.intelligent.intelligent_router",
        "router",
        "Intelligent Synaps Router",
        "/intelligent-synaps",
        ["Intelligent Synaps"],
    ),
    # ── Knowledge & Evidence Routers ──
    (
        "app.routers.knowledge_router_v2",
        "router",
        "Knowledge Router v2",
        "/knowledge",
        ["Knowledge"],
    ),
    (
        "app.routers.evidence_router",
        "router",
        "Evidence Router",
        "/evidence",
        ["Evidence"],
    ),
    # ── Synthesis & Protocol Routers ──
    (
        "app.routers.synthesis_router",
        "router",
        "Synthesis Router",
        "/synthesis",
        ["Synthesis"],
    ),
    (
        "app.routers.protocol_router",
        "router",
        "Protocol Router",
        "/protocol",
        ["Protocol"],
    ),
    # ── Analysis Routers ──
    (
        "app.routers.efficacy_router",
        "router",
        "Efficacy Analysis Router",
        "/analysis/efficacy",
        ["Analysis"],
    ),
    (
        "app.routers.safety_router",
        "router",
        "Safety Analysis Router",
        "/analysis/safety",
        ["Analysis"],
    ),
    (
        "app.routers.comparator_router",
        "router",
        "Comparator Analysis Router",
        "/analysis/comparator",
        ["Analysis"],
    ),
    (
        "app.routers.biomarker_router",
        "router",
        "Biomarker Analysis Router",
        "/analysis/biomarker",
        ["Analysis"],
    ),
    # ── Monitoring & Admin Routers ──
    (
        "app.monitoring.health_dashboard",
        "router",
        "Health Dashboard",
        "/monitoring",
        ["Monitoring"],
    ),
    (
        "app.routers.adapter_admin_router",
        "router",
        "Adapter Admin Router",
        "/admin",
        ["Admin"],
    ),
    # ── QEEG Routers ──
    (
        "app.routers.qeeg_analysis_router",
        "router",
        "QEEG Analysis Router",
        "/qeeg",
        ["Analysis"],
    ),
    (
        "app.routers.qeeg_viz_router",
        "router",
        "QEEG Visualization Router",
        "/qeeg/viz",
        ["Analysis"],
    ),
    (
        "app.routers.qeeg_copilot_router",
        "router",
        "QEEG Copilot Router",
        "/qeeg/copilot",
        ["Analysis"],
    ),
    # ── MRI Routers ──
    (
        "app.routers.mri_analysis_router",
        "router",
        "MRI Analysis Router",
        "/mri",
        ["Analysis"],
    ),
    # ── Neuroimaging Pipeline Router ──
    (
        "app.routers.neuroimaging_router",
        "router",
        "Neuroimaging Pipeline Router",
        "/neuroimaging",
        ["Analysis"],
    ),
    # ── DeepTwin Routers ──
    (
        "app.routers.deeptwin_router",
        "router",
        "DeepTwin Router",
        "/deeptwin",
        ["Intelligent Synaps"],
    ),
    (
        "app.routers.deeptwin_neuroai_lab_router",
        "router",
        "DeepTwin NeuroAI Lab Router",
        "/deeptwin/lab",
        ["Intelligent Synaps"],
    ),
    # ── Clinical Routers ──
    (
        "app.routers.medications_router",
        "router",
        "Medications Router",
        "/medications",
        ["Protocol"],
    ),
    (
        "app.routers.clinical_trials_router",
        "router",
        "Clinical Trials Router",
        "/clinical-trials",
        ["Evidence"],
    ),
    (
        "app.routers.registries_router",
        "router",
        "Registries Router",
        "/registries",
        ["Knowledge"],
    ),
    # ── Patient & Care Team Routers ──
    (
        "app.routers.patient_portal_router",
        "router",
        "Patient Portal Router",
        "/patient",
        ["Protocol"],
    ),
    (
        "app.routers.caregiver_consent_router",
        "router",
        "Caregiver Consent Router",
        "/caregiver",
        ["Protocol"],
    ),
    (
        "app.routers.patient_wearables_router",
        "router",
        "Patient Wearables Router",
        "/wearables",
        ["Monitoring"],
    ),
    # ── Operational Routers ──
    (
        "app.routers.command_center_router",
        "router",
        "Command Center Router",
        "/command",
        ["Admin"],
    ),
    (
        "app.routers.dashboard_router",
        "router",
        "Dashboard Router",
        "/dashboard",
        ["Monitoring"],
    ),
    (
        "app.routers.bio_router",
        "router",
        "Bio Router",
        "/bio",
        ["Knowledge"],
    ),
    # ── Agent Routers ──
    (
        "app.routers.agent_brain_router",
        "router",
        "Agent Brain Router",
        "/agents/brain",
        ["Intelligent Synaps"],
    ),
    (
        "app.routers.agent_admin_router",
        "router",
        "Agent Admin Router",
        "/agents/admin",
        ["Admin"],
    ),
    # ── Studio Routers ──
    (
        "app.routers.studio_eeg_router",
        "router",
        "Studio EEG Router",
        "/studio/eeg",
        ["Analysis"],
    ),
    (
        "app.routers.studio_source_router",
        "router",
        "Studio Source Router",
        "/studio/source",
        ["Analysis"],
    ),
    (
        "app.routers.video_assessment_router",
        "router",
        "Video Assessment Router",
        "/video",
        ["Analysis"],
    ),
]

# Register all routers with fault tolerance
_routers_loaded = 0
_routers_failed = 0

for _mod_path, _attr, _name, _prefix, _tags in _ROUTER_TABLE:
    try:
        _router = _safe_import_router(_mod_path, _attr)
        if _router is not None:
            _kwargs: dict[str, Any] = {"tags": _tags}
            if _prefix:
                _kwargs["prefix"] = _prefix
            app.include_router(_router, **_kwargs)
            _routers_loaded += 1
            logger.info("Router loaded: %-40s prefix=%s", _name, _prefix or "/")
        else:
            _routers_failed += 1
            logger.debug("Router not found: %s", _name)
    except Exception as exc:
        _routers_failed += 1
        logger.warning("Router skipped: %s — %s", _name, exc)

logger.info(
    "Router wiring complete: %s loaded, %s skipped",
    _routers_loaded,
    _routers_failed,
)

# ═══════════════════════════════════════════════════════════════════════════════
#  INTELLIGENT SYNAPS ENDPOINTS (Inline — always available)
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/intelligent-synaps/query", tags=["Intelligent Synaps"], response_model=dict)
async def intelligent_query(request: Request, query: dict) -> dict[str, Any]:
    """Submit a query to the Intelligent Orchestrator.

    The orchestrator coordinates across all 9 intelligent components:
    1. Query Planner — decomposes the clinical query
    2. Cross-Reference Mesh — finds related evidence
    3. Confidence Engine — scores each source
    4. Evidence Fusion — synthesizes findings
    5. Response Synthesizer — generates the final answer
    6. Governance Layer — enforces clinical safety policies
    7. Smart Cache — accelerates repeated queries
    """
    orchestrator = getattr(request.app.state, "orchestrator", None)
    if orchestrator is None:
        return {
            "status": "degraded",
            "message": "Intelligent Orchestrator not available",
            "query": query.get("query", ""),
        }

    try:
        if hasattr(orchestrator, "query") and callable(orchestrator.query):
            if asyncio.iscoroutinefunction(orchestrator.query):
                result = await orchestrator.query(query)
            else:
                result = orchestrator.query(query)
            return {
                "status": "success",
                "result": result,
                "query": query.get("query", ""),
            }
        else:
            return {
                "status": "degraded",
                "message": "Orchestrator query method not available",
                "query": query.get("query", ""),
            }
    except Exception as exc:
        logger.error("Intelligent query error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Intelligent query processing failed: {exc}",
        )


@app.get("/intelligent-synaps/status", tags=["Intelligent Synaps"], response_model=dict)
async def intelligent_status() -> dict[str, Any]:
    """Get status of all Intelligent Synaps components."""
    if _HAS_LIFESPAN_V4:
        return get_overall_status()
    return {
        "status": "unknown",
        "components": {},
        "note": "lifespan_v4 not loaded",
    }


@app.get("/intelligent-synaps/adapters/{category}", tags=["Intelligent Synaps"], response_model=dict)
async def adapters_by_category(category: str, request: Request) -> dict[str, Any]:
    """Get adapters filtered by category.

    Available categories: pharmaceutical, genetic, neuroimaging, evidence,
    terminology, adverse_events, ai_literature, pending
    """
    wiring = getattr(request.app.state, "adapter_wiring", None)
    if wiring is not None:
        try:
            adapters = wiring.list_by_category(category)
            return {
                "category": category,
                "count": len(adapters),
                "adapters": adapters,
            }
        except Exception as exc:
            logger.warning("Could not list adapters by category: %s", exc)

    return {
        "category": category,
        "count": 0,
        "adapters": [],
        "note": "Adapter wiring not available",
    }


@app.get("/intelligent-synaps/adapter/{name}", tags=["Intelligent Synaps"], response_model=dict)
async def adapter_detail(name: str, request: Request) -> dict[str, Any]:
    """Get detailed information about a specific adapter."""
    wiring = getattr(request.app.state, "adapter_wiring", None)
    if wiring is not None:
        spec = wiring.adapters.get(name)
        if spec:
            return {
                "name": spec.name,
                "description": spec.description,
                "category": spec.category,
                "module_path": spec.module_path,
                "class_name": spec.class_name,
                "status": spec.status,
                "priority": spec.priority,
                "error": spec.error,
            }

    return {
        "name": name,
        "status": "unknown",
        "note": "Adapter not found or wiring not available",
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  KNOWLEDGE & EVIDENCE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/knowledge/search", tags=["Knowledge"], response_model=dict)
async def knowledge_search(
    request: Request,
    q: str = "",
    databases: str = "",
) -> dict[str, Any]:
    """Search across all available knowledge adapters.

    Args:
        q: Search query string
        databases: Comma-separated list of database names (empty = all)
    """
    registry = getattr(request.app.state, "registry", None)
    wiring = getattr(request.app.state, "adapter_wiring", None)

    db_list = [d.strip() for d in databases.split(",") if d.strip()] if databases else []

    results = []
    errors = []

    # Try registry search
    if registry is not None and hasattr(registry, "search"):
        try:
            if asyncio.iscoroutinefunction(registry.search):
                search_result = await registry.search(q, databases=db_list or None)
            else:
                search_result = registry.search(q, databases=db_list or None)
            results.append({"source": "registry", "data": search_result})
        except Exception as exc:
            errors.append({"source": "registry", "error": str(exc)})

    # Try wiring search
    if wiring is not None and hasattr(wiring, "_instances"):
        for adapter_name, instance in wiring._instances.items():
            if db_list and adapter_name not in db_list:
                continue
            if hasattr(instance, "search") and callable(instance.search):
                try:
                    if asyncio.iscoroutinefunction(instance.search):
                        adapter_result = await instance.search(q)
                    else:
                        adapter_result = instance.search(q)
                    results.append({"source": adapter_name, "data": adapter_result})
                except Exception as exc:
                    errors.append({"source": adapter_name, "error": str(exc)})

    return {
        "query": q,
        "databases": db_list or "all",
        "results_count": len(results),
        "results": results,
        "errors": errors,
    }


@app.get("/knowledge/databases", tags=["Knowledge"], response_model=dict)
async def list_databases(request: Request) -> dict[str, Any]:
    """List all available knowledge databases/adapters."""
    wiring = getattr(request.app.state, "adapter_wiring", None)
    if wiring is not None:
        try:
            status = wiring.get_status()
            return {
                "total": status.get("total", 0),
                "loaded": status.get("loaded", 0),
                "failed": status.get("failed", 0),
                "pending": status.get("pending", 0),
                "categories": {
                    cat: {
                        "adapters": [
                            {"name": a["name"], "status": a["status"]}
                            for a in cat_data.get("adapters", [])
                        ]
                    }
                    for cat, cat_data in status.get("categories", {}).items()
                },
            }
        except Exception as exc:
            logger.warning("Could not list databases: %s", exc)

    return {
        "total": 66,
        "note": "Detailed database list unavailable",
        "categories": [
            "pharmaceutical",
            "genetic",
            "neuroimaging",
            "evidence",
            "terminology",
            "adverse_events",
            "ai_literature",
            "pending",
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  EVIDENCE & SYNTHESIS ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/evidence/synthesize", tags=["Evidence"], response_model=dict)
async def synthesize_evidence(request: Request, body: dict) -> dict[str, Any]:
    """Synthesize evidence from multiple sources.

    Uses the Multimodal Synthesizer and Evidence Fusion engine to combine
    findings across pharmaceutical, genetic, neuroimaging, and clinical
    trial databases.
    """
    synthesizer = getattr(request.app.state, "multimodal_synthesizer", None)
    if synthesizer is None:
        return {
            "status": "degraded",
            "message": "Multimodal Synthesizer not available",
        }

    try:
        query = body.get("query", "")
        if hasattr(synthesizer, "synthesize") and callable(synthesizer.synthesize):
            if asyncio.iscoroutinefunction(synthesizer.synthesize):
                result = await synthesizer.synthesize(query)
            else:
                result = synthesizer.synthesize(query)
            return {"status": "success", "synthesis": result}
        else:
            return {
                "status": "degraded",
                "message": "Synthesize method not available",
            }
    except Exception as exc:
        logger.error("Evidence synthesis error: %s", exc, exc_info=True)
        return {"status": "error", "message": str(exc)}


@app.post("/protocol/generate", tags=["Protocol"], response_model=dict)
async def generate_protocol(request: Request, body: dict) -> dict[str, Any]:
    """Generate a neuromodulation protocol from clinical parameters.

    Uses the Protocol Generator with input from all 4 analyzer bridges
    to create evidence-based neuromodulation protocols.
    """
    protocol_gen = getattr(request.app.state, "protocol_generator", None)
    if protocol_gen is None:
        return {
            "status": "degraded",
            "message": "Protocol Generator not available",
        }

    try:
        params = body.get("parameters", body)
        if hasattr(protocol_gen, "generate") and callable(protocol_gen.generate):
            if asyncio.iscoroutinefunction(protocol_gen.generate):
                result = await protocol_gen.generate(params)
            else:
                result = protocol_gen.generate(params)
            return {"status": "success", "protocol": result}
        else:
            return {
                "status": "degraded",
                "message": "Generate method not available",
            }
    except Exception as exc:
        logger.error("Protocol generation error: %s", exc, exc_info=True)
        return {"status": "error", "message": str(exc)}


# ═══════════════════════════════════════════════════════════════════════════════
#  ANALYZER BRIDGE ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/analysis/efficacy", tags=["Analysis"], response_model=dict)
async def analyze_efficacy(request: Request, body: dict) -> dict[str, Any]:
    """Run efficacy analysis on treatment data."""
    analyzer = getattr(request.app.state, "efficacy_analyzer", None)
    if analyzer is None:
        return {"status": "degraded", "message": "Efficacy Analyzer not available"}
    try:
        data = body.get("data", body)
        if hasattr(analyzer, "analyze") and callable(analyzer.analyze):
            if asyncio.iscoroutinefunction(analyzer.analyze):
                result = await analyzer.analyze(data)
            else:
                result = analyzer.analyze(data)
            return {"status": "success", "analysis": result}
        return {"status": "degraded", "message": "Analyze method not available"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@app.post("/analysis/safety", tags=["Analysis"], response_model=dict)
async def analyze_safety(request: Request, body: dict) -> dict[str, Any]:
    """Run safety analysis on treatment data."""
    analyzer = getattr(request.app.state, "safety_analyzer", None)
    if analyzer is None:
        return {"status": "degraded", "message": "Safety Analyzer not available"}
    try:
        data = body.get("data", body)
        if hasattr(analyzer, "analyze") and callable(analyzer.analyze):
            if asyncio.iscoroutinefunction(analyzer.analyze):
                result = await analyzer.analyze(data)
            else:
                result = analyzer.analyze(data)
            return {"status": "success", "analysis": result}
        return {"status": "degraded", "message": "Analyze method not available"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@app.post("/analysis/comparator", tags=["Analysis"], response_model=dict)
async def analyze_comparator(request: Request, body: dict) -> dict[str, Any]:
    """Run comparator analysis between treatments."""
    analyzer = getattr(request.app.state, "comparator_analyzer", None)
    if analyzer is None:
        return {"status": "degraded", "message": "Comparator Analyzer not available"}
    try:
        data = body.get("data", body)
        if hasattr(analyzer, "analyze") and callable(analyzer.analyze):
            if asyncio.iscoroutinefunction(analyzer.analyze):
                result = await analyzer.analyze(data)
            else:
                result = analyzer.analyze(data)
            return {"status": "success", "analysis": result}
        return {"status": "degraded", "message": "Analyze method not available"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


@app.post("/analysis/biomarker", tags=["Analysis"], response_model=dict)
async def analyze_biomarker(request: Request, body: dict) -> dict[str, Any]:
    """Run biomarker analysis on patient data."""
    analyzer = getattr(request.app.state, "biomarker_analyzer", None)
    if analyzer is None:
        return {"status": "degraded", "message": "Biomarker Analyzer not available"}
    try:
        data = body.get("data", body)
        if hasattr(analyzer, "analyze") and callable(analyzer.analyze):
            if asyncio.iscoroutinefunction(analyzer.analyze):
                result = await analyzer.analyze(data)
            else:
                result = analyzer.analyze(data)
            return {"status": "success", "analysis": result}
        return {"status": "degraded", "message": "Analyze method not available"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}


# ═══════════════════════════════════════════════════════════════════════════════
#  ADAPTER ADMIN ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.post("/admin/adapters/reload", tags=["Admin"], response_model=dict)
async def reload_adapters(request: Request) -> dict[str, Any]:
    """Reload all adapters (admin only)."""
    wiring = getattr(request.app.state, "adapter_wiring", None)
    if wiring is not None:
        try:
            result = await wiring.initialize_all()
            return {
                "status": "success",
                "message": "Adapters reloaded",
                "loaded": result.get("loaded", 0),
                "failed": result.get("failed", 0),
                "pending": result.get("pending", 0),
            }
        except Exception as exc:
            return {"status": "error", "message": str(exc)}
    return {"status": "degraded", "message": "Adapter wiring not available"}


@app.get("/admin/adapters/health", tags=["Admin"], response_model=dict)
async def adapters_health(request: Request) -> dict[str, Any]:
    """Run health checks on all loaded adapters."""
    wiring = getattr(request.app.state, "adapter_wiring", None)
    if wiring is not None:
        try:
            result = await wiring.health_check_all()
            return result
        except Exception as exc:
            return {"status": "error", "message": str(exc)}
    return {"status": "degraded", "message": "Adapter wiring not available"}


@app.get("/admin/components/restart/{component}", tags=["Admin"], response_model=dict)
async def restart_component(component: str, request: Request) -> dict[str, Any]:
    """Restart a specific component (admin only).

    Available components: cache, confidence_engine, cross_ref_mesh,
    evidence_fusion, query_planner, response_synthesizer
    """
    return {
        "status": "not_implemented",
        "component": component,
        "message": "Component restart requires manual intervention",
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  DEV SERVER ENTRYPOINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    reload = os.environ.get("RELOAD", "false").lower() == "true"
    workers = int(os.environ.get("WORKERS", 1))

    logger.info("=" * 60)
    logger.info("DeepSynaps Protocol Studio v4 — Starting Uvicorn")
    logger.info("  Host    : %s", host)
    logger.info("  Port    : %s", port)
    logger.info("  Reload  : %s", reload)
    logger.info("  Workers : %s", workers)
    logger.info("  Log     : %s", LOG_LEVEL)
    logger.info("=" * 60)

    uvicorn.run(
        "app.main_v4:app",
        host=host,
        port=port,
        reload=reload,
        workers=workers if not reload else 1,
        log_level=LOG_LEVEL.lower(),
        access_log=True,
    )
