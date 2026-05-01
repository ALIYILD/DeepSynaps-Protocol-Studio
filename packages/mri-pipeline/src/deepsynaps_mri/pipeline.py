"""
End-to-end pipeline orchestration.

Takes a session directory (DICOM or NIfTI) + patient meta, returns a
populated ``MRIReport`` and a directory of overlay artefacts.

High-level:
    1. ingest    (io.py)
    2. register  (registration.py)  -> T1 in MNI
    3. structural (structural.py)   -> StructuralMetrics
    4. fmri      (fmri.py)          -> FunctionalMetrics + personalised DLPFC
    5. dmri      (dmri.py)          -> DiffusionMetrics
    6. targeting (targeting.py)     -> list[StimTarget]
    7. overlay   (overlay.py)       -> PNGs + HTML per target
    8. medrag bridge                -> MedRAGQuery
    9. report    (report.py)        -> HTML + PDF

Every step is opt-in via the ``only`` parameter so you can re-run a
single stage without redoing the whole pipeline.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable
from uuid import uuid4

from concurrent.futures import ThreadPoolExecutor

from . import efield as efield_mod
from . import fmri as fmri_mod
from . import io as io_mod
from . import overlay as overlay_mod
from . import qc as qc_mod
from . import registration as reg_mod
from . import structural as struct_mod
from . import targeting as tgt_mod
from .schemas import (
    MedRAGFinding,
    MedRAGQuery,
    Modality,
    MRIReport,
    PatientMeta,
    QCMetrics,
    StimTarget,
    StructuralMetrics,
)

log = logging.getLogger(__name__)

STAGES = ("ingest", "register", "structural", "fmri", "dmri",
          "targeting", "overlay", "medrag", "report")


@dataclass
class PipelineContext:
    patient: PatientMeta
    session_dir: Path
    out_dir: Path
    condition: str = "mdd"
    qc: QCMetrics = field(default_factory=QCMetrics)
    t1_mni_path: Path | None = None
    scans: dict = field(default_factory=dict)
    report: MRIReport | None = None


def _prepare_out_dir(out_dir: str | Path) -> Path:
    p = Path(out_dir)
    p.mkdir(parents=True, exist_ok=True)
    (p / "overlays").mkdir(exist_ok=True)
    (p / "artefacts").mkdir(exist_ok=True)
    return p


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def run_pipeline(
    session_dir: str | Path,
    patient: PatientMeta,
    out_dir: str | Path,
    *,
    condition: str = "mdd",
    only: Iterable[str] | None = None,
    include_modalities_for_targets: tuple[str, ...] = ("rtms", "tps", "tfus"),
) -> MRIReport:
    """Run the full MRI analyzer pipeline on a session directory.

    ``session_dir`` may contain DICOM subfolders (T1, BOLD, DWI) or already-converted
    NIfTI. Conversion + anonymization happens in io.ingest().
    """
    out_dir = _prepare_out_dir(out_dir)
    ctx = PipelineContext(
        patient=patient,
        session_dir=Path(session_dir),
        out_dir=out_dir,
        condition=condition,
    )
    stages = set(only) if only else set(STAGES)

    modalities_present: list[Modality] = []
    struct_metrics = None
    func_metrics = None
    diff_metrics = None
    stim_targets: list[StimTarget] = []
    overlays: dict[str, str] = {}
    medrag_q = MedRAGQuery()

    # 1. INGEST
    if "ingest" in stages:
        log.info("stage: ingest")
        scans_list = io_mod.ingest(
            ctx.session_dir,
            out_dir / "artefacts" / "nifti",
            pseudo_patient_id=patient.patient_id,
        )
        # Map BIDS-ish modality_guess -> canonical keys used downstream
        canonical = {
            "T1w": "T1", "T2w": "T2", "FLAIR": "FLAIR",
            "bold": "rs_fMRI", "task-bold": "task_fMRI",
            "dwi": "DTI", "DWI": "DTI", "asl": "ASL",
        }
        for s in scans_list:
            key = canonical.get(s.modality_guess, s.modality_guess)
            ctx.scans[key] = str(s.nifti_path)
            # dwi sidecar holds bval/bvec paths (dcm2niix writes .bval/.bvec alongside)
            if key == "DTI":
                stem = Path(s.nifti_path).with_suffix("").with_suffix("")
                bval_p = stem.with_suffix(".bval")
                bvec_p = stem.with_suffix(".bvec")
                if bval_p.exists():
                    ctx.scans["bval"] = str(bval_p)
                if bvec_p.exists():
                    ctx.scans["bvec"] = str(bvec_p)
        if "T1" in ctx.scans:
            modalities_present.append(Modality.T1)
        if "rs_fMRI" in ctx.scans:
            modalities_present.append(Modality.RS_FMRI)
        if "DTI" in ctx.scans or "DWI" in ctx.scans:
            modalities_present.append(Modality.DTI)

        # ── Radiology screening layer (AI_UPGRADES §P0 #5) ──────────────
        # MRIQC IQMs + incidental-finding triage run at the earliest point
        # after ingest. Results populate QCMetrics.mriqc / .incidental. A
        # flagged finding appends an amber warning to ``ctx.qc_warnings``
        # but does NOT block the pipeline — clinicians always see the
        # scan, they just see a "radiology review advised" banner too.
        if "T1" in ctx.scans:
            t1_path = Path(ctx.scans["T1"])
            try:
                ctx.qc.mriqc = qc_mod.run_mriqc(t1_path, modality="T1w")
            except Exception as exc:      # noqa: BLE001
                log.warning("MRIQC screening failed, continuing: %s", exc)
            try:
                ctx.qc.incidental = qc_mod.screen_incidental_findings(t1_path)
            except Exception as exc:      # noqa: BLE001
                log.warning("Incidental-finding screening failed, continuing: %s", exc)

    # 2. REGISTRATION (T1 -> MNI)
    if "register" in stages and "T1" in ctx.scans:
        log.info("stage: register (T1 -> MNI)")
        xfm = reg_mod.register_t1_to_mni(ctx.scans["T1"])
        t1_mni_path = out_dir / "artefacts" / "t1_mni.nii.gz"
        xfm.warped_moving.to_filename(str(t1_mni_path))
        ctx.t1_mni_path = t1_mni_path

    # 3. STRUCTURAL
    if "structural" in stages and "T1" in ctx.scans:
        log.info("stage: structural")
        try:
            seg_result = struct_mod.segment(
                Path(ctx.scans["T1"]),
                out_dir / "artefacts" / "seg",
                subject_id=patient.patient_id,
            )
            struct_metrics = struct_mod.extract_structural_metrics(
                seg_result,
                age=float(patient.age) if patient.age else None,
                sex=patient.sex.value if patient.sex else None,
                artefacts_root=out_dir / "artefacts",
            )
        except Exception as e:                              # noqa: BLE001
            log.warning("structural stage failed: %s", e)
            ctx.qc.notes.append(f"structural_failed: {e}")

        # Brain-age CNN — non-blocking. Prefers the MNI-registered T1
        # produced by stage 2; falls back to the raw T1 when registration
        # was skipped. Graceful on missing torch / missing weights.
        try:
            if struct_metrics is None:
                struct_metrics = StructuralMetrics()
            t1_for_age = ctx.t1_mni_path or Path(ctx.scans["T1"])
            struct_mod.attach_brain_age(
                struct_metrics,
                t1_preprocessed_path=t1_for_age,
                chronological_age=float(patient.age) if patient.age else None,
            )
        except Exception as e:                              # noqa: BLE001
            log.warning("brain-age attach skipped: %s", e)

    # 4. FUNCTIONAL
    personalised_dlpfc = None
    if "fmri" in stages and "rs_fMRI" in ctx.scans:
        log.info("stage: fmri")
        clean = fmri_mod.preprocess_rsfmri(
            ctx.scans["rs_fMRI"],
            t1_path=ctx.scans.get("T1"),
            confounds_tsv=ctx.scans.get("confounds"),
        )
        ts = fmri_mod.extract_networks(clean, atlas="DiFuMo256")
        fc, labels = fmri_mod.compute_fc_matrix(ts, kind="correlation")
        seed_map = fmri_mod.seed_based_fc(clean)
        mni_xyz, min_z = fmri_mod.find_personalized_dlpfc_target(seed_map)
        personalised_dlpfc = (mni_xyz, min_z)
        func_metrics = fmri_mod.build_functional_metrics(
            clean, ts, fc, labels, sgacc_dlpfc_r=min_z
        )
        ctx.qc.fmri_framewise_displacement_mean_mm = clean.fd_mean_mm
        ctx.qc.fmri_outlier_volume_pct = clean.outlier_vol_pct

    # 5. DIFFUSION  (import lazily — heavy dep)
    if "dmri" in stages and ("DTI" in ctx.scans or "DWI" in ctx.scans):
        log.info("stage: dmri")
        from . import dmri as dmri_mod
        dwi = ctx.scans.get("DTI") or ctx.scans["DWI"]
        bval = ctx.scans.get("bval")
        bvec = ctx.scans.get("bvec")
        if bval and bvec:
            dti = dmri_mod.fit_dti(dwi, bval, bvec)
            try:
                sft = dmri_mod.track_whole_brain(dwi, bval, bvec, dti, method="deterministic")
                bundles = dmri_mod.segment_bundles(sft)
                bm = dmri_mod.summarise_bundles(bundles, dti)
                diff_metrics = dmri_mod.build_diffusion_metrics(bm)
            except Exception as e:                              # noqa: BLE001
                log.warning("tractography/bundle seg failed: %s", e)
                diff_metrics = dmri_mod.build_diffusion_metrics([])

    # 6. TARGETING
    if "targeting" in stages:
        log.info("stage: targeting")
        stim_targets = tgt_mod.build_stim_targets(
            condition,
            personalised_dlpfc=personalised_dlpfc,
            include_modalities=include_modalities_for_targets,
        )

        # 6b. E-FIELD DOSE (SimNIBS) — per-target forward solve. Runs in a
        # bounded ThreadPoolExecutor so multiple targets don't serialise
        # the expensive FEM. Graceful on every failure mode: a missing
        # SimNIBS install stamps each target with
        # status='dependency_missing' instead of crashing the pipeline.
        # Evidence: Wang 2024 (PMC10922371); Makarov 2025 (imag_a_00412);
        # TAP pipeline NCT03289923.
        t1_for_efield = ctx.t1_mni_path or (
            Path(ctx.scans["T1"]) if "T1" in ctx.scans else None
        )
        if t1_for_efield is not None and stim_targets:
            _attach_efield_doses(stim_targets, t1_for_efield, out_dir)

    # 7. OVERLAYS
    if "overlay" in stages and ctx.t1_mni_path and stim_targets:
        log.info("stage: overlay")
        arts = overlay_mod.render_all_targets(
            stim_targets, ctx.t1_mni_path, out_dir / "overlays"
        )
        overlays = {tid: a.interactive_html for tid, a in arts.items()}

    # 8. MedRAG query assembly
    if "medrag" in stages:
        medrag_q = _build_medrag_query(condition, struct_metrics, func_metrics, diff_metrics)

    # Amber warnings surfaced at the top of the analyzer page — from the
    # MRIQC + incidental-finding triage pass that runs during ingest.
    qc_warnings = qc_mod.build_qc_warnings(ctx.qc.mriqc, ctx.qc.incidental)

    from .clinical_summary import build_clinical_summary

    report = MRIReport(
        analysis_id=uuid4(),
        patient=patient,
        modalities_present=modalities_present,
        qc=ctx.qc,
        structural=struct_metrics,
        functional=func_metrics,
        diffusion=diff_metrics,
        stim_targets=stim_targets,
        medrag_query=medrag_q,
        overlays=overlays,
        qc_warnings=qc_warnings,
        clinical_summary={},
    )
    clinical_summary = build_clinical_summary(report)
    report = report.model_copy(update={"clinical_summary": clinical_summary})
    ctx.report = report

    # 9. REPORT (HTML + PDF) — deferred import to avoid weasyprint cost at CLI boot
    if "report" in stages:
        from . import report as rep_mod
        html_path = rep_mod.render_html(report, out_dir / "report.html", overlays_dir=out_dir / "overlays")
        pdf_path = rep_mod.render_pdf(html_path, out_dir / "report.pdf")
        report.report_html_s3 = str(html_path)
        report.report_pdf_s3 = str(pdf_path)

    return report


# ---------------------------------------------------------------------------
# E-field helper — concurrent SimNIBS forward solves per stim target
# ---------------------------------------------------------------------------
def _attach_efield_doses(
    stim_targets: list[StimTarget],
    t1_path: Path,
    out_dir: Path,
) -> None:
    """Attach :class:`EfieldDose` to every TMS/tDCS ``StimTarget``.

    Runs SimNIBS forward solves inside a bounded
    :class:`~concurrent.futures.ThreadPoolExecutor`. All exceptions are
    collapsed into ``status='failed'`` envelopes so the pipeline survives
    SimNIBS being missing or a per-target solver crash.
    """
    from .schemas import EfieldDose

    targets_to_solve = [
        t for t in stim_targets if t.modality in ("rtms", "tdcs")
    ]
    if not targets_to_solve:
        return

    def _solve(target: StimTarget) -> tuple[str, EfieldDose]:
        try:
            params = target.suggested_parameters
            dose = efield_mod.simulate_efield(
                t1_path=t1_path,
                target_mni=target.mni_xyz,
                modality="tms" if target.modality == "rtms" else "tdcs",
                coil=(
                    "Magstim_70mm_Fig8"
                    if target.modality == "rtms" else None
                ),
                intensity_pct_rmt=params.intensity_pct_rmt,
                current_ma=None,
                out_dir=out_dir / "artefacts" / f"efield_{target.target_id}",
            )
            return target.target_id, dose
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "E-field solve failed for target %s: %s",
                target.target_id, exc,
            )
            return target.target_id, EfieldDose(
                status="failed",
                solver="unavailable",
                error_message=f"{type(exc).__name__}: {exc}",
            )

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            for tid, dose in pool.map(_solve, targets_to_solve):
                for target in stim_targets:
                    if target.target_id == tid:
                        target.efield_dose = dose
                        break
    except Exception as exc:  # noqa: BLE001
        log.warning("E-field batch skipped due to executor error: %s", exc)


# ---------------------------------------------------------------------------
# MedRAG query builder — translates metrics into findings
# ---------------------------------------------------------------------------
def _build_medrag_query(condition, struct, func, diff) -> MedRAGQuery:
    findings: list[MedRAGFinding] = []

    if struct is not None:
        for region, nv in struct.cortical_thickness_mm.items():
            if nv.flagged and nv.z is not None:
                findings.append(MedRAGFinding(
                    type="region_metric", value=f"{region}_thickness",
                    zscore=nv.z, polarity=-1 if nv.z < 0 else 1,
                ))
        for region, nv in struct.subcortical_volume_mm3.items():
            if nv.flagged and nv.z is not None:
                findings.append(MedRAGFinding(
                    type="region_metric", value=f"{region}_volume",
                    zscore=nv.z, polarity=-1 if nv.z < 0 else 1,
                ))

    if func is not None:
        for net in func.networks:
            if net.mean_within_fc.z is not None and net.mean_within_fc.flagged:
                findings.append(MedRAGFinding(
                    type="network_metric", value=f"{net.network}_within_fc",
                    zscore=net.mean_within_fc.z,
                    polarity=-1 if net.mean_within_fc.z < 0 else 1,
                ))
        if func.sgACC_DLPFC_anticorrelation and func.sgACC_DLPFC_anticorrelation.flagged:
            findings.append(MedRAGFinding(
                type="network_metric", value="sgACC_DLPFC_anticorrelation",
                zscore=func.sgACC_DLPFC_anticorrelation.z,
            ))

    if diff is not None:
        for b in diff.bundles:
            if b.mean_FA.flagged and b.mean_FA.z is not None:
                findings.append(MedRAGFinding(
                    type="region_metric", value=f"{b.bundle}_FA",
                    zscore=b.mean_FA.z,
                    polarity=-1 if b.mean_FA.z < 0 else 1,
                ))

    return MedRAGQuery(findings=findings, conditions=[condition])
