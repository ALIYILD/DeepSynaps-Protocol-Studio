const fs = require('fs');
const filePath = 'C:/Users/yildi/DeepSynaps-Protocol-Studio/apps/web/src/pages-clinical.js';

let src = fs.readFileSync(filePath, 'utf8');
src = src.replace(/\r\n/g, '\n');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Extend data loading: add allCourses + enrichment helpers + summary stats
// ─────────────────────────────────────────────────────────────────────────────
const OLD_LOAD = `  let items = [], conditions = [], modalities = [];
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
      el.innerHTML = \`<div class="notice notice-warn">Could not load patients.</div>\`;
      return;
    }
  } catch (e) {
    el.innerHTML = \`<div class="notice notice-warn">Could not load patients: \${e.message}</div>\`;
    return;
  }`;

if (!src.includes(OLD_LOAD)) { console.error('ERROR: anchor 1 (OLD_LOAD) not found'); process.exit(1); }

const NEW_LOAD = `  let items = [], conditions = [], modalities = [], allCourses = [];
  try {
    const [patientsRes, condRes, modRes, coursesRes] = await Promise.all([
      api.listPatients().catch(() => null),
      api.conditions().catch(() => null),
      api.modalities().catch(() => null),
      (api.listCourses ? api.listCourses({}) : Promise.resolve(null)).catch(() => null),
    ]);
    items      = patientsRes?.items || [];
    conditions = condRes?.items     || [];
    modalities = modRes?.items      || [];
    allCourses = coursesRes?.items  || [];
    if (!patientsRes) {
      el.innerHTML = \`<div class="notice notice-warn">Could not load patients.</div>\`;
      return;
    }
  } catch (e) {
    el.innerHTML = \`<div class="notice notice-warn">Could not load patients: \${e.message}</div>\`;
    return;
  }

  // ── Enrich patients with course data + attention signals ─────────────────
  const _coursesByPat = {};
  for (const c of allCourses) {
    if (!c.patient_id) continue;
    (_coursesByPat[c.patient_id] = _coursesByPat[c.patient_id] || []).push(c);
  }
  function _patCourseStats(p) {
    const cs = _coursesByPat[p.id] || [];
    return {
      activeCourses: cs.filter(c => c.status === 'active' || c.status === 'in_progress'),
      sessTotal: cs.reduce((n, c) => n + (c.total_sessions || c.session_count || 0), 0),
      sessDone:  cs.reduce((n, c) => n + (c.completed_sessions || c.sessions_done || 0), 0),
    };
  }
  function _patAttention(p) {
    const { activeCourses } = _patCourseStats(p);
    if (p.outcome_trend === 'worsened')               return { type:'outcome',    label:'\\u2B07 Worsened',        color:'var(--red)'           };
    if (p.has_adverse_event || p.adverse_event_flag)  return { type:'ae',         label:'\\u26A0 Side Effect',      color:'var(--red)'           };
    if (p.needs_review || p.review_overdue)           return { type:'review',     label:'\\u25C9 Needs Review',     color:'var(--amber)'         };
    if (p.assessment_overdue || p.missing_assessment) return { type:'assessment', label:'\\u270E Assessment Due',   color:'var(--amber)'         };
    if (activeCourses.length && p.last_session_date) {
      const d = Math.floor((Date.now() - new Date(p.last_session_date)) / 86400000);
      if (d >= 14) return { type:'missed', label: d + 'd no session', color:'var(--amber)' };
    }
    if (p.wearable_disconnected)                      return { type:'wearable',   label:'\\u25CC Wearable Off',     color:'var(--text-tertiary)' };
    if (p.home_adherence != null && p.home_adherence < 0.5) return { type:'adherence', label: Math.round(p.home_adherence * 100) + '% adherence', color:'var(--amber)' };
    if (p.call_requested)                             return { type:'call',       label:'\\u260F Call Req.',        color:'var(--blue)'          };
    return null;
  }
  const _statActive = items.filter(p => p.status === 'active').length;
  const _statReview = items.filter(p => p.needs_review || p.review_overdue).length;
  const _statAlerts = items.filter(p => { const a = _patAttention(p); return a && (a.type === 'outcome' || a.type === 'ae'); }).length;
  const _statAssess = items.filter(p => p.assessment_overdue || p.missing_assessment).length;
  const _statToday  = items.reduce((n, p) => n + (p.sessions_today || 0), 0);`;

