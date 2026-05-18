from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

OpenFDAAdapter = export_service_adapter(
    "app.services.knowledge.adapters.openfda_adapter",
    "OpenFDAAdapter",
)

__all__ = ["OpenFDAAdapter"]
