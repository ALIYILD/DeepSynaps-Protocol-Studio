from __future__ import annotations

import csv
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from deepsynaps_core_schema import (
    DeviceListResponse,
    DeviceRecord,
    EvidenceListResponse,
    EvidenceRecord,
    HandbookDocument,
    HandbookGenerateRequest,
    HandbookGenerateResponse,
    ProtocolDraftRequest,
    ProtocolDraftResponse,
)

from app.auth import AuthenticatedActor, require_minimum_role
from app.errors import ApiServiceError
from app.registries.shared import standard_disclaimers
from app.repositories.clinical import get_snapshot_by_hash, upsert_seed_records, upsert_snapshot
from app.settings import CLINICAL_DATA_ROOT, CLINICAL_SNAPSHOT_ROOT


EXPECTED_COUNTS = {
    "evidence_levels": 4,
    "governance_rules": 12,
    "modalities": 12,
    "devices": 19,
    "conditions": 20,
    "phenotypes": 30,
    "assessments": 42,
    "protocols": 32,
    "sources": 30,
}

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
}

TEXT_REPLACEMENTS = {
    "\u2014": "-",
    "\u2013": "-",
    "â€”": "-",
    "â€“": "-",
    "â‰¥": ">=",
    "â‰¤": "<=",
    "â€™": "'",
    "â€˜": "'",
    "â€œ": '"',
    "â€": '"',
    "â€¢": "-",
    "Â": "",
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


def _read_csv_records(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [
            {
                key: _clean_text(value)
                for key, value in dict(row).items()
            }
            for row in csv.DictReader(handle)
        ]


def _clean_text(value: str) -> str:
    cleaned = value
    for source, target in TEXT_REPLACEMENTS.items():
        cleaned = cleaned.replace(source, target)
    return cleaned.strip()


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
    if "rtms" in lowered or "itbs" in lowered or "tms" in lowered:
        return "TMS"
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
    return {
        _condition_key(condition["Condition_Name"]): condition for condition in bundle.tables["conditions"]
    }


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


def _find_protocol_match(
    bundle: ClinicalDatasetBundle,
    *,
    condition_name: str,
    modality_name: str,
    device_name: str,
) -> dict[str, str] | None:
    conditions = _condition_lookup(bundle)
    modalities = _modality_lookup(bundle)
    devices_by_id = _table_index(bundle, "devices", "Device_ID")
    condition = conditions.get(_condition_key(condition_name))
    modality = modalities.get(_modality_key(modality_name))
    if condition is None or modality is None:
        return None

    device_lookup = _device_name_lookup(bundle)
    requested_device = device_lookup.get(_normalize_text_key(device_name)) if device_name else None
    for protocol in bundle.tables["protocols"]:
        if protocol["Condition_ID"] != condition["Condition_ID"]:
            continue
        if protocol["Modality_ID"] != modality["Modality_ID"]:
            continue
        if not protocol["Device_ID_if_specific"]:
            return protocol
        device = devices_by_id.get(protocol["Device_ID_if_specific"])
        if device is not None and requested_device is not None and device["Device_ID"] == requested_device["Device_ID"]:
            return protocol
    return None


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


def _build_snapshot(file_paths: list[Path], tables: dict[str, list[dict[str, str]]]) -> ClinicalSnapshot:
    source_hash = _build_source_hash(file_paths)
    total_records = sum(len(records) for records in tables.values())
    if total_records != 201:
        raise ClinicalDataValidationError(f"Expected 201 total records but found {total_records}.")
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
                    else _split_values(condition["Symptom_Clusters"])[0]
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
    bundle = load_clinical_dataset()
    conditions = _condition_lookup(bundle)
    modalities = _modality_lookup(bundle)
    devices = _device_name_lookup(bundle)
    condition = conditions.get(_condition_key(payload.condition))
    modality = modalities.get(_modality_key(payload.modality))
    device = devices.get(_normalize_text_key(payload.device))

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

    if condition is None or modality is None or device is None:
        raise ApiServiceError(
            code="unsupported_combination",
            message="The selected protocol inputs are not available in the imported clinical database.",
            warnings=["Verify condition, modality, and device selections against the master clinical dataset."],
        )

    if _modality_key(device["Modality"]) != _modality_key(payload.modality):
        raise ApiServiceError(
            code="unsupported_combination",
            message="The selected device does not match the selected modality in the imported clinical database.",
            warnings=["Choose a device aligned to the requested modality."],
        )

    protocol = _find_protocol_match(
        bundle,
        condition_name=payload.condition,
        modality_name=payload.modality,
        device_name=payload.device,
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
            f"{payload.condition} / {payload.modality} / {payload.device} is generated from the imported clinical "
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
        device_name="",
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
