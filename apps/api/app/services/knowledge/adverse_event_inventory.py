"""Category 6 adverse-event inventory and medication safety helpers.

This module keeps Category 6 represented explicitly and honestly:

- FAERS and MedDRA are implemented runtime-backed sources.
- VigiBase and WHO-ADR are represented but disabled/restricted unless
  licensed access exists.
- ICH E2B and CTCAE are represented as standards/references, not live APIs.

The medication safety helper returns source-backed partial results with
provenance, limitations, and decision-support caveats. It does not infer
causality, incidence, or clinical clearance.
"""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from app.services.knowledge.lifecycle import LifecycleState


ADVERSE_EVENT_DECISION_SUPPORT_DISCLAIMER = (
    "Decision support only. Not a diagnosis. Not a prescription. Not clinical "
    "clearance for neuromodulation. Spontaneous reports do not prove causality, "
    "and absence of reports does not prove absence of risk. Clinician review of "
    "medication, device, and patient context is required."
)

FAERS_LIMITATION = (
    "FAERS is a spontaneous reporting database. Report counts are source-backed "
    "signals only and must not be interpreted as incidence rates, causal proof, "
    "or autonomous clearance."
)

_SEIZURE_THRESHOLD_TERMS = (
    "seizure",
    "convulsion",
    "loss of consciousness",
    "syncope",
    "serotonin syndrome",
)
_SEIZURE_THRESHOLD_MEDICATIONS = ("bupropion", "tramadol")
_NEUROMODULATION_MODALITIES = {"tms", "tdcs", "dbs", "vns", "neurofeedback"}


@dataclass(frozen=True)
class AdverseEventSourceSpec:
    key: str
    display_name: str
    access_type: str
    source_url: str
    clinical_utility_summary: str
    source_kind: str
    category: str = "adverse_events"
    api_key_required: bool = False
    license_required: bool = False
    implemented: bool = False
    enabled: bool = True
    import_path: str = ""
    class_name: str = ""
    standard_reference: str = ""
    provenance_metadata: str = ""
    limitations: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


def _spec(**kwargs: Any) -> AdverseEventSourceSpec:
    return AdverseEventSourceSpec(**kwargs)


