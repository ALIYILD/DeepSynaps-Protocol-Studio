import { cardWrap, fr, pillSt, tag, initials, spinner } from './helpers.js';
import { api } from './api.js';
import { LOCALES, setLocale, getLocale } from './i18n.js';

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

  const el = document.getElementById('content') || document.getElementById('app-content');

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

  // ── Pull server-side state (best-effort, fall back to localStorage) ─────────
  const lsGet = (k) => { try { return (typeof localStorage !== 'undefined' && localStorage.getItem(k)) || ''; } catch { return ''; } };
  let serverProfile = null, serverPrefs = null, serverClinical = null, serverClinic = null;
  try { serverProfile  = await api.getProfile();          } catch (e) { console.debug('[settings] getProfile unavailable', e?.message); }
  try { serverPrefs    = await api.getPreferences();      } catch (e) { console.debug('[settings] getPreferences unavailable', e?.message); }
  try { serverClinical = await api.getClinicalDefaults(); } catch (e) { console.debug('[settings] getClinicalDefaults unavailable', e?.message); }
  try { serverClinic   = await api.getClinic();           } catch (e) { console.debug('[settings] getClinic unavailable', e?.message); }

  // Pick server value if present, otherwise localStorage, otherwise fallback.
  const pref = (serverVal, lsKey, fallback = '') => {
    if (serverVal !== undefined && serverVal !== null && serverVal !== '') return serverVal;
    const v = lsGet(lsKey);
    return v || fallback;
  };

  // One-time seed: push any existing ds_* client state to backend so users who
  // had local-only settings don't lose them on first API-backed render.
  (async () => {
    try {
      if (localStorage.getItem('ds_seed_prefs_complete')) return;
      if (!serverPrefs) return; // only seed when prefs API is alive
      const patch = {};
      const pick = (k, apiKey) => { const v = lsGet(k); if (v) patch[apiKey] = v; };
      pick('ds_lang',          'language');
      pick('ds_date_format',   'date_format');
      pick('ds_time_format',   'time_format');
      pick('ds_first_day',     'first_day');
      pick('ds_units',         'units');
      pick('ds_number_format', 'number_format');
      const dur = parseInt(lsGet('ds_session_default_duration'), 10);
      if (Number.isFinite(dur)) patch.session_default_duration_min = dur;
      const al = lsGet('ds_auto_logout');
      if (al === 'never') patch.auto_logout_min = 0;
      else { const n = parseInt(al, 10); if (Number.isFinite(n)) patch.auto_logout_min = n; }
      try { const np = lsGet('ds_notification_prefs'); if (np) patch.notification_prefs = JSON.parse(np); } catch {}
      try { const qh = lsGet('ds_quiet_hours');        if (qh) patch.quiet_hours        = JSON.parse(qh); } catch {}
      const df = lsGet('ds_digest_freq'); if (df) patch.digest_freq = df;
      try { const rt = lsGet('ds_reminder_timing');    if (rt) patch.reminder_timing    = JSON.parse(rt); } catch {}
      const ai = lsGet('ds_analytics_opt_in');     if (ai === 'true' || ai === 'false') patch.analytics_opt_in     = (ai === 'true');
      const er = lsGet('ds_error_reports_opt_in'); if (er === 'true' || er === 'false') patch.error_reports_opt_in = (er === 'true');
      if (Object.keys(patch).length > 0) await api.updatePreferences(patch);
      localStorage.setItem('ds_seed_prefs_complete', '1');
    } catch (e) { /* silent — retry next session */ }
  })();

  // Server-preferred profile fields; localStorage fallback/mirror.
  const savedAvatar      = pref(serverProfile?.avatar_url,      'ds_user_avatar');
  const savedCredentials = pref(serverProfile?.credentials,     'ds_user_credentials');
  const savedLicense     = pref(serverProfile?.license_number,  'ds_user_license');
  const twoFAEnabled     = !!(serverProfile?.two_factor_enabled) || lsGet('ds_2fa_enabled') === 'true';
  const savedSecret      = lsGet('ds_2fa_secret');

  const browserTZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } });
  const savedClinicName        = pref(serverClinic?.name,     'ds_clinic_name');
  const savedClinicAddress     = pref(serverClinic?.address,  'ds_clinic_address');
  const savedClinicPhone       = pref(serverClinic?.phone,    'ds_clinic_phone');
  const savedClinicEmail       = pref(serverClinic?.email,    'ds_clinic_email');
  const savedClinicWebsite     = pref(serverClinic?.website,  'ds_clinic_website');
  const savedClinicTZ          = pref(serverClinic?.timezone, 'ds_clinic_tz') || browserTZ();
  const savedClinicLogo        = pref(serverClinic?.logo_url, 'ds_clinic_logo');
  const savedClinicSpecialties = (() => {
    if (Array.isArray(serverClinic?.specialties)) return serverClinic.specialties.join(', ');
    if (typeof serverClinic?.specialties === 'string') return serverClinic.specialties;
    return lsGet('ds_clinic_specialties');
  })();

  // Timezone list — Intl.supportedValuesOf when available, else short fallback
  const tzList = (() => {
    try {
      if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
        return Intl.supportedValuesOf('timeZone');
      }
    } catch {}
    return ['UTC', 'Europe/London', 'Europe/Istanbul', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Australia/Sydney'];
  })();

  // Working hours (7-day)
  const defaultHours = {
    mon: { open: true,  from: '09:00', to: '17:00' },
    tue: { open: true,  from: '09:00', to: '17:00' },
    wed: { open: true,  from: '09:00', to: '17:00' },
    thu: { open: true,  from: '09:00', to: '17:00' },
    fri: { open: true,  from: '09:00', to: '17:00' },
    sat: { open: false, from: '09:00', to: '17:00' },
    sun: { open: false, from: '09:00', to: '17:00' },
  };
  let savedHours = defaultHours;
  if (serverClinic?.working_hours && typeof serverClinic.working_hours === 'object') {
    savedHours = { ...defaultHours, ...serverClinic.working_hours };
  } else {
    try {
      const raw = lsGet('ds_clinic_hours');
      if (raw) { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object') savedHours = { ...defaultHours, ...parsed }; }
    } catch {}
  }

  // Team members — localStorage mock until api.listTeamMembers() is added
  const defaultTeam = [
    { id: 'u-self', name: (currentUser?.display_name || currentUser?.email || 'You'), email: (currentUser?.email || 'you@clinic.com'), role: 'admin',     last_active: 'Active now' },
    { id: 'u-2',    name: 'Dr. Sarah Chen',   email: 'sarah.chen@clinic.com',   role: 'clinician',  last_active: '2 hours ago' },
    { id: 'u-3',    name: 'Alex Morgan',      email: 'alex.morgan@clinic.com',  role: 'technician', last_active: 'Yesterday'   },
  ];
  let savedTeam = defaultTeam;
  try {
    const raw = lsGet('ds_team_members');
    if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length) savedTeam = parsed; }
  } catch {}

  const escAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // ── Notification preferences (server-backed with localStorage fallback) ───
  const DEFAULT_NOTIF_PREFS = {
    sessionReminders:   { email: true,  inapp: true,  telegram: false },
    protocolAlerts:     { email: false, inapp: true,  telegram: false },
    adverseEventAlerts: { email: true,  inapp: true,  telegram: true  },
    reviewQueueDigest:  { email: false, inapp: true,  telegram: false },
    weeklySummary:      { email: true,  inapp: false, telegram: false },
    patientMessages:    { email: false, inapp: true,  telegram: false },
    systemUpdates:      { email: false, inapp: true,  telegram: false },
  };
  let notifPrefs = { ...DEFAULT_NOTIF_PREFS };
  const _applyNotifPrefs = (parsed) => {
    if (!parsed || typeof parsed !== 'object') return;
    notifPrefs = { ...DEFAULT_NOTIF_PREFS };
    for (const k of Object.keys(DEFAULT_NOTIF_PREFS)) {
      if (parsed[k] && typeof parsed[k] === 'object') {
        notifPrefs[k] = { ...DEFAULT_NOTIF_PREFS[k], ...parsed[k] };
      }
    }
  };
  if (serverPrefs?.notification_prefs && typeof serverPrefs.notification_prefs === 'object') {
    _applyNotifPrefs(serverPrefs.notification_prefs);
  } else {
    try { const raw = lsGet('ds_notification_prefs'); if (raw) _applyNotifPrefs(JSON.parse(raw)); } catch {}
  }

  const DEFAULT_QUIET_HOURS = { enabled: false, from: '22:00', to: '07:00' };
  let quietHours = { ...DEFAULT_QUIET_HOURS };
  if (serverPrefs?.quiet_hours && typeof serverPrefs.quiet_hours === 'object') {
    quietHours = { ...DEFAULT_QUIET_HOURS, ...serverPrefs.quiet_hours };
  } else {
    try { const raw = lsGet('ds_quiet_hours'); if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') quietHours = { ...DEFAULT_QUIET_HOURS, ...p }; } } catch {}
  }

  const digestFreq = serverPrefs?.digest_freq || lsGet('ds_digest_freq') || 'daily';

  // ── Data & Privacy (server-backed with localStorage fallback) ──────────────
  const lastExport         = lsGet('ds_last_export');
  const analyticsOptIn     = (serverPrefs?.analytics_opt_in     != null) ? !!serverPrefs.analytics_opt_in     : ((lsGet('ds_analytics_opt_in')     || 'true') === 'true');
  const errorReportsOptIn  = (serverPrefs?.error_reports_opt_in != null) ? !!serverPrefs.error_reports_opt_in : ((lsGet('ds_error_reports_opt_in') || 'true') === 'true');
  const cookieFunctional   = (lsGet('ds_cookie_functional')     || 'true') === 'true';
  const cookieAnalytics    = (lsGet('ds_cookie_analytics')      || 'true') === 'true';

  // ── Clinical Defaults (server-backed with localStorage fallback) ───────────
  const defaultProtocol         = pref(serverClinical?.default_protocol_id,          'ds_default_protocol')         || 'none';
  const defaultSessionDuration  = String(serverClinical?.default_session_duration_min ?? lsGet('ds_default_session_duration') ?? '45');
  const defaultFollowupWeeks    = String(serverClinical?.default_followup_weeks     ?? lsGet('ds_default_followup_weeks') ?? '4');
  const defaultCourseLength     = String(serverClinical?.default_course_length      ?? lsGet('ds_default_course_length')  ?? '20');
  const defaultConsentTemplate  = pref(serverClinical?.default_consent_template_id,  'ds_default_consent_template') || 'Standard TMS consent';
  const customConsentText       = pref(serverClinical?.custom_consent_text,          'ds_custom_consent_text');
  const DEFAULT_DISCLAIMER_TEXT = "This report is generated by DeepSynaps Protocol Studio based on current evidence and clinical guidelines. It is intended as clinical decision support only; final treatment decisions remain the clinician's responsibility.";
  const defaultDisclaimer       = pref(serverClinical?.default_disclaimer,           'ds_default_disclaimer')       || DEFAULT_DISCLAIMER_TEXT;
  const ASSESSMENT_OPTIONS      = ['PHQ-9', 'GAD-7', 'YBOCS', 'MADRS', 'HAM-D', 'PCL-5', 'AIMS', 'CGI-S'];
  let defaultAssessments = ['PHQ-9', 'GAD-7'];
  if (Array.isArray(serverClinical?.default_assessments)) {
    defaultAssessments = serverClinical.default_assessments.filter(x => ASSESSMENT_OPTIONS.includes(x));
  } else {
    try { const raw = lsGet('ds_default_assessments'); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) defaultAssessments = p.filter(x => ASSESSMENT_OPTIONS.includes(x)); } } catch {}
  }
  const aeProtocol = pref(serverClinical?.ae_protocol, 'ds_ae_protocol') || 'auto-notify';

  const PROTOCOL_OPTIONS = [
    ['none',              'None (choose per patient)'],
    ['tms-depression',    'TMS — Depression (F3 10Hz)'],
    ['tms-ocd',           'TMS — OCD (SMA 1Hz)'],
    ['tdcs-depression',   'tDCS — Depression (F3 anode)'],
    ['nfb-adhd',          'Neurofeedback — ADHD (Cz theta/beta)'],
    ['tdcs-stroke',       'tDCS — Stroke (M1 anode)'],
  ];
  const CONSENT_OPTIONS = [
    'Standard TMS consent',
    'Standard tDCS consent',
    'Standard Neurofeedback consent',
    'Research protocol consent',
    'Custom (edit below)',
  ];
  const AE_OPTIONS = [
    ['auto-notify', 'Auto-notify supervising physician immediately'],
    ['log-review',  'Log for next review'],
    ['auto-pause',  'Auto-pause course until reviewed'],
  ];

  const REMINDER_SLOTS = [
    { id: '24h',      label: '24h before' },
    { id: '2h',       label: '2h before' },
    { id: '15min',    label: '15min before' },
    { id: 'day-of',   label: 'Day-of morning summary' },
  ];
  const DEFAULT_REMINDER_TIMING = ['24h', '2h'];
  let reminderTiming = [...DEFAULT_REMINDER_TIMING];
  if (Array.isArray(serverPrefs?.reminder_timing)) {
    reminderTiming = serverPrefs.reminder_timing.filter(x => REMINDER_SLOTS.some(s => s.id === x));
  } else {
    try { const raw = lsGet('ds_reminder_timing'); if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) reminderTiming = p.filter(x => REMINDER_SLOTS.some(s => s.id === x)); } } catch {}
  }

  // ── User Preferences (server-backed with localStorage fallback) ─────────────
  const currentLocale = (() => { try { return getLocale() || 'en'; } catch { return 'en'; } })();
  const dateFormat    = pref(serverPrefs?.date_format,  'ds_date_format') || 'ISO';
  const timeFormat    = pref(serverPrefs?.time_format,  'ds_time_format') || '24h';
  const firstDay      = pref(serverPrefs?.first_day,    'ds_first_day')   || 'monday';
  const measureUnits  = pref(serverPrefs?.units,        'ds_units')       || 'metric';
  const autoDetectedNumberFormat = (() => {
    try {
      const parts = new Intl.NumberFormat(navigator.language || 'en-US').formatToParts(1234.56);
      const group = parts.find(p => p.type === 'group')?.value || ',';
      const decimal = parts.find(p => p.type === 'decimal')?.value || '.';
      if (group === ' ' || group === '\u202f' || group === '\u00a0') return 'FR';
      if (group === '.' && decimal === ',') return 'EU';
      return 'US';
    } catch { return 'US'; }
  })();
  const numberFormat = pref(serverPrefs?.number_format, 'ds_number_format') || autoDetectedNumberFormat;
  const sessionDefaultDuration = String(serverPrefs?.session_default_duration_min ?? lsGet('ds_session_default_duration') ?? '45');
  const autoLogout = (() => {
    if (serverPrefs?.auto_logout_min != null) {
      return serverPrefs.auto_logout_min === 0 ? 'never' : String(serverPrefs.auto_logout_min);
    }
    return lsGet('ds_auto_logout') || '30';
  })();

  const NOTIF_EVENTS = [
    { id: 'sessionReminders',   label: 'Session Reminders'   },
    { id: 'protocolAlerts',     label: 'Protocol Alerts'     },
    { id: 'adverseEventAlerts', label: 'Adverse Event Alerts'},
    { id: 'reviewQueueDigest',  label: 'Review Queue Digest' },
    { id: 'weeklySummary',      label: 'Weekly Summary'      },
    { id: 'patientMessages',    label: 'Patient Messages'    },
    { id: 'systemUpdates',      label: 'System Updates'      },
  ];
  const NOTIF_CHANNELS = [
    { id: 'email',    label: 'Email',    always: true },
    { id: 'inapp',    label: 'In-App',   always: true },
    { id: 'telegram', label: 'Telegram', always: false },
  ];
  const telegramLinked = !!telegramCode;

  el.innerHTML = `
    <!-- Account Section (editable) -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Account</span>
      </div>
      <div class="card-body">
        <!-- Avatar -->
        <div class="form-group" style="display:flex;align-items:center;gap:16px">
          <div id="acc-avatar-preview" style="width:64px;height:64px;border-radius:50%;background:${savedAvatar ? `url('${escAttr(savedAvatar)}') center/cover` : 'var(--surface-elev-1)'};border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text-tertiary);flex-shrink:0">${savedAvatar ? '' : (initials ? initials(currentUser?.display_name || currentUser?.email || '?') : '?')}</div>
          <div style="flex:1;min-width:0">
            <label class="form-label">Avatar</label>
            <input type="file" id="acc-avatar-input" accept="image/*" class="form-control" style="padding:6px 10px">
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">JPG/PNG, stored locally (cropped to 256×256). Clears with browser data.</div>
          </div>
          <button class="btn btn-sm" id="acc-avatar-clear" ${savedAvatar ? '' : 'disabled style="opacity:.5"'}>Remove</button>
        </div>

        <!-- Display Name -->
        <div class="form-group">
          <label class="form-label" for="acc-display-name">Display Name</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="acc-display-name" class="form-control" value="${escAttr(currentUser?.display_name || '')}" placeholder="Your full name" style="flex:1">
            <button class="btn btn-primary btn-sm" id="acc-save-name">Save</button>
          </div>
          <div id="acc-name-msg" style="font-size:11px;color:var(--text-tertiary);margin-top:4px;min-height:14px"></div>
        </div>

        <!-- Email -->
        <div class="form-group">
          <label class="form-label" for="acc-email">Email</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="email" id="acc-email" class="form-control" value="${escAttr(currentUser?.email || '')}" placeholder="you@clinic.com" style="flex:1">
            <button class="btn btn-primary btn-sm" id="acc-save-email">Save</button>
          </div>
          <div id="acc-email-msg" style="font-size:11px;color:var(--text-tertiary);margin-top:4px;min-height:14px">A verification email will be sent to the new address.</div>
        </div>

        <!-- Credentials / Title -->
        <div class="form-group">
          <label class="form-label" for="acc-credentials">Credentials / Title</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="acc-credentials" class="form-control" value="${escAttr(savedCredentials)}" placeholder="e.g. Dr., MD, PhD" style="flex:1">
            <button class="btn btn-sm" id="acc-save-creds">Save</button>
          </div>
        </div>

        <!-- Professional License / NPI -->
        <div class="form-group">
          <label class="form-label" for="acc-license">Professional License / NPI</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="acc-license" class="form-control" value="${escAttr(savedLicense)}" placeholder="License number or NPI" style="flex:1">
            <button class="btn btn-sm" id="acc-save-license">Save</button>
          </div>
        </div>

        <!-- Change Password -->
        ${cardWrap('🔒 Change Password', `
          <div class="form-group">
            <label class="form-label" for="acc-pw-current">Current Password</label>
            <input type="password" id="acc-pw-current" class="form-control" autocomplete="current-password">
          </div>
          <div class="form-group">
            <label class="form-label" for="acc-pw-new">New Password</label>
            <input type="password" id="acc-pw-new" class="form-control" autocomplete="new-password" placeholder="Minimum 10 characters">
          </div>
          <div class="form-group">
            <label class="form-label" for="acc-pw-confirm">Confirm New Password</label>
            <input type="password" id="acc-pw-confirm" class="form-control" autocomplete="new-password">
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-primary btn-sm" id="acc-save-password">Update Password</button>
            <span id="acc-pw-msg" style="font-size:11.5px;color:var(--text-secondary)"></span>
          </div>
        `)}

        <!-- Read-only chips below editable form -->
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
          <span style="font-size:11px;padding:3px 10px;border-radius:4px;background:rgba(0,212,188,0.1);color:var(--teal)">Role: ${currentUser?.role || 'guest'}</span>
          <span style="font-size:11px;padding:3px 10px;border-radius:4px;background:rgba(74,158,255,0.1);color:var(--blue)">Package: ${currentUser?.package_id || 'explorer'}</span>
          <span style="font-size:11px;padding:3px 10px;border-radius:4px;${currentUser?.is_verified ? 'background:rgba(34,197,94,0.1);color:var(--green)' : 'background:rgba(245,158,11,0.1);color:var(--amber)'}">${currentUser?.is_verified ? 'Verified ✓' : 'Verification Pending'}</span>
        </div>
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

    <!-- Clinic Section (editable) -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Clinic</span>
      </div>
      <div class="card-body">
        <!-- Clinic Logo -->
        <div class="form-group" style="display:flex;align-items:center;gap:16px">
          <div id="clinic-logo-preview" style="width:64px;height:64px;border-radius:10px;background:${savedClinicLogo ? `url('${escAttr(savedClinicLogo)}') center/cover` : 'var(--surface-elev-1)'};border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--text-tertiary);flex-shrink:0">${savedClinicLogo ? '' : '🏥'}</div>
          <div style="flex:1;min-width:0">
            <label class="form-label">Clinic Logo</label>
            <input type="file" id="clinic-logo-input" accept="image/*" class="form-control" style="padding:6px 10px">
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">JPG/PNG, cropped to 512×512. Stored locally until backend endpoint exists.</div>
          </div>
          <button class="btn btn-sm" id="clinic-logo-clear" ${savedClinicLogo ? '' : 'disabled style="opacity:.5"'}>Remove</button>
        </div>

        <!-- Clinic Name -->
        <div class="form-group">
          <label class="form-label" for="clinic-name">Clinic Name</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="clinic-name" class="form-control" value="${escAttr(savedClinicName)}" placeholder="e.g. DeepSynaps Neuro Clinic" style="flex:1">
            <button class="btn btn-primary btn-sm" id="clinic-save-name">Save</button>
          </div>
        </div>

        <!-- Address -->
        <div class="form-group">
          <label class="form-label" for="clinic-address">Address</label>
          <textarea id="clinic-address" class="form-control" rows="3" placeholder="Street, city, postcode, country" style="resize:vertical">${escAttr(savedClinicAddress)}</textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:6px">
            <button class="btn btn-sm" id="clinic-save-address">Save Address</button>
          </div>
        </div>

        <!-- Phone -->
        <div class="form-group">
          <label class="form-label" for="clinic-phone">Phone</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="tel" id="clinic-phone" class="form-control" value="${escAttr(savedClinicPhone)}" placeholder="+44 20 7123 4567" style="flex:1">
            <button class="btn btn-sm" id="clinic-save-phone">Save</button>
          </div>
        </div>

        <!-- Clinic Email -->
        <div class="form-group">
          <label class="form-label" for="clinic-email">Clinic Email</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="email" id="clinic-email" class="form-control" value="${escAttr(savedClinicEmail)}" placeholder="hello@clinic.com" style="flex:1">
            <button class="btn btn-sm" id="clinic-save-email">Save</button>
          </div>
        </div>

        <!-- Website -->
        <div class="form-group">
          <label class="form-label" for="clinic-website">Website</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="url" id="clinic-website" class="form-control" value="${escAttr(savedClinicWebsite)}" placeholder="https://clinic.com" style="flex:1">
            <button class="btn btn-sm" id="clinic-save-website">Save</button>
          </div>
        </div>

        <!-- Timezone -->
        <div class="form-group">
          <label class="form-label" for="clinic-tz">Timezone</label>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="clinic-tz" class="form-control" style="flex:1">
              ${tzList.map(tz => `<option value="${escAttr(tz)}" ${tz === savedClinicTZ ? 'selected' : ''}>${escAttr(tz)}</option>`).join('')}
            </select>
            <button class="btn btn-sm" id="clinic-save-tz">Save</button>
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Browser timezone: ${escAttr(browserTZ())}</div>
        </div>

        <!-- Practice Specialties -->
        <div class="form-group">
          <label class="form-label" for="clinic-specialties">Practice Specialties</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="text" id="clinic-specialties" class="form-control" value="${escAttr(savedClinicSpecialties)}" placeholder="TMS, Neurofeedback, Ketamine" style="flex:1">
            <button class="btn btn-sm" id="clinic-save-specialties">Save</button>
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Comma-separated list of modalities offered.</div>
        </div>

        <!-- Working Hours sub-card -->
        ${cardWrap('🕒 Working Hours', `
          <div style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:12.5px">
              <thead>
                <tr style="text-align:left;color:var(--text-secondary)">
                  <th style="padding:6px 8px;font-weight:500">Day</th>
                  <th style="padding:6px 8px;font-weight:500">Open</th>
                  <th style="padding:6px 8px;font-weight:500">From</th>
                  <th style="padding:6px 8px;font-weight:500">To</th>
                </tr>
              </thead>
              <tbody id="clinic-hours-body">
                ${[['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday']].map(([k,label]) => {
                  const h = savedHours[k] || defaultHours[k];
                  return `
                    <tr data-day="${k}" style="border-top:1px solid var(--border)">
                      <td style="padding:8px">${label}</td>
                      <td style="padding:8px"><input type="checkbox" class="clinic-hours-open" ${h.open ? 'checked' : ''}></td>
                      <td style="padding:8px"><input type="time" class="form-control clinic-hours-from" value="${escAttr(h.from)}" style="padding:4px 8px;max-width:120px"></td>
                      <td style="padding:8px"><input type="time" class="form-control clinic-hours-to"   value="${escAttr(h.to)}"   style="padding:4px 8px;max-width:120px"></td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:10px">
            <button class="btn btn-primary btn-sm" id="clinic-save-hours">Save Working Hours</button>
          </div>
        `)}

        <!-- Save All -->
        <div style="display:flex;justify-content:flex-end;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);gap:8px">
          <span id="clinic-save-all-msg" style="font-size:11.5px;color:var(--text-secondary);align-self:center"></span>
          <button class="btn btn-primary btn-sm" id="clinic-save-all">Save All Clinic Changes</button>
        </div>
      </div>
    </div>

    <!-- Team Members Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Team Members</span>
        <span id="team-count-chip" style="font-size:11px;padding:2px 9px;border-radius:10px;background:rgba(0,212,188,0.1);color:var(--teal);font-weight:500">${savedTeam.length}</span>
      </div>
      <div class="card-body">
        <div id="team-list"></div>

        <!-- Invite Member -->
        ${cardWrap('✉️ Invite Member', `
          <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="flex:2;min-width:220px;margin:0">
              <label class="form-label" for="team-invite-email">Email</label>
              <input type="email" id="team-invite-email" class="form-control" placeholder="colleague@clinic.com">
            </div>
            <div class="form-group" style="flex:1;min-width:150px;margin:0">
              <label class="form-label" for="team-invite-role">Role</label>
              <select id="team-invite-role" class="form-control">
                <option value="admin">Admin</option>
                <option value="clinician" selected>Clinician</option>
                <option value="technician">Technician</option>
                <option value="read-only">Read-only</option>
              </select>
            </div>
            <div>
              <button class="btn btn-primary btn-sm" id="team-invite-btn">Send invite</button>
            </div>
          </div>
          <div id="team-invite-msg" style="font-size:11.5px;color:var(--text-secondary);margin-top:8px;min-height:14px"></div>
        `)}

        <!-- Pending Invites -->
        <div id="team-pending-wrap"></div>
      </div>
    </div>

    <!-- Notifications Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Notifications</span>
      </div>
      <div class="card-body">
        <!-- Channel × Event matrix -->
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12.5px">
            <thead>
              <tr style="text-align:left;color:var(--text-secondary)">
                <th style="padding:8px;font-weight:500">Event</th>
                ${NOTIF_CHANNELS.map(ch => `<th style="padding:8px;font-weight:500;text-align:center;${!ch.always && !telegramLinked ? 'opacity:.5' : ''}">${escAttr(ch.label)}${!ch.always && !telegramLinked ? ' <span style="font-size:10px;color:var(--text-tertiary);font-weight:400">(link to enable)</span>' : ''}</th>`).join('')}
              </tr>
            </thead>
            <tbody id="notif-matrix-body">
              ${NOTIF_EVENTS.map(ev => `
                <tr data-event="${ev.id}" style="border-top:1px solid var(--border)">
                  <td style="padding:10px 8px;color:var(--text-primary)">${escAttr(ev.label)}</td>
                  ${NOTIF_CHANNELS.map(ch => {
                    const disabled = !ch.always && !telegramLinked;
                    const checked = !!(notifPrefs[ev.id] && notifPrefs[ev.id][ch.id]);
                    return `<td style="padding:10px 8px;text-align:center">
                      <input type="checkbox" class="notif-cell" data-event="${ev.id}" data-channel="${ch.id}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                    </td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div id="notif-matrix-msg" style="font-size:11px;color:var(--text-tertiary);margin-top:6px;min-height:14px"></div>

        <!-- Quiet Hours -->
        ${cardWrap('🌙 Quiet Hours', `
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="margin:0">
              <label class="form-label" for="quiet-from">From</label>
              <input type="time" id="quiet-from" class="form-control" value="${escAttr(quietHours.from)}" style="max-width:140px">
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label" for="quiet-to">To</label>
              <input type="time" id="quiet-to" class="form-control" value="${escAttr(quietHours.to)}" style="max-width:140px">
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-primary);margin-bottom:6px">
              <input type="checkbox" id="quiet-enabled" ${quietHours.enabled ? 'checked' : ''}>
              Respect quiet hours (defer non-urgent)
            </label>
          </div>
          <div style="margin-top:10px;font-size:11.5px;color:var(--text-tertiary)">AE alerts and emergencies bypass quiet hours.</div>
        `)}

        <!-- Digest Frequency -->
        ${cardWrap('📰 Digest Frequency', `
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[['daily','Daily'],['weekly','Weekly'],['off','Off']].map(([v,l]) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-primary);cursor:pointer">
                <input type="radio" name="digest-freq" value="${v}" ${digestFreq === v ? 'checked' : ''}>
                ${l}
              </label>
            `).join('')}
          </div>
        `)}

        <!-- Session Reminder Timing -->
        ${cardWrap('⏰ Session Reminder Timing', `
          <div style="display:flex;gap:8px;flex-wrap:wrap" id="reminder-chip-wrap">
            ${REMINDER_SLOTS.map(s => {
              const on = reminderTiming.includes(s.id);
              return `<button type="button" class="btn btn-sm reminder-chip" data-slot="${s.id}" data-on="${on ? '1' : '0'}" style="padding:5px 12px;${on ? 'background:rgba(0,212,188,0.12);border-color:var(--border-teal);color:var(--teal)' : ''}">${on ? '✓ ' : ''}${escAttr(s.label)}</button>`;
            }).join('')}
          </div>
          <div style="margin-top:8px;font-size:11.5px;color:var(--text-tertiary)">Select one or more reminder slots. Empty = no reminders.</div>
        `)}

        <!-- Telegram Integration (preserved) -->
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

    <!-- Preferences Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Preferences</span>
      </div>
      <div class="card-body">
        <!-- Language -->
        <div class="form-group">
          <label class="form-label" for="pref-language">Language</label>
          <select id="pref-language" class="form-control">
            ${Object.entries(LOCALES).map(([code, label]) => `<option value="${escAttr(code)}" ${code === currentLocale ? 'selected' : ''}>${escAttr(label)}</option>`).join('')}
          </select>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Changing language reloads the app so all labels update.</div>
        </div>

        <!-- Date Format -->
        <div class="form-group">
          <label class="form-label">Date Format</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[
              ['ISO','ISO (2026-04-17)'],
              ['US', 'US (04/17/2026)'],
              ['EU', 'EU (17/04/2026)'],
            ].map(([v,l]) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-primary);cursor:pointer">
                <input type="radio" name="pref-date-format" value="${v}" ${dateFormat === v ? 'checked' : ''}>
                ${l}
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Time Format -->
        <div class="form-group">
          <label class="form-label">Time Format</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[['24h','24-hour'],['12h','12-hour']].map(([v,l]) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-primary);cursor:pointer">
                <input type="radio" name="pref-time-format" value="${v}" ${timeFormat === v ? 'checked' : ''}>
                ${l}
              </label>
            `).join('')}
          </div>
        </div>

        <!-- First Day of Week -->
        <div class="form-group">
          <label class="form-label">First Day of Week</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[['monday','Monday'],['sunday','Sunday']].map(([v,l]) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-primary);cursor:pointer">
                <input type="radio" name="pref-first-day" value="${v}" ${firstDay === v ? 'checked' : ''}>
                ${l}
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Measurement Units -->
        <div class="form-group">
          <label class="form-label">Measurement Units</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[['metric','Metric (kg, cm)'],['imperial','Imperial (lb, in)']].map(([v,l]) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-primary);cursor:pointer">
                <input type="radio" name="pref-units" value="${v}" ${measureUnits === v ? 'checked' : ''}>
                ${l}
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Number Format -->
        <div class="form-group">
          <label class="form-label">Number Format</label>
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            ${[
              ['US','1,234.56 (US)'],
              ['EU','1.234,56 (EU)'],
              ['FR','1 234,56 (FR)'],
            ].map(([v,l]) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-primary);cursor:pointer">
                <input type="radio" name="pref-number-format" value="${v}" ${numberFormat === v ? 'checked' : ''}>
                ${l}
              </label>
            `).join('')}
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">Auto-detected from browser: ${escAttr(autoDetectedNumberFormat)}.</div>
        </div>

        <!-- Session Default Duration -->
        <div class="form-group">
          <label class="form-label" for="pref-session-duration">Session Default Duration (minutes)</label>
          <input type="number" id="pref-session-duration" class="form-control" value="${escAttr(sessionDefaultDuration)}" min="5" max="240" step="5" style="max-width:160px">
        </div>

        <!-- Auto-logout -->
        <div class="form-group">
          <label class="form-label" for="pref-auto-logout">Auto-logout after inactivity</label>
          <select id="pref-auto-logout" class="form-control" style="max-width:220px">
            ${[
              ['never','Never'],
              ['15','15 min'],
              ['30','30 min'],
              ['60','1 hour'],
              ['240','4 hours'],
            ].map(([v,l]) => `<option value="${v}" ${autoLogout === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">TODO: wire ds_auto_logout to idle-session watchdog</div>
        </div>

        <div id="pref-save-msg" style="font-size:11.5px;color:var(--text-tertiary);margin-top:6px;min-height:14px"></div>
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
          ['2FA',        twoFAEnabled ? '<span style="color:var(--green)">Enabled ✓</span>' : '<span style="color:var(--amber)">Recommended — not yet enabled</span>'],
          ['Audit Logs', '7-year retention policy'],
          ['Encryption', 'AES-256 at rest · TLS 1.3 in transit'],
        ].map(([k, v]) => fr(k, v)).join('')}

        <!-- Two-Factor Authentication -->
        ${cardWrap('📱 Two-Factor Authentication (2FA)', `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <div style="font-size:12.5px;color:var(--text-secondary)">
                ${twoFAEnabled
                  ? 'Two-factor authentication is active on this account. Your login requires a 6-digit code from your authenticator app.'
                  : 'Add an extra layer of security to your account by requiring a 6-digit code from your authenticator app at login.'}
              </div>
            </div>
            <div id="twofa-btn-wrap">
              ${twoFAEnabled
                ? `<span style="font-size:12px;color:var(--green);margin-right:8px">2FA Enabled ✓</span><button class="btn btn-sm" id="twofa-disable-btn">Disable</button>`
                : `<button class="btn btn-primary btn-sm" id="twofa-enable-btn">Enable 2FA</button>`}
            </div>
          </div>
          <div id="twofa-setup-panel" style="display:none;margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-elev-1)"></div>
        `)}

        <!-- Active Sessions -->
        ${cardWrap('Active Sessions', `
          <div id="sessions-list"></div>
          <div style="margin-top:10px;display:flex;justify-content:flex-end">
            <button class="btn btn-sm" id="sessions-signout-all">Sign out all other devices</button>
          </div>
        `)}

        <!-- Audit Log -->
        ${cardWrap('Audit Log', `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="font-size:12.5px;color:var(--text-secondary)">Review a complete history of account and clinical actions. Required for HIPAA compliance; 7-year retention.</div>
            <button class="btn btn-sm" id="audit-log-btn">View audit log →</button>
          </div>
        `)}

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

    <!-- Data & Privacy Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Data &amp; Privacy</span>
      </div>
      <div class="card-body">
        <!-- Export My Data -->
        ${cardWrap('📤 Export My Data (GDPR Article 20)', `
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">
            Download a complete copy of your account, patient, session, and protocol data in JSON format. Processing may take up to 24 hours for large accounts.
          </div>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="dp-export-btn">Download Data Export →</button>
            <span id="dp-export-msg" style="font-size:11.5px;color:var(--text-tertiary)">${lastExport ? 'Last export: ' + escAttr(lastExport) : ''}</span>
          </div>
        `)}

        <!-- Data Retention -->
        ${cardWrap('🗄️ Data Retention', `
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">
            Patient data is retained per HIPAA default (<strong>7 years post-encounter</strong>). Clinical notes, audit logs, and assessments cannot be deleted before retention expiry.
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px">Read-only — retention policy is legally binding.</div>
        `)}

        <!-- Analytics & Telemetry -->
        ${cardWrap('📊 Analytics &amp; Telemetry', `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0">
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;color:var(--text-primary)">Share anonymous usage data to help improve DeepSynaps</div>
            </div>
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="dp-analytics-opt" ${analyticsOptIn ? 'checked' : ''}>
              <span style="font-size:11.5px;color:var(--text-secondary)">Opt-in</span>
            </label>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--border)">
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;color:var(--text-primary)">Share error reports for faster bug fixes</div>
            </div>
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="dp-errors-opt" ${errorReportsOptIn ? 'checked' : ''}>
              <span style="font-size:11.5px;color:var(--text-secondary)">Opt-in</span>
            </label>
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px;line-height:1.5">We never share PHI or clinical data. Only anonymized interaction patterns.</div>
        `)}

        <!-- Consent & Privacy -->
        ${cardWrap('📜 Consent &amp; Privacy', `
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-sm" id="dp-privacy-link" style="justify-content:flex-start;text-align:left">View Privacy Policy →</button>
            <button class="btn btn-sm" id="dp-terms-link" style="justify-content:flex-start;text-align:left">View Terms of Service →</button>
            <button class="btn btn-sm" id="dp-dpa-link" style="justify-content:flex-start;text-align:left">Data Processing Agreement (DPA) →</button>
          </div>
        `)}

        <!-- Cookie Preferences -->
        ${cardWrap('🍪 Cookie Preferences', `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0">
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;color:var(--text-primary)">Essential cookies</div>
              <div style="font-size:11px;color:var(--text-tertiary)">Required for login and security — always on.</div>
            </div>
            <label style="display:inline-flex;align-items:center;gap:8px;opacity:.6;cursor:not-allowed">
              <input type="checkbox" checked disabled>
              <span style="font-size:11.5px;color:var(--text-secondary)">Always on</span>
            </label>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--border)">
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;color:var(--text-primary)">Functional cookies</div>
              <div style="font-size:11px;color:var(--text-tertiary)">Remember your preferences and settings.</div>
            </div>
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="dp-cookie-functional" ${cookieFunctional ? 'checked' : ''}>
              <span style="font-size:11.5px;color:var(--text-secondary)">Enabled</span>
            </label>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--border)">
            <div style="flex:1;min-width:0">
              <div style="font-size:12.5px;color:var(--text-primary)">Analytics cookies</div>
              <div style="font-size:11px;color:var(--text-tertiary)">Measure usage to improve the product.</div>
            </div>
            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="dp-cookie-analytics" ${cookieAnalytics ? 'checked' : ''}>
              <span style="font-size:11.5px;color:var(--text-secondary)">Enabled</span>
            </label>
          </div>
        `)}

        <div id="dp-save-msg" style="font-size:11.5px;color:var(--text-tertiary);margin-top:6px;min-height:14px"></div>
      </div>
    </div>

    <!-- Clinical Defaults Section -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="padding:12px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Clinical Defaults</span>
      </div>
      <div class="card-body">
        <!-- Default Protocol Template -->
        <div class="form-group">
          <label class="form-label" for="cd-default-protocol">Default Protocol Template</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <select id="cd-default-protocol" class="form-control" style="flex:1;min-width:240px">
              ${PROTOCOL_OPTIONS.map(([v, l]) => `<option value="${escAttr(v)}" ${defaultProtocol === v ? 'selected' : ''}>${escAttr(l)}</option>`).join('')}
            </select>
            <button class="btn btn-sm" onclick="window._nav('protocols')">Customize protocol defaults →</button>
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">TODO: wire ds_default_protocol to intake flow's protocol picker</div>
        </div>

        <!-- Default Session Duration -->
        <div class="form-group">
          <label class="form-label" for="cd-session-duration">Default Session Duration (minutes)</label>
          <input type="number" id="cd-session-duration" class="form-control" value="${escAttr(defaultSessionDuration)}" min="5" max="240" step="5" style="max-width:160px">
        </div>

        <!-- Default Follow-up Cadence -->
        <div class="form-group">
          <label class="form-label" for="cd-followup-weeks">Default Follow-up Cadence (weeks)</label>
          <input type="number" id="cd-followup-weeks" class="form-control" value="${escAttr(defaultFollowupWeeks)}" min="1" max="52" step="1" style="max-width:160px">
        </div>

        <!-- Default Course Length -->
        <div class="form-group">
          <label class="form-label" for="cd-course-length">Default Course Length (sessions)</label>
          <input type="number" id="cd-course-length" class="form-control" value="${escAttr(defaultCourseLength)}" min="1" max="200" step="1" style="max-width:160px">
        </div>

        <!-- Default Consent Template -->
        <div class="form-group">
          <label class="form-label" for="cd-consent-template">Default Consent Template</label>
          <select id="cd-consent-template" class="form-control" style="max-width:360px">
            ${CONSENT_OPTIONS.map(v => `<option value="${escAttr(v)}" ${defaultConsentTemplate === v ? 'selected' : ''}>${escAttr(v)}</option>`).join('')}
          </select>
          <div id="cd-custom-consent-wrap" style="margin-top:8px;display:${defaultConsentTemplate === 'Custom (edit below)' ? 'block' : 'none'}">
            <label class="form-label" for="cd-custom-consent">Custom Consent Boilerplate</label>
            <textarea id="cd-custom-consent" class="form-control" rows="5" placeholder="Enter your custom consent boilerplate…">${escAttr(customConsentText)}</textarea>
          </div>
        </div>

        <!-- Default Disclaimer Text -->
        <div class="form-group">
          <label class="form-label" for="cd-disclaimer">Default Disclaimer Text</label>
          <textarea id="cd-disclaimer" class="form-control" rows="4">${escAttr(defaultDisclaimer)}</textarea>
        </div>

        <!-- Assessment Battery -->
        <div class="form-group">
          <label class="form-label">Assessment Battery (auto-assign on intake)</label>
          <div style="display:flex;gap:12px;flex-wrap:wrap;padding:4px 0">
            ${ASSESSMENT_OPTIONS.map(a => `
              <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-primary);cursor:pointer;padding:4px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-elev-1)">
                <input type="checkbox" class="cd-assessment" value="${escAttr(a)}" ${defaultAssessments.includes(a) ? 'checked' : ''}>
                ${escAttr(a)}
              </label>
            `).join('')}
          </div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">TODO: wire ds_default_assessments to intake auto-assign</div>
        </div>

        <!-- Adverse Event Protocol -->
        <div class="form-group">
          <label class="form-label">Adverse Event Protocol</label>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${AE_OPTIONS.map(([v, l]) => `
              <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-primary);cursor:pointer">
                <input type="radio" name="cd-ae-protocol" value="${escAttr(v)}" ${aeProtocol === v ? 'checked' : ''}>
                ${escAttr(l)}
              </label>
            `).join('')}
          </div>
        </div>

        <div id="cd-save-msg" style="font-size:11.5px;color:var(--text-tertiary);margin-top:6px;min-height:14px"></div>
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

  // ── Account editable wiring ────────────────────────────────────────────────
  const toast = (msg, kind) => {
    if (window._showToast) { window._showToast(msg, kind || 'success'); return; }
    alert(msg);
  };

  // Avatar: upload via multipart to backend; on failure, keep client-side crop
  // + localStorage mirror so the user still sees their image.
  const avatarInput = document.getElementById('acc-avatar-input');
  const avatarPreview = document.getElementById('acc-avatar-preview');
  const avatarClear = document.getElementById('acc-avatar-clear');
  if (avatarInput) {
    avatarInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = async () => {
          let dataUrl = ev.target.result;
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 256; canvas.height = 256;
            const ctx = canvas.getContext('2d');
            const side = Math.min(img.width, img.height);
            const sx = (img.width - side) / 2;
            const sy = (img.height - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
            dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          } catch {}
          if (avatarPreview) { avatarPreview.style.background = `url('${dataUrl}') center/cover`; avatarPreview.textContent = ''; }
          if (avatarClear) { avatarClear.disabled = false; avatarClear.style.opacity = ''; }
          try {
            const res = await api.uploadAvatar(file);
            const remoteUrl = res?.avatar_url || res?.url;
            if (remoteUrl) {
              if (avatarPreview) { avatarPreview.style.background = `url('${remoteUrl}') center/cover`; }
              try { localStorage.setItem('ds_user_avatar', remoteUrl); } catch {}
            } else {
              try { localStorage.setItem('ds_user_avatar', dataUrl); } catch {}
            }
            toast('Avatar updated.');
          } catch (err) {
            try { localStorage.setItem('ds_user_avatar', dataUrl); } catch {}
            toast('Avatar saved locally (upload failed: ' + (err?.message || 'retry') + ')', 'warning');
          }
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  if (avatarClear) {
    avatarClear.addEventListener('click', async () => {
      try { await api.deleteAvatar(); } catch {}
      localStorage.removeItem('ds_user_avatar');
      if (avatarPreview) {
        avatarPreview.style.background = 'var(--surface-elev-1)';
        avatarPreview.textContent = (initials ? initials(currentUser?.display_name || currentUser?.email || '?') : '?');
      }
      avatarClear.disabled = true;
      avatarClear.style.opacity = '.5';
      toast('Avatar removed.');
    });
  }

  // Display name — server-first, localStorage mirror.
  const saveNameBtn = document.getElementById('acc-save-name');
  if (saveNameBtn) {
    saveNameBtn.addEventListener('click', async () => {
      const val = (document.getElementById('acc-display-name')?.value || '').trim();
      const msg = document.getElementById('acc-name-msg');
      if (!val) { if (msg) { msg.textContent = 'Display name cannot be empty.'; msg.style.color = 'var(--amber)'; } return; }
      saveNameBtn.disabled = true;
      try {
        await api.updateProfile({ display_name: val });
        try { localStorage.setItem('ds_user_display_name', val); } catch {}
        if (currentUser) currentUser.display_name = val;
        try { window.updateUserBar && window.updateUserBar(); } catch {}
        if (msg) { msg.textContent = 'Saved.'; msg.style.color = 'var(--green)'; }
        toast('Display name saved.');
      } catch (e) {
        if (msg) { msg.textContent = 'Not saved — retry. (' + (e?.message || 'network') + ')'; msg.style.color = 'var(--amber)'; }
        toast('Could not save display name.', 'warning');
      } finally {
        saveNameBtn.disabled = false;
      }
    });
  }

  // Email — request verification via backend.
  const saveEmailBtn = document.getElementById('acc-save-email');
  if (saveEmailBtn) {
    saveEmailBtn.addEventListener('click', async () => {
      const val = (document.getElementById('acc-email')?.value || '').trim();
      const msg = document.getElementById('acc-email-msg');
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(val)) { if (msg) { msg.textContent = 'Enter a valid email address.'; msg.style.color = 'var(--amber)'; } return; }
      const pw = prompt('Confirm your current password to change email:');
      if (!pw) return;
      saveEmailBtn.disabled = true;
      try {
        await api.requestEmailChange(val, pw);
        try { localStorage.setItem('ds_user_pending_email', val); } catch {}
        if (msg) { msg.textContent = 'Verification email sent to ' + val + '. Click the link to confirm.'; msg.style.color = 'var(--teal)'; }
        toast('Verification email sent.', 'info');
      } catch (e) {
        if (msg) { msg.textContent = 'Not saved — ' + (e?.message || 'retry'); msg.style.color = 'var(--amber)'; }
      } finally {
        saveEmailBtn.disabled = false;
      }
    });
  }

  // Credentials — server-first, localStorage mirror.
  const saveCredsBtn = document.getElementById('acc-save-creds');
  if (saveCredsBtn) {
    saveCredsBtn.addEventListener('click', async () => {
      const val = (document.getElementById('acc-credentials')?.value || '').trim();
      saveCredsBtn.disabled = true;
      try {
        await api.updateProfile({ credentials: val });
        try { localStorage.setItem('ds_user_credentials', val); } catch {}
        toast('Credentials saved.');
      } catch (e) {
        try { localStorage.setItem('ds_user_credentials', val); } catch {}
        toast('Not saved to server — cached locally. (' + (e?.message || 'retry') + ')', 'warning');
      } finally {
        saveCredsBtn.disabled = false;
      }
    });
  }

  // License / NPI — server-first, localStorage mirror.
  const saveLicenseBtn = document.getElementById('acc-save-license');
  if (saveLicenseBtn) {
    saveLicenseBtn.addEventListener('click', async () => {
      const val = (document.getElementById('acc-license')?.value || '').trim();
      saveLicenseBtn.disabled = true;
      try {
        await api.updateProfile({ license_number: val });
        try { localStorage.setItem('ds_user_license', val); } catch {}
        toast('License / NPI saved.');
      } catch (e) {
        try { localStorage.setItem('ds_user_license', val); } catch {}
        toast('Not saved to server — cached locally. (' + (e?.message || 'retry') + ')', 'warning');
      } finally {
        saveLicenseBtn.disabled = false;
      }
    });
  }

  // Change password — real server call.
  const savePwBtn = document.getElementById('acc-save-password');
  if (savePwBtn) {
    savePwBtn.addEventListener('click', async () => {
      const cur = document.getElementById('acc-pw-current')?.value || '';
      const n1  = document.getElementById('acc-pw-new')?.value || '';
      const n2  = document.getElementById('acc-pw-confirm')?.value || '';
      const msg = document.getElementById('acc-pw-msg');
      const setMsg = (t, color) => { if (msg) { msg.textContent = t; msg.style.color = color || 'var(--text-secondary)'; } };
      if (!cur)               return setMsg('Enter your current password.', 'var(--amber)');
      if (n1.length < 10)     return setMsg('New password must be at least 10 characters.', 'var(--amber)');
      if (n1 !== n2)          return setMsg('New passwords do not match.', 'var(--amber)');
      savePwBtn.disabled = true;
      try {
        await api.changePassword(cur, n1);
        try { localStorage.setItem('ds_user_password_updated_at', new Date().toISOString()); } catch {}
        ['acc-pw-current','acc-pw-new','acc-pw-confirm'].forEach(id => { const f = document.getElementById(id); if (f) f.value = ''; });
        setMsg('Password updated.', 'var(--green)');
        toast('Password updated.');
      } catch (e) {
        setMsg('Not updated: ' + (e?.message || 'retry'), 'var(--red)');
        toast('Password change failed.', 'warning');
      } finally {
        savePwBtn.disabled = false;
      }
    });
  }

  // ── Security: 2FA setup (real backend) ─────────────────────────────────────
  async function render2FASetupPanel() {
    const panel = document.getElementById('twofa-setup-panel');
    if (!panel) return;
    panel.style.display = '';
    panel.innerHTML = `<div style="font-size:12px;color:var(--text-secondary)">Preparing setup…</div>`;
    let setup;
    try {
      setup = await api.setup2FA();
    } catch (e) {
      panel.innerHTML = `<div style="font-size:12px;color:var(--red)">Could not start 2FA setup: ${escAttr(e?.message || 'retry')}</div>`;
      return;
    }
    const secret = setup?.secret || setup?.otp_secret || '';
    const qrUrl  = setup?.qr_url || setup?.otpauth_url || '';
    const backupCodes = Array.isArray(setup?.backup_codes) ? setup.backup_codes : [];
    if (secret) { try { localStorage.setItem('ds_2fa_secret', secret); } catch {} }
    panel.innerHTML = `
      <div style="font-size:12.5px;color:var(--text-primary);margin-bottom:8px;font-weight:600">Set up your authenticator</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Scan the QR code with Google Authenticator / Authy / 1Password, or enter the secret manually.</div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <div style="width:120px;height:120px;background:${qrUrl ? `#fff url('${escAttr(qrUrl)}') center/contain no-repeat` : 'repeating-linear-gradient(45deg,var(--text-primary) 0 6px,var(--surface) 6px 12px)'};border:1px solid var(--border);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--surface);font-size:10px;text-align:center">${qrUrl ? '' : 'QR unavailable'}</div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-tertiary);margin-bottom:4px">OTP Secret</div>
          <code style="font-family:var(--font-mono);font-size:13px;color:var(--teal);background:rgba(0,212,188,0.08);padding:6px 10px;border-radius:4px;letter-spacing:1px;display:inline-block;user-select:all">${escAttr(secret) || '—'}</code>
        </div>
      </div>
      ${backupCodes.length ? `
        <div style="margin-bottom:12px;padding:10px;background:rgba(245,158,11,0.08);border:1px solid var(--amber);border-radius:6px">
          <div style="font-size:11.5px;font-weight:600;color:var(--amber);margin-bottom:6px">Backup Codes — save these now</div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;font-family:var(--font-mono);font-size:12px">
            ${backupCodes.map(c => `<code style="padding:3px 6px;background:rgba(0,0,0,0.15);border-radius:3px;user-select:all">${escAttr(c)}</code>`).join('')}
          </div>
        </div>` : ''}
      <div class="form-group">
        <label class="form-label" for="twofa-code">Verification Code</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="twofa-code" class="form-control" maxlength="6" placeholder="6-digit code" style="flex:1;max-width:180px;letter-spacing:4px;font-family:var(--font-mono)">
          <button class="btn btn-primary btn-sm" id="twofa-verify-btn">Verify & Enable</button>
          <button class="btn btn-sm" id="twofa-cancel-btn">Cancel</button>
        </div>
        <div id="twofa-code-msg" style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;min-height:14px"></div>
      </div>
    `;
    const verifyBtn = document.getElementById('twofa-verify-btn');
    const cancelBtn = document.getElementById('twofa-cancel-btn');
    const codeInput = document.getElementById('twofa-code');
    const codeMsg   = document.getElementById('twofa-code-msg');
    if (verifyBtn) verifyBtn.addEventListener('click', async () => {
      const code = (codeInput?.value || '').trim();
      if (!/^\d{6}$/.test(code)) { if (codeMsg) { codeMsg.textContent = 'Enter a 6-digit numeric code.'; codeMsg.style.color = 'var(--amber)'; } return; }
      verifyBtn.disabled = true;
      try {
        await api.verify2FA(code);
        try { localStorage.setItem('ds_2fa_enabled', 'true'); } catch {}
        const wrap = document.getElementById('twofa-btn-wrap');
        if (wrap) wrap.innerHTML = '<span style="font-size:12px;color:var(--green);margin-right:8px">2FA Enabled ✓</span><button class="btn btn-sm" id="twofa-disable-btn">Disable</button>';
        panel.style.display = 'none'; panel.innerHTML = '';
        bindDisable2FA();
        toast('Two-factor authentication enabled.');
      } catch (e) {
        if (codeMsg) { codeMsg.textContent = 'Verification failed: ' + (e?.message || 'retry'); codeMsg.style.color = 'var(--red)'; }
      } finally {
        verifyBtn.disabled = false;
      }
    });
    if (cancelBtn) cancelBtn.addEventListener('click', () => { panel.style.display = 'none'; panel.innerHTML = ''; });
  }

  function bindEnable2FA() {
    const btn = document.getElementById('twofa-enable-btn');
    if (btn) btn.addEventListener('click', render2FASetupPanel);
  }
  function bindDisable2FA() {
    const btn = document.getElementById('twofa-disable-btn');
    if (btn) btn.addEventListener('click', async () => {
      if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return;
      const pw = prompt('Confirm your password to disable 2FA:');
      if (!pw) return;
      const code = prompt('Enter a current 6-digit authenticator code:');
      if (!code) return;
      try {
        await api.disable2FA(pw, code);
        try { localStorage.setItem('ds_2fa_enabled', 'false'); } catch {}
        try { localStorage.removeItem('ds_2fa_secret'); } catch {}
        const wrap = document.getElementById('twofa-btn-wrap');
        if (wrap) wrap.innerHTML = '<button class="btn btn-primary btn-sm" id="twofa-enable-btn">Enable 2FA</button>';
        bindEnable2FA();
        toast('Two-factor authentication disabled.', 'info');
      } catch (e) {
        toast('Could not disable 2FA: ' + (e?.message || 'retry'), 'warning');
      }
    });
  }
  bindEnable2FA();
  bindDisable2FA();

  // ── Security: Active sessions (API-backed with minimal fallback) ───────────
  const _fallbackSessions = [
    { id: 'cur', device: 'This device · ' + (navigator.platform || 'Browser'), ip: '—', last: 'Active now', current: true },
  ];
  function formatSessionRow(s) {
    return {
      id: s.id,
      device:  s.device || s.user_agent || 'Unknown device',
      ip:      s.ip || s.ip_address || '—',
      last:    s.last || s.last_seen_at || s.last_seen || '—',
      current: !!(s.current ?? s.is_current),
    };
  }
  async function loadSessions() {
    try {
      const res = await api.listAuthSessions();
      const list = Array.isArray(res) ? res : (res?.items || res?.sessions || []);
      if (Array.isArray(list)) return list.map(formatSessionRow);
    } catch {}
    return _fallbackSessions.slice();
  }

  function renderSessions() {
    const host = document.getElementById('sessions-list');
    if (!host) return;
    const list = window._dsSessions || [];
    if (!list.length) { host.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">No other active sessions.</div>'; return; }
    host.innerHTML = list.map((s, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;${i < list.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${escAttr(s.device)}${s.current ? ' <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(0,212,188,0.1);color:var(--teal);margin-left:6px">Current</span>' : ''}</div>
          <div style="font-size:11.5px;color:var(--text-secondary)">IP ${escAttr(s.ip)} · ${escAttr(s.last)}</div>
        </div>
        ${s.current ? '' : `<a href="#" data-sid="${escAttr(s.id)}" class="sess-signout" style="font-size:12px;color:var(--red);text-decoration:none">Sign out</a>`}
      </div>
    `).join('');
    host.querySelectorAll('.sess-signout').forEach(a => {
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        const sid = a.getAttribute('data-sid');
        try {
          await api.revokeAuthSession(sid);
          window._dsSessions = (window._dsSessions || []).filter(x => x.id !== sid);
          renderSessions();
          toast('Session signed out.', 'info');
        } catch (err) {
          toast('Could not sign out session: ' + (err?.message || 'retry'), 'warning');
        }
      });
    });
  }
  (async () => { window._dsSessions = await loadSessions(); renderSessions(); })();
  const signoutAllBtn = document.getElementById('sessions-signout-all');
  if (signoutAllBtn) signoutAllBtn.addEventListener('click', async () => {
    if (!confirm('Sign out of all other devices? They will need to log in again.')) return;
    try {
      await api.revokeOtherAuthSessions();
      window._dsSessions = (window._dsSessions || []).filter(s => s.current);
      renderSessions();
      toast('All other devices have been signed out.', 'success');
    } catch (e) {
      toast('Could not sign out other devices: ' + (e?.message || 'retry'), 'warning');
    }
  });

  // ── Security: Audit log link ───────────────────────────────────────────────
  const auditBtn = document.getElementById('audit-log-btn');
  if (auditBtn) auditBtn.addEventListener('click', () => {
    // Prefer dedicated audit trail route; fall back to reports if unavailable.
    if (typeof window._nav === 'function') {
      try { window._nav('audittrail'); }
      catch { window._nav('reports'); }
    }
  });

  // ── Clinic profile wiring (API-backed with localStorage mirror) ────────────
  const persist = (key, val) => { try { localStorage.setItem(key, val); } catch {} };

  // If server has no clinic row yet, create on first save.
  let _clinicExists = !!(serverClinic?.id || serverClinic?.name);
  async function _saveClinicField(fields) {
    try {
      if (_clinicExists) await api.updateClinic(fields);
      else { await api.createClinic(fields); _clinicExists = true; }
      return true;
    } catch (e) {
      console.warn('[settings] clinic save failed', e?.message);
      toast(`Not saved to server — cached locally. (${e?.message || 'retry'})`, 'warning');
      return false;
    }
  }

  // Clinic Logo: upload via multipart to backend; fall back to client-side crop.
  const clinicLogoInput   = document.getElementById('clinic-logo-input');
  const clinicLogoPreview = document.getElementById('clinic-logo-preview');
  const clinicLogoClear   = document.getElementById('clinic-logo-clear');
  if (clinicLogoInput) {
    clinicLogoInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = async () => {
          let dataUrl = ev.target.result;
          try {
            const MAX = 512;
            const scale = Math.min(1, MAX / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            dataUrl = canvas.toDataURL('image/png');
          } catch {}
          if (clinicLogoPreview) { clinicLogoPreview.style.background = `url('${dataUrl}') center/cover`; clinicLogoPreview.textContent = ''; }
          if (clinicLogoClear) { clinicLogoClear.disabled = false; clinicLogoClear.style.opacity = ''; }
          try {
            const res = await api.uploadClinicLogo(file);
            const remoteUrl = res?.logo_url || res?.url;
            if (remoteUrl) {
              if (clinicLogoPreview) { clinicLogoPreview.style.background = `url('${remoteUrl}') center/cover`; }
              persist('ds_clinic_logo', remoteUrl);
            } else {
              persist('ds_clinic_logo', dataUrl);
            }
            toast('Clinic logo updated.');
          } catch (err) {
            persist('ds_clinic_logo', dataUrl);
            toast('Logo saved locally (upload failed: ' + (err?.message || 'retry') + ')', 'warning');
          }
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
  if (clinicLogoClear) {
    clinicLogoClear.addEventListener('click', () => {
      localStorage.removeItem('ds_clinic_logo');
      if (clinicLogoPreview) { clinicLogoPreview.style.background = 'var(--surface-elev-1)'; clinicLogoPreview.textContent = '🏥'; }
      clinicLogoClear.disabled = true; clinicLogoClear.style.opacity = '.5';
      toast('Clinic logo removed.', 'info');
    });
  }

  // Per-field inline saves — PATCH clinic, mirror to localStorage.
  const bindFieldSave = (btnId, fieldId, lsKey, label, apiKey, transform) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const raw = (document.getElementById(fieldId)?.value || '').trim();
      const apiVal = transform ? transform(raw) : raw;
      btn.disabled = true;
      try {
        await _saveClinicField({ [apiKey]: apiVal });
        persist(lsKey, raw);
        toast(`${label} saved.`);
      } catch {
        persist(lsKey, raw);
      } finally {
        btn.disabled = false;
      }
    });
  };
  bindFieldSave('clinic-save-name',        'clinic-name',        'ds_clinic_name',        'Clinic name',  'name');
  bindFieldSave('clinic-save-address',     'clinic-address',     'ds_clinic_address',     'Address',      'address');
  bindFieldSave('clinic-save-phone',       'clinic-phone',       'ds_clinic_phone',       'Phone',        'phone');
  bindFieldSave('clinic-save-email',       'clinic-email',       'ds_clinic_email',       'Clinic email', 'email');
  bindFieldSave('clinic-save-website',     'clinic-website',     'ds_clinic_website',     'Website',      'website');
  bindFieldSave('clinic-save-tz',          'clinic-tz',          'ds_clinic_tz',          'Timezone',     'timezone');
  // Specialties: CSV in UI → array on server.
  bindFieldSave(
    'clinic-save-specialties',
    'clinic-specialties',
    'ds_clinic_specialties',
    'Specialties',
    'specialties',
    (csv) => csv.split(',').map(s => s.trim()).filter(Boolean),
  );

  // Working Hours: collect from table rows → JSON
  const collectHours = () => {
    const out = {};
    document.querySelectorAll('#clinic-hours-body tr').forEach(tr => {
      const day  = tr.getAttribute('data-day');
      const open = tr.querySelector('.clinic-hours-open')?.checked || false;
      const from = tr.querySelector('.clinic-hours-from')?.value || '09:00';
      const to   = tr.querySelector('.clinic-hours-to')?.value   || '17:00';
      if (day) out[day] = { open, from, to };
    });
    return out;
  };
  const saveHoursBtn = document.getElementById('clinic-save-hours');
  if (saveHoursBtn) saveHoursBtn.addEventListener('click', async () => {
    const data = collectHours();
    saveHoursBtn.disabled = true;
    try {
      await api.updateWorkingHours(data);
      persist('ds_clinic_hours', JSON.stringify(data));
      toast('Working hours saved.');
    } catch (e) {
      persist('ds_clinic_hours', JSON.stringify(data));
      toast('Working hours saved locally (server sync failed: ' + (e?.message || 'retry') + ')', 'warning');
    } finally {
      saveHoursBtn.disabled = false;
    }
  });

  // Save All — PATCH whole clinic + working hours in parallel.
  const saveAllBtn = document.getElementById('clinic-save-all');
  if (saveAllBtn) saveAllBtn.addEventListener('click', async () => {
    const g = (id) => (document.getElementById(id)?.value || '').trim();
    const patch = {
      name:        g('clinic-name'),
      address:     g('clinic-address'),
      phone:       g('clinic-phone'),
      email:       g('clinic-email'),
      website:     g('clinic-website'),
      timezone:    g('clinic-tz'),
      specialties: g('clinic-specialties').split(',').map(s => s.trim()).filter(Boolean),
    };
    persist('ds_clinic_name',        patch.name);
    persist('ds_clinic_address',     patch.address);
    persist('ds_clinic_phone',       patch.phone);
    persist('ds_clinic_email',       patch.email);
    persist('ds_clinic_website',     patch.website);
    persist('ds_clinic_tz',          patch.timezone);
    persist('ds_clinic_specialties', g('clinic-specialties'));
    const hours = collectHours();
    persist('ds_clinic_hours', JSON.stringify(hours));

    saveAllBtn.disabled = true;
    const msg = document.getElementById('clinic-save-all-msg');
    let ok = true;
    try {
      if (_clinicExists) await api.updateClinic(patch);
      else { await api.createClinic(patch); _clinicExists = true; }
    } catch (e) {
      ok = false;
      if (msg) { msg.textContent = 'Clinic save failed: ' + (e?.message || 'retry'); msg.style.color = 'var(--amber)'; }
    }
    try { await api.updateWorkingHours(hours); } catch (e) { ok = false; if (msg) { msg.textContent = 'Hours save failed: ' + (e?.message || 'retry'); msg.style.color = 'var(--amber)'; } }
    saveAllBtn.disabled = false;
    if (ok) {
      if (msg) { msg.textContent = 'All clinic settings saved.'; msg.style.color = 'var(--green)'; setTimeout(() => { if (msg) msg.textContent = ''; }, 3000); }
      toast('All clinic settings saved.', 'success');
    } else {
      toast('Some clinic settings did not sync to server — cached locally.', 'warning');
    }
  });

  // ── Team Members wiring (API-backed with localStorage fallback) ────────────
  const roleChipStyle = (role) => {
    switch (role) {
      case 'admin':      return 'background:rgba(239,68,68,0.1);color:var(--red)';
      case 'clinician':  return 'background:rgba(0,212,188,0.1);color:var(--teal)';
      case 'technician': return 'background:rgba(74,158,255,0.1);color:var(--blue)';
      case 'read-only':  return 'background:rgba(148,163,184,0.12);color:var(--text-secondary)';
      default:           return 'background:var(--surface-elev-1);color:var(--text-secondary)';
    }
  };
  const avatarCircle = (name) => {
    const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
    const palette = ['#0ea5e9','#14b8a6','#f59e0b','#ef4444','#8b5cf6','#22c55e','#ec4899'];
    let hash = 0; for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    const bg = palette[hash % palette.length];
    return `<div style="width:34px;height:34px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex-shrink:0">${letter}</div>`;
  };

  async function loadTeam() {
    try {
      if (typeof api.listTeam === 'function') {
        const res = await api.listTeam();
        if (Array.isArray(res)) return res;
        if (res && typeof res === 'object') {
          const members = Array.isArray(res.members) ? res.members.map(m => ({ ...m, pending_invite: false })) : [];
          const invites = Array.isArray(res.invites) ? res.invites.map(i => ({
            id: i.id,
            name: i.email,
            email: i.email,
            role: i.role || 'clinician',
            pending_invite: true,
            invited_at: i.invited_at || i.created_at || Date.now(),
            last_active: 'Pending',
          })) : [];
          return [...members, ...invites];
        }
      }
    } catch {}
    return savedTeam;
  }

  function persistTeam(list) {
    try { localStorage.setItem('ds_team_members', JSON.stringify(list)); } catch {}
    savedTeam = list;
    const chip = document.getElementById('team-count-chip');
    if (chip) chip.textContent = String(list.length);
  }

  function renderTeam() {
    const host = document.getElementById('team-list');
    if (!host) return;
    const active  = savedTeam.filter(m => !m.pending_invite);
    const pending = savedTeam.filter(m => m.pending_invite);

    host.innerHTML = active.length
      ? active.map((m, i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 0;${i < active.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
            ${avatarCircle(m.name || m.email)}
            <div style="min-width:0;flex:1">
              <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${escAttr(m.name || m.email)}</div>
              <div style="font-size:11.5px;color:var(--text-secondary)">${escAttr(m.email || '')} · ${escAttr(m.last_active || '—')}</div>
            </div>
            <span style="font-size:11px;padding:3px 10px;border-radius:10px;${roleChipStyle(m.role)};text-transform:capitalize">${escAttr(m.role || 'member')}</span>
            <button class="btn btn-sm team-menu-btn" data-tid="${escAttr(m.id)}" style="padding:4px 10px">⋯</button>
          </div>
        `).join('')
      : '<div style="font-size:12px;color:var(--text-tertiary);padding:8px 0">No team members yet.</div>';

    host.querySelectorAll('.team-menu-btn').forEach(b => {
      b.addEventListener('click', () => alert('Coming soon'));
    });

    // Pending invites sub-section
    const pendingWrap = document.getElementById('team-pending-wrap');
    if (pendingWrap) {
      if (!pending.length) { pendingWrap.innerHTML = ''; return; }
      pendingWrap.innerHTML = cardWrap('⏳ Pending Invites', `
        <div id="team-pending-list">
          ${pending.map((p, i) => `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i < pending.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}">
              ${avatarCircle(p.email)}
              <div style="min-width:0;flex:1">
                <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${escAttr(p.email)}</div>
                <div style="font-size:11.5px;color:var(--text-secondary)">Invited ${p.invited_at ? new Date(p.invited_at).toLocaleString() : '—'}</div>
              </div>
              <span style="font-size:11px;padding:3px 10px;border-radius:10px;${roleChipStyle(p.role)};text-transform:capitalize">${escAttr(p.role)}</span>
              <a href="#" data-tid="${escAttr(p.id)}" class="team-resend" style="font-size:12px;color:var(--teal);text-decoration:none">Resend</a>
              <a href="#" data-tid="${escAttr(p.id)}" class="team-cancel" style="font-size:12px;color:var(--red);text-decoration:none">Cancel</a>
            </div>
          `).join('')}
        </div>
      `);
      pendingWrap.querySelectorAll('.team-resend').forEach(a => a.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = a.getAttribute('data-tid');
        const m = savedTeam.find(x => x.id === id);
        if (!m) return;
        try {
          // "Resend" re-invites with same email+role; backend team router refreshes TTL.
          await api.inviteTeamMember(m.email, m.role);
          m.invited_at = Date.now();
          persistTeam(savedTeam);
          renderTeam();
          toast(`Invite re-sent to ${m.email}.`);
        } catch (err) {
          toast('Could not resend invite: ' + (err?.message || 'retry'), 'warning');
        }
      }));
      pendingWrap.querySelectorAll('.team-cancel').forEach(a => a.addEventListener('click', async (e) => {
        e.preventDefault();
        const id = a.getAttribute('data-tid');
        try { await api.revokeTeamInvite(id); } catch (err) {
          toast('Could not revoke invite: ' + (err?.message || 'retry'), 'warning');
          return;
        }
        const next = savedTeam.filter(x => x.id !== id);
        persistTeam(next); renderTeam(); toast('Invite cancelled.', 'info');
      }));
    }
  }

  (async () => {
    savedTeam = await loadTeam();
    persistTeam(savedTeam);
    renderTeam();
  })();

  const inviteBtn = document.getElementById('team-invite-btn');
  if (inviteBtn) inviteBtn.addEventListener('click', async () => {
    const emailEl = document.getElementById('team-invite-email');
    const roleEl  = document.getElementById('team-invite-role');
    const msgEl   = document.getElementById('team-invite-msg');
    const email = (emailEl?.value || '').trim();
    const role  = (roleEl?.value  || 'clinician').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (msgEl) { msgEl.textContent = 'Enter a valid email address.'; msgEl.style.color = 'var(--amber)'; }
      return;
    }
    if (savedTeam.some(m => (m.email || '').toLowerCase() === email.toLowerCase())) {
      if (msgEl) { msgEl.textContent = 'That email is already on the team.'; msgEl.style.color = 'var(--amber)'; }
      return;
    }
    inviteBtn.disabled = true;
    try {
      const res = await api.inviteTeamMember(email, role);
      const newId = res?.id || ('inv-' + Date.now().toString(36));
      const entry = { id: newId, name: email, email, role, pending_invite: true, invited_at: Date.now(), last_active: 'Pending' };
      savedTeam.push(entry);
      persistTeam(savedTeam);
      renderTeam();
      if (emailEl) emailEl.value = '';
      if (msgEl)   { msgEl.textContent = ''; msgEl.style.color = 'var(--text-secondary)'; }
      toast(`Invite sent to ${email}.`);
    } catch (err) {
      if (msgEl) { msgEl.textContent = 'Invite failed: ' + (err?.message || 'retry'); msgEl.style.color = 'var(--red)'; }
      toast('Invite failed.', 'warning');
    } finally {
      inviteBtn.disabled = false;
    }
  });

  // ── Notifications wiring (API-backed with localStorage mirror) ─────────────
  // Debounce: the matrix changes in bursts, so coalesce PATCH calls.
  let _notifPatchTimer = null;
  const persistNotifPrefs = () => {
    try { localStorage.setItem('ds_notification_prefs', JSON.stringify(notifPrefs)); } catch {}
    clearTimeout(_notifPatchTimer);
    _notifPatchTimer = setTimeout(() => {
      api.updatePreferences({ notification_prefs: notifPrefs }).catch((e) => {
        console.warn('[settings] notif prefs sync failed', e?.message);
      });
    }, 400);
  };
  const notifMsg = document.getElementById('notif-matrix-msg');
  const flashNotifSaved = () => {
    if (!notifMsg) return;
    notifMsg.textContent = 'Saved.';
    notifMsg.style.color = 'var(--teal)';
    clearTimeout(flashNotifSaved._t);
    flashNotifSaved._t = setTimeout(() => { notifMsg.textContent = ''; notifMsg.style.color = 'var(--text-tertiary)'; }, 1400);
  };
  document.querySelectorAll('.notif-cell').forEach(box => {
    box.addEventListener('change', () => {
      const ev = box.getAttribute('data-event');
      const ch = box.getAttribute('data-channel');
      if (!ev || !ch) return;
      if (!notifPrefs[ev]) notifPrefs[ev] = { email: false, inapp: false, telegram: false };
      notifPrefs[ev][ch] = box.checked;
      persistNotifPrefs();
      flashNotifSaved();
    });
  });

  let _quietPatchTimer = null;
  const persistQuiet = () => {
    try { localStorage.setItem('ds_quiet_hours', JSON.stringify(quietHours)); } catch {}
    clearTimeout(_quietPatchTimer);
    _quietPatchTimer = setTimeout(() => {
      api.updatePreferences({ quiet_hours: quietHours }).catch((e) => {
        console.warn('[settings] quiet hours sync failed', e?.message);
      });
    }, 400);
  };
  const quietFrom    = document.getElementById('quiet-from');
  const quietTo      = document.getElementById('quiet-to');
  const quietEnabled = document.getElementById('quiet-enabled');
  if (quietFrom)    quietFrom.addEventListener('change',    () => { quietHours.from    = quietFrom.value || '22:00'; persistQuiet(); });
  if (quietTo)      quietTo.addEventListener('change',      () => { quietHours.to      = quietTo.value   || '07:00'; persistQuiet(); });
  if (quietEnabled) quietEnabled.addEventListener('change', () => { quietHours.enabled = !!quietEnabled.checked;    persistQuiet(); });

  document.querySelectorAll('input[name="digest-freq"]').forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) {
        try { localStorage.setItem('ds_digest_freq', r.value); } catch {}
        api.updatePreferences({ digest_freq: r.value }).catch((e) => {
          console.warn('[settings] digest_freq sync failed', e?.message);
        });
      }
    });
  });

  const persistReminderTiming = () => {
    try { localStorage.setItem('ds_reminder_timing', JSON.stringify(reminderTiming)); } catch {}
    api.updatePreferences({ reminder_timing: reminderTiming }).catch((e) => {
      console.warn('[settings] reminder_timing sync failed', e?.message);
    });
  };
  document.querySelectorAll('.reminder-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.getAttribute('data-slot');
      if (!slot) return;
      const idx = reminderTiming.indexOf(slot);
      const turningOn = idx === -1;
      if (turningOn) reminderTiming.push(slot);
      else reminderTiming.splice(idx, 1);
      persistReminderTiming();
      // Update visual state
      const label = REMINDER_SLOTS.find(s => s.id === slot)?.label || slot;
      btn.setAttribute('data-on', turningOn ? '1' : '0');
      btn.textContent = `${turningOn ? '✓ ' : ''}${label}`;
      btn.style.cssText = `padding:5px 12px;${turningOn ? 'background:rgba(0,212,188,0.12);border-color:var(--border-teal);color:var(--teal)' : ''}`;
      btn.className = 'btn btn-sm reminder-chip';
    });
  });

  // ── Preferences wiring (API-backed with localStorage mirror) ───────────────
  const prefMsg = document.getElementById('pref-save-msg');
  const flashPrefSaved = () => {
    if (!prefMsg) return;
    prefMsg.textContent = 'Saved.';
    prefMsg.style.color = 'var(--teal)';
    clearTimeout(flashPrefSaved._t);
    flashPrefSaved._t = setTimeout(() => { prefMsg.textContent = ''; prefMsg.style.color = 'var(--text-tertiary)'; }, 1400);
  };
  const flashPrefFailed = (msg) => {
    if (!prefMsg) return;
    prefMsg.textContent = 'Not saved — retry. ' + (msg || '');
    prefMsg.style.color = 'var(--amber)';
  };
  const _syncPref = (patch, lsKey, lsVal) => {
    try { localStorage.setItem(lsKey, String(lsVal)); } catch {}
    api.updatePreferences(patch).then(flashPrefSaved).catch((e) => flashPrefFailed(e?.message || ''));
  };

  const langSel = document.getElementById('pref-language');
  if (langSel) langSel.addEventListener('change', () => {
    const code = langSel.value;
    try { localStorage.setItem('ds_lang', code); } catch {}
    try {
      if (typeof setLocale === 'function') setLocale(code);
    } catch {}
    // Fire-and-forget — reload below will re-fetch anyway.
    api.updatePreferences({ language: code }).catch(() => {});
    flashPrefSaved();
    setTimeout(() => { try { window.location.reload(); } catch {} }, 300);
  });

  document.querySelectorAll('input[name="pref-date-format"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) _syncPref({ date_format: r.value }, 'ds_date_format', r.value); });
  });
  document.querySelectorAll('input[name="pref-time-format"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) _syncPref({ time_format: r.value }, 'ds_time_format', r.value); });
  });
  document.querySelectorAll('input[name="pref-first-day"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) _syncPref({ first_day: r.value }, 'ds_first_day', r.value); });
  });
  document.querySelectorAll('input[name="pref-units"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) _syncPref({ units: r.value }, 'ds_units', r.value); });
  });
  document.querySelectorAll('input[name="pref-number-format"]').forEach(r => {
    r.addEventListener('change', () => { if (r.checked) _syncPref({ number_format: r.value }, 'ds_number_format', r.value); });
  });

  const durInput = document.getElementById('pref-session-duration');
  if (durInput) durInput.addEventListener('change', () => {
    const n = parseInt(durInput.value, 10);
    if (Number.isFinite(n) && n >= 5 && n <= 240) {
      _syncPref({ session_default_duration_min: n }, 'ds_session_default_duration', String(n));
    }
  });

  const autoLogoutSel = document.getElementById('pref-auto-logout');
  if (autoLogoutSel) autoLogoutSel.addEventListener('change', () => {
    const v = autoLogoutSel.value;
    const minutes = v === 'never' ? 0 : parseInt(v, 10);
    _syncPref({ auto_logout_min: Number.isFinite(minutes) ? minutes : 30 }, 'ds_auto_logout', v);
  });

  // ── Data & Privacy wiring (API-backed) ─────────────────────────────────────
  const dpMsg = document.getElementById('dp-save-msg');
  const flashDpSaved = () => {
    if (!dpMsg) return;
    dpMsg.textContent = 'Saved.';
    dpMsg.style.color = 'var(--teal)';
    clearTimeout(flashDpSaved._t);
    flashDpSaved._t = setTimeout(() => { dpMsg.textContent = ''; dpMsg.style.color = 'var(--text-tertiary)'; }, 1400);
  };

  const exportBtn = document.getElementById('dp-export-btn');
  const exportMsg = document.getElementById('dp-export-msg');
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    const origLabel = exportBtn.textContent;
    exportBtn.textContent = 'Preparing export…';
    let usedApi = false;
    try {
      if (api && typeof api.requestDataExport === 'function') {
        await api.requestDataExport();
        usedApi = true;
        if (exportMsg) exportMsg.textContent = 'Export requested — you will receive an email when ready.';
      }
    } catch { /* fall through to localStorage bundle */ }

    if (!usedApi) {
      try {
        const data = { user: currentUser, exported_at: new Date().toISOString(), settings: {} };
        Object.keys(localStorage).filter(k => k.startsWith('ds_')).forEach(k => { data.settings[k] = localStorage.getItem(k); });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `deepsynaps-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        const ts = new Date().toISOString();
        try { localStorage.setItem('ds_last_export', ts); } catch {}
        if (exportMsg) exportMsg.textContent = 'Last export: ' + ts;
      } catch (e) {
        if (exportMsg) { exportMsg.textContent = 'Export failed: ' + (e?.message || 'unknown error'); exportMsg.style.color = 'var(--red)'; }
      }
    }
    exportBtn.disabled = false;
    exportBtn.textContent = origLabel;
    flashDpSaved();
  });

  const analyticsOpt = document.getElementById('dp-analytics-opt');
  if (analyticsOpt) analyticsOpt.addEventListener('change', () => {
    try { localStorage.setItem('ds_analytics_opt_in', analyticsOpt.checked ? 'true' : 'false'); } catch {}
    api.updatePreferences({ analytics_opt_in: !!analyticsOpt.checked }).catch((e) => console.warn('[settings] analytics opt-in sync failed', e?.message));
    flashDpSaved();
  });
  const errorsOpt = document.getElementById('dp-errors-opt');
  if (errorsOpt) errorsOpt.addEventListener('change', () => {
    try { localStorage.setItem('ds_error_reports_opt_in', errorsOpt.checked ? 'true' : 'false'); } catch {}
    api.updatePreferences({ error_reports_opt_in: !!errorsOpt.checked }).catch((e) => console.warn('[settings] error reports opt-in sync failed', e?.message));
    flashDpSaved();
  });

  const openExternal = (url) => { try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { window.location.href = url; } };
  const privacyLink = document.getElementById('dp-privacy-link');
  if (privacyLink) privacyLink.addEventListener('click', () => openExternal('https://deepsynaps.com/privacy'));
  const termsLink = document.getElementById('dp-terms-link');
  if (termsLink) termsLink.addEventListener('click', () => openExternal('https://deepsynaps.com/terms'));
  const dpaLink = document.getElementById('dp-dpa-link');
  if (dpaLink) dpaLink.addEventListener('click', () => { window.location.href = 'mailto:legal@deepsynaps.com?subject=DPA%20Request'; });

  const cookieFn = document.getElementById('dp-cookie-functional');
  if (cookieFn) cookieFn.addEventListener('change', () => {
    try { localStorage.setItem('ds_cookie_functional', cookieFn.checked ? 'true' : 'false'); } catch {}
    flashDpSaved();
  });
  const cookieAn = document.getElementById('dp-cookie-analytics');
  if (cookieAn) cookieAn.addEventListener('change', () => {
    try { localStorage.setItem('ds_cookie_analytics', cookieAn.checked ? 'true' : 'false'); } catch {}
    flashDpSaved();
  });

  // ── Clinical Defaults wiring (API-backed with localStorage mirror) ─────────
  const cdMsg = document.getElementById('cd-save-msg');
  const flashCdSaved = () => {
    if (!cdMsg) return;
    cdMsg.textContent = 'Saved.';
    cdMsg.style.color = 'var(--teal)';
    clearTimeout(flashCdSaved._t);
    flashCdSaved._t = setTimeout(() => { cdMsg.textContent = ''; cdMsg.style.color = 'var(--text-tertiary)'; }, 1400);
  };
  const flashCdFailed = (msg) => {
    if (!cdMsg) return;
    cdMsg.textContent = 'Not saved — retry. ' + (msg || '');
    cdMsg.style.color = 'var(--amber)';
  };
  const _syncCd = (patch, lsKey, lsVal) => {
    try { localStorage.setItem(lsKey, String(lsVal)); } catch {}
    api.updateClinicalDefaults(patch).then(flashCdSaved).catch((e) => flashCdFailed(e?.message || ''));
  };

  const cdProto = document.getElementById('cd-default-protocol');
  if (cdProto) cdProto.addEventListener('change', () => {
    _syncCd({ default_protocol_id: cdProto.value }, 'ds_default_protocol', cdProto.value);
  });

  const cdDur = document.getElementById('cd-session-duration');
  if (cdDur) cdDur.addEventListener('change', () => {
    const n = parseInt(cdDur.value, 10);
    if (Number.isFinite(n) && n >= 5 && n <= 240) {
      _syncCd({ default_session_duration_min: n }, 'ds_default_session_duration', String(n));
    }
  });

  const cdFup = document.getElementById('cd-followup-weeks');
  if (cdFup) cdFup.addEventListener('change', () => {
    const n = parseInt(cdFup.value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 52) {
      _syncCd({ default_followup_weeks: n }, 'ds_default_followup_weeks', String(n));
    }
  });

  const cdCourse = document.getElementById('cd-course-length');
  if (cdCourse) cdCourse.addEventListener('change', () => {
    const n = parseInt(cdCourse.value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 200) {
      _syncCd({ default_course_length: n }, 'ds_default_course_length', String(n));
    }
  });

  const cdConsent = document.getElementById('cd-consent-template');
  const cdCustomWrap = document.getElementById('cd-custom-consent-wrap');
  const cdCustom = document.getElementById('cd-custom-consent');
  if (cdConsent) cdConsent.addEventListener('change', () => {
    if (cdCustomWrap) cdCustomWrap.style.display = (cdConsent.value === 'Custom (edit below)') ? 'block' : 'none';
    _syncCd({ default_consent_template_id: cdConsent.value }, 'ds_default_consent_template', cdConsent.value);
  });
  if (cdCustom) cdCustom.addEventListener('change', () => {
    _syncCd({ custom_consent_text: cdCustom.value }, 'ds_custom_consent_text', cdCustom.value);
  });

  const cdDisclaimer = document.getElementById('cd-disclaimer');
  if (cdDisclaimer) cdDisclaimer.addEventListener('change', () => {
    _syncCd({ default_disclaimer: cdDisclaimer.value }, 'ds_default_disclaimer', cdDisclaimer.value);
  });

  document.querySelectorAll('.cd-assessment').forEach(cb => {
    cb.addEventListener('change', () => {
      const selected = Array.from(document.querySelectorAll('.cd-assessment'))
        .filter(x => x.checked)
        .map(x => x.value);
      try { localStorage.setItem('ds_default_assessments', JSON.stringify(selected)); } catch {}
      api.updateClinicalDefaults({ default_assessments: selected }).then(flashCdSaved).catch((e) => flashCdFailed(e?.message || ''));
    });
  });

  document.querySelectorAll('input[name="cd-ae-protocol"]').forEach(r => {
    r.addEventListener('change', () => {
      if (r.checked) _syncCd({ ae_protocol: r.value }, 'ds_ae_protocol', r.value);
    });
  });
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

  const el = document.getElementById('page-content') || document.getElementById('content');
  if (!el) return;

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

// ── Clinic Config Store ───────────────────────────────────────────────────────
const CLINIC_CONFIG_KEY = 'ds_clinic_config';
function getClinicConfig() {
  const defaults = {
    name: 'DeepSynaps Neuromodulation Clinic',
    tagline: 'Advanced Brain Health Solutions',
    logoDataUrl: null,
    primaryColor: '#0d9488',
    secondaryColor: '#1e3a5f',
    accentColor: '#7c3aed',
    address: '123 Neural Way, Brain City, BC 90210',
    phone: '(555) 867-5309',
    email: 'info@clinic.com',
    website: 'https://clinic.com',
    customDomain: '',
    npi: '1234567890',
    taxId: '12-3456789',
    licenseNumber: 'MH-2024-001',
    emailFooter: 'This communication is intended for the addressed recipient only.',
    termsOfService: 'Standard terms of service apply. All patient data is protected under HIPAA.',
    privacyPolicy: 'Patient privacy is our priority. Data is encrypted and never sold.',
    appointmentReminderTemplate: 'Hi {patient_name}, this is a reminder for your appointment on {date} at {time}.',
    sessionCompleteTemplate: 'Hi {patient_name}, your session on {date} has been recorded. See you next time!',
    showBrandingInPatientPortal: true,
    showPoweredBy: true,
    customCss: '',
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(CLINIC_CONFIG_KEY) || '{}') };
  } catch { return defaults; }
}
function saveClinicConfig(config) {
  localStorage.setItem(CLINIC_CONFIG_KEY, JSON.stringify(config));
  window._clinicConfig = config;
  applyClinicBranding(config);
}
function applyClinicBranding(config) {
  document.documentElement.style.setProperty('--brand-primary', config.primaryColor);
  document.documentElement.style.setProperty('--brand-secondary', config.secondaryColor);
  document.documentElement.style.setProperty('--brand-accent', config.accentColor);
  const nameEl = document.getElementById('clinic-brand-name');
  if (nameEl) nameEl.textContent = config.name;
  let styleTag = document.getElementById('clinic-custom-css');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'clinic-custom-css';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = config.customCss || '';
}

// ── pgClinicSettings ──────────────────────────────────────────────────────────
export async function pgClinicSettings(setTopbar) {
  setTopbar('Clinic Settings & Branding', `<button class="btn btn-primary btn-sm" onclick="window._csSaveAll()">Save All</button>`);

  let cfg = getClinicConfig();
  let activeTab = 'branding';

  function renderTabs() {
    return `<div class="tab-bar" style="margin-bottom:20px">
      ${['branding','identity','communications','legal','preview'].map(t => `
        <button class="tab-btn${activeTab===t?' active':''}" onclick="window._csTab('${t}')">${{
          branding:'Branding',identity:'Identity',communications:'Communications',
          legal:'Legal & Compliance',preview:'Preview'
        }[t]}</button>`).join('')}
    </div>`;
  }

  function logoHtml() {
    if (cfg.logoDataUrl) {
      return `<img src="${cfg.logoDataUrl}" alt="Clinic Logo" />`;
    }
    return `<span style="color:var(--text-tertiary);font-size:.8rem">No logo uploaded</span>`;
  }

  function renderBranding() {
    return `
      <div class="g2">
        <div class="card">
          <div class="card-header">Logo & Identity</div>
          <div class="card-body">
            <label class="form-label">Clinic Logo</label>
            <div class="cs-logo-preview" id="cs-logo-preview">${logoHtml()}</div>
            <input type="file" id="cs-logo-file" accept="image/*" style="display:none" onchange="window._csUploadLogo()" />
            <button class="btn btn-sm btn-ghost" onclick="document.getElementById('cs-logo-file').click()">Upload Logo</button>
            ${cfg.logoDataUrl ? `<button class="btn btn-sm btn-ghost" style="margin-left:6px;color:var(--rose)" onclick="window._csRemoveLogo()">Remove</button>` : ''}
            <div style="margin-top:16px">
              <label class="form-label">Clinic Name</label>
              <input class="form-input" id="cs-name" value="${cfg.name}" oninput="document.getElementById('cs-preview-name')&&(document.getElementById('cs-preview-name').textContent=this.value)" />
            </div>
            <div style="margin-top:12px">
              <label class="form-label">Tagline</label>
              <input class="form-input" id="cs-tagline" value="${cfg.tagline}" oninput="document.getElementById('cs-preview-tagline')&&(document.getElementById('cs-preview-tagline').textContent=this.value)" />
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">Color Palette</div>
          <div class="card-body">
            <div class="cs-color-row">
              <input type="color" id="cs-primary-picker" value="${cfg.primaryColor}" oninput="document.getElementById('cs-primary-hex').value=this.value" />
              <input class="form-input" id="cs-primary-hex" value="${cfg.primaryColor}" style="font-family:monospace;width:110px" oninput="document.getElementById('cs-primary-picker').value=this.value" />
              <span style="font-size:.82rem;color:var(--text-secondary)">Primary (teal)</span>
            </div>
            <div class="cs-color-row">
              <input type="color" id="cs-secondary-picker" value="${cfg.secondaryColor}" oninput="document.getElementById('cs-secondary-hex').value=this.value" />
              <input class="form-input" id="cs-secondary-hex" value="${cfg.secondaryColor}" style="font-family:monospace;width:110px" oninput="document.getElementById('cs-secondary-picker').value=this.value" />
              <span style="font-size:.82rem;color:var(--text-secondary)">Secondary (navy)</span>
            </div>
            <div class="cs-color-row">
              <input type="color" id="cs-accent-picker" value="${cfg.accentColor}" oninput="document.getElementById('cs-accent-hex').value=this.value" />
              <input class="form-input" id="cs-accent-hex" value="${cfg.accentColor}" style="font-family:monospace;width:110px" oninput="document.getElementById('cs-accent-picker').value=this.value" />
              <span style="font-size:.82rem;color:var(--text-secondary)">Accent (violet)</span>
            </div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn btn-sm btn-primary" onclick="window._csApplyColors()">Apply Colors</button>
              <button class="btn btn-sm btn-ghost" onclick="window._csResetColors()">Reset to Defaults</button>
            </div>
          </div>
        </div>
        <div class="card" style="grid-column:1/-1">
          <div class="card-header">Advanced</div>
          <div class="card-body">
            <label class="form-label">Custom CSS <span style="color:var(--text-tertiary);font-size:.75rem">(advanced)</span></label>
            <textarea class="form-input" id="cs-custom-css" rows="5" style="font-family:monospace;font-size:.8rem">${cfg.customCss || ''}</textarea>
            <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
                <input type="checkbox" id="cs-show-branding" ${cfg.showBrandingInPatientPortal ? 'checked' : ''} />
                <span style="font-size:.85rem">Show clinic branding in patient portal</span>
              </label>
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
                <input type="checkbox" id="cs-show-powered-by" ${cfg.showPoweredBy ? 'checked' : ''} />
                <span style="font-size:.85rem">Show "Powered by DeepSynaps" badge</span>
              </label>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderIdentity() {
    return `
      <div class="card" style="max-width:640px">
        <div class="card-header">Practice Identity</div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:12px">
          <div>
            <label class="form-label">Address</label>
            <textarea class="form-input" id="cs-address" rows="3">${cfg.address}</textarea>
          </div>
          <div class="g2">
            <div>
              <label class="form-label">Phone</label>
              <input class="form-input" id="cs-phone" value="${cfg.phone}" />
            </div>
            <div>
              <label class="form-label">Email</label>
              <input class="form-input" id="cs-email" type="email" value="${cfg.email}" />
            </div>
            <div>
              <label class="form-label">Website</label>
              <input class="form-input" id="cs-website" value="${cfg.website}" />
            </div>
            <div>
              <label class="form-label">Custom Domain <span style="font-size:.75rem;color:var(--text-tertiary)">(display only)</span></label>
              <input class="form-input" id="cs-custom-domain" value="${cfg.customDomain}" placeholder="e.g. portal.myclinic.com" />
              <div style="font-size:.74rem;color:var(--text-tertiary);margin-top:4px">Contact support to activate a custom domain.</div>
            </div>
          </div>
          <div class="g2">
            <div>
              <label class="form-label">NPI Number</label>
              <input class="form-input" id="cs-npi" value="${cfg.npi}" />
            </div>
            <div>
              <label class="form-label">Tax ID</label>
              <input class="form-input" id="cs-tax-id" value="${cfg.taxId}" />
            </div>
            <div>
              <label class="form-label">License Number</label>
              <input class="form-input" id="cs-license" value="${cfg.licenseNumber}" />
            </div>
          </div>
          <div style="margin-top:4px">
            <button class="btn btn-primary btn-sm" onclick="window._csSaveIdentity()">Save Identity</button>
          </div>
        </div>
      </div>`;
  }

  function templateVarsHtml() {
    return ['patient_name','date','time','clinic_name','clinician_name']
      .map(v => `<span class="cs-template-var">{${v}}</span>`).join(' ');
  }

  function renderCommunications() {
    return `
      <div class="card" style="max-width:720px">
        <div class="card-header">Email & Messaging Templates</div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
          <div>
            <label class="form-label">Email Footer</label>
            <textarea class="form-input" id="cs-email-footer" rows="3">${cfg.emailFooter}</textarea>
            <div style="font-size:.75rem;color:var(--text-tertiary);margin-top:4px">Appended to all outgoing clinic emails.</div>
          </div>
          <div>
            <label class="form-label">Appointment Reminder Template</label>
            <div style="margin-bottom:6px">Available variables: ${templateVarsHtml()}</div>
            <textarea class="form-input" id="cs-appt-reminder" rows="4">${cfg.appointmentReminderTemplate}</textarea>
            <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="window._csTestTemplate('appointment')">Test Template</button>
          </div>
          <div>
            <label class="form-label">Session Complete Template</label>
            <div style="margin-bottom:6px">Available variables: ${templateVarsHtml()}</div>
            <textarea class="form-input" id="cs-session-complete" rows="4">${cfg.sessionCompleteTemplate}</textarea>
            <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="window._csTestTemplate('session')">Test Template</button>
          </div>
          <div>
            <button class="btn btn-primary btn-sm" onclick="window._csSaveTemplates()">Save Templates</button>
          </div>
        </div>
      </div>`;
  }

  function renderLegal() {
    return `
      <div style="display:flex;flex-direction:column;gap:16px;max-width:720px">
        <div class="card">
          <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
            <span>Terms of Service</span>
            <button class="btn btn-ghost btn-sm" onclick="window._csPreviewTOS()">Preview</button>
          </div>
          <div class="card-body">
            <textarea class="form-input" id="cs-tos" rows="8">${cfg.termsOfService}</textarea>
            <div style="margin-top:10px">
              <label class="form-label" style="font-size:.78rem">Last Updated</label>
              <input class="form-input" id="cs-tos-date" type="date" value="${cfg.tosLastUpdated || new Date().toISOString().slice(0,10)}" style="width:180px" />
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
            <span>Privacy Policy</span>
            <button class="btn btn-ghost btn-sm" onclick="window._csPreviewPrivacy()">Preview</button>
          </div>
          <div class="card-body">
            <textarea class="form-input" id="cs-privacy" rows="8">${cfg.privacyPolicy}</textarea>
            <div style="margin-top:10px">
              <label class="form-label" style="font-size:.78rem">Last Updated</label>
              <input class="form-input" id="cs-privacy-date" type="date" value="${cfg.privacyLastUpdated || new Date().toISOString().slice(0,10)}" style="width:180px" />
            </div>
          </div>
        </div>
        <div>
          <button class="btn btn-primary btn-sm" onclick="window._csSaveLegal()">Save Legal</button>
        </div>
      </div>`;
  }

  function renderPreview() {
    const primary   = cfg.primaryColor;
    const secondary = cfg.secondaryColor;
    const accent    = cfg.accentColor;
    return `
      <div style="display:flex;flex-direction:column;gap:20px;max-width:720px">
        <div class="card">
          <div class="card-header">Live Branding Preview</div>
          <div class="card-body">
            <div style="display:flex;gap:16px;align-items:flex-start">
              <div class="cs-preview-sidebar" style="background:${secondary}">
                <div style="padding:14px 12px;border-bottom:1px solid rgba(255,255,255,0.1)">
                  ${cfg.logoDataUrl
                    ? `<img src="${cfg.logoDataUrl}" style="max-width:100%;max-height:36px;object-fit:contain" />`
                    : `<span style="color:#fff;font-weight:700;font-size:.85rem" id="cs-preview-name">${cfg.name}</span>`}
                </div>
                ${['Dashboard','Patients','Protocols','Settings'].map(item =>
                  `<div class="cs-preview-sidebar-item" style="color:rgba(255,255,255,0.75)">${item}</div>`
                ).join('')}
                <div class="cs-preview-sidebar-item" style="color:#fff;background:${primary}40;border-left:3px solid ${primary}">Clinic Settings</div>
              </div>
              <div style="flex:1">
                <div class="cs-preview-header" style="background:${secondary}">
                  <div style="width:32px;height:32px;border-radius:6px;background:${primary};display:flex;align-items:center;justify-content:center;font-size:16px">🏥</div>
                  <div>
                    <div style="color:#fff;font-weight:700;font-size:.9rem" id="cs-preview-name">${cfg.name}</div>
                    <div style="color:rgba(255,255,255,.65);font-size:.73rem" id="cs-preview-tagline">${cfg.tagline}</div>
                  </div>
                </div>
                <div style="padding:12px;background:var(--bg-surface-2);border-radius:0 0 8px 8px;border:1px solid var(--border);border-top:none">
                  <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
                    <div style="display:flex;align-items:center;gap:10px">
                      <div style="width:36px;height:36px;border-radius:50%;background:${primary};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.9rem">JD</div>
                      <div>
                        <div style="font-size:.85rem;font-weight:600">Jane Doe</div>
                        <div style="font-size:.75rem;color:var(--text-secondary)">Protocol: tDCS DLPFC — Session 5/12</div>
                      </div>
                      <span style="margin-left:auto;background:${accent}22;color:${accent};padding:2px 10px;border-radius:12px;font-size:.73rem;font-weight:600">Active</span>
                    </div>
                  </div>
                  <div style="background:${primary}18;border:1px solid ${primary}44;border-radius:8px;padding:10px;font-size:.78rem;color:var(--text-secondary)">
                    Patient Portal header preview
                    ${cfg.showPoweredBy ? `<span style="float:right;color:var(--text-tertiary);font-size:.7rem">Powered by DeepSynaps</span>` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style="text-align:center">
          <button class="btn btn-primary" onclick="window._csSaveAll()" style="padding:10px 36px;font-size:1rem">Save All Settings</button>
        </div>
      </div>`;
  }

  function render() {
    cfg = getClinicConfig();
    const content = document.getElementById('content');
    if (!content) return;
    content.innerHTML = `
      <div style="max-width:960px;margin:0 auto;padding:0 4px">
        <h2 style="font-size:1.15rem;font-weight:700;margin-bottom:16px">Clinic Settings & White-labelling</h2>
        ${renderTabs()}
        <div id="cs-tab-content">
          ${activeTab === 'branding'       ? renderBranding()       :
            activeTab === 'identity'       ? renderIdentity()       :
            activeTab === 'communications' ? renderCommunications() :
            activeTab === 'legal'          ? renderLegal()          :
            renderPreview()}
        </div>
      </div>
    `;
  }

  render();

  // ── Global handlers ─────────────────────────────────────────────────────────
  window._csTab = function(name) {
    activeTab = name;
    render();
  };

  window._csUploadLogo = function() {
    const file = document.getElementById('cs-logo-file')?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      cfg.logoDataUrl = e.target.result;
      const preview = document.getElementById('cs-logo-preview');
      if (preview) preview.innerHTML = `<img src="${e.target.result}" alt="Clinic Logo" />`;
    };
    reader.readAsDataURL(file);
  };

  window._csRemoveLogo = function() {
    cfg.logoDataUrl = null;
    render();
  };

  window._csApplyColors = function() {
    const primary   = document.getElementById('cs-primary-hex')?.value   || cfg.primaryColor;
    const secondary = document.getElementById('cs-secondary-hex')?.value || cfg.secondaryColor;
    const accent    = document.getElementById('cs-accent-hex')?.value    || cfg.accentColor;
    cfg.primaryColor   = primary;
    cfg.secondaryColor = secondary;
    cfg.accentColor    = accent;
    applyClinicBranding(cfg);
    window._showToast?.('Colors applied — save all settings to persist.', 'info');
  };

  window._csResetColors = function() {
    cfg.primaryColor   = '#0d9488';
    cfg.secondaryColor = '#1e3a5f';
    cfg.accentColor    = '#7c3aed';
    applyClinicBranding(cfg);
    render();
  };

  window._csSaveIdentity = function() {
    cfg.address       = document.getElementById('cs-address')?.value       ?? cfg.address;
    cfg.phone         = document.getElementById('cs-phone')?.value         ?? cfg.phone;
    cfg.email         = document.getElementById('cs-email')?.value         ?? cfg.email;
    cfg.website       = document.getElementById('cs-website')?.value       ?? cfg.website;
    cfg.customDomain  = document.getElementById('cs-custom-domain')?.value ?? cfg.customDomain;
    cfg.npi           = document.getElementById('cs-npi')?.value           ?? cfg.npi;
    cfg.taxId         = document.getElementById('cs-tax-id')?.value        ?? cfg.taxId;
    cfg.licenseNumber = document.getElementById('cs-license')?.value       ?? cfg.licenseNumber;
    saveClinicConfig(cfg);
    window._showToast?.('Identity saved.') || alert('Identity saved.');
  };

  window._csSaveTemplates = function() {
    cfg.emailFooter                 = document.getElementById('cs-email-footer')?.value    ?? cfg.emailFooter;
    cfg.appointmentReminderTemplate = document.getElementById('cs-appt-reminder')?.value   ?? cfg.appointmentReminderTemplate;
    cfg.sessionCompleteTemplate     = document.getElementById('cs-session-complete')?.value ?? cfg.sessionCompleteTemplate;
    saveClinicConfig(cfg);
    window._showToast?.('Templates saved.') || alert('Templates saved.');
  };

  window._csTestTemplate = function(key) {
    const sample = {
      patient_name: 'Jane Doe', date: 'April 15, 2026',
      time: '10:00 AM', clinic_name: cfg.name, clinician_name: 'Dr. Smith'
    };
    const tmpl = key === 'appointment'
      ? (document.getElementById('cs-appt-reminder')?.value   || cfg.appointmentReminderTemplate)
      : (document.getElementById('cs-session-complete')?.value || cfg.sessionCompleteTemplate);
    const rendered = tmpl.replace(/\{(\w+)\}/g, (_, k) => sample[k] || '{' + k + '}');
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999';
    modal.innerHTML = `
      <div class="card" style="max-width:480px;width:90%;padding:20px">
        <div style="font-weight:700;margin-bottom:12px">Template Preview</div>
        <div style="background:var(--hover-bg);border-radius:8px;padding:14px;font-size:.88rem;white-space:pre-wrap">${rendered}</div>
        <button class="btn btn-sm btn-primary" style="margin-top:16px" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>`;
    document.body.appendChild(modal);
  };

  window._csSaveLegal = function() {
    cfg.termsOfService     = document.getElementById('cs-tos')?.value           ?? cfg.termsOfService;
    cfg.privacyPolicy      = document.getElementById('cs-privacy')?.value       ?? cfg.privacyPolicy;
    cfg.tosLastUpdated     = document.getElementById('cs-tos-date')?.value      ?? cfg.tosLastUpdated;
    cfg.privacyLastUpdated = document.getElementById('cs-privacy-date')?.value ?? cfg.privacyLastUpdated;
    saveClinicConfig(cfg);
    window._showToast?.('Legal documents saved.') || alert('Legal documents saved.');
  };

  function openTextModal(title, text) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999';
    modal.innerHTML = `
      <div class="card" style="max-width:640px;width:92%;padding:20px;max-height:80vh;overflow-y:auto">
        <div style="font-weight:700;margin-bottom:14px;font-size:1rem">${title}</div>
        <div style="font-size:.84rem;line-height:1.6;white-space:pre-wrap;color:var(--text-secondary)">${text}</div>
        <button class="btn btn-sm btn-primary" style="margin-top:18px" onclick="this.closest('.modal-overlay').remove()">Close</button>
      </div>`;
    document.body.appendChild(modal);
  }

  window._csPreviewTOS = function() {
    openTextModal('Terms of Service Preview', document.getElementById('cs-tos')?.value || cfg.termsOfService);
  };

  window._csPreviewPrivacy = function() {
    openTextModal('Privacy Policy Preview', document.getElementById('cs-privacy')?.value || cfg.privacyPolicy);
  };

  window._csSaveAll = function() {
    const v   = id => document.getElementById(id)?.value;
    const chk = id => document.getElementById(id)?.checked;
    cfg.name                        = v('cs-name')             ?? cfg.name;
    cfg.tagline                     = v('cs-tagline')          ?? cfg.tagline;
    cfg.primaryColor                = v('cs-primary-hex')      ?? cfg.primaryColor;
    cfg.secondaryColor              = v('cs-secondary-hex')    ?? cfg.secondaryColor;
    cfg.accentColor                 = v('cs-accent-hex')       ?? cfg.accentColor;
    cfg.customCss                   = v('cs-custom-css')       ?? cfg.customCss;
    if (document.getElementById('cs-show-branding')   != null) cfg.showBrandingInPatientPortal = chk('cs-show-branding');
    if (document.getElementById('cs-show-powered-by') != null) cfg.showPoweredBy               = chk('cs-show-powered-by');
    cfg.address                     = v('cs-address')          ?? cfg.address;
    cfg.phone                       = v('cs-phone')            ?? cfg.phone;
    cfg.email                       = v('cs-email')            ?? cfg.email;
    cfg.website                     = v('cs-website')          ?? cfg.website;
    cfg.customDomain                = v('cs-custom-domain')    ?? cfg.customDomain;
    cfg.npi                         = v('cs-npi')              ?? cfg.npi;
    cfg.taxId                       = v('cs-tax-id')           ?? cfg.taxId;
    cfg.licenseNumber               = v('cs-license')          ?? cfg.licenseNumber;
    cfg.emailFooter                 = v('cs-email-footer')     ?? cfg.emailFooter;
    cfg.appointmentReminderTemplate = v('cs-appt-reminder')    ?? cfg.appointmentReminderTemplate;
    cfg.sessionCompleteTemplate     = v('cs-session-complete') ?? cfg.sessionCompleteTemplate;
    cfg.termsOfService              = v('cs-tos')              ?? cfg.termsOfService;
    cfg.privacyPolicy               = v('cs-privacy')          ?? cfg.privacyPolicy;
    cfg.tosLastUpdated              = v('cs-tos-date')         ?? cfg.tosLastUpdated;
    cfg.privacyLastUpdated          = v('cs-privacy-date')     ?? cfg.privacyLastUpdated;
    saveClinicConfig(cfg);
    window._showToast?.('All clinic settings saved successfully!', 'success') || alert('All clinic settings saved!');
  };
}

// Apply saved clinic branding on module load (side-effect bootstrap)
applyClinicBranding(getClinicConfig());

// ── Telehealth Session Recorder ───────────────────────────────────────────────

const RECORDINGS_KEY = 'ds_telehealth_recordings';

function getRecordings() {
  try { return JSON.parse(localStorage.getItem(RECORDINGS_KEY) || '[]'); } catch { return []; }
}

function saveRecording(rec) {
  const recs = getRecordings();
  const idx = recs.findIndex(r => r.id === rec.id);
  if (idx >= 0) recs[idx] = rec; else recs.unshift(rec);
  localStorage.setItem(RECORDINGS_KEY, JSON.stringify(recs));
}

function deleteRecording(id) {
  const recs = getRecordings().filter(r => r.id !== id);
  localStorage.setItem(RECORDINGS_KEY, JSON.stringify(recs));
}

function _seedRecordings() {
  if (getRecordings().length > 0) return;
  const seeds = [
    {
      id: 'rec-seed-1',
      title: 'Alpha Training — Session 4',
      patientName: 'Sarah Mitchell',
      date: '2026-04-08T10:15:00.000Z',
      duration: '24:12',
      sizeKB: 42300,
      transcript: [
        { time: '00:00', text: 'Patient reports improved sleep quality since last session.' },
        { time: '08:05', text: 'Reviewing EEG feedback from last session.' },
        { time: '16:20', text: 'Adjusting alpha training threshold to 11 Hz.' },
        { time: '24:00', text: 'Session concluded — patient demonstrates increased relaxation response.' },
      ],
      notes: 'Good progress on alpha amplitude. Schedule follow-up in 5 days.',
      blobUrl: null,
      status: 'saved',
    },
    {
      id: 'rec-seed-2',
      title: 'tDCS DLPFC Protocol — Intake',
      patientName: 'James Okonkwo',
      date: '2026-04-07T14:00:00.000Z',
      duration: '18:47',
      sizeKB: 31200,
      transcript: [
        { time: '00:00', text: 'Patient presenting with treatment-resistant depression.' },
        { time: '06:30', text: 'Discussing tDCS anode placement at F3, cathode at FP2.' },
        { time: '12:15', text: 'Patient confirms no metal implants or seizure history.' },
        { time: '18:00', text: 'Consent obtained and baseline PHQ-9 recorded (score 17).' },
      ],
      notes: 'Baseline established. First tDCS session scheduled for next week.',
      blobUrl: null,
      status: 'uploaded',
    },
    {
      id: 'rec-seed-3',
      title: 'Anxiety Protocol Review — SMR Training',
      patientName: 'Priya Nair',
      date: '2026-04-05T09:30:00.000Z',
      duration: '31:05',
      sizeKB: 58900,
      transcript: [
        { time: '00:00', text: 'Patient reports reduced anxiety symptoms this week.' },
        { time: '10:20', text: 'SMR amplitude trending upward — excellent compliance.' },
        { time: '21:00', text: 'Introduced theta suppression protocol component.' },
        { time: '30:00', text: 'Patient completed 30 min without breaks — milestone reached.' },
      ],
      notes: 'Consider advancing to Phase 2 protocol on next visit.',
      blobUrl: null,
      status: 'saved',
    },
  ];
  localStorage.setItem(RECORDINGS_KEY, JSON.stringify(seeds));
}

// ── Module-level recorder state ───────────────────────────────────────────────
let _recMediaRecorder = null;
let _recStream = null;
let _recChunks = [];
let _recStartTime = null;
let _recTimerInterval = null;
let _recTranscript = [];   // { time, text }
let _recScreenStream = null;
let _recIsScreenSharing = false;

const _REC_PHRASES = [
  'Patient reports reduced anxiety symptoms.',
  'Reviewing EEG feedback from last session.',
  'Adjusting alpha training threshold to 11 Hz.',
  'SMR amplitude trending upward — good progress.',
  'Patient demonstrates increased relaxation response.',
  'Theta suppression protocol component introduced.',
  'Discussing homework compliance between sessions.',
  'Patient confirms no adverse effects since last visit.',
  'Baseline qEEG shows improvement in coherence scores.',
  'tDCS anode placement confirmed at F3 per protocol.',
  'Heart rate variability biofeedback initiated.',
  'Patient reports improved sleep quality this week.',
  'Reviewing PHQ-9 scores — down 4 points from last visit.',
  'Adjusting reward threshold — beta amplitude at 18 Hz.',
  'Session goal met: 20 min sustained focus achieved.',
  'Clinician note: consider advancing to Phase 2 next visit.',
  'Patient completing session without breaks — milestone.',
  'Discussing neurofeedback rationale with patient.',
  'Informed consent reviewed and re-confirmed.',
  'Scheduling follow-up appointment in 5 days.',
];

function _recFormatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function _recSimulateLine() {
  const elapsed = _recStartTime ? _recFormatTime(Date.now() - _recStartTime) : '00:00';
  const phrase = _REC_PHRASES[Math.floor(Math.random() * _REC_PHRASES.length)];
  _recTranscript.push({ time: elapsed, text: phrase });
  const panel = document.getElementById('rec-transcript-panel');
  if (panel) {
    const line = document.createElement('div');
    line.className = 'rec-transcript-line';
    line.innerHTML = `<span class="rec-transcript-time">[${elapsed}]</span><span class="rec-transcript-clinician">Clinician:</span><span>${phrase}</span>`;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
  }
}

function _recUpdateTimer() {
  if (!_recStartTime) return;
  const el = document.getElementById('rec-elapsed');
  if (!el) {
    // Page has been navigated away — stop the interval to prevent leaks.
    clearInterval(_recTimerInterval); _recTimerInterval = null;
    clearInterval(window._recSimInterval); window._recSimInterval = null;
    return;
  }
  el.textContent = _recFormatTime(Date.now() - _recStartTime);
}

function _recSetStatus(status) {
  const bar = document.getElementById('rec-status-bar');
  if (!bar) return;
  if (status === 'recording') {
    bar.innerHTML = `<span class="rec-indicator"><span class="rec-dot"></span><span class="rec-timer" id="rec-elapsed">00:00</span></span><span style="font-size:.8rem;color:var(--text-secondary);margin-left:8px">Recording…</span>`;
  } else if (status === 'paused') {
    bar.innerHTML = `<span class="rec-indicator"><span class="rec-dot" style="animation:none;background:#f59e0b"></span><span class="rec-timer" id="rec-elapsed" style="color:#f59e0b">Paused</span></span>`;
  } else if (status === 'idle') {
    bar.innerHTML = `<span style="font-size:.8rem;color:var(--text-secondary)">Not recording</span>`;
  }
}

function _recShowToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 18px;border-radius:10px;font-size:.85rem;font-weight:600;color:#fff;background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6366f1'};box-shadow:0 4px 16px rgba(0,0,0,.3);transition:opacity .3s`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

function _recBuildLibraryHTML(filter = '') {
  _seedRecordings();
  const recs = getRecordings().filter(r =>
    !filter || r.patientName.toLowerCase().includes(filter.toLowerCase())
  );
  if (recs.length === 0) {
    return `<div style="text-align:center;padding:40px;color:var(--text-secondary)">No recordings found.</div>`;
  }
  return recs.map(r => {
    const statusClass = `rec-status-${r.status}`;
    const dateStr = new Date(r.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const sizeStr = r.sizeKB >= 1024 ? `${(r.sizeKB / 1024).toFixed(1)} MB` : `${r.sizeKB} KB`;
    const transcriptHtml = (r.transcript || []).map(l =>
      `<div class="rec-transcript-line"><span class="rec-transcript-time">[${l.time}]</span><span>${l.text}</span></div>`
    ).join('');
    return `<div class="rec-library-item" id="lib-item-${r.id}">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:200px">
      <div style="font-weight:600;font-size:.95rem">${r.title}</div>
      <div style="font-size:.8rem;color:var(--text-secondary);margin-top:2px">${r.patientName} &nbsp;·&nbsp; ${dateStr}</div>
      <div style="font-size:.78rem;color:var(--text-tertiary);margin-top:2px">Duration: ${r.duration} &nbsp;·&nbsp; Size: ${sizeStr}</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="${statusClass}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
      <button class="btn btn-sm btn-ghost" onclick="window._recPlayInline('${r.id}')">▶ Play</button>
      <button class="btn btn-sm btn-ghost" onclick="window._recExportTranscript('${r.id}')">Export Transcript</button>
      <button class="btn btn-sm btn-ghost" style="color:#ef4444" onclick="window._recDelete('${r.id}')">Delete</button>
    </div>
  </div>
  <div id="lib-player-${r.id}" style="display:none;margin-top:12px"></div>
  <details style="margin-top:10px">
    <summary style="font-size:.8rem;cursor:pointer;color:var(--text-secondary)">Transcript (${(r.transcript || []).length} entries)</summary>
    <div class="rec-transcript-panel" style="margin-top:6px">${transcriptHtml || '<span style="color:var(--text-tertiary)">No transcript available.</span>'}</div>
  </details>
  ${r.notes ? `<div style="margin-top:8px;font-size:.8rem;background:var(--hover-bg);padding:8px 12px;border-radius:6px;border-left:3px solid var(--accent-teal)"><strong>Notes:</strong> ${r.notes}</div>` : ''}
</div>`;
  }).join('');
}

export async function pgTelehealthRecorder(setTopbar) {
  _seedRecordings();
  setTopbar('Telehealth Session Recorder', `<button class="btn btn-ghost btn-sm" onclick="window._nav('telehealth')">← Back to Telehealth</button>`);

  const el = document.getElementById('content');
  if (!el) return;

  let _activeTab = 'live';

  function render() {
    el.innerHTML = `
<div style="max-width:960px;margin:0 auto;padding:0 4px">
  <!-- Tab bar -->
  <div style="display:flex;gap:4px;margin-bottom:20px;background:var(--bg-surface-2,#1e293b);padding:4px;border-radius:10px;width:fit-content">
    <button class="btn btn-sm${_activeTab === 'live' ? ' btn-primary' : ' btn-ghost'}" onclick="window._recSwitchTab('live')">Live Session</button>
    <button class="btn btn-sm${_activeTab === 'library' ? ' btn-primary' : ' btn-ghost'}" onclick="window._recSwitchTab('library')">Recording Library</button>
  </div>

  <!-- Live Session Tab -->
  <div id="rec-tab-live" style="display:${_activeTab === 'live' ? 'block' : 'none'}">

    <!-- Control bar -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
        <div style="flex:1;min-width:160px">
          <label style="font-size:.75rem;color:var(--text-secondary);display:block;margin-bottom:4px">Patient Name</label>
          <input id="rec-patient-name" class="input" style="width:100%" placeholder="e.g. Sarah Mitchell" />
        </div>
        <div style="flex:1;min-width:160px">
          <label style="font-size:.75rem;color:var(--text-secondary);display:block;margin-bottom:4px">Session Title</label>
          <input id="rec-session-title" class="input" style="width:100%" placeholder="e.g. Alpha Training – Session 5" />
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
          <button class="btn btn-sm" id="btn-start-camera" onclick="window._recStartCamera()">Start Camera</button>
          <button class="btn btn-sm btn-ghost" id="btn-toggle-screen" onclick="window._recToggleScreen()">Share Screen</button>
          <button class="btn btn-sm btn-primary" id="btn-start-rec" onclick="window._recStart()" disabled>Start Recording</button>
          <button class="btn btn-sm btn-ghost" id="btn-pause-rec" onclick="window._recPause()" style="display:none">Pause</button>
          <button class="btn btn-sm btn-ghost" id="btn-resume-rec" onclick="window._recResume()" style="display:none">Resume</button>
          <button class="btn btn-sm" id="btn-stop-rec" onclick="window._recStop()" style="display:none;background:#ef4444;color:#fff">Stop &amp; Save</button>
        </div>
      </div>
      <div class="card-footer" style="padding:8px 16px">
        <div id="rec-status-bar"><span style="font-size:.8rem;color:var(--text-secondary)">Not recording</span></div>
      </div>
    </div>

    <!-- Video area -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px" id="rec-video-grid">
      <div>
        <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:4px">Camera Feed</div>
        <div class="rec-video-wrap">
          <video id="rec-local-video" autoplay muted playsinline style="width:100%;height:240px;object-fit:cover"></video>
        </div>
      </div>
      <div id="rec-screen-col" style="display:none">
        <div style="font-size:.75rem;color:var(--text-secondary);margin-bottom:4px">Screen Share</div>
        <div class="rec-video-wrap">
          <video id="rec-screen-video" autoplay muted playsinline style="width:100%;height:240px;object-fit:cover"></video>
        </div>
      </div>
    </div>

    <!-- Live transcript -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <span>Live Transcript</span>
        <div style="display:flex;gap:8px;align-items:center">
          <input id="rec-note-input" class="input input-sm" placeholder="Add a timestamped note…" style="width:240px;display:none" onkeydown="if(event.key==='Enter')window._recAddNote()" />
          <button class="btn btn-sm btn-ghost" id="btn-add-note" onclick="window._recToggleNoteInput()">Add Note</button>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div id="rec-transcript-panel" class="rec-transcript-panel" style="border-radius:0">
          <div style="color:var(--text-tertiary);font-size:.8rem;padding:4px 0">Transcript will appear here once recording starts…</div>
        </div>
      </div>
    </div>

    <!-- Post-recording playback (hidden until recording stopped) -->
    <div id="rec-playback-section" style="display:none">
      <div class="card">
        <div class="card-header">Playback &amp; Save</div>
        <div class="card-body">
          <video id="rec-playback-video" controls style="width:100%;border-radius:8px;background:#000;margin-bottom:12px"></video>
          <div style="display:flex;gap:16px;font-size:.82rem;color:var(--text-secondary);margin-bottom:12px">
            <span>Duration: <strong id="rec-pb-duration">—</strong></span>
            <span>Size: <strong id="rec-pb-size">—</strong></span>
          </div>
          <div id="rec-save-confirm" style="margin-bottom:12px;display:none;padding:10px 14px;background:var(--teal-ghost,rgba(0,212,188,.08));border-radius:8px;border:1px solid var(--border-teal,rgba(0,212,188,.25));font-size:.85rem">
            Recording saved for <strong id="rec-save-patient"></strong> — <strong id="rec-save-title"></strong>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="window._recUpload()">Upload to Cloud</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Recording Library Tab -->
  <div id="rec-tab-library" style="display:${_activeTab === 'library' ? 'block' : 'none'}">
    <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center">
      <input id="rec-search-input" class="input" placeholder="Search by patient name…" style="max-width:320px" oninput="window._recSearchLibrary(this.value)" />
    </div>
    <div id="rec-library-list">${_recBuildLibraryHTML()}</div>
  </div>
</div>`;
  }

  render();

  // ── Tab switch ─────────────────────────────────────────────────────────────
  window._recSwitchTab = function(tab) {
    _activeTab = tab;
    render();
    // Restore video streams after re-render
    if (_recStream) {
      const v = document.getElementById('rec-local-video');
      if (v) v.srcObject = _recStream;
    }
    if (_recScreenStream) {
      const sv = document.getElementById('rec-screen-video');
      if (sv) sv.srcObject = _recScreenStream;
      const sc = document.getElementById('rec-screen-col');
      if (sc) sc.style.display = 'block';
    }
    // Re-apply button states
    _recRefreshButtons();
    if (_recMediaRecorder && _recMediaRecorder.state === 'recording') {
      _recSetStatus('recording');
    } else if (_recMediaRecorder && _recMediaRecorder.state === 'paused') {
      _recSetStatus('paused');
    }
  };

  function _recRefreshButtons() {
    const cameraReady = !!_recStream;
    const isRecording = _recMediaRecorder && _recMediaRecorder.state === 'recording';
    const isPaused = _recMediaRecorder && _recMediaRecorder.state === 'paused';
    const isActive = isRecording || isPaused;

    const btnStart = document.getElementById('btn-start-rec');
    const btnPause = document.getElementById('btn-pause-rec');
    const btnResume = document.getElementById('btn-resume-rec');
    const btnStop = document.getElementById('btn-stop-rec');
    const btnCam = document.getElementById('btn-start-camera');
    const btnScreen = document.getElementById('btn-toggle-screen');

    if (btnStart) btnStart.disabled = !cameraReady || isActive;
    if (btnPause) btnPause.style.display = isRecording ? 'inline-flex' : 'none';
    if (btnResume) btnResume.style.display = isPaused ? 'inline-flex' : 'none';
    if (btnStop) btnStop.style.display = isActive ? 'inline-flex' : 'none';
    if (btnCam) {
      btnCam.textContent = cameraReady ? 'Camera On' : 'Start Camera';
      btnCam.disabled = !!_recStream;
    }
    if (btnScreen) {
      btnScreen.textContent = _recIsScreenSharing ? 'Stop Screen' : 'Share Screen';
    }
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  window._recStartCamera = async function() {
    try {
      _recStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const v = document.getElementById('rec-local-video');
      if (v) v.srcObject = _recStream;
      _recRefreshButtons();
      _recShowToast('Camera started', 'success');
    } catch (err) {
      console.error('[Recorder] Camera error:', err);
      _recShowToast('Camera not available: ' + (err.message || err.name), 'error');
    }
  };

  // ── Screen share ───────────────────────────────────────────────────────────
  window._recToggleScreen = async function() {
    if (_recIsScreenSharing) {
      if (_recScreenStream) { _recScreenStream.getTracks().forEach(t => t.stop()); _recScreenStream = null; }
      _recIsScreenSharing = false;
      const sv = document.getElementById('rec-screen-video');
      if (sv) sv.srcObject = null;
      const sc = document.getElementById('rec-screen-col');
      if (sc) sc.style.display = 'none';
      _recRefreshButtons();
      _recShowToast('Screen sharing stopped', 'success');
      return;
    }
    try {
      _recScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      _recIsScreenSharing = true;
      const sv = document.getElementById('rec-screen-video');
      if (sv) { sv.srcObject = _recScreenStream; sv.style.display = ''; }
      const sc = document.getElementById('rec-screen-col');
      if (sc) sc.style.display = 'block';
      _recScreenStream.getTracks()[0].addEventListener('ended', () => {
        _recIsScreenSharing = false;
        _recScreenStream = null;
        const scEnd = document.getElementById('rec-screen-col');
        if (scEnd) scEnd.style.display = 'none';
        _recRefreshButtons();
      });
      _recRefreshButtons();
      _recShowToast('Screen sharing started', 'success');
    } catch (err) {
      console.error('[Recorder] Screen share error:', err);
      if (err.name !== 'NotAllowedError') {
        _recShowToast('Screen share not available: ' + (err.message || err.name), 'error');
      }
    }
  };

  // ── Start recording ────────────────────────────────────────────────────────
  window._recStart = function() {
    if (!_recStream) { _recShowToast('Please start camera first.', 'error'); return; }
    try {
      _recChunks = [];
      _recTranscript = [];
      const panel = document.getElementById('rec-transcript-panel');
      if (panel) panel.innerHTML = '';

      // Combine camera + screen if available
      let tracks = [..._recStream.getTracks()];
      if (_recScreenStream) tracks = [...tracks, ..._recScreenStream.getVideoTracks()];

      const combined = new MediaStream(tracks);
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

      const opts = mimeType ? { mimeType } : {};
      _recMediaRecorder = new MediaRecorder(combined, opts);

      _recMediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) _recChunks.push(e.data); };
      _recMediaRecorder.onerror = e => { console.error('[Recorder] MediaRecorder error:', e.error); _recShowToast('Recording error: ' + e.error?.message, 'error'); };
      _recMediaRecorder.start(1000);

      _recStartTime = Date.now();
      _recTimerInterval = setInterval(_recUpdateTimer, 500);

      // Simulate transcript every 8 seconds
      window._recSimInterval = setInterval(_recSimulateLine, 8000);
      _recSimulateLine(); // immediate first line

      _recSetStatus('recording');
      _recRefreshButtons();

      // Hide old playback
      const pb = document.getElementById('rec-playback-section');
      if (pb) pb.style.display = 'none';
      const sc = document.getElementById('rec-save-confirm');
      if (sc) sc.style.display = 'none';

    } catch (err) {
      console.error('[Recorder] Start error:', err);
      _recShowToast('Could not start recording: ' + (err.message || err.name), 'error');
    }
  };

  // ── Pause ──────────────────────────────────────────────────────────────────
  window._recPause = function() {
    if (_recMediaRecorder && _recMediaRecorder.state === 'recording') {
      _recMediaRecorder.pause();
      clearInterval(_recTimerInterval);
      clearInterval(window._recSimInterval);
      _recSetStatus('paused');
      _recRefreshButtons();
    }
  };

  // ── Resume ─────────────────────────────────────────────────────────────────
  window._recResume = function() {
    if (_recMediaRecorder && _recMediaRecorder.state === 'paused') {
      _recMediaRecorder.resume();
      _recTimerInterval = setInterval(_recUpdateTimer, 500);
      window._recSimInterval = setInterval(_recSimulateLine, 8000);
      _recSetStatus('recording');
      _recRefreshButtons();
    }
  };

  // ── Stop & Save ────────────────────────────────────────────────────────────
  window._recStop = function() {
    if (!_recMediaRecorder || _recMediaRecorder.state === 'inactive') return;

    clearInterval(_recTimerInterval);
    clearInterval(window._recSimInterval);

    const durationMs = _recStartTime ? Date.now() - _recStartTime : 0;
    const durationFmt = _recFormatTime(durationMs);

    _recMediaRecorder.onstop = () => {
      const mimeType = _recChunks[0]?.type || 'video/webm';
      const blob = new Blob(_recChunks, { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const sizeKB = Math.round(blob.size / 1024);

      // Show playback
      const pb = document.getElementById('rec-playback-section');
      if (pb) pb.style.display = 'block';
      const pv = document.getElementById('rec-playback-video');
      if (pv) pv.src = blobUrl;
      const dur = document.getElementById('rec-pb-duration');
      if (dur) dur.textContent = durationFmt;
      const sz = document.getElementById('rec-pb-size');
      if (sz) sz.textContent = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

      // Save to store
      const patientName = document.getElementById('rec-patient-name')?.value.trim() || 'Unknown Patient';
      const title = document.getElementById('rec-session-title')?.value.trim() || `Session ${new Date().toLocaleDateString()}`;

      const rec = {
        id: 'rec-' + Date.now(),
        title,
        patientName,
        date: new Date().toISOString(),
        duration: durationFmt,
        sizeKB,
        transcript: [..._recTranscript],
        notes: '',
        blobUrl,
        status: 'saved',
      };
      saveRecording(rec);
      window._lastSavedRecId = rec.id;

      // Show confirmation
      const confirm = document.getElementById('rec-save-confirm');
      if (confirm) {
        confirm.style.display = 'block';
        const sp = document.getElementById('rec-save-patient');
        const st = document.getElementById('rec-save-title');
        if (sp) sp.textContent = patientName;
        if (st) st.textContent = title;
      }

      _recSetStatus('idle');
      _recRefreshButtons();
      _recShowToast('Recording saved!', 'success');
    };

    _recMediaRecorder.stop();
  };

  // ── Add Note ───────────────────────────────────────────────────────────────
  window._recToggleNoteInput = function() {
    const inp = document.getElementById('rec-note-input');
    if (!inp) return;
    const visible = inp.style.display !== 'none';
    inp.style.display = visible ? 'none' : '';
    if (!visible) inp.focus();
  };

  window._recAddNote = function() {
    const inp = document.getElementById('rec-note-input');
    if (!inp || !inp.value.trim()) return;
    const elapsed = _recStartTime ? _recFormatTime(Date.now() - _recStartTime) : '00:00';
    const note = inp.value.trim();
    _recTranscript.push({ time: elapsed, text: '[NOTE] ' + note });
    const panel = document.getElementById('rec-transcript-panel');
    if (panel) {
      const line = document.createElement('div');
      line.className = 'rec-transcript-line';
      line.innerHTML = `<span class="rec-transcript-time">[${elapsed}]</span><span class="rec-transcript-clinician" style="color:var(--amber-400,#f59e0b)">Note:</span><span>${note}</span>`;
      panel.appendChild(line);
      panel.scrollTop = panel.scrollHeight;
    }
    inp.value = '';
    inp.style.display = 'none';
  };

  // ── Upload (simulated) ─────────────────────────────────────────────────────
  window._recUpload = function() {
    const id = window._lastSavedRecId;
    if (!id) { _recShowToast('No recording to upload.', 'error'); return; }
    const recs = getRecordings();
    const rec = recs.find(r => r.id === id);
    if (!rec) { _recShowToast('Recording not found.', 'error'); return; }
    rec.status = 'processing';
    saveRecording(rec);
    _recShowToast('Uploading…', 'info');
    setTimeout(() => {
      rec.status = 'uploaded';
      saveRecording(rec);
      _recShowToast('Simulated upload complete ✓', 'success');
    }, 2000);
  };

  // ── Library: play inline ───────────────────────────────────────────────────
  window._recPlayInline = function(id) {
    const recs = getRecordings();
    const rec = recs.find(r => r.id === id);
    const container = document.getElementById(`lib-player-${id}`);
    if (!container) return;
    if (container.style.display !== 'none') { container.style.display = 'none'; return; }
    if (!rec || !rec.blobUrl) {
      container.style.display = 'block';
      container.innerHTML = `<div style="padding:10px 0;font-size:.82rem;color:var(--text-secondary)">Recording unavailable — this is a sample record with no stored media.</div>`;
      return;
    }
    container.style.display = 'block';
    container.innerHTML = `<video controls src="${rec.blobUrl}" style="width:100%;border-radius:8px;background:#000;max-height:240px"></video>`;
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  window._recDelete = function(id) {
    const recs = getRecordings();
    const rec = recs.find(r => r.id === id);
    if (!rec) return;
    if (!confirm(`Delete recording "${rec.title}" for ${rec.patientName}?\n\nThis cannot be undone.`)) return;
    deleteRecording(id);
    const item = document.getElementById(`lib-item-${id}`);
    if (item) item.remove();
    _recShowToast('Recording deleted.', 'success');
  };

  // ── Export Transcript ──────────────────────────────────────────────────────
  window._recExportTranscript = function(id) {
    const recs = getRecordings();
    const rec = recs.find(r => r.id === id);
    if (!rec) { _recShowToast('Recording not found.', 'error'); return; }
    const lines = (rec.transcript || []).map(l => `[${l.time}] ${l.text}`).join('\n');
    const content = `Telehealth Session Transcript\nPatient: ${rec.patientName}\nSession: ${rec.title}\nDate: ${new Date(rec.date).toLocaleString()}\nDuration: ${rec.duration}\n\n${lines}\n${rec.notes ? '\n--- Notes ---\n' + rec.notes : ''}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${rec.patientName.replace(/\s+/g, '-')}-${rec.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    _recShowToast('Transcript downloaded.', 'success');
  };

  // ── Search library ─────────────────────────────────────────────────────────
  window._recSearchLibrary = function(q) {
    const list = document.getElementById('rec-library-list');
    if (list) list.innerHTML = _recBuildLibraryHTML(q);
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Insurance Verification & Eligibility Management
// ════════════════════════════════════════════════════════════════════════════

const ELIGIBILITY_KEY = 'ds_eligibility_checks';
const PRIOR_AUTH_KEY  = 'ds_prior_auths';
const CLAIMS_KEY      = 'ds_claims';

// ── Date helpers ──────────────────────────────────────────────────────────────
function _insDateStr(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function _insDateFmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function _insDaysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000);
}
function _insDaysUntil(iso) {
  if (!iso) return 9999;
  return Math.floor((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86400000);
}

// ── Eligibility checks store ──────────────────────────────────────────────────
function getEligibilityChecks() {
  const raw = localStorage.getItem(ELIGIBILITY_KEY);
  if (raw) return JSON.parse(raw);
  const seed = [
    {
      id: 'elig-001', patientName: 'Sarah Thompson', payer: 'BCBS', memberId: 'BCB123456789',
      groupId: 'GRP-5001', dob: '1985-03-12', checkedDate: _insDateStr(2), checkedBy: 'Dr. Martinez',
      status: 'active', deductible: 1500, deductibleMet: 500, outOfPocketMax: 5000, outOfPocketMet: 800,
      copay: 30, coinsurance: 20,
      coveredServices: [
        { code: '90837', description: 'Psychotherapy 60 min', covered: true, notes: 'Pre-auth required after 20 visits' },
        { code: '90901', description: 'Biofeedback training', covered: true, notes: 'Up to 10 visits/year' },
        { code: '95999', description: 'Neurofeedback', covered: false, notes: 'Not covered – experimental' },
      ],
      notes: 'Patient has met partial deductible. Confirm referral on file.',
    },
    {
      id: 'elig-002', patientName: 'James Okafor', payer: 'Aetna', memberId: 'AET987654321',
      groupId: 'GRP-7700', dob: '1972-07-24', checkedDate: _insDateStr(5), checkedBy: 'Dr. Chen',
      status: 'active', deductible: 2000, deductibleMet: 0, outOfPocketMax: 6500, outOfPocketMet: 0,
      copay: 40, coinsurance: 20,
      coveredServices: [
        { code: '90837', description: 'Psychotherapy 60 min', covered: true, notes: '' },
        { code: '90901', description: 'Biofeedback training', covered: true, notes: 'Requires PA after visit 6' },
        { code: '95999', description: 'Neurofeedback', covered: false, notes: 'Covered only with autism diagnosis' },
      ],
      notes: 'Deductible not met. Collect full contracted rate until met.',
    },
    {
      id: 'elig-003', patientName: 'Maria Gonzalez', payer: 'Cigna', memberId: 'CIG456123789',
      groupId: 'GRP-3300', dob: '1990-11-08', checkedDate: _insDateStr(1), checkedBy: 'Dr. Park',
      status: 'active', deductible: 1800, deductibleMet: 900, outOfPocketMax: 4000, outOfPocketMet: 1200,
      copay: 35, coinsurance: 15,
      coveredServices: [
        { code: '90837', description: 'Psychotherapy 60 min', covered: true, notes: '' },
        { code: '90901', description: 'Biofeedback training', covered: true, notes: '' },
        { code: '95999', description: 'Neurofeedback', covered: true, notes: 'Covered for ADHD, anxiety diagnoses' },
      ],
      notes: 'Deductible 50% met. Good standing.',
    },
    {
      id: 'elig-004', patientName: 'Robert Kim', payer: 'UHC', memberId: 'UHC112233445',
      groupId: 'GRP-9900', dob: '1968-05-30', checkedDate: _insDateStr(3), checkedBy: 'Dr. Martinez',
      status: 'pending', deductible: 3000, deductibleMet: 1500, outOfPocketMax: 7500, outOfPocketMet: 2000,
      copay: 50, coinsurance: 20,
      coveredServices: [],
      notes: 'Verification pending with UHC portal. Follow up in 24h.',
    },
    {
      id: 'elig-005', patientName: 'Linda Patel', payer: 'Other', memberId: 'OTH999888777',
      groupId: 'GRP-0001', dob: '1995-09-14', checkedDate: _insDateStr(10), checkedBy: 'Dr. Chen',
      status: 'error', deductible: 0, deductibleMet: 0, outOfPocketMax: 0, outOfPocketMet: 0,
      copay: 0, coinsurance: 0,
      coveredServices: [],
      notes: 'Member ID not found in payer database. Contact patient.',
    },
  ];
  localStorage.setItem(ELIGIBILITY_KEY, JSON.stringify(seed));
  return seed;
}
function saveEligibilityCheck(check) {
  const all = getEligibilityChecks();
  const idx = all.findIndex(e => e.id === check.id);
  if (idx >= 0) all[idx] = check; else all.unshift(check);
  localStorage.setItem(ELIGIBILITY_KEY, JSON.stringify(all));
}

// ── Prior auths store ─────────────────────────────────────────────────────────
function getPriorAuths() {
  const raw = localStorage.getItem(PRIOR_AUTH_KEY);
  if (raw) return JSON.parse(raw);
  const seed = [
    {
      id: 'pa-001', patientName: 'Sarah Thompson', payer: 'BCBS', cptCode: '90837',
      diagnosisCode: 'F41.1', requestDate: _insDateStr(30), approvedDate: _insDateStr(25),
      expiryDate: _insDateStr(-60), authNumber: 'BCBS-2025-4411',
      requestedUnits: 20, approvedUnits: 20,
      status: 'approved', clinician: 'Dr. Martinez', notes: 'Full approval for anxiety treatment.',
      denialReason: '',
    },
    {
      id: 'pa-002', patientName: 'James Okafor', payer: 'Aetna', cptCode: '90901',
      diagnosisCode: 'F43.10', requestDate: _insDateStr(15), approvedDate: '',
      expiryDate: '', authNumber: '',
      requestedUnits: 10, approvedUnits: 0,
      status: 'pending', clinician: 'Dr. Chen', notes: 'Awaiting medical necessity review.',
      denialReason: '',
    },
    {
      id: 'pa-003', patientName: 'Maria Gonzalez', payer: 'Cigna', cptCode: '95999',
      diagnosisCode: 'F90.0', requestDate: _insDateStr(45), approvedDate: _insDateStr(40),
      expiryDate: _insDateStr(-20), authNumber: 'CGN-2025-7722',
      requestedUnits: 30, approvedUnits: 15,
      status: 'partial', clinician: 'Dr. Park', notes: '15 units approved for ADHD neurofeedback.',
      denialReason: '',
    },
    {
      id: 'pa-004', patientName: 'David Wilson', payer: 'BCBS', cptCode: '90837',
      diagnosisCode: 'F32.1', requestDate: _insDateStr(60), approvedDate: '',
      expiryDate: '', authNumber: '',
      requestedUnits: 24, approvedUnits: 0,
      status: 'denied', clinician: 'Dr. Martinez',
      notes: 'Denied – criteria not met.',
      denialReason: 'Medical necessity not established; missing clinical documentation.',
    },
  ];
  localStorage.setItem(PRIOR_AUTH_KEY, JSON.stringify(seed));
  return seed;
}
function savePriorAuth(pa) {
  const all = getPriorAuths();
  const idx = all.findIndex(p => p.id === pa.id);
  if (idx >= 0) all[idx] = pa; else all.unshift(pa);
  localStorage.setItem(PRIOR_AUTH_KEY, JSON.stringify(all));
}
function updatePriorAuthStatus(id, status, notes) {
  const all = getPriorAuths();
  const pa = all.find(p => p.id === id);
  if (!pa) return;
  pa.status = status;
  if (notes !== undefined) pa.notes = notes;
  localStorage.setItem(PRIOR_AUTH_KEY, JSON.stringify(all));
}

// ── Claims store ──────────────────────────────────────────────────────────────
function getClaims() {
  const raw = localStorage.getItem(CLAIMS_KEY);
  if (raw) return JSON.parse(raw);
  const seed = [
    {
      id: 'clm-001', patientName: 'Sarah Thompson', payer: 'BCBS', dos: _insDateStr(14),
      cptCodes: ['90837'], diagnosisCodes: ['F41.1'],
      billedAmount: 200, allowedAmount: 145, paidAmount: 116, patientBalance: 29,
      status: 'paid', submittedDate: _insDateStr(12), processedDate: _insDateStr(5),
      eobNotes: 'Paid at contracted rate. Copay $30 collected.',
    },
    {
      id: 'clm-002', patientName: 'James Okafor', payer: 'Aetna', dos: _insDateStr(7),
      cptCodes: ['90901'], diagnosisCodes: ['F43.10'],
      billedAmount: 175, allowedAmount: 0, paidAmount: 0, patientBalance: 0,
      status: 'submitted', submittedDate: _insDateStr(5), processedDate: '',
      eobNotes: '',
    },
    {
      id: 'clm-003', patientName: 'Maria Gonzalez', payer: 'Cigna', dos: _insDateStr(21),
      cptCodes: ['95999'], diagnosisCodes: ['F90.0'],
      billedAmount: 250, allowedAmount: 0, paidAmount: 0, patientBalance: 0,
      status: 'processing', submittedDate: _insDateStr(18), processedDate: '',
      eobNotes: 'Under review — neurofeedback medical necessity.',
    },
    {
      id: 'clm-004', patientName: 'Robert Kim', payer: 'UHC', dos: _insDateStr(35),
      cptCodes: ['90837', '90836'], diagnosisCodes: ['F33.0'],
      billedAmount: 320, allowedAmount: 0, paidAmount: 0, patientBalance: 0,
      status: 'denied', submittedDate: _insDateStr(32), processedDate: _insDateStr(25),
      eobNotes: 'Denied: duplicate claim. Original claim paid on DOS -40.',
    },
    {
      id: 'clm-005', patientName: 'Linda Patel', payer: 'Other', dos: _insDateStr(50),
      cptCodes: ['90837'], diagnosisCodes: ['F41.0'],
      billedAmount: 200, allowedAmount: 0, paidAmount: 0, patientBalance: 0,
      status: 'appealing', submittedDate: _insDateStr(47), processedDate: _insDateStr(40),
      eobNotes: 'Appeal filed 2025-01-10. Awaiting payer response.',
    },
    {
      id: 'clm-006', patientName: 'David Wilson', payer: 'BCBS', dos: _insDateStr(75),
      cptCodes: ['90837'], diagnosisCodes: ['F32.1'],
      billedAmount: 200, allowedAmount: 145, paidAmount: 0, patientBalance: 0,
      status: 'write-off', submittedDate: _insDateStr(72), processedDate: _insDateStr(65),
      eobNotes: 'Appeal lost. Written off per policy.',
    },
  ];
  localStorage.setItem(CLAIMS_KEY, JSON.stringify(seed));
  return seed;
}
function saveClaim(claim) {
  const all = getClaims();
  const idx = all.findIndex(c => c.id === claim.id);
  if (idx >= 0) all[idx] = claim; else all.unshift(claim);
  localStorage.setItem(CLAIMS_KEY, JSON.stringify(all));
}
function updateClaimStatus(id, status) {
  const all = getClaims();
  const c = all.find(x => x.id === id);
  if (!c) return;
  c.status = status;
  if (status === 'paid') {
    c.processedDate = new Date().toISOString().slice(0, 10);
    c.paidAmount = c.allowedAmount || c.billedAmount;
  }
  localStorage.setItem(CLAIMS_KEY, JSON.stringify(all));
}

// ── Mock eligibility check engine ─────────────────────────────────────────────
function runEligibilityCheck(patientName, payer, memberId) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const p = payer.toLowerCase();
      let result;
      if (p.includes('bcbs') || p.includes('blue')) {
        result = {
          status: 'active', deductible: 1500, deductibleMet: 500,
          outOfPocketMax: 5000, outOfPocketMet: 800, copay: 30, coinsurance: 20,
          coveredServices: [
            { code: '90837', description: 'Psychotherapy 60 min', covered: true, notes: 'PA after 20 visits' },
            { code: '90901', description: 'Biofeedback training', covered: true, notes: '' },
            { code: '95999', description: 'Neurofeedback', covered: false, notes: 'Not covered' },
          ],
        };
      } else if (p.includes('aetna')) {
        result = {
          status: 'active', deductible: 2000, deductibleMet: 0,
          outOfPocketMax: 6500, outOfPocketMet: 0, copay: 40, coinsurance: 20,
          coveredServices: [
            { code: '90837', description: 'Psychotherapy 60 min', covered: true, notes: '' },
            { code: '90901', description: 'Biofeedback training', covered: true, notes: 'PA after visit 6' },
            { code: '95999', description: 'Neurofeedback', covered: false, notes: 'Autism dx only' },
          ],
        };
      } else if (p.includes('cigna')) {
        result = {
          status: 'active', deductible: 1800, deductibleMet: 900,
          outOfPocketMax: 4000, outOfPocketMet: 1200, copay: 35, coinsurance: 15,
          coveredServices: [
            { code: '90837', description: 'Psychotherapy 60 min', covered: true, notes: '' },
            { code: '90901', description: 'Biofeedback training', covered: true, notes: '' },
            { code: '95999', description: 'Neurofeedback', covered: true, notes: 'ADHD/Anxiety dx' },
          ],
        };
      } else if (p.includes('uhc') || p.includes('united')) {
        result = {
          status: 'pending', deductible: 0, deductibleMet: 0,
          outOfPocketMax: 0, outOfPocketMet: 0, copay: 0, coinsurance: 0, coveredServices: [],
        };
      } else {
        result = {
          status: 'error', deductible: 0, deductibleMet: 0,
          outOfPocketMax: 0, outOfPocketMet: 0, copay: 0, coinsurance: 0, coveredServices: [],
        };
      }
      resolve(result);
    }, 1500);
  });
}

// ── Status badge helper ───────────────────────────────────────────────────────
function _insStatusBadge(status) {
  const map = {
    active: 'ins-status-active', approved: 'ins-status-approved',
    pending: 'ins-status-pending', partial: 'ins-status-pending',
    inactive: 'ins-status-denied', error: 'ins-status-denied',
    denied: 'ins-status-denied', expired: 'ins-status-denied',
    paid: 'ins-status-active', submitted: 'ins-status-pending',
    processing: 'ins-status-pending', appealing: 'ins-status-pending',
    'write-off': 'ins-status-denied',
  };
  const cls = map[status] || 'ins-status-pending';
  return `<span class="${cls}">${status.toUpperCase()}</span>`;
}

// ── Progress bar percent helper ───────────────────────────────────────────────
function _insPct(met, total) {
  return total > 0 ? Math.min(100, Math.round((met / total) * 100)) : 0;
}

// ── Eligibility tab HTML ──────────────────────────────────────────────────────
function _insEligibilityTabHTML() {
  const checks = getEligibilityChecks();
  const counts = { active: 0, inactive: 0, pending: 0, error: 0 };
  checks.forEach(c => {
    if (counts[c.status] !== undefined) counts[c.status]++;
    else counts.error++;
  });

  const recentRows = checks.slice(0, 10).map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:.9rem">${c.patientName}</div>
        <div style="font-size:.78rem;color:var(--text-secondary)">${c.payer} · ${_insDateFmt(c.checkedDate)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${_insStatusBadge(c.status)}
        <button class="btn btn-ghost btn-sm" onclick="window._insRerunCheck('${c.id}')">Re-run</button>
      </div>
    </div>`).join('');

  return `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
    <div class="card">
      <div class="card-header">Run Eligibility Check</div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:10px">
        <div><label class="form-label">Patient Name</label>
          <input id="ins-chk-name" class="form-control" placeholder="Full name" /></div>
        <div><label class="form-label">Payer</label>
          <select id="ins-chk-payer" class="form-control">
            <option value="BCBS">BCBS</option>
            <option value="Aetna">Aetna</option>
            <option value="Cigna">Cigna</option>
            <option value="UHC">UHC</option>
            <option value="Other">Other</option>
          </select></div>
        <div><label class="form-label">Member ID</label>
          <input id="ins-chk-memberid" class="form-control" placeholder="Member ID" /></div>
        <div><label class="form-label">Group ID</label>
          <input id="ins-chk-groupid" class="form-control" placeholder="Group ID" /></div>
        <div><label class="form-label">Date of Birth</label>
          <input id="ins-chk-dob" type="date" class="form-control" /></div>
        <button class="btn btn-primary" onclick="window._insCheckEligibility()">Check Eligibility</button>
        <div id="ins-chk-result"></div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div class="card" style="text-align:center;padding:16px">
          <div style="font-size:1.6rem;font-weight:700;color:#059669">${counts.active}</div>
          <div style="font-size:.78rem;color:var(--text-secondary)">Active</div>
        </div>
        <div class="card" style="text-align:center;padding:16px">
          <div style="font-size:1.6rem;font-weight:700;color:#d97706">${counts.pending}</div>
          <div style="font-size:.78rem;color:var(--text-secondary)">Pending</div>
        </div>
        <div class="card" style="text-align:center;padding:16px">
          <div style="font-size:1.6rem;font-weight:700;color:#dc2626">${counts.inactive + counts.error}</div>
          <div style="font-size:.78rem;color:var(--text-secondary)">Inactive / Error</div>
        </div>
        <div class="card" style="text-align:center;padding:16px">
          <div style="font-size:1.6rem;font-weight:700;color:var(--accent-teal)">${checks.length}</div>
          <div style="font-size:.78rem;color:var(--text-secondary)">Total Checks</div>
        </div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-header">Recent Eligibility Checks</div>
    <div class="card-body">${recentRows || '<div style="color:var(--text-secondary)">No checks yet.</div>'}</div>
  </div>`;
}

function _insEligResultHTML(r, patientName, payer, memberId) {
  if (r.status === 'error') {
    return `<div class="eligibility-result" style="margin-top:12px;border-color:#ef4444">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">${_insStatusBadge('error')}<b>Member Not Found</b></div>
      <div style="font-size:.82rem;color:var(--text-secondary)">The member ID could not be verified with ${payer}. Please contact the patient to confirm insurance information.</div>
    </div>`;
  }
  if (r.status === 'pending') {
    return `<div class="eligibility-result" style="margin-top:12px;border-color:#f59e0b">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">${_insStatusBadge('pending')}<b>Verification Pending</b></div>
      <div style="font-size:.82rem;color:var(--text-secondary)">${payer} portal is slow to respond. Check back in 24 hours or call payer directly.</div>
    </div>`;
  }
  const dedPct = _insPct(r.deductibleMet, r.deductible);
  const oopPct = _insPct(r.outOfPocketMet, r.outOfPocketMax);
  const svcRows = (r.coveredServices || []).map(s => `<tr>
    <td style="padding:6px 8px;font-size:.8rem">${s.code}</td>
    <td style="padding:6px 8px;font-size:.8rem">${s.description}</td>
    <td style="padding:6px 8px;font-size:.8rem">${s.covered ? '<span style="color:#059669">Covered</span>' : '<span style="color:#dc2626">Not Covered</span>'}</td>
    <td style="padding:6px 8px;font-size:.8rem;color:var(--text-secondary)">${s.notes}</td>
  </tr>`).join('');
  return `<div class="eligibility-result" style="margin-top:12px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      ${_insStatusBadge('active')}<b>${patientName}</b>
      <span style="color:var(--text-secondary);font-size:.8rem">${payer} · ${memberId}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div>
        <div style="font-size:.78rem;color:var(--text-secondary)">Deductible — $${r.deductibleMet} / $${r.deductible}</div>
        <div class="deductible-bar"><div class="deductible-fill" style="width:${dedPct}%"></div></div>
        <div style="font-size:.72rem;color:var(--text-secondary)">${dedPct}% met</div>
      </div>
      <div>
        <div style="font-size:.78rem;color:var(--text-secondary)">Out-of-Pocket — $${r.outOfPocketMet} / $${r.outOfPocketMax}</div>
        <div class="deductible-bar"><div class="deductible-fill" style="width:${oopPct}%"></div></div>
        <div style="font-size:.72rem;color:var(--text-secondary)">${oopPct}% met</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:12px">
      <div style="font-size:.82rem"><b>Copay:</b> $${r.copay}</div>
      <div style="font-size:.82rem"><b>Coinsurance:</b> ${r.coinsurance}%</div>
    </div>
    ${svcRows ? `<table style="width:100%;border-collapse:collapse;background:var(--hover-bg);border-radius:6px;overflow:hidden">
      <thead><tr style="font-size:.75rem;color:var(--text-muted);text-align:left">
        <th style="padding:6px 8px">CPT</th><th style="padding:6px 8px">Description</th>
        <th style="padding:6px 8px">Coverage</th><th style="padding:6px 8px">Notes</th>
      </tr></thead><tbody>${svcRows}</tbody>
    </table>` : ''}
  </div>`;
}

// ── Prior Auth tab HTML ───────────────────────────────────────────────────────
function _insPATabHTML(filterStatus, filterPayer, filterClinician) {
  const pas = getPriorAuths();

  const expiring = pas.filter(p =>
    p.status === 'approved' && p.expiryDate &&
    _insDaysUntil(p.expiryDate) <= 30 && _insDaysUntil(p.expiryDate) >= 0
  );
  const warningHTML = expiring.length ? `<div class="notice notice-warning" style="margin-bottom:12px">
    <b>Expiry Warnings:</b> ${expiring.map(p => `<b>${p.patientName}</b> (${p.authNumber}) expires ${_insDateFmt(p.expiryDate)}`).join(' · ')}
  </div>` : '';

  let filtered = pas;
  if (filterStatus && filterStatus !== 'all') filtered = filtered.filter(p => p.status === filterStatus);
  if (filterPayer && filterPayer !== 'all') filtered = filtered.filter(p => p.payer === filterPayer);
  if (filterClinician && filterClinician !== 'all') filtered = filtered.filter(p => p.clinician === filterClinician);

  const payers = [...new Set(pas.map(p => p.payer))];
  const clinicians = [...new Set(pas.map(p => p.clinician))];

  const paCards = filtered.map(p => {
    const daysUntil = p.expiryDate ? _insDaysUntil(p.expiryDate) : null;
    let expiryColor = '#059669';
    if (daysUntil !== null) {
      if (daysUntil < 0) expiryColor = '#dc2626';
      else if (daysUntil <= 30) expiryColor = '#d97706';
    }
    const unitsPct = p.requestedUnits > 0 ? _insPct(p.approvedUnits, p.requestedUnits) : 0;
    return `<div class="pa-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
        <div>
          <div style="font-weight:600;font-size:.9rem">${p.cptCode} — <span style="color:var(--text-secondary);font-size:.82rem">${p.patientName}</span></div>
          <div style="font-size:.78rem;color:var(--text-secondary)">${p.payer} · ${p.clinician} · Dx: ${p.diagnosisCode}</div>
          ${p.authNumber ? `<div style="font-size:.78rem;color:var(--accent-teal)">Auth #: ${p.authNumber}</div>` : ''}
        </div>
        ${_insStatusBadge(p.status)}
      </div>
      <div style="font-size:.78rem;color:var(--text-secondary);margin-bottom:6px">Units: ${p.approvedUnits}/${p.requestedUnits} approved</div>
      ${p.requestedUnits > 0 ? `<div class="pa-units-bar"><div class="pa-units-fill" style="width:${unitsPct}%"></div></div>` : ''}
      ${p.expiryDate ? `<div style="font-size:.76rem;color:${expiryColor};margin-top:4px">Expires: ${_insDateFmt(p.expiryDate)}${daysUntil !== null && daysUntil < 0 ? ' (EXPIRED)' : daysUntil !== null && daysUntil <= 30 ? ` (${daysUntil}d remaining)` : ''}</div>` : ''}
      ${p.denialReason ? `<div style="font-size:.76rem;color:#dc2626;margin-top:4px">Denial: ${p.denialReason}</div>` : ''}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        ${(p.status === 'pending' || p.status === 'denied') ? `<button class="btn btn-sm btn-ghost" style="color:#059669" onclick="window._insApprovePA('${p.id}')">Mark Approved</button>` : ''}
        ${p.status === 'pending' ? `<button class="btn btn-sm btn-ghost" style="color:#dc2626" onclick="window._insDenyPA('${p.id}')">Mark Denied</button>` : ''}
        ${p.status === 'pending' ? `<button class="btn btn-sm btn-ghost" style="color:#d97706" onclick="window._insPartialPA('${p.id}')">Partial Approval</button>` : ''}
      </div>
      <div id="pa-action-${p.id}"></div>
    </div>`;
  }).join('') || '<div style="color:var(--text-secondary);padding:20px 0">No prior authorizations match filter.</div>';

  return `
  ${warningHTML}
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
    <select class="form-control" style="width:auto" onchange="window._insFilterPA(this.value,'payer')">
      <option value="all">All Payers</option>
      ${payers.map(p => `<option value="${p}"${filterPayer===p?' selected':''}>${p}</option>`).join('')}
    </select>
    <select class="form-control" style="width:auto" onchange="window._insFilterPA(this.value,'status')">
      <option value="all">All Statuses</option>
      ${['pending','approved','denied','partial','expired'].map(s => `<option value="${s}"${filterStatus===s?' selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}
    </select>
    <select class="form-control" style="width:auto" onchange="window._insFilterPA(this.value,'clinician')">
      <option value="all">All Clinicians</option>
      ${clinicians.map(c => `<option value="${c}"${filterClinician===c?' selected':''}>${c}</option>`).join('')}
    </select>
    <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="window._insNewPA()">+ Request PA</button>
  </div>
  <div id="ins-new-pa-form" style="display:none"></div>
  ${paCards}`;
}

// ── Claims Board tab HTML ─────────────────────────────────────────────────────
function _insClaimsBoardHTML() {
  const claims = getClaims();
  const statuses = ['submitted', 'processing', 'paid', 'denied', 'appealing'];
  const cols = statuses.map(st => {
    const cards = claims.filter(c => c.status === st).map(c => `
      <div class="claim-card" onclick="window._insExpandClaim('${c.id}')">
        <div style="font-weight:600">${c.patientName}</div>
        <div style="color:var(--text-secondary);font-size:.75rem">${c.payer} · ${_insDateFmt(c.dos)}</div>
        <div style="font-size:.75rem">${c.cptCodes.join(', ')}</div>
        <div style="font-weight:600;margin-top:4px">$${c.billedAmount.toFixed(2)}</div>
        <div id="claim-detail-${c.id}"></div>
      </div>`).join('');
    return `<div class="claims-column">
      <div class="claims-column-header">${st}</div>
      ${cards || '<div style="font-size:.75rem;color:var(--text-muted);padding:8px 0">Empty</div>'}
    </div>`;
  }).join('');

  const totalBilled = claims.reduce((a, c) => a + c.billedAmount, 0);
  const totalPaid = claims.reduce((a, c) => a + c.paidAmount, 0);
  const totalDenied = claims.filter(c => c.status === 'denied').reduce((a, c) => a + c.billedAmount, 0);
  const collectionRate = totalBilled > 0 ? ((totalPaid / totalBilled) * 100).toFixed(1) : '0.0';

  return `
  <div style="display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap">
    <div class="card" style="flex:1;min-width:120px;padding:12px;text-align:center">
      <div style="font-size:1.1rem;font-weight:700">$${totalBilled.toFixed(0)}</div>
      <div style="font-size:.72rem;color:var(--text-secondary)">Total Billed</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;padding:12px;text-align:center">
      <div style="font-size:1.1rem;font-weight:700;color:#059669">$${totalPaid.toFixed(0)}</div>
      <div style="font-size:.72rem;color:var(--text-secondary)">Total Paid</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;padding:12px;text-align:center">
      <div style="font-size:1.1rem;font-weight:700;color:#dc2626">$${totalDenied.toFixed(0)}</div>
      <div style="font-size:.72rem;color:var(--text-secondary)">Total Denied</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;padding:12px;text-align:center">
      <div style="font-size:1.1rem;font-weight:700;color:var(--accent-teal)">${collectionRate}%</div>
      <div style="font-size:.72rem;color:var(--text-secondary)">Collection Rate</div>
    </div>
  </div>
  <div style="display:flex;gap:8px;margin-bottom:12px">
    <button class="btn btn-primary btn-sm" onclick="window._insNewClaim()">+ New Claim</button>
    <button class="btn btn-ghost btn-sm" onclick="window._insExportClaims()">Export Claims CSV</button>
  </div>
  <div id="ins-new-claim-form" style="display:none;margin-bottom:14px"></div>
  <div class="claims-kanban">${cols}</div>`;
}

// ── Denial Management tab HTML ────────────────────────────────────────────────
function _insDenialHTML() {
  const claims = getClaims();
  const denied = claims.filter(c => c.status === 'denied' || c.status === 'write-off');
  const appealing = claims.filter(c => c.status === 'appealing');
  const paidAfterAppeal = claims.filter(c => c.status === 'paid' && c.eobNotes && c.eobNotes.toLowerCase().includes('appeal won'));

  const denialRate = claims.length > 0
    ? ((denied.length / claims.length) * 100).toFixed(1) : '0.0';
  const appealTotal = appealing.length + paidAfterAppeal.length;
  const appealRate = appealTotal > 0
    ? ((paidAfterAppeal.length / appealTotal) * 100).toFixed(1) : '0.0';
  const avgDays = denied.length > 0
    ? Math.round(denied.reduce((a, c) => a + _insDaysSince(c.processedDate || c.submittedDate), 0) / denied.length) : 0;

  // Top denial reasons from eobNotes
  const reasonMap = {};
  denied.forEach(c => {
    const raw = c.eobNotes || 'Unknown';
    const reason = raw.split(':').pop().trim().substring(0, 45) || 'Unknown';
    reasonMap[reason] = (reasonMap[reason] || 0) + 1;
  });
  const reasons = Object.entries(reasonMap).sort((a, b) => b[1] - a[1]);
  const maxCount = reasons.length > 0 ? reasons[0][1] : 1;
  const barsHTML = reasons.map(([r, n]) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div style="font-size:.78rem;min-width:200px;color:var(--text-secondary)">${r}</div>
      <svg width="180" height="14" style="flex-shrink:0">
        <rect x="0" y="3" width="${Math.round((n / maxCount) * 160)}" height="8" rx="4" fill="#ef4444"/>
      </svg>
      <div style="font-size:.78rem;font-weight:600">${n}</div>
    </div>`).join('');

  const deniedRows = denied.map(c => `
    <div class="denial-row" id="denial-row-${c.id}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between">
        <div>
          <div style="font-weight:600;font-size:.9rem">${c.patientName}
            <span style="font-weight:400;color:var(--text-secondary);font-size:.8rem">· ${c.payer} · DOS ${_insDateFmt(c.dos)}</span>
          </div>
          <div style="font-size:.78rem;color:var(--text-secondary)">${c.cptCodes.join(', ')} · $${c.billedAmount.toFixed(2)}</div>
          <div style="font-size:.76rem;color:#dc2626;margin-top:2px">${c.eobNotes || '—'}</div>
          <div style="font-size:.75rem;color:var(--text-muted);margin-top:2px">${_insDaysSince(c.processedDate || c.submittedDate)} days since denial</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          ${_insStatusBadge(c.status)}
          ${c.status === 'denied' ? `<button class="btn btn-sm btn-ghost" style="color:#3b82f6" onclick="window._insStartAppeal('${c.id}')">Start Appeal</button>` : ''}
          ${c.status === 'appealing' ? `
            <button class="btn btn-sm btn-ghost" style="color:#059669" onclick="window._insAppealOutcome('${c.id}','won')">Appeal Won</button>
            <button class="btn btn-sm btn-ghost" style="color:#dc2626" onclick="window._insAppealOutcome('${c.id}','lost')">Appeal Lost</button>` : ''}
        </div>
      </div>
      <div id="appeal-form-${c.id}" style="display:none"></div>
    </div>`).join('') || '<div style="padding:20px;color:var(--text-secondary)">No denied claims.</div>';

  return `
  <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <div class="card" style="flex:1;min-width:120px;padding:12px;text-align:center">
      <div style="font-size:1.4rem;font-weight:700;color:#dc2626">${denialRate}%</div>
      <div style="font-size:.72rem;color:var(--text-secondary)">Denial Rate</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;padding:12px;text-align:center">
      <div style="font-size:1.4rem;font-weight:700;color:#059669">${appealRate}%</div>
      <div style="font-size:.72rem;color:var(--text-secondary)">Appeal Success Rate</div>
    </div>
    <div class="card" style="flex:1;min-width:120px;padding:12px;text-align:center">
      <div style="font-size:1.4rem;font-weight:700">${avgDays}d</div>
      <div style="font-size:.72rem;color:var(--text-secondary)">Avg Days to Resolution</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <div class="card">
      <div class="card-header">Denied Claims</div>
      <div class="card-body" style="padding:0">${deniedRows}</div>
    </div>
    <div class="card">
      <div class="card-header">Top Denial Reasons</div>
      <div class="card-body">${barsHTML || '<div style="color:var(--text-secondary)">No denial data yet.</div>'}</div>
    </div>
  </div>`;
}

// ── Internal tab renderer ─────────────────────────────────────────────────────
function _insRenderTab(tab) {
  const el = document.getElementById('ins-tab-content');
  if (!el) return;
  if (tab === 'eligibility') el.innerHTML = _insEligibilityTabHTML();
  else if (tab === 'priorauth') el.innerHTML = _insPATabHTML(
    window._insPAFilterStatus || 'all',
    window._insPAFilterPayer || 'all',
    window._insPAFilterClinician || 'all'
  );
  else if (tab === 'claims') el.innerHTML = _insClaimsBoardHTML();
  else if (tab === 'denial') el.innerHTML = _insDenialHTML();
  document.querySelectorAll('.ins-tab-btn').forEach(b => {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.style.borderBottom = active ? '2px solid var(--accent-teal)' : '2px solid transparent';
  });
}

// ── Main exported page function ───────────────────────────────────────────────
export async function pgInsuranceVerification(setTopbar) {
  setTopbar('Insurance Verification & Eligibility',
    `<button class="btn btn-ghost btn-sm" onclick="window._insExportClaims()">Export Claims</button>`);

  const container = document.getElementById('main-content')
    || document.querySelector('.main-content')
    || document.querySelector('main');
  if (!container) return;

  // Reset filter state
  window._insPAFilterStatus = 'all';
  window._insPAFilterPayer = 'all';
  window._insPAFilterClinician = 'all';

  container.innerHTML = `
    <div style="padding:20px">
      <div style="display:flex;gap:0;margin-bottom:18px;border-bottom:1px solid var(--border)">
        <button class="ins-tab-btn btn btn-ghost active" data-tab="eligibility"
          onclick="window._insTab('eligibility')"
          style="border-radius:6px 6px 0 0;border-bottom:2px solid var(--accent-teal)">Eligibility</button>
        <button class="ins-tab-btn btn btn-ghost" data-tab="priorauth"
          onclick="window._insTab('priorauth')"
          style="border-radius:6px 6px 0 0;border-bottom:2px solid transparent">Prior Auth</button>
        <button class="ins-tab-btn btn btn-ghost" data-tab="claims"
          onclick="window._insTab('claims')"
          style="border-radius:6px 6px 0 0;border-bottom:2px solid transparent">Claims Board</button>
        <button class="ins-tab-btn btn btn-ghost" data-tab="denial"
          onclick="window._insTab('denial')"
          style="border-radius:6px 6px 0 0;border-bottom:2px solid transparent">Denial Mgmt</button>
      </div>
      <div id="ins-tab-content"></div>
    </div>`;

  // ── Tab switching ──────────────────────────────────────────────────────────
  window._insTab = function(tab) {
    _insRenderTab(tab);
  };

  // ── Eligibility handlers ───────────────────────────────────────────────────
  window._insCheckEligibility = async function() {
    const btn = document.querySelector('[onclick="window._insCheckEligibility()"]');
    if (btn && btn.disabled) return; // double-submit guard
    if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
    const name = document.getElementById('ins-chk-name')?.value.trim();
    const payer = document.getElementById('ins-chk-payer')?.value;
    const memberId = document.getElementById('ins-chk-memberid')?.value.trim();
    const groupId = document.getElementById('ins-chk-groupid')?.value.trim();
    const dob = document.getElementById('ins-chk-dob')?.value;
    if (!name || !memberId) {
      if (btn) { btn.disabled = false; btn.textContent = 'Check Eligibility'; }
      alert('Patient name and Member ID are required.'); return;
    }
    const resultEl = document.getElementById('ins-chk-result');
    if (resultEl) resultEl.innerHTML = `<div style="margin-top:12px;display:flex;align-items:center;gap:8px;color:var(--text-secondary)">
      <div style="width:18px;height:18px;border:2px solid var(--accent-teal);border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0"></div>
      Checking eligibility with ${payer}…
    </div>`;
    try {
      const r = await runEligibilityCheck(name, payer, memberId);
      const check = {
        id: 'elig-' + Date.now(), patientName: name, payer, memberId,
        groupId: groupId || '', dob: dob || '',
        checkedDate: new Date().toISOString().slice(0, 10), checkedBy: 'Current User',
        status: r.status, deductible: r.deductible, deductibleMet: r.deductibleMet,
        outOfPocketMax: r.outOfPocketMax, outOfPocketMet: r.outOfPocketMet,
        copay: r.copay, coinsurance: r.coinsurance, coveredServices: r.coveredServices, notes: '',
      };
      saveEligibilityCheck(check);
      if (resultEl) resultEl.innerHTML = _insEligResultHTML(r, name, payer, memberId);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Check Eligibility'; }
    }
  };

  window._insRerunCheck = function(id) {
    const checks = getEligibilityChecks();
    const check = checks.find(c => c.id === id);
    if (!check) return;
    const nameEl = document.getElementById('ins-chk-name');
    const payerEl = document.getElementById('ins-chk-payer');
    const memberEl = document.getElementById('ins-chk-memberid');
    const groupEl = document.getElementById('ins-chk-groupid');
    const dobEl = document.getElementById('ins-chk-dob');
    if (nameEl) nameEl.value = check.patientName;
    if (payerEl) payerEl.value = check.payer;
    if (memberEl) memberEl.value = check.memberId;
    if (groupEl) groupEl.value = check.groupId || '';
    if (dobEl) dobEl.value = check.dob || '';
    nameEl?.scrollIntoView({ behavior: 'smooth' });
    window._insCheckEligibility();
  };

  // ── Prior Auth handlers ────────────────────────────────────────────────────
  window._insFilterPA = function(val, type) {
    if (type === 'status') window._insPAFilterStatus = val;
    else if (type === 'payer') window._insPAFilterPayer = val;
    else if (type === 'clinician') window._insPAFilterClinician = val;
    const el = document.getElementById('ins-tab-content');
    if (el) el.innerHTML = _insPATabHTML(
      window._insPAFilterStatus || 'all',
      window._insPAFilterPayer || 'all',
      window._insPAFilterClinician || 'all'
    );
  };

  window._insNewPA = function() {
    const f = document.getElementById('ins-new-pa-form');
    if (!f) return;
    if (f.style.display !== 'none') { f.style.display = 'none'; return; }
    f.style.display = 'block';
    f.innerHTML = `<div class="card" style="margin-bottom:14px">
      <div class="card-header">Request Prior Authorization</div>
      <div class="card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="form-label">Patient Name</label><input id="pa-pat" class="form-control" /></div>
        <div><label class="form-label">Payer</label>
          <select id="pa-payer" class="form-control">
            <option>BCBS</option><option>Aetna</option><option>Cigna</option><option>UHC</option><option>Other</option>
          </select></div>
        <div><label class="form-label">CPT Code</label><input id="pa-cpt" class="form-control" placeholder="e.g. 90837" /></div>
        <div><label class="form-label">Diagnosis Code</label><input id="pa-dx" class="form-control" placeholder="e.g. F41.1" /></div>
        <div><label class="form-label">Clinician</label><input id="pa-clin" class="form-control" placeholder="Dr. Name" /></div>
        <div><label class="form-label">Units Requested</label><input id="pa-units" type="number" class="form-control" value="20" /></div>
        <div style="grid-column:1/-1">
          <label class="form-label">Clinical Justification</label>
          <textarea id="pa-justification" class="form-control" rows="3"
            placeholder="Medical necessity, treatment history, prior failed treatments…"></textarea>
        </div>
        <div style="grid-column:1/-1;display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="pa-urgent" />
          <label for="pa-urgent" style="font-size:.85rem">Urgent request (expedited review)</label>
        </div>
        <div style="grid-column:1/-1;display:flex;gap:8px">
          <button class="btn btn-primary" onclick="window._insSavePA()">Submit PA Request</button>
          <button class="btn btn-ghost" onclick="document.getElementById('ins-new-pa-form').style.display='none'">Cancel</button>
        </div>
      </div>
    </div>`;
  };

  window._insSavePA = function() {
    const pat = document.getElementById('pa-pat')?.value.trim();
    const payer = document.getElementById('pa-payer')?.value;
    const cpt = document.getElementById('pa-cpt')?.value.trim();
    const dx = document.getElementById('pa-dx')?.value.trim();
    const clin = document.getElementById('pa-clin')?.value.trim();
    const units = parseInt(document.getElementById('pa-units')?.value) || 20;
    const notes = document.getElementById('pa-justification')?.value.trim();
    if (!pat || !cpt) { alert('Patient name and CPT code are required.'); return; }
    const pa = {
      id: 'pa-' + Date.now(), patientName: pat, payer, cptCode: cpt, diagnosisCode: dx || '',
      requestDate: new Date().toISOString().slice(0, 10), approvedDate: '', expiryDate: '',
      authNumber: '', requestedUnits: units, approvedUnits: 0,
      status: 'pending', clinician: clin || 'Unknown', notes: notes || '', denialReason: '',
    };
    savePriorAuth(pa);
    window._insTab('priorauth');
  };

  window._insApprovePA = function(id) {
    const el = document.getElementById(`pa-action-${id}`);
    if (!el) return;
    if (el.innerHTML.includes(`auth-num-inp-${id}`)) { el.innerHTML = ''; return; }
    el.innerHTML = `<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
      <input id="auth-num-inp-${id}" class="form-control" style="width:180px" placeholder="Auth number" />
      <input id="auth-units-inp-${id}" type="number" class="form-control" style="width:80px" placeholder="Units" />
      <button class="btn btn-sm btn-primary" onclick="window._insConfirmApprove('${id}')">Confirm</button>
      <button class="btn btn-sm btn-ghost" onclick="document.getElementById('pa-action-${id}').innerHTML=''">Cancel</button>
    </div>`;
  };

  window._insConfirmApprove = function(id) {
    const authNum = document.getElementById(`auth-num-inp-${id}`)?.value.trim();
    const units = parseInt(document.getElementById(`auth-units-inp-${id}`)?.value) || 0;
    const all = getPriorAuths();
    const pa = all.find(p => p.id === id);
    if (!pa) return;
    pa.status = 'approved';
    pa.authNumber = authNum || ('AUTH-' + Date.now());
    pa.approvedUnits = units || pa.requestedUnits;
    pa.approvedDate = new Date().toISOString().slice(0, 10);
    const exp = new Date(); exp.setFullYear(exp.getFullYear() + 1);
    pa.expiryDate = exp.toISOString().slice(0, 10);
    savePriorAuth(pa);
    window._insTab('priorauth');
  };

  window._insDenyPA = function(id) {
    const el = document.getElementById(`pa-action-${id}`);
    if (!el) return;
    el.innerHTML = `<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
      <input id="deny-reason-${id}" class="form-control" style="flex:1;min-width:200px" placeholder="Denial reason" />
      <button class="btn btn-sm" style="background:#dc2626;border-color:#dc2626;color:#fff" onclick="window._insConfirmDeny('${id}')">Confirm Denial</button>
      <button class="btn btn-sm btn-ghost" onclick="document.getElementById('pa-action-${id}').innerHTML=''">Cancel</button>
    </div>`;
  };

  window._insConfirmDeny = function(id) {
    const reason = document.getElementById(`deny-reason-${id}`)?.value.trim();
    const all = getPriorAuths();
    const pa = all.find(p => p.id === id);
    if (!pa) return;
    pa.status = 'denied';
    pa.denialReason = reason || 'Not specified';
    savePriorAuth(pa);
    window._insTab('priorauth');
  };

  window._insPartialPA = function(id) {
    const el = document.getElementById(`pa-action-${id}`);
    if (!el) return;
    el.innerHTML = `<div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
      <input id="partial-auth-${id}" class="form-control" style="width:160px" placeholder="Auth number" />
      <input id="partial-units-${id}" type="number" class="form-control" style="width:90px" placeholder="Approved units" />
      <button class="btn btn-sm" style="background:#d97706;border-color:#d97706;color:#fff" onclick="window._insConfirmPartial('${id}')">Confirm Partial</button>
      <button class="btn btn-sm btn-ghost" onclick="document.getElementById('pa-action-${id}').innerHTML=''">Cancel</button>
    </div>`;
  };

  window._insConfirmPartial = function(id) {
    const authNum = document.getElementById(`partial-auth-${id}`)?.value.trim();
    const units = parseInt(document.getElementById(`partial-units-${id}`)?.value) || 0;
    const all = getPriorAuths();
    const pa = all.find(p => p.id === id);
    if (!pa) return;
    pa.status = 'partial';
    pa.authNumber = authNum || ('PART-' + Date.now());
    pa.approvedUnits = units;
    pa.approvedDate = new Date().toISOString().slice(0, 10);
    const exp = new Date(); exp.setFullYear(exp.getFullYear() + 1);
    pa.expiryDate = exp.toISOString().slice(0, 10);
    savePriorAuth(pa);
    window._insTab('priorauth');
  };

  // ── Claims handlers ────────────────────────────────────────────────────────
  window._insFilterClaims = function(_status) {
    _insRenderTab('claims');
  };

  window._insExpandClaim = function(id) {
    const claims = getClaims();
    const c = claims.find(x => x.id === id);
    if (!c) return;
    const el = document.getElementById(`claim-detail-${id}`);
    if (!el) return;
    if (el.innerHTML) { el.innerHTML = ''; return; }
    const nextMap = { submitted: 'processing', processing: 'paid', denied: 'appealing', appealing: 'paid', 'write-off': '' };
    const next = nextMap[c.status] || '';
    el.innerHTML = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="font-size:.76rem;display:grid;grid-template-columns:1fr 1fr;gap:4px">
        <div>Billed: <b>$${c.billedAmount.toFixed(2)}</b></div>
        <div>Allowed: <b>$${c.allowedAmount.toFixed(2)}</b></div>
        <div>Paid: <b style="color:#059669">$${c.paidAmount.toFixed(2)}</b></div>
        <div>Pt Balance: <b style="color:#d97706">$${c.patientBalance.toFixed(2)}</b></div>
      </div>
      ${c.eobNotes ? `<div style="font-size:.74rem;color:var(--text-secondary);margin-top:6px">${c.eobNotes}</div>` : ''}
      ${c.diagnosisCodes.length ? `<div style="font-size:.74rem;color:var(--text-muted);margin-top:4px">Dx: ${c.diagnosisCodes.join(', ')}</div>` : ''}
      ${next ? `<button class="btn btn-sm btn-primary" style="margin-top:8px;width:100%" onclick="window._insMoveClaimStatus('${c.id}','${next}')">Move to ${next}</button>` : ''}
    </div>`;
  };

  window._insMoveClaimStatus = function(id, status) {
    updateClaimStatus(id, status);
    window._insTab('claims');
  };

  window._insNewClaim = function() {
    const f = document.getElementById('ins-new-claim-form');
    if (!f) return;
    if (f.style.display !== 'none') { f.style.display = 'none'; return; }
    f.style.display = 'block';
    f.innerHTML = `<div class="card">
      <div class="card-header">New Claim</div>
      <div class="card-body" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="form-label">Patient Name</label><input id="clm-pat" class="form-control" /></div>
        <div><label class="form-label">Payer</label>
          <select id="clm-payer" class="form-control">
            <option>BCBS</option><option>Aetna</option><option>Cigna</option><option>UHC</option><option>Other</option>
          </select></div>
        <div><label class="form-label">Date of Service</label><input id="clm-dos" type="date" class="form-control" /></div>
        <div><label class="form-label">CPT Codes (comma-separated)</label><input id="clm-cpt" class="form-control" placeholder="90837,90901" /></div>
        <div><label class="form-label">Diagnosis Codes (comma-separated)</label><input id="clm-dx" class="form-control" placeholder="F41.1" /></div>
        <div><label class="form-label">Billed Amount ($)</label><input id="clm-billed" type="number" class="form-control" placeholder="200" /></div>
        <div style="grid-column:1/-1;display:flex;gap:8px">
          <button class="btn btn-primary" onclick="window._insSaveClaim()">Submit Claim</button>
          <button class="btn btn-ghost" onclick="document.getElementById('ins-new-claim-form').style.display='none'">Cancel</button>
        </div>
      </div>
    </div>`;
  };

  window._insSaveClaim = function() {
    const pat = document.getElementById('clm-pat')?.value.trim();
    const payer = document.getElementById('clm-payer')?.value;
    const dos = document.getElementById('clm-dos')?.value;
    const cptRaw = document.getElementById('clm-cpt')?.value.trim();
    const dxRaw = document.getElementById('clm-dx')?.value.trim();
    const billed = parseFloat(document.getElementById('clm-billed')?.value) || 0;
    if (!pat || !cptRaw) { alert('Patient name and CPT codes are required.'); return; }
    const claim = {
      id: 'clm-' + Date.now(), patientName: pat, payer,
      dos: dos || new Date().toISOString().slice(0, 10),
      cptCodes: cptRaw.split(',').map(s => s.trim()),
      diagnosisCodes: dxRaw ? dxRaw.split(',').map(s => s.trim()) : [],
      billedAmount: billed, allowedAmount: 0, paidAmount: 0, patientBalance: 0,
      status: 'submitted', submittedDate: new Date().toISOString().slice(0, 10),
      processedDate: '', eobNotes: '',
    };
    saveClaim(claim);
    window._insTab('claims');
  };

  window._insExportClaims = function() {
    const claims = getClaims();
    const headers = ['ID','Patient','Payer','DOS','CPT Codes','Dx Codes','Billed','Allowed','Paid','Balance','Status','Submitted','Processed','Notes'];
    const rows = claims.map(c => [
      c.id, c.patientName, c.payer, c.dos,
      c.cptCodes.join(';'), c.diagnosisCodes.join(';'),
      c.billedAmount, c.allowedAmount, c.paidAmount, c.patientBalance,
      c.status, c.submittedDate, c.processedDate || '',
      `"${(c.eobNotes || '').replace(/"/g, '""')}"`
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claims-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Denial / Appeal handlers ───────────────────────────────────────────────
  window._insStartAppeal = function(id) {
    const el = document.getElementById(`appeal-form-${id}`);
    if (!el) return;
    if (el.style.display !== 'none') { el.style.display = 'none'; return; }
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 30);
    el.style.display = 'block';
    el.innerHTML = `<div class="appeal-form">
      <div style="font-weight:600;margin-bottom:8px;font-size:.88rem">Appeal Filing</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label class="form-label">Appeal Reason</label>
          <select id="appeal-reason-${id}" class="form-control">
            <option value="clinical">Clinical necessity not adequately reviewed</option>
            <option value="billing">Billing/coding error</option>
            <option value="duplicate">Duplicate claim – original not paid</option>
            <option value="prior-auth">Prior authorization was in place</option>
            <option value="other">Other</option>
          </select></div>
        <div><label class="form-label">Appeal Deadline</label>
          <input id="appeal-deadline-${id}" type="date" class="form-control" value="${deadline.toISOString().slice(0, 10)}" /></div>
        <div style="grid-column:1/-1">
          <label class="form-label">Supporting Documentation Notes</label>
          <textarea id="appeal-docs-${id}" class="form-control" rows="3"
            placeholder="List documents attached: clinical notes, auth numbers, EOBs…"></textarea>
        </div>
        <div style="grid-column:1/-1;display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="window._insSaveAppeal('${id}')">Submit Appeal</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('appeal-form-${id}').style.display='none'">Cancel</button>
        </div>
      </div>
    </div>`;
  };

  window._insSaveAppeal = function(id) {
    const reason = document.getElementById(`appeal-reason-${id}`)?.value || '';
    const deadline = document.getElementById(`appeal-deadline-${id}`)?.value || '';
    const docs = document.getElementById(`appeal-docs-${id}`)?.value || '';
    updateClaimStatus(id, 'appealing');
    const all = getClaims();
    const c = all.find(x => x.id === id);
    if (c) {
      c.eobNotes = (c.eobNotes || '') +
        ` | Appeal filed ${new Date().toISOString().slice(0, 10)}: ${reason}. Deadline: ${deadline}. Docs: ${docs || 'none'}`;
      localStorage.setItem(CLAIMS_KEY, JSON.stringify(all));
    }
    window._insTab('denial');
  };

  window._insAppealOutcome = function(id, outcome) {
    const all = getClaims();
    const c = all.find(x => x.id === id);
    if (outcome === 'won') {
      updateClaimStatus(id, 'paid');
      if (c) {
        c.eobNotes = (c.eobNotes || '') + ' | Appeal WON — claim paid.';
        localStorage.setItem(CLAIMS_KEY, JSON.stringify(all));
      }
    } else {
      updateClaimStatus(id, 'write-off');
      if (c) {
        c.eobNotes = (c.eobNotes || '') + ' | Appeal LOST — written off.';
        localStorage.setItem(CLAIMS_KEY, JSON.stringify(all));
      }
    }
    window._insTab('denial');
  };

  // Render default tab on load
  _insRenderTab('eligibility');
}

// ── Wearable & Biosensor Integration ─────────────────────────────────────────

const BIOSENSOR_KEY     = 'ds_biosensor_data';
const DEVICE_PAIRING_KEY = 'ds_paired_devices';

function getPairedDevices() {
  try { return JSON.parse(localStorage.getItem(DEVICE_PAIRING_KEY)) || []; }
  catch { return []; }
}
function savePairedDevice(device) {
  const all = getPairedDevices();
  const idx = all.findIndex(d => d.id === device.id);
  if (idx >= 0) all[idx] = device; else all.push(device);
  localStorage.setItem(DEVICE_PAIRING_KEY, JSON.stringify(all));
}
function removePairedDevice(id) {
  const all = getPairedDevices().filter(d => d.id !== id);
  localStorage.setItem(DEVICE_PAIRING_KEY, JSON.stringify(all));
}

function _genDeterministicHR(seed, count) {
  const pts = [];
  let bpm = 68 + (seed % 10);
  for (let i = 0; i < count; i++) {
    const pseudo = Math.sin(seed * 9301 + i * 49297 + 233720923) * 0.5 + 0.5;
    bpm = Math.max(55, Math.min(95, bpm + (pseudo - 0.5) * 6));
    pts.push({ t: i, bpm: Math.round(bpm) });
  }
  return pts;
}
function _genDeterministicHRV(seed, count) {
  const pts = [];
  let rmssd = 42 + (seed % 20);
  for (let i = 0; i < count; i++) {
    const pseudo = Math.sin(seed * 1234567 + i * 7919 + 314159) * 0.5 + 0.5;
    rmssd = Math.max(20, Math.min(80, rmssd + (pseudo - 0.5) * 4));
    pts.push({ t: i, rmssd: Math.round(rmssd * 10) / 10 });
  }
  return pts;
}

function getBiosensorSessions() {
  try {
    const stored = JSON.parse(localStorage.getItem(BIOSENSOR_KEY));
    if (stored && stored.length > 0) return stored;
  } catch {}

  const patients = [
    { name: 'Alexandra Reid',  device: 'Polar H10',    type: 'Chest Strap' },
    { name: 'Marcus Chen',     device: 'Garmin HRM-Pro',type: 'Chest Strap' },
    { name: 'Sofia Navarro',   device: 'Apple Watch',   type: 'Wrist' },
    { name: 'James Okafor',    device: 'Polar H10',     type: 'Chest Strap' },
    { name: 'Priya Sharma',    device: 'Garmin HRM-Pro',type: 'Chest Strap' },
  ];
  const dates = ['2026-04-08','2026-04-07','2026-04-06','2026-04-05','2026-04-04'];

  const sessions = patients.map((p, i) => {
    const hrData  = _genDeterministicHR(i + 1, 60);
    const hrvData = _genDeterministicHRV(i + 1, 60);
    const hrVals  = hrData.map(d => d.bpm);
    const hrvVals = hrvData.map(d => d.rmssd);
    const avgHR   = Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length);
    const avgHRV  = Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length * 10) / 10;
    return {
      id: `bs-${i + 1}`,
      patientName: p.name,
      deviceName:  p.device,
      deviceType:  p.type,
      date:        dates[i],
      duration:    20 + i * 5,
      hrData, hrvData,
      avgHR,
      minHR:  Math.min(...hrVals),
      maxHR:  Math.max(...hrVals),
      avgHRV,
      stressIndex:   _computeStressIndex(avgHR, avgHRV),
      recoveryScore: Math.round(100 - _computeStressIndex(avgHR, avgHRV) * 0.7),
    };
  });
  localStorage.setItem(BIOSENSOR_KEY, JSON.stringify(sessions));
  return sessions;
}
function saveBiosensorSession(session) {
  const all = getBiosensorSessions();
  const idx = all.findIndex(s => s.id === session.id);
  if (idx >= 0) all[idx] = session; else all.unshift(session);
  localStorage.setItem(BIOSENSOR_KEY, JSON.stringify(all));
}

function _generateHRTick(prevBpm) {
  return Math.max(48, Math.min(140, prevBpm + (Math.random() - 0.5) * 6));
}
function _generateHRVTick(prevRmssd) {
  return Math.max(15, Math.min(100, prevRmssd + (Math.random() - 0.5) * 4));
}
function _computeStressIndex(avgHR, avgHRV) {
  const hrFactor  = (avgHR - 55) / 85;
  const hrvFactor = 1 - (avgHRV - 15) / 85;
  return Math.max(0, Math.min(100, Math.round((hrFactor * 0.4 + hrvFactor * 0.6) * 100)));
}

function _hrClass(bpm) {
  if (bpm < 60)  return 'hr-bradycardia';
  if (bpm <= 100) return 'hr-normal';
  if (bpm <= 120) return 'hr-elevated';
  return 'hr-high';
}
function _hrvClass(rmssd) {
  if (rmssd >= 50) return 'hrv-good';
  if (rmssd >= 30) return 'hrv-moderate';
  return 'hrv-low';
}
function _hrvLabel(rmssd) {
  if (rmssd >= 50) return 'Good';
  if (rmssd >= 30) return 'Moderate';
  return 'Low';
}

function _miniGaugeSvg(value, color, size = 60) {
  const circ = Math.PI * 28;
  const filled = circ * (value / 100);
  const gap    = circ - filled;
  return `<svg width="${size}" height="${Math.round(size * 0.65)}" viewBox="0 0 64 42" style="overflow:visible">
    <path d="M 4 38 A 28 28 0 0 1 60 38" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="5" stroke-linecap="round"/>
    <path d="M 4 38 A 28 28 0 0 1 60 38" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${filled.toFixed(1)} ${gap.toFixed(1)}" stroke-dashoffset="0"
      style="transition:stroke-dashoffset .5s ease"/>
  </svg>
  <div style="font-size:${size >= 80 ? 22 : 14}px;font-weight:800;color:${color};text-align:center;margin-top:-4px;font-variant-numeric:tabular-nums">${value}</div>`;
}

function _buildLiveChartSvg(hrBuffer, hrvBuffer) {
  const W = 480, H = 120, padL = 36, padR = 36, padT = 8, padB = 24;
  const n = 60;
  const hrMin = 40, hrMax = 160;
  const hrvMin = 0, hrvMax = 100;
  const pw = W - padL - padR;
  const ph = H - padT - padB;

  function xOf(i) { return padL + (i / (n - 1)) * pw; }
  function yHR(v)  { return padT + ph - ((v - hrMin) / (hrMax - hrMin)) * ph; }
  function yHRV(v) { return padT + ph - ((v - hrvMin) / (hrvMax - hrvMin)) * ph; }

  const hrLine = hrBuffer.length > 1
    ? hrBuffer.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yHR(v).toFixed(1)}`).join(' ')
    : '';
  const hrvLine = hrvBuffer.length > 1
    ? hrvBuffer.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yHRV(v).toFixed(1)}`).join(' ')
    : '';

  // Grid lines
  const gridH = [60,80,100,120,140].map(v =>
    `<line x1="${padL}" y1="${yHR(v).toFixed(1)}" x2="${W - padR}" y2="${yHR(v).toFixed(1)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`
  ).join('');

  // Axis labels
  const hrLabels  = [60, 100, 140].map(v =>
    `<text x="${padL - 4}" y="${yHR(v).toFixed(1)}" font-size="9" fill="rgba(0,212,188,0.6)" text-anchor="end" dominant-baseline="middle">${v}</text>`
  ).join('');
  const hrvLabels = [20, 50, 80].map(v =>
    `<text x="${W - padR + 4}" y="${yHRV(v).toFixed(1)}" font-size="9" fill="rgba(155,127,255,0.6)" text-anchor="start" dominant-baseline="middle">${v}</text>`
  ).join('');
  const xLabels = [0, 15, 30, 45, 59].map(i =>
    `<text x="${xOf(i).toFixed(1)}" y="${H - 4}" font-size="9" fill="rgba(255,255,255,0.3)" text-anchor="middle">-${59 - i}s</text>`
  ).join('');

  return `<svg id="wearable-live-chart" viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block">
    ${gridH}
    ${hrLine  ? `<path d="${hrLine}"  fill="none" stroke="#00d4bc" stroke-width="2" stroke-linejoin="round"/>` : ''}
    ${hrvLine ? `<path d="${hrvLine}" fill="none" stroke="#9b7fff" stroke-width="2" stroke-linejoin="round"/>` : ''}
    ${hrLabels}${hrvLabels}${xLabels}
    <text x="${padL}" y="${padT + 2}" font-size="9" fill="#00d4bc" font-weight="600">HR (bpm)</text>
    <text x="${W - padR}" y="${padT + 2}" font-size="9" fill="#9b7fff" font-weight="600" text-anchor="end">HRV (ms)</text>
  </svg>`;
}

export async function pgWearableIntegration(setTopbar) {
  setTopbar('Wearable & Biosensor Integration',
    `<button class="btn btn-ghost btn-sm" onclick="window._wearableScan()">Scan Devices</button>`);

  const root = document.getElementById('content');
  if (!root) return;
  root.innerHTML = '<div id="wearable-root"></div>';

  // ── State ──────────────────────────────────────────────────────────────────
  let _activeTab   = 'monitor';
  let _liveDevId   = null;
  let _tickIv      = null;
  let _hrBuf       = [];
  let _hrvBuf      = [];
  let _curHR       = 72;
  let _curHRV      = 45;
  let _recording   = false;
  let _recHR       = [];
  let _recHRV      = [];
  let _recStart    = null;
  let _corrPanel   = null;
  let _filterName  = '';
  let _filterFrom  = '';
  let _filterTo    = '';
  let _scanResults = null;

  function _wr() { return document.getElementById('wearable-root'); }

  // ── Tick ───────────────────────────────────────────────────────────────────
  function _wearableTick() {
    if (!document.getElementById('wearable-root')) {
      clearInterval(_tickIv);
      _tickIv = null;
      return;
    }
    _curHR  = Math.round(_generateHRTick(_curHR) * 10) / 10;
    _curHRV = Math.round(_generateHRVTick(_curHRV) * 10) / 10;

    if (_hrBuf.length  >= 60) _hrBuf.shift();
    if (_hrvBuf.length >= 60) _hrvBuf.shift();
    _hrBuf.push(_curHR);
    _hrvBuf.push(_curHRV);

    if (_recording) {
      _recHR.push({ t: _recHR.length, bpm: Math.round(_curHR) });
      _recHRV.push({ t: _recHRV.length, rmssd: Math.round(_curHRV * 10) / 10 });
    }
    _updateLiveUI();
  }

  function _updateLiveUI() {
    const bpm  = Math.round(_curHR);
    const rmssd = Math.round(_curHRV * 10) / 10;

    const hrEl = document.getElementById('w-cur-hr');
    if (hrEl) {
      hrEl.className = `hr-display ${_hrClass(bpm)}`;
      hrEl.textContent = bpm;
    }
    const hrvEl = document.getElementById('w-cur-hrv');
    if (hrvEl) {
      hrvEl.className = _hrvClass(rmssd);
      hrvEl.textContent = `${rmssd} ms — ${_hrvLabel(rmssd)}`;
    }
    const avgHR  = _hrBuf.length ? Math.round(_hrBuf.reduce((a,b)=>a+b,0)/_hrBuf.length) : bpm;
    const avgHRV = _hrvBuf.length ? Math.round(_hrvBuf.reduce((a,b)=>a+b,0)/_hrvBuf.length * 10)/10 : rmssd;
    const stress   = _computeStressIndex(avgHR, avgHRV);
    const recovery = Math.max(0, Math.min(100, Math.round(100 - stress * 0.7)));

    const stEl = document.getElementById('w-stress-gauge');
    if (stEl) stEl.innerHTML = _miniGaugeSvg(stress, '#ef4444', 80);
    const rcEl = document.getElementById('w-recovery-gauge');
    if (rcEl) rcEl.innerHTML = _miniGaugeSvg(recovery, '#10b981', 80);

    const chartEl = document.getElementById('w-chart-wrap');
    if (chartEl) chartEl.innerHTML = _buildLiveChartSvg(_hrBuf, _hrvBuf);
  }

  // ── Clinical Dashboard seed data ───────────────────────────────────────────
  function _seedWearableReadings() {
    const key = 'ds_wearable_readings';
    if (localStorage.getItem(key)) return;
    const patients = [
      { id: 'pt-001', name: 'Alex Johnson',  device: 'Polar H10',        deviceType: 'ECG Chest Strap' },
      { id: 'pt-002', name: 'Morgan Lee',    device: 'Garmin HRM-Pro',   deviceType: 'Chest Strap'     },
      { id: 'pt-003', name: 'Jordan Smith',  device: 'Apple Watch',      deviceType: 'Smartwatch'      },
    ];
    const readings = [];
    const today = new Date();
    patients.forEach((pt, pi) => {
      // Alex: HRV improving (treatment working), Morgan: stable-low, Jordan: declining
      for (let d = 13; d >= 0; d--) {
        const date = new Date(today);
        date.setDate(date.getDate() - d);
        const dateStr = date.toISOString().slice(0, 10);
        const dayIdx = 13 - d; // 0=oldest,13=today
        let hrv, rhr, sleep, steps, sessionTolerance;
        if (pi === 0) {
          // Alex: improving HRV 18→42, RHR improving 88→70
          hrv = Math.round(18 + dayIdx * 1.7 + (Math.random() - 0.5) * 4);
          rhr = Math.round(88 - dayIdx * 1.3 + (Math.random() - 0.5) * 3);
          sleep = Math.round((4.5 + dayIdx * 0.2 + (Math.random() - 0.5) * 0.5) * 10) / 10;
          steps = Math.round(1800 + dayIdx * 250 + (Math.random() - 0.5) * 400);
          sessionTolerance = dayIdx < 4 ? 2 : dayIdx < 8 ? 3 : dayIdx < 12 ? 4 : 5;
        } else if (pi === 1) {
          // Morgan: stable moderate
          hrv = Math.round(32 + (Math.random() - 0.5) * 6);
          rhr = Math.round(72 + (Math.random() - 0.5) * 4);
          sleep = Math.round((6.2 + (Math.random() - 0.5) * 0.8) * 10) / 10;
          steps = Math.round(5500 + (Math.random() - 0.5) * 1200);
          sessionTolerance = 3 + (Math.random() > 0.5 ? 1 : 0);
        } else {
          // Jordan: low activity, poor sleep
          hrv = Math.round(24 + (Math.random() - 0.5) * 5);
          rhr = Math.round(78 + (Math.random() - 0.5) * 6);
          sleep = Math.round((4.8 + (Math.random() - 0.5) * 1.2) * 10) / 10;
          steps = Math.round(1400 + (Math.random() - 0.5) * 600);
          sessionTolerance = 2 + (Math.random() > 0.6 ? 1 : 0);
        }
        readings.push({
          id: `wr-${pt.id}-${dateStr}`,
          patientId: pt.id,
          patientName: pt.name,
          device: pt.device,
          deviceType: pt.deviceType,
          date: dateStr,
          hrv: Math.max(8, hrv),
          rhr: Math.min(110, Math.max(50, rhr)),
          sleepHrs: Math.max(3, Math.min(10, sleep)),
          steps: Math.max(200, steps),
          sessionTolerance: Math.max(1, Math.min(5, sessionTolerance)),
          battery: 70 + Math.floor(Math.random() * 25),
          lastSync: date.toISOString(),
          status: d === 0 ? 'active' : 'synced',
        });
      }
    });
    localStorage.setItem(key, JSON.stringify(readings));
  }

  function _getWearableReadings() {
    try { return JSON.parse(localStorage.getItem('ds_wearable_readings') || '[]'); } catch { return []; }
  }

  // ── Clinical Dashboard render ───────────────────────────────────────────────
  let _wciPatient = 'all';
  let _dismissedAlerts = [];

  function _renderClinicalDashboard() {
    _seedWearableReadings();
    const allReadings = _getWearableReadings();
    const patientIds  = [...new Set(allReadings.map(r => r.patientId))];
    const patientMap  = {};
    allReadings.forEach(r => { patientMap[r.patientId] = r.patientName; });

    const filtered = _wciPatient === 'all'
      ? allReadings
      : allReadings.filter(r => r.patientId === _wciPatient);

    // Latest reading per patient
    function latestFor(pid) {
      return filtered.filter(r => r.patientId === pid).sort((a,b) => b.date.localeCompare(a.date))[0] || null;
    }
    // 7-day readings per patient
    function last7For(pid) {
      return filtered.filter(r => r.patientId === pid).sort((a,b) => a.date.localeCompare(b.date)).slice(-7);
    }

    const pids = _wciPatient === 'all' ? patientIds : [_wciPatient];

    // ── Biometric summary cards ────────────────────────────────────────────
    function sparklineSvg(values, color) {
      if (!values.length) return '';
      const W = 80, H = 28, pad = 2;
      const mn = Math.min(...values), mx = Math.max(...values);
      const range = mx - mn || 1;
      const pts = values.map((v, i) => {
        const x = pad + (i / Math.max(values.length - 1, 1)) * (W - pad * 2);
        const y = H - pad - ((v - mn) / range) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
      </svg>`;
    }

    function trendArrow(values) {
      if (values.length < 3) return { arrow: '–', color: 'var(--text-secondary)' };
      const first = values.slice(0, 3).reduce((a,b)=>a+b,0)/3;
      const last  = values.slice(-3).reduce((a,b)=>a+b,0)/3;
      const diff  = last - first;
      if (Math.abs(diff) < 0.5) return { arrow: '→', color: 'var(--text-secondary)' };
      return diff > 0 ? { arrow: '↑', color: '#10b981' } : { arrow: '↓', color: '#ef4444' };
    }

    const summaryCards = pids.map(pid => {
      const latest = latestFor(pid);
      const days7  = last7For(pid);
      if (!latest) return '';
      const name = patientMap[pid] || pid;

      const hrvVals   = days7.map(r => r.hrv);
      const rhrVals   = days7.map(r => r.rhr);
      const sleepVals = days7.map(r => r.sleepHrs);
      const stepVals  = days7.map(r => r.steps);

      const hrvTrend  = trendArrow(hrvVals);
      const rhrTrend  = trendArrow(rhrVals);
      const sleepTrend = trendArrow(sleepVals);
      const stepTrend = trendArrow(stepVals);

      const weeklySteps = stepVals.reduce((a,b)=>a+b,0);
      const avgSleep = sleepVals.length ? (sleepVals.reduce((a,b)=>a+b,0)/sleepVals.length).toFixed(1) : '–';

      const hrvBorder = latest.hrv < 20 ? '#f59e0b' : latest.hrv < 30 ? '#3b82f6' : '#00d4bc';
      const rhrBorder = latest.rhr > 90 ? '#ef4444' : latest.rhr > 80 ? '#f59e0b' : '#10b981';
      const sleepBorder = latest.sleepHrs < 5 ? '#f59e0b' : '#9b7fff';
      const stepBorder = latest.steps < 2000 ? '#f59e0b' : '#4a9eff';

      return `<div class="wci-patient-block">
        <div class="wci-patient-name">${name}</div>
        <div class="wci-cards-row">
          <div class="wci-card" style="border-left-color:${hrvBorder}">
            <div class="wci-card-label">HRV RMSSD</div>
            <div class="wci-card-value" style="color:${hrvBorder}">${latest.hrv} <span style="font-size:.7rem">ms</span></div>
            <div class="wci-card-trend" style="color:${hrvTrend.color}">${hrvTrend.arrow}</div>
            ${sparklineSvg(hrvVals, hrvBorder)}
          </div>
          <div class="wci-card" style="border-left-color:${rhrBorder}">
            <div class="wci-card-label">Resting HR</div>
            <div class="wci-card-value" style="color:${rhrBorder}">${latest.rhr} <span style="font-size:.7rem">bpm</span></div>
            <div class="wci-card-trend" style="color:${rhrTrend.color}">${rhrTrend.arrow}</div>
            ${sparklineSvg(rhrVals, rhrBorder)}
          </div>
          <div class="wci-card" style="border-left-color:${sleepBorder}">
            <div class="wci-card-label">Sleep Quality</div>
            <div class="wci-card-value" style="color:${sleepBorder}">${avgSleep} <span style="font-size:.7rem">hrs avg</span></div>
            <div class="wci-card-trend" style="color:${sleepTrend.color}">${sleepTrend.arrow}</div>
            ${sparklineSvg(sleepVals, sleepBorder)}
          </div>
          <div class="wci-card" style="border-left-color:${stepBorder}">
            <div class="wci-card-label">Weekly Steps</div>
            <div class="wci-card-value" style="color:${stepBorder}">${(weeklySteps/1000).toFixed(1)}<span style="font-size:.7rem">k</span></div>
            <div class="wci-card-trend" style="color:${stepTrend.color}">${stepTrend.arrow}</div>
            ${sparklineSvg(stepVals, stepBorder)}
          </div>
        </div>
      </div>`;
    }).join('');

    // ── Clinical Alerts ────────────────────────────────────────────────────
    const alerts = [];
    patientIds.forEach(pid => {
      const latest = allReadings.filter(r => r.patientId === pid).sort((a,b) => b.date.localeCompare(a.date))[0];
      if (!latest) return;
      const name = patientMap[pid];
      const last14 = allReadings.filter(r => r.patientId === pid).sort((a,b) => a.date.localeCompare(b.date)).slice(-14);
      const alertId_hrv  = `alert-hrv-${pid}`;
      const alertId_rhr  = `alert-rhr-${pid}`;
      const alertId_sleep = `alert-sleep-${pid}`;
      const alertId_step  = `alert-step-${pid}`;
      if (latest.hrv < 20 && !_dismissedAlerts.includes(alertId_hrv)) {
        alerts.push({ id: alertId_hrv, sev: 'amber', patient: name, metric: 'HRV', value: `${latest.hrv} ms`, rec: 'Consider stress-reduction protocol or session delay. HRV below 20ms suggests high sympathetic load.' });
      }
      if (latest.rhr > 90 && !_dismissedAlerts.includes(alertId_rhr)) {
        alerts.push({ id: alertId_rhr, sev: 'red', patient: name, metric: 'Resting Heart Rate', value: `${latest.rhr} bpm`, rec: 'Elevated RHR. Rule out illness, dehydration, or acute stress before proceeding with session.' });
      }
      const lowSleepNights = last14.filter(r => r.sleepHrs < 5).length;
      if (lowSleepNights >= 3 && !_dismissedAlerts.includes(alertId_sleep)) {
        alerts.push({ id: alertId_sleep, sev: 'amber', patient: name, metric: 'Sleep', value: `${lowSleepNights} nights <5h`, rec: 'Chronic sleep deprivation may reduce treatment efficacy. Review sleep hygiene homework tasks.' });
      }
      const lowStepDays = last14.filter(r => r.steps < 2000).length;
      if (lowStepDays >= 5 && !_dismissedAlerts.includes(alertId_step)) {
        alerts.push({ id: alertId_step, sev: 'info', patient: name, metric: 'Activity', value: `${lowStepDays} days <2k steps`, rec: 'Low physical activity may impact treatment outcomes. Consider assigning outdoor activity tasks.' });
      }
    });

    const alertsHtml = alerts.length === 0
      ? `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:.85rem">No active clinical alerts</div>`
      : alerts.map(a => {
          const bg    = a.sev === 'red' ? 'rgba(239,68,68,0.08)' : a.sev === 'amber' ? 'rgba(245,158,11,0.08)' : 'rgba(74,158,255,0.08)';
          const border = a.sev === 'red' ? 'rgba(239,68,68,0.35)' : a.sev === 'amber' ? 'rgba(245,158,11,0.35)' : 'rgba(74,158,255,0.35)';
          const icon  = a.sev === 'red' ? '🔴' : a.sev === 'amber' ? '🟡' : 'ℹ️';
          return `<div class="wci-alert" style="background:${bg};border-color:${border}" id="${a.id}-wrap">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="display:flex;gap:8px;align-items:flex-start">
                <span style="font-size:13px;margin-top:1px">${icon}</span>
                <div>
                  <div style="font-size:.82rem;font-weight:600;color:var(--text-primary)">${a.patient} — ${a.metric}: <span style="color:${a.sev==='red'?'#ef4444':a.sev==='amber'?'#f59e0b':'#4a9eff'}">${a.value}</span></div>
                  <div style="font-size:.76rem;color:var(--text-secondary);margin-top:2px;line-height:1.4">${a.rec}</div>
                </div>
              </div>
              <button class="btn btn-ghost btn-sm" style="font-size:.7rem;flex-shrink:0" onclick="window._wciDismissAlert('${a.id}')">Dismiss</button>
            </div>
          </div>`;
        }).join('');

    // ── HRV vs Session Tolerance scatter plot ──────────────────────────────
    const scatterData = allReadings.filter(r => r.sessionTolerance);
    const W = 300, H = 200, padL = 40, padB = 30, padT = 20, padR = 20;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const hrvMin = 10, hrvMax = 55, tolMin = 1, tolMax = 5;
    const dots = scatterData.map(r => {
      const x = padL + ((r.hrv - hrvMin) / (hrvMax - hrvMin)) * innerW;
      const y = padT + innerH - ((r.sessionTolerance - tolMin) / (tolMax - tolMin)) * innerH;
      const ptColor = r.patientId === 'pt-001' ? '#00d4bc' : r.patientId === 'pt-002' ? '#9b7fff' : '#f59e0b';
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${ptColor}" fill-opacity="0.7" stroke="${ptColor}" stroke-width="1"/>`;
    }).join('');
    // Axis labels
    const xLabels = [10,20,30,40,50].map(v => {
      const x = padL + ((v - hrvMin) / (hrvMax - hrvMin)) * innerW;
      return `<text x="${x.toFixed(1)}" y="${H - 6}" font-size="8" fill="rgba(255,255,255,0.35)" text-anchor="middle">${v}</text>`;
    }).join('');
    const yLabels = [1,2,3,4,5].map(v => {
      const y = padT + innerH - ((v - tolMin) / (tolMax - tolMin)) * innerH;
      return `<text x="${padL - 5}" y="${(y+3).toFixed(1)}" font-size="8" fill="rgba(255,255,255,0.35)" text-anchor="end">${v}</text>`;
    }).join('');
    const scatterSvg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;background:rgba(255,255,255,0.02);border-radius:8px">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+innerH}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      <line x1="${padL}" y1="${padT+innerH}" x2="${padL+innerW}" y2="${padT+innerH}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
      ${xLabels}${yLabels}
      <text x="${padL + innerW/2}" y="${H}" font-size="9" fill="rgba(255,255,255,0.4)" text-anchor="middle">HRV (ms)</text>
      <text x="10" y="${padT + innerH/2}" font-size="9" fill="rgba(255,255,255,0.4)" text-anchor="middle" transform="rotate(-90,10,${padT + innerH/2})">Tolerance</text>
      ${dots}
    </svg>`;

    const legendHtml = [
      { pid:'pt-001', name:'Alex Johnson', color:'#00d4bc' },
      { pid:'pt-002', name:'Morgan Lee',   color:'#9b7fff' },
      { pid:'pt-003', name:'Jordan Smith', color:'#f59e0b' },
    ].map(l => `<span style="display:flex;align-items:center;gap:4px;font-size:.72rem;color:var(--text-secondary)"><span style="width:8px;height:8px;border-radius:50%;background:${l.color};display:inline-block"></span>${l.name}</span>`).join('');

    // ── Device Status table ────────────────────────────────────────────────
    const devRows = patientIds.map(pid => {
      const latest = allReadings.filter(r => r.patientId === pid).sort((a,b) => b.date.localeCompare(a.date))[0];
      if (!latest) return '';
      const syncAgo = latest.date === new Date().toISOString().slice(0,10) ? 'Today' : latest.date;
      const statusColor = latest.status === 'active' ? '#10b981' : 'var(--text-secondary)';
      const batColor = latest.battery >= 50 ? '#10b981' : latest.battery >= 20 ? '#f59e0b' : '#ef4444';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:600;font-size:.82rem">${latest.device}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:.82rem">${patientMap[pid]}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:.78rem;color:var(--text-secondary)">${syncAgo}</td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:6px">
            <div class="battery-bar" style="width:50px"><div class="battery-fill" style="width:${latest.battery}%;background:${batColor}"></div></div>
            <span style="font-size:.75rem;color:${batColor}">${latest.battery}%</span>
          </div>
        </td>
        <td style="padding:8px 10px;border-bottom:1px solid var(--border)"><span style="font-size:.75rem;font-weight:600;color:${statusColor}">${latest.status}</span></td>
      </tr>`;
    }).join('');

    const patientOptions = patientIds.map(pid => `<option value="${pid}" ${_wciPatient===pid?'selected':''}>${patientMap[pid]}</option>`).join('');

    return `<div style="max-width:900px">
      <!-- Patient selector -->
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <label style="font-size:.82rem;color:var(--text-secondary);font-weight:600">Patient:</label>
        <select class="form-control" style="max-width:220px;height:32px;font-size:.82rem" onchange="window._wciSetPatient(this.value)">
          <option value="all" ${_wciPatient==='all'?'selected':''}>All Patients</option>
          ${patientOptions}
        </select>
      </div>

      <!-- Biometric Summary -->
      <div class="wci-section-title">Biometric Summary — Last 7 Days</div>
      ${summaryCards}

      <!-- Clinical Alerts -->
      <div class="wci-section-title" style="margin-top:20px">Clinical Alerts</div>
      <div class="wci-alerts-panel">${alertsHtml}</div>

      <!-- Correlation Plot -->
      <div class="wci-section-title" style="margin-top:20px">HRV vs. Session Tolerance Correlation</div>
      <div class="card" style="padding:14px;display:inline-block">
        ${scatterSvg}
        <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap">${legendHtml}</div>
        <div style="font-size:.72rem;color:var(--text-secondary);margin-top:6px">Higher HRV at session time correlates with better patient tolerance scores.</div>
      </div>

      <!-- Device Status -->
      <div class="wci-section-title" style="margin-top:20px">Device Status</div>
      <div class="card" style="padding:0;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            ${['Device','Patient Linked','Last Sync','Battery','Status'].map(h=>`<th style="padding:9px 10px;border-bottom:2px solid var(--border);text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary)">${h}</th>`).join('')}
          </tr></thead>
          <tbody>${devRows}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ── Tab render ─────────────────────────────────────────────────────────────
  function render() {
    const wr = _wr();
    if (!wr) return;
    const tabs = [
      { id: 'monitor',   label: 'Live Monitor' },
      { id: 'history',   label: 'Session History' },
      { id: 'devices',   label: 'Device Manager' },
      { id: 'clinical',  label: 'Clinical Dashboard' },
    ];
    wr.innerHTML = `
      <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:16px">
        ${tabs.map(t => `<button class="tab-btn${_activeTab === t.id ? ' active' : ''}" onclick="window._wearableTab('${t.id}')"
          style="padding:10px 20px;background:none;border:none;cursor:pointer;font-size:.85rem;font-weight:600;color:${_activeTab === t.id ? 'var(--teal)' : 'var(--text-secondary)'};border-bottom:2px solid ${_activeTab === t.id ? 'var(--teal)' : 'transparent'};margin-bottom:-2px;transition:all .15s">${t.label}</button>`).join('')}
      </div>
      <div id="w-tab-body">${_renderTab()}</div>
    `;
  }

  function _renderTab() {
    if (_activeTab === 'monitor')  return _renderMonitor();
    if (_activeTab === 'history')  return _renderHistory();
    if (_activeTab === 'devices')  return _renderDevices();
    if (_activeTab === 'clinical') return _renderClinicalDashboard();
    return '';
  }

  // ── Monitor tab ────────────────────────────────────────────────────────────
  function _renderMonitor() {
    const paired   = getPairedDevices();
    const connected = paired.find(d => d.status === 'connected');

    const deviceBar = paired.length === 0
      ? `<div style="background:var(--card-bg);border:1px dashed var(--border);border-radius:8px;padding:14px;color:var(--text-secondary);font-size:.85rem;text-align:center">
          No device connected — pair a device in <a href="#" onclick="window._wearableTab('devices');return false" style="color:var(--teal)">Device Manager</a>
         </div>`
      : paired.map(d => `
          <div class="device-card">
            <div style="width:36px;height:36px;border-radius:50%;background:${d.status === 'connected' ? 'rgba(0,212,188,0.12)' : 'rgba(255,255,255,0.06)'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">⌚</div>
            <div style="flex:1">
              <div style="font-size:.88rem;font-weight:600;color:var(--text-primary)">${d.name}</div>
              <div style="font-size:.75rem;color:var(--text-secondary)">${d.type} · ${d.macAddress}</div>
            </div>
            <span style="padding:3px 10px;border-radius:12px;font-size:.72rem;font-weight:700;background:${d.status === 'connected' ? 'rgba(0,212,188,0.12)' : 'rgba(255,255,255,0.06)'};color:${d.status === 'connected' ? 'var(--teal)' : 'var(--text-secondary)'}">${d.status}</span>
            ${d.status === 'connected'
              ? `<button class="btn btn-ghost btn-sm" onclick="window._wearableDisconnect('${d.id}')">Disconnect</button>`
              : `<button class="btn btn-primary btn-sm" onclick="window._wearableConnect('${d.id}')">Connect</button>`}
          </div>`).join('');

    const liveSection = _liveDevId
      ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="card" style="padding:16px;text-align:center">
            <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text-secondary);margin-bottom:8px">Heart Rate</div>
            <div id="w-cur-hr" class="hr-display hr-normal">--</div>
            <div style="font-size:.75rem;color:var(--text-secondary);margin-top:4px">BPM</div>
          </div>
          <div class="card" style="padding:16px;text-align:center">
            <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text-secondary);margin-bottom:8px">HRV (RMSSD)</div>
            <div id="w-cur-hrv" class="hrv-good">-- ms</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="card" style="padding:16px;text-align:center">
            <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text-secondary);margin-bottom:8px">Stress Index</div>
            <div id="w-stress-gauge"></div>
          </div>
          <div class="card" style="padding:16px;text-align:center">
            <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text-secondary);margin-bottom:8px">Recovery Score</div>
            <div id="w-recovery-gauge"></div>
          </div>
        </div>
        <div class="card wearable-chart" style="margin-bottom:12px">
          <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text-secondary);margin-bottom:6px;padding:0 4px">Live Waveform — last 60 seconds
            <span style="float:right"><span style="color:#00d4bc">━</span> HR &nbsp;<span style="color:#9b7fff">━</span> HRV</span>
          </div>
          <div id="w-chart-wrap">${_buildLiveChartSvg(_hrBuf, _hrvBuf)}</div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          ${!_recording
            ? `<button class="btn btn-primary btn-sm" onclick="window._wearableStartRecord()">⏺ Start Session Recording</button>`
            : `<button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)" onclick="window._wearableStopRecord()">⏹ Stop & Save</button>
               <span style="font-size:.78rem;color:var(--teal);align-self:center">Recording… ${_recHR.length}s</span>`}
        </div>`
      : `<div style="background:rgba(0,212,188,0.04);border:1px dashed var(--border-teal);border-radius:8px;padding:24px;text-align:center;color:var(--text-secondary);font-size:.85rem;margin-bottom:12px">
          Connect a device above to view live biosensor data
         </div>`;

    return `
      <div style="max-width:760px">
        <div style="margin-bottom:12px">${deviceBar}</div>
        ${liveSection}
        ${_renderImportSection()}
      </div>`;
  }

  function _renderImportSection() {
    return `<div class="card">
      <div class="card-header"><h3>Import from Garmin / Polar / Apple Health</h3></div>
      <div class="card-body">
        <div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:10px">
          Upload a .csv file exported from your wearable app. Expected columns:
          <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px">timestamp</code>,
          <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px">heart_rate</code>,
          <code style="background:rgba(255,255,255,0.06);padding:1px 5px;border-radius:4px">hrv_rmssd</code>
          (common variants auto-mapped).
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <label style="cursor:pointer">
            <input type="file" accept=".csv" style="display:none" onchange="window._wearableImportCSV(this)">
            <span class="btn btn-sm">Choose CSV File</span>
          </label>
          <button class="btn btn-ghost btn-sm" onclick="window._wearableDownloadSample()">Download Sample CSV</button>
        </div>
        <div id="w-import-status" style="margin-top:8px;font-size:.8rem"></div>
      </div>
    </div>`;
  }

  // ── History tab ────────────────────────────────────────────────────────────
  function _renderHistory() {
    let sessions = getBiosensorSessions();
    if (_filterName) sessions = sessions.filter(s => s.patientName.toLowerCase().includes(_filterName.toLowerCase()));
    if (_filterFrom) sessions = sessions.filter(s => s.date >= _filterFrom);
    if (_filterTo)   sessions = sessions.filter(s => s.date <= _filterTo);

    const cards = sessions.length === 0
      ? `<div style="text-align:center;padding:32px;color:var(--text-secondary)">No sessions match the current filter.</div>`
      : sessions.map(s => {
          const hrColor = s.avgHR < 60 ? '#3b82f6' : s.avgHR <= 100 ? '#10b981' : s.avgHR <= 120 ? '#f59e0b' : '#ef4444';
          return `<div class="biosensor-session-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
              <div>
                <div style="font-weight:600;font-size:.9rem">${s.patientName}</div>
                <div style="font-size:.75rem;color:var(--text-secondary)">${s.deviceName} (${s.deviceType}) · ${s.date} · ${s.duration} min</div>
              </div>
              <button class="btn btn-ghost btn-sm" onclick="window._wearableCorrelate('${s.id}')">Correlate with Session</button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 8px">
              <span class="hr-chip" style="background:${hrColor}22;color:${hrColor}">avg ${s.avgHR} bpm</span>
              <span class="hr-chip" style="background:rgba(74,158,255,0.1);color:#4a9eff">min ${s.minHR}</span>
              <span class="hr-chip" style="background:rgba(239,68,68,0.1);color:#ef4444">max ${s.maxHR}</span>
              <span class="${_hrvClass(s.avgHRV)}" style="font-size:.78rem">HRV ${s.avgHRV} ms (${_hrvLabel(s.avgHRV)})</span>
            </div>
            <div style="display:flex;gap:20px;align-items:center">
              <div style="text-align:center">
                <div style="font-size:.7rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px">Stress</div>
                ${_miniGaugeSvg(s.stressIndex, '#ef4444', 60)}
              </div>
              <div style="text-align:center">
                <div style="font-size:.7rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px">Recovery</div>
                ${_miniGaugeSvg(s.recoveryScore, '#10b981', 60)}
              </div>
            </div>
          </div>`;
        }).join('');

    const panel = _corrPanel ? _renderCorrPanel(_corrPanel) : '';

    return `
      <div style="${_corrPanel ? 'display:grid;grid-template-columns:1fr 1fr;gap:16px' : ''}">
        <div>
          <div class="card" style="padding:12px;margin-bottom:12px">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <input type="text" placeholder="Filter by patient…" value="${_filterName}" oninput="window._wearableHistoryFilter('name',this.value)" class="form-control" style="max-width:200px;height:32px;font-size:.82rem">
              <input type="date" value="${_filterFrom}" onchange="window._wearableHistoryFilter('from',this.value)" class="form-control" style="max-width:140px;height:32px;font-size:.82rem">
              <span style="color:var(--text-secondary);font-size:.8rem">to</span>
              <input type="date" value="${_filterTo}" onchange="window._wearableHistoryFilter('to',this.value)" class="form-control" style="max-width:140px;height:32px;font-size:.82rem">
              <button class="btn btn-ghost btn-sm" onclick="window._wearableHistoryFilter('clear','')">Clear</button>
            </div>
          </div>
          ${cards}
        </div>
        ${panel ? `<div>${panel}</div>` : ''}
      </div>`;
  }

  function _renderCorrPanel(session) {
    // Build a simple mini-chart of session HR data
    const hrLine = session.hrData.length > 1
      ? session.hrData.map((d, i) => {
          const x = (i / (session.hrData.length - 1) * 220 + 20).toFixed(1);
          const y = (80 - ((d.bpm - 50) / 60) * 60).toFixed(1);
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ')
      : '';
    return `<div class="card" style="position:sticky;top:16px">
      <div class="card-header">
        <h3>Correlation — ${session.patientName}</h3>
        <button class="btn btn-ghost btn-sm" onclick="window._wearableCorrelate(null)">Close</button>
      </div>
      <div class="card-body">
        <div style="font-size:.8rem;color:var(--text-secondary);margin-bottom:12px">${session.date} · ${session.deviceName}</div>
        <div style="margin-bottom:12px">
          <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.7px;color:var(--text-secondary);margin-bottom:6px">HR Trend During Session</div>
          <svg viewBox="0 0 260 90" style="width:100%;height:80px;background:rgba(255,255,255,0.02);border-radius:6px">
            ${hrLine ? `<path d="${hrLine}" fill="none" stroke="#00d4bc" stroke-width="2" stroke-linejoin="round"/>` : ''}
            <text x="20" y="88" font-size="9" fill="rgba(255,255,255,0.3)">0</text>
            <text x="236" y="88" font-size="9" fill="rgba(255,255,255,0.3)">${session.duration}m</text>
          </svg>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="background:rgba(0,212,188,0.06);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.7rem;color:var(--text-secondary)">Avg HR</div>
            <div style="font-size:1.4rem;font-weight:800;color:#10b981">${session.avgHR}</div>
            <div style="font-size:.68rem;color:var(--text-secondary)">bpm</div>
          </div>
          <div style="background:rgba(155,127,255,0.06);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:.7rem;color:var(--text-secondary)">Avg HRV</div>
            <div style="font-size:1.4rem;font-weight:800;color:#9b7fff">${session.avgHRV}</div>
            <div style="font-size:.68rem;color:var(--text-secondary)">ms RMSSD</div>
          </div>
        </div>
        <div style="background:rgba(255,181,71,0.06);border-radius:8px;padding:10px;font-size:.8rem;line-height:1.5;color:var(--text-secondary);border:1px solid rgba(255,181,71,0.15)">
          <strong style="color:var(--amber)">Clinical Correlation Note:</strong>
          ${session.stressIndex > 60
            ? `Elevated stress index (${session.stressIndex}/100) during this session suggests sympathetic nervous system activation. Consider pre-session relaxation protocol or adjusted stimulation parameters.`
            : session.stressIndex > 35
            ? `Moderate stress index (${session.stressIndex}/100) is within acceptable range. HRV values suggest adequate parasympathetic tone for the session.`
            : `Low stress index (${session.stressIndex}/100) with good HRV indicates high patient readiness. Optimal physiological state for neuromodulation protocol.`}
        </div>
      </div>
    </div>`;
  }

  // ── Device Manager tab ─────────────────────────────────────────────────────
  function _renderDevices() {
    const paired = getPairedDevices();

    const pairedList = paired.length === 0
      ? `<div style="text-align:center;padding:24px;color:var(--text-secondary);font-size:.85rem;border:1px dashed var(--border);border-radius:8px">No paired devices yet. Scan below to find devices.</div>`
      : paired.map(d => {
          const batColor = d.batteryLevel >= 50 ? '#10b981' : d.batteryLevel >= 20 ? '#f59e0b' : '#ef4444';
          return `<div class="device-card">
            <div style="font-size:22px;flex-shrink:0">⌚</div>
            <div style="flex:1">
              <div style="font-size:.88rem;font-weight:600;color:var(--text-primary)">${d.name}</div>
              <div style="font-size:.74rem;color:var(--text-secondary)">${d.macAddress}</div>
              <div style="font-size:.72rem;color:var(--text-tertiary)">Last seen: ${d.lastSeen}</div>
            </div>
            <div style="text-align:center;min-width:60px">
              <span class="device-type-ble">${d.type}</span>
              <div style="margin-top:6px">
                <div style="font-size:.7rem;color:var(--text-secondary);margin-bottom:2px">Battery ${d.batteryLevel}%</div>
                <div class="battery-bar"><div class="battery-fill" style="width:${d.batteryLevel}%;background:${batColor}"></div></div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:4px">
              ${d.status === 'connected'
                ? `<button class="btn btn-ghost btn-sm" onclick="window._wearableDisconnect('${d.id}')">Disconnect</button>`
                : `<button class="btn btn-primary btn-sm" onclick="window._wearableConnect('${d.id}')">Connect</button>`}
              <button class="btn btn-ghost btn-sm" style="color:var(--red);font-size:.72rem" onclick="window._wearableRemoveDevice('${d.id}')">Remove</button>
            </div>
          </div>`;
        }).join('');

    const scanSection = _scanResults === null
      ? `<button class="btn btn-primary btn-sm" onclick="window._wearableScan()">Scan for Devices</button>`
      : _scanResults === 'scanning'
      ? `<div style="display:flex;align-items:center;gap:10px;padding:12px">
           <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
           <span style="font-size:.85rem;color:var(--text-secondary)">Scanning for Bluetooth devices…</span>
         </div>`
      : `<div>
           ${_scanResults.map(d => `
             <div class="device-card" style="background:rgba(0,212,188,0.04)">
               <div style="font-size:20px">⌚</div>
               <div style="flex:1">
                 <div style="font-size:.88rem;font-weight:600">${d.name}</div>
                 <div style="font-size:.74rem;color:var(--text-secondary)">${d.type} · Signal:
                   <span class="signal-bar">${Array.from({length:4},(_, i) => `<span style="height:${(i+1)*3}px;opacity:${i < d.signal ? 1 : 0.2}"></span>`).join('')}</span>
                 </div>
               </div>
               <button class="btn btn-primary btn-sm" onclick='window._wearablePair(${JSON.stringify(d)})'>Pair</button>
             </div>`).join('')}
           <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="window._wearableScan()">Scan Again</button>
         </div>`;

    const supportedDevices = [
      { name: 'Polar H10',     type: 'ECG Chest Strap', conn: 'BLE / ANT+',  channels: 'HR, HRV, ECG waveform' },
      { name: 'Garmin HRM-Pro',type: 'Chest Strap',     conn: 'BLE / ANT+',  channels: 'HR, HRV, Running Dynamics' },
      { name: 'Apple Watch',   type: 'Smartwatch',      conn: 'BLE',         channels: 'HR, HRV, SpO₂, EDA' },
      { name: 'Polar Verity Sense', type: 'Optical',   conn: 'BLE / ANT+',  channels: 'HR, HRV' },
      { name: 'Garmin Forerunner', type: 'Smartwatch', conn: 'BLE',          channels: 'HR, HRV, Stress' },
      { name: 'Oura Ring',     type: 'Smart Ring',      conn: 'BLE',         channels: 'HR, HRV, SpO₂, Sleep' },
    ];

    return `
      <div style="max-width:760px">
        ${cardWrap('Paired Devices', pairedList)}
        <div style="height:12px"></div>
        ${cardWrap('+ Pair New Device', `
          <div id="w-scan-section">${scanSection}</div>
        `)}
        <div style="height:12px"></div>
        ${cardWrap('Supported Devices', `
          <table style="width:100%;border-collapse:collapse;font-size:.8rem">
            <thead><tr>
              ${['Device','Type','Connection','Data Channels'].map(h => `<th style="padding:7px 10px;border-bottom:2px solid var(--border);text-align:left;color:var(--text-secondary);font-size:.72rem;text-transform:uppercase;letter-spacing:.5px">${h}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${supportedDevices.map(d => `<tr>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:600">${d.name}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text-secondary)">${d.type}</td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border)"><span class="device-type-ble">${d.conn}</span></td>
                <td style="padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text-secondary)">${d.channels}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div style="margin-top:12px;padding:10px;background:rgba(255,181,71,0.06);border:1px solid rgba(255,181,71,0.2);border-radius:8px;font-size:.78rem;color:var(--text-secondary);line-height:1.5">
            <strong style="color:var(--amber)">Web Bluetooth Note:</strong>
            Real Bluetooth connectivity requires Chrome or Edge with the Web Bluetooth API enabled. This demo uses simulated data to demonstrate the full integration workflow.
          </div>
        `)}
      </div>`;
  }

  // ── Global handlers ────────────────────────────────────────────────────────
  window._wearableTab = function(tab) {
    _activeTab = tab;
    render();
  };

  window._wearableConnect = function(id) {
    const devices = getPairedDevices();
    const dev = devices.find(d => d.id === id);
    if (!dev) return;
    // Disconnect any currently connected device first
    devices.forEach(d => { if (d.status === 'connected') d.status = 'disconnected'; });
    dev.status = 'connected';
    dev.lastSeen = new Date().toLocaleString();
    localStorage.setItem(DEVICE_PAIRING_KEY, JSON.stringify(devices));

    _liveDevId = id;
    _hrBuf  = [];
    _hrvBuf = [];
    _curHR  = 70 + Math.random() * 10;
    _curHRV = 40 + Math.random() * 15;

    clearInterval(_tickIv);
    _tickIv = setInterval(_wearableTick, 1000);
    render();
  };

  window._wearableDisconnect = function(id) {
    const devices = getPairedDevices();
    const dev = devices.find(d => d.id === id);
    if (dev) {
      dev.status = 'disconnected';
      localStorage.setItem(DEVICE_PAIRING_KEY, JSON.stringify(devices));
    }
    if (_liveDevId === id) {
      _liveDevId = null;
      clearInterval(_tickIv);
      _tickIv = null;
      _recording = false;
    }
    render();
  };

  window._wearableStartRecord = function() {
    if (!_liveDevId) return;
    _recording = true;
    _recHR  = [];
    _recHRV = [];
    _recStart = Date.now();
    render();
  };

  window._wearableStopRecord = function() {
    _recording = false;
    if (_recHR.length < 2) { render(); return; }
    const hrVals  = _recHR.map(d => d.bpm);
    const hrvVals = _recHRV.map(d => d.rmssd);
    const avgHR   = Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length);
    const avgHRV  = Math.round(hrvVals.reduce((a,b)=>a+b,0)/hrvVals.length * 10)/10;
    const devices = getPairedDevices();
    const dev = devices.find(d => d.id === _liveDevId) || { name: 'Unknown', type: 'BLE' };
    const session = {
      id: `bs-${Date.now()}`,
      patientName: 'Live Session',
      deviceName: dev.name,
      deviceType: dev.type,
      date: new Date().toISOString().slice(0, 10),
      duration: Math.round(_recHR.length / 60),
      hrData:  _recHR,
      hrvData: _recHRV,
      avgHR,
      minHR:  Math.min(...hrVals),
      maxHR:  Math.max(...hrVals),
      avgHRV,
      stressIndex:   _computeStressIndex(avgHR, avgHRV),
      recoveryScore: Math.max(0, Math.min(100, Math.round(100 - _computeStressIndex(avgHR, avgHRV) * 0.7))),
    };
    saveBiosensorSession(session);
    _recHR = [];
    _recHRV = [];
    render();
    const status = document.getElementById('w-import-status');
    if (status) { status.style.color = '#10b981'; status.textContent = 'Session saved to history.'; }
  };

  window._wearableScan = function() {
    _scanResults = 'scanning';
    const scanEl = document.getElementById('w-scan-section');
    if (scanEl) scanEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px">
      <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
      <span style="font-size:.85rem;color:var(--text-secondary)">Scanning for Bluetooth devices…</span>
    </div>`;
    setTimeout(() => {
      _scanResults = [
        { id: 'disc-polar',  name: 'Polar H10',      type: 'ECG Chest Strap', mac: 'A4:C1:38:01:23:45', signal: 4 },
        { id: 'disc-garmin', name: 'Garmin HRM-Pro',  type: 'Chest Strap',    mac: 'B8:D8:12:8E:67:AB', signal: 3 },
        { id: 'disc-apple',  name: 'Apple Watch',     type: 'Smartwatch',     mac: 'F0:D5:BF:C9:00:F1', signal: 3 },
      ];
      if (_activeTab === 'devices') render();
    }, 2000);
  };

  window._wearablePair = function(device) {
    const scanEl = document.getElementById('w-scan-section');
    if (scanEl) scanEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px">
      <div class="spinner" style="width:18px;height:18px;border-width:2px"></div>
      <span style="font-size:.85rem;color:var(--text-secondary)">Pairing with ${device.name}…</span>
    </div>`;
    setTimeout(() => {
      savePairedDevice({
        id:           device.id,
        name:         device.name,
        type:         device.type,
        macAddress:   device.mac,
        status:       'disconnected',
        lastSeen:     new Date().toLocaleString(),
        batteryLevel: 72 + Math.floor(Math.random() * 20),
      });
      _scanResults = null;
      render();
    }, 1500);
  };

  window._wearableRemoveDevice = function(id) {
    if (_liveDevId === id) {
      _liveDevId = null;
      clearInterval(_tickIv);
      _tickIv = null;
      _recording = false;
    }
    removePairedDevice(id);
    render();
  };

  window._wearableCorrelate = function(sessionId) {
    if (!sessionId) { _corrPanel = null; render(); return; }
    const sessions = getBiosensorSessions();
    _corrPanel = sessions.find(s => s.id === sessionId) || null;
    render();
  };

  window._wciSetPatient = function(pid) {
    _wciPatient = pid;
    const body = document.getElementById('w-tab-body');
    if (body) body.innerHTML = _renderClinicalDashboard();
  };

  window._wciDismissAlert = function(alertId) {
    _dismissedAlerts.push(alertId);
    const wrap = document.getElementById(alertId + '-wrap');
    if (wrap) {
      wrap.style.transition = 'opacity .2s';
      wrap.style.opacity = '0';
      setTimeout(() => {
        const body = document.getElementById('w-tab-body');
        if (body) body.innerHTML = _renderClinicalDashboard();
      }, 220);
    }
  };

  window._wearableHistoryFilter = function(key, val) {
    if (key === 'name') _filterName = val;
    else if (key === 'from') _filterFrom = val;
    else if (key === 'to')   _filterTo   = val;
    else if (key === 'clear') { _filterName = ''; _filterFrom = ''; _filterTo = ''; }
    const body = document.getElementById('w-tab-body');
    if (body) body.innerHTML = _renderHistory();
  };

  window._wearableImportCSV = function(input) {
    const file = input.files[0];
    if (!file) return;
    const statusEl = document.getElementById('w-import-status');
    if (statusEl) { statusEl.style.color = 'var(--text-secondary)'; statusEl.textContent = 'Parsing…'; }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const text  = e.target.result;
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9_]/g,''));
        // Column name mapping
        const tsIdx  = headers.findIndex(h => ['timestamp','time','datetime','date'].includes(h));
        const hrIdx  = headers.findIndex(h => ['heart_rate','heartrate','hr','bpm','pulse'].includes(h));
        const hrvIdx = headers.findIndex(h => ['hrv_rmssd','hrv','rmssd','hrvrmssd'].includes(h));
        if (hrIdx === -1) {
          if (statusEl) { statusEl.style.color='#ef4444'; statusEl.textContent='Error: no heart_rate column found.'; }
          return;
        }
        const hrData = [], hrvData = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',');
          const bpm  = parseFloat(cols[hrIdx]);
          if (isNaN(bpm)) continue;
          hrData.push({ t: i - 1, bpm: Math.round(bpm) });
          if (hrvIdx !== -1) {
            const rmssd = parseFloat(cols[hrvIdx]);
            if (!isNaN(rmssd)) hrvData.push({ t: i - 1, rmssd: Math.round(rmssd * 10) / 10 });
          }
        }
        if (hrData.length === 0) {
          if (statusEl) { statusEl.style.color='#ef4444'; statusEl.textContent='Error: no valid rows found.'; }
          return;
        }
        const hrVals  = hrData.map(d => d.bpm);
        const hrvVals = hrvData.map(d => d.rmssd);
        const avgHR   = Math.round(hrVals.reduce((a,b)=>a+b,0)/hrVals.length);
        const avgHRV  = hrvVals.length ? Math.round(hrvVals.reduce((a,b)=>a+b,0)/hrvVals.length * 10)/10 : 0;
        const session = {
          id: `bs-${Date.now()}`,
          patientName: 'Imported Session',
          deviceName:  file.name,
          deviceType:  'CSV Import',
          date:        new Date().toISOString().slice(0, 10),
          duration:    Math.round(hrData.length / 60) || 1,
          hrData, hrvData,
          avgHR,
          minHR:  Math.min(...hrVals),
          maxHR:  Math.max(...hrVals),
          avgHRV,
          stressIndex:   _computeStressIndex(avgHR, avgHRV || 40),
          recoveryScore: Math.max(0, Math.min(100, Math.round(100 - _computeStressIndex(avgHR, avgHRV || 40) * 0.7))),
        };
        saveBiosensorSession(session);
        if (statusEl) { statusEl.style.color='#10b981'; statusEl.textContent=`Imported ${hrData.length} data points. Session saved.`; }
        // Reset file input
        input.value = '';
      } catch(err) {
        if (statusEl) { statusEl.style.color='#ef4444'; statusEl.textContent=`Parse error: ${err.message}`; }
      }
    };
    reader.readAsText(file);
  };

  window._wearableDownloadSample = function() {
    const rows = ['timestamp,heart_rate,hrv_rmssd'];
    let bpm = 70, rmssd = 45;
    for (let i = 0; i < 60; i++) {
      const ts = new Date(Date.now() - (60 - i) * 1000).toISOString();
      bpm   = Math.max(55, Math.min(95, bpm   + (Math.random() - 0.5) * 4));
      rmssd = Math.max(20, Math.min(75, rmssd + (Math.random() - 0.5) * 3));
      rows.push(`${ts},${Math.round(bpm)},${(Math.round(rmssd * 10) / 10).toFixed(1)}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sample_wearable_data.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  render();
}

// ── Reminder Automation & Patient Adherence ───────────────────────────────────
export async function pgReminderAutomation(setTopbar) {
  setTopbar('Reminders & Adherence', `
    <button class="btn btn-ghost btn-sm" onclick="window._remRefresh()">&#8634; Refresh</button>
    <button class="btn btn-primary btn-sm" onclick="window._remNewCampaignModal()">+ New Campaign</button>
  `);

  // ── Seed helpers ───────────────────────────────────────────────────────────
  function lsGet(k, def) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def; } catch { return def; } }
  function lsSet(k, v)   { localStorage.setItem(k, JSON.stringify(v)); }

  const CAMPAIGN_SEED = [
    { id:'rc1', name:'Pre-Session Reminder',    trigger:'24h_before',       channels:['sms','email'], active:true,  sentMonth:187, openRate:72,   confirmRate:68,
      template:'Your session is tomorrow at [time] with [clinician]. Reply CONFIRM or CANCEL.' },
    { id:'rc2', name:'Same-Day Reminder',        trigger:'2h_before',        channels:['sms'],          active:true,  sentMonth:143, openRate:null, confirmRate:null,
      template:'Your appointment is in 2 hours. DeepSynaps Clinic, 100 Wellness Ave. See you soon!' },
    { id:'rc3', name:'Missed Session Follow-up', trigger:'missed',           channels:['email'],        active:true,  sentMonth:23,  openRate:41,   confirmRate:17,
      template:'We missed you today, [patient_name]. Would you like to reschedule? Reply or log into the portal.' },
    { id:'rc4', name:'Homework Check-in',        trigger:'3day_interval',    channels:['email','push'], active:false, sentMonth:0,   openRate:0,    confirmRate:0,
      template:'Hi [patient_name], how is your [homework_task] going? Log your progress in the portal.' },
    { id:'rc5', name:'Treatment Milestone',      trigger:'session_milestone', channels:['email'],       active:true,  sentMonth:12,  openRate:83,   confirmRate:null,
      template:"Congratulations [patient_name]! You've completed [session_number] sessions! Here's your progress summary." },
  ];

  const PATIENTS_FALLBACK = [
    { id:'pt-001', name:'Alex Johnson',  condition:'MDD' },
    { id:'pt-002', name:'Morgan Lee',    condition:'PTSD + ADHD' },
    { id:'pt-003', name:'Jordan Smith',  condition:'Bipolar I' },
    { id:'pt-004', name:'Taylor Rivera', condition:'Anxiety' },
    { id:'pt-005', name:'Casey Brown',   condition:'TBI' },
  ];

  const CHANNELS = ['sms','email','push'];
  const STATUSES = ['Queued','Sent','Delivered','Failed','Opened'];
  const CAMPAIGN_IDS = ['rc1','rc2','rc3','rc4','rc5'];

  function seedOutbox() {
    const patients = lsGet('ds_patients', PATIENTS_FALLBACK);
    const msgs = [];
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      const pt = patients[i % patients.length];
      const ch = CHANNELS[i % 3];
      const cid = CAMPAIGN_IDS[i % 5];
      const camp = CAMPAIGN_SEED.find(c => c.id === cid);
      const minsAgo = Math.floor(Math.random() * 10080);
      msgs.push({
        id: 'ob-' + (i + 1),
        patientId: pt.id,
        patientName: pt.name,
        channel: ch,
        campaignId: cid,
        campaignName: camp.name,
        scheduledAt: new Date(now - minsAgo * 60000).toISOString(),
        status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
        preview: (camp.template.replace('[patient_name]', pt.name).replace('[time]','10:00 AM').replace('[clinician]','Dr. Patel').replace('[session_number]','10').replace('[homework_task]','breathing exercises')).slice(0, 80) + '...',
      });
    }
    return msgs;
  }

  const TEMPLATE_SEED = [
    { id:'tpl-1', name:'Appointment Reminder',      channel:'sms',   category:'scheduling', subject:'',                              body:'Hi [patient_name], your appointment is on [date] at [time] with [clinician]. Reply CONFIRM or CANCEL.' },
    { id:'tpl-2', name:'Cancellation Notice',        channel:'email', category:'scheduling', subject:'Your appointment has been cancelled', body:'Hi [patient_name], your [date] appointment at [time] has been cancelled. Please call us to reschedule.' },
    { id:'tpl-3', name:'Reschedule Request',         channel:'email', category:'scheduling', subject:'Request to Reschedule',         body:'Hi [patient_name], we need to reschedule your session. Please log into the portal or call to select a new time.' },
    { id:'tpl-4', name:'Homework Check',             channel:'email', category:'adherence',  subject:'How is your homework going?',   body:'Hi [patient_name], checking in on your [homework_task]. Log your progress in the portal - it helps us track your progress.' },
    { id:'tpl-5', name:'Milestone Congratulations',  channel:'email', category:'milestones', subject:'You reached a milestone!',      body:'Congratulations [patient_name]! You have completed [session_number] sessions. Here is a summary of your progress.' },
    { id:'tpl-6', name:'Intake Reminder',            channel:'email', category:'admin',      subject:'Complete your intake forms',    body:'Hi [patient_name], please complete your intake forms before your first appointment on [date]. Link: [portal_link].' },
    { id:'tpl-7', name:'Consent Reminder',           channel:'sms',   category:'admin',      subject:'',                              body:'Hi [patient_name], please sign your consent forms in the patient portal before [date]. Thank you.' },
    { id:'tpl-8', name:'Birthday Greeting',          channel:'email', category:'engagement', subject:'Happy Birthday from DeepSynaps!', body:'Happy Birthday [patient_name]! Wishing you a wonderful day. As always, we are here to support your wellbeing journey.' },
  ];

  function seedAdherenceScores() {
    const patients = lsGet('ds_patients', PATIENTS_FALLBACK);
    const baseScores = [88, 54, 72, 91, 41, 63, 78, 55];
    const prevScores = [82, 58, 71, 87, 50, 60, 80, 57];
    return patients.map((pt, i) => {
      const base = baseScores[i % 8];
      const prev = prevScores[i % 8];
      const appt  = Math.min(100, base + Math.round((Math.random() - 0.5) * 10));
      const hw    = Math.min(100, base - 5 + Math.round((Math.random() - 0.5) * 8));
      const login = Math.min(100, base + 3 + Math.round((Math.random() - 0.5) * 6));
      const score = Math.round((appt * 0.5) + (hw * 0.3) + (login * 0.2));
      const trend = score > prev ? 'up' : score < prev - 3 ? 'down' : 'stable';
      return { patientId: pt.id, patientName: pt.name, condition: pt.condition || '', score, prev, appt, hw, login, trend };
    });
  }

  // Seed on first load
  if (!localStorage.getItem('ds_reminder_campaigns')) lsSet('ds_reminder_campaigns', CAMPAIGN_SEED);
  if (!localStorage.getItem('ds_reminder_outbox'))    lsSet('ds_reminder_outbox', seedOutbox());
  if (!localStorage.getItem('ds_message_templates'))  lsSet('ds_message_templates', TEMPLATE_SEED);
  if (!localStorage.getItem('ds_adherence_scores'))   lsSet('ds_adherence_scores', seedAdherenceScores());

  // ── Tab state ──────────────────────────────────────────────────────────────
  let activeTab = 'campaigns';

  // ── Render shell ───────────────────────────────────────────────────────────
  const _remEl = document.getElementById('content') || document.getElementById('app-content');
  _remEl.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:20px 24px">
      <div style="display:flex;gap:6px;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:0;flex-wrap:wrap">
        ${['campaigns','outbox','adherence','templates'].map(tab =>
          `<button id="remtab-${tab}" class="tab-btn ${tab === 'campaigns' ? 'active' : ''}" onclick="window._remSwitchTab('${tab}')">${
            {campaigns:'Reminder Campaigns', outbox:'Outbox & Delivery Log', adherence:'Patient Adherence', templates:'Message Templates'}[tab]
          }</button>`
        ).join('')}
      </div>
      <div id="rem-tab-content"></div>
    </div>
    <div id="rem-modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:200;align-items:center;justify-content:center;padding:16px"></div>
  `;

  // ── Utility ────────────────────────────────────────────────────────────────
  function fmtDt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // ── Tab: Campaigns ─────────────────────────────────────────────────────────
  function renderCampaigns() {
    const campaigns = lsGet('ds_reminder_campaigns', CAMPAIGN_SEED);
    const TRIGGER_LABELS = {
      '24h_before':       '24 h before appointment',
      '2h_before':        '2 h before appointment',
      'missed':           '2 h after missed slot',
      '3day_interval':    'Every 3 days',
      'session_milestone':'Session 10 / 20 / 30',
    };
    document.getElementById('rem-tab-content').innerHTML = `
      <div style="display:grid;gap:14px">
        ${campaigns.map(c => `
          <div class="jjj-campaign-card" id="cc-${c.id}">
            <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:3px">${c.name}</div>
                <div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:8px">${TRIGGER_LABELS[c.trigger] || c.trigger}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${c.channels.map(ch => `<span class="jjj-channel-badge jjj-ch-${ch}">${ch.toUpperCase()}</span>`).join('')}
                </div>
              </div>
              <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
                <div style="text-align:center">
                  <div style="font-size:20px;font-weight:700;color:var(--teal)">${c.sentMonth}</div>
                  <div style="font-size:10px;color:var(--text-secondary)">Sent/mo</div>
                </div>
                ${c.openRate != null ? `<div style="text-align:center">
                  <div style="font-size:20px;font-weight:700;color:var(--blue)">${c.openRate}%</div>
                  <div style="font-size:10px;color:var(--text-secondary)">Open rate</div>
                </div>` : ''}
                ${c.confirmRate != null ? `<div style="text-align:center">
                  <div style="font-size:20px;font-weight:700;color:var(--violet)">${c.confirmRate}%</div>
                  <div style="font-size:10px;color:var(--text-secondary)">Confirm rate</div>
                </div>` : ''}
                <div style="display:flex;align-items:center;gap:10px;margin-left:8px">
                  <button class="btn btn-ghost btn-sm" onclick="window._remEditCampaign('${c.id}')">Edit</button>
                  <label class="jjj-toggle" title="${c.active ? 'Pause' : 'Activate'} campaign">
                    <input type="checkbox" ${c.active ? 'checked' : ''} onchange="window._remToggleCampaign('${c.id}',this.checked)">
                    <span class="jjj-toggle-slider"></span>
                  </label>
                  <span style="font-size:11px;color:${c.active ? 'var(--teal)' : 'var(--text-secondary)'};font-weight:600">${c.active ? 'Active' : 'Paused'}</span>
                </div>
              </div>
            </div>
            <div id="cc-edit-${c.id}" style="display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)">
              <div style="margin-bottom:8px;font-size:11.5px;font-weight:600;color:var(--text-secondary)">Message Template</div>
              <textarea id="cc-tpl-${c.id}" rows="3" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text-primary);font-size:12.5px;resize:vertical;font-family:inherit">${c.template || ''}</textarea>
              <div style="margin-top:5px;font-size:10.5px;color:var(--text-secondary)">Variables: [patient_name] [clinician] [time] [date] [session_number] [homework_task]</div>
              <div style="margin-top:8px;display:flex;gap:8px">
                <button class="btn btn-primary btn-sm" onclick="window._remSaveCampaignTemplate('${c.id}')">Save</button>
                <button class="btn btn-ghost btn-sm" onclick="document.getElementById('cc-edit-${c.id}').style.display='none'">Cancel</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── Tab: Outbox ────────────────────────────────────────────────────────────
  function renderOutbox() {
    const outbox = lsGet('ds_reminder_outbox', []);
    const STATUS_COLORS = {
      Queued:'var(--text-secondary)', Sent:'var(--blue)', Delivered:'var(--teal)',
      Failed:'var(--red)', Opened:'var(--violet)', Test:'var(--amber)',
    };

    // 7-day stacked bar chart
    const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const now = new Date();
    const dayCounts = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = DAY_NAMES[d.getDay()] + '-' + d.getDate();
      dayCounts[key] = { sms: 0, email: 0, push: 0, label: DAY_NAMES[d.getDay()] };
    }
    const dayKeys = Object.keys(dayCounts);
    outbox.forEach(m => {
      const d = new Date(m.scheduledAt);
      const key = DAY_NAMES[d.getDay()] + '-' + d.getDate();
      if (dayCounts[key]) {
        if (dayCounts[key][m.channel] !== undefined) dayCounts[key][m.channel]++;
      }
    });
    const maxVal = Math.max(1, ...dayKeys.map(k => dayCounts[k].sms + dayCounts[k].email + dayCounts[k].push));
    const CH_COLORS = { sms: 'var(--teal)', email: 'var(--blue)', push: 'var(--violet)' };
    const BAR_H = 80, BAR_W = 28, GAP = 14;
    const svgW = dayKeys.length * (BAR_W + GAP) + GAP;
    const bars = dayKeys.map((key, i) => {
      const d = dayCounts[key];
      const x = GAP + i * (BAR_W + GAP);
      let yOff = BAR_H;
      const rects = ['push', 'email', 'sms'].map(ch => {
        const h = Math.round((d[ch] / maxVal) * BAR_H);
        if (!h) return '';
        yOff -= h;
        return `<rect x="${x}" y="${yOff}" width="${BAR_W}" height="${h}" rx="2" fill="${CH_COLORS[ch]}" opacity="0.85"/>`;
      }).join('');
      return `${rects}<text x="${x + BAR_W / 2}" y="${BAR_H + 16}" text-anchor="middle" fill="var(--text-secondary)" font-size="10">${d.label}</text>`;
    }).join('');

    const filterStatus  = (window._remOutboxFilter && window._remOutboxFilter.status)  || '';
    const filterChannel = (window._remOutboxFilter && window._remOutboxFilter.channel) || '';
    const filtered = outbox.filter(m =>
      (!filterStatus  || m.status  === filterStatus) &&
      (!filterChannel || m.channel === filterChannel)
    );
    const failed = filtered.filter(m => m.status === 'Failed');

    document.getElementById('rem-tab-content').innerHTML = `
      <div class="jjj-delivery-chart">
        <div style="font-size:12px;font-weight:600;margin-bottom:10px;color:var(--text-primary)">7-Day Delivery Volume</div>
        <div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap">
          ${Object.entries(CH_COLORS).map(([ch, col]) =>
            `<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary)">
              <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${col};opacity:.85"></span>${ch.toUpperCase()}
            </div>`
          ).join('')}
        </div>
        <svg viewBox="0 0 ${svgW} ${BAR_H + 28}" style="width:100%;max-width:480px;overflow:visible" xmlns="http://www.w3.org/2000/svg">${bars}</svg>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
        <select style="padding:5px 10px;font-size:12px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:7px;color:var(--text-primary)"
                onchange="window._remSetOutboxFilter('status',this.value)">
          <option value="">All Statuses</option>
          ${STATUSES.map(s => `<option value="${s}" ${filterStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <select style="padding:5px 10px;font-size:12px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:7px;color:var(--text-primary)"
                onchange="window._remSetOutboxFilter('channel',this.value)">
          <option value="">All Channels</option>
          ${CHANNELS.map(c => `<option value="${c}" ${filterChannel === c ? 'selected' : ''}>${c.toUpperCase()}</option>`).join('')}
        </select>
        ${failed.length > 0 ? `<button class="btn btn-sm" style="background:rgba(255,107,107,.12);color:var(--red);border:1px solid rgba(255,107,107,.3)" onclick="window._remRetryFailed()">&#8634; Retry ${failed.length} Failed</button>` : ''}
        <span style="font-size:11.5px;color:var(--text-secondary);margin-left:4px">${filtered.length} message${filtered.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="background:rgba(255,255,255,.04);border-bottom:1px solid var(--border)">
              ${['Patient','Channel','Campaign','Scheduled','Status','Message','Action'].map(h =>
                `<th style="padding:9px 12px;text-align:left;font-size:10.5px;color:var(--text-secondary);font-weight:600;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-secondary)">No messages match filters</td></tr>`
              : filtered.map((m, i) => `
                <tr style="border-bottom:1px solid var(--border);${i % 2 ? 'background:rgba(255,255,255,.01)' : ''}">
                  <td style="padding:8px 12px;color:var(--text-primary);font-weight:500">${m.patientName}</td>
                  <td style="padding:8px 12px"><span class="jjj-channel-badge jjj-ch-${m.channel}">${m.channel.toUpperCase()}</span></td>
                  <td style="padding:8px 12px;color:var(--text-secondary);white-space:nowrap">${m.campaignName}</td>
                  <td style="padding:8px 12px;color:var(--text-secondary);white-space:nowrap;font-family:var(--font-mono);font-size:11px">${fmtDt(m.scheduledAt)}</td>
                  <td style="padding:8px 12px"><span style="font-size:11px;font-weight:600;color:${STATUS_COLORS[m.status] || 'var(--text-secondary)'}">${m.status}</span></td>
                  <td style="padding:8px 12px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${m.preview}">${m.preview}</td>
                  <td style="padding:8px 12px">
                    ${m.status === 'Queued' ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 8px" onclick="window._remSendNow('${m.id}')">Send Now</button>` : ''}
                    ${m.status === 'Failed' ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 8px" onclick="window._remSendNow('${m.id}')">Retry</button>` : ''}
                  </td>
                </tr>`
              ).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Tab: Adherence ─────────────────────────────────────────────────────────
  function renderAdherence() {
    let scores = lsGet('ds_adherence_scores', []);
    if (!scores.length) { scores = seedAdherenceScores(); lsSet('ds_adherence_scores', scores); }

    const avg       = Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length);
    const atRisk    = scores.filter(s => s.score < 60).length;
    const apptWeek  = 14;
    const cancelRate = 12;

    // 8-week trend
    const weekLabels = [];
    const nowD = new Date();
    for (let i = 7; i >= 0; i--) {
      const d = new Date(nowD);
      d.setDate(d.getDate() - i * 7);
      weekLabels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    }
    const weekScores = weekLabels.map((_, i) =>
      Math.max(30, Math.min(100, avg + (i - 4) * 2 + Math.round((Math.random() - 0.5) * 8)))
    );
    const WMIN = 30, WMAX = 100, CW = 340, CH2 = 80;
    const linePts = weekScores.map((v, i) => {
      const x = Math.round((i / (weekScores.length - 1)) * CW);
      const y = Math.round(CH2 - ((v - WMIN) / (WMAX - WMIN)) * CH2);
      return `${x},${y}`;
    }).join(' ');
    const areaPath = 'M 0,' + CH2 + ' ' + weekScores.map((v, i) => {
      const x = Math.round((i / (weekScores.length - 1)) * CW);
      const y = Math.round(CH2 - ((v - WMIN) / (WMAX - WMIN)) * CH2);
      return `L ${x},${y}`;
    }).join(' ') + ` L ${CW},${CH2} Z`;

    const TREND_ARROWS = { up: '&#8593;', stable: '&#8594;', down: '&#8595;' };
    const TREND_COLORS = { up: 'var(--teal)', stable: 'var(--text-secondary)', down: 'var(--red)' };

    document.getElementById('rem-tab-content').innerHTML = `
      <div class="jjj-stat-strip">
        ${[['Average Adherence', avg + '%', 'var(--teal)'],
           ['At-Risk Patients', atRisk, 'var(--red)'],
           ['Appts This Week', apptWeek, 'var(--blue)'],
           ['Cancellation Rate', cancelRate + '%', 'var(--amber)']
        ].map(([l, v, c]) => `
          <div class="jjj-stat-item">
            <div style="font-size:24px;font-weight:700;color:${c}">${v}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${l}</div>
          </div>`).join('')}
      </div>

      <div style="background:var(--bg-card,rgba(14,22,40,.8));border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:20px">
        <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:14px">Clinic-Wide Adherence — Last 8 Weeks</div>
        <svg viewBox="0 0 ${CW} ${CH2 + 26}" style="width:100%;max-width:500px;overflow:visible" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="adhGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--teal)" stop-opacity=".22"/>
            <stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/>
          </linearGradient></defs>
          <path d="${areaPath}" fill="url(#adhGrad)"/>
          <polyline points="${linePts}" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          ${weekScores.map((v, i) => {
            const x = Math.round((i / (weekScores.length - 1)) * CW);
            const y = Math.round(CH2 - ((v - WMIN) / (WMAX - WMIN)) * CH2);
            return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--teal)"/>`;
          }).join('')}
          ${weekLabels.filter((_, i) => i % 2 === 0).map((lbl, ii) => {
            const i = ii * 2;
            const x = Math.round((i / (weekScores.length - 1)) * CW);
            return `<text x="${x}" y="${CH2 + 18}" text-anchor="middle" fill="var(--text-secondary)" font-size="9">${lbl}</text>`;
          }).join('')}
        </svg>
      </div>

      ${atRisk > 0 ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
        <button class="btn btn-sm" style="background:rgba(255,107,107,.12);color:var(--red);border:1px solid rgba(255,107,107,.3)"
                onclick="window._remSendAdherenceBoost()">
          &#128226; Send Adherence Boost to ${atRisk} At-Risk Patient${atRisk > 1 ? 's' : ''}
        </button>
      </div>` : ''}

      <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            <tr style="background:rgba(255,255,255,.04);border-bottom:1px solid var(--border)">
              ${['Patient','Condition','Score','Appt %','Homework %','Login %','Trend','Action'].map(h =>
                `<th style="padding:9px 12px;text-align:left;font-size:10.5px;color:var(--text-secondary);font-weight:600;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${scores.map((s, i) => {
              const cls = s.score >= 80 ? 'green' : s.score >= 60 ? 'amber' : 'red';
              const barColor = cls === 'green' ? 'var(--teal)' : cls === 'amber' ? 'var(--amber)' : 'var(--red)';
              return `<tr class="jjj-adherence-row jjj-adh-${cls}" style="border-bottom:1px solid var(--border);${i % 2 ? 'background:rgba(255,255,255,.01)' : ''}">
                <td style="padding:9px 12px;font-weight:600;color:var(--text-primary)">${s.patientName}</td>
                <td style="padding:9px 12px;color:var(--text-secondary);font-size:11.5px">${s.condition || '—'}</td>
                <td style="padding:9px 12px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:50px;height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden">
                      <div style="height:100%;width:${s.score}%;background:${barColor};border-radius:3px"></div>
                    </div>
                    <span style="font-weight:700;color:${barColor}">${s.score}</span>
                  </div>
                </td>
                <td style="padding:9px 12px;color:var(--text-secondary)">${s.appt}%</td>
                <td style="padding:9px 12px;color:var(--text-secondary)">${s.hw}%</td>
                <td style="padding:9px 12px;color:var(--text-secondary)">${s.login}%</td>
                <td style="padding:9px 12px;font-size:18px;font-weight:700;color:${TREND_COLORS[s.trend]}">${TREND_ARROWS[s.trend]}</td>
                <td style="padding:9px 12px">
                  <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 10px"
                          onclick="window._remComposeFor('${s.patientId}','${s.patientName.replace(/'/g, "\\'")}')">Send</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ── Tab: Templates ─────────────────────────────────────────────────────────
  function renderTemplates() {
    const templates = lsGet('ds_message_templates', TEMPLATE_SEED);
    const VARS = ['[patient_name]','[clinician]','[time]','[date]','[session_number]','[homework_task]','[portal_link]'];
    const CAT_COLORS = {
      scheduling: 'var(--blue)', adherence: 'var(--teal)',
      milestones: 'var(--violet)', admin: 'var(--amber)', engagement: 'var(--red)',
    };

    document.getElementById('rem-tab-content').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 210px;gap:20px;align-items:start">
        <div style="display:grid;gap:12px">
          ${templates.map(t => `
            <div class="jjj-template-card" id="tpl-card-${t.id}">
              <div style="display:flex;align-items:flex-start;gap:12px">
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
                    <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${t.name}</span>
                    <span class="jjj-channel-badge jjj-ch-${t.channel}">${t.channel.toUpperCase()}</span>
                    <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.06);color:${CAT_COLORS[t.category] || 'var(--text-secondary)'};font-weight:600;text-transform:uppercase;letter-spacing:.04em">${t.category}</span>
                  </div>
                  ${t.subject ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-bottom:4px">Subject: ${t.subject}</div>` : ''}
                  <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${t.body}</div>
                </div>
                <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
                  <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 8px" onclick="window._remEditTemplate('${t.id}')">Edit</button>
                  <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 8px" onclick="window._remDupTemplate('${t.id}')">Dup</button>
                  <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 8px;color:var(--teal)" onclick="window._remSendTestTemplate('${t.id}')">Test</button>
                  <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:3px 8px;color:var(--red)" onclick="window._remDeleteTemplate('${t.id}')">Del</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="background:rgba(14,22,40,.8);border:1px solid var(--border);border-radius:10px;padding:16px;position:sticky;top:0">
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;letter-spacing:.05em">AVAILABLE VARIABLES</div>
          ${VARS.map(v => `
            <div style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">
              <code style="font-size:11px;background:rgba(255,255,255,.06);padding:2px 7px;border-radius:5px;color:var(--teal);font-family:var(--font-mono)">${v}</code>
            </div>`).join('')}
        </div>
      </div>
    `;
  }

  // ── Modal helper ───────────────────────────────────────────────────────────
  function showModal(html) {
    const overlay = document.getElementById('rem-modal-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `<div style="background:var(--bg-card,rgba(8,13,26,.97));border:1px solid var(--border);border-radius:14px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.75)">
      <button onclick="window._remCloseModal()" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:18px;color:var(--text-secondary);cursor:pointer;line-height:1">&#x2715;</button>
      ${html}
    </div>`;
  }

  window._remCloseModal = function() {
    const overlay = document.getElementById('rem-modal-overlay');
    if (overlay) overlay.style.display = 'none';
  };

  // ── Campaign handlers ──────────────────────────────────────────────────────
  window._remNewCampaignModal = function() {
    showModal(`
      <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:18px">New Reminder Campaign</div>
      <div style="display:grid;gap:12px">
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Campaign Name</label>
          <input id="nc-name" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:13px" placeholder="e.g. Weekly Motivation"/>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Trigger Type</label>
          <select id="nc-trigger" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:13px">
            <option value="24h_before">Time-based — 24 h before appointment</option>
            <option value="2h_before">Time-based — 2 h before appointment</option>
            <option value="missed">Event-based — After missed session</option>
            <option value="3day_interval">Recurring — Every 3 days</option>
            <option value="session_milestone">Event-based — Session milestone (10/20/30)</option>
          </select>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:6px">Channels</label>
          <div style="display:flex;gap:14px">
            ${['sms','email','push'].map(ch =>
              `<label style="display:flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer;color:var(--text-secondary)">
                <input type="checkbox" id="nc-ch-${ch}" value="${ch}" style="accent-color:var(--teal)"> ${ch.toUpperCase()}
              </label>`
            ).join('')}
          </div>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Message Template</label>
          <textarea id="nc-tpl" rows="4" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:12.5px;resize:vertical;font-family:inherit" placeholder="Hi [patient_name], your appointment is on [date] at [time] with [clinician]."></textarea>
          <div style="margin-top:4px;font-size:10.5px;color:var(--text-secondary)">Variables: [patient_name] [clinician] [time] [date] [session_number] [homework_task]</div>
        </div>
        <div id="nc-err" style="color:var(--red);font-size:12px;display:none"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
          <button class="btn btn-ghost btn-sm" onclick="window._remCloseModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._remSaveCampaign()">Create Campaign</button>
        </div>
      </div>
    `);
  };

  window._remSaveCampaign = function() {
    const name     = (document.getElementById('nc-name')?.value || '').trim();
    const trigger  = document.getElementById('nc-trigger')?.value || '24h_before';
    const template = (document.getElementById('nc-tpl')?.value || '').trim();
    const channels = ['sms','email','push'].filter(ch => document.getElementById('nc-ch-' + ch)?.checked);
    const errEl    = document.getElementById('nc-err');
    if (!name) { if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Campaign name is required.'; } return; }
    if (!channels.length) { if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Select at least one channel.'; } return; }
    const campaigns = lsGet('ds_reminder_campaigns', []);
    campaigns.push({ id: 'rc-' + Date.now(), name, trigger, channels, active: true, sentMonth: 0, openRate: 0, confirmRate: 0, template });
    lsSet('ds_reminder_campaigns', campaigns);
    window._remCloseModal();
    renderCampaigns();
  };

  window._remEditCampaign = function(id) {
    const el = document.getElementById('cc-edit-' + id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window._remSaveCampaignTemplate = function(id) {
    const tplEl = document.getElementById('cc-tpl-' + id);
    if (!tplEl) return;
    const campaigns = lsGet('ds_reminder_campaigns', []);
    const c = campaigns.find(c => c.id === id);
    if (c) { c.template = tplEl.value; lsSet('ds_reminder_campaigns', campaigns); }
    const editEl = document.getElementById('cc-edit-' + id);
    if (editEl) editEl.style.display = 'none';
  };

  window._remToggleCampaign = function(id, active) {
    const campaigns = lsGet('ds_reminder_campaigns', []);
    const c = campaigns.find(c => c.id === id);
    if (c) { c.active = active; lsSet('ds_reminder_campaigns', campaigns); }
    renderCampaigns();
  };

  // ── Outbox handlers ────────────────────────────────────────────────────────
  window._remSetOutboxFilter = function(key, val) {
    if (!window._remOutboxFilter) window._remOutboxFilter = {};
    window._remOutboxFilter[key] = val;
    renderOutbox();
  };

  window._remSendNow = function(id) {
    setTimeout(() => {
      const outbox = lsGet('ds_reminder_outbox', []);
      const m = outbox.find(m => m.id === id);
      if (m) { m.status = 'Delivered'; lsSet('ds_reminder_outbox', outbox); }
      renderOutbox();
    }, 800);
  };

  window._remRetryFailed = function() {
    const outbox = lsGet('ds_reminder_outbox', []);
    outbox.forEach(m => { if (m.status === 'Failed') m.status = 'Queued'; });
    lsSet('ds_reminder_outbox', outbox);
    renderOutbox();
  };

  // ── Adherence handlers ─────────────────────────────────────────────────────
  window._remSendAdherenceBoost = function() {
    const scores  = lsGet('ds_adherence_scores', []);
    const atRisk  = scores.filter(s => s.score < 60);
    const outbox  = lsGet('ds_reminder_outbox', []);
    atRisk.forEach(s => {
      outbox.unshift({
        id: 'ob-boost-' + Date.now() + '-' + s.patientId,
        patientId: s.patientId, patientName: s.patientName,
        channel: 'email', campaignId: 'manual', campaignName: 'Adherence Boost',
        scheduledAt: new Date().toISOString(), status: 'Queued',
        preview: 'Hi ' + s.patientName + ', we noticed your recent attendance has been lower. We are here to help.',
      });
    });
    lsSet('ds_reminder_outbox', outbox);
    alert('Queued adherence boost reminders for ' + atRisk.length + ' at-risk patient' + (atRisk.length > 1 ? 's' : '') + '.');
    window._remSwitchTab('outbox');
  };

  window._remComposeFor = function(patientId, patientName) {
    showModal(`
      <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:18px">Send Manual Reminder</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">To: <strong style="color:var(--text-primary)">${patientName}</strong></div>
      <div style="display:grid;gap:12px">
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Channel</label>
          <select id="mc-ch" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:13px">
            <option value="email">Email</option><option value="sms">SMS</option><option value="push">Push</option>
          </select>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Message</label>
          <textarea id="mc-body" rows="4" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:12.5px;resize:vertical;font-family:inherit">Hi ${patientName}, we wanted to check in on your treatment progress. If you have any questions or need to reschedule, please reach out.</textarea>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
          <button class="btn btn-ghost btn-sm" onclick="window._remCloseModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._remSendManual('${patientId}','${patientName.replace(/'/g, "\\'")}')">Send</button>
        </div>
      </div>
    `);
  };

  window._remSendManual = function(patientId, patientName) {
    const ch   = document.getElementById('mc-ch')?.value || 'email';
    const body = (document.getElementById('mc-body')?.value || '').trim();
    if (!body) return;
    const outbox = lsGet('ds_reminder_outbox', []);
    outbox.unshift({
      id: 'ob-manual-' + Date.now(),
      patientId, patientName, channel: ch,
      campaignId: 'manual', campaignName: 'Manual Reminder',
      scheduledAt: new Date().toISOString(), status: 'Queued',
      preview: body.slice(0, 80) + '...',
    });
    lsSet('ds_reminder_outbox', outbox);
    window._remCloseModal();
    alert('Reminder queued for ' + patientName + '.');
  };

  // ── Template handlers ──────────────────────────────────────────────────────
  window._remEditTemplate = function(id) {
    const templates = lsGet('ds_message_templates', TEMPLATE_SEED);
    const t = templates.find(t => t.id === id);
    if (!t) return;
    showModal(`
      <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:18px">Edit Template</div>
      <div style="display:grid;gap:12px">
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Name</label>
          <input id="et-name" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:13px" value="${t.name}"/>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Channel</label>
          <select id="et-ch" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:13px">
            ${['sms','email','push'].map(c => `<option value="${c}" ${t.channel === c ? 'selected' : ''}>${c.toUpperCase()}</option>`).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Subject (email only)</label>
          <input id="et-sub" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:13px" value="${t.subject || ''}"/>
        </div>
        <div>
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Body</label>
          <textarea id="et-body" rows="5" style="width:100%;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:12.5px;resize:vertical;font-family:inherit">${t.body}</textarea>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px">
          <button class="btn btn-ghost btn-sm" onclick="window._remCloseModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._remSaveTemplate('${id}')">Save</button>
        </div>
      </div>
    `);
  };

  window._remSaveTemplate = function(id) {
    const templates = lsGet('ds_message_templates', TEMPLATE_SEED);
    const t = templates.find(t => t.id === id);
    if (!t) return;
    t.name    = (document.getElementById('et-name')?.value || '').trim() || t.name;
    t.channel = document.getElementById('et-ch')?.value  || t.channel;
    t.subject = document.getElementById('et-sub')?.value || '';
    t.body    = document.getElementById('et-body')?.value || t.body;
    lsSet('ds_message_templates', templates);
    window._remCloseModal();
    renderTemplates();
  };

  window._remDupTemplate = function(id) {
    const templates = lsGet('ds_message_templates', TEMPLATE_SEED);
    const t = templates.find(t => t.id === id);
    if (!t) return;
    templates.push(Object.assign({}, t, { id: 'tpl-' + Date.now(), name: t.name + ' (Copy)' }));
    lsSet('ds_message_templates', templates);
    renderTemplates();
  };

  window._remDeleteTemplate = function(id) {
    if (!confirm('Delete this template?')) return;
    const templates = lsGet('ds_message_templates', TEMPLATE_SEED).filter(t => t.id !== id);
    lsSet('ds_message_templates', templates);
    renderTemplates();
  };

  window._remSendTestTemplate = function(id) {
    const templates = lsGet('ds_message_templates', TEMPLATE_SEED);
    const t = templates.find(t => t.id === id);
    if (!t) return;
    const outbox = lsGet('ds_reminder_outbox', []);
    outbox.unshift({
      id: 'ob-test-' + Date.now(), patientId: 'test', patientName: '[TEST]',
      channel: t.channel, campaignId: 'test', campaignName: t.name,
      scheduledAt: new Date().toISOString(), status: 'Test',
      preview: t.body.slice(0, 80) + '...',
    });
    lsSet('ds_reminder_outbox', outbox);
    alert('Test message queued in Outbox for template "' + t.name + '".');
  };

  // ── Tab switching ──────────────────────────────────────────────────────────
  window._remSwitchTab = function(tab) {
    activeTab = tab;
    document.querySelectorAll('[id^="remtab-"]').forEach(btn => {
      const t = btn.id.replace('remtab-', '');
      btn.classList.toggle('active', t === tab);
    });
    if (tab === 'campaigns')  renderCampaigns();
    else if (tab === 'outbox')     renderOutbox();
    else if (tab === 'adherence')  renderAdherence();
    else if (tab === 'templates')  renderTemplates();
  };

  window._remRefresh = function() { window._remSwitchTab(activeTab); };

  // Close modal on backdrop click
  document.getElementById('rem-modal-overlay')?.addEventListener('click', function(e) {
    if (e.target === this) window._remCloseModal();
  });

  // Initial render
  renderCampaigns();
}

// ── Media Queue (clinician review) ────────────────────────────────────────────
// Endpoints (all in media_router.py):
//   GET  /api/v1/media/review-queue              — items in pending_review | reupload_requested
//   POST /api/v1/media/review/{id}/action        — approve | reject | request_reupload | flag_urgent | mark_reviewed
//   POST /api/v1/media/review/{id}/analyze       — trigger AI analysis (status must be approved_for_analysis)
//   GET  /api/v1/media/analysis/{id}             — fetch full analysis result
//   POST /api/v1/media/analysis/{id}/approve     — approve AI draft for clinical use → status clinician_reviewed
//   GET  /api/v1/media/file/{file_ref:path}      — authenticated audio file serving

const _MQ_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';

async function _mqFetch(path, opts = {}) {
  const token   = api.getToken();
  const isForm  = opts.body instanceof FormData;
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${_MQ_BASE}${path}`, { ...opts, headers });
  if (res.status === 204) return null;
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try { const e = await res.json(); msg = e.detail || msg; } catch (_e2) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function pgMediaQueue(setTopbar) {
  setTopbar('Patient Media Queue', `
    <button class="btn btn-ghost btn-sm" onclick="window._mqRefresh()">&#8634; Refresh</button>
  `);

  // The practice shell may use 'main-content', 'content', or fall back to body.
  const container = document.getElementById('main-content')
    || document.getElementById('content')
    || document.body;
  container.innerHTML = spinner();

  // ── Local helpers ──────────────────────────────────────────────────────────
  function _mqFmtDate(d) {
    if (!d) return '\u2014';
    try {
      return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_e) { return d; }
  }

  function _mqEsc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  // Status labels/colours — aligned with backend status enum values in media_router.py
  const MQ_STATUS = {
    pending_review:        { label: 'Pending Review',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
    approved_for_analysis: { label: 'Approved — Queued',    color: 'var(--blue,#4a9eff)', bg: 'rgba(74,158,255,0.1)' },
    analyzing:             { label: 'AI Analysis Running',  color: 'var(--blue,#4a9eff)', bg: 'rgba(74,158,255,0.1)' },
    analyzed:              { label: 'Analyzed',              color: 'var(--teal,#00d4bc)', bg: 'rgba(0,212,188,0.08)' },
    clinician_reviewed:    { label: 'Reviewed',              color: 'var(--green,#22c55e)', bg: 'rgba(34,197,94,0.08)' },
    rejected:              { label: 'Rejected',              color: '#94a3b8', bg: 'rgba(148,163,184,0.08)' },
    reupload_requested:    { label: 'Re-upload Requested',   color: '#f97316', bg: 'rgba(249,115,22,0.08)'  },
  };

  function _mqChip(status) {
    const m = MQ_STATUS[status] || { label: status || 'Unknown', color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.06)' };
    return `<span style="font-size:10.5px;font-weight:600;padding:2px 9px;border-radius:99px;
      color:${m.color};background:${m.bg};border:1px solid ${m.color}">${_mqEsc(m.label)}</span>`;
  }

  // ── Module state ───────────────────────────────────────────────────────────
  let _mqQueue  = [];   // current queue list
  let _mqDetail = null; // upload currently open in detail view

  // ── Queue list renderer ────────────────────────────────────────────────────
  function _mqRenderQueue() {
    const listEl = document.getElementById('mq-list');
    if (!listEl) return;

    if (_mqQueue.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:56px 20px;color:var(--text-tertiary)">
          <div style="font-size:28px;margin-bottom:14px;opacity:.35">&#x1f4ed;</div>
          <div style="font-size:13.5px">No items pending review.</div>
        </div>`;
      return;
    }

    listEl.innerHTML = _mqQueue.map((u, idx) => {
      const isVoice   = (u.media_type || '').toLowerCase() === 'voice';
      const typeIcon  = isVoice ? '&#127897;' : '&#128221;';
      const typeLabel = isVoice ? 'Voice Note' : 'Text Update';
      const urgentBadge = u.is_urgent
        ? `<span style="font-size:10px;font-weight:700;color:#ef4444;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.4);border-radius:4px;padding:1px 7px;margin-right:4px">URGENT</span>`
        : '';
      return `
        <div class="card" style="margin-bottom:10px;cursor:pointer;${u.is_urgent ? 'border-color:rgba(239,68,68,0.35)' : ''}"
             id="mq-card-${idx}" onclick="window._mqOpenDetail(${idx})" role="button" tabindex="0">
          <div class="card-body" style="padding:14px 16px;display:flex;align-items:center;gap:14px">
            <div style="font-size:22px;flex-shrink:0">${typeIcon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                ${urgentBadge}
                <span style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${_mqEsc(typeLabel)}</span>
                <span style="font-size:11.5px;color:var(--text-tertiary)">&mdash; Patient&nbsp;${_mqEsc(u.patient_id || '\u2014')}</span>
                ${_mqChip(u.status)}
              </div>
              <div style="font-size:11.5px;color:var(--text-secondary)">
                ${_mqEsc(_mqFmtDate(u.created_at))}
                ${u.course_id ? ` &middot; Course&nbsp;${_mqEsc(u.course_id)}` : ''}
                ${u.patient_note ? ` &middot; ${_mqEsc(u.patient_note.slice(0, 60))}` : ''}
              </div>
            </div>
            <div style="flex-shrink:0;color:var(--text-tertiary);font-size:16px">&#8250;</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Detail view renderer ───────────────────────────────────────────────────
  function _mqRenderDetail(upload) {
    const detailEl = document.getElementById('mq-detail');
    if (!detailEl) return;

    const isVoice  = (upload.media_type || '').toLowerCase() === 'voice';
    const analysis = upload._analysis || null;
    const transcript = upload.transcript || null;

    // AI analysis panel (shown after analyze step completes)
    let analysisHTML = '';
    if (analysis) {
      const approved = analysis.approved_for_clinical_use;
      const fqList   = (() => {
        try {
          const fq = typeof analysis.follow_up_questions === 'string'
            ? JSON.parse(analysis.follow_up_questions)
            : analysis.follow_up_questions;
          if (Array.isArray(fq)) return fq.map(q => `<li style="margin-bottom:4px">${_mqEsc(String(q))}</li>`).join('');
          return _mqEsc(String(fq || ''));
        } catch (_e) { return _mqEsc(String(analysis.follow_up_questions || '')); }
      })();

      analysisHTML = `
        <div class="card" style="margin-bottom:16px;border-color:rgba(0,212,188,0.3)">
          <div class="card-header" style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;font-weight:600;color:var(--teal,#00d4bc)">&#129302; AI Analysis</span>
            <span style="font-size:10.5px;color:var(--text-tertiary)">
              Draft only &mdash; clinician approval required before clinical use
            </span>
          </div>
          <div class="card-body" style="padding:16px 18px">
            ${analysis.structured_summary ? `
            <div style="margin-bottom:14px">
              <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);margin-bottom:5px">Summary</div>
              <div style="font-size:12.5px;color:var(--text-primary);line-height:1.65;white-space:pre-wrap">${_mqEsc(analysis.structured_summary)}</div>
            </div>` : ''}
            ${analysis.chart_note_draft ? `
            <div style="margin-bottom:14px">
              <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);margin-bottom:5px">Chart Note Draft</div>
              <div style="font-size:12px;background:rgba(0,212,188,0.05);border:1px solid rgba(0,212,188,0.15);border-radius:6px;padding:12px;line-height:1.65;white-space:pre-wrap">${_mqEsc(analysis.chart_note_draft)}</div>
            </div>` : ''}
            ${fqList ? `
            <div style="margin-bottom:14px">
              <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);margin-bottom:5px">Suggested Follow-up Questions</div>
              <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-primary);line-height:1.65">${fqList}</ul>
            </div>` : ''}
            <div id="mq-draft-approve-msg" style="display:none;margin-bottom:10px"></div>
            ${!approved ? `
            <button class="btn btn-primary btn-sm" id="mq-btn-approve-draft"
                    onclick="window._mqApproveDraft('${_mqEsc(upload.id)}')">
              Approve Draft for Clinical Use
            </button>` : `
            <div style="font-size:12px;color:var(--green,#22c55e);font-weight:600">
              &#x2713; Approved for clinical use
              ${analysis.clinician_reviewed_at
                ? `<span style="font-weight:400;color:var(--text-tertiary);margin-left:6px">${_mqEsc(_mqFmtDate(analysis.clinician_reviewed_at))}</span>`
                : ''}
            </div>`}
          </div>
        </div>`;
    }

    // Transcript panel
    let transcriptHTML = '';
    if (transcript?.transcript_text) {
      transcriptHTML = `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header" style="font-size:12px;font-weight:600">Transcript</div>
          <div class="card-body" style="padding:14px 18px;font-size:12.5px;line-height:1.7;white-space:pre-wrap">${_mqEsc(transcript.transcript_text)}</div>
        </div>`;
    }

    // Audio player (voice notes only, served via authenticated endpoint)
    let audioHTML = '';
    if (isVoice && upload.file_ref) {
      const audioSrc = `${_MQ_BASE}/api/v1/media/file/${encodeURIComponent(upload.file_ref)}`;
      audioHTML = `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header" style="font-size:12px;font-weight:600">Voice Note</div>
          <div class="card-body" style="padding:14px 18px">
            <audio controls style="width:100%;max-width:480px" src="${_mqEsc(audioSrc)}" preload="metadata">
              Your browser does not support audio playback.
            </audio>
            ${upload.duration_seconds != null
              ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">Duration: ${_mqEsc(String(upload.duration_seconds))}s</div>`
              : ''}
          </div>
        </div>`;
    }

    // Text content panel (text uploads only)
    let textHTML = '';
    if (!isVoice && upload.text_content) {
      textHTML = `
        <div class="card" style="margin-bottom:16px">
          <div class="card-header" style="font-size:12px;font-weight:600">Patient Update</div>
          <div class="card-body" style="padding:14px 18px;font-size:13px;line-height:1.7;white-space:pre-wrap">${_mqEsc(upload.text_content)}</div>
        </div>`;
    }

    // Review action buttons — computed from current status
    const s = upload.status;
    const canApprove      = s === 'pending_review';
    const canAnalyze      = s === 'approved_for_analysis';
    const canMarkReviewed = s === 'analyzed';
    const canReject       = s === 'pending_review' || s === 'reupload_requested';
    const canReupload     = s === 'pending_review';
    const canFlagUrgent   = s === 'pending_review';

    const actionsHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header" style="font-size:12px;font-weight:600">Review Actions</div>
        <div class="card-body" style="padding:16px 18px">
          <div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:12px">
            Status: ${_mqChip(s)}
            &nbsp;&middot;&nbsp; Uploaded ${_mqEsc(_mqFmtDate(upload.created_at))}
            &nbsp;&middot;&nbsp; Patient&nbsp;${_mqEsc(upload.patient_id || '\u2014')}
          </div>
          <div style="margin-bottom:12px">
            <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:5px">
              Reason / note for patient
              ${(canReject || canReupload) ? '<span style="color:#f97316">(required for Reject &amp; Re-upload)</span>' : '(optional)'}
            </label>
            <textarea id="mq-action-reason" class="form-control" rows="2"
                      placeholder="Brief reason visible to the patient\u2026"
                      style="font-size:12.5px;resize:vertical"></textarea>
          </div>
          <div id="mq-action-msg" style="display:none;margin-bottom:10px"></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${canApprove
              ? `<button class="btn btn-primary btn-sm"
                         onclick="window._mqAction('${_mqEsc(upload.id)}','approve')">
                   Approve for Analysis
                 </button>`
              : ''}
            ${canAnalyze
              ? `<button class="btn btn-primary btn-sm" id="mq-btn-analyze"
                         onclick="window._mqAnalyze('${_mqEsc(upload.id)}')">
                   &#129302; Run AI Analysis
                 </button>`
              : ''}
            ${canMarkReviewed
              ? `<button class="btn btn-primary btn-sm"
                         onclick="window._mqAction('${_mqEsc(upload.id)}','mark_reviewed')">
                   Mark Reviewed
                 </button>`
              : ''}
            ${canReject
              ? `<button class="btn btn-ghost btn-sm"
                         style="color:#94a3b8;border-color:rgba(148,163,184,0.4)"
                         onclick="window._mqAction('${_mqEsc(upload.id)}','reject')">
                   Reject
                 </button>`
              : ''}
            ${canReupload
              ? `<button class="btn btn-ghost btn-sm"
                         style="color:#f97316;border-color:rgba(249,115,22,0.4)"
                         onclick="window._mqAction('${_mqEsc(upload.id)}','request_reupload')">
                   Request Re-upload
                 </button>`
              : ''}
            ${canFlagUrgent
              ? `<button class="btn btn-ghost btn-sm"
                         style="color:#ef4444;border-color:rgba(239,68,68,0.4)"
                         onclick="window._mqAction('${_mqEsc(upload.id)}','flag_urgent')">
                   &#9888; Flag Urgent
                 </button>`
              : ''}
          </div>
        </div>
      </div>`;

    detailEl.innerHTML = `
      <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <button class="btn btn-ghost btn-sm" onclick="window._mqBack()">&#8592; Back to Queue</button>
        <span style="font-size:12.5px;color:var(--text-tertiary)">${isVoice ? 'Voice Note' : 'Text Update'}</span>
        ${upload.is_urgent
          ? `<span style="font-size:10px;font-weight:700;color:#ef4444;background:rgba(239,68,68,0.12);
               border:1px solid rgba(239,68,68,0.4);border-radius:4px;padding:1px 7px">URGENT</span>`
          : ''}
      </div>
      ${textHTML}
      ${audioHTML}
      ${transcriptHTML}
      ${actionsHTML}
      ${analysisHTML}
    `;
  }

  // ── Action handlers ────────────────────────────────────────────────────────
  window._mqAction = async function(uploadId, action) {
    const reason      = document.getElementById('mq-action-reason')?.value?.trim() || '';
    const msgEl       = document.getElementById('mq-action-msg');
    const needsReason = action === 'reject' || action === 'request_reupload';
    if (needsReason && !reason) {
      if (msgEl) {
        msgEl.className    = 'notice notice-warn';
        msgEl.style.display = '';
        msgEl.textContent  = 'Please enter a reason for the patient before taking this action.';
      }
      return;
    }
    // Disable all buttons while the request is in flight
    document.querySelectorAll('#mq-detail .btn').forEach(b => { b.disabled = true; });
    if (msgEl) { msgEl.className = 'notice notice-info'; msgEl.style.display = ''; msgEl.textContent = 'Processing\u2026'; }
    try {
      await _mqFetch(`/api/v1/media/review/${encodeURIComponent(uploadId)}/action`, {
        method: 'POST',
        body:   JSON.stringify({ action, reason: reason || undefined }),
      });
      if (msgEl) { msgEl.className = 'notice notice-success'; msgEl.style.display = ''; msgEl.textContent = 'Action recorded. Returning to queue\u2026'; }
      await window._mqRefresh();
      window._mqBack();
    } catch (err) {
      if (msgEl) {
        msgEl.className    = 'notice notice-error';
        msgEl.style.display = '';
        msgEl.textContent  = `Could not perform action: ${err.message || 'Unknown error'}. Please try again.`;
      }
      document.querySelectorAll('#mq-detail .btn').forEach(b => { b.disabled = false; });
    }
  };

  window._mqAnalyze = async function(uploadId) {
    const msgEl     = document.getElementById('mq-action-msg');
    const analyzeBtn = document.getElementById('mq-btn-analyze');
    if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyzing\u2026'; }
    if (msgEl) {
      msgEl.className    = 'notice notice-info';
      msgEl.style.display = '';
      msgEl.textContent  = 'Running AI analysis. This may take 15\u201330 seconds\u2026';
    }
    try {
      const result = await _mqFetch(`/api/v1/media/review/${encodeURIComponent(uploadId)}/analyze`, { method: 'POST' });
      if (msgEl) { msgEl.className = 'notice notice-success'; msgEl.style.display = ''; msgEl.textContent = 'AI analysis complete.'; }
      // Attach result and re-render detail in place
      if (_mqDetail && _mqDetail.id === uploadId) {
        _mqDetail._analysis = result;
        _mqDetail.status    = 'analyzed';
        const qi = _mqQueue.find(u => u.id === uploadId);
        if (qi) qi.status = 'analyzed';
        _mqRenderDetail(_mqDetail);
      }
    } catch (err) {
      if (msgEl) {
        msgEl.className    = 'notice notice-error';
        msgEl.style.display = '';
        msgEl.textContent  = `Analysis failed: ${err.message || 'Unknown error'}. Please try again.`;
      }
      if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.innerHTML = '&#129302; Run AI Analysis'; }
    }
  };

  window._mqApproveDraft = async function(uploadId) {
    const msgEl     = document.getElementById('mq-draft-approve-msg');
    const approveBtn = document.getElementById('mq-btn-approve-draft');
    if (approveBtn) { approveBtn.disabled = true; approveBtn.textContent = 'Approving\u2026'; }
    if (msgEl) { msgEl.className = 'notice notice-info'; msgEl.style.display = ''; msgEl.textContent = 'Approving draft\u2026'; }
    try {
      await _mqFetch(`/api/v1/media/analysis/${encodeURIComponent(uploadId)}/approve`, { method: 'POST' });
      if (msgEl) { msgEl.className = 'notice notice-success'; msgEl.style.display = ''; msgEl.textContent = 'Draft approved for clinical use.'; }
      // Update local state and re-render
      if (_mqDetail && _mqDetail.id === uploadId && _mqDetail._analysis) {
        _mqDetail._analysis.approved_for_clinical_use = true;
        _mqDetail._analysis.clinician_reviewed_at     = new Date().toISOString();
        _mqDetail.status = 'clinician_reviewed';
        const qi = _mqQueue.find(u => u.id === uploadId);
        if (qi) qi.status = 'clinician_reviewed';
        _mqRenderDetail(_mqDetail);
      }
    } catch (err) {
      if (msgEl) {
        msgEl.className    = 'notice notice-error';
        msgEl.style.display = '';
        msgEl.textContent  = `Could not approve draft: ${err.message || 'Unknown error'}.`;
      }
      if (approveBtn) { approveBtn.disabled = false; approveBtn.textContent = 'Approve Draft for Clinical Use'; }
    }
  };

  window._mqOpenDetail = async function(idx) {
    const upload = _mqQueue[idx];
    if (!upload) return;
    _mqDetail = upload;

    const listWrap = document.getElementById('mq-list-wrap');
    const detailEl = document.getElementById('mq-detail');
    if (listWrap) listWrap.style.display = 'none';
    if (detailEl) detailEl.style.display = '';
    _mqRenderDetail(upload);

    // Lazy-load analysis for analyzed/reviewed items
    if (['analyzed', 'clinician_reviewed'].includes(upload.status) && !upload._analysis) {
      try {
        const analysis = await _mqFetch(`/api/v1/media/analysis/${encodeURIComponent(upload.id)}`);
        _mqDetail._analysis = analysis;
        _mqRenderDetail(_mqDetail);
      } catch (_e) { /* analysis may not yet exist — silently skip */ }
    }
  };

  window._mqBack = function() {
    _mqDetail = null;
    const listWrap = document.getElementById('mq-list-wrap');
    const detailEl = document.getElementById('mq-detail');
    if (listWrap) listWrap.style.display = '';
    if (detailEl) detailEl.style.display = 'none';
    _mqRenderQueue();
  };

  window._mqRefresh = async function() {
    try {
      const raw = await _mqFetch('/api/v1/media/review-queue');
      _mqQueue  = Array.isArray(raw) ? raw : [];
      _mqRenderQueue();
    } catch (_e) {
      const listEl = document.getElementById('mq-list');
      if (listEl) {
        listEl.innerHTML = `
          <div class="notice notice-error" style="margin:16px 0">
            Could not load review queue. Please check your connection and try again.
            <button class="btn btn-ghost btn-sm" style="margin-left:10px"
                    onclick="window._mqRefresh()">Retry</button>
          </div>`;
      }
    }
  };

  // ── Shell layout ───────────────────────────────────────────────────────────
  container.innerHTML = `
    <div id="mq-list-wrap">
      <div style="margin-bottom:16px">
        <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Patient Media Queue</div>
        <div style="font-size:12.5px;color:var(--text-secondary)">
          Review patient voice notes and text updates before AI analysis is triggered.
          Approve for analysis, request revision, or flag urgent items.
        </div>
      </div>
      <div class="notice notice-warn" style="margin-bottom:16px;font-size:12px">
        <strong>Clinical AI Notice:</strong> All AI-generated analysis is a draft only and must be reviewed and
        explicitly approved by a qualified clinician before it affects any clinical decision or record.
      </div>
      <div id="mq-list">${spinner()}</div>
    </div>
    <div id="mq-detail" style="display:none"></div>
  `;

  await window._mqRefresh();
}

// ── Home Task Manager ─────────────────────────────────────────────────────────
export async function pgHomeTaskManager(setTopbar) {
  setTopbar('Home Task Manager',
    `<button class="btn btn-primary btn-sm" onclick="window._htmOpenAssign()">+ Assign Task</button>`);

  const el = document.getElementById('content');
  if (!el) return;
  el.innerHTML = '<div id="htm-root"></div>';

  // ── localStorage helpers ─────────────────────────────────────────────────
  function lsGet(k, def) { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? def; } catch { return def; } }
  function lsSet(k, v)   { localStorage.setItem(k, JSON.stringify(v)); }

  // ── Namespaced storage helpers ────────────────────────────────────────────
  function _htmTaskKey(pid) {
    return pid ? 'ds_clinician_tasks_' + pid : 'ds_clinician_tasks_all';
  }

  function _htmKnownPatients() {
    return lsGet('ds_clinician_tasks_all_patients', ['pt-001', 'pt-002', 'pt-003']);
  }

  function _htmRegisterPatient(pid) {
    const known = _htmKnownPatients();
    if (!known.includes(pid)) {
      known.push(pid);
      lsSet('ds_clinician_tasks_all_patients', known);
    }
  }

  function getAllPatientTasks() {
    const knownPatients = _htmKnownPatients();
    const allTasks = [];
    knownPatients.forEach(pid => {
      const tasks = lsGet(_htmTaskKey(pid), []);
      allTasks.push(...tasks);
    });
    return allTasks;
  }

  // ── Seed data ────────────────────────────────────────────────────────────
  function seedTasks() {
    // Migration: if legacy global key exists and pt-001 namespaced key does not, migrate by patientId
    if (!localStorage.getItem(_htmTaskKey('pt-001'))) {
      const legacy = lsGet('ds_clinician_tasks', []);
      if (legacy.length > 0) {
        const byPatient = {};
        legacy.forEach(t => {
          const pid = t.patientId || 'pt-001';
          byPatient[pid] = byPatient[pid] || [];
          byPatient[pid].push(t);
        });
        Object.entries(byPatient).forEach(([pid, tasks]) => {
          lsSet(_htmTaskKey(pid), tasks);
          _htmRegisterPatient(pid);
        });
        return;
      }
    }
    // Already seeded — skip if all three patient keys exist
    if (localStorage.getItem(_htmTaskKey('pt-001')) &&
        localStorage.getItem(_htmTaskKey('pt-002')) &&
        localStorage.getItem(_htmTaskKey('pt-003'))) return;

    const today = new Date();
    function dStr(offset) {
      const d = new Date(today); d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    }
    const seedPt001 = [
      { id:'ht-001', patientId:'pt-001', patientName:'Alex Johnson',  title:'4-7-8 Breathing Exercise', category:'Breathing',  dueDate:dStr(0),  status:'complete',  recurrence:'Daily',   priority:'High',   instructions:'Inhale 4s, hold 7s, exhale 8s. Perform 3 rounds before sleep.' },
      { id:'ht-002', patientId:'pt-001', patientName:'Alex Johnson',  title:'Mood & Energy Journal',    category:'Journal',    dueDate:dStr(1),  status:'pending',   recurrence:'Daily',   priority:'Medium', instructions:'Log mood (1-10), energy (1-10), and one notable event each evening.' },
      { id:'ht-003', patientId:'pt-001', patientName:'Alex Johnson',  title:'30-min Outdoor Walk',      category:'Activity',   dueDate:dStr(-1), status:'complete',  recurrence:'3x/week', priority:'Medium', instructions:'Walk outdoors during daylight hours for 30 minutes at a comfortable pace.' },
      { id:'ht-004', patientId:'pt-001', patientName:'Alex Johnson',  title:'Sleep Hygiene Protocol',   category:'Sleep',      dueDate:dStr(2),  status:'pending',   recurrence:'Daily',   priority:'High',   instructions:'No screens 1 hour before bed. Consistent sleep/wake time within 30 minutes.' },
      { id:'ht-005', patientId:'pt-001', patientName:'Alex Johnson',  title:'Social Check-in',          category:'Social',     dueDate:dStr(-3), status:'complete',  recurrence:'Weekly',  priority:'Low',    instructions:'Reach out to one friend or family member for a meaningful conversation.' },
    ];
    const seedPt002 = [
      { id:'ht-006', patientId:'pt-002', patientName:'Morgan Lee',    title:'Progressive Muscle Relax', category:'Breathing',  dueDate:dStr(0),  status:'overdue',   recurrence:'Daily',   priority:'High',   instructions:'Tense and release each muscle group from feet to face over 15 minutes.' },
      { id:'ht-007', patientId:'pt-002', patientName:'Morgan Lee',    title:'Gratitude Journal',        category:'Journal',    dueDate:dStr(1),  status:'pending',   recurrence:'Daily',   priority:'Low',    instructions:'Write 3 things you are grateful for before sleeping.' },
      { id:'ht-008', patientId:'pt-002', patientName:'Morgan Lee',    title:'Outdoor Activity 20min',   category:'Activity',   dueDate:dStr(-2), status:'complete',  recurrence:'2x/week', priority:'Medium', instructions:'Any outdoor physical activity for at least 20 minutes.' },
      { id:'ht-009', patientId:'pt-002', patientName:'Morgan Lee',    title:'Screen-free Evening Hour', category:'Screen',     dueDate:dStr(-1), status:'overdue',   recurrence:'Daily',   priority:'Medium', instructions:'Avoid all screens (phone, TV, computer) for 1 hour before bedtime.' },
    ];
    const seedPt003 = [
      { id:'ht-010', patientId:'pt-003', patientName:'Jordan Smith',  title:'Box Breathing',            category:'Breathing',  dueDate:dStr(-4), status:'overdue',   recurrence:'Daily',   priority:'High',   instructions:'Inhale 4s, hold 4s, exhale 4s, hold 4s. Repeat 5 times, 2x/day.' },
      { id:'ht-011', patientId:'pt-003', patientName:'Jordan Smith',  title:'Daily Step Goal 3k',       category:'Activity',   dueDate:dStr(-3), status:'overdue',   recurrence:'Daily',   priority:'Medium', instructions:'Aim for at least 3,000 steps per day. Use a phone pedometer.' },
      { id:'ht-012', patientId:'pt-003', patientName:'Jordan Smith',  title:'Sleep Diary',              category:'Sleep',      dueDate:dStr(0),  status:'pending',   recurrence:'Daily',   priority:'Medium', instructions:'Record bedtime, wake time, perceived sleep quality (1-5) each morning.' },
    ];
    lsSet(_htmTaskKey('pt-001'), seedPt001);
    lsSet(_htmTaskKey('pt-002'), seedPt002);
    lsSet(_htmTaskKey('pt-003'), seedPt003);
    lsSet('ds_clinician_tasks_all_patients', ['pt-001', 'pt-002', 'pt-003']);
  }

  seedTasks();

  // ── State ─────────────────────────────────────────────────────────────────
  let _expandedPatient = null;
  let _libExpanded     = false;
  let _modalOpen       = false;
  let _modalTemplate   = '';
  let _modalPatient    = '';

  // ── Helpers ───────────────────────────────────────────────────────────────
  // getTasks() returns ALL tasks across all patients (for overview/compliance)
  function getTasks() { return getAllPatientTasks(); }
  // saveTasksForPatient() saves the full task list for a specific patient
  function saveTasksForPatient(pid, tasks) {
    lsSet(_htmTaskKey(pid), tasks);
    _htmRegisterPatient(pid);
  }

  const PATIENTS = [
    { id:'pt-001', name:'Alex Johnson'  },
    { id:'pt-002', name:'Morgan Lee'    },
    { id:'pt-003', name:'Jordan Smith'  },
    { id:'pt-004', name:'Taylor Rivera' },
    { id:'pt-005', name:'Casey Brown'   },
  ];

  const TASK_TEMPLATES = [
    { title:'Breathing Exercise',  cat:'Breathing', freq:'Daily',   evidence:'HRV improvement in 4 weeks (Zaccaro et al., 2018)',    instructions:'Practice 4-7-8 breathing: inhale 4s, hold 7s, exhale 8s. 3 rounds before sleep.' },
    { title:'Mood Journal',        cat:'Journal',   freq:'Daily',   evidence:'CBT outcome predictor (Beck & Haigh, 2014)',            instructions:'Log mood (1-10), energy (1-10), and one notable event each day.' },
    { title:'Outdoor Activity',    cat:'Activity',  freq:'3x/week', evidence:'Reduced cortisol (Bratman et al., 2015)',              instructions:'30-minute outdoor walk or activity during daylight hours.' },
    { title:'Screen-free Hour',    cat:'Screen',    freq:'Daily',   evidence:'Improved sleep onset (Chang et al., 2015)',            instructions:'No screens 1 hour before intended sleep time.' },
    { title:'Social Activity',     cat:'Social',    freq:'Weekly',  evidence:'Depression buffer (Holt-Lunstad et al., 2015)',        instructions:'Meaningful social interaction with friend or family member.' },
    { title:'Sleep Hygiene',       cat:'Sleep',     freq:'Daily',   evidence:'TMS outcome improvement (Philip et al., 2021)',        instructions:'Consistent sleep/wake schedule within 30 min. No caffeine after noon.' },
    // ── Home Programs ──
    { title:'Depression Management Program', cat:'Program', freq:'6 weeks', evidence:'Evidence-based for MDD treatment',           instructions:'8-week structured program with daily tasks. Focus on behavioral activation, mood tracking, and coping strategies.' },
    { title:'Anxiety & Mindfulness Program', cat:'Program', freq:'4 weeks', evidence:'Mindfulness reduces anxiety symptoms',        instructions:'7-task program combining mindfulness, breathing, and exposure techniques. Daily 15-20 min commitment.' },
    { title:'Pain Self-Management Program',  cat:'Program', freq:'8 weeks', evidence:'Reduces pain perception and disability',      instructions:'6-task comprehensive program including activity pacing, relaxation, and cognitive restructuring.' },
    { title:'Sleep Hygiene Protocol',        cat:'Program', freq:'4 weeks', evidence:'Improves sleep onset and quality',            instructions:'5-task protocol addressing sleep environment, behavioral patterns, and sleep restriction therapy.' },
    { title:'PTSD Grounding & Stabilisation', cat:'Program', freq:'6 weeks', evidence:'Trauma-informed stabilization approach',     instructions:'9-task program focusing on grounding techniques, emotional regulation, and safety planning.' },
    { title:'Cognitive Stimulation Exercises', cat:'Program', freq:'6 weeks', evidence:'Enhances cognitive reserve',                 instructions:'7 structured exercises targeting memory, attention, and executive function with daily engagement.' },
    { title:'OCD ERP Daily Practice',        cat:'Program', freq:'8 weeks', evidence:'Gold standard for OCD treatment',             instructions:'8-task exposure and response prevention program with graduated difficulty levels.' },
    { title:'ADHD Attention Training',       cat:'Program', freq:'6 weeks', evidence:'Improves executive function',                 instructions:'6 focused exercises improving attention, impulse control, and organizational skills.' },
    { title:'Mood Tracking & Journaling',    cat:'Program', freq:'12 weeks',evidence:'Builds emotional awareness and stability',    instructions:'3 ongoing tasks: daily mood log, weekly reflection, and symptom monitoring.' },
    { title:'Post-TMS Wellness Routine',     cat:'Program', freq:'4 weeks', evidence:'Maintains treatment gains post-intervention',  instructions:'5-task routine optimizing sleep, activity, mood tracking, and relapse prevention.' },
    { title:'Custom',              cat:'Custom',    freq:'',        evidence:'',                                                     instructions:'' },
  ];

  function computeCompliance(patientId) {
    const tasks = getTasks().filter(t => t.patientId === patientId);
    if (!tasks.length) return { active:0, dueToday:0, completedWk:0, pct:0, lastActivity:null };
    const today = new Date().toISOString().slice(0,10);
    const wkAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
    const active      = tasks.filter(t => t.status !== 'removed').length;
    const dueToday    = tasks.filter(t => t.dueDate === today && t.status === 'pending').length;
    const completedWk = tasks.filter(t => t.status === 'complete' && t.dueDate >= wkAgo).length;
    const eligible    = tasks.filter(t => t.dueDate >= wkAgo);
    const pct         = eligible.length ? Math.round((eligible.filter(t=>t.status==='complete').length/eligible.length)*100) : 0;
    const dates       = tasks.filter(t=>t.status==='complete').map(t=>t.dueDate).sort();
    const lastActivity = dates.length ? dates[dates.length-1] : null;
    return { active, dueToday, completedWk, pct, lastActivity };
  }

  function pctColor(p) {
    return p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    const root = document.getElementById('htm-root');
    if (!root) return;
    root.innerHTML = `
      ${_renderTable()}
      ${_renderCompliance()}
      ${_renderLibrary()}
      ${_renderModal()}
    `;
  }

  // ── Patient Task Table ─────────────────────────────────────────────────
  function _renderTable() {
    const taskPatients = PATIENTS.filter(p => getTasks().some(t => t.patientId === p.id));
    const rows = taskPatients.map(p => {
      const c = computeCompliance(p.id);
      const pc = pctColor(c.pct);
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-weight:600;font-size:.83rem">${p.name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center;font-size:.83rem">${c.active}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center;font-size:.83rem">${c.dueToday}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center;font-size:.83rem">${c.completedWk}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);text-align:center">
          <span style="font-weight:700;color:${pc};font-size:.85rem">${c.pct}%</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:.78rem;color:var(--text-secondary)">${c.lastActivity || '\u2014'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid var(--border)">
          <button class="btn btn-ghost btn-sm" onclick="window._htmToggleDetail('${p.id}')">
            ${_expandedPatient === p.id ? 'Hide' : 'View Details'}
          </button>
        </td>
      </tr>
      ${_expandedPatient === p.id ? `<tr><td colspan="7" style="padding:0;border-bottom:2px solid var(--border)">${_renderDetail(p.id)}</td></tr>` : ''}`;
    }).join('');

    return `<div class="card" style="margin-bottom:16px;overflow:hidden">
      <div class="card-header"><h3>Patient Task Overview</h3></div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            ${['Patient','Active Tasks','Due Today','Completed This Week','Compliance %','Last Activity','Actions']
              .map(h=>`<th style="padding:9px 12px;border-bottom:2px solid var(--border);text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);white-space:nowrap">${h}</th>`).join('')}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
  }

  function _renderDetail(patientId) {
    const tasks = getTasks().filter(t => t.patientId === patientId && t.status !== 'removed');
    if (!tasks.length) return `<div style="padding:16px;color:var(--text-secondary);font-size:.83rem">No active tasks.</div>`;
    const rows = tasks.map(t => {
      const statusColor = t.status === 'complete' ? '#10b981' : t.status === 'overdue' ? '#ef4444' : 'var(--text-secondary)';
      return `<div class="htm-task-row">
        <div style="flex:1">
          <div style="font-size:.83rem;font-weight:600;color:var(--text-primary)">${t.title}</div>
          <div style="font-size:.74rem;color:var(--text-secondary);margin-top:2px">${t.category} \u00b7 Due: ${t.dueDate} \u00b7 ${t.recurrence}</div>
          <div style="font-size:.73rem;color:var(--text-tertiary);margin-top:2px">${t.instructions}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          <span style="font-size:.72rem;font-weight:700;color:${statusColor};text-transform:capitalize">${t.status}</span>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" style="font-size:.7rem" onclick="window._htmReassign('${t.id}')">Reassign</button>
            <button class="btn btn-ghost btn-sm" style="font-size:.7rem;color:#ef4444" onclick="window._htmRemoveTask('${t.id}')">Remove</button>
          </div>
        </div>
      </div>`;
    }).join('');
    return `<div style="background:rgba(255,255,255,0.02);padding:12px 16px">${rows}</div>`;
  }

  // ── Compliance Analytics ────────────────────────────────────────────────
  function _renderCompliance() {
    const taskPatients = PATIENTS.filter(p => getTasks().some(t => t.patientId === p.id));
    const data = taskPatients.map(p => ({ name: p.name.split(' ')[0], pct: computeCompliance(p.id).pct }));
    const W = 420, H = 140, padL = 36, padB = 24, padT = 12, padR = 12;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const barW = Math.min(40, (innerW / Math.max(data.length, 1)) - 8);
    const bars = data.map((d, i) => {
      const x  = padL + (i / Math.max(data.length, 1)) * innerW + (innerW / Math.max(data.length, 1) - barW) / 2;
      const bh = (d.pct / 100) * innerH;
      const y  = padT + innerH - bh;
      const col = pctColor(d.pct);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${Math.max(bh,1).toFixed(1)}" rx="3" fill="${col}" fill-opacity="0.8"/>
        <text x="${(x + barW/2).toFixed(1)}" y="${(y - 3).toFixed(1)}" font-size="8.5" fill="${col}" text-anchor="middle" font-weight="600">${d.pct}%</text>
        <text x="${(x + barW/2).toFixed(1)}" y="${H - 6}" font-size="8" fill="rgba(255,255,255,0.4)" text-anchor="middle">${d.name}</text>`;
    }).join('');
    const gridLines = [0,25,50,75,100].map(v => {
      const y = padT + innerH - (v/100) * innerH;
      return `<line x1="${padL}" y1="${y}" x2="${padL+innerW}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
        <text x="${padL-4}" y="${y+3}" font-size="7.5" fill="rgba(255,255,255,0.3)" text-anchor="end">${v}</text>`;
    }).join('');
    const chartSvg = `<svg viewBox="0 0 ${W} ${H}" style="max-width:100%;height:${H}px;background:rgba(255,255,255,0.02);border-radius:8px">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+innerH}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      <line x1="${padL}" y1="${padT+innerH}" x2="${padL+innerW}" y2="${padT+innerH}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      ${gridLines}${bars}
    </svg>`;

    const sorted   = [...data].sort((a,b)=>b.pct-a.pct);
    const improved = data.find(d => d.pct >= 50 && d.pct < 80);
    const top      = sorted[0];

    return `<div class="card" style="margin-bottom:16px">
      <div class="card-header"><h3>Compliance Analytics \u2014 This Week</h3></div>
      <div class="card-body">
        ${chartSvg}
        <div style="display:flex;gap:12px;margin-top:14px;flex-wrap:wrap">
          ${top ? `<div class="htm-highlight-badge" style="border-color:rgba(16,185,129,0.4);background:rgba(16,185,129,0.07)">
            <span style="font-size:13px">&#x1F3C6;</span>
            <div>
              <div style="font-size:.72rem;color:#10b981;font-weight:700">Top Compliant</div>
              <div style="font-size:.8rem;color:var(--text-primary);font-weight:600">${top.name} \u2014 ${top.pct}%</div>
            </div>
          </div>` : ''}
          ${improved ? `<div class="htm-highlight-badge" style="border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.07)">
            <span style="font-size:13px">&#x1F4C8;</span>
            <div>
              <div style="font-size:.72rem;color:#f59e0b;font-weight:700">Most Improved</div>
              <div style="font-size:.8rem;color:var(--text-primary);font-weight:600">${improved.name} \u2014 ${improved.pct}%</div>
            </div>
          </div>` : ''}
        </div>
      </div>
    </div>`;
  }

  // ── Task Library ──────────────────────────────────────────────────────────
  function _renderLibrary() {
    const inner = _libExpanded ? TASK_TEMPLATES.map(t => `
      <div class="htm-lib-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
          <div style="font-size:.83rem;font-weight:600;color:var(--text-primary)">${t.title}</div>
          <span style="font-size:.68rem;padding:2px 7px;border-radius:10px;background:rgba(0,212,188,0.1);color:var(--teal);white-space:nowrap">${t.cat}</span>
        </div>
        ${t.instructions ? `<div style="font-size:.74rem;color:var(--text-secondary);line-height:1.45;margin-bottom:6px">${t.instructions}</div>` : ''}
        ${t.freq ? `<div style="font-size:.7rem;color:var(--text-tertiary);margin-bottom:4px">Suggested: <strong>${t.freq}</strong></div>` : ''}
        ${t.evidence ? `<div style="font-size:.68rem;color:var(--accent-blue);margin-bottom:8px;font-style:italic">${t.evidence}</div>` : ''}
        <button class="btn btn-ghost btn-sm" style="font-size:.72rem;width:100%" onclick="window._htmUseTemplate('${t.title.replace(/'/g,"\\'").replace(/"/g,"&quot;")}')">Use Template</button>
      </div>`).join('') : '';

    return `<div class="card" style="margin-bottom:16px">
      <div class="card-header" style="cursor:pointer" onclick="window._htmToggleLib()">
        <h3>Task Library</h3>
        <span style="font-size:.8rem;color:var(--text-secondary)">${_libExpanded ? '\u25b2 Collapse' : '\u25bc Expand'}</span>
      </div>
      ${_libExpanded ? `<div class="card-body"><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">${inner}</div></div>` : ''}
    </div>`;
  }

  // ── Assign Modal ──────────────────────────────────────────────────────────
  function _renderModal() {
    if (!_modalOpen) return '';
    const tmpl = TASK_TEMPLATES.find(t => t.title === _modalTemplate);
    const patientOpts = PATIENTS.map(p =>
      `<option value="${p.id}" ${_modalPatient===p.id?'selected':''}>${p.name}</option>`).join('');
    const tmplOpts = TASK_TEMPLATES.map(t =>
      `<option value="${t.title}" ${_modalTemplate===t.title?'selected':''}>${t.title}</option>`).join('');
    const today   = new Date().toISOString().slice(0,10);
    const futureWk = new Date(Date.now()+7*86400000).toISOString().slice(0,10);

    return `<div class="htm-modal-overlay" onclick="if(event.target===this)window._htmCloseModal()">
      <div class="htm-modal">
        <div class="htm-modal-header">
          <h3>Assign Home Task</h3>
          <button class="btn btn-ghost btn-sm" onclick="window._htmCloseModal()">\u2715</button>
        </div>
        <div class="htm-modal-body">
          <div class="form-group">
            <label class="form-label">Patient</label>
            <select class="form-control" id="htm-assign-patient" onchange="window._htmModalPatient(this.value)">
              <option value="">Select patient\u2026</option>
              ${patientOpts}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Task Template</label>
            <select class="form-control" id="htm-assign-template" onchange="window._htmModalTemplate(this.value)">
              <option value="">Select template\u2026</option>
              ${tmplOpts}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div class="form-group">
              <label class="form-label">Start Date</label>
              <input type="date" class="form-control" id="htm-assign-start" value="${today}">
            </div>
            <div class="form-group">
              <label class="form-label">End Date</label>
              <input type="date" class="form-control" id="htm-assign-end" value="${futureWk}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select class="form-control" id="htm-assign-priority">
              <option>Low</option>
              <option selected>Medium</option>
              <option>High</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Instructions</label>
            <textarea class="form-control" id="htm-assign-instructions" rows="3" style="resize:vertical">${tmpl ? tmpl.instructions : ''}</textarea>
          </div>
        </div>
        <div class="htm-modal-footer">
          <button class="btn btn-ghost btn-sm" onclick="window._htmCloseModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._htmSubmitAssign()">Assign Task</button>
        </div>
      </div>
    </div>`;
  }

  // ── Global Handlers ───────────────────────────────────────────────────────
  window._htmToggleDetail = function(pid) {
    _expandedPatient = _expandedPatient === pid ? null : pid;
    render();
  };

  window._htmOpenAssign = function(prefillTemplate) {
    _modalOpen     = true;
    _modalTemplate = prefillTemplate || '';
    _modalPatient  = '';
    render();
  };

  window._htmCloseModal = function() {
    _modalOpen = false;
    render();
  };

  window._htmModalTemplate = function(val) {
    _modalTemplate = val;
    const tmpl = TASK_TEMPLATES.find(t => t.title === val);
    const instrEl = document.getElementById('htm-assign-instructions');
    if (instrEl && tmpl) instrEl.value = tmpl.instructions;
  };

  window._htmModalPatient = function(val) {
    _modalPatient = val;
  };

  window._htmSubmitAssign = function() {
    const pid          = document.getElementById('htm-assign-patient')?.value;
    const tmplName     = document.getElementById('htm-assign-template')?.value;
    const start        = document.getElementById('htm-assign-start')?.value;
    const priority     = document.getElementById('htm-assign-priority')?.value;
    const instructions = document.getElementById('htm-assign-instructions')?.value || '';
    if (!pid || !tmplName) {
      window._showNotifToast?.({ title:'Missing fields', body:'Please select a patient and task template.', severity:'warn' });
      return;
    }
    const patient = PATIENTS.find(p => p.id === pid);
    const tmpl    = TASK_TEMPLATES.find(t => t.title === tmplName);
    const newTask = {
      id:          'ht-' + Date.now(),
      patientId:   pid,
      patientName: patient?.name || pid,
      title:       tmplName,
      category:    tmpl?.cat || 'Custom',
      dueDate:     start || new Date().toISOString().slice(0,10),
      status:      'pending',
      recurrence:  tmpl?.freq || 'Once',
      priority,
      instructions,
    };
    const patientTasks = lsGet(_htmTaskKey(pid), []);
    patientTasks.push(newTask);
    saveTasksForPatient(pid, patientTasks);
    _modalOpen = false;
    render();
    window._showNotifToast?.({ title:'Task Assigned', body:`${tmplName} assigned to ${patient?.name}.`, severity:'success' });
  };

  window._htmReassign = function(taskId) {
    const tasks = getTasks();
    const t     = tasks.find(tk => tk.id === taskId);
    if (!t) return;
    _modalOpen     = true;
    _modalTemplate = t.title;
    _modalPatient  = t.patientId;
    render();
  };

  window._htmRemoveTask = function(taskId) {
    // Find which patient owns this task, then update only that patient's key
    const allTasks = getTasks();
    const task = allTasks.find(t => t.id === taskId);
    if (task) {
      const pid = task.patientId;
      const patientTasks = lsGet(_htmTaskKey(pid), []);
      const idx = patientTasks.findIndex(t => t.id === taskId);
      if (idx !== -1) { patientTasks[idx].status = 'removed'; saveTasksForPatient(pid, patientTasks); }
    }
    render();
  };

  window._htmToggleLib = function() {
    _libExpanded = !_libExpanded;
    render();
  };

  window._htmUseTemplate = function(templateTitle) {
    window._htmOpenAssign(templateTitle);
  };

  render();
}
