import { cardWrap, fr, pillSt, tag, initials } from './helpers.js';
import { api } from './api.js';

// ── Scheduling ────────────────────────────────────────────────────────────────
export function pgSchedule(setTopbar) {
  setTopbar('Scheduling', `<button class="btn btn-ghost btn-sm">Sync Calendar</button><button class="btn btn-primary btn-sm" onclick="window._nav('profile')">+ Appointment</button>`);

  if (window._calOffset == null) window._calOffset = 0;

  function buildScheduleHTML() {
    const now = new Date();
    const displayDate = new Date(now.getFullYear(), now.getMonth() + window._calOffset, 1);
    const monthLabel = displayDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0).getDate();
    // Monday-first offset: Sunday(0)→6, Monday(1)→0, …
    const rawDow = new Date(displayDate.getFullYear(), displayDate.getMonth(), 1).getDay();
    const firstDow = (rawDow + 6) % 7;
    const gridSize = Math.ceil((firstDow + daysInMonth) / 7) * 7;

    const isCurrentMonth = window._calOffset === 0;
    const today = isCurrentMonth ? now.getDate() : -1;

    const todayLabel = now.toLocaleString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

    return `<div class="g2">
    ${cardWrap(monthLabel, `
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px">
        ${['M','T','W','T','F','S','S'].map(d => `<div style="text-align:center;font-size:9.5px;color:var(--text-tertiary);padding:5px 0;text-transform:uppercase;letter-spacing:.5px">${d}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
        ${Array.from({ length: gridSize }, (_, i) => {
          const day = i - firstDow + 1;
          const d = day < 1 || day > daysInMonth ? null : day;
          const isToday = d === today;
          const hasAppt = [2,3,5,9,12,14,16,17,21,22,24,28].includes(d);
          return `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:12px;border-radius:var(--radius-md);cursor:pointer;transition:all var(--transition);${isToday ? 'background:var(--teal-ghost);color:var(--teal);font-weight:700;border:1px solid var(--border-teal);box-shadow:0 0 10px var(--teal-glow);' : hasAppt ? 'background:var(--bg-surface-2);color:var(--text-primary);border:1px solid var(--border);' : !d ? 'color:var(--text-tertiary)' : 'color:var(--text-secondary);'}">${d || ''}</div>`;
        }).join('')}
      </div>
    `, `<div style="display:flex;gap:5px">
      <button class="btn btn-ghost btn-sm" onclick="window._calOffset--;window._renderSchedule()">‹</button>
      <button class="btn btn-ghost btn-sm" onclick="window._calOffset++;window._renderSchedule()">›</button>
    </div>`)}
    ${cardWrap(`Today · ${todayLabel}`, [
      { t: '09:00', e: '09:30', n: 'Session 7 — Patient', d: 'tDCS DLPFC', m: 'In-clinic', c: 'var(--blue)' },
      { t: '11:00', e: '12:00', n: 'New Patient Intake', d: 'Assessment + qEEG', m: 'In-clinic', c: 'var(--rose)' },
      { t: '14:00', e: '14:30', n: 'Telehealth Review', d: 'Protocol Review', m: 'Video', c: 'var(--violet)' },
      { t: '15:30', e: '16:00', n: 'Session Follow-up', d: 'taVNS Session 3', m: 'In-clinic', c: 'var(--teal)' },
    ].map(s => `<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--border);align-items:center">
      <div style="width:3px;height:36px;border-radius:2px;background:${s.c};flex-shrink:0;box-shadow:0 0 8px ${s.c}60"></div>
      <div style="flex:1"><div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${s.n}</div><div style="font-size:11px;color:var(--text-secondary)">${s.d}</div></div>
      <div style="text-align:right"><div style="font-size:11.5px;font-weight:600;color:var(--teal);font-family:var(--font-mono)">${s.t}–${s.e}</div><div style="font-size:10px;color:var(--text-tertiary)">${s.m}</div></div>
    </div>`).join(''))}
  </div>`;
  }

  window._renderSchedule = function() {
    const el = document.getElementById('content');
    if (el) el.innerHTML = buildScheduleHTML();
  };

  return buildScheduleHTML();
}

