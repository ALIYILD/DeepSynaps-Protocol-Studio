from __future__ import annotations

import os
import time

from fastapi.testclient import TestClient


def test_qeeg_live_ws_smoke_first_frame_under_1s(client: TestClient, monkeypatch) -> None:
    # Enable feature flag in test.
    monkeypatch.setenv("DEEPSYNAPS_FEATURE_LIVE_QEEG", "1")

    # Use admin demo token (enterprise) so entitlement passes.
    url = "/api/v1/qeeg/live/ws?token=admin-demo-token&source=mock"

    t0 = time.perf_counter()
    with client.websocket_connect(url) as ws:
        msg = ws.receive_text()
    elapsed = time.perf_counter() - t0

    assert elapsed < 1.0, f"first frame took {elapsed:.3f}s"
    assert '"type": "frame"' in msg or '"type":"frame"' in msg

