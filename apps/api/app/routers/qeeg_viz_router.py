"""qEEG Visualization v2 — API endpoints.

Serves both server-rendered images (topomap PNG/SVG, connectivity heatmaps)
and interactive payloads (three-brain-js JSON, brainvis-d3 chord, Plotly
heatmap, animated topomap frames) for the upgraded browser viewer.

All endpoints are additive — existing analysis routes are unaffected.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import AuthenticatedActor, get_authenticated_actor, require_minimum_role
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import QEEGAnalysis

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/qeeg-viz", tags=["qeeg-viz"])


# ── Response Models ──────────────────────────────────────────────────────────

class TopomapResponse(BaseModel):
    band: str
    mode: str
    image_b64: str


class BandGridResponse(BaseModel):
    mode: str
    image_b64: str
    bands: list[str]


class ConnectivityPayload(BaseModel):
    metric: str
    band: str
    payload: dict


class SourcePayload(BaseModel):
    band: str
    method: str
    payload: dict


class AnimationResponse(BaseModel):
    band: str
    mode: str
    n_frames: int
    fps: int
    frames: list[dict]


class VizCapabilities(BaseModel):
    """Report which v2 viz features are available for an analysis."""
    analysis_id: str
    has_topomaps: bool = False
    has_zscores: bool = False
    has_connectivity: bool = False
    has_source: bool = False
    has_animation: bool = False
    bands: list[str] = Field(default_factory=list)
    channels: list[str] = Field(default_factory=list)
    source_method: Optional[str] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_analysis(analysis_id: str, db: Session) -> QEEGAnalysis:
    analysis = db.query(QEEGAnalysis).filter_by(id=analysis_id).first()
    if not analysis:
        raise ApiServiceError(code="not_found", message="Analysis not found", status_code=404)
    return analysis


def _load_features(analysis: QEEGAnalysis) -> dict:
    """Reconstruct the feature dict from stored JSON columns."""
    def _safe_load(val: Optional[str]) -> dict:
        if not val:
            return {}
        try:
            return json.loads(val)
        except (TypeError, ValueError):
            return {}

    spectral = _safe_load(getattr(analysis, "aperiodic_json", None))
    paf = _safe_load(getattr(analysis, "peak_alpha_freq_json", None))
    connectivity = _safe_load(getattr(analysis, "connectivity_json", None))
    asymmetry = _safe_load(getattr(analysis, "asymmetry_json", None))
    graph = _safe_load(getattr(analysis, "graph_metrics_json", None))
    source = _safe_load(getattr(analysis, "source_roi_json", None))

    # Reconstruct spectral bands from band_powers_json
    band_powers = _safe_load(analysis.band_powers_json)
    spectral_bands = {}
    for band, info in (band_powers.get("bands") or {}).items():
        channels = (info or {}).get("channels") or {}
        spectral_bands[band] = {
            "absolute_uv2": {ch: float(v.get("absolute_uv2", 0)) for ch, v in channels.items()},
            "relative": {ch: float(v.get("relative_pct", 0)) / 100.0 for ch, v in channels.items()},
        }

    return {
        "spectral": {
            "bands": spectral_bands,
            "aperiodic": spectral,
            "peak_alpha_freq": paf,
        },
        "connectivity": connectivity,
        "asymmetry": asymmetry,
        "graph": graph,
        "source": source,
    }


def _get_ch_names(analysis: QEEGAnalysis) -> list[str]:
    if analysis.channels_json:
        try:
            return json.loads(analysis.channels_json)
        except (TypeError, ValueError):
            pass
    return []


# ── Capabilities Endpoint ────────────────────────────────────────────────────

@router.get("/{analysis_id}/capabilities", response_model=VizCapabilities)
def get_viz_capabilities(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> VizCapabilities:
    """Report which visualization features are available for an analysis."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)
    features = _load_features(analysis)
    ch_names = _get_ch_names(analysis)

    spectral_bands = features.get("spectral", {}).get("bands", {})
    conn = features.get("connectivity", {})
    source = features.get("source", {})

    return VizCapabilities(
        analysis_id=analysis_id,
        has_topomaps=bool(spectral_bands),
        has_zscores=bool(getattr(analysis, "normative_zscores_json", None)),
        has_connectivity=bool(conn.get("coherence") or conn.get("wpli")),
        has_source=bool(source.get("roi_band_power")),
        has_animation=bool(spectral_bands),
        bands=sorted(spectral_bands.keys()),
        channels=ch_names,
        source_method=source.get("method"),
    )


# ── Topomap Endpoints ───────────────────────────────────────────────────────

