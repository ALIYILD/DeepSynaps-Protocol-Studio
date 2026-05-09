"""Clinical decision-support HTML renderer for analyzer AI reports.

Standalone HTML renderer (no Jinja2 dep, intentional — keeps the bundle
identical to ``render_html.document_to_html``). The output is fed to
``html_to_pdf_bytes`` (WeasyPrint) for the final PDF.

The HTML is also viewable in a browser without WeasyPrint, which is
convenient for QA — see the test fixtures in
``tests/test_analyzer_ai_report.py``.
"""

from __future__ import annotations

import html as _html
from typing import Any, Optional


def _esc(value: Any) -> str:
    if value is None:
        return ""
    return _html.escape(str(value), quote=True)


def _severity_color(sev: str) -> str:
    sev = (sev or "").lower()
    return {
        "critical": "#9f1239",
        "high": "#dc2626",
        "moderate": "#d97706",
        "low": "#15803d",
    }.get(sev, "#475569")


def _confidence_label(value: Any) -> str:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return "—"
    pct = max(0, min(100, int(round(f * 100))))
    return f"{pct}%"


def _confidence_bar_svg(value: Any) -> str:
    """Inline 80x6 confidence bar (printable, no external assets)."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        f = 0.0
    f = max(0.0, min(1.0, f))
    width = int(round(f * 80))
    color = "#15803d" if f >= 0.7 else ("#d97706" if f >= 0.4 else "#dc2626")
    return (
        "<svg width='80' height='6' viewBox='0 0 80 6' "
        "xmlns='http://www.w3.org/2000/svg'>"
        "<rect x='0' y='0' width='80' height='6' rx='3' fill='#e2e8f0'/>"
        f"<rect x='0' y='0' width='{width}' height='6' rx='3' fill='{color}'/>"
        "</svg>"
    )


def _severity_distribution_svg(findings: list[dict[str, Any]]) -> str:
    """Inline bar chart of finding severity counts. Empty → empty string."""
    buckets = {"critical": 0, "high": 0, "moderate": 0, "low": 0}
    for f in findings or []:
        sev = (f.get("severity") or "moderate").lower()
        if sev in buckets:
            buckets[sev] += 1
    total = sum(buckets.values())
    if total == 0:
        return ""
    bar_w = 40
    gap = 14
    canvas_w = 4 * bar_w + 3 * gap + 20
    max_h = 60
    max_count = max(buckets.values())
    parts = [
        f"<svg width='{canvas_w}' height='{max_h + 28}' "
        f"viewBox='0 0 {canvas_w} {max_h + 28}' "
        "xmlns='http://www.w3.org/2000/svg' role='img' "
        "aria-label='Severity distribution'>",
    ]
    x = 10
    for sev in ("critical", "high", "moderate", "low"):
        count = buckets[sev]
        h = int(round((count / max_count) * max_h)) if max_count else 0
        y = max_h - h
        color = _severity_color(sev)
        parts.append(
            f"<rect x='{x}' y='{y}' width='{bar_w}' height='{h}' "
            f"fill='{color}' rx='2'/>"
        )
        parts.append(
            f"<text x='{x + bar_w // 2}' y='{max_h + 12}' text-anchor='middle' "
            f"font-size='8' fill='#475569'>{sev[:4].upper()}</text>"
        )
        parts.append(
            f"<text x='{x + bar_w // 2}' y='{y - 2}' text-anchor='middle' "
            f"font-size='9' font-weight='600' fill='#0f172a'>{count}</text>"
        )
        x += bar_w + gap
    parts.append("</svg>")
    return "".join(parts)


def _sparkline_svg(values: list[Any], label: str = "") -> str:
    """Inline sparkline for an analyzer-supplied numeric series."""
    nums: list[float] = []
    for v in values or []:
        try:
            nums.append(float(v))
        except (TypeError, ValueError):
            continue
    if len(nums) < 2:
        return ""
    w, h = 280, 38
    pad = 4
    lo, hi = min(nums), max(nums)
    rng = (hi - lo) or 1.0
    step = (w - 2 * pad) / max(1, (len(nums) - 1))
    points = []
    for i, v in enumerate(nums):
        x = pad + i * step
        y = h - pad - ((v - lo) / rng) * (h - 2 * pad)
        points.append(f"{x:.1f},{y:.1f}")
    polyline = " ".join(points)
    label_html = (
        f"<text x='{pad}' y='10' font-size='9' fill='#475569'>{_esc(label)} "
        f"(min {lo:.0f} · max {hi:.0f})</text>"
        if label
        else ""
    )
    return (
        f"<svg width='{w}' height='{h}' viewBox='0 0 {w} {h}' "
        "xmlns='http://www.w3.org/2000/svg'>"
        f"{label_html}"
        f"<polyline fill='none' stroke='#0f172a' stroke-width='1.5' "
        f"points='{polyline}'/>"
        "</svg>"
    )


def _charts_panel_html(
    findings: list[dict[str, Any]], extra_charts: list[dict[str, Any]]
) -> str:
    """Severity bar chart + analyzer-supplied sparklines, in one panel."""
    sev_svg = _severity_distribution_svg(findings)
    extras: list[str] = []
    for c in extra_charts or []:
        kind = (c.get("kind") or "").lower()
        if kind == "sparkline":
            svg = _sparkline_svg(c.get("data") or [], c.get("label") or "")
            if svg:
                extras.append(
                    f"<div class='chart-item'><div class='chart-label'>"
                    f"{_esc(c.get('label') or '')}</div>{svg}</div>"
                )
    if not sev_svg and not extras:
        return ""
    sev_block = (
        f"<div class='chart-item'><div class='chart-label'>"
        f"Finding severity distribution</div>{sev_svg}</div>"
        if sev_svg
        else ""
    )
    return (
        "<div class='charts-row'>" + sev_block + "".join(extras) + "</div>"
    )


def _findings_html(findings: list[dict[str, Any]]) -> str:
    if not findings:
        return "<p class='muted'>No structured findings produced.</p>"
    items = []
    for f in findings:
        sev = (f.get("severity") or "moderate").lower()
        color = _severity_color(sev)
        items.append(
            f"""
            <li class='finding'>
              <div class='finding-row'>
                <span class='sev-pill' style='background:{color}'>
                  {_esc(sev.upper())}
                </span>
                <span class='finding-title'>{_esc(f.get('title') or '—')}</span>
                <span class='conf'>conf {_confidence_label(f.get('confidence'))}</span>
                <span class='conf-bar'>{_confidence_bar_svg(f.get('confidence'))}</span>
              </div>
              <div class='finding-obs'>{_esc(f.get('observation') or '')}</div>
            </li>
            """.strip()
        )
    return "<ul class='findings'>" + "".join(items) + "</ul>"


def _bullet_list(items: list[Any]) -> str:
    if not items:
        return "<p class='muted'>None.</p>"
    return "<ul class='bul'>" + "".join(
        f"<li>{_esc(i)}</li>" for i in items
    ) + "</ul>"


def _refs_html(refs: list[dict[str, Any]]) -> str:
    if not refs:
        return "<p class='muted'>No literature retrieved for this report.</p>"
    rows = []
    for i, r in enumerate(refs, 1):
        meta_bits = []
        if r.get("authors"):
            meta_bits.append(_esc(r.get("authors")))
        if r.get("year"):
            meta_bits.append(_esc(r.get("year")))
        if r.get("journal"):
            meta_bits.append(_esc(r.get("journal")))
        meta_line = " · ".join(meta_bits)
        link_bits = []
        if r.get("doi"):
            link_bits.append(f"DOI {_esc(r.get('doi'))}")
        if r.get("pmid"):
            link_bits.append(f"PMID {_esc(r.get('pmid'))}")
        link_line = " · ".join(link_bits)
        rows.append(
            f"""
            <li class='ref'>
              <span class='ref-num'>[{i}]</span>
              <div class='ref-body'>
                <div class='ref-title'>{_esc(r.get('title') or '—')}</div>
                <div class='ref-meta'>{meta_line}</div>
                <div class='ref-ids'>{link_line}</div>
              </div>
            </li>
            """.strip()
        )
    return "<ol class='refs'>" + "".join(rows) + "</ol>"


def _metadata_table(metadata: dict[str, Any]) -> str:
    if not metadata:
        return ""
    rows = "".join(
        f"<tr><th>{_esc(k.replace('_', ' ').title())}</th><td>{_esc(v)}</td></tr>"
        for k, v in list(metadata.items())[:10]
        if v not in (None, "", [], {})
    )
    if not rows:
        return ""
    return f"<table class='meta'>{rows}</table>"


_BASE_CSS = """
@page { size: A4; margin: 18mm 16mm 22mm 16mm; }
* { box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  color: #0f172a;
  line-height: 1.45;
  font-size: 11pt;
  margin: 0;
}
header.report-head {
  border-bottom: 2px solid #0f172a;
  padding-bottom: 8px;
  margin-bottom: 12px;
}
header.report-head .brand {
  font-size: 9pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #475569;
}
header.report-head h1 {
  font-size: 18pt;
  margin: 4px 0 2px 0;
}
header.report-head .subtitle {
  color: #475569;
  font-size: 10pt;
}
section { margin: 14px 0; }
section h2 {
  font-size: 12pt;
  margin: 0 0 6px 0;
  border-left: 3px solid #0f172a;
  padding-left: 8px;
  background: #f1f5f9;
  padding-top: 4px;
  padding-bottom: 4px;
}
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  font-size: 10pt;
  color: #334155;
}
.meta-grid div b { color: #0f172a; }
table.meta {
  width: 100%;
  border-collapse: collapse;
  font-size: 10pt;
}
table.meta th, table.meta td {
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  padding: 4px 6px;
  vertical-align: top;
}
table.meta th { width: 35%; color: #475569; font-weight: 600; }
.findings { list-style: none; padding: 0; margin: 0; }
.finding {
  padding: 8px 10px;
  margin: 6px 0;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fafafa;
}
.finding-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.finding-title { font-weight: 600; flex: 1; }
.sev-pill {
  color: #fff;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.conf { color: #475569; font-size: 9pt; font-variant-numeric: tabular-nums; }
.finding-obs { color: #334155; }
.bul { padding-left: 18px; margin: 4px 0; }
.bul li { margin: 2px 0; }
.muted { color: #94a3b8; font-style: italic; }
.refs { padding-left: 0; margin: 0; list-style: none; }
.ref { display: flex; gap: 8px; padding: 4px 0; border-top: 1px solid #f1f5f9; }
.ref-num { font-weight: 700; color: #475569; }
.ref-title { font-weight: 600; }
.ref-meta { color: #475569; font-size: 9.5pt; }
.ref-ids { color: #64748b; font-size: 9pt; }
.disclaimer {
  margin-top: 18px;
  padding: 10px 12px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  font-size: 9.5pt;
  color: #92400e;
  border-radius: 4px;
}
footer.report-foot {
  margin-top: 16px;
  padding-top: 8px;
  border-top: 1px solid #e2e8f0;
  color: #64748b;
  font-size: 8.5pt;
  display: flex;
  justify-content: space-between;
}
.callout {
  padding: 8px 10px;
  background: #f1f5f9;
  border-left: 3px solid #0f172a;
  margin: 6px 0;
}
.confidence-overall {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 9.5pt;
  font-weight: 600;
  background: #e2e8f0;
}
.confidence-overall.low { background: #fecaca; color: #7f1d1d; }
.confidence-overall.moderate { background: #fef3c7; color: #92400e; }
.confidence-overall.high { background: #bbf7d0; color: #14532d; }
.source-pill {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 8.5pt;
  background: #e0e7ff;
  color: #3730a3;
}
.source-pill.fallback { background: #fee2e2; color: #991b1b; }
.charts-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;
  margin: 6px 0 4px 0; }
.chart-item { display: flex; flex-direction: column; gap: 2px;
  border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px;
  background: #fafafa; }
.chart-label { font-size: 8.5pt; color: #475569; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; }
.conf-bar { display: inline-flex; align-items: center; }
"""


def render_decision_support_html(
    *,
    analyzer_type: str,
    analysis_id: str,
    title: str,
    patient_id: str,
    data: dict[str, Any],
    literature_refs: list[dict[str, Any]],
    metadata: Optional[dict[str, Any]] = None,
    source: str = "llm",
    prompt_hash: str = "",
    generated_at: str = "",
    clinic_label: str = "—",
    clinician_label: str = "—",
    charts: Optional[list[dict[str, Any]]] = None,
) -> str:
    """Render a clinical decision-support narrative as a print-ready HTML page."""
    metadata = metadata or {}
    findings = data.get("key_findings") or []
    summary = data.get("executive_summary") or ""
    significance = data.get("clinical_significance") or ""
    differentials = data.get("differential_considerations") or []
    followup = data.get("recommended_followup") or []
    decision_notes = data.get("decision_support_notes") or ""
    limitations = data.get("limitations") or []
    confidence_overall = (data.get("confidence_overall") or "moderate").lower()

    short_pid = patient_id[:8] if patient_id else "—"
    short_aid = analysis_id[:12] if analysis_id else "—"
    source_class = "fallback" if source != "llm" else ""

    return f"""<!DOCTYPE html>
<html lang='en'>
<head>
<meta charset='utf-8' />
<title>{_esc(title)} — {_esc(short_aid)}</title>
<style>{_BASE_CSS}</style>
</head>
<body>
<header class='report-head'>
  <div class='brand'>DeepSynaps Protocol Studio · Clinical Decision Support</div>
  <h1>{_esc(title)}</h1>
  <div class='subtitle'>
    <span class='source-pill {source_class}'>SOURCE: {_esc(source.upper())}</span>
    <span class='confidence-overall {_esc(confidence_overall)}'>
      Overall confidence: {_esc(confidence_overall.upper())}
    </span>
  </div>
</header>

<section>
  <h2>Report metadata</h2>
  <div class='meta-grid'>
    <div><b>Analyzer:</b> {_esc(analyzer_type)}</div>
    <div><b>Analysis ID:</b> {_esc(short_aid)}</div>
    <div><b>Patient ID:</b> {_esc(short_pid)}</div>
    <div><b>Clinic:</b> {_esc(clinic_label)}</div>
    <div><b>Clinician:</b> {_esc(clinician_label)}</div>
    <div><b>Generated at:</b> {_esc(generated_at)}</div>
    <div><b>Prompt hash:</b> {_esc(prompt_hash)}</div>
  </div>
  {_metadata_table(metadata)}
</section>

<section>
  <h2>Executive summary</h2>
  <div class='callout'>{_esc(summary) or '<span class="muted">Not produced.</span>'}</div>
</section>

<section>
  <h2>Key findings</h2>
  {_charts_panel_html(findings, charts or [])}
  {_findings_html(findings)}
</section>

<section>
  <h2>Clinical significance</h2>
  <p>{_esc(significance) or '<span class="muted">Not produced.</span>'}</p>
</section>

<section>
  <h2>Differential considerations</h2>
  {_bullet_list(differentials)}
</section>

<section>
  <h2>Recommended follow-up actions</h2>
  {_bullet_list(followup)}
</section>

<section>
  <h2>Decision-support notes</h2>
  <p>{_esc(decision_notes) or '<span class="muted">Not produced.</span>'}</p>
</section>

<section>
  <h2>Limitations</h2>
  {_bullet_list(limitations)}
</section>

<section>
  <h2>Literature references</h2>
  {_refs_html(literature_refs)}
</section>

<div class='disclaimer'>
  <strong>Decision-support disclaimer.</strong> This report is generated by an AI
  decision-support system to assist a licensed clinician. It is not a medical
  diagnosis, treatment recommendation, or prescription. All findings must be
  reviewed and validated by a qualified healthcare professional in the context
  of the patient's full clinical history before any clinical action is taken.
</div>

<footer class='report-foot'>
  <div>DeepSynaps Protocol Studio · {_esc(analyzer_type)} report</div>
  <div>Generated {_esc(generated_at)}</div>
</footer>
</body>
</html>"""
