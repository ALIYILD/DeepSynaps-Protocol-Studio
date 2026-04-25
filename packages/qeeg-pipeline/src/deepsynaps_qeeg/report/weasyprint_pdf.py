"""Publication-grade PDF report via WeasyPrint — qEEG Viz v2.

Generates a multi-section clinical PDF report with embedded topomap
images, connectivity matrices, source localization figures, and band
power summaries.  The layout mirrors the 14-section QEEGMaps report
format used in published clinical qEEG assessments.

Sections:
  1.  Cover page
  2.  Pipeline quality summary
  3.  Band power topomaps (absolute)
  4.  Band power topomaps (z-score)
  5.  Band power bar chart
  6.  Spectral parameterization (aperiodic + peaks)
  7.  Asymmetry table
  8.  Connectivity matrix (coherence)
  9.  Connectivity matrix (wPLI)
  10. Graph metrics table
  11. Source localization (per band)
  12. Flagged deviations table
  13. AI interpretation (if available)
  14. Clinical disclaimer + footer

Falls back gracefully when WeasyPrint is unavailable — returns HTML
string and ``pdf_path=None``.
"""
from __future__ import annotations

import base64
import html as html_lib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any

import numpy as np

from .. import FREQ_BANDS, __version__ as PKG_VERSION

if TYPE_CHECKING:
    from ..pipeline import PipelineResult

log = logging.getLogger(__name__)

BAND_ORDER = ["delta", "theta", "alpha", "beta", "gamma"]


def _esc(text: Any) -> str:
    return html_lib.escape(str(text)) if text else ""


def _b64_img(raw_bytes: bytes, fmt: str = "png") -> str:
    """Convert raw image bytes to a data-URI."""
    b64 = base64.b64encode(raw_bytes).decode("ascii")
    mime = "image/svg+xml" if fmt == "svg" else f"image/{fmt}"
    return f"data:{mime};base64,{b64}"


