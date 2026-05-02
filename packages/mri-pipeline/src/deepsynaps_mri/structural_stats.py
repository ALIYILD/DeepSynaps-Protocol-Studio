"""
Parse FreeSurfer-style stats files and SynthSeg ``volumes.csv`` into raw dicts.

Used by :func:`deepsynaps_mri.structural.extract_structural_metrics`. Normative
z-scores remain ``None`` until ``data/norms/istaging.csv`` (or equivalent) is
wired — see CLAUDE.md.
"""
from __future__ import annotations

import csv
import logging
from pathlib import Path

log = logging.getLogger(__name__)


def _parse_fs_colheaders_line(line: str) -> list[str]:
    """Split a ``# ColHeaders ...`` line into column names (no '#')."""
    parts = line.strip().split()
    if len(parts) < 2 or parts[0] != "#":
        return []
    if parts[1] != "ColHeaders":
        return []
    return parts[2:]


def parse_aseg_stats(path: Path) -> tuple[dict[str, float], float | None]:
    """
    Parse FreeSurfer ``aseg.stats`` into ``(region_name -> mm3, icv_ml)``.

    ICV is taken from ``# Measure `` lines (IntracranialVolume / eTIV) when present.
    """
    text = path.read_text(encoding="utf-8", errors="replace").splitlines()
    icv_ml: float | None = None
    for ln in text:
        if ln.startswith("# Measure ") and "mm^3" in ln:
            # e.g. # Measure IntracranialVolume, ICV, ..., 1456234.0, mm^3
            parts = [p.strip() for p in ln.split(",")]
            if len(parts) >= 2 and parts[-1].strip().startswith("mm^3"):
                try:
                    icv_ml = float(parts[-2]) / 1000.0
                except ValueError:
                    continue
                break

    headers: list[str] = []
    volumes: dict[str, float] = {}
    for ln in text:
        if ln.startswith("# ColHeaders"):
            headers = _parse_fs_colheaders_line(ln)
            continue
        if ln.startswith("#") or not ln.strip():
            continue
        cols = ln.split()
        if not headers:
            continue
        row = dict(zip(headers, cols, strict=False))
        name = row.get("StructName")
        vol_s = row.get("Volume_mm3")
        if name and vol_s:
            try:
                volumes[str(name)] = float(vol_s)
            except ValueError:
                continue

    if not volumes:
        log.warning("aseg.stats parse produced no regions: %s", path)

    return volumes, icv_ml


def parse_aparc_stats_thickness(path: Path) -> dict[str, float]:
    """Parse ``lh.aparc.stats`` or ``rh.aparc.stats`` → ``region -> mean thickness mm``."""
    text = path.read_text(encoding="utf-8", errors="replace").splitlines()
    headers: list[str] = []
    thick: dict[str, float] = {}
    for ln in text:
        if ln.startswith("# ColHeaders"):
            headers = _parse_fs_colheaders_line(ln)
            continue
        if ln.startswith("#") or not ln.strip():
            continue
        cols = ln.split()
        if not headers:
            continue
        row = dict(zip(headers, cols, strict=False))
        name = row.get("StructName")
        t_s = row.get("ThickAvg")
        if name and t_s:
            try:
                thick[str(name)] = float(t_s)
            except ValueError:
                continue
    return thick


def parse_synthseg_volumes_csv(path: Path) -> dict[str, float]:
    """
    Parse SynthSeg ``--vol`` CSV: header row with structure names, numeric row(s).

    Values are typically mm³; keys are column headers (FreeSurfer label names
    or numeric IDs depending on SynthSeg version).
    """
    with path.open(encoding="utf-8", errors="replace", newline="") as f:
        r = csv.reader(f)
        rows = list(r)
    if len(rows) < 2:
        log.warning("volumes.csv has insufficient rows: %s", path)
        return {}
    header = [h.strip() for h in rows[0]]
    out: dict[str, float] = {}
    # Use first numeric data row (SynthSeg often writes one subject row)
    for data_row in rows[1:]:
        if not data_row or all(not c.strip() for c in data_row):
            continue
        for h, cell in zip(header, data_row, strict=False):
            if not h:
                continue
            try:
                out[h] = float(cell)
            except ValueError:
                continue
        break
    return out


def estimate_icv_from_synthseg_volumes(volumes_mm3: dict[str, float]) -> float | None:
    """Best-effort ICV (mL) from SynthSeg label volumes when an explicit ICV column is absent."""
    # Common aggregate labels (SynthSeg / FastSurfer naming varies)
    keys_icv = (
        "Intracranial",
        "intracranial",
        "ICV",
        "EstimatedTotalIntraCranialVol",
    )
    for k in keys_icv:
        if k in volumes_mm3:
            return volumes_mm3[k] / 1000.0
    # Sum brain tissue label volumes — heuristic only
    exclude = {"CSF", "Background", "background", "Unknown"}
    total = 0.0
    n = 0
    for name, val in volumes_mm3.items():
        if name in exclude:
            continue
        if val <= 0:
            continue
        total += val
        n += 1
    if n == 0:
        return None
    return total / 1000.0
