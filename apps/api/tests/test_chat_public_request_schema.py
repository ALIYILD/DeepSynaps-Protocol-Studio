"""Regression tests pinning the narrow ``PublicChatRequest`` schema.

The unauthenticated ``POST /api/v1/chat/public`` endpoint historically
accepted the full ``ChatRequest`` shape, which exposes ``patient_id``,
``patient_context``, and ``dashboard_context``. The handler ignored
those fields, but a future refactor that wired them through would
silently turn /public into a PHI sink that any internet caller could
query.

These tests pin the narrow shape (``extra='forbid'``) so the type
system refuses any such regression at request time.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_public_chat_accepts_messages_only(client: TestClient) -> None:
    """The narrow body — ``messages`` only — must be accepted (200 or
    a downstream LLM-failure envelope, but never a 422)."""
    resp = client.post(
        "/api/v1/chat/public",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    # Either a 200 from the LLM, or a 503/500 from a missing GLM key — both
    # are fine; what we care about is the schema not refusing the body.
    assert resp.status_code != 422, resp.text


@pytest.mark.parametrize(
    "extra_field",
    [
        "patient_id",
        "patient_context",
        "dashboard_context",
        "language",
        "actor_id",
        "clinic_id",
    ],
)
def test_public_chat_rejects_phi_smuggling_fields(
    client: TestClient, extra_field: str
) -> None:
    """Any attempt to send a PHI-selector field through the public route
    must be rejected at the schema layer, before the handler runs."""
    body = {
        "messages": [{"role": "user", "content": "hi"}],
        extra_field: "smuggled-value",
    }
    resp = client.post("/api/v1/chat/public", json=body)
    # The schema layer (Pydantic ``extra='forbid'``) must reject — the
    # exact response envelope shape is not load-bearing here, only the
    # 422 status. The parametrized test id already names the offending
    # field, so the pytest failure output is actionable without relying
    # on the wrapped error body (the global handler may redact details).
    assert resp.status_code == 422, (
        f"Expected 422 for extra field {extra_field!r}; got {resp.status_code}: {resp.text}"
    )