ADVERSE_EVENT_SPECS: tuple[AdverseEventSourceSpec, ...] = (
    _spec(
        key="faers",
        display_name="FAERS",
        access_type="free",
        source_url="https://api.fda.gov/drug/event.json",
        clinical_utility_summary=(
            "FDA spontaneous adverse-event report review for medication/device safety flags "
            "before neuromodulation planning."
        ),
        source_kind="live_api",
        implemented=True,
        enabled=True,
        import_path="app.services.knowledge.adapters.faers_adapter",
        class_name="FAERSAdapter",
        provenance_metadata="FDA openFDA adverse-event reporting data.",
        limitations=(FAERS_LIMITATION,),
        warnings=(
            "Spontaneous reports do not establish causality.",
            "No incidence rates or risk percentages should be inferred from FAERS counts.",
        ),
    ),
    _spec(
        key="meddra",
        display_name="MedDRA",
        access_type="free",
        source_url="https://www.meddra.org/",
        clinical_utility_summary=(
            "Terminology normalization for adverse-event coding, preferred terms, "
            "and regulatory vocabulary alignment."
        ),
        source_kind="terminology",
        implemented=True,
        enabled=True,
        import_path="app.adapters.meddra_adapter",
        class_name="MedDRAAdapter",
        provenance_metadata="MedDRA terminology access via UMLS/openFDA-backed adapter.",
        limitations=(
            "Terminology mapping standardizes labels; it does not establish causal relationships.",
        ),
        warnings=(
            "Mapped MedDRA terms are vocabulary support only.",
        ),
    ),
    _spec(
        key="vigibase",
        display_name="VigiBase",
        access_type="restricted",
        source_url="https://www.who-umc.org/",
        clinical_utility_summary=(
            "WHO global adverse drug reaction signal review when licensed access exists."
        ),
        source_kind="restricted_database",
        implemented=False,
        enabled=False,
        license_required=True,
        provenance_metadata="WHO-UMC restricted pharmacovigilance resource.",
        limitations=("Restricted source; no runtime querying without license/credentialed integration.",),
        warnings=("Do not mark healthy or query without licensed access.",),
    ),
    _spec(
        key="who_adr",
        display_name="WHO-ADR",
        access_type="restricted",
        source_url="https://www.who-umc.org/",
        clinical_utility_summary=(
            "International adverse drug monitoring context when licensed WHO access exists."
        ),
        source_kind="restricted_database",
        implemented=False,
        enabled=False,
        license_required=True,
        provenance_metadata="WHO-UMC restricted adverse-drug-reaction resource.",
        limitations=("Restricted source; represented for lifecycle completeness only.",),
        warnings=("Do not mark healthy or query without licensed access.",),
    ),
    _spec(
        key="ich_e2b",
        display_name="ICH E2B",
        access_type="free",
        source_url="https://www.ich.org/page/efficacy-guidelines",
        clinical_utility_summary=(
            "Regulatory adverse-event reporting schema reference for structured exports and handoff."
        ),
        source_kind="reporting_standard",
        implemented=True,
        enabled=True,
        standard_reference="ICH E2B(R3)",
        provenance_metadata="Reporting standard reference, not a live evidence source.",
        limitations=("Reporting standard only; no live adverse-event query capability.",),
        warnings=("Do not treat ICH E2B as a live evidence API.",),
    ),
    _spec(
        key="ctcae",
        display_name="CTCAE",
        access_type="free",
        source_url="https://ctep.cancer.gov/protocoldevelopment/electronic_applications/ctc.htm",
        clinical_utility_summary=(
            "Common toxicity grading reference for adverse-event severity documentation."
        ),
        source_kind="grading_reference",
        implemented=True,
        enabled=True,
        standard_reference="CTCAE",
        provenance_metadata="Severity grading terminology reference, not a live signal source.",
        limitations=("Grading reference only; no live adverse-event query capability.",),
        warnings=("Use for terminology/grading support, not to infer safety clearance.",),
    ),
)

_SPECS_BY_KEY = {spec.key: spec for spec in ADVERSE_EVENT_SPECS}


def list_adverse_event_keys() -> tuple[str, ...]:
    return tuple(spec.key for spec in ADVERSE_EVENT_SPECS)


def get_adverse_event_spec(key: str) -> AdverseEventSourceSpec | None:
    return _SPECS_BY_KEY.get(key)


def _importable(spec: AdverseEventSourceSpec) -> bool:
    if not spec.import_path or not spec.class_name:
        return False
    try:
        module = importlib.import_module(spec.import_path)
        getattr(module, spec.class_name)
        return True
    except Exception:
        return False


def _derive_lifecycle(spec: AdverseEventSourceSpec) -> LifecycleState:
    if not spec.enabled:
        return LifecycleState.DISABLED
    if spec.source_kind in {"reporting_standard", "grading_reference"}:
        return LifecycleState.REGISTERED
    if not spec.implemented:
        return LifecycleState.CATALOGUED
    if not spec.import_path:
        return LifecycleState.REGISTERED
    if _importable(spec):
        return LifecycleState.HEALTHY
    return LifecycleState.UNAVAILABLE


def build_adverse_event_inventory() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for spec in ADVERSE_EVENT_SPECS:
        lifecycle = _derive_lifecycle(spec)
        rows.append(
            {
                "id": spec.key,
                "key": spec.key,
                "display_name": spec.display_name,
                "category": spec.category,
                "access_type": spec.access_type,
                "source_url": spec.source_url,
                "standard_reference": spec.standard_reference,
                "api_key_required": spec.api_key_required,
                "license_required": spec.license_required,
                "implemented": spec.implemented,
                "enabled": spec.enabled,
                "source_kind": spec.source_kind,
                "lifecycle_state": lifecycle.value,
                "status": lifecycle.value,
                "live_exposed": spec.source_kind in {"live_api", "terminology"} and spec.enabled,
                "clinical_utility_summary": spec.clinical_utility_summary,
                "provenance_metadata": spec.provenance_metadata,
                "limitations": list(spec.limitations),
                "warnings": list(spec.warnings),
            }
        )
    return rows


