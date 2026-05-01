"""
Morphometry aggregation and MRI report payload assembly.

Parses **FreeSurfer-style** ``aseg.stats`` and **SynthSeg-style** ``volumes.csv``,
computes regional asymmetry indices, and merges results into :class:`StructuralMetrics`
for :class:`MRIReport` without any HTML/PDF rendering.

Decision-support / research context — not diagnostic.
"""
from __future__ import annotations

import csv
import json
import logging
import re
from pathlib import Path
from typing import Literal
from uuid import UUID

from pydantic import ValidationError

from .cortical_thickness import RegionalThicknessSummary
from .schemas import (
    AsymmetryIndexRow,
    AsymmetryResult,
    MedRAGFinding,
    MedRAGQuery,
    Modality,
    MRIAnalysisReportPayload,
    MRIReport,
    MorphometryProvenance,
    MorphometrySummary,
    NormedValue,
    PatientMeta,
    QCMetrics,
    RegionalVolumeRow,
    RegionalVolumesResult,
    SegmentationEngine,
    StructuralMetrics,
)

log = logging.getLogger(__name__)

# Common FreeSurfer aseg pairs for asymmetry (StructName as in aseg.stats)
_DEFAULT_ASYMMETRY_PAIRS: tuple[tuple[str, str], ...] = (
    ("Left-Hippocampus", "Right-Hippocampus"),
    ("Left-Amygdala", "Right-Amygdala"),
    ("Left-Thalamus-Proper", "Right-Thalamus-Proper"),
    ("Left-Putamen", "Right-Putamen"),
    ("Left-Caudate", "Right-Caudate"),
    ("Left-Pallidum", "Right-Pallidum"),
)


def _morph_dir(artefacts_dir: Path) -> Path:
    d = artefacts_dir / "morphometry"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _structure_to_metric_key(struct_name: str) -> str:
    """Map FreeSurfer StructName to snake_case key (portal-friendly)."""
    s = struct_name.strip()
    # Normalize common left/right prefixes
    if s.startswith("Left-"):
        base = s[5:].replace("-", "_").lower()
        return f"{base}_l"
    if s.startswith("Right-"):
        base = s[5:].replace("-", "_").lower()
        return f"{base}_r"
    return s.replace("-", "_").lower()


def _parse_aseg_stats(path: Path) -> tuple[list[RegionalVolumeRow], float | None]:
    """Parse aseg.stats; return rows + ICV (EstimatedTotalIntraCranialVol) in mm³."""
    text = path.read_text(encoding="utf-8", errors="replace").splitlines()
    rows: list[RegionalVolumeRow] = []
    icv: float | None = None

    for line in text:
        if line.startswith("# Measure EstimatedTotalIntraCranialVol"):
            # ... EstimatedTotalIntraCranialVol, 1234567.000000, 1234567, mm^3
            segs = [s.strip() for s in line.split(",")]
            for s in segs:
                try:
                    icv = float(s)
                    break
                except ValueError:
                    continue
            continue
        if line.startswith("#") or not line.strip():
            continue
        parts = line.split()
        if len(parts) < 5:
            continue
        try:
            # FS table: Index SegId NVoxels Volume_mm3 StructName ...
            seg_id = int(parts[1])
            n_vox = int(parts[2])
            struct_name = parts[4]
            vol = float(parts[3])
        except (ValueError, IndexError):
            continue
        rows.append(
            RegionalVolumeRow(
                region_id=f"aseg.{struct_name}",
                structure_name=struct_name,
                volume_mm3=vol,
                seg_id=seg_id,
                n_voxels=n_vox,
                source="freesurfer_aseg",
            )
        )

    return rows, icv


def compute_regional_volumes(
    *,
    artefacts_dir: str | Path,
    aseg_stats_path: str | Path | None = None,
    synthseg_volumes_csv: str | Path | None = None,
) -> RegionalVolumesResult:
    """
    Load regional volumes from **one** source (FreeSurfer ``aseg.stats`` or SynthSeg CSV).

    SynthSeg ``volumes.csv``: first non-comment row holds numeric volumes; header row
    with structure names is detected when the first line starts with ``#`` or contains names.
    """
    root = Path(artefacts_dir).resolve()
    mdir = _morph_dir(root)

    if aseg_stats_path is not None:
        p = Path(aseg_stats_path).resolve()
        if not p.is_file():
            return RegionalVolumesResult(
                ok=False,
                source="none",
                code="aseg_missing",
                message=str(p),
            )
        try:
            rows, icv = _parse_aseg_stats(p)
        except Exception as exc:  # noqa: BLE001
            log.exception("aseg.stats parse failed")
            return RegionalVolumesResult(
                ok=False,
                source="freesurfer_aseg",
                stats_path=str(p),
                code="parse_failed",
                message=str(exc),
            )
        res = RegionalVolumesResult(
            ok=True,
            source="freesurfer_aseg",
            rows=rows,
            icv_mm3=icv,
            stats_path=str(p),
            message="ok",
        )
        out = mdir / "regional_volumes.json"
        out.write_text(json.dumps(res.to_dict(), indent=2), encoding="utf-8")
        return res.model_copy(update={"manifest_path": str(out.resolve())})

    if synthseg_volumes_csv is not None:
        p = Path(synthseg_volumes_csv).resolve()
        if not p.is_file():
            return RegionalVolumesResult(
                ok=False,
                source="none",
                code="csv_missing",
                message=str(p),
            )
        try:
            rows = _parse_synthseg_volumes_csv(p)
        except Exception as exc:  # noqa: BLE001
            log.exception("volumes.csv parse failed")
            return RegionalVolumesResult(
                ok=False,
                source="synthseg_csv",
                stats_path=str(p),
                code="parse_failed",
                message=str(exc),
            )
        res = RegionalVolumesResult(
            ok=True,
            source="synthseg_csv",
            rows=rows,
            icv_mm3=None,
            stats_path=str(p),
            message="ok",
        )
        out = mdir / "regional_volumes.json"
        out.write_text(json.dumps(res.to_dict(), indent=2), encoding="utf-8")
        return res.model_copy(update={"manifest_path": str(out.resolve())})

    return RegionalVolumesResult(
        ok=False,
        source="none",
        code="no_input",
        message="Provide aseg_stats_path or synthseg_volumes_csv",
    )


