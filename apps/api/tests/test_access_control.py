"""Test access control: RBAC, clinic isolation, consent checks."""

import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "deepsynaps"))

from knowledge_layer import KnowledgeLayer
from access_control import AccessControl
from audit_logger import AuditLogger
import sqlite3


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
            ("patient-001", "clinic-001", "clinician-001", "write", 1),
            ("patient-001", "clinic-001", "clinician-002", "read", 0),
            ("patient-002", "clinic-002", "clinician-001", "read", 1),
            ("patient-003", "clinic-001", "researcher-001", "read", 1),
        ]
    )
    conn.commit()
    conn.close()
    yield kl


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
        assert any("clinician" in err.lower() for err in result["errors"])

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
