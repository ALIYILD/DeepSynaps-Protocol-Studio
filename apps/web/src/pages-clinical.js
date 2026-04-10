import { api, downloadBlob } from './api.js';
import { cardWrap, fr, evBar, pillSt, initials, tag, spinner, emptyState, spark, brainMapSVG, evidenceBadge, labelBadge, approvalBadge, safetyBadge, govFlag } from './helpers.js';
import { currentUser } from './auth.js';
import { FALLBACK_CONDITIONS, FALLBACK_MODALITIES, FALLBACK_ASSESSMENT_TEMPLATES, COURSE_STATUS_COLORS } from './constants.js';

// ── Shared state for patient profile ────────────────────────────────────────
export let ptab = 'courses';
export let eegBand = 'alpha';
export let proStep = 0;
export let selMods = ['tDCS'];
export let proType = 'evidence';
export let selPatIdx = null;
export let aiResult = null;
export let aiLoading = false;
export let savedProto = null;
export let selectedPatient = null;

export function setPtab(v) { ptab = v; }
export function setEegBand(v) { eegBand = v; }
export function setProStep(v) { proStep = v; }
export function setSelMods(v) { selMods = v; }
export function setProType(v) { proType = v; }
export function setSelPatIdx(v) { selPatIdx = v; }
export function setAiResult(v) { aiResult = v; }
export function setAiLoading(v) { aiLoading = v; }
export function setSavedProto(v) { savedProto = v; }
export function setSelectedPatient(v) { selectedPatient = v; }

// ── Dashboard local helpers ──────────────────────────────────────────────────

function _dStatCard(label, value, sub, color, navId, alert = false) {
  const leftBorder = alert ? `border-left:3px solid ${color};padding-left:13px;` : '';
  return `<div class="metric-card" style="cursor:pointer;${leftBorder}"
      onclick="window._nav('${navId}')"
      onmouseover="this.style.borderColor='${alert ? color : 'var(--border-teal)'}'"
      onmouseout="this.style.borderColor='${alert ? color : 'var(--border)'}'">
    <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.9px;margin-bottom:8px">${label}</div>
    <div style="font-size:30px;font-weight:700;color:${color};font-family:var(--font-mono);line-height:1;margin-bottom:6px">${value}</div>
    <div style="font-size:11px;color:var(--text-secondary)">${sub}</div>
  </div>`;
}

function _dQueueSection(title, rows) {
  if (!rows.length) return '';
  return `<div>
    <div style="padding:7px 16px 3px;background:rgba(255,255,255,0.02);border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      <span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:600;color:var(--text-tertiary)">${title}</span>
    </div>
    ${rows.join('')}
  </div>`;
}

function _dCourseRow(c, statusKey) {
  const dotColor = { active:'var(--teal)', pending_approval:'var(--amber)', paused:'var(--amber)', approved:'var(--blue)' }[statusKey] || 'var(--text-tertiary)';
  const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round((c.sessions_delivered||0) / c.planned_sessions_total * 100)) : 0;
  const btn = statusKey === 'active'
    ? `<button class="btn btn-sm" style="font-size:10.5px;padding:3px 8px;flex-shrink:0" onclick="event.stopPropagation();window._nav('session-execution')">Execute →</button>`
    : statusKey === 'pending_approval'
    ? `<button class="btn btn-sm" style="font-size:10.5px;padding:3px 8px;flex-shrink:0;color:var(--amber)" onclick="event.stopPropagation();window._nav('review-queue')">Review →</button>`
    : statusKey === 'paused'
    ? `<span style="font-size:10px;color:var(--amber);flex-shrink:0">Paused</span>`
    : '';
  return `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border);cursor:pointer"
      onclick="window._openCourse('${c.id}')"
      onmouseover="this.style.background='var(--bg-card-hover)'"
      onmouseout="this.style.background=''">
    <div style="width:6px;height:6px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:1px"></div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12.5px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${c.condition_slug?.replace(/-/g,' ') || '—'} · <span style="color:var(--teal)">${c.modality_slug || '—'}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:3px">
        <div style="width:56px;height:3px;border-radius:2px;background:var(--border);flex-shrink:0">
          <div style="height:3px;border-radius:2px;background:${dotColor};width:${pct}%"></div>
        </div>
        <span style="font-size:10.5px;color:var(--text-tertiary)">${c.sessions_delivered||0}/${c.planned_sessions_total||'?'} sessions</span>
        ${(c.governance_warnings||[]).length ? '<span style="font-size:10px;color:var(--red)">⚠ flagged</span>' : ''}
        ${c.on_label === false ? '<span style="font-size:10px;color:var(--amber)">off-label</span>' : ''}
      </div>
    </div>
    ${btn}
  </div>`;
}

function _dGovSection(title, count, body, accentColor) {
  const badge = count > 0
    ? `<span style="font-size:11px;font-weight:700;color:${accentColor};font-family:var(--font-mono);padding:1px 7px;border-radius:4px;background:${accentColor}18">${count}</span>`
    : `<span style="font-size:10.5px;color:var(--green)">✓</span>`;
  return `<div style="border-top:1px solid var(--border)">
    <div style="padding:8px 16px 4px;display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.015)">
      <span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:600;color:var(--text-tertiary);flex:1">${title}</span>
      ${badge}
    </div>
    ${body}
  </div>`;
}

function _dGovRow(primary, secondary, typeKey, onclickExpr) {
  const tc = {
    pending:   { c:'var(--amber)', bg:'rgba(255,181,71,0.06)',   label:'Pending' },
    'off-label':{ c:'var(--amber)', bg:'rgba(255,181,71,0.06)',  label:'Off-label' },
    moderate:  { c:'var(--amber)', bg:'rgba(255,181,71,0.06)',   label:'Moderate' },
    serious:   { c:'var(--red)',   bg:'rgba(255,107,107,0.06)',  label:'Serious' },
    severe:    { c:'var(--red)',   bg:'rgba(255,107,107,0.06)',  label:'Severe' },
    mild:      { c:'var(--blue)',  bg:'rgba(74,158,255,0.06)',   label:'Mild' },
    open:      { c:'var(--amber)', bg:'rgba(255,181,71,0.06)',   label:'Open' },
  }[typeKey] || { c:'var(--text-tertiary)', bg:'', label: typeKey };
  return `<div style="display:flex;align-items:center;gap:8px;padding:7px 16px;border-bottom:1px solid var(--border);cursor:pointer"
      onclick="${onclickExpr}"
      onmouseover="this.style.background='${tc.bg}'"
      onmouseout="this.style.background=''">
    <div style="flex:1;min-width:0;overflow:hidden">
      <span style="font-size:12px;font-weight:500;color:var(--text-primary)">${primary}</span>
      <span style="font-size:11px;color:var(--text-secondary);margin-left:7px">${secondary}</span>
    </div>
    <span style="font-size:9.5px;font-weight:600;padding:2px 6px;border-radius:3px;background:${tc.bg};color:${tc.c};flex-shrink:0;white-space:nowrap">${tc.label}</span>
  </div>`;
}

function _dNoItems(msg) {
  return `<div style="padding:8px 16px 10px;font-size:11.5px;color:var(--text-tertiary);font-style:italic">${msg}</div>`;
}

function _dOutcomeCell(label, value, color, sub) {
  return `<div style="padding:12px 14px;border-bottom:1px solid var(--border);border-right:1px solid var(--border)">
    <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:5px">${label}</div>
    <div style="font-size:22px;font-weight:700;color:${color};font-family:var(--font-mono);line-height:1;margin-bottom:4px">${value}</div>
    <div style="font-size:10.5px;color:var(--text-secondary)">${sub}</div>
  </div>`;
}

