"""Category 7 electrophysiology inventory and reference-search helpers.

This module keeps the four electrophysiology sources honest:
they are catalogued as research/reference datasets, but they are not
treated as validated clinical normative databases unless the repo later
adds tested live access.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, Iterable, List, Optional

from app.services.knowledge.lifecycle import LifecycleState


DECISION_SUPPORT_DISCLAIMER = (
    "Decision support only. Not diagnostic, not a treatment recommendation. "
    "Clinician must verify against patient context. External EEG datasets "
    "may not be clinical normative references, and qEEG biomarkers are "
    "context-dependent."
)


@dataclass(frozen=True)
class ElectrophysiologySpec:
    key: str
    display_name: str
    source_url: str
    access_type: str
    dataset_type: str
    modality: str
    recording_condition: str
    population_context: str
    frequency_band: str
    biomarker_tags: tuple[str, ...]
    artifact_tags: tuple[str, ...]
    clinical_utility_summary: str
    provenance_notes: str
    access_license_notes: str
    limitations: tuple[str, ...]
    warnings: tuple[str, ...]
    enabled: bool = False
    registered: bool = False
    lifecycle_state: str = LifecycleState.CATALOGUED.value
    status: str = LifecycleState.CATALOGUED.value


ELECTROPHYSIOLOGY_SPECS: tuple[ElectrophysiologySpec, ...] = (
    ElectrophysiologySpec(
        key="eegbase",
        display_name="EEGBase",
        source_url="https://eegbase.kiv.zcu.cz/",
        access_type="free",
        dataset_type="repository",
        modality="EEG/qEEG",
        recording_condition="unknown",
        population_context="Research-grade EEG repository with normative-style material and biomarkers.",
        frequency_band="theta/beta/alpha",
        biomarker_tags=("qEEG", "biomarker context", "normative reference candidate"),
        artifact_tags=("unknown",),
        clinical_utility_summary="EEG repository for normative data and biomarkers; reference context only until validated.",
        provenance_notes="Catalogued from the Category 7 inventory. No live query adapter is wired in this checkout.",
        access_license_notes="Public research/reference source. Verify license terms before reuse.",
        limitations=(
            "Not validated here as a clinical normative database.",
            "No live adapter access implemented in this checkout.",
        ),
        warnings=(
            "Reference dataset only.",
            "Do not infer patient abnormality from this source alone.",
        ),
    ),
    ElectrophysiologySpec(
        key="eeglab_datasets",
        display_name="EEGLAB Datasets",
        source_url="https://sccn.ucsd.edu/~arno/fam2data/publicly_available_EEG_data.html",
        access_type="free",
        dataset_type="repository",
        modality="EEG",
        recording_condition="task",
        population_context="Public example and reference EEG collections used for teaching and method development.",
        frequency_band="unknown",
        biomarker_tags=("artifact templates", "reference EEG", "method development"),
        artifact_tags=("eye blink", "muscle", "movement", "line noise"),
        clinical_utility_summary="Reference EEG data and artifact template awareness for qEEG teaching and review.",
        provenance_notes="Catalogued from the Category 7 inventory. Intended for teaching/reference context.",
        access_license_notes="Public datasets with source-specific terms; verify attribution and reuse conditions.",
        limitations=(
            "Not a validated clinical normative database.",
            "Artifact examples are reference templates, not automated classifications.",
        ),
        warnings=(
            "Reference dataset only.",
            "Do not treat as patient-specific normative evidence.",
        ),
    ),
    ElectrophysiologySpec(
        key="openeeg",
        display_name="OpenEEG",
        source_url="http://openeeg.sourceforge.net/",
        access_type="free",
        dataset_type="community reference",
        modality="EEG",
        recording_condition="unknown",
        population_context="Open-source EEG hardware/software community reference material.",
        frequency_band="unknown",
        biomarker_tags=("open-source", "baseline reference", "hardware context"),
        artifact_tags=("hardware reference", "community examples"),
        clinical_utility_summary="Open-source EEG baseline and community reference material for educational comparison only.",
        provenance_notes="Catalogued community source. No patient-specific live query surface is wired.",
        access_license_notes="Open community material; confirm project-specific licensing before redistribution.",
        limitations=(
            "Not validated as a clinical normative database.",
            "Hardware and community examples are not patient-level evidence.",
        ),
        warnings=(
            "Research-grade reference.",
            "Not diagnostic.",
        ),
    ),
    ElectrophysiologySpec(
        key="sleep_edf",
        display_name="Sleep-EDF",
        source_url="https://physionet.org/content/sleep-edfx/",
        access_type="free",
        dataset_type="sleep EEG dataset",
        modality="sleep EEG",
        recording_condition="sleep",
        population_context="Sleep EEG and polysomnography reference material for sleep-context interpretation.",
        frequency_band="delta/theta/spindle",
        biomarker_tags=("sleep staging", "slow-wave activity", "sleep spindle", "sleep EEG"),
        artifact_tags=("sleep artifact", "movement", "channel drop-out"),
        clinical_utility_summary="Sleep EEG reference dataset for sleep-related neuromodulation context only.",
        provenance_notes="Catalogued from the Category 7 inventory. Sleep-specific reference context only.",
        access_license_notes="PhysioNet access terms apply; verify dataset-specific access conditions.",
        limitations=(
            "Not a broad qEEG normative source.",
            "Sleep-specific context should not be generalized to resting qEEG.",
        ),
        warnings=(
            "Reference dataset only.",
            "Use only for sleep-related context review.",
        ),
    ),
)

_SPECS_BY_KEY: Dict[str, ElectrophysiologySpec] = {spec.key: spec for spec in ELECTROPHYSIOLOGY_SPECS}


def list_electrophysiology_keys() -> List[str]:
    return [spec.key for spec in ELECTROPHYSIOLOGY_SPECS]


def get_electrophysiology_spec(key: str) -> Optional[ElectrophysiologySpec]:
    return _SPECS_BY_KEY.get(key)


def build_electrophysiology_inventory() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for spec in ELECTROPHYSIOLOGY_SPECS:
        row = asdict(spec)
        row["source"] = spec.display_name
        row["source_id"] = spec.key
        row["status"] = spec.status
        row["lifecycle_state"] = spec.lifecycle_state
        row["clinical_utility"] = spec.clinical_utility_summary
        row["dataset_name"] = spec.display_name
        row["decision_support_disclaimer"] = DECISION_SUPPORT_DISCLAIMER
        rows.append(row)
    return rows


def summarize_electrophysiology_lifecycle() -> Dict[str, Any]:
    states: Dict[str, str] = {}
    by_state: Dict[str, int] = {member.value: 0 for member in LifecycleState}
    for spec in ELECTROPHYSIOLOGY_SPECS:
        states[spec.key] = spec.lifecycle_state
        by_state[spec.lifecycle_state] = by_state.get(spec.lifecycle_state, 0) + 1
    return {
        "total": len(ELECTROPHYSIOLOGY_SPECS),
        "by_state": by_state,
        "adapters": states,
    }


def _keywords_for_spec(spec: ElectrophysiologySpec) -> set[str]:
    tokens = {
        spec.key,
        spec.display_name.lower(),
        spec.dataset_type.lower(),
        spec.modality.lower(),
        spec.recording_condition.lower(),
        spec.population_context.lower(),
    }
    tokens.update(tag.lower() for tag in spec.biomarker_tags)
    tokens.update(tag.lower() for tag in spec.artifact_tags)
    return {token for token in tokens if token}


def _score_match(query: Dict[str, Any], spec: ElectrophysiologySpec) -> tuple[int, List[str]]:
    reasons: List[str] = []
    score = 0

    modality = str(query.get("modality") or "").strip().lower()
    condition = str(query.get("condition") or query.get("context") or "").strip().lower()
    recording_condition = str(query.get("recording_condition") or "").strip().lower()
    frequency_band = str(query.get("frequency_band") or "").strip().lower()
    biomarker = str(query.get("biomarker") or "").strip().lower()
    age_group = str(query.get("age_group") or "").strip().lower()

    if modality and modality in spec.modality.lower():
        score += 30
        reasons.append(f"modality matches {spec.modality}")
    if recording_condition and recording_condition == spec.recording_condition.lower():
        score += 25
        reasons.append(f"recording condition matches {spec.recording_condition}")
    if frequency_band and frequency_band in spec.frequency_band.lower():
        score += 20
        reasons.append(f"frequency band aligns with {spec.frequency_band}")
    if biomarker and any(token in biomarker for token in spec.biomarker_tags):
        score += 20
        reasons.append("biomarker context overlaps source tags")
    if condition:
        cond_tokens = condition.replace("-", " ").split()
        spec_blob = " ".join(sorted(_keywords_for_spec(spec)))
        if any(token and token in spec_blob for token in cond_tokens):
            score += 15
            reasons.append("condition/context overlaps source description")
    if age_group:
        reasons.append(f"age-group context noted ({age_group})")
        if "sleep" in spec.key:
            score += 5
    if not query:
        score = 10
        reasons.append("reference catalog preview")
    return score, reasons


def search_electrophysiology_reference_datasets(query: Dict[str, Any]) -> Dict[str, Any]:
    matches: List[Dict[str, Any]] = []
    for spec in ELECTROPHYSIOLOGY_SPECS:
        score, reasons = _score_match(query, spec)
        row = {
            "source": spec.display_name,
            "source_id": spec.key,
            "dataset_name": spec.display_name,
            "modality": spec.modality,
            "recording_condition": spec.recording_condition,
            "population_context": spec.population_context,
            "frequency_band": spec.frequency_band,
            "biomarker_tags": list(spec.biomarker_tags),
            "artifact_tags": list(spec.artifact_tags),
            "access_license_notes": spec.access_license_notes,
            "provenance": {
                "source_url": spec.source_url,
                "source_version": "catalogued",
                "license_type": spec.access_type,
                "retrieval_method": "catalogued",
                "reference_only": True,
            },
            "limitations": list(spec.limitations),
            "warnings": list(spec.warnings),
            "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
            "lifecycle_state": spec.lifecycle_state,
            "status": spec.status,
            "source_url": spec.source_url,
            "match_score": score,
            "match_reason": "; ".join(reasons) if reasons else "reference catalog context",
        }
        matches.append(row)

    matches.sort(key=lambda row: row["match_score"], reverse=True)
    return {
        "query": {
            "modality": query.get("modality"),
            "condition": query.get("condition") or query.get("context"),
            "recording_condition": query.get("recording_condition"),
            "frequency_band": query.get("frequency_band"),
            "biomarker": query.get("biomarker"),
            "age_group": query.get("age_group"),
            "patient_id": query.get("patient_id"),
        },
        "decision_support_only": True,
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
        "partial": False,
        "source_statuses": build_electrophysiology_inventory(),
        "matching_reference_datasets": matches,
        "source_count": len(matches),
    }


__all__ = [
    "DECISION_SUPPORT_DISCLAIMER",
    "ELECTROPHYSIOLOGY_SPECS",
    "ElectrophysiologySpec",
    "build_electrophysiology_inventory",
    "get_electrophysiology_spec",
    "list_electrophysiology_keys",
    "search_electrophysiology_reference_datasets",
    "summarize_electrophysiology_lifecycle",
]
