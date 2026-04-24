"""Longitudinal trajectory analysis for DeepSynaps qEEG Analyzer.

Upgrade 9 in ``AI_UPGRADES.md`` / ``CONTRACT_V2.md`` §1.9. Produces a
per-patient trajectory dashboard payload: a sequence of analyses ordered
by ``days_from_baseline``, with flattened feature vectors, per-feature
slope / RCI change scores (FDR-corrected), and an optional Plotly HTML
snippet.

Design goals
------------
* Import-guarded heavy deps (``pandas``, ``numpy``, ``scipy.stats``,
  ``plotly``). When any are missing the module still loads and produces
  a pure-Python fallback dict.
* Never raises — callers in the API layer expect a well-shaped dict.
* Graceful on partial data: a patient with a single analysis returns an
  empty ``feature_trajectories`` dict but still describes ``n_sessions``
  and ``baseline_date`` correctly.
"""
from __future__ import annotations

import json
import logging
import math
from datetime import datetime
from typing import Any, Iterable, Sequence

log = logging.getLogger(__name__)


# ── Optional heavy imports ──────────────────────────────────────────────────

try:
    import numpy as np  # type: ignore[import-not-found]

    HAS_NUMPY: bool = True
except Exception:  # pragma: no cover
    np = None  # type: ignore[assignment]
    HAS_NUMPY = False

try:
    import pandas as pd  # type: ignore[import-not-found]

    HAS_PANDAS: bool = True
except Exception:  # pragma: no cover
    pd = None  # type: ignore[assignment]
    HAS_PANDAS = False

try:
    import plotly.graph_objects as _go  # type: ignore[import-not-found]

    HAS_PLOTLY: bool = True
except Exception:  # pragma: no cover
    _go = None  # type: ignore[assignment]
    HAS_PLOTLY = False


# ── Feature flattening helpers ──────────────────────────────────────────────


_DEFAULT_FEATURE_PATHS: tuple[str, ...] = (
    "spectral.bands.alpha.relative.mean",
    "spectral.bands.beta.relative.mean",
    "spectral.bands.theta.relative.mean",
    "spectral.bands.delta.relative.mean",
    "spectral.aperiodic.slope.mean",
    "spectral.peak_alpha_freq.mean",
    "asymmetry.frontal_alpha_F3_F4",
    "asymmetry.frontal_alpha_F7_F8",
    "brain_age.gap_years",
    "risk_scores.mdd_like.score",
    "risk_scores.adhd_like.score",
    "risk_scores.anxiety_like.score",
    "risk_scores.cognitive_decline_like.score",
)


def _safe_loads(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, (dict, list, int, float)):
        return raw
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def _walk_number(d: Any, keys: Sequence[str]) -> float | None:
    """Dig into a nested dict path — returning a single float or None."""
    cur: Any = d
    for key in keys:
        if cur is None:
            return None
        if key == "mean":
            # Mean across children values when the node is a dict of channels.
            if not isinstance(cur, dict):
                return None
            vals = [v for v in cur.values() if isinstance(v, (int, float))]
            if not vals:
                return None
            return float(sum(vals) / len(vals))
        if isinstance(cur, dict):
            cur = cur.get(key)
        else:
            return None
    if isinstance(cur, (int, float)):
        return float(cur)
    return None


def _flatten_analysis_features(row: Any, feature_paths: Iterable[str]) -> dict[str, float]:
    """Collapse a ``QEEGAnalysis``-shaped row into a flat ``{path: value}`` dict.

    ``row`` may be either a SQLAlchemy model instance or a plain dict
    (tests frequently pass dicts). Unknown / missing paths are silently
    skipped — the resulting dict only contains numeric entries.
    """
    features: dict[str, Any] = {}

    def _field(name: str) -> Any:
        if isinstance(row, dict):
            return row.get(name)
        return getattr(row, name, None)

    # Assemble a combined feature dict from the JSON columns we know about.
    spectral: dict[str, Any] = {}
    aperiodic = _safe_loads(_field("aperiodic_json"))
    paf = _safe_loads(_field("peak_alpha_freq_json"))
    band_powers = _safe_loads(_field("band_powers_json")) or {}
    # band_powers_json is the legacy shape; normalise into spectral.bands
    bands_src = (band_powers or {}).get("bands") or {}
    bands_out: dict[str, Any] = {}
    for band, info in bands_src.items():
        chans = (info or {}).get("channels") or {}
        abs_map = {ch: float(v.get("absolute_uv2", 0.0) or 0.0) for ch, v in chans.items()}
        rel_map = {ch: float(v.get("relative_pct", 0.0) or 0.0) / 100.0 for ch, v in chans.items()}
        bands_out[band] = {"absolute_uv2": abs_map, "relative": rel_map}
    spectral["bands"] = bands_out
    if aperiodic:
        spectral["aperiodic"] = aperiodic
    if paf:
        spectral["peak_alpha_freq"] = paf

    features["spectral"] = spectral
    features["asymmetry"] = _safe_loads(_field("asymmetry_json")) or {}
    features["connectivity"] = _safe_loads(_field("connectivity_json")) or {}
    features["graph"] = _safe_loads(_field("graph_metrics_json")) or {}
    features["source"] = _safe_loads(_field("source_roi_json")) or {}
    features["brain_age"] = _safe_loads(_field("brain_age_json")) or {}
    features["risk_scores"] = _safe_loads(_field("risk_scores_json")) or {}
    features["centiles"] = _safe_loads(_field("centiles_json")) or {}

    out: dict[str, float] = {}
    for path in feature_paths:
        val = _walk_number(features, path.split("."))
        if val is not None and not (isinstance(val, float) and math.isnan(val)):
            out[path] = val
    return out


