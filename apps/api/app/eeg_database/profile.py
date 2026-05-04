"""Typed-ish defaults + deep-merge for ``Patient.eeg_studio_profile_json``."""

from __future__ import annotations

import copy
import json
from typing import Any


def default_profile() -> dict[str, Any]:
    """Full WinEEG-fidelity shape (sparse defaults — UI fills the rest)."""
    return {
        "identification": {
            "firstName": "",
            "lastName": "",
            "patronymic": "",
            "externalPatientId": "",
            "dateOfBirth": "",
            "sex": "",
            "handedness": "",
        },
        "clinical": {
            "diagnosisIcdCode": "",
            "diagnosisLabel": "",
            "referringPhysician": "",
            "referringDepartment": "",
            "reasonForExamination": "",
            "medications": [],
            "sleepLastNightHours": None,
            "caffeineYN": None,
            "clinicalNotes": "",
        },
        "recordingDefaults": {
            "operator": "",
            "equipment": "",
            "samplingRateHz": None,
            "calibrationFile": "",
            "electrodeCapModel": "",
            "impedanceLog": None,
        },
        "anthropometric": {
            "heightCm": None,
            "weightKg": None,
            "headCircumferenceCm": None,
            "inionNasionMm": None,
            "earToEarMm": None,
        },
        "demographic": {
            "education": "",
            "occupation": "",
            "nativeLanguage": "",
        },
    }


def parse_profile(raw: str | None) -> dict[str, Any]:
    if not raw or not raw.strip():
        return default_profile()
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return default_profile()
        return deep_merge(default_profile(), data)
    except json.JSONDecodeError:
        return default_profile()


def dumps_profile(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in patch.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def build_search_blob(patient_row: Any, profile: dict[str, Any]) -> str:
    """Concatenate patient + profile text for ILIKE search."""
    parts: list[str] = [
        getattr(patient_row, "first_name", "") or "",
        getattr(patient_row, "last_name", "") or "",
        getattr(patient_row, "notes", "") or "",
        getattr(patient_row, "primary_condition", "") or "",
        str(profile.get("clinical") or ""),
        str(profile.get("identification") or ""),
    ]
    return " ".join(parts).lower()
