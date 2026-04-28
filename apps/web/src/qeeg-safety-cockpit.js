// ─────────────────────────────────────────────────────────────────────────────
// qeeg-safety-cockpit.js — Clinical Safety Cockpit widget
//
// Renders the safety-cockpit quality gate for a qEEG analysis.
// Exports:
//   renderSafetyCockpit(cockpit)  → HTML string
//   mountSafetyCockpit(containerId, analysisId, api)
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _pill(label, color) {
  return '<span class="qeeg-ai-chip" style="--chip-color:' + (color || 'var(--teal)') + '">' + esc(label) + '</span>';
}

function _statusColor(status) {
  if (status === 'VALID_FOR_REVIEW') return '#22c55e';
  if (status === 'LIMITED_QUALITY') return '#f59e0b';
  if (status === 'REPEAT_RECOMMENDED') return '#ef4444';
  return '#6b7280';
}

function _checkIcon(passed) {
  return passed
    ? '<span style="color:#22c55e;font-weight:700">✓</span>'
    : '<span style="color:#ef4444;font-weight:700">✗</span>';
}

function renderSafetyCockpit(cockpit) {
  if (!cockpit || !cockpit.checks) return '';
  var checks = cockpit.checks || [];
  var redFlags = cockpit.red_flags || [];
  var status = cockpit.overall_status || 'UNKNOWN';
  var disclaimer = cockpit.disclaimer || '';

  var rows = checks.map(function (c) {
    return '<tr>'
      + '<td>' + _checkIcon(c.passed) + '</td>'
      + '<td>' + esc(c.name) + '</td>'
      + '<td>' + esc(c.value) + '</td>'
      + '<td>' + esc(c.threshold || '—') + '</td>'
      + '<td>' + (c.passed ? _pill('Pass', '#22c55e') : _pill('Fail', '#ef4444')) + '</td>'
      + '</tr>';
  }).join('');

  var flagRows = redFlags.map(function (f) {
    var sevColor = f.severity === 'HIGH' ? '#ef4444' : (f.severity === 'MEDIUM' ? '#f59e0b' : '#6b7280');
    return '<tr>'
      + '<td>' + _pill(esc(f.severity), sevColor) + '</td>'
      + '<td>' + esc(f.category) + '</td>'
      + '<td>' + esc(f.message) + '</td>'
      + '</tr>';
  }).join('');

  var statusBanner = '<div style="padding:12px 16px;border-radius:8px;margin-bottom:12px;background:' + _statusColor(status) + '15;border-left:4px solid ' + _statusColor(status) + '">'
    + '<strong style="color:' + _statusColor(status) + '">' + esc(status.replace(/_/g, ' ')) + '</strong>'
    + (disclaimer ? '<p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary)">' + esc(disclaimer) + '</p>' : '')
    + '</div>';

  var checksTable = '<table class="ds-table" style="width:100%;font-size:13px">'
    + '<thead><tr><th></th><th>Check</th><th>Value</th><th>Threshold</th><th>Result</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>';

  var flagsTable = redFlags.length
    ? '<h4 style="margin:16px 0 8px">Red Flags</h4>'
      + '<table class="ds-table" style="width:100%;font-size:13px">'
      + '<thead><tr><th>Severity</th><th>Category</th><th>Message</th></tr></thead>'
      + '<tbody>' + flagRows + '</tbody></table>'
    : '<p style="color:var(--text-secondary);font-size:13px">No red flags detected.</p>';

  return '<div class="ds-card qeeg-ai-card">'
    + '<div class="ds-card__header"><h3>Clinical Safety Cockpit</h3></div>'
    + '<div class="ds-card__body">'
    + statusBanner
    + checksTable
    + flagsTable
    + '</div></div>';
}

async function mountSafetyCockpit(containerId, analysisId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner"></div>';
  try {
    var cockpit = await api.getQEEGSafetyCockpit(analysisId);
    container.innerHTML = renderSafetyCockpit(cockpit);
  } catch (e) {
    container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load safety cockpit.</div>';
  }
}

export { renderSafetyCockpit, mountSafetyCockpit };
