from __future__ import annotations

import os
import time

import pytest
from fastapi.testclient import TestClient


def test_qeeg_live_ws_smoke_first_frame_under_1s(client: TestClient, monkeypatch) -> None:
    # Enable feature flag in test.
    monkeypatch.setenv("DEEPSYNAPS_FEATURE_LIVE_QEEG", "1")

    # Warm up the streaming pipeline so the timer measures WS frame delivery,
    # not cold-start filter design (scipy.signal.butter SOS design takes ~2 s
    # on first invocation in a fresh interpreter).
    from deepsynaps_qeeg.streaming import RollingFeatures

    RollingFeatures(sfreq=250.0, ch_names=["Cz"])

    # Use admin demo token (enterprise) so entitlement passes.
    url = "/api/v1/qeeg/live/ws?token=admin-demo-token&source=mock"

    t0 = time.perf_counter()
    with client.websocket_connect(url) as ws:
        msg = ws.receive_text()
    elapsed = time.perf_counter() - t0

    assert elapsed < 1.0, f"first frame took {elapsed:.3f}s"
    assert '"type": "frame"' in msg or '"type":"frame"' in msg


# ── Path-traversal + environment guard regression for the mock source ────────
# Pre-fix: ``?source=mock&edf_path=/etc/passwd`` flowed straight into
# mne.io.read_raw_edf. The validator now enforces:
#   - production/staging refuses source=mock entirely
#   - dev/test only accepts edf_path inside an allowlisted fixtures root
# These tests pin both branches.

def test_validate_mock_source_rejects_arbitrary_path_in_test_env(monkeypatch) -> None:
    from app.errors import ApiServiceError
    from app.routers.qeeg_live_router import _validate_mock_source

    # Default test env — should reject anything outside the allowlist roots.
    with pytest.raises(ApiServiceError) as exc:
        _validate_mock_source("/etc/passwd")
    assert exc.value.code == "edf_path_outside_allowlist"
    assert exc.value.status_code == 400


def test_validate_mock_source_rejects_traversal(monkeypatch) -> None:
    from app.errors import ApiServiceError
    from app.routers.qeeg_live_router import _validate_mock_source

    with pytest.raises(ApiServiceError) as exc:
        _validate_mock_source("/tmp/../../../etc/shadow")
    assert exc.value.code == "edf_path_outside_allowlist"


def test_validate_mock_source_blocked_in_production(monkeypatch) -> None:
    from app.errors import ApiServiceError
    from app.routers.qeeg_live_router import _validate_mock_source
    from app.settings import get_settings

    monkeypatch.setattr(get_settings(), "app_env", "production")
    with pytest.raises(ApiServiceError) as exc:
        _validate_mock_source(None)
    assert exc.value.code == "mock_source_disabled"
    assert exc.value.status_code == 403


def test_validate_mock_source_accepts_path_inside_allowlist(monkeypatch, tmp_path) -> None:
    from app.routers.qeeg_live_router import _validate_mock_source

    # Point the env-var override at a tmp dir, drop a file inside, validate.
    monkeypatch.setenv("DEEPSYNAPS_QEEG_FIXTURES_DIR", str(tmp_path))
    fake_edf = tmp_path / "fixture.edf"
    fake_edf.write_bytes(b"")
    # Should not raise.
    _validate_mock_source(str(fake_edf))


def test_qeeg_live_sse_rejects_arbitrary_edf_path(client: TestClient, monkeypatch) -> None:
    """Wire-level regression: a malicious edf_path on the SSE endpoint must
    return 400 before any FS read happens. Feature flag enabled so we exercise
    the real auth + validation path."""
    monkeypatch.setenv("DEEPSYNAPS_FEATURE_LIVE_QEEG", "1")
    resp = client.get(
        "/api/v1/qeeg/live/sse",
        params={"source": "mock", "edf_path": "/etc/passwd"},
        headers={"Authorization": "Bearer admin-demo-token"},
    )
    assert resp.status_code == 400, resp.text
    body = resp.json()
    assert body.get("code") == "edf_path_outside_allowlist"
