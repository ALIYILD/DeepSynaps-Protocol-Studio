"""Facade for the sibling ``deepsynaps_mri`` MRI analyzer pipeline.

This module isolates the rest of the Studio backend from the heavy neuroimaging
dependency stack (``nibabel``, ``nilearn``, ``dipy``, ``antspyx``, ``pydicom``,
``weasyprint``) that the pipeline package pulls in. The import is guarded so
the API worker starts cleanly in environments where the ``mri-pipeline``
editable install has not happened.

Consumers should check :data:`HAS_MRI_PIPELINE` before assuming real output is
available, OR just call one of the ``*_safe`` wrappers — they always return a
well-shaped value (pipeline result or structured error envelope / placeholder).

See ``packages/mri-pipeline/portal_integration/api_contract.md`` for the HTTP
surface this façade backs.

Regulatory note
---------------
Decision-support tool. Not a medical device. Coordinates and suggested
parameters are derived from peer-reviewed literature. Not a substitute for
clinician judgement. For neuronavigation planning only.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

_log = logging.getLogger(__name__)


# ── Optional import of the sibling pipeline package ─────────────────────────
# The sibling repo lives at ``packages/mri-pipeline`` and is installed as an
# editable package by the Dockerfile. If it is missing (heavy neuro deps not
# built locally) we fall back to a no-op façade that surfaces a clear
# "dependency missing" error without ever crashing the API worker.
try:
    from deepsynaps_mri.pipeline import run_pipeline  # type: ignore[import-not-found]
    from deepsynaps_mri.schemas import (  # type: ignore[import-not-found]
        PatientMeta,
        Sex,
    )

    HAS_MRI_PIPELINE: bool = True
except Exception as _import_exc:  # ImportError or heavy-dep failure
    run_pipeline = None  # type: ignore[assignment]
    PatientMeta = None  # type: ignore[assignment,misc]
    Sex = None  # type: ignore[assignment,misc]
    HAS_MRI_PIPELINE = False
    _IMPORT_ERROR_MSG = f"{type(_import_exc).__name__}: {_import_exc}"
    _log.info(
        "deepsynaps_mri pipeline not available (%s). "
        "Install packages/mri-pipeline to enable MRI analysis.",
        _IMPORT_ERROR_MSG,
    )
else:
    _IMPORT_ERROR_MSG = ""


# ── Demo report loader ──────────────────────────────────────────────────────

_DEMO_REPORT_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "mri-pipeline"
    / "demo"
    / "sample_mri_report.json"
)
_DEMO_DIR = _DEMO_REPORT_PATH.parent
_REPO_ROOT = Path(__file__).resolve().parents[4]


def load_demo_report() -> dict[str, Any]:
    """Load the canonical sample MRI report shipped with the pipeline package.

    Returns
    -------
    dict
        The fully-shaped ``MRIReport`` payload as a JSON-serialisable dict.
        Used for demo mode + tests. Never raises — returns an empty dict with
        an ``error`` key if the demo file cannot be read.
    """
    try:
        with _DEMO_REPORT_PATH.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        _log.warning("MRI demo report not found at %s", _DEMO_REPORT_PATH)
        return {"error": f"demo report missing: {_DEMO_REPORT_PATH}"}
    except (OSError, json.JSONDecodeError) as exc:
        _log.warning("Failed to load MRI demo report: %s", exc)
        return {"error": f"failed to load demo report: {exc}"}


def _resolve_existing_asset(candidate: str | Path | None) -> Optional[Path]:
    """Resolve a possibly-relative artifact path to an existing local file."""
    if not candidate:
        return None
    raw = Path(str(candidate))
    search = [raw]
    if not raw.is_absolute():
        search.extend([
            _DEMO_DIR / raw,
            _REPO_ROOT / raw,
            _REPO_ROOT / "packages" / "mri-pipeline" / raw,
        ])
    for path in search:
        try:
            resolved = path.resolve()
        except OSError:
            resolved = path
        if resolved.exists() and resolved.is_file():
            return resolved
    return None


def _build_overlay_summary_html(
    analysis_id: str,
    target_id: str,
    report: dict[str, Any],
) -> str:
    """Fallback overlay page with target metadata when no real asset is staged."""
    stim_targets = report.get("stim_targets") if isinstance(report, dict) else []
    target = next(
        (item for item in (stim_targets or []) if item.get("target_id") == target_id),
        {},
    )
    coords = target.get("mni_xyz") or []
    coords_text = ", ".join(str(v) for v in coords) if isinstance(coords, list) else "n/a"
    region = target.get("region_name") or "Target metadata unavailable"
    confidence = target.get("confidence") or "n/a"
    method = target.get("method") or "n/a"
    efield_png = None
    dose = target.get("efield_dose") if isinstance(target, dict) else None
    if isinstance(dose, dict):
        efield_png = _resolve_existing_asset(dose.get("e_field_png_s3"))
    image_html = ""
    if efield_png is not None:
        image_html = (
            f'<div class="preview"><img src="file:///{efield_png.as_posix()}" '
            f'alt="Field preview for {target_id}"></div>'
        )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Overlay viewer</title>
<style>
  :root{{color-scheme:dark;}}
  body{{margin:0;font-family:system-ui,sans-serif;background:#07111f;color:#e2e8f0}}
  .shell{{min-height:100vh;padding:24px;background:
    radial-gradient(circle at top right, rgba(20,184,166,.15), transparent 28%),
    linear-gradient(180deg,#07111f,#0f172a)}}
  .card{{max-width:960px;margin:0 auto;background:rgba(15,23,42,.92);
    border:1px solid rgba(148,163,184,.18);border-radius:18px;padding:22px}}
  h1{{margin:0 0 8px;font-size:1.15rem}}
  p{{margin:.35rem 0;color:#cbd5e1;line-height:1.5}}
  .meta{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:18px 0}}
  .meta div{{padding:12px;border-radius:12px;background:rgba(30,41,59,.75);
    border:1px solid rgba(148,163,184,.12)}}
  .label{{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8}}
  .value{{display:block;margin-top:6px;font-size:.95rem;color:#f8fafc}}
  .note{{margin-top:16px;padding:12px 14px;border-radius:12px;background:rgba(15,118,110,.12);
    border:1px solid rgba(45,212,191,.22)}}
  .preview{{margin-top:18px;padding:12px;border-radius:14px;background:rgba(2,6,23,.55);
    border:1px solid rgba(148,163,184,.12)}}
  .preview img{{display:block;max-width:100%;height:auto;border-radius:10px}}
</style></head>
<body><div class="shell"><div class="card">
<<<<<<< HEAD
  <h1>Overlay unavailable in this build</h1>
=======
  <h1>Interactive overlay unavailable in this build</h1>
>>>>>>> origin/backup-feat-mri-ai-upgrades-aa28508
  <p>Using staged target metadata for review while the full MRI viewer assets are unavailable.</p>
  <p>Analysis <code>{analysis_id}</code> · Target <code>{target_id}</code></p>
  <div class="meta">
    <div><span class="label">Region</span><span class="value">{region}</span></div>
    <div><span class="label">MNI</span><span class="value">{coords_text}</span></div>
    <div><span class="label">Confidence</span><span class="value">{confidence}</span></div>
    <div><span class="label">Method</span><span class="value">{method}</span></div>
  </div>
  {image_html}
  <div class="note">Decision-support tool. Not a medical device.</div>
</div></div></body></html>
"""


