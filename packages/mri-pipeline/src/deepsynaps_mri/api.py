"""
FastAPI surface for the MRI Analyzer.

Endpoints mirror docs/MRI_ANALYZER.md §10:
  POST /mri/upload              -> {upload_id, presigned_urls?}
  POST /mri/analyze             -> {job_id}      (enqueues a Celery job)
  GET  /mri/status/{job_id}     -> {state, progress, analysis_id?}
  GET  /mri/report/{analysis_id} -> MRIReport    (JSON)
  GET  /mri/report/{analysis_id}/pdf
  GET  /mri/report/{analysis_id}/html
  GET  /mri/overlay/{analysis_id}/{target_id} -> HTML iframe payload
  GET  /mri/medrag/{analysis_id} -> MedRAG retrieval response (calls qEEG medrag)

All analysis JSONs go through ``db.save_report`` and hit the existing
DeepSynaps Postgres instance. Authentication is NOT implemented here
(inherits dashboard auth in production).
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from . import db as db_mod
from .schemas import PatientMeta, Sex

log = logging.getLogger(__name__)

UPLOAD_ROOT = Path(os.environ.get("MRI_UPLOAD_ROOT", "/tmp/deepsynaps_mri/uploads"))
ARTEFACT_ROOT = Path(os.environ.get("MRI_ARTEFACT_ROOT", "/tmp/deepsynaps_mri/runs"))
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
ARTEFACT_ROOT.mkdir(parents=True, exist_ok=True)

# Zip-extract hardening caps. Defaults are deliberately generous for real
# DICOM series (a head MRI study can run 5–20k slices, each ~500 KB) but
# refuse pathological inputs. Override via env for special-case studies.
_MAX_ZIP_MEMBERS = int(os.environ.get("MRI_MAX_ZIP_MEMBERS", "50000"))
_MAX_ZIP_BYTES = int(os.environ.get("MRI_MAX_ZIP_BYTES", str(20 * 1024 ** 3)))  # 20 GB
# Allowlist of file suffixes we are willing to extract from an upload zip.
# Anything else (executables, scripts, archives-in-archives, …) is rejected
# so an attacker cannot smuggle a payload through the imaging pipeline.
_ALLOWED_ZIP_SUFFIXES = frozenset({
    ".dcm", ".dicom", ".ima",          # DICOM
    ".nii", ".gz",                      # NIfTI (.nii, .nii.gz — `.gz` is the trailing suffix)
    ".img", ".hdr",                     # Analyze
    ".json", ".txt", ".csv", ".tsv",   # sidecars (BIDS metadata, sequence params)
    ".bval", ".bvec",                   # diffusion gradient tables
    "",                                 # extension-less DICOM (common from scanner export)
})


def _safe_extract_zip(zip_path: Path, dest: Path) -> None:
    """Extract ``zip_path`` into ``dest`` with zip-slip / zip-bomb protection.

    Rejects with ``HTTPException(400)`` on any of:
      * member count > ``_MAX_ZIP_MEMBERS``
      * cumulative uncompressed size > ``_MAX_ZIP_BYTES``
      * member name resolves outside ``dest`` (zip-slip)
      * member uses an absolute path or ``..`` segment
      * member suffix not in ``_ALLOWED_ZIP_SUFFIXES``
    """
    import zipfile

    dest_resolved = dest.resolve()
    with zipfile.ZipFile(zip_path) as z:
        members = z.infolist()
        if len(members) > _MAX_ZIP_MEMBERS:
            raise HTTPException(
                400,
                f"zip contains {len(members)} members, exceeds cap "
                f"{_MAX_ZIP_MEMBERS}",
            )

        total_size = 0
        for info in members:
            total_size += info.file_size
            if total_size > _MAX_ZIP_BYTES:
                raise HTTPException(
                    400,
                    "zip uncompressed size exceeds cap "
                    f"{_MAX_ZIP_BYTES} bytes (likely zip-bomb)",
                )

            name = info.filename
            # Reject absolute paths and Windows-style drive letters outright.
            if name.startswith(("/", "\\")) or (len(name) > 1 and name[1] == ":"):
                raise HTTPException(400, f"zip member has absolute path: {name!r}")
            # Reject any traversal segment regardless of OS path separator.
            parts = name.replace("\\", "/").split("/")
            if any(p == ".." for p in parts):
                raise HTTPException(400, f"zip member has traversal segment: {name!r}")

            target = (dest_resolved / name).resolve()
            try:
                target.relative_to(dest_resolved)
            except ValueError as exc:
                raise HTTPException(
                    400, f"zip member escapes upload directory: {name!r}"
                ) from exc

            # Directory entries are fine — skip the suffix check for them.
            if info.is_dir() or name.endswith("/"):
                continue
            suffix = Path(name).suffix.lower()
            if suffix not in _ALLOWED_ZIP_SUFFIXES:
                raise HTTPException(
                    400,
                    f"zip member has disallowed suffix {suffix!r}: {name!r}",
                )

        # Validation passed — extract.
        z.extractall(dest_resolved)


app = FastAPI(title="DeepSynaps MRI Analyzer", version="0.1.0")


@app.get("/healthz")
def healthz():
    return {"ok": True, "version": "0.1.0"}


# ---------------------------------------------------------------------------
# 1. Upload
# ---------------------------------------------------------------------------
@app.post("/mri/upload")
async def upload(
    patient_id: Annotated[str, Form()],
    file: UploadFile = File(...),
):
    """Receive a .zip of DICOM or a single NIfTI. Returns an upload_id
    (directory name) that ``/mri/analyze`` will consume."""
    from uuid import uuid4
    upload_id = uuid4().hex
    dest = UPLOAD_ROOT / upload_id
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / file.filename
    with out.open("wb") as fh:
        while chunk := await file.read(8 * 1024 * 1024):
            fh.write(chunk)

    # Auto-unzip .zip with zip-slip / zip-bomb / extension-allowlist guards.
    # Defense-in-depth: this sidecar is not currently mounted in the main
    # FastAPI app, but the upload path is reachable in any environment that
    # serves this module directly. See _safe_extract_zip for the policy.
    if out.suffix.lower() == ".zip":
        try:
            _safe_extract_zip(out, dest)
        finally:
            out.unlink(missing_ok=True)
    return {"upload_id": upload_id, "path": str(dest), "patient_id": patient_id}


# ---------------------------------------------------------------------------
# 2. Analyze (sync fallback + Celery-aware)
# ---------------------------------------------------------------------------
@app.post("/mri/analyze")
async def analyze(
    background: BackgroundTasks,
    upload_id: Annotated[str, Form()],
    patient_id: Annotated[str, Form()],
    condition: Annotated[str, Form()] = "mdd",
    age: Annotated[int | None, Form()] = None,
    sex: Annotated[str | None, Form()] = None,
    run_mode: Annotated[str, Form()] = "background",
):
    """Launch the analyzer. ``run_mode`` = ``background`` (default) enqueues
    via Celery if available; ``sync`` runs in-process (slow, test-only)."""
    session_dir = UPLOAD_ROOT / upload_id
    if not session_dir.exists():
        raise HTTPException(404, f"upload_id {upload_id!r} not found")

    from uuid import uuid4
    job_id = uuid4().hex
    out_dir = ARTEFACT_ROOT / job_id

    patient = PatientMeta(
        patient_id=patient_id,
        age=age,
        sex=Sex(sex) if sex else None,
    )

    if run_mode == "sync":
        from .pipeline import run_pipeline
        report = run_pipeline(session_dir, patient, out_dir, condition=condition)
        db_mod.save_report(report)
        return {"job_id": job_id, "state": "done", "analysis_id": str(report.analysis_id)}

    try:
        from .worker import run_pipeline_job
        async_res = run_pipeline_job.delay(
            str(session_dir), patient.model_dump(), str(out_dir), condition
        )
        return {"job_id": async_res.id, "state": "queued"}
    except Exception as e:                                     # noqa: BLE001
        log.warning("Celery unavailable (%s) — falling back to BackgroundTasks", e)

        def _run():
            from .pipeline import run_pipeline
            report = run_pipeline(session_dir, patient, out_dir, condition=condition)
            db_mod.save_report(report)

        background.add_task(_run)
        return {"job_id": job_id, "state": "queued"}


# ---------------------------------------------------------------------------
# 3. Status (Celery-backed if present)
# ---------------------------------------------------------------------------
@app.get("/mri/status/{job_id}")
def status(job_id: str):
    try:
        from celery.result import AsyncResult
        from .worker import celery_app
        r = AsyncResult(job_id, app=celery_app)
        return {"job_id": job_id, "state": r.state, "info": r.info}
    except Exception:
        return {"job_id": job_id, "state": "unknown"}


# ---------------------------------------------------------------------------
# 4. Report retrieval
# ---------------------------------------------------------------------------
@app.get("/mri/report/{analysis_id}")
def get_report(analysis_id: UUID):
    try:
        rep = db_mod.load_report(analysis_id)
    except LookupError:
        raise HTTPException(404, "analysis_id not found")
    return JSONResponse(rep.model_dump(mode="json"))


@app.get("/mri/report/{analysis_id}/pdf")
def get_report_pdf(analysis_id: UUID):
    rep = db_mod.load_report(analysis_id)
    if not rep.report_pdf_s3:
        raise HTTPException(404, "no PDF for this analysis")
    return FileResponse(rep.report_pdf_s3, media_type="application/pdf")


@app.get("/mri/report/{analysis_id}/html", response_class=HTMLResponse)
def get_report_html(analysis_id: UUID):
    rep = db_mod.load_report(analysis_id)
    if not rep.report_html_s3 or not Path(rep.report_html_s3).exists():
        raise HTTPException(404, "no HTML for this analysis")
    return HTMLResponse(Path(rep.report_html_s3).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# 5. Per-target overlay
# ---------------------------------------------------------------------------
@app.get("/mri/overlay/{analysis_id}/{target_id}", response_class=HTMLResponse)
def get_overlay(analysis_id: UUID, target_id: str):
    rep = db_mod.load_report(analysis_id)
    url = rep.overlays.get(target_id)
    if not url or not Path(url).exists():
        raise HTTPException(404, "overlay not found")
    return HTMLResponse(Path(url).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# 6. MedRAG retrieval bridge
# ---------------------------------------------------------------------------
@app.get("/mri/medrag/{analysis_id}")
def medrag_retrieve(analysis_id: UUID, top_k: int = 20):
    """Delegate MedRAG retrieval to the existing qEEG analyzer's retrieval module."""
    rep = db_mod.load_report(analysis_id)
    try:
        # same Postgres / same paper corpus
        from deepsynaps_qeeg.medrag.src.retrieval import retrieve   # type: ignore
    except ImportError:
        raise HTTPException(503, "MedRAG retrieval module not available")
    results = retrieve(rep.medrag_query.model_dump(), top_k=top_k)
    return {"analysis_id": str(analysis_id), "results": results}