def build_pdf_report(
    result: "PipelineResult",
    *,
    ch_names: list[str],
    out_dir: Path | str,
    case_id: str = "",
    patient_name: str = "",
    clinician_name: str = "",
    recording_date: str = "",
    ai_narrative: dict[str, Any] | None = None,
) -> dict[str, Path | None]:
    """Generate the full v2 PDF report.

    Parameters
    ----------
    result : PipelineResult
        Pipeline output.
    ch_names : list of str
        EEG channel names.
    out_dir : Path or str
        Output directory.
    case_id : str
        Case/analysis identifier.
    patient_name : str
        De-identified patient label.
    clinician_name : str
        Reviewing clinician.
    recording_date : str
        Date of recording.
    ai_narrative : dict or None
        AI-generated interpretation to include.

    Returns
    -------
    dict
        ``{"html": Path, "pdf": Path | None}``
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    features = result.features or {}
    zscores = result.zscores or {}
    quality = result.quality or {}

    # ── Generate embedded images ──────────────────────────────────────────
    topo_images = _generate_topomap_images(features, ch_names)
    zscore_images = _generate_zscore_images(zscores, ch_names)
    connectivity_images = _generate_connectivity_images(features)
    source_images = _generate_source_images(features)
    bandpower_bar = _generate_bandpower_bar(zscores)

    # ── Render HTML ───────────────────────────────────────────────────────
    html_str = _render_full_html(
        case_id=case_id,
        patient_name=patient_name,
        clinician_name=clinician_name,
        recording_date=recording_date,
        quality=quality,
        features=features,
        zscores=zscores,
        topo_images=topo_images,
        zscore_images=zscore_images,
        connectivity_images=connectivity_images,
        source_images=source_images,
        bandpower_bar=bandpower_bar,
        ai_narrative=ai_narrative,
    )

    html_path = out / "qeeg_report_v2.html"
    html_path.write_text(html_str, encoding="utf-8")

    # ── Render PDF ────────────────────────────────────────────────────────
    pdf_path = _render_pdf(html_str, out / "qeeg_report_v2.pdf")

    return {"html": html_path, "pdf": pdf_path}


def _generate_topomap_images(
    features: dict[str, Any],
    ch_names: list[str],
) -> dict[str, str]:
    """Generate base64 topomap images for absolute power per band."""
    try:
        from ..viz.topomap import render_topomap_base64
    except Exception as exc:
        log.warning("viz.topomap unavailable (%s); skipping topomaps.", exc)
        return {}

    spectral = features.get("spectral", {})
    bands = spectral.get("bands", {})

    images = {}
    for band in BAND_ORDER:
        band_data = bands.get(band, {})
        abs_map = band_data.get("absolute_uv2", {})
        if not abs_map:
            continue
        values = [float(abs_map.get(ch, 0.0)) for ch in ch_names]
        try:
            lo, hi = FREQ_BANDS.get(band, (0, 0))
            images[band] = render_topomap_base64(
                values,
                ch_names,
                title=f"{band.title()} ({lo}-{hi} Hz)",
            )
        except Exception as exc:
            log.warning("Topomap for %s failed: %s", band, exc)

    return images


def _generate_zscore_images(
    zscores: dict[str, Any],
    ch_names: list[str],
) -> dict[str, str]:
    """Generate base64 topomap images for z-score per band."""
    try:
        from ..viz.topomap import render_topomap_base64
    except Exception:
        return {}

    spectral_z = zscores.get("spectral", {}).get("bands", {})
    images = {}
    for band in BAND_ORDER:
        z_map = spectral_z.get(band, {})
        if not z_map:
            continue
        values = [float(z_map.get(ch, 0.0)) for ch in ch_names]
        try:
            images[band] = render_topomap_base64(
                values,
                ch_names,
                title=f"{band.title()} z-score",
                symmetric=True,
            )
        except Exception as exc:
            log.warning("Z-score topomap for %s failed: %s", band, exc)

    return images


def _generate_connectivity_images(features: dict[str, Any]) -> dict[str, str]:
    """Generate base64 connectivity matrix heatmaps."""
    try:
        from ..viz.connectivity import render_connectivity_matrix_base64
    except Exception:
        return {}

    conn = features.get("connectivity", {})
    channels = conn.get("channels", [])
    images = {}

    for metric in ("coherence", "wpli"):
        metric_data = conn.get(metric, {})
        for band in BAND_ORDER:
            mat = metric_data.get(band)
            if mat is None:
                continue
            try:
                mat_arr = np.asarray(mat, dtype=float)
                key = f"{metric}_{band}"
                images[key] = render_connectivity_matrix_base64(
                    mat_arr,
                    channels,
                    title=f"{metric.upper()} — {band.title()}",
                )
            except Exception as exc:
                log.warning("Connectivity image %s/%s failed: %s", metric, band, exc)

    return images


def _generate_source_images(features: dict[str, Any]) -> dict[str, str]:
    """Generate base64 source localization images per band."""
    try:
        from ..viz.source import render_source_cortex
    except Exception:
        return {}

    source = features.get("source", {})
    roi_power = source.get("roi_band_power", {})
    images = {}

    for band in BAND_ORDER:
        if band not in roi_power:
            continue
        try:
            img_bytes = render_source_cortex(roi_power, band=band)
            images[band] = _b64_img(img_bytes)
        except Exception as exc:
            log.warning("Source image for %s failed: %s", band, exc)

    return images


def _generate_bandpower_bar(zscores: dict[str, Any]) -> str | None:
    """Generate a band-power z-score bar chart."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception:
        return None

    spectral_z = zscores.get("spectral", {}).get("bands", {})
    if not spectral_z:
        return None

    mean_z = []
    present_bands = []
    for band in BAND_ORDER:
        z_map = spectral_z.get(band, {})
        if z_map:
            vals = [float(v) for v in z_map.values()]
            mean_z.append(float(np.nanmean(vals)))
            present_bands.append(band)

    if not mean_z:
        return None

    colors = ["#c93b3b" if abs(v) > 1.96 else "#2a6df4" for v in mean_z]
    fig, ax = plt.subplots(figsize=(7, 3), dpi=120)
    ax.bar(present_bands, mean_z, color=colors)
    ax.axhline(y=1.96, linestyle="--", color="#aaa", linewidth=0.8)
    ax.axhline(y=-1.96, linestyle="--", color="#aaa", linewidth=0.8)
    ax.set_ylabel("z vs normative dB")
    ax.set_title("Global Band-Power Z-Score", fontsize=11, fontweight="bold")
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    import io
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", dpi=120)
    plt.close(fig)
    return _b64_img(buf.getvalue())


