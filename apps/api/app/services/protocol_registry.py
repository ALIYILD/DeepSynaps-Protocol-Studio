"""Protocol registry service.

Loads protocols.csv and exposes protocol lookup by condition+modality
combination.  All CSV access reuses _read_csv_records from clinical_data so
the same encoding-clean helpers apply.
"""
from __future__ import annotations

import re
from functools import lru_cache

from app.services.clinical_data import _read_csv_records
from app.settings import CLINICAL_DATA_ROOT

_PROTOCOLS_FILE = "protocols.csv"


# ---------------------------------------------------------------------------
# Internal loader (cached for the lifetime of the process)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _load_protocols() -> list[dict[str, str]]:
    path = CLINICAL_DATA_ROOT / _PROTOCOLS_FILE
    if not path.exists():
        return []
    return _read_csv_records(path)


# ---------------------------------------------------------------------------
# Numeric parsing helper
# ---------------------------------------------------------------------------

def _parse_int(text: str, default: int) -> int:
    """Extract the first integer from a text field.

    Examples
    --------
    "20-30 sessions over 4-6 weeks" -> 20
    "5 (daily weekday)"             -> 5
    "37.5 minutes"                  -> 37
    """
    m = re.search(r'\d+', str(text))
    return int(m.group()) if m else default


# ---------------------------------------------------------------------------
# Public lookup functions
# ---------------------------------------------------------------------------

def get_protocol_by_ids(condition_id: str, modality_id: str) -> dict | None:
    """Find the best matching protocol for a condition+modality combination.

    Returns the first protocol row whose Condition_ID and Modality_ID match.
    Protocols without a specific device restriction are preferred; if only
    device-specific protocols exist the first match is still returned.
    """
    protocols = _load_protocols()
    # Prefer protocols with no device restriction first
    for protocol in protocols:
        if (
            protocol.get("Condition_ID") == condition_id
            and protocol.get("Modality_ID") == modality_id
            and not protocol.get("Device_ID_if_specific")
        ):
            return protocol
    # Fall back to device-specific protocols
    for protocol in protocols:
        if (
            protocol.get("Condition_ID") == condition_id
            and protocol.get("Modality_ID") == modality_id
        ):
            return protocol
    return None


def get_protocol_parameters(protocol_id: str) -> dict | None:
    """Get full protocol parameters by Protocol_ID."""
    protocols = _load_protocols()
    for protocol in protocols:
        if protocol.get("Protocol_ID") == protocol_id:
            return build_course_structure_from_protocol(protocol)
    return None


def build_course_structure_from_protocol(protocol: dict) -> dict:
    """Convert a protocol CSV row into a normalised course-structure dict.

    All numeric fields are parsed from potentially verbose text values so that
    callers receive clean integers rather than raw strings.

    Parameters
    ----------
    protocol:
        A raw CSV row dict from protocols.csv.

    Returns
    -------
    dict with keys:
        total_sessions, sessions_per_week, session_duration_minutes,
        frequency_hz, intensity, target_region, laterality, coil_placement,
        monitoring_requirements, adverse_event_monitoring, escalation_rules,
        evidence_grade, on_label, clinician_review_required,
        patient_facing_allowed, protocol_id, protocol_name.
    """
    raw_total = protocol.get("Total_Course", "")
    raw_per_week = protocol.get("Sessions_per_Week", "")
    raw_duration = protocol.get("Session_Duration", "")

    on_label_raw = protocol.get("On_Label_vs_Off_Label", "")
    on_label = on_label_raw.lower().startswith("on-label")

    clinician_review_raw = protocol.get("Clinician_Review_Required", "")
    clinician_review_required = clinician_review_raw.strip().lower() == "yes"

    patient_facing_raw = protocol.get("Patient_Facing_Allowed", "")
    patient_facing_allowed = patient_facing_raw.strip().lower().startswith("yes")

    return {
        "protocol_id": protocol.get("Protocol_ID", ""),
        "protocol_name": protocol.get("Protocol_Name", ""),
        "total_sessions": _parse_int(raw_total, default=20),
        "sessions_per_week": _parse_int(raw_per_week, default=5),
        "session_duration_minutes": _parse_int(raw_duration, default=40),
        "frequency_hz": protocol.get("Frequency_Hz", ""),
        "intensity": protocol.get("Intensity", ""),
        "target_region": protocol.get("Target_Region", ""),
        "laterality": protocol.get("Laterality", ""),
        "coil_placement": protocol.get("Coil_or_Electrode_Placement", ""),
        "monitoring_requirements": protocol.get("Monitoring_Requirements", ""),
        "adverse_event_monitoring": protocol.get("Adverse_Event_Monitoring", ""),
        "escalation_rules": protocol.get("Escalation_or_Adjustment_Rules", ""),
        "evidence_grade": protocol.get("Evidence_Grade", ""),
        "on_label": on_label,
        "clinician_review_required": clinician_review_required,
        "patient_facing_allowed": patient_facing_allowed,
    }
