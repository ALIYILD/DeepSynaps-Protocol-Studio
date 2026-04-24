"""Tests for outcomes router."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def patient_id(client: TestClient, auth_headers: dict) -> str:
    resp = client.post(
        "/api/v1/patients",
        json={"first_name": "Outcomes", "last_name": "Patient", "dob": "1985-09-21", "gender": "M"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.fixture
def course_id(client: TestClient, auth_headers: dict, patient_id: str) -> str:
    resp = client.post(
        "/api/v1/treatment-courses",
        json={"patient_id": patient_id, "protocol_id": "PRO-001"},
        headers=auth_headers["clinician"],
    )
    assert resp.status_code == 201
    return resp.json()["id"]


BASELINE_OUTCOME = {
    "template_id": "PHQ-9",
    "template_title": "PHQ-9 Depression Scale",
    "score": "18",
    "score_numeric": 18.0,
    "measurement_point": "baseline",
}


class TestRecordOutcome:
    def test_record_baseline(self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str) -> None:
        resp = client.post(
            "/api/v1/outcomes",
            json={"patient_id": patient_id, "course_id": course_id, **BASELINE_OUTCOME},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["template_id"] == "PHQ-9"
        assert data["score_numeric"] == 18.0
        assert data["measurement_point"] == "baseline"
        assert "id" in data

    def test_record_score_numeric_parsed_from_string(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        resp = client.post(
            "/api/v1/outcomes",
            json={
                "patient_id": patient_id,
                "course_id": course_id,
                "template_id": "GAD-7",
                "score": "12",
                "measurement_point": "mid",
            },
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 201
        data = resp.json()
        # score_numeric should be auto-parsed from score string
        assert data["score_numeric"] == 12.0

    def test_record_multiple_points(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        for point, score in [("baseline", 20.0), ("mid", 14.0), ("post", 8.0)]:
            resp = client.post(
                "/api/v1/outcomes",
                json={
                    "patient_id": patient_id,
                    "course_id": course_id,
                    "template_id": "PHQ-9",
                    "score_numeric": score,
                    "measurement_point": point,
                },
                headers=auth_headers["clinician"],
            )
            assert resp.status_code == 201

    def test_guest_cannot_record(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        resp = client.post(
            "/api/v1/outcomes",
            json={"patient_id": patient_id, "course_id": course_id, **BASELINE_OUTCOME},
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403

    def test_unauthenticated_rejected(
        self, client: TestClient, patient_id: str, course_id: str
    ) -> None:
        resp = client.post(
            "/api/v1/outcomes",
            json={"patient_id": patient_id, "course_id": course_id, **BASELINE_OUTCOME},
        )
        assert resp.status_code in (401, 403)


class TestListOutcomes:
    def _record(
        self,
        client: TestClient,
        auth_headers: dict,
        patient_id: str,
        course_id: str,
        template: str = "PHQ-9",
        score: float = 15.0,
        point: str = "baseline",
    ) -> dict:
        return client.post(
            "/api/v1/outcomes",
            json={
                "patient_id": patient_id,
                "course_id": course_id,
                "template_id": template,
                "score_numeric": score,
                "measurement_point": point,
            },
            headers=auth_headers["clinician"],
        ).json()

    def test_list_own_outcomes(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        self._record(client, auth_headers, patient_id, course_id)
        self._record(client, auth_headers, patient_id, course_id, "GAD-7", 10.0)
        resp = client.get("/api/v1/outcomes", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2

    def test_filter_by_course_id(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        # Create second course
        course2 = client.post(
            "/api/v1/treatment-courses",
            json={"patient_id": patient_id, "protocol_id": "PRO-002"},
            headers=auth_headers["clinician"],
        ).json()["id"]
        self._record(client, auth_headers, patient_id, course_id)
        self._record(client, auth_headers, patient_id, course2)

        resp = client.get(f"/api/v1/outcomes?course_id={course_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_filter_by_template(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        self._record(client, auth_headers, patient_id, course_id, "PHQ-9")
        self._record(client, auth_headers, patient_id, course_id, "GAD-7")
        resp = client.get("/api/v1/outcomes?template_id=PHQ-9", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    def test_empty_list(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/outcomes", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestCourseSummary:
    def _record(
        self,
        client: TestClient,
        auth_headers: dict,
        patient_id: str,
        course_id: str,
        score: float,
        point: str,
    ) -> None:
        client.post(
            "/api/v1/outcomes",
            json={
                "patient_id": patient_id,
                "course_id": course_id,
                "template_id": "PHQ-9",
                "template_title": "PHQ-9 Depression Scale",
                "score_numeric": score,
                "measurement_point": point,
            },
            headers=auth_headers["clinician"],
        )

    def test_summary_responder(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        # Baseline 20, post 8 → 60% reduction → responder
        self._record(client, auth_headers, patient_id, course_id, 20.0, "baseline")
        self._record(client, auth_headers, patient_id, course_id, 8.0, "post")

        resp = client.get(f"/api/v1/outcomes/summary/{course_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["course_id"] == course_id
        assert len(data["summaries"]) == 1
        summary = data["summaries"][0]
        assert summary["baseline_score"] == 20.0
        assert summary["latest_score"] == 8.0
        assert summary["delta"] == 12.0
        assert summary["pct_change"] == 60.0
        assert summary["is_responder"] is True
        assert data["responder"] is True

    def test_summary_non_responder(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        # Baseline 20, post 15 → 25% reduction → not responder
        self._record(client, auth_headers, patient_id, course_id, 20.0, "baseline")
        self._record(client, auth_headers, patient_id, course_id, 15.0, "post")

        resp = client.get(f"/api/v1/outcomes/summary/{course_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        summary = resp.json()["summaries"][0]
        assert summary["is_responder"] is False
        assert resp.json()["responder"] is False

    def test_summary_no_baseline(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        # Mid-only → no baseline → delta/pct_change should be None
        self._record(client, auth_headers, patient_id, course_id, 14.0, "mid")

        resp = client.get(f"/api/v1/outcomes/summary/{course_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        summary = resp.json()["summaries"][0]
        assert summary["baseline_score"] is None
        assert summary["delta"] is None

    def test_summary_empty_course(
        self, client: TestClient, auth_headers: dict, course_id: str
    ) -> None:
        resp = client.get(f"/api/v1/outcomes/summary/{course_id}", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["summaries"] == []
        assert data["responder"] is None


class TestOutcomeEvents:
    def test_record_and_list_outcome_event(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        create = client.post(
            "/api/v1/outcomes/events",
            json={
                "patient_id": patient_id,
                "course_id": course_id,
                "event_type": "qeeg_improvement",
                "title": "qEEG alpha normalisation trend",
                "summary": "Posterior alpha power moved toward normative range.",
                "severity": "positive",
                "payload": {"band": "alpha", "direction": "normalising"},
            },
            headers=auth_headers["clinician"],
        )
        assert create.status_code == 201, create.text
        data = create.json()
        assert data["event_type"] == "qeeg_improvement"
        assert data["severity"] == "positive"
        assert data["payload"]["band"] == "alpha"

        listing = client.get(
            f"/api/v1/outcomes/events?patient_id={patient_id}",
            headers=auth_headers["clinician"],
        )
        assert listing.status_code == 200, listing.text
        payload = listing.json()
        assert payload["total"] == 1
        assert payload["items"][0]["title"] == "qEEG alpha normalisation trend"

    def test_guest_cannot_record_outcome_event(
        self, client: TestClient, auth_headers: dict, patient_id: str, course_id: str
    ) -> None:
        resp = client.post(
            "/api/v1/outcomes/events",
            json={
                "patient_id": patient_id,
                "course_id": course_id,
                "event_type": "follow_up_due",
                "title": "Follow-up due",
            },
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403
