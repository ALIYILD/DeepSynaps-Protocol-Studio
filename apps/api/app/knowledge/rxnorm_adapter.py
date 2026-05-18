from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

RxNormAdapter = export_service_adapter(
    "app.services.knowledge.adapters.rxnorm_adapter",
    "RxNormAdapter",
)

__all__ = ["RxNormAdapter"]
