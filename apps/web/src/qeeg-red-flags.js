// ─────────────────────────────────────────────────────────────────────────────
// qeeg-red-flags.js — Red Flag Detector panel
//
// Exports:
//   renderRedFlags(flags)          → HTML string
//   mountRedFlags(containerId, analysisId, api)
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _pill(label, color) {
  return '<span class="qeeg-ai-chip" style="--chip-color:' + (color || 'var(--teal)') + '">' + esc(label) + '</span>';
}

function _sevColor(sev) {
  if (sev === 'HIGH') return '#ef4444';
  if (sev === 'MEDIUM') return '#f59e0b';
  return '#6b7280';
}

function renderRedFlags(flags) {
  if (!flags || !flags.flags) return '';
  var items = flags.flags || [];
  var count = flags.flag_count || 0;
  var high = flags.high_severity_count || 0;
  var disclaimer = flags.disclaimer || '';

  var summary = '<div style="display:flex;gap:12px;margin-bottom:12px">'
    + '<div style="flex:1;text-align:center;padding:12px;background:#f8fafc;border-radius:8px">'
    + '<div style="font-size:20px;font-weight:700">' + count + '</div><div style="font-size:11px;color:var(--text-secondary)">Total Flags</div></div>'
    + '<div style="flex:1;text-align:center;padding:12px;background:#fef2f2;border-radius:8px">'
    + '<div style="font-size:20px;font-weight:700;color:#ef4444">' + high + '</div><div style="font-size:11px;color:var(--text-secondary)">High Severity</div></div>'
    + '</div>';

  var rows = items.map(function (f) {
    return '<tr>'
      + '<td>' + _pill(esc(f.severity), _sevColor(f.severity)) + '</td>'
      + '<td>' + esc(f.category) + '</td>'
      + '<td>' + esc(f.message) + '</td>'
      + '<td>' + esc((f.recommendation || '—')) + '</td>'
      + '</tr>';
  }).join('');

  var table = items.length
    ? '<table class="ds-table" style="width:100%;font-size:13px">'
      + '<thead><tr><th>Severity</th><th>Category</th><th>Message</th><th>Recommendation</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table>'
    : '<p style="color:var(--text-secondary);font-size:13px">No red flags.</p>';

  return '<div class="ds-card qeeg-ai-card">'
    + '<div class="ds-card__header"><h3>Red Flag Detector</h3></div>'
    + '<div class="ds-card__body">'
    + summary
    + table
    + (disclaimer ? '<p style="margin-top:12px;font-size:11px;color:var(--text-secondary)">' + esc(disclaimer) + '</p>' : '')
    + '</div></div>';
}

async function mountRedFlags(containerId, analysisId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner"></div>';
  try {
    var data = await api.getQEEGRedFlags(analysisId);
    container.innerHTML = renderRedFlags(data);
  } catch (e) {
    container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load red flags.</div>';
  }
}

export { renderRedFlags, mountRedFlags };
