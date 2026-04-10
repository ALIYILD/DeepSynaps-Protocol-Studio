// Patient portal pages — simpler, calmer UI than the professional app
// All pages render into #patient-content
import { api } from './api.js';
import { currentUser } from './auth.js';

// ── Nav definition ────────────────────────────────────────────────────────────
const PATIENT_NAV = [
  { id: 'patient-portal',       label: 'My Dashboard',      icon: '◈' },
  { id: 'patient-sessions',     label: 'Sessions',           icon: '◧' },
  { id: 'patient-course',       label: 'My Treatment',       icon: '◎' },
  { id: 'patient-assessments',  label: 'Assessments',        icon: '◉' },
  { id: 'patient-reports',      label: 'Reports',            icon: '◱' },
  { id: 'patient-messages',     label: 'Messages',           icon: '◫' },
  { id: 'patient-wearables',    label: 'Wearables',          icon: '◌' },
  { id: 'pt-wellness',          label: 'Wellness Check-in',  icon: '💚' },
  { id: 'pt-learn',             label: 'Learn & Resources',  icon: '📚' },
  { id: 'patient-profile',      label: 'Profile & Settings', icon: '◇' },
];

// Bottom nav: 5 key items for mobile
const PATIENT_BOTTOM_NAV = [
  { id: 'patient-portal',    label: 'Portal',    icon: '◈' },
  { id: 'patient-sessions',  label: 'Sessions',  icon: '◧' },
  { id: 'pt-wellness',       label: 'Wellness',  icon: '💚' },
  { id: 'pt-learn',          label: 'Learn',     icon: '📚' },
  { id: 'patient-profile',   label: 'Profile',   icon: '◇' },
];

export function renderPatientNav(currentPage) {
  document.getElementById('patient-nav-list').innerHTML = PATIENT_NAV.map(n => {
    const badge = n.badge ? `<span class="nav-badge">${n.badge}</span>` : '';
    return `<div class="nav-item ${currentPage === n.id ? 'active' : ''}" onclick="window._navPatient('${n.id}')">
      <span class="nav-icon">${n.icon}</span>
      <span style="flex:1">${n.label}</span>${badge}
    </div>`;
  }).join('');

  const bottomNav = document.getElementById('pt-bottom-nav');
  if (bottomNav) {
    bottomNav.innerHTML = PATIENT_BOTTOM_NAV.map(n => {
      const active = currentPage === n.id;
      return `<button style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:none;border:none;cursor:pointer;color:${active ? 'var(--teal)' : 'var(--text-tertiary)'};font-size:9px;padding:4px" onclick="window._navPatient('${n.id}')">
        <span style="font-size:18px">${n.icon}</span>
        <span>${n.label}</span>
      </button>`;
    }).join('');
  }
}

function setTopbar(title, html = '') {
  document.getElementById('patient-page-title').textContent = title;
  document.getElementById('patient-topbar-actions').innerHTML = html;
}

function spinner() {
  return '<div style="text-align:center;padding:48px;color:var(--teal);font-size:24px">◈</div>';
}

