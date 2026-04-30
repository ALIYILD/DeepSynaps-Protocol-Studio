// ─────────────────────────────────────────────────────────────────────────────
// qeeg-clinician-report.js — Clinician-facing Brain Map renderer
//
// Same contract source as qeeg-patient-report.js, but adds the technical
// drill-down that clinicians need: full DK 68-ROI z-score table, QC flags,
// confidence intervals, method provenance, and inline citations.
//
// Exports:
//   renderClinicianReport(report)                  → HTML string
//   mountClinicianReport(containerId, reportId, api)
// ─────────────────────────────────────────────────────────────────────────────

import {
  esc,
  fmtZ,
  fmtPct,
  zColor,
  renderBrainMapHeader,
  renderIndicatorGrid,
  renderLobeTable,
  renderBrainFunctionScoreCard,
  renderSourceMapSection,
  renderAllLobeSections,
  renderFindings,
  renderCitations,
  renderQCFlags,
  renderDisclaimer,
  emptyState,
} from './qeeg-brain-map-template.js';

function _renderDKAtlasTable(dkAtlas) {
  if (!dkAtlas || !dkAtlas.length) return '';
  var rows = (dkAtlas || []).slice().sort(function (a, b) {
    if (a.lobe !== b.lobe) return String(a.lobe).localeCompare(String(b.lobe));
    if (a.roi !== b.roi) return String(a.roi).localeCompare(String(b.roi));
    return String(a.hemisphere).localeCompare(String(b.hemisphere));
  }).map(function (r) {
    return '<tr>'
      + '<td style="padding:6px 10px;font-size:11px;color:var(--text-secondary)">' + esc(r.code || '—') + '</td>'
      + '<td style="padding:6px 10px;font-size:12px">' + esc(r.name || r.roi) + '</td>'
      + '<td style="padding:6px 10px;font-size:11px;color:var(--text-secondary)">' + esc(r.lobe) + '</td>'
      + '<td style="padding:6px 10px;font-size:11px">' + esc(r.hemisphere) + '</td>'
      + '<td style="padding:6px 10px;font-size:12px">' + esc(fmtPct(r.lt_percentile != null ? r.lt_percentile : r.rt_percentile)) + '</td>'
      + '<td style="padding:6px 10px;font-size:12px;color:' + zColor(r.z_score) + '">' + esc(fmtZ(r.z_score)) + '</td>'
      + '</tr>';
  }).join('');
  return '<section class="qeeg-dk-table ds-card ds-print" style="margin-bottom:16px">'
    + '<div class="ds-card__header"><h3 style="margin:0">DK Atlas — 68 ROI z-scores</h3></div>'
    + '<div class="ds-card__body" style="padding:0;overflow-x:auto">'
    + '<table style="width:100%;border-collapse:collapse;min-width:520px">'
    + '<thead style="background:#f8fafc;position:sticky;top:0"><tr>'
    + '<th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.4px">Code</th>'
    + '<th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.4px">Region</th>'
    + '<th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.4px">Lobe</th>'
    + '<th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.4px">Hemi</th>'
    + '<th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.4px">%ile</th>'
    + '<th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.4px">z</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + '</div></section>';
}

function _renderConfidence(confidence) {
  var c = confidence || {};
  var keys = Object.keys(c);
  if (!keys.length) return '';
  var rows = keys.map(function (k) {
    var v = c[k];
    var disp = (typeof v === 'number') ? v.toFixed(2) : esc(String(v));
    return '<dt style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.4px">' + esc(k) + '</dt>'
      + '<dd style="margin:0 0 8px;font-size:13px">' + disp + '</dd>';
  }).join('');
  return '<section class="qeeg-confidence ds-card ds-print" style="margin-bottom:16px">'
    + '<div class="ds-card__header"><h3 style="margin:0">Confidence</h3></div>'
    + '<div class="ds-card__body"><dl style="margin:0">' + rows + '</dl></div></section>';
}

function _renderMethodProvenance(provenance, methodProv) {
  var p = provenance || {};
  var m = methodProv || {};
  return '<section class="qeeg-provenance ds-card ds-print" style="margin-bottom:16px">'
    + '<div class="ds-card__header"><h3 style="margin:0">Method &amp; Provenance</h3></div>'
    + '<div class="ds-card__body" style="font-size:12px;line-height:1.6">'
    + '<div>Schema version: <strong>' + esc(p.schema_version || '?') + '</strong></div>'
    + '<div>Pipeline version: <strong>' + esc(p.pipeline_version || '?') + '</strong></div>'
    + '<div>Norm DB version: <strong>' + esc(p.norm_db_version || '?') + '</strong></div>'
    + (p.file_hash ? '<div>File hash (sha256): <code style="font-size:11px">' + esc(p.file_hash.slice(0, 16)) + '…</code></div>' : '')
    + (p.generated_at ? '<div>Generated at: ' + esc(p.generated_at) + '</div>' : '')
    + (Object.keys(m).length ? '<div style="margin-top:8px"><strong>Methods:</strong> ' + Object.keys(m).map(function (k) { return esc(k) + '=' + esc(String(m[k])); }).join(', ') + '</div>' : '')
    + '</div></section>';
}

function renderClinicianReport(report) {
  if (!report) return emptyState('No brain map report available.');
  var payload = report.report_payload || report;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
  }
  if (!payload || (!payload.indicators && !payload.dk_atlas && !payload.header)) {
    return emptyState('Brain map payload not yet available for this analysis.');
  }

  var html = '<article class="qeeg-clinician ds-print" data-variant="clinician">';
  html += renderBrainMapHeader(payload.header || {}, { variant: 'clinician' });
  html += renderIndicatorGrid(payload.indicators || {});
  html += renderSourceMapSection(payload.source_map || {});
  html += renderLobeTable(payload.lobe_summary || {});
  html += renderBrainFunctionScoreCard(payload.brain_function_score || {});
  html += renderFindings((payload.ai_narrative || {}).findings);
  html += renderAllLobeSections(payload.dk_atlas || []);
  html += _renderDKAtlasTable(payload.dk_atlas || []);
  html += _renderConfidence((payload.quality || {}).confidence || {});
  html += renderQCFlags(payload.quality || {});
  html += renderCitations((payload.ai_narrative || {}).citations || []);
  html += _renderMethodProvenance(payload.provenance || {}, (payload.quality || {}).method_provenance || {});
  html += renderDisclaimer(payload, 'clinician');
  html += '</article>';
  return html;
}

async function mountClinicianReport(containerId, reportId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner" role="status" aria-label="Loading brain map"></div>';
  try {
    var data = await api.getQEEGPatientFacingReport(reportId);
    container.innerHTML = renderClinicianReport(data);
  } catch (e) {
    container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load clinician report.</div>';
  }
}

export { renderClinicianReport, mountClinicianReport };