function _dMiniBar(label, value, total, color) {
  const pct = total > 0 ? Math.round(value / total * 100) : 0;
  return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
    <span style="font-size:11px;color:var(--text-secondary);width:64px;flex-shrink:0">${label}</span>
    <div style="flex:1;height:4px;border-radius:2px;background:var(--border)">
      <div style="height:4px;border-radius:2px;background:${color};width:${pct}%;transition:width .3s"></div>
    </div>
    <span style="font-size:11px;color:${color};font-weight:600;width:24px;text-align:right;font-family:var(--font-mono)">${value}</span>
  </div>`;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export async function pgDash(setTopbar, navigate) {
  const role = currentUser?.role || 'clinician';

  // Role-aware topbar actions
  const roleActions = {
    technician:   [
      { l: 'Start Session',    icon: '◧', page: 'session-execution', primary: true },
      { l: 'Active Courses',   icon: '◎', page: 'courses' },
    ],
    reviewer: [
      { l: 'Review Queue',     icon: '◱', page: 'review-queue', primary: true },
      { l: 'Audit Trail',      icon: '◧', page: 'audittrail' },
    ],
    supervisor: [
      { l: 'Review Queue',     icon: '◱', page: 'review-queue', primary: true },
      { l: 'Outcomes',         icon: '◫', page: 'outcomes' },
      { l: 'Audit Trail',      icon: '◧', page: 'audittrail' },
    ],
    admin: [
      { l: 'Review Queue',     icon: '◱', page: 'review-queue', primary: true },
      { l: 'Audit Trail',      icon: '◧', page: 'audittrail' },
      { l: 'Settings',         icon: '◎', page: 'settings' },
    ],
    'clinic-admin': [
      { l: 'Add Patient',      icon: '◉', page: 'patients', primary: true },
      { l: 'Review Queue',     icon: '◱', page: 'review-queue' },
      { l: 'Settings',         icon: '◎', page: 'settings' },
    ],
  };
  const defaultActions = [
    { l: 'Start Session',      icon: '◧', page: 'session-execution', primary: true },
    { l: 'Create Course',      icon: '◎', page: 'protocol-wizard' },
    { l: 'Review Approvals',   icon: '◱', page: 'review-queue' },
    { l: 'Add Patient',        icon: '◉', page: 'patients' },
  ];
  const actions = roleActions[role] || defaultActions;

  setTopbar('Dashboard',
    `<div style="display:flex;gap:6px;align-items:center">
      <span style="font-size:10px;color:var(--text-tertiary);margin-right:4px;text-transform:uppercase;letter-spacing:.7px">${role}</span>
      ${actions.map(a =>
        `<button class="btn ${a.primary ? 'btn-primary' : ''} btn-sm" onclick="window._nav('${a.page}')">${a.icon} ${a.l}</button>`
      ).join('')}
    </div>`
  );

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // ── Load all data in parallel ──────────────────────────────────────────────
  let allCourses = [], pendingQueue = [], aes = [], outcomeSummary = null, patCount = 0;
  try {
    const [ptsRes, coursesRes, queueRes, aeRes, outRes] = await Promise.all([
      api.listPatients().catch(() => null),
      api.listCourses().catch(() => null),
      api.listReviewQueue({ status: 'pending' }).catch(() => null),
      api.listAdverseEvents().catch(() => null),
      api.aggregateOutcomes().catch(() => null),
    ]);
    if (ptsRes) patCount = ptsRes.total ?? ptsRes.items?.length ?? 0;
    if (coursesRes) allCourses = coursesRes.items || [];
    if (queueRes)   pendingQueue = queueRes.items || [];
    if (aeRes)      aes = aeRes.items || [];
    if (outRes)     outcomeSummary = outRes;
  } catch {}

  // ── Derive all metrics ─────────────────────────────────────────────────────
  const activeCourses    = allCourses.filter(c => c.status === 'active');
  const pendingCourses   = allCourses.filter(c => c.status === 'pending_approval');
  const approvedCourses  = allCourses.filter(c => c.status === 'approved');
  const pausedCourses    = allCourses.filter(c => c.status === 'paused');
  const completedCourses = allCourses.filter(c => c.status === 'completed');
  const flaggedCourses   = allCourses.filter(c => (c.governance_warnings || []).length > 0);
  const offLabelCourses  = allCourses.filter(c => c.on_label === false);
  const offLabelPending  = offLabelCourses.filter(c => c.status === 'pending_approval' || c.status === 'approved');

  const openAEs    = aes.filter(a => !a.resolved_at);
  const seriousAEs = aes.filter(a => (a.severity === 'serious' || a.severity === 'severe') && !a.resolved_at);
  const recentAEs  = aes.filter(a => a.occurred_at && new Date(a.occurred_at) >= new Date(Date.now() - 7 * 86400000));

  const highRiskCount   = flaggedCourses.length + seriousAEs.length;
  const sessionsPerWeek = activeCourses.reduce((s, c) => s + (c.planned_sessions_per_week || 0), 0);
  const totalDelivered  = allCourses.reduce((s, c) => s + (c.sessions_delivered || 0), 0);

  const responderRate   = (() => {
    if (!outcomeSummary) return '—';
    const r = outcomeSummary.responder_rate_pct ?? outcomeSummary.responder_rate;
    return r != null ? Math.round(r) + '%' : '—';
  })();
  const nonResponderCount     = outcomeSummary?.non_responder_count ?? '—';
  const assessCompletionPct   = outcomeSummary?.assessment_completion_pct != null
    ? Math.round(outcomeSummary.assessment_completion_pct) + '%' : '—';

  // Modality distribution across active courses
  const modalityCount = {};
  activeCourses.forEach(c => { const m = c.modality_slug || 'Unknown'; modalityCount[m] = (modalityCount[m] || 0) + 1; });
  const topModalities = Object.entries(modalityCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Recent activity — last 8 by updated_at
  const recentCourses = [...allCourses]
    .sort((a, b) => ((b.updated_at || b.created_at || '') > (a.updated_at || a.created_at || '') ? 1 : -1))
    .slice(0, 8);

  // ── Row 1: 4-column stat bar ───────────────────────────────────────────────
  const row1 = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
    <div style="border-left:3px solid var(--teal);padding-left:1px;border-radius:var(--radius-md)">${_dStatCard('Sessions / Week', sessionsPerWeek || 0, `Planned · ${activeCourses.length} active courses`, 'var(--teal)', 'session-execution')}</div>
    <div style="border-left:3px solid var(--amber);padding-left:1px;border-radius:var(--radius-md)">${_dStatCard('Pending Reviews', pendingQueue.length || 0, pendingQueue.length > 0 ? `${pendingQueue.length} item${pendingQueue.length !== 1 ? 's' : ''} awaiting approval` : 'Queue clear', pendingQueue.length > 0 ? 'var(--amber)' : 'var(--green)', 'review-queue', pendingQueue.length > 0)}</div>
    <div style="border-left:3px solid var(--red);padding-left:1px;border-radius:var(--radius-md)">${_dStatCard('Governance Flags', highRiskCount || 0, highRiskCount > 0 ? `${flaggedCourses.length} courses · ${seriousAEs.length} serious AEs` : 'No active safety flags', highRiskCount > 0 ? 'var(--red)' : 'var(--green)', 'adverse-events', highRiskCount > 0)}</div>
    <div style="border-left:3px solid var(--green);padding-left:1px;border-radius:var(--radius-md)">${_dStatCard('Active Courses', activeCourses.length || 0, `${patCount} patients · ${completedCourses.length} completed`, 'var(--blue)', 'courses')}</div>
  </div>`;

  // ── Row 2: Clinic Queue + Review & Governance ──────────────────────────────
  const clinicQueueRows = [
    ...(activeCourses.length ? [_dQueueSection('Active — In Execution', activeCourses.slice(0,5).map(c => _dCourseRow(c,'active')))] : []),
    ...(pausedCourses.length ? [_dQueueSection('Paused — Needs Attention', pausedCourses.slice(0,3).map(c => _dCourseRow(c,'paused')))] : []),
    ...(pendingCourses.length ? [_dQueueSection('Pending Approval', pendingCourses.slice(0,3).map(c => _dCourseRow(c,'pending_approval')))] : []),
  ];

  const row2 = `<div class="g2" style="margin-bottom:14px;align-items:start">
    <div class="card" style="overflow:hidden">
      <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:13px">Today's Clinic Queue</span>
        <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('courses')">All Courses →</button>
      </div>
      ${clinicQueueRows.length
        ? clinicQueueRows.join('')
        : `<div style="padding:36px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No courses in queue. <button class="btn btn-sm" onclick="window._nav('protocol-wizard')" style="margin-left:6px">Create Course →</button></div>`
      }
    </div>

    <div class="card" style="overflow:hidden">
      <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:13px">Review &amp; Governance</span>
        <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('review-queue')">Queue →</button>
      </div>
      ${_dGovSection('Approvals Pending', pendingQueue.length,
        pendingQueue.length
          ? pendingQueue.slice(0,4).map(item =>
              _dGovRow(
                item.condition_slug?.replace(/-/g,' ') || `Course #${(item.course_id||item.id||'').slice(0,8)}`,
                item.modality_slug || item.notes?.slice(0,30) || '—',
                'pending',
                `window._nav('review-queue')`
              )).join('')
          : _dNoItems('No pending approvals'),
        'var(--amber)'
      )}
      ${_dGovSection('Off-Label Requests', offLabelPending.length,
        offLabelPending.length
          ? offLabelPending.slice(0,3).map(c =>
              _dGovRow(
                c.condition_slug?.replace(/-/g,' ') || '—',
                c.modality_slug || '—',
                'off-label',
                `window._openCourse('${c.id}')`
              )).join('')
          : _dNoItems('None pending'),
        'var(--amber)'
      )}
      ${_dGovSection('Open Adverse Events', openAEs.length,
        openAEs.length
          ? openAEs.slice(0,4).map(ae =>
              _dGovRow(
                (ae.event_type||'Event').replace(/_/g,' '),
                ae.severity || '—',
                ae.severity === 'serious' || ae.severity === 'severe' ? ae.severity : (ae.severity || 'open'),
                `window._nav('adverse-events')`
              )).join('')
          : _dNoItems('No open events'),
        openAEs.length > 0 ? 'var(--red)' : 'var(--green)'
      )}
      ${flaggedCourses.length ? _dGovSection('Safety Escalations', flaggedCourses.length,
        flaggedCourses.slice(0,3).map(c =>
          `<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 16px;border-bottom:1px solid var(--border);cursor:pointer"
              onclick="window._openCourse('${c.id}')"
              onmouseover="this.style.background='rgba(255,107,107,0.04)'"
              onmouseout="this.style.background=''">
            <span style="color:var(--red);font-size:12px;flex-shrink:0;margin-top:1px">⚠</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:500">${c.condition_slug?.replace(/-/g,' ')||'—'} · ${c.modality_slug||'—'}</div>
              <div style="font-size:10.5px;color:var(--red);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(c.governance_warnings||[]).join(' · ')}</div>
            </div>
            <span style="font-size:10px;color:var(--text-tertiary);flex-shrink:0">→</span>
          </div>`
        ).join(''),
        'var(--red)'
      ) : ''}
    </div>
  </div>`;

  // ── Row 3: Outcomes + Capacity ─────────────────────────────────────────────
  const row3 = `<div class="g2" style="margin-bottom:14px;align-items:start">
    <div class="card" style="overflow:hidden">
      <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:13px">Outcomes Snapshot</span>
        <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('outcomes')">Full Outcomes →</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">
        ${_dOutcomeCell('Responder Rate',     responderRate,        'var(--teal)',  '≥50% symptom reduction')}
        ${_dOutcomeCell('Non-Responders',     nonResponderCount,    typeof nonResponderCount === 'number' && nonResponderCount > 0 ? 'var(--red)' : 'var(--text-secondary)', 'No meaningful change')}
        ${_dOutcomeCell('Assess. Completion', assessCompletionPct,  'var(--blue)',  'Assessment fill rate')}
        ${_dOutcomeCell('Courses Completed',  completedCourses.length, 'var(--green)', 'All time total')}
      </div>
      ${allCourses.length ? `<div style="padding:12px 14px">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:10px">Course Status Mix</div>
        ${_dMiniBar('Active',    activeCourses.length,    allCourses.length, 'var(--teal)')}
        ${_dMiniBar('Pending',   pendingCourses.length,   allCourses.length, 'var(--amber)')}
        ${_dMiniBar('Completed', completedCourses.length, allCourses.length, 'var(--green)')}
        ${_dMiniBar('Paused',    pausedCourses.length,    allCourses.length, 'var(--blue)')}
      </div>` : ''}
    </div>

    <div class="card" style="overflow:hidden">
      <div style="padding:13px 16px 11px;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:13px">Capacity &amp; Utilization</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--border)">
        ${_dOutcomeCell('Sessions / Week',    sessionsPerWeek || 0, 'var(--teal)',   'Planned across active')}
        ${_dOutcomeCell('Sessions Delivered', totalDelivered,       'var(--blue)',   'All time total')}
        ${_dOutcomeCell('Patients',           patCount,             'var(--violet)', 'Active in panel')}
        ${_dOutcomeCell('Flagged Courses',    flaggedCourses.length, flaggedCourses.length > 0 ? 'var(--red)' : 'var(--green)', 'Governance warnings')}
      </div>
      ${topModalities.length ? `<div style="padding:12px 14px">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:10px">Modality Load (Active Courses)</div>
        ${topModalities.map(([mod, count]) => _dMiniBar(mod, count, activeCourses.length, 'var(--teal)')).join('')}
      </div>` : `<div style="padding:14px 16px;font-size:11.5px;color:var(--text-tertiary)">No active courses.</div>`}
      ${approvedCourses.length > 0 ? `<div style="padding:10px 14px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:11.5px;color:var(--text-secondary)">Approved — not yet started</span>
        <span style="font-size:13px;font-weight:600;color:var(--blue);font-family:var(--font-mono)">${approvedCourses.length}</span>
      </div>` : ''}
    </div>
  </div>`;

  // ── Today's sessions widget ────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySessions = activeCourses.slice(0, 6); // use active courses as proxy for scheduled today
  const todayWidget = `<div class="card" style="overflow:hidden;margin-bottom:14px">
    <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <span style="font-weight:600;font-size:13px">Today's Sessions</span>
      <span style="font-size:10.5px;color:var(--text-tertiary)">${todayStr}</span>
    </div>
    ${todaySessions.length === 0
      ? `<div style="padding:24px 16px;text-align:center;font-size:12.5px;color:var(--text-tertiary)">No sessions scheduled today.</div>`
      : `<div style="display:flex;flex-direction:column">
          ${todaySessions.map((c, i) => {
            const hour = 9 + i;
            const time = `${String(hour).padStart(2,'0')}:00`;
            return `<div style="display:flex;align-items:center;gap:10px;padding:9px 16px;border-bottom:1px solid var(--border)">
              <span style="font-size:11.5px;font-weight:600;color:var(--teal);font-family:var(--font-mono);width:40px;flex-shrink:0">${time}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${c.condition_slug?.replace(/-/g,' ') || '—'} · <span style="color:var(--teal)">${c.modality_slug || '—'}</span></div>
                <div style="font-size:10.5px;color:var(--text-tertiary)">Session ${(c.sessions_delivered || 0) + 1} of ${c.planned_sessions_total || '?'}</div>
              </div>
              <button class="btn btn-sm" style="font-size:10.5px;padding:3px 8px" onclick="window._nav('session-execution')">Execute →</button>
            </div>`;
          }).join('')}
        </div>`
    }
  </div>`;

  // ── Row 4: Recent Activity feed ────────────────────────────────────────────
  const row4 = `<div class="card" style="overflow:hidden">
    <div style="padding:13px 16px 11px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)">
      <span style="font-weight:600;font-size:13px">Recent Course Activity</span>
      <button class="btn btn-sm" style="font-size:10.5px" onclick="window._nav('courses')">All Courses →</button>
    </div>
    ${recentCourses.length === 0
      ? `<div style="padding:36px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No courses yet.</div>`
      : `<div style="overflow-x:auto"><table class="ds-table">
          <thead><tr>
            <th>Condition · Modality</th><th>Status</th><th>Evidence</th>
            <th style="min-width:110px">Progress</th><th>Sessions</th><th>Signals</th><th></th>
          </tr></thead>
          <tbody>
            ${recentCourses.map(c => {
              const sc = COURSE_STATUS_COLORS[c.status] || 'var(--text-tertiary)';
              const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round((c.sessions_delivered||0) / c.planned_sessions_total * 100)) : 0;
              return `<tr style="cursor:pointer" onclick="window._openCourse('${c.id}')">
                <td>
                  <div style="font-size:12.5px;font-weight:500">${c.condition_slug?.replace(/-/g,' ') || '—'}</div>
                  <div style="font-size:11px;color:var(--teal)">${c.modality_slug || '—'}</div>
                </td>
                <td>${approvalBadge(c.status)}</td>
                <td>${evidenceBadge(c.evidence_grade)}</td>
                <td>
                  <div style="height:4px;border-radius:2px;background:var(--border);margin-bottom:3px">
                    <div style="height:4px;border-radius:2px;background:${sc};width:${pct}%"></div>
                  </div>
                  <div style="font-size:10px;color:var(--text-tertiary)">${pct}%</div>
                </td>
                <td class="mono" style="font-size:12px">${c.sessions_delivered||0}/${c.planned_sessions_total||'?'}</td>
                <td style="white-space:nowrap">
                  ${safetyBadge(c.governance_warnings)}
                  ${c.on_label === false ? labelBadge(false) : ''}
                </td>
                <td style="color:var(--text-tertiary);font-size:12px">→</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`
    }
  </div>`;

  el.innerHTML = row1 + row2 + row3 + todayWidget + row4;
}

// ── Patients ─────────────────────────────────────────────────────────────────
export async function pgPatients(setTopbar, navigate) {
  setTopbar('Patients',
    `<button class="btn btn-primary btn-sm" onclick="window.showAddPatient()">+ New Patient</button>`
  );

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [], conditions = [], modalities = [];
  try {
    const [patientsRes, condRes, modRes] = await Promise.all([
      api.listPatients().catch(() => null),
      api.conditions().catch(() => null),
      api.modalities().catch(() => null),
    ]);
    items      = patientsRes?.items || [];
    conditions = condRes?.items     || [];
    modalities = modRes?.items      || [];
    if (!patientsRes) {
      el.innerHTML = `<div class="notice notice-warn">Could not load patients.</div>`;
      return;
    }
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load patients: ${e.message}</div>`;
    return;
  }

  // Build registry-backed option lists; fall back to static if registry unavailable
  const conditionOptions = conditions.length
    ? conditions.map(c => `<option value="${c.name || c.Condition_Name}">${c.name || c.Condition_Name}</option>`).join('')
    : FALLBACK_CONDITIONS.map(c => `<option>${c}</option>`).join('');

  const modalityOptions = modalities.length
    ? modalities.map(m => `<option value="${m.name || m.Modality_Name}">${m.name || m.Modality_Name}</option>`).join('')
    : FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('');

  el.innerHTML = `
  <div id="add-patient-panel" style="display:none;margin-bottom:16px">
    ${cardWrap('New Patient', `
      <div class="g2">
        <div>
          <div class="form-group"><label class="form-label">First Name</label><input id="np-first" class="form-control" placeholder="First name"></div>
          <div class="form-group"><label class="form-label">Last Name</label><input id="np-last" class="form-control" placeholder="Last name"></div>
          <div class="form-group"><label class="form-label">Date of Birth</label><input id="np-dob" class="form-control" type="date"></div>
          <div class="form-group"><label class="form-label">Gender</label>
            <select id="np-gender" class="form-control"><option value="">Select…</option><option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option></select>
          </div>
        </div>
        <div>
          <div class="form-group"><label class="form-label">Email</label><input id="np-email" class="form-control" type="email" placeholder="patient@email.com"></div>
          <div class="form-group"><label class="form-label">Primary Condition</label>
            <select id="np-condition" class="form-control">
              <option value="">Select condition…</option>
              ${conditionOptions}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Primary Modality</label>
            <select id="np-modality" class="form-control">
              <option value="">Select modality…</option>
              ${modalityOptions}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Notes</label><textarea id="np-notes" class="form-control" placeholder="Clinical notes…"></textarea></div>
        </div>
      </div>
      <div id="np-error" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:8px">
        <button class="btn" onclick="document.getElementById('add-patient-panel').style.display='none'">Cancel</button>
        <button class="btn btn-primary" onclick="window.saveNewPatient()">Save Patient</button>
      </div>
    `)}
  </div>

  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
    <input class="form-control" id="pt-search" placeholder="Search patients by name or condition…" style="flex:1;min-width:200px" oninput="window.filterPatients()">
    <select class="form-control" id="pt-status-filter" style="width:auto" onchange="window.filterPatients()">
      <option value="">All Status</option><option>active</option><option>pending</option><option>inactive</option>
    </select>
    <select class="form-control" id="pt-modality-filter" style="width:auto" onchange="window.filterPatients()">
      <option value="">All Modalities</option>
      ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
    </select>
    <span id="pt-count" style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${items.length} patients</span>
  </div>

  <div class="card" style="overflow-x:auto">
    ${items.length === 0
      ? `<div style="text-align:center;padding:56px 24px">
          <div style="font-size:42px;margin-bottom:16px;opacity:0.4">◉</div>
          <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:8px">No patients yet</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:24px;max-width:340px;margin-left:auto;margin-right:auto">Add your first patient to start managing treatment courses and clinical records.</div>
          <button class="btn btn-primary" onclick="window.showAddPatient()">+ Add Patient</button>
        </div>`
      : `<table class="ds-table" id="patients-table">
          <thead><tr>
            <th>Patient</th><th>Condition</th><th>Modality</th><th>Status</th><th>Courses</th><th>Consent</th><th></th>
          </tr></thead>
          <tbody id="patients-body">
            ${items.map(p => {
              const statusDot = p.status === 'active'
                ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:5px;flex-shrink:0"></span>'
                : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--text-tertiary);margin-right:5px;flex-shrink:0"></span>';
              return `<tr onclick="window.openPatient('${p.id}')">
                <td><div style="display:flex;align-items:center;gap:10px">
                  ${statusDot}
                  <div class="avatar" style="width:30px;height:30px;font-size:10.5px;flex-shrink:0">${initials((p.first_name || '') + ' ' + (p.last_name || ''))}</div>
                  <div>
                    <div style="font-weight:500">${p.first_name || ''} ${p.last_name || ''}</div>
                    <div style="font-size:10.5px;color:var(--text-tertiary)">${p.dob ? p.dob : 'DOB unknown'}</div>
                  </div>
                </div></td>
                <td style="color:var(--text-secondary)">${p.primary_condition || '—'}</td>
                <td><span class="tag">${p.primary_modality || '—'}</span></td>
                <td>${pillSt(p.status || 'pending')}</td>
                <td style="font-size:12px;color:var(--text-tertiary)">${p._activeCourseCount != null ? `<span style="color:var(--teal);font-weight:600">${p._activeCourseCount}</span> active` : '—'}</td>
                <td>${p.consent_signed ? '<span style="color:var(--green);font-size:12px">✓ Signed</span>' : '<span style="color:var(--amber);font-size:12px">Pending</span>'}</td>
                <td style="display:flex;gap:4px">
                  <button class="btn btn-sm" onclick="event.stopPropagation();window.openPatient('${p.id}')">Open →</button>
                  <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();window.deletePatient('${p.id}')">✕</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`
    }
  </div>`;

  window._patientsData = items;

  window.filterPatients = function() {
    const q = document.getElementById('pt-search').value.toLowerCase();
    const st = document.getElementById('pt-status-filter').value;
    const mod = document.getElementById('pt-modality-filter')?.value || '';
    const filtered = (window._patientsData || []).filter(p => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      const matchQ = !q || name.includes(q) || (p.primary_condition || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
      const matchSt = !st || p.status === st;
      const matchMod = !mod || (p.primary_modality || '') === mod;
      return matchQ && matchSt && matchMod;
    });
    const countEl = document.getElementById('pt-count');
    if (countEl) countEl.textContent = filtered.length + ' patient' + (filtered.length !== 1 ? 's' : '');
    const tbody = document.getElementById('patients-body');
    if (!tbody) return;
    tbody.innerHTML = filtered.length === 0
      ? `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-tertiary)">No patients match filter.</td></tr>`
      : filtered.map(p => {
          const statusDot = p.status === 'active'
            ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:5px;flex-shrink:0"></span>'
            : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--text-tertiary);margin-right:5px;flex-shrink:0"></span>';
          return `<tr onclick="window.openPatient('${p.id}')">
            <td><div style="display:flex;align-items:center;gap:10px">
              ${statusDot}
              <div class="avatar" style="width:30px;height:30px;font-size:10.5px">${initials((p.first_name || '') + ' ' + (p.last_name || ''))}</div>
              <div><div style="font-weight:500">${p.first_name} ${p.last_name}</div><div style="font-size:10.5px;color:var(--text-tertiary)">${p.dob || ''}</div></div>
            </div></td>
            <td style="color:var(--text-secondary)">${p.primary_condition || '—'}</td>
            <td><span class="tag">${p.primary_modality || '—'}</span></td>
            <td>${pillSt(p.status || 'pending')}</td>
            <td style="font-size:12px;color:var(--text-tertiary)">${p._activeCourseCount != null ? `<span style="color:var(--teal);font-weight:600">${p._activeCourseCount}</span> active` : '—'}</td>
            <td>${p.consent_signed ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--amber)">Pending</span>'}</td>
            <td><button class="btn btn-sm" onclick="event.stopPropagation();window.openPatient('${p.id}')">Open →</button></td>
          </tr>`;
        }).join('');
  };

  window.showAddPatient = function() {
    document.getElementById('add-patient-panel').style.display = '';
  };

  window.saveNewPatient = async function() {
    const errEl = document.getElementById('np-error');
    errEl.style.display = 'none';
    const data = {
      first_name: document.getElementById('np-first').value.trim(),
      last_name: document.getElementById('np-last').value.trim(),
      dob: document.getElementById('np-dob').value || null,
      gender: document.getElementById('np-gender').value || null,
      email: document.getElementById('np-email').value.trim() || null,
      primary_condition: document.getElementById('np-condition').value || null,
      primary_modality: document.getElementById('np-modality').value || null,
      notes: document.getElementById('np-notes').value.trim() || null,
      status: 'pending',
    };
    if (!data.first_name || !data.last_name) { errEl.textContent = 'First and last name required.'; errEl.style.display = ''; return; }
    try {
      await api.createPatient(data);
      navigate('patients');
    } catch (e) {
      errEl.textContent = e.message || 'Save failed.';
      errEl.style.display = '';
    }
  };

  window.openPatient = function(id) {
    window._selectedPatientId = id;
    navigate('profile');
  };

  window.deletePatient = async function(id) {
    if (!confirm('Delete this patient? This cannot be undone.')) return;
    try {
      await api.deletePatient(id); navigate('patients');
    } catch (e) {
      const b = document.createElement('div');
      b.className = 'notice notice-warn';
      b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
      b.textContent = e.message || 'Delete failed.';
      document.body.appendChild(b); setTimeout(() => b.remove(), 4000);
    }
  };
}

