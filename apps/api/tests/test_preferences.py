from __future__ import annotations

from fastapi.testclient import TestClient


def _register(client: TestClient, email: str) -> str:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "display_name": "Prefs User", "password": "testpass1234", "role": "clinician"},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["access_token"]


def test_get_preferences_creates_default_row_on_first_call(client: TestClient) -> None:
    token = _register(client, "prefs-default@example.com")
    resp = client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["language"] == "en"
    assert data["date_format"] in ("ISO", "US", "EU")
    assert data["units"] in ("metric", "imperial")
    assert isinstance(data["notification_prefs"], dict)
    assert "aeAlerts" in data["notification_prefs"]


def test_patch_preferences_persists_language_switch(client: TestClient) -> None:
    token = _register(client, "prefs-lang@example.com")
    client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"})

    patch = client.patch(
        "/api/v1/preferences",
        headers={"Authorization": f"Bearer {token}"},
        json={"language": "tr", "time_format": "24h", "units": "metric"},
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["language"] == "tr"

    readback = client.get("/api/v1/preferences", headers={"Authorization": f"Bearer {token}"}).json()
    assert readback["language"] == "tr"
    assert readback["time_format"] == "24h"


def test_patch_with_invalid_enum_rejected(client: TestClient) -> None:
    token = _register(client, "prefs-invalid@example.com")
    resp = client.patch(
        "/api/v1/preferences",
        headers={"Authorization": f"Bearer {token}"},
        json={"digest_freq": "bogus-value"},
    )
    assert resp.status_code in (400, 422), resp.text


def test_clinical_defaults_returns_sensible_values_without_clinic(client: TestClient) -> None:
    token = _register(client, "cd-no-clinic@example.com")
    resp = client.get(
        "/api/v1/preferences/clinical-defaults",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("clinic_id") is None
    assert data["default_session_duration_min"] == 45
    assert data["ae_protocol"] == "auto-notify"
    assert "PHQ-9" in data["default_assessments"]
