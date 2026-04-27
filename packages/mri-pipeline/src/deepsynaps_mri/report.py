"""
Clinical HTML + PDF report rendering.

HTML via Jinja2; PDF via weasyprint. The template is embedded as a
string so the package ships self-contained. The report is
decision-support-only and every target carries its disclaimer.
"""
from __future__ import annotations

import logging
from pathlib import Path

from .schemas import MRIReport

log = logging.getLogger(__name__)


_HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>DeepSynaps MRI Analyzer — {{ report.patient.patient_id }}</title>
<style>
 :root { --fg:#0b1220; --muted:#475569; --bg:#fafafa; --panel:#fff; --accent:#1e3a8a; --flag:#b91c1c; }
 html,body { font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: var(--fg); background: var(--bg); margin:0; }
 .wrap { max-width: 1100px; margin: 0 auto; padding: 32px; }
 h1 { margin: 0 0 4px; font-size: 24px; }
 h2 { font-size: 18px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-top: 32px; }
 h3 { font-size: 14px; color: var(--muted); margin: 16px 0 8px; text-transform: uppercase; letter-spacing: 0.05em; }
 table { width:100%; border-collapse: collapse; font-size: 13px; background: var(--panel); }
 th, td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: left; }
 th { background: #f8fafc; font-weight: 600; }
 .flag { color: var(--flag); font-weight: 600; }
 .pill { display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
 .pill.rtms { background:#fff7ed; color:#9a3412; }
 .pill.tps  { background:#fdf4ff; color:#86198f; }
 .pill.tfus { background:#ecfeff; color:#155e75; }
 .pill.tdcs { background:#f0fdf4; color:#166534; }
 .pill.tacs { background:#fefce8; color:#854d0e; }
 .disclaimer { margin-top: 32px; padding: 14px; border: 1px solid #fbbf24; background: #fffbeb; color: #78350f; font-size: 12px; border-radius: 8px; }
 .muted { color: var(--muted); }
 .grid { display:grid; grid-template-columns: repeat(2, 1fr); gap: 18px; }
 .card { background: var(--panel); border:1px solid #e5e7eb; border-radius:10px; padding:14px; }
 .warn { color:#92400e; background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:8px; margin:6px 0; }
 .json-block { white-space:pre-wrap; font-family:Menlo, Consolas, monospace; font-size:10px; background:#0f172a; color:#e2e8f0; padding:10px; border-radius:8px; }
 .target-row iframe { width:100%; height:320px; border:0; border-radius:8px; }
 .xyz { font-variant-numeric: tabular-nums; font-family: "Menlo", monospace; font-size: 12px; color: var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <h1>DeepSynaps MRI Analyzer — {{ report.patient.patient_id }}</h1>
  <div class="muted">analysis_id: {{ report.analysis_id }} · pipeline v{{ report.pipeline_version }} · norm_db {{ report.norm_db_version }}</div>

  <h2>Patient & modalities</h2>
  <div class="grid">
    <div class="card">
      <h3>Patient</h3>
      <div>Age: {{ report.patient.age or "—" }} · Sex: {{ report.patient.sex.value if report.patient.sex else "—" }}
          · Handedness: {{ report.patient.handedness or "—" }}</div>
      <div class="muted">Chief complaint: {{ report.patient.chief_complaint or "—" }}</div>
    </div>
    <div class="card">
      <h3>Modalities</h3>
      {% for m in report.modalities_present %}<span class="pill">{{ m.value }}</span> {% endfor %}
    </div>
  </div>

  <h2>QC</h2>
  <table>
    <tr><th>Metric</th><th>Value</th></tr>
    <tr><td>T1 SNR</td><td>{{ report.qc.t1_snr or "—" }}</td></tr>
    <tr><td>Mean framewise displacement (fMRI)</td><td>{{ "%.3f"|format(report.qc.fmri_framewise_displacement_mean_mm) if report.qc.fmri_framewise_displacement_mean_mm is not none else "—" }} mm</td></tr>
    <tr><td>fMRI outlier volumes</td><td>{{ "%.1f"|format(report.qc.fmri_outlier_volume_pct) if report.qc.fmri_outlier_volume_pct is not none else "—" }} %</td></tr>
    <tr><td>DTI outlier volumes</td><td>{{ report.qc.dti_outlier_volumes or "—" }}</td></tr>
    <tr><td>Passed</td><td>{{ "yes" if report.qc.passed else "no" }}</td></tr>
  </table>

  {% if report.clinical_summary %}
  <h2>Clinical review summary</h2>
  <div class="card">
    <div><b>Readiness:</b> {{ report.clinical_summary.readiness }}
      · <b>Confidence:</b> {{ "%.0f"|format(report.clinical_summary.confidence.score * 100) }}%
      ({{ report.clinical_summary.confidence.level }})</div>
    <p class="muted">{{ report.clinical_summary.safety_statement }}</p>
    {% for flag in report.clinical_summary.data_quality.flags %}
      <div class="warn"><b>{{ flag.severity|upper }}</b>: {{ flag.message }}</div>
    {% endfor %}
    <h3>Observed findings</h3>
    {% if report.clinical_summary.observed_findings %}
      <ul>{% for finding in report.clinical_summary.observed_findings %}<li>{{ finding.statement }}</li>{% endfor %}</ul>
    {% else %}
      <p class="muted">No salient observed findings selected for this report.</p>
    {% endif %}
    <h3>Derived interpretation</h3>
    <ul>{% for item in report.clinical_summary.derived_interpretations %}<li>{{ item.statement }} <span class="muted">Confidence: {{ item.confidence }}</span></li>{% endfor %}</ul>
    <h3>Limitations</h3>
    <ul>{% for item in report.clinical_summary.limitations %}<li>{{ item }}</li>{% endfor %}</ul>
  </div>
  {% endif %}

  {% if report.structural %}
  <h2>Structural</h2>
  <h3>Flagged cortical thickness</h3>
  <table><tr><th>Region</th><th>Value (mm)</th><th>z</th></tr>
  {% for k, v in report.structural.cortical_thickness_mm.items() %}
    {% if v.flagged %}<tr><td>{{ k }}</td><td>{{ "%.2f"|format(v.value) }}</td><td class="flag">{{ "%.2f"|format(v.z) if v.z is not none else "—" }}</td></tr>{% endif %}
  {% endfor %}
  </table>
  <h3>Flagged subcortical volumes</h3>
  <table><tr><th>Region</th><th>Value (mm³)</th><th>z</th></tr>
  {% for k, v in report.structural.subcortical_volume_mm3.items() %}
    {% if v.flagged %}<tr><td>{{ k }}</td><td>{{ "%.0f"|format(v.value) }}</td><td class="flag">{{ "%.2f"|format(v.z) if v.z is not none else "—" }}</td></tr>{% endif %}
  {% endfor %}
  </table>
  {% endif %}

  {% if report.functional %}
  <h2>Functional</h2>
  {% if report.functional.sgACC_DLPFC_anticorrelation %}
  <div class="card">sgACC↔DLPFC anticorrelation (Fisher-z): <b>{{ "%.3f"|format(report.functional.sgACC_DLPFC_anticorrelation.value) }}</b>
  {% if report.functional.sgACC_DLPFC_anticorrelation.flagged %}<span class="flag"> — weak/absent anticorrelation</span>{% endif %}</div>
  {% endif %}
  <h3>Network within-FC</h3>
  <table><tr><th>Network</th><th>mean within-FC (r)</th><th>top hubs</th></tr>
  {% for n in report.functional.networks %}
    <tr><td>{{ n.network }}</td><td>{{ "%.3f"|format(n.mean_within_fc.value) }}</td><td class="muted">{{ n.top_hubs|join(", ") }}</td></tr>
  {% endfor %}
  </table>
  {% endif %}

  {% if report.diffusion and report.diffusion.bundles %}
  <h2>Diffusion (DTI bundles)</h2>
  <table><tr><th>Bundle</th><th>mean FA</th><th>mean MD</th><th>streamlines</th></tr>
  {% for b in report.diffusion.bundles %}
    <tr><td>{{ b.bundle }}</td><td>{{ "%.3f"|format(b.mean_FA.value) }}</td><td>{{ "%.3e"|format(b.mean_MD.value) if b.mean_MD else "—" }}</td><td>{{ b.streamline_count }}</td></tr>
  {% endfor %}
  </table>
  {% endif %}

  <h2>Stimulation targets ({{ report.stim_targets|length }})</h2>
  {% for t in report.stim_targets %}
  <div class="card target-row" style="margin-bottom:14px;">
    <div>
      <span class="pill {{ t.modality }}">{{ t.modality|upper }}</span>
      <b>{{ t.region_name }}</b>
      <span class="xyz"> · MNI ({{ t.mni_xyz|join(", ") }})</span>
      <span class="muted"> · {{ t.method }} · confidence: {{ t.confidence }}</span>
    </div>
    <div class="muted" style="margin-top:4px;">Suggested: {{ t.suggested_parameters.protocol or "—" }} ·
      {{ t.suggested_parameters.sessions or "—" }} sessions ·
      {{ t.suggested_parameters.pulses_per_session or "—" }} pulses/session</div>
    <div class="muted" style="margin-top:4px; font-size:12px;">References:
      {% for d in t.method_reference_dois %}<a href="https://doi.org/{{ d }}">{{ d }}</a>{% if not loop.last %}, {% endif %}{% endfor %}
    </div>
    {% if report.overlays.get(t.target_id) %}
      <iframe src="overlays/{{ t.target_id }}_interactive.html"></iframe>
    {% endif %}
  </div>
  {% endfor %}

  <div class="disclaimer">
    <b>Decision-support only.</b> Coordinates and suggested parameters are derived from peer-reviewed literature
    (see DOIs per target). Not a substitute for clinician judgment and not a medical device. For neuronavigation
    planning only.
  </div>
  {% if report.clinical_summary %}
  <h2>Machine-readable JSON payload</h2>
  <pre class="json-block">{{ report.clinical_summary.model_dump_json(indent=2) }}</pre>
  {% endif %}
</div>
</body>
</html>
"""


def render_html(report: MRIReport, out_path: str | Path, *,
                overlays_dir: str | Path | None = None) -> Path:
    from jinja2 import Template
    tpl = Template(_HTML_TEMPLATE)
    html = tpl.render(report=report)
    out = Path(out_path)
    out.write_text(html, encoding="utf-8")
    return out


def render_pdf(html_path: str | Path, out_path: str | Path) -> Path:
    """Render HTML to PDF using weasyprint. Optional: we swallow failure
    since weasyprint needs Pango+Cairo and we don't want the full pipeline
    to fail if only PDF rendering breaks."""
    out = Path(out_path)
    try:
        from weasyprint import HTML
        HTML(filename=str(html_path)).write_pdf(str(out))
    except Exception as e:                                          # noqa: BLE001
        log.warning("weasyprint PDF render failed: %s — writing HTML stub", e)
        out.write_bytes(Path(html_path).read_bytes())
    return out