// ── Patient Profile ───────────────────────────────────────────────────────────
export async function pgProfile(setTopbar, navigate) {
  const id = window._selectedPatientId;
  if (!id) { navigate('patients'); return; }

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let pt = null, sessions = [], courses = [];
  try {
    [pt, sessions, courses] = await Promise.all([
      api.getPatient(id),
      api.listSessions(id).then(r => r?.items || []),
      api.listCourses({ patient_id: id }).then(r => r?.items || []).catch(() => []),
    ]);
  } catch {}

  if (!pt) { el.innerHTML = `<div class="notice notice-warn">Could not load patient.</div>`; return; }

  const name = `${pt.first_name} ${pt.last_name}`;
  const done = sessions.filter(s => s.status === 'completed').length;
  const total = sessions.length;

  setTopbar(`${name}`,
    `<button class="btn btn-ghost btn-sm" onclick="window._nav('patients')">← Patients</button>
     <button class="btn btn-primary btn-sm" onclick="window.startNewCourse()">+ New Course</button>`
  );

  el.innerHTML = `
  <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(0,212,188,0.05),rgba(74,158,255,0.05))">
    <div class="card-body" style="display:flex;align-items:flex-start;gap:16px;padding:20px">
      <div class="avatar" style="width:56px;height:56px;font-size:20px;flex-shrink:0;border-radius:var(--radius-lg)">${initials(name)}</div>
      <div style="flex:1">
        <div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-primary)">${name}</div>
        <div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px">
          ${pt.dob ? pt.dob + ' · ' : ''}${pt.gender || ''} · ${pt.primary_condition || 'No condition set'}
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          ${pt.primary_modality ? tag(pt.primary_modality) : ''}
          ${pt.consent_signed ? '<span class="tag" style="color:var(--green)">✓ Consent Signed</span>' : '<span class="tag" style="color:var(--amber)">Consent Pending</span>'}
          ${pt.primary_condition ? tag(pt.primary_condition) : ''}
        </div>
      </div>
      <div style="text-align:right">
        ${pillSt(pt.status || 'pending')}
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px">Sessions: ${done} / ${total}</div>
        ${total > 0 ? `<div class="progress-bar" style="margin-top:7px;width:130px;margin-left:auto;height:4px"><div class="progress-fill" style="width:${Math.round((done/total)*100)}%"></div></div>` : ''}
      </div>
    </div>
  </div>

  <div class="tab-bar">
    ${['overview', 'courses', 'sessions', 'outcomes', 'protocol', 'assessments', 'notes', 'phenotype', 'consent'].map(t =>
      `<button class="tab-btn ${ptab === t ? 'active' : ''}" onclick="window.switchPT('${t}')">${t}${t === 'courses' && courses.length ? ` (${courses.length})` : ''}</button>`
    ).join('')}
  </div>
  <div id="ptab-body">${renderProfileTab(pt, sessions, courses)}</div>`;

  window._currentPatient = pt;
  window._currentSessions = sessions;
  window._currentCourses = courses;

  window.switchPT = async function(t) {
    ptab = t;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.trim().startsWith(t)));
    if (t === 'phenotype') {
      document.getElementById('ptab-body').innerHTML = spinner();
      const [assigns, phenos] = await Promise.all([
        api.listPhenotypeAssignments({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.phenotypes().then(r => r?.items || r || []).catch(() => []),
      ]);
      document.getElementById('ptab-body').innerHTML = renderPhenotypeTab(pt, assigns, phenos);
      bindPhenotypeActions(pt);
      return;
    }
    if (t === 'consent') {
      document.getElementById('ptab-body').innerHTML = spinner();
      const consents = await api.listConsents({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderConsentTab(pt, consents);
      bindConsentActions(pt);
      return;
    }
    if (t === 'outcomes') {
      document.getElementById('ptab-body').innerHTML = spinner();
      const outcomes = await api.listOutcomes({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderOutcomesTab(pt, outcomes, window._currentCourses || []);
      bindOutcomesActions(pt);
      return;
    }
    if (t === 'assessments') {
      document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, window._currentCourses || []);
      // Async load patient's recent assessments
      setTimeout(async () => {
        const bodyEl = document.getElementById('assessments-tab-body');
        if (!bodyEl) return;
        try {
          const res = await api.listAssessments();
          const all = res?.items || [];
          const patAssess = all.filter(a => a.patient_id === pt.id);
          if (patAssess.length === 0) {
            bodyEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:12.5px;padding:8px 0">No assessments recorded for this patient yet.</div>`;
          } else {
            bodyEl.innerHTML = `<table class="ds-table"><thead><tr><th>Template</th><th>Date</th><th>Score</th><th>Notes</th></tr></thead><tbody>
              ${patAssess.slice(0, 10).map(a => `<tr>
                <td style="font-weight:500">${a.template_id}</td>
                <td style="color:var(--text-tertiary)">${a.created_at?.split('T')[0] || '—'}</td>
                <td class="mono" style="color:var(--teal)">${a.score ?? '—'}</td>
                <td style="font-size:11px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.clinician_notes || '—'}</td>
              </tr>`).join('')}
            </tbody></table>`;
          }
        } catch { bodyEl.innerHTML = `<div style="color:var(--text-tertiary);font-size:12px">Could not load assessments.</div>`; }
      }, 0);
      return;
    }
    document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, window._currentCourses || []);
    if (t === 'protocol') bindAI(pt);
  };

  window._launchInlineAssess = function(templateId, patientId) {
    // Navigate to assessments page and trigger inline mode after load
    window._assessPreFillPatient = patientId;
    window._assessPreFillTemplate = templateId;
    navigate('assessments');
  };

  window.startNewCourse = function() {
    window._wizardPatientId = pt.id;
    window._wizardPatientName = `${pt.first_name} ${pt.last_name}`;
    navigate('protocol-wizard');
  };

  function _showProfileToast(msg, isError = true) {
    const b = document.createElement('div');
    b.className = 'notice ' + (isError ? 'notice-warn' : 'notice-info');
    b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
    b.textContent = msg;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 4000);
  }

  window._activateCourseFromProfile = async function(courseId) {
    try {
      await api.activateCourse(courseId);
      const updated = await api.listCourses({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      window._currentCourses = updated;
      document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, updated);
    } catch (e) {
      _showProfileToast(e.message || 'Activation failed.');
    }
  };

  window._updateCourseStatus = async function(courseId, status) {
    // Destructive actions require confirmation; status changes don't
    if (status === 'discontinued' && !confirm('Permanently discontinue this treatment course? This cannot be undone.')) return;
    try {
      await api.updateCourse(courseId, { status });
      const updated = await api.listCourses({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      window._currentCourses = updated;
      document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, updated);
    } catch (e) {
      _showProfileToast(e.message || 'Update failed.');
    }
  };

  if (ptab === 'protocol') bindAI(pt);
}

function renderProfileTab(pt, sessions, courses = []) {
  const name = `${pt.first_name} ${pt.last_name}`;

  if (ptab === 'courses') {
    return `
      <div style="margin-bottom:12px;display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="window.startNewCourse()">+ New Treatment Course</button>
      </div>
      ${courses.length === 0
        ? emptyState('◎', 'No treatment courses yet. Click "+ New Treatment Course" to start.')
        : `<div style="display:flex;flex-direction:column;gap:8px">
            ${courses.map(c => {
              const sc = COURSE_STATUS_COLORS[c.status] || 'var(--text-tertiary)';
              const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round(c.sessions_delivered / c.planned_sessions_total * 100)) : 0;
              const actionBtns = [];
              if (c.status === 'pending_approval' || c.status === 'approved')
                actionBtns.push(`<button class="btn btn-sm" onclick="window._activateCourseFromProfile('${c.id}')">Approve &amp; Activate</button>`);
              if (c.status === 'active')
                actionBtns.push(`<button class="btn btn-sm" onclick="window._updateCourseStatus('${c.id}','paused')">Pause</button>`);
              if (c.status === 'paused')
                actionBtns.push(`<button class="btn btn-sm" onclick="window._updateCourseStatus('${c.id}','active')">Resume</button>`);
              if (c.status === 'active' || c.status === 'paused')
                actionBtns.push(`<button class="btn btn-sm" onclick="window._updateCourseStatus('${c.id}','completed')">Complete</button>`);
              if (c.status !== 'discontinued' && c.status !== 'completed')
                actionBtns.push(`<button class="btn btn-sm" style="color:var(--red)" onclick="window._updateCourseStatus('${c.id}','discontinued')">Discontinue</button>`);
              actionBtns.push(`<button class="btn btn-sm" onclick="window._openCourse('${c.id}')">Detail →</button>`);
              return `<div class="card" style="padding:14px 18px">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
                  <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">${c.condition_slug?.replace(/-/g,' ') || '—'} · <span style="color:var(--teal)">${c.modality_slug || '—'}</span></span>
                  ${approvalBadge(c.status)}
                  ${evidenceBadge(c.evidence_grade)}
                  ${c.on_label === false ? labelBadge(false) : ''}
                  ${safetyBadge(c.governance_warnings)}
                </div>
                <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">
                  ${c.planned_sessions_per_week || '?'}×/wk · ${c.planned_sessions_total || '?'} sessions
                  ${c.planned_frequency_hz ? ` · ${c.planned_frequency_hz} Hz` : ''}
                  ${c.target_region ? ` · ${c.target_region}` : ''}
                </div>
                <div style="margin-bottom:8px">
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-tertiary);margin-bottom:3px">
                    <span>Progress</span><span>${c.sessions_delivered || 0}/${c.planned_sessions_total || '?'}</span>
                  </div>
                  <div style="height:3px;border-radius:2px;background:var(--border)">
                    <div style="height:3px;border-radius:2px;background:${sc};width:${pct}%"></div>
                  </div>
                </div>
                ${(c.governance_warnings || []).map(w => `<div style="font-size:11px;color:var(--amber);margin-bottom:3px">⚠ ${w}</div>`).join('')}
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${actionBtns.join('')}</div>
              </div>`;
            }).join('')}
          </div>`
      }`;
  }

  if (ptab === 'overview') return `<div class="g2">
    <div>
      ${cardWrap('Clinical Details', [
        ['Name', name],
        ['Condition', pt.primary_condition || '—'],
        ['Gender', pt.gender || '—'],
        ['DOB', pt.dob || '—'],
        ['Referring Clinician', pt.referring_clinician || '—'],
        ['Contraindications', pt.notes || 'None documented'],
      ].map(([k, v]) => fr(k, v)).join(''))}
      ${cardWrap('Risk Flags', (() => {
        const contra = pt.notes ? pt.notes.toLowerCase() : '';
        const hasContra = contra && contra !== 'none documented' && contra.length > 3;
        const flags = [];
        if (pt.primary_condition?.toLowerCase().includes('epilep')) flags.push({ msg: 'Epilepsy — check TMS/tDCS contraindications', level: 'warn' });
        if (contra && hasContra) flags.push({ msg: `Contraindication note: ${pt.notes}`, level: 'warn' });
        if (!pt.consent_signed) flags.push({ msg: 'Consent not yet signed', level: 'warn' });
        if (flags.length === 0) return '<div class="notice notice-ok" style="margin:0"><span style="color:var(--green);font-weight:600">✓ No contraindications recorded.</span> This patient has no documented safety flags.</div>';
        return flags.map(f => govFlag(f.msg, f.level)).join('');
      })())}
    </div>
    <div>
      ${cardWrap('Contact & Insurance', [
        ['Email', pt.email || '—'],
        ['Phone', pt.phone || '—'],
        ['Insurance', pt.insurance_provider || '—'],
        ['Insurance #', pt.insurance_number || '—'],
        ['Consent Signed', pt.consent_signed ? `<span style="color:var(--green)">Yes — ${pt.consent_date || ''}</span>` : '<span style="color:var(--amber)">Not yet</span>'],
      ].map(([k, v]) => fr(k, v)).join(''))}
      ${cardWrap('Quick Links', `<div style="display:grid;gap:7px">
        <button class="btn btn-sm" onclick="window.startNewCourse()">+ New Treatment Course ◎</button>
        <button class="btn btn-sm" onclick="window.switchPT('courses')">View Courses</button>
        <button class="btn btn-sm" onclick="window.switchPT('sessions')">View Sessions</button>
        <button class="btn btn-sm" onclick="window.switchPT('assessments')">Run Assessment</button>
      </div>`)}
    </div>
  </div>`;

  if (ptab === 'sessions') return `
    <div style="margin-bottom:14px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="window.showNewSession()">+ Log Session</button>
    </div>
    <div id="new-session-form" style="display:none;margin-bottom:16px">
      ${cardWrap('New Session', `
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">Scheduled Date/Time</label><input id="ns-date" class="form-control" type="datetime-local"></div>
            <div class="form-group"><label class="form-label">Duration (min)</label><input id="ns-dur" class="form-control" type="number" value="30"></div>
            <div class="form-group"><label class="form-label">Modality</label>
              <select id="ns-mod" class="form-control"><option value="">Select…</option>
                ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
              </select>
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Session #</label><input id="ns-num" class="form-control" type="number" value="1"></div>
            <div class="form-group"><label class="form-label">Total Sessions Planned</label><input id="ns-total" class="form-control" type="number" value="10"></div>
            <div class="form-group"><label class="form-label">Billing Code</label><input id="ns-billing" class="form-control" placeholder="e.g. 90901"></div>
          </div>
        </div>
        <div id="ns-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="document.getElementById('new-session-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary" onclick="window.saveSession()">Save Session</button>
        </div>
      `)}
    </div>
    ${sessions.length === 0
      ? emptyState('◻', 'No sessions logged yet.')
      : cardWrap('Session Log', `<table class="ds-table">
        <thead><tr><th>#</th><th>Date</th><th>Modality</th><th>Duration</th><th>Status</th><th>Outcome</th><th></th></tr></thead>
        <tbody>${sessions.map(s => `<tr>
          <td class="mono">${s.session_number || '—'}</td>
          <td style="color:var(--text-secondary)">${s.scheduled_at ? s.scheduled_at.split('T')[0] : '—'}</td>
          <td><span class="tag">${s.modality || '—'}</span></td>
          <td class="mono">${s.duration_minutes || '—'} min</td>
          <td>${pillSt(s.status || 'pending')}</td>
          <td style="font-size:12px;color:var(--text-secondary)">${s.outcome || '—'}</td>
          <td><button class="btn btn-sm" onclick="window.completeSession('${s.id}')">Mark Done</button></td>
        </tr>`).join('')}</tbody>
      </table>`)}`;

  if (ptab === 'protocol') return `<div class="g2">
    ${cardWrap(savedProto ? 'Saved Protocol ✓' : 'Current Protocol',
      savedProto ? `
        <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:3px">${savedProto.protocol_name || savedProto.rationale?.split('.')[0] || 'AI Protocol'}</div>
        <div style="font-size:11.5px;color:var(--teal);margin-bottom:14px">${savedProto.modality || pt.primary_modality || '—'}</div>
        ${[
          ['Target Region', savedProto.target_region || '—'],
          ['Evidence Grade', savedProto.evidence_grade || '—'],
          ['Session Freq.', savedProto.session_frequency || '—'],
          ['Duration', savedProto.duration || '—'],
          ['Approval', savedProto.approval_status_badge || '—'],
        ].map(([k, v]) => fr(k, v)).join('')}
        <div style="background:rgba(0,212,188,0.05);border:1px solid var(--border-teal);border-radius:var(--radius-md);padding:12px;margin-top:12px;font-size:12px;color:var(--text-secondary);line-height:1.65">${savedProto.rationale || ''}</div>
        <div style="display:flex;gap:7px;margin-top:12px">
          <button class="btn btn-sm" onclick="window.exportProto()">Download DOCX</button>
          <button class="btn btn-sm" onclick="window._savedProto=null;window.switchPT('protocol')">Regenerate</button>
        </div>
      ` : fr('Condition', pt.primary_condition || '—') + fr('Modality', pt.primary_modality || '—') + `<div style="margin-top:12px;font-size:12px;color:var(--text-secondary)">Generate a protocol using the AI generator →</div>`,
      savedProto ? '<span class="pill pill-active" style="font-size:10px">AI Generated</span>' : ''
    )}
    ${cardWrap('AI Protocol Generator ✦', `<div id="ai-gen-zone">${renderAIZone(pt)}</div>`)}
  </div>`;

  if (ptab === 'assessments') {
    const patId = pt.id;
    const patName = `${pt.first_name} ${pt.last_name}`;
    return `
    <div style="margin-bottom:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="window._launchInlineAssess('PHQ-9','${patId}')">Run PHQ-9</button>
      <button class="btn btn-primary btn-sm" onclick="window._launchInlineAssess('GAD-7','${patId}')">Run GAD-7</button>
      <button class="btn btn-primary btn-sm" onclick="window._launchInlineAssess('ISI','${patId}')">Run ISI</button>
      <button class="btn btn-sm" onclick="window._nav('assessments')">All Assessments →</button>
    </div>
    <div id="assessments-tab-body">${spinner()}</div>`;
  }

  if (ptab === 'notes') return cardWrap('Session Notes', `
    <div class="form-group"><label class="form-label">Session type</label>
      <select class="form-control"><option>Session Note</option><option>Progress Note</option><option>Assessment Note</option></select>
    </div>
    <div class="form-group"><label class="form-label">Clinical note</label>
      <textarea class="form-control" style="height:120px" placeholder="Write session notes…"></textarea>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-primary btn-sm">Save Note</button>
    </div>
  `);

  if (ptab === 'billing') return cardWrap('Billing', `
    <div style="padding:24px;text-align:center;color:var(--text-tertiary)">
      <div style="font-size:12px">Session billing codes are managed per session. Go to <strong>Sessions</strong> tab to update billing.</div>
    </div>
  `);

  if (ptab === 'outcomes') return spinner();
  if (ptab === 'phenotype') return spinner();
  if (ptab === 'consent') return spinner();

  return '';
}

// ── Outcomes tab ──────────────────────────────────────────────────────────────
function renderOutcomesTab(pt, outcomes, courses) {
  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = `${c.condition_slug?.replace(/-/g,' ') || '—'} · ${c.modality_slug || '—'}`; });

  return `
    <div style="margin-bottom:14px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('new-outcome-form').style.display=''">+ Record Outcome</button>
    </div>
    <div id="new-outcome-form" style="display:none;margin-bottom:16px">
      ${cardWrap('Record Outcome', `
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">Course</label>
              <select id="oc-course" class="form-control">
                <option value="">Select course…</option>
                ${courses.map(c => `<option value="${c.id}">${courseMap[c.id]}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Assessment</label>
              <select id="oc-template" class="form-control">
                <option value="">Select…</option>
                ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Score</label>
              <input id="oc-score" class="form-control" type="number" step="0.1" placeholder="0">
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Baseline Score</label>
              <input id="oc-baseline" class="form-control" type="number" step="0.1" placeholder="Pre-treatment score">
            </div>
            <div class="form-group"><label class="form-label">Assessment Date</label>
              <input id="oc-date" class="form-control" type="date">
            </div>
            <div class="form-group"><label class="form-label">Notes</label>
              <textarea id="oc-notes" class="form-control" style="height:60px" placeholder="Clinician notes…"></textarea>
            </div>
          </div>
        </div>
        <div id="oc-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="document.getElementById('new-outcome-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._saveOutcome()">Save Outcome</button>
        </div>
      `)}
    </div>
    ${outcomes.length === 0
      ? emptyState('◫', 'No outcomes recorded yet. Record assessment scores to track treatment response.')
      : `<div class="card" style="overflow-x:auto">
          <table class="ds-table">
            <thead><tr>
              <th>Date</th><th>Assessment</th><th>Score</th><th>Baseline</th><th>Δ Change</th><th>Course</th><th>Notes</th>
            </tr></thead>
            <tbody>
              ${outcomes.map(o => {
                const delta = (o.score !== null && o.score !== undefined && o.baseline_score !== null && o.baseline_score !== undefined)
                  ? (o.score - o.baseline_score).toFixed(1) : null;
                const deltaColor = delta !== null ? (parseFloat(delta) < 0 ? 'var(--green)' : parseFloat(delta) > 0 ? 'var(--red)' : 'var(--text-secondary)') : '';
                return `<tr>
                  <td class="mono" style="white-space:nowrap">${o.assessed_at ? o.assessed_at.split('T')[0] : '—'}</td>
                  <td style="font-size:12px;font-weight:500">${o.assessment_template_id || '—'}</td>
                  <td class="mono">${o.score ?? '—'}</td>
                  <td class="mono" style="color:var(--text-secondary)">${o.baseline_score ?? '—'}</td>
                  <td class="mono" style="color:${deltaColor}">${delta !== null ? (parseFloat(delta) < 0 ? delta : '+' + delta) : '—'}</td>
                  <td style="font-size:11px;color:var(--text-secondary)">${courseMap[o.course_id] || (o.course_id ? o.course_id.slice(0,8) + '…' : '—')}</td>
                  <td style="font-size:11.5px;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.notes || '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`
    }`;
}

function bindOutcomesActions(pt) {
  window._saveOutcome = async function() {
    const errEl = document.getElementById('oc-error');
    errEl.style.display = 'none';
    const score = parseFloat(document.getElementById('oc-score').value);
    const baseline = parseFloat(document.getElementById('oc-baseline').value);
    const data = {
      patient_id: pt.id,
      course_id: document.getElementById('oc-course').value || null,
      assessment_template_id: document.getElementById('oc-template').value || null,
      score: isNaN(score) ? null : score,
      baseline_score: isNaN(baseline) ? null : baseline,
      assessed_at: document.getElementById('oc-date').value || null,
      notes: document.getElementById('oc-notes').value.trim() || null,
    };
    if (!data.assessment_template_id) { errEl.textContent = 'Select an assessment.'; errEl.style.display = ''; return; }
    try {
      await api.recordOutcome(data);
      const [outcomes, courses] = await Promise.all([
        api.listOutcomes({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.listCourses({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
      ]);
      window._currentCourses = courses;
      document.getElementById('ptab-body').innerHTML = renderOutcomesTab(pt, outcomes, courses);
      bindOutcomesActions(pt);
    } catch (e) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; }
  };
}

// ── Phenotype tab ─────────────────────────────────────────────────────────────
function renderPhenotypeTab(pt, assigns, phenos) {
  const CONF_COLOR = { high: 'var(--teal)', moderate: 'var(--blue)', low: 'var(--amber)' };
  return `
    <div style="margin-bottom:14px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('new-pheno-form').style.display=''">+ Assign Phenotype</button>
    </div>
    <div id="new-pheno-form" style="display:none;margin-bottom:16px">
      ${cardWrap('Assign Phenotype', `
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">Phenotype</label>
              <select id="ph-id" class="form-control">
                <option value="">Select…</option>
                ${phenos.map(p => `<option value="${p.id}">${p.name || p.slug || p.id}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label class="form-label">Confidence</label>
              <select id="ph-conf" class="form-control">
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Rationale</label>
              <textarea id="ph-rationale" class="form-control" style="height:76px" placeholder="Clinical basis for this phenotype…"></textarea>
            </div>
            <div class="form-group" style="margin-top:8px">
              <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
                <input type="checkbox" id="ph-qeeg"> qEEG-supported
              </label>
            </div>
          </div>
        </div>
        <div id="ph-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="document.getElementById('new-pheno-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._savePhenotype()">Save Assignment</button>
        </div>
      `)}
    </div>
    ${assigns.length === 0
      ? emptyState('◎', 'No phenotype assignments yet.')
      : `<div style="display:flex;flex-direction:column;gap:8px">
          ${assigns.map(a => {
            const cc = CONF_COLOR[a.confidence] || 'var(--text-tertiary)';
            return `<div class="card" style="padding:14px 18px">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">${a.phenotype_id}</span>
                <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${cc}22;color:${cc}">${a.confidence}</span>
                ${a.qeeg_supported ? '<span style="font-size:10px;color:var(--teal)">qEEG ✓</span>' : ''}
                <button class="btn btn-sm" style="color:var(--red)" onclick="window._deletePheno('${a.id}')">Remove</button>
              </div>
              ${a.rationale ? `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary)">${a.rationale}</div>` : ''}
              <div style="margin-top:4px;font-size:11px;color:var(--text-tertiary)">${a.assigned_at ? a.assigned_at.split('T')[0] : ''}</div>
            </div>`;
          }).join('')}
        </div>`
    }`;
}

function bindPhenotypeActions(pt) {
  window._savePhenotype = async function() {
    const errEl = document.getElementById('ph-error');
    errEl.style.display = 'none';
    const phenotype_id = document.getElementById('ph-id').value;
    if (!phenotype_id) { errEl.textContent = 'Select a phenotype.'; errEl.style.display = ''; return; }
    const data = {
      patient_id: pt.id,
      phenotype_id,
      confidence: document.getElementById('ph-conf').value,
      rationale: document.getElementById('ph-rationale').value.trim() || null,
      qeeg_supported: document.getElementById('ph-qeeg').checked,
    };
    try {
      await api.assignPhenotype(data);
      const [assigns, phenos] = await Promise.all([
        api.listPhenotypeAssignments({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.phenotypes().then(r => r?.items || r || []).catch(() => []),
      ]);
      document.getElementById('ptab-body').innerHTML = renderPhenotypeTab(pt, assigns, phenos);
      bindPhenotypeActions(pt);
    } catch (e) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; }
  };

  window._deletePheno = async function(id) {
    if (!confirm('Remove this phenotype assignment?')) return;
    try {
      await api.deletePhenotypeAssignment(id);
      const [assigns, phenos] = await Promise.all([
        api.listPhenotypeAssignments({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []),
        api.phenotypes().then(r => r?.items || r || []).catch(() => []),
      ]);
      document.getElementById('ptab-body').innerHTML = renderPhenotypeTab(pt, assigns, phenos);
      bindPhenotypeActions(pt);
    } catch (e) {
      const errEl = document.getElementById('pheno-save-error');
      if (errEl) { errEl.textContent = e.message || 'Delete failed.'; errEl.style.display = ''; }
    }
  };
}

// ── Consent tab ───────────────────────────────────────────────────────────────
function renderConsentTab(pt, consents) {
  return `
    <div style="margin-bottom:14px;display:flex;gap:8px">
      <button class="btn btn-primary btn-sm" onclick="document.getElementById('new-consent-form').style.display=''">+ Add Consent Record</button>
    </div>
    <div id="new-consent-form" style="display:none;margin-bottom:16px">
      ${cardWrap('New Consent Record', `
        <div class="g2">
          <div>
            <div class="form-group"><label class="form-label">Consent Type</label>
              <select id="cn-type" class="form-control">
                <option value="general">General</option>
                <option value="off_label">Off-Label</option>
                <option value="research">Research</option>
              </select>
            </div>
            <div class="form-group"><label class="form-label">Modality (optional)</label>
              <input id="cn-modality" class="form-control" placeholder="e.g. tDCS, TMS">
            </div>
          </div>
          <div>
            <div class="form-group"><label class="form-label">Document Ref (URL/path)</label>
              <input id="cn-doc" class="form-control" placeholder="https://… or file path">
            </div>
            <div class="form-group"><label class="form-label">Notes</label>
              <textarea id="cn-notes" class="form-control" style="height:60px" placeholder="Optional notes…"></textarea>
            </div>
          </div>
        </div>
        <div class="form-group" style="margin-top:4px">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="cn-signed"> Mark as signed now
          </label>
        </div>
        <div id="cn-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm" onclick="document.getElementById('new-consent-form').style.display='none'">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._saveConsent()">Save Consent</button>
        </div>
      `)}
    </div>
    ${consents.length === 0
      ? emptyState('◇', 'No consent records yet.')
      : `<div style="display:flex;flex-direction:column;gap:8px">
          ${consents.map(c => `<div class="card" style="padding:14px 18px">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">${c.consent_type.replace(/_/g,' ')}${c.modality_slug ? ' · ' + c.modality_slug : ''}</span>
              ${c.signed
                ? '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(0,212,188,0.15);color:var(--teal)">Signed ✓</span>'
                : `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,171,0,0.15);color:var(--amber)">Unsigned</span>
                   <button class="btn btn-sm" onclick="window._signConsent('${c.id}')">Mark Signed</button>`}
            </div>
            ${c.signed_at ? `<div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">Signed: ${c.signed_at.split('T')[0]}</div>` : ''}
            ${c.document_ref ? `<div style="margin-top:4px;font-size:11px;color:var(--blue)">${c.document_ref}</div>` : ''}
            ${c.notes ? `<div style="margin-top:4px;font-size:12px;color:var(--text-secondary)">${c.notes}</div>` : ''}
            <div style="margin-top:4px;font-size:11px;color:var(--text-tertiary)">${c.created_at ? c.created_at.split('T')[0] : ''}</div>
          </div>`).join('')}
        </div>`
    }`;
}

function bindConsentActions(pt) {
  window._saveConsent = async function() {
    const errEl = document.getElementById('cn-error');
    errEl.style.display = 'none';
    const data = {
      patient_id: pt.id,
      consent_type: document.getElementById('cn-type').value,
      modality_slug: document.getElementById('cn-modality').value.trim() || null,
      document_ref: document.getElementById('cn-doc').value.trim() || null,
      notes: document.getElementById('cn-notes').value.trim() || null,
      signed: document.getElementById('cn-signed').checked,
    };
    try {
      await api.createConsent(data);
      const consents = await api.listConsents({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderConsentTab(pt, consents);
      bindConsentActions(pt);
    } catch (e) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; }
  };

  window._signConsent = async function(id) {
    try {
      await api.updateConsent(id, { signed: true });
      const consents = await api.listConsents({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      document.getElementById('ptab-body').innerHTML = renderConsentTab(pt, consents);
      bindConsentActions(pt);
    } catch (e) {
      const errEl = document.getElementById('consent-error');
      if (errEl) { errEl.textContent = e.message || 'Sign failed.'; errEl.style.display = ''; }
    }
  };
}

window.showNewSession = function() {
  document.getElementById('new-session-form').style.display = '';
};

window.saveSession = async function() {
  const errEl = document.getElementById('ns-error');
  errEl.style.display = 'none';
  const pt = window._currentPatient;
  if (!pt) return;
  const data = {
    patient_id: pt.id,
    scheduled_at: document.getElementById('ns-date').value,
    duration_minutes: parseInt(document.getElementById('ns-dur').value) || 30,
    modality: document.getElementById('ns-mod').value || null,
    session_number: parseInt(document.getElementById('ns-num').value) || 1,
    total_sessions: parseInt(document.getElementById('ns-total').value) || 10,
    billing_code: document.getElementById('ns-billing').value || null,
    status: 'scheduled',
  };
  if (!data.scheduled_at) { errEl.textContent = 'Date/time required.'; errEl.style.display = ''; return; }
  try {
    await api.createSession(data);
    window._nav('profile');
  } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
};

window.completeSession = async function(id) {
  try { await api.updateSession(id, { status: 'completed' }); window._nav('profile'); } catch (e) {
    const b = document.createElement('div');
    b.className = 'notice notice-warn';
    b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
    b.textContent = e.message || 'Update failed.';
    document.body.appendChild(b); setTimeout(() => b.remove(), 4000);
  }
};

window.exportProto = async function() {
  const pt = window._currentPatient;
  if (!pt || !savedProto) return;
  try {
    const blob = await api.exportProtocolDocx({
      condition_name: pt.primary_condition || 'Unknown',
      modality_name: pt.primary_modality || 'Unknown',
      device_name: '',
      setting: 'clinical',
      evidence_threshold: 'A',
      off_label: false,
      symptom_cluster: '',
    });
    downloadBlob(blob, `protocol-${pt.first_name}-${pt.last_name}.docx`);
  } catch (e) {
    const b = document.createElement('div');
    b.className = 'notice notice-warn';
    b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
    b.textContent = e.message || 'Export failed.';
    document.body.appendChild(b); setTimeout(() => b.remove(), 4000);
  }
};

// ── AI Zone ──────────────────────────────────────────────────────────────────
function renderAIZone(pt) {
  if (aiLoading) return `<div style="text-align:center;padding:32px 0">
    <div style="display:flex;justify-content:center;gap:5px;margin-bottom:16px">
      ${Array.from({ length: 5 }, (_, i) => `<div class="ai-dot" style="animation-delay:${i * .12}s"></div>`).join('')}
    </div>
    <div style="font-size:12.5px;color:var(--text-secondary)">Generating protocol from clinical data…</div>
  </div>`;

  if (aiResult) return `
    <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px">${aiResult.rationale?.split('.')[0] || 'Generated Protocol'}</div>
    <div style="font-size:11.5px;color:var(--teal);margin-bottom:14px">Evidence Grade: ${aiResult.evidence_grade || '—'} · ${aiResult.approval_status_badge || ''}</div>
    <div style="background:rgba(0,212,188,0.05);border:1px solid var(--border-teal);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;font-size:12px;color:var(--text-secondary);line-height:1.65">${aiResult.rationale || ''}</div>
    ${[
      ['Target Region', aiResult.target_region || '—'],
      ['Session Freq.', aiResult.session_frequency || '—'],
      ['Duration', aiResult.duration || '—'],
      ['Off-label', aiResult.off_label_review_required ? '⚠ Review required' : 'No'],
    ].map(([k, v]) => fr(k, `<span class="mono" style="color:var(--blue)">${v}</span>`)).join('')}
    ${aiResult.contraindications?.length ? `<div style="margin-top:10px;padding:10px;background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.2);border-radius:var(--radius-md);font-size:12px;color:var(--red)">⚠ Contraindications: ${aiResult.contraindications.join(', ')}</div>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-sm" onclick="window.resetAI()">Regenerate</button>
      <button class="btn btn-primary btn-sm" onclick="window.saveProtocol()">Save Protocol ✓</button>
    </div>`;

  const name = pt ? `${pt.first_name} ${pt.last_name}` : 'this patient';
  return `<div style="text-align:center;padding:22px 0">
    <div style="width:48px;height:48px;background:var(--teal-ghost);border:1px solid var(--border-teal);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:20px">🧬</div>
    <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:18px;line-height:1.65;max-width:300px;margin-left:auto;margin-right:auto">
      Generate an evidence-based protocol for <strong style="color:var(--text-primary)">${name}</strong> based on condition and modality.
    </div>
    <div class="g2" style="margin-bottom:16px;text-align:left">
      <div class="form-group"><label class="form-label">Condition</label>
        <select id="ai-condition" class="form-control">
          <option value="${pt?.primary_condition || ''}">${pt?.primary_condition || 'Select…'}</option>
          ${FALLBACK_CONDITIONS.map(c => `<option>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Modality</label>
        <select id="ai-modality" class="form-control">
          <option value="${pt?.primary_modality || ''}">${pt?.primary_modality || 'Select…'}</option>
          ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join('')}
        </select>
      </div>
    </div>
    <button class="btn btn-primary" onclick="window.runAI()" style="padding:10px 26px;font-size:13px">Generate Protocol ✦</button>
  </div>`;
}

function bindAI(pt) {
  window.runAI = async function() {
    aiLoading = true; aiResult = null;
    const z = document.getElementById('ai-gen-zone');
    if (z) z.innerHTML = renderAIZone(pt);
    const condition = document.getElementById('ai-condition')?.value || pt?.primary_condition || '';
    const modality = document.getElementById('ai-modality')?.value || pt?.primary_modality || '';
    try {
      const res = await api.generateProtocol({
        condition: condition,
        symptom_cluster: '',
        modality: modality,
        device: '',
        setting: 'clinical',
        evidence_threshold: 'B',
        off_label: false,
      });
      aiResult = res;
    } catch (e) {
      aiResult = { rationale: `Error: ${e.message}`, target_region: '—', evidence_grade: '—', approval_status_badge: 'error' };
    }
    aiLoading = false;
    const zz = document.getElementById('ai-gen-zone');
    if (zz) { zz.innerHTML = renderAIZone(pt); bindAI(pt); }
  };
  window.resetAI = function() {
    aiResult = null;
    const z = document.getElementById('ai-gen-zone');
    if (z) { z.innerHTML = renderAIZone(pt); bindAI(pt); }
  };
  window.saveProtocol = function() {
    savedProto = aiResult;
    window.switchPT('protocol');
  };
}

// ── Protocol Generator page ───────────────────────────────────────────────────
export function pgProtocols(setTopbar) {
  setTopbar('Protocol Intelligence', `<button class="btn btn-ghost btn-sm">My Protocols</button><button class="btn btn-primary btn-sm" onclick="window._nav('handbooks')">Handbooks →</button>`);
  const steps = ['Patient & Context', 'Modality & Type', 'Configure Parameters', 'Review & Generate'];
  return `
  <div style="display:flex;gap:8px;margin-bottom:22px;flex-wrap:wrap;align-items:center">
    ${steps.map((s, i) => `<div style="display:flex;align-items:center;gap:7px">
      <div class="step-dot ${i < proStep ? 'done' : i === proStep ? 'active' : 'idle'}">${i < proStep ? '✓' : i + 1}</div>
      <span style="font-size:12.5px;font-weight:${i === proStep ? 600 : 400};color:var(--${i === proStep ? 'text-primary' : 'text-tertiary'})">${s}</span>
      ${i < steps.length - 1 ? '<span style="color:var(--text-tertiary);margin:0 2px">›</span>' : ''}
    </div>`).join('')}
  </div>
  <div id="pro-step-body">${renderProStep()}</div>`;
}

function renderProStep() {
  if (proStep === 0) {
    const prefilledName = window._wizardPatientName ? `<div class="notice notice-info" style="margin-bottom:12px">Patient: <strong>${window._wizardPatientName}</strong></div>` : '';
    return `<div class="g2">
    ${cardWrap('Select Patient', `
      ${prefilledName}
      <div class="form-group">
        <label class="form-label">Patient</label>
        <select id="proto-patient" class="form-control">
          <option value="${window._wizardPatientId || ''}">${window._wizardPatientName || 'Loading patients…'}</option>
        </select>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Or <button class="btn btn-ghost btn-sm" onclick="window._nav('patients')">add a new patient →</button></div>
      <div id="wizard-pheno-note"></div>
    `)}
    ${cardWrap('Clinical Context', `
      <div class="form-group">
        <label class="form-label">Primary Diagnosis</label>
        <select id="proto-condition" class="form-control">
          <option value="">Loading conditions...</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Phenotype / Subtype</label>
        <select id="proto-phenotype" class="form-control">
          <option value="">Select condition first…</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Key Symptoms</label><input id="proto-key-symptoms" class="form-control" placeholder="e.g. anhedonia, fatigue, poor concentration"></div>
    `)}
  </div>
  <div style="text-align:right;margin-top:4px"><button class="btn btn-primary" onclick="window.nextStep()">Next: Modality & Type →</button></div>`;
  }

  if (proStep === 1) return `
    ${cardWrap('Select Modality', `
      <div id="modality-chips" style="display:flex;flex-wrap:wrap;padding:4px 0">
        ${[
          { l: 'tDCS', s: 'Transcranial DC' }, { l: 'TPS', s: 'Transcranial Pulse' },
          { l: 'TMS / rTMS', s: 'Magnetic' }, { l: 'taVNS', s: 'Transcutaneous VNS' },
          { l: 'CES', s: 'Cranial Electrotherapy' }, { l: 'Neurofeedback', s: 'qEEG-guided NFB' },
          { l: 'PBM', s: 'Photobiomodulation' }, { l: 'Multimodal', s: 'Combined' },
        ].map(m => `<div class="mod-chip ${selMods.includes(m.l) ? 'selected' : ''}" onclick="window.toggleMod('${m.l}')">${m.l} <span style="font-weight:400;font-size:10.5px;opacity:.6">· ${m.s}</span></div>`).join('')}
      </div>
      <div id="registry-modalities-loading" style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Loading modalities from registry…</div>
    `)}
    ${cardWrap('Matching Registry Protocols', `
      <div id="registry-protocols-list" style="font-size:12px;color:var(--text-secondary)">Select a modality above to see matching protocols.</div>
    `)}
    ${cardWrap('Protocol Type', `<div class="g3">
      ${[
        { t: 'evidence', l: 'Evidence-Based', s: 'Standard Clinical', d: 'Published RCT-derived protocols.', c: 'var(--blue)' },
        { t: 'offlabel', l: 'Off-Label', s: 'Extended Indication', d: 'Outside primary indication with case support.', c: 'var(--amber)' },
        { t: 'personalized', l: 'Personalized AI', s: 'Brain-Data Driven', d: 'Uses patient data to generate a bespoke protocol.', c: 'var(--teal)' },
      ].map(pt => `<div class="proto-type-card ${proType === pt.t ? 'selected' : ''}" onclick="window.selectProType('${pt.t}')">
        <div style="font-size:9.5px;letter-spacing:.8px;text-transform:uppercase;font-weight:600;margin-bottom:6px;color:${pt.c}">${pt.l}</div>
        <div class="proto-type-name">${pt.s}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-top:5px">${pt.d}</div>
      </div>`).join('')}
    </div>`)}
    <div style="display:flex;justify-content:space-between;margin-top:4px">
      <button class="btn" onclick="window.prevStep()">← Back</button>
      <button class="btn btn-primary" onclick="window.nextStep()">Next: Configure →</button>
    </div>`;

  if (proStep === 2) {
    // Use registry-preloaded parameters if available, otherwise fall back to defaults
    const rp = window._registryProtocol || {};
    const targetRegion = rp.Target_Region || '';
    const freqHz = rp.Frequency_Hz || '';
    const intensity = rp.Intensity || '2.0';
    const sessionDuration = rp.Session_Duration || '20';
    const sessPerWeek = rp.Sessions_per_Week || '';
    const totalCourse = rp.Total_Course || '10';
    const coilPlacement = rp.Coil_or_Electrode_Placement || '';
    const protocolBadge = rp.Protocol_Name
      ? `<div class="notice notice-info" style="margin-bottom:16px">
           Pre-filled from registry: <strong>${rp.Protocol_Name}</strong>
           ${rp.Evidence_Grade ? `<span style="margin-left:8px;font-size:11px;color:var(--teal)">${rp.Evidence_Grade}</span>` : ''}
         </div>`
      : '';
    return `<div>
    ${protocolBadge}
    <div class="g2">
    ${cardWrap('Stimulation Parameters', `
      <div class="form-group"><label class="form-label">Target Region</label>
        <input id="param-target-region" class="form-control" value="${targetRegion}" placeholder="e.g. DLPFC (F3/F4)">
      </div>
      <div class="form-group"><label class="form-label">Frequency (Hz)</label>
        <input id="param-frequency" class="form-control" type="text" value="${freqHz}" placeholder="e.g. 10">
      </div>
      <div class="form-group"><label class="form-label">Intensity (mA)</label>
        <input id="param-intensity" class="form-control" type="text" value="${intensity}" placeholder="e.g. 2.0">
      </div>
      <div class="form-group"><label class="form-label">Duration per Session (min)</label>
        <input id="param-duration" class="form-control" type="number" value="${sessionDuration}">
      </div>
      <div class="form-group"><label class="form-label">Sessions per Week</label>
        <input id="param-sessions-per-week" class="form-control" type="text" value="${sessPerWeek}" placeholder="e.g. 5">
      </div>
      <div class="form-group"><label class="form-label">Total Course Sessions</label>
        <input id="param-total-course" class="form-control" type="text" value="${totalCourse}" placeholder="e.g. 20–30">
      </div>
    `)}
    <div>
      ${cardWrap('Coil / Electrode Placement', `
        <div class="form-group"><label class="form-label">Placement</label>
          <input id="param-coil-placement" class="form-control" value="${coilPlacement}" placeholder="e.g. F3 (Left DLPFC)">
        </div>
        <div class="form-group"><label class="form-label">Ramp Up/Down (s)</label><input id="param-ramp" class="form-control" type="number" value="30"></div>
        <div class="form-group"><label class="form-label">Electrode Size</label><select id="param-electrode-size" class="form-control"><option>25 cm² (5×5)</option><option>35 cm² standard</option><option>Custom</option></select></div>
      `)}
      ${cardWrap('Scheduling & Notes', `
        <div class="form-group"><label class="form-label">Planned Start Date</label>
          <input id="param-start-date" class="form-control" type="date" value="${new Date().toISOString().slice(0,10)}">
        </div>
        <div class="form-group"><label class="form-label">Concurrent interventions</label><input id="param-concurrent" class="form-control" placeholder="e.g. CBT, physiotherapy"></div>
        <div class="form-group"><label class="form-label">Clinician Notes</label>
          <textarea id="param-clinician-notes" class="form-control" rows="3" placeholder="Clinical rationale, patient-specific considerations, contraindication context…"></textarea>
        </div>
        <div class="form-group"><label class="form-label">Evidence threshold</label>
          <select class="form-control"><option value="A">EV-A (Strong RCT)</option><option value="B">EV-B (Moderate)</option><option value="C">EV-C (Emerging)</option></select>
        </div>
      `)}
    </div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:4px">
      <button class="btn" onclick="window.prevStep()">← Back</button>
      <button class="btn btn-primary" onclick="window.nextStep()">Review & Generate →</button>
    </div></div>`;
  }

  if (proStep === 3) {
    const rp = window._registryProtocol || {};
    const protocolId = rp.Protocol_ID || rp.id || '';
    const hasProto = !!protocolId;
    return `<div id="proto-review">
    ${hasProto
      ? `<div class="notice notice-info" style="margin-bottom:16px">
           <strong>Registry Protocol:</strong> ${rp.Protocol_Name || rp.name || protocolId}
           ${rp.Evidence_Grade ? `· <span style="color:var(--teal)">${rp.Evidence_Grade}</span>` : ''}
           ${rp.On_Label_vs_Off_Label?.toLowerCase().startsWith('on') ? '' : ' · <span style="color:var(--amber)">Off-label</span>'}
         </div>`
      : `<div class="notice notice-warn" style="margin-bottom:16px">No registry protocol selected. Go back to Step 2 and click a protocol card.</div>`
    }
    <div style="display:flex;gap:8px;justify-content:space-between">
      <button class="btn" onclick="window.prevStep()">← Back</button>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" onclick="window.generateProtoAPI()">Generate DOCX only</button>
        <button class="btn btn-primary" onclick="window.createTreatmentCourse()" id="gen-btn" ${hasProto ? '' : 'disabled'}>Create Treatment Course ◎</button>
      </div>
    </div>
    <div id="proto-result" style="margin-top:20px"></div>
  </div>`;
  }

  return '';
}

// ── Registry integration for Protocol Wizard ──────────────────────────────────
async function loadProtocolWizardRegistry() {
  // 1. Populate conditions dropdown
  try {
    const condData = await api.conditions();
    const condEl = document.getElementById('proto-condition');
    if (condEl && condData) {
      const items = condData.items || condData || [];
      if (items.length > 0) {
        condEl.innerHTML = `<option value="">Select condition…</option>` +
          items.map(c => `<option value="${c.id || c.Condition_ID || c.name}">${c.name || c.Condition_Name || c.id}</option>`).join('');
      } else {
        // Fallback static list if API returns empty
        condEl.innerHTML = `<option value="">Select condition…</option>` +
          FALLBACK_CONDITIONS.map(c => `<option>${c}</option>`).join('');
      }
    }

    // When condition changes, load phenotypes
    if (condEl) {
      condEl.addEventListener('change', async () => {
        const condId = condEl.value;
        const phenoEl = document.getElementById('proto-phenotype');
        if (!condId || !phenoEl) return;
        phenoEl.innerHTML = `<option value="">Loading phenotypes…</option>`;
        try {
          const phenoData = await api.phenotypes({ condition_id: condId });
          const phenoItems = phenoData?.items || phenoData || [];
          phenoEl.innerHTML = phenoItems.length > 0
            ? `<option value="">Select phenotype…</option>` +
              phenoItems.map(p => `<option value="${p.id || p.Phenotype_ID || p.name}">${p.name || p.Phenotype_Name || p.id}</option>`).join('')
            : `<option value="">No phenotypes found</option>`;
        } catch {
          phenoEl.innerHTML = `<option value="">Phenotypes unavailable</option>`;
        }
      });
    }
  } catch {
    const condEl = document.getElementById('proto-condition');
    if (condEl) {
      condEl.innerHTML = `<option value="">Select condition…</option>` +
        FALLBACK_CONDITIONS.map(c => `<option>${c}</option>`).join('');
    }
  }

  // 2. Load modalities from registry (supplement hardcoded chips)
  try {
    const modData = await api.modalities();
    const loadingEl = document.getElementById('registry-modalities-loading');
    if (loadingEl) {
      const modItems = modData?.items || modData || [];
      loadingEl.textContent = modItems.length > 0
        ? `${modItems.length} modalities loaded from registry.`
        : 'Registry modalities unavailable — using defaults.';
      setTimeout(() => { if (loadingEl) loadingEl.style.display = 'none'; }, 2000);
    }
  } catch {
    const loadingEl = document.getElementById('registry-modalities-loading');
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// Load matching protocols for condition+modality selection (Step 1)
async function loadMatchingProtocols(conditionId, modalityLabel) {
  const listEl = document.getElementById('registry-protocols-list');
  if (!listEl) return;
  if (!conditionId && !modalityLabel) {
    listEl.innerHTML = `<span style="color:var(--text-tertiary)">Select a condition and modality to see matching protocols.</span>`;
    return;
  }
  listEl.innerHTML = `<span style="color:var(--text-tertiary)">Loading…</span>`;
  try {
    const params = {};
    if (conditionId) params.condition_id = conditionId;
    if (modalityLabel) params.modality = modalityLabel;
    const data = await api.protocols(params);
    const items = data?.items || [];
    if (items.length === 0) {
      listEl.innerHTML = `<span style="color:var(--text-tertiary)">No registry protocols found for this combination.</span>`;
      return;
    }
    listEl.innerHTML = items.map(p => `
      <div style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;cursor:pointer;transition:border-color var(--transition)"
           onmouseover="this.style.borderColor='var(--border-teal)'" onmouseout="this.style.borderColor='var(--border)'"
           onclick="window.selectRegistryProtocol(${JSON.stringify(p).replace(/"/g,'&quot;')})">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;color:var(--text-primary);flex:1">${p.Protocol_Name || p.name || ''}</span>
          ${p.Evidence_Grade ? `<span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;background:rgba(0,212,188,0.1);color:var(--teal)">${p.Evidence_Grade}</span>` : ''}
          ${p.On_Label_vs_Off_Label?.includes('On-label') ? `<span style="font-size:10px;color:var(--teal)">On-label</span>` : `<span style="font-size:10px;color:var(--amber)">Off-label</span>`}
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap">
          ${p.Target_Region ? `<span>Target: ${p.Target_Region}</span>` : ''}
          ${p.Sessions_per_Week ? `<span>${p.Sessions_per_Week}×/wk</span>` : ''}
          ${p.Total_Course ? `<span>${p.Total_Course} total</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch {
    listEl.innerHTML = `<span style="color:var(--text-tertiary)">Registry protocols unavailable.</span>`;
  }
}

export function bindProtoPage() {
  window.nextStep = () => { if (proStep < 3) { proStep++; document.getElementById('pro-step-body').innerHTML = renderProStep(); bindProtoPage(); } };
  window.prevStep = () => { if (proStep > 0) { proStep--; document.getElementById('pro-step-body').innerHTML = renderProStep(); bindProtoPage(); } };
  window.toggleMod = m => {
    if (selMods.includes(m)) selMods = selMods.filter(x => x !== m); else selMods.push(m);
    document.getElementById('pro-step-body').innerHTML = renderProStep();
    bindProtoPage();
    // After re-render, trigger protocol list refresh
    const condEl = document.getElementById('proto-condition');
    const condId = condEl ? condEl.value : '';
    loadMatchingProtocols(condId, selMods[0] || '');
  };
  window.selectProType = t => { proType = t; document.getElementById('pro-step-body').innerHTML = renderProStep(); bindProtoPage(); };

  // Handle registry protocol selection from Step 1 list
  window.selectRegistryProtocol = function(proto) {
    window._registryProtocol = proto;
    // Auto-advance to Step 2 (Configure Parameters) with pre-filled data
    proStep = 2;
    document.getElementById('pro-step-body').innerHTML = renderProStep();
    bindProtoPage();
  };
  window.generateProtoAPI = async () => {
    const btn = document.getElementById('gen-btn');
    if (btn) btn.disabled = true;
    const res = document.getElementById('proto-result');
    if (res) res.innerHTML = spinner();
    try {
      const result = await api.generateProtocol({
        condition: 'Major Depressive Disorder',
        symptom_cluster: '',
        modality: selMods[0] || 'tDCS',
        device: '',
        setting: 'clinical',
        evidence_threshold: 'B',
        off_label: proType === 'offlabel',
      });
      if (res) res.innerHTML = cardWrap('Generated Protocol', `
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:14px">${result?.rationale || 'No rationale returned.'}</div>
        ${fr('Target Region', result?.target_region || '—')}
        ${fr('Evidence Grade', result?.evidence_grade || '—')}
        ${fr('Session Frequency', result?.session_frequency || '—')}
        ${fr('Approval Badge', result?.approval_status_badge || '—')}
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn btn-primary btn-sm" onclick="window.exportGeneratedProto()">Download DOCX</button>
        </div>
      `);
      window._lastProtoResult = result;
    } catch (e) {
      if (res) res.innerHTML = `<div class="notice notice-warn">${e.message}</div>`;
    }
    if (btn) btn.disabled = false;
  };
  window.exportGeneratedProto = async () => {
    try {
      const blob = await api.exportProtocolDocx({ condition_name: 'Protocol', modality_name: selMods[0] || 'tDCS', device_name: '', setting: 'clinical', evidence_threshold: 'B', off_label: false, symptom_cluster: '' });
      downloadBlob(blob, 'protocol.docx');
    } catch (e) {
      const r = document.getElementById('proto-result');
      if (r) r.innerHTML = `<div class="notice notice-warn">${e.message || 'Export failed.'}</div>`;
    }
  };

  // Create treatment course from registry protocol
  window.createTreatmentCourse = async function() {
    const btn = document.getElementById('gen-btn');
    const res = document.getElementById('proto-result');
    const rp = window._registryProtocol || {};
    const protocolId = rp.Protocol_ID || rp.id || '';
    if (!protocolId) { if (res) res.innerHTML = `<div class="notice notice-warn">No registry protocol selected.</div>`; return; }

    const patientEl = document.getElementById('proto-patient');
    const patientId = patientEl?.value || window._wizardPatientId || '';
    if (!patientId) { if (res) res.innerHTML = `<div class="notice notice-warn">Please select a patient first (Step 1).</div>`; return; }

    if (btn) btn.disabled = true;
    if (res) res.innerHTML = spinner();
    try {
      const startDate  = document.getElementById('param-start-date')?.value || '';
      const concurrent = document.getElementById('param-concurrent')?.value?.trim() || '';
      const noteText   = document.getElementById('param-clinician-notes')?.value?.trim() || '';
      const keySymptoms = document.getElementById('proto-key-symptoms')?.value?.trim() || '';
      const phenoEl    = document.getElementById('proto-phenotype');
      const phenotypeId = phenoEl?.value || null;

      // Compose clinician_notes: start date + concurrent + symptoms + freetext
      const noteParts = [];
      if (startDate)    noteParts.push(`Planned start: ${startDate}`);
      if (keySymptoms)  noteParts.push(`Key symptoms: ${keySymptoms}`);
      if (concurrent)   noteParts.push(`Concurrent: ${concurrent}`);
      if (noteText)     noteParts.push(noteText);
      const clinicianNotes = noteParts.length ? noteParts.join('\n') : null;

      const course = await api.createCourse({
        patient_id: patientId,
        protocol_id: protocolId,
        phenotype_id: phenotypeId || undefined,
        clinician_notes: clinicianNotes,
      });
      const govWarn = course.governance_warnings?.length
        ? `<div class="notice notice-warn" style="margin-top:10px">⚠ Governance flags:<br>${course.governance_warnings.join('<br>')}</div>`
        : '';
      if (res) res.innerHTML = `
        <div class="card" style="padding:20px">
          <div style="color:var(--green);font-size:13px;font-weight:600;margin-bottom:8px">✓ Treatment Course Created</div>
          <div style="font-size:12px;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px">
            <div>Status: <strong style="color:var(--amber)">${course.status?.replace(/_/g,' ')}</strong></div>
            <div>Protocol: ${rp.Protocol_Name || protocolId}</div>
            <div>Sessions: ${course.planned_sessions_total} total · ${course.planned_sessions_per_week}×/wk</div>
            ${course.planned_frequency_hz ? `<div>Frequency: ${course.planned_frequency_hz} Hz</div>` : ''}
            ${course.planned_intensity ? `<div>Intensity: ${course.planned_intensity}</div>` : ''}
            ${startDate ? `<div>Planned start: ${startDate}</div>` : ''}
            ${course.review_required ? `<div style="color:var(--amber);margin-top:4px">Review required before activation.</div>` : ''}
          </div>
          ${govWarn}
          <div style="margin-top:14px;display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="window._nav('courses')">View Treatment Courses</button>
            ${course.review_required ? `<button class="btn btn-sm" onclick="window._nav('review-queue')">Go to Review Queue</button>` : ''}
          </div>
        </div>`;
    } catch (e) {
      if (res) res.innerHTML = `<div class="notice notice-warn">${e.message || 'Failed to create course.'}</div>`;
    }
    if (btn) btn.disabled = false;
  };

  // Load registry data for Step 0 (conditions) and Step 1 (modalities + protocols)
  if (proStep === 0) {
    // Defer slightly so DOM is ready
    setTimeout(async () => {
      await loadProtocolWizardRegistry();
      // Also load patients for patient selector
      try {
        const pts = await api.listPatients();
        const patEl = document.getElementById('proto-patient');
        if (patEl && pts?.items?.length) {
          patEl.innerHTML = `<option value="">Select patient…</option>` +
            pts.items.map(p => `<option value="${p.id}" ${p.id === window._wizardPatientId ? 'selected' : ''}>${p.first_name} ${p.last_name}</option>`).join('');
        }
        // Wire patient selector onchange → load phenotype note live
        const patEl2 = document.getElementById('proto-patient');
        if (patEl2) {
          async function loadWizardPhenoNote(patientId) {
            const phNote = document.getElementById('wizard-pheno-note');
            if (!phNote || !patientId) { if (phNote) phNote.innerHTML = ''; return; }
            phNote.innerHTML = `<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Loading phenotype…</div>`;
            try {
              const assigns = await api.listPhenotypeAssignments({ patient_id: patientId }).then(r => r?.items || []).catch(() => []);
              if (assigns.length > 0) {
                const latest = assigns[0];
                phNote.innerHTML = `<div class="notice notice-info" style="margin-top:8px;font-size:12px">
                  Phenotype on file: <strong>${latest.phenotype_id}</strong>
                  (${latest.confidence || '?'} confidence${latest.qeeg_supported ? ', qEEG-supported' : ''})
                  <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px" onclick="window.switchPT && window.switchPT('phenotype')">Edit</button>
                </div>`;
              } else {
                phNote.innerHTML = `<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">No phenotype assigned for this patient.</div>`;
              }
            } catch { phNote.innerHTML = ''; }
          }
          patEl2.addEventListener('change', (e) => loadWizardPhenoNote(e.target.value));
          // Load for pre-filled patient
          if (window._wizardPatientId) loadWizardPhenoNote(window._wizardPatientId);
        }
      } catch {}
    }, 50);
  }
  if (proStep === 1) {
    // Load modalities from registry and wire condition→protocol refresh
    setTimeout(async () => {
      await loadProtocolWizardRegistry();
      // If launched from Protocol Registry with a pre-selected protocol, auto-load it
      if (window._wizardProtocolId) {
        const listEl = document.getElementById('registry-protocols-list');
        if (listEl) listEl.innerHTML = `<span style="color:var(--text-tertiary)">Loading protocol ${window._wizardProtocolId}…</span>`;
        try {
          const proto = await api.protocolDetail(window._wizardProtocolId);
          if (proto && listEl) {
            listEl.innerHTML = `<div style="padding:10px 12px;border:2px solid var(--border-teal);border-radius:var(--radius-md);background:rgba(0,212,188,0.04)">
              <div style="font-size:12px;font-weight:600;color:var(--teal);margin-bottom:4px">Pre-selected from Registry</div>
              <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${proto.name || proto.id}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${proto.condition_id || ''} · ${proto.modality_id || ''} · ${proto.evidence_grade || ''}</div>
              <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="window.selectRegistryProtocol(${JSON.stringify(proto).replace(/"/g,'&quot;')})">Use this Protocol →</button>
              <button class="btn btn-sm" style="margin-top:10px;margin-left:8px" onclick="window._wizardProtocolId=null;document.getElementById('registry-protocols-list').innerHTML='<span style=\'color:var(--text-tertiary)\'>Select a condition to browse protocols.</span>'">Clear</button>
            </div>`;
          }
        } catch { window._wizardProtocolId = null; }
      } else {
        // If a condition was already chosen in step 0, fetch matching protocols now
        const condEl = document.getElementById('proto-condition');
        if (condEl && condEl.value) {
          loadMatchingProtocols(condEl.value, selMods[0] || '');
        }
      }
    }, 50);
  }
}

