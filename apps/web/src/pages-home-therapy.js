/**
 * Home Therapy Tab — clinician-facing functions for pages-clinical.js
 * Called via renderHomeTherapyTab() and bindHomeTherapyActions() injected
 * into the patient detail switchPT('home-therapy') case.
 */

const SEV_COLORS = {
  info:     'var(--blue)',
  warning:  'var(--amber)',
  urgent:   'var(--red)',
  low:      'var(--green)',
  moderate: 'var(--amber)',
  high:     '#f97316',
};

export async function renderHomeTherapyTab(patientId, apiObj) {
  const a = apiObj;
  const [assignRes, logsRes, eventsRes, flagsRes] = await Promise.all([
    a.listHomeAssignments({ patient_id: patientId }).catch(() => []),
    a.listHomeSessionLogs({ patient_id: patientId, status: 'pending_review' }).catch(() => []),
    a.listHomeAdherenceEvents({ patient_id: patientId, status: 'open' }).catch(() => []),
    a.listHomeReviewFlags({ patient_id: patientId, dismissed: false }).catch(() => []),
  ]);
  const assignments     = Array.isArray(assignRes) ? assignRes : [];
  const pendingLogs     = Array.isArray(logsRes)   ? logsRes   : [];
  const openEvents      = Array.isArray(eventsRes) ? eventsRes : [];
  const activeFlags     = Array.isArray(flagsRes)  ? flagsRes  : [];
  const activeAssignment = assignments.find(a2 => a2.status === 'active');

  // ── KPI strip ──
  const totalSessions = activeAssignment?.planned_total_sessions || 0;
  const completedLogs = pendingLogs.filter(l => l.completed).length;
  const kpiStrip = `
    <div class="ht-kpi-strip">
      <div class="ht-kpi" style="--kpi-color:var(--teal)">
        <div class="ht-kpi-val">${assignments.filter(a2 => a2.status === 'active').length}</div>
        <div class="ht-kpi-label">Active Devices</div>
      </div>
      <div class="ht-kpi" style="--kpi-color:var(--amber)">
        <div class="ht-kpi-val">${pendingLogs.length}</div>
        <div class="ht-kpi-label">Pending Review</div>
      </div>
      <div class="ht-kpi" style="--kpi-color:var(--red)">
        <div class="ht-kpi-val">${activeFlags.length}</div>
        <div class="ht-kpi-label">Active Flags</div>
      </div>
      <div class="ht-kpi" style="--kpi-color:var(--blue)">
        <div class="ht-kpi-val">${openEvents.length}</div>
        <div class="ht-kpi-label">Open Reports</div>
      </div>
    </div>`;

  // ── Device assignment card ──
  const deviceCard = activeAssignment
    ? `<div class="ht-device-card">
        <div class="ht-device-header">
          <span class="ht-device-header-title">Active Device Assignment</span>
          <span class="ch-assess-pill ch-pill--done">Active</span>
        </div>
        <div class="ht-device-body">
          <div class="ht-device-category">${activeAssignment.device_category}</div>
          <div class="ht-device-name">${activeAssignment.device_name}</div>
          ${activeAssignment.device_model ? `<div class="ht-device-model">${activeAssignment.device_model}</div>` : ''}
          <div class="ht-device-schedule">
            ${activeAssignment.session_frequency_per_week ? `<span>${activeAssignment.session_frequency_per_week}x / week</span>` : ''}
            ${activeAssignment.session_frequency_per_week && totalSessions ? '<span style="opacity:0.4">·</span>' : ''}
            ${totalSessions ? `<span>Total: ${totalSessions} sessions</span>` : ''}
          </div>
          <div class="ht-device-actions">
            <button class="btn btn-primary btn-sm" onclick="window._htAssignDevice('${patientId}')">+ Assign New Device</button>
            <button class="btn btn-ghost btn-sm" onclick="window._htPauseAssignment('${activeAssignment.id}')">Pause</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="window._htRevokeAssignment('${activeAssignment.id}')">Revoke</button>
          </div>
        </div>
      </div>`
    : `<div class="ht-device-card">
        <div class="ht-device-header">
          <span class="ht-device-header-title">Device Assignment</span>
        </div>
        <div class="ht-device-empty">
          <div class="ht-device-empty-text">No active home device assignment</div>
          <button class="btn btn-primary btn-sm" onclick="window._htAssignDevice('${patientId}')">+ Assign Home Device</button>
        </div>
      </div>`;

  // ── Active flags card ──
  const flagsCard = activeFlags.length > 0 ? `
    <div class="ht-section">
      <div class="ht-section-hd">
        <span class="ht-section-title">Active Flags <span class="ht-section-count ht-count--red">${activeFlags.length}</span></span>
      </div>
      <div class="ht-section-body">
        ${activeFlags.slice(0, 5).map(f => {
          const sevClass = f.severity === 'urgent' ? 'ht-sev--urgent' : f.severity === 'warning' ? 'ht-sev--warning' : 'ht-sev--info';
          const dotColor = SEV_COLORS[f.severity] || 'var(--amber)';
          return `<div class="ht-flag-row">
            <div class="ht-flag-indicator" style="--flag-color:${dotColor}"></div>
            <div class="ht-flag-info">
              <div class="ht-flag-type">${f.flag_type.replace(/_/g, ' ')}</div>
              <div class="ht-flag-detail">${f.detail}</div>
            </div>
            <span class="ht-flag-severity ${sevClass}">${f.severity}</span>
            <button class="btn btn-ghost btn-sm" onclick="window._htDismissFlag('${f.id}')">Dismiss</button>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  // ── Session review queue ──
  const sessionQueue = pendingLogs.length > 0 ? `
    <div class="ht-section">
      <div class="ht-section-hd">
        <span class="ht-section-title">Session Review Queue <span class="ht-section-count ht-count--amber">${pendingLogs.length}</span></span>
        ${activeAssignment ? `<button class="btn btn-ghost btn-sm" onclick="window._htGenerateAISummary('${activeAssignment.id}')">AI Summary</button>` : ''}
      </div>
      <div class="ht-section-body" style="overflow-x:auto">
        <table class="ht-table">
          <thead><tr>
            <th>Date</th><th>Duration</th><th>Done</th><th>Tolerance</th><th>Side Effects</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${pendingLogs.slice(0, 8).map(l => `<tr>
              <td class="ht-cell-primary">${l.session_date}</td>
              <td>${l.duration_minutes ? l.duration_minutes + ' min' : '—'}</td>
              <td class="${l.completed ? 'ht-cell-check' : 'ht-cell-partial'}">${l.completed ? '✓ Yes' : '~ Partial'}</td>
              <td class="ht-cell-teal">${l.tolerance_rating ? l.tolerance_rating + '/5' : '—'}</td>
              <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.side_effects_during || '—'}</td>
              <td>
                <div class="ht-cell-actions">
                  <button class="btn btn-ghost btn-sm" onclick="window._htReviewLog('${l.id}','reviewed')">Review</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="window._htReviewLog('${l.id}','flagged')">Flag</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : `
    <div class="ht-section">
      <div class="ht-section-hd">
        <span class="ht-section-title">Session Review Queue</span>
      </div>
      <div class="ht-empty">No session logs pending review.</div>
    </div>`;

  // ── Open reports/events ──
  const eventsCard = openEvents.length > 0 ? `
    <div class="ht-section">
      <div class="ht-section-hd">
        <span class="ht-section-title">Open Reports <span class="ht-section-count ht-count--amber">${openEvents.length}</span></span>
      </div>
      <div class="ht-section-body">
        ${openEvents.slice(0, 5).map(e => {
          const sc = SEV_COLORS[e.severity] || 'var(--text-tertiary)';
          const sevClass = e.severity === 'urgent' ? 'ht-sev--urgent' : e.severity === 'high' ? 'ht-sev--warning' : 'ht-sev--info';
          return `<div class="ht-event-row">
            <div class="ht-event-info">
              <div class="ht-event-top">
                <span class="ht-event-type">${e.event_type.replace(/_/g, ' ')}</span>
                ${e.severity ? `<span class="ht-flag-severity ${sevClass}">${e.severity}</span>` : ''}
                <span class="ht-event-date">${e.report_date}</span>
              </div>
              ${e.body ? `<div class="ht-event-body">${e.body.slice(0, 140)}${e.body.length > 140 ? '…' : ''}</div>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" style="flex-shrink:0" onclick="window._htAckEvent('${e.id}')">Acknowledge</button>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  return `<div class="ht-wrap">
    ${kpiStrip}
    ${deviceCard}
    ${flagsCard}
    ${sessionQueue}
    ${eventsCard}
    <div id="ht-ai-summary-area"></div>
  </div>`;
}

export function bindHomeTherapyActions(patientId, apiObj) {
  const a = apiObj;

  window._htAssignDevice = async function(pid) {
    const name = prompt('Device name (e.g. Fisher Wallace Stimulator):');
    if (!name) return;
    const category = prompt('Category (tDCS / tACS / TMS / CES / tPBM / PEMF / other):', 'other');
    const freq  = parseInt(prompt('Sessions per week (0 to skip):') || '0') || null;
    const total = parseInt(prompt('Total planned sessions (0 to skip):') || '0') || null;
    const instructions = prompt('Patient instructions (leave blank to skip):') || null;
    try {
      await a.assignHomeDevice({
        patient_id: pid, device_name: name,
        device_category: category || 'other',
        session_frequency_per_week: freq, planned_total_sessions: total,
        instructions_text: instructions, parameters: {},
      });
      window.switchPT('home-therapy');
    } catch (_e) { alert('Could not assign device: ' + (_e?.message || 'error')); }
  };

  window._htPauseAssignment = async function(id) {
    if (!confirm('Pause this home device assignment?')) return;
    try { await a.updateHomeAssignment(id, { status: 'paused' }); window.switchPT('home-therapy'); }
    catch (_e) { alert('Could not pause: ' + (_e?.message || '')); }
  };

  window._htRevokeAssignment = async function(id) {
    const reason = prompt('Reason for revoking (required):');
    if (!reason) return;
    try { await a.updateHomeAssignment(id, { status: 'revoked', revoke_reason: reason }); window.switchPT('home-therapy'); }
    catch (_e) { alert('Could not revoke: ' + (_e?.message || '')); }
  };

  window._htReviewLog = async function(logId, status) {
    const note = status === 'flagged' ? (prompt('Flag note (describe the concern):') || null) : null;
    try { await a.reviewHomeSessionLog(logId, { status, review_note: note }); window.switchPT('home-therapy'); }
    catch (_e) { alert('Could not update log: ' + (_e?.message || '')); }
  };

  window._htAckEvent = async function(eventId) {
    const note = prompt('Acknowledgment note (optional):') || null;
    try { await a.acknowledgeAdherenceEvent(eventId, { status: 'acknowledged', resolution_note: note }); window.switchPT('home-therapy'); }
    catch (_e) { alert('Could not acknowledge: ' + (_e?.message || '')); }
  };

  window._htDismissFlag = async function(flagId) {
    const resolution = prompt('Resolution note (optional):') || null;
    try { await a.dismissHomeReviewFlag(flagId, { resolution }); window.switchPT('home-therapy'); }
    catch (_e) { alert('Could not dismiss flag: ' + (_e?.message || '')); }
  };

  let _htAiInProgress = false;
  window._htGenerateAISummary = async function(assignmentId) {
    if (_htAiInProgress) return;
    _htAiInProgress = true;
    const area = document.getElementById('ht-ai-summary-area');
    if (area) area.innerHTML = '<div class="ht-empty">Generating AI summary…</div>';
    try {
      const result = await a.generateHomeTherapySummary(assignmentId);
      if (area) {
        area.innerHTML = `<div class="ht-ai-card">
          <div class="ht-ai-header">
            <span class="ht-ai-title">AI Home Therapy Summary</span>
            <span class="ht-ai-audit">logged for audit</span>
          </div>
          <div class="ht-ai-body">${result.summary || 'No summary available.'}</div>
          <div class="ht-ai-meta">Model: ${result.model} · Sessions reviewed: ${result.sessions_reviewed}</div>
          ${result.warning ? `<div class="ht-ai-warning">${result.warning}</div>` : ''}
        </div>`;
      }
    } catch (_e) {
      if (area) {
        const msg = _e?.message?.includes('review_required')
          ? 'At least one session must be reviewed before generating an AI summary.'
          : 'Could not generate AI summary.';
        area.innerHTML = `<div class="ht-section"><div class="ht-empty" style="color:var(--red)">${msg}</div></div>`;
      }
    } finally { _htAiInProgress = false; }
  };
}
