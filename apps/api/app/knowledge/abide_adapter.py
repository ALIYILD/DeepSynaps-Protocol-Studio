from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

ABIDEAdapter = export_service_adapter(
    "app.services.knowledge.adapters.abide_adapter",
    "ABIDEAdapter",
)

__all__ = ["ABIDEAdapter"]