# ── Trajectory loading ──────────────────────────────────────────────────────


def _row_date(row: Any) -> str | None:
    if isinstance(row, dict):
        return row.get("recording_date") or row.get("created_at") or None
    date = getattr(row, "recording_date", None)
    if date:
        return str(date)
    created = getattr(row, "created_at", None)
    if created is None:
        return None
    if hasattr(created, "isoformat"):
        return created.isoformat()
    return str(created)


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            return datetime.strptime(str(value)[: len(fmt) + 2], fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _compute_days_from_baseline(rows: list[Any]) -> list[int]:
    """Return a list aligned with ``rows`` giving days elapsed since index 0."""
    dates = [_parse_iso(_row_date(r)) for r in rows]
    baseline = dates[0] if dates and dates[0] else None
    out: list[int] = []
    for d in dates:
        if baseline is None or d is None:
            out.append(0)
        else:
            out.append(int((d - baseline).days))
    return out


def get_patient_trajectory(
    user_id: str,
    db_session: Any,
    *,
    feature_paths: Iterable[str] | None = None,
) -> Any:
    """Return all analyses for a patient ordered by ``days_from_baseline``.

    Parameters
    ----------
    user_id
        Patient identifier (the ``QEEGAnalysis.patient_id`` column).
    db_session
        A SQLAlchemy session. When ``None`` an empty list/dataframe is
        returned — useful for unit tests that don't have a DB up.
    feature_paths
        Optional whitelist of dotted paths to flatten. Defaults to
        :data:`_DEFAULT_FEATURE_PATHS`.

    Returns
    -------
    pandas.DataFrame when pandas is installed, otherwise list[dict].
    """
    if feature_paths is None:
        feature_paths = _DEFAULT_FEATURE_PATHS

    rows: list[Any] = []
    if db_session is not None:
        # Defer model import so the package keeps working in pure-pipeline
        # tests that don't have the API layer on sys.path.
        try:
            from app.persistence.models import QEEGAnalysis  # type: ignore[import-not-found]

            rows = (
                db_session.query(QEEGAnalysis)
                .filter_by(patient_id=user_id, analysis_status="completed")
                .order_by(QEEGAnalysis.created_at.asc())
                .all()
            )
        except Exception as exc:  # pragma: no cover — missing API or ORM issue
            log.warning("get_patient_trajectory: DB query failed: %s", exc)
            rows = []

    days = _compute_days_from_baseline(rows)
    records: list[dict[str, Any]] = []
    for i, row in enumerate(rows):
        flat = _flatten_analysis_features(row, feature_paths)
        rec = {
            "analysis_id": (row.id if not isinstance(row, dict) else row.get("id")),
            "recording_date": _row_date(row),
            "days_from_baseline": days[i],
            "session_number": i + 1,
        }
        rec.update(flat)
        records.append(rec)

    if HAS_PANDAS:
        return pd.DataFrame(records)  # type: ignore[union-attr]
    return records


def _to_records(trajectory: Any) -> list[dict[str, Any]]:
    """Normalise a DataFrame / list-of-dicts into list[dict]."""
    if trajectory is None:
        return []
    if HAS_PANDAS and hasattr(trajectory, "to_dict"):
        try:
            return [dict(r) for r in trajectory.to_dict(orient="records")]
        except Exception:  # pragma: no cover
            pass
    if isinstance(trajectory, list):
        return [dict(r) for r in trajectory]
    return []


# ── Change scores ───────────────────────────────────────────────────────────


def _benjamini_hochberg(pvals: list[float], q: float = 0.05) -> list[bool]:
    """Return a boolean mask of significant p-values under BH-FDR."""
    n = len(pvals)
    if n == 0:
        return []
    ordered = sorted(enumerate(pvals), key=lambda t: t[1])
    significant = [False] * n
    threshold_met_at: int | None = None
    for rank, (orig_idx, p) in enumerate(ordered, start=1):
        crit = (rank / n) * q
        if p <= crit:
            threshold_met_at = rank
    if threshold_met_at is not None:
        # Mark all p-values at ranks <= threshold_met_at as significant.
        for rank, (orig_idx, _p) in enumerate(ordered, start=1):
            if rank <= threshold_met_at:
                significant[orig_idx] = True
    return significant


def _reliable_change_index(values: list[float]) -> float:
    """Approximate RCI = (current - baseline) / SD(history).

    Uses the sample standard deviation across all values (not just pre-
    treatment) as a conservative noise estimate. When ``n<2`` or the
    standard deviation is zero we return 0.0 — the FDR mask will clamp
    the "significant" flag appropriately.
    """
    if len(values) < 2:
        return 0.0
    baseline = values[0]
    current = values[-1]
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / max(1, len(values) - 1)
    sd = math.sqrt(var)
    if sd == 0:
        return 0.0
    return (current - baseline) / sd


def _linear_slope(values: list[float], x: list[float] | None = None) -> float:
    """Least-squares slope of ``values`` vs ``x`` (index if ``x`` is None)."""
    n = len(values)
    if n < 2:
        return 0.0
    xs = list(x) if x is not None else list(range(n))
    x_mean = sum(xs) / n
    y_mean = sum(values) / n
    num = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(xs, values))
    den = sum((xi - x_mean) ** 2 for xi in xs)
    if den == 0:
        return 0.0
    return num / den


