from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

SchaeferAdapter = export_service_adapter(
    "app.services.knowledge.adapters.schaefer_adapter",
    "SchaeferAdapter",
)

__all__ = ["SchaeferAdapter"]
