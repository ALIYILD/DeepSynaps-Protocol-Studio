"""Test access control: RBAC, clinic isolation, consent checks,
role hierarchy (super_admin, clinic_admin, reviewer, technician),
and hardened decorator-based guards.
"""

import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from knowledge_layer import KnowledgeLayer
from access_control import (
    AccessControl,
    AccessControlDecorators,
    ROLE_HIERARCHY,
    ROLE_PERMISSIONS,
    CLINICIAN_GUARD,
    AI_SYNTHESIS_GUARD,
    REVIEW_GUARD,
    EXPORT_GUARD,
    ADMIN_GUARD,
    SUPER_ADMIN_GUARD,
)
from audit_logger import AuditLogger
import sqlite3


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def setup_kl(tmp_path):
    """Create a fresh KnowledgeLayer with test access records using temp file DB."""
    db_file = str(tmp_path / "test.db")
    kl = KnowledgeLayer(db_file)
    # Seed patient access records
    conn = sqlite3.connect(kl.db_path)
    cursor = conn.cursor()
    cursor.executemany(
        "INSERT INTO patient_access VALUES (?, ?, ?, ?, ?)",
        [
            # patient-001 in clinic-001
            ("patient-001", "clinic-001", "clinician-001", "write", 1),
            ("patient-001", "clinic-001", "clinician-002", "read", 0),
            ("patient-001", "clinic-001", "clinicadmin-001", "admin", 1),
            ("patient-001", "clinic-001", "reviewer-001", "read", 1),
            ("patient-001", "clinic-001", "technician-001", "write", 0),
            ("patient-001", "clinic-001", "superadmin-001", "admin", 1),
            # patient-002 in clinic-002
            ("patient-002", "clinic-002", "clinician-001", "read", 1),
            ("patient-002", "clinic-002", "clinicadmin-002", "admin", 1),
            # patient-003 for researcher tests
            ("patient-003", "clinic-001", "researcher-001", "read", 1),
        ]
    )
    conn.commit()
    conn.close()
    yield kl


