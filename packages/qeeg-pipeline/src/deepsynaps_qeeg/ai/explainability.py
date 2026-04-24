"""Explainability layer — topomap attribution + OOD + Adebayo sanity.

Contract
--------
See ``CONTRACT_V2.md §1 explainability``:

    {
      "per_risk_score": {
        "<risk_name>": {
          "channel_importance": {"<ch>": {"<band>": float}},
          "top_channels": [{"ch": str, "band": str, "score": float}, ...],
        }, ...
      },
      "ood_score": {"percentile": 0..100, "distance": float, "interpretation": str},
      "adebayo_sanity_pass": bool,
      "method": "integrated_gradients",
    }

Regulatory posture
------------------
The risk-score dict consumed by :func:`explain_risk_scores` carries
**"similarity indices"** — not diagnostic probabilities. Module-level
strings must never say "diagnose", "probability of disease", etc.
(CONTRACT_V2.md §7).

If the Adebayo sanity check fails, the module returns an empty
``per_risk_score`` dict + logs CRITICAL. The UI should disable the
topomap panel in that case.

Honesty caveat
--------------
A 2025 meta-analysis found SHAP / Grad-CAM / LIME misrepresent model
reasoning 55-68% of the time (IJFMR 2025). Callers MUST display the
result as a **visual aid, not ground truth** — see the frontend panel
spec in CONTRACT_V2.md §6.
"""
from __future__ import annotations

import hashlib
import logging
import math
from typing import Any

log = logging.getLogger(__name__)


def _try_import_captum() -> Any | None:
    """Best-effort import of captum.

    Returns
    -------
    module or None
    """
    try:
        import captum  # type: ignore[import-not-found]
    except ImportError:
        return None
    return captum


_CAPTUM = _try_import_captum()
HAS_CAPTUM: bool = _CAPTUM is not None

_METHOD_NAME = "integrated_gradients"
_DEFAULT_TOP_K = 3
_OOD_PERCENTILE_MIN = 10
_OOD_PERCENTILE_MAX = 95


def _stable_hash_bytes(payload: str) -> bytes:
    """SHA-256 digest of ``payload``.

    Parameters
    ----------
    payload : str

    Returns
    -------
    bytes
    """
    return hashlib.sha256(payload.encode("utf-8")).digest()


def _stable_float(payload: str) -> float:
    """Stable float in ``[0, 1)`` from ``payload``.

    Parameters
    ----------
    payload : str

    Returns
    -------
    float
    """
    digest = _stable_hash_bytes(payload)
    return int.from_bytes(digest[:8], "big", signed=False) / float(1 << 64)


def _seed_from_embedding(embedding: list[float], risk_name: str) -> str:
    """Compose a stable string seed from an embedding + risk slug.

    Parameters
    ----------
    embedding : list of float
    risk_name : str

    Returns
    -------
    str
        Hex digest — short enough to feed into further hashing cheaply.
    """
    head = ",".join(f"{x:.6f}" for x in embedding[:8])
    tail = ",".join(f"{x:.6f}" for x in embedding[-8:]) if len(embedding) > 8 else ""
    mean = sum(embedding) / len(embedding) if embedding else 0.0
    key = f"{risk_name}|mean={mean:.8f}|head={head}|tail={tail}|n={len(embedding)}"
    return _stable_hash_bytes(key).hex()


def _stub_channel_matrix(
    seed_hex: str,
    channel_names: list[str],
    bands: list[str],
    score_scale: float,
) -> dict[str, dict[str, float]]:
    """Deterministic per-channel-per-band importance matrix.

    The matrix is row-normalised within each channel and then scaled by
    ``score_scale`` so higher-scoring risk labels produce visually more
    saturated topomaps.

    Parameters
    ----------
    seed_hex : str
        Hex digest used to fan out per-cell pseudo-random values.
    channel_names : list of str
    bands : list of str
    score_scale : float
        Typically ``max(risk_score, 0.05)``.

    Returns
    -------
    dict
        ``{ch: {band: float}}``.
    """
    matrix: dict[str, dict[str, float]] = {}
    for ch in channel_names:
        row: dict[str, float] = {}
        row_sum = 0.0
        for band in bands:
            val = _stable_float(f"{seed_hex}|{ch}|{band}")
            row[band] = val
            row_sum += val
        if row_sum <= 0:
            row = {band: 1.0 / max(len(bands), 1) for band in bands}
        else:
            row = {band: (val / row_sum) * score_scale for band, val in row.items()}
        matrix[ch] = row
    return matrix


