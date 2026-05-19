from __future__ import annotations

from app.services import evidence_rag


def test_protocol_studio_generate_accepts_neuromodulation_context(client, auth_headers, monkeypatch) -> None:
    monkeypatch.setattr("app.services.protocol_studio_generation._local_evidence_available", lambda: True)
    monkeypatch.setattr(
        "app.services.protocol_studio_generation._pick_protocol_row",
        lambda req: {
            "id": "proto-neuro-1",
            "name": "Neuromodulation Review Draft",
            "condition_id": req.get("condition"),
            "modality_id": req.get("modality"),
            "target_region": "DLPFC-L",
            "on_label_vs_off_label": "on-label",
            "evidence_grade": "A",
            "source_url_primary": "https://example.test/protocol",
            "source_url_secondary": "",
            "contraindication_check_required": "Review implanted-device status before use.",
            "review_status": "clinic_review_required",
            "notes": "Decision support only.",
            "evidence_summary": "Draft grounded in local evidence corpus.",
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
            "modality": "tDCS",
            "target": "DLPFC-L",
            "protocol_id": "proto-neuro-1",
            "include_off_label": True,
            "constraints": {},
            "neuromodulation_context": {
                "target_anchor": "F3",
                "source_statuses": {"simnibs": "unavailable", "ieeg": "disabled"},
                "decision_support_disclaimer": "Decision support only.",
            },
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "draft_requires_review"
    assert body["patient_context_used"]["neuromodulation"]["target_anchor"] == "F3"
    assert body["patient_context_used"]["neuromodulation"]["source_statuses"]["simnibs"] == "unavailable"
