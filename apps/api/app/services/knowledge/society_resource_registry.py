"""Category 9 neuroscience-society inventory and contextual-resource helpers.

These sources are represented honestly as contextual, educational, and
emerging-signal resources. They are not treated as peer-reviewed evidence
databases and do not expose a live structured search backend in this repo.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from app.services.knowledge.lifecycle import LifecycleState, summarize_lifecycle


DECISION_SUPPORT_DISCLAIMER = (
    "Decision support only. Not diagnostic, not treatment guidance unless a source-backed guideline is explicitly verified. "
    "Society resources are contextual, educational, or emerging-signal sources and must not be treated as primary clinical evidence without source verification."
)


@dataclass(frozen=True)
class SocietyResourceSpec:
    key: str
    display_name: str
    source_url: str
    access_type: str
    source_kind: str
    clinical_utility_summary: str
    limitations: tuple[str, ...]
    warnings: tuple[str, ...]
    condition_tags: tuple[str, ...]
    modality_tags: tuple[str, ...]
    enabled: bool = True
    api_feed_available: bool = False
    structured_search_available: bool = False
    lifecycle_state: str = LifecycleState.CATALOGUED.value
    status: str = LifecycleState.CATALOGUED.value
    source_version_hint: str = "catalogued"


_SPECS: tuple[SocietyResourceSpec, ...] = (
    SocietyResourceSpec(
        key="sfn",
        display_name="Society for Neuroscience",
        source_url="https://www.sfn.org/",
        access_type="free",
        source_kind="conference",
        clinical_utility_summary="Conference abstracts and society resources for emerging neuromodulation techniques and neuroscience education.",
        limitations=(
            "Conference abstracts are emerging signals and may not be peer-reviewed full publications.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Do not treat conference abstracts as definitive clinical evidence.",
            "Use for awareness and follow-up only; verify the original source.",
        ),
        condition_tags=("neuroscience", "neuromodulation", "research"),
        modality_tags=("conference", "abstract", "education"),
        source_version_hint="conference-portal",
    ),
    SocietyResourceSpec(
        key="brain_congress",
        display_name="Brain Congress / IBRO",
        source_url="https://www.ibro.org/",
        access_type="free",
        source_kind="society",
        clinical_utility_summary="International brain-research society resources and congress materials for awareness of emerging neuroscience work.",
        limitations=(
            "Congress materials are contextual and may not be final publications.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Congress materials are contextual resources, not primary evidence.",
        ),
        condition_tags=("neuroscience", "research", "education"),
        modality_tags=("conference", "society", "education"),
        source_version_hint="society-portal",
    ),
    SocietyResourceSpec(
        key="neurology_academy",
        display_name="Neurology Academy",
        source_url="https://www.neurology.org/",
        access_type="free",
        source_kind="education",
        clinical_utility_summary="Educational resources and guideline-awareness material for neurology practice and clinician education.",
        limitations=(
            "Education pages are not automatically clinical guidelines.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Use as educational context; verify whether a page is an actual guideline before citing it as one.",
        ),
        condition_tags=("neurology", "education", "guideline-awareness"),
        modality_tags=("education", "guideline", "resource"),
        source_version_hint="education-portal",
    ),
    SocietyResourceSpec(
        key="epilepsy_foundation",
        display_name="Epilepsy Foundation",
        source_url="https://www.epilepsy.com/",
        access_type="free",
        source_kind="patient_resource",
        clinical_utility_summary="Patient-facing epilepsy resources and clinician education context for seizure-disorder support and awareness.",
        limitations=(
            "Patient resources are not clinical guidelines unless a source explicitly says so.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Do not present patient resources as clinician guidelines.",
        ),
        condition_tags=("epilepsy", "seizure", "patient-resource"),
        modality_tags=("support", "education", "patient-resource"),
        source_version_hint="patient-resource-portal",
    ),
    SocietyResourceSpec(
        key="movement_disorder_society",
        display_name="Movement Disorder Society",
        source_url="https://www.movementdisorders.org/",
        access_type="free",
        source_kind="guideline",
        clinical_utility_summary="Guideline-awareness and society resources for Parkinson's/tremor neuromodulation context and clinician education.",
        limitations=(
            "Guideline pages must be verified against the original source before clinical use.",
            "No structured search API is wired in this repository.",
        ),
        warnings=(
            "Use guideline-awareness links only; do not infer standard of care without source verification.",
        ),
        condition_tags=("parkinson", "tremor", "movement-disorder"),
        modality_tags=("guideline", "education", "society"),
        source_version_hint="guideline-portal",
    ),
)

_SPECS_BY_KEY = {spec.key: spec for spec in _SPECS}


def list_society_resource_keys() -> tuple[str, ...]:
    return tuple(spec.key for spec in _SPECS)


def get_society_resource_spec(key: str) -> SocietyResourceSpec | None:
    return _SPECS_BY_KEY.get(key)


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _source_row(spec: SocietyResourceSpec) -> dict[str, Any]:
    return {
        "id": spec.key,
        "key": spec.key,
        "display_name": spec.display_name,
        "category": "neuroscience_society",
        "source_kind": spec.source_kind,
        "access_type": spec.access_type,
        "source_url": spec.source_url,
        "api_feed_available": spec.api_feed_available,
        "structured_search_available": spec.structured_search_available,
        "enabled": spec.enabled,
        "registered": False,
        "live_exposed": False,
        "lifecycle_state": spec.lifecycle_state,
        "status": spec.status,
        "source_version": spec.source_version_hint,
        "clinical_utility_summary": spec.clinical_utility_summary,
        "limitations": list(spec.limitations),
        "warnings": list(spec.warnings),
        "condition_tags": list(spec.condition_tags),
        "modality_tags": list(spec.modality_tags),
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
        "provenance": {
            "source_registry": "Category 9 neuroscience society inventory",
            "verified_at": _iso_now(),
            "source_version": spec.source_version_hint,
        },
    }


def build_society_resource_inventory() -> dict[str, Any]:
    rows = [_source_row(spec) for spec in _SPECS]
    states = {row["key"]: LifecycleState(row["lifecycle_state"]) for row in rows}
    summary = summarize_lifecycle(states)
    return {
        "total": len(rows),
        "sources": rows,
        "summary": summary,
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }


def summarize_society_lifecycle() -> dict[str, Any]:
    return build_society_resource_inventory()["summary"]


def _matches_filter(spec: SocietyResourceSpec, *, source: str | None, condition: str | None, modality: str | None, resource_type: str | None) -> bool:
    if source and spec.key != source and spec.display_name.lower() != source.strip().lower():
        return False
    if resource_type:
        rt = resource_type.strip().lower()
        if rt and rt not in {"abstract", "guideline", "education", "patient_resource", "news", "other"}:
            return False
        if rt and rt != "other" and rt != spec.source_kind.lower():
            # Resource types are contextual only; the inventory rows are source cards, not live matches.
            return False
    return True


def search_society_resources(
    query: str,
    *,
    condition: str | None = None,
    modality: str | None = None,
    source: str | None = None,
    resource_type: str | None = None,
) -> dict[str, Any]:
    query = (query or "").strip()
    inventory = build_society_resource_inventory()
    filtered_sources = [
        row
        for row in inventory["sources"]
        if _matches_filter(
            _SPECS_BY_KEY[row["key"]],
            source=source,
            condition=condition,
            modality=modality,
            resource_type=resource_type,
        )
    ]
    contextual_resources = [
        {
            "source": row["display_name"],
            "source_id": row["key"],
            "title": f"{row['display_name']} resource link",
            "resource_type": row["source_kind"] if row["source_kind"] in {"guideline", "education", "patient_resource"} else "other",
            "year": None,
            "date": None,
            "condition_tags": row["condition_tags"],
            "modality_tags": row["modality_tags"],
            "url": row["source_url"],
            "summary": row["clinical_utility_summary"],
            "evidence_level": "contextual" if row["source_kind"] != "conference" else "emerging",
            "limitations": row["limitations"],
            "provenance": row["provenance"],
            "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }
        for row in filtered_sources
    ]
    warnings = [
        "Structured search is unavailable for neuroscience society resources in this build.",
        "Conference abstracts and society pages are contextual sources only.",
    ]
    if source or condition or modality or resource_type:
        warnings.append("Filters only narrow source links; they do not yield fabricated abstract or guideline records.")
    return {
        "query": query,
        "condition": condition,
        "modality": modality,
        "source": source,
        "resource_type": resource_type,
        "structured_search_available": False,
        "source_statuses": filtered_sources,
        "matched_resources": [],
        "contextual_resources": contextual_resources,
        "limitations": [
            "No aggressive scraping.",
            "robots.txt and source terms must be respected by any future fetcher.",
            "No fake conference abstracts or guideline summaries are returned here.",
        ],
        "warnings": warnings,
        "provenance": {
            "source_registry": "Category 9 neuroscience society inventory",
            "generated_at": _iso_now(),
            "query": query,
            "structured_search_available": False,
        },
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }


__all__ = [
    "DECISION_SUPPORT_DISCLAIMER",
    "SocietyResourceSpec",
    "build_society_resource_inventory",
    "get_society_resource_spec",
    "list_society_resource_keys",
    "search_society_resources",
    "summarize_society_lifecycle",
]
