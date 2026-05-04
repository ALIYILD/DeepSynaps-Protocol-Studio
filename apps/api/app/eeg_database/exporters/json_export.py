"""JSON metadata export for a recording row."""

from __future__ import annotations

import json
from typing import Any


def recording_meta_bundle(recording_dict: dict[str, Any], patient_card: dict[str, Any] | None) -> bytes:
    out = {
        "recording": recording_dict,
        "patientCard": patient_card,
        "format": "deepsynaps.eeg_database.export.v1",
    }
    return json.dumps(out, ensure_ascii=False, indent=2).encode("utf-8")
