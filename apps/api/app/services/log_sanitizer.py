"""PII / PHI redaction helpers for request logs and Sentry events.

Centralised so the request middleware (`log_requests` in app.main) and the
Sentry `before_send` hook share one auditable implementation. The patterns are
intentionally explicit (no clever one-liner regex) so a reviewer can read this
file top-to-bottom and reason about exactly what gets redacted.

Background — follow-up F5 from launch-readiness review:

  Multiple routers expose patient identifiers in the URL path itself, e.g.

      GET /api/v1/patients/PT-123/timeline
      GET /api/v1/deeptwin/patients/PT-456/predictions
      GET /api/v1/qeeg-analysis/{report_id}

  Logging `request.url.path` verbatim leaks PHI into structured logs and into
  Sentry events. The middleware now prefers the matched route template
  (`request.scope["route"].path` → "/api/v1/patients/{patient_id}/timeline")
  and falls back to `sanitize_path()` for unmatched paths (404s, malformed
  requests, etc.).
"""
from __future__ import annotations

import re
from typing import Any, Mapping
from urllib.parse import urlsplit, urlunsplit


# ── Patient-scoped URL prefixes ──────────────────────────────────────────────
# Any route whose path *contains* one of these substrings is considered to be
# carrying patient context. JSON bodies on those routes are dropped from
# Sentry events. Kept as a tuple so it is trivially auditable; ordering does
# not matter (substring match).
PATIENT_SCOPED_SEGMENTS: tuple[str, ...] = (
    "/patients/",
    "/patient/",
    "/deeptwin/",
    "/brain-twin/",
    "/qeeg/",
    "/qeeg-analysis/",
    "/qeeg-live/",
    "/qeeg-copilot/",
    "/qeeg-viz/",
    "/qeeg-records/",
    "/mri/",
    "/mri-analysis/",
    "/wearable/",
    "/assessments/",
    "/consent/",
    "/consents/",
    "/treatment-courses/",
    "/sessions/",
    "/messages/",
    "/media/",
)


# ── Headers always stripped from outbound Sentry events ──────────────────────
SENSITIVE_HEADERS: frozenset[str] = frozenset(
    h.lower()
    for h in (
        "Authorization",
        "Cookie",
        "Set-Cookie",
        "X-Demo-Token",
        "Proxy-Authorization",
    )
)


# ── Path segments that are always safe (never redacted) ──────────────────────
# Anything in the URL grammar that is a known noun, verb, or version. If a
# segment matches any of these, it stays. This list is intentionally broad —
# false-negatives (over-redaction) are acceptable, false-positives (leaving
# an opaque ID untouched) are not.
SAFE_PATH_SEGMENTS: frozenset[str] = frozenset(
    {
        # API versioning + roots
        "api",
        "v1",
        "v2",
        # Service health / docs / metrics
        "health",
        "healthz",
        "metrics",
        "docs",
        "redoc",
        "openapi.json",
        "static",
        # Auth verbs
        "auth",
        "login",
        "logout",
        "register",
        "refresh",
        "me",
        "2fa",
        "verify",
        "reset",
        "password",
        "callback",
        # Core domain nouns (collection names — IDs follow them, not these)
        "patients",
        "patient",
        "sessions",
        "session",
        "assessments",
        "assessment",
        "consent",
        "consents",
        "treatment-courses",
        "course",
        "courses",
        "messages",
        "message",
        "media",
        "deeptwin",
        "brain-twin",
        "qeeg",
        "qeeg-analysis",
        "qeeg-live",
        "qeeg-copilot",
        "qeeg-viz",
        "qeeg-records",
        "qeeg-raw",
        "mri",
        "mri-analysis",
        "fusion",
        "monitor",
        "wearable",
        "wearables",
        "evidence",
        "literature",
        "library",
        "reports",
        "documents",
        "recordings",
        "protocols",
        "registries",
        "review",
        "review-queue",
        "review-actions",
        "audit-trail",
        "intake",
        "preview",
        "uploads",
        "case-summary",
        "handbooks",
        "generate",
        "generate-draft",
        "brain-regions",
        "biomarkers",
        "condition-map",
        "devices",
        "home-devices",
        "home-device-portal",
        "marketplace",
        "marketplace-seller",
        "virtual-care",
        "forms",
        "medications",
        "consent-management",
        "home-program-tasks",
        "home-task-templates",
        "agent-skills",
        "annotations",
        "reminders",
        "irb",
        "literature-watch",
        "leads-reception",
        "personalization",
        "outcomes",
        "phenotype",
        "patient-portal",
        "notifications",
        "adverse-events",
        "feature-store",
        "citation-validator",
        "command-center",
        "device-sync",
        "qa",
        "telegram",
        "chat",
        "payments",
        "finance",
        "export",
        "profile",
        "clinic",
        "team",
        "preferences",
        "data-privacy",
        "risk-stratification",
        "admin",
        "pgvector",
        # Common sub-resources / verbs
        "summary",
        "timeline",
        "signals",
        "correlations",
        "predictions",
        "prediction",
        "simulations",
        "simulation",
        "agent-handoff",
        "red-flags",
        "notes",
        "ai-context",
        "features",
        "draft",
        "publish",
        "activate",
        "preflight",
        "override",
        "complete",
        "start",
        "stop",
        "cancel",
        "schedule",
        "search",
        "list",
        "create",
        "update",
        "delete",
    }
)


