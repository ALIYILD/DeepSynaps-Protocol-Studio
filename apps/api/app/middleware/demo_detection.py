"""Demo Detection Middleware.

Detects and handles demo data in API responses. This middleware provides
defense-in-depth against demo data leaking into production responses.

Rules:
1. If response contains demo data, adds X-Demo-Mode: true header
2. In production, blocks requests to /api/v1/*/demo/* endpoints
3. In production, logs CRITICAL if demo data detected in response
4. All demo data access is audit-logged regardless of environment
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response as StarletteResponse

from app.security.is_demo import (
    DEMO_CLINIC_IDS,
    is_demo_clinic_id,
    is_demo_env,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Endpoints that are explicitly demo-only and blocked in production.
DEMO_ENDPOINT_PREFIXES: list[str] = [
    "/api/v1/demo/",
    "/api/v1/mri/demo/",
]

# Byte-string indicators of demo data in JSON responses.
_DEMO_BODY_INDICATORS: list[bytes] = [
    b'"demo": true',
    b'"is_demo": true',
    b'"demo_mode": true',
    b'"source": "demo"',
    b'"clinic_id": "demo"',
    b'"demo_clinic"',
    b"@example.com",  # Demo email addresses
    b"clinic-demo-default",
    b"clinic-cd-demo",
    b'"demo_clinician@example.com"',
    b'"demo_admin@example.com"',
]

# Human-readable labels for matched indicators (used in logs).
_INDICATOR_LABELS: dict[bytes, str] = {
    b'"demo": true': "demo_flag",
    b'"is_demo": true': "is_demo_flag",
    b'"demo_mode": true': "demo_mode_flag",
    b'"source": "demo"': "demo_source",
    b'"clinic_id": "demo"': "demo_clinic_id_literal",
    b'"demo_clinic"': "demo_clinic_key",
    b"@example.com": "demo_email_domain",
    b"clinic-demo-default": "demo_clinic_default",
    b"clinic-cd-demo": "demo_clinic_cd",
    b'"demo_clinician@example.com"': "demo_clinician_email",
    b'"demo_admin@example.com"': "demo_admin_email",
}

# Header that indicates demo data at the response level.
_DEMO_HEADER_SOURCE: str = "X-Data-Source"
_DEMO_HEADER_SOURCE_VALUE: str = "demo"

# Environment detection.
_ENV_PRODUCTION: str = "production"
_ENV_VAR_APP_ENV: str = "DEEPSYNAPS_APP_ENV"

# Response header injected when demo data is detected.
_HEADER_DEMO_MODE: str = "X-Demo-Mode"
_HEADER_DEMO_TRUE: str = "true"
_HEADER_DEMO_FALSE: str = "false"

# Production block response.
_PRODUCTION_BLOCK_STATUS: int = 403
_PRODUCTION_BLOCK_BODY: dict[str, str] = {
    "error": "Demo endpoints are not available in production",
    "detail": "This endpoint serves demo data which cannot be used with real patient data.",
}


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------


class DemoDetectionMiddleware(BaseHTTPMiddleware):
    """Middleware that detects demo data and enforces demo/production boundaries.

    This middleware performs **three** checks on every request/response cycle:

    1. **Endpoint block** — In production, requests targeting ``/api/v1/*/demo/*``
       are rejected with a 403 before they reach the route handler.
    2. **Header detection** — If the response carries ``X-Data-Source: demo`` it
       is treated as containing demo data.
    3. **Body scanning** — The response body (if buffer-backed) is scanned for
       byte-string indicators such as ``"demo": true`` or demo clinic IDs.

    When demo data is detected the ``X-Demo-Mode: true`` response header is
    unconditionally injected. In production, a **CRITICAL** log line is emitted
    for every detection so that SIEM rules can alert on demo-data leaks.

    The middleware is intentionally placed **after** ``MetricsMiddleware`` in the
    FastAPI middleware stack so that it sees the final response (after metrics
    have been collected) and can add headers without affecting latency
    measurements.
    """

    async def dispatch(
        self, request: Request, call_next
    ) -> StarletteResponse:
        # --- Check 1: Block demo endpoints in production (pre-route) ----------
        if self._is_production() and self._is_demo_endpoint(request):
            logger.critical(
                "PRODUCTION SAFETY: Demo endpoint blocked | method=%s path=%s "
                "client=%s",
                request.method,
                request.url.path,
                self._client_addr(request),
                extra={
                    "event": "demo_endpoint_blocked",
                    "method": request.method,
                    "path": request.url.path,
                    "production": True,
                },
            )
            self._audit_log_blocked(request)
            return JSONResponse(
                status_code=_PRODUCTION_BLOCK_STATUS,
                content=_PRODUCTION_BLOCK_BODY,
                headers={_HEADER_DEMO_MODE: _HEADER_DEMO_TRUE},
            )

        # --- Let the route handler run ----------------------------------------
        response: StarletteResponse = await call_next(request)

        # --- Check 2 & 3: Detect demo data in response ------------------------
        indicators_found: list[str] = self._scan_response(response)
        has_demo_data: bool = bool(indicators_found)

        # Always set X-Demo-Mode header so downstream consumers can rely on it.
        response.headers[_HEADER_DEMO_MODE] = (
            _HEADER_DEMO_TRUE if has_demo_data else _HEADER_DEMO_FALSE
        )

        if has_demo_data:
            self._handle_demo_detected(request, response, indicators_found)

        return response

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _is_production(self) -> bool:
        """Return ``True`` when the app is running in production.

        Prefers ``DEEPSYNAPS_APP_ENV`` for consistency with the rest of the
        codebase, falling back to the legacy ``APP_ENV`` variable.
        """
        env = os.environ.get(_ENV_VAR_APP_ENV, os.environ.get("APP_ENV", ""))
        return env == _ENV_PRODUCTION

    def _is_demo_endpoint(self, request: Request) -> bool:
        """Return ``True`` if the request path matches a demo-only prefix."""
        path: str = request.url.path
        return any(path.startswith(prefix) for prefix in DEMO_ENDPOINT_PREFIXES)

    def _scan_response(self, response: StarletteResponse) -> list[str]:
        """Scan *response* for demo indicators.

        Returns a list of matched indicator labels (empty list = no demo data).
        The scan checks headers first (cheap) then falls back to body bytes.
        """
        matched: list[str] = []

        # --- Header check ---
        if response.headers.get(_DEMO_HEADER_SOURCE) == _DEMO_HEADER_SOURCE_VALUE:
            matched.append("header_x_data_source")

        # --- Body check (only for buffer-backed responses) ---
        body_indicators = self._scan_body(response)
        matched.extend(body_indicators)

        return matched

    def _scan_body(self, response: StarletteResponse) -> list[str]:
        """Scan response body bytes for demo indicators.

        Only ``Response`` subclasses with a ``.body`` attribute are inspected.
        ``StreamingResponse`` bodies are intentionally skipped because consuming
        the iterator would break the response delivery.
        """
        matched: list[str] = []

        # Avoid consuming streaming responses — would break SSE/file downloads.
        if isinstance(response, StreamingResponse):
            return matched

        try:
            body: Optional[bytes] = getattr(response, "body", None)
            if body is not None and isinstance(body, bytes):
                for indicator in _DEMO_BODY_INDICATORS:
                    if indicator in body:
                        label = _INDICATOR_LABELS.get(indicator, indicator.decode("utf-8", errors="replace"))
                        if label not in matched:
                            matched.append(label)
        except Exception:
            # Defensive: never crash the response because scanning failed.
            logger.debug("Demo body scan skipped due to exception", exc_info=True)

        return matched

    def _handle_demo_detected(
        self,
        request: Request,
        response: StarletteResponse,
        indicators_found: list[str],
    ) -> None:
        """Emit appropriate logs when demo data is detected in a response."""
        is_prod = self._is_production()
        log_extras = {
            "event": "demo_data_detected",
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "indicators": indicators_found,
            "production": is_prod,
            "client": self._client_addr(request),
        }

        # In production this is a CRITICAL safety event.
        if is_prod:
            logger.critical(
                "PRODUCTION SAFETY: Demo data detected in response | "
                "method=%s path=%s status=%s indicators=%s",
                request.method,
                request.url.path,
                response.status_code,
                indicators_found,
                extra=log_extras,
            )
        else:
            # Non-prod environments log at INFO for audit trail.
            logger.info(
                "Demo data detected in response | method=%s path=%s indicators=%s",
                request.method,
                request.url.path,
                indicators_found,
                extra=log_extras,
            )

        # Audit log (unconditional — all environments).
        self._audit_log_access(request, indicators_found, is_prod)

    def _audit_log_blocked(self, request: Request) -> None:
        """Emit a dedicated audit-log entry for blocked demo endpoint access."""
        logger.warning(
            "AUDIT: Demo endpoint access blocked | method=%s path=%s env=production",
            request.method,
            request.url.path,
            extra={
                "event": "demo_access_blocked",
                "method": request.method,
                "path": request.url.path,
                "action": "blocked",
                "reason": "production_safety",
            },
        )

    def _audit_log_access(
        self,
        request: Request,
        indicators: list[str],
        is_production: bool,
    ) -> None:
        """Emit an unconditional audit-log entry for demo data access.

        This log line is designed to be scraped by the audit-trail pipeline
        regardless of the environment (dev, staging, production).
        """
        logger.info(
            "AUDIT: Demo data served | method=%s path=%s indicators=%s production=%s",
            request.method,
            request.url.path,
            indicators,
            is_production,
            extra={
                "event": "demo_data_served",
                "method": request.method,
                "path": request.url.path,
                "indicators_found": indicators,
                "production": is_production,
                "client": self._client_addr(request),
            },
        )

    @staticmethod
    def _client_addr(request: Request) -> str:
        """Return the client IP address (or 'unknown')."""
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


# ---------------------------------------------------------------------------
# Registration helper
# ---------------------------------------------------------------------------


def register_demo_middleware(app) -> None:
    """Register :class:`DemoDetectionMiddleware` on the FastAPI app.

    The middleware is added **after** ``MetricsMiddleware`` in the FastAPI
    middleware stack so that it sees the fully-formed response and can inject
    the ``X-Demo-Mode`` header without interfering with Prometheus metrics
    collection.
    """
    app.add_middleware(DemoDetectionMiddleware)