// ── Telehealth ────────────────────────────────────────────────────────────────
export function pgTelehealth(setTopbar) {
  setTopbar('Telehealth', `<button class="btn btn-primary btn-sm">+ New Session</button>`);
  return `<div class="g2">
    ${cardWrap('Upcoming Video Sessions', [
      { n: 'Patient Review', t: 'Today, 14:00', type: 'Protocol Review', s: 'active' },
      { n: 'New Patient Consult', t: 'Tomorrow, 11:00', type: 'Intake Consult', s: 'pending' },
      { n: 'Progress Review', t: 'Apr 12, 09:00', type: 'Progress Review', s: 'review' },
    ].map(s => `<div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;margin-bottom:5px">
        <span style="font-weight:600;font-size:13px;color:var(--text-primary)">${s.n}</span>${pillSt(s.s)}
      </div>
      <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:10px">${s.t} · ${s.type}</div>
      <div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm">Join Session →</button><button class="btn btn-sm">Remind</button></div>
    </div>`).join(''))}
    ${cardWrap('Platform Features', [
      { i: '🔒', t: 'HIPAA-Compliant Video', d: 'E2E encrypted sessions, no data retention' },
      { i: '📋', t: 'In-session Protocol View', d: 'Display and annotate protocols live' },
      { i: '🧠', t: 'Brain Map Sharing', d: 'Share qEEG reports with live annotation' },
      { i: '⏺', t: 'Session Recording', d: 'Consent-based recording, secure storage' },
      { i: '📝', t: 'Real-time Assessment', d: 'Send and collect assessments live' },
    ].map(f => `<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:flex-start">
      <div style="font-size:18px;flex-shrink:0">${f.i}</div>
      <div><div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:2px">${f.t}</div><div style="font-size:11.5px;color:var(--text-secondary)">${f.d}</div></div>
    </div>`).join(''))}
  </div>`;
}

