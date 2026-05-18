from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

FAERSAdapter = export_service_adapter(
    "app.services.knowledge.adapters.faers_adapter",
    "FAERSAdapter",
)

__all__ = ["FAERSAdapter"]
