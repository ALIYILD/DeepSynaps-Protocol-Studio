// Patient portal pages — simpler, calmer UI than the professional app
// All pages render into #patient-content
import { api } from './api.js';
import { currentUser } from './auth.js';

// ── Nav definition ────────────────────────────────────────────────────────────
const PATIENT_NAV = [
  { id: 'patient-portal',       label: 'My Dashboard',        icon: '◈' },
  { id: 'patient-sessions',     label: 'Sessions',             icon: '◧' },
  { id: 'patient-course',       label: 'Treatment Plan',       icon: '◎' },
  { id: 'patient-assessments',  label: 'Assessments',          icon: '◉' },
  { id: 'patient-reports',      label: 'Documents & Reports',  icon: '◱' },
  { id: 'patient-messages',     label: 'Secure Messages',      icon: '◫' },
  { id: 'patient-wearables',    label: 'Wearables',            icon: '◌' },
  { id: 'pt-wellness',          label: 'Daily Check-in',       icon: '💚' },
  { id: 'pt-learn',             label: 'Learn & Resources',    icon: '📚' },
  { id: 'patient-profile',      label: 'Profile & Settings',   icon: '◇' },
];

// Bottom nav: 5 key items for mobile
const PATIENT_BOTTOM_NAV = [
  { id: 'patient-portal',    label: 'Home',      icon: '◈' },
  { id: 'patient-sessions',  label: 'Sessions',  icon: '◧' },
  { id: 'pt-wellness',       label: 'Check-in',  icon: '💚' },
  { id: 'patient-messages',  label: 'Messages',  icon: '◫' },
  { id: 'patient-profile',   label: 'Profile',   icon: '◇' },
  { id: 'pt-journal',        label: 'Journal',   icon: '📔' },
  { id: 'pt-notifications',  label: 'Alerts',    icon: '🔔' },
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

export function setTopbar(title, html = '') {
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

// ── Dashboard ─────────────────────────────────────────────────────────────────────────────
export async function pgPatientDashboard(user) {
  setTopbar('My Dashboard');
  const firstName = (user?.display_name || 'there').split(' ')[0];

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  const [portalSessions, portalCourses, portalOutcomes] = await Promise.all([
    api.patientPortalSessions().catch(() => null),
    api.patientPortalCourses().catch(() => null),
    api.patientPortalOutcomes().catch(() => null),
  ]);

  const sessions = Array.isArray(portalSessions) ? portalSessions : [];
  const outcomes = Array.isArray(portalOutcomes) ? portalOutcomes : [];

  // Resolve active course
  const coursesArr   = Array.isArray(portalCourses) ? portalCourses : [];
  const activeCourse = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  // Session metrics
  const totalPlanned  = activeCourse?.total_sessions_planned ?? null;
  const sessDelivered = activeCourse?.session_count ?? sessions.length;
  const progressPct   = (totalPlanned && sessDelivered) ? Math.round((sessDelivered / totalPlanned) * 100) : null;

  // Next upcoming session
  const now = Date.now();
  const upcomingFromSessions = sessions.filter(s => s.scheduled_at && new Date(s.scheduled_at).getTime() > now);
  upcomingFromSessions.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const nextSess  = upcomingFromSessions[0] || null;
  const nextLabel = nextSess
    ? new Date(nextSess.scheduled_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;
  const nextTime  = nextSess
    ? new Date(nextSess.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  // Daily check-in state
  const todayStr       = new Date().toISOString().slice(0, 10);
  const checkedInToday = localStorage.getItem('ds_last_checkin') === todayStr;

  // Tasks due
  const tasks = [];
  if (!checkedInToday) tasks.push({ label: 'Complete your daily check-in', link: 'pt-wellness' });
  const taskCount = tasks.length;

  // Latest outcome / document
  const sortedOutcomes = outcomes.slice().sort((a, b) =>
    new Date(b.administered_at || 0) - new Date(a.administered_at || 0));
  const latestDoc = sortedOutcomes[0] || null;

  // Treatment phase + plain-language helpers (defined as named functions to avoid lint warnings)
  function phaseLabel(pct) {
    if (!pct)       return 'Starting';
    if (pct <= 25)  return 'Initial Phase';
    if (pct <= 50)  return 'Active Phase';
    if (pct <= 75)  return 'Consolidation';
    if (pct < 100)  return 'Final Phase';
    return 'Complete';
  }
  function plainLang(pct) {
    if (!pct)
      return "Your treatment plan has been set up. Your first session will begin your programme.";
    if (pct <= 25)
      return "You\'re in the early phase. It\'s normal not to notice changes yet — your brain is starting to respond. Consistent attendance matters most now.";
    if (pct <= 50)
      return "You\'re making solid progress. Many patients begin noticing early changes in this phase. Keep attending sessions and tracking your daily check-ins.";
    if (pct <= 75)
      return "You\'re past the halfway point. Your brain is consolidating the training. Continue tracking symptoms and raise any changes with your clinician.";
    if (pct < 100)
      return "You\'re in the final stretch. This phase reinforces the changes made so far. Your clinician may discuss a review or next steps soon.";
    return "You\'ve completed your treatment plan. Your clinician will discuss next steps or a maintenance schedule at your review.";
  }

  // Greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayFmt = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  el.innerHTML = `
    <!-- Header -->
    <div style="margin-bottom:20px">
      <div style="font-family:var(--font-display);font-size:19px;font-weight:600;color:var(--text-primary);margin-bottom:3px">
        ${greeting}, ${firstName}
      </div>
      <div style="font-size:12.5px;color:var(--text-secondary)">${todayFmt}</div>
    </div>

    <!-- 3 Primary Cards -->
    <div class="pt-primary-cards">

      <div class="pt-primary-card ${nextSess ? 'session' : 'muted'}" onclick="window._navPatient('patient-sessions')" style="cursor:pointer" role="button" tabindex="0">
        <div class="pt-pc-eyebrow">Next Session</div>
        ${nextSess
          ? `<div class="pt-pc-main">${nextLabel}</div>
             <div class="pt-pc-detail">${nextTime}${nextSess.modality_slug ? ' · ' + nextSess.modality_slug.toUpperCase() : ''}</div>`
          : `<div class="pt-pc-main pt-pc-main--muted">Not scheduled</div>
             <div class="pt-pc-detail">Contact your clinic</div>`}
        <div class="pt-pc-action">View sessions →</div>
      </div>

      <div class="pt-primary-card plan" onclick="window._navPatient('patient-course')" style="cursor:pointer" role="button" tabindex="0">
        <div class="pt-pc-eyebrow">Treatment Plan</div>
        ${activeCourse
          ? `<div class="pt-pc-main">${activeCourse.condition_slug || 'Active'}</div>
             <div class="pt-pc-detail">${sessDelivered} of ${totalPlanned ?? '?'} sessions${progressPct !== null ? ' · ' + progressPct + '%' : ''}</div>`
          : `<div class="pt-pc-main pt-pc-main--muted">Not assigned</div>
             <div class="pt-pc-detail">Speak with your clinic</div>`}
        <div class="pt-pc-action">View plan →</div>
      </div>

      <div class="pt-primary-card ${taskCount > 0 ? 'tasks' : 'clear'}"
           onclick="window._navPatient('${taskCount > 0 ? tasks[0].link : 'patient-assessments'}')"
           style="cursor:pointer" role="button" tabindex="0">
        <div class="pt-pc-eyebrow">Tasks Due</div>
        ${taskCount > 0
          ? `<div class="pt-pc-main">${taskCount} task${taskCount > 1 ? 's' : ''}</div>
             <div class="pt-pc-detail">${tasks[0].label}</div>`
          : `<div class="pt-pc-main pt-pc-main--clear">All caught up</div>
             <div class="pt-pc-detail">Nothing pending today</div>`}
        <div class="pt-pc-action">${taskCount > 0 ? 'Complete now →' : 'View assessments →'}</div>
      </div>
    </div>

    <!-- Daily Check-in -->
    ${checkedInToday
      ? `<div class="card" style="margin-bottom:20px;border-color:rgba(0,212,188,0.35);background:rgba(0,212,188,0.04)">
          <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:13px 16px">
            <span style="font-size:15px;color:var(--teal)">✓</span>
            <div style="flex:1">
              <span style="font-size:13px;font-weight:500;color:var(--text-primary)">Daily check-in complete</span>
              <span style="font-size:11.5px;color:var(--text-tertiary);margin-left:8px">Your care team can see today's update.</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('pt-wellness')">View →</button>
          </div>
        </div>`
      : `<div class="card" style="margin-bottom:20px" id="pt-dash-checkin-card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>Daily Check-in</h3>
            <span style="font-size:10.5px;font-weight:600;color:var(--amber,#f59e0b);background:rgba(245,158,11,0.1);padding:3px 9px;border-radius:99px;border:1px solid rgba(245,158,11,0.25)">Due today</span>
          </div>
          <div class="card-body" style="padding:16px 20px">
            <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:18px;line-height:1.55">
              Rate how you're doing today. Your care team reviews this daily as part of your treatment monitoring.
            </div>
            <div class="pt-checkin-grid">
              ${[
                { id: 'dc-mood',   label: 'Mood',    color: 'var(--teal)',   low: 'Low',  high: 'Good' },
                { id: 'dc-sleep',  label: 'Sleep',   color: 'var(--blue)',   low: 'Poor', high: 'Good' },
                { id: 'dc-energy', label: 'Energy',  color: 'var(--violet)', low: 'Low',  high: 'High' },
              ].map(s => `
                <div class="pt-checkin-row">
                  <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                    <label style="font-size:12.5px;font-weight:500;color:var(--text-primary)">${s.label}</label>
                    <span id="${s.id}-val" style="font-size:12px;font-weight:600;color:${s.color};min-width:18px;text-align:right">5</span>
                  </div>
                  <input type="range" id="${s.id}" min="1" max="10" value="5"
                         oninput="document.getElementById('${s.id}-val').textContent=this.value"
                         style="width:100%;accent-color:${s.color}">
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-tertiary);margin-top:3px">
                    <span>${s.low}</span><span>${s.high}</span>
                  </div>
                </div>
              `).join('')}
            </div>
            <div style="margin-top:14px">
              <label style="font-size:12.5px;font-weight:500;color:var(--text-primary);display:block;margin-bottom:6px">Side effects today</label>
              <select id="dc-side-effects" class="form-control" style="font-size:12.5px">
                <option value="none">None</option>
                <option value="headache">Headache</option>
                <option value="fatigue">Fatigue / tiredness</option>
                <option value="dizziness">Dizziness or lightheadedness</option>
                <option value="tingling">Tingling or scalp sensation</option>
                <option value="mood_change">Mood change</option>
                <option value="concentration">Difficulty concentrating</option>
                <option value="other">Other (describe in notes)</option>
              </select>
            </div>
            <div style="margin-top:10px">
              <textarea id="dc-notes" class="form-control" rows="2"
                        placeholder="Any notes for your care team… (optional)"
                        style="resize:none;font-size:12.5px"></textarea>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:14px;padding:11px"
                    onclick="window._dashSubmitCheckin()">
              Submit Check-in
            </button>
          </div>
        </div>`}

    <!-- Treatment Progress -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Treatment Progress</h3>
        <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-course')">Full plan →</button>
      </div>
      <div class="card-body" style="padding:16px 20px">
        ${activeCourse
          ? `<div class="pt-progress-rows">
              <div class="pt-progress-row">
                <span class="pt-pr-label">Phase</span>
                <span class="pt-pr-value">${phaseLabel(progressPct)}</span>
              </div>
              <div class="pt-progress-row">
                <span class="pt-pr-label">Sessions completed</span>
                <span class="pt-pr-value">${sessDelivered} of ${totalPlanned ?? '—'}</span>
              </div>
              ${latestDoc ? `
              <div class="pt-progress-row">
                <span class="pt-pr-label">Latest assessment</span>
                <span class="pt-pr-value">${latestDoc.template_title || 'Assessment'} · ${fmtDate(latestDoc.administered_at)}</span>
              </div>` : ''}
              <div class="pt-progress-row">
                <span class="pt-pr-label">Care status</span>
                <span class="pt-pr-value" style="color:var(--teal)">${activeCourse.status === 'active' ? 'Active — attending' : (activeCourse.status || 'Assigned')}</span>
              </div>
            </div>
            <div class="progress-bar" style="height:7px;margin:14px 0 4px">
              <div class="progress-fill" style="width:${progressPct || 0}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-bottom:16px">
              <span>0 sessions</span>
              <span>${totalPlanned ? totalPlanned + ' sessions total' : 'No total set'}</span>
            </div>
            <div class="pt-plain-language">
              <div class="pt-pl-title">What this means</div>
              <div class="pt-pl-body">${plainLang(progressPct)}</div>
              <div class="pt-pl-footer">
                <a href="#" onclick="window._navPatient('pt-learn');return false"
                   style="color:var(--teal);text-decoration:none;font-size:11.5px">Treatment glossary →</a>
                <span style="color:var(--text-tertiary);margin:0 8px">·</span>
                <span style="font-size:11.5px;color:var(--text-tertiary)">Have a question? Note it for your next session.</span>
              </div>
            </div>`
          : `<div style="text-align:center;padding:24px;color:var(--text-tertiary)">
              <div style="font-size:18px;margin-bottom:8px;opacity:.4">◎</div>
              No active treatment course.<br>
              <span style="font-size:12px">Contact your clinic to get started.</span>
            </div>`}
      </div>
    </div>

    <!-- Latest Document -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Latest Document</h3>
        <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-reports')">All documents →</button>
      </div>
      <div class="card-body" style="padding:14px 16px">
        ${latestDoc
          ? `<div style="display:flex;align-items:flex-start;gap:14px">
              <div style="width:40px;height:40px;border-radius:var(--radius-md);background:rgba(74,158,255,0.1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;color:var(--blue)">◱</div>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${latestDoc.template_title || latestDoc.template_id || 'Outcome Report'}</div>
                <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:3px">${fmtDate(latestDoc.administered_at)}${latestDoc.score != null ? ' · Score: ' + latestDoc.score : ''}${latestDoc.measurement_point ? ' · ' + latestDoc.measurement_point : ''}</div>
                <div class="pt-plain-language" style="margin-top:10px">
                  <div class="pt-pl-title">About this report</div>
                  <div class="pt-pl-body">This assessment was completed as part of your routine monitoring. Your clinician uses these scores to track your progress over time.</div>
                  <div class="pt-pl-footer">
                    <span style="font-size:11.5px;color:var(--text-tertiary)">Questions about your results? Bring them up at your next session.</span>
                  </div>
                </div>
              </div>
            </div>`
          : `<div style="text-align:center;padding:24px;color:var(--text-tertiary)">
              <div style="font-size:18px;margin-bottom:8px;opacity:.4">◱</div>
              No reports available yet.<br>
              <span style="font-size:12px">Your care team will add reports after each assessment.</span>
            </div>`}
      </div>
    </div>

    <!-- Secure Messages -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Secure Messages</h3>
        <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Open messages →</button>
      </div>
      <div class="card-body" style="padding:14px 16px">
        <div style="text-align:center;padding:16px 8px;color:var(--text-tertiary)">
          <div style="font-size:18px;margin-bottom:8px;opacity:.4">▫</div>
          <div style="font-size:12.5px;margin-bottom:12px">No new messages from your clinic.</div>
          <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Send a message →</button>
        </div>
        <div class="notice notice-info" style="font-size:11.5px;margin-top:4px">
          If you have a question or concern, message your care team — they aim to respond within 1 business day.
        </div>
      </div>
    </div>
  `;

  // Inline check-in submission from dashboard
  window._dashSubmitCheckin = async function() {
    const moodEl   = document.getElementById('dc-mood');
    const sleepEl  = document.getElementById('dc-sleep');
    const energyEl = document.getElementById('dc-energy');
    const sideEl   = document.getElementById('dc-side-effects');
    const notesEl  = document.getElementById('dc-notes');
    if (!moodEl) return;

    const payload = {
      type:         'wellness_checkin',
      mood:         parseInt(moodEl.value, 10),
      sleep:        parseInt(sleepEl.value, 10),
      energy:       parseInt(energyEl.value, 10),
      side_effects: sideEl?.value || 'none',
      notes:        notesEl?.value?.trim() || '',
      date:         new Date().toISOString(),
    };

    try {
      const uid = user?.patient_id || user?.id;
      if (uid) await api.submitAssessment(uid, payload);
    } catch (_e) { /* non-fatal */ }

    const todayIso = new Date().toISOString().slice(0, 10);
    localStorage.setItem('ds_last_checkin', todayIso);
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const lastDay   = localStorage.getItem('ds_last_checkin_prev');
      const curStreak = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10);
      localStorage.setItem('ds_wellness_streak', String(lastDay === yesterday ? curStreak + 1 : 1));
      localStorage.setItem('ds_last_checkin_prev', todayIso);
    } catch (_e) { /* ignore */ }

    const card = document.getElementById('pt-dash-checkin-card');
    if (card) {
      card.outerHTML = `<div class="card" style="margin-bottom:20px;border-color:rgba(0,212,188,0.35);background:rgba(0,212,188,0.04)">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:13px 16px">
          <span style="font-size:15px;color:var(--teal)">✓</span>
          <div style="flex:1">
            <span style="font-size:13px;font-weight:500;color:var(--text-primary)">Daily check-in complete</span>
            <span style="font-size:11.5px;color:var(--text-tertiary);margin-left:8px">Your care team can see today's update.</span>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="window._navPatient('pt-wellness')">View →</button>
        </div>
      </div>`;
    }
  };
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

// \u2500\u2500 Sessions \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function pgPatientSessions() {
  setTopbar('Sessions');

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  let sessionsRaw, coursesRaw, outcomesRaw;
  try {
    [sessionsRaw, coursesRaw, outcomesRaw] = await Promise.all([
      api.patientPortalSessions().catch(() => null),
      api.patientPortalCourses().catch(() => null),
      api.patientPortalOutcomes().catch(() => null),
    ]);
  } catch (_e) {
    el.innerHTML = `
      <div class="pt-sess-empty" style="margin-top:32px">
        <div class="pt-sess-empty-icon">\u25a7</div>
        <div class="pt-sess-empty-title">Could not load sessions</div>
        <div class="pt-sess-empty-body">Please check your connection and try again.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="window._navPatient('patient-sessions')">Retry \u2192</button>
      </div>`;
    return;
  }

  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const outcomes = Array.isArray(outcomesRaw) ? outcomesRaw : [];
  const coursesArr   = Array.isArray(coursesRaw) ? coursesRaw : [];
  const activeCourse = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  // Split into upcoming (future scheduled_at) and completed (delivered or done)
  const now = Date.now();
  const upcoming = sessions
    .filter(s => s.scheduled_at && new Date(s.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const completed = sessions
    .filter(s => s.delivered_at || ['completed', 'done'].includes((s.status || '').toLowerCase()))
    .sort((a, b) => new Date(b.delivered_at || 0) - new Date(a.delivered_at || 0));

  // Link outcomes to sessions by date
  const outcomesByDate = {};
  outcomes.forEach(o => {
    const d = (o.administered_at || '').slice(0, 10);
    if (d) outcomesByDate[d] = o;
  });

  // Course metrics
  const totalPlanned  = activeCourse?.total_sessions_planned ?? null;
  const sessDelivered = activeCourse?.session_count ?? completed.length;
  const progressPct   = (totalPlanned && sessDelivered)
    ? Math.round((sessDelivered / totalPlanned) * 100) : null;

  function phaseLabel(pct) {
    if (!pct)      return 'Starting';
    if (pct <= 25) return 'Initial Phase';
    if (pct <= 50) return 'Active Phase';
    if (pct <= 75) return 'Consolidation';
    if (pct < 100) return 'Final Phase';
    return 'Complete';
  }

  // Friendly modality name
  function modalityLabel(slug) {
    if (!slug) return null;
    const MAP = {
      tms: 'TMS', tdcs: 'tDCS', neurofeedback: 'Neurofeedback', nfb: 'Neurofeedback',
      pemf: 'PEMF Therapy', biofeedback: 'Biofeedback', hrvb: 'HRV Biofeedback',
      pbm: 'Photobiomodulation', lens: 'LENS Neurofeedback',
    };
    const key = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
    return MAP[key] || (slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '));
  }

  // Tolerance \u2192 patient-friendly
  function toleranceLabel(val) {
    if (!val) return null;
    const v = String(val).toLowerCase().trim();
    if (['excellent','good','1','2'].includes(v))   return 'Tolerated well';
    if (['mild','moderate','3','4','5'].includes(v)) return 'Mild sensation';
    if (['poor','6','7'].includes(v))               return 'Some discomfort noted';
    if (['high','8','9','10'].includes(v))           return 'Significant discomfort';
    // If already a readable string, capitalise and pass through
    return val.charAt(0).toUpperCase() + val.slice(1);
  }

  // Standard preparation content for neuromodulation
  const PREP_STEPS = [
    { icon: '\ud83d\udebf', text: 'Wash your hair the morning of your session. No conditioner, dry shampoo, or hair products.' },
    { icon: '\ud83c\udf7d\ufe0f', text: 'Eat a light meal 1\u20132 hours before. Avoid arriving very hungry or immediately after a large meal.' },
    { icon: '\ud83d\udc8a', text: 'Take your regular medications as prescribed unless your clinician has advised otherwise.' },
    { icon: '\ud83d\ude34', text: 'Aim for a normal night\u2019s sleep before your session. Fatigue can affect how you respond.' },
    { icon: '\ud83d\udcdd', text: 'Jot down any symptoms, changes, or questions since your last session to share with your clinician.' },
    { icon: '\ud83d\udcf5', text: 'Switch your phone to silent during the session.' },
  ];
  const BRING_LIST = [
    'Your current medication list',
    'Comfortable clothing with easy access to your head and neck',
    'A water bottle',
    'Any written questions for your clinician',
    'A light snack for after (some patients feel tired post-session)',
  ];

  // ── Upcoming session card ──────────────────────────────────────────────────────
  function upcomingCardHTML(s, idx) {
    const sessionNum  = s.session_number || (sessDelivered + idx + 1);
    const dateLong    = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString('en-US',
          { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : '\u2014';
    const timeStr     = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
    const daysAway    = s.scheduled_at
      ? Math.max(0, Math.ceil((new Date(s.scheduled_at).getTime() - now) / 86400000)) : null;
    const isToday     = daysAway === 0;
    const isTomorrow  = daysAway === 1;
    const urgency     = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
                      : daysAway !== null ? `In ${daysAway} day${daysAway > 1 ? 's' : ''}` : '';
    const mod         = modalityLabel(s.modality_slug || s.condition_slug);
    const location    = s.location || s.site_name || 'Your clinic';
    const clinician   = s.clinician_name || s.technician_name || null;
    const duration    = s.duration_minutes ? `${s.duration_minutes} min` : null;

    return `
      <div class="pt-upcoming-card ${isToday ? 'today' : isTomorrow ? 'soon' : ''}">

        <div class="pt-uc-header">
          <div class="pt-uc-primary">
            <div class="pt-uc-title">Session ${sessionNum}</div>
            <div class="pt-uc-date">${dateLong}</div>
            <div class="pt-uc-meta-row">
              ${timeStr   ? `<span class="pt-uc-meta-chip">\ud83d\udd50 ${timeStr}</span>` : ''}
              <span class="pt-uc-meta-chip">\ud83d\udccd ${location}</span>
              ${clinician ? `<span class="pt-uc-meta-chip">\ud83d\udc64 ${clinician}</span>` : ''}
              ${mod       ? `<span class="pt-uc-meta-chip pt-uc-meta-mod">${mod}</span>` : ''}
              ${duration  ? `<span class="pt-uc-meta-chip">\ud83d\udd52 ${duration}</span>` : ''}
            </div>
          </div>
          <div class="pt-uc-badges">
            ${urgency ? `<div class="pt-uc-urgency-badge ${isToday ? 'today' : isTomorrow ? 'soon' : ''}">${urgency}</div>` : ''}
            <span class="pill pill-pending" style="font-size:10px;margin-top:4px">Scheduled</span>
          </div>
        </div>

        <div class="pt-uc-prep-toggle"
             onclick="window._ptTogglePrep(${idx})"
             onkeydown="if(event.key==='Enter'||event.key===' '){window._ptTogglePrep(${idx});event.preventDefault();}"
             role="button" tabindex="0" aria-expanded="${idx === 0 ? 'true' : 'false'}" id="pt-prep-btn-${idx}">
          <span style="font-size:13px;font-weight:500;color:var(--text-primary)">How to prepare for this session</span>
          <span id="pt-prep-chev-${idx}" style="font-size:11px;color:var(--text-tertiary);transition:transform 0.2s">${idx === 0 ? '\u25b2' : '\u25be'}</span>
        </div>

        <div id="pt-prep-panel-${idx}" class="pt-uc-prep-panel" style="display:${idx === 0 ? '' : 'none'}">

          <div class="pt-prep-col-wrap">
            <div class="pt-prep-col">
              <div class="pt-prep-col-title">Before your session</div>
              <ul class="pt-prep-list">
                ${PREP_STEPS.map(item => `
                  <li class="pt-prep-item">
                    <span class="pt-prep-ico">${item.icon}</span>
                    <span>${item.text}</span>
                  </li>`).join('')}
              </ul>
            </div>
            <div class="pt-prep-col">
              <div class="pt-prep-col-title">What to bring</div>
              <ul class="pt-prep-list">
                ${BRING_LIST.map(item => `
                  <li class="pt-prep-item">
                    <span class="pt-prep-ico" style="font-size:10px;opacity:.5">\u25cf</span>
                    <span>${item}</span>
                  </li>`).join('')}
              </ul>

              <div class="pt-prep-expect-box">
                <div class="pt-prep-col-title">What to expect</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.65">
                  When you arrive, your clinician will briefly review your symptoms since the last visit.
                  Equipment setup takes 5\u201310 minutes.
                  The session itself lasts ${s.duration_minutes ? s.duration_minutes + '\u00a0min' : 'approximately 20\u201345\u00a0minutes'}.
                  You can pause or stop at any time.
                </div>
              </div>
            </div>
          </div>

          <div class="pt-uc-prep-footer">
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages');event.stopPropagation()">
              Contact clinic \u2192
            </button>
            <span class="pt-uc-reschedule-note">
              To reschedule or cancel, contact your clinic at least 24\u00a0hours in advance.
            </span>
          </div>
        </div>
      </div>
    `;
  }

  // ── Completed session row ──────────────────────────────────────────────────────
  function completedRowHTML(s, idx) {
    const sessionNum = s.session_number || (completed.length - idx);
    const date       = fmtDate(s.delivered_at);
    const dur        = s.duration_minutes ? `${s.duration_minutes} min` : '';
    const mod        = modalityLabel(s.modality_slug || s.condition_slug);
    const tol        = toleranceLabel(s.tolerance_rating);
    const notes      = s.post_session_notes || null;
    const relDate    = (s.delivered_at || '').slice(0, 10);
    const relDoc     = outcomesByDate[relDate] || null;

    const detailItems = [
      tol         ? { label: 'How it went',              val: tol }   : null,
      mod         ? { label: 'Session type',             val: mod }   : null,
      dur         ? { label: 'Duration',                 val: dur }   : null,
      s.device_slug ? { label: 'Equipment',              val: s.device_slug.toUpperCase() } : null,
      notes       ? { label: 'Notes from your clinician', val: notes } : null,
    ].filter(Boolean);

    return `
      <div class="pt-completed-row" onclick="window._ptToggleCompleted(${idx})" tabindex="0" role="button"
           onkeydown="if(event.key==='Enter'||event.key===' '){window._ptToggleCompleted(${idx});event.preventDefault();}">
        <div class="pt-cr-summary">
          <div class="pt-session-icon done" aria-hidden="true">\u2713</div>
          <div class="pt-cr-info">
            <div class="pt-cr-title">Session ${sessionNum}</div>
            <div class="pt-cr-meta">
              ${date}${dur ? '\u00a0\u00b7\u00a0' + dur : ''}${mod ? '\u00a0\u00b7\u00a0' + mod : ''}
            </div>
          </div>
          <div class="pt-cr-badges">
            <span class="pill pill-active" style="font-size:10px">Done</span>
            ${relDoc ? `<span class="pill" style="font-size:10px;background:rgba(74,158,255,0.1);border-color:rgba(74,158,255,0.3);color:var(--blue)">Report</span>` : ''}
            <span id="pt-cr-chev-${idx}" style="font-size:11px;color:var(--text-tertiary);transition:transform 0.2s;flex-shrink:0">\u25be</span>
          </div>
        </div>
        <div id="pt-cr-detail-${idx}" class="pt-cr-detail" style="display:none">
          ${detailItems.length > 0 ? `
            <div class="pt-cr-detail-grid">
              ${detailItems.map(r => `
                <div class="pt-cdr-row">
                  <span class="pt-cdr-label">${r.label}</span>
                  <span class="pt-cdr-value">${r.val}</span>
                </div>`).join('')}
            </div>` : ''}
          ${relDoc ? `
            <div class="pt-cr-report-link"
                 onclick="event.stopPropagation();window._navPatient('patient-reports')"
                 role="button" tabindex="0">
              <span style="color:var(--blue);font-size:14px">\u25f1</span>
              <span style="font-size:12.5px;font-weight:500;color:var(--blue)">${relDoc.template_title || 'Assessment Report'}</span>
              <span style="font-size:11.5px;color:var(--text-tertiary);margin-left:auto">View document \u2192</span>
            </div>` : ''}
          ${!detailItems.length && !relDoc
            ? `<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0">No additional details on file for this session.</div>`
            : ''}
        </div>
      </div>
    `;
  }

  // ── Page HTML ──────────────────────────────────────────────────────────────────
  el.innerHTML = `

    <!-- Course context bar -->
    ${activeCourse ? `
    <div class="pt-course-ctx-bar">
      <div class="pt-ctx-item">
        <div class="pt-ctx-label">Treatment course</div>
        <div class="pt-ctx-value">${activeCourse.condition_slug || 'Active Treatment'}</div>
      </div>
      <div class="pt-ctx-divider"></div>
      <div class="pt-ctx-item">
        <div class="pt-ctx-label">Sessions done</div>
        <div class="pt-ctx-value">${sessDelivered}\u00a0of\u00a0${totalPlanned ?? '?'}</div>
      </div>
      <div class="pt-ctx-divider"></div>
      <div class="pt-ctx-item">
        <div class="pt-ctx-label">Current phase</div>
        <div class="pt-ctx-value">${phaseLabel(progressPct)}</div>
      </div>
      ${progressPct !== null ? `
      <div class="pt-ctx-bar-wrap">
        <div class="pt-ctx-bar-fill" style="width:${progressPct}%"></div>
      </div>` : ''}
    </div>` : ''}

    <!-- Upcoming sessions -->
    <div class="pt-sess-section">
      <div class="pt-sess-section-hd">
        <span class="pt-sess-section-title">Upcoming Sessions</span>
        ${upcoming.length > 0 ? `<span class="pt-sess-badge">${upcoming.length}</span>` : ''}
      </div>

      ${upcoming.length === 0
        ? `<div class="pt-sess-empty">
            <div class="pt-sess-empty-icon">\u25a7</div>
            <div class="pt-sess-empty-title">No upcoming sessions scheduled</div>
            <div class="pt-sess-empty-body">
              Your next session will appear here once your clinic has booked it.
              ${activeCourse ? 'You have an active treatment course \u2014 contact your clinic to schedule your next visit.' : 'Contact your clinic to discuss your treatment plan.'}
            </div>
            <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="window._navPatient('patient-messages')">
              Contact your clinic \u2192
            </button>

            <details class="pt-sess-what-to-expect" style="margin-top:20px">
              <summary class="pt-sess-expect-toggle">What happens at a session?</summary>
              <div class="pt-sess-expect-body">
                <p>When you arrive, your clinician will briefly check in on how you\u2019ve been feeling and review any changes since your last visit.</p>
                <p>Equipment setup typically takes 5\u201310 minutes. The session itself usually lasts 20\u201345 minutes depending on your treatment protocol.</p>
                <p>You are always in control \u2014 you can pause or stop at any time by letting your clinician know.</p>
                <div class="pt-prep-col-title" style="margin-top:14px">What to bring to any session</div>
                <ul class="pt-prep-list">
                  ${BRING_LIST.map(item => `<li class="pt-prep-item"><span class="pt-prep-ico" style="font-size:10px;opacity:.5">\u25cf</span><span>${item}</span></li>`).join('')}
                </ul>
              </div>
            </details>
          </div>`
        : upcoming.map((s, i) => upcomingCardHTML(s, i)).join('')}
    </div>

    <!-- Completed sessions -->
    <div class="pt-sess-section">
      <div class="pt-sess-section-hd">
        <span class="pt-sess-section-title">Completed Sessions</span>
        ${completed.length > 0 ? `<span class="pt-sess-badge">${completed.length}</span>` : ''}
      </div>

      ${completed.length === 0
        ? `<div class="pt-sess-empty" style="padding:28px 20px">
            <div class="pt-sess-empty-icon" style="font-size:22px">\u25a7</div>
            <div class="pt-sess-empty-title">No completed sessions yet</div>
            <div class="pt-sess-empty-body">Your session history will appear here after your first visit.</div>
          </div>`
        : `<div class="card" style="overflow:hidden;padding:0">
            ${completed.map((s, i) => completedRowHTML(s, i)).join('')}
          </div>`}
    </div>
  `;

  // Preparation accordion
  window._ptTogglePrep = function(idx) {
    const panel = document.getElementById(`pt-prep-panel-${idx}`);
    const chev  = document.getElementById(`pt-prep-chev-${idx}`);
    const btn   = document.getElementById(`pt-prep-btn-${idx}`);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : '';
    if (chev) chev.textContent = isOpen ? '\u25be' : '\u25b2';
    if (btn)  btn.setAttribute('aria-expanded', String(!isOpen));
  };

  // Completed session accordion (one open at a time)
  window._ptToggleCompleted = function(idx) {
    const detail = document.getElementById(`pt-cr-detail-${idx}`);
    const chev   = document.getElementById(`pt-cr-chev-${idx}`);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    document.querySelectorAll('[id^="pt-cr-detail-"]').forEach(d => { d.style.display = 'none'; });
    document.querySelectorAll('[id^="pt-cr-chev-"]').forEach(c => { c.style.transform = ''; });
    if (!isOpen) {
      detail.style.display = '';
      if (chev) chev.style.transform = 'rotate(180deg)';
    }
  };
}


// ── My Treatment ──────────────────────────────────────────────────────────────
export async function pgPatientCourse() {
  setTopbar('Treatment Plan');
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

    <div class="card" id="pt-hw-plan-card" style="margin-bottom:20px">
      <div class="card-header"><h3>My Homework Plan</h3></div>
      <div class="card-body" id="pt-hw-plan-body">
        <div style="color:var(--text-tertiary);font-size:13px;padding:8px 0">Loading homework plan…</div>
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

  // ── Assigned homework plan section ──────────────────────────────────────
  (function renderAssignedPlan() {
    const planBody = document.getElementById('pt-hw-plan-body');
    if (!planBody) return;
    const mockPatientId = uid || 'demo-patient';
    let assignments = [];
    try { assignments = JSON.parse(localStorage.getItem('ds_hw_assignments') || '[]'); } catch (_e) {}
    const assignment = assignments.find(function(a) { return a.patientId === mockPatientId; })
      || assignments[assignments.length - 1] || null;

    if (!assignment) {
      planBody.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;padding:4px 0">No homework plan assigned yet. Ask your clinician.</p>';
      return;
    }

    const blocks = (assignment.blocks || []);
    const today = new Date().toISOString().slice(0, 10);
    const compKey = 'ds_hw_completions_' + assignment.id;
    let completions = {};
    try { completions = JSON.parse(localStorage.getItem(compKey) || '{}'); } catch (_e) {}

    // Count completions this week (Mon–Sun)
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // Mon=0
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    const weekDates = Array.from({ length: 7 }, function(_, i) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      return d.toISOString().slice(0, 10);
    });

    function countCompleted() {
      let n = 0;
      blocks.forEach(function(b) {
        weekDates.forEach(function(d) { if (completions[b.id + '_' + d]) n++; });
      });
      return n;
    }
    const totalPossible = blocks.length * 7;
    const completedCount = countCompleted();
    const pctPlan = totalPossible > 0 ? Math.round((completedCount / totalPossible) * 100) : 0;

    window._hwMarkComplete = function(assignmentId, blockId, date) {
      const k = 'ds_hw_completions_' + assignmentId;
      let c = {};
      try { c = JSON.parse(localStorage.getItem(k) || '{}'); } catch (_e) {}
      const key = blockId + '_' + date;
      c[key] = !c[key];
      try { localStorage.setItem(k, JSON.stringify(c)); } catch (_e) {}
      completions = c;
      renderAssignedPlan();
    };

    const freqLabel = { 'daily': 'Daily', '3x-week': '3×/week', '2x-week': '2×/week', 'weekly': 'Weekly', 'once': 'Once' };

    planBody.innerHTML =
      '<div style="margin-bottom:14px">' +
        '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:2px">' + (assignment.planName || 'Assigned Plan') + '</div>' +
        '<div style="font-size:11.5px;color:var(--text-secondary)">' +
          'Assigned ' + (assignment.assignedDate ? new Date(assignment.assignedDate).toLocaleDateString() : '') +
          (assignment.patientName ? ' &nbsp;·&nbsp; ' + assignment.patientName : '') +
        '</div>' +
      '</div>' +
      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:5px">' +
          '<span style="font-size:11.5px;color:var(--text-secondary)">This week\'s progress</span>' +
          '<span style="font-size:11.5px;font-weight:600;color:var(--teal)">' + completedCount + ' / ' + totalPossible + ' tasks</span>' +
        '</div>' +
        '<div class="progress-bar" style="height:6px">' +
          '<div class="progress-fill" style="width:' + pctPlan + '%"></div>' +
        '</div>' +
      '</div>' +
      blocks.map(function(block) {
        const doneToday = !!completions[block.id + '_' + today];
        return '<div class="hw-task-card' + (doneToday ? ' hw-task-complete' : '') + '">' +
          '<div style="font-size:22px;line-height:1;padding-top:2px">' + (block.icon || '📋') + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:500;color:var(--text-primary)">' + block.label + '</div>' +
            (block.instructions ? '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:3px;line-height:1.5">' + block.instructions + '</div>' : '') +
            '<div style="margin-top:6px;display:flex;align-items:center;gap:8px">' +
              '<span class="hw-freq-badge">' + (freqLabel[block.frequency] || block.frequency || '') + '</span>' +
              (block.duration > 0 ? '<span style="font-size:11px;color:var(--text-tertiary)">' + block.duration + ' min</span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding-top:2px">' +
            '<input type="checkbox" ' + (doneToday ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:var(--teal);cursor:pointer"' +
              ' onchange="window._hwMarkComplete(\'' + assignment.id + '\',\'' + block.id + '\',\'' + today + '\')">' +
            '<span style="font-size:9.5px;color:var(--text-tertiary)">today</span>' +
          '</div>' +
        '</div>';
      }).join('');
  })();
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
  setTopbar('Documents & Reports');
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
  setTopbar('Secure Messages');
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

          <div class="card">
            <div class="card-header"><h3>Caregiver Access</h3></div>
            <div class="card-body">
              <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65;margin-bottom:12px">
                Allow a family member or carer to view your treatment progress and sessions on your behalf.
              </div>
              <div class="notice notice-info" style="font-size:11.5px;margin-bottom:12px">
                Caregiver access is set up by your clinic. Contact your care team to grant or update access permissions.
              </div>
              <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">
                Request caregiver access →
              </button>
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
  setTopbar('Daily Check-in');
  const uid = currentUser?.patient_id || currentUser?.id;

  const el = document.getElementById('patient-content');
  const todayStr  = new Date().toISOString().slice(0, 10);
  const todayFmt  = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Daily Check-in</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">${todayFmt}</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;line-height:1.55">
        Your care team reviews your check-ins daily to monitor your progress and catch any concerns early.
      </div>
    </div>

    <div class="card" id="pt-wellness-form-card">
      <div class="card-header"><h3>How are you doing today?</h3></div>
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
            <span>😞 Low</span><span>😐 Okay</span><span>😊 Good</span>
          </div>
        </div>

        <!-- Sleep slider -->
        <div class="wellness-slider-group" style="margin-top:20px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:13px;font-weight:500;color:var(--text-primary)">Sleep last night</label>
            <span id="sleep-val" style="color:var(--blue);font-weight:600">5</span>
          </div>
          <input type="range" id="sleep-slider" min="1" max="10" value="5"
                 oninput="document.getElementById('sleep-val').textContent=this.value;window._updateWellnessEmoji()"
                 style="width:100%;accent-color:var(--blue)">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:4px">
            <span>😴 Poor</span><span>💤 Okay</span><span>🌟 Good</span>
          </div>
        </div>

        <!-- Energy slider -->
        <div class="wellness-slider-group" style="margin-top:20px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:13px;font-weight:500;color:var(--text-primary)">Energy level</label>
            <span id="energy-val" style="color:var(--violet);font-weight:600">5</span>
          </div>
          <input type="range" id="energy-slider" min="1" max="10" value="5"
                 oninput="document.getElementById('energy-val').textContent=this.value;window._updateWellnessEmoji()"
                 style="width:100%;accent-color:var(--violet)">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:4px">
            <span>😩 Low</span><span>⚡ Okay</span><span>🔥 High</span>
          </div>
        </div>

        <!-- Side effects -->
        <div style="margin-top:20px">
          <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:500;color:var(--text-primary)">
            Side effects today
          </label>
          <select id="wellness-side-effects" class="form-control" style="font-size:13px">
            <option value="none">None</option>
            <option value="headache">Headache</option>
            <option value="fatigue">Fatigue / tiredness</option>
            <option value="dizziness">Dizziness or lightheadedness</option>
            <option value="tingling">Tingling or scalp sensation</option>
            <option value="mood_change">Mood change</option>
            <option value="concentration">Difficulty concentrating</option>
            <option value="other">Other (describe in notes)</option>
          </select>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:5px">
            Report any unusual symptoms, however minor. Your clinician reviews this.
          </div>
        </div>

        <!-- Notes -->
        <div style="margin-top:16px">
          <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:500;color:var(--text-primary)">Notes (optional)</label>
          <textarea id="wellness-notes" class="form-control" placeholder="Any observations, symptoms, or questions for your care team…"
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

    const moodVal        = parseInt(moodEl.value, 10);
    const sleepVal       = parseInt(sleepEl.value, 10);
    const energyVal      = parseInt(energyEl.value, 10);
    const sideEffectsVal = document.getElementById('wellness-side-effects')?.value || 'none';
    const notes          = notesEl?.value?.trim() || '';

    try {
      if (uid) {
        await api.submitAssessment(uid, {
          type:         'wellness_checkin',
          mood:         moodVal,
          sleep:        sleepVal,
          energy:       energyVal,
          side_effects: sideEffectsVal,
          notes,
          date:         new Date().toISOString(),
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
    const btn   = document.querySelector('#wearable-chat-input ~ button, button[onclick*="_wearableSend"]');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

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
    if (btn) { btn.disabled = false; btn.textContent = 'Send ◈'; }
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

// ══════════════════════════════════════════════════════════════════════════════
// ── Homework Block Types & Plan Store ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const HW_BLOCK_TYPES = [
  { type: 'breathing',          label: 'Breathing Exercise',   icon: '🫁', defaultDuration: 10, defaultFreq: 'daily' },
  { type: 'mindfulness',        label: 'Mindfulness Practice', icon: '🧘', defaultDuration: 15, defaultFreq: 'daily' },
  { type: 'journaling',         label: 'Journaling Prompt',    icon: '📓', defaultDuration: 20, defaultFreq: '3x-week' },
  { type: 'reading',            label: 'Reading Assignment',   icon: '📖', defaultDuration: 30, defaultFreq: 'weekly' },
  { type: 'exercise',           label: 'Physical Exercise',    icon: '🏃', defaultDuration: 30, defaultFreq: '3x-week' },
  { type: 'sleep-hygiene',      label: 'Sleep Hygiene',        icon: '😴', defaultDuration:  0, defaultFreq: 'daily' },
  { type: 'neurofeedback-home', label: 'Home Neurofeedback',   icon: '🧠', defaultDuration: 20, defaultFreq: '3x-week' },
  { type: 'heart-rate',         label: 'HRV Practice',         icon: '❤️', defaultDuration: 10, defaultFreq: 'daily' },
  { type: 'cognitive',          label: 'Cognitive Exercise',   icon: '🎯', defaultDuration: 15, defaultFreq: '3x-week' },
  { type: 'nutrition',          label: 'Nutrition Task',       icon: '🥗', defaultDuration:  0, defaultFreq: 'daily' },
];

const HW_PLANS_KEY       = 'ds_hw_plans';
const HW_ASSIGNMENTS_KEY = 'ds_hw_assignments';

function _hwSeedPlans() {
  return [
    {
      id: 'seed-adhd',
      name: 'ADHD Focus Protocol',
      condition: 'ADHD',
      weeks: 6,
      createdAt: new Date().toISOString(),
      blocks: [
        { id: 'b1', type: 'breathing',     label: 'Breathing Exercise',   icon: '🫁', instructions: 'Practice 4-7-8 breathing for 10 minutes each morning before screens.',                   duration: 10, frequency: 'daily',    weekStart: 1, weekEnd: 6, order: 0 },
        { id: 'b2', type: 'mindfulness',   label: 'Mindfulness Practice', icon: '🧘', instructions: 'Use a guided focus meditation app for 15 min. Body-scan technique preferred.',           duration: 15, frequency: 'daily',    weekStart: 1, weekEnd: 6, order: 1 },
        { id: 'b3', type: 'cognitive',     label: 'Cognitive Exercise',   icon: '🎯', instructions: 'Complete one working-memory task (e.g., n-back or Lumosity). Track performance.',       duration: 15, frequency: '3x-week', weekStart: 2, weekEnd: 6, order: 2 },
        { id: 'b4', type: 'exercise',      label: 'Physical Exercise',    icon: '🏃', instructions: '30 min aerobic exercise (jogging, cycling, or swimming). Aim for 60-70% max HR.',       duration: 30, frequency: '3x-week', weekStart: 1, weekEnd: 6, order: 3 },
        { id: 'b5', type: 'journaling',    label: 'Journaling Prompt',    icon: '📓', instructions: 'Write 3 priorities for the next day each evening. Note what distracted you today.',    duration: 10, frequency: '3x-week', weekStart: 1, weekEnd: 6, order: 4 },
        { id: 'b6', type: 'sleep-hygiene', label: 'Sleep Hygiene',        icon: '😴', instructions: 'No screens 60 min before bed. Consistent sleep and wake times. Track in sleep diary.', duration:  0, frequency: 'daily',    weekStart: 1, weekEnd: 6, order: 5 },
      ],
    },
    {
      id: 'seed-anxiety',
      name: 'Anxiety Management',
      condition: 'Anxiety',
      weeks: 8,
      createdAt: new Date().toISOString(),
      blocks: [
        { id: 'c1', type: 'breathing',   label: 'Breathing Exercise',   icon: '🫁', instructions: 'Diaphragmatic breathing: 5-second inhale, hold 2 sec, 7-second exhale. 5 rounds.',          duration: 10, frequency: 'daily',    weekStart: 1, weekEnd: 8, order: 0 },
        { id: 'c2', type: 'heart-rate',  label: 'HRV Practice',         icon: '❤️', instructions: 'Use HeartMath or a biofeedback app to practice HRV coherence breathing for 10 min.',        duration: 10, frequency: 'daily',    weekStart: 1, weekEnd: 8, order: 1 },
        { id: 'c3', type: 'mindfulness', label: 'Mindfulness Practice', icon: '🧘', instructions: 'MBSR body scan or loving-kindness meditation. 15 min morning or before anxiety peaks.',     duration: 15, frequency: 'daily',    weekStart: 2, weekEnd: 8, order: 2 },
        { id: 'c4', type: 'journaling',  label: 'Journaling Prompt',    icon: '📓', instructions: 'Write anxiety triggers and cognitive restructuring notes using CBT worksheets.',             duration: 20, frequency: '3x-week', weekStart: 1, weekEnd: 8, order: 3 },
        { id: 'c5', type: 'exercise',    label: 'Physical Exercise',    icon: '🏃', instructions: 'Low-intensity walking 30 min daily. Aim for nature exposure where possible.',               duration: 30, frequency: '3x-week', weekStart: 1, weekEnd: 8, order: 4 },
      ],
    },
  ];
}

function getHWPlans() {
  let plans = [];
  try { plans = JSON.parse(localStorage.getItem(HW_PLANS_KEY) || '[]'); } catch (_e) {}
  if (!plans.length) {
    plans = _hwSeedPlans();
    try { localStorage.setItem(HW_PLANS_KEY, JSON.stringify(plans)); } catch (_e) {}
  }
  return plans;
}

function saveHWPlan(plan) {
  const plans = getHWPlans();
  const idx = plans.findIndex(function(p) { return p.id === plan.id; });
  if (idx >= 0) { plans[idx] = plan; } else { plans.push(plan); }
  try { localStorage.setItem(HW_PLANS_KEY, JSON.stringify(plans)); } catch (_e) {}
}

function deleteHWPlan(id) {
  const plans = getHWPlans().filter(function(p) { return p.id !== id; });
  try { localStorage.setItem(HW_PLANS_KEY, JSON.stringify(plans)); } catch (_e) {}
}

function getHWAssignments() {
  let a = [];
  try { a = JSON.parse(localStorage.getItem(HW_ASSIGNMENTS_KEY) || '[]'); } catch (_e) {}
  return a;
}

function getPatientAssignments(patientId) {
  return getHWAssignments().filter(function(a) { return a.patientId === patientId; });
}

function assignHWPlan(planId, patientId, patientName) {
  const plans = getHWPlans();
  const plan = plans.find(function(p) { return p.id === planId; });
  if (!plan) return null;
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + (plan.weeks || 4) * 7);
  const assignment = {
    id:           'asn-' + Date.now(),
    planId:       planId,
    planName:     plan.name,
    condition:    plan.condition || '',
    weeks:        plan.weeks || 4,
    blocks:       (plan.blocks || []).map(function(b) { return Object.assign({}, b); }),
    patientId:    patientId,
    patientName:  patientName,
    assignedDate: now.toISOString(),
    startDate:    now.toISOString(),
    endDate:      endDate.toISOString(),
    completions:  {},
  };
  const assignments = getHWAssignments();
  assignments.push(assignment);
  try { localStorage.setItem(HW_ASSIGNMENTS_KEY, JSON.stringify(assignments)); } catch (_e) {}
  return assignment;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── pgHomeworkBuilder — Clinician-side builder ────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export async function pgHomeworkBuilder(setTopbarFn) {
  setTopbarFn('Patient Education & Homework Builder',
    '<button class="btn btn-ghost btn-sm" onclick="window._nav(\'patients\')">&#8592; Back to Patients</button>'
  );

  const el = document.getElementById('content');
  if (!el) return;

  // ── in-memory editor state ─────────────────────────────────────────────────
  let _editorPlan = {
    id:        'new-' + Date.now(),
    name:      '',
    condition: '',
    weeks:     4,
    blocks:    [],
    createdAt: new Date().toISOString(),
  };

  // ── render helpers ─────────────────────────────────────────────────────────
  const FREQ_OPTIONS = [
    { value: 'daily',   label: 'Daily' },
    { value: '3x-week', label: '3x/week' },
    { value: '2x-week', label: '2x/week' },
    { value: 'weekly',  label: 'Weekly' },
    { value: 'once',    label: 'Once' },
  ];

  function freqSelect(blockId, current) {
    return '<select class="form-control form-control-sm" style="font-size:11.5px;padding:3px 6px;height:auto" onchange="window._hwBlockField(\'' + blockId + '\',\'frequency\',this.value)">' +
      FREQ_OPTIONS.map(function(o) {
        return '<option value="' + o.value + '"' + (o.value === current ? ' selected' : '') + '>' + o.label + '</option>';
      }).join('') +
    '</select>';
  }

  function renderBlockCard(block, idx) {
    const totalWeeks = _editorPlan.weeks || 4;
    return '<div class="hw-block-card" id="hwblock-' + block.id + '">' +
      '<div class="hw-block-card-header">' +
        '<span style="font-size:20px">' + block.icon + '</span>' +
        '<span style="font-size:13px;font-weight:600;flex:1">' + block.label + '</span>' +
        '<span style="font-size:10.5px;color:var(--text-tertiary);margin-right:6px">Block ' + (idx + 1) + '</span>' +
        '<button class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:11px" onclick="window._hwMoveBlock(' + idx + ',-1)" title="Move up">&#8593;</button>' +
        '<button class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:11px" onclick="window._hwMoveBlock(' + idx + ',1)" title="Move down">&#8595;</button>' +
        '<button class="btn btn-ghost btn-sm" style="padding:2px 7px;font-size:11px;color:var(--red)" onclick="window._hwRemoveBlock(' + idx + ')" title="Remove">&#10005;</button>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">' +
        '<div>' +
          '<label style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:3px">Duration (min, 0=unlimited)</label>' +
          '<input type="number" min="0" max="480" class="form-control form-control-sm" style="font-size:12px;padding:4px 8px;height:auto" value="' + (block.duration || 0) + '" onchange="window._hwBlockField(\'' + block.id + '\',\'duration\',+this.value)">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:3px">Frequency</label>' +
          freqSelect(block.id, block.frequency) +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">' +
        '<div>' +
          '<label style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:3px">Week start</label>' +
          '<input type="number" min="1" max="' + totalWeeks + '" class="form-control form-control-sm" style="font-size:12px;padding:4px 8px;height:auto" value="' + (block.weekStart || 1) + '" onchange="window._hwBlockField(\'' + block.id + '\',\'weekStart\',+this.value)">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:3px">Week end</label>' +
          '<input type="number" min="1" max="' + totalWeeks + '" class="form-control form-control-sm" style="font-size:12px;padding:4px 8px;height:auto" value="' + (block.weekEnd || totalWeeks) + '" onchange="window._hwBlockField(\'' + block.id + '\',\'weekEnd\',+this.value)">' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<label style="font-size:10.5px;color:var(--text-tertiary);display:block;margin-bottom:3px">Instructions for patient</label>' +
        '<textarea class="form-control" rows="2" style="font-size:12px;resize:vertical" placeholder="Describe what the patient should do..." onchange="window._hwBlockField(\'' + block.id + '\',\'instructions\',this.value)">' + (block.instructions || '') + '</textarea>' +
      '</div>' +
    '</div>';
  }

  function renderCanvas() {
    const canvasEl = document.getElementById('hw-canvas-inner');
    if (!canvasEl) return;
    canvasEl.innerHTML =
      '<div style="margin-bottom:16px">' +
        '<label style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:5px">Plan Name</label>' +
        '<input id="hw-plan-name" type="text" class="form-control" placeholder="e.g. ADHD Focus Protocol" style="font-size:15px;font-weight:600" value="' + (_editorPlan.name || '') + '" oninput="window._hwPlanField(\'name\',this.value)">' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
        '<div>' +
          '<label style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:5px">Condition / Tag</label>' +
          '<input id="hw-plan-condition" type="text" class="form-control" placeholder="e.g. ADHD, Anxiety..." style="font-size:13px" value="' + (_editorPlan.condition || '') + '" oninput="window._hwPlanField(\'condition\',this.value)">' +
        '</div>' +
        '<div>' +
          '<label style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;display:block;margin-bottom:5px">Duration (weeks)</label>' +
          '<select id="hw-plan-weeks" class="form-control" style="font-size:13px" onchange="window._hwPlanField(\'weeks\',+this.value)">' +
            [2,4,6,8,12].map(function(w) { return '<option value="' + w + '"' + (w === (_editorPlan.weeks || 4) ? ' selected' : '') + '>' + w + ' weeks</option>'; }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div id="hw-blocks-list">' +
        (_editorPlan.blocks.length === 0
          ? '<div style="padding:40px;text-align:center;color:var(--text-tertiary);border:2px dashed var(--border);border-radius:8px;font-size:13px">Click a block type from the palette to build your homework plan</div>'
          : _editorPlan.blocks.map(renderBlockCard).join('')) +
      '</div>';
  }

  function renderPalettePanel() {
    return '<div class="hw-palette-panel">' +
      '<div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Block Types</div>' +
      HW_BLOCK_TYPES.map(function(bt) {
        return '<div class="hw-block-type-item" onclick="window._hwAddBlock(\'' + bt.type + '\')" title="Add ' + bt.label + '">' +
          '<span>' + bt.icon + '</span><span>' + bt.label + '</span>' +
        '</div>';
      }).join('') +
      '<div style="border-top:1px solid var(--border);margin:12px 0"></div>' +
      '<div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Saved Plans</div>' +
      '<div id="hw-saved-plans-list"></div>' +
      '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px" onclick="window._hwNewPlan()">+ New Plan</button>' +
    '</div>';
  }

  function renderSavedPlansList() {
    const listEl = document.getElementById('hw-saved-plans-list');
    if (!listEl) return;
    const plans = getHWPlans();
    if (!plans.length) {
      listEl.innerHTML = '<div style="font-size:11.5px;color:var(--text-tertiary);padding:6px 0">No saved plans yet.</div>';
      return;
    }
    listEl.innerHTML = plans.map(function(p) {
      return '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">' +
        '<div style="flex:1;font-size:11.5px;padding:6px 8px;border-radius:5px;cursor:pointer;background:var(--hover-bg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="window._hwLoadPlan(\'' + p.id + '\')" title="' + p.name + '">' +
          p.name +
        '</div>' +
        '<button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px;color:var(--red);flex-shrink:0" onclick="window._hwDeletePlan(\'' + p.id + '\')" title="Delete">&#10005;</button>' +
      '</div>';
    }).join('');
  }

  function renderSettingsPanel() {
    return '<div class="hw-settings-panel">' +
      '<div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Plan Actions</div>' +
      '<button class="btn btn-primary" style="width:100%;margin-bottom:10px" onclick="window._hwSavePlan()">Save Plan</button>' +
      '<button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:20px" onclick="window._hwPrintPlan()">Preview / Print</button>' +
      '<div style="border-top:1px solid var(--border);margin-bottom:16px"></div>' +
      '<div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Assign to Patient</div>' +
      '<label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Patient Name</label>' +
      '<input id="hw-assign-patient-name" type="text" class="form-control" placeholder="e.g. Jane Smith" style="margin-bottom:6px;font-size:12.5px">' +
      '<label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Patient ID (optional)</label>' +
      '<input id="hw-assign-patient-id" type="text" class="form-control" placeholder="e.g. demo-patient" style="margin-bottom:10px;font-size:12.5px">' +
      '<button class="btn btn-secondary" style="width:100%" onclick="window._hwAssignPlan()">Assign Plan</button>' +
      '<div id="hw-assign-status" style="margin-top:8px;font-size:11.5px;color:var(--green);display:none"></div>' +
    '</div>';
  }

  // ── Initial render ─────────────────────────────────────────────────────────
  el.innerHTML =
    '<div class="hw-builder-layout">' +
      renderPalettePanel() +
      '<div class="hw-canvas-panel"><div id="hw-canvas-inner"></div></div>' +
      renderSettingsPanel() +
    '</div>';

  renderCanvas();
  renderSavedPlansList();

  // ── Global handlers ────────────────────────────────────────────────────────

  window._hwPlanField = function(field, value) {
    _editorPlan[field] = (field === 'weeks') ? (+value || 4) : value;
  };

  window._hwBlockField = function(blockId, field, value) {
    const block = _editorPlan.blocks.find(function(b) { return b.id === blockId; });
    if (block) block[field] = value;
  };

  window._hwAddBlock = function(type) {
    const bt = HW_BLOCK_TYPES.find(function(b) { return b.type === type; });
    if (!bt) return;
    const block = {
      id:           'blk-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      type:         bt.type,
      label:        bt.label,
      icon:         bt.icon,
      instructions: '',
      duration:     bt.defaultDuration,
      frequency:    bt.defaultFreq,
      weekStart:    1,
      weekEnd:      _editorPlan.weeks || 4,
      order:        _editorPlan.blocks.length,
    };
    _editorPlan.blocks.push(block);
    renderCanvas();
  };

  window._hwRemoveBlock = function(idx) {
    _editorPlan.blocks.splice(idx, 1);
    renderCanvas();
  };

  window._hwMoveBlock = function(idx, dir) {
    const blocks = _editorPlan.blocks;
    const target = idx + dir;
    if (target < 0 || target >= blocks.length) return;
    const tmp = blocks[idx];
    blocks[idx] = blocks[target];
    blocks[target] = tmp;
    renderCanvas();
  };

  window._hwSavePlan = function() {
    const nameEl  = document.getElementById('hw-plan-name');
    const condEl  = document.getElementById('hw-plan-condition');
    const weeksEl = document.getElementById('hw-plan-weeks');
    if (nameEl)  _editorPlan.name      = nameEl.value.trim();
    if (condEl)  _editorPlan.condition = condEl.value.trim();
    if (weeksEl) _editorPlan.weeks     = parseInt(weeksEl.value, 10) || 4;
    if (!_editorPlan.name) { alert('Please enter a plan name.'); return; }
    saveHWPlan(_editorPlan);
    renderSavedPlansList();
    const statusEl = document.getElementById('hw-assign-status');
    if (statusEl) {
      statusEl.textContent = 'Plan saved!';
      statusEl.style.display = '';
      setTimeout(function() { if (statusEl) statusEl.style.display = 'none'; }, 2500);
    }
  };

  window._hwLoadPlan = function(id) {
    const plans = getHWPlans();
    const plan = plans.find(function(p) { return p.id === id; });
    if (!plan) return;
    _editorPlan = JSON.parse(JSON.stringify(plan));
    renderCanvas();
  };

  window._hwDeletePlan = function(id) {
    if (!confirm('Delete this plan?')) return;
    deleteHWPlan(id);
    renderSavedPlansList();
  };

  window._hwNewPlan = function() {
    _editorPlan = { id: 'new-' + Date.now(), name: '', condition: '', weeks: 4, blocks: [], createdAt: new Date().toISOString() };
    renderCanvas();
  };

  window._hwAssignPlan = function() {
    const nameEl      = document.getElementById('hw-assign-patient-name');
    const idEl        = document.getElementById('hw-assign-patient-id');
    const patientName = nameEl ? nameEl.value.trim() : '';
    const patientId   = (idEl && idEl.value.trim()) ? idEl.value.trim() : 'demo-patient';
    if (!patientName) { alert('Please enter a patient name.'); return; }
    const nameInputEl = document.getElementById('hw-plan-name');
    const condEl      = document.getElementById('hw-plan-condition');
    const weeksEl     = document.getElementById('hw-plan-weeks');
    if (nameInputEl) _editorPlan.name      = nameInputEl.value.trim();
    if (condEl)      _editorPlan.condition = condEl.value.trim();
    if (weeksEl)     _editorPlan.weeks     = parseInt(weeksEl.value, 10) || 4;
    if (!_editorPlan.name) { alert('Please enter a plan name before assigning.'); return; }
    saveHWPlan(_editorPlan);
    const assignment = assignHWPlan(_editorPlan.id, patientId, patientName);
    if (assignment) {
      const statusEl = document.getElementById('hw-assign-status');
      if (statusEl) {
        statusEl.textContent = 'Assigned to ' + patientName + ' \u2713';
        statusEl.style.display = '';
        setTimeout(function() { if (statusEl) statusEl.style.display = 'none'; }, 3000);
      }
      if (nameEl) nameEl.value = '';
      if (idEl)   idEl.value   = '';
    }
  };

  window._hwPrintPlan = function() {
    const nameInputEl = document.getElementById('hw-plan-name');
    const condEl      = document.getElementById('hw-plan-condition');
    const weeksEl     = document.getElementById('hw-plan-weeks');
    if (nameInputEl) _editorPlan.name      = nameInputEl.value.trim();
    if (condEl)      _editorPlan.condition = condEl.value.trim();
    if (weeksEl)     _editorPlan.weeks     = parseInt(weeksEl.value, 10) || 4;

    const plan     = _editorPlan;
    const weeks    = plan.weeks || 4;
    const weekNums = Array.from({ length: weeks }, function(_, i) { return i + 1; });
    const freqMap  = { 'daily': 'Daily', '3x-week': '3x/week', '2x-week': '2x/week', 'weekly': 'Weekly', 'once': 'Once' };

    const tableHeader =
      '<tr><th style="text-align:left">Task</th>' +
      weekNums.map(function(w) { return '<th>Wk ' + w + '</th>'; }).join('') +
      '</tr>';

    const tableRows = (plan.blocks || []).map(function(b) {
      return '<tr>' +
        '<td style="text-align:left">' + b.icon + ' ' + b.label + '</td>' +
        weekNums.map(function(w) {
          const active = w >= (b.weekStart || 1) && w <= (b.weekEnd || weeks);
          return '<td>' + (active ? '\u2713' : '') + '</td>';
        }).join('') +
      '</tr>';
    }).join('');

    const blocksDetail = (plan.blocks || []).map(function(b) {
      return '<li style="margin-bottom:12px">' +
        '<strong>' + b.icon + ' ' + b.label + '</strong>' +
        ' <em style="color:#555;font-size:.85em">(' +
          (freqMap[b.frequency] || b.frequency) +
          (b.duration > 0 ? ', ' + b.duration + ' min' : '') +
          ', Weeks ' + (b.weekStart || 1) + '\u2013' + (b.weekEnd || weeks) +
        ')</em>' +
        (b.instructions ? '<br><span style="font-size:.88em;color:#444">' + b.instructions + '</span>' : '') +
      '</li>';
    }).join('');

    const modalHtml =
      '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:#fff;z-index:9999;overflow:auto;padding:30px;box-sizing:border-box">' +
        '<div style="max-width:800px;margin:0 auto">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">' +
            '<div>' +
              '<h1 style="margin:0;font-size:1.5rem;color:#111">' + (plan.name || 'Homework Plan') + '</h1>' +
              (plan.condition ? '<div style="color:#555;font-size:.9rem;margin-top:4px">Condition: ' + plan.condition + '</div>' : '') +
              '<div style="color:#888;font-size:.8rem;margin-top:2px">Duration: ' + weeks + ' weeks</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px">' +
              '<button onclick="window.print()" style="padding:8px 18px;background:#0070f3;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.9rem">Print</button>' +
              '<button onclick="document.getElementById(\'hw-print-overlay\').remove()" style="padding:8px 14px;background:#f3f4f6;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:.9rem">Close</button>' +
            '</div>' +
          '</div>' +
          '<div style="margin-bottom:24px;border:1px solid #eee;border-radius:8px;overflow:auto">' +
            '<table class="hw-week-table">' + tableHeader + tableRows + '</table>' +
          '</div>' +
          '<h3 style="margin-bottom:12px;font-size:1rem;color:#111">Task Instructions</h3>' +
          '<ol style="padding-left:18px;line-height:1.7">' + blocksDetail + '</ol>' +
          '<div style="margin-top:30px;padding-top:16px;border-top:1px solid #eee;font-size:.78rem;color:#aaa;text-align:center">' +
            'DeepSynaps Protocol Studio \u2014 Patient Homework Plan' +
          '</div>' +
        '</div>' +
      '</div>';

    let overlay = document.getElementById('hw-print-overlay');
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'hw-print-overlay';
    overlay.innerHTML = modalHtml;
    document.body.appendChild(overlay);
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Patient Mobile PWA Enhancements ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── Swipe gesture system ──────────────────────────────────────────────────────
function initPatientSwipeGestures() {
  let _touchStartX = 0, _touchStartY = 0, _touchStartTime = 0;
  const SWIPE_THRESHOLD = 60; // px
  const SWIPE_TIME_LIMIT = 400; // ms
  const ANGLE_LIMIT = 30; // degrees from horizontal

  const root = document.getElementById('patient-app-shell') || document.body;

  root.addEventListener('touchstart', e => {
    _touchStartX = e.touches[0].clientX;
    _touchStartY = e.touches[0].clientY;
    _touchStartTime = Date.now();
  }, { passive: true });

  root.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - _touchStartX;
    const dy = e.changedTouches[0].clientY - _touchStartY;
    const dt = Date.now() - _touchStartTime;
    const angle = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);

    if (dt > SWIPE_TIME_LIMIT || Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (angle > ANGLE_LIMIT) return; // too vertical

    if (dx < 0) window._patSwipeLeft?.();   // swipe left → next page
    if (dx > 0) window._patSwipeRight?.();  // swipe right → prev page / open nav
  }, { passive: true });
}

// Define swipe page-cycle functions using PATIENT_BOTTOM_NAV order
(function setupSwipeNavHandlers() {
  const _getNavIds = () => PATIENT_BOTTOM_NAV.map(n => n.id);

  window._patSwipeLeft = function() {
    const ids = _getNavIds();
    const cur = window._currentPatientPage || 'patient-portal';
    const idx = ids.indexOf(cur);
    const next = idx === -1 ? ids[0] : ids[Math.min(idx + 1, ids.length - 1)];
    if (next !== cur) window._navPatient?.(next);
  };

  window._patSwipeRight = function() {
    const ids = _getNavIds();
    const cur = window._currentPatientPage || 'patient-portal';
    const idx = ids.indexOf(cur);
    if (idx > 0) window._navPatient?.(ids[idx - 1]);
  };
})();

// ── Pull-to-refresh ───────────────────────────────────────────────────────────
function initPullToRefresh(refreshFn) {
  let _ptr_startY = 0, _ptr_active = false;
  const indicator = document.getElementById('ptr-indicator');
  const shell = document.getElementById('patient-app-shell') || document.body;

  shell.addEventListener('touchstart', e => {
    if (shell.scrollTop === 0) {
      _ptr_startY = e.touches[0].clientY;
      _ptr_active = true;
    }
  }, { passive: true });

  shell.addEventListener('touchmove', e => {
    if (!_ptr_active) return;
    const dy = e.touches[0].clientY - _ptr_startY;
    if (dy > 0 && indicator) {
      indicator.style.transform = `translateX(-50%) translateY(${Math.min(dy * 0.4, 60)}px)`;
      indicator.style.opacity = Math.min(dy / 80, 1).toString();
    }
  }, { passive: true });

  shell.addEventListener('touchend', e => {
    if (!_ptr_active) return;
    _ptr_active = false;
    const dy = e.changedTouches[0].clientY - _ptr_startY;
    if (dy > 80) {
      if (indicator) { indicator.style.transform = 'translateX(-50%) translateY(48px)'; }
      refreshFn();
      setTimeout(() => {
        if (indicator) { indicator.style.transform = 'translateX(-50%)'; indicator.style.opacity = '0'; }
      }, 1500);
    } else {
      if (indicator) { indicator.style.transform = 'translateX(-50%)'; indicator.style.opacity = '0'; }
    }
    _ptr_startY = 0;
  }, { passive: true });
}

// ── Offline symptom journal ───────────────────────────────────────────────────
const SYMPTOM_JOURNAL_KEY = 'ds_symptom_journal';

function getJournalEntries() {
  try {
    return JSON.parse(localStorage.getItem(SYMPTOM_JOURNAL_KEY) || '[]');
  } catch (_) { return []; }
}

function saveJournalEntry(entry) {
  const entries = getJournalEntries();
  const existing = entries.findIndex(e => e.id === entry.id);
  if (existing >= 0) { entries[existing] = entry; }
  else { entries.unshift(entry); }
  localStorage.setItem(SYMPTOM_JOURNAL_KEY, JSON.stringify(entries));
}

function deleteJournalEntry(id) {
  const entries = getJournalEntries().filter(e => e.id !== id);
  localStorage.setItem(SYMPTOM_JOURNAL_KEY, JSON.stringify(entries));
}

// Mini SVG mood trend chart (7 days)
function _journalTrendChart(entries) {
  const last7 = entries.slice(0, 7).reverse();
  if (last7.length < 2) return '<div style="color:var(--text-tertiary);font-size:12px;text-align:center;padding:16px">Not enough data for trend yet — log at least 2 days.</div>';

  const W = 280, H = 60, pad = 8;
  const iw = W - pad * 2, ih = H - pad * 2;
  const pts = last7.map((e, i) => {
    const x = pad + (i / (last7.length - 1)) * iw;
    const y = pad + ih - ((e.mood - 1) / 4) * ih;
    return { x, y, mood: e.mood, date: e.date };
  });
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `M${pts[0].x},${H} ` + pts.map(p => `L${p.x},${p.y}`).join(' ') + ` L${pts[pts.length-1].x},${H} Z`;
  const gradId = `jt-${Math.random().toString(36).slice(2)}`;
  const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--teal,#0d9488)" stroke="white" stroke-width="1.5"/>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="overflow:visible">
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--teal,#0d9488)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="var(--teal,#0d9488)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#${gradId})"/>
    <polyline points="${polyline}" fill="none" stroke="var(--teal,#0d9488)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

function _emojiScaleRow(id, label, emojis, min, max) {
  return `<div style="margin-bottom:16px">
    <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">${label}</label>
    <input type="range" id="${id}" min="${min}" max="${max}" value="${Math.round((min+max)/2)}"
      style="width:100%;accent-color:var(--teal,#0d9488)">
    <div class="pt-emoji-scale">${emojis.map(e => `<span>${e}</span>`).join('')}</div>
  </div>`;
}

export async function pgSymptomJournal(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('Symptom Journal', '');
  const el = document.getElementById('patient-content');
  if (!el) return;

  const entries = getJournalEntries();
  const today = new Date().toISOString().split('T')[0];
  const todayEntry = entries.find(e => e.date === today);

  const historyHtml = entries.slice(0, 14).map(e => {
    const unsyncedBadge = !e.synced ? '<span class="pt-unsynced">UNSYNCED</span>' : '';
    const notesSnippet = e.notes ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.notes}</div>` : '';
    return `<div class="pt-journal-entry">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">${new Date(e.date + 'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</span>
        ${unsyncedBadge}
      </div>
      <div style="flex-wrap:wrap;display:flex;gap:2px">
        <span class="pt-metric-badge">😊 Mood: ${e.mood}/5</span>
        <span class="pt-metric-badge">⚡ Energy: ${e.energy}/5</span>
        <span class="pt-metric-badge">😰 Anxiety: ${e.anxiety}/5</span>
        <span class="pt-metric-badge">💤 Sleep: ${e.sleep}h</span>
      </div>
      ${notesSnippet}
    </div>`;
  }).join('') || '<div style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:24px">No entries yet. Log your first check-in above.</div>';

  const unsyncedCount = entries.filter(e => !e.synced).length;

  el.innerHTML = `
    <div style="max-width:600px;margin:0 auto;padding:16px">
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <h3 style="margin:0;font-size:1rem">How are you feeling today?</h3>
          <span style="font-size:11px;color:var(--text-tertiary)">${new Date().toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</span>
        </div>
        <div class="card-body" style="padding:16px">
          ${todayEntry ? `<div class="notice notice-success" style="margin-bottom:12px">You already logged today. You can update it below.</div>` : ''}
          ${_emojiScaleRow('j-mood',    '😊 Mood',    ['😫','😟','😐','🙂','😊'], 1, 5)}
          ${_emojiScaleRow('j-energy',  '⚡ Energy',  ['😴','🥱','😐','🙂','⚡'], 1, 5)}
          ${_emojiScaleRow('j-anxiety', '😰 Anxiety', ['😰','😟','😐','🙂','😌'], 1, 5)}
          ${_emojiScaleRow('j-sleep',   '💤 Sleep (hours)', ['0h','3h','6h','9h','12h'], 0, 12)}
          <div style="margin-bottom:16px">
            <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Notes (optional)</label>
            <textarea id="j-notes" rows="3" placeholder="How was your day? Any symptoms to note?"
              style="width:100%;border:1px solid var(--border);border-radius:6px;padding:8px;background:var(--input-bg,rgba(255,255,255,0.04));color:var(--text-primary);font-family:var(--font-body);font-size:13px;resize:vertical;box-sizing:border-box">${todayEntry?.notes || ''}</textarea>
          </div>
          <button class="btn btn-primary" style="width:100%" id="j-save-btn">Save Entry</button>
          <div id="j-save-msg" style="display:none;margin-top:8px;font-size:12px;color:#10b981;text-align:center">Entry saved!</div>
        </div>
      </div>

      ${unsyncedCount > 0 ? `<div style="display:flex;justify-content:flex-end;margin-bottom:8px">
        <button class="btn btn-ghost btn-sm" id="j-sync-btn">Sync All (${unsyncedCount} pending)</button>
      </div>` : ''}

      <div class="pt-trend-chart" style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">7-Day Mood Trend</div>
        <div style="overflow:hidden;display:flex;justify-content:center">${_journalTrendChart(entries)}</div>
      </div>

      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Recent Entries</div>
        ${historyHtml}
      </div>
    </div>`;

  // Wire save button
  document.getElementById('j-save-btn')?.addEventListener('click', () => {
    const mood    = parseInt(document.getElementById('j-mood')?.value    || '3');
    const energy  = parseInt(document.getElementById('j-energy')?.value  || '3');
    const anxiety = parseInt(document.getElementById('j-anxiety')?.value || '3');
    const sleep   = parseFloat(document.getElementById('j-sleep')?.value || '6');
    const notes   = document.getElementById('j-notes')?.value?.trim() || '';
    const entry = {
      id: todayEntry?.id || `j_${Date.now()}`,
      date: today,
      mood, energy, anxiety, sleep, notes,
      synced: false,
    };
    saveJournalEntry(entry);
    const msg = document.getElementById('j-save-msg');
    if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 2000); }
    // Re-render to refresh history
    setTimeout(() => pgSymptomJournal(setTopbarFn), 300);
  });

  // Wire sync button
  document.getElementById('j-sync-btn')?.addEventListener('click', () => {
    const all = getJournalEntries().map(e => ({ ...e, synced: true }));
    localStorage.setItem(SYMPTOM_JOURNAL_KEY, JSON.stringify(all));
    setTimeout(() => pgSymptomJournal(setTopbarFn), 200);
  });
}

