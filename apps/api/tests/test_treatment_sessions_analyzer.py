"""Treatment Sessions Analyzer aggregate endpoint."""
from __future__ import annotations

from fastapi.testclient import TestClient

from test_patients_router import _create_patient


class TestTreatmentSessionsAnalyzer:
    def test_clinician_get_returns_payload_shape(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        pid = _create_patient(client, auth_headers)
        r = client.get(
            f"/api/v1/patients/{pid}/treatment-sessions-analyzer",
            headers=auth_headers["clinician"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["schema_version"] == "1.0.0"
        assert body["patient_id"] == pid
        assert "planning_snapshot" in body
        assert "multimodal_contributors" in body
        assert isinstance(body["sessions"], list)

    def test_guest_is_forbidden(self, client: TestClient, auth_headers: dict) -> None:
        pid = _create_patient(client, auth_headers)
        r = client.get(
            f"/api/v1/patients/{pid}/treatment-sessions-analyzer",
            headers=auth_headers["guest"],
        )
        assert r.status_code == 403