def build_adverse_event_lifecycle_summary() -> dict[str, Any]:
    rows = build_adverse_event_inventory()
    by_state: dict[str, int] = {}
    for row in rows:
        state = str(row["lifecycle_state"])
        by_state[state] = by_state.get(state, 0) + 1
    return {
        "total": len(rows),
        "by_state": by_state,
        "sources": {row["key"]: row["lifecycle_state"] for row in rows},
    }


def _default_ctcae_reference() -> dict[str, Any]:
    spec = get_adverse_event_spec("ctcae")
    assert spec is not None
    return {
        "source": spec.display_name,
        "source_id": spec.key,
        "coding_system": "CTCAE",
        "reference_type": "grading_reference",
        "source_url": spec.source_url,
        "note": "Use CTCAE as a severity/grading reference where applicable; not a live signal source.",
    }


def _default_reporting_support() -> dict[str, Any]:
    spec = get_adverse_event_spec("ich_e2b")
    assert spec is not None
    return {
        "meddra_coding_supported": True,
        "ich_e2b_reference": {
            "source": spec.display_name,
            "source_id": spec.key,
            "reference_type": "reporting_standard",
            "standard_reference": spec.standard_reference,
            "source_url": spec.source_url,
        },
        "documentation_export_hooks": [
            "/api/v1/adverse-events/export.csv",
            "/api/v1/adverse-events/export.ndjson",
            "/api/v1/adverse-events/{id}/export.cioms",
        ],
    }


async def _map_meddra_terms(
    terms: list[str],
    *,
    adapter: Any,
) -> dict[str, str]:
    mapped: dict[str, str] = {}
    for term in terms:
        clean = str(term or "").strip()
        if not clean:
            continue
        try:
            results = await adapter.search(
                clean,
                filters={"exact_match": True, "max_results": 1, "meddra_level": "pt"},
            )
        except Exception:
            mapped[clean] = clean
            continue
        if results:
            first = results[0]
            mapped[clean] = str(first.get("term") or clean)
        else:
            mapped[clean] = clean
    return mapped


def _build_seizure_threshold_flags(
    *,
    medication_name: str,
    neuromodulation_modality: str | None,
    signals: list[dict[str, Any]],
) -> list[str]:
    modality = (neuromodulation_modality or "").strip().lower()
    med = medication_name.strip().lower()
    flagged_terms = [
        str(item.get("normalized_term") or item.get("event_term") or "").strip().lower()
        for item in signals
    ]

    flags: list[str] = []
    if modality in _NEUROMODULATION_MODALITIES and med in _SEIZURE_THRESHOLD_MEDICATIONS:
        flags.append(
            f"{medication_name.strip()} with {neuromodulation_modality} requires clinician review for "
            "possible seizure-threshold considerations; spontaneous-report associations do not prove causality."
        )
    if any(any(token in term for token in _SEIZURE_THRESHOLD_TERMS) for term in flagged_terms):
        flags.append(
            "Queried source returned a possible seizure-related safety signal. Review medication, dose, "
            "patient history, and modality context before stimulation planning."
        )
    return flags


def _source_status_map(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        row["key"]: {
            "display_name": row["display_name"],
            "lifecycle_state": row["lifecycle_state"],
            "enabled": row["enabled"],
            "access_type": row["access_type"],
            "source_kind": row["source_kind"],
            "source_url": row["source_url"],
        }
        for row in rows
    }