// ── Notification settings ─────────────────────────────────────────────────────
const NOTIF_PREFS_KEY = 'ds_notification_prefs';

function getNotifPrefs() {
  try { return JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || '{}'); }
  catch (_) { return {}; }
}

function saveNotifPrefs(prefs) {
  localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
}

window._patRequestPush = async function() {
  const statusEl = document.getElementById('push-status');
  if (!('Notification' in window)) {
    if (statusEl) statusEl.innerHTML = '<span style="color:var(--text-tertiary);font-size:12px">Push notifications are not supported in this browser.</span>';
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    if (statusEl) statusEl.innerHTML = '<span class="push-enabled">Notifications enabled ✓</span>';
    const prefs = getNotifPrefs();
    prefs.pushGranted = true;
    saveNotifPrefs(prefs);
  } else {
    if (statusEl) statusEl.innerHTML = '<span class="push-denied">Permission denied</span>';
  }
};

window._patShareProgress = async function() {
  const title = 'My Treatment Progress — DeepSynaps';
  const text = 'Tracking my neuromodulation treatment progress with DeepSynaps Protocol Studio.';
  const url = window.location.href;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); }
    catch (err) { if (err.name !== 'AbortError') console.warn('Share failed:', err); }
  } else {
    try {
      await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
      const btn = document.getElementById('share-btn');
      if (btn) { const orig = btn.textContent; btn.textContent = 'Copied to clipboard!'; setTimeout(() => { btn.textContent = orig; }, 2000); }
    } catch (_) {
      alert('Share not available. Copy this link: ' + url);
    }
  }
};

