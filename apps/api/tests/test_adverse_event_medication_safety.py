from __future__ import annotations

import uuid

from app.database import SessionLocal
from app.persistence.models import Patient


def test_medication_safety_check_returns_partial_results_with_caveats(client, auth_headers, monkeypatch) -> None:
    async def _fake_connect(self):
        return True

    async def _fake_disconnect(self):
        return None

    async def _fake_counts(self, drug_name: str, top_n: int = 5):
        return [
            {"adverse_event_meddra_pt": "Seizure", "report_count": 4},
            {"adverse_event_meddra_pt": "Headache", "report_count": 2},
        ]

    async def _fake_search(self, query: str, filters=None):
        return [{"term": query}]

    async def _fake_close(self):
        return None

    monkeypatch.setattr("app.services.knowledge.adapters.faers_adapter.FAERSAdapter.connect", _fake_connect)
    monkeypatch.setattr("app.services.knowledge.adapters.faers_adapter.FAERSAdapter.disconnect", _fake_disconnect)
    monkeypatch.setattr(
        "app.services.knowledge.adapters.faers_adapter.FAERSAdapter.get_drug_event_counts",
        _fake_counts,
    )
    monkeypatch.setattr("app.adapters.meddra_adapter.MedDRAAdapter.search", _fake_search)
    monkeypatch.setattr("app.adapters.meddra_adapter.MedDRAAdapter.close", _fake_close)

    res = client.post(
        "/api/v1/adverse-events/medication-safety-check",
        headers=auth_headers["clinician"],
        json={
            "medication_name": "bupropion",
            "neuromodulation_modality": "TMS",
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["normalized_medication"] == "bupropion"
    assert body["partial"] is False
    assert body["faers_signals"]
    assert body["meddra_normalized_event_terms"] == ["Seizure", "Headache"]
    assert body["source_statuses"]["vigibase"]["lifecycle_state"] == "disabled"
    assert body["source_statuses"]["who_adr"]["lifecycle_state"] == "disabled"
    assert body["ctcae_reference"]["coding_system"] == "CTCAE"
    assert any("decision support only" in item.lower() for item in body["warnings"])
    assert any("causality" in item.lower() for item in body["warnings"])
    assert any("seizure-threshold" in item.lower() for item in body["seizure_threshold_flags"])
    assert "no risk" not in res.text.lower()


def test_medication_safety_check_degrades_cleanly_when_faers_fails(client, auth_headers, monkeypatch) -> None:
    async def _fake_connect(self):
        return True

    async def _fake_disconnect(self):
        return None

    async def _fake_counts(self, drug_name: str, top_n: int = 5):
        raise RuntimeError("faers down")

    async def _fake_close(self):
        return None

    monkeypatch.setattr("app.services.knowledge.adapters.faers_adapter.FAERSAdapter.connect", _fake_connect)
    monkeypatch.setattr("app.services.knowledge.adapters.faers_adapter.FAERSAdapter.disconnect", _fake_disconnect)
    monkeypatch.setattr(
        "app.services.knowledge.adapters.faers_adapter.FAERSAdapter.get_drug_event_counts",
        _fake_counts,
    )
    monkeypatch.setattr("app.adapters.meddra_adapter.MedDRAAdapter.close", _fake_close)

    res = client.post(
        "/api/v1/adverse-events/medication-safety-check",
        headers=auth_headers["clinician"],
        json={"medication_name": "sertraline"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["partial"] is True
    assert body["source_statuses"]["faers"]["lifecycle_state"] == "degraded"
    assert any("degraded partial output" in item.lower() for item in body["warnings"])
    assert any("no matching reports found in queried source" in item.lower() for item in body["warnings"])
    assert "no risk" not in res.text.lower()


def test_patient_linked_medication_safety_requires_consent(client, auth_headers, monkeypatch) -> None:
    db = SessionLocal()
    patient_id = f"pt-ae-med-{uuid.uuid4().hex[:8]}"
    try:
        db.add(
            Patient(
                id=patient_id,
                clinician_id="actor-clinician-demo",
                first_name="No",
                last_name="Consent",
                email=f"{patient_id}@example.com",
                consent_signed=False,
                status="active",
            )
        )
        db.commit()
    finally:
        db.close()

    async def _fake_close(self):
        return None

    monkeypatch.setattr("app.adapters.meddra_adapter.MedDRAAdapter.close", _fake_close)

    res = client.post(
        "/api/v1/adverse-events/medication-safety-check",
        headers=auth_headers["clinician"],
        json={"medication_name": "tramadol", "patient_id": patient_id},
    )
    assert res.status_code == 403
    body = res.json()
    assert body["code"] == "consent_missing"
