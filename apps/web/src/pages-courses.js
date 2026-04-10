import { api, downloadBlob } from './api.js';
import { spinner, emptyState, evidenceBadge, labelBadge, safetyBadge, approvalBadge, govFlag, fr, cardWrap, tag } from './helpers.js';
import { FALLBACK_ASSESSMENT_TEMPLATES } from './constants.js';

// ── Shared color maps ─────────────────────────────────────────────────────────
const STATUS_COLOR = {
  pending_approval: 'var(--amber)',
  approved:         'var(--blue)',
  active:           'var(--teal)',
  paused:           'var(--amber)',
  completed:        'var(--green)',
  discontinued:     'var(--red)',
};

// ── Local helpers ─────────────────────────────────────────────────────────────

function metricCard(label, value, color, sub) {
  return `<div class="metric-card">
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px">${label}</div>
    <div style="font-size:28px;font-weight:700;color:${color};margin:8px 0 4px">${value}</div>
    <div style="font-size:11px;color:var(--text-secondary)">${sub}</div>
  </div>`;
}

function courseCard(c) {
  const statusCol = STATUS_COLOR[c.status] || 'var(--text-tertiary)';
  const progress = c.planned_sessions_total > 0
    ? Math.min(100, Math.round((c.sessions_delivered / c.planned_sessions_total) * 100))
    : 0;

  // Last activity line
  let lastActivityLine = '';
  if (c.status === 'pending_approval') {
    lastActivityLine = '<span style="color:var(--amber)">Awaiting approval</span>';
  } else if (c.last_session_at) {
    const days = Math.round((Date.now() - new Date(c.last_session_at).getTime()) / 86400000);
    lastActivityLine = days === 0 ? 'Last session: today' : days === 1 ? 'Last session: yesterday' : `Last session: ${days} days ago`;
  } else if (c.sessions_delivered > 0) {
    lastActivityLine = `${c.sessions_delivered} session${c.sessions_delivered !== 1 ? 's' : ''} delivered`;
  } else {
    lastActivityLine = 'No sessions logged yet';
  }

  // Patient name if available
  const patientLine = c._patientName ? `<span style="font-size:11px;color:var(--text-tertiary);margin-right:8px">◉ ${c._patientName}</span>` : '';

  return `<div class="card" style="padding:16px 20px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''" onclick="window._openCourse('${c.id}')">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">
          ${c.condition_slug ? c.condition_slug.replace(/-/g,' ') : '—'} · <span style="color:var(--teal)">${c.modality_slug || '—'}</span>
        </div>
        <div style="font-size:11px;color:var(--text-secondary)">
          ${patientLine}${c.planned_sessions_per_week || '?'}×/wk · ${c.planned_sessions_total || '?'} sessions total
          ${c.planned_frequency_hz ? ` · ${c.planned_frequency_hz} Hz` : ''}
          ${c.target_region ? ` · Target: ${c.target_region}` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        ${approvalBadge(c.status)}
        ${evidenceBadge(c.evidence_grade)}
        ${c.on_label === false ? labelBadge(false) : ''}
        ${safetyBadge(c.governance_warnings)}
      </div>
    </div>
    <div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-tertiary);margin-bottom:4px">
        <span>Progress</span><span>${c.sessions_delivered || 0} / ${c.planned_sessions_total || '?'}</span>
      </div>
      <div style="height:4px;border-radius:2px;background:var(--border)">
        <div style="height:4px;border-radius:2px;background:${statusCol};width:${progress}%;transition:width 0.3s"></div>
      </div>
    </div>
    <div style="margin-top:8px;font-size:10.5px;color:var(--text-tertiary)">${lastActivityLine}</div>
    ${c.clinician_notes ? `<div style="margin-top:4px;font-size:11px;color:var(--text-tertiary);font-style:italic">${c.clinician_notes}</div>` : ''}
    ${(c.governance_warnings || []).map(w => `<div style="margin-top:4px;font-size:11px;color:var(--amber)">⚠ ${w}</div>`).join('')}
  </div>`;
}

