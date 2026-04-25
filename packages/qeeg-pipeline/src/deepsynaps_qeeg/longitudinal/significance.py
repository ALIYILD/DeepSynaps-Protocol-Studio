"""Statistical/clinical significance heuristics for longitudinal change.

Implements a lightweight Reliable Change Index (RCI) using bundled normative
variance estimates. This is *not* a diagnostic claim—it's a screening flag to
highlight changes that exceed what we'd expect from measurement noise + normal
population variability.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

from .compare import ComparisonResult


@dataclass(frozen=True)
class RCIFlag:
    metric: str
    band: str | None
    channel: str | None
    rci: float
    clinically_meaningful: bool


@dataclass(frozen=True)
class RCIResult:
    """RCI values and clinically-meaningful flags for a comparison."""

    flags: list[RCIFlag]
    alpha: float = 0.05
    threshold: float = 1.96

    def to_dict(self) -> dict[str, Any]:
        return {"alpha": self.alpha, "threshold": self.threshold, "flags": [asdict(f) for f in self.flags]}


# Bundled "normative" variance estimates for summary metrics.
# These are intentionally conservative placeholders until a real norms package
# is wired in. Values are in the natural units of each metric.
_VARIANCE = {
    # z-scores are standardized by definition
    "z": 1.0,
    # peak alpha frequency, Hz (typical SD ~0.5 Hz)
    "iapf_hz": 0.25,
    # theta/beta ratio (typical SD ~0.4)
    "tbr": 0.16,
    # mean absolute connectivity edge difference (typical SD ~0.1)
    "connectivity_mean_abs_edge_delta": 0.01,
}


def rci_for_comparison(comp: ComparisonResult, *, threshold: float = 1.96) -> RCIResult:
    """Compute RCI flags for key longitudinal metrics.

    Notes
    -----
    We use: RCI = Δ / sqrt(2σ²) with a bundled variance estimate σ².
    When z-score deltas are available, σ²=1.
    """
    flags: list[RCIFlag] = []

    # Per-channel z-deltas (absolute band power) are the most interpretable for change maps
    for band, payload in ((comp.spectral or {}).get("bands") or {}).items():
        zabs = (payload or {}).get("z_absolute_uv2") or {}
        for ch, entry in (zabs.items() if isinstance(zabs, dict) else []):
            d = _to_float((entry or {}).get("delta"))
            if d is None:
                continue
            rci = _rci(d, _VARIANCE["z"])
            flags.append(
                RCIFlag(
                    metric="spectral.z_absolute_uv2.delta",
                    band=str(band),
                    channel=str(ch),
                    rci=rci,
                    clinically_meaningful=abs(rci) >= float(threshold),
                )
            )

    # Global metrics
    if comp.iapf_shift_hz is not None:
        rci = _rci(float(comp.iapf_shift_hz), _VARIANCE["iapf_hz"])
        flags.append(
            RCIFlag(
                metric="iapf_shift_hz",
                band=None,
                channel=None,
                rci=rci,
                clinically_meaningful=abs(rci) >= float(threshold),
            )
        )
    if comp.tbr_delta is not None:
        rci = _rci(float(comp.tbr_delta), _VARIANCE["tbr"])
        flags.append(
            RCIFlag(
                metric="tbr_delta",
                band=None,
                channel=None,
                rci=rci,
                clinically_meaningful=abs(rci) >= float(threshold),
            )
        )

    # Connectivity summary (mean abs edge delta per band/method)
    for method in ("wpli", "coherence"):
        m = (comp.connectivity or {}).get(method) or {}
        for band, entry in (m.items() if isinstance(m, dict) else []):
            d = _to_float((entry or {}).get("mean_abs_edge_delta"))
            if d is None:
                continue
            rci = _rci(d, _VARIANCE["connectivity_mean_abs_edge_delta"])
            flags.append(
                RCIFlag(
                    metric=f"connectivity.{method}.mean_abs_edge_delta",
                    band=str(band),
                    channel=None,
                    rci=rci,
                    clinically_meaningful=abs(rci) >= float(threshold),
                )
            )

    return RCIResult(flags=flags, threshold=float(threshold))


def _rci(delta: float, variance: float) -> float:
    var = float(variance)
    if not math.isfinite(delta) or not math.isfinite(var) or var <= 0:
        return float("nan")
    sdiff = math.sqrt(2.0 * var)
    return float(delta / sdiff) if sdiff > 0 else float("nan")


def _to_float(v: Any) -> float | None:
    try:
        if v is None:
            return None
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None