export async function pgPatientNotificationSettings(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('Notification Settings', '');
  const el = document.getElementById('patient-content');
  if (!el) return;

  const prefs = getNotifPrefs();
  const pushSupported = 'Notification' in window;
  const currentPerm = pushSupported ? Notification.permission : 'unsupported';
  const shareSupported = 'share' in navigator;

  function toggleRow(key, label, defaultVal) {
    const val = prefs[key] !== undefined ? prefs[key] : defaultVal;
    return `<div class="pt-notif-toggle-row">
      <span style="font-size:13px">${label}</span>
      <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
        <input type="checkbox" id="notif-${key}" ${val ? 'checked' : ''}
          style="opacity:0;width:0;height:0;position:absolute"
          onchange="(function(){
            const p = JSON.parse(localStorage.getItem('${NOTIF_PREFS_KEY}')||'{}');
            p['${key}'] = document.getElementById('notif-${key}').checked;
            localStorage.setItem('${NOTIF_PREFS_KEY}', JSON.stringify(p));
          })()">
        <span style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;border-radius:22px;background:var(--border);transition:.25s" id="notif-${key}-track">
          <span style="position:absolute;height:16px;width:16px;left:3px;bottom:3px;border-radius:50%;background:white;transition:.25s;transform:${val?'translateX(18px)':'translateX(0)'}"></span>
        </span>
      </label>
    </div>`;
  }

  let pushStatusHtml;
  if (!pushSupported) {
    pushStatusHtml = '<span style="color:var(--text-tertiary);font-size:12px">Not supported in this browser.</span>';
  } else if (currentPerm === 'granted') {
    pushStatusHtml = '<span class="push-enabled">Notifications enabled ✓</span>';
  } else if (currentPerm === 'denied') {
    pushStatusHtml = '<span class="push-denied">Permission denied — enable in browser settings</span>';
  } else {
    pushStatusHtml = '<button class="btn btn-primary btn-sm" onclick="window._patRequestPush()">Enable Push Notifications</button>';
  }

  el.innerHTML = `
    <div style="max-width:560px;margin:0 auto;padding:16px">

      <div class="pt-notif-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">Push Notifications</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Get reminders for upcoming sessions and check-ins.</div>
        <div id="push-status">${pushStatusHtml}</div>
      </div>

      <div class="pt-notif-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">Share Progress</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Share a link to your treatment journey with your support network.</div>
        <button class="btn btn-ghost btn-sm" id="share-btn" onclick="window._patShareProgress()">
          ${shareSupported ? '📤 Share my progress' : '📋 Copy link'}
        </button>
      </div>

      <div class="pt-notif-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">Notification Preferences</div>
        ${toggleRow('sessionReminders',  '📅 Session reminders', true)}
        ${toggleRow('homeworkReminders', '📝 Homework reminders', true)}
        ${toggleRow('weeklySummary',     '📊 Weekly summary',     true)}
      </div>

      ${pushSupported && currentPerm === 'granted' ? `
      <div style="margin-top:8px">
        <button class="btn btn-ghost btn-sm" id="test-notif-btn">Test Notification</button>
      </div>` : ''}
    </div>`;

  // Sync toggle visual state on change (pure CSS toggles need a bit of help)
  el.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      const track = document.getElementById(cb.id + '-track');
      if (track) {
        const dot = track.querySelector('span');
        if (dot) dot.style.transform = cb.checked ? 'translateX(18px)' : 'translateX(0)';
        track.style.background = cb.checked ? 'var(--teal,#0d9488)' : 'var(--border)';
      }
    });
    // Set initial track colour
    const track = document.getElementById(cb.id + '-track');
    if (track && cb.checked) track.style.background = 'var(--teal,#0d9488)';
  });

  // Wire test notification button
  document.getElementById('test-notif-btn')?.addEventListener('click', () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('DeepSynaps Reminder', {
        body: 'This is a test notification from your Patient Portal.',
        icon: '/manifest-icon-192.png',
      });
    }
  });
}

