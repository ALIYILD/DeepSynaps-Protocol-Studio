from fastapi.testclient import TestClient


def test_protocol_draft_generation_valid_supported_combination(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json={
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "NEUROLITH",
            "setting": "Clinic",
            "evidence_threshold": "Systematic Review",
            "off_label": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["approval_status_badge"] == "clinician-reviewed draft"
    assert "Parkinson's disease / TPS / NEUROLITH" in payload["rationale"]
    assert payload["off_label_review_required"] is True


def test_protocol_draft_off_label_requires_clinician_role(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["guest"],
        json={
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "NEUROLITH",
            "setting": "Clinic",
            "evidence_threshold": "Systematic Review",
            "off_label": True,
        },
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "forbidden_off_label"


def test_protocol_draft_ignores_request_supplied_role_for_sensitive_behavior(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["guest"],
        json={
            "role": "clinician",
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "NEUROLITH",
            "setting": "Clinic",
            "evidence_threshold": "Systematic Review",
            "off_label": True,
        },
    )

    assert response.status_code == 403
    payload = response.json()
    assert payload["code"] == "forbidden_off_label"


def test_protocol_draft_unsupported_combination(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    response = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json={
            "condition": "Parkinson's disease",
            "symptom_cluster": "Motor symptoms",
            "modality": "TPS",
            "device": "LumaBand Home",
            "setting": "Home",
            "evidence_threshold": "Guideline",
            "off_label": False,
        },
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "unsupported_combination"


def test_handbook_generation_requires_clinician_or_admin(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    guest_response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["guest"],
        json={
            "handbook_kind": "clinician_handbook",
            "condition": "Parkinson's disease",
            "modality": "TPS",
        },
    )
    assert guest_response.status_code == 403

    clinician_response = client.post(
        "/api/v1/handbooks/generate",
        headers=auth_headers["clinician"],
        json={
            "handbook_kind": "clinician_handbook",
            "condition": "Parkinson's disease",
            "modality": "TPS",
        },
    )

    assert clinician_response.status_code == 200
    payload = clinician_response.json()
    assert payload["document"]["document_type"] == "clinician_handbook"
    assert "Parkinson's disease with TPS" in payload["document"]["title"]
    assert "pdf" in payload["export_targets"]
