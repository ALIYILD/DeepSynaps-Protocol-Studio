"""Tests for /api/v1/registry — conditions, modalities, devices, protocols, phenotypes, governance."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


CLINICIAN_HDR = {"Authorization": "Bearer clinician-demo-token"}
ADMIN_HDR = {"Authorization": "Bearer admin-demo-token"}


# ---------------------------------------------------------------------------
# /conditions
# ---------------------------------------------------------------------------

class TestRegistryConditions:
    def test_list_conditions_returns_items_and_total(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/conditions", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert isinstance(body["items"], list)
        assert body["total"] == len(body["items"])
        assert body["total"] > 0

    def test_list_conditions_accessible_without_auth_header(self, client: TestClient) -> None:
        """Registry conditions endpoint does not enforce minimum role — unauthenticated GET succeeds."""
        r = client.get("/api/v1/registry/conditions")
        # No role guard on this endpoint; anonymous actor is accepted.
        assert r.status_code == 200
        assert "items" in r.json()

    def test_get_condition_returns_known_condition(self, client: TestClient) -> None:
        """Fetch the first condition from the list, then request it directly."""
        r = client.get("/api/v1/registry/conditions", headers=CLINICIAN_HDR)
        first_id = r.json()["items"][0]["id"]
        r2 = client.get(f"/api/v1/registry/conditions/{first_id}", headers=CLINICIAN_HDR)
        assert r2.status_code == 200
        assert r2.json()["id"] == first_id

    def test_get_condition_not_found(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/conditions/nonexistent-xyz-999", headers=CLINICIAN_HDR)
        assert r.status_code == 404

    def test_condition_package_returns_slugs(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/conditions/packages", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert "slugs" in body
        assert isinstance(body["slugs"], list)

    def test_get_condition_package_not_found(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/conditions/no-such-pkg/package", headers=CLINICIAN_HDR)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# /modalities + /devices
# ---------------------------------------------------------------------------

class TestRegistryModalities:
    def test_list_modalities_returns_items(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/modalities", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["items"], list)
        assert body["total"] == len(body["items"])
        assert body["total"] > 0

    def test_list_devices_returns_items(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/devices", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["items"], list)
        assert body["total"] == len(body["items"])


# ---------------------------------------------------------------------------
# /protocols
# ---------------------------------------------------------------------------

class TestRegistryProtocols:
    def test_list_protocols_returns_all(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/protocols", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert body["total"] > 0

    def test_list_protocols_filter_by_condition(self, client: TestClient) -> None:
        # Get a real condition_id first.
        conds = client.get("/api/v1/registry/conditions", headers=CLINICIAN_HDR).json()["items"]
        cond_id = conds[0]["id"]
        r = client.get(
            f"/api/v1/registry/protocols?condition_id={cond_id}", headers=CLINICIAN_HDR
        )
        assert r.status_code == 200
        body = r.json()
        for p in body["items"]:
            assert p["condition_id"] == cond_id

    def test_list_protocols_filter_on_label_only(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/protocols?on_label_only=true", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        for p in r.json()["items"]:
            assert p["on_label_vs_off_label"].lower().startswith("on-label")

    def test_get_protocol_returns_known(self, client: TestClient) -> None:
        protos = client.get("/api/v1/registry/protocols", headers=CLINICIAN_HDR).json()["items"]
        pid = protos[0]["id"]
        r = client.get(f"/api/v1/registry/protocols/{pid}", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_get_protocol_not_found(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/protocols/no-such-protocol-xyz", headers=CLINICIAN_HDR)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# /phenotypes
# ---------------------------------------------------------------------------

class TestRegistryPhenotypes:
    def test_list_phenotypes_returns_items(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/phenotypes", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["items"], list)
        assert "total" in body

    def test_list_phenotypes_filter_by_condition(self, client: TestClient) -> None:
        conds = client.get("/api/v1/registry/conditions", headers=CLINICIAN_HDR).json()["items"]
        cond_id = conds[0]["id"]
        r = client.get(
            f"/api/v1/registry/phenotypes?condition_id={cond_id}", headers=CLINICIAN_HDR
        )
        assert r.status_code == 200
        assert isinstance(r.json()["items"], list)


# ---------------------------------------------------------------------------
# /governance-rules
# ---------------------------------------------------------------------------

class TestRegistryGovernance:
    def test_list_governance_rules_returns_items(self, client: TestClient) -> None:
        r = client.get("/api/v1/registry/governance-rules", headers=CLINICIAN_HDR)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["items"], list)
        assert "total" in body
