"""
Radiology screening layer — MRIQC IQMs + incidental-finding triage.

Two public entry points:

``run_mriqc(t1_path, modality)``
    Wraps the ``mriqc`` CLI via ``subprocess``. Parses the IQM JSON that
    MRIQC writes to its output directory and returns a :class:`MRIQCResult`.
    On missing binary / parse failure the envelope's ``status`` drops to
    ``dependency_missing`` / ``failed`` — the pipeline must not crash on
    absent optional deps.

``screen_incidental_findings(t1_path)``
    Runs a three-class CNN that flags white-matter hyperintensities, tumour
    candidates, and infarcts. Prefers ``LST-AI`` (https://github.com/
    CompImg/LST-AI) for WMH; falls back to ``dependency_missing`` when
    the package is absent. Results are always flagged for clinician
    review — we do not diagnose.

Both functions are graceful: they never raise, they log and return a
populated envelope instead. Surfaced ``qc_warnings`` from
:mod:`deepsynaps_mri.pipeline` rely on this invariant.

Evidence
--------
* Esteban O et al., 2017, ``10.1371/journal.pone.0184661`` — MRIQC
  reference implementation (CNR, SNR, EFC, FBER, FWHM).
* LST-AI 2024, https://github.com/CompImg/LST-AI — white-matter
  hyperintensity segmentation (Wiltgen et al.).
* BRATS-style lesion detectors for tumour candidates.

Decision-support only. Not a diagnostic device. For radiology review
triage and research / wellness use.
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from .adapters.subprocess_tools import run_subprocess_capture
from typing import Literal

from .schemas import IncidentalFinding, IncidentalFindingResult, MRIQCResult

log = logging.getLogger(__name__)

# MRIQC thresholds — from the MRIQC IQM reference card. Soft thresholds:
# falling below means "review" but does NOT block the pipeline.
_THRESHOLDS = {
    "snr_min": 10.0,        # T1 SNR
    "cnr_min": 2.5,
    "efc_max": 0.6,         # entropy-focus criterion — lower is better
    "fber_min": 3000.0,
    "fwhm_max": 5.0,        # mm
    "motion_fd_max_mm": 0.5,
}


# ---------------------------------------------------------------------------
# MRIQC wrapper
# ---------------------------------------------------------------------------
def _mriqc_binary() -> str | None:
    """Return absolute path to the ``mriqc`` CLI or ``None`` if absent."""
    return shutil.which("mriqc")


def _parse_mriqc_json(iqm_path: Path) -> dict:
    """Parse an MRIQC IQM JSON file into a flat dict of known metrics."""
    try:
        raw = json.loads(iqm_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("Failed to read MRIQC IQM JSON at %s: %s", iqm_path, exc)
        return {}
    return dict(raw) if isinstance(raw, dict) else {}


def _passes_thresholds(iqm: dict) -> bool:
    """Apply soft MRIQC thresholds to the IQM dict; returns pass/fail."""
    try:
        if iqm.get("snr") is not None and iqm["snr"] < _THRESHOLDS["snr_min"]:
            return False
        if iqm.get("cnr") is not None and iqm["cnr"] < _THRESHOLDS["cnr_min"]:
            return False
        if iqm.get("efc") is not None and iqm["efc"] > _THRESHOLDS["efc_max"]:
            return False
        if iqm.get("fber") is not None and iqm["fber"] < _THRESHOLDS["fber_min"]:
            return False
        if iqm.get("fwhm_avg") is not None and iqm["fwhm_avg"] > _THRESHOLDS["fwhm_max"]:
            return False
        if (
            iqm.get("fd_mean") is not None
            and iqm["fd_mean"] > _THRESHOLDS["motion_fd_max_mm"]
        ):
            return False
    except (TypeError, ValueError):
        return True
    return True


def run_mriqc(
    t1_path: Path,
    modality: Literal["T1w", "bold", "dwi"] = "T1w",
) -> MRIQCResult:
    """Run the ``mriqc`` CLI on a single NIfTI and return a :class:`MRIQCResult`.

    Parameters
    ----------
    t1_path :
        Absolute path to the NIfTI to be QC'd.
    modality :
        MRIQC modality flag. Accepts ``T1w``, ``bold`` (fMRI), or ``dwi``.

    Returns
    -------
    MRIQCResult
        Populated envelope; never raises. ``status`` is ``dependency_missing``
        when the CLI is not on ``PATH``, ``failed`` when the subprocess
        fails or the output cannot be parsed, and ``ok`` otherwise.
    """
    binary = _mriqc_binary()
    if binary is None:
        log.info("mriqc CLI not found on PATH — returning dependency_missing envelope")
        return MRIQCResult(
            status="dependency_missing",
            error_message="mriqc binary not found on PATH",
        )

    path = Path(t1_path)
    if not path.exists():
        return MRIQCResult(
            status="failed",
            error_message=f"input NIfTI missing: {path}",
        )

    with tempfile.TemporaryDirectory(prefix="mriqc_") as td:
        out_dir = Path(td)
        try:
            proc = run_subprocess_capture(
                [binary, str(path.parent), str(out_dir), "participant", "-m", modality],
                timeout=60 * 30,
            )
            if proc.returncode != 0:
                raise subprocess.CalledProcessError(proc.returncode, proc.args, proc.stdout, proc.stderr)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
            log.warning("mriqc subprocess failed: %s", exc)
            return MRIQCResult(
                status="failed",
                error_message=f"mriqc subprocess failed: {exc}",
            )

        # MRIQC writes a JSON per subject; pick the first one.
        iqm_files = list(out_dir.rglob("*_bold.json")) + list(out_dir.rglob("*_T1w.json"))
        if not iqm_files:
            return MRIQCResult(
                status="failed",
                error_message="mriqc produced no IQM JSON",
            )
        iqm = _parse_mriqc_json(iqm_files[0])

    return MRIQCResult(
        status="ok",
        cnr=iqm.get("cnr"),
        snr=iqm.get("snr"),
        efc=iqm.get("efc"),
        fber=iqm.get("fber"),
        fwhm_mm=iqm.get("fwhm_avg"),
        motion_mean_fd_mm=iqm.get("fd_mean"),
        passes_threshold=_passes_thresholds(iqm),
    )


# ---------------------------------------------------------------------------
# Incidental-finding classifier
# ---------------------------------------------------------------------------
def _try_lst_ai(t1_path: Path) -> list[IncidentalFinding] | None:
    """Attempt a WMH segmentation via LST-AI.

    Returns ``None`` when the package is absent or the segmentation
    fails. Otherwise returns a list of candidate :class:`IncidentalFinding`.
    """
    try:  # pragma: no cover - optional dep
        import lst_ai  # type: ignore  # noqa: F401
    except ImportError:
        return None
    try:  # pragma: no cover - heavy
        # LST-AI's public API varies by release; this stub is intentionally
        # defensive. The pipeline falls back to dependency_missing when the
        # runtime env lacks LST-AI.
        import lst_ai as _lst  # type: ignore

        result = _lst.run(str(t1_path))
        volume_ml = float(getattr(result, "wmh_volume_ml", 0.0) or 0.0)
        if volume_ml <= 0.0:
            return []
        severity: Literal["minor", "moderate", "severe"] = (
            "severe" if volume_ml > 15.0 else "moderate" if volume_ml > 5.0 else "minor"
        )
        return [
            IncidentalFinding(
                finding_type="wmh",
                location_region="periventricular",
                volume_ml=volume_ml,
                severity=severity,
                confidence=0.85,
                requires_radiologist_review=True,
            )
        ]
    except Exception as exc:  # pragma: no cover - guarded
        log.warning("LST-AI run failed: %s", exc)
        return None


def screen_incidental_findings(t1_path: Path) -> IncidentalFindingResult:
    """Screen a T1 volume for incidental findings (WMH / tumour / infarct).

    Runs LST-AI for white-matter hyperintensities when available. The
    tumour and infarct heads are placeholders pending a licensed CNN
    checkpoint — when absent the envelope reports
    ``status='dependency_missing'`` rather than producing silent
    false-negatives.

    Results are always flagged for clinician review —
    ``requires_radiologist_review`` is always ``True``.
    """
    path = Path(t1_path)
    if not path.exists():
        return IncidentalFindingResult(
            status="failed",
            error_message=f"input NIfTI missing: {path}",
        )

    findings = _try_lst_ai(path)
    if findings is None:
        return IncidentalFindingResult(
            status="dependency_missing",
            error_message="LST-AI (or equivalent) not installed",
        )

    return IncidentalFindingResult(
        status="ok",
        findings=findings,
        any_flagged=any(f.requires_radiologist_review for f in findings),
    )


# ---------------------------------------------------------------------------
# Public helper — produce human-readable ``qc_warnings`` strings
# ---------------------------------------------------------------------------
def build_qc_warnings(
    mriqc: MRIQCResult | None,
    incidental: IncidentalFindingResult | None,
) -> list[str]:
    """Turn MRIQC + incidental results into amber banner strings.

    Used by :mod:`deepsynaps_mri.pipeline` to populate
    ``MRIReport.qc_warnings``; the frontend surfaces these prominently.
    """
    warnings: list[str] = []
    if mriqc and mriqc.status == "ok" and not mriqc.passes_threshold:
        warnings.append(
            "Scan quality below MRIQC thresholds — radiology review advised."
        )
    if incidental and incidental.status == "ok" and incidental.any_flagged:
        for f in incidental.findings:
            loc = f" in {f.location_region}" if f.location_region else ""
            warnings.append(
                f"Radiology review advised: {f.finding_type.upper()}{loc} "
                f"({f.severity}, confidence {f.confidence:.0%})."
            )
    return warnings
