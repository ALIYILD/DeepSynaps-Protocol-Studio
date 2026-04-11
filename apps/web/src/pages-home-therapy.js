/**
 * Home Therapy Tab — clinician-facing functions for pages-clinical.js
 * Called via renderHomeTherapyTab() and bindHomeTherapyActions() injected
 * into the patient detail switchPT('home-therapy') case.
 */

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
  const openEvents      = Array.isArray(eventsRes)  ? eventsRes : [];
  const activeFlags     = Array.isArray(flagsRes)   ? flagsRes  : [];
  const activeAssignment = assignments.find(a2 => a2.status === 'active');

  const sevBg = { info: 'rgba(74,158,255,0.10)', warning: 'rgba(255,181,71,0.10)', urgent: 'rgba(255,107,107,0.10)' };
  const sevBorder = { info: 'rgba(74,158,255,0.30)', warning: 'rgba(255,181,71,0.30)', urgent: 'rgba(255,107,107,0.30)' };
  const sevText = { info: 'var(--blue)', warning: 'var(--amber)', urgent: 'var(--red)' };

  const assignCard = activeAssignment
    ? `<div class="card" style="margin-bottom:16px;padding:14px 16px">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--teal);margin-bottom:3px">${activeAssignment.device_category}</div>
        <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${activeAssignment.device_name}</div>
        ${activeAssignment.device_model ? `<div style="font-size:11.5px;color:var(--text-tertiary)">${activeAssignment.device_model}</div>` : ''}
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:6px">${activeAssignment.session_frequency_per_week ? activeAssignment.session_frequency_per_week + 'x/wk' : ''} ${activeAssignment.planned_total_sessions ? '· Total: ' + activeAssignment.planned_total_sessions : ''}</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" onclick="window._htAssignDevice('${patientId}')">+ Assign New Device</button>
          <button class="btn btn-sm btn-ghost" onclick="window._htPauseAssignment('${activeAssignment.id}')">Pause</button>
          <button class="btn btn-sm btn-ghost" style="color:var(--red)" onclick="window._htRevokeAssignment('${activeAssignment.id}')">Revoke</button>
        </div>
      </div>`
    : `<div class="card" style="margin-bottom:16px;padding:16px 18px;text-align:center">
        <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:10px">No active home device assignment</div>
        <button class="btn btn-primary btn-sm" onclick="window._htAssignDevice('${patientId}')">+ Assign Home Device</button>
      </div>`;

  const flagRows = activeFlags.slice(0, 5).map(f => {
    const bg = sevBg[f.severity] || 'rgba(255,255,255,0.04)';
    const bo = sevBorder[f.severity] || 'rgba(255,255,255,0.12)';
    const tx = sevText[f.severity] || 'var(--text-tertiary)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--radius-md);background:${bg};border:1px solid ${bo};margin-bottom:6px">
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${f.flag_type.replace(/_/g, ' ')}</div>
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.detail}</div>
      </div>
      <span style="font-size:10.5px;color:${tx};flex-shrink:0">${f.severity}</span>
      <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 8px" onclick="window._htDismissFlag('${f.id}')">Dismiss</button>
    </div>`;
  }).join('');

  const pendingRows = pendingLogs.slice(0, 8).map(l => `
    <tr>
      <td style="padding:8px 12px;color:var(--text-primary)">${l.session_date}</td>
      <td style="padding:8px 12px;color:var(--text-secondary)">${l.duration_minutes ? l.duration_minutes + 'm' : '—'}</td>
      <td style="padding:8px 12px">${l.completed ? '✓' : '~'}</td>
      <td style="padding:8px 12px;color:var(--teal)">${l.tolerance_rating ? l.tolerance_rating + '/5' : '—'}</td>
      <td style="padding:8px 12px;color:var(--text-secondary);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.side_effects_during || '—'}</td>
      <td style="padding:8px 12px">
        <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 8px;margin-right:4px" onclick="window._htReviewLog('${l.id}','reviewed')">Review</button>
        <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 8px;color:var(--red)" onclick="window._htReviewLog('${l.id}','flagged')">Flag</button>
      </td>
    </tr>`).join('');

  const eventRows = openEvents.slice(0, 5).map(e => {
    const sc = { low: 'var(--green)', moderate: 'var(--amber)', high: '#f97316', urgent: 'var(--red)' }[e.severity] || 'var(--text-tertiary)';
    return `<div style="background:var(--bg-page);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-size:12.5px;font-weight:600;color:var(--text-primary);text-transform:capitalize">${e.event_type.replace(/_/g, ' ')}</span>
          ${e.severity ? `<span style="font-size:10.5px;color:${sc};padding:2px 8px;border-radius:20px;background:${sc}1a">${e.severity}</span>` : ''}
          <span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">${e.report_date}</span>
        </div>
        ${e.body ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${e.body.slice(0, 120)}${e.body.length > 120 ? '...' : ''}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" style="font-size:10.5px;padding:3px 8px;flex-shrink:0" onclick="window._htAckEvent('${e.id}')">Acknowledge</button>
    </div>`;
  }).join('');

  return `<div style="padding:16px">
    ${assignCard}
    ${activeFlags.length > 0 ? `<div class="card" style="margin-bottom:16px;padding:14px 16px">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-tertiary);margin-bottom:10px">
        Active Flags <span style="color:var(--red);margin-left:6px">${activeFlags.length}</span>
      </div>${flagRows}</div>` : ''}
    ${pendingLogs.length > 0
      ? `<div class="card" style="margin-bottom:16px;padding:0;overflow:hidden">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-tertiary)">
              Session Review Queue <span style="color:var(--amber)">(${pendingLogs.length})</span>
            </span>
            ${activeAssignment ? `<button class="btn btn-ghost btn-sm" onclick="window._htGenerateAISummary('${activeAssignment.id}')">AI Summary</button>` : ''}
          </div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
            <thead><tr style="border-bottom:1px solid var(--border)">
              ${['Date', 'Duration', 'Done', 'Tol.', 'Side effects', 'Actions'].map(h => `<th style="padding:8px 12px;text-align:left;font-weight:600;color:var(--text-tertiary)">${h}</th>`).join('')}
            </tr></thead>
            <tbody>${pendingRows}</tbody>
          </table></div>
        </div>`
      : `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:16px;font-size:12.5px;color:var(--text-tertiary)">No session logs pending review.</div>`}
    ${openEvents.length > 0 ? `<div class="card" style="margin-bottom:16px;padding:14px 16px">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.7px;color:var(--text-tertiary);margin-bottom:10px">
        Open Reports <span style="color:var(--amber);margin-left:6px">${openEvents.length}</span>
      </div>${eventRows}</div>` : ''}
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
    if (area) area.innerHTML = '<div style="padding:14px;text-align:center;color:var(--text-tertiary);font-size:13px">Generating AI summary...</div>';
    try {
      const result = await a.generateHomeTherapySummary(assignmentId);
      if (area) {
        area.innerHTML = `<div class="card" style="padding:14px 16px">
          <div style="font-size:11.5px;font-weight:600;color:var(--text-tertiary);margin-bottom:8px">
            AI Home Therapy Summary
            <span style="color:var(--amber);font-weight:400;margin-left:8px">logged for audit</span>
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;white-space:pre-wrap">${result.summary || 'No summary available.'}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Model: ${result.model} · Sessions reviewed: ${result.sessions_reviewed}</div>
          <div style="font-size:11px;color:var(--amber);margin-top:4px">${result.warning || ''}</div>
        </div>`;
      }
    } catch (_e) {
      if (area) {
        const msg = _e?.message?.includes('review_required')
          ? 'At least one session must be reviewed before generating an AI summary.'
          : 'Could not generate AI summary.';
        area.innerHTML = `<div style="padding:12px;color:var(--red);font-size:12.5px">${msg}</div>`;
      }
    } finally { _htAiInProgress = false; }
  };
}
