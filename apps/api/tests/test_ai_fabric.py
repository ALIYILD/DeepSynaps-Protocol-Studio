from __future__ import annotations

from fastapi.testclient import TestClient
import pytest

from app.errors import ApiServiceError
from app.services.ai_fabric import (
    AIGovernance,
    AIHealthChecker,
    AIInferenceRequest,
    AIModelActivationStatus,
    AIModelCapability,
    AIModelTier,
    AIProviderFactory,
    get_registry,
)
from app.services.ai_fabric.evidence.schemas import EvidenceGroundingRequest
from app.services.ai_fabric.evidence.literature_grounding import LiteratureGrounding
from app.services.ai_fabric.qeeg.schemas import EEGInputMetadata
from app.services.ai_fabric.qeeg.validators import validate_eeg_metadata


def _clinician_headers(auth_headers: dict[str, dict[str, str]]) -> dict[str, str]:
    return auth_headers["clinician"]


class TestRegistry:
    def test_registry_contains_11_models(self) -> None:
        assert len(get_registry().list()) == 11

    def test_all_models_disabled_by_default(self) -> None:
        assert all(
            row.activation_status == AIModelActivationStatus.DISABLED
            for row in get_registry().list()
        )

    @pytest.mark.parametrize(
        ("tier", "expected_count"),
        [
            (AIModelTier.CLOUD_LLM, 3),
            (AIModelTier.EDGE_REALTIME, 1),
            (AIModelTier.GPU_MEDICAL, 7),
        ],
    )
    def test_filter_by_tier(self, tier: AIModelTier, expected_count: int) -> None:
        assert len(get_registry().filter(tier=tier)) == expected_count

    def test_filter_by_capability(self) -> None:
        rows = get_registry().filter(capability=AIModelCapability.CITATION_GROUNDING)
        assert {row.model_id for row in rows} == {"me-llama-13b", "medrag"}

    def test_registry_summary_totals(self) -> None:
        summary = get_registry().summary()
        assert summary["total_models"] == 11
        assert summary["disabled_models"] == 11


class TestGovernance:
    def test_missing_consent_rejected(self) -> None:
        descriptor = get_registry().get("eegnet-v1")
        request = AIInferenceRequest(
            model_id="eegnet-v1",
            capability=AIModelCapability.EEG_CLASSIFICATION,
            consent_obtained=False,
        )
        with pytest.raises(ApiServiceError) as excinfo:
            AIGovernance().validate_request(descriptor, request, allow_disabled=True)
        assert excinfo.value.code == "consent_required"

    def test_unsupported_capability_rejected(self) -> None:
        descriptor = get_registry().get("eegnet-v1")
        request = AIInferenceRequest(
            model_id="eegnet-v1",
            capability=AIModelCapability.CITATION_GROUNDING,
            consent_obtained=True,
        )
        with pytest.raises(ApiServiceError) as excinfo:
            AIGovernance().validate_request(descriptor, request, allow_disabled=True)
        assert excinfo.value.code == "unsupported_capability"

    def test_detect_autonomous_language_hits_expected_phrase(self) -> None:
        hits = AIGovernance().detect_autonomous_language(
            "This is an autonomous diagnosis and replaces clinician judgement."
        )
        assert hits

    def test_enforce_safety_boundaries_rewrites_unsafe_summary(self) -> None:
        output, flags = AIGovernance().enforce_safety_boundaries(
            {"summary": "This is a definitive diagnosis."}
        )
        assert flags
        assert "Decision-support only." in output["summary"]


class TestProvidersAndHealth:
    def test_provider_status_rows_cover_every_model(self) -> None:
        rows = AIProviderFactory().list_status()
        assert len(rows) == 11
        assert all("model_id" in row for row in rows)

    @pytest.mark.parametrize(
        "model_id",
        [
            "me-llama-13b",
            "pubmedbert",
            "medrag",
            "eegnet-v1",
            "biot-v1",
            "fastsurfer-v1",
            "simnibs-v4.6",
            "brain-jepa-v1",
            "cbra-mod-v1",
            "brain-harmony-v1",
            "sgacc-connectivity-v1",
        ],
    )
    def test_provider_factory_can_create_stub_provider(self, model_id: str) -> None:
        provider = AIProviderFactory().create(model_id)
        assert provider.provider_name

    def test_health_checker_reports_disabled_model_not_ready(self) -> None:
        descriptor = get_registry().get("medrag")
        health = AIHealthChecker().check_model(descriptor)
        assert health.status == AIModelActivationStatus.DISABLED
        assert health.ready is False