# ── Serialisation helpers ───────────────────────────────────────────────────


def _report_to_dict(report: Any) -> dict[str, Any]:
    """Convert a ``deepsynaps_mri.schemas.MRIReport`` into a plain dict.

    Parameters
    ----------
    report
        Either a pydantic ``MRIReport`` model or an already-serialised dict.

    Returns
    -------
    dict
        JSON-serialisable representation of the report.
    """
    if report is None:
        return {}
    if isinstance(report, dict):
        return report
    # pydantic v2 BaseModel
    if hasattr(report, "model_dump"):
        try:
            return report.model_dump(mode="json")
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning("model_dump failed: %s", exc)
    # pydantic v1 fallback
    if hasattr(report, "dict"):
        try:
            return report.dict()
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning("dict() failed: %s", exc)
    return {}


# ── Public API ──────────────────────────────────────────────────────────────


def run_analysis_safe(
    upload_id: str,
    patient_id: str,
    condition: str,
    *,
    age: Optional[int] = None,
    sex: Optional[str] = None,
    session_dir: Optional[str | Path] = None,
    out_dir: Optional[str | Path] = None,
) -> dict[str, Any]:
    """Run the MRI analyzer pipeline, never raising.

    Parameters
    ----------
    upload_id
        Opaque handle returned by ``POST /mri/upload``. Used for logging only
        when ``session_dir`` is supplied directly.
    patient_id
        Opaque patient id propagated into ``PatientMeta``.
    condition
        One of the ``kg_entities.code`` values (``mdd``, ``ptsd``, …).
    age, sex
        Optional demographic fields forwarded to ``PatientMeta``.
    session_dir
        Absolute path to the session directory (DICOM tree or NIfTI files).
        When ``None`` the façade cannot actually execute the pipeline — it
        returns an ``is_stub=True`` envelope so callers know to fall back to
        demo mode.
    out_dir
        Directory the pipeline writes artefacts to. When ``None`` a temp dir
        sibling of ``session_dir`` is used.

    Returns
    -------
    dict
        ``{"success": bool, "data": dict | None, "error": str | None,
        "is_stub": bool}`` — ``data`` is a JSON-serialisable ``MRIReport``
        dict on success, ``None`` otherwise.
    """
    if not HAS_MRI_PIPELINE or run_pipeline is None or PatientMeta is None:
        return {
            "success": False,
            "data": None,
            "error": (
                "deepsynaps_mri pipeline is not installed. "
                "Install packages/mri-pipeline to enable MRI analysis. "
                f"(import error: {_IMPORT_ERROR_MSG or 'unknown'})"
            ),
            "is_stub": True,
        }

    if session_dir is None:
        return {
            "success": False,
            "data": None,
            "error": "session_dir is required to run the MRI pipeline",
            "is_stub": True,
        }

    try:
        patient_meta = PatientMeta(
            patient_id=patient_id,
            age=age,
            sex=Sex(sex) if sex else None,  # type: ignore[misc]
        )
    except Exception as exc:
        _log.warning("Failed to build PatientMeta: %s", exc)
        return {
            "success": False,
            "data": None,
            "error": f"invalid patient meta: {exc}",
            "is_stub": False,
        }

    try:
        session_path = Path(session_dir)
        artefact_root = Path(out_dir) if out_dir else session_path.parent / f"{upload_id}_run"
        report = run_pipeline(  # type: ignore[misc]
            session_path,
            patient_meta,
            artefact_root,
            condition=condition,
        )
    except Exception as exc:
        _log.exception("MRI pipeline run failed for upload_id=%s", upload_id)
        return {
            "success": False,
            "data": None,
            "error": f"{type(exc).__name__}: {exc}",
            "is_stub": False,
        }

    try:
        data = _report_to_dict(report)
    except Exception as exc:  # pragma: no cover - defensive
        _log.exception("MRI report serialisation failed for upload_id=%s", upload_id)
        return {
            "success": False,
            "data": None,
            "error": f"serialisation failed: {exc}",
            "is_stub": False,
        }

    return {"success": True, "data": data, "error": None, "is_stub": False}


