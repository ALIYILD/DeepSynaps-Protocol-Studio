"""Category 5 neuromodulation inventory and planning helpers.

This module is intentionally inventory-first. It does not pretend that
all Category 5 sources are live adapters in this repo. Instead, it
surfaces the sources honestly with lifecycle state, access notes, and
decision-support caveats so downstream workflows can stay cautious.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from app.services.brain_targets import get_brain_target, resolve_target_anchor
from app.services.knowledge.lifecycle import LifecycleState, summarize_lifecycle


def _iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


DECISION_SUPPORT_DISCLAIMER = (
    "Decision support only. Not diagnosis, not prescription, and not autonomous "
    "stimulation parameter selection. Clinician/device specialist review is required; "
    "modeling outputs and source metadata may be incomplete or population-specific."
)


@dataclass(frozen=True)
class NeuromodulationSourceSpec:
    key: str
    display_name: str
    source_url: str
    access_type: str
    clinical_utility_summary: str
    modality_tags: tuple[str, ...]
    access_notes: str
    lifecycle_note: str
    category: str = "neuromodulation"
    login_required: bool = False
    api_key_required: bool = False
    license_required: bool = False
    source_version_hint: str = "unknown"


_SPECS: tuple[NeuromodulationSourceSpec, ...] = (
    NeuromodulationSourceSpec(
        key="clinical_neurophysiology",
        display_name="Clinical Neurophysiology",
        source_url="Various",
        access_type="free",
        clinical_utility_summary="Normative EEG/EMG/evoked-potential metadata for protocol calibration and signal-quality review.",
        modality_tags=("eeg", "emg", "evoked-potential"),
        access_notes="Metadata-only inventory entry; no canonical dataset adapter is implemented in this repo.",
        lifecycle_note="Catalogued as normative-source metadata only.",
        source_version_hint="metadata-only",
    ),
    NeuromodulationSourceSpec(
        key="ieeg",
        display_name="iEEG.org",
        source_url="https://www.ieeg.org/",
        access_type="register",
        clinical_utility_summary="Intracranial EEG reference datasets for epilepsy target review and invasive physiology context.",
        modality_tags=("ieeg", "ecog", "epilepsy"),
        access_notes="Login is required. The repo does not ship a canonical live adapter.",
        lifecycle_note="Disabled unless login credentials are configured; otherwise catalogued only.",
        login_required=True,
        source_version_hint="login-gated",
    ),
    NeuromodulationSourceSpec(
        key="tms_atlas",
        display_name="TMS Atlas",
        source_url="https://www.tmsatlas.org/",
        access_type="free",
        clinical_utility_summary="Motor-threshold and hotspot mapping reference for TMS planning.",
        modality_tags=("tms", "motor-map"),
        access_notes="Catalogued reference only; no stable API adapter is implemented here.",
        lifecycle_note="Catalogued until a stable API-backed adapter exists.",
        source_version_hint="catalogued",
    ),
    NeuromodulationSourceSpec(
        key="deepbrain",
        display_name="DeepBrain",
        source_url="https://deepbrain.snu.ac.kr/",
        access_type="free",
        clinical_utility_summary="DBS targeting atlas for clinician-reviewed target planning context.",
        modality_tags=("dbs", "stimulation-target"),
        access_notes="Catalogued reference only; no stable adapter is implemented here.",
        lifecycle_note="Catalogued until a stable API-backed adapter exists.",
        source_version_hint="catalogued",
    ),
    NeuromodulationSourceSpec(
        key="neuromod_devices",
        display_name="NeuroMod Devices",
        source_url="Manufacturer APIs",
        access_type="metadata",
        clinical_utility_summary="Device and parameter metadata for session planning and governance checks.",
        modality_tags=("device", "session-planning"),
        access_notes="Manufacturer data is metadata-only unless a specific vendor API is implemented.",
        lifecycle_note="Catalogued as device metadata only.",
        source_version_hint="metadata-only",
    ),
    NeuromodulationSourceSpec(
        key="simnibs",
        display_name="SimNIBS",
        source_url="https://simnibs.github.io/",
        access_type="local_compute",
        clinical_utility_summary="Electric-field modelling scaffold for tDCS/TMS montage review.",
        modality_tags=("tdcs", "tms", "electric-field", "simulation"),
        access_notes="Local package/CLI availability is checked at runtime. The scaffold never fabricates field strength.",
        lifecycle_note="Healthy only when local package/CLI availability is verified; otherwise degraded or unavailable.",
        source_version_hint="simnibs_v4",
    ),
)


_SPECS_BY_KEY = {spec.key: spec for spec in _SPECS}


def list_neuromodulation_keys() -> tuple[str, ...]:
    return tuple(spec.key for spec in _SPECS)


def get_neuromodulation_spec(key: str) -> NeuromodulationSourceSpec | None:
    return _SPECS_BY_KEY.get(key)


def _credentials_present(*env_names: str) -> bool:
    return any(bool(os.environ.get(name, "").strip()) for name in env_names)


def _simnibs_installation_state() -> tuple[bool, bool]:
    module_ok = importlib.util.find_spec("simnibs") is not None
    cli_ok = shutil.which("simnibs") is not None
    return module_ok, cli_ok


def _state_for_spec(spec: NeuromodulationSourceSpec) -> LifecycleState:
    if spec.key == "ieeg":
        if _credentials_present("IEEG_USERNAME", "IEEG_PASSWORD", "IEEG_API_KEY", "IEEG_TOKEN", "IEEG_ACCESS_TOKEN"):
            return LifecycleState.DEGRADED
        return LifecycleState.DISABLED
    if spec.key == "simnibs":
        module_ok, cli_ok = _simnibs_installation_state()
        if module_ok and cli_ok:
            return LifecycleState.HEALTHY
        if module_ok or cli_ok:
            return LifecycleState.DEGRADED
        return LifecycleState.UNAVAILABLE
    if spec.key in {"clinical_neurophysiology", "tms_atlas", "deepbrain", "neuromod_devices"}:
        return LifecycleState.CATALOGUED
    return LifecycleState.UNKNOWN


def _entry_for_spec(spec: NeuromodulationSourceSpec) -> dict[str, Any]:
    state = _state_for_spec(spec)
    module_ok, cli_ok = _simnibs_installation_state() if spec.key == "simnibs" else (False, False)
    credentials_present = _credentials_present("IEEG_USERNAME", "IEEG_PASSWORD", "IEEG_API_KEY", "IEEG_TOKEN", "IEEG_ACCESS_TOKEN") if spec.key == "ieeg" else False
    enabled = state in {LifecycleState.HEALTHY, LifecycleState.DEGRADED, LifecycleState.CATALOGUED}
    if spec.key == "ieeg" and not credentials_present:
        enabled = False
    if spec.key == "simnibs" and state == LifecycleState.UNAVAILABLE:
        enabled = False

    warnings: list[str] = [DECISION_SUPPORT_DISCLAIMER]
    if spec.key == "simnibs":
        if not (module_ok and cli_ok):
            warnings.append("SimNIBS simulation unavailable in this environment; field strength is not computed.")
        else:
            warnings.append("SimNIBS availability verified locally; simulation execution remains clinician-reviewed.")
    elif spec.key == "ieeg" and not credentials_present:
        warnings.append("iEEG.org requires login credentials; do not mark as healthy without access configured.")
    elif spec.key == "ieeg" and credentials_present:
        warnings.append(
            "Login credentials are configured, but access should still be verified against the live iEEG.org service before treating this source as healthy."
        )
    elif spec.key in {"tms_atlas", "deepbrain"}:
        warnings.append("No stable API adapter is implemented here; catalogued reference only.")
    elif spec.key == "neuromod_devices":
        warnings.append("Manufacturer metadata is not a clinical validation layer.")
    elif spec.key == "clinical_neurophysiology":
        warnings.append("Normative-source metadata only; concrete datasets are not wired here.")

    return {
        "source_id": spec.key,
        "key": spec.key,
        "display_name": spec.display_name,
        "category": spec.category,
        "access_type": spec.access_type,
        "source_url": spec.source_url,
        "source_version": (
            "installed" if spec.key == "simnibs" and module_ok else spec.source_version_hint
        ),
        "lifecycle_state": state.value,
        "status": state.value,
        "enabled": enabled,
        "login_required": spec.login_required,
        "api_key_required": spec.api_key_required,
        "license_required": spec.license_required,
        "clinical_utility_summary": spec.clinical_utility_summary,
        "clinical_utility": spec.clinical_utility_summary,
        "access_notes": spec.access_notes,
        "lifecycle_note": spec.lifecycle_note,
        "provenance": {
            "source_registry": "Category 5 neuromodulation inventory",
            "source_version": spec.source_version_hint,
            "verified_at": _iso_now(),
            "availability": {
                "module_available": module_ok if spec.key == "simnibs" else None,
                "cli_available": cli_ok if spec.key == "simnibs" else None,
                "credentials_present": credentials_present if spec.key == "ieeg" else None,
            },
        },
        "limitations": [
            spec.lifecycle_note,
        ],
        "warnings": warnings,
        "modality_tags": list(spec.modality_tags),
    }


def build_neuromodulation_inventory() -> dict[str, Any]:
    sources = [_entry_for_spec(spec) for spec in _SPECS]
    states = {entry["key"]: LifecycleState(entry["lifecycle_state"]) for entry in sources}
    summary = summarize_lifecycle(states)
    return {
        "category": "neuromodulation",
        "total": len(sources),
        "sources": sources,
        "summary": summary,
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
        "generated_at": _iso_now(),
    }


def get_neuromodulation_source(key: str) -> dict[str, Any] | None:
    spec = get_neuromodulation_spec(key)
    if spec is None:
        return None
    return _entry_for_spec(spec)


def _match_sources(modality: str | None, target_region: str | None, device: str | None) -> list[dict[str, Any]]:
    inventory = build_neuromodulation_inventory()["sources"]
    modality_norm = (modality or "").strip().lower()
    target_norm = (target_region or "").strip().lower()
    device_norm = (device or "").strip().lower()
    hits: list[dict[str, Any]] = []
    for entry in inventory:
        tags = {tag.lower() for tag in entry.get("modality_tags", [])}
        key = str(entry.get("key") or "")
        if modality_norm and modality_norm not in tags and modality_norm not in key:
            continue
        if target_norm and target_norm not in key and target_norm not in str(entry.get("clinical_utility_summary") or "").lower():
            continue
        if device_norm and device_norm not in key and device_norm not in str(entry.get("clinical_utility_summary") or "").lower():
            continue
        hits.append(entry)
    return hits


def build_planning_context(payload: dict[str, Any]) -> dict[str, Any]:
    modality = str(payload.get("modality") or "").strip()
    condition = str(payload.get("condition") or "").strip()
    target_region = str(payload.get("target_region") or "").strip() or None
    montage = payload.get("montage")
    device = payload.get("device")
    patient_id = str(payload.get("patient_id") or "").strip() or None

    inventory = build_neuromodulation_inventory()
    target_entry = get_brain_target(target_region) if target_region else None
    target_anchor = resolve_target_anchor(target_region) if target_region else None
    source_hits = _match_sources(modality, target_region, device)
    source_statuses = {entry["key"]: entry["lifecycle_state"] for entry in inventory["sources"]}

    hooks = {
        "protocol_studio": {
            "status": "wired",
            "note": "Use source statuses and caveats as planning references only; never auto-select stimulation parameters.",
        },
        "brain_map_planner": {
            "status": "wired",
            "note": "Preserve target anchor, coordinate-space, and provenance metadata when storing plans.",
        },
        "qeeg_analyzer": {
            "status": "wired",
            "note": "Normative neurophysiology sources may inform calibration language, but all findings remain decision-support only.",
        },
        "biomarkers": {
            "status": "wired",
            "note": "Biomarker and qEEG links may be attached as caveats, not prescriptions.",
        },
        "session_device_planning": {
            "status": "wired",
            "note": "Device metadata is catalogued only unless manufacturer APIs are truly implemented.",
        },
    }

    warnings = [DECISION_SUPPORT_DISCLAIMER]
    if target_entry:
        warnings.append(f"Target anchor resolved to {target_anchor} for {target_entry['id']}.")
    if patient_id:
        warnings.append("Patient-linked use requires existing consent and access controls in the calling workflow.")

    return {
        "category": "neuromodulation",
        "modality": modality,
        "condition": condition,
        "target_region": target_region,
        "target_anchor": target_anchor,
        "target": target_entry,
        "montage": montage,
        "device": device,
        "patient_id": patient_id,
        "source_statuses": source_statuses,
        "source_hits": source_hits,
        "workflow_hooks": hooks,
        "warnings": warnings,
        "provenance": {
            "generated_at": _iso_now(),
            "source_registry": "neuromodulation_inventory",
            "target_lookup": bool(target_entry),
        },
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }


def build_simnibs_status(payload: dict[str, Any]) -> dict[str, Any]:
    source = get_neuromodulation_source("simnibs") or {}
    return {
        "source": source,
        "requested": {
            "modality": payload.get("modality"),
            "target_region": payload.get("target_region"),
            "montage": payload.get("montage"),
            "device": payload.get("device"),
            "coordinate_space": payload.get("coordinate_space"),
        },
        "status": source.get("lifecycle_state", LifecycleState.UNKNOWN.value),
        "field_strength_v_m": None,
        "field_estimate_computed": False,
        "simulation_unavailable": source.get("lifecycle_state") != LifecycleState.HEALTHY.value,
        "reason": (
            "SimNIBS package/CLI availability is not fully verified in this environment."
            if source.get("lifecycle_state") != LifecycleState.HEALTHY.value
            else "Scaffold does not execute FEM simulations; field estimates are not computed here."
        ),
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }
