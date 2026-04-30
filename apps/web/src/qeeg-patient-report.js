// ─────────────────────────────────────────────────────────────────────────────
// qeeg-patient-report.js — Patient-facing Brain Map renderer
//
// Composes the QEEGBrainMapReport contract from Phase 0 into a lay-language
// report layout that mirrors the iSyncBrain summary report (cover indicators,
// source map, lobe table, brain function score, per-region drill-down).
//
// Exports:
//   renderPatientReport(report)                → HTML string
//   mountPatientReport(containerId, reportId, api)
//
// Backwards-compat: also accepts the legacy {content: {...}} shape from the
// old patient_facing_report_json so existing call sites keep rendering until
// the backend switches to QEEGBrainMapReport.
// ─────────────────────────────────────────────────────────────────────────────

import {
  esc,
  renderBrainMapHeader,
  renderIndicatorGrid,
  renderLobeTable,
  renderBrainFunctionScoreCard,
  renderSourceMapSection,
  renderAllLobeSections,
  renderFindings,
  renderQCFlags,
  renderDisclaimer,
  emptyState,
} from './qeeg-brain-map-template.js';

function _isLegacyShape(report) {
  return report && report.content && !report.dk_atlas && !report.indicators;
}

function _renderLegacy(report) {
  var content = report.content || {};
  var html = '';
  if (content.executive_summary) {
    html += '<h4 style="margin:0 0 8px;font-size:14px">Summary</h4>'
      + '<p style="font-size:13px;line-height:1.5">' + esc(content.executive_summary) + '</p>';
  }
  if (content.findings && content.findings.length) {
    html += '<h4 style="margin:12px 0 8px;font-size:14px">What we observed</h4><ul style="margin:0 0 0 16px;font-size:13px;line-height:1.5">';
    content.findings.forEach(function (f) {
      html += '<li>' + esc(f.description || f) + '</li>';
    });
    html += '</ul>';
  }
  if (content.protocol_recommendations && content.protocol_recommendations.length) {
    html += '<h4 style="margin:12px 0 8px;font-size:14px">Suggested next steps</h4><ul style="margin:0 0 0 16px;font-size:13px;line-height:1.5">';
    content.protocol_recommendations.forEach(function (p) {
      html += '<li>' + esc(typeof p === 'string' ? p : (p.name || p.description || JSON.stringify(p))) + '</li>';
    });
    html += '</ul>';
  }
  // Backwards-compat: old tests expect the legacy disclaimer text
  var disclaimer = report.disclaimer || content.disclaimer
    || 'This report is for informational purposes only and does not constitute a medical diagnosis. Please discuss these results with your clinician.';
  html += '<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;font-size:12px;color:var(--text-secondary)">'
    + esc(disclaimer) + '</div>';
  return '<div class="ds-card qeeg-ai-card"><div class="ds-card__header"><h3>Patient Report</h3></div>'
    + '<div class="ds-card__body">' + html + '</div></div>';
}

function renderPatientReport(report) {
  if (!report) return emptyState('No brain map yet. Your clinician will share results here once your QEEG is analyzed.');
  // Backwards-compat: old tests pass { disclaimer: '...' } with no content
  if (report.disclaimer && !report.content && !report.dk_atlas && !report.indicators) {
    return '<div class="ds-card qeeg-ai-card">'
      + '<div class="ds-card__header"><h3>Patient Report</h3></div>'
      + '<div class="ds-card__body">'
      + '<p style="color:var(--text-secondary);font-size:13px">' + esc(report.disclaimer) + '</p>'
      + '</div></div>';
  }
  if (_isLegacyShape(report)) return _renderLegacy(report);

  var payload = report.report_payload || report;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
  }
  if (!payload || (!payload.indicators && !payload.dk_atlas && !payload.header)) {
    return emptyState('Brain map is being generated. Refresh this page in a few minutes.');
  }

  var html = '<article class="qeeg-cover ds-print" data-variant="patient">';
  html += renderBrainMapHeader(payload.header || {}, { variant: 'patient' });
  html += renderIndicatorGrid(payload.indicators || {});
  html += renderSourceMapSection(payload.source_map || {});
  html += renderLobeTable(payload.lobe_summary || {});
  html += renderBrainFunctionScoreCard(payload.brain_function_score || {});
  if (payload.ai_narrative && payload.ai_narrative.executive_summary) {
    html += '<section class="qeeg-summary ds-card ds-print" style="margin-bottom:16px">'
      + '<div class="ds-card__header"><h3 style="margin:0">Summary</h3></div>'
      + '<div class="ds-card__body"><p style="margin:0;font-size:13px;line-height:1.6">' + esc(payload.ai_narrative.executive_summary) + '</p></div></section>';
  }
  html += renderFindings((payload.ai_narrative || {}).findings);
  html += renderAllLobeSections(payload.dk_atlas || []);
  html += renderQCFlags(payload.quality || {});
  html += renderDisclaimer(payload, 'patient');
  html += '</article>';
  return html;
}

async function mountPatientReport(containerId, reportId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner" role="status" aria-label="Loading brain map"></div>';
  try {
    var data = await api.getQEEGPatientFacingReport(reportId);
    container.innerHTML = renderPatientReport(data);
  } catch (e) {
    container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load patient report.</div>';
  }
}

export { renderPatientReport, mountPatientReport };
