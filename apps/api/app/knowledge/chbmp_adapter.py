from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

CHBMPAdapter = export_service_adapter(
    "app.services.knowledge.adapters.chbmp_adapter",
    "CHBMPAdapter",
)

__all__ = ["CHBMPAdapter"]
