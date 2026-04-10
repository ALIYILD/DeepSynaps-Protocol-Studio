import { cardWrap, fr, pillSt, tag, initials } from './helpers.js';

// ── Scheduling ────────────────────────────────────────────────────────────────
export function pgSchedule(setTopbar) {
  setTopbar('Scheduling', `<button class="btn btn-ghost btn-sm">Sync Calendar</button><button class="btn btn-primary btn-sm" onclick="window._nav('profile')">+ Appointment</button>`);
  return `<div class="g2">
    ${cardWrap('April 2026', `
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px">
        ${['M','T','W','T','F','S','S'].map(d => `<div style="text-align:center;font-size:9.5px;color:var(--text-tertiary);padding:5px 0;text-transform:uppercase;letter-spacing:.5px">${d}</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
        ${Array.from({ length: 35 }, (_, i) => {
          const day = i - 1; const d = day < 1 || day > 30 ? null : day;
          const isToday = d === 10;
          const hasAppt = [2,3,5,9,12,14,16,17,21,22,24,28].includes(d);
          return `<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:12px;border-radius:var(--radius-md);cursor:pointer;transition:all var(--transition);${isToday ? 'background:var(--teal-ghost);color:var(--teal);font-weight:700;border:1px solid var(--border-teal);box-shadow:0 0 10px var(--teal-glow);' : hasAppt ? 'background:var(--bg-surface-2);color:var(--text-primary);border:1px solid var(--border);' : !d ? 'color:var(--text-tertiary)' : 'color:var(--text-secondary);'}">${d || ''}</div>`;
        }).join('')}
      </div>
    `, '<div style="display:flex;gap:5px"><button class="btn btn-ghost btn-sm">‹</button><button class="btn btn-ghost btn-sm">›</button></div>')}
    ${cardWrap("Today · 10 April", [
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
  setTopbar('Programs & Courses', `<button class="btn btn-ghost btn-sm">Library</button><button class="btn btn-primary btn-sm">+ Create Program</button>`);
  return `<div class="g3">${[
    { t: 'tDCS at Home: Patient Guide', type: 'Self-paced course', m: 5, e: 34, s: 'active', p: 'Free' },
    { t: 'Neurofeedback Fundamentals', type: 'Fixed-date program', m: 8, e: 12, s: 'active', p: '$149' },
    { t: 'Understanding Your Brain Map', type: 'Self-paced course', m: 4, e: 58, s: 'active', p: 'Free' },
    { t: 'Chronic Pain & Neuromodulation', type: '6-week program', m: 12, e: 8, s: 'active', p: '$249' },
    { t: 'MDD Recovery Protocol', type: 'Self-paced course', m: 6, e: 21, s: 'active', p: 'Free' },
    { t: "Parkinson's Home Care Module", type: 'Caregiver program', m: 7, e: 5, s: 'pending', p: 'Free' },
  ].map(p => `<div class="card" style="margin-bottom:0;transition:border-color var(--transition)" onmouseover="this.style.borderColor='var(--border-teal)'" onmouseout="this.style.borderColor='var(--border)'">
    <div class="card-body">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">${pillSt(p.s)}<span style="font-size:12.5px;font-weight:700;color:var(--teal)">${p.p}</span></div>
      <div style="font-family:var(--font-display);font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${p.t}</div>
      <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:12px">${p.type} · ${p.m} modules</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span style="font-size:11px;color:var(--text-tertiary)">${p.e} enrolled</span>
        <div class="progress-bar" style="flex:1"><div class="progress-fill" style="width:${Math.min(100, Math.round((p.e / 60) * 100))}%"></div></div>
      </div>
      <div style="display:flex;gap:6px"><button class="btn btn-sm">Edit</button><button class="btn btn-sm">Enroll Patient</button></div>
    </div>
  </div>`).join('')}</div>`;
}

// ── Billing ───────────────────────────────────────────────────────────────────
export function pgBilling(setTopbar) {
  setTopbar('Billing & Payments', `<button class="btn btn-ghost btn-sm">Export</button><button class="btn btn-primary btn-sm">+ New Invoice</button>`);
  return `<div class="g4" style="margin-bottom:20px">
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
}

// ── Reports ───────────────────────────────────────────────────────────────────
export function pgReports(setTopbar) {
  setTopbar('Reports & Analytics', `<button class="btn btn-ghost btn-sm">Download PDF</button><button class="btn btn-ghost btn-sm">Export CSV</button>`);
  return `<div class="g3">${[
    { i: '◈', t: 'Clinical Outcomes Report', d: 'Aggregated assessment scores across all active protocols' },
    { i: '⬡', t: 'Protocol Efficacy Summary', d: 'Modality-level response rates and session completion rates' },
    { i: '◉', t: 'Patient Engagement Metrics', d: 'Assessment completion and session attendance rates' },
    { i: '◇', t: 'Revenue & Billing Report', d: 'Income by modality, practitioner, and referral source' },
    { i: '◧', t: 'qEEG Biomarker Trends', d: 'Population-level alpha asymmetry and theta/beta ratios over time' },
    { i: '◫', t: 'Custom Report Builder', d: 'Combine any clinical and operational metrics into a bespoke export' },
  ].map(r => `<div class="card" style="margin-bottom:0;cursor:pointer;transition:all var(--transition)" onmouseover="this.style.borderColor='var(--border-teal)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='var(--border)';this.style.transform='none'">
    <div class="card-body">
      <div style="font-size:28px;color:var(--teal);margin-bottom:12px;opacity:.7">${r.i}</div>
      <div style="font-family:var(--font-display);font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:6px">${r.t}</div>
      <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:16px;line-height:1.55">${r.d}</div>
      <button class="btn btn-sm">Generate →</button>
    </div>
  </div>`).join('')}</div>`;
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function pgSettings(setTopbar, currentUser) {
  setTopbar('Settings', `<button class="btn btn-primary btn-sm">Save Changes</button>`);
  return `<div class="g2">${[
    { t: 'Account Profile', fields: [
      ['Display Name', currentUser?.display_name || '—'],
      ['Email', currentUser?.email || '—'],
      ['Role', currentUser?.role || 'guest'],
      ['Package', currentUser?.package_id || 'explorer'],
      ['Verified', currentUser?.is_verified ? '<span style="color:var(--green)">Yes ✓</span>' : '<span style="color:var(--amber)">Pending</span>'],
    ]},
    { t: 'Compliance & Security', fields: [
      ['HIPAA', '<span style="color:var(--green)">Compliant ✓</span>'],
      ['GDPR', '<span style="color:var(--green)">Compliant ✓</span>'],
      ['2FA', '<span style="color:var(--amber)">Recommended</span>'],
      ['Audit Logs', '7 year retention'],
    ]},
    { t: 'Notifications', fields: [
      ['Session Reminders', '24h + 2h before'],
      ['Protocol Alerts', 'Enabled'],
      ['Billing Alerts', 'Enabled'],
    ]},
    { t: 'Integrations', fields: [
      ['Stripe Billing', '<button class="btn btn-sm" onclick="window._nav(\'pricing\')">Manage Subscription →</button>'],
      ['Telegram Bot', '<a href="#" style="color:var(--teal);font-size:12px">Link via /api/v1/telegram/link-code</a>'],
      ['DOCX Export', '<span style="color:var(--green)">Available ✓</span>'],
    ]},
  ].map(s => cardWrap(s.t, s.fields.map(([k, v]) => fr(k, v)).join(''), `<button class="btn btn-sm">Edit</button>`)).join('')}`;
}