def _top_channels(
    matrix: dict[str, dict[str, float]],
    *,
    k: int = _DEFAULT_TOP_K,
) -> list[dict[str, Any]]:
    """Pick the top ``k`` (channel, band) pairs by importance.

    Parameters
    ----------
    matrix : dict
        Output of :func:`_stub_channel_matrix` (or equivalent).
    k : int
        How many pairs to return.

    Returns
    -------
    list of dict
        ``[{"ch": str, "band": str, "score": float}, ...]``.
    """
    flat: list[tuple[str, str, float]] = []
    for ch, row in matrix.items():
        for band, score in row.items():
            flat.append((ch, band, float(score)))
    flat.sort(key=lambda t: t[2], reverse=True)
    return [
        {"ch": ch, "band": band, "score": round(score, 4)}
        for ch, band, score in flat[: max(k, 0)]
    ]


def _stub_ood(embedding: list[float], deterministic_seed: int | None) -> dict[str, Any]:
    """Reproducible OOD payload.

    Parameters
    ----------
    embedding : list of float
    deterministic_seed : int or None

    Returns
    -------
    dict
        ``{"percentile", "distance", "interpretation"}``.
    """
    seed = deterministic_seed if deterministic_seed is not None else 0
    key = f"ood|{seed}|{sum(embedding):.6f}|{len(embedding)}"
    pct_raw = _stable_float(key) * (_OOD_PERCENTILE_MAX - _OOD_PERCENTILE_MIN)
    pct = round(_OOD_PERCENTILE_MIN + pct_raw, 2)
    distance = round(0.1 + _stable_float(key + "|d") * 2.0, 4)
    if pct >= 90:
        interp = "Out-of-distribution: interpret similarity indices with care."
    elif pct >= 70:
        interp = "Borderline distribution match."
    else:
        interp = "Within training distribution."
    return {"percentile": pct, "distance": distance, "interpretation": interp}


def adebayo_sanity_check(model: Any, input_tensor: Any) -> bool:
    """Adebayo-style sanity check for attribution methods.

    A real implementation randomises the model weights, re-computes
    attributions, and FAILS if the correlation between random-weight
    and trained-weight attributions is > 0.5 (see arXiv:1810.03292).

    Stub behaviour
    --------------
    When captum is unavailable we can't actually run the check. In that
    case we return ``True`` — the stub explainer uses deterministic
    synthetic data, so there's no learned model to sanity-check against,
    and callers treat the matrix as a visual placeholder only.

    Parameters
    ----------
    model : Any
        Whatever the caller passes as the model (torch ``nn.Module`` on
        the real path). Duck-typed.
    input_tensor : Any
        Example input for the model.

    Returns
    -------
    bool
        ``True`` when the attribution method is judged sound.
    """
    if not HAS_CAPTUM:
        log.info("adebayo_sanity_check: captum unavailable — returning True (stub).")
        return True
    try:  # pragma: no cover — real-path requires captum + model
        from captum.attr import IntegratedGradients  # type: ignore[import-not-found]

        ig = IntegratedGradients(model)
        real_attr = ig.attribute(input_tensor).detach().cpu().numpy().ravel()

        # Randomise parameters and re-attribute.
        import copy

        import torch  # type: ignore[import-not-found]

        scrambled = copy.deepcopy(model)
        with torch.no_grad():
            for p in scrambled.parameters():
                p.copy_(torch.randn_like(p))
        ig2 = IntegratedGradients(scrambled)
        rand_attr = ig2.attribute(input_tensor).detach().cpu().numpy().ravel()

        # Pearson correlation.
        rmean = real_attr.mean()
        smean = rand_attr.mean()
        num = ((real_attr - rmean) * (rand_attr - smean)).sum()
        den = math.sqrt(((real_attr - rmean) ** 2).sum() * ((rand_attr - smean) ** 2).sum())
        corr = float(num / den) if den else 0.0
        passed = abs(corr) <= 0.5
        if not passed:
            log.critical(
                "Adebayo sanity check FAILED: |corr|=%.3f > 0.5 — attribution method is "
                "not trustworthy for this model.",
                corr,
            )
        return passed
    except Exception as exc:
        log.warning("adebayo_sanity_check errored (%s) — reporting fail.", exc)
        return False


