from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .models import (
    AIInferenceRequest,
    AIInferenceResponse,
    AIProvenanceRecord,
)
from .provenance import ProvenanceTracker

DEFAULT_SAFETY_COPY = (
    "Decision-support preview only. Outputs are synthetic scaffold responses "
    "for clinician review and are not diagnostic conclusions."
)


class InferenceContract:
    provider_name = "unknown"

    def __init__(self) -> None:
        self._provenance = ProvenanceTracker()

    def infer(self, request: AIInferenceRequest) -> AIInferenceResponse:
        raise RuntimeError(
            f"{self.provider_name} is not configured for live inference in this environment."
        )

    def dry_run(self, request: AIInferenceRequest) -> AIInferenceResponse:
        request_id = str(uuid4())
        payload = {
            "request_id": request_id,
            "provider_name": self.provider_name,
            "model_id": request.model_id,
            "capability": request.capability.value,
            "synthetic": True,
            "payload_keys": sorted(request.payload.keys()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        provenance = AIProvenanceRecord(
            request_id=request_id,
            model_id=request.model_id,
            synthetic=True,
            audit_sha256=self._provenance.build_audit_hash(payload),
            safety_flags=["synthetic_output", "decision_support_only", "clinician_review_required"],
            metadata={"provider_name": self.provider_name},
        )
        return AIInferenceResponse(
            request_id=request_id,
            model_id=request.model_id,
            synthetic=True,
            output=self._build_synthetic_output(request),
            safety_copy=DEFAULT_SAFETY_COPY,
            warnings=[
                "Synthetic dry-run output only.",
                "No patient-specific inference was executed.",
            ],
            provenance=provenance,
        )

    def _build_synthetic_output(self, request: AIInferenceRequest) -> dict[str, Any]:
        return {
            "summary": f"{self.provider_name} scaffold dry-run completed.",
            "requested_capability": request.capability.value,
            "payload_echo_keys": sorted(request.payload.keys()),
            "limitations": [
                "Provider is scaffolded and disabled by default.",
                "Install runtime dependencies and configure governance before activation.",
            ],
        }
