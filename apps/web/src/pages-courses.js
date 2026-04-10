import { api } from './api.js';
import { cardWrap, spinner, emptyState } from './helpers.js';

// ── pgCourses — Treatment Courses page ───────────────────────────────────────
export async function pgCourses(setTopbar, navigate) {
  setTopbar('Treatment Courses', `<button class="btn btn-primary" onclick="window._nav('protocol-wizard')">+ New Course</button>`);
  const el = document.getElementById('content');
  el.innerHTML = spinner();
  try {
    // Show course list grouped by status: Active | Pending Approval | Completed
    el.innerHTML = `
      <div class="page-section">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
          ${metricCard('Active Courses', '—', 'var(--teal)', 'Ongoing treatment')}
          ${metricCard('Pending Approval', '—', 'var(--amber)', 'Awaiting review')}
          ${metricCard('Completed', '—', 'var(--green)', 'This quarter')}
        </div>
        <div class="card">
          <div class="card-header" style="padding:16px 20px;border-bottom:1px solid var(--border)">
            <span style="font-weight:600;font-size:14px">Treatment Courses</span>
          </div>
          <div style="padding:48px;text-align:center;color:var(--text-tertiary)">
            ${emptyState('◎', 'No treatment courses yet. Use the Protocol Wizard to create the first course for a patient.')}
          </div>
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = emptyState('◎', 'Treatment Courses — coming live in Phase 1.');
  }
}

function metricCard(label, value, color, sub) {
  return `<div class="metric-card">
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px">${label}</div>
    <div style="font-size:28px;font-weight:700;color:${color};margin:8px 0 4px">${value}</div>
    <div style="font-size:11px;color:var(--text-secondary)">${sub}</div>
  </div>`;
}

// ── pgSessionExecution — Today's Sessions ────────────────────────────────────
export async function pgSessionExecution(setTopbar, navigate) {
  setTopbar('Session Execution', '');
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="page-section">
      <div class="card" style="margin-bottom:16px">
        <div style="padding:20px">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:16px">Today's Sessions</div>
          ${emptyState('◧', 'No sessions scheduled for today. Sessions will appear here once treatment courses are created.')}
        </div>
      </div>
      <div class="card">
        <div style="padding:20px">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Deliver a Session</div>
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:16px">Record actual delivered parameters, tolerability, and outcomes for a completed session.</p>
          <button class="btn btn-primary" onclick="">Log Session Parameters</button>
        </div>
      </div>
    </div>`;
}

// ── pgReviewQueue — Pending approvals ────────────────────────────────────────
export async function pgReviewQueue(setTopbar, navigate) {
  setTopbar('Review Queue', '');
  const el = document.getElementById('content');
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

// ── pgOutcomes — Outcomes & Trends ───────────────────────────────────────────
export async function pgOutcomes(setTopbar, navigate) {
  setTopbar('Outcomes & Trends', '');
  const el = document.getElementById('content');
  el.innerHTML = `
    <div class="page-section">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
        ${metricCard('Responders', '—', 'var(--teal)', '≥50% symptom reduction')}
        ${metricCard('Avg PHQ-9 Drop', '—', 'var(--blue)', 'Across active courses')}
        ${metricCard('Courses Reviewed', '—', 'var(--violet)', 'This month')}
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
      const cond = p.Condition_ID || 'Other';
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
                <span style="font-size:11px;font-family:monospace;color:var(--text-tertiary);min-width:60px">${p.Protocol_ID || ''}</span>
                <span style="font-size:13px;font-weight:600;color:var(--text-primary);flex:1">${p.Protocol_Name || ''}</span>
                <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${(gradeColor[p.Evidence_Grade] || 'var(--text-tertiary)') + '22'};color:${gradeColor[p.Evidence_Grade] || 'var(--text-tertiary)'}">${p.Evidence_Grade || ''}</span>
                <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${p.On_Label_vs_Off_Label?.includes('On-label') ? 'var(--teal-ghost)' : 'var(--amber-ghost, rgba(245,158,11,0.1))'};color:${p.On_Label_vs_Off_Label?.includes('On-label') ? 'var(--teal)' : 'var(--amber)'}">${p.On_Label_vs_Off_Label?.includes('On-label') ? 'On-label' : 'Off-label'}</span>
              </div>
              <div style="margin-top:8px;font-size:11.5px;color:var(--text-secondary);display:flex;gap:16px;flex-wrap:wrap">
                ${p.Target_Region ? `<span>Target: ${p.Target_Region}</span>` : ''}
                ${p.Frequency_Hz ? `<span>Freq: ${p.Frequency_Hz} Hz</span>` : ''}
                ${p.Sessions_per_Week ? `<span>${p.Sessions_per_Week}×/wk</span>` : ''}
                ${p.Total_Course ? `<span>${p.Total_Course}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  } catch (e) {
    el.innerHTML = emptyState('◇', 'Protocol registry loading failed. Ensure backend is running.');
  }
}
