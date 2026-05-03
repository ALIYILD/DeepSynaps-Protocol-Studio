"""Smoke tests for wearable_router clinician access patterns."""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient


def test_wearable_summary_guest_forbidden(client: TestClient, auth_headers: dict) -> None:
    pid = str(uuid.uuid4())
    r = client.get(f"/api/v1/wearables/patients/{pid}/summary", headers=auth_headers["guest"])
    assert r.status_code == 403


def test_wearable_summary_unknown_patient(client: TestClient, auth_headers: dict) -> None:
    pid = str(uuid.uuid4())
    r = client.get(f"/api/v1/wearables/patients/{pid}/summary", headers=auth_headers["clinician"])
    assert r.status_code == 404