src = src.replace(OLD_LOAD, NEW_LOAD);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Replace filter bar + table HTML with summary chips + roster
//    (uses indexOf/slice to avoid template-literal evaluation in patch script)
// ─────────────────────────────────────────────────────────────────────────────
const FILT_START = '\n  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">\n    <input class="form-control" id="pt-search"';
const FILT_END   = '\n  <!-- AI Intake Parser -->';

const filtStartIdx = src.indexOf(FILT_START);
const filtEndIdx   = src.indexOf(FILT_END);
if (filtStartIdx === -1) { console.error('ERROR: FILT_START not found'); process.exit(1); }
if (filtEndIdx   === -1) { console.error('ERROR: FILT_END not found');   process.exit(1); }

// Build new roster HTML — these ${...} ARE evaluated at patch time to build the JS source string
// so we concatenate carefully using normal string ops
const ROSTER_HTML = '\n'
  + '  <!-- Summary Chips -->\n'
  + '  <div class="pat-summary-chips" id="pat-summary-chips">\n'
  + '    <div class="pat-chip pat-chip--active" onclick="window._patSetQuick(\'active\')" style="cursor:pointer"><span class="pat-chip-val">${_statActive}</span><span class="pat-chip-lbl">Active Patients</span></div>\n'
  + '    <div class="pat-chip pat-chip--review" onclick="window._patSetQuick(\'review\')" style="cursor:pointer"><span class="pat-chip-val">${_statReview}</span><span class="pat-chip-lbl">Needs Review</span></div>\n'
  + '    <div class="pat-chip pat-chip--alert"  onclick="window._patSetQuick(\'alert\')"  style="cursor:pointer"><span class="pat-chip-val">${_statAlerts}</span><span class="pat-chip-lbl">Active Alerts</span></div>\n'
  + '    <div class="pat-chip pat-chip--assess"><span class="pat-chip-val">${_statAssess}</span><span class="pat-chip-lbl">Overdue Assess.</span></div>\n'
  + '    <div class="pat-chip"><span class="pat-chip-val">${_statToday}</span><span class="pat-chip-lbl">Sessions Today</span></div>\n'
  + '    <div class="pat-chip" style="margin-left:auto"><span class="pat-chip-val">${items.length}</span><span class="pat-chip-lbl">Total</span></div>\n'
  + '  </div>\n'
  + '\n'
  + '  <!-- Enhanced Filter Bar -->\n'
  + '  <div class="pat-filter-bar">\n'
  + '    <input class="form-control" id="pt-search" placeholder="Search name, condition, email\u2026" style="flex:1;min-width:180px" oninput="window.filterPatients()">\n'
  + '    <div class="pat-quick-chips">\n'
  + '      <button class="pat-qchip pat-qchip--on" id="ptq-all"    onclick="window._patSetQuick(\'all\')">All <span>${items.length}</span></button>\n'
  + '      <button class="pat-qchip" id="ptq-review" onclick="window._patSetQuick(\'review\')">Review <span>${_statReview}</span></button>\n'
  + '      <button class="pat-qchip" id="ptq-alert"  onclick="window._patSetQuick(\'alert\')">Alerts <span>${_statAlerts}</span></button>\n'
  + '      <button class="pat-qchip" id="ptq-active" onclick="window._patSetQuick(\'active\')">Active <span>${_statActive}</span></button>\n'
  + '    </div>\n'
  + '    <select class="form-control" id="pt-status-filter" style="width:130px;flex-shrink:0" onchange="window.filterPatients()">\n'
  + '      <option value="">All Status</option>\n'
  + '      <option value="active">Active</option>\n'
  + '      <option value="pending">Pending</option>\n'
  + '      <option value="inactive">Inactive</option>\n'
  + '      <option value="completed">Completed</option>\n'
  + '    </select>\n'
  + '    <select class="form-control" id="pt-modality-filter" style="width:150px;flex-shrink:0" onchange="window.filterPatients()">\n'
  + '      <option value="">All Modalities</option>\n'
  + '      ${FALLBACK_MODALITIES.map(m => `<option>${m}</option>`).join(\'\')}\n'
  + '    </select>\n'
  + '    <span id="pt-count" style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${items.length} patients</span>\n'
  + '  </div>\n'
  + '\n'
  + '  <!-- Patient Roster -->\n'
  + '  <div id="pat-roster">${\n'
  + '    items.length === 0\n'
  + '      ? emptyState(\'\\u{1F465}\', \'No patients yet\', canAddPatient ? \'Add your first patient to get started.\' : \'\', canAddPatient ? \'+ Add Patient\' : null, canAddPatient ? \'window.showAddPatient()\' : null)\n'
  + '      : items.map(p => _patCard(p, _patAttention(p), _patCourseStats(p), canTransfer)).join(\'\')\n'
  + '  }</div>\n';

