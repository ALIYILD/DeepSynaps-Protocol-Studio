from __future__ import annotations

from app.services.knowledge.neuromodulation_inventory import build_simnibs_status


def test_simnibs_status_is_honest_when_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.knowledge.neuromodulation_inventory._simnibs_installation_state",
        lambda: (False, False),
    )

    status = build_simnibs_status(
        {
            "modality": "tDCS",
            "target_region": "DLPFC-L",
            "montage": "F3-Fp2",
            "device": "tDCS cap",
            "coordinate_space": "MNI",
        }
    )

    assert status["status"] == "unavailable"
    assert status["field_strength_v_m"] is None
    assert status["field_estimate_computed"] is False
    assert status["simulation_unavailable"] is True
    assert "decision support" in status["decision_support_disclaimer"].lower()


def test_simnibs_status_route_returns_unavailable(client, auth_headers, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.knowledge.neuromodulation_inventory._simnibs_installation_state",
        lambda: (False, False),
    )

    res = client.post(
        "/api/v1/neuromodulation/simnibs/status",
        headers=auth_headers["clinician"],
        json={"modality": "tDCS", "target_region": "DLPFC-L", "montage": "F3-Fp2"},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "unavailable"
    assert body["field_strength_v_m"] is None