def _render_full_html(
    *,
    case_id: str,
    patient_name: str,
    clinician_name: str,
    recording_date: str,
    quality: dict,
    features: dict,
    zscores: dict,
    topo_images: dict[str, str],
    zscore_images: dict[str, str],
    connectivity_images: dict[str, str],
    source_images: dict[str, str],
    bandpower_bar: str | None,
    ai_narrative: dict | None,
) -> str:
    """Build the full HTML document."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # ── Section helpers ───────────────────────────────────────────────────
    def _img_grid(images: dict[str, str], label_prefix: str = "") -> str:
        if not images:
            return '<p class="note">No data available.</p>'
        parts = []
        for key, uri in images.items():
            parts.append(
                f'<figure class="topo-fig">'
                f'<img src="{uri}" alt="{_esc(key)}" />'
                f'<figcaption>{_esc(label_prefix)}{_esc(key)}</figcaption>'
                f'</figure>'
            )
        return '<div class="topo-grid">' + "".join(parts) + '</div>'

    def _quality_table() -> str:
        rows = [
            ("Input sampling rate", f"{quality.get('sfreq_input', 'N/A')} Hz"),
            ("Output sampling rate", f"{quality.get('sfreq_output', 'N/A')} Hz"),
            ("Bandpass", str(quality.get('bandpass', 'N/A'))),
            ("Notch", f"{quality.get('notch_hz', 'N/A')} Hz"),
            ("Bad channels", ", ".join(quality.get('bad_channels', [])) or "none"),
            ("Epochs retained / total",
             f"{quality.get('n_epochs_retained', '?')} / {quality.get('n_epochs_total', '?')}"),
            ("ICA components dropped", str(quality.get('ica_components_dropped', 0))),
            ("Pipeline version", quality.get('pipeline_version', PKG_VERSION)),
        ]
        tr = "".join(f"<tr><th>{_esc(k)}</th><td>{_esc(v)}</td></tr>" for k, v in rows)
        return f'<table class="data-table">{tr}</table>'

    def _asymmetry_section() -> str:
        asym = features.get("asymmetry", {})
        if not asym:
            return '<p class="note">Not computed.</p>'
        rows = "".join(
            f"<tr><td>{_esc(k)}</td><td>{v:.4f}</td></tr>" if isinstance(v, (int, float))
            else f"<tr><td>{_esc(k)}</td><td>{_esc(str(v))}</td></tr>"
            for k, v in asym.items()
        )
        return f'<table class="data-table"><tr><th>Pair</th><th>Value</th></tr>{rows}</table>'

    def _graph_section() -> str:
        graph = features.get("graph", {})
        if not graph:
            return '<p class="note">Not computed.</p>'
        header = "<tr><th>Band</th><th>Clustering</th><th>Path length</th><th>Small-worldness</th></tr>"
        rows = ""
        for band, metrics in graph.items():
            if isinstance(metrics, dict):
                cc = metrics.get("clustering_coef", 0)
                pl = metrics.get("char_path_length", 0)
                sw = metrics.get("small_worldness", 0)
                rows += f"<tr><td>{_esc(band)}</td><td>{cc:.3f}</td><td>{pl:.3f}</td><td>{sw:.3f}</td></tr>"
        return f'<table class="data-table">{header}{rows}</table>'

    def _flagged_section() -> str:
        flagged = (zscores.get("flagged") or [])
        if not flagged:
            return '<p class="note">No significant deviations flagged.</p>'
        header = "<tr><th>Metric</th><th>Channel</th><th>z</th></tr>"
        rows = "".join(
            f"<tr><td>{_esc(f.get('metric',''))}</td>"
            f"<td>{_esc(f.get('channel',''))}</td>"
            f"<td>{f.get('z', 0):.2f}</td></tr>"
            for f in flagged if isinstance(f, dict)
        )
        return f'<table class="data-table">{header}{rows}</table>'

    def _ai_section() -> str:
        if not ai_narrative:
            return '<p class="note">No AI interpretation available.</p>'
        parts = []
        if ai_narrative.get("executive_summary"):
            parts.append(f"<h3>Executive Summary</h3><p>{_esc(ai_narrative['executive_summary'])}</p>")
        if ai_narrative.get("detailed_findings"):
            findings = ai_narrative["detailed_findings"]
            if isinstance(findings, str):
                parts.append(f"<h3>Detailed Findings</h3><p>{_esc(findings)}</p>")
            elif isinstance(findings, dict):
                items = "".join(f"<li><strong>{_esc(k)}:</strong> {_esc(str(v))}</li>" for k, v in findings.items())
                parts.append(f"<h3>Detailed Findings</h3><ul>{items}</ul>")
        if ai_narrative.get("protocol_recommendations"):
            recs = ai_narrative["protocol_recommendations"]
            if isinstance(recs, list):
                items = "".join(f"<li>{_esc(str(r))}</li>" for r in recs)
                parts.append(f"<h3>Protocol Recommendations</h3><ul>{items}</ul>")
        return "".join(parts) if parts else '<p class="note">No AI interpretation available.</p>'

    # ── Connectivity section ──────────────────────────────────────────────
    conn_parts = []
    coh_imgs = {k: v for k, v in connectivity_images.items() if k.startswith("coherence_")}
    wpli_imgs = {k: v for k, v in connectivity_images.items() if k.startswith("wpli_")}

    if coh_imgs:
        conn_parts.append("<h3>Coherence</h3>" + _img_grid(coh_imgs))
    if wpli_imgs:
        conn_parts.append("<h3>wPLI</h3>" + _img_grid(wpli_imgs))
    connectivity_html = "".join(conn_parts) if conn_parts else '<p class="note">Not computed.</p>'

    # ── Source section ────────────────────────────────────────────────────
    source_method = features.get("source", {}).get("method", "N/A")
    source_html = _img_grid(source_images) if source_images else '<p class="note">Not computed.</p>'

    # ── Assemble ──────────────────────────────────────────────────────────
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>DeepSynaps qEEG Report v2 — {_esc(case_id)}</title>
<style>
  @page {{ size: A4; margin: 18mm 15mm; }}
  @media print {{ .page-break {{ page-break-before: always; }} }}
  body {{
    font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1b2430; margin: 0; padding: 24px; line-height: 1.55;
    background: #fff;
  }}
  .cover {{
    text-align: center; padding: 60px 24px 40px;
    border-bottom: 3px solid #2563eb; margin-bottom: 32px;
  }}
  .cover h1 {{ color: #2563eb; font-size: 24px; margin: 0 0 8px; }}
  .cover .meta {{ color: #6b7280; font-size: 13px; }}
  h2 {{
    font-size: 16px; color: #1e40af; margin-top: 32px;
    border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;
  }}
  h3 {{ font-size: 14px; color: #3b4a63; margin-top: 18px; }}
  .data-table {{
    border-collapse: collapse; width: 100%; margin: 8px 0;
  }}
  .data-table th, .data-table td {{
    border: 1px solid #d3d9e3; padding: 5px 10px;
    font-size: 12px; text-align: left;
  }}
  .data-table th {{ background: #f1f5fb; font-weight: 600; }}
  .topo-grid {{
    display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0;
  }}
  .topo-fig {{
    display: inline-block; text-align: center; margin: 4px;
  }}
  .topo-fig img {{
    max-width: 240px; border: 1px solid #e0e4eb; border-radius: 4px;
  }}
  .topo-fig figcaption {{
    font-size: 10px; color: #6b7280; margin-top: 4px;
  }}
  .bar-chart img {{ max-width: 600px; margin: 12px 0; }}
  .badge {{
    display: inline-block; padding: 2px 8px; border-radius: 8px;
    background: #edf2fb; color: #3b4a63; font-size: 11px; margin: 2px;
  }}
  .note {{ font-size: 11px; color: #66718a; font-style: italic; }}
  .disclaimer {{
    margin-top: 40px; padding: 12px 16px; background: #fef3c7;
    border-left: 4px solid #f59e0b; font-size: 11px; color: #92400e;
  }}
  .footer {{
    margin-top: 24px; text-align: center; font-size: 10px; color: #9ca3af;
  }}
</style>
</head>
<body>

<!-- 1. Cover Page -->
<div class="cover">
  <h1>DeepSynaps Quantitative EEG Report</h1>
  <p class="meta">
    Case: {_esc(case_id)} &middot; Patient: {_esc(patient_name or 'N/A')} &middot;
    Date: {_esc(recording_date or 'N/A')}
  </p>
  <p class="meta">
    Clinician: {_esc(clinician_name or 'N/A')} &middot; Generated: {now}
  </p>
  <p>
    <span class="badge">Pipeline {_esc(quality.get('pipeline_version', PKG_VERSION))}</span>
    <span class="badge">Norms {_esc(zscores.get('norm_db_version', 'N/A'))}</span>
    <span class="badge">Source: {_esc(source_method)}</span>
  </p>
</div>

<!-- 2. Pipeline Quality -->
<h2>1. Pipeline Quality</h2>
{_quality_table()}

<!-- 3. Band Power Topomaps (Absolute) -->
<div class="page-break"></div>
<h2>2. Band Power Topomaps (Absolute)</h2>
{_img_grid(topo_images, "Power: ")}

<!-- 4. Band Power Topomaps (Z-Score) -->
<h2>3. Band Power Topomaps (Z-Score)</h2>
{_img_grid(zscore_images, "Z: ")}

<!-- 5. Band Power Bar Chart -->
<h2>4. Global Band-Power Z-Score</h2>
<div class="bar-chart">
  {'<img src="' + bandpower_bar + '" alt="Band power z-score" />' if bandpower_bar else '<p class="note">Not available.</p>'}
</div>

<!-- 6. Spectral Parameterization -->
<h2>5. Spectral Parameterization</h2>
<p class="note">
  Peak alpha frequency: {_esc(str(features.get('spectral', {}).get('peak_alpha_freq', 'N/A')))}
</p>

<!-- 7. Asymmetry -->
<div class="page-break"></div>
<h2>6. Interhemispheric Asymmetry</h2>
{_asymmetry_section()}

<!-- 8-9. Connectivity -->
<h2>7. Functional Connectivity</h2>
{connectivity_html}

<!-- 10. Graph Metrics -->
<div class="page-break"></div>
<h2>8. Graph Metrics</h2>
{_graph_section()}

<!-- 11. Source Localization -->
<h2>9. Source Localization ({_esc(source_method)})</h2>
{source_html}

<!-- 12. Flagged Deviations -->
<div class="page-break"></div>
<h2>10. Flagged Normative Deviations (|z| > 1.96)</h2>
{_flagged_section()}

<!-- 13. AI Interpretation -->
<h2>11. AI Clinical Interpretation</h2>
{_ai_section()}

<!-- 14. Disclaimer -->
<div class="disclaimer">
  <strong>Clinical Disclaimer:</strong> This report was generated by an automated
  pipeline and is intended to assist qualified clinicians. It does not constitute
  a clinical diagnosis. All findings must be reviewed and validated by a licensed
  healthcare professional in the context of the patient's full clinical history.
  <br/><em>Research / wellness use only. Not for diagnostic purposes.</em>
</div>

<div class="footer">
  DeepSynaps Protocol Studio &mdash; qEEG Report v2 &mdash; {now}
</div>

</body>
</html>"""


def _render_pdf(html_str: str, pdf_path: Path) -> Path | None:
    """Render HTML to PDF using WeasyPrint."""
    try:
        from weasyprint import HTML
        HTML(string=html_str).write_pdf(str(pdf_path))
        return pdf_path
    except Exception as exc:
        log.warning("WeasyPrint PDF render failed (%s). HTML-only output.", exc)
        return None
