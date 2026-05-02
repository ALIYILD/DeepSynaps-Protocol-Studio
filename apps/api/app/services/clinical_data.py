from __future__ import annotations

import hashlib
import json
import os
import re
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

# Re-export shim — see docs/adr/0009-registry-packages.md.
# The CSV-loader primitives that used to live in this module have moved to
# packages/clinical-data-registry; we re-export them here so legacy import
# paths (`from app.services.clinical_data import _read_csv_records`) keep
# working until the shim is dropped in PR-C.
from clinical_data_registry import (  # noqa: F401  (public re-exports)
    TEXT_REPLACEMENTS,
    _clean_text,
    _read_csv_records,
)

from deepsynaps_core_schema import (
    DeviceListResponse,
    DeviceRecord,
    EvidenceListResponse,
    EvidenceRecord,
    HandbookDocument,
    HandbookGenerateRequest,
    HandbookGenerateResponse,
    PersonalizationWhySelectedDebug,
    ProtocolDraftRequest,
    ProtocolDraftResponse,
    StructuredRuleFire,
)

from app.auth import AuthenticatedActor, require_minimum_role
from app.errors import ApiServiceError
from app.registries.shared import standard_disclaimers
from app.repositories.clinical import get_snapshot_by_hash, upsert_seed_records, upsert_snapshot
from app.services.clinical_protocol_coverage import assert_critical_protocol_coverage
from app.services.personalization_governance import build_why_selected_debug_projection
from app.services.protocol_personalization import (
    build_phenotypes_by_id,
    build_protocol_file_index,
    normalize_personalization_payload,
    personalization_lists_non_empty,
    resolve_failed_modality_ids,
    select_protocol_among_eligible,
)
from app.settings import CLINICAL_DATA_ROOT, CLINICAL_SNAPSHOT_ROOT


EXPECTED_COUNTS = {
    "evidence_levels": 4,
    "governance_rules": 12,
    "modalities": 12,
    "devices": 19,
    "conditions": 52,
    "phenotypes": 30,
    "assessments": 42,
    "protocols": 59,
    "sources": 30,
    "personalization_rules": 3,
}

# Single source of truth for snapshot.total_records — must match sum of per-table EXPECTED_COUNTS.
EXPECTED_TOTAL_RECORDS: int = sum(EXPECTED_COUNTS.values())

PRIMARY_KEYS = {
    "evidence_levels": "Evidence_Level_ID",
    "governance_rules": "Rule_ID",
    "modalities": "Modality_ID",
    "devices": "Device_ID",
    "conditions": "Condition_ID",
    "phenotypes": "Phenotype_ID",
    "assessments": "Assessment_ID",
    "protocols": "Protocol_ID",
    "sources": "Source_ID",
    "personalization_rules": "Rule_ID",
}

DATASET_FILES = {
    "evidence_levels": "evidence_levels.csv",
    "governance_rules": "governance_rules.csv",
    "modalities": "modalities.csv",
    "devices": "devices.csv",
    "conditions": "conditions.csv",
    "phenotypes": "phenotypes.csv",
    "assessments": "assessments.csv",
    "protocols": "protocols.csv",
    "sources": "sources.csv",
    "personalization_rules": "personalization_rules.csv",
}


class ClinicalDataValidationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ClinicalSnapshot:
    snapshot_id: str
    source_hash: str
    source_root: str
    total_records: int
    counts_json: str
    created_at: str


@dataclass(frozen=True)
class ClinicalDatasetBundle:
    tables: dict[str, list[dict[str, str]]]
    snapshot: ClinicalSnapshot


def _split_values(raw_value: str) -> list[str]:
    if not raw_value:
        return []
    parts = re.split(r"\s*;\s*|\s*/\s*|,\s*(?=[A-Z])", raw_value)
    return [part.strip() for part in parts if part.strip()]


def _normalize_text_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def _normalize_modality(value: str) -> str:
    lowered = value.lower()
    if "tps" in lowered:
        return "TPS"
    if "tdcs" in lowered:
        return "tDCS"
    if "pbm" in lowered:
        return "PBM"
    if "neurofeedback" in lowered:
        return "Neurofeedback"
    # iTBS vs rTMS must stay distinct — both used to collapse to "TMS" and collide in _modality_lookup.
    if "itbs" in lowered:
        return "iTBS"
    if "theta burst" in lowered or "ibts" in lowered:
        return "iTBS"
    if "rtms" in lowered:
        return "rTMS"
    if "tms" in lowered:
        return "rTMS"
    if "dbs" in lowered:
        return "DBS"
    if "vns" in lowered:
        return "VNS"
    if "ces" in lowered:
        return "CES"
    if "hrv" in lowered:
        return "HRV Biofeedback"
    if "tacs" in lowered:
        return "tACS"
    return value.strip()