// ── Assessments ───────────────────────────────────────────────────────────────
const ASSESS_TEMPLATES = [
  { id: 'PHQ-9', t: 'PHQ-9 Depression Scale', sub: 'Patient health questionnaire, 9-item', tags: ['depression', 'outcome'],
    max: 27, inline: true,
    questions: [
      'Little interest or pleasure in doing things',
      'Feeling down, depressed, or hopeless',
      'Trouble falling or staying asleep, or sleeping too much',
      'Feeling tired or having little energy',
      'Poor appetite or overeating',
      'Feeling bad about yourself — or that you are a failure',
      'Trouble concentrating on things',
      'Moving or speaking so slowly that other people could notice (or the opposite)',
      'Thoughts that you would be better off dead, or of hurting yourself',
    ],
    options: ['Not at all (0)', 'Several days (1)', 'More than half the days (2)', 'Nearly every day (3)'],
    interpret: (s) => s <= 4 ? { label: 'Minimal', color: 'var(--teal)' } : s <= 9 ? { label: 'Mild', color: '#60a5fa' } : s <= 14 ? { label: 'Moderate', color: '#f59e0b' } : s <= 19 ? { label: 'Moderately Severe', color: '#f97316' } : { label: 'Severe', color: 'var(--red)' },
  },
  { id: 'GAD-7', t: 'GAD-7 Anxiety Scale', sub: 'Generalised anxiety disorder, 7-item', tags: ['anxiety', 'outcome'],
    max: 21, inline: true,
    questions: [
      'Feeling nervous, anxious, or on edge',
      'Not being able to stop or control worrying',
      'Worrying too much about different things',
      'Trouble relaxing',
      'Being so restless that it is hard to sit still',
      'Becoming easily annoyed or irritable',
      'Feeling afraid as if something awful might happen',
    ],
    options: ['Not at all (0)', 'Several days (1)', 'More than half the days (2)', 'Nearly every day (3)'],
    interpret: (s) => s <= 4 ? { label: 'Minimal', color: 'var(--teal)' } : s <= 9 ? { label: 'Mild', color: '#60a5fa' } : s <= 14 ? { label: 'Moderate', color: '#f59e0b' } : { label: 'Severe', color: 'var(--red)' },
  },
  { id: 'ISI', t: 'Insomnia Severity Index', sub: 'Sleep quality assessment, 7-item', tags: ['insomnia', 'CES'],
    max: 28, inline: true,
    questions: [
      'Severity of sleep onset problem',
      'Severity of sleep maintenance problem',
      'Problem waking up too early',
      'How SATISFIED/dissatisfied are you with your current sleep pattern?',
      'How NOTICEABLE to others is your sleep problem?',
      'How WORRIED/distressed are you about your sleep problem?',
      'To what extent does your sleep problem INTERFERE with your daily functioning?',
    ],
    options: ['None/Very satisfied (0)', 'Mild (1)', 'Moderate (2)', 'Severe (3)', 'Very severe/Dissatisfied (4)'],
    interpret: (s) => s <= 7 ? { label: 'No clinically significant insomnia', color: 'var(--teal)' } : s <= 14 ? { label: 'Subthreshold insomnia', color: '#60a5fa' } : s <= 21 ? { label: 'Moderate clinical insomnia', color: '#f59e0b' } : { label: 'Severe clinical insomnia', color: 'var(--red)' },
  },
  { id: 'NRS-Pain', t: 'Numeric Pain Rating Scale', sub: 'Pain intensity 0–10', tags: ['pain', 'tDCS'],
    max: 10, inline: false },
  { id: 'PCL-5', t: 'PTSD Checklist (PCL-5)', sub: 'PTSD symptom scale, 20-item', tags: ['PTSD', 'taVNS'],
    max: 80, inline: false },
  { id: 'ADHD-RS-5', t: 'ADHD Rating Scale', sub: 'Executive function and attention assessment', tags: ['ADHD', 'NFB'],
    max: 54, inline: false },
  { id: 'DASS-21', t: 'DASS-21', sub: 'Depression, Anxiety and Stress Scales', tags: ['depression', 'anxiety'],
    max: 63, inline: false },
  { id: 'UPDRS-III', t: 'UPDRS-III Motor Assessment', sub: "Parkinson's motor function", tags: ['PD', 'TPS'],
    max: 108, inline: false },
];

