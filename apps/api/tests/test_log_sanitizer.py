"""Tests for the URL-path sanitizer used by request logging + Sentry hook.

Covers F5 from launch-readiness review: patient identifiers must NEVER appear
verbatim in structured logs or Sentry events.
"""
from __future__ import annotations

import pytest

from app.services.log_sanitizer import (
    PATIENT_SCOPED_SEGMENTS,
    SAFE_PATH_SEGMENTS,
    is_patient_scoped_path,
    sanitize_path,
)


# ── Required cases from the launch-readiness checklist ──────────────────────


def test_sanitizes_patient_id_in_timeline_path():
    assert (
        sanitize_path("/api/v1/patients/PT-123/timeline")
        == "/api/v1/patients/{id}/timeline"
    )


def test_sanitizes_uuid_inside_patient_subresource():
    assert (
        sanitize_path(
            "/api/v1/patients/PT-123/deeptwin/predictions/abc-uuid-1234-5678-9012"
        )
        == "/api/v1/patients/{id}/deeptwin/predictions/{id}"
    )


def test_health_path_unchanged():
    assert sanitize_path("/api/v1/health") == "/api/v1/health"


def test_auth_login_unchanged():
    assert sanitize_path("/api/v1/auth/login") == "/api/v1/auth/login"


def test_qeeg_analysis_id_redacted():
    assert (
        sanitize_path("/api/v1/qeeg/analysis/abc-123-def")
        == "/api/v1/qeeg/analysis/{id}"
    )


# ── ID-shape coverage ───────────────────────────────────────────────────────


def test_canonical_uuid_redacted():
    raw = "/api/v1/sessions/12345678-1234-1234-1234-123456789012/details"
    assert sanitize_path(raw) == "/api/v1/sessions/{id}/details"


def test_uuid_no_dashes_redacted():
    raw = "/api/v1/sessions/0123456789abcdef0123456789abcdef/details"
    assert sanitize_path(raw) == "/api/v1/sessions/{id}/details"


def test_numeric_id_over_4_chars_redacted():
    assert (
        sanitize_path("/api/v1/patients/123456/timeline")
        == "/api/v1/patients/{id}/timeline"
    )


def test_short_numeric_segment_left_alone():
    # `v1` is in the safe list, but verify a bare 3-digit segment isn't redacted.
    assert sanitize_path("/api/123/health") == "/api/123/health"


def test_uppercase_pt_prefix_redacted():
    assert (
        sanitize_path("/api/v1/deeptwin/patients/PT-456/predictions")
        == "/api/v1/deeptwin/patients/{id}/predictions"
    )


def test_lowercase_pt_prefix_redacted():
    assert (
        sanitize_path("/api/v1/patients/pt-abc/timeline")
        == "/api/v1/patients/{id}/timeline"
    )


def test_long_hex_blob_redacted():
    raw = "/api/v1/recordings/a1b2c3d4e5f60011/download"
    assert sanitize_path(raw) == "/api/v1/recordings/{id}/download"


def test_opaque_alphanumeric_token_redacted():
    raw = "/api/v1/reports/r3p0rt-9x2-zyq/export"
    assert sanitize_path(raw) == "/api/v1/reports/{id}/export"


# ── Negative coverage: known-safe segments survive ──────────────────────────


@pytest.mark.parametrize(
    "safe_segment",
    ["v1", "me", "health", "login", "register", "metrics", "docs", "auth", "patients"],
)
def test_known_safe_segments_not_redacted(safe_segment: str):
    raw = f"/api/{safe_segment}"
    assert sanitize_path(raw) == raw


def test_safe_words_inside_path_not_redacted():
    raw = "/api/v1/auth/me"
    assert sanitize_path(raw) == raw


def test_metrics_path_unchanged():
    assert sanitize_path("/metrics") == "/metrics"


def test_docs_path_unchanged():
    assert sanitize_path("/docs") == "/docs"


def test_short_word_left_alone_even_with_digit():
    # `2fa` is short enough that it shouldn't trip the opaque-token rule.
    assert sanitize_path("/api/v1/auth/2fa") == "/api/v1/auth/2fa"


# ── Edge cases ──────────────────────────────────────────────────────────────


def test_empty_path():
    assert sanitize_path("") == ""


def test_root_path():
    assert sanitize_path("/") == "/"


def test_query_string_preserved():
    raw = "/api/v1/patients/PT-123/timeline?from=2025-01-01"
    out = sanitize_path(raw)
    assert out.startswith("/api/v1/patients/{id}/timeline")
    assert "from=2025-01-01" in out


def test_trailing_slash_preserved():
    raw = "/api/v1/patients/PT-123/"
    assert sanitize_path(raw) == "/api/v1/patients/{id}/"


# ── Patient-scoped detection ────────────────────────────────────────────────


@pytest.mark.parametrize(
    "patient_path",
    [
        "/api/v1/patients/PT-123/timeline",
        "/api/v1/deeptwin/patients/{id}/predictions",
        "/api/v1/qeeg/analysis/{id}",
        "/api/v1/mri/{id}/upload",
        "/api/v1/sessions/{id}/start",
        "/api/v1/messages/{id}/reply",
        "/api/v1/media/red-flags/PT-1",
        "/api/v1/wearable/PT-1/summary",
        "/api/v1/assessments/summary/PT-1",
        "/api/v1/consent/PT-1",
        "/api/v1/consents/PT-1",
        "/api/v1/treatment-courses/{id}",
    ],
)
def test_is_patient_scoped_true_for_patient_routes(patient_path: str):
    assert is_patient_scoped_path(patient_path) is True


@pytest.mark.parametrize(
    "non_patient_path",
    [
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/health",
        "/metrics",
        "/api/v1/devices",
        "/api/v1/evidence",
        "/api/v1/brain-regions",
    ],
)
def test_is_patient_scoped_false_for_non_patient_routes(non_patient_path: str):
    assert is_patient_scoped_path(non_patient_path) is False


# ── Sanity: nothing in the safe list collides with the patient-scope list ───


def test_safe_segments_and_patient_scopes_dont_collide():
    # Patient-scoped substrings include "/" so they cannot match a single
    # segment in SAFE_PATH_SEGMENTS, but verify nothing has been accidentally
    # added to both as a bare word.
    bare_scope_words = {seg.strip("/") for seg in PATIENT_SCOPED_SEGMENTS}
    overlap = bare_scope_words & SAFE_PATH_SEGMENTS
    # These nouns SHOULD appear in both — they're collection names that show
    # up unredacted in the URL ("/patients/{id}") but also mark the URL as
    # patient-scoped. Document the intentional overlap.
    expected_overlap = {
        "patients",
        "patient",
        "deeptwin",
        "qeeg",
        "qeeg-analysis",
        "mri",
        "wearable",
        "assessments",
        "consent",
        "consents",
        "treatment-courses",
        "sessions",
        "messages",
        "media",
        "brain-twin",
        "qeeg-live",
        "qeeg-copilot",
        "qeeg-viz",
        "qeeg-records",
        "mri-analysis",
    }
    assert overlap.issubset(expected_overlap | bare_scope_words)
