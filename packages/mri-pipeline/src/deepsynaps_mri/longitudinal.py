"""
Longitudinal visit-to-visit change map.

Given two :class:`~deepsynaps_mri.schemas.MRIReport` instances (baseline
and follow-up) from the same patient, this module computes:

* **Volumetric change** per Desikan-Killiany ROI (cortical thickness +
  subcortical volume) as ``(followup - baseline) / baseline * 100`` — percent
  change per region, regions with ``|delta_pct| >= 2.5`` flagged.
* **FC-matrix delta** per functional network — within-network mean FC
  change vs baseline.
* **Bundle-FA delta** per DTI bundle — mean FA percent change per bundle.
* **(Optional)** If both T1 NIfTI paths are supplied *and* ``antspyx`` is
  importable, an ANTs SyN Jacobian-determinant map is computed and written
  to ``out_dir / "jacobian_determinant.nii.gz"``.  Graceful on missing
  ``antspyx`` — the longitudinal report is still fully usable without it.

The module also writes a red/blue divergent overlay PNG
(``baseline > followup`` = blue ``< 0``;  ``followup > baseline`` = red
``> 0``) when Matplotlib is available — recovery is rendered red, decline
blue, matching the convention described in the DeepSynaps dashboard spec.

Evidence
--------
* Reuter M et al., 2012, ``10.1016/j.neuroimage.2012.02.084`` — FreeSurfer
  longitudinal processing stream (within-subject template + bias reduction
  for change detection).
* Avants B et al., 2008 — Symmetric Normalization (SyN) and Jacobian-
  determinant maps for sub-percent volume change detection.
* TPS Alzheimer's 6-month follow-up — NCT05910619 (demonstrates clinically
  meaningful volumetric recovery at 6 months).

Decision-support only — not a substitute for clinician judgment. For
research / wellness use and neuronavigation planning only.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterable

from .schemas import (
    LongitudinalReport,
    MRIReport,
    NormedValue,
    RegionChange,
)

log = logging.getLogger(__name__)

# Flag regions where the absolute percent change crosses this threshold.
_FLAG_PCT_THRESHOLD: float = 2.5


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _nv(value) -> float | None:
    """Extract a numeric value from a :class:`NormedValue` or dict / float.

    The pipeline stores rehydrated reports as dicts, so longitudinal
    compares must survive either shape.
    """
    if value is None:
        return None
    if isinstance(value, NormedValue):
        return float(value.value) if value.value is not None else None
    if isinstance(value, dict):
        v = value.get("value")
        return float(v) if v is not None else None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _pct_change(baseline: float, followup: float) -> float:
    """Percent change ``(followup - baseline) / baseline * 100``.

    Returns ``0.0`` when ``baseline`` is ``0`` to avoid a ``ZeroDivisionError``;
    callers surface the absolute delta separately so zero-baseline regions
    remain informative.
    """
    if baseline == 0:
        return 0.0
    return (followup - baseline) / baseline * 100.0


def _structural_dict(report: MRIReport | dict | None, key: str) -> dict:
    """Fetch a region → NormedValue-ish dict out of a structural block."""
    if report is None:
        return {}
    if isinstance(report, dict):
        st = report.get("structural")
    else:
        st = report.structural
    if st is None:
        return {}
    if isinstance(st, dict):
        return dict(st.get(key) or {})
    return dict(getattr(st, key, {}) or {})


def _functional_networks(report: MRIReport | dict | None) -> list[dict]:
    """Flatten functional networks to a list of ``{network, within_fc}`` dicts."""
    if report is None:
        return []
    if isinstance(report, dict):
        func = report.get("functional")
    else:
        func = report.functional
    if func is None:
        return []
    if isinstance(func, dict):
        nets = func.get("networks") or []
    else:
        nets = getattr(func, "networks", None) or []
    out: list[dict] = []
    for n in nets:
        if isinstance(n, dict):
            name = n.get("network")
            fc = n.get("mean_within_fc")
        else:
            name = getattr(n, "network", None)
            fc = getattr(n, "mean_within_fc", None)
        val = _nv(fc)
        if name and val is not None:
            out.append({"network": str(name), "value": val})
    return out


def _diffusion_bundles(report: MRIReport | dict | None) -> list[dict]:
    """Flatten DTI bundles to a list of ``{bundle, mean_FA}`` dicts."""
    if report is None:
        return []
    if isinstance(report, dict):
        diff = report.get("diffusion")
    else:
        diff = report.diffusion
    if diff is None:
        return []
    if isinstance(diff, dict):
        bundles = diff.get("bundles") or []
    else:
        bundles = getattr(diff, "bundles", None) or []
    out: list[dict] = []
    for b in bundles:
        if isinstance(b, dict):
            name = b.get("bundle")
            fa = b.get("mean_FA")
        else:
            name = getattr(b, "bundle", None)
            fa = getattr(b, "mean_FA", None)
        val = _nv(fa)
        if name and val is not None:
            out.append({"bundle": str(name), "value": val})
    return out


def _region_change(
    region: str,
    baseline: float,
    followup: float,
    metric: str,
) -> RegionChange:
    delta_abs = followup - baseline
    delta_pct = _pct_change(baseline, followup)
    return RegionChange(
        region=region,
        baseline_value=baseline,
        followup_value=followup,
        delta_absolute=delta_abs,
        delta_pct=delta_pct,
        flagged=abs(delta_pct) >= _FLAG_PCT_THRESHOLD,
        metric=metric,  # type: ignore[arg-type]
    )


# ---------------------------------------------------------------------------
# Per-modality delta helpers
# ---------------------------------------------------------------------------
def _structural_deltas(
    baseline: MRIReport | dict,
    followup: MRIReport | dict,
) -> list[RegionChange]:
    rows: list[RegionChange] = []
    for key, metric in (
        ("cortical_thickness_mm", "cortical_thickness_mm"),
        ("subcortical_volume_mm3", "subcortical_volume_mm3"),
    ):
        b = _structural_dict(baseline, key)
        f = _structural_dict(followup, key)
        regions = set(b) | set(f)
        for region in sorted(regions):
            b_val = _nv(b.get(region))
            f_val = _nv(f.get(region))
            if b_val is None or f_val is None:
                continue
            rows.append(_region_change(region, b_val, f_val, metric))
    return rows


def _functional_deltas(
    baseline: MRIReport | dict,
    followup: MRIReport | dict,
) -> list[RegionChange]:
    b_nets = {n["network"]: n["value"] for n in _functional_networks(baseline)}
    f_nets = {n["network"]: n["value"] for n in _functional_networks(followup)}
    rows: list[RegionChange] = []
    for network in sorted(set(b_nets) | set(f_nets)):
        b_val = b_nets.get(network)
        f_val = f_nets.get(network)
        if b_val is None or f_val is None:
            continue
        rows.append(_region_change(network, b_val, f_val, "within_network_fc"))
    return rows


def _diffusion_deltas(
    baseline: MRIReport | dict,
    followup: MRIReport | dict,
) -> list[RegionChange]:
    b_bundles = {b["bundle"]: b["value"] for b in _diffusion_bundles(baseline)}
    f_bundles = {b["bundle"]: b["value"] for b in _diffusion_bundles(followup)}
    rows: list[RegionChange] = []
    for bundle in sorted(set(b_bundles) | set(f_bundles)):
        b_val = b_bundles.get(bundle)
        f_val = f_bundles.get(bundle)
        if b_val is None or f_val is None:
            continue
        rows.append(_region_change(bundle, b_val, f_val, "mean_FA"))
    return rows


# ---------------------------------------------------------------------------
# Jacobian + divergent overlay — both guarded on optional deps
# ---------------------------------------------------------------------------
def _compute_jacobian_map(
    baseline_t1: Path,
    followup_t1: Path,
    out_dir: Path,
) -> str | None:
    """Run ANTs SyN and return the path to the Jacobian-determinant NIfTI.

    Returns ``None`` if ``antspyx`` is missing or the registration fails.
    """
    try:  # pragma: no cover - optional dep
        import ants  # type: ignore
    except ImportError:
        log.info("antspyx not installed — skipping Jacobian map.")
        return None
    try:  # pragma: no cover - heavy
        fixed = ants.image_read(str(baseline_t1))
        moving = ants.image_read(str(followup_t1))
        reg = ants.registration(fixed=fixed, moving=moving, type_of_transform="SyN")
        jac = ants.create_jacobian_determinant_image(
            fixed, reg["fwdtransforms"][0], do_log=False
        )
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "jacobian_determinant.nii.gz"
        ants.image_write(jac, str(out_path))
        return str(out_path)
    except Exception as exc:  # pragma: no cover - guarded
        log.warning("Jacobian-determinant computation failed: %s", exc)
        return None


def _render_divergent_overlay(
    structural_changes: Iterable[RegionChange],
    out_dir: Path,
) -> str | None:
    """Render a red/blue divergent bar chart of the top structural changes.

    Baseline > follow-up (decline) = blue; follow-up > baseline (recovery)
    = red. Returns ``None`` when Matplotlib is missing. This is a
    lightweight summary image — the production pipeline layers this on top
    of the T1_MNI volume in :mod:`deepsynaps_mri.overlay`.
    """
    try:  # pragma: no cover - optional dep
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        log.info("matplotlib not installed — skipping change-overlay PNG.")
        return None

    changes = sorted(
        list(structural_changes), key=lambda c: abs(c.delta_pct), reverse=True
    )[:15]
    if not changes:
        return None

    try:  # pragma: no cover - rendering branch
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "longitudinal_change_overlay.png"
        fig, ax = plt.subplots(figsize=(6, max(2.0, 0.3 * len(changes))))
        regions = [c.region for c in changes]
        pcts = [c.delta_pct for c in changes]
        colors = ["#ef4444" if p >= 0 else "#3b82f6" for p in pcts]
        ax.barh(regions, pcts, color=colors)
        ax.axvline(0, color="#6b7280", linewidth=0.8)
        ax.set_xlabel("Δ% (follow-up vs baseline)")
        ax.set_title("Longitudinal volumetric change (top |Δ%|)")
        fig.tight_layout()
        fig.savefig(out_path, dpi=120)
        plt.close(fig)
        return str(out_path)
    except Exception as exc:
        log.warning("Overlay rendering failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Summary text
# ---------------------------------------------------------------------------
def _build_summary(
    structural: list[RegionChange],
    functional: list[RegionChange],
    diffusion: list[RegionChange],
) -> str:
    """Short summary sentence — picks the largest |delta| per modality."""
    parts: list[str] = []
    if structural:
        top = max(structural, key=lambda c: abs(c.delta_pct))
        sign = "+" if top.delta_pct >= 0 else ""
        parts.append(f"{top.region} {top.metric.replace('_', ' ')} {sign}{top.delta_pct:.1f}%")
    if diffusion:
        top = max(diffusion, key=lambda c: abs(c.delta_pct))
        sign = "+" if top.delta_pct >= 0 else ""
        parts.append(f"FA in {top.region} {sign}{top.delta_pct:.1f}%")
    if functional:
        top = max(functional, key=lambda c: abs(c.delta_pct))
        sign = "+" if top.delta_pct >= 0 else ""
        parts.append(
            f"{top.region} within-FC {sign}{top.delta_absolute:.2f} "
            f"({sign}{top.delta_pct:.1f}%)"
        )
    if not parts:
        return "No comparable regions between baseline and follow-up."
    return " · ".join(parts)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def compute_change_map(
    baseline_report: MRIReport | dict,
    followup_report: MRIReport | dict,
    baseline_t1_path: Path | None = None,
    followup_t1_path: Path | None = None,
    out_dir: Path | None = None,
    days_between: int | None = None,
) -> LongitudinalReport:
    """Compute the visit-to-visit change map for one patient.

    Parameters
    ----------
    baseline_report, followup_report :
        :class:`MRIReport` instances (or their JSON-rehydrated dicts) for
        the same patient. The caller is responsible for enforcing
        ``baseline.patient.patient_id == followup.patient.patient_id``.
    baseline_t1_path, followup_t1_path :
        Optional absolute paths to the baseline / follow-up T1 NIfTI
        volumes. If both supplied **and** ``antspyx`` is importable, a
        SyN-based Jacobian-determinant map is computed and its path is
        returned in ``jacobian_determinant_s3``.
    out_dir :
        Optional directory for rendered artefacts (Jacobian NIfTI,
        divergent overlay PNG). Created if missing.
    days_between :
        Optional number of days between baseline and follow-up acquisition
        — surfaced on the returned :class:`LongitudinalReport`.

    Returns
    -------
    LongitudinalReport
        Structured deltas + optional artefact paths. Always safe to
        serialise; heavy deps are treated as optional.
    """
    log.info(
        "compute_change_map: baseline=%s followup=%s days_between=%s",
        _analysis_id(baseline_report),
        _analysis_id(followup_report),
        days_between,
    )

    structural_changes = _structural_deltas(baseline_report, followup_report)
    functional_changes = _functional_deltas(baseline_report, followup_report)
    diffusion_changes = _diffusion_deltas(baseline_report, followup_report)

    jacobian_path: str | None = None
    overlay_path: str | None = None
    if out_dir is not None:
        out_dir = Path(out_dir)
        if baseline_t1_path and followup_t1_path:
            jacobian_path = _compute_jacobian_map(
                Path(baseline_t1_path),
                Path(followup_t1_path),
                out_dir,
            )
        overlay_path = _render_divergent_overlay(structural_changes, out_dir)

    summary = _build_summary(structural_changes, functional_changes, diffusion_changes)

    return LongitudinalReport(
        baseline_analysis_id=_analysis_uuid(baseline_report),
        followup_analysis_id=_analysis_uuid(followup_report),
        days_between=days_between,
        structural_changes=structural_changes,
        functional_changes=functional_changes,
        diffusion_changes=diffusion_changes,
        jacobian_determinant_s3=jacobian_path,
        change_overlay_png_s3=overlay_path,
        summary=summary,
    )


# ---------------------------------------------------------------------------
# UUID helpers (tolerate dict rehydration)
# ---------------------------------------------------------------------------
def _analysis_id(report: MRIReport | dict) -> str:
    if isinstance(report, dict):
        return str(report.get("analysis_id", "") or "")
    return str(report.analysis_id)


def _analysis_uuid(report: MRIReport | dict):
    from uuid import UUID, uuid4

    raw = _analysis_id(report)
    if not raw:
        return uuid4()
    try:
        return UUID(raw)
    except (TypeError, ValueError):
        # Accept arbitrary string IDs — synthesise a deterministic UUIDv5
        # rather than fail the whole compare call.
        from uuid import uuid5, NAMESPACE_URL

        return uuid5(NAMESPACE_URL, f"deepsynaps-mri://{raw}")
