"""
DeepSynaps Protocol Studio — Intelligent Synaps v4
Complete FastAPI application with all components wired.

This is the central wiring file that connects all 66 adapters,
9 Intelligent Synaps components, 4 Analyzer Bridges, the
Multimodal Synthesizer, Protocol Generator, and Evidence Store.
"""

from __future__ import annotations

import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ─── Logging Configuration ───────────────────────────────────────────────────

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.environ.get(
    "LOG_FORMAT",
    "%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format=LOG_FORMAT,
    stream=sys.stdout,
)
logger = logging.getLogger("deepsynaps")

# ─── Component Import Helpers ────────────────────────────────────────────────

_component_status: dict[str, dict[str, Any]] = {}


def _safe_import(
    module_path: str,
    attr_name: str | None = None,
) -> Any:
    """Gracefully import a module or attribute; return None on failure."""
    try:
        module = __import__(module_path, fromlist=[attr_name] if attr_name else [])
        if attr_name is None:
            return module
        return getattr(module, attr_name)
    except Exception as exc:
        logger.debug("Import failed for %s.%s: %s", module_path, attr_name or "*", exc)
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  LIFESPAN MANAGER
# ═══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def deepsynaps_lifespan(app: FastAPI):
    """Initialize and gracefully cleanup all subsystems on startup/shutdown."""
    logger.info("=" * 60)
    logger.info("DeepSynaps Protocol Studio v4  —  Boot Sequence")
    logger.info("=" * 60)

    # ── 1. Adapter Registry v3 ────────────────────────────────────────────
    try:
        from app.adapters.adapter_registry_v3 import AdapterRegistry

        app.state.registry = AdapterRegistry()
        await app.state.registry.initialize()
        available = len(app.state.registry.list_available_adapters())
        logger.info("Adapter Registry v3  : %s/66 adapters loaded", available)
        _component_status["adapter_registry"] = {
            "status": "ready",
            "adapters_loaded": available,
        }
    except Exception as exc:
        logger.warning("Adapter Registry init warning: %s", exc)
        app.state.registry = None
        _component_status["adapter_registry"] = {"status": "failed", "error": str(exc)}

    # ── 2. Smart Cache ────────────────────────────────────────────────────
    try:
        from app.intelligent.smart_cache import SmartCache

        app.state.cache = SmartCache()
        logger.info("Smart Cache          : READY")
        _component_status["smart_cache"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Smart Cache init warning: %s", exc)
        app.state.cache = None
        _component_status["smart_cache"] = {"status": "failed", "error": str(exc)}

    # ── 3. Confidence Engine ──────────────────────────────────────────────
    try:
        from app.intelligent.confidence_engine import ConfidenceEngine

        app.state.confidence_engine = ConfidenceEngine()
        logger.info("Confidence Engine    : READY")
        _component_status["confidence_engine"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Confidence Engine init warning: %s", exc)
        app.state.confidence_engine = None
        _component_status["confidence_engine"] = {"status": "failed", "error": str(exc)}

    # ── 4. Governance Layer ───────────────────────────────────────────────
    try:
        from app.intelligent.governance_layer import GovernanceLayer

        app.state.governance = GovernanceLayer()
        logger.info("Governance Layer     : READY")
        _component_status["governance_layer"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Governance Layer init warning: %s", exc)
        app.state.governance = None
        _component_status["governance_layer"] = {"status": "failed", "error": str(exc)}

    # ── 5. Cross-Reference Mesh ───────────────────────────────────────────
    try:
        from app.intelligent.cross_reference_mesh import CrossReferenceMesh

        app.state.cross_ref_mesh = CrossReferenceMesh()
        logger.info("Cross-Reference Mesh : READY")
        _component_status["cross_reference_mesh"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Cross-Reference Mesh init warning: %s", exc)
        app.state.cross_ref_mesh = None
        _component_status["cross_reference_mesh"] = {"status": "failed", "error": str(exc)}

    # ── 6. Evidence Fusion ────────────────────────────────────────────────
    try:
        from app.intelligent.evidence_fusion import EvidenceFusion

        app.state.evidence_fusion = EvidenceFusion()
        logger.info("Evidence Fusion      : READY")
        _component_status["evidence_fusion"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Evidence Fusion init warning: %s", exc)
        app.state.evidence_fusion = None
        _component_status["evidence_fusion"] = {"status": "failed", "error": str(exc)}

    # ── 7. Query Planner ──────────────────────────────────────────────────
    try:
        from app.intelligent.query_planner import QueryPlanner

        app.state.query_planner = QueryPlanner()
        logger.info("Query Planner        : READY")
        _component_status["query_planner"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Query Planner init warning: %s", exc)
        app.state.query_planner = None
        _component_status["query_planner"] = {"status": "failed", "error": str(exc)}

    # ── 8. Response Synthesizer ───────────────────────────────────────────
    try:
        from app.intelligent.response_synthesizer import ResponseSynthesizer

        app.state.response_synthesizer = ResponseSynthesizer()
        logger.info("Response Synthesizer : READY")
        _component_status["response_synthesizer"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Response Synthesizer init warning: %s", exc)
        app.state.response_synthesizer = None
        _component_status["response_synthesizer"] = {"status": "failed", "error": str(exc)}

    # ── 9. Intelligent Orchestrator (depends on above) ────────────────────
    try:
        from app.intelligent.intelligent_orchestrator import IntelligentOrchestrator

        app.state.orchestrator = IntelligentOrchestrator(
            registry=app.state.registry,
            synthesizer=app.state.response_synthesizer,
            confidence_engine=app.state.confidence_engine,
            cross_ref_mesh=app.state.cross_ref_mesh,
            evidence_fusion=app.state.evidence_fusion,
            query_planner=app.state.query_planner,
            governance=app.state.governance,
            cache=app.state.cache,
        )
        logger.info("Intelligent Orchestrator: READY")
        _component_status["orchestrator"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Orchestrator init warning: %s", exc)
        app.state.orchestrator = None
        _component_status["orchestrator"] = {"status": "failed", "error": str(exc)}

    # ── 10. Multimodal Synthesizer ────────────────────────────────────────
    try:
        from app.synthesis.multimodal_synthesizer import MultimodalSynthesizer

        app.state.multimodal_synthesizer = MultimodalSynthesizer()
        logger.info("Multimodal Synthesizer: READY")
        _component_status["multimodal_synthesizer"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Multimodal Synthesizer init warning: %s", exc)
        app.state.multimodal_synthesizer = None
        _component_status["multimodal_synthesizer"] = {"status": "failed", "error": str(exc)}

    # ── 11. Protocol Generator ────────────────────────────────────────────
    try:
        from app.protocol.protocol_generator import ProtocolGenerator

        app.state.protocol_generator = ProtocolGenerator()
        logger.info("Protocol Generator   : READY")
        _component_status["protocol_generator"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Protocol Generator init warning: %s", exc)
        app.state.protocol_generator = None
        _component_status["protocol_generator"] = {"status": "failed", "error": str(exc)}

    # ── 12. Evidence Store ────────────────────────────────────────────────
    try:
        from app.evidence.evidence_store import EvidenceStore

        app.state.evidence_store = EvidenceStore()
        logger.info("Evidence Store       : READY")
        _component_status["evidence_store"] = {"status": "ready"}
    except Exception as exc:
        logger.warning("Evidence Store init warning: %s", exc)
        app.state.evidence_store = None
        _component_status["evidence_store"] = {"status": "failed", "error": str(exc)}

    # ── 13. Analyzer Bridges (×4) ─────────────────────────────────────────
    for bridge_name in [
        "efficacy_analyzer",
        "safety_analyzer",
        "comparator_analyzer",
        "biomarker_analyzer",
    ]:
        try:
            cls = _safe_import(
                f"app.analyzers.{bridge_name}",
                "".join(word.capitalize() for word in bridge_name.split("_")),
            )
            if cls is not None:
                setattr(app.state, bridge_name, cls())
                logger.info("%-20s : READY", bridge_name.replace("_", " ").title())
                _component_status[bridge_name] = {"status": "ready"}
            else:
                raise ImportError(f"Class not found for {bridge_name}")
        except Exception as exc:
            logger.warning("%s init warning: %s", bridge_name, exc)
            setattr(app.state, bridge_name, None)
            _component_status[bridge_name] = {"status": "failed", "error": str(exc)}

    logger.info("=" * 60)
    ready_count = sum(1 for v in _component_status.values() if v["status"] == "ready")
    logger.info(
        "Boot complete — %s/%s components ready",
        ready_count,
        len(_component_status),
    )
    logger.info("=" * 60)

    yield

    # ── Cleanup ───────────────────────────────────────────────────────────
    logger.info("DeepSynaps Protocol Studio — Shutting down...")
    if app.state.registry is not None:
        try:
            await app.state.registry.shutdown()
            logger.info("Adapter Registry     : shutdown complete")
        except Exception as exc:
            logger.error("Adapter Registry shutdown error: %s", exc)

    if app.state.cache is not None:
        try:
            await app.state.cache.close()
            logger.info("Smart Cache          : closed")
        except Exception as exc:
            logger.error("Smart Cache shutdown error: %s", exc)

    if app.state.evidence_store is not None:
        try:
            await app.state.evidence_store.close()
            logger.info("Evidence Store       : closed")
        except Exception as exc:
            logger.error("Evidence Store shutdown error: %s", exc)

    logger.info("Goodbye.")


# ═══════════════════════════════════════════════════════════════════════════════
#  FASTAPI APPLICATION
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title="DeepSynaps Protocol Studio",
    description=(
        "Intelligent Synaps v4 — Clinical Neuromodulation Operating System.\n\n"
        "Wires 66 specialty adapters, 9 intelligent Synaps components, "
        "4 analyzer bridges, multimodal synthesis, protocol generation, "
        "evidence storage, and real-time health monitoring."
    ),
    version="4.0.0",
    lifespan=deepsynaps_lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ─── CORS ────────────────────────────────────────────────────────────────────

# Production CORS origins should be read from environment
_cors_origins = os.environ.get(
    "CORS_ORIGINS",
    "*",  # Default: allow all (override in production)
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID", "X-Request-Duration"],
)

# ─── Request Correlation-ID Middleware ───────────────────────────────────────

@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    """Attach a unique correlation-id to every request for distributed tracing."""
    request.state.correlation_id = request.headers.get(
        "X-Correlation-ID", str(uuid.uuid4())
    )
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = request.state.correlation_id
    return response


# ─── Request Timing Middleware ───────────────────────────────────────────────

@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    """Record request duration for performance monitoring."""
    import time

    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    response.headers["X-Request-Duration"] = f"{elapsed:.4f}s"
    logger.debug(
        "request=%s method=%s path=%s duration=%.4fs",
        request.state.correlation_id,
        request.method,
        request.url.path,
        elapsed,
    )
    return response


# ─── Global Exception Handler ────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle FastAPI HTTPExceptions with correlation-id."""
    logger.warning(
        "HTTP %s — %s  (correlation=%s)",
        exc.status_code,
        exc.detail,
        getattr(request.state, "correlation_id", "n/a"),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "correlation_id": getattr(request.state, "correlation_id", None),
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
        status_code=500,
        content={
            "detail": "Internal server error",
            "correlation_id": correlation_id,
            "type": exc.__class__.__name__,
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  HEALTH ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health", tags=["Health"], response_model=dict)
async def health_check() -> dict[str, Any]:
    """Lightweight liveness probe."""
    return {
        "status": "healthy",
        "version": "4.0.0",
        "codename": "Intelligent Synaps",
    }


@app.get("/health/ready", tags=["Health"], response_model=dict)
async def health_ready() -> dict[str, Any]:
    """Readiness probe — checks all subsystems."""
    checks = {
        "orchestrator": app.state.orchestrator is not None,
        "registry": getattr(app.state, "registry", None) is not None,
        "cache": getattr(app.state, "cache", None) is not None,
        "governance": getattr(app.state, "governance", None) is not None,
        "confidence_engine": getattr(app.state, "confidence_engine", None) is not None,
        "cross_ref_mesh": getattr(app.state, "cross_ref_mesh", None) is not None,
        "evidence_fusion": getattr(app.state, "evidence_fusion", None) is not None,
        "query_planner": getattr(app.state, "query_planner", None) is not None,
        "response_synthesizer": getattr(app.state, "response_synthesizer", None) is not None,
        "multimodal_synthesizer": getattr(app.state, "multimodal_synthesizer", None) is not None,
        "protocol_generator": getattr(app.state, "protocol_generator", None) is not None,
        "evidence_store": getattr(app.state, "evidence_store", None) is not None,
        "efficacy_analyzer": getattr(app.state, "efficacy_analyzer", None) is not None,
        "safety_analyzer": getattr(app.state, "safety_analyzer", None) is not None,
        "comparator_analyzer": getattr(app.state, "comparator_analyzer", None) is not None,
        "biomarker_analyzer": getattr(app.state, "biomarker_analyzer", None) is not None,
    }
    all_ready = all(checks.values())
    return {
        "status": "ready" if all_ready else "degraded",
        "version": "4.0.0",
        "checks": checks,
        "ready_count": sum(checks.values()),
        "total_count": len(checks),
    }


@app.get("/health/detailed", tags=["Health"], response_model=dict)
async def health_detailed() -> dict[str, Any]:
    """Detailed health report with adapter inventory."""
    adapters: list[dict[str, str]] = []
    if app.state.registry is not None:
        try:
            for name in app.state.registry.list_available_adapters():
                adapters.append({"name": name, "status": "available"})
            for name in app.state.registry.list_failed_adapters():
                adapters.append({"name": name, "status": "failed"})
        except Exception as exc:
            logger.warning("Could not enumerate adapters: %s", exc)

    return {
        "version": "4.0.0",
        "adapters_total": 66,
        "adapters_loaded": len([a for a in adapters if a["status"] == "available"]),
        "adapters_failed": len([a for a in adapters if a["status"] == "failed"]),
        "adapters": adapters,
        "components": {
            "orchestrator": app.state.orchestrator is not None,
            "registry": getattr(app.state, "registry", None) is not None,
            "cache": getattr(app.state, "cache", None) is not None,
            "governance": getattr(app.state, "governance", None) is not None,
            "confidence_engine": getattr(app.state, "confidence_engine", None) is not None,
            "cross_reference_mesh": getattr(app.state, "cross_ref_mesh", None) is not None,
            "evidence_fusion": getattr(app.state, "evidence_fusion", None) is not None,
            "query_planner": getattr(app.state, "query_planner", None) is not None,
            "response_synthesizer": getattr(app.state, "response_synthesizer", None) is not None,
            "multimodal_synthesizer": getattr(app.state, "multimodal_synthesizer", None) is not None,
            "protocol_generator": getattr(app.state, "protocol_generator", None) is not None,
            "evidence_store": getattr(app.state, "evidence_store", None) is not None,
            "efficacy_analyzer": getattr(app.state, "efficacy_analyzer", None) is not None,
            "safety_analyzer": getattr(app.state, "safety_analyzer", None) is not None,
            "comparator_analyzer": getattr(app.state, "comparator_analyzer", None) is not None,
            "biomarker_analyzer": getattr(app.state, "biomarker_analyzer", None) is not None,
        },
        "component_status_detail": _component_status,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  ROOT / META ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/", tags=["Root"], response_model=dict, include_in_schema=False)
async def root() -> dict[str, Any]:
    """Welcome endpoint with system overview."""
    return {
        "name": "DeepSynaps Protocol Studio",
        "version": "4.0.0",
        "codename": "Intelligent Synaps",
        "description": "Clinical Neuromodulation Operating System",
        "documentation": "/docs",
        "endpoints": {
            "health": "/health",
            "health_ready": "/health/ready",
            "health_detailed": "/health/detailed",
            "intelligent_synaps": "/intelligent-synaps",
            "knowledge": "/knowledge",
            "evidence": "/evidence",
        },
        "adapters": 66,
        "components": [
            "Intelligent Orchestrator",
            "7D Confidence Engine",
            "Cross-Reference Mesh",
            "Evidence Fusion",
            "Smart Cache",
            "Query Planner",
            "Response Synthesizer",
            "Governance Layer",
            "Multimodal Synthesizer",
            "Protocol Generator",
            "Evidence Store",
            "Efficacy Analyzer",
            "Safety Analyzer",
            "Comparator Analyzer",
            "Biomarker Analyzer",
        ],
    }


@app.get("/version", tags=["Meta"], response_model=dict)
async def version_info() -> dict[str, str]:
    """Return precise version and environment info."""
    return {
        "version": "4.0.0",
        "codename": "Intelligent Synaps",
        "python": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "platform": sys.platform,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTER WIRING (graceful — routers that fail to import are logged, not fatal)
# ═══════════════════════════════════════════════════════════════════════════════

_ROUTER_TABLE = [
    # (module_path, router_attr, display_name, prefix, tags)
    (
        "app.intelligent.intelligent_router",
        "router",
        "Intelligent Synaps Router",
        None,
        ["Intelligent Synaps"],
    ),
    (
        "app.routers.knowledge_router_v2",
        "router",
        "Knowledge Router v2",
        None,
        ["Knowledge"],
    ),
    (
        "app.routers.evidence_router",
        "router",
        "Evidence Router",
        None,
        ["Evidence"],
    ),
    (
        "app.routers.synthesis_router",
        "router",
        "Synthesis Router",
        None,
        ["Synthesis"],
    ),
    (
        "app.routers.protocol_router",
        "router",
        "Protocol Router",
        None,
        ["Protocol"],
    ),
    (
        "app.monitoring.health_dashboard",
        "router",
        "Health Dashboard",
        None,
        ["Monitoring"],
    ),
    (
        "app.routers.adapter_admin_router",
        "router",
        "Adapter Admin Router",
        "/admin",
        ["Admin"],
    ),
]

for _mod_path, _attr, _name, _prefix, _tags in _ROUTER_TABLE:
    try:
        _module = __import__(_mod_path, fromlist=[_attr])
        _router = getattr(_module, _attr)
        _kwargs: dict[str, Any] = {"tags": _tags}
        if _prefix:
            _kwargs["prefix"] = _prefix
        app.include_router(_router, **_kwargs)
        logger.info("Router loaded: %s", _name)
    except Exception as exc:
        logger.warning("Router skipped: %s — %s", _name, exc)


# ═══════════════════════════════════════════════════════════════════════════════
#  DEV SERVER ENTRYPOINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    reload = os.environ.get("RELOAD", "false").lower() == "true"

    logger.info("Starting uvicorn on %s:%s (reload=%s)", host, port, reload)
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload,
        log_level=LOG_LEVEL.lower(),
    )
