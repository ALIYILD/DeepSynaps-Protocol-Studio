"""Atlas helpers — approximate ROI labels from MNI coordinates (fallback without full AAL table)."""

from __future__ import annotations

from typing import Any


def approximate_label(mni_xyz_mm: tuple[float, float, float]) -> dict[str, str | float]:
    """Rough anatomical bucket for AI/copilot copy (not a substitute for atlas lookup)."""
    x, y, z = mni_xyz_mm
    lat = "Right" if x > 2 else "Left" if x < -2 else "Midline"
    if z > 45 and abs(y) < 40:
        region = "Posterior parietal / precuneus vicinity"
    elif z > 25 and abs(y) > 40:
        region = "Temporal / TPJ vicinity"
    elif z > 35:
        region = "Centro-parietal vicinity"
    else:
        region = "Temporal/inferior vicinity"
    brodmann_guess = "5–7 / 39–40 (approx)" if abs(y) > 35 else "40 (approx)"
    return {
        "laterality": lat,
        "regionGuess": region,
        "brodmannGuess": brodmann_guess,
        "confidence": 0.35,
    }


def roi_rows_from_peaks(
    peaks: list[dict[str, Any]],
    *,
    z_norm: list[float] | None = None,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for i, p in enumerate(peaks):
        mni = p.get("mniMm") or [0, 0, 0]
        lab = approximate_label((float(mni[0]), float(mni[1]), float(mni[2])))
        rows.append(
            {
                "rank": i + 1,
                "peakMm": mni,
                "labelGuess": lab["regionGuess"],
                "laterality": lab["laterality"],
                "brodmannGuess": lab["brodmannGuess"],
                "value": p.get("value"),
                "zVsNorm": z_norm[i] if z_norm and i < len(z_norm) else None,
            }
        )
    return rows
