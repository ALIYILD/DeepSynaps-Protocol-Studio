from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AIModelTier(str, Enum):
    EDGE_REALTIME = "edge_realtime"
    GPU_MEDICAL = "gpu_medical"
    CLOUD_LLM = "cloud_llm"


class AIModelRiskLevel(str, Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    RESEARCH = "research"


class AIModelRuntime(str, Enum):
    PYTHON = "python"
    PYTORCH = "pytorch"
    ONNX = "onnx"
    DOCKER = "docker"
    TRANSFORMERS = "transformers"


class AIModelActivationStatus(str, Enum):
    DISABLED = "disabled"
    CONFIGURED = "configured"
    ACTIVE = "active"
    DEGRADED = "degraded"


class AIModelCapability(str, Enum):
    NARRATIVE_SYNTHESIS = "narrative_synthesis"
    CITATION_GROUNDING = "citation_grounding"
    EEG_CLASSIFICATION = "eeg_classification"
    EEG_QUALITY_CONTROL = "eeg_quality_control"
    EEG_FEATURE_EXTRACTION = "eeg_feature_extraction"
    MRI_SEGMENTATION = "mri_segmentation"
    EFIELD_SIMULATION = "efield_simulation"
    FMRI_EMBEDDING = "fmri_embedding"
    MULTIMODAL_FUSION = "multimodal_fusion"
    ENTITY_EXTRACTION = "entity_extraction"


class AIModelLicense(BaseModel):
    name: str
    spdx_id: str
    commercial_use_allowed: bool = False
    source_url: str | None = None


class AIModelHealth(BaseModel):
    status: AIModelActivationStatus = AIModelActivationStatus.DISABLED
    ready: bool = False
    provider_loaded: bool = False
    reason: str = "Model is scaffolded and disabled by default."
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AIModelDescriptor(BaseModel):
    model_id: str
    name: str
    summary: str
    modality: str
    tier: AIModelTier
    runtime: AIModelRuntime
    risk_level: AIModelRiskLevel
    activation_status: AIModelActivationStatus = AIModelActivationStatus.DISABLED
    capabilities: list[AIModelCapability]
    health: AIModelHealth = Field(default_factory=AIModelHealth)
    license: AIModelLicense
    provider_key: str
    vendor: str | None = None
    parameters_millions: float | None = None
    latency_ms: float | None = None
    citations_supported: bool = False
    decision_support_only: bool = True
    clinician_review_required: bool = True
    no_diagnosis: bool = True
    default_enabled: bool = False
    requires_explicit_consent: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIInferenceRequest(BaseModel):
    model_id: str
    capability: AIModelCapability
    payload: dict[str, Any] = Field(default_factory=dict)
    consent_obtained: bool = False
    actor_role: str = "clinician"
    patient_context: dict[str, Any] = Field(default_factory=dict)
    dry_run: bool = True


class AIProvenanceRecord(BaseModel):
    request_id: str
    model_id: str
    synthetic: bool
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    audit_sha256: str
    safety_flags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIInferenceResponse(BaseModel):
    request_id: str
    model_id: str
    synthetic: bool
    output: dict[str, Any]
    safety_copy: str
    warnings: list[str] = Field(default_factory=list)
    provenance: AIProvenanceRecord
