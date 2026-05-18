from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

PharmGKBAdapter = export_service_adapter(
    "app.services.knowledge.adapters.pharmgkb_adapter",
    "PharmGKBAdapter",
)

__all__ = ["PharmGKBAdapter"]