// ── Wire gestures after patient-app-shell appears ────────────────────────────
(function _initPWAWiring() {
  const shell = document.getElementById('patient-app-shell');
  if (shell) {
    initPatientSwipeGestures();
    initPullToRefresh(() => { window._navPatient?.(window._currentPatientPage || 'patient-portal'); });
    return;
  }
  // patient-app-shell may not be in DOM yet — observe for it
  const observer = new MutationObserver((_, obs) => {
    if (document.getElementById('patient-app-shell')) {
      obs.disconnect();
      initPatientSwipeGestures();
      initPullToRefresh(() => { window._navPatient?.(window._currentPatientPage || 'patient-portal'); });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// pgDataImport — Data Import & Migration
// ═══════════════════════════════════════════════════════════════════════════════

// ── Import history store ──────────────────────────────────────────────────────
function getImportHistory() {
  try {
    const raw = localStorage.getItem('ds_import_history');
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  // Seed 3 sample records if empty
  const seed = [
    {
      id: 'imp_001', type: 'patients', fileName: 'patients_jan_2026.csv',
      rowCount: 42, successCount: 40, errorCount: 2, date: '2026-01-15T09:30:00Z',
      errors: [
        { row: 7, field: 'email', value: 'notanemail', message: 'Invalid email format' },
        { row: 23, field: 'dob', value: '13/45/1990', message: 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY' },
      ],
      status: 'partial',
    },
    {
      id: 'imp_002', type: 'sessions', fileName: 'sessions_q1_2026.csv',
      rowCount: 118, successCount: 118, errorCount: 0, date: '2026-02-01T14:10:00Z',
      errors: [], status: 'completed',
    },
    {
      id: 'imp_003', type: 'protocols', fileName: 'tms_protocol_bundle.json',
      rowCount: 5, successCount: 3, errorCount: 2, date: '2026-03-20T11:00:00Z',
      errors: [
        { row: 2, field: 'steps', value: '', message: 'steps array is required and must be non-empty' },
        { row: 4, field: 'modality', value: '', message: 'modality is required' },
      ],
      status: 'partial',
    },
  ];
  localStorage.setItem('ds_import_history', JSON.stringify(seed));
  return seed;
}

function saveImportRecord(record) {
  const history = getImportHistory();
  history.unshift(record);
  localStorage.setItem('ds_import_history', JSON.stringify(history));
}

// ── CSV parser utility ────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let cur = '';
  let inQuote = false;
  const chars = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let row = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];

    if (inQuote) {
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(cur.trim()); cur = ''; }
      else if (ch === '\n') {
        row.push(cur.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = []; cur = '';
      } else { cur += ch; }
    }
  }
  // Last cell/row
  row.push(cur.trim());
  if (row.some(c => c !== '')) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

function csvRowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
  return obj;
}

// ── Import schemas ────────────────────────────────────────────────────────────
const PATIENT_IMPORT_SCHEMA = {
  required: ['name', 'dob', 'condition'],
  optional: ['email', 'phone', 'clinician', 'notes', 'gender', 'address'],
  transformations: {
    name:      v => v.trim(),
    dob:       v => { const d = new Date(v); return isNaN(d) ? null : d.toISOString().split('T')[0]; },
    condition: v => v.toLowerCase().trim(),
  },
  validations: {
    name:  v => v.length >= 2 || 'Name must be at least 2 characters',
    dob:   v => v !== null || 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY',
    email: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Invalid email format',
  },
};

const SESSION_IMPORT_SCHEMA = {
  required: ['patientName', 'date', 'modality', 'duration'],
  optional: ['amplitude', 'frequency', 'notes', 'outcome'],
  transformations: {
    patientName: v => v.trim(),
    date:        v => { const d = new Date(v); return isNaN(d) ? null : d.toISOString().split('T')[0]; },
    modality:    v => v.trim(),
    duration:    v => parseInt(v, 10) || 0,
  },
  validations: {
    patientName: v => v.length >= 2 || 'Patient name must be at least 2 characters',
    date:        v => v !== null || 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY',
    modality:    v => v.length > 0 || 'Modality is required',
    duration:    v => v > 0 || 'Duration must be a positive number',
  },
};

// ── Column mapping engine ─────────────────────────────────────────────────────
function autoMapColumns(csvHeaders, schemaFields) {
  const mappings = {};
  const SYNONYMS = {
    name:        ['patient name', 'full name', 'patient', 'name', 'client name'],
    dob:         ['date of birth', 'dob', 'birth date', 'birthday'],
    condition:   ['condition', 'diagnosis', 'primary diagnosis', 'disorder'],
    email:       ['email', 'email address', 'e-mail'],
    phone:       ['phone', 'telephone', 'mobile', 'cell', 'phone number'],
    patientName: ['patient name', 'patient', 'full name', 'client name'],
    date:        ['date', 'session date', 'appointment date', 'dos'],
    modality:    ['modality', 'treatment type', 'treatment', 'therapy type'],
    duration:    ['duration', 'session length', 'minutes', 'length'],
    amplitude:   ['amplitude', 'intensity', 'ma', 'milliamps'],
    frequency:   ['frequency', 'hz', 'freq'],
    notes:       ['notes', 'note', 'comments', 'remarks'],
    outcome:     ['outcome', 'result', 'response'],
    clinician:   ['clinician', 'provider', 'doctor', 'therapist', 'practitioner'],
    gender:      ['gender', 'sex'],
    address:     ['address', 'street address', 'location'],
  };
  csvHeaders.forEach(header => {
    const h = header.toLowerCase().trim();
    for (const [field, synonyms] of Object.entries(SYNONYMS)) {
      if (!schemaFields.includes(field)) continue;
      if (synonyms.includes(h)) { mappings[field] = header; break; }
    }
  });
  return mappings;
}

// ── Internal state for wizard ─────────────────────────────────────────────────
const _importState = {
  patients: { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false },
  sessions: { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false },
  protocol: { step: 1, jsonData: null, fileName: '', pasteText: '' },
};

// ── Sample CSV generators ─────────────────────────────────────────────────────
window._importDownloadSample = function(type) {
  let csv = '';
  if (type === 'patients') {
    csv = 'name,dob,condition,email,phone,clinician,notes,gender,address\n' +
      'Alice Johnson,1985-03-12,depression,alice@example.com,555-1234,Dr. Smith,"Initial intake notes",Female,"123 Main St"\n' +
      'Bob Martinez,1972-07-22,anxiety,bob@example.com,555-5678,Dr. Lee,"Referred by GP",Male,"456 Oak Ave"\n' +
      'Carol White,1990-11-05,tinnitus,,,Dr. Smith,,Female,';
  } else if (type === 'sessions') {
    csv = 'patientName,date,modality,duration,amplitude,frequency,notes,outcome\n' +
      'Alice Johnson,2026-01-10,TMS,30,120,10,"Standard session","Good response"\n' +
      'Bob Martinez,2026-01-12,tDCS,20,2,,,""\n' +
      'Carol White,2026-01-15,Neurofeedback,45,,,,Improved focus';
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sample_' + type + '.csv'; a.click();
  URL.revokeObjectURL(url);
};

// ── Validation helpers ────────────────────────────────────────────────────────
function _validateAndTransformRow(rowObj, schema) {
  const errors = [];
  const transformed = {};
  const allFields = [...schema.required, ...schema.optional];
  allFields.forEach(field => {
    let val = rowObj[field] ?? '';
    if (schema.transformations && schema.transformations[field]) {
      val = schema.transformations[field](val);
    }
    transformed[field] = val;
    if (schema.validations && schema.validations[field]) {
      const result = schema.validations[field](val);
      if (result !== true) errors.push({ field, value: rowObj[field] ?? '', message: result });
    } else if (schema.required.includes(field) && !val) {
      errors.push({ field, value: '', message: field + ' is required' });
    }
  });
  return { transformed, errors };
}

function _applyMappings(csvRow, headers, mappings, schema) {
  const allFields = [...schema.required, ...schema.optional];
  const obj = {};
  allFields.forEach(field => {
    const csvCol = mappings[field];
    if (csvCol) {
      const idx = headers.indexOf(csvCol);
      obj[field] = idx >= 0 ? (csvRow[idx] ?? '') : '';
    } else {
      obj[field] = '';
    }
  });
  return obj;
}

// ── Step bar renderer ─────────────────────────────────────────────────────────
function _renderStepBar(currentStep, steps) {
  return '<div class="import-step-bar">' + steps.map((s, i) => {
    const n = i + 1;
    let cls = 'import-step';
    if (n < currentStep) cls += ' done';
    else if (n === currentStep) cls += ' active';
    const prefix = n === currentStep ? '● ' : n < currentStep ? '✓ ' : '';
    return '<div class="' + cls + '">' + prefix + s + '</div>';
  }).join('') + '</div>';
}

// ── Tab renderer ──────────────────────────────────────────────────────────────
function _renderImportTabs(activeTab) {
  const tabs = [
    { id: 'patients', label: '📄 Patient CSV' },
    { id: 'sessions', label: '🗓 Session CSV' },
    { id: 'protocol', label: '📋 Protocol JSON' },
    { id: 'history',  label: '🕒 Import History' },
  ];
  return '<div class="tab-row" style="margin-bottom:20px">' + tabs.map(t =>
    '<button class="tab-btn' + (activeTab === t.id ? ' active' : '') + '" onclick="window._importSwitchTab(\'' + t.id + '\')">' + t.label + '</button>'
  ).join('') + '</div>';
}

// ── Patient CSV import wizard steps ──────────────────────────────────────────
function _renderPatientStep1() {
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(1, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <h3 style="margin-bottom:4px">Upload Patient CSV</h3>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">Accepted formats: .csv, .txt — max 10,000 rows</p>
      <div class="import-dropzone" id="patient-dropzone"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');window._importHandleFile('patients',event.dataTransfer.files[0])">
        <div class="import-dropzone-icon">📥</div>
        <div style="font-weight:600;margin-bottom:6px">Drag &amp; drop your CSV here</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px">or click to browse</div>
        <input type="file" id="patient-file-input" accept=".csv,.txt" style="display:none" onchange="window._importHandleFile('patients',this.files[0])">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('patient-file-input').click()">Browse Files</button>
      </div>
      <div style="margin-top:16px;display:flex;align-items:center;gap:12px">
        <span style="font-size:.8rem;color:var(--text-muted)">Need a template?</span>
        <button class="btn btn-ghost btn-sm" onclick="window._importDownloadSample('patients')">&#8595; Download Sample CSV</button>
      </div>
    </div>`;
}

function _renderPatientStep2(state) {
  const { csvData, mappings } = state;
  const schema = PATIENT_IMPORT_SCHEMA;
  const allFields = [...schema.required, ...schema.optional];
  const rowsHtml = allFields.map(field => {
    const isReq = schema.required.includes(field);
    const cur = mappings[field] || '';
    const unmapped = isReq && !cur;
    const sampleVals = cur ? csvData.rows.slice(0, 3).map(r => {
      const idx = csvData.headers.indexOf(cur);
      return idx >= 0 ? (r[idx] || '—') : '—';
    }).join(', ') : '—';
    const reqStar = isReq ? '<span class="mapping-required">*</span> ' : '';
    const labelStyle = unmapped ? 'color:#ef4444;font-weight:700' : '';
    const borderColor = unmapped ? '#ef4444' : 'var(--border)';
    const opts = csvData.headers.map(h => '<option value="' + h + '"' + (cur === h ? ' selected' : '') + '>' + h + '</option>').join('');
    return '<tr>' +
      '<td><span style="' + labelStyle + '">' + reqStar + field + '</span></td>' +
      '<td><select style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid ' + borderColor + ';background:var(--input-bg);color:var(--text)" onchange="window._importSetMapping(\'patients\',\'' + field + '\',this.value)">' +
        '<option value="">— not mapped —</option>' + opts +
      '</select></td>' +
      '<td style="color:var(--text-muted);font-size:.8rem">' + sampleVals + '</td>' +
    '</tr>';
  }).join('');
  return `
    <div class="card" style="max-width:860px;margin:0 auto">
      ${_renderStepBar(2, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h3 style="margin-bottom:2px">Map Columns</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">${csvData.rows.length} rows &middot; ${csvData.headers.length} columns detected</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importReset('patients')">Reset Mapping</button>
          <button class="btn btn-primary btn-sm" onclick="window._importValidate('patients')">Validate &rarr;</button>
        </div>
      </div>
      <table class="mapping-table">
        <thead><tr><th>Schema Field</th><th>CSV Column</th><th>Sample Values</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function _renderPatientStep3(state) {
  const { validRows, errorRows, skipInvalid } = state;
  const schema = PATIENT_IMPORT_SCHEMA;
  const allFields = [...schema.required, ...schema.optional];
  const previewRows = [...validRows, ...errorRows].slice(0, 10).sort((a, b) => a._rowIndex - b._rowIndex);
  const ths = allFields.map(f => '<th>' + f + '</th>').join('');
  const trs = previewRows.map(r => {
    const hasErr = r._errors && r._errors.length > 0;
    const tds = allFields.map(f => '<td>' + (r[f] ?? '') + '</td>').join('');
    const status = hasErr
      ? '<span style="color:#ef4444;font-size:.75rem">' + r._errors.map(e => e.message).join('; ') + '</span>'
      : '<span style="color:#10b981">&#10003;</span>';
    return '<tr class="' + (hasErr ? 'import-row-error' : '') + '"><td>' + (r._rowIndex + 1) + '</td>' + tds + '<td>' + status + '</td></tr>';
  }).join('');
  const errSummary = errorRows.length > 0 ? `
    <div style="background:#fee2e2;border-radius:8px;padding:12px;margin-top:12px">
      <strong style="color:#b91c1c">&#9888; ${errorRows.length} row${errorRows.length > 1 ? 's' : ''} have errors</strong>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;font-size:.85rem">
        <input type="checkbox" ${skipInvalid ? 'checked' : ''} onchange="window._importToggleSkip('patients',this.checked)">
        Skip invalid rows and import ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''}
      </label>
      <p style="font-size:.78rem;color:#7f1d1d;margin-top:6px">To fix errors manually, correct your CSV and re-upload.</p>
    </div>` : '';
  const canImport = skipInvalid ? validRows.length > 0 : (validRows.length > 0 || errorRows.length === 0);
  return `
    <div class="card" style="max-width:900px;margin:0 auto">
      ${_renderStepBar(3, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h3 style="margin-bottom:2px">Preview &amp; Validation</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">
            <span style="color:#10b981;font-weight:600">${validRows.length} valid</span>
            ${errorRows.length > 0 ? ' &middot; <span style="color:#ef4444;font-weight:600">' + errorRows.length + ' errors</span>' : ''}
            (showing first 10 rows)
          </p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importGoBack('patients')">&larr; Back</button>
          <button class="btn btn-primary btn-sm" ${canImport ? '' : 'disabled'} onclick="window._importExecutePatients()">Import Now</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table class="import-preview-table">
        <thead><tr><th>#</th>${ths}<th>Status</th></tr></thead>
        <tbody>${trs}</tbody>
      </table></div>
      ${errSummary}
    </div>`;
}

function _renderPatientStep4(result) {
  const errTable = result.errors && result.errors.length > 0 ? `
    <div style="overflow-x:auto;margin-top:12px"><table class="import-preview-table">
      <thead><tr><th>Row</th><th>Field</th><th>Value</th><th>Error</th></tr></thead>
      <tbody>${result.errors.map(e => '<tr class="import-row-error"><td>' + e.row + '</td><td>' + e.field + '</td><td>' + e.value + '</td><td>' + e.message + '</td></tr>').join('')}</tbody>
    </table></div>
    <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="window._importDownloadErrors('${result.importId}')">&#8595; Download Error Report</button>` : '';
  const icon = result.errors && result.errors.length === 0 ? '✅' : '⚠️';
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(4, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:3rem;margin-bottom:8px">${icon}</div>
        <h3>Import Complete</h3>
        <p style="font-size:1rem;margin-top:4px">
          <strong style="color:#10b981">${result.successCount} patient${result.successCount !== 1 ? 's' : ''} imported successfully.</strong>
          ${result.errors && result.errors.length > 0 ? '<br><span style="color:#ef4444">' + result.errors.length + ' error' + (result.errors.length !== 1 ? 's' : '') + ' skipped.</span>' : ''}
        </p>
      </div>
      ${errTable}
      <div style="display:flex;gap:8px;margin-top:20px;justify-content:center">
        <button class="btn btn-secondary" onclick="window._importReset('patients')">Import More</button>
        <button class="btn btn-primary" onclick="window._nav('patients')">View Patients</button>
      </div>
    </div>`;
}

// ── Session CSV wizard steps ──────────────────────────────────────────────────
function _renderSessionStep1() {
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(1, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <h3 style="margin-bottom:4px">Upload Session CSV</h3>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">Required fields: patientName, date, modality, duration</p>
      <div class="import-dropzone" id="session-dropzone"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');window._importHandleFile('sessions',event.dataTransfer.files[0])">
        <div class="import-dropzone-icon">📥</div>
        <div style="font-weight:600;margin-bottom:6px">Drag &amp; drop your CSV here</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px">or click to browse</div>
        <input type="file" id="session-file-input" accept=".csv,.txt" style="display:none" onchange="window._importHandleFile('sessions',this.files[0])">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('session-file-input').click()">Browse Files</button>
      </div>
      <div style="margin-top:16px;display:flex;align-items:center;gap:12px">
        <span style="font-size:.8rem;color:var(--text-muted)">Need a template?</span>
        <button class="btn btn-ghost btn-sm" onclick="window._importDownloadSample('sessions')">&#8595; Download Sample CSV</button>
      </div>
    </div>`;
}

function _renderSessionStep2(state) {
  const { csvData, mappings } = state;
  const schema = SESSION_IMPORT_SCHEMA;
  const allFields = [...schema.required, ...schema.optional];
  const rowsHtml = allFields.map(field => {
    const isReq = schema.required.includes(field);
    const cur = mappings[field] || '';
    const unmapped = isReq && !cur;
    const sampleVals = cur ? csvData.rows.slice(0, 3).map(r => {
      const idx = csvData.headers.indexOf(cur);
      return idx >= 0 ? (r[idx] || '—') : '—';
    }).join(', ') : '—';
    const reqStar = isReq ? '<span class="mapping-required">*</span> ' : '';
    const labelStyle = unmapped ? 'color:#ef4444;font-weight:700' : '';
    const borderColor = unmapped ? '#ef4444' : 'var(--border)';
    const opts = csvData.headers.map(h => '<option value="' + h + '"' + (cur === h ? ' selected' : '') + '>' + h + '</option>').join('');
    return '<tr>' +
      '<td><span style="' + labelStyle + '">' + reqStar + field + '</span></td>' +
      '<td><select style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid ' + borderColor + ';background:var(--input-bg);color:var(--text)" onchange="window._importSetMapping(\'sessions\',\'' + field + '\',this.value)">' +
        '<option value="">— not mapped —</option>' + opts +
      '</select></td>' +
      '<td style="color:var(--text-muted);font-size:.8rem">' + sampleVals + '</td>' +
    '</tr>';
  }).join('');
  return `
    <div class="card" style="max-width:860px;margin:0 auto">
      ${_renderStepBar(2, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h3 style="margin-bottom:2px">Map Columns</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">${csvData.rows.length} rows &middot; ${csvData.headers.length} columns detected</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importReset('sessions')">Reset Mapping</button>
          <button class="btn btn-primary btn-sm" onclick="window._importValidate('sessions')">Validate &rarr;</button>
        </div>
      </div>
      <table class="mapping-table">
        <thead><tr><th>Schema Field</th><th>CSV Column</th><th>Sample Values</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function _renderSessionStep3(state) {
  const { validRows, errorRows, skipInvalid } = state;
  const schema = SESSION_IMPORT_SCHEMA;
  const allFields = [...schema.required, ...schema.optional];
  const previewRows = [...validRows, ...errorRows].slice(0, 10).sort((a, b) => a._rowIndex - b._rowIndex);
  const ths = allFields.map(f => '<th>' + f + '</th>').join('');
  const trs = previewRows.map(r => {
    const hasErr = r._errors && r._errors.length > 0;
    const tds = allFields.map(f => '<td>' + (r[f] ?? '') + '</td>').join('');
    const status = hasErr
      ? '<span style="color:#ef4444;font-size:.75rem">' + r._errors.map(e => e.message).join('; ') + '</span>'
      : '<span style="color:#10b981">&#10003;</span>';
    return '<tr class="' + (hasErr ? 'import-row-error' : '') + '"><td>' + (r._rowIndex + 1) + '</td>' + tds + '<td>' + status + '</td></tr>';
  }).join('');
  const errSummary = errorRows.length > 0 ? `
    <div style="background:#fee2e2;border-radius:8px;padding:12px;margin-top:12px">
      <strong style="color:#b91c1c">&#9888; ${errorRows.length} row${errorRows.length > 1 ? 's' : ''} have errors</strong>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;font-size:.85rem">
        <input type="checkbox" ${skipInvalid ? 'checked' : ''} onchange="window._importToggleSkip('sessions',this.checked)">
        Skip invalid rows and import ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''}
      </label>
    </div>` : '';
  return `
    <div class="card" style="max-width:900px;margin:0 auto">
      ${_renderStepBar(3, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h3 style="margin-bottom:2px">Preview &amp; Validation</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">
            <span style="color:#10b981;font-weight:600">${validRows.length} valid</span>
            ${errorRows.length > 0 ? ' &middot; <span style="color:#ef4444;font-weight:600">' + errorRows.length + ' errors</span>' : ''}
          </p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importGoBack('sessions')">&larr; Back</button>
          <button class="btn btn-primary btn-sm" onclick="window._importExecuteSessions()">Import Now</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table class="import-preview-table">
        <thead><tr><th>#</th>${ths}<th>Status</th></tr></thead>
        <tbody>${trs}</tbody>
      </table></div>
      ${errSummary}
    </div>`;
}

function _renderSessionStep4(result) {
  const icon = result.errors && result.errors.length === 0 ? '✅' : '⚠️';
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(4, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:3rem;margin-bottom:8px">${icon}</div>
        <h3>Import Complete</h3>
        <p style="font-size:1rem;margin-top:4px">
          <strong style="color:#10b981">${result.successCount} session${result.successCount !== 1 ? 's' : ''} imported successfully.</strong>
          ${result.errors && result.errors.length > 0 ? '<br><span style="color:#ef4444">' + result.errors.length + ' error' + (result.errors.length !== 1 ? 's' : '') + ' skipped.</span>' : ''}
        </p>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px;justify-content:center">
        <button class="btn btn-secondary" onclick="window._importReset('sessions')">Import More</button>
      </div>
    </div>`;
}

// ── Protocol JSON wizard steps ────────────────────────────────────────────────
function _renderProtocolStep1() {
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(1, ['Upload', 'Preview', 'Result'])}
      <h3 style="margin-bottom:4px">Import Protocol JSON</h3>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">Required fields: name, modality, steps (array). Accepted: .json</p>
      <div class="import-dropzone" id="protocol-dropzone"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');window._importHandleFile('protocol',event.dataTransfer.files[0])">
        <div class="import-dropzone-icon">📋</div>
        <div style="font-weight:600;margin-bottom:6px">Drag &amp; drop JSON file here</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px">or click to browse</div>
        <input type="file" id="protocol-file-input" accept=".json" style="display:none" onchange="window._importHandleFile('protocol',this.files[0])">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('protocol-file-input').click()">Browse Files</button>
      </div>
      <div style="margin-top:20px">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:6px;color:var(--text-muted)">— or paste JSON —</div>
        <textarea id="protocol-paste-area" rows="8" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-family:monospace;font-size:.8rem;resize:vertical" placeholder='{"name":"TMS Protocol","modality":"TMS","steps":[]}'></textarea>
        <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="window._importProtocolFromPaste()">Parse &amp; Preview &rarr;</button>
      </div>
    </div>`;
}

function _renderProtocolStep2(state) {
  const p = state.jsonData;
  const stepsHtml = Array.isArray(p.steps) ? p.steps.map((s, i) =>
    '<div style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;font-size:.85rem"><strong>Step ' + (i + 1) + ':</strong> ' + (s.label || s.name || JSON.stringify(s)) + '</div>'
  ).join('') : '<p style="color:#ef4444">No steps array found.</p>';
  return `
    <div class="card" style="max-width:700px;margin:0 auto">
      ${_renderStepBar(2, ['Upload', 'Preview', 'Result'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3>Protocol Preview</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importReset('protocol')">&larr; Back</button>
          <button class="btn btn-primary btn-sm" onclick="window._importExecuteProtocol()">Import Protocol</button>
        </div>
      </div>
      <div style="background:var(--surface);border-radius:8px;padding:16px;margin-bottom:12px">
        <div style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Protocol Name</div>
        <div style="font-weight:700;font-size:1.1rem">${p.name || '—'}</div>
        <div style="display:flex;gap:20px;margin-top:10px;font-size:.85rem">
          <div><span style="color:var(--text-muted)">Modality: </span><strong>${p.modality || '—'}</strong></div>
          <div><span style="color:var(--text-muted)">Steps: </span><strong>${Array.isArray(p.steps) ? p.steps.length : 0}</strong></div>
          ${p.description ? '<div><span style="color:var(--text-muted)">Description: </span>' + p.description + '</div>' : ''}
        </div>
      </div>
      <div style="font-size:.82rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">Steps</div>
      ${stepsHtml}
    </div>`;
}

function _renderProtocolStep3(result) {
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(3, ['Upload', 'Preview', 'Result'])}
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:3rem;margin-bottom:8px">${result.ok ? '✅' : '❌'}</div>
        <h3>${result.ok ? 'Protocol Imported' : 'Import Failed'}</h3>
        <p style="font-size:.95rem;margin-top:4px;color:${result.ok ? '#10b981' : '#ef4444'}">${result.message}</p>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
        <button class="btn btn-secondary" onclick="window._importReset('protocol')">Import Another</button>
      </div>
    </div>`;
}

// ── Import History tab ────────────────────────────────────────────────────────
function _renderImportHistoryTab() {
  const history = getImportHistory();
  function statusBadge(s) {
    if (s === 'completed') return '<span class="badge" style="background:#0d9488;color:#fff">Completed</span>';
    if (s === 'partial')   return '<span class="badge" style="background:#d97706;color:#fff">Partial</span>';
    return '<span class="badge" style="background:#dc2626;color:#fff">Failed</span>';
  }
  const rows = history.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No import history</td></tr>'
    : history.map(r => {
        const detailRows = r.errors.length > 0
          ? '<table style="width:100%;font-size:.8rem;border-collapse:collapse"><thead><tr style="color:var(--text-muted)"><th style="text-align:left;padding:4px 8px">Row</th><th style="text-align:left;padding:4px 8px">Field</th><th style="text-align:left;padding:4px 8px">Value</th><th style="text-align:left;padding:4px 8px">Error</th></tr></thead><tbody>' +
            r.errors.map(e => '<tr><td style="padding:4px 8px">' + e.row + '</td><td style="padding:4px 8px">' + e.field + '</td><td style="padding:4px 8px">' + e.value + '</td><td style="padding:4px 8px;color:#ef4444">' + e.message + '</td></tr>').join('') +
            '</tbody></table>'
          : '<span style="color:var(--text-muted);font-size:.85rem">No errors in this import.</span>';
        return '<tr class="import-history-row" style="cursor:pointer" onclick="window._importToggleHistoryDetail(\'' + r.id + '\')">' +
          '<td><span style="font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--text-muted)">' + r.type + '</span></td>' +
          '<td>' + r.fileName + '</td>' +
          '<td style="font-size:.8rem;color:var(--text-muted)">' + new Date(r.date).toLocaleDateString() + '</td>' +
          '<td style="text-align:center">' + r.rowCount + '</td>' +
          '<td style="text-align:center;color:#10b981;font-weight:600">' + r.successCount + '</td>' +
          '<td style="text-align:center;color:' + (r.errorCount > 0 ? '#ef4444' : 'var(--text-muted)') + '">' + r.errorCount + '</td>' +
          '<td>' + statusBadge(r.status) + '</td>' +
          '<td style="font-size:.75rem;color:var(--text-muted)">' + (r.errors.length > 0 ? '&#9660; Details' : '') + '</td>' +
        '</tr>' +
        '<tr id="hist-detail-' + r.id + '" style="display:none"><td colspan="8" style="padding:8px 16px;background:var(--surface)">' +
          detailRows +
          '<br><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="window._importDownloadErrors(\'' + r.id + '\')">&#8595; Download Error Report</button>' +
        '</td></tr>';
      }).join('');
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3>Import History</h3>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="window._importClearHistory()">Clear History</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="font-size:.75rem;text-transform:uppercase;color:var(--text-muted)">
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)">Type</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)">File</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)">Date</th>
            <th style="text-align:center;padding:8px 12px;border-bottom:2px solid var(--border)">Rows</th>
            <th style="text-align:center;padding:8px 12px;border-bottom:2px solid var(--border)">Success</th>
            <th style="text-align:center;padding:8px 12px;border-bottom:2px solid var(--border)">Errors</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)">Status</th>
            <th style="padding:8px 12px;border-bottom:2px solid var(--border)"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Main page renderer ────────────────────────────────────────────────────────
function _renderImportPage(activeTab) {
  const el = document.getElementById('content');
  if (!el) return;
  let tabContent = '';
  if (activeTab === 'patients') {
    const s = _importState.patients;
    if (s.step === 1) tabContent = _renderPatientStep1();
    else if (s.step === 2) tabContent = _renderPatientStep2(s);
    else if (s.step === 3) tabContent = _renderPatientStep3(s);
    else tabContent = _renderPatientStep4(s.result || { successCount: 0, errors: [], importId: '' });
  } else if (activeTab === 'sessions') {
    const s = _importState.sessions;
    if (s.step === 1) tabContent = _renderSessionStep1();
    else if (s.step === 2) tabContent = _renderSessionStep2(s);
    else if (s.step === 3) tabContent = _renderSessionStep3(s);
    else tabContent = _renderSessionStep4(s.result || { successCount: 0, errors: [] });
  } else if (activeTab === 'protocol') {
    const s = _importState.protocol;
    if (s.step === 1) tabContent = _renderProtocolStep1();
    else if (s.step === 2) tabContent = _renderProtocolStep2(s);
    else tabContent = _renderProtocolStep3(s.result || { ok: false, message: '' });
  } else if (activeTab === 'history') {
    tabContent = _renderImportHistoryTab();
  }
  el.innerHTML = '<div style="max-width:1000px;margin:0 auto;padding:0 16px 40px">' +
    _renderImportTabs(activeTab) + tabContent + '</div>';
  window._currentImportTab = activeTab;
}

// ── Global handlers ───────────────────────────────────────────────────────────
window._importSwitchTab = function(tab) { _renderImportPage(tab); };

window._importHandleFile = function(type, file) {
  if (!file) return;
  if (type === 'protocol') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target.result);
        _importState.protocol.jsonData = json;
        _importState.protocol.fileName = file.name;
        _importState.protocol.step = 2;
        _renderImportPage('protocol');
      } catch (_err) {
        alert('Invalid JSON file. Please check the file and try again.');
      }
    };
    reader.readAsText(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseCSV(e.target.result);
    const state = _importState[type];
    const schema = type === 'patients' ? PATIENT_IMPORT_SCHEMA : SESSION_IMPORT_SCHEMA;
    state.csvData = parsed;
    state.fileName = file.name;
    state.step = 2;
    state.mappings = autoMapColumns(parsed.headers, [...schema.required, ...schema.optional]);
    _renderImportPage(type === 'patients' ? 'patients' : 'sessions');
  };
  reader.readAsText(file);
};

window._importSetMapping = function(type, field, csvCol) {
  _importState[type].mappings[field] = csvCol;
};

window._importReset = function(type) {
  if (type === 'protocol') {
    _importState.protocol = { step: 1, jsonData: null, fileName: '', pasteText: '' };
    _renderImportPage('protocol');
  } else {
    _importState[type] = { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false };
    _renderImportPage(type === 'patients' ? 'patients' : 'sessions');
  }
};

window._importGoBack = function(type) {
  _importState[type].step = 2;
  _renderImportPage(type === 'patients' ? 'patients' : 'sessions');
};

window._importToggleSkip = function(type, val) {
  _importState[type].skipInvalid = val;
};

window._importValidate = function(type) {
  const state = _importState[type];
  const schema = type === 'patients' ? PATIENT_IMPORT_SCHEMA : SESSION_IMPORT_SCHEMA;
  const { csvData, mappings } = state;
  if (!csvData) return;
  const missingRequired = schema.required.filter(f => !mappings[f]);
  if (missingRequired.length > 0) {
    alert('Please map required fields: ' + missingRequired.join(', '));
    return;
  }
  const validRows = [];
  const errorRows = [];
  csvData.rows.forEach((row, idx) => {
    const rawObj = _applyMappings(row, csvData.headers, mappings, schema);
    const { transformed, errors } = _validateAndTransformRow(rawObj, schema);
    transformed._rowIndex = idx;
    transformed._errors = errors;
    if (errors.length === 0) validRows.push(transformed);
    else errorRows.push(transformed);
  });
  state.validRows = validRows;
  state.errorRows = errorRows;
  state.step = 3;
  _renderImportPage(type === 'patients' ? 'patients' : 'sessions');
};

window._importExecutePatients = async function() {
  const state = _importState.patients;
  const rowsToImport = state.skipInvalid ? state.validRows : state.validRows;
  const errors = [];
  let successCount = 0;
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = '<div style="max-width:500px;margin:60px auto;text-align:center">' +
      '<h3>Importing patients\u2026</h3>' +
      '<div class="import-progress" style="margin:16px 0"><div class="import-progress-fill" id="import-prog-fill" style="width:0%"></div></div>' +
      '<div id="import-prog-label" style="font-size:.85rem;color:var(--text-muted)">0 / ' + rowsToImport.length + '</div>' +
      '</div>';
  }
  const fill = document.getElementById('import-prog-fill');
  const lbl  = document.getElementById('import-prog-label');
  for (let i = 0; i < rowsToImport.length; i++) {
    const row = rowsToImport[i];
    try {
      let saved = false;
      try {
        await api.createPatient({ name: row.name, dob: row.dob, condition: row.condition, email: row.email, phone: row.phone, clinician: row.clinician, notes: row.notes, gender: row.gender, address: row.address });
        saved = true;
      } catch (_apiErr) {
        const patients = JSON.parse(localStorage.getItem('ds_patients') || '[]');
        patients.push({ id: 'pat_' + Date.now() + '_' + i, ...row, createdAt: new Date().toISOString() });
        localStorage.setItem('ds_patients', JSON.stringify(patients));
        saved = true;
      }
      if (saved) successCount++;
    } catch (err) {
      errors.push({ row: (row._rowIndex || i) + 1, field: 'general', value: '', message: String(err) });
    }
    if (fill) fill.style.width = Math.round(((i + 1) / rowsToImport.length) * 100) + '%';
    if (lbl)  lbl.textContent = (i + 1) + ' / ' + rowsToImport.length;
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const importId = 'imp_' + Date.now();
  saveImportRecord({
    id: importId, type: 'patients', fileName: state.fileName,
    rowCount: rowsToImport.length, successCount, errorCount: errors.length,
    date: new Date().toISOString(), errors: errors.slice(0, 50),
    status: errors.length === 0 ? 'completed' : successCount === 0 ? 'failed' : 'partial',
  });
  state.result = { successCount, errors, importId };
  state.step = 4;
  _renderImportPage('patients');
};

window._importExecuteSessions = async function() {
  const state = _importState.sessions;
  const rowsToImport = state.skipInvalid ? state.validRows : state.validRows;
  let successCount = 0;
  const errors = [];
  for (let i = 0; i < rowsToImport.length; i++) {
    const row = rowsToImport[i];
    try {
      try {
        await api.logSession({ patientName: row.patientName, date: row.date, modality: row.modality, duration: row.duration, amplitude: row.amplitude, frequency: row.frequency, notes: row.notes, outcome: row.outcome });
      } catch (_apiErr) {
        const sessions = JSON.parse(localStorage.getItem('ds_sessions') || '[]');
        sessions.push({ id: 'sess_' + Date.now() + '_' + i, ...row, createdAt: new Date().toISOString() });
        localStorage.setItem('ds_sessions', JSON.stringify(sessions));
      }
      successCount++;
    } catch (err) {
      errors.push({ row: (row._rowIndex || i) + 1, field: 'general', value: '', message: String(err) });
    }
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }
  saveImportRecord({
    id: 'imp_' + Date.now(), type: 'sessions', fileName: state.fileName,
    rowCount: rowsToImport.length, successCount, errorCount: errors.length,
    date: new Date().toISOString(), errors: errors.slice(0, 50),
    status: errors.length === 0 ? 'completed' : successCount === 0 ? 'failed' : 'partial',
  });
  state.result = { successCount, errors };
  state.step = 4;
  _renderImportPage('sessions');
};

window._importProtocolFromPaste = function() {
  const ta = document.getElementById('protocol-paste-area');
  if (!ta || !ta.value.trim()) { alert('Please paste valid JSON first.'); return; }
  try {
    const json = JSON.parse(ta.value.trim());
    _importState.protocol.jsonData = json;
    _importState.protocol.fileName = 'pasted-json';
    _importState.protocol.step = 2;
    _renderImportPage('protocol');
  } catch (_err) {
    alert('Invalid JSON. Please check the syntax and try again.');
  }
};

window._importExecuteProtocol = function() {
  const state = _importState.protocol;
  const p = state.jsonData;
  const errs = [];
  if (!p || !p.name) errs.push('name is required');
  if (!p || !p.modality) errs.push('modality is required');
  if (!p || !Array.isArray(p.steps) || p.steps.length === 0) errs.push('steps array is required and must be non-empty');
  if (errs.length > 0) {
    state.result = { ok: false, message: errs.join('; ') };
    state.step = 3;
    _renderImportPage('protocol');
    return;
  }
  const protocols = JSON.parse(localStorage.getItem('ds_protocols') || '[]');
  protocols.push({ id: 'proto_' + Date.now(), ...p, importedAt: new Date().toISOString() });
  localStorage.setItem('ds_protocols', JSON.stringify(protocols));
  saveImportRecord({
    id: 'imp_' + Date.now(), type: 'protocols', fileName: state.fileName,
    rowCount: 1, successCount: 1, errorCount: 0,
    date: new Date().toISOString(), errors: [], status: 'completed',
  });
  state.result = { ok: true, message: 'Protocol "' + p.name + '" imported successfully with ' + p.steps.length + ' steps.' };
  state.step = 3;
  _renderImportPage('protocol');
};

window._importDownloadErrors = function(importId) {
  const history = getImportHistory();
  const record = history.find(r => r.id === importId);
  if (!record || record.errors.length === 0) { alert('No errors to download.'); return; }
  const header = 'row,field,value,error\n';
  const body = record.errors.map(e =>
    e.row + ',"' + e.field + '","' + String(e.value).replace(/"/g, '""') + '","' + e.message.replace(/"/g, '""') + '"'
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'errors_' + (record.fileName || importId) + '.csv'; a.click();
  URL.revokeObjectURL(url);
};

window._importToggleHistoryDetail = function(id) {
  const row = document.getElementById('hist-detail-' + id);
  if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
};

window._importClearHistory = function() {
  if (!confirm('Clear all import history? This cannot be undone.')) return;
  localStorage.removeItem('ds_import_history');
  _renderImportPage('history');
};

// ── Exported page entry point ─────────────────────────────────────────────────
export async function pgDataImport(setTopbar) {
  setTopbar('Data Import &amp; Migration', '<button class="btn btn-ghost btn-sm" onclick="window._importSwitchTab(\'history\')">🕒 History</button>');
  _importState.patients = { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false };
  _importState.sessions = { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false };
  _importState.protocol = { step: 1, jsonData: null, fileName: '', pasteText: '' };
  _renderImportPage('patients');
}