@router.get("/{analysis_id}/topomap/{band}", response_model=TopomapResponse)
def get_topomap(
    analysis_id: str,
    band: str,
    mode: str = Query(default="power", pattern="^(power|zscore|relative)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> TopomapResponse:
    """Render a single-band topomap as base64 image."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)
    features = _load_features(analysis)
    ch_names = _get_ch_names(analysis)

    if not ch_names:
        raise ApiServiceError(code="no_channels", message="No channel data", status_code=400)

    try:
        from deepsynaps_qeeg.viz.topomap import render_topomap_base64
    except ImportError:
        raise ApiServiceError(
            code="viz_unavailable",
            message="Visualization package not installed",
            status_code=503,
        )

    if mode == "zscore":
        zscores_data = json.loads(getattr(analysis, "normative_zscores_json", "{}") or "{}")
        z_bands = zscores_data.get("spectral", {}).get("bands", {})
        z_map = z_bands.get(band, {})
        values = [float(z_map.get(ch, 0)) for ch in ch_names]
        image = render_topomap_base64(values, ch_names, title=f"{band.title()} z-score", symmetric=True)
    else:
        spectral_bands = features.get("spectral", {}).get("bands", {})
        band_data = spectral_bands.get(band, {})
        value_key = "absolute_uv2" if mode == "power" else "relative"
        val_map = band_data.get(value_key, {})
        values = [float(val_map.get(ch, 0)) for ch in ch_names]
        image = render_topomap_base64(values, ch_names, title=f"{band.title()} {mode}")

    return TopomapResponse(band=band, mode=mode, image_b64=image)


@router.get("/{analysis_id}/band-grid", response_model=BandGridResponse)
def get_band_grid(
    analysis_id: str,
    mode: str = Query(default="power", pattern="^(power|zscore)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> BandGridResponse:
    """Render a 5-band topomap grid as a single image."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)
    features = _load_features(analysis)
    ch_names = _get_ch_names(analysis)

    if not ch_names:
        raise ApiServiceError(code="no_channels", message="No channel data", status_code=400)

    try:
        from deepsynaps_qeeg.viz.band_grid import render_band_grid_base64
    except ImportError:
        raise ApiServiceError(code="viz_unavailable", message="Visualization package not installed", status_code=503)

    if mode == "zscore":
        zscores_data = json.loads(getattr(analysis, "normative_zscores_json", "{}") or "{}")
        z_bands = zscores_data.get("spectral", {}).get("bands", {})
        band_values = {}
        for band, z_map in z_bands.items():
            if z_map:
                band_values[band] = [float(z_map.get(ch, 0)) for ch in ch_names]
    else:
        spectral_bands = features.get("spectral", {}).get("bands", {})
        band_values = {}
        for band, data in spectral_bands.items():
            abs_map = data.get("absolute_uv2", {})
            if abs_map:
                band_values[band] = [float(abs_map.get(ch, 0)) for ch in ch_names]

    if not band_values:
        raise ApiServiceError(code="no_data", message="No band data available", status_code=400)

    image = render_band_grid_base64(band_values, ch_names, mode=mode)
    return BandGridResponse(mode=mode, image_b64=image, bands=sorted(band_values.keys()))


# ── Connectivity Endpoints ───────────────────────────────────────────────────

@router.get("/{analysis_id}/connectivity/chord/{band}", response_model=ConnectivityPayload)
def get_connectivity_chord(
    analysis_id: str,
    band: str,
    metric: str = Query(default="coherence", pattern="^(coherence|wpli)$"),
    threshold: float = Query(default=0.3, ge=0.0, le=1.0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> ConnectivityPayload:
    """Export connectivity chord diagram payload for brainvis-d3."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)
    features = _load_features(analysis)

    conn = features.get("connectivity", {})
    channels = conn.get("channels", [])
    metric_data = conn.get(metric, {})
    mat = metric_data.get(band)

    if mat is None:
        raise ApiServiceError(code="no_data", message=f"No {metric} data for band {band}", status_code=400)

    try:
        from deepsynaps_qeeg.viz.connectivity import export_chord_payload
        import numpy as np
    except ImportError:
        raise ApiServiceError(code="viz_unavailable", message="Visualization package not installed", status_code=503)

    payload = export_chord_payload(
        np.asarray(mat, dtype=float),
        channels,
        threshold=threshold,
        metric_name=metric,
        band=band,
    )

    return ConnectivityPayload(metric=metric, band=band, payload=payload)


@router.get("/{analysis_id}/connectivity/heatmap/{band}")
def get_connectivity_heatmap(
    analysis_id: str,
    band: str,
    metric: str = Query(default="coherence", pattern="^(coherence|wpli)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Export connectivity heatmap as a Plotly trace payload."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)
    features = _load_features(analysis)

    conn = features.get("connectivity", {})
    channels = conn.get("channels", [])
    metric_data = conn.get(metric, {})
    mat = metric_data.get(band)

    if mat is None:
        raise ApiServiceError(code="no_data", message=f"No {metric} data for band {band}", status_code=400)

    try:
        from deepsynaps_qeeg.viz.connectivity import export_plotly_payload
        import numpy as np
    except ImportError:
        raise ApiServiceError(code="viz_unavailable", message="Visualization package not installed", status_code=503)

    return export_plotly_payload(
        np.asarray(mat, dtype=float),
        channels,
        title=f"{metric.upper()} — {band.title()}",
        symmetric=(metric == "wpli"),
    )


# ── Source Localization Endpoints ────────────────────────────────────────────

@router.get("/{analysis_id}/source/{band}", response_model=SourcePayload)
def get_source_payload(
    analysis_id: str,
    band: str,
    threshold_pct: float = Query(default=0.0, ge=0.0, le=100.0),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> SourcePayload:
    """Export source-localized data for three-brain-js viewer."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)
    features = _load_features(analysis)

    source = features.get("source", {})
    roi_power = source.get("roi_band_power", {})
    method = source.get("method", "eLORETA")

    if not roi_power:
        raise ApiServiceError(code="no_source", message="No source localization data", status_code=400)

    try:
        from deepsynaps_qeeg.viz.source import export_threebrain_payload
    except ImportError:
        raise ApiServiceError(code="viz_unavailable", message="Visualization package not installed", status_code=503)

    payload = export_threebrain_payload(
        roi_power,
        band=band,
        method=method,
        threshold_pct=threshold_pct,
    )

    return SourcePayload(band=band, method=method, payload=payload)


@router.get("/{analysis_id}/source-image/{band}")
def get_source_image(
    analysis_id: str,
    band: str,
    fmt: str = Query(default="png", pattern="^(png|svg)$"),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> Response:
    """Render a source cortex image (PNG/SVG)."""
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)
    features = _load_features(analysis)

    source = features.get("source", {})
    roi_power = source.get("roi_band_power", {})

    if not roi_power:
        raise ApiServiceError(code="no_source", message="No source localization data", status_code=400)

    try:
        from deepsynaps_qeeg.viz.source import render_source_cortex
    except ImportError:
        raise ApiServiceError(code="viz_unavailable", message="Visualization package not installed", status_code=503)

    image_bytes = render_source_cortex(roi_power, band=band, fmt=fmt)
    media_type = "image/svg+xml" if fmt == "svg" else f"image/{fmt}"

    return Response(content=image_bytes, media_type=media_type)


# ── PDF Report v2 Endpoint ───────────────────────────────────────────────────

@router.post("/{analysis_id}/report-pdf")
def generate_v2_pdf_report(
    analysis_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> dict:
    """Generate the v2 publication-grade PDF report.

    Returns paths to the generated HTML and PDF files.
    """
    require_minimum_role(actor, "clinician")
    analysis = _load_analysis(analysis_id, db)

    if analysis.analysis_status != "completed":
        raise ApiServiceError(
            code="analysis_not_ready",
            message="Analysis must be completed first",
            status_code=400,
        )

    try:
        from deepsynaps_qeeg.pipeline import PipelineResult
        from deepsynaps_qeeg.report.weasyprint_pdf import build_pdf_report
    except ImportError:
        raise ApiServiceError(
            code="viz_unavailable",
            message="qEEG pipeline visualization package not installed",
            status_code=503,
        )

    features = _load_features(analysis)
    ch_names = _get_ch_names(analysis)

    zscores_str = getattr(analysis, "normative_zscores_json", None)
    zscores = json.loads(zscores_str) if zscores_str else {}

    quality_str = getattr(analysis, "quality_metrics_json", None)
    quality = json.loads(quality_str) if quality_str else {}

    # Build a PipelineResult-like object
    result = PipelineResult(
        features=features,
        zscores=zscores,
        quality=quality,
    )

    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmpdir:
        output = build_pdf_report(
            result,
            ch_names=ch_names,
            out_dir=tmpdir,
            case_id=analysis_id,
            recording_date=analysis.recording_date or "",
        )

        response = {
            "analysis_id": analysis_id,
            "html_generated": output.get("html") is not None,
            "pdf_generated": output.get("pdf") is not None,
        }

        # Read and return the HTML content for immediate browser rendering
        html_path = output.get("html")
        if html_path and Path(html_path).exists():
            response["html_content"] = Path(html_path).read_text(encoding="utf-8")

    return response