// ── Messaging ─────────────────────────────────────────────────────────────────
export function pgMsg(setTopbar) {
  setTopbar('Secure Messaging', '');
  return `<div style="display:grid;grid-template-columns:250px minmax(0,1fr);height:520px;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;background:var(--navy-850)">
    <div style="border-right:1px solid var(--border);display:flex;flex-direction:column">
      <div style="padding:12px;border-bottom:1px solid var(--border);background:rgba(0,0,0,0.2)">
        <input class="form-control" placeholder="Search…" style="padding:6px 10px">
      </div>
      <div style="flex:1;overflow-y:auto">
        ${[
          { n: 'Patient A', m: 'Question about next session time', t: '2m', u: 2 },
          { n: 'Patient B', m: 'Feeling much better after session', t: '1h', u: 1 },
          { n: 'Patient C', m: 'Protocol PDF received, thank you', t: '3h', u: 0 },
          { n: 'Patient D', m: 'Question about home device use', t: 'Yesterday', u: 2 },
        ].map(m => `<div style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;background:${m.u ? 'var(--teal-ghost)' : ''};transition:background var(--transition)">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px">
            <span style="font-size:12.5px;font-weight:${m.u ? 600 : 400};color:var(--text-primary)">${m.n}</span>
            <span style="font-size:9.5px;color:var(--text-tertiary)">${m.t}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:11.5px;color:var(--text-secondary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:170px">${m.m}</span>
            ${m.u ? `<span style="background:var(--teal);color:#000;border-radius:50%;width:17px;height:17px;font-size:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:700">${m.u}</span>` : ''}
          </div>
        </div>`).join('')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:rgba(0,0,0,0.2)">
        <div class="avatar">PA</div>
        <div>
          <div style="font-size:13px;font-weight:500;color:var(--text-primary)">Patient A</div>
          <div style="font-size:10.5px;color:var(--green);display:flex;align-items:center;gap:5px"><span class="status-dot online"></span> Online · HIPAA Encrypted</div>
        </div>
      </div>
      <div style="flex:1;padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:0">
        <div class="bubble bubble-in">Hi — can I shift my next session to 11am?</div>
        <div class="bubble bubble-out" style="align-self:flex-end">Of course — I'll update your appointment now. See you at 11am.</div>
        <div class="bubble bubble-in">Thank you! My mood has been noticeably better since session 4.</div>
        <div class="bubble bubble-out" style="align-self:flex-end">That's wonderful! Most patients notice improvements between sessions 4–7.</div>
      </div>
      <div style="padding:12px 14px;border-top:1px solid var(--border);display:flex;gap:8px;background:rgba(0,0,0,0.15)">
        <input class="form-control" placeholder="Type a secure message…" style="flex:1" onkeydown="if(event.key==='Enter')document.getElementById('msg-send')?.click()">
        <button id="msg-send" class="btn btn-primary">Send →</button>
      </div>
    </div>
  </div>`;
}

// ── Programs ──────────────────────────────────────────────────────────────────
export function pgPrograms(setTopbar) {
  setTopbar('Patient Education Programs', '');
  const el = document.getElementById('content');
  el.innerHTML = `
    <div style="max-width:680px;margin:0 auto;padding:48px 24px;text-align:center">
      <div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,var(--navy-700),var(--navy-600));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 24px">◧</div>
      <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Patient Education Programs</div>
      <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.65;margin-bottom:32px;max-width:480px;margin-left:auto;margin-right:auto">
        Structured patient-facing education modules, self-paced home courses, and caregiver onboarding programs are in active development.<br><br>
        These will integrate directly with treatment courses — patients will receive relevant modules automatically based on their assigned protocol.
      </div>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:40px">
        <div class="card" style="text-align:left;padding:16px 20px;min-width:180px;flex:1;max-width:220px">
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Planned</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Self-paced modules</div>
          <div style="font-size:11.5px;color:var(--text-secondary)">Condition-specific patient education</div>
        </div>
        <div class="card" style="text-align:left;padding:16px 20px;min-width:180px;flex:1;max-width:220px">
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Planned</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Auto-enrolment</div>
          <div style="font-size:11.5px;color:var(--text-secondary)">Based on treatment course protocol</div>
        </div>
        <div class="card" style="text-align:left;padding:16px 20px;min-width:180px;flex:1;max-width:220px">
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Planned</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Completion tracking</div>
          <div style="font-size:11.5px;color:var(--text-secondary)">Recorded in patient profile</div>
        </div>
      </div>
      <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:var(--radius-md);background:var(--teal-ghost);border:1px solid var(--border-teal);color:var(--teal);font-size:12px;font-weight:500">
        <span>◈</span> Coming in a future release
      </div>
    </div>`;
}

// ── Billing ───────────────────────────────────────────────────────────────────
export async function pgBilling(setTopbar) {
  setTopbar('Billing & Payments', '');
  const el = document.getElementById('content');
  el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary)">
    <div style="font-size:24px;margin-bottom:12px;opacity:.4">◈</div>Loading billing configuration…</div>`;

  // Global handlers
  window._checkout = async (pkgId) => {
    const r = await api.createCheckout(pkgId);
    if (r?.url) window.location.href = r.url;
  };
  window._openPortal = async () => {
    const r = await api.createPortal();
    if (r?.url) window.open(r.url, '_blank');
  };

  let config = null;
  try {
    config = await api.paymentConfig();
  } catch {
    config = null;
  }

  if (!config) {
    // Fallback static stub
    el.innerHTML = `
      <div class="notice notice-info" style="margin-bottom:20px">
        Billing configuration is managed via admin settings. Live plan data is unavailable.
      </div>
      <div class="g4" style="margin-bottom:20px">
        ${[
          { l: 'Revenue (Month)', v: '—', d: 'From sessions this month' },
          { l: 'Outstanding', v: '—', d: 'Invoices pending', neg: true },
          { l: 'Avg. Session Fee', v: '—', d: 'Update per session' },
          { l: 'Insurance Claims', v: '—', d: 'Awaiting approval' },
        ].map(m => `<div class="metric-card"><div class="metric-label">${m.l}</div><div class="metric-value">${m.v}</div><div class="metric-delta ${m.neg ? 'neg' : ''}">${m.d}</div></div>`).join('')}
      </div>
      <div class="notice notice-info">
        Billing records are tracked per session. Open a <button class="btn btn-ghost btn-sm" onclick="window._nav('patients')">Patient Profile</button> → Sessions tab to update billing codes and status.
      </div>`;
    return;
  }

  const { packages = [], current_package_id } = config;
  const currentPkg = packages.find(p => p.id === current_package_id);

  const currentCard = currentPkg ? `
    <div class="card" style="margin-bottom:20px;border-color:var(--border-teal);box-shadow:0 0 18px var(--teal-glow)">
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--teal);margin-bottom:4px">Current Plan</div>
            <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-primary)">${currentPkg.name}</div>
          </div>
          <div style="font-size:22px;font-family:var(--font-display);font-weight:700;color:var(--teal)">${currentPkg.price}</div>
        </div>
        ${currentPkg.features?.length ? `<ul style="list-style:none;padding:0;margin:0 0 14px">${currentPkg.features.map(f => `<li style="font-size:12px;color:var(--text-secondary);padding:3px 0">✓ ${f}</li>`).join('')}</ul>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="window._openPortal()">Manage Billing →</button>
      </div>
    </div>` : `
    <div class="card" style="margin-bottom:20px">
      <div class="card-body">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">No active plan.</div>
        <button class="btn btn-ghost btn-sm" onclick="window._openPortal()">Manage Billing →</button>
      </div>
    </div>`;

  const upgradeCards = packages.filter(p => p.id !== current_package_id).length > 0 ? `
    <div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:12px">Available Plans</div>
    <div class="g3">
      ${packages.filter(p => p.id !== current_package_id).map(p => `
        <div class="card" style="margin-bottom:0">
          <div class="card-body">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
              <div style="font-family:var(--font-display);font-size:14px;font-weight:600;color:var(--text-primary)">${p.name}</div>
              <div style="font-size:16px;font-weight:700;color:var(--teal)">${p.price}</div>
            </div>
            ${p.features?.length ? `<ul style="list-style:none;padding:0;margin:0 0 14px">${p.features.map(f => `<li style="font-size:11.5px;color:var(--text-secondary);padding:2px 0">✓ ${f}</li>`).join('')}</ul>` : ''}
            <button class="btn btn-primary btn-sm" onclick="window._checkout('${p.id}')">Subscribe</button>
          </div>
        </div>`).join('')}
    </div>` : '';

  el.innerHTML = currentCard + upgradeCards;
}

