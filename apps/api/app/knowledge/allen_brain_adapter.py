from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

AllenBrainAdapter = export_service_adapter(
    "app.services.knowledge.adapters.allen_brain_adapter",
    "AllenBrainAdapter",
)

__all__ = ["AllenBrainAdapter"]
