from __future__ import annotations

from app.services.knowledge.neuromodulation_inventory import build_planning_context


def test_planning_context_includes_source_statuses_and_hooks(monkeypatch) -> None:
    monkeypatch.delenv("IEEG_USERNAME", raising=False)
    monkeypatch.delenv("IEEG_PASSWORD", raising=False)
    monkeypatch.delenv("IEEG_API_KEY", raising=False)
    monkeypatch.delenv("IEEG_TOKEN", raising=False)
    monkeypatch.delenv("IEEG_ACCESS_TOKEN", raising=False)
    monkeypatch.setattr(
        "app.services.knowledge.neuromodulation_inventory._simnibs_installation_state",
        lambda: (False, False),
    )

    ctx = build_planning_context(
        {
            "modality": "tDCS",
            "condition": "depression",
            "target_region": "DLPFC-L",
            "montage": "F3-Fp2",
            "device": "tDCS cap",
            "patient_id": "patient-123",
        }
    )

    assert ctx["target_anchor"] == "F3"
    assert ctx["target"]["id"] == "DLPFC-L"
    assert ctx["source_statuses"]["simnibs"] == "unavailable"
    assert ctx["source_statuses"]["ieeg"] == "disabled"
    assert set(ctx["workflow_hooks"]) == {
        "protocol_studio",
        "brain_map_planner",
        "qeeg_analyzer",
        "biomarkers",
        "session_device_planning",
    }
    assert "decision support only" in ctx["decision_support_disclaimer"].lower()
    assert any("consent" in warning.lower() for warning in ctx["warnings"])


def test_planning_context_route_is_mounted(client, auth_headers, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.knowledge.neuromodulation_inventory._simnibs_installation_state",
        lambda: (False, False),
    )
    res = client.post(
        "/api/v1/neuromodulation/planning-context",
        headers=auth_headers["clinician"],
        json={
            "modality": "tDCS",
            "condition": "depression",
            "target_region": "DLPFC-L",
            "montage": "F3-Fp2",
            "device": "tDCS cap",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["target_anchor"] == "F3"
    assert body["source_statuses"]["simnibs"] == "unavailable"
