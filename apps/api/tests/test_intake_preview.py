from fastapi.testclient import TestClient


def test_intake_preview_valid_supported_combination(client: TestClient) -> None:
    response = client.post(
        "/api/v1/intake/preview",
        json={
            "condition_slug": "parkinsons-disease",
            "phenotype": "Motor-dominant with gait instability",
            "modality_slug": "tps",
            "device_slug": "neurolith",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["support_status"]["status"] == "supported"
    assert payload["protocol_plan"]["device_slug"] == "neurolith"
    assert payload["clinician_handbook_plan"]["title"]


def test_intake_preview_unsupported_device_modality_combination(client: TestClient) -> None:
    response = client.post(
        "/api/v1/intake/preview",
        json={
            "condition_slug": "parkinsons-disease",
            "phenotype": "Motor-dominant with gait instability",
            "modality_slug": "tps",
            "device_slug": "luma-one",
        },
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "unsupported_combination"
    assert payload["warnings"]


def test_intake_preview_missing_required_fields(client: TestClient) -> None:
    response = client.post(
        "/api/v1/intake/preview",
        json={
            "condition_slug": "parkinsons-disease",
            "modality_slug": "tps",
            "device_slug": "neurolith",
        },
    )

    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "invalid_request"
    assert payload["warnings"]
