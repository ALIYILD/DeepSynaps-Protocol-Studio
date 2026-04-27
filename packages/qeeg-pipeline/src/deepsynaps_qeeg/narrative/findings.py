from __future__ import annotations

from typing import Any

from .types import Finding


def _severity_for_z(z: float) -> str | None:
    az = abs(float(z))
    if az >= 2.0:
        return "significant"
    if az >= 1.5:
        return "borderline"
    return None


def _direction_for_z(z: float) -> str:
    zf = float(z)
    if abs(zf) < 1e-9:
        return "normal"
    return "elevated" if zf > 0 else "reduced"


def _band_from_metric(metric_path: str) -> str:
    # e.g. "spectral.bands.alpha.absolute_uv2" -> "alpha"
    parts = (metric_path or "").split(".")
    try:
        i = parts.index("bands")
        return parts[i + 1]
    except Exception:
        return "unspecified"


def _value_from_result(features: dict[str, Any] | None, metric_path: str, region: str) -> float | None:
    if not features or not metric_path:
        return None
    parts = metric_path.split(".")
    # supported paths:
    # - spectral.bands.<band>.<metric_key>   (channel in dict)
    # - aperiodic.slope                      (channel in dict under spectral.aperiodic.slope)
    try:
        if parts[0] == "spectral" and len(parts) >= 4 and parts[1] == "bands":
            band = parts[2]
            metric_key = parts[3]
            bands = (features.get("spectral") or {}).get("bands") or {}
            payload = (bands.get(band) or {}).get(metric_key) or {}
            if isinstance(payload, dict):
                v = payload.get(region)
                return float(v) if v is not None else None
        if parts[0] == "aperiodic" and parts[1] == "slope":
            slopes = ((features.get("spectral") or {}).get("aperiodic") or {}).get("slope") or {}
            if isinstance(slopes, dict):
                v = slopes.get(region)
                return float(v) if v is not None else None
    except Exception:
        return None
    return None


def extract_findings(pipeline_result: Any) -> list[Finding]:
    """Extract de-identified findings from a pipeline result.

    Input
    -----
    pipeline_result : PipelineResult | dict-like
        Must expose `.zscores` and `.features` (or dict keys).

    Output
    ------
    list[Finding]
        Findings filtered to borderline/significant by z thresholds:
        - |z| >= 2.0: significant
        - 1.5 <= |z| < 2.0: borderline
    """
    zscores = getattr(pipeline_result, "zscores", None)
    if zscores is None and isinstance(pipeline_result, dict):
        zscores = pipeline_result.get("zscores")
    features = getattr(pipeline_result, "features", None)
    if features is None and isinstance(pipeline_result, dict):
        features = pipeline_result.get("features")

    flagged = (zscores or {}).get("flagged") or []
    out: list[Finding] = []

    for row in flagged:
        if not isinstance(row, dict):
            continue
        metric_path = str(row.get("metric") or "")
        region = str(row.get("channel") or row.get("region") or "unspecified")
        try:
            z = float(row.get("z"))
        except Exception:
            continue

        severity = _severity_for_z(z)
        if severity is None:
            continue
        band = _band_from_metric(metric_path)
        value = _value_from_result(features, metric_path, region)
        out.append(
            Finding(
                region=region,
                band=band,
                metric=metric_path,
                value=value,
                z=z,
                direction=_direction_for_z(z),
                severity=severity,  # type: ignore[arg-type]
            )
        )

    # deterministic ordering: significant first, then by |z| desc
    sev_rank = {"significant": 0, "borderline": 1}
    out.sort(key=lambda f: (sev_rank.get(f.severity, 9), -abs(f.z), f.metric, f.region))
    return out


__all__ = ["extract_findings"]

