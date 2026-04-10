import { cardWrap, fr, pillSt, tag, initials } from './helpers.js';
import { api } from './api.js';

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
