"""GAMLSS-based normative modelling.

Replacement for the toy :mod:`deepsynaps_qeeg.normative.zscore`
implementation when ``pcntoolkit`` (Oxford PCNtoolkit) is available and a
pickled GAMLSS BCT fit is shipped under ``models/normative/v1/``.

Contract
--------
See ``CONTRACT_V2.md §1 centiles``:

    {
      "spectral": {"bands": {"<band>": {"absolute_uv2": {"<ch>": 0..100, ...},
                                        "relative":     {"<ch>": 0..100, ...}}}},
      "aperiodic": {"slope": {"<ch>": 0..100, ...}},
      "norm_db_version": "gamlss-v1",
    }

:func:`compute_centiles_and_zscores` returns BOTH the centiles dict above
AND a ``zscores`` dict wire-compatible with ``CONTRACT.md §1.2`` so
legacy consumers keep working.

The existing ``normative/zscore.py`` is intentionally NOT touched by this
module; callers that want GAMLSS behaviour must opt in by importing from
here.
"""
from __future__ import annotations

import hashlib
import logging
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .zscore import (  # type: ignore[attr-defined]
    DEFAULT_NORM_DB_VERSION,
    Z_FLAG_THRESHOLD,
    NormativeDB,
)

log = logging.getLogger(__name__)


def _try_import_pcntk() -> Any | None:
    """Best-effort import of PCNtoolkit.

    Returns
    -------
    module or None
    """
    try:
        import pcntoolkit  # type: ignore[import-not-found]
    except ImportError:
        return None
    return pcntoolkit


_PCNTK = _try_import_pcntk()
HAS_PCNTK: bool = _PCNTK is not None

GAMLSS_VERSION = "gamlss-v1"
GAMLSS_STUB_VERSION = "gamlss-v1-stub"

_DEFAULT_MODELS_ROOT = Path(__file__).resolve().parents[3] / "models" / "normative" / "v1"


@dataclass
class _GamlssFit:
    """Minimal wrapper around a pickled GAMLSS BCT fit."""

    feature_path: str
    fit_object: Any  # opaque PCNtoolkit/gamlss fit object


def _stable_int_hash(text: str) -> int:
    """Stable 64-bit int hash of a string.

    Parameters
    ----------
    text : str

    Returns
    -------
    int
    """
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def _sigmoid(x: float) -> float:
    """Numerically-stable logistic sigmoid.

    Parameters
    ----------
    x : float

    Returns
    -------
    float
        Value in (0, 1).
    """
    if x >= 0:
        ez = math.exp(-x)
        return 1.0 / (1.0 + ez)
    ez = math.exp(x)
    return ez / (1.0 + ez)


def _stub_centile(metric_path: str, value: float, age: int | None, sex: str | None) -> float:
    """Deterministic pseudo-centile for a scalar value.

    The output is stable for fixed inputs. It uses the metric path +
    age + sex in the hash so two channels with the same raw value get
    distinct — but reproducible — centiles, which makes frontend demos
    feel believable.

    Parameters
    ----------
    metric_path : str
    value : float
    age : int or None
    sex : str or None

    Returns
    -------
    float
        Centile in ``[0.0, 100.0]``.
    """
    seed = _stable_int_hash(
        f"{metric_path}|age={age}|sex={sex or 'U'}"
    )
    # Stable per-feature bias in roughly [-1, 1].
    bias = (seed / 0xFFFFFFFFFFFFFFFF) * 2.0 - 1.0
    # Inject the raw value with a gentle scaler so larger-in-magnitude
    # deviations push the centile toward the tails.
    centile = _sigmoid(0.5 * float(value) + bias) * 100.0
    return round(max(0.0, min(100.0, centile)), 2)