# ── Overlay / report rendering ──────────────────────────────────────────────


_OVERLAY_PLACEHOLDER = """<!doctype html>
<html><head><meta charset="utf-8"><title>Overlay unavailable</title>
<style>
  body{{font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;
       display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
  .card{{max-width:520px;padding:2rem;border-radius:12px;background:#fff;
        box-shadow:0 4px 24px rgba(15,23,42,.08);border:1px solid #e2e8f0}}
  h1{{font-size:1.1rem;margin:0 0 .5rem 0;color:#2563eb}}
  p{{margin:.25rem 0;font-size:.9rem;line-height:1.4}}
  .foot{{margin-top:1rem;font-size:.75rem;color:#64748b}}
</style></head>
<body><div class="card">
  <h1>Overlay unavailable in this build</h1>
  <p>The nilearn overlay renderer is not available in this deployment.</p>
  <p>Target: <code>{target_id}</code> · Analysis: <code>{analysis_id}</code></p>
  <p class="foot">Decision-support tool. Not a medical device.</p>
</div></body></html>
"""


def generate_overlay_html_safe(
    analysis_id: str,
    target_id: str,
    report: dict[str, Any],
) -> str:
    """Render an interactive MNI overlay for a single stim target.

    Wraps :func:`deepsynaps_mri.overlay.render_target_overlays`. When the
    underlying renderer is unavailable (no nilearn / no T1 image) this
    returns a styled HTML placeholder page that still surfaces the regulatory
    disclaimer.

    Parameters
    ----------
    analysis_id
        Analysis row id (stringified UUID).
    target_id
        Stim-target id (the ``target_id`` key inside ``stim_targets``).
    report
        The ``MRIReport`` dict (as returned by :func:`load_demo_report` or
        :func:`run_analysis_safe`).

    Returns
    -------
    str
        A standalone HTML document. Always non-empty.
    """
    # If the package's report already carries a pre-rendered overlay path/URL,
    # prefer that — the pipeline saved the HTML alongside the run.
    overlays = report.get("overlays") if isinstance(report, dict) else None
    if isinstance(overlays, dict):
        candidate = overlays.get(target_id)
        if isinstance(candidate, str) and candidate:
            candidate_path = _resolve_existing_asset(candidate)
            if candidate_path is not None:
                try:
                    return candidate_path.read_text(encoding="utf-8")
                except OSError as exc:  # pragma: no cover - defensive
                    _log.warning("overlay read failed (%s): %s", candidate_path, exc)

    # Otherwise try to render live via the sibling package.
    if not HAS_MRI_PIPELINE:
        return _build_overlay_summary_html(analysis_id, target_id, report)

    try:
        # Locate the target by id + import the renderer lazily (heavy deps).
        from deepsynaps_mri.overlay import render_target_overlays  # type: ignore[import-not-found]
        from deepsynaps_mri.schemas import StimTarget  # type: ignore[import-not-found]

        stim_targets = report.get("stim_targets") if isinstance(report, dict) else []
        target_dict = next(
            (t for t in (stim_targets or []) if t.get("target_id") == target_id),
            None,
        )
        if target_dict is None:
            raise LookupError(f"target {target_id!r} not in report")

        # We don't have a T1 image to render against in the façade's demo
        # mode, so the pipeline-native path only works when the caller has
        # already staged a T1 NIfTI. If not, fall through to placeholder.
        t1_path = report.get("_t1_mni_path")
        if not t1_path or not Path(str(t1_path)).exists():
            raise FileNotFoundError("T1 MNI volume not staged for overlay render")

        import tempfile

        target_obj = StimTarget(**target_dict)
        out_dir = Path(tempfile.mkdtemp(prefix=f"mri_overlay_{analysis_id}_"))
        artefact = render_target_overlays(target_obj, t1_path, out_dir)
        html_path = Path(artefact.interactive_html)
        return html_path.read_text(encoding="utf-8")
    except Exception as exc:
        _log.info(
            "Overlay render skipped (%s: %s) — returning placeholder",
            type(exc).__name__,
            exc,
        )
        return _build_overlay_summary_html(analysis_id, target_id, report)


