from __future__ import annotations

from .models import AIModelDescriptor, AIModelHealth
from .providers import AIProviderFactory


class AIHealthChecker:
    def __init__(self, provider_factory: AIProviderFactory | None = None) -> None:
        self._provider_factory = provider_factory or AIProviderFactory()

    def check_model(self, descriptor: AIModelDescriptor) -> AIModelHealth:
        try:
            self._provider_factory.create(descriptor.model_id)
            provider_loaded = True
        except Exception:
            provider_loaded = False
        if descriptor.activation_status.value == "disabled":
            return AIModelHealth(
                status=descriptor.activation_status,
                ready=False,
                provider_loaded=provider_loaded,
                reason="Model is scaffolded and intentionally disabled by default.",
            )
        return AIModelHealth(
            status=descriptor.activation_status,
            ready=provider_loaded,
            provider_loaded=provider_loaded,
            reason="Provider import status checked successfully.",
        )
