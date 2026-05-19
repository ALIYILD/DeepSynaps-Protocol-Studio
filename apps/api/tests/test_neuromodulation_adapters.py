from __future__ import annotations

import uuid

from app.services.knowledge.neuromodulation_inventory import build_neuromodulation_inventory


def test_neuromodulation_inventory_lists_all_six_sources(monkeypatch) -> None:
    monkeypatch.delenv("IEEG_USERNAME", raising=False)
    monkeypatch.delenv("IEEG_PASSWORD", raising=False)
    monkeypatch.delenv("IEEG_API_KEY", raising=False)
    monkeypatch.delenv("IEEG_TOKEN", raising=False)
    monkeypatch.delenv("IEEG_ACCESS_TOKEN", raising=False)
    monkeypatch.setattr(
        "app.services.knowledge.neuromodulation_inventory._simnibs_installation_state",
        lambda: (False, False),
    )

    inventory = build_neuromodulation_inventory()

    assert inventory["total"] == 6
    keys = [entry["key"] for entry in inventory["sources"]]
    assert keys == [
        "clinical_neurophysiology",
        "ieeg",
        "tms_atlas",
        "deepbrain",
        "neuromod_devices",
        "simnibs",
    ]
    states = {entry["key"]: entry["lifecycle_state"] for entry in inventory["sources"]}
    assert states["clinical_neurophysiology"] == "catalogued"
    assert states["ieeg"] == "disabled"
    assert states["tms_atlas"] == "catalogued"
    assert states["deepbrain"] == "catalogued"
    assert states["neuromod_devices"] == "catalogued"
    assert states["simnibs"] == "unavailable"


def test_ieeg_becomes_degraded_when_credentials_exist(monkeypatch) -> None:
    monkeypatch.setenv("IEEG_TOKEN", f"ieeg-{uuid.uuid4().hex}")
    monkeypatch.setattr(
        "app.services.knowledge.neuromodulation_inventory._simnibs_installation_state",
        lambda: (False, False),
    )

    inventory = build_neuromodulation_inventory()
    ieeg = next(entry for entry in inventory["sources"] if entry["key"] == "ieeg")

    assert ieeg["lifecycle_state"] == "degraded"
    assert ieeg["enabled"] is True
    assert "login" in " ".join(ieeg["warnings"]).lower()


def test_neuromodulation_sources_route_is_mounted(client, auth_headers, monkeypatch) -> None:
    monkeypatch.delenv("IEEG_USERNAME", raising=False)
    monkeypatch.delenv("IEEG_PASSWORD", raising=False)
    monkeypatch.delenv("IEEG_API_KEY", raising=False)
    monkeypatch.delenv("IEEG_TOKEN", raising=False)
    monkeypatch.delenv("IEEG_ACCESS_TOKEN", raising=False)
    monkeypatch.setattr(
        "app.services.knowledge.neuromodulation_inventory._simnibs_installation_state",
        lambda: (False, False),
    )

    res = client.get("/api/v1/neuromodulation/sources", headers=auth_headers["clinician"])
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 6
    assert body["summary"]["by_state"]["catalogued"] >= 4


def test_neuromodulation_query_route_returns_catalogued_metadata(client, auth_headers, monkeypatch) -> None:
    monkeypatch.delenv("IEEG_USERNAME", raising=False)
    monkeypatch.delenv("IEEG_PASSWORD", raising=False)
    monkeypatch.delenv("IEEG_API_KEY", raising=False)
    monkeypatch.delenv("IEEG_TOKEN", raising=False)
    monkeypatch.delenv("IEEG_ACCESS_TOKEN", raising=False)
    monkeypatch.setattr(
        "app.services.knowledge.neuromodulation_inventory._simnibs_installation_state",
        lambda: (False, False),
    )

    res = client.post(
        "/api/v1/neuromodulation/query",
        headers=auth_headers["clinician"],
        json={"source_key": "tms_atlas", "modality": "tMS", "target_region": "DLPFC-L"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["source"]["key"] == "tms_atlas"
    assert body["source_status"] == "catalogued"
    assert body["records"] == []