def generate_report_pdf_safe(
    analysis_id: str,
    report: dict[str, Any],
) -> Optional[bytes]:
    """Render the MRI report to PDF bytes.

    Wraps :func:`deepsynaps_mri.report.render_pdf` (which itself delegates to
    WeasyPrint). Guards the heavy reporting deps; returns ``None`` when they
    are not available so routers can surface a 503 instead of a 500.

    Parameters
    ----------
    analysis_id
        Analysis row id.
    report
        The ``MRIReport`` dict.

    Returns
    -------
    bytes | None
        Raw PDF bytes when weasyprint is installed, otherwise ``None``.
    """
    if not HAS_MRI_PIPELINE:
        return None

    try:
        import tempfile

        from deepsynaps_mri.report import render_html, render_pdf  # type: ignore[import-not-found]
        from deepsynaps_mri.schemas import MRIReport  # type: ignore[import-not-found]

        out_dir = Path(tempfile.mkdtemp(prefix=f"mri_report_{analysis_id}_"))
        html_path = out_dir / "report.html"
        pdf_path = out_dir / "report.pdf"

        model = MRIReport(**report)
        render_html(model, html_path, overlays_dir=out_dir)
        render_pdf(html_path, pdf_path)
        if pdf_path.exists():
            return pdf_path.read_bytes()
    except Exception as exc:
        _log.info(
            "PDF render unavailable (%s: %s)", type(exc).__name__, exc
        )
    return None


