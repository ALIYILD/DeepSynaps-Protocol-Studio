"""
Consent Enforcement Test Suite

Tests verify that ALL patient data workflows require active consent before processing.

Hard Rules:
- No AI processing without ai_analysis consent
- No device sync without device_sync consent
- No document generation without document_generation consent
- Missing/withdrawn/expired consent returns 403
- All denied attempts create AuditEvent + SafetyFlag
- Zero model/provider calls when consent missing
- No silent bypass for real patient_id
"""

import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.main import app
from app.persistence.models import (
    ConsentRecord,
    AuditEventRecord,
    SafetyFlag,
    Patient,
    Clinic,
)
from app.services.consent_service import ConsentService
from app.auth import AuthenticatedActor

client = TestClient(app)


class TestConsentEnforcementAIAnalysis:
    """Test AI analysis routes require ai_analysis consent"""

    @pytest.fixture
    def setup_clinic_patient_actor(self, db_session: Session):
        """Setup test clinic, patient, and actor"""
        clinic = Clinic(id="clinic-test-1", name="Test Clinic")
        db_session.add(clinic)
        db_session.flush()
        
        patient = Patient(id="patient-test-1", clinic_id=clinic.id, mrn="12345")
        db_session.add(patient)
        db_session.flush()
        
        actor = AuthenticatedActor(
            id="actor-test-1",
            user_id="user-test-1",
            clinic_id=clinic.id,
            role="clinician"
        )
        
        db_session.commit()
        return clinic, patient, actor

    def test_mri_analysis_blocked_without_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify POST /mri/analyze returns 403 when ai_analysis consent missing"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        response = client.post(
            f"/api/v1/mri/analyze",
            json={
                "patient_id": patient.id,
                "file_path": "/uploads/test.nii.gz"
            },
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 403
        assert "consent" in response.json()["error"].lower()

    def test_mri_analysis_creates_audit_event_on_denied_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify AuditEvent is created when AI analysis blocked by missing consent"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        client.post(
            f"/api/v1/mri/analyze",
            json={"patient_id": patient.id, "file_path": "/uploads/test.nii.gz"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        # Verify AuditEvent exists
        audit = db_session.query(AuditEventRecord).filter(
            AuditEventRecord.patient_id == patient.id,
            AuditEventRecord.action == "ai_analysis_attempted",
            AuditEventRecord.result == "denied_no_consent"
        ).first()
        
        assert audit is not None
        assert audit.resource_type == "mri_analysis"

    def test_mri_analysis_creates_safety_flag_on_denied_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify SafetyFlag is created when AI analysis blocked by missing consent"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        client.post(
            f"/api/v1/mri/analyze",
            json={"patient_id": patient.id, "file_path": "/uploads/test.nii.gz"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        # Verify SafetyFlag exists
        flag = db_session.query(SafetyFlag).filter(
            SafetyFlag.patient_id == patient.id,
            SafetyFlag.flag_type == "consent_missing"
        ).first()
        
        assert flag is not None
        assert "MRI" in flag.message or "analysis" in flag.message.lower()

    def test_mri_analysis_allowed_with_valid_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify POST /mri/analyze succeeds with valid ai_analysis consent"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        # Create valid consent
        consent = ConsentRecord(
            id="consent-test-1",
            clinic_id=clinic.id,
            patient_id=patient.id,
            consent_type="ai_analysis",
            granted_by_user_id=patient.id,
            granted_at=datetime.now(timezone.utc),
            status="active"
        )
        db_session.add(consent)
        db_session.commit()
        
        response = client.post(
            f"/api/v1/mri/analyze",
            json={
                "patient_id": patient.id,
                "file_path": "/uploads/test.nii.gz"
            },
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 200

    def test_qeeg_analysis_blocked_without_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify POST /qeeg/analyze returns 403 when ai_analysis consent missing"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        response = client.post(
            f"/api/v1/qeeg/analyze",
            json={"patient_id": patient.id, "file_path": "/uploads/test.eeg"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 403

    def test_deeptwin_simulation_blocked_without_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify DeepTwin simulation blocked without ai_analysis consent"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        response = client.post(
            f"/api/v1/deeptwin/simulate",
            json={"patient_id": patient.id, "protocol": {}},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 403

    def test_withdrawn_consent_blocks_ai_analysis(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify withdrawn ai_analysis consent blocks AI routes"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        # Create consent that was then withdrawn
        consent = ConsentRecord(
            id="consent-test-2",
            clinic_id=clinic.id,
            patient_id=patient.id,
            consent_type="ai_analysis",
            granted_by_user_id=patient.id,
            granted_at=datetime.now(timezone.utc),
            withdrawn_at=datetime.now(timezone.utc),
            status="withdrawn"
        )
        db_session.add(consent)
        db_session.commit()
        
        response = client.post(
            f"/api/v1/mri/analyze",
            json={"patient_id": patient.id, "file_path": "/uploads/test.nii.gz"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 403

    def test_expired_consent_blocks_ai_analysis(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify expired ai_analysis consent blocks AI routes"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        # Create consent that has expired
        consent = ConsentRecord(
            id="consent-test-3",
            clinic_id=clinic.id,
            patient_id=patient.id,
            consent_type="ai_analysis",
            granted_by_user_id=patient.id,
            granted_at=datetime.now(timezone.utc) - timedelta(days=400),
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            status="expired"
        )
        db_session.add(consent)
        db_session.commit()
        
        response = client.post(
            f"/api/v1/mri/analyze",
            json={"patient_id": patient.id, "file_path": "/uploads/test.nii.gz"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 403


class TestConsentEnforcementDeviceSync:
    """Test device sync routes require device_sync consent"""

    @pytest.fixture
    def setup_clinic_patient_actor(self, db_session: Session):
        """Setup test clinic, patient, and actor"""
        clinic = Clinic(id="clinic-test-2", name="Test Clinic Device")
        db_session.add(clinic)
        db_session.flush()
        
        patient = Patient(id="patient-test-2", clinic_id=clinic.id, mrn="12346")
        db_session.add(patient)
        db_session.flush()
        
        actor = AuthenticatedActor(
            id="actor-test-2",
            user_id="user-test-2",
            clinic_id=clinic.id,
            role="clinician"
        )
        
        db_session.commit()
        return clinic, patient, actor

    def test_device_sync_blocked_without_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify device sync returns 403 when device_sync consent missing"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        response = client.post(
            f"/api/v1/device-sync/ingest",
            json={
                "patient_id": patient.id,
                "device_type": "wearable",
                "device_data": {}
            },
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 403
        assert "consent" in response.json()["error"].lower()

    def test_device_sync_creates_audit_event_on_denied_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify AuditEvent created when device sync blocked by missing consent"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        client.post(
            f"/api/v1/device-sync/ingest",
            json={
                "patient_id": patient.id,
                "device_type": "wearable",
                "device_data": {}
            },
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        audit = db_session.query(AuditEventRecord).filter(
            AuditEventRecord.patient_id == patient.id,
            AuditEventRecord.action == "device_sync_attempted",
            AuditEventRecord.result == "denied_no_consent"
        ).first()
        
        assert audit is not None

    def test_device_sync_allowed_with_valid_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify device sync succeeds with valid device_sync consent"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        # Create valid consent
        consent = ConsentRecord(
            id="consent-test-device-1",
            clinic_id=clinic.id,
            patient_id=patient.id,
            consent_type="device_sync",
            granted_by_user_id=patient.id,
            granted_at=datetime.now(timezone.utc),
            status="active"
        )
        db_session.add(consent)
        db_session.commit()
        
        response = client.post(
            f"/api/v1/device-sync/ingest",
            json={
                "patient_id": patient.id,
                "device_type": "wearable",
                "device_data": {}
            },
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 200


class TestConsentEnforcementDocumentGeneration:
    """Test document/protocol generation routes require document_generation consent"""

    @pytest.fixture
    def setup_clinic_patient_actor(self, db_session: Session):
        """Setup test clinic, patient, and actor"""
        clinic = Clinic(id="clinic-test-3", name="Test Clinic Documents")
        db_session.add(clinic)
        db_session.flush()
        
        patient = Patient(id="patient-test-3", clinic_id=clinic.id, mrn="12347")
        db_session.add(patient)
        db_session.flush()
        
        actor = AuthenticatedActor(
            id="actor-test-3",
            user_id="user-test-3",
            clinic_id=clinic.id,
            role="clinician"
        )
        
        db_session.commit()
        return clinic, patient, actor

    def test_protocol_generation_blocked_without_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify protocol generation returns 403 when document_generation consent missing"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        response = client.post(
            f"/api/v1/protocol/generate",
            json={"patient_id": patient.id, "condition": "migraine"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 403

    def test_protocol_generation_creates_audit_event_on_denied_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify AuditEvent created when protocol generation blocked"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        client.post(
            f"/api/v1/protocol/generate",
            json={"patient_id": patient.id, "condition": "migraine"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        audit = db_session.query(AuditEventRecord).filter(
            AuditEventRecord.patient_id == patient.id,
            AuditEventRecord.action == "document_generation_attempted",
            AuditEventRecord.result == "denied_no_consent"
        ).first()
        
        assert audit is not None

    def test_protocol_generation_allowed_with_valid_consent(
        self, db_session: Session, setup_clinic_patient_actor
    ):
        """Verify protocol generation succeeds with valid document_generation consent"""
        clinic, patient, actor = setup_clinic_patient_actor
        
        # Create valid consent
        consent = ConsentRecord(
            id="consent-test-doc-1",
            clinic_id=clinic.id,
            patient_id=patient.id,
            consent_type="document_generation",
            granted_by_user_id=patient.id,
            granted_at=datetime.now(timezone.utc),
            status="active"
        )
        db_session.add(consent)
        db_session.commit()
        
        response = client.post(
            f"/api/v1/protocol/generate",
            json={"patient_id": patient.id, "condition": "migraine"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        assert response.status_code == 200


class TestConsentEnforcementDemoModeBypass:
    """Test that demo mode correctly bypasses consent, not real patients"""

    def test_demo_patient_can_bypass_consent_check(self, db_session: Session):
        """Verify demo patients use demo consent only, real patients never bypass"""
        # Demo patient should work without explicit consent record
        demo_response = client.post(
            f"/api/v1/mri/analyze",
            json={
                "patient_id": "demo-patient-001",  # Demo patient ID
                "file_path": "/uploads/test.nii.gz"
            },
            headers={"Authorization": "Bearer demo-actor"}
        )
        
        # Should succeed or be demo-specific, not 403
        assert response.status_code != 403

    def test_real_patient_never_silently_bypasses(
        self, db_session: Session
    ):
        """Verify real patient_id never silently bypasses consent"""
        clinic = Clinic(id="clinic-real", name="Real Clinic")
        db_session.add(clinic)
        db_session.flush()
        
        patient = Patient(id="patient-REAL-123", clinic_id=clinic.id, mrn="real-mrn")
        db_session.add(patient)
        db_session.commit()
        
        # Real patient without consent MUST return 403
        response = client.post(
            f"/api/v1/mri/analyze",
            json={
                "patient_id": patient.id,
                "file_path": "/uploads/test.nii.gz"
            },
            headers={"Authorization": "Bearer real-actor"}
        )
        
        assert response.status_code == 403


class TestConsentEnforcementNoModelCallsOnDenial:
    """Test that no AI model/provider calls are made when consent denied"""

    def test_mri_model_not_called_when_consent_missing(
        self, db_session: Session, mocker
    ):
        """Verify MRI AI model is never called when consent missing"""
        clinic = Clinic(id="clinic-mock", name="Mock Clinic")
        db_session.add(clinic)
        db_session.flush()
        
        patient = Patient(id="patient-mock", clinic_id=clinic.id, mrn="mock-mrn")
        db_session.add(patient)
        db_session.flush()
        
        actor = AuthenticatedActor(
            id="actor-mock",
            user_id="user-mock",
            clinic_id=clinic.id,
            role="clinician"
        )
        db_session.commit()
        
        # Mock the AI model call
        mock_model = mocker.patch("app.routers.mri_analysis_router.call_mri_model")
        
        # Try to analyze without consent
        response = client.post(
            f"/api/v1/mri/analyze",
            json={"patient_id": patient.id, "file_path": "/uploads/test.nii.gz"},
            headers={"Authorization": f"Bearer {actor.id}"}
        )
        
        # Should be 403
        assert response.status_code == 403
        
        # Model should NEVER be called
        mock_model.assert_not_called()
