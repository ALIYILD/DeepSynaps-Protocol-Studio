from __future__ import annotations

from collections import Counter

from .models import (
    AIModelActivationStatus,
    AIModelCapability,
    AIModelDescriptor,
    AIModelLicense,
    AIModelRiskLevel,
    AIModelRuntime,
    AIModelTier,
)


class AIModelRegistry:
    def __init__(self) -> None:
        self._models: dict[str, AIModelDescriptor] = {}

    def register(self, descriptor: AIModelDescriptor) -> None:
        self._models[descriptor.model_id] = descriptor

    def get(self, model_id: str) -> AIModelDescriptor:
        return self._models[model_id]

    def list(self) -> list[AIModelDescriptor]:
        return list(self._models.values())

    def filter(
        self,
        *,
        tier: AIModelTier | None = None,
        modality: str | None = None,
        capability: AIModelCapability | None = None,
    ) -> list[AIModelDescriptor]:
        rows = self.list()
        if tier is not None:
            rows = [row for row in rows if row.tier == tier]
        if modality is not None:
            rows = [row for row in rows if row.modality == modality]
        if capability is not None:
            rows = [row for row in rows if capability in row.capabilities]
        return rows

    def summary(self) -> dict[str, object]:
        rows = self.list()
        by_tier = Counter(row.tier.value for row in rows)
        by_modality = Counter(row.modality for row in rows)
        disabled = sum(1 for row in rows if row.activation_status == AIModelActivationStatus.DISABLED)
        capability_counter = Counter(
            capability.value for row in rows for capability in row.capabilities
        )
        return {
            "total_models": len(rows),
            "disabled_models": disabled,
            "tiers": dict(by_tier),
            "modalities": dict(by_modality),
            "capabilities": dict(capability_counter),
        }


def _license(name: str, spdx_id: str, *, commercial: bool, source_url: str | None = None) -> AIModelLicense:
    return AIModelLicense(
        name=name,
        spdx_id=spdx_id,
        commercial_use_allowed=commercial,
        source_url=source_url,
    )


