// ─────────────────────────────────────────────────────────────────────────────
// qeeg-timeline.js — Longitudinal qEEG / DeepTwin Timeline
//
// Exports:
//   renderTimeline(events)           → HTML string
//   mountTimeline(containerId, patientId, api)
// ─────────────────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _pill(label, color) {
  return '<span class="qeeg-ai-chip" style="--chip-color:' + (color || 'var(--teal)') + '">' + esc(label) + '</span>';
}

function _statusColor(status) {
  if (status === 'improved') return '#22c55e';
  if (status === 'worsened') return '#ef4444';
  if (status === 'unchanged') return '#6b7280';
  return '#f59e0b';
}

function _statusIcon(status) {
  if (status === 'improved') return '↑';
  if (status === 'worsened') return '↓';
  if (status === 'unchanged') return '→';
  return '?';
}

function renderTimeline(events) {
  if (!events || !events.length) {
    return '<div class="ds-card qeeg-ai-card">'
      + '<div class="ds-card__header"><h3>Timeline</h3></div>'
      + '<div class="ds-card__body">'
      + '<p style="color:var(--text-secondary);font-size:13px">No timeline events yet.</p>'
      + '</div></div>';
  }

  var rows = events.map(function (e) {
    var rci = e.rci != null ? '<span style="font-size:11px;color:var(--text-secondary)">RCI ' + Number(e.rci).toFixed(2) + '</span>' : '';
    var confs = (e.confounders || []).length
      ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Confounders: ' + e.confounders.map(esc).join(', ') + '</div>'
      : '';
    return '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #e5e7eb">'
      + '<div style="min-width:80px;text-align:right;font-size:12px;color:var(--text-secondary)">' + esc(e.date) + '</div>'
      + '<div style="flex:1">'
      + '<div style="display:flex;gap:8px;align-items:center">'
      + '<strong style="font-size:13px">' + esc(e.title) + '</strong>'
      + _pill(_statusIcon(e.status) + ' ' + esc(e.status), _statusColor(e.status))
      + '</div>'
      + '<p style="margin:4px 0 0;font-size:12px;color:var(--text-secondary)">' + esc(e.summary) + '</p>'
      + rci
      + confs
      + '</div></div>';
  }).join('');

  return '<div class="ds-card qeeg-ai-card">'
    + '<div class="ds-card__header"><h3>Timeline</h3></div>'
    + '<div class="ds-card__body">' + rows
    + '<p style="margin-top:12px;font-size:11px;color:var(--text-secondary)">This is decision-support information. Timeline interpretations require clinician review.</p>'
    + '</div></div>';
}

async function mountTimeline(containerId, patientId, api) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '<div class="ds-spinner"></div>';
  try {
    var data = await api.getQEEGPatientTimeline(patientId);
    container.innerHTML = renderTimeline(data);
  } catch (e) {
    container.innerHTML = '<div class="ds-alert ds-alert--error">Unable to load timeline.</div>';
  }
}

export { renderTimeline, mountTimeline };
