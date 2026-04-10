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

  return `<div class="card" style="padding:16px 20px;cursor:pointer" onclick="window._openCourse('${c.id}')">
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

  window._openCourse = function(id) {
    window._selectedCourseId = id;
    window._nav('course-detail');
  };
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
  setTopbar('Outcomes & Trends', `<button class="btn btn-primary btn-sm" onclick="window._showRecordOutcome()">+ Record Outcome</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let agg = { responders: '—', avg_phq9_drop: '—', courses_with_outcomes: '—' };
  let allOutcomes = [];
  let courses = [];

  try {
    [agg, allOutcomes, courses] = await Promise.all([
      api.aggregateOutcomes().catch(() => ({})),
      api.listOutcomes().then(r => r?.items || []).catch(() => []),
      api.listCourses().then(r => r?.items || []).catch(() => []),
    ]);
  } catch (_) {}

  // Group outcomes by course_id + template_id for sparkline display
  const byCourse = {};
  allOutcomes.forEach(o => {
    const key = o.course_id;
    if (!byCourse[key]) byCourse[key] = {};
    if (!byCourse[key][o.template_id]) byCourse[key][o.template_id] = [];
    byCourse[key][o.template_id].push(o);
  });

  const courseMap = {};
  courses.forEach(c => { courseMap[c.id] = c; });

  const trendRows = Object.entries(byCourse).map(([cid, byTemplate]) => {
    const course = courseMap[cid] || {};
    return Object.entries(byTemplate).map(([tid, pts]) => {
      const sorted = pts.sort((a, b) => a.administered_at.localeCompare(b.administered_at));
      const baseline = sorted.find(p => p.measurement_point === 'baseline');
      const latest = sorted[sorted.length - 1];
      const baseScore = baseline?.score_numeric;
      const latestScore = latest?.score_numeric;
      let delta = null, pct = null, responder = false;
      if (baseScore != null && latestScore != null && baseScore !== 0) {
        delta = baseScore - latestScore;
        pct = Math.round(delta / baseScore * 100);
        responder = pct >= 50;
      }
      const sparkPoints = sorted.map(p => p.score_numeric).filter(v => v != null);
      const maxV = Math.max(...sparkPoints, 1);
      const minV = Math.min(...sparkPoints, 0);
      const range = maxV - minV || 1;
      const svgPts = sparkPoints.map((v, i) => {
        const x = sparkPoints.length < 2 ? 50 : Math.round(i / (sparkPoints.length - 1) * 100);
        const y = Math.round((1 - (v - minV) / range) * 30);
        return `${x},${y}`;
      }).join(' ');

      return `<tr>
        <td style="font-size:12px;color:var(--text-secondary)">${course.condition_slug || cid.slice(0,8)+'…'} · ${course.modality_slug || ''}</td>
        <td style="font-weight:600;font-size:12px">${tid}</td>
        <td style="font-size:12px">${baseScore ?? '—'}</td>
        <td style="font-size:12px">${latestScore ?? '—'}</td>
        <td style="font-size:12px;color:${delta == null ? 'var(--text-tertiary)' : delta > 0 ? 'var(--green)' : 'var(--red)'}">
          ${delta == null ? '—' : (delta > 0 ? '↓' : '↑') + Math.abs(delta).toFixed(1)}
        </td>
        <td style="font-size:12px">${pct == null ? '—' : pct + '%'}</td>
        <td>${responder ? '<span style="color:var(--green);font-size:11px;font-weight:600">✓ Responder</span>' : pct != null ? '<span style="color:var(--text-tertiary);font-size:11px">Non-responder</span>' : '—'}</td>
        <td>
          <svg width="100" height="32" viewBox="0 0 100 32" style="overflow:visible">
            ${sparkPoints.length > 1 ? `<polyline points="${svgPts}" fill="none" stroke="var(--teal)" stroke-width="1.5" stroke-linejoin="round"/>` : ''}
            ${sparkPoints.map((v, i) => {
              const x = sparkPoints.length < 2 ? 50 : Math.round(i / (sparkPoints.length - 1) * 100);
              const y = Math.round((1 - (v - minV) / range) * 30);
              return `<circle cx="${x}" cy="${y}" r="2.5" fill="var(--teal)"/>`;
            }).join('')}
          </svg>
        </td>
      </tr>`;
    }).join('');
  }).join('');

  el.innerHTML = `
    <div class="page-section">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
        ${metricCard('Responders', agg.responders ?? '—', 'var(--teal)', '≥50% symptom reduction')}
        ${metricCard('Avg PHQ-9 Drop', agg.avg_phq9_drop != null ? agg.avg_phq9_drop + ' pts' : '—', 'var(--blue)', 'Across courses with data')}
        ${metricCard('Courses Tracked', agg.courses_with_outcomes ?? '—', 'var(--violet)', 'With outcome measurements')}
      </div>

      <div id="record-outcome-panel" style="display:none;margin-bottom:16px">
        <div class="card" style="padding:20px">
          <div style="font-size:13px;font-weight:600;margin-bottom:14px">Record Outcome Measurement</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Course</label>
              <select id="oc-course" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
                <option value="">Select course…</option>
                ${courses.map(c => `<option value="${c.id}|${c.patient_id}">${c.condition_slug} · ${c.modality_slug} (${c.status})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Assessment Template</label>
              <select id="oc-template" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
                <option value="PHQ-9">PHQ-9</option>
                <option value="GAD-7">GAD-7</option>
                <option value="PCL-5">PCL-5</option>
                <option value="ISI">ISI</option>
                <option value="DASS-21">DASS-21</option>
                <option value="NRS-Pain">NRS-Pain</option>
                <option value="ADHD-RS-5">ADHD-RS-5</option>
                <option value="UPDRS-III">UPDRS-III</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Measurement Point</label>
              <select id="oc-point" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
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
              <input id="oc-score" type="number" step="0.1" placeholder="e.g. 14" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
            </div>
            <div>
              <label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Notes (optional)</label>
              <input id="oc-notes" placeholder="Clinical context…" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:13px">
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
        <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--border)">
          <span style="font-weight:600;font-size:14px">Outcome Measurements</span>
        </div>
        <div style="padding:16px;overflow-x:auto">
          ${trendRows
            ? `<table class="ds-table">
                <thead><tr><th>Course</th><th>Template</th><th>Baseline</th><th>Latest</th><th>Change</th><th>% Drop</th><th>Response</th><th>Trend</th></tr></thead>
                <tbody>${trendRows}</tbody>
              </table>`
            : `<div style="padding:32px;text-align:center;color:var(--text-tertiary)">${emptyState('◫', 'No outcome measurements yet. Click "+ Record Outcome" to add the first measurement for a treatment course.')}</div>`
          }
        </div>
      </div>
    </div>`;

  window._showRecordOutcome = () => {
    document.getElementById('record-outcome-panel').style.display = '';
  };

  window._saveOutcome = async function() {
    const errEl = document.getElementById('oc-error');
    errEl.style.display = 'none';
    const courseVal = document.getElementById('oc-course')?.value || '';
    const [courseId, patientId] = courseVal.split('|');
    const score = document.getElementById('oc-score')?.value;
    if (!courseId || !patientId) { errEl.textContent = 'Select a course.'; errEl.style.display = 'block'; return; }
    if (!score) { errEl.textContent = 'Enter a score.'; errEl.style.display = 'block'; return; }
    const tid = document.getElementById('oc-template')?.value || 'PHQ-9';
    try {
      await api.recordOutcome({
        patient_id: patientId,
        course_id: courseId,
        template_id: tid,
        template_title: tid,
        score: score,
        score_numeric: parseFloat(score),
        measurement_point: document.getElementById('oc-point')?.value || 'mid',
      });
      await pgOutcomes(setTopbar, navigate);
    } catch (e) {
      errEl.textContent = e.message || 'Save failed.';
      errEl.style.display = 'block';
    }
  };
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

// ── pgCourseDetail — Full course drill-down ───────────────────────────────────
export async function pgCourseDetail(setTopbar, navigate) {
  const id = window._selectedCourseId;
  if (!id) { navigate('courses'); return; }

  const el = document.getElementById('content');
  el.innerHTML = spinner();

  let course = null, sessions = [], outcomes = [], adverse = [];
  try {
    [course, sessions, outcomes, adverse] = await Promise.all([
      api.getCourse(id),
      api.listCourseSessions(id).then(r => r?.items || []).catch(() => []),
      api.listOutcomes({ course_id: id }).then(r => r?.items || []).catch(() => []),
      api.listAdverseEvents({ course_id: id }).then(r => r?.items || []).catch(() => []),
    ]);
  } catch (e) {
    el.innerHTML = '<div class="notice notice-warn">Could not load course.</div>';
    return;
  }
  if (!course) { navigate('courses'); return; }

  const sc = STATUS_COLOR[course.status] || 'var(--text-tertiary)';
  const gc = GRADE_COLOR[course.evidence_grade] || 'var(--text-tertiary)';
  const pct = course.planned_sessions_total > 0
    ? Math.min(100, Math.round(course.sessions_delivered / course.planned_sessions_total * 100))
    : 0;

  setTopbar(
    course.condition_slug + ' · ' + course.modality_slug,
    '<button class="btn btn-ghost btn-sm" onclick="window._nav(\'courses\')">← Courses</button>'
    + (course.status === 'pending_approval' ? ' <button class="btn btn-primary btn-sm" onclick="window._cdActivate()">Approve &amp; Activate</button>' : '')
    + (course.status === 'active' ? ' <button class="btn btn-sm" onclick="window._cdSwitchTab(\'sessions\')">+ Log Session</button>' : '')
  );

  if (!window._cdTab) window._cdTab = 'overview';

  const tabNames = ['overview', 'sessions', 'outcomes', 'adverse events'];

  function rowKV(k, v) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">'
      + '<span style="color:var(--text-tertiary)">' + k + '</span>'
      + '<span style="color:var(--text-primary);font-weight:500">' + (v ?? '—') + '</span></div>';
  }

  function renderTab() {
    const tab = window._cdTab;

    if (tab === 'overview') {
      const params = [
        ['Protocol ID', course.protocol_id],
        ['Condition', course.condition_slug],
        ['Modality', course.modality_slug],
        ['Device', course.device_slug || '—'],
        ['Target Region', course.target_region || '—'],
        ['Frequency', course.planned_frequency_hz ? course.planned_frequency_hz + ' Hz' : '—'],
        ['Intensity', course.planned_intensity || '—'],
        ['Coil / Electrode', course.coil_placement || '—'],
        ['Sessions / Week', course.planned_sessions_per_week],
        ['Total Sessions', course.planned_sessions_total],
        ['Duration / Session', course.planned_session_duration_minutes + ' min'],
      ];
      const status = [
        ['Status', '<span style="font-weight:600;color:' + sc + '">' + course.status.replace(/_/g,' ') + '</span>'],
        ['Evidence Grade', '<span style="font-weight:600;color:' + gc + '">' + (course.evidence_grade || '—') + '</span>'],
        ['Labelling', course.on_label ? '<span style="color:var(--teal)">On-label</span>' : '<span style="color:var(--amber)">Off-label</span>'],
        ['Approved By', course.approved_by || '—'],
        ['Started', course.started_at ? course.started_at.split('T')[0] : '—'],
        ['Completed', course.completed_at ? course.completed_at.split('T')[0] : '—'],
        ['Sessions Delivered', course.sessions_delivered + ' / ' + course.planned_sessions_total],
      ];
      return '<div class="g2">'
        + '<div><div class="card" style="padding:20px">'
        + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:14px">Protocol Parameters</div>'
        + params.map(([k,v]) => rowKV(k, v)).join('')
        + '</div></div>'
        + '<div><div class="card" style="padding:20px;margin-bottom:16px">'
        + '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:14px">Status &amp; Progress</div>'
        + status.map(([k,v]) => rowKV(k, v)).join('')
        + '<div style="margin-top:14px">'
        + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-bottom:5px"><span>Progress</span><span>' + pct + '%</span></div>'
        + '<div style="height:6px;border-radius:3px;background:var(--border)"><div style="height:6px;border-radius:3px;background:' + sc + ';width:' + pct + '%"></div></div>'
        + '</div></div>'
        + (course.governance_warnings && course.governance_warnings.length ? '<div class="card" style="padding:16px;border-color:rgba(245,158,11,0.3)"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--amber);margin-bottom:8px">Governance Flags</div>' + course.governance_warnings.map(w => '<div style="font-size:12px;color:var(--text-secondary);padding:4px 0;border-bottom:1px solid var(--border)">⚠ ' + w + '</div>').join('') + '</div>' : '')
        + (course.clinician_notes ? '<div class="card" style="padding:16px;margin-top:16px"><div style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:8px">Clinician Notes</div><div style="font-size:12px;color:var(--text-secondary);line-height:1.6">' + course.clinician_notes + '</div></div>' : '')
        + '</div></div>';
    }

    if (tab === 'sessions') {
      const canLog = course.status === 'active';
      let body;
      if (sessions.length === 0) {
        body = '<div style="padding:32px;text-align:center;color:var(--text-tertiary)">' + emptyState('◧', 'No sessions logged yet.') + '</div>';
      } else {
        const rows = sessions.map((s, i) => {
          const tolCol = s.tolerance_rating === 'well-tolerated' ? 'var(--teal)' : s.tolerance_rating === 'poor' ? 'var(--red)' : 'var(--text-secondary)';
          return '<tr>'
            + '<td style="font-family:monospace;color:var(--text-tertiary)">' + (i+1) + '</td>'
            + '<td style="color:var(--text-secondary)">' + (s.created_at ? s.created_at.split('T')[0] : '—') + '</td>'
            + '<td>' + (s.device_slug || '—') + '</td>'
            + '<td style="font-family:monospace">' + (s.frequency_hz || '—') + '</td>'
            + '<td style="font-family:monospace">' + (s.intensity_pct_rmt || '—') + '</td>'
            + '<td style="font-family:monospace">' + (s.duration_minutes ? s.duration_minutes + ' min' : '—') + '</td>'
            + '<td><span style="font-size:11px;padding:2px 6px;border-radius:3px;color:' + tolCol + '">' + (s.tolerance_rating || '—') + '</span></td>'
            + '<td style="font-size:11px;color:var(--text-secondary);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (s.post_session_notes || '—') + '</td>'
            + '</tr>';
        }).join('');
        body = '<div class="card" style="overflow-x:auto"><table class="ds-table">'
          + '<thead><tr><th>#</th><th>Date</th><th>Device</th><th>Hz</th><th>Intensity</th><th>Duration</th><th>Tolerance</th><th>Notes</th></tr></thead>'
          + '<tbody>' + rows + '</tbody></table></div>';
      }
      const logBtn = canLog
        ? '<div id="cd-log-form" style="display:none;margin-bottom:16px"><div class="card" style="padding:20px">'
          + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">'
          + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Frequency (Hz)</label><input id="cds-freq" placeholder="e.g. 10" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"></div>'
          + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Intensity (% RMT)</label><input id="cds-int" placeholder="e.g. 120%" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"></div>'
          + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Duration (min)</label><input id="cds-dur" type="number" placeholder="40" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"></div>'
          + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Tolerance</label><select id="cds-tol" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"><option value="">—</option><option value="well-tolerated">Well tolerated</option><option value="moderate">Moderate</option><option value="poor">Poor</option></select></div>'
          + '</div>'
          + '<div style="margin-bottom:12px"><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Notes</label><input id="cds-notes" placeholder="Post-session observations…" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"></div>'
          + '<div id="cds-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div>'
          + '<div style="display:flex;gap:8px"><button class="btn" onclick="document.getElementById(\'cd-log-form\').style.display=\'none\'">Cancel</button><button class="btn btn-primary" onclick="window._cdSaveSession()">Log Session</button></div>'
          + '</div></div>'
        : '';
      return '<div style="margin-bottom:12px">'
        + (canLog ? '<button class="btn btn-primary btn-sm" onclick="document.getElementById(\'cd-log-form\').style.display=\'\'">+ Log Session</button>' : '<div style="font-size:12px;color:var(--text-tertiary);padding:6px 0">Activate course to log sessions.</div>')
        + '</div>' + logBtn + body;
    }

    if (tab === 'outcomes') {
      const rows = outcomes.map(o => '<tr>'
        + '<td style="font-weight:600">' + o.template_id + '</td>'
        + '<td><span style="font-size:11px;padding:2px 6px;border-radius:3px;background:var(--border);color:var(--text-secondary)">' + o.measurement_point + '</span></td>'
        + '<td style="font-family:monospace;color:var(--teal)">' + (o.score ?? '—') + '</td>'
        + '<td style="color:var(--text-secondary)">' + (o.administered_at ? o.administered_at.split('T')[0] : '—') + '</td>'
        + '</tr>').join('');
      const form = '<div id="cd-outcome-form" style="display:none;margin-bottom:16px"><div class="card" style="padding:20px">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:flex-end">'
        + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Template</label><select id="cdo-template" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"><option value="PHQ-9">PHQ-9</option><option value="GAD-7">GAD-7</option><option value="PCL-5">PCL-5</option><option value="ISI">ISI</option><option value="DASS-21">DASS-21</option><option value="NRS-Pain">NRS-Pain</option><option value="ADHD-RS-5">ADHD-RS-5</option><option value="UPDRS-III">UPDRS-III</option></select></div>'
        + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Point</label><select id="cdo-point" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"><option value="baseline">Baseline</option><option value="mid">Mid-course</option><option value="post">Post-treatment</option><option value="follow_up">Follow-up</option></select></div>'
        + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Score</label><input id="cdo-score" type="number" step="0.1" placeholder="e.g. 14" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"></div>'
        + '<div style="display:flex;gap:8px"><button class="btn" onclick="document.getElementById(\'cd-outcome-form\').style.display=\'none\'">Cancel</button><button class="btn btn-primary" onclick="window._cdSaveOutcome()">Save</button></div>'
        + '</div><div id="cdo-error" style="display:none;color:var(--red);font-size:12px;margin-top:8px"></div>'
        + '</div></div>';
      const table = outcomes.length === 0
        ? '<div style="padding:32px;text-align:center;color:var(--text-tertiary)">' + emptyState('◫', 'No outcome measurements yet.') + '</div>'
        : '<div class="card" style="overflow-x:auto"><table class="ds-table"><thead><tr><th>Template</th><th>Point</th><th>Score</th><th>Date</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      return '<div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'cd-outcome-form\').style.display=\'\'">+ Record Outcome</button></div>' + form + table;
    }

    if (tab === 'adverse events') {
      const rows = adverse.map(a => {
        const sevCol = {mild:'var(--teal)',moderate:'var(--amber)',severe:'var(--red)',serious:'var(--red)'}[a.severity] || 'var(--text-tertiary)';
        return '<tr>'
          + '<td style="font-weight:600">' + a.event_type + '</td>'
          + '<td><span style="font-size:11px;padding:2px 6px;border-radius:3px;background:' + sevCol + '22;color:' + sevCol + '">' + a.severity + '</span></td>'
          + '<td style="color:var(--text-secondary)">' + (a.action_taken || '—') + '</td>'
          + '<td style="font-size:11.5px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (a.description || '—') + '</td>'
          + '<td style="color:var(--text-secondary)">' + (a.reported_at ? a.reported_at.split('T')[0] : '—') + '</td>'
          + '</tr>';
      }).join('');
      const form = '<div id="cd-ae-form" style="display:none;margin-bottom:16px"><div class="card" style="padding:20px">'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px">'
        + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Event Type</label><input id="ae-type" placeholder="e.g. headache" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"></div>'
        + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Severity</label><select id="ae-severity" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option><option value="serious">Serious</option></select></div>'
        + '<div><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Action Taken</label><select id="ae-action" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px"><option value="none">None</option><option value="session_paused">Session paused</option><option value="session_stopped">Session stopped</option><option value="referred">Referred</option></select></div>'
        + '</div>'
        + '<div style="margin-bottom:12px"><label style="font-size:11px;color:var(--text-secondary);display:block;margin-bottom:4px">Description</label><textarea id="ae-desc" rows="2" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-primary);font-size:12px;resize:vertical" placeholder="Describe the event…"></textarea></div>'
        + '<div id="ae-error" style="display:none;color:var(--red);font-size:12px;margin-bottom:8px"></div>'
        + '<div style="display:flex;gap:8px"><button class="btn" onclick="document.getElementById(\'cd-ae-form\').style.display=\'none\'">Cancel</button><button class="btn btn-primary" onclick="window._cdSaveAE()">Report</button></div>'
        + '</div></div>';
      const table = adverse.length === 0
        ? '<div style="padding:32px;text-align:center;color:var(--text-tertiary)">' + emptyState('◱', 'No adverse events reported.') + '</div>'
        : '<div class="card" style="overflow-x:auto"><table class="ds-table"><thead><tr><th>Event</th><th>Severity</th><th>Action</th><th>Description</th><th>Date</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
      return '<div style="margin-bottom:12px"><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'cd-ae-form\').style.display=\'\'">+ Report Adverse Event</button></div>' + form + table;
    }
    return '';
  }

  el.innerHTML = '<div style="background:linear-gradient(135deg,rgba(0,212,188,0.05),rgba(74,158,255,0.05));border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;margin-bottom:20px">'
    + '<div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">'
    + '<div><div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--text-primary)">' + course.condition_slug + ' · ' + course.modality_slug + '</div>'
    + '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Protocol: ' + course.protocol_id + ' · Created ' + (course.created_at ? course.created_at.split('T')[0] : '—') + '</div></div>'
    + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">'
    + '<span style="font-size:12px;font-weight:600;padding:4px 12px;border-radius:6px;background:' + sc + '22;color:' + sc + '">' + course.status.replace(/_/g,' ') + '</span>'
    + '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:' + gc + '22;color:' + gc + '">' + (course.evidence_grade || '—') + '</span>'
    + '</div></div>'
    + '<div style="margin-top:16px">'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-bottom:5px"><span>Sessions delivered</span><span>' + course.sessions_delivered + ' / ' + course.planned_sessions_total + ' · ' + pct + '%</span></div>'
    + '<div style="height:8px;border-radius:4px;background:var(--border)"><div style="height:8px;border-radius:4px;background:' + sc + ';width:' + pct + '%"></div></div>'
    + '</div></div>'
    + '<div class="tab-bar" style="margin-bottom:20px">'
    + tabNames.map(t => '<button class="tab-btn ' + (window._cdTab === t ? 'active' : '') + '" onclick="window._cdSwitchTab(\'' + t + '\')">'
      + t + (t === 'sessions' ? ' (' + sessions.length + ')' : t === 'adverse events' && adverse.length ? ' (' + adverse.length + ')' : '')
      + '</button>').join('')
    + '</div>'
    + '<div id="cd-tab-body">' + renderTab() + '</div>';

  window._cdSwitchTab = function(t) {
    window._cdTab = t;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.textContent.trim().startsWith(t));
    });
    document.getElementById('cd-tab-body').innerHTML = renderTab();
    bindCourseDetailActions(course, id);
  };

  bindCourseDetailActions(course, id);
}

function bindCourseDetailActions(course, courseId) {
  window._cdActivate = async function() {
    try {
      await api.activateCourse(courseId);
      window._cdTab = 'overview';
      window._nav('course-detail');
    } catch (e) { alert(e.message || 'Activation failed.'); }
  };

  window._cdSaveSession = async function() {
    const errEl = document.getElementById('cds-error');
    if (errEl) errEl.style.display = 'none';
    try {
      await api.logSession(courseId, {
        frequency_hz: document.getElementById('cds-freq')?.value || null,
        intensity_pct_rmt: document.getElementById('cds-int')?.value || null,
        duration_minutes: parseInt(document.getElementById('cds-dur')?.value) || null,
        tolerance_rating: document.getElementById('cds-tol')?.value || null,
        post_session_notes: document.getElementById('cds-notes')?.value || null,
      });
      window._cdTab = 'sessions';
      window._nav('course-detail');
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed.'; errEl.style.display = 'block'; }
    }
  };

  window._cdSaveOutcome = async function() {
    const errEl = document.getElementById('cdo-error');
    if (errEl) errEl.style.display = 'none';
    const score = document.getElementById('cdo-score')?.value;
    if (!score) { if (errEl) { errEl.textContent = 'Enter a score.'; errEl.style.display = 'block'; } return; }
    try {
      await api.recordOutcome({
        patient_id: course.patient_id,
        course_id: courseId,
        template_id: document.getElementById('cdo-template')?.value || 'PHQ-9',
        template_title: document.getElementById('cdo-template')?.value || 'PHQ-9',
        score: score, score_numeric: parseFloat(score),
        measurement_point: document.getElementById('cdo-point')?.value || 'mid',
      });
      window._cdTab = 'outcomes';
      window._nav('course-detail');
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed.'; errEl.style.display = 'block'; }
    }
  };

  window._cdSaveAE = async function() {
    const errEl = document.getElementById('ae-error');
    if (errEl) errEl.style.display = 'none';
    const evType = document.getElementById('ae-type')?.value.trim();
    if (!evType) { if (errEl) { errEl.textContent = 'Enter event type.'; errEl.style.display = 'block'; } return; }
    try {
      await api.reportAdverseEvent({
        patient_id: course.patient_id,
        course_id: courseId,
        event_type: evType,
        severity: document.getElementById('ae-severity')?.value || 'mild',
        description: document.getElementById('ae-desc')?.value || null,
        action_taken: document.getElementById('ae-action')?.value || null,
      });
      window._cdTab = 'adverse events';
      window._nav('course-detail');
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed.'; errEl.style.display = 'block'; }
    }
  };
}
