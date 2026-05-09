"""BiomarkerProvider — biometric data-source catalog + biometrics evidence bridge probe.

The DeepSynaps biometrics stack splits into two surfaces:

- **Electrophysiological biomarkers** (qEEG bands) live in the
  `qeeg_knowledge` provider. Do not duplicate them here.
- **Wearable / longitudinal biomarkers** (HRV, sleep, activity) are produced
  by `app.services.biometrics_analytics` and the FHIR/wearable adapters under
  `app.services.device_sync`. This provider declares the catalog of supported
  biometric data sources/types and probes the modules' importability.

It does NOT call patient-bound functions. AI surfaces use the catalog to know
what data domains exist; the per-patient analytics path remains the existing
`/api/v1/biometrics/*` router.
"""
from __future__ import annotations

import importlib
import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import safe_fallback
from app.services.agent_brain.schemas import (
    Citation,
    ProviderQuery,
    ProviderResponse,
)

_log = logging.getLogger(__name__)

# The catalog of wearable/longitudinal biometric domains. Names align with
# fields on the Biometric* models in `app.persistence.models`. Update here if
# you add a new domain; provider returns presence/absence honestly.
_BIOMETRIC_DOMAINS: tuple[tuple[str, str], ...] = (
    ("hrv", "Heart rate variability — RMSSD, SDNN, LF/HF."),
    ("sleep", "Sleep stages, total sleep time, efficiency."),
    ("activity", "Step count, active minutes, sedentary time."),
    ("resting_heart_rate", "Daily resting heart rate."),
    ("respiratory_rate", "Mean and overnight respiratory rate."),
    ("skin_temperature", "Skin-temperature deviation from baseline."),
    ("spo2", "Pulse oximetry / blood-oxygen saturation."),
    ("stress_score", "Vendor-derived stress score (provenance varies)."),
)

_PROBE_MODULES: tuple[str, ...] = (
    "app.services.biometrics_analytics",
    "app.services.biometrics_evidence_bridge",
)


class BiomarkerProvider(AgentBrainProvider):
    name = "biomarker"
    description = (
        "Catalog of supported wearable / longitudinal biometric data domains "
        "and probe of the biometrics analytics + evidence-bridge modules. "
        "Read-only; never invents biomarker values."
    )
    allowed_roles = ["clinician", "reviewer", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = False

    def _modules(self) -> dict[str, bool]:
        out: dict[str, bool] = {}
        for mod in _PROBE_MODULES:
            try:
                importlib.import_module(mod)
                out[mod] = True
            except Exception:
                out[mod] = False
        return out

    def is_configured(self) -> bool:
        # We are configured if at least one of the probed modules is importable.
        return any(self._modules().values())

    def health(self) -> dict[str, Any]:
        mods = self._modules()
        return {
            "name": self.name,
            "status": "ok" if any(mods.values()) else "not_configured",
            "modules_present": [m for m, ok in mods.items() if ok],
            "modules_missing": [m for m, ok in mods.items() if not ok],
            "domains_total": len(_BIOMETRIC_DOMAINS),
        }

    def query(
        self,
        request: ProviderQuery,
        *,
        actor_id: str,
        actor_role: str,
        session: Optional[Session] = None,
    ) -> ProviderResponse:
        mods = self._modules()
        if not any(mods.values()):
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=[
                    f"module_not_importable:{m}" for m, ok in mods.items() if not ok
                ],
            )

        ql = (request.query or "").lower()
        domains = [
            {"type": "biomarker_domain", "id": did, "description": desc}
            for did, desc in _BIOMETRIC_DOMAINS
            if (not ql) or ql in did or ql in desc.lower()
        ]

        items: list[dict[str, Any]] = list(domains)
        for mod, ok in mods.items():
            items.append(
                {
                    "type": "biometrics_module_status",
                    "module": mod,
                    "available": ok,
                }
            )

        missing = [f"module_not_importable:{m}" for m, ok in mods.items() if not ok]

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=(
                f"{len(domains)} biomarker domain(s); "
                f"{sum(1 for ok in mods.values() if ok)}/{len(mods)} "
                "biometrics modules importable. Per-patient values are served "
                "by the existing /api/v1/biometrics/* router, not this provider."
            ),
            items=items,
            citations=[
                Citation(
                    source="biometrics_analytics_module",
                    title="DeepSynaps biometrics analytics + evidence bridge",
                )
            ],
            source_metadata={"source": "agent_brain.biomarker catalog"},
            safety_flags=[
                "requires_clinician_review",
                "no_autonomous_diagnosis",
                "decision_support_only",
                *(["partial_module_availability"] if not all(mods.values()) else []),
            ],
            missing_requirements=missing,
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="medium",
        )
