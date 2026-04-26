"""Tests for the Sentry `before_send` PII scrubber.

Covers F5 from launch-readiness review: sensitive headers, patient identifiers
in URLs, and JSON request bodies on patient-scoped routes must be scrubbed
before any event leaves the process.

The scrubber is unit-tested directly (no real Sentry transport) — we build a
representative event dict and assert on what comes out.
"""
from __future__ import annotations

from app.services.log_sanitizer import scrub_sentry_event


def _base_event(**request_overrides) -> dict:
    """Build a minimal Sentry event with the given `request` block."""
    return {
        "level": "error",
        "message": "test event",
        "request": {
            "method": "GET",
            "url": "https://api.example.com/api/v1/health",
            "headers": {"Accept": "application/json"},
            **request_overrides,
        },
    }


# ── Header scrubbing ────────────────────────────────────────────────────────


def test_authorization_header_stripped():
    event = _base_event(
        headers={
            "Accept": "application/json",
            "Authorization": "Bearer super-secret-token",
            "X-Request-ID": "req-1",
        }
    )
    out = scrub_sentry_event(event, hint=None)
    assert "Authorization" not in out["request"]["headers"]
    # Non-sensitive headers preserved
    assert out["request"]["headers"]["Accept"] == "application/json"
    assert out["request"]["headers"]["X-Request-ID"] == "req-1"


def test_cookie_and_set_cookie_stripped():
    event = _base_event(
        headers={
            "Cookie": "session=abc",
            "Set-Cookie": "session=xyz; HttpOnly",
            "Accept": "*/*",
        }
    )
    out = scrub_sentry_event(event, hint=None)
    headers = out["request"]["headers"]
    assert "Cookie" not in headers
    assert "Set-Cookie" not in headers
    assert "Accept" in headers


def test_x_demo_token_stripped():
    event = _base_event(
        headers={
            "X-Demo-Token": "demo-clinician",
            "Accept": "application/json",
        }
    )
    out = scrub_sentry_event(event, hint=None)
    assert "X-Demo-Token" not in out["request"]["headers"]


def test_lowercase_authorization_header_also_stripped():
    # Some HTTP libraries lowercase header names; the scrubber matches case-insensitively.
    event = _base_event(
        headers={
            "authorization": "Bearer leak",
            "accept": "application/json",
        }
    )
    out = scrub_sentry_event(event, hint=None)
    assert "authorization" not in out["request"]["headers"]
    assert out["request"]["headers"]["accept"] == "application/json"


# ── URL redaction ───────────────────────────────────────────────────────────


def test_patient_id_in_url_redacted():
    event = _base_event(
        url="https://api.example.com/api/v1/patients/PT-456/timeline?range=30d"
    )
    out = scrub_sentry_event(event, hint=None)
    assert "PT-456" not in out["request"]["url"]
    assert "/api/v1/patients/{id}/timeline" in out["request"]["url"]
    # Query string preserved
    assert "range=30d" in out["request"]["url"]


def test_uuid_in_url_redacted():
    event = _base_event(
        url="https://api.example.com/api/v1/sessions/12345678-1234-1234-1234-123456789012/start"
    )
    out = scrub_sentry_event(event, hint=None)
    assert "12345678-1234-1234-1234-123456789012" not in out["request"]["url"]
    assert "{id}" in out["request"]["url"]


def test_path_field_also_redacted():
    # Some Sentry transactions populate `path` instead of (or alongside) `url`.
    event = {
        "request": {
            "method": "GET",
            "url": "https://api.example.com/api/v1/patients/PT-1/timeline",
            "path": "/api/v1/patients/PT-1/timeline",
            "headers": {},
        }
    }
    out = scrub_sentry_event(event, hint=None)
    assert "PT-1" not in out["request"]["path"]


def test_url_without_pii_unchanged():
    event = _base_event(url="https://api.example.com/api/v1/health")
    out = scrub_sentry_event(event, hint=None)
    assert out["request"]["url"] == "https://api.example.com/api/v1/health"


# ── Body redaction ──────────────────────────────────────────────────────────


def test_json_body_dropped_on_patient_scoped_route():
    event = _base_event(
        url="https://api.example.com/api/v1/patients/PT-1/timeline",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data={"diagnosis": "MDD", "phq9": 21, "ssrs": "high"},
    )
    out = scrub_sentry_event(event, hint=None)
    body = out["request"]["data"]
    assert isinstance(body, str)
    assert "redacted" in body.lower()
    # Original PHI strings must not survive in the event payload
    assert "MDD" not in body
    assert "phq9" not in body


def test_json_body_dropped_on_deeptwin_route():
    event = _base_event(
        url="https://api.example.com/api/v1/deeptwin/patients/PT-1/predictions",
        headers={"Content-Type": "application/json"},
        data={"horizon_days": 30},
    )
    out = scrub_sentry_event(event, hint=None)
    assert isinstance(out["request"]["data"], str)
    assert "redacted" in out["request"]["data"].lower()


def test_json_body_preserved_on_auth_register():
    event = _base_event(
        url="https://api.example.com/api/v1/auth/register",
        headers={"Content-Type": "application/json"},
        data={"email": "user@example.com", "role": "clinician"},
    )
    out = scrub_sentry_event(event, hint=None)
    # Non-patient-scoped route — body retained for debugging context
    assert out["request"]["data"] == {
        "email": "user@example.com",
        "role": "clinician",
    }


def test_json_body_preserved_on_health():
    event = _base_event(
        url="https://api.example.com/api/v1/health",
        headers={"Content-Type": "application/json"},
        data={"check": "deep"},
    )
    out = scrub_sentry_event(event, hint=None)
    assert out["request"]["data"] == {"check": "deep"}


def test_non_json_body_preserved_on_patient_scoped_route():
    # The redaction targets JSON bodies specifically — multipart uploads
    # (e.g. EDF/MRI files) are handled by Sentry's own size limits.
    event = _base_event(
        url="https://api.example.com/api/v1/patients/PT-1/upload",
        headers={"Content-Type": "multipart/form-data; boundary=xyz"},
        data="<binary>",
    )
    out = scrub_sentry_event(event, hint=None)
    assert out["request"]["data"] == "<binary>"


# ── Combined / robustness ───────────────────────────────────────────────────


def test_event_without_request_block_returned_unchanged():
    event = {"level": "error", "message": "no request"}
    out = scrub_sentry_event(event, hint=None)
    assert out == {"level": "error", "message": "no request"}


def test_event_with_empty_request_block():
    event = {"level": "error", "request": {}}
    out = scrub_sentry_event(event, hint=None)
    # Should not raise, should return the (empty-but-present) request block.
    assert out["request"] == {}


def test_combined_scrubbing():
    event = _base_event(
        url="https://api.example.com/api/v1/patients/PT-789/messages?unread=1",
        headers={
            "Authorization": "Bearer leak",
            "Cookie": "sess=leak",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        data={"body": "patient note: severe MDD"},
    )
    out = scrub_sentry_event(event, hint=None)
    headers = out["request"]["headers"]
    assert "Authorization" not in headers
    assert "Cookie" not in headers
    assert "PT-789" not in out["request"]["url"]
    assert "{id}" in out["request"]["url"]
    assert "unread=1" in out["request"]["url"]
    assert isinstance(out["request"]["data"], str)
    assert "redacted" in out["request"]["data"].lower()