// ── Reports ───────────────────────────────────────────────────────────────────
export async function pgReports(setTopbar) {
  setTopbar('Reports & Analytics', '');
  const el = document.getElementById('content');
  el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-tertiary)">
    <div style="font-size:24px;margin-bottom:12px;opacity:.4">◈</div>Loading report data…</div>`;

  // Parallel fetch
  const [agg, aeRes, coursesRes, assessRes] = await Promise.all([
    api.aggregateOutcomes().catch(() => null),
    api.listAdverseEvents().catch(() => null),
    api.listCourses().catch(() => null),
    api.listAssessments().catch(() => null),
  ]);

  const outcomes = agg || {};
  const aes = aeRes?.items || [];
  const courses = coursesRes?.items || [];
  const assessments = assessRes?.items || [];

  // Course stats
  const totalCourses = courses.length;
  const activeCourses = courses.filter(c => c.status === 'active').length;
  const completedCourses = courses.filter(c => c.status === 'completed').length;
  const completionRate = totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

  // AE severity breakdown
  const aeSev = { mild: 0, moderate: 0, severe: 0, serious: 0 };
  aes.forEach(ae => { if (aeSev[ae.severity] !== undefined) aeSev[ae.severity]++; });
  const aeTotal = aes.length;

  // Responder rate from aggregate
  const responderRate = outcomes.responder_rate != null
    ? Math.round(outcomes.responder_rate * 100)
    : (outcomes.total_responders != null && outcomes.total_outcomes != null && outcomes.total_outcomes > 0
        ? Math.round((outcomes.total_responders / outcomes.total_outcomes) * 100)
        : null);

  // Assessment template breakdown
  const tplCount = {};
  assessments.forEach(a => { tplCount[a.template_id] = (tplCount[a.template_id] || 0) + 1; });
  const tplRows = Object.entries(tplCount).sort((a, b) => b[1] - a[1]);

  // Modality breakdown from courses
  const modalCount = {};
  courses.forEach(c => {
    const m = c.modality || 'Unknown';
    modalCount[m] = (modalCount[m] || 0) + 1;
  });
  const modalRows = Object.entries(modalCount).sort((a, b) => b[1] - a[1]);

  function miniBar(val, max, color = 'var(--teal)') {
    const pct = max > 0 ? Math.round((val / max) * 100) : 0;
    return `<div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;margin-top:4px">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width .4s"></div></div>`;
  }

  el.innerHTML = `
    <!-- KPI strip -->
    <div class="g4" style="margin-bottom:24px">
      ${[
        { label: 'Total Courses', val: totalCourses, sub: `${activeCourses} active` },
        { label: 'Completion Rate', val: completionRate + '%', sub: `${completedCourses} completed` },
        { label: 'Responder Rate', val: responderRate != null ? responderRate + '%' : '—', sub: outcomes.total_outcomes ? `n=${outcomes.total_outcomes}` : 'No outcomes yet' },
        { label: 'Total Adverse Events', val: aeTotal, sub: aeSev.serious > 0 ? `${aeSev.serious} serious` : 'None serious' },
      ].map(m => `<div class="card" style="margin-bottom:0">
        <div class="card-body" style="padding:16px">
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:6px">${m.label}</div>
          <div style="font-size:26px;font-family:var(--font-display);font-weight:700;color:var(--teal);margin-bottom:2px">${m.val}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${m.sub}</div>
        </div>
      </div>`).join('')}
    </div>

    <div class="g2">
      <!-- Modality breakdown -->
      <div class="card" style="margin-bottom:0">
        <div class="card-body">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:600;margin-bottom:16px;color:var(--text-primary)">Treatment Courses by Modality</div>
          ${modalRows.length === 0
            ? `<div style="color:var(--text-tertiary);font-size:13px">No courses recorded yet.</div>`
            : modalRows.map(([mod, cnt]) => `
              <div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-size:12.5px">
                  <span style="color:var(--text-primary)">${mod}</span>
                  <span style="font-family:var(--font-mono);color:var(--teal)">${cnt}</span>
                </div>
                ${miniBar(cnt, totalCourses)}
              </div>`).join('')}
        </div>
      </div>

      <!-- Assessment usage -->
      <div class="card" style="margin-bottom:0">
        <div class="card-body">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:600;margin-bottom:16px;color:var(--text-primary)">Assessment Templates Used</div>
          ${tplRows.length === 0
            ? `<div style="color:var(--text-tertiary);font-size:13px">No assessments recorded yet.</div>`
            : tplRows.map(([tpl, cnt]) => `
              <div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-size:12.5px">
                  <span style="color:var(--text-primary)">${tpl}</span>
                  <span style="font-family:var(--font-mono);color:var(--teal)">${cnt}</span>
                </div>
                ${miniBar(cnt, assessments.length)}
              </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- AE severity table -->
    <div class="card" style="margin-top:20px">
      <div class="card-body">
        <div style="font-family:var(--font-display);font-size:13px;font-weight:600;margin-bottom:16px;color:var(--text-primary)">Adverse Event Severity Breakdown</div>
        <table class="ds-table">
          <thead><tr><th>Severity</th><th>Count</th><th>% of Total</th></tr></thead>
          <tbody>
            ${['mild','moderate','severe','serious'].map(sev => {
              const cnt = aeSev[sev];
              const pct = aeTotal > 0 ? ((cnt / aeTotal) * 100).toFixed(1) : '0.0';
              const color = sev === 'mild' ? 'var(--teal)' : sev === 'moderate' ? '#f59e0b' : sev === 'severe' ? '#f97316' : 'var(--red)';
              return `<tr>
                <td><span style="color:${color};font-weight:600;text-transform:capitalize">${sev}</span></td>
                <td class="mono">${cnt}</td>
                <td class="mono">${pct}%</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${aeTotal === 0 ? `<div style="color:var(--teal);font-size:12.5px;margin-top:12px">✓ No adverse events on record.</div>` : ''}
      </div>
    </div>

    <!-- Outcomes aggregate detail -->
    ${outcomes && Object.keys(outcomes).length > 0 ? `
    <div class="card" style="margin-top:20px">
      <div class="card-body">
        <div style="font-family:var(--font-display);font-size:13px;font-weight:600;margin-bottom:16px;color:var(--text-primary)">Aggregate Outcomes Data</div>
        <table class="ds-table">
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>
            ${Object.entries(outcomes).map(([k, v]) => `<tr>
              <td style="color:var(--text-secondary);font-size:12px">${k.replace(/_/g,' ')}</td>
              <td class="mono">${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : String(v)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}
  `;
}

// ── Settings ──────────────────────────────────────────────────────────────────
export async function pgSettings(setTopbar, currentUser) {
  setTopbar('Settings', '');
  const el = document.getElementById('content');

  // Fetch Telegram link code
  let telegramCode = null, telegramInstructions = null;
  try {
    const tg = await api.telegramLinkCode();
    telegramCode = tg?.code;
    telegramInstructions = tg?.instructions;
  } catch {}

  el.innerHTML = `<div class="g2">
    ${cardWrap('Account Profile', [
      ['Display Name', currentUser?.display_name || '—'],
      ['Email',        currentUser?.email || '—'],
      ['Role',         `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(0,212,188,0.1);color:var(--teal)">${currentUser?.role || 'guest'}</span>`],
      ['Package',      `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(74,158,255,0.1);color:var(--blue)">${currentUser?.package_id || 'explorer'}</span>`],
      ['Verified',     currentUser?.is_verified ? '<span style="color:var(--green)">Yes ✓</span>' : '<span style="color:var(--amber)">Pending</span>'],
    ].map(([k, v]) => fr(k, v)).join(''))}

    ${cardWrap('Compliance & Security', [
      ['HIPAA',      '<span style="color:var(--green)">Compliant ✓</span>'],
      ['GDPR',       '<span style="color:var(--green)">Compliant ✓</span>'],
      ['2FA',        '<span style="color:var(--amber)">Recommended — not yet enabled</span>'],
      ['Audit Logs', '7-year retention policy'],
      ['Encryption', 'AES-256 at rest · TLS 1.3 in transit'],
    ].map(([k, v]) => fr(k, v)).join(''))}

    ${cardWrap('Subscription & Billing',
      fr('Current Plan', `<strong>${currentUser?.package_id || 'Explorer'}</strong>`) +
      fr('Billing Portal', `<button class="btn btn-sm" onclick="window._openBillingPortal()">Manage Subscription →</button>`) +
      fr('Upgrade', `<button class="btn btn-primary btn-sm" onclick="window._nav('pricing')">View Plans →</button>`),
      '<div id="portal-status" style="font-size:11px;color:var(--text-tertiary);margin-top:4px"></div>'
    )}

    ${cardWrap('Telegram Integration',
      telegramCode
        ? fr('Link Code', `<code style="font-family:var(--font-mono);font-size:14px;color:var(--teal);background:rgba(0,212,188,0.08);padding:4px 10px;border-radius:4px;letter-spacing:2px">${telegramCode}</code>`) +
          fr('Instructions', `<span style="font-size:11.5px;color:var(--text-secondary)">${telegramInstructions || 'Send LINK ' + telegramCode + ' to @DeepSynapsBot'}</span>`) +
          `<div style="margin-top:12px;padding:10px;background:rgba(0,212,188,0.05);border-radius:6px;border:1px solid var(--border-teal);font-size:11.5px;color:var(--text-secondary)">
            Receive session reminders, review alerts and outcome summaries directly in Telegram.
          </div>`
        : fr('Status', '<span style="color:var(--text-tertiary)">Telegram service unavailable</span>') +
          fr('Setup', '<span style="font-size:11.5px;color:var(--text-secondary)">Configure TELEGRAM_BOT_TOKEN in environment to enable</span>')
    )}

    ${cardWrap('Notifications', [
      ['Session Reminders', '24h + 2h before'],
      ['Protocol Alerts',  'Enabled'],
      ['AE Alerts',        'Immediate (Telegram + email)'],
      ['Review Queue',     'Daily digest'],
    ].map(([k, v]) => fr(k, v)).join(''))}

    ${cardWrap('Integrations', [
      ['DOCX Export',    '<span style="color:var(--green)">Available ✓</span>'],
      ['Stripe',         '<span style="color:var(--green)">Connected ✓</span>'],
      ['qEEG Upload',    '<span style="color:var(--text-tertiary)">Manual entry</span>'],
      ['EHR / EMR',      '<span style="color:var(--text-tertiary)">Coming soon</span>'],
      ['HL7 / FHIR',     '<span style="color:var(--text-tertiary)">Coming soon</span>'],
    ].map(([k, v]) => fr(k, v)).join(''))}
  </div>`;

  window._openBillingPortal = async function() {
    const status = document.getElementById('portal-status');
    if (status) status.textContent = 'Opening billing portal…';
    try {
      const res = await api.createPortal();
      if (res?.portal_url) { window.location.href = res.portal_url; return; }
      if (status) status.textContent = 'Portal unavailable — contact support.';
    } catch (e) {
      if (status) status.textContent = e.message || 'Portal unavailable.';
    }
  };
}

// ── AI Clinical Assistant ─────────────────────────────────────────────────────
let _chatMessages = [];
let _chatPatientCtx = null;

export async function pgAIAssistant(setTopbar) {
  setTopbar('AI Clinical Assistant', '<span style="font-size:11px;color:var(--teal);padding:4px 10px;background:rgba(0,212,188,0.1);border-radius:var(--radius-sm)">✦ Powered by Claude</span>');

  const el = document.getElementById('content');

  // Load patients for context selector
  let patients = [];
  try { patients = await api.listPatients().then(r => r?.items || []).catch(() => []); } catch {}

  _chatMessages = [];
  _chatPatientCtx = null;

  el.innerHTML = `
  <div style="display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;height:calc(100vh - 120px);max-height:700px">

    <!-- Sidebar: patient context + suggestion chips -->
    <div style="display:flex;flex-direction:column;gap:12px">
      ${cardWrap('Patient Context', `
        <div class="form-group" style="margin-bottom:8px">
          <label class="form-label">Patient (optional)</label>
          <select id="chat-patient" class="form-control" onchange="window._chatSelectPatient(this.value)">
            <option value="">General clinical query</option>
            ${patients.map(p => `<option value="${p.id}">${p.first_name} ${p.last_name}</option>`).join('')}
          </select>
        </div>
        <div id="chat-ctx-preview" style="font-size:11px;color:var(--text-secondary);line-height:1.6;min-height:32px"></div>
        <button class="btn btn-sm" style="width:100%;margin-top:8px" onclick="window._chatClearHistory()">Clear Conversation</button>
      `)}
      ${cardWrap('Suggested Queries', `
        <div style="display:flex;flex-direction:column;gap:6px">
          ${[
            'Summarise evidence for this patient\'s condition',
            'Suggest protocol parameters based on qEEG',
            'What are the governance rules for off-label tDCS?',
            'Explain EV-B evidence grade to the patient',
            'Common adverse events for TMS in depression?',
            'Checklist before first rTMS session',
          ].map(q => `<button class="btn btn-sm" style="text-align:left;white-space:normal;height:auto;padding:6px 10px;line-height:1.4" onclick="window._chatSuggest(this.textContent)">${q}</button>`).join('')}
        </div>
      `)}
    </div>

    <!-- Chat panel -->
    <div style="display:flex;flex-direction:column;border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;background:var(--navy-850)">
      <!-- Header -->
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;background:rgba(0,0,0,0.2)">
        <span style="font-size:20px;color:var(--teal)">✦</span>
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary)">DeepSynaps Clinical AI</div>
          <div style="font-size:10.5px;color:var(--text-secondary)">Evidence-grounded · Protocol-aware · HIPAA-conscious</div>
        </div>
        <span id="chat-status" style="margin-left:auto;font-size:10px;color:var(--green);display:flex;align-items:center;gap:5px"><span class="status-dot online"></span>Ready</span>
      </div>

      <!-- Messages -->
      <div id="chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px">
        <div style="text-align:center;padding:24px 0">
          <div style="font-size:28px;margin-bottom:8px">✦</div>
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px">AI Clinical Assistant</div>
          <div style="font-size:12px;color:var(--text-secondary);max-width:320px;margin:0 auto;line-height:1.6">
            Ask clinical questions, review protocol rationale, explore evidence, or get patient-specific guidance. Select a patient for contextual responses.
          </div>
        </div>
      </div>

      <!-- Input -->
      <div style="padding:12px 14px;border-top:1px solid var(--border);display:flex;gap:8px;background:rgba(0,0,0,0.15)">
        <textarea id="chat-input" class="form-control" placeholder="Ask a clinical question…" style="flex:1;resize:none;height:42px;padding:10px 12px;overflow:hidden" rows="1"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._chatSend()}"
          oninput="this.style.height='42px';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
        <button id="chat-send-btn" class="btn btn-primary" onclick="window._chatSend()" style="align-self:flex-end;height:42px;padding:0 16px">Send</button>
      </div>
    </div>
  </div>`;

  // ── Bindings ──────────────────────────────────────────────────────────────
  window._chatSelectPatient = async function(patientId) {
    if (!patientId) { _chatPatientCtx = null; document.getElementById('chat-ctx-preview').innerHTML = ''; return; }
    try {
      const pt = await api.getPatient(patientId);
      const courses = await api.listCourses({ patient_id: patientId }).then(r => r?.items || []).catch(() => []);
      const active = courses.filter(c => c.status === 'active');
      _chatPatientCtx = {
        patient_id: pt.id,
        name: `${pt.first_name} ${pt.last_name}`,
        primary_condition: pt.primary_condition,
        primary_modality: pt.primary_modality,
        active_courses: active.map(c => ({ protocol_id: c.protocol_id, condition: c.condition_slug, modality: c.modality_slug, sessions_delivered: c.sessions_delivered, evidence_grade: c.evidence_grade })),
      };
      document.getElementById('chat-ctx-preview').innerHTML = `
        <strong>${pt.first_name} ${pt.last_name}</strong><br>
        ${pt.primary_condition || '—'} · ${pt.primary_modality || '—'}<br>
        ${active.length} active course${active.length !== 1 ? 's' : ''}`;
    } catch { _chatPatientCtx = null; }
  };

  window._chatClearHistory = function() {
    _chatMessages = [];
    const box = document.getElementById('chat-messages');
    if (box) box.innerHTML = `<div style="text-align:center;padding:24px 0;color:var(--text-tertiary);font-size:12px">Conversation cleared.</div>`;
  };

  window._chatSuggest = function(text) {
    const inp = document.getElementById('chat-input');
    if (inp) { inp.value = text; inp.focus(); }
  };

  window._chatSend = async function() {
    const inp = document.getElementById('chat-input');
    const msg = inp?.value.trim();
    if (!msg) return;
    inp.value = '';
    inp.style.height = '42px';

    _chatMessages.push({ role: 'user', content: msg });
    _renderChatMessages();

    const status = document.getElementById('chat-status');
    const sendBtn = document.getElementById('chat-send-btn');
    if (status) status.innerHTML = '<span class="status-dot" style="background:var(--amber)"></span>Thinking…';
    if (sendBtn) sendBtn.disabled = true;

    // Append typing indicator
    const box = document.getElementById('chat-messages');
    const typingId = 'chat-typing-' + Date.now();
    if (box) {
      const el2 = document.createElement('div');
      el2.id = typingId;
      el2.style.cssText = 'display:flex;gap:10px;align-items:flex-start';
      el2.innerHTML = '<div style="width:28px;height:28px;border-radius:50%;background:rgba(0,212,188,0.15);display:flex;align-items:center;justify-content:center;color:var(--teal);font-size:14px;flex-shrink:0">✦</div><div class="bubble bubble-in" style="background:rgba(0,212,188,0.05);padding:10px 14px;font-size:12px;color:var(--text-tertiary)">Analysing…</div>';
      box.appendChild(el2);
      box.scrollTop = box.scrollHeight;
    }

    try {
      const result = await api.chatClinician(_chatMessages, _chatPatientCtx);
      document.getElementById(typingId)?.remove();
      const reply = result?.reply || result?.content || result?.message || JSON.stringify(result);
      _chatMessages.push({ role: 'assistant', content: reply });
      _renderChatMessages();
    } catch (e) {
      document.getElementById(typingId)?.remove();
      _chatMessages.push({ role: 'assistant', content: `Error: ${e.message || 'Could not reach AI service.'}` });
      _renderChatMessages();
    } finally {
      if (status) status.innerHTML = '<span class="status-dot online"></span>Ready';
      if (sendBtn) sendBtn.disabled = false;
    }
  };

  function _renderChatMessages() {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    box.innerHTML = _chatMessages.map(m => {
      const isUser = m.role === 'user';
      if (isUser) return `<div style="display:flex;justify-content:flex-end">
        <div class="bubble bubble-out" style="max-width:72%;padding:10px 14px;border-radius:12px 12px 2px 12px;font-size:13px;white-space:pre-wrap;word-break:break-word">${_escHtml(m.content)}</div>
      </div>`;
      return `<div style="display:flex;gap:10px;align-items:flex-start">
        <div style="width:28px;height:28px;border-radius:50%;background:rgba(0,212,188,0.15);display:flex;align-items:center;justify-content:center;color:var(--teal);font-size:14px;flex-shrink:0">✦</div>
        <div class="bubble bubble-in" style="max-width:80%;padding:10px 14px;border-radius:2px 12px 12px 12px;font-size:13px;line-height:1.65;white-space:pre-wrap;word-break:break-word">${_escHtml(m.content)}</div>
      </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
