"""Regression tests pinning URL-scheme validation on seller listings.

The marketplace listings render their ``external_url`` and
``image_url`` into clinician browsers as ``<a href="…">`` and
``<img src="…">`` attributes. Pre-fix the schema accepted any string
up to 512 chars, including ``javascript:alert(document.cookie)`` and
``data:text/html,<script>…</script>`` — a single seller listing could
stored-XSS every clinician who clicked through it.

Post-fix only ``http://`` and ``https://`` schemes are accepted at
the API boundary. ``javascript:``, ``data:``, ``file:``, ``vbscript:``,
``blob:`` are refused with HTTP 422 ``invalid_url_scheme`` before the
row is persisted.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def _register(client: TestClient, email: str) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "display_name": "Seller",
            "password": "testpass1234",
            "role": "clinician",
        },
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def _create_clinic(client: TestClient, token: str) -> None:
    resp = client.post(
        "/api/v1/clinic",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Seller Clinic", "timezone": "UTC"},
    )
    assert resp.status_code == 201, resp.text


def _post_listing(client: TestClient, token: str, **overrides) -> tuple[int, dict]:
    body = {
        "name": "Test Product",
        "provider": "Acme",
        "external_url": "https://example.com/product",
        "kind": "product",
    }
    body.update(overrides)
    resp = client.post(
        "/api/v1/marketplace/seller/items",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
    )
    return resp.status_code, (resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {})


@pytest.mark.parametrize(
    "hostile_url",
    [
        "javascript:alert(document.cookie)",
        "JAVASCRIPT:alert(1)",  # case-insensitivity
        "data:text/html,<script>alert(1)</script>",
        "file:///etc/passwd",
        "vbscript:msgbox(1)",
        "blob:https://example.com/uuid",
        "//evil.tld/path",  # protocol-relative
    ],
)
def test_external_url_rejects_dangerous_schemes(
    client: TestClient, hostile_url: str
) -> None:
    token = _register(client, f"seller-{abs(hash(hostile_url))}@example.com")
    _create_clinic(client, token)
    status, body = _post_listing(client, token, external_url=hostile_url)
    assert status == 422, body
    assert body.get("code") == "invalid_url_scheme", body


@pytest.mark.parametrize(
    "hostile_url",
    [
        "javascript:alert(1)",
        "data:image/svg+xml,<svg onload=alert(1)/>",
        "file:///etc/passwd",
    ],
)
def test_image_url_rejects_dangerous_schemes(
    client: TestClient, hostile_url: str
) -> None:
    token = _register(client, f"seller-img-{abs(hash(hostile_url))}@example.com")
    _create_clinic(client, token)
    status, body = _post_listing(
        client,
        token,
        image_url=hostile_url,
    )
    assert status == 422, body
    assert body.get("code") == "invalid_url_scheme", body


def test_https_url_is_accepted(client: TestClient) -> None:
    token = _register(client, "seller-happy@example.com")
    _create_clinic(client, token)
    status, body = _post_listing(
        client,
        token,
        external_url="https://amazon.com/dp/B0EXAMPLE",
        image_url="https://m.media-amazon.com/images/I/EXAMPLE.jpg",
    )
    assert status == 201, body


def test_http_url_is_accepted(client: TestClient) -> None:
    """Plain http is allowed for sellers who haven't migrated yet —
    the browser-side mixed-content rules will downgrade-warn the
    clinician but it's not a stored-XSS vector."""
    token = _register(client, "seller-http@example.com")
    _create_clinic(client, token)
    status, body = _post_listing(
        client,
        token,
        external_url="http://example.com/legacy-product",
    )
    assert status == 201, body


def _register_with_role(client: TestClient, email: str, role: str) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "display_name": "Seller",
            "password": "testpass1234",
            "role": role,
        },
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def test_create_listing_requires_clinician_role(client: TestClient) -> None:
    """Pre-fix any authenticated user could become a seller. Now
    ``require_minimum_role(actor, \"clinician\")`` blocks guest /
    technician / reviewer self-registered tokens, so a malicious
    actor must at minimum hold a clinician token before they can
    post a listing that renders into clinician browsers."""
    token = _register_with_role(client, "seller-guest@example.com", role="guest")
    resp = client.post(
        "/api/v1/marketplace/seller/items",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Spam Product",
            "provider": "Spammer",
            "external_url": "https://example.com/spam",
            "kind": "product",
        },
    )
    assert resp.status_code == 403, resp.text
