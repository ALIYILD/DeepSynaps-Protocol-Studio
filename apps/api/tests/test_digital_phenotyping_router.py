"""Smoke tests for Digital Phenotyping Analyzer router (stub payload)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client():
    from app.main import app

    return TestClient(app)


def test_digital_phenotyping_get_requires_auth(client: TestClient):
    res = client.get("/api/v1/digital-phenotyping/analyzer/patient/some-patient-id")
    assert res.status_code == 401


def test_digital_phenotyping_audit_requires_auth(client: TestClient):
    res = client.get("/api/v1/digital-phenotyping/analyzer/patient/some-patient-id/audit")
    assert res.status_code == 401
