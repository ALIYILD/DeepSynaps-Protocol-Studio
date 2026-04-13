"""Persisted personalization explainability on treatment courses (protocol_json snapshot)."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from deepsynaps_core_schema import (
    PERSISTED_PERSONALIZATION_EXPLAINABILITY_MAX_TOP_PROTOCOLS,
    PersistedPersonalizationExplainability,
    PersonalizationWhySelectedDebug,
    TopProtocolStructuredScore,
)


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


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "PE", "last_name": "Patient", "dob": "1984-01-15", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _snapshot_from_generate_draft(client: TestClient, auth_headers: dict) -> tuple[str, dict]:
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
    dbg = body["personalization_why_selected_debug"]
    assert dbg is not None
    pid = dbg["selected_protocol_id"]
    persisted = PersistedPersonalizationExplainability.from_personalization_why_selected_debug(
        PersonalizationWhySelectedDebug.model_validate(dbg)
    )
    return pid, persisted.model_dump(mode="json")


class TestPersistedExplainability:
    def test_draft_saved_with_debug_persists_compact_snapshot(
        self,
        client: TestClient,
        auth_headers: dict,
        patient_id: str,
    ) -> None:
        protocol_id, snap = _snapshot_from_generate_draft(client, auth_headers)
        r = client.post(
            "/api/v1/treatment-courses",
            headers=auth_headers["clinician"],
            json={
                "patient_id": patient_id,
                "protocol_id": protocol_id,
                "personalization_explainability": snap,
            },
        )
        assert r.status_code == 201
        created = r.json()
        assert created["personalization_explainability"] is not None
        assert created["personalization_explainability"]["selected_protocol_id"] == protocol_id

        cid = created["id"]
        g = client.get(
            f"/api/v1/treatment-courses/{cid}",
            headers=auth_headers["clinician"],
            params={"include_personalization_explainability": True},
        )
        assert g.status_code == 200
        loaded = g.json()["personalization_explainability"]
        assert loaded["fired_rule_ids"] == snap["fired_rule_ids"]
        assert loaded["structured_rule_score_total"] == snap["structured_rule_score_total"]

        d = client.get(
            f"/api/v1/treatment-courses/{cid}/personalization-explainability",
            headers=auth_headers["clinician"],
        )
        assert d.status_code == 200
        assert d.json()["selected_protocol_id"] == protocol_id

    def test_draft_saved_without_debug_does_not_invent_snapshot(
        self,
        client: TestClient,
        auth_headers: dict,
        patient_id: str,
    ) -> None:
        r = client.post(
            "/api/v1/treatment-courses",
            headers=auth_headers["clinician"],
            json={"patient_id": patient_id, "protocol_id": "PRO-001"},
        )
        assert r.status_code == 201
        cid = r.json()["id"]
        assert r.json().get("personalization_explainability") is None

        g = client.get(
            f"/api/v1/treatment-courses/{cid}",
            headers=auth_headers["clinician"],
            params={"include_personalization_explainability": True},
        )
        assert g.json().get("personalization_explainability") is None

        d = client.get(
            f"/api/v1/treatment-courses/{cid}/personalization-explainability",
            headers=auth_headers["clinician"],
        )
        assert d.status_code == 404

    def test_mismatch_protocol_returns_422(
        self,
        client: TestClient,
        auth_headers: dict,
        patient_id: str,
    ) -> None:
        _, snap = _snapshot_from_generate_draft(client, auth_headers)
        r = client.post(
            "/api/v1/treatment-courses",
            headers=auth_headers["clinician"],
            json={
                "patient_id": patient_id,
                "protocol_id": "PRO-001",
                "personalization_explainability": snap,
            },
        )
        assert r.status_code == 422

    def test_list_response_omits_explainability_payload(
        self,
        client: TestClient,
        auth_headers: dict,
        patient_id: str,
    ) -> None:
        protocol_id, snap = _snapshot_from_generate_draft(client, auth_headers)
        c = client.post(
            "/api/v1/treatment-courses",
            headers=auth_headers["clinician"],
            json={
                "patient_id": patient_id,
                "protocol_id": protocol_id,
                "personalization_explainability": snap,
            },
        )
        assert c.status_code == 201
        lst = client.get("/api/v1/treatment-courses", headers=auth_headers["clinician"])
        assert lst.status_code == 200
        row = next(x for x in lst.json()["items"] if x["id"] == c.json()["id"])
        assert row.get("personalization_explainability") is None

    def test_warning_merge_path_still_yields_persistable_snapshot(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        """generate-draft may merge governance/contraindication notes; debug object is unchanged."""
        r = client.post(
            "/api/v1/protocols/generate-draft",
            headers=auth_headers["clinician"],
            json=_mdd_rtms_body(
                phenotype_tags=["anxious"],
                include_personalization_debug=True,
            ),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["personalization_why_selected_debug"] is not None
        p1 = PersistedPersonalizationExplainability.from_personalization_why_selected_debug(
            PersonalizationWhySelectedDebug.model_validate(body["personalization_why_selected_debug"])
        )
        assert p1.selected_protocol_id
        assert isinstance(body["patient_communication_notes"], list)

    def test_persisted_top_protocols_bounded(self) -> None:
        many = [
            TopProtocolStructuredScore(protocol_id=f"PX-{i:03d}", structured_score_total=i)
            for i in range(50)
        ]
        dbg = PersonalizationWhySelectedDebug(
            selected_protocol_id="PX-000",
            top_protocols_by_structured_score=many,
            eligible_protocol_count=50,
        )
        p = PersistedPersonalizationExplainability.from_personalization_why_selected_debug(dbg)
        assert len(p.top_protocols_by_structured_score) == PERSISTED_PERSONALIZATION_EXPLAINABILITY_MAX_TOP_PROTOCOLS

    def test_stored_json_stays_small_for_typical_snapshot(
        self,
        client: TestClient,
        auth_headers: dict,
    ) -> None:
        _, snap = _snapshot_from_generate_draft(client, auth_headers)
        assert len(json.dumps(snap)) < 16_384

    def test_old_corrupt_explainability_field_is_tolerated_on_read(
        self,
        client: TestClient,
        auth_headers: dict,
        patient_id: str,
    ) -> None:
        from app.database import SessionLocal
        from app.persistence.models import TreatmentCourse

        r = client.post(
            "/api/v1/treatment-courses",
            headers=auth_headers["clinician"],
            json={"patient_id": patient_id, "protocol_id": "PRO-001"},
        )
        cid = r.json()["id"]
        db = SessionLocal()
        try:
            course = db.query(TreatmentCourse).filter_by(id=cid).first()
            assert course is not None
            meta = json.loads(course.protocol_json or "{}")
            meta["personalization_explainability"] = {"format_version": "not-an-int"}
            course.protocol_json = json.dumps(meta)
            db.commit()
        finally:
            db.close()

        g = client.get(
            f"/api/v1/treatment-courses/{cid}",
            headers=auth_headers["clinician"],
            params={"include_personalization_explainability": True},
        )
        assert g.status_code == 200
        assert g.json().get("personalization_explainability") is None

        d = client.get(
            f"/api/v1/treatment-courses/{cid}/personalization-explainability",
            headers=auth_headers["clinician"],
        )
        assert d.status_code == 422