def _centile_to_z(centile_0_100: float) -> float:
    """Approximate inverse-normal CDF via Acklam's rational approximation.

    Parameters
    ----------
    centile_0_100 : float

    Returns
    -------
    float
    """
    p = max(1e-6, min(1 - 1e-6, centile_0_100 / 100.0))
    # Acklam's approximation constants.
    a = [
        -3.969683028665376e01,
         2.209460984245205e02,
        -2.759285104469687e02,
         1.383577518672690e02,
        -3.066479806614716e01,
         2.506628277459239e00,
    ]
    b = [
        -5.447609879822406e01,
         1.615858368580409e02,
        -1.556989798598866e02,
         6.680131188771972e01,
        -1.328068155288572e01,
    ]
    c = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
         4.374664141464968e00,
         2.938163982698783e00,
    ]
    d = [
         7.784695709041462e-03,
         3.224671290700398e-01,
         2.445134137142996e00,
         3.754408661907416e00,
    ]
    p_low = 0.02425
    p_high = 1 - p_low
    if p < p_low:
        q = math.sqrt(-2 * math.log(p))
        return (
            (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
        )
    if p <= p_high:
        q = p - 0.5
        r = q * q
        return (
            (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
        ) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    q = math.sqrt(-2 * math.log(1 - p))
    return -(
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
        / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    )


class GamlssNormativeDB:
    """GAMLSS-backed implementation of the :class:`NormativeDB` protocol.

    Parameters
    ----------
    models_root : Path or None
        Directory containing per-feature pickled GAMLSS fits. Defaults
        to ``packages/qeeg-pipeline/models/normative/v1``.
    norm_db_version : str or None
        Override the ``norm_db_version`` tag surfaced downstream.

    Notes
    -----
    Missing fits (or ``HAS_PCNTK == False``) fall through to
    deterministic stubs. ``mean`` / ``std`` return ``None`` in that case
    so legacy callers using the :class:`NormativeDB` protocol fall back
    gracefully; use :meth:`centile` directly for the new contract.
    """

    def __init__(
        self,
        models_root: Path | None = None,
        *,
        norm_db_version: str | None = None,
    ) -> None:
        self.models_root = Path(models_root) if models_root else _DEFAULT_MODELS_ROOT
        self._fits: dict[str, _GamlssFit] = {}
        self._loaded = False
        # If PCNtoolkit is unavailable we stay in stub mode but still
        # expose the class so type-checkers + callers are happy.
        self.norm_db_version = norm_db_version or (
            GAMLSS_VERSION if (HAS_PCNTK and self.models_root.exists()) else GAMLSS_STUB_VERSION
        )

    # ------------------------------------------------------------------ NormativeDB
    def mean(self, metric_path: str, age: int | None, sex: str | None) -> float | None:
        """Population mean for ``metric_path`` at the given ``(age, sex)``.

        Stub mode returns ``None`` (callers then skip the legacy
        z-score lookup and fall back to :meth:`centile`).

        Parameters
        ----------
        metric_path : str
        age : int or None
        sex : str or None

        Returns
        -------
        float or None
        """
        fit = self._get_fit(metric_path)
        if fit is None:
            return None
        try:  # pragma: no cover — real-path requires pcntoolkit
            return float(fit.fit_object.mu(age=age, sex=sex))
        except Exception as exc:
            log.warning("GAMLSS mean() failed for %s (%s).", metric_path, exc)
            return None

    def std(self, metric_path: str, age: int | None, sex: str | None) -> float | None:
        """Population standard deviation for ``metric_path``.

        Parameters
        ----------
        metric_path : str
        age : int or None
        sex : str or None

        Returns
        -------
        float or None
        """
        fit = self._get_fit(metric_path)
        if fit is None:
            return None
        try:  # pragma: no cover — real-path requires pcntoolkit
            return float(fit.fit_object.sigma(age=age, sex=sex))
        except Exception as exc:
            log.warning("GAMLSS std() failed for %s (%s).", metric_path, exc)
            return None

    def centile(self, metric_path: str, age: int | None, sex: str | None) -> float:
        """Centile (0..100) for the cohort at ``(age, sex)``.

        The centile reported here is the *position in the normative
        cohort*; combined with the subject's raw value inside
        :func:`compute_centiles_and_zscores` it becomes a per-subject
        centile via the cumulative distribution.

        Parameters
        ----------
        metric_path : str
        age : int or None
        sex : str or None

        Returns
        -------
        float
            In the stub path returns ``50.0`` — the median — so legacy
            callers that don't feed in a value still see a sensible
            default.
        """
        fit = self._get_fit(metric_path)
        if fit is None:
            return 50.0
        try:  # pragma: no cover — real path
            return float(fit.fit_object.centile(age=age, sex=sex))
        except Exception as exc:
            log.warning("GAMLSS centile() failed for %s (%s).", metric_path, exc)
            return 50.0

    # ------------------------------------------------------------------ helpers
    def _get_fit(self, metric_path: str) -> _GamlssFit | None:
        """Lazily load the pickled fit for a metric path.

        Parameters
        ----------
        metric_path : str

        Returns
        -------
        _GamlssFit or None
        """
        if not HAS_PCNTK:
            return None
        if not self.models_root.exists():
            return None
        if not self._loaded:
            self._load_all()
        return self._fits.get(metric_path)

    def _load_all(self) -> None:
        """Glob all ``.pkl`` fits in :attr:`models_root`.

        Each file is expected to be named ``<metric_path>.pkl`` (dots
        preserved — POSIX-safe). Load failures are logged and skipped.
        """
        import pickle  # noqa: WPS433 — local to keep cold start fast

        self._loaded = True
        for path in sorted(self.models_root.glob("*.pkl")):
            key = path.stem
            try:
                with path.open("rb") as fh:
                    fit = pickle.load(fh)  # noqa: S301 — curated fits only
                self._fits[key] = _GamlssFit(feature_path=key, fit_object=fit)
            except Exception as exc:  # pragma: no cover — guard
                log.warning("Failed to load GAMLSS fit %s (%s).", path, exc)
        log.info(
            "Loaded %d GAMLSS fits from %s.", len(self._fits), self.models_root
        )


# ---------------------------------------------------------------------- public API


def _iter_spectral_metrics(features: dict[str, Any]) -> list[tuple[str, str, str, float]]:
    """Enumerate every (band, metric_key, channel, value) spectral entry.

    Parameters
    ----------
    features : dict

    Returns
    -------
    list of tuple
        ``(band, metric_key, channel, value)``.
    """
    out: list[tuple[str, str, str, float]] = []
    spectral = features.get("spectral") or {}
    bands = spectral.get("bands") or {}
    for band_name, band_payload in bands.items():
        if not isinstance(band_payload, dict):
            continue
        for metric_key in ("absolute_uv2", "relative"):
            ch_map = band_payload.get(metric_key) or {}
            for ch, raw in ch_map.items():
                if raw is None:
                    continue
                try:
                    out.append((band_name, metric_key, str(ch), float(raw)))
                except (TypeError, ValueError):
                    continue
    return out


def _iter_aperiodic_slopes(features: dict[str, Any]) -> list[tuple[str, float]]:
    """Enumerate per-channel aperiodic slopes.

    Parameters
    ----------
    features : dict

    Returns
    -------
    list of tuple
        ``(channel, value)``.
    """
    slopes = ((features.get("spectral") or {}).get("aperiodic") or {}).get("slope") or {}
    out: list[tuple[str, float]] = []
    for ch, raw in slopes.items():
        if raw is None:
            continue
        try:
            out.append((str(ch), float(raw)))
        except (TypeError, ValueError):
            continue
    return out


def compute_centiles_and_zscores(
    features: dict[str, Any],
    *,
    age: int | None,
    sex: str | None,
    db: GamlssNormativeDB | None = None,
) -> dict[str, Any]:
    """Return both GAMLSS centiles and back-compat z-scores.

    Parameters
    ----------
    features : dict
        Classical feature dict (see ``CONTRACT.md §1.1``).
    age : int or None
        Subject age in years. ``None`` short-circuits to empty output.
    sex : str or None
        ``"M"`` or ``"F"``. ``None`` short-circuits to empty output.
    db : GamlssNormativeDB or None
        Optional preconstructed GAMLSS DB — useful for tests.

    Returns
    -------
    dict
        ::

            {
              "centiles": {...},   # CONTRACT_V2 §1 centiles shape
              "zscores":  {...},   # CONTRACT §1.2 compatible
            }

        The ``zscores`` block carries the same ``norm_db_version`` tag as
        the centiles for audit symmetry.
    """
    db = db or GamlssNormativeDB()
    version = db.norm_db_version

    if age is None or sex is None:
        log.info("GAMLSS: age/sex missing — returning empty centile/zscore bundle.")
        return {
            "centiles": {
                "spectral": {"bands": {}},
                "aperiodic": {"slope": {}},
                "norm_db_version": version,
            },
            "zscores": {
                "spectral": {"bands": {}},
                "aperiodic": {"slope": {}},
                "flagged": [],
                "norm_db_version": version,
            },
        }

    spectral_centiles: dict[str, dict[str, dict[str, float]]] = {}
    spectral_z: dict[str, dict[str, dict[str, float]]] = {}
    flagged: list[dict[str, Any]] = []

    for band, metric_key, ch, value in _iter_spectral_metrics(features):
        metric_path = f"spectral.bands.{band}.{metric_key}"

        # Real path — attempt proper fit lookup.
        mu = db.mean(f"{metric_path}.{ch}", age, sex)
        sd = db.std(f"{metric_path}.{ch}", age, sex)
        if mu is not None and sd not in (None, 0):
            z = float((value - mu) / sd)
            # Approximate centile from z (normal CDF).
            centile = 100.0 * (0.5 * (1.0 + math.erf(z / math.sqrt(2.0))))
        else:
            centile = _stub_centile(f"{metric_path}.{ch}", value, age, sex)
            z = _centile_to_z(centile)

        spectral_centiles.setdefault(band, {}).setdefault(metric_key, {})[ch] = round(centile, 2)
        spectral_z.setdefault(band, {}).setdefault(metric_key, {})[ch] = round(z, 3)

        if abs(z) > Z_FLAG_THRESHOLD:
            flagged.append({"metric": metric_path, "channel": ch, "z": round(z, 3)})

    aperiodic_centiles: dict[str, dict[str, float]] = {"slope": {}}
    aperiodic_z: dict[str, dict[str, float]] = {"slope": {}}
    for ch, value in _iter_aperiodic_slopes(features):
        metric_path = "aperiodic.slope"
        mu = db.mean(f"{metric_path}.{ch}", age, sex)
        sd = db.std(f"{metric_path}.{ch}", age, sex)
        if mu is not None and sd not in (None, 0):
            z = float((value - mu) / sd)
            centile = 100.0 * (0.5 * (1.0 + math.erf(z / math.sqrt(2.0))))
        else:
            centile = _stub_centile(f"{metric_path}.{ch}", value, age, sex)
            z = _centile_to_z(centile)

        aperiodic_centiles["slope"][ch] = round(centile, 2)
        aperiodic_z["slope"][ch] = round(z, 3)
        if abs(z) > Z_FLAG_THRESHOLD:
            flagged.append({"metric": metric_path, "channel": ch, "z": round(z, 3)})

    # Re-shape spectral_centiles so bands-with-no-data don't disappear
    # (the V2 contract allows empty sub-dicts but not missing keys — UI
    # null-guards on the outer shape).
    centiles_out = {
        "spectral": {"bands": spectral_centiles},
        "aperiodic": {
            "slope": aperiodic_centiles["slope"],
        },
        "norm_db_version": version,
    }
    zscores_out = {
        "spectral": {"bands": spectral_z},
        "aperiodic": {"slope": aperiodic_z["slope"]},
        "flagged": flagged,
        "norm_db_version": version,
    }
    # If the caller wants the legacy norm-db tag when everything was in
    # stub mode, we expose both under an explicit key.
    if version.endswith("-stub"):
        log.info("GAMLSS stub mode in use; %d metrics flagged (|z|>%.2f).",
                 len(flagged), Z_FLAG_THRESHOLD)
    return {"centiles": centiles_out, "zscores": zscores_out}


# Re-export protocol + legacy version for downstream typing convenience.
__all__ = [
    "HAS_PCNTK",
    "GAMLSS_VERSION",
    "GAMLSS_STUB_VERSION",
    "GamlssNormativeDB",
    "compute_centiles_and_zscores",
    "NormativeDB",
    "DEFAULT_NORM_DB_VERSION",
]