// ── pgCourses — Treatment Courses list ───────────────────────────────────────
export async function pgCourses(setTopbar, navigate) {
  setTopbar('Treatment Courses',
    `<select id="course-filter" class="form-control" style="width:auto;font-size:12px;padding:5px 10px" onchange="window._filterCourses()">
       <option value="">All Status</option>
       <option value="active">Active</option>
       <option value="pending_approval">Pending Approval</option>
       <option value="approved">Approved</option>
       <option value="completed">Completed</option>
       <option value="paused">Paused</option>
     </select>
     <select id="course-sort" class="form-control" style="width:auto;font-size:12px;padding:5px 10px" onchange="window._filterCourses()">
       <option value="recent">Sort: Recent</option>
       <option value="name">Sort: Name</option>
       <option value="status">Sort: Status</option>
       <option value="evidence">Sort: Evidence Grade</option>
     </select>
     <button class="btn btn-primary btn-sm" onclick="window._nav('protocol-wizard')">+ New Course</button>`
  );
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  try {
    const data = await api.listCourses();
    const items = data?.items || [];
    window._allCourses = items;

    const active    = items.filter(c => c.status === 'active').length;
    const pending   = items.filter(c => c.status === 'pending_approval').length;
    const completed = items.filter(c => c.status === 'completed').length;
    const flagged   = items.filter(c => (c.governance_warnings || []).length > 0).length;

    el.innerHTML = `
      <div class="page-section">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
          ${metricCard('Active Courses',     active    || '0', 'var(--teal)',  'Ongoing treatment')}
          ${metricCard('Pending Approval',   pending   || '0', 'var(--amber)', 'Awaiting review')}
          ${metricCard('Completed',          completed || '0', 'var(--green)', 'This quarter')}
          ${metricCard('Governance Flags',   flagged   || '0', 'var(--red)',   'Require attention')}
        </div>
        <div class="card">
          <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
            <span style="font-weight:600;font-size:14px">Treatment Courses</span>
            <span style="font-size:11px;color:var(--text-tertiary)">${items.length} total</span>
          </div>
          <div id="courses-list" style="padding:16px;display:flex;flex-direction:column;gap:8px">
            ${items.length
              ? items.map(courseCard).join('')
              : `<div style="text-align:center;padding:48px 24px">
                  <div style="font-size:40px;margin-bottom:16px;opacity:0.5">◎</div>
                  <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:8px">No treatment courses yet</div>
                  <div style="font-size:13px;color:var(--text-secondary);margin-bottom:24px;max-width:360px;margin-left:auto;margin-right:auto">Create your first course to begin managing patient treatment programmes.</div>
                  <button class="btn btn-primary" onclick="window._nav('protocol-wizard')">+ Create Your First Course</button>
                </div>`}
          </div>
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = `
      <div class="page-section">
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
          ${metricCard('Active Courses',   '—', 'var(--teal)',  'Ongoing treatment')}
          ${metricCard('Pending Approval', '—', 'var(--amber)', 'Awaiting review')}
          ${metricCard('Completed',        '—', 'var(--green)', 'This quarter')}
          ${metricCard('Governance Flags', '—', 'var(--red)',   'Require attention')}
        </div>
        <div class="card">
          <div style="padding:48px;text-align:center">
            ${emptyState('◎', 'Could not load courses. Ensure the backend is running.')}
          </div>
        </div>
      </div>`;
  }

  window._filterCourses = function() {
    const filter = document.getElementById('course-filter')?.value || '';
    const sort   = document.getElementById('course-sort')?.value || 'recent';
    const items  = window._allCourses || [];
    let visible  = filter ? items.filter(c => c.status === filter) : [...items];

    const GRADE_ORDER = { A: 0, B: 1, C: 2, D: 3 };
    const STATUS_ORDER = { active: 0, pending_approval: 1, approved: 2, paused: 3, completed: 4, discontinued: 5 };
    if (sort === 'name') {
      visible.sort((a, b) => (a.condition_slug || '').localeCompare(b.condition_slug || ''));
    } else if (sort === 'status') {
      visible.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
    } else if (sort === 'evidence') {
      visible.sort((a, b) => (GRADE_ORDER[a.evidence_grade] ?? 9) - (GRADE_ORDER[b.evidence_grade] ?? 9));
    } else {
      visible.sort((a, b) => ((b.updated_at || b.created_at || '') > (a.updated_at || a.created_at || '') ? 1 : -1));
    }

    const list = document.getElementById('courses-list');
    if (list) list.innerHTML = visible.length ? visible.map(courseCard).join('') : emptyState('◎', 'No courses match filter.');
  };

}

// ── pgCourseDetail — Full course detail ──────────────────────────────────────
export async function pgCourseDetail(setTopbar, navigate) {
  const id = window._selectedCourseId;
  if (!id) { navigate('courses'); return; }

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let course = null, sessions = [], adverseEvents = [], patient = null, protocolDetail = null, outcomes = [], outcomeSummary = null;
  try {
    course = await api.getCourse(id);
    [sessions, adverseEvents, outcomes] = await Promise.all([
      api.listCourseSessions(id).then(r => r?.items || []).catch(() => []),
      api.listAdverseEvents({ course_id: id }).then(r => r?.items || []).catch(() => []),
      api.listOutcomes({ course_id: id }).then(r => r?.items || []).catch(() => []),
    ]);
    if (course?.patient_id) {
      patient = await api.getPatient(course.patient_id).catch(() => null);
    }
    if (course?.protocol_id) {
      protocolDetail = await api.protocolDetail(course.protocol_id).catch(() => null);
    }
    outcomeSummary = await api.courseOutcomeSummary(id).catch(() => null);
  } catch (e) {
    el.innerHTML = `<div class="notice notice-warn">Could not load course: ${e.message}</div>`;
    return;
  }

  if (!course) { navigate('courses'); return; }

  const patName   = patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';
  const progress  = course.planned_sessions_total > 0
    ? Math.min(100, Math.round((course.sessions_delivered / course.planned_sessions_total) * 100))
    : 0;
  const statusCol = STATUS_COLOR[course.status] || 'var(--text-tertiary)';

  setTopbar(
    `${course.condition_slug ? course.condition_slug.replace(/-/g,' ') : 'Course'} · ${course.modality_slug || ''}`,
    `<button class="btn btn-ghost btn-sm" onclick="window._nav('courses')">← Courses</button>
     <button class="btn btn-sm" onclick="window._downloadCourseReport()">↓ Report</button>
     ${course.status === 'pending_approval'
       ? `<button class="btn btn-primary btn-sm" onclick="window._activateCourseDetail('${course.id}')">Approve &amp; Activate</button>`
       : course.status === 'active'
       ? `<button class="btn btn-sm" onclick="window._nav('session-execution')">Log Session →</button>`
       : ''}`
  );

  const tab = window._cdTab || 'overview';

  el.innerHTML = `
    <div class="card" style="margin-bottom:20px;background:linear-gradient(135deg,rgba(0,212,188,0.04),rgba(74,158,255,0.04))">
      <div style="padding:20px">
        <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:240px">
            <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:6px">
              ${course.condition_slug ? course.condition_slug.replace(/-/g,' ') : '—'}
              <span style="color:var(--teal)"> · ${course.modality_slug || '—'}</span>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">
              Patient: <strong style="color:var(--text-primary)">${patName}</strong>
              ${course.device_slug ? ` · Device: <span class="tag">${course.device_slug}</span>` : ''}
              ${course.target_region ? ` · Target: <span class="tag">${course.target_region}</span>` : ''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${approvalBadge(course.status)}
              ${evidenceBadge(course.evidence_grade)}
              ${course.on_label === false ? labelBadge(false) : labelBadge(true)}
              ${safetyBadge(course.governance_warnings)}
              ${course.review_required ? `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(255,107,107,0.1);color:var(--red);font-weight:600">Review Required</span>` : ''}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px">Session Progress</div>
            <div style="font-size:26px;font-weight:700;color:${statusCol}">${course.sessions_delivered || 0}<span style="font-size:14px;color:var(--text-tertiary)"> / ${course.planned_sessions_total || '?'}</span></div>
            <div style="width:160px;height:5px;border-radius:3px;background:var(--border);margin-top:8px">
              <div style="height:5px;border-radius:3px;background:${statusCol};width:${progress}%"></div>
            </div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">${progress}% complete</div>
          </div>
        </div>
      </div>
    </div>

    <div class="tab-bar" style="margin-bottom:20px">
      ${['overview','sessions','outcomes','protocol','adverse-events','governance'].map(t =>
        `<button class="tab-btn ${tab === t ? 'active' : ''}" onclick="window._cdSwitchTab('${t}')">${
          t === 'adverse-events' ? `Adverse Events${adverseEvents.length ? ` (${adverseEvents.length})` : ''}`
          : t === 'sessions' ? `Sessions (${sessions.length})`
          : t === 'outcomes' ? `Outcomes${outcomes.length ? ` (${outcomes.length})` : ''}`
          : t.charAt(0).toUpperCase() + t.slice(1)
        }</button>`
      ).join('')}
    </div>

    <div id="cd-tab-body">${renderCourseTab(course, sessions, adverseEvents, protocolDetail, tab, outcomes, outcomeSummary)}</div>`;

  window._cdSwitchTab = function(t) {
    window._cdTab = t;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('onclick')?.includes(`'${t}'`)));
    document.getElementById('cd-tab-body').innerHTML = renderCourseTab(course, sessions, adverseEvents, protocolDetail, t, outcomes, outcomeSummary);
  };

  window._downloadCourseReport = async function() {
    try {
      const blob = await api.exportProtocolDocx({
        condition_name: course.condition_slug || '',
        modality_name: course.modality_slug || '',
        device_name: course.device_slug || '',
        setting: 'clinical',
        evidence_threshold: course.evidence_grade || 'B',
        off_label: course.on_label === false,
        symptom_cluster: course.phenotype_id || '',
      });
      downloadBlob(blob, 'course-report-' + (course.condition_slug || course.id) + '.docx');
    } catch (e) {
      const b = document.createElement('div');
      b.className = 'notice notice-warn';
      b.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
      b.textContent = e.message || 'Export failed.';
      document.body.appendChild(b);
      setTimeout(() => b.remove(), 4000);
    }
  };

  window._toggleSession = function(id) {
    const panel = document.getElementById(`sess-expand-${id}`);
    const chev  = document.getElementById(`sess-chev-${id}`);
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    if (chev) chev.textContent = open ? '›' : '↓';
  };

  window._activateCourseDetail = async function(courseId) {
    try {
      await api.activateCourse(courseId);
      window._nav('course-detail');
    } catch (e) {
      const errBanner = document.createElement('div');
      errBanner.className = 'notice notice-warn';
      errBanner.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px;animation:fadeIn 0.2s';
      errBanner.textContent = e.message || 'Activation failed.';
      document.body.appendChild(errBanner);
      setTimeout(() => errBanner.remove(), 4000);
    }
  };
}

function renderCourseTab(course, sessions, adverseEvents, protocolDetail, tab, outcomes = [], outcomeSummary = null) {
  if (tab === 'overview') {
    const params = [
      ['Condition',        course.condition_slug?.replace(/-/g,' ') || '—'],
      ['Modality',         course.modality_slug || '—'],
      ['Device',           course.device_slug || '—'],
      ['Target Region',    course.target_region || '—'],
      ['Frequency',        course.planned_frequency_hz ? `${course.planned_frequency_hz} Hz` : '—'],
      ['Intensity',        course.planned_intensity_pct_rmt ? `${course.planned_intensity_pct_rmt}% RMT` : '—'],
      ['Session Duration', course.planned_session_duration_min ? `${course.planned_session_duration_min} min` : '—'],
      ['Sessions/Week',    course.planned_sessions_per_week ? `${course.planned_sessions_per_week}×/week` : '—'],
      ['Total Sessions',   course.planned_sessions_total || '—'],
      ['Delivered',        course.sessions_delivered || 0],
    ];

    const milestones = [
      { n: 5,  label: 'Initial tolerance check', done: (course.sessions_delivered || 0) >= 5 },
      { n: 10, label: 'Mid-course assessment',   done: (course.sessions_delivered || 0) >= 10 },
      { n: 20, label: 'Course completion review', done: (course.sessions_delivered || 0) >= 20 },
    ].filter(m => m.n <= (course.planned_sessions_total || 0));

    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:14px 20px;background:rgba(0,212,188,0.03);border:1px solid var(--border-teal);border-radius:var(--radius-md)">
      <span style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;font-weight:600;align-self:center;margin-right:4px">Quick actions</span>
      <button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')">▶ Start Session</button>
      <button class="btn btn-sm" onclick="window._nav('review-queue')">◱ Request Review</button>
      <button class="btn btn-sm" onclick="window._downloadCourseReport()">↓ Export PDF</button>
    </div>
    <div class="g2">
      <div>
        ${cardWrap('Treatment Parameters', params.map(([k,v]) => fr(k,v)).join(''))}
        ${course.clinician_notes ? cardWrap('Clinician Notes', `<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">${course.clinician_notes}</div>`) : ''}
      </div>
      <div>
        ${cardWrap('Course Status',
          `<div style="margin-bottom:12px">${approvalBadge(course.status)}</div>` +
          fr('Evidence Grade',  evidenceBadge(course.evidence_grade)) +
          fr('Label Status',    labelBadge(course.on_label !== false)) +
          fr('Review Required', course.review_required ? '<span style="color:var(--amber)">Yes</span>' : '<span style="color:var(--green)">No</span>') +
          fr('Protocol ID',     course.protocol_id ? `<span class="mono" style="font-size:11px">${course.protocol_id}</span>` : '—')
        )}
        ${milestones.length ? cardWrap('Milestones',
          milestones.map(m => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:14px;color:${m.done ? 'var(--green)' : 'var(--text-tertiary)'}">${m.done ? '✓' : '○'}</span>
            <span style="font-size:12px;color:${m.done ? 'var(--text-primary)' : 'var(--text-secondary)'};flex:1">Session ${m.n}: ${m.label}</span>
          </div>`).join('')
        ) : ''}
      </div>
    </div>`;
  }

  if (tab === 'sessions') {
    function tolColor(t) {
      return t === 'well-tolerated' ? { bg: 'rgba(74,222,128,0.1)', col: 'var(--green)' }
           : t === 'poor'           ? { bg: 'rgba(255,107,107,0.1)', col: 'var(--red)' }
           :                          { bg: 'rgba(255,181,71,0.1)',  col: 'var(--amber)' };
    }
    return `<div class="card">
      <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:600">Session Log (${sessions.length})</span>
        <button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')">+ Log Session</button>
      </div>
      ${sessions.length === 0
        ? `<div style="padding:32px">${emptyState('◧', 'No sessions logged yet. Go to Session Execution to log sessions.')}</div>`
        : `<div style="display:flex;flex-direction:column;gap:0">
            ${sessions.map((s, i) => {
              const tc = s.tolerance_rating ? tolColor(s.tolerance_rating) : null;
              const sNum = sessions.length - i;
              return `
              <div style="border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:10px;padding:10px 18px;cursor:pointer;flex-wrap:wrap"
                     onclick="window._toggleSession('${s.id || i}')">
                  <span class="mono" style="font-size:11px;color:var(--text-tertiary);width:20px;flex-shrink:0">${sNum}</span>
                  <span style="font-size:12px;color:var(--text-secondary);flex-shrink:0">${s.created_at ? s.created_at.split('T')[0] : '—'}</span>
                  ${s.device_slug ? `<span class="tag" style="flex-shrink:0">${s.device_slug}</span>` : ''}
                  <div style="flex:1;display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--text-secondary)">
                    ${s.frequency_hz ? `<span><span style="color:var(--text-tertiary)">Freq:</span> <span class="mono">${s.frequency_hz} Hz</span></span>` : ''}
                    ${s.intensity_pct_rmt ? `<span><span style="color:var(--text-tertiary)">Int:</span> <span class="mono">${s.intensity_pct_rmt}%</span></span>` : ''}
                    ${s.duration_minutes ? `<span><span style="color:var(--text-tertiary)">Dur:</span> <span class="mono">${s.duration_minutes} min</span></span>` : ''}
                  </div>
                  ${tc ? `<span style="font-size:10.5px;padding:2px 7px;border-radius:4px;background:${tc.bg};color:${tc.col};flex-shrink:0">${s.tolerance_rating}</span>` : ''}
                  ${s.interruptions ? `<span style="color:var(--amber);font-size:11px;flex-shrink:0">⚠ Interrupted</span>` : ''}
                  ${s.protocol_deviation ? `<span style="color:var(--red);font-size:11px;flex-shrink:0">⚡ Deviation</span>` : ''}
                  <span style="color:var(--text-tertiary);font-size:12px;flex-shrink:0" id="sess-chev-${s.id || i}">›</span>
                </div>
                <div id="sess-expand-${s.id || i}" style="display:none;padding:12px 18px 16px;border-top:1px solid var(--border);background:rgba(0,0,0,0.15)">
                  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;font-size:12px">
                    ${[
                      ['Date',           s.created_at ? s.created_at.replace('T',' ').slice(0,16) : '—'],
                      ['Device',         s.device_slug || '—'],
                      ['Montage / Site', s.coil_position || '—'],
                      ['Frequency',      s.frequency_hz ? s.frequency_hz + ' Hz' : '—'],
                      ['Intensity',      s.intensity_pct_rmt ? s.intensity_pct_rmt + '% RMT' : '—'],
                      ['Pulses',         s.pulses_delivered ?? '—'],
                      ['Duration',       s.duration_minutes ? s.duration_minutes + ' min' : '—'],
                      ['Outcome',        s.session_outcome?.replace(/_/g,' ') || '—'],
                      ['Tolerance',      s.tolerance_rating || '—'],
                    ].map(([k,v]) => `<div><span style="color:var(--text-tertiary);font-size:11px">${k}:</span> <span style="color:var(--text-primary)">${v}</span></div>`).join('')}
                  </div>
                  ${s.post_session_notes ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;padding:8px 10px;background:rgba(0,0,0,0.2);border-radius:var(--radius-sm);border-left:2px solid var(--border-teal)">${s.post_session_notes}</div>` : ''}
                  <div style="display:flex;gap:8px;margin-top:10px">
                    <button class="btn btn-sm" onclick="window._cdTab='adverse-events';window._selectedCourseId='${course.id}';window._nav('course-detail')">Report AE</button>
                    <button class="btn btn-sm" onclick="window._cdSwitchTab('outcomes')">Record Outcome</button>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>`
      }
    </div>`;
  }

  if (tab === 'protocol') {
    const p = protocolDetail;
    if (!p && !course.protocol_id) return `<div class="card" style="padding:32px">${emptyState('⬡', 'No protocol assigned to this course.')}</div>`;
    if (!p) return `<div class="card" style="padding:20px"><div style="font-size:12px;color:var(--text-secondary)">Protocol ID: <span class="mono">${course.protocol_id}</span> — full detail unavailable.</div></div>`;
    const isOn = String(p.on_label_vs_off_label || '').toLowerCase().startsWith('on');
    return `<div class="g2">
      <div>
        ${cardWrap('Protocol Detail',
          `<div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${p.name || p.id}</div>
           <div style="display:flex;gap:6px;margin-bottom:14px">
             ${evidenceBadge(p.evidence_grade)}
             ${labelBadge(isOn)}
           </div>` +
          [
            ['Protocol ID',      p.id],
            ['Condition',        p.condition_id],
            ['Phenotype',        p.phenotype_id || '—'],
            ['Modality',         p.modality_id],
            ['Device',           p.device_id_if_specific || 'Any compatible'],
            ['Target Region',    p.target_region],
            ['Laterality',       p.laterality || '—'],
            ['Frequency',        p.frequency_hz ? `${p.frequency_hz} Hz` : '—'],
            ['Intensity',        p.intensity || '—'],
            ['Session Duration', p.session_duration || '—'],
            ['Sessions/Week',    p.sessions_per_week || '—'],
            ['Total Course',     p.total_course || '—'],
            ['Coil/Placement',   p.coil_or_electrode_placement || '—'],
          ].map(([k,v]) => fr(k, `<span class="mono" style="font-size:11.5px">${v}</span>`)).join('')
        )}
      </div>
      <div>
        ${p.clinician_review_required === 'Yes' ? cardWrap('Approval Note',
          govFlag('This protocol requires clinician review and approval before activation.', 'warn')
        ) : ''}
        ${p.monitoring_requirements ? cardWrap('Monitoring Requirements',
          `<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">${p.monitoring_requirements}</div>`
        ) : ''}
      </div>
    </div>`;
  }

  if (tab === 'outcomes') {
    const summary = outcomeSummary?.summaries || [];
    const LOWER = new Set(['PHQ-9','GAD-7','PCL-5','ISI','DASS-21','NRS-Pain','UPDRS-III']);
    return `<div style="display:flex;flex-direction:column;gap:16px">
      ${summary.length > 0 ? summary.map(s => {
        const isResponder = s.is_responder;
        const dir = LOWER.has(s.template_name) ? 'lower = better' : 'higher = better';
        return `<div class="card" style="padding:16px 20px">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
            <span style="font-size:14px;font-weight:700;color:var(--text-primary);flex:1">${s.template_name}</span>
            ${isResponder
              ? '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(74,222,128,0.12);color:var(--green);font-weight:600">Responder ✓</span>'
              : '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,181,71,0.12);color:var(--amber);font-weight:600">Non-responder</span>'}
            <span style="font-size:10.5px;color:var(--text-tertiary)">${dir}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
            <div style="text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px">
              <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Baseline</div>
              <div style="font-size:22px;font-weight:700;color:var(--text-primary)">${s.baseline_score !== null && s.baseline_score !== undefined ? s.baseline_score : '—'}</div>
            </div>
            <div style="text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px">
              <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Latest</div>
              <div style="font-size:22px;font-weight:700;color:var(--teal)">${s.latest_score !== null && s.latest_score !== undefined ? s.latest_score : '—'}</div>
            </div>
            <div style="text-align:center;padding:12px;background:rgba(0,0,0,0.2);border-radius:6px">
              <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Change</div>
              <div style="font-size:22px;font-weight:700;color:${isResponder ? 'var(--green)' : 'var(--amber)'}">
                ${s.pct_change !== null && s.pct_change !== undefined ? (s.pct_change > 0 ? '+' : '') + Math.round(s.pct_change) + '%' : '—'}
              </div>
            </div>
          </div>
        </div>`;
      }).join('') : ''}
      <div class="card" style="overflow:hidden">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-weight:600">Outcome Records</span>
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('cd-outcome-form').style.display=''">+ Record Outcome</button>
        </div>
        <div id="cd-outcome-form" style="display:none;padding:16px;border-bottom:1px solid var(--border)">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:10px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Assessment Tool</label>
              <select id="cdo-template" class="form-control" style="font-size:12px">
                ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Score</label>
              <input id="cdo-score" class="form-control" type="number" placeholder="e.g. 14" style="font-size:12px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Measurement Point</label>
              <select id="cdo-point" class="form-control" style="font-size:12px">
                <option value="baseline">Baseline</option>
                <option value="mid">Mid-course</option>
                <option value="post">Post-course</option>
                <option value="followup_4w">4-week follow-up</option>
                <option value="followup_3m">3-month follow-up</option>
              </select>
            </div>
          </div>
          <div id="cd-outcome-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:6px"></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm" onclick="document.getElementById('cd-outcome-form').style.display='none'">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="window._cdSaveOutcome('${course.id}','${course.patient_id}')">Save</button>
          </div>
        </div>
        <div style="overflow-x:auto">
          ${outcomes.length === 0
            ? `<div style="padding:32px">${emptyState('◫', 'No outcome records yet. Click "+ Record Outcome" to add the first measurement.')}</div>`
            : `<table class="ds-table">
                <thead><tr><th>Tool</th><th>Score</th><th>Point</th><th>Session #</th><th>Date</th></tr></thead>
                <tbody>
                  ${outcomes.map(o => `<tr>
                    <td style="font-weight:500">${o.template_name || '—'}</td>
                    <td class="mono">${o.score !== null && o.score !== undefined ? o.score : '—'}</td>
                    <td><span class="tag" style="font-size:10px">${o.measurement_point || '—'}</span></td>
                    <td class="mono" style="color:var(--text-secondary)">${o.session_number || '—'}</td>
                    <td style="font-size:11.5px;color:var(--text-secondary)">${o.recorded_at ? o.recorded_at.split('T')[0] : '—'}</td>
                  </tr>`).join('')}
                </tbody>
              </table>`
          }
        </div>
      </div>
    </div>`;
  }

  if (tab === 'adverse-events') {
    return `<div class="card">
      <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:600">Adverse Events</span>
        <button class="btn btn-sm" onclick="window._showAEForm()">+ Report Event</button>
      </div>
      <div id="ae-form" style="display:none;padding:16px;border-bottom:1px solid var(--border)">
        ${renderAEForm(course.id, course.patient_id)}
      </div>
      <div style="overflow-x:auto">
        ${adverseEvents.length === 0
          ? `<div style="padding:32px">
              ${emptyState('◻', 'No adverse events recorded')}
              <div class="notice notice-ok" style="margin:16px auto;max-width:480px;text-align:center">
                <span style="color:var(--green);font-weight:600">✓ This course has a clean safety record.</span>
                No adverse events have been reported for this treatment course.
              </div>
            </div>`
          : `<table class="ds-table">
              <thead><tr><th>Date</th><th>Type</th><th>Severity</th><th>Onset</th><th>Resolution</th><th>Action</th><th>Notes</th></tr></thead>
              <tbody>
                ${adverseEvents.map(ae => {
                  const sevCol = ae.severity === 'serious' ? 'var(--red)' : ae.severity === 'moderate' ? 'var(--amber)' : 'var(--text-secondary)';
                  return `<tr>
                    <td style="font-size:11.5px;color:var(--text-secondary)">${ae.created_at ? ae.created_at.split('T')[0] : '—'}</td>
                    <td style="font-size:12px;font-weight:500">${ae.event_type || '—'}</td>
                    <td><span style="font-size:11px;padding:2px 7px;border-radius:4px;background:${sevCol}22;color:${sevCol};font-weight:600">${ae.severity || '—'}</span></td>
                    <td style="font-size:11.5px">${ae.onset_timing || '—'}</td>
                    <td style="font-size:11.5px">${ae.resolution || '—'}</td>
                    <td style="font-size:11.5px">${ae.action_taken || '—'}</td>
                    <td style="font-size:11px;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ae.notes || '—'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`
        }
      </div>
    </div>`;
  }

  if (tab === 'governance') {
    const warnings = course.governance_warnings || [];
    const canPause = ['active', 'approved'].includes(course.status);
    const canDiscontinue = ['active', 'approved', 'pending_approval', 'paused'].includes(course.status);
    const canResume = course.status === 'paused';
    const canApprove = course.status === 'pending_approval';

    return `<div class="g2">
      <div>
        ${cardWrap('Governance Summary',
          fr('Status',         approvalBadge(course.status)) +
          fr('Review Required', course.review_required ? '<span style="color:var(--amber)">Yes</span>' : '<span style="color:var(--teal)">No</span>') +
          fr('Label Status',   labelBadge(course.on_label !== false)) +
          fr('Evidence Grade', evidenceBadge(course.evidence_grade)) +
          fr('Created',        course.created_at?.split('T')[0] || '—') +
          fr('Clinician ID',   `<span class="mono" style="font-size:11px">${course.clinician_id || '—'}</span>`)
        )}
        ${cardWrap('Course Actions',
          `<div id="cd-gov-error" style="color:var(--red);font-size:12px;display:none;margin-bottom:8px"></div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${canApprove ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Approve this course to allow session execution.</div>
                <button class="btn btn-primary btn-sm" onclick="window._cdGovAction('approve')">✓ Approve Course</button>
              </div>` : ''}
            ${canResume ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Resume a paused treatment course.</div>
                <button class="btn btn-sm" style="border-color:var(--teal);color:var(--teal)" onclick="window._cdGovAction('resume')">▶ Resume Course</button>
              </div>` : ''}
            ${canPause ? `
              <div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Temporarily halt sessions. Patient remains enrolled.</div>
                <button class="btn btn-sm" style="border-color:var(--amber);color:var(--amber)" onclick="window._cdGovAction('pause')">⏸ Pause Course</button>
              </div>` : ''}
            ${canDiscontinue ? `
              <div style="padding-top:${canPause ? '10px' : '0'};border-top:${canPause ? '1px solid var(--border)' : 'none'}">
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">Permanently discontinue. This cannot be reversed.</div>
                <div style="display:flex;gap:8px;align-items:flex-start">
                  <textarea id="cd-discont-reason" class="form-control" style="flex:1;font-size:12px" rows="2" placeholder="Reason for discontinuation (required)…"></textarea>
                  <button class="btn btn-sm" style="border-color:var(--red);color:var(--red);white-space:nowrap" onclick="window._cdGovAction('discontinue')">⬛ Discontinue</button>
                </div>
              </div>` : ''}
            ${!canPause && !canDiscontinue && !canResume && !canApprove
              ? `<div style="color:var(--text-tertiary);font-size:12.5px;padding:8px 0">No actions available for status <strong>${course.status}</strong>.</div>`
              : ''}
          </div>`
        )}
      </div>
      <div>
        ${cardWrap('Governance Flags',
          warnings.length === 0
            ? `<div style="padding:12px 0;color:var(--teal);font-size:12.5px">✓ No governance flags on this course</div>`
            : warnings.map(w => govFlag(w, 'warn')).join('')
        )}
        ${cardWrap('Approval History', (() => {
          const createdDate = course.created_at ? new Date(course.created_at) : null;
          const submittedDate = course.submitted_at ? new Date(course.submitted_at) : (createdDate ? new Date(createdDate.getTime() + 86400000) : null);
          const approvedDate  = (course.status === 'active' || course.status === 'completed') && course.updated_at ? new Date(course.updated_at) : null;
          const events = [
            { label: `Created by ${course.clinician_id ? 'Clinician' : 'System'}`, date: createdDate, color: 'var(--blue)' },
            { label: 'Submitted for review', date: submittedDate, color: 'var(--amber)' },
            ...(approvedDate ? [{ label: 'Approved &amp; Activated', date: approvedDate, color: 'var(--green)' }] : []),
            ...(course.status === 'paused' ? [{ label: 'Course paused', date: course.updated_at ? new Date(course.updated_at) : null, color: 'var(--amber)' }] : []),
            ...(course.status === 'discontinued' ? [{ label: 'Course discontinued', date: course.updated_at ? new Date(course.updated_at) : null, color: 'var(--red)' }] : []),
          ].filter(e => e.date);
          if (events.length === 0) return '<div style="font-size:12px;color:var(--text-tertiary)">No approval history available.</div>';
          return `<div style="position:relative;padding-left:20px">
            <div style="position:absolute;left:7px;top:6px;bottom:6px;width:2px;background:var(--border)"></div>
            ${events.map((e, i) => `<div style="position:relative;margin-bottom:${i < events.length - 1 ? '16' : '0'}px;display:flex;align-items:flex-start;gap:10px">
              <div style="position:absolute;left:-16px;width:10px;height:10px;border-radius:50%;background:${e.color};border:2px solid var(--navy-850);flex-shrink:0;margin-top:2px"></div>
              <div>
                <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${e.label}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">${e.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
              </div>
            </div>`).join('')}
          </div>`;
        })())}
        ${adverseEvents.filter(ae => ae.severity === 'serious').length > 0
          ? cardWrap('Serious Adverse Events',
              adverseEvents.filter(ae => ae.severity === 'serious').map(ae =>
                govFlag(`${ae.event_type} — ${ae.onset_timing || 'timing unknown'} — Action: ${ae.action_taken || 'none documented'}`, 'error')
              ).join('')
            )
          : ''
        }
      </div>
    </div>`;
  }

  return '';
}

function renderAEForm(courseId, patientId) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Event Type</label>
        <select id="ae-type" class="form-control" style="font-size:12px">
          <option value="">Select…</option>
          <option value="headache">Headache</option>
          <option value="scalp_discomfort">Scalp Discomfort</option>
          <option value="tingling">Tingling / Paresthesia</option>
          <option value="dizziness">Dizziness</option>
          <option value="nausea">Nausea</option>
          <option value="seizure">Seizure</option>
          <option value="syncope">Syncope / Near-syncope</option>
          <option value="hearing_change">Hearing Change</option>
          <option value="mood_change">Mood Change</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Severity</label>
        <select id="ae-severity" class="form-control" style="font-size:12px">
          <option value="minor">Minor</option>
          <option value="moderate">Moderate</option>
          <option value="serious">Serious</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Onset Timing</label>
        <select id="ae-onset" class="form-control" style="font-size:12px">
          <option value="during_session">During session</option>
          <option value="immediate_post">Immediate post-session</option>
          <option value="hours_post">Hours post-session</option>
          <option value="next_day">Next day</option>
          <option value="delayed">Delayed (>24h)</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Resolution</label>
        <select id="ae-resolution" class="form-control" style="font-size:12px">
          <option value="self_resolving">Self-resolving</option>
          <option value="resolved_with_intervention">Resolved with intervention</option>
          <option value="ongoing">Ongoing</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Action Taken</label>
        <select id="ae-action" class="form-control" style="font-size:12px">
          <option value="none">None required</option>
          <option value="session_paused">Session paused</option>
          <option value="session_stopped">Session stopped early</option>
          <option value="protocol_modified">Protocol modified</option>
          <option value="course_paused">Course paused</option>
          <option value="course_discontinued">Course discontinued</option>
          <option value="medical_referral">Medical referral made</option>
        </select>
      </div>
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Notes</label>
      <textarea id="ae-notes" class="form-control" rows="2" placeholder="Describe the event in clinical detail…" style="font-size:12px;resize:vertical"></textarea>
    </div>
    <div id="ae-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-sm" onclick="document.getElementById('ae-form').style.display='none'">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="window._submitAE('${courseId}','${patientId || ''}')">Submit Report</button>
    </div>`;
}

window._showAEForm = function() {
  const f = document.getElementById('ae-form');
  if (f) f.style.display = f.style.display === 'none' ? '' : 'none';
};

window._cdSaveOutcome = async function(courseId, patientId) {
  const template = document.getElementById('cdo-template')?.value;
  const score    = parseFloat(document.getElementById('cdo-score')?.value);
  const point    = document.getElementById('cdo-point')?.value || 'post';
  const errEl    = document.getElementById('cd-outcome-error');
  const showErr  = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = ''; } };
  if (errEl) errEl.style.display = 'none';
  if (!template || isNaN(score)) { showErr('Template and numeric score are required.'); return; }
  try {
    await api.recordOutcome({ course_id: courseId, patient_id: patientId || null, template_name: template, score, measurement_point: point });
    window._cdTab = 'outcomes';
    window._nav('course-detail');
  } catch (e) { showErr(e.message || 'Save failed.'); }
};

window._submitAE = async function(courseId, patientId) {
  const errEl = document.getElementById('ae-error');
  if (errEl) errEl.style.display = 'none';
  const type = document.getElementById('ae-type')?.value;
  if (!type) { if (errEl) { errEl.textContent = 'Select event type.'; errEl.style.display = ''; } return; }
  try {
    await api.reportAdverseEvent({
      course_id:    courseId,
      patient_id:   patientId || null,
      event_type:   type,
      severity:     document.getElementById('ae-severity')?.value || 'minor',
      onset_timing: document.getElementById('ae-onset')?.value || null,
      resolution:   document.getElementById('ae-resolution')?.value || null,
      action_taken: document.getElementById('ae-action')?.value || null,
      notes:        document.getElementById('ae-notes')?.value || null,
    });
    window._cdTab = 'adverse-events';
    window._nav('course-detail');
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Report failed.'; errEl.style.display = ''; }
  }
};

window._cdGovAction = async function(action) {
  const errEl = document.getElementById('cd-gov-error');
  if (errEl) errEl.style.display = 'none';
  const courseId = window._selectedCourseId;
  if (!courseId) return;

  try {
    if (action === 'approve') {
      await api.activateCourse(courseId);
    } else if (action === 'pause') {
      await api.updateCourse(courseId, { status: 'paused' });
    } else if (action === 'resume') {
      await api.updateCourse(courseId, { status: 'active' });
    } else if (action === 'discontinue') {
      const reason = document.getElementById('cd-discont-reason')?.value?.trim();
      if (!reason) {
        if (errEl) { errEl.textContent = 'Reason required to discontinue.'; errEl.style.display = ''; }
        return;
      }
      if (!confirm('Permanently discontinue this treatment course? This cannot be undone.')) return;
      await api.updateCourse(courseId, { status: 'discontinued', clinician_notes: reason });
    }
    window._cdTab = 'governance';
    window._nav('course-detail');
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Action failed.'; errEl.style.display = ''; }
  }
};

// ── pgSessionExecution — Clinical session delivery ────────────────────────────
export async function pgSessionExecution(setTopbar, navigate) {
  setTopbar('Session Execution', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let activeCourses = [], devices = [];
  try {
    [activeCourses, devices] = await Promise.all([
      api.listCourses({ status: 'active' }).then(r => r?.items || []).catch(() => []),
      api.devices_registry().then(r => r?.items || []).catch(() => []),
    ]);
  } catch (_) {}

  const courseOptions = activeCourses.map(c =>
    `<option value="${c.id}">${c.condition_slug?.replace(/-/g,' ') || c.condition_slug} · ${c.modality_slug} — Session ${(c.sessions_delivered || 0) + 1} of ${c.planned_sessions_total || '?'}</option>`
  ).join('');

  const deviceOptions = devices.map(d =>
    `<option value="${d.id || d.Device_ID || d.name}">${d.name || d.Device_Name || d.id}</option>`
  ).join('');

  el.innerHTML = `
    <div class="page-section">
      <!-- Active courses queue -->
      <div class="card" style="margin-bottom:16px">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;font-weight:600">Active Treatment Courses</span>
          <span style="font-size:11px;color:var(--text-tertiary)">${activeCourses.length} active</span>
        </div>
        <div style="padding:16px">
          ${activeCourses.length === 0
            ? emptyState('◧', 'No active courses. Courses appear here once approved and activated.')
            : `<div style="display:flex;flex-direction:column;gap:8px">
                ${activeCourses.map(c => {
                  const pct = c.planned_sessions_total > 0
                    ? Math.min(100, Math.round(c.sessions_delivered / c.planned_sessions_total * 100)) : 0;
                  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer" onclick="document.getElementById('se-course').value='${c.id}'">
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${c.condition_slug?.replace(/-/g,' ')} · <span style="color:var(--teal)">${c.modality_slug}</span></div>
                      <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">
                        Session ${(c.sessions_delivered || 0) + 1} of ${c.planned_sessions_total || '?'}
                        ${c.planned_frequency_hz ? ` · Protocol: ${c.planned_frequency_hz} Hz` : ''}
                        ${c.target_region ? ` · ${c.target_region}` : ''}
                      </div>
                    </div>
                    <div style="width:80px;text-align:right">
                      <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:3px">${pct}%</div>
                      <div style="height:3px;border-radius:2px;background:var(--border)">
                        <div style="height:3px;border-radius:2px;background:var(--teal);width:${pct}%"></div>
                      </div>
                    </div>
                    <span style="font-size:11px;color:var(--text-tertiary)">Select →</span>
                  </div>`;
                }).join('')}
              </div>`
          }
        </div>
      </div>

      <!-- Session log form -->
      <div class="card">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;font-weight:600">Log Delivered Session Parameters</span>
        </div>
        ${activeCourses.length === 0
          ? `<div style="padding:32px">${emptyState('◧', 'No active courses to log sessions for.')}</div>`
          : `<div style="padding:20px">
              <div style="margin-bottom:16px">
                <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px;font-weight:500">Treatment Course <span style="color:var(--red)">*</span></label>
                <select id="se-course" class="form-control" style="font-size:12.5px" onchange="window._seAutoFill(this.value)">
                  <option value="">Select course…</option>
                  ${courseOptions}
                </select>
                <div id="se-protocol-banner" style="display:none;margin-top:8px;padding:8px 12px;background:rgba(0,212,188,0.06);border:1px solid var(--border-teal);border-radius:6px;font-size:11.5px;color:var(--text-secondary)"></div>
              </div>

              <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Device &amp; Setup</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Device Used</label>
                  <select id="se-device" class="form-control" style="font-size:12.5px">
                    <option value="">Select device…</option>
                    ${deviceOptions}
                    <option value="other">Other (specify in notes)</option>
                  </select>
                </div>
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Stimulation Site / Montage</label>
                  <input id="se-montage" class="form-control" placeholder="e.g. Left DLPFC, F3-Fp2" style="font-size:12.5px">
                </div>
              </div>

              <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Delivered Parameters</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:16px">
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Frequency (Hz)</label>
                  <input id="se-freq" class="form-control" type="number" step="0.1" placeholder="e.g. 10" style="font-size:12.5px">
                </div>
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Intensity (% RMT)</label>
                  <input id="se-intensity" class="form-control" type="number" step="1" placeholder="e.g. 120" style="font-size:12.5px">
                </div>
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Pulses Delivered</label>
                  <input id="se-pulses" class="form-control" type="number" placeholder="e.g. 3000" style="font-size:12.5px">
                </div>
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Duration (min)</label>
                  <input id="se-duration" class="form-control" type="number" placeholder="e.g. 37" style="font-size:12.5px">
                </div>
              </div>

              <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Tolerance &amp; Outcome</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Tolerance Rating</label>
                  <select id="se-tolerance" class="form-control" style="font-size:12.5px">
                    <option value="">Select…</option>
                    <option value="well-tolerated">Well tolerated</option>
                    <option value="mild-discomfort">Mild discomfort</option>
                    <option value="moderate">Moderate discomfort</option>
                    <option value="poor">Poor — intervention required</option>
                  </select>
                </div>
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Session Outcome</label>
                  <select id="se-outcome" class="form-control" style="font-size:12.5px">
                    <option value="completed">Completed as planned</option>
                    <option value="partially_completed">Partially completed</option>
                    <option value="parameters_modified">Parameters modified</option>
                    <option value="stopped_early">Stopped early</option>
                  </select>
                </div>
              </div>

              <!-- Session Timer -->
              <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Session Timer</div>
              <div style="margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:12px;padding:16px 24px;background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:var(--radius-md);min-width:200px">
                  <div>
                    <div style="font-family:var(--font-mono);font-size:40px;font-weight:700;color:var(--teal);letter-spacing:2px;line-height:1" id="se-timer-display">25:00</div>
                    <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;text-transform:uppercase;letter-spacing:.7px">Session countdown</div>
                  </div>
                  <div id="se-timer-pulse" style="display:none;width:10px;height:10px;border-radius:50%;background:var(--green);animation:pulse 1.5s ease-in-out infinite"></div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <div style="display:flex;align-items:center;gap:6px">
                    <label style="font-size:11px;color:var(--text-secondary)">Duration (min):</label>
                    <input id="se-timer-dur" type="number" value="25" min="1" max="120" style="width:56px;padding:4px 8px;font-size:12px;background:var(--navy-800);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-family:var(--font-mono)" onchange="window._seTimerReset()">
                  </div>
                  <button class="btn btn-primary btn-sm" id="se-timer-start-btn" onclick="window._seTimerStart()">Begin Session</button>
                  <button class="btn btn-sm" id="se-timer-stop-btn" onclick="window._seTimerStop()" style="display:none">Stop Timer</button>
                  <span id="se-timer-active-label" style="display:none;font-size:11px;color:var(--green);font-weight:600;display:none;align-items:center;gap:4px">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 1.5s ease-in-out infinite"></span>
                    Session Active
                  </span>
                </div>
              </div>
              <style>@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.15)}}</style>

              <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">Pre / Post Session Checklist</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
                ${[
                  ['ck-consent',    'Consent verified'],
                  ['ck-contra',     'Contraindications checked'],
                  ['ck-rmt',        'RMT established / verified'],
                  ['ck-device',     'Device calibration confirmed'],
                  ['ck-post-check', 'Post-session patient check completed'],
                  ['ck-documented', 'Session documented in clinical record'],
                ].map(([cid, lbl]) => `
                  <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:6px">
                    <input id="${cid}" type="checkbox" style="accent-color:var(--teal)">
                    <label for="${cid}" style="font-size:12px;color:var(--text-secondary);cursor:pointer">${lbl}</label>
                  </div>`).join('')}
              </div>

              <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:8px">
                  <input id="se-interrupt" type="checkbox" style="accent-color:var(--amber)">
                  <label for="se-interrupt" style="font-size:12px;color:var(--text-secondary)">Session interrupted</label>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  <input id="se-deviation" type="checkbox" style="accent-color:var(--red)">
                  <label for="se-deviation" style="font-size:12px;color:var(--text-secondary)">Protocol deviation (explain in notes)</label>
                </div>
              </div>

              <div style="margin-bottom:16px">
                <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Post-session Notes &amp; Observations</label>
                <textarea id="se-notes" class="form-control" rows="3" placeholder="Patient response, observations, any adverse reactions, deviation rationale…" style="font-size:12.5px;resize:vertical"></textarea>
              </div>

              <div id="se-error"   style="display:none;color:var(--red);font-size:12px;margin-bottom:10px;padding:8px 10px;border-radius:6px;background:rgba(255,107,107,0.07)"></div>
              <div id="se-success" style="display:none;color:var(--green);font-size:12px;margin-bottom:10px;padding:8px 10px;border-radius:6px;background:rgba(74,222,128,0.07)"></div>
              <button class="btn btn-primary" onclick="window._logSession()">Submit Session Log</button>
            </div>`
        }
      </div>
    </div>`;

  window._logSession = async function() {
    const courseId = document.getElementById('se-course')?.value;
    const errEl = document.getElementById('se-error');
    const okEl  = document.getElementById('se-success');
    errEl.style.display = 'none';
    okEl.style.display  = 'none';

    if (!courseId) {
      errEl.textContent = 'Select a treatment course.';
      errEl.style.display = '';
      return;
    }

    try {
      const toleranceVal = document.getElementById('se-tolerance')?.value || null;
      const outcomeVal   = document.getElementById('se-outcome')?.value || 'completed';
      const session = await api.logSession(courseId, {
        device_slug:        document.getElementById('se-device')?.value || null,
        coil_position:      document.getElementById('se-montage')?.value || null,
        frequency_hz:       parseFloat(document.getElementById('se-freq')?.value) || null,
        intensity_pct_rmt:  parseFloat(document.getElementById('se-intensity')?.value) || null,
        pulses_delivered:   parseInt(document.getElementById('se-pulses')?.value) || null,
        duration_minutes:   parseInt(document.getElementById('se-duration')?.value) || null,
        tolerance_rating:   toleranceVal,
        session_outcome:    outcomeVal,
        interruptions:      document.getElementById('se-interrupt')?.checked || false,
        protocol_deviation: document.getElementById('se-deviation')?.checked || false,
        post_session_notes: document.getElementById('se-notes')?.value || null,
      });

      // Determine course info for post-session panel
      const course = (window._seActiveCourses || []).find(c => c.id === courseId) || {};
      const patientId = course.patient_id || null;
      const needsAE = toleranceVal === 'poor' || outcomeVal === 'stopped_early';

      // Show post-session action panel instead of just reloading
      const sessionForm = document.querySelector('.card div[style*="padding:20px"]');
      if (sessionForm) {
        sessionForm.innerHTML = `
          <div style="text-align:center;padding:16px 0 20px">
            <div style="font-size:28px;color:var(--teal);margin-bottom:8px">✓</div>
            <div style="font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Session Logged</div>
            <div style="font-size:12px;color:var(--text-secondary)">
              ${course.condition_slug?.replace(/-/g,' ') || 'Course'} · Session ${(course.sessions_delivered || 0) + 1} of ${course.planned_sessions_total || '?'}
            </div>
          </div>

          ${needsAE ? `
          <div class="notice notice-warn" style="margin-bottom:16px">
            <strong>⚠ Attention required:</strong> Tolerance rated "${toleranceVal || outcomeVal}". Consider filing an adverse event report.
          </div>
          <div id="se-ae-panel" style="margin-bottom:16px">
            ${renderAEForm(courseId, patientId)}
            <div id="ae-error" style="display:none;color:var(--red);font-size:12px;margin-top:6px"></div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="btn btn-sm" style="border-color:var(--amber);color:var(--amber)" onclick="window._submitAE('${courseId}','${patientId}')">Submit AE Report</button>
              <button class="btn btn-sm" onclick="document.getElementById('se-ae-panel').style.display='none'">Skip</button>
            </div>
          </div>` : ''}

          <div style="border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;margin-bottom:16px">
            <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Quick Outcome Entry (optional)</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
              <div>
                <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Assessment Template</label>
                <select id="pse-template" class="form-control" style="font-size:12px">
                  <option value="">Skip outcome</option>
                  ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.id} — ${t.label.split('—')[1]?.trim() || t.label}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Score</label>
                <input id="pse-score" class="form-control" type="number" placeholder="e.g. 12" style="font-size:12px">
              </div>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Measurement Point</label>
              <select id="pse-point" class="form-control" style="font-size:12px">
                <option value="mid">Mid-course</option>
                <option value="post">Post-course</option>
                <option value="baseline">Baseline</option>
                <option value="follow_up">Follow-up</option>
              </select>
            </div>
            <div id="pse-error" style="display:none;color:var(--red);font-size:12px;margin-top:6px"></div>
            <button class="btn btn-sm" style="margin-top:10px" onclick="window._savePostSessionOutcome('${courseId}','${patientId}')">Save Outcome</button>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="window._nav('session-execution')">Log Another Session</button>
            <button class="btn btn-sm" onclick="window._selectedCourseId='${courseId}';window._cdTab='sessions';window._nav('course-detail')">View Course →</button>
            <button class="btn btn-sm" onclick="window._nav('courses')">All Courses</button>
          </div>`;
      } else {
        okEl.textContent = 'Session logged successfully.';
        okEl.style.display = '';
        setTimeout(() => pgSessionExecution(setTopbar, navigate), 1500);
      }
    } catch (e) {
      errEl.textContent = e.message || 'Failed to log session.';
      errEl.style.display = '';
    }
  };

  window._savePostSessionOutcome = async function(courseId, patientId) {
    const template = document.getElementById('pse-template')?.value;
    const score    = parseFloat(document.getElementById('pse-score')?.value);
    const point    = document.getElementById('pse-point')?.value || 'mid';
    const errEl    = document.getElementById('pse-error');
    if (errEl) errEl.style.display = 'none';
    if (!template) return; // skip
    if (isNaN(score)) {
      if (errEl) { errEl.textContent = 'Enter a numeric score.'; errEl.style.display = ''; }
      return;
    }
    try {
      await api.recordOutcome({
        course_id: courseId, patient_id: patientId || null,
        template_id: template, template_title: template,
        score: String(score), score_numeric: score,
        measurement_point: point,
      });
      // Show confirmation inline
      const btn = document.querySelector('button[onclick*="savePostSessionOutcome"]');
      const row = btn?.closest('div[style*="border:1px solid var(--border)"]');
      if (row) row.innerHTML = `<div style="color:var(--teal);font-size:12.5px;padding:8px 0">✓ Outcome recorded: ${template} = ${score} (${point})</div>`;
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed.'; errEl.style.display = ''; }
    }
  };

  // ── Session Timer ──────────────────────────────────────────────────────────
  let _seTimerInterval = null;
  let _seTimerRemaining = 0;

  window._seTimerReset = function() {
    const dur = parseInt(document.getElementById('se-timer-dur')?.value) || 25;
    _seTimerRemaining = dur * 60;
    const disp = document.getElementById('se-timer-display');
    if (disp) disp.textContent = String(Math.floor(_seTimerRemaining / 60)).padStart(2, '0') + ':' + String(_seTimerRemaining % 60).padStart(2, '0');
  };

  window._seTimerStart = function() {
    if (_seTimerInterval) clearInterval(_seTimerInterval);
    const dur = parseInt(document.getElementById('se-timer-dur')?.value) || 25;
    _seTimerRemaining = dur * 60;
    const startBtn = document.getElementById('se-timer-start-btn');
    const stopBtn  = document.getElementById('se-timer-stop-btn');
    const pulse    = document.getElementById('se-timer-pulse');
    const activeLabel = document.getElementById('se-timer-active-label');
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn)  stopBtn.style.display  = '';
    if (pulse)    pulse.style.display    = '';
    if (activeLabel) { activeLabel.style.display = 'flex'; }

    _seTimerInterval = setInterval(function() {
      _seTimerRemaining--;
      const m = Math.floor(_seTimerRemaining / 60);
      const s = _seTimerRemaining % 60;
      const disp = document.getElementById('se-timer-display');
      if (disp) {
        disp.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        disp.style.color = _seTimerRemaining <= 60 ? 'var(--amber)' : _seTimerRemaining <= 0 ? 'var(--red)' : 'var(--teal)';
      }
      if (_seTimerRemaining <= 0) {
        clearInterval(_seTimerInterval);
        _seTimerInterval = null;
        window._seTimerStop();
        alert('Session timer complete! Please complete your post-session checklist.');
      }
    }, 1000);
  };

  window._seTimerStop = function() {
    if (_seTimerInterval) { clearInterval(_seTimerInterval); _seTimerInterval = null; }
    const startBtn = document.getElementById('se-timer-start-btn');
    const stopBtn  = document.getElementById('se-timer-stop-btn');
    const pulse    = document.getElementById('se-timer-pulse');
    const activeLabel = document.getElementById('se-timer-active-label');
    if (startBtn) startBtn.style.display = '';
    if (stopBtn)  stopBtn.style.display  = 'none';
    if (pulse)    pulse.style.display    = 'none';
    if (activeLabel) activeLabel.style.display = 'none';
  };

  // Store courses for auto-fill lookup
  window._seActiveCourses = activeCourses;

  window._seAutoFill = function(courseId) {
    const banner = document.getElementById('se-protocol-banner');
    if (!courseId) { if (banner) banner.style.display = 'none'; return; }
    const course = (window._seActiveCourses || []).find(c => c.id === courseId);
    if (!course) return;
    // Auto-populate fields
    const freqEl      = document.getElementById('se-freq');
    const intensEl    = document.getElementById('se-intensity');
    const durEl       = document.getElementById('se-duration');
    const montageEl   = document.getElementById('se-montage');
    if (freqEl && course.planned_frequency_hz)  freqEl.value    = parseFloat(course.planned_frequency_hz) || '';
    if (intensEl && course.planned_intensity)   intensEl.value  = parseFloat(course.planned_intensity) || '';
    if (durEl && course.planned_session_duration_minutes) durEl.value = course.planned_session_duration_minutes;
    if (montageEl && course.coil_placement && !montageEl.value) montageEl.value = course.coil_placement;
    // Show protocol banner
    if (banner) {
      banner.style.display = '';
      banner.innerHTML = [
        course.planned_frequency_hz ? `Freq: <strong>${course.planned_frequency_hz} Hz</strong>` : null,
        course.planned_intensity ? `Intensity: <strong>${course.planned_intensity}</strong>` : null,
        course.planned_session_duration_minutes ? `Duration: <strong>${course.planned_session_duration_minutes} min</strong>` : null,
        course.target_region ? `Target: <strong>${course.target_region}</strong>` : null,
        course.coil_placement ? `Placement: <strong>${course.coil_placement}</strong>` : null,
      ].filter(Boolean).join(' · ');
    }
  };
}

// ── pgReviewQueue — Protocol & course approvals ───────────────────────────────
export async function pgReviewQueue(setTopbar, navigate) {
  setTopbar('Review Queue', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let pending = [], resolved = [], courses = [], patients = [];
  try {
    const [queueData, coursesData, patientsData] = await Promise.all([
      api.listReviewQueue().catch(() => ({ items: [] })),
      api.listCourses().then(r => r?.items || []).catch(() => []),
      api.listPatients().then(r => r?.items || []).catch(() => []),
    ]);
    const items = queueData?.items || [];
    pending  = items.filter(i => i.status === 'pending');
    resolved = items.filter(i => i.status !== 'pending');
    courses  = coursesData;
    patients = patientsData;
  } catch (_) {}

  const courseMap  = {};
  courses.forEach(c => { courseMap[c.id] = c; });
  const patientMap = {};
  patients.forEach(p => { patientMap[p.id] = p; });

  const offLabelPending = courses.filter(c => c.on_label === false && c.status === 'pending_approval').length;

  // ── List item row (left panel) ──────────────────────────────────────────────
  function rqListRow(item, isSelected) {
    const course  = courseMap[item.target_id] || {};
    const patient = patientMap[course.patient_id] || {};
    const patName = patient.first_name ? `${patient.first_name} ${patient.last_name}` : '—';
    const priColor = item.priority === 'urgent' ? 'var(--red)' : item.priority === 'high' ? 'var(--amber)' : '';
    const sel = isSelected;
    return `<div id="rq-row-${item.id}"
        style="padding:12px 16px;border-bottom:1px solid var(--border);cursor:pointer;border-left:3px solid ${sel ? 'var(--teal)' : 'transparent'};background:${sel ? 'var(--teal-ghost)' : ''}"
        onclick="window._rqSelect('${item.id}')"
        onmouseover="if('${item.id}'!==window._rqSelectedId)this.style.background='var(--bg-surface)'"
        onmouseout="if('${item.id}'!==window._rqSelectedId)this.style.background=''">
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${patName}</div>
          <div style="font-size:11px;color:var(--teal);margin-top:1px">${course.condition_slug?.replace(/-/g,' ') || '—'} · ${course.modality_slug || '—'}</div>
          <div style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">
            ${evidenceBadge(course.evidence_grade)}
            ${course.on_label === false ? labelBadge(false) : ''}
            ${safetyBadge(course.governance_warnings)}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          <span style="font-size:9.5px;padding:2px 6px;border-radius:3px;background:rgba(255,181,71,0.1);color:var(--amber);font-weight:600">${(item.item_type||'review').replace(/_/g,' ')}</span>
          ${priColor ? `<span style="font-size:9px;color:${priColor};font-weight:700;letter-spacing:.5px">${(item.priority||'').toUpperCase()}</span>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ── Detail panel (right panel) ─────────────────────────────────────────────
  function rqDetailPanel(item) {
    if (!item) return `<div style="padding:60px 32px;text-align:center;color:var(--text-tertiary)">
      <div style="font-size:28px;margin-bottom:12px;opacity:.3">◱</div>
      <div style="font-size:13px">Select a review item from the list.</div>
    </div>`;

    const course  = courseMap[item.target_id] || {};
    const patient = patientMap[course.patient_id] || {};
    const patName = patient.first_name ? `${patient.first_name} ${patient.last_name}` : '—';
    const warnings = course.governance_warnings || [];

    const params = [
      ['Condition',   course.condition_slug?.replace(/-/g,' ') || '—'],
      ['Modality',    course.modality_slug || '—'],
      ['Target',      course.target_region || '—'],
      ['Frequency',   course.planned_frequency_hz ? course.planned_frequency_hz + ' Hz' : '—'],
      ['Intensity',   course.planned_intensity || '—'],
      ['Sessions/Wk', course.planned_sessions_per_week ? course.planned_sessions_per_week + '×' : '—'],
      ['Total Sess.', course.planned_sessions_total || '—'],
      ['Clinician',   course.clinician_id ? `<span class="mono" style="font-size:10.5px">${course.clinician_id.slice(0,12)}…</span>` : '—'],
    ];

    return `
    <div style="padding:18px 20px;border-bottom:1px solid var(--border);background:rgba(0,212,188,0.02)">
      <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:3px">${patName}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">${(item.item_type||'Review').replace(/_/g,' ')} · Submitted ${item.created_at ? item.created_at.split('T')[0] : '—'}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${approvalBadge(course.status)}
        ${evidenceBadge(course.evidence_grade)}
        ${labelBadge(course.on_label !== false)}
        ${safetyBadge(course.governance_warnings)}
        ${item.priority === 'urgent' ? '<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(255,107,107,0.12);color:var(--red);font-weight:700">URGENT</span>' : ''}
      </div>
    </div>

    <div style="padding:16px 20px;border-bottom:1px solid var(--border)">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:10px">Course Parameters</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
        ${params.map(([k,v]) => `<div style="display:flex;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
          <span style="color:var(--text-tertiary);width:80px;flex-shrink:0">${k}</span>
          <span style="color:var(--text-primary)">${v}</span>
        </div>`).join('')}
      </div>
    </div>

    ${warnings.length ? `<div style="padding:12px 20px;border-bottom:1px solid var(--border);background:rgba(255,181,71,0.03)">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:8px">Governance Warnings</div>
      ${warnings.map(w => govFlag(w, 'warn')).join('')}
    </div>` : ''}

    ${item.notes ? `<div style="padding:12px 20px;border-bottom:1px solid var(--border)">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:6px">Submission Notes</div>
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">${item.notes}</div>
    </div>` : ''}

    <div style="padding:18px 20px">
      <div style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--text-tertiary);font-weight:600;margin-bottom:8px">Reviewer Comment / Rationale</div>
      <textarea id="rq-comment" class="form-control" rows="3" style="margin-bottom:12px;font-size:12.5px;resize:vertical"
        placeholder="Required for Request Changes or Reject. Optional for Approve / Flag."></textarea>
      <div style="margin-bottom:12px">
        <button class="btn btn-sm" style="font-size:11px;color:var(--text-secondary)" onclick="(function(){const n=document.getElementById('rq-inline-note-${item.id}');if(n){n.style.display=n.style.display==='none'?'':'none';}})()">+ Add Note</button>
        <div id="rq-inline-note-${item.id}" style="display:none;margin-top:8px">
          <textarea class="form-control" rows="2" style="font-size:12px;resize:vertical;margin-bottom:6px" placeholder="Internal reviewer note (not visible to clinician)…"></textarea>
          <button class="btn btn-sm" onclick="(function(){const t=document.querySelector('#rq-inline-note-${item.id} textarea');if(t)t.value='';document.getElementById('rq-inline-note-${item.id}').style.display='none';})()">Clear &amp; Close</button>
        </div>
      </div>
      <div id="rq-action-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:10px;padding:7px 10px;border-radius:6px;background:rgba(255,107,107,0.07)"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
        <button class="btn btn-primary" onclick="window._rqConfirmAction('${course.id}','${item.id}','approve')">✓ Approve &amp; Activate</button>
        <button class="btn" style="border-color:var(--amber);color:var(--amber)" onclick="window._rqConfirmAction('${course.id}','${item.id}','changes_requested')">⚑ Request Changes</button>
        <button class="btn" style="border-color:var(--red);color:var(--red)" onclick="window._rqConfirmAction('${course.id}','${item.id}','reject')">✕ Reject Course</button>
        <button class="btn" style="border-color:var(--violet);color:var(--violet)" onclick="window._rqConfirmAction('${course.id}','${item.id}','flag')">⚐ Flag for Safety</button>
      </div>
      <button class="btn btn-sm" style="width:100%" onclick="window._openCourse('${course.id}')">Open Full Course Detail →</button>
    </div>`;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const firstItem = pending[0] || null;
  const initSelectedId = firstItem?.id || null;

  el.innerHTML = `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
    ${metricCard('Pending Reviews', pending.length,    pending.length > 0 ? 'var(--amber)' : 'var(--green)',  pending.length > 0 ? 'Awaiting action' : 'Queue clear')}
    ${metricCard('Off-label Items', offLabelPending,   offLabelPending > 0 ? 'var(--amber)' : 'var(--text-secondary)', 'Require off-label review')}
    ${metricCard('Recently Resolved', resolved.length, 'var(--green)', 'This session')}
  </div>

  <div class="card" style="overflow:hidden;margin-bottom:14px">
    <div style="display:grid;grid-template-columns:300px 1fr;min-height:480px">
      <!-- Left: item list -->
      <div style="border-right:1px solid var(--border);overflow-y:auto;max-height:600px">
        <div style="padding:10px 16px 8px;border-bottom:1px solid var(--border);background:rgba(255,255,255,0.02)">
          <span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:600;color:var(--text-tertiary)">
            Pending (${pending.length})
          </span>
        </div>
        ${pending.length
          ? pending.map((item, i) => rqListRow(item, i === 0)).join('')
          : `<div style="padding:36px 16px;text-align:center;color:var(--text-tertiary);font-size:12.5px">Queue is clear.</div>`
        }
      </div>
      <!-- Right: detail panel -->
      <div id="rq-detail" style="overflow-y:auto">
        ${rqDetailPanel(firstItem)}
      </div>
    </div>
  </div>

  ${resolved.length ? `
  <div class="card" style="overflow:hidden">
    <div style="padding:11px 16px;border-bottom:1px solid var(--border);background:rgba(255,255,255,0.02)">
      <span style="font-size:9.5px;text-transform:uppercase;letter-spacing:.9px;font-weight:600;color:var(--text-tertiary)">Recently Resolved (${resolved.length})</span>
    </div>
    <div style="overflow-x:auto">
      <table class="ds-table">
        <thead><tr><th>Type</th><th>Course</th><th>Action</th><th>Notes</th><th>Date</th></tr></thead>
        <tbody>
          ${resolved.slice(0, 8).map(item => {
            const course = courseMap[item.target_id] || {};
            const actColor = item.resolution === 'approved' ? 'var(--green)' : item.resolution === 'rejected' ? 'var(--red)' : 'var(--amber)';
            return `<tr>
              <td style="font-size:11.5px">${(item.item_type||'review').replace(/_/g,' ')}</td>
              <td style="font-size:12px">${course.condition_slug?.replace(/-/g,' ') || '—'} · ${course.modality_slug || '—'}</td>
              <td><span style="font-size:10.5px;font-weight:600;padding:2px 7px;border-radius:4px;background:${actColor}18;color:${actColor}">${item.resolution || item.status || '—'}</span></td>
              <td style="font-size:11.5px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.notes || '—'}</td>
              <td style="font-size:11.5px;color:var(--text-tertiary)">${item.updated_at ? item.updated_at.split('T')[0] : '—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}`;

  // ── Store data for dynamic updates ─────────────────────────────────────────
  window._rqItems      = pending;
  window._rqCourseMap  = courseMap;
  window._rqPatientMap = patientMap;
  window._rqSelectedId = initSelectedId;

  window._rqSelect = function(itemId) {
    window._rqSelectedId = itemId;
    // Update list row styles
    pending.forEach(i => {
      const row = document.getElementById('rq-row-' + i.id);
      if (!row) return;
      const sel = i.id === itemId;
      row.style.background    = sel ? 'var(--teal-ghost)' : '';
      row.style.borderLeft    = sel ? '3px solid var(--teal)' : '3px solid transparent';
    });
    // Update detail panel
    const item = pending.find(i => i.id === itemId);
    const detailEl = document.getElementById('rq-detail');
    if (detailEl && item) detailEl.innerHTML = rqDetailPanel(item);
  };

  window._rqConfirmAction = function(courseId, itemId, action) {
    const actionLabels = { approve: 'Approve and activate this course', changes_requested: 'Request changes on this course', reject: 'Reject this course', flag: 'Flag this course for safety review' };
    const label = actionLabels[action] || action;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:var(--navy-800);border:1px solid var(--border);border-radius:var(--radius-lg);padding:28px 32px;max-width:360px;width:90%;text-align:center">
      <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Confirm Action</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">${label}?</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn btn-sm" onclick="this.closest('[style*=fixed]').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="this.closest('[style*=fixed]').remove();window._rqAction('${courseId}','${itemId}','${action}')">Confirm</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  };

  window._rqAction = async function(courseId, itemId, action) {
    const comment  = document.getElementById('rq-comment')?.value?.trim() || '';
    const errEl    = document.getElementById('rq-action-error');
    if (errEl) errEl.style.display = 'none';

    if ((action === 'reject' || action === 'changes_requested') && !comment) {
      if (errEl) { errEl.textContent = action === 'reject' ? 'Rejection reason required.' : 'Describe what changes are needed.'; errEl.style.display = ''; }
      return;
    }
    if (action === 'reject' && !confirm('Reject this course? It will be marked as discontinued.')) return;

    // Disable buttons while acting
    document.querySelectorAll('#rq-detail button').forEach(b => { b.disabled = true; });

    try {
      if (action === 'approve') {
        await api.activateCourse(courseId);
        try { await api.submitReview({ target_id: courseId, item_id: itemId, action: 'approved', notes: comment || 'Approved and activated.' }); } catch {}
      } else if (action === 'changes_requested') {
        await api.submitReview({ target_id: courseId, item_id: itemId, action: 'changes_requested', notes: comment });
        await api.updateCourse(courseId, { review_required: true });
      } else if (action === 'reject') {
        await api.submitReview({ target_id: courseId, item_id: itemId, action: 'rejected', notes: comment });
        await api.updateCourse(courseId, { status: 'discontinued', clinician_notes: `Rejected: ${comment}` });
      } else if (action === 'flag') {
        await api.submitReview({ target_id: courseId, item_id: itemId, action: 'flagged_safety', notes: comment || 'Flagged for safety review.' });
      }
      await pgReviewQueue(setTopbar, navigate);
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Action failed.'; errEl.style.display = ''; }
      document.querySelectorAll('#rq-detail button').forEach(b => { b.disabled = false; });
    }
  };
}

// ── pgOutcomes — Outcomes & Trends ────────────────────────────────────────────
export async function pgOutcomes(setTopbar, navigate) {
  setTopbar('Outcomes & Trends', `<button class="btn btn-primary btn-sm" onclick="window._showRecordOutcome()">+ Record Outcome</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let agg = {}, allOutcomes = [], courses = [];
  try {
    [agg, allOutcomes, courses] = await Promise.all([
      api.aggregateOutcomes().catch(() => ({})),
      api.listOutcomes().then(r => r?.items || []).catch(() => []),
      api.listCourses().then(r => r?.items || []).catch(() => []),
    ]);
  } catch (_) {}

  const byCourse = {};
  allOutcomes.forEach(o => {
    if (!byCourse[o.course_id]) byCourse[o.course_id] = {};
    if (!byCourse[o.course_id][o.template_id]) byCourse[o.course_id][o.template_id] = [];
    byCourse[o.course_id][o.template_id].push(o);
  });

  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = c; });

  const trendRows = Object.entries(byCourse).map(([cid, byTemplate]) => {
    const course = courseMap[cid] || {};
    return Object.entries(byTemplate).map(([tid, pts]) => {
      const sorted      = pts.sort((a, b) => (a.administered_at || '').localeCompare(b.administered_at || ''));
      const baseline    = sorted.find(p => p.measurement_point === 'baseline');
      const latest      = sorted[sorted.length - 1];
      const baseScore   = baseline?.score_numeric;
      const latestScore = latest?.score_numeric;
      let delta = null, pct = null, responder = false;
      if (baseScore != null && latestScore != null && baseScore !== 0) {
        delta     = baseScore - latestScore;
        pct       = Math.round(delta / baseScore * 100);
        responder = pct >= 50;
      }
      const sparkPts = sorted.map(p => p.score_numeric).filter(v => v != null);
      const maxV = Math.max(...sparkPts, 1), minV = Math.min(...sparkPts, 0), range = maxV - minV || 1;
      const svgPts = sparkPts.map((v, i) => {
        const x = sparkPts.length < 2 ? 50 : Math.round(i / (sparkPts.length - 1) * 100);
        const y = Math.round((1 - (v - minV) / range) * 28);
        return `${x},${y}`;
      }).join(' ');

      return `<tr>
        <td style="font-size:12px">
          <div style="font-weight:500">${course.condition_slug?.replace(/-/g,' ') || cid.slice(0,8)+'…'}</div>
          <div style="font-size:10.5px;color:var(--text-tertiary)">${course.modality_slug || ''}</div>
        </td>
        <td style="font-size:11.5px;font-weight:600;color:var(--text-secondary)">${tid}</td>
        <td class="mono" style="font-size:12px">${baseScore ?? '—'}</td>
        <td class="mono" style="font-size:12px">${latestScore ?? '—'}</td>
        <td style="font-size:12px;color:${delta == null ? 'var(--text-tertiary)' : delta > 0 ? 'var(--green)' : 'var(--red)'}">
          ${delta == null ? '—' : (delta > 0 ? '↓' : '↑') + Math.abs(delta).toFixed(1)}</td>
        <td class="mono" style="font-size:12px">${pct == null ? '—' : pct + '%'}</td>
        <td>${responder
          ? '<span style="color:var(--green);font-size:11px;font-weight:600">✓ Responder</span>'
          : pct != null ? '<span style="color:var(--text-tertiary);font-size:11px">Non-responder</span>' : '—'}</td>
        <td><svg width="100" height="32" viewBox="0 0 100 32" style="overflow:visible">
          ${sparkPts.length > 1 ? `<polyline points="${svgPts}" fill="none" stroke="var(--teal)" stroke-width="1.5" stroke-linejoin="round"/>` : ''}
          ${sparkPts.map((v, i) => {
            const x = sparkPts.length < 2 ? 50 : Math.round(i / (sparkPts.length - 1) * 100);
            const y = Math.round((1 - (v - minV) / range) * 28);
            return `<circle cx="${x}" cy="${y}" r="2.5" fill="var(--teal)"/>`;
          }).join('')}
        </svg></td>
      </tr>`;
    }).join('');
  }).join('');

  // Build per-condition responder breakdown from trendRows data
  const condResponders = {};
  Object.entries(byCourse).forEach(([cid, byTemplate]) => {
    const course = courseMap[cid] || {};
    const cond = course.condition_slug?.replace(/-/g, ' ') || 'Unknown';
    if (!condResponders[cond]) condResponders[cond] = { responders: 0, total: 0 };
    Object.values(byTemplate).forEach(pts => {
      const sorted = pts.sort((a, b) => (a.administered_at || '').localeCompare(b.administered_at || ''));
      const baseline = sorted.find(p => p.measurement_point === 'baseline');
      const latest = sorted[sorted.length - 1];
      const bs = baseline?.score_numeric, ls = latest?.score_numeric;
      if (bs != null && ls != null && bs !== 0) {
        condResponders[cond].total++;
        const pct = Math.round((bs - ls) / bs * 100);
        if (pct >= 50) condResponders[cond].responders++;
      }
    });
  });
  const condBreakdown = Object.entries(condResponders).filter(([, v]) => v.total > 0);

  el.innerHTML = `
    <div class="page-section">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:${condBreakdown.length ? '16px' : '24px'}">
        ${metricCard('Responders',      agg.responders ?? '—',                                         'var(--teal)',   '≥50% symptom reduction')}
        ${metricCard('Avg PHQ-9 Drop',  agg.avg_phq9_drop != null ? agg.avg_phq9_drop + ' pts' : '—', 'var(--blue)',   'Across courses with data')}
        ${metricCard('Courses Tracked', agg.courses_with_outcomes ?? '—',                              'var(--violet)', 'With outcome measurements')}
      </div>
      ${condBreakdown.length ? `
      <div class="card" style="margin-bottom:24px;padding:16px 20px">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:14px">Responder Rate by Condition</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${condBreakdown.map(([cond, data]) => {
            const rate = data.total > 0 ? Math.round(data.responders / data.total * 100) : 0;
            return `<div>
              <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px">
                <span style="color:var(--text-primary);font-weight:500">${cond}</span>
                <span style="color:${rate >= 50 ? 'var(--green)' : rate >= 30 ? 'var(--amber)' : 'var(--red)'}">${rate}% (${data.responders}/${data.total})</span>
              </div>
              <div style="height:6px;border-radius:3px;background:var(--border)">
                <div style="height:6px;border-radius:3px;background:${rate >= 50 ? 'var(--teal)' : rate >= 30 ? 'var(--amber)' : 'var(--red)'};width:${rate}%;transition:width 0.4s"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <div id="record-outcome-panel" style="display:none;margin-bottom:16px">
        <div class="card" style="padding:20px">
          <div style="font-size:13px;font-weight:600;margin-bottom:14px">Record Outcome Measurement</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Course</label>
              <select id="oc-course" class="form-control" style="font-size:12.5px">
                <option value="">Select course…</option>
                ${courses.map(c => `<option value="${c.id}|${c.patient_id}">${c.condition_slug?.replace(/-/g,' ')} · ${c.modality_slug} (${c.status})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Assessment Template</label>
              <select id="oc-template" class="form-control" style="font-size:12.5px">
                ${FALLBACK_ASSESSMENT_TEMPLATES.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Measurement Point</label>
              <select id="oc-point" class="form-control" style="font-size:12.5px">
                <option value="baseline">Baseline (pre-treatment)</option>
                <option value="mid">Mid-course</option>
                <option value="post">Post-treatment</option>
                <option value="follow_up">Follow-up</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:12px;margin-bottom:12px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Score</label>
              <input id="oc-score" class="form-control" type="number" step="0.1" placeholder="e.g. 14" style="font-size:12.5px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Notes (optional)</label>
              <input id="oc-notes" class="form-control" placeholder="Clinical context…" style="font-size:12.5px">
            </div>
          </div>
          <div id="oc-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div>
          <div style="display:flex;gap:8px">
            <button class="btn" onclick="document.getElementById('record-outcome-panel').style.display='none'">Cancel</button>
            <button class="btn btn-primary" onclick="window._saveOutcome()">Save Measurement</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <span style="font-weight:600;font-size:14px">Outcome Measurements</span>
        </div>
        <div style="padding:16px;overflow-x:auto">
          ${trendRows
            ? `<table class="ds-table">
                <thead><tr><th>Course</th><th>Template</th><th>Baseline</th><th>Latest</th><th>Change</th><th>% Drop</th><th>Response</th><th>Trend</th></tr></thead>
                <tbody>${trendRows}</tbody>
              </table>`
            : emptyState('◫', 'No outcome measurements yet. Click "+ Record Outcome" to start tracking.')
          }
        </div>
      </div>
    </div>`;

  window._showRecordOutcome = () => {
    document.getElementById('record-outcome-panel').style.display = '';
  };

  window._saveOutcome = async function() {
    const errEl    = document.getElementById('oc-error');
    errEl.style.display = 'none';
    const courseVal = document.getElementById('oc-course')?.value || '';
    const [courseId, patientId] = courseVal.split('|');
    const score = document.getElementById('oc-score')?.value;
    if (!courseId || !patientId) { errEl.textContent = 'Select a course.'; errEl.style.display = ''; return; }
    if (!score) { errEl.textContent = 'Enter a score.'; errEl.style.display = ''; return; }
    const tid = document.getElementById('oc-template')?.value || 'PHQ-9';
    try {
      await api.recordOutcome({
        patient_id:        patientId,
        course_id:         courseId,
        template_id:       tid,
        template_title:    tid,
        score:             score,
        score_numeric:     parseFloat(score),
        measurement_point: document.getElementById('oc-point')?.value || 'mid',
        notes:             document.getElementById('oc-notes')?.value || null,
      });
      await pgOutcomes(setTopbar, navigate);
    } catch (e) {
      errEl.textContent = e.message || 'Save failed.';
      errEl.style.display = '';
    }
  };
}

// ── pgAdverseEvents — Clinic-wide AE monitoring ───────────────────────────────
export async function pgAdverseEvents(setTopbar, navigate) {
  setTopbar('Adverse Events Monitor', `<button class="btn btn-sm" onclick="window._nav('courses')">← Courses</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let aes = [], courses = [], patients = [];
  try {
    [aes, courses, patients] = await Promise.all([
      api.listAdverseEvents().then(r => r?.items || []).catch(() => []),
      api.listCourses().then(r => r?.items || []).catch(() => []),
      api.listPatients().then(r => r?.items || []).catch(() => []),
    ]);
  } catch {}

  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = c; });
  const patMap = {};
  patients.forEach(p => { patMap[p.id] = `${p.first_name} ${p.last_name}`; });

  const counts = { mild: 0, moderate: 0, severe: 0, serious: 0 };
  aes.forEach(ae => { if (counts[ae.severity] !== undefined) counts[ae.severity]++; });

  const SEV_COLOR = { mild: 'var(--text-secondary)', moderate: 'var(--amber)', severe: 'var(--red)', serious: 'var(--red)' };

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
      ${['mild','moderate','severe','serious'].map(s => `
        <div class="metric-card" style="cursor:pointer" onclick="window._aeFilter('${s}')">
          <div class="metric-label">${s.charAt(0).toUpperCase()+s.slice(1)}</div>
          <div class="metric-value" style="color:${SEV_COLOR[s]}">${counts[s]}</div>
          <div class="metric-delta">reported events</div>
        </div>`).join('')}
    </div>

    <div class="card" style="margin-bottom:16px">
      <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <select id="ae-sev-filter" class="form-control" style="width:auto;font-size:12px" onchange="window._aeFilter()">
          <option value="">All Severities</option>
          <option value="mild">Mild</option>
          <option value="moderate">Moderate</option>
          <option value="severe">Severe</option>
          <option value="serious">Serious</option>
        </select>
        <input id="ae-search" class="form-control" placeholder="Search event type or notes…" style="flex:1;min-width:180px;font-size:12px" oninput="window._aeFilter()">
        <span id="ae-count" style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${aes.length} events</span>
      </div>
      <div style="overflow-x:auto">
        ${aes.length === 0 ? `<div style="padding:32px">${emptyState('◻', 'No adverse events reported. Events are logged from the Course Detail page.')}</div>` : `
        <table class="ds-table" id="ae-table">
          <thead><tr><th>Date</th><th>Patient</th><th>Course</th><th>Event Type</th><th>Severity</th><th>Onset</th><th>Action</th><th>Resolution</th><th></th></tr></thead>
          <tbody id="ae-tbody">
            ${aes.map(ae => {
              const sev = ae.severity || 'mild';
              const sc = SEV_COLOR[sev] || 'var(--text-secondary)';
              const course = courseMap[ae.course_id] || {};
              const patName = patMap[ae.patient_id] || (course.patient_id ? patMap[course.patient_id] : '') || '—';
              return `<tr data-sev="${sev}" data-text="${(ae.event_type||'') + ' ' + (ae.notes||'')}">
                <td style="font-size:11.5px;color:var(--text-secondary);white-space:nowrap">${ae.occurred_at ? ae.occurred_at.split('T')[0] : ae.created_at?.split('T')[0] || '—'}</td>
                <td style="font-size:12px">${patName}</td>
                <td style="font-size:12px">${course.condition_slug ? course.condition_slug.replace(/-/g,' ') + ' · ' + (course.modality_slug||'') : '—'}</td>
                <td style="font-size:12.5px;font-weight:500">${ae.event_type || '—'}</td>
                <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${sc}22;color:${sc};font-weight:600">${sev}</span></td>
                <td style="font-size:11.5px">${ae.onset_timing || '—'}</td>
                <td style="font-size:11.5px">${ae.action_taken || '—'}</td>
                <td style="font-size:11.5px">${ae.resolution || ae.resolved ? '<span style="color:var(--green)">Resolved</span>' : '<span style="color:var(--amber)">Ongoing</span>'}</td>
                <td>${ae.course_id ? `<button class="btn btn-sm" onclick="window._openCourse('${ae.course_id}')">View →</button>` : ''}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>
    </div>`;

  window._aeFilter = function(directSev) {
    const sevEl = document.getElementById('ae-sev-filter');
    const q     = (document.getElementById('ae-search')?.value || '').toLowerCase();
    if (directSev && sevEl) sevEl.value = directSev;
    const sev = sevEl?.value || '';
    const rows = document.querySelectorAll('#ae-tbody tr');
    let visible = 0;
    rows.forEach(row => {
      const matchSev  = !sev  || row.dataset.sev === sev;
      const matchText = !q    || (row.dataset.text || '').toLowerCase().includes(q);
      row.style.display = matchSev && matchText ? '' : 'none';
      if (matchSev && matchText) visible++;
    });
    const countEl = document.getElementById('ae-count');
    if (countEl) countEl.textContent = visible + ' event' + (visible !== 1 ? 's' : '');
  };
}

// ── pgProtocolRegistry — Browse registry protocols ────────────────────────────
export async function pgProtocolRegistry(setTopbar) {
  setTopbar('Protocol Registry', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  try {
    const [protoData, condData] = await Promise.all([
      api.protocols(),
      api.conditions().catch(() => ({ items: [] })),
    ]);
    const items   = protoData?.items || [];
    const conds   = condData?.items  || [];
    const condMap = {};
    conds.forEach(c => { condMap[c.id || c.Condition_ID] = c.name || c.Condition_Name || c.id; });

    el.innerHTML = `
      <div class="page-section">
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
          <input id="pr-search" class="form-control" placeholder="Search protocols, conditions, modalities…" style="flex:1;min-width:200px;font-size:12.5px" oninput="window._filterProtocols()">
          <select id="pr-grade" class="form-control" style="width:auto;font-size:12.5px" onchange="window._filterProtocols()">
            <option value="">All Evidence Grades</option>
            <option value="EV-A">EV-A (Highest)</option>
            <option value="EV-B">EV-B</option>
            <option value="EV-C">EV-C</option>
            <option value="EV-D">EV-D</option>
          </select>
          <select id="pr-label" class="form-control" style="width:auto;font-size:12.5px" onchange="window._filterProtocols()">
            <option value="">On &amp; Off-label</option>
            <option value="on">On-label only</option>
            <option value="off">Off-label only</option>
          </select>
        </div>
        <div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary)">${items.length} registry protocols</div>
        <div id="pr-list" style="display:flex;flex-direction:column;gap:8px">
          ${items.map(p => renderProtocolCard(p, condMap)).join('')}
        </div>
      </div>`;

    window._allProtocols = items;
    window._condMap      = condMap;

    bindProtocolRegistry();

    window._filterProtocols = function() {
      const q     = (document.getElementById('pr-search')?.value || '').toLowerCase();
      const grade = document.getElementById('pr-grade')?.value || '';
      const label = document.getElementById('pr-label')?.value || '';
      const visible = (window._allProtocols || []).filter(p => {
        const text = `${p.name} ${p.condition_id} ${p.modality_id} ${p.target_region}`.toLowerCase();
        const isOn = String(p.on_label_vs_off_label || '').toLowerCase().startsWith('on');
        return (!q || text.includes(q))
          && (!grade || p.evidence_grade === grade)
          && (!label || (label === 'on' ? isOn : !isOn));
      });
      const listEl = document.getElementById('pr-list');
      if (listEl) listEl.innerHTML = visible.length
        ? visible.map(p => renderProtocolCard(p, window._condMap || {})).join('')
        : emptyState('◇', 'No protocols match filter.');
      bindProtocolRegistry();
    };
  } catch (e) {
    el.innerHTML = `<div style="padding:32px">${emptyState('◇', 'Protocol registry unavailable. Ensure backend is running.')}</div>`;
  }
}

function renderProtocolCard(p, condMap = {}) {
  const isOn = String(p.on_label_vs_off_label || '').toLowerCase().startsWith('on');
  const pid = (p.id || '').replace(/'/g, '');
  return `<div class="card" style="padding:0;overflow:hidden">
    <div style="padding:16px 20px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--bg-card-hover)'" onmouseout="this.style.background=''" onclick="window._toggleProtoDetail('${pid}')">
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-tertiary)">${p.id || ''}</span>
            <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${p.name || ''}</span>
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);display:flex;gap:12px;flex-wrap:wrap">
            ${p.condition_id  ? `<span>Condition: ${condMap[p.condition_id] || p.condition_id}</span>` : ''}
            ${p.modality_id   ? `<span>Modality: ${p.modality_id}</span>` : ''}
            ${p.target_region ? `<span>Target: ${p.target_region}</span>` : ''}
            ${p.frequency_hz  ? `<span>${p.frequency_hz} Hz</span>` : ''}
            ${p.sessions_per_week ? `<span>${p.sessions_per_week}×/wk</span>` : ''}
            ${p.total_course  ? `<span>${p.total_course}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          ${evidenceBadge(p.evidence_grade)}
          ${labelBadge(isOn)}
          <span style="font-size:10px;color:var(--text-tertiary)" id="proto-chevron-${pid}">▼</span>
        </div>
      </div>
    </div>
    <div id="proto-detail-${pid}" style="display:none;border-top:1px solid var(--border);padding:16px 20px;background:rgba(0,212,188,0.02)">
      <div class="g2" style="margin-bottom:14px">
        <div>
          ${[
            ['Protocol ID',      p.id],
            ['Condition',        condMap[p.condition_id] || p.condition_id || '—'],
            ['Phenotype',        p.phenotype_id || '—'],
            ['Modality',         p.modality_id || '—'],
            ['Device',           p.device_id_if_specific || 'Any compatible'],
            ['Target Region',    p.target_region || '—'],
            ['Laterality',       p.laterality || '—'],
          ].map(([k,v]) => `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--text-tertiary);width:120px;flex-shrink:0">${k}</span><span style="color:var(--text-primary)">${v}</span></div>`).join('')}
        </div>
        <div>
          ${[
            ['Frequency',        p.frequency_hz ? p.frequency_hz + ' Hz' : '—'],
            ['Intensity',        p.intensity || '—'],
            ['Session Duration', p.session_duration || '—'],
            ['Sessions/Week',    p.sessions_per_week ? p.sessions_per_week + '×/wk' : '—'],
            ['Total Course',     p.total_course || '—'],
            ['Coil/Placement',   p.coil_or_electrode_placement || '—'],
            ['Review Required',  p.clinician_review_required === 'Yes' ? '<span style="color:var(--amber)">Yes</span>' : '<span style="color:var(--green)">No</span>'],
          ].map(([k,v]) => `<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--text-tertiary);width:120px;flex-shrink:0">${k}</span><span style="color:var(--text-primary)">${v}</span></div>`).join('')}
        </div>
      </div>
      ${p.monitoring_requirements ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:12px;padding:10px;background:rgba(255,181,71,0.06);border-radius:6px;border-left:3px solid var(--amber)">Monitoring: ${p.monitoring_requirements}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="window._startCourseFromProtocol('${pid}')">+ Create Treatment Course →</button>
        <button class="btn btn-sm" onclick="window._toggleProtoDetail('${pid}')">Close</button>
      </div>
    </div>
  </div>`;
}

// bind in pgProtocolRegistry
function bindProtocolRegistry() {
  window._toggleProtoDetail = function(id) {
    const panel = document.getElementById('proto-detail-' + id);
    const chev  = document.getElementById('proto-chevron-' + id);
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    if (chev) chev.textContent = open ? '▼' : '▲';
  };

  window._startCourseFromProtocol = function(protocolId) {
    window._wizardProtocolId = protocolId;
    window._nav('protocol-wizard');
  };
}

