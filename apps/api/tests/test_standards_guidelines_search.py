from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.standards_guidelines_router import router as standards_guidelines_router


app = FastAPI()
app.include_router(standards_guidelines_router)
client = TestClient(app)


def test_standards_guidelines_search_returns_catalogued_references() -> None:
    resp = client.post(
        "/api/v1/standards-guidelines/search",
        json={
            "query": "TMS FDA guidance EU MDR",
            "modality": "TMS",
            "device_type": "medical-device",
            "jurisdiction": "US",
            "source": "FDA Guidance",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision_support_only"] is True
    assert body["structured_search_available"] is False
    assert body["search_status"] == "catalogued_only"
    assert "not a compliance certification" in body["decision_support_disclaimer"].lower()
    assert body["source_count"] >= 1
    assert body["source_statuses"]
    assert body["matched_resources"]
    first = body["matched_resources"][0]
    assert first["source_id"] == "fda_guidance"
    assert first["source_kind"] == "regulatory_guidance"
    assert first["jurisdiction"] == "us"
    assert "compliance certification" in first["decision_support_disclaimer"].lower()
    assert "compliant" not in first["summary"].lower()


def test_standards_guidelines_lookup_keeps_public_references_honest() -> None:
    resp = client.get("/api/v1/standards-guidelines/sources/iso_neuro")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source_id"] == "iso_neuro"
    assert body["lifecycle_state"] == "catalogued"
    assert body["status"] == "catalogued"
    assert "copyright" in body["access_license_notes"].lower()
