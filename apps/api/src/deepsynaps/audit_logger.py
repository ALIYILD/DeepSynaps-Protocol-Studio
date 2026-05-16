"""Audit logging for all patient-linked intelligence operations."""

from typing import Optional
from datetime import datetime
import hashlib
import json

from knowledge_layer import KnowledgeLayer


class AuditLogger:
    """Centralized audit logging for compliance and traceability."""

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def log_intelligence_request(
        self,
        endpoint: str,
        patient_id: str,
        clinician_id: str,
        clinic_id: str,
        request_params: Optional[dict] = None,
        response_status: str = "success",
        insight_count: int = 0,
    ) -> str:
        """Log an intelligence request with full provenance."""
        request_hash = ""
        if request_params:
            body = json.dumps(request_params, sort_keys=True, default=str)
            request_hash = hashlib.sha256(body.encode()).hexdigest()[:16]

        action = f"intelligence:{endpoint}:{insight_count}insights"
        self.kl.log_audit(endpoint, clinician_id, clinic_id, patient_id, action, request_hash, response_status)
        return request_hash

    def log_synthesis_request(
        self,
        patient_id: str,
        clinician_id: str,
        clinic_id: str,
        synthesis_id: str,
        modalities_used: list,
        hypothesis_count: int,
    ) -> str:
        """Log a full synthesis request."""
        action = (
            f"synthesis:synthesis_id={synthesis_id}:"
            f"modalities={','.join(modalities_used)}:"
            f"hypotheses={hypothesis_count}"
        )
        self.kl.log_audit(
            "/api/v1/multimodal/patients/{patient_id}/synthesis",
            clinician_id, clinic_id, patient_id, action, "", "completed",
        )
        return synthesis_id
