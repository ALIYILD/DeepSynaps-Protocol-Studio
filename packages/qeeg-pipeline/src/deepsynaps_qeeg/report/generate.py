"""Report generation — Jinja2 HTML + WeasyPrint PDF with topomap panels.

The HTML template is shipped inline so no extra template files need to be
packaged. Topomaps per band are rendered with ``mne.viz.plot_topomap`` and
embedded as base64 PNGs. If either ``matplotlib`` or ``weasyprint`` is missing,
we still return an HTML string but ``pdf_path=None``.
"""
from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import TYPE_CHECKING, Any

from .. import __version__ as PKG_VERSION

if TYPE_CHECKING:  # pragma: no cover
    from ..pipeline import PipelineResult

log = logging.getLogger(__name__)

HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>DeepSynaps qEEG Report</title>
<style>
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1b2430; margin: 24px; }
  h1 { font-size: 22px; border-bottom: 2px solid #4c6ef5; padding-bottom: 6px; }
  h2 { font-size: 16px; margin-top: 22px; color: #3b4a63; }
  h3 { font-size: 13px; margin-top: 14px; color: #3b4a63; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td { border: 1px solid #d3d9e3; padding: 4px 8px; font-size: 12px; text-align: right; }
  th { background: #f1f5fb; text-align: left; }
  .band-img { max-width: 320px; margin: 6px; border: 1px solid #e0e4eb; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 8px;
           background: #edf2fb; color: #3b4a63; font-size: 11px; margin-right: 4px; }
  .note { font-size: 11px; color: #66718a; }
  .roi-table th, .roi-table td { font-size: 11px; }
  .refs li { font-size: 11px; color: #3b4a63; margin-bottom: 4px; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
  .card { border: 1px solid #e0e4eb; border-radius: 10px; padding: 10px; background: #fff; }
  .warn { color: #92400e; background: #fffbeb; border: 1px solid #fcd34d; padding: 6px 8px; border-radius: 8px; }
  .json-block { white-space: pre-wrap; font-family: Menlo, Consolas, monospace; font-size: 10px; background: #0f172a; color: #e2e8f0; padding: 10px; border-radius: 8px; }
</style>
</head>
<body>
  <h1>DeepSynaps qEEG Report</h1>
  <p class="note">Decision support only. Research / wellness use only. Not for diagnostic purposes.</p>
  <p>
    <span class="badge">pipeline {{ pipeline_version }}</span>
    <span class="badge">norms {{ norm_db_version }}</span>
    {% if method %}<span class="badge">source: {{ method }}</span>{% endif %}
  </p>

  <h2>Pipeline quality</h2>
  <table>
    <tr><th>Input sampling rate</th><td>{{ quality.sfreq_input }} Hz</td></tr>
    <tr><th>Output sampling rate</th><td>{{ quality.sfreq_output }} Hz</td></tr>
    <tr><th>Bandpass</th><td>{{ quality.bandpass }}</td></tr>
    <tr><th>Notch</th><td>{{ quality.notch_hz }}</td></tr>
    <tr><th>Rejected channels</th><td>{{ quality.bad_channels | join(", ") or "none" }}</td></tr>
    <tr><th>Epochs retained / total</th>
        <td>{{ quality.n_epochs_retained }} / {{ quality.n_epochs_total }}</td></tr>
    <tr><th>IC components dropped</th><td>{{ quality.ica_components_dropped }}</td></tr>
  </table>

  {% if clinical_summary %}
  <h2>Clinical review summary</h2>
  <div class="card">
    <p><strong>Readiness:</strong> {{ clinical_summary.readiness }}
       · <strong>Confidence:</strong> {{ "%.0f"|format(clinical_summary.confidence.score * 100) }}%
       ({{ clinical_summary.confidence.level }})</p>
    <p class="note">{{ clinical_summary.safety_statement }}</p>
    {% if clinical_summary.data_quality.flags %}
      {% for flag in clinical_summary.data_quality.flags %}
        <p class="warn"><strong>{{ flag.severity|upper }}:</strong> {{ flag.message }}</p>
      {% endfor %}
    {% else %}
      <p class="note">No major automated data-quality warnings were generated.</p>
    {% endif %}
    <h3>Observed findings</h3>
    {% if clinical_summary.observed_findings %}
      <ul>
      {% for finding in clinical_summary.observed_findings %}
        <li>{{ finding.statement }}</li>
      {% endfor %}
      </ul>
    {% else %}
      <p class="note">No salient observed findings were selected for this run.</p>
    {% endif %}
    <h3>Model-derived interpretation</h3>
    <ul>
    {% for item in clinical_summary.derived_interpretations %}
      <li>{{ item.statement }} <span class="note">Confidence: {{ item.confidence }}</span></li>
    {% endfor %}
    </ul>
    <h3>Limitations / caution</h3>
    <ul>
    {% for item in clinical_summary.limitations %}
      <li>{{ item }}</li>
    {% endfor %}
    </ul>
  </div>
  {% endif %}

  <h2>Band power topomaps (absolute µV²)</h2>
  <div>
    {% for band, img in topomaps.items() %}
      <figure style="display:inline-block;">
        <img class="band-img" src="{{ img }}" alt="{{ band }}" />
        <figcaption style="text-align:center;">{{ band }}</figcaption>
      </figure>
    {% endfor %}
  </div>

  <h2>Flagged normative deviations (|z| &gt; 1.96)</h2>
  {% if flagged %}
  <table>
    <tr><th>Metric</th><th>Channel</th><th>z</th></tr>
    {% for f in flagged %}
      <tr><td>{{ f.metric }}</td><td>{{ f.channel }}</td><td>{{ "%.2f"|format(f.z) }}</td></tr>
    {% endfor %}
  </table>
  {% else %}<p class="note">No significant deviations flagged.</p>{% endif %}

  <h2>Asymmetry</h2>
  <table>
    <tr><th>F3/F4</th><td>{{ asymmetry.get("frontal_alpha_F3_F4") }}</td></tr>
    <tr><th>F7/F8</th><td>{{ asymmetry.get("frontal_alpha_F7_F8") }}</td></tr>
  </table>

  <h2>Graph metrics</h2>
  <table>
    <tr><th>Band</th><th>Clustering</th><th>Path length</th><th>Small-worldness</th></tr>
    {% for band, m in graph.items() %}
      <tr><td>{{ band }}</td>
          <td>{{ "%.3f"|format(m.clustering_coef) }}</td>
          <td>{{ "%.3f"|format(m.char_path_length) }}</td>
          <td>{{ "%.3f"|format(m.small_worldness) }}</td></tr>
    {% endfor %}
  </table>

  <h2>Source Localization</h2>
  <p class="note">Decision support only. Research use only. Source estimates are model-derived and require clinical correlation.</p>
  {% if source_roi_table %}
  <table class="roi-table">
    <tr>
      <th>ROI</th><th>delta</th><th>theta</th><th>alpha</th><th>beta</th><th>gamma</th>
    </tr>
    {% for row in source_roi_table %}
      <tr>
        <th>{{ row.roi }}</th>
        <td>{{ "%.6g"|format(row.delta) }}</td>
        <td>{{ "%.6g"|format(row.theta) }}</td>
        <td>{{ "%.6g"|format(row.alpha) }}</td>
        <td>{{ "%.6g"|format(row.beta) }}</td>
        <td>{{ "%.6g"|format(row.gamma) }}</td>
      </tr>
    {% endfor %}
  </table>
  {% else %}
    <p class="note">Source localization unavailable or skipped by quality guard.</p>
  {% endif %}

  {% if longitudinal and (longitudinal.change_topomaps or longitudinal.trend_lines) %}
  <h2>Longitudinal Change</h2>
  <p class="note">
    Within-patient change vs previous session (if available). Change maps use a fixed diverging scale of ±2 z.
  </p>
  {% if longitudinal.prev_session_id %}
    <p class="note">Compared to previous session: <strong>{{ longitudinal.prev_session_id }}</strong></p>
  {% endif %}

  {% if longitudinal.change_topomaps %}
  <h3>Change topomaps (Δz, curr − prev)</h3>
  <div class="grid">
    {% for band, img in longitudinal.change_topomaps.items() %}
      <figure class="card" style="display:inline-block;">
        <img class="band-img" src="{{ img }}" alt="change {{ band }}" />
        <figcaption style="text-align:center;">{{ band }}</figcaption>
      </figure>
    {% endfor %}
  </div>
  {% endif %}

  {% if longitudinal.trend_lines %}
  <h3>Trend (≥3 sessions)</h3>
  <div class="grid">
    {% for key, img in longitudinal.trend_lines.items() %}
      <figure class="card" style="display:inline-block;">
        <img class="band-img" src="{{ img }}" alt="trend {{ key }}" />
        <figcaption style="text-align:center;">{{ key }}</figcaption>
      </figure>
    {% endfor %}
  </div>
  {% endif %}
  {% endif %}

  {% if enriched_findings %}
  <h2>Artifact &amp; Normative Advisory</h2>
  <div>
    {% for ef in enriched_findings %}
    <div class="card" style="margin-bottom: 10px;">
      <p><strong>{{ ef.region }} — {{ ef.band }} ({{ ef.severity }} {{ ef.direction }})</strong></p>
      <p class="note">{{ ef.clinical_note }}</p>
      {% if ef.medication_flags %}
        <p>
          {% for mf in ef.medication_flags %}
            <span class="badge" style="background: #fce7f3; color: #831843;">{{ mf.medication }}</span>
          {% endfor %}
        </p>
      {% endif %}
      {% if ef.artifact_flags %}
        <p>
          {% for af in ef.artifact_flags %}
            <span class="warn" style="display: inline-block; margin-right: 4px;">⚠️ {{ af.artifact_type }} ({{ af.confidence }})</span>
          {% endfor %}
        </p>
      {% endif %}
    </div>
    {% endfor %}
  </div>
  {% endif %}

  {% if narrative %}
  <h2>Discussion</h2>
  <div>
    {{ narrative | safe }}
  </div>
  <p class="note">Generated by AI under clinician supervision</p>
  {% endif %}

  {% if references %}
  <h2>References</h2>
  <ol class="refs">
    {% for r in references %}
      <li>
        <strong>[{{ r.citation_id }}]</strong>
        {{ r.title or "Untitled" }}
        {% if r.year %} ({{ r.year }}){% endif %}
        {% if r.doi %}
          — <a href="https://doi.org/{{ r.doi }}">doi:{{ r.doi }}</a>
        {% elif r.pmid %}
          — <a href="https://pubmed.ncbi.nlm.nih.gov/{{ r.pmid }}/">pmid:{{ r.pmid }}</a>
        {% endif %}
      </li>
    {% endfor %}
  </ol>
  {% endif %}

  {% if clinical_summary %}
  <h2>Machine-readable summary</h2>
  <pre class="json-block">{{ clinical_summary_json }}</pre>
  {% endif %}
</body>
</html>
"""


def build(
    result: "PipelineResult",
    *,
    out_dir: Path,
    ch_names: list[str],
) -> tuple[str, Path | None]:
    """Render the pipeline result as HTML and (optionally) a PDF.

    Parameters
    ----------
    result : PipelineResult
        Output of :func:`deepsynaps_qeeg.pipeline.run_full_pipeline`.
    out_dir : Path
        Directory where ``report.html`` and ``report.pdf`` are written.
    ch_names : list of str
        Channel names in the same order used by the topomap positions.

    Returns
    -------
    html_str : str
        Rendered HTML document.
    pdf_path : Path or None
        Path to the generated PDF, or ``None`` if WeasyPrint is unavailable.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    topomaps = _build_topomaps(result.features, ch_names)

    narrative_html = None
    narrative_refs: list[dict[str, Any]] = []
    enriched_findings: list[dict[str, Any]] = []
    try:
        from ..knowledge import enhance_findings
        from ..narrative import extract_findings, generate_safe_narrative, retrieve_evidence
        from ..narrative.types import Citation

        findings = extract_findings(result)
        if findings:
            # Age default: 240 months = 20 years
            age_years = result.quality.get("age")
            age_months = int(age_years * 12) if age_years is not None else 240
            enriched_findings = enhance_findings(
                findings,
                age_months=age_months,
                recording_state=result.quality.get("recording_state", "awake_eo"),
                patient_meta={"medications": result.quality.get("medications")},
            )
            evidence: dict[str, list[Citation]] = {}
            for f in findings[:8]:
                evidence[f.key] = retrieve_evidence(f, top_k=5)
            report = generate_safe_narrative(
                findings,
                evidence,
                patient_meta={
                    "age": result.quality.get("age"),
                    "sex": result.quality.get("sex"),
                    "recording_state": result.quality.get("recording_state"),
                    "medications": result.quality.get("medications"),
                    "enriched_findings": enriched_findings,
                },
            )
            narrative_html = _markdown_to_html(report.discussion_markdown)
            narrative_refs = [
                {
                    "citation_id": c.citation_id,
                    "pmid": c.pmid,
                    "doi": c.doi,
                    "title": c.title,
                    "year": c.year,
                }
                for c in report.references
            ]
    except Exception as exc:
        log.warning("Narrative generation skipped (%s)", exc)

    clinical_summary = (result.features or {}).get("clinical_summary") or None
    context = {
        "pipeline_version": result.quality.get("pipeline_version", PKG_VERSION),
        "norm_db_version": result.zscores.get("norm_db_version", "unknown"),
        "quality": result.quality or {},
        "topomaps": topomaps,
        "flagged": (result.zscores or {}).get("flagged", []) or [],
        "asymmetry": (result.features or {}).get("asymmetry", {}) or {},
        "graph": (result.features or {}).get("graph", {}) or {},
        "method": (result.features or {}).get("source", {}).get("method"),
        "source_roi_table": (result.features or {}).get("source", {}).get("roi_table") or [],
        "longitudinal": (getattr(result, "longitudinal", None) or {}) if result is not None else {},
        "narrative": narrative_html,
        "references": narrative_refs,
        "clinical_summary": clinical_summary,
        "clinical_summary_json": _json_dumps(clinical_summary) if clinical_summary else "",
        "enriched_findings": enriched_findings,
    }

    html_str = _render(context)

    html_path = out_dir / "report.html"
    html_path.write_text(html_str, encoding="utf-8")

    pdf_path = _render_pdf(html_str, out_dir / "report.pdf")
    return html_str, pdf_path


def _render(context: dict[str, Any]) -> str:
    try:
        from jinja2 import Environment, select_autoescape

        env = Environment(autoescape=select_autoescape(["html"]))
        tpl = env.from_string(HTML_TEMPLATE)
        return tpl.render(**context)
    except Exception as exc:
        log.warning("Jinja2 unavailable / template failed (%s); using fallback.", exc)
        return _fallback_render(context)


def _fallback_render(context: dict[str, Any]) -> str:
    lines = ["<html><body><h1>DeepSynaps qEEG Report</h1>"]
    lines.append(f"<p>pipeline {context.get('pipeline_version')} · norms "
                 f"{context.get('norm_db_version')}</p>")
    lines.append("<pre>")
    import json as _json

    try:
        lines.append(_json.dumps(context["quality"], indent=2, default=str))
    except Exception:
        lines.append(str(context.get("quality")))
    lines.append("</pre></body></html>")
    return "\n".join(lines)


def _json_dumps(value: Any) -> str:
    import json as _json

    return _json.dumps(value, indent=2, sort_keys=True, default=str)


def _markdown_to_html(md: str) -> str:
    """Convert Markdown to minimal HTML for report embedding.

    Uses `markdown` package when available; otherwise falls back to a very
    small converter for headings + bullet lists + paragraphs.
    """
    text = (md or "").strip()
    if not text:
        return ""
    try:
        import markdown as _md  # type: ignore[import-not-found]

        return _md.markdown(text, extensions=["extra"])
    except Exception:
        # Minimal fallback: headings, bullets, paragraphs. Preserve citation markers.
        out: list[str] = []
        in_ul = False
        for raw in text.splitlines():
            line = raw.rstrip()
            if not line.strip():
                if in_ul:
                    out.append("</ul>")
                    in_ul = False
                continue
            if line.startswith("### "):
                if in_ul:
                    out.append("</ul>")
                    in_ul = False
                out.append(f"<h3>{line[4:].strip()}</h3>")
                continue
            if line.startswith("## "):
                if in_ul:
                    out.append("</ul>")
                    in_ul = False
                out.append(f"<h3>{line[3:].strip()}</h3>")
                continue
            if line.startswith("- "):
                if not in_ul:
                    out.append("<ul>")
                    in_ul = True
                out.append(f"<li>{line[2:].strip()}</li>")
                continue
            if in_ul:
                out.append("</ul>")
                in_ul = False
            out.append(f"<p>{line}</p>")
        if in_ul:
            out.append("</ul>")
        return "\n".join(out)


def _build_topomaps(features: dict[str, Any] | None, ch_names: list[str]) -> dict[str, str]:
    """Produce base64 data-URIs for absolute power topomaps per band."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import mne
        import numpy as np
    except Exception as exc:
        log.warning("matplotlib/mne unavailable for topomaps (%s).", exc)
        return {}

    if not features:
        return {}

    bands = (features.get("spectral") or {}).get("bands") or {}
    if not bands:
        return {}

    montage = mne.channels.make_standard_montage("standard_1020")
    info = mne.create_info(ch_names=list(ch_names), sfreq=250.0, ch_types="eeg")
    info.set_montage(montage, on_missing="ignore")

    topomaps: dict[str, str] = {}
    for band, payload in bands.items():
        abs_map = (payload or {}).get("absolute_uv2") or {}
        if not abs_map:
            continue
        values = np.asarray([float(abs_map.get(ch, 0.0)) for ch in ch_names])
        try:
            fig, ax = plt.subplots(figsize=(3, 3), dpi=120)
            mne.viz.plot_topomap(values, info, axes=ax, show=False, cmap="viridis")
            ax.set_title(band)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight")
            plt.close(fig)
            encoded = base64.b64encode(buf.getvalue()).decode("ascii")
            topomaps[band] = f"data:image/png;base64,{encoded}"
        except Exception as exc:
            log.warning("Topomap for %s failed (%s).", band, exc)
    return topomaps


def _render_pdf(html_str: str, pdf_path: Path) -> Path | None:
    try:
        from weasyprint import HTML

        HTML(string=html_str).write_pdf(str(pdf_path))
        return pdf_path
    except Exception as exc:
        log.warning("WeasyPrint unavailable / PDF render failed (%s).", exc)
        return None
