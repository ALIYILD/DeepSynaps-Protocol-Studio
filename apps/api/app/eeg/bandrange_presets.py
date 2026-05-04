"""Editable bandrange presets (Hz) for FIR band-pass and Spectra/ERD alignment."""

from __future__ import annotations

from typing import Any

# Canonical bands — clinicians override bounds via Setup → EEG Bandranges (stored client-side + API stub).
DEFAULT_BANDRANGES: dict[str, tuple[float, float]] = {
    "Delta": (1.0, 4.0),
    "Theta": (4.0, 8.0),
    "Alpha": (8.0, 13.0),
    "Beta1": (13.0, 20.0),
    "Beta2": (20.0, 30.0),
    "Gamma": (30.0, 45.0),
    "User1": (18.0, 22.0),
    "User2": (30.0, 40.0),
    "Clinical1": (6.0, 10.0),
    "Clinical2": (12.0, 24.0),
}

# Resolution presets (Hz) — narrows transition / lengthens FIR
RESOLUTION_1_HZ = "1hz"
RESOLUTION_2_HZ = "2hz"
RESOLUTION_DATABASE = "database"


def merge_user_overrides(
    base: dict[str, tuple[float, float]] | None = None,
    overrides: dict[str, tuple[float, float]] | None = None,
) -> dict[str, tuple[float, float]]:
    out = dict(base or DEFAULT_BANDRANGES)
    if overrides:
        for k, v in overrides.items():
            if (
                isinstance(v, (tuple, list))
                and len(v) == 2
                and isinstance(v[0], (int, float))
                and isinstance(v[1], (int, float))
            ):
                out[str(k)] = (float(v[0]), float(v[1]))
    return out


def preset_to_payload() -> list[dict[str, Any]]:
    return [
        {"id": k, "lowHz": v[0], "highHz": v[1]}
        for k, v in sorted(DEFAULT_BANDRANGES.items(), key=lambda x: x[0])
    ]
