from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.services.clinical_data import _read_csv_records, _split_values
from app.settings import CLINICAL_DATA_ROOT

_CONDITIONS_PACKAGES_ROOT = CLINICAL_DATA_ROOT.parents[1] / "conditions"

_CONDITIONS_FILE = "conditions.csv"
_MODALITIES_FILE = "modalities.csv"
_DEVICES_FILE = "devices.csv"
_PROTOCOLS_FILE = "protocols.csv"
_PHENOTYPES_FILE = "phenotypes.csv"
_GOVERNANCE_RULES_FILE = "governance_rules.csv"


# ---------------------------------------------------------------------------
# Raw loaders — cached for the lifetime of the process
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _load_conditions() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _CONDITIONS_FILE)


@lru_cache(maxsize=1)
def _load_modalities() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _MODALITIES_FILE)


@lru_cache(maxsize=1)
def _load_devices() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _DEVICES_FILE)


@lru_cache(maxsize=1)
def _load_protocols() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _PROTOCOLS_FILE)


@lru_cache(maxsize=1)
def _load_phenotypes() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _PHENOTYPES_FILE)


@lru_cache(maxsize=1)
def _load_governance_rules() -> list[dict[str, str]]:
    return _read_csv_records(CLINICAL_DATA_ROOT / _GOVERNANCE_RULES_FILE)


# ---------------------------------------------------------------------------
# Public list functions
# ---------------------------------------------------------------------------

def list_conditions() -> list[dict]:
    return [
        {
            "id": row.get("Condition_ID", ""),
            "name": row.get("Condition_Name", ""),
            "category": row.get("Category", ""),
            "symptom_clusters": row.get("Symptom_Clusters", ""),
            "common_phenotypes": row.get("Common_Phenotypes", ""),
            "severity_levels": row.get("Severity_Levels", ""),
            "population": row.get("Population", ""),
            "relevant_modalities": row.get("Relevant_Modalities", ""),
            "highest_evidence_level": row.get("Highest_Evidence_Level", ""),
            "contraindication_alerts": row.get("Contraindication_Alerts", ""),
            "review_status": row.get("Review_Status", ""),
        }
        for row in _load_conditions()
    ]


def list_modalities() -> list[dict]:
    return [
        {
            "id": row.get("Modality_ID", ""),
            "name": row.get("Modality_Name", ""),
            "category": row.get("Category", ""),
            "invasive": row.get("Invasive_vs_Noninvasive", ""),
            "typical_target": row.get("Typical_Target", ""),
            "delivery_method": row.get("Delivery_Method", ""),
            "common_use_cases": row.get("Common_Use_Cases", ""),
            "evidence_notes": row.get("Evidence_Notes", ""),
            "regulatory_notes": row.get("Regulatory_Notes", ""),
            "safety_questions": row.get("Safety_Questions", ""),
            "review_status": row.get("Review_Status", ""),
        }
        for row in _load_modalities()
    ]


def list_devices() -> list[dict]:
    return [
        {
            "id": row.get("Device_ID", ""),
            "name": row.get("Device_Name", ""),
            "manufacturer": row.get("Manufacturer", ""),
            "modality": row.get("Modality", ""),
            "device_type": row.get("Device_Type", ""),
            "region": row.get("Region", ""),
            "regulatory_status": row.get("Regulatory_Status", ""),
            "regulatory_pathway": row.get("Regulatory_Pathway", ""),
            "official_indication": row.get("Official_Indication", ""),
            "intended_use_text": row.get("Intended_Use_Text", ""),
            "approved_use_only": (row.get("Approved_Use_Only_Flag", "") or "").strip().lower() in {"true", "yes", "1", "y"},
            "home_vs_clinic": row.get("Home_vs_Clinic", ""),
            "contraindications": row.get("Contraindications", ""),
            "adverse_event_notes": row.get("Adverse_Event_Notes", ""),
            "source_url_primary": row.get("Source_URL_Primary", ""),
            "source_url_secondary": row.get("Source_URL_Secondary", ""),
            "market": row.get("Regulatory_Status", ""),  # no Market column — use regulatory status
            "setting": row.get("Home_vs_Clinic", ""),
            "notes": row.get("Notes", ""),
            "review_status": row.get("Review_Status", ""),
            "last_reviewed_at": (row.get("Last_Reviewed", "") or "").strip() or None,
        }
        for row in _load_devices()
    ]


