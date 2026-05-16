"""Access control enforcing clinic isolation, patient access, and role-based permissions."""

from typing import Dict, Any, Optional
from datetime import datetime
import hashlib

from knowledge_layer import KnowledgeLayer


class AccessControl:
    """RBAC with clinic isolation and patient-level access control."""

    REQUIRED_ROLE = "clinician"

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def authenticate_request(
        self,
        patient_id: str,
        clinician_id: str,
        clinic_id: str,
        role: str,
        ai_synthesis: bool = False,
    ) -> Dict[str, Any]:
        """Authenticate and authorize a request."""
        result = {
            "authorized": False,
            "clinic_id": clinic_id,
            "patient_id": patient_id,
            "clinician_id": clinician_id,
            "ai_synthesis_allowed": False,
            "errors": [],
        }

        # Role check
        if role != self.REQUIRED_ROLE:
            result["errors"].append(f"Role '{role}' not authorized. Required: '{self.REQUIRED_ROLE}'")
            return result

        # Clinic isolation + patient access
        access = self.kl.check_patient_access(patient_id, clinic_id, clinician_id)
        if not access["has_access"]:
            result["errors"].append("Clinician does not have access to this patient in this clinic")
            return result

        # AI synthesis consent check
        if ai_synthesis and not access["ai_analysis_consent"]:
            result["errors"].append("Patient has not consented to AI analysis")
            return result

        result["authorized"] = True
        result["ai_synthesis_allowed"] = access["ai_analysis_consent"]
        result["access_level"] = access["access_level"]
        return result

    def log_access(
        self,
        endpoint: str,
        clinician_id: str,
        clinic_id: str,
        patient_id: str,
        action: str,
        request_body: Optional[str] = None,
        status: str = "success",
    ) -> str:
        """Log access to audit trail."""
        request_hash = ""
        if request_body:
            request_hash = hashlib.sha256(request_body.encode()).hexdigest()[:16]

        self.kl.log_audit(endpoint, clinician_id, clinic_id, patient_id, action, request_hash, status)
        return request_hash
