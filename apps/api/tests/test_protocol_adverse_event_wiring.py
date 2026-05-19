from __future__ import annotations

from app.services import evidence_rag
from app.services.protocol_studio_recommend import build_protocol_recommendation


def test_protocol_recommendation_surfaces_adverse_event_caveats(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.services.protocol_studio_recommend.registry_list_protocols",
        lambda: [
            {
                "id": "proto-ae-1",
                "name": "Safety Review Protocol",
                "condition_id": "depression",
                "modality_id": "tms",
                "target_region": "DLPFC-L",
                "on_label_vs_off_label": "on-label",
                "evidence_grade": "A",
                "source_url_primary": "https://example.test/protocol",
                "source_url_secondary": "",
                "contraindication_check_required": "Review medication safety context.",
                "review_status": "clinic_review_required",
                "notes": "Decision support only.",
            }
        ],
    )

    result = build_protocol_recommendation(
        {
            "condition": "depression",
            "modalities": ["tms"],
            "contraindications": [],
            "available_devices": [],
        }
    )
    assert result["overall_top_3"]
    assert any("spontaneous reports do not prove causality" in flag.lower() for flag in result["safety_flags"])
    assert "not clinical clearance" in result["ranking_note"].lower()
    assert "adverse-event source review remains required" in result["overall_top_3"][0]["patient_fit_rationale"].lower()


def test_protocol_generate_includes_adverse_event_review_warning(client, auth_headers, monkeypatch) -> None:
    monkeypatch.setattr("app.services.protocol_studio_generation._local_evidence_available", lambda: True)
    monkeypatch.setattr(
        "app.services.protocol_studio_generation._pick_protocol_row",
        lambda req: {
            "id": "proto-ae-2",
            "name": "AE Review Draft",
            "condition_id": req.get("condition"),
            "modality_id": req.get("modality"),
            "target_region": "DLPFC-L",
            "on_label_vs_off_label": "on-label",
            "evidence_grade": "A",
            "source_url_primary": "https://example.test/protocol",
            "source_url_secondary": "",
            "contraindication_check_required": "Review medication and adverse-event context.",
            "review_status": "clinic_review_required",
            "notes": "Decision support only.",
            "evidence_summary": "Registry-grounded summary.",
        },
    )
    monkeypatch.setattr(
        evidence_rag,
        "search_evidence",
        lambda *args, **kwargs: [{"paper_id": "paper-1", "title": "Evidence 1", "url": "https://example.test/e1"}],
    )

    res = client.post(
        "/api/v1/protocol-studio/generate",
        headers=auth_headers["clinician"],
        json={
            "mode": "evidence_search",
            "condition": "depression",
            "modality": "tms",
            "target": "DLPFC-L",
            "protocol_id": "proto-ae-2",
            "include_off_label": True,
            "constraints": {},
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "draft_requires_review"
    assert any("adverse-event source review is required" in line.lower() for line in body["rationale"])
    assert any("not clinical clearance" in line.lower() for line in body["rationale"])
