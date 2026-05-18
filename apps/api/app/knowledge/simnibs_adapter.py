from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

SimNIBSAdapter = export_service_adapter(
    "app.services.knowledge.adapters.simnibs_adapter",
    "SimNIBSAdapter",
)

__all__ = ["SimNIBSAdapter"]
