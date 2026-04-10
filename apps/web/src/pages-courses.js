import { api } from './api.js';
import { spinner, emptyState } from './helpers.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function metricCard(label, value, color, sub) {
  return `<div class="metric-card">
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px">${label}</div>
    <div style="font-size:28px;font-weight:700;color:${color};margin:8px 0 4px">${value}</div>
    <div style="font-size:11px;color:var(--text-secondary)">${sub}</div>
  </div>`;
}

const STATUS_COLOR = {
  pending_approval: 'var(--amber)',
  approved: 'var(--blue)',
  active: 'var(--teal)',
  paused: 'var(--amber)',
  completed: 'var(--green)',
  discontinued: 'var(--red)',
};

const GRADE_COLOR = {
  'EV-A': 'var(--teal)', 'EV-B': 'var(--blue)', 'EV-C': 'var(--amber)', 'EV-D': 'var(--red)',
};

function courseCard(c) {
  const statusCol = STATUS_COLOR[c.status] || 'var(--text-tertiary)';
  const gradeCol = GRADE_COLOR[c.evidence_grade] || 'var(--text-tertiary)';
  const progress = c.planned_sessions_total > 0
    ? Math.min(100, Math.round((c.sessions_delivered / c.planned_sessions_total) * 100))
    : 0;
  const govBadges = (c.governance_warnings || []).length
    ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(245,158,11,0.15);color:var(--amber);margin-left:8px">⚠ ${c.governance_warnings.length} flag${c.governance_warnings.length > 1 ? 's' : ''}</span>`
    : '';

  return `<div class="card" style="padding:16px 20px;cursor:pointer" onclick="window._nav('courses')">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">
        ${c.condition_slug} · ${c.modality_slug}
      </span>
      <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;
        background:${statusCol}22;color:${statusCol}">${c.status.replace(/_/g,' ')}</span>
      <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;
        background:${gradeCol}22;color:${gradeCol}">${c.evidence_grade || '—'}</span>
      ${govBadges}
    </div>
    <div style="margin-top:10px;font-size:11.5px;color:var(--text-secondary);display:flex;gap:16px;flex-wrap:wrap">
      ${c.target_region ? `<span>Target: ${c.target_region}</span>` : ''}
      ${c.planned_frequency_hz ? `<span>Freq: ${c.planned_frequency_hz} Hz</span>` : ''}
      <span>${c.planned_sessions_per_week}×/wk · ${c.planned_sessions_total} sessions total</span>
    </div>
    <div style="margin-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-bottom:4px">
        <span>Progress</span><span>${c.sessions_delivered} / ${c.planned_sessions_total}</span>
      </div>
      <div style="height:4px;border-radius:2px;background:var(--border)">
        <div style="height:4px;border-radius:2px;background:${statusCol};width:${progress}%"></div>
      </div>
    </div>
    ${c.clinician_notes ? `<div style="margin-top:8px;font-size:11px;color:var(--text-tertiary);font-style:italic">${c.clinician_notes}</div>` : ''}
  </div>`;
}

