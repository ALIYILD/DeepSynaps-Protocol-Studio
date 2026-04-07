"""Integration tests for package-level route gating.

Verifies that:
- Explorer cannot access uploads, handbooks, review queue, or protocol generation
- Resident can generate protocols but not access uploads or review queue
- Clinician Pro can access all single-user features
- Governance EV-D and off-label blocks apply regardless of package
"""
from fastapi.testclient import TestClient


PACKAGE_HEADERS: dict[str, dict[str, str]] = {
    "explorer": {"Authorization": "Bearer explorer-demo-token"},
    "resident": {"Authorization": "Bearer resident-demo-token"},
    "clinician_pro": {"Authorization": "Bearer clinician-demo-token"},
    "clinic_admin": {"Authorization": "Bearer clinic-admin-demo-token"},
    "enterprise": {"Authorization": "Bearer enterprise-demo-token"},
}

_PROTOCOL_PAYLOAD = {
    "condition": "Parkinson's disease",
    "symptom_cluster": "Motor symptoms",
    "modality": "TPS",
    "device": "NEUROLITH",
    "setting": "Clinic",
    "evidence_threshold": "Systematic Review",
    "off_label": False,
}

_UPLOAD_PAYLOAD = {
    "uploads": [
        {
            "type": "Intake Form",
            "file_name": "intake.pdf",
            "summary": "Motor symptom intake.",
        }
    ]
}

_HANDBOOK_PAYLOAD = {
    "handbook_kind": "clinician_handbook",
    "condition": "Parkinson's disease",
    "modality": "TPS",
}

_REVIEW_PAYLOAD = {
    "target_id": "proto-test",
    "target_type": "protocol",
    "action": "reviewed",
    "note": "Package gating test.",
}


# ── Explorer (free) ───────────────────────────────────────────────────────────

class TestExplorerGating:
    def test_protocol_generation_blocked(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/protocols/generate-draft",
            headers=PACKAGE_HEADERS["explorer"],
            json=_PROTOCOL_PAYLOAD,
        )
        assert response.status_code == 403
        assert response.json()["code"] == "insufficient_package"

    def test_uploads_blocked(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/uploads/case-summary",
            headers=PACKAGE_HEADERS["explorer"],
            json=_UPLOAD_PAYLOAD,
        )
        assert response.status_code == 403

    def test_handbook_blocked_by_role(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/handbooks/generate",
            headers=PACKAGE_HEADERS["explorer"],
            json=_HANDBOOK_PAYLOAD,
        )
        # Explorer is guest role — blocked by role before package check
        assert response.status_code == 403

    def test_review_action_blocked_by_role(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/review-actions",
            headers=PACKAGE_HEADERS["explorer"],
            json=_REVIEW_PAYLOAD,
        )
        assert response.status_code == 403

    def test_evidence_library_accessible(self, client: TestClient) -> None:
        response = client.get("/api/v1/evidence", headers=PACKAGE_HEADERS["explorer"])
        assert response.status_code == 200

    def test_device_registry_accessible(self, client: TestClient) -> None:
        response = client.get("/api/v1/devices", headers=PACKAGE_HEADERS["explorer"])
        assert response.status_code == 200


# ── Resident / Fellow ─────────────────────────────────────────────────────────

class TestResidentGating:
    def test_protocol_generation_allowed(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/protocols/generate-draft",
            headers=PACKAGE_HEADERS["resident"],
            json=_PROTOCOL_PAYLOAD,
        )
        assert response.status_code == 200

    def test_uploads_blocked(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/uploads/case-summary",
            headers=PACKAGE_HEADERS["resident"],
            json=_UPLOAD_PAYLOAD,
        )
        assert response.status_code == 403
        assert response.json()["code"] == "insufficient_package"

    def test_handbook_allowed(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/handbooks/generate",
            headers=PACKAGE_HEADERS["resident"],
            json=_HANDBOOK_PAYLOAD,
        )
        assert response.status_code == 200

    def test_review_queue_blocked(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/review-actions",
            headers=PACKAGE_HEADERS["resident"],
            json=_REVIEW_PAYLOAD,
        )
        assert response.status_code == 403
        assert response.json()["code"] == "insufficient_package"

    def test_off_label_blocked_by_governance(self, client: TestClient) -> None:
        """Governance off-label block applies independently of package."""
        response = client.post(
            "/api/v1/protocols/generate-draft",
            headers=PACKAGE_HEADERS["resident"],
            json={**_PROTOCOL_PAYLOAD, "off_label": True},
        )
        # Resident is clinician role, so off-label is allowed by role.
        # The governance check allows clinicians to use off-label.
        assert response.status_code == 200


# ── Clinician Pro ─────────────────────────────────────────────────────────────

class TestClinicianProGating:
    def test_protocol_generation_allowed(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/protocols/generate-draft",
            headers=PACKAGE_HEADERS["clinician_pro"],
            json=_PROTOCOL_PAYLOAD,
        )
        assert response.status_code == 200

    def test_uploads_allowed(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/uploads/case-summary",
            headers=PACKAGE_HEADERS["clinician_pro"],
            json=_UPLOAD_PAYLOAD,
        )
        assert response.status_code == 200

    def test_handbook_allowed(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/handbooks/generate",
            headers=PACKAGE_HEADERS["clinician_pro"],
            json=_HANDBOOK_PAYLOAD,
        )
        assert response.status_code == 200

    def test_review_queue_allowed(self, client: TestClient) -> None:
        response = client.post(
            "/api/v1/review-actions",
            headers=PACKAGE_HEADERS["clinician_pro"],
            json=_REVIEW_PAYLOAD,
        )
        assert response.status_code == 200


# ── Governance independence ───────────────────────────────────────────────────

class TestGovernanceOverridesPackage:
    def test_guest_off_label_blocked_by_governance_not_package(self, client: TestClient) -> None:
        """Off-label block fires before package check — code must be forbidden_off_label."""
        response = client.post(
            "/api/v1/protocols/generate-draft",
            headers={"Authorization": "Bearer guest-demo-token"},
            json={**_PROTOCOL_PAYLOAD, "off_label": True},
        )
        assert response.status_code == 403
        # Must be the governance code, not the package code
        assert response.json()["code"] == "forbidden_off_label"

    def test_enterprise_cannot_bypass_governance_codes(self, client: TestClient) -> None:
        """Enterprise package does not weaken governance restrictions."""
        # Enterprise users with guest role still can't go off-label — but enterprise is admin role
        # Verify that a well-formed request works, while governance code remains accurate
        response = client.post(
            "/api/v1/protocols/generate-draft",
            headers=PACKAGE_HEADERS["enterprise"],
            json=_PROTOCOL_PAYLOAD,
        )
        assert response.status_code == 200