def _modality_key(value: str) -> str:
    return _normalize_text_key(_normalize_modality(value))


def _condition_key(value: str) -> str:
    return _normalize_text_key(value)


def _device_aliases(value: str) -> set[str]:
    aliases = {
        _normalize_text_key(value),
        _normalize_text_key(re.sub(r"\s*\([^)]*\)", "", value)),
    }
    if "(" in value and ")" in value:
        aliases.add(_normalize_text_key(value.split("(", maxsplit=1)[0]))
    for token in re.split(r"[/,;-]", value):
        token_key = _normalize_text_key(token)
        if token_key:
            aliases.add(token_key)
    return {alias for alias in aliases if alias}


def _normalize_evidence_grade(value: str) -> str:
    mapping = {
        "EV-A": "Guideline",
        "EV-B": "Systematic Review",
        "EV-C": "Emerging",
        "EV-D": "Experimental",
    }
    return mapping.get(value.strip(), value.strip())


def _normalize_regulatory_status(value: str) -> str:
    lowered = value.lower()
    if "pma" in lowered or ("approved" in lowered and "not approved" not in lowered):
        return "Approved"
    if "cleared" in lowered or "ce-marked" in lowered or "de novo" in lowered:
        return "Cleared"
    if "research" in lowered or "investigational" in lowered or "not fda" in lowered:
        return "Research Use"
    return "Emerging"


def _parse_channels(value: str) -> int:
    match = re.search(r"(\d+)", value)
    if match:
        return int(match.group(1))
    lowered = value.lower()
    if "single" in lowered:
        return 1
    if "bilateral" in lowered:
        return 2
    return 1


def _normalize_use_type(value: str) -> str:
    lowered = value.lower()
    if "home" in lowered and "clinic" in lowered:
        return "Hybrid"
    if "home" in lowered:
        return "Home"
    return "Clinic"


