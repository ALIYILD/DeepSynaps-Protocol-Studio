"""Deterministic device resolution for protocol draft generation.

Uses only imported clinical CSVs (protocols, devices, conditions, modalities).
No LLM and no invented clinical claims — scoring is registry-derived and explainable.
"""

from __future__ import annotations

from dataclasses import dataclass

from deepsynaps_core_schema import DeviceResolutionInfo, RankedDeviceCandidate, ProtocolDraftRequest

from app.errors import ApiServiceError
from app.services.clinical_data import (
    ClinicalDatasetBundle,
    _condition_key,
    _condition_lookup,
    _device_name_lookup,
    _modality_key,
    _modality_lookup,
    _normalize_regulatory_status,
    _normalize_text_key,
    _table_index,
)


def _regulatory_score(regulatory_status: str) -> int:
    tier = _normalize_regulatory_status(regulatory_status)
    return {
        "Approved": 40,
        "Cleared": 30,
        "Research Use": 10,
        "Emerging": 0,
    }.get(tier, 0)


def _review_score(review_status: str) -> int:
    return 15 if review_status.strip().lower() == "reviewed" else 0


def _setting_score(device_row: dict[str, str], setting: str) -> int:
    hv = (device_row.get("Home_vs_Clinic") or "").lower()
    if setting == "Home":
        if "home" in hv:
            return 10
    elif setting == "Clinic":
        if "clinic" in hv or "hybrid" in hv:
            return 5
    return 0


def _collect_candidate_devices(
    bundle: ClinicalDatasetBundle,
    *,
    condition_row: dict[str, str],
    modality_row: dict[str, str],
) -> dict[str, dict[str, str]]:
    """Map Device_ID -> device row for all devices compatible with condition+modality protocol rows."""
    devices_by_id = _table_index(bundle, "devices", "Device_ID")
    modality_key_target = _modality_key(modality_row["Modality_Name"])
    out: dict[str, dict[str, str]] = {}
    for protocol in bundle.tables["protocols"]:
        if protocol["Condition_ID"] != condition_row["Condition_ID"]:
            continue
        if protocol["Modality_ID"] != modality_row["Modality_ID"]:
            continue
        dev_spec = (protocol.get("Device_ID_if_specific") or "").strip()
        if dev_spec:
            device = devices_by_id.get(dev_spec)
            if device is not None:
                out[device["Device_ID"]] = device
        else:
            for device in bundle.tables["devices"]:
                if _modality_key(device["Modality"]) == modality_key_target:
                    out[device["Device_ID"]] = device
    return out


def _score_device(
    device: dict[str, str],
    *,
    protocol_specific: bool,
    protocol_general: bool,
    setting: str,
) -> tuple[int, list[str]]:
    score = 0
    notes: list[str] = []
    if protocol_specific:
        score += 2000
        notes.append("Device appears on a protocol row with explicit device linkage for this condition/modality.")
    elif protocol_general:
        score += 400
        notes.append("Device matches modality for a non-device-specific protocol row for this condition.")
    rs = _regulatory_score(device.get("Regulatory_Status", ""))
    score += rs
    if rs:
        notes.append(f"Regulatory posture contributes {rs} points (registry Regulatory_Status).")
    rv = _review_score(device.get("Review_Status", ""))
    score += rv
    if rv:
        notes.append("Review_Status is Reviewed in the device registry row.")
    st = _setting_score(device, setting)
    score += st
    if st:
        notes.append("Home vs clinic use-type aligns with the requested setting where encoded in the registry.")
    return score, notes


def _rank_candidates(
    bundle: ClinicalDatasetBundle,
    *,
    condition_row: dict[str, str],
    modality_row: dict[str, str],
    candidates: dict[str, dict[str, str]],
    setting: str,
) -> list[tuple[dict[str, str], int, list[str], RankedDeviceCandidate]]:
    """Return sorted list of (device_row, score, notes, ranked_model)."""
    ranked: list[tuple[dict[str, str], int, list[str], RankedDeviceCandidate]] = []
    for device_id, device in sorted(candidates.items(), key=lambda kv: kv[0]):
        protocol_specific = False
        protocol_general = False
        for protocol in bundle.tables["protocols"]:
            if protocol["Condition_ID"] != condition_row["Condition_ID"]:
                continue
            if protocol["Modality_ID"] != modality_row["Modality_ID"]:
                continue
            spec = (protocol.get("Device_ID_if_specific") or "").strip()
            if spec and spec == device_id:
                protocol_specific = True
            if not spec:
                protocol_general = True
        score, score_notes = _score_device(
            device,
            protocol_specific=protocol_specific,
            protocol_general=protocol_general,
            setting=setting,
        )
        rationale = list(score_notes)
        if protocol_specific:
            rationale.insert(0, "Explicit protocol-device linkage in imported protocols.csv.")
        ranked.append(
            (
                device,
                score,
                rationale,
                RankedDeviceCandidate(
                    rank=0,
                    device_id=device["Device_ID"],
                    device_name=device["Device_Name"],
                    score=score,
                    rationale=rationale,
                ),
            )
        )
    ranked.sort(key=lambda x: (-x[1], x[0]["Device_ID"]))
    for idx, (_d, _s, _n, cand) in enumerate(ranked, start=1):
        cand.rank = idx
    return ranked


@dataclass(frozen=True)
class ResolvedDevice:
    device_name: str
    device_row: dict[str, str]
    resolution_method: str  # user_selected | auto_resolved | user_selected_validated