# ── ID-shape detectors (explicit, auditable patterns) ────────────────────────
# Each detector is a (name, predicate) pair so a reviewer can read exactly
# what counts as "an ID I should redact". Order matters for readability only;
# the function short-circuits on the first match.

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
_UUID_NO_DASH_RE = re.compile(r"^[0-9a-fA-F]{32}$")
# DeepSynaps-internal patient code prefixes (PT-123, pt-abc, PAT-…).
_PT_PREFIX_RE = re.compile(r"^(PT|pt|PAT|pat|P|p)-[A-Za-z0-9_-]+$")
# Hex blob (e.g. SHA-1/256 prefixes used as IDs).
_HEX_BLOB_RE = re.compile(r"^[0-9a-fA-F]{12,}$")
# ULID / nanoid-like opaque tokens. Length check is enforced separately
# (`> 8`) so this regex only constrains the alphabet.
_OPAQUE_TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _looks_like_id(segment: str) -> bool:
    """Return True if the path segment looks like an opaque identifier.

    Explicit cascade — each check has a name in the comment so an audit can
    walk through the patterns in order:
    """
    if not segment:
        return False

    # 1. Always preserve known-safe nouns / verbs / versions
    if segment.lower() in SAFE_PATH_SEGMENTS:
        return False

    # 2. Canonical UUID (8-4-4-4-12)
    if _UUID_RE.match(segment):
        return True

    # 3. UUID without dashes (32 hex)
    if _UUID_NO_DASH_RE.match(segment):
        return True

    # 4. DeepSynaps patient-code prefix (PT-…, PAT-…, P-…)
    if _PT_PREFIX_RE.match(segment):
        return True

    # 5. Numeric-only segment > 4 chars (avoid clobbering "v1", "2fa")
    if segment.isdigit() and len(segment) > 4:
        return True

    # 6. Long hex blob (sha-prefixes, hashes used as IDs)
    if _HEX_BLOB_RE.match(segment):
        return True

    # 7. Long opaque alphanumeric/dash token (ULID, nanoid, mixed-case slug
    #    with digits). Only triggers above the safe-list cutoff so short
    #    words like "preflight" or "register" stay intact.
    if len(segment) > 8 and _OPAQUE_TOKEN_RE.match(segment) and any(c.isdigit() for c in segment):
        return True

    return False