def list_protocols() -> list[dict]:
    return [
        {
            "id": row.get("Protocol_ID", ""),
            "name": row.get("Protocol_Name", ""),
            "condition_id": row.get("Condition_ID", ""),
            "phenotype_id": row.get("Phenotype_ID", ""),
            "modality_id": row.get("Modality_ID", ""),
            "device_id_if_specific": row.get("Device_ID_if_specific", ""),
            "on_label_vs_off_label": row.get("On_Label_vs_Off_Label", ""),
            "evidence_grade": row.get("Evidence_Grade", ""),
            "evidence_summary": row.get("Evidence_Summary", ""),
            "target_region": row.get("Target_Region", ""),
            "laterality": row.get("Laterality", ""),
            "frequency_hz": row.get("Frequency_Hz", ""),
            "intensity": row.get("Intensity", ""),
            "session_duration": row.get("Session_Duration", ""),
            "sessions_per_week": row.get("Sessions_per_Week", ""),
            "total_course": row.get("Total_Course", ""),
            "coil_or_electrode_placement": row.get("Coil_or_Electrode_Placement", ""),
            "monitoring_requirements": row.get("Monitoring_Requirements", ""),
            "contraindication_check_required": row.get("Contraindication_Check_Required", ""),
            "adverse_event_monitoring": row.get("Adverse_Event_Monitoring", ""),
            "escalation_or_adjustment_rules": row.get("Escalation_or_Adjustment_Rules", ""),
            "patient_facing_allowed": row.get("Patient_Facing_Allowed", ""),
            "clinician_review_required": row.get("Clinician_Review_Required", ""),
            "source_url_primary": row.get("Source_URL_Primary", ""),
            "source_url_secondary": row.get("Source_URL_Secondary", ""),
            "notes": row.get("Notes", ""),
            "review_status": row.get("Review_Status", ""),
        }
        for row in _load_protocols()
    ]


def list_phenotypes() -> list[dict]:
    return [
        {
            "id": row.get("Phenotype_ID", ""),
            "name": row.get("Symptom_or_Phenotype_Name", ""),
            "domain": row.get("Domain", ""),
            "description": row.get("Description", ""),
            "associated_conditions": row.get("Associated_Conditions", ""),
            "possible_target_regions": row.get("Possible_Target_Regions", ""),
            "candidate_modalities": row.get("Candidate_Modalities", ""),
            "evidence_level": row.get("Evidence_Level", ""),
            "assessment_inputs_needed": row.get("Assessment_Inputs_Needed", ""),
            "review_status": row.get("Review_Status", ""),
        }
        for row in _load_phenotypes()
    ]


def list_governance_rules() -> list[dict]:
    return [
        {
            "id": row.get("Rule_ID", ""),
            "name": row.get("Rule_Name", ""),
            "applies_to": row.get("Applies_To", ""),
            "rule_logic": row.get("Rule_Logic", ""),
            "user_role_required": row.get("User_Role_Required", ""),
            "export_allowed": row.get("Export_Allowed", ""),
            "warning_text": row.get("Warning_Text", ""),
            "notes": row.get("Notes", ""),
        }
        for row in _load_governance_rules()
    ]


# ---------------------------------------------------------------------------
# Single-item and filtered lookups
# ---------------------------------------------------------------------------

def get_condition(condition_id: str) -> dict | None:
    return next(
        (c for c in list_conditions() if c["id"] == condition_id),
        None,
    )


def get_protocol(protocol_id: str) -> dict | None:
    return next(
        (p for p in list_protocols() if p["id"] == protocol_id),
        None,
    )


def get_protocols_for_condition(condition_id: str) -> list[dict]:
    return [p for p in list_protocols() if p["condition_id"] == condition_id]


def get_condition_package(slug: str) -> dict | None:
    """Load the full condition JSON package from data/conditions/{slug}.json."""
    path = _CONDITIONS_PACKAGES_ROOT / f"{slug}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_condition_package_slugs() -> list[str]:
    """Return slugs of all available condition packages."""
    if not _CONDITIONS_PACKAGES_ROOT.exists():
        return []
    return sorted(p.stem for p in _CONDITIONS_PACKAGES_ROOT.glob("*.json"))


def get_phenotypes_for_condition(condition_id: str) -> list[dict]:
    """Return phenotypes whose Associated_Conditions field contains condition_id."""
    results = []
    for ph in list_phenotypes():
        associated = ph.get("associated_conditions", "")
        ids = _split_values(associated)
        if condition_id in ids or condition_id in associated:
            results.append(ph)
    return results
