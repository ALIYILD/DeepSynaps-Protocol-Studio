// Patient portal pages — simpler, calmer UI than the professional app
// All pages render into #patient-content
import { api } from './api.js';
import { currentUser } from './auth.js';
import { t, getLocale, setLocale, LOCALES } from './i18n.js';

// ── Nav definition ────────────────────────────────────────────────────────────
function _patientNav() {
  return [
    { id: 'patient-portal',       label: t('patient.nav.dashboard'),   icon: '◈' },
    { id: 'patient-sessions',     label: t('patient.nav.sessions'),    icon: '◧' },
    { id: 'patient-course',       label: t('patient.nav.course'),      icon: '◎' },
    { id: 'patient-assessments',  label: t('patient.nav.assessments'), icon: '◉' },
    { id: 'patient-reports',      label: t('patient.nav.reports'),     icon: '◱' },
    { id: 'patient-messages',     label: t('patient.nav.messages'),    icon: '◫' },
    { id: 'patient-wearables',    label: t('patient.nav.wearables'),   icon: '◌' },
    { id: 'pt-wellness',          label: t('patient.nav.checkin'),     icon: '💚' },
    { id: 'pt-learn',             label: t('patient.nav.learn'),       icon: '📚' },
    { id: 'pt-media-history',     label: 'My Updates',                 icon: '📋' },
    { id: 'pt-media-upload',      label: 'Send Update',                icon: '📤' },
    { id: 'patient-profile',      label: t('patient.nav.profile'),     icon: '◇' },
  ];
}

function _patientBottomNav() {
  return [
    { id: 'patient-portal',    label: t('patient.bottom.home'),     icon: '◈' },
    { id: 'patient-sessions',  label: t('patient.bottom.sessions'), icon: '◧' },
    { id: 'pt-wellness',       label: t('patient.bottom.checkin'),  icon: '💚' },
    { id: 'patient-messages',  label: t('patient.bottom.messages'), icon: '◫' },
    { id: 'patient-profile',   label: t('patient.bottom.profile'),  icon: '◇' },
    { id: 'pt-journal',        label: t('patient.bottom.journal'),  icon: '📔' },
    { id: 'pt-notifications',  label: t('patient.bottom.alerts'),   icon: '🔔' },
  ];
}

