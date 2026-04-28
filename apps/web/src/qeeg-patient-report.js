// ─────────────────────────────────────────────────────────────────────────────
// qeeg-patient-report.js — Patient-Facing Report renderer
//
// Exports:
//   renderPatientReport(report)      → HTML string
//   mountPatientReport(containerId, reportId, api)
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPatientReport(report) {
  if (!report || !report.content) {
    return '<div class="ds-card qeeg-ai-card">'
      + '<div class="ds-card__header"><h3>Patient Report</h3></div>'
      + '<div class="ds-card__body">'
      + '<p style="color:var(--text-secondary);font-size:13px">' + esc(report?.disclaimer || 'Patient-facing report not yet generated.') + '</p>'
      + '</div></div>';
  }

  var content = report.content;
  var html = '';

  if (content.executive_summary) {
    html += '<h4 style="margin:0 0 8px;font-size:14px">Summary</h4>'
      + '<p style="font-size:13px;line-height:1.5">' + esc(content.executive_summary) + '</p>';
  }

  if (content.findings && content.findings.length) {
    html += '<h4 style="margin:12px 0 8px;font-size:14px">What We Observed</h4><ul style="margin:0 0 0 16px;font-size:13px;line-height:1.5">';
    content.findings.forEach(function (f) {
      html += '<li>' + esc(f.description || f) + '</li>';
    });
    html += '</ul>';
  }

  if (content.protocol_recommendations && content.protocol_recommendations.length) {
    html += '<h4 style="margin:12px 0 8px;font-size:14px">Suggested Next Steps</h4><ul style="margin:0 0 0 16px;font-size:13px;line-height:1.5">';
    content.protocol_recommendations.forEach(function (p) {
      html += '<li>' + esc(typeof p === 'string' ? p : (p.name || p.description || JSON.stringify(p))) + '</li>';
    });
    html += '</ul>';
  }

  var disclaimer = report.disclaimer || content.disclaimer
    || 'This report is for informational purposes only and does not constitute a medical diagnosis. Please discuss these results with your clinician.';

  html += '<div style="margin-top:16px;padding:12px;background:#f8fafc;border-radius:8px;font-size:12px;color:var(--text-secondary)">'
    + esc(disclaimer) + '</div>';

  return '<div class="ds-card qeeg-ai-card">'
    + '<div class="ds-card__header"><h3>Patient Report</h3></div>'
    + '<div class="ds-card__body">' + html + '</div></div>';
}

async function mountPatientReport(containerId, reportId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner"></div>';
  try {
    var data = await api.getQEEGPatientFacingReport(reportId);
    container.innerHTML = renderPatientReport(data);
  } catch (e) {
    container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load patient report.</div>';
  }
}

export { renderPatientReport, mountPatientReport };