src = src.slice(0, filtStartIdx) + ROSTER_HTML + src.slice(filtEndIdx);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Replace window._patientsData + window.filterPatients
// ─────────────────────────────────────────────────────────────────────────────
const FP_START = '  window._patientsData = items;\n\n  window.filterPatients = function() {';
const FP_END   = '  window.showAddPatient = function() {';

const fpStartIdx = src.indexOf(FP_START);
const fpEndIdx   = src.indexOf(FP_END);
if (fpStartIdx === -1) { console.error('ERROR: FP_START not found'); process.exit(1); }
if (fpEndIdx   === -1) { console.error('ERROR: FP_END not found');   process.exit(1); }

const NEW_FP = `  window._patientsData    = items;
  window._patQuickFilter  = 'all';

  // ── Patient card renderer ─────────────────────────────────────────────────
  function _patCard(p, att, cs, canTransferFlag) {
    att = att || _patAttention(p);
    cs  = cs  || _patCourseStats(p);
    const name    = (p.first_name || '') + ' ' + (p.last_name || '');
    const age     = p.dob ? Math.floor((Date.now() - new Date(p.dob)) / 31557600000) + 'y' : '';
    const progPct = cs.sessTotal ? Math.round((cs.sessDone / cs.sessTotal) * 100) : 0;
    const attBadge = att
      ? '<span class="pat-att-badge" style="color:' + att.color + ';border-color:' + att.color + '33;background:' + att.color + '0d">' + att.label + '</span>'
      : '<span class="pat-att-badge pat-att-badge--ok">\u2713 On Track</span>';
    const courseInfo = cs.activeCourses.length
      ? '<span class="pat-course-info">' + cs.activeCourses.length + ' active course' + (cs.activeCourses.length > 1 ? 's' : '') + '</span>'
      : '<span class="pat-course-info pat-course-info--none">No active course</span>';
    const progressBar = cs.sessTotal
      ? '<div class="pat-prog-row"><div class="pat-prog-track"><div class="pat-prog-fill" style="width:' + progPct + '%"></div></div><span class="pat-prog-lbl">' + cs.sessDone + '/' + cs.sessTotal + ' sessions</span></div>'
      : '';
    const lastSess = p.last_session_date ? '<span class="pat-last-sess">Last: ' + p.last_session_date + '</span>' : '';
    const statusColor = { active: 'var(--green)', pending: 'var(--amber)', inactive: 'var(--text-tertiary)', completed: 'var(--blue)' }[p.status] || 'var(--text-tertiary)';
    const condTag  = p.primary_condition ? '<span class="tag" style="font-size:10.5px">' + p.primary_condition + '</span>' : '';
    const modTag   = p.primary_modality  ? '<span class="tag" style="font-size:10.5px">' + p.primary_modality  + '</span>' : '';
    const ageSpan  = age ? ' <span class="pat-card-age">' + age + '</span>' : '';
    const transferBtn = canTransferFlag
      ? '<button class="pat-act-btn" onclick="window._transferPatient(\'' + p.id + '\',\'' + name.replace(/'/g, "\\'") + '\')">Transfer</button>'
      : '';
    return '<div class="pat-roster-card" data-id="' + p.id + '" data-status="' + p.status + '" data-attention="' + (att ? att.type : 'ok') + '" onclick="window.openPatient(\'' + p.id + '\')">'
      + '<div class="pat-card-left">'
      +   '<div class="pat-card-avatar">'
      +     '<span class="pat-status-dot" style="background:' + statusColor + '"></span>'
      +     initials(name)
      +   '</div>'
      + '</div>'
      + '<div class="pat-card-main">'
      +   '<div class="pat-card-name">' + name + ageSpan + '</div>'
      +   '<div class="pat-card-meta">' + condTag + modTag + ' ' + courseInfo + '</div>'
      +   progressBar
      +   lastSess
      + '</div>'
      + '<div class="pat-card-signals">' + attBadge + '</div>'
      + '<div class="pat-card-actions" onclick="event.stopPropagation()">'
      +   '<button class="pat-act-btn pat-act-btn--primary" onclick="window.openPatient(\'' + p.id + '\')">Open Chart</button>'
      +   '<button class="pat-act-btn" onclick="window._patStartSession(\'' + p.id + '\')">Start Session</button>'
      +   '<button class="pat-act-btn" onclick="window._nav(\'virtual-care\')">Virtual Care</button>'
      +   '<button class="pat-act-btn" onclick="window._patAddNote(\'' + p.id + '\')">Add Note</button>'
      +   transferBtn
      + '</div>'
      + '</div>';
  }
  window._patCard = _patCard;

  window._patSetQuick = function(type) {
    window._patQuickFilter = type;
    document.querySelectorAll('.pat-qchip').forEach(b => b.classList.toggle('pat-qchip--on', b.id === 'ptq-' + type));
    window.filterPatients();
  };

  window._patStartSession = function(id) {
    window._selectedPatientId = id;
    window._profilePatientId  = id;
    window._nav('patient-profile');
  };

  window._patAddNote = function(id) {
    window._selectedPatientId = id;
    window._profilePatientId  = id;
    window._nav('patient-profile');
  };

  window.filterPatients = function() {
    const q     = (document.getElementById('pt-search')?.value || '').toLowerCase();
    const st    = document.getElementById('pt-status-filter')?.value  || '';
    const mod   = document.getElementById('pt-modality-filter')?.value || '';
    const quick = window._patQuickFilter || 'all';
    const all   = window._patientsData || [];

    const vis = all.filter(p => {
      const name  = ((p.first_name || '') + ' ' + (p.last_name || '')).toLowerCase();
      const matchQ   = !q   || name.includes(q) || (p.primary_condition || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q);
      const matchSt  = !st  || p.status === st;
      const matchMod = !mod || (p.primary_modality || '') === mod;
      let   matchQ2  = true;
      if (quick === 'active') matchQ2 = p.status === 'active';
      if (quick === 'review') matchQ2 = !!(p.needs_review || p.review_overdue);
      if (quick === 'alert')  { const a = _patAttention(p); matchQ2 = !!(a && (a.type === 'outcome' || a.type === 'ae')); }
      return matchQ && matchSt && matchMod && matchQ2;
    });

    const countEl  = document.getElementById('pt-count');
    const rosterEl = document.getElementById('pat-roster');
    if (countEl)  countEl.textContent = vis.length + ' of ' + all.length + ' patients';
    if (rosterEl) rosterEl.innerHTML  = vis.length
      ? vis.map(p => _patCard(p, _patAttention(p), _patCourseStats(p), canTransfer)).join('')
      : \`<div style="text-align:center;padding:48px 24px;color:var(--text-tertiary)"><div style="font-size:28px;margin-bottom:8px">&#9670;</div>No patients match the current filters.</div>\`;
  };

  `;

src = src.slice(0, fpStartIdx) + NEW_FP + src.slice(fpEndIdx);

// Convert back to CRLF and write
src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, src, 'utf8');
console.log('Patch applied successfully.');
