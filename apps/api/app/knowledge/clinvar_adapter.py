from __future__ import annotations

from app.knowledge._service_adapter_shim import export_service_adapter

ClinVarAdapter = export_service_adapter(
    "app.services.knowledge.adapters.clinvar_adapter",
    "ClinVarAdapter",
)

__all__ = ["ClinVarAdapter"]