def sanitize_path(raw_path: str) -> str:
    """Replace opaque ID segments in a URL path with `{id}`.

    Used as a fallback when the matched route template is unavailable
    (404s, ASGI errors before routing, etc.). Preserves leading slash,
    query string, and fragment.

    Examples:
        /api/v1/patients/PT-123/timeline
            → /api/v1/patients/{id}/timeline
        /api/v1/qeeg/analysis/abc-123-def
            → /api/v1/qeeg/analysis/{id}
        /api/v1/health
            → /api/v1/health  (unchanged)
    """
    if not raw_path:
        return raw_path

    # Split off query / fragment so we never accidentally treat a query value
    # as a path segment. urlsplit handles the empty-scheme case cleanly.
    parts = urlsplit(raw_path)
    path = parts.path

    # Preserve leading slash. Walk segments individually.
    segments = path.split("/")
    sanitized = [
        "{id}" if _looks_like_id(seg) else seg
        for seg in segments
    ]
    new_path = "/".join(sanitized)

    return urlunsplit((parts.scheme, parts.netloc, new_path, parts.query, parts.fragment))


def is_patient_scoped_path(path: str) -> bool:
    """True if the path is a patient-scoped route (any matching prefix).

    Used to decide whether to drop request bodies from Sentry events.
    """
    if not path:
        return False
    lowered = path.lower()
    return any(seg in lowered for seg in PATIENT_SCOPED_SEGMENTS)


def scrub_headers(headers: Mapping[str, Any] | None) -> dict[str, Any]:
    """Return a copy of `headers` with sensitive entries removed.

    Header keys are matched case-insensitively. Returns a plain dict so the
    Sentry payload can be JSON-serialised without surprises.
    """
    if not headers:
        return {}
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in SENSITIVE_HEADERS
    }


def _scrub_url_field(url: str) -> str:
    """Apply `sanitize_path()` to the path component of a full URL string."""
    if not url:
        return url
    parts = urlsplit(url)
    sanitized_path = sanitize_path(parts.path)
    # sanitize_path returns a urlunsplit string of just the path; re-extract
    # to recombine with the original scheme/netloc/query/fragment.
    sanitized_parts = urlsplit(sanitized_path)
    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            sanitized_parts.path,
            parts.query,
            parts.fragment,
        )
    )


def scrub_sentry_event(event: dict[str, Any], hint: dict[str, Any] | None = None) -> dict[str, Any] | None:
    """Sentry `before_send` hook.

    Mutates `event` in place AND returns it (Sentry expects either the event
    or `None` to drop). Returning `None` is reserved for cases where the
    event itself is unsafe to forward — currently we always forward, just
    with PII scrubbed.

    Operations:
        1. Replace `request.url` with a sanitised version (path segments
           that look like IDs become `{id}`).
        2. Strip `Authorization`, `Cookie`, `Set-Cookie`, `X-Demo-Token`
           from `request.headers`.
        3. Drop `request.data` entirely if the request is patient-scoped
           AND content-type is JSON. Bodies from non-patient routes (e.g.
           /api/v1/auth/register) are preserved so we keep useful debug
           context for unrelated bugs.
    """
    request = event.get("request")
    if not isinstance(request, dict):
        return event

    # ── Step 1: redact URL ───────────────────────────────────────────────
    url = request.get("url")
    if isinstance(url, str):
        request["url"] = _scrub_url_field(url)

    # Sentry sometimes records the path under a separate key in transactions.
    if isinstance(request.get("path"), str):
        request["path"] = sanitize_path(request["path"])

    # ── Step 2: scrub headers ────────────────────────────────────────────
    headers = request.get("headers")
    if isinstance(headers, dict):
        request["headers"] = scrub_headers(headers)

    # ── Step 3: drop body on patient-scoped JSON routes ──────────────────
    # Decide based on the (already-sanitised) URL/path so we never need to
    # re-introspect raw IDs to make this decision.
    decision_url = request.get("url") if isinstance(request.get("url"), str) else ""
    decision_path = request.get("path") if isinstance(request.get("path"), str) else ""
    target = decision_url or decision_path

    content_type = ""
    request_headers = request.get("headers") or {}
    for header_key, header_value in request_headers.items():
        if header_key.lower() == "content-type" and isinstance(header_value, str):
            content_type = header_value.lower()
            break

    if (
        is_patient_scoped_path(target)
        and "application/json" in content_type
        and "data" in request
    ):
        request["data"] = "[redacted: patient-scoped JSON body]"

    return event