class TestDryRunContracts:
    def test_dry_run_returns_synthetic_response(self) -> None:
        provider = AIProviderFactory().create("eegnet-v1")
        request = AIInferenceRequest(
            model_id="eegnet-v1",
            capability=AIModelCapability.EEG_CLASSIFICATION,
            payload={"sample_rate_hz": 256},
            consent_obtained=True,
        )
        response = provider.dry_run(request)
        assert response.synthetic is True
        assert response.model_id == "eegnet-v1"
        assert response.provenance.audit_sha256

    def test_validate_eeg_metadata_warns_on_low_channel_count(self) -> None:
        result = validate_eeg_metadata(
            EEGInputMetadata(
                sample_rate_hz=128,
                channel_count=4,
                duration_seconds=30.0,
                montage="demo",
            )
        )
        assert result.passed is False
        assert result.warnings

    def test_literature_grounding_returns_stub_citation(self) -> None:
        response = LiteratureGrounding().ground(
            EvidenceGroundingRequest(question="What supports this protocol?")
        )
        assert response.citations[0].source == "synthetic"


class TestRouterIntegration:
    def test_models_endpoint_returns_11_rows(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get("/api/v1/ai-fabric/models", headers=_clinician_headers(auth_headers))
        assert response.status_code == 200
        assert len(response.json()) == 11

    def test_models_endpoint_requires_authz_role(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get("/api/v1/ai-fabric/models", headers=auth_headers["guest"])
        assert response.status_code == 403

    def test_single_model_endpoint(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get(
            "/api/v1/ai-fabric/models/eegnet-v1",
            headers=_clinician_headers(auth_headers),
        )
        assert response.status_code == 200
        assert response.json()["model_id"] == "eegnet-v1"

    def test_single_model_404(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get(
            "/api/v1/ai-fabric/models/unknown-model",
            headers=_clinician_headers(auth_headers),
        )
        assert response.status_code == 404

    def test_capabilities_endpoint(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get(
            "/api/v1/ai-fabric/capabilities",
            headers=_clinician_headers(auth_headers),
        )
        assert response.status_code == 200
        assert len(response.json()) == len(AIModelCapability)

    def test_health_endpoint(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get("/api/v1/ai-fabric/health", headers=_clinician_headers(auth_headers))
        assert response.status_code == 200
        assert len(response.json()) == 11

    def test_single_health_endpoint(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get(
            "/api/v1/ai-fabric/health/medrag",
            headers=_clinician_headers(auth_headers),
        )
        assert response.status_code == 200
        assert response.json()["model_id"] == "medrag"

    def test_tiers_endpoint(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get("/api/v1/ai-fabric/tiers", headers=_clinician_headers(auth_headers))
        assert response.status_code == 200
        assert len(response.json()) == 3

    def test_registry_summary_endpoint(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get(
            "/api/v1/ai-fabric/registry/summary",
            headers=_clinician_headers(auth_headers),
        )
        assert response.status_code == 200
        assert response.json()["total_models"] == 11

    def test_providers_endpoint(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.get(
            "/api/v1/ai-fabric/providers",
            headers=_clinician_headers(auth_headers),
        )
        assert response.status_code == 200
        assert len(response.json()) == 11

    def test_dry_run_endpoint(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.post(
            "/api/v1/ai-fabric/dry-run",
            headers=_clinician_headers(auth_headers),
            json={
                "model_id": "medrag",
                "capability": "citation_grounding",
                "payload": {"question": "What is the evidence?"},
                "consent_obtained": True,
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["synthetic"] is True
        assert body["model_id"] == "medrag"
        assert "safety_copy" in body

    def test_dry_run_requires_consent(
        self,
        client: TestClient,
        auth_headers: dict[str, dict[str, str]],
    ) -> None:
        response = client.post(
            "/api/v1/ai-fabric/dry-run",
            headers=_clinician_headers(auth_headers),
            json={
                "model_id": "medrag",
                "capability": "citation_grounding",
                "payload": {"question": "What is the evidence?"},
                "consent_obtained": False,
            },
        )
        assert response.status_code == 403
