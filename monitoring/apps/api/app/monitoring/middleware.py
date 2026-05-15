"""DeepSynaps Protocol Studio — Metrics Collection Middleware.

A single FastAPI middleware that records RED metrics (Rate, Errors, Duration)
for every request.  Integrates cleanly with the existing logging and
exception-handling infrastructure in ``app.main``.

Key design decisions:
1. Route templates (not raw URLs) are used as ``endpoint`` labels to avoid
   cardinality explosion from path parameters (patient_id, etc.).
2. All label values are validated to be PHI-safe before recording.
3. The middleware is intentionally thin — heavy work is delegated to
   ``app.monitoring.metrics`` helper functions.
4. Errors are classified into buckets (validation, auth, clinical, internal,
   timeout) so AlertManager can route them appropriately.
"""

from __future__ import annotations

import time
from typing import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import PlainTextResponse

from app.monitoring import metrics
from app.logging_setup import get_logger

logger = get_logger(__name__)

# Endpoints that should not be tracked in metrics (health checks, metrics
# self-scrape, static assets) to reduce noise and cardinality.
_SKIP_PATHS = {
    "/health",
    "/healthz",
    "/api/v1/health",
    "/metrics",
    "/favicon.ico",
    "/robots.txt",
    "/static/",
    "/openapi.json",
    "/docs",
    "/redoc",
}

# Routes that are always considered "clinical" for error classification.
_CLINICAL_PREFIXES = (
    "/api/v1/patients",
    "/api/v1/protocols",
    "/api/v1/assessments",
    "/api/v1/treatment",
    "/api/v1/qeeg",
    "/api/v1/mri",
    "/api/v1/evidence",
    "/api/v1/adverse-events",
    "/api/v1/outcomes",
    "/api/v1/consent",
    "/api/v1/biometrics",
)


def _should_skip(request: Request) -> bool:
    """Return ``True`` if the request path should not be tracked."""
    path = request.url.path
    if path in _SKIP_PATHS:
        return True
    for prefix in ("/static/", "/docs", "/redoc", "/openapi.json"):
        if path.startswith(prefix):
            return True
    return False


def _extract_endpoint(request: Request) -> str:
    """Extract a safe endpoint label from the request.

    Prefers the matched route template (``/api/v1/patients/{patient_id}``) so
    that path parameters don't create unbounded cardinality.  Falls back to
    the raw path (sanitised) only when no route matched (404, early ASGI
    error).
    """
    route = request.scope.get("route")
    if route is not None:
        template = getattr(route, "path", None)
        if isinstance(template, str) and template:
            return template
    # Fallback — sanitise any UUIDs or numeric IDs from the raw path
    return _sanitise_path(request.url.path)


def _sanitise_path(path: str) -> str:
    """Replace dynamic path segments with placeholders to keep cardinality
    bounded when no FastAPI route matched.
    """
    import re

    # Replace UUIDs
    path = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        "{uuid}",
        path,
        flags=re.I,
    )
    # Replace numeric IDs (but keep version numbers like v1)
    path = re.sub(r"/(\d+)(?=[/$]|$)", "/{id}", path)
    return path


def _classify_error(status_code: int, endpoint: str) -> str:
    """Classify the error type based on status code and endpoint path.

    This lets AlertManager distinguish between auth failures (medium
    severity), validation errors (low), and clinical pipeline failures
    (potentially high).
    """
    if status_code == 429:
        return "rate_limit"
    if status_code in (401, 403, 419):
        return "auth"
    if status_code == 422:
        return "validation"
    if status_code == 408:
        return "timeout"
    if status_code >= 500:
        if endpoint.startswith(_CLINICAL_PREFIXES):
            return "clinical"
        return "internal"
    return "other"


def _is_clinical_endpoint(endpoint: str) -> bool:
    """Return ``True`` if the endpoint is part of the clinical surface."""
    return endpoint.startswith(_CLINICAL_PREFIXES)


class MetricsMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that records Prometheus RED metrics for every
    request and exposes a ``/metrics`` endpoint for Prometheus scraping.
    """

    def __init__(self, app: FastAPI) -> None:
        super().__init__(app)

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        # Serve the Prometheus scrape endpoint directly
        if request.url.path == "/metrics" and request.method == "GET":
            return PlainTextResponse(
                content=metrics.get_metrics_payload(),
                media_type="text/plain; version=0.0.4; charset=utf-8",
            )

        if _should_skip(request):
            return await call_next(request)

        method = request.method
        endpoint = _extract_endpoint(request)
        metrics.start_request(method)
        start_time = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            # Unhandled exception — no response object available.
            duration = time.perf_counter() - start_time
            metrics.end_request(method, endpoint, 500, duration)
            metrics.record_error("internal", endpoint, 500)
            raise

        duration = time.perf_counter() - start_time
        status_code = response.status_code

        # Record core RED metrics
        metrics.end_request(method, endpoint, status_code, duration)

        # Record errors for non-2xx responses
        if status_code >= 400:
            error_type = _classify_error(status_code, endpoint)
            metrics.record_error(error_type, endpoint, status_code)

            # Security-relevant events get their own counter
            if status_code in (401, 403):
                metrics.record_security_event("failed_auth", "high" if _is_clinical_endpoint(endpoint) else "medium")
            elif status_code == 429:
                metrics.record_security_event("rate_limit_hit", "medium")

        # Log slow requests for operational visibility (> 95th-percentile SLO)
        slo_latency_ms = 200.0
        if (duration * 1000) > slo_latency_ms and status_code < 500:
            logger.warning(
                "slow request detected",
                extra={
                    "method": method,
                    "path": endpoint,
                    "status_code": status_code,
                    "duration_ms": round(duration * 1000, 2),
                    "request_id": getattr(request.state, "request_id", None),
                },
            )

        return response


def register_metrics_endpoint(app: FastAPI) -> None:
    """Idempotently mount the /metrics endpoint.

    If the MetricsMiddleware is already installed this is a no-op because
    the middleware itself intercepts ``GET /metrics``.  This function is
    provided as a convenience for deployments that prefer a dedicated
    route rather than middleware interception.
    """
    from fastapi import APIRouter

    router = APIRouter(tags=["monitoring"])

    @router.get("/metrics", include_in_schema=False)
    async def _metrics_endpoint() -> PlainTextResponse:
        return PlainTextResponse(
            content=metrics.get_metrics_payload(),
            media_type="text/plain; version=0.0.4; charset=utf-8",
        )

    app.include_router(router)
