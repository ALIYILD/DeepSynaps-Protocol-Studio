"""Category 10 standards and guidelines inventory helpers.

These sources are governance and compliance-awareness references only.
They are not treated as clinical efficacy evidence, legal advice, or
automatic compliance certification.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.knowledge.lifecycle import LifecycleState


DECISION_SUPPORT_DISCLAIMER = (
    "Decision support only. Not legal or regulatory advice, not a compliance certification, and not clinical efficacy evidence. "
    "Clinician and regulatory specialist review is required. Jurisdiction-specific rules may apply."
)


@dataclass(frozen=True)
class StandardsGuidelineSpec:
    key: str
    display_name: str
    source_kind: str
    jurisdiction: str
    access_type: str
    source_url: str
    clinical_utility_summary: str
    compliance_relevance: str
    limitations: tuple[str, ...]
    warnings: tuple[str, ...]
    device_or_modality_tags: tuple[str, ...]
    publication_update_date: str | None
    access_license_notes: str
    enabled: bool = False
    registered: bool = False
    structured_search_available: bool = False
    lifecycle_state: str = LifecycleState.CATALOGUED.value
    status: str = LifecycleState.CATALOGUED.value


STANDARDS_GUIDELINE_SPECS: tuple[StandardsGuidelineSpec, ...] = (
    StandardsGuidelineSpec(
        key="ieee_neuro",
        display_name="IEEE Neuro",
        source_kind="technical_standard",
        jurisdiction="international",
        access_type="free",
        source_url="https://ieee.dataport.org/",
        clinical_utility_summary="Technical standards and neurotechnology reference metadata for device governance awareness.",
        compliance_relevance="Supports device documentation review and technical terminology alignment.",
        limitations=(
            "Copyrighted standards text is not embedded here.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Metadata/link reference only.",
            "Do not infer compliance or approval from presence in the catalog.",
        ),
        device_or_modality_tags=("TMS", "tDCS", "tACS", "neurotechnology", "device-governance"),
        publication_update_date=None,
        access_license_notes="Link and metadata only; source text may be copyright-restricted.",
        lifecycle_state=LifecycleState.CATALOGUED.value,
        status=LifecycleState.CATALOGUED.value,
    ),
    StandardsGuidelineSpec(
        key="neuromod_standards",
        display_name="Neuromod Standards",
        source_kind="clinical_guideline",
        jurisdiction="international",
        access_type="free",
        source_url="https://www.neuromodulation.org/",
        clinical_utility_summary="Practice-guideline awareness and neuromodulation standards references for clinician review.",
        compliance_relevance="Context for protocol documentation and governance review; not a certification.",
        limitations=(
            "Guideline pages vary by source and must be verified before citation.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Practice guidance is not the same as regulatory approval.",
        ),
        device_or_modality_tags=("TMS", "tDCS", "DBS", "neurofeedback", "guideline"),
        publication_update_date=None,
        access_license_notes="Various public guideline links; verify source terms before reuse and copyright/licensing conditions.",
        lifecycle_state=LifecycleState.CATALOGUED.value,
        status=LifecycleState.CATALOGUED.value,
    ),
    StandardsGuidelineSpec(
        key="iso_neuro",
        display_name="ISO Neuro",
        source_kind="technical_standard",
        jurisdiction="international",
        access_type="free",
        source_url="https://www.iso.org/",
        clinical_utility_summary="International standards metadata for medical-device governance awareness.",
        compliance_relevance="Supports device documentation and quality-system review.",
        limitations=(
            "Copyrighted ISO text is not embedded here.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Link metadata only.",
            "Do not present ISO presence as evidence of compliance.",
        ),
        device_or_modality_tags=("medical-device", "quality-system", "device-governance"),
        publication_update_date=None,
        access_license_notes="Metadata/link reference only; ISO text typically requires licensed access and copyright restrictions apply.",
        lifecycle_state=LifecycleState.CATALOGUED.value,
        status=LifecycleState.CATALOGUED.value,
    ),
    StandardsGuidelineSpec(
        key="fda_guidance",
        display_name="FDA Guidance",
        source_kind="regulatory_guidance",
        jurisdiction="us",
        access_type="free",
        source_url="https://www.fda.gov/medical-devices/",
        clinical_utility_summary="Public FDA device guidance references for brain stimulation and medical-device governance review.",
        compliance_relevance="Useful for US device documentation and regulatory review context.",
        limitations=(
            "Guidance does not equal clearance or approval.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Do not infer FDA clearance from guidance references.",
            "Regulatory specialist review remains required.",
        ),
        device_or_modality_tags=("TMS", "tDCS", "medical-device", "US"),
        publication_update_date=None,
        access_license_notes="Public guidance links only; legal or regulatory interpretation is not provided.",
        lifecycle_state=LifecycleState.DEGRADED.value,
        status=LifecycleState.DEGRADED.value,
    ),
    StandardsGuidelineSpec(
        key="eu_mdr",
        display_name="EU MDR",
        source_kind="regulation",
        jurisdiction="eu",
        access_type="free",
        source_url="https://eur-lex.europa.eu/eli/reg/2017/745/oj",
        clinical_utility_summary="EU medical-device regulation reference for clinician and regulatory review.",
        compliance_relevance="Supports EU device-governance documentation and regulatory review context.",
        limitations=(
            "Regulation text is a legal reference, not legal advice.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Do not label a protocol MDR-compliant based on catalog presence alone.",
            "Jurisdiction-specific review is required.",
        ),
        device_or_modality_tags=("medical-device", "EU", "device-governance"),
        publication_update_date=None,
        access_license_notes="Public regulation reference only; legal interpretation is outside scope.",
        lifecycle_state=LifecycleState.DEGRADED.value,
        status=LifecycleState.DEGRADED.value,
    ),
)

_SPECS_BY_KEY: Dict[str, StandardsGuidelineSpec] = {
    spec.key: spec for spec in STANDARDS_GUIDELINE_SPECS
}


def list_standards_guideline_keys() -> List[str]:
    return [spec.key for spec in STANDARDS_GUIDELINE_SPECS]


def get_standards_guideline_spec(key: str) -> Optional[StandardsGuidelineSpec]:
    return _SPECS_BY_KEY.get(key)


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def build_standards_guidelines_inventory() -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    for spec in STANDARDS_GUIDELINE_SPECS:
        row = asdict(spec)
        row["id"] = spec.key
        row["source_id"] = spec.key
        row["source"] = spec.display_name
        row["title"] = spec.display_name
        row["category"] = "standards_guidelines"
        row["url"] = spec.source_url
        row["source_url"] = spec.source_url
        row["decision_support_disclaimer"] = DECISION_SUPPORT_DISCLAIMER
        row["provenance"] = {
            "source_registry": "Category 10 standards and guidelines inventory",
            "source_url": spec.source_url,
            "source_kind": spec.source_kind,
            "jurisdiction": spec.jurisdiction,
            "verified_at": _iso_now(),
            "reference_only": True,
        }
        rows.append(row)

    summary = {
        "total": len(rows),
        "by_state": {member.value: 0 for member in LifecycleState},
        "adapters": {row["id"]: row["lifecycle_state"] for row in rows},
    }
    for row in rows:
        summary["by_state"][row["lifecycle_state"]] = summary["by_state"].get(row["lifecycle_state"], 0) + 1

    return {
        "total": len(rows),
        "sources": rows,
        "summary": summary,
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
        "structured_search_available": False,
        "search_status": "catalogued_only",
    }


def summarize_standards_guideline_lifecycle() -> Dict[str, Any]:
    return build_standards_guidelines_inventory()["summary"]


def _matches_query(spec: StandardsGuidelineSpec, *, query: str, modality: str | None, device_type: str | None, jurisdiction: str | None, source: str | None) -> bool:
    if source:
        src = source.strip().lower()
        if src and src not in {spec.key.lower(), spec.display_name.lower()}:
            return False
    if jurisdiction:
        j = jurisdiction.strip().lower()
        if j and j not in spec.jurisdiction.lower():
            return False
    if modality:
        mod = modality.strip().lower()
        if mod and all(mod not in tag.lower() for tag in spec.device_or_modality_tags):
            return False
    if device_type:
        dev = device_type.strip().lower()
        if dev and all(dev not in tag.lower() for tag in spec.device_or_modality_tags):
            return False
    if query:
        blob = " ".join(
            [
                spec.display_name,
                spec.source_kind,
                spec.jurisdiction,
                spec.clinical_utility_summary,
                spec.compliance_relevance,
                " ".join(spec.device_or_modality_tags),
            ]
        ).lower()
        tokens = [token for token in query.lower().replace("-", " ").split() if token]
        if tokens and not any(token in blob for token in tokens):
            return False
    return True


def _score_match(query: str, spec: StandardsGuidelineSpec) -> tuple[int, List[str]]:
    reasons: List[str] = []
    score = 0
    q = query.lower().strip()
    if not q:
        reasons.append("catalogued reference preview")
        return 10, reasons
    blob = " ".join(
        [
            spec.display_name,
            spec.source_kind,
            spec.jurisdiction,
            spec.clinical_utility_summary,
            spec.compliance_relevance,
            " ".join(spec.device_or_modality_tags),
        ]
    ).lower()
    for token in [t for t in q.replace("-", " ").split() if t]:
        if token in blob:
            score += 10
            reasons.append(f"matched {token}")
    if spec.jurisdiction.lower() in q:
        score += 5
        reasons.append(f"jurisdiction match {spec.jurisdiction}")
    if spec.source_kind.lower() in q:
        score += 5
        reasons.append(f"source kind match {spec.source_kind}")
    return score, reasons or ["catalogued reference preview"]


def search_standards_guidelines_reference_resources(query: Dict[str, Any]) -> Dict[str, Any]:
    raw_query = str(query.get("query") or "").strip()
    modality = query.get("modality")
    device_type = query.get("device_type")
    jurisdiction = query.get("jurisdiction")
    source = query.get("source")
    inventory = build_standards_guidelines_inventory()
    matched: List[Dict[str, Any]] = []
    for spec in STANDARDS_GUIDELINE_SPECS:
        if not _matches_query(
            spec,
            query=raw_query,
            modality=str(modality or "").strip() or None,
            device_type=str(device_type or "").strip() or None,
            jurisdiction=str(jurisdiction or "").strip() or None,
            source=str(source or "").strip() or None,
        ):
            continue
        score, reasons = _score_match(raw_query, spec)
        matched.append(
            {
                "id": spec.key,
                "source": spec.display_name,
                "source_id": spec.key,
                "title": spec.display_name,
                "category": "standards_guidelines",
                "source_kind": spec.source_kind,
                "jurisdiction": spec.jurisdiction,
                "access_type": spec.access_type,
                "device_or_modality_tags": list(spec.device_or_modality_tags),
                "publication_update_date": spec.publication_update_date,
                "url": spec.source_url,
                "source_url": spec.source_url,
                "summary": spec.clinical_utility_summary,
                "clinical_utility_summary": spec.clinical_utility_summary,
                "access_license_notes": spec.access_license_notes,
                "compliance_relevance": spec.compliance_relevance,
                "limitations": list(spec.limitations),
                "warnings": list(spec.warnings),
                "enabled": spec.enabled,
                "registered": spec.registered,
                "structured_search_available": spec.structured_search_available,
                "provenance": {
                    "source_registry": "Category 10 standards and guidelines inventory",
                    "source_url": spec.source_url,
                    "source_kind": spec.source_kind,
                    "jurisdiction": spec.jurisdiction,
                    "reference_only": True,
                },
                "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
                "lifecycle_state": spec.lifecycle_state,
                "status": spec.status,
                "match_score": score,
                "match_reason": "; ".join(reasons),
            }
        )

    matched.sort(key=lambda row: row["match_score"], reverse=True)
    warnings = [
        "Structured search unavailable; returning catalogued references only.",
        "Do not treat standards or guidance metadata as compliance certification.",
    ]
    limitations = [
        "No live structured search or licensed standards text retrieval is wired here.",
        "ISO and IEEE sources are represented as metadata/link references only.",
    ]
    return {
        "query": {
            "query": raw_query,
            "modality": modality,
            "device_type": device_type,
            "jurisdiction": jurisdiction,
            "source": source,
        },
        "search_status": "catalogued_only",
        "structured_search_available": False,
        "partial": bool(raw_query or modality or device_type or jurisdiction or source),
        "decision_support_only": True,
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
        "source_statuses": inventory["sources"],
        "matched_resources": matched,
        "source_count": len(matched),
        "jurisdiction_notes": {
            "us": "FDA guidance is a public regulatory reference, not legal advice or clearance.",
            "eu": "EU MDR is a regulation reference; jurisdiction-specific review is required.",
            "international": "IEEE / ISO / neuromodulation references are governance-awareness metadata only.",
        },
        "warnings": warnings,
        "limitations": limitations,
        "provenance": {
            "source_registry": "Category 10 standards and guidelines inventory",
            "retrieval_method": "catalogued",
            "verified_at": _iso_now(),
            "reference_only": True,
        },
    }


__all__ = [
    "DECISION_SUPPORT_DISCLAIMER",
    "STANDARDS_GUIDELINE_SPECS",
    "StandardsGuidelineSpec",
    "build_standards_guidelines_inventory",
    "get_standards_guideline_spec",
    "list_standards_guideline_keys",
    "search_standards_guidelines_reference_resources",
    "summarize_standards_guideline_lifecycle",
]