// ── Sparkline helper ──────────────────────────────────────────────────────────
function sparklineSVG(data, color, width = 120, height = 32) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  // Area fill path
  const first = pts[0].split(',');
  const last  = pts[pts.length - 1].split(',');
  const area  = `M${first[0]},${height} L${pts.join(' L')} L${last[0]},${height} Z`;
  const id    = `sg-${Math.random().toString(36).slice(2)}`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="pt-sparkline">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${id})"/>
    <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="pt-sparkline-line"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.5" fill="${color}"/>
  </svg>`;
}

// ── Session countdown ring ────────────────────────────────────────────────────
function countdownRingSVG(daysLeft, hoursLeft, nextLabel) {
  const total    = 7;
  const fraction = Math.max(0, Math.min(1, daysLeft / total));
  const r        = 38;
  const circ     = 2 * Math.PI * r;
  const dash     = fraction * circ;
  const gap      = circ - dash;
  return `
    <div class="pt-countdown-ring-wrap">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="6"/>
        <circle cx="50" cy="50" r="${r}" fill="none"
          stroke="var(--teal)" stroke-width="6"
          stroke-dasharray="${dash} ${gap}"
          stroke-dashoffset="${circ / 4}"
          stroke-linecap="round"
          style="transition:stroke-dasharray 1s ease;filter:drop-shadow(0 0 4px var(--teal-glow))"/>
      </svg>
      <div class="pt-countdown-inner">
        <div class="pt-countdown-days">${daysLeft}</div>
        <div class="pt-countdown-label">days</div>
      </div>
    </div>
    <div style="margin-top:8px;text-align:center">
      <div style="font-size:12px;font-weight:600;color:var(--text-primary)">Next Session</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${nextLabel || '—'}</div>
      ${hoursLeft < 24 ? `<div style="font-size:11px;color:var(--teal);margin-top:3px">${hoursLeft}h remaining</div>` : ''}
    </div>`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_e) { return String(d); }
}

function fmtRelative(d) {
  if (!d) return '';
  try {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch (_e) { return ''; }
}

function daysUntil(d) {
  if (!d) return null;
  try {
    const ms = new Date(d).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  } catch (_e) { return null; }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function pgPatientDashboard(user) {
  setTopbar('My Dashboard');
  const firstName = (user?.display_name || 'there').split(' ')[0];
  const uid = user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Fetch live data via patient portal endpoints (no clinician role required)
  const [portalSessions, portalCourses] = await Promise.all([
    api.patientPortalSessions().catch(() => null),
    api.patientPortalCourses().catch(() => null),
  ]);

  const sessions = Array.isArray(portalSessions) ? portalSessions : [];
  const messages = [];  // Messages via Telegram — no portal endpoint yet

  // Resolve active course
  let activeCourse = null;
  const coursesArr = Array.isArray(portalCourses) ? portalCourses : [];
  activeCourse = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  // Metrics — portal sessions are all delivered (no status/scheduled_at)
  const sessionsDone  = sessions.length;
  const totalPlanned  = activeCourse?.total_sessions_planned ?? null;
  const sessDelivered = activeCourse?.session_count ?? sessionsDone;
  const progressPct   = (totalPlanned && sessDelivered) ? Math.round((sessDelivered / totalPlanned) * 100) : null;

  // No upcoming session data from portal endpoint
  const upcomingSessions = [];
  // Try to find next session from sessions array (look for scheduled_at in the future)
  const now = Date.now();
  const upcomingFromSessions = sessions.filter(s => s.scheduled_at && new Date(s.scheduled_at).getTime() > now);
  upcomingFromSessions.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const nextSess  = upcomingFromSessions[0] || null;
  const nextDays  = nextSess ? daysUntil(nextSess.scheduled_at) : null;
  const nextHrs   = 0;
  const nextLabel = nextSess
    ? new Date(nextSess.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  // Wellness check-in state
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastCheckin = localStorage.getItem('ds_last_checkin');
  const checkedInToday = lastCheckin === todayStr;

  // Unread messages
  const unreadCount = messages.filter(m => m.is_read === false || m.read === false || m.unread === true).length;

  // Recent messages (first 3)
  const recentMsgs = messages.slice(0, 3);

  // Wellbeing sparkline data (dummy series — real series not available in API)
  const sparkData = {
    depression:  [28, 35, 42, 50, 55, 61, 65, 68],
    anxiety:     [20, 27, 33, 40, 44, 50, 52, 55],
    sleep:       [40, 45, 52, 58, 62, 67, 70, 72],
    wellbeing:   [30, 37, 44, 50, 54, 59, 62, 65],
  };

  // Milestones data
  const milestonesData = getPatientMilestones(sessions, []);

  el.innerHTML = `
    <div style="margin-bottom:24px">
      <div style="font-family:var(--font-display);font-size:19px;font-weight:600;color:var(--text-primary);margin-bottom:4px">
        Welcome back, ${firstName} 👋
      </div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Here's your treatment journey at a glance.</div>
    </div>

    <!-- Countdown timer card -->
    ${nextSess
      ? `<div class="ds-card" style="margin-bottom:16px;padding:16px;border-radius:var(--radius-lg);border:1px solid var(--teal,#00d4bc);background:linear-gradient(135deg,rgba(0,212,188,0.1),rgba(99,102,241,0.1))">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
            <div>
              <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--teal);margin-bottom:4px">Next Session</div>
              <div style="font-size:1.1rem;font-weight:600" id="next-session-name">${nextSess.modality_slug?.toUpperCase() || nextSess.condition_slug || 'Treatment Session'}</div>
              <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:2px" id="next-session-date">${nextLabel}</div>
            </div>
            <div id="session-countdown" style="text-align:center">
              <div style="font-family:'DM Mono',monospace;font-size:2rem;font-weight:700;color:var(--teal)" id="countdown-display">--:--:--</div>
              <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:4px">until your session</div>
            </div>
          </div>
        </div>`
      : `<div class="card" style="margin-bottom:16px">
          <div class="card-body" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px">
            <div style="font-size:13px;color:var(--text-secondary)">No upcoming sessions scheduled.</div>
            <a href="#" onclick="window._navPatient('patient-messages');return false;" style="font-size:12px;color:var(--teal);text-decoration:none;font-weight:500">Message your clinician →</a>
          </div>
        </div>`}

    <!-- Wellness quick card -->
    ${checkedInToday
      ? `<div class="card" style="margin-bottom:16px;background:rgba(0,212,188,0.05);border-color:var(--teal)">
          <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 16px">
            <span style="font-size:20px">✅</span>
            <div style="flex:1;font-size:13px;color:var(--text-primary);font-weight:500">Wellness check-in complete for today</div>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('pt-wellness')">View →</button>
          </div>
        </div>`
      : `<div class="card" style="margin-bottom:16px">
          <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 16px">
            <span style="font-size:20px">💚</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500;color:var(--text-primary)">How are you feeling today?</div>
              <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px">Track mood, sleep &amp; energy for your care team</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="window._navPatient('pt-wellness')">Check in now →</button>
          </div>
        </div>`}

    <!-- Milestones badges -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h3>Your Progress</h3></div>
      <div class="card-body" style="padding:14px 16px">
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">
          ${milestonesData.map(m => `
            <div style="flex-shrink:0;width:90px;text-align:center;opacity:${m.earned ? '1' : '0.4'}">
              <div style="width:52px;height:52px;border-radius:50%;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:22px;border:2px solid ${m.earned ? 'var(--teal)' : 'var(--border)'};background:${m.earned ? 'rgba(0,212,188,0.1)' : 'rgba(255,255,255,0.03)'}">${m.icon}</div>
              <div style="font-size:10.5px;font-weight:${m.earned ? '600' : '400'};color:${m.earned ? 'var(--text-primary)' : 'var(--text-tertiary)'};line-height:1.3">${m.title}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="g3" style="margin-bottom:24px">
      <div class="metric-card" style="border-color:var(--border-blue)">
        <div class="metric-label">Sessions Completed</div>
        <div class="metric-value" style="color:var(--teal)">${sessionsDone > 0 ? sessionsDone : '—'}</div>
        <div class="metric-delta">${totalPlanned ? `of ${totalPlanned} planned` : 'No active course'}</div>
      </div>
      <div class="metric-card" style="border-color:var(--border-teal)">
        <div class="metric-label">Active Course</div>
        <div class="metric-value">${progressPct !== null ? progressPct + '%' : '—'}</div>
        <div class="metric-delta">${activeCourse ? (activeCourse.status === 'active' ? 'Active' : activeCourse.status || 'Assigned') : 'No active course'}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Unread Messages</div>
        <div class="metric-value" style="font-size:24px;color:${unreadCount > 0 ? 'var(--blue)' : 'var(--text-tertiary)'}">${unreadCount || '0'}</div>
        <div class="metric-delta">${unreadCount > 0 ? 'New messages from clinic' : 'All caught up'}</div>
      </div>
    </div>

    <div class="g2">
      <div>
        <div class="card">
          <div class="card-header"><h3>Recent Sessions</h3></div>
          <div class="card-body" style="padding:0">
            ${sessions.length === 0
              ? `<div style="text-align:center;padding:28px;color:var(--text-tertiary)">
                  <div style="font-size:18px;margin-bottom:8px;opacity:.4">◧</div>
                  No sessions recorded yet
                </div>`
              : sessions.slice(0, 3).map((s, i) => {
                  const date = fmtDate(s.delivered_at);
                  const tol  = s.tolerance_rating ? ` · ${s.tolerance_rating}` : '';
                  return `
                    <div class="pt-session-card" style="border-radius:0;border:none;border-bottom:1px solid var(--border);margin:0">
                      <div class="pt-session-icon done">✓</div>
                      <div style="flex:1">
                        <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">Session ${i + 1}</div>
                        <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${date}${tol}</div>
                      </div>
                      <span class="pill pill-active" style="font-size:10px">Done</span>
                    </div>`;
                }).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Messages</h3></div>
          <div class="card-body" style="padding:18px">
            <div class="notice notice-info" style="font-size:12px;margin-bottom:12px">
              ◫ &nbsp;Clinical messaging is delivered via Telegram for instant reach.
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Open Messages →</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Quick Actions</h3></div>
          <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="window._navPatient('patient-course')">View Course →</button>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Messages →</button>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-assessments')">Assessments →</button>
          </div>
        </div>
      </div>

      <div>
        <div class="card" style="margin-bottom:20px">
          <div class="card-header"><h3>Course Progress</h3></div>
          <div class="card-body">
            ${activeCourse
              ? `<div style="margin-bottom:12px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                    <span style="font-size:12px;color:var(--text-secondary)">${activeCourse.condition_slug || 'Treatment'}</span>
                    <span style="font-size:12px;font-weight:600;color:var(--teal)">${progressPct ?? 0}%</span>
                  </div>
                  <div class="progress-bar" style="height:8px">
                    <div class="progress-fill" style="width:${progressPct ?? 0}%"></div>
                  </div>
                  <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">${sessDelivered} of ${totalPlanned ?? '?'} sessions</div>
                </div>`
              : `<div style="text-align:center;padding:16px;color:var(--text-tertiary);font-size:12px">No active course</div>`}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Treatment Progress</h3></div>
          <div class="card-body">
            <div style="margin-bottom:18px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:12px;color:var(--text-secondary)">Course Completion</span>
                <span style="font-size:12px;font-weight:600;color:var(--teal)">${progressPct !== null ? progressPct + '%' : '—'}</span>
              </div>
              <div class="progress-bar" style="height:7px">
                <div class="progress-fill" style="width:${progressPct || 0}%"></div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">
                ${sessDelivered} of ${totalPlanned || '?'} sessions complete
              </div>
            </div>
            <div class="glow-line"></div>
            <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">Weekly Wellbeing Tracking</div>
            ${[
              { label: 'Depression (PHQ-9)',  data: sparkData.depression, color: 'var(--teal)',   val: 68 },
              { label: 'Anxiety (GAD-7)',     data: sparkData.anxiety,    color: 'var(--blue)',   val: 55 },
              { label: 'Sleep Quality',       data: sparkData.sleep,      color: 'var(--green)',  val: 72 },
              { label: 'Overall Wellbeing',   data: sparkData.wellbeing,  color: 'var(--violet)', val: 65 },
            ].map(r => `
              <div class="pt-sparkline-row">
                <span class="ev-label" style="min-width:140px">${r.label}</span>
                ${sparklineSVG(r.data, r.color)}
                <span style="font-size:11px;color:var(--text-secondary);width:34px;text-align:right;flex-shrink:0">${r.val}%</span>
              </div>
            `).join('')}
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px">Higher = more improvement vs. baseline</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Actions Needed</h3></div>
          <div class="card-body" style="padding:0 18px">
            <div class="pt-action-row" onclick="window._navPatient('patient-assessments')" style="cursor:pointer">
              <div style="width:32px;height:32px;border-radius:var(--radius-md);background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;color:var(--amber);flex-shrink:0">◉</div>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:500;color:var(--text-primary)">Complete Latest Assessment</div>
                <div style="font-size:11px;color:var(--text-tertiary)">Track your progress</div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary)">→</div>
            </div>
            <div class="pt-action-row" onclick="window._navPatient('patient-reports')" style="cursor:pointer">
              <div style="width:32px;height:32px;border-radius:var(--radius-md);background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;color:var(--blue);flex-shrink:0">◱</div>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:500;color:var(--text-primary)">View Reports</div>
                <div style="font-size:11px;color:var(--text-tertiary)">Session summaries &amp; outcomes</div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary)">→</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Animate sparklines in after paint
  requestAnimationFrame(() => {
    document.querySelectorAll('.pt-sparkline-line').forEach(lineEl => {
      lineEl.classList.add('pt-sparkline-animate');
    });
    // Start countdown if we have a next session
    if (nextSess?.scheduled_at) {
      startCountdown(nextSess.scheduled_at);
    }
  });
}

// ── Countdown timer ───────────────────────────────────────────────────────────
function startCountdown(targetDateStr) {
  const target = new Date(targetDateStr).getTime();
  function tick() {
    const now  = Date.now();
    const diff = target - now;
    if (diff <= 0) {
      const el = document.getElementById('countdown-display');
      if (el) el.textContent = 'Session time!';
      return;
    }
    const d       = Math.floor(diff / 86400000);
    const h       = Math.floor((diff % 86400000) / 3600000);
    const m       = Math.floor((diff % 3600000) / 60000);
    const s       = Math.floor((diff % 60000) / 1000);
    const display = d > 0
      ? `${d}d ${h}h ${m}m`
      : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const el = document.getElementById('countdown-display');
    if (el) el.textContent = display;
    else return; // stop if element gone
    window._countdownTimer = setTimeout(tick, 1000);
  }
  clearTimeout(window._countdownTimer);
  tick();
}

// ── Milestones ────────────────────────────────────────────────────────────────
function getPatientMilestones(sessions, outcomes) {
  const completedSessions = sessions.filter(s => {
    const st = (s.status || '').toLowerCase();
    return st === 'completed' || st === 'done' || s.delivered_at;
  });
  const count = completedSessions.length;
  // Compute "one week in"
  let weekOneEarned = false;
  if (completedSessions.length > 0) {
    const firstDate = completedSessions
      .map(s => new Date(s.delivered_at || s.scheduled_at || 0))
      .sort((a, b) => a - b)[0];
    weekOneEarned = firstDate && (Date.now() - firstDate.getTime()) >= 7 * 86400000;
  }
  // Compute "consistent" — 3 sessions in one week
  let consistentEarned = false;
  if (count >= 3) {
    const dates = completedSessions.map(s => new Date(s.delivered_at || s.scheduled_at || 0).getTime()).sort((a, b) => a - b);
    for (let i = 0; i <= dates.length - 3; i++) {
      if (dates[i + 2] - dates[i] <= 7 * 86400000) { consistentEarned = true; break; }
    }
  }
  // Wellness streak
  let wellnessStreak = false;
  try {
    const streakVal = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10);
    wellnessStreak = streakVal >= 7;
  } catch (_e) { /* ignore */ }

  return [
    { id: 'first_session',  icon: '🌱', title: 'First Session',    desc: 'Completed your first session',              earned: count >= 1 },
    { id: 'week_one',       icon: '📅', title: 'One Week In',      desc: '7 days since starting treatment',            earned: weekOneEarned },
    { id: 'five_sessions',  icon: '⭐', title: 'Five Sessions',    desc: 'Completed 5 sessions',                       earned: count >= 5 },
    { id: 'ten_sessions',   icon: '🏆', title: 'Ten Sessions',     desc: 'Completed 10 sessions',                      earned: count >= 10 },
    { id: 'first_outcome',  icon: '📊', title: 'Progress Tracked', desc: 'First outcome assessment recorded',          earned: outcomes.length >= 1 },
    { id: 'consistent',     icon: '🔥', title: 'Consistent',       desc: '3 sessions in one week',                     earned: consistentEarned },
    { id: 'halfway',        icon: '🎯', title: 'Halfway There',    desc: 'Completed 50% of planned sessions',          earned: false },
    { id: 'wellness_streak',icon: '💚', title: 'Wellness Warrior', desc: '7 daily check-ins in a row',                 earned: wellnessStreak },
  ];
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export async function pgPatientSessions() {
  setTopbar('My Sessions');

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Portal sessions are all delivered (no upcoming scheduling data)
  const sessionsRaw = await api.patientPortalSessions().catch(() => null);
  const sessions    = Array.isArray(sessionsRaw) ? sessionsRaw : [];

  const upcoming = [];  // upcoming not available via portal endpoint
  const past     = sessions.slice().sort((a, b) =>
    new Date(b.delivered_at || 0) - new Date(a.delivered_at || 0)
  );

  function statusBadge(s) {
    const st = (s.status || '').toLowerCase();
    if (['completed', 'done'].includes(st)) return `<span class="pill pill-active" style="font-size:10px">Completed</span>`;
    if (st === 'cancelled') return `<span class="pill pill-cancelled" style="font-size:10px">Cancelled</span>`;
    return `<span class="pill pill-pending" style="font-size:10px">Upcoming</span>`;
  }

  function sessionRowHTML(s, idx) {
    const date  = fmtDate(s.delivered_at);
    const label = `Session ${idx + 1}`;
    const dur   = s.duration_minutes ? `${s.duration_minutes} min` : '';
    const n     = idx;
    const detailRows = [
      ['Device',     s.device_slug || null],
      ['Duration',   s.duration_minutes ? `${s.duration_minutes} min` : null],
      ['Tolerance',  s.tolerance_rating || null],
      ['Notes',      s.post_session_notes || null],
    ].filter(([, v]) => v);
    return `
      <div class="pt-session-card" style="flex-direction:column;padding:0;cursor:pointer" onclick="window._ptToggleSession(${n})">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px">
          <div class="pt-session-icon done">✓</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${label}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${date}${dur ? ' · ' + dur : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            ${statusBadge(s)}
            <span id="pt-chev-${n}" class="pt-sess-chevron" style="font-size:12px;color:var(--text-tertiary);transition:transform 0.2s">▾</span>
          </div>
        </div>
        <div id="pt-sess-detail-${n}" class="pt-sess-detail" style="display:none;padding:0 16px 14px;border-top:1px solid var(--border)">
          ${detailRows.length > 0
            ? detailRows.map(([k, v]) => `<div class="field-row" style="font-size:11.5px"><span>${k}</span><span>${v}</span></div>`).join('')
            : '<div style="font-size:11.5px;color:var(--text-tertiary);padding:8px 0">No additional details available.</div>'}
        </div>
      </div>`;
  }

  function upcomingRowHTML(s, idx) {
    const date  = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
      : '—';
    const time  = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
    const label = s.session_number ? `Session #${s.session_number}` : `Session ${idx + 1}`;
    const mod   = s.modality_slug?.toUpperCase() || s.condition_slug || 'Treatment';
    return `
      <div class="pt-session-card" style="border-radius:0;border:none;border-bottom:1px solid var(--border);margin:0">
        <div class="pt-session-icon upcoming">◧</div>
        <div style="flex:1">
          <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${label}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${mod}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;color:var(--blue);font-weight:500">${date}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${time}</div>
        </div>
      </div>`;
  }

  const upcomingHtml = upcoming.length === 0
    ? `<div class="card"><div class="card-body"><div style="text-align:center;padding:24px;color:var(--text-tertiary)">
        <div style="font-size:18px;margin-bottom:8px;opacity:.4">◧</div>
        No upcoming sessions scheduled
      </div></div></div>`
    : `<div class="card" style="padding:0;overflow:hidden">${upcoming.map(upcomingRowHTML).join('')}</div>`;

  const completedHtml = past.length === 0
    ? `<div style="text-align:center;padding:36px;color:var(--text-tertiary)">
        <div style="font-size:18px;margin-bottom:8px;opacity:.4">◧</div>
        No sessions completed yet
      </div>`
    : past.map((s, i) => sessionRowHTML(s, i)).join('');

  el.innerHTML = `
    <div class="tab-bar">
      <button class="tab-btn active" id="s-tab-up" onclick="window._ptSessTab('upcoming')">Upcoming (${upcoming.length})</button>
      <button class="tab-btn" id="s-tab-done" onclick="window._ptSessTab('completed')">Completed (${past.length})</button>
    </div>
    <div id="pt-sess-upcoming">
      ${upcomingHtml}
    </div>
    <div id="pt-sess-completed" style="display:none">
      ${completedHtml}
    </div>
  `;

  window._ptSessTab = function(tab) {
    document.getElementById('pt-sess-upcoming').style.display  = tab === 'upcoming'  ? '' : 'none';
    document.getElementById('pt-sess-completed').style.display = tab === 'completed' ? '' : 'none';
    document.getElementById('s-tab-up').classList.toggle('active',   tab === 'upcoming');
    document.getElementById('s-tab-done').classList.toggle('active', tab === 'completed');
  };

  window._ptToggleSession = function(n) {
    const detail = document.getElementById(`pt-sess-detail-${n}`);
    const chev   = document.getElementById(`pt-chev-${n}`);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    document.querySelectorAll('.pt-sess-detail').forEach(d => { d.style.display = 'none'; });
    document.querySelectorAll('.pt-sess-chevron').forEach(c => { c.style.transform = ''; });
    if (!isOpen) {
      detail.style.display = '';
      if (chev) chev.style.transform = 'rotate(180deg)';
    }
  };
}

// ── My Treatment ──────────────────────────────────────────────────────────────
export async function pgPatientCourse() {
  setTopbar('My Treatment');
  const user = currentUser;
  const uid  = user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  const coursesRaw = await api.patientPortalCourses().catch(() => null);
  const coursesArr = Array.isArray(coursesRaw) ? coursesRaw : [];
  const course = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  if (!course) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body" style="text-align:center;padding:48px;color:var(--text-tertiary)">
          <div style="font-size:24px;margin-bottom:12px;opacity:.4">◎</div>
          No active treatment course assigned.<br>
          <span style="font-size:12px">Contact your clinic to get started.</span>
        </div>
      </div>`;
    return;
  }

  // Portal course fields
  const delivered  = course.session_count ?? 0;
  const total      = course.total_sessions_planned ?? 20;
  const pct        = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const nextSessN  = delivered + 1;
  const startedStr = fmtDate(course.started_at || course.created_at);
  const condition  = course.condition_slug || '—';
  const modality   = course.modality_slug?.toUpperCase() || '—';
  const protocol   = course.protocol_id || '—';

  const courseFields = [
    ['Condition',  condition],
    ['Modality',   modality],
    ['Protocol',   protocol],
    ['Sessions',   `${delivered} completed`],
    ['Started',    startedStr],
  ].filter(([, v]) => v && v !== '—');

  el.innerHTML = `
    <div class="card" style="margin-bottom:20px;border-color:var(--border-teal)">
      <div class="card-header">
        <h3>Current Treatment Course</h3>
        <span class="pill pill-active">${course.status || 'Active'}</span>
      </div>
      <div class="card-body">
        <div class="g2">
          <div>
            ${courseFields.map(([k, v]) => `<div class="field-row"><span>${k}</span><span>${v}</span></div>`).join('')}
          </div>
          <div>
            <div style="margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:12px;color:var(--text-secondary)">Overall Progress</span>
                <span style="font-size:12px;font-weight:600;color:var(--teal)">${pct}%</span>
              </div>
              <div class="progress-bar" style="height:8px">
                <div class="progress-fill" style="width:${pct}%"></div>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px">${delivered} of ${total} sessions complete</div>
            </div>
            <div class="notice notice-info" style="font-size:12px">
              Your care team will review outcomes at session ${Math.round(total * 0.75)} and may adjust parameters.
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Session Timeline</h3></div>
      <div class="card-body">
        <div class="pt-timeline">
          ${Array.from({ length: total }, (_, i) => {
            const n      = i + 1;
            const state  = n <= delivered ? 'done' : n === nextSessN ? 'active' : 'upcoming';
            const dotCls = `pt-tl-dot pt-tl-dot-${state}`;
            const label  = state === 'done'
              ? `<span style="color:var(--green);font-size:11px;font-weight:500">Session ${n}</span>`
              : state === 'active'
              ? `<span style="color:var(--teal);font-size:11px;font-weight:600">Session ${n} — Next</span>`
              : `<span style="color:var(--text-tertiary);font-size:11px">Session ${n}</span>`;
            return `
              <div class="pt-tl-row ${n === total ? 'pt-tl-last' : ''}">
                <div class="pt-tl-spine">
                  <div class="${dotCls}">${state === 'done' ? '✓' : ''}</div>
                  ${n < total ? '<div class="pt-tl-line"></div>' : ''}
                </div>
                <div class="pt-tl-content">${label}</div>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>About This Treatment</h3></div>
      <div class="card-body">
        <p style="font-size:12.5px;color:var(--text-secondary);line-height:1.8;margin-bottom:12px">
          <strong style="color:var(--text-primary)">${modality}</strong> is a non-invasive brain stimulation technique
          targeting <strong style="color:var(--text-primary)">${condition}</strong>.
          Your care team has designed this course based on your clinical assessment.
        </p>
        <p style="font-size:12.5px;color:var(--text-secondary);line-height:1.8">
          Sessions are typically painless. You may feel mild sensations under the electrodes — this is normal.
          Contact your clinician if you experience unexpected discomfort.
        </p>
      </div>
    </div>

    <div class="card" id="pt-homework-card">
      <div class="card-header"><h3>Homework &amp; Exercises</h3></div>
      <div class="card-body" style="padding:0 0 4px">
        <div id="homework-list"></div>
        <div style="padding:12px 18px">
          <div id="homework-add-form" style="display:none;margin-bottom:10px">
            <div style="display:flex;gap:8px;align-items:center">
              <input type="text" id="homework-note-input" class="form-control" placeholder="Personal note title…" style="flex:1;font-size:12.5px">
              <button class="btn btn-primary btn-sm" onclick="window._saveHomeworkNote()">Add</button>
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('homework-add-form').style.display='none'">Cancel</button>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="width:100%" onclick="window._addHomeworkNote()">+ Add personal note</button>
        </div>
      </div>
    </div>
  `;

  // Homework state management
  const hwKey = 'ds_homework_' + (course.id || course.patient_id || 'default');
  const MOCK_HOMEWORK = [
    { id: 'h1', title: 'Mindfulness breathing exercise', description: '10 minutes daily, morning preferred', frequency: 'Daily', completed: false, personal: false },
    { id: 'h2', title: 'Sleep hygiene checklist', description: 'No screens 1hr before bed, consistent wake time', frequency: 'Daily', completed: true, personal: false },
    { id: 'h3', title: 'Symptom diary', description: 'Rate mood and energy levels each evening', frequency: 'Daily', completed: false, personal: false },
  ];

  function loadHomework() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(hwKey)); } catch (_e) {}
    if (!stored) return MOCK_HOMEWORK.map(h => ({ ...h }));
    // Merge mock items with stored state
    const storedMap = {};
    stored.forEach(h => { storedMap[h.id] = h; });
    const merged = MOCK_HOMEWORK.map(h => storedMap[h.id] ? { ...h, ...storedMap[h.id] } : { ...h });
    // Add personal items
    const personal = stored.filter(h => h.personal);
    return [...merged, ...personal.filter(p => !merged.find(m => m.id === p.id))];
  }

  function saveHomework(items) {
    try { localStorage.setItem(hwKey, JSON.stringify(items)); } catch (_e) {}
  }

  function renderHomework() {
    const items = loadHomework();
    const listEl = document.getElementById('homework-list');
    if (!listEl) return;
    if (items.length === 0) {
      listEl.innerHTML = '<div style="padding:16px 18px;font-size:12.5px;color:var(--text-tertiary)">No homework assigned yet.</div>';
      return;
    }
    listEl.innerHTML = items.map(item => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 18px;border-bottom:1px solid var(--border)">
        <input type="checkbox" ${item.completed ? 'checked' : ''} style="margin-top:2px;accent-color:var(--teal);width:15px;height:15px;cursor:pointer;flex-shrink:0"
          onchange="window._toggleHomework('${item.id}')">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text-primary);${item.completed ? 'text-decoration:line-through;opacity:0.55' : ''}">${item.title}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px">${item.description}</div>
        </div>
        <span style="font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(0,212,188,0.1);color:var(--teal);flex-shrink:0;align-self:center">${item.frequency}</span>
      </div>
    `).join('');
  }

  window._toggleHomework = function(id) {
    const items = loadHomework();
    const item  = items.find(h => h.id === id);
    if (item) item.completed = !item.completed;
    saveHomework(items);
    renderHomework();
  };

  window._addHomeworkNote = function() {
    document.getElementById('homework-add-form').style.display = '';
    document.getElementById('homework-note-input').focus();
  };

  window._saveHomeworkNote = function() {
    const input = document.getElementById('homework-note-input');
    const title = input?.value?.trim();
    if (!title) return;
    const items = loadHomework();
    items.push({ id: 'p_' + Date.now(), title, description: 'Personal note', frequency: 'Personal', completed: false, personal: true });
    saveHomework(items);
    if (input) input.value = '';
    document.getElementById('homework-add-form').style.display = 'none';
    renderHomework();
  };

  renderHomework();
}

// ── PHQ-9 Assessment ──────────────────────────────────────────────────────────
const PHQ9_QUESTIONS = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading the newspaper or watching television',
  'Moving or speaking so slowly that other people could have noticed? Or being so fidgety or restless that you have been moving more than usual',
  'Thoughts that you would be better off dead, or thoughts of hurting yourself in some way',
];
const PHQ9_OPTIONS = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];

function phq9Severity(score) {
  if (score <= 4)  return { label: 'Minimal',          color: 'var(--green)' };
  if (score <= 9)  return { label: 'Mild',              color: 'var(--teal)'  };
  if (score <= 14) return { label: 'Moderate',          color: 'var(--blue)'  };
  if (score <= 19) return { label: 'Moderately Severe', color: 'var(--amber)' };
  return               { label: 'Severe',              color: '#ff6b6b'      };
}

function renderPHQ9Form(containerId, patientId) {
  const formEl = document.getElementById(containerId);
  if (!formEl) return;
  formEl.innerHTML = `
    <div class="pt-assessment-form" id="phq9-form-wrap">
      <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">
        PHQ-9 — Over the last 2 weeks, how often have you been bothered by any of the following problems?
      </div>
      ${PHQ9_QUESTIONS.map((q, i) => `
        <div class="pt-phq9-question" id="phq9-q${i}">
          <div style="font-size:12.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.5">
            <span style="color:var(--text-tertiary);margin-right:6px">${i + 1}.</span>${q}
          </div>
          <div class="pt-phq9-options">
            ${PHQ9_OPTIONS.map((opt, v) => `
              <label class="pt-phq9-option" onclick="window._ptPHQ9Pick(${i}, ${v})">
                <input type="radio" name="phq9_q${i}" value="${v}" style="display:none">
                <span class="pt-phq9-radio" id="phq9-r${i}-${v}"></span>
                <span style="font-size:11.5px;color:var(--text-secondary)">${opt}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div style="display:flex;align-items:center;gap:16px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-tertiary)">Real-time score</div>
          <div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--teal)" id="phq9-live-score">0 / 27</div>
        </div>
        <button class="btn btn-primary" onclick="window._ptPHQ9Submit()">Submit Assessment →</button>
      </div>
      <div id="phq9-result" style="display:none"></div>
    </div>
  `;

  window._phq9Answers = new Array(9).fill(null);

  window._ptPHQ9Pick = function(q, v) {
    window._phq9Answers[q] = v;
    for (let opt = 0; opt < 4; opt++) {
      const r = document.getElementById(`phq9-r${q}-${opt}`);
      if (r) r.classList.toggle('selected', opt === v);
    }
    const qEl = document.getElementById(`phq9-q${q}`);
    if (qEl) qEl.classList.add('answered');
    const score  = window._phq9Answers.reduce((sum, a) => sum + (a ?? 0), 0);
    const liveEl = document.getElementById('phq9-live-score');
    if (liveEl) liveEl.textContent = `${score} / 27`;
  };

  window._ptPHQ9Submit = async function() {
    const unanswered = window._phq9Answers.findIndex(a => a === null);
    if (unanswered !== -1) {
      const qEl = document.getElementById(`phq9-q${unanswered}`);
      if (qEl) { qEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); qEl.classList.add('pt-phq9-highlight'); }
      return;
    }
    const score    = window._phq9Answers.reduce((sum, a) => sum + a, 0);
    const severity = phq9Severity(score);
    const pct      = Math.round((score / 27) * 100);

    // Submit to API — non-fatal
    try {
      if (patientId) {
        await api.submitAssessment(patientId, {
          template_id:       'PHQ-9',
          score,
          measurement_point: 'post',
          notes:             '',
        });
      }
    } catch (_e) { /* non-fatal */ }

    const resultEl = document.getElementById('phq9-result');
    if (!resultEl) return;
    resultEl.style.display = '';
    resultEl.innerHTML = `
      <div style="margin-top:20px;padding:20px;border-radius:var(--radius-lg);border:1px solid var(--border-teal);background:rgba(0,212,188,0.04)">
        <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">Assessment Result</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px">
          <div style="font-size:32px;font-weight:700;font-family:var(--font-display);color:${severity.color}">${score}</div>
          <div style="font-size:13px;color:var(--text-secondary)">out of 27</div>
          <div style="margin-left:auto;font-size:14px;font-weight:600;color:${severity.color}">${severity.label}</div>
        </div>
        <div class="progress-bar" style="height:8px;margin-bottom:8px">
          <div style="height:100%;width:${pct}%;background:${severity.color};border-radius:4px;transition:width 0.8s ease"></div>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6;margin-top:12px">
          Your score has been recorded. Your care team will review these results before your next session.
          If you are experiencing thoughts of self-harm, please contact your clinician immediately or call a crisis line.
        </div>
      </div>
    `;
    setTimeout(() => resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };
}

// ── Assessments ───────────────────────────────────────────────────────────────
export async function pgPatientAssessments() {
  setTopbar('Assessments');
  const user = currentUser;
  const uid  = user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  const assessmentsRaw = await api.patientPortalAssessments().catch(() => null);
  const assessments    = Array.isArray(assessmentsRaw) ? assessmentsRaw : [];

  function mpColor(pt) {
    if (!pt) return 'var(--text-tertiary)';
    const p = pt.toLowerCase();
    if (p === 'baseline') return 'var(--blue)';
    if (p === 'post')     return 'var(--green)';
    if (p === 'mid')      return 'var(--amber)';
    return 'var(--teal)';
  }

  const completedHtml = assessments.length === 0 ? '' : `
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Completed Assessments</h3></div>
      <div class="card-body" style="padding:0">
        ${assessments.map(a => {
          const name  = a.template_title || a.template_id || 'Assessment';
          const score = a.score != null ? a.score : '—';
          const date  = fmtDate(a.created_at);
          return `
            <div style="display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid var(--border)">
              <div style="flex:1">
                <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${name}</div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${date}</div>
              </div>
              <div style="font-size:16px;font-weight:700;color:var(--teal)">${score}</div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  el.innerHTML = `
    <div class="notice notice-info" style="margin-bottom:20px">
      ◉ &nbsp;Complete your PHQ-9 assessment below to track your progress.
    </div>

    ${completedHtml}

    <div class="card" id="pt-assess-pending-card">
      <div class="card-header">
        <h3>Weekly Mood Check-in</h3>
        <span class="pill pill-pending">Due</span>
      </div>
      <div class="card-body" style="display:flex;align-items:center;gap:16px">
        <div style="flex:1">
          <div style="font-size:12px;color:var(--text-tertiary)">PHQ-9</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Patient Health Questionnaire</div>
        </div>
        <button class="btn btn-primary btn-sm" id="pt-assess-start-btn" onclick="window._ptToggleAssessment()">Start &rarr;</button>
      </div>
      <div id="pt-assess-form-container" style="display:none;padding:0 18px 18px"></div>
    </div>
  `;

  window._ptToggleAssessment = function() {
    const container = document.getElementById('pt-assess-form-container');
    const btn       = document.getElementById('pt-assess-start-btn');
    if (!container) return;
    const isOpen = container.style.display !== 'none';
    if (isOpen) {
      container.style.display = 'none';
      btn.textContent = 'Start →';
    } else {
      container.style.display = '';
      btn.textContent = 'Close ✕';
      renderPHQ9Form('pt-assess-form-container', uid);
      setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    }
  };
}

// ── Reports ───────────────────────────────────────────────────────────────────
export async function pgPatientReports() {
  setTopbar('Reports & Documents');
  const user = currentUser;
  const uid  = user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Use patient portal outcomes as the source for reports
  const outcomesRaw = await api.patientPortalOutcomes().catch(() => null);
  const outcomes    = Array.isArray(outcomesRaw) ? outcomesRaw : [];

  if (outcomes.length === 0) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body" style="text-align:center;padding:48px;color:var(--text-tertiary)">
          <div style="font-size:24px;margin-bottom:12px;opacity:.4">◱</div>
          No outcome reports available yet.<br>
          <span style="font-size:12px">Your care team will add reports after each assessment.</span>
        </div>
      </div>`;
    return;
  }

  el.innerHTML = outcomes.map(r => {
    const title = r.template_title || r.template_id || 'Outcome Report';
    const date  = fmtDate(r.administered_at);
    const score = r.score != null ? ` · Score: ${r.score}` : '';
    const mp    = r.measurement_point ? ` · ${r.measurement_point}` : '';
    return `
      <div class="card">
        <div class="card-body" style="display:flex;align-items:center;gap:14px">
          <div style="width:40px;height:40px;border-radius:var(--radius-md);background:rgba(74,158,255,0.1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;color:var(--blue)">◱</div>
          <div style="flex:1">
            <div style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${title}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">${date}${score}${mp}</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Messages ──────────────────────────────────────────────────────────────────
export async function pgPatientMessages() {
  setTopbar('Messages');
  const user = currentUser;
  const uid  = user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Messages go through clinic-side API — patients communicate via Telegram
  // For now show an empty thread with a Telegram connection notice
  const messagesRaw = null;
  let messages      = [];

  // Sort oldest → newest for chat display
  messages = messages.slice().sort((a, b) =>
    new Date(a.created_at || a.sent_at || 0) - new Date(b.created_at || b.sent_at || 0)
  );

  function msgBubbleHTML(m) {
    const isOutgoing = m.sender_id === uid || m.outgoing === true;
    const body       = m.body || m.message || m.text || '';
    const rel        = fmtRelative(m.created_at || m.sent_at);
    const senderName = m.sender_name || m.sender?.display_name || (isOutgoing ? 'You' : 'Clinic');

    if (isOutgoing) {
      return `<div class="pt-msg-outgoing">
        <div class="pt-msg-bubble-out">
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.55">${body}</div>
          <div style="font-size:10px;color:rgba(0,212,188,0.6);margin-top:5px;text-align:right">${rel}</div>
        </div>
        <div class="avatar" style="background:linear-gradient(135deg,var(--teal-dim),var(--blue-dim));flex-shrink:0;font-size:10px">You</div>
      </div>`;
    }

    const initials = senderName.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'CL';
    const isUnread  = m.is_read === false || m.read === false || m.unread === true;
    return `<div style="display:flex;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border);background:${isUnread ? 'rgba(74,158,255,0.03)' : 'var(--bg-card)'}">
      <div class="avatar" style="background:linear-gradient(135deg,var(--teal-dim),var(--blue-dim));flex-shrink:0">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <div style="font-size:12.5px;font-weight:${isUnread ? 600 : 400};color:var(--text-primary)">${senderName}</div>
          <div style="font-size:10.5px;color:var(--text-tertiary);flex-shrink:0">${rel}</div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.55">${body}</div>
      </div>
      ${isUnread ? `<div style="width:7px;height:7px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:5px;box-shadow:0 0 6px rgba(74,158,255,0.5)"></div>` : ''}
    </div>`;
  }

  function renderMessageList() {
    const listEl = document.getElementById('pt-msg-list');
    if (!listEl) return;
    if (messages.length === 0) {
      listEl.innerHTML = `<div style="padding:36px;text-align:center;color:var(--text-tertiary);font-size:12px">
        No messages yet. Your clinician will reach out soon.
      </div>`;
    } else {
      listEl.innerHTML = messages.map(m => msgBubbleHTML(m)).join('');
    }
  }

  el.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:16px" id="pt-msg-list"></div>
    <div class="card" style="border-color:var(--border)">
      <div class="card-body" style="padding:14px 16px">
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.7px">Reply to your care team</div>
        <textarea
          id="pt-msg-input"
          class="form-control"
          rows="3"
          placeholder="Type your message here…"
          style="resize:vertical;min-height:72px;margin-bottom:10px"
        ></textarea>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-primary btn-sm" onclick="window._ptSendMessage()">Send Message →</button>
        </div>
      </div>
    </div>
  `;

  renderMessageList();

  window._ptSendMessage = async function() {
    const input = document.getElementById('pt-msg-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    // Optimistic: append to local array and re-render immediately
    const optimistic = {
      sender_id:  uid,
      body:       text,
      created_at: new Date().toISOString(),
      outgoing:   true,
    };
    messages.push(optimistic);
    renderMessageList();
    input.value = '';
    input.focus();

    // Message sending via Telegram — real-time delivery not yet wired
    /* keep optimistic entry only */
  };
}

// ── Profile & Settings ────────────────────────────────────────────────────────
export async function pgPatientProfile(user) {
  setTopbar('Profile & Settings');

  function renderProfile(u) {
    const initials = (u?.display_name || '?').slice(0, 2).toUpperCase();
    document.getElementById('patient-content').innerHTML = `
      <div class="g2">
        <div>
          <div class="card">
            <div class="card-header">
              <h3>My Profile</h3>
              <button class="btn btn-ghost btn-sm" id="pt-profile-refresh-btn" onclick="window._ptRefreshProfile()">↻ Refresh</button>
            </div>
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
                <div class="avatar" style="width:52px;height:52px;font-size:18px;background:linear-gradient(135deg,var(--blue-dim),var(--violet))">${initials}</div>
                <div>
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary)" id="pt-profile-name">${u?.display_name || 'Patient'}</div>
                  <div style="font-size:12px;color:var(--text-tertiary)" id="pt-profile-email">${u?.email || ''}</div>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Full Name</label>
                <input class="form-control" id="pt-profile-name-input" value="${u?.display_name || ''}" readonly style="opacity:0.7">
              </div>
              <div class="form-group">
                <label class="form-label">Email</label>
                <input class="form-control" id="pt-profile-email-input" value="${u?.email || ''}" readonly style="opacity:0.7">
              </div>
              <div id="pt-profile-refresh-notice" style="display:none;margin-top:8px"></div>
              <div class="notice notice-info" style="font-size:11.5px;margin-top:4px">
                To update your name or email, contact your clinic directly.
              </div>
            </div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-header"><h3>Notification Preferences</h3></div>
            <div class="card-body">
              ${[
                ['Session Reminders',    'Email + SMS'],
                ['Assessment Reminders', 'Email'],
                ['Report Notifications', 'Email'],
                ['Language',             'English'],
              ].map(([k, v]) => `
                <div class="field-row">
                  <span>${k}</span>
                  <span style="color:var(--blue)">${v}</span>
                </div>
              `).join('')}
              <button class="btn btn-ghost btn-sm" style="margin-top:12px;opacity:0.5;cursor:not-allowed" disabled>
                Update Preferences
              </button>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Account</h3></div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-ghost btn-sm" style="opacity:0.5;cursor:not-allowed" disabled>Change Password</button>
              <button class="btn btn-danger btn-sm" onclick="window.doLogout()">Sign Out ↪</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderProfile(user);

  window._ptRefreshProfile = async function() {
    const btn    = document.getElementById('pt-profile-refresh-btn');
    const notice = document.getElementById('pt-profile-refresh-notice');
    if (btn) { btn.disabled = true; btn.textContent = '↻ Loading…'; }
    try {
      const fresh = await api.me();
      if (fresh) {
        const nameEl  = document.getElementById('pt-profile-name');
        const emailEl = document.getElementById('pt-profile-email');
        const nameIn  = document.getElementById('pt-profile-name-input');
        const emailIn = document.getElementById('pt-profile-email-input');
        if (nameEl)  nameEl.textContent  = fresh.display_name || 'Patient';
        if (emailEl) emailEl.textContent = fresh.email || '';
        if (nameIn)  nameIn.value        = fresh.display_name || '';
        if (emailIn) emailIn.value       = fresh.email || '';
        if (notice) {
          notice.className    = 'notice notice-success';
          notice.style.display = '';
          notice.style.fontSize = '11.5px';
          notice.textContent  = 'Profile refreshed successfully.';
          setTimeout(() => { if (notice) notice.style.display = 'none'; }, 3000);
        }
      }
    } catch (_e) {
      if (notice) {
        notice.className    = 'notice notice-error';
        notice.style.display = '';
        notice.style.fontSize = '11.5px';
        notice.textContent  = 'Could not refresh profile. Check your connection.';
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
    }
  };
}

// ── Wellness Check-in ─────────────────────────────────────────────────────────
export async function pgPatientWellness() {
  setTopbar('Wellness Check-in');
  const uid = currentUser?.patient_id || currentUser?.id;

  const el = document.getElementById('patient-content');
  const todayStr  = new Date().toISOString().slice(0, 10);
  const todayFmt  = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Daily Wellness Check-in</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">${todayFmt}</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">Track how you're feeling to help your care team monitor your progress.</div>
    </div>

    <div class="card" id="pt-wellness-form-card">
      <div class="card-header"><h3>How are you feeling today?</h3></div>
      <div class="card-body" style="padding:20px">

        <!-- Mood slider -->
        <div class="wellness-slider-group">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:13px;font-weight:500;color:var(--text-primary)">Mood</label>
            <span id="mood-val" style="color:var(--teal);font-weight:600">5</span>
          </div>
          <input type="range" id="mood-slider" min="1" max="10" value="5"
                 oninput="document.getElementById('mood-val').textContent=this.value;window._updateWellnessEmoji()"
                 style="width:100%;accent-color:var(--teal)">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:4px">
            <span>😞 Poor</span><span>😐 Okay</span><span>😊 Great</span>
          </div>
        </div>

        <!-- Sleep slider -->
        <div class="wellness-slider-group" style="margin-top:20px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:13px;font-weight:500;color:var(--text-primary)">Sleep Quality</label>
            <span id="sleep-val" style="color:var(--blue);font-weight:600">5</span>
          </div>
          <input type="range" id="sleep-slider" min="1" max="10" value="5"
                 oninput="document.getElementById('sleep-val').textContent=this.value;window._updateWellnessEmoji()"
                 style="width:100%;accent-color:var(--blue)">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:4px">
            <span>😴 Poor</span><span>💤 Okay</span><span>🌟 Excellent</span>
          </div>
        </div>

        <!-- Energy slider -->
        <div class="wellness-slider-group" style="margin-top:20px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:13px;font-weight:500;color:var(--text-primary)">Energy Level</label>
            <span id="energy-val" style="color:var(--violet);font-weight:600">5</span>
          </div>
          <input type="range" id="energy-slider" min="1" max="10" value="5"
                 oninput="document.getElementById('energy-val').textContent=this.value;window._updateWellnessEmoji()"
                 style="width:100%;accent-color:var(--violet)">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:4px">
            <span>😩 Exhausted</span><span>⚡ Okay</span><span>🔥 Energized</span>
          </div>
        </div>

        <!-- Notes -->
        <div style="margin-top:20px">
          <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:500;color:var(--text-primary)">Notes (optional)</label>
          <textarea id="wellness-notes" class="form-control" placeholder="Any symptoms, observations, or notes for your care team…"
                    style="width:100%;min-height:80px;resize:vertical;font-size:12.5px"></textarea>
        </div>

        <!-- Emoji summary -->
        <div id="wellness-emoji" style="text-align:center;font-size:2.5rem;margin:20px 0">😐</div>

        <button class="btn btn-primary" onclick="window._submitWellness()" style="width:100%;padding:12px;font-size:14px">
          Submit Check-in
        </button>
      </div>
    </div>
  `;

  window._updateWellnessEmoji = function() {
    const mood   = parseInt(document.getElementById('mood-slider')?.value || '5', 10);
    const sleep  = parseInt(document.getElementById('sleep-slider')?.value || '5', 10);
    const energy = parseInt(document.getElementById('energy-slider')?.value || '5', 10);
    const avg    = (mood + sleep + energy) / 3;
    let emoji    = '😐';
    if (avg < 4)      emoji = '😞';
    else if (avg < 6) emoji = '😐';
    else if (avg < 8) emoji = '🙂';
    else              emoji = '😊';
    const el = document.getElementById('wellness-emoji');
    if (el) el.textContent = emoji;
  };

  window._submitWellness = async function() {
    const moodEl   = document.getElementById('mood-slider');
    const sleepEl  = document.getElementById('sleep-slider');
    const energyEl = document.getElementById('energy-slider');
    const notesEl  = document.getElementById('wellness-notes');
    if (!moodEl || !sleepEl || !energyEl) return;

    const moodVal   = parseInt(moodEl.value, 10);
    const sleepVal  = parseInt(sleepEl.value, 10);
    const energyVal = parseInt(energyEl.value, 10);
    const notes     = notesEl?.value?.trim() || '';

    try {
      if (uid) {
        await api.submitAssessment(uid, {
          type:    'wellness_checkin',
          mood:    moodVal,
          sleep:   sleepVal,
          energy:  energyVal,
          notes,
          date:    new Date().toISOString(),
        });
      }
    } catch (_e) { /* non-fatal */ }

    // Track check-in
    const todayIso = new Date().toISOString().slice(0, 10);
    localStorage.setItem('ds_last_checkin', todayIso);

    // Update wellness streak
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const lastDay   = localStorage.getItem('ds_last_checkin_prev');
      const curStreak = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10);
      const newStreak = (lastDay === yesterday) ? curStreak + 1 : 1;
      localStorage.setItem('ds_wellness_streak', String(newStreak));
      localStorage.setItem('ds_last_checkin_prev', todayIso);
    } catch (_e) { /* ignore */ }

    // Show success state
    const formCard = document.getElementById('pt-wellness-form-card');
    if (formCard) {
      formCard.innerHTML = `
        <div class="card-body" style="padding:32px;text-align:center">
          <div style="font-size:3rem;margin-bottom:16px">✅</div>
          <div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Check-in submitted!</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:20px">Your care team can see your update. Keep tracking daily for best results.</div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="window._navPatient('patient-portal')">Back to Dashboard</button>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('pt-learn')">Read wellness tips</button>
          </div>
        </div>
      `;
    }
  };
}

// ── Learn & Resources ─────────────────────────────────────────────────────────
const LEARN_ARTICLES = [
  {
    id:       'neurofeedback-intro',
    category: 'Your Treatment',
    title:    'What is Neurofeedback?',
    readTime: '3 min',
    icon:     '🧠',
    summary:  'Neurofeedback is a type of biofeedback that trains your brain to self-regulate.',
    content:  `Neurofeedback (also called EEG biofeedback) is a non-invasive technique that trains your brain to function more efficiently. During sessions, sensors on your scalp measure brainwave activity in real-time, and you receive immediate feedback — usually through sounds, images, or games.\n\nYour brain learns to produce healthier brainwave patterns through this feedback loop. Over time, this can improve focus, sleep, mood, and cognitive performance.\n\n**What to expect during sessions:**\n- Sensors are placed on your scalp (no electricity enters your brain)\n- You watch a screen or listen to sounds that respond to your brainwaves\n- Sessions typically last 30–45 minutes\n- Most people feel relaxed afterward\n\n**How many sessions will I need?**\nMost protocols involve 20–40 sessions. Your clinician has designed a personalized plan based on your assessment results.`,
  },
  {
    id:       'sleep-tips',
    category: 'Wellness',
    title:    'Sleep Optimization for Better Treatment Outcomes',
    readTime: '4 min',
    icon:     '😴',
    summary:  'Quality sleep amplifies the effects of neurostimulation therapy.',
    content:  `Sleep is when your brain consolidates the changes made during treatment sessions. Research shows that patients who prioritize sleep hygiene see better outcomes from neurofeedback and neurostimulation therapy.\n\n**The brain-sleep connection:**\nDuring deep sleep, your brain replays and reinforces the neural patterns trained during sessions. This neuroplasticity window is critical for lasting change.\n\n**Evidence-based sleep tips:**\n- Maintain a consistent sleep schedule (even weekends)\n- Keep your bedroom cool (65–68°F / 18–20°C)\n- Avoid screens 1 hour before bed\n- No caffeine after 2pm\n- Brief relaxation routine before bed\n\n**Track your sleep:**\nUse your daily wellness check-in to rate sleep quality. Share patterns with your clinician at your next session.`,
  },
  {
    id:       'what-to-expect',
    category: 'Your Treatment',
    title:    'What to Expect in Your First Month',
    readTime: '5 min',
    icon:     '📅',
    summary:  'A realistic timeline of what most patients experience.',
    content:  `Every person responds differently to brain training. Here is a general timeline based on typical patient experiences:\n\n**Weeks 1–2: Adjustment Phase**\nYou may not notice dramatic changes yet. Some people feel slightly tired after sessions — this is normal. Your brain is adapting.\n\n**Weeks 3–4: Early Changes**\nMany patients begin noticing subtle shifts: better sleep, slightly improved focus, or reduced anxiety. These early signs are encouraging.\n\n**Month 2+: Consolidation**\nChanges become more consistent and noticeable. Most improvements become apparent between sessions 15–25.\n\n**Important:** Progress is rarely linear. Some sessions may feel like setbacks — this is part of the process. Track your symptoms daily and discuss patterns with your clinician.`,
  },
  {
    id:       'mindfulness',
    category: 'Wellness',
    title:    'Mindfulness Between Sessions',
    readTime: '3 min',
    icon:     '🧘',
    summary:  'Simple practices that enhance treatment effectiveness.',
    content:  `Mindfulness practices between sessions can enhance the effects of your treatment. Research suggests that patients who practice mindfulness show better brain regulation.\n\n**5-minute morning routine:**\n1. Sit comfortably, close your eyes\n2. Take 3 deep breaths (4 counts in, 6 counts out)\n3. Notice any sensations without judgment\n4. Set a simple intention for the day\n\n**Evening wind-down (10 min):**\n1. Body scan from feet to head\n2. Rate today's mood, sleep from last night, energy\n3. Note one thing you're grateful for\n\nThese practices support neuroplasticity — the same mechanism that makes your treatment effective.`,
  },
];

export async function pgPatientLearn() {
  setTopbar('Learn & Resources');
  const el = document.getElementById('patient-content');

  // Track read articles
  let readArticles = [];
  try { readArticles = JSON.parse(localStorage.getItem('ds_read_articles') || '[]'); } catch (_e) {}

  let activeCategory = 'All';

  function renderContent(str) {
    return str
      .split('\n\n')
      .map(para => {
        const processed = para.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        return `<p style="font-size:13px;color:var(--text-secondary);line-height:1.75;margin-bottom:12px">${processed}</p>`;
      })
      .join('');
  }

  function articleGrid(category, search) {
    const filtered = LEARN_ARTICLES.filter(a => {
      const matchCat    = category === 'All' || a.category === category;
      const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.summary.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      return '<div style="text-align:center;padding:40px;color:var(--text-tertiary)">No articles match your search.</div>';
    }

    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:16px">
      ${filtered.map(a => {
        const isRead = readArticles.includes(a.id);
        return `<div class="card" style="cursor:pointer;transition:border-color 0.2s;${isRead ? 'border-color:var(--teal)' : ''}" onclick="window._openArticle('${a.id}')">
          <div class="card-body" style="padding:18px">
            <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px">
              <div style="font-size:24px;flex-shrink:0">${a.icon}</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
                  <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:rgba(74,158,255,0.12);color:var(--blue)">${a.category}</span>
                  <span style="font-size:10px;color:var(--text-tertiary)">· ${a.readTime} read</span>
                  ${isRead ? '<span style="font-size:10px;color:var(--teal);font-weight:600">✓ Read</span>' : ''}
                </div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);line-height:1.3;margin-bottom:6px">${a.title}</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${a.summary}</div>
              </div>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  }

  function renderGrid() {
    const search = document.getElementById('learn-search')?.value || '';
    const gridEl = document.getElementById('learn-grid');
    if (gridEl) gridEl.innerHTML = articleGrid(activeCategory, search);
  }

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Learn &amp; Resources</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Educational content to support your treatment journey.</div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <input type="text" id="learn-search" class="form-control" placeholder="Search articles…"
             style="flex:1;min-width:160px;max-width:320px;font-size:13px"
             oninput="window._learnSearch()">
      <div class="tab-bar" style="margin:0">
        ${['All', 'Your Treatment', 'Wellness'].map(cat => `
          <button class="tab-btn ${activeCategory === cat ? 'active' : ''}" id="learn-cat-${cat.replace(/\s+/g,'-')}" onclick="window._learnCat('${cat}')">${cat}</button>
        `).join('')}
      </div>
    </div>

    <div id="learn-grid"></div>
    <div id="learn-article-view" style="display:none"></div>
  `;

  renderGrid();

  window._learnSearch = function() { renderGrid(); };

  window._learnCat = function(cat) {
    activeCategory = cat;
    ['All', 'Your Treatment', 'Wellness'].forEach(c => {
      const btn = document.getElementById('learn-cat-' + c.replace(/\s+/g, '-'));
      if (btn) btn.classList.toggle('active', c === cat);
    });
    renderGrid();
  };

  window._openArticle = function(id) {
    const article = LEARN_ARTICLES.find(a => a.id === id);
    if (!article) return;
    const isRead = readArticles.includes(id);

    const gridEl    = document.getElementById('learn-grid');
    const articleEl = document.getElementById('learn-article-view');
    const searchBar = el.querySelector('[id="learn-search"]')?.closest('div');

    if (gridEl)    gridEl.style.display    = 'none';
    if (articleEl) articleEl.style.display = '';
    // hide category bar
    const catBar = el.querySelector('.tab-bar');
    if (catBar) catBar.parentElement.style.display = 'none';

    articleEl.innerHTML = `
      <div style="margin-bottom:16px">
        <button class="btn btn-ghost btn-sm" onclick="window._learnBack()" style="margin-bottom:16px">← Back to Articles</button>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <span style="font-size:28px">${article.icon}</span>
          <div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(74,158,255,0.12);color:var(--blue)">${article.category}</span>
              <span style="font-size:11px;color:var(--text-tertiary)">${article.readTime} read</span>
              ${isRead ? '<span style="font-size:11px;color:var(--teal);font-weight:600">✓ Already read</span>' : ''}
            </div>
            <div style="font-size:18px;font-weight:700;color:var(--text-primary);line-height:1.3">${article.title}</div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-body" style="padding:20px">
          ${renderContent(article.content)}
        </div>
      </div>

      <div id="learn-mark-read-wrap">
        ${isRead
          ? `<div style="display:flex;align-items:center;gap:8px;padding:12px 0;color:var(--teal)">
              <span>✓</span><span style="font-size:13px;font-weight:500">You've read this article</span>
            </div>`
          : `<button class="btn btn-primary btn-sm" onclick="window._markArticleRead('${id}')">✓ Mark as Read</button>`}
      </div>
    `;
  };

  window._markArticleRead = function(id) {
    if (!readArticles.includes(id)) {
      readArticles.push(id);
      try { localStorage.setItem('ds_read_articles', JSON.stringify(readArticles)); } catch (_e) {}
    }
    const wrap = document.getElementById('learn-mark-read-wrap');
    if (wrap) {
      wrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:12px 0;color:var(--teal)">
        <span>✓</span><span style="font-size:13px;font-weight:500">Marked as read!</span>
      </div>`;
    }
  };

  window._learnBack = function() {
    const gridEl    = document.getElementById('learn-grid');
    const articleEl = document.getElementById('learn-article-view');
    if (gridEl)    gridEl.style.display    = '';
    if (articleEl) articleEl.style.display = 'none';
    const catBar = el.querySelector('.tab-bar');
    if (catBar) catBar.parentElement.style.display = '';
    renderGrid();
  };
}

// ── Wearables ─────────────────────────────────────────────────────────────────
export async function pgPatientWearables() {
  setTopbar('Wearables');
  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // ── Device metadata ──────────────────────────────────────────────────────
  const DEVICES = [
    { source: 'apple_health',      display_name: 'Apple Health',        icon: '◌', iconColor: 'var(--teal)' },
    { source: 'android_health',    display_name: 'Android Health Connect', icon: '◌', iconColor: 'var(--green)' },
    { source: 'fitbit',            display_name: 'Fitbit',              icon: '◌', iconColor: 'var(--blue)' },
    { source: 'oura',              display_name: 'Oura Ring',           icon: '◌', iconColor: 'var(--violet)' },
  ];

  // ── Fetch data ────────────────────────────────────────────────────────────
  let wearableData = null;
  let summaryData  = null;
  try {
    [wearableData, summaryData] = await Promise.all([
      api.patientPortalWearables().catch(() => null),
      api.patientPortalWearableSummary(7).catch(() => null),
    ]);
  } catch (_e) {
    wearableData = null;
    summaryData  = null;
  }

  const connections   = wearableData?.connections   || [];
  const recentAlerts  = wearableData?.recent_alerts || [];
  const summaries     = summaryData?.summaries      || [];
  const latest        = summaryData?.latest         || null;

  // ── Helper: connection status ─────────────────────────────────────────────
  function connFor(source) {
    return connections.find(c => c.source === source) || null;
  }

  function syncStatus(conn) {
    if (!conn || conn.status !== 'connected') return 'disconnected';
    if (!conn.last_sync_at) return 'pending';
    const hrs = (Date.now() - new Date(conn.last_sync_at).getTime()) / 3600000;
    if (hrs <= 24) return 'synced';
    return 'stale';
  }

  function statusDot(s) {
    const map = {
      synced:       { color: 'var(--green)',  label: 'Synced' },
      stale:        { color: 'var(--amber)',  label: 'Sync overdue' },
      disconnected: { color: 'var(--red)',    label: 'Not connected' },
      pending:      { color: 'var(--amber)',  label: 'Pending' },
    };
    const st = map[s] || map.disconnected;
    return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:${st.color};font-weight:500">
      <span style="width:7px;height:7px;border-radius:50%;background:${st.color};flex-shrink:0;display:inline-block"></span>${st.label}
    </span>`;
  }

  // ── Trend helpers ─────────────────────────────────────────────────────────
  function trendVals(field) {
    return summaries.map(s => s[field]).filter(v => v != null);
  }

  function trendIndicator(vals) {
    if (vals.length < 2) return '→';
    const delta = vals[vals.length - 1] - vals[0];
    if (delta > 0) return '↑';
    if (delta < 0) return '↓';
    return '→';
  }

  function miniSparkline(vals, color) {
    if (!vals || vals.length < 2) {
      return `<svg width="90" height="24" viewBox="0 0 90 24"><line x1="0" y1="12" x2="90" y2="12" stroke="${color}" stroke-width="1" stroke-dasharray="3,3" opacity=".3"/></svg>`;
    }
    return sparklineSVG(vals, color, 90, 24);
  }

  function trendCard(label, value, unit, vals, color, source, cardColor) {
    const indicator = trendIndicator(vals);
    const indColor  = indicator === '↑' ? 'var(--green)' : indicator === '↓' ? 'var(--red)' : 'var(--text-tertiary)';
    const displayVal = (value != null) ? `${value}` : 'N/A';
    return `<div class="card" style="padding:14px 16px;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;width:3px;height:100%;background:${cardColor}"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px">
        <div>
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:3px">${label}</div>
          <div style="display:flex;align-items:baseline;gap:4px">
            <span style="font-size:22px;font-weight:700;color:${cardColor};font-family:var(--font-mono)">${displayVal}</span>
            <span style="font-size:11px;color:var(--text-tertiary)">${unit}</span>
          </div>
        </div>
        <span style="font-size:16px;color:${indColor};font-weight:700;margin-top:4px">${indicator}</span>
      </div>
      <div style="margin-bottom:6px">${miniSparkline(vals, cardColor)}</div>
      <div style="font-size:10px;color:var(--text-tertiary)">${source || 'Source unknown'}</div>
    </div>`;
  }

  // ── Compute metric values ─────────────────────────────────────────────────
  const rhrVals    = trendVals('rhr_bpm');
  const hrvVals    = trendVals('hrv_ms');
  const sleepVals  = trendVals('sleep_duration_h');
  const stepsVals  = trendVals('steps');
  const spo2Vals   = trendVals('spo2_pct');

  const latestRhr   = rhrVals.length   ? rhrVals[rhrVals.length - 1]   : null;
  const latestHrv   = hrvVals.length   ? hrvVals[hrvVals.length - 1]   : null;
  const latestSleep = sleepVals.length ? sleepVals[sleepVals.length - 1] : null;
  const latestSteps = stepsVals.length ? stepsVals[stepsVals.length - 1] : null;
  const latestSpo2  = spo2Vals.length  ? spo2Vals[spo2Vals.length - 1]  : null;
  const latestMood  = latest?.mood_score != null ? latest.mood_score : null;

  const connectedSource = connections.find(c => c.status === 'connected')?.display_name || 'Connected device';
  const hasSummaryData  = summaries.length > 0;

  // ── Build chat state ──────────────────────────────────────────────────────
  let wearableChatMessages = [];

  // ── Render ────────────────────────────────────────────────────────────────
  el.innerHTML = `
  <!-- Section 1: Connected Devices -->
  <div style="margin-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">◌ Connected Devices</div>
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px">Sync health data from your wearable or phone</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:12px">
      ${DEVICES.map(dev => {
        const conn   = connFor(dev.source);
        const status = syncStatus(conn);
        const isConn = status === 'synced' || status === 'stale';
        const lastSyncStr = conn?.last_sync_at
          ? `Last sync: ${fmtRelative(conn.last_sync_at)}`
          : 'Never synced';
        return `<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:var(--radius-md);background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;font-size:20px;color:${dev.iconColor};flex-shrink:0">${dev.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${dev.display_name}</div>
              <div style="margin-top:3px">${statusDot(status)}</div>
            </div>
          </div>
          <div style="font-size:11px;color:var(--text-tertiary)">${isConn ? lastSyncStr : 'Not connected'}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            ${isConn
              ? `<button class="btn btn-sm" style="color:var(--red);border-color:rgba(255,107,107,0.3);font-size:11px" onclick="window._connectWearable('${dev.source}','disconnect','${conn?.id || ''}')">Disconnect</button>`
              : `<button class="btn btn-sm btn-primary" style="font-size:11.5px" onclick="window._connectWearable('${dev.source}','connect','')">Connect</button>`}
          </div>
          <div style="font-size:10px;color:var(--text-tertiary);border-top:1px solid var(--border);padding-top:8px">Not a medical device — data is for personal insight only.</div>
        </div>`;
      }).join('')}
    </div>
    ${recentAlerts.length > 0 ? `
    <div class="notice notice-warn" style="font-size:12px;margin-top:8px">
      <strong>Sync note:</strong> ${recentAlerts[0].detail || 'A recent sync issue was detected.'}
    </div>` : ''}
  </div>

  <!-- Section 2: Health Trends -->
  <div style="margin-bottom:24px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">◎ Health Trends (7-day)</div>
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px">Based on synced device data</div>
      </div>
    </div>
    ${!hasSummaryData
      ? `<div class="card"><div class="card-body" style="padding:32px;text-align:center;color:var(--text-tertiary)">
          <div style="font-size:28px;margin-bottom:10px;opacity:.4">◌</div>
          <div style="font-size:13px;margin-bottom:6px;color:var(--text-secondary)">No data synced yet</div>
          <div style="font-size:12px">Connect a device above to start seeing your health trends.</div>
        </div></div>`
      : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
          ${trendCard('Resting HR', latestRhr, 'bpm', rhrVals, 'var(--teal)', connectedSource, 'var(--teal)')}
          ${trendCard('HRV', latestHrv, 'ms', hrvVals, 'var(--blue)', connectedSource, 'var(--blue)')}
          ${trendCard('Sleep', latestSleep, 'hrs', sleepVals, 'var(--violet)', connectedSource, 'var(--violet)')}
          ${trendCard('Steps', latestSteps, '/day', stepsVals, 'var(--green)', connectedSource, 'var(--green)')}
          ${trendCard('SpO\u2082', latestSpo2, '%', spo2Vals, 'var(--blue)', connectedSource, 'var(--blue)')}
          ${latestMood != null ? trendCard('Mood', latestMood, '/10', [], 'var(--amber)', 'Wellness check-in', 'var(--amber)') : ''}
        </div>
        <div class="notice notice-info" style="font-size:11.5px;margin-top:12px">
          ◎ &nbsp;Data is informational only. For medical decisions, always consult your clinician.
        </div>`
    }
  </div>

  <!-- Section 3: AI Copilot -->
  <div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">◈ Ask About My Health Data</div>
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px">AI-powered insights about your wearable data</div>
      </div>
    </div>
    <div class="notice notice-warn" style="font-size:12px;margin-bottom:14px">
      AI responses are informational only. Your clinician is your primary medical contact.
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-body" style="padding:14px 16px">
        <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Quick Questions</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <button class="btn btn-sm" onclick="window._wearablePrompt('How did my sleep change this week?')">How did my sleep change this week?</button>
          <button class="btn btn-sm" onclick="window._wearablePrompt('Show my heart rate before my last sessions')">Heart rate before sessions</button>
          <button class="btn btn-sm" onclick="window._wearablePrompt('What changed since I started treatment?')">What changed since I started treatment?</button>
          <button class="btn btn-sm" onclick="window._wearablePrompt('How consistent has my sleep been?')">How consistent has my sleep been?</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-body" style="padding:14px 16px">
        <div id="wearable-chat-history" style="min-height:80px;max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;margin-bottom:14px"></div>
        <div style="display:flex;gap:8px;align-items:flex-end">
          <textarea id="wearable-chat-input" placeholder="Ask about your health data…" rows="2"
            style="flex:1;resize:none;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-primary);font-family:var(--font-body);line-height:1.5"
            onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._wearableSend();}"></textarea>
          <button class="btn btn-primary btn-sm" onclick="window._wearableSend()" style="flex-shrink:0;padding:10px 16px">Send ◈</button>
        </div>
      </div>
    </div>
  </div>`;

  // ── Chat logic ────────────────────────────────────────────────────────────
  function buildContext() {
    if (!hasSummaryData) return 'No wearable data available.';
    const lines = [`7-day wearable summary (${summaries.length} days):`];
    if (latestRhr != null)   lines.push(`Resting HR: ${latestRhr} bpm (7-day trend: ${rhrVals.join(', ')})`);
    if (latestHrv != null)   lines.push(`HRV: ${latestHrv} ms (7-day trend: ${hrvVals.join(', ')})`);
    if (latestSleep != null) lines.push(`Sleep duration: ${latestSleep} hrs (7-day trend: ${sleepVals.join(', ')})`);
    if (latestSteps != null) lines.push(`Steps: ${latestSteps}/day (7-day trend: ${stepsVals.join(', ')})`);
    if (latestSpo2 != null)  lines.push(`SpO2: ${latestSpo2}%`);
    if (latestMood != null)  lines.push(`Latest mood check-in: ${latestMood}/10`);
    return lines.join('\n');
  }

  function renderChatHistory() {
    const histEl = document.getElementById('wearable-chat-history');
    if (!histEl) return;
    if (wearableChatMessages.length === 0) {
      histEl.innerHTML = `<div style="text-align:center;padding:24px 0;color:var(--text-tertiary);font-size:12.5px">
        Ask me anything about your health data above.
      </div>`;
      return;
    }
    const visible = wearableChatMessages.slice(-6);
    histEl.innerHTML = visible.map(m => {
      const isUser = m.role === 'user';
      return `<div style="display:flex;${isUser ? 'justify-content:flex-end' : 'justify-content:flex-start'}">
        <div style="max-width:78%;padding:10px 13px;border-radius:${isUser ? '12px 12px 3px 12px' : '12px 12px 12px 3px'};
          background:${isUser ? 'rgba(0,212,188,0.12)' : 'var(--bg-card)'};
          border:1px solid ${isUser ? 'rgba(0,212,188,0.25)' : 'var(--border)'};
          font-size:12.5px;color:var(--text-primary);line-height:1.55;white-space:pre-wrap">
          ${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          ${!isUser ? `<div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;border-top:1px solid var(--border);padding-top:5px">AI-generated — verify with your clinician</div>` : ''}
        </div>
      </div>`;
    }).join('');
    histEl.scrollTop = histEl.scrollHeight;
  }

  function showTyping() {
    const histEl = document.getElementById('wearable-chat-history');
    if (!histEl) return;
    const typingEl = document.createElement('div');
    typingEl.id = 'wearable-typing';
    typingEl.style.cssText = 'display:flex;justify-content:flex-start';
    typingEl.innerHTML = `<div style="padding:10px 13px;border-radius:12px 12px 12px 3px;background:var(--bg-card);border:1px solid var(--border);display:flex;gap:4px;align-items:center">
      ${[0,1,2].map(i => `<span style="width:5px;height:5px;border-radius:50%;background:var(--teal);display:inline-block;animation:pulseDot 1.2s ${i*0.2}s infinite ease-in-out"></span>`).join('')}
    </div>`;
    histEl.appendChild(typingEl);
    histEl.scrollTop = histEl.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('wearable-typing');
    if (t) t.remove();
  }

  renderChatHistory();

  window._wearablePrompt = function(text) {
    const input = document.getElementById('wearable-chat-input');
    if (input) { input.value = text; input.focus(); }
    window._wearableSend();
  };

  window._wearableSend = async function() {
    const input = document.getElementById('wearable-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;

    wearableChatMessages.push({ role: 'user', content: text });
    renderChatHistory();
    showTyping();

    try {
      const context = buildContext();
      const result  = await api.wearableCopilotPatient(
        wearableChatMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        context
      );
      removeTyping();
      const reply = result?.message || result?.content || result?.reply || 'No response received.';
      wearableChatMessages.push({ role: 'assistant', content: reply });
    } catch (_e) {
      removeTyping();
      wearableChatMessages.push({ role: 'assistant', content: 'Could not reach AI assistant. Please try again.' });
    }

    renderChatHistory();
    input.disabled = false;
    input.focus();
  };

  window._connectWearable = async function(source, action, connectionId) {
    if (action === 'disconnect' && connectionId) {
      if (!confirm(`Disconnect this device? Your data will remain but no new syncs will occur.`)) return;
      try {
        await api.disconnectWearableSource(connectionId);
        await pgPatientWearables();
      } catch (_e) {
        alert('Could not disconnect. Please try again.');
      }
    } else {
      try {
        await api.connectWearableSource({ source });
        await pgPatientWearables();
      } catch (_e) {
        alert('Could not initiate connection. Please try again.');
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTAKE & CONSENT MANAGER  (clinician-side)
// ─────────────────────────────────────────────────────────────────────────────

const INTAKE_FIELD_TYPES = ['text', 'email', 'phone', 'date', 'select', 'checkbox', 'textarea', 'signature'];

const INTAKE_TEMPLATES = [
  {
    id: 'new-patient',
    name: 'New Patient Intake',
    fields: [
      { id: 'np-name',      label: 'Full Name',           type: 'text',      required: true },
      { id: 'np-dob',       label: 'Date of Birth',       type: 'date',      required: true },
      { id: 'np-email',     label: 'Email Address',       type: 'email',     required: true },
      { id: 'np-phone',     label: 'Phone Number',        type: 'phone',     required: true },
      { id: 'np-gender',    label: 'Gender',              type: 'select',    required: false, options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] },
      { id: 'np-referral',  label: 'Referred By',         type: 'text',      required: false },
      { id: 'np-insurance', label: 'Insurance Provider',  type: 'text',      required: false },
      { id: 'np-notes',     label: 'Additional Notes',    type: 'textarea',  required: false },
    ],
  },
  {
    id: 'hipaa-consent',
    name: 'HIPAA Consent',
    fields: [
      { id: 'hc-name',  label: 'Patient Full Name',   type: 'text',      required: true },
      { id: 'hc-dob',   label: 'Date of Birth',       type: 'date',      required: true },
      { id: 'hc-agree', label: 'I have read and agree to the HIPAA Notice of Privacy Practices', type: 'checkbox', required: true },
      { id: 'hc-auth',  label: 'I authorize the use of my health information as described',      type: 'checkbox', required: true },
      { id: 'hc-sig',   label: 'Patient Signature',   type: 'signature', required: true },
    ],
  },
  {
    id: 'treatment-consent',
    name: 'Treatment Consent',
    fields: [
      { id: 'tc-name',      label: 'Patient Full Name',                              type: 'text',      required: true },
      { id: 'tc-treatment', label: 'Treatment / Procedure',                          type: 'text',      required: true },
      { id: 'tc-risks',     label: 'I understand the risks explained to me',          type: 'checkbox',  required: true },
      { id: 'tc-benefits',  label: 'I understand the expected benefits',              type: 'checkbox',  required: true },
      { id: 'tc-withdraw',  label: 'I understand I may withdraw consent at any time', type: 'checkbox',  required: true },
      { id: 'tc-sig',       label: 'Patient Signature',                              type: 'signature', required: true },
    ],
  },
  {
    id: 'symptom-checklist',
    name: 'Symptom Checklist',
    fields: [
      { id: 'sc-headache',   label: 'Headaches',               type: 'checkbox', required: false },
      { id: 'sc-anxiety',    label: 'Anxiety',                 type: 'checkbox', required: false },
      { id: 'sc-depression', label: 'Depression',              type: 'checkbox', required: false },
      { id: 'sc-insomnia',   label: 'Insomnia / Sleep issues', type: 'checkbox', required: false },
      { id: 'sc-fatigue',    label: 'Fatigue',                 type: 'checkbox', required: false },
      { id: 'sc-focus',      label: 'Difficulty concentrating',type: 'checkbox', required: false },
      { id: 'sc-memory',     label: 'Memory problems',         type: 'checkbox', required: false },
      { id: 'sc-mood',       label: 'Mood swings',             type: 'checkbox', required: false },
      { id: 'sc-pain',       label: 'Chronic pain',            type: 'checkbox', required: false },
      { id: 'sc-tinnitus',   label: 'Tinnitus / ringing',      type: 'checkbox', required: false },
    ],
  },
];

// ── LocalStorage helpers ──────────────────────────────────────────────────────
function getIntakeForms() {
  try { return JSON.parse(localStorage.getItem('ds_intake_forms') || '[]'); } catch (_e) { return []; }
}
function saveIntakeForm(form) {
  const forms = getIntakeForms();
  const idx = forms.findIndex(f => f.id === form.id);
  if (idx >= 0) forms[idx] = form; else forms.push(form);
  try { localStorage.setItem('ds_intake_forms', JSON.stringify(forms)); } catch (_e) {}
}
function getIntakeSubmissions() {
  try { return JSON.parse(localStorage.getItem('ds_intake_submissions') || '[]'); } catch (_e) { return []; }
}
function saveIntakeSubmission(sub) {
  const subs = getIntakeSubmissions();
  const idx = subs.findIndex(s => s.id === sub.id);
  if (idx >= 0) subs[idx] = sub; else subs.push(sub);
  try { localStorage.setItem('ds_intake_submissions', JSON.stringify(subs)); } catch (_e) {}
}
function getSubmissionsByPatient(name) {
  return getIntakeSubmissions().filter(s =>
    (s.patientName || '').toLowerCase().includes(name.toLowerCase())
  );
}

// ── Signature canvas renderer ─────────────────────────────────────────────────
function renderSignatureCanvas(fieldId) {
  return `<div class="sig-canvas-wrap" id="sig-wrap-${fieldId}">
    <canvas id="sig-canvas-${fieldId}" width="300" height="120" style="touch-action:none"></canvas>
  </div>
  <div style="margin-top:4px">
    <button type="button" class="btn-secondary" style="font-size:.75rem;padding:3px 10px"
      onclick="window._sigClear('${fieldId}')">Clear</button>
  </div>`;
}

window._sigClear = function(fieldId) {
  const canvas = document.getElementById('sig-canvas-' + fieldId);
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

window._sigGetDataURL = function(fieldId) {
  const canvas = document.getElementById('sig-canvas-' + fieldId);
  return canvas ? canvas.toDataURL('image/png') : '';
};

window._initSignatureCanvas = function(fieldId) {
  const canvas = document.getElementById('sig-canvas-' + fieldId);
  if (!canvas || canvas._sigInit) return;
  canvas._sigInit = true;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let drawing = false;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const s = e.touches ? e.touches[0] : e;
    return { x: s.clientX - r.left, y: s.clientY - r.top };
  }
  function onStart(e) { e.preventDefault(); drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function onMove(e)  { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function onEnd(e)   { e.preventDefault(); drawing = false; }

  canvas.addEventListener('mousedown',  onStart);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onEnd);
  canvas.addEventListener('mouseleave', onEnd);
  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove',  onMove,  { passive: false });
  canvas.addEventListener('touchend',   onEnd,   { passive: false });
};

// ── pgIntake ──────────────────────────────────────────────────────────────────
export async function pgIntake(setTopbarFn) {
  setTopbarFn('Patient Intake & Consent',
    '<button class="btn-primary" style="font-size:.8rem;padding:5px 14px" onclick="window._nav(\'patients\')">&#8592; Patients</button>'
  );

  const el = document.getElementById('content');
  if (!el) return;

  let activeTab = 'builder';
  let editorForm = { id: '', name: '', fields: [] };
  let activeFormId = null;
  let consentFilter = 'all';

  function uid() { return 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function ftLabel(type) {
    return { text:'Text', email:'Email', phone:'Phone', date:'Date', select:'Select',
             checkbox:'Checkbox', textarea:'Textarea', signature:'Signature' }[type] || type;
  }

  function statusBadge(signed) {
    return signed
      ? '<span style="background:rgba(0,188,188,.15);color:var(--teal);padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600">Signed</span>'
      : '<span style="background:rgba(245,158,11,.15);color:#d97706;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600">Unsigned</span>';
  }

  function renderTabBar() {
    return [['builder','Form Builder'],['submissions','Submissions'],['consent','Consent Tracker']].map(([id, label]) =>
      '<button class="tab-btn ' + (activeTab === id ? 'active' : '') + '" onclick="window._intakeTab(\'' + id + '\')">' + label + '</button>'
    ).join('');
  }

  function renderFieldRow(field) {
    const lbl = field.label.replace(/"/g, '&quot;');
    const req = field.required ? 'checked' : '';
    return '<div class="intake-field-row" id="field-row-' + field.id + '">'
      + '<input type="text" value="' + lbl + '" placeholder="Field label"'
      + ' style="padding:5px 8px;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.85rem"'
      + ' onchange="window._updateIntakeFieldLabel(\'' + field.id + '\', this.value)">'
      + '<select style="padding:4px 6px;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.82rem"'
      + ' onchange="window._updateIntakeFieldType(\'' + field.id + '\', this.value)">'
      + INTAKE_FIELD_TYPES.map(t => '<option value="' + t + '"' + (field.type === t ? ' selected' : '') + '>' + ftLabel(t) + '</option>').join('')
      + '</select>'
      + '<label style="display:flex;align-items:center;gap:4px;font-size:.8rem;cursor:pointer;white-space:nowrap">'
      + '<input type="checkbox" ' + req + ' onchange="window._updateIntakeFieldReq(\'' + field.id + '\', this.checked)"> Req'
      + '</label>'
      + '<button class="btn-ghost" style="padding:2px 6px;color:var(--red);font-size:.9rem"'
      + ' onclick="window._removeIntakeField(\'' + field.id + '\')" title="Remove">&times;</button>'
      + '</div>';
  }

  function allForms() {
    const saved = getIntakeForms();
    const savedIds = new Set(saved.map(f => f.id));
    return [...saved, ...INTAKE_TEMPLATES.filter(t => !savedIds.has(t.id))];
  }

  function renderFormList() {
    const forms = allForms();
    if (!forms.length) return '<p style="padding:12px;color:var(--text-muted);font-size:.85rem">No forms yet.</p>';
    return '<ul class="intake-form-list">'
      + forms.map(f => {
          const isTemplate = INTAKE_TEMPLATES.some(t => t.id === f.id) && !getIntakeForms().find(s => s.id === f.id);
          const active = f.id === activeFormId ? ' active' : '';
          return '<li class="intake-form-item' + active + '" onclick="window._loadIntakeTemplate(\'' + f.id + '\')">'
            + '<span style="font-size:.88rem">' + f.name + '</span>'
            + (isTemplate ? '<span style="font-size:.7rem;padding:1px 6px;border-radius:10px;background:rgba(0,188,188,.12);color:var(--teal)">template</span>' : '')
            + '</li>';
        }).join('')
      + '</ul>';
  }

  function renderEditor() {
    const nameVal = editorForm.name.replace(/"/g, '&quot;');
    const isNew = !editorForm.id;
    return '<div style="padding:20px">'
      + '<div style="margin-bottom:16px;display:flex;gap:10px;align-items:center">'
      + '<input id="intake-form-name" type="text" value="' + nameVal + '" placeholder="Form name&hellip;"'
      + ' style="flex:1;padding:8px 12px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:.95rem"'
      + ' oninput="window._intakeFormNameChange(this.value)">'
      + '</div>'
      + '<div id="intake-field-list">'
      + (editorForm.fields.length
          ? editorForm.fields.map(f => renderFieldRow(f)).join('')
          : '<p style="color:var(--text-muted);font-size:.85rem;padding:8px 0">No fields yet. Add one below.</p>')
      + '</div>'
      + '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<select id="intake-add-type" style="padding:6px 10px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:.85rem">'
      + INTAKE_FIELD_TYPES.map(t => '<option value="' + t + '">' + ftLabel(t) + '</option>').join('')
      + '</select>'
      + '<button class="btn-secondary" style="font-size:.82rem" onclick="window._addIntakeField(document.getElementById(\'intake-add-type\').value)">+ Add Field</button>'
      + '</div>'
      + '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">'
      + '<button class="btn-primary" onclick="window._saveIntakeForm()">Save Form</button>'
      + '<button class="btn-secondary" onclick="window._sendIntakeForm(\'' + (editorForm.id || '') + '\')">Send to Patient</button>'
      + (!isNew ? '<button class="btn-ghost" style="color:var(--red);margin-left:auto" onclick="window._deleteIntakeForm(\'' + editorForm.id + '\')">Delete Form</button>' : '')
      + '</div>'
      + '</div>';
  }

  function renderBuilderTab() {
    const showEditor = editorForm.fields.length > 0 || editorForm.name;
    return '<div style="display:grid;grid-template-columns:240px 1fr;gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;min-height:480px">'
      + '<div style="border-right:1px solid var(--border);background:var(--card-bg)">'
      + '<div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">'
      + '<span style="font-weight:600;font-size:.85rem">Forms</span>'
      + '<button class="btn-secondary" style="font-size:.75rem;padding:3px 9px" onclick="window._intakeNewForm()">+ New</button>'
      + '</div>'
      + renderFormList()
      + '</div>'
      + '<div style="background:var(--card-bg)">'
      + (showEditor
          ? renderEditor()
          : '<div style="padding:48px;text-align:center;color:var(--text-muted)"><div style="font-size:2rem;margin-bottom:12px">&#128203;</div><p>Select a form or create a new one.</p></div>')
      + '</div>'
      + '</div>';
  }

  function renderSubmissionsTab(query) {
    query = query || '';
    const subs = query ? getSubmissionsByPatient(query) : getIntakeSubmissions();
    const rows = subs.map(s => {
      const detailPairs = Object.entries(s.data || {}).map(([k, v]) => {
        const display = (v && typeof v === 'string' && v.startsWith('data:image'))
          ? '<img src="' + v + '" style="height:36px;border:1px solid #ddd;border-radius:3px;vertical-align:middle">'
          : (v === true || v === 'true' ? '&#10003;' : (v || '&mdash;'));
        return '<dt>' + k + ':</dt><dd>' + display + '</dd>';
      }).join('');
      return '<tr id="sub-row-' + s.id + '" style="border-bottom:1px solid var(--border)">'
        + '<td style="padding:10px;font-size:.875rem">' + (s.patientName || '&mdash;') + '</td>'
        + '<td style="padding:10px;font-size:.875rem">' + (s.formName || '&mdash;') + '</td>'
        + '<td style="padding:10px;font-size:.8rem;color:var(--text-muted)">' + (s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '&mdash;') + '</td>'
        + '<td style="padding:10px">' + statusBadge(s.signed) + '</td>'
        + '<td style="padding:10px;display:flex;gap:8px">'
        + '<button class="btn-secondary" style="font-size:.75rem;padding:3px 10px" onclick="window._viewSubmission(\'' + s.id + '\')">View</button>'
        + '<button class="btn-ghost" style="font-size:.75rem;padding:3px 10px" onclick="window._printSubmission(\'' + s.id + '\')">Print</button>'
        + '</td></tr>'
        + '<tr id="sub-detail-' + s.id + '" style="display:none"><td colspan="5">'
        + '<div class="submission-detail">' + detailPairs + '</div>'
        + '</td></tr>';
    }).join('');

    return '<div>'
      + '<div style="margin-bottom:16px;max-width:300px">'
      + '<input type="text" id="sub-search" placeholder="Search by patient name&hellip;" value="' + query.replace(/"/g, '&quot;') + '"'
      + ' style="width:100%;padding:7px 12px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:.875rem"'
      + ' oninput="window._filterSubmissions(this.value)">'
      + '</div>'
      + (subs.length === 0 ? '<p style="color:var(--text-muted);padding:24px 0">No submissions found.</p>' : '')
      + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
      + '<thead><tr style="font-size:.75rem;text-transform:uppercase;color:var(--text-muted)">'
      + ['Patient','Form','Submitted','Signed','Actions'].map(h =>
          '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border)">' + h + '</th>'
        ).join('')
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div id="print-intake-target" class="print-intake-submission" style="display:none"></div>'
      + '</div>';
  }

  function renderConsentTab(filter) {
    filter = filter || 'all';
    const allSubs = getIntakeSubmissions();
    const consentSubs = allSubs.filter(s =>
      ['hipaa-consent', 'treatment-consent'].includes(s.formId) ||
      (s.formName || '').toLowerCase().includes('consent')
    );
    const filtered = filter === 'all'     ? consentSubs
      : filter === 'signed'  ? consentSubs.filter(s => s.signed && !s.revoked)
      : filter === 'pending' ? consentSubs.filter(s => !s.signed && !s.revoked)
      : filter === 'revoked' ? consentSubs.filter(s => s.revoked)
      : consentSubs;

    const activeCnt = consentSubs.filter(s => s.signed && !s.revoked).length;
    const totalPts  = new Set(consentSubs.map(s => s.patientName)).size;

    const filterBtns = ['all','signed','pending','revoked'].map(f => {
      const active = consentFilter === f;
      return '<button class="btn-secondary" style="font-size:.78rem;padding:4px 12px'
        + (active ? ';background:var(--teal);color:white;border-color:var(--teal)' : '') + '"'
        + ' onclick="window._filterConsent(\'' + f + '\')">' + f.charAt(0).toUpperCase() + f.slice(1) + '</button>';
    }).join('');

    const cards = filtered.map(s => {
      const sigVal = s.data ? Object.values(s.data).find(v => typeof v === 'string' && v.startsWith('data:image')) : null;
      return '<div class="consent-card">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
        + '<div><div style="font-weight:600;font-size:.9rem">' + (s.patientName || 'Unknown') + '</div>'
        + '<div style="font-size:.78rem;color:var(--text-muted);margin-top:2px">' + (s.formName || '&mdash;') + '</div></div>'
        + statusBadge(s.signed) + '</div>'
        + '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px">'
        + (s.revoked ? '<span style="color:var(--red)">Revoked</span>' : (s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : 'Date unknown'))
        + '</div>'
        + (sigVal
            ? '<img src="' + sigVal + '" class="sig-thumb" alt="Signature preview">'
            : '<div style="height:48px;border:1px solid var(--border);border-radius:4px;background:var(--hover-bg);display:flex;align-items:center;justify-content:center;font-size:.75rem;color:var(--text-muted)">No signature</div>')
        + '<div style="margin-top:12px">'
        + (!s.revoked
            ? '<button class="btn-ghost" style="font-size:.75rem;padding:3px 10px;color:var(--red)" onclick="window._revokeConsent(\'' + s.id + '\')">Revoke</button>'
            : '<span style="font-size:.75rem;color:var(--text-muted)">Revoked</span>')
        + '</div></div>';
    }).join('');

    return '<div>'
      + '<div style="margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      + '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:10px 18px;font-size:.875rem">'
      + '<span style="color:var(--teal);font-weight:700;font-size:1.2rem">' + activeCnt + '</span>'
      + '<span style="color:var(--text-muted)"> of </span>'
      + '<span style="font-weight:600">' + totalPts + '</span>'
      + '<span style="color:var(--text-muted)"> patients have active consent on file</span>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + filterBtns + '</div>'
      + '</div>'
      + (filtered.length === 0 ? '<p style="color:var(--text-muted);padding:24px 0">No consent records match this filter.</p>' : '')
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">' + cards + '</div>'
      + '</div>';
  }

  function fullRender() {
    el.innerHTML = '<div style="max-width:1100px;margin:0 auto;padding:24px">'
      + '<div class="tab-bar" style="margin-bottom:20px" id="intake-tabbar">' + renderTabBar() + '</div>'
      + '<div id="intake-tab-content">' + tabContent() + '</div>'
      + '</div>';
  }

  function tabContent() {
    if (activeTab === 'builder')     return renderBuilderTab();
    if (activeTab === 'submissions') return renderSubmissionsTab();
    if (activeTab === 'consent')     return renderConsentTab(consentFilter);
    return '';
  }

  function refreshContent() {
    const tc = document.getElementById('intake-tab-content');
    const tb = document.getElementById('intake-tabbar');
    if (!tc) { fullRender(); return; }
    if (tb) tb.innerHTML = renderTabBar();
    tc.innerHTML = tabContent();
  }

  function showToast(msg, color) {
    color = color || 'var(--teal)';
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:' + color + ';color:white;padding:10px 20px;border-radius:8px;font-size:.875rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.25);pointer-events:none';
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2800);
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  window._intakeTab = function(tab) {
    activeTab = tab;
    refreshContent();
  };

  window._intakeNewForm = function() {
    activeFormId = null;
    editorForm = { id: '', name: '', fields: [] };
    refreshContent();
  };

  window._intakeFormNameChange = function(val) {
    editorForm.name = val;
  };

  window._loadIntakeTemplate = function(id) {
    activeFormId = id;
    const saved = getIntakeForms().find(f => f.id === id);
    if (saved) {
      editorForm = JSON.parse(JSON.stringify(saved));
    } else {
      const tmpl = INTAKE_TEMPLATES.find(t => t.id === id);
      if (tmpl) editorForm = JSON.parse(JSON.stringify(tmpl));
    }
    refreshContent();
  };

  window._addIntakeField = function(type) {
    const newField = { id: uid(), label: ftLabel(type) + ' field', type: type, required: false };
    if (type === 'select') newField.options = ['Option 1', 'Option 2'];
    editorForm.fields.push(newField);
    const listEl = document.getElementById('intake-field-list');
    if (listEl) {
      const emptyMsg = listEl.querySelector('p');
      if (emptyMsg) emptyMsg.remove();
      listEl.insertAdjacentHTML('beforeend', renderFieldRow(newField));
    }
  };

  window._removeIntakeField = function(fieldId) {
    editorForm.fields = editorForm.fields.filter(function(f) { return f.id !== fieldId; });
    const row = document.getElementById('field-row-' + fieldId);
    if (row) row.remove();
    if (!editorForm.fields.length) {
      const listEl = document.getElementById('intake-field-list');
      if (listEl) listEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:8px 0">No fields yet. Add one below.</p>';
    }
  };

  window._updateIntakeFieldLabel = function(fieldId, val) {
    const f = editorForm.fields.find(function(x) { return x.id === fieldId; });
    if (f) f.label = val;
  };

  window._updateIntakeFieldType = function(fieldId, val) {
    const f = editorForm.fields.find(function(x) { return x.id === fieldId; });
    if (f) { f.type = val; if (val === 'select' && !f.options) f.options = ['Option 1', 'Option 2']; }
  };

  window._updateIntakeFieldReq = function(fieldId, val) {
    const f = editorForm.fields.find(function(x) { return x.id === fieldId; });
    if (f) f.required = val;
  };

  window._saveIntakeForm = function() {
    const nameInput = document.getElementById('intake-form-name');
    if (nameInput) editorForm.name = nameInput.value.trim();
    if (!editorForm.name) { showToast('Please enter a form name.', '#ef4444'); return; }
    if (!editorForm.id) editorForm.id = 'form-' + Date.now().toString(36);
    if (!editorForm.createdAt) editorForm.createdAt = new Date().toISOString();
    saveIntakeForm(JSON.parse(JSON.stringify(editorForm)));
    activeFormId = editorForm.id;
    showToast('Form saved!');
    refreshContent();
  };

  window._sendIntakeForm = function(formId) {
    const id = formId || editorForm.id;
    const forms = allForms();
    const form = forms.find(function(f) { return f.id === id; });
    const name = form ? form.name : 'this form';
    const mockLink = 'https://intake.deepsynaps.com/f/' + (id || 'preview');
    try { navigator.clipboard.writeText(mockLink).catch(function() {}); } catch (_e) {}
    showToast('Link copied! Patient can complete "' + name + '" at: ' + mockLink);
  };

  window._deleteIntakeForm = function(id) {
    if (!confirm('Delete this form?')) return;
    const forms = getIntakeForms().filter(function(f) { return f.id !== id; });
    try { localStorage.setItem('ds_intake_forms', JSON.stringify(forms)); } catch (_e) {}
    editorForm = { id: '', name: '', fields: [] };
    activeFormId = null;
    showToast('Form deleted.', '#6b7280');
    refreshContent();
  };

  window._viewSubmission = function(id) {
    const detailRow = document.getElementById('sub-detail-' + id);
    if (!detailRow) return;
    detailRow.style.display = detailRow.style.display === 'none' ? 'table-row' : 'none';
  };

  window._printSubmission = function(id) {
    const sub = getIntakeSubmissions().find(function(s) { return s.id === id; });
    if (!sub) return;
    const target = document.getElementById('print-intake-target');
    if (!target) return;
    const pairs = Object.entries(sub.data || {}).map(function(e) {
      const val = (e[1] && typeof e[1] === 'string' && e[1].startsWith('data:image'))
        ? '<img src="' + e[1] + '" style="height:48px;border:1px solid #ddd">'
        : (e[1] === true || e[1] === 'true' ? 'Yes' : (e[1] || '&mdash;'));
      return '<div style="margin-bottom:10px"><dt style="font-weight:600;font-size:.85rem;color:#444">' + e[0] + '</dt><dd style="margin:3px 0 0 0;font-size:.9rem">' + val + '</dd></div>';
    }).join('');
    target.style.display = 'block';
    target.innerHTML = '<div style="font-family:serif;padding:32px;max-width:700px;margin:0 auto">'
      + '<h2 style="margin-bottom:4px">' + (sub.formName || 'Intake Form') + '</h2>'
      + '<p style="color:#555;font-size:.875rem;margin-bottom:16px">Patient: ' + (sub.patientName || '&mdash;') + ' &nbsp;|&nbsp; Submitted: ' + (sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '&mdash;') + ' &nbsp;|&nbsp; Signed: ' + (sub.signed ? 'Yes' : 'No') + '</p>'
      + '<hr style="margin-bottom:16px"><dl>' + pairs + '</dl></div>';
    window.print();
    setTimeout(function() { target.style.display = 'none'; target.innerHTML = ''; }, 1000);
  };

  window._revokeConsent = function(id) {
    if (!confirm('Revoke consent for this record?')) return;
    const subs = getIntakeSubmissions();
    const sub = subs.find(function(s) { return s.id === id; });
    if (sub) {
      sub.revoked = true;
      try { localStorage.setItem('ds_intake_submissions', JSON.stringify(subs)); } catch (_e) {}
    }
    showToast('Consent revoked.', '#d97706');
    refreshContent();
  };

  window._filterConsent = function(status) {
    consentFilter = status;
    refreshContent();
  };

  window._filterSubmissions = function(q) {
    const tc = document.getElementById('intake-tab-content');
    if (tc) tc.innerHTML = renderSubmissionsTab(q);
  };

  // Initial render
  fullRender();
}