def generate_report_html_safe(
    analysis_id: str,
    report: dict[str, Any],
) -> str:
    """Render the MRI report to a standalone HTML string.

    Mirrors :func:`generate_report_pdf_safe`. On failure returns a compact
    summary page — never raises.
    """
    if HAS_MRI_PIPELINE:
        try:
            import tempfile

            from deepsynaps_mri.report import render_html  # type: ignore[import-not-found]
            from deepsynaps_mri.schemas import MRIReport  # type: ignore[import-not-found]

            out_dir = Path(tempfile.mkdtemp(prefix=f"mri_report_{analysis_id}_"))
            html_path = out_dir / "report.html"
            model = MRIReport(**report)
            render_html(model, html_path, overlays_dir=out_dir)
            if html_path.exists():
                return html_path.read_text(encoding="utf-8")
        except Exception as exc:
            _log.info(
                "HTML render fell back to summary (%s: %s)",
                type(exc).__name__,
                exc,
            )

    return _fallback_report_html(analysis_id, report)


def _fallback_report_html(analysis_id: str, report: dict[str, Any]) -> str:
    """Minimal standalone HTML summary used when Jinja+WeasyPrint are absent."""
    patient = report.get("patient", {}) if isinstance(report, dict) else {}
    modalities = report.get("modalities_present", []) if isinstance(report, dict) else []
    targets = report.get("stim_targets", []) if isinstance(report, dict) else []
    rows = "".join(
        f"<tr><td>{t.get('target_id','')}</td>"
        f"<td>{t.get('modality','')}</td>"
        f"<td>{t.get('region_name','')}</td>"
        f"<td>{t.get('confidence','')}</td></tr>"
        for t in targets
    )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>MRI Report — {analysis_id}</title>