def _parse_synthseg_volumes_csv(path: Path) -> list[RegionalVolumeRow]:
    """Parse SynthSeg ``--vol`` CSV: one row of values, header with structure names."""
    with path.open(encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        header: list[str] | None = None
        values: list[str] | None = None
        for row in reader:
            if not row:
                continue
            if row[0].strip().startswith("#") or not _row_looks_numeric(row):
                header = [c.strip() for c in row]
                continue
            values = row
            break
        if header is None or values is None:
            raise ValueError("Could not find header and data row in volumes.csv")
        if len(header) != len(values):
            raise ValueError(f"Header len {len(header)} != values len {len(values)}")
        rows: list[RegionalVolumeRow] = []
        for name, val in zip(header, values, strict=True):
            if not name or name.startswith("#"):
                continue
            try:
                v = float(val)
            except ValueError:
                continue
            key = re.sub(r"\s+", "_", name.strip()).lower()
            rows.append(
                RegionalVolumeRow(
                    region_id=f"synthseg.{key}",
                    structure_name=name.strip(),
                    volume_mm3=v,
                    source="synthseg_csv",
                )
            )
        return rows


def _row_looks_numeric(row: list[str]) -> bool:
    try:
        float(row[0])
        return True
    except (ValueError, IndexError):
        return False


def compute_asymmetry_indices(
    volumes: RegionalVolumesResult,
    artefacts_dir: str | Path,
    *,
    pairs: tuple[tuple[str, str], ...] | None = None,
    threshold_abs_pct: float = 10.0,
) -> AsymmetryResult:
    """
    Asymmetry index (AI) per pair: ``100 * (L - R) / mean(L, R)``.

    ``pairs`` use **exact** ``structure_name`` strings from ``aseg.stats`` (e.g.
    ``Left-Hippocampus`` / ``Right-Hippocampus``).
    """
    root = Path(artefacts_dir).resolve()
    mdir = _morph_dir(root)
    if not volumes.ok:
        return AsymmetryResult(
            ok=False,
            code="volumes_not_ok",
            message="RegionalVolumesResult.ok is False",
        )

    by_name = {r.structure_name: r for r in volumes.rows}
    use_pairs = pairs if pairs is not None else _DEFAULT_ASYMMETRY_PAIRS
    indices: list[AsymmetryIndexRow] = []

    for left_n, right_n in use_pairs:
        lr = by_name.get(left_n)
        rr = by_name.get(right_n)
        if lr is None or rr is None:
            continue
        lvol, rvol = lr.volume_mm3, rr.volume_mm3
        mean_v = (lvol + rvol) / 2.0
        if mean_v <= 0:
            continue
        ai = 100.0 * (lvol - rvol) / mean_v
        base = left_n.replace("Left-", "").replace("-", "_").lower()
        indices.append(
            AsymmetryIndexRow(
                region_base=base,
                left_structure=left_n,
                right_structure=right_n,
                volume_left_mm3=lvol,
                volume_right_mm3=rvol,
                asymmetry_index_pct=float(ai),
                flagged=abs(ai) >= threshold_abs_pct,
            )
        )

    res = AsymmetryResult(
        ok=True,
        indices=indices,
        threshold_abs_pct=threshold_abs_pct,
        message="ok",
    )
    out = mdir / "asymmetry_indices.json"
    out.write_text(json.dumps(res.to_dict(), indent=2), encoding="utf-8")
    return res.model_copy(update={"manifest_path": str(out.resolve())})


def summarize_morphometry(
    *,
    artefacts_dir: str | Path,
    regional_volumes: RegionalVolumesResult,
    asymmetry: AsymmetryResult | None = None,
    regional_thickness_summary_path: str | Path | None = None,
    atlas: str = "Desikan-Killiany",
    segmentation_engine: str | None = None,
    norm_db_version: str | None = None,
) -> MorphometrySummary:
    """
    Merge volume + asymmetry (+ optional thickness summary path) into one summary with QC flags.
    """
    qc_flags: list[str] = []
    if not regional_volumes.ok:
        qc_flags.append("regional_volumes_failed")
    if asymmetry and asymmetry.ok:
        for row in asymmetry.indices:
            if row.flagged:
                qc_flags.append(f"asymmetry_flagged:{row.region_base}")
    thickness_path_str: str | None = None
    if regional_thickness_summary_path is not None:
        tp = Path(regional_thickness_summary_path).resolve()
        thickness_path_str = str(tp)
        if not tp.is_file():
            qc_flags.append("thickness_summary_missing")

    prov = MorphometryProvenance(
        regional_volumes_source=regional_volumes.source if regional_volumes.ok else None,
        regional_volumes_path=regional_volumes.stats_path,
        asymmetry_manifest_path=asymmetry.manifest_path if asymmetry and asymmetry.ok else None,
        thickness_summary_path=thickness_path_str,
        segmentation_engine=segmentation_engine,
        norm_db_version=norm_db_version,
    )

    summary = MorphometrySummary(
        ok=regional_volumes.ok,
        atlas=atlas,
        n_regions_volume=len(regional_volumes.rows) if regional_volumes.ok else 0,
        n_asymmetry_pairs=len(asymmetry.indices) if asymmetry and asymmetry.ok else 0,
        qc_flags=qc_flags,
        provenance=prov,
        message="ok" if regional_volumes.ok else regional_volumes.message,
    )
    root = Path(artefacts_dir).resolve()
    mdir = _morph_dir(root)
    sp = mdir / "morphometry_summary.json"
    sp.write_text(summary.model_dump_json(indent=2), encoding="utf-8")
    log.info("Morphometry summary written: %s", sp)
    return summary.model_copy(update={"summary_path": str(sp.resolve())})


def _structural_from_morphometry(
    regional_volumes: RegionalVolumesResult,
    asymmetry: AsymmetryResult | None,
    thickness_summary_path: Path | None,
    *,
    icv_ml: float | None = None,
    atlas: str = "Desikan-Killiany",
) -> StructuralMetrics:
    """Build StructuralMetrics dicts from morphometry tables (no normative z-scores)."""
    subcortical: dict[str, NormedValue] = {}
    if regional_volumes.ok:
        for r in regional_volumes.rows:
            key = _structure_to_metric_key(r.structure_name)
            subcortical[key] = NormedValue(value=float(r.volume_mm3), unit="mm^3")

    if asymmetry and asymmetry.ok:
        for row in asymmetry.indices:
            if row.flagged:
                k = f"asym_{row.region_base}_pct"
                subcortical[k] = NormedValue(
                    value=float(row.asymmetry_index_pct),
                    unit="%_AI",
                    flagged=True,
                )

    thickness: dict[str, NormedValue] = {}
    if thickness_summary_path and thickness_summary_path.is_file():
        try:
            data = json.loads(thickness_summary_path.read_text(encoding="utf-8"))
            rts = RegionalThicknessSummary.model_validate(data)
            if rts.ok:
                for row in rts.regions:
                    tkey = row.region_id.replace(".", "_")
                    thickness[tkey] = NormedValue(value=float(row.mean_thickness_mm), unit="mm")
        except (ValidationError, json.JSONDecodeError) as exc:
            log.warning("Could not load thickness summary: %s", exc)

    return StructuralMetrics(
        atlas=atlas,
        cortical_thickness_mm=thickness,
        subcortical_volume_mm3=subcortical,
        icv_ml=icv_ml,
    )


def _medrag_from_morphometry(
    regional_volumes: RegionalVolumesResult,
    asymmetry: AsymmetryResult | None,
) -> MedRAGQuery:
    findings: list[MedRAGFinding] = []
    if regional_volumes.ok:
        for r in regional_volumes.rows[:50]:
            findings.append(
                MedRAGFinding(
                    type="region_metric",
                    value=f"volume_{_structure_to_metric_key(r.structure_name)}",
                )
            )
    if asymmetry and asymmetry.ok:
        for row in asymmetry.indices:
            if row.flagged:
                findings.append(
                    MedRAGFinding(
                        type="region_metric",
                        value=f"asymmetry_{row.region_base}",
                        polarity=1 if row.asymmetry_index_pct > 0 else -1,
                    )
                )
    return MedRAGQuery(findings=findings)


def generate_mri_analysis_report_payload(
    *,
    artefacts_dir: str | Path,
    patient: PatientMeta,
    modalities_present: list[Modality | str],
    qc: QCMetrics,
    regional_volumes: RegionalVolumesResult,
    asymmetry: AsymmetryResult | None = None,
    regional_thickness_summary_path: str | Path | None = None,
    base_report: MRIReport | None = None,
    atlas: str = "Desikan-Killiany",
    segmentation_engine: Literal["fastsurfer", "synthseg", "synthseg_plus"] | None = None,
    write_json: bool = True,
) -> MRIAnalysisReportPayload:
    """
    Assemble :class:`MRIAnalysisReportPayload`: updated :class:`MRIReport` + morphometry audit.

    Merges ``structural`` from ``base_report`` when provided; overwrites/extends
    subcortical and thickness maps from morphometry tables. Does not render HTML/PDF.
    """
    root = Path(artefacts_dir).resolve()
    mdir = _morph_dir(root)
    thick_p = (
        Path(regional_thickness_summary_path).resolve()
        if regional_thickness_summary_path
        else None
    )

    morph = summarize_morphometry(
        artefacts_dir=root,
        regional_volumes=regional_volumes,
        asymmetry=asymmetry,
        regional_thickness_summary_path=thick_p,
        atlas=atlas,
        segmentation_engine=segmentation_engine,
    )

    icv_ml = None
    if regional_volumes.icv_mm3 is not None:
        icv_ml = float(regional_volumes.icv_mm3) / 1000.0

    structural = _structural_from_morphometry(
        regional_volumes,
        asymmetry,
        thick_p,
        icv_ml=icv_ml,
        atlas=atlas,
    )
    if segmentation_engine:
        try:
            structural.segmentation_engine = SegmentationEngine(segmentation_engine)
        except ValueError:
            pass

    if base_report is None:
        mods: list[Modality] = []
        for m in modalities_present:
            mods.append(Modality(m) if not isinstance(m, Modality) else m)
        report = MRIReport(
            patient=patient,
            modalities_present=mods,
            qc=qc,
            structural=structural,
            medrag_query=_medrag_from_morphometry(regional_volumes, asymmetry),
        )
    else:
        report = base_report.model_copy(deep=True)
        report.patient = patient
        report.modalities_present = list(base_report.modalities_present)
        report.qc = qc
        merged_sub = dict(report.structural.subcortical_volume_mm3) if report.structural else {}
        merged_sub.update(structural.subcortical_volume_mm3)
        merged_th = dict(report.structural.cortical_thickness_mm) if report.structural else {}
        merged_th.update(structural.cortical_thickness_mm)
        report.structural = (report.structural or StructuralMetrics()).model_copy(
            update={
                "atlas": atlas,
                "subcortical_volume_mm3": merged_sub,
                "cortical_thickness_mm": merged_th,
                "icv_ml": structural.icv_ml or (report.structural.icv_ml if report.structural else None),
            }
        )
        mq = report.medrag_query.model_dump()
        nq = _medrag_from_morphometry(regional_volumes, asymmetry).model_dump()
        mq["findings"] = list(mq.get("findings", [])) + list(nq.get("findings", []))
        report.medrag_query = MedRAGQuery.model_validate(mq)

    payload = MRIAnalysisReportPayload(
        mri_report=report,
        morphometry=morph,
        regional_volumes=regional_volumes if regional_volumes.ok else None,
        asymmetry=asymmetry if asymmetry and asymmetry.ok else None,
    )

    if write_json:
        pj = mdir / "mri_analysis_report_payload.json"
        pj.write_text(
            json.dumps(payload.to_dict(), indent=2, default=_json_default),
            encoding="utf-8",
        )
        payload = payload.model_copy(update={"payload_json_path": str(pj.resolve())})

    return payload


def _json_default(o: object) -> str:
    if isinstance(o, UUID):
        return str(o)
    raise TypeError(f"Object of type {type(o)} is not JSON serializable")


__all__ = [
    "compute_asymmetry_indices",
    "compute_regional_volumes",
    "generate_mri_analysis_report_payload",
    "summarize_morphometry",
]