async def perform_medication_safety_check(
    *,
    medication_name: str,
    dose: str | None = None,
    condition: str | None = None,
    neuromodulation_modality: str | None = None,
    patient_id: str | None = None,
    query_live_sources: bool = True,
) -> dict[str, Any]:
    from app.adapters.meddra_adapter import MedDRAAdapter
    from app.services.knowledge.adapters.faers_adapter import FAERSAdapter

    normalized_medication = medication_name.strip()
    inventory = build_adverse_event_inventory()
    statuses = _source_status_map(inventory)
    warnings: list[str] = [ADVERSE_EVENT_DECISION_SUPPORT_DISCLAIMER]
    partial = False
    faers_signals: list[dict[str, Any]] = []
    meddra_terms: list[str] = []

    if query_live_sources:
        local_faers = FAERSAdapter({})
        local_meddra = MedDRAAdapter()
        faers_opened = False
        try:
            await local_faers.connect()
            faers_opened = True
            raw_counts = await local_faers.get_drug_event_counts(normalized_medication, top_n=5)
            raw_terms = [
                str(row.get("adverse_event_meddra_pt") or "").strip()
                for row in raw_counts
                if str(row.get("adverse_event_meddra_pt") or "").strip()
            ]
            mapped_terms = await _map_meddra_terms(raw_terms, adapter=local_meddra)
            for row in raw_counts:
                event_term = str(row.get("adverse_event_meddra_pt") or "").strip()
                normalized_term = mapped_terms.get(event_term, event_term)
                faers_signals.append(
                    {
                        "source": "FAERS",
                        "source_id": "faers",
                        "event_term": event_term,
                        "normalized_term": normalized_term,
                        "medication": normalized_medication,
                        "device_protocol_context": neuromodulation_modality,
                        "seriousness": None,
                        "outcome": None,
                        "report_count": row.get("report_count"),
                        "date_range": None,
                        "coding_system": "MedDRA",
                        "provenance": {
                            "source_url": "https://api.fda.gov/drug/event.json",
                            "query_parameters": {
                                "medication_name": normalized_medication,
                                "top_n": 5,
                            },
                        },
                        "limitations": [FAERS_LIMITATION],
                        "warnings": [
                            "Reported association only; causality cannot be inferred.",
                            "No incidence or risk percentage should be inferred from spontaneous reports.",
                        ],
                        "decision_support_disclaimer": ADVERSE_EVENT_DECISION_SUPPORT_DISCLAIMER,
                    }
                )
            meddra_terms = [signal["normalized_term"] for signal in faers_signals if signal["normalized_term"]]
        except Exception as exc:
            partial = True
            statuses["faers"]["lifecycle_state"] = LifecycleState.DEGRADED.value
            warnings.append(
                f"FAERS query unavailable for this request ({type(exc).__name__}). Returning degraded partial output."
            )
        finally:
            if faers_opened:
                try:
                    await local_faers.disconnect()
                except Exception:
                    pass
            try:
                await local_meddra.close()
            except Exception:
                pass
    else:
        warnings.append(
            "Live adverse-event querying was skipped for this bundle path. Use the dedicated "
            "/api/v1/adverse-events/medication-safety-check route for provenance-rich signal review."
        )

    if query_live_sources and not faers_signals:
        warnings.append(
            "No matching reports found in queried source for the supplied medication string. "
            "This does not prove absence of risk."
        )

    restricted_sources = [
        statuses[key]
        for key in ("vigibase", "who_adr")
        if key in statuses
    ]
    seizure_flags = _build_seizure_threshold_flags(
        medication_name=normalized_medication,
        neuromodulation_modality=neuromodulation_modality,
        signals=faers_signals,
    )
    return {
        "medication_name": medication_name,
        "normalized_medication": normalized_medication,
        "dose": dose,
        "condition": condition,
        "neuromodulation_modality": neuromodulation_modality,
        "patient_id": patient_id,
        "partial": partial,
        "faers_signals": faers_signals,
        "meddra_normalized_event_terms": meddra_terms,
        "seizure_threshold_flags": seizure_flags,
        "restricted_sources": restricted_sources,
        "source_statuses": statuses,
        "ctcae_reference": _default_ctcae_reference(),
        "reporting_support": _default_reporting_support(),
        "warnings": warnings,
        "provenance": {
            "sources_consulted": ["faers", "meddra"],
            "restricted_sources": ["vigibase", "who_adr"],
            "reference_only_sources": ["ich_e2b", "ctcae"],
            "query_parameters": {
                "medication_name": normalized_medication,
                "dose": dose,
                "condition": condition,
                "neuromodulation_modality": neuromodulation_modality,
            },
        },
        "decision_support_disclaimer": ADVERSE_EVENT_DECISION_SUPPORT_DISCLAIMER,
    }
