"""Condition similarity indices — NOT diagnostic probabilities.

Implements CONTRACT_V2.md §1 ``risk_scores`` output:

* Six ``*_like`` labels: ``mdd_like``, ``adhd_like``, ``anxiety_like``,
  ``cognitive_decline_like``, ``tbi_residual_like``, ``insomnia_like``
* Each entry ``{"score": 0..1, "ci95": [lo, hi]}``
* A mandatory ``disclaimer`` field stressing the research/wellness
  posture

Heavy path
----------
When a PyTorch classifier head is available the real implementation
performs MC-dropout (n=50) forward passes to get a mean + CI95. The
model path can be injected via ``model_path``.

Stub path
---------
Deterministic scores seeded from ``hash(embedding + features)`` with
well-known qEEG biomarker priors baked in:

* High frontal alpha asymmetry → bumps ``mdd_like``
* High theta/beta → bumps ``adhd_like``
* Elevated posterior alpha → bumps ``anxiety_like``
* Reduced PAF → bumps ``cognitive_decline_like``
* Elevated frontal delta → bumps ``tbi_residual_like``
* Reduced sleep spindles → bumps ``insomnia_like``
"""
from __future__ import annotations

import hashlib
import logging
import math
import random
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

try:
    import torch  # noqa: F401

    HAS_TORCH = True
except Exception:  # pragma: no cover - import guard
    HAS_TORCH = False


LABELS: tuple[str, ...] = (
    "mdd_like",
    "adhd_like",
    "anxiety_like",
    "cognitive_decline_like",
    "tbi_residual_like",
    "insomnia_like",
)

DISCLAIMER: str = (
    "Neurophysiological similarity indices for research/wellness use only. "
    "NOT diagnostic."
)


# -------------------------------------------------------------------- api
def compute_risk_scores(
    embedding: list[float],
    features: dict[str, Any],
    *,
    chronological_age: int | None = None,
    model_path: Path | None = None,
    deterministic_seed: int | None = None,
) -> dict[str, Any]:
    """Return the ``risk_scores`` payload for CONTRACT_V2 §1.

    Parameters
    ----------
    embedding : list of float
        LaBraM-style embedding (200-dim typical).
    features : dict
        Full feature dict per CONTRACT.md §1.1. Used by the stub path to
        apply biomarker priors.
    chronological_age : int, optional
        Patient age — baked into the CI of cognitive-decline-like.
    model_path : Path, optional
        Filesystem path to a torch checkpoint. Only used when
        ``HAS_TORCH`` is True.
    deterministic_seed : int, optional
        Overrides the hash-derived seed for reproducible testing.

    Returns
    -------
    dict
        ``{"mdd_like": {"score": float, "ci95": [lo, hi]}, ...,
        "disclaimer": str}`` — six ``*_like`` entries plus the top-level
        disclaimer.
    """
    if HAS_TORCH and model_path is not None and Path(model_path).exists():
        try:
            return _real_inference(embedding, features,
                                   chronological_age, Path(model_path))
        except Exception as exc:
            log.warning(
                "risk_scores torch inference failed (%s); falling back to stub.",
                exc,
            )

    return _stub_scores(embedding, features, chronological_age, deterministic_seed)


# -------------------------------------------------------------------- real path
def _real_inference(
    embedding: list[float],
    features: dict[str, Any],
    chronological_age: int | None,
    model_path: Path,
) -> dict[str, Any]:
    """MC-dropout inference.

    Notes
    -----
    Classifier head not yet shipped — Agent E owns the checkpoint. We
    keep the logic in one place so wiring is trivial once the model
    drops. Until then this raises and ``compute_risk_scores`` catches it
    and uses the stub.
    """
    import torch

    model = torch.load(str(model_path), map_location="cpu")
    model.train()  # keep dropout active for MC-dropout

    x = torch.tensor([embedding], dtype=torch.float32)
    n_passes = 50
    outs: list[list[float]] = []
    with torch.no_grad():
        for _ in range(n_passes):
            y = model(x)
            if hasattr(y, "sigmoid"):
                y = y.sigmoid()
            outs.append([float(v) for v in y.flatten().tolist()])
    if not outs or len(outs[0]) < len(LABELS):
        raise RuntimeError("model output dimension does not match labels")

    payload: dict[str, Any] = {}
    for i, label in enumerate(LABELS):
        col = [row[i] for row in outs]
        mean = sum(col) / len(col)
        var = sum((v - mean) ** 2 for v in col) / max(len(col) - 1, 1)
        sd = math.sqrt(var)
        lo = max(0.0, mean - 1.96 * sd)
        hi = min(1.0, mean + 1.96 * sd)
        payload[label] = {"score": round(mean, 4), "ci95": [round(lo, 4), round(hi, 4)]}

    payload["disclaimer"] = DISCLAIMER
    return payload


