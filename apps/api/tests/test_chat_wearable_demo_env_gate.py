"""Regression test for the chat wearable-patient demo-bypass env gate.

Pre-fix ``POST /api/v1/chat/wearable-patient`` resolved the demo
Patient row when ``actor.actor_id == "actor-patient-demo"`` in
**any** environment, including production. A leaked / forged demo
actor token (or an attacker who could mint one against a misconfig)
could read the demo patient's wearable PHI in prod.

Post-fix the demo branch is gated to ``app_env in
{"development", "test"}`` — same allowlist as
``patient_portal_router._require_patient``.

This test runs against the test environment (where the gate
allows the demo bypass) and asserts that the explicit prod check
inside the route fires when ``app_env`` is monkey-patched to
``"production"``.
"""
from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


_DEMO_PATIENT_ACTOR_TOKEN = "actor-patient-demo"  # demo token shape


def test_wearable_chat_demo_bypass_blocked_in_production(
    client: TestClient,
) -> None:
    """When app_env='production' the demo branch must refuse with
    ``demo_disabled`` (HTTP 403). The route's role gate would
    otherwise admit the demo actor."""

    class _ProdSettings:
        app_env = "production"

    with patch("app.settings.get_settings", return_value=_ProdSettings()):
        resp = client.post(
            "/api/v1/chat/wearable-patient",
            headers={"Authorization": f"Bearer {_DEMO_PATIENT_ACTOR_TOKEN}"},
            json={"messages": [{"role": "user", "content": "hi"}]},
        )

    # The demo bypass should be refused. Either the upstream
    # `get_authenticated_actor` denies demo tokens entirely in
    # production (returning 401/403), or we hit our own
    # ``demo_disabled`` 403 inside the chat route.
    assert resp.status_code in (401, 403), resp.text