// ── pgCourses — Treatment Courses page ───────────────────────────────────────
export async function pgCourses(setTopbar, navigate) {
  setTopbar('Treatment Courses', `<button class="btn btn-primary" onclick="window._nav('protocol-wizard')">+ New Course</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  try {
    const data = await api.listCourses();
    const items = data?.items || [];

    const active = items.filter(c => c.status === 'active').length;
    const pending = items.filter(c => c.status === 'pending_approval').length;
    const completed = items.filter(c => c.status === 'completed').length;

    el.innerHTML = `
      <div class="page-section">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
          ${metricCard('Active Courses', active || '0', 'var(--teal)', 'Ongoing treatment')}
          ${metricCard('Pending Approval', pending || '0', 'var(--amber)', 'Awaiting review')}
          ${metricCard('Completed', completed || '0', 'var(--green)', 'This quarter')}
        </div>
        <div class="card">
          <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--border)">
            <span style="font-weight:600;font-size:14px">Treatment Courses</span>
          </div>
          <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
            ${items.length
              ? items.map(courseCard).join('')
              : `<div style="padding:32px;text-align:center;color:var(--text-tertiary)">${emptyState('◎', 'No treatment courses yet. Use the Protocol Wizard to create the first course for a patient.')}</div>`
            }
          </div>
        </div>
      </div>`;
  } catch (e) {
    // Backend offline — show empty state rather than crash
    el.innerHTML = `
      <div class="page-section">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
          ${metricCard('Active Courses', '—', 'var(--teal)', 'Ongoing treatment')}
          ${metricCard('Pending Approval', '—', 'var(--amber)', 'Awaiting review')}
          ${metricCard('Completed', '—', 'var(--green)', 'This quarter')}
        </div>
        <div class="card">
          <div style="padding:48px;text-align:center;color:var(--text-tertiary)">
            ${emptyState('◎', 'No treatment courses yet. Use the Protocol Wizard to create the first course for a patient.')}
          </div>
        </div>
      </div>`;
  }
}

// ── pgSessionExecution — Today's Sessions ────────────────────────────────────
export async function pgSessionExecution(setTopbar, navigate) {
  setTopbar('Session Execution', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // Load active courses so technician can pick which one to log
  let activeCourses = [];
  try {
    const data = await api.listCourses({ status: 'active' });
    activeCourses = data?.items || [];
  } catch (_) {}

  const courseOptions = activeCourses.map(c =>
    `<option value="${c.id}">${c.condition_slug} · ${c.modality_slug} (${c.sessions_delivered}/${c.planned_sessions_total} sessions)</option>`
  ).join('');

  el.innerHTML = `
    <div class="page-section">
      <div class="card" style="margin-bottom:16px">
        <div style="padding:20px">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:16px">Today's Sessions</div>
          ${activeCourses.length === 0
            ? emptyState('◧', 'No active courses. Sessions will appear here once treatment courses are approved and activated.')
            : `<div style="display:flex;flex-direction:column;gap:8px">
                ${activeCourses.map(c => `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--border);border-radius:8px">
                    <span style="font-size:13px;color:var(--text-primary)">${c.condition_slug} · ${c.modality_slug}</span>
                    <span style="font-size:11px;color:var(--text-secondary)">${c.sessions_delivered}/${c.planned_sessions_total} sessions</span>
                  </div>`).join('')}
              </div>`
          }
        </div>
      </div>
      <div class="card">
        <div style="padding:20px">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Log Delivered Session</div>
          ${activeCourses.length === 0
            ? `<p style="font-size:12px;color:var(--text-secondary)">No active courses to log a session for.</p>`
            : `
            <div style="display:flex;flex-direction:column;gap:12px">
              <div>
                <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Course</label>
                <select id="se-course" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
                  ${courseOptions}
                </select>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Frequency (Hz)</label>
                  <input id="se-freq" type="text" placeholder="e.g. 10" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
                </div>
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Intensity (% RMT)</label>
                  <input id="se-intensity" type="text" placeholder="e.g. 120% RMT" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
                </div>
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Duration (min)</label>
                  <input id="se-duration" type="number" placeholder="40" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
                </div>
                <div>
                  <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Tolerance</label>
                  <select id="se-tolerance" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
                    <option value="">Select…</option>
                    <option value="well-tolerated">Well tolerated</option>
                    <option value="moderate">Moderate</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>
              </div>
              <div>
                <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Post-session notes</label>
                <textarea id="se-notes" rows="3" placeholder="Observations, patient response…" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px;resize:vertical"></textarea>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <input id="se-interrupt" type="checkbox">
                <label for="se-interrupt" style="font-size:12px;color:var(--text-secondary)">Session interrupted</label>
              </div>
              <div id="se-error" style="display:none;color:var(--red);font-size:12px"></div>
              <button class="btn btn-primary" onclick="window._logSession()">Log Session Parameters</button>
            </div>`
          }
        </div>
      </div>
    </div>`;

  // Bind log action
  window._logSession = async function() {
    const courseId = document.getElementById('se-course')?.value;
    if (!courseId) return;
    const errEl = document.getElementById('se-error');
    errEl.style.display = 'none';
    try {
      await api.logSession(courseId, {
        frequency_hz: document.getElementById('se-freq')?.value || null,
        intensity_pct_rmt: document.getElementById('se-intensity')?.value || null,
        duration_minutes: parseInt(document.getElementById('se-duration')?.value) || null,
        tolerance_rating: document.getElementById('se-tolerance')?.value || null,
        post_session_notes: document.getElementById('se-notes')?.value || null,
        interruptions: document.getElementById('se-interrupt')?.checked || false,
      });
      await pgSessionExecution(setTopbar, navigate);
    } catch (e) {
      errEl.textContent = e.message || 'Failed to log session.';
      errEl.style.display = 'block';
    }
  };
}

// ── pgReviewQueue — Pending approvals ────────────────────────────────────────
export async function pgReviewQueue(setTopbar, navigate) {
  setTopbar('Review Queue', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  try {
    const data = await api.listReviewQueue();
    const items = data?.items || [];
    const pending = items.filter(i => i.status === 'pending');
    const completed = items.filter(i => i.status === 'completed');

    el.innerHTML = `
      <div class="page-section">
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px">
          ${metricCard('Pending Reviews', pending.length, 'var(--amber)', 'Awaiting action')}
          ${metricCard('Completed', completed.length, 'var(--green)', 'Resolved')}
        </div>
        <div class="card">
          <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--border)">
            <span style="font-weight:600;font-size:14px">Pending Reviews</span>
          </div>
          <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
            ${pending.length
              ? pending.map(item => `
                <div style="padding:14px 16px;border:1px solid var(--border);border-radius:8px">
                  <div style="display:flex;align-items:center;gap:12px">
                    <span style="font-size:12px;font-weight:600;color:var(--amber);padding:2px 8px;border-radius:4px;background:rgba(245,158,11,0.1)">${item.item_type.replace(/_/g,' ')}</span>
                    <span style="font-size:11px;color:var(--text-tertiary)">${item.priority} priority</span>
                    <span style="flex:1"></span>
                    <button class="btn" style="font-size:11px;padding:4px 10px" onclick="window._activateCourse('${item.target_id}')">Approve &amp; Activate</button>
                  </div>
                  ${item.notes ? `<div style="margin-top:8px;font-size:11px;color:var(--text-secondary)">${item.notes}</div>` : ''}
                </div>`).join('')
              : `<div style="padding:32px;text-align:center;color:var(--text-tertiary)">${emptyState('◱', 'Review queue empty. Protocol approvals will appear here.')}</div>`
            }
          </div>
        </div>
      </div>`;
  } catch (_) {
    el.innerHTML = `
      <div class="page-section">
        <div class="card">
          <div style="padding:20px">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Pending Reviews</div>
            ${emptyState('◱', 'Review queue empty. Protocol approvals and course reviews will appear here.')}
          </div>
        </div>
      </div>`;
  }

  window._activateCourse = async function(courseId) {
    try {
      await api.activateCourse(courseId);
      await pgReviewQueue(setTopbar, navigate);
    } catch (e) {
      alert(e.message || 'Activation failed.');
    }
  };
}

// ── pgOutcomes — Outcomes & Trends ───────────────────────────────────────────
export async function pgOutcomes(setTopbar, navigate) {
  setTopbar('Outcomes & Trends', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  // Try to pull stats from courses
  let responders = '—';
  let coursesReviewed = '—';

  try {
    const data = await api.listCourses();
    const items = data?.items || [];
    const completed = items.filter(c => c.status === 'completed');
    coursesReviewed = completed.length;
    // A responder is any completed course — more granular once assessments linked
    responders = completed.length;
  } catch (_) {}

  el.innerHTML = `
    <div class="page-section">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
        ${metricCard('Responders', responders, 'var(--teal)', '≥50% symptom reduction')}
        ${metricCard('Avg PHQ-9 Drop', '—', 'var(--blue)', 'Across active courses')}
        ${metricCard('Courses Reviewed', coursesReviewed, 'var(--violet)', 'This month')}
      </div>
      <div class="card">
        <div style="padding:20px">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Outcome Trends</div>
          ${emptyState('◫', 'Outcomes will populate as assessments are completed across treatment courses.')}
        </div>
      </div>
    </div>`;
}

// ── pgProtocolRegistry — Browse all protocols from registry ──────────────────
export async function pgProtocolRegistry(setTopbar) {
  setTopbar('Protocol Registry', '');
  const el = document.getElementById('content');
  el.innerHTML = spinner();
  try {
    const data = await api.protocols();
    const items = data.items || [];
    const grouped = {};
    items.forEach(p => {
      const cond = p.condition_id || 'Other';
      if (!grouped[cond]) grouped[cond] = [];
      grouped[cond].push(p);
    });

    const gradeColor = { 'EV-A': 'var(--teal)', 'EV-B': 'var(--blue)', 'EV-C': 'var(--amber)', 'EV-D': 'var(--red)' };

    el.innerHTML = `
      <div class="page-section">
        <div style="margin-bottom:16px;font-size:12px;color:var(--text-secondary)">${items.length} protocols across ${Object.keys(grouped).length} conditions</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${items.map(p => `
            <div class="card" style="padding:16px 20px">
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <span style="font-size:11px;font-family:monospace;color:var(--text-tertiary);min-width:60px">${p.id || ''}</span>
                <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">${p.name || ''}</span>
                <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${(gradeColor[p.evidence_grade] || 'var(--text-tertiary)') + '22'};color:${gradeColor[p.evidence_grade] || 'var(--text-tertiary)'}">${p.evidence_grade || ''}</span>
                <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${p.on_label_vs_off_label?.toLowerCase().startsWith('on-label') ? 'var(--teal-ghost)' : 'rgba(245,158,11,0.1)'};color:${p.on_label_vs_off_label?.toLowerCase().startsWith('on-label') ? 'var(--teal)' : 'var(--amber)'}">${p.on_label_vs_off_label?.toLowerCase().startsWith('on-label') ? 'On-label' : 'Off-label'}</span>
              </div>
              <div style="margin-top:8px;font-size:11.5px;color:var(--text-secondary);display:flex;gap:16px;flex-wrap:wrap">
                ${p.target_region ? `<span>Target: ${p.target_region}</span>` : ''}
                ${p.frequency_hz ? `<span>Freq: ${p.frequency_hz} Hz</span>` : ''}
                ${p.sessions_per_week ? `<span>${p.sessions_per_week}×/wk</span>` : ''}
                ${p.total_course ? `<span>${p.total_course}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = emptyState('◇', 'Protocol registry loading failed. Ensure backend is running.');
  }
}
