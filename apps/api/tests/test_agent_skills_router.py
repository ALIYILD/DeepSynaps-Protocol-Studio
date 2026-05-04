"""Agent skills router — admin-configurable AI Practice Agent catalogue.

Skill rows are seeded by the lifespan startup hook
(`seed_default_agent_skills`). The TestClient context manager triggers
lifespan startup, so each test starts with the seeded default rows.
"""
from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select

from deepsynaps_safety_engine import (
    GOVERNANCE_POLICY_REF,
    SAFETY_ENGINE_WRAPPER_VERSION,
)

from app.database import SessionLocal
from app.persistence.models import AgentSkill
from app.services.agent_skills_seed import DEFAULT_AGENT_SKILLS
from app.services.agent_skills_seed import seed_default_agent_skills


_DEFAULT_COUNT = len(DEFAULT_AGENT_SKILLS)


class TestAgentSkillsAuth:
    def test_clinician_can_list(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/agent-skills", headers=auth_headers["clinician"])
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == _DEFAULT_COUNT
        assert len(data["items"]) == _DEFAULT_COUNT

    def test_guest_denied(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/agent-skills", headers=auth_headers["guest"])
        assert resp.status_code == 403

    def test_clinician_cannot_create(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.post(
            "/api/v1/agent-skills",
            json={"category_id": "comms", "label": "Sneaky"},
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 403


class TestAgentSkillsListVisibility:
    def test_seed_includes_launch_team_presets(self, client: TestClient, auth_headers: dict) -> None:
        listing = client.get("/api/v1/agent-skills", headers=auth_headers["clinician"]).json()
        labels = {row["label"] for row in listing["items"]}
        assert "Go-Live Lead" in labels
        assert "Go-Live Implementer" in labels
        assert "Go-Live QA Reviewer" in labels
        assert "Release Brief" in labels

    def test_clinician_excludes_disabled_admin_includes_them(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        # Use admin to flip a row off.
        listing = client.get("/api/v1/agent-skills", headers=auth_headers["admin"]).json()
        first = listing["items"][0]
        patch = client.patch(
            f"/api/v1/agent-skills/{first['id']}",
            json={"enabled": False},
            headers=auth_headers["admin"],
        )
        assert patch.status_code == 200
        assert patch.json()["enabled"] is False

        admin_listing = client.get("/api/v1/agent-skills", headers=auth_headers["admin"]).json()
        clinician_listing = client.get("/api/v1/agent-skills", headers=auth_headers["clinician"]).json()
        admin_ids = {row["id"] for row in admin_listing["items"]}
        clinician_ids = {row["id"] for row in clinician_listing["items"]}
        assert first["id"] in admin_ids
        assert first["id"] not in clinician_ids
        assert clinician_listing["total"] == _DEFAULT_COUNT - 1

    def test_seed_backfills_missing_defaults(self) -> None:
        db_session = SessionLocal()
        try:
            seed_default_agent_skills(db_session)
            record = db_session.scalar(
                select(AgentSkill).where(AgentSkill.label == "Go-Live Lead")
            )
            assert record is not None
            db_session.delete(record)
            db_session.commit()

            inserted = seed_default_agent_skills(db_session)
            assert inserted >= 1

            restored = db_session.scalar(
                select(AgentSkill).where(AgentSkill.label == "Go-Live Lead")
            )
            assert restored is not None
        finally:
            db_session.close()


class TestAgentSkillsCrud:
    def test_admin_can_create_and_patch_and_soft_delete(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        create = client.post(
            "/api/v1/agent-skills",
            json={
                "category_id": "comms",
                "label": "Send Birthday Card",
                "description": "Mail a card to the patient.",
                "icon": "🎂",
                "run_payload": {"prompt": "Draft a warm birthday note."},
                "sort_order": 99,
            },
            headers=auth_headers["admin"],
        )
        assert create.status_code == 201, create.text
        created = create.json()
        assert created["category_id"] == "comms"
        assert created["run_payload"]["prompt"] == "Draft a warm birthday note."
        assert created["enabled"] is True

        patch = client.patch(
            f"/api/v1/agent-skills/{created['id']}",
            json={"label": "Send Anniversary Card"},
            headers=auth_headers["admin"],
        )
        assert patch.status_code == 200
        assert patch.json()["label"] == "Send Anniversary Card"

        # Soft delete sets enabled=false; row is still visible to admin.
        delete = client.delete(
            f"/api/v1/agent-skills/{created['id']}", headers=auth_headers["admin"]
        )
        assert delete.status_code == 204
        admin_listing = client.get(
            "/api/v1/agent-skills", headers=auth_headers["admin"]
        ).json()
        target = next(r for r in admin_listing["items"] if r["id"] == created["id"])
        assert target["enabled"] is False

    def test_blank_label_rejected(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.post(
            "/api/v1/agent-skills",
            json={"category_id": "comms", "label": "   "},
            headers=auth_headers["admin"],
        )
        assert resp.status_code == 422


class TestCuratedOpenClawSkills:
    def test_clinician_can_list_curated_catalog(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(
            "/api/v1/agent-skills/openclaw-curated",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["allowlisted_total"] >= 10
        assert data["rejected_total"] >= 5

        allowlisted = {row["source_skill_name"]: row for row in data["allowlisted"]}
        rejected = {row["source_skill_name"]: row for row in data["rejected"]}

        assert "patiently-ai" in allowlisted
        assert "clinical-decision-support" in rejected
        assert allowlisted["patiently-ai"]["patient_facing_default_allowed"] is True

        wrapper = allowlisted["patiently-ai"]["wrapper_defaults"]
        assert wrapper["requires_clinician_review"] is True
        assert wrapper["governance_policy_ref"] == GOVERNANCE_POLICY_REF
        assert wrapper["wrapper_version"] == SAFETY_ENGINE_WRAPPER_VERSION

    def test_guest_denied_curated_catalog(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(
            "/api/v1/agent-skills/openclaw-curated",
            headers=auth_headers["guest"],
        )
        assert resp.status_code == 403

    def test_clinician_can_list_curated_layer_use_cases(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.get(
            "/api/v1/agent-skills/openclaw-curated/layer",
            headers=auth_headers["clinician"],
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["total"] >= 6

        rows = {row["id"]: row for row in data["use_cases"]}
        assert rows["patient-handbooks"]["patient_facing_possible"] is True
        assert "patiently-ai" in rows["patient-handbooks"]["allowed_source_skills"]
        assert rows["protocol-generation"]["requires_citations"] is True
        assert rows["fhir-integration"]["execution_mode"] == "native_only"
        assert rows["fhir-integration"]["allowed_source_skills"] == []


class TestAgentSkillsSortOrder:
    def test_list_respects_sort_order(self, client: TestClient, auth_headers: dict) -> None:
        # Push a freshly created skill to sort_order=0 and confirm it leads.
        create = client.post(
            "/api/v1/agent-skills",
            json={
                "category_id": "reports",
                "label": "AAA First",
                "sort_order": -10,
                "run_payload": {"prompt": "lead"},
            },
            headers=auth_headers["admin"],
        )
        assert create.status_code == 201
        created_id = create.json()["id"]

        listing = client.get(
            "/api/v1/agent-skills", headers=auth_headers["clinician"]
        ).json()
        assert listing["items"][0]["id"] == created_id
        # And the original seed rows still come after.
        assert listing["total"] == _DEFAULT_COUNT + 1