# ═══════════════════════════════════════════════════════════════════════════════
# ROLE HIERARCHY & PERMISSION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestRoleHierarchy:
    """Test the role hierarchy is correctly defined."""

    def test_role_hierarchy_order(self):
        """Roles should be ordered from most to least privileged."""
        assert ROLE_HIERARCHY[0] == "super_admin"
        assert ROLE_HIERARCHY[1] == "clinic_admin"
        assert ROLE_HIERARCHY[2] == "clinician"
        assert ROLE_HIERARCHY[3] == "reviewer"
        assert ROLE_HIERARCHY[4] == "technician"

    def test_super_admin_has_all_permissions(self, setup_kl):
        ac = AccessControl(setup_kl)
        perms = ROLE_PERMISSIONS["super_admin"]
        assert perms["can_read_patient"] is True
        assert perms["can_write_patient"] is True
        assert perms["can_run_ai_synthesis"] is True
        assert perms["can_export"] is True
        assert perms["can_review_hypotheses"] is True
        assert perms["can_manage_clinic"] is True
        assert perms["can_manage_users"] is True
        assert perms["cross_clinic_access"] is True

    def test_technician_cannot_read_patient(self, setup_kl):
        ac = AccessControl(setup_kl)
        perms = ROLE_PERMISSIONS["technician"]
        assert perms["can_read_patient"] is False

    def test_reviewer_cannot_run_ai(self, setup_kl):
        ac = AccessControl(setup_kl)
        perms = ROLE_PERMISSIONS["reviewer"]
        assert perms["can_run_ai_synthesis"] is False

    def test_clinic_admin_can_manage_clinic(self, setup_kl):
        ac = AccessControl(setup_kl)
        perms = ROLE_PERMISSIONS["clinic_admin"]
        assert perms["can_manage_clinic"] is True
        assert perms["cross_clinic_access"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# BASIC RBAC TESTS (Legacy Compatibility)
# ═══════════════════════════════════════════════════════════════════════════════

class TestRoleBasedAccessControl:
    """Test RBAC enforcement."""

    def test_clinician_role_authorized(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            role="clinician",
        )
        assert result["authorized"] is True
        assert result["errors"] == []

    def test_non_clinician_role_denied(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="researcher-001",
            clinic_id="clinic-001",
            role="researcher",
        )
        assert result["authorized"] is False
        assert any("not recognized" in err.lower() for err in result["errors"])

    def test_admin_role_denied(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="admin-001",
            clinic_id="clinic-001",
            role="admin",
        )
        assert result["authorized"] is False


class TestClinicIsolation:
    """Test clinic isolation enforcement."""

    def test_same_clinic_access_granted(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            role="clinician",
        )
        assert result["authorized"] is True

    def test_different_clinic_denied(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-002",
            clinician_id="clinician-001",
            clinic_id="clinic-001",  # patient-002 is in clinic-002
            role="clinician",
        )
        assert result["authorized"] is False
        assert any("access" in err.lower() for err in result["errors"])

    def test_different_clinician_same_clinic(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinician-002",
            clinic_id="clinic-001",
            role="clinician",
        )
        assert result["authorized"] is True
        # clinician-002 has access but no AI consent
        assert result["ai_synthesis_allowed"] is False


class TestAISynthesisConsent:
    """Test AI analysis consent enforcement."""

    def test_ai_synthesis_with_consent_granted(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            role="clinician",
            ai_synthesis=True,
        )
        assert result["authorized"] is True
        assert result["ai_synthesis_allowed"] is True

    def test_ai_synthesis_without_consent_denied(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinician-002",
            clinic_id="clinic-001",
            role="clinician",
            ai_synthesis=True,
        )
        assert result["authorized"] is False
        assert any("consent" in err.lower() for err in result["errors"])

    def test_ai_synthesis_consent_false_when_not_requested(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinician-002",
            clinic_id="clinic-001",
            role="clinician",
            ai_synthesis=False,
        )
        # Access is granted but ai_synthesis is not allowed
        assert result["authorized"] is True
        assert result["ai_synthesis_allowed"] is False


class TestNonExistentPatient:
    """Test access to non-existent patients."""

    def test_nonexistent_patient_denied(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-999",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            role="clinician",
        )
        assert result["authorized"] is False
        assert any("access" in err.lower() for err in result["errors"])


class TestAuditLogging:
    """Test that access attempts are logged."""

    def test_access_log_created(self, setup_kl):
        ac = AccessControl(setup_kl)
        ac.log_access(
            endpoint="/api/v1/multimodal/patients/patient-001/timeline",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            patient_id="patient-001",
            action="test_access",
        )
        conn = sqlite3.connect(setup_kl.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM audit_log WHERE patient_id = ? AND clinician_id = ?",
            ("patient-001", "clinician-001"),
        )
        rows = cursor.fetchall()
        conn.close()
        assert len(rows) > 0

    def test_denied_access_logged(self, setup_kl):
        ac = AccessControl(setup_kl)
        ac.log_access(
            endpoint="/api/v1/multimodal/patients/patient-002/timeline",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            patient_id="patient-002",
            action="test_denied",
            status="denied",
        )
        conn = sqlite3.connect(setup_kl.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM audit_log WHERE patient_id = ? AND response_status = ?",
            ("patient-002", "denied"),
        )
        rows = cursor.fetchall()
        conn.close()
        assert len(rows) > 0

    def test_log_denied_access_method(self, setup_kl):
        ac = AccessControl(setup_kl)
        action = ac.log_denied_access(
            endpoint="/api/v1/test",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            patient_id="patient-001",
            reason="wrong_clinic",
            role="clinician",
        )
        conn = sqlite3.connect(setup_kl.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM audit_log WHERE action LIKE ?",
            ("%DENIED%",),
        )
        rows = cursor.fetchall()
        conn.close()
        assert len(rows) > 0
        assert "DENIED" in action

    def test_log_access_with_role(self, setup_kl):
        ac = AccessControl(setup_kl)
        ac.log_access(
            endpoint="/api/v1/test",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            patient_id="patient-001",
            action="test_action",
            role="clinician",
        )
        conn = sqlite3.connect(setup_kl.db_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM audit_log WHERE action LIKE ?",
            ("%role=clinician%",),
        )
        rows = cursor.fetchall()
        conn.close()
        assert len(rows) > 0


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: Missing Role, Wrong Clinic, Missing Consent
# ═══════════════════════════════════════════════════════════════════════════════

class TestMissingRole:
    """Test 403 when required role is missing."""

    def test_missing_role_unrecognized(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="unknown-001",
            clinic_id="clinic-001",
            role="",
        )
        assert result["authorized"] is False
        assert any("not recognized" in err.lower() for err in result["errors"])

    def test_missing_role_none(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="unknown-001",
            clinic_id="clinic-001",
            role="invalid_role",
        )
        assert result["authorized"] is False
        assert any("not recognized" in err.lower() for err in result["errors"])

    def test_technician_cannot_read_patient_data(self, setup_kl):
        """Technician role lacks can_read_patient — should be denied."""
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="technician-001",
            clinic_id="clinic-001",
            role="technician",
        )
        assert result["authorized"] is False
        assert any("read patient" in err.lower() for err in result["errors"])

    def test_decorator_role_required_denies_unknown_role(self, setup_kl):
        """unknown-001 defaults to 'clinician' role; requiring 'super_admin' should deny."""
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.role_required(["super_admin"])
        result = dec(ac, "patient-001", "unknown-001", "clinic-001")
        assert result["authorized"] is False


