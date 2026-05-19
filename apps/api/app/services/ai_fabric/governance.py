from __future__ import annotations

import re
from typing import Any

from app.errors import ApiServiceError

from .models import AIInferenceRequest, AIModelDescriptor
from .provenance import ProvenanceTracker

AUTONOMOUS_LANGUAGE_PATTERNS = (
    re.compile(r"\bautonomous diagnosis\b", re.IGNORECASE),
    re.compile(r"\bautonomous treatment\b", re.IGNORECASE),
    re.compile(r"\bdefinitive diagnosis\b", re.IGNORECASE),
    re.compile(r"\bguaranteed response\b", re.IGNORECASE),
    re.compile(r"\breplace[s]? clinician judgement\b", re.IGNORECASE),
)

SAFE_OUTPUT_COPY = (
    "Decision-support only. Findings must be reviewed by a licensed clinician "
    "and must not be used as an autonomous diagnosis or treatment directive."
)


class AIGovernance:
    def __init__(self) -> None:
        self._provenance = ProvenanceTracker()

    def validate_request(
        self,
        descriptor: AIModelDescriptor,
        request: AIInferenceRequest,
        *,
        allow_disabled: bool = False,
    ) -> None:
        if request.capability not in descriptor.capabilities:
            raise ApiServiceError(
                code="unsupported_capability",
                message=(
                    f"Model '{descriptor.model_id}' does not support "
                    f"capability '{request.capability.value}'."
                ),
                status_code=422,
            )
        if descriptor.requires_explicit_consent and not request.consent_obtained:
            raise ApiServiceError(
                code="consent_required",
                message="Explicit consent is required before using AI Fabric surfaces.",
                warnings=["Capture and record clinical consent before continuing."],
                status_code=403,
            )
        if not allow_disabled and descriptor.activation_status.value == "disabled":
            raise ApiServiceError(
                code="model_disabled",
                message=f"Model '{descriptor.model_id}' is disabled in this environment.",
                warnings=["Use the dry-run endpoint or configure the model before activation."],
                status_code=409,
            )

    def detect_autonomous_language(self, text: str) -> list[str]:
        hits: list[str] = []
        for pattern in AUTONOMOUS_LANGUAGE_PATTERNS:
            if pattern.search(text):
                hits.append(pattern.pattern)
        return hits

    def enforce_safety_boundaries(self, output: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
        flagged: list[str] = []
        for value in self._walk_strings(output):
            flagged.extend(self.detect_autonomous_language(value))
        if not flagged:
            return output, flagged
        safe_output = dict(output)
        safe_output["summary"] = SAFE_OUTPUT_COPY
        safe_output["safety_intervention"] = "autonomous_language_removed"
        return safe_output, sorted(set(flagged))

    def build_audit_envelope(
        self,
        descriptor: AIModelDescriptor,
        request: AIInferenceRequest,
        *,
        synthetic: bool,
    ) -> dict[str, Any]:
        return {
            "model_id": descriptor.model_id,
            "capability": request.capability.value,
            "synthetic": synthetic,
            "decision_support_only": descriptor.decision_support_only,
            "clinician_review_required": descriptor.clinician_review_required,
            "payload_keys": sorted(request.payload.keys()),
            "patient_context_keys": sorted(request.patient_context.keys()),
        }

    def build_audit_hash(
        self,
        descriptor: AIModelDescriptor,
        request: AIInferenceRequest,
        *,
        synthetic: bool,
    ) -> str:
        return self._provenance.build_audit_hash(
            self.build_audit_envelope(descriptor, request, synthetic=synthetic)
        )

    def _walk_strings(self, value: Any) -> list[str]:
        if isinstance(value, str):
            return [value]
        if isinstance(value, dict):
            strings: list[str] = []
            for item in value.values():
                strings.extend(self._walk_strings(item))
            return strings
        if isinstance(value, list):
            strings: list[str] = []
            for item in value:
                strings.extend(self._walk_strings(item))
            return strings
        return []
