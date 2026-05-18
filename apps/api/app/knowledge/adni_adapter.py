from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

ADNIAdapter = export_service_adapter(
    "app.services.knowledge.adapters.adni_adapter",
    "ADNIAdapter",
)

__all__ = ["ADNIAdapter"]
