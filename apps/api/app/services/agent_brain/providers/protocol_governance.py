"""ProtocolGovernanceProvider — surfaces governance rules and per-protocol
on-label/off-label, clinician-review, and patient-facing flags.

Wraps `app.services.registries`:
- `list_governance_rules()` for general rules (CSV-backed).
- `list_protocols()` and `get_protocol()` for per-protocol governance flags.
"""
from __future__ import annotations

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


def _flag(value: object) -> bool:
    return str(value or "").strip().lower() in {"true", "yes", "1", "y", "required"}


class ProtocolGovernanceProvider(AgentBrainProvider):
    name = "protocol_governance"
    description = (
        "Governance rules and per-protocol on-label/off-label, "
        "clinician-review, and patient-facing flags drawn from "
        "registries.list_governance_rules and protocols.csv."
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
            from app.services.registries import list_governance_rules
            list_governance_rules()
            return True
        except Exception as exc:  # pragma: no cover
            _log.warning("governance_unconfigured: %s", exc)
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
            from app.services.registries import (
                get_protocol,
                list_governance_rules,
                list_protocols,
            )
        except Exception as exc:
            return safe_fallback(
                provider=self.name,
                query=request.query,
                status="not_configured",
                missing_requirements=[f"registries_unavailable:{type(exc).__name__}"],
            )

        protocol_id = (request.context or {}).get("protocol_id")
        if isinstance(protocol_id, str) and protocol_id:
            proto = get_protocol(protocol_id)
            if proto is None:
                return safe_fallback(
                    provider=self.name,
                    query=request.query,
                    status="ok",
                    answer=f"Protocol '{protocol_id}' was not found in the local registry.",
                    safety_flags=["protocol_not_found"],
                    missing_requirements=["protocol_id_not_in_registry"],
                )
            return self._protocol_response(request.query, proto)

        # Default: return the governance rule book + the per-protocol gating
        # flags for any protocol matching the condition / query.
        rules = list_governance_rules()
        protocols = list_protocols()
        ql = (request.query or "").lower()
        cl = (request.condition or "").lower()

        def _match(p: dict) -> bool:
            if not (ql or cl):
                return False
            blob = " ".join(
                str(p.get(k, "") or "")
                for k in ("name", "condition_id", "modality_id", "target_region", "evidence_summary")
            ).lower()
            if ql and ql in blob:
                return True
            if cl and cl in blob:
                return True
            return False

        matched_protocols = [p for p in protocols if _match(p)][:10] if (ql or cl) else []

        items = [
            {
                "type": "rule",
                **rule,
            }
            for rule in rules
        ] + [
            {
                "type": "protocol_flags",
                "protocol_id": p.get("id"),
                "protocol_name": p.get("name"),
                "on_label_vs_off_label": p.get("on_label_vs_off_label"),
                "clinician_review_required": _flag(p.get("clinician_review_required")),
                "patient_facing_allowed": _flag(p.get("patient_facing_allowed")),
                "contraindication_check_required": _flag(p.get("contraindication_check_required")),
                "evidence_grade": p.get("evidence_grade"),
            }
            for p in matched_protocols
        ]

        any_off_label = any(
            "off-label" in (p.get("on_label_vs_off_label", "") or "").lower()
            for p in matched_protocols
        )
        any_research_only = any(
            "research" in (p.get("on_label_vs_off_label", "") or "").lower()
            for p in matched_protocols
        )

        flags = [
            "requires_clinician_review",
            "no_autonomous_diagnosis",
        ]
        if any_off_label:
            flags.append("off_label_protocol_in_results")
        if any_research_only:
            flags.append("research_only_protocol_in_results")

        return ProviderResponse(
            provider=self.name,
            status="ok",
            query=request.query,
            answer=(
                f"{len(rules)} governance rule(s); "
                f"{len(matched_protocols)} matching protocol(s). "
                "All flagged protocols require clinician review before use."
            ),
            items=items,
            citations=[Citation(source="clinical_data_csv", title="governance_rules.csv")],
            source_metadata={"source": "registries.list_governance_rules"},
            safety_flags=flags,
            requires_clinician_review=True,
            patient_facing_allowed=False,
            confidence="medium",
        )

    @staticmethod
    def _protocol_response(query: str, p: dict) -> ProviderResponse:
        clin_review = _flag(p.get("clinician_review_required"))
        patient_ok = _flag(p.get("patient_facing_allowed"))
        on_label = (p.get("on_label_vs_off_label", "") or "").lower()

        flags = [
            "requires_clinician_review" if clin_review else "clinician_review_recommended",
            "no_autonomous_diagnosis",
        ]
        if "off-label" in on_label:
            flags.append("off_label_protocol")
        if "research" in on_label:
            flags.append("research_only_protocol")

        return ProviderResponse(
            provider="protocol_governance",
            status="ok",
            query=query,
            answer=(
                f"Protocol {p.get('id')} ({p.get('name')}): "
                f"on_label_vs_off_label={p.get('on_label_vs_off_label')}, "
                f"clinician_review_required={clin_review}, "
                f"patient_facing_allowed={patient_ok}."
            ),
            items=[
                {
                    "type": "protocol_flags",
                    "protocol_id": p.get("id"),
                    "protocol_name": p.get("name"),
                    "on_label_vs_off_label": p.get("on_label_vs_off_label"),
                    "clinician_review_required": clin_review,
                    "patient_facing_allowed": patient_ok,
                    "contraindication_check_required": _flag(
                        p.get("contraindication_check_required")
                    ),
                    "evidence_grade": p.get("evidence_grade"),
                }
            ],
            citations=[Citation(source="clinical_data_csv", title="protocols.csv")],
            source_metadata={"source": "registries.get_protocol"},
            safety_flags=flags,
            requires_clinician_review=clin_review or True,
            patient_facing_allowed=False,  # Even when allowed in registry, the
            # agent-brain layer never auto-clears patient-facing copy.
            confidence="medium",
        )
