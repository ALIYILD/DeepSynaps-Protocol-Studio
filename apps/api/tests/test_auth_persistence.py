from fastapi.testclient import TestClient
from app.settings import get_settings

from app.settings import get_settings


def test_case_summary_requires_clinician_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/uploads/case-summary",
        headers=auth_headers["guest"],
        json={
            "uploads": [
                {
                    "type": "Intake Form",
                    "file_name": "structured-intake.pdf",
                    "summary": "Motor symptom intake summary.",
                }
            ]
        },
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "insufficient_role"


def test_demo_login_is_disabled_in_production(
    client: TestClient,
    monkeypatch,
) -> None:
    settings = get_settings().model_copy(update={"app_env": "production"})
    monkeypatch.setattr("app.routers.auth_router.get_settings", lambda: settings)

    response = client.post(
        "/api/v1/auth/demo-login",
        json={"token": "clinician-demo-token"},
    )

    # In production/staging the endpoint must not reveal it exists.
    assert response.status_code == 404
    payload = response.json()
    assert payload.get("detail") == "Not Found"


def test_review_actions_are_persisted_to_audit_trail(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    create_response = client.post(
        "/api/v1/review-actions",
        headers=auth_headers["clinician"],
        json={
            "target_id": "proto-parkinsons-tps",
            "target_type": "protocol",
            "action": "reviewed",
            "note": "Clinician review completed for deterministic draft.",
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()["event"]
    assert created["role"] == "clinician"

    audit_response = client.get(
        "/api/v1/audit-trail",
        headers=auth_headers["admin"],
    )

    assert audit_response.status_code == 200
    payload = audit_response.json()
    assert payload["total"] >= 3
    assert payload["items"][0]["target_id"] == "proto-parkinsons-tps"
    assert payload["items"][0]["note"] == "Clinician review completed for deterministic draft."


def test_audit_trail_requires_admin_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.get("/api/v1/audit-trail", headers=auth_headers["clinician"])

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "insufficient_role"