def _build_source_hash(file_paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(file_paths):
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def _table_index(bundle: ClinicalDatasetBundle, dataset_name: str, key_name: str) -> dict[str, dict[str, str]]:
    return {record[key_name]: record for record in bundle.tables[dataset_name]}


def _condition_lookup(bundle: ClinicalDatasetBundle) -> dict[str, dict[str, str]]:
    lookup: dict[str, dict[str, str]] = {}
    for condition in bundle.tables["conditions"]:
        name = condition["Condition_Name"]
        primary = _condition_key(name)
        lookup.setdefault(primary, condition)
        # Alias: strip parenthetical so "Major Depressive Disorder" matches
        # "Major Depressive Disorder (MDD)". Mirrors _device_aliases approach.
        no_parens = re.sub(r"\s*\([^)]*\)", "", name)
        alias = _condition_key(no_parens)
        if alias and alias != primary:
            lookup.setdefault(alias, condition)
    return lookup


def _device_name_lookup(bundle: ClinicalDatasetBundle) -> dict[str, dict[str, str]]:
    lookup: dict[str, dict[str, str]] = {}
    for device in bundle.tables["devices"]:
        for alias in _device_aliases(device["Device_Name"]):
            lookup.setdefault(alias, device)
    return lookup


def _modality_lookup(bundle: ClinicalDatasetBundle) -> dict[str, dict[str, str]]:
    return {
        _modality_key(modality["Modality_Name"]): modality for modality in bundle.tables["modalities"]
    }


def _find_governance_rule(bundle: ClinicalDatasetBundle, rule_name: str) -> dict[str, str] | None:
    return next(
        (rule for rule in bundle.tables["governance_rules"] if rule["Rule_Name"] == rule_name),
        None,
    )


def _protocol_row_eligible_for_device(
    protocol: dict[str, str],
    *,
    condition: dict[str, str],
    modality: dict[str, str],
    devices_by_id: dict[str, dict[str, str]],
    requested_device: dict[str, str] | None,
) -> bool:
    if protocol["Condition_ID"] != condition["Condition_ID"]:
        return False
    if protocol["Modality_ID"] != modality["Modality_ID"]:
        return False
    if not protocol["Device_ID_if_specific"]:
        return True
    device = devices_by_id.get(protocol["Device_ID_if_specific"])
    return (
        device is not None
        and requested_device is not None
        and device["Device_ID"] == requested_device["Device_ID"]
    )


def _collect_eligible_protocols(
    bundle: ClinicalDatasetBundle,
    *,
    condition_name: str,
    modality_name: str,
    device_name: str,
) -> list[dict[str, str]]:
    """All protocol rows matching condition/modality/device rules (may be multiple)."""
    conditions = _condition_lookup(bundle)
    modalities = _modality_lookup(bundle)
    devices_by_id = _table_index(bundle, "devices", "Device_ID")
    condition = conditions.get(_condition_key(condition_name))
    modality = modalities.get(_modality_key(modality_name))
    if condition is None or modality is None:
        return []

    device_lookup = _device_name_lookup(bundle)
    requested_device = device_lookup.get(_normalize_text_key(device_name)) if device_name else None
    eligible: list[dict[str, str]] = []
    for protocol in bundle.tables["protocols"]:
        if _protocol_row_eligible_for_device(
            protocol,
            condition=condition,
            modality=modality,
            devices_by_id=devices_by_id,
            requested_device=requested_device,
        ):
            eligible.append(protocol)
    return eligible


def _find_protocol_match(
    bundle: ClinicalDatasetBundle,
    *,
    condition_name: str,
    modality_name: str,
    device_name: str,
) -> dict[str, str] | None:
    """Legacy first-match semantics: earliest eligible row in imported CSV order."""
    eligible = _collect_eligible_protocols(
        bundle,
        condition_name=condition_name,
        modality_name=modality_name,
        device_name=device_name,
    )
    if not eligible:
        return None
    order = {p["Protocol_ID"]: i for i, p in enumerate(bundle.tables["protocols"])}
    return min(eligible, key=lambda p: order.get(p["Protocol_ID"], 999))


def _validate_tables(tables: dict[str, list[dict[str, str]]]) -> None:
    for dataset_name, expected_count in EXPECTED_COUNTS.items():
        records = tables[dataset_name]
        if len(records) != expected_count:
            raise ClinicalDataValidationError(
                f"{dataset_name} expected {expected_count} records but found {len(records)}."
            )

        primary_key = PRIMARY_KEYS[dataset_name]
        seen: set[str] = set()
        for record in records:
            record_key = record.get(primary_key, "").strip()
            if not record_key:
                raise ClinicalDataValidationError(
                    f"{dataset_name} contains a record without required key {primary_key}."
                )
            if record_key in seen:
                raise ClinicalDataValidationError(
                    f"{dataset_name} contains duplicate key {record_key}."
                )
            seen.add(record_key)

    valid_condition_ids = {row["Condition_ID"] for row in tables["conditions"]}
    valid_phenotype_ids = {row["Phenotype_ID"] for row in tables["phenotypes"]}
    valid_modality_ids = {row["Modality_ID"] for row in tables["modalities"]}
    valid_device_ids = {row["Device_ID"] for row in tables["devices"]}
    valid_evidence_ids = {row["Evidence_Level_ID"] for row in tables["evidence_levels"]}

    for protocol in tables["protocols"]:
        if protocol["Condition_ID"] not in valid_condition_ids:
            raise ClinicalDataValidationError(
                f"Protocol {protocol['Protocol_ID']} references unknown condition {protocol['Condition_ID']}."
            )
        if protocol["Phenotype_ID"] and protocol["Phenotype_ID"] not in valid_phenotype_ids:
            raise ClinicalDataValidationError(
                f"Protocol {protocol['Protocol_ID']} references unknown phenotype {protocol['Phenotype_ID']}."
            )
        if protocol["Modality_ID"] not in valid_modality_ids:
            raise ClinicalDataValidationError(
                f"Protocol {protocol['Protocol_ID']} references unknown modality {protocol['Modality_ID']}."
            )
        if protocol["Device_ID_if_specific"] and protocol["Device_ID_if_specific"] not in valid_device_ids:
            raise ClinicalDataValidationError(
                f"Protocol {protocol['Protocol_ID']} references unknown device {protocol['Device_ID_if_specific']}."
            )
        if protocol["Evidence_Grade"] not in valid_evidence_ids:
            raise ClinicalDataValidationError(
                f"Protocol {protocol['Protocol_ID']} references unknown evidence grade {protocol['Evidence_Grade']}."
            )

    valid_protocol_ids = {row["Protocol_ID"] for row in tables["protocols"]}

    def _active_rule_flag(raw: str) -> bool:
        return raw.strip().lower() in ("y", "yes", "true", "1", "active")

    for rule in tables["personalization_rules"]:
        rid = rule.get("Rule_ID", "").strip()
        if not rid:
            raise ClinicalDataValidationError("personalization_rules contains a record without Rule_ID.")
        cid = rule.get("Condition_ID", "").strip()
        if cid not in valid_condition_ids:
            raise ClinicalDataValidationError(
                f"Personalization rule {rid} references unknown condition {cid}."
            )
        mid = (rule.get("Modality_ID") or "").strip()
        if mid and mid not in valid_modality_ids:
            raise ClinicalDataValidationError(
                f"Personalization rule {rid} references unknown modality {mid}."
            )
        did = (rule.get("Device_ID") or "").strip()
        if did and did not in valid_device_ids:
            raise ClinicalDataValidationError(
                f"Personalization rule {rid} references unknown device {did}."
            )
        pref = (rule.get("Preferred_Protocol_ID") or "").strip()
        if not pref or pref not in valid_protocol_ids:
            raise ClinicalDataValidationError(
                f"Personalization rule {rid} must reference a valid Preferred_Protocol_ID."
            )
        pt = (rule.get("Phenotype_Tag") or "").strip()
        qt = (rule.get("QEEG_Tag") or "").strip()
        cmt = (rule.get("Comorbidity_Tag") or "").strip()
        prt = (rule.get("Prior_Response_Tag") or "").strip()
        if _active_rule_flag(rule.get("Active", "")) and not pt and not qt and not cmt and not prt:
            raise ClinicalDataValidationError(
                f"Personalization rule {rid} is active but has no Phenotype_Tag, QEEG_Tag, Comorbidity_Tag, "
                "or Prior_Response_Tag."
            )
        try:
            delta = int((rule.get("Score_Delta") or "0").strip())
        except ValueError:
            raise ClinicalDataValidationError(
                f"Personalization rule {rid} has non-integer Score_Delta."
            )
        lbl = (rule.get("Rationale_Label") or "").strip()
        if _active_rule_flag(rule.get("Active", "")) and delta != 0 and not lbl:
            raise ClinicalDataValidationError(
                f"Personalization rule {rid} has non-zero Score_Delta but empty Rationale_Label."
            )


def _build_snapshot(file_paths: list[Path], tables: dict[str, list[dict[str, str]]]) -> ClinicalSnapshot:
    source_hash = _build_source_hash(file_paths)
    total_records = sum(len(records) for records in tables.values())
    if total_records != EXPECTED_TOTAL_RECORDS:
        raise ClinicalDataValidationError(
            f"Expected {EXPECTED_TOTAL_RECORDS} total records (sum of EXPECTED_COUNTS) but found {total_records}."
        )
    snapshot_id = f"clinical-{source_hash[:12]}"
    counts_json = json.dumps({name: len(records) for name, records in tables.items()}, sort_keys=True)
    return ClinicalSnapshot(
        snapshot_id=snapshot_id,
        source_hash=source_hash,
        source_root=str(CLINICAL_DATA_ROOT),
        total_records=total_records,
        counts_json=counts_json,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@lru_cache(maxsize=1)
def load_clinical_dataset() -> ClinicalDatasetBundle:
    file_paths = [CLINICAL_DATA_ROOT / filename for filename in DATASET_FILES.values()]
    missing_files = [str(path) for path in file_paths if not path.exists()]
    if missing_files:
        raise ClinicalDataValidationError(
            f"Clinical data import is incomplete. Missing files: {', '.join(missing_files)}"
        )

    tables = {
        dataset_name: _read_csv_records(CLINICAL_DATA_ROOT / filename)
        for dataset_name, filename in DATASET_FILES.items()
    }
    _validate_tables(tables)
    assert_critical_protocol_coverage(tables)
    if os.environ.get("DEEPSYNAPS_PERSONALIZATION_REGISTRY_WARN", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    ):
        from app.services.protocol_personalization import diagnose_personalization_rules

        diag = diagnose_personalization_rules(tables["personalization_rules"])
        flat: list[str] = []
        for k in sorted(diag.keys()):
            for msg in diag[k]:
                flat.append(f"{k}: {msg}")
        if flat:
            warnings.warn(
                "Personalization registry diagnostics (non-fatal): " + "; ".join(flat[:24]),
                UserWarning,
                stacklevel=2,
            )
    snapshot = _build_snapshot(file_paths, tables)
    return ClinicalDatasetBundle(tables=tables, snapshot=snapshot)


def seed_clinical_dataset(session: Session) -> ClinicalSnapshot:
    bundle = load_clinical_dataset()
    existing_snapshot = get_snapshot_by_hash(session, bundle.snapshot.source_hash)
    if existing_snapshot is not None:
        return ClinicalSnapshot(
            snapshot_id=existing_snapshot.snapshot_id,
            source_hash=existing_snapshot.source_hash,
            source_root=existing_snapshot.source_root,
            total_records=existing_snapshot.total_records,
            counts_json=existing_snapshot.counts_json,
            created_at=existing_snapshot.created_at,
        )

    snapshot = upsert_snapshot(
        session,
        snapshot_id=bundle.snapshot.snapshot_id,
        source_hash=bundle.snapshot.source_hash,
        source_root=bundle.snapshot.source_root,
        total_records=bundle.snapshot.total_records,
        counts_json=bundle.snapshot.counts_json,
        created_at=bundle.snapshot.created_at,
    )
    seeded_records: list[dict[str, str]] = []
    for dataset_name, records in bundle.tables.items():
        primary_key = PRIMARY_KEYS[dataset_name]
        source_file = DATASET_FILES[dataset_name]
        for record in records:
            payload_json = json.dumps(record, sort_keys=True)
            seeded_records.append(
                {
                    "dataset_name": dataset_name,
                    "record_key": record[primary_key],
                    "source_file": source_file,
                    "payload_json": payload_json,
                    "content_hash": hashlib.sha256(payload_json.encode("utf-8")).hexdigest(),
                }
            )
    upsert_seed_records(session, snapshot_id=snapshot.snapshot_id, records=seeded_records)
    session.commit()

    CLINICAL_SNAPSHOT_ROOT.mkdir(parents=True, exist_ok=True)
    manifest_path = CLINICAL_SNAPSHOT_ROOT / f"{snapshot.snapshot_id}.json"
    manifest_path.write_text(
        json.dumps(
            {
                "snapshot_id": snapshot.snapshot_id,
                "source_hash": snapshot.source_hash,
                "source_root": snapshot.source_root,
                "total_records": snapshot.total_records,
                "counts": json.loads(snapshot.counts_json),
                "created_at": snapshot.created_at,
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    return bundle.snapshot


def list_devices_from_clinical_data() -> DeviceListResponse:
    bundle = load_clinical_dataset()
    items: list[DeviceRecord] = []
    for device in bundle.tables["devices"]:
        items.append(
            DeviceRecord(
                id=device["Device_ID"],
                name=device["Device_Name"],
                manufacturer=device["Manufacturer"],
                modality=_normalize_modality(device["Modality"]),
                channels=_parse_channels(device["Channels"]),
                use_type=_normalize_use_type(device["Home_vs_Clinic"]),
                regions=_split_values(device["Region"]),
                regulatory_status=_normalize_regulatory_status(device["Regulatory_Status"]),
                summary=device["Official_Indication"] or device["Intended_Use_Text"] or device["Notes"],
                best_for=_split_values(device["Official_Indication"])[:3]
                or _split_values(device["Intended_Use_Text"])[:3],
                constraints=[
                    *(_split_values(device["Contraindications"])[:2]),
                    device["Notes"],
                ],
                sample_data_notice=(
                    "Imported clinical database entry. Regulatory status must be verified against cited sources "
                    "before external use."
                ),
                disclaimers=standard_disclaimers(),
            )
        )

    return DeviceListResponse(
        items=items,
        total=len(items),
        disclaimers=standard_disclaimers(),
    )


def list_evidence_from_clinical_data() -> EvidenceListResponse:
    bundle = load_clinical_dataset()
    conditions = _table_index(bundle, "conditions", "Condition_ID")
    phenotypes = _table_index(bundle, "phenotypes", "Phenotype_ID")
    modalities = _table_index(bundle, "modalities", "Modality_ID")
    devices = _table_index(bundle, "devices", "Device_ID")
    items: list[EvidenceRecord] = []

    for protocol in bundle.tables["protocols"]:
        condition = conditions[protocol["Condition_ID"]]
        phenotype = phenotypes.get(protocol["Phenotype_ID"])
        modality = modalities[protocol["Modality_ID"]]
        linked_device = devices.get(protocol["Device_ID_if_specific"])
        source_urls = [protocol["Source_URL_Primary"], protocol["Source_URL_Secondary"]]
        if linked_device is not None:
            source_urls.extend(
                [linked_device["Source_URL_Primary"], linked_device["Source_URL_Secondary"]]
            )

        items.append(
            EvidenceRecord(
                id=protocol["Protocol_ID"],
                title=protocol["Protocol_Name"],
                condition=condition["Condition_Name"],
                symptom_cluster=(
                    phenotype["Symptom_or_Phenotype_Name"]
                    if phenotype is not None
                    else (_split_values(condition.get("Symptom_Clusters", "")) or [""])[0]
                ),
                modality=_normalize_modality(modality["Modality_Name"]),
                evidence_level=_normalize_evidence_grade(protocol["Evidence_Grade"]),
                regulatory_status=_normalize_regulatory_status(
                    linked_device["Regulatory_Status"] if linked_device is not None else protocol["On_Label_vs_Off_Label"]
                ),
                summary=protocol["Evidence_Summary"],
                evidence_strength=(
                    f"{_normalize_evidence_grade(protocol['Evidence_Grade'])}: {protocol['Evidence_Summary']}"
                ),
                supported_methods=[
                    protocol["Target_Region"],
                    protocol["Session_Duration"],
                    protocol["Monitoring_Requirements"],
                ],
                contraindications=[
                    condition["Contraindication_Alerts"],
                    protocol["Adverse_Event_Monitoring"],
                    *([linked_device["Contraindications"]] if linked_device is not None else []),
                ],
                references=[url for url in source_urls if url],
                related_devices=(
                    [linked_device["Device_Name"]]
                    if linked_device is not None
                    else [
                        device["Device_Name"]
                        for device in bundle.tables["devices"]
                        if _normalize_modality(device["Modality"]) == _normalize_modality(modality["Modality_Name"])
                    ][:3]
                ),
                approved_notes=[
                    f"Patient-facing allowed: {protocol['Patient_Facing_Allowed']}",
                    f"Clinician review required: {protocol['Clinician_Review_Required']}",
                ],
                emerging_notes=[
                    modality["Evidence_Notes"],
                    linked_device["Notes"] if linked_device is not None else condition["Notes"],
                ],
                disclaimers=standard_disclaimers(
                    include_draft=protocol["On_Label_vs_Off_Label"].lower().startswith("off-label"),
                    include_off_label=protocol["On_Label_vs_Off_Label"].lower().startswith("off-label"),
                ),
            )
        )

    return EvidenceListResponse(
        items=items,
        total=len(items),
        disclaimers=standard_disclaimers(),
    )


def generate_protocol_draft_from_clinical_data(
    payload: ProtocolDraftRequest,
    actor: AuthenticatedActor,
) -> ProtocolDraftResponse:
    from app.services.protocol_device_resolution import (
        build_device_resolution_info,
        resolve_device_for_protocol_draft,
    )

    bundle = load_clinical_dataset()
    conditions = _condition_lookup(bundle)
    modalities = _modality_lookup(bundle)

    if payload.off_label and actor.role == "guest":
        governance_rule = _find_governance_rule(bundle, "Off-label protocol requires clinician role")
        raise ApiServiceError(
            code="forbidden_off_label",
            message="Guest users cannot access off-label mode.",
            warnings=[
                governance_rule["Warning_Text"]
                if governance_rule is not None
                else "Off-label pathways require independent clinical review."
            ],
            status_code=403,
        )

    resolved = resolve_device_for_protocol_draft(bundle, payload)
    effective_device = resolved.device_name
    device = resolved.device_row
    device_resolution = build_device_resolution_info(bundle, payload, resolved)

    condition = conditions.get(_condition_key(payload.condition))
    modality = modalities.get(_modality_key(payload.modality))
    if condition is None or modality is None:
        raise ApiServiceError(
            code="unsupported_combination",
            message="The selected protocol inputs are not available in the imported clinical database.",
            warnings=["Verify condition and modality labels against the master clinical dataset."],
        )

    # Eligibility is established (condition/modality in DB, device resolved). Optional qEEG/phenotype
    # hints must only filter/rank among protocol rows already allowed here — never replace registry checks.
    eligible = _collect_eligible_protocols(
        bundle,
        condition_name=payload.condition,
        modality_name=payload.modality,
        device_name=effective_device,
    )
    norm = normalize_personalization_payload(payload)
    personalization_inputs_used = personalization_lists_non_empty(norm)

    structured_rules_applied: list[str] = []
    structured_rule_labels_applied: list[str] = []
    structured_rule_score_total = 0
    structured_rule_matches_by_protocol: dict[str, list[StructuredRuleFire]] = {}
    personalization_why_selected_debug: PersonalizationWhySelectedDebug | None = None

    if not eligible:
        protocol = None
        ranking_factors_applied: list[str] = []
        protocol_ranking_rationale = [
            "No eligible protocol rows for this condition/modality/device in the imported registry "
            "(draft falls back to modality-level defaults)."
        ]
    else:
        failed_ids = resolve_failed_modality_ids(
            list(norm.prior_failed_modalities_norm),
            bundle.tables["modalities"],
        )
        rank_result = select_protocol_among_eligible(
            eligible=eligible,
            protocol_file_index=build_protocol_file_index(bundle.tables["protocols"]),
            phenotypes_by_id=build_phenotypes_by_id(bundle.tables),
            failed_modality_ids=failed_ids,
            norm=norm,
            personalization_rules=bundle.tables["personalization_rules"],
            condition_id=condition["Condition_ID"],
            modality_id=modality["Modality_ID"],
            device_id=device["Device_ID"],
        )
        protocol = rank_result.chosen
        ranking_factors_applied = rank_result.ranking_factors_applied
        protocol_ranking_rationale = rank_result.protocol_ranking_rationale
        structured_rules_applied = rank_result.structured_rules_applied
        structured_rule_labels_applied = rank_result.structured_rule_labels_applied
        structured_rule_score_total = rank_result.structured_rule_score_total
        if payload.include_structured_rule_matches_detail:
            structured_rule_matches_by_protocol = {
                pid: [
                    StructuredRuleFire(
                        rule_id=f.rule_id,
                        score_delta=f.score_delta,
                        rationale_label=f.rationale_label,
                    )
                    for f in fires
                ]
                for pid, fires in rank_result.structured_rule_matches_by_protocol.items()
            }
        if payload.include_personalization_debug:
            personalization_why_selected_debug = PersonalizationWhySelectedDebug.model_validate(
                build_why_selected_debug_projection(rank_result)
            )
    evidence_label = "Emerging"
    target_region = modality["Typical_Target"]
    session_frequency = "Condition-specific cadence requires clinician review."
    duration = "No validated session duration is encoded for this exact combination."
    escalation_logic = [
        "Pause progression when contraindication review is incomplete.",
        "Escalate symptom worsening or tolerability concerns immediately.",
    ]
    monitoring_plan = [
        "Document baseline severity before any session block.",
        "Track adverse effects and functional observations after each session.",
        "Review evidence posture and source traceability before export.",
    ]
    contraindications = [condition["Contraindication_Alerts"], device["Contraindications"]]
    patient_notes = [
        "For professional use only.",
        "Not a substitute for clinician judgment.",
    ]
    approval_badge = "emerging evidence"
    include_draft = False
    include_off_label = False

    if protocol is not None:
        evidence_label = _normalize_evidence_grade(protocol["Evidence_Grade"])
        target_region = protocol["Target_Region"]
        session_frequency = (
            f"{protocol['Sessions_per_Week']} sessions per week / {protocol['Total_Course']}"
        )
        duration = protocol["Session_Duration"]
        escalation_logic.extend(
            [protocol["Escalation_or_Adjustment_Rules"], protocol["Monitoring_Requirements"]]
        )
        monitoring_plan.extend(
            [protocol["Monitoring_Requirements"], protocol["Adverse_Event_Monitoring"]]
        )
        contraindications.extend([protocol["Adverse_Event_Monitoring"]])
        patient_notes.extend(
            [
                f"Patient-facing allowed: {protocol['Patient_Facing_Allowed']}.",
                f"Use type: {protocol['On_Label_vs_Off_Label']}.",
            ]
        )
        if protocol["On_Label_vs_Off_Label"].lower().startswith("on-label"):
            approval_badge = "approved use"
        else:
            approval_badge = "clinician-reviewed draft"
            include_draft = True
            include_off_label = True
    else:
        include_draft = True
        include_off_label = True
        patient_notes.append(
            "No exact protocol row exists in the imported database for this combination; draft support only."
        )
        escalation_logic.append(
            "Escalate to senior clinician review because the protocol is derived from modality and governance data."
        )

    if payload.off_label:
        approval_badge = "off-label"
        include_draft = True
        include_off_label = True
        patient_notes.append("Off-label pathways require independent clinical review before operational use.")

    if include_off_label and approval_badge not in {"off-label", "approved use"}:
        approval_badge = "clinician-reviewed draft"

    return ProtocolDraftResponse(
        rationale=(
            f"{payload.condition} / {payload.modality} / {effective_device} is generated from the imported clinical "
            "database using condition, modality, device, protocol, and governance tables."
        ),
        target_region=target_region,
        session_frequency=session_frequency,
        duration=duration,
        escalation_logic=[item for item in escalation_logic if item],
        monitoring_plan=[item for item in monitoring_plan if item],
        contraindications=[item for item in contraindications if item],
        patient_communication_notes=patient_notes,
        evidence_grade=evidence_label,
        approval_status_badge=approval_badge,  # type: ignore[arg-type]
        off_label_review_required=include_off_label,
        disclaimers=standard_disclaimers(
            include_draft=include_draft,
            include_off_label=include_off_label,
        ),
        device_resolution=device_resolution,
        ranking_factors_applied=ranking_factors_applied,
        personalization_inputs_used=personalization_inputs_used,
        protocol_ranking_rationale=protocol_ranking_rationale,
        structured_rules_applied=structured_rules_applied,
        structured_rule_labels_applied=structured_rule_labels_applied,
        structured_rule_score_total=structured_rule_score_total,
        structured_rule_matches_by_protocol=structured_rule_matches_by_protocol,
        personalization_why_selected_debug=personalization_why_selected_debug,
    )


def generate_handbook_from_clinical_data(
    payload: HandbookGenerateRequest,
    actor: AuthenticatedActor,
) -> HandbookGenerateResponse:
    require_minimum_role(
        actor,
        "clinician",
        warnings=["Handbook generation is reserved for clinician and admin roles."],
    )

    bundle = load_clinical_dataset()
    conditions = _condition_lookup(bundle)
    modalities = _modality_lookup(bundle)
    protocol = _find_protocol_match(
        bundle,
        condition_name=payload.condition,
        modality_name=payload.modality,
        device_name=payload.device or "",
    )
    condition = conditions.get(_condition_key(payload.condition))
    modality = modalities.get(_modality_key(payload.modality))
    if condition is None or modality is None:
        raise ApiServiceError(
            code="unsupported_combination",
            message="Handbook generation requires a condition and modality present in the imported clinical database.",
            warnings=["Verify condition and modality labels against the imported clinical dataset."],
        )

    title_prefix = {
        "clinician_handbook": "Clinician handbook",
        "patient_guide": "Patient guide",
        "technician_sop": "Technician SOP",
    }[payload.handbook_kind]

    references = [
        protocol["Source_URL_Primary"] if protocol is not None else "",
        protocol["Source_URL_Secondary"] if protocol is not None else "",
    ]
    references.extend(
        source["URL"]
        for source in bundle.tables["sources"]
        if source["Use_Case"] and payload.condition.lower().split()[0] in source["Use_Case"].lower()
    )

    document = HandbookDocument(
        document_type=payload.handbook_kind,
        title=f"{title_prefix} for {payload.condition} with {payload.modality}",
        overview=(
            f"{title_prefix} derived from the imported clinical database for {payload.condition} using "
            f"{payload.modality}. Evidence and governance posture are registry-driven."
        ),
        eligibility=[
            f"Population: {condition['Population']}",
            f"Severity: {condition['Severity_Levels']}",
            f"Highest evidence: {condition['Highest_Evidence_Level']}",
        ],
        setup=[
            modality["Delivery_Method"],
            f"Typical target: {modality['Typical_Target']}",
            protocol["Coil_or_Electrode_Placement"] if protocol is not None else "Condition-specific setup requires clinician review.",
        ],
        session_workflow=[
            protocol["Session_Duration"] if protocol is not None else "Session timing must be defined during clinician review.",
            protocol["Monitoring_Requirements"] if protocol is not None else "Monitoring requirements should follow condition and governance constraints.",
            protocol["Escalation_or_Adjustment_Rules"] if protocol is not None else "Escalation rules should be documented before use.",
        ],
        safety=[
            condition["Contraindication_Alerts"],
            modality["Safety_Questions"],
            protocol["Adverse_Event_Monitoring"] if protocol is not None else "Use governance review before any patient-facing export.",
        ],
        troubleshooting=[
            "Verify source traceability for every exported statement.",
            "Re-check device and modality compatibility before activating workflow.",
            "Escalate when imported record review status changes from Reviewed.",
        ],
        escalation=[
            "Escalate unresolved contraindications immediately.",
            "Escalate off-label or emerging-evidence pathways to clinician review.",
            "Escalate missing source traceability before publication or export.",
        ],
        references=[reference for reference in references if reference][:6],
    )
    return HandbookGenerateResponse(
        document=document,
        disclaimers=standard_disclaimers(include_draft=protocol is None),
    )
