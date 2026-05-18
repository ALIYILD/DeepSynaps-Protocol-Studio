from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

PROMISAdapter = export_service_adapter(
    "app.services.knowledge.adapters.promis_adapter",
    "PROMISAdapter",
)

__all__ = ["PROMISAdapter"]