export async function pgAssess(setTopbar) {
  setTopbar('Assessments', `<button class="btn btn-primary btn-sm" onclick="window.showAssessModal()">+ Run Assessment</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [];
  try { const res = await api.listAssessments(); items = res?.items || []; } catch {}

  const templates = ASSESS_TEMPLATES;

  el.innerHTML = `
  <div id="assess-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:none;align-items:center;justify-content:center">
    <div style="background:var(--navy-850);border:1px solid var(--border);border-radius:var(--radius-xl);padding:24px;width:440px;max-height:80vh;overflow-y:auto">
      <h3 style="font-family:var(--font-display);margin-bottom:16px">Run Assessment</h3>
      <div class="form-group"><label class="form-label">Template</label>
        <select id="assess-template" class="form-control">
          ${templates.map(t => `<option value="${t.id}">${t.t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label class="form-label">Patient ID (optional)</label>
        <input id="assess-patient" class="form-control" placeholder="Patient ID or leave blank">
      </div>
      <div class="form-group"><label class="form-label">Score / Result</label>
        <input id="assess-score" class="form-control" type="number" placeholder="e.g. 14">
      </div>
      <div class="form-group"><label class="form-label">Notes</label>
        <textarea id="assess-notes" class="form-control" placeholder="Clinician notes…"></textarea>
      </div>
      <div id="assess-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button class="btn" onclick="document.getElementById('assess-modal').style.display='none'">Cancel</button>
        <button class="btn btn-primary" onclick="window.saveAssessment()">Save Assessment</button>
      </div>
    </div>
  </div>

  <div class="tab-bar" style="margin-bottom:20px">
    <button class="tab-btn active" id="tab-templates" onclick="window.switchAssessTab('templates')">Templates</button>
    <button class="tab-btn" id="tab-records" onclick="window.switchAssessTab('records')">Records (${items.length})</button>
  </div>

  <div id="assess-templates-view">
    <div class="g3">
      ${templates.map(a => `<div class="card" style="margin-bottom:0">
        <div class="card-body">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:5px">${a.t}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.55">${a.sub} · max ${a.max}</div>
          <div style="margin-bottom:12px">${a.tags.map(t => tag(t)).join('')}</div>
          <div style="display:flex;gap:6px">
            ${a.inline ? `<button class="btn btn-primary btn-sm" onclick="window.runInline('${a.id}')">Run Inline ↗</button>` : ''}
            <button class="btn btn-sm" onclick="window.runTemplate('${a.id}')">Enter Score</button>
          </div>
        </div>
      </div>`).join('')}
    </div>
  </div>

  <div id="assess-inline-view" style="display:none;max-width:680px">
    <div class="card">
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px">
          <button class="btn btn-sm" onclick="window.switchAssessTab('templates')">← Back</button>
          <div id="inline-title" style="font-family:var(--font-display);font-size:15px;font-weight:600;flex:1"></div>
          <div id="inline-score-badge" style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--teal);min-width:48px;text-align:right">0</div>
        </div>
        <div id="inline-interpret" style="font-size:12px;font-weight:600;margin-bottom:18px;padding:6px 10px;border-radius:var(--radius-sm);background:rgba(var(--teal-rgb,0,200,150),.08);display:inline-block"></div>
        <div id="inline-questions"></div>
        <div class="form-group" style="margin-top:16px"><label class="form-label">Patient ID (optional)</label>
          <input id="inline-patient" class="form-control" placeholder="Patient ID">
        </div>
        <div class="form-group"><label class="form-label">Clinician Notes</label>
          <textarea id="inline-notes" class="form-control" rows="2" placeholder="Optional notes…"></textarea>
        </div>
        <div id="inline-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
        <button class="btn btn-primary" onclick="window.saveInlineAssess()">Save Assessment →</button>
      </div>
    </div>
  </div>

  <div id="assess-records-view" style="display:none">
    ${items.length === 0
      ? emptyState('◧', 'No assessments recorded yet.')
      : cardWrap('Assessment Records', `<table class="ds-table">
        <thead><tr><th>Template</th><th>Date</th><th>Score</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>${items.map(a => `<tr>
          <td style="font-weight:500">${a.template_title || a.template_id}</td>
          <td style="color:var(--text-tertiary)">${a.created_at?.split('T')[0] || '—'}</td>
          <td class="mono" style="color:var(--teal)">${a.score ?? '—'}</td>
          <td>${pillSt(a.status)}</td>
          <td style="font-size:12px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.clinician_notes || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`)}
  </div>`;

  let _inlineTpl = null;
  let _inlineAnswers = [];

  window.showAssessModal = function() { document.getElementById('assess-modal').style.display = 'flex'; };
  window.runTemplate = function(id) {
    document.getElementById('assess-modal').style.display = 'flex';
    document.getElementById('assess-template').value = id;
  };
  window.switchAssessTab = function(tab) {
    document.getElementById('assess-templates-view').style.display = (tab === 'templates') ? '' : 'none';
    document.getElementById('assess-inline-view').style.display = (tab === 'inline') ? '' : 'none';
    document.getElementById('assess-records-view').style.display = (tab === 'records') ? '' : 'none';
    document.getElementById('tab-templates').classList.toggle('active', tab === 'templates');
    document.getElementById('tab-records').classList.toggle('active', tab === 'records');
  };
  window.runInline = function(id) {
    _inlineTpl = templates.find(t => t.id === id);
    if (!_inlineTpl) return;
    _inlineAnswers = new Array(_inlineTpl.questions.length).fill(0);
    document.getElementById('inline-title').textContent = _inlineTpl.t;
    document.getElementById('inline-error').style.display = 'none';
    document.getElementById('inline-patient').value = '';
    document.getElementById('inline-notes').value = '';
    const qEl = document.getElementById('inline-questions');
    qEl.innerHTML = _inlineTpl.questions.map((q, qi) => `
      <div style="margin-bottom:14px;padding:12px;background:rgba(0,0,0,0.2);border-radius:var(--radius-md);border:1px solid var(--border)">
        <div style="font-size:12.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.5">
          <span style="color:var(--teal);font-weight:600;font-family:var(--font-mono)">${qi + 1}.</span> ${q}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${_inlineTpl.options.map((opt, vi) => `
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11.5px;padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--border);background:rgba(0,0,0,0.15)">
              <input type="radio" name="q${qi}" value="${vi}" onchange="window._inlineChange(${qi},${vi})" ${vi === 0 ? 'checked' : ''}>
              ${opt}
            </label>`).join('')}
        </div>
      </div>`).join('');
    window._updateInlineScore();
    // switch views
    document.getElementById('assess-templates-view').style.display = 'none';
    document.getElementById('assess-inline-view').style.display = '';
    document.getElementById('assess-records-view').style.display = 'none';
    document.getElementById('tab-templates').classList.remove('active');
    document.getElementById('tab-records').classList.remove('active');
  };
  window._inlineChange = function(qi, val) {
    _inlineAnswers[qi] = val;
    window._updateInlineScore();
  };
  window._updateInlineScore = function() {
    if (!_inlineTpl) return;
    const total = _inlineAnswers.reduce((a, b) => a + b, 0);
    document.getElementById('inline-score-badge').textContent = total;
    const interp = _inlineTpl.interpret(total);
    const interpEl = document.getElementById('inline-interpret');
    interpEl.textContent = interp.label;
    interpEl.style.color = interp.color;
    interpEl.style.borderLeft = `3px solid ${interp.color}`;
    interpEl.style.background = `${interp.color}15`;
  };
  window.saveInlineAssess = async function() {
    const errEl = document.getElementById('inline-error');
    errEl.style.display = 'none';
    if (!_inlineTpl) return;
    const total = _inlineAnswers.reduce((a, b) => a + b, 0);
    const patientId = document.getElementById('inline-patient').value.trim() || null;
    const notes = document.getElementById('inline-notes').value.trim() || null;
    const interp = _inlineTpl.interpret(total);
    const data = {
      template_id: _inlineTpl.id,
      template_title: _inlineTpl.t,
      patient_id: patientId,
      data: Object.fromEntries(_inlineAnswers.map((v, i) => [`q${i + 1}`, v])),
      clinician_notes: notes ? `${interp.label} (${total}/${_inlineTpl.max}). ${notes}` : `${interp.label} (${total}/${_inlineTpl.max})`,
      score: String(total),
      status: 'completed',
    };
    try {
      const assessment = await api.createAssessment(data);
      if (patientId) {
        try {
          const coursesRes = await api.listCourses({ patient_id: patientId, status: 'active' });
          const activeCourses = coursesRes?.items || [];
          if (activeCourses.length > 0) {
            await api.recordOutcome({
              patient_id: patientId,
              course_id: activeCourses[0].id,
              template_id: _inlineTpl.id,
              template_title: _inlineTpl.t,
              score: String(total),
              score_numeric: total,
              measurement_point: 'mid',
              assessment_id: assessment?.id || null,
            });
          }
        } catch (_) { /* best-effort */ }
      }
      window._nav('assessments');
    } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
  };
  window.saveAssessment = async function() {
    const errEl = document.getElementById('assess-error');
    errEl.style.display = 'none';
    const tid = document.getElementById('assess-template').value;
    const ttemplate = templates.find(t => t.id === tid);
    const patientId = document.getElementById('assess-patient').value || null;
    const scoreRaw = document.getElementById('assess-score').value;
    const scoreNum = parseFloat(scoreRaw) || null;
    const data = {
      template_id: tid,
      template_title: ttemplate?.t || tid,
      patient_id: patientId,
      data: {},
      clinician_notes: document.getElementById('assess-notes').value || null,
      score: scoreNum !== null ? String(scoreNum) : null,
      status: 'completed',
    };
    try {
      const assessment = await api.createAssessment(data);
      // Auto-link to active course if patient has one
      if (patientId && scoreNum !== null) {
        try {
          const coursesRes = await api.listCourses({ patient_id: patientId, status: 'active' });
          const activeCourses = coursesRes?.items || [];
          if (activeCourses.length > 0) {
            await api.recordOutcome({
              patient_id: patientId,
              course_id: activeCourses[0].id,
              template_id: tid,
              template_title: ttemplate?.t || tid,
              score: String(scoreNum),
              score_numeric: scoreNum,
              measurement_point: 'mid',
              assessment_id: assessment?.id || null,
            });
          }
        } catch (_) { /* outcome linkage is best-effort */ }
      }
      document.getElementById('assess-modal').style.display = 'none';
      window._nav('assessments');
    } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
  };

  // Auto-launch inline assessment if navigated from patient profile
  if (window._assessPreFillTemplate && window._assessPreFillPatient) {
    const tplId = window._assessPreFillTemplate;
    const patId = window._assessPreFillPatient;
    window._assessPreFillTemplate = null;
    window._assessPreFillPatient = null;
    setTimeout(() => {
      window.runInline && window.runInline(tplId);
      const patientInput = document.getElementById('inline-patient');
      if (patientInput) patientInput.value = patId;
    }, 50);
  }
}

// ── AI Charting ───────────────────────────────────────────────────────────────
export function pgChart(setTopbar) {
  setTopbar('AI Charting', `<button class="btn btn-primary btn-sm">+ New Session Note</button>`);
  let chatHistory = [
    { role: 'assistant', content: 'Hello! I am your AI charting assistant. Select a patient and session type, then describe what happened and I will generate a clinical note.' }
  ];
  setTimeout(() => bindChat(chatHistory), 50);
  return `<div class="g2">
    ${cardWrap('AI Charting Assistant ✦', `
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <input id="chart-patient" class="form-control" style="flex:1" placeholder="Patient name or ID">
        <select id="chart-type" class="form-control" style="flex:1">
          <option>tDCS Session Note</option><option>TPS Session Note</option><option>taVNS Session Note</option>
          <option>Neurofeedback Note</option><option>Progress Note</option><option>Intake Note</option>
        </select>
      </div>
      <div style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;background:rgba(0,0,0,0.2)">
        <div id="chart-messages" style="height:300px;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:4px">
          <div class="bubble bubble-in">${chatHistory[0].content}</div>
        </div>
        <div style="padding:10px 12px;border-top:1px solid var(--border);display:flex;gap:8px;background:rgba(0,0,0,0.15)">
          <input id="chart-input" class="form-control" placeholder="Describe the session…" style="flex:1" onkeydown="if(event.key==='Enter')window.sendChart()">
          <button class="btn btn-primary btn-sm" onclick="window.sendChart()">Send →</button>
        </div>
      </div>
    `)}
    ${cardWrap('Note Preview', `
      <div id="chart-preview" style="background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;min-height:200px;font-size:12.5px;color:var(--text-primary);line-height:1.7">
        <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.7px;color:var(--teal);font-weight:600;margin-bottom:10px">Generated Note</div>
        <div id="chart-note-content" style="color:var(--text-secondary)">Your AI-generated note will appear here after the conversation.</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-primary btn-sm" onclick="window.signNote()">Save & Sign ✓</button>
        <button class="btn btn-sm" onclick="window.copyNote()">Copy Note</button>
      </div>
    `)}
  </div>`;
}

function bindChat(chatHistory) {
  window.sendChart = async function() {
    const input = document.getElementById('chart-input');
    const msgs = document.getElementById('chart-messages');
    if (!input || !msgs) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    chatHistory.push({ role: 'user', content: text });
    msgs.innerHTML += `<div class="bubble bubble-out">${text}</div>`;
    msgs.scrollTop = msgs.scrollHeight;
    try {
      const patient = document.getElementById('chart-patient')?.value || '';
      const type = document.getElementById('chart-type')?.value || 'Session Note';
      const res = await api.chatClinician(chatHistory, { patient_name: patient, note_type: type });
      const reply = res?.reply || 'No response received.';
      chatHistory.push({ role: 'assistant', content: reply });
      msgs.innerHTML += `<div class="bubble bubble-in">${reply}</div>`;
      msgs.scrollTop = msgs.scrollHeight;
      const noteEl = document.getElementById('chart-note-content');
      if (noteEl) noteEl.textContent = reply;
    } catch (e) {
      msgs.innerHTML += `<div class="bubble bubble-in" style="color:var(--red)">Error: ${e.message}</div>`;
    }
  };
  window.signNote = function() {
    const btn = document.querySelector('[onclick="window.signNote()"]');
    if (btn) { btn.textContent = '✓ Signed'; btn.disabled = true; btn.style.opacity = '0.7'; }
  };
  window.copyNote = function() {
    const note = document.getElementById('chart-note-content')?.textContent;
    if (!note) return;
    navigator.clipboard.writeText(note).then(() => {
      const btn = document.querySelector('[onclick="window.copyNote()"]');
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = orig, 1500); }
    });
  };
}

// ── Brain Data Vault ───────────────────────────────────────────────────────────
export async function pgBrainData(setTopbar) {
  setTopbar('Brain Data Vault', `<button class="btn btn-primary btn-sm" onclick="window._showQEEGForm()">+ Log qEEG Record</button><button class="btn btn-sm" onclick="window._nav('qeegmaps')">Reference Maps →</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let records = [];
  let patients = [];
  try {
    [records, patients] = await Promise.all([
      api.listQEEGRecords().then(r => r?.items || []).catch(() => []),
      api.listPatients().then(r => r?.items || []).catch(() => []),
    ]);
  } catch {}

  const patMap = {};
  patients.forEach(p => { patMap[p.id] = `${p.first_name} ${p.last_name}`; });

  el.innerHTML = `
  <div class="g4" style="margin-bottom:20px">
    ${[
      { l: 'qEEG Records', v: records.length || '—', d: 'logged recordings' },
      { l: 'Patients with qEEG', v: new Set(records.map(r => r.patient_id)).size || '—', d: 'unique patients' },
      { l: 'Resting State', v: records.filter(r => r.recording_type === 'resting').length || '—', d: 'resting recordings' },
      { l: 'Latest Recording', v: records[0]?.recording_date || '—', d: 'most recent date' },
    ].map(m => `<div class="metric-card"><div class="metric-label">${m.l}</div><div class="metric-value">${m.v}</div><div class="metric-delta">${m.d}</div></div>`).join('')}
  </div>

  <div id="qeeg-form-panel" style="display:none;margin-bottom:16px">
    ${cardWrap('Log qEEG Recording', `
      <div class="g2" style="margin-bottom:12px">
        <div>
          <div class="form-group"><label class="form-label">Patient</label>
            <select id="qr-patient" class="form-control">
              <option value="">Select patient…</option>
              ${patients.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">Recording Type</label>
            <select id="qr-type" class="form-control">
              <option value="resting">Resting State</option>
              <option value="task">Task-based</option>
              <option value="sleep">Sleep</option>
              <option value="ictal">Ictal / Event</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Recording Date</label>
            <input id="qr-date" class="form-control" type="date">
          </div>
        </div>
        <div>
          <div class="form-group"><label class="form-label">Equipment</label>
            <input id="qr-equip" class="form-control" placeholder="e.g. NeuroGuide 19ch, Emotiv EPOC">
          </div>
          <div class="form-group"><label class="form-label">Eyes Condition</label>
            <select id="qr-eyes" class="form-control">
              <option value="eyes_closed">Eyes closed</option>
              <option value="eyes_open">Eyes open</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Summary / Findings</label>
            <textarea id="qr-notes" class="form-control" placeholder="Key EEG findings, abnormalities, LORETA summary…" rows="3"></textarea>
          </div>
        </div>
      </div>
      <div id="qr-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button class="btn" onclick="document.getElementById('qeeg-form-panel').style.display='none'">Cancel</button>
        <button class="btn btn-primary" onclick="window._saveQEEGRecord()">Save Record</button>
      </div>
    `)}
  </div>

  <div class="g2">
    ${cardWrap('qEEG Band Preview', `
      <div style="display:flex;gap:6px;margin-bottom:14px">
        ${['alpha', 'theta', 'beta'].map(b => `<button class="btn btn-sm ${eegBand === b ? 'btn-primary' : ''}" onclick="window.switchBand('${b}')">${b.charAt(0).toUpperCase() + b.slice(1)}</button>`).join('')}
      </div>
      <div style="background:rgba(0,0,0,0.3);border-radius:var(--radius-md);padding:12px" id="eeg-svg">${brainMapSVG(eegBand)}</div>
      <div style="display:flex;gap:14px;justify-content:center;margin-top:12px">
        ${['Low', 'Mid', 'High'].map(l => `<div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:${l === 'Low' ? '#1a3d6e' : l === 'Mid' ? '#2d7fe0' : '#4a9eff'}"></div><span style="font-size:10.5px;color:var(--text-secondary)">${l}</span></div>`).join('')}
      </div>
    `)}
    ${cardWrap('Recorded qEEG Files', `
      ${records.length === 0
        ? emptyState('◈', 'No qEEG records yet. Click "+ Log qEEG Record" to add the first recording.')
        : `<div style="display:flex;flex-direction:column;gap:8px">
            ${records.map(r => `
              <div id="qrec-${r.id}" style="padding:12px;border:1px solid var(--border);border-radius:8px;transition:border-color var(--transition)">
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1;cursor:pointer" onclick="window._toggleQEEGRecord('${r.id}')">${patMap[r.patient_id] || r.patient_id}</span>
                  <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:var(--teal-ghost);color:var(--teal)">${r.recording_type}</span>
                  <span style="font-size:11px;color:var(--text-tertiary)">${r.recording_date || '—'}</span>
                  <span style="font-size:11px;padding:2px 7px;border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-tertiary)">${r.eyes_condition?.replace('_',' ') || ''}</span>
                  <button class="btn btn-sm" style="font-size:10px" onclick="window._interpretQEEG('${r.id}','${r.patient_id}')">Interpret ✦</button>
                  <button class="btn btn-sm" style="font-size:10px" onclick="window._toggleQEEGRecord('${r.id}')">Detail ↓</button>
                </div>
                ${r.equipment ? `<div style="margin-top:5px;font-size:11.5px;color:var(--text-secondary)">Equipment: ${r.equipment}</div>` : ''}
                ${r.summary_notes ? `<div style="margin-top:5px;font-size:11.5px;color:var(--text-secondary);font-style:italic">${r.summary_notes.slice(0,120)}${r.summary_notes.length > 120 ? '…' : ''}</div>` : ''}
                <div id="qrec-expand-${r.id}" style="display:none;margin-top:12px;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid var(--border)">
                  <div style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--teal);font-weight:600;margin-bottom:10px">Record Detail</div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:12px">
                    ${[
                      ['Recording Date', r.recording_date || '—'],
                      ['Type', r.recording_type || '—'],
                      ['Eyes', r.eyes_condition?.replace(/_/g,' ') || '—'],
                      ['Equipment', r.equipment || '—'],
                      ['Patient ID', r.patient_id || '—'],
                      ['Record ID', r.id?.slice(0,8) + '…' || '—'],
                    ].map(([k,v]) => `<div><span style="color:var(--text-tertiary)">${k}:</span> <span style="color:var(--text-primary)">${v}</span></div>`).join('')}
                  </div>
                  <div style="margin-bottom:10px">
                    <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Summary / Findings</label>
                    <textarea id="qrec-notes-${r.id}" class="form-control" rows="3" style="font-size:12px">${r.summary_notes || ''}</textarea>
                  </div>
                  <div id="qrec-edit-err-${r.id}" style="display:none;color:var(--red);font-size:12px;margin-bottom:6px"></div>
                  <div style="display:flex;gap:8px">
                    <button class="btn btn-primary btn-sm" onclick="window._saveQEEGNotes('${r.id}')">Save Notes</button>
                    <button class="btn btn-sm" onclick="window._toggleQEEGRecord('${r.id}')">Close</button>
                  </div>
                </div>
                <div id="interp-${r.id}" style="display:none;margin-top:10px;padding:10px;background:rgba(0,212,188,0.04);border-radius:6px;border:1px solid var(--border-teal)"></div>
              </div>`).join('')}
          </div>`
      }
    `)}
  </div>`;

  bindBrainData();
}

export function bindBrainData() {
  window.switchBand = function(b) {
    eegBand = b;
    const el = document.getElementById('eeg-svg');
    if (el) el.innerHTML = brainMapSVG(b);
    document.querySelectorAll('#content .btn-sm').forEach(btn => {
      if (['Alpha', 'Theta', 'Beta'].includes(btn.textContent)) {
        btn.className = 'btn btn-sm' + (btn.textContent.toLowerCase() === b ? ' btn-primary' : '');
      }
    });
  };

  window._showQEEGForm = () => {
    document.getElementById('qeeg-form-panel').style.display = '';
  };

  window._interpretQEEG = async function(recordId, patientId) {
    const panel = document.getElementById('interp-' + recordId);
    if (!panel) return;
    // Toggle
    if (panel.style.display !== 'none' && panel.innerHTML) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    panel.innerHTML = '<span style="font-size:11px;color:var(--text-secondary)">Loading biomarker interpretation…</span>';
    try {
      const [pt, condMap, biomarkers] = await Promise.all([
        api.getPatient(patientId).catch(() => null),
        api.listQEEGConditionMap().then(r => r?.items || r || []).catch(() => []),
        api.listQEEGBiomarkers().then(r => r?.items || r || []).catch(() => []),
      ]);
      const condition = pt?.primary_condition || '';
      // Find matching condition entries (case-insensitive partial match)
      const condLower = condition.toLowerCase();
      const matching = condMap.filter(c => {
        const cName = (c.condition_name || c.condition || '').toLowerCase();
        return condLower && (cName.includes(condLower.split(' ')[0]) || condLower.includes(cName.split(' ')[0]));
      });
      // Build biomarker lookup
      const bMap = {};
      biomarkers.forEach(b => { bMap[b.biomarker_id || b.id] = b; });

      if (matching.length === 0) {
        panel.innerHTML = '<div style="font-size:11px;color:var(--text-tertiary)">No condition-specific biomarker map found for: <em>' + (condition || 'unknown condition') + '</em>. Add condition to patient profile for interpretation.</div>';
        return;
      }
      panel.innerHTML = `
        <div style="font-size:11px;font-weight:600;color:var(--teal);margin-bottom:8px">Biomarker Interpretation · ${condition}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${matching.slice(0, 8).map(c => {
            const b = bMap[c.biomarker_id] || {};
            const bandColor = { alpha:'var(--blue)', theta:'var(--violet)', beta:'var(--teal)', delta:'var(--amber)', gamma:'var(--red)' };
            const bc = bandColor[(b.band || '').toLowerCase()] || 'var(--text-tertiary)';
            return `<div style="display:flex;gap:10px;align-items:flex-start;padding:6px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${bc}22;color:${bc};flex-shrink:0;margin-top:1px">${b.band || c.band || '?'}</span>
              <div>
                <div style="font-size:11.5px;font-weight:500;color:var(--text-primary)">${b.biomarker_name || c.biomarker_id || '—'}</div>
                <div style="font-size:10.5px;color:var(--text-secondary);margin-top:1px">${c.clinical_relevance || b.description || '—'}</div>
              </div>
            </div>`;
          }).join('')}
        </div>`;
    } catch (e) {
      panel.innerHTML = '<div style="font-size:11px;color:var(--red)">Interpretation failed: ' + (e.message || 'error') + '</div>';
    }
  };

  window._toggleQEEGRecord = function(id) {
    const panel = document.getElementById(`qrec-expand-${id}`);
    const card  = document.getElementById(`qrec-${id}`);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : '';
    if (card) card.style.borderColor = isOpen ? 'var(--border)' : 'var(--border-teal)';
  };

  window._saveQEEGNotes = async function(id) {
    const errEl = document.getElementById(`qrec-edit-err-${id}`);
    if (errEl) errEl.style.display = 'none';
    const notes = document.getElementById(`qrec-notes-${id}`)?.value || null;
    try {
      await api.updateQEEGRecord(id, { summary_notes: notes });
      // Close expand panel and show brief success
      const panel = document.getElementById(`qrec-expand-${id}`);
      if (panel) {
        panel.innerHTML = `<div style="color:var(--teal);font-size:12.5px;padding:8px 0">✓ Notes saved.</div>`;
        setTimeout(() => { panel.style.display = 'none'; }, 1200);
      }
      const card = document.getElementById(`qrec-${id}`);
      if (card) card.style.borderColor = 'var(--border)';
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Save failed.'; errEl.style.display = ''; }
    }
  };

  window._saveQEEGRecord = async function() {
    const errEl = document.getElementById('qr-error');
    errEl.style.display = 'none';
    const patientId = document.getElementById('qr-patient')?.value;
    if (!patientId) { errEl.textContent = 'Select a patient.'; errEl.style.display = 'block'; return; }
    try {
      await api.createQEEGRecord({
        patient_id: patientId,
        recording_type: document.getElementById('qr-type')?.value || 'resting',
        recording_date: document.getElementById('qr-date')?.value || null,
        equipment: document.getElementById('qr-equip')?.value || null,
        eyes_condition: document.getElementById('qr-eyes')?.value || null,
        summary_notes: document.getElementById('qr-notes')?.value || null,
      });
      await pgBrainData(setTopbar);
    } catch (e) {
      errEl.textContent = e.message || 'Save failed.';
      errEl.style.display = 'block';
    }
  };

  window.runCaseSummary = async function() {
    const res = document.getElementById('case-summary-result');
    if (res) res.innerHTML = spinner();
    try {
      const result = await api.caseSummary({ uploads: [] });
      if (res) res.innerHTML = cardWrap('Case Summary', `
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.7;margin-bottom:12px">
          ${result?.presenting_symptoms?.length ? `<strong>Symptoms:</strong> ${result.presenting_symptoms.join(', ')}<br>` : ''}
          ${result?.possible_targets?.length ? `<strong>Possible Targets:</strong> ${result.possible_targets.join(', ')}<br>` : ''}
          ${result?.suggested_modalities?.length ? `<strong>Suggested Modalities:</strong> ${result.suggested_modalities.join(', ')}` : 'Upload documents to generate a case summary.'}
        </div>
        ${result?.red_flags?.length ? `<div class="notice notice-warn">⚠ Red flags: ${result.red_flags.join(', ')}</div>` : ''}
      `);
    } catch (e) {
      if (res) res.innerHTML = `<div class="notice notice-warn">${e.message}</div>`;
    }
  };
}