def _seed_registry() -> AIModelRegistry:
    registry = AIModelRegistry()
    descriptors = [
        AIModelDescriptor(
            model_id="me-llama-13b",
            name="Me-LLaMA-13B",
            summary="Clinical narrative drafting scaffold for literature-grounded synthesis.",
            modality="text",
            tier=AIModelTier.CLOUD_LLM,
            runtime=AIModelRuntime.TRANSFORMERS,
            risk_level=AIModelRiskLevel.HIGH,
            capabilities=[
                AIModelCapability.NARRATIVE_SYNTHESIS,
                AIModelCapability.CITATION_GROUNDING,
            ],
            license=_license("Meta license", "LicenseRef-Meta-Llama", commercial=False),
            provider_key="me-llama-13b",
            vendor="Meta",
            parameters_millions=13000,
            citations_supported=True,
        ),
        AIModelDescriptor(
            model_id="pubmedbert",
            name="PubMedBERT",
            summary="Clinical entity extraction scaffold for evidence enrichment.",
            modality="text",
            tier=AIModelTier.CLOUD_LLM,
            runtime=AIModelRuntime.TRANSFORMERS,
            risk_level=AIModelRiskLevel.MODERATE,
            capabilities=[AIModelCapability.ENTITY_EXTRACTION],
            license=_license("Apache License 2.0", "Apache-2.0", commercial=True),
            provider_key="pubmedbert",
            vendor="Microsoft",
            parameters_millions=110,
        ),
        AIModelDescriptor(
            model_id="medrag",
            name="MedRAG",
            summary="Evidence synthesis scaffold with citation-grounded retrieval patterns.",
            modality="text",
            tier=AIModelTier.CLOUD_LLM,
            runtime=AIModelRuntime.PYTHON,
            risk_level=AIModelRiskLevel.HIGH,
            capabilities=[
                AIModelCapability.CITATION_GROUNDING,
                AIModelCapability.NARRATIVE_SYNTHESIS,
            ],
            license=_license("Research use", "LicenseRef-Research", commercial=False),
            provider_key="medrag",
            citations_supported=True,
        ),
        AIModelDescriptor(
            model_id="eegnet-v1",
            name="EEGNet",
            summary="Low-latency EEG classification scaffold for edge workflows.",
            modality="EEG",
            tier=AIModelTier.EDGE_REALTIME,
            runtime=AIModelRuntime.ONNX,
            risk_level=AIModelRiskLevel.MODERATE,
            capabilities=[AIModelCapability.EEG_CLASSIFICATION],
            license=_license("Apache License 2.0", "Apache-2.0", commercial=True),
            provider_key="eegnet-v1",
            latency_ms=1.0,
        ),
        AIModelDescriptor(
            model_id="biot-v1",
            name="BIOT",
            summary="Transformer EEG representation scaffold for richer biomarker extraction.",
            modality="EEG",
            tier=AIModelTier.GPU_MEDICAL,
            runtime=AIModelRuntime.PYTORCH,
            risk_level=AIModelRiskLevel.HIGH,
            capabilities=[
                AIModelCapability.EEG_CLASSIFICATION,
                AIModelCapability.EEG_FEATURE_EXTRACTION,
            ],
            license=_license("Research use", "LicenseRef-Research", commercial=False),
            provider_key="biot-v1",
            parameters_millions=3.3,
        ),
        AIModelDescriptor(
            model_id="fastsurfer-v1",
            name="FastSurfer",
            summary="MRI segmentation scaffold with GPU-first deployment expectations.",
            modality="MRI",
            tier=AIModelTier.GPU_MEDICAL,
            runtime=AIModelRuntime.DOCKER,
            risk_level=AIModelRiskLevel.HIGH,
            capabilities=[AIModelCapability.MRI_SEGMENTATION],
            license=_license("Apache License 2.0", "Apache-2.0", commercial=True),
            provider_key="fastsurfer-v1",
        ),
        AIModelDescriptor(
            model_id="simnibs-v4.6",
            name="SimNIBS 4.6",
            summary="Electric-field simulation scaffold for target planning workflows.",
            modality="MRI",
            tier=AIModelTier.GPU_MEDICAL,
            runtime=AIModelRuntime.DOCKER,
            risk_level=AIModelRiskLevel.HIGH,
            capabilities=[AIModelCapability.EFIELD_SIMULATION],
            license=_license("GNU General Public License v3.0", "GPL-3.0", commercial=False),
            provider_key="simnibs-v4.6",
        ),
        AIModelDescriptor(
            model_id="brain-jepa-v1",
            name="Brain-JEPA",
            summary="fMRI embedding scaffold for research-grade representation learning.",
            modality="fMRI",
            tier=AIModelTier.GPU_MEDICAL,
            runtime=AIModelRuntime.PYTORCH,
            risk_level=AIModelRiskLevel.RESEARCH,
            capabilities=[AIModelCapability.FMRI_EMBEDDING],
            license=_license("Research use", "LicenseRef-Research", commercial=False),
            provider_key="brain-jepa-v1",
        ),
        AIModelDescriptor(
            model_id="cbra-mod-v1",
            name="CBraMod",
            summary="Cross-band EEG modelling scaffold for protocol enrichment.",
            modality="EEG",
            tier=AIModelTier.GPU_MEDICAL,
            runtime=AIModelRuntime.PYTORCH,
            risk_level=AIModelRiskLevel.RESEARCH,
            capabilities=[
                AIModelCapability.EEG_FEATURE_EXTRACTION,
                AIModelCapability.EEG_QUALITY_CONTROL,
            ],
            license=_license("Research use", "LicenseRef-Research", commercial=False),
            provider_key="cbra-mod-v1",
        ),
        AIModelDescriptor(
            model_id="brain-harmony-v1",
            name="BrainHarmony",
            summary="Multimodal scaffold for harmonising EEG and imaging features.",
            modality="Multimodal",
            tier=AIModelTier.GPU_MEDICAL,
            runtime=AIModelRuntime.PYTORCH,
            risk_level=AIModelRiskLevel.RESEARCH,
            capabilities=[AIModelCapability.MULTIMODAL_FUSION],
            license=_license("Research use", "LicenseRef-Research", commercial=False),
            provider_key="brain-harmony-v1",
        ),
        AIModelDescriptor(
            model_id="sgacc-connectivity-v1",
            name="sgACC Connectivity",
            summary="Connectivity biomarker scaffold for research-only target stratification.",
            modality="fMRI",
            tier=AIModelTier.GPU_MEDICAL,
            runtime=AIModelRuntime.PYTORCH,
            risk_level=AIModelRiskLevel.RESEARCH,
            capabilities=[AIModelCapability.FMRI_EMBEDDING],
            license=_license("Research use", "LicenseRef-Research", commercial=False),
            provider_key="sgacc-connectivity-v1",
        ),
    ]
    for descriptor in descriptors:
        registry.register(descriptor)
    return registry


_REGISTRY = _seed_registry()


def get_registry() -> AIModelRegistry:
    return _REGISTRY