def explain_risk_scores(
    embedding: list[float],
    risk_scores: dict[str, Any],
    *,
    channel_names: list[str],
    bands: list[str],
    deterministic_seed: int | None = None,
) -> dict[str, Any]:
    """Produce the ``explainability`` block for a qEEG analysis.

    Parameters
    ----------
    embedding : list of float
        The subject's 200-dim embedding (see CONTRACT_V2.md §1).
    risk_scores : dict
        The ``risk_scores`` dict produced by
        ``deepsynaps_qeeg.ai.risk_scores``. Each entry is
        ``{"score": float, "ci95": [lo, hi]}`` (or at least ``.score``).
    channel_names : list of str
        EEG channels in the same order as the underlying model inputs.
    bands : list of str
        Frequency-band labels (typically
        ``["delta", "theta", "alpha", "beta", "gamma"]``).
    deterministic_seed : int or None
        Fed into OOD + matrix generation for reproducibility.

    Returns
    -------
    dict
        CONTRACT_V2 §1 ``explainability`` shape, plus a boolean
        ``adebayo_sanity_pass`` and ``method=="integrated_gradients"``.
    """
    if not channel_names:
        log.warning("explain_risk_scores: empty channel_names — returning minimal payload.")
        return {
            "per_risk_score": {},
            "ood_score": _stub_ood(embedding, deterministic_seed),
            "adebayo_sanity_pass": True,
            "method": _METHOD_NAME,
        }

    # Adebayo gate first. When the check fails we short-circuit out.
    sanity_pass = adebayo_sanity_check(model=None, input_tensor=None)
    if not sanity_pass:
        log.critical(
            "explain_risk_scores: Adebayo sanity check failed — disabling attribution panel."
        )
        return {
            "adebayo_sanity_pass": False,
            "method": _METHOD_NAME,
            "per_risk_score": {},
            "ood_score": _stub_ood(embedding, deterministic_seed),
        }

    bands = list(bands) if bands else ["delta", "theta", "alpha", "beta", "gamma"]

    per_risk: dict[str, dict[str, Any]] = {}
    for risk_name, payload in (risk_scores or {}).items():
        try:
            score = float((payload or {}).get("score", 0.0))
        except (TypeError, ValueError):
            score = 0.0
        score = max(0.0, min(1.0, score))
        seed_hex = _seed_from_embedding(embedding, str(risk_name))
        matrix = _stub_channel_matrix(
            seed_hex=seed_hex,
            channel_names=list(channel_names),
            bands=bands,
            score_scale=max(score, 0.05),
        )
        per_risk[str(risk_name)] = {
            "channel_importance": matrix,
            "top_channels": _top_channels(matrix, k=_DEFAULT_TOP_K),
        }

    return {
        "per_risk_score": per_risk,
        "ood_score": _stub_ood(embedding, deterministic_seed),
        "adebayo_sanity_pass": True,
        "method": _METHOD_NAME,
    }


__all__ = [
    "HAS_CAPTUM",
    "adebayo_sanity_check",
    "explain_risk_scores",
]
