from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

NeurosynthAdapter = export_service_adapter(
    "app.services.knowledge.adapters.neurosynth_adapter",
    "NeurosynthAdapter",
)

__all__ = ["NeurosynthAdapter"]
