"""Tests for phenotype assignments router."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"name": "Phenotype Patient", "dob": "1992-07-04", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


MINIMAL_ASSIGNMENT = {
    "phenotype_id": "pheno-adhd-combined",
    "phenotype_name": "ADHD Combined",
}


class TestCreatePhenotypeAssignment:
    def test_create_minimal(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/phenotype-assignments",
            json={"patient_id": patient_id, **MINIMAL_ASSIGNMENT},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["phenotype_id"] == "pheno-adhd-combined"
        assert data["phenotype_name"] == "ADHD Combined"
        assert data["patient_id"] == patient_id
        assert "id" in data
        assert "assigned_at" in data

    def test_create_full_fields(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/phenotype-assignments",
            json={
                "patient_id": patient_id,
                "phenotype_id": "pheno-mdd-hypoarousal",
                "phenotype_name": "MDD Hypoarousal",
                "domain": "mood",
                "rationale": "Low frontal alpha asymmetry on qEEG",
                "qeeg_supported": True,
                "confidence": "high",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["domain"] == "mood"
        assert data["qeeg_supported"] is True
        assert data["confidence"] == "high"

    def test_invalid_confidence_rejected(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/phenotype-assignments",
            json={
                "patient_id": patient_id,
                **MINIMAL_ASSIGNMENT,
                "confidence": "very_high",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 422

    def test_valid_confidences_accepted(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        for confidence in ("high", "moderate", "low"):
            resp = client.post(
                "/api/v1/phenotype-assignments",
                json={
                    "patient_id": patient_id,
                    "phenotype_id": f"pheno-{confidence}",
                    "phenotype_name": f"Test {confidence}",
                    "confidence": confidence,
                },
                headers=auth_headers["clinician"],
            )
            assert resp.status_code == 201, f"Expected 201 for confidence={confidence}"

    def test_guest_cannot_create(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/phenotype-assignments",
            json={"patient_id": patient_id, **MINIMAL_ASSIGNMENT},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403

    def test_unauthenticated_rejected(self, client: TestClient, patient_id: str) -> None:
        resp = client.post(
            "/api/v1/phenotype-assignments",
            json={"patient_id": patient_id, **MINIMAL_ASSIGNMENT},
        )
        assert resp.status_code == 401


class TestListPhenotypeAssignments:
    def _create(self, client: TestClient, auth_headers: dict, patient_id: str, pheno_id: str = "pheno-1") -> dict:
        return client.post(
            "/api/v1/phenotype-assignments",
            json={"patient_id": patient_id, "phenotype_id": pheno_id, "phenotype_name": pheno_id},
            headers=auth_headers["clinician"],
        ).json()

    def test_list_returns_own_assignments(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        self._create(client, auth_headers, patient_id, "pheno-1")
        self._create(client, auth_headers, patient_id, "pheno-2")
        resp = client.get("/api/v1/phenotype-assignments", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    def test_filter_by_patient_id(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        p2 = client.post(
            "/api/v1/patients",
            json={"name": "Other", "dob": "1990-01-01", "gender": "F"},
            headers=auth_headers["clinician"],
        ).json()["id"]
        self._create(client, auth_headers, patient_id)
        self._create(client, auth_headers, p2)

        resp = client.get(
            f"/api/v1/phenotype-assignments?patient_id={patient_id}",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["patient_id"] == patient_id

    def test_empty_list(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/phenotype-assignments", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestDeletePhenotypeAssignment:
    def test_delete_own_assignment(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        created = client.post(
            "/api/v1/phenotype-assignments",
            json={"patient_id": patient_id, **MINIMAL_ASSIGNMENT},
            headers=auth_headers["clinician"],
        ).json()

        resp = client.delete(
            f"/api/v1/phenotype-assignments/{created['id']}",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 204

        # Confirm gone
        list_resp = client.get("/api/v1/phenotype-assignments", headers=auth_headers["clinician"])
        assert list_resp.json()["total"] == 0

    def test_delete_nonexistent_returns_404(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.delete(
            "/api/v1/phenotype-assignments/not-real-id",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 404

    def test_guest_cannot_delete(self, client: TestClient, auth_headers: dict, patient_id: str) -> None:
        created = client.post(
            "/api/v1/phenotype-assignments",
            json={"patient_id": patient_id, **MINIMAL_ASSIGNMENT},
            headers=auth_headers["clinician"],
        ).json()

        resp = client.delete(
            f"/api/v1/phenotype-assignments/{created['id']}",
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403