def _pvalue_from_rci(rci: float) -> float:
    """Approximate two-tailed p-value from an RCI using a normal tail."""
    # Abramowitz-Stegun series is overkill here — use a rough normal sf.
    try:
        from math import erfc
        return float(erfc(abs(rci) / math.sqrt(2.0)))
    except Exception:  # pragma: no cover
        return 1.0


def compute_change_scores(
    trajectory: Any,
    *,
    feature_keys: list[str] | None = None,
    fdr_q: float = 0.05,
) -> dict[str, Any]:
    """Per-feature change scores vs baseline with FDR-corrected p-values.

    Returns an empty dict when the trajectory contains fewer than two
    analyses (no change to compute).
    """
    records = _to_records(trajectory)
    if len(records) < 2:
        return {}

    # Which feature columns to score?
    if feature_keys is None:
        keys: set[str] = set()
        for rec in records:
            for k in rec.keys():
                if k in ("analysis_id", "recording_date", "days_from_baseline", "session_number"):
                    continue
                keys.add(k)
        feature_keys = sorted(keys)

    per_feature: dict[str, dict[str, float]] = {}
    rcis: list[float] = []
    pvals: list[float] = []
    for key in feature_keys:
        vals = [float(r[key]) for r in records if isinstance(r.get(key), (int, float))]
        if len(vals) < 2:
            continue
        rci = _reliable_change_index(vals)
        p = _pvalue_from_rci(rci)
        per_feature[key] = {
            "baseline": vals[0],
            "current": vals[-1],
            "delta": vals[-1] - vals[0],
            "rci": rci,
            "p_value": p,
            "n": len(vals),
        }
        rcis.append(rci)
        pvals.append(p)

    # FDR correction
    if pvals:
        keys_ordered = [k for k in feature_keys if k in per_feature]
        sig_mask = _benjamini_hochberg(pvals, q=fdr_q)
        for k, sig in zip(keys_ordered, sig_mask):
            per_feature[k]["significant"] = bool(sig)

    return per_feature


# ── Trajectory report ───────────────────────────────────────────────────────


