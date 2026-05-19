from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

OpenAlexAdapter = export_service_adapter(
    "app.services.knowledge.adapters.openalex_adapter",
    "OpenAlexAdapter",
)

__all__ = ["OpenAlexAdapter"]
