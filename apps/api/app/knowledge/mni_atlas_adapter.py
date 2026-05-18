from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

MNIAtlasAdapter = export_service_adapter(
    "app.services.knowledge.adapters.mni_atlas_adapter",
    "MNIAtlasAdapter",
)

__all__ = ["MNIAtlasAdapter"]