class TestWrongClinic:
    """Test 403 when clinician accesses patient from wrong clinic."""

    def test_clinician_wrong_clinic_denied(self, setup_kl):
        """clinician-001 is authorized for clinic-001, accessing patient-002 in clinic-002
        with clinic-001 header should be denied."""
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-002",
            clinician_id="clinician-001",
            clinic_id="clinic-001",  # Wrong clinic for patient-002
            role="clinician",
        )
        assert result["authorized"] is False
        assert any("access" in err.lower() for err in result["errors"])

    def test_clinic_isolation_decorator(self, setup_kl):
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.clinic_isolated()
        result = dec(ac, "patient-002", "clinician-001", "clinic-001", "clinician")
        assert result["isolated"] is False
        assert len(result["errors"]) > 0

    def test_clinic_isolation_passes_for_correct_clinic(self, setup_kl):
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.clinic_isolated()
        result = dec(ac, "patient-001", "clinician-001", "clinic-001", "clinician")
        assert result["isolated"] is True
        assert len(result["errors"]) == 0


class TestMissingAIConsent:
    """Test 403 when AI consent is missing for synthesis endpoints."""

    def test_clinician_no_consent_denied_for_ai(self, setup_kl):
        """clinician-002 has access to patient-001 but no AI consent."""
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinician-002",
            clinic_id="clinic-001",
            role="clinician",
            ai_synthesis=True,
        )
        assert result["authorized"] is False
        assert any("consent" in err.lower() for err in result["errors"])

    def test_consent_decorator_denies_without_consent(self, setup_kl):
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.consent_required()
        result = dec(ac, "patient-001", "clinic-001", "clinician-002")
        assert result["consented"] is False
        assert len(result["errors"]) > 0

    def test_consent_decorator_allows_with_consent(self, setup_kl):
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.consent_required()
        result = dec(ac, "patient-001", "clinic-001", "clinician-001")
        assert result["consented"] is True
        assert len(result["errors"]) == 0

    def test_reviewer_cannot_run_ai_even_with_consent(self, setup_kl):
        """Reviewer has ai_analysis_consent=1 but role forbids AI synthesis."""
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="reviewer-001",
            clinic_id="clinic-001",
            role="reviewer",
            ai_synthesis=True,
        )
        assert result["authorized"] is False
        assert any("not authorized" in err.lower() for err in result["errors"])


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: clinic_admin Access
# ═══════════════════════════════════════════════════════════════════════════════

