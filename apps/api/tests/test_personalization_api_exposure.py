"""API exposure for personalization debug and registry governance (opt-in / admin)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def _mdd_rtms_body(**extra: object) -> dict:
    return {
        "condition": "Major Depressive Disorder (MDD)",
        "symptom_cluster": "General",
        "modality": "rTMS (Repetitive Transcranial Magnetic Stimulation)",
        "device": "NeuroStar Advanced Therapy System",
        "setting": "Clinic",
        "evidence_threshold": "Guideline",
        "off_label": False,
        **extra,
    }


def test_draft_without_debug_omits_why_selected_projection(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json=_mdd_rtms_body(phenotype_tags=["anxious"]),
    )
    assert r.status_code == 200
    body = r.json()
    assert body.get("personalization_why_selected_debug") is None
    assert body["structured_rule_matches_by_protocol"]


def test_draft_with_debug_includes_why_selected_projection(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    base = _mdd_rtms_body(phenotype_tags=["anxious"])
    r0 = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json=base,
    )
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json={**base, "include_personalization_debug": True, "include_structured_rule_matches_detail": True},
    )
    assert r.status_code == 200
    body = r.json()
    dbg = body["personalization_why_selected_debug"]
    assert dbg["format_version"] == 1
    assert dbg["fired_rule_ids"] == ["PR-001"]
    assert dbg["csv_first_baseline_protocol_id"] == "PRO-001"
    assert dbg["personalization_changed_vs_csv_first"] is True
    assert dbg["structured_rule_score_total"] == 250
    assert body["duration"] == r0.json()["duration"]


def test_draft_debug_matches_qeeg_case(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json=_mdd_rtms_body(
            qeeg_summary="frontal alpha asymmetry",
            include_personalization_debug=True,
        ),
    )
    assert r.status_code == 200
    dbg = r.json()["personalization_why_selected_debug"]
    assert dbg["fired_rule_ids"] == ["PR-002"]
    assert dbg["personalization_changed_vs_csv_first"] is False


def test_draft_omit_matches_detail_when_requested(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    r = client.post(
        "/api/v1/protocols/generate-draft",
        headers=auth_headers["clinician"],
        json=_mdd_rtms_body(
            phenotype_tags=["anxious"],
            include_personalization_debug=True,
            include_structured_rule_matches_detail=False,
        ),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["structured_rule_matches_by_protocol"] == {}
    assert body["personalization_why_selected_debug"] is not None


def test_personalization_rules_review_requires_admin(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    r = client.get(
        "/api/v1/personalization/rules/review?view=snapshot",
        headers=auth_headers["clinician"],
    )
    assert r.status_code == 403


def test_personalization_rules_review_snapshot_deterministic(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    r = client.get(
        "/api/v1/personalization/rules/review?view=snapshot",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    data = r.json()
    assert data["format_version"] == 1
    snap = data["snapshot"]
    assert snap["format_version"] == 1
    assert snap["active_rules_count"] >= 1
    assert not snap["diagnostics"]["duplicates"]
    assert data["report_text"] is None


def test_personalization_rules_review_both_includes_report(
    client: TestClient,
    auth_headers: dict[str, dict[str, str]],
) -> None:
    r = client.get(
        "/api/v1/personalization/rules/review?view=both",
        headers=auth_headers["admin"],
    )
    assert r.status_code == 200
    data = r.json()
    assert data["report_text"]
    assert "Personalization rules registry review" in data["report_text"]
