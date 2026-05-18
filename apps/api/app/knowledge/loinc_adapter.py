from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

LOINCAdapter = export_service_adapter(
    "app.services.knowledge.adapters.loinc_adapter",
    "LOINCAdapter",
)

__all__ = ["LOINCAdapter"]
