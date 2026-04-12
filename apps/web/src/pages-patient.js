// Patient portal pages — simpler, calmer UI than the professional app
// All pages render into #patient-content
import { api } from './api.js';
import { currentUser } from './auth.js';
import { t, getLocale, setLocale, LOCALES } from './i18n.js';

// ── Nav definition ────────────────────────────────────────────────────────────
function _patientNav() {
  return [
    // Main
    { id: 'patient-portal',      label: 'Home',                 icon: '⌂',  group: 'main' },
    { id: 'patient-sessions',    label: 'Sessions',             icon: '◧',  group: 'main' },
    { id: 'patient-course',      label: 'Treatment Plan',       icon: '◎',  group: 'main' },
    { id: 'pt-outcomes',         label: 'Progress',             icon: '📈', group: 'main' },
    { id: 'pt-wellness',         label: 'Tasks',                icon: '✓',  group: 'main' },
    { id: 'patient-assessments', label: 'Assessments',          icon: '◉',  group: 'main' },
    { id: 'patient-reports',     label: 'My Reports',           icon: '◱',  group: 'main' },
    { id: 'patient-messages',    label: 'Messages',             icon: '◫',  group: 'main' },
    { id: 'patient-wearables',   label: 'Devices & Wearables',  icon: '◌',  group: 'main' },
    { id: 'patient-profile',     label: 'Profile',              icon: '◇',  group: 'main' },
    // Optional
    { id: 'pt-caregiver',        label: 'Caregiver Access',     icon: '👤', group: 'optional' },
    // Always at bottom
    { id: 'pt-help',             label: 'Help',                 icon: '?',  group: 'bottom' },
  ];
}

function _patientBottomNav() {
  return [
    { id: 'patient-portal',      label: 'Home',        icon: '⌂' },
    { id: 'patient-sessions',    label: 'Sessions',    icon: '◧' },
    { id: 'pt-wellness',         label: 'Tasks',       icon: '✓' },
    { id: 'patient-messages',    label: 'Messages',    icon: '◫' },
    { id: 'patient-profile',     label: 'Profile',     icon: '◇' },
  ];
}

export function renderPatientNav(currentPage) {
  const _ptNavList = document.getElementById('patient-nav-list');
  if (_ptNavList) {
    const navItems = _patientNav();
    const mainItems = navItems.filter(n => n.group === 'main');
    const optionalItems = navItems.filter(n => n.group === 'optional');
    const bottomItems = navItems.filter(n => n.group === 'bottom');

    const renderItem = n => {
      const badge = n.badge ? `<span class="nav-badge">${n.badge}</span>` : '';
      return `<div class="nav-item ${currentPage === n.id ? 'active' : ''}" onclick="window._navPatient('${n.id}')">
        <span class="nav-icon">${n.icon}</span>
        <span style="flex:1">${n.label}</span>${badge}
      </div>`;
    };

    let html = mainItems.map(renderItem).join('');

    if (optionalItems.length) {
      html += `<div class="nav-section-divider" style="margin:6px 12px;border-top:1px solid rgba(255,255,255,0.06)"></div>`;
      html += optionalItems.map(renderItem).join('');
    }

    if (bottomItems.length) {
      html += `<div style="flex:1"></div>`; // push to bottom
      html += `<div class="nav-section-divider" style="margin:6px 12px;border-top:1px solid rgba(255,255,255,0.06)"></div>`;
      html += bottomItems.map(renderItem).join('');
    }

    _ptNavList.innerHTML = html;
    _ptNavList.style.display = 'flex';
    _ptNavList.style.flexDirection = 'column';
  }

  const bottomNav = document.getElementById('pt-bottom-nav');
  if (bottomNav) {
    bottomNav.innerHTML = _patientBottomNav().map(n => {
      const active = currentPage === n.id;
      return `<button class="pt-bottom-nav-item${active ? ' active' : ''}" onclick="window._navPatient('${n.id}')">
        <span style="font-size:18px">${n.icon}</span>
        <span>${n.label}</span>
      </button>`;
    }).join('');
  }
}

export function setTopbar(title, html = '') {
  const _ttl = document.getElementById('patient-page-title');
  const _act = document.getElementById('patient-topbar-actions');
  if (_ttl) _ttl.textContent = title;
  if (_act) _act.innerHTML = html;
}

function spinner() {
  return '<div style="text-align:center;padding:48px;color:var(--teal);font-size:24px">◈</div>';
}

// ── Sparkline helper ──────────────────────────────────────────────────────────
function sparklineSVG(data, color, width = 120, height = 32) {
  if (!data || data.length < 2) return '';
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

// ── Patient-friendly visual components ────────────────────────────────────────
// Pure HTML/SVG string generators shared across all patient pages. pviz-* CSS namespace.

/** Arc gauge barometer (semicircle). value: 0–100. */
function _vizGauge(value, opts) {
  opts = opts || {};
  var size = opts.size || 130;
  var label = opts.label || '';
  var subtitle = opts.subtitle || '';
  var v = Math.max(0, Math.min(100, value || 0));
  var color = v >= 60 ? '#2dd4bf' : v >= 35 ? '#fbbf24' : '#fb7185';
  var gLabel = label || (v >= 60 ? 'Improving' : v >= 35 ? 'Stable' : 'Needs review');
  var cx = size / 2, cy = size * 0.52, R = size * 0.38, sw = size * 0.065;
  var sx = (cx - R).toFixed(2), sy = cy.toFixed(2), ex = (cx + R).toFixed(2);
  var h = Math.round(cy + sw + 24);
  function arcPt(pct) {
    var a = (180 - pct * 1.8) * Math.PI / 180;
    return { x: (cx + R * Math.cos(a)).toFixed(2), y: (cy - R * Math.sin(a)).toFixed(2) };
  }
  var p33 = arcPt(33), p67 = arcPt(67), pf = arcPt(v);
  var swStr = sw.toFixed(1);
  return '<div class="pviz-gauge">' +
    '<svg width="' + size + '" height="' + h + '" viewBox="0 0 ' + size + ' ' + h + '" style="display:block;margin:0 auto;overflow:visible">' +
    '<path d="M' + sx + ',' + sy + ' A' + R + ',' + R + ' 0 0,1 ' + p33.x + ',' + p33.y + '" fill="none" stroke="rgba(251,113,133,0.2)" stroke-width="' + swStr + '" stroke-linecap="round"/>' +
    '<path d="M' + p33.x + ',' + p33.y + ' A' + R + ',' + R + ' 0 0,1 ' + p67.x + ',' + p67.y + '" fill="none" stroke="rgba(251,191,36,0.15)" stroke-width="' + swStr + '" stroke-linecap="round"/>' +
    '<path d="M' + p67.x + ',' + p67.y + ' A' + R + ',' + R + ' 0 0,1 ' + ex + ',' + sy + '" fill="none" stroke="rgba(45,212,191,0.2)" stroke-width="' + swStr + '" stroke-linecap="round"/>' +
    (v > 0 ? '<path d="M' + sx + ',' + sy + ' A' + R + ',' + R + ' 0 0,1 ' + pf.x + ',' + pf.y + '" fill="none" stroke="' + color + '" stroke-width="' + swStr + '" stroke-linecap="round"/>' : '') +
    (v > 0 ? '<circle cx="' + pf.x + '" cy="' + pf.y + '" r="' + (sw * 0.65).toFixed(1) + '" fill="' + color + '" stroke="#0f172a" stroke-width="1.5"/>' : '') +
    '<text x="0" y="' + Math.round(cy + sw + 14) + '" text-anchor="start" font-size="7" fill="rgba(251,113,133,0.55)" font-family="sans-serif">Needs review</text>' +
    '<text x="' + Math.round(cx) + '" y="' + Math.round(cy - R - 10) + '" text-anchor="middle" font-size="7" fill="rgba(251,191,36,0.55)" font-family="sans-serif">Stable</text>' +
    '<text x="' + size + '" y="' + Math.round(cy + sw + 14) + '" text-anchor="end" font-size="7" fill="rgba(45,212,191,0.55)" font-family="sans-serif">Improving</text>' +
    '</svg>' +
    '<div class="pviz-gauge-label" style="color:' + color + '">' + gLabel + '</div>' +
    (subtitle ? '<div class="pviz-gauge-sub">' + subtitle + '</div>' : '') +
    '</div>';
}

/** Traffic-light dot. status: 'green' | 'amber' | 'red' | 'grey' */
function _vizTrafficLight(status, label) {
  var cfg = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444', grey: '#64748b' };
  var color = cfg[status] || cfg.grey;
  return '<span class="pviz-tl">' +
    '<span class="pviz-tl-dot' + (status === 'red' ? ' pviz-tl-pulse' : '') + '" style="background:' + color + '"></span>' +
    (label ? '<span class="pviz-tl-lbl">' + label + '</span>' : '') +
    '</span>';
}

/** Trend arrow badge. direction: 'up'|'stable'|'down'. good: 'up'(default)|'down' */
function _vizTrendArrow(direction, label, good) {
  good = good || 'up';
  var isGood = good === 'down' ? direction === 'down' : direction === 'up';
  var isNeutral = direction === 'stable' || direction === 'neutral';
  var color = isNeutral ? '#60a5fa' : isGood ? '#2dd4bf' : '#fbbf24';
  var icon = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  return '<span class="pviz-arrow" style="color:' + color + ';background:' + color + '18;border-color:' + color + '33">' +
    icon + (label ? '\u00a0' + label : '') + '</span>';
}

/** 7-day pattern strip. days: [{dayName, status, isToday}]. status: 'done'|'partial'|'missed'|'future' */
function _vizWeekStrip(days, opts) {
  opts = opts || {};
  var SC = { done: '#2dd4bf', partial: '#f59e0b', missed: 'rgba(251,113,133,0.35)', future: 'transparent' };
  var cells = days.map(function(d) {
    var col = SC[d.status] || 'rgba(255,255,255,0.06)';
    var border = d.isToday ? '1px solid rgba(255,255,255,0.28)' : '1px solid transparent';
    return '<div class="pviz-ws-cell">' +
      '<div class="pviz-ws-sq" style="background:' + col + ';border:' + border + '"></div>' +
      '<div class="pviz-ws-day">' + (d.dayName || '').slice(0, 1) + '</div>' +
    '</div>';
  }).join('');
  var legend = opts.legend !== false
    ? '<div class="pviz-ws-legend"><span><span class="pviz-ws-dot" style="background:#2dd4bf"></span>Logged</span><span><span class="pviz-ws-dot" style="background:rgba(251,113,133,0.5)"></span>Missed</span></div>'
    : '';
  return '<div class="pviz-week-strip"><div class="pviz-ws-squares">' + cells + '</div>' + legend + '</div>';
}

/** Horizontal milestone timeline SVG. milestones: [{at, label}] */
function _vizMilestoneTimeline(current, total, milestones) {
  if (!total) return '';
  var pct = Math.min(100, Math.round((current / total) * 100));
  var W = 600, H = 72, py = 36, pl = 8, pr = 8, iW = W - pl - pr;
  function xOf(n) { return (pl + (n / total) * iW).toFixed(1); }
  var parts = [];
  parts.push('<rect x="' + pl + '" y="' + (py - 3) + '" width="' + iW + '" height="6" rx="3" fill="rgba(255,255,255,0.06)"/>');
  if (pct > 0) parts.push('<rect x="' + pl + '" y="' + (py - 3) + '" width="' + ((pct / 100) * iW).toFixed(1) + '" height="6" rx="3" fill="#2dd4bf" opacity="0.75"/>');
  milestones.forEach(function(m, idx) {
    var x = xOf(m.at);
    var reached = current >= m.at;
    var tc = reached ? 'rgba(45,212,191,0.8)' : 'rgba(148,163,184,0.45)';
    var ly = idx % 2 === 0 ? py - 18 : py + 26;
    parts.push('<circle cx="' + x + '" cy="' + py + '" r="6" fill="' + (reached ? '#2dd4bf' : 'rgba(255,255,255,0.06)') + '" stroke="' + (reached ? '#2dd4bf' : 'rgba(255,255,255,0.22)') + '" stroke-width="1.5"/>');
    if (reached) parts.push('<text x="' + x + '" y="' + (py + 4) + '" text-anchor="middle" font-size="7" fill="#0f172a" font-weight="700" font-family="sans-serif">\u2713</text>');
    parts.push('<text x="' + x + '" y="' + ly + '" text-anchor="middle" font-size="8.5" fill="' + tc + '" font-family="sans-serif">' + (m.label || ('Sess ' + m.at)) + '</text>');
  });
  if (pct > 0 && pct < 100) {
    var cx2 = (pl + (pct / 100) * iW).toFixed(1);
    parts.push('<circle cx="' + cx2 + '" cy="' + py + '" r="5" fill="#2dd4bf" stroke="#0f172a" stroke-width="2"/>');
  }
  return '<div class="pviz-timeline"><svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" style="display:block;overflow:visible">' + parts.join('') + '</svg></div>';
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
    const loc = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
    return new Date(d).toLocaleDateString(loc, { month: 'short', day: 'numeric', year: 'numeric' });
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
  setTopbar('Home');
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  const firstName = esc((user?.display_name || 'there').split(' ')[0]);

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  const [portalSessions, portalCourses, portalOutcomes] = await Promise.all([
    api.patientPortalSessions().catch(() => null),
    api.patientPortalCourses().catch(() => null),
    api.patientPortalOutcomes().catch(() => null),
  ]);

  const sessions = Array.isArray(portalSessions) ? portalSessions : [];
  const outcomes = Array.isArray(portalOutcomes) ? portalOutcomes : [];
  const coursesArr = Array.isArray(portalCourses) ? portalCourses : [];
  const activeCourse = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  const totalPlanned  = activeCourse?.total_sessions_planned ?? null;
  const sessDelivered = activeCourse?.session_count ?? sessions.length;
  const progressPct   = (totalPlanned && sessDelivered) ? Math.round((sessDelivered / totalPlanned) * 100) : null;
  const sessRemaining = (totalPlanned != null && sessDelivered != null) ? Math.max(0, totalPlanned - sessDelivered) : null;

  const now = Date.now();
  const loc = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
  const upcomingSessions = sessions
    .filter(s => s.scheduled_at && new Date(s.scheduled_at).getTime() > now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const nextSess = upcomingSessions[0] || null;
  const nextSessDate = nextSess ? new Date(nextSess.scheduled_at) : null;
  const nextSessDateLabel = nextSessDate
    ? nextSessDate.toLocaleDateString(loc, { weekday: 'long', month: 'short', day: 'numeric' })
    : null;
  const nextSessTime = nextSessDate
    ? nextSessDate.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' })
    : null;
  const msUntilNext = nextSessDate ? nextSessDate.getTime() - now : null;
  const daysUntilNext = msUntilNext !== null ? Math.ceil(msUntilNext / 86400000) : null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayFmt = new Date().toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' });
  const todayStr = new Date().toISOString().slice(0, 10);
  const checkedInToday = localStorage.getItem('ds_last_checkin') === todayStr;

  // ── Wellness snapshot from check-in history ──────────────────────────────────
  function _ptdGetCheckins(n) {
    const result = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const raw = localStorage.getItem('ds_checkin_' + d);
      if (raw) { try { result.push({ date: d, ...JSON.parse(raw) }); } catch (_e) {} }
    }
    return result;
  }
  const recentCheckins = _ptdGetCheckins(7);
  const hasCheckinData = recentCheckins.length > 0;
  const latestCheckin = recentCheckins[0] || null;

  function _ptdWellnessTrend() {
    if (recentCheckins.length < 2) return { label: 'Check in to see your trend', icon: '○', color: 'var(--text-secondary,#94a3b8)' };
    const recent = recentCheckins.slice(0, 2);
    const all5 = recentCheckins.slice(0, Math.min(5, recentCheckins.length));
    const avgRecent = recent.reduce((s, c) => s + ((c.mood || 5) + (c.sleep || 5) + (c.energy || 5)) / 3, 0) / recent.length;
    const avgAll = all5.reduce((s, c) => s + ((c.mood || 5) + (c.sleep || 5) + (c.energy || 5)) / 3, 0) / all5.length;
    const delta = avgRecent - avgAll;
    if (delta >= 0.5) return { label: 'Improving', icon: '↑', color: '#22c55e' };
    if (delta <= -0.5) return { label: 'Needs review', icon: '↓', color: 'var(--accent-amber,#fbbf24)' };
    return { label: 'Steady', icon: '→', color: 'var(--text-secondary)' };
  }
  const wellnessTrend = _ptdWellnessTrend();

  const wellnessDrivers = latestCheckin ? [
    { label: 'Mood',        val: latestCheckin.mood   ?? '—', icon: '◑', color: 'var(--teal)' },
    { label: 'Sleep',       val: latestCheckin.sleep  ?? '—', icon: '◌', color: 'var(--accent-blue,#60a5fa)' },
    { label: 'Energy',      val: latestCheckin.energy ?? '—', icon: '◉', color: 'var(--accent-violet,#a78bfa)' },
    { label: 'Side effects',val: (!latestCheckin.side_effects || latestCheckin.side_effects === 'none') ? 'None' : latestCheckin.side_effects, icon: '◎', color: 'var(--text-secondary)' },
  ] : [];

  // ── Outcome trend ─────────────────────────────────────────────────────────────
  const sortedOutcomes = outcomes.slice().sort((a, b) => new Date(a.administered_at || 0) - new Date(b.administered_at || 0));

  function _ptdOutcomeTrend() {
    const phq = sortedOutcomes.filter(o => (o.template_name || '').toLowerCase().includes('phq'));
    const gad = sortedOutcomes.filter(o => (o.template_name || '').toLowerCase().includes('gad'));
    const best = phq.length >= 2 ? phq : gad.length >= 2 ? gad : sortedOutcomes.length >= 2 ? sortedOutcomes : null;
    if (!best || best.length < 2) return null;
    const baseline = best[0], latest = best[best.length - 1];
    if (baseline.score_numeric == null || latest.score_numeric == null) return null;
    const change = latest.score_numeric - baseline.score_numeric;
    const pct = baseline.score_numeric > 0 ? Math.abs(Math.round((change / baseline.score_numeric) * 100)) : 0;
    return { name: baseline.template_name || 'Assessment', baseline: baseline.score_numeric, current: latest.score_numeric, change, pct, improving: change < 0 };
  }
  const outcomeTrend = _ptdOutcomeTrend();

  // ── Clinician feedback ───────────────────────────────────────────────────────
  const reviewedOutcomes = outcomes.filter(o => o.reviewed_by || o.reviewed_at || o.clinician_notes);
  const latestReview = reviewedOutcomes.length ? reviewedOutcomes[reviewedOutcomes.length - 1] : null;
  let clinicianFeedback = null;
  try { const r = localStorage.getItem('ds_clinician_feedback'); if (r) clinicianFeedback = JSON.parse(r); } catch (_e) {}
  if (!clinicianFeedback && !latestReview) {
    clinicianFeedback = {
      reviewer: 'Dr. Reyes', _isDemoData: true,
      date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10),
      summary: 'Your session notes and check-in scores were reviewed. Response is tracking well \u2014 continue with current protocol.',
    };
  }

  // ── Task list ────────────────────────────────────────────────────────────────
  const taskList = [];
  if (!checkedInToday) taskList.push({ id: 'checkin', icon: '💚', label: 'Daily check-in', urgency: 'today', nav: 'pt-wellness', cta: 'Start' });
  try {
    const ptKey = user?.patient_id || user?.id || 'default';
    const homeTasks = JSON.parse(localStorage.getItem('ds_homework_tasks_' + ptKey) || '[]');
    homeTasks.filter(t => !t.completed && !t.done).slice(0, 3).forEach(t => {
      taskList.push({ id: 'ht_' + (t.id || Math.random()), icon: '📝', label: t.title || t.name || 'Home task', urgency: 'recommended', nav: 'pt-wellness', cta: 'Complete' });
    });
  } catch (_e) {}
  if (sortedOutcomes.length > 0) {
    const daysSince = Math.floor((now - new Date(sortedOutcomes[sortedOutcomes.length - 1].administered_at || 0).getTime()) / 86400000);
    if (daysSince > 14) taskList.push({ id: 'assessment', icon: '📋', label: 'Assessment overdue by ' + daysSince + ' days', urgency: 'overdue', nav: 'patient-assessments', cta: 'Start' });
  }
  if (daysUntilNext !== null && daysUntilNext <= 2) {
    taskList.push({ id: 'prep', icon: '📅', label: daysUntilNext === 0 ? 'Session today \u2014 prepare now' : 'Session tomorrow \u2014 review your notes', urgency: 'today', nav: 'patient-sessions', cta: 'View' });
  }

  // ── Biometrics (localStorage or demo seed) ──────────────────────────────���─────
  let biometrics = null;
  try { const r = localStorage.getItem('ds_wearable_summary'); if (r) biometrics = JSON.parse(r); } catch (_e) {}
  if (!biometrics) biometrics = { hrv: { val: 52, unit: 'ms', trend: '+3' }, sleep: { val: 6.8, unit: 'h', trend: '+0.4' }, rhr: { val: 68, unit: 'bpm', trend: '\u22122' }, lastSync: 'Today, 7:42 AM', _isDemoData: true };

  // ── Phase label ───────────────────────────────────────────────────────────────
  function phaseLabel(pct) {
    if (!pct)      return 'Getting started';
    if (pct <= 20) return 'Early treatment';
    if (pct <= 50) return 'Active treatment';
    if (pct <= 80) return 'Consolidation';
    if (pct < 100) return 'Final phase';
    return 'Complete';
  }
  function nextMilestone(pct, total) {
    if (!total || !pct) return null;
    const done = Math.round((pct / 100) * total);
    if (done < 4) return { label: 'First week review', at: 4 };
    if (done < Math.round(total * 0.5)) return { label: 'Halfway milestone', at: Math.round(total * 0.5) };
    if (done < Math.round(total * 0.75)) return { label: 'Three-quarter review', at: Math.round(total * 0.75) };
    return null;
  }
  const milestone = nextMilestone(progressPct, totalPlanned);

  // ── Countdown label ───────────────────────────────────────────────────────────
  function countdownLabel() {
    if (daysUntilNext === null) return null;
    if (daysUntilNext === 0) return 'Today';
    if (daysUntilNext === 1) return 'Tomorrow';
    return 'In ' + daysUntilNext + ' days';
  }

  function urgencyBadge(urgency) {
    if (urgency === 'overdue')        return '<span class="ptd-task-badge ptd-task-badge--overdue">Overdue</span>';
    if (urgency === 'today')          return '<span class="ptd-task-badge ptd-task-badge--today">Today</span>';
    if (urgency === 'before-session') return '<span class="ptd-task-badge ptd-task-badge--session">Before next session</span>';
    if (urgency === 'recommended')    return '<span class="ptd-task-badge ptd-task-badge--rec">Recommended</span>';
    return '';
  }

  // ── Wellness gauge value (0-100 maps to trend) ───────────────────────────────
  const wellnessGaugeVal = (() => {
    if (!hasCheckinData) return 0;
    if (wellnessTrend.label === 'Improving') return 76;
    if (wellnessTrend.label === 'Needs review') return 22;
    if (wellnessTrend.label === 'Steady') return 50;
    return 38; // "Check in to see your trend" — below stable
  })();

  // ── 7-day check-in strip data ─────────────────────────────────────────────
  const weekStripDays = (() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const ds = d.toISOString().slice(0, 10);
      const hasCk = !!localStorage.getItem('ds_checkin_' + ds);
      const isFut = ds > todayStr;
      days.push({
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
        status: isFut ? 'future' : hasCk ? 'done' : ds === todayStr ? 'future' : 'missed',
        isToday: ds === todayStr,
      });
    }
    return days;
  })();

  // ── Wellness interpretation sentence ─────────────────────────────────────────
  function _ptdWellnessInterp() {
    if (!hasCheckinData || recentCheckins.length < 2) return 'Complete more check-ins to build your trend.';
    if (wellnessTrend.label === 'Improving') {
      const lt = recentCheckins[0], pv = recentCheckins[1];
      if ((lt.energy || 5) > (pv.energy || 5)) return 'Your energy is improving compared with recent check-ins.';
      return 'Your recent check-ins show a positive trend.';
    }
    if (wellnessTrend.label === 'Steady') return 'Your recent check-ins look stable.';
    return 'Your care team can see any variation in your check-ins.';
  }
  const wellnessInterp = _ptdWellnessInterp();

  // ── Render ────────────────────────────────────────────────────────────────────
  el.innerHTML = `
    <div class="ptd-dashboard">

      <!-- Greeting -->
      <div class="ptd-greeting-row">
        <div>
          <div class="ptd-greeting-name">${greeting}, ${firstName}</div>
          <div class="ptd-greeting-date">${todayFmt}</div>
        </div>
        <button class="ptd-ca-trigger" onclick="window._ptdOpenAssistant()">
          <span style="font-size:16px">◎</span>
          <span>Ask Your Care Assistant</span>
        </button>
      </div>

      <!-- ROW 1: Next Session · Treatment Progress · Wellness Snapshot -->
      <div class="ptd-row1">

        <!-- Next Session -->
        <div class="ptd-card ptd-card--session" onclick="window._navPatient('patient-sessions')" role="button" tabindex="0">
          <div class="ptd-eyebrow">Next Session</div>
          ${nextSessDateLabel
            ? `<div class="ptd-next-date">${nextSessDateLabel}</div>
               <div class="ptd-next-time">${nextSessTime}${nextSess.modality_slug ? ' \xb7 ' + esc(nextSess.modality_slug) : ''}</div>
               <div class="ptd-countdown-badge">${countdownLabel() || ''}</div>
               <div class="ptd-meta-chips">
                 <span class="ptd-chip">${sessDelivered} done</span>
                 ${sessRemaining !== null ? '<span class="ptd-chip">' + sessRemaining + ' remaining</span>' : ''}
               </div>`
            : `<div class="ptd-empty-headline">No session booked yet</div>
               <div class="ptd-empty-support">Your clinic can help you schedule your next visit.</div>
               <button class="ptd-inline-btn" onclick="event.stopPropagation();window._navPatient('patient-messages')" style="margin:8px 0 4px">Contact clinic to schedule \u2192</button>
               <div class="ptd-empty-hint">You&rsquo;ll see session details here once it&rsquo;s booked.</div>`}
          <div class="ptd-card-link${nextSessDateLabel ? '' : ' ptd-card-link--dim'}">View session details \u2192</div>
        </div>

        <!-- Treatment Progress -->
        <div class="ptd-card" onclick="window._navPatient('patient-course')" role="button" tabindex="0">
          <div class="ptd-eyebrow">Treatment Progress</div>
          ${activeCourse
            ? `<div class="ptd-card-headline">${phaseLabel(progressPct)}</div>
               <div class="ptd-card-sub">${esc(activeCourse.condition_slug || activeCourse.condition || 'Treatment')}${activeCourse.modality_slug ? ' \xb7 ' + esc(activeCourse.modality_slug) : ''}</div>
               <div class="ptd-prog-wrap">
                 <div class="ptd-prog-track"><div class="ptd-prog-fill" style="width:${progressPct || 0}%"></div></div>
                 <div class="ptd-prog-labels"><span>${sessDelivered} of ${totalPlanned ?? '?'} sessions</span><span>${progressPct !== null ? progressPct + '%' : ''}</span></div>
               </div>
               ${milestone ? '<div class="ptd-milestone">Next: ' + milestone.label + ' at session ' + milestone.at + '</div>' : ''}`
            : `<div class="ptd-empty-headline">Your treatment plan is not active yet</div>
               <div class="ptd-empty-support">Your care team will add your treatment course here.</div>
               <div class="ptd-empty-hint">Once assigned, you&rsquo;ll see your phase, sessions, and milestones here.</div>`}
          <div class="ptd-card-link${activeCourse ? '' : ' ptd-card-link--dim'}">View full plan \u2192</div>
        </div>

        <!-- Wellness Snapshot -->
        <div class="ptd-card">
          <div class="ptd-eyebrow">Wellness Snapshot</div>
          ${_vizGauge(wellnessGaugeVal, { size: 122, label: wellnessTrend.label, subtitle: hasCheckinData ? wellnessInterp : 'Complete a check-in to see your trend.' })}
          ${hasCheckinData
            ? `<div class="ptd-driver-grid" style="margin-top:10px">
                 ${wellnessDrivers.map(d => `<div class="ptd-driver">
                   <span class="ptd-driver-icon" style="color:${d.color}">${d.icon}</span>
                   <span class="ptd-driver-label">${d.label}</span>
                   <span class="ptd-driver-val">${d.val}${typeof d.val === 'number' ? '/10' : ''}</span>
                 </div>`).join('')}
               </div>
               ${_vizWeekStrip(weekStripDays, { legend: false })}
               <div class="ptd-snapshot-note">Your care team uses check-ins to monitor progress. Not a medical assessment.</div>`
            : `<div class="ptd-snapshot-empty" style="margin-top:8px">
                 <button class="ptd-inline-btn" onclick="event.stopPropagation();window._navPatient('pt-wellness')">Start check-in \u2192</button>
                 <div class="ptd-empty-hint" style="margin-top:8px">Your care team uses check-ins to help monitor progress.</div>
               </div>`}
        </div>

      </div>

      <!-- ROW 2: Today's Tasks · From Your Care Team -->
      <div class="ptd-row2">

        <!-- Today's Tasks -->
        <div class="ptd-card">
          <div class="ptd-card-hdr">
            <div class="ptd-eyebrow" style="margin-bottom:0">Today&rsquo;s Tasks</div>
            ${taskList.length > 0
              ? '<span class="ptd-task-count">' + taskList.length + ' pending</span>'
              : '<span class="ptd-task-count ptd-task-count--clear">All done \u2713</span>'}
          </div>
          <div class="ptd-task-list">
            ${taskList.length > 0
              ? taskList.map(task => `
                  <div class="ptd-task-item ptd-task-item--${task.urgency}" onclick="window._navPatient('${task.nav}')">
                    <span class="ptd-task-icon">${task.icon}</span>
                    <span class="ptd-task-label">${task.label}</span>
                    ${urgencyBadge(task.urgency)}
                    <span class="ptd-task-cta">${task.cta} \u2192</span>
                  </div>`).join('')
              : `<div class="ptd-tasks-clear">
                   <span style="font-size:22px">✓</span>
                   <div><div style="font-size:13px;font-weight:600;color:var(--text-primary)">All caught up</div><div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Nothing pending for today.</div></div>
                 </div>`}
          </div>
          ${!checkedInToday ? `
          <div class="ptd-checkin-mini" id="ptd-checkin-mini">
            <div class="ptd-checkin-mini-title">Quick check-in</div>
            <div class="ptd-slider-rows">
              ${[
                { id: 'ptd-dc-mood', label: 'Mood', color: 'var(--teal,#2dd4bf)' },
                { id: 'ptd-dc-sleep', label: 'Sleep', color: 'var(--accent-blue,#60a5fa)' },
                { id: 'ptd-dc-energy', label: 'Energy', color: 'var(--accent-violet,#a78bfa)' },
              ].map(s => `<div class="ptd-slider-row">
                <label>${s.label}</label>
                <input type="range" id="${s.id}" min="1" max="10" value="5" oninput="document.getElementById('${s.id}-v').textContent=this.value" style="accent-color:${s.color}">
                <span id="${s.id}-v" style="color:${s.color}">5</span>
              </div>`).join('')}
            </div>
            <button class="ptd-submit-btn" onclick="window._ptdSubmitCheckin()">Save check-in</button>
          </div>` : ''}
        </div>

        <!-- From Your Care Team -->
        <div class="ptd-card">
          <div class="ptd-card-hdr">
            <div class="ptd-eyebrow" style="margin-bottom:0">From Your Care Team</div>
            <button class="ptd-ghost-btn" onclick="window._navPatient('patient-messages')">Messages \u2192</button>
          </div>
          ${(latestReview || clinicianFeedback)
            ? `<div class="ptd-feedback-block">
                 <div class="ptd-reviewed-badge">\u2713 Reviewed by care team</div>
                 <div class="ptd-feedback-text">${esc((latestReview?.clinician_notes) || clinicianFeedback?.summary || 'Your care team has reviewed your latest data.')}</div>
                 <div class="ptd-feedback-meta">
                   ${esc((latestReview?.reviewed_by) || clinicianFeedback?.reviewer || 'Your care team')}
                   ${((latestReview?.reviewed_at) || clinicianFeedback?.date) ? ' \xb7 ' + new Date((latestReview?.reviewed_at) || clinicianFeedback.date).toLocaleDateString(loc, { month: 'short', day: 'numeric' }) : ''}
                   ${clinicianFeedback?._isDemoData ? ' <span style="font-size:10px;color:var(--text-tertiary)">(example)</span>' : ''}
                 </div>
               </div>`
            : `<div class="ptd-feedback-empty">
                 <div style="font-size:18px;opacity:0.25;margin-bottom:8px">◫</div>
                 <div style="font-size:13px;color:var(--text-secondary)">No reviews yet</div>
                 <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;line-height:1.5">Your care team&rsquo;s notes will appear here after they review your sessions.</div>
               </div>`}
          <div class="ptd-feedback-actions">
            <button class="ptd-feedback-action-primary" onclick="window._navPatient('patient-reports')">View report \u2192</button>
            <button class="ptd-inline-btn" onclick="window._ptdOpenAssistant()">Ask a question</button>
          </div>
        </div>

      </div>

      <!-- ROW 3: Progress Over Time · Devices & Biometrics · Sessions Remaining -->
      <div class="ptd-row3">

        <!-- Progress Over Time -->
        <div class="ptd-card">
          <div class="ptd-card-hdr">
            <div class="ptd-eyebrow" style="margin-bottom:0">Progress Over Time</div>
            <button class="ptd-ghost-btn" onclick="window._navPatient('pt-outcomes')">Full view \u2192</button>
          </div>
          ${outcomeTrend
            ? `<div class="ptd-outcome-hero ${outcomeTrend.improving ? 'ptd-outcome-hero--good' : ''}">
                 <span class="ptd-outcome-arrow">${outcomeTrend.improving ? '\u2193' : '\u2192'}</span>
                 <span class="ptd-outcome-pct">${outcomeTrend.pct}% ${outcomeTrend.improving ? 'improvement' : 'change'}</span>
               </div>
               <div class="ptd-outcome-name">${esc(outcomeTrend.name)}</div>
               <div class="ptd-outcome-detail">Baseline: ${outcomeTrend.baseline} \u2192 Now: ${outcomeTrend.current}</div>
               <div class="ptd-outcome-plain">${outcomeTrend.improving
                 ? 'Your score has improved since you started \u2014 a positive response to treatment.'
                 : 'Your score is holding steady. Consistent attendance builds lasting results.'}</div>`
            : `<div style="font-size:13px;color:var(--text-secondary);padding:8px 0 12px">Complete your first assessment to start tracking progress here.</div>
               <button class="ptd-inline-btn" onclick="window._navPatient('patient-assessments')">Start assessment \u2192</button>`}
          ${sessions.length > 0 ? `
          <div class="ptd-sessions-mini">
            <div class="ptd-sm-label">Sessions completed</div>
            <div class="ptd-sm-bar"><div class="ptd-sm-fill" style="width:${progressPct || 0}%"></div></div>
            <div class="ptd-sm-legend"><span>${sessDelivered} done</span><span>${totalPlanned ? totalPlanned + ' total' : ''}</span></div>
          </div>` : ''}
        </div>

        <!-- Devices & Biometrics -->
        <div class="ptd-card">
          <div class="ptd-card-hdr">
            <div class="ptd-eyebrow" style="margin-bottom:0">Devices &amp; Biometrics</div>
            <button class="ptd-ghost-btn" onclick="window._navPatient('patient-wearables')">Details \u2192</button>
          </div>
          <div class="ptd-bio-grid">
            <div class="ptd-bio-item"><div class="ptd-bio-val">${biometrics.hrv.val}<span class="ptd-bio-unit">${biometrics.hrv.unit}</span></div><div class="ptd-bio-lbl">HRV</div><div class="ptd-bio-trend">${biometrics.hrv.trend}</div></div>
            <div class="ptd-bio-item"><div class="ptd-bio-val">${biometrics.sleep.val}<span class="ptd-bio-unit">${biometrics.sleep.unit}</span></div><div class="ptd-bio-lbl">Sleep</div><div class="ptd-bio-trend">${biometrics.sleep.trend}</div></div>
            <div class="ptd-bio-item"><div class="ptd-bio-val">${biometrics.rhr.val}<span class="ptd-bio-unit">${biometrics.rhr.unit}</span></div><div class="ptd-bio-lbl">Resting HR</div><div class="ptd-bio-trend">${biometrics.rhr.trend}</div></div>
          </div>
          <div class="ptd-bio-sync">Last sync: ${biometrics.lastSync}${biometrics._isDemoData ? ' <span style="font-size:10px;color:var(--text-tertiary)">(example)</span>' : ''}</div>
          ${biometrics._isDemoData ? '<button class="ptd-inline-btn" style="margin-top:8px" onclick="window._navPatient(\'patient-wearables\')">Connect device \u2192</button>' : ''}
        </div>

        <!-- Sessions Remaining -->
        <div class="ptd-card ptd-card--sessions-remaining">
          <div class="ptd-eyebrow">Sessions</div>
          ${sessRemaining !== null
            ? `<div class="ptd-sess-count">${sessRemaining}</div>
               <div class="ptd-sess-label">sessions remaining</div>
               <div class="ptd-sess-of">${sessDelivered} of ${totalPlanned} complete</div>`
            : `<div class="ptd-sess-count ptd-empty">\u2014</div>
               <div class="ptd-sess-label">Contact your clinic for session details.</div>`}
          ${activeCourse?.status === 'active' ? `<div class="ptd-pkg-chip">${esc(activeCourse.condition_slug || 'Active course')}${activeCourse.modality_slug ? ' \xb7 ' + esc(activeCourse.modality_slug) : ''}</div>` : ''}
          <button class="ptd-inline-btn ptd-inline-btn--full" onclick="window._navPatient('patient-sessions')" style="margin-top:12px">View session history \u2192</button>
        </div>

      </div>

    </div>

    <!-- Care Assistant panel -->
    <div id="ptd-asst-panel" class="ptd-asst-panel" style="display:none" role="dialog" aria-label="Care Assistant">
      <div class="ptd-asst-header">
        <span class="ptd-asst-title">Care Assistant</span>
        <button class="ptd-asst-close" onclick="window._ptdCloseAssistant()" aria-label="Close">\u2715</button>
      </div>
      <div class="ptd-asst-body">
        <div class="ptd-asst-intro">Ask me anything about your progress, your sessions, or what to do next.</div>
        <div class="ptd-asst-prompts">
          ${[
            { icon: '📈', q: 'Explain my progress' },
            { icon: '🔄', q: 'What changed since last session?' },
            { icon: '📅', q: 'What should I do before my next session?' },
            { icon: '📋', q: 'Explain my last report' },
            { icon: '💤', q: 'Summarise my check-ins this week' },
          ].map(p => `<button class="ptd-asst-prompt" onclick="window._ptdAskPrompt(${JSON.stringify(p.q)})">${p.icon} ${p.q}</button>`).join('')}
        </div>
        <div class="ptd-asst-input-row">
          <input id="ptd-asst-inp" class="ptd-asst-inp" type="text" placeholder="Type your question\u2026" onkeydown="if(event.key==='Enter'){window._ptdAskPrompt(this.value);}">
          <button class="ptd-asst-send" onclick="window._ptdAskPrompt(document.getElementById('ptd-asst-inp').value)">\u2192</button>
        </div>
        <div id="ptd-asst-resp" class="ptd-asst-resp" style="display:none"></div>
      </div>
    </div>
  `;

  // ── Care assistant handlers ───────────────────────────────────────────────────
  window._ptdOpenAssistant = function() {
    const p = document.getElementById('ptd-asst-panel');
    if (p) { p.style.display = 'flex'; requestAnimationFrame(() => p.classList.add('ptd-asst-panel--open')); }
  };
  window._ptdCloseAssistant = function() {
    const p = document.getElementById('ptd-asst-panel');
    if (p) { p.classList.remove('ptd-asst-panel--open'); setTimeout(() => { if (p) p.style.display = 'none'; }, 260); }
  };
  window._ptdAskPrompt = async function(question) {
    if (!question || !question.trim()) return;
    const inp = document.getElementById('ptd-asst-inp');
    const resp = document.getElementById('ptd-asst-resp');
    if (inp) inp.value = '';
    if (!resp) return;
    resp.style.display = 'block';
    resp.innerHTML = '<div class="ptd-asst-thinking">Thinking\u2026</div>';
    const q = question.trim().toLowerCase();
    let answer = '';
    if (q.includes('progress') || q.includes('improv')) {
      answer = outcomeTrend
        ? `Your ${outcomeTrend.name} has ${outcomeTrend.improving ? 'improved by ' + outcomeTrend.pct + '%' : 'stayed steady'} since baseline (${outcomeTrend.baseline} \u2192 ${outcomeTrend.current}). ${outcomeTrend.improving ? 'This is a positive response to treatment.' : 'Consistent attendance is helping build lasting results.'}`
        : `You\u2019re ${sessDelivered ? sessDelivered + ' sessions into your treatment course' : 'just getting started'}. Complete your first assessment to start tracking scores over time.`;
    } else if (q.includes('next session') || q.includes('before')) {
      answer = nextSessDateLabel
        ? `Your next session is ${nextSessDateLabel} at ${nextSessTime}. Before then: complete your daily check-in, drink plenty of water, and note any side effects or mood changes to share with your clinician.`
        : `You don\u2019t have a session scheduled yet. Contact your clinic to book your next appointment.`;
    } else if (q.includes('report') || q.includes('last report')) {
      const lr = sortedOutcomes[sortedOutcomes.length - 1];
      answer = lr
        ? `Your most recent assessment is ${esc(lr.template_name || lr.template_title || 'your last report')} from ${new Date(lr.administered_at || 0).toLocaleDateString(loc, { month: 'long', day: 'numeric' })}${lr.score_numeric != null ? ' with a score of ' + lr.score_numeric : ''}. This is one of the ways your care team tracks how treatment is working.`
        : `No assessments completed yet. Starting assessments helps your clinician track your progress precisely.`;
    } else if (q.includes('check') || q.includes('week') || q.includes('biometric')) {
      answer = hasCheckinData
        ? `In your recent check-ins: average mood ${Math.round(recentCheckins.reduce((s, c) => s + (c.mood || 5), 0) / recentCheckins.length)}/10, sleep ${Math.round(recentCheckins.reduce((s, c) => s + (c.sleep || 5), 0) / recentCheckins.length)}/10, energy ${Math.round(recentCheckins.reduce((s, c) => s + (c.energy || 5), 0) / recentCheckins.length)}/10.`
        : `No check-ins recorded yet. Start your daily check-in each morning to build a picture of how you\u2019re feeling over time.`;
    } else if (q.includes('changed') || q.includes('since')) {
      answer = `Since your last session your check-in data has been recorded${hasCheckinData ? ' and looks ' + wellnessTrend.label.toLowerCase() : '. Keep completing daily check-ins so your care team can monitor changes between sessions.'}.`;
    } else {
      answer = `I\u2019m here to help you understand your treatment journey. For medical questions, please contact your care team directly through the Messages tab.`;
    }
    resp.innerHTML = '<div class="ptd-asst-answer">' + answer + '</div>';
  };

  // ── Quick check-in from dashboard ────────────────────────────────────────────
  window._ptdSubmitCheckin = async function() {
    const moodEl = document.getElementById('ptd-dc-mood');
    const sleepEl = document.getElementById('ptd-dc-sleep');
    const energyEl = document.getElementById('ptd-dc-energy');
    if (!moodEl) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const payload = { mood: parseInt(moodEl.value, 10), sleep: parseInt(sleepEl.value, 10), energy: parseInt(energyEl.value, 10), side_effects: 'none', date: new Date().toISOString() };
    localStorage.setItem('ds_last_checkin', todayIso);
    localStorage.setItem('ds_checkin_' + todayIso, JSON.stringify(payload));
    try {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const lastDay = localStorage.getItem('ds_last_checkin_prev');
      const cur = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10);
      localStorage.setItem('ds_wellness_streak', String(lastDay === yesterday ? cur + 1 : 1));
      localStorage.setItem('ds_last_checkin_prev', todayIso);
    } catch (_e) {}
    try { const uid = user?.patient_id || user?.id; if (uid) await api.submitAssessment(uid, { type: 'wellness_checkin', ...payload }).catch(() => {}); } catch (_e) {}
    const mini = document.getElementById('ptd-checkin-mini');
    if (mini) mini.outerHTML = '<div class="ptd-checkin-done"><span style="color:var(--teal,#2dd4bf)">\u2713</span><span>Check-in saved. Your care team will see your update.</span></div>';
    if (typeof window._showNotifToast === 'function') window._showNotifToast({ title: 'Check-in saved', body: 'Good job \u2014 keep it up!', severity: 'success' });
  };

  // Keyboard nav for cards
  el.querySelectorAll('[role="button"]').forEach(card => {
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
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
      if (el) el.textContent = t('patient.sess.countdown.now');
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
    { id: 'first_session',  icon: '🌱', title: t('patient.milestone.first_session.title'),    desc: t('patient.milestone.first_session.desc'),    earned: count >= 1 },
    { id: 'week_one',       icon: '📅', title: t('patient.milestone.week_one.title'),          desc: t('patient.milestone.week_one.desc'),          earned: weekOneEarned },
    { id: 'five_sessions',  icon: '⭐', title: t('patient.milestone.five_sessions.title'),    desc: t('patient.milestone.five_sessions.desc'),    earned: count >= 5 },
    { id: 'ten_sessions',   icon: '🏆', title: t('patient.milestone.ten_sessions.title'),     desc: t('patient.milestone.ten_sessions.desc'),     earned: count >= 10 },
    { id: 'first_outcome',  icon: '📊', title: t('patient.milestone.progress_tracked.title'), desc: t('patient.milestone.progress_tracked.desc'), earned: outcomes.length >= 1 },
    { id: 'consistent',     icon: '🔥', title: t('patient.milestone.consistent.title'),       desc: t('patient.milestone.consistent.desc'),       earned: consistentEarned },
    { id: 'halfway',        icon: '🎯', title: t('patient.milestone.halfway.title'),          desc: t('patient.milestone.halfway.desc'),          earned: false },
    { id: 'wellness_streak',icon: '💚', title: t('patient.milestone.wellness_warrior.title'), desc: t('patient.milestone.wellness_warrior.desc'), earned: wellnessStreak },
  ];
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export async function pgPatientSessions() {
  setTopbar(t('patient.nav.sessions'));

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  let sessionsRaw, coursesRaw, outcomesRaw, assessmentsRaw;
  try {
    [sessionsRaw, coursesRaw, outcomesRaw, assessmentsRaw] = await Promise.all([
      api.patientPortalSessions().catch(() => null),
      api.patientPortalCourses().catch(() => null),
      api.patientPortalOutcomes().catch(() => null),
      api.patientPortalAssessments().catch(() => null),
    ]);
  } catch (_e) {
    el.innerHTML = `
      <div class="pt-portal-empty" style="margin-top:32px">
        <div class="pt-portal-empty-ico">⚠</div>
        <div class="pt-portal-empty-title">${t('patient.sess.err.title')}</div>
        <div class="pt-portal-empty-body">${t('patient.sess.err.body')}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:12px"
                onclick="window._navPatient('patient-sessions')">${t('patient.sess.err.retry')}</button>
      </div>`;
    return;
  }

  const sessions     = Array.isArray(sessionsRaw)     ? sessionsRaw     : [];
  const outcomes     = Array.isArray(outcomesRaw)     ? outcomesRaw     : [];
  const coursesArr   = Array.isArray(coursesRaw)      ? coursesRaw      : [];
  const assessments  = Array.isArray(assessmentsRaw)  ? assessmentsRaw  : [];

  // ── Seed demo data (used when backend returns empty) ─────────────────────────
  const _SEED = sessions.length === 0 && coursesArr.length === 0;
  const _feedbackItems = [];
  if (_SEED) {
    coursesArr.push({
      id: 'demo-crs-001', name: 'Left DLPFC TMS \u2014 Depression',
      condition_slug: 'depression-mdd', modality_slug: 'tms', status: 'active',
      phase: 'Active Treatment', total_sessions_planned: 6, session_count: 3,
      next_review_date: '2026-04-14', primary_clinician_name: 'Dr. S. Okonkwo',
    });
    sessions.push(
      { id:'dm-s4', session_number:4, scheduled_at:'2026-04-14T10:00:00', status:'scheduled', modality_slug:'tms', location:'Clinic', duration_minutes:45 },
      { id:'dm-s5', session_number:5, scheduled_at:'2026-04-16T10:00:00', status:'scheduled', modality_slug:'tms', location:'Clinic', duration_minutes:45 },
      { id:'dm-s6', session_number:6, scheduled_at:'2026-04-18T10:00:00', status:'scheduled', modality_slug:'tms', location:'Clinic', duration_minutes:45 },
      { id:'dm-s1', session_number:1, delivered_at:'2026-04-07T10:00:00', scheduled_at:'2026-04-07T10:00:00', status:'completed', modality_slug:'tms', location:'Clinic', duration_minutes:45, tolerance_rating:'mild',     post_session_notes:'Mild scalp tingling during stimulation \u2014 tolerated well.'  },
      { id:'dm-s2', session_number:2, delivered_at:'2026-04-09T10:00:00', scheduled_at:'2026-04-09T10:00:00', status:'completed', modality_slug:'tms', location:'Clinic', duration_minutes:45, tolerance_rating:'excellent', post_session_notes:'No side effects reported.'                               },
      { id:'dm-s3', session_number:3, delivered_at:'2026-04-11T10:00:00', scheduled_at:'2026-04-11T10:00:00', status:'completed', modality_slug:'tms', location:'Clinic', duration_minutes:45, tolerance_rating:'mild',     post_session_notes:'Mild headache after session \u2014 resolved same day.'      },
    );
    _feedbackItems.push(
      { date:'2026-04-11', text:"You\u2019re tolerating treatment well so far. We\u2019ll continue with the current plan.", clinician:'Dr. S. Okonkwo', session_number:3 },
      { date:'2026-04-09', text:'Mood check-in scores are moving in a positive direction.',                                  clinician:'Dr. S. Okonkwo', session_number:2 },
      { date:'2026-04-07', text:'Please continue breathing practice and sleep routine between visits.',                      clinician:'Care Team',        session_number:1 },
    );
  }

  const activeCourse = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  // ── Safe HTML escaper ────────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ── Status helpers ───────────────────────────────────────────────────────────
  function statusInfo(rawStatus) {
    const s = (rawStatus || '').toLowerCase().trim();
    switch (s) {
      case 'cancelled':             return { label: t('patient.sess.status.cancelled'),    pillClass: 'pt-pill-cancelled',   iconChar: '\u2715', iconClass: 'cancelled'    };
      case 'missed':
      case 'no-show':
      case 'no_show':               return { label: t('patient.sess.status.missed'),       pillClass: 'pt-pill-missed',      iconChar: '\u25a1', iconClass: 'missed'       };
      case 'rescheduled':           return { label: t('patient.sess.status.rescheduled'),  pillClass: 'pt-pill-rescheduled', iconChar: '\u21bb', iconClass: 'rescheduled'  };
      case 'interrupted':           return { label: t('patient.sess.status.interrupted'),  pillClass: 'pt-pill-interrupted', iconChar: '\u25d0', iconClass: 'interrupted'  };
      case 'completed':
      case 'done':                  return { label: t('patient.sess.status.completed'),    pillClass: 'pill-active',         iconChar: '\u2713', iconClass: 'done'         };
      default:                      return { label: t('patient.sess.status.done'),         pillClass: 'pill-active',         iconChar: '\u2713', iconClass: 'done'         };
    }
  }

  // ── Modality label ───────────────────────────────────────────────────────────
  function modalityLabel(slug) {
    if (!slug) return null;
    const key = slug.toLowerCase().replace(/[-_\s]/g, '');
    const MAP = {
      tms:'TMS', rtms:'rTMS', dtms:'Deep TMS', tdcs:'tDCS', tacs:'tACS', trns:'tRNS',
      neurofeedback:'Neurofeedback', nfb:'Neurofeedback', hegnfb:'HEG Neurofeedback',
      heg:'HEG Neurofeedback', lensnfb:'LENS Neurofeedback', lens:'LENS Neurofeedback',
      qeeg:'qEEG Assessment', pemf:'PEMF Therapy', biofeedback:'Biofeedback',
      hrvbiofeedback:'HRV Biofeedback', hrv:'HRV Biofeedback', hrvb:'HRV Biofeedback',
      pbm:'Photobiomodulation', nirs:'fNIRS Session', assessment:'Assessment',
    };
    if (MAP[key]) return MAP[key];
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // ── Tolerance → patient-friendly ─────────────────────────────────────────────
  function toleranceLabel(val) {
    if (val == null || val === '') return null;
    const v = String(val).toLowerCase().trim();
    if (!v) return null;
    if (['excellent', 'good', '1', '2'].includes(v))       return t('patient.sess.tol.well');
    if (['mild', 'moderate', '3', '4', '5'].includes(v))   return t('patient.sess.tol.mild');
    if (['poor', '6', '7'].includes(v))                     return t('patient.sess.tol.discomfort');
    if (['high', 'very high', '8', '9', '10'].includes(v)) return t('patient.sess.tol.significant');
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

  // ── Session classification ───────────────────────────────────────────────────
  const PAST_STATUSES = new Set([
    'completed', 'done', 'cancelled', 'missed', 'no-show', 'no_show',
    'interrupted', 'rescheduled',
  ]);
  const now = Date.now();

  const upcoming = sessions
    .filter(s => {
      if (!s.scheduled_at) return false;
      if (new Date(s.scheduled_at).getTime() <= now) return false;
      return !PAST_STATUSES.has((s.status || '').toLowerCase().trim());
    })
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  const pastSessions = sessions
    .filter(s => {
      if (s.delivered_at) return true;
      const st = (s.status || '').toLowerCase().trim();
      if (PAST_STATUSES.has(st)) return true;
      if (s.scheduled_at && new Date(s.scheduled_at).getTime() <= now) return true;
      return false;
    })
    .sort((a, b) => {
      const da = new Date(b.delivered_at || b.scheduled_at || b.created_at || 0).getTime();
      const db = new Date(a.delivered_at || a.scheduled_at || a.created_at || 0).getTime();
      return da - db;
    });

  // ── Collect feedback from real sessions (non-seed path) ──────────────────────
  if (!_SEED) {
    pastSessions.forEach(s => {
      const note = s.post_session_notes || s.clinician_notes || '';
      if (!note.trim()) return;
      _feedbackItems.push({
        date:           (s.delivered_at || s.scheduled_at || '').slice(0, 10),
        text:           note,
        clinician:      s.clinician_name || s.technician_name || 'Your care team',
        session_number: Number.isFinite(s.session_number) ? s.session_number : null,
      });
    });
  }

  // ── Stable session numbering ─────────────────────────────────────────────────
  const deliveredInOrder = sessions
    .filter(s => s.delivered_at || ['completed', 'done'].includes((s.status || '').toLowerCase().trim()))
    .sort((a, b) => new Date(a.delivered_at || 0) - new Date(b.delivered_at || 0));
  const deliveredNumMap = new Map();
  deliveredInOrder.forEach((s, i) => {
    deliveredNumMap.set(s, Number.isFinite(s.session_number) ? s.session_number : (i + 1));
  });
  function sessionNumFor(s) {
    if (deliveredNumMap.has(s)) return deliveredNumMap.get(s);
    return null;
  }

  // ── Outcomes by date ─────────────────────────────────────────────────────────
  const outcomesByDate = {};
  outcomes.forEach(o => {
    const d = (o.administered_at || '').slice(0, 10);
    if (!d) return;
    if (!outcomesByDate[d]) outcomesByDate[d] = [];
    outcomesByDate[d].push(o);
  });

  // ── Course metrics ───────────────────────────────────────────────────────────
  const totalPlanned   = activeCourse?.total_sessions_planned ?? null;
  const sessDelivered  = activeCourse?.session_count ?? deliveredInOrder.length;
  const sessRemaining  = (totalPlanned != null) ? Math.max(0, totalPlanned - sessDelivered) : null;
  const progressPct    = (totalPlanned && sessDelivered)
    ? Math.round((sessDelivered / totalPlanned) * 100) : null;

  const nextMilestoneDate  = activeCourse?.next_review_date || activeCourse?.milestone_date || null;
  const nextMilestoneLabel = nextMilestoneDate ? fmtDate(nextMilestoneDate) : 'Not yet scheduled';

  function phaseLabel(pct) {
    if (!pct)      return t('patient.phase.starting');
    if (pct <= 25) return t('patient.phase.initial');
    if (pct <= 50) return t('patient.phase.active');
    if (pct <= 75) return t('patient.phase.consolidation');
    if (pct < 100) return t('patient.phase.final');
    return t('patient.phase.complete');
  }

  // ── Prep content ─────────────────────────────────────────────────────────────
  function getDefaultPrepSteps() {
    return [
      { icon: '\ud83d\udebf', text: t('patient.sess.prep.wash') },
      { icon: '\ud83c\udf7d\ufe0f', text: t('patient.sess.prep.eat') },
      { icon: '\ud83d\udc8a', text: t('patient.sess.prep.meds') },
      { icon: '\ud83d\ude34', text: t('patient.sess.prep.sleep') },
      { icon: '\ud83d\udcdd', text: t('patient.sess.prep.note_symptoms') },
      { icon: '\ud83d\udcf5', text: t('patient.sess.prep.phone') },
    ];
  }
  function getDefaultBringList() {
    return [
      t('patient.sess.bring.meds'),
      t('patient.sess.bring.clothing'),
      t('patient.sess.bring.water'),
      t('patient.sess.bring.questions'),
      t('patient.sess.bring.snack'),
    ];
  }
  function getSessionPrep(s) {
    return {
      steps:          getDefaultPrepSteps(),
      bringList:      getDefaultBringList(),
      expectDuration: s.duration_minutes
        ? `${s.duration_minutes}\u00a0minutes`
        : 'approximately 20\u201345\u00a0minutes',
    };
  }

  // ── Countdown label ──────────────────────────────────────────────────────────
  function countdownLabel(daysAway) {
    if (daysAway === 0) return 'Today';
    if (daysAway === 1) return 'Tomorrow';
    return `In ${daysAway} days`;
  }

  // ── Assessment due banner ────────────────────────────────────────────────────
  function assessmentDueBannerHTML(nextSession) {
    if (!nextSession || !assessments.length) return '';
    const nextDate = new Date(nextSession.scheduled_at).getTime();
    const dueSoon  = assessments.filter(a => {
      if (!a.due_date) return false;
      const due = new Date(a.due_date).getTime();
      return due <= nextDate + 2 * 86400000 &&
             !['completed','done'].includes((a.status || '').toLowerCase().trim());
    });
    if (!dueSoon.length) return '';
    const names = dueSoon.slice(0, 2).map(a => esc(a.template_title || a.name || 'Assessment')).join(', ');
    const more  = dueSoon.length > 2 ? ` and ${dueSoon.length - 2} more` : '';
    return `
      <div class="pt-assess-due-banner">
        <div class="pt-adb-icon">\ud83d\udccc</div>
        <div class="pt-adb-content">
          <div class="pt-adb-title">Assessment due before your next session</div>
          <div class="pt-adb-body">${names}${more} — completing this helps your care team plan your treatment.</div>
        </div>
        <button class="btn btn-sm pt-adb-cta"
                onclick="window._navPatient('patient-assessments')">Complete now</button>
      </div>`;
  }

  // ── Next session hero card ───────────────────────────────────────────────────
  function nextSessionHeroHTML(s) {
    const sessionNum   = Number.isFinite(s.session_number)
      ? s.session_number : (sessDelivered + 1);
    const _loc         = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
    const dayStr       = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString(_loc, { weekday: 'long' }) : '';
    const dateStr      = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString(_loc, { month: 'long', day: 'numeric', year: 'numeric' }) : '\u2014';
    const timeStr      = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleTimeString(_loc, { hour: 'numeric', minute: '2-digit' }) : '';
    const daysAway     = s.scheduled_at
      ? Math.max(0, Math.ceil((new Date(s.scheduled_at).getTime() - now) / 86400000)) : null;
    const isToday      = daysAway === 0;
    const isTomorrow   = daysAway === 1;

    const mod          = modalityLabel(s.modality_slug || s.condition_slug);
    const location     = esc(s.location || s.site_name || '');
    const isRemote     = /remote|telehealth|video|virtual/i.test(s.location || s.site_name || '');
    const locationIcon = isRemote ? '\ud83d\udcbb' : '\ud83c\udfe5';
    const locationLabel = location || 'Your clinic';
    const clinician    = esc(s.clinician_name || s.technician_name || '');
    const duration     = s.duration_minutes ? `${s.duration_minutes} min` : null;
    const clinicNotes  = esc(s.clinic_notes || s.instructions || '');

    return `
      <div class="pt-ns-hero ${isToday ? 'today' : isTomorrow ? 'soon' : ''}">
        <div class="pt-ns-eyebrow">Your Next Session</div>

        <div class="pt-ns-main">
          <div class="pt-ns-date-block">
            <div class="pt-ns-day">${esc(dayStr)}</div>
            <div class="pt-ns-date">${esc(dateStr)}</div>
            ${timeStr ? `<div class="pt-ns-time">\ud83d\udd50\u00a0${esc(timeStr)}</div>` : ''}
          </div>
          <div class="pt-ns-meta-block">
            ${daysAway !== null ? `<div class="pt-ns-countdown ${isToday ? 'today' : isTomorrow ? 'soon' : ''}">${countdownLabel(daysAway)}</div>` : ''}
            <div class="pt-ns-meta-row">
              <span class="pt-ns-meta-item">${locationIcon}\u00a0${locationLabel}</span>
            </div>
            ${clinician ? `<div class="pt-ns-meta-row"><span class="pt-ns-meta-item">\ud83d\udc64\u00a0${clinician}</span></div>` : ''}
            <div class="pt-ns-chips">
              ${mod      ? `<span class="pt-ns-chip">${esc(mod)}</span>` : ''}
              ${duration ? `<span class="pt-ns-chip">\u23f1\u00a0${esc(duration)}</span>` : ''}
              <span class="pt-ns-chip pt-ns-chip-session">Session ${sessionNum}</span>
            </div>
          </div>
        </div>

        ${clinicNotes ? `
        <div class="pt-uc-clinic-note">
          <span class="pt-uc-clinic-note-label">${t('patient.sess.clinic_note')}</span>
          ${clinicNotes}
        </div>` : ''}

        <div class="pt-ns-actions">
          <button class="btn btn-primary btn-sm"
                  onclick="document.getElementById('pt-wte-section')?.scrollIntoView({behavior:'smooth',block:'start'})">
            View Preparation Guide
          </button>
          <button class="btn btn-ghost btn-sm"
                  onclick="window._navPatient('patient-messages')">
            Contact Clinic
          </button>
          <button class="btn btn-ghost btn-sm"
                  onclick="window._ptRequestReschedule(0)">
            Request Reschedule
          </button>
        </div>
      </div>`;
  }

  // ── What to Expect — standalone section ──────────────────────────────────────
  function whatToExpectHTML(s) {
    const prep = getSessionPrep(s);
    const mod  = modalityLabel(s.modality_slug || s.condition_slug);

    const duringLine = mod
      ? `You'll be guided through a ${esc(mod)} session by your clinician or technician.`
      : "You'll be guided through your session by your clinician or technician.";

    const hasAssessmentDue = assessments.some(a => {
      if (!a.due_date) return false;
      const due   = new Date(a.due_date).getTime();
      const sessT = new Date(s.scheduled_at).getTime();
      return due <= sessT + 2 * 86400000 &&
             !['completed','done'].includes((a.status || '').toLowerCase().trim());
    });

    return `
      <div class="pt-wte-section" id="pt-wte-section">
        <div class="pt-sess-section-hd" style="margin-bottom:16px">
          <span class="pt-sess-section-title">Before Your Next Session</span>
        </div>

        <div class="pt-wte-grid">
          <div class="pt-wte-col">
            <div class="pt-wte-col-label">Before your session</div>
            <ul class="pt-prep-list">
              ${prep.steps.map(item => `
                <li class="pt-prep-item">
                  <span class="pt-prep-ico">${item.icon}</span>
                  <span>${item.text}</span>
                </li>`).join('')}
            </ul>
          </div>

          <div class="pt-wte-col">
            <div class="pt-wte-col-label">What to bring</div>
            <ul class="pt-prep-list">
              ${prep.bringList.map(item => `
                <li class="pt-prep-item">
                  <span class="pt-prep-ico" style="font-size:10px;opacity:.45">\u25cf</span>
                  <span>${item}</span>
                </li>`).join('')}
            </ul>
          </div>

          <div class="pt-wte-col">
            <div class="pt-wte-col-label">During your session</div>
            <div class="pt-wte-during-box">
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">
                ${duringLine}
                Your session will last ${esc(prep.expectDuration)}.
                Let your clinician know at any time if you feel uncomfortable — it's always safe to pause or adjust.
              </div>
            </div>
          </div>

          <div class="pt-wte-col">
            <div class="pt-wte-col-label">After your session</div>
            <div class="pt-wte-after-box">
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.7">
                Most patients can return to normal activities immediately.
                Note any side effects or mood changes in your daily check-in — your care team reviews these.
                If you feel any unexpected symptoms, contact your clinic.
              </div>
            </div>
          </div>
        </div>

        ${hasAssessmentDue ? `
        <div class="pt-wte-assess-callout">
          \ud83d\udccc\u00a0<strong>Reminder:</strong> You have an assessment due before this session.
          <button class="btn btn-ghost btn-sm" style="margin-left:12px"
                  onclick="window._navPatient('patient-assessments')">Complete assessment</button>
        </div>` : ''}

        <div class="pt-uc-prep-footer" style="margin-top:16px">
          <div class="pt-uc-reschedule-note">${t('patient.sess.cancel_note')}</div>
          <button class="btn btn-ghost btn-sm"
                  onclick="window._navPatient('patient-messages')">
            ${t('patient.sess.msg_clinic')}
          </button>
        </div>
      </div>`;
  }

  // ── Compact upcoming card (sessions beyond the first) ────────────────────────
  function upcomingCompactCardHTML(s, listIdx) {
    const sessionNum = Number.isFinite(s.session_number)
      ? s.session_number : (sessDelivered + listIdx + 2);
    const _loc       = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
    const dateShort  = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleDateString(_loc, { weekday: 'short', month: 'short', day: 'numeric' })
      : '\u2014';
    const timeStr    = s.scheduled_at
      ? new Date(s.scheduled_at).toLocaleTimeString(_loc, { hour: 'numeric', minute: '2-digit' })
      : '';
    const daysAway   = s.scheduled_at
      ? Math.max(0, Math.ceil((new Date(s.scheduled_at).getTime() - now) / 86400000))
      : null;
    const mod        = modalityLabel(s.modality_slug || s.condition_slug);

    return `
      <div class="pt-uc-compact">
        <div class="pt-uc-c-left">
          <div class="pt-uc-c-session">Session ${sessionNum}</div>
          <div class="pt-uc-c-date">${esc(dateShort)}${timeStr ? `\u00a0\u00b7\u00a0${esc(timeStr)}` : ''}</div>
          ${mod ? `<div class="pt-uc-c-mod">${esc(mod)}</div>` : ''}
        </div>
        <div class="pt-uc-c-right">
          ${daysAway !== null ? `<span class="pt-uc-c-days">${countdownLabel(daysAway)}</span>` : ''}
          <span class="pill pill-pending" style="font-size:10px">${t('patient.sess.scheduled')}</span>
        </div>
      </div>`;
  }

  // ── Past / completed session row ─────────────────────────────────────────────
  function pastSessionRowHTML(s, rowIdx) {
    const num            = sessionNumFor(s);
    const status         = statusInfo(s.status);
    const rawSt          = (s.status || '').toLowerCase().trim();
    const isNonDelivered = ['cancelled','missed','no-show','no_show','rescheduled','interrupted'].includes(rawSt);

    const displayDate  = fmtDate(s.delivered_at || s.scheduled_at);
    const dur          = s.duration_minutes ? `${s.duration_minutes} min` : '';
    const mod          = modalityLabel(s.modality_slug || s.condition_slug);
    const tol          = toleranceLabel(s.tolerance_rating);
    const notes        = s.post_session_notes || s.clinician_notes || null;
    const relDate      = (s.delivered_at || s.scheduled_at || '').slice(0, 10);
    const relDocs      = outcomesByDate[relDate] || [];
    const escapedNotes = esc(notes);
    const rowTitle     = num != null ? t('patient.sess.session_n', { n: num }) : status.label;

    const detailItems = isNonDelivered ? [] : [
      tol           ? { label: t('patient.sess.row.how_went'),  val: esc(tol) }                              : null,
      mod           ? { label: t('patient.sess.row.type'),      val: esc(mod) }                              : null,
      dur           ? { label: t('patient.sess.row.duration'),  val: esc(dur) }                              : null,
      s.device_slug ? { label: t('patient.sess.row.equipment'), val: esc(String(s.device_slug).toUpperCase()) } : null,
    ].filter(Boolean);

    // Inline score chips from linked outcomes
    const scoreChips = relDocs
      .filter(o => o.total_score != null || o.score != null)
      .map(o => {
        const score = o.total_score ?? o.score;
        return `<span class="pt-cr-score-chip">${esc(o.template_title || 'Score')}: <strong>${esc(String(score))}</strong></span>`;
      }).join('');

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
              ${tol && !isNonDelivered ? `\u00a0\u00b7\u00a0<span class="pt-cr-tol-inline">${esc(tol)}</span>` : ''}
            </div>
          </div>
          <div class="pt-cr-badges">
            <span class="${status.pillClass} pt-status-pill">${status.label}</span>
            ${relDocs.length > 0 ? `<span class="pt-report-badge">${t('patient.sess.row.report')}</span>` : ''}
            <span id="pt-cr-chev-${rowIdx}" class="pt-cr-chevron" aria-hidden="true">\u25be</span>
          </div>
        </div>

        <div id="pt-cr-detail-${rowIdx}" class="pt-cr-detail" style="display:none">
          ${isNonDelivered ? `
            <div class="pt-cr-nondel-notice ${rawSt}">
              ${(() => {
                if (rawSt === 'cancelled')                              return t('patient.sess.nondel.cancelled');
                if (['missed','no-show','no_show'].includes(rawSt))    return t('patient.sess.nondel.missed');
                if (rawSt === 'rescheduled')                           return t('patient.sess.nondel.rescheduled');
                if (rawSt === 'interrupted')                           return t('patient.sess.nondel.interrupted');
                return t('patient.sess.nondel.default');
              })()}
            </div>` : ''}

          ${detailItems.length > 0 ? `
            <div class="pt-cr-detail-grid">
              ${detailItems.map(r => `
                <div class="pt-cdr-row">
                  <span class="pt-cdr-label">${r.label}</span>
                  <span class="pt-cdr-value">${r.val}</span>
                </div>`).join('')}
            </div>` : ''}

          ${scoreChips ? `<div class="pt-cr-score-row">${scoreChips}</div>` : ''}

          ${escapedNotes ? `
            <div class="pt-cr-notes">
              <div class="pt-cr-notes-label">${t('patient.sess.row.notes')}</div>
              <div class="pt-cr-notes-body">${escapedNotes}</div>
            </div>` : ''}

          ${relDocs.length > 0 ? relDocs.map(doc => `
            <div class="pt-cr-report-link"
                 onclick="event.stopPropagation();window._navPatient('patient-reports')"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.stopPropagation();window._navPatient('patient-reports');event.preventDefault();}"
                 role="button" tabindex="0">
              <span style="color:var(--blue);font-size:14px">\u25f1</span>
              <span class="pt-cr-report-title">${esc(doc.template_title || 'Assessment Report')}</span>
              <span class="pt-cr-report-action">${t('patient.sess.row.view_doc')}</span>
            </div>`).join('') : ''}

          ${!detailItems.length && !escapedNotes && !relDocs.length && !isNonDelivered
            ? `<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0">${t('patient.sess.row.no_details')}</div>`
            : ''}
        </div>
      </div>`;
  }

  // ── Related documents & feedback ─────────────────────────────────────────────
  function relatedDocsFeedbackHTML() {
    const items = [];
    pastSessions.forEach(s => {
      const relDate = (s.delivered_at || s.scheduled_at || '').slice(0, 10);
      const docs    = outcomesByDate[relDate] || [];
      docs.forEach(doc => items.push({ type: 'report', date: relDate, doc }));
      if (s.post_session_notes || s.clinician_notes) {
        items.push({ type: 'note', date: relDate, session: s });
      }
      if (s.clinic_notes && /task|homework|exercise|practice/i.test(s.clinic_notes)) {
        items.push({ type: 'homework', date: relDate, session: s });
      }
    });

    if (!items.length) {
      return `
        <div class="pt-sess-section">
          <div class="pt-sess-section-hd">
            <span class="pt-sess-section-title">Reports &amp; Feedback</span>
          </div>
          <div class="pt-rdf-empty">
            <div class="pt-rdf-empty-ico">\ud83d\udcc4</div>
            <div class="pt-rdf-empty-title">Reports will appear here</div>
            <div class="pt-rdf-empty-body">Assessment reports and clinical documents linked to your sessions will show up here after they are completed.</div>
          </div>
        </div>`;
    }

    const reports  = items.filter(i => i.type === 'report');

    function reportCardHTML(item) {
      const doc   = item.doc;
      const score = doc.total_score ?? doc.score;
      return `
        <div class="pt-rdf-card" role="button" tabindex="0"
             onclick="window._navPatient('patient-reports')"
             onkeydown="if(event.key==='Enter'||event.key===' '){window._navPatient('patient-reports');}">
          <div class="pt-rdf-card-ico">\ud83d\udcca</div>
          <div class="pt-rdf-card-body">
            <div class="pt-rdf-card-title">${esc(doc.template_title || 'Assessment')}</div>
            <div class="pt-rdf-card-meta">${esc(fmtDate(item.date))}${score != null ? `\u00a0\u00b7\u00a0Score:\u00a0${esc(String(score))}` : ''}</div>
          </div>
          <span class="pt-rdf-card-arrow">\u203a</span>
        </div>`;
    }

    return reports.length === 0 ? '' : `
      <div class="pt-sess-section">
        <div class="pt-sess-section-hd">
          <span class="pt-sess-section-title">Session Reports</span>
          <span class="pt-sess-badge">${reports.length}</span>
        </div>
        <div class="pt-rdf-wrap">
          ${reports.map(reportCardHTML).join('')}
        </div>
      </div>`;
  }

  // ── Feedback from recent sessions ─────────────────────────────────────────────
  function feedbackFromSessionsHTML() {
    if (!_feedbackItems.length) {
      return `
        <div class="pt-sess-section">
          <div class="pt-sess-section-hd">
            <span class="pt-sess-section-title">Feedback From Recent Sessions</span>
          </div>
          <div class="pt-rdf-empty">
            <div class="pt-rdf-empty-ico">\ud83d\udcac</div>
            <div class="pt-rdf-empty-title">No feedback yet</div>
            <div class="pt-rdf-empty-body">After each completed session your care team may leave notes or feedback here. They appear after your appointments.</div>
          </div>
        </div>`;
    }
    return `
      <div class="pt-sess-section">
        <div class="pt-sess-section-hd">
          <span class="pt-sess-section-title">Feedback From Recent Sessions</span>
          <span class="pt-sess-badge">${_feedbackItems.length}</span>
        </div>
        <div class="pt-feedback-list">
          ${_feedbackItems.map(fb => `
            <div class="pt-feedback-card">
              <div class="pt-feedback-icon">\ud83d\udcac</div>
              <div class="pt-feedback-body">
                <div class="pt-feedback-text">${esc(fb.text)}</div>
                <div class="pt-feedback-meta">
                  ${fb.clinician ? `${esc(fb.clinician)}\u00a0\u00b7\u00a0` : ''}${fb.session_number != null ? `Session\u00a0${fb.session_number}\u00a0\u00b7\u00a0` : ''}${esc(fmtDate(fb.date))}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ── Aftercare / What to Watch ─────────────────────────────────────────────────
  function aftercareHTML() {
    const mod = modalityLabel(activeCourse?.modality_slug || '');
    const modLine = mod ? `After a ${esc(mod)} session` : 'After your session';
    return `
      <div class="pt-sess-section pt-aftercare-section">
        <div class="pt-sess-section-hd">
          <span class="pt-sess-section-title">Aftercare &amp; What to Watch</span>
        </div>
        <div class="pt-aftercare-grid">

          <div class="pt-aftercare-col">
            <div class="pt-aftercare-col-label">\u2713\u00a0What is normal</div>
            <ul class="pt-prep-list">
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-ok">\u2713</span><span>${modLine}, mild fatigue or scalp sensitivity is common and usually passes within an hour.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-ok">\u2713</span><span>A mild headache right after stimulation is not unusual and typically resolves the same day.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-ok">\u2713</span><span>Mood can fluctuate in early sessions. Changes tend to stabilise as the course continues.</span></li>
            </ul>
          </div>

          <div class="pt-aftercare-col">
            <div class="pt-aftercare-col-label">! Contact your clinic if</div>
            <ul class="pt-prep-list">
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-warn">!</span><span>A headache lasts more than 24 hours or feels unusually severe.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-warn">!</span><span>You experience sudden or significant mood changes that feel out of character.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico pt-ac-warn">!</span><span>Any symptom that concerns you \u2014 there is no threshold too small to mention.</span></li>
            </ul>
          </div>

          <div class="pt-aftercare-col">
            <div class="pt-aftercare-col-label">\u25ce\u00a0Keep doing between sessions</div>
            <ul class="pt-prep-list">
              <li class="pt-prep-item"><span class="pt-prep-ico">\u25ce</span><span>Your daily check-in \u2014 mood, sleep, and energy logs help your care team track your response.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico">\u25ce</span><span>Breathing, mindfulness, or sleep practices your clinician has recommended.</span></li>
              <li class="pt-prep-item"><span class="pt-prep-ico">\u25ce</span><span>Regular meals and good hydration, especially on session days.</span></li>
            </ul>
          </div>

        </div>
        <div class="pt-aftercare-emergency">
          If you are in crisis or need urgent support, contact your clinic or reach a crisis line immediately.
          <button class="btn btn-ghost btn-sm" style="margin-left:12px;flex-shrink:0"
                  onclick="window._navPatient('patient-messages')">Message Clinic</button>
        </div>
      </div>`;
  }

  // ── Page HTML ────────────────────────────────────────────────────────────────
  const nextSession = upcoming[0] || null;
  const _phaseDisplay = esc(activeCourse?.phase || phaseLabel(progressPct));
  const _reviewLabel  = nextMilestoneDate
    ? `After Session\u00a04\u00a0\u00b7\u00a0${esc(fmtDate(nextMilestoneDate))}`
    : 'Not yet scheduled';

  el.innerHTML = `

    <!-- ── Course context bar ── -->
    ${activeCourse ? `
    <div class="pt-course-ctx-bar">
      <div class="pt-ctx-main-row">
        <div class="pt-ctx-item pt-ctx-item--name">
          <div class="pt-ctx-label">Treatment course</div>
          <div class="pt-ctx-value pt-ctx-value--name">${esc(activeCourse.name || activeCourse.condition_slug || 'Active Treatment')}</div>
        </div>
        <div class="pt-ctx-divider"></div>
        <div class="pt-ctx-item">
          <div class="pt-ctx-label">Phase</div>
          <div class="pt-ctx-value">${_phaseDisplay}</div>
        </div>
        <div class="pt-ctx-divider"></div>
        <div class="pt-ctx-item">
          <div class="pt-ctx-label">Sessions</div>
          <div class="pt-ctx-value">${sessDelivered}\u00a0of\u00a0${totalPlanned ?? '?'} completed${sessRemaining !== null ? `\u00a0\u00b7\u00a0${sessRemaining} left` : ''}</div>
        </div>
        <div class="pt-ctx-divider"></div>
        <div class="pt-ctx-item">
          <div class="pt-ctx-label">Next milestone review</div>
          <div class="pt-ctx-value pt-ctx-value-dim">${_reviewLabel}</div>
        </div>
        <div class="pt-ctx-link-wrap">
          <button class="pt-ctx-plan-link"
                  onclick="window._navPatient('patient-course')">View full treatment plan \u203a</button>
        </div>
      </div>
      ${progressPct !== null ? `
      <div class="pt-ctx-bar-wrap">
        <div class="pt-ctx-bar-fill" style="width:${progressPct}%"></div>
      </div>` : ''}
    </div>` : ''}

    <!-- Assessment due banner -->
    ${assessmentDueBannerHTML(nextSession)}

    <!-- ── Section 1: Next Session ── -->
    ${nextSession
      ? nextSessionHeroHTML(nextSession)
      : `<div class="pt-ns-empty">
           <div class="pt-ns-empty-ico">\ud83d\udcc5</div>
           <div class="pt-ns-empty-title">No upcoming sessions scheduled</div>
           <div class="pt-ns-empty-body">
             ${activeCourse
               ? "Your next session hasn\u2019t been booked yet. Your care team will be in touch to confirm your schedule."
               : "You don\u2019t have any active treatment sessions scheduled. Contact your clinic to get started."}
           </div>
           <button class="btn btn-ghost btn-sm" style="margin-top:14px"
                   onclick="window._navPatient('patient-messages')">Contact Clinic</button>
         </div>`}

    <!-- ── Section 2: Upcoming Sessions ── -->
    ${upcoming.length > 1 ? `
    <div class="pt-sess-section">
      <div class="pt-sess-section-hd">
        <span class="pt-sess-section-title">Upcoming Sessions</span>
        <span class="pt-sess-badge">${upcoming.length - 1}</span>
      </div>
      <div class="pt-uc-compact-list card" style="padding:0;overflow:hidden">
        ${upcoming.slice(1).map((s, i) => upcomingCompactCardHTML(s, i)).join('')}
      </div>
    </div>` : ''}

    <!-- ── Section 3: Session History ── -->
    <div class="pt-sess-section">
      <div class="pt-sess-section-hd">
        <span class="pt-sess-section-title">${t('patient.sess.history')}</span>
        ${pastSessions.length > 0 ? `<span class="pt-sess-badge">${pastSessions.length}</span>` : ''}
      </div>
      ${pastSessions.length === 0
        ? `<div class="pt-sess-empty" style="padding:28px 20px">
            <div class="pt-sess-empty-icon">\ud83d\udcc5</div>
            <div class="pt-sess-empty-title">${t('patient.sess.no_history.title')}</div>
            <div class="pt-sess-empty-body">${t('patient.sess.no_history.body')}</div>
          </div>`
        : `<div class="card" style="overflow:hidden;padding:0">
            ${pastSessions.map((s, i) => pastSessionRowHTML(s, i)).join('')}
          </div>`}
    </div>

    <!-- ── Section 4: Feedback From Recent Sessions ── -->
    ${feedbackFromSessionsHTML()}

    <!-- ── Section 5: Before Your Next Session ── -->
    ${nextSession ? whatToExpectHTML(nextSession) : ''}

    <!-- ── Section 6: Aftercare / What to Watch ── -->
    ${aftercareHTML()}

    <!-- Session reports (if any linked assessments) -->
    ${relatedDocsFeedbackHTML()}
  `;

  // ── Past session accordion ────────────────────────────────────────────────────
  window._ptToggleCompleted = function(rowIdx) {
    const detail = document.getElementById(`pt-cr-detail-${rowIdx}`);
    const chev   = document.getElementById(`pt-cr-chev-${rowIdx}`);
    const row    = document.getElementById(`pt-cr-row-${rowIdx}`);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    el.querySelectorAll('.pt-cr-detail').forEach(d => { d.style.display = 'none'; });
    el.querySelectorAll('.pt-cr-chevron').forEach(c => { c.style.transform = ''; });
    el.querySelectorAll('.pt-completed-row[aria-expanded="true"]').forEach(r => {
      r.setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      detail.style.display = '';
      if (chev) chev.style.transform = 'rotate(180deg)';
      if (row)  row.setAttribute('aria-expanded', 'true');
    }
  };

  // ── Reschedule ────────────────────────────────────────────────────────────────
  window._ptRequestReschedule = function(_idx) {
    window._navPatient('patient-messages');
  };
}


export async function pgPatientCourse() {
  setTopbar('Treatment Plan');
  const user = currentUser;
  const uid  = user?.patient_id || user?.id;

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // ── Helpers ──────────────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
  }
  function conditionLabel(slug) {
    if (!slug) return null;
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  const _MODALITY_MAP = {
    tms:'TMS', rtms:'rTMS', dtms:'Deep TMS', tdcs:'tDCS', tacs:'tACS', trns:'tRNS',
    neurofeedback:'Neurofeedback', nfb:'Neurofeedback', heg:'HEG Neurofeedback',
    lens:'LENS Neurofeedback', lensnfb:'LENS Neurofeedback',
  };
  function modalityLabel(slug) {
    if (!slug) return null;
    const key = slug.toLowerCase().replace(/[-_\s]/g, '');
    return _MODALITY_MAP[key] || slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  function courseStatusLabel(status) {
    const s = (status || '').toLowerCase().trim();
    if (['active','in_progress','in-progress','ongoing'].includes(s)) return 'In progress';
    if (['completed','done','finished'].includes(s))                    return 'Completed';
    if (['paused','on_hold','on-hold'].includes(s))                     return 'On hold';
    if (['pending','scheduled','starting'].includes(s))                 return 'Starting soon';
    return 'Active';
  }

  // ── Modality rationale lookup ─────────────────────────────────────────────
  const _WHY_MAP = {
    tms:           { headline: 'Why TMS?', body: 'TMS uses focused magnetic pulses to gently stimulate the areas of your brain involved in mood and energy regulation. It is non-invasive, well-tolerated, and FDA-cleared for depression.' },
    rtms:          { headline: 'Why rTMS?', body: 'Repetitive TMS delivers precise pulse sequences shown in clinical trials to reduce depressive symptoms and improve quality of life, particularly when medication has not been fully effective.' },
    dtms:          { headline: 'Why Deep TMS?', body: 'Deep TMS uses an H-coil to reach brain regions slightly deeper than standard TMS, making it effective for both depression and OCD.' },
    tdcs:          { headline: 'Why tDCS?', body: 'Transcranial direct current stimulation delivers a very low electrical current to modulate cortical excitability. It is painless and can be paired with cognitive training.' },
    tacs:          { headline: 'Why tACS?', body: 'Transcranial alternating current stimulation entrains brain oscillations at specific frequencies to support memory, sleep, and attention.' },
    trns:          { headline: 'Why tRNS?', body: 'Transcranial random noise stimulation uses broadband noise currents to boost cortical excitability, which can improve cognition and reduce tinnitus.' },
    neurofeedback: { headline: 'Why Neurofeedback?', body: 'Neurofeedback trains your brain in real time by rewarding healthy brainwave patterns. Over sessions, the brain learns to self-regulate, reducing symptoms without medication.' },
    nfb:           { headline: 'Why Neurofeedback?', body: 'Neurofeedback trains your brain in real time by rewarding healthy brainwave patterns. Over sessions, the brain learns to self-regulate.' },
    heg:           { headline: 'Why HEG Neurofeedback?', body: 'Hemoencephalography neurofeedback trains prefrontal blood flow, which is often reduced in ADHD and executive dysfunction.' },
    lens:          { headline: 'Why LENS Neurofeedback?', body: 'Low Energy Neurofeedback System delivers ultra-low electromagnetic stimulation to disrupt stuck brainwave patterns, often producing results in fewer sessions than standard NFB.' },
  };

  // ── Condition-specific goals ──────────────────────────────────────────────
  const _GOALS_MAP = {
    'major-depressive-disorder': ['Reduce low mood and persistent sadness', 'Improve energy and motivation', 'Restore sleep quality', 'Return to activities you enjoy'],
    'depression':                ['Reduce low mood and persistent sadness', 'Improve energy and motivation', 'Restore sleep quality'],
    'anxiety':                   ['Lower day-to-day anxiety and worry', 'Reduce physical tension and restlessness', 'Improve sleep onset', 'Increase confidence in daily situations'],
    'ocd':                       ['Reduce frequency and intensity of obsessive thoughts', 'Decrease compulsive behaviours', 'Improve tolerance of uncertainty'],
    'ptsd':                      ['Reduce intrusive memories and hypervigilance', 'Improve emotional regulation', 'Restore sense of safety'],
    'adhd':                      ['Improve attention and concentration', 'Reduce impulsivity', 'Support working memory and executive function'],
    'tinnitus':                  ['Reduce perceived loudness of tinnitus', 'Improve habituation and distress tolerance', 'Restore sleep quality'],
    'chronic-pain':              ['Reduce pain intensity ratings', 'Improve daily functioning and mobility', 'Reduce reliance on pain medication'],
  };

  // ── Data loading ─────────────────────────────────────────────────────────
  const [coursesRaw, sessionsRaw, outcomesRaw] = await Promise.all([
    api.patientPortalCourses().catch(() => null),
    api.patientPortalSessions().catch(() => null),
    api.patientOutcomes?.().catch(() => null),
  ]);

  const coursesArr  = Array.isArray(coursesRaw)  ? coursesRaw  : [];
  const sessionsArr = Array.isArray(sessionsRaw)  ? sessionsRaw : [];
  const course      = coursesArr.find(c => c.status === 'active') || coursesArr[0] || null;

  if (!course) {
    el.innerHTML = `
      <div class="pt-portal-empty">
        <div class="pt-portal-empty-ico" aria-hidden="true">&#9678;</div>
        <div class="pt-portal-empty-title">No treatment plan yet</div>
        <div class="pt-portal-empty-body">Your clinician will create a personalised plan once your initial assessment is complete.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px"
                onclick="window._navPatient('patient-messages')">Message your care team</button>
      </div>`;
    return;
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const delivered  = course.session_count ?? 0;
  const total      = course.total_sessions_planned ?? 20;
  const remaining  = Math.max(total - delivered, 0);
  const pct        = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const startedStr = fmtDate(course.started_at || course.created_at);
  const condition  = conditionLabel(course.condition_slug);
  const modality   = modalityLabel(course.modality_slug);
  const mSlug      = (course.modality_slug || '').toLowerCase().replace(/[-_\s]/g,'');
  const cSlug      = (course.condition_slug || '');
  const statusLbl  = courseStatusLabel(course.status);
  const whyInfo    = _WHY_MAP[mSlug] || null;
  const goals      = _GOALS_MAP[cSlug] || _GOALS_MAP[cSlug.replace(/_/g,'-')] || [
    'Reduce primary symptoms', 'Improve daily functioning', 'Support overall wellbeing',
  ];

  // ── Outcome trend ─────────────────────────────────────────────────────────
  let outcomePct = null;
  let outcomeLabel = '';
  const outcomes = Array.isArray(outcomesRaw) ? outcomesRaw : [];
  const phq = outcomes.filter(o => (o.scale || '').toLowerCase().includes('phq'));
  if (phq.length >= 2) {
    const first = phq[0].total_score ?? phq[0].score;
    const last  = phq[phq.length - 1].total_score ?? phq[phq.length - 1].score;
    if (first > 0) { outcomePct = Math.round(((first - last) / first) * 100); }
    outcomeLabel = `PHQ-9: ${first} → ${last}`;
  }
  // Demo seed
  if (outcomePct === null && (course._isDemoData || !outcomes.length)) {
    outcomePct   = 44;
    outcomeLabel = 'PHQ-9: 18 → 10';
  }

  // ── Clinician feedback ────────────────────────────────────────────────────
  let feedback = null;
  try { feedback = JSON.parse(localStorage.getItem('ds_clinician_feedback') || 'null'); } catch (_e) {}
  if (!feedback) {
    feedback = {
      _isDemoData: true,
      reviewer: 'Dr. Sarah Mitchell',
      date: new Date(Date.now() - 2 * 86400000).toISOString(),
      note: 'Great response to sessions 8–10. Mood scores improving steadily. Maintaining current protocol parameters — no changes needed. Keep up the sleep hygiene work.',
    };
  }

  // ── Safety / tolerance data ───────────────────────────────────────────────
  let safetyItems = [];
  try { safetyItems = JSON.parse(localStorage.getItem('ds_safety_' + uid) || '[]'); } catch (_e) {}
  const _SIDE_EFFECTS = ['Mild headache', 'Scalp tingling', 'Fatigue after sessions', 'Jaw tension'];
  const reportedEffects = safetyItems.length
    ? safetyItems
    : [{ effect: 'Mild headache', sessions: 'Sessions 1–3', resolved: true }];

  // ── Wearable / biometric snapshot ────────────────────────────────────────
  let wearable = null;
  try { wearable = JSON.parse(localStorage.getItem('ds_wearable_summary') || 'null'); } catch (_e) {}
  if (!wearable) {
    wearable = { _isDemoData: true, hrv: '42 ms', sleep: '7h 12m', steps: '6,840', stress: 'Moderate' };
  }

  // ── Homework tasks ────────────────────────────────────────────────────────
  const hwKey = 'ds_homework_tasks_' + (uid || 'default');
  const HW_DEFAULTS = [
    { id: 'hw1', title: 'Daily mindfulness (10 min)', description: 'Morning preferred — use the timer in Sessions', freq: 'Daily', done: false },
    { id: 'hw2', title: 'Sleep hygiene checklist',    description: 'No screens 1 hr before bed; consistent wake time', freq: 'Daily', done: false },
    { id: 'hw3', title: 'Symptom diary',              description: 'Rate mood (0–10) and energy each evening', freq: 'Daily', done: false },
  ];
  function loadHW() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(hwKey)); } catch (_e) {}
    if (!s) return HW_DEFAULTS.map(h => ({ ...h }));
    const map = {}; s.forEach(h => { map[h.id] = h; });
    const merged = HW_DEFAULTS.map(h => map[h.id] ? { ...h, ...map[h.id] } : { ...h });
    return [...merged, ...s.filter(h => h.personal && !merged.find(m => m.id === h.id))];
  }
  function saveHW(items) { try { localStorage.setItem(hwKey, JSON.stringify(items)); } catch (_e) {} }

  // ── Session milestones ────────────────────────────────────────────────────
  const MILESTONE_SESSIONS = [total * 0.25, total * 0.5, total * 0.75, total].map(Math.round);
  const NAMED_MILESTONES = [
    { at: Math.round(total * 0.25), label: 'First review' },
    { at: Math.round(total * 0.5),  label: 'Halfway' },
    { at: Math.round(total * 0.75), label: 'Final phase' },
    { at: total,                    label: 'Complete' },
  ];

  // ── SVG progress ring ─────────────────────────────────────────────────────
  function progressRing(pctVal, size = 88) {
    const r   = (size / 2) - 8;
    const circ = 2 * Math.PI * r;
    const dash = circ * (pctVal / 100);
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="7"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--teal,#00d4bc)" stroke-width="7"
          stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
      </svg>
      <div class="ptcp-ring-label">
        <div class="ptcp-ring-pct">${pctVal}%</div>
        <div class="ptcp-ring-sub">complete</div>
      </div>`;
  }

  // ── Build HTML ────────────────────────────────────────────────────────────
  el.innerHTML = `
<div class="ptcp-wrap">

  <!-- ① PLAN SUMMARY -->
  <div class="ptcp-section ptcp-summary-card">
    <div class="ptcp-summary-left">
      <div class="ptcp-eyebrow">Your treatment plan</div>
      <h2 class="ptcp-plan-title">${esc(modality || 'Neuromodulation')} for ${esc(condition || 'your condition')}</h2>
      <div class="ptcp-meta-row">
        <span class="ptcp-status-badge ptcp-status-${(course.status||'active').toLowerCase().replace(/[^a-z]/g,'-')}">${statusLbl}</span>
        ${startedStr !== '—' ? `<span class="ptcp-meta-chip">Started ${startedStr}</span>` : ''}
        <span class="ptcp-meta-chip">${total} sessions planned</span>
      </div>
      <div class="ptcp-summary-actions">
        <button class="ptcp-link-btn" onclick="window._navPatient('patient-sessions')">View upcoming sessions</button>
        <button class="ptcp-link-btn" onclick="window._navPatient('patient-messages')">Message care team</button>
      </div>
    </div>
    <div class="ptcp-summary-right">
      <div class="ptcp-ring-wrap">
        ${progressRing(pct)}
      </div>
      <div class="ptcp-ring-detail">${delivered} of ${total} sessions done · ${remaining} remaining</div>
    </div>
  </div>

  <!-- ② PROGRESS THROUGH TREATMENT -->
  <div class="ptcp-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">Progress through treatment</h3>
      <span class="ptcp-section-badge">${delivered} of ${total} sessions</span>
    </div>
    ${_vizMilestoneTimeline(delivered, total, NAMED_MILESTONES)}
    <div class="ptcp-progress-legend" style="margin-top:4px">
      <span>${delivered} sessions completed</span>
      <span>${remaining} remaining</span>
    </div>
    <div class="ptcp-sessions-dots" aria-label="Session timeline" style="margin-top:14px">
      ${Array.from({ length: Math.min(total, 40) }, (_, i) => {
        const n = i + 1;
        const cls = n <= delivered ? 'done' : n === delivered + 1 ? 'next' : 'upcoming';
        return `<div class="ptcp-sess-dot ptcp-sess-dot--${cls}" title="Session ${n}">${n <= delivered ? '' : n === delivered + 1 ? '\u2192' : ''}</div>`;
      }).join('')}
      ${total > 40 ? `<span class="ptcp-dots-more">+${total - 40} more</span>` : ''}
    </div>
  </div>

  <!-- ③ WHY THIS PLAN -->
  <div class="ptcp-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">${whyInfo ? whyInfo.headline : 'Why this plan was chosen'}</h3>
    </div>
    <p class="ptcp-body-text">
      ${whyInfo ? esc(whyInfo.body) : `Your clinician selected ${esc(modality || 'this approach')} based on your symptoms, history, and the best available evidence for ${esc(condition || 'your condition')}.`}
    </p>
    ${condition ? `
    <div class="ptcp-condition-tag">
      Condition: <strong>${esc(condition)}</strong>
    </div>` : ''}
  </div>

  <!-- ④ GOALS -->
  <div class="ptcp-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">Goals we are working on</h3>
    </div>
    <ul class="ptcp-goals-list">
      ${goals.map(g => `
        <li class="ptcp-goal-item">
          <span class="ptcp-goal-check">✓</span>
          <span>${esc(g)}</span>
        </li>`).join('')}
    </ul>
  </div>

  <!-- ⑤ PLAN TASKS / HOMEWORK -->
  <div class="ptcp-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">Between-session tasks</h3>
      <span class="ptcp-section-badge" id="ptcp-hw-badge"></span>
    </div>
    <div id="ptcp-hw-list"></div>
    <div id="ptcp-hw-add-wrap" style="margin-top:10px">
      <div id="ptcp-hw-add-form" style="display:none;margin-bottom:8px">
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="ptcp-hw-input" class="form-control" placeholder="Add a personal note or task" style="flex:1;font-size:12.5px">
          <button class="btn btn-primary btn-sm" onclick="window._ptcpSaveHW()">Add</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ptcp-hw-add-form').style.display='none'">Cancel</button>
        </div>
      </div>
      <button class="ptcp-add-btn" onclick="window._ptcpShowAddHW()">+ Add personal note</button>
    </div>
  </div>

  <!-- ⑥ PROGRESS SO FAR -->
  <div class="ptcp-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">Progress so far</h3>
    </div>
    ${outcomePct !== null ? `
    <div class="ptcp-outcome-banner ${outcomePct >= 30 ? 'ptcp-outcome-banner--good' : 'ptcp-outcome-banner--neutral'}">
      <div class="ptcp-outcome-pct">${outcomePct > 0 ? outcomePct + '% improvement' : 'Tracking in progress'}</div>
      <div class="ptcp-outcome-detail">${esc(outcomeLabel)}</div>
      ${outcomePct >= 50 ? '<div class="ptcp-outcome-note">Clinically significant response — keep going</div>' : ''}
    </div>` : `
    <p class="ptcp-body-text ptcp-muted">Outcome data will appear here after your first formal assessment.</p>`}
    <button class="ptcp-link-btn" style="margin-top:10px" onclick="window._navPatient('patient-outcomes')">View full progress charts</button>
  </div>

  <!-- ⑦ CLINICIAN FEEDBACK -->
  <div class="ptcp-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">From your clinician</h3>
      <span class="ptcp-reviewed-badge">Reviewed</span>
    </div>
    ${feedback ? `
    <div class="ptcp-feedback-block">
      ${feedback._isDemoData ? '<div class="ptcp-demo-notice">Showing example feedback</div>' : ''}
      <div class="ptcp-feedback-text">${esc(feedback.note)}</div>
      <div class="ptcp-feedback-meta">${esc(feedback.reviewer)} · ${fmtDate(feedback.date)}</div>
    </div>` : `
    <p class="ptcp-body-text ptcp-muted">No feedback yet. Your clinician will leave notes after reviewing your progress.</p>`}
  </div>

  <!-- ⑧ SAFETY / TOLERANCE -->
  <div class="ptcp-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">Safety &amp; tolerance</h3>
    </div>
    <p class="ptcp-body-text" style="margin-bottom:12px">
      ${esc(modality || 'This treatment')} is well tolerated. The most common experiences are mild and temporary.
      Always tell your clinician about any new or worsening effects.
    </p>
    <div class="ptcp-safety-grid">
      ${reportedEffects.map(item => {
        const resolved = typeof item === 'object' ? item.resolved : false;
        const effect   = typeof item === 'string' ? item : item.effect;
        const sessions = typeof item === 'object' ? item.sessions : null;
        const tl = _vizTrafficLight(resolved ? 'green' : 'amber', resolved ? 'Resolved' : 'Mild');
        return `<div class="ptcp-safety-item ${resolved ? 'ptcp-safety-resolved' : ''}">
          <div class="ptcp-safety-hd">${tl}<span class="ptcp-safety-effect">${esc(effect)}</span></div>
          ${sessions ? `<div class="ptcp-safety-when">${esc(sessions)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <button class="ptcp-link-btn" style="margin-top:12px" onclick="window._navPatient('patient-messages')">Report a new side effect</button>
  </div>

  <!-- ⑨ DEVICES & BIOMETRICS -->
  <div class="ptcp-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">Devices &amp; biometrics</h3>
      ${wearable._isDemoData ? '<span class="ptcp-demo-tag">Example data</span>' : ''}
    </div>
    <div class="ptcp-bio-row">
      <div class="ptcp-bio-tile"><div class="ptcp-bio-val">${esc(wearable.hrv)}</div><div class="ptcp-bio-lbl">HRV</div></div>
      <div class="ptcp-bio-tile"><div class="ptcp-bio-val">${esc(wearable.sleep)}</div><div class="ptcp-bio-lbl">Sleep last night</div></div>
      <div class="ptcp-bio-tile"><div class="ptcp-bio-val">${esc(wearable.steps)}</div><div class="ptcp-bio-lbl">Steps today</div></div>
      <div class="ptcp-bio-tile"><div class="ptcp-bio-val">${esc(wearable.stress)}</div><div class="ptcp-bio-lbl">Stress level</div></div>
    </div>
    <button class="ptcp-link-btn" style="margin-top:10px" onclick="window._navPatient('patient-devices')">Manage connected devices</button>
  </div>

  <!-- ⑩ CARE ASSISTANT -->
  <div class="ptcp-section ptcp-asst-section">
    <div class="ptcp-section-header">
      <h3 class="ptcp-section-title">Ask Your Care Assistant</h3>
    </div>
    <p class="ptcp-body-text" style="margin-bottom:12px">Powered by AI · Your information stays private</p>
    <div class="ptcp-asst-prompts">
      ${[
        'Explain my treatment plan',
        `Why ${total} sessions?`,
        'What should I do before my next session?',
        'Explain my latest report',
        'What tasks are due today?',
      ].map(q => `<button class="ptcp-asst-chip" onclick="window._ptcpAskAI('${q.replace(/'/g,"\\'")}')">${q}</button>`).join('')}
    </div>
    <button class="btn btn-primary btn-sm" style="width:100%;margin-top:12px;font-size:13px" onclick="window._navPatient('ai-agents')">Open Care Assistant</button>
  </div>

</div>`;

  // ── Homework render ───────────────────────────────────────────────────────
  function renderHW() {
    const items  = loadHW();
    const listEl = document.getElementById('ptcp-hw-list');
    const badge  = document.getElementById('ptcp-hw-badge');
    if (!listEl) return;
    const done   = items.filter(h => h.done).length;
    if (badge) badge.textContent = `${done}/${items.length} done today`;
    listEl.innerHTML = items.map(item => `
      <div class="ptcp-hw-item ${item.done ? 'ptcp-hw-item--done' : ''}">
        <input type="checkbox" class="ptcp-hw-check" ${item.done ? 'checked' : ''} onchange="window._ptcpToggleHW('${item.id}')">
        <div class="ptcp-hw-body">
          <div class="ptcp-hw-title">${esc(item.title)}</div>
          <div class="ptcp-hw-desc">${esc(item.description)}</div>
        </div>
        <span class="ptcp-hw-freq">${esc(item.freq || item.frequency || '')}</span>
      </div>`).join('');
  }

  window._ptcpToggleHW = function(id) {
    const items = loadHW();
    const item  = items.find(h => h.id === id);
    if (item) item.done = !item.done;
    saveHW(items);
    renderHW();
  };
  window._ptcpShowAddHW = function() {
    document.getElementById('ptcp-hw-add-form').style.display = '';
    document.getElementById('ptcp-hw-input').focus();
  };
  window._ptcpSaveHW = function() {
    const inp = document.getElementById('ptcp-hw-input');
    const val = inp?.value?.trim();
    if (!val) return;
    const items = loadHW();
    items.push({ id: 'p_' + Date.now(), title: val, description: 'Personal note', freq: 'Personal', done: false, personal: true });
    saveHW(items);
    if (inp) inp.value = '';
    document.getElementById('ptcp-hw-add-form').style.display = 'none';
    renderHW();
  };

  renderHW();

  // ── Care assistant — routes to ai-agents with prefilled prompt ───────────
  window._ptcpAskAI = function(prompt) {
    try { sessionStorage.setItem('ds_ai_prefill', prompt); } catch (_e) {}
    window._navPatient('ai-agents');
  };
}

// ── PHQ-9 Assessment ──────────────────────────────────────────────────────────
function getPHQ9Questions() {
  return [
    t('patient.phq9.q0'),
    t('patient.phq9.q1'),
    t('patient.phq9.q2'),
    t('patient.phq9.q3'),
    t('patient.phq9.q4'),
    t('patient.phq9.q5'),
    t('patient.phq9.q6'),
    t('patient.phq9.q7'),
    t('patient.phq9.q8'),
  ];
}
function getPHQ9Options() {
  return [
    t('patient.phq9.opt0'),
    t('patient.phq9.opt1'),
    t('patient.phq9.opt2'),
    t('patient.phq9.opt3'),
  ];
}

function phq9Severity(score) {
  if (score <= 4)  return { label: t('patient.phq9.sev.minimal'),    color: 'var(--green)' };
  if (score <= 9)  return { label: t('patient.phq9.sev.mild'),       color: 'var(--teal)'  };
  if (score <= 14) return { label: t('patient.phq9.sev.moderate'),   color: 'var(--blue)'  };
  if (score <= 19) return { label: t('patient.phq9.sev.mod_severe'), color: 'var(--amber)' };
  return               { label: t('patient.phq9.sev.severe'),       color: '#ff6b6b'      };
}

function renderPHQ9Form(containerId, patientId) {
  const formEl = document.getElementById(containerId);
  if (!formEl) return;
  const _phq9Questions = getPHQ9Questions();
  const _phq9Options   = getPHQ9Options();
  formEl.innerHTML = `
    <div class="pt-assessment-form" id="phq9-form-wrap">
      <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">
        ${t('patient.phq9.header')}
      </div>
      ${_phq9Questions.map((q, i) => `
        <div class="pt-phq9-question" id="phq9-q${i}">
          <div style="font-size:12.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.5">
            <span style="color:var(--text-tertiary);margin-right:6px">${i + 1}.</span>${q}
          </div>
          <div class="pt-phq9-options">
            ${_phq9Options.map((opt, v) => `
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
          <div style="font-size:11px;color:var(--text-tertiary)">${t('patient.phq9.running_score')}</div>
          <div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--teal)" id="phq9-live-score">0 / 27</div>
        </div>
        <button class="btn btn-primary" onclick="window._ptPHQ9Submit()">${t('patient.phq9.submit')}</button>
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

    // Submit to API
    const resultEl = document.getElementById('phq9-result');
    if (!patientId) {
      if (resultEl) { resultEl.style.display = ''; resultEl.innerHTML = '<div class="notice notice-error" style="margin-top:12px">Unable to identify patient. Please refresh and try again.</div>'; }
      return;
    }
    try {
      await api.submitAssessment(patientId, {
        template_id:       'PHQ-9',
        score,
        measurement_point: 'post',
        notes:             '',
      });
    } catch (_e) {
      if (resultEl) { resultEl.style.display = ''; resultEl.innerHTML = `<div class="notice notice-error" style="margin-top:12px">Submission failed: ${_e?.message || 'Please try again.'}</div>`; }
      return;
    }

    if (!resultEl) return;
    resultEl.style.display = '';
    resultEl.innerHTML = `
      <div style="margin-top:20px;padding:20px;border-radius:var(--radius-lg);border:1px solid var(--border-teal);background:rgba(0,212,188,0.04)">
        <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">${t('patient.assess.result.title')}</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px">
          <div style="font-size:32px;font-weight:700;font-family:var(--font-display);color:${severity.color}">${score}</div>
          <div style="font-size:13px;color:var(--text-secondary)">${t('patient.assess.result.out_of')}</div>
          <div style="margin-left:auto;font-size:14px;font-weight:600;color:${severity.color}">${severity.label}</div>
        </div>
        <div class="progress-bar" style="height:8px;margin-bottom:8px">
          <div style="height:100%;width:${pct}%;background:${severity.color};border-radius:4px;transition:width 0.8s ease"></div>
        </div>
        <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6;margin-top:12px">
          ${t('patient.assess.result.body')}
        </div>
      </div>
    `;
    setTimeout(() => resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  };
}

// ── Assessments ────────────────────────────────────────────────────────────────
export async function pgPatientAssessments() {
  setTopbar(t('patient.nav.assessments'));

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // ── Safe HTML escaper ────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ── Fetch in parallel ────────────────────────────────────────────────────
  let assessmentsRaw, coursesRaw, sessionsRaw;
  try {
    [assessmentsRaw, coursesRaw, sessionsRaw] = await Promise.all([
      api.patientPortalAssessments().catch(() => null),
      api.patientPortalCourses().catch(() => null),
      api.patientPortalSessions().catch(() => null),
    ]);
  } catch (_e) {
    assessmentsRaw = null;
  }

  if (assessmentsRaw === null) {
    el.innerHTML = `
      <div class="pt-assess-empty">
        <div class="pt-assess-empty-ico" aria-hidden="true">&#9673;</div>
        <div class="pt-assess-empty-title">Could not load your assessments</div>
        <div class="pt-assess-empty-body">Please check your connection and try again.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px"
                onclick="window._navPatient('patient-assessments')">Try again \u2192</button>
      </div>`;
    return;
  }

  const rawItems  = Array.isArray(assessmentsRaw) ? assessmentsRaw : [];
  const courses   = Array.isArray(coursesRaw)     ? coursesRaw     : [];
  const sessions  = Array.isArray(sessionsRaw)    ? sessionsRaw    : [];

  const courseById  = {};
  courses.forEach(c => { if (c.id) courseById[c.id] = c; });
  const sessionById = {};
  sessions.forEach(s => { if (s.id) sessionById[s.id] = s; });

  // ── Assessment knowledge base ────────────────────────────────────────────
  // Extension point: add new assessments here as your clinic introduces them.
  // Backend can override any field via a `meta` object on the assessment item.
  // Translate via i18n keys in a future pass.
  const ASSESS_META = {
    phq9: {
      name: 'Mood Check-In (PHQ-9)',
      purpose: 'Nine questions about mood and daily life',
      timeMin: 5,
      whyItMatters: 'Helps your care team see how your mood has been changing. Scores guide decisions about your treatment, so completing it on time gives the most useful picture.',
      scoreRanges: [{max:4,label:'Minimal',note:'Little to no depression symptoms'},{max:9,label:'Mild',note:'Mild mood changes \u2014 your team is monitoring'},{max:14,label:'Moderate',note:'Noticeable depression \u2014 treatment is focused here'},{max:19,label:'Moderately severe',note:'Significant symptoms \u2014 your team is closely monitoring'},{max:99,label:'Severe',note:'High symptom burden \u2014 your team has this as a priority'}],
      formKey: 'phq9',
    },
    phq2: {
      name: 'Quick Mood Check (PHQ-2)',
      purpose: 'Two questions about mood and enjoyment',
      timeMin: 2,
      whyItMatters: 'A fast check to catch any mood concerns between fuller assessments.',
      scoreRanges: [],
      formKey: null,
    },
    gad7: {
      name: 'Anxiety Check-In (GAD-7)',
      purpose: 'Seven questions about anxiety and worry',
      timeMin: 5,
      whyItMatters: 'Helps your care team understand how anxiety is affecting you and whether your treatment is helping.',
      scoreRanges: [{max:4,label:'Minimal',note:'Low anxiety levels'},{max:9,label:'Mild',note:'Mild anxiety \u2014 your team is tracking this'},{max:14,label:'Moderate',note:'Moderate anxiety \u2014 your clinician is monitoring closely'},{max:99,label:'Severe',note:'Significant anxiety \u2014 your team is focused on this'}],
      formKey: null,
    },
    gad2: {
      name: 'Quick Anxiety Check (GAD-2)',
      purpose: 'Two questions about anxiety',
      timeMin: 2,
      whyItMatters: 'A fast check on anxiety levels.',
      scoreRanges: [],
      formKey: null,
    },
    pcl5: {
      name: 'Stress & Trauma Check-In (PCL-5)',
      purpose: 'Questions about trauma-related symptoms',
      timeMin: 10,
      whyItMatters: 'Tracks how past experiences may be affecting your sleep, mood, and daily life so your team can tailor your treatment.',
      scoreRanges: [],
      formKey: null,
    },
    hdrs: {
      name: 'Depression Assessment (HDRS)',
      purpose: 'A structured depression assessment completed with your clinician',
      timeMin: 15,
      whyItMatters: 'Gives your clinician a detailed view of how depression is affecting different areas of your life.',
      scoreRanges: [{max:7,label:'Normal',note:'Minimal symptoms'},{max:13,label:'Mild',note:'Mild depression'},{max:17,label:'Moderate',note:'Moderate depression'},{max:23,label:'Severe',note:'Significant depression'},{max:99,label:'Very severe',note:'High symptom burden \u2014 your team is actively supporting you'}],
      formKey: null,
    },
    madrs: {
      name: 'Depression Rating (MADRS)',
      purpose: 'A clinician-rated depression scale',
      timeMin: 15,
      whyItMatters: 'Tracks how your mood and energy are responding to treatment over time.',
      scoreRanges: [{max:6,label:'Normal',note:'No significant depression'},{max:19,label:'Mild',note:'Mild symptoms'},{max:34,label:'Moderate',note:'Moderate symptoms'},{max:99,label:'Severe',note:'Significant burden \u2014 your team is closely monitoring'}],
      formKey: null,
    },
    bprs: {
      name: 'Symptom Check (BPRS)',
      purpose: 'A broad check on symptoms completed with your clinician',
      timeMin: 20,
      whyItMatters: 'Gives your care team a full picture of any symptoms you may be experiencing.',
      scoreRanges: [],
      formKey: null,
    },
    moca: {
      name: 'Memory & Thinking Check (MoCA)',
      purpose: 'A brief assessment of memory, attention, and thinking',
      timeMin: 10,
      whyItMatters: 'Helps your care team check that treatment is not affecting your cognitive function, and tracks any changes over time.',
      scoreRanges: [],
      formKey: null,
    },
    psqi: {
      name: 'Sleep Quality Check (PSQI)',
      purpose: 'Questions about your sleep over the past month',
      timeMin: 7,
      whyItMatters: 'Sleep quality is closely linked to treatment progress. This helps your team see how your sleep is responding.',
      scoreRanges: [],
      formKey: null,
    },
    dass21: {
      name: 'Wellbeing Check (DASS-21)',
      purpose: 'Questions about depression, anxiety, and stress',
      timeMin: 10,
      whyItMatters: 'Gives your care team a broad view of how you have been feeling across three areas.',
      scoreRanges: [],
      formKey: null,
    },
    isi: {
      name: 'Sleep Check (ISI)',
      purpose: 'Questions about insomnia and sleep difficulty',
      timeMin: 5,
      whyItMatters: 'Tracks how much sleep problems are affecting your daily life.',
      scoreRanges: [],
      formKey: null,
    },
    qids: {
      name: 'Depression Check (QIDS)',
      purpose: 'A quick depression check to track weekly changes',
      timeMin: 5,
      whyItMatters: 'Provides a fast measure of how your depression is changing week to week.',
      scoreRanges: [],
      formKey: null,
    },
  };

  function assessMeta(item) {
    // Extension point: backend `meta` object overrides defaults.
    if (item.meta && (item.meta.name || item.meta.purpose)) return { ...ASSESS_META['phq9'], ...item.meta };
    const key = (item.template_id || item.assessment_type || item.name || '')
      .toLowerCase().replace(/[-_\s]/g, '');
    return ASSESS_META[key] || null;
  }

  function scoreContext(meta, score) {
    if (score == null || score === '' || !meta || !meta.scoreRanges || !meta.scoreRanges.length) return null;
    const n = Number(score);
    if (!Number.isFinite(n)) return null;
    for (const band of meta.scoreRanges) {
      if (n <= band.max) return { label: band.label, note: band.note };
    }
    return null;
  }

  // ── Status classification ────────────────────────────────────────────────
  // Extension point: backend can supply status field directly.
  // Falls back to date-based inference.
  const now = Date.now();
  function statusClassify(a) {
    const st = (a.status || '').toLowerCase().replace(/[^a-z_]/g, '');
    if (['completed','done','submitted'].includes(st))          return 'completed';
    if (['in_progress','inprogress','started','partial'].includes(st)) return 'in-progress';
    if (a.completed_at || a.administered_at)                    return 'completed';
    if (['scheduled','upcoming'].includes(st))                  return 'upcoming';
    if (a.due_date) {
      return new Date(a.due_date).getTime() <= now ? 'due' : 'upcoming';
    }
    // No due date and no status → treat as due
    return 'due';
  }

  // ── Normalise assessments ────────────────────────────────────────────────
  const items = rawItems.map(a => {
    const meta    = assessMeta(a);
    const status  = statusClassify(a);
    const course  = a.course_id ? courseById[a.course_id] : null;
    const session = a.session_id ? sessionById[a.session_id] : null;
    return {
      id:          a.id || `assess-${Math.random().toString(36).slice(2)}`,
      raw:         a,
      meta,
      status,
      // Display name: prefer backend title → meta friendly name → template_id (not exposed raw)
      name:        a.template_title || (meta ? meta.name : null) || 'Assessment',
      purpose:     meta ? meta.purpose : null,
      timeMin:     meta ? meta.timeMin : null,
      whyItMatters: meta ? meta.whyItMatters : null,
      formKey:     meta ? meta.formKey : null,
      dueDate:     a.due_date,
      completedAt: a.completed_at || a.administered_at,
      measurePoint: a.measurement_point || null,
      score:       a.score != null ? a.score : null,
      scoreCtx:    scoreContext(meta, a.score),
      progress:    typeof a.progress_pct === 'number' ? a.progress_pct : null,
      courseRef:   course ? { title: course.condition_name || course.protocol_name || 'Your treatment' } : null,
      sessionRef:  session ? { number: session.session_number || null, date: fmtDate(session.delivered_at || session.scheduled_at) } : null,
      formUrl:     a.form_url || null,
    };
  });

  // ── Section buckets ──────────────────────────────────────────────────────
  const due       = items.filter(i => i.status === 'due' || i.status === 'in-progress')
                         .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  const upcoming  = items.filter(i => i.status === 'upcoming')
                         .sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
  const completed = items.filter(i => i.status === 'completed')
                         .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));

  // ── Category metadata ────────────────────────────────────────────────────
  const CAT_MAP = {
    phq9:'mood', phq2:'mood', hdrs:'mood', madrs:'mood', qids:'mood',
    gad7:'anxiety', gad2:'anxiety', pcl5:'anxiety', dass21:'anxiety',
    psqi:'sleep', isi:'sleep',
    moca:'cognitive',
    bprs:'symptom',
  };
  const CAT_META = {
    mood:      { icon: '💭', label: 'Mood',               color: '#818cf8' },
    anxiety:   { icon: '🌊', label: 'Anxiety & Stress',   color: '#60a5fa' },
    sleep:     { icon: '🌙', label: 'Sleep',              color: '#a78bfa' },
    cognitive: { icon: '🧩', label: 'Memory & Thinking',  color: '#34d399' },
    symptom:   { icon: '📋', label: 'Symptoms',           color: '#fb923c' },
    custom:    { icon: '✦',  label: 'Assessment',         color: '#94a3b8' },
  };

  function itemCat(item) {
    const key = (item.raw.template_id || item.raw.assessment_type || '')
      .toLowerCase().replace(/[-_\s]/g, '');
    return CAT_META[CAT_MAP[key] || 'custom'] || CAT_META.custom;
  }

  // ── Summary row ──────────────────────────────────────────────────────────
  function summaryRow() {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const doneThisWeek = completed.filter(function(i) {
      return i.completedAt && new Date(i.completedAt).getTime() >= sevenDaysAgo;
    }).length;
    const nextUp = upcoming[0];
    const nextLabel = nextUp
      ? (nextUp.dueDate ? fmtDate(nextUp.dueDate) : nextUp.name)
      : (completed.length > 0 ? 'All caught up' : 'None scheduled');

    return '<div class="pt-assess-summary-row">' +
      '<div class="pt-assess-kpi-card' + (due.length > 0 ? ' pt-assess-kpi-card--urgent' : '') + '">' +
        '<div class="pt-assess-kpi-label">Due Now</div>' +
        '<div class="pt-assess-kpi-value">' + due.length + '</div>' +
        (due.length > 0
          ? '<div class="pt-assess-kpi-sub">Complete when you\'re ready</div>'
          : '<div class="pt-assess-kpi-sub" style="color:#10b981">All up to date ✓</div>') +
      '</div>' +
      '<div class="pt-assess-kpi-card">' +
        '<div class="pt-assess-kpi-label">Completed This Week</div>' +
        '<div class="pt-assess-kpi-value">' + doneThisWeek + '</div>' +
        '<div class="pt-assess-kpi-sub">' + (doneThisWeek > 0 ? 'Good progress' : 'Nothing yet this week') + '</div>' +
      '</div>' +
      '<div class="pt-assess-kpi-card">' +
        '<div class="pt-assess-kpi-label">Next Review</div>' +
        '<div class="pt-assess-kpi-value pt-assess-kpi-value--sm">' + esc(nextLabel) + '</div>' +
        (nextUp ? '<div class="pt-assess-kpi-sub">' + esc(nextUp.name) + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  // ── Section header helper ────────────────────────────────────────────────
  function sectionHd(title, count) {
    return '<div class="pt-assess-section-hd">' +
      '<span class="pt-assess-section-title">' + esc(title) + '</span>' +
      (count > 0 ? '<span class="pt-assess-section-count">' + count + '</span>' : '') +
    '</div>';
  }

  // ── Due / in-progress card ───────────────────────────────────────────────
  function dueCardHTML(item) {
    const cat = itemCat(item);
    const isInProgress = item.status === 'in-progress';
    const catBg = cat.color + '1a';
    const pillHtml = isInProgress
      ? '<span class="pt-assess-pill pt-assess-pill-progress">In progress</span>'
      : '<span class="pt-assess-pill pt-assess-pill-due">Due now</span>';

    const chips = [
      item.timeMin ? '<span class="pt-assess-chip">⏱ ' + item.timeMin + ' min</span>' : '',
      item.dueDate ? '<span class="pt-assess-chip">Due ' + esc(fmtDate(item.dueDate)) + '</span>' : '',
      item.courseRef ? '<span class="pt-assess-chip">📋 ' + esc(item.courseRef.title) + '</span>' : '',
      item.sessionRef ? '<span class="pt-assess-chip">Session' + (item.sessionRef.number ? ' #' + item.sessionRef.number : '') + '</span>' : '',
    ].filter(Boolean).join('');

    let ctaHtml = '';
    const ctaLabel = isInProgress ? 'Continue →' : 'Start →';
    if (item.formKey === 'phq9') {
      ctaHtml = '<button class="btn btn-primary btn-sm" id="pt-assess-cta-' + esc(item.id) + '"' +
        ' onclick="window._ptToggleAssessForm(\'' + esc(item.id) + '\')"' +
        ' aria-expanded="false" aria-controls="pt-assess-form-' + esc(item.id) + '">' + ctaLabel + '</button>';
    } else if (item.formUrl) {
      ctaHtml = '<a class="btn btn-primary btn-sm" href="' + esc(item.formUrl) + '" target="_blank" rel="noopener noreferrer">' + ctaLabel + '</a>';
    } else {
      ctaHtml = '<button class="btn btn-ghost btn-sm" onclick="window._ptAssessContactClinic(\'' + esc(item.id) + '\')">Ask your clinic →</button>';
    }

    const progressHtml = isInProgress && item.progress != null
      ? '<div class="pt-assess-progress-bar" role="progressbar" aria-valuenow="' + item.progress + '" aria-valuemin="0" aria-valuemax="100">' +
          '<div class="pt-assess-progress-fill" style="width:' + Math.min(100, item.progress) + '%"></div>' +
        '</div>'
      : '';

    return '<div class="pt-assess-card pt-assess-card-due" data-id="' + esc(item.id) + '" data-status="' + esc(item.status) + '">' +
      '<div class="pt-assess-card-hd">' +
        '<div class="pt-assess-card-hd-left">' +
          '<span class="pt-assess-cat-chip" style="background:' + catBg + ';color:' + cat.color + '">' + cat.icon + ' ' + cat.label + '</span>' +
          pillHtml +
        '</div>' +
        '<div class="pt-assess-cta-col">' + ctaHtml + '</div>' +
      '</div>' +
      '<div class="pt-assess-card-body">' +
        '<div class="pt-assess-name">' + esc(item.name) + '</div>' +
        (item.whyItMatters
          ? '<div class="pt-assess-why-inline">' + esc(item.whyItMatters) + '</div>'
          : (item.purpose ? '<div class="pt-assess-why-inline">' + esc(item.purpose) + '</div>' : '')) +
        (chips ? '<div class="pt-assess-chips">' + chips + '</div>' : '') +
        progressHtml +
      '</div>' +
      '<div class="pt-assess-inline-form" id="pt-assess-form-' + esc(item.id) + '" hidden></div>' +
    '</div>';
  }

  // ── Upcoming card ────────────────────────────────────────────────────────
  function upcomingCardHTML(item) {
    const cat = itemCat(item);
    const catBg = cat.color + '12';
    const chips = [
      item.timeMin ? '<span class="pt-assess-chip">⏱ ' + item.timeMin + ' min</span>' : '',
      item.dueDate ? '<span class="pt-assess-chip">Due ' + esc(fmtDate(item.dueDate)) + '</span>' : '',
      item.sessionRef ? '<span class="pt-assess-chip">Session' + (item.sessionRef.number ? ' #' + item.sessionRef.number : '') + '</span>' : '',
    ].filter(Boolean).join('');

    return '<div class="pt-assess-card pt-assess-card-upcoming" data-id="' + esc(item.id) + '" data-status="upcoming">' +
      '<div class="pt-assess-card-hd">' +
        '<div class="pt-assess-card-hd-left">' +
          '<span class="pt-assess-cat-chip" style="background:' + catBg + ';color:' + cat.color + '">' + cat.icon + ' ' + cat.label + '</span>' +
          '<span class="pt-assess-pill pt-assess-pill-upcoming">Upcoming</span>' +
        '</div>' +
      '</div>' +
      '<div class="pt-assess-card-body">' +
        '<div class="pt-assess-name" style="font-size:.85rem">' + esc(item.name) + '</div>' +
        (item.purpose ? '<div class="pt-assess-purpose">' + esc(item.purpose) + '</div>' : '') +
        (chips ? '<div class="pt-assess-chips">' + chips + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  // ── Completed card ───────────────────────────────────────────────────────
  function completedCardHTML(item) {
    const cat = itemCat(item);
    const catBg = cat.color + '10';
    const isReviewed = !!(item.raw.clinician_reviewed || item.raw.reviewed_by);

    const chips = [
      item.completedAt ? '<span class="pt-assess-chip">Completed ' + esc(fmtDate(item.completedAt)) + '</span>' : '',
      item.sessionRef ? '<span class="pt-assess-chip">Session' + (item.sessionRef.number ? ' #' + item.sessionRef.number : '') + '</span>' : '',
    ].filter(Boolean).join('');

    let resultHtml = '';
    if (item.score != null) {
      const ctx = item.scoreCtx;
      const bandClass = ctx ? ctx.label.toLowerCase().replace(/\s+/g, '-') : '';
      resultHtml =
        '<div class="pt-assess-result-row">' +
          '<span class="pt-assess-score-label">Your result</span>' +
          (ctx
            ? '<span class="pt-assess-score-band ' + bandClass + '">' + esc(ctx.label) + '</span>'
            : '<span class="pt-assess-score-num">' + esc(String(item.score)) + '</span>') +
          (isReviewed ? '<span class="pt-assess-reviewed-badge">✓ Reviewed by your team</span>' : '') +
        '</div>' +
        (ctx ? '<div class="pt-assess-score-note">' + esc(ctx.note) + '</div>' : '');
    } else if (isReviewed) {
      resultHtml = '<div class="pt-assess-result-row"><span class="pt-assess-reviewed-badge">✓ Reviewed by your team</span></div>';
    }

    return '<div class="pt-assess-card pt-assess-card-done" data-id="' + esc(item.id) + '" data-status="completed">' +
      '<div class="pt-assess-card-hd">' +
        '<div class="pt-assess-card-hd-left">' +
          '<span class="pt-assess-cat-chip" style="background:' + catBg + ';color:' + cat.color + '">' + cat.icon + ' ' + cat.label + '</span>' +
          '<span class="pt-assess-pill pt-assess-pill-done">Completed</span>' +
        '</div>' +
        '<div class="pt-assess-cta-col">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._ptAssessReview(\'' + esc(item.id) + '\')">Review result</button>' +
        '</div>' +
      '</div>' +
      '<div class="pt-assess-card-body">' +
        '<div class="pt-assess-name" style="font-size:.85rem">' + esc(item.name) + '</div>' +
        resultHtml +
        (chips ? '<div class="pt-assess-chips" style="margin-top:8px">' + chips + '</div>' : '') +
      '</div>' +
    '</div>';
  }

  // ── Why section ──────────────────────────────────────────────────────────
  function whySection() {
    const catSeen = {};
    const groups = [];
    items.forEach(function(i) {
      const c = itemCat(i);
      if (!catSeen[c.label]) {
        catSeen[c.label] = true;
        groups.push({ cat: c, item: i });
      }
    });
    const display = groups.slice(0, 5);
    if (display.length === 0) return '';

    return '<div class="pt-assess-why-section">' +
      sectionHd('Why These Assessments Matter', 0) +
      '<div class="pt-assess-why-grid">' +
        display.map(function(g) {
          return '<div class="pt-assess-why-card">' +
            '<div class="pt-assess-why-name" style="color:' + g.cat.color + '">' + g.cat.icon + ' ' + g.cat.label + '</div>' +
            '<div class="pt-assess-why-text">' + esc(g.item.whyItMatters || g.item.purpose || '') + '</div>' +
          '</div>';
        }).join('') +
        '<div class="pt-assess-why-card pt-assess-why-note">' +
          '<div class="pt-assess-why-name">Your results are private</div>' +
          '<div class="pt-assess-why-text">Your scores are only seen by your care team. They are used to guide your treatment, not to judge you.</div>' +
        '</div>' +
      '</div>' +
      '<div class="pt-assess-why-purpose">Assessments help your care team track changes over time, support treatment follow-up, and monitor your progress between sessions.</div>' +
    '</div>';
  }

  // ── Care Assistant section ───────────────────────────────────────────────
  function assistSection() {
    return '<div class="pt-assess-section">' +
      sectionHd('Ask Your Care Assistant', 0) +
      '<div class="pt-assess-assist-grid">' +
        '<button class="pt-assess-assist-btn" onclick="window._assessAskAI(\'Why was this assessment assigned to me?\')">Why was this assigned to me?</button>' +
        '<button class="pt-assess-assist-btn" onclick="window._assessAskAI(\'Which assessment should I complete first?\')">Which one should I complete first?</button>' +
        '<button class="pt-assess-assist-btn" onclick="window._assessAskAI(\'Can you explain my recent assessment result in simple language?\')">Explain my result simply</button>' +
        '<button class="pt-assess-assist-btn" onclick="window._assessAskAI(\'How have my assessment scores changed since last week?\')">What changed since last week?</button>' +
      '</div>' +
    '</div>';
  }

  // ── DEAD CODE kept for reference — replaced below ─────────────────────────
  // Old assessCardHTML is replaced by dueCardHTML / upcomingCardHTML / completedCardHTML.
  // Old whyCalloutHTML is replaced by whySection().
  // Old sectionHTML is replaced by inline section builders + sectionHd().
  function assessCardHTML(item) {
    const isDue       = item.status === 'due';
    const isInProgress = item.status === 'in-progress';
    const isUpcoming  = item.status === 'upcoming';
    const isCompleted = item.status === 'completed';

    // Status pill
    let pillHtml = '';
    if (isDue)        pillHtml = `<span class="pt-assess-pill pt-assess-pill-due">Due now</span>`;
    else if (isInProgress) pillHtml = `<span class="pt-assess-pill pt-assess-pill-progress">In progress</span>`;
    else if (isUpcoming)   pillHtml = `<span class="pt-assess-pill pt-assess-pill-upcoming">Upcoming</span>`;
    else if (isCompleted)  pillHtml = `<span class="pt-assess-pill pt-assess-pill-done">Completed</span>`;

    // Time estimate
    const timeHtml = item.timeMin
      ? `<span class="pt-assess-chip">~${item.timeMin} min</span>`
      : '';

    // Due date
    const dueDateHtml = item.dueDate && !isCompleted
      ? `<span class="pt-assess-chip">Due ${esc(fmtDate(item.dueDate))}</span>`
      : '';

    // Completed date
    const completedHtml = isCompleted && item.completedAt
      ? `<span class="pt-assess-chip">Done ${esc(fmtDate(item.completedAt))}</span>`
      : '';

    // Measurement point
    const mpHtml = item.measurePoint
      ? `<span class="pt-assess-chip">${esc(item.measurePoint)}</span>`
      : '';

    // Course / session context
    const courseChip = item.courseRef
      ? `<span class="pt-assess-chip">${esc(item.courseRef.title)}</span>`
      : '';
    const sessionChip = item.sessionRef
      ? `<span class="pt-assess-chip">Session${item.sessionRef.number ? ' #' + item.sessionRef.number : ''} \u00b7 ${esc(item.sessionRef.date)}</span>`
      : '';

    const chips = [timeHtml, dueDateHtml, completedHtml, mpHtml, courseChip, sessionChip].filter(Boolean).join('');

    // Progress bar for in-progress
    const progressHtml = isInProgress && item.progress != null
      ? `<div class="pt-assess-progress-bar" role="progressbar" aria-valuenow="${item.progress}" aria-valuemin="0" aria-valuemax="100" aria-label="Assessment ${item.progress}% complete">
           <div class="pt-assess-progress-fill" style="width:${Math.min(100, item.progress)}%"></div>
         </div>`
      : '';

    // Score for completed (patient-friendly, not alarming)
    let scoreHtml = '';
    if (isCompleted && item.score != null) {
      const ctx = item.scoreCtx;
      scoreHtml = `
        <div class="pt-assess-score-row">
          <span class="pt-assess-score-label">Your result</span>
          ${ctx
            ? `<span class="pt-assess-score-band ${esc(ctx.label.toLowerCase().replace(/\s+/g,'-'))}">${esc(ctx.label)}</span>`
            : `<span class="pt-assess-score-num">${(item.score != null && !isNaN(Number(item.score))) ? esc(String(item.score)) : '—'}</span>`}
        </div>
        ${ctx ? `<div class="pt-assess-score-note">${esc(ctx.note)}</div>` : ''}`;
    }

    // CTA
    let ctaHtml = '';
    if (isDue) {
      if (item.formKey === 'phq9') {
        ctaHtml = `<button class="btn btn-primary btn-sm pt-assess-cta"
                           id="pt-assess-cta-${esc(item.id)}"
                           onclick="window._ptToggleAssessForm('${esc(item.id)}')"
                           aria-expanded="false"
                           aria-controls="pt-assess-form-${esc(item.id)}">Start \u2192</button>`;
      } else if (item.formUrl) {
        ctaHtml = `<a class="btn btn-primary btn-sm pt-assess-cta"
                      href="${esc(item.formUrl)}" target="_blank" rel="noopener noreferrer"
                      aria-label="Open ${esc(item.name)} form">Start \u2192</a>`;
      } else {
        ctaHtml = `<button class="btn btn-ghost btn-sm pt-assess-cta"
                           onclick="window._ptAssessContactClinic('${esc(item.id)}')"
                           aria-label="Ask about ${esc(item.name)}">Ask your clinic \u2192</button>`;
      }
    } else if (isInProgress) {
      if (item.formKey === 'phq9') {
        ctaHtml = `<button class="btn btn-primary btn-sm pt-assess-cta"
                           id="pt-assess-cta-${esc(item.id)}"
                           onclick="window._ptToggleAssessForm('${esc(item.id)}')"
                           aria-expanded="false"
                           aria-controls="pt-assess-form-${esc(item.id)}">Continue \u2192</button>`;
      } else if (item.formUrl) {
        ctaHtml = `<a class="btn btn-primary btn-sm pt-assess-cta"
                      href="${esc(item.formUrl)}" target="_blank" rel="noopener noreferrer">Continue \u2192</a>`;
      }
    } else if (isCompleted) {
      ctaHtml = `<button class="btn btn-ghost btn-sm pt-assess-cta"
                         onclick="window._ptAssessReview('${esc(item.id)}')"
                         aria-label="Review ${esc(item.name)}">Review</button>`;
    }

    return `
      <div class="pt-assess-card${isDue || isInProgress ? ' pt-assess-card-due' : isCompleted ? ' pt-assess-card-done' : ''}"
           data-id="${esc(item.id)}" data-status="${esc(item.status)}">
        <div class="pt-assess-card-top">
          <div class="pt-assess-main">
            <div class="pt-assess-name-row">
              <span class="pt-assess-name">${esc(item.name)}</span>
              ${pillHtml}
            </div>
            ${item.purpose ? `<div class="pt-assess-purpose">${esc(item.purpose)}</div>` : ''}
            ${chips ? `<div class="pt-assess-chips">${chips}</div>` : ''}
            ${progressHtml}
            ${scoreHtml}
          </div>
          ${ctaHtml ? `<div class="pt-assess-cta-col">${ctaHtml}</div>` : ''}
        </div>
        <div class="pt-assess-inline-form" id="pt-assess-form-${esc(item.id)}" hidden></div>
      </div>`;
  }

  // ── Empty page state ─────────────────────────────────────────────────────
  if (items.length === 0) {
    el.innerHTML =
      '<div class="pt-assess-empty">' +
        '<div class="pt-assess-empty-ico" aria-hidden="true">&#9673;</div>' +
        '<div class="pt-assess-empty-title">' + t('patient.assess.empty.title') + '</div>' +
        '<div class="pt-assess-empty-body">' + t('patient.assess.empty.body') + '</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px">' +
          '<button class="btn btn-ghost btn-sm" onclick="window._navPatient(\'patient-messages\')">' + t('patient.assess.empty.cta_message') + '</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="window._navPatient(\'patient-portal\')">' + t('patient.assess.empty.cta_home') + '</button>' +
        '</div>' +
      '</div>';
    return;
  }

  // ── Render page ──────────────────────────────────────────────────────────
  el.innerHTML =
    '<div class="pt-assess-wrap">' +
      summaryRow() +
      (due.length > 0
        ? '<div class="pt-assess-section">' + sectionHd('Due Now', due.length) + due.map(dueCardHTML).join('') + '</div>'
        : '') +
      (upcoming.length > 0
        ? '<div class="pt-assess-section">' + sectionHd('Upcoming', upcoming.length) + upcoming.map(upcomingCardHTML).join('') + '</div>'
        : '') +
      (completed.length > 0
        ? '<div class="pt-assess-section">' + sectionHd('Completed', completed.length) + completed.map(completedCardHTML).join('') + '</div>'
        : '') +
      whySection() +
      assistSection() +
    '</div>';

  // ── Handlers ─────────────────────────────────────────────────────────────

  window._ptToggleAssessForm = function(itemId) {
    const item = items.find(function(i) { return i.id === itemId; });
    if (!item) return;
    const formEl = el.querySelector('#pt-assess-form-' + CSS.escape(itemId));
    const btn    = el.querySelector('#pt-assess-cta-' + CSS.escape(itemId));
    if (!formEl) return;
    const opening = formEl.hasAttribute('hidden');
    if (opening) {
      formEl.removeAttribute('hidden');
      if (btn) { btn.textContent = 'Close ×'; btn.setAttribute('aria-expanded', 'true'); }
      if (item.formKey === 'phq9') renderPHQ9Form('pt-assess-form-' + CSS.escape(itemId), currentUser?.id);
      setTimeout(function() { formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50);
    } else {
      formEl.setAttribute('hidden', '');
      if (btn) { btn.textContent = (item.status === 'in-progress' ? 'Continue' : 'Start') + ' →'; btn.setAttribute('aria-expanded', 'false'); }
    }
  };

  window._ptAssessReview = function(_itemId) { window._navPatient('patient-reports'); };
  window._ptAssessContactClinic = function(_itemId) { window._navPatient('patient-messages'); };

  window._assessAskAI = function(prompt) {
    if (typeof window._navPatient === 'function') {
      window._navPatient('ai-agents');
      setTimeout(function() {
        const inp = document.getElementById('pt-ai-input') || document.querySelector('.pt-ai-input');
        if (inp) { inp.value = prompt; inp.focus(); }
      }, 300);
    }
  };
}

// \u2500\u2500 Reports \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function pgPatientReports() {
  setTopbar('My Reports');

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
        <div class="pt-docs-empty-title">${t('patient.reports.err.title')}</div>
        <div class="pt-docs-empty-body">${t('patient.reports.err.body')}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px"
                onclick="window._navPatient('patient-reports')">${t('patient.reports.err.retry')}</button>
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

  // ── Delta helper: compare doc score against the most recent prior same-type doc ──
  // Returns { delta, prevScore, prevDate } or null if no comparison is possible.
  // Language is kept conservative — never diagnostic, never overclaiming.
  function _ptComputeDelta(doc, allDocs) {
    if (doc.score == null || !doc.templateKey) return null;
    const n = Number(doc.score);
    if (!Number.isFinite(n)) return null;
    const prior = allDocs
      .filter(d =>
        d.id !== doc.id &&
        d.templateKey === doc.templateKey &&
        d.score != null &&
        Number.isFinite(Number(d.score)) &&
        new Date(d.date || 0) < new Date(doc.date || 0)
      )
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (!prior.length) return null;
    const prev = prior[0];
    const delta = n - Number(prev.score);
    if (!Number.isFinite(delta)) return null;
    return { delta, prevScore: prev.score, prevDate: prev.displayDate || '' };
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
    outcome:           { label: t('patient.reports.cat.outcome'),          icon: '&#9649;', color: 'var(--blue)',    bg: 'rgba(74,158,255,.1)'    },
    assessment:        { label: t('patient.reports.cat.assessment'),        icon: '&#9673;', color: 'var(--teal)',    bg: 'rgba(0,212,188,.08)'   },
    'session-summary': { label: t('patient.reports.cat.session_summary'),  icon: '&#9671;', color: '#a78bfa',        bg: 'rgba(167,139,250,.1)'  },
    adverse:           { label: t('patient.reports.cat.adverse'),           icon: '&#9680;', color: '#fb923c',        bg: 'rgba(251,146,60,.1)'   },
    consent:           { label: t('patient.reports.cat.consent'),           icon: '&#9643;', color: '#94a3b8',        bg: 'rgba(148,163,184,.1)'  },
    care:              { label: t('patient.reports.cat.care'),              icon: '&#9678;', color: '#34d399',        bg: 'rgba(52,211,153,.1)'   },
    guide:             { label: t('patient.reports.cat.guide'),             icon: '&#128218;', color: '#f59e0b',      bg: 'rgba(245,158,11,.08)'  },
    letter:            { label: t('patient.reports.cat.letter'),            icon: '&#9672;', color: '#e2e8f0',        bg: 'rgba(226,232,240,.06)' },
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
        <div class="pt-docs-empty-title">${t('patient.reports.empty.title')}</div>
        <div class="pt-docs-empty-body">${t('patient.reports.empty.body')}</div>
        <div class="pt-docs-empty-details">
          <details>
            <summary class="pt-docs-empty-toggle">${t('patient.reports.empty.toggle')}</summary>
            <ul class="pt-docs-empty-list">
              <li>${t('patient.reports.cat.outcome')} &amp; ${t('patient.reports.cat.assessment').toLowerCase()}</li>
              <li>${t('patient.reports.cat.session_summary')}</li>
              <li>${t('patient.reports.cat.care')}</li>
              <li>${t('patient.reports.cat.consent')}</li>
              <li>${t('patient.reports.cat.letter')}</li>
            </ul>
          </details>
        </div>
      </div>`;
    return;
  }

  // ── Category definitions (display-layer grouping, not data-model categories) ──
  const DISPLAY_CATS = [
    { id: 'progress',   label: 'Progress Reports',           icon: '&#9649;', color: 'var(--blue)',  bg: 'rgba(74,158,255,.1)',   defaultOpen: true,
      filter: d => d.category === 'outcome',
      emptyMsg: 'Progress reports will appear here as your treatment continues.' },
    { id: 'assessment', label: 'Assessment Results',         icon: '&#9673;', color: 'var(--teal)',  bg: 'rgba(0,212,188,.08)',   defaultOpen: true,
      filter: d => d.category === 'assessment',
      emptyMsg: 'Assessment results will appear here after your clinician completes a check-in.' },
    { id: 'feedback',   label: 'Care Team Feedback',         icon: '&#9678;', color: '#34d399',      bg: 'rgba(52,211,153,.1)',   defaultOpen: true,
      filter: d => Boolean(d.clinicianNotes),
      emptyMsg: 'Notes from your care team will appear here. Check back after your next session.' },
    { id: 'sessions',   label: 'Session Summaries',          icon: '&#9671;', color: '#a78bfa',      bg: 'rgba(167,139,250,.1)',  defaultOpen: false,
      filter: d => d.category === 'session-summary',
      emptyMsg: 'Session summaries will appear here after each of your treatment sessions.' },
    { id: 'guides',     label: 'Instructions & Care Guides', icon: '&#128218;', color: '#f59e0b',    bg: 'rgba(245,158,11,.08)',  defaultOpen: false,
      filter: d => d.category === 'care' || d.category === 'guide',
      emptyMsg: 'Instructions and care guides from your team will appear here.' },
    { id: 'forms',      label: 'Consent & Forms',            icon: '&#9643;', color: '#94a3b8',      bg: 'rgba(148,163,184,.1)',  defaultOpen: false,
      filter: d => d.category === 'consent' || d.category === 'adverse' || d.category === 'letter',
      emptyMsg: 'Consent forms and other documents will appear here when added by your care team.' },
  ];

  // ── Document card HTML ───────────────────────────────────────────────────
  // Extension point: pass { showSharing: true } to add caregiver/proxy share UI.
  function docCardHTML(doc, opts = {}) {
    const { expandPl = false } = opts;
    const cm = CAT_META[doc.category] || CAT_META['outcome'];
    const plId = `pt-doc-pl-${esc(doc.id)}`;

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
           <span class="pt-doc-score-num">${(doc.score != null && !isNaN(Number(doc.score))) ? esc(String(doc.score)) : '—'}</span>
           ${interpBand ? `<span class="pt-doc-score-band ${esc(interpBand.label.toLowerCase().replace(/\s+/g,'-'))}">${esc(interpBand.label)}</span>` : ''}
         </div>`
      : '';

    // Status badge — only shown when not a normal completed state
    const showStatus = doc.status && !['completed','done','available',''].includes(doc.status);
    const statusBadge = showStatus
      ? `<span class="pt-doc-status-badge">${esc(doc.status)}</span>`
      : '';

    // Delta — what changed since the most recent prior report of same template type
    const delta = _ptComputeDelta(doc, docs);
    let deltaRow = '';
    if (delta !== null) {
      const abs = Math.abs(delta.delta);
      const dir = delta.delta < 0 ? 'dropped' : 'increased';
      const tone = delta.delta < 0 ? 'This is a positive sign.' : 'Your care team is monitoring this.';
      deltaRow = `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">What changed</span>Your score ${dir} by ${abs} point${abs !== 1 ? 's' : ''} since your last report on ${esc(delta.prevDate)}. ${tone}</div>`;
    } else if (doc.score != null && doc.templateKey) {
      deltaRow = `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">What changed</span>This is your first recorded result for this measure — future reports will show how you are progressing.</div>`;
    }

    // Plain-language section
    const hasPl = Boolean(doc.plainLang);
    const plSection = hasPl
      ? `<button class="pt-doc-pl-toggle" aria-expanded="${expandPl}"
                aria-controls="${plId}"
                onclick="window._ptToggleDocPl('${esc(doc.id)}')">
           <span class="pt-doc-pl-toggle-ico">&#9678;</span>
           ${t('patient.reports.doc.what_this')}
           <span class="pt-doc-pl-chev" id="chev-${esc(doc.id)}" aria-hidden="true">${expandPl ? '\u25b4' : '\u25be'}</span>
         </button>
         <div class="pt-doc-pl-body" id="${plId}" ${expandPl ? '' : 'hidden'}>
           ${doc.plainLang.what ? `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">${t('patient.reports.doc.what_this')}</span>${esc(doc.plainLang.what)}</div>` : ''}
           ${doc.plainLang.why  ? `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">${t('patient.reports.doc.why')}</span>${esc(doc.plainLang.why)}</div>` : ''}
           ${deltaRow}
           ${interpBand         ? `<div class="pt-doc-pl-row pt-doc-pl-row-hl"><span class="pt-doc-pl-label">${t('patient.reports.doc.what_means')}</span>${esc(interpBand.note)}</div>` : ''}
         </div>`
      : '';

    // Actions
    const viewCta = doc.url
      ? `<a class="pt-doc-cta" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer"
              aria-label="${t('patient.reports.doc.view')} ${esc(doc.title)}"
              tabindex="0">${t('patient.reports.doc.view')}</a>`
      : `<button class="pt-doc-cta pt-doc-cta-stub"
               onclick="window._ptViewDoc('${esc(doc.id)}')"
               aria-label="${t('patient.reports.doc.view')} ${esc(doc.title)}">${t('patient.reports.doc.view')}</button>`;

    const dlCta = doc.url
      ? `<a class="pt-doc-cta pt-doc-cta-dl" href="${esc(doc.url)}" download
              target="_blank" rel="noopener noreferrer"
              aria-label="Download ${esc(doc.title)}">Download</a>`
      : '';

    const askCta = `<button class="pt-doc-cta pt-doc-cta-ask"
             onclick="window._ptAskAbout('${esc(doc.id)}','${esc(doc.title)}')"
             aria-label="Ask about ${esc(doc.title)}">Ask about this</button>`;

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
            ${viewCta}
            ${dlCta}
            ${askCta}
            ${scoreHTML}
          </div>
        </div>
        ${plSection}
      </div>`;
  }

  // ── Hero card: latest report, visually elevated ───────────────────────
  function heroCardHTML(doc) {
    if (!doc) return '';
    const cm = CAT_META[doc.category] || CAT_META['outcome'];
    const pl = doc.plainLang;

    // Reviewed badge — trusts status field or presence of clinician notes
    const isReviewed = doc.status === 'reviewed' || Boolean(doc.clinicianNotes);
    const reviewedBadge = isReviewed
      ? `<span class="pt-hero-badge pt-hero-badge--reviewed">&#10003;&nbsp;Reviewed by care team</span>`
      : `<span class="pt-hero-badge pt-hero-badge--pending">Awaiting review</span>`;

    // Summary — plain-language what + why combined
    const summary = pl
      ? [pl.what, pl.why].filter(Boolean).join('. ')
      : 'Your latest report is available from your care team.';

    // What this means — score band interpretation or plain why
    const interp = doc.scoreInterp;
    let meansHTML = '';
    if (interp) {
      const scoreStr = doc.score != null ? esc(String(doc.score)) : '—';
      meansHTML = `<div class="pt-report-hero-means">
        <div class="pt-report-hero-means-label">What this means</div>
        <div class="pt-report-hero-means-text">Your score of <strong>${scoreStr}</strong> puts you in the <strong>${esc(interp.label)}</strong> range. ${esc(interp.note)}</div>
      </div>`;
    } else if (pl && pl.why) {
      meansHTML = `<div class="pt-report-hero-means">
        <div class="pt-report-hero-means-label">What this means</div>
        <div class="pt-report-hero-means-text">${esc(pl.why)}</div>
      </div>`;
    }

    // What changed — conservative language, never diagnostic
    const heroDelta = _ptComputeDelta(doc, docs);
    let deltaText = '';
    if (heroDelta !== null) {
      const abs = Math.abs(heroDelta.delta);
      const dir = heroDelta.delta < 0 ? 'dropped' : 'increased';
      const tone = heroDelta.delta < 0 ? 'This is a positive sign.' : 'Your care team is monitoring this.';
      deltaText = `Your score ${dir} by <strong>${abs}</strong> point${abs !== 1 ? 's' : ''} since your last report on ${esc(heroDelta.prevDate)}. ${tone}`;
    } else if (doc.score != null) {
      deltaText = 'This is your first recorded result for this measure — future reports will show your progress over time.';
    } else {
      deltaText = 'Check back after your next session for updated results.';
    }

    // Actions
    const viewBtn = doc.url
      ? `<a class="pt-hero-action pt-hero-action--primary" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer">View full report</a>`
      : `<button class="pt-hero-action pt-hero-action--primary" onclick="window._ptViewDoc('${esc(doc.id)}')">View full report</button>`;

    const dlBtn = doc.url
      ? `<a class="pt-hero-action" href="${esc(doc.url)}" download target="_blank" rel="noopener noreferrer">Download</a>`
      : '';

    const askBtn = `<button class="pt-hero-action pt-hero-action--ask" onclick="window._ptAskAbout('${esc(doc.id)}','${esc(doc.title)}')">Ask about this</button>`;

    return `
      <div class="pt-report-hero" data-id="${esc(doc.id)}">
        <div class="pt-report-hero-head">
          <div class="pt-report-hero-icon" style="background:${cm.bg};color:${cm.color}" aria-hidden="true">${cm.icon}</div>
          <div class="pt-report-hero-meta">
            <div class="pt-report-hero-eyebrow">Latest report</div>
            <div class="pt-report-hero-title">${esc(doc.title)}</div>
            <div class="pt-report-hero-sub">
              <span class="pt-doc-date">${esc(doc.displayDate)}</span>
              <span class="pt-doc-type-label" style="color:${cm.color}">${esc(cm.label)}</span>
            </div>
          </div>
          <div class="pt-report-hero-badge-wrap">${reviewedBadge}</div>
        </div>
        <div class="pt-report-hero-body">
          <p class="pt-report-hero-summary">${esc(summary)}</p>
          ${meansHTML}
          <div class="pt-report-hero-delta">
            <span class="pt-report-hero-delta-label">What changed</span>
            <span class="pt-report-hero-delta-text">${deltaText}</span>
          </div>
        </div>
        <div class="pt-report-hero-actions">
          ${viewBtn}
          ${dlBtn}
          ${askBtn}
        </div>
      </div>`;
  }

  // ── Category section HTML ─────────────────────────────────────────
  const CAT_PAGE_SIZE = 4;

  function catSectionHTML(cat, items) {
    const isOpen = cat.defaultOpen && items.length > 0;
    const countBadge = items.length > 0
      ? `<span class="pt-docs-cat-count">${items.length}</span>`
      : `<span class="pt-docs-cat-count pt-docs-cat-count--empty">0</span>`;

    let bodyContent;
    if (items.length === 0) {
      bodyContent = `<div class="pt-docs-cat-empty">${esc(cat.emptyMsg)}</div>`;
    } else if (items.length <= CAT_PAGE_SIZE) {
      bodyContent = items.map(d => docCardHTML(d)).join('');
    } else {
      const visible = items.slice(0, CAT_PAGE_SIZE);
      const hidden  = items.slice(CAT_PAGE_SIZE);
      bodyContent =
        visible.map(d => docCardHTML(d)).join('') +
        `<div class="pt-docs-cat-more" id="pt-cat-more-${esc(cat.id)}" hidden>` +
          hidden.map(d => docCardHTML(d)).join('') +
        `</div>` +
        `<button class="pt-docs-cat-show-more" id="pt-cat-show-btn-${esc(cat.id)}"
                 onclick="window._ptCatShowMore('${esc(cat.id)}',${items.length})">
           Show ${hidden.length} more
         </button>`;
    }

    return `
      <div class="pt-docs-cat-section" id="pt-cat-${esc(cat.id)}">
        <button class="pt-docs-cat-hd" aria-expanded="${isOpen}"
                onclick="window._ptToggleCatSection('${esc(cat.id)}')">
          <span class="pt-docs-cat-icon" style="background:${cat.bg};color:${cat.color}" aria-hidden="true">${cat.icon}</span>
          <span class="pt-docs-cat-label">${esc(cat.label)}</span>
          ${countBadge}
          <span class="pt-docs-cat-chev" id="pt-cat-chev-${esc(cat.id)}" aria-hidden="true">${isOpen ? '▴' : '▾'}</span>
        </button>
        <div class="pt-docs-cat-body" id="pt-cat-body-${esc(cat.id)}" ${isOpen ? '' : 'hidden'}>
          ${bodyContent}
        </div>
      </div>`;
  }

  // ── Render ───────────────────────────────────────────────────────────────────────────
  const latest = docs[0] || null;

  el.innerHTML = `
    <div class="pt-docs-wrap">
      <div id="pt-docs-ask-anchor"></div>
      ${heroCardHTML(latest)}
      <div class="pt-docs-sections-wrap">
        ${DISPLAY_CATS.map(cat => catSectionHTML(cat, docs.filter(cat.filter))).join('')}
      </div>
    </div>`;

  // ── Interaction handlers ─────────────────────────────────────────────────────

  // Toggle collapsible category section
  window._ptToggleCatSection = function(catId) {
    const body = el.querySelector('#pt-cat-body-' + catId);
    const chev = el.querySelector('#pt-cat-chev-' + catId);
    const btn  = el.querySelector('#pt-cat-' + catId + ' .pt-docs-cat-hd');
    if (!body) return;
    const opening = body.hasAttribute('hidden');
    if (opening) { body.removeAttribute('hidden'); } else { body.setAttribute('hidden', ''); }
    if (chev) chev.textContent = opening ? '▴' : '▾';
    if (btn)  btn.setAttribute('aria-expanded', String(opening));
  };

  // Plain-language accordion (unchanged behaviour)
  window._ptToggleDocPl = function(docId) {
    const safeId = CSS.escape(docId);
    const body = el.querySelector(`#pt-doc-pl-${safeId}`);
    const chev = el.querySelector(`#chev-${safeId}`);
    const btn  = el.querySelector(`[aria-controls="pt-doc-pl-${safeId}"]`);
    if (!body) return;
    const opening = body.hasAttribute('hidden');
    if (opening) { body.removeAttribute('hidden'); } else { body.setAttribute('hidden', ''); }
    if (chev) chev.textContent = opening ? '▴' : '▾';
    if (btn)  btn.setAttribute('aria-expanded', String(opening));
  };

  // View document (unchanged — graceful unavailable notice)
  window._ptViewDoc = function(docId) {
    const doc = docs.find(d => String(d.id) === String(docId));
    if (!doc) return;
    if (doc.url) {
      window.open(doc.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const card = el.querySelector(`[data-id="${CSS.escape(docId)}"]`);
    if (!card) return;
    if (card.querySelector('.pt-doc-unavail')) return;
    const notice = document.createElement('div');
    notice.className = 'pt-doc-unavail';
    notice.textContent = t('patient.media.doc_unavailable');
    card.appendChild(notice);
  };

  // Ask about this — prepares a prefilled prompt and navigates to patient Messages
  window._ptAskAbout = function(docId, title) {
    const prompt = 'Explain "' + title + '" in simple language. What does this report mean for me?';
    window._ptPendingAsk = prompt;
    const anchor = el.querySelector('#pt-docs-ask-anchor');
    if (!anchor) return;
    anchor.innerHTML = `
      <div class="pt-doc-ask-toast" role="status">
        <span class="pt-doc-ask-toast-msg">Your question is ready about: <em>${esc(title)}</em></span>
        <button class="pt-doc-ask-toast-btn" onclick="window._navPatient('patient-messages')">Go to Messages →</button>
        <button class="pt-doc-ask-toast-close" aria-label="Dismiss"
                onclick="document.querySelector('#pt-docs-ask-anchor').innerHTML=''">&#10005;</button>
      </div>`;
    anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Expand hidden overflow cards inside a category section
  window._ptCatShowMore = function(catId, _total) {
    const more = el.querySelector('#pt-cat-more-' + catId);
    const btn  = el.querySelector('#pt-cat-show-btn-' + catId);
    if (more) more.removeAttribute('hidden');
    if (btn)  btn.remove();
  };
}

// \u2500\u2500 Messages \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function pgPatientMessages() {
  setTopbar(t('patient.messages.title'));

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // ── Safe HTML escaper ────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  // ── Fetch messages and course context ────────────────────────────────────
  let messagesRaw, coursesRaw;
  try {
    [messagesRaw, coursesRaw] = await Promise.all([
      api.patientPortalMessages().catch(() => null),
      api.patientPortalCourses().catch(() => null),
    ]);
  } catch (_e) {
    messagesRaw = null;
    coursesRaw  = null;
  }

  const rawMessages = Array.isArray(messagesRaw) ? messagesRaw : [];
  const courses     = Array.isArray(coursesRaw)  ? coursesRaw  : [];
  const activeCourse = courses.find(c => c.status === 'active') || courses[0] || null;

  // ── Message category metadata ────────────────────────────────────────────
  // Extension point: add categories here as the backend supports them.
  // category_key maps to compose form <select> values and thread labels.
  const MSG_CATEGORIES = [
    { key: 'treatment-plan', label: t('patient.msg.cat.treatment_plan'), icon: '&#9678;' },
    { key: 'session',        label: t('patient.msg.cat.session'),        icon: '&#9671;' },
    { key: 'side-effects',   label: t('patient.msg.cat.side_effects'),   icon: '&#9680;' },
    { key: 'documents',      label: t('patient.msg.cat.documents'),      icon: '&#9649;' },
    { key: 'billing',        label: t('patient.msg.cat.billing'),        icon: '&#9643;' },
    { key: 'other',          label: t('patient.msg.cat.other'),          icon: '&#9672;' },
  ];
  const catByKey = {};
  MSG_CATEGORIES.forEach(c => { catByKey[c.key] = c; });

  function catMeta(key) {
    return catByKey[(key || '').toLowerCase()] || catByKey['other'];
  }

  // ── Priority helpers ─────────────────────────────────────────────────────
  function isUrgent(m) {
    return (m.priority || '').toLowerCase() === 'urgent';
  }

  // ── Thread grouping ──────────────────────────────────────────────────────
  // Group flat messages by thread_id if present, otherwise by subject,
  // otherwise each message is its own thread.
  // Extension point: backend can supply thread_id to properly group replies.
  const threadMap = new Map();
  rawMessages
    .slice()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .forEach(m => {
      const key = m.thread_id || m.subject || m.id || String(Math.random());
      if (!threadMap.has(key)) {
        threadMap.set(key, { key, messages: [], unreadCount: 0 });
      }
      const thread = threadMap.get(key);
      thread.messages.push(m);
      if (m.is_read === false || m.read === false || m.unread === true) {
        thread.unreadCount++;
      }
    });

  // Derive thread-level metadata from most-recent message
  const threads = [...threadMap.values()].map(t => {
    const latest  = t.messages[t.messages.length - 1];
    const first   = t.messages[0];
    const fromClinician = t.messages.filter(m => (m.sender_type || '').toLowerCase() !== 'patient');
    const lastIncoming  = fromClinician[fromClinician.length - 1] || null;
    return {
      key:          t.key,
      messages:     t.messages,
      unreadCount:  t.unreadCount,
      subject:      esc(first.subject || first.category_label || 'Message from your clinic'),
      latestBody:   latest.body || latest.message || latest.text || '',
      latestDate:   latest.created_at || latest.sent_at,
      latestSender: lastIncoming
        ? (lastIncoming.sender_name || lastIncoming.sender?.display_name || 'Care Team')
        : (first.sender_name || 'Care Team'),
      category:     first.category || null,
      priority:     latest.priority || first.priority || null,
      courseRef:    activeCourse ? { title: activeCourse.condition_name || activeCourse.protocol_name || 'Your treatment' } : null,
    };
  }).sort((a, b) => new Date(b.latestDate || 0) - new Date(a.latestDate || 0));

  // ── Message bubble HTML ──────────────────────────────────────────────────
  // Extension point: pass { showAttachments: true } when attachment support is added.
  function bubbleHTML(m, uid) {
    const isOutgoing = m.sender_id === uid || (m.sender_type || '').toLowerCase() === 'patient';
    const body       = esc(m.body || m.message || m.text || '');
    const rel        = fmtRelative(m.created_at || m.sent_at);
    const fullDate   = fmtDate(m.created_at || m.sent_at);
    const senderName = esc(m.sender_name || m.sender?.display_name || (isOutgoing ? 'You' : 'Care Team'));
    const urgent     = isUrgent(m);

    if (isOutgoing) {
      return `
        <div class="pt-msg-bubble-row pt-msg-row-out">
          <div class="pt-msg-bubble pt-msg-bubble-out">
            <div class="pt-msg-bubble-body">${body}</div>
            <div class="pt-msg-bubble-meta pt-msg-meta-out" title="${esc(fullDate)}">${esc(rel)}</div>
          </div>
          <div class="pt-msg-avatar pt-msg-avatar-you" aria-hidden="true">You</div>
        </div>`;
    }

    const initials = (senderName || '').replace(/&[^;]+;/g, '').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'CT';
    return `
      <div class="pt-msg-bubble-row pt-msg-row-in${urgent ? ' pt-msg-row-urgent' : ''}">
        <div class="pt-msg-avatar pt-msg-avatar-clinic" aria-hidden="true">${initials}</div>
        <div class="pt-msg-bubble pt-msg-bubble-in${urgent ? ' pt-msg-bubble-urgent' : ''}">
          <div class="pt-msg-sender-name">${senderName}</div>
          <div class="pt-msg-bubble-body">${body}</div>
          <div class="pt-msg-bubble-meta" title="${esc(fullDate)}">${esc(rel)}</div>
        </div>
      </div>`;
  }

  // ── Thread card HTML (list view) ─────────────────────────────────────────
  function threadCardHTML(th, idx) {
    const preview  = esc((th.latestBody || '').slice(0, 100).trim());
    const date     = fmtRelative(th.latestDate);
    const cm       = catMeta(th.category);
    const hasUnread = th.unreadCount > 0;
    const urgentBadge = (th.priority || '').toLowerCase() === 'urgent'
      ? `<span class="pt-msg-urgent-badge">Urgent</span>`
      : '';
    const unreadDot = hasUnread
      ? `<span class="pt-msg-unread-dot" aria-label="${th.unreadCount} unread"></span>`
      : '';
    const catBadge = th.category
      ? `<span class="pt-msg-cat-badge">${esc(cm.label)}</span>`
      : '';
    const courseChip = th.courseRef
      ? `<span class="pt-msg-ctx-chip">${esc(th.courseRef.title)}</span>`
      : '';

    return `
      <div class="pt-msg-thread-card${hasUnread ? ' pt-msg-thread-unread' : ''}"
           role="button" tabindex="0"
           aria-label="Message thread: ${th.subject}${hasUnread ? ', ' + th.unreadCount + ' unread' : ''}"
           data-thread-idx="${idx}"
           onclick="window._ptOpenThread(${idx})"
           onkeydown="if(event.key==='Enter'||event.key===' ')window._ptOpenThread(${idx})">
        <div class="pt-msg-thread-top">
          <div class="pt-msg-thread-who">
            <span class="pt-msg-thread-sender">${esc(th.latestSender)}</span>
            ${urgentBadge}
            ${unreadDot}
          </div>
          <span class="pt-msg-thread-date">${esc(date)}</span>
        </div>
        <div class="pt-msg-thread-subject">${esc(th.subject || '')}</div>
        <div class="pt-msg-thread-preview">${preview || '<em>No content</em>'}${th.messages.length > 1 ? ` <span class="pt-msg-reply-count">${th.messages.length} messages</span>` : ''}</div>
        <div class="pt-msg-thread-chips">${catBadge}${courseChip}</div>
      </div>`;
  }

  // ── Thread detail HTML ───────────────────────────────────────────────────
  function threadDetailHTML(th, uid) {
    const cm     = catMeta(th.category);
    const urgent = (th.priority || '').toLowerCase() === 'urgent';
    const contextBanner = th.courseRef
      ? `<div class="pt-msg-ctx-banner">
           <span class="pt-msg-ctx-banner-ico" aria-hidden="true">&#9678;</span>
           Re: ${esc(th.courseRef.title)}
         </div>`
      : '';
    const urgentBanner = urgent
      ? `<div class="pt-msg-urgent-banner">
           <strong>Urgent message</strong> \u2014 your care team has marked this as urgent.
           If you are in immediate distress please call your clinic or emergency services.
         </div>`
      : '';
    const bubbles = th.messages.length > 0
      ? th.messages.map(m => bubbleHTML(m, uid)).join('')
      : `<div class="pt-msg-thread-empty">No messages in this thread yet.</div>`;

    return `
      <div class="pt-msg-detail-wrap">
        <button class="pt-msg-back-btn"
                onclick="window._ptCloseThread()"
                aria-label="Back to message list">
          \u2190 Back to messages
        </button>
        <div class="pt-msg-detail-header">
          <div class="pt-msg-detail-subject">${esc(th.subject || '')}</div>
          ${th.category ? `<span class="pt-msg-cat-badge pt-msg-cat-badge-lg">${esc(cm.icon)} ${esc(cm.label)}</span>` : ''}
        </div>
        ${urgentBanner}
        ${contextBanner}
        <div class="pt-msg-thread-body" id="pt-msg-thread-body">
          ${bubbles}
        </div>
        <div class="pt-msg-reply-wrap">
          <div class="pt-msg-reply-label">Reply</div>
          <textarea id="pt-msg-reply-input" class="form-control pt-msg-reply-input"
                    rows="3" placeholder="Type your reply\u2026"
                    aria-label="Reply to this message thread"></textarea>
          <div class="pt-msg-reply-footer">
            <span class="pt-msg-reply-hint">Your care team will respond within 1\u20132 business days.</span>
            <button class="btn btn-primary btn-sm"
                    id="pt-msg-reply-btn"
                    onclick="window._ptSendReply('${esc(th.key)}')">Send Reply \u2192</button>
          </div>
          <div id="pt-msg-reply-status" class="pt-msg-send-status" hidden></div>
        </div>
      </div>`;
  }

  // ── New message form HTML ────────────────────────────────────────────────
  function newMsgFormHTML() {
    const categoryOptions = MSG_CATEGORIES.map(c =>
      `<option value="${esc(c.key)}">${esc(c.label)}</option>`
    ).join('');
    const courseOption = activeCourse
      ? `<option value="${esc(activeCourse.id)}">${esc(activeCourse.condition_name || activeCourse.protocol_name || 'Your treatment')}</option>`
      : '';

    return `
      <div class="pt-msg-compose" id="pt-msg-compose">
        <div class="pt-docs-section-hd" style="margin-bottom:12px">
          <span class="pt-docs-section-title">${t('patient.messages.new')}</span>
        </div>
        <div class="pt-msg-compose-body">
          <div class="form-group">
            <label class="form-label" for="pt-msg-category">${t('patient.msg.compose.topic_label')}</label>
            <select id="pt-msg-category" class="form-control" aria-required="true">
              <option value="">${t('patient.msg.compose.topic_placeholder')}</option>
              ${categoryOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="pt-msg-subject">${t('patient.msg.compose.subject_label')}</label>
            <input id="pt-msg-subject" class="form-control"
                   type="text" maxlength="120"
                   placeholder="${t('patient.msg.compose.subject_placeholder')}"
                   aria-required="true">
          </div>
          <div class="form-group">
            <label class="form-label" for="pt-msg-body">${t('patient.msg.compose.body_label')}</label>
            <textarea id="pt-msg-body" class="form-control"
                      rows="4" maxlength="2000"
                      placeholder="${t('patient.msg.compose.body_placeholder')}"
                      aria-required="true"></textarea>
          </div>
          <div class="pt-msg-compose-footer">
            <span class="pt-msg-compose-hint">${t('patient.msg.compose.hint')}</span>
            <button class="btn btn-primary btn-sm" id="pt-msg-send-btn"
                    onclick="window._ptSendNewMessage()">${t('patient.msg.compose.send')} \u2192</button>
          </div>
          <div id="pt-msg-send-status" class="pt-msg-send-status" hidden></div>
        </div>
      </div>`;
  }

  // ── Care team contacts HTML ──────────────────────────────────────────────
  // Extension point: populate from api.patientPortalMe() or a dedicated
  // /patient-portal/care-team endpoint when that becomes available.
  function careTeamHTML() {
    const teamMembers = [];
    if (activeCourse?.primary_clinician_name) {
      teamMembers.push({
        name: activeCourse.primary_clinician_name,
        role: activeCourse.primary_clinician_role || 'Clinician',
      });
    }

    const memberCards = teamMembers.length > 0
      ? teamMembers.map(m => `
          <div class="pt-msg-contact-card">
            <div class="pt-msg-contact-avatar" aria-hidden="true">
              ${esc(m.name.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase())}
            </div>
            <div class="pt-msg-contact-info">
              <div class="pt-msg-contact-name">${esc(m.name)}</div>
              <div class="pt-msg-contact-role">${esc(m.role)}</div>
            </div>
          </div>`).join('')
      : `<div class="pt-msg-contact-placeholder">
           Your care team information will appear here once your treatment is underway.
         </div>`;

    return `
      <div class="pt-msg-care-team">
        <div class="pt-docs-section-hd" style="margin-bottom:12px">
          <span class="pt-docs-section-title">${t('patient.msg.care_team_title')}</span>
        </div>
        ${memberCards}
      </div>`;
  }

  // ── Guidance box HTML ────────────────────────────────────────────────────
  function guidanceHTML() {
    return `
      <div class="pt-msg-guidance">
        <div class="pt-msg-guidance-row">
          <span class="pt-msg-guidance-ico" aria-hidden="true">&#9678;</span>
          <span><strong>Response time:</strong> Your care team aims to reply within 1\u20132 business days. Messages sent after hours or on weekends will be seen on the next working day.</span>
        </div>
        <div class="pt-msg-guidance-row">
          <span class="pt-msg-guidance-ico pt-msg-guidance-ico-warn" aria-hidden="true">&#9650;</span>
          <span><strong>Not for emergencies.</strong> This messaging system is for non-urgent questions only. If you are experiencing a medical emergency, call 000 or go to your nearest emergency department.</span>
        </div>
        <div class="pt-msg-guidance-row">
          <span class="pt-msg-guidance-ico" aria-hidden="true">&#128222;</span>
          <span><strong>Need to speak to someone sooner?</strong> Call your clinic directly during business hours.</span>
        </div>
      </div>`;
  }

  // ── Page state: load error with messages unavailable ────────────────────
  // Still shows compose + guidance even when messages fail to load.
  const loadFailed = messagesRaw === null;

  // ── Render full page ─────────────────────────────────────────────────────
  const uid = currentUser?.id;

  const threadListHTML = !loadFailed
    ? (threads.length > 0
        ? threads.map((th, i) => threadCardHTML(th, i)).join('')
        : `<div class="pt-msg-empty">
             <div class="pt-msg-empty-ico" aria-hidden="true">&#9643;</div>
             <div class="pt-msg-empty-title">No messages yet</div>
             <div class="pt-msg-empty-body">When your care team sends you a message, or you send one below, it will appear here.</div>
           </div>`)
    : `<div class="pt-msg-load-error">
         <span class="pt-msg-load-error-ico" aria-hidden="true">&#9680;</span>
         ${t('patient.msg.load_error')}
         <button class="btn btn-ghost btn-sm" style="margin-left:10px;margin-top:6px"
                 onclick="window._navPatient('patient-messages')">${t('common.retry')} \u2192</button>
       </div>`;

  el.innerHTML = `
    <div class="pt-msg-wrap" id="pt-msg-wrap">
      ${guidanceHTML()}

      <div class="pt-msg-section" id="pt-msg-list-section">
        <div class="pt-docs-section-hd" style="margin-bottom:10px">
          <span class="pt-docs-section-title">${t('patient.messages.title')}</span>
          ${threads.length > 0 ? `<span class="pt-docs-section-count">${threads.length === 1 ? t('patient.msg.thread_count_one') : t('patient.msg.thread_count', { n: threads.length })}</span>` : ''}
        </div>
        <div id="pt-msg-thread-list">${threadListHTML}</div>
      </div>

      <div id="pt-msg-thread-detail" hidden></div>

      ${newMsgFormHTML()}

      ${careTeamHTML()}
    </div>`;

  // ── Pre-fill compose from "Ask about this" CTA on Reports page ─────────
  if (window._ptPendingAsk) {
    const pendingPrompt = window._ptPendingAsk;
    window._ptPendingAsk = null;
    // Give the DOM a tick to settle before filling + scrolling
    setTimeout(() => {
      const catSel  = el.querySelector('#pt-msg-category');
      const subjInp = el.querySelector('#pt-msg-subject');
      const bodyTA  = el.querySelector('#pt-msg-body');
      const compose = el.querySelector('#pt-msg-compose');
      if (catSel)  catSel.value  = 'documents';
      if (subjInp && !subjInp.value) subjInp.value = 'Question about my report';
      if (bodyTA)  { bodyTA.value = pendingPrompt; bodyTA.focus(); }
      if (compose) compose.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  // Open a thread and show detail view
  window._ptOpenThread = function(idx) {
    const th  = threads[idx];
    if (!th) return;
    const listSection   = el.querySelector('#pt-msg-list-section');
    const detailSection = el.querySelector('#pt-msg-thread-detail');
    if (!listSection || !detailSection) return;
    detailSection.innerHTML = threadDetailHTML(th, uid);
    detailSection.removeAttribute('hidden');
    listSection.setAttribute('hidden', '');
    // Scroll to top of detail
    detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Close thread detail and return to list
  window._ptCloseThread = function() {
    const listSection   = el.querySelector('#pt-msg-list-section');
    const detailSection = el.querySelector('#pt-msg-thread-detail');
    if (!listSection || !detailSection) return;
    detailSection.setAttribute('hidden', '');
    detailSection.innerHTML = '';
    listSection.removeAttribute('hidden');
  };

  // Send a reply to an existing thread
  window._ptSendReply = async function(threadKey) {
    const input  = el.querySelector('#pt-msg-reply-input');
    const btn    = el.querySelector('#pt-msg-reply-btn');
    const status = el.querySelector('#pt-msg-reply-status');
    if (!input) return;
    const text = input.value.trim();
    if (!text) { input.focus(); return; }

    if (btn) { btn.disabled = true; btn.textContent = t('patient.msg.sending'); }

    try {
      // Extension point: include thread_id when backend supports threaded replies.
      await api.patientPortalSendMessage({
        thread_id: threadKey,
        body:      text,
        category:  threads.find(th => th.key === threadKey)?.category || null,
      });
      input.value = '';
      if (status) {
        status.removeAttribute('hidden');
        status.className = 'pt-msg-send-status pt-msg-send-ok';
        status.textContent = t('patient.msg.reply_sent');
      }
      if (btn) { btn.disabled = false; btn.textContent = t('patient.msg.send_reply'); }
    } catch (_e) {
      if (status) {
        status.removeAttribute('hidden');
        status.className = 'pt-msg-send-status pt-msg-send-fail';
        status.textContent = t('patient.msg.reply_failed');
      }
      if (btn) { btn.disabled = false; btn.textContent = t('patient.msg.send_reply'); }
    }
  };

  // Send a new message (new thread)
  window._ptSendNewMessage = async function() {
    const catEl  = el.querySelector('#pt-msg-category');
    const subjEl = el.querySelector('#pt-msg-subject');
    const bodyEl = el.querySelector('#pt-msg-body');
    const btn    = el.querySelector('#pt-msg-send-btn');
    const status = el.querySelector('#pt-msg-send-status');

    const category = catEl?.value || '';
    const subject  = subjEl?.value.trim() || '';
    const body     = bodyEl?.value.trim() || '';

    // Validate — show inline error and focus the offending field
    function _showComposeErr(fieldEl, msg) {
      if (status) {
        status.removeAttribute('hidden');
        status.className = 'pt-msg-send-status pt-msg-send-fail';
        status.textContent = msg;
      }
      fieldEl?.focus();
    }
    if (!category) { _showComposeErr(catEl, t('patient.msg.err.select_topic')); return; }
    if (!subject)  { _showComposeErr(subjEl, t('patient.msg.err.enter_subject')); return; }
    if (!body)     { _showComposeErr(bodyEl, t('patient.msg.err.enter_message')); return; }

    if (btn) { btn.disabled = true; btn.textContent = t('patient.msg.sending'); }

    try {
      // Extension point: add attachment_ids[], course_id, session_id as backend supports them.
      await api.patientPortalSendMessage({
        category,
        subject,
        body,
        course_id: activeCourse?.id || null,
      });
      // Confirmation state: replace compose form body with success notice
      const compose = el.querySelector('#pt-msg-compose');
      if (compose) {
        compose.innerHTML = `
          <div class="pt-docs-section-hd" style="margin-bottom:12px">
            <span class="pt-docs-section-title">${t('patient.messages.new')}</span>
          </div>
          <div class="pt-msg-sent-confirm">
            <div class="pt-msg-sent-ico" aria-hidden="true">&#10003;</div>
            <div class="pt-msg-sent-title">${t('patient.msg.sent.title')}</div>
            <div class="pt-msg-sent-body">${t('patient.msg.sent.body')}</div>
            <button class="btn btn-ghost btn-sm" style="margin-top:14px"
                    onclick="window._navPatient('patient-messages')">${t('patient.msg.sent.again')} \u2192</button>
          </div>`;
      }
    } catch (_e) {
      if (status) {
        status.removeAttribute('hidden');
        status.className = 'pt-msg-send-status pt-msg-send-fail';
        status.textContent = t('patient.msg.send_failed');
      }
      if (btn) { btn.disabled = false; btn.textContent = t('patient.msg.compose.send') + ' \u2192'; }
    }
  };
}

// ── Profile & Settings ────────────────────────────────────────────────────────
export async function pgPatientProfile(user) {
  setTopbar(t('patient.nav.profile'));

  function renderProfile(u) {
    function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
    const initials = (u?.display_name || '?').slice(0, 2).toUpperCase();
    document.getElementById('patient-content').innerHTML = `
      <div class="g2">
        <div>
          <div class="card">
            <div class="card-header">
              <h3>${t('patient.profile.title')}</h3>
              <button class="btn btn-ghost btn-sm" id="pt-profile-refresh-btn" onclick="window._ptRefreshProfile()">↻ Refresh</button>
            </div>
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
                <div class="avatar" style="width:52px;height:52px;font-size:18px;background:linear-gradient(135deg,var(--blue-dim),var(--violet))">${initials}</div>
                <div>
                  <div style="font-size:14px;font-weight:600;color:var(--text-primary)" id="pt-profile-name">${esc(u?.display_name) || 'Patient'}</div>
                  <div style="font-size:12px;color:var(--text-tertiary)" id="pt-profile-email">${esc(u?.email)}</div>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">${t('patient.profile.full_name')}</label>
                <input class="form-control" id="pt-profile-name-input" value="${esc(u?.display_name)}" readonly style="opacity:0.7">
              </div>
              <div class="form-group">
                <label class="form-label">${t('patient.profile.email')}</label>
                <input class="form-control" id="pt-profile-email-input" value="${esc(u?.email)}" readonly style="opacity:0.7">
              </div>
              <div id="pt-profile-refresh-notice" style="display:none;margin-top:8px"></div>
              <div class="notice notice-info" style="font-size:11.5px;margin-top:4px">
                ${t('patient.profile.edit_notice')}
              </div>
            </div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-header"><h3>${t('patient.profile.notif_prefs')}</h3></div>
            <div class="card-body">
              ${[
                [t('patient.profile.notif.session_rem'),  t('patient.profile.notif.val_email_sms')],
                [t('patient.profile.notif.assess_rem'),   t('patient.profile.notif.val_email')],
                [t('patient.profile.notif.report_notif'), t('patient.profile.notif.val_email')],
                [t('patient.profile.notif.language'),     getLocale() === 'tr' ? 'Türkçe' : 'English'],
              ].map(([k, v]) => `
                <div class="field-row">
                  <span>${k}</span>
                  <span style="color:var(--blue)">${v}</span>
                </div>
              `).join('')}
              <button class="btn btn-ghost btn-sm" style="margin-top:12px;opacity:0.5;cursor:not-allowed" disabled
                      title="${t('patient.profile.coming_soon_tip')}" aria-label="${t('patient.profile.update_prefs')} — ${t('patient.profile.coming_soon_tip')}">
                ${t('patient.profile.update_prefs')}
              </button>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:5px">${t('patient.profile.coming_soon_tip')}</div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>${t('patient.profile.account')}</h3></div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-ghost btn-sm" style="opacity:0.5;cursor:not-allowed" disabled
                      title="${t('patient.profile.change_pw_tip')}" aria-label="${t('patient.profile.change_pw')} — ${t('patient.profile.change_pw_tip')}">
                ${t('patient.profile.change_pw')}
              </button>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;margin-bottom:6px">${t('patient.profile.change_pw_tip')}</div>
              <button class="btn btn-danger btn-sm" onclick="window.doLogout()">${t('patient.profile.sign_out')}</button>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>${t('patient.profile.caregiver_access')}</h3></div>
            <div class="card-body">
              <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65;margin-bottom:12px">
                ${t('patient.profile.caregiver_desc')}
              </div>
              <div class="notice notice-info" style="font-size:11.5px;margin-bottom:12px">
                ${t('patient.profile.caregiver_notice')}
              </div>
              <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">
                ${t('patient.profile.caregiver_request')}
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

// ── Treatment Tasks Page ──────────────────────────────────────────────────────
//
// Replaces the old wellness check-in page. The daily check-in is now a task
// card that launches inline. This page is the single place patients come to
// complete between-session work that supports their treatment.
//
// ── Task enrichment catalog ──────────────────────────────────────────────────
const _TASK_CAT_META = {
  'breathing':      { icon: '🫁', color: '#2dd4bf', label: 'Breathing' },
  'movement':       { icon: '🏃', color: '#60a5fa', label: 'Movement' },
  'journaling':     { icon: '📓', color: '#a78bfa', label: 'Journaling' },
  'screen-free':    { icon: '📵', color: '#fbbf24', label: 'Screen-Free' },
  'social':         { icon: '👥', color: '#fb7185', label: 'Social' },
  'session-prep':   { icon: '📋', color: '#34d399', label: 'Session Prep' },
  'assessment':     { icon: '📊', color: '#f59e0b', label: 'Assessment' },
  'home-practice':  { icon: '🧠', color: '#818cf8', label: 'Home Practice' },
  'relaxation':     { icon: '🧘', color: '#2dd4bf', label: 'Relaxation' },
  'audio-video':    { icon: '🎧', color: '#e879f9', label: 'Audio / Video' },
  'aftercare':      { icon: '💊', color: '#f97316', label: 'Aftercare' },
  'caregiver':      { icon: '🤝', color: '#94a3b8', label: 'Caregiver' },
  'custom':         { icon: '✦',  color: '#94a3b8', label: 'Task' },
};

const _TASK_ENRICHMENT = {
  ptask1: {
    why: 'Regulates your nervous system. Consistent breathwork amplifies neurofeedback outcomes.',
    durationMin: 5, launcher: 'breathing', assignedBy: 'Your clinician',
  },
  ptask2: {
    why: 'Mood tracking gives your clinician a clear picture of how you respond between sessions.',
    durationMin: 5, launcher: 'journal', assignedBy: 'Your clinician',
  },
  ptask3: {
    why: 'Physical activity supports neuroplasticity and improves how your brain responds to protocol.',
    durationMin: 30, launcher: null, assignedBy: 'Your clinician',
  },
  ptask4: {
    why: 'Sleep quality directly affects how your nervous system consolidates treatment progress.',
    durationMin: 60, launcher: null, assignedBy: 'Your clinician',
  },
  'pt-daily-checkin': {
    why: 'Your daily check-in helps your care team monitor how you are feeling and adjust care.',
    durationMin: 3, launcher: 'checkin', assignedBy: 'Your care team',
  },
};

function _tasksGetEnriched() {
  const raw = _pttGetTasks();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Inject the daily check-in as a first-class task if not already done today
  const checkinDone = _pttIsComplete('pt-daily-checkin', today);
  const checkinTask = {
    id: 'pt-daily-checkin',
    title: 'Daily Check-in',
    category: 'assessment',
    recurrence: 'daily',
    dueDate: today,
    notes: 'Mood, sleep and energy — takes about 3 minutes.',
  };

  const allRaw = [checkinTask, ...raw];
  return allRaw.map(function(t) {
    const enrich = _TASK_ENRICHMENT[t.id] || {};
    const cat = _TASK_CAT_META[t.category] || _TASK_CAT_META['custom'];
    const isDue = t.recurrence === 'daily' || t.dueDate <= today;
    const isOverdue = !_pttIsComplete(t.id, today) && t.dueDate < today && t.recurrence !== 'daily';
    // Determine display label for due date
    let dueDateLabel = '';
    if (t.dueDate === today)     dueDateLabel = 'Due today';
    else if (t.dueDate === yesterday) dueDateLabel = 'Yesterday';
    else if (t.dueDate < today)  dueDateLabel = 'Overdue';
    else {
      const d = new Date(t.dueDate + 'T00:00:00');
      dueDateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return Object.assign({}, t, enrich, {
      cat: cat,
      isDueToday: isDue,
      isOverdue: isOverdue,
      dueDateLabel: dueDateLabel,
    });
  });
}

function _taskRenderCard(task, today, opts) {
  opts = opts || {};
  const done = _pttIsComplete(task.id, today);
  const cat = task.cat || _TASK_CAT_META['custom'];
  const overdue = task.isOverdue;
  const catBg = cat.color + '18';

  const ctaHTML = done
    ? '<span class="pt-tasks-cta-done">✓ Done</span>'
    : opts.inProgress
      ? '<button class="pt-tasks-cta-continue" onclick="window._tasksStartTask(\'' + task.id + '\')">Continue</button>'
      : '<button class="pt-tasks-cta-btn" onclick="window._tasksStartTask(\'' + task.id + '\')">Start</button>';

  const careHTML = (task.assignedBy || task.courseName)
    ? '<div class="pt-tasks-care-row">' +
        (task.assignedBy ? '<span class="pt-tasks-care-tag">👤 ' + task.assignedBy + '</span>' : '') +
        (task.courseName ? '<span class="pt-tasks-care-tag" style="margin-left:auto">📋 ' + task.courseName + '</span>' : '') +
      '</div>'
    : '';

  const metaPills = [
    task.durationMin ? '<span class="pt-tasks-meta-pill">⏱ ' + task.durationMin + ' min</span>' : '',
    task.dueDateLabel ? '<span class="pt-tasks-meta-pill' + (overdue ? ' pt-tasks-meta-pill--red' : '') + '">' + task.dueDateLabel + '</span>' : '',
    task.recurrence === 'daily' ? '<span class="pt-tasks-meta-pill">Daily</span>' : '',
  ].filter(Boolean).join('');

  return '<div class="pt-tasks-card' +
      (done ? ' pt-tasks-card--done' : '') +
      (overdue ? ' pt-tasks-card--overdue' : '') +
      (opts.upcoming ? ' pt-tasks-card--upcoming' : '') +
    '" id="pt-task-card-' + task.id + '">' +

    '<div class="pt-tasks-card-left">' +
      '<button class="pt-tasks-check' + (done ? ' pt-tasks-check--done' : '') + '"' +
        ' onclick="window._tasksToggleDone(\'' + task.id + '\')" title="Mark complete">' +
        (done ? '✓' : '') +
      '</button>' +
      '<span class="pt-tasks-cat-chip" style="background:' + catBg + ';color:' + cat.color + '">' + cat.icon + '</span>' +
    '</div>' +

    '<div class="pt-tasks-card-body">' +
      '<div class="pt-tasks-card-title' + (done ? ' pt-tasks-card-title--done' : '') + '">' + task.title + '</div>' +
      (task.why ? '<div class="pt-tasks-card-why">' + task.why + '</div>' : '') +
      (metaPills ? '<div class="pt-tasks-card-meta">' + metaPills + '</div>' : '') +
      careHTML +
    '</div>' +

    '<div class="pt-tasks-card-cta">' + ctaHTML + '</div>' +

  '</div>' +
  // Launcher panel placeholder (expanded when Start is clicked)
  '<div id="pt-task-launcher-' + task.id + '" style="display:none;padding:0 0 10px"></div>';
}

export async function pgPatientWellness() {
  setTopbar('My Tasks');
  const uid = currentUser?.patient_id || currentUser?.id;
  const el = document.getElementById('patient-content');
  const todayStr  = new Date().toISOString().slice(0, 10);
  const todayFmt  = new Date().toLocaleDateString(getLocale() === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Build page ──────────────────────────────────────────────────────────────
  function _tasksRenderPage() {
    const tasks      = _tasksGetEnriched();
    const today      = new Date().toISOString().slice(0, 10);
    const overdue    = tasks.filter(function(t) { return t.isOverdue && !_pttIsComplete(t.id, today); });
    const dueToday   = tasks.filter(function(t) { return t.isDueToday && !t.isOverdue; });
    const upcoming   = tasks.filter(function(t) { return !t.isDueToday && !t.isOverdue; });

    const todayDone  = dueToday.filter(function(t) { return _pttIsComplete(t.id, today); }).length;
    const todayTotal = dueToday.length;
    const firstIncomplete = dueToday.find(function(t) { return !_pttIsComplete(t.id, today); });

    const streak     = _pttStreak();
    const weekDays   = _pttWeekCompletions();
    const weekDone   = weekDays.reduce(function(s, d) { return s + d.done; }, 0);
    const weekTotal  = weekDays.reduce(function(s, d) { return s + d.total; }, 0);

    // ── KPI row ─────────────────────────────────────────────────────────────
    const kpiRow = '<div class="pt-tasks-kpi-row">' +

      '<div class="pt-tasks-kpi-card">' +
        '<div class="pt-tasks-kpi-label">Today\'s Tasks</div>' +
        '<div class="pt-tasks-kpi-value">' + todayDone + '<span style="font-size:1rem;opacity:.6">/' + todayTotal + '</span></div>' +
        (todayTotal > 0
          ? '<div style="margin-top:6px;height:4px;border-radius:2px;background:rgba(255,255,255,.07);overflow:hidden">' +
              '<div style="height:100%;width:' + Math.round((todayDone / todayTotal) * 100) + '%;background:#2dd4bf;border-radius:2px;transition:width .4s"></div>' +
            '</div>'
          : '') +
      '</div>' +

      '<div class="pt-tasks-kpi-card">' +
        '<div class="pt-tasks-kpi-label">Best Next Step</div>' +
        (firstIncomplete
          ? '<div style="font-size:0.8rem;font-weight:600;color:var(--text-primary);line-height:1.35;margin:4px 0 8px">' + firstIncomplete.title + '</div>' +
            '<button class="pt-tasks-cta-btn" style="font-size:11px;padding:5px 12px" onclick="window._tasksStartTask(\'' + firstIncomplete.id + '\')">Start →</button>'
          : '<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px">All done for today 🎉</div>') +
      '</div>' +

      '<div class="pt-tasks-kpi-card" style="align-items:center">' +
        '<div class="pt-tasks-kpi-label" style="text-align:center">This Week</div>' +
        _pttRingProgress(weekDone, weekTotal) +
      '</div>' +

    '</div>';

    // ── Overdue section ──────────────────────────────────────────────────────
    const overdueSection = overdue.length
      ? '<div class="pt-tasks-section">' +
          '<div class="pt-tasks-section-title" style="color:#f87171">Overdue</div>' +
          overdue.map(function(task) { return _taskRenderCard(task, today); }).join('') +
        '</div>'
      : '';

    // ── Due today section ────────────────────────────────────────────────────
    const dueTodaySection = '<div class="pt-tasks-section">' +
      '<div class="pt-tasks-section-title">Due Today' +
        (streak > 0 ? '<span class="pt-tasks-streak-pill">🔥 ' + streak + '-day streak</span>' : '') +
      '</div>' +
      (dueToday.length
        ? dueToday.map(function(task) { return _taskRenderCard(task, today); }).join('')
        : '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:0.82rem">Nothing due today — great work!</div>') +
    '</div>';

    // ── Upcoming section ─────────────────────────────────────────────────────
    const upcomingSection = upcoming.length
      ? '<div class="pt-tasks-section">' +
          '<div class="pt-tasks-section-title">Upcoming</div>' +
          upcoming.map(function(task) { return _taskRenderCard(task, today, { upcoming: true }); }).join('') +
        '</div>'
      : '';

    // ── Adherence section ────────────────────────────────────────────────────
    const allDone = Object.keys(_pttGetCompletions()).filter(function(k) { return _pttGetCompletions()[k]; }).length;
    const adherenceSection = '<div class="pt-tasks-section">' +
      '<div class="pt-tasks-section-title">Adherence</div>' +
      '<div class="pt-tasks-heatmap-wrap">' + _pttHeatmapSVG() + '</div>' +
      '<div class="pt-tasks-stats-row">' +
        '<div class="pt-tasks-stat-pill">This week: <span>' + weekDone + '/' + weekTotal + '</span> tasks</div>' +
        '<div class="pt-tasks-stat-pill">All time: <span>' + allDone + '</span> completed</div>' +
        (streak > 0 ? '<div class="pt-tasks-stat-pill">Streak: <span>' + streak + ' days</span></div>' : '') +
      '</div>' +
    '</div>';

    // ── Care Assistant section ───────────────────────────────────────────────
    const assistSection = '<div class="pt-tasks-section">' +
      '<div class="pt-tasks-section-title">Care Assistant</div>' +
      '<div class="pt-tasks-assist-prompts">' +
        '<button class="pt-tasks-assist-btn" onclick="window._tasksAskAI(\'How am I progressing with my treatment plan?\')">How am I progressing?</button>' +
        '<button class="pt-tasks-assist-btn" onclick="window._tasksAskAI(\'What should I focus on between sessions to get the most benefit?\')">What should I focus on?</button>' +
        '<button class="pt-tasks-assist-btn" onclick="window._tasksAskAI(\'I am struggling to complete my tasks. What are some tips?\')">I\'m struggling with tasks</button>' +
        '<button class="pt-tasks-assist-btn" onclick="window._tasksAskAI(\'I have a question about my treatment side effects.\')">Side effect question</button>' +
        '<button class="pt-tasks-assist-btn" onclick="window._tasksAskAI(\'Can you explain why breathing exercises help my treatment?\')">Why does this task help?</button>' +
      '</div>' +
    '</div>';

    return '<div class="pt-tasks-page">' +
      '<div class="pt-tasks-page-date" style="padding:0 16px 12px">' + todayFmt + '</div>' +
      kpiRow +
      overdueSection +
      dueTodaySection +
      upcomingSection +
      adherenceSection +
      assistSection +
    '</div>';
  }

  el.innerHTML = _tasksRenderPage();

  // ── Event handlers ───────────────────────────────────────────────────────────

  window._tasksToggleDone = function(taskId) {
    const today = new Date().toISOString().slice(0, 10);
    if (_pttIsComplete(taskId, today)) return; // already done — no un-done for now
    _pttMarkComplete(taskId, today);
    // Re-render the page in-place
    el.innerHTML = _tasksRenderPage();
  };

  window._tasksStartTask = function(taskId) {
    if (taskId === 'pt-daily-checkin') {
      window._tasksLaunchCheckin();
      return;
    }
    // For other tasks, mark done and re-render
    const today = new Date().toISOString().slice(0, 10);
    _pttMarkComplete(taskId, today);
    el.innerHTML = _tasksRenderPage();
  };

  window._tasksLaunchCheckin = function() {
    const panel = document.getElementById('pt-task-launcher-pt-daily-checkin');
    if (!panel) return;
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

    panel.innerHTML =
      '<div style="background:rgba(255,255,255,.04);border-radius:10px;padding:16px;margin:0 0 8px">' +
        '<div style="font-size:12.5px;font-weight:600;color:var(--text-primary);margin-bottom:14px">Daily Check-in</div>' +

        '<div style="margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:5px">' +
            '<label style="font-size:12px;font-weight:500;color:var(--text-secondary)">Mood</label>' +
            '<span id="ci-mood-val" style="font-size:12px;font-weight:700;color:#2dd4bf">5</span>' +
          '</div>' +
          '<input type="range" id="ci-mood" min="1" max="10" value="5" style="width:100%;accent-color:#2dd4bf" ' +
            'oninput="document.getElementById(\'ci-mood-val\').textContent=this.value">' +
        '</div>' +

        '<div style="margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:5px">' +
            '<label style="font-size:12px;font-weight:500;color:var(--text-secondary)">Sleep Quality</label>' +
            '<span id="ci-sleep-val" style="font-size:12px;font-weight:700;color:#60a5fa">5</span>' +
          '</div>' +
          '<input type="range" id="ci-sleep" min="1" max="10" value="5" style="width:100%;accent-color:#60a5fa" ' +
            'oninput="document.getElementById(\'ci-sleep-val\').textContent=this.value">' +
        '</div>' +

        '<div style="margin-bottom:14px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:5px">' +
            '<label style="font-size:12px;font-weight:500;color:var(--text-secondary)">Energy</label>' +
            '<span id="ci-energy-val" style="font-size:12px;font-weight:700;color:#a78bfa">5</span>' +
          '</div>' +
          '<input type="range" id="ci-energy" min="1" max="10" value="5" style="width:100%;accent-color:#a78bfa" ' +
            'oninput="document.getElementById(\'ci-energy-val\').textContent=this.value">' +
        '</div>' +

        '<div style="margin-bottom:14px">' +
          '<label style="display:block;font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:5px">Any side effects?</label>' +
          '<select id="ci-se" class="form-control" style="font-size:12px">' +
            '<option value="none">None</option>' +
            '<option value="headache">Headache</option>' +
            '<option value="fatigue">Fatigue</option>' +
            '<option value="dizziness">Dizziness</option>' +
            '<option value="tingling">Tingling</option>' +
            '<option value="nausea">Nausea</option>' +
            '<option value="other">Other</option>' +
          '</select>' +
        '</div>' +

        '<div style="margin-bottom:14px">' +
          '<label style="display:block;font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:5px">Notes (optional)</label>' +
          '<textarea id="ci-notes" class="form-control" placeholder="Anything notable today…" ' +
            'style="min-height:60px;resize:vertical;font-size:12px"></textarea>' +
        '</div>' +

        '<button class="btn btn-primary" style="width:100%;font-size:13px" onclick="window._tasksSubmitCheckin()">Submit Check-in</button>' +
      '</div>';

    panel.style.display = 'block';
  };

  window._tasksSubmitCheckin = async function() {
    const mood   = parseInt(document.getElementById('ci-mood')?.value || '5', 10);
    const sleep  = parseInt(document.getElementById('ci-sleep')?.value || '5', 10);
    const energy = parseInt(document.getElementById('ci-energy')?.value || '5', 10);
    const se     = document.getElementById('ci-se')?.value || 'none';
    const notes  = document.getElementById('ci-notes')?.value?.trim() || '';

    try {
      if (uid) {
        await api.submitAssessment(uid, {
          type: 'wellness_checkin', mood, sleep, energy, side_effects: se, notes,
          date: new Date().toISOString(),
        });
      }
    } catch (_e) { /* non-fatal */ }

    const today = new Date().toISOString().slice(0, 10);
    _pttMarkComplete('pt-daily-checkin', today);
    localStorage.setItem('ds_last_checkin', today);

    el.innerHTML = _tasksRenderPage();
  };

  window._tasksAskAI = function(prompt) {
    if (typeof window._navPatient === 'function') {
      window._navPatient('ai-agents');
      // Give the page a moment to render then prefill the prompt
      setTimeout(function() {
        const inp = document.getElementById('pt-ai-input') || document.querySelector('.pt-ai-input');
        if (inp) { inp.value = prompt; inp.focus(); }
      }, 300);
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
  setTopbar(t('patient.nav.learn'));
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
      return `<div class="pt-portal-empty">
        <div class="pt-portal-empty-ico" aria-hidden="true">&#128196;</div>
        <div class="pt-portal-empty-title">No articles found</div>
        <div class="pt-portal-empty-body">Try a different search term or browse all categories.</div>
      </div>`;
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
  const isForm = opts.body instanceof FormData;

  function _buildHeaders(token) {
    const h = { ...(opts.headers || {}) };
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (!isForm) h['Content-Type'] = 'application/json';
    return h;
  }

  async function _doFetch(token) {
    return fetch(`${_MEDIA_BASE}${path}`, { ...opts, headers: _buildHeaders(token) });
  }

  let res = await _doFetch(api.getToken());

  // Mirror apiFetch: on 401, attempt one token refresh then retry
  if (res.status === 401 && path !== '/api/v1/auth/refresh') {
    try {
      const storedRefresh = localStorage.getItem('ds_refresh_token');
      if (storedRefresh) {
        const refreshRes = await fetch(`${_MEDIA_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: storedRefresh }),
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.access_token) {
            api.setToken(refreshData.access_token);
            if (refreshData.refresh_token) localStorage.setItem('ds_refresh_token', refreshData.refresh_token);
            res = await _doFetch(refreshData.access_token);
          }
        }
      }
    } catch (_refreshErr) { /* fall through to original 401 error */ }
  }

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
  setTopbar(t('patient.nav.consent'));
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

  // consent_type strings MUST match backend validation in media_router.py:
  // "upload_voice" | "upload_text" | "ai_analysis"
  const CONSENT_TYPES = [
    {
      type:        'upload_voice',
      icon:        '🎙',
      title:       'Upload Voice Notes',
      description: 'Record short voice updates about how you\'re feeling, side effects, or treatment questions.',
    },
    {
      type:        'upload_text',
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
  setTopbar(t('patient.nav.updates'));
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

  // consent_type strings match backend: "upload_text" | "upload_voice"
  const hasAnyConsent = isConsentGranted('upload_voice') || isConsentGranted('upload_text');

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

    <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:15px;flex-shrink:0">🚨</span>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6">
        <strong style="color:var(--text-primary)">Not for emergencies.</strong>
        If you are in immediate danger or experiencing a medical emergency, call <strong>000 / 911 / 999</strong> or go to your nearest emergency department. This portal is not monitored in real time.
      </div>
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
    const warnEl    = document.getElementById('pt-upload-consent-warn');

    const activeBorder  = 'border-color:var(--teal);background:rgba(0,212,188,0.04)';
    const inactiveBorder = '';

    if (textCard)  textCard.style.cssText  = `cursor:pointer;${type === 'text'  ? activeBorder : inactiveBorder}`;
    if (voiceCard) voiceCard.style.cssText = `cursor:pointer;${type === 'voice' ? activeBorder : inactiveBorder}`;
    if (textForm)  textForm.style.display  = type === 'text'  ? '' : 'none';
    if (voiceForm) voiceForm.style.display = type === 'voice' ? '' : 'none';

    // Immediate consent check — surface the issue before submit, not on submit
    // consent_type strings match backend: "upload_text" | "upload_voice"
    const consentNeeded = type === 'text' ? 'upload_text' : 'upload_voice';
    if (warnEl) {
      if (!isConsentGranted(consentNeeded)) {
        warnEl.className = 'notice notice-warn';
        warnEl.style.display = '';
        warnEl.innerHTML = `${t(type === 'text' ? 'patient.media.consent_warn_text' : 'patient.media.consent_warn_voice')} <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">${t('patient.media.consent_enable')}</a>`;
      } else {
        warnEl.style.display = 'none';
      }
    }
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
        if (ready) { ready.style.display = ''; ready.textContent = t('patient.media.recording_ready', { dur }); }
      };
      _recordedChunks = [];
      _recordingSeconds = 0;
      _mediaRecorder.start();

      if (btn)   { btn.textContent = '⏹ Stop'; btn.className = 'btn btn-ghost btn-sm'; }
      if (timer) { timer.style.display = ''; timer.textContent = '0:00'; }
      if (ready) ready.style.display = 'none';

      _recordingTimer = setInterval(() => {
        const timerLive = document.getElementById('pt-record-timer');
        if (!timerLive) { clearInterval(_recordingTimer); _recordingTimer = null; return; }
        _recordingSeconds++;
        const m = Math.floor(_recordingSeconds / 60);
        const s = _recordingSeconds % 60;
        timerLive.textContent = `${m}:${String(s).padStart(2, '0')}`;
      }, 1000);
    } catch (_e) {
      const warnEl = document.getElementById('pt-upload-consent-warn');
      if (warnEl) {
        warnEl.className = 'notice notice-error';
        warnEl.style.display = '';
        warnEl.textContent = t('patient.media.err_mic_denied');
      }
    }
  };

  window._ptVoiceFileSelected = function(input) {
    const ready  = document.getElementById('pt-record-ready');
    const warnEl = document.getElementById('pt-upload-consent-warn');
    if (!input.files || !input.files[0]) return;
    const MAX_BYTES = 52428800; // 50 MB — mirrors backend limit
    if (input.files[0].size > MAX_BYTES) {
      input.value = '';
      _recordedBlob = null;
      if (warnEl) { warnEl.className = 'notice notice-error'; warnEl.style.display = ''; warnEl.textContent = t('patient.media.err_file_size'); }
      if (ready) ready.style.display = 'none';
      return;
    }
    _recordedBlob = input.files[0];
    if (warnEl) warnEl.style.display = 'none';
    if (ready) { ready.style.display = ''; ready.textContent = t('patient.media.file_selected', { name: input.files[0].name, size: (input.files[0].size / 1048576).toFixed(1) }); }
  };

  window._ptSubmitUpload = async function() {
    const resultEl = document.getElementById('pt-upload-result');
    const warnEl   = document.getElementById('pt-upload-consent-warn');
    const submitBtn = document.getElementById('pt-upload-submit-btn');

    // Check consent for selected type; strings match backend: "upload_text" | "upload_voice"
    const consentType = _selectedType === 'text' ? 'upload_text' : 'upload_voice';
    if (!isConsentGranted(consentType)) {
      if (warnEl) {
        warnEl.className = 'notice notice-warn';
        warnEl.style.display = '';
        warnEl.innerHTML = `${t(_selectedType === 'text' ? 'patient.media.consent_submit_text' : 'patient.media.consent_submit_voice')} <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">${t('patient.media.consent_enable')}</a>`;
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
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.textContent = t('patient.media.err_no_text'); }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        // consent_type "upload_text" matches backend validation in media_router.py
        const textConsent = consents.find(c => c.consent_type === 'upload_text');
        if (!textConsent?.id) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.innerHTML = `${t('patient.media.consent_submit_text')} <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">${t('patient.media.consent_enable')}</a>`; }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        await _mediaFetch('/api/v1/media/patient/upload/text', {
          method: 'POST',
          body: JSON.stringify({
            text_content:  content,
            course_id:     courseId || undefined,
            patient_note:  noteLabel || undefined,
            consent_id:    textConsent.id,
          }),
        });
      } else {
        // Voice upload via FormData
        if (!_recordedBlob) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.textContent = t('patient.media.err_no_audio'); }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        const courseId  = document.getElementById('upload-voice-course')?.value || null;
        const noteLabel = document.getElementById('upload-voice-note')?.value?.trim() || '';
        // consent_type "upload_voice" matches backend validation in media_router.py
        const voiceConsent = consents.find(c => c.consent_type === 'upload_voice');
        if (!voiceConsent?.id) {
          if (warnEl) { warnEl.className = 'notice notice-warn'; warnEl.style.display = ''; warnEl.innerHTML = `${t('patient.media.consent_submit_voice')} <a href="#" onclick="window._navPatient('pt-media-consent');return false" style="color:var(--teal)">${t('patient.media.consent_enable')}</a>`; }
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Send Update'; }
          return;
        }
        const formData = new FormData();
        formData.append('file', _recordedBlob, 'voice-note.webm');
        if (courseId)  formData.append('course_id',    courseId);
        if (noteLabel) formData.append('patient_note', noteLabel);
        formData.append('consent_id', voiceConsent.id);

        await _mediaFetch('/api/v1/media/patient/upload/audio', {
          method: 'POST',
          body:   formData,
        });
      }

      // Success
      if (resultEl) {
        resultEl.className = 'notice notice-success';
        resultEl.style.display = '';
        resultEl.innerHTML = `
          <div style="font-weight:600;margin-bottom:8px">&#x2713; Update sent successfully.</div>
          <div style="font-size:11.5px;line-height:1.7;margin-bottom:10px">
            <strong>What happens next:</strong><br>
            1. Your care team will review your update — usually within 1&ndash;2 business days.<br>
            2. If approved, it may be analyzed to help prepare your next appointment.<br>
            3. Any feedback from your clinician will appear in your <a href="#" onclick="window._navPatient('pt-media-history');return false" style="color:var(--teal)">Media History</a>.
          </div>
          <a href="#" onclick="window._navPatient('pt-media-history');return false" style="color:var(--teal);font-size:12px">View Media History →</a>`;
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
  setTopbar(t('patient.nav.feedback'));

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
    pending_review:         { label: 'Waiting for Review',   color: '#f59e0b',              bg: 'rgba(245,158,11,0.1)'  },
    approved_for_analysis:  { label: 'Approved — In Queue',  color: 'var(--blue)',          bg: 'rgba(74,158,255,0.1)' },
    analyzing:              { label: 'AI Analysis Running',  color: 'var(--blue)',          bg: 'rgba(74,158,255,0.1)' },
    analyzed:               { label: 'Analyzed',             color: 'var(--teal)',          bg: 'rgba(0,212,188,0.08)' },
    clinician_reviewed:     { label: 'Reviewed by Care Team', color: 'var(--green,#22c55e)', bg: 'rgba(34,197,94,0.08)' },
    rejected:               { label: 'Not Progressed',       color: '#94a3b8',              bg: 'rgba(148,163,184,0.08)' },
    reupload_requested:     { label: 'New Upload Requested',  color: '#f97316',              bg: 'rgba(249,115,22,0.08)' },
  };

  // approved_for_analysis added: upload is already in the AI queue, deleting mid-flight
  // causes an orphaned analysis job. Backend also blocks deletes at clinician_reviewed.
  const NON_DELETABLE = new Set(['clinician_reviewed', 'analyzing', 'approved_for_analysis']);

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
                ${canDelete ? `<button class="btn btn-ghost btn-sm" id="delete-btn-${idx}" style="color:var(--red,#ef4444);border-color:rgba(239,68,68,0.25);font-size:11px"
                        onclick="window._ptDeleteUpload(${idx}, '${u.id || ''}', this)">Delete</button>` : ''}
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
          ${t('patient.media.no_updates')}<br>
          <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="window._navPatient('pt-media-upload')">${t('patient.media.send_first')}</button>
        </div>`;
      return;
    }
    listEl.innerHTML = items.map((u, i) => uploadCardHTML(u, i)).join('');
  }

  el.innerHTML = `
    <div style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;padding:9px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:13px;flex-shrink:0">🚨</span>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">
        <strong style="color:var(--text-primary)">Not for emergencies.</strong>
        If you are in immediate danger or experiencing a medical emergency, call <strong>000 / 911 / 999</strong> or go to your nearest emergency department. This portal is not monitored in real time.
      </div>
    </div>

    ${hasRedFlag ? `
    <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.35);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span style="font-size:18px">⚠</span>
      <div style="font-size:12.5px;color:var(--text-primary);line-height:1.55">
        <strong>Your care team has flagged an item for follow-up.</strong>
        Please contact your clinic — this is not urgent unless your clinician has called you.
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

  window._ptDeleteUpload = async function(idx, uploadId, btnEl) {
    if (!confirm('Delete this upload? This cannot be undone.')) return;
    const id = uploadId || uploads[idx]?.id;
    if (!id) return;
    const card = document.getElementById(`media-card-${idx}`);
    const btn  = btnEl || document.getElementById(`delete-btn-${idx}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
    try {
      await _mediaFetch(`/api/v1/media/patient/upload/${id}`, { method: 'DELETE' });
      uploads = uploads.filter(u => u.id !== id);
      renderList();
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Delete'; }
      if (card) {
        const errMsg = document.createElement('div');
        errMsg.className = 'notice notice-error';
        errMsg.style.cssText = 'font-size:11.5px;margin-top:8px';
        errMsg.textContent = `Could not delete: ${err.message || 'Unknown error'}`;
        card.querySelector('.card-body')?.appendChild(errMsg);
        setTimeout(() => errMsg.remove(), 4000);
      }
    }
  };
}

// Module-level chat state so history survives tab navigation
// ── Devices & Wearables ───────────────────────────────────────────────────────
export async function pgPatientWearables() {
  setTopbar('Devices & Wearables');
  const user = currentUser;
  const uid  = user?.patient_id || user?.id;
  const el   = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // ── Health source definitions ─────────────────────────────────────────────
  const HEALTH_SOURCES = [
    {
      id: 'apple_health', label: 'Apple Health', platform: 'iPhone / iOS',
      icon: '◌', accentVar: '--teal',
      dataUsed: ['Sleep', 'Heart rate', 'HRV', 'Steps', 'Activity'],
      connectNote: 'Opens Apple Health permissions on your iPhone.',
    },
    {
      id: 'android_health', label: 'Android Health Connect', platform: 'Android',
      icon: '◌', accentVar: '--green',
      dataUsed: ['Sleep', 'Heart rate', 'Steps', 'Activity'],
      connectNote: 'Opens Health Connect on your Android phone.',
    },
    {
      id: 'smartwatch', label: 'Smart Watch', platform: 'Any',
      icon: '◌', accentVar: '--blue',
      dataUsed: ['Heart rate', 'HRV', 'Activity', 'Stress'],
      connectNote: "Sync via your phone's health app (Apple Health or Health Connect).",
    },
    {
      id: 'oura', label: 'Oura Ring', platform: 'iOS / Android',
      icon: '◌', accentVar: '--violet',
      dataUsed: ['Sleep stages', 'HRV', 'Resting heart rate', 'Readiness'],
      connectNote: 'Authorise via Oura API — no extra app needed.',
    },
    {
      id: 'fitbit', label: 'Smart Band / Fitbit', platform: 'iOS / Android',
      icon: '◌', accentVar: '--amber',
      dataUsed: ['Sleep', 'Heart rate', 'Steps', 'SpO₂'],
      connectNote: 'Authorise via Fitbit account.',
    },
  ];

  // ── Home therapy device definitions ──────────────────────────────────────
  const HOME_THERAPY_DEVICES = [
    {
      id: 'tdcs',
      label: 'Home tDCS Device',
      category: 'Transcranial Direct Current Stimulation',
      icon: '⊕', accentVar: '--teal',
      what: 'A small device that delivers a very low, safe current to specific areas of the scalp. Used between clinic sessions to maintain treatment benefits.',
      whyMatters: 'Home sessions can extend treatment effects and reduce the number of clinic visits needed.',
      dataShared: ['Session completed (yes/no)', 'Date and time', 'Side effects you report'],
      dataNotShared: ['Current settings (set by clinician only)', 'Your location'],
      troubleshoot: ['Check electrode contacts are moist before use.', 'If you feel sharp discomfort, stop and contact your clinic.', 'Device not powering on? Check the battery or charger.'],
      contactClinic: "Unusual discomfort, tingling that doesn't fade after 5 minutes, or skin irritation.",
    },
    {
      id: 'pbm',
      label: 'Photobiomodulation (PBM)',
      category: 'Near-Infrared / Red Light Therapy',
      icon: '◎', accentVar: '--amber',
      what: 'A helmet or headband that uses near-infrared light to gently stimulate brain metabolism and neuroplasticity.',
      whyMatters: 'PBM supports the effects of clinic-based neuromodulation and improves cognitive energy.',
      dataShared: ['Session completed', 'Date and time', 'How you felt after the session'],
      dataNotShared: ['Light intensity settings', 'Your location'],
      troubleshoot: ['Position the device correctly before starting.', 'Avoid direct eye exposure to the light.', 'If the device feels hot, stop and let it cool.'],
      contactClinic: 'Headaches, visual disturbances, or unusual skin sensitivity.',
    },
    {
      id: 'vns',
      label: 'Vagus Nerve Stimulator (VNS)',
      category: 'Non-Invasive Vagal Stimulation',
      icon: '∿', accentVar: '--blue',
      what: 'A handheld device placed on the neck that delivers gentle pulses to the vagus nerve, supporting mood regulation and stress resilience.',
      whyMatters: 'The vagus nerve connects your brain and body. Stimulating it helps regulate the stress response and supports depression treatment.',
      dataShared: ['Session completed', 'Date and time', 'Side effects reported'],
      dataNotShared: ['Pulse parameters', 'Your location'],
      troubleshoot: ['Ensure the gel pad is correctly applied.', 'If you feel dizziness, reduce session duration.', 'App not connecting? Restart Bluetooth.'],
      contactClinic: 'Persistent neck discomfort, voice changes, or dizziness that does not resolve in a few minutes.',
    },
    {
      id: 'ces',
      label: 'Cranial Electrotherapy Stimulation (CES)',
      category: 'Cranial Electrotherapy',
      icon: '⌁', accentVar: '--violet',
      what: 'A clip-on device worn on the earlobes delivering a very low alternating current to promote relaxation, reduce anxiety, and improve sleep.',
      whyMatters: 'CES supports mood and sleep between clinic sessions. Non-invasive and gentle.',
      dataShared: ['Session completed', 'Date and time', 'Sleep quality after night use'],
      dataNotShared: ['Frequency settings', 'Your location'],
      troubleshoot: ['Ensure ear clips are properly positioned.', 'If you feel contact discomfort, check for skin irritation.', 'Start at the lowest comfortable intensity.'],
      contactClinic: 'Unusual sensations, persistent skin irritation, or dizziness.',
    },
  ];

  // ── XSS helper ───────────────────────────────────────────────────────────
  function esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
  }

  // ── Fetch API data ────────────────────────────────────────────────────────
  const [wearableData, _summaryData] = await Promise.all([
    api.patientPortalWearables().catch(() => null),
    api.patientPortalWearableSummary(7).catch(() => null),
  ]);

  const connections  = wearableData?.connections   || [];
  const recentAlerts = wearableData?.recent_alerts || [];

  // ── LocalStorage: home device assignments + session log ───────────────────
  const homeDevKey  = 'ds_home_devices_'  + (uid || 'demo');
  const homeSessKey = 'ds_home_sessions_' + (uid || 'demo');
  let homeDevices  = [];
  let homeSessions = [];
  try { homeDevices  = JSON.parse(localStorage.getItem(homeDevKey)  || '[]'); } catch (_e) {}
  try { homeSessions = JSON.parse(localStorage.getItem(homeSessKey) || '[]'); } catch (_e) {}

  // Demo seed: assign tDCS if nothing stored
  if (!homeDevices.length) {
    homeDevices = [{
      deviceId: 'tdcs', assigned: true, prescribedFreq: 'Daily (Mon–Fri)',
      status: 'active', monitoredByClinician: true,
      lastSession: new Date(Date.now() - 86400000).toISOString(),
      _isDemoData: true,
    }];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function connFor(id)    { return connections.find(c => c.source === id) || null; }
  function homeDevFor(id) { return homeDevices.find(d => d.deviceId === id) || null; }
  function lastSessFor(id) {
    const all = homeSessions.filter(s => s.deviceId === id);
    return all.length ? all[all.length - 1] : null;
  }

  function syncStatus(conn) {
    if (!conn || conn.status !== 'connected') return 'disconnected';
    if (!conn.last_sync_at) return 'pending';
    const hrs = (Date.now() - new Date(conn.last_sync_at).getTime()) / 3600000;
    return hrs <= 24 ? 'synced' : 'stale';
  }

  function statusPill(s, label) {
    const cfg = {
      synced:       { bg:'rgba(34,197,94,0.12)',  color:'var(--green,#22c55e)',   lbl:label||'Synced' },
      stale:        { bg:'rgba(245,158,11,0.12)', color:'var(--amber,#f59e0b)',  lbl:label||'Sync overdue' },
      disconnected: { bg:'rgba(255,107,107,0.1)', color:'var(--red,#ef4444)',    lbl:label||'Not connected' },
      pending:      { bg:'rgba(245,158,11,0.12)', color:'var(--amber,#f59e0b)',  lbl:label||'Pending' },
      active:       { bg:'rgba(0,212,188,0.12)',  color:'var(--teal,#00d4bc)',   lbl:label||'Active' },
      assigned:     { bg:'rgba(59,130,246,0.12)', color:'var(--blue,#3b82f6)',   lbl:label||'Assigned' },
    };
    const c = cfg[s] || cfg.disconnected;
    return `<span class="pdw-pill" style="background:${c.bg};color:${c.color}"><span class="pdw-pill-dot" style="background:${c.color}"></span>${c.lbl}</span>`;
  }

  // ── Summary counts ────────────────────────────────────────────────────────
  const connectedCount = connections.filter(c => c.status === 'connected').length;
  const assignedCount  = homeDevices.filter(d => d.assigned).length;
  const lastSyncMs     = connections.filter(c => c.last_sync_at)
    .map(c => new Date(c.last_sync_at).getTime()).sort((a,b) => b-a)[0] || null;

  // ── Biometric snapshot ────────────────────────────────────────────────────
  let bio = null;
  try { bio = JSON.parse(localStorage.getItem('ds_wearable_summary') || 'null'); } catch (_e) {}
  if (!bio) bio = { _isDemoData:true, hrv:'42 ms', sleep:'7h 12m', steps:'6,840', rhr:'64 bpm' };

  // Biometric status classification
  function _bioStatus(type, valStr) {
    const n = parseFloat(String(valStr).replace(/[^\d.]/g, ''));
    if (isNaN(n)) return 'grey';
    if (type === 'sleep') return n >= 7 ? 'green' : n >= 5.5 ? 'amber' : 'red';
    if (type === 'hrv')   return n >= 50 ? 'green' : n >= 30  ? 'amber' : 'red';
    if (type === 'rhr')   return n <= 65 ? 'green' : n <= 80  ? 'amber' : 'red';
    if (type === 'steps') return n >= 8000 ? 'green' : n >= 4000 ? 'amber' : 'red';
    return 'grey';
  }
  function _bioLabel(type, status) {
    const ranges = {
      sleep: { green: '7–9 hrs recommended', amber: 'Slightly low', red: 'Below target' },
      hrv:   { green: 'Good recovery', amber: 'Moderate', red: 'Low — check in' },
      rhr:   { green: 'Healthy range', amber: 'Moderate', red: 'Elevated' },
      steps: { green: 'Active day', amber: 'Moderate activity', red: 'Low activity' },
    };
    return (ranges[type] || {})[status] || '';
  }

  // Build 7-day biometric strip from localStorage check-in history
  const _bioWeekDays = (() => {
    const days = [];
    const todayBio = new Date().toISOString().slice(0, 10);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const ds = d.toISOString().slice(0, 10);
      const hasCk = !!localStorage.getItem('ds_checkin_' + ds);
      const isFut = ds > todayBio;
      days.push({
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
        status: isFut ? 'future' : hasCk ? 'done' : 'missed',
        isToday: ds === todayBio,
      });
    }
    return days;
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  el.innerHTML = `
<div class="pdw-wrap">

  <!-- ① CONNECTION SUMMARY BAR -->
  <div class="pdw-summary-bar">
    <div class="pdw-stat">
      <div class="pdw-stat-icon">◌</div>
      <div class="pdw-stat-val">${connectedCount}</div>
      <div class="pdw-stat-lbl">Health source${connectedCount !== 1 ? 's' : ''} connected</div>
    </div>
    <div class="pdw-stat-divider"></div>
    <div class="pdw-stat">
      <div class="pdw-stat-icon">⊕</div>
      <div class="pdw-stat-val">${assignedCount}</div>
      <div class="pdw-stat-lbl">Home therapy device${assignedCount !== 1 ? 's' : ''}</div>
    </div>
    <div class="pdw-stat-divider"></div>
    <div class="pdw-stat">
      <div class="pdw-stat-icon">↻</div>
      <div class="pdw-stat-val">${lastSyncMs ? fmtRelative(new Date(lastSyncMs).toISOString()) : 'Never'}</div>
      <div class="pdw-stat-lbl">Last sync</div>
    </div>
    <div class="pdw-stat-divider"></div>
    <div class="pdw-stat">
      <div class="pdw-stat-icon ${connectedCount > 0 ? 'pdw-stat-ok' : 'pdw-stat-off'}">◎</div>
      <div class="pdw-stat-val ${connectedCount > 0 ? 'pdw-stat-ok' : 'pdw-stat-off'}">${connectedCount > 0 ? 'Active' : 'Inactive'}</div>
      <div class="pdw-stat-lbl">Monitoring</div>
    </div>
  </div>

  ${recentAlerts.length ? `<div class="notice notice-warn" style="font-size:12px"><strong>Sync note:</strong> ${esc(recentAlerts[0].detail||'A recent sync issue was detected.')}</div>` : ''}

  <!-- ② HEALTH SOURCES -->
  <div class="pdw-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">◌</span>Health sources</h3>
      <span class="pdw-section-sub">Connect your phone or wearable to share health data with your care team</span>
    </div>
    <div class="pdw-source-grid">
      ${HEALTH_SOURCES.map(src => {
        const conn    = connFor(src.id);
        const status  = syncStatus(conn);
        const isConn  = status === 'synced' || status === 'stale' || status === 'pending';
        const accent  = `var(${src.accentVar},#00d4bc)`;
        const syncStr = conn?.last_sync_at ? `Last sync ${fmtRelative(conn.last_sync_at)}` : 'Never synced';
        return `
        <div class="pdw-source-card pdw-source-card--${status}" style="${isConn ? `--src-accent:${accent}` : ''}">
          <div class="pdw-source-status-bar" style="background:${isConn ? accent : 'rgba(255,255,255,0.06)'}"></div>
          <div class="pdw-source-inner">
            <div class="pdw-source-top">
              <div class="pdw-source-icon-wrap" style="background:${accent}18;border-color:${accent}30">
                <span class="pdw-source-icon" style="color:${accent}">${src.icon}</span>
              </div>
              <div class="pdw-source-meta">
                <div class="pdw-source-name">${esc(src.label)}</div>
                <div class="pdw-source-platform">${esc(src.platform)}</div>
              </div>
              ${statusPill(status)}
            </div>
            <div class="pdw-source-sync">${isConn ? syncStr : 'Tap Connect to start syncing'}</div>
            <div class="pdw-data-used">
              <span class="pdw-data-label">Data synced:</span>
              ${src.dataUsed.map(d=>`<span class="pdw-data-chip">${esc(d)}</span>`).join('')}
            </div>
            ${!isConn ? `<div class="pdw-source-note">${esc(src.connectNote)}</div>` : ''}
            <div class="pdw-source-actions">
              ${isConn
                ? `<button class="pdw-btn-manage"    onclick="window._pdwManageSource('${src.id}','${conn?.id||''}')">Manage</button>
                   <button class="pdw-btn-reconnect" onclick="window._pdwReconnect('${src.id}')">Reconnect</button>`
                : `<button class="pdw-btn-connect"   onclick="window._pdwConnect('${src.id}')">Connect</button>`}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- ③ HOME THERAPY DEVICES -->
  <div class="pdw-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">⊕</span>Home therapy devices</h3>
      <span class="pdw-section-sub">Devices assigned by your clinic for use between sessions</span>
    </div>
    <div class="pdw-device-list">
      ${HOME_THERAPY_DEVICES.map(dev => {
        const asgn     = homeDevFor(dev.id);
        const lastSess = lastSessFor(dev.id) || (asgn?.lastSession ? { date: asgn.lastSession } : null);
        const devSt    = asgn?.status || 'unassigned';
        const accent   = `var(${dev.accentVar},#00d4bc)`;
        const assigned = asgn?.assigned;
        return `
        <div class="pdw-device-card ${assigned ? 'pdw-device-card--assigned' : ''}" style="${assigned ? `border-left:3px solid ${accent}` : ''}">
          <div class="pdw-device-top">
            <div class="pdw-device-icon" style="color:${accent}">${dev.icon}</div>
            <div class="pdw-device-meta">
              <div class="pdw-device-name">${esc(dev.label)}</div>
              <div class="pdw-device-category">${esc(dev.category)}</div>
            </div>
            ${assigned ? statusPill(devSt, devSt==='active'?'Active':'Assigned') : statusPill('disconnected','Not assigned')}
          </div>
          ${assigned ? `
          <div class="pdw-device-details">
            <div class="pdw-detail-row"><span class="pdw-detail-lbl">Prescribed frequency</span><span class="pdw-detail-val">${esc(asgn.prescribedFreq||'As directed')}</span></div>
            <div class="pdw-detail-row"><span class="pdw-detail-lbl">Last session logged</span><span class="pdw-detail-val">${lastSess ? fmtRelative(lastSess.date||lastSess.completedAt) : 'Not yet logged'}</span></div>
            <div class="pdw-detail-row"><span class="pdw-detail-lbl">Clinician monitoring</span><span class="pdw-detail-val ${asgn.monitoredByClinician?'pdw-monitored-yes':''}">${asgn.monitoredByClinician?'✓ Monitored':'Self-tracking only'}</span></div>
            ${asgn._isDemoData ? '<div class="pdw-demo-badge">Example assignment</div>' : ''}
          </div>
          <div class="pdw-device-actions-wrap">
            <button class="pdw-action-primary-btn" onclick="window._pdwLogSession('${dev.id}')">+ Log Session</button>
            <div class="pdw-action-secondary-row">
              <button class="pdw-action-ghost" onclick="window._pdwViewInstructions('${dev.id}')">Instructions</button>
              <button class="pdw-action-ghost pdw-action-ghost--warn" onclick="window._pdwReportIssue()">Report Issue</button>
              <button class="pdw-action-ghost pdw-action-ghost--ble" disabled title="Coming soon — Bluetooth pairing">◌ Connect</button>
            </div>
          </div>` : `
          <p class="pdw-device-unassigned">Not currently part of your plan. Contact your care team if you have this device.</p>
          <div class="pdw-device-actions"><button class="pdw-action-btn" onclick="window._navPatient('patient-messages')">Ask my clinician</button></div>`}
          <!-- Detail drawer -->
          <div class="pdw-detail-drawer" id="pdw-drawer-${dev.id}" style="display:none">
            <div class="pdw-drawer-body">
              <div class="pdw-drawer-section"><div class="pdw-drawer-heading">What is this device?</div><p class="pdw-drawer-text">${esc(dev.what)}</p></div>
              <div class="pdw-drawer-section"><div class="pdw-drawer-heading">Why does it matter?</div><p class="pdw-drawer-text">${esc(dev.whyMatters)}</p></div>
              <div class="pdw-drawer-section">
                <div class="pdw-drawer-heading">What data is shared with your clinic</div>
                <ul class="pdw-drawer-list">${dev.dataShared.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
              </div>
              <div class="pdw-drawer-section">
                <div class="pdw-drawer-heading">What is NOT shared</div>
                <ul class="pdw-drawer-list pdw-list-muted">${dev.dataNotShared.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
              </div>
              <div class="pdw-drawer-section">
                <div class="pdw-drawer-heading">Troubleshooting</div>
                <ul class="pdw-drawer-list">${dev.troubleshoot.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>
              </div>
              <div class="pdw-drawer-section pdw-drawer-contact">
                <div class="pdw-drawer-heading">When to contact your clinic</div>
                <p class="pdw-drawer-text">${esc(dev.contactClinic)}</p>
                <button class="pdw-action-btn pdw-action-primary" style="margin-top:10px" onclick="window._navPatient('patient-messages')">Message care team</button>
              </div>
            </div>
          </div>
          <button class="pdw-drawer-toggle" onclick="window._pdwToggleDrawer('${dev.id}')">
            <span id="pdw-dtgl-${dev.id}">Show details</span> ▾
          </button>
        </div>`;
      }).join('')}
    </div>
  </div>

  <!-- ④ WHAT YOUR CLINIC MONITORS -->
  <div class="pdw-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">◎</span>What your clinic monitors</h3>
      <span class="pdw-section-sub">Automatically shared with your care team</span>
    </div>
    <div class="pdw-monitoring-chips">
      ${[
        {label:'Sleep',           icon:'◗'},
        {label:'HRV',             icon:'∿'},
        {label:'Heart rate',      icon:'♡'},
        {label:'Steps & activity',icon:'◈'},
        {label:'Home sessions',   icon:'⊕'},
        {label:'Symptom check-ins',icon:'◉'},
        {label:'Side effects',    icon:'◬'},
        {label:'Uploaded updates',icon:'↑'},
      ].map(c=>`<span class="pdw-monitor-chip"><span class="pdw-chip-icon">${c.icon}</span>${esc(c.label)}</span>`).join('')}
    </div>
    <p class="pdw-note-text">Only the items above are visible to your clinic. Personal notes and voice memos are only shared when you choose to upload them.</p>
  </div>

  <!-- ⑤ BIOMETRICS SNAPSHOT -->
  <div class="pdw-section">
    <div class="pdw-section-header">
      <h3 class="pdw-section-title"><span class="pdw-title-icon">◗</span>Biometrics snapshot</h3>
      ${bio._isDemoData
        ? '<span class="pdw-demo-tag">Example data — connect a device to see real values</span>'
        : `<span class="pdw-section-sub">Last sync ${lastSyncMs ? fmtRelative(new Date(lastSyncMs).toISOString()) : '—'}</span>`}
    </div>
    <div class="pdw-bio-tiles">
      ${[
        { key:'sleep', icon:'◗', val:bio.sleep,      label:'Sleep last night' },
        { key:'hrv',   icon:'∿', val:bio.hrv,        label:'HRV' },
        { key:'rhr',   icon:'♡', val:bio.rhr||'—',   label:'Resting heart rate' },
        { key:'steps', icon:'◈', val:bio.steps,      label:'Steps today' },
      ].map(t => {
        const st = _bioStatus(t.key, t.val);
        const hl = _bioLabel(t.key, st);
        return `<div class="pdw-bio-tile pdw-bio-tile--${t.key}">
          <div class="pdw-bio-icon">${t.icon}</div>
          <div class="pdw-bio-val">${esc(t.val)}</div>
          <div class="pdw-bio-lbl">${t.label}</div>
          <div class="pdw-bio-status">${_vizTrafficLight(st, hl)}</div>
        </div>`;
      }).join('')}
    </div>
    ${_vizWeekStrip(_bioWeekDays, { legend: false })}
    <div style="font-size:11px;color:var(--text-tertiary,#64748b);margin-top:6px">7-day check-in log · connect a device to see biometric history</div>
  </div>

  <!-- ⑥ PRIVACY & PERMISSIONS -->
  <div class="pdw-section pdw-privacy-section">
    <div class="pdw-section-header"><h3 class="pdw-section-title"><span class="pdw-title-icon">◧</span>Privacy &amp; permissions</h3></div>
    <div class="pdw-privacy-grid">
      <div class="pdw-priv-block">
        <div class="pdw-priv-heading"><span class="pdw-priv-icon">◉</span>What data is read</div>
        <p class="pdw-priv-text">Sleep, heart rate, HRV, steps, and activity. No location data is ever accessed.</p>
      </div>
      <div class="pdw-priv-block">
        <div class="pdw-priv-heading"><span class="pdw-priv-icon">◌</span>Permissions used</div>
        <p class="pdw-priv-text">Read-only access you explicitly grant. We never write back to Apple Health or Health Connect.</p>
      </div>
      <div class="pdw-priv-block">
        <div class="pdw-priv-heading"><span class="pdw-priv-icon">◫</span>How to disconnect</div>
        <p class="pdw-priv-text">Use the Manage button on any connected source. On iOS, revoke in Settings → Privacy → Health.</p>
      </div>
      <div class="pdw-priv-block">
        <div class="pdw-priv-heading"><span class="pdw-priv-icon">◻</span>How to stop sharing</div>
        <p class="pdw-priv-text">Disconnect any source at any time. Historical data stays in your record but no new data will be collected.</p>
      </div>
    </div>
  </div>

  <!-- ⑦ FUTURE-READY BLE PLACEHOLDER -->
  <div class="pdw-ble-section">
    <div class="pdw-ble-inner">
      <div class="pdw-ble-pulse">
        <div class="pdw-ble-ring"></div>
        <div class="pdw-ble-ring pdw-ble-ring--2"></div>
        <span class="pdw-ble-center-icon">◌</span>
      </div>
      <div class="pdw-ble-copy">
        <div class="pdw-ble-badge">Coming soon</div>
        <div class="pdw-ble-heading">Direct Bluetooth connection</div>
        <p class="pdw-ble-text">Your home device will connect directly via Bluetooth — automatically importing session logs, device diagnostics, and usage data to your care record.</p>
      </div>
    </div>
  </div>

</div>

<!-- HOME SESSION LOG MODAL -->
<div class="pdw-modal-overlay" id="pdw-log-modal" style="display:none">
  <div class="pdw-modal-card">
    <div class="pdw-modal-header">
      <h4 class="pdw-modal-title" id="pdw-log-title">Log home session</h4>
      <button class="pdw-modal-close" onclick="window._pdwCloseModal()">✕</button>
    </div>
    <div class="pdw-modal-body">
      <input type="hidden" id="pdw-log-device-id">
      <div class="pdw-form-row">
        <label class="pdw-form-label">Did you complete a session?</label>
        <div class="pdw-radio-row">
          <label class="pdw-radio-label"><input type="radio" name="pdw-completed" value="yes" checked> Yes, completed</label>
          <label class="pdw-radio-label"><input type="radio" name="pdw-completed" value="partial"> Partial</label>
          <label class="pdw-radio-label"><input type="radio" name="pdw-completed" value="no"> No, skipped</label>
        </div>
      </div>
      <div class="pdw-form-row">
        <label class="pdw-form-label" for="pdw-log-time">When?</label>
        <input type="datetime-local" id="pdw-log-time" class="form-control" style="font-size:13px">
      </div>
      <div class="pdw-form-row">
        <label class="pdw-form-label">Any side effects or discomfort?</label>
        <div class="pdw-checkbox-grid">
          ${['None','Mild headache','Scalp tingling','Fatigue afterward','Skin irritation','Jaw tension','Other'].map(
            e=>`<label class="pdw-check-label"><input type="checkbox" name="pdw-effects" value="${e}"> ${e}</label>`
          ).join('')}
        </div>
      </div>
      <div class="pdw-form-row">
        <label class="pdw-form-label" for="pdw-log-feel">How did you feel after?</label>
        <select id="pdw-log-feel" class="form-control" style="font-size:13px">
          <option value="">Select…</option>
          <option>Much better</option><option>A bit better</option>
          <option>About the same</option><option>A bit worse</option><option>Much worse</option>
        </select>
      </div>
      <div class="pdw-form-row">
        <label class="pdw-form-label" for="pdw-log-note">Optional note</label>
        <textarea id="pdw-log-note" class="form-control" rows="2" placeholder="Anything you want your clinician to know…" style="font-size:13px;resize:vertical"></textarea>
      </div>
    </div>
    <div class="pdw-modal-footer">
      <button class="btn btn-ghost btn-sm" onclick="window._pdwCloseModal()">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="window._pdwSaveSession()">Save session</button>
    </div>
  </div>
</div>`;

  // ── Drawer toggle ─────────────────────────────────────────────────────────
  window._pdwToggleDrawer = function(id) {
    const dr  = document.getElementById('pdw-drawer-' + id);
    const lbl = document.getElementById('pdw-dtgl-' + id);
    if (!dr) return;
    const open = dr.style.display === 'none';
    dr.style.display = open ? '' : 'none';
    if (lbl) lbl.textContent = open ? 'Hide details' : 'Show details';
  };

  window._pdwViewInstructions = function(id) {
    const dr  = document.getElementById('pdw-drawer-' + id);
    const lbl = document.getElementById('pdw-dtgl-' + id);
    if (dr && dr.style.display === 'none') {
      dr.style.display = '';
      if (lbl) lbl.textContent = 'Hide details';
      dr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // ── Source actions ────────────────────────────────────────────────────────
  window._pdwConnect = async function(sourceId) {
    try { await api.connectWearableSource({ source: sourceId }); await pgPatientWearables(); }
    catch (_e) { showToast('Could not initiate connection. Please try again.'); }
  };
  window._pdwReconnect = async function(sourceId) {
    try { await api.connectWearableSource({ source: sourceId }); await pgPatientWearables(); }
    catch (_e) { showToast('Could not reconnect. Please try again.'); }
  };
  window._pdwManageSource = async function(sourceId, connectionId) {
    if (!connectionId) return;
    if (!confirm('Disconnect this source? Your existing data will remain but no new syncs will occur.')) return;
    try { await api.disconnectWearableSource(connectionId); await pgPatientWearables(); }
    catch (_e) { showToast('Could not disconnect. Please try again.'); }
  };

  // ── Legacy compat ─────────────────────────────────────────────────────────
  window._connectWearable = async function(source, action, connectionId) {
    if (action === 'disconnect' && connectionId) await window._pdwManageSource(source, connectionId);
    else await window._pdwConnect(source);
  };

  // ── Session log modal ─────────────────────────────────────────────────────
  window._pdwLogSession = function(deviceId) {
    const dev   = HOME_THERAPY_DEVICES.find(d => d.id === deviceId);
    const modal = document.getElementById('pdw-log-modal');
    if (!modal) return;
    const title = document.getElementById('pdw-log-title');
    if (title)  title.textContent = 'Log session — ' + (dev?.label || deviceId);
    const devInp = document.getElementById('pdw-log-device-id');
    if (devInp)  devInp.value = deviceId;
    const timeInp = document.getElementById('pdw-log-time');
    if (timeInp) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      timeInp.value = now.toISOString().slice(0, 16);
    }
    modal.querySelectorAll('input[name="pdw-effects"]').forEach(cb => { cb.checked = false; });
    const noneBox = modal.querySelector('input[name="pdw-effects"][value="None"]');
    if (noneBox) noneBox.checked = true;
    const feel = document.getElementById('pdw-log-feel');
    if (feel) feel.value = '';
    const note = document.getElementById('pdw-log-note');
    if (note) note.value = '';
    modal.style.display = 'flex';
  };

  window._pdwCloseModal = function() {
    const m = document.getElementById('pdw-log-modal');
    if (m) m.style.display = 'none';
  };

  window._pdwSaveSession = function() {
    const deviceId  = document.getElementById('pdw-log-device-id')?.value || '';
    const completed = document.querySelector('input[name="pdw-completed"]:checked')?.value || 'yes';
    const timeVal   = document.getElementById('pdw-log-time')?.value || new Date().toISOString();
    const effects   = [...document.querySelectorAll('input[name="pdw-effects"]:checked')].map(cb => cb.value).filter(v => v !== 'None');
    const feel      = document.getElementById('pdw-log-feel')?.value || '';
    const note      = document.getElementById('pdw-log-note')?.value?.trim() || '';
    const entry = { id:'sess_'+Date.now(), deviceId, date:timeVal, completedAt:timeVal, completed, effects, feel, note };

    let sess = [];
    try { sess = JSON.parse(localStorage.getItem(homeSessKey) || '[]'); } catch (_e) {}
    sess.push(entry);
    try { localStorage.setItem(homeSessKey, JSON.stringify(sess)); } catch (_e) {}

    let devs = [];
    try { devs = JSON.parse(localStorage.getItem(homeDevKey) || '[]'); } catch (_e) {}
    const devRec = devs.find(d => d.deviceId === deviceId);
    if (devRec) devRec.lastSession = timeVal;
    try { localStorage.setItem(homeDevKey, JSON.stringify(devs)); } catch (_e) {}

    window._pdwCloseModal();
    showToast('Session logged. Your care team can see this.');
    pgPatientWearables();
  };

  window._pdwReportIssue = function() {
    showToast('Opening messages — describe the issue to your care team.');
    window._navPatient('patient-messages');
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
// ── Patient Task Tracker (used inside pgHomeworkBuilder) ──────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const _PTT_TASKS_KEY_BASE       = 'ds_homework_tasks';
const _PTT_COMPLETIONS_KEY_BASE = 'ds_task_completions';

function _pttPatientKey() {
  const u = typeof currentUser !== 'undefined' ? currentUser : null;
  return u && (u.id || u.patient_id) ? (u.id || u.patient_id) : 'default';
}

function _pttTasksKey()       { return _PTT_TASKS_KEY_BASE + '_' + _pttPatientKey(); }
function _pttCompletionsKey() { return _PTT_COMPLETIONS_KEY_BASE + '_' + _pttPatientKey(); }

const _PTT_CAT_COLORS = {
  breathing: 'breathing', movement: 'movement', journaling: 'journaling',
  'screen-free': 'screen-free', social: 'social', custom: 'custom',
};

function _pttSeedTasks() {
  const key = _pttTasksKey();
  // Migration: if namespaced key is missing but legacy key exists, migrate once
  if (!localStorage.getItem(key) && localStorage.getItem(_PTT_TASKS_KEY_BASE)) {
    try { localStorage.setItem(key, localStorage.getItem(_PTT_TASKS_KEY_BASE)); } catch (_e) {}
  }
  const existing = localStorage.getItem(key);
  if (existing) { try { const a = JSON.parse(existing); if (a.length) return a; } catch (_e) {} }
  const today = new Date().toISOString().slice(0, 10);
  const tasks = [
    { id: 'ptask1', title: '5-min breathing exercise', category: 'breathing',   recurrence: 'daily',  dueDate: today, notes: 'Box breathing or 4-7-8 technique' },
    { id: 'ptask2', title: 'Mood journal entry \u2014 write 3 sentences', category: 'journaling',  recurrence: 'daily',  dueDate: today, notes: 'Focus on what went well today' },
    { id: 'ptask3', title: '30-min outdoor activity', category: 'movement',    recurrence: 'weekly', dueDate: today, notes: 'Walk, jog, or any outdoor exercise' },
    { id: 'ptask4', title: 'Screen-free hour before bed', category: 'screen-free', recurrence: 'daily',  dueDate: today, notes: 'No phones, tablets, or TV for 1 hour before sleep' },
  ];
  try { localStorage.setItem(key, JSON.stringify(tasks)); } catch (_e) {}
  return tasks;
}

function _pttGetTasks() { return _pttSeedTasks(); }

function _pttGetCompletions() {
  const key = _pttCompletionsKey();
  // Migration: if namespaced key is missing but legacy key exists, migrate once
  if (!localStorage.getItem(key) && localStorage.getItem(_PTT_COMPLETIONS_KEY_BASE)) {
    try { localStorage.setItem(key, localStorage.getItem(_PTT_COMPLETIONS_KEY_BASE)); } catch (_e) {}
  }
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (_e) { return {}; }
}

function _pttMarkComplete(taskId, date) {
  const c = _pttGetCompletions();
  c[taskId + '_' + date] = true;
  try { localStorage.setItem(_pttCompletionsKey(), JSON.stringify(c)); } catch (_e) {}
}

function _pttIsComplete(taskId, date) {
  const c = _pttGetCompletions();
  return !!c[taskId + '_' + date];
}

function _pttStreak() {
  const c = _pttGetCompletions();
  const tasks = _pttGetTasks();
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 60; i++) {
    const ds = d.toISOString().slice(0, 10);
    const todayTasks = tasks.filter(function(t) { return t.dueDate <= ds || t.recurrence === 'daily'; });
    if (!todayTasks.length) { d.setDate(d.getDate() - 1); continue; }
    const anyDone = todayTasks.some(function(t) { return !!c[t.id + '_' + ds]; });
    if (!anyDone) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function _pttWeekCompletions() {
  const tasks = _pttGetTasks();
  const c = _pttGetCompletions();
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const dayTasks = tasks.filter(function(t) { return t.dueDate <= ds || t.recurrence === 'daily'; });
    const doneTasks = dayTasks.filter(function(t) { return !!c[t.id + '_' + ds]; });
    days.push({ date: ds, label: ['M','T','W','T','F','S','S'][i], dayNum: d.getDate(), total: dayTasks.length, done: doneTasks.length });
  }
  return days;
}

function _pttHeatmapSVG() {
  const days = _pttWeekCompletions();
  const SZ = 36, GAP = 8, totalW = days.length * (SZ + GAP) - GAP + 2, H = SZ + 24;
  const cells = days.map(function(d, i) {
    const x = i * (SZ + GAP) + 1;
    const fill = d.done === 0 ? 'rgba(255,255,255,0.04)' : (d.done >= d.total && d.total > 0) ? '#2dd4bf' : 'rgba(45,212,191,0.4)';
    const stroke = d.done > 0 ? 'rgba(45,212,191,0.5)' : 'rgba(255,255,255,0.08)';
    const textCol = d.done > 0 ? '#0f172a' : 'rgba(148,163,184,0.7)';
    const today = new Date().toISOString().slice(0, 10);
    const isToday = d.date === today;
    return '<rect x="' + x + '" y="0" width="' + SZ + '" height="' + SZ + '" rx="8" fill="' + fill + '" stroke="' + (isToday ? '#2dd4bf' : stroke) + '" stroke-width="' + (isToday ? 2 : 1) + '"/>' +
      '<text x="' + (x + SZ / 2) + '" y="' + (SZ / 2 + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="' + textCol + '">' + d.dayNum + '</text>' +
      '<text x="' + (x + SZ / 2) + '" y="' + (SZ + 16) + '" text-anchor="middle" font-size="9.5" fill="rgba(148,163,184,0.7)">' + d.label + '</text>';
  }).join('');
  return '<svg width="100%" viewBox="0 0 ' + totalW + ' ' + H + '" style="display:block;overflow:visible">' + cells + '</svg>';
}

function _pttRingProgress(done, total) {
  const sz = 64, r = 24, circ = 2 * Math.PI * r, cx = sz / 2, cy = sz / 2;
  const pct = total > 0 ? done / total : 0;
  const dash = pct * circ;
  return '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 ' + sz + ' ' + sz + '" style="transform:rotate(-90deg)">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#2dd4bf" stroke-width="7" stroke-dasharray="' + dash.toFixed(2) + ' ' + circ.toFixed(2) + '" stroke-linecap="round"/>' +
    '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" fill="var(--text-primary,#f1f5f9)" font-size="12" font-weight="700" style="transform:rotate(90deg);transform-origin:' + cx + 'px ' + cy + 'px">' + Math.round(pct * 100) + '%</text>' +
    '</svg>';
}

function _pttRenderTaskSections() {
  const tasks = _pttGetTasks();
  const today = new Date().toISOString().slice(0, 10);
  const todayTasks = tasks.filter(function(t) { return t.dueDate <= today || t.recurrence === 'daily' || t.recurrence === 'weekly'; });
  const streak = _pttStreak();
  const allCompletions = Object.keys(_pttGetCompletions()).filter(function(k) { return _pttGetCompletions()[k]; }).length;
  const weekDays = _pttWeekCompletions();
  const weekDone = weekDays.reduce(function(s, d) { return s + d.done; }, 0);
  const weekTotal = weekDays.reduce(function(s, d) { return s + d.total; }, 0);

  // Today's task cards
  const taskCardsHTML = todayTasks.map(function(task) {
    const done = _pttIsComplete(task.id, today);
    const catClass = 'pthtask-cat-badge--' + (task.category || 'custom');
    return '<div class="pthtask-card' + (done ? ' pthtask-card--done' : '') + '" id="pthtask-card-' + task.id + '">' +
      '<button class="pthtask-check-btn' + (done ? ' pthtask-check-btn--done' : '') + '" onclick="window._pttMarkDone(\'' + task.id + '\')" title="Mark complete">' + (done ? '&#10003;' : '') + '</button>' +
      '<div class="pthtask-card-body">' +
        '<div class="pthtask-title' + (done ? ' pthtask-title--done' : '') + '">' + task.title + '</div>' +
        '<div class="pthtask-meta">' +
          '<span class="pthtask-cat-badge ' + catClass + '">' + (task.category || 'custom') + '</span>' +
          '<span>' + task.recurrence + '</span>' +
          (task.notes ? '<span>' + task.notes + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--text-secondary,#94a3b8);font-size:0.82rem">No tasks due today.</div>';

  return '<div class="pthtask-page">' +

    // Today's Tasks
    '<div class="pthtask-section">' +
      '<div class="pthtask-section-title">' +
        'Today\'s Tasks' +
        (streak > 0 ? '<span class="pthtask-streak">&#128293; ' + streak + ' day streak</span>' : '') +
      '</div>' +
      taskCardsHTML +
    '</div>' +

    // Weekly Overview heatmap
    '<div class="pthtask-section">' +
      '<div class="pthtask-section-title">Weekly Overview</div>' +
      '<div class="pthtask-heatmap-wrap">' + _pttHeatmapSVG() + '</div>' +
    '</div>' +

    // Stats
    '<div class="pthtask-section">' +
      '<div class="pthtask-section-title">Completion Stats</div>' +
      '<div class="pthtask-stats-row">' +
        _pttRingProgress(weekDone, weekTotal) +
        '<div class="pthtask-stat-pill">This week: <span>' + weekDone + '/' + weekTotal + '</span> tasks</div>' +
        '<div class="pthtask-stat-pill">All time: <span>' + allCompletions + '</span> completed</div>' +
      '</div>' +
    '</div>' +

    // Add Task Form
    '<div class="pthtask-section">' +
      '<div class="pthtask-section-title">Add Task</div>' +
      '<button class="pthtask-add-toggle" onclick="window._pttToggleAddForm()">+ Add Custom Task</button>' +
      '<div id="pthtask-add-form" style="display:none" class="pthtask-add-form">' +
        '<div class="pthtask-add-form-grid">' +
          '<div><label class="pthtask-form-label">Title</label>' +
            '<input type="text" id="pthtask-title-in" class="pthtask-form-input" placeholder="e.g. Evening stretching"/></div>' +
          '<div><label class="pthtask-form-label">Category</label>' +
            '<select id="pthtask-cat-in" class="pthtask-form-input">' +
              ['breathing','movement','journaling','screen-free','social','custom'].map(function(c) { return '<option value="' + c + '">' + c.charAt(0).toUpperCase() + c.slice(1) + '</option>'; }).join('') +
            '</select></div>' +
          '<div><label class="pthtask-form-label">Due Date</label>' +
            '<input type="date" id="pthtask-date-in" class="pthtask-form-input" value="' + today + '"/></div>' +
          '<div><label class="pthtask-form-label">Recurrence</label>' +
            '<select id="pthtask-recur-in" class="pthtask-form-input">' +
              ['once','daily','weekly'].map(function(r) { return '<option value="' + r + '">' + r.charAt(0).toUpperCase() + r.slice(1) + '</option>'; }).join('') +
            '</select></div>' +
        '</div>' +
        '<div style="margin-bottom:12px"><label class="pthtask-form-label">Notes (optional)</label>' +
          '<input type="text" id="pthtask-notes-in" class="pthtask-form-input" placeholder="Additional instructions..."/></div>' +
        '<button class="pthtask-submit-btn" onclick="window._pttAddTask()">Save Task</button>' +
      '</div>' +
    '</div>' +

    '<div style="border-top:1px solid var(--border,rgba(255,255,255,0.08));margin:8px 16px 24px;"></div>' +
    '<div style="padding:0 16px 8px;font-size:0.88rem;font-weight:700;color:var(--text-primary,#f1f5f9)">Homework Plan Builder</div>' +

  '</div>';
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
    _pttRenderTaskSections() +
    '<div class="hw-builder-layout">' +
      renderPalettePanel() +
      '<div class="hw-canvas-panel"><div id="hw-canvas-inner"></div></div>' +
      renderSettingsPanel() +
    '</div>';

  renderCanvas();
  renderSavedPlansList();

  // ── Patient task handlers ──────────────────────────────────────────────────
  window._pttToggleAddForm = function () {
    const f = document.getElementById('pthtask-add-form');
    if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
  };

  window._pttMarkDone = function (taskId) {
    const today = new Date().toISOString().slice(0, 10);
    _pttMarkComplete(taskId, today);
    // Update card in DOM
    const card = document.getElementById('pthtask-card-' + taskId);
    if (card) {
      card.classList.add('pthtask-card--done');
      const btn = card.querySelector('.pthtask-check-btn');
      if (btn) { btn.classList.add('pthtask-check-btn--done'); btn.innerHTML = '&#10003;'; }
      const title = card.querySelector('.pthtask-title');
      if (title) title.classList.add('pthtask-title--done');
    }
    window._showNotifToast && window._showNotifToast({ title: 'Done!', body: 'Task marked complete.', severity: 'success' });
    // Refresh streak display without full re-render
    const streakEl = document.querySelector('.pthtask-streak');
    const newStreak = _pttStreak();
    if (streakEl) streakEl.textContent = '\uD83D\uDD25 ' + newStreak + ' day streak';
  };

  window._pttAddTask = function () {
    const titleIn = document.getElementById('pthtask-title-in');
    const catIn   = document.getElementById('pthtask-cat-in');
    const dateIn  = document.getElementById('pthtask-date-in');
    const recurIn = document.getElementById('pthtask-recur-in');
    const notesIn = document.getElementById('pthtask-notes-in');
    const title = titleIn ? titleIn.value.trim() : '';
    if (!title) { window._showNotifToast && window._showNotifToast({ title: 'Missing title', body: 'Please enter a task title.', severity: 'warning' }); return; }
    const tasks = _pttGetTasks();
    const today = new Date().toISOString().slice(0, 10);
    const newTask = {
      id: 'ptask_' + Date.now(),
      title: title,
      category: catIn ? catIn.value : 'custom',
      dueDate: dateIn && dateIn.value ? dateIn.value : today,
      recurrence: recurIn ? recurIn.value : 'once',
      notes: notesIn ? notesIn.value.trim() : '',
    };
    tasks.push(newTask);
    try { localStorage.setItem(_pttTasksKey(), JSON.stringify(tasks)); } catch (_e) {}
    window._showNotifToast && window._showNotifToast({ title: 'Task added', body: newTask.title, severity: 'success' });
    // Re-render task sections
    const taskWrap = document.querySelector('.pthtask-page');
    if (taskWrap) {
      const newHtml = _pttRenderTaskSections();
      const tmp = document.createElement('div');
      tmp.innerHTML = newHtml;
      const newPage = tmp.querySelector('.pthtask-page');
      if (newPage) taskWrap.replaceWith(newPage);
    }
  };

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
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--text-tertiary);font-size:12px">${t('patient.notif.unsupported')}</span>`;
    return;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    if (statusEl) statusEl.innerHTML = '<span class="push-enabled">Notifications enabled ✓</span>';
    const prefs = getNotifPrefs();
    prefs.pushGranted = true;
    saveNotifPrefs(prefs);
  } else {
    if (statusEl) statusEl.innerHTML = `<span class="push-denied">${t('patient.notif.denied')}</span>`;
  }
};

window._patShareProgress = async function() {
  const title = t('patient.share.title');
  const text  = t('patient.share.text');
  const url = window.location.href;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); }
    catch (err) { if (err.name !== 'AbortError') console.warn('Share failed:', err); }
  } else {
    try {
      await navigator.clipboard.writeText(`${title}\n${text}\n${url}`);
      const btn = document.getElementById('share-btn');
      if (btn) { const orig = btn.textContent; btn.textContent = t('patient.share.copied'); setTimeout(() => { btn.textContent = orig; }, 2000); }
    } catch (_) {
      alert(t('patient.share.unavailable') + ' ' + url);
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

// ══════════════════════════════════════════════════════════════════════════════
// ── pgPatientOutcomePortal — Patient-facing outcome & progress page ───────────
// ══════════════════════════════════════════════════════════════════════════════

const _OUTCOME_SEED = {
  patient: { name: 'Alex P.', startDate: '2025-07-15', totalSessions: 24, goals: 3 },
  symptoms: {
    anxiety: [8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 3],
    sleep: [4, 4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8],
    focus: [5, 5, 5, 6, 6, 7, 7, 7, 8, 8, 9, 9],
  },
  sessionScores: [72, 68, 75, 80, 77, 82, 85, 79, 88, 84, 90, 87, 91, 86, 93, 89, 95, 92, 94, 96],
  goals: [
    { id: 'g1', name: 'Reduce Anxiety to \u22643', target: 3, current: 3, status: 'achieved' },
    { id: 'g2', name: 'Sleep 7+ hrs/night', target: 7, current: 8, status: 'achieved' },
    { id: 'g3', name: 'Focus Score \u22659', target: 9, current: 9, status: 'on-track' },
  ],
  sessions: [
    { id: 's1', date: '2025-10-25', type: 'Neurofeedback', clinician: 'Dr. Reyes', rating: 5, note: 'Felt very calm afterwards. Great focus boost.', clinicianRead: true },
    { id: 's2', date: '2025-11-01', type: 'tDCS', clinician: 'Dr. Reyes', rating: 4, note: 'Mild tingling, slept well that night.', clinicianRead: true },
    { id: 's3', date: '2025-11-08', type: 'Neurofeedback', clinician: 'Dr. Chen', rating: 5, note: 'Best session yet \u2014 hit my focus target.', clinicianRead: true },
    { id: 's4', date: '2025-11-15', type: 'HRV Training', clinician: 'Dr. Reyes', rating: 4, note: 'Learned paced breathing. Anxiety much lower.', clinicianRead: false },
    { id: 's5', date: '2025-11-22', type: 'Neurofeedback', clinician: 'Dr. Chen', rating: null, note: '', clinicianRead: false },
  ],
};

function _outcomeGetData() {
  try {
    const raw = localStorage.getItem('ds_patient_outcomes');
    if (raw) return JSON.parse(raw);
  } catch (_e) {
    /* seed below */
  }
  localStorage.setItem('ds_patient_outcomes', JSON.stringify(_OUTCOME_SEED));
  return _OUTCOME_SEED;
}

function _outcomeGetRatings() {
  try {
    return JSON.parse(localStorage.getItem('ds_session_ratings') || '{}');
  } catch (_e) {
    return {};
  }
}

function _outcomeGetGoalNotes() {
  try {
    return JSON.parse(localStorage.getItem('ds_patient_goal_notes') || '{}');
  } catch (_e) {
    return {};
  }
}

// ── Patient-friendly score bands ─────────────────────────────────────────────
function _pgpPhq9Band(score) {
  if (score === null || score === undefined) return { label: 'Not yet measured', note: '' };
  if (score >= 20) return { label: 'Struggling significantly', note: 'This is the highest range. Your care team is actively supporting you.' };
  if (score >= 15) return { label: 'Having a difficult time',  note: 'You\'re experiencing significant symptoms. Your treatment is focused on this.' };
  if (score >= 10) return { label: 'Experiencing some difficulty', note: 'Moderate range — there\'s clear room to improve and your treatment is working toward it.' };
  if (score >= 5)  return { label: 'Mild difficulties',  note: 'You\'re in the mild range — meaningful progress from where you started.' };
  return               { label: 'Doing well',           note: 'Minimal symptoms. This is excellent progress.' };
}

// ── Overall progress status ───────────────────────────────────────────────────
function _pgpStatus(pct) {
  if (pct === null || pct === undefined) return { key: 'start',    label: 'Getting Started',   icon: '○', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  tagline: 'Your progress tracking begins after your first assessment.' };
  if (pct >= 30)  return { key: 'improving', label: 'Improving',        icon: '↑', color: '#2dd4bf', bg: 'rgba(45,212,191,0.08)',  tagline: 'Your scores show meaningful improvement since you started.' };
  if (pct >= 10)  return { key: 'improving', label: 'Slowly Improving', icon: '↗', color: '#2dd4bf', bg: 'rgba(45,212,191,0.06)',  tagline: 'You\'re heading in the right direction — progress takes time.' };
  if (pct >= -10) return { key: 'steady',    label: 'Holding Steady',   icon: '→', color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  tagline: 'Your scores are stable. Keep attending sessions and checking in.' };
  return               { key: 'review',   label: 'Let\'s Check In',  icon: '!', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',   tagline: 'Your care team has been notified and will reach out soon.' };
}

// ── Single-measure trend chart ────────────────────────────────────────────────
function _pgpTrendChart(measure, sessions) {
  if (!measure || !measure.points || measure.points.length < 2) {
    return '<div class="pgp-chart-empty">Your trend chart will appear after your second assessment.</div>';
  }
  var W = 860, H = 200, PL = 36, PR = 20, PT = 30, PB = 44;
  var iW = W - PL - PR, iH = H - PT - PB;
  var pts = measure.points;
  var maxV = measure.max || 27;
  var nX = pts.length;
  var col = '#2dd4bf';
  function xP(i) { return PL + (i / (nX - 1)) * iW; }
  function yP(s) { return PT + iH - (s / maxV) * iH; }
  var uid = 'pgc' + Math.random().toString(36).slice(2, 8);
  var parts = [];
  // Gradient fill under line
  var areaPts = pts.map(function(pt, i) { return xP(i).toFixed(1) + ',' + yP(pt.score).toFixed(1); }).join(' ');
  parts.push('<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + col + '" stop-opacity="0.15"/><stop offset="100%" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>');
  parts.push('<polygon points="' + areaPts + ' ' + xP(nX - 1).toFixed(1) + ',' + (PT + iH) + ' ' + PL + ',' + (PT + iH) + '" fill="url(#' + uid + ')"/>');
  // Grid
  [0, 0.25, 0.5, 0.75, 1].forEach(function(f) {
    var y = (PT + iH * (1 - f)).toFixed(1);
    parts.push('<line x1="' + PL + '" y1="' + y + '" x2="' + (W - PR) + '" y2="' + y + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>');
    parts.push('<text x="' + (PL - 4) + '" y="' + (parseFloat(y) + 4) + '" text-anchor="end" font-size="9" fill="rgba(148,163,184,0.45)">' + Math.round(maxV * f) + '</text>');
  });
  parts.push('<text x="' + (PL + 2) + '" y="' + (PT - 12) + '" font-size="9" fill="rgba(148,163,184,0.45)">← Lower scores = fewer symptoms</text>');
  // Line
  var linePts = pts.map(function(pt, i) { return xP(i).toFixed(1) + ',' + yP(pt.score).toFixed(1); }).join(' ');
  parts.push('<polyline points="' + linePts + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>');
  // Session markers (triangles below axis)
  if (sessions && sessions.length) {
    var allDates = pts.map(function(pt) { return pt.date; });
    var tStart = new Date(allDates[0]).getTime();
    var tEnd   = new Date(allDates[allDates.length - 1]).getTime();
    var tRange = tEnd - tStart;
    if (tRange > 0) {
      sessions.slice(0, 30).forEach(function(s) {
        var t = new Date(s.date).getTime();
        if (t < tStart || t > tEnd) return;
        var sx = (PL + ((t - tStart) / tRange) * iW).toFixed(1);
        var sy = PT + iH + 6;
        parts.push('<polygon points="' + sx + ',' + (sy - 4) + ' ' + (parseFloat(sx) - 4) + ',' + (sy + 4) + ' ' + (parseFloat(sx) + 4) + ',' + (sy + 4) + '" fill="rgba(96,165,250,0.4)"/>');
      });
      parts.push('<text x="' + PL + '" y="' + (PT + iH + 22) + '" font-size="8.5" fill="rgba(96,165,250,0.55)">▲ sessions</text>');
    }
  }
  // Dots, score labels, date ticks
  pts.forEach(function(pt, i) {
    var cx = xP(i).toFixed(1), cy = yP(pt.score).toFixed(1);
    var isLast = i === pts.length - 1, isFirst = i === 0;
    if (isLast) parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="9" fill="' + col + '" opacity="0.12"/>');
    parts.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (isLast ? 5 : 3.5) + '" fill="' + col + '" stroke="#0f172a" stroke-width="1.5"/>');
    var scoreY = parseFloat(cy) > PT + 20 ? parseFloat(cy) - 10 : parseFloat(cy) + 16;
    parts.push('<text x="' + cx + '" y="' + scoreY + '" text-anchor="middle" font-size="10.5" fill="' + col + '" font-weight="700">' + pt.score + '</text>');
    if (isFirst) parts.push('<text x="' + cx + '" y="' + (scoreY - 12) + '" text-anchor="middle" font-size="8" fill="rgba(148,163,184,0.45)">baseline</text>');
    if (isLast)  parts.push('<text x="' + cx + '" y="' + (scoreY - 12) + '" text-anchor="middle" font-size="8" fill="' + col + '">now</text>');
    var dl = new Date(pt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    parts.push('<text x="' + cx + '" y="' + (PT + iH + 14) + '" text-anchor="middle" font-size="9" fill="rgba(148,163,184,0.65)">' + dl + '</text>');
  });
  return '<div class="pgp-chart-wrap">' +
    '<svg id="pgp-trend-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" style="display:block;overflow:visible">' + parts.join('') + '</svg>' +
    '<div class="pgp-chart-caption">' + (measure.label || 'Score') + ' over time &nbsp;·&nbsp; ' + pts.length + ' assessments</div>' +
    '</div>';
}

// ── What changed this week tiles ──────────────────────────────────────────────
function _pgpWeeklyTiles() {
  var journal = [];
  try { journal = JSON.parse(localStorage.getItem('ds_symptom_journal') || '[]'); } catch (_e) {}
  var cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  var recent = journal.filter(function(e) { return (e.date || (e.created_at || '').slice(0, 10)) >= cutoff; });
  if (!recent.length) {
    return '<div class="pgp-weekly-empty">' +
      '<span class="pgp-we-icon">📊</span>' +
      '<div>Log your daily check-in to see what changed this week.</div>' +
      '<button class="pgp-btn-ghost" onclick="window._navPatient(\'pt-wellness\')">Complete Today\'s Check-in →</button>' +
      '</div>';
  }
  function numArr(k1, k2) { return recent.map(function(e) { return e[k1] != null ? e[k1] : e[k2]; }).filter(function(v) { return typeof v === 'number' && !isNaN(v); }); }
  function avg(arr) { return arr.length ? arr.reduce(function(a, b) { return a + b; }, 0) / arr.length : null; }
  function dir(arr, invert) {
    if (arr.length < 2) return 'neutral';
    var mid = Math.max(1, Math.floor(arr.length / 2));
    var first = avg(arr.slice(0, mid)), last = avg(arr.slice(mid));
    if (last > first + 0.4) return invert ? 'down' : 'up';
    if (last < first - 0.4) return invert ? 'up'   : 'down';
    return 'neutral';
  }
  var moodArr  = numArr('mood_score', 'mood');
  var sleepArr = numArr('sleep_score', 'sleep');
  var stressArr = numArr('stress', 'anxiety_score');
  var cols  = { up: '#2dd4bf', down: '#f43f5e', neutral: '#60a5fa' };
  var icons = { up: '↑ Better', down: '↓ Lower', neutral: '→ Stable' };
  var tiles = [
    { label: 'Mood',      emoji: '😌', val: avg(moodArr),   d: dir(moodArr,  false), unit: '/10', key: 'mood'    },
    { label: 'Sleep',     emoji: '🌙', val: avg(sleepArr),  d: dir(sleepArr, false), unit: '/10', key: 'sleep'   },
    { label: 'Stress',    emoji: '🧘', val: avg(stressArr), d: dir(stressArr, true), unit: '/10', key: 'stress'  },
    { label: 'Check-ins', emoji: '✅', val: recent.length,  d: recent.length >= 4 ? 'up' : recent.length >= 2 ? 'neutral' : 'down', unit: ' days', key: 'checkin', isInt: true },
  ];
  return '<div class="pgp-weekly-grid">' +
    tiles.map(function(t) {
      var c = cols[t.d];
      if (t.key === 'stress') { if (t.d === 'down') c = cols.up; else if (t.d === 'up') c = cols.down; }
      var dv = t.val === null ? '—' : (t.isInt ? t.val : parseFloat(t.val).toFixed(1)) + t.unit;
      return '<div class="pgp-wt"><div class="pgp-wt-emoji">' + t.emoji + '</div>' +
        '<div class="pgp-wt-label">' + t.label + '</div>' +
        '<div class="pgp-wt-val">' + dv + '</div>' +
        '<div class="pgp-wt-trend" style="color:' + c + '">' + icons[t.d] + '</div></div>';
    }).join('') +
    '</div>';
}

// ── Improvement drivers ────────────────────────────────────────────────────────
function _pgpDriverBars(data, ptoData) {
  var phq9m = (ptoData.measures || []).find(function(m) { return m.id === 'phq9'; });
  var pts = phq9m ? phq9m.points : [];
  var sympPct = pts.length >= 2
    ? Math.max(0, Math.min(100, Math.round(((pts[0].score - pts[pts.length - 1].score) / pts[0].score) * 100)))
    : 0;
  var journal = [];
  try { journal = JSON.parse(localStorage.getItem('ds_symptom_journal') || '[]'); } catch (_e) {}
  var cut14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  var rec14 = journal.filter(function(e) { return (e.date || (e.created_at || '').slice(0, 10)) >= cut14; });
  function avgPct(key1, key2, maxVal) {
    var vals = rec14.map(function(e) { var v = e[key1] != null ? e[key1] : e[key2]; return typeof v === 'number' ? v : null; }).filter(function(v) { return v !== null; });
    return vals.length ? Math.round((vals.reduce(function(a, b) { return a + b; }, 0) / vals.length / maxVal) * 100) : 0;
  }
  var moodPct    = avgPct('mood_score', 'mood', 10);
  var sleepPct   = avgPct('sleep_score', 'sleep', 10);
  var checkinPct = Math.min(100, Math.round((rec14.length / 14) * 100));
  var sessTotal  = data.patient.totalSessions || 0;
  var sessPct    = Math.min(100, Math.round((sessTotal / 24) * 100));
  var goals      = data.goals || [];
  var goalPct    = goals.length ? Math.round((goals.filter(function(g) { return g.status === 'achieved'; }).length / goals.length) * 100) : 0;
  var clinSess   = (data.sessions || []).filter(function(s) { return s.clinicianRead; }).length;
  var clinPct    = data.sessions && data.sessions.length ? Math.round((clinSess / data.sessions.length) * 100) : 0;
  var drivers = [
    { label: 'Symptom Improvement',  pct: sympPct,    note: sympPct + '% reduction in primary symptoms',       color: '#2dd4bf' },
    { label: 'Sleep Quality',         pct: sleepPct,   note: 'Based on recent daily check-ins',                  color: '#60a5fa' },
    { label: 'Mood & Wellbeing',      pct: moodPct,    note: 'Based on recent daily check-ins',                  color: '#a78bfa' },
    { label: 'Session Attendance',    pct: sessPct,    note: sessTotal + ' sessions completed',                   color: '#fbbf24' },
    { label: 'Daily Check-in Streak', pct: checkinPct, note: rec14.length + ' of 14 days logged',                color: '#fb923c' },
    { label: 'Care Team Reviews',     pct: clinPct,    note: clinSess + ' sessions reviewed by your clinician',  color: '#2dd4bf' },
    { label: 'Goals Reached',         pct: goalPct,    note: goals.filter(function(g) { return g.status === 'achieved'; }).length + ' of ' + goals.length + ' goals achieved', color: '#60a5fa' },
  ];
  return '<div class="pgp-drivers">' +
    drivers.map(function(d) {
      var pct = Math.max(0, Math.min(100, Math.round(d.pct)));
      var chip = pct >= 70 ? '<span class="pgp-dchip pgp-dchip-good">Strong</span>'
               : pct >= 35 ? '<span class="pgp-dchip pgp-dchip-ok">Building</span>'
               :              '<span class="pgp-dchip pgp-dchip-low">Getting started</span>';
      return '<div class="pgp-driver">' +
        '<div class="pgp-driver-hd"><span class="pgp-driver-lbl">' + d.label + '</span>' + chip + '</div>' +
        '<div class="pgp-driver-track"><div class="pgp-driver-fill" style="width:' + pct + '%;background:' + d.color + '"></div></div>' +
        '<div class="pgp-driver-note">' + d.note + '</div>' +
        '</div>';
    }).join('') +
    '</div>';
}

// ── Clinician feedback card ────────────────────────────────────────────────────
function _pgpClinicianFeedback(data, _rptLoc) {
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); }
  var sessions = (data.sessions || []).filter(function(s) { return s.clinicianRead && s.note; });
  if (!sessions.length) return '<div class="pgp-empty-block">Your clinician\'s feedback will appear here after your next session review.</div>';
  var s = sessions[sessions.length - 1];
  var dl = new Date(s.date).toLocaleDateString(_rptLoc, { weekday: 'long', month: 'long', day: 'numeric' });
  var initials = (s.clinician || 'DR').split(' ').map(function(w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase();
  return '<div class="pgp-feedback-card">' +
    '<div class="pgp-fb-hd">' +
      '<div class="pgp-fb-avatar">' + initials + '</div>' +
      '<div class="pgp-fb-meta"><div class="pgp-fb-name">' + esc(s.clinician) + '</div><div class="pgp-fb-date">' + dl + '</div></div>' +
      '<span class="pgp-fb-badge">✓ Reviewed</span>' +
    '</div>' +
    '<div class="pgp-fb-note">&#8220;' + esc(s.note) + '&#8221;</div>' +
    '<div class="pgp-fb-ctx">' + esc(s.type) + ' session</div>' +
    '<button class="pgp-btn-ghost" style="margin-top:12px" onclick="window._navPatient(\'patient-messages\')">Ask a question about this →</button>' +
    '</div>';
}

// ── Goals & milestones ─────────────────────────────────────────────────────────
function _pgpGoals(data) {
  var goals = data.goals || [];
  if (!goals.length) return '<div class="pgp-empty-block">Your treatment goals will appear here once set by your care team.</div>';
  function friendly(g) {
    var n = (g.name || '').toLowerCase();
    if (n.indexOf('anxiety') !== -1) return 'Feel less anxious';
    if (n.indexOf('sleep')   !== -1) return 'Sleep better each night';
    if (n.indexOf('focus')   !== -1) return 'Improve focus and clarity';
    return g.name;
  }
  return '<div class="pgp-goals">' +
    goals.map(function(g) {
      var pct = Math.min(100, Math.round((g.current / g.target) * 100));
      var st = g.status === 'achieved' ? { label: 'Achieved ✓', color: '#2dd4bf' }
             : g.status === 'on-track' ? { label: 'On track',   color: '#60a5fa' }
             :                           { label: 'In progress', color: '#fbbf24' };
      return '<div class="pgp-goal">' +
        '<div class="pgp-goal-top"><div class="pgp-goal-name">' + friendly(g) + '</div>' +
        '<span class="pgp-goal-pill" style="color:' + st.color + ';background:' + st.color + '18;border-color:' + st.color + '44">' + st.label + '</span></div>' +
        '<div class="pgp-goal-track"><div class="pgp-goal-fill" style="width:' + pct + '%;background:' + st.color + '"></div></div>' +
        '<div class="pgp-goal-caption" style="color:' + st.color + '">' + pct + '% of goal reached</div>' +
        '</div>';
    }).join('') +
    '</div>';
}

// ── Devices & biometrics (compact) ────────────────────────────────────────────
function _pgpBiometrics() {
  // Pull from localStorage if real data exists
  var bioRaw = null;
  try { bioRaw = JSON.parse(localStorage.getItem('ds_wearable_summary') || 'null'); } catch (_e) {}
  function bioNum(str) { return parseFloat(String(str || '').replace(/[^\d.]/g, '')); }
  var sleepVal = bioRaw ? bioRaw.sleep : '7.2 hrs';
  var hrvVal   = bioRaw ? bioRaw.hrv   : '48 ms';
  var rhrVal   = bioRaw ? bioRaw.rhr   : '64 bpm';
  var sleepN = bioNum(sleepVal), hrvN = bioNum(hrvVal), rhrN = bioNum(rhrVal);
  var sleepSt = sleepN >= 7 ? 'green' : sleepN >= 5.5 ? 'amber' : 'red';
  var hrvSt   = hrvN   >= 50 ? 'green' : hrvN   >= 30  ? 'amber' : 'red';
  var rhrSt   = rhrN   <= 65 ? 'green' : rhrN   <= 80  ? 'amber' : 'red';
  // Adherence from check-in frequency
  var journal = [];
  try { journal = JSON.parse(localStorage.getItem('ds_symptom_journal') || '[]'); } catch (_e) {}
  var cut14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  var adhRate = Math.min(100, Math.round((journal.filter(function(e) { return (e.date || (e.created_at || '').slice(0, 10)) >= cut14; }).length / 14) * 100));
  var adhSt   = adhRate >= 70 ? 'green' : adhRate >= 40 ? 'amber' : 'red';
  var tiles = [
    { label: 'Sleep',      val: sleepVal,       sub: 'avg last 7 nights',  icon: '🌙', st: sleepSt },
    { label: 'HRV',        val: hrvVal,         sub: 'avg last 7 days',    icon: '💚', st: hrvSt   },
    { label: 'Resting HR', val: rhrVal,         sub: 'avg last 7 days',    icon: '❤️', st: rhrSt   },
    { label: 'Adherence',  val: adhRate + '%',  sub: 'check-in rate',      icon: '📋', st: adhSt   },
  ];
  return '<div class="pgp-bio-grid">' +
    tiles.map(function(t) {
      return '<div class="pgp-bio-tile">' +
        '<div class="pgp-bio-icon">' + t.icon + '</div>' +
        '<div class="pgp-bio-label">' + t.label + '</div>' +
        '<div class="pgp-bio-val">' + t.val + '</div>' +
        '<div class="pgp-bio-sub">' + t.sub + '</div>' +
        '<div style="margin-top:5px">' + _vizTrafficLight(t.st, '') + '</div>' +
      '</div>';
    }).join('') +
    '</div>' +
    '<div class="pgp-bio-sync">Last synced today &nbsp;·&nbsp; <a href="#" style="color:var(--accent-teal,#2dd4bf);text-decoration:none" onclick="window._navPatient(\'patient-wearables\');return false">Manage devices →</a></div>';
}

// ── Care assistant prompt panel ────────────────────────────────────────────────
function _pgpCareAssistant() {
  var prompts = [
    'Explain my progress',
    'What changed since last week?',
    'Compare now with when I started',
    'Explain my biometrics',
    'What should I do before my next session?',
  ];
  return '<div class="pgp-assistant">' +
    '<div class="pgp-assistant-hd">Ask your care assistant</div>' +
    '<div class="pgp-assistant-hint">Tap a question to get a plain-language answer.</div>' +
    '<div class="pgp-assistant-btns">' +
    prompts.map(function(p) {
      return '<button class="pgp-assistant-btn" onclick="window._pgpAskAssistant(' + JSON.stringify(p) + ')">' + p + ' →</button>';
    }).join('') +
    '</div></div>';
}

// ── Plain-language accordion ───────────────────────────────────────────────────
function _pgpAccordion(id, label, body) {
  return '<details class="pgp-accordion" id="' + id + '"><summary class="pgp-accordion-sum">' + label + '</summary><div class="pgp-accordion-body">' + body + '</div></details>';
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function _pgpSection(title, content, accordionLabel, accordionBody) {
  var accId = 'pgp-acc-' + title.replace(/\W+/g, '').toLowerCase().slice(0, 18);
  return '<div class="pgp-section"><h2 class="pgp-section-title">' + title + '</h2>' + content +
    (accordionLabel ? _pgpAccordion(accId, accordionLabel, accordionBody) : '') +
    '</div>';
}

// ── [legacy chart helpers removed — replaced by pgp helpers above] ────────────
function _symptomLineChart(symptoms) {
  const W = 380, H = 200, padL = 30, padT = 16, padR = 12, padB = 28;
  const cW = W - padL - padR, cH = H - padT - padB;
  const weeks = 12, maxY = 10;
  const colors = { anxiety: 'var(--accent-rose,#f43f5e)', sleep: 'var(--accent-teal,#2dd4bf)', focus: 'var(--accent-blue,#60a5fa)' };
  const lbls = { anxiety: 'Anxiety', sleep: 'Sleep Quality', focus: 'Focus' };
  let gl = '', xl = '', lines = '', dots = '', legend = '';
  for (let y = 0; y <= 10; y += 2) {
    const cy = padT + cH - (y / maxY) * cH;
    gl += '<line x1="' + padL + '" y1="' + cy + '" x2="' + (W - padR) + '" y2="' + cy + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
    gl += '<text x="' + (padL - 4) + '" y="' + (cy + 4) + '" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.35)">' + y + '</text>';
  }
  for (let i = 0; i < weeks; i++) {
    const cx = padL + (i / (weeks - 1)) * cW;
    xl += '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.35)">W' + (i + 1) + '</text>';
  }
  Object.keys(symptoms).forEach(function (key) {
    const d = symptoms[key], c = colors[key];
    const pts = d.map(function (v, i) {
      return (padL + (i / (d.length - 1)) * cW).toFixed(1) + ',' + (padT + cH - (v / maxY) * cH).toFixed(1);
    });
    lines += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>';
    pts.forEach(function (pt, i) {
      const p = pt.split(','), last = i === pts.length - 1;
      dots += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (last ? 4 : 2.5) + '" fill="' + c + '" opacity="' + (last ? 1 : 0.6) + '" class="iii-chart-dot"/>';
    });
    legend += '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,0.7)"><span style="width:14px;height:2.5px;background:' + c + ';display:inline-block;border-radius:2px"></span>' + lbls[key] + '</span>';
  });
  return (
    '<div class="iii-chart-panel"><div class="iii-chart-title">Symptom Severity Over Time</div>' +
    '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible">' +
    gl +
    '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + cH) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>' +
    '<line x1="' + padL + '" y1="' + (padT + cH) + '" x2="' + (W - padR) + '" y2="' + (padT + cH) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>' +
    lines + dots + xl + '</svg>' +
    '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">' + legend + '</div></div>'
  );
}

// ── Session score bar chart ────────────────────────────────────────────────────
function _sessionBarChart(scores) {
  const W = 380, H = 160, padL = 30, padT = 12, padR = 8;
  const cW = W - padL - padR, cH = H - padT - 24;
  const n = scores.length, maxY = 100;
  const barW = Math.floor(cW / n) - 2;
  let bars = '', gl = '', xl = '';
  [0, 25, 50, 75, 100].forEach(function (y) {
    const cy = padT + cH - (y / maxY) * cH;
    gl += '<line x1="' + padL + '" y1="' + cy + '" x2="' + (W - padR) + '" y2="' + cy + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
    gl += '<text x="' + (padL - 4) + '" y="' + (cy + 4) + '" text-anchor="end" font-size="8" fill="rgba(255,255,255,0.3)">' + y + '</text>';
  });
  scores.forEach(function (v, i) {
    const bH = Math.max(2, (v / maxY) * cH);
    const x = padL + i * (cW / n) + 1, y = padT + cH - bH;
    const c = v >= 88 ? 'var(--accent-teal,#2dd4bf)' : v >= 75 ? 'var(--accent-amber,#fbbf24)' : 'var(--accent-rose,#f43f5e)';
    bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW + '" height="' + bH.toFixed(1) + '" rx="2" fill="' + c + '" opacity="0.85"/>';
    if (i % 5 === 0) xl += '<text x="' + (padL + i * (cW / n) + barW / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.3)">S' + (i + 1) + '</text>';
  });
  return (
    '<div class="iii-chart-panel"><div class="iii-chart-title">Session Performance Scores</div>' +
    '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible">' +
    gl +
    '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT + cH) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>' +
    '<line x1="' + padL + '" y1="' + (padT + cH) + '" x2="' + (W - padR) + '" y2="' + (padT + cH) + '" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>' +
    bars + xl + '</svg>' +
    '<div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap">' +
    '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,0.6)"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent-teal,#2dd4bf);display:inline-block"></span>Excellent (\u226588)</span>' +
    '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,0.6)"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent-amber,#fbbf24);display:inline-block"></span>Good (75\u201387)</span>' +
    '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,0.6)"><span style="width:10px;height:10px;border-radius:2px;background:var(--accent-rose,#f43f5e);display:inline-block"></span>Needs Work (&lt;75)</span>' +
    '</div></div>'
  );
}

// ── Goal sparkline ────────────────────────────────────────────────────────────
function _goalSparkline(goalId) {
  const samples = { g1: [8, 6, 5, 4, 4, 3, 3, 3], g2: [4, 5, 6, 6, 7, 7, 8, 8], g3: [5, 6, 6, 7, 7, 8, 9, 9] };
  const d = samples[goalId] || [5, 5, 5, 6, 7, 7, 8, 8];
  const W = 80, H = 28, pad = 3;
  const mx = Math.max.apply(null, d), mn = Math.min.apply(null, d), rng = mx - mn || 1;
  const pts = d.map(function (v, i) {
    return (pad + (i / (d.length - 1)) * (W - pad * 2)).toFixed(1) + ',' + (pad + (H - pad * 2) - ((v - mn) / rng) * (H - pad * 2)).toFixed(1);
  });
  const lp = pts[pts.length - 1].split(',');
  return (
    '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block">' +
    '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--accent-teal,#2dd4bf)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="2.5" fill="var(--accent-teal,#2dd4bf)"/>' +
    '</svg>'
  );
}

// ── Calendar dots (30-day intensity heatmap) ──────────────────────────────────
function _calendarDots30() {
  const today = new Date();
  const cm = { low: 'var(--accent-teal,#2dd4bf)', mid: 'var(--accent-amber,#fbbf24)', high: 'var(--accent-rose,#f43f5e)' };
  let html = '';
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const seed = (i * 7 + 3) % 11;
    const intensity = seed <= 3 ? 'low' : seed <= 7 ? 'mid' : 'high';
    html += '<button class="iii-cal-dot" data-date="' + key + '" style="background:' + cm[intensity] + '" title="' + key + '" onclick="window._outcomeShowDay(\'' + key + '\')" aria-label="Day ' + d.getDate() + '"><span>' + d.getDate() + '</span></button>';
  }
  return html;
}

// ── Progress report HTML builder ──────────────────────────────────────────────
function _buildReportHTML(data) {
  const p = data.patient;
  const _rptLoc  = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
  const today = new Date().toLocaleDateString(_rptLoc, { year: 'numeric', month: 'long', day: 'numeric' });
  const startFmt = new Date(p.startDate).toLocaleDateString(_rptLoc, { year: 'numeric', month: 'long', day: 'numeric' });
  const avgScore = (data.sessionScores.reduce(function (a, b) { return a + b; }, 0) / data.sessionScores.length).toFixed(1);
  const anxArr = data.symptoms.anxiety, slpArr = data.symptoms.sleep;
  const anxImp = anxArr[0] - anxArr[anxArr.length - 1];
  const slpImp = slpArr[slpArr.length - 1] - slpArr[0];
  const goalRows = data.goals.map(function (g) {
    const lbl = g.status === 'achieved' ? 'Achieved' : g.status === 'on-track' ? 'On Track' : 'Needs Attention';
    const sc = g.status === 'achieved' ? '#2dd4bf' : g.status === 'on-track' ? '#60a5fa' : '#f43f5e';
    return '<tr><td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0">' + g.name + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0;text-align:center">' + g.target + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0;text-align:center">' + g.current + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;text-align:center"><span style="background:' + sc + '22;color:' + sc + ';border:1px solid ' + sc + '44;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600">' + lbl + '</span></td></tr>';
  }).join('');
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>Progress Report</title>\n<style>\n' +
    '*{box-sizing:border-box;margin:0;padding:0}\n' +
    'body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px 32px;max-width:800px;margin:0 auto}\n' +
    'h1{font-size:2rem;font-weight:700;color:#2dd4bf;margin-bottom:4px}\n' +
    'h2{font-size:1.1rem;font-weight:700;color:#60a5fa;margin:32px 0 12px;text-transform:uppercase;letter-spacing:.08em}\n' +
    '.meta{color:#94a3b8;font-size:14px;margin-bottom:32px}\n' +
    '.stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:8px}\n' +
    '.stat-card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px 20px}\n' +
    '.stat-val{font-size:1.8rem;font-weight:800;color:#2dd4bf}\n' +
    '.stat-label{font-size:12px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}\n' +
    'table{width:100%;border-collapse:collapse;background:#1e293b;border-radius:12px;overflow:hidden}\n' +
    'th{padding:10px 14px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;background:#162032;border-bottom:1px solid #334155}\n' +
    'p.insight{background:#1e293b;border-left:4px solid #2dd4bf;padding:16px 18px;border-radius:0 10px 10px 0;line-height:1.7;font-size:14px;color:#cbd5e1;margin:8px 0}\n' +
    '.footer{margin-top:40px;padding-top:20px;border-top:1px solid #1e293b;font-size:12px;color:#475569;text-align:center}\n' +
    '</style>\n</head>\n<body>\n' +
    '<h1>Progress Report</h1>\n' +
    '<div class="meta">Patient: <strong style="color:#e2e8f0">' + p.name + '</strong> &nbsp;&bull;&nbsp; Treatment start: ' + startFmt + ' &nbsp;&bull;&nbsp; Generated: ' + today + '</div>\n' +
    '<h2>Outcome Summary</h2>\n<div class="stat-row">' +
    '<div class="stat-card"><div class="stat-val">' + p.totalSessions + '</div><div class="stat-label">Sessions Completed</div></div>' +
    '<div class="stat-card"><div class="stat-val">' + avgScore + '</div><div class="stat-label">Avg Session Score</div></div>' +
    '<div class="stat-card"><div class="stat-val">&#8722;' + anxImp + '</div><div class="stat-label">Anxiety Reduction</div></div>' +
    '<div class="stat-card"><div class="stat-val">+' + slpImp + '</div><div class="stat-label">Sleep Improvement</div></div>' +
    '</div>\n<h2>Treatment Goals</h2>\n' +
    '<table><thead><tr><th>Goal</th><th>Target</th><th>Current</th><th>Status</th></tr></thead><tbody>' + goalRows + '</tbody></table>\n' +
    '<h2>Key Insights</h2>\n' +
    '<p class="insight">Over the course of ' + p.totalSessions + ' sessions beginning ' + startFmt + ', ' + p.name + ' has demonstrated consistent and meaningful clinical progress. Anxiety severity decreased by ' + anxImp + ' points (from ' + anxArr[0] + ' to ' + anxArr[anxArr.length - 1] + ' on a 10-point scale), sleep quality improved by ' + slpImp + ' points, and focus scores reached the target threshold. All ' + p.goals + ' treatment goals are at or above target, reflecting strong adherence and positive response to the current protocol. Average session quality score of ' + avgScore + '/100 is within the excellent range. Continued maintenance sessions are recommended to consolidate these gains.</p>\n' +
    '<div class="footer">Generated by DeepSynaps Protocol Studio &nbsp;&bull;&nbsp; ' + today + ' &nbsp;&bull;&nbsp; Confidential &#8212; for personal use only</div>\n</body>\n</html>';
}

// ── Patient outcome seed data with PHQ-9 / GAD-7 measures ────────────────────
const _PTO_SEED_KEY = 'ds_patient_outcomes_v2';
function _ptoSeed() {
  const existing = localStorage.getItem(_PTO_SEED_KEY);
  if (existing) { try { return JSON.parse(existing); } catch (_e) {} }
  const base = new Date('2026-01-20');
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  const data = {
    _isDemoData: true,
    patient: { name: 'Alex Rivera', startDate: '2026-01-20', totalSessions: 20, condition: 'Depression', clinician: 'Dr. Reyes' },
    nextAssessmentDate: addDays(new Date(), 7).toISOString().slice(0, 10),
    measures: [
      { id: 'phq9',  label: 'PHQ-9',  max: 27, color: 'teal',   points: [
        { date: addDays(base, 0).toISOString().slice(0,10),  score: 18 },
        { date: addDays(base, 14).toISOString().slice(0,10), score: 16 },
        { date: addDays(base, 28).toISOString().slice(0,10), score: 13 },
        { date: addDays(base, 42).toISOString().slice(0,10), score: 11 },
        { date: addDays(base, 56).toISOString().slice(0,10), score: 8  },
      ]},
      { id: 'gad7',  label: 'GAD-7',  max: 21, color: 'blue',   points: [
        { date: addDays(base, 0).toISOString().slice(0,10),  score: 14 },
        { date: addDays(base, 14).toISOString().slice(0,10), score: 12 },
        { date: addDays(base, 28).toISOString().slice(0,10), score: 10 },
        { date: addDays(base, 42).toISOString().slice(0,10), score: 8  },
        { date: addDays(base, 56).toISOString().slice(0,10), score: 6  },
      ]},
      { id: 'pcl5',  label: 'PCL-5',  max: 80, color: 'violet', points: [
        { date: addDays(base, 0).toISOString().slice(0,10),  score: 38 },
        { date: addDays(base, 28).toISOString().slice(0,10), score: 30 },
        { date: addDays(base, 56).toISOString().slice(0,10), score: 22 },
      ]},
    ],
  };
  localStorage.setItem(_PTO_SEED_KEY, JSON.stringify(data));
  return data;
}
function _ptoLoad() { return _ptoSeed(); }

// ── Live API loader: tries backend first, falls back to seed ──────────────────
async function _ptoLoadLive() {
  try {
    const resp = await api.patientPortalOutcomes().catch(() => null);
    const items = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.items) ? resp.items : null);
    if (!items || !items.length) return _ptoSeed();

    // Group by template_name
    const groups = {};
    items.forEach(function(item) {
      const raw = (item.template_name || '').trim();
      if (!raw) return;
      if (!groups[raw]) groups[raw] = [];
      groups[raw].push(item);
    });

    // Map template name to measure id/label/max/color
    function _ptoTemplateMeta(name) {
      const n = name.toLowerCase().replace(/[\s\-]/g, '');
      if (n === 'phq9' || n === 'phq-9') return { id: 'phq9', label: 'PHQ-9', max: 27, color: 'teal' };
      if (n === 'gad7' || n === 'gad-7') return { id: 'gad7', label: 'GAD-7', max: 21, color: 'blue' };
      if (n === 'pcl5' || n === 'pcl-5') return { id: 'pcl5', label: 'PCL-5', max: 80, color: 'violet' };
      // fallback: slugify
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return { id: slug, label: name, max: 100, color: 'teal' };
    }

    const measures = Object.keys(groups).map(function(name) {
      const meta = _ptoTemplateMeta(name);
      const pts = groups[name]
        .filter(function(it) { return it.score_numeric != null && !isNaN(Number(it.score_numeric)); })
        .map(function(it) {
          return {
            date: (it.administered_at || it.recorded_at || new Date().toISOString()).slice(0, 10),
            score: Number(it.score_numeric),
            point: it.measurement_point || '',
          };
        });
      pts.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      return { id: meta.id, label: meta.label, max: meta.max, color: meta.color, points: pts };
    }).filter(function(m) { return m.points.length > 0; });

    if (!measures.length) return _ptoSeed();

    // Build patient info — prefer data from seed if available, overlay with API info
    const seed = _ptoSeed();
    const patientInfo = Object.assign({}, seed.patient);
    if (items[0] && items[0].course_id) patientInfo.courseId = items[0].course_id;

    const liveData = {
      patient: patientInfo,
      nextAssessmentDate: seed.nextAssessmentDate,
      measures: measures,
    };

    // Cache to localStorage so _ptoLoad() picks it up too
    try { localStorage.setItem(_PTO_SEED_KEY, JSON.stringify(liveData)); } catch (_e) {}
    return liveData;
  } catch (_e) {
    return _ptoSeed();
  }
}

// ── Patient Progress page render ───────────────────────────────────────────────
function _renderProgressPage() {
  var el = document.getElementById('patient-content');
  if (!el) return;
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'); }

  var data     = _outcomeGetData();
  var ptoData  = _ptoLoad();
  var p        = data.patient;
  var ptoPat   = ptoData.patient;
  var measures = ptoData.measures || [];
  var _rptLoc  = (typeof getLocale === 'function' ? getLocale() : 'en') === 'tr' ? 'tr-TR' : 'en-US';

  var phq9m    = measures.find(function(m) { return m.id === 'phq9'; }) || measures[0] || null;
  var phq9pts  = phq9m ? phq9m.points : [];
  var phq9base = phq9pts.length ? phq9pts[0].score : null;
  var phq9now  = phq9pts.length ? phq9pts[phq9pts.length - 1].score : null;
  var phq9pct  = (phq9base && phq9base > 0 && phq9now !== null)
    ? Math.round(((phq9base - phq9now) / phq9base) * 100) : null;

  var status   = _pgpStatus(phq9pct);
  var nowBand  = _pgpPhq9Band(phq9now);
  var baseBand = _pgpPhq9Band(phq9base);

  var daysSince     = Math.floor((Date.now() - new Date(ptoPat.startDate).getTime()) / 86400000);
  var lastRevSess   = (data.sessions || []).filter(function(s) { return s.clinicianRead; }).pop();
  var lastRevDate   = lastRevSess ? new Date(lastRevSess.date).toLocaleDateString(_rptLoc, { month: 'long', day: 'numeric' }) : null;
  var nextRevDate   = ptoData.nextAssessmentDate ? new Date(ptoData.nextAssessmentDate).toLocaleDateString(_rptLoc, { month: 'long', day: 'numeric' }) : null;
  var daysUntilNext = ptoData.nextAssessmentDate ? Math.max(0, Math.ceil((new Date(ptoData.nextAssessmentDate).getTime() - Date.now()) / 86400000)) : 14;

  var demoBanner = ptoData._isDemoData
    ? '<div class="pgp-demo-banner">&#128204; Showing example data \u2014 your real scores appear here after your first assessment.</div>'
    : '';

  // 1. Progress Summary Hero
  var heroHTML =
    '<div class="pgp-hero" style="background:' + status.bg + ';border-left:4px solid ' + status.color + '">' +
      '<div class="pgp-hero-status">' +
        '<span class="pgp-hero-icon" style="color:' + status.color + '">' + status.icon + '</span>' +
        '<span class="pgp-hero-label" style="color:' + status.color + '">' + status.label + '</span>' +
      '</div>' +
      '<div class="pgp-hero-tagline">' + status.tagline + '</div>' +
      '<div class="pgp-hero-stats">' +
        (phq9pct !== null ? '<span class="pgp-hero-stat">' + Math.abs(phq9pct) + '% ' + (phq9pct >= 0 ? 'reduction' : 'increase') + ' since baseline</span>' : '') +
        '<span class="pgp-hero-stat">' + daysSince + ' days in treatment</span>' +
        '<span class="pgp-hero-stat">' + (p.totalSessions || 0) + ' sessions completed</span>' +
      '</div>' +
      '<div class="pgp-hero-reviews">' +
        '<div class="pgp-review-row"><span class="pgp-review-dot pgp-dot-teal"></span>Last reviewed: ' + (lastRevDate || 'Pending first review') + '</div>' +
        '<div class="pgp-review-row"><span class="pgp-review-dot pgp-dot-blue"></span>Next assessment: ' + (nextRevDate || 'In ~2 weeks') + (nextRevDate ? ' (' + daysUntilNext + ' days)' : '') + '</div>' +
      '</div>' +
    '</div>';

  // 2. Baseline vs Now
  var baselineHTML;
  if (phq9base !== null && phq9now !== null) {
    var ptDiff = phq9base - phq9now, diffPos = ptDiff >= 0;
    var bDFmt = phq9pts[0].date ? new Date(phq9pts[0].date).toLocaleDateString(_rptLoc, { month: 'short', year: 'numeric' }) : '';
    var nDFmt = phq9pts[phq9pts.length - 1].date ? new Date(phq9pts[phq9pts.length - 1].date).toLocaleDateString(_rptLoc, { month: 'short', year: 'numeric' }) : '';
    baselineHTML =
      '<div class="pgp-bn-row">' +
        '<div class="pgp-bn-card">' +
          '<div class="pgp-bn-eyebrow">When You Started</div>' +
          '<div class="pgp-bn-date">' + bDFmt + '</div>' +
          '<div class="pgp-bn-score">' + (phq9m ? phq9m.label : 'PHQ-9') + ': ' + phq9base + '</div>' +
          '<div class="pgp-bn-band">' + baseBand.label + '</div>' +
        '</div>' +
        '<div class="pgp-bn-mid">' +
          '<div class="pgp-bn-arrow" style="color:' + (diffPos ? '#2dd4bf' : '#f43f5e') + '">' + (diffPos ? '\u2193' : '\u2191') + '</div>' +
          '<div class="pgp-bn-delta" style="color:' + (diffPos ? '#2dd4bf' : '#f43f5e') + '">' + (diffPos ? '\u2212' : '+') + Math.abs(ptDiff) + ' pts</div>' +
          (phq9pct !== null ? '<div class="pgp-bn-pct">' + (diffPos ? '\u2212' : '+') + Math.abs(phq9pct) + '%</div>' : '') +
        '</div>' +
        '<div class="pgp-bn-card pgp-bn-now">' +
          '<div class="pgp-bn-eyebrow">Right Now</div>' +
          '<div class="pgp-bn-date">' + nDFmt + '</div>' +
          '<div class="pgp-bn-score" style="color:#2dd4bf">' + (phq9m ? phq9m.label : 'PHQ-9') + ': ' + phq9now + '</div>' +
          '<div class="pgp-bn-band" style="color:#2dd4bf">' + nowBand.label + '</div>' +
        '</div>' +
      '</div>' +
      _pgpAccordion('pgp-acc-bn', 'What this means',
        '<p>' + nowBand.note + '</p>' +
        (phq9pct !== null && phq9pct >= 10 ? '<p style="margin-top:8px">A ' + phq9pct + '% reduction is a clinically meaningful improvement. Your treatment is working.</p>' : '') +
        '<p style="margin-top:8px">PHQ-9 measures depression symptoms on a scale of 0\u201327. Lower scores mean fewer symptoms.</p>'
      );
  } else {
    baselineHTML = '<div class="pgp-empty-block">Your baseline comparison will appear after your first completed assessment.</div>';
  }

  // 3. Trend Over Time
  var trendHTML = _pgpTrendChart(phq9m, data.sessions) +
    _pgpAccordion('pgp-acc-trend', 'What this chart shows',
      '<p>Each dot is one assessment result. Blue triangles mark your treatment sessions. A downward trend means fewer symptoms \u2014 a positive sign.</p>' +
      (phq9m ? '<p style="margin-top:8px">' + phq9m.label + ' is scored 0\u2013' + phq9m.max + '. Lower is better.</p>' : '')
    );

  // 4. What Changed This Week
  var weeklyHTML = _pgpWeeklyTiles() +
    _pgpAccordion('pgp-acc-weekly', 'How are these measured?',
      '<p>These tiles come from your daily check-ins over the past 7 days. The more you log, the clearer your picture becomes.</p>'
    );

  // 5. Improvement Drivers
  var driversHTML = _pgpDriverBars(data, ptoData) +
    _pgpAccordion('pgp-acc-drivers', 'What influences your progress?',
      '<p>Progress in neuromodulation therapy comes from several factors: symptom scores, sleep quality, session attendance, daily check-ins, and engagement with your care team.</p>' +
      '<p style="margin-top:8px">Each bar shows how strongly that factor is contributing right now.</p>'
    );

  // 6–8. Feedback / Goals / Biometrics
  var feedbackHTML = _pgpClinicianFeedback(data, _rptLoc);
  var goalsHTML    = _pgpGoals(data);
  var bioHTML      = _pgpBiometrics() +
    _pgpAccordion('pgp-acc-bio', 'What these numbers mean',
      '<p><strong>Sleep (hrs):</strong> 7\u20139 hours supports brain recovery. <strong>HRV (ms):</strong> higher generally means better nervous system balance. <strong>Resting HR:</strong> lower is generally healthier. <strong>Adherence:</strong> homework completion rate.</p>'
    );

  el.innerHTML =
    '<div class="pgp-page">' +
    demoBanner +
    _pgpSection('Am I getting better?',          heroHTML) +
    _pgpSection('Then vs Now',                    baselineHTML) +
    _pgpSection('Trend Over Time',                trendHTML) +
    _pgpSection('What Changed This Week',         weeklyHTML) +
    _pgpSection('What\'s Driving Your Progress',  driversHTML) +
    _pgpSection('Your Care Team\'s Feedback',     feedbackHTML) +
    _pgpSection('Your Goals',                     goalsHTML) +
    _pgpSection('Devices & Biometrics',           bioHTML) +
    _pgpCareAssistant() +
    '</div>';
}

// ── Legacy render (delegates to new page) ─────────────────────────────────────
// ── Legacy outcome history ────────────────────────────────────────────────────
function _renderOutcomePortal() { _renderProgressPage(); }
function _renderOutcomePortal_LEGACY() {
  const data = _outcomeGetData();
  const ratings = _outcomeGetRatings();
  const notes = _outcomeGetGoalNotes();
  const p = data.patient;
  const el = document.getElementById('patient-content');
  if (!el) return;
  const _rptLoc = getLocale() === 'tr' ? 'tr-TR' : 'en-US';

  const daysSince = Math.floor((Date.now() - new Date(p.startDate).getTime()) / 86400000);
  const goalsDone = data.goals.filter(function (g) { return g.status === 'achieved'; }).length;
  const goalRate = Math.round((goalsDone / data.goals.length) * 100);
  const anxNow = data.symptoms.anxiety[data.symptoms.anxiety.length - 1];
  const improvePct = Math.round(((data.symptoms.anxiety[0] - anxNow) / data.symptoms.anxiety[0]) * 100);

  const statCards = [
    { label: 'Sessions Completed', nv: p.totalSessions, max: 30, color: 'var(--accent-teal,#2dd4bf)', dv: null },
    { label: 'Overall Improvement', nv: improvePct, max: 100, color: 'var(--accent-blue,#60a5fa)', dv: improvePct + '%' },
    { label: 'Goal Achievement', nv: goalRate, max: 100, color: 'var(--accent-violet,#a78bfa)', dv: goalRate + '%' },
    { label: 'Days in Treatment', nv: daysSince, max: 365, color: 'var(--accent-amber,#fbbf24)', dv: null },
  ];

  const goalCardsHTML = data.goals.map(function (g) {
    const pct = Math.min(100, Math.round((g.current / g.target) * 100));
    const st = g.status === 'achieved' ? { label: 'Achieved', color: 'var(--accent-teal,#2dd4bf)' } : g.status === 'on-track' ? { label: 'On Track', color: 'var(--accent-blue,#60a5fa)' } : { label: 'Needs Attention', color: 'var(--accent-rose,#f43f5e)' };
    const sn = notes[g.id] || '';
    return '<div class="iii-goal-card" id="goal-card-' + g.id + '">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:1rem;color:var(--text,#f1f5f9);margin-bottom:3px">' + g.name + '</div>' +
      '<div style="font-size:0.78rem;color:var(--text-muted,#94a3b8)">Target: ' + g.target + ' &nbsp;&bull;&nbsp; Current: ' + g.current + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' + _goalSparkline(g.id) +
      '<span style="font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:12px;background:' + st.color + '22;color:' + st.color + ';border:1px solid ' + st.color + '44">' + st.label + '</span></div></div>' +
      '<div style="margin:12px 0 6px"><div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted,#94a3b8);margin-bottom:5px"><span>Progress</span><span>' + pct + '%</span></div>' +
      '<div style="height:8px;background:rgba(255,255,255,0.07);border-radius:6px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + st.color + ';border-radius:6px;transition:width 1s ease"></div></div></div>' +
      '<div class="iii-goal-note-area" id="note-area-' + g.id + '" style="' + (sn ? '' : 'display:none') + '">' +
      '<textarea id="note-ta-' + g.id + '" rows="3" placeholder="Write a personal note about this goal..." style="width:100%;background:rgba(255,255,255,0.04);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;padding:10px;font-size:0.82rem;color:var(--text,#f1f5f9);resize:vertical;margin-top:8px;font-family:inherit" onchange="window._outcomeSaveNote(\'' + g.id + '\',this.value)">' + sn + '</textarea></div>' +
      '<button style="font-size:0.78rem;margin-top:8px;padding:4px 10px;border-radius:8px;cursor:pointer;background:none;border:1px solid rgba(255,255,255,0.1);color:var(--text-muted,#94a3b8)" onclick="window._outcomeToggleNote(\'' + g.id + '\')">' + (sn ? 'Edit Note' : '+ Add Personal Note') + '</button></div>';
  }).join('');

  function _starHTML(sid, cr) {
    const sv = ratings[sid] != null ? ratings[sid] : cr;
    if (sv != null) return '<div class="iii-star-rating" aria-label="' + sv + ' stars">' + [1, 2, 3, 4, 5].map(function (s) { return '<span style="color:' + (s <= sv ? '#fbbf24' : 'rgba(255,255,255,0.15)') + '">&#9733;</span>'; }).join('') + '</div>';
    return '<div class="iii-star-rating" id="stars-' + sid + '">' + [1, 2, 3, 4, 5].map(function (s) { return '<span style="cursor:pointer;color:rgba(255,255,255,0.2);font-size:1.3rem" onmouseenter="window._outcomeStarHover(\'' + sid + '\',' + s + ')" onmouseleave="window._outcomeStarReset(\'' + sid + '\')" onclick="window._outcomeRateSession(\'' + sid + '\',' + s + ')">&#9733;</span>'; }).join('') + '</div>';
  }

  const sessionHTML = data.sessions.map(function (s) {
    const read = s.clinicianRead ? '<span style="color:var(--accent-teal,#2dd4bf);font-size:0.72rem" title="Clinician has read">&#10003;&#10003; Read</span>' : '<span style="color:var(--text-muted,#94a3b8);font-size:0.72rem">&#10003; Sent</span>';
    const dl = new Date(s.date).toLocaleDateString(_rptLoc, { month: 'short', day: 'numeric', year: 'numeric' });
    return '<div style="display:flex;flex-direction:column;gap:8px;padding:14px 16px;background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.07));border-radius:12px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<div><div style="font-weight:600;font-size:0.9rem;color:var(--text,#f1f5f9)">' + s.type + '</div><div style="font-size:0.75rem;color:var(--text-muted,#94a3b8);margin-top:2px">' + dl + ' &nbsp;&bull;&nbsp; ' + s.clinician + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' + _starHTML(s.id, s.rating) + read + '</div></div>' +
      (s.note ? '<div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);font-style:italic;padding-left:2px">&#8220;' + s.note + '&#8221;</div>' : '') +
      '</div>';
  }).join('');

  const sdates = data.sessions.map(function (s) { return new Date(s.date).toLocaleDateString(_rptLoc, { month: 'short', day: 'numeric' }); }).join(', ');

  // ── New rich outcome sections ────────────────────────────────────────────────
  const ptoData = _ptoLoad();
  const ptoPatient = ptoData.patient;
  const ptoMeasures = ptoData.measures || [];

  // PHQ-9 summary
  const phq9m = ptoMeasures.find(function(m) { return m.id === 'phq9'; });
  const phq9pts = phq9m ? phq9m.points : [];
  const phq9baseline = phq9pts.length ? phq9pts[0].score : null;
  const phq9latest = phq9pts.length ? phq9pts[phq9pts.length - 1].score : null;
  const phq9pct = (phq9baseline && phq9baseline > 0 && phq9latest !== null)
    ? Math.round(((phq9baseline - phq9latest) / phq9baseline) * 100) : 0;
  const ptoBadgeClass = phq9pct >= 50 ? 'pto-badge--responder' : phq9pct >= 20 ? 'pto-badge--improving' : 'pto-badge--monitoring';
  const ptoBadgeLabel = phq9pct >= 50 ? 'Responder' : phq9pct >= 20 ? 'Improving' : 'Monitoring';
  const ptoDays = Math.floor((Date.now() - new Date(ptoPatient.startDate).getTime()) / 86400000);

  // ── Trend chart SVG ──────────────────────────────────────────────────────────
  function _ptoTrendChart() {
    const W = 860, H = 180, PAD_L = 36, PAD_R = 16, PAD_T = 14, PAD_B = 34;
    const iW = W - PAD_L - PAD_R, iH = H - PAD_T - PAD_B;
    const colorMap = { teal: '#2dd4bf', blue: '#60a5fa', violet: '#a78bfa' };
    // collect all dates across measures for x-axis
    const allDates = [];
    ptoMeasures.forEach(function(m) { m.points.forEach(function(pt) { if (!allDates.includes(pt.date)) allDates.push(pt.date); }); });
    allDates.sort();
    const nX = allDates.length;
    if (nX < 2) return '<div style="padding:20px;text-align:center;color:var(--text-secondary,#94a3b8);font-size:0.82rem">Not enough data points yet.</div>';
    function xPos(date) { const i = allDates.indexOf(date); return PAD_L + (i / (nX - 1)) * iW; }
    function yPos(score, max) { return PAD_T + iH - (score / max) * iH; }
    // threshold line for PHQ-9=10
    const threshY = phq9m ? yPos(10, phq9m.max) : null;
    let svgParts = [];
    // grid lines
    [0, 0.25, 0.5, 0.75, 1].forEach(function(f) {
      const y = PAD_T + iH * (1 - f);
      svgParts.push('<line x1="' + PAD_L + '" y1="' + y.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + y.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>');
    });
    // threshold dashed line
    if (threshY !== null) {
      svgParts.push('<line x1="' + PAD_L + '" y1="' + threshY.toFixed(1) + '" x2="' + (W - PAD_R) + '" y2="' + threshY.toFixed(1) + '" stroke="rgba(251,191,36,0.5)" stroke-width="1.2" stroke-dasharray="5,4"/>');
      svgParts.push('<text x="' + (W - PAD_R - 2) + '" y="' + (threshY - 4).toFixed(1) + '" text-anchor="end" font-size="9" fill="rgba(251,191,36,0.7)">Moderate threshold</text>');
    }
    // measure lines + dots
    ptoMeasures.forEach(function(m) {
      const col = colorMap[m.color] || '#2dd4bf';
      const pts = m.points;
      if (pts.length < 1) return;
      const points = pts.map(function(pt) { return xPos(pt.date).toFixed(1) + ',' + yPos(pt.score, m.max).toFixed(1); }).join(' ');
      if (pts.length > 1) {
        svgParts.push('<polyline points="' + points + '" fill="none" stroke="' + col + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>');
      }
      pts.forEach(function(pt, i) {
        const cx = xPos(pt.date), cy = yPos(pt.score, m.max);
        const isLast = i === pts.length - 1;
        if (isLast) {
          svgParts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="7" fill="none" stroke="' + col + '" stroke-width="1.5" opacity="0.35" class="pto-pulse-ring"/>');
        }
        svgParts.push('<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (isLast ? 5 : 3.5) + '" fill="' + col + '" stroke="#0f172a" stroke-width="1.5"/>');
        svgParts.push('<text x="' + cx.toFixed(1) + '" y="' + (cy - 9).toFixed(1) + '" text-anchor="middle" font-size="9.5" fill="' + col + '" font-weight="600">' + pt.score + '</text>');
      });
    });
    // x-axis date labels
    allDates.forEach(function(d) {
      const x = xPos(d);
      const lbl = new Date(d).toLocaleDateString(_rptLoc, { month: 'short', day: 'numeric' });
      svgParts.push('<text x="' + x.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="9.5" fill="rgba(148,163,184,0.8)">' + lbl + '</text>');
    });
    // y-axis tick
    svgParts.push('<text x="' + (PAD_L - 4) + '" y="' + (PAD_T + 4) + '" text-anchor="end" font-size="9" fill="rgba(148,163,184,0.6)">27</text>');
    svgParts.push('<text x="' + (PAD_L - 4) + '" y="' + (PAD_T + iH / 2 + 4) + '" text-anchor="end" font-size="9" fill="rgba(148,163,184,0.6)">13</text>');
    svgParts.push('<text x="' + (PAD_L - 4) + '" y="' + (PAD_T + iH + 4) + '" text-anchor="end" font-size="9" fill="rgba(148,163,184,0.6)">0</text>');
    return '<svg id="pto-trend-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" style="display:block;overflow:visible">' + svgParts.join('') + '</svg>';
  }

  // ── Scores table ─────────────────────────────────────────────────────────────
  function _ptoScoresTable() {
    const rows = [];
    ptoMeasures.forEach(function(m) {
      m.points.forEach(function(pt, i) {
        const prev = i > 0 ? m.points[i - 1].score : null;
        const change = prev !== null ? pt.score - prev : null;
        const changeCls = change === null ? 'pto-change-neu' : change < 0 ? 'pto-change-pos' : change > 0 ? 'pto-change-neg' : 'pto-change-neu';
        const changeStr = change === null ? '\u2014' : (change < 0 ? change : '+' + change);
        const point = i === 0 ? 'Baseline' : 'Follow-up ' + i;
        const isLast = i === m.points.length - 1;
        let status = '\u2014';
        if (m.id === 'phq9' && pt.score !== null) {
          status = pt.score >= 20 ? 'Severe' : pt.score >= 15 ? 'Mod. Severe' : pt.score >= 10 ? 'Moderate' : pt.score >= 5 ? 'Mild' : 'Minimal';
        } else if (m.id === 'gad7' && pt.score !== null) {
          status = pt.score >= 15 ? 'Severe' : pt.score >= 10 ? 'Moderate' : pt.score >= 5 ? 'Mild' : 'Minimal';
        }
        const dateFmt = new Date(pt.date).toLocaleDateString(_rptLoc, { month: 'short', day: 'numeric', year: 'numeric' });
        rows.push('<tr>' +
          '<td>' + dateFmt + '</td>' +
          '<td><span style="font-weight:600;color:' + (m.id === 'phq9' ? '#2dd4bf' : m.id === 'gad7' ? '#60a5fa' : '#a78bfa') + '">' + m.label + '</span></td>' +
          '<td><strong>' + pt.score + '</strong>' + (isLast ? ' <span style="font-size:0.7rem;color:var(--teal,#2dd4bf)">(latest)</span>' : '') + '</td>' +
          '<td class="' + changeCls + '">' + changeStr + '</td>' +
          '<td style="color:var(--text-secondary,#94a3b8)">' + point + '</td>' +
          '<td style="color:var(--text-secondary,#94a3b8);font-size:0.78rem">' + status + '</td>' +
          '</tr>');
      });
    });
    return '<div style="overflow-x:auto"><table class="pto-table"><thead><tr>' +
      '<th>Date</th><th>Measure</th><th>Score</th><th>Change</th><th>Point</th><th>Status</th>' +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  // ── Next assessment card ─────────────────────────────────────────────────────
  function _ptoNextAssessCard() {
    const nextDate = ptoData.nextAssessmentDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const daysUntil = Math.ceil((new Date(nextDate).getTime() - Date.now()) / 86400000);
    const due = daysUntil <= 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : 'In ' + daysUntil + ' days';
    const dueFmt = new Date(nextDate).toLocaleDateString(_rptLoc, { weekday: 'long', month: 'long', day: 'numeric' });
    return '<div class="pto-next-card">' +
      '<h4>&#128197; Next Assessment Due</h4>' +
      '<p><strong style="color:' + (daysUntil <= 1 ? 'var(--accent-amber,#fbbf24)' : 'var(--teal,#2dd4bf)') + '">' + due + '</strong> &mdash; ' + dueFmt + '</p>' +
      '<button class="pto-share-btn pto-share-btn--copy" onclick="window._ptoToggleAssessForm()" style="margin-bottom:0">Complete Now</button>' +
      '<div id="pto-assess-form" style="display:none" class="pto-inline-form">' +
        '<div class="pto-inline-form-row"><label>PHQ-9 score</label><input type="number" min="0" max="27" id="pto-phq9-input" class="pto-form-inp" placeholder="0-27"/></div>' +
        '<div class="pto-inline-form-row"><label>GAD-7 score</label><input type="number" min="0" max="21" id="pto-gad7-input" class="pto-form-inp" placeholder="0-21"/></div>' +
        '<div class="pto-inline-form-row"><label>PCL-5 score</label><input type="number" min="0" max="80" id="pto-pcl5-input" class="pto-form-inp" placeholder="0-80 (opt.)"/></div>' +
        '<button class="pto-share-btn pto-share-btn--copy" onclick="window._ptoSubmitAssessment()" style="align-self:flex-start">Save Scores</button>' +
      '</div>' +
    '</div>';
  }

  // ── Legend ───────────────────────────────────────────────────────────────────
  const colorMap2 = { teal: '#2dd4bf', blue: '#60a5fa', violet: '#a78bfa' };
  const legendHTML = ptoMeasures.map(function(m) {
    return '<div class="pto-legend-item"><div class="pto-legend-dot" style="background:' + (colorMap2[m.color] || '#2dd4bf') + '"></div>' + m.label + '</div>';
  }).join('') + '<div class="pto-legend-item"><div class="pto-legend-dot" style="background:rgba(251,191,36,0.6);border-radius:2px;height:2px;width:16px"></div>PHQ-9 moderate threshold</div>';

  // ── Demo data notice (shown only when no real outcome data exists yet) ─────────
  const demoBannerHTML = ptoData._isDemoData
    ? '<div style="margin-bottom:16px;padding:10px 16px;border-radius:10px;background:rgba(148,163,184,0.06);border:1px solid rgba(148,163,184,0.15);display:flex;align-items:center;gap:10px">' +
        '<span style="font-size:1rem;opacity:0.6">&#128204;</span>' +
        '<span style="font-size:0.78rem;color:var(--text-tertiary,#64748b)">Showing example data &mdash; your scores will appear here after your first assessment.</span>' +
      '</div>'
    : '';

  // ── Rich new top sections ─────────────────────────────────────────────────────
  const richSectionsHTML =
    '<div class="pto-page">' +
    demoBannerHTML +

    // Progress Summary Card
    '<div class="pto-summary-card">' +
      '<div class="pto-big-stat">' +
        '<div class="pto-big-score">' + (phq9latest !== null ? phq9latest : '\u2014') + '</div>' +
        '<div class="pto-big-label">PHQ-9 Now</div>' +
        '<div style="font-size:0.72rem;color:var(--text-secondary,#94a3b8);margin-top:3px">was ' + (phq9baseline !== null ? phq9baseline : '\u2014') + ' at baseline</div>' +
      '</div>' +
      '<div style="width:1px;height:60px;background:var(--border,rgba(255,255,255,0.08));flex-shrink:0"></div>' +
      '<div class="pto-summary-meta">' +
        '<h3>' + ptoPatient.name + '</h3>' +
        '<p>' + (ptoPatient.condition || 'Treatment') + ' &nbsp;&bull;&nbsp; ' + ptoPatient.totalSessions + ' sessions &nbsp;&bull;&nbsp; ' +
          new Date(ptoPatient.startDate).toLocaleDateString(_rptLoc, { month: 'short', day: 'numeric', year: 'numeric' }) + '</p>' +
        '<span class="pto-badge ' + ptoBadgeClass + '">' + ptoBadgeLabel + '</span>' +
        '<div class="pto-days-badge" style="margin-top:6px">&#9200; ' + ptoDays + ' days in treatment &nbsp;&bull;&nbsp; ' + phq9pct + '% PHQ-9 reduction</div>' +
      '</div>' +
    '</div>' +

    // Trend Chart
    '<div class="pto-section">' +
      '<div class="pto-section-title"><span class="pto-section-accent">&#9647;</span> Score Trend Over Time</div>' +
      '<div class="pto-chart-wrap">' +
        _ptoTrendChart() +
        '<div class="pto-chart-legend">' + legendHTML + '</div>' +
      '</div>' +
    '</div>' +

    // Scores Table
    '<div class="pto-section">' +
      '<div class="pto-section-title"><span class="pto-section-accent">&#9776;</span> Assessment History</div>' +
      _ptoScoresTable() +
    '</div>' +

    // Share Progress
    '<div class="pto-section">' +
      '<div class="pto-section-title"><span class="pto-section-accent">&#8679;</span> Share Progress</div>' +
      '<div class="pto-share-row">' +
        '<button class="pto-share-btn pto-share-btn--copy" onclick="window._ptoCopyProgress()">&#128203; Copy Progress Summary</button>' +
        '<button class="pto-share-btn pto-share-btn--dl" onclick="window._ptoDownloadChart()">&#8595; Download Chart</button>' +
      '</div>' +
    '</div>' +

    // Next Assessment
    '<div class="pto-section">' +
      '<div class="pto-section-title"><span class="pto-section-accent">&#128197;</span> Next Assessment</div>' +
      _ptoNextAssessCard() +
    '</div>' +

    '</div>';

  el.innerHTML =
    richSectionsHTML +
    '<div class="iii-outcome-banner">' +
    '<div class="iii-banner-greeting">' +
    '<div style="font-size:1.6rem;font-weight:800;color:var(--text,#f1f5f9);line-height:1.2">Full Outcome History, <span style="color:var(--accent-teal,#2dd4bf)">' + p.name + '</span></div>' +
    '<div style="font-size:0.85rem;color:var(--text-muted,#94a3b8);margin-top:4px">Treatment started ' + new Date(p.startDate).toLocaleDateString(_rptLoc, { month: 'long', day: 'numeric', year: 'numeric' }) + '</div>' +
    '</div>' +
    '<div class="iii-stat-cards">' +
    statCards.map(function (sc) {
      return '<div class="iii-stat-card">' + _progressRingSVG(sc.nv, sc.max, sc.color) +
        '<div style="margin-top:8px;text-align:center"><div style="font-size:1.2rem;font-weight:800;color:' + sc.color + '">' + (sc.dv != null ? sc.dv : sc.nv) + '</div>' +
        '<div style="font-size:0.72rem;color:var(--text-muted,#94a3b8);margin-top:2px;max-width:90px;text-align:center">' + sc.label + '</div></div></div>';
    }).join('') +
    '</div></div>' +

    '<div style="max-width:900px;margin:0 auto;padding:0 16px 60px">' +

    '<div style="margin-bottom:28px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-teal,#2dd4bf)">&#9647;</span> Outcome History</h2>' +
    '<div class="iii-chart-row">' + _symptomLineChart(data.symptoms) + _sessionBarChart(data.sessionScores) + '</div>' +
    '</div>' +

    '<div style="margin-bottom:32px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-violet,#a78bfa)">&#9678;</span> Treatment Goals</h2>' +
    '<div style="display:flex;flex-direction:column;gap:12px">' + goalCardsHTML + '</div>' +
    '</div>' +

    '<div style="margin-bottom:32px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-amber,#fbbf24)">&#9733;</span> Recent Sessions</h2>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' + sessionHTML + '</div>' +
    '<button style="margin-top:16px;display:inline-flex;align-items:center;gap:7px;background:rgba(45,212,191,0.1);color:var(--accent-teal,#2dd4bf);border:1px solid rgba(45,212,191,0.25);border-radius:10px;padding:9px 18px;font-size:0.85rem;font-weight:600;cursor:pointer" onclick="window._navPatient(\'patient-messages\')">&#9647; Message My Care Team</button>' +
    '</div>' +

    '<div style="margin-bottom:32px;padding:20px 22px;background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.07));border-radius:14px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:8px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-blue,#60a5fa)">&#8595;</span> Progress Report</h2>' +
    '<p style="font-size:0.82rem;color:var(--text-muted,#94a3b8);margin-bottom:14px;line-height:1.5">Download a comprehensive summary of your treatment journey to share with your care team or keep for your records.</p>' +
    '<button style="display:inline-flex;align-items:center;gap:8px;background:var(--accent-blue,#60a5fa);color:#0f172a;border:none;border-radius:10px;padding:10px 20px;font-size:0.88rem;font-weight:700;cursor:pointer" onclick="window._outcomeDownloadReport()">&#8595; Download My Progress Report</button>' +
    '</div>' +

    '<div style="margin-bottom:32px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);display:flex;align-items:center;gap:8px"><span style="color:var(--accent-rose,#f43f5e)">&#9672;</span> 30-Day Symptom Heatmap</h2>' +
    '<button id="overlay-toggle-btn" style="font-size:0.78rem;padding:6px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:var(--text-muted,#94a3b8);cursor:pointer" onclick="window._outcomeToggleOverlay()">Show Session Dates</button>' +
    '</div>' +
    '<div id="overlay-session-dates" style="display:none;margin-bottom:12px;font-size:0.78rem;color:var(--accent-teal,#2dd4bf);padding:8px 12px;background:rgba(45,212,191,0.07);border-radius:8px;border:1px solid rgba(45,212,191,0.2)">Session dates: ' + sdates + '</div>' +
    '<div class="iii-calendar-dots">' + _calendarDots30() + '</div>' +
    '<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">' +
    '<span style="font-size:0.72rem;color:var(--text-muted,#94a3b8);display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent-teal,#2dd4bf);display:inline-block;opacity:0.7"></span>Low</span>' +
    '<span style="font-size:0.72rem;color:var(--text-muted,#94a3b8);display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent-amber,#fbbf24);display:inline-block;opacity:0.7"></span>Moderate</span>' +
    '<span style="font-size:0.72rem;color:var(--text-muted,#94a3b8);display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--accent-rose,#f43f5e);display:inline-block;opacity:0.7"></span>High</span>' +
    '</div>' +
    '<div id="day-detail-popup" style="display:none;margin-top:12px;padding:14px 16px;background:var(--card-bg,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:12px;font-size:0.83rem;color:var(--text-muted,#94a3b8)"></div>' +
    '</div>' +
    '</div>';
}

// ── Window handlers ───────────────────────────────────────────────────────────
window._outcomeSaveNote = function (goalId, text) {
  const n = _outcomeGetGoalNotes();
  n[goalId] = text;
  localStorage.setItem('ds_patient_goal_notes', JSON.stringify(n));
};

window._outcomeToggleNote = function (goalId) {
  const area = document.getElementById('note-area-' + goalId);
  if (!area) return;
  const hidden = area.style.display === 'none';
  area.style.display = hidden ? 'block' : 'none';
  if (hidden) { const ta = document.getElementById('note-ta-' + goalId); if (ta) ta.focus(); }
  const btn = area.nextElementSibling;
  if (btn) btn.textContent = hidden ? 'Edit Note' : '+ Add Personal Note';
};

window._outcomeStarHover = function (sid, count) {
  const c = document.getElementById('stars-' + sid);
  if (!c) return;
  c.querySelectorAll('span').forEach(function (s, i) { s.style.color = i < count ? '#fbbf24' : 'rgba(255,255,255,0.2)'; });
};

window._outcomeStarReset = function (sid) {
  const c = document.getElementById('stars-' + sid);
  if (!c) return;
  c.querySelectorAll('span').forEach(function (s) { s.style.color = 'rgba(255,255,255,0.2)'; });
};

window._outcomeRateSession = function (sid, rating) {
  const r = _outcomeGetRatings();
  r[sid] = rating;
  localStorage.setItem('ds_session_ratings', JSON.stringify(r));
  const c = document.getElementById('stars-' + sid);
  if (c) {
    c.innerHTML = [1, 2, 3, 4, 5].map(function (s) { return '<span style="color:' + (s <= rating ? '#fbbf24' : 'rgba(255,255,255,0.15)') + '">&#9733;</span>'; }).join('');
    c.removeAttribute('id');
  }
};

window._outcomeDownloadReport = function () {
  const blob = new Blob([_buildReportHTML(_outcomeGetData())], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'patient-report-' + new Date().toISOString().slice(0, 10) + '.html';
  a.click();
  URL.revokeObjectURL(url);
};

window._outcomeToggleOverlay = function () {
  const div = document.getElementById('overlay-session-dates');
  const btn = document.getElementById('overlay-toggle-btn');
  if (!div) return;
  const vis = div.style.display !== 'none';
  div.style.display = vis ? 'none' : 'block';
  if (btn) btn.textContent = vis ? 'Show Session Dates' : 'Hide Session Dates';
};

window._outcomeShowDay = function (dateStr) {
  const popup = document.getElementById('day-detail-popup');
  if (!popup) return;
  let entry = null;
  try {
    const j = JSON.parse(localStorage.getItem('ds_symptom_journal') || '[]');
    entry = j.find(function (e) { return e.date === dateStr || (e.created_at || '').slice(0, 10) === dateStr; });
  } catch (_e) { /* no journal */ }
  popup.style.display = 'block';
  const df = new Date(dateStr).toLocaleDateString(getLocale() === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (entry) {
    const mood = entry.mood || entry.mood_score || '\u2014', nt = entry.notes || entry.free_text || '';
    popup.innerHTML = '<strong style="color:var(--text,#f1f5f9)">' + df + '</strong><div style="margin-top:6px">Mood: <strong style="color:var(--accent-teal,#2dd4bf)">' + mood + '</strong></div>' + (nt ? '<div style="margin-top:6px;line-height:1.5">&#8220;' + nt + '&#8221;</div>' : '');
  } else {
    popup.innerHTML = '<strong style="color:var(--text,#f1f5f9)">' + df + '</strong><div style="margin-top:6px">No journal entry for this day. Visit <a href="#" onclick="window._navPatient(\'pt-journal\');return false" style="color:var(--accent-teal,#2dd4bf)">Symptom Journal</a> to add one.</div>';
  }
};

// ── New outcome portal window handlers ────────────────────────────────────────
window._ptoCopyProgress = function () {
  const d = _ptoLoad();
  const pat = d.patient;
  const phq9m = (d.measures || []).find(function(m) { return m.id === 'phq9'; });
  const pts = phq9m ? phq9m.points : [];
  const baseline = pts.length ? pts[0].score : '?';
  const latest = pts.length ? pts[pts.length - 1].score : '?';
  const pct = (baseline > 0 && latest !== '?') ? Math.round(((baseline - latest) / baseline) * 100) : 0;
  const startFmt = new Date(pat.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const text = 'My TMS treatment progress: Started ' + startFmt + ', PHQ-9 improved from ' + baseline + ' to ' + latest + ' (' + pct + '% reduction). ' + pat.totalSessions + ' sessions completed.';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      window._showNotifToast && window._showNotifToast({ title: 'Copied!', body: 'Progress summary copied to clipboard.', severity: 'success' });
    }).catch(function () { prompt('Copy this summary:', text); });
  } else { prompt('Copy this summary:', text); }
};

window._ptoDownloadChart = function () {
  const svg = document.getElementById('pto-trend-svg');
  if (!svg) { alert('Chart not found.'); return; }
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement('canvas');
  const bbox = svg.getBoundingClientRect();
  canvas.width = Math.max(bbox.width || 860, 860);
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  img.onload = function () {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.download = 'outcome-chart-' + new Date().toISOString().slice(0, 10) + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  };
  img.onerror = function () { URL.revokeObjectURL(url); alert('Could not render chart image.'); };
  img.src = url;
};

window._ptoToggleAssessForm = function () {
  const f = document.getElementById('pto-assess-form');
  if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

window._ptoSubmitAssessment = function () {
  const phq9v = parseInt(document.getElementById('pto-phq9-input') ? document.getElementById('pto-phq9-input').value : '', 10);
  const gad7v = parseInt(document.getElementById('pto-gad7-input') ? document.getElementById('pto-gad7-input').value : '', 10);
  const pcl5v = parseInt(document.getElementById('pto-pcl5-input') ? document.getElementById('pto-pcl5-input').value : '', 10);
  if (isNaN(phq9v) && isNaN(gad7v)) {
    window._showNotifToast && window._showNotifToast({ title: 'Missing scores', body: 'Enter at least PHQ-9 or GAD-7.', severity: 'warning' });
    return;
  }
  const d = _ptoLoad();
  const today = new Date().toISOString().slice(0, 10);
  const addScore = function (id, score) {
    if (isNaN(score)) return;
    const m = (d.measures || []).find(function(m) { return m.id === id; });
    if (!m) return;
    const exists = m.points.find(function(pt) { return pt.date === today; });
    if (exists) { exists.score = score; } else { m.points.push({ date: today, score: score }); }
  };
  addScore('phq9', phq9v);
  addScore('gad7', gad7v);
  addScore('pcl5', pcl5v);
  d.nextAssessmentDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  localStorage.setItem(_PTO_SEED_KEY, JSON.stringify(d));
  // Also persist to API for cross-device and clinician visibility
  const _apiNow = new Date().toISOString();
  if (!isNaN(phq9v)) api.recordOutcome({ template_name: 'PHQ-9', score_numeric: phq9v, measurement_point: 'Self-report', administered_at: _apiNow }).catch(() => {});
  if (!isNaN(gad7v)) api.recordOutcome({ template_name: 'GAD-7', score_numeric: gad7v, measurement_point: 'Self-report', administered_at: _apiNow }).catch(() => {});
  if (!isNaN(pcl5v)) api.recordOutcome({ template_name: 'PCL-5', score_numeric: pcl5v, measurement_point: 'Self-report', administered_at: _apiNow }).catch(() => {});
  window._showNotifToast && window._showNotifToast({ title: 'Saved', body: 'Assessment scores recorded.', severity: 'success' });
  _renderProgressPage();
};

window._pgpAskAssistant = function(promptText) {
  if (window._navPatient) window._navPatient('ai-agents', { prompt: promptText });
};

// ── Exported page entry point ─────────────────────────────────────────────────
export async function pgPatientOutcomePortal(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('My Progress',
    '<div style="display:flex;gap:8px">' +
    '<button style="display:inline-flex;align-items:center;gap:6px;background:rgba(45,212,191,0.1);color:#2dd4bf;border:1px solid rgba(45,212,191,0.25);border-radius:8px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer" onclick="window._ptoCopyProgress()">&#8599; Share</button>' +
    '<button style="display:inline-flex;align-items:center;gap:6px;background:rgba(96,165,250,0.08);color:#60a5fa;border:1px solid rgba(96,165,250,0.2);border-radius:8px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer" onclick="window._outcomeDownloadReport()">&#8595; Report</button>' +
    '</div>'
  );
  await _ptoLoadLive().catch(() => null);
  _renderProgressPage();
}

// ════════════════════════════════════════════════════════════════════════════
// GUARDIAN PORTAL — Family & Caregiver Interface
// Route: guardian-portal | localStorage keys: ds_guardian_profiles, ds_guardian_messages,
//   ds_guardian_consents, ds_crisis_plans, ds_homework_plans, ds_active_guardian_patient
// ════════════════════════════════════════════════════════════════════════════

const _GP_SEED = {
  guardians: [{ id: 'guard1', name: 'Maria Santos', email: 'm.santos@email.com', phone: '555-0192', relation: 'Mother' }],
  linkedPatients: [
    { id: 'lp1', patientId: 'p_child', name: 'Diego Santos', age: 12, relation: 'Son', program: 'Pediatric Neurofeedback \u2013 ADHD', nextAppt: '2026-04-18', compliance: 87, accessLevel: 'full' },
    { id: 'lp2', patientId: 'p_adult', name: 'Carlos Santos', age: 34, relation: 'Brother', program: 'TMS \u2013 Depression Protocol', nextAppt: '2026-04-22', compliance: 72, accessLevel: 'view' },
  ],
  emergencyContacts: [
    { id: 'ec1', name: 'Maria Santos', relation: 'Mother', phone: '555-0192', priority: 1 },
    { id: 'ec2', name: 'Dr. Reyes', relation: 'Primary Care', phone: '555-0847', priority: 2 },
    { id: 'ec3', name: 'Crisis Line', relation: '24/7 Support', phone: '988', priority: 3 },
  ],
};

function _gpSeed() {
  if (!localStorage.getItem('ds_guardian_profiles')) localStorage.setItem('ds_guardian_profiles', JSON.stringify(_GP_SEED));
  if (!localStorage.getItem('ds_guardian_messages')) {
    localStorage.setItem('ds_guardian_messages', JSON.stringify([
      { id: 'gmsg1', patientId: 'p_child', from: 'care_team', fromName: 'Dr. Nguyen', text: 'Diego had a great session today \u2014 strong focus improvements noted.', ts: '2026-04-10T14:30:00Z', read: false },
      { id: 'gmsg2', patientId: 'p_child', from: 'guardian', fromName: 'Maria Santos', text: 'Thank you! He mentioned the new breathing exercise really helped.', ts: '2026-04-10T15:00:00Z', read: true },
      { id: 'gmsg3', patientId: 'p_adult', from: 'care_team', fromName: 'Dr. Patel', text: 'Carlos completed his 4th TMS session. He may feel mildly fatigued this evening.', ts: '2026-04-09T16:00:00Z', read: false },
    ]));
  }
  if (!localStorage.getItem('ds_guardian_consents')) {
    localStorage.setItem('ds_guardian_consents', JSON.stringify([
      { id: 'con1', patientId: 'p_child', title: 'Pediatric Neurofeedback Treatment Consent', signedDate: '2026-01-15', expiresDate: '2027-01-15', status: 'valid', categories: { sessionNotes: true, medicationInfo: true, biometricData: true, financialRecords: false } },
      { id: 'con2', patientId: 'p_child', title: 'HIPAA Authorization \u2013 Guardian Access', signedDate: '2026-01-15', expiresDate: '2026-07-15', status: 'expiring', categories: { sessionNotes: true, medicationInfo: false, biometricData: false, financialRecords: false } },
      { id: 'con3', patientId: 'p_adult', title: 'Adult TMS Treatment Consent (Power of Attorney)', signedDate: '2025-10-01', expiresDate: '2026-03-31', status: 'expired', categories: { sessionNotes: true, medicationInfo: true, biometricData: false, financialRecords: false } },
    ]));
  }
  if (!localStorage.getItem('ds_crisis_plans')) {
    localStorage.setItem('ds_crisis_plans', JSON.stringify([
      { patientId: 'p_child', warningSigns: ['Increased irritability or aggression', 'Refusal to attend sessions two or more times in a row', 'Sleep disturbance lasting more than three nights', 'Regression in focus or school performance'], deEscalation: ['Use calm, low-stimulation environment', 'Offer preferred comfort activity (LEGO, drawing)', 'Reduce screen time for 24 hours', 'Contact Dr. Nguyen before changing medication schedule'], emergencyOrder: ['ec1', 'ec2', 'ec3'] },
      { patientId: 'p_adult', warningSigns: ['Increased withdrawal or isolation', 'Expressing hopelessness or worthlessness', 'Missing two or more TMS appointments', 'Changes in sleep or appetite lasting more than one week'], deEscalation: ['Maintain daily check-in routine', 'Encourage light physical activity', 'Remove or secure items that could cause harm', 'Do not leave alone during acute distress'], emergencyOrder: ['ec1', 'ec2', 'ec3'] },
    ]));
  }
  if (!localStorage.getItem('ds_homework_plans')) {
    localStorage.setItem('ds_homework_plans', JSON.stringify([
      { id: 'hw1', patientId: 'p_child', task: 'Daily Breathing Exercise (5 min)', dueDate: '2026-04-12', status: 'pending', assisted: false },
      { id: 'hw2', patientId: 'p_child', task: 'Focus Journal \u2013 write 3 sentences before bed', dueDate: '2026-04-13', status: 'completed', assisted: true },
      { id: 'hw3', patientId: 'p_child', task: 'Outdoor activity \u2265 30 min', dueDate: '2026-04-14', status: 'pending', assisted: false },
      { id: 'hw4', patientId: 'p_child', task: 'Screen-free hour before bedtime', dueDate: '2026-04-15', status: 'pending', assisted: false },
      { id: 'hw5', patientId: 'p_adult', task: 'Mood check-in log (morning + evening)', dueDate: '2026-04-12', status: 'completed', assisted: false },
      { id: 'hw6', patientId: 'p_adult', task: 'Social activity \u2013 call a friend or family member', dueDate: '2026-04-14', status: 'pending', assisted: false },
    ]));
  }
  if (!localStorage.getItem('ds_active_guardian_patient')) localStorage.setItem('ds_active_guardian_patient', 'p_child');
}

function _gpLoad() {
  _gpSeed();
  return {
    profiles: JSON.parse(localStorage.getItem('ds_guardian_profiles') || '{}'),
    messages: JSON.parse(localStorage.getItem('ds_guardian_messages') || '[]'),
    consents: JSON.parse(localStorage.getItem('ds_guardian_consents') || '[]'),
    crisisPlans: JSON.parse(localStorage.getItem('ds_crisis_plans') || '[]'),
    homework: JSON.parse(localStorage.getItem('ds_homework_plans') || '[]'),
    activePatientId: localStorage.getItem('ds_active_guardian_patient') || 'p_child',
  };
}

function _gpBadge(lvl) {
  const m = { full: ['Full Access', 'full'], view: ['View Only', 'view'], emergency: ['Emergency Only', 'emergency'] };
  const [l, c] = m[lvl] || ['Unknown', 'view'];
  return `<span class="ooo-access-badge ooo-access-badge--${c}">${l}</span>`;
}

function _gpRing(pct, sz) {
  sz = sz || 80;
  const r = sz / 2 - 8, circ = 2 * Math.PI * r, dash = (pct / 100) * circ, cx = sz / 2, cy = sz / 2;
  const col = pct >= 80 ? 'var(--accent-teal,#2dd4bf)' : pct >= 60 ? 'var(--accent-amber,#fbbf24)' : 'var(--accent-rose,#fb7185)';
  return `<svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}" style="transform:rotate(-90deg)"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border,rgba(255,255,255,0.08))" stroke-width="7"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" stroke-linecap="round"/><text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="var(--text,#f1f5f9)" font-size="14" font-weight="700" style="transform:rotate(90deg);transform-origin:${cx}px ${cy}px">${pct}%</text></svg>`;
}

function _gpBars(days) {
  const W = 280, H = 80, bW = 28, gap = 12, totalW = days.length * (bW + gap) - gap, ox = (W - totalW) / 2;
  const bars = days.map((d, i) => { const x = ox + i * (bW + gap), bh = Math.max(4, (d.rate / 100) * H), y = H - bh, col = d.rate >= 80 ? '#2dd4bf' : d.rate >= 50 ? '#fbbf24' : '#fb7185'; return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bW}" height="${bh.toFixed(1)}" rx="5" fill="${col}" opacity="${d.rate === 0 ? 0.25 : 1}"/><text x="${(x + bW / 2).toFixed(1)}" y="${H + 16}" text-anchor="middle" fill="var(--text-muted,#94a3b8)" font-size="10">${d.label}</text>`; }).join('');
  return `<svg width="${W}" height="${H + 24}" viewBox="0 0 ${W} ${H + 24}" class="ooo-adherence-chart">${bars}</svg>`;
}

function _gpWeekData(hw, pid) {
  const lbs = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], today = new Date('2026-04-11'), td = today.getDay();
  return lbs.map((label, i) => { const d = new Date(today); d.setDate(today.getDate() - td + i); const ds = d.toISOString().slice(0, 10), tasks = hw.filter(h => h.patientId === pid && h.dueDate === ds); const rate = tasks.length === 0 ? (i < td ? 50 : 0) : Math.round((tasks.filter(h => h.status === 'completed').length / tasks.length) * 100); return { label, rate }; });
}

function _gpSpark(pid) {
  try {
    const j = JSON.parse(localStorage.getItem('ds_symptom_journal') || '[]'), entries = j.filter(e => e.patientId === pid || !e.patientId).slice(-8);
    const vals = entries.length >= 2 ? entries.map(e => Number(e.mood || e.mood_score || 5)) : [5, 4, 6, 5, 7, 6, 7, 8];
    return sparklineSVG(vals, '#2dd4bf');
  } catch (_e) { return ''; }
}

function _gpRender() {
  const { profiles, messages, consents, crisisPlans, homework, activePatientId: pid } = _gpLoad();
  const patients = profiles.linkedPatients || [], ecList = profiles.emergencyContacts || [];
  const activePt = patients.find(p => p.patientId === pid) || patients[0];
  const guardian = (profiles.guardians || [])[0] || { name: 'Guardian', relation: '', email: '' };
  const unread = messages.filter(m => m.patientId === pid && !m.read).length;
  const ptMsgs = messages.filter(m => m.patientId === pid);
  const ptCons = consents.filter(c => c.patientId === pid);
  const ptHw = homework.filter(h => h.patientId === pid);
  const crisis = crisisPlans.find(c => c.patientId === pid);
  const weekData = _gpWeekData(homework, pid);
  const clinicNotes = [
    { date: '2026-04-10', clinician: 'Dr. Nguyen', text: 'Patient showed strong response to theta/beta neurofeedback today. Sustained attention improved by approx. 18% from baseline. Homework compliance noted as excellent.' },
    { date: '2026-04-03', clinician: 'Dr. Nguyen', text: 'Mild difficulty staying on-task during the first 10 minutes, then settled well. Recommended extending outdoor activity to 45 min on non-session days.' },
    { date: '2026-03-27', clinician: 'Dr. Nguyen', text: 'Week 4 check-in complete. Overall trajectory positive. Guardian feedback incorporated \u2014 adjusted protocol timing to after-school schedule.' },
  ];

  // patient cards
  const ptCards = patients.map(pt => { const active = pt.patientId === pid; const cc = pt.compliance >= 80 ? 'var(--accent-teal,#2dd4bf)' : pt.compliance >= 60 ? 'var(--accent-amber,#fbbf24)' : 'var(--accent-rose,#fb7185)'; return `<div class="ooo-patient-card${active ? ' ooo-patient-card--active' : ''}" onclick="window._gpSwitch('${pt.patientId}')"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px"><div><div style="font-weight:700;font-size:1rem;color:var(--text,#f1f5f9)">${pt.name}</div><div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);margin-top:2px">Age ${pt.age} \u00b7 ${pt.relation}</div></div>${_gpBadge(pt.accessLevel)}</div><div style="font-size:0.82rem;color:var(--text-muted,#94a3b8);margin-bottom:8px">&#9639; ${pt.program}</div><div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted,#94a3b8);margin-bottom:14px"><span>Next: <strong style="color:var(--text,#f1f5f9)">${new Date(pt.nextAppt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong></span><span>Compliance: <strong style="color:${cc}">${pt.compliance}%</strong></span></div><button style="width:100%;padding:8px;border-radius:8px;border:1px solid ${active ? 'var(--accent-teal,#2dd4bf)' : 'var(--border,rgba(255,255,255,0.1))'};background:${active ? 'rgba(45,212,191,0.12)' : 'transparent'};color:${active ? 'var(--accent-teal,#2dd4bf)' : 'var(--text-muted,#94a3b8)'};font-size:0.82rem;font-weight:600;cursor:pointer">${active ? '\u2713 Currently Viewing' : 'Switch to Patient'}</button></div>`; }).join('');

  // treatment progress
  const treatHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-blue,#60a5fa)">&#9639;</span> Treatment Progress \u2014 ${activePt.name}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px"><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:10px">Current Protocol</div><div style="font-weight:600;color:var(--text,#f1f5f9);margin-bottom:4px">${activePt.program}</div><div style="font-size:0.85rem;color:var(--text-muted,#94a3b8);margin-bottom:16px">Week 6 of treatment</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8)">Next Session</div><div style="font-weight:600;color:var(--accent-teal,#2dd4bf);font-size:0.9rem;margin-top:2px">${new Date(activePt.nextAppt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-top:2px">Clinician: Dr. Nguyen \u00b7 10:00 AM</div></div><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px;display:flex;align-items:center;gap:20px">${_gpRing(activePt.compliance, 88)}<div><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:6px">Session Compliance</div><div style="font-weight:600;font-size:1.1rem;color:var(--text,#f1f5f9)">${activePt.compliance}%</div><div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);margin-top:4px">Sessions attended</div><div style="font-size:0.78rem;color:${activePt.compliance >= 80 ? 'var(--accent-teal,#2dd4bf)' : 'var(--accent-amber,#fbbf24)'};margin-top:6px">${activePt.compliance >= 80 ? 'Excellent progress' : 'Good \u2014 keep it up'}</div></div></div><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:10px">Symptom Trend \u2014 Last 8 Sessions</div><div style="margin-bottom:8px">${_gpSpark(pid)}</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8)">Higher is better \u00b7 Scale 1\u201310</div><div style="font-size:0.78rem;color:var(--accent-teal,#2dd4bf);margin-top:4px">\u2191 Improving trend</div></div></div><div style="margin-top:16px;background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:14px">Recent Clinician Notes (Guardian-Visible)</div><div style="display:flex;flex-direction:column;gap:12px">${clinicNotes.map(n => `<div style="padding:12px 16px;background:var(--hover-bg,rgba(255,255,255,0.04));border-radius:10px;border-left:3px solid var(--accent-blue,#60a5fa)"><div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.78rem;color:var(--text-muted,#94a3b8)"><span>${n.clinician}</span><span>${new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div><div style="font-size:0.87rem;color:var(--text,#f1f5f9);line-height:1.55">${n.text}</div></div>`).join('')}</div></div></section>`;

  // homework & adherence
  const hwHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-violet,#a78bfa)">&#9643;</span> Homework &amp; Adherence</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:14px">Assigned Tasks</div><div id="gp-homework-list" style="display:flex;flex-direction:column;gap:10px">${ptHw.map(hw => { const sbg = hw.status === 'completed' ? 'rgba(45,212,191,0.12)' : 'rgba(251,191,36,0.12)', sc = hw.status === 'completed' ? 'var(--accent-teal,#2dd4bf)' : 'var(--accent-amber,#fbbf24)'; return `<div style="padding:10px 12px;background:var(--hover-bg,rgba(255,255,255,0.04));border-radius:10px;border:1px solid var(--border,rgba(255,255,255,0.07))"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="flex:1"><div style="font-size:0.87rem;font-weight:600;color:var(--text,#f1f5f9);margin-bottom:3px">${hw.task}</div><div style="font-size:0.75rem;color:var(--text-muted,#94a3b8)">Due: ${new Date(hw.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${hw.assisted ? ' \u00b7 Guardian assisted' : ''}</div></div><span style="flex-shrink:0;padding:3px 9px;border-radius:20px;font-size:0.72rem;font-weight:700;background:${sbg};color:${sc}">${hw.status === 'completed' ? '\u2713 Done' : 'Pending'}</span></div>${hw.status !== 'completed' ? `<div style="display:flex;gap:8px;margin-top:8px"><button onclick="window._gpMarkHw('${hw.id}','completed')" style="flex:1;padding:5px 0;border-radius:7px;border:1px solid var(--accent-teal,#2dd4bf);background:transparent;color:var(--accent-teal,#2dd4bf);font-size:0.75rem;font-weight:600;cursor:pointer">Mark Complete</button><button onclick="window._gpMarkHw('${hw.id}','assisted')" style="flex:1;padding:5px 0;border-radius:7px;border:1px solid var(--accent-violet,#a78bfa);background:transparent;color:var(--accent-violet,#a78bfa);font-size:0.75rem;font-weight:600;cursor:pointer">Mark Assisted</button></div>` : ''}</div>`; }).join('')}</div><button onclick="window._gpEncourage()" style="margin-top:16px;width:100%;padding:10px;border-radius:10px;border:1px solid var(--accent-amber,#fbbf24);background:rgba(251,191,36,0.08);color:var(--accent-amber,#fbbf24);font-size:0.85rem;font-weight:600;cursor:pointer">&#128155; Send Encouragement</button></div><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:14px">Weekly Adherence</div><div style="overflow-x:auto">${_gpBars(weekData)}</div><div style="display:flex;gap:14px;margin-top:14px;flex-wrap:wrap"><span style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-muted,#94a3b8)"><span style="width:10px;height:10px;border-radius:2px;background:#2dd4bf;display:inline-block"></span>On track (\u226580%)</span><span style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-muted,#94a3b8)"><span style="width:10px;height:10px;border-radius:2px;background:#fbbf24;display:inline-block"></span>Partial (50\u201379%)</span><span style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-muted,#94a3b8)"><span style="width:10px;height:10px;border-radius:2px;background:#fb7185;display:inline-block"></span>Missed (&lt;50%)</span></div></div></div></section>`;

  // messaging
  const msgHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-teal,#2dd4bf)">&#9643;</span> Secure Messages${unread > 0 ? ` <span style="background:var(--accent-rose,#fb7185);color:#fff;border-radius:20px;padding:2px 9px;font-size:0.7rem;font-weight:700">${unread}</span>` : ''}</h2><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div class="ooo-message-thread" id="gp-message-thread" style="max-height:320px;overflow-y:auto;margin-bottom:16px">${ptMsgs.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-muted,#94a3b8);font-size:0.87rem">No messages yet. Send a message to your care team below.</div>' : ptMsgs.map(msg => { const g = msg.from === 'guardian'; const bg = g ? 'rgba(45,212,191,0.12)' : 'var(--hover-bg,rgba(255,255,255,0.05))', brd = g ? 'rgba(45,212,191,0.2)' : 'var(--border,rgba(255,255,255,0.08))', rad = g ? '14px 14px 4px 14px' : '14px 14px 14px 4px', dot = (!msg.read && !g) ? '<span style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;background:var(--accent-rose,#fb7185)"></span>' : ''; return `<div style="display:flex;flex-direction:column;align-items:${g ? 'flex-end' : 'flex-start'};margin-bottom:12px"><div style="max-width:78%;padding:10px 14px;border-radius:${rad};background:${bg};border:1px solid ${brd};position:relative">${dot}<div style="font-size:0.75rem;color:var(--text-muted,#94a3b8);margin-bottom:4px">${msg.fromName} \u00b7 ${new Date(msg.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div><div style="font-size:0.875rem;color:var(--text,#f1f5f9);line-height:1.5">${msg.text}</div></div></div>`; }).join('')}</div><div style="display:flex;gap:10px"><textarea id="gp-msg-input" placeholder="Type a message to your care team\u2026" rows="2" style="flex:1;padding:10px 14px;background:var(--hover-bg,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:10px;color:var(--text,#f1f5f9);font-size:0.87rem;resize:vertical;font-family:inherit;outline:none"></textarea><button onclick="window._gpSendMsg()" style="padding:10px 18px;border-radius:10px;border:none;background:var(--accent-teal,#2dd4bf);color:#0a0f1a;font-weight:700;font-size:0.85rem;cursor:pointer;flex-shrink:0;align-self:flex-end">Send</button></div><div style="margin-top:10px"><input id="gp-note-input" type="text" placeholder="Attach a brief note (optional)\u2026" style="width:100%;box-sizing:border-box;padding:8px 14px;background:var(--hover-bg,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;color:var(--text,#f1f5f9);font-size:0.82rem;font-family:inherit;outline:none"/></div></div></section>`;

  // consents
  const catL = { sessionNotes: 'Session Notes', medicationInfo: 'Medication Info', biometricData: 'Biometric Data', financialRecords: 'Financial Records' };
  const consentHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-amber,#fbbf24)">&#9673;</span> Consent &amp; Authorization</h2><div style="display:flex;flex-direction:column;gap:12px">${ptCons.map(con => { const stBg = con.status === 'valid' ? 'rgba(45,212,191,0.12)' : con.status === 'expiring' ? 'rgba(251,191,36,0.12)' : 'rgba(251,113,133,0.12)', stC = con.status === 'valid' ? 'var(--accent-teal,#2dd4bf)' : con.status === 'expiring' ? 'var(--accent-amber,#fbbf24)' : 'var(--accent-rose,#fb7185)', stL = con.status === 'valid' ? '\u2713 Valid' : con.status === 'expiring' ? '\u26a0 Expiring Soon' : '\u2715 Expired', rBtn = con.status !== 'valid' ? `<button onclick="window._gpResign('${con.id}')" style="padding:5px 14px;border-radius:8px;border:1px solid var(--accent-amber,#fbbf24);background:rgba(251,191,36,0.08);color:var(--accent-amber,#fbbf24);font-size:0.8rem;font-weight:600;cursor:pointer">Re-sign</button>` : '', catBtns = Object.keys(catL).map(k => { const on = con.categories[k]; return `<button onclick="window._gpToggleCat('${con.id}','${k}')" style="padding:4px 12px;border-radius:20px;border:1px solid ${on ? 'var(--accent-blue,#60a5fa)' : 'var(--border,rgba(255,255,255,0.1))'};background:${on ? 'rgba(96,165,250,0.1)' : 'transparent'};color:${on ? 'var(--accent-blue,#60a5fa)' : 'var(--text-muted,#94a3b8)'};font-size:0.75rem;cursor:pointer">${on ? '\u2713' : '\u25cb'} ${catL[k]}</button>`; }).join(''); return `<div class="ooo-consent-item"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div style="flex:1;min-width:200px"><div style="font-weight:600;font-size:0.9rem;color:var(--text,#f1f5f9);margin-bottom:3px">${con.title}</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8)">Signed: ${new Date(con.signedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u00b7 Expires: ${new Date(con.expiresDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div><div style="display:flex;align-items:center;gap:10px;flex-shrink:0"><span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${stBg};color:${stC}">${stL}</span>${rBtn}</div></div><div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">${catBtns}</div></div>`; }).join('')}</div></section>`;

  // emergency & crisis
  const eis = 'padding:7px 10px;background:var(--hover-bg,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:7px;color:var(--text,#f1f5f9);font-size:0.82rem;font-family:inherit;outline:none';
  const ecRows = ecList.map(ec => `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--hover-bg,rgba(255,255,255,0.04));border-radius:10px"><div style="width:28px;height:28px;border-radius:50%;background:rgba(251,113,133,0.15);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:var(--accent-rose,#fb7185);flex-shrink:0">${ec.priority}</div><div style="flex:1"><div style="font-weight:600;font-size:0.87rem;color:var(--text,#f1f5f9)">${ec.name}</div><div style="font-size:0.75rem;color:var(--text-muted,#94a3b8)">${ec.relation}</div></div><a href="tel:${ec.phone}" style="color:var(--accent-teal,#2dd4bf);font-size:0.87rem;font-weight:600;text-decoration:none">${ec.phone}</a></div>`).join('');
  const ecEditRows = ecList.map(ec => `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px"><input id="gp-ec-name-${ec.id}" value="${ec.name}" placeholder="Name" style="${eis}"/><input id="gp-ec-rel-${ec.id}" value="${ec.relation}" placeholder="Relation" style="${eis}"/><input id="gp-ec-phone-${ec.id}" value="${ec.phone}" placeholder="Phone" style="${eis}"/></div>`).join('');
  const crisisDetail = crisis ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div><div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--accent-amber,#fbbf24);margin-bottom:10px;font-weight:600">Warning Signs</div><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${crisis.warningSigns.map(s => `<li style="font-size:0.85rem;color:var(--text,#f1f5f9);line-height:1.5">${s}</li>`).join('')}</ul></div><div><div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--accent-teal,#2dd4bf);margin-bottom:10px;font-weight:600">De-escalation Steps</div><ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${crisis.deEscalation.map(s => `<li style="font-size:0.85rem;color:var(--text,#f1f5f9);line-height:1.5">${s}</li>`).join('')}</ol></div></div><div style="margin-top:14px;padding:12px 16px;background:rgba(251,113,133,0.06);border-radius:10px;border:1px solid rgba(251,113,133,0.15)"><div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--accent-rose,#fb7185);margin-bottom:8px;font-weight:600">If in immediate danger, call 911</div><div style="font-size:0.82rem;color:var(--text-muted,#94a3b8)">Then contact emergency contacts in priority order. Keep this plan accessible.</div></div>` : '<div style="color:var(--text-muted,#94a3b8);font-size:0.87rem">No crisis plan on file. Contact your care team to create one.</div>';
  const crisisHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-rose,#fb7185)">&#9888;</span> Emergency Contacts &amp; Crisis Plan</h2><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px;margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8)">Emergency Contacts</div><button onclick="window._gpToggleEdit()" style="padding:5px 12px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--text-muted,#94a3b8);font-size:0.78rem;cursor:pointer">Update Info</button></div><div id="gp-contacts-list" style="display:flex;flex-direction:column;gap:8px">${ecRows}</div><div id="gp-edit-contacts-form" style="display:none;margin-top:14px;border-top:1px solid var(--border,rgba(255,255,255,0.08));padding-top:14px">${ecEditRows}<div style="display:flex;gap:8px;margin-top:4px"><button onclick="window._gpSaveContacts()" style="padding:7px 18px;border-radius:8px;border:none;background:var(--accent-teal,#2dd4bf);color:#0a0f1a;font-weight:700;font-size:0.82rem;cursor:pointer">Save Changes</button><button onclick="window._gpCancelEdit()" style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--text-muted,#94a3b8);font-size:0.82rem;cursor:pointer">Cancel</button></div></div></div><div class="ooo-crisis-panel"><div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="window._gpToggleCrisis()"><div><div style="font-weight:600;font-size:0.92rem;color:var(--text,#f1f5f9)">Crisis &amp; Safety Plan \u2014 ${activePt.name}</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-top:2px">Know the warning signs and what to do</div></div><button id="gp-crisis-btn" style="background:rgba(251,113,133,0.1);border:1px solid rgba(251,113,133,0.25);color:var(--accent-rose,#fb7185);border-radius:8px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer">View Plan</button></div><div id="gp-crisis-detail" style="display:none;margin-top:16px;border-top:1px solid rgba(251,113,133,0.2);padding-top:16px">${crisisDetail}</div></div></section>`;

  document.getElementById('app-content').innerHTML = `<div style="max-width:960px;margin:0 auto;padding:24px 20px 60px"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:28px"><div><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:4px">Family &amp; Guardian Portal</div><h1 style="margin:0;font-size:1.5rem;font-weight:700;color:var(--text,#f1f5f9)">Welcome, ${guardian.name}</h1><div style="font-size:0.85rem;color:var(--text-muted,#94a3b8);margin-top:3px">${guardian.relation} \u00b7 ${guardian.email}</div></div><div style="display:flex;align-items:center;gap:10px">${unread > 0 ? `<span style="background:var(--accent-rose,#fb7185);color:#fff;border-radius:20px;padding:4px 12px;font-size:0.78rem;font-weight:700">${unread} unread message${unread > 1 ? 's' : ''}</span>` : ''}<div style="font-size:0.8rem;color:var(--text-muted,#94a3b8)">April 11, 2026</div></div></div><section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--accent-teal,#2dd4bf)">&#9673;</span> Your Linked Patients</h2><div class="ooo-patient-cards">${ptCards}</div></section>${treatHtml}${hwHtml}${msgHtml}${consentHtml}${crisisHtml}</div><div id="gp-resign-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:1000;align-items:center;justify-content:center;padding:20px"><div style="background:var(--bg-secondary,#0f172a);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:16px;padding:28px;max-width:520px;width:100%"><h3 style="margin:0 0 8px;color:var(--text,#f1f5f9);font-size:1.1rem">Re-sign Consent</h3><p id="gp-resign-title" style="color:var(--text-muted,#94a3b8);font-size:0.87rem;margin:0 0 16px"></p><div style="background:var(--hover-bg,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:10px;padding:16px;font-size:0.82rem;color:var(--text-muted,#94a3b8);line-height:1.6;margin-bottom:16px;max-height:160px;overflow-y:auto">I, the undersigned legal guardian, acknowledge and consent to the treatment protocols outlined by the care team at DeepSynaps Protocol Studio. I understand the nature of neuromodulation therapy, associated risks, and my right to withdraw consent at any time. I authorize the care team to share relevant treatment information with me as the authorized guardian. This consent is valid for one year from the date of signature.</div><div style="margin-bottom:14px"><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-bottom:6px">Signature (draw below):</div><canvas id="gp-sig-canvas" width="460" height="60" style="border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:8px;background:rgba(255,255,255,0.03);cursor:crosshair;touch-action:none;display:block;width:100%;max-width:460px"></canvas><button onclick="window._gpClearSig()" style="margin-top:6px;padding:4px 12px;border-radius:6px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--text-muted,#94a3b8);font-size:0.75rem;cursor:pointer">Clear Signature</button></div><div style="display:flex;gap:10px;justify-content:flex-end"><button onclick="window._gpCloseResign()" style="padding:8px 18px;border-radius:9px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--text-muted,#94a3b8);font-size:0.85rem;cursor:pointer">Cancel</button><button onclick="window._gpDoResign()" style="padding:8px 20px;border-radius:9px;border:none;background:var(--accent-teal,#2dd4bf);color:#0a0f1a;font-weight:700;font-size:0.85rem;cursor:pointer">Submit Signature</button></div></div></div>`;

  try { const m2 = JSON.parse(localStorage.getItem('ds_guardian_messages') || '[]'); localStorage.setItem('ds_guardian_messages', JSON.stringify(m2.map(m => m.patientId === pid ? { ...m, read: true } : m))); } catch (_e) { /* safe */ }
  setTimeout(() => { const t = document.getElementById('gp-message-thread'); if (t) t.scrollTop = t.scrollHeight; }, 50);
}

function _gpInitSig() {
  const c = document.getElementById('gp-sig-canvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  let drawing = false, lx = 0, ly = 0;
  function pos(e) { const r = c.getBoundingClientRect(), sx = c.width / r.width, sy = c.height / r.height, src = e.touches ? e.touches[0] : e; return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy }; }
  function ln(e) { const p = pos(e); ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke(); lx = p.x; ly = p.y; }
  c.addEventListener('mousedown', e => { drawing = true; const p = pos(e); lx = p.x; ly = p.y; });
  c.addEventListener('mousemove', e => { if (drawing) ln(e); });
  c.addEventListener('mouseup', () => { drawing = false; });
  c.addEventListener('mouseleave', () => { drawing = false; });
  c.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = pos(e); lx = p.x; ly = p.y; }, { passive: false });
  c.addEventListener('touchmove', e => { e.preventDefault(); if (drawing) ln(e); }, { passive: false });
  c.addEventListener('touchend', () => { drawing = false; });
}

window._gpSwitch = pid => { localStorage.setItem('ds_active_guardian_patient', pid); _gpRender(); };
window._gpMarkHw = (id, action) => { try { const hw = JSON.parse(localStorage.getItem('ds_homework_plans') || '[]'), i = hw.findIndex(h => h.id === id); if (i === -1) return; if (action === 'completed') { hw[i].status = 'completed'; hw[i].assisted = false; } if (action === 'assisted') hw[i].assisted = true; localStorage.setItem('ds_homework_plans', JSON.stringify(hw)); _gpRender(); } catch (_e) { /* safe */ } };
window._gpEncourage = () => { const pid = localStorage.getItem('ds_active_guardian_patient') || 'p_child', prof = JSON.parse(localStorage.getItem('ds_guardian_profiles') || '{}'), grd = (prof.guardians || [])[0] || { name: 'Guardian' }, pt = (prof.linkedPatients || []).find(p => p.patientId === pid), msgs = JSON.parse(localStorage.getItem('ds_guardian_messages') || '[]'); msgs.push({ id: 'genc_' + Date.now(), patientId: pid, from: 'guardian', fromName: grd.name, text: 'Encouragement sent to ' + (pt ? pt.name : 'the patient') + ': \u201cWe\u2019re proud of your hard work and progress. Keep going!\u201d', ts: new Date().toISOString(), read: true, type: 'encouragement' }); localStorage.setItem('ds_guardian_messages', JSON.stringify(msgs)); _gpRender(); setTimeout(() => { const t = document.getElementById('gp-message-thread'); if (t) t.scrollTop = t.scrollHeight; }, 50); };
window._gpSendMsg = () => { const inp = document.getElementById('gp-msg-input'), note = document.getElementById('gp-note-input'), text = inp ? inp.value.trim() : ''; if (!text) return; const pid = localStorage.getItem('ds_active_guardian_patient') || 'p_child', prof = JSON.parse(localStorage.getItem('ds_guardian_profiles') || '{}'), grd = (prof.guardians || [])[0] || { name: 'Guardian' }, msgs = JSON.parse(localStorage.getItem('ds_guardian_messages') || '[]'), nt = note ? note.value.trim() : ''; msgs.push({ id: 'gmsg_' + Date.now(), patientId: pid, from: 'guardian', fromName: grd.name, text: text + (nt ? '\n\nNote: ' + nt : ''), ts: new Date().toISOString(), read: true }); localStorage.setItem('ds_guardian_messages', JSON.stringify(msgs)); _gpRender(); setTimeout(() => { const t = document.getElementById('gp-message-thread'); if (t) t.scrollTop = t.scrollHeight; }, 50); };
window._gpResign = conId => { const cons = JSON.parse(localStorage.getItem('ds_guardian_consents') || '[]'), con = cons.find(c => c.id === conId), modal = document.getElementById('gp-resign-modal'); if (!modal || !con) return; const tEl = document.getElementById('gp-resign-title'); if (tEl) tEl.textContent = con.title; modal._consentId = conId; modal.style.display = 'flex'; _gpInitSig(); };
window._gpCloseResign = () => { const m = document.getElementById('gp-resign-modal'); if (m) m.style.display = 'none'; };
window._gpClearSig = () => { const c = document.getElementById('gp-sig-canvas'); if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height); };
window._gpDoResign = () => { const modal = document.getElementById('gp-resign-modal'); if (!modal) return; try { const cons = JSON.parse(localStorage.getItem('ds_guardian_consents') || '[]'), i = cons.findIndex(c => c.id === modal._consentId); if (i !== -1) { const now = new Date(), exp = new Date(now); exp.setFullYear(now.getFullYear() + 1); cons[i].status = 'valid'; cons[i].signedDate = now.toISOString().slice(0, 10); cons[i].expiresDate = exp.toISOString().slice(0, 10); localStorage.setItem('ds_guardian_consents', JSON.stringify(cons)); } } catch (_e) { /* safe */ } modal.style.display = 'none'; _gpRender(); };
window._gpToggleCat = (conId, cat) => { try { const cons = JSON.parse(localStorage.getItem('ds_guardian_consents') || '[]'), i = cons.findIndex(c => c.id === conId); if (i === -1) return; cons[i].categories[cat] = !cons[i].categories[cat]; localStorage.setItem('ds_guardian_consents', JSON.stringify(cons)); _gpRender(); } catch (_e) { /* safe */ } };
window._gpToggleCrisis = () => { const det = document.getElementById('gp-crisis-detail'), btn = document.getElementById('gp-crisis-btn'); if (!det) return; const h = det.style.display === 'none'; det.style.display = h ? 'block' : 'none'; if (btn) btn.textContent = h ? 'Hide Plan' : 'View Plan'; };
window._gpToggleEdit = () => { const form = document.getElementById('gp-edit-contacts-form'), list = document.getElementById('gp-contacts-list'); if (!form) return; const s = form.style.display !== 'none'; form.style.display = s ? 'none' : 'block'; if (list) list.style.display = s ? 'flex' : 'none'; };
window._gpCancelEdit = () => { const form = document.getElementById('gp-edit-contacts-form'), list = document.getElementById('gp-contacts-list'); if (form) form.style.display = 'none'; if (list) list.style.display = 'flex'; };
window._gpSaveContacts = () => { try { const prof = JSON.parse(localStorage.getItem('ds_guardian_profiles') || '{}'); (prof.emergencyContacts || []).forEach(ec => { const n = document.getElementById('gp-ec-name-' + ec.id), r = document.getElementById('gp-ec-rel-' + ec.id), p = document.getElementById('gp-ec-phone-' + ec.id); if (n) ec.name = n.value; if (r) ec.relation = r.value; if (p) ec.phone = p.value; }); localStorage.setItem('ds_guardian_profiles', JSON.stringify(prof)); } catch (_e) { /* safe */ } _gpRender(); };

// ── Home Device pages ─────────────────────────────────────────────────────────

// Shared HTML escaper for home-device pages
function _hdEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

// ── pgPatientHomeDevice ───────────────────────────────────────────────────────
export async function pgPatientHomeDevice() {
  setTopbar(t('patient.nav.home_device'));
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  let assignment = null;
  try { assignment = await api.portalGetHomeDevice(); } catch (_e) { assignment = null; }

  if (!assignment) {
    el.innerHTML = `
      <div class="pt-portal-empty" style="padding:60px 24px">
        <div class="pt-portal-empty-ico" aria-hidden="true" style="font-size:32px">⚡</div>
        <div class="pt-portal-empty-title">No Home Device Assigned</div>
        <div class="pt-portal-empty-body">Your care team has not assigned a home device yet. Once they do, your device details, schedule, and session log will appear here.</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:18px" onclick="window._navPatient('patient-messages')">Contact Your Care Team →</button>
      </div>`;
    return;
  }

  const deviceName   = _hdEsc(assignment.device_name || assignment.device_slug || 'Home Device');
  const category     = _hdEsc(assignment.device_category || assignment.modality_slug || '');
  const frequency    = _hdEsc(assignment.prescribed_frequency || assignment.frequency || '');
  const instructions = _hdEsc(assignment.instructions || assignment.notes || '');
  const startDate    = fmtDate(assignment.start_date || assignment.assigned_at || assignment.created_at);
  const endDate      = assignment.end_date ? fmtDate(assignment.end_date) : null;
  const totalSessions    = assignment.total_sessions_prescribed ?? null;
  const completedSessions = assignment.sessions_completed ?? assignment.session_count ?? 0;
  const adherencePct = (totalSessions && completedSessions != null)
    ? Math.min(100, Math.round((completedSessions / totalSessions) * 100)) : null;

  // Adherence ring SVG
  function adherenceRingSVG(pct) {
    if (pct == null) return '';
    const r = 36; const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    const color = pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--amber,#f59e0b)' : '#ff6b6b';
    return `<div style="position:relative;width:96px;height:96px;flex-shrink:0">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7"/>
        <circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="7"
          stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${circ / 4}"
          stroke-linecap="round" style="transition:stroke-dasharray 1s ease"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
        <div style="font-size:18px;font-weight:700;color:${color}">${pct}%</div>
        <div style="font-size:9px;color:var(--text-tertiary);margin-top:1px">adherence</div>
      </div>
    </div>`;
  }

  el.innerHTML = `
    <!-- Device card -->
    <div class="card" style="margin-bottom:20px;border-color:var(--border-teal)">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>⚡ ${deviceName}</h3>
        <span class="pill pill-active" style="font-size:10.5px">Active</span>
      </div>
      <div class="card-body">
        <div class="g2">
          <div>
            ${category    ? `<div class="field-row"><span>Category</span><span>${category}</span></div>` : ''}
            ${frequency   ? `<div class="field-row"><span>Prescribed Frequency</span><span>${frequency}</span></div>` : ''}
            <div class="field-row"><span>Assigned</span><span>${_hdEsc(startDate)}</span></div>
            ${endDate     ? `<div class="field-row"><span>Target End</span><span>${_hdEsc(endDate)}</span></div>` : ''}
            ${totalSessions != null ? `<div class="field-row"><span>Sessions Prescribed</span><span>${totalSessions}</span></div>` : ''}
            <div class="field-row"><span>Sessions Completed</span><span>${completedSessions}</span></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
            ${adherenceRingSVG(adherencePct)}
            ${adherencePct != null
              ? `<div style="font-size:11px;color:var(--text-tertiary);text-align:center">${completedSessions} of ${totalSessions} sessions</div>`
              : `<div style="font-size:12px;color:var(--text-tertiary);text-align:center">No target set</div>`}
          </div>
        </div>
        ${instructions ? `
        <div class="notice notice-info" style="margin-top:16px;font-size:12.5px;line-height:1.65">
          <strong>Instructions:</strong> ${instructions}
        </div>` : ''}
      </div>
    </div>

    <!-- CTA buttons -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
      <button class="btn btn-primary" style="flex:1;min-width:130px" onclick="window._navPatient('pt-home-session-log')">Log Session</button>
      <button class="btn btn-ghost"   style="flex:1;min-width:130px" onclick="window._navPatient('pt-adherence-events')">Report Issue</button>
      <button class="btn btn-ghost"   style="flex:1;min-width:130px" onclick="window._navPatient('pt-adherence-history')">View History</button>
    </div>

    <!-- Encouragement -->
    <div class="card" style="margin-bottom:20px;border-color:rgba(0,212,188,0.2);background:rgba(0,212,188,0.03)">
      <div class="card-body" style="padding:16px 20px">
        <div style="font-size:13px;font-weight:600;color:var(--teal);margin-bottom:6px">Keep going!</div>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">
          Consistent home device use is an important part of your treatment plan. Even short sessions as prescribed help your brain respond to therapy. Your care team can see your session logs and will check in with you regularly.
        </div>
      </div>
    </div>
  `;
}

// ── pgPatientHomeSessionLog ───────────────────────────────────────────────────
export async function pgPatientHomeSessionLog() {
  setTopbar('Log Home Session');
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  let sessions = [];
  try {
    const raw = await api.portalListHomeSessions();
    sessions = Array.isArray(raw) ? raw : [];
  } catch (_e) { sessions = []; }

  const todayStr = new Date().toISOString().slice(0, 10);

  // Tolerance button helper
  function tolButtons(name, selectedVal) {
    return [1,2,3,4,5].map(v => `
      <button type="button"
        id="${name}-${v}"
        class="pt-tol-btn${selectedVal === v ? ' selected' : ''}"
        style="width:38px;height:38px;border-radius:50%;border:2px solid var(--border);background:${selectedVal === v ? 'var(--teal)' : 'var(--surface)'};color:${selectedVal === v ? '#000' : 'var(--text-primary)'};font-weight:600;font-size:14px;cursor:pointer;transition:all .15s"
        onclick="window._hdTolPick('${name}', ${v})">${v}</button>
    `).join('');
  }

  el.innerHTML = `
    <!-- Session log form -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h3>Log a Home Session</h3></div>
      <div class="card-body" style="padding:20px">
        <div class="form-group">
          <label class="form-label">Session Date</label>
          <input type="date" id="hsl-date" class="form-control" value="${todayStr}" max="${todayStr}">
        </div>
        <div class="form-group">
          <label class="form-label">Duration (minutes)</label>
          <input type="number" id="hsl-duration" class="form-control" min="1" max="480" placeholder="e.g. 30">
        </div>
        <div class="form-group">
          <label class="form-label">Tolerance (1 = very easy, 5 = very difficult)</label>
          <div style="display:flex;gap:8px;margin-top:6px" id="hsl-tol-wrap">
            ${tolButtons('hsl-tol', null)}
          </div>
          <input type="hidden" id="hsl-tolerance" value="">
        </div>
        <div class="form-group">
          <label class="form-label">Mood Before Session (1 = very low, 5 = very good)</label>
          <div style="display:flex;gap:8px;margin-top:6px" id="hsl-mood-before-wrap">
            ${tolButtons('hsl-mood-before', null)}
          </div>
          <input type="hidden" id="hsl-mood-before" value="">
        </div>
        <div class="form-group">
          <label class="form-label">Mood After Session (1 = very low, 5 = very good)</label>
          <div style="display:flex;gap:8px;margin-top:6px" id="hsl-mood-after-wrap">
            ${tolButtons('hsl-mood-after', null)}
          </div>
          <input type="hidden" id="hsl-mood-after" value="">
        </div>
        <div class="form-group">
          <label class="form-label">Side Effects (if any)</label>
          <textarea id="hsl-side-effects" class="form-control" rows="2" placeholder="e.g. mild headache, tingling, none"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea id="hsl-notes" class="form-control" rows="2" placeholder="Any other observations…"></textarea>
        </div>
        <div class="form-group" style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="hsl-completed" checked style="width:16px;height:16px;accent-color:var(--teal);cursor:pointer">
          <label for="hsl-completed" style="font-size:13px;font-weight:500;color:var(--text-primary);cursor:pointer">Session completed as prescribed</label>
        </div>
        <div id="hsl-status" style="display:none;margin-bottom:10px;font-size:13px"></div>
        <button class="btn btn-primary" style="width:100%;padding:11px" onclick="window._hslSubmit()">Save Session Log →</button>
      </div>
    </div>

    <!-- Past sessions list -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Session History</h3>
        <span style="font-size:12px;color:var(--text-tertiary)">${sessions.length} session${sessions.length !== 1 ? 's' : ''} logged</span>
      </div>
      <div id="hsl-history-list" style="padding:0 0 4px">
        ${sessions.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">No sessions logged yet. Use the form above to add your first session.</div>`
          : sessions.slice().sort((a,b) => new Date(b.session_date||b.created_at||0)-new Date(a.session_date||a.created_at||0)).map(s => {
              const tol  = s.tolerance_rating != null ? `Tol: ${_hdEsc(String(s.tolerance_rating))}` : '';
              const dur  = s.duration_minutes ? `${s.duration_minutes} min` : '';
              const done = s.completed !== false;
              return `<div style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-bottom:1px solid var(--border)">
                <span style="font-size:14px;color:${done ? 'var(--teal)' : 'var(--text-tertiary)'}">${done ? '✓' : '○'}</span>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${fmtDate(s.session_date||s.created_at)}</div>
                  <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px">${[dur, tol].filter(Boolean).join(' · ') || 'No details'}</div>
                  ${s.side_effects ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${_hdEsc(s.side_effects)}</div>` : ''}
                </div>
                <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${done ? 'rgba(0,212,188,0.1)' : 'rgba(148,163,184,0.1)'};color:${done ? 'var(--teal)' : 'var(--text-tertiary)'}">${done ? 'Done' : 'Partial'}</span>
              </div>`;
            }).join('')}
      </div>
    </div>
  `;

  // Tolerance/mood picker state
  const _hdSelections = {};

  window._hdTolPick = function(name, val) {
    _hdSelections[name] = val;
    // Update hidden input
    const hidden = document.getElementById(name);
    if (hidden) hidden.value = String(val);
    // Update button styles
    [1,2,3,4,5].forEach(v => {
      const btn = document.getElementById(`${name}-${v}`);
      if (!btn) return;
      const sel = v === val;
      btn.style.background = sel ? 'var(--teal)' : 'var(--surface)';
      btn.style.color = sel ? '#000' : 'var(--text-primary)';
      btn.style.borderColor = sel ? 'var(--teal)' : 'var(--border)';
    });
  };

  window._hslSubmit = async function() {
    const dateEl       = document.getElementById('hsl-date');
    const durationEl   = document.getElementById('hsl-duration');
    const tolEl        = document.getElementById('hsl-tolerance');
    const moodBeforeEl = document.getElementById('hsl-mood-before');
    const moodAfterEl  = document.getElementById('hsl-mood-after');
    const sideEl       = document.getElementById('hsl-side-effects');
    const notesEl      = document.getElementById('hsl-notes');
    const completedEl  = document.getElementById('hsl-completed');
    const statusEl     = document.getElementById('hsl-status');

    const sessionDate = dateEl?.value;
    if (!sessionDate) {
      if (statusEl) { statusEl.style.display=''; statusEl.style.color='#ff6b6b'; statusEl.textContent='Please select a session date.'; }
      return;
    }

    const payload = {
      session_date:     sessionDate,
      duration_minutes: durationEl?.value ? parseInt(durationEl.value, 10) : null,
      tolerance_rating: tolEl?.value ? parseInt(tolEl.value, 10) : null,
      mood_before:      moodBeforeEl?.value ? parseInt(moodBeforeEl.value, 10) : null,
      mood_after:       moodAfterEl?.value ? parseInt(moodAfterEl.value, 10) : null,
      side_effects:     sideEl?.value?.trim() || null,
      notes:            notesEl?.value?.trim() || null,
      completed:        completedEl?.checked !== false,
    };

    const btn = el.querySelector('button.btn-primary[onclick*="_hslSubmit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    if (statusEl) statusEl.style.display = 'none';

    try {
      await api.portalLogHomeSession(payload);
      if (statusEl) {
        statusEl.style.display='';
        statusEl.style.color='var(--teal)';
        statusEl.textContent='Session logged successfully!';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Save Session Log →'; }
      // Refresh the page to show updated history
      setTimeout(() => pgPatientHomeSessionLog(), 800);
    } catch (err) {
      if (statusEl) {
        statusEl.style.display='';
        statusEl.style.color='#ff6b6b';
        statusEl.textContent='Could not save session: ' + (err?.message || 'Unknown error');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Save Session Log →'; }
    }
  };
}

// ── pgPatientAdherenceEvents ──────────────────────────────────────────────────
export async function pgPatientAdherenceEvents() {
  setTopbar('Report Adherence Event');
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  let events = [];
  try {
    const raw = await api.portalListAdherenceEvents();
    events = Array.isArray(raw) ? raw : [];
  } catch (_e) { events = []; }

  const todayStr = new Date().toISOString().slice(0, 10);

  const SEVERITY_COLORS = { low:'var(--teal)', moderate:'var(--blue)', high:'var(--amber,#f59e0b)', urgent:'#ff6b6b' };
  const EVENT_TYPE_LABELS = {
    adherence_report: 'Adherence Report',
    side_effect: 'Side Effect',
    tolerance_change: 'Tolerance Change',
    break_request: 'Break Request',
    concern: 'Concern',
    positive_feedback: 'Positive Feedback',
  };

  el.innerHTML = `
    <!-- Report form -->
    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h3>Report an Adherence Event</h3></div>
      <div class="card-body" style="padding:20px">
        <div class="form-group">
          <label class="form-label">Event Type</label>
          <select id="hae-type" class="form-control">
            <option value="">Select type…</option>
            <option value="adherence_report">Adherence Report</option>
            <option value="side_effect">Side Effect</option>
            <option value="tolerance_change">Tolerance Change</option>
            <option value="break_request">Break Request</option>
            <option value="concern">Concern</option>
            <option value="positive_feedback">Positive Feedback</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Severity</label>
          <select id="hae-severity" class="form-control">
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
            <option value="urgent">Urgent — contact clinic immediately</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="hae-date" class="form-control" value="${todayStr}" max="${todayStr}">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea id="hae-body" class="form-control" rows="4" placeholder="Describe what happened, how you felt, or any symptoms you noticed…"></textarea>
        </div>
        <div id="hae-status" style="display:none;margin-bottom:10px;font-size:13px"></div>
        <button class="btn btn-primary" style="width:100%;padding:11px" onclick="window._haeSubmit()">Submit Report →</button>
        <div class="notice notice-info" style="margin-top:12px;font-size:12px">
          For medical emergencies call your local emergency number. This form is for non-urgent reports only.
        </div>
      </div>
    </div>

    <!-- Event history -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Report History</h3>
        <span style="font-size:12px;color:var(--text-tertiary)">${events.length} report${events.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="padding:0 0 4px">
        ${events.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">No reports yet.</div>`
          : events.slice().sort((a,b) => new Date(b.report_date||b.created_at||0)-new Date(a.report_date||a.created_at||0)).map(ev => {
              const sev   = ev.severity || 'low';
              const color = SEVERITY_COLORS[sev] || 'var(--text-secondary)';
              const label = EVENT_TYPE_LABELS[ev.event_type] || _hdEsc(ev.event_type || 'Report');
              const ack   = ev.acknowledged ? ' · Acknowledged' : '';
              return `<div style="padding:12px 18px;border-bottom:1px solid var(--border)">
                <div style="display:flex;align-items:flex-start;gap:10px">
                  <div style="flex:1">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                      <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${_hdEsc(label)}</span>
                      <span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${color}22;color:${color};font-weight:600">${_hdEsc(sev)}</span>
                    </div>
                    <div style="font-size:11.5px;color:var(--text-tertiary)">${fmtDate(ev.report_date||ev.created_at)}${_hdEsc(ack)}</div>
                    ${ev.body ? `<div style="font-size:12.5px;color:var(--text-secondary);margin-top:5px;line-height:1.55">${_hdEsc(ev.body)}</div>` : ''}
                  </div>
                </div>
              </div>`;
            }).join('')}
      </div>
    </div>
  `;

  window._haeSubmit = async function() {
    const typeEl     = document.getElementById('hae-type');
    const severityEl = document.getElementById('hae-severity');
    const dateEl     = document.getElementById('hae-date');
    const bodyEl     = document.getElementById('hae-body');
    const statusEl   = document.getElementById('hae-status');

    if (!typeEl?.value) {
      if (statusEl) { statusEl.style.display=''; statusEl.style.color='#ff6b6b'; statusEl.textContent='Please select an event type.'; }
      return;
    }
    if (!bodyEl?.value?.trim()) {
      if (statusEl) { statusEl.style.display=''; statusEl.style.color='#ff6b6b'; statusEl.textContent='Please add a description.'; }
      return;
    }

    const payload = {
      event_type:  typeEl.value,
      severity:    severityEl?.value || 'low',
      report_date: dateEl?.value || new Date().toISOString().slice(0,10),
      body:        bodyEl.value.trim(),
    };

    const btn = el.querySelector('button.btn-primary[onclick*="_haeSubmit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
    if (statusEl) statusEl.style.display = 'none';

    try {
      await api.portalSubmitAdherenceEvent(payload);
      if (statusEl) {
        statusEl.style.display='';
        statusEl.style.color='var(--teal)';
        statusEl.textContent='Report submitted successfully. Your care team has been notified.';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Report →'; }
      setTimeout(() => pgPatientAdherenceEvents(), 1000);
    } catch (err) {
      if (statusEl) {
        statusEl.style.display='';
        statusEl.style.color='#ff6b6b';
        statusEl.textContent='Could not submit report: ' + (err?.message || 'Unknown error');
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Report →'; }
    }
  };
}

// ── pgPatientAdherenceHistory ─────────────────────────────────────────────────
export async function pgPatientAdherenceHistory() {
  setTopbar(t('patient.nav.adherence'));
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  let summary = null;
  let sessions = [];
  try {
    [summary, sessions] = await Promise.all([
      api.portalHomeAdherenceSummary().catch(() => null),
      api.portalListHomeSessions().catch(() => []),
    ]);
  } catch (_e) { /* handled below */ }

  const sessArr = Array.isArray(sessions) ? sessions : [];
  const s = summary || {};

  // Stats
  const totalSessions   = s.total_sessions    ?? sessArr.length;
  const completedCount  = s.completed_sessions ?? sessArr.filter(x => x.completed !== false).length;
  const completedRate   = totalSessions > 0 ? Math.round((completedCount / totalSessions) * 100) : 0;
  const currentStreak   = s.current_streak   ?? 0;
  const longestStreak   = s.longest_streak   ?? 0;
  const avgTolerance    = s.avg_tolerance    != null
    ? Number(s.avg_tolerance).toFixed(1)
    : (sessArr.filter(x => x.tolerance_rating != null).length > 0
        ? (sessArr.reduce((acc, x) => acc + (x.tolerance_rating ?? 0), 0) / sessArr.filter(x => x.tolerance_rating != null).length).toFixed(1)
        : null);
  const avgMoodBefore = s.avg_mood_before != null ? Number(s.avg_mood_before).toFixed(1) : null;
  const avgMoodAfter  = s.avg_mood_after  != null ? Number(s.avg_mood_after).toFixed(1)  : null;

  // Weekly bar chart data (8 weeks)
  const weeklyData = Array.isArray(s.weekly_sessions) ? s.weekly_sessions : [];

  // Build 8-week local data if no server data
  function buildLocalWeekly() {
    if (!sessArr.length) return Array(8).fill(0);
    const weeks = Array(8).fill(0);
    const now = Date.now();
    sessArr.forEach(sess => {
      const d = new Date(sess.session_date || sess.created_at || 0);
      const msAgo = now - d.getTime();
      const weekIdx = Math.floor(msAgo / (7 * 86400000));
      if (weekIdx >= 0 && weekIdx < 8) weeks[7 - weekIdx]++;
    });
    return weeks;
  }

  const chartData = weeklyData.length >= 8
    ? weeklyData.slice(-8).map(w => (typeof w === 'object' ? (w.count ?? w.sessions ?? 0) : Number(w)))
    : buildLocalWeekly();

  const maxBar = Math.max(...chartData, 1);

  // Simple bar chart SVG
  function barChartHTML(data) {
    const w = 280; const h = 80; const barW = 26; const gap = 10;
    const totalW = data.length * (barW + gap) - gap;
    const startX = (w - totalW) / 2;
    const bars = data.map((v, i) => {
      const barH = Math.max(2, Math.round((v / maxBar) * (h - 20)));
      const x = startX + i * (barW + gap);
      const y = h - barH;
      const color = v === 0 ? 'rgba(255,255,255,0.07)' : 'var(--teal)';
      return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${color}"/>
              <text x="${x + barW/2}" y="${h + 14}" text-anchor="middle" font-size="9" fill="var(--text-tertiary)">W${i+1}</text>
              ${v > 0 ? `<text x="${x + barW/2}" y="${y - 4}" text-anchor="middle" font-size="9" fill="var(--text-secondary)">${v}</text>` : ''}`;
    }).join('');
    return `<svg width="${w}" height="${h + 20}" viewBox="0 0 ${w} ${h + 20}" style="overflow:visible">${bars}</svg>`;
  }

  // Stat card helper
  function statCard(label, value, sub, color) {
    return `<div class="card" style="padding:16px;text-align:center;border-color:rgba(${color},0.3)">
      <div style="font-size:24px;font-weight:700;font-family:var(--font-display);color:rgb(${color})">${_hdEsc(String(value ?? '—'))}</div>
      <div style="font-size:11.5px;font-weight:600;color:var(--text-primary);margin-top:4px">${_hdEsc(label)}</div>
      ${sub ? `<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:3px">${_hdEsc(sub)}</div>` : ''}
    </div>`;
  }

  el.innerHTML = `
    <!-- Stats grid -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px">
      ${statCard('Total Sessions', totalSessions, 'logged', '0,212,188')}
      ${statCard('Completed Rate', completedRate + '%', completedCount + ' of ' + totalSessions, '74,158,255')}
      ${statCard('Current Streak', currentStreak, currentStreak === 1 ? 'day' : 'days', '167,139,250')}
      ${statCard('Avg Tolerance', avgTolerance ?? '—', 'out of 5', '0,212,188')}
      ${avgMoodBefore != null ? statCard('Avg Mood Before', avgMoodBefore, 'out of 5', '74,158,255') : ''}
      ${avgMoodAfter  != null ? statCard('Avg Mood After',  avgMoodAfter,  'out of 5', '52,211,153') : ''}
    </div>

    <!-- Weekly chart -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header"><h3>Sessions per Week (last 8 weeks)</h3></div>
      <div class="card-body" style="padding:16px 20px;display:flex;justify-content:center">
        ${barChartHTML(chartData)}
      </div>
    </div>

    <!-- Full session log table -->
    <div class="card" style="margin-bottom:20px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        <h3>Full Session Log</h3>
        <span style="font-size:12px;color:var(--text-tertiary)">${sessArr.length} session${sessArr.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="overflow-x:auto">
        ${sessArr.length === 0
          ? `<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">No sessions logged yet.</div>`
          : `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
              <thead>
                <tr style="border-bottom:1px solid var(--border)">
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary);white-space:nowrap">Date</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary)">Duration</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary)">Tolerance</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary)">Mood ↑</th>
                  <th style="padding:10px 16px;text-align:left;font-weight:600;color:var(--text-secondary)">Status</th>
                </tr>
              </thead>
              <tbody>
                ${sessArr.slice().sort((a,b)=>new Date(b.session_date||b.created_at||0)-new Date(a.session_date||a.created_at||0)).map(s => {
                  const done = s.completed !== false;
                  const mb = s.mood_before != null ? String(s.mood_before) : '—';
                  const ma = s.mood_after  != null ? String(s.mood_after)  : '—';
                  return `<tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:10px 16px;color:var(--text-primary)">${fmtDate(s.session_date||s.created_at)}</td>
                    <td style="padding:10px 16px;color:var(--text-secondary)">${s.duration_minutes ? s.duration_minutes + ' min' : '—'}</td>
                    <td style="padding:10px 16px;color:var(--text-secondary)">${s.tolerance_rating != null ? s.tolerance_rating + '/5' : '—'}</td>
                    <td style="padding:10px 16px;color:var(--text-secondary)">${mb} → ${ma}</td>
                    <td style="padding:10px 16px"><span style="font-size:10px;padding:2px 8px;border-radius:99px;background:${done?'rgba(0,212,188,0.1)':'rgba(148,163,184,0.1)'};color:${done?'var(--teal)':'var(--text-tertiary)'}">${done?'Done':'Partial'}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`}
      </div>
    </div>

    <!-- Navigation links -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:4px">
      <button class="btn btn-ghost btn-sm" style="flex:1;min-width:130px" onclick="window._navPatient('pt-home-device')">← Home Device</button>
      <button class="btn btn-ghost btn-sm" style="flex:1;min-width:130px" onclick="window._navPatient('pt-home-session-log')">Log New Session →</button>
    </div>
  `;
}

export async function pgGuardianPortal(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('Guardian Portal', '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:0.8rem;color:var(--text-muted,#94a3b8)">Family &amp; Caregiver Access</span><button style="display:inline-flex;align-items:center;gap:6px;background:rgba(251,113,133,0.1);color:var(--accent-rose,#fb7185);border:1px solid rgba(251,113,133,0.25);border-radius:8px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer" onclick="window._gpToggleCrisis();setTimeout(function(){var el=document.getElementById(\'gp-crisis-detail\');if(el)el.scrollIntoView({behavior:\'smooth\'})},50)">&#9888; Crisis Plan</button></div>');
  _gpRender();
}

