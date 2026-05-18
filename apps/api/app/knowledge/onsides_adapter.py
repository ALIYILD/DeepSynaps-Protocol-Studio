from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

OnSIDESAdapter = export_service_adapter(
    "app.services.knowledge.adapters.onsides_adapter",
    "OnSIDESAdapter",
)

__all__ = ["OnSIDESAdapter"]