def resolve_device_for_protocol_draft(
    bundle: ClinicalDatasetBundle,
    payload: ProtocolDraftRequest,
) -> ResolvedDevice:
    """Resolve and validate device. Raises ApiServiceError on failure."""
    conditions = _condition_lookup(bundle)
    modalities = _modality_lookup(bundle)
    device_lookup = _device_name_lookup(bundle)
    condition = conditions.get(_condition_key(payload.condition))
    modality = modalities.get(_modality_key(payload.modality))
    if condition is None or modality is None:
        raise ApiServiceError(
            code="unsupported_combination",
            message="The selected protocol inputs are not available in the imported clinical database.",
            warnings=["Verify condition and modality labels against the master clinical dataset."],
        )

    candidates_map = _collect_candidate_devices(bundle, condition_row=condition, modality_row=modality)
    if not candidates_map:
        raise ApiServiceError(
            code="no_compatible_device",
            message="No device-compatible protocol rows exist in the imported clinical database for this condition and modality.",
            warnings=[
                "Select a different modality or condition pairing that appears in the clinical snapshot, "
                "or add/update source data and re-import."
            ],
        )

    requested = (payload.device or "").strip()
    setting = payload.setting

    ranked = _rank_candidates(
        bundle,
        condition_row=condition,
        modality_row=modality,
        candidates=candidates_map,
        setting=setting,
    )

    if requested:
        device_row = device_lookup.get(_normalize_text_key(requested))
        if device_row is None:
            raise ApiServiceError(
                code="invalid_device",
                message="The requested device name does not match any entry in the imported device registry.",
                warnings=["Use a device label from GET /api/v1/devices or the ranked candidate list."],
            )
        if _modality_key(device_row["Modality"]) != _modality_key(payload.modality):
            raise ApiServiceError(
                code="unsupported_combination",
                message="The selected device does not match the selected modality in the imported clinical database.",
                warnings=["Choose a device aligned to the requested modality."],
            )
        if device_row["Device_ID"] not in candidates_map:
            detail_candidates = [x[3] for x in ranked[:12]]
            raise ApiServiceError(
                code="device_not_supported_for_selection",
                message=(
                    "The selected device is not among the registry-compatible options for this "
                    "condition and modality in the imported clinical snapshot."
                ),
                warnings=[
                    "Pick one of the candidate devices returned for this condition/modality, "
                    "or leave device blank to see ranked options."
                ],
                status_code=422,
                details={
                    "candidate_devices": [c.model_dump() for c in detail_candidates],
                    "ranking_notes": [
                        "Candidates are derived only from protocols.csv and devices.csv in the active clinical snapshot."
                    ],
                },
            )
        return ResolvedDevice(
            device_name=device_row["Device_Name"],
            device_row=device_row,
            resolution_method="user_selected_validated",
        )

    if len(candidates_map) == 1:
        only = next(iter(candidates_map.values()))
        return ResolvedDevice(
            device_name=only["Device_Name"],
            device_row=only,
            resolution_method="auto_resolved",
        )

    detail_candidates = [x[3] for x in ranked[:24]]
    raise ApiServiceError(
        code="device_candidates_required",
        message=(
            "Multiple registry-compatible devices match this condition and modality. "
            "Select a specific device and resend the request."
        ),
        warnings=[
            "Resolution uses deterministic ranking from imported protocols and device rows only.",
        ],
        status_code=409,
        details={
            "candidate_devices": [c.model_dump() for c in detail_candidates],
            "ranking_notes": [
                "Sorted by explicit protocol linkage, regulatory fields, review status, and setting fit "
                "(see per-candidate rationale). Tie-breaker: Device_ID lexicographic order.",
            ],
        },
    )


def build_device_resolution_info(
    bundle: ClinicalDatasetBundle,
    payload: ProtocolDraftRequest,
    resolved: ResolvedDevice,
) -> DeviceResolutionInfo:
    """Attach traceability for successful drafts (single-device outcomes)."""
    conditions = _condition_lookup(bundle)
    modalities = _modality_lookup(bundle)
    condition = conditions[_condition_key(payload.condition)]
    modality = modalities[_modality_key(payload.modality)]
    cmap = _collect_candidate_devices(bundle, condition_row=condition, modality_row=modality)
    ranked = _rank_candidates(
        bundle,
        condition_row=condition,
        modality_row=modality,
        candidates=cmap,
        setting=payload.setting,
    )
    cands = [x[3] for x in ranked[:24]]
    method = resolved.resolution_method
    rationale: list[str] = []
    if method == "auto_resolved":
        rationale.append(
            "Exactly one registry-compatible device matched imported protocol rows for this condition/modality."
        )
    elif method == "user_selected_validated":
        rationale.append("Clinician-selected device matched a registry-compatible option for this condition/modality.")
    else:
        rationale.append("Device supplied by client matched registry validation rules.")
    notes: list[str] = [
        "Ranking keys: explicit protocol.csv device linkage > modality-wide protocol rows; "
        "then regulatory tier, review status, and setting fit."
    ]
    return DeviceResolutionInfo(
        resolution_method=method,  # type: ignore[arg-type]
        resolved_device=resolved.device_name,
        clinical_evidence_snapshot_id=bundle.snapshot.snapshot_id,
        ranking_notes=notes,
        device_selection_rationale=rationale,
        candidate_devices=cands,
        safety_checks_applied=[
            "registry_device_validation",
            "modality_device_consistency",
            "protocol_row_association",
        ],
    )
