from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


_BANDS: tuple[str, ...] = ("delta", "theta", "alpha", "beta", "gamma")

# Canonical region groupings for 10-20 channels.
_REGIONS: dict[str, tuple[str, ...]] = {
    "frontal": ("Fp1", "Fp2", "F7", "F3", "Fz", "F4", "F8"),
    "central": ("C3", "Cz", "C4"),
    "temporal": ("T7", "T8"),
    "parietal": ("P7", "P3", "Pz", "P4", "P8"),
    "occipital": ("O1", "O2"),
}


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return float(sum(values) / len(values))


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f


def _get(d: Any, *keys: str) -> Any:
    cur: Any = d
    for k in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(k)
    return cur


@dataclass(frozen=True)
class FeatureVector:
    """Compact, auditable feature view for the protocol recommender."""

    # Per-region mean z-scores for each band (absolute power).
    region_band_z: dict[str, dict[str, float]] = field(default_factory=dict)
    # FAA (ln(F4)-ln(F3)) as computed in pipeline features.
    frontal_alpha_asymmetry_f3_f4: float | None = None
    # Theta/Beta ratio (global mean relative theta / global mean relative beta).
    theta_beta_ratio: float | None = None
    # Individual alpha peak frequency (mean across channels where available).
    iapf_hz: float | None = None
    # Alpha coherence regional summaries (mean within/between region pairs).
    alpha_coherence: dict[str, float] = field(default_factory=dict)
    # Condition likelihoods (risk scores etc.) pass-through when available.
    condition_likelihoods: dict[str, float] = field(default_factory=dict)


def summarize_for_recommender(pipeline_result: Any) -> FeatureVector:
    """Summarise a qEEG pipeline result into a recommender-ready vector.

    Parameters
    ----------
    pipeline_result:
        Either a ``PipelineResult`` instance or a dict containing compatible
        keys (``features``, ``zscores``, ``risk_scores``).
    """
    # Accept PipelineResult dataclass or plain dicts.
    features = getattr(pipeline_result, "features", None)
    if features is None and isinstance(pipeline_result, dict):
        features = pipeline_result.get("features")
    zscores = getattr(pipeline_result, "zscores", None)
    if zscores is None and isinstance(pipeline_result, dict):
        zscores = pipeline_result.get("zscores")
    risk_scores = getattr(pipeline_result, "risk_scores", None)
    if risk_scores is None and isinstance(pipeline_result, dict):
        risk_scores = pipeline_result.get("risk_scores")

    features = features if isinstance(features, dict) else {}
    zscores = zscores if isinstance(zscores, dict) else {}
    risk_scores = risk_scores if isinstance(risk_scores, dict) else {}

    region_band_z: dict[str, dict[str, float]] = {}
    for region, channels in _REGIONS.items():
        region_band_z[region] = {}
        for band in _BANDS:
            ch_z = _get(zscores, "spectral", "bands", band, "absolute_uv2") or {}
            if not isinstance(ch_z, dict):
                continue
            vals: list[float] = []
            for ch in channels:
                z = _safe_float(ch_z.get(ch))
                if z is not None:
                    vals.append(z)
            m = _mean(vals)
            if m is not None:
                region_band_z[region][band] = m

    faa = _safe_float(_get(features, "asymmetry", "frontal_alpha_F3_F4"))

    # Global mean relative band powers for TBR.
    rel_theta = _get(features, "spectral", "bands", "theta", "relative") or {}
    rel_beta = _get(features, "spectral", "bands", "beta", "relative") or {}
    t_vals = [_safe_float(v) for v in rel_theta.values()] if isinstance(rel_theta, dict) else []
    b_vals = [_safe_float(v) for v in rel_beta.values()] if isinstance(rel_beta, dict) else []
    t = _mean([v for v in t_vals if v is not None]) if t_vals else None
    b = _mean([v for v in b_vals if v is not None]) if b_vals else None
    tbr = None
    if t is not None and b not in (None, 0.0):
        tbr = float(t) / float(b)

    paf_map = _get(features, "spectral", "peak_alpha_freq") or {}
    paf_vals = [_safe_float(v) for v in paf_map.values()] if isinstance(paf_map, dict) else []
    iapf = _mean([v for v in paf_vals if v is not None]) if paf_vals else None

    # Alpha coherence: compute mean coherence within each region (upper triangle)
    alpha_coh: dict[str, float] = {}
    coh = _get(features, "connectivity", "coherence", "alpha")
    chs = _get(features, "connectivity", "channels")
    if isinstance(coh, list) and isinstance(chs, list) and len(coh) == len(chs):
        idx = {str(ch): i for i, ch in enumerate(chs)}

        def mean_within(region_name: str) -> float | None:
            cs = [c for c in _REGIONS[region_name] if c in idx]
            if len(cs) < 2:
                return None
            vals2: list[float] = []
            for i in range(len(cs)):
                for j in range(i + 1, len(cs)):
                    a, b2 = idx[cs[i]], idx[cs[j]]
                    try:
                        v = _safe_float(coh[a][b2])
                    except Exception:
                        v = None
                    if v is not None:
                        vals2.append(v)
            return _mean(vals2)

        for region in _REGIONS:
            m = mean_within(region)
            if m is not None:
                alpha_coh[f"alpha_coherence_within_{region}"] = m

    # Condition likelihoods (risk_scores dict may be {label:{score:...}}).
    cond_like: dict[str, float] = {}
    if isinstance(risk_scores, dict):
        for k, v in risk_scores.items():
            if isinstance(v, dict) and "score" in v:
                s = _safe_float(v.get("score"))
                if s is not None:
                    cond_like[str(k)] = s

    return FeatureVector(
        region_band_z=region_band_z,
        frontal_alpha_asymmetry_f3_f4=faa,
        theta_beta_ratio=tbr,
        iapf_hz=iapf,
        alpha_coherence=alpha_coh,
        condition_likelihoods=cond_like,
    )