<style>
  body{{font-family:system-ui,sans-serif;color:#0f172a;padding:2rem;max-width:900px;margin:0 auto}}
  h1{{color:#2563eb;margin:0 0 .5rem 0}}
  table{{width:100%;border-collapse:collapse;margin-top:1rem}}
  th,td{{padding:.5rem;border-bottom:1px solid #e2e8f0;text-align:left;font-size:.9rem}}
  .foot{{margin-top:2rem;font-size:.75rem;color:#64748b}}
</style></head>
<body>
  <h1>MRI Analyzer report</h1>
  <p>Analysis: <code>{analysis_id}</code></p>
  <p>Patient: <code>{patient.get('patient_id','')}</code>
     · Age: {patient.get('age','—')} · Sex: {patient.get('sex','—')}</p>
  <p>Modalities: {", ".join(str(m) for m in modalities) or '—'}</p>
  <h2>Stim targets</h2>
  <table><thead><tr><th>Target</th><th>Modality</th><th>Region</th><th>Confidence</th></tr></thead>
  <tbody>{rows or '<tr><td colspan="4">No targets</td></tr>'}</tbody></table>
  <p class="foot">Decision-support tool. Not a medical device. Coordinates and suggested
     parameters are derived from peer-reviewed literature. Not a substitute for
     clinician judgement. For neuronavigation planning only.</p>
</body></html>
"""


# ── MedRAG bridge ───────────────────────────────────────────────────────────


async def run_medrag_for_analysis_safe(
    report: dict[str, Any],
    *,
    top_k: int = 20,
) -> dict[str, Any]:
    """Return the MedRAG retrieval payload for an MRI analysis report.

    Delegates to :func:`app.services.qeeg_rag.query_literature` using the
    conditions and modalities surfaced by the report's ``stim_targets``.
    Shape matches api_contract.md §8:

    ``{"analysis_id": str, "results": [ {paper_id, title, doi, year, score,
    hits:[{entity, relation}]} , ... ]}``

    Parameters
    ----------
    report
        The ``MRIReport`` dict.
    top_k
        Maximum number of papers to return.

    Returns
    -------
    dict
        §8 shape; ``results`` is an empty list when no backend is available.
    """
    analysis_id = str(report.get("analysis_id", "")) if isinstance(report, dict) else ""

    conditions: list[str] = []
    modalities: list[str] = []
    if isinstance(report, dict):
        for target in report.get("stim_targets") or []:
            cond = target.get("condition")
            mod = target.get("modality")
            if isinstance(cond, str) and cond and cond not in conditions:
                conditions.append(cond)
            if isinstance(mod, str) and mod and mod not in modalities:
                modalities.append(mod)

        # Fall back to the medrag_query conditions when stim_targets is empty.
        if not conditions:
            mq = report.get("medrag_query") or {}
            for c in mq.get("conditions") or []:
                if isinstance(c, str) and c and c not in conditions:
                    conditions.append(c)

    try:
        from app.services import qeeg_rag
        refs = await qeeg_rag.query_literature(
            conditions=conditions,
            modalities=modalities,
            top_k=top_k,
        )
    except Exception as exc:
        _log.warning("MedRAG bridge failed: %s", exc)
        refs = []

    results: list[dict[str, Any]] = []
    for ref in refs or []:
        if not isinstance(ref, dict):
            continue
        paper_id = ref.get("pmid") or ref.get("paper_id")
        try:
            paper_id_int = int(paper_id) if paper_id is not None else None
        except (TypeError, ValueError):
            paper_id_int = None
        hits = [
            {"entity": cond, "relation": "stim_target_for"}
            for cond in conditions
        ]
        results.append(
            {
                "paper_id": paper_id_int,
                "pmid": ref.get("pmid"),
                "title": ref.get("title") or "",
                "doi": ref.get("doi"),
                "year": ref.get("year"),
                "score": float(ref.get("relevance_score") or 0.0),
                "hits": hits,
            }
        )

    return {
        "analysis_id": analysis_id,
        "results": results[:top_k],
    }


__all__ = [
    "HAS_MRI_PIPELINE",
    "load_demo_report",
    "run_analysis_safe",
    "generate_overlay_html_safe",
    "generate_report_pdf_safe",
    "generate_report_html_safe",
    "run_medrag_for_analysis_safe",
]