export function renderPatientNav(currentPage) {
  document.getElementById('patient-nav-list').innerHTML = _patientNav().map(n => {
    const badge = n.badge ? `<span class="nav-badge">${n.badge}</span>` : '';
    return `<div class="nav-item ${currentPage === n.id ? 'active' : ''}" onclick="window._navPatient('${n.id}')">
      <span class="nav-icon">${n.icon}</span>
      <span style="flex:1">${n.label}</span>${badge}
    </div>`;
  }).join('');

  const bottomNav = document.getElementById('pt-bottom-nav');
  if (bottomNav) {
    bottomNav.innerHTML = _patientBottomNav().map(n => {
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
        <div class="pt-countdown-label">${t('patient.dashboard.days')}</div>
      </div>
    </div>
    <div style="margin-top:8px;text-align:center">
      <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${t('patient.dashboard.next_session')}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${nextLabel || '—'}</div>
      ${hoursLeft < 24 ? `<div style="font-size:11px;color:var(--teal);margin-top:3px">${hoursLeft}${t('patient.dashboard.hours_remaining')}</div>` : ''}
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
    if (mins < 1)  return t('time.just_now');
    if (mins < 60) return t('time.minutes_ago', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return t('time.hours_ago', { n: hrs });
    const days = Math.floor(hrs / 24);
    return t('time.days_ago', { n: days });
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
  setTopbar(t('patient.nav.dashboard'));
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
  if (!checkedInToday) tasks.push({ label: t('patient.task.complete_checkin'), link: 'pt-wellness' });
  const taskCount = tasks.length;

  // Latest outcome / document
  const sortedOutcomes = outcomes.slice().sort((a, b) =>
    new Date(b.administered_at || 0) - new Date(a.administered_at || 0));
  const latestDoc = sortedOutcomes[0] || null;

  // Treatment phase + plain-language helpers (defined as named functions to avoid lint warnings)
  function phaseLabel(pct) {
    if (!pct)       return t('patient.phase.starting');
    if (pct <= 25)  return t('patient.phase.initial');
    if (pct <= 50)  return t('patient.phase.active');
    if (pct <= 75)  return t('patient.phase.consolidation');
    if (pct < 100)  return t('patient.phase.final');
    return t('patient.phase.complete');
  }
  function plainLang(pct) {
    if (!pct)       return t('patient.phase.desc.starting');
    if (pct <= 25)  return t('patient.phase.desc.initial');
    if (pct <= 50)  return t('patient.phase.desc.active');
    if (pct <= 75)  return t('patient.phase.desc.consolidation');
    if (pct < 100)  return t('patient.phase.desc.final');
    return t('patient.phase.desc.complete');
  }

  // Greeting
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? t('greeting.morning') : hour < 17 ? t('greeting.afternoon') : t('greeting.evening');
  const loc      = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
  const todayFmt = new Date().toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' });

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
        <div class="pt-pc-eyebrow">${t('patient.card.next_session')}</div>
        ${nextSess
          ? `<div class="pt-pc-main">${nextLabel}</div>
             <div class="pt-pc-detail">${nextTime}${nextSess.modality_slug ? ' · ' + nextSess.modality_slug.toUpperCase() : ''}</div>`
          : `<div class="pt-pc-main pt-pc-main--muted">${t('patient.card.not_scheduled')}</div>
             <div class="pt-pc-detail">${t('patient.card.contact_clinic')}</div>`}
        <div class="pt-pc-action">${t('patient.card.view_sessions')}</div>
      </div>

      <div class="pt-primary-card plan" onclick="window._navPatient('patient-course')" style="cursor:pointer" role="button" tabindex="0">
        <div class="pt-pc-eyebrow">${t('patient.card.treatment_plan')}</div>
        ${activeCourse
          ? `<div class="pt-pc-main">${activeCourse.condition_slug || t('status.active')}</div>
             <div class="pt-pc-detail">${sessDelivered} of ${totalPlanned ?? '?'} sessions${progressPct !== null ? ' · ' + progressPct + '%' : ''}</div>`
          : `<div class="pt-pc-main pt-pc-main--muted">${t('patient.card.not_assigned')}</div>
             <div class="pt-pc-detail">${t('patient.card.speak_clinic')}</div>`}
        <div class="pt-pc-action">${t('patient.card.view_plan')}</div>
      </div>

      <div class="pt-primary-card ${taskCount > 0 ? 'tasks' : 'clear'}"
           onclick="window._navPatient('${taskCount > 0 ? tasks[0].link : 'patient-assessments'}')"
           style="cursor:pointer" role="button" tabindex="0">
        <div class="pt-pc-eyebrow">${t('patient.card.tasks_due')}</div>
        ${taskCount > 0
          ? `<div class="pt-pc-main">${taskCount} task${taskCount > 1 ? 's' : ''}</div>
             <div class="pt-pc-detail">${tasks[0].label}</div>`
          : `<div class="pt-pc-main pt-pc-main--clear">${t('patient.card.all_caught_up')}</div>
             <div class="pt-pc-detail">${t('patient.card.nothing_pending')}</div>`}
        <div class="pt-pc-action">${taskCount > 0 ? t('patient.card.complete_now') : t('patient.card.view_assessments')}</div>
      </div>
    </div>

    <!-- Daily Check-in -->
    ${checkedInToday
      ? `<div class="card" style="margin-bottom:20px;border-color:rgba(0,212,188,0.35);background:rgba(0,212,188,0.04)">
          <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:13px 16px">
            <span style="font-size:15px;color:var(--teal)">✓</span>
            <div style="flex:1">
              <span style="font-size:13px;font-weight:500;color:var(--text-primary)">${t('patient.dash.checkin_done')}</span>
              <span style="font-size:11.5px;color:var(--text-tertiary);margin-left:8px">${t('patient.dash.team_update')}</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('pt-wellness')">${t('common.view')} →</button>
          </div>
        </div>`
      : `<div class="card" style="margin-bottom:20px" id="pt-dash-checkin-card">
          <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
            <h3>${t('patient.nav.checkin')}</h3>
            <span style="font-size:10.5px;font-weight:600;color:var(--amber,#f59e0b);background:rgba(245,158,11,0.1);padding:3px 9px;border-radius:99px;border:1px solid rgba(245,158,11,0.25)">${t('patient.dash.due_today')}</span>
          </div>
          <div class="card-body" style="padding:16px 20px">
            <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:18px;line-height:1.55">
              ${t('patient.dash.rate_today')}
            </div>
            <div class="pt-checkin-grid">
              ${[
                { id: 'dc-mood',   label: t('patient.slider.mood'),   color: 'var(--teal)',   low: t('patient.slider.low'),  high: t('patient.slider.good') },
                { id: 'dc-sleep',  label: t('patient.slider.sleep'),  color: 'var(--blue)',   low: t('patient.slider.poor'), high: t('patient.slider.good') },
                { id: 'dc-energy', label: t('patient.slider.energy'), color: 'var(--violet)', low: t('patient.slider.low'),  high: t('patient.slider.high') },
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
              <label style="font-size:12.5px;font-weight:500;color:var(--text-primary);display:block;margin-bottom:6px">${t('patient.dash.side_effects')}</label>
              <select id="dc-side-effects" class="form-control" style="font-size:12.5px">
                <option value="none">${t('checkin.se.none')}</option>
                <option value="headache">${t('checkin.se.headache')}</option>
                <option value="fatigue">${t('checkin.se.fatigue')}</option>
                <option value="dizziness">${t('checkin.se.dizziness')}</option>
                <option value="tingling">${t('checkin.se.tingling')}</option>
                <option value="nausea">${t('checkin.se.nausea')}</option>
                <option value="other">${t('checkin.se.other')}</option>
              </select>
            </div>
            <div style="margin-top:10px">
              <textarea id="dc-notes" class="form-control" rows="2"
                        placeholder="${t('patient.dash.notes_placeholder')}"
                        style="resize:none;font-size:12.5px"></textarea>
            </div>
            <button class="btn btn-primary" style="width:100%;margin-top:14px;padding:11px"
                    onclick="window._dashSubmitCheckin()">
              ${t('patient.dash.submit_checkin')}
            </button>
          </div>
        </div>`}

    <!-- Treatment Progress -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>${t('patient.progress.title')}</h3>
        <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-course')">${t('patient.progress.full_plan')}</button>
      </div>
      <div class="card-body" style="padding:16px 20px">
        ${activeCourse
          ? `<div class="pt-progress-rows">
              <div class="pt-progress-row">
                <span class="pt-pr-label">${t('patient.progress.phase')}</span>
                <span class="pt-pr-value">${phaseLabel(progressPct)}</span>
              </div>
              <div class="pt-progress-row">
                <span class="pt-pr-label">${t('patient.progress.sessions_done')}</span>
                <span class="pt-pr-value">${sessDelivered} of ${totalPlanned ?? '—'}</span>
              </div>
              ${latestDoc ? `
              <div class="pt-progress-row">
                <span class="pt-pr-label">${t('patient.progress.latest_assessment')}</span>
                <span class="pt-pr-value">${latestDoc.template_title || t('status.completed')} · ${fmtDate(latestDoc.administered_at)}</span>
              </div>` : ''}
              <div class="pt-progress-row">
                <span class="pt-pr-label">${t('patient.progress.care_status')}</span>
                <span class="pt-pr-value" style="color:var(--teal)">${activeCourse.status === 'active' ? t('patient.progress.care_active') : (activeCourse.status || t('status.active'))}</span>
              </div>
            </div>
            <div class="progress-bar" style="height:7px;margin:14px 0 4px">
              <div class="progress-fill" style="width:${progressPct || 0}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-tertiary);margin-bottom:16px">
              <span>0 sessions</span>
              <span>${totalPlanned ? t('patient.progress.sessions_total', { n: totalPlanned }) : t('patient.progress.no_total')}</span>
            </div>
            <div class="pt-plain-language">
              <div class="pt-pl-title">${t('patient.progress.what_this_means')}</div>
              <div class="pt-pl-body">${plainLang(progressPct)}</div>
              <div class="pt-pl-footer">
                <a href="#" onclick="window._navPatient('pt-learn');return false"
                   style="color:var(--teal);text-decoration:none;font-size:11.5px">${t('patient.progress.glossary')}</a>
                <span style="color:var(--text-tertiary);margin:0 8px">·</span>
                <span style="font-size:11.5px;color:var(--text-tertiary)">${t('patient.progress.question_note')}</span>
              </div>
            </div>`
          : `<div style="text-align:center;padding:24px;color:var(--text-tertiary)">
              <div style="font-size:18px;margin-bottom:8px;opacity:.4">◎</div>
              ${t('patient.card.not_assigned')}<br>
              <span style="font-size:12px">${t('patient.card.contact_clinic')}</span>
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
        <button class="btn btn-ghost btn-sm" style="margin-top:12px"
                onclick="window._navPatient('patient-sessions')">Retry \u2192</button>
      </div>`;
    return;
  }

  const sessions    = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const outcomes    = Array.isArray(outcomesRaw) ? outcomesRaw : [];
  const coursesArr  = Array.isArray(coursesRaw)  ? coursesRaw  : [];
  const activeCourse = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  // ── Safe HTML escaper (fix #5) ──────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ── Status helpers (fix #11) ────────────────────────────────────────────────
  // Returns display metadata for any session status string.
  // Extension point: add new statuses here as the backend exposes them.
  function statusInfo(rawStatus) {
    const s = (rawStatus || '').toLowerCase().trim();
    switch (s) {
      case 'cancelled':             return { label: 'Cancelled',    pillClass: 'pt-pill-cancelled',   iconChar: '\u2715', iconClass: 'cancelled'    };
      case 'missed':
      case 'no-show':
      case 'no_show':               return { label: 'Missed',       pillClass: 'pt-pill-missed',      iconChar: '\u25a1', iconClass: 'missed'       };
      case 'rescheduled':           return { label: 'Rescheduled',  pillClass: 'pt-pill-rescheduled', iconChar: '\u21bb', iconClass: 'rescheduled'  };
      case 'interrupted':           return { label: 'Interrupted',  pillClass: 'pt-pill-interrupted', iconChar: '\u25d0', iconClass: 'interrupted'  };
      case 'completed':
      case 'done':
      default:                      return { label: 'Done',         pillClass: 'pill-active',         iconChar: '\u2713', iconClass: 'done'         };
    }
  }

  // ── Modality label (fix #13: normalise slugs with hyphens/underscores) ──────
  // Extension point: pass per-modality prep objects here in a future version.
  function modalityLabel(slug) {
    if (!slug) return null;
    // Normalise: lowercase, replace separators with nothing
    const key = slug.toLowerCase().replace(/[-_\s]/g, '');
    const MAP = {
      tms:             'TMS',
      rtms:            'rTMS',
      dtms:            'Deep TMS',
      tdcs:            'tDCS',
      tacs:            'tACS',
      trns:            'tRNS',
      neurofeedback:   'Neurofeedback',
      nfb:             'Neurofeedback',
      hegnfb:          'HEG Neurofeedback',
      heg:             'HEG Neurofeedback',
      lensnfb:         'LENS Neurofeedback',
      lens:            'LENS Neurofeedback',
      qeeg:            'qEEG Assessment',
      pemf:            'PEMF Therapy',
      biofeedback:     'Biofeedback',
      hrvbiofeedback:  'HRV Biofeedback',
      hrv:             'HRV Biofeedback',
      hrvb:            'HRV Biofeedback',
      pbm:             'Photobiomodulation',
      nirs:            'fNIRS Session',
      assessment:      'Assessment',
    };
    if (MAP[key]) return MAP[key];
    // Graceful fallback: title-case the original slug
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Tolerance \u2192 patient-friendly (fix #9: guard empty/null) ────────────────
  function toleranceLabel(val) {
    if (val == null || val === '') return null;
    const v = String(val).toLowerCase().trim();
    if (!v) return null;
    if (['excellent', 'good', '1', '2'].includes(v))     return 'Tolerated well';
    if (['mild', 'moderate', '3', '4', '5'].includes(v)) return 'Mild sensation';
    if (['poor', '6', '7'].includes(v))                   return 'Some discomfort noted';
    if (['high', 'very high', '8', '9', '10'].includes(v)) return 'Significant discomfort';
    // Already a readable string \u2014 capitalise and pass through
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  // ── Session classification (fix #3 + #4) ────────────────────────────────────
  // Statuses that definitively belong in history, not the upcoming list
  const PAST_STATUSES = new Set([
    'completed', 'done', 'cancelled', 'missed', 'no-show', 'no_show',
    'interrupted', 'rescheduled',
  ]);
  const now = Date.now();

  // Upcoming: future scheduled_at AND not in a terminal/past status
  const upcoming = sessions
    .filter(s => {
      if (!s.scheduled_at) return false;
      if (new Date(s.scheduled_at).getTime() <= now) return false;
      const st = (s.status || '').toLowerCase().trim();
      return !PAST_STATUSES.has(st);
    })
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  // Past: anything delivered OR in a past status (includes cancelled/missed/etc.)
  const pastSessions = sessions
    .filter(s => {
      if (s.delivered_at) return true;
      const st = (s.status || '').toLowerCase().trim();
      if (PAST_STATUSES.has(st)) return true;
      // Also include sessions whose scheduled_at has already passed
      if (s.scheduled_at && new Date(s.scheduled_at).getTime() <= now) return true;
      return false;
    })
    .sort((a, b) => {
      // Sort newest first: prefer delivered_at, fall back to scheduled_at
      const da = new Date(b.delivered_at || b.scheduled_at || b.created_at || 0).getTime();
      const db = new Date(a.delivered_at || a.scheduled_at || a.created_at || 0).getTime();
      return da - db;
    });

  // ── Stable session numbering (fix #1 + #2) ──────────────────────────────────
  // Only "delivered" (completed/done) sessions get a sequential number.
  // We sort those ascending to assign 1, 2, 3... regardless of display order.
  // Cancelled/missed sessions do NOT consume a number.
  // Extension point: if the backend later supplies session_number directly,
  // that value takes priority via sessionNumFor().
  const deliveredInOrder = sessions
    .filter(s => s.delivered_at || ['completed', 'done'].includes((s.status || '').toLowerCase().trim()))
    .sort((a, b) => new Date(a.delivered_at || 0) - new Date(b.delivered_at || 0));
  const deliveredNumMap = new Map();
  deliveredInOrder.forEach((s, i) => {
    // Use backend-supplied session_number if present, else 1-based from oldest
    deliveredNumMap.set(s, Number.isFinite(s.session_number) ? s.session_number : (i + 1));
  });
  function sessionNumFor(s) {
    // For upcoming: use backend value or estimate from delivered count
    if (deliveredNumMap.has(s)) return deliveredNumMap.get(s);
    return null; // non-delivered past sessions (cancelled/missed) get no number
  }

  // ── Outcomes: allow multiple per date (fix #8) ───────────────────────────────
  const outcomesByDate = {};
  outcomes.forEach(o => {
    const d = (o.administered_at || '').slice(0, 10);
    if (!d) return;
    if (!outcomesByDate[d]) outcomesByDate[d] = [];
    outcomesByDate[d].push(o);
  });

  // ── Course metrics ────────────────────────────────────────────────────────────
  const totalPlanned  = activeCourse?.total_sessions_planned ?? null;
  const sessDelivered = activeCourse?.session_count ?? deliveredInOrder.length;
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

  // ── Prep content (V1: static, modality-aware stubs for future extension) ─────
  // Extension point: replace getSessionPrep(session) with an API call or
  // per-modality/per-protocol lookup when clinic-specific instructions are added.
  const DEFAULT_PREP_STEPS = [
    { icon: '\ud83d\udebf', text: 'Wash your hair the morning of your session. No conditioner, dry shampoo, or hair products.' },
    { icon: '\ud83c\udf7d\ufe0f', text: 'Eat a light meal 1\u20132 hours before. Avoid arriving very hungry or immediately after a large meal.' },
    { icon: '\ud83d\udc8a', text: 'Take your regular medications as prescribed unless your clinician has advised otherwise.' },
    { icon: '\ud83d\ude34', text: 'Aim for a normal night\u2019s sleep before your session. Fatigue can affect how you respond.' },
    { icon: '\ud83d\udcdd', text: 'Note any symptoms or changes since your last session to share with your clinician.' },
    { icon: '\ud83d\udcf5', text: 'Switch your phone to silent during the session.' },
  ];
  const DEFAULT_BRING_LIST = [
    'Your current medication list',
    'Comfortable clothing with easy access to your head and neck',
    'A water bottle',
    'Any written questions for your clinician',
    'A light snack for after (some patients feel tired post-session)',
  ];
  // getSessionPrep returns { steps, bringList, expectDuration }
  // V1: returns defaults; V2: can branch on s.modality_slug / s.clinic_notes
  function getSessionPrep(s) {
    return {
      steps:          DEFAULT_PREP_STEPS,
      bringList:      DEFAULT_BRING_LIST,
      expectDuration: s.duration_minutes
        ? `${s.duration_minutes}\u00a0minutes`
        : 'approximately 20\u201345\u00a0minutes',
    };
  }

  // ── Upcoming session card ──────────────────────────────────────────────────────
  function upcomingCardHTML(s, idx) {
    // Use backend session_number first; fall back to estimate (fix #2)
    const sessionNum  = Number.isFinite(s.session_number)
      ? s.session_number
      : (sessDelivered + idx + 1);
    const dateLong    = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString('en-US',
          { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : '\u2014';
    const timeStr     = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
    const daysAway    = s.scheduled_at
      ? Math.max(0, Math.ceil((new Date(s.scheduled_at).getTime() - now) / 86400000))
      : null;
    const isToday     = daysAway === 0;
    const isTomorrow  = daysAway === 1;
    const urgency     = isToday    ? 'Today'
                      : isTomorrow ? 'Tomorrow'
                      : daysAway !== null ? `In ${daysAway} day${daysAway > 1 ? 's' : ''}` : '';

    // Escape all user/backend-supplied strings (fix #5)
    const mod         = modalityLabel(s.modality_slug || s.condition_slug);
    const location    = esc(s.location || s.site_name || 'Your clinic');
    const clinician   = esc(s.clinician_name || s.technician_name || null);
    const duration    = s.duration_minutes ? `${s.duration_minutes} min` : null;
    const clinicNotes = esc(s.clinic_notes || s.instructions || null);

    const prep        = getSessionPrep(s);
    const autoOpen    = idx === 0;

    return `
      <div class="pt-upcoming-card ${isToday ? 'today' : isTomorrow ? 'soon' : ''}">

        <div class="pt-uc-header">
          <div class="pt-uc-primary">
            <div class="pt-uc-title">Session ${sessionNum}</div>
            <div class="pt-uc-date">${esc(dateLong)}</div>
            <div class="pt-uc-meta-row">
              ${timeStr   ? `<span class="pt-uc-meta-chip">\ud83d\udd50 ${esc(timeStr)}</span>` : ''}
              <span class="pt-uc-meta-chip">\ud83d\udccd ${location}</span>
              ${clinician ? `<span class="pt-uc-meta-chip">\ud83d\udc64 ${clinician}</span>` : ''}
              ${mod       ? `<span class="pt-uc-meta-chip pt-uc-meta-mod">${esc(mod)}</span>` : ''}
              ${duration  ? `<span class="pt-uc-meta-chip">\u23f1 ${esc(duration)}</span>` : ''}
            </div>
          </div>
          <div class="pt-uc-badges">
            ${urgency ? `<div class="pt-uc-urgency-badge ${isToday ? 'today' : isTomorrow ? 'soon' : ''}">${urgency}</div>` : ''}
            <span class="pill pill-pending" style="font-size:10px;margin-top:4px">Scheduled</span>
          </div>
        </div>

        ${clinicNotes ? `
        <div class="pt-uc-clinic-note">
          <span class="pt-uc-clinic-note-label">Note from your clinic:</span>
          ${clinicNotes}
        </div>` : ''}

        <div class="pt-uc-actions">
          <button class="btn btn-primary btn-sm"
                  onclick="window._ptTogglePrep(${idx});this.closest('.pt-upcoming-card').querySelector('#pt-prep-panel-${idx}')?.scrollIntoView({behavior:'smooth',block:'nearest'})">
            View details
          </button>
          <button class="btn btn-ghost btn-sm"
                  onclick="window._navPatient('patient-messages')">
            Contact clinic
          </button>
          <button class="btn btn-ghost btn-sm"
                  onclick="window._ptRequestReschedule(${idx})">
            Reschedule
          </button>
        </div>

        <div class="pt-uc-prep-toggle"
             onclick="window._ptTogglePrep(${idx})"
             onkeydown="if(event.key==='Enter'||event.key===' '){window._ptTogglePrep(${idx});event.preventDefault();}"
             role="button" tabindex="0"
             aria-expanded="${autoOpen}" id="pt-prep-btn-${idx}">
          <span style="font-size:13px;font-weight:500;color:var(--text-primary)">How to prepare</span>
          <span id="pt-prep-chev-${idx}" style="font-size:11px;color:var(--text-tertiary);transition:transform 0.2s">${autoOpen ? '\u25b2' : '\u25be'}</span>
        </div>

        <div id="pt-prep-panel-${idx}" class="pt-uc-prep-panel" style="display:${autoOpen ? '' : 'none'}">
          <div class="pt-prep-col-wrap">
            <div class="pt-prep-col">
              <div class="pt-prep-col-title">Before your session</div>
              <ul class="pt-prep-list">
                ${prep.steps.map(item => `
                  <li class="pt-prep-item">
                    <span class="pt-prep-ico">${item.icon}</span>
                    <span>${item.text}</span>
                  </li>`).join('')}
              </ul>
            </div>
            <div class="pt-prep-col">
              <div class="pt-prep-col-title">What to bring</div>
              <ul class="pt-prep-list">
                ${prep.bringList.map(item => `
                  <li class="pt-prep-item">
                    <span class="pt-prep-ico" style="font-size:10px;opacity:.5">\u25cf</span>
                    <span>${item}</span>
                  </li>`).join('')}
              </ul>
              <div class="pt-prep-expect-box">
                <div class="pt-prep-col-title">What to expect</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.65">
                  When you arrive, your clinician will briefly review how you\u2019ve been since your last visit.
                  Equipment setup takes 5\u201310 minutes.
                  The session itself lasts ${prep.expectDuration}.
                  You can pause or stop at any time \u2014 just let your clinician know.
                </div>
              </div>
            </div>
          </div>
          <div class="pt-uc-prep-footer">
            <div class="pt-uc-reschedule-note">
              To cancel or reschedule, please contact your clinic at least 24\u00a0hours in advance.
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages');event.stopPropagation()">
              Message clinic \u2192
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Past / completed session row ───────────────────────────────────────────────
  function pastSessionRowHTML(s, rowIdx) {
    const num       = sessionNumFor(s);
    const status    = statusInfo(s.status);
    const isNonDelivered = ['cancelled','missed','no-show','no_show','rescheduled','interrupted']
      .includes((s.status || '').toLowerCase().trim());

    // Date: prefer delivered_at for done sessions, scheduled_at otherwise
    const displayDate = fmtDate(s.delivered_at || s.scheduled_at);
    const dur         = s.duration_minutes ? `${s.duration_minutes} min` : '';
    const mod         = modalityLabel(s.modality_slug || s.condition_slug);
    const tol         = toleranceLabel(s.tolerance_rating);
    const notes       = s.post_session_notes || s.clinician_notes || null;
    const relDate     = (s.delivered_at || '').slice(0, 10);
    const relDocs     = outcomesByDate[relDate] || [];

    // Build detail rows — only for delivered sessions (fix #3: non-delivered show status info)
    const detailItems = isNonDelivered ? [] : [
      tol           ? { label: 'How it went',              val: esc(tol) }                    : null,
      mod           ? { label: 'Session type',             val: esc(mod) }                    : null,
      dur           ? { label: 'Duration',                 val: esc(dur) }                    : null,
      s.device_slug ? { label: 'Equipment',                val: esc(String(s.device_slug).toUpperCase()) } : null,
    ].filter(Boolean);

    // Notes separately (can be long) (fix #5: escaped)
    const escapedNotes = esc(notes);

    // Title: numbered if delivered, status-labelled if not
    const rowTitle = num != null ? `Session ${num}` : status.label;

    return `
      <div class="pt-completed-row${isNonDelivered ? ' pt-cr-nondel' : ''}"
           onclick="window._ptToggleCompleted(${rowIdx})"
           tabindex="0" role="button"
           aria-expanded="false" id="pt-cr-row-${rowIdx}"
           onkeydown="if(event.key==='Enter'||event.key===' '){window._ptToggleCompleted(${rowIdx});event.preventDefault();}">
        <div class="pt-cr-summary">
          <div class="pt-session-icon ${status.iconClass}" aria-hidden="true">${status.iconChar}</div>
          <div class="pt-cr-info">
            <div class="pt-cr-title">${esc(rowTitle)}</div>
            <div class="pt-cr-meta">
              ${esc(displayDate)}${dur ? '\u00a0\u00b7\u00a0' + esc(dur) : ''}${mod ? '\u00a0\u00b7\u00a0' + esc(mod) : ''}
            </div>
          </div>
          <div class="pt-cr-badges">
            <span class="${status.pillClass} pt-status-pill">${status.label}</span>
            ${relDocs.length > 0 ? `<span class="pt-report-badge">Report</span>` : ''}
            <span id="pt-cr-chev-${rowIdx}" class="pt-cr-chevron" aria-hidden="true">\u25be</span>
          </div>
        </div>

        <div id="pt-cr-detail-${rowIdx}" class="pt-cr-detail" style="display:none">
          ${isNonDelivered ? `
            <div class="pt-cr-nondel-notice">
              ${status.label === 'Cancelled'
                ? 'This session was cancelled. If you have questions, please contact your clinic.'
                : status.label === 'Missed'
                ? 'This session was missed. Please contact your clinic to rebook or discuss your plan.'
                : status.label === 'Rescheduled'
                ? 'This session was rescheduled. Your new appointment should appear in Upcoming Sessions.'
                : status.label === 'Interrupted'
                ? 'This session was stopped early. Your clinician\u2019s notes may be available below.'
                : 'Contact your clinic if you have questions about this session.'}
            </div>` : ''}

          ${detailItems.length > 0 ? `
            <div class="pt-cr-detail-grid">
              ${detailItems.map(r => `
                <div class="pt-cdr-row">
                  <span class="pt-cdr-label">${r.label}</span>
                  <span class="pt-cdr-value">${r.val}</span>
                </div>`).join('')}
            </div>` : ''}

          ${escapedNotes ? `
            <div class="pt-cr-notes">
              <div class="pt-cr-notes-label">Notes from your clinician</div>
              <div class="pt-cr-notes-body">${escapedNotes}</div>
            </div>` : ''}

          ${relDocs.length > 0 ? relDocs.map(doc => `
            <div class="pt-cr-report-link"
                 onclick="event.stopPropagation();window._navPatient('patient-reports')"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();window._navPatient('patient-reports');event.preventDefault();}"
                 role="button" tabindex="0">
              <span style="color:var(--blue);font-size:14px">\u25f1</span>
              <span class="pt-cr-report-title">${esc(doc.template_title || 'Assessment Report')}</span>
              <span class="pt-cr-report-action">View document \u2192</span>
            </div>`).join('') : ''}

          ${!detailItems.length && !escapedNotes && !relDocs.length && !isNonDelivered
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
        <div class="pt-ctx-value">${esc(activeCourse.condition_slug || 'Active Treatment')}</div>
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
              ${activeCourse
                ? 'You have an active treatment course \u2014 contact your clinic to schedule your next visit.'
                : 'Contact your clinic to discuss your treatment plan.'}
            </div>
            <button class="btn btn-ghost btn-sm" style="margin-top:14px"
                    onclick="window._navPatient('patient-messages')">
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
                  ${DEFAULT_BRING_LIST.map(item => `
                    <li class="pt-prep-item">
                      <span class="pt-prep-ico" style="font-size:10px;opacity:.5">\u25cf</span>
                      <span>${item}</span>
                    </li>`).join('')}
                </ul>
              </div>
            </details>
          </div>`
        : upcoming.map((s, i) => upcomingCardHTML(s, i)).join('')}
    </div>

    <!-- Past / completed sessions -->
    <div class="pt-sess-section">
      <div class="pt-sess-section-hd">
        <span class="pt-sess-section-title">Session History</span>
        ${pastSessions.length > 0 ? `<span class="pt-sess-badge">${pastSessions.length}</span>` : ''}
      </div>

      ${pastSessions.length === 0
        ? `<div class="pt-sess-empty" style="padding:28px 20px">
            <div class="pt-sess-empty-icon" style="font-size:22px">\u25a7</div>
            <div class="pt-sess-empty-title">No session history yet</div>
            <div class="pt-sess-empty-body">Your session history will appear here after your first visit.</div>
          </div>`
        : `<div class="card" style="overflow:hidden;padding:0">
            ${pastSessions.map((s, i) => pastSessionRowHTML(s, i)).join('')}
          </div>`}
    </div>
  `;

  // ── Prep accordion (fix: aria-expanded sync) ──────────────────────────────────
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

  // ── Completed/past accordion (fix #6: use data-* not id-prefix to collapse) ──
  window._ptToggleCompleted = function(rowIdx) {
    const detail = document.getElementById(`pt-cr-detail-${rowIdx}`);
    const chev   = document.getElementById(`pt-cr-chev-${rowIdx}`);
    const row    = document.getElementById(`pt-cr-row-${rowIdx}`);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    // Collapse all open detail panels
    el.querySelectorAll('.pt-cr-detail').forEach(d => { d.style.display = 'none'; });
    el.querySelectorAll('.pt-cr-chevron').forEach(c => { c.style.transform = ''; });
    el.querySelectorAll('.pt-completed-row[aria-expanded="true"]').forEach(r => {
      r.setAttribute('aria-expanded', 'false');
    });
    // Expand this one if it was closed
    if (!isOpen) {
      detail.style.display = '';
      if (chev) chev.style.transform = 'rotate(180deg)';
      if (row)  row.setAttribute('aria-expanded', 'true');
    }
  };

  // ── Reschedule request (opens messages with pre-filled context) ───────────────
  window._ptRequestReschedule = function(idx) {
    // Navigate to messages; future: pre-fill a draft with session context
    window._navPatient('patient-messages');
  };
}


// ── My Treatment ──────────────────────────────────────────────────────────────
export async function pgPatientCourse() {
  setTopbar(t('patient.nav.course'));
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

// \u2500\u2500 Reports \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function pgPatientReports() {
  setTopbar('Documents & Reports');

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // ── Fetch in parallel ────────────────────────────────────────────────────
  let outcomesRaw, assessmentsRaw, coursesRaw, sessionsRaw;
  try {
    [outcomesRaw, assessmentsRaw, coursesRaw, sessionsRaw] = await Promise.all([
      api.patientPortalOutcomes().catch(() => null),
      api.patientPortalAssessments().catch(() => null),
      api.patientPortalCourses().catch(() => null),
      api.patientPortalSessions().catch(() => null),
    ]);
  } catch (_e) {
    el.innerHTML = _docsErrState();
    return;
  }
  if (outcomesRaw === null && assessmentsRaw === null) {
    el.innerHTML = _docsErrState();
    return;
  }

  // ── Safe HTML escaper ────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function _docsErrState() {
    return `
      <div class="pt-docs-empty">
        <div class="pt-docs-empty-icon">&#9649;</div>
        <div class="pt-docs-empty-title">Could not load your documents</div>
        <div class="pt-docs-empty-body">Please check your connection and try again. Your documents are safe \u2014 this is just a temporary issue.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px"
                onclick="window._navPatient('patient-reports')">Try again \u2192</button>
      </div>`;
  }

  const outcomes    = Array.isArray(outcomesRaw)    ? outcomesRaw    : [];
  const assessments = Array.isArray(assessmentsRaw) ? assessmentsRaw : [];
  const courses     = Array.isArray(coursesRaw)     ? coursesRaw     : [];
  const sessions    = Array.isArray(sessionsRaw)    ? sessionsRaw    : [];

  // ── Plain-language knowledge base ────────────────────────────────────────
  // Extension point: clinician-approved per-patient summaries can be supplied
  // by the backend via a `plain_language` field on the outcome object, which
  // would override these defaults. Translate via i18n keys in a future pass.
  const DOC_PLAIN_LANG = {
    phq9:   { what: 'A 9-question depression screening questionnaire', why: 'Helps your clinician track changes in mood and depression over time',
              range: [{max:4,label:'Minimal',note:'Little to no depression symptoms at this time'},{max:9,label:'Mild',note:'Mild mood changes \u2014 worth monitoring but not alarming'},{max:14,label:'Moderate',note:'Noticeable depression \u2014 treatment is likely focused here'},{max:19,label:'Moderately severe',note:'Significant symptoms \u2014 your care team is actively monitoring you'},{max:99,label:'Severe',note:'High symptom burden \u2014 your team has prioritised this in your plan'}] },
    phq2:   { what: 'A 2-question mood check', why: 'A quick snapshot of how low mood has been recently', range: [] },
    gad7:   { what: 'A 7-question anxiety screening questionnaire', why: 'Tracks anxiety and worry levels so your clinician can adjust treatment',
              range: [{max:4,label:'Minimal',note:'Low anxiety levels'},{max:9,label:'Mild',note:'Mild anxiety \u2014 your team is tracking this'},{max:14,label:'Moderate',note:'Moderate anxiety \u2014 your clinician is monitoring closely'},{max:99,label:'Severe',note:'Significant anxiety \u2014 your care team is focused on this'}] },
    gad2:   { what: 'A 2-question anxiety check', why: 'A quick snapshot of anxiety levels', range: [] },
    pcl5:   { what: 'A PTSD symptoms checklist', why: 'Helps track trauma-related symptoms including flashbacks, avoidance, and sleep disruption', range: [] },
    hdrs:   { what: 'A clinician-rated depression assessment', why: 'Your clinician used this structured interview to assess how depression is affecting you',
              range: [{max:7,label:'Normal',note:'Symptoms are minimal at this point'},{max:13,label:'Mild',note:'Mild depression symptoms present'},{max:17,label:'Moderate',note:'Moderate depression \u2014 treatment is targeting this'},{max:23,label:'Severe',note:'Significant depression \u2014 your team is closely monitoring'},{max:99,label:'Very severe',note:'High symptom burden \u2014 your team is actively adjusting your plan'}] },
    hamd:   { what: 'A clinician-rated depression assessment', why: 'Your clinician used this to assess how depression is affecting you', range: [] },
    madrs:  { what: 'A clinician-rated depression scale', why: 'Tracks how mood and energy are responding to treatment',
              range: [{max:6,label:'Normal',note:'No significant depression symptoms'},{max:19,label:'Mild',note:'Mild symptoms \u2014 treatment is working'},{max:34,label:'Moderate',note:'Moderate symptoms \u2014 treatment is targeted here'},{max:99,label:'Severe',note:'Significant symptom burden \u2014 your team is closely monitoring'}] },
    bprs:   { what: 'A broad psychiatric symptom assessment', why: 'Gives your clinician a full picture of any symptoms you may be experiencing', range: [] },
    panss:  { what: 'An assessment for psychotic symptoms', why: 'Helps track the range and intensity of symptoms across multiple areas', range: [] },
    ybocs:  { what: 'An OCD severity assessment', why: 'Tracks obsessions and compulsions to measure how treatment is progressing', range: [] },
    caps5:  { what: 'A structured PTSD assessment interview', why: 'A detailed check on trauma-related symptoms completed with your clinician', range: [] },
    bdi:    { what: 'A depression inventory', why: 'Measures how depression symptoms have changed since your last assessment', range: [] },
    bai:    { what: 'An anxiety inventory', why: 'Measures physical and cognitive anxiety symptoms', range: [] },
    dass21: { what: 'A 21-question measure of depression, anxiety, and stress', why: 'Gives your care team a broad view of how you have been feeling across three areas', range: [] },
    iesr:   { what: 'A trauma-related stress measure', why: 'Tracks how much a stressful event is affecting your thoughts and sleep', range: [] },
    psqi:   { what: 'A sleep quality index', why: 'Measures how well you have been sleeping \u2014 sleep is important for treatment progress', range: [] },
    isi:    { what: 'An insomnia severity index', why: 'Tracks how much sleep problems are affecting your daily life', range: [] },
    moca:   { what: 'A cognitive screen', why: 'A quick check on memory, attention, and thinking clarity', range: [] },
    mmse:   { what: 'A cognitive assessment', why: 'Assesses memory and thinking skills \u2014 important when monitoring brain health', range: [] },
    qids:   { what: 'A quick depression inventory', why: 'A fast measure of depression severity to track weekly changes', range: [] },
    audit:  { what: 'An alcohol use screen', why: 'Helps your care team understand how alcohol may be interacting with treatment', range: [] },
    dast:   { what: 'A drug use screen', why: 'Helps your care team understand substance use as part of your full picture', range: [] },
    // Session and administrative types
    sessionsummary:  { what: 'A summary of what happened during your treatment session', why: 'Keeps a record of what was delivered and how you responded', range: [] },
    adverseevent:    { what: 'A safety record logged by your care team', why: 'Your clinician documents any side effects or unexpected reactions to keep your treatment safe', range: [] },
    consentform:     { what: 'A consent document you signed before treatment', why: 'Documents that you were informed about and agreed to your treatment plan', range: [] },
    careinstructions:{ what: 'Instructions from your care team', why: 'Practical guidance to help you get the most benefit from your treatment', range: [] },
    patientguide:    { what: 'Educational material about your condition or treatment', why: 'Helps you understand what to expect and how your treatment works', range: [] },
    referral:        { what: 'A referral letter to another provider', why: 'Documents a request for specialist review or additional care', range: [] },
    letter:          { what: 'A letter from your clinical team', why: 'Formal communication about your treatment or progress', range: [] },
  };

  // Extension point: backend can override per-item via `plain_language` object.
  function docPlainLang(templateKey, override) {
    if (override && (override.what || override.why)) return override;
    if (!templateKey) return null;
    const k = templateKey.toLowerCase().replace(/[-_\s]/g, '');
    for (const [key, val] of Object.entries(DOC_PLAIN_LANG)) {
      if (k === key.replace(/[-_\s]/g, '')) return val;
    }
    return null;
  }

  function scoreInterpretation(templateKey, score) {
    if (score == null || score === '') return null;
    const pl = docPlainLang(templateKey);
    if (!pl || !pl.range || !pl.range.length) return null;
    const n = Number(score);
    if (!Number.isFinite(n)) return null;
    for (const band of pl.range) {
      if (n <= band.max) return { label: band.label, note: band.note };
    }
    return null;
  }

  // ── Document type categorisation ─────────────────────────────────────────
  // Extension point: backend can supply a `doc_type` field to override.
  function categorise(item) {
    const raw = (item.doc_type || item.template_id || item.assessment_type || '').toLowerCase();
    if (/consent/.test(raw))               return 'consent';
    if (/care.?instruct|instruction/.test(raw)) return 'care';
    if (/session.?summar|visit.?summar/.test(raw)) return 'session-summary';
    if (/adverse|side.?effect/.test(raw))  return 'adverse';
    if (/referral|letter/.test(raw))       return 'letter';
    if (/patient.?guide|educat|leaflet/.test(raw)) return 'guide';
    if (item._source === 'assessment')     return 'assessment';
    return 'outcome';
  }

  const CAT_META = {
    outcome:           { label: 'Outcome Report',    icon: '&#9649;', color: 'var(--blue)',    bg: 'rgba(74,158,255,.1)'    },
    assessment:        { label: 'Assessment',         icon: '&#9673;', color: 'var(--teal)',    bg: 'rgba(0,212,188,.08)'   },
    'session-summary': { label: 'Session Summary',   icon: '&#9671;', color: '#a78bfa',        bg: 'rgba(167,139,250,.1)'  },
    adverse:           { label: 'Safety Record',      icon: '&#9680;', color: '#fb923c',        bg: 'rgba(251,146,60,.1)'   },
    consent:           { label: 'Consent / Form',     icon: '&#9643;', color: '#94a3b8',        bg: 'rgba(148,163,184,.1)'  },
    care:              { label: 'Care Instructions',  icon: '&#9678;', color: '#34d399',        bg: 'rgba(52,211,153,.1)'   },
    guide:             { label: 'Patient Guide',      icon: '&#128218;', color: '#f59e0b',      bg: 'rgba(245,158,11,.08)'  },
    letter:            { label: 'Letter / Referral',  icon: '&#9672;', color: '#e2e8f0',        bg: 'rgba(226,232,240,.06)' },
  };

  // ── Build session/course lookup maps ─────────────────────────────────────
  const sessionById = {};
  sessions.forEach(s => { if (s.id) sessionById[s.id] = s; });
  const courseById = {};
  courses.forEach(c => { if (c.id) courseById[c.id] = c; });

  // ── Normalise all sources into unified docs[] ────────────────────────────
  // Extension point: add new source types here (e.g. files, letters, guides)
  // by pushing into docs[] with the same shape.
  const docs = [];

  outcomes.forEach(o => {
    const templateKey = (o.template_id || '').toLowerCase();
    const pl    = docPlainLang(templateKey, o.plain_language);
    const interp = scoreInterpretation(templateKey, o.score);
    const session = o.session_id ? sessionById[o.session_id] : null;
    const course  = o.course_id  ? courseById[o.course_id]   : null;
    docs.push({
      id:          o.id || `outcome-${Math.random().toString(36).slice(2)}`,
      _source:     'outcome',
      title:       o.template_title || (pl ? pl.what : null) || 'Outcome Report',
      date:        o.administered_at,
      displayDate: fmtDate(o.administered_at),
      templateKey,
      category:    categorise({ ...o, _source: 'outcome' }),
      score:       o.score != null ? o.score : null,
      scoreInterp: interp,
      measurePoint: o.measurement_point || null,
      plainLang:   pl,
      sessionRef:  session ? {
        number:   session.session_number || null,
        date:     fmtDate(session.delivered_at || session.scheduled_at),
        modality: session.modality_slug || null,
      } : null,
      courseRef:   course ? {
        title: course.condition_name || course.protocol_name || 'Your treatment',
        id:    course.id,
      } : null,
      url:         o.report_url || o.pdf_url || o.file_url || null,
      status:      (o.status || 'completed').toLowerCase(),
      clinicianNotes: o.clinician_notes || o.notes || null,
    });
  });

  assessments.forEach(a => {
    const templateKey = (a.assessment_type || a.name || '').toLowerCase();
    docs.push({
      id:          a.id || `assess-${Math.random().toString(36).slice(2)}`,
      _source:     'assessment',
      title:       a.name || a.title || a.assessment_type || 'Assessment',
      date:        a.completed_at || a.administered_at || a.created_at,
      displayDate: fmtDate(a.completed_at || a.administered_at || a.created_at),
      templateKey,
      category:    categorise({ ...a, _source: 'assessment' }),
      score:       a.score != null ? a.score : null,
      scoreInterp: scoreInterpretation(templateKey, a.score),
      measurePoint: a.measurement_point || null,
      plainLang:   docPlainLang(templateKey, a.plain_language),
      sessionRef:  null,
      courseRef:   null,
      url:         a.report_url || a.pdf_url || a.file_url || null,
      status:      (a.status || 'completed').toLowerCase(),
      clinicianNotes: a.notes || a.clinician_notes || null,
    });
  });

  // Newest first
  docs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // ── Empty state ──────────────────────────────────────────────────────────
  if (docs.length === 0) {
    el.innerHTML = `
      <div class="pt-docs-empty">
        <div class="pt-docs-empty-icon">&#9649;</div>
        <div class="pt-docs-empty-title">No documents yet</div>
        <div class="pt-docs-empty-body">Your care team will add outcome reports, assessment results, and other documents here as your treatment progresses.</div>
        <div class="pt-docs-empty-details">
          <details>
            <summary class="pt-docs-empty-toggle">What types of documents will appear here?</summary>
            <ul class="pt-docs-empty-list">
              <li>Outcome reports and assessment results</li>
              <li>Session summaries from your care team</li>
              <li>Care instructions and treatment guides</li>
              <li>Consent forms you have completed</li>
              <li>Letters and referrals</li>
            </ul>
          </details>
        </div>
      </div>`;
    return;
  }

  // ── Filter chip bar ──────────────────────────────────────────────────────
  const FILTERS = [
    { key: 'all',             label: 'All' },
    { key: 'outcome',         label: 'Reports' },
    { key: 'assessment',      label: 'Assessments' },
    { key: 'care',            label: 'Care Instructions' },
    { key: 'consent',         label: 'Consent / Forms' },
    { key: 'session-summary', label: 'Session Summaries' },
    { key: 'guide',           label: 'Patient Guides' },
    { key: 'letter',          label: 'Letters' },
  ];
  const presentCats = new Set(docs.map(d => d.category));
  const visibleFilters = FILTERS.filter(f => f.key === 'all' || presentCats.has(f.key));

  // ── Document card HTML ───────────────────────────────────────────────────
  // Extension point: pass { showSharing: true } to add caregiver/proxy share UI.
  // Pass { showTranslation: true } to show a translated plain-language toggle.
  function docCardHTML(doc, opts = {}) {
    const { expandPl = false } = opts;
    const cm = CAT_META[doc.category] || CAT_META['outcome'];
    const plId  = `pt-doc-pl-${esc(doc.id)}`;

    // Context chips: session ref + course ref + measurement point
    const sessionChip = doc.sessionRef
      ? `<span class="pt-doc-chip">Session${doc.sessionRef.number ? ' #' + doc.sessionRef.number : ''} \u00b7 ${esc(doc.sessionRef.date)}</span>`
      : '';
    const courseChip = doc.courseRef
      ? `<span class="pt-doc-chip">${esc(doc.courseRef.title)}</span>`
      : '';
    const measureChip = doc.measurePoint
      ? `<span class="pt-doc-chip">${esc(doc.measurePoint)}</span>`
      : '';
    const chips = [sessionChip, courseChip, measureChip].filter(Boolean).join('');

    // Score + interpretation
    const interpBand = doc.scoreInterp;
    const scoreHTML = doc.score != null
      ? `<div class="pt-doc-score">
           <span class="pt-doc-score-num">${esc(String(doc.score))}</span>
           ${interpBand ? `<span class="pt-doc-score-band ${esc(interpBand.label.toLowerCase().replace(/\s+/g,'-'))}">${esc(interpBand.label)}</span>` : ''}
         </div>`
      : '';

    // Status badge — only shown when not a normal completed state
    const showStatus = doc.status && !['completed','done','available',''].includes(doc.status);
    const statusBadge = showStatus
      ? `<span class="pt-doc-status-badge">${esc(doc.status)}</span>`
      : '';

    // Plain-language section
    const hasPl = Boolean(doc.plainLang);
    const plSection = hasPl
      ? `<button class="pt-doc-pl-toggle" aria-expanded="${expandPl}"
                aria-controls="${plId}"
                onclick="window._ptToggleDocPl('${esc(doc.id)}')">
           <span class="pt-doc-pl-toggle-ico">&#9678;</span>
           What this is
           <span class="pt-doc-pl-chev" id="chev-${esc(doc.id)}" aria-hidden="true">${expandPl ? '\u25b4' : '\u25be'}</span>
         </button>
         <div class="pt-doc-pl-body" id="${plId}" ${expandPl ? '' : 'hidden'}>
           ${doc.plainLang.what ? `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">What this is</span>${esc(doc.plainLang.what)}</div>` : ''}
           ${doc.plainLang.why  ? `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">Why it matters</span>${esc(doc.plainLang.why)}</div>` : ''}
           ${interpBand         ? `<div class="pt-doc-pl-row pt-doc-pl-row-hl"><span class="pt-doc-pl-label">What this means</span>${esc(interpBand.note)}</div>` : ''}
         </div>`
      : '';

    // CTA
    const ctaHtml = doc.url
      ? `<a class="pt-doc-cta" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer"
              aria-label="View ${esc(doc.title)}"
              tabindex="0">View \u2192</a>`
      : `<button class="pt-doc-cta pt-doc-cta-stub"
               onclick="window._ptViewDoc('${esc(doc.id)}')"
               aria-label="View ${esc(doc.title)}">View \u2192</button>`;

    return `
      <div class="pt-doc-card" data-cat="${esc(doc.category)}" data-id="${esc(doc.id)}">
        <div class="pt-doc-card-top">
          <div class="pt-doc-icon" style="background:${cm.bg};color:${cm.color}" aria-hidden="true">${cm.icon}</div>
          <div class="pt-doc-main">
            <div class="pt-doc-title">${esc(doc.title)}</div>
            <div class="pt-doc-meta">
              <span class="pt-doc-date">${esc(doc.displayDate)}</span>
              <span class="pt-doc-type-label" style="color:${cm.color}">${esc(cm.label)}</span>
              ${statusBadge}
            </div>
            ${chips ? `<div class="pt-doc-chips">${chips}</div>` : ''}
          </div>
          <div class="pt-doc-actions-col">
            ${ctaHtml}
            ${scoreHTML}
          </div>
        </div>
        ${plSection}
      </div>`;
  }

  // ── Build by-course grouping ─────────────────────────────────────────────
  const byCourse = new Map();
  docs.forEach(d => {
    const key = d.courseRef ? d.courseRef.id : '__none__';
    if (!byCourse.has(key)) {
      byCourse.set(key, { label: d.courseRef?.title || null, items: [] });
    }
    byCourse.get(key).items.push(d);
  });
  const courseEntries = [...byCourse.entries()].filter(([k]) => k !== '__none__');

  // ── Render ───────────────────────────────────────────────────────────────
  const latest = docs[0] || null;

  const filterBar = visibleFilters.length > 1
    ? `<div class="pt-docs-filters" id="pt-docs-filters" role="tablist" aria-label="Filter documents">
         ${visibleFilters.map((f, i) =>
           `<button class="pt-docs-filter-chip${i === 0 ? ' active' : ''}"
                   role="tab"
                   aria-selected="${i === 0}"
                   data-filter="${esc(f.key)}"
                   onclick="window._ptSetDocFilter('${esc(f.key)}')">${esc(f.label)}</button>`
         ).join('')}
       </div>`
    : '';

  const latestSection = latest
    ? `<div class="pt-docs-section">
         <div class="pt-docs-section-hd">
           <span class="pt-docs-section-title">Latest Report</span>
         </div>
         ${docCardHTML(latest, { expandPl: true })}
       </div>`
    : '';

  const RECENT_LIMIT = 5;
  const recentItems  = docs.slice(0, RECENT_LIMIT);
  const recentSection = docs.length >= 1
    ? `<div class="pt-docs-section" id="pt-docs-main-list">
         <div class="pt-docs-section-hd">
           <span class="pt-docs-section-title">Recent Documents</span>
           <span class="pt-docs-section-count" id="pt-docs-count">${docs.length} total</span>
         </div>
         <div id="pt-docs-card-list">
           ${recentItems.map(d => docCardHTML(d)).join('')}
         </div>
         ${docs.length > RECENT_LIMIT
           ? `<button class="pt-docs-show-all" id="pt-docs-show-all"
                     onclick="window._ptShowAllDocs()">Show all ${docs.length} documents \u2192</button>`
           : ''}
       </div>`
    : '';

  const byCourseSection = courseEntries.length > 0
    ? `<div class="pt-docs-section">
         <div class="pt-docs-section-hd">
           <span class="pt-docs-section-title">By Treatment Course</span>
         </div>
         ${courseEntries.map(([, entry]) =>
           `<div class="pt-docs-course-group">
              <div class="pt-docs-course-label">${esc(entry.label || 'Your treatment')}</div>
              ${entry.items.map(d => docCardHTML(d)).join('')}
            </div>`
         ).join('')}
       </div>`
    : '';

  el.innerHTML = `
    <div class="pt-docs-wrap">
      ${filterBar}
      <div id="pt-docs-sections">
        ${latestSection}
        ${recentSection}
        ${byCourseSection}
      </div>
    </div>`;

  // ── Interaction handlers ─────────────────────────────────────────────────

  // Filter chips — show/hide cards by category
  window._ptSetDocFilter = function(filter) {
    el.querySelectorAll('.pt-docs-filter-chip').forEach(btn => {
      const active = btn.dataset.filter === filter;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    let visibleCount = 0;
    el.querySelectorAll('.pt-doc-card').forEach(card => {
      const show = filter === 'all' || card.dataset.cat === filter;
      card.hidden = !show;
      if (show) visibleCount++;
    });
    const countEl = el.querySelector('#pt-docs-count');
    if (countEl) countEl.textContent = filter === 'all' ? `${docs.length} total` : `${visibleCount} shown`;
  };

  // Plain-language accordion
  window._ptToggleDocPl = function(docId) {
    const safeId = CSS.escape(docId);
    const body = el.querySelector(`#pt-doc-pl-${safeId}`);
    const chev = el.querySelector(`#chev-${safeId}`);
    const btn  = el.querySelector(`[aria-controls="pt-doc-pl-${safeId}"]`);
    if (!body) return;
    const opening = body.hasAttribute('hidden');
    if (opening) { body.removeAttribute('hidden'); } else { body.setAttribute('hidden', ''); }
    if (chev) chev.textContent = opening ? '\u25b4' : '\u25be';
    if (btn)  btn.setAttribute('aria-expanded', String(opening));
  };

  // Show all documents (replaces truncated recent list)
  window._ptShowAllDocs = function() {
    const listEl = el.querySelector('#pt-docs-card-list');
    const showAllBtn = el.querySelector('#pt-docs-show-all');
    if (!listEl) return;
    listEl.innerHTML = docs.map(d => docCardHTML(d)).join('');
    if (showAllBtn) showAllBtn.remove();
    // Re-apply current filter
    const activeChip = el.querySelector('.pt-docs-filter-chip.active');
    const currentFilter = activeChip ? activeChip.dataset.filter : 'all';
    if (currentFilter !== 'all') window._ptSetDocFilter(currentFilter);
  };

  // View document
  // Extension point: replace stub with in-app PDF viewer, download handler,
  // or caregiver/proxy share dialog as those features are built.
  window._ptViewDoc = function(docId) {
    const doc = docs.find(d => String(d.id) === String(docId));
    if (!doc) return;
    if (doc.url) {
      window.open(doc.url, '_blank', 'noopener,noreferrer');
      return;
    }
    // Unavailable: show a calm inline notice instead of an error
    const card = el.querySelector(`[data-id="${CSS.escape(docId)}"]`);
    if (!card) return;
    if (card.querySelector('.pt-doc-unavail')) return; // already shown
    const notice = document.createElement('div');
    notice.className = 'pt-doc-unavail';
    notice.textContent = 'This document is not yet available to view online. Contact your clinic if you need a copy.';
    card.appendChild(notice);
  };
}

// ── Messages ──────────────────────────────────────────────────────────────────
export async function pgPatientMessages() {
  setTopbar(t('patient.nav.messages'));
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
  setTopbar(t('checkin.title'));
  const uid = currentUser?.patient_id || currentUser?.id;

  const el = document.getElementById('patient-content');
  const todayStr  = new Date().toISOString().slice(0, 10);
  const todayFmt  = new Date().toLocaleDateString(getLocale() === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${t('checkin.title')}</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">${todayFmt}</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;line-height:1.55">
        ${t('checkin.subtitle')}
      </div>
    </div>

    <div class="card" id="pt-wellness-form-card">
      <div class="card-header"><h3>${t('checkin.subtitle')}</h3></div>
      <div class="card-body" style="padding:20px">

        <!-- Mood slider -->
        <div class="wellness-slider-group">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:13px;font-weight:500;color:var(--text-primary)">${t('checkin.mood')}</label>
            <span id="mood-val" style="color:var(--teal);font-weight:600">5</span>
          </div>
          <input type="range" id="mood-slider" min="1" max="10" value="5"
                 oninput="document.getElementById('mood-val').textContent=this.value;window._updateWellnessEmoji()"
                 style="width:100%;accent-color:var(--teal)">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:4px">
            <span>😞 ${t('checkin.mood.low')}</span><span>😐</span><span>😊 ${t('checkin.mood.high')}</span>
          </div>
        </div>

        <!-- Sleep slider -->
        <div class="wellness-slider-group" style="margin-top:20px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:13px;font-weight:500;color:var(--text-primary)">${t('checkin.sleep')}</label>
            <span id="sleep-val" style="color:var(--blue);font-weight:600">5</span>
          </div>
          <input type="range" id="sleep-slider" min="1" max="10" value="5"
                 oninput="document.getElementById('sleep-val').textContent=this.value;window._updateWellnessEmoji()"
                 style="width:100%;accent-color:var(--blue)">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:4px">
            <span>😴 ${t('checkin.sleep.low')}</span><span>💤</span><span>🌟 ${t('checkin.sleep.high')}</span>
          </div>
        </div>

        <!-- Energy slider -->
        <div class="wellness-slider-group" style="margin-top:20px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px">
            <label style="font-size:13px;font-weight:500;color:var(--text-primary)">${t('checkin.energy')}</label>
            <span id="energy-val" style="color:var(--violet);font-weight:600">5</span>
          </div>
          <input type="range" id="energy-slider" min="1" max="10" value="5"
                 oninput="document.getElementById('energy-val').textContent=this.value;window._updateWellnessEmoji()"
                 style="width:100%;accent-color:var(--violet)">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:4px">
            <span>😩 ${t('checkin.energy.low')}</span><span>⚡</span><span>🔥 ${t('checkin.energy.high')}</span>
          </div>
        </div>

        <!-- Side effects -->
        <div style="margin-top:20px">
          <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:500;color:var(--text-primary)">
            ${t('checkin.side_effects')}
          </label>
          <select id="wellness-side-effects" class="form-control" style="font-size:13px">
            <option value="none">${t('checkin.se.none')}</option>
            <option value="headache">${t('checkin.se.headache')}</option>
            <option value="fatigue">${t('checkin.se.fatigue')}</option>
            <option value="dizziness">${t('checkin.se.dizziness')}</option>
            <option value="tingling">${t('checkin.se.tingling')}</option>
            <option value="nausea">${t('checkin.se.nausea')}</option>
            <option value="other">${t('checkin.se.other')}</option>
          </select>
        </div>

        <!-- Notes -->
        <div style="margin-top:16px">
          <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:500;color:var(--text-primary)">${t('checkin.notes')}</label>
          <textarea id="wellness-notes" class="form-control" placeholder="${t('checkin.notes.placeholder')}"
                    style="width:100%;min-height:80px;resize:vertical;font-size:12.5px"></textarea>
        </div>

        <!-- Emoji summary -->
        <div id="wellness-emoji" style="text-align:center;font-size:2.5rem;margin:20px 0">😐</div>

        <button class="btn btn-primary" onclick="window._submitWellness()" style="width:100%;padding:12px;font-size:14px">
          ${t('checkin.submit')}
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
          <div style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:8px">${t('checkin.thanks')}</div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="window._navPatient('patient-portal')">${t('common.back')}</button>
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

// ── Shared fetch helper for media endpoints (not yet in api.js) ──────────────
// Mirrors the API_BASE logic from api.js
const _MEDIA_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://127.0.0.1:8000';
async function _mediaFetch(path, opts = {}) {
  const token   = api.getToken();
  const isForm  = opts.body instanceof FormData;
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${_MEDIA_BASE}${path}`, { ...opts, headers });
  if (res.status === 204) return null;
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try { const e = await res.json(); msg = e.detail || msg; } catch (_e2) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

// ── Media & AI Analysis Consent ───────────────────────────────────────────────
export async function pgPatientMediaConsent() {
  setTopbar('Media & AI Consent');
  const user = currentUser;
  const patientId = user?.patient_id || user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Load current consent state
  let consentData = null;
  try {
    consentData = await _mediaFetch(`/api/v1/media/consent/${patientId}`);
  } catch (_e) {
    consentData = null;
  }

  const consents = Array.isArray(consentData) ? consentData : (consentData?.consents || []);

  function consentFor(type) {
    return consents.find(c => c.consent_type === type) || null;
  }

  const CONSENT_TYPES = [
    {
      type:        'voice_notes',
      icon:        '🎙',
      title:       'Upload Voice Notes',
      description: 'Record short voice updates about how you\'re feeling, side effects, or treatment questions.',
    },
    {
      type:        'text_updates',
      icon:        '📝',
      title:       'Upload Text Updates',
      description: 'Send written updates — symptom notes, daily check-ins, or questions for your care team.',
    },
    {
      type:        'ai_analysis',
      icon:        '🤖',
      title:       'AI-Assisted Analysis',
      description: 'Allow your voice and text uploads to be analyzed by AI to help your care team understand your reports. AI output is always reviewed by your clinician before it affects your care.',
    },
  ];

  const retentionDays = consentData?.retention_days ?? 365;

  function renderConsentCards() {
    return CONSENT_TYPES.map(ct => {
      const existing = consentFor(ct.type);
      const granted  = existing?.granted === true;
      return `
        <div class="card" style="margin-bottom:14px" id="consent-card-${ct.type}">
          <div class="card-body" style="display:flex;align-items:flex-start;gap:16px;padding:18px 20px">
            <div style="font-size:26px;flex-shrink:0;margin-top:2px">${ct.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${ct.title}</div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px">${ct.description}</div>
              <div style="display:flex;align-items:center;gap:10px">
                <span id="consent-status-${ct.type}" style="font-size:11.5px;font-weight:600;color:${granted ? 'var(--teal)' : 'var(--text-tertiary)'}">
                  ${granted ? '✓ Consent given' : '○ Not consented'}
                </span>
                <button class="btn ${granted ? 'btn-ghost' : 'btn-primary'} btn-sm"
                        id="consent-btn-${ct.type}"
                        onclick="window._ptToggleConsent('${ct.type}', ${!granted})">
                  ${granted ? 'Revoke' : 'Give Consent'}
                </button>
              </div>
              <div id="consent-msg-${ct.type}" style="display:none;margin-top:8px;font-size:12px"></div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Media &amp; AI Analysis Consent</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Control what you share with your care team and how it's used.</div>
    </div>

    ${renderConsentCards()}

    <div class="notice notice-info" style="margin-bottom:20px">
      Your uploads are retained for <strong>${retentionDays} days</strong> after your treatment ends, then deleted.
      You can delete individual uploads at any time before they are used in your clinical record.
    </div>

    <div id="pt-consent-revoke-all-msg" style="display:none;margin-bottom:12px;font-size:12.5px"></div>
    <button class="btn btn-ghost btn-sm" style="color:var(--red,#ef4444);border-color:rgba(239,68,68,0.3)"
            onclick="window._ptRevokeAllConsent()">
      Withdraw All Consent
    </button>
  `;

  window._ptToggleConsent = async function(consentType, grantedValue) {
    const btn    = document.getElementById(`consent-btn-${consentType}`);
    const msgEl  = document.getElementById(`consent-msg-${consentType}`);
    const statEl = document.getElementById(`consent-status-${consentType}`);
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    try {
      await _mediaFetch('/api/v1/media/consent', {
        method: 'POST',
        body: JSON.stringify({ consent_type: consentType, granted: grantedValue, retention_days: 365 }),
      });

      // Update local cache
      const existing = consents.findIndex(c => c.consent_type === consentType);
      if (existing >= 0) { consents[existing].granted = grantedValue; }
      else { consents.push({ consent_type: consentType, granted: grantedValue }); }

      if (statEl) {
        statEl.textContent = grantedValue ? '✓ Consent given' : '○ Not consented';
        statEl.style.color = grantedValue ? 'var(--teal)' : 'var(--text-tertiary)';
      }
      if (btn) {
        btn.disabled = false;
        btn.className = `btn ${grantedValue ? 'btn-ghost' : 'btn-primary'} btn-sm`;
        btn.textContent = grantedValue ? 'Revoke' : 'Give Consent';
        btn.setAttribute('onclick', `window._ptToggleConsent('${consentType}', ${!grantedValue})`);
      }
      if (msgEl) {
        msgEl.className = 'notice notice-success';
        msgEl.style.display = '';
        msgEl.textContent = grantedValue ? 'Consent granted.' : 'Consent revoked.';
        setTimeout(() => { if (msgEl) msgEl.style.display = 'none'; }, 2500);
      }
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = grantedValue ? 'Give Consent' : 'Revoke'; }
      if (msgEl) {
        msgEl.className = 'notice notice-error';
        msgEl.style.display = '';
        msgEl.textContent = `Could not update consent: ${err.message || 'Unknown error'}`;
      }
    }
  };

  window._ptRevokeAllConsent = async function() {
    if (!confirm('Withdraw all consent? This will revoke permission for all upload types.')) return;
    const msgEl = document.getElementById('pt-consent-revoke-all-msg');
    try {
      await Promise.all(CONSENT_TYPES.map(ct =>
        _mediaFetch('/api/v1/media/consent', {
          method: 'POST',
          body: JSON.stringify({ consent_type: ct.type, granted: false, retention_days: 365 }),
        }).catch(() => null)
      ));
      // Reload page to reflect state
      await pgPatientMediaConsent();
    } catch (err) {
      if (msgEl) {
        msgEl.className = 'notice notice-error';
        msgEl.style.display = '';
        msgEl.textContent = `Could not revoke all consent: ${err.message || 'Unknown error'}`;
      }
    }
  };
}

// ── Media Upload ──────────────────────────────────────────────────────────────
export async function pgPatientMediaUpload() {
  setTopbar('Send an Update');
  const user = currentUser;
  const patientId = user?.patient_id || user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // Load consent state and courses in parallel
  let consentData = null;
  let coursesRaw  = null;
  try {
    [consentData, coursesRaw] = await Promise.all([
      _mediaFetch(`/api/v1/media/consent/${patientId}`).catch(() => null),
      api.patientPortalCourses().catch(() => null),
    ]);
  } catch (_e) { /* non-fatal */ }

  const consents  = Array.isArray(consentData) ? consentData : (consentData?.consents || []);
  const courses   = Array.isArray(coursesRaw) ? coursesRaw : [];

  function isConsentGranted(type) {
    const c = consents.find(x => x.consent_type === type);
    return c?.granted === true;
  }

  const hasAnyConsent = isConsentGranted('voice_notes') || isConsentGranted('text_updates');

  const courseOptions = courses.length > 0
    ? `<option value="">— Not linked to a course —</option>` +
      courses.map(c => `<option value="${c.id}">${c.condition_slug || 'Course'} (${c.status || 'active'})</option>`).join('')
    : `<option value="">No courses found</option>`;

  // Media recorder state
  let _mediaRecorder   = null;
  let _recordedChunks  = [];
  let _recordingTimer  = null;
  let _recordingSeconds = 0;
  let _recordedBlob    = null;
  let _selectedType    = 'text';

  el.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Send an Update to Your Care Team</div>
      <div style="font-size:12.5px;color:var(--text-secondary)">Your care team will review your update before it is used in your clinical record.</div>
    </div>

    ${!hasAnyConsent ? `
    <div class="card" style="margin-bottom:20px;border-color:rgba(245,158,11,0.4);background:rgba(245,158,11,0.04)">
      <div class="card-body" style="display:flex;align-items:center;gap:14px;padding:18px 20px">
        <div style="font-size:22px">⚠</div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:3px">Media uploads not enabled</div>
          <div style="font-size:12px;color:var(--text-secondary)">You haven't enabled media uploads yet.</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="window._navPatient('pt-media-consent')">Enable Consent →</button>
      </div>
    </div>` : ''}

    <!-- Upload type selector -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="card" id="upload-type-text" style="cursor:pointer;border-color:var(--teal);background:rgba(0,212,188,0.04)"
           onclick="window._ptSelectUploadType('text')" role="button" tabindex="0">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 16px">
          <span style="font-size:22px">📝</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Text Update</div>
            <div style="font-size:11.5px;color:var(--text-tertiary)">Written note</div>
          </div>
        </div>
      </div>
      <div class="card" id="upload-type-voice" style="cursor:pointer"
           onclick="window._ptSelectUploadType('voice')" role="button" tabindex="0">
        <div class="card-body" style="display:flex;align-items:center;gap:12px;padding:14px 16px">
          <span style="font-size:22px">🎙</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">Voice Note</div>
            <div style="font-size:11.5px;color:var(--text-tertiary)">Audio recording</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Text upload form -->
    <div id="upload-form-text" class="card" style="margin-bottom:16px">
      <div class="card-body" style="padding:20px">
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Link to a treatment course (optional)</label>
          <select id="upload-text-course" class="form-control" style="font-size:13px">
            ${courseOptions}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Your update</label>
          <textarea id="upload-text-content" class="form-control" rows="5"
                    maxlength="2000" placeholder="How are you feeling? Note any symptoms, side effects, or questions."
                    style="resize:vertical;font-size:13px"
                    oninput="document.getElementById('upload-text-counter').textContent=this.value.length+'/2000'"></textarea>
          <div id="upload-text-counter" style="font-size:11px;color:var(--text-tertiary);text-align:right;margin-top:4px">0/2000</div>
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label class="form-label">What's this about? (optional)</label>
          <input type="text" id="upload-text-note" class="form-control" placeholder="e.g. After session 5, Side effect question"
                 style="font-size:13px">
        </div>
      </div>
    </div>

    <!-- Voice upload form -->
    <div id="upload-form-voice" class="card" style="margin-bottom:16px;display:none">
      <div class="card-body" style="padding:20px">
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Link to a treatment course (optional)</label>
          <select id="upload-voice-course" class="form-control" style="font-size:13px">
            ${courseOptions}
          </select>
        </div>
        <div style="margin-bottom:16px">
          <label class="form-label">Record a voice note</label>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button class="btn btn-primary btn-sm" id="pt-record-btn" onclick="window._ptToggleRecording()">
              🎙 Record
            </button>
            <span id="pt-record-timer" style="font-size:13px;font-weight:600;color:var(--teal);display:none">0:00</span>
            <span id="pt-record-ready" style="font-size:12.5px;color:var(--teal);display:none"></span>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label" style="font-size:12px;color:var(--text-tertiary)">Or upload a file instead</label>
          <input type="file" id="upload-voice-file" accept="audio/*" class="form-control"
                 style="font-size:12.5px;margin-top:6px"
                 onchange="window._ptVoiceFileSelected(this)">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <label class="form-label">What's this about? (optional)</label>
          <input type="text" id="upload-voice-note" class="form-control" placeholder="e.g. After session 5, Side effect question"
                 style="font-size:13px">
        </div>
      </div>
    </div>

    <!-- Consent reminder -->
    <div class="notice notice-info" style="margin-bottom:16px;font-size:12px">
      By uploading, you confirm you have given consent for this upload type. Your care team will review your update before it is used in your clinical record.
    </div>

    <!-- Consent warning (shown when submitting without consent) -->
    <div id="pt-upload-consent-warn" style="display:none;margin-bottom:12px"></div>

    <!-- Submit result -->
    <div id="pt-upload-result" style="display:none;margin-bottom:16px"></div>

    <button class="btn btn-primary" style="width:100%;padding:12px" id="pt-upload-submit-btn"
            onclick="window._ptSubmitUpload()">
      Send Update
    </button>
  `;

  window._ptSelectUploadType = function(type) {
    _selectedType = type;
    const textCard  = document.getElementById('upload-type-text');
    const voiceCard = document.getElementById('upload-type-voice');
    const textForm  = document.getElementById('upload-form-text');
    const voiceForm = document.getElementById('upload-form-voice');

    const activeBorder  = 'border-color:var(--teal);background:rgba(0,212,188,0.04)';
    const inactiveBorder = '';

    if (textCard)  textCard.style.cssText  = `cursor:pointer;${type === 'text'  ? activeBorder : inactiveBorder}`;
    if (voiceCard) voiceCard.style.cssText = `cursor:pointer;${type === 'voice' ? activeBorder : inactiveBorder}`;
    if (textForm)  textForm.style.display  = type === 'text'  ? '' : 'none';
    if (voiceForm) voiceForm.style.display = type === 'voice' ? '' : 'none';
  };

  window._ptToggleRecording = async function() {
    const btn   = document.getElementById('pt-record-btn');
    const timer = document.getElementById('pt-record-timer');
    const ready = document.getElementById('pt-record-ready');

    if (_mediaRecorder && _mediaRecorder.state === 'recording') {
      // Stop recording
      _mediaRecorder.stop();
      clearInterval(_recordingTimer);
      if (btn)   { btn.textContent = '🎙 Record'; btn.className = 'btn btn-primary btn-sm'; }
      if (timer) timer.style.display = 'none';
      return;
    }

    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _recordedChunks = [];
      _mediaRecorder = new MediaRecorder(stream);
      _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _recordedChunks.push(e.data); };
      _mediaRecorder.onstop = () => {
        _recordedBlob = new Blob(_recordedChunks, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        const dur = _recordingSeconds;
        if (ready) { ready.style.display = ''; ready.textContent = `Ready to upload (${dur}s)`; }
      };
      _recordedChunks = [];
      _recordingSeconds = 0;
      _mediaRecorder.start();

      if (btn)   { btn.textContent = '⏹ Stop'; btn.className = 'btn btn-ghost btn-sm'; }
      if (timer) { timer.style.display = ''; timer.textContent = '0:00'; }
      if (ready) ready.style.display = 'none';

      _recordingTimer = setInterval(() => {
        _recordingSeconds++;
        const m = Math.floor(_recordingSeconds / 60);
        const s = _recordingSeconds % 60;
        if (timer) timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
      }, 1000);
    } catch (_e) {
      const warnEl = document.getElementById('pt-upload-consent-warn');
      if (warnEl) {
        warnEl.className = 'notice notice-error';
        warnEl.style.display = '';
        warnEl.textContent = 'Microphone access denied. Please allow microphone permissions or upload a file instead.';
      }
    }
  };

  window._ptVoiceFileSelected = function(input) {
    const ready = document.getElementById('pt-record-ready');
    if (input.files && input.files[0]) {
      _recordedBlob = input.files[0];
      if (ready) { ready.style.display = ''; ready.textContent = `File selected: ${input.files[0].name}`; }
    }
  };

  window._ptSubmitUpload = async function() {
    const resultEl = document.getElementById('pt-upload-result');
    const warnEl   = document.getElementById('pt-upload-consent-warn');
    const submitBtn = document.getElementById('pt-upload-submit-btn');

    // Check consent for selected type
    const consentType = _selectedType === 'text' ? 'text_updates' : 'voice_notes';
    if (!isConsentGranted(consentType)) {
      if (warnEl) {
        warnEl.className = 'notice notice-warn';
        warnEl.style.display = '';
        warnEl.innerHTML = `You haven't given consent for ${_selectedType === 'text' ? 'text updates' : 'voice notes'}.
          <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">Enable consent →</a>`;
      }
      return;
    }
    if (warnEl) warnEl.style.display = 'none';

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

    try {
      if (_selectedType === 'text') {
        const content   = document.getElementById('upload-text-content')?.value?.trim() || '';
        const courseId  = document.getElementById('upload-text-course')?.value || null;
        const noteLabel = document.getElementById('upload-text-note')?.value?.trim() || '';
        if (!content) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.textContent = 'Please enter some text before sending.'; }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        const textConsent = consents.find(c => c.consent_type === 'text_updates');
        await _mediaFetch('/api/v1/media/patient/upload/text', {
          method: 'POST',
          body: JSON.stringify({
            text_content:  content,
            course_id:     courseId || undefined,
            patient_note:  noteLabel || undefined,
            consent_id:    textConsent?.id || undefined,
          }),
        });
      } else {
        // Voice upload via FormData
        if (!_recordedBlob) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.textContent = 'Please record or select an audio file first.'; }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        const courseId  = document.getElementById('upload-voice-course')?.value || null;
        const noteLabel = document.getElementById('upload-voice-note')?.value?.trim() || '';
        const voiceConsent = consents.find(c => c.consent_type === 'voice_notes');
        const formData = new FormData();
        formData.append('file', _recordedBlob, 'voice-note.webm');
        if (courseId)              formData.append('course_id',    courseId);
        if (noteLabel)             formData.append('patient_note', noteLabel);
        if (voiceConsent?.id)      formData.append('consent_id',   voiceConsent.id);

        await _mediaFetch('/api/v1/media/patient/upload/audio', {
          method: 'POST',
          body:   formData,
        });
      }

      // Success
      if (resultEl) {
        resultEl.className = 'notice notice-success';
        resultEl.style.display = '';
        resultEl.innerHTML = 'Your update has been sent. Your care team will review it. '
          + '<a href="#" onclick="window._navPatient(\'pt-media-history\');return false" style="color:var(--teal)">View Media History →</a>';
      }
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sent ✓'; }
    } catch (err) {
      if (resultEl) {
        resultEl.className = 'notice notice-error';
        resultEl.style.display = '';
        resultEl.textContent = `Could not send update: ${err.message || 'Unknown error'}. Please try again.`;
      }
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
    }
  };
}

// ── Media History ─────────────────────────────────────────────────────────────
export async function pgPatientMediaHistory() {
  setTopbar('My Updates & Feedback');

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  let uploadsRaw = null;
  try {
    uploadsRaw = await _mediaFetch('/api/v1/media/patient/uploads');
  } catch (_e) {
    uploadsRaw = null;
  }

  if (uploadsRaw === null) {
    el.innerHTML = `
      <div class="card">
        <div class="card-body" style="text-align:center;padding:48px;color:var(--text-tertiary)">
          <div style="font-size:24px;margin-bottom:12px;opacity:.4">📋</div>
          Could not load your updates. Please check your connection and try again.<br>
          <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="window._navPatient('pt-media-history')">Retry →</button>
        </div>
      </div>`;
    return;
  }

  let uploads = Array.isArray(uploadsRaw) ? uploadsRaw : (uploadsRaw?.uploads || []);

  // Sort newest first
  uploads = uploads.slice().sort((a, b) =>
    new Date(b.created_at || 0) - new Date(a.created_at || 0)
  );

  // Check for undismissed red flags
  const hasRedFlag = uploads.some(u => u.has_undismissed_flag === true || u.flag_pending === true);

  // Filter state
  let _typeFilter   = 'all';
  let _statusFilter = 'all';

  const STATUS_META = {
    uploaded:               { label: 'Uploaded',            color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.06)' },
    pending_review:         { label: 'Pending Review',       color: '#f59e0b',              bg: 'rgba(245,158,11,0.1)'  },
    approved_for_analysis:  { label: 'Being Reviewed',       color: 'var(--blue)',          bg: 'rgba(74,158,255,0.1)' },
    analyzing:              { label: 'Being Analyzed',       color: 'var(--blue)',          bg: 'rgba(74,158,255,0.1)' },
    analyzed:               { label: 'Analyzed',             color: 'var(--teal)',          bg: 'rgba(0,212,188,0.08)' },
    clinician_reviewed:     { label: 'Care Team Reviewed',   color: 'var(--green,#22c55e)', bg: 'rgba(34,197,94,0.08)' },
    rejected:               { label: 'Not Used',             color: '#ef4444',              bg: 'rgba(239,68,68,0.08)' },
    reupload_requested:     { label: 'Re-upload Requested',  color: '#f97316',              bg: 'rgba(249,115,22,0.08)' },
  };

  const NON_DELETABLE = new Set(['clinician_reviewed', 'analyzing']);

  function statusChip(status) {
    const meta = STATUS_META[status] || { label: status || 'Unknown', color: 'var(--text-tertiary)', bg: 'rgba(255,255,255,0.06)' };
    return `<span style="font-size:10.5px;font-weight:600;padding:2px 9px;border-radius:99px;color:${meta.color};background:${meta.bg};border:1px solid ${meta.color};opacity:0.85">
      ${meta.label}
    </span>`;
  }

  function uploadCardHTML(u, idx) {
    const isVoice     = (u.upload_type || u.media_type || '').toLowerCase().includes('voice') ||
                        (u.upload_type || u.media_type || '').toLowerCase().includes('audio');
    const typeIcon    = isVoice ? '🎙' : '📝';
    const dateStr     = fmtDate(u.created_at || u.uploaded_at);
    const courseName  = u.course_name || u.course_slug || null;
    const notePrev    = (u.patient_note || u.text_content || '').slice(0, 100);
    const status      = u.status || 'uploaded';
    const canDelete   = !NON_DELETABLE.has(status);
    const feedbackReason = u.review_reason || u.feedback || null;
    const durationSec = u.duration_seconds || null;

    return `
      <div class="card" style="margin-bottom:12px" id="media-card-${idx}">
        <div class="card-body" style="padding:16px 18px">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <div style="font-size:20px;flex-shrink:0;margin-top:2px">${typeIcon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:5px">
                <span style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${dateStr}</span>
                ${courseName ? `<span style="font-size:11px;color:var(--blue)">· ${courseName}</span>` : ''}
                ${durationSec != null ? `<span style="font-size:11px;color:var(--text-tertiary)">${durationSec}s</span>` : ''}
                ${statusChip(status)}
              </div>
              ${notePrev ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5">${notePrev}</div>` : ''}
              ${feedbackReason ? `
              <div style="font-size:12px;color:var(--teal);background:rgba(0,212,188,0.06);border-left:2px solid var(--teal);padding:8px 10px;border-radius:0 6px 6px 0;margin-bottom:8px;line-height:1.55">
                <strong>Feedback from your care team:</strong> ${feedbackReason}
              </div>` : ''}
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                ${canDelete ? `<button class="btn btn-ghost btn-sm" style="color:var(--red,#ef4444);border-color:rgba(239,68,68,0.25);font-size:11px"
                        onclick="window._ptDeleteUpload(${idx}, '${u.id || ''}')">Delete</button>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function filteredUploads() {
    return uploads.filter(u => {
      const isVoice = (u.upload_type || u.media_type || '').toLowerCase().includes('voice') ||
                     (u.upload_type || u.media_type || '').toLowerCase().includes('audio');
      const typeOk = _typeFilter === 'all'
        || (_typeFilter === 'text'  && !isVoice)
        || (_typeFilter === 'voice' && isVoice);
      const statusOk = _statusFilter === 'all' || u.status === _statusFilter;
      return typeOk && statusOk;
    });
  }

  function renderList() {
    const listEl = document.getElementById('pt-media-list');
    if (!listEl) return;
    const items = filteredUploads();
    if (items.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:48px;color:var(--text-tertiary)">
          <div style="font-size:24px;margin-bottom:12px;opacity:.4">📋</div>
          No updates yet.<br>
          <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="window._navPatient('pt-media-upload')">Send Your First Update →</button>
        </div>`;
      return;
    }
    listEl.innerHTML = items.map((u, i) => uploadCardHTML(u, i)).join('');
  }

  el.innerHTML = `
    ${hasRedFlag ? `
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span style="font-size:18px">⚠</span>
      <div style="font-size:12.5px;color:var(--text-primary);line-height:1.55">
        <strong>Your care team has flagged an item for follow-up.</strong>
        Please contact your clinic.
      </div>
      <button class="btn btn-ghost btn-sm" style="flex-shrink:0" onclick="window._navPatient('patient-messages')">Message clinic →</button>
    </div>` : ''}

    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="display:flex;gap:6px">
        ${['all','text','voice'].map(f => `
          <button class="btn btn-ghost btn-sm" id="pt-type-filter-${f}" style="font-size:11.5px;${_typeFilter === f ? 'background:rgba(0,212,188,0.12);color:var(--teal);border-color:rgba(0,212,188,0.3)' : ''}"
                  onclick="window._ptMediaTypeFilter('${f}')">${f === 'all' ? 'All' : f === 'text' ? '📝 Text' : '🎙 Voice'}</button>
        `).join('')}
      </div>
      <div style="width:1px;height:20px;background:var(--border)"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${['all','pending_review','clinician_reviewed','rejected'].map(f => `
          <button class="btn btn-ghost btn-sm" id="pt-status-filter-${f}" style="font-size:11.5px;${_statusFilter === f ? 'background:rgba(0,212,188,0.12);color:var(--teal);border-color:rgba(0,212,188,0.3)' : ''}"
                  onclick="window._ptMediaStatusFilter('${f}')">${f === 'all' ? 'All' : (STATUS_META[f]?.label || f)}</button>
        `).join('')}
      </div>
      <div style="margin-left:auto">
        <button class="btn btn-primary btn-sm" onclick="window._navPatient('pt-media-upload')">+ Send Update</button>
      </div>
    </div>

    <div id="pt-media-list"></div>
  `;

  renderList();

  window._ptMediaTypeFilter = function(filter) {
    _typeFilter = filter;
    ['all','text','voice'].forEach(f => {
      const btn = document.getElementById(`pt-type-filter-${f}`);
      if (btn) btn.style.cssText = `font-size:11.5px;${f === filter ? 'background:rgba(0,212,188,0.12);color:var(--teal);border-color:rgba(0,212,188,0.3)' : ''}`;
    });
    renderList();
  };

  window._ptMediaStatusFilter = function(filter) {
    _statusFilter = filter;
    ['all','pending_review','clinician_reviewed','rejected'].forEach(f => {
      const btn = document.getElementById(`pt-status-filter-${f}`);
      if (btn) btn.style.cssText = `font-size:11.5px;${f === filter ? 'background:rgba(0,212,188,0.12);color:var(--teal);border-color:rgba(0,212,188,0.3)' : ''}`;
    });
    renderList();
  };

  window._ptDeleteUpload = async function(idx, uploadId) {
    if (!confirm('Delete this upload? This cannot be undone.')) return;
    const id = uploadId || uploads[idx]?.id;
    if (!id) return;
    const card = document.getElementById(`media-card-${idx}`);
    try {
      await _mediaFetch(`/api/v1/media/patient/upload/${id}`, { method: 'DELETE' });
      // Remove from local array and re-render
      uploads = uploads.filter(u => u.id !== id);
      renderList();
    } catch (err) {
      if (card) {
        const errMsg = document.createElement('div');
        errMsg.className = 'notice notice-error';
        errMsg.style.cssText = 'font-size:11.5px;margin-top:8px';
        errMsg.textContent = `Could not delete: ${err.message || 'Unknown error'}`;
        card.querySelector('.card-body')?.appendChild(errMsg);
        setTimeout(() => errMsg.remove(), 3000);
      }
    }
  };
}

// Module-level chat state so history survives tab navigation
const _wearableChat = { msgs: [] };

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
  // Use module-level cache so history survives tab navigation
  const wearableChatMessages = _wearableChat.msgs;

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
          ${latestMood != null ? trendCard('Mood', latestMood, '/5', [], 'var(--amber)', 'Wellness check-in', 'var(--amber)') : ''}
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
    if (latestMood != null)  lines.push(`Latest mood check-in: ${latestMood}/5`);
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
      const isRateLimit = _e?.message?.includes('429') || _e?.status === 429;
      const errMsg = isRateLimit
        ? "You're sending messages too quickly. Please wait a moment and try again."
        : 'Could not reach AI assistant. Please try again.';
      wearableChatMessages.push({ role: 'assistant', content: errMsg });
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
