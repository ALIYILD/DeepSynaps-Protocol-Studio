from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .protocols import Protocol


@dataclass(frozen=True)
class ContraindicationHit:
    protocol_id: str
    reason: str


def _truthy(meta: dict[str, Any], *keys: str) -> bool:
    for k in keys:
        v = meta.get(k)
        if isinstance(v, bool):
            return v
        if isinstance(v, str) and v.strip().lower() in ("1", "true", "yes", "y", "on"):
            return True
        if isinstance(v, (int, float)) and v != 0:
            return True
    return False


def filter_contraindicated(
    protocols: list[Protocol],
    patient_meta: dict[str, Any] | None,
) -> tuple[list[Protocol], list[ContraindicationHit]]:
    """Hard filter protocol candidates based on patient metadata.

    This is intentionally conservative and auditable: every filtered protocol
    returns a human-readable reason string.
    """
    meta = patient_meta or {}
    hits: list[ContraindicationHit] = []
    kept: list[Protocol] = []

    has_seizure_history = _truthy(meta, "seizure_history", "epilepsy", "uncontrolled_seizures")
    has_implant = _truthy(meta, "cranial_implant", "metallic_implant_head", "ferromagnetic_implant")
    pregnant = _truthy(meta, "pregnant", "pregnancy")
    active_psychosis = _truthy(meta, "active_psychosis")

    for p in protocols:
        text = " ".join(
            t
            for t in (
                p.protocol_name,
                p.notes,
                p.adverse_event_monitoring,
                p.contraindication_check_required,
            )
            if t
        ).lower()

        # Heuristic modality inference from protocol name (catalog is CSV and
        # modality IDs are not self-describing inside qeeg-pipeline).
        name_l = (p.protocol_name or "").lower()
        is_tms_like = ("rtms" in name_l) or ("tbs" in name_l) or ("tms" in name_l)
        is_tdcs_like = ("tdcs" in name_l) or ("tacs" in name_l) or ("trns" in name_l)

        blocked_reason: str | None = None
        if has_seizure_history and is_tms_like:
            blocked_reason = "Seizure history: avoid TMS/iTBS family modalities without specialist review."
        elif has_implant and is_tms_like:
            blocked_reason = "Cranial/ferromagnetic implant risk near coil: TMS-type protocol contraindicated."
        elif pregnant and ("pregnan" in text) and is_tms_like:
            blocked_reason = "Pregnancy noted as relative contraindication in protocol notes."
        elif active_psychosis and ("psychosis" in text):
            blocked_reason = "Active psychosis: protocol notes indicate contraindication."
        elif has_implant and is_tdcs_like and ("implant" in text or "metal" in text):
            blocked_reason = "Implant/metal risk: stimulation protocol notes indicate contraindication."

        if blocked_reason:
            hits.append(ContraindicationHit(protocol_id=p.protocol_id, reason=blocked_reason))
        else:
            kept.append(p)

    return kept, hits