class TestClinicAdminAccess:
    """Test clinic_admin role permissions."""

    def test_clinic_admin_can_read_patient(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinicadmin-001",
            clinic_id="clinic-001",
            role="clinic_admin",
        )
        assert result["authorized"] is True

    def test_clinic_admin_can_run_ai_synthesis(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinicadmin-001",
            clinic_id="clinic-001",
            role="clinic_admin",
            ai_synthesis=True,
        )
        assert result["authorized"] is True
        assert result["ai_synthesis_allowed"] is True

    def test_clinic_admin_cannot_cross_clinic(self, setup_kl):
        """clinicadmin-001 is in clinic-001, should not access patient-002 in clinic-002."""
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-002",
            clinician_id="clinicadmin-001",
            clinic_id="clinic-001",
            role="clinic_admin",
        )
        assert result["authorized"] is False
        assert any("access" in err.lower() for err in result["errors"])

    def test_clinic_admin_has_manage_permission(self, setup_kl):
        perms = ROLE_PERMISSIONS["clinic_admin"]
        assert perms["can_manage_clinic"] is True
        assert perms["can_manage_users"] is True

    def test_clinic_admin_guard(self, setup_kl):
        ac = AccessControl(setup_kl)
        guard = AccessControlDecorators.full_guard(
            allowed_roles=["clinic_admin", "super_admin"]
        )
        result = guard(
            ac, "patient-001", "clinicadmin-001", "clinic-001", "clinic_admin"
        )
        assert result["authorized"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: super_admin Access
# ═══════════════════════════════════════════════════════════════════════════════

class TestSuperAdminAccess:
    """Test super_admin role permissions."""

    def test_super_admin_can_read_patient(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="superadmin-001",
            clinic_id="clinic-001",
            role="super_admin",
        )
        assert result["authorized"] is True

    def test_super_admin_can_run_ai_synthesis(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="superadmin-001",
            clinic_id="clinic-001",
            role="super_admin",
            ai_synthesis=True,
        )
        assert result["authorized"] is True

    def test_super_admin_can_cross_clinic(self, setup_kl):
        """super_admin bypasses clinic isolation via cross_clinic_access."""
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-002",  # In clinic-002
            clinician_id="superadmin-001",
            clinic_id="clinic-001",  # Request from clinic-001
            role="super_admin",
        )
        assert result["authorized"] is True

    def test_super_admin_has_all_permissions(self, setup_kl):
        perms = ROLE_PERMISSIONS["super_admin"]
        assert perms["cross_clinic_access"] is True
        assert perms["can_manage_clinic"] is True
        assert perms["can_manage_users"] is True

    def test_super_admin_guard(self, setup_kl):
        ac = AccessControl(setup_kl)
        guard = AccessControlDecorators.full_guard(allowed_roles=["super_admin"])
        result = guard(
            ac, "patient-001", "superadmin-001", "clinic-001", "super_admin"
        )
        assert result["authorized"] is True

    def test_non_super_admin_denied_by_super_admin_guard(self, setup_kl):
        ac = AccessControl(setup_kl)
        guard = AccessControlDecorators.full_guard(allowed_roles=["super_admin"])
        result = guard(
            ac, "patient-001", "clinician-001", "clinic-001", "clinician"
        )
        assert result["authorized"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: reviewer Role
# ═══════════════════════════════════════════════════════════════════════════════

class TestReviewerRole:
    """Test reviewer role permissions."""

    def test_reviewer_can_read_patient(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="reviewer-001",
            clinic_id="clinic-001",
            role="reviewer",
        )
        assert result["authorized"] is True

    def test_reviewer_cannot_run_ai(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="reviewer-001",
            clinic_id="clinic-001",
            role="reviewer",
            ai_synthesis=True,
        )
        assert result["authorized"] is False
        assert any("ai synthesis" in err.lower() for err in result["errors"])

    def test_reviewer_can_export(self, setup_kl):
        perms = ROLE_PERMISSIONS["reviewer"]
        assert perms["can_export"] is True

    def test_reviewer_cannot_write_patient(self, setup_kl):
        perms = ROLE_PERMISSIONS["reviewer"]
        assert perms["can_write_patient"] is False

    def test_reviewer_guard(self, setup_kl):
        ac = AccessControl(setup_kl)
        guard = AccessControlDecorators.full_guard(
            allowed_roles=["reviewer", "clinician"]
        )
        result = guard(
            ac, "patient-001", "reviewer-001", "clinic-001", "reviewer"
        )
        assert result["authorized"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: technician Role
# ═══════════════════════════════════════════════════════════════════════════════

class TestTechnicianRole:
    """Test technician role permissions."""

    def test_technician_denied_read_patient(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="technician-001",
            clinic_id="clinic-001",
            role="technician",
        )
        assert result["authorized"] is False
        assert any("read patient" in err.lower() for err in result["errors"])

    def test_technician_cannot_run_ai(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="technician-001",
            clinic_id="clinic-001",
            role="technician",
            ai_synthesis=True,
        )
        assert result["authorized"] is False

    def test_technician_cannot_export(self, setup_kl):
        perms = ROLE_PERMISSIONS["technician"]
        assert perms["can_export"] is False

    def test_technician_can_write_data(self, setup_kl):
        perms = ROLE_PERMISSIONS["technician"]
        assert perms["can_write_patient"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: Pre-configured Guards
# ═══════════════════════════════════════════════════════════════════════════════

class TestPreconfiguredGuards:
    """Test the pre-configured guard callables."""

    def test_clinician_guard_allows_clinician(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = CLINICIAN_GUARD(
            ac, "patient-001", "clinician-001", "clinic-001", "clinician"
        )
        assert result["authorized"] is True

    def test_clinician_guard_allows_clinic_admin(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = CLINICIAN_GUARD(
            ac, "patient-001", "clinicadmin-001", "clinic-001", "clinic_admin"
        )
        assert result["authorized"] is True

    def test_ai_synthesis_guard_denies_without_consent(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = AI_SYNTHESIS_GUARD(
            ac, "patient-001", "clinician-002", "clinic-001", "clinician",
            ai_synthesis=True,
        )
        assert result["authorized"] is False

    def test_review_guard_allows_reviewer(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = REVIEW_GUARD(
            ac, "patient-001", "reviewer-001", "clinic-001", "reviewer"
        )
        assert result["authorized"] is True

    def test_export_guard_allows_clinician(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = EXPORT_GUARD(
            ac, "patient-001", "clinician-001", "clinic-001", "clinician"
        )
        assert result["authorized"] is True

    def test_admin_guard_denies_clinician(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ADMIN_GUARD(
            ac, "patient-001", "clinician-001", "clinic-001", "clinician"
        )
        assert result["authorized"] is False

    def test_admin_guard_allows_clinic_admin(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ADMIN_GUARD(
            ac, "patient-001", "clinicadmin-001", "clinic-001", "clinic_admin"
        )
        assert result["authorized"] is True

    def test_super_admin_guard_denies_clinic_admin(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = SUPER_ADMIN_GUARD(
            ac, "patient-001", "clinicadmin-001", "clinic-001", "clinic_admin"
        )
        assert result["authorized"] is False

    def test_super_admin_guard_allows_super_admin(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = SUPER_ADMIN_GUARD(
            ac, "patient-001", "superadmin-001", "clinic-001", "super_admin"
        )
        assert result["authorized"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: Role Lookup
# ═══════════════════════════════════════════════════════════════════════════════

class TestRoleLookup:
    """Test the user role lookup mechanism."""

    def test_lookup_clinician(self, setup_kl):
        ac = AccessControl(setup_kl)
        role = ac._lookup_user_role("clinician-001", "clinic-001")
        assert role == "clinician"

    def test_lookup_super_admin(self, setup_kl):
        ac = AccessControl(setup_kl)
        role = ac._lookup_user_role("superadmin-001", "clinic-001")
        assert role == "super_admin"

    def test_lookup_clinic_admin(self, setup_kl):
        ac = AccessControl(setup_kl)
        role = ac._lookup_user_role("clinicadmin-001", "clinic-001")
        assert role == "clinic_admin"

    def test_lookup_reviewer(self, setup_kl):
        ac = AccessControl(setup_kl)
        role = ac._lookup_user_role("reviewer-001", "clinic-001")
        assert role == "reviewer"

    def test_lookup_technician(self, setup_kl):
        ac = AccessControl(setup_kl)
        role = ac._lookup_user_role("technician-001", "clinic-001")
        assert role == "technician"

    def test_lookup_defaults_to_clinician(self, setup_kl):
        ac = AccessControl(setup_kl)
        role = ac._lookup_user_role("unknown-user", "clinic-001")
        assert role == "clinician"


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: Decorator-based Access Control
# ═══════════════════════════════════════════════════════════════════════════════

class TestDecoratorRoleRequired:
    """Test the role_required decorator pattern."""

    def test_role_required_allows_matching_role(self, setup_kl):
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.role_required(["clinician"])
        result = dec(ac, "patient-001", "clinician-001", "clinic-001")
        assert result["authorized"] is True

    def test_role_required_denies_lower_role(self, setup_kl):
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.role_required(["clinic_admin"])
        result = dec(ac, "patient-001", "clinician-001", "clinic-001")
        assert result["authorized"] is False

    def test_role_required_allows_higher_role(self, setup_kl):
        """super_admin should pass clinic_admin requirement via hierarchy."""
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.role_required(["clinic_admin"])
        result = dec(ac, "patient-001", "superadmin-001", "clinic-001")
        assert result["authorized"] is True

    def test_role_required_allows_multiple_roles(self, setup_kl):
        ac = AccessControl(setup_kl)
        dec = AccessControlDecorators.role_required(["reviewer", "clinician"])
        result = dec(ac, "patient-001", "reviewer-001", "clinic-001")
        assert result["authorized"] is True


class TestFullGuard:
    """Test the comprehensive full_guard decorator."""

    def test_full_guard_with_ai_consent(self, setup_kl):
        ac = AccessControl(setup_kl)
        guard = AccessControlDecorators.full_guard(
            allowed_roles=["clinician"],
            require_ai_consent=True,
        )
        result = guard(
            ac, "patient-001", "clinician-001", "clinic-001", "clinician",
            ai_synthesis=True,
        )
        assert result["authorized"] is True

    def test_full_guard_without_ai_consent_denied(self, setup_kl):
        ac = AccessControl(setup_kl)
        guard = AccessControlDecorators.full_guard(
            allowed_roles=["clinician"],
            require_ai_consent=True,
        )
        result = guard(
            ac, "patient-001", "clinician-002", "clinic-001", "clinician",
            ai_synthesis=True,
        )
        assert result["authorized"] is False

    def test_full_guard_no_consent_check_without_flag(self, setup_kl):
        ac = AccessControl(setup_kl)
        guard = AccessControlDecorators.full_guard(
            allowed_roles=["clinician"],
            require_ai_consent=False,
        )
        result = guard(
            ac, "patient-001", "clinician-002", "clinic-001", "clinician",
            ai_synthesis=False,
        )
        assert result["authorized"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# HARDENED TESTS: Cross-cutting Security
# ═══════════════════════════════════════════════════════════════════════════════

class TestCrossCuttingSecurity:
    """Cross-cutting security concerns."""

    def test_all_roles_recognized_by_authenticate(self, setup_kl):
        ac = AccessControl(setup_kl)
        for role in ROLE_HIERARCHY:
            clinician_map = {
                "super_admin": "superadmin-001",
                "clinic_admin": "clinicadmin-001",
                "clinician": "clinician-001",
                "reviewer": "reviewer-001",
                "technician": "technician-001",
            }
            result = ac.authenticate_request(
                patient_id="patient-001",
                clinician_id=clinician_map[role],
                clinic_id="clinic-001",
                role=role,
            )
            # Only roles with can_read_patient=True should be authorized
            can_read = ROLE_PERMISSIONS[role]["can_read_patient"]
            if can_read:
                assert result["authorized"] is True, f"Role {role} should be authorized"
            else:
                assert result["authorized"] is False, f"Role {role} should be denied"

    def test_unknown_role_is_denied(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="hacker-001",
            clinic_id="clinic-001",
            role="hacker",
        )
        assert result["authorized"] is False

    def test_result_contains_all_expected_fields(self, setup_kl):
        ac = AccessControl(setup_kl)
        result = ac.authenticate_request(
            patient_id="patient-001",
            clinician_id="clinician-001",
            clinic_id="clinic-001",
            role="clinician",
        )
        assert "authorized" in result
        assert "clinic_id" in result
        assert "patient_id" in result
        assert "clinician_id" in result
        assert "role" in result
        assert "ai_synthesis_allowed" in result
        assert "access_level" in result
        assert "permissions" in result
        assert "errors" in result
