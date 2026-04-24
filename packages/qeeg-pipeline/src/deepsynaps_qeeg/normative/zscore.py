"""Normative z-scoring — pluggable norm DB + toy CSV implementation.

Consumers obtain a :class:`NormativeDB` implementation (e.g. :class:`ToyCsvNormDB`)
and call :func:`compute` with a features dict + age + sex. The result matches
``CONTRACT.md §1.2``: a ``zscores`` dict plus a ``flagged`` list of entries
where ``|z| > 1.96``.
"""
from __future__ import annotations

import csv
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

log = logging.getLogger(__name__)

Z_FLAG_THRESHOLD = 1.96
DEFAULT_NORM_DB_VERSION = "toy-0.1"
_DEFAULT_TOY_CSV = (
    Path(__file__).resolve().parents[3]
    / "tests"
    / "fixtures"
    / "toy_norms.csv"
)


class NormativeDB(Protocol):
    """Protocol for a normative database.

    Implementations return the population mean and standard deviation of a
    metric for a given age / sex bin. ``metric_path`` is a dot-separated key
    like ``"spectral.bands.alpha.absolute_uv2"`` with the per-channel entry
    appended (e.g. ``"...absolute_uv2.Fz"``).
    """

    def mean(self, metric_path: str, age: int | None, sex: str | None) -> float | None:
        ...

    def std(self, metric_path: str, age: int | None, sex: str | None) -> float | None:
        ...


@dataclass
class _NormRow:
    metric_path: str
    age_min: float
    age_max: float
    sex: str  # 'M' | 'F' | 'ALL'
    mean: float
    std: float


class ToyCsvNormDB:
    """Minimal normative DB that reads a CSV fixture.

    CSV columns: ``metric_path,age_min,age_max,sex,mean,std``.

    Notes
    -----
    ``sex`` is matched case-insensitively; ``ALL`` matches any sex.
    Age bins are inclusive of ``age_min`` and exclusive of ``age_max``.
    """

    def __init__(self, csv_path: str | Path | None = None) -> None:
        self.csv_path = Path(csv_path) if csv_path else _DEFAULT_TOY_CSV
        self._rows: list[_NormRow] = []
        if self.csv_path.exists():
            self._load()
        else:
            log.warning("Toy norm CSV not found at %s; DB is empty.", self.csv_path)

    def _load(self) -> None:
        with self.csv_path.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                try:
                    self._rows.append(
                        _NormRow(
                            metric_path=row["metric_path"].strip(),
                            age_min=float(row["age_min"]),
                            age_max=float(row["age_max"]),
                            sex=row["sex"].strip().upper() or "ALL",
                            mean=float(row["mean"]),
                            std=float(row["std"]),
                        )
                    )
                except Exception as exc:
                    log.warning("Skipping malformed norm row %s (%s).", row, exc)
        log.info("Loaded %d norm rows from %s", len(self._rows), self.csv_path)

    def _find(self, metric_path: str, age: int | None, sex: str | None) -> _NormRow | None:
        s = (sex or "").upper()
        for row in self._rows:
            if row.metric_path != metric_path:
                continue
            if age is not None and not (row.age_min <= age < row.age_max):
                continue
            if row.sex != "ALL" and s and row.sex != s:
                continue
            return row
        return None

    def mean(self, metric_path: str, age: int | None, sex: str | None) -> float | None:
        row = self._find(metric_path, age, sex)
        return row.mean if row else None

    def std(self, metric_path: str, age: int | None, sex: str | None) -> float | None:
        row = self._find(metric_path, age, sex)
        return row.std if row else None


def compute(
    features: dict[str, Any],
    *,
    age: int | None,
    sex: str | None,
    db: NormativeDB | None = None,
    norm_db_version: str = DEFAULT_NORM_DB_VERSION,
) -> dict[str, Any]:
    """Compute normative z-scores and flag deviations where ``|z| > 1.96``.

    Parameters
    ----------
    features : dict
        Output of the feature-extraction stage (must contain ``spectral`` at
        minimum; ``aperiodic`` is optional).
    age : int or None
        Subject age in years. If ``None``, returns an empty zscores dict.
    sex : str or None
        ``"M"`` or ``"F"``. If ``None``, returns an empty zscores dict.
    db : NormativeDB or None
        Database instance. Defaults to :class:`ToyCsvNormDB` with the shipped
        fixture.
    norm_db_version : str
        Reported in the output for audit trails.

    Returns
    -------
    dict
        See ``CONTRACT.md §1.2``.
    """
    if age is None or sex is None:
        log.info("age/sex not supplied — returning empty zscores.")
        return {"spectral": {"bands": {}}, "aperiodic": {"slope": {}},
                "flagged": [], "norm_db_version": norm_db_version}

    db = db or ToyCsvNormDB()

    spectral_bands_out: dict[str, dict[str, dict[str, float]]] = {}
    flagged: list[dict[str, Any]] = []

    spectral = features.get("spectral", {}) or {}
    bands = spectral.get("bands", {}) or {}
    for band_name, band_payload in bands.items():
        spectral_bands_out[band_name] = {"absolute_uv2": {}, "relative": {}}
        for metric_key in ("absolute_uv2", "relative"):
            channels = (band_payload or {}).get(metric_key, {}) or {}
            for ch, value in channels.items():
                path = f"spectral.bands.{band_name}.{metric_key}"
                z = _z_for(db, f"{path}.{ch}", age, sex, value)
                if z is None:
                    # Try channel-agnostic norm as a secondary lookup
                    z = _z_for(db, path, age, sex, value)
                if z is None:
                    continue
                spectral_bands_out[band_name][metric_key][ch] = z
                if abs(z) > Z_FLAG_THRESHOLD:
                    flagged.append({"metric": path, "channel": ch, "z": z})

    # Aperiodic slope z-scores
    aperiodic_out: dict[str, dict[str, float]] = {"slope": {}}
    aperiodic_in = spectral.get("aperiodic", {}) or {}
    slopes = aperiodic_in.get("slope", {}) or {}
    for ch, value in slopes.items():
        path = "aperiodic.slope"
        z = _z_for(db, f"{path}.{ch}", age, sex, value)
        if z is None:
            z = _z_for(db, path, age, sex, value)
        if z is None:
            continue
        aperiodic_out["slope"][ch] = z
        if abs(z) > Z_FLAG_THRESHOLD:
            flagged.append({"metric": path, "channel": ch, "z": z})

    return {
        "spectral": {"bands": spectral_bands_out},
        "aperiodic": aperiodic_out,
        "flagged": flagged,
        "norm_db_version": norm_db_version,
    }


def _z_for(
    db: NormativeDB,
    metric_path: str,
    age: int | None,
    sex: str | None,
    value: float | None,
) -> float | None:
    if value is None:
        return None
    try:
        val = float(value)
    except (TypeError, ValueError):
        return None
    mu = db.mean(metric_path, age, sex)
    sd = db.std(metric_path, age, sex)
    if mu is None or sd is None or sd <= 0:
        return None
    return float((val - mu) / sd)
