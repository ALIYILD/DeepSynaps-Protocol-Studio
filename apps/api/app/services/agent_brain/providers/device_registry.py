"""DeviceRegistryProvider — read-only view of the curated device registry.

Wraps `app.services.registries.list_devices`. **Never invents stimulation
parameters**: missing parameter fields stay `null` and `parameter_data_missing`
appears in `missing_requirements`.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import safe_fallback
from app.services.agent_brain.schemas import Citation, ProviderQuery, ProviderResponse

_log = logging.getLogger(__name__)

# Stimulation/operating parameter fields the agent-brain layer cares about.
# When one of these is missing on a row, it goes into missing_requirements as
# `parameter_data_missing:<field>` so callers know they cannot derive a
# protocol from this row alone.
_PARAMETER_FIELDS = (
    "regulatory_status",
    "regulatory_pathway",
    "official_indication",
    "intended_use_text",
    "contraindications",
    "adverse_event_notes",
)


class DeviceRegistryProvider(AgentBrainProvider):
    name = "device_registry"
    description = (
        "Curated device registry: regulatory status, intended use, "
        "contraindications, adverse-event notes. Stimulation parameter fields "
        "stay null when the registry row does not provide them — never "
        "fabricated."
    )
    allowed_roles = ["technician", "reviewer", "clinician", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = False

    def is_configured(self) -> bool:
        try:
            from app.services.registries import list_devices
            list_devices()
            return True
        except Exception:  # pragma: no cover
            return False

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        try:
            from app.services.registries import list_devices
        except Exception as exc:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=[f"registries_unavailable:{type(exc).__name__}"],
            )

        rows = list_devices()
        device_id = (request.context or {}).get("device_id")
        if device_id:
            rows = [r for r in rows if str(r.get("id")) == str(device_id)]
        else:
            ql = (request.query or "").lower()
            cl = (request.condition or "").lower()
            if ql or cl:
                def _match(r: dict) -> bool:
                    blob = " ".join(
                        str(r.get(k, "") or "")
                        for k in (
                            "name",
                            "manufacturer",
                            "modality",
                            "device_type",
                            "official_indication",
                            "intended_use_text",
                        )
                    ).lower()
                    if ql and ql in blob:
                        return True
                    if cl and cl in blob:
                        return True
                    return False

                rows = [r for r in rows if _match(r)]

        rows = rows[:50]

        items: list[dict] = []
        all_missing: set[str] = set()
        for r in rows:
            normalized = dict(r)
            row_missing: list[str] = []
            for field in _PARAMETER_FIELDS:
                value = normalized.get(field)
                if not value or (isinstance(value, str) and not value.strip()):
                    normalized[field] = None
                    row_missing.append(field)
            normalized["parameter_data_missing"] = row_missing
            for field in row_missing:
                all_missing.add(f"parameter_data_missing:{field}")
            items.append(normalized)

        if not items:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="ok",
                answer="No device matched the query in the local registry.",
                missing_requirements=["no_device_match"],
                confidence="unknown",
            )

        flags = ["requires_clinician_review", "no_autonomous_diagnosis"]
        if any(it["parameter_data_missing"] for it in items):
            flags.append("device_parameter_data_missing")

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=(
                f"{len(items)} device(s) matched. Stimulation/operating "
                "parameters reflect the registry row exactly — missing values "
                "are reported as null and listed in `missing_requirements`."
            ),
            items=items,
            citations=[Citation(source="clinical_data_csv", title="devices.csv")],
            source_metadata={"source": "registries.list_devices"},
            safety_flags=flags,
            missing_requirements=sorted(all_missing),
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="medium",
        )