# -------------------------------------------------------------------- stub path
_BIOMARKER_PRIORS: dict[str, str] = {
    "mdd_like": "frontal_alpha_asymmetry",
    "adhd_like": "theta_beta_ratio",
    "anxiety_like": "posterior_alpha",
    "cognitive_decline_like": "peak_alpha_frequency",
    "tbi_residual_like": "frontal_delta",
    "insomnia_like": "sleep_spindles",
}


def _seed(embedding: list[float], features: dict[str, Any],
          override: int | None) -> int:
    if override is not None:
        return int(override) & 0xFFFFFFFF
    raw = (
        repr(tuple(round(float(x), 6) for x in embedding))
        + repr(sorted((features or {}).keys()))
    )
    h = hashlib.sha256(raw.encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big")


def _stub_scores(
    embedding: list[float],
    features: dict[str, Any],
    chronological_age: int | None,
    deterministic_seed: int | None,
) -> dict[str, Any]:
    rng = random.Random(_seed(embedding, features, deterministic_seed))

    # Base draws around 0.3 with small noise
    base = {label: 0.28 + rng.uniform(-0.08, 0.08) for label in LABELS}

    # Biomarker priors from the feature dict -------------------------------
    asym = _safe_get(features, "asymmetry", "frontal_alpha_F3_F4", default=0.0)
    if isinstance(asym, (int, float)) and asym > 0.1:
        base["mdd_like"] += min(0.35, float(asym))

    theta_beta = _theta_beta_ratio(features)
    if theta_beta is not None and theta_beta > 2.5:
        base["adhd_like"] += min(0.35, (theta_beta - 2.5) * 0.15)
    elif _has_flag(features, "elevated_theta_at_Fz"):
        base["adhd_like"] += 0.20

    post_alpha = _posterior_alpha(features)
    if post_alpha is not None and post_alpha > 1.3:
        base["anxiety_like"] += min(0.3, (post_alpha - 1.3) * 0.4)

    paf = _mean_paf(features)
    if paf is not None and paf < 9.0:
        base["cognitive_decline_like"] += min(0.4, (9.0 - paf) * 0.2)
    if isinstance(chronological_age, int) and chronological_age >= 65:
        base["cognitive_decline_like"] += 0.05

    delta_frontal = _frontal_delta(features)
    if delta_frontal is not None and delta_frontal > 1.3:
        base["tbi_residual_like"] += min(0.3, (delta_frontal - 1.3) * 0.4)

    if _has_flag(features, "reduced_sleep_spindles"):
        base["insomnia_like"] += 0.25

    payload: dict[str, Any] = {}
    for label in LABELS:
        score = _clip01(base[label])
        lo = _clip01(score - 0.08)
        hi = _clip01(score + 0.08)
        payload[label] = {"score": round(score, 4), "ci95": [round(lo, 4), round(hi, 4)]}

    payload["disclaimer"] = DISCLAIMER
    return payload


# -------------------------------------------------------------------- helpers
def _clip01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))


def _safe_get(d: Any, *keys: str, default: Any = None) -> Any:
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur


def _has_flag(features: dict[str, Any], flag: str) -> bool:
    flags = features.get("flags") or features.get("qeeg_flags") or []
    return flag in set(flags) if isinstance(flags, (list, tuple, set)) else False


def _theta_beta_ratio(features: dict[str, Any]) -> float | None:
    theta = _safe_get(features, "spectral", "bands", "theta", "absolute_uv2")
    beta = _safe_get(features, "spectral", "bands", "beta", "absolute_uv2")
    if not (isinstance(theta, dict) and isinstance(beta, dict)):
        ratio = _safe_get(features, "theta_beta_ratio")
        return float(ratio) if isinstance(ratio, (int, float)) else None
    try:
        t = sum(theta.values()) / max(len(theta), 1)
        b = sum(beta.values()) / max(len(beta), 1)
        return float(t / b) if b > 0 else None
    except Exception:
        return None


def _posterior_alpha(features: dict[str, Any]) -> float | None:
    alpha = _safe_get(features, "spectral", "bands", "alpha", "absolute_uv2")
    if not isinstance(alpha, dict):
        return None
    posterior = [alpha.get(ch) for ch in ("O1", "O2", "P3", "P4", "Pz")
                 if isinstance(alpha.get(ch), (int, float))]
    return float(sum(posterior) / len(posterior)) if posterior else None


def _frontal_delta(features: dict[str, Any]) -> float | None:
    delta = _safe_get(features, "spectral", "bands", "delta", "absolute_uv2")
    if not isinstance(delta, dict):
        return None
    frontal = [delta.get(ch) for ch in ("Fp1", "Fp2", "F3", "F4", "Fz")
               if isinstance(delta.get(ch), (int, float))]
    return float(sum(frontal) / len(frontal)) if frontal else None


def _mean_paf(features: dict[str, Any]) -> float | None:
    paf = _safe_get(features, "spectral", "peak_alpha_freq")
    if not isinstance(paf, dict):
        return None
    vals = [v for v in paf.values() if isinstance(v, (int, float))]
    return float(sum(vals) / len(vals)) if vals else None
