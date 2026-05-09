"""QEEGKnowledgeProvider — read-only qEEG reference data.

Wraps two existing curated CSV-backed services:
- `app.services.qeeg.list_qeeg_biomarkers` — qEEG band biomarker definitions
  (Hz range, normal state, key regions, EEG positions, pathological markers,
  associated disorders, clinical significance).
- `app.services.qeeg.list_qeeg_condition_map` — condition → qEEG pattern map.

Source: `data/imports/clinical-database/qeeg_biomarkers.csv` and
`qeeg_condition_map.csv` (≈17 bands, ≈30 conditions). Reference content only;
no patient data, no fabrication.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.services.agent_brain.providers.base import AgentBrainProvider
from app.services.agent_brain.safety import (
    QEEG_MRI_VIDEO_AUDIO_FALLBACK,
    safe_fallback,
)
from app.services.agent_brain.schemas import (
    Citation,
    ProviderQuery,
    ProviderResponse,
)

_log = logging.getLogger(__name__)


class QEEGKnowledgeProvider(AgentBrainProvider):
    name = "qeeg_knowledge"
    description = (
        "Curated qEEG reference: band biomarker definitions and condition "
        "→ qEEG pattern mappings. Read-only; no patient data, no fabrication."
    )
    allowed_roles = ["clinician", "reviewer", "technician", "admin", "supervisor"]
    contains_phi = False
    can_read = True
    can_write = False
    requires_audit = False
    requires_citations = False
    patient_facing_allowed_default = False

    def is_configured(self) -> bool:
        try:
            from app.services.qeeg import list_qeeg_biomarkers
            list_qeeg_biomarkers()
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
            from app.services.qeeg import (
                list_qeeg_biomarkers,
                list_qeeg_condition_map,
            )
        except Exception as exc:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=[f"qeeg_service_unavailable:{type(exc).__name__}"],
            )

        biomarkers = list_qeeg_biomarkers()
        condition_map = list_qeeg_condition_map()

        ql = (request.query or "").lower()
        cl = (request.condition or "").lower()

        bm_items = [
            b.model_dump() if hasattr(b, "model_dump") else dict(b)
            for b in (biomarkers.items if hasattr(biomarkers, "items") else [])
        ]
        cm_items = [
            c.model_dump() if hasattr(c, "model_dump") else dict(c)
            for c in (condition_map.items if hasattr(condition_map, "items") else [])
        ]

        if ql or cl:
            def _b_match(b: dict) -> bool:
                blob = " ".join(
                    str(b.get(k, "") or "")
                    for k in ("band_name", "associated_disorders", "clinical_significance")
                ).lower()
                return (ql and ql in blob) or (cl and cl in blob)

            def _c_match(c: dict) -> bool:
                blob = " ".join(
                    str(c.get(k, "") or "")
                    for k in ("condition_name", "qeeg_patterns", "key_qeeg_electrode_sites")
                ).lower()
                return (ql and ql in blob) or (cl and cl in blob)

            bm_items = [b for b in bm_items if _b_match(b)]
            cm_items = [c for c in cm_items if _c_match(c)]

        items = (
            [{"type": "qeeg_biomarker", **b} for b in bm_items]
            + [{"type": "qeeg_condition_pattern", **c} for c in cm_items]
        )

        if not items:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="ok",
                answer=(
                    "No matching qEEG band or condition-pattern in the curated "
                    "registry. " + QEEG_MRI_VIDEO_AUDIO_FALLBACK
                ),
                missing_requirements=["no_qeeg_match"],
                confidence="unknown",
            )

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=(
                f"{len(bm_items)} qEEG band(s) and {len(cm_items)} condition "
                "→ qEEG pattern(s) returned. "
                + QEEG_MRI_VIDEO_AUDIO_FALLBACK
            ),
            items=items,
            citations=[
                Citation(source="clinical_data_csv", title="qeeg_biomarkers.csv"),
                Citation(source="clinical_data_csv", title="qeeg_condition_map.csv"),
            ],
            source_metadata={"source": "qeeg.list_qeeg_biomarkers + list_qeeg_condition_map"},
            safety_flags=[
                "requires_clinician_review",
                "no_autonomous_diagnosis",
                "decision_support_only",
            ],
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="high",
        )