def _build_plotly_html(records: list[dict[str, Any]], feature_paths: Iterable[str]) -> str | None:
    """Render a compact multi-line plot of feature trajectories.

    Returns a fragment of HTML (no <html> wrapper) so it can be injected
    into the dashboard template directly.
    """
    if not HAS_PLOTLY or not records:
        return None
    try:
        fig = _go.Figure()  # type: ignore[union-attr]
        xs = [rec.get("days_from_baseline", i) for i, rec in enumerate(records)]
        for path in feature_paths:
            ys = [rec.get(path) for rec in records]
            if not any(isinstance(v, (int, float)) for v in ys):
                continue
            fig.add_trace(
                _go.Scatter(  # type: ignore[union-attr]
                    x=xs,
                    y=ys,
                    mode="lines+markers",
                    name=path,
                )
            )
        fig.update_layout(
            title="qEEG Trajectory",
            xaxis_title="Days from baseline",
            yaxis_title="Feature value",
            template="plotly_white",
            height=420,
        )
        return fig.to_html(full_html=False, include_plotlyjs="cdn")
    except Exception as exc:  # pragma: no cover
        log.warning("Plotly render failed: %s", exc)
        return None


def _normative_distance(rec: dict[str, Any]) -> float | None:
    """Aggregate "distance to norm" score for a session.

    Uses the z-score norm (sqrt of sum of squares) across the risk-score
    fields that are present. Lower is better. Returns None when no
    risk-score signal is available.
    """
    terms = []
    for key, val in rec.items():
        if key.startswith("risk_scores.") and key.endswith(".score"):
            if isinstance(val, (int, float)):
                terms.append(float(val))
    if not terms:
        return None
    return float(math.sqrt(sum(t * t for t in terms) / len(terms)))


def generate_trajectory_report(
    user_id: str,
    db_session: Any,
    *,
    feature_paths: Iterable[str] | None = None,
) -> dict[str, Any]:
    """End-to-end trajectory payload for a patient.

    Shape (per CONTRACT_V2 §1 + task spec)::

        {
          "n_sessions": int,
          "baseline_date": str | None,
          "days_since_baseline": int,
          "feature_trajectories": {"<path>": {"values", "dates",
                                               "slope", "rci",
                                               "significant"}},
          "brain_age_trajectory": {"gap_years": [...], "dates": [...]},
          "normative_distance_trajectory": [...],
          "plotly_html": str | None,
        }
    """
    if feature_paths is None:
        feature_paths = _DEFAULT_FEATURE_PATHS
    feature_paths = list(feature_paths)

    trajectory = get_patient_trajectory(
        user_id,
        db_session,
        feature_paths=feature_paths,
    )
    records = _to_records(trajectory)

    n_sessions = len(records)
    baseline_date = records[0].get("recording_date") if records else None
    latest_day = int(records[-1].get("days_from_baseline", 0)) if records else 0

    change_scores = compute_change_scores(records, feature_keys=feature_paths)

    feature_trajectories: dict[str, dict[str, Any]] = {}
    for path in feature_paths:
        values: list[float] = []
        dates: list[str | None] = []
        day_axis: list[float] = []
        for rec in records:
            v = rec.get(path)
            if not isinstance(v, (int, float)):
                continue
            values.append(float(v))
            dates.append(rec.get("recording_date"))
            day_axis.append(float(rec.get("days_from_baseline", len(day_axis))))
        if not values:
            continue
        slope = _linear_slope(values, day_axis)
        cs = change_scores.get(path, {})
        feature_trajectories[path] = {
            "values": values,
            "dates": dates,
            "slope": slope,
            "rci": cs.get("rci", 0.0),
            "significant": bool(cs.get("significant", False)),
            "p_value": cs.get("p_value"),
        }

    brain_age_gaps = [
        rec.get("brain_age.gap_years") for rec in records
        if isinstance(rec.get("brain_age.gap_years"), (int, float))
    ]
    brain_age_dates = [
        rec.get("recording_date") for rec in records
        if isinstance(rec.get("brain_age.gap_years"), (int, float))
    ]

    normative_distance_trajectory: list[dict[str, Any]] = []
    for rec in records:
        d = _normative_distance(rec)
        normative_distance_trajectory.append({
            "session_number": rec.get("session_number"),
            "days_from_baseline": rec.get("days_from_baseline"),
            "distance": d,
        })

    plotly_html = _build_plotly_html(records, feature_paths) if HAS_PLOTLY else None

    return {
        "n_sessions": n_sessions,
        "baseline_date": baseline_date,
        "days_since_baseline": latest_day,
        "feature_trajectories": feature_trajectories,
        "brain_age_trajectory": {
            "gap_years": brain_age_gaps,
            "dates": brain_age_dates,
        },
        "normative_distance_trajectory": normative_distance_trajectory,
        "plotly_html": plotly_html,
        "is_stub": not (HAS_NUMPY and HAS_PANDAS),
    }


__all__ = [
    "HAS_NUMPY",
    "HAS_PANDAS",
    "HAS_PLOTLY",
    "get_patient_trajectory",
    "compute_change_scores",
    "generate_trajectory_report",
]
