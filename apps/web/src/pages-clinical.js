import { api, downloadBlob } from './api.js';
import { cardWrap, fr, evBar, pillSt, initials, tag, spinner, emptyState, spark, brainMapSVG } from './helpers.js';
import { currentUser } from './auth.js';

// ── Shared state for patient profile ────────────────────────────────────────
export let ptab = 'overview';
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

// ── Dashboard ────────────────────────────────────────────────────────────────
export async function pgDash(setTopbar, navigate) {
  setTopbar('Dashboard', `<button class="btn btn-ghost btn-sm">Export</button><button class="btn btn-primary btn-sm" onclick="window._nav('protocols')">+ New Protocol</button>`);

  let patCount = '—', activeCoursesCount = '—', pendingReviewCount = '—', deliveredCount = '—';
  try {
    const [pts, courses, queue] = await Promise.all([
      api.listPatients().catch(() => null),
      api.listCourses().catch(() => null),
      api.listReviewQueue({ status: 'pending' }).catch(() => null),
    ]);
    if (pts) patCount = pts.total ?? pts.items?.length ?? '—';
    if (courses) {
      const items = courses.items || [];
      activeCoursesCount = items.filter(c => c.status === 'active').length;
      deliveredCount = items.reduce((sum, c) => sum + (c.sessions_delivered || 0), 0);
    }
    if (queue) pendingReviewCount = queue.total ?? queue.items?.length ?? '—';
  } catch {}

  return `
  <div class="g4">
    ${[
      { l: 'Active Patients', v: patCount, d: 'from your client list' },
      { l: 'Active Courses', v: activeCoursesCount, d: 'ongoing treatment courses' },
      { l: 'Sessions Delivered', v: deliveredCount, d: 'across all courses' },
      { l: 'Pending Reviews', v: pendingReviewCount, d: 'awaiting approval' },
    ].map(m => `<div class="metric-card"><div class="metric-label">${m.l}</div><div class="metric-value">${m.v}</div><div class="metric-delta">${m.d}</div></div>`).join('')}
  </div>
  <div class="g2">
    <div>
      ${cardWrap('Quick Actions', `
        <div style="display:grid;gap:8px">
          ${[
            { l: '+ New Treatment Course', icon: '◎', page: 'protocol-wizard' },
            { l: '+ Add Patient', icon: '◉', page: 'patients' },
            { l: 'Review Queue', icon: '◱', page: 'review-queue' },
            { l: 'Session Execution', icon: '◧', page: 'session-execution' },
            { l: 'Protocol Registry', icon: '◇', page: 'protocols-registry' },
            { l: 'Evidence Library', icon: '◉', page: 'evidence' },
          ].map(a => `<button class="btn" style="text-align:left;display:flex;align-items:center;gap:10px" onclick="window._nav('${a.page}')"><span style="color:var(--teal)">${a.icon}</span>${a.l}</button>`).join('')}
        </div>
      `)}
    </div>
    <div>
      ${cardWrap('Clinical Workflow', `
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.8">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="color:var(--teal);font-size:16px">①</span> Add patient → <strong>Patients</strong></div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="color:var(--teal);font-size:16px">②</span> Create course → <strong>Protocol Wizard</strong></div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="color:var(--amber);font-size:16px">③</span> Review &amp; approve → <strong>Review Queue</strong></div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="color:var(--teal);font-size:16px">④</span> Deliver session → <strong>Session Execution</strong></div>
          <div style="display:flex;align-items:center;gap:8px"><span style="color:var(--violet);font-size:16px">⑤</span> Track outcomes → <strong>Outcomes &amp; Trends</strong></div>
        </div>
      `)}
      ${cardWrap('System Status', `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 0">
          <span class="status-dot online"></span>
          <span style="font-size:12.5px;color:var(--text-primary)">Backend API</span>
          <span style="margin-left:auto;font-size:11px;color:var(--green)">Online</span>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);margin-top:4px">
          Logged in as <strong style="color:var(--teal)">${currentUser?.display_name || currentUser?.email || 'User'}</strong> · Role: ${currentUser?.role || 'guest'}
        </div>
      `)}
    </div>
  </div>`;
}

