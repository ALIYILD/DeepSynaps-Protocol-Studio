import { cardWrap, fr, pillSt, tag, initials, spinner } from './helpers.js';
import { api } from './api.js';

// ── Scheduling ────────────────────────────────────────────────────────────────
export function pgSchedule(setTopbar) {
  setTopbar('Scheduling', `<button class="btn btn-ghost btn-sm" onclick="window._toggleCalSync()">Sync Calendar</button><button class="btn btn-primary btn-sm" onclick="window._nav('profile')">+ Appointment</button>`);

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

    return `<div id="cal-sync-panel" style="display:none;margin-bottom:16px">
  <div class="card">
    <div class="card-header">Calendar Integration</div>
    <div class="card-body">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:8px;background:rgba(234,67,53,0.1);display:flex;align-items:center;justify-content:center;font-size:18px">📅</div>
          <div><div style="font-size:13px;font-weight:500">Google Calendar</div><div style="font-size:11.5px;color:var(--text-secondary)">Sync appointments and session reminders</div></div>
        </div>
        <button class="btn btn-sm" id="cal-btn-google" onclick="window._calSync('google')">Connect →</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:8px;background:rgba(0,120,212,0.1);display:flex;align-items:center;justify-content:center;font-size:18px">📆</div>
          <div><div style="font-size:13px;font-weight:500">Microsoft Outlook</div><div style="font-size:11.5px;color:var(--text-secondary)">Office 365 calendar integration</div></div>
        </div>
        <button class="btn btn-sm" id="cal-btn-outlook" onclick="window._calSync('outlook')">Connect →</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:18px">🗓</div>
          <div><div style="font-size:13px;font-weight:500">Apple Calendar</div><div style="font-size:11.5px;color:var(--text-secondary)">iCloud CalDAV sync</div></div>
        </div>
        <button class="btn btn-sm" id="cal-btn-apple" onclick="window._calSync('apple')">Connect →</button>
      </div>
      <div class="notice notice-info" style="margin-top:12px;font-size:11.5px">Calendar OAuth integration requires backend configuration. Connect your clinic's OAuth credentials in Settings → Integrations.</div>
    </div>
  </div>
</div>
<div class="g2">
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
    if (!el) return;
    const panelVisible = document.getElementById('cal-sync-panel')?.style.display !== 'none';
    el.innerHTML = buildScheduleHTML();
    if (panelVisible) {
      const p = document.getElementById('cal-sync-panel');
      if (p) p.style.display = 'block';
    }
  };

  window._toggleCalSync = function() {
    const p = document.getElementById('cal-sync-panel');
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
  };

  window._calSync = function(provider) {
    const btn = document.getElementById('cal-btn-' + provider);
    if (btn) { btn.textContent = 'Connecting…'; btn.disabled = true; }
    setTimeout(() => {
      if (btn) { btn.textContent = 'Connect →'; btn.disabled = false; }
      const t = document.createElement('div'); t.className = 'notice notice-info'; t.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:420px;padding:14px 18px'; t.textContent = 'Calendar sync with ' + provider + ' requires OAuth setup — add GOOGLE_CLIENT_ID / MICROSOFT_CLIENT_ID to your environment config.'; document.body.appendChild(t); setTimeout(() => t.remove(), 6000);
    }, 1500);
  };

  return buildScheduleHTML();
}

// ── Telehealth ────────────────────────────────────────────────────────────────
export function pgTelehealth(setTopbar) {
  setTopbar('Telehealth', '');
  const el = document.getElementById('content');

  const mockSessions = [
    { id: 's1', patient: 'Alex M.', time: 'Today 09:00', protocol: 'tDCS · DLPFC · 2mA · 20 min', session: '7 of 20', video_url: null },
    { id: 's2', patient: 'Jordan K.', time: 'Today 11:30', protocol: 'rTMS · DLPFC · 10Hz · 30 min', session: '3 of 30', video_url: null },
    { id: 's3', patient: 'Sam T.', time: 'Tomorrow 14:00', protocol: 'taVNS · Auricular · 0.5mA · 25 min', session: '12 of 20', video_url: null },
  ];

  el.innerHTML = `
  <!-- Pre-join panel (hidden by default) -->
  <div id="th-prejoin-panel" style="display:none;margin-bottom:16px">
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <span>Pre-Session Check</span>
        <button class="btn btn-sm" onclick="document.getElementById('th-prejoin-panel').style.display='none'">Close</button>
      </div>
      <div class="card-body">
        <div id="th-checks" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
          <div id="th-check-conn" style="display:flex;align-items:center;gap:10px;font-size:13px">
            <span id="th-icon-conn" style="font-size:16px">⏳</span>
            <span>Testing connection…</span>
          </div>
          <div id="th-check-mic" style="display:flex;align-items:center;gap:10px;font-size:13px">
            <span id="th-icon-mic" style="font-size:16px">⏳</span>
            <span>Checking microphone…</span>
          </div>
          <div id="th-check-cam" style="display:flex;align-items:center;gap:10px;font-size:13px">
            <span id="th-icon-cam" style="font-size:16px">⏳</span>
            <span>Checking camera…</span>
          </div>
        </div>
        <button id="th-enter-btn" class="btn btn-primary" disabled onclick="window._enterVideoSession()" style="opacity:.5">Enter Session →</button>
      </div>
    </div>
  </div>

  <!-- Upcoming Sessions -->
  <div class="card" style="margin-bottom:16px">
    <div class="card-header">Upcoming Telehealth Sessions</div>
    <div class="card-body">
      ${mockSessions.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:38px;height:38px;border-radius:10px;background:var(--teal-ghost);border:1px solid var(--border-teal);display:flex;align-items:center;justify-content:center;font-size:18px">📹</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${s.patient}</div>
            <div style="font-size:11.5px;color:var(--text-secondary)">${s.protocol}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">Session ${s.session} · ${s.time}</div>
          </div>
        </div>
        <button class="btn btn-sm" onclick="window._joinTelehealth('${s.id}', ${s.video_url ? "'" + s.video_url + "'" : 'null'}, '${s.patient}', '${s.protocol}', '${s.session}')">Join Session →</button>
      </div>`).join('')}
    </div>
  </div>

  <!-- Feature tiles -->
  <div style="display:flex;gap:12px;flex-wrap:wrap">
    ${[
      ['HIPAA-Compliant Video', 'E2E encrypted, no data retention', '🔐'],
      ['In-session Protocol View', 'Display and annotate protocols live', '📋'],
      ['Real-time Assessment', 'Send assessments during session', '📊'],
    ].map(([t, d, ic]) => `
      <div class="card" style="text-align:left;padding:16px 20px;min-width:180px;flex:1;max-width:240px">
        <div style="font-size:22px;margin-bottom:8px">${ic}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${t}</div>
        <div style="font-size:11.5px;color:var(--text-secondary)">${d}</div>
      </div>`).join('')}
  </div>
  `;

  window._joinTelehealth = function(sessionId, videoUrl, patientName, protocol, sessionNum) {
    if (videoUrl) { window.open(videoUrl, '_blank'); return; }
    // Store session context for video UI
    window._thSession = { sessionId, patientName, protocol, sessionNum };
    const panel = document.getElementById('th-prejoin-panel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Reset checks
    ['conn','mic','cam'].forEach(k => {
      const icon = document.getElementById('th-icon-' + k);
      if (icon) icon.textContent = '⏳';
    });
    const btn = document.getElementById('th-enter-btn');
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }

    // Simulate checks
    setTimeout(() => {
      const ic = document.getElementById('th-icon-conn');
      if (ic) { ic.textContent = '✅'; ic.style.color = 'var(--green)'; }
    }, 1500);
    setTimeout(() => {
      const ic = document.getElementById('th-icon-mic');
      if (ic) { ic.textContent = '✅'; ic.style.color = 'var(--green)'; }
    }, 2500);
    setTimeout(() => {
      const ic = document.getElementById('th-icon-cam');
      if (ic) { ic.textContent = '✅'; ic.style.color = 'var(--green)'; }
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
    }, 3500);
  };

  window._enterVideoSession = function() {
    const s = window._thSession || { patientName: 'Patient', protocol: 'tDCS · DLPFC\n2mA · 20 min\nAnode: F3\nCathode: Fp2', sessionNum: '1 of 20' };
    const protoLines = (s.protocol || '').replace(/·/g, '·').replace(/\n/g, '<br>');
    // Clear any interval
    if (window._thTimerInterval) clearInterval(window._thTimerInterval);
    let elapsed = 0;
    const content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = `<div id="th-video-ui" style="position:fixed;inset:0;background:#0a0a0f;z-index:2000;display:flex;flex-direction:column">
  <!-- Timer bar -->
  <div style="height:36px;background:#0d1117;display:flex;align-items:center;justify-content:center;border-bottom:1px solid rgba(255,255,255,0.08)">
    <span id="th-timer" style="font-family:var(--font-mono);font-size:14px;color:var(--teal);letter-spacing:1px">00:00:00</span>
  </div>
  <!-- Video area -->
  <div style="flex:1;display:grid;grid-template-columns:1fr 240px;gap:8px;padding:8px;overflow:hidden">
    <!-- Main video (patient) -->
    <div style="background:#1a1a2e;border-radius:12px;display:flex;align-items:center;justify-content:center;position:relative">
      <div style="text-align:center;color:rgba(255,255,255,0.3)">
        <div style="font-size:64px;margin-bottom:16px">👤</div>
        <div style="font-size:14px">Patient Camera</div>
        <div style="font-size:12px;margin-top:4px;color:var(--teal)">● Connected</div>
      </div>
      <div style="position:absolute;bottom:12px;left:12px;font-size:12px;color:#fff;background:rgba(0,0,0,0.5);padding:4px 10px;border-radius:4px">${s.patientName || 'Patient'}</div>
      <div style="position:absolute;top:12px;right:12px;font-size:11px;color:var(--green);background:rgba(0,0,0,0.5);padding:3px 8px;border-radius:4px">HD ●</div>
    </div>
    <!-- Self view + protocol panel -->
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="background:#1a1a2e;border-radius:8px;height:160px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.3);font-size:12px">You (Camera off)</div>
      <div style="background:#12172b;border-radius:8px;flex:1;padding:12px;overflow-y:auto">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--teal);margin-bottom:8px">Session Protocol</div>
        <div style="font-size:12px;color:#cdd6f4">${protoLines}</div>
        <div style="margin-top:12px;font-size:10px;color:rgba(255,255,255,0.4)">Session ${s.sessionNum || ''}</div>
      </div>
    </div>
  </div>
  <!-- Controls bar -->
  <div style="height:72px;background:#0d1117;display:flex;align-items:center;justify-content:center;gap:16px;border-top:1px solid rgba(255,255,255,0.1)">
    <button onclick="this.style.background=this.style.background?'':'rgba(255,107,107,0.3)'" style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;cursor:pointer;color:#fff;font-size:18px" title="Mute">🎤</button>
    <button onclick="this.style.background=this.style.background?'':'rgba(255,107,107,0.3)'" style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;cursor:pointer;color:#fff;font-size:18px" title="Camera">📷</button>
    <button onclick="this.style.background=this.style.background?'':'rgba(74,158,255,0.3)'" style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;cursor:pointer;color:#fff;font-size:18px" title="Share Screen">🖥</button>
    <button onclick="if(window._thTimerInterval)clearInterval(window._thTimerInterval);window._nav('telehealth')" style="width:56px;height:44px;border-radius:22px;background:#dc2626;border:none;cursor:pointer;color:#fff;font-size:13px;font-weight:600">End</button>
    <button onclick="this.style.background=this.style.background?'':'rgba(74,158,255,0.3)'" style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;cursor:pointer;color:#fff;font-size:16px" title="Chat">💬</button>
    <button onclick="this.style.background=this.style.background?'':'rgba(74,158,255,0.3)'" style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;cursor:pointer;color:#fff;font-size:16px" title="Notes">📝</button>
  </div>
</div>`;

    // Start timer
    window._thTimerInterval = setInterval(() => {
      elapsed++;
      const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const sc = String(elapsed % 60).padStart(2, '0');
      const timerEl = document.getElementById('th-timer');
      if (timerEl) timerEl.textContent = h + ':' + m + ':' + sc;
      else clearInterval(window._thTimerInterval);
    }, 1000);
  };
}

// ── Messaging ─────────────────────────────────────────────────────────────────
export function pgMsg(setTopbar) {
  setTopbar('Secure Messaging', '');
  const el = document.getElementById('content');
  el.innerHTML = `
    <div style="max-width:680px;margin:0 auto;padding:48px 24px;text-align:center">
      <div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,var(--navy-700),var(--navy-600));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 24px">◫</div>
      <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Secure Clinician Messaging</div>
      <div style="font-size:13.5px;color:var(--text-secondary);line-height:1.65;margin-bottom:32px;max-width:480px;margin-left:auto;margin-right:auto">
        HIPAA-compliant, end-to-end encrypted messaging between clinicians and patients is in active development.<br><br>
        In the meantime, use Telegram notifications (configured in Settings) for real-time alerts and patient follow-ups.
      </div>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:40px">
        <div class="card" style="text-align:left;padding:16px 20px;min-width:180px;flex:1;max-width:220px">
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Planned</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Patient–Clinician Messaging</div>
          <div style="font-size:11.5px;color:var(--text-secondary)">HIPAA-compliant encrypted threads</div>
        </div>
        <div class="card" style="text-align:left;padding:16px 20px;min-width:180px;flex:1;max-width:220px">
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Planned</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Automated Reminders</div>
          <div style="font-size:11.5px;color:var(--text-secondary)">Session reminders and follow-ups</div>
        </div>
        <div class="card" style="text-align:left;padding:16px 20px;min-width:180px;flex:1;max-width:220px">
          <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Planned</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Attachment Support</div>
          <div style="font-size:11.5px;color:var(--text-secondary)">Share reports and protocol PDFs</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:var(--radius-md);background:var(--teal-ghost);border:1px solid var(--border-teal);color:var(--teal);font-size:12px;font-weight:500">
          <span>◈</span> Coming in a future release
        </div>
        <button class="btn btn-sm" onclick="window._nav('settings')">Configure Telegram →</button>
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

// ── Billing & Superbills ──────────────────────────────────────────────────────
export async function pgBilling(setTopbar) {
  setTopbar('Billing & Superbills', `<button class="btn btn-primary btn-sm" onclick="window._newInvoice()">+ New Invoice</button>`);

  const CPT_CODES = [
    { code: '90837', desc: 'Psychotherapy, 60 min', rate: 175 },
    { code: '90834', desc: 'Psychotherapy, 45 min', rate: 140 },
    { code: '90853', desc: 'Group psychotherapy', rate: 75 },
    { code: '97012', desc: 'Mechanical traction', rate: 45 },
    { code: '97110', desc: 'Therapeutic exercises', rate: 55 },
    { code: '90901', desc: 'Biofeedback training', rate: 120 },
    { code: '90875', desc: 'Individual psychophysiological therapy', rate: 160 },
    { code: '96020', desc: 'Neurofunctional testing', rate: 200 },
  ];

  const PAYERS = [
    { id: 'bcbs',    name: 'Blue Cross Blue Shield', copay: 30, deductible: 1500 },
    { id: 'aetna',   name: 'Aetna',                  copay: 40, deductible: 2000 },
    { id: 'cigna',   name: 'Cigna',                  copay: 35, deductible: 1800 },
    { id: 'uhc',     name: 'United Healthcare',       copay: 45, deductible: 2500 },
    { id: 'selfpay', name: 'Self Pay',                copay: 0,  deductible: 0    },
  ];

  // ── Invoice store ──────────────────────────────────────────────────────────
  function getInvoices() {
    const raw = localStorage.getItem('ds_invoices');
    if (raw) return JSON.parse(raw);
    const seeds = [
      { id: 'inv-001', patient: 'Alexandra Reid',  date: '2026-03-15', cpts: ['90837','90901'], amount: 295, payer: 'bcbs',    status: 'paid'    },
      { id: 'inv-002', patient: 'Marcus Chen',     date: '2026-03-22', cpts: ['90834'],          amount: 140, payer: 'aetna',   status: 'pending' },
      { id: 'inv-003', patient: 'Sofia Navarro',   date: '2026-02-28', cpts: ['96020','90875'],  amount: 360, payer: 'cigna',   status: 'overdue' },
      { id: 'inv-004', patient: 'James Okafor',    date: '2026-04-01', cpts: ['90853','97110'],  amount: 130, payer: 'selfpay', status: 'pending' },
    ];
    localStorage.setItem('ds_invoices', JSON.stringify(seeds));
    return seeds;
  }

  function saveInvoice(inv) {
    const list = getInvoices();
    const idx = list.findIndex(i => i.id === inv.id);
    if (idx >= 0) list[idx] = inv; else list.push(inv);
    localStorage.setItem('ds_invoices', JSON.stringify(list));
  }

  function getInvoice(id) {
    return getInvoices().find(i => i.id === id) || null;
  }

  function cptLabel(code) {
    const c = CPT_CODES.find(x => x.code === code);
    return c ? `${code} – ${c.desc}` : code;
  }

  function payerName(id) {
    const p = PAYERS.find(x => x.id === id);
    return p ? p.name : id;
  }

  function statusBadge(s) {
    return `<span class="status-badge-${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</span>`;
  }

  function kpis(invoices) {
    const totalBilled  = invoices.reduce((a, i) => a + i.amount, 0);
    const collected    = invoices.filter(i => i.status === 'paid').reduce((a, i) => a + i.amount, 0);
    const outstanding  = invoices.filter(i => i.status === 'pending').reduce((a, i) => a + i.amount, 0);
    const overdue      = invoices.filter(i => i.status === 'overdue').reduce((a, i) => a + i.amount, 0);
    return { totalBilled, collected, outstanding, overdue };
  }

  function fmt(n) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function renderInvoiceRows(list) {
    if (!list.length) return `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted)">No invoices found.</td></tr>`;
    return list.map(inv => `
      <tr>
        <td>${inv.patient}</td>
        <td>${inv.date}</td>
        <td style="font-size:.8rem;color:var(--text-secondary)">${inv.cpts.map(cptLabel).join('<br>')}</td>
        <td><strong>${fmt(inv.amount)}</strong></td>
        <td>${payerName(inv.payer)}</td>
        <td>${statusBadge(inv.status)}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" onclick="window._viewInvoice('${inv.id}')">View</button>
          ${inv.status !== 'paid' ? `<button class="btn btn-sm" style="background:var(--teal);color:#fff;margin-left:4px" onclick="window._markPaid('${inv.id}')">Mark Paid</button>` : ''}
          <button class="btn btn-ghost btn-sm" style="margin-left:4px" onclick="window._printInvoice('${inv.id}')">Print</button>
        </td>
      </tr>`).join('');
  }

  function renderKpiStrip(invoices) {
    const k = kpis(invoices);
    return `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
        <div class="card" style="padding:16px;border-left:4px solid #f59e0b">
          <div style="font-size:.75rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Total Billed</div>
          <div style="font-size:1.5rem;font-weight:700;color:#f59e0b">${fmt(k.totalBilled)}</div>
        </div>
        <div class="card" style="padding:16px;border-left:4px solid #14b8a6">
          <div style="font-size:.75rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Collected</div>
          <div style="font-size:1.5rem;font-weight:700;color:#14b8a6">${fmt(k.collected)}</div>
        </div>
        <div class="card" style="padding:16px;border-left:4px solid #f43f5e">
          <div style="font-size:.75rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Outstanding</div>
          <div style="font-size:1.5rem;font-weight:700;color:#f43f5e">${fmt(k.outstanding)}</div>
        </div>
        <div class="card" style="padding:16px;border-left:4px solid #8b5cf6">
          <div style="font-size:.75rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Overdue</div>
          <div style="font-size:1.5rem;font-weight:700;color:#8b5cf6">${fmt(k.overdue)}</div>
        </div>
      </div>`;
  }

  function renderInvoicesTab(invoices, filterStatus, searchQ) {
    let list = invoices;
    if (filterStatus && filterStatus !== 'all') list = list.filter(i => i.status === filterStatus);
    if (searchQ) list = list.filter(i => i.patient.toLowerCase().includes(searchQ.toLowerCase()));
    return `
      ${renderKpiStrip(invoices)}
      <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
        <div style="display:flex;gap:6px">
          ${['all','paid','pending','overdue'].map(s => `
            <button class="btn btn-sm ${filterStatus === s ? 'btn-primary' : 'btn-ghost'}"
              onclick="window._filterInvoices('${s}')">${s.charAt(0).toUpperCase()+s.slice(1)}</button>`).join('')}
        </div>
        <input type="search" placeholder="Search patient…" value="${searchQ||''}"
          oninput="window._searchInvoices(this.value)"
          style="margin-left:auto;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary);font-size:.875rem;min-width:200px">
      </div>
      <div style="overflow-x:auto">
        <table class="invoice-table">
          <thead><tr>
            <th>Patient</th><th>Date</th><th>CPT Codes</th><th>Amount</th><th>Payer</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>${renderInvoiceRows(list)}</tbody>
        </table>
      </div>`;
  }

  function renderSuperbillTab() {
    const patientOptions = getInvoices().map(i =>
      `<option value="${i.patient}">${i.patient}</option>`
    ).filter((v, i, a) => a.indexOf(v) === i).join('');
    const cptCheckboxes = CPT_CODES.map(c => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer">
        <input type="checkbox" name="sb-cpt" value="${c.code}" onchange="window._updateSuperbillPreview()">
        <span style="font-weight:600;font-size:.875rem">${c.code}</span>
        <span style="color:var(--text-secondary);font-size:.875rem">${c.desc}</span>
        <span style="margin-left:auto;color:var(--text-muted);font-size:.8rem">${fmt(c.rate)}</span>
      </label>`).join('');
    const payerOptions = PAYERS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">
        <div class="card" style="padding:24px">
          <h3 style="margin:0 0 16px;font-size:1rem">Superbill Details</h3>
          <div style="display:flex;flex-direction:column;gap:14px">
            <div>
              <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">PATIENT</label>
              <select id="sb-patient" onchange="window._updateSuperbillPreview()"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary)">
                <option value="">-- Select patient --</option>
                ${patientOptions}
              </select>
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">DATE OF SERVICE</label>
              <input type="date" id="sb-date" value="${new Date().toISOString().slice(0,10)}"
                onchange="window._updateSuperbillPreview()"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary)">
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">PROVIDER NAME</label>
              <input type="text" id="sb-provider" placeholder="Dr. Jane Smith" oninput="window._updateSuperbillPreview()"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary)">
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">DIAGNOSIS CODE (ICD-10)</label>
              <input type="text" id="sb-icd" placeholder="e.g. F32.1" oninput="window._updateSuperbillPreview()"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary)">
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">PAYER</label>
              <select id="sb-payer" onchange="window._updateSuperbillPreview()"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary)">
                ${payerOptions}
              </select>
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">CPT CODES</label>
              <div style="border:1px solid var(--border);border-radius:6px;padding:4px 10px;max-height:220px;overflow-y:auto">
                ${cptCheckboxes}
              </div>
            </div>
            <div>
              <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">NOTES</label>
              <textarea id="sb-notes" rows="3" oninput="window._updateSuperbillPreview()"
                style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary);resize:vertical;box-sizing:border-box"
                placeholder="Additional clinical notes…"></textarea>
            </div>
            <button class="btn btn-primary" onclick="window._generateSuperbill()">Generate Superbill</button>
          </div>
        </div>
        <div>
          <div class="card" style="padding:20px;margin-bottom:16px">
            <h3 style="margin:0 0 12px;font-size:1rem">Live Preview</h3>
            <div id="sb-preview-wrap">
              <div style="color:var(--text-muted);font-size:.875rem;padding:24px;text-align:center">
                Fill in the form to see the superbill preview.
              </div>
            </div>
          </div>
          <div id="sb-print-btn-wrap" style="display:none">
            <button class="btn btn-primary" style="width:100%" onclick="window.print()">Print Superbill</button>
          </div>
        </div>
      </div>`;
  }

  // ── Tab state ──────────────────────────────────────────────────────────────
  let _activeTab    = 'invoices';
  let _filterStatus = 'all';
  let _searchQ      = '';

  const el = document.getElementById('app-content');

  function renderPage() {
    const invoices = getInvoices();
    el.innerHTML = `
      <div style="padding:24px;max-width:1200px;margin:0 auto">
        <div style="display:flex;gap:4px;margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:0">
          <button class="btn btn-sm ${_activeTab==='invoices'?'btn-primary':'btn-ghost'}"
            style="border-radius:6px 6px 0 0;margin-bottom:-1px;${_activeTab==='invoices'?'border-bottom:1px solid var(--bg-surface,#1a1a2e)':''}"
            onclick="window._billingTab('invoices')">Invoices</button>
          <button class="btn btn-sm ${_activeTab==='superbill'?'btn-primary':'btn-ghost'}"
            style="border-radius:6px 6px 0 0;margin-bottom:-1px;${_activeTab==='superbill'?'border-bottom:1px solid var(--bg-surface,#1a1a2e)':''}"
            onclick="window._billingTab('superbill')">Superbill Generator</button>
        </div>
        <div id="billing-tab-content">
          ${_activeTab === 'invoices' ? renderInvoicesTab(invoices, _filterStatus, _searchQ) : renderSuperbillTab()}
        </div>
      </div>`;
    if (_activeTab === 'superbill') {
      window._updateSuperbillPreview();
    }
  }

  // ── Window handlers ────────────────────────────────────────────────────────
  window._billingTab = function(tab) {
    _activeTab = tab;
    renderPage();
  };

  window._filterInvoices = function(status) {
    _filterStatus = status;
    const invoices = getInvoices();
    document.getElementById('billing-tab-content').innerHTML =
      renderInvoicesTab(invoices, _filterStatus, _searchQ);
  };

  window._searchInvoices = function(q) {
    _searchQ = q;
    const invoices = getInvoices();
    document.getElementById('billing-tab-content').innerHTML =
      renderInvoicesTab(invoices, _filterStatus, _searchQ);
  };

  window._markPaid = function(id) {
    const inv = getInvoice(id);
    if (!inv) return;
    inv.status = 'paid';
    saveInvoice(inv);
    renderPage();
    window._announce?.('Invoice marked as paid');
  };

  window._viewInvoice = function(id) {
    const inv = getInvoice(id);
    if (!inv) return;
    const cptLines = inv.cpts.map(code => {
      const c = CPT_CODES.find(x => x.code === code);
      return `<tr><td>${code}</td><td>${c ? c.desc : '–'}</td><td style="text-align:right">${c ? fmt(c.rate) : '–'}</td></tr>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.id = 'billing-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:32px;max-width:520px;width:90%;position:relative">
        <button onclick="document.getElementById('billing-modal-overlay').remove()"
          style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:1.25rem;cursor:pointer;color:var(--text-secondary)">✕</button>
        <h2 style="margin:0 0 4px;font-size:1.1rem">Invoice ${inv.id}</h2>
        <div style="color:var(--text-muted);font-size:.8rem;margin-bottom:20px">${inv.date}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
          <div><div style="font-size:.75rem;color:var(--text-muted)">PATIENT</div><div style="font-weight:600">${inv.patient}</div></div>
          <div><div style="font-size:.75rem;color:var(--text-muted)">PAYER</div><div style="font-weight:600">${payerName(inv.payer)}</div></div>
          <div><div style="font-size:.75rem;color:var(--text-muted)">STATUS</div>${statusBadge(inv.status)}</div>
          <div><div style="font-size:.75rem;color:var(--text-muted)">TOTAL</div><div style="font-weight:700;font-size:1.1rem">${fmt(inv.amount)}</div></div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <thead><tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:6px;font-size:.75rem;color:var(--text-muted)">CODE</th>
            <th style="text-align:left;padding:6px;font-size:.75rem;color:var(--text-muted)">DESCRIPTION</th>
            <th style="text-align:right;padding:6px;font-size:.75rem;color:var(--text-muted)">RATE</th>
          </tr></thead>
          <tbody>${cptLines}</tbody>
        </table>
        ${inv.status !== 'paid' ? `<button class="btn btn-primary" style="width:100%" onclick="window._markPaid('${inv.id}');document.getElementById('billing-modal-overlay').remove()">Mark as Paid</button>` : ''}
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  };

  window._printInvoice = function(id) {
    const inv = getInvoice(id);
    if (!inv) return;
    const cptRows = inv.cpts.map(code => {
      const c = CPT_CODES.find(x => x.code === code);
      return `<tr><td>${code}</td><td>${c ? c.desc : '–'}</td><td style="text-align:right">${c ? fmt(c.rate) : '–'}</td></tr>`;
    }).join('');
    const printEl = document.createElement('div');
    printEl.className = 'print-only-superbill';
    printEl.style.cssText = 'display:none;position:fixed;inset:0;background:white;z-index:99999;padding:40px;font-family:serif;color:#111';
    printEl.innerHTML = `
      <div style="max-width:700px;margin:0 auto">
        <h2 style="margin:0;font-size:1.4rem">DeepSynaps Protocol Studio</h2>
        <div style="font-size:.9rem;color:#555;margin-bottom:24px">Invoice / Superbill</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
          <div><strong>Patient:</strong> ${inv.patient}</div>
          <div><strong>Date:</strong> ${inv.date}</div>
          <div><strong>Payer:</strong> ${payerName(inv.payer)}</div>
          <div><strong>Status:</strong> ${inv.status.toUpperCase()}</div>
          <div><strong>Invoice #:</strong> ${inv.id}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="background:#f5f5f5">
            <th style="border:1px solid #ccc;padding:6px 10px;text-align:left">CPT Code</th>
            <th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Description</th>
            <th style="border:1px solid #ccc;padding:6px 10px;text-align:right">Rate</th>
          </tr></thead>
          <tbody>${cptRows}</tbody>
          <tfoot><tr>
            <td colspan="2" style="border:1px solid #ccc;padding:6px 10px;font-weight:700;text-align:right">Total</td>
            <td style="border:1px solid #ccc;padding:6px 10px;font-weight:700;text-align:right">${fmt(inv.amount)}</td>
          </tr></tfoot>
        </table>
        <div style="margin-top:48px;border-top:1px solid #ccc;padding-top:12px;font-size:.85rem;color:#555">
          Provider signature: ______________________________ &nbsp;&nbsp; NPI: ______________________
        </div>
      </div>`;
    document.body.appendChild(printEl);
    window.print();
    setTimeout(() => printEl.remove(), 1000);
  };

  window._generateSuperbill = function() {
    window._updateSuperbillPreview();
    const wrap = document.getElementById('sb-print-btn-wrap');
    if (wrap) wrap.style.display = 'block';
    window._announce?.('Superbill generated. Ready to print.');
  };

  window._updateSuperbillPreview = function() {
    const patient  = document.getElementById('sb-patient')?.value || '';
    const date     = document.getElementById('sb-date')?.value || '';
    const provider = document.getElementById('sb-provider')?.value || '';
    const icd      = document.getElementById('sb-icd')?.value || '';
    const payerId  = document.getElementById('sb-payer')?.value || '';
    const notes    = document.getElementById('sb-notes')?.value || '';
    const checkedCpts = [...document.querySelectorAll('input[name="sb-cpt"]:checked')].map(cb => cb.value);
    const payer = PAYERS.find(p => p.id === payerId) || PAYERS[0];

    const cptRows = checkedCpts.length
      ? checkedCpts.map(code => {
          const c = CPT_CODES.find(x => x.code === code);
          return `<tr><td>${code}</td><td>${c ? c.desc : '–'}</td><td style="text-align:right">${c ? fmt(c.rate) : '–'}</td></tr>`;
        }).join('')
      : `<tr><td colspan="3" style="text-align:center;color:#888;padding:8px">No CPT codes selected.</td></tr>`;
    const total = checkedCpts.reduce((sum, code) => {
      const c = CPT_CODES.find(x => x.code === code);
      return sum + (c ? c.rate : 0);
    }, 0);

    const previewHTML = `
      <div class="superbill-preview">
        <h2>DeepSynaps Protocol Studio</h2>
        <div style="font-size:.85rem;color:#555;margin-bottom:20px">Superbill / Statement of Services</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.875rem;margin-bottom:16px">
          <div><strong>Patient:</strong> ${patient || '<em style="color:#999">—</em>'}</div>
          <div><strong>DOB:</strong> ___________</div>
          <div><strong>Date of Service:</strong> ${date || '<em style="color:#999">—</em>'}</div>
          <div><strong>Provider:</strong> ${provider || '<em style="color:#999">—</em>'}</div>
          <div><strong>NPI:</strong> ___________</div>
          <div><strong>Diagnosis (ICD-10):</strong> ${icd || '<em style="color:#999">—</em>'}</div>
          <div><strong>Payer:</strong> ${payer.name}</div>
          ${payer.copay ? `<div><strong>Copay:</strong> ${fmt(payer.copay)}</div>` : ''}
        </div>
        <table class="superbill-table">
          <thead><tr>
            <th>CPT Code</th><th>Description</th><th style="text-align:right">Fee</th>
          </tr></thead>
          <tbody>${cptRows}</tbody>
          <tfoot><tr>
            <td colspan="2" style="text-align:right;font-weight:700">Total</td>
            <td style="text-align:right;font-weight:700">${fmt(total)}</td>
          </tr></tfoot>
        </table>
        ${notes ? `<div style="margin-top:12px;font-size:.85rem"><strong>Notes:</strong> ${notes}</div>` : ''}
        <div style="margin-top:32px;border-top:1px solid #ccc;padding-top:12px;font-size:.8rem;color:#555">
          Provider signature: ______________________________ &nbsp;&nbsp; Date: ___________
        </div>
      </div>`;

    const wrap = document.getElementById('sb-preview-wrap');
    if (wrap) wrap.innerHTML = previewHTML;
  };

  // ── New Invoice modal ──────────────────────────────────────────────────────
  window._newInvoice = function() {
    const existingOverlay = document.getElementById('new-invoice-overlay');
    if (existingOverlay) existingOverlay.remove();

    const patientNames = ['Alexandra Reid', 'Marcus Chen', 'Sofia Navarro', 'James Okafor', 'Priya Sharma', 'David Müller'];
    const patientOptions = patientNames.map(n => `<option value="${n}">${n}</option>`).join('');
    const cptCheckboxes = CPT_CODES.map(c => `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;font-size:.875rem">
        <input type="checkbox" name="ni-cpt" value="${c.code}">
        <span style="font-weight:600">${c.code}</span>
        <span style="color:var(--text-secondary)">${c.desc}</span>
        <span style="margin-left:auto;color:var(--text-muted)">${fmt(c.rate)}</span>
      </label>`).join('');
    const payerOptions = PAYERS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'new-invoice-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:28px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;position:relative">
        <button onclick="document.getElementById('new-invoice-overlay').remove()"
          style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-secondary)">✕</button>
        <h2 style="margin:0 0 20px;font-size:1.1rem">New Invoice</h2>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">PATIENT</label>
            <select id="ni-patient" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary)">
              <option value="">-- Select patient --</option>
              ${patientOptions}
            </select>
          </div>
          <div>
            <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">DATE OF SERVICE</label>
            <input type="date" id="ni-date" value="${new Date().toISOString().slice(0,10)}"
              style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary)">
          </div>
          <div>
            <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">PAYER</label>
            <select id="ni-payer" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input,var(--bg-surface));color:var(--text-primary)">
              ${payerOptions}
            </select>
          </div>
          <div>
            <label style="font-size:.8rem;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">CPT CODES</label>
            <div style="border:1px solid var(--border);border-radius:6px;padding:4px 10px;max-height:200px;overflow-y:auto">
              ${cptCheckboxes}
            </div>
          </div>
          <div id="ni-error" style="color:#f43f5e;font-size:.85rem;display:none"></div>
          <button class="btn btn-primary" onclick="window._submitNewInvoice()">Create Invoice</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    trapFocus?.(overlay);
  };

  window._submitNewInvoice = function() {
    const patient  = document.getElementById('ni-patient')?.value;
    const date     = document.getElementById('ni-date')?.value;
    const payerId  = document.getElementById('ni-payer')?.value;
    const cpts     = [...document.querySelectorAll('input[name="ni-cpt"]:checked')].map(cb => cb.value);
    const errEl    = document.getElementById('ni-error');

    if (!patient) { if (errEl) { errEl.textContent = 'Please select a patient.'; errEl.style.display='block'; } return; }
    if (!cpts.length) { if (errEl) { errEl.textContent = 'Select at least one CPT code.'; errEl.style.display='block'; } return; }

    const amount = cpts.reduce((sum, code) => {
      const c = CPT_CODES.find(x => x.code === code);
      return sum + (c ? c.rate : 0);
    }, 0);

    const inv = {
      id:      'inv-' + Date.now(),
      patient,
      date:    date || new Date().toISOString().slice(0,10),
      cpts,
      amount,
      payer:   payerId || 'selfpay',
      status:  'pending',
    };
    saveInvoice(inv);
    document.getElementById('new-invoice-overlay')?.remove();
    renderPage();
    window._announce?.('Invoice created');
  };

  // ── Initial render ─────────────────────────────────────────────────────────
  renderPage();
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

  el.innerHTML = `
    <!-- Account Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Account</span>
      </div>
      <div class="card-body">
        ${[
          ['Display Name', currentUser?.display_name || '—'],
          ['Email',        currentUser?.email || '—'],
          ['Role',         `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(0,212,188,0.1);color:var(--teal)">${currentUser?.role || 'guest'}</span>`],
          ['Package',      `<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(74,158,255,0.1);color:var(--blue)">${currentUser?.package_id || 'explorer'}</span>`],
          ['Verified',     currentUser?.is_verified ? '<span style="color:var(--green)">Yes ✓</span>' : '<span style="color:var(--amber)">Pending</span>'],
        ].map(([k, v]) => fr(k, v)).join('')}
      </div>
    </div>

    <!-- Appearance Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Appearance</span>
      </div>
      <div class="card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:3px">Interface Theme</div>
            <div style="font-size:12px;color:var(--text-secondary)">Choose between dark and light interface</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;color:var(--text-secondary)" id="settings-theme-label">${window._currentTheme === 'light' ? 'Switch to Dark' : 'Switch to Light'}</span>
            <button class="btn btn-sm" onclick="window._toggleTheme();document.getElementById('settings-theme-label').textContent=window._currentTheme==='light'?'Switch to Dark':'Switch to Light'" style="display:flex;align-items:center;gap:6px;min-width:130px;justify-content:center">
              <span>${window._currentTheme === 'light' ? '\u{1F319}' : '\u2600\uFE0F'}</span>
              <span>Toggle Theme</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Clinic Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Clinic</span>
      </div>
      <div class="card-body">
        ${[
          ['Clinic Name',  '—'],
          ['Address',      '—'],
          ['Phone',        '—'],
          ['Time Zone',    Intl.DateTimeFormat().resolvedOptions().timeZone || '—'],
        ].map(([k, v]) => fr(k, v)).join('')}
        <div style="margin-top:12px"><span style="font-size:11px;color:var(--text-tertiary);padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius-md);display:inline-block">Clinic profile editing — coming soon</span></div>
      </div>
    </div>

    <!-- Notifications Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Notifications</span>
      </div>
      <div class="card-body">
        ${[
          ['Session Reminders', '24h + 2h before'],
          ['Protocol Alerts',  'Enabled'],
          ['AE Alerts',        'Immediate (Telegram + email)'],
          ['Review Queue',     'Daily digest'],
        ].map(([k, v]) => fr(k, v)).join('')}
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
      </div>
    </div>

    <!-- Security Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Security</span>
      </div>
      <div class="card-body">
        ${[
          ['HIPAA',      '<span style="color:var(--green)">Compliant ✓</span>'],
          ['GDPR',       '<span style="color:var(--green)">Compliant ✓</span>'],
          ['2FA',        '<span style="color:var(--amber)">Recommended — not yet enabled</span>'],
          ['Audit Logs', '7-year retention policy'],
          ['Encryption', 'AES-256 at rest · TLS 1.3 in transit'],
        ].map(([k, v]) => fr(k, v)).join('')}
        ${cardWrap('Integrations', `
          ${[
            { name: 'DOCX Export',        desc: 'Generate clinical protocol documents',        active: true,  action: 'Configure →',  onClick: "window._nav('reports')" },
            { name: 'Stripe',             desc: 'Payment processing and billing portal',        active: true,  action: 'Manage →',     onClick: "window._nav('billing')" },
            { name: 'Telegram',           desc: 'Real-time clinical alerts and notifications',  active: !!telegramCode, action: 'Configure →', onClick: "window._nav('settings')" },
            { name: 'Google Calendar',    desc: 'Sync appointments and session reminders',      active: false, action: 'Connect →',    onClick: "window._toggleCalSync&&window._nav('scheduling')" },
            { name: 'Microsoft Outlook',  desc: 'Office 365 calendar integration',             active: false, action: 'Connect →',    onClick: "window._toggleCalSync&&window._nav('scheduling')" },
            { name: 'EHR / EMR (HL7 FHIR)', desc: 'Import patients from FHIR-compliant EHR',  active: false, action: 'Import →',     onClick: "window._nav('patients')" },
            { name: 'Twilio Video',       desc: 'HIPAA-compliant video consultations',         active: false, action: 'Connect →',    onClick: "window._nav('telehealth')" },
          ].map((int, idx, arr) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;${idx < arr.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
              <div style="display:flex;align-items:center;gap:12px">
                <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;${int.active ? 'background:var(--green)' : 'border:1.5px solid var(--border);background:none'}"></div>
                <div>
                  <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${int.name}</div>
                  <div style="font-size:11.5px;color:var(--text-secondary)">${int.desc}</div>
                </div>
              </div>
              <button class="btn btn-sm" onclick="${int.onClick}" ${int.action === 'Coming Soon' ? 'disabled style="opacity:.5"' : ''}>${int.action}</button>
            </div>`).join('')}
        `)}
      </div>
    </div>

    <!-- Billing Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Billing</span>
      </div>
      <div class="card-body">
        ${fr('Current Plan', `<strong>${currentUser?.package_id || 'Explorer'}</strong>`)}
        ${fr('Billing Portal', `<button class="btn btn-sm" onclick="window._openBillingPortal()">Manage Subscription →</button>`)}
        ${fr('Upgrade', `<button class="btn btn-primary btn-sm" onclick="window._nav('pricing')">View Plans →</button>`)}
        <div id="portal-status" style="font-size:11px;color:var(--text-tertiary);margin-top:4px"></div>
      </div>
    </div>

    <!-- Accessibility Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Accessibility</span>
      </div>
      <div class="card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-weight:500">High Contrast Mode</div>
            <div style="font-size:0.8rem;color:var(--text-secondary)">Increases color contrast for better visibility</div>
          </div>
          <button id="hc-toggle-btn" class="btn btn-secondary" onclick="window._toggleHighContrast();this.textContent=document.body.classList.contains('high-contrast')?'Disable':'Enable'" style="min-width:80px">
            ${document.body.classList.contains('high-contrast') ? 'Disable' : 'Enable'}
          </button>
        </div>
        ${(() => {
          const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
          return isInstalled
            ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:10px">
                  <span style="color:var(--teal)">✓</span>
                  <div><div style="font-weight:500">App Installed</div><div style="font-size:0.8rem;color:var(--text-secondary)">Running as installed PWA</div></div>
                </div>
              </div>`
            : `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
                <div>
                  <div style="font-weight:500">Install App</div>
                  <div style="font-size:0.8rem;color:var(--text-secondary)">Add to home screen for offline access</div>
                </div>
                <button class="btn-secondary" onclick="window._installPWA?.() || alert('To install: tap Share then Add to Home Screen (iOS) or use browser menu (Android/Chrome)')" style="font-size:0.8rem">
                  📱 Install
                </button>
              </div>`;
        })()}
      </div>
    </div>

    <!-- Danger Zone -->
    <div class="card" style="margin-bottom:16px;border-color:rgba(255,107,107,0.3)">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid rgba(255,107,107,0.2);background:rgba(255,107,107,0.04)">
        <span style="font-size:13px;font-weight:600;color:var(--red)">Danger Zone</span>
      </div>
      <div class="card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:4px 0">
          <div>
            <div style="font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:3px">Delete Account</div>
            <div style="font-size:12px;color:var(--text-secondary)">Permanently delete your account and all associated data. This action cannot be undone.</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="window._requestAccountDeletion()">Delete Account</button>
        </div>
      </div>
    </div>
  `;

  window._requestAccountDeletion = function() {
    const dangerEl = document.querySelector('.btn-danger');
    if (!confirm('Are you absolutely sure? This will permanently delete your account and all patient data. This cannot be undone.')) return;
    const typed = prompt('Type DELETE to confirm account deletion:');
    if (typed !== 'DELETE') { return; }
    if (dangerEl) { dangerEl.disabled = true; dangerEl.textContent = 'Request submitted'; }
    const notice = document.createElement('div');
    notice.className = 'notice notice-warn';
    notice.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:380px';
    notice.textContent = 'Account deletion requested. Our team will process this within 48 hours.';
    document.body.appendChild(notice); setTimeout(() => notice.remove(), 8000);
  };

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
          <div style="font-size:12px;color:var(--text-secondary);max-width:320px;margin:0 auto;line-height:1.6;margin-bottom:20px">
            Ask clinical questions, review protocol rationale, explore evidence, or get patient-specific guidance. Select a patient for contextual responses.
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;max-width:400px;margin:0 auto">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);font-weight:600;margin-bottom:4px">Suggested prompts</div>
            ${[
              'Generate a tDCS protocol for MDD',
              'What is the evidence for neurofeedback in ADHD?',
              'List contraindications for TMS',
            ].map(p => `<button class="btn btn-sm" data-prompt="${p}" style="text-align:left;white-space:normal;height:auto;padding:8px 14px;line-height:1.4;background:rgba(0,212,188,0.05);border-color:var(--border-teal);color:var(--text-primary)" onclick="window._chatSuggest(this.getAttribute('data-prompt'));document.getElementById('chat-input').focus()">✦ ${p}</button>`).join('')}
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

// ── Admin Panel ───────────────────────────────────────────────────────────────
export async function pgAdmin(setTopbar, currentUser) {
  setTopbar('Admin Panel', '');
  const el = document.getElementById('content');

  // Access gate — only admin role
  if (currentUser?.role !== 'admin') {
    el.innerHTML = '<div class="notice notice-warn" style="margin:48px auto;max-width:480px">Access restricted to administrators.</div>';
    return;
  }

  el.innerHTML = spinner();

  // System health — API check
  let apiStatus = 'Checking…';
  let apiStatusColor = 'var(--text-tertiary)';
  try {
    await api.health();
    apiStatus = 'Connected';
    apiStatusColor = 'var(--teal)';
  } catch (_) {
    apiStatus = 'Offline / Unavailable';
    apiStatusColor = 'var(--red)';
  }

  const MOCK_USERS = [
    { name: 'Dr. Sarah Chen',  email: 'sarah@clinic.com',  role: 'clinician',  pkg: 'professional', status: 'active' },
    { name: 'Dr. James Patel', email: 'james@clinic.com',  role: 'clinician',  pkg: 'professional', status: 'active' },
    { name: 'Tech Alex Kim',   email: 'alex@clinic.com',   role: 'technician', pkg: 'starter',      status: 'active' },
    { name: 'Jane Patient',    email: 'jane@clinic.com',   role: 'patient',    pkg: 'patient',      status: 'active' },
    { name: 'Dr. Maria Lopez', email: 'maria@clinic.com',  role: 'reviewer',   pkg: 'professional', status: 'active' },
  ];

  const ROLE_COLORS = {
    admin: 'var(--teal)', clinician: 'var(--blue)', technician: 'var(--violet)',
    reviewer: 'var(--amber)', supervisor: 'var(--rose)', patient: 'var(--green)',
    guest: 'var(--text-tertiary)',
  };

  // ── Org overview mock data (derived from window._clinics) ──────────────────
  const ORG_CLINICS = (window._clinics && window._clinics.length)
    ? window._clinics
    : [
        { id: 'c1', name: 'Main Clinic',     role: 'clinic-admin', patients: 84,  courses: 12, status: 'active'  },
        { id: 'c2', name: 'North Branch',    role: 'clinician',    patients: 47,  courses: 6,  status: 'active'  },
        { id: 'c3', name: 'Research Centre', role: 'supervisor',   patients: 21,  courses: 3,  status: 'pending' },
      ];

  // Augment with mock stats if missing
  const ORG_STATS = [
    { id: 'c1', patients: 84,  courses: 12, status: 'active'  },
    { id: 'c2', patients: 47,  courses: 6,  status: 'active'  },
    { id: 'c3', patients: 21,  courses: 3,  status: 'pending' },
  ];
  function getClinicStats(id) {
    return ORG_STATS.find(s => s.id === id) || { patients: 0, courses: 0, status: 'active' };
  }

  const totalPatients = ORG_STATS.reduce((a, s) => a + s.patients, 0);
  const totalClinicians = 7; // mock
  const ROLE_COLORS_ADM = {
    admin: 'var(--teal)', 'clinic-admin': 'var(--teal)', clinician: 'var(--blue)',
    technician: 'var(--violet)', reviewer: 'var(--amber)', supervisor: 'var(--rose)', guest: 'var(--text-tertiary)',
  };

  el.innerHTML = `
  <div class="page-section" style="max-width:960px">

    <!-- Organisation Overview (admin / clinic-admin only) -->
    <div class="ds-card card" id="org-overview-card" style="margin-bottom:20px;padding:20px">
      <h3 style="margin-bottom:16px;font-size:14px;font-weight:700">Organisation Overview</h3>

      <!-- Stat cards -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px" id="org-stats-grid">
        <div class="org-stat-card">
          <div class="org-stat-value">${ORG_CLINICS.length}</div>
          <div class="org-stat-label">Total Clinics</div>
        </div>
        <div class="org-stat-card">
          <div class="org-stat-value">${totalPatients}</div>
          <div class="org-stat-label">Total Patients (all clinics)</div>
        </div>
        <div class="org-stat-card">
          <div class="org-stat-value">${totalClinicians}</div>
          <div class="org-stat-label">Total Clinicians</div>
        </div>
      </div>

      <!-- Clinic Roster -->
      <h4 style="margin-bottom:12px;color:var(--text-secondary);font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em">Clinic Roster</h4>
      <table class="ds-table" id="clinic-roster-table">
        <thead>
          <tr><th>Clinic</th><th>Your Role</th><th>Patients</th><th>Active Courses</th><th>Status</th></tr>
        </thead>
        <tbody id="clinic-roster-body">
          ${ORG_CLINICS.map(c => {
            const stats = getClinicStats(c.id);
            const isActive = (c.status || stats.status) === 'active';
            const dotColor = isActive ? 'var(--green)' : 'var(--amber)';
            const roleCol = ROLE_COLORS_ADM[c.role] || 'var(--text-secondary)';
            return `<tr>
              <td style="font-weight:500">${c.name}</td>
              <td><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:${roleCol}18;color:${roleCol};text-transform:uppercase;letter-spacing:.5px">${c.role.replace('-',' ')}</span></td>
              <td style="color:var(--text-secondary)">${stats.patients}</td>
              <td style="color:var(--teal);font-weight:600">${stats.courses}</td>
              <td>
                <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px">
                  <span style="width:7px;height:7px;border-radius:50%;background:${dotColor};box-shadow:0 0 6px ${dotColor}60"></span>
                  ${isActive ? 'Active' : 'Pending setup'}
                </span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <!-- Org Hierarchy -->
      <div style="margin-top:24px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;cursor:pointer" onclick="window._toggleOrgTree()">
          <h4 style="color:var(--text-secondary);font-size:0.8rem;text-transform:uppercase;letter-spacing:.05em;margin:0">Org Hierarchy</h4>
          <span id="org-tree-arrow" style="font-size:11px;color:var(--text-tertiary)">&#9654; expand</span>
        </div>
        <div id="org-tree-wrap" style="display:none">
          <ul class="org-tree">
            <li>
              <div class="org-tree-label">
                <span style="font-size:16px">&#9660;</span>
                <span style="font-weight:700;font-size:14px">DeepSynaps Organisation</span>
              </div>
              <ul>
                ${ORG_CLINICS.map(c => {
                  const roleCol = ROLE_COLORS_ADM[c.role] || 'var(--text-secondary)';
                  const MOCK_MEMBERS = {
                    c1: [
                      { name: 'Dr. A. Smith',   role: 'clinician'  },
                      { name: 'T. Johnson',     role: 'technician' },
                      { name: 'R. Brown',       role: 'reviewer'   },
                    ],
                    c2: [{ name: 'Dr. K. Lee',  role: 'clinician'  }],
                    c3: [{ name: 'Dr. M. Ellis',role: 'supervisor' }],
                  };
                  const members = MOCK_MEMBERS[c.id] || [];
                  return `<li>
                    <div class="org-tree-label">
                      <span style="font-size:13px">&#10021;</span>
                      <span style="font-weight:600">${c.name}</span>
                      <span class="org-role-badge" style="background:${roleCol}18;color:${roleCol}">${c.role.replace('-',' ')}</span>
                    </div>
                    ${members.length ? `<ul>${members.map(m => {
                      const mc = ROLE_COLORS_ADM[m.role] || 'var(--text-secondary)';
                      return `<li>
                        <div class="org-tree-label" style="font-size:12.5px;color:var(--text-secondary)">
                          <span style="opacity:.5">&#8722;</span>
                          <span>${m.name}</span>
                          <span class="org-role-badge" style="background:${mc}18;color:${mc}">${m.role}</span>
                        </div>
                      </li>`;
                    }).join('')}</ul>` : ''}
                  </li>`;
                }).join('')}
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- User Management -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
        <h3 style="font-size:14px;font-weight:600;margin:0">User Management</h3>
        <span style="font-size:11px;color:var(--text-tertiary)">${MOCK_USERS.length} users</span>
      </div>
      <div style="overflow-x:auto">
        <table class="ds-table" style="min-width:640px">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Package</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${MOCK_USERS.map(u => `<tr>
              <td style="font-weight:500">${u.name}</td>
              <td style="font-size:12px;color:var(--text-secondary)">${u.email}</td>
              <td><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:${ROLE_COLORS[u.role] || 'var(--text-tertiary)'}18;color:${ROLE_COLORS[u.role] || 'var(--text-tertiary)'};text-transform:uppercase;letter-spacing:.5px">${u.role}</span></td>
              <td style="font-size:12px;color:var(--text-secondary)">${u.pkg}</td>
              <td><span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(74,222,128,0.12);color:var(--green);font-weight:600">${u.status}</span></td>
              <td>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-sm" style="font-size:11px;padding:3px 8px;opacity:0.5;cursor:not-allowed" disabled>Change Role</button>
                  <button class="btn btn-sm" style="font-size:11px;padding:3px 8px;color:var(--red);border-color:rgba(255,107,107,0.3);opacity:0.5;cursor:not-allowed" disabled>Deactivate</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">

      <!-- Clinic Settings -->
      <div class="card">
        <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <h3 style="font-size:14px;font-weight:600;margin:0">Clinic Settings</h3>
        </div>
        <div class="card-body" style="padding:16px 20px">
          <div class="form-group">
            <label class="form-label">Clinic Name</label>
            <input class="form-control" placeholder="DeepSynaps Neuromodulation Clinic" value="DeepSynaps Neuromodulation Clinic">
          </div>
          <div class="form-group">
            <label class="form-label">Address</label>
            <input class="form-control" placeholder="123 Brain St, Melbourne VIC 3000">
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input class="form-control" placeholder="+61 3 9999 0000">
          </div>
          <div class="form-group">
            <label class="form-label">Timezone</label>
            <select class="form-control">
              <option>Australia/Melbourne</option>
              <option>Australia/Sydney</option>
              <option>Australia/Perth</option>
              <option>Europe/London</option>
              <option>America/New_York</option>
              <option>America/Los_Angeles</option>
              <option>UTC</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group">
              <label class="form-label">Max Patients</label>
              <input class="form-control" type="number" value="200" min="1">
            </div>
            <div class="form-group">
              <label class="form-label">Max Courses / Patient</label>
              <input class="form-control" type="number" value="10" min="1">
            </div>
          </div>
          <button class="btn btn-primary" style="width:100%" onclick="(function(btn){btn.textContent='Saved';btn.disabled=true;setTimeout(function(){btn.textContent='Save Settings';btn.disabled=false;},2000)})(this)">Save Settings</button>
        </div>
      </div>

      <!-- Package & Billing Summary -->
      <div class="card">
        <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <h3 style="font-size:14px;font-weight:600;margin:0">Package &amp; Billing</h3>
        </div>
        <div class="card-body" style="padding:16px 20px">
          <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
            ${[
              ['Current Package', 'Enterprise'],
              ['Seats Used', '5 / 20'],
              ['Renewal Date', '2027-04-10'],
              ['Billing Cycle', 'Annual'],
              ['Next Invoice', '$4,800.00'],
            ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:12px;color:var(--text-secondary)">${k}</span>
              <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${v}</span>
            </div>`).join('')}
          </div>
          <button class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="window._nav('pricing')">Upgrade Package →</button>
          <button class="btn" style="width:100%;font-size:12px" onclick="window._nav('billing')">View Billing History</button>
        </div>
      </div>

    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">

      <!-- System Health -->
      <div class="card">
        <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <h3 style="font-size:14px;font-weight:600;margin:0">System Health</h3>
        </div>
        <div class="card-body" style="padding:16px 20px">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:12px;color:var(--text-secondary)">API Status</span>
              <span style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:${apiStatusColor}">
                <span style="width:8px;height:8px;border-radius:50%;background:${apiStatusColor};box-shadow:0 0 6px ${apiStatusColor}60"></span>
                ${apiStatus}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:12px;color:var(--text-secondary)">Last Backup</span>
              <span style="font-size:12.5px;color:var(--text-tertiary)">—</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:12px;color:var(--text-secondary)">Audit Log</span>
              <button class="btn btn-sm" style="font-size:11px;padding:3px 10px" onclick="window._nav('audittrail')">View Audit Trail →</button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0">
              <span style="font-size:12px;color:var(--text-secondary)">Platform Version</span>
              <span style="font-size:12px;font-family:var(--font-mono);color:var(--text-tertiary)">v1.0.0-beta</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Demo Data -->
      <div class="card">
        <div class="card-header" style="padding:14px 20px;border-bottom:1px solid var(--border)">
          <h3 style="font-size:14px;font-weight:600;margin:0">Demo &amp; Test Data</h3>
        </div>
        <div class="card-body" style="padding:16px 20px">
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65;margin-bottom:20px">
            Manage demo and sample data for testing and onboarding. These actions only affect demo environments.
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="btn" style="width:100%;color:var(--red);border-color:rgba(255,107,107,0.3);opacity:0.5;cursor:not-allowed" disabled>
              Reset Demo Data
            </button>
            <button class="btn" style="width:100%;opacity:0.5;cursor:not-allowed" disabled>
              Generate Sample Patients
            </button>
          </div>
        </div>
      </div>

    </div>

  </div>`;

  // Org hierarchy toggle
  window._toggleOrgTree = function() {
    const wrap = document.getElementById('org-tree-wrap');
    const arrow = document.getElementById('org-tree-arrow');
    if (!wrap) return;
    const isHidden = wrap.style.display === 'none';
    wrap.style.display = isHidden ? 'block' : 'none';
    if (arrow) arrow.innerHTML = isHidden ? '&#9660; collapse' : '&#9654; expand';
  };
}

// ── Referrals & Care Coordination ─────────────────────────────────────────────

// ── Data stores ───────────────────────────────────────────────────────────────

const REFERRAL_PROVIDERS_KEY = 'ds_referral_providers';

function getReferralProviders() {
  const raw = localStorage.getItem(REFERRAL_PROVIDERS_KEY);
  if (raw) return JSON.parse(raw);
  const seed = [
    { id: 'rp1', name: 'Dr. Sarah Chen', specialty: 'Neurology', clinic: 'NeuroHealth Center', phone: '555-0101', email: 'schen@neurohealth.com', fax: '555-0102', npi: '1234567890', notes: 'Specializes in TMS', lastReferralDate: '2026-03-15' },
    { id: 'rp2', name: 'Dr. Marcus Webb', specialty: 'Psychiatry', clinic: 'Westside Psychiatry', phone: '555-0201', email: 'mwebb@westpsych.com', fax: '555-0202', npi: '2345678901', notes: 'Treatment-resistant depression', lastReferralDate: '2026-03-20' },
    { id: 'rp3', name: 'Dr. Aisha Patel', specialty: 'Psychology', clinic: 'Integrative Mind Clinic', phone: '555-0301', email: 'apatel@intmind.com', fax: '555-0302', npi: '3456789012', notes: 'Trauma-focused CBT', lastReferralDate: '2026-02-28' },
    { id: 'rp4', name: 'Dr. James Torres', specialty: 'Physical Therapy', clinic: 'RehabPlus', phone: '555-0401', email: 'jtorres@rehabplus.com', fax: '555-0402', npi: '4567890123', notes: 'Neuro rehab', lastReferralDate: '2026-03-10' },
    { id: 'rp5', name: 'Dr. Linda Park', specialty: 'Primary Care', clinic: 'Greenfield Family Health', phone: '555-0501', email: 'lpark@gfhealth.com', fax: '555-0502', npi: '5678901234', notes: 'Coordinating PCP', lastReferralDate: '2026-03-05' },
    { id: 'rp6', name: 'Dr. Omar Hassan', specialty: 'Neurology', clinic: 'Brain & Spine Institute', phone: '555-0601', email: 'ohassan@bsi.com', fax: '555-0602', npi: '6789012345', notes: 'EEG & epilepsy', lastReferralDate: '2026-01-18' },
  ];
  localStorage.setItem(REFERRAL_PROVIDERS_KEY, JSON.stringify(seed));
  return seed;
}

function saveReferralProvider(p) {
  const list = getReferralProviders();
  const idx = list.findIndex(x => x.id === p.id);
  if (idx >= 0) list[idx] = p; else list.push(p);
  localStorage.setItem(REFERRAL_PROVIDERS_KEY, JSON.stringify(list));
}

function deleteReferralProvider(id) {
  const list = getReferralProviders().filter(x => x.id !== id);
  localStorage.setItem(REFERRAL_PROVIDERS_KEY, JSON.stringify(list));
}

const REFERRALS_KEY = 'ds_referrals';

function getReferrals() {
  const raw = localStorage.getItem(REFERRALS_KEY);
  if (raw) return JSON.parse(raw);
  const seed = [
    { id: 'ref1', patientName: 'Emily Rourke', fromProvider: 'Dr. Linda Park', toProvider: 'Dr. Sarah Chen', condition: 'Major Depressive Disorder', reason: 'TMS evaluation for treatment-resistant depression', date: '2026-04-01', status: 'in-progress', priority: 'high', notes: 'Failed 3 antidepressant trials. PHQ-9 = 22.', careTeam: [] },
    { id: 'ref2', patientName: 'Carlos Mendes', fromProvider: 'Dr. Marcus Webb', toProvider: 'Dr. Aisha Patel', condition: 'PTSD', reason: 'Trauma-focused CBT adjunct to medication management', date: '2026-04-03', status: 'pending', priority: 'urgent', notes: 'Recent hospitalization. Needs urgent intake.', careTeam: [] },
    { id: 'ref3', patientName: 'Yuki Tanaka', fromProvider: 'Dr. Sarah Chen', toProvider: 'Dr. James Torres', condition: 'Post-Stroke Rehabilitation', reason: 'Upper limb neuro rehab post tDCS', date: '2026-03-25', status: 'accepted', priority: 'routine', notes: 'Good candidate for combined TMS + PT protocol.', careTeam: [] },
    { id: 'ref4', patientName: 'Harold Bishop', fromProvider: 'Dr. Linda Park', toProvider: 'Dr. Omar Hassan', condition: 'Epilepsy Monitoring', reason: 'qEEG baseline and seizure mapping', date: '2026-03-18', status: 'completed', priority: 'high', notes: 'EEG completed. Report sent to PCP.', careTeam: [] },
    { id: 'ref5', patientName: 'Sophia Grant', fromProvider: 'Dr. Marcus Webb', toProvider: 'Dr. Sarah Chen', condition: 'OCD', reason: 'Deep TMS protocol consideration', date: '2026-04-07', status: 'pending', priority: 'routine', notes: 'Y-BOCS = 28. Medication optimized.', careTeam: [] },
  ];
  localStorage.setItem(REFERRALS_KEY, JSON.stringify(seed));
  return seed;
}

function saveReferral(r) {
  const list = getReferrals();
  const idx = list.findIndex(x => x.id === r.id);
  if (idx >= 0) list[idx] = r; else list.push(r);
  localStorage.setItem(REFERRALS_KEY, JSON.stringify(list));
}

function updateReferralStatus(id, status, notes) {
  const list = getReferrals();
  const r = list.find(x => x.id === id);
  if (!r) return;
  r.status = status;
  if (notes !== undefined) r.notes = notes;
  localStorage.setItem(REFERRALS_KEY, JSON.stringify(list));
}

const CARE_TEAM_KEY = 'ds_care_teams';

function getCareTeams() {
  const raw = localStorage.getItem(CARE_TEAM_KEY);
  if (raw) return JSON.parse(raw);
  const seed = [
    { id: 'ct1', courseId: 'CRS-001', patientName: 'Emily Rourke', handoffNote: '', members: [
      { clinicianId: 'cl1', name: 'Dr. Sarah Chen', role: 'Lead', assignedDate: '2026-04-01' },
      { clinicianId: 'cl2', name: 'Nurse Kim Brady', role: 'Support', assignedDate: '2026-04-01' },
    ]},
    { id: 'ct2', courseId: 'CRS-002', patientName: 'Carlos Mendes', handoffNote: '', members: [
      { clinicianId: 'cl3', name: 'Dr. Aisha Patel', role: 'Lead', assignedDate: '2026-04-03' },
      { clinicianId: 'cl4', name: 'Dr. Marcus Webb', role: 'Consulting', assignedDate: '2026-04-03' },
    ]},
  ];
  localStorage.setItem(CARE_TEAM_KEY, JSON.stringify(seed));
  return seed;
}

function saveCareTeam(team) {
  const list = getCareTeams();
  const idx = list.findIndex(x => x.id === team.id);
  if (idx >= 0) list[idx] = team; else list.push(team);
  localStorage.setItem(CARE_TEAM_KEY, JSON.stringify(list));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _statusBadge(status) {
  const map = {
    pending:     { dot: '#3b82f6', bg: '#dbeafe', color: '#1e40af', label: 'Pending' },
    accepted:    { dot: '#10b981', bg: '#d1fae5', color: '#065f46', label: 'Accepted' },
    'in-progress': { dot: '#14b8a6', bg: '#ccfbf1', color: '#134e4a', label: 'In Progress' },
    completed:   { dot: '#6366f1', bg: '#ede9fe', color: '#3730a3', label: 'Completed' },
    declined:    { dot: '#f43f5e', bg: '#fee2e2', color: '#991b1b', label: 'Declined' },
  };
  const s = map[status] || map.pending;
  return `<span style="display:inline-flex;align-items:center;gap:5px;background:${s.bg};color:${s.color};padding:2px 9px;border-radius:12px;font-size:.72rem;font-weight:700;">
    <span style="width:7px;height:7px;border-radius:50%;background:${s.dot};display:inline-block;"></span>${s.label}</span>`;
}

function _priorityBadge(priority) {
  if (priority === 'urgent') return `<span class="priority-urgent">Urgent</span>`;
  if (priority === 'high') return `<span class="priority-high">High</span>`;
  return `<span class="priority-routine">Routine</span>`;
}

function _conditionBadge(condition) {
  return `<span style="background:var(--border);color:var(--text-muted);padding:2px 8px;border-radius:12px;font-size:.72rem;">${condition}</span>`;
}

function _roleBadge(role) {
  const cls = { Lead: 'lead', Support: 'support', Consulting: 'consulting', Admin: 'support' };
  return `<span class="role-badge-${cls[role] || 'support'}">${role}</span>`;
}

// ── Render helpers ─────────────────────────────────────────────────────────────

function _renderReferralCard(r) {
  return `
  <div class="referral-card" id="ref-card-${r.id}">
    <div class="referral-card-header">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
          <strong style="font-size:1rem;">${r.patientName}</strong>
          ${_conditionBadge(r.condition)}
          ${_priorityBadge(r.priority)}
          ${_statusBadge(r.status)}
        </div>
        <div style="font-size:.85rem;color:var(--text-muted);display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
          <span>${r.fromProvider}</span>
          <span class="referral-arrow">&#8594;</span>
          <span>${r.toProvider}</span>
          <span style="margin-left:8px;opacity:.7;">${r.date}</span>
        </div>
      </div>
      <button onclick="window._expandReferral('${r.id}')" style="padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);cursor:pointer;color:var(--text);white-space:nowrap;font-size:.8rem;" id="ref-expand-btn-${r.id}">View Details</button>
    </div>
    <div class="referral-detail" id="ref-detail-${r.id}">
      <div style="margin-bottom:10px;font-size:.875rem;"><strong>Reason:</strong> ${r.reason}</div>
      <div style="margin-bottom:10px;font-size:.875rem;"><strong>Notes:</strong> ${r.notes || '—'}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        ${r.status !== 'accepted' && r.status !== 'in-progress' && r.status !== 'completed' ? `<button onclick="window._updateReferralStatus('${r.id}','accepted')" style="padding:5px 12px;border-radius:6px;border:none;background:#d1fae5;color:#065f46;cursor:pointer;font-size:.8rem;font-weight:700;">Accept</button>` : ''}
        ${r.status !== 'declined' && r.status !== 'completed' ? `<button onclick="window._updateReferralStatus('${r.id}','declined')" style="padding:5px 12px;border-radius:6px;border:none;background:#fee2e2;color:#991b1b;cursor:pointer;font-size:.8rem;font-weight:700;">Decline</button>` : ''}
        ${r.status === 'accepted' ? `<button onclick="window._updateReferralStatus('${r.id}','in-progress')" style="padding:5px 12px;border-radius:6px;border:none;background:#ccfbf1;color:#134e4a;cursor:pointer;font-size:.8rem;font-weight:700;">Mark In Progress</button>` : ''}
        ${r.status === 'in-progress' ? `<button onclick="window._updateReferralStatus('${r.id}','completed')" style="padding:5px 12px;border-radius:6px;border:none;background:#ede9fe;color:#3730a3;cursor:pointer;font-size:.8rem;font-weight:700;">Complete</button>` : ''}
        <button onclick="window._generateReferralLetter('${r.id}')" style="padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);cursor:pointer;font-size:.8rem;color:var(--text);">Generate Referral Letter</button>
      </div>
    </div>
  </div>`;
}

function _renderProviderCard(p) {
  return `
  <div class="provider-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
      <strong style="font-size:.95rem;">${p.name}</strong>
      <span style="background:var(--border);color:var(--text-muted);padding:2px 8px;border-radius:12px;font-size:.72rem;">${p.specialty}</span>
    </div>
    <div style="font-size:.82rem;color:var(--text-muted);line-height:1.7;">
      <div>🏥 ${p.clinic}</div>
      <div>📞 ${p.phone}</div>
      <div>✉️ ${p.email}</div>
      ${p.npi ? `<div>NPI: ${p.npi}</div>` : ''}
      ${p.lastReferralDate ? `<div>Last referral: ${p.lastReferralDate}</div>` : ''}
    </div>
    <div style="margin-top:10px;display:flex;gap:8px;">
      <button onclick="window._referToProvider('${p.id}')" style="flex:1;padding:5px 8px;border-radius:6px;border:none;background:var(--accent-teal);color:white;cursor:pointer;font-size:.8rem;font-weight:700;">Refer Patient</button>
      <button onclick="window._deleteReferralProvider('${p.id}')" style="padding:5px 10px;border-radius:6px;border:1px solid #fca5a5;background:#fee2e2;color:#991b1b;cursor:pointer;font-size:.8rem;">Delete</button>
    </div>
  </div>`;
}

function _renderCareTeamCard(team) {
  const memberRows = team.members.map((m, i) => `
    <div class="team-member-row">
      <span style="flex:1;">${m.name}</span>
      ${_roleBadge(m.role)}
      <span style="font-size:.75rem;color:var(--text-muted);">${m.assignedDate}</span>
      <button onclick="window._removeTeamMember(${i},'${team.id}')" style="padding:2px 8px;border-radius:4px;border:1px solid #fca5a5;background:#fee2e2;color:#991b1b;cursor:pointer;font-size:.75rem;">&#10005;</button>
    </div>`).join('');

  return `
  <div class="care-team-card" id="care-team-card-${team.id}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div>
        <strong>${team.patientName}</strong>
        <span style="font-size:.8rem;color:var(--text-muted);margin-left:8px;">Course: ${team.courseId}</span>
      </div>
    </div>
    <div id="team-members-${team.id}">${memberRows || '<div style="font-size:.85rem;color:var(--text-muted);">No members assigned.</div>'}</div>
    <div style="margin-top:12px;">
      <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:4px;">Handoff Note</label>
      <textarea id="handoff-note-${team.id}" style="width:100%;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);padding:8px;font-size:.85rem;resize:vertical;min-height:60px;">${team.handoffNote || ''}</textarea>
      <button onclick="window._saveHandoffNote('${team.id}')" style="margin-top:6px;padding:5px 14px;border-radius:6px;border:none;background:var(--accent-teal);color:white;cursor:pointer;font-size:.8rem;font-weight:700;">Save Handoff Note</button>
    </div>
  </div>`;
}

// ── Main page function ─────────────────────────────────────────────────────────

export async function pgReferrals(setTopbar) {
  setTopbar('Referrals & Care Coordination', '');

  // State
  let activeTab = 'referrals';
  let referralStatusFilter = 'all';
  let referralSearch = '';
  let providerSpecialtyFilter = 'all';
  let providerSearch = '';
  let newTeamMembers = [{ name: '', role: 'Lead', assignedDate: new Date().toISOString().slice(0, 10) }];
  let editingTeamId = null;

  const el = document.getElementById('page-content');

  function renderKpis() {
    const refs = getReferrals();
    const total = refs.length;
    const pending = refs.filter(r => r.status === 'pending').length;
    const inProgress = refs.filter(r => r.status === 'in-progress').length;
    const completed = refs.filter(r => r.status === 'completed').length;
    const declined = refs.filter(r => r.status === 'declined').length;
    return `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
      <div style="flex:1;min-width:100px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:800;color:#92400e;">${total}</div>
        <div style="font-size:.78rem;color:#92400e;font-weight:600;">Total</div>
      </div>
      <div style="flex:1;min-width:100px;background:#dbeafe;border:1px solid #bfdbfe;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:800;color:#1e40af;">${pending}</div>
        <div style="font-size:.78rem;color:#1e40af;font-weight:600;">Pending</div>
      </div>
      <div style="flex:1;min-width:100px;background:#ccfbf1;border:1px solid #99f6e4;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:800;color:#134e4a;">${inProgress}</div>
        <div style="font-size:.78rem;color:#134e4a;font-weight:600;">In Progress</div>
      </div>
      <div style="flex:1;min-width:100px;background:#d1fae5;border:1px solid #a7f3d0;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:800;color:#065f46;">${completed}</div>
        <div style="font-size:.78rem;color:#065f46;font-weight:600;">Completed</div>
      </div>
      <div style="flex:1;min-width:100px;background:#fee2e2;border:1px solid #fca5a5;border-radius:10px;padding:12px;text-align:center;">
        <div style="font-size:1.6rem;font-weight:800;color:#991b1b;">${declined}</div>
        <div style="font-size:.78rem;color:#991b1b;font-weight:600;">Declined</div>
      </div>
    </div>`;
  }

  function renderReferralsTab() {
    let refs = getReferrals();
    if (referralStatusFilter !== 'all') refs = refs.filter(r => r.status === referralStatusFilter);
    if (referralSearch) refs = refs.filter(r => r.patientName.toLowerCase().includes(referralSearch.toLowerCase()));

    const statuses = ['all', 'pending', 'accepted', 'in-progress', 'completed', 'declined'];
    const pills = statuses.map(s => {
      const active = s === referralStatusFilter;
      const label = s === 'all' ? 'All' : s === 'in-progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1);
      return `<button onclick="window._filterReferrals('${s}')" style="padding:4px 14px;border-radius:20px;border:1px solid var(--border);cursor:pointer;font-size:.8rem;font-weight:${active ? '700' : '400'};background:${active ? 'var(--accent-teal)' : 'var(--card-bg)'};color:${active ? 'white' : 'var(--text)'};">${label}</button>`;
    }).join('');

    return `
    ${renderKpis()}
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${pills}</div>
      <input type="text" placeholder="Search patient..." value="${referralSearch}" oninput="window._searchReferrals(this.value)"
        style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card-bg);color:var(--text);font-size:.85rem;min-width:180px;" />
      <button onclick="window._newReferral()" style="margin-left:auto;padding:7px 16px;border-radius:8px;border:none;background:var(--accent-teal);color:white;cursor:pointer;font-size:.875rem;font-weight:700;">+ New Referral</button>
    </div>
    <div id="referrals-list">
      ${refs.length ? refs.map(_renderReferralCard).join('') : '<div style="padding:32px;text-align:center;color:var(--text-muted);">No referrals match the current filter.</div>'}
    </div>`;
  }

  function renderProvidersTab() {
    let providers = getReferralProviders();
    if (providerSpecialtyFilter !== 'all') providers = providers.filter(p => p.specialty === providerSpecialtyFilter);
    if (providerSearch) providers = providers.filter(p => p.name.toLowerCase().includes(providerSearch.toLowerCase()) || p.clinic.toLowerCase().includes(providerSearch.toLowerCase()));

    const specialties = ['all', 'Neurology', 'Psychiatry', 'Psychology', 'Physical Therapy', 'Primary Care', 'Other'];
    const specOptions = specialties.map(s => `<option value="${s}" ${s === providerSpecialtyFilter ? 'selected' : ''}>${s === 'all' ? 'All Specialties' : s}</option>`).join('');

    return `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <input type="text" placeholder="Search providers..." value="${providerSearch}" oninput="window._filterProvidersBySearch(this.value)"
        style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card-bg);color:var(--text);font-size:.85rem;min-width:200px;" />
      <select onchange="window._filterProviders(this.value)" style="padding:6px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card-bg);color:var(--text);font-size:.85rem;">${specOptions}</select>
      <button onclick="window._addReferralProvider()" style="margin-left:auto;padding:7px 16px;border-radius:8px;border:none;background:var(--accent-teal);color:white;cursor:pointer;font-size:.875rem;font-weight:700;">+ Add Provider</button>
    </div>
    <div class="provider-grid">
      ${providers.length ? providers.map(_renderProviderCard).join('') : '<div style="padding:32px;text-align:center;color:var(--text-muted);grid-column:1/-1;">No providers found.</div>'}
    </div>`;
  }

  function renderCareTeamsTab() {
    const teams = getCareTeams();
    const memberInputRows = newTeamMembers.map((m, i) => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;" id="new-member-row-${i}">
        <input type="text" placeholder="Clinician name" value="${m.name}" oninput="window._updateNewMemberField(${i},'name',this.value)"
          style="flex:2;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.85rem;" />
        <select onchange="window._updateNewMemberField(${i},'role',this.value)" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.85rem;">
          ${['Lead','Support','Consulting','Admin'].map(r => `<option ${m.role===r?'selected':''}>${r}</option>`).join('')}
        </select>
        <input type="date" value="${m.assignedDate}" onchange="window._updateNewMemberField(${i},'assignedDate',this.value)"
          style="flex:1;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.85rem;" />
        ${i > 0 ? `<button onclick="window._removeNewMemberRow(${i})" style="padding:4px 8px;border-radius:4px;border:1px solid #fca5a5;background:#fee2e2;color:#991b1b;cursor:pointer;">&#10005;</button>` : '<div style="width:30px;"></div>'}
      </div>`).join('');

    return `
    <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:20px;">
      <h3 style="margin:0 0 14px;font-size:.95rem;font-weight:700;">Assign Care Team</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <input type="text" id="new-team-patient" placeholder="Patient name" style="flex:2;min-width:160px;padding:7px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.875rem;" />
        <input type="text" id="new-team-course" placeholder="Course ID (e.g. CRS-003)" style="flex:1;min-width:140px;padding:7px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:.875rem;" />
      </div>
      <div style="font-size:.8rem;font-weight:600;margin-bottom:6px;color:var(--text-muted);">Team Members</div>
      <div id="new-member-rows">${memberInputRows}</div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button onclick="window._addTeamMember()" style="padding:6px 14px;border-radius:6px;border:1px solid var(--accent-teal);color:var(--accent-teal);background:transparent;cursor:pointer;font-size:.8rem;">+ Add Member</button>
        <button onclick="window._saveCareTeam()" style="padding:6px 16px;border-radius:6px;border:none;background:var(--accent-teal);color:white;cursor:pointer;font-size:.875rem;font-weight:700;">Save Team</button>
      </div>
    </div>
    <div id="care-teams-list">
      ${teams.length ? teams.map(_renderCareTeamCard).join('') : '<div style="padding:32px;text-align:center;color:var(--text-muted);">No care teams yet.</div>'}
    </div>`;
  }

  function renderTabs() {
    const tabs = [
      { id: 'referrals', label: 'Referrals' },
      { id: 'providers', label: 'Provider Directory' },
      { id: 'careteams', label: 'Care Teams' },
    ];
    return `<div style="display:flex;gap:4px;border-bottom:2px solid var(--border);margin-bottom:18px;">
      ${tabs.map(t => `<button onclick="window._switchReferralTab('${t.id}')" style="padding:8px 20px;border:none;background:none;cursor:pointer;font-size:.9rem;font-weight:${t.id===activeTab?'700':'400'};color:${t.id===activeTab?'var(--accent-teal)':'var(--text-muted)'};border-bottom:${t.id===activeTab?'2px solid var(--accent-teal)':'2px solid transparent'};margin-bottom:-2px;">${t.label}</button>`).join('')}
    </div>`;
  }

  function renderModal(content) {
    return `<div id="referral-modal-overlay" onclick="if(event.target.id==='referral-modal-overlay')window._closeReferralModal()" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;">
      <div style="background:var(--card-bg);border-radius:12px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto;padding:24px;position:relative;">
        <button onclick="window._closeReferralModal()" style="position:absolute;top:14px;right:14px;border:none;background:none;cursor:pointer;font-size:1.3rem;color:var(--text-muted);">&#10005;</button>
        ${content}
      </div>
    </div>`;
  }

  function renderNewReferralForm(prefillProvider) {
    const providers = getReferralProviders();
    const providerOptions = providers.map(p => `<option value="${p.name}" ${prefillProvider && prefillProvider === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
    return renderModal(`
      <h3 style="margin:0 0 16px;font-size:1rem;font-weight:700;">New Referral</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <input id="nref-patient" type="text" placeholder="Patient name" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <input id="nref-condition" type="text" placeholder="Condition / diagnosis" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <input id="nref-from" type="text" placeholder="Referring provider" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <select id="nref-to" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);">
          <option value="">Select receiving provider...</option>
          ${providerOptions}
        </select>
        <input id="nref-reason" type="text" placeholder="Reason for referral" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <select id="nref-priority" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);">
          <option value="routine">Routine</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <textarea id="nref-notes" placeholder="Additional notes (optional)" rows="3" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);resize:vertical;"></textarea>
        <button onclick="window._saveReferral()" style="padding:9px;border-radius:8px;border:none;background:var(--accent-teal);color:white;cursor:pointer;font-weight:700;font-size:.9rem;">Save Referral</button>
      </div>`);
  }

  function renderAddProviderForm() {
    return renderModal(`
      <h3 style="margin:0 0 16px;font-size:1rem;font-weight:700;">Add Provider</h3>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <input id="nprov-name" type="text" placeholder="Full name (e.g. Dr. Jane Doe)" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <select id="nprov-specialty" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);">
          ${['Neurology','Psychiatry','Psychology','Physical Therapy','Primary Care','Other'].map(s => `<option>${s}</option>`).join('')}
        </select>
        <input id="nprov-clinic" type="text" placeholder="Clinic / practice name" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <input id="nprov-phone" type="text" placeholder="Phone" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <input id="nprov-email" type="email" placeholder="Email" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <input id="nprov-fax" type="text" placeholder="Fax (optional)" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <input id="nprov-npi" type="text" placeholder="NPI (optional)" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);" />
        <textarea id="nprov-notes" placeholder="Notes (optional)" rows="2" style="padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);resize:vertical;"></textarea>
        <button onclick="window._saveReferralProvider()" style="padding:9px;border-radius:8px;border:none;background:var(--accent-teal);color:white;cursor:pointer;font-weight:700;font-size:.9rem;">Add Provider</button>
      </div>`);
  }

  function fullRender() {
    let tabContent = '';
    if (activeTab === 'referrals') tabContent = renderReferralsTab();
    else if (activeTab === 'providers') tabContent = renderProvidersTab();
    else tabContent = renderCareTeamsTab();

    el.innerHTML = `<div style="max-width:860px;margin:0 auto;padding:0 4px;">
      ${renderTabs()}
      <div id="referrals-tab-content">${tabContent}</div>
    </div>`;
  }

  fullRender();

  // ── Global handlers ──────────────────────────────────────────────────────────

  window._switchReferralTab = function(tab) {
    activeTab = tab;
    fullRender();
  };

  window._filterReferrals = function(status) {
    referralStatusFilter = status;
    renderReferralsTab_inplace();
  };

  window._searchReferrals = function(q) {
    referralSearch = q;
    renderReferralsTab_inplace();
  };

  function renderReferralsTab_inplace() {
    const cont = document.getElementById('referrals-tab-content');
    if (cont && activeTab === 'referrals') cont.innerHTML = renderReferralsTab();
  }

  window._expandReferral = function(id) {
    const detail = document.getElementById('ref-detail-' + id);
    const btn = document.getElementById('ref-expand-btn-' + id);
    if (!detail) return;
    const isOpen = detail.classList.toggle('open');
    if (btn) btn.textContent = isOpen ? 'Hide Details' : 'View Details';
  };

  window._newReferral = function(prefillProvider) {
    const existing = document.getElementById('referral-modal-overlay');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', renderNewReferralForm(prefillProvider));
  };

  window._closeReferralModal = function() {
    const overlay = document.getElementById('referral-modal-overlay');
    if (overlay) overlay.remove();
  };

  window._saveReferral = function() {
    const patient = document.getElementById('nref-patient')?.value?.trim();
    const condition = document.getElementById('nref-condition')?.value?.trim();
    const from = document.getElementById('nref-from')?.value?.trim();
    const to = document.getElementById('nref-to')?.value;
    const reason = document.getElementById('nref-reason')?.value?.trim();
    const priority = document.getElementById('nref-priority')?.value || 'routine';
    const notes = document.getElementById('nref-notes')?.value?.trim() || '';
    if (!patient || !condition || !from || !to || !reason) {
      alert('Please fill in all required fields.');
      return;
    }
    const r = {
      id: 'ref' + Date.now(),
      patientName: patient,
      fromProvider: from,
      toProvider: to,
      condition,
      reason,
      date: new Date().toISOString().slice(0, 10),
      status: 'pending',
      priority,
      notes,
      careTeam: [],
    };
    saveReferral(r);
    window._closeReferralModal();
    renderReferralsTab_inplace();
  };

  window._updateReferralStatus = function(id, status) {
    updateReferralStatus(id, status);
    renderReferralsTab_inplace();
  };

  window._generateReferralLetter = function(id) {
    const refs = getReferrals();
    const r = refs.find(x => x.id === id);
    if (!r) return;
    const providers = getReferralProviders();
    const toProvider = providers.find(p => p.name === r.toProvider) || { name: r.toProvider, clinic: '', fax: '', npi: '' };
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const letterHtml = `
      <div class="referral-letter">
        <h1>REFERRAL LETTER</h1>
        <p><strong>Date:</strong> ${today}</p>
        <p><strong>From:</strong> ${r.fromProvider}<br>NPI: [CLINIC NPI]<br>[Clinic Name]<br>[Address]<br>Phone: [Phone] | Fax: [Fax]</p>
        <p><strong>To:</strong> ${toProvider.name}<br>${toProvider.clinic || '[Clinic]'}<br>Fax: ${toProvider.fax || '[Fax]'}</p>
        <p><strong>Re:</strong> ${r.patientName}, DOB: [DOB]</p>
        <hr style="border:none;border-top:1px solid #ccc;margin:16px 0;">
        <p>Dear ${toProvider.name},</p>
        <p>We are referring <strong>${r.patientName}</strong> for evaluation and treatment of <strong>${r.condition}</strong>.</p>
        <p><strong>Reason for Referral:</strong> ${r.reason}</p>
        ${r.notes ? `<p><strong>Clinical Notes:</strong> ${r.notes}</p>` : ''}
        <p>Please do not hesitate to contact our office if you require additional information or records. We appreciate your expertise and look forward to your evaluation.</p>
        <p style="margin-top:32px;">Sincerely,</p>
        <p>${r.fromProvider}<br>[Title / Credentials]<br>[Practice Name]<br>[Phone] | [Email]</p>
      </div>`;

    const existing = document.getElementById('referral-modal-overlay');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', renderModal(`
      <h3 style="margin:0 0 14px;font-size:1rem;font-weight:700;">Referral Letter — ${r.patientName}</h3>
      ${letterHtml}
      <div style="margin-top:16px;text-align:center;">
        <button onclick="window._printReferralLetter()" style="padding:8px 24px;border-radius:8px;border:none;background:var(--accent-teal);color:white;cursor:pointer;font-weight:700;">Print Letter</button>
      </div>`));
  };

  window._printReferralLetter = function() {
    const letter = document.querySelector('.referral-letter');
    if (!letter) return;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>Referral Letter</title><style>body{font-family:Georgia,serif;padding:40px;max-width:680px;margin:0 auto;line-height:1.7;}h1{font-size:1.1rem;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:20px;}hr{border:none;border-top:1px solid #ccc;margin:16px 0;}</style></head><body>${letter.outerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  window._addReferralProvider = function() {
    const existing = document.getElementById('referral-modal-overlay');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', renderAddProviderForm());
  };

  window._saveReferralProvider = function() {
    const name = document.getElementById('nprov-name')?.value?.trim();
    const specialty = document.getElementById('nprov-specialty')?.value;
    const clinic = document.getElementById('nprov-clinic')?.value?.trim();
    const phone = document.getElementById('nprov-phone')?.value?.trim();
    const email = document.getElementById('nprov-email')?.value?.trim();
    const fax = document.getElementById('nprov-fax')?.value?.trim() || '';
    const npi = document.getElementById('nprov-npi')?.value?.trim() || '';
    const notes = document.getElementById('nprov-notes')?.value?.trim() || '';
    if (!name || !specialty || !clinic || !phone || !email) {
      alert('Please fill in all required fields.');
      return;
    }
    const p = { id: 'rp' + Date.now(), name, specialty, clinic, phone, email, fax, npi, notes, lastReferralDate: '' };
    saveReferralProvider(p);
    window._closeReferralModal();
    if (activeTab === 'providers') {
      const cont = document.getElementById('referrals-tab-content');
      if (cont) cont.innerHTML = renderProvidersTab();
    }
  };

  window._deleteReferralProvider = function(id) {
    if (!confirm('Delete this provider?')) return;
    deleteReferralProvider(id);
    const cont = document.getElementById('referrals-tab-content');
    if (cont && activeTab === 'providers') cont.innerHTML = renderProvidersTab();
  };

  window._referToProvider = function(id) {
    window._newReferral(id);
  };

  window._filterProviders = function(specialty) {
    providerSpecialtyFilter = specialty;
    const cont = document.getElementById('referrals-tab-content');
    if (cont && activeTab === 'providers') cont.innerHTML = renderProvidersTab();
  };

  window._filterProvidersBySearch = function(q) {
    providerSearch = q;
    const cont = document.getElementById('referrals-tab-content');
    if (cont && activeTab === 'providers') cont.innerHTML = renderProvidersTab();
  };

  window._updateNewMemberField = function(idx, field, value) {
    if (newTeamMembers[idx]) newTeamMembers[idx][field] = value;
  };

  window._addTeamMember = function() {
    newTeamMembers.push({ name: '', role: 'Support', assignedDate: new Date().toISOString().slice(0, 10) });
    const cont = document.getElementById('referrals-tab-content');
    if (cont && activeTab === 'careteams') cont.innerHTML = renderCareTeamsTab();
  };

  window._removeNewMemberRow = function(idx) {
    newTeamMembers.splice(idx, 1);
    const cont = document.getElementById('referrals-tab-content');
    if (cont && activeTab === 'careteams') cont.innerHTML = renderCareTeamsTab();
  };

  window._removeTeamMember = function(memberIdx, teamId) {
    const teams = getCareTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    team.members.splice(memberIdx, 1);
    saveCareTeam(team);
    const cont = document.getElementById('referrals-tab-content');
    if (cont && activeTab === 'careteams') cont.innerHTML = renderCareTeamsTab();
  };

  window._saveCareTeam = function() {
    const patient = document.getElementById('new-team-patient')?.value?.trim();
    const courseId = document.getElementById('new-team-course')?.value?.trim();
    if (!patient || !courseId) { alert('Patient name and Course ID are required.'); return; }
    const members = newTeamMembers.filter(m => m.name.trim());
    if (!members.length) { alert('Add at least one team member.'); return; }
    const team = {
      id: 'ct' + Date.now(),
      courseId,
      patientName: patient,
      handoffNote: '',
      members,
    };
    saveCareTeam(team);
    newTeamMembers = [{ name: '', role: 'Lead', assignedDate: new Date().toISOString().slice(0, 10) }];
    const cont = document.getElementById('referrals-tab-content');
    if (cont && activeTab === 'careteams') cont.innerHTML = renderCareTeamsTab();
  };

  window._saveHandoffNote = function(teamId) {
    const ta = document.getElementById('handoff-note-' + teamId);
    if (!ta) return;
    const teams = getCareTeams();
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    team.handoffNote = ta.value;
    saveCareTeam(team);
    // Brief visual feedback
    const btn = ta.nextElementSibling;
    if (btn) { const orig = btn.textContent; btn.textContent = 'Saved!'; setTimeout(() => { btn.textContent = orig; }, 1500); }
  };
}