// ── Patients ─────────────────────────────────────────────────────────────────
export async function pgPatients(setTopbar, navigate) {
  setTopbar('Patients',
    `<button class="btn btn-primary btn-sm" onclick="window.showAddPatient()">+ New Patient</button>`
  );

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [];
  try {
    const res = await api.listPatients();
    items = res?.items || [];
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load patients: ${e.message}</div>`;
    return;
  }

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
              <option>Major Depressive Disorder</option><option>ADHD</option><option>Anxiety / GAD</option>
              <option>PTSD</option><option>Chronic Pain</option><option>Parkinson's Disease</option>
              <option>Post-Stroke Rehabilitation</option><option>Insomnia</option><option>Autism Spectrum</option><option>Other</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Primary Modality</label>
            <select id="np-modality" class="form-control">
              <option value="">Select modality…</option>
              <option>tDCS</option><option>TMS / rTMS</option><option>taVNS</option>
              <option>CES</option><option>Neurofeedback</option><option>TPS</option><option>PBM</option>
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
    <input class="form-control" id="pt-search" placeholder="Search patients…" style="flex:1;min-width:200px" oninput="window.filterPatients()">
    <select class="form-control" id="pt-status-filter" style="width:auto" onchange="window.filterPatients()">
      <option value="">All Status</option><option>active</option><option>pending</option><option>inactive</option>
    </select>
  </div>

  <div class="card" style="overflow-x:auto">
    <table class="ds-table" id="patients-table">
      <thead><tr>
        <th>Patient</th><th>Condition</th><th>Modality</th><th>Status</th><th>Consent</th><th></th>
      </tr></thead>
      <tbody id="patients-body">
        ${items.length === 0
          ? `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-tertiary)">No patients yet. Add your first patient →</td></tr>`
          : items.map(p => `<tr onclick="window.openPatient('${p.id}')">
            <td><div style="display:flex;align-items:center;gap:10px">
              <div class="avatar" style="width:30px;height:30px;font-size:10.5px;flex-shrink:0">${initials((p.first_name || '') + ' ' + (p.last_name || ''))}</div>
              <div>
                <div style="font-weight:500">${p.first_name || ''} ${p.last_name || ''}</div>
                <div style="font-size:10.5px;color:var(--text-tertiary)">${p.dob ? p.dob : 'DOB unknown'}</div>
              </div>
            </div></td>
            <td style="color:var(--text-secondary)">${p.primary_condition || '—'}</td>
            <td><span class="tag">${p.primary_modality || '—'}</span></td>
            <td>${pillSt(p.status || 'pending')}</td>
            <td>${p.consent_signed ? '<span style="color:var(--green);font-size:12px">✓ Signed</span>' : '<span style="color:var(--amber);font-size:12px">Pending</span>'}</td>
            <td style="display:flex;gap:4px">
              <button class="btn btn-sm" onclick="event.stopPropagation();window.openPatient('${p.id}')">Open →</button>
              <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();window.deletePatient('${p.id}')">✕</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;

  window._patientsData = items;

  window.filterPatients = function() {
    const q = document.getElementById('pt-search').value.toLowerCase();
    const st = document.getElementById('pt-status-filter').value;
    const filtered = (window._patientsData || []).filter(p => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      const matchQ = !q || name.includes(q) || (p.primary_condition || '').toLowerCase().includes(q);
      const matchSt = !st || p.status === st;
      return matchQ && matchSt;
    });
    const tbody = document.getElementById('patients-body');
    if (!tbody) return;
    tbody.innerHTML = filtered.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-tertiary)">No patients match filter.</td></tr>`
      : filtered.map(p => `<tr onclick="window.openPatient('${p.id}')">
          <td><div style="display:flex;align-items:center;gap:10px">
            <div class="avatar" style="width:30px;height:30px;font-size:10.5px">${initials((p.first_name || '') + ' ' + (p.last_name || ''))}</div>
            <div><div style="font-weight:500">${p.first_name} ${p.last_name}</div><div style="font-size:10.5px;color:var(--text-tertiary)">${p.dob || ''}</div></div>
          </div></td>
          <td style="color:var(--text-secondary)">${p.primary_condition || '—'}</td>
          <td><span class="tag">${p.primary_modality || '—'}</span></td>
          <td>${pillSt(p.status || 'pending')}</td>
          <td>${p.consent_signed ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--amber)">Pending</span>'}</td>
          <td><button class="btn btn-sm" onclick="event.stopPropagation();window.openPatient('${p.id}')">Open →</button></td>
        </tr>`).join('');
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
    try { await api.deletePatient(id); navigate('patients'); } catch (e) { alert(e.message); }
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
    ${['overview', 'courses', 'sessions', 'protocol', 'assessments', 'notes'].map(t =>
      `<button class="tab-btn ${ptab === t ? 'active' : ''}" onclick="window.switchPT('${t}')">${t}${t === 'courses' && courses.length ? ` (${courses.length})` : ''}</button>`
    ).join('')}
  </div>
  <div id="ptab-body">${renderProfileTab(pt, sessions, courses)}</div>`;

  window._currentPatient = pt;
  window._currentSessions = sessions;
  window._currentCourses = courses;

  window.switchPT = function(t) {
    ptab = t;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.textContent.trim().startsWith(t)));
    document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, window._currentCourses || []);
    if (t === 'protocol') bindAI(pt);
  };

  window.startNewCourse = function() {
    window._wizardPatientId = pt.id;
    window._wizardPatientName = `${pt.first_name} ${pt.last_name}`;
    navigate('protocol-wizard');
  };

  window._activateCourseFromProfile = async function(courseId) {
    try {
      await api.activateCourse(courseId);
      // Refresh courses for this patient
      const updated = await api.listCourses({ patient_id: pt.id }).then(r => r?.items || []).catch(() => []);
      window._currentCourses = updated;
      document.getElementById('ptab-body').innerHTML = renderProfileTab(pt, sessions, updated);
    } catch (e) {
      alert(e.message || 'Activation failed.');
    }
  };

  if (ptab === 'protocol') bindAI(pt);
}

function renderProfileTab(pt, sessions, courses = []) {
  const name = `${pt.first_name} ${pt.last_name}`;

  if (ptab === 'courses') {
    const STATUS_COLOR = { pending_approval:'var(--amber)', approved:'var(--blue)', active:'var(--teal)', paused:'var(--amber)', completed:'var(--green)', discontinued:'var(--red)' };
    const GRADE_COLOR = { 'EV-A':'var(--teal)', 'EV-B':'var(--blue)', 'EV-C':'var(--amber)', 'EV-D':'var(--red)' };
    return `
      <div style="margin-bottom:12px;display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="window.startNewCourse()">+ New Treatment Course</button>
      </div>
      ${courses.length === 0
        ? emptyState('◎', 'No treatment courses yet. Click "+ New Treatment Course" to start.')
        : `<div style="display:flex;flex-direction:column;gap:8px">
            ${courses.map(c => {
              const sc = STATUS_COLOR[c.status] || 'var(--text-tertiary)';
              const gc = GRADE_COLOR[c.evidence_grade] || 'var(--text-tertiary)';
              const pct = c.planned_sessions_total > 0 ? Math.min(100, Math.round(c.sessions_delivered / c.planned_sessions_total * 100)) : 0;
              return `<div class="card" style="padding:14px 18px">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">${c.condition_slug} · ${c.modality_slug}</span>
                  <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${sc}22;color:${sc}">${c.status.replace(/_/g,' ')}</span>
                  <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${gc}22;color:${gc}">${c.evidence_grade || '—'}</span>
                  ${c.on_label ? '' : '<span style="font-size:10px;color:var(--amber)">Off-label</span>'}
                </div>
                <div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">
                  ${c.planned_sessions_per_week}×/wk · ${c.planned_sessions_total} sessions
                  ${c.planned_frequency_hz ? ` · ${c.planned_frequency_hz} Hz` : ''}
                </div>
                <div style="margin-top:8px">
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-tertiary);margin-bottom:3px">
                    <span>Progress</span><span>${c.sessions_delivered}/${c.planned_sessions_total}</span>
                  </div>
                  <div style="height:3px;border-radius:2px;background:var(--border)">
                    <div style="height:3px;border-radius:2px;background:${sc};width:${pct}%"></div>
                  </div>
                </div>
                ${c.status === 'pending_approval' ? `<div style="margin-top:8px"><button class="btn btn-sm" onclick="window._activateCourseFromProfile('${c.id}')">Approve &amp; Activate</button></div>` : ''}
                ${c.governance_warnings?.length ? `<div style="margin-top:6px;font-size:11px;color:var(--amber)">⚠ ${c.governance_warnings.join(' · ')}</div>` : ''}
              </div>`;
            }).join('')}
          </div>`
      }`;
  }

  if (ptab === 'overview') return `<div class="g2">
    <div>${cardWrap('Clinical Details', [
      ['Name', name],
      ['Condition', pt.primary_condition || '—'],
      ['Gender', pt.gender || '—'],
      ['DOB', pt.dob || '—'],
      ['Referring Clinician', pt.referring_clinician || '—'],
      ['Contraindications', pt.notes || 'None documented'],
    ].map(([k, v]) => fr(k, v)).join(''))}</div>
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
                <option>tDCS</option><option>TMS / rTMS</option><option>taVNS</option><option>CES</option><option>Neurofeedback</option><option>TPS</option>
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

  if (ptab === 'assessments') return `
    <div style="margin-bottom:14px"><button class="btn btn-primary btn-sm" onclick="window._nav('assessments')">Go to Assessment Builder →</button></div>
    <div id="assessments-tab-body">${spinner()}</div>`;

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

  return '';
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
  const outcome = prompt('Enter session outcome (optional):') || '';
  try { await api.updateSession(id, { status: 'completed', outcome }); window._nav('profile'); } catch (e) { alert(e.message); }
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
  } catch (e) { alert(e.message); }
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
          <option>Major Depressive Disorder</option><option>ADHD</option><option>Anxiety / GAD</option>
          <option>PTSD</option><option>Chronic Pain</option><option>Parkinson's Disease</option><option>Insomnia</option>
        </select>
      </div>
      <div class="form-group"><label class="form-label">Modality</label>
        <select id="ai-modality" class="form-control">
          <option value="${pt?.primary_modality || ''}">${pt?.primary_modality || 'Select…'}</option>
          <option>tDCS</option><option>TMS</option><option>taVNS</option><option>CES</option><option>Neurofeedback</option>
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
  setTopbar('Protocol Generator', `<button class="btn btn-ghost btn-sm">My Protocols</button><button class="btn btn-primary btn-sm" onclick="window._nav('handbooks')">Handbooks →</button>`);
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
      ${cardWrap('Adjunct Notes', `
        <div class="form-group"><label class="form-label">Concurrent interventions</label><input class="form-control" placeholder="e.g. CBT, physiotherapy"></div>
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
        condEl.innerHTML = `<option value="">Select condition…</option>
          <option>Major Depressive Disorder</option><option>ADHD</option><option>Anxiety / GAD</option>
          <option>PTSD</option><option>Chronic Pain</option><option>Parkinson's Disease</option>
          <option>Post-Stroke Rehabilitation</option><option>Insomnia</option><option>Autism Spectrum</option>`;
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
      condEl.innerHTML = `<option value="">Select condition…</option>
        <option>Major Depressive Disorder</option><option>ADHD</option><option>Anxiety / GAD</option>
        <option>PTSD</option><option>Chronic Pain</option><option>Parkinson's Disease</option>
        <option>Post-Stroke Rehabilitation</option><option>Insomnia</option><option>Autism Spectrum</option>`;
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
    } catch (e) { alert(e.message); }
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
      const course = await api.createCourse({
        patient_id: patientId,
        protocol_id: protocolId,
        clinician_notes: document.getElementById('proto-key-symptoms')?.value || null,
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
      } catch {}
    }, 50);
  }
  if (proStep === 1) {
    // Load modalities from registry and wire condition→protocol refresh
    setTimeout(async () => {
      await loadProtocolWizardRegistry();
      // If a condition was already chosen in step 0, fetch matching protocols now
      const condEl = document.getElementById('proto-condition');
      if (condEl && condEl.value) {
        loadMatchingProtocols(condEl.value, selMods[0] || '');
      }
    }, 50);
  }
}

// ── Assessments ───────────────────────────────────────────────────────────────
export async function pgAssess(setTopbar) {
  setTopbar('Assessments', `<button class="btn btn-primary btn-sm" onclick="window.showAssessModal()">+ Run Assessment</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let items = [];
  try { const res = await api.listAssessments(); items = res?.items || []; } catch {}

  const templates = [
    { id: 'PHQ-9', t: 'PHQ-9 Depression Scale', sub: 'Patient health questionnaire, 9-item', tags: ['depression', 'outcome'] },
    { id: 'GAD-7', t: 'GAD-7 Anxiety Scale', sub: 'Generalised anxiety disorder, 7-item', tags: ['anxiety', 'outcome'] },
    { id: 'PCL-5', t: 'PTSD Checklist (PCL-5)', sub: 'PTSD symptom scale, 20-item', tags: ['PTSD', 'taVNS'] },
    { id: 'ADHD-RS-5', t: 'ADHD Rating Scale', sub: 'Executive function and attention assessment', tags: ['ADHD', 'NFB'] },
    { id: 'ISI', t: 'Insomnia Severity Index', sub: 'Sleep quality assessment', tags: ['insomnia', 'CES'] },
    { id: 'DASS-21', t: 'DASS-21', sub: 'Depression, Anxiety and Stress Scales', tags: ['depression', 'anxiety'] },
    { id: 'UPDRS-III', t: 'UPDRS-III Motor Assessment', sub: "Parkinson's motor function", tags: ['PD', 'TPS'] },
    { id: 'NRS-Pain', t: 'Numeric Pain Rating Scale', sub: 'Pain intensity 0–10', tags: ['pain', 'tDCS'] },
  ];

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
      ${templates.map(a => `<div class="card" style="margin-bottom:0;cursor:pointer;transition:border-color var(--transition)" onmouseover="this.style.borderColor='var(--border-teal)'" onmouseout="this.style.borderColor='var(--border)'">
        <div class="card-body">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:5px">${a.t}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:12px;line-height:1.55">${a.sub}</div>
          <div style="margin-bottom:12px">${a.tags.map(t => tag(t)).join('')}</div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm" onclick="window.runTemplate('${a.id}','${a.t}')">Run Assessment</button>
          </div>
        </div>
      </div>`).join('')}
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

  window.showAssessModal = function() { document.getElementById('assess-modal').style.display = 'flex'; };
  window.runTemplate = function(id, title) {
    document.getElementById('assess-modal').style.display = 'flex';
    document.getElementById('assess-template').value = id;
  };
  window.switchAssessTab = function(tab) {
    document.getElementById('assess-templates-view').style.display = tab === 'templates' ? '' : 'none';
    document.getElementById('assess-records-view').style.display = tab === 'records' ? '' : 'none';
    document.getElementById('tab-templates').classList.toggle('active', tab === 'templates');
    document.getElementById('tab-records').classList.toggle('active', tab === 'records');
  };
  window.saveAssessment = async function() {
    const errEl = document.getElementById('assess-error');
    errEl.style.display = 'none';
    const tid = document.getElementById('assess-template').value;
    const ttemplate = templates.find(t => t.id === tid);
    const data = {
      template_id: tid,
      template_title: ttemplate?.t || tid,
      patient_id: document.getElementById('assess-patient').value || null,
      data: {},
      clinician_notes: document.getElementById('assess-notes').value || null,
      score: parseFloat(document.getElementById('assess-score').value) || null,
      status: 'completed',
    };
    try {
      await api.createAssessment(data);
      document.getElementById('assess-modal').style.display = 'none';
      window._nav('assessments');
    } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
  };
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
  window.signNote = function() { alert('Note saved and signed.'); };
  window.copyNote = function() {
    const note = document.getElementById('chart-note-content')?.textContent;
    if (note) navigator.clipboard.writeText(note).then(() => alert('Copied!'));
  };
}

// ── Brain Data Vault ───────────────────────────────────────────────────────────
export function pgBrainData(setTopbar) {
  setTopbar('Brain Data Vault', `<button class="btn btn-primary btn-sm">+ Upload qEEG</button><button class="btn btn-sm" onclick="window._nav('qeegmaps')">qEEG Reference Maps →</button>`);
  return `<div class="g4" style="margin-bottom:20px">
    ${[
      { l: 'qEEG Reports', v: '—', d: 'uploaded files' },
      { l: 'Brain Maps', v: '—', d: 'mapped datasets' },
      { l: 'LORETA Files', v: '—', d: 'source localisation' },
      { l: 'Storage Used', v: '—', d: 'of available quota' },
    ].map(m => `<div class="metric-card"><div class="metric-label">${m.l}</div><div class="metric-value">${m.v}</div><div class="metric-delta">${m.d}</div></div>`).join('')}
  </div>
  <div class="g2">
    ${cardWrap('qEEG Brain Map Preview', `
      <div style="display:flex;gap:6px;margin-bottom:14px">
        ${['alpha', 'theta', 'beta'].map(b => `<button class="btn btn-sm ${eegBand === b ? 'btn-primary' : ''}" onclick="window.switchBand('${b}')">${b.charAt(0).toUpperCase() + b.slice(1)}</button>`).join('')}
      </div>
      <div style="background:rgba(0,0,0,0.3);border-radius:var(--radius-md);padding:12px" id="eeg-svg">${brainMapSVG(eegBand)}</div>
      <div style="display:flex;gap:14px;justify-content:center;margin-top:12px">
        ${['Low', 'Mid', 'High'].map(l => `<div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:${l === 'Low' ? '#1a3d6e' : l === 'Mid' ? '#2d7fe0' : '#4a9eff'}"></div><span style="font-size:10.5px;color:var(--text-secondary)">${l}</span></div>`).join('')}
      </div>
    `)}
    ${cardWrap('Case Summary from Upload', `
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.65">
        Upload clinical documents (qEEG report, intake form, clinician notes) to generate an AI case summary with target recommendations.
      </div>
      <div id="upload-dropzone" style="border:2px dashed var(--border);border-radius:var(--radius-md);padding:24px;text-align:center;margin-bottom:14px;cursor:pointer;transition:border-color var(--transition)" onmouseover="this.style.borderColor='var(--border-teal)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:24px;margin-bottom:8px;opacity:.4">📄</div>
        <div style="font-size:12px;color:var(--text-tertiary)">Drop files here or click to upload<br><span style="font-size:11px">PDF, PNG, TXT supported</span></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window.runCaseSummary()">Generate Case Summary ✦</button>
      <div id="case-summary-result" style="margin-top:14px"></div>
    `)}
  </div>`;
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
