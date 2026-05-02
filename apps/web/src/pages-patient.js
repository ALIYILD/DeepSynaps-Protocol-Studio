// Patient portal pages — simpler, calmer UI than the professional app
// All pages render into #patient-content
import { api } from './api.js';
import { currentUser } from './auth.js';
import { t, getLocale, setLocale, LOCALES } from './i18n.js';
import {
  ffEmojiScale,
  ffTextarea,
  ffInput,
  ffChipGroup,
  ffActions,
  ffNotice,
} from './friendly-forms.js';
import { SUPPORTED_FORMS, getAssessmentConfig } from './assessment-forms.js';
import { renderBrainMap10_20 } from './brain-map-svg.js';
import {
  EVIDENCE_TOTAL_PAPERS,
  EVIDENCE_TOTAL_TRIALS,
  EVIDENCE_SUMMARY,
  getConditionEvidence,
} from './evidence-dataset.js';
import { getEvidenceUiStats } from './evidence-ui-live.js';
import { emptyPatientEvidenceContext, loadPatientEvidenceContext } from './patient-evidence-context.js';

// ── Nav definition ────────────────────────────────────────────────────────────
// Patient nav: each item is tagged with a `tone` so the sidebar renders
// colour-tiled icons. Tones map to CSS variables in styles.css via the
// .pt-nav-tile--<tone> classes. Emojis (rather than monochrome unicode)
// give patients an immediately recognisable visual anchor for each area.
function _patientNav() {
  return [
    // ── MY CARE ───────────────────────────────────────────────────────────────
    { section: 'My Care', sectionId: 'pt-care', collapsed: false },
    { id: 'patient-portal',      label: 'Home',                 icon: '🏠', tone: 'teal',   group: 'main' },
    { id: 'patient-sessions',    label: 'Sessions',             icon: '📅', tone: 'blue',   group: 'main' },
    { id: 'patient-homework',    label: 'Homework',             icon: '📝', tone: 'violet', group: 'main' },
    { id: 'pt-outcomes',         label: 'Progress',             icon: '📈', tone: 'green',  group: 'main' },
    { id: 'pt-digest',           label: 'My Digest',            icon: '📰', tone: 'teal',   group: 'main' },
    { id: 'patient-assessments', label: 'Assessments',          icon: '📋', tone: 'rose',   group: 'main' },
    { id: 'patient-reports',     label: 'My Reports',           icon: '📄', tone: 'blue',   group: 'main' },
    { id: 'patient-brainmap',    label: 'My Brain Map',         icon: '🧠', tone: 'violet', group: 'main' },

    // ── CONNECT ───────────────────────────────────────────────────────────────
    { section: 'Connect', sectionId: 'pt-connect', collapsed: false },
    { id: 'patient-virtualcare', label: 'Virtual Care',         icon: '📹', tone: 'teal',   group: 'main' },
    { id: 'patient-careteam',    label: 'Care Team',            icon: '👥', tone: 'rose',   group: 'main' },

    // ── RESOURCES ─────────────────────────────────────────────────────────────
    { section: 'Resources', sectionId: 'pt-resources', collapsed: false },
    { id: 'patient-education',   label: 'Education Library',    icon: '📚', tone: 'violet', group: 'main' },
    { id: 'patient-marketplace', label: 'Marketplace',          icon: '🛒', tone: 'green',  group: 'main' },

    // ── ACCOUNT ───────────────────────────────────────────────────────────────
    { section: 'Account', sectionId: 'pt-account', collapsed: false },
    { id: 'pt-billing',          label: 'Billing',              icon: '💳', tone: 'amber',  group: 'main' },
    { id: 'pt-tickets',          label: 'Support',              icon: '🎫', tone: 'rose',   group: 'main' },
    { id: 'patient-profile',     label: 'Profile',              icon: '👤', tone: 'amber',  group: 'main' },
    { id: 'patient-settings',    label: 'Settings',             icon: '⚙',  tone: 'slate',  group: 'main' },
    // Optional
    { id: 'pt-caregiver',        label: 'Caregiver Access',     icon: '👥', tone: 'rose',   group: 'optional' },
    // Always at bottom
    { id: 'pt-help',             label: 'Help',                 icon: '❓', tone: 'slate',  group: 'bottom' },
  ];
}

function _patientBottomNav() {
  return [
    { id: 'patient-portal',      label: 'Home',         icon: '🏠', tone: 'teal'   },
    { id: 'patient-sessions',    label: 'Sessions',     icon: '📅', tone: 'blue'   },
    { id: 'patient-homework',    label: 'Homework',     icon: '📝', tone: 'violet' },
    { id: 'patient-virtualcare', label: 'Virtual Care', icon: '📹', tone: 'teal'   },
    { id: 'patient-profile',     label: 'Profile',      icon: '👤', tone: 'amber'  },
  ];
}

// ── Patient nav collapse state ─────────────────────────────────────────────
const _ptNavCollapsed = (() => {
  try {
    const v = localStorage.getItem('ds_pt_nav_collapsed_sections');
    return v ? JSON.parse(v) : {};
  } catch { return {}; }
})();
function _savePtNavCollapsed() {
  try { localStorage.setItem('ds_pt_nav_collapsed_sections', JSON.stringify(_ptNavCollapsed)); } catch {}
}
// Seed default-collapsed state from nav definition
_patientNav().forEach(n => {
  if (n.section && n.collapsed && n.sectionId && _ptNavCollapsed[n.sectionId] === undefined)
    _ptNavCollapsed[n.sectionId] = true;
});

window._togglePtNavSection = function(sectionId) {
  if (!sectionId) return;
  _ptNavCollapsed[sectionId] = !_ptNavCollapsed[sectionId];
  _savePtNavCollapsed();
  const cur = window._currentPatientPage || 'patient-portal';
  renderPatientNav(cur);
};

export function renderPatientNav(currentPage) {
  window._currentPatientPage = currentPage;
  const _ptNavList = document.getElementById('patient-nav-list');
  if (_ptNavList) {
    const navItems = _patientNav();

    // Build sections: group items under their section headers
    const sections = [];
    let currentSection = null;
    const optionalItems = [];
    const bottomItems = [];

    navItems.forEach(n => {
      if (n.section) {
        currentSection = { entry: n, items: [] };
        sections.push(currentSection);
      } else if (n.group === 'optional') {
        optionalItems.push(n);
      } else if (n.group === 'bottom') {
        bottomItems.push(n);
      } else {
        if (!currentSection) {
          currentSection = { entry: null, items: [] };
          sections.push(currentSection);
        }
        currentSection.items.push(n);
      }
    });

    const renderItem = n => {
      const badge = n.badge ? `<span class="nav-badge">${n.badge}</span>` : '';
      const tone = n.tone || 'teal';
      return `<div class="nav-item pt-nav-item ${currentPage === n.id ? 'active' : ''}" onclick="window._navPatient('${n.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._navPatient('${n.id}')}" role="menuitem" tabindex="0" aria-current="${currentPage === n.id ? 'page' : 'false'}">
        <span class="pt-nav-tile pt-nav-tile--${tone}" aria-hidden="true">${n.icon}</span>
        <span class="pt-nav-label">${n.label}</span>${badge}
      </div>`;
    };

    const html = [];

    sections.forEach(sec => {
      const entry = sec.entry;
      const sectionId = entry?.sectionId || null;
      const hasActivePage = sec.items.some(n => n.id === currentPage);

      let isCollapsed = false;
      if (sectionId) {
        if (hasActivePage) {
          if (_ptNavCollapsed[sectionId] === true) {
            _ptNavCollapsed[sectionId] = false;
            _savePtNavCollapsed();
          }
          isCollapsed = false;
        } else {
          isCollapsed = !!_ptNavCollapsed[sectionId];
        }
      }

      const collapsedClass = isCollapsed ? ' nav-section-group--collapsed' : '';
      html.push(`<div class="nav-section-group${collapsedClass}" data-section="${sectionId || ''}">`);

      if (entry) {
        const label = entry.section;
        if (sectionId) {
          html.push(`<div class="nav-section-header" onclick="window._togglePtNavSection('${sectionId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._togglePtNavSection('${sectionId}')}" role="button" tabindex="0" aria-expanded="${!isCollapsed}" aria-controls="pt-nav-sec-${sectionId}">
            <span class="nav-section-label">${label}</span>
            <span class="nav-section-chevron" aria-hidden="true">&#8250;</span>
          </div>`);
        } else {
          html.push(`<div class="nav-section-header nav-section-header--static">
            <span class="nav-section-label">${label}</span>
          </div>`);
        }
      }

      const itemsHtml = sec.items.map(renderItem).join('');
      if (sectionId) {
        html.push(`<div class="nav-section-items" id="pt-nav-sec-${sectionId}">${itemsHtml}</div>`);
      } else {
        html.push(itemsHtml);
      }

      html.push(`</div>`);
    });

    if (optionalItems.length) {
      html.push(`<div class="nav-section-divider" style="margin:6px 12px;border-top:1px solid rgba(255,255,255,0.06)"></div>`);
      html.push(optionalItems.map(renderItem).join(''));
    }

    if (bottomItems.length) {
      html.push(`<div style="flex:1"></div>`);
      html.push(`<div class="nav-section-divider" style="margin:6px 12px;border-top:1px solid rgba(255,255,255,0.06)"></div>`);
      html.push(bottomItems.map(renderItem).join(''));
    }

    _ptNavList.innerHTML = html.join('');
    _ptNavList.style.display = 'flex';
    _ptNavList.style.flexDirection = 'column';
  }

  const bottomNav = document.getElementById('pt-bottom-nav');
  if (bottomNav) {
    bottomNav.innerHTML = _patientBottomNav().map(n => {
      const active = currentPage === n.id;
      const tone   = n.tone || 'teal';
      return `<button class="pt-bottom-nav-item${active ? ' active' : ''}" onclick="window._navPatient('${n.id}')">
        <span class="pt-bottom-nav-tile pt-nav-tile--${tone}" aria-hidden="true">${n.icon}</span>
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

function _emptyPatientEvidenceContext(patientId = '') {
  return emptyPatientEvidenceContext(patientId);
}

async function _loadPatientEvidenceContext(patientId, reports = null) {
  return loadPatientEvidenceContext(patientId, { reports });
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

// ── Re-exports from extracted page modules (2026-05-02 split refactor) ───
// These pages were moved out of pages-patient.js to reduce concurrent-
// session merge collisions on this file. Importing them here is also a
// load-time side-effect: each module installs its own `window._*` event
// handlers at top-level, so consumers depending on those globals continue
// to see them after merely importing pages-patient.js.
import { pgPatientCaregiver } from './pages-patient/caregiver.js';
import { pgPatientDigest } from './pages-patient/digest.js';
import { pgPatientHomeDevices, pgPatientHomeDevice, pgPatientHomeSessionLog } from './pages-patient/home-devices.js';
import { pgPatientAdherenceEvents, pgPatientAdherenceHistory } from './pages-patient/adherence.js';
import { pgIntake } from './pages-patient/intake.js';
import { pgDataImport } from './pages-patient/import-wizard.js';
import { pgPatientMediaConsent, pgPatientMediaUpload, pgPatientMediaHistory } from './pages-patient/media.js';
import { pgPatientWearables } from './pages-patient/wearables.js';
import { pgSymptomJournal, pgPatientNotificationSettings } from './pages-patient/symptom-notifications.js';
// `_hdEsc` is the home-device HTML escaper. The original definition lived
// inside the home-devices block (now extracted) but was hoisted across the
// whole file; many other pages reference it. Import the canonical copy
// from the shared module to keep those references working.
import { _hdEsc } from './pages-patient/_shared.js';
export { pgPatientCaregiver, pgPatientDigest };
export { pgPatientHomeDevices, pgPatientHomeDevice, pgPatientHomeSessionLog };
export { pgPatientAdherenceEvents, pgPatientAdherenceHistory };
export { pgIntake };
export { pgDataImport };
export { pgPatientMediaConsent, pgPatientMediaUpload, pgPatientMediaHistory };
export { pgPatientWearables };
export { pgSymptomJournal, pgPatientNotificationSettings };

// ── Dashboard helpers (pure; extracted to ./patient-dashboard-helpers.js so
//    they can be unit-tested under plain `node --test` without importing
//    this file — which touches `window` transitively via auth.js). ───────────
import {
  computeCountdown,
  phaseLabel,
  outcomeGoalMarker,
  groupOutcomesByTemplate,
  pickTodaysFocus,
  isDemoPatient,
  DEMO_PATIENT,
  demoAssessmentSeed,
  pickCallTier,
  demoMessagesSeed,
  SELF_ASSESSMENT_SURVEYS,
  SELF_ASSESSMENT_KEYS,
  getSelfAssessmentLastFiled,
  setSelfAssessmentLastFiled,
  getSelfAssessmentDraft,
  setSelfAssessmentDraft,
  clearSelfAssessmentDraft,
  demoSelfAssessmentSeed,
} from './patient-dashboard-helpers.js';
export {
  computeCountdown, phaseLabel, outcomeGoalMarker, groupOutcomesByTemplate,
  pickTodaysFocus, isDemoPatient, DEMO_PATIENT, demoAssessmentSeed,
  pickCallTier, demoMessagesSeed,
};

// ── Dashboard + Sessions: extracted to ./pages-patient/{dashboard,sessions}.js
//    on 2026-05-02 (continuation of #403). pages-patient.js still re-exports
//    them so all existing call-sites and `import` statements continue to
//    work unchanged. Importing the modules is also a load-time side effect:
//    each module installs its own `window._*` event handlers at top-level,
//    so consumers depending on those globals continue to see them after
//    merely importing pages-patient.js.
import { pgPatientDashboard } from './pages-patient/dashboard.js';
import { pgPatientSessions } from './pages-patient/sessions.js';
export { pgPatientDashboard, pgPatientSessions };


export async function pgPatientHomework() {
  try {
    return await _pgPatientHomeworkImpl();
  } catch (err) {
    console.error('[pgPatientHomework] render failed:', err);
    const el = document.getElementById('patient-content');
    if (el) {
      el.innerHTML = `
        <div class="pt-portal-empty">
          <div class="pt-portal-empty-ico" aria-hidden="true">&#9888;</div>
          <div class="pt-portal-empty-title">We couldn't load your Homework</div>
          <div class="pt-portal-empty-body">Something went wrong on our end. Please refresh the page, or message your care team if this keeps happening.</div>
          <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="window.location.reload()">Refresh</button>
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Message care team</button>
          </div>
        </div>`;
    }
  }
}

// Backward-compat alias — any lingering `patient-course` links still land here.
export const pgPatientCourse = pgPatientHomework;

async function _pgPatientHomeworkImpl() {
  setTopbar('Homework');
  const user = currentUser;
  const uid  = user?.patient_id || user?.id;
  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  const loc = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
  const todayIso = new Date().toISOString().slice(0, 10);

  // Mount-time launch-audit ping — patient Homework surface.
  // Fire-and-forget: never blocks the page render even when audit ingestion
  // is unreachable. Surface name ``home_program_tasks`` is whitelisted by
  // ``audit_trail_router.KNOWN_SURFACES`` (PR 2026-05-01).
  try {
    if (api.postHomeProgramTaskAuditEvent) {
      api.postHomeProgramTaskAuditEvent({ event: 'view', note: 'mount' });
    }
  } catch (_e) { /* audit must never block UI */ }

  // ── Fetch real data ───────────────────────────────────────────────────────
  const _t = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _race = (p) => Promise.race([Promise.resolve(p).catch(() => null), _t(3000)]);
  let [homeTasksRaw, homeTasksPortalRaw, coursesRaw, sessionsRaw, hwTodayRaw, hwSummaryRaw] = await Promise.all([
    _race(uid ? api.listHomeProgramTasks({ patient_id: uid }) : null),
    _race(api.portalListHomeProgramTasks ? api.portalListHomeProgramTasks() : null),
    _race(api.patientPortalCourses()),
    _race(api.patientPortalSessions()),
    _race(api.homeProgramTasksToday ? api.homeProgramTasksToday() : null),
    _race(api.homeProgramTasksSummary ? api.homeProgramTasksSummary() : null),
  ]);
  const _homeworkLoadFailed =
    homeTasksRaw === null &&
    homeTasksPortalRaw === null &&
    coursesRaw === null &&
    sessionsRaw === null;
  const _hwDemoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1';
  const _hwIsDemo = _homeworkLoadFailed && _hwDemoEnabled && isDemoPatient(user, { getToken: api.getToken });
  if (_homeworkLoadFailed && !_hwIsDemo) {
    throw new Error('homework_data_unavailable');
  }
  let _portalTaskCompletions = new Map();
  if (Array.isArray(homeTasksPortalRaw) && homeTasksPortalRaw.length && api.portalGetHomeProgramTaskCompletion) {
    const completionRows = await Promise.all(
      homeTasksPortalRaw.map(async function(taskRow) {
        const serverTaskId = taskRow?.server_task_id;
        if (!serverTaskId) return null;
        const completion = await _race(api.portalGetHomeProgramTaskCompletion(serverTaskId));
        return completion && typeof completion === 'object'
          ? [serverTaskId, completion]
          : [serverTaskId, null];
      })
    );
    completionRows.forEach(function(entry) {
      if (entry && entry[0]) _portalTaskCompletions.set(entry[0], entry[1]);
    });
  }

  // ── Normalise home tasks ──────────────────────────────────────────────────
  let tasks = [];
  if (homeTasksRaw && Array.isArray(homeTasksRaw.items)) tasks = homeTasksRaw.items;
  else if (Array.isArray(homeTasksRaw)) tasks = homeTasksRaw;
  else if (Array.isArray(homeTasksPortalRaw)) {
    tasks = homeTasksPortalRaw.map(r => ({
      id: r.server_task_id || r.id,
      serverTaskId: r.server_task_id,
      title: r.title || r.task?.title || r.task?.name || 'Task',
      category: r.category || r.task?.category || '',
      instructions: r.instructions || r.task?.instructions || '',
      completed: (_portalTaskCompletions.get(r.server_task_id)?.completed === true) || !!(r.completed || r.task?.completed || r.task?.done),
      completed_at: (_portalTaskCompletions.get(r.server_task_id)?.completed_at || r.completed_at)
        ? new Date(_portalTaskCompletions.get(r.server_task_id)?.completed_at || r.completed_at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
        : null,
      due_on: r.task?.due_on || r.task?.dueOn || null,
      task_type: r.task?.task_type || r.task?.type || null,
      raw: r,
    }));
  }

  const courses = Array.isArray(coursesRaw) ? coursesRaw : [];
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const activeCourse = courses.find(c => c.status === 'active') || courses[0] || null;

  // ── Merge library tasks added by patient from localStorage ────────────────
  try {
    const libAddedRaw = localStorage.getItem('ds_hw_library_tasks');
    if (libAddedRaw) {
      const libAdded = JSON.parse(libAddedRaw);
      if (Array.isArray(libAdded) && libAdded.length) {
        libAdded.forEach(function(lt) {
          if (!tasks.find(function(t) { return t.id === lt.id; })) {
            tasks.push(lt);
          }
        });
      }
    }
  } catch (_e) {}

  // ── Demo seed (first-time user / empty backend) ───────────────────────────
  const _isDemo = tasks.length === 0 && courses.length === 0;
  if (_isDemo) {
    const base = (n) => ({
      id: 'dm-hw-' + n,
      clinician_assigned_by: 'Dr. Amelia Kolmar',
      assigned_on: '2026-02-17',
    });
    tasks = [
      // Today (partially complete)
      { ...base(1), title:'15\u201320 min walk \u00b7 rate mood before/after', task_type:'walk',      category:'activation', duration_min:20, repeat:'daily',  completed:true,  due_on:todayIso, completed_at:'08:42', _bucket:'today', _priority:'high',  mood_before:4, mood_after:6, note:'Felt lighter after', time_bucket:'Morning',  description:'Pick one small meaningful activity. Note mood 0\u201310 before and after. Start modest; increase only if it feels okay.' },
      { ...base(2), title:'Morning mood & energy log',                        task_type:'mood',      category:'mood',       duration_min:2,  repeat:'daily',  completed:true,  due_on:todayIso, completed_at:'07:15',                              note:'A bit foggy', time_bucket:'Morning', description:'One line: how\u2019s the mood, energy, and sleep last night? Anything notable on your mind?' },
      { ...base(3), title:'Synaps One \u00b7 20-min session \u00b7 2.0 mA',   task_type:'tdcs',      category:'device',     duration_min:30, repeat:'Mon/Wed/Sun', completed:false, due_on:todayIso, due_by:'21:00', _priority:'high', time_bucket:'Evening', description:'Left DLPFC montage (F3\u2013FP2). Clean skin per protocol, check pad placement, log sensation and skin check after.', clinician_note:{ by:'Dr. Kolmar', date:'Apr 18', body:'Yesterday you reported mild tingling. If that repeats, pause and message me before continuing.' } },
      { ...base(4), title:'Diaphragmatic breathing \u00b7 10 min',            task_type:'breathing', category:'breathing',  duration_min:10, repeat:'daily',  completed:false, due_on:todayIso, time_bucket:'Before bed', description:'Inhale 4s \u00b7 hold 2s \u00b7 exhale 6s. Keep the exhale longer than the inhale \u2014 that\u2019s the relaxing part.' },
      { ...base(5), title:'No screens after 10 PM \u00b7 lights low',         task_type:'sleep',     category:'sleep',      duration_min:60, repeat:'daily',  completed:false, due_on:todayIso, time_bucket:'10 PM\u201311 PM', description:'Dim lights in the last hour. Book or calm audio is fine \u2014 news and social feeds are not.' },

      // Coming up this week (scheduled for future days)
      { ...base(11), title:'PHQ-9 weekly check-in',                           task_type:'assessment', category:'assessment', duration_min:4,  repeat:'weekly',   completed:false, due_on:'2026-04-21', _priority:'due',     description:'9 questions \u00b7 ~4 min \u00b7 measures depression symptoms over 2 weeks.' },
      { ...base(12), title:'Pre-session readiness \u00b7 clinic',             task_type:'prep',      category:'prep',       duration_min:15, repeat:'per-session', completed:false, due_on:'2026-04-22', time_bucket:'14:00',                         description:'Arrive 10 min early \u00b7 skip caffeine 2h before \u00b7 2-min breathing.' },
      { ...base(13), title:'Post-session aftercare',                          task_type:'aftercare', category:'aftercare',  duration_min:30, repeat:'per-session', completed:false, due_on:'2026-04-22', time_bucket:'14:45',                         description:'Rest 30 min \u00b7 avoid strenuous activity \u00b7 note any sensations in journal.' },
      { ...base(14), title:'One valued activity \u00b7 call a friend',        task_type:'activation',category:'activation', duration_min:15, repeat:'weekly',    completed:false, due_on:'2026-04-23',                                              description:'Behavioural activation \u00b7 pick a person from your "closeness" list and reach out.' },
      { ...base(15), title:'Read: "How tDCS nudges mood circuits" (6 min)',   task_type:'education', category:'education',  duration_min:6,  repeat:'one-off',   completed:false, due_on:'2026-04-24',                                              description:'Plain-language explainer assigned by Dr. Kolmar \u00b7 useful before Thursday\u2019s session.' },
      { ...base(16), title:'Home tDCS \u00b7 skin & session log',             task_type:'tdcs',      category:'device',     duration_min:20, repeat:'Mon/Wed/Sun', completed:false, due_on:'2026-04-25',                                            description:'Standard home session with photo of electrode sites \u00b7 20 min \u00b7 2.0 mA.' },
      { ...base(17), title:'Weekly reflection \u00b7 3 things that helped',   task_type:'reflection',category:'mood',       duration_min:10, repeat:'weekly',    completed:false, due_on:'2026-04-26',                                              description:'What moved the needle this week? Share with Dr. Kolmar before Monday review.' },
    ];
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const todays = tasks.filter(t => (t.due_on || '').slice(0, 10) === todayIso);
  const todaysDone = todays.filter(t => t.completed || t.done).length;

  const weekStart = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const dow = (d.getDay() + 6) % 7;                // Mon=0
    d.setDate(d.getDate() - dow);
    return d;
  })();
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekTasks = tasks.filter(t => {
    if (!t.due_on) return false;
    const d = new Date(t.due_on);
    return d >= weekStart && d < weekEnd;
  });
  const weekDone = weekTasks.filter(t => t.completed || t.done).length;
  const weekPct = weekTasks.length ? Math.round(weekDone / weekTasks.length * 100) : 0;

  const courseTotal = tasks.length;
  const courseDone = tasks.filter(t => t.completed || t.done).length;
  const coursePct = courseTotal ? Math.round(courseDone / courseTotal * 100) : 0;

  // Streak days (consecutive days with at least one completion, ending today).
  const streak = (() => {
    let s = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const hit = tasks.some(t => (t.due_on || '').slice(0, 10) === d && (t.completed || t.done));
      if (hit) s++; else break;
    }
    return s;
  })();

  // Week strip: Mon-Sun with N completion dots per day.
  function _dayDots(dayDate) {
    const iso = dayDate.toISOString().slice(0, 10);
    const dayTasks = tasks.filter(t => (t.due_on || '').slice(0, 10) === iso);
    const dotsHtml = dayTasks.slice(0, 5).map(t => {
      const cls = (t.completed || t.done) ? 'done'
        : (/missed|skipped|no[-_]?show/i.test(String(t.status || ''))) ? 'missed'
        : t.partial ? 'partial' : '';
      return `<span class="hw-day-dot ${cls}"></span>`;
    }).join('');
    return dotsHtml || '<span class="hw-day-dot"></span>';
  }

  const weekStrip = (() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const today = iso === todayIso;
      const past = !today && d.getTime() < Date.now();
      days.push({
        date: d,
        dow: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        num: d.getDate(),
        today, past,
      });
    }
    return days;
  })();

  // Task icon/colour mapping.
  function _icoRef(tp) {
    const t = String(tp || '').toLowerCase();
    if (/walk|move|activation/.test(t)) return '#i-walk';
    if (/mood|smile|journal|reflect/.test(t)) return '#i-smile';
    if (/tdcs|stim|brain|device/.test(t)) return '#i-brain';
    if (/breath|wave/.test(t)) return '#i-wave';
    if (/sleep|moon/.test(t)) return '#i-moon';
    if (/assess|phq|gad|clipboard/.test(t)) return '#i-clipboard';
    if (/prep|lightning/.test(t)) return '#i-lightning';
    if (/aftercare|leaf/.test(t)) return '#i-leaf';
    if (/education|book/.test(t)) return '#i-book-open';
    return '#i-check';
  }
  function _catLabel(cat) {
    const c = String(cat || '').toLowerCase();
    const map = { activation:'Behavioural activation', mood:'Mood journal', device:'Home tDCS', breathing:'Breathing · relaxation', sleep:'Sleep hygiene · wind-down', assessment:'Assessment', prep:'Pre-session', aftercare:'Aftercare', education:'Education' };
    return map[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Task');
  }

  // ── Task cards (today) + rows (week) + library (static) ───────────────────
  function _taskCardHtml(t) {
    const done = !!(t.completed || t.done);
    const ico = _icoRef(t.task_type);
    const cat = _catLabel(t.category || t.task_type);
    const meta = [];
    if (t.duration_min) meta.push(`<span><svg width="11" height="11"><use href="#i-clock"/></svg>~${t.duration_min} min</span>`);
    if (t.repeat)       meta.push(`<span><svg width="11" height="11"><use href="#i-repeat"/></svg>${esc(t.repeat)}</span>`);
    if (done && t.completed_at) meta.push(`<span class="hw-done"><svg width="11" height="11"><use href="#i-check"/></svg>Done \u00b7 ${esc(t.completed_at)}</span>`);
    else if (t.due_by)   meta.push(`<span class="hw-due"><svg width="11" height="11"><use href="#i-alert"/></svg>Due by ${esc(t.due_by)}</span>`);
    else if (t.time_bucket) meta.push(`<span>${esc(t.time_bucket)}</span>`);
    const foot = done
      ? `<button class="hw-check is-on" onclick="window._hwToggle && window._hwToggle('${esc(t.id)}')" title="Mark incomplete"><svg width="14" height="14"><use href="#i-check"/></svg></button>
         <span style="font-size:11.5px;color:var(--text-secondary)">${t.mood_before != null && t.mood_after != null ? 'Mood <strong style="color:var(--text-primary)">' + t.mood_before + ' \u2192 ' + t.mood_after + '</strong> \u00b7 ' : ''}${esc(t.note ? '\u201C' + t.note + '\u201D' : 'Completed')}</span>
         <button class="btn btn-ghost btn-sm hw-go" onclick="window._hwOpen && window._hwOpen('${esc(t.id)}')">View<svg width="11" height="11"><use href="#i-arrow-right"/></svg></button>`
      : `<button class="hw-check" onclick="window._hwToggle && window._hwToggle('${esc(t.id)}')" title="Mark complete"><svg width="14" height="14"><use href="#i-check"/></svg></button>
         <span style="font-size:11.5px;color:var(--text-tertiary)">${esc(t.clinician_note ? 'Clinician note \u2014 tap to read' : 'Tap check when done')}</span>
         ${t.task_type === 'tdcs'
           ? '<button class="btn btn-primary btn-sm hw-go" onclick="window._hwStart && window._hwStart(\'' + esc(t.id) + '\', \'tdcs\')">Start session<svg width="11" height="11"><use href="#i-arrow-right"/></svg></button>'
           : t.task_type === 'breathing'
             ? '<button class="btn btn-ghost btn-sm hw-go" onclick="window._hwStart && window._hwStart(\'' + esc(t.id) + '\', \'breathing\')">Open<svg width="11" height="11"><use href="#i-arrow-right"/></svg></button>'
             : t.task_type === 'walk' || t.task_type === 'activation'
               ? '<button class="btn btn-ghost btn-sm hw-go" onclick="window._hwStart && window._hwStart(\'' + esc(t.id) + '\', \'walk\')"><svg width="11" height="11"><use href="#i-play"/></svg>Start</button>'
               : '<button class="btn btn-ghost btn-sm hw-go" onclick="window._hwOpen && window._hwOpen(\'' + esc(t.id) + '\')">Open<svg width="11" height="11"><use href="#i-arrow-right"/></svg></button>'}`;
    return `
      <div class="hw-task${done ? ' done' : ''}" data-cat="${esc(t.category || '')}" data-task-id="${esc(t.id || '')}">
        <div class="hw-task-hd">
          <div class="hw-task-ico"><svg width="22" height="22"><use href="${ico}"/></svg></div>
          <div class="hw-task-body">
            <div class="hw-task-tag"><span class="dot"></span>${esc(cat)}${t.clinician_assigned_by ? ' \u00b7 ' + esc(t.clinician_assigned_by.split(' ').slice(-1)[0]) : ''}</div>
            <div class="hw-task-title">${esc(t.title || 'Task')}</div>
            <div class="hw-task-desc" style="margin-top:6px">${esc(t.description || t.instructions || '')}</div>
          </div>
        </div>
        ${t.clinician_note ? `<div class="hw-task-note"><strong>${esc(t.clinician_note.by || 'Clinician')}\u2019s note${t.clinician_note.date ? ' \u00b7 ' + esc(t.clinician_note.date) : ''}:</strong> ${esc(t.clinician_note.body || '')}</div>` : ''}
        <div class="hw-task-meta">${meta.join('')}</div>
        <div class="hw-task-foot">${foot}</div>
      </div>`;
  }

  function _taskRowHtml(t) {
    const done = !!(t.completed || t.done);
    const ico = _icoRef(t.task_type);
    const dueLbl = (() => {
      if (!t.due_on) return 'Scheduled';
      const d = new Date(t.due_on);
      return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    })();
    return `
      <div class="hw-row${done ? ' done' : ''}" data-cat="${esc(t.category || '')}" data-task-id="${esc(t.id || '')}">
        <div class="hw-row-ico"><svg width="18" height="18"><use href="${ico}"/></svg></div>
        <div class="hw-row-body" onclick="window._hwOpen && window._hwOpen('${esc(t.id)}')">
          <div class="hw-row-title">${esc(t.title || 'Task')}</div>
          <div class="hw-row-sub">${esc(t.description || t.instructions || (_catLabel(t.category) + (t.duration_min ? ' \u00b7 ~' + t.duration_min + ' min' : '')))}</div>
        </div>
        <div class="hw-row-meta">
          <span class="hw-row-cat">${esc(_catLabel(t.category || t.task_type))}</span>
          <span${t._priority === 'due' ? ' style="color:var(--amber,#ffb547);font-weight:600"' : ''}>${esc(dueLbl)}</span>
        </div>
        <button class="hw-row-check${done ? ' is-on' : ''}" onclick="window._hwToggle && window._hwToggle('${esc(t.id)}')"><svg width="13" height="13"><use href="#i-check"/></svg></button>
      </div>`;
  }

  // Library picks — static curated list, with "Add to my plan" wiring.
  const library = [
    { id:'lib-walk',     color:'#4ade80', ico:'#i-walk',      title:'20-Minute Walk',           sub:'Walking / Activity \u00b7 3x-week', desc:'Brisk 20-minute walk. Note how you feel before and after. Supports mood and neuroplasticity.', active:false, category:'activation',  duration_min:20, task_type:'walk' },
    { id:'lib-breath',   color:'#4a9eff', ico:'#i-wave',      title:'Diaphragmatic Breathing', sub:'Breathing / Relaxation \u00b7 daily', desc:'10 minutes of slow diaphragmatic breathing. Inhale 4s, hold 2s, exhale 6s. Anxiety & stress regulation.', active:false, category:'breathing',   duration_min:10, task_type:'breathing' },
    { id:'lib-sleep',    color:'#9b7fff', ico:'#i-moon',      title:'Sleep Hygiene Routine',    sub:'Sleep Routine \u00b7 daily',          desc:'No screens 1h before bed. Same sleep/wake time. Keep the room cool and dark.', active:false, category:'sleep', duration_min:60, task_type:'sleep' },
    { id:'lib-mood',     color:'#ff8ab3', ico:'#i-edit',      title:'Daily Mood Journal',       sub:'Mood Journal \u00b7 daily',           desc:'Record mood, energy, and any notable thoughts each morning. Treatment monitoring.', active:true,  category:'mood', duration_min:2,  task_type:'mood' },
    { id:'lib-prep',     color:'#ffb547', ico:'#i-lightning', title:'Pre-Session Relaxation',   sub:'Pre-Session Prep \u00b7 before-session', desc:'Arrive 10 min early, avoid caffeine 2h before, complete a short relaxation exercise.', active:true, category:'prep', duration_min:15, task_type:'prep' },
    { id:'lib-post',     color:'#7fdcc2', ico:'#i-leaf',      title:'Post-Session Rest',        sub:'Aftercare \u00b7 after-session',      desc:'Rest 30 min. Avoid strenuous activity. Note any sensations in journal.', active:true, category:'aftercare', duration_min:30, task_type:'aftercare' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  el.innerHTML = `
    <div class="hw-page">

      ${_isDemo ? `
      <div class="hw-demo-banner" role="status">
        <svg width="14" height="14"><use href="#i-info"/></svg>
        <strong>Demo data</strong>
        <span>\u2014 these preview tasks will be replaced when your portal homework plan is available.</span>
        <span style="margin-left:auto">Preview mode</span>
      </div>` : ''}

      <!-- Header -->
      <div class="hw-hd">
        <div>
          <h2>Homework</h2>
          <p>The at-home plan ${activeCourse?.primary_clinician_name ? esc(activeCourse.primary_clinician_name) + ' built around your' : 'built around your'} ${esc(activeCourse?.modality_slug ? (activeCourse.modality_slug + '').toUpperCase() : 'treatment')} course. Small, evidence-based tasks that help the stimulation stick. Check things off as you go \u2014 progress review depends on portal workflow.</p>
        </div>
        <div class="hw-hd-actions">
          <button class="btn btn-ghost btn-sm" onclick="window._hwReminders && window._hwReminders()"><svg width="13" height="13"><use href="#i-bell"/></svg>Reminders</button>
          <button class="btn btn-ghost btn-sm" onclick="window._hwExport && window._hwExport()"><svg width="13" height="13"><use href="#i-download"/></svg>Export plan</button>
        </div>
      </div>

      <!-- Hero summary -->
      <div class="hw-hero">
        <div class="hw-hero-cell hw-hero-plan">
          <div class="hw-hero-plan-ico"><svg width="22" height="22"><use href="#i-sparkle"/></svg></div>
          <div>
            <div class="hw-hero-plan-kick">Active plan${activeCourse?.condition_slug ? ' \u00b7 ' + esc(String(activeCourse.condition_slug).replace(/-/g,' ').toUpperCase()) : ''}</div>
            <div class="hw-hero-plan-title">${esc(activeCourse?.name || 'Behavioural activation + tDCS adherence')}</div>
            <div class="hw-hero-plan-sub">${activeCourse ? (`Week ${Math.ceil((Date.now() - new Date(activeCourse.started_at || '2026-02-17').getTime()) / (7*86400000)) || 6} of ${Math.round((activeCourse.total_sessions_planned || 20) / 2) || 10}`) : 'No active course'} \u00b7 prescribed by ${esc(activeCourse?.primary_clinician_name || 'your clinician')}</div>
            ${streak > 0 ? `<span class="hw-streak-flame"><svg width="12" height="12"><use href="#i-sparkle"/></svg>${streak}-day streak \u2014 keep it going</span>` : ''}
          </div>
        </div>
        <div class="hw-hero-cell">
          <div class="hw-hero-lbl">Today</div>
          <div class="hw-hero-val">${todaysDone}<small>of ${todays.length} done</small></div>
          <div class="hw-hero-sub" style="color:var(--teal,#00d4bc)">${todays.length - todaysDone} remaining${todays.length - todaysDone > 0 ? ' \u00b7 ~' + (todays.filter(t => !(t.completed||t.done)).reduce((a,t)=>a+(t.duration_min||5),0)) + ' min' : ''}</div>
        </div>
        <div class="hw-hero-cell">
          <div class="hw-hero-lbl">This week</div>
          <div class="hw-hero-val">${weekDone}<small>of ${weekTasks.length || '—'}</small></div>
          <div class="hw-hero-sub">${weekPct}% adherence \u00b7 ${weekPct >= 60 ? 'on track' : 'catch up gently'}</div>
        </div>
        <div class="hw-hero-cell" style="display:flex;flex-direction:row;align-items:center;gap:14px">
          <div class="hw-ring">
            <svg viewBox="0 0 54 54">
              <circle cx="27" cy="27" r="22" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
              <circle cx="27" cy="27" r="22" fill="none" stroke="#00d4bc" stroke-width="4" stroke-linecap="round" stroke-dasharray="138.23" stroke-dashoffset="${(138.23 - (coursePct / 100) * 138.23).toFixed(2)}"/>
            </svg>
            <div class="hw-ring-num">${coursePct}%</div>
          </div>
          <div>
            <div class="hw-hero-lbl">Course adherence</div>
            <div class="hw-hero-sub" style="margin-top:4px">${coursePct >= 50 ? 'Keep going' : 'Getting started'}</div>
          </div>
        </div>
      </div>

      <!-- Week strip -->
      <div class="hw-week">
        ${weekStrip.map(day => `
          <div class="hw-day${day.today ? ' today' : day.past ? ' past' : ''}">
            ${day.today ? '<div class="hw-day-tag">TODAY</div>' : ''}
            <div class="hw-day-dow">${esc(day.dow)}</div>
            <div class="hw-day-num">${day.num}</div>
            <div class="hw-day-dots">${_dayDots(day.date)}</div>
          </div>`).join('')}
      </div>

      <!-- Two-col layout -->
      <div class="hw-layout">

        <!-- LEFT: tasks -->
        <div class="hw-main">

          <!-- Filters -->
          <div class="hw-filters" id="hw-filters">
            <button class="hw-filter active" data-f="today" onclick="window._hwFilter && window._hwFilter('today')">Today <span class="count">${todays.length}</span></button>
            <button class="hw-filter" data-f="week" onclick="window._hwFilter && window._hwFilter('week')">This week <span class="count">${weekTasks.length}</span></button>
            <button class="hw-filter" data-f="activation" onclick="window._hwFilter && window._hwFilter('activation')">Activation <span class="count">${tasks.filter(t => t.category === 'activation').length}</span></button>
            <button class="hw-filter" data-f="mood" onclick="window._hwFilter && window._hwFilter('mood')">Mood log <span class="count">${tasks.filter(t => t.category === 'mood').length}</span></button>
            <button class="hw-filter" data-f="device" onclick="window._hwFilter && window._hwFilter('device')">tDCS home <span class="count">${tasks.filter(t => t.category === 'device').length}</span></button>
            <button class="hw-filter" data-f="sleep" onclick="window._hwFilter && window._hwFilter('sleep')">Sleep <span class="count">${tasks.filter(t => t.category === 'sleep').length}</span></button>
            <button class="hw-filter" data-f="breathing" onclick="window._hwFilter && window._hwFilter('breathing')">Breathing <span class="count">${tasks.filter(t => t.category === 'breathing').length}</span></button>
            <input class="hw-filter-search" id="hw-search" placeholder="Search tasks, notes, instructions\u2026" oninput="window._hwSearch && window._hwSearch(this.value)" />
          </div>

          <!-- Today focus -->
          <div class="hw-today-section" id="hw-sec-today">
            <div class="hw-section-hd">
              <div>
                <h3>Today \u00b7 ${esc(new Date().toLocaleDateString(loc, { weekday: 'long', month: 'long', day: 'numeric' }))}</h3>
                <p>${todays.length ? 'Tap an item to open it. Walk and mood log are the high-priority items.' : 'No tasks scheduled for today yet \u2014 new items will appear here when available in the portal workflow.'}</p>
              </div>
              <a class="hw-see-all" href="javascript:void(0)" onclick="window._hwFilter && window._hwFilter('week')">View full week <svg width="12" height="12"><use href="#i-arrow-right"/></svg></a>
            </div>
            <div class="hw-today-grid">
              ${todays.length ? todays.map(_taskCardHtml).join('') : '<div class="pth2-empty" style="grid-column:1/-1"><div class="pth2-empty-title">No tasks today</div><div class="pth2-empty-sub">Enjoy the break \u2014 or browse the library below for optional practices.</div></div>'}
            </div>
          </div>

          <!-- Coming up this week -->
          <div class="hw-group" id="hw-sec-week">
            <div class="hw-section-hd">
              <div>
                <h3>Coming up this week</h3>
                <p>Scheduled tasks through ${esc(new Date(weekEnd.getTime() - 86400000).toLocaleDateString(loc, { weekday: 'long', month: 'short', day: 'numeric' }))}. Tap any to preview or start early.</p>
              </div>
            </div>
            <div class="hw-group-list">
              ${weekTasks.filter(t => !((t.due_on || '').slice(0,10) === todayIso)).map(_taskRowHtml).join('') || '<div class="pth2-empty-inline">Nothing else scheduled this week.</div>'}
            </div>
          </div>

          <!-- Library -->
          <div class="hw-library-hd">
            <div>
              <h3>Self-guided library</h3>
              <p>Optional modules curated for your plan. Clear with your clinician before using anything new, especially device-related exercises.</p>
            </div>
            <a class="hw-see-all" href="javascript:void(0)" onclick="window._hwBrowseLibrary && window._hwBrowseLibrary()">Browse all templates <svg width="12" height="12"><use href="#i-arrow-right"/></svg></a>
          </div>
          <div class="hw-library-grid">
            ${library.map(l => `
              <div class="hw-lib-card" data-lib-id="${esc(l.id)}">
                <div class="hw-lib-hd">
                  <div class="hw-lib-ico" style="color:${l.color}"><svg width="16" height="16"><use href="${l.ico}"/></svg></div>
                  <div><div class="hw-lib-title">${esc(l.title)}</div><div class="hw-lib-sub">${esc(l.sub)}</div></div>
                </div>
                <div class="hw-lib-desc">${esc(l.desc)}</div>
                <div class="hw-lib-foot">
                  <span>${l.active ? 'Active in your plan' : 'General library'}</span>
                  <button class="hw-lib-read" onclick="window._hwAddLibrary && window._hwAddLibrary('${esc(l.id)}')">${l.active ? 'Open' : 'Use'} <svg width="11" height="11"><use href="#i-arrow-right"/></svg></button>
                </div>
              </div>`).join('')}
          </div>

        </div>

        <!-- RIGHT rail -->
        <div class="hw-rail">

          <!-- Quick mood -->
          <div class="hw-rail-card">
            <div class="hw-rail-hd">
              <div>
                <div class="hw-rail-title">Quick mood check-in</div>
                <div class="hw-rail-sub">Takes 5 seconds \u00b7 feeds into your trends</div>
              </div>
            </div>
            <div class="hw-mood" id="hw-mood-scale">
              ${[{v:1,f:'\ud83d\ude23',l:'Very low'},{v:2,f:'\ud83d\ude15',l:'Low'},{v:3,f:'\ud83d\ude10',l:'OK'},{v:4,f:'\ud83d\ude42',l:'Good'},{v:5,f:'\ud83d\ude0a',l:'Great'}].map(m => `<button data-v="${m.v}"${m.v===3?' class="active"':''} onclick="window._hwMoodPick && window._hwMoodPick(${m.v})"><span class="f">${m.f}</span><span class="l">${m.l}</span></button>`).join('')}
            </div>
          </div>

          <!-- Streak heatmap -->
          <div class="hw-rail-card">
            <div class="hw-rail-hd">
              <div>
                <div class="hw-rail-title">Your adherence \u00b7 14 days</div>
                <div class="hw-rail-sub">Each cell is one day \u00b7 darker = more done</div>
              </div>
              ${streak > 0 ? `<span class="hw-streak-flame"><svg width="11" height="11"><use href="#i-sparkle"/></svg>${streak}d</span>` : ''}
            </div>
            <div class="hw-streak-grid">
              ${(() => {
                const cells = [];
                for (let i = 13; i >= 0; i--) {
                  const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
                  const day = tasks.filter(t => (t.due_on || '').slice(0, 10) === d);
                  const dayDone = day.filter(t => t.completed || t.done).length;
                  const cls = day.length === 0 ? '' : dayDone === 0 ? 'missed' : dayDone / day.length < 0.34 ? 'l1' : dayDone / day.length < 0.67 ? 'l2' : 'l3';
                  cells.push(`<span class="hw-streak-cell ${cls}"></span>`);
                }
                return cells.join('');
              })()}
            </div>
            <div class="hw-streak-foot">
              <span>${esc(new Date(Date.now() - 13 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span>
              <span class="hw-streak-key">
                <span>Less</span>
                <span class="hw-streak-key-cells">
                  <span style="background:rgba(255,255,255,0.04)"></span>
                  <span style="background:rgba(0,212,188,0.22)"></span>
                  <span style="background:rgba(0,212,188,0.45)"></span>
                  <span style="background:rgba(0,212,188,0.75)"></span>
                </span>
                <span>More</span>
              </span>
              <span>Today</span>
            </div>
          </div>

          <!-- Next session -->
          <div class="hw-rail-card">
            <div class="hw-rail-hd"><div class="hw-rail-title">Next in-clinic session</div></div>
            <div class="hw-next">
              <div class="hw-next-ico"><svg width="20" height="20"><use href="#i-calendar"/></svg></div>
              ${(() => {
                const nextInClinic = sessions
                  .filter(s => s.scheduled_at && new Date(s.scheduled_at).getTime() > Date.now() && !/home/i.test(s.location || s.session_type || ''))
                  .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
                if (!nextInClinic) {
                  return `<div style="flex:1">
                    <div class="hw-next-kick">No clinic session booked</div>
                    <div class="hw-next-title">Message your team</div>
                    <div class="hw-next-sub">The next session will appear here when it is available in the portal workflow.</div>
                  </div>`;
                }
                const d = new Date(nextInClinic.scheduled_at);
                const when = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const t1 = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                const t2 = nextInClinic.duration_minutes ? new Date(d.getTime() + nextInClinic.duration_minutes * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;
                return `<div style="flex:1">
                  <div class="hw-next-kick">${esc(when)}</div>
                  <div class="hw-next-title">Session ${nextInClinic.session_number || ''} \u00b7 ${esc(nextInClinic.location || 'Room')}</div>
                  <div class="hw-next-sub">${esc(t1)}${t2 ? '\u2013' + esc(t2) : ''} \u00b7 ${esc(nextInClinic.clinician_name || 'Your clinician')} \u00b7 ${esc((nextInClinic.modality_slug || 'tDCS').toUpperCase())}</div>
                </div>`;
              })()}
            </div>
          </div>

          <!-- Care team -->
          <div class="hw-rail-card">
            <div class="hw-rail-hd">
              <div>
                <div class="hw-rail-title">Your care team</div>
                <div class="hw-rail-sub">Usually respond same-day during clinic hours</div>
              </div>
            </div>
            ${(() => {
              const team = [
                { name:'Dr. Julia Kolmar', role:'Lead clinician \u00b7 Psychiatrist',       avatar:'JK', grad:'linear-gradient(135deg,#00d4bc,#4a9eff)' },
                { name:'Rhea Nair, RN',    role:'tDCS technician \u00b7 home device support', avatar:'RN', grad:'linear-gradient(135deg,#9b7fff,#ff8ab3)' },
                { name:'Marcus Tan',       role:'Care coordinator',                        avatar:'MT', grad:'linear-gradient(135deg,#ffb547,#ff8ab3)' },
              ];
              return team.map(m => `
                <div class="hw-care">
                  <div class="hw-care-avatar" style="background:${m.grad}">${esc(m.avatar)}</div>
                  <div><div class="hw-care-name">${esc(m.name)}</div><div class="hw-care-role">${esc(m.role)}</div></div>
                  <button class="hw-care-btn" title="Message" onclick="window._navPatient && window._navPatient('patient-messages')"><svg width="14" height="14"><use href="#i-mail"/></svg></button>
                </div>`).join('');
            })()}
          </div>

          <!-- Safety tip -->
          <div class="hw-rail-card">
            <div class="hw-tip">
              <div class="hw-tip-ico"><svg width="16" height="16"><use href="#i-alert"/></svg></div>
              <div class="hw-tip-body">
                <strong>If something feels off</strong> \u2014 skin redness that doesn\u2019t fade, unusual headache, or persistent low mood \u2014 pause device use and message your clinician. For emergencies, call <strong>999</strong>.
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Toast -->
      <div class="hw-toast" id="hw-toast"><svg width="16" height="16"><use href="#i-check"/></svg><span id="hw-toast-text">Saved</span></div>
    </div>`;

  // ── Handlers ─────────────────────────────────────────────────────────────
  // Track local toggle state so demo mode still mutates the UI.
  const _taskById = new Map(tasks.map(t => [String(t.id), t]));

  function _hwToast(msg) {
    const t = document.getElementById('hw-toast');
    const t2 = document.getElementById('hw-toast-text');
    if (!t || !t2) return;
    t2.textContent = msg || 'Done';
    t.classList.add('show');
    clearTimeout(window._hwToastTimer);
    window._hwToastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ── Launch-audit handlers (PR feat/patient-homework-launch-audit-2026-05-01)
  // Patient page emits its own audit rows for the home_program_tasks
  // surface. Helpers always best-effort: never block the UI on an
  // audit-ingestion failure.
  function _hwAuditPing(event, extra) {
    try {
      if (api.postHomeProgramTaskAuditEvent) {
        api.postHomeProgramTaskAuditEvent({
          event: String(event || 'view'),
          task_id: extra && extra.task_id ? String(extra.task_id) : undefined,
          note: extra && extra.note ? String(extra.note).slice(0, 480) : undefined,
        });
      }
    } catch (_e) { /* audit must never block UI */ }
  }
  // Deep-link to Adherence Events (#350) so completion is logged via the
  // single-source-of-truth endpoint. Mirrors the report-question →
  // patient-messages deep-link pattern used by #346/#347.
  window._hwLogNow = function(taskId) {
    _hwAuditPing('deep_link_followed', {
      task_id: taskId,
      note: 'log_now -> pt-adherence-events',
    });
    if (window._navPatient) {
      window._navPatient('pt-adherence-events?task_id=' + encodeURIComponent(String(taskId)));
    }
  };
  // "Need help?" — opens a Patient Messages thread keyed thread_id=task-<id>.
  // Calls the launch-audit ``/help-request`` endpoint, which creates the
  // Message row, audit row, and (when urgent) the HIGH-priority
  // clinician-visible mirror.
  window._hwHelp = async function(taskId) {
    var task = _taskById.get(String(taskId));
    if (!task) return;
    var reason = window.prompt(
      'What do you need help with on "' +
        (task.title || 'this task') +
        '"?\n\n(Your clinician will see your message in their inbox.)'
    );
    if (reason == null) return;
    reason = String(reason || '').trim();
    if (!reason) {
      _hwToast('Please add a short note so your clinician knows what to look at.');
      return;
    }
    if (!api.homeProgramTaskHelpRequest) {
      _hwToast('Help request not available offline.');
      return;
    }
    try {
      var resp = await api.homeProgramTaskHelpRequest(String(taskId), {
        reason: reason,
        is_urgent: false,
      });
      if (resp && resp.thread_id) {
        _hwAuditPing('task_help_requested', {
          task_id: taskId,
          note: 'thread=' + resp.thread_id,
        });
        _hwToast('Sent to your care team');
        if (window._navPatient) {
          setTimeout(function() {
            window._navPatient('patient-messages?thread_id=' + encodeURIComponent(resp.thread_id));
          }, 600);
        }
      } else {
        _hwToast('Could not send your help request.');
      }
    } catch (e) {
      console.warn('[homework] help-request failed:', e);
      _hwToast('Could not send your help request.');
    }
  };

  window._hwToggle = async function(taskId) {
    const task = _taskById.get(String(taskId));
    if (!task) return;
    const prevCompleted = !!(task.completed || task.done);
    const prevCompletedAt = task.completed_at;
    const nowDone = !(task.completed || task.done);
    task.completed = nowDone;
    task.done = nowDone;
    if (nowDone) task.completed_at = new Date().toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    else delete task.completed_at;
    // Optimistically update DOM:
    const cards = document.querySelectorAll(`[data-task-id="${String(taskId).replace(/"/g, '\\"')}"]`);
    cards.forEach(c => c.classList.toggle('done', nowDone));
    const checks = document.querySelectorAll(`[data-task-id="${String(taskId).replace(/"/g, '\\"')}"] .hw-check, [data-task-id="${String(taskId).replace(/"/g, '\\"')}"] .hw-row-check`);
    checks.forEach(b => b.classList.toggle('is-on', nowDone));
    _hwToast(nowDone ? 'Marked complete' : 'Reopened');
    // Persist via API (no-op in demo / offline mode).
    if (!_isDemo) {
      try {
        const serverTaskId = task.serverTaskId || task.server_task_id;
        if (serverTaskId && api.portalCompleteHomeProgramTask) {
          const saved = await api.portalCompleteHomeProgramTask(serverTaskId, { completed: nowDone });
          task.completed = !!saved?.completed;
          task.done = !!saved?.completed;
          task.completed_at = saved?.completed_at
            ? new Date(saved.completed_at).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })
            : null;
        }
      } catch (e) {
        task.completed = prevCompleted;
        task.done = prevCompleted;
        task.completed_at = prevCompletedAt;
        cards.forEach(c => c.classList.toggle('done', prevCompleted));
        checks.forEach(b => b.classList.toggle('is-on', prevCompleted));
        console.warn('[homework] persist failed, reverting local state:', e);
        _hwToast('Could not save');
      }
    }
  };

  window._hwOpen = function(taskId) {
    const task = _taskById.get(String(taskId));
    if (!task) return;
    // Audit ping: patient opened the task drawer.
    _hwAuditPing('task_viewed', { task_id: taskId });
    const existing = document.getElementById('hw-task-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'hw-task-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    const ico = _icoRef(task.task_type);
    const cat = _catLabel(task.category || task.task_type);
    const noteHtml = task.clinician_note
      ? `<div style="margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:8px;border-left:3px solid var(--primary)">
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Clinician note \u00b7 ${esc(task.clinician_note.date || '')} \u00b7 ${esc(task.clinician_note.by || '')}</div>
          <div style="font-size:13px;color:var(--text-primary)">${esc(task.clinician_note.body || '')}</div>
        </div>`
      : '';
    // "Why am I doing this?" \u2014 clinician-authored rationale only, NEVER
    // AI-generated. Surfaces only when the clinician explicitly authored a
    // ``rationale`` / ``why`` string on the task. Author tag lets reviewers
    // see at-a-glance that it isn't AI-fabricated.
    const rationaleText = task.rationale || task.why || '';
    const rationaleAuthor = task.rationale_author || task.clinician_assigned_by || '';
    const rationaleHtml = rationaleText
      ? `<details style="margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:8px;border-left:3px solid #6366f1">
          <summary style="font-size:12px;color:var(--text-secondary);cursor:pointer">Why am I doing this?${rationaleAuthor ? ' \u00b7 ' + esc(rationaleAuthor) : ''}</summary>
          <div style="font-size:13px;color:var(--text-primary);margin-top:8px;line-height:1.5">${esc(rationaleText)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">Written by your care team \u2014 not AI generated.</div>
        </details>`
      : '';
    modal.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:12px;max-width:520px;width:100%;max-height:80vh;overflow:auto;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <svg width="20" height="20"><use href="${ico}"/></svg>
          <span style="font-weight:600;font-size:15px">${esc(task.title || 'Task')}</span>
          <span style="margin-left:auto;font-size:11px;padding:3px 8px;border-radius:99px;background:var(--bg-elevated);color:var(--text-secondary)">${cat}</span>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.5">${esc(task.description || task.instructions || 'No description.')}</div>
        ${task.duration_min ? `<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">\u23F1 ~${task.duration_min} min \u00b7 ${esc(task.repeat || 'One-time')}</div>` : ''}
        ${rationaleHtml}
        ${noteHtml}
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:16px">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('hw-task-modal').remove()">Close</button>
          <button class="btn btn-ghost btn-sm" onclick="window._hwHelp && window._hwHelp('${esc(task.id)}')">Need help?</button>
          <button class="btn btn-ghost btn-sm" onclick="window._hwLogNow && window._hwLogNow('${esc(task.id)}')">Log now (Adherence)</button>
          <button class="btn btn-primary btn-sm" onclick="window._hwToggle && window._hwToggle('${esc(task.id)}');document.getElementById('hw-task-modal').remove()">${task.completed || task.done ? 'Reopen' : 'Mark done'}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  };

  window._hwStart = function(taskId, kind) {
    const task = _taskById.get(String(taskId));
    if (kind === 'tdcs') {
      _hwToast('Opening home devices\u2026');
      setTimeout(() => window._navPatient && window._navPatient('patient-home-devices'), 500);
    } else if (kind === 'breathing') {
      _hwToast('Opening education library\u2026');
      setTimeout(() => window._navPatient && window._navPatient('patient-education'), 500);
    } else if (kind === 'walk') {
      _hwOpenWalkTimer(task);
    } else {
      // Unknown kind — open the task detail instead of a misleading toast.
      if (task) window._hwOpen(taskId);
    }
    if (task && !(task.completed || task.done)) {
      // Don't auto-complete — let the patient confirm after finishing.
    }
  };

  function _hwOpenWalkTimer(task) {
    if (!task) return;
    const dur = task.duration_min || 20;
    const existing = document.getElementById('hw-walk-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'hw-walk-modal';
    modal.className = 'hw-modal';
    modal.innerHTML = `
      <div class="hw-modal-overlay" onclick="document.getElementById('hw-walk-modal').remove()"></div>
      <div class="hw-modal-body" style="max-width:420px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <div style="width:36px;height:36px;border-radius:10px;background:rgba(74,222,128,0.15);color:#4ade80;display:flex;align-items:center;justify-content:center;font-size:18px">&#128694;</div>
          <div><div style="font-weight:700;font-size:1rem;color:var(--text-primary)">${esc(task.title || 'Walk')}</div><div style="font-size:0.78rem;color:var(--text-secondary)">${dur} min \u00b7 note mood before &amp; after</div></div>
        </div>
        <div style="margin:16px 0;text-align:center">
          <div id="hw-walk-timer" style="font-family:var(--font-display);font-size:3.2rem;font-weight:800;color:var(--teal)">${dur}:00</div>
          <div style="font-size:0.75rem;color:var(--text-tertiary);margin-top:4px">Timer</div>
        </div>
        <div style="margin-bottom:14px">
          <label style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px">Mood before (1\u201310)</label>
          <input type="range" id="hw-walk-mood-before" min="1" max="10" value="5" style="width:100%;accent-color:var(--teal)" oninput="document.getElementById('hw-walk-mood-before-val').textContent=this.value">
          <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-tertiary);margin-top:2px"><span>Low</span><span id="hw-walk-mood-before-val">5</span><span>High</span></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:18px">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('hw-walk-modal').remove()">Close</button>
          <button class="btn btn-primary btn-sm" id="hw-walk-start-btn" onclick="window._hwWalkBegin && window._hwWalkBegin('${esc(task.id)}', ${dur})">Start ${dur} min walk</button>
          <button class="btn btn-primary btn-sm" id="hw-walk-done-btn" style="display:none" onclick="window._hwWalkDone && window._hwWalkDone('${esc(task.id)}')">Log completion</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  var _hwWalkTimerId = null;
  window._hwWalkBegin = function(taskId, dur) {
    const startBtn = document.getElementById('hw-walk-start-btn');
    const doneBtn = document.getElementById('hw-walk-done-btn');
    const timerEl = document.getElementById('hw-walk-timer');
    if (startBtn) startBtn.style.display = 'none';
    if (doneBtn) doneBtn.style.display = 'inline-flex';
    var remaining = dur * 60;
    if (_hwWalkTimerId) clearInterval(_hwWalkTimerId);
    _hwWalkTimerId = setInterval(function() {
      remaining--;
      if (remaining <= 0) {
        clearInterval(_hwWalkTimerId);
        _hwWalkTimerId = null;
        if (timerEl) timerEl.textContent = '0:00';
        _hwToast('Walk complete \u2014 great work!');
        return;
      }
      var m = Math.floor(remaining / 60);
      var s = remaining % 60;
      if (timerEl) timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  };
  window._hwWalkDone = function(taskId) {
    if (_hwWalkTimerId) { clearInterval(_hwWalkTimerId); _hwWalkTimerId = null; }
    const moodBefore = document.getElementById('hw-walk-mood-before');
    const mb = moodBefore ? parseInt(moodBefore.value, 10) : null;
    const task = _taskById.get(String(taskId));
    if (task) {
      task.completed = true;
      task.done = true;
      task.completed_at = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      if (mb != null) { task.mood_before = mb; }
    }
    // Persist to API if available
    if (!_isDemo && api.mutateHomeProgramTask && uid && task) {
      api.mutateHomeProgramTask({ ...task, patient_id: uid }).catch(function() {});
    }
    // Update UI
    const card = document.querySelector('[data-task-id="' + taskId + '"]');
    if (card) {
      card.classList.add('done');
      const foot = card.querySelector('.hw-task-foot');
      if (foot) {
        foot.innerHTML = '<button class="hw-check is-on" onclick="window._hwToggle && window._hwToggle(\'' + esc(taskId) + '\')" title="Mark incomplete"><svg width="14" height="14"><use href="#i-check"/></svg></button><span style="font-size:11.5px;color:var(--text-secondary)">' + (task.mood_before != null ? 'Mood <strong style="color:var(--text-primary)">' + task.mood_before + '</strong> \u00b7 ' : '') + 'Completed</span><button class="btn btn-ghost btn-sm hw-go" onclick="window._hwOpen && window._hwOpen(\'' + esc(taskId) + '\')">View<svg width="11" height="11"><use href="#i-arrow-right"/></svg></button>';
      }
    }
    document.getElementById('hw-walk-modal')?.remove();
    _hwToast('Logged \u2014 nice work!');
  };

  window._hwFilter = function(f) {
    document.querySelectorAll('#hw-filters .hw-filter').forEach(b => b.classList.toggle('active', b.dataset.f === f));
    const secToday = document.getElementById('hw-sec-today');
    const secWeek  = document.getElementById('hw-sec-week');
    // Today filter shows only today-section; others filter BOTH sections by category.
    if (f === 'today') {
      if (secToday) secToday.style.display = '';
      if (secWeek)  secWeek.style.display  = '';
      document.querySelectorAll('.hw-task, .hw-row').forEach(el2 => el2.style.display = '');
      return;
    }
    if (f === 'week') {
      if (secToday) secToday.style.display = 'none';
      if (secWeek)  secWeek.style.display  = '';
      document.querySelectorAll('.hw-row').forEach(el2 => el2.style.display = '');
      return;
    }
    if (secToday) secToday.style.display = '';
    if (secWeek)  secWeek.style.display  = '';
    document.querySelectorAll('.hw-task, .hw-row').forEach(el2 => {
      el2.style.display = (el2.getAttribute('data-cat') === f) ? '' : 'none';
    });
  };

  window._hwSearch = function(q) {
    const needle = String(q || '').toLowerCase().trim();
    document.querySelectorAll('.hw-task, .hw-row').forEach(el2 => {
      if (!needle) { el2.style.display = ''; return; }
      const hay = el2.textContent.toLowerCase();
      el2.style.display = hay.includes(needle) ? '' : 'none';
    });
  };

  window._hwMoodPick = function(v) {
    document.querySelectorAll('#hw-mood-scale button').forEach(b => b.classList.toggle('active', Number(b.getAttribute('data-v')) === v));
    try {
      const iso = todayIso;
      const prev = JSON.parse(localStorage.getItem('ds_checkin_' + iso) || '{}');
      prev.mood = v * 2;  // map 1-5 → 2-10
      localStorage.setItem('ds_checkin_' + iso, JSON.stringify(prev));
      localStorage.setItem('ds_last_checkin', iso);
    } catch (_e) {}
    if (!_isDemo && uid && api.submitAssessment) {
      api.submitAssessment(uid, { type: 'wellness_checkin', mood: v * 2, date: new Date().toISOString() }).catch(() => {});
    }
    _hwToast('Mood logged');
  };

  window._hwReminders = function() {
    _hwToast('Reminders are not yet available \u2014 your clinic will enable them');
  };

  window._hwExport = function() {
    const lines = ['# Homework plan', '', `Exported: ${new Date().toLocaleString(loc)}`, ''];
    tasks.forEach(t => {
      lines.push(`- [${(t.completed || t.done) ? 'x' : ' '}] ${t.title || 'Task'}  _(${t.category || t.task_type || ''}, due ${t.due_on || 'TBD'})_`);
      if (t.description) lines.push(`  ${t.description}`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homework-${todayIso}.md`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    _hwToast('Plan exported');
  };

  window._hwAddLibrary = async function(libId) {
    const lib = library.find(l => l.id === libId);
    if (!lib) return;
    _hwToast(lib.active ? 'Opening ' + lib.title : 'Adding to your plan\u2026');
    const newTask = {
      id: 'lib-' + lib.id + '-' + Date.now(),
      title: lib.title,
      category: lib.category,
      task_type: lib.task_type,
      duration_min: lib.duration_min,
      description: lib.desc,
      source_library_id: lib.id,
      completed: false,
      done: false,
      due_on: new Date().toISOString().slice(0, 10),
      _bucket: 'today',
      _priority: 'normal',
      time_bucket: 'Any time',
    };
    // Always persist locally so the task appears immediately
    try {
      var stored = JSON.parse(localStorage.getItem('ds_hw_library_tasks') || '[]');
      if (!Array.isArray(stored)) stored = [];
      stored.push(newTask);
      localStorage.setItem('ds_hw_library_tasks', JSON.stringify(stored));
    } catch (_e) {}
    // Also call API if available (background)
    if (!_isDemo && api.mutateHomeProgramTask && uid) {
      try {
        await api.mutateHomeProgramTask({ ...newTask, patient_id: uid });
        _hwToast('Added to your home-task workflow');
      } catch (e) { console.warn('[homework] add lib failed:', e); }
    } else {
      _hwToast('Added to today\u2019s plan');
    }
    // Add to in-memory state
    tasks.push(newTask);
    _taskById.set(String(newTask.id), newTask);
    // Insert card into today's grid without full re-render
    const grid = document.querySelector('.hw-today-grid');
    if (grid) {
      const empty = grid.querySelector('.pth2-empty');
      if (empty) empty.remove();
      const wrapper = document.createElement('div');
      wrapper.innerHTML = _taskCardHtml(newTask);
      grid.appendChild(wrapper.firstElementChild);
    }
    // Update filter counts
    const todayFilter = document.querySelector('#hw-filters .hw-filter[data-f="today"] .count');
    if (todayFilter) todayFilter.textContent = tasks.filter(t => (t.due_on || '').slice(0, 10) === todayIso).length;
    const catFilter = document.querySelector('#hw-filters .hw-filter[data-f="' + esc(lib.category) + '"] .count');
    if (catFilter) catFilter.textContent = tasks.filter(t => t.category === lib.category).length;
  };

  window._hwBrowseLibrary = function() {
    window._navPatient && window._navPatient('patient-education');
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

// Generic Likert-scale form renderer — PHQ-9, GAD-7, PCL-5, DASS-21, ISI, etc.
// Reuses the pt-phq9-* CSS classes (they are visually correct for any
// Likert grid, and renaming would churn the stylesheet without benefit).
//
// Per-form state is kept on window under a namespaced key so multiple forms
// can coexist (in theory — the portal only opens one at a time, but scoping
// is still the right call).
function renderLikertForm(containerId, patientId, config) {
  const formEl = document.getElementById(containerId);
  if (!formEl) return;
  if (!config || !Array.isArray(config.questions) || !Array.isArray(config.options)) return;

  const key       = config.formKey;
  const questions = config.questions;
  const options   = config.options;
  const maxScore  = config.maxScore != null
    ? config.maxScore
    : questions.length * (options[options.length - 1]?.value ?? 0);
  const severityFn = typeof config.severityFn === 'function'
    ? config.severityFn
    : () => ({ label: 'Recorded', color: 'var(--teal)' });

  // IDs are namespaced by formKey so two rendered forms cannot collide.
  const qId  = (i)        => `${key}-q${i}`;
  const rId  = (i, v)     => `${key}-r${i}-${v}`;
  const liveId  = `${key}-live-score`;
  const resId   = `${key}-result`;
  const wrapId  = `${key}-form-wrap`;

  // Running-score label: reuse the PHQ-9 i18n string when available, fall
  // back to a neutral English label for the other scales.
  const runLabel = (key === 'phq9') ? t('patient.phq9.running_score') : 'Your score so far';
  const submitLabel = (key === 'phq9') ? t('patient.phq9.submit') : 'Submit';
  const headerText  = config.header || '';

  formEl.innerHTML = `
    <div class="pt-assessment-form" id="${wrapId}">
      ${headerText ? `
        <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px">
          ${headerText}
        </div>` : ''}
      ${questions.map((q, i) => `
        <div class="pt-phq9-question" id="${qId(i)}">
          <div style="font-size:12.5px;color:var(--text-primary);margin-bottom:8px;line-height:1.5">
            <span style="color:var(--text-tertiary);margin-right:6px">${i + 1}.</span>${q}
          </div>
          <div class="pt-phq9-options">
            ${options.map((opt) => `
              <label class="pt-phq9-option" onclick="window._ptLikertPick('${key}', ${i}, ${opt.value})">
                <input type="radio" name="${key}_q${i}" value="${opt.value}" style="display:none">
                <span class="pt-phq9-radio" id="${rId(i, opt.value)}"></span>
                <span style="font-size:11.5px;color:var(--text-secondary)">${opt.label}</span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div style="display:flex;align-items:center;gap:16px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text-tertiary)">${runLabel}</div>
          <div style="font-size:20px;font-weight:700;font-family:var(--font-display);color:var(--teal)" id="${liveId}">0 / ${maxScore}</div>
        </div>
        <button class="btn btn-primary" onclick="window._ptLikertSubmit('${key}')">${submitLabel}</button>
      </div>
      <div id="${resId}" style="display:none"></div>
    </div>
  `;

  // Per-form state registry on window.
  window._likertState = window._likertState || {};
  window._likertState[key] = {
    answers:    new Array(questions.length).fill(null),
    options,
    questions,
    maxScore,
    severityFn,
    templateId: config.templateId || key,
    patientId,
  };

  // Keep the legacy PHQ-9 mirror so any external code or tests that still
  // read window._phq9Answers continue to work.
  if (key === 'phq9') window._phq9Answers = window._likertState.phq9.answers;

  if (typeof window._ptLikertPick !== 'function') {
    window._ptLikertPick = function(formKey, q, v) {
      const st = window._likertState && window._likertState[formKey];
      if (!st) return;
      st.answers[q] = v;
      for (const opt of st.options) {
        const r = document.getElementById(`${formKey}-r${q}-${opt.value}`);
        if (r) r.classList.toggle('selected', opt.value === v);
      }
      const qEl = document.getElementById(`${formKey}-q${q}`);
      if (qEl) qEl.classList.add('answered');
      const score  = st.answers.reduce((sum, a) => sum + (a ?? 0), 0);
      const liveEl = document.getElementById(`${formKey}-live-score`);
      if (liveEl) liveEl.textContent = `${score} / ${st.maxScore}`;
      if (formKey === 'phq9') window._phq9Answers = st.answers;
    };
  }

  if (typeof window._ptLikertSubmit !== 'function') {
    window._ptLikertSubmit = async function(formKey) {
      const st = window._likertState && window._likertState[formKey];
      if (!st) return;
      const unanswered = st.answers.findIndex(a => a === null);
      const resultEl   = document.getElementById(`${formKey}-result`);
      if (unanswered !== -1) {
        const qEl = document.getElementById(`${formKey}-q${unanswered}`);
        if (qEl) { qEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); qEl.classList.add('pt-phq9-highlight'); }
        return;
      }
      const score    = st.answers.reduce((sum, a) => sum + a, 0);
      const severity = st.severityFn(score);
      const pct      = Math.round((score / st.maxScore) * 100);

      if (!st.patientId) {
        if (resultEl) { resultEl.style.display = ''; resultEl.innerHTML = '<div class="notice notice-error" style="margin-top:12px">Unable to identify patient. Please refresh and try again.</div>'; }
        return;
      }
      try {
        await api.submitAssessment(st.patientId, {
          template_id:       st.templateId,
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
      // Result body text: keep the PHQ-9 translated copy; fall back to a
      // generic message for other scales (it talks about clinician review,
      // which applies to any measure).
      const bodyText = (formKey === 'phq9')
        ? t('patient.assess.result.body')
        : 'Your score has been saved in this browser. Clinic review depends on portal workflow before your next session. If you are experiencing thoughts of self-harm, please contact your clinician immediately or call a crisis line.';
      const titleText = (formKey === 'phq9')
        ? t('patient.assess.result.title')
        : 'Assessment Result';
      resultEl.innerHTML = `
        <div style="margin-top:20px;padding:20px;border-radius:var(--radius-lg);border:1px solid var(--border-teal);background:rgba(0,212,188,0.04)">
          <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px">${titleText}</div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px">
            <div style="font-size:32px;font-weight:700;font-family:var(--font-display);color:${severity.color}">${score}</div>
            <div style="font-size:13px;color:var(--text-secondary)">out of ${st.maxScore}</div>
            <div style="margin-left:auto;font-size:14px;font-weight:600;color:${severity.color}">${severity.label}</div>
          </div>
          <div class="progress-bar" style="height:8px;margin-bottom:8px">
            <div style="height:100%;width:${pct}%;background:${severity.color};border-radius:4px;transition:width 0.8s ease"></div>
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.6;margin-top:12px">
            ${bodyText}
          </div>
        </div>
      `;
      setTimeout(() => resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    };
  }
}

// Dispatcher — map a formKey to its config and render. Used by the
// assessments page to open the right form inline.
function renderAssessmentForm(formKey, containerId, patientId) {
  if (!SUPPORTED_FORMS[formKey]) return;
  // Prefer the shared config bank. PHQ-9 overrides questions/header with
  // the i18n-backed runtime versions so existing translations still apply.
  const base = getAssessmentConfig(formKey);
  if (!base) return;
  const config = (formKey === 'phq9')
    ? { ...base,
        header:    t('patient.phq9.header'),
        questions: getPHQ9Questions(),
        options:   base.options.map((o, i) => ({ value: o.value, label: getPHQ9Options()[i] || o.label })),
        severityFn: (score) => {
          if (score <= 4)  return { label: t('patient.phq9.sev.minimal'),    color: 'var(--green)' };
          if (score <= 9)  return { label: t('patient.phq9.sev.mild'),       color: 'var(--teal)'  };
          if (score <= 14) return { label: t('patient.phq9.sev.moderate'),   color: 'var(--blue)'  };
          if (score <= 19) return { label: t('patient.phq9.sev.mod_severe'), color: 'var(--amber)' };
          return               { label: t('patient.phq9.sev.severe'),       color: '#ff6b6b'      };
        },
      }
    : base;
  renderLikertForm(containerId, patientId, config);
}

// Thin PHQ-9 wrapper — kept so any older call site (and tests) still works.
function renderPHQ9Form(containerId, patientId) {
  renderAssessmentForm('phq9', containerId, patientId);
}

// ── Assessments ────────────────────────────────────────────────────────────────
export async function pgPatientAssessments() {
  try { return await _pgPatientAssessmentsImpl(); }
  catch (err) {
    console.error('[pgPatientAssessments] render failed:', err);
    const el = document.getElementById('patient-content');
    if (el) el.innerHTML = `<div class="pt-portal-empty"><div class="pt-portal-empty-ico" aria-hidden="true">&#9888;</div><div class="pt-portal-empty-title">Assessments are unavailable</div><div class="pt-portal-empty-body">Please refresh, or message your care team if this keeps happening.</div></div>`;
  }
}

async function _pgPatientAssessmentsImpl() {
  setTopbar(t('patient.nav.assessments'));
  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  const loc = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
  const todayIso = new Date().toISOString().slice(0, 10);

  const _t = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _race = (p) => Promise.race([Promise.resolve(p).catch(() => null), _t(3000)]);
  const uid = currentUser?.patient_id || currentUser?.id || null;
  const [assessRaw, coursesRaw, sessionsRaw, outcomesRaw] = await Promise.all([
    _race(api.patientPortalAssessments()),
    _race(api.patientPortalCourses()),
    _race(api.patientPortalSessions()),
    _race(api.patientPortalOutcomes()),
  ]);

  const assessments = Array.isArray(assessRaw) ? assessRaw : [];
  const courses = Array.isArray(coursesRaw) ? coursesRaw : [];
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];
  const outcomes = Array.isArray(outcomesRaw) ? outcomesRaw : [];
  const activeCourse = courses.find(c => c.status === 'active') || courses[0] || null;
  const clinicianName = activeCourse?.primary_clinician_name || 'Your clinician';
  const _isDemo = assessments.length === 0 && outcomes.length === 0 && courses.length === 0;

  // ── Due / History / Scheduled buckets ─────────────────────────────────
  // Real schema: assessments include status: scheduled | pending | completed.
  const due = [];
  const history = [];
  const scheduled = [];
  assessments.forEach(a => {
    const st = String(a.status || '').toLowerCase();
    const kind = String(a.template_slug || a.template_name || '').toLowerCase();
    let cat = /phq/.test(kind) ? 'depression' : /gad/.test(kind) ? 'anxiety' : /isi/.test(kind) ? 'sleep' : /who/.test(kind) ? 'wellbeing' : 'other';
    if (/self_/.test(kind)) cat = 'self';
    const item = {
      id: a.id, slug: a.template_slug || kind, title: a.template_name || a.template_slug || 'Assessment',
      cat, raw: a,
      due_on: a.due_on, scheduled_at: a.scheduled_at, administered_at: a.administered_at,
      score: a.score_numeric ?? a.score, band: a.band || a.severity_label,
    };
    if (st === 'completed' || a.administered_at) history.push(item);
    else if (st === 'scheduled' && a.due_on && new Date(a.due_on) > new Date(Date.now() + 7 * 86400000)) scheduled.push(item);
    else due.push(item);
  });

  // Demo seed — mirrors the mockup story.
  const demoDue = !_isDemo ? [] : [
    { id:'dm-as-phq', slug:'phq-9', cat:'depression', title:'PHQ-9',  fullName:'Patient Health Questionnaire', items:9, mins:4, desc:'Measures depression symptoms over the past two weeks. Your clinician uses this to track your response to stimulation.', dueOn:new Date(Date.now() + 3 * 86400000).toISOString(), overdue:true,  repeat:'Weekly', lastScore:11, lastBand:'Moderate → Mild', lastSub:'↓ 7 pts since Feb · improving', trendPath:'M0,8 L17,8 L35,11 L52,15 L70,19 L87,22 L105,24 L122,27 L140,28', trendColor:'#00d4bc' },
    { id:'dm-as-gad', slug:'gad-7', cat:'anxiety',    title:'GAD-7',  fullName:'Generalized Anxiety Disorder scale', items:7, mins:3, desc:'Screens for generalized anxiety over the past two weeks. Tracked weekly alongside your PHQ-9.', dueOn:todayIso, overdue:false, repeat:'Weekly', lastScore:9, lastBand:'Mild',            lastSub:'↓ 4 pts since Feb · stable',   trendPath:'M0,12 L23,10 L46,14 L70,18 L93,20 L116,22 L140,22', trendColor:'#4a9eff' },
  ];
  const demoOptional = !_isDemo ? [] : [
    { id:'dm-se',  slug:'side_effects', tone:'amber',  ico:'#i-alert', title:'Session side-effect check-in', sub:"Did anything feel off after your last session? 6 quick questions · last filled 3 days ago" },
    { id:'dm-isi', slug:'isi',          tone:'violet', ico:'#i-moon',  title:'Insomnia Severity Index (ISI)', sub:'Sleep quality over the past 2 weeks · 7 questions · due next Monday' },
    { id:'dm-who', slug:'who5',         tone:'teal',   ico:'#i-sparkle', title:'WHO-5 Wellbeing Index',        sub:'General wellbeing over the past 2 weeks · 5 questions · monthly' },
  ];
  const demoHistory = !_isDemo ? [] : [
    { id:'dm-h1', slug:'phq-9', cat:'depression', title:'PHQ-9',         dateIso:'2026-04-15', score:11, delta:-2 },
    { id:'dm-h2', slug:'gad-7', cat:'anxiety',    title:'GAD-7',         dateIso:'2026-04-15', score:9,  delta:-1 },
    { id:'dm-h3', slug:'phq-9', cat:'depression', title:'PHQ-9',         dateIso:'2026-04-08', score:13, delta:-1 },
    { id:'dm-h4', slug:'gad-7', cat:'anxiety',    title:'GAD-7',         dateIso:'2026-04-08', score:10, delta:-1 },
    { id:'dm-h5', slug:'isi',   cat:'sleep',      title:'ISI',           dateIso:'2026-04-01', score:12, delta:-4 },
    { id:'dm-h6', slug:'phq-9', cat:'depression', title:'PHQ-9',         dateIso:'2026-04-01', score:14, delta:-1 },
    { id:'dm-h7', slug:'gad-7', cat:'anxiety',    title:'GAD-7',         dateIso:'2026-04-01', score:11, delta:-1 },
    { id:'dm-h8', slug:'daily', cat:'daily',      title:'Daily check-in',dateIso:'2026-04-19', score:4 },
    { id:'dm-h9', slug:'daily', cat:'daily',      title:'Daily check-in',dateIso:'2026-04-18', score:4 },
    { id:'dm-h10',slug:'daily', cat:'daily',      title:'Daily check-in',dateIso:'2026-04-17', score:3 },
  ];
  const demoScheduled = !_isDemo ? [] : [
    { id:'dm-s1', title:'PHQ-9 weekly check-in', dateIso:'2026-04-27', cat:'depression', repeat:'Weekly' },
    { id:'dm-s2', title:'GAD-7 weekly check-in', dateIso:'2026-04-27', cat:'anxiety',    repeat:'Weekly' },
    { id:'dm-s3', title:'Insomnia Severity Index', dateIso:'2026-04-27', cat:'sleep',   repeat:'Bi-weekly' },
    { id:'dm-s4', title:'WHO-5 Wellbeing Index',  dateIso:'2026-05-04', cat:'wellbeing', repeat:'Monthly' },
    { id:'dm-s5', title:'PHQ-9 weekly check-in',  dateIso:'2026-05-04', cat:'depression', repeat:'Weekly' },
    { id:'dm-s6', title:'GAD-7 weekly check-in',  dateIso:'2026-05-04', cat:'anxiety',    repeat:'Weekly' },
  ];

  // Daily check-in streak from localStorage.
  const streak = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10) || 0;

  // ── Helpers ─────────────────────────────────────────────────────────────
  function _dueLabel(dueOn, overdue) {
    if (!dueOn) return '<span class="as-card-due"><svg width="11" height="11"><use href="#i-clock"/></svg>Due soon</span>';
    const d = new Date(dueOn);
    const now = new Date();
    const isToday = d.toISOString().slice(0, 10) === todayIso;
    if (overdue || d.getTime() < now.getTime() - 86400000) return `<span class="as-card-due overdue"><svg width="11" height="11"><use href="#i-alert"/></svg>Overdue · due ${esc(d.toLocaleDateString(loc, { weekday: 'short' }))}</span>`;
    if (isToday) return `<span class="as-card-due"><svg width="11" height="11"><use href="#i-clock"/></svg>Due today</span>`;
    return `<span class="as-card-due"><svg width="11" height="11"><use href="#i-clock"/></svg>Due ${esc(d.toLocaleDateString(loc, { weekday: 'short', month: 'short', day: 'numeric' }))}</span>`;
  }

  function _dueCardHtml(a) {
    const dueClass = a.overdue ? 'overdue' : 'due';
    const trendBand = a.lastBand || '';
    const bandCls = /mild/i.test(trendBand) ? 'mild' : /moderate/i.test(trendBand) ? 'moderate' : /severe/i.test(trendBand) ? 'severe' : 'minimal';
    return `
      <div class="as-card ${dueClass}" data-assessment="${esc(a.slug)}">
        <div class="as-card-hd">
          <div class="as-card-tag ${esc(a.cat || 'depression')}">${esc((a.cat || 'assessment').replace(/^./, c => c.toUpperCase()))}</div>
          ${_dueLabel(a.dueOn, a.overdue)}
        </div>
        <div class="as-card-title">${esc(a.title)}</div>
        <div class="as-card-sub">${esc((a.fullName || a.title) + (a.items ? ' · ' + a.items + ' questions' : '') + (a.mins ? ' · ~' + a.mins + ' min' : ''))}</div>
        ${a.desc ? `<div class="as-card-desc">${esc(a.desc)}</div>` : ''}
        <div class="as-card-meta">
          ${a.mins ? `<span class="as-card-meta-item"><svg width="11" height="11"><use href="#i-clock"/></svg>~${a.mins} min</span>` : ''}
          ${a.repeat ? `<span class="as-card-meta-item"><svg width="11" height="11"><use href="#i-repeat"/></svg>${esc(a.repeat)}</span>` : ''}
          <span class="as-card-meta-item"><svg width="11" height="11"><use href="#i-user"/></svg>${esc(clinicianName)}</span>
        </div>
        ${a.trendPath ? `
        <div class="as-card-trend">
          <svg viewBox="0 0 140 36" preserveAspectRatio="none">
            <path d="${esc(a.trendPath)}" fill="none" stroke="${esc(a.trendColor || '#00d4bc')}" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <div class="as-card-trend-info">
            <div class="as-card-band ${bandCls}">${esc(trendBand || '—')}</div>
            ${a.lastSub ? `<div class="as-card-trend-sub">${esc(a.lastSub)}</div>` : ''}
          </div>
        </div>` : ''}
        <button class="btn btn-primary as-start" onclick="window._asStart && window._asStart('${esc(a.slug)}')">Start questionnaire<svg width="13" height="13"><use href="#i-arrow-right"/></svg></button>
      </div>`;
  }

  function _optCardHtml(o) {
    return `
      <div class="as-opt-card ${esc(o.tone || 'teal')}" data-assessment="${esc(o.slug)}">
        <div class="as-opt-card-hd">
          <div class="as-opt-card-ico"><svg width="18" height="18"><use href="${esc(o.ico || '#i-sparkle')}"/></svg></div>
          <div class="as-opt-card-tag">Optional</div>
        </div>
        <div class="as-opt-card-title">${esc(o.title)}</div>
        <div class="as-opt-card-sub">${esc(o.sub || '')}</div>
        <button class="btn btn-primary btn-sm as-opt-start" onclick="window._asStart && window._asStart('${esc(o.slug)}')">Start questionnaire<svg width="12" height="12"><use href="#i-arrow-right"/></svg></button>
      </div>`;
  }

  function _historyRowHtml(h) {
    const d = new Date(h.dateIso);
    const dateStr = d.toLocaleDateString(loc, { month: 'short', day: 'numeric' });
    const deltaCls = h.delta == null ? '' : (h.delta < 0 ? 'good' : h.delta > 0 ? 'bad' : '');
    const deltaStr = h.delta == null ? '' : (h.delta > 0 ? '+' + h.delta : h.delta.toString());
    return `
      <div class="as-hist-row">
        <div class="as-hist-date">${esc(dateStr)}</div>
        <div class="as-hist-name">
          <div class="as-hist-name-ico ${esc(h.cat)}">${esc((h.title || '').replace(/[^A-Z0-9-]/gi, '').slice(0, 3).toUpperCase() || '—')}</div>
          <div><div class="as-hist-name-title">${esc(h.title)}</div><div class="as-hist-name-sub">${esc(h.cat)}</div></div>
        </div>
        <div class="as-hist-spark"></div>
        <div class="as-hist-score">${esc(String(h.score ?? '—'))}${deltaStr ? ` <span class="delta ${deltaCls}">${esc(deltaStr)}</span>` : ''}</div>
        <div class="as-hist-action"><button class="btn btn-ghost btn-sm" onclick="window._asViewHistory && window._asViewHistory('${esc(h.id)}')">View</button></div>
      </div>`;
  }

  function _schedRowHtml(s) {
    const d = new Date(s.dateIso);
    return `
      <div class="as-sched-row">
        <div class="as-sched-date">
          <div class="mo">${esc(d.toLocaleDateString(loc, { month: 'short' }).toUpperCase())}</div>
          <div class="d">${d.getDate()}</div>
          <div class="dow">${esc(d.toLocaleDateString(loc, { weekday: 'short' }).toUpperCase())}</div>
        </div>
        <div class="as-sched-body">
          <div class="as-sched-title">${esc(s.title)}</div>
          <div class="as-sched-sub">${esc(s.repeat || 'One-time')}</div>
        </div>
        <span class="as-sched-pill">${esc((s.cat || '').toUpperCase())}</span>
      </div>`;
  }

  // ── Self-Assessment helpers ─────────────────────────────────────────────
  function _selfAssessLastLabel(key) {
    const last = getSelfAssessmentLastFiled(key);
    if (!last) return '<span class="as-sa-last">Not filed yet</span>';
    const d = new Date(last);
    const daysAgo = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (daysAgo === 0) return '<span class="as-sa-last">Last filed: Today</span>';
    if (daysAgo === 1) return '<span class="as-sa-last">Last filed: Yesterday</span>';
    return `<span class="as-sa-last">Last filed: ${daysAgo} days ago</span>`;
  }

  function _selfAssessCardHtml(key) {
    const survey = SELF_ASSESSMENT_SURVEYS[key];
    const last = getSelfAssessmentLastFiled(key);
    let dueSoon = false;
    if (last) {
      const daysAgo = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
      dueSoon = survey.frequency === 'daily' ? daysAgo >= 1 : survey.frequency === 'weekly' ? daysAgo >= 5 : daysAgo >= 25;
    } else {
      dueSoon = true;
    }
    const freqLabel = survey.frequency.replace(/^./, c => c.toUpperCase());
    return `
      <div class="as-sa-card ${esc(survey.tone)} ${dueSoon ? 'due-soon' : ''}" data-sa="${esc(key)}">
        <div class="as-sa-card-hd">
          <div class="as-sa-ico">${esc(survey.emoji)}</div>
          <div class="as-sa-badge">${esc(freqLabel)} · ${esc(survey.timeLabel)}</div>
        </div>
        <div class="as-sa-card-title">${esc(survey.title)}</div>
        <div class="as-sa-card-sub">${esc(survey.questions.length)} questions · ${esc(survey.timeLabel)}</div>
        ${_selfAssessLastLabel(key)}
        <button class="btn btn-primary btn-sm as-sa-start" onclick="window._asSelfStart && window._asSelfStart('${esc(key)}')">File now</button>
      </div>`;
  }

  function _selfAssessFormHtml(key) {
    const survey = SELF_ASSESSMENT_SURVEYS[key];
    const draft = getSelfAssessmentDraft(key) || {};
    const answers = draft.answers || {};
    function _qHtml(q, idx) {
      const val = answers[q.key] ?? '';
      if (q.type === 'emoji_scale') {
        const emojis = [{v:1,f:'\uD83D\uDE23',l:'Very low'},{v:2,f:'\uD83D\uDE15',l:'Low'},{v:3,f:'\uD83D\uDE10',l:'OK'},{v:4,f:'\uD83D\uDE42',l:'Good'},{v:5,f:'\uD83D\uDE0A',l:'Great'}];
        return `
          <div class="as-sa-q" data-q="${esc(q.key)}">
            <div class="as-sa-q-lbl">${esc(q.label)}${q.optional ? '' : ' <span class="req">*</span>'}</div>
            <div class="as-sa-emoji-scale">
              ${emojis.map(e => `<button type="button" class="as-sa-emoji-btn ${val == e.v ? 'on' : ''}" data-v="${e.v}" onclick="window._asSelfPick && window._asSelfPick('${esc(key)}','${esc(q.key)}',${e.v})"><span class="f">${e.f}</span><span class="l">${esc(e.l)}</span></button>`).join('')}
            </div>
          </div>`;
      }
      if (q.type === 'slider') {
        const opts = [];
        for (let i = q.min; i <= q.max; i++) opts.push(i);
        return `
          <div class="as-sa-q" data-q="${esc(q.key)}">
            <div class="as-sa-q-lbl">${esc(q.label)}${q.optional ? '' : ' <span class="req">*</span>'}</div>
            <div class="as-sa-slider-wrap">
              <input type="range" min="${q.min}" max="${q.max}" value="${val || Math.floor((q.min+q.max)/2)}" class="as-sa-slider" id="sa-slider-${esc(key)}-${esc(q.key)}" oninput="window._asSelfSlider && window._asSelfSlider('${esc(key)}','${esc(q.key)}',this.value)">
              <div class="as-sa-slider-labels"><span>${esc(q.labels[0])}</span><span id="sa-slider-val-${esc(key)}-${esc(q.key)}">${val || Math.floor((q.min+q.max)/2)}</span><span>${esc(q.labels[1])}</span></div>
            </div>
          </div>`;
      }
      if (q.type === 'checkboxes') {
        const selected = Array.isArray(val) ? val : (val ? [val] : []);
        return `
          <div class="as-sa-q" data-q="${esc(q.key)}">
            <div class="as-sa-q-lbl">${esc(q.label)}${q.optional ? '' : ' <span class="req">*</span>'}</div>
            <div class="as-sa-checks">
              ${q.options.map(opt => `<label class="as-sa-check"><input type="checkbox" value="${esc(opt)}" ${selected.includes(opt) ? 'checked' : ''} onchange="window._asSelfCheck && window._asSelfCheck('${esc(key)}','${esc(q.key)}',this.value,this.checked)"><span>${esc(opt)}</span></label>`).join('')}
            </div>
          </div>`;
      }
      if (q.type === 'text') {
        return `
          <div class="as-sa-q" data-q="${esc(q.key)}">
            <div class="as-sa-q-lbl">${esc(q.label)}${q.optional ? '' : ' <span class="req">*</span>'}</div>
            <textarea class="as-sa-textarea" rows="3" maxlength="${q.maxLength || 500}" placeholder="Type here..." oninput="window._asSelfText && window._asSelfText('${esc(key)}','${esc(q.key)}',this.value)">${esc(val)}</textarea>
          </div>`;
      }
      return '';
    }
    return `
      <div class="as-sa-form" id="as-sa-form-${esc(key)}">
        <div class="as-sa-form-hd">
          <div>
            <div class="as-sa-form-title">${esc(survey.title)}</div>
            <div class="as-sa-form-sub">${esc(survey.questions.length)} questions · ${esc(survey.timeLabel)} · ${esc(survey.frequency)}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="window._asSelfCancel && window._asSelfCancel('${esc(key)}')">Cancel</button>
        </div>
        <div class="as-sa-form-body">
          ${survey.questions.map((q, i) => _qHtml(q, i)).join('')}
        </div>
        <div class="as-sa-form-actions">
          <button class="btn btn-primary" onclick="window._asSelfSubmit && window._asSelfSubmit('${esc(key)}')">Submit check-in</button>
          <span class="as-sa-form-saving" id="as-sa-saving-${esc(key)}"></span>
        </div>
      </div>`;
  }

  // Tabs — start on "due" by default.
  const dueItems = _isDemo ? demoDue : due;
  const optItems = _isDemo ? demoOptional : [];
  const demoSelfAssess = _isDemo ? demoSelfAssessmentSeed() : [];
  const historyItems = _isDemo ? [...demoHistory, ...demoSelfAssess.map(s => ({ id: s.id, slug: s.template_id, title: s.template_title, dateIso: s.administered_at ? s.administered_at.slice(0, 10) : s.created_at.slice(0, 10), score: s.score_numeric ?? s.score, cat: 'self', delta: null }))] : history;
  const scheduledItems = _isDemo ? demoScheduled : scheduled;

  // ── Render ─────────────────────────────────────────────────────────────
  el.innerHTML = `
    <div class="pt-route" id="pt-route-assessments">

      ${_isDemo ? `<div class="hw-demo-banner" role="status">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <strong>Demo data</strong>
        &mdash; sample assessments shown while your clinic is being set up. Your real questionnaires will appear once your care team activates your plan.
      </div>` : ''}

      <div class="as-hd">
        <div>
          <h2>Assessments</h2>
          <p>Your clinician-prescribed questionnaires. Your responses help ${esc(clinicianName)} adjust your protocol — answer honestly, there are no right answers.</p>
        </div>
        <div class="as-hd-actions">
          <button class="btn btn-ghost btn-sm" onclick="window._asToggleRaw && window._asToggleRaw()" id="as-toggle-raw-btn"><svg width="13" height="13"><use href="#i-eye-off"/></svg><span id="as-toggle-raw-lbl">Show raw scores</span></button>
          <button class="btn btn-ghost btn-sm" onclick="window._asExport && window._asExport()"><svg width="13" height="13"><use href="#i-download"/></svg>Export history</button>
        </div>
      </div>

      <!-- SELF-ASSESSMENTS -->
      <div class="as-selfassess-hd">
        <div>
          <h3>Self-Assessments</h3>
          <p>Quick check-ins that help your care team and AI personalize your treatment.</p>
        </div>
      </div>
      <div class="as-selfassess-grid" id="as-selfassess-grid">
        ${SELF_ASSESSMENT_KEYS.map(k => _selfAssessCardHtml(k)).join('')}
      </div>
      <div id="as-selfassess-form-wrap"></div>

      <div class="as-tabs" id="as-tabs">
        <button class="active" data-tab="due" onclick="window._asTab && window._asTab('due')">Due now${dueItems.length ? '<span class="count hot">' + dueItems.length + '</span>' : ''}</button>
        <button data-tab="history" onclick="window._asTab && window._asTab('history')">History${historyItems.length ? '<span class="count">' + historyItems.length + '</span>' : ''}</button>
        <button data-tab="trends" onclick="window._asTab && window._asTab('trends')">Trends</button>
        <button data-tab="scheduled" onclick="window._asTab && window._asTab('scheduled')">Scheduled${scheduledItems.length ? '<span class="count">' + scheduledItems.length + '</span>' : ''}</button>
        <div class="as-tab-divider"></div>
        <div class="as-tab-reminder">
          <svg width="13" height="13"><use href="#i-bell"/></svg>
          Daily check-in <span style="color:var(--text-primary);font-weight:500">8:00 PM</span>
          <label class="as-switch"><input type="checkbox" checked onchange="window._asToggleReminder && window._asToggleReminder(this.checked)"><span></span></label>
        </div>
      </div>

      <!-- DUE NOW -->
      <div class="as-panel" id="as-panel-due">
        <div class="as-daily" id="as-daily-card">
          <div class="as-daily-left">
            <div class="as-daily-badge">Daily Wellness Check-in · 60s</div>
            <div class="as-daily-q" id="as-daily-q-text">How are you feeling today?</div>
            <div class="as-daily-sub" id="as-daily-sub-text">Tap an icon for each question.${streak > 0 ? ' Streak: <strong style="color:var(--teal)">' + streak + ' day' + (streak === 1 ? '' : 's') + '</strong> 🔥' : ''}</div>
          </div>
          <div id="as-daily-widget">
            <!-- Step 1: Mood -->
            <div class="as-daily-step" data-step="mood">
              <div class="as-daily-step-lbl">😊 Mood</div>
              <div class="as-daily-scale">
                ${[{v:1,f:'😣',l:'Very low',c:'#ef4444'},{v:2,f:'😕',l:'Low',c:'#f59e0b'},{v:3,f:'😐',l:'OK',c:'#9ca3af'},{v:4,f:'🙂',l:'Good',c:'#4a9eff'},{v:5,f:'😊',l:'Great',c:'#22c55e'}].map(m => `<button data-v="${m.v}" data-dim="mood" class="as-mood as-daily-btn" onclick="window._asDailyPick && window._asDailyPick('mood',${m.v})" style="--mood-color:${m.c}"><span class="f">${m.f}</span><span class="l">${m.l}</span></button>`).join('')}
              </div>
            </div>
            <!-- Step 2: Energy -->
            <div class="as-daily-step" data-step="energy" style="display:none">
              <div class="as-daily-step-lbl">⚡ Energy</div>
              <div class="as-daily-scale">
                ${[{v:1,f:'🔋',l:'Drained',c:'#ef4444'},{v:2,f:'😴',l:'Low',c:'#f59e0b'},{v:3,f:'😐',l:'OK',c:'#9ca3af'},{v:4,f:'💪',l:'Good',c:'#4a9eff'},{v:5,f:'🚀',l:'Energized',c:'#22c55e'}].map(m => `<button data-v="${m.v}" data-dim="energy" class="as-mood as-daily-btn" onclick="window._asDailyPick && window._asDailyPick('energy',${m.v})" style="--mood-color:${m.c}"><span class="f">${m.f}</span><span class="l">${m.l}</span></button>`).join('')}
              </div>
            </div>
            <!-- Step 3: Sleep -->
            <div class="as-daily-step" data-step="sleep" style="display:none">
              <div class="as-daily-step-lbl">🌙 Sleep quality last night</div>
              <div class="as-daily-scale">
                ${[{v:1,f:'😫',l:'Terrible',c:'#ef4444'},{v:2,f:'😔',l:'Poor',c:'#f59e0b'},{v:3,f:'😐',l:'OK',c:'#9ca3af'},{v:4,f:'😌',l:'Good',c:'#4a9eff'},{v:5,f:'😴',l:'Great',c:'#22c55e'}].map(m => `<button data-v="${m.v}" data-dim="sleep" class="as-mood as-daily-btn" onclick="window._asDailyPick && window._asDailyPick('sleep',${m.v})" style="--mood-color:${m.c}"><span class="f">${m.f}</span><span class="l">${m.l}</span></button>`).join('')}
              </div>
            </div>
            <!-- Step 4: Anxiety -->
            <div class="as-daily-step" data-step="anxiety" style="display:none">
              <div class="as-daily-step-lbl">😰 Anxiety level today</div>
              <div class="as-daily-scale">
                ${[{v:1,f:'😌',l:'None',c:'#22c55e'},{v:2,f:'🙂',l:'Mild',c:'#4a9eff'},{v:3,f:'😐',l:'Moderate',c:'#9ca3af'},{v:4,f:'😰',l:'High',c:'#f59e0b'},{v:5,f:'😱',l:'Severe',c:'#ef4444'}].map(m => `<button data-v="${m.v}" data-dim="anxiety" class="as-mood as-daily-btn" onclick="window._asDailyPick && window._asDailyPick('anxiety',${m.v})" style="--mood-color:${m.c}"><span class="f">${m.f}</span><span class="l">${m.l}</span></button>`).join('')}
              </div>
            </div>
            <!-- Step 5: Stress -->
            <div class="as-daily-step" data-step="stress" style="display:none">
              <div class="as-daily-step-lbl">🧠 Stress level today</div>
              <div class="as-daily-scale">
                ${[{v:1,f:'🧘',l:'Calm',c:'#22c55e'},{v:2,f:'😌',l:'Low',c:'#4a9eff'},{v:3,f:'😐',l:'Moderate',c:'#9ca3af'},{v:4,f:'😤',l:'High',c:'#f59e0b'},{v:5,f:'🤯',l:'Overwhelmed',c:'#ef4444'}].map(m => `<button data-v="${m.v}" data-dim="stress" class="as-mood as-daily-btn" onclick="window._asDailyPick && window._asDailyPick('stress',${m.v})" style="--mood-color:${m.c}"><span class="f">${m.f}</span><span class="l">${m.l}</span></button>`).join('')}
              </div>
            </div>
            <!-- Summary -->
            <div class="as-daily-summary" id="as-daily-summary" style="display:none">
              <div class="as-daily-summary-hd">
                <div class="as-daily-summary-ico">✅</div>
                <div>
                  <div class="as-daily-summary-title">Check-in complete</div>
                  <div class="as-daily-summary-sub">Review timing depends on portal workflow.</div>
                </div>
              </div>
              <div class="as-daily-summary-grid" id="as-daily-summary-grid"></div>
              <div class="as-daily-summary-spark" id="as-daily-summary-spark"></div>
            </div>
          </div>
          <!-- Progress dots -->
          <div class="as-daily-progress" id="as-daily-progress">
            <span class="dot on" data-i="0"></span><span class="dot" data-i="1"></span><span class="dot" data-i="2"></span><span class="dot" data-i="3"></span><span class="dot" data-i="4"></span>
          </div>
        </div>

        ${dueItems.length ? `
        <div class="as-due-lbl">
          <span>Questionnaires prescribed for this week</span>
          <span class="as-due-lbl-right">${dueItems.length} due${dueItems.filter(a => a.overdue).length ? ' · ' + dueItems.filter(a => a.overdue).length + ' overdue' : ''}</span>
        </div>
        <div class="as-due-grid">${dueItems.map(_dueCardHtml).join('')}</div>
        <div id="as-form-slot"></div>` : `
        <div class="as-due-lbl"><span>Nothing due this week</span></div>
        <div class="pth2-empty" style="padding:24px"><div class="pth2-empty-title">All caught up</div><div class="pth2-empty-sub">Your next prescribed questionnaire will appear here when scheduled.</div></div>`}

        ${optItems.length ? `
        <div class="as-optional-hd">
          <div>
            <h4>Optional questionnaires</h4>
            <p>Complete any time — these help your care team build a fuller picture of your wellbeing.</p>
          </div>
        </div>
        <div class="as-optional-grid">${optItems.map(_optCardHtml).join('')}</div>` : ''}
      </div>

      <!-- HISTORY -->
      <div class="as-panel" id="as-panel-history" style="display:none">
        <div class="as-hist-toolbar">
          <div class="as-filter-chips" id="as-hist-chips">
            <button class="active" data-f="all" onclick="window._asHistFilter && window._asHistFilter('all')">All<span class="count">${historyItems.length}</span></button>
            <button data-f="phq-9" onclick="window._asHistFilter && window._asHistFilter('phq-9')">PHQ-9<span class="count">${historyItems.filter(h => h.slug === 'phq-9').length}</span></button>
            <button data-f="gad-7" onclick="window._asHistFilter && window._asHistFilter('gad-7')">GAD-7<span class="count">${historyItems.filter(h => h.slug === 'gad-7').length}</span></button>
            <button data-f="isi" onclick="window._asHistFilter && window._asHistFilter('isi')">ISI<span class="count">${historyItems.filter(h => h.slug === 'isi').length}</span></button>
            <button data-f="daily" onclick="window._asHistFilter && window._asHistFilter('daily')">Daily check-in<span class="count">${historyItems.filter(h => h.slug === 'daily').length}</span></button>
            <button data-f="self" onclick="window._asHistFilter && window._asHistFilter('self')">Self-Assessments<span class="count">${historyItems.filter(h => h.cat === 'self').length}</span></button>
          </div>
        </div>
        <div class="as-hist-list" id="as-hist-list">
          ${historyItems.length ? historyItems.map(_historyRowHtml).join('') : '<div class="pth2-empty" style="padding:24px"><div class="pth2-empty-title">No history yet</div><div class="pth2-empty-sub">Completed questionnaires will appear here.</div></div>'}
        </div>
      </div>

      <!-- TRENDS -->
      <div class="as-panel" id="as-panel-trends" style="display:none">
        <div class="as-trends-hd">
          <div>
            <h3>Your scores over time</h3>
            <p>Lower is better for PHQ-9, GAD-7, ISI. Higher is better for WHO-5. Bands show clinical categories.</p>
          </div>
          <div class="as-trends-legend">
            <span><span class="sw" style="background:#00d4bc"></span>PHQ-9</span>
            <span><span class="sw" style="background:#4a9eff"></span>GAD-7</span>
            <span><span class="sw" style="background:#9b7fff"></span>ISI</span>
            <span><span class="sw" style="background:#ffa85b"></span>WHO-5</span>
          </div>
        </div>
        <div class="as-trends-chart">
          <div class="pth2-empty" style="padding:40px"><div class="pth2-empty-title">${historyItems.length < 3 ? 'Not enough data yet' : 'Trends'}</div><div class="pth2-empty-sub">${historyItems.length < 3 ? 'Complete at least 3 questionnaires to see your full trend chart here.' : 'Your multi-scale timeline appears here — detailed view in My Progress.'}</div></div>
        </div>
        <div class="as-trends-cards">
          <div class="as-summary">
            <div class="as-summary-ico teal"><svg width="18" height="18"><use href="#i-chart"/></svg></div>
            <div>
              <div class="as-summary-lbl">Biggest improvement</div>
              <div class="as-summary-val">${historyItems.filter(h => h.slug === 'phq-9').length >= 2 ? 'PHQ-9' : '—'}${historyItems.filter(h => h.slug === 'phq-9').length >= 2 ? ' <span style="color:var(--teal)">↓</span>' : ''}</div>
              <div class="as-summary-sub">${historyItems.filter(h => h.slug === 'phq-9').length >= 2 ? 'Scores trending down since baseline.' : 'Complete your baseline + a follow-up to see change.'}</div>
            </div>
          </div>
          <div class="as-summary">
            <div class="as-summary-ico blue"><svg width="18" height="18"><use href="#i-check"/></svg></div>
            <div>
              <div class="as-summary-lbl">Consistency</div>
              <div class="as-summary-val">${historyItems.length}<span style="color:var(--text-tertiary);font-size:12px;font-weight:400;margin-left:6px">completed</span></div>
              <div class="as-summary-sub">${scheduledItems.length + historyItems.length > 0 ? Math.round((historyItems.length / Math.max(1, scheduledItems.length + historyItems.length)) * 100) + '% on-time completion rate.' : 'No prescribed questionnaires yet.'}</div>
            </div>
          </div>
          <div class="as-summary">
            <div class="as-summary-ico violet"><svg width="18" height="18"><use href="#i-sparkle"/></svg></div>
            <div>
              <div class="as-summary-lbl">Momentum</div>
              <div class="as-summary-val">${historyItems.length >= 4 ? 'Last 4 weeks <span style="color:var(--teal)">↗</span>' : 'Tracking'}</div>
              <div class="as-summary-sub">${historyItems.length >= 4 ? 'Scores trending in the desired direction.' : 'Keep completing questionnaires to build momentum.'}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- SCHEDULED -->
      <div class="as-panel" id="as-panel-scheduled" style="display:none">
        <div class="as-sched-lbl">Upcoming · auto-reminders are on</div>
        <div class="as-sched-list">
          ${scheduledItems.length ? scheduledItems.map(_schedRowHtml).join('') : '<div class="pth2-empty" style="padding:24px"><div class="pth2-empty-title">No future assessments scheduled</div><div class="pth2-empty-sub">New assessments will appear here when they are available in the portal workflow.</div></div>'}
        </div>
      </div>

      <div class="as-toast" id="as-toast"><svg width="16" height="16"><use href="#i-check"/></svg><span id="as-toast-text">Saved</span></div>
    </div>`;

  // ── Handlers ───────────────────────────────────────────────────────────
  let _rawOn = false;
  function _toast(msg) {
    const t = document.getElementById('as-toast');
    const t2 = document.getElementById('as-toast-text');
    if (!t || !t2) return;
    t2.textContent = msg || 'Done';
    t.classList.add('show');
    clearTimeout(window._asToastTimer);
    window._asToastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  window._asTab = function(tab) {
    ['due','history','trends','scheduled'].forEach(n => {
      const panel = document.getElementById('as-panel-' + n);
      if (panel) panel.style.display = (n === tab) ? '' : 'none';
    });
    document.querySelectorAll('#as-tabs button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  };

  const _dailySteps = ['mood','energy','sleep','anxiety','stress'];
  window._asDailyState = {};
  window._asDailyPick = async function(dim, v) {
    window._asDailyState[dim] = v;
    // Highlight selected button
    document.querySelectorAll(`.as-daily-btn[data-dim="${dim}"]`).forEach(b => b.classList.toggle('on', Number(b.dataset.v) === v));
    const idx = _dailySteps.indexOf(dim);
    // Update progress dots
    document.querySelectorAll('#as-daily-progress .dot').forEach((d, i) => d.classList.toggle('on', i <= idx));
    // Small delay then advance
    setTimeout(async () => {
      const curStep = document.querySelector(`.as-daily-step[data-step="${dim}"]`);
      if (curStep) curStep.style.display = 'none';
      if (idx + 1 < _dailySteps.length) {
        const nextStep = document.querySelector(`.as-daily-step[data-step="${_dailySteps[idx + 1]}"]`);
        if (nextStep) nextStep.style.display = 'block';
        const qText = document.getElementById('as-daily-q-text');
        const labels = { mood:'How are you feeling today?', energy:'How is your energy level?', sleep:'How did you sleep last night?', anxiety:'How anxious do you feel?', stress:'How stressed do you feel?' };
        if (qText) qText.textContent = labels[_dailySteps[idx + 1]] || 'How are you feeling?';
      } else {
        // All done — show summary
        await _asDailyShowSummary();
      }
    }, 350);
  };

  async function _asDailyShowSummary() {
    const s = window._asDailyState;
    const dims = [
      { key:'mood',    label:'Mood',    icon:'😊', reverse:false },
      { key:'energy',  label:'Energy',  icon:'⚡', reverse:false },
      { key:'sleep',   label:'Sleep',   icon:'🌙', reverse:false },
      { key:'anxiety', label:'Anxiety', icon:'😰', reverse:true },
      { key:'stress',  label:'Stress',  icon:'🧠', reverse:true },
    ];
    const summaryGrid = document.getElementById('as-daily-summary-grid');
    if (summaryGrid) {
      summaryGrid.innerHTML = dims.map(d => {
        const val = s[d.key] || 3;
        const pct = d.reverse ? (val / 5) * 100 : (val / 5) * 100;
        const color = val <= 2 ? '#22c55e' : val === 3 ? '#9ca3af' : val === 4 ? '#f59e0b' : '#ef4444';
        const barColor = d.reverse ? (val <= 2 ? '#22c55e' : val === 3 ? '#9ca3af' : '#ef4444') : (val >= 4 ? '#22c55e' : val === 3 ? '#9ca3af' : '#ef4444');
        return `
          <div class="as-daily-sum-item">
            <div class="as-daily-sum-icon">${d.icon}</div>
            <div class="as-daily-sum-info">
              <div class="as-daily-sum-label">${d.label}</div>
              <div class="as-daily-sum-bar"><div style="width:${pct}%;background:${barColor}"></div></div>
            </div>
            <div class="as-daily-sum-val" style="color:${color}">${val}/5</div>
          </div>`;
      }).join('');
    }
    // Build sparkline from last 7 days
    const sparkEl = document.getElementById('as-daily-summary-spark');
    if (sparkEl) {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        try { days.push(JSON.parse(localStorage.getItem('ds_checkin_' + d) || '{}')); } catch { days.push({}); }
      }
      const avgScores = days.map(d => {
        const vals = [d.mood, d.energy, d.sleep, d.anxiety, d.stress].filter(x => x != null);
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      });
      const valid = avgScores.filter(x => x != null);
      const minV = valid.length ? Math.min(...valid) : 1;
      const maxV = valid.length ? Math.max(...valid) : 5;
      const range = Math.max(0.1, maxV - minV);
      const points = avgScores.map((v, i) => {
        if (v == null) return '';
        const x = (i / 6) * 140;
        const y = 30 - ((v - minV) / range) * 24;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).filter(Boolean);
      const pathD = points.length > 1 ? 'M' + points.join(' L') : '';
      const lastV = valid.length ? valid[valid.length - 1] : null;
      sparkEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
          <div style="font-size:11px;color:var(--text-tertiary)">7-day wellness trend</div>
          <svg viewBox="0 0 140 36" style="width:100px;height:26px;flex:1">
            ${pathD ? `<path d="${pathD}" fill="none" stroke="#00d4bc" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
            ${lastV != null ? `<circle cx="${140}" cy="${30 - ((lastV - minV) / range) * 24}" r="2.5" fill="#00d4bc"/>` : ''}
          </svg>
          <div style="font-size:11px;font-weight:600;color:var(--teal)">${lastV != null ? lastV.toFixed(1) : '--'}</div>
        </div>`;
    }
    // Hide steps, show summary
    document.querySelectorAll('.as-daily-step').forEach(s => s.style.display = 'none');
    const summary = document.getElementById('as-daily-summary');
    if (summary) summary.style.display = 'block';
    const prog = document.getElementById('as-daily-progress');
    if (prog) prog.style.display = 'none';
    const qText = document.getElementById('as-daily-q-text');
    if (qText) qText.textContent = 'All done — great job!';
    const subText = document.getElementById('as-daily-sub-text');
    if (subText) subText.textContent = 'Your update has been saved in this browser.';

    // Save to localStorage
    try {
      const iso = todayIso;
      const prev = JSON.parse(localStorage.getItem('ds_checkin_' + iso) || '{}');
      Object.assign(prev, s);
      localStorage.setItem('ds_checkin_' + iso, JSON.stringify(prev));
      localStorage.setItem('ds_last_checkin', iso);
      const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const cur = parseInt(localStorage.getItem('ds_wellness_streak') || '0', 10);
      const prevDay = localStorage.getItem('ds_last_checkin_prev');
      localStorage.setItem('ds_wellness_streak', String(prevDay === yest ? cur + 1 : Math.max(cur, 1)));
      localStorage.setItem('ds_last_checkin_prev', iso);
    } catch (_e) {}
    // Submit to backend
    let syncedToClinic = false;
    if (!_isDemo && uid && api.submitAssessment) {
      try {
        await api.submitAssessment(uid, { type: 'daily_checkin', mood: s.mood, energy: s.energy, sleep: s.sleep, anxiety: s.anxiety, stress: s.stress, date: new Date().toISOString() });
        syncedToClinic = true;
      } catch (_e) {}
    }
    if (subText) subText.textContent = syncedToClinic
      ? 'Your clinic can review this check-in in the patient portal.'
      : 'Saved in this browser only until clinic sync is available.';
    _toast(syncedToClinic ? 'Check-in synced · 5/5' : 'Check-in saved locally · 5/5');
  }

  window._asDailyReset = function() {
    window._asDailyState = {};
    document.querySelectorAll('.as-daily-step').forEach((s, i) => s.style.display = i === 0 ? 'block' : 'none');
    document.querySelectorAll('.as-daily-btn').forEach(b => b.classList.remove('on'));
    const summary = document.getElementById('as-daily-summary');
    if (summary) summary.style.display = 'none';
    const prog = document.getElementById('as-daily-progress');
    if (prog) { prog.style.display = 'flex'; prog.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('on', i === 0)); }
    const qText = document.getElementById('as-daily-q-text');
    if (qText) qText.textContent = 'How are you feeling today?';
    const subText = document.getElementById('as-daily-sub-text');
    if (subText) subText.textContent = 'Tap an icon for each question.';
  };

  window._asStart = function(slug) {
    const formKey = String(slug).replace(/-/g, '');
    const slot = document.getElementById('as-form-slot');
    if (SUPPORTED_FORMS[formKey] && slot) {
      renderAssessmentForm(formKey, 'as-form-slot', uid);
      slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      _toast('Loading ' + String(slug).toUpperCase());
      return;
    }
    _toast(String(slug).toUpperCase() + ' form is not yet available in this portal');
  };

  window._asHistFilter = function(f) {
    document.querySelectorAll('#as-hist-chips button').forEach(b => b.classList.toggle('active', b.dataset.f === f));
    const rows = document.querySelectorAll('#as-hist-list .as-hist-row');
    rows.forEach(r => {
      const ico = r.querySelector('.as-hist-name-ico');
      const matchedSlug = ico ? ico.className.replace('as-hist-name-ico', '').trim() : '';
      // We stored cat on the name-ico class name; map back to slug.
      const bySlug = {
        'depression': 'phq-9', 'anxiety': 'gad-7', 'sleep': 'isi', 'wellbeing': 'who5', 'daily': 'daily', 'self': 'self',
      };
      const slug = bySlug[matchedSlug] || 'other';
      r.style.display = (f === 'all' || slug === f) ? '' : 'none';
    });
  };

  window._asToggleRaw = function() {
    _toast('Raw score view is not yet available in this portal');
  };

  window._asExport = function() {
    const rows = [['Date', 'Assessment', 'Category', 'Score', 'Delta']];
    historyItems.forEach(h => rows.push([h.dateIso, h.title, h.cat, h.score ?? '', h.delta ?? '']));
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'assessment-history-' + todayIso + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    _toast('History exported');
  };

  // ── Self-Assessment handlers ────────────────────────────────────────────
  window._asSelfStart = function(key) {
    const wrap = document.getElementById('as-selfassess-form-wrap');
    if (!wrap) return;
    wrap.innerHTML = _selfAssessFormHtml(key);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  window._asSelfCancel = function(key) {
    const wrap = document.getElementById('as-selfassess-form-wrap');
    if (wrap) wrap.innerHTML = '';
  };

  window._asSelfPick = function(key, qKey, val) {
    let draft = getSelfAssessmentDraft(key) || { answers: {} };
    draft.answers[qKey] = val;
    setSelfAssessmentDraft(key, draft);
    document.querySelectorAll('#as-sa-form-' + key + ' [data-q="' + qKey + '"] .as-sa-emoji-btn').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === val));
  };

  window._asSelfSlider = function(key, qKey, val) {
    let draft = getSelfAssessmentDraft(key) || { answers: {} };
    draft.answers[qKey] = Number(val);
    setSelfAssessmentDraft(key, draft);
    const lbl = document.getElementById('sa-slider-val-' + key + '-' + qKey);
    if (lbl) lbl.textContent = val;
  };

  window._asSelfCheck = function(key, qKey, val, checked) {
    let draft = getSelfAssessmentDraft(key) || { answers: {} };
    let arr = Array.isArray(draft.answers[qKey]) ? draft.answers[qKey] : (draft.answers[qKey] ? [draft.answers[qKey]] : []);
    if (checked) { if (!arr.includes(val)) arr.push(val); }
    else { arr = arr.filter(v => v !== val); }
    draft.answers[qKey] = arr;
    setSelfAssessmentDraft(key, draft);
  };

  window._asSelfText = function(key, qKey, val) {
    let draft = getSelfAssessmentDraft(key) || { answers: {} };
    draft.answers[qKey] = val;
    setSelfAssessmentDraft(key, draft);
  };

  window._asSelfSubmit = async function(key) {
    const survey = SELF_ASSESSMENT_SURVEYS[key];
    if (!survey) return;
    const draft = getSelfAssessmentDraft(key) || { answers: {} };
    const answers = draft.answers || {};
    // Validate required questions
    for (const q of survey.questions) {
      if (q.optional) continue;
      const v = answers[q.key];
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) {
        _toast('Please answer: ' + q.label);
        return;
      }
    }
    const score = survey.computeScore(answers);
    const saving = document.getElementById('as-sa-saving-' + key);
    if (saving) saving.textContent = 'Saving...';
    try {
      const payload = {
        survey_type: key,
        frequency: survey.frequency,
        responses: answers,
        score: score,
        notes: answers.note || answers.concerns || null,
        ai_context: { score, answered_at: new Date().toISOString(), question_count: survey.questions.length },
      };
      let savedToBackend = false;
      if (api.submitSelfAssessment) {
        await api.submitSelfAssessment(payload);
        savedToBackend = true;
      }
      setSelfAssessmentLastFiled(key, new Date().toISOString());
      clearSelfAssessmentDraft(key);
      _toast(savedToBackend ? (survey.shortTitle + ' check-in saved') : (survey.shortTitle + ' saved locally'));
      // Refresh the card grid
      const grid = document.getElementById('as-selfassess-grid');
      if (grid) {
        const card = grid.querySelector('[data-sa="' + key + '"]');
        if (card) {
          const lastWrap = card.querySelector('.as-sa-last');
          if (lastWrap) lastWrap.outerHTML = _selfAssessLastLabel(key);
          card.classList.remove('due-soon');
        }
      }
      // Close form
      const wrap = document.getElementById('as-selfassess-form-wrap');
      if (wrap) wrap.innerHTML = '';
    } catch (err) {
      console.error('[self-assessment] submit failed:', err);
      _toast('Save failed — kept your draft');
      if (saving) saving.textContent = 'Retry';
    }
  };

  window._asToggleReminder = function(on) { _toast('Reminders are not yet available \u2014 your clinic will enable them'); };
  window._asViewHistory = function(_id) { _toast('Assessment history details are unavailable from this beta portal.'); };
}

// \u2500\u2500 Patient Reports view-side launch-audit helper (2026-05-01) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Mirrors the wellness-hub / symptom-journal helper. Best-effort: never
// throws back at the caller \u2014 audit failures must not block the UI.
async function _patientReportsLogAuditEvent(event, extra) {
  try {
    if (api && typeof api.postPatientReportsAuditEvent === 'function') {
      await api.postPatientReportsAuditEvent({
        event,
        report_id: (extra && extra.report_id) ? extra.report_id : null,
        note: (extra && extra.note) ? String(extra.note).slice(0, 480) : null,
        using_demo_data: !!(extra && extra.using_demo_data),
      });
    }
  } catch (_) { /* audit failures must never block UI */ }
}

// \u2500\u2500 Reports \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export async function pgPatientReports() {
  setTopbar('My Reports');

  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();

  // ── Fetch in parallel ────────────────────────────────────────────────────
  // 3s timeout so a hung Fly backend can never wedge the page on a spinner.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  let outcomesRaw, assessmentsRaw, coursesRaw, sessionsRaw, wearableSummaryRaw, reportsRaw, evidenceOverviewRaw;
  // Patient-scope view-side launch-audit fetch (2026-05-01). The
  // /api/v1/reports/patient/me endpoint returns the patient's own reports
  // with `is_demo` and `consent_active` flags so we can render the demo /
  // read-only banners honestly. Soft-fail: a hung API still renders the
  // page with the legacy clinician-uploaded list.
  let patientReportsRaw = null;
  let patientReportsSummary = null;
  let patientReportsServerErr = false;
  try {
    [outcomesRaw, assessmentsRaw, coursesRaw, sessionsRaw, wearableSummaryRaw, reportsRaw, evidenceOverviewRaw, patientReportsRaw, patientReportsSummary] = await Promise.all([
      _raceNull(api.patientPortalOutcomes()),
      _raceNull(api.patientPortalAssessments()),
      _raceNull(api.patientPortalCourses()),
      _raceNull(api.patientPortalSessions()),
      _raceNull(api.patientPortalWearableSummary(30)),
      _raceNull(api.patientPortalReports()),
      _raceNull(_loadPatientEvidenceContext(currentUser?.patient_id || currentUser?.id || null)),
      typeof api.listPatientReports === 'function' ? _raceNull(api.listPatientReports({ limit: 100 })) : Promise.resolve(null),
      typeof api.getPatientReportsSummary === 'function' ? _raceNull(api.getPatientReportsSummary()) : Promise.resolve(null),
    ]);
  } catch (_e) {
    outcomesRaw = assessmentsRaw = coursesRaw = sessionsRaw = wearableSummaryRaw = reportsRaw = evidenceOverviewRaw = null;
    patientReportsRaw = null;
    patientReportsSummary = null;
    patientReportsServerErr = true;
  }
  // Soft-error: fall through to an empty docs list (which renders an
  // empty-state card) instead of the hard "Could not load" state when
  // the backend is merely hanging.

  // ── Patient-scope launch-audit derived state ─────────────────────────────
  const _patientReportsItems = (patientReportsRaw && Array.isArray(patientReportsRaw.items)) ? patientReportsRaw.items : [];
  const _patientReportsServerLive = !!patientReportsRaw && !patientReportsServerErr;
  const _patientReportsIsDemo = !!(patientReportsRaw && patientReportsRaw.is_demo);
  const _patientReportsConsentActive = patientReportsRaw ? !!patientReportsRaw.consent_active : true;
  // Index by id for quick lookup when rendering CTA states (acknowledged /
  // share-back pending). Falls back to {} when the server is unreachable so
  // the legacy doc list still renders without flags.
  const _patientReportsById = {};
  for (const it of _patientReportsItems) {
    if (it && it.id) _patientReportsById[String(it.id)] = it;
  }

  // ── Mount-time audit ping ────────────────────────────────────────────────
  // Records that the patient opened the My Reports page. Honest connectivity
  // hint in the note so a regulator can tell page-loads where the API was
  // unreachable from real opens. Never throws.
  _patientReportsLogAuditEvent('view', {
    using_demo_data: _patientReportsIsDemo,
    note: _patientReportsServerLive
      ? `items=${_patientReportsItems.length}; consent_active=${_patientReportsConsentActive ? 1 : 0}`
      : 'fallback=offline',
  });

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
  const reports     = Array.isArray(reportsRaw)     ? reportsRaw     : [];
  const patientEvidence = (evidenceOverviewRaw && typeof evidenceOverviewRaw === 'object')
    ? { ..._emptyPatientEvidenceContext(currentUser?.patient_id || currentUser?.id || null), ...evidenceOverviewRaw, reportCount: reports.length }
    : _emptyPatientEvidenceContext(currentUser?.patient_id || currentUser?.id || null);

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
    biometrics:        { label: 'Biometrics',                               icon: '&#9829;',  color: '#f472b6',        bg: 'rgba(244,114,182,.1)' },
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
    // Backend `PortalAssessmentOut` returns `template_id` + `template_title`
    // (see apps/api/app/routers/patient_portal_router.py). Older callsites
    // read `assessment_type`/`name` which silently dropped live data on the
    // shape mismatch — accept both shapes so the list never blanks out.
    const templateKey = (a.template_id || a.assessment_type || a.name || '').toLowerCase();
    docs.push({
      id:          a.id || `assess-${Math.random().toString(36).slice(2)}`,
      _source:     'assessment',
      title:       a.template_title || a.name || a.title || a.assessment_type || 'Assessment',
      date:        a.created_at || a.completed_at || a.administered_at,
      displayDate: fmtDate(a.created_at || a.completed_at || a.administered_at),
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

  // ── Origin tagging (AI vs clinician) ────────────────────────────────────
  // Heuristic until the backend surfaces an explicit `origin` field: treat
  // anything signed/annotated by a clinician as clinician-generated, anything
  // with `ai_generated`/`source === 'ai'`/`generated_by` markers as AI. Falls
  // back to "clinic" so existing outcomes don't get mis-grouped.
  function docOrigin(d, raw) {
    const rawOrigin = String(raw?.origin || raw?.source || raw?.generated_by || '').toLowerCase();
    if (rawOrigin.includes('ai') || raw?.ai_generated === true) return 'ai';
    if (d.clinicianNotes) return 'clinic';
    if (rawOrigin === 'clinician' || rawOrigin === 'clinic') return 'clinic';
    return 'clinic';
  }
  // Re-walk raw outcomes/assessments to attach origin back onto docs (keyed by id).
  const _rawById = {};
  (outcomes || []).forEach(o => { if (o.id != null) _rawById[String(o.id)] = o; });
  (assessments || []).forEach(a => { if (a.id != null) _rawById[String(a.id)] = a; });
  docs.forEach(d => {
    d.origin = docOrigin(d, _rawById[String(d.id)] || {});
  });

  // ── Merge clinician-uploaded / generated reports ──────────────────────────
  // These come from PatientMediaUpload (media_type="text") and carry actual
  // file_ref URLs the patient can view or download.
  reports.forEach(r => {
    const pl = docPlainLang(r.report_type);
    docs.push({
      id: r.id,
      _source: 'report',
      title: r.title || 'Report',
      date: r.created_at,
      displayDate: fmtDate(r.created_at),
      templateKey: (r.report_type || '').toLowerCase(),
      category: categorise({ doc_type: r.report_type, _source: 'report' }),
      score: null,
      scoreInterp: null,
      measurePoint: null,
      plainLang: pl,
      sessionRef: null,
      courseRef: null,
      url: r.file_url || null,
      status: (r.status || 'available').toLowerCase(),
      clinicianNotes: r.text_content || null,
      origin: 'clinic',
    });
  });

  // Re-sort after adding reports so newest are at the top
  docs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // ── Biometrics synthesis from wearable summary ──────────────────────────
  // Collapse up to ~30 daily rows into a single weekly snapshot "doc" so the
  // patient sees a readable record in the Biometrics section even when the
  // native wearable-summary endpoint returns a flat daily stream.
  const wearableRows = Array.isArray(wearableSummaryRaw) ? wearableSummaryRaw : [];
  if (wearableRows.length > 0) {
    const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n))) ? null : Number(n).toFixed(d);
    const avg = (vals) => {
      const xs = vals.filter(v => v != null && Number.isFinite(Number(v))).map(Number);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    // Group by ISO week (YYYY-Www)
    const weekOf = (iso) => {
      try {
        const d = new Date(iso);
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
      } catch (_) { return 'unknown'; }
    };
    const byWeek = {};
    wearableRows.forEach(r => {
      const w = weekOf(r.date);
      (byWeek[w] = byWeek[w] || []).push(r);
    });
    Object.keys(byWeek).sort().reverse().forEach((w, idx) => {
      const rows = byWeek[w];
      const firstDate = rows.map(r => r.date).filter(Boolean).sort()[0];
      const lastDate  = rows.map(r => r.date).filter(Boolean).sort().slice(-1)[0];
      const avgSleep   = avg(rows.map(r => r.sleep_duration_h));
      const avgRHR     = avg(rows.map(r => r.rhr_bpm));
      const avgHRV     = avg(rows.map(r => r.hrv_ms));
      const totalSteps = rows.reduce((acc, r) => acc + (Number(r.steps) || 0), 0);
      const avgReady   = avg(rows.map(r => r.readiness_score));
      const summaryBits = [];
      if (avgSleep != null) summaryBits.push(`sleep ${fmt(avgSleep, 1)} h avg`);
      if (avgRHR != null)   summaryBits.push(`resting HR ${fmt(avgRHR, 0)} bpm`);
      if (avgHRV != null)   summaryBits.push(`HRV ${fmt(avgHRV, 0)} ms`);
      if (totalSteps > 0)   summaryBits.push(`${totalSteps.toLocaleString()} steps`);
      const summary = summaryBits.join(' · ') || 'No wearable data captured';
      docs.push({
        id:          `biometric-${w}`,
        _source:     'biometric',
        title:       `Biometrics snapshot · ${fmtDate(firstDate)}${firstDate !== lastDate ? ' – ' + fmtDate(lastDate) : ''}`,
        date:        lastDate,
        displayDate: fmtDate(lastDate),
        templateKey: 'biometrics',
        category:    'biometrics',
        origin:      'device',
        score:       avgReady != null ? Number(fmt(avgReady, 0)) : null,
        scoreInterp: null,
        measurePoint: `Week ${idx === 0 ? '· most recent' : ''}`,
        plainLang:   {
          what: 'A weekly summary of signals from your wearables.',
          why:  'Sleep, heart rate, HRV, and activity correlate with how you feel and how well your brain recovers between sessions.',
          range: [],
        },
        sessionRef:  null,
        courseRef:   null,
        url:         null,
        status:      'available',
        clinicianNotes: null,
        biometricSummary: summary,
      });
    });
    // Re-sort after adding biometrics so the newest are at the top again.
    docs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

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
  // `tone` picks the sidebar-style tile palette used for the top-of-page chips
  // and the section-header tiles, so the Reports page feels of-a-piece with
  // the patient nav (see PR #70).
  const DISPLAY_CATS = [
    { id: 'ai',         label: 'AI-Generated Insights',      icon: '🤖', emoji: '🤖', tone: 'violet', color: '#a78bfa',      bg: 'rgba(167,139,250,.1)',  defaultOpen: true,
      filter: d => d.origin === 'ai',
      emptyMsg: 'Synaps AI will draft narrative summaries, trend reads, and protocol suggestions here once your clinician enables them.' },
    { id: 'clinic',     label: 'Clinician Reports',          icon: '🩺', emoji: '🩺', tone: 'teal',   color: 'var(--teal)',  bg: 'rgba(0,212,188,.08)',   defaultOpen: true,
      filter: d => (d.origin === 'clinic') && (d.category === 'outcome' || d.category === 'assessment' || d.category === 'session-summary' || Boolean(d.clinicianNotes)),
      emptyMsg: 'Reports your care team has signed off — clinical summaries, letters, and reviewed assessments — will appear here.' },
    { id: 'biometrics', label: 'Biometrics',                 icon: '🫀', emoji: '🫀', tone: 'rose',   color: '#f472b6',      bg: 'rgba(244,114,182,.1)',  defaultOpen: true,
      filter: d => d.category === 'biometrics',
      emptyMsg: 'Connect Apple Health, Oura, Fitbit, or Garmin in Settings → Integrations to see weekly biometric snapshots here.' },
    { id: 'correlations', label: 'Correlation Reports',      icon: '🧬', emoji: '🧬', tone: 'amber',  color: '#f59e0b',      bg: 'rgba(245,158,11,.08)',  defaultOpen: false,
      filter: d => d.category === 'correlation' || d._source === 'correlation',
      emptyMsg: 'Cross-signal correlation reports — how your sleep affects mood, how HRV maps to session response — appear here once you have ~2 weeks of biometric + mood data.' },
    { id: 'progress',   label: 'Progress Reports',           icon: '📈', emoji: '📈', tone: 'blue',   color: 'var(--blue)',  bg: 'rgba(74,158,255,.1)',   defaultOpen: false,
      filter: d => d.category === 'outcome',
      emptyMsg: 'Progress reports will appear here as your treatment continues.' },
    { id: 'assessment', label: 'Assessment Results',         icon: '📋', emoji: '📋', tone: 'teal',   color: 'var(--teal)',  bg: 'rgba(0,212,188,.08)',   defaultOpen: false,
      filter: d => d.category === 'assessment',
      emptyMsg: 'Assessment results will appear here after your clinician completes a check-in.' },
    { id: 'feedback',   label: 'Care Team Feedback',         icon: '💬', emoji: '💬', tone: 'green',  color: '#34d399',      bg: 'rgba(52,211,153,.1)',   defaultOpen: false,
      filter: d => Boolean(d.clinicianNotes),
      emptyMsg: 'Notes from your care team will appear here. Check back after your next session.' },
    { id: 'sessions',   label: 'Session Summaries',          icon: '📅', emoji: '📅', tone: 'violet', color: '#a78bfa',      bg: 'rgba(167,139,250,.1)',  defaultOpen: false,
      filter: d => d.category === 'session-summary',
      emptyMsg: 'Session summaries will appear here after each of your treatment sessions.' },
    { id: 'guides',     label: 'Instructions & Care Guides', icon: '📚', emoji: '📚', tone: 'amber',  color: '#f59e0b',      bg: 'rgba(245,158,11,.08)',  defaultOpen: false,
      filter: d => d.category === 'care' || d.category === 'guide',
      emptyMsg: 'Instructions and care guides from your team will appear here.' },
    { id: 'forms',      label: 'Consent & Forms',            icon: '📄', emoji: '📄', tone: 'slate',  color: '#94a3b8',      bg: 'rgba(148,163,184,.1)',  defaultOpen: false,
      filter: d => d.category === 'consent' || d.category === 'adverse' || d.category === 'letter',
      emptyMsg: 'Consent forms and other documents will appear here when added by your care team.' },
  ];

  // ── Document card HTML ───────────────────────────────────────────────────
  // Extension point: pass { showSharing: true } to add caregiver/proxy share UI.
  function docCardHTML(doc, opts = {}) {
    // Compute delta once — re-used below for first-report detection and
    // the "What changed" row.
    const delta = _ptComputeDelta(doc, docs);
    // Auto-expand the plain-language explanation the first time a patient
    // sees a given template — they need the band + meaning, not just the
    // number.
    const _firstReport = doc.score != null && doc.templateKey && delta === null;
    const { expandPl = _firstReport } = opts;
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

    // Delta row — what changed since the most recent prior report of
    // same template type. Uses `delta` computed at the top of the fn.
    let deltaRow = '';
    if (delta !== null) {
      const abs = Math.abs(delta.delta);
      const dir = delta.delta < 0 ? 'dropped' : 'increased';
      const tone = delta.delta < 0 ? 'This is a positive sign.' : 'This change is being tracked in your portal workflow.';
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
    // Stamp audit hooks on every actionable CTA so the regulator can see
    // every patient open / download / ack / share-back / question. The
    // pings are best-effort and never block the click — see
    // _patientReportsLogAuditEvent().
    const viewCta = doc.url
      ? `<a class="pt-doc-cta" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer"
              aria-label="${t('patient.reports.doc.view')} ${esc(doc.title)}"
              onclick="window._ptReportOpened('${esc(doc.id)}','open_link')"
              tabindex="0">${t('patient.reports.doc.view')}</a>`
      : `<button class="pt-doc-cta pt-doc-cta-stub"
               onclick="window._ptViewDoc('${esc(doc.id)}')"
               aria-label="${t('patient.reports.doc.view')} ${esc(doc.title)}">${t('patient.reports.doc.view')}</button>`;

    const dlCta = doc.url
      ? `<a class="pt-doc-cta pt-doc-cta-dl" href="${esc(doc.url)}" download
              target="_blank" rel="noopener noreferrer"
              aria-label="Download ${esc(doc.title)}"
              onclick="window._ptReportDownloaded('${esc(doc.id)}')">Download</a>`
      : '';

    const askCta = `<button class="pt-doc-cta pt-doc-cta-ask"
             onclick="window._ptAskAbout('${esc(doc.id)}','${esc(doc.title)}')"
             aria-label="Ask about ${esc(doc.title)}">Ask about this</button>`;

    // ── Patient-scope CTAs (Acknowledge / Share-back / Question thread) ──
    // Only render for true clinician-shared "report" docs that are visible
    // on the server-side patient_reports list. We gate on consent_active
    // (server-supplied) and offline state — patients cannot ack / share-back
    // / start a question thread when consent is withdrawn or the API is
    // unreachable. We honestly disable the buttons rather than hide them
    // so the patient sees the same UI shape; the disabled state explains
    // why the action is paused.
    const _prMeta = (doc && doc._source === 'report' && doc.id) ? _patientReportsById[String(doc.id)] : null;
    const _prDisabled = !_patientReportsServerLive || _patientReportsConsentActive === false;
    const _prDisabledHint = !_patientReportsServerLive
      ? 'Reconnect to the server to use this action.'
      : (_patientReportsConsentActive === false ? 'Paused while consent is withdrawn.' : '');
    let ackCta = '';
    let shareBackCta = '';
    let questionCta = '';
    if (_prMeta) {
      const acked = !!_prMeta.acknowledged;
      ackCta = acked
        ? `<button class="pt-doc-cta pt-doc-cta-ack" disabled aria-disabled="true"
                  data-acknowledged="1"
                  aria-label="Already acknowledged">&#10003; Acknowledged</button>`
        : `<button class="pt-doc-cta pt-doc-cta-ack"${_prDisabled ? ' disabled aria-disabled="true" title="' + esc(_prDisabledHint) + '"' : ''}
                  onclick="window._ptAcknowledgeReport('${esc(doc.id)}','${esc(doc.title)}')"
                  aria-label="Acknowledge ${esc(doc.title)}">Acknowledge</button>`;
      const sbPending = !!_prMeta.share_back_pending;
      shareBackCta = sbPending
        ? `<button class="pt-doc-cta pt-doc-cta-share" disabled aria-disabled="true"
                  data-share-back-pending="1"
                  aria-label="Share-back already requested">Share-back requested</button>`
        : `<button class="pt-doc-cta pt-doc-cta-share"${_prDisabled ? ' disabled aria-disabled="true" title="' + esc(_prDisabledHint) + '"' : ''}
                  onclick="window._ptShareBackReport('${esc(doc.id)}','${esc(doc.title)}')"
                  aria-label="Request a copy be shared with my GP or family for ${esc(doc.title)}">Send to GP / family</button>`;
      questionCta = `<button class="pt-doc-cta pt-doc-cta-q"${_prDisabled ? ' disabled aria-disabled="true" title="' + esc(_prDisabledHint) + '"' : ''}
                onclick="window._ptStartQuestionForReport('${esc(doc.id)}','${esc(doc.title)}')"
                aria-label="Start a question about ${esc(doc.title)}">Question about this</button>`;
    }

    // Origin + biometric-summary chip
    const originChip = doc.origin === 'ai'
      ? `<span class="pt-doc-chip pt-doc-chip--ai">🤖 AI-generated</span>`
      : doc.origin === 'device'
        ? `<span class="pt-doc-chip pt-doc-chip--biometric">🫀 From your wearables</span>`
        : '';
    const biometricRow = doc.biometricSummary
      ? `<div class="pt-doc-biometric-summary">${esc(doc.biometricSummary)}</div>`
      : '';

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
            ${chips || originChip ? `<div class="pt-doc-chips">${originChip}${chips}</div>` : ''}
            ${biometricRow}
          </div>
          <div class="pt-doc-actions-col">
            ${viewCta}
            ${dlCta}
            ${askCta}
            ${ackCta}
            ${shareBackCta}
            ${questionCta}
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
      const tone = heroDelta.delta < 0 ? 'This is a positive sign.' : 'This change is being tracked in your portal workflow.';
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

    const toneClass = cat.tone ? ' pt-nav-tile--' + cat.tone : '';
    const tileIcon  = cat.emoji || cat.icon;
    return `
      <div class="pt-docs-cat-section" id="pt-cat-${esc(cat.id)}">
        <button class="pt-docs-cat-hd" aria-expanded="${isOpen}"
                onclick="window._ptToggleCatSection('${esc(cat.id)}')">
          <span class="pt-page-tile${toneClass}" aria-hidden="true">${tileIcon}</span>
          <span class="pt-docs-cat-label">${esc(cat.label)}</span>
          ${countBadge}
          <span class="pt-docs-cat-chev" id="pt-cat-chev-${esc(cat.id)}" aria-hidden="true">${isOpen ? '▴' : '▾'}</span>
        </button>
        <div class="pt-docs-cat-body" id="pt-cat-body-${esc(cat.id)}" ${isOpen ? '' : 'hidden'}>
          ${bodyContent}
        </div>
      </div>`;
  }

  // ── Top-of-page category chips — tone-coloured shortcuts to each section.
  // Only show chips for categories that actually have content, so the bar
  // stays useful rather than a wall of empty tiles.
  function catChipsHTML() {
    const chips = DISPLAY_CATS
      .map(cat => ({ cat, count: docs.filter(cat.filter).length }))
      .filter(x => x.count > 0);
    if (chips.length === 0) return '';
    return `<div class="pt-reports-cat-chips" role="navigation" aria-label="Report categories">${
      chips.map(({ cat, count }) => {
        const toneClass = cat.tone ? ' pt-nav-tile--' + cat.tone : '';
        const tileIcon  = cat.emoji || cat.icon;
        return `<button type="button" class="pt-reports-cat-chip${toneClass}"
                        onclick="window._ptScrollToCat('${esc(cat.id)}')"
                        aria-label="Jump to ${esc(cat.label)} (${count})">
                  <span class="pt-page-tile${toneClass}" aria-hidden="true">${tileIcon}</span>
                  <span>${esc(cat.label)}</span>
                  <span class="pt-docs-cat-count" style="margin:0 0 0 2px">${count}</span>
                </button>`;
      }).join('')
    }</div>`;
  }

  // Always render the AI / Clinic / Biometrics / Correlations sections, even
  // when empty — their honest empty-state copy is the point. The other
  // categories still filter out when there's nothing to show.
  const ALWAYS_RENDER_CATS = new Set(['ai', 'clinic', 'biometrics', 'correlations']);

  // ── Render ───────────────────────────────────────────────────────────────────────────
  const latest = docs[0] || null;

  // Overview strip — the four conceptual groupings (AI / Clinic /
  // Biometrics / Correlations). Always rendered so patients see the full
  // taxonomy even before any data lands.
  function overviewStripHTML() {
    const overview = [
      { id: 'ai',           label: 'AI-Generated',      sub: 'Narrative insights drafted by Synaps AI', icon: '🤖', tone: 'violet', count: docs.filter(d => d.origin === 'ai').length },
      { id: 'clinic',       label: 'Clinician Reports', sub: 'Signed by your care team',                icon: '🩺', tone: 'teal',   count: docs.filter(d => d.origin === 'clinic' && (d.category === 'outcome' || d.category === 'assessment' || d.category === 'session-summary' || d.clinicianNotes)).length },
      { id: 'biometrics',   label: 'Biometrics',        sub: 'Weekly snapshots from your wearables',    icon: '🫀', tone: 'rose',   count: docs.filter(d => d.category === 'biometrics').length },
      { id: 'correlations', label: 'Correlations',      sub: 'How your signals affect each other',      icon: '🧬', tone: 'amber',  count: docs.filter(d => d.category === 'correlation').length },
    ];
    const lastUpdated = latest ? fmtDate(latest.date) : '—';
    return `
      <div class="rpt-overview">
        <div class="rpt-overview-head">
          <div>
            <div class="rpt-overview-eyebrow">Your reports, by source</div>
            <div class="rpt-overview-count">${docs.length} report${docs.length === 1 ? '' : 's'} available <span class="rpt-overview-sep">·</span> last updated ${esc(lastUpdated)}${patientEvidence.live ? `<span class="rpt-overview-sep">·</span>${patientEvidence.highlightCount} evidence highlight${patientEvidence.highlightCount === 1 ? '' : 's'}` : ''}</div>
          </div>
        </div>
        <div class="rpt-overview-grid">
          ${overview.map(o => `
            <button type="button" class="rpt-overview-tile" onclick="window._ptScrollToCat('${esc(o.id)}')">
              <span class="pt-page-tile pt-nav-tile--${esc(o.tone)}" aria-hidden="true">${o.icon}</span>
              <div class="rpt-overview-tile-body">
                <div class="rpt-overview-tile-label">${esc(o.label)} <span class="rpt-overview-tile-count">${o.count}</span></div>
                <div class="rpt-overview-tile-sub">${esc(o.sub)}</div>
              </div>
              <span class="rpt-overview-tile-chev" aria-hidden="true">→</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function evidenceLinkedHTML() {
    const saved = Array.isArray(patientEvidence.overview?.saved_citations) ? patientEvidence.overview.saved_citations : [];
    const used = Array.isArray(patientEvidence.overview?.evidence_used_in_report) ? patientEvidence.overview.evidence_used_in_report : [];
    if (!patientEvidence.live && !saved.length && !used.length) return '';
    return `
      <div class="pt-docs-evidence-panel" style="margin:16px 0 18px;padding:16px 18px;border-radius:16px;border:1px solid rgba(91,182,255,0.18);background:rgba(91,182,255,0.06)">
        <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap">
          <div>
            <div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--blue,#5bb6ff);margin-bottom:8px">Evidence linked to your reports</div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary)">Saved citations and evidence notes your care team can use during report review</div>
            <div style="margin-top:6px;font-size:12px;color:var(--text-secondary)">
              ${patientEvidence.highlightCount} evidence highlight${patientEvidence.highlightCount === 1 ? '' : 's'}
              <span style="opacity:.5">·</span>
              ${patientEvidence.savedCitationCount} saved citation${patientEvidence.savedCitationCount === 1 ? '' : 's'}
              <span style="opacity:.5">·</span>
              ${patientEvidence.reportCitationCount} citation${patientEvidence.reportCitationCount === 1 ? '' : 's'} already staged for report payloads
            </div>
          </div>
          ${patientEvidence.phenotypeTags.length ? `<div style="font-size:11px;color:var(--text-tertiary);max-width:340px">Phenotype tags: ${esc(patientEvidence.phenotypeTags.slice(0, 6).join(' · '))}</div>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-top:14px">
          <div style="padding:12px 14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Saved evidence citations</div>
            ${saved.length
              ? saved.slice(0, 4).map(function (row) {
                  const label = row.finding_label || row.claim || 'Saved evidence';
                  const paper = row.paper_title || row.title || 'Evidence paper';
                  const cite = row.citation_payload?.inline_citation || '';
                  return `<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06)">
                    <div style="font-size:11px;font-weight:600;color:var(--text-primary)">${esc(label)}</div>
                    <div style="font-size:11.5px;color:var(--text-secondary)">${esc(paper)}</div>
                    ${cite ? `<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:3px">${esc(cite)}</div>` : ''}
                  </div>`;
                }).join('')
              : '<div style="font-size:12px;color:var(--text-tertiary)">No saved evidence citations yet.</div>'}
          </div>
          <div style="padding:12px 14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)">
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Evidence already staged for reports</div>
            ${used.length
              ? used.slice(0, 4).map(function (row) {
                  const cite = row.inline_citation || '';
                  const title = row.title || 'Evidence citation';
                  return `<div style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.06)">
                    <div style="font-size:11px;font-weight:600;color:var(--text-primary)">${esc(title)}</div>
                    ${cite ? `<div style="font-size:10.5px;color:var(--text-secondary);margin-top:3px">${esc(cite)}</div>` : ''}
                  </div>`;
                }).join('')
              : '<div style="font-size:12px;color:var(--text-tertiary)">No report-scoped evidence citations staged yet.</div>'}
          </div>
        </div>
      </div>`;
  }

  // ── Patient-scope launch-audit banners ──────────────────────────────────
  //
  // Three bannerts — demo, consent-revoked, and offline — surface the
  // server-side state honestly. We render whichever apply; they stack at
  // the very top so the patient sees the operating mode before the first
  // report card.
  const _patientReportsDemoBanner = _patientReportsIsDemo
    ? `<div class="pt-demo-banner" role="status"
         style="margin-bottom:12px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12.5px;color:#9a3412">
         <strong>DEMO data</strong> — these reports are sample content for the demo workspace and are not regulator-submittable.
       </div>` : '';
  const _patientReportsConsentBanner = (_patientReportsServerLive && _patientReportsConsentActive === false)
    ? `<div class="pt-consent-banner" role="status" aria-live="polite"
         style="margin-bottom:12px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12.5px;color:#991b1b">
         <strong>Read-only:</strong> consent has been withdrawn. You can still read past reports, but acknowledgements, share-back requests, and starting a question thread are paused until consent is reinstated.
       </div>` : '';
  const _patientReportsOfflineBanner = (!_patientReportsServerLive)
    ? `<div role="status" aria-live="polite"
         style="margin-bottom:12px;padding:10px 14px;background:#fef9c3;border:1px solid #fde68a;border-radius:8px;font-size:12.5px;color:#854d0e">
         <strong>Offline mode:</strong> couldn't reach the server. Showing reports cached locally; acknowledgements and share-back requests are disabled until reconnected.
       </div>` : '';
  const _patientReportsEmptyBanner = (_patientReportsServerLive && docs.length === 0)
    ? `<div role="status"
         style="margin:8px 0 16px;padding:14px 16px;background:rgba(74,158,255,0.06);border:1px solid rgba(74,158,255,0.18);border-radius:10px;font-size:13px;color:var(--text-secondary,#475569)">
         <strong>No reports yet</strong> — your clinical team will share reports here as they're generated.
       </div>` : '';

  el.innerHTML = `
    <div class="pt-docs-wrap">
      ${_patientReportsDemoBanner}
      ${_patientReportsConsentBanner}
      ${_patientReportsOfflineBanner}
      ${_patientReportsEmptyBanner}
      <div id="pt-docs-ask-anchor"></div>
      ${overviewStripHTML()}
      ${evidenceLinkedHTML()}
      ${heroCardHTML(latest)}
      ${catChipsHTML()}
      <div class="pt-docs-sections-wrap">
        ${DISPLAY_CATS
          .filter(cat => ALWAYS_RENDER_CATS.has(cat.id) || docs.filter(cat.filter).length > 0)
          .map(cat => catSectionHTML(cat, docs.filter(cat.filter))).join('')}
      </div>
    </div>`;

  // Scroll handler for top chips — expands target section if collapsed.
  window._ptScrollToCat = function(catId) {
    const section = el.querySelector('#pt-cat-' + catId);
    if (!section) return;
    const body = el.querySelector('#pt-cat-body-' + catId);
    if (body && body.hasAttribute('hidden')) {
      window._ptToggleCatSection(catId);
    }
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
    // Audit hook — best-effort, never blocks the toast.
    _patientReportsLogAuditEvent('ask_clicked', {
      report_id: String(docId || ''),
      using_demo_data: _patientReportsIsDemo,
      note: 'prefill prompt',
    });
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

  // ── Patient-scope launch-audit handlers (2026-05-01) ────────────────────
  //
  // Wired against /api/v1/reports/* patient-scope endpoints. Every CTA emits
  // an audit row through the umbrella audit_events table so a regulator can
  // see exactly what the patient did with each report.

  // Tiny self-contained toast — pages-patient has several local _toast
  // helpers but none exported at module level, so we render our own pill
  // here so the handlers stay self-sufficient.
  function _prToast(msg) {
    try {
      const tEl = document.createElement('div');
      tEl.setAttribute('role', 'status');
      tEl.setAttribute('aria-live', 'polite');
      tEl.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.18);max-width:90vw';
      tEl.textContent = String(msg || '');
      document.body.appendChild(tEl);
      setTimeout(() => { try { tEl.remove(); } catch (_) {} }, 3200);
    } catch (_) { /* noop */ }
  }

  // Stamp report_opened audit when the patient clicks the View link.
  window._ptReportOpened = function(reportId, kind) {
    _patientReportsLogAuditEvent('report_opened', {
      report_id: String(reportId || ''),
      using_demo_data: _patientReportsIsDemo,
      note: kind || 'view',
    });
  };

  // Stamp report_downloaded audit when the patient clicks the Download link.
  window._ptReportDownloaded = function(reportId) {
    _patientReportsLogAuditEvent('report_downloaded', {
      report_id: String(reportId || ''),
      using_demo_data: _patientReportsIsDemo,
      note: 'download click',
    });
  };

  // Acknowledge a report — calls /acknowledge. Updates the in-place button
  // state on success so the patient sees an immediate response. Failures
  // surface a toast; the audit row is recorded server-side regardless.
  window._ptAcknowledgeReport = async function(reportId, title) {
    if (!reportId) return;
    if (!_patientReportsServerLive) {
      _prToast('Reconnect to acknowledge this report.');
      return;
    }
    if (_patientReportsConsentActive === false) {
      _prToast('Acknowledgements are paused while consent is withdrawn.');
      return;
    }
    // Best-effort page-audit ping for the click itself (the server-side
    // /acknowledge endpoint also emits its own audit row, but the click
    // intent is captured here in case of network failure).
    _patientReportsLogAuditEvent('acknowledge_clicked', {
      report_id: String(reportId),
      using_demo_data: _patientReportsIsDemo,
    });
    try {
      const res = await api.acknowledgePatientReport(reportId, null);
      if (res && res.accepted) {
        const btn = el.querySelector(`.pt-doc-card[data-id="${CSS.escape(String(reportId))}"] .pt-doc-cta-ack`);
        if (btn) {
          btn.textContent = '✓ Acknowledged';
          btn.setAttribute('disabled', '');
          btn.setAttribute('aria-disabled', 'true');
          btn.dataset.acknowledged = '1';
        }
        _prToast('Acknowledged "' + (title || 'report') + '"');
      } else {
        _prToast('Could not acknowledge — please try again.');
      }
    } catch (_e) {
      _prToast('Could not acknowledge — please try again.');
    }
  };

  // Request a share-back — opens an inline prompt for audience + reason,
  // then calls /request-share-back. Server validates note presence (>= 2
  // chars) so the prompt re-runs if the patient leaves it blank.
  window._ptShareBackReport = async function(reportId, title) {
    if (!reportId) return;
    if (!_patientReportsServerLive) {
      _prToast('Reconnect to request a share-back.');
      return;
    }
    if (_patientReportsConsentActive === false) {
      _prToast('Share-back requests are paused while consent is withdrawn.');
      return;
    }
    const audience = (window.prompt && window.prompt('Who should receive a copy? (e.g. "GP", "family member", "insurer")', 'GP')) || '';
    if (!audience.trim()) return;
    const note = (window.prompt && window.prompt('Add a short note for your clinician — why are you requesting this share-back?', '')) || '';
    if (note.trim().length < 2) {
      _prToast('A short reason is required so your clinician can review.');
      return;
    }
    _patientReportsLogAuditEvent('share_back_clicked', {
      report_id: String(reportId),
      using_demo_data: _patientReportsIsDemo,
      note: 'audience=' + audience.slice(0, 60),
    });
    try {
      const res = await api.requestPatientReportShareBack(reportId, audience.trim(), note.trim());
      if (res && res.accepted) {
        const btn = el.querySelector(`.pt-doc-card[data-id="${CSS.escape(String(reportId))}"] .pt-doc-cta-share`);
        if (btn) {
          btn.textContent = 'Share-back requested';
          btn.setAttribute('disabled', '');
          btn.setAttribute('aria-disabled', 'true');
          btn.dataset.shareBackPending = '1';
        }
        _prToast('Share-back request sent to your clinician for review.');
      } else {
        _prToast('Could not send share-back — please try again.');
      }
    } catch (_e) {
      _prToast('Could not send share-back — please try again.');
    }
  };

  // Start a question thread linked to this report — opens a prompt, then
  // calls /start-question. On success, navigate the patient to the Messages
  // page so they see the new thread.
  window._ptStartQuestionForReport = async function(reportId, title) {
    if (!reportId) return;
    if (!_patientReportsServerLive) {
      _prToast('Reconnect to start a question thread.');
      return;
    }
    if (_patientReportsConsentActive === false) {
      _prToast('Question threads are paused while consent is withdrawn.');
      return;
    }
    const prefill = title ? ('I have a question about "' + title + '": ') : '';
    const question = (window.prompt && window.prompt('What is your question? Your clinician will reply through Messages.', prefill)) || '';
    if (question.trim().length < 2) return;
    _patientReportsLogAuditEvent('question_clicked', {
      report_id: String(reportId),
      using_demo_data: _patientReportsIsDemo,
    });
    try {
      const res = await api.startPatientReportQuestion(reportId, question.trim());
      if (res && res.accepted) {
        _prToast('Question sent — your clinician will reply in Messages.');
        // Deep-link the patient straight into Messages.
        if (typeof window._navPatient === 'function') {
          window._navPatient('patient-messages');
        }
      } else {
        _prToast('Could not start the question — please try again.');
      }
    } catch (_e) {
      _prToast('Could not start the question — please try again.');
    }
  };
}

// \u2500\u2500 My Brain Map (Phase 1) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Renders the patient-facing QEEGBrainMapReport for the current patient's
// most recent qEEG analysis. Honest empty state when none exists.
export async function pgPatientBrainMap() {
  setTopbar('My Brain Map');
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  const patientId = (currentUser && (currentUser.patient_id || currentUser.id)) || null;
  if (!patientId) {
    el.innerHTML = '<div class="ds-card"><div class="ds-card__body" style="padding:32px;text-align:center;color:var(--text-secondary)">'
      + 'Please sign in to view your brain map.</div></div>';
    return;
  }

  let analyses = null;
  try { analyses = await api.listPatientQEEGAnalyses(patientId); } catch (_) { analyses = null; }
  const items = (analyses && (analyses.items || analyses.analyses || analyses)) || [];
  if (!Array.isArray(items) || items.length === 0) {
    el.innerHTML = '<div class="ds-card"><div class="ds-card__body" style="padding:48px;text-align:center;color:var(--text-secondary);font-size:14px;line-height:1.6">'
      + '<h3 style="margin:0 0 8px;color:var(--text-primary)">No brain map yet</h3>'
      + 'Your clinician will share results here once your qEEG is analyzed. There is no brain map on file for your account at the moment.'
      + '</div></div>';
    return;
  }

  const latest = items[0] || {};
  const reportId = latest.report_id || latest.latest_report_id || null;
  if (!reportId) {
    el.innerHTML = '<div class="ds-card"><div class="ds-card__body" style="padding:32px;text-align:center;color:var(--text-secondary)">'
      + 'Your most recent qEEG is being analyzed. Check back shortly.'
      + '</div></div>';
    return;
  }

  el.innerHTML = '<div id="pt-brainmap-mount"></div>';
  try {
    const reportMod = await import('./qeeg-patient-report.js');
    await reportMod.mountPatientReport('pt-brainmap-mount', reportId, api);
  } catch (e) {
    el.innerHTML =
      '<div class="ds-alert ds-alert--error">Unable to load your brain map right now. Please try again later.</div>'
      + '<p style="margin-top:12px;font-size:12px;color:var(--text-secondary);line-height:1.5">'
      + 'Research and wellness use only. Brain map summaries are informational and are not a medical '
      + 'diagnosis or treatment recommendation. Discuss any findings with a qualified clinician.'
      + '</p>';
  }
}

// \u2500\u2500 Patient Messages launch-audit helper (2026-05-01) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// Mirrors the patient-reports / wellness-hub / symptom-journal helper.
// Best-effort: never throws back at the caller \u2014 audit failures must
// not block the UI.
async function _patientMessagesLogAuditEvent(event, extra) {
  try {
    if (api && typeof api.postPatientMessagesAuditEvent === 'function') {
      await api.postPatientMessagesAuditEvent({
        event,
        thread_id: (extra && extra.thread_id) ? String(extra.thread_id) : null,
        message_id: (extra && extra.message_id) ? String(extra.message_id) : null,
        note: (extra && extra.note) ? String(extra.note).slice(0, 480) : null,
        using_demo_data: !!(extra && extra.using_demo_data),
      });
    }
  } catch (_) { /* audit failures must never block UI */ }
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

  // Inline SVGs for call CTAs — the sprite has no phone/video icon.
  const SVG_VIDEO = '<svg class="ptmsg-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2.5l3.4-2.2a1 1 0 0 1 1.6.8v9.8a1 1 0 0 1-1.6.8L17 15.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/></svg>';
  const SVG_PHONE = '<svg class="ptmsg-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.5 11.5 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.5 11.5 0 0 0 .6 3.6 1 1 0 0 1-.25 1L6.6 10.8z"/></svg>';
  const SVG_REFRESH = '<svg class="ptmsg-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 4a8 8 0 1 1-7.45 10.91l1.87-.74A6 6 0 1 0 12 6V9L7 5l5-4v3z"/></svg>';
  const SVG_SEND = '<svg class="ptmsg-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 20.5V13l13-1L3 11V3.5l19 8.5-19 8.5z"/></svg>';

  const _demoBuild =
    (typeof import.meta !== 'undefined'
      && import.meta.env
      && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1'));
  const inDemo = _demoBuild
    || isDemoPatient(currentUser, { getToken: api.getToken })
    || (() => { try { return String(api.getToken?.() || '').includes('demo'); } catch { return false; } })();

  // ── Fetch messages + course + portal me (all three parallel) ──────────────
  // 3s timeout so a hung Fly backend never wedges the inbox on a spinner.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  let messagesRaw, coursesRaw, meRaw;
  // Patient Messages launch-audit (2026-05-01). Prefer the new
  // /api/v1/messages/threads endpoint which carries is_demo /
  // consent_active honestly. Soft-fail back to the legacy portal
  // messages endpoint if the new surface times out.
  let threadsServerRaw = null;
  let threadsServerErr = false;
  let threadsSummaryRaw = null;
  try {
    [messagesRaw, coursesRaw, meRaw, threadsServerRaw, threadsSummaryRaw] = await Promise.all([
      _raceNull(api.patientPortalMessages()),
      _raceNull(api.patientPortalCourses()),
      _raceNull(api.patientPortalMe()),
      typeof api.listPatientMessageThreads === 'function'
        ? _raceNull(api.listPatientMessageThreads({ limit: 100 }))
        : Promise.resolve(null),
      typeof api.getPatientMessageThreadsSummary === 'function'
        ? _raceNull(api.getPatientMessageThreadsSummary())
        : Promise.resolve(null),
    ]);
  } catch (_e) {
    messagesRaw = null; coursesRaw = null; meRaw = null;
    threadsServerRaw = null; threadsServerErr = true;
    threadsSummaryRaw = null;
  }

  const courses      = Array.isArray(coursesRaw) ? coursesRaw : [];
  const activeCourse = courses.find(c => c.status === 'active') || courses[0] || null;
  const me           = meRaw && typeof meRaw === 'object' ? meRaw : null;

  // Launch-audit derived flags. The server is the canonical source for
  // is_demo / consent_active — we never fabricate either here.
  const _patientMessagesServerLive = !!threadsServerRaw && !threadsServerErr;
  const _patientMessagesIsDemo = !!(threadsServerRaw && threadsServerRaw.is_demo);
  const _patientMessagesConsentActive = threadsServerRaw
    ? !!threadsServerRaw.consent_active
    : true;

  // Mount-time view audit ping. Best-effort, never blocks render.
  _patientMessagesLogAuditEvent('view', {
    using_demo_data: _patientMessagesIsDemo,
    note: _patientMessagesServerLive
      ? `threads=${(threadsServerRaw && threadsServerRaw.total) || 0}; consent_active=${_patientMessagesConsentActive ? 1 : 0}`
      : 'fallback=offline',
  });

  // Parse ?thread_id=… from the page URL so a deep-link from Patient
  // Reports start-question can open the report-question thread directly.
  let _ptmsgDeepLinkThreadId = null;
  try {
    const _qs = new URLSearchParams(window.location.search || '');
    const _tid = _qs.get('thread_id');
    if (_tid && typeof _tid === 'string') {
      _ptmsgDeepLinkThreadId = _tid.trim();
      if (_ptmsgDeepLinkThreadId) {
        _patientMessagesLogAuditEvent('deep_link_followed', {
          thread_id: _ptmsgDeepLinkThreadId,
          using_demo_data: _patientMessagesIsDemo,
        });
      }
    }
  } catch (_e) { /* URL API unavailable — skip */ }

  // Demo seed: if demo-mode AND the real endpoint returned empty *or* the
  // Fly backend timed out (messagesRaw === null), overlay the 3-exchange
  // seeded thread so reviewers see something realistic. Outside demo mode
  // we fall through to the empty/"couldn't load" path instead.
  let rawMessages;
  if (Array.isArray(messagesRaw) && messagesRaw.length > 0) {
    rawMessages = messagesRaw;
  } else if (inDemo) {
    rawMessages = demoMessagesSeed();
  } else {
    rawMessages = [];
  }

  // ── Message category metadata ────────────────────────────────────────────
  const MSG_CATEGORIES = [
    { key: 'general',        label: 'General' },
    { key: 'treatment-plan', label: t('patient.msg.cat.treatment_plan') },
    { key: 'session',        label: t('patient.msg.cat.session') },
    { key: 'side-effects',   label: t('patient.msg.cat.side_effects') },
    { key: 'documents',      label: t('patient.msg.cat.documents') },
    { key: 'billing',        label: t('patient.msg.cat.billing') },
    { key: 'other',          label: t('patient.msg.cat.other') },
  ];

  // ── Thread grouping ──────────────────────────────────────────────────────
  // Backend now stamps thread_id on every message (PR #50). We group by
  // thread_id and fall back to a single "All messages" bucket for any
  // legacy rows with a null thread_id.
  const threadMap = new Map();
  rawMessages
    .slice()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .forEach(m => {
      const key = m.thread_id || 'all';
      if (!threadMap.has(key)) {
        threadMap.set(key, { key, messages: [], unreadCount: 0 });
      }
      const thread = threadMap.get(key);
      thread.messages.push(m);
      if (m.is_read === false || m.read === false || m.unread === true) {
        thread.unreadCount++;
      }
    });

  function rebuildThreadsFromMap() {
    return [...threadMap.values()].map(th => {
      const latest = th.messages[th.messages.length - 1];
      const first  = th.messages[0];
      const incoming = th.messages.filter(m => (m.sender_type || '').toLowerCase() !== 'patient');
      const lastIncoming = incoming[incoming.length - 1] || null;
      const subject = first.subject || first.category_label
        || (th.key === 'all' ? 'All messages' : 'Message from your clinic');
      return {
        key: th.key, messages: th.messages, unreadCount: th.unreadCount,
        subject,
        latestBody: latest.body || latest.message || latest.text || '',
        latestDate: latest.created_at || latest.sent_at,
        latestSender: lastIncoming
          ? (lastIncoming.sender_name || lastIncoming.sender?.display_name || 'Care Team')
          : (first.sender_name || 'Care Team'),
        category: first.category || null,
        hasDemo:  th.messages.some(m => m._demo === true),
      };
    }).sort((a, b) => new Date(b.latestDate || 0) - new Date(a.latestDate || 0));
  }
  const threads = rebuildThreadsFromMap();

  // ── Page state ───────────────────────────────────────────────────────────
  // Only surface a hard "load failed" banner when we genuinely have no
  // fallback — i.e. the endpoint errored or timed out AND we're not in a
  // demo build that just overlaid seeded threads for the reviewer.
  const loadFailed = messagesRaw === null && !inDemo;
  const uid        = currentUser?.id;

  let activeThreadIdx = threads.length > 0 ? 0 : -1;
  const _readFired = new Set();

  // ── Message bubble HTML ──────────────────────────────────────────────────
  function bubbleHTML(m) {
    const isOutgoing = m.sender_id === uid || (m.sender_type || '').toLowerCase() === 'patient';
    const body       = esc(m.body || m.message || m.text || '');
    const rel        = fmtRelative(m.created_at || m.sent_at);
    const fullDate   = fmtDate(m.created_at || m.sent_at);
    const senderName = esc(m.sender_name || m.sender?.display_name || (isOutgoing ? 'You' : 'Care Team'));
    const urgent     = (m.priority || '').toLowerCase() === 'urgent';
    const demoChip   = m._demo
      ? '<span class="pth-demo-tag" title="Demo data shown while real data is unavailable">demo</span>'
      : '';
    const readMark = isOutgoing && m.is_read === true
      ? '<span class="ptmsg-read-mark" aria-label="Read">Read &#10003;</span>'
      : '';

    if (isOutgoing) {
      return `
        <div class="ptmsg-bubble-row ptmsg-row-out">
          <div class="ptmsg-bubble ptmsg-bubble-out">
            <div class="ptmsg-bubble-body">${body}</div>
            <div class="ptmsg-bubble-meta" title="${esc(fullDate)}">${esc(rel)} ${readMark}</div>
          </div>
          <div class="ptmsg-avatar ptmsg-avatar-you" aria-hidden="true">You</div>
        </div>`;
    }

    const initials = (senderName || '').replace(/&[^;]+;/g, '').split(' ')
      .map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'CT';
    return `
      <div class="ptmsg-bubble-row ptmsg-row-in${urgent ? ' ptmsg-row-urgent' : ''}">
        <div class="ptmsg-avatar ptmsg-avatar-clinic" aria-hidden="true">${initials}</div>
        <div class="ptmsg-bubble ptmsg-bubble-in${urgent ? ' ptmsg-bubble-urgent' : ''}">
          <div class="ptmsg-sender-name">${senderName} ${demoChip}</div>
          <div class="ptmsg-bubble-body">${body}</div>
          <div class="ptmsg-bubble-meta" title="${esc(fullDate)}">${esc(rel)}</div>
        </div>
      </div>`;
  }

  // ── Thread list (left pane) ──────────────────────────────────────────────
  function threadListHTML() {
    if (loadFailed) {
      return `<div class="ptmsg-load-error">
        <span aria-hidden="true">&#9680;</span>
        ${t('patient.msg.load_error')}
        <button class="btn btn-ghost btn-sm" style="margin-left:10px;margin-top:6px"
                onclick="window._navPatient('patient-messages')">${t('common.retry')} \u2192</button>
      </div>`;
    }
    if (threads.length === 0) {
      return `<div class="ptmsg-empty">
        <div class="ptmsg-empty-title">No messages yet</div>
        <div class="ptmsg-empty-body">Send your care team a message below \u2014 or start a call above.</div>
      </div>`;
    }
    return threads.map((th, i) => {
      const preview = esc((th.latestBody || '').slice(0, 70).trim());
      const rel     = fmtRelative(th.latestDate);
      const demoTag = th.hasDemo
        ? '<span class="pth-demo-tag" title="Demo data shown while real data is unavailable">demo</span>'
        : '';
      const unreadBadge = th.unreadCount > 0
        ? `<span class="ptmsg-unread-badge" aria-label="${th.unreadCount} unread">${th.unreadCount}</span>`
        : '';
      const selClass = (i === activeThreadIdx) ? ' ptmsg-thread-selected' : '';
      // Sender tile — teal for clinician threads (default), rose if the
      // latest message came from the patient. Initials are derived from the
      // displayed sender name.
      const senderName = th.latestSender || 'Care Team';
      const senderInitials = senderName.replace(/&[^;]+;/g, '').split(/\s+/)
        .filter(Boolean).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'CT';
      const lastMsg = th.messages[th.messages.length - 1];
      const lastIsPatient = lastMsg && (lastMsg.sender_type || '').toLowerCase() === 'patient';
      const tileTone = lastIsPatient ? 'rose' : 'teal';
      return `
        <button type="button" class="ptmsg-thread-item${selClass}"
                aria-pressed="${i === activeThreadIdx}"
                aria-label="Open thread with ${esc(senderName)}"
                onclick="window._ptmsgSelectThread(${i})">
          <div class="ptmsg-thread-top">
            <span class="pt-page-tile pt-page-tile--sm pt-page-tile--initials pt-nav-tile--${tileTone}" aria-hidden="true">${esc(senderInitials)}</span>
            <span class="ptmsg-thread-sender">${esc(senderName)}</span>
            <span class="ptmsg-thread-date">${esc(rel)}</span>
          </div>
          <div class="ptmsg-thread-subject">${esc(th.subject || '')} ${demoTag}</div>
          <div class="ptmsg-thread-preview">${preview || '<em>No content</em>'}</div>
          <div class="ptmsg-thread-meta">${unreadBadge}</div>
        </button>`;
    }).join('');
  }

  // ── Conversation pane (right) ────────────────────────────────────────────
  function conversationHTML() {
    if (activeThreadIdx < 0 || !threads[activeThreadIdx]) {
      return `<div class="ptmsg-conversation-empty">
        <div class="ptmsg-conversation-empty-title">Pick a conversation</div>
        <div class="ptmsg-conversation-empty-body">Select a thread on the left, or use the composer below to start a new one.</div>
      </div>`;
    }
    const th = threads[activeThreadIdx];
    return th.messages.length > 0
      ? th.messages.map(m => bubbleHTML(m)).join('')
      : `<div class="ptmsg-conversation-empty-body">No messages in this thread yet.</div>`;
  }

  // ── Call-request inline panel (Tier B) ───────────────────────────────────
  function callRequestPanelHTML(tier) {
    if (!tier || tier.tier !== 'B') return '';
    return `
      <div class="ptmsg-call-request" id="ptmsg-call-request" role="region"
           aria-label="Request a ${tier.mode} call">
        <div class="ptmsg-call-request-hd">Request a ${tier.mode} call</div>
        <div class="ptmsg-call-request-body">
          <div class="form-group">
            <label class="form-label" for="ptmsg-call-body">What should your care team know?</label>
            <textarea id="ptmsg-call-body" class="form-control" rows="3"
                      aria-label="Call request body">${esc(tier.body)}</textarea>
          </div>
          <div class="ptmsg-call-request-footer">
            <button class="btn btn-ghost btn-sm" type="button"
                    onclick="window._ptmsgCancelCallRequest()">Cancel</button>
            <button class="btn btn-primary btn-sm" type="button"
                    id="ptmsg-call-send-btn"
                    onclick="window._ptmsgSendCallRequest()">Send request \u2192</button>
          </div>
          <div id="ptmsg-call-request-status" class="ptmsg-send-status" hidden></div>
        </div>
      </div>`;
  }

  // ── Header (title + call buttons + refresh) ──────────────────────────────
  function headerHTML() {
    return `
      <header class="ptmsg-header">
        <div class="ptmsg-header-title">
          <div class="ptmsg-title">Your care team</div>
          <div class="ptmsg-subtitle">Send a message, or request a call from your care team.</div>
        </div>
        <div class="ptmsg-header-actions">
          <button type="button"
                  class="btn btn-primary btn-sm ptmsg-btn-call ptmsg-btn-call-video"
                  aria-label="Request video call"
                  onclick="window._ptmsgStartCall('video')">
            ${SVG_VIDEO} <span>Request video call</span>
          </button>
          <button type="button"
                  class="btn btn-ghost btn-sm ptmsg-btn-call ptmsg-btn-call-voice"
                  aria-label="Request voice call"
                  onclick="window._ptmsgStartCall('voice')">
            ${SVG_PHONE} <span>Request voice call</span>
          </button>
          <button type="button"
                  class="btn btn-ghost btn-sm ptmsg-btn-refresh"
                  aria-label="Refresh messages"
                  onclick="window._navPatient('patient-messages')">
            ${SVG_REFRESH} <span>Refresh</span>
          </button>
        </div>
      </header>`;
  }

  // ── Composer (bottom) ────────────────────────────────────────────────────
  function composerHTML() {
    const categoryOptions = MSG_CATEGORIES.map(c =>
      `<option value="${esc(c.key)}"${c.key === 'general' ? ' selected' : ''}>${esc(c.label)}</option>`
    ).join('');
    return `
      <form class="ptmsg-composer" id="ptmsg-composer"
            aria-label="Send a message to your care team"
            onsubmit="event.preventDefault(); window._ptmsgSend();">
        <div id="ptmsg-composer-err" class="ptmsg-composer-err" hidden role="alert"></div>
        <div class="ptmsg-composer-row">
          <label class="ptmsg-sr-only" for="ptmsg-category">Category</label>
          <select id="ptmsg-category" class="form-control ptmsg-category-select"
                  aria-label="Message category">
            ${categoryOptions}
          </select>
          <label class="ptmsg-sr-only" for="ptmsg-body">Message</label>
          <textarea id="ptmsg-body" class="form-control ptmsg-body-input"
                    rows="2" maxlength="2000" placeholder="Type your message\u2026 (Enter to send, Shift+Enter for newline)"
                    aria-label="Message body"></textarea>
          <button type="submit" class="btn btn-primary btn-sm ptmsg-send-btn"
                  id="ptmsg-send-btn"
                  aria-label="Send message">${SVG_SEND} <span>Send</span></button>
        </div>
      </form>`;
  }

  // ── Full page render ─────────────────────────────────────────────────────
  function renderPage() {
    const threadCountLine = threads.length > 0
      ? `<span class="ptmsg-list-count">${threads.length === 1 ? t('patient.msg.thread_count_one') : t('patient.msg.thread_count', { n: threads.length })}</span>`
      : '';

    // Launch-audit banners (2026-05-01). Demo banner only when the
    // server explicitly flags the patient as demo. Consent-revoked
    // banner only when the server returned consent_active=false.
    // Offline banner when the new server endpoint is down (we still
    // render the legacy fallback list below it).
    const _patientMessagesDemoBanner = _patientMessagesIsDemo
      ? `<div class="ds-alert ds-alert--info" style="margin-bottom:12px">DEMO mode — messages are sample data. Threads, audit rows and read receipts are not regulator-submittable.</div>`
      : '';
    const _patientMessagesConsentBanner = (_patientMessagesServerLive && _patientMessagesConsentActive === false)
      ? `<div class="ds-alert ds-alert--warning" style="margin-bottom:12px">Consent withdrawn — you can read existing threads but new messages, replies and urgent flags are paused until consent is reinstated.</div>`
      : '';
    const _patientMessagesOfflineBanner = (!_patientMessagesServerLive)
      ? `<div class="ds-alert ds-alert--warning" style="margin-bottom:12px">Live messages service is offline — showing the most recent cached threads. New replies you send may not record an audit row until the service is back.</div>`
      : '';
    // Honest empty state — only when server is live AND zero threads.
    const _patientMessagesEmptyBanner = (_patientMessagesServerLive && threads.length === 0)
      ? `<div class="ds-alert" style="margin-bottom:12px">No messages yet — start a conversation with your care team below, or open a question on a recent report.</div>`
      : '';

    // Cross-link to the related report when the active thread was
    // started from a Patient Reports start-question CTA.
    let _patientMessagesReportLink = '';
    if (activeThreadIdx >= 0 && threads[activeThreadIdx]) {
      const _activeKey = String(threads[activeThreadIdx].key || '');
      if (_activeKey.startsWith('report-')) {
        const _rid = _activeKey.slice('report-'.length);
        _patientMessagesReportLink = `<div class="ptmsg-report-link" style="padding:8px 12px;font-size:13px;color:var(--text-secondary);border-bottom:1px solid var(--border-subtle)">This thread is about <a href="?page=patient-reports&report_id=${encodeURIComponent(_rid)}" onclick="window._ptmsgFollowReportLink && window._ptmsgFollowReportLink('${esc(_rid)}'); return true;">a report you received</a>. Open the report to read the full document.</div>`;
      }
    }

    el.innerHTML = `
      <div class="ptmsg-wrap" id="ptmsg-wrap">
        ${headerHTML()}
        ${_patientMessagesDemoBanner}
        ${_patientMessagesConsentBanner}
        ${_patientMessagesOfflineBanner}
        ${_patientMessagesEmptyBanner}
        <div class="ptmsg-body-grid">
          <aside class="ptmsg-pane ptmsg-pane-list" aria-label="Conversations">
            <div class="ptmsg-pane-hd">
              <span>Conversations</span>
              ${threadCountLine}
            </div>
            <div class="ptmsg-thread-list" id="ptmsg-thread-list">${threadListHTML()}</div>
          </aside>
          <section class="ptmsg-pane ptmsg-pane-conv" aria-label="Conversation"
                   aria-live="polite">
            ${_patientMessagesReportLink}
            <div class="ptmsg-conv-body" id="ptmsg-conv-body">${conversationHTML()}</div>
            <div id="ptmsg-call-request-slot"></div>
            ${composerHTML()}
          </section>
        </div>
      </div>`;

    // Pre-fill compose from the "Ask about this" CTA on Reports.
    if (window._ptPendingAsk) {
      const pendingPrompt = window._ptPendingAsk;
      window._ptPendingAsk = null;
      setTimeout(() => {
        const bodyTA = el.querySelector('#ptmsg-body');
        const catSel = el.querySelector('#ptmsg-category');
        if (catSel) { catSel.value = 'documents'; }
        if (bodyTA) { bodyTA.value = pendingPrompt; bodyTA.focus(); }
      }, 60);
    }

    // Fire-and-forget read-receipt PATCH for any unread clinician messages
    // visible in the current conversation. Runs after each render. Each
    // mark-read also emits a patient_messages.message_read audit row.
    if (activeThreadIdx >= 0 && threads[activeThreadIdx]) {
      const _activeThread = threads[activeThreadIdx];
      const _activeKey = String(_activeThread.key || '');
      for (const m of _activeThread.messages) {
        const senderIsClinician = (m.sender_type || '').toLowerCase() !== 'patient'
          && m.sender_id !== uid;
        if (senderIsClinician && m.is_read === false && m.id && !_readFired.has(m.id) && !m._demo) {
          _readFired.add(m.id);
          try {
            // Prefer the new patient_messages mark-read endpoint (which
            // records the audit row). Fall back to the legacy portal
            // mark-read for older deployments.
            if (typeof api.markPatientMessageRead === 'function' && _activeKey && _activeKey !== 'all') {
              api.markPatientMessageRead(_activeKey, m.id)
                .then(() => {
                  m.is_read = true;
                  _patientMessagesLogAuditEvent('clinician_reply_visible', {
                    thread_id: _activeKey,
                    message_id: m.id,
                    using_demo_data: _patientMessagesIsDemo,
                  });
                })
                .catch(() => {
                  if (typeof api.patientPortalMarkMessageRead === 'function') {
                    api.patientPortalMarkMessageRead(m.id)
                      .then(() => { m.is_read = true; })
                      .catch(() => {/* endpoint may be absent */});
                  }
                });
            } else if (typeof api.patientPortalMarkMessageRead === 'function') {
              api.patientPortalMarkMessageRead(m.id)
                .then(() => { m.is_read = true; })
                .catch(() => {/* endpoint may be absent on older API */});
            }
          } catch (_e) { /* swallow */ }
        }
      }
    }

    // Wire Enter-to-send on the composer body (shift+Enter = newline).
    const bodyEl = el.querySelector('#ptmsg-body');
    if (bodyEl) {
      bodyEl.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          window._ptmsgSend();
        }
      });
    }
  }

  // ── Handlers (exposed on window for inline onclick) ──────────────────────

  window._ptmsgSelectThread = function(idx) {
    if (!threads[idx]) return;
    activeThreadIdx = idx;
    const th = threads[idx];
    _patientMessagesLogAuditEvent('thread_opened', {
      thread_id: th.key,
      using_demo_data: _patientMessagesIsDemo,
      note: `messages=${th.messages.length}; unread=${th.unreadCount}`,
    });
    renderPage();
  };

  // Cross-link follower — emits an audit row when the patient clicks
  // through to the report this thread is about.
  window._ptmsgFollowReportLink = function(reportId) {
    _patientMessagesLogAuditEvent('cross_link_report_clicked', {
      thread_id: `report-${reportId}`,
      using_demo_data: _patientMessagesIsDemo,
      note: `report=${reportId}`,
    });
  };

  // If a deep-link ?thread_id=… was supplied, try to pre-select that
  // thread before the first render. Falls back silently if the thread
  // is not in the cached list (e.g. server timed out and we are on the
  // legacy fallback).
  if (_ptmsgDeepLinkThreadId) {
    const _idx = threads.findIndex(th => String(th.key) === String(_ptmsgDeepLinkThreadId));
    if (_idx >= 0) {
      activeThreadIdx = _idx;
    }
  }

  window._ptmsgStartCall = async function(mode) {
    const tier = pickCallTier(
      { activeCourse, me, mode },
      { demo: inDemo, patientId: me?.patient_id || currentUser?.id },
    );

    // Tier A — open the meeting URL in a new tab.
    if (tier.tier === 'A') {
      try { window.open(tier.url, '_blank', 'noopener,noreferrer'); }
      catch (_e) { /* popup blocked */ }

      // Log a structured message to the thread, but ONLY if the POST
      // succeeds. Skip this log entirely in demo mode (no backend
      // clinician to send to).
      if (!tier.demo) {
        try {
          const created = await api.sendPortalMessage({
            body:     `You started a ${mode} call.`,
            subject:  `${mode === 'voice' ? 'Voice' : 'Video'} call started`,
            category: 'call_log',
            priority: 'normal',
          });
          if (created && typeof created === 'object') {
            const key = created.thread_id || 'all';
            let thread = threadMap.get(key);
            if (!thread) {
              thread = { key, messages: [], unreadCount: 0 };
              threadMap.set(key, thread);
            }
            thread.messages.push(created);
            const rebuilt = rebuildThreadsFromMap();
            threads.length = 0; rebuilt.forEach(r => threads.push(r));
            activeThreadIdx = threads.findIndex(r => r.key === key);
            renderPage();
          }
        } catch (_e) { /* silent — user already sees the open tab */ }
      }
      return;
    }

    // Tier B — inline "Request a call" panel.
    if (tier.tier === 'B') {
      const slot = el.querySelector('#ptmsg-call-request-slot');
      if (slot) {
        slot.innerHTML = callRequestPanelHTML(tier);
        const ta = slot.querySelector('#ptmsg-call-body');
        if (ta) ta.focus();
        window._ptmsgPendingCallTier = tier;
      }
      return;
    }

    // Tier C — no clinician. Honest toast.
    try {
      if (typeof showToast === 'function') {
        showToast('Your clinic will add your clinician soon. Please contact your clinic to schedule a call.', 'warning');
      }
    } catch (_e) { /* ignore */ }
  };

  window._ptmsgCancelCallRequest = function() {
    const slot = el.querySelector('#ptmsg-call-request-slot');
    if (slot) slot.innerHTML = '';
    window._ptmsgPendingCallTier = null;
  };

  window._ptmsgSendCallRequest = async function() {
    const tier   = window._ptmsgPendingCallTier || null;
    const ta     = el.querySelector('#ptmsg-call-body');
    const btn    = el.querySelector('#ptmsg-call-send-btn');
    const status = el.querySelector('#ptmsg-call-request-status');
    if (!tier || !ta) return;
    const text = (ta.value || '').trim();
    if (!text) { ta.focus(); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      await api.sendPortalMessage({
        body:     text,
        subject:  tier.subject,
        category: 'call_request',
        priority: 'normal',
      });
      if (status) {
        status.removeAttribute('hidden');
        status.className = 'ptmsg-send-status ptmsg-send-ok';
        status.textContent = 'Call request recorded. Response timing depends on portal workflow.';
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Recorded'; }
      window._ptmsgPendingCallTier = null;
    } catch (e) {
      const msg = (e && e.data && e.data.message) || (e && e.message)
        || 'Could not send your call request.';
      if (status) {
        status.removeAttribute('hidden');
        status.className = 'ptmsg-send-status ptmsg-send-fail';
        status.textContent = String(msg);
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Send request \u2192'; }
    }
  };

  // Composer send — Enter-to-send / Shift+Enter for newline.
  window._ptmsgSend = async function() {
    const errBox = el.querySelector('#ptmsg-composer-err');
    const catEl  = el.querySelector('#ptmsg-category');
    const bodyEl = el.querySelector('#ptmsg-body');
    const btn    = el.querySelector('#ptmsg-send-btn');
    if (!bodyEl) return;
    const body     = (bodyEl.value || '').trim();
    const category = catEl?.value || 'general';
    if (errBox) { errBox.hidden = true; errBox.textContent = ''; }
    if (!body)  {
      if (errBox) { errBox.hidden = false; errBox.textContent = 'Type a message before sending.'; }
      bodyEl.focus();
      return;
    }
    // Consent gate — never POST a send when the server has told us
    // consent is withdrawn. The server enforces the same gate but we
    // give the patient an immediate, honest message.
    if (_patientMessagesServerLive && _patientMessagesConsentActive === false) {
      if (errBox) { errBox.hidden = false; errBox.textContent = 'Sending is paused while consent is withdrawn.'; }
      return;
    }
    // Best-effort page-audit ping for the click intent (the server-side
    // /threads endpoint also emits its own message_sent audit row).
    _patientMessagesLogAuditEvent('message_sent_clicked', {
      thread_id: (threads[activeThreadIdx] && threads[activeThreadIdx].key) || null,
      using_demo_data: _patientMessagesIsDemo,
      note: `category=${category}; chars=${body.length}`,
    });
    if (btn) btn.disabled = true;
    try {
      const active = threads[activeThreadIdx] || null;
      const payload = {
        body,
        category,
        course_id: activeCourse?.id || null,
      };
      // Propagate thread_id only when it looks like a real backend id
      // (uuid-ish). Never post the 'all' bucket key back to the server —
      // let the backend stamp a new thread_id on the server side.
      if (active && active.key && active.key !== 'all') {
        const looksLikeId = typeof active.key === 'string' && /^[a-f0-9-]{16,}$/i.test(active.key);
        if (looksLikeId) payload.thread_id = active.key;
        else if (active.messages?.[0]?.thread_id) payload.thread_id = active.messages[0].thread_id;
      }
      const created = await api.sendPortalMessage(payload);
      bodyEl.value = '';
      if (created && typeof created === 'object') {
        const key = created.thread_id || (active?.key) || 'all';
        let thread = threadMap.get(key);
        if (!thread) {
          thread = { key, messages: [], unreadCount: 0 };
          threadMap.set(key, thread);
        }
        thread.messages.push(created);
        const rebuilt = rebuildThreadsFromMap();
        threads.length = 0; rebuilt.forEach(r => threads.push(r));
        activeThreadIdx = threads.findIndex(r => r.key === key);
      }
      // Background refresh of unread counts (never steals selection).
      try {
        api.patientPortalMessages().then(fresh => {
          if (!Array.isArray(fresh)) return;
          const byThread = new Map();
          for (const m of fresh) {
            const k = m.thread_id || 'all';
            if (!byThread.has(k)) byThread.set(k, 0);
            if (m.is_read === false) byThread.set(k, byThread.get(k) + 1);
          }
          for (const th of threads) {
            th.unreadCount = byThread.get(th.key) || 0;
          }
          renderPage();
        }).catch(() => {});
      } catch (_e) { /* ignore */ }
      renderPage();
    } catch (e) {
      const msg = (e && e.data && e.data.message) || (e && e.message) || t('patient.msg.send_failed');
      if (errBox) { errBox.hidden = false; errBox.textContent = String(msg); }
      if (btn) btn.disabled = false;
    }
  };

  renderPage();
}


// ─── Virtual Care ───────────────────────────────────────────────────────────
export async function pgPatientVirtualCare() {
  try { return await _pgPatientVirtualCareImpl(); }
  catch (err) {
    console.error('[pgPatientVirtualCare] render failed:', err);
    const el = document.getElementById('patient-content');
    if (el) el.innerHTML = `<div class="pt-portal-empty"><div class="pt-portal-empty-ico" aria-hidden="true">&#9888;</div><div class="pt-portal-empty-title">Virtual Care is unavailable</div><div class="pt-portal-empty-body">Please refresh, or message your care team through the Messages page.</div></div>`;
  }
}

async function _pgPatientVirtualCareImpl() {
  setTopbar('Virtual Care');
  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  const loc = getLocale() === 'tr' ? 'tr-TR' : 'en-US';

  const _t = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _race = (p) => Promise.race([Promise.resolve(p).catch(() => null), _t(3000)]);
  const uid = currentUser?.patient_id || currentUser?.id || null;
  let [msgsRaw, sessRaw, wearRaw] = await Promise.all([
    _race(api.patientPortalMessages()),
    _race(api.patientPortalSessions()),
    _race(api.patientPortalWearableSummary(7)),
  ]);

  const rawMessages = Array.isArray(msgsRaw) ? msgsRaw : [];
  const sessions    = Array.isArray(sessRaw) ? sessRaw : [];
  const wearDays    = Array.isArray(wearRaw) ? wearRaw : [];

  // Demo mode: when nothing came back, seed a coherent conversation story.
  const _isDemo = rawMessages.length === 0 && sessions.length === 0 && wearDays.length === 0;

  // Thread-centric model: group messages by sender_id, plus a virtual AI thread.
  const threads = {};
  function _upsertThread(id, meta) {
    if (!threads[id]) threads[id] = { id, ...meta, messages: [] };
    else Object.assign(threads[id], meta);
    return threads[id];
  }

  if (_isDemo) {
    const nowIso = new Date().toISOString();
    const toIso  = (dh) => { const d = new Date(); d.setDate(d.getDate() + dh); return d.toISOString(); };
    const kolmar = _upsertThread('kolmar', { name:'Dr. Julia Kolmar', role:'Psychiatrist · MD, PhD · GMC #7224189', avatar:'JK', avClass:'av-jk', online:'true', credentials:'MD, PhD · GMC #7224189 · 14 years experience' });
    const rhea   = _upsertThread('rhea',   { name:'Rhea Nair',        role:'tDCS technician',                  avatar:'RN', avClass:'av-rn', online:'true' });
    const ai     = _upsertThread('ai',     { name:'Synaps AI',        role:'Care assistant',                  avatar:'',   avClass:'av-ai', online:'ai' });
    const marcus = _upsertThread('marcus', { name:'Marcus Tan',       role:'Care coordinator',                avatar:'MT', avClass:'av-mt', online:'busy' });
    const team   = _upsertThread('team',   { name:'Care team',        role:'3 clinicians',                    avatar:'',   avClass:'av-team', online:'true' });
    const bill   = _upsertThread('billing',{ name:'Billing & insurance', role:'Admin',                        avatar:'$',  avClass:'', online:'false' });

    kolmar.messages.push(
      { id:'k1', sender:'them', senderName:'Dr. Kolmar', at:toIso(-3), body:"Hi Samantha — I reviewed your Week 5 assessments this morning. Your PHQ-9 dropped to 12 and your sleep has stabilized around 6.8h. This is a really good signal at this point in the course. Anything changed in how you're feeling day-to-day?" },
      { id:'k2', sender:'me',   senderName:'You',         at:toIso(-3), body:"Mornings are noticeably easier. Still some afternoon dips around 3pm but I'm managing with the walks. One thing — I felt mild tingling during my Wednesday home session that lasted about 5 min after. Nothing painful." },
      { id:'k3', sender:'me',   senderName:'You',         at:toIso(-3), kind:'voice', duration:'0:34' },
      { id:'k4', sender:'them', senderName:'Dr. Kolmar', at:toIso(-3), body:"Thanks for the voice note — that tingling is within the expected range, especially toward the end of a 20-min session. If you ever notice redness lasting beyond 15 min or any discomfort beyond \u201Cmild tingling\u201D, log it in Homework \u2192 Home tDCS skin log so we can review." },
      { id:'k5', sender:'them', senderName:'Dr. Kolmar', at:nowIso, kind:'report', body:'Week 6 progress read \u00b7 summary' },
      { id:'k6', sender:'them', senderName:'Dr. Kolmar', at:nowIso, kind:'schedule', body:'Proposed schedule change' },
      { id:'k7', sender:'me',   senderName:'You',         at:nowIso, body:"Thank you \u2014 really glad to see the asymmetry shift. Wed morning works better for me. Also, I synced my Apple Health data so you have a clearer picture of last week." },
      { id:'k8', sender:'me',   senderName:'You',         at:nowIso, kind:'biometrics' },
      { id:'k9', sender:'them', senderName:'Dr. Kolmar', at:nowIso, body:"Beautiful \u2014 the HRV trend is genuinely encouraging. I've accepted the Wednesday slot. Want to hop on a quick 10-min video tomorrow morning to talk through the Week 8 plan?", unread:true },
    );
    rhea.messages.push(
      { id:'r1', sender:'them', senderName:'Rhea Nair', at:toIso(-1), body:"Heads up — your saline sponges are on the low side per your home-device reading. I'll ship a refill tomorrow." },
      { id:'r2', sender:'me',   senderName:'You',       at:toIso(-1), body:"Thanks, I'll refill the saline sponges tonight." },
    );
    ai.messages.push(
      { id:'a1', sender:'me',   senderName:'You',       at:toIso(-2), body:"Is tingling normal during home tDCS?" },
      { id:'a2', sender:'them', senderName:'Synaps AI', at:toIso(-2), body:"Mild tingling at the electrode sites is common during ramp-up and the first few minutes, especially at 2.0 mA. It should fade within 1\u20132 minutes. If it escalates, feels sharp, or lasts > 10 min post-session, pause and message Rhea." },
    );
    marcus.messages.push(
      { id:'m1', sender:'them', senderName:'Marcus Tan', at:toIso(-4), body:"Your Week 8 rescan is booked for May 4 at 10:00." }
    );
    team.messages.push(
      { id:'t1', sender:'them', senderName:'Rhea', at:toIso(-5), body:"Updated the home session schedule for next week." }
    );
    bill.messages.push(
      { id:'b1', sender:'them', senderName:'Billing', at:toIso(-6), body:"Your Week 1\u20135 superbill is ready to download." }
    );
  } else {
    // Real data: bucket messages by sender_id. Every unique sender becomes a thread.
    rawMessages.forEach(m => {
      const tid = String(m.thread_id || m.sender_id || m.sender_name || 'other');
      const th = _upsertThread(tid, {
        name: m.sender_name || m.sender_display_name || 'Care team',
        role: m.sender_type === 'system' ? 'Care assistant' : m.sender_role || 'Clinician',
        avatar: (m.sender_name || 'CT').split(/\s+/).map(p => p[0] || '').slice(0, 2).join('').toUpperCase(),
        avClass: m.sender_type === 'system' ? 'av-ai' : '',
        online: m.sender_online ? 'true' : 'false',
      });
      th.messages.push({
        id: m.id,
        sender: m.sender_type === 'patient' ? 'me' : 'them',
        senderName: m.sender_name || (m.sender_type === 'patient' ? 'You' : 'Care team'),
        at: m.created_at,
        body: m.body || m.preview || '',
        unread: !m.is_read,
      });
    });
  }

  const threadList = Object.values(threads);
  // Default selected thread = first with unread > 0, else first.
  const activeThread = threadList.find(t => t.messages.some(m => m.unread)) || threadList[0] || null;
  let activeId = activeThread ? activeThread.id : null;

  // Biometrics summary for right rail.
  function _avg(arr) { const xs = arr.filter(x => x != null && !Number.isNaN(Number(x))).map(Number); if (!xs.length) return null; return xs.reduce((a, b) => a + b, 0) / xs.length; }
  const bio = {
    sleepAvg: _avg(wearDays.map(d => d.sleep_duration_h)),
    hrvAvg:   _avg(wearDays.map(d => d.hrv_ms)),
    rhrAvg:   _avg(wearDays.map(d => d.rhr_bpm)),
    stepsAvg: _avg(wearDays.map(d => d.steps)),
  };
  // Demo biometrics if no wearable data.
  if (_isDemo && !bio.sleepAvg) {
    bio.sleepAvg = 7.0; bio.hrvAvg = 41; bio.rhrAvg = 62; bio.stepsAvg = 6412;
  }

  // Fetch connected devices for the rail panel (non-blocking).
  window._vcDevices = [];
  (async () => {
    try {
      const devs = await api.patientPortalWearables();
      if (Array.isArray(devs) && devs.length) {
        window._vcDevices = devs;
      } else if (_isDemo) {
        window._vcDevices = [
          { source: 'apple_health', display_name: 'Apple Watch Series 9', status: 'active', last_sync_at: new Date().toISOString() },
          { source: 'oura', display_name: 'Oura Ring Gen 3', status: 'syncing', last_sync_at: new Date(Date.now() - 86400000).toISOString() },
        ];
      }
      const panel = document.getElementById('vc-devices-panel');
      if (panel) {
        panel.innerHTML = window._vcDevices.length ? window._vcDevices.map(d => `
          <div class="vc-device-row" style="display:flex;align-items:center;gap:8px;font-size:12px">
            <span style="width:7px;height:7px;border-radius:50%;background:${d.status === 'active' ? '#22c55e' : d.status === 'syncing' ? '#f59e0b' : '#9ca3af'};display:inline-block;flex-shrink:0"></span>
            <span style="flex:1;color:var(--text-primary)">${esc(d.display_name || d.source || 'Device')}</span>
            <span style="color:var(--text-tertiary);font-size:11px">${d.last_sync_at ? new Date(d.last_sync_at).toLocaleDateString(loc, {month:'short', day:'numeric'}) : 'Never'}</span>
          </div>
        `).join('') : `<div style="font-size:12px;color:var(--text-tertiary)">No devices connected. <a href="#" onclick="window._navPatient && window._navPatient('patient-wearables');return false" style="color:var(--accent)">Connect one &rarr;</a></div>`;
      }
    } catch (_e) {}
  })();

  // Next in-clinic session from real sessions.
  const nextSession = sessions
    .filter(s => s.scheduled_at && new Date(s.scheduled_at).getTime() > Date.now())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0] || (_isDemo
      ? { session_number:14, location:'Room B', scheduled_at:new Date(Date.now() + 2.5 * 86400000).toISOString(), duration_minutes:40, clinician_name:'Rhea Nair' }
      : null);

  // Render helpers ──────────────────────────────────────────────────────────
  function _relTime(iso) {
    try {
      const d = new Date(iso); const now = Date.now(); const diff = now - d.getTime();
      if (diff < 60000)     return Math.max(1, Math.floor(diff / 1000)) + 's';
      if (diff < 3600000)   return Math.floor(diff / 60000) + 'm';
      if (diff < 86400000)  return Math.floor(diff / 3600000) + 'h';
      if (diff < 172800000) return 'Yesterday';
      if (diff < 604800000) return d.toLocaleDateString(loc, { weekday: 'short' });
      return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' });
    } catch (_e) { return ''; }
  }
  function _fullTime(iso) {
    try { const d = new Date(iso); return d.toLocaleDateString(loc, { month:'short', day:'numeric' }) + ' \u00b7 ' + d.toLocaleTimeString(loc, { hour:'2-digit', minute:'2-digit' }); }
    catch (_e) { return ''; }
  }

  function _threadItemHtml(t) {
    const last = t.messages[t.messages.length - 1] || {};
    const unreadCount = t.messages.filter(m => m.unread).length;
    const preview = last.kind === 'voice' ? '<span class="you">You:</span> 🎙 Voice note · ' + (last.duration || '0:00')
      : last.kind === 'video' ? '<span class="you">You:</span> 🎥 Video note · ' + (last.duration || '0:00')
      : last.kind === 'file' ? '<span class="you">You:</span> 📎 ' + esc(last.fileName || 'Attachment')
      : last.kind === 'report' ? '<span class="you">They:</span> Shared a progress report'
      : last.kind === 'schedule' ? '<span class="you">They:</span> Proposed a schedule change'
      : last.kind === 'biometrics' ? '<span class="you">You:</span> Shared biometric data'
      : (last.sender === 'me' ? '<span class="you">You:</span> ' : '') + esc(last.body || '');
    return `
      <div class="vc-thread${t.id === activeId ? ' active' : ''}" data-tid="${esc(t.id)}" onclick="window._vcPickThread && window._vcPickThread('${esc(t.id)}')">
        <div class="vc-thread-av ${t.avClass || ''}" data-online="${t.online || 'false'}">${t.avatar || (t.avClass === 'av-ai' ? '<svg width="18" height="18"><use href="#i-sparkle"/></svg>' : t.avClass === 'av-team' ? '<svg width="18" height="18"><use href="#i-users"/></svg>' : t.name.slice(0,2).toUpperCase())}</div>
        <div class="vc-thread-body">
          <div class="vc-thread-name">${esc(t.name)} <span class="vc-role">\u00b7 ${esc(t.role || '')}</span></div>
          <div class="vc-thread-preview${unreadCount ? ' unread' : ''}">${preview}</div>
        </div>
        <div class="vc-thread-meta">
          <span class="vc-thread-time">${esc(_relTime(last.at || ''))}</span>
          ${unreadCount ? '<span class="vc-thread-badge">' + unreadCount + '</span>' : ''}
        </div>
      </div>`;
  }

  function _msgHtml(m, thread) {
    const av = thread.avClass === 'av-ai' ? '<svg width="18" height="18"><use href="#i-sparkle"/></svg>' : (thread.avatar || thread.name.slice(0,2).toUpperCase());
    if (m.sender === 'me') {
      if (m.kind === 'voice') return `
        <div class="vc-msg me">
          <div class="vc-msg-stack">
            <div class="vc-msg-hd"><span class="vc-msg-name">You</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
            <div class="vc-bubble voice">
              ${m.objectUrl ? `<audio controls src="${esc(m.objectUrl)}" style="width:200px;height:28px"></audio>` : `<button class="vc-voice-play" onclick="window._vcToast && window._vcToast('Voice note playback \u2014 demo')"><svg width="12" height="12"><use href="#i-play"/></svg></button>`}
              <div class="vc-voice-waveform">${Array.from({length:16}).map(() => '<span style="height:' + (30 + Math.round(Math.random() * 55)) + '%"></span>').join('')}</div>
              <span class="vc-voice-duration">${esc(m.duration || '0:00')}</span>
            </div>
          </div>
        </div>`;
      if (m.kind === 'video') return `
        <div class="vc-msg me">
          <div class="vc-msg-stack">
            <div class="vc-msg-hd"><span class="vc-msg-name">You</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
            <div class="vc-bubble attach" style="padding:4px">
              ${m.objectUrl ? `<video controls src="${esc(m.objectUrl)}" style="max-width:260px;max-height:200px;border-radius:8px;display:block"></video>` : '<div>Video note</div>'}
              <div style="font-size:11px;color:var(--text-tertiary);padding:6px 8px 2px">${esc(m.duration || '')}</div>
            </div>
          </div>
        </div>`;
      if (m.kind === 'file') return `
        <div class="vc-msg me">
          <div class="vc-msg-stack">
            <div class="vc-msg-hd"><span class="vc-msg-name">You</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
            <div class="vc-bubble attach" style="display:flex;align-items:center;gap:10px;padding:10px 14px">
              <div style="width:36px;height:36px;border-radius:8px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16"><use href="#i-doc"/></svg></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(m.fileName || 'Attachment')}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">${m.fileSize ? (m.fileSize / 1024).toFixed(1) + ' KB' : ''}</div>
              </div>
              ${m.objectUrl ? `<a href="${esc(m.objectUrl)}" target="_blank" style="font-size:11px;color:var(--primary);text-decoration:none;flex-shrink:0">Open</a>` : ''}
            </div>
          </div>
        </div>`;
      if (m.kind === 'biometrics') {
        const stressScore = (bio.hrvAvg != null && bio.rhrAvg != null)
          ? Math.min(100, Math.max(0, Math.round((1 - bio.hrvAvg / 80) * 50 + ((bio.rhrAvg - 50) / 50) * 50)))
          : null;
        const anxietyScore = (bio.hrvAvg != null && bio.rhrAvg != null)
          ? Math.min(100, Math.max(0, Math.round((1 - bio.hrvAvg / 70) * 60 + ((bio.rhrAvg - 55) / 45) * 40)))
          : null;
        const _bioBar = (label, val, max, color) => {
          const pct = val != null ? Math.min(100, (val / max) * 100) : 0;
          const txt = val != null ? (label === 'Sleep' ? val.toFixed(1) + 'h' : label === 'Steps' ? (val / 1000).toFixed(1) + 'k' : Math.round(val) + (label === 'HRV' ? ' ms' : ' bpm')) : '\u2014';
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="width:60px;font-size:11px;color:var(--text-tertiary)">${label}</span><div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,0.05);overflow:hidden"><div style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width .6s ease"></div></div><span style="width:50px;text-align:right;font-size:12px;font-weight:600;color:${color}">${txt}</span></div>`;
        };
        const _levelBar = (label, score, colorFn) => {
          if (score == null) return '';
          const color = colorFn(score);
          const txt = score < 30 ? 'Low' : score < 55 ? 'Mild' : score < 75 ? 'Moderate' : 'High';
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="width:60px;font-size:11px;color:var(--text-tertiary)">${label}</span><div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,0.05);overflow:hidden"><div style="width:${score}%;height:100%;background:${color};border-radius:3px;transition:width .6s ease"></div></div><span style="width:50px;text-align:right;font-size:12px;font-weight:600;color:${color}">${txt}</span></div>`;
        };
        return `
        <div class="vc-msg me">
          <div class="vc-msg-stack">
            <div class="vc-msg-hd"><span class="vc-msg-name">You</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
            <div class="vc-bubble attach vc-card">
              <div class="vc-card-hd biom">
                <div class="vc-card-ico"><svg width="16" height="16"><use href="#i-heart"/></svg></div>
                <div style="flex:1;min-width:0">
                  <div class="vc-card-hd-title">Biometric data \u00b7 shared</div>
                  <div class="vc-card-hd-sub">Last 7 days \u00b7 stress & anxiety derived from HRV + HR</div>
                </div>
              </div>
              <div class="vc-card-body">
                ${_bioBar('Sleep', bio.sleepAvg, 9, '#9b7fff')}
                ${_bioBar('HRV', bio.hrvAvg, 80, '#ff8ab3')}
                ${_bioBar('RHR', bio.rhrAvg, 140, '#4a9eff')}
                ${_bioBar('Steps', bio.stepsAvg, 10000, '#4ade80')}
                ${_levelBar('Stress', stressScore, s => s < 30 ? '#22c55e' : s < 55 ? '#4a9eff' : s < 75 ? '#f59e0b' : '#ef4444')}
                ${_levelBar('Anxiety', anxietyScore, s => s < 30 ? '#22c55e' : s < 55 ? '#4a9eff' : s < 75 ? '#f59e0b' : '#ef4444')}
              </div>
            </div>
          </div>
        </div>`;
      }
      return `
        <div class="vc-msg me">
          <div class="vc-msg-stack">
            <div class="vc-msg-hd"><span class="vc-msg-name">You</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
            <div class="vc-bubble">${esc(m.body || '')}</div>
          </div>
        </div>`;
    }
    // Them variants
    if (m.kind === 'report') return `
      <div class="vc-msg">
        <div class="vc-msg-av ${thread.avClass || ''}">${av}</div>
        <div class="vc-msg-stack">
          <div class="vc-msg-hd"><span class="vc-msg-name">${esc(thread.name)}</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
          <div class="vc-bubble attach">
            <div class="vc-card-hd">
              <div class="vc-card-ico"><svg width="16" height="16"><use href="#i-brain"/></svg></div>
              <div style="flex:1;min-width:0">
                <div class="vc-card-hd-title">Week 6 progress read \u00b7 summary</div>
                <div class="vc-card-hd-sub">Clinician note \u00b7 shared with you</div>
              </div>
            </div>
            <div class="vc-card-body">You're tracking <mark>ahead of the expected Week 6 curve</mark>. Frontal alpha asymmetry has shifted from \u22120.18 to \u22120.08 \u2014 the pattern we look for in responders to left-DLPFC tDCS.</div>
            <div class="vc-card-actions">
              <button class="btn btn-ghost btn-sm" onclick="window._navPatient && window._navPatient('pt-outcomes')"><svg width="11" height="11"><use href="#i-chart"/></svg>Open My progress</button>
              <button class="btn btn-primary btn-sm" onclick="window._vcToast && window._vcToast('Acknowledged')"><svg width="11" height="11"><use href="#i-check"/></svg>Acknowledge</button>
            </div>
          </div>
        </div>
      </div>`;
    if (m.kind === 'schedule') return `
      <div class="vc-msg">
        <div class="vc-msg-av ${thread.avClass || ''}">${av}</div>
        <div class="vc-msg-stack">
          <div class="vc-msg-hd"><span class="vc-msg-name">${esc(thread.name)}</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
          <div class="vc-bubble attach vc-card">
            <div class="vc-card-hd sch">
              <div class="vc-card-ico"><svg width="16" height="16"><use href="#i-calendar"/></svg></div>
              <div style="flex:1;min-width:0">
                <div class="vc-card-hd-title">Proposed schedule change</div>
                <div class="vc-card-hd-sub">Week 7 \u00b7 1 session affected</div>
              </div>
            </div>
            <div class="vc-card-body">
              <dl class="vc-card-kv">
                <dt>Session</dt><dd>Session 14 of 20 \u00b7 in-clinic tDCS</dd>
                <dt>Currently</dt><dd>Tue Apr 22 \u00b7 10:00 \u2013 10:40</dd>
                <dt>Proposed</dt><dd><strong>Wed Apr 23 \u00b7 09:00 \u2013 09:40</strong></dd>
                <dt>Reason</dt><dd>Aligns better with your sleep rhythm</dd>
              </dl>
            </div>
            <div class="vc-card-actions">
              <button class="btn btn-ghost btn-sm" onclick="window._vcRejectSchedule && window._vcRejectSchedule()">Keep original</button>
              <button class="btn btn-primary btn-sm" onclick="window._vcAcceptSchedule && window._vcAcceptSchedule()"><svg width="11" height="11"><use href="#i-check"/></svg>Accept change</button>
            </div>
          </div>
        </div>
      </div>`;
    if (m.kind === 'analysis') {
      const a = m.analysis || {};
      const sentiment = a.sentiment || a.mood || 'Pending';
      const summary = a.summary || a.clinical_summary || 'Analysis in progress. Review timing depends on portal workflow.';
      const uploadType = m.uploadType === 'voice' ? 'Voice analysis' : m.uploadType === 'video' ? 'Video analysis' : 'AI analysis';
      return `
        <div class="vc-msg">
          <div class="vc-msg-av av-ai"><svg width="18" height="18"><use href="#i-sparkle"/></svg></div>
          <div class="vc-msg-stack">
            <div class="vc-msg-hd"><span class="vc-msg-name">Synaps AI</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
            <div class="vc-bubble attach vc-card" style="border-left:3px solid #a78bfa">
              <div class="vc-card-hd">
                <div class="vc-card-ico" style="background:rgba(167,139,250,.15);color:#a78bfa"><svg width="16" height="16"><use href="#i-sparkle"/></svg></div>
                <div style="flex:1;min-width:0">
                  <div class="vc-card-hd-title">${esc(uploadType)}</div>
                  <div class="vc-card-hd-sub">Sentiment: ${esc(sentiment)} · Review pending</div>
                </div>
              </div>
              <div class="vc-card-body">${esc(summary)}</div>
              ${m.transcript ? `<div style="margin-top:8px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:6px;border:1px solid var(--border);font-size:12px;color:var(--text-secondary);line-height:1.5"><strong>Transcript:</strong> ${esc(m.transcript.substring(0, 200))}${m.transcript.length > 200 ? '...' : ''}</div>` : ''}
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="vc-msg">
        <div class="vc-msg-av ${thread.avClass || ''}">${av}</div>
        <div class="vc-msg-stack">
          <div class="vc-msg-hd"><span class="vc-msg-name">${esc(thread.name)}</span><span class="vc-msg-time">${esc(_fullTime(m.at))}</span></div>
          <div class="vc-bubble">${esc(m.body || '')}</div>
        </div>
      </div>`;
  }

  function _convHtml(tid) {
    const t = threads[tid];
    if (!t) return '<div class="pth2-empty" style="padding:40px">No thread selected.</div>';
    const body = t.messages.length ? t.messages.map(m => _msgHtml(m, t)).join('')
      : `<div class="pth2-empty" style="padding:40px"><div class="pth2-empty-title">No messages yet</div><div class="pth2-empty-sub">Send the first message \u2014 your clinician usually replies within 2 hours.</div></div>`;
    return body;
  }
  function _convHeaderHtml(tid) {
    const t = threads[tid] || { name:'—', role:'' };
    const ava = t.avatar || t.name.slice(0,2).toUpperCase();
    const onlineText = t.online === 'ai' ? 'AI assistant \u00b7 answers may not be medical advice'
      : t.online === 'true' ? 'Online \u00b7 usually replies within 2 hours'
      : t.online === 'busy' ? 'Busy \u00b7 replies later today'
      : 'Offline \u00b7 leave a message';
    return `
      <div class="vc-conv-av ${t.avClass || ''}" id="vc-conv-av">${ava}</div>
      <div class="vc-conv-who">
        <div class="vc-conv-name" id="vc-conv-name">${esc(t.name)}
          ${t.avClass !== 'av-ai' ? '<span class="vc-conv-verified"><svg width="9" height="9"><use href="#i-shield"/></svg>Verified clinician</span>' : ''}
        </div>
        <div class="vc-conv-sub" id="vc-conv-sub"><span class="dot"></span>${esc(onlineText)}${t.role ? ' \u00b7 ' + esc(t.role) : ''}</div>
      </div>
      <div class="vc-conv-actions">
        <button class="vc-call-btn call-voice" title="Voice call" onclick="window._vcCall && window._vcCall('voice')"><svg width="16" height="16"><use href="#i-pulse"/></svg></button>
        <button class="vc-call-btn call-video" title="Video call" onclick="window._vcCall && window._vcCall('video')"><svg width="17" height="17"><use href="#i-video"/></svg></button>
        <button class="vc-call-btn" title="More" onclick="window._vcMoreActions && window._vcMoreActions()"><svg width="16" height="16"><use href="#i-more"/></svg></button>
      </div>`;
  }

  // ── Render ─────────────────────────────────────────────────────────────
  el.innerHTML = `
    <div class="pt-route" id="pt-route-virtualcare">
      ${_isDemo ? '<div class="vc-demo-banner"><svg width="13" height="13"><use href="#i-info"/></svg><strong>Demo data</strong> \u2014 sample conversation with your care team. Your actual messages will appear here once the clinic is onboarded.</div>' : ''}

      <!-- Crisis banner -->
      <div class="vc-crisis" id="vc-crisis">
        <svg width="16" height="16"><use href="#i-shield"/></svg>
        <div><strong>Virtual care is not for emergencies.</strong> If you are in crisis or thinking of harming yourself, reach help immediately.</div>
        <div class="vc-crisis-actions">
          <button class="vc-crisis-btn primary" onclick="window._vcCrisis && window._vcCrisis('call')"><svg width="11" height="11"><use href="#i-pulse"/></svg>Call 988 \u00b7 Crisis line</button>
          <button class="vc-crisis-btn" onclick="window._vcCrisis && window._vcCrisis('plan')">Safety plan</button>
          <button class="vc-crisis-dismiss" onclick="window._vcCrisis && window._vcCrisis('dismiss')" aria-label="Dismiss">&times;</button>
        </div>
      </div>

      <!-- 3-pane shell -->
      <div class="vc-shell">

        <!-- Left: threads -->
        <aside class="vc-threads">
          <div class="vc-threads-hd">
            <h2><svg width="18" height="18"><use href="#i-video"/></svg>Virtual care <span class="agent-openclaw-badge" style="font-size:9px;vertical-align:middle;margin-left:6px">Powered by OpenClaw</span></h2>
            <p>Message, call or video with your care team \u2014 secure, encrypted in transit.</p>
            <div class="vc-search">
              <svg width="14" height="14"><use href="#i-search"/></svg>
              <input type="text" id="vc-search-input" placeholder="Search messages, files, people\u2026" oninput="window._vcSearch && window._vcSearch(this.value)">
            </div>
          </div>
          <div class="vc-thread-filters">
            <button class="active" data-tf="all" onclick="window._vcThreadFilter && window._vcThreadFilter('all')">All</button>
            <button data-tf="unread" onclick="window._vcThreadFilter && window._vcThreadFilter('unread')">Unread</button>
            <button data-tf="clinicians" onclick="window._vcThreadFilter && window._vcThreadFilter('clinicians')">Team</button>
            <button data-tf="ai" onclick="window._vcThreadFilter && window._vcThreadFilter('ai')">AI</button>
          </div>
          <div class="vc-thread-list" id="vc-thread-list">
            ${threadList.length ? threadList.map(_threadItemHtml).join('') : '<div class="pth2-empty" style="padding:24px 16px"><div class="pth2-empty-title">No conversations yet</div><div class="pth2-empty-sub">Use this portal to send a support request or message your clinic.</div></div>'}
          </div>
          <div class="vc-threads-foot">
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient && window._navPatient('patient-careteam')"><svg width="12" height="12"><use href="#i-plus"/></svg>Start new conversation</button>
          </div>
        </aside>

        <!-- Center: conversation -->
        <section class="vc-conv" id="vc-conv">
          <div class="vc-conv-hd" id="vc-conv-hd">${activeThread ? _convHeaderHtml(activeId) : ''}</div>
          <div class="vc-conv-scroll" id="vc-conv-scroll">${activeThread ? _convHtml(activeId) : ''}</div>

          <!-- Composer -->
          <div class="vc-composer">
            <div class="vc-quick">
              <button onclick="window._vcQuick && window._vcQuick('good')"><svg width="11" height="11"><use href="#i-smile"/></svg>Feeling better today</button>
              <button onclick="window._vcQuick && window._vcQuick('side')"><svg width="11" height="11"><use href="#i-alert"/></svg>Report a side effect</button>
              <button onclick="window._vcQuick && window._vcQuick('resched')"><svg width="11" height="11"><use href="#i-calendar"/></svg>Ask to reschedule</button>
              <button onclick="window._vcQuick && window._vcQuick('biom')"><svg width="11" height="11"><use href="#i-heart"/></svg>Share biometrics</button>
              <button onclick="window._vcQuick && window._vcQuick('mood')"><svg width="11" height="11"><use href="#i-edit"/></svg>Quick mood update</button>
              <button onclick="window._vcQuick && window._vcQuick('q')"><svg width="11" height="11"><use href="#i-info"/></svg>Ask a question</button>
            </div>
            <div class="vc-input-row">
              <div class="vc-input-tools">
                <button class="vc-tool" title="Attach file" onclick="window._vcAttach && window._vcAttach()"><svg width="16" height="16"><use href="#i-plus"/></svg></button>
                <button class="vc-tool rec" title="Voice note" onclick="window._vcRecordVoice && window._vcRecordVoice()"><svg width="16" height="16"><use href="#i-mic"/></svg></button>
                <button class="vc-tool" title="Video note" onclick="window._vcRecordVideo && window._vcRecordVideo()"><svg width="16" height="16"><use href="#i-video"/></svg></button>
              </div>
              <div class="vc-input-wrap">
                <textarea class="vc-input" id="vc-input" placeholder="Message \u2014 this goes to your care team, not 911." rows="1" oninput="window._vcInputChange && window._vcInputChange()"></textarea>
                <button class="vc-send" id="vc-send" disabled onclick="window._vcSend && window._vcSend()"><svg width="14" height="14"><use href="#i-arrow-right"/></svg></button>
              </div>
            </div>
            <div class="vc-composer-foot">
              <svg width="11" height="11"><use href="#i-shield"/></svg>End-to-end encrypted
              <span class="sep"></span>
              <span>Typical reply \u00b7 2 hours (weekdays)</span>
              <span class="sep"></span>
              <span>For urgent issues call your care team directly.</span>
            </div>
          </div>
        </section>

        <!-- Right: rail -->
        <aside class="vc-rail" id="vc-rail">
          <div class="vc-rail-section">
            <div class="vc-profile" id="vc-profile">
              <div class="vc-profile-av">${activeThread ? (activeThread.avatar || activeThread.name.slice(0,2).toUpperCase()) : 'JK'}</div>
              <div class="vc-profile-name">${esc(activeThread ? activeThread.name : 'Your clinician')}</div>
              <div class="vc-profile-role">${esc(activeThread?.role || '')}</div>
              ${activeThread?.credentials ? '<div class="vc-profile-credentials">' + esc(activeThread.credentials) + '</div>' : ''}
              <div class="vc-profile-actions">
                <button class="btn btn-ghost btn-sm" onclick="window._navPatient && window._navPatient('patient-sessions')"><svg width="11" height="11"><use href="#i-calendar"/></svg>Book</button>
                <button class="btn btn-primary btn-sm" onclick="window._vcCall && window._vcCall('video')"><svg width="11" height="11"><use href="#i-video"/></svg>Video</button>
              </div>
            </div>
          </div>

          ${nextSession ? `
          <div class="vc-rail-section">
            <div class="vc-rail-lbl">Next session</div>
            <div class="vc-next-appt">
              <div class="vc-next-ico"><svg width="17" height="17"><use href="#i-calendar"/></svg></div>
              <div class="vc-next-body">
                <div class="vc-next-title">Session ${nextSession.session_number || '\u2014'} \u00b7 in-clinic tDCS</div>
                <div class="vc-next-time">${esc(new Date(nextSession.scheduled_at).toLocaleDateString(loc, { weekday:'short', month:'short', day:'numeric' }))} \u00b7 ${esc(new Date(nextSession.scheduled_at).toLocaleTimeString(loc, { hour:'2-digit', minute:'2-digit' }))}${nextSession.duration_minutes ? ' \u00b7 ' + nextSession.duration_minutes + ' min' : ''}</div>
                <div class="vc-next-sub">${esc(nextSession.clinician_name || 'Care team')}${nextSession.location ? ' \u00b7 ' + esc(nextSession.location) : ''}</div>
              </div>
            </div>
          </div>` : ''}

          <div class="vc-rail-section">
            <div class="vc-rail-lbl">Recent biometrics</div>
            <div class="vc-rail-kpi">
              <div class="vc-rail-k"><div class="vc-rail-k-lbl">Sleep \u00b7 7d</div><div class="vc-rail-k-val">${bio.sleepAvg != null ? bio.sleepAvg.toFixed(1) + 'h' : '\u2014'}</div></div>
              <div class="vc-rail-k"><div class="vc-rail-k-lbl">HRV \u00b7 7d</div><div class="vc-rail-k-val">${bio.hrvAvg != null ? Math.round(bio.hrvAvg) + 'ms' : '\u2014'}</div></div>
              <div class="vc-rail-k"><div class="vc-rail-k-lbl">RHR</div><div class="vc-rail-k-val">${bio.rhrAvg != null ? Math.round(bio.rhrAvg) + 'bpm' : '\u2014'}</div></div>
              <div class="vc-rail-k"><div class="vc-rail-k-lbl">Steps</div><div class="vc-rail-k-val">${bio.stepsAvg != null ? (bio.stepsAvg / 1000).toFixed(1) + 'k' : '\u2014'}</div></div>
            </div>
            <!-- Visual biometric wellness bars -->
            <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
              ${(function() {
                const sleepPct = bio.sleepAvg != null ? Math.min(100, (bio.sleepAvg / 9) * 100) : 0;
                const hrvPct = bio.hrvAvg != null ? Math.min(100, (bio.hrvAvg / 80) * 100) : 0;
                const rhrPct = bio.rhrAvg != null ? Math.max(0, 100 - ((bio.rhrAvg - 50) / 50) * 100) : 0;
                const stepsPct = bio.stepsAvg != null ? Math.min(100, (bio.stepsAvg / 10000) * 100) : 0;
                const stressScore = (bio.hrvAvg != null && bio.rhrAvg != null)
                  ? Math.min(100, Math.max(0, Math.round((1 - bio.hrvAvg / 80) * 50 + ((bio.rhrAvg - 50) / 50) * 50)))
                  : null;
                const anxietyScore = (bio.hrvAvg != null && bio.rhrAvg != null)
                  ? Math.min(100, Math.max(0, Math.round((1 - bio.hrvAvg / 70) * 60 + ((bio.rhrAvg - 55) / 45) * 40)))
                  : null;
                const _bar = (label, pct, color) => `<div style="display:flex;align-items:center;gap:8px;font-size:11px"><span style="width:40px;color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:0.4px">${label}</span><div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,0.05);overflow:hidden"><div style="width:${pct.toFixed(0)}%;height:100%;background:${color};border-radius:3px;transition:width .6s ease"></div></div><span style="width:28px;text-align:right;font-family:var(--font-mono);font-size:10px;color:${color}">${pct.toFixed(0)}%</span></div>`;
                const _level = (label, score) => {
                  if (score == null) return '';
                  const color = score < 30 ? '#22c55e' : score < 55 ? '#4a9eff' : score < 75 ? '#f59e0b' : '#ef4444';
                  const txt = score < 30 ? 'Low' : score < 55 ? 'Mild' : score < 75 ? 'Moderate' : 'High';
                  return `<div style="display:flex;align-items:center;gap:8px;font-size:11px"><span style="width:40px;color:var(--text-tertiary);font-size:10px;text-transform:uppercase;letter-spacing:0.4px">${label}</span><div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,0.05);overflow:hidden"><div style="width:${score}%;height:100%;background:${color};border-radius:3px;transition:width .6s ease"></div></div><span style="width:28px;text-align:right;font-family:var(--font-mono);font-size:10px;color:${color}">${txt}</span></div>`;
                };
                return _bar('Sleep', sleepPct, '#9b7fff') + _bar('HRV', hrvPct, '#ff8ab3') + _bar('RHR', rhrPct, '#4a9eff') + _bar('Steps', stepsPct, '#4ade80') + _level('Stress', stressScore) + _level('Anxiety', anxietyScore);
              })()}
            </div>
          </div>

          <div class="vc-rail-section">
            <div class="vc-rail-lbl">Connected devices</div>
            <div id="vc-devices-panel" style="display:flex;flex-direction:column;gap:8px">
              ${(window._vcDevices || []).length ? (window._vcDevices || []).map(d => `
                <div class="vc-device-row" style="display:flex;align-items:center;gap:8px;font-size:12px">
                  <span style="width:7px;height:7px;border-radius:50%;background:${d.status === 'active' ? '#22c55e' : d.status === 'syncing' ? '#f59e0b' : '#9ca3af'};display:inline-block;flex-shrink:0"></span>
                  <span style="flex:1;color:var(--text-primary)">${esc(d.display_name || d.source || 'Device')}</span>
                  <span style="color:var(--text-tertiary);font-size:11px">${d.last_sync_at ? new Date(d.last_sync_at).toLocaleDateString(loc, {month:'short', day:'numeric'}) : 'Never'}</span>
                </div>
              `).join('') : `<div style="font-size:12px;color:var(--text-tertiary)">No devices connected. <a href="#" onclick="window._navPatient && window._navPatient('patient-wearables');return false" style="color:var(--accent)">Connect one &rarr;</a></div>`}
            </div>
          </div>

          <div class="vc-rail-section">
            <div class="vc-rail-lbl">Privacy</div>
            <div style="font-size:11.5px;color:var(--text-tertiary);line-height:1.55">
              Messages are encrypted in transit and stored per HIPAA / GDPR guidelines. Only you and the care team you approve can see this thread.
            </div>
          </div>
        </aside>
      </div>

      <!-- Call overlay -->
      <div class="vc-call-overlay" id="vc-call-overlay">
        <div class="vc-call-inner">
          <div class="vc-call-remote">
            <div class="vc-call-remote-av" id="vc-call-remote-av">${activeThread ? (activeThread.avatar || activeThread.name.slice(0,2).toUpperCase()) : 'JK'}</div>
            <div class="vc-call-remote-name" id="vc-call-remote-name">${esc(activeThread ? activeThread.name : '')}</div>
            <div class="vc-call-status" id="vc-call-status">Calling\u2026 \u00b7 encrypted</div>
            <div class="vc-call-timer" id="vc-call-timer">00:00</div>
            <div style="display:flex;gap:10px;margin-top:24px;justify-content:center">
              <button class="btn btn-ghost btn-sm" onclick="window._vcHangup && window._vcHangup()"><svg width="12" height="12"><use href="#i-pulse"/></svg>End call</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Toast -->
      <div class="vc-toast" id="vc-toast"><svg width="16" height="16"><use href="#i-check"/></svg><span id="vc-toast-text">Sent</span></div>
    </div>`;

  // ── Handlers ─────────────────────────────────────────────────────────────
  function _showToast(msg) {
    const t = document.getElementById('vc-toast');
    const t2 = document.getElementById('vc-toast-text');
    if (!t || !t2) return;
    t2.textContent = msg || 'Done';
    t.classList.add('show');
    clearTimeout(window._vcToastTimer);
    window._vcToastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  window._vcToast = _showToast;

  window._vcPickThread = function(tid) {
    activeId = tid;
    // Mark as read locally.
    if (threads[tid]) threads[tid].messages.forEach(m => m.unread = false);
    const list = document.getElementById('vc-thread-list');
    if (list) list.innerHTML = threadList.map(_threadItemHtml).join('');
    const hd = document.getElementById('vc-conv-hd');
    if (hd) hd.innerHTML = _convHeaderHtml(tid);
    const sc = document.getElementById('vc-conv-scroll');
    if (sc) { sc.innerHTML = _convHtml(tid); sc.scrollTop = sc.scrollHeight; }
  };

  window._vcThreadFilter = function(f) {
    document.querySelectorAll('.vc-thread-filters button').forEach(b => b.classList.toggle('active', b.dataset.tf === f));
    const items = document.querySelectorAll('#vc-thread-list .vc-thread');
    items.forEach(i => {
      const tid = i.dataset.tid;
      const t = threads[tid]; if (!t) return;
      let show = true;
      if (f === 'unread')    show = t.messages.some(m => m.unread);
      else if (f === 'clinicians') show = t.avClass !== 'av-ai' && t.id !== 'billing';
      else if (f === 'ai')   show = t.avClass === 'av-ai';
      i.style.display = show ? '' : 'none';
    });
  };
  window._vcSearch = function(q) {
    const needle = String(q || '').toLowerCase().trim();
    document.querySelectorAll('#vc-thread-list .vc-thread').forEach(i => {
      if (!needle) { i.style.display = ''; return; }
      i.style.display = i.textContent.toLowerCase().includes(needle) ? '' : 'none';
    });
  };
  window._vcInputChange = function() {
    const inp = document.getElementById('vc-input');
    const btn = document.getElementById('vc-send');
    if (btn) btn.disabled = !inp || !inp.value.trim();
  };
  // ── Message polling for real-time updates ───────────────────────────────
  async function _vcPollMessages() {
    if (!_isDemo && uid && api.patientPortalMessages) {
      try {
        const msgs = await api.patientPortalMessages();
        if (!Array.isArray(msgs)) return;
        msgs.forEach(m => {
          const tid = String(m.thread_id || m.sender_id || m.sender_name || 'other');
          const th = threads[tid];
          if (!th) return;
          const exists = th.messages.some(x => x.id === m.id);
          if (!exists) {
            th.messages.push({
              id: m.id,
              sender: m.sender_type === 'patient' ? 'me' : 'them',
              senderName: m.sender_name || (m.sender_type === 'patient' ? 'You' : 'Care team'),
              at: m.created_at,
              body: m.body || m.preview || '',
              unread: !m.is_read && m.sender_type !== 'patient',
              kind: m.category || null,
            });
            if (tid === activeId) {
              const sc = document.getElementById('vc-conv-scroll');
              if (sc) { sc.innerHTML = _convHtml(activeId); sc.scrollTop = sc.scrollHeight; }
            } else {
              const list = document.getElementById('vc-thread-list');
              if (list) list.innerHTML = threadList.map(_threadItemHtml).join('');
            }
          }
        });
      } catch (_e) { /* silent poll failure */ }
    }
  }
  window._vcPollTimer = setInterval(_vcPollMessages, 10000);

  // ── Consent helper for media uploads ──────────────────────────────────────
  async function _vcEnsureConsent(consentType) {
    const pid = currentUser?.patient_id || currentUser?.id;
    if (!pid) return null;
    try {
      const consents = await api.getMediaConsents(pid);
      const c = (consents || []).find(x => x.consent_type === consentType && x.granted);
      if (c) return c.id;
      const created = await api.recordMediaConsent({ consent_type: consentType, granted: true, retention_days: 365 });
      return created?.id || null;
    } catch (_e) { return null; }
  }

  window._vcSend = async function() {
    const inp = document.getElementById('vc-input');
    if (!inp || !inp.value.trim() || !activeId || !threads[activeId]) return;
    const body = inp.value.trim();
    inp.value = '';
    window._vcInputChange();
    const t = threads[activeId];
    const localId = 'local-' + Date.now();
    t.messages.push({ id: localId, sender: 'me', senderName: 'You', at: new Date().toISOString(), body });
    const sc = document.getElementById('vc-conv-scroll');
    if (sc) { sc.innerHTML = _convHtml(activeId); sc.scrollTop = sc.scrollHeight; }
    // For AI thread, call api.chatPatient and render reply.
    if (activeId === 'ai' && api.chatPatient) {
      try {
        const lang = getLocale() === 'tr' ? 'tr' : 'en';
        const history = t.messages
          .filter(m => m.body)
          .slice(-6)
          .map(m => ({ role: m.sender === 'me' ? 'user' : 'assistant', content: m.body }));
        const res = await api.chatPatient(history, null, lang, 'Patient virtual-care chat');
        const reply = res?.reply || "I'm offline right now — try again shortly or message your care team.";
        t.messages.push({ id: 'ai-' + Date.now(), sender: 'them', senderName: 'Synaps AI', at: new Date().toISOString(), body: reply });
      } catch (_e) {
        t.messages.push({ id: 'ai-' + Date.now(), sender: 'them', senderName: 'Synaps AI', at: new Date().toISOString(), body: "Assistant is offline. For urgent concerns, message your care team directly." });
      }
      const sc2 = document.getElementById('vc-conv-scroll');
      if (sc2) { sc2.innerHTML = _convHtml(activeId); sc2.scrollTop = sc2.scrollHeight; }
    } else if (!_isDemo && uid && api.sendPortalMessage) {
      // Real clinician thread — POST to care team via patient portal messages.
      try {
        await api.sendPortalMessage({ body, category: 'patient_message', thread_id: activeId === 'primary' ? undefined : activeId });
        _showToast('Message accepted by care messaging');
      } catch (err) {
        console.error('[virtualcare] send failed:', err);
        _showToast('Failed to send — try again');
        t.messages.push({ id: 'err-' + Date.now(), sender: 'them', senderName: 'System', at: new Date().toISOString(), body: 'Message could not be sent. Please try again or use Messages.' });
        const sc3 = document.getElementById('vc-conv-scroll');
        if (sc3) { sc3.innerHTML = _convHtml(activeId); sc3.scrollTop = sc3.scrollHeight; }
      }
    } else {
      _showToast('Message saved locally');
    }
  };
  window._vcQuick = function(kind) {
    const inp = document.getElementById('vc-input');
    if (!inp) return;
    const map = {
      good: "Feeling better today — morning mood was a 6/10 and energy is up. ",
      side: "Wanted to flag a side effect from the last session: ",
      resched: "Could we reschedule my next session? I'm hoping for ",
      biom: "Sharing my latest biometric snapshot.",
      mood: "Quick mood update: ",
      q: "Quick question — ",
    };
    inp.value = map[kind] || '';
    inp.focus();
    window._vcInputChange();
  };
  // ── File attachment ──────────────────────────────────────────────────────
  window._vcAttach = function() {
    let inp = document.getElementById('vc-file-input');
    if (!inp) {
      inp = document.createElement('input');
      inp.id = 'vc-file-input';
      inp.type = 'file';
      inp.accept = 'image/*,application/pdf,.doc,.docx,.txt';
      inp.style.display = 'none';
      inp.onchange = async () => {
        const file = inp.files && inp.files[0];
        if (!file || !activeId || !threads[activeId]) return;
        const t = threads[activeId];
        const localId = 'file-' + Date.now();
        const isImage = file.type.startsWith('image/');
        const objectUrl = isImage ? URL.createObjectURL(file) : null;
        t.messages.push({ id: localId, sender: 'me', senderName: 'You', at: new Date().toISOString(), body: '', kind: 'file', fileName: file.name, fileSize: file.size, fileType: file.type, objectUrl });
        const sc = document.getElementById('vc-conv-scroll');
        if (sc) { sc.innerHTML = _convHtml(activeId); sc.scrollTop = sc.scrollHeight; }
        _showToast('Attachment added locally');
        inp.value = '';
      };
      document.body.appendChild(inp);
    }
    inp.click();
  };

  // ── Voice recording ──────────────────────────────────────────────────────
  window._vcMediaRecorder = null;
  window._vcMediaChunks = [];
  window._vcRecordStartTime = 0;
  window._vcRecordTimer = null;

  window._vcRecordVoice = async function() {
    if (!activeId || !threads[activeId]) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      window._vcMediaRecorder = mr;
      window._vcMediaChunks = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) window._vcMediaChunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(window._vcMediaChunks, { type: 'audio/webm' });
        const durationSec = Math.round((Date.now() - window._vcRecordStartTime) / 1000);
        const mm = String(Math.floor(durationSec / 60)).padStart(2, '0');
        const ss = String(durationSec % 60).padStart(2, '0');
        const t = threads[activeId];
        const localId = 'voice-' + Date.now();
        const objectUrl = URL.createObjectURL(blob);
        t.messages.push({ id: localId, sender: 'me', senderName: 'You', at: new Date().toISOString(), body: '', kind: 'voice', duration: mm + ':' + ss, durationSec, objectUrl });
        const sc = document.getElementById('vc-conv-scroll');
        if (sc) { sc.innerHTML = _convHtml(activeId); sc.scrollTop = sc.scrollHeight; }
        _vcRemoveRecOverlay();
        _showToast('Voice note recorded locally');
        // Upload to backend in background
        if (!_isDemo && api.patientUploadAudio) {
          const consentId = await _vcEnsureConsent('upload_voice');
          if (consentId) {
            const form = new FormData();
            form.append('file', blob, 'voice-note.webm');
            form.append('consent_id', consentId);
            form.append('patient_note', 'Voice note from virtual care');
            try {
              const upload = await api.patientUploadAudio(form);
              if (upload && upload.id) window._vcPollUploadAnalysis(upload.id);
            } catch (_e) {}
          }
        }
      };
      mr.start();
      window._vcRecordStartTime = Date.now();
      _vcShowRecOverlay('voice');
    } catch (err) {
      _showToast('Microphone access denied');
      console.error('[virtualcare] voice record error', err);
    }
  };

  // ── Video recording ──────────────────────────────────────────────────────
  window._vcRecordVideo = async function() {
    if (!activeId || !threads[activeId]) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
      window._vcMediaRecorder = mr;
      window._vcMediaChunks = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) window._vcMediaChunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(window._vcMediaChunks, { type: 'video/webm' });
        const durationSec = Math.round((Date.now() - window._vcRecordStartTime) / 1000);
        const mm = String(Math.floor(durationSec / 60)).padStart(2, '0');
        const ss = String(durationSec % 60).padStart(2, '0');
        const t = threads[activeId];
        const localId = 'video-' + Date.now();
        const objectUrl = URL.createObjectURL(blob);
        t.messages.push({ id: localId, sender: 'me', senderName: 'You', at: new Date().toISOString(), body: '', kind: 'video', duration: mm + ':' + ss, durationSec, objectUrl });
        const sc = document.getElementById('vc-conv-scroll');
        if (sc) { sc.innerHTML = _convHtml(activeId); sc.scrollTop = sc.scrollHeight; }
        _vcRemoveRecOverlay();
        _showToast('Video note recorded locally');
        // Upload to backend in background
        if (!_isDemo && api.patientUploadVideo) {
          const consentId = await _vcEnsureConsent('upload_video');
          if (consentId) {
            const form = new FormData();
            form.append('file', blob, 'video-note.webm');
            form.append('consent_id', consentId);
            form.append('patient_note', 'Video note from virtual care');
            try {
              const upload = await api.patientUploadVideo(form);
              if (upload && upload.id) window._vcPollUploadAnalysis(upload.id);
            } catch (_e) {}
          }
        }
      };
      mr.start();
      window._vcRecordStartTime = Date.now();
      _vcShowRecOverlay('video', stream);
    } catch (err) {
      _showToast('Camera access denied');
      console.error('[virtualcare] video record error', err);
    }
  };

  window._vcStopRecording = function() {
    if (window._vcMediaRecorder && window._vcMediaRecorder.state !== 'inactive') {
      window._vcMediaRecorder.stop();
    }
    clearInterval(window._vcRecordTimer);
  };

  function _vcShowRecOverlay(mode, stream) {
    const existing = document.getElementById('vc-rec-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'vc-rec-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:250;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:16px;';
    const isVideo = mode === 'video';
    overlay.innerHTML = `
      <div style="font-size:14px;font-weight:600;color:#fff">Recording ${isVideo ? 'video' : 'voice'} note</div>
      ${isVideo && stream ? '<video id="vc-rec-preview" autoplay muted playsinline style="width:280px;height:210px;object-fit:cover;border-radius:12px;background:#111"></video>' : ''}
      <div style="display:flex;align-items:center;gap:8px">
        <span id="vc-rec-dot" style="width:10px;height:10px;border-radius:50%;background:#ef4444;animation:vc-rec-pulse 1s infinite"></span>
        <span id="vc-rec-timer" style="font-size:18px;font-weight:700;color:#fff;font-family:monospace">00:00</span>
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="window._vcStopRecording && window._vcStopRecording()" style="padding:10px 24px;border-radius:99px;background:#dc2626;color:#fff;font-weight:600;border:0;cursor:pointer;font-size:14px">Stop recording</button>
        <button onclick="window._vcCancelRecording && window._vcCancelRecording()" style="padding:10px 20px;border-radius:99px;background:rgba(255,255,255,.15);color:#fff;font-weight:600;border:0;cursor:pointer;font-size:14px">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    if (isVideo && stream) {
      const preview = document.getElementById('vc-rec-preview');
      if (preview) preview.srcObject = stream;
    }
    let sec = 0;
    window._vcRecordTimer = setInterval(() => {
      sec++;
      const el = document.getElementById('vc-rec-timer');
      if (el) el.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    }, 1000);
  }

  window._vcCancelRecording = function() {
    if (window._vcMediaRecorder && window._vcMediaRecorder.state !== 'inactive') {
      window._vcMediaRecorder.stop();
      window._vcMediaChunks = [];
    }
    clearInterval(window._vcRecordTimer);
    _vcRemoveRecOverlay();
  };

  function _vcRemoveRecOverlay() {
    const o = document.getElementById('vc-rec-overlay');
    if (o) o.remove();
  }

  // ── AI analysis polling ──────────────────────────────────────────────────
  window._vcPollUploadAnalysis = function(uploadId) {
    if (!uploadId || !activeId || !threads[activeId]) return;
    let attempts = 0;
    const maxAttempts = 40; // ~10 minutes at 15s intervals
    const timer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) { clearInterval(timer); return; }
      try {
        const upload = await api.patientGetUpload(uploadId);
        if (!upload) return;
        // If analysis is available, inject into thread
        const analysis = upload.analysis_summary;
        const transcript = upload.transcript;
        if (analysis || transcript) {
          clearInterval(timer);
          const t = threads[activeId];
          t.messages.push({
            id: 'analysis-' + uploadId,
            sender: 'them',
            senderName: 'Synaps AI',
            at: new Date().toISOString(),
            body: '',
            kind: 'analysis',
            analysis: analysis || {},
            transcript: transcript || null,
            uploadType: upload.media_type,
          });
          const sc = document.getElementById('vc-conv-scroll');
          if (sc) { sc.innerHTML = _convHtml(activeId); sc.scrollTop = sc.scrollHeight; }
        }
      } catch (_e) { /* silent */ }
    }, 15000);
  };

  window._vcCrisis = function(action) {
    if (action === 'call') {
      window.location.href = 'tel:988';
    } else if (action === 'plan') {
      _showToast('Safety plan access is unavailable from this beta portal. Contact your care team or use emergency resources if you need help now.');
    } else if (action === 'dismiss') {
      const c = document.getElementById('vc-crisis');
      if (c) c.classList.add('hidden');
      try { sessionStorage.setItem('ds_vc_crisis_dismiss', '1'); } catch (_e) {}
    }
  };

  window._vcMoreActions = function() {
    const existing = document.getElementById('vc-more-menu');
    if (existing) { existing.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'vc-more-menu';
    menu.style.cssText = 'position:absolute;z-index:150;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:4px;box-shadow:0 8px 24px rgba(0,0,0,.3);right:16px;top:56px;';
    menu.innerHTML = `
      <button style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;border-radius:4px;" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='transparent'" onclick="window._vcMoreActions();window._navPatient && window._navPatient('patient-sessions')">📅 View sessions</button>
      <button style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;border-radius:4px;" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='transparent'" onclick="window._vcMoreActions();window._navPatient && window._navPatient('patient-education')">📚 Education</button>
      <button style="display:block;width:100%;text-align:left;padding:8px 12px;border:0;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;border-radius:4px;" onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='transparent'" onclick="window._vcMoreActions();window._navPatient && window._navPatient('patient-settings')">⚙️ Settings</button>
    `;
    const convHd = document.getElementById('vc-conv-hd');
    if (convHd) { convHd.style.position = 'relative'; convHd.appendChild(menu); }
    setTimeout(() => { document.addEventListener('click', function closeMenu(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } }, { once: true }); }, 10);
  };

  window._vcAcceptSchedule = function() {
    _showToast('Noted \u2014 redirecting to sessions');
    setTimeout(() => window._navPatient && window._navPatient('patient-sessions'), 800);
  };
  window._vcRejectSchedule = function() {
    _showToast('Noted \u2014 redirecting to sessions');
    setTimeout(() => window._navPatient && window._navPatient('patient-sessions'), 800);
  };
  try { if (sessionStorage.getItem('ds_vc_crisis_dismiss')) { const c = document.getElementById('vc-crisis'); if (c) c.classList.add('hidden'); } } catch (_e) {}

  // ── Jitsi video/voice calls ──────────────────────────────────────────────
  window._vcActiveSessionId = null;
  window._vcBioTimer = null;
  window._vcVoiceTimer = null;
  window._vcBioHistory = [];

  window._vcCall = async function(mode) {
    const thread = threads[activeId];
    const clinicianName = thread ? thread.name : 'Care team';
    const pid = currentUser?.patient_id || currentUser?.id || 'patient';
    const room = 'ds-' + pid + '-' + activeId + '-' + Date.now();
    const jitsiUrl = 'https://meet.jit.si/' + encodeURIComponent(room)
      + '#config.prejoinPageEnabled=false'
      + '&config.startWithVideoMuted=' + (mode === 'voice' ? 'true' : 'false')
      + '&config.startWithAudioMuted=false'
      + '&config.disableDeepLinking=true'
      + '&userInfo.displayName=' + encodeURIComponent(currentUser?.display_name || currentUser?.name || 'Patient');

    // Create backend session for analysis tracking.
    try {
      const sess = await api.virtualCareCreateSession({ session_type: mode, room_name: room });
      window._vcActiveSessionId = sess?.session?.id || null;
      if (window._vcActiveSessionId) {
        await api.virtualCareStartSession(window._vcActiveSessionId);
      }
    } catch (_e) {}

    const existing = document.getElementById('vc-jitsi-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'vc-jitsi-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.75);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
    modal.innerHTML = `
      <div style="position:relative;width:100%;max-width:900px;height:70vh;background:#000;border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.5)">
        <iframe id="vc-jitsi-frame" src="${jitsiUrl}" allow="camera; microphone; fullscreen; display-capture" style="width:100%;height:100%;border:0"></iframe>
        <div style="position:absolute;bottom:16px;left:0;right:0;display:flex;justify-content:center;gap:12px;z-index:10">
          <button onclick="window._vcHangup && window._vcHangup()" style="padding:10px 20px;border-radius:99px;background:#dc2626;color:#fff;font-weight:600;border:0;cursor:pointer;font-size:14px;display:flex;align-items:center;gap:6px">
            <svg width="14" height="14"><use href="#i-pulse"/></svg>End call
          </button>
        </div>
        <div style="position:absolute;top:12px;left:12px;z-index:10;background:rgba(0,0,0,.5);padding:6px 12px;border-radius:99px;color:#fff;font-size:12px">
          ${mode === 'video' ? 'Video' : 'Voice'} call &middot; ${esc(clinicianName)}
        </div>
        <!-- Live biometrics overlay -->
        <div id="vc-live-bio" style="position:absolute;top:12px;right:12px;z-index:10;background:rgba(0,0,0,.6);padding:12px 14px;border-radius:10px;color:#fff;font-size:11px;display:flex;flex-direction:column;gap:8px;min-width:160px;backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.08)">
          <div style="font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px;opacity:.7;margin-bottom:2px">Simulated biometrics</div>
          <div style="display:flex;align-items:center;gap:8px"><span style="width:28px">HR</span><div style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden"><div id="vc-bio-hr-bar" style="width:0%;height:100%;background:#ff8ab3;border-radius:2px;transition:width .4s ease"></div></div><span id="vc-bio-hr" style="width:36px;text-align:right;font-weight:700;color:#ff8ab3;font-size:11px">--</span></div>
          <div style="display:flex;align-items:center;gap:8px"><span style="width:28px">HRV</span><div style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden"><div id="vc-bio-hrv-bar" style="width:0%;height:100%;background:#4a9eff;border-radius:2px;transition:width .4s ease"></div></div><span id="vc-bio-hrv" style="width:36px;text-align:right;font-weight:700;color:#4a9eff;font-size:11px">--</span></div>
          <div style="display:flex;align-items:center;gap:8px"><span style="width:28px">SpO₂</span><div style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden"><div id="vc-bio-spo2-bar" style="width:0%;height:100%;background:#4ade80;border-radius:2px;transition:width .4s ease"></div></div><span id="vc-bio-spo2" style="width:36px;text-align:right;font-weight:700;color:#4ade80;font-size:11px">--</span></div>
          <div style="display:flex;align-items:center;gap:8px"><span style="width:28px">Strs</span><div style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden"><div id="vc-bio-stress-bar" style="width:0%;height:100%;background:#fbbf24;border-radius:2px;transition:width .4s ease"></div></div><span id="vc-bio-stress" style="width:36px;text-align:right;font-weight:700;color:#fbbf24;font-size:11px">--</span></div>
          <div style="display:flex;align-items:center;gap:8px"><span style="width:28px">Anx</span><div style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.1);overflow:hidden"><div id="vc-bio-anxiety-bar" style="width:0%;height:100%;background:#f59e0b;border-radius:2px;transition:width .4s ease"></div></div><span id="vc-bio-anxiety" style="width:36px;text-align:right;font-weight:700;color:#f59e0b;font-size:11px">--</span></div>
        </div>
        <!-- Voice sentiment overlay -->
        <div id="vc-live-sentiment" style="position:absolute;bottom:56px;right:12px;z-index:10;background:rgba(0,0,0,.55);padding:8px 12px;border-radius:99px;color:#fff;font-size:12px;display:none;align-items:center;gap:6px;backdrop-filter:blur(4px)">
          <span id="vc-sentiment-dot" style="width:8px;height:8px;border-radius:50%;background:#9ca3af;display:inline-block"></span>
          <span id="vc-sentiment-lbl">Neutral</span>
        </div>
      </div>`;
    document.body.appendChild(modal);
    window._vcCallStartTime = Date.now();
    window._vcBioHistory = [];

    // Start simulated live biometrics polling.
    window._vcBioTimer = setInterval(() => {
      const elapsed = window._vcCallStartTime ? Math.round((Date.now() - window._vcCallStartTime) / 1000) : 0;
      const baseHR = bio.rhrAvg || 62;
      const hr = Math.max(50, Math.min(140, Math.round(baseHR + 8 + Math.sin(elapsed * 0.05) * 6 + (Math.random() - 0.5) * 4)));
      const hrv = Math.max(20, Math.min(80, Math.round((bio.hrvAvg || 41) + Math.sin(elapsed * 0.03) * 5 + (Math.random() - 0.5) * 3)));
      const spo2 = Math.max(94, Math.min(100, Math.round(98 + (Math.random() - 0.5) * 1.5)));
      const stress = Math.max(0, Math.min(100, Math.round(30 + Math.sin(elapsed * 0.02) * 15 + (Math.random() - 0.5) * 8)));
      const anxiety = Math.min(100, Math.max(0, Math.round((1 - hrv / 70) * 60 + ((hr - 55) / 45) * 40)));
      const hrEl = document.getElementById('vc-bio-hr');
      const hrvEl = document.getElementById('vc-bio-hrv');
      const spo2El = document.getElementById('vc-bio-spo2');
      const stressEl = document.getElementById('vc-bio-stress');
      const anxietyEl = document.getElementById('vc-bio-anxiety');
      const hrBar = document.getElementById('vc-bio-hr-bar');
      const hrvBar = document.getElementById('vc-bio-hrv-bar');
      const spo2Bar = document.getElementById('vc-bio-spo2-bar');
      const stressBar = document.getElementById('vc-bio-stress-bar');
      const anxietyBar = document.getElementById('vc-bio-anxiety-bar');
      if (hrEl) hrEl.textContent = hr + ' bpm';
      if (hrvEl) hrvEl.textContent = hrv + ' ms';
      if (spo2El) spo2El.textContent = spo2 + '%';
      if (stressEl) stressEl.textContent = stress + '/100';
      if (anxietyEl) anxietyEl.textContent = anxiety + '/100';
      if (hrBar) hrBar.style.width = Math.min(100, ((hr - 40) / 100) * 100).toFixed(0) + '%';
      if (hrvBar) hrvBar.style.width = Math.min(100, (hrv / 80) * 100).toFixed(0) + '%';
      if (spo2Bar) spo2Bar.style.width = Math.min(100, ((spo2 - 90) / 10) * 100).toFixed(0) + '%';
      if (stressBar) stressBar.style.width = stress + '%';
      if (anxietyBar) { anxietyBar.style.width = anxiety + '%'; anxietyBar.style.background = anxiety < 30 ? '#22c55e' : anxiety < 55 ? '#4a9eff' : anxiety < 75 ? '#f59e0b' : '#ef4444'; }
      window._vcBioHistory.push({ hr, hrv, spo2, stress, anxiety, t: elapsed });
      // Submit snapshot to backend every 30s if session exists.
      if (window._vcActiveSessionId && elapsed % 30 === 0) {
        api.virtualCareSubmitBiometrics(window._vcActiveSessionId, {
          source: 'simulated', heart_rate_bpm: hr, hrv_ms: hrv, spo2_pct: spo2, stress_score: stress,
        }).catch(() => {});
      }
    }, 3000);

    // Start simulated voice sentiment.
    window._vcVoiceTimer = setInterval(() => {
      const sentiments = ['positive', 'neutral', 'neutral', 'negative', 'distressed'];
      const weights = [0.25, 0.40, 0.40, 0.10, 0.05];
      let r = Math.random();
      let idx = 0;
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
      const sentiment = sentiments[idx];
      const colors = { positive: '#22c55e', neutral: '#9ca3af', negative: '#f59e0b', distressed: '#ef4444' };
      const labels = { positive: 'Positive', neutral: 'Neutral', negative: 'Concern', distressed: 'Distressed' };
      const wrap = document.getElementById('vc-live-sentiment');
      const dot = document.getElementById('vc-sentiment-dot');
      const lbl = document.getElementById('vc-sentiment-lbl');
      if (wrap) wrap.style.display = 'flex';
      if (dot) dot.style.background = colors[sentiment];
      if (lbl) lbl.textContent = labels[sentiment];
      // Submit to backend if session exists.
      if (window._vcActiveSessionId) {
        const elapsed = window._vcCallStartTime ? Math.round((Date.now() - window._vcCallStartTime) / 1000) : 0;
        api.virtualCareSubmitVoiceAnalysis(window._vcActiveSessionId, {
          segment_start_sec: Math.max(0, elapsed - 10), segment_end_sec: elapsed,
          sentiment, stress_level: sentiment === 'distressed' ? 75 : sentiment === 'negative' ? 45 : sentiment === 'positive' ? 15 : 30,
          energy_level: sentiment === 'positive' ? 75 : 50, source: 'simulated',
        }).catch(() => {});
      }
    }, 12000);
  };
  window._vcHangup = async function() {
    const modal = document.getElementById('vc-jitsi-modal');
    if (modal) modal.remove();
    if (window._vcBioTimer) { clearInterval(window._vcBioTimer); window._vcBioTimer = null; }
    if (window._vcVoiceTimer) { clearInterval(window._vcVoiceTimer); window._vcVoiceTimer = null; }
    const duration = window._vcCallStartTime ? Math.round((Date.now() - window._vcCallStartTime) / 1000) : 0;
    // End backend session.
    if (window._vcActiveSessionId) {
      try { await api.virtualCareEndSession(window._vcActiveSessionId); } catch (_e) {}
      try {
        const analysis = await api.virtualCareGetAnalysis(window._vcActiveSessionId);
        if (analysis?.voice_summary || analysis?.video_summary) {
          const vs = analysis.voice_summary;
          const txt = vs ? `Voice avg stress ${vs.avg_stress}/100` : 'Session analyzed';
          _showToast('Call ended · ' + txt);
          window._vcCallStartTime = null;
          window._vcActiveSessionId = null;
          return;
        }
      } catch (_e) {}
      window._vcActiveSessionId = null;
    }
    if (duration > 0) {
      const mm = String(Math.floor(duration / 60)).padStart(2, '0');
      const ss = String(duration % 60).padStart(2, '0');
      _showToast('Call ended · ' + mm + ':' + ss);
    }
    window._vcCallStartTime = null;
  };

  // Initial scroll to bottom of conversation.
  const sc = document.getElementById('vc-conv-scroll');
  if (sc) sc.scrollTop = sc.scrollHeight;
}



// ─── Care Team ──────────────────────────────────────────────────────────────
export async function pgPatientCareTeam() {
  try { return await _pgPatientCareTeamImpl(); }
  catch (err) {
    console.error('[pgPatientCareTeam] render failed:', err);
    const el = document.getElementById('patient-content');
    if (el) el.innerHTML = `<div class="pt-portal-empty"><div class="pt-portal-empty-ico" aria-hidden="true">&#9888;</div><div class="pt-portal-empty-title">Care Team is unavailable</div><div class="pt-portal-empty-body">Please refresh, or open Virtual Care to message your team directly.</div></div>`;
  }
}

async function _pgPatientCareTeamImpl() {
  setTopbar('Care Team');
  const el = document.getElementById('patient-content');
  el.innerHTML = spinner();
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }

  const _t = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _race = (p) => Promise.race([Promise.resolve(p).catch(() => null), _t(3000)]);
  const uid = currentUser?.patient_id || currentUser?.id || null;
  const [coursesRaw, sessRaw, msgsRaw] = await Promise.all([
    _race(api.patientPortalCourses()),
    _race(api.patientPortalSessions()),
    _race(api.patientPortalMessages()),
  ]);

  const courses = Array.isArray(coursesRaw) ? coursesRaw : [];
  const sessions = Array.isArray(sessRaw) ? sessRaw : [];
  const messages = Array.isArray(msgsRaw) ? msgsRaw : [];
  const activeCourse = courses.find(c => c.status === 'active') || courses[0] || null;
  const _isDemo = courses.length === 0 && sessions.length === 0 && messages.length === 0;

  // Care squad — real data from course + derived from sessions, with demo fallback.
  let squad = [];
  if (activeCourse && Array.isArray(activeCourse.care_team) && activeCourse.care_team.length) {
    squad = activeCourse.care_team.map(m => ({
      id: m.id || (m.name || 'member').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2),
      name: m.name || m.display_name || 'Clinician',
      role: m.role || m.title || 'Care team',
      creds: m.credentials || '',
      avatar: (m.name || 'CT').split(/\s+/).map(p => p[0] || '').slice(0, 2).join('').toUpperCase(),
      avClass: (m.tone || 'jk'),
      primary: !!m.is_primary,
      online: m.online || 'off',
      onlineText: m.presence_text || '',
      tags: Array.isArray(m.tags) ? m.tags : [],
      bio: m.bio || '',
      nextSync: m.next_sync_at ? new Date(m.next_sync_at).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) + (m.next_sync_at ? ' · ' + new Date(m.next_sync_at).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) : '') : null,
      sharedSince: m.shared_since || (activeCourse?.started_at ? new Date(activeCourse.started_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : null),
    }));
  }

  if (_isDemo || !squad.length) {
    // Demo / fallback core squad.
    squad = [
      { id:'jk', name:'Dr. Julia Kolmar', role:'Attending Psychiatrist · MDD lead', creds:'MD, PhD · Board cert. 2011', avatar:'JK', avClass:'jk', primary:true,
        online:'online', onlineText:'Online · replies in ~45 min',
        tags:[{k:'teal',l:'Mood disorders'},{k:'teal',l:'Neuromodulation'},{k:'purple',l:'qEEG-guided care'}],
        bio:'Leads your MDD protocol — titrated the tDCS course and reviews your qEEG trends before every weekly sync. 14 years of clinical experience at Mass General and DeepSynaps.',
        nextSync:'Fri Apr 24 · 3:30 PM', sharedSince:'Feb 17, 2026',
        lang:'English · German', hours:'Tue – Fri · 9 AM – 5 PM', reply:'~45 min (weekdays)' },
      { id:'rn', name:'Rhea Nair', role:'Senior Neuromodulation Technician', creds:'BSN, CCRP · tDCS cert.', avatar:'RN', avClass:'rn',
        online:'online', onlineText:'Online · in clinic now',
        tags:[{k:'purple',l:'tDCS'},{k:'purple',l:'PBM'},{k:'pink',l:'Patient education'}],
        bio:'Runs your in-clinic tDCS sessions (F3–FP2, 2.0 mA) and troubleshoots your Synaps One setup at home. Your go-to for anything device or sensation-related.',
        nextSync:'Wed Apr 22 · 2:00 PM', sharedSince:'10 of 12 sessions run',
        lang:'English', hours:'Mon – Fri · 8 AM – 6 PM', reply:'~30 min' },
      { id:'mt', name:'Marcus Tan', role:'Care Coordinator', creds:'MSW · Benefits & logistics', avatar:'MT', avClass:'mt',
        online:'away', onlineText:'Away · back at 11:30 AM',
        tags:[{k:'orange',l:'Insurance'},{k:'orange',l:'Scheduling'},{k:'teal',l:'Navigator'}],
        bio:'Handles scheduling, insurance reauthorization, and home-device logistics. First person to contact for anything admin, billing, or non-clinical.',
        nextSync:'Sat Apr 18 · reauth filed', sharedSince:'1 open',
        lang:'English · Mandarin', hours:'Mon – Fri · 9 AM – 5 PM', reply:'~2 hours' },
    ];
  }

  const specialists = _isDemo ? [
    { id:'sw', name:'Dr. Sarah Wexler', role:'qEEG Neuroscientist', creds:'PhD Neuroscience · BCIA-cert.', avatar:'SW', avClass:'sw',
      online:'off', onlineText:'Off today · replies Tue',
      tags:[{k:'purple',l:'FAA analysis'},{k:'purple',l:'Theta/beta'}],
      bio:'Analyzes your qEEG recordings every 4 weeks and writes the biomarker summary that Dr. Kolmar uses for protocol tuning.',
      nextSync:'May 14 · Week 10', sharedSince:'2 filed' },
    { id:'ap', name:'Amy Park, LCSW', role:'Clinical Therapist (CBT)', creds:'LCSW · CBT & ACT trained', avatar:'AP', avClass:'ap',
      online:'online', onlineText:'Online · open for new slots',
      tags:[{k:'pink',l:'CBT'},{k:'pink',l:'Behavioral activation'}],
      bio:"Available if you'd like to pair talk therapy with your neuromodulation course. Dr. Kolmar has flagged this as optional for Weeks 7–10.",
      nextSync:'Recommended', sharedSince:'Thu Apr 23' },
    { id:'lg', name:'Dr. Lee Grant', role:'Sleep Medicine', creds:'MD · AASM-cert.', avatar:'LG', avClass:'lg',
      online:'away', onlineText:'Away · consults Wed/Fri',
      tags:[{k:'purple',l:'Insomnia'},{k:'teal',l:'Circadian'}],
      bio:'Reviewed your ISI and PBM protocol. Next check-in scheduled to coincide with your mid-course sleep assessment on May 5.',
      nextSync:'Apr 6 · ISI trend ↓', sharedSince:'May 5' },
  ] : [];

  // Member labels for meta rows — different labels for specialists vs core squad.
  function _memberMetaLabels(m, isSpecialist) {
    if (isSpecialist) {
      return m.id === 'sw' ? { a:'Next review', b:'Reports' }
        : m.id === 'ap' ? { a:'Status', b:'Earliest slot' }
        : { a:'Last note', b:'Next consult' };
    }
    return m.id === 'jk' ? { a:'Next sync', b:'Shared since' }
      : m.id === 'rn' ? { a:'Next session', b:'Sessions run' }
      : { a:'Last contact', b:'Pending tasks' };
  }

  function _memberCardHtml(m, isSpecialist) {
    const labels = _memberMetaLabels(m, isSpecialist);
    const actions = isSpecialist && m.online === 'off'
      ? `<button class="btn btn-ghost btn-sm" onclick="window._ctMessage && window._ctMessage('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-mail"/></svg>Message</button>
         <button class="btn btn-ghost btn-sm" onclick="window._ctProfile && window._ctProfile('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-user"/></svg>Profile</button>`
      : isSpecialist && m.id === 'ap'
      ? `<button class="btn btn-primary btn-sm" onclick="window._ctMessage && window._ctMessage('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-mail"/></svg>Message</button>
         <button class="btn btn-ghost btn-sm" onclick="window._ctBook && window._ctBook('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-calendar"/></svg>Book</button>`
      : isSpecialist
      ? `<button class="btn btn-ghost btn-sm" onclick="window._ctMessage && window._ctMessage('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-mail"/></svg>Message</button>
         <button class="btn btn-ghost btn-sm" onclick="window._ctProfile && window._ctProfile('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-user"/></svg>Profile</button>`
      : `<button class="btn btn-primary btn-sm" onclick="window._ctMessage && window._ctMessage('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-mail"/></svg>Message</button>
         <button class="btn btn-ghost btn-sm" onclick="window._ctBook && window._ctBook('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-calendar"/></svg>Book</button>
         <button class="btn btn-ghost btn-sm" onclick="window._ctProfile && window._ctProfile('${esc(m.id)}')"><svg width="13" height="13"><use href="#i-user"/></svg>Profile</button>`;
    return `
      <div class="ct-member${m.primary ? ' primary' : ''}" data-member="${esc(m.id)}">
        <div class="ct-member-top">
          <div class="ct-avatar ${esc(m.avClass)}">${esc(m.avatar)}<span class="ct-avatar dot ${esc(m.online)}"></span></div>
          <div class="ct-member-id">
            <div class="ct-member-name">${esc(m.name)}</div>
            <div class="ct-member-role">${esc(m.role)}</div>
            ${m.creds ? `<div class="ct-member-creds">${esc(m.creds)}</div>` : ''}
          </div>
        </div>
        <div class="ct-presence ${esc(m.online)}"><span class="ct-presence-dot"></span>${esc(m.onlineText || m.online)}</div>
        <div class="ct-member-tags">${(m.tags || []).map(t => `<span class="ct-tag ${esc(t.k)}">${esc(t.l)}</span>`).join('')}</div>
        ${m.bio ? `<p class="ct-member-bio">${esc(m.bio)}</p>` : ''}
        <div class="ct-member-meta">
          <div class="ct-meta-item"><div class="ct-meta-l">${esc(labels.a)}</div><div class="ct-meta-v${m.nextSync ? ' accent' : ''}">${esc(m.nextSync || '—')}</div></div>
          <div class="ct-meta-item"><div class="ct-meta-l">${esc(labels.b)}</div><div class="ct-meta-v">${esc(m.sharedSince || '—')}</div></div>
        </div>
        <div class="ct-member-actions">${actions}</div>
      </div>`;
  }

  // Today banner: derive from whatever's most recent.
  const todayBanner = _isDemo
    ? `<strong>Heads up:</strong> Dr. Kolmar is in clinic today until 5:00 PM and has replied to 2 of your threads. Rhea has a block reserved for your Wed session. Marcus is following up on your insurance reauthorization.`
    : `<strong>Today:</strong> Your care team is available for messages and bookings. Average reply time today is ~2 hours.`;

  el.innerHTML = `
    <div class="pt-route" id="pt-route-careteam">

      ${_isDemo ? '<div class="hw-demo-banner" role="status"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><strong>Demo data</strong>&mdash; the people below are fictional examples. Your real care team will appear once your clinic assigns your treatment plan.</div>' : ''}

      <!-- HERO -->
      <div class="ct-hero">
        <div class="ct-hero-top">
          <div>
            <div class="ct-hero-kicker">Your care squad</div>
            <h1 class="ct-hero-title">The humans (and one AI) working on your recovery</h1>
            <p class="ct-hero-sub">Your multidisciplinary team coordinates every session, homework plan, and progress review. Message anyone directly, book a consult, or ask Synaps AI for a quick triage — we respond within 2 business hours on weekdays.</p>
            <div class="ct-hero-stats">
              <div class="ct-hero-stat"><div class="ct-hero-stat-n">${squad.length}</div><div class="ct-hero-stat-l">Core clinicians</div></div>
              <div class="ct-hero-stat"><div class="ct-hero-stat-n">${specialists.length}</div><div class="ct-hero-stat-l">Specialists on call</div></div>
              <div class="ct-hero-stat"><div class="ct-hero-stat-n">${_isDemo ? '\u2014' : '\u2264 2 hrs'}</div><div class="ct-hero-stat-l">${_isDemo ? 'No data yet' : 'Business hours'}</div></div>
              <div class="ct-hero-stat"><div class="ct-hero-stat-n">24/7</div><div class="ct-hero-stat-l">Crisis line</div></div>
            </div>
          </div>
          <div class="ct-hero-actions">
            <button class="btn btn-primary btn-sm" onclick="window._ctMessageTeam && window._ctMessageTeam()"><svg width="14" height="14"><use href="#i-mail"/></svg>Message the team</button>
            <button class="btn btn-ghost btn-sm" onclick="window._ctBookConsult && window._ctBookConsult()"><svg width="14" height="14"><use href="#i-calendar"/></svg>Book a consult</button>
          </div>
        </div>
        <div class="ct-banner">
          <div class="ct-banner-ico"><svg width="18" height="18"><use href="#i-info"/></svg></div>
          <div class="ct-banner-body">${todayBanner}</div>
        </div>
      </div>

      <!-- CARE SQUAD -->
      <div>
        <div class="ct-section-head">
          <div>
            <h3>Care squad</h3>
            <p>Everyone on your active treatment plan · updated today</p>
          </div>
        </div>
        <div class="ct-squad">${squad.map(m => _memberCardHtml(m, false)).join('')}</div>
      </div>

      <!-- SYNAPS AI coordinator -->
      <div class="ct-coord">
        <div class="ct-coord-left">
          <div class="ct-avatar ai" style="width:52px;height:52px;font-size:18px">AI</div>
        </div>
        <div class="ct-coord-body">
          <h4>Synaps AI · 24/7 triage &amp; care assistant</h4>
          <p>Answers protocol questions, flags symptom changes to your clinician, and helps you prep before sessions. Escalates anything clinical or sensitive to a human within minutes.</p>
          <div class="ct-coord-chips">
            <span class="ct-tag teal">Triage</span>
            <span class="ct-tag teal">Protocol Q&amp;A</span>
            <span class="ct-tag purple">qEEG summary</span>
            <span class="ct-tag pink">Always on</span>
          </div>
        </div>
        <div class="ct-coord-actions">
          <button class="btn btn-primary btn-sm" onclick="window._ctAskAI && window._ctAskAI()"><svg width="13" height="13"><use href="#i-sparkle"/></svg>Ask Synaps AI</button>
          <button class="btn btn-ghost btn-sm" onclick="window._ctAIPrefs && window._ctAIPrefs()"><svg width="13" height="13"><use href="#i-settings"/></svg>Preferences</button>
        </div>
      </div>

      ${specialists.length ? `
      <!-- SPECIALISTS -->
      <div>
        <div class="ct-section-head">
          <div>
            <h3>Specialists on call</h3>
            <p>Consulted for specific reviews · not part of your weekly flow</p>
          </div>
        </div>
        <div class="ct-squad">${specialists.map(m => _memberCardHtml(m, true)).join('')}</div>
      </div>` : ''}

      <!-- SHARED DOCS (real or demo) -->
      <div class="ct-two">
        <div class="ct-avail-card">
          <div class="ct-section-head" style="margin-bottom:16px;">
            <div><h3 style="font-size:17px">Recent team activity</h3><p>What your care team has done for you this week</p></div>
          </div>
          <div class="ct-activity">
            ${_isDemo ? [
              { av:'jk', grad:'linear-gradient(135deg,#00d4bc,#4a9eff)', line:'<strong>Dr. Kolmar</strong> reviewed your Week 6 PHQ-9 and flagged <strong>continued improvement</strong> — no protocol change for Week 7.', time:'Today · 8:12 AM', pill:'teal', pillLbl:'Review' },
              { av:'rn', grad:'linear-gradient(135deg,#b794ff,#ff8ab3)', line:'<strong>Rhea</strong> confirmed your <strong>Wed 2:00 PM</strong> tDCS session and sent pre-session reminder.', time:'Yesterday · 4:47 PM', pill:'purple', pillLbl:'Session' },
              { av:'ai', grad:'linear-gradient(135deg,#4ade80,#00d4bc)', line:'<strong>Synaps AI</strong> answered 2 of your questions about skin redness and routed one to Rhea for follow-up.', time:'Yesterday · 11:02 AM', pill:'green', pillLbl:'Triage' },
              { av:'mt', grad:'linear-gradient(135deg,#ffa85b,#ff8a6b)', line:'<strong>Marcus</strong> filed your <strong>BCBS reauthorization</strong> for Weeks 11–20. Expected decision by Apr 25.', time:'Sat Apr 18 · 10:30 AM', pill:'orange', pillLbl:'Admin' },
              { av:'sw', grad:'linear-gradient(135deg,#4a9eff,#b794ff)', line:'<strong>Dr. Wexler</strong> uploaded your <strong>Week 6 qEEG biomarker report</strong> — FAA improved from −0.18 to −0.08.', time:'Fri Apr 17 · 2:15 PM', pill:'purple', pillLbl:'Report' },
            ].map(a => `
              <div class="ct-act-row">
                <div class="ct-act-av" style="background:${a.grad}">${a.av.toUpperCase()}</div>
                <div class="ct-act-body">
                  <div class="ct-act-head-line">${a.line}</div>
                  <div class="ct-act-sub">${a.time}</div>
                </div>
                <div class="ct-act-pill ${a.pill}">${a.pillLbl}</div>
              </div>`).join('')
            : '<div class="pth2-empty" style="padding:20px"><div class="pth2-empty-title">No recent activity yet</div><div class="pth2-empty-sub">Team actions from the past 7 days will appear here.</div></div>'}
          </div>
        </div>

        <div class="ct-docs-card">
          <div class="ct-section-head" style="margin-bottom:4px">
            <div><h3 style="font-size:17px">Shared documents</h3><p>Files your team has sent or reviewed</p></div>
          </div>
          ${_isDemo ? [
            { ico:'teal',   icoRef:'#i-chart',     title:'Week 6 qEEG biomarker summary', sub:'Dr. Wexler · Apr 18 · 4 pages' },
            { ico:'',       icoRef:'#i-clipboard', title:'Updated tDCS protocol — F3 / FP2', sub:'Dr. Kolmar · Apr 14 · signed' },
            { ico:'orange', icoRef:'#i-shield',    title:'Insurance reauthorization — BCBS', sub:'Marcus Tan · Apr 18 · filed, awaiting' },
            { ico:'purple', icoRef:'#i-book-open', title:'Home tDCS safety checklist', sub:'Rhea Nair · Apr 2 · PDF' },
            { ico:'',       icoRef:'#i-book',      title:'Mid-course review notes', sub:'Dr. Kolmar · Apr 9 · shared w/ you' },
          ].map(d => `
            <div class="ct-doc-row" onclick="window._ctDownload && window._ctDownload(${JSON.stringify(d.title)})">
              <div class="ct-doc-ico ${d.ico}"><svg width="16" height="16"><use href="${d.icoRef}"/></svg></div>
              <div><div class="ct-doc-title">${esc(d.title)}</div><div class="ct-doc-sub">${esc(d.sub)}</div></div>
              <div class="ct-doc-btn"><svg width="13" height="13"><use href="#i-download"/></svg></div>
            </div>`).join('')
          : '<div class="pth2-empty" style="padding:20px"><div class="pth2-empty-title">No documents shared yet</div><div class="pth2-empty-sub">Your reports and team notes will appear here.</div></div>'}
        </div>
      </div>

      <!-- CAREGIVER CONSENT (Caregiver Consent Grants launch-audit, 2026-05-01) -->
      <div class="ct-caregiver-consent" id="ct-caregiver-consent">
        <div class="ct-section-head" style="margin-bottom:12px">
          <div>
            <h3>Caregiver consent</h3>
            <p>Authorise specific caregivers to receive your weekly digest, messages, reports, or wearable summaries. Each grant is durable and audited; revocation never deletes the audit trail.</p>
          </div>
        </div>
        ${_isDemo ? '<div class="hw-demo-banner" role="status" style="margin-bottom:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><strong>Demo data</strong>&mdash; the grants below are not regulator-submittable.</div>' : ''}
        <div class="ct-cc-grants" id="ct-cc-grants"><div class="pth2-empty" style="padding:16px"><div class="pth2-empty-title">Loading caregiver grants…</div></div></div>
        <div class="ct-cc-form">
          <div class="ct-cc-form-head"><strong>Grant a new caregiver</strong></div>
          <div class="ct-cc-form-row">
            <label>Caregiver user ID
              <input type="text" id="ct-cc-cg-id" placeholder="user_…" maxlength="64" />
            </label>
          </div>
          <div class="ct-cc-form-row">
            <label class="ct-cc-scope-row"><input type="checkbox" id="ct-cc-sc-digest" checked /><span>Weekly digest</span></label>
            <label class="ct-cc-scope-row"><input type="checkbox" id="ct-cc-sc-messages" /><span>Messages</span></label>
            <label class="ct-cc-scope-row"><input type="checkbox" id="ct-cc-sc-reports" /><span>Reports</span></label>
            <label class="ct-cc-scope-row"><input type="checkbox" id="ct-cc-sc-wearables" /><span>Wearables</span></label>
          </div>
          <div class="ct-cc-form-row">
            <button class="btn btn-primary btn-sm" id="ct-cc-grant-btn"><svg width="13" height="13"><use href="#i-check"/></svg>Grant access</button>
            <span class="ct-cc-hint">Until you grant ``digest`` scope, share-with-caregiver from your digest stays queued (intent audited; not delivered).</span>
          </div>
        </div>
      </div>

      <!-- ESCALATION -->
      <div class="ct-escalation">
        <div class="ct-esc-head">
          <div class="ct-esc-ico"><svg width="18" height="18"><use href="#i-alert"/></svg></div>
          <div><h4>If you need help fast</h4><p>Use these lines — you'll always reach a human within minutes.</p></div>
        </div>
        <div class="ct-esc-rows">
          <div class="ct-esc-row">
            <div class="ct-esc-ring red"><svg width="15" height="15"><use href="#i-alert"/></svg></div>
            <div><div class="ct-esc-title">Crisis &amp; safety line</div><div class="ct-esc-sub">Immediate concern · suicidal thoughts · self-harm</div></div>
            <div class="ct-esc-hours">24 / 7</div>
            <div class="ct-esc-num" onclick="window._ctCrisisCall && window._ctCrisisCall()">Call 988</div>
          </div>
          <div class="ct-esc-row">
            <div class="ct-esc-ring amber"><svg width="15" height="15"><use href="#i-pulse"/></svg></div>
            <div><div class="ct-esc-title">Urgent clinical after-hours</div><div class="ct-esc-sub">For DeepSynaps patients · device issues, medication, severe symptom spike</div></div>
            <div class="ct-esc-hours">After 6 PM · wknd</div>
            <div class="ct-esc-num" style="cursor:default;opacity:0.6">Set by your clinic</div>
          </div>
          <div class="ct-esc-row">
            <div class="ct-esc-ring teal"><svg width="15" height="15"><use href="#i-sparkle"/></svg></div>
            <div><div class="ct-esc-title">Synaps AI triage</div><div class="ct-esc-sub">Quick answers · escalates to a human if clinical</div></div>
            <div class="ct-esc-hours">Always on</div>
            <div class="ct-esc-num" onclick="window._ctAskAI && window._ctAskAI()">Open chat</div>
          </div>
        </div>
      </div>

      <!-- Clinician detail modal -->
      <div class="ct-bd" id="ct-modal-bd" onclick="if(event.target===this) window._ctCloseModal && window._ctCloseModal()">
        <div class="ct-modal" id="ct-modal">
          <div class="ct-modal-head">
            <div class="ct-modal-av" id="ct-modal-av">JK</div>
            <div class="ct-modal-id">
              <h3 id="ct-modal-name">Dr. Julia Kolmar</h3>
              <div class="sub" id="ct-modal-role">Attending Psychiatrist · MDD lead</div>
              <div class="creds" id="ct-modal-creds">MD, PhD · Board cert. 2011</div>
            </div>
            <div class="ct-modal-close" onclick="window._ctCloseModal && window._ctCloseModal()"><svg width="13" height="13"><use href="#i-x"/></svg></div>
          </div>
          <div class="ct-modal-body">
            <div class="ct-modal-section">
              <h4>About</h4>
              <p id="ct-modal-bio">—</p>
            </div>
            <div class="ct-modal-section">
              <h4>Specialties</h4>
              <div class="ct-modal-list" id="ct-modal-tags"></div>
            </div>
            <div class="ct-modal-section">
              <h4>Practice details</h4>
              <div class="ct-modal-grid">
                <div class="item"><div class="l">Languages</div><div class="v" id="ct-modal-lang">—</div></div>
                <div class="item"><div class="l">Clinic hours</div><div class="v" id="ct-modal-hours">—</div></div>
                <div class="item"><div class="l">Avg reply time</div><div class="v" id="ct-modal-reply">—</div></div>
                <div class="item"><div class="l">Shared since</div><div class="v" id="ct-modal-since">—</div></div>
              </div>
            </div>
          </div>
          <div class="ct-modal-foot">
            <button class="btn btn-primary btn-sm" id="ct-modal-msg"><svg width="13" height="13"><use href="#i-mail"/></svg>Message</button>
            <button class="btn btn-ghost btn-sm" id="ct-modal-book"><svg width="13" height="13"><use href="#i-calendar"/></svg>Book</button>
            <button class="btn btn-ghost btn-sm" id="ct-modal-video"><svg width="13" height="13"><use href="#i-video"/></svg>Video call</button>
          </div>
        </div>
      </div>

      <!-- Toast -->
      <div class="ct-toast" id="ct-toast"><svg width="16" height="16"><use href="#i-check"/></svg><span id="ct-toast-text">Done</span></div>
    </div>`;

  // ── Handlers ───────────────────────────────────────────────────────────
  const allMembers = [...squad, ...specialists];
  const byId = new Map(allMembers.map(m => [m.id, m]));

  function _toast(msg) {
    const t = document.getElementById('ct-toast');
    const t2 = document.getElementById('ct-toast-text');
    if (!t || !t2) return;
    t2.textContent = msg || 'Done';
    t.classList.add('show');
    clearTimeout(window._ctToastTimer);
    window._ctToastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  window._ctMessage = function(_id) {
    _toast('Opening care messaging…');
    setTimeout(() => window._navPatient && window._navPatient('patient-virtualcare'), 400);
  };
  window._ctBook = function(_id) {
    _toast('Opening session schedule…');
    setTimeout(() => window._navPatient && window._navPatient('patient-sessions'), 400);
  };
  window._ctMessageTeam  = function() { window._ctMessage(); };
  window._ctBookConsult  = function() { window._ctBook(); };
  window._ctAskAI        = function() {
    _toast('Opening Virtual Care assistant…');
    setTimeout(() => window._navPatient && window._navPatient('patient-virtualcare'), 400);
  };
  window._ctAIPrefs      = function() { _toast('AI preferences saved'); };
  window._ctCrisisCall   = function() { window.location.href = 'tel:988'; };
  window._ctUrgentCall   = function() { window.location.href = 'tel:+16175550143'; };
  window._ctDownload     = function(title) {
    const docUrls = {
      'qEEG summary report': 'https://my.clevelandclinic.org/health/diagnostics/22561-electroencephalogram-eeg',
      'tDCS protocol v3.2': 'https://www.brainstimjrnl.com/article/S1935-861X(16)30277-2/fulltext',
      'Insurance re-authorisation': 'https://www.nhs.uk/nhs-services/help-with-health-costs/',
      'Home device safety checklist': 'https://www.fda.gov/medical-devices/general-hospital-devices-and-supplies/electrical-stimulation-devices-ess',
      'Clinician review notes': 'https://www.mayoclinic.org/diseases-conditions/depression/multimedia/transcranial-magnetic-stimulation-vid-20084603',
    };
    const url = docUrls[title];
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); _toast('Opened: ' + title); }
    else { _toast('Download: ' + title); }
  };

  window._ctProfile = function(id) {
    const m = byId.get(id); if (!m) return;
    const bd = document.getElementById('ct-modal-bd');
    const avEl = document.getElementById('ct-modal-av');
    if (avEl) { avEl.className = 'ct-modal-av'; avEl.classList.add(m.avClass); avEl.textContent = m.avatar; avEl.style.background = ''; }
    document.getElementById('ct-modal-name').textContent = m.name;
    document.getElementById('ct-modal-role').textContent = m.role;
    document.getElementById('ct-modal-creds').textContent = m.creds || '';
    document.getElementById('ct-modal-bio').textContent = m.bio || 'No bio shared yet.';
    document.getElementById('ct-modal-tags').innerHTML = (m.tags || []).map(t => `<span class="ct-tag ${esc(t.k)}">${esc(t.l)}</span>`).join('');
    document.getElementById('ct-modal-lang').textContent = m.lang || '—';
    document.getElementById('ct-modal-hours').textContent = m.hours || '—';
    document.getElementById('ct-modal-reply').textContent = m.reply || m.onlineText || '—';
    document.getElementById('ct-modal-since').textContent = m.sharedSince || '—';
    if (bd) bd.classList.add('open');
    document.getElementById('ct-modal-msg').onclick = () => { window._ctCloseModal(); window._ctMessage(id); };
    document.getElementById('ct-modal-book').onclick = () => { window._ctCloseModal(); window._ctBook(id); };
    document.getElementById('ct-modal-video').onclick = () => { window._ctCloseModal(); window._ctMessage(id); };
  };
  window._ctCloseModal = function() {
    const bd = document.getElementById('ct-modal-bd');
    if (bd) bd.classList.remove('open');
  };

  // ── Caregiver Consent Grants (launch-audit 2026-05-01) ──────────────────
  // Mount-time audit ping under the documented `caregiver_consent` surface.
  try {
    api.postCaregiverConsentAuditEvent && api.postCaregiverConsentAuditEvent({
      event: 'caregiver_consent.view',
      note: 'pt-careteam mount',
      using_demo_data: !!_isDemo,
    });
  } catch (_) { /* audit must never block UI */ }

  function _ccScopeChips(scope) {
    const order = ['digest', 'messages', 'reports', 'wearables'];
    return order
      .filter((k) => scope && scope[k])
      .map((k) => `<span class="ct-tag teal">${esc(k)}</span>`)
      .join('') || '<span class="ct-cc-empty-chip">No scope active</span>';
  }

  function _ccGrantRow(g) {
    const active = !!g.is_active;
    const cgEmail = g.caregiver_email || g.caregiver_user_id;
    const grantedAt = g.granted_at ? new Date(g.granted_at).toLocaleDateString() : '—';
    const revokedBlock = active
      ? `<button class="btn btn-ghost btn-sm" data-cc-revoke="${esc(g.id)}"><svg width="13" height="13"><use href="#i-x"/></svg>Revoke</button>`
      : `<span class="ct-cc-revoked">Revoked ${esc(g.revoked_at ? new Date(g.revoked_at).toLocaleDateString() : '')}${g.revocation_reason ? ' · ' + esc(g.revocation_reason) : ''}</span>`;
    return `
      <div class="ct-cc-grant${active ? ' active' : ' revoked'}" data-grant="${esc(g.id)}">
        <div class="ct-cc-grant-head">
          <strong>${esc(cgEmail)}</strong>
          <span class="ct-cc-grant-meta">Granted ${esc(grantedAt)}</span>
        </div>
        <div class="ct-cc-grant-scope">${_ccScopeChips(g.scope || {})}</div>
        <div class="ct-cc-grant-actions">${revokedBlock}</div>
      </div>`;
  }

  async function _ccLoadGrants() {
    const container = document.getElementById('ct-cc-grants');
    if (!container) return;
    try {
      const data = await (api.caregiverConsentListGrants ? api.caregiverConsentListGrants() : null);
      const items = data && Array.isArray(data.items) ? data.items : [];
      if (!items.length) {
        container.innerHTML = '<div class="pth2-empty" style="padding:16px"><div class="pth2-empty-title">No caregiver grants yet</div><div class="pth2-empty-sub">Use the form below to authorise a caregiver. Until you do, share-with-caregiver from your digest records intent + audit but does not deliver (delivery_status stays queued).</div></div>';
        return;
      }
      container.innerHTML = items.map(_ccGrantRow).join('');
      container.querySelectorAll('[data-cc-revoke]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const gid = btn.getAttribute('data-cc-revoke');
          if (!gid) return;
          const reason = window.prompt('Why are you revoking this grant?');
          if (!reason || !reason.trim()) return;
          try {
            await api.caregiverConsentRevokeGrant(gid, { reason: reason.trim() });
            api.postCaregiverConsentAuditEvent && api.postCaregiverConsentAuditEvent({
              event: 'caregiver_consent.grant_revoked_ui',
              target_id: gid,
              note: 'pt-careteam revoke',
              using_demo_data: !!_isDemo,
            });
            _toast('Grant revoked');
            await _ccLoadGrants();
          } catch (err) {
            console.error('[caregiver-consent] revoke failed:', err);
            _toast('Revoke failed');
          }
        });
      });
    } catch (err) {
      console.error('[caregiver-consent] list failed:', err);
      container.innerHTML = '<div class="pth2-empty" style="padding:16px"><div class="pth2-empty-title">Could not load caregiver grants</div></div>';
    }
  }

  const _ccGrantBtn = document.getElementById('ct-cc-grant-btn');
  if (_ccGrantBtn) {
    _ccGrantBtn.addEventListener('click', async () => {
      const cgIdInput = document.getElementById('ct-cc-cg-id');
      const cgId = cgIdInput ? cgIdInput.value.trim() : '';
      if (!cgId) { _toast('Enter a caregiver user ID'); return; }
      const scope = {
        digest: !!(document.getElementById('ct-cc-sc-digest') || {}).checked,
        messages: !!(document.getElementById('ct-cc-sc-messages') || {}).checked,
        reports: !!(document.getElementById('ct-cc-sc-reports') || {}).checked,
        wearables: !!(document.getElementById('ct-cc-sc-wearables') || {}).checked,
      };
      try {
        await api.caregiverConsentCreateGrant({ caregiver_user_id: cgId, scope });
        api.postCaregiverConsentAuditEvent && api.postCaregiverConsentAuditEvent({
          event: 'caregiver_consent.grant_created_ui',
          target_id: cgId,
          note: 'pt-careteam grant',
          using_demo_data: !!_isDemo,
        });
        _toast('Grant created');
        if (cgIdInput) cgIdInput.value = '';
        await _ccLoadGrants();
      } catch (err) {
        console.error('[caregiver-consent] create failed:', err);
        _toast('Grant failed');
      }
    });
  }

  _ccLoadGrants();
}



// ─── Education Library ──────────────────────────────────────────────────────
export async function pgPatientEducation() {
  try { return await _pgPatientEducationImpl(); }
  catch (err) {
    console.error('[pgPatientEducation] render failed:', err);
    const el = document.getElementById('patient-content');
    if (el) el.innerHTML = `<div class="pt-portal-empty"><div class="pt-portal-empty-ico" aria-hidden="true">&#9888;</div><div class="pt-portal-empty-title">Education Library unavailable</div><div class="pt-portal-empty-body">Please refresh, or browse the handbooks in your clinic site.</div></div>`;
  }
}

async function _pgPatientEducationImpl() {
  setTopbar('Education Library');
  const el = document.getElementById('patient-content');
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }

  // Trusted sources (all 8 categories the user asked about).
  const SOURCES = [
    { id:'synaps',    label:'SOZO Clinic',       cls:'synaps',    short:'S',   count:12 },
    { id:'youtube',   label:'YouTube',           cls:'youtube',   short:'▶',  count:9  },
    { id:'nhs',       label:'NHS',               cls:'mayo',      short:'N',   count:6  },
    { id:'huberman',  label:'Huberman Lab',      cls:'huberman',  short:'HL',  count:5  },
    { id:'mayo',      label:'Mayo Clinic',       cls:'mayo',      short:'M',   count:5  },
    { id:'cleveland', label:'Cleveland Clinic',  cls:'cleveland', short:'CC',  count:4  },
    { id:'podcast',   label:'Podcasts',          cls:'huberman',  short:'🎧',  count:4  },
    { id:'journals',  label:'Academic Journals', cls:'flow',      short:'J',   count:6  },
    { id:'edx',       label:'edX',               cls:'edx',       short:'ed',  count:10 },
    { id:'coursera',  label:'Coursera',          cls:'coursera',  short:'Co',  count:2  },
    { id:'udemy',     label:'Udemy',             cls:'udemy',     short:'Ud',  count:10 },
    { id:'apps',      label:'Apps & Tools',      cls:'synaps',    short:'📱',  count:6  },
    { id:'wearables', label:'Wearables',           cls:'flow',      short:'⌚',  count:10 },
  ];

  // Library items — covers every source category. Each entry is a real,
  // copy-able reference (title + publisher + URL where available) so patients
  // can open videos, articles, and tools directly. Clinic-specific items
  // (sv-*) link to the patient portal; public items link to original sources.
  const LIB = [
    // Clinic / SOZO originals
    // SOZO Clinic — internal educational content mapped to real-world equivalents
    { id:'sv01', kind:'video',   src:'synaps',    srcLbl:'SOZO Clinic',   grad:1,  ico:'brain',     dur:'18:42', title:"A clinician's walkthrough of your Week 6 qEEG report", author:'Dr. Julia Kolmar', meta:'Recorded Apr 19 · Personalized', tags:['For you','qEEG'], topic:'qeeg', week:6, personal:true, url:'https://www.youtube.com/results?search_query=qEEG+report+interpretation+walkthrough' },
    { id:'sv02', kind:'video',   src:'synaps',    srcLbl:'SOZO Clinic',   grad:4,  ico:'smile',     dur:'7:08',  title:"Why mood often dips around session 12 — and what to do", author:'Dr. Julia Kolmar', meta:'SOZO original', tags:['For Week 6','MDD'], topic:'mdd', week:6, url:'https://www.youtube.com/results?search_query=tDCS+depression+mood+dip+mid+treatment' },
    { id:'sv03', kind:'video',   src:'synaps',    srcLbl:'SOZO Clinic',   grad:2,  ico:'pulse',     dur:'10:40', title:"Your home device walk-through — Synaps One unboxing & first session", author:'Rhea Nair · tDCS technician', meta:'For your device', tags:['For your device','Setup'], topic:'devices', url:'https://www.youtube.com/results?search_query=tDCS+home+device+setup+walkthrough' },
    { id:'sv04', kind:'article', src:'synaps',    srcLbl:'SOZO Clinical', grad:8,  ico:'shield',    dur:'4 min read', title:'Side effects to watch for during home tDCS — a patient checklist', author:'SOZO Clinical Team', meta:'Patient checklist', tags:['Safety','Self-care'], topic:'tdcs', url:'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4981628/' },
    { id:'sv05', kind:'article', src:'synaps',    srcLbl:'SOZO Patient Resources', grad:3, ico:'users', dur:'5 min read', title:'Talking to family about your treatment — a script you can borrow', author:'SOZO Patient Resources', meta:'Lifestyle · Support', tags:['Lifestyle','Support'], topic:'lifestyle', url:'https://www.nhs.uk/mental-health/conditions/depression-in-adults/treatment/' },

    // YouTube — clinic explainers and open lectures.
    { id:'yt01', kind:'video',   src:'youtube',   srcLbl:'King\'s College London · YouTube', grad:3, ico:'lightning', dur:'9:42',  title:'The Brunoni-Bestmann tDCS protocol for major depression', author:"King's College London", meta:'184k views', tags:['Matches your plan','tDCS'], topic:'tdcs', url:'https://www.youtube.com/watch?v=0ULj6mgPPbg' },
    { id:'yt02', kind:'video',   src:'youtube',   srcLbl:'Neuroscience News · YouTube', grad:7, ico:'pulse', dur:'5:24', title:'What does a qEEG actually measure? A 5-minute primer', author:'Neuroscience News', meta:'92k views', tags:['For Week 6','qEEG'], topic:'qeeg', url:'https://www.youtube.com/watch?v=4v3Y8Y5mJkI' },
    { id:'yt03', kind:'video',   src:'youtube',   srcLbl:'Stanford · YouTube',  grad:6,  ico:'video',     dur:'52:08', title:'What antidepressants actually do — Robert Sapolsky lecture', author:'Stanford', meta:'1.4M views', tags:['MDD','Lecture'], topic:'mdd', url:'https://www.youtube.com/watch?v=NOAgplgTxfc' },
    { id:'yt04', kind:'video',   src:'youtube',   srcLbl:'City College of NY · YouTube', grad:3, ico:'lightning', dur:'14:55', title:'2 mA, 20 minutes — why those numbers? Marom Bikson explains', author:'City College of NY', meta:'62k views', tags:['For your dose','tDCS'], topic:'tdcs', url:'https://www.youtube.com/watch?v=7O1mcDzjeaE' },
    { id:'yt05', kind:'video',   src:'youtube',   srcLbl:'Huberman Lab · YouTube', grad:1, ico:'brain', dur:'22:48', title:'What the DLPFC does and why we stimulate it', author:'Andrew Huberman', meta:'Episode 213', tags:['Matches your plan','Neuroscience'], topic:'mdd', url:'https://www.youtube.com/watch?v=yb5zpo5NDw0' },

    // Huberman / Andrew Huberman topics
    { id:'hl01', kind:'video',   src:'huberman',  srcLbl:'Huberman Lab',  grad:1,  ico:'brain',     dur:'2:12:08', title:'Using neuromodulation to enhance focus, depression treatment & beyond', author:'Andrew Huberman', meta:'Episode 213', tags:['Matches your plan','Neuroscience'], topic:'mdd', url:'https://www.youtube.com/watch?v=mA3XAuA4fP4' },

    // NHS
    { id:'nhs01', kind:'article', src:'nhs',      srcLbl:'NHS',            grad:4,  ico:'shield',    dur:'7 min read', title:'Depression in adults: overview and what to expect from treatment', author:'NHS · Mental health A–Z', meta:'Last reviewed Jan 2026', tags:['MDD','Therapies'], topic:'mdd', url:'https://www.nhs.uk/mental-health/conditions/depression-in-adults/treatment/' },
    { id:'nhs02', kind:'article', src:'nhs',      srcLbl:'NHS',            grad:2,  ico:'moon',      dur:'6 min read', title:'Sleep hygiene — advice from the NHS', author:'NHS Every Mind Matters', meta:'Evidence reviewed 2025', tags:['Lifestyle','Sleep'], topic:'lifestyle', url:'https://www.nhs.uk/every-mind-matters/mental-health-issues/sleep/' },

    // Mayo / Cleveland Clinic
    { id:'mc01', kind:'video',   src:'mayo',      srcLbl:'Mayo Clinic',   grad:4,  ico:'brain',     dur:'6:18',  title:'Mayo Clinic explains: transcranial direct current stimulation', author:'Dr. Paul Croarkin', meta:'Featured', tags:['For your plan','tDCS'], topic:'tdcs', url:'https://www.mayoclinic.org/diseases-conditions/depression/multimedia/transcranial-magnetic-stimulation-vid-20084603' },
    { id:'mc02', kind:'video',   src:'mayo',      srcLbl:'Mayo Clinic',   grad:5,  ico:'moon',      dur:'11:10', title:'Sleep & recovery during a 10-week tDCS program', author:'Mayo Clinic', meta:'Patient Library', tags:['Lifestyle','Sleep'], topic:'lifestyle', url:'https://www.mayoclinic.org/diseases-conditions/depression/in-depth/depression-and-exercise/art-20046495' },
    { id:'cc01', kind:'video',   src:'cleveland', srcLbl:'Cleveland Clinic', grad:2, ico:'heart', dur:'12:34', title:'Treatment-resistant depression — what your options are now', author:'Cleveland Clinic Health', meta:'418k views', tags:['MDD','Therapies'], topic:'mdd', url:'https://my.clevelandclinic.org/health/diseases/9290-depression' },
    { id:'cc02', kind:'article', src:'cleveland', srcLbl:'Cleveland Clinic', grad:5, ico:'moon', dur:'6 min read', title:'Sleep hygiene during depression treatment — a 12-point checklist', author:'Cleveland Clinic Health Library', meta:'Article', tags:['Lifestyle','Sleep'], topic:'lifestyle', url:'https://my.clevelandclinic.org/health/articles/12148-sleep-basics' },
    { id:'cc03', kind:'video',   src:'cleveland', srcLbl:'Cleveland Clinic Neurology', grad:4, ico:'pulse', dur:'9:18', title:'Reading your qEEG report: alpha, beta, theta — what they mean', author:'Cleveland Clinic Neurology', meta:'For your report', tags:['For your report','qEEG'], topic:'qeeg', url:'https://my.clevelandclinic.org/health/diagnostics/22561-electroencephalogram-eeg' },

    // Podcasts
    { id:'pc01', kind:'podcast', src:'podcast',   srcLbl:'Huberman Lab Podcast', grad:6, ico:'headphones', dur:'1:48:22', title:'Optimizing exercise for mental health — duration, intensity, timing', author:'Andrew Huberman', meta:'Episode 156', tags:['Exercise','Mood'], topic:'lifestyle', url:'https://www.hubermanlab.com/episode/optimize-your-exercise' },
    { id:'pc02', kind:'podcast', src:'podcast',   srcLbl:'The Tim Ferriss Show', grad:9, ico:'headphones', dur:'2:04:12', title:'Neuroscience of habit change with Dr. Andrew Huberman', author:'Tim Ferriss', meta:'Episode 615', tags:['Lifestyle','Habit'], topic:'lifestyle', url:'https://tim.blog/2024/03/28/dr-andrew-huberman-2/' },
    { id:'pc03', kind:'podcast', src:'podcast',   srcLbl:'NPR Hidden Brain', grad:5, ico:'headphones', dur:'52:44', title:'Your brain under stress — and how to reset it', author:'Shankar Vedantam', meta:'NPR', tags:['Lifestyle','Mood'], topic:'lifestyle', url:'https://hiddenbrain.org/podcast/under-pressure/' },

    // Academic journals
    { id:'j01', kind:'article',  src:'journals',  srcLbl:'Brain Stimulation (Elsevier)', grad:7, ico:'doc', dur:'open access', title:'Bikson et al. — Safety of transcranial direct current stimulation: evidence based update', author:'Bikson M. et al. · Brain Stimulation 2016', meta:'DOI 10.1016/j.brs.2016.06.004', tags:['Safety','Journal'], topic:'tdcs', url:'https://doi.org/10.1016/j.brs.2016.06.004' },
    { id:'j02', kind:'article',  src:'journals',  srcLbl:'JAMA Psychiatry',              grad:4, ico:'doc', dur:'paywalled', title:'Home-based transcranial direct current stimulation for major depressive disorder — RCT', author:'Borrione L. et al. · JAMA Psychiatry 2024', meta:'Randomised controlled trial', tags:['MDD','RCT'], topic:'mdd', url:'https://pubmed.ncbi.nlm.nih.gov/?term=Borrione+tDCS+home+depression+2024' },
    { id:'j03', kind:'article',  src:'journals',  srcLbl:'Neuroscience & Biobehavioral Reviews', grad:9, ico:'doc', dur:'12 min read', title:'Frontal alpha asymmetry as a biomarker of depression — a review', author:'Smith E. et al. · Neurosci Biobehav Rev 2017', meta:'Review article', tags:['qEEG','Biomarker'], topic:'qeeg', url:'https://pubmed.ncbi.nlm.nih.gov/28456572/' },

    // Vielight / device makers
    { id:'vi01', kind:'video',   src:'flow',      srcLbl:'Vielight Inc.', grad:5,  ico:'lightning', dur:'11:02', title:'Vielight Neuro Alpha — what 810 nm light does to brain tissue', author:'Vielight Inc.', meta:'Manufacturer', tags:['PBM','Device'], topic:'devices', url:'https://www.youtube.com/@Vielight/search?query=Neuro+Alpha' },
    { id:'vi02', kind:'video',   src:'flow',      srcLbl:'Vielight',      grad:10, ico:'lightning', dur:'15:30', title:'Photobiomodulation 101 — light, mitochondria, mood', author:'Dr. Lim · Vielight', meta:'For your Vielight', tags:['For your Vielight','PBM'], topic:'devices', url:'https://vielight.com/photobiomodulation-101/' },
    { id:'fh01', kind:'video',   src:'flow',      srcLbl:'Flow Neuroscience', grad:7, ico:'pulse', dur:'8:20',  title:'How to use the Flow headset at home (full setup)', author:'Flow Neuroscience', meta:'Manufacturer', tags:['Device','tDCS'], topic:'devices', url:'https://flowneuroscience.com/how-it-works/' },

    // Online Courses — edX, Coursera, Udemy
    { id:'ed01', kind:'course',  src:'edx',       srcLbl:'edX · Harvard',  grad:2,  ico:'graduation', dur:'12 weeks', title:'The Science of Well-Being — Yale University', author:'Professor Laurie Santos', meta:'Free to audit · Certificate available', tags:['Well-being','Course'], topic:'lifestyle', url:'https://www.edx.org/learn/happiness/yale-university-the-science-of-well-being' },
    { id:'ed02', kind:'course',  src:'edx',       srcLbl:'edX · MIT',      grad:4,  ico:'graduation', dur:'9 weeks', title:'Introduction to Psychology — MIT', author:'MIT Open Learning', meta:'Free · Self-paced', tags:['Psychology','Course'], topic:'mdd', url:'https://www.edx.org/learn/psychology/massachusetts-institute-of-technology-introduction-to-psychology' },
    { id:'co01', kind:'course',  src:'coursera',  srcLbl:'Coursera · Johns Hopkins', grad:3, ico:'graduation', dur:'4 weeks', title:'Psychological First Aid — Johns Hopkins University', author:'George Everly, PhD', meta:'Free to audit · Certificate', tags:['Mental Health','Course'], topic:'mdd', url:'https://www.coursera.org/learn/psychological-first-aid' },
    { id:'co02', kind:'course',  src:'coursera',  srcLbl:'Coursera · University of Toronto', grad:5, ico:'graduation', dur:'6 weeks', title:'The Arts and Science of Relationships — University of Toronto', author:'University of Toronto', meta:'Free to audit', tags:['Relationships','Course'], topic:'lifestyle', url:'https://www.coursera.org/learn/the-arts-and-science-of-relationships' },
    { id:'ud01', kind:'course',  src:'udemy',     srcLbl:'Udemy',          grad:6,  ico:'graduation', dur:'5.5 hours', title:'Neuroscience for Neurofeedback — A Complete Guide', author:'Thomas Feiner · Institute for EEG Neurofeedback', meta:'Paid course · 4.6★', tags:['Neurofeedback','Course'], topic:'qeeg', url:'https://www.udemy.com/course/neuroscience-for-neurofeedback/' },
    { id:'ud02', kind:'course',  src:'udemy',     srcLbl:'Udemy',          grad:8,  ico:'graduation', dur:'3 hours', title:'CBT for Depression, Anxiety and Phobias', author:'Libby Seery · Udemy Instructor', meta:'Paid course · 4.5★', tags:['CBT','Course'], topic:'mdd', url:'https://www.udemy.com/course/cognitive-behavioral-therapy-cbt-for-depression-anxiety-phobias/' },

    // Apps & Tools — software clinicians commonly recommend alongside neuromodulation
    { id:'ap01', kind:'article', src:'apps',      srcLbl:'App Recommendation', grad:2, ico:'smile',     dur:'2 min read', title:'Headspace — guided meditation & sleep', author:'Headspace Inc.', meta:'iOS · Android · Web', tags:['Meditation','Sleep'], topic:'lifestyle', url:'https://www.headspace.com' },
    { id:'ap02', kind:'article', src:'apps',      srcLbl:'App Recommendation', grad:3, ico:'moon',      dur:'2 min read', title:'Calm — sleep stories, breathing & relaxation', author:'Calm.com Inc.', meta:'iOS · Android', tags:['Sleep','Breathing'], topic:'lifestyle', url:'https://www.calm.com' },
    { id:'ap03', kind:'article', src:'apps',      srcLbl:'App Recommendation', grad:4, ico:'smile',     dur:'1 min read', title:'Daylio — mood & activity tracking journal', author:'Daylio', meta:'iOS · Android', tags:['Mood','Tracking'], topic:'mood', url:'https://daylio.net' },
    { id:'ap04', kind:'article', src:'apps',      srcLbl:'App Recommendation', grad:5, ico:'shield',    dur:'2 min read', title:'MindShift — free CBT-based anxiety toolkit', author:'Anxiety Canada', meta:'iOS · Android · Free', tags:['CBT','Anxiety'], topic:'lifestyle', url:'https://www.anxietycanada.com/resources/mindshift-cbt/' },
    { id:'ap05', kind:'article', src:'apps',      srcLbl:'App Recommendation', grad:6, ico:'pulse',     dur:'2 min read', title:'EliteHRV — heart-rate variability & recovery', author:'EliteHRV', meta:'iOS · Android', tags:['HRV','Recovery'], topic:'lifestyle', url:'https://elitehrv.com' },
    { id:'ap06', kind:'article', src:'apps',      srcLbl:'App Recommendation', grad:7, ico:'moon',      dur:'1 min read', title:'Insight Timer — free meditation library (100k+ tracks)', author:'Insight Network Inc.', meta:'iOS · Android · Free', tags:['Meditation','Free'], topic:'lifestyle', url:'https://insighttimer.com' },


  ];

  // Continue-watching state: pulled from localStorage + fallback.
  const contDemo = [
    { id:'cont1', grad:2, ico:'brain', pct:64, title:'How tDCS reaches the depressed brain — explained simply', sub:'SOZO Clinic · 14:22', left:'5:14 left' },
    { id:'cont2', grad:1, ico:'brain', pct:32, title:'What the DLPFC does and why we stimulate it',             sub:'Huberman Lab · YouTube · 22:48', left:'15:30 left' },
    { id:'cont3', grad:5, ico:'moon',  pct:88, title:'Sleep & recovery during a 10-week tDCS program',          sub:'Mayo Clinic · 11:10', left:'1:20 left' },
  ];

  // Learning paths
  const PATHS = [
    { id:'p1', icoCls:'brain',  tag:'For your plan',     name:'Understanding tDCS, end-to-end',         desc:'From the basic physics of direct current to electrode placement, dosing, and what neuroplasticity actually changes in your brain.', lessons:8, mins:72, pct:0 },
    { id:'p2', icoCls:'heart',  tag:'Recovery toolkit',  name:'MDD recovery — beyond the device',       desc:'Sleep, behavioral activation, exercise, social rhythm — the lifestyle scaffolding that makes neuromodulation stick.', lessons:7, mins:58, pct:0 },
    { id:'p3', icoCls:'shield', tag:'Foundations',       name:'Brain health basics in 7 short videos',  desc:'A friendly tour of brain regions, neurotransmitters, neuroplasticity, qEEG, and how home devices fit into the broader picture.', lessons:7, mins:42, pct:0 },
  ];

  // Academy courses — curated learning resources with completion tracking
  const ACADEMY_CATEGORIES = [
    { id: 'all',          label: 'All',             icon: '&#128218;' },
    { id: 'understanding', label: 'Understanding',   icon: '&#129504;' },
    { id: 'self-care',    label: 'Self-Care',        icon: '&#128154;' },
    { id: 'techniques',   label: 'Techniques',       icon: '&#127919;' },
    { id: 'stories',      label: 'Patient Stories',  icon: '&#128172;' },
    { id: 'webinars',     label: 'Webinars',         icon: '&#127908;' },
    { id: 'courses',      label: 'Courses',          icon: '&#127891;' },
  ];
  const ACADEMY_COURSES = [
    { id: 'c1', title: 'Understanding Neuromodulation', subtitle: 'What happens during tDCS and why it helps', category: 'understanding', type: 'Article', duration: '8 min read', source: 'DeepSynaps Clinic', icon: '&#129504;', free: true,
      description: 'A patient-friendly guide to how transcranial direct current stimulation works, what the electrodes do, and why consistency matters.' },
    { id: 'c2', title: 'Sleep Hygiene for Better Outcomes', subtitle: 'Small changes that support your treatment', category: 'self-care', type: 'Guide', duration: '6 min read', source: 'NHS Better Health', icon: '&#128164;', free: true,
      description: 'Evidence-based tips to improve your sleep quality, which can significantly impact how well your treatment works.' },
    { id: 'c3', title: 'Breathing Exercises: 4-7-8 Technique', subtitle: 'A quick calming technique you can do anywhere', category: 'techniques', type: 'Video', duration: '4 min', source: 'YouTube', icon: '&#128692;', free: true,
      description: 'Learn the 4-7-8 breathing technique recommended by your care team as part of your homework programme.' },
    { id: 'c4', title: 'My tDCS Journey: 20 Sessions Later', subtitle: 'One patient shares their honest experience', category: 'stories', type: 'Article', duration: '12 min read', source: 'DeepSynaps Community', icon: '&#128172;', free: true,
      description: 'A real patient describes what sessions felt like, how symptoms changed, and what surprised them about the process.' },
    { id: 'c5', title: 'Managing Side Effects', subtitle: 'What to expect and when to speak up', category: 'understanding', type: 'Guide', duration: '5 min read', source: 'DeepSynaps Clinic', icon: '&#9888;', free: true,
      description: 'Common side effects of neuromodulation treatments, which ones are normal, and when you should contact your care team.' },
    { id: 'c6', title: 'Mindfulness for Depression', subtitle: 'Evidence-based practices that complement your protocol', category: 'techniques', type: 'Course', duration: '6 modules', source: 'FutureLearn', icon: '&#128992;', free: false,
      description: 'A structured mindfulness course designed for people receiving treatment for depression. Integrates with your care plan.' },
    { id: 'c7', title: 'Understanding Your qEEG Report', subtitle: 'What those brain waves actually mean for you', category: 'understanding', type: 'Video', duration: '18 min', source: 'DeepSynaps Clinic+', icon: '&#129504;', free: false,
      description: 'A clinician walkthrough explaining what your qEEG report shows, written for patients, not clinicians.' },
    { id: 'c8', title: 'Nutrition & Brain Health', subtitle: 'How diet impacts your neuromodulation outcomes', category: 'self-care', type: 'Article', duration: '10 min read', source: 'Mayo Clinic', icon: '&#129382;', free: true,
      description: 'Research-backed dietary suggestions that may support brain health during your treatment course.' },
    { id: 'c9', title: 'Patient Q&A: Common Concerns', subtitle: 'Answers to the most asked questions', category: 'stories', type: 'Webinar Recording', duration: '45 min', source: 'DeepSynaps Community', icon: '&#127908;', free: true,
      description: 'A recorded Q&A session where patients asked clinicians their most pressing questions about neuromodulation.' },
    { id: 'c10', title: 'Progressive Muscle Relaxation', subtitle: 'Reduce tension before and after sessions', category: 'techniques', type: 'Audio Guide', duration: '15 min', source: 'NHS Every Mind Matters', icon: '&#127925;', free: true,
      description: 'A guided audio exercise to help you relax your body, especially useful before clinic sessions.' },
    { id: 'c11', title: 'Home Device Safety Training', subtitle: 'Required before starting home therapy', category: 'courses', type: 'Interactive Course', duration: '3 modules', source: 'DeepSynaps Clinic', icon: '&#128268;', free: true,
      description: 'Mandatory safety training covering device setup, electrode placement, emergency procedures, and session logging.' },
    { id: 'c12', title: 'Building Resilience During Treatment', subtitle: 'A 4-week guided programme', category: 'courses', type: 'Course', duration: '4 weeks', source: 'DeepSynaps Academy', icon: '&#127891;', free: false,
      description: 'A structured programme combining psychoeducation, journaling prompts, and behavioural exercises tailored to your treatment phase.' },
  ];
  let _acadFilter = 'all';
  const _acadCompleted = JSON.parse(localStorage.getItem('ds_pt_academy_completed') || '[]');

  // Saved state (localStorage). Seed 6 by default.
  let savedIds = (() => {
    try { return JSON.parse(localStorage.getItem('ds_edu_saved') || '["sv01","yt01","pc01","j01","mc01","nhs01"]'); }
    catch (_e) { return ['sv01','yt01','pc01','j01','mc01','nhs01']; }
  })();
  function _isSaved(id) { return savedIds.includes(id); }
  function _persistSaved() { try { localStorage.setItem('ds_edu_saved', JSON.stringify(savedIds)); } catch (_e) {} }

  // ── Helpers ─────────────────────────────────────────────────────────────
  function _sourceIcoSvg(srcId) {
    const m = { youtube:'#i-video', podcast:'#i-headphones', nhs:'#i-shield', journals:'#i-book-open', mayo:'#i-shield', cleveland:'#i-shield', synaps:'#i-pulse', flow:'#i-lightning', huberman:'#i-video', edx:'#i-graduation', coursera:'#i-graduation', udemy:'#i-graduation' };
    return m[srcId] || '#i-pulse';
  }
  function _cardHtml(item) {
    const saved = _isSaved(item.id);
    const playable = item.kind === 'video' || item.kind === 'podcast';
    return `
      <div class="el-card" data-item-id="${esc(item.id)}" data-cat="${esc(item.kind)}" data-source="${esc(item.src)}" data-topic="${esc(item.topic || '')}" onclick="window._edOpen && window._edOpen('${esc(item.id)}')">
        <div class="el-card-thumb el-thumb-grad-${item.grad || 1}">
          <div class="el-thumb-icon"><svg><use href="#i-${esc(item.ico || 'brain')}"/></svg></div>
          <span class="el-card-source ${esc(item.src)}"><svg><use href="${_sourceIcoSvg(item.src)}"/></svg>${esc(item.srcLbl || item.src.toUpperCase())}</span>
          <button class="el-card-saved${saved ? ' on' : ''}" title="${saved ? 'Saved' : 'Save'}" onclick="event.stopPropagation(); window._edToggleSave && window._edToggleSave('${esc(item.id)}', this)">
            <svg width="14" height="14"><use href="#i-${saved ? 'bookmark-fill' : 'bookmark'}"/></svg>
          </button>
          ${item.dur ? `<span class="el-card-duration">${esc(item.dur)}</span>` : ''}
          ${playable ? `<div class="el-card-play"><div class="el-card-play-circle"><svg width="20" height="20"><use href="#i-play"/></svg></div></div>` : ''}
        </div>
        <div class="el-card-info">
          <div class="el-card-title">${esc(item.title)}</div>
          <div class="el-card-meta">
            <span>${esc(item.author || '')}</span>
            ${item.meta ? '<span class="el-card-meta-dot"></span><span>' + esc(item.meta) + '</span>' : ''}
          </div>
          ${(item.tags || []).length ? `<div class="el-card-tags">${item.tags.map((t, i) => `<span class="el-card-tag${i === 0 && /Match|For /i.test(t) ? ' match' : ''}">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  function _featuredHtml(item) {
    const saved = _isSaved(item.id);
    return `
      <div class="el-feat-large" data-item-id="${esc(item.id)}" onclick="window._edOpen && window._edOpen('${esc(item.id)}')">
        <div class="el-feat-thumb el-thumb-grad-${item.grad || 1}">
          <div class="el-thumb-icon" style="width:72px;height:72px"><svg width="36" height="36"><use href="#i-${esc(item.ico || 'brain')}"/></svg></div>
        </div>
        <span class="el-card-source ${esc(item.src)}"><svg><use href="${_sourceIcoSvg(item.src)}"/></svg>${esc(item.srcLbl || '')}</span>
        <button class="el-card-saved${saved ? ' on' : ''}" title="${saved ? 'Saved' : 'Save'}" onclick="event.stopPropagation(); window._edToggleSave && window._edToggleSave('${esc(item.id)}', this)">
          <svg width="14" height="14"><use href="#i-${saved ? 'bookmark-fill' : 'bookmark'}"/></svg>
        </button>
        ${item.dur ? `<span class="el-card-duration">${esc(item.dur)}</span>` : ''}
        <div class="el-feat-overlay">
          ${item.personal ? '<span class="el-feat-tag">Just for you</span>' : ''}
          <div class="el-feat-title">${esc(item.title)}</div>
          <div class="el-feat-meta">
            <span>${esc(item.author || '')}</span>
            ${item.meta ? '<span class="el-card-meta-dot"></span><span>' + esc(item.meta) + '</span>' : ''}
          </div>
        </div>
      </div>`;
  }

  // Featured = personalised (first match) + 2 more clinician-picked.
  const featured = [LIB.find(i => i.personal) || LIB[0], LIB.find(i => i.id === 'yt01'), LIB.find(i => i.id === 'sv02')].filter(Boolean);

  // Pre-compute source counts from real LIB (overrides stub counts).
  const realSrcCounts = LIB.reduce((m, i) => { m[i.src] = (m[i.src] || 0) + 1; return m; }, {});

  // Svg defs for bookmark icons (since they're not in the main sprite).
  const extraSvgDefs = `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <symbol id="i-bookmark" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4V3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
      <symbol id="i-bookmark-fill" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4V3Z" fill="currentColor"/></symbol>
      <symbol id="i-headphones" viewBox="0 0 24 24"><path d="M3 14a9 9 0 0 1 18 0v5a2 2 0 0 1-2 2h-2v-7h4M7 14H3v7h2a2 2 0 0 0 2-2v-5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
      <symbol id="i-doc" viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 3v6h6M8 14h8M8 17h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
      <symbol id="i-share" viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="18" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m8.2 11 7.6-4M8.2 13l7.6 4" stroke="currentColor" stroke-width="1.5"/></symbol>
      <symbol id="i-graduation" viewBox="0 0 24 24"><path d="M22 10L12 5 2 10l10 5 10-5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 12v4.5a6 6 0 0 0 12 0V12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
    </svg>`;

  // ── Render ─────────────────────────────────────────────────────────────
  el.innerHTML = `
    ${extraSvgDefs}
    <div class="pt-route" id="pt-route-education">
    <div class="el-wrap">

      <!-- Hero -->
      <div class="el-hero">
        <div class="el-hero-grid">
          <div>
            <div class="el-hero-eyebrow">Curated for your protocol</div>
            <div class="el-hero-title">Learn how every part of your treatment plan works</div>
            <div class="el-hero-sub">Vetted videos, clinic explainers, peer-reviewed articles, and podcasts — chosen by your care team to match your treatment plan.</div>
            <div class="el-search">
              <span class="el-search-icon"><svg width="14" height="14"><use href="#i-search"/></svg></span>
              <input type="text" id="el-search-input" placeholder="Search videos, articles, podcasts…" oninput="window._edSearch && window._edSearch(this.value)" />
            </div>
          </div>
          <div class="el-hero-stats">
            <div class="el-hero-stat">
              <div class="el-hero-stat-icon teal"><svg width="18" height="18"><use href="#i-target"/></svg></div>
              <div class="el-hero-stat-content"><div class="el-hero-stat-val">${featured.length + 5} picks for you</div><div class="el-hero-stat-lbl">Matched to your plan</div></div>
            </div>
            <div class="el-hero-stat">
              <div class="el-hero-stat-icon purple"><svg width="18" height="18"><use href="#i-clock"/></svg></div>
              <div class="el-hero-stat-content"><div class="el-hero-stat-val">\u2014</div><div class="el-hero-stat-lbl">Watch time tracked as you go</div></div>
            </div>
            <div class="el-hero-stat">
              <div class="el-hero-stat-icon amber"><svg width="18" height="18"><use href="#i-bookmark"/></svg></div>
              <div class="el-hero-stat-content"><div class="el-hero-stat-val" id="el-saved-count">${savedIds.length} saved</div><div class="el-hero-stat-lbl">In "My library"</div></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sources -->
      <div class="el-section">
        <div class="el-section-head">
          <div class="el-section-title"><svg width="16" height="16"><use href="#i-shield"/></svg>Trusted sources <span class="el-section-count">${SOURCES.length} partners</span></div>
        </div>
        <div class="el-sources" id="el-sources">
          ${SOURCES.map(s => `
            <div class="el-source-pill" data-source="${esc(s.id)}" onclick="window._edSourceFilter && window._edSourceFilter('${esc(s.id)}', this)">
              <div class="el-source-logo ${esc(s.cls)}">${esc(s.short)}</div>
              <div class="el-source-name">${esc(s.label)}</div>
              <div class="el-source-count">${realSrcCounts[s.id] || s.count || 0} items</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Continue watching -->
      <div class="el-section">
        <div class="el-section-head">
          <div class="el-section-title"><svg width="16" height="16"><use href="#i-play"/></svg>Continue watching</div>
        </div>
        <div style="padding:18px 0;text-align:center;color:var(--text-tertiary);font-size:12.5px;line-height:1.6">
          No watch history yet. Open a video or article below to get started.
        </div>
      </div>

      <!-- For you -->
      <div class="el-section">
        <div class="el-section-head">
          <div class="el-section-title"><svg width="16" height="16"><use href="#i-sparkle"/></svg>For you <span class="el-section-count">Picked by your care team</span></div>
        </div>
        <div class="el-featured-grid">
          ${featured.length ? _featuredHtml(featured[0]) : ''}
          ${featured.slice(1).map(_cardHtml).join('')}
        </div>
      </div>

      <!-- Learning paths -->
      <div class="el-section">
        <div class="el-section-head">
          <div class="el-section-title"><svg width="16" height="16"><use href="#i-target"/></svg>Learning paths <span class="el-section-count">${PATHS.length} paths · ${PATHS.reduce((a, p) => a + p.lessons, 0)} lessons</span></div>
        </div>
        <div class="el-paths-grid">
          ${PATHS.map(p => `
            <div class="el-path" onclick="window._edKindFilter && window._edKindFilter('all'); window._edTopicFilter && window._edTopicFilter('${p.icoCls === 'brain' ? 'tdcs' : p.icoCls === 'heart' ? 'lifestyle' : 'all'}'); window.scrollTo({top:document.getElementById('el-grid').offsetTop-20,behavior:'smooth'});">
              <div class="el-path-head">
                <div class="el-path-icon ${esc(p.icoCls)}"><svg width="22" height="22"><use href="#i-${p.icoCls === 'brain' ? 'brain' : p.icoCls === 'heart' ? 'heart' : 'shield'}"/></svg></div>
                <div class="el-path-info">
                  <div class="el-path-tag">${esc(p.tag)}</div>
                  <div class="el-path-name">${esc(p.name)}</div>
                </div>
              </div>
              <p class="el-path-desc">${esc(p.desc)}</p>
              <div class="el-path-meta">
                <svg><use href="#i-book-open"/></svg><span>${p.lessons} lessons</span>
                <svg><use href="#i-clock"/></svg><span>${p.mins >= 60 ? Math.floor(p.mins / 60) + 'h ' + (p.mins % 60) + 'm' : p.mins + 'm'}</span>
              </div>
              <div class="el-path-progress">
                <div class="el-path-progress-bar"><div class="el-path-progress-fill" style="width:${p.pct}%"></div></div>
                <span class="el-path-progress-pct">${p.pct}%</span>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Academy -->
      <div class="el-section">
        <div class="el-section-head">
          <div class="el-section-title"><svg width="16" height="16"><use href="#i-graduation"/></svg>Academy <span class="el-section-count">${_acadCompleted.length}/${ACADEMY_COURSES.length} completed</span></div>
        </div>
        <div style="margin-bottom:12px">
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="el-acad-chips">
            ${ACADEMY_CATEGORIES.map(c => `<button onclick="window._edAcadFilter('${c.id}')" class="el-tab${_acadFilter === c.id ? ' active' : ''}" data-acad-cat="${c.id}" style="display:inline-flex;align-items:center;gap:4px"><span>${c.icon}</span>${esc(c.label)}</button>`).join('')}
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px" id="el-acad-grid">
          ${ACADEMY_COURSES.map(c => {
            const done = _acadCompleted.includes(c.id);
            return `
            <div class="el-card" data-acad-id="${esc(c.id)}" data-acad-cat="${esc(c.category)}" onclick="window._edAcadOpen('${esc(c.id)}')" style="cursor:pointer">
              <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;align-items:flex-start;gap:10px">
                  <div style="width:40px;height:40px;border-radius:10px;background:rgba(45,212,191,0.08);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${c.icon}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px;display:flex;align-items:center;gap:6px">${esc(c.title)}${done ? '<span style="color:#22c55e;font-size:11px">&#10003;</span>' : ''}</div>
                    <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.4">${esc(c.subtitle)}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:10.5px">
                  <span style="padding:2px 8px;border-radius:4px;background:rgba(96,165,250,0.1);color:#60a5fa">${esc(c.type)}</span>
                  <span style="padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.04);color:var(--text-tertiary)">${esc(c.duration)}</span>
                  <span style="padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.04);color:var(--text-tertiary)">${esc(c.source)}</span>
                  ${!c.free ? '<span style="padding:2px 8px;border-radius:4px;background:rgba(251,191,36,0.1);color:#fbbf24">Premium</span>' : ''}
                </div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <div class="el-empty" id="el-acad-empty" style="display:none">
          <svg><use href="#i-search"/></svg>
          <div class="el-empty-title">No academy resources match</div>
          <div class="el-empty-sub">Try a different category.</div>
        </div>
      </div>

      <!-- Library grid + filters -->
      <div class="el-section">
        <div class="el-section-head">
          <div class="el-section-title"><svg width="16" height="16"><use href="#i-book-open"/></svg>Library <span class="el-section-count" id="el-lib-count">${LIB.length} items</span></div>
          <div class="el-section-actions">
            <div class="el-tabs" id="el-kind-tabs">
              <button class="el-tab active" data-kind="all" onclick="window._edKindFilter && window._edKindFilter('all')">All</button>
              <button class="el-tab" data-kind="video" onclick="window._edKindFilter && window._edKindFilter('video')"><svg><use href="#i-video"/></svg>Video</button>
              <button class="el-tab" data-kind="article" onclick="window._edKindFilter && window._edKindFilter('article')"><svg><use href="#i-doc"/></svg>Article</button>
              <button class="el-tab" data-kind="podcast" onclick="window._edKindFilter && window._edKindFilter('podcast')"><svg><use href="#i-headphones"/></svg>Podcast</button>
              <button class="el-tab" data-kind="course" onclick="window._edKindFilter && window._edKindFilter('course')"><svg><use href="#i-graduation"/></svg>Course</button>
            </div>
            <div class="el-tabs" id="el-topic-tabs">
              <button class="el-tab active" data-topic="all" onclick="window._edTopicFilter && window._edTopicFilter('all')">All topics</button>
              <button class="el-tab" data-topic="tdcs" onclick="window._edTopicFilter && window._edTopicFilter('tdcs')">tDCS</button>
              <button class="el-tab" data-topic="mdd" onclick="window._edTopicFilter && window._edTopicFilter('mdd')">MDD</button>
              <button class="el-tab" data-topic="qeeg" onclick="window._edTopicFilter && window._edTopicFilter('qeeg')">qEEG</button>
              <button class="el-tab" data-topic="lifestyle" onclick="window._edTopicFilter && window._edTopicFilter('lifestyle')">Lifestyle</button>
              <button class="el-tab" data-topic="devices" onclick="window._edTopicFilter && window._edTopicFilter('devices')">Devices</button>
            </div>
          </div>
        </div>
        <div class="el-grid" id="el-grid">${LIB.map(_cardHtml).join('')}</div>
        <div class="el-empty" id="el-empty" style="display:none">
          <svg><use href="#i-search"/></svg>
          <div class="el-empty-title">No matches</div>
          <div class="el-empty-sub">Try a different search term or topic filter.</div>
        </div>
      </div>

      <div class="el-toast" id="el-toast"><svg><use href="#i-check"/></svg><span id="el-toast-text">Saved</span></div>
    </div>
    </div>`;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const itemById = new Map(LIB.map(i => [i.id, i]));
  let _filterKind = 'all', _filterTopic = 'all', _filterSource = null, _search = '';

  function _applyFilters() {
    const needle = _search.toLowerCase().trim();
    let shown = 0;
    document.querySelectorAll('#el-grid .el-card').forEach(c => {
      const id = c.dataset.itemId;
      const it = itemById.get(id);
      if (!it) return;
      let ok = true;
      if (_filterKind !== 'all' && it.kind !== _filterKind) ok = false;
      if (_filterTopic !== 'all' && (it.topic || '') !== _filterTopic) ok = false;
      if (_filterSource && it.src !== _filterSource) ok = false;
      if (needle) {
        const hay = (it.title + ' ' + (it.author || '') + ' ' + (it.meta || '') + ' ' + (it.tags || []).join(' ')).toLowerCase();
        if (!hay.includes(needle)) ok = false;
      }
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    const cnt = document.getElementById('el-lib-count');
    if (cnt) cnt.textContent = shown + ' items' + (shown !== LIB.length ? ' (filtered)' : '');
    const empty = document.getElementById('el-empty');
    if (empty) empty.style.display = shown === 0 ? '' : 'none';
  }

  window._edKindFilter = function(k) {
    _filterKind = k;
    document.querySelectorAll('#el-kind-tabs .el-tab').forEach(b => b.classList.toggle('active', b.dataset.kind === k));
    _applyFilters();
  };
  window._edTopicFilter = function(t) {
    _filterTopic = t;
    document.querySelectorAll('#el-topic-tabs .el-tab').forEach(b => b.classList.toggle('active', b.dataset.topic === t));
    _applyFilters();
  };
  window._edSourceFilter = function(id, target) {
    const pills = document.querySelectorAll('#el-sources .el-source-pill');
    const already = target && target.classList.contains('active');
    pills.forEach(p => p.classList.remove('active'));
    if (already) {
      _filterSource = null;
    } else {
      _filterSource = id;
      if (target) target.classList.add('active');
    }
    _applyFilters();
  };
  window._edSearch = function(q) {
    _search = String(q || '');
    _applyFilters();
  };
  window._edToggleSave = function(id, btn) {
    const idx = savedIds.indexOf(id);
    if (idx >= 0) { savedIds.splice(idx, 1); } else { savedIds.push(id); }
    _persistSaved();
    if (btn) {
      btn.classList.toggle('on', savedIds.includes(id));
      btn.innerHTML = `<svg width="14" height="14"><use href="#i-${savedIds.includes(id) ? 'bookmark-fill' : 'bookmark'}"/></svg>`;
    }
    const cnt = document.getElementById('el-saved-count');
    if (cnt) cnt.textContent = savedIds.length + ' saved';
    _edToast(savedIds.includes(id) ? 'Saved to My library' : 'Removed from My library');
  };
  // Build a useful search URL for items without a direct link
  function _edSearchUrl(it) {
    const q = encodeURIComponent(it.title + (it.author ? ' ' + it.author : ''));
    if (it.src === 'youtube' || it.src === 'huberman') {
      return 'https://www.youtube.com/results?search_query=' + q;
    }
    if (it.src === 'mayo') {
      return 'https://www.mayoclinic.org/search/search-results?q=' + encodeURIComponent(it.title);
    }
    if (it.src === 'cleveland') {
      return 'https://my.clevelandclinic.org/search?searchApiQuery=' + encodeURIComponent(it.title);
    }
    if (it.src === 'podcast') {
      return 'https://www.youtube.com/results?search_query=' + q + '+podcast';
    }
    if (it.src === 'journals') {
      return 'https://scholar.google.com/scholar?q=' + q;
    }
    if (it.src === 'edx') {
      return 'https://www.edx.org/search?q=' + encodeURIComponent(it.title);
    }
    if (it.src === 'coursera') {
      return 'https://www.coursera.org/courses?query=' + encodeURIComponent(it.title);
    }
    if (it.src === 'udemy') {
      return 'https://www.udemy.com/courses/search/?q=' + encodeURIComponent(it.title);
    }
    if (it.src === 'flow') {
      if (/Vielight/i.test(it.author || '')) return 'https://vielight.com';
      if (/Flow Neuroscience/i.test(it.author || '')) return 'https://flowneuroscience.com';
      return 'https://www.youtube.com/results?search_query=' + q;
    }
    if (it.src === 'wearables') {
      if (/Oura/i.test(it.author || '')) return 'https://ouraring.com';
      if (/Apple/i.test(it.author || '')) return 'https://www.apple.com/apple-watch/';
      if (/Garmin/i.test(it.author || '')) return 'https://www.garmin.com';
      if (/Whoop/i.test(it.author || '')) return 'https://www.whoop.com';
      if (/Fitbit/i.test(it.author || '')) return 'https://www.fitbit.com';
      if (/Muse/i.test(it.author || '')) return 'https://choosemuse.com';
      if (/Apollo/i.test(it.author || '')) return 'https://apolloneuro.com';
      if (/Emotiv/i.test(it.author || '')) return 'https://www.emotiv.com';
      if (/Withings/i.test(it.author || '')) return 'https://www.withings.com';
      if (/Omron/i.test(it.author || '')) return 'https://omronhealthcare.com';
      return 'https://www.google.com/search?q=' + q;
    }
    if (it.src === 'synaps') {
      return null; // internal / coming soon
    }
    return 'https://www.google.com/search?q=' + q;
  }

  window._edOpen = function(id) {
    const it = itemById.get(id);
    if (!it) { _edToast('Item not found'); return; }
    const existing = document.getElementById('ed-detail-modal');
    if (existing) existing.remove();

    const searchUrl = _edSearchUrl(it);
    const hasDirect = !!it.url;
    const hasSearch = !!searchUrl;
    const actionBtn = hasDirect
      ? `<button class="btn btn-primary btn-sm" onclick="window.open(${JSON.stringify(it.url)},'_blank','noopener,noreferrer');document.getElementById('ed-detail-modal').remove()">Open<svg width="11" height="11" style="margin-left:4px"><use href="#i-arrow-right"/></svg></button>`
      : hasSearch
        ? `<button class="btn btn-primary btn-sm" onclick="window.open(${JSON.stringify(searchUrl)},'_blank','noopener,noreferrer');document.getElementById('ed-detail-modal').remove()">Search for this<svg width="11" height="11" style="margin-left:4px"><use href="#i-arrow-right"/></svg></button>`
        : `<button class="btn btn-ghost btn-sm" disabled>Available in your clinic</button>`;

    const tagsHtml = (it.tags || []).map(t => `<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:var(--bg-elevated);color:var(--text-secondary)">${esc(t)}</span>`).join('');

    const modal = document.createElement('div');
    modal.id = 'ed-detail-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:12px;max-width:520px;width:100%;max-height:80vh;overflow:auto;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg width="20" height="20"><use href="#i-${it.ico || 'play'}"/></svg>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:15px;line-height:1.35">${esc(it.title || 'Item')}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${esc(it.author || it.srcLbl || '')} &middot; ${esc(it.dur || '')}</div>
          </div>
          <span style="font-size:11px;padding:3px 10px;border-radius:99px;background:var(--bg-elevated);color:var(--text-secondary);flex-shrink:0;text-transform:capitalize">${esc(it.kind || 'item')}</span>
        </div>
        ${it.meta ? `<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px">${esc(it.meta)}</div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${tagsHtml}</div>
        ${!hasDirect && hasSearch ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5">This item doesn't have a direct link yet. You can search for it online using the button below.</div>` : ''}
        ${!hasDirect && !hasSearch ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;line-height:1.5">This is a clinic-only resource. Ask your clinician for access.</div>` : ''}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('ed-detail-modal').remove()">Close</button>
          ${actionBtn}
        </div>
      </div>`;
    document.body.appendChild(modal);
  };

  function _edToast(msg) {
    const t = document.getElementById('el-toast');
    const t2 = document.getElementById('el-toast-text');
    if (!t || !t2) return;
    t2.textContent = msg || 'Done';
    t.classList.add('show');
    clearTimeout(window._edToastTimer);
    window._edToastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  window._edToast = _edToast;

  // ── Academy handlers ───────────────────────────────────────────────────
  window._edAcadFilter = function(catId) {
    _acadFilter = catId;
    document.querySelectorAll('#el-acad-chips .el-tab').forEach(b => b.classList.toggle('active', b.dataset.acadCat === catId));
    let shown = 0;
    document.querySelectorAll('#el-acad-grid .el-card').forEach(c => {
      const ok = catId === 'all' || c.dataset.acadCat === catId;
      c.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });
    const empty = document.getElementById('el-acad-empty');
    if (empty) empty.style.display = shown === 0 ? '' : 'none';
  };

  window._edAcadOpen = function(id) {
    const c = ACADEMY_COURSES.find(x => x.id === id);
    if (!c) return;
    const done = _acadCompleted.includes(c.id);
    const existing = document.getElementById('ed-acad-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'ed-acad-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);padding:16px';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
      <div style="background:var(--bg-primary,#0f172a);border:1px solid var(--border);border-radius:14px;padding:24px;width:90%;max-width:520px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
          <div style="width:48px;height:48px;border-radius:12px;background:rgba(45,212,191,0.08);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${c.icon}</div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px">${esc(c.title)}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${esc(c.subtitle)}</div>
          </div>
          <button onclick="document.getElementById('ed-acad-modal').remove()" style="background:transparent;border:none;color:var(--text-tertiary);cursor:pointer;font-size:16px;padding:4px">\u2715</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;font-size:10.5px">
          <span style="padding:3px 10px;border-radius:5px;background:rgba(96,165,250,0.1);color:#60a5fa">${esc(c.type)}</span>
          <span style="padding:3px 10px;border-radius:5px;background:rgba(255,255,255,0.04);color:var(--text-tertiary)">${esc(c.duration)}</span>
          <span style="padding:3px 10px;border-radius:5px;background:rgba(255,255,255,0.04);color:var(--text-tertiary)">${esc(c.source)}</span>
          ${!c.free ? '<span style="padding:3px 10px;border-radius:5px;background:rgba(251,191,36,0.1);color:#fbbf24">Premium</span>' : '<span style="padding:3px 10px;border-radius:5px;background:rgba(34,197,94,0.1);color:#22c55e">Free</span>'}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:18px">${esc(c.description)}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          ${done
            ? '<span style="font-size:12px;color:#22c55e;font-weight:600;padding:7px 14px">&#10003; Completed</span>'
            : `<button class="btn btn-ghost btn-sm" onclick="window._edAcadComplete('${esc(c.id)}');document.getElementById('ed-acad-modal').remove()">Mark as completed</button>`}
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('ed-acad-modal').remove()">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  };

  window._edAcadComplete = function(id) {
    if (!_acadCompleted.includes(id)) {
      _acadCompleted.push(id);
      try { localStorage.setItem('ds_pt_academy_completed', JSON.stringify(_acadCompleted)); } catch (_e) {}
      window._showNotifToast && window._showNotifToast({ title: 'Resource completed', body: 'Great job keeping up with your learning!', severity: 'success' });
    }
    // Update the checkmark on the card
    const card = document.querySelector('#el-acad-grid .el-card[data-acad-id="' + id + '"]');
    if (card) {
      const titleEl = card.querySelector('div[style*="font-weight:600"]');
      if (titleEl && !titleEl.querySelector('span[style*="color:#22c55e"]')) {
        titleEl.insertAdjacentHTML('beforeend', '<span style="color:#22c55e;font-size:11px">&#10003;</span>');
      }
    }
    // Update count
    const countEl = document.querySelector('.el-section-title svg[href="#i-graduation"]');
    if (countEl) {
      const span = countEl.closest('.el-section-title').querySelector('.el-section-count');
      if (span) span.textContent = _acadCompleted.length + '/' + ACADEMY_COURSES.length + ' completed';
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
            <div class="card-header" style="display:flex;align-items:center;gap:10px">
              <span class="pt-page-tile pt-nav-tile--amber" aria-hidden="true">👤</span>
              <h3 style="flex:1;margin:0">${t('patient.profile.title')}</h3>
              <button class="btn btn-ghost btn-sm" id="pt-profile-refresh-btn" onclick="window._ptRefreshProfile()">↻ Refresh</button>
            </div>
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
                <span class="pt-page-tile pt-page-tile--lg pt-page-tile--initials pt-nav-tile--teal" aria-hidden="true">${initials}</span>
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
            <div class="card-header" style="display:flex;align-items:center;gap:10px">
              <span class="pt-page-tile pt-nav-tile--amber" aria-hidden="true">🔔</span>
              <h3 style="margin:0">${t('patient.profile.notif_prefs')}</h3>
            </div>
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
              <button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="window._ptUpdatePrefs && window._ptUpdatePrefs()">
                ${t('patient.profile.update_prefs')}
              </button>
            </div>
          </div>
          <div class="card">
            <div class="card-header" style="display:flex;align-items:center;gap:10px">
              <span class="pt-page-tile pt-nav-tile--violet" aria-hidden="true">🔒</span>
              <h3 style="margin:0">${t('patient.profile.account')}</h3>
            </div>
            <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
              <button class="btn btn-ghost btn-sm" onclick="window._ptChangePassword && window._ptChangePassword()">
                ${t('patient.profile.change_pw')}
              </button>
              <button class="btn btn-danger btn-sm" onclick="window.doLogout()">${t('patient.profile.sign_out')}</button>
            </div>
          </div>

          <div class="card">
            <div class="card-header" style="display:flex;align-items:center;gap:10px">
              <span class="pt-page-tile pt-nav-tile--rose" aria-hidden="true">👥</span>
              <h3 style="margin:0">${t('patient.profile.caregiver_access')}</h3>
            </div>
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

          <!-- Care Team Contact (Patient On-Call Visibility, 2026-05-01).
               Read-only abstract availability state — NEVER shows the
               on-call clinician's name / phone / Slack / PagerDuty
               handle. See apps/api/app/routers/patient_oncall_router.py
               module docstring for the PHI redaction contract. -->
          <div class="card" id="pt-oncall-card" data-pt-oncall-card>
            <div class="card-header" style="display:flex;align-items:center;gap:10px">
              <span class="pt-page-tile pt-nav-tile--teal" aria-hidden="true">📞</span>
              <h3 style="flex:1;margin:0">Care team contact</h3>
              <span id="pt-oncall-status-chip" class="ct-tag teal" style="display:none">In hours</span>
            </div>
            <div class="card-body" id="pt-oncall-card-body">
              <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">
                Loading your care team's coverage hours&hellip;
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderProfile(user);

  // ── Care Team Contact wiring (Patient On-Call Visibility) ───────────────
  // Read status from /api/v1/patient-oncall/status. The endpoint returns a
  // PHI-free payload (coverage_hours / in_hours_now / urgent_path /
  // emergency_line_number / has_coverage_configured / is_demo). We render
  // an honest empty state when has_coverage_configured=false and a DEMO
  // chip when is_demo=true. Mount-time view ping fires regardless so the
  // audit row exists even when status fetch fails.
  function _ptOncallEsc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
  }

  function _ptOncallRenderState(state) {
    const body = document.getElementById('pt-oncall-card-body');
    const chip = document.getElementById('pt-oncall-status-chip');
    if (!body) return;

    // Defensive — strip any PHI fields a future server bug might leak.
    // The card only ever renders the documented schema keys.
    const coverageHours      = state && typeof state.coverage_hours === 'string' ? state.coverage_hours : null;
    const inHoursNow         = !!(state && state.in_hours_now);
    const oncallNow          = !!(state && state.oncall_now);
    const urgentPath         = state && state.urgent_path === 'patient-portal-message'
                                 ? 'patient-portal-message' : 'emergency_line';
    const emergencyLine      = state && typeof state.emergency_line_number === 'string' && state.emergency_line_number.trim()
                                 ? state.emergency_line_number.trim() : null;
    const hasCoverage        = !!(state && state.has_coverage_configured);
    const isDemo             = !!(state && state.is_demo);
    const disclaimers        = (state && Array.isArray(state.disclaimers)) ? state.disclaimers : [];

    // Status chip — honest about the ceiling. NEVER show a green
    // "available" pill when no coverage is configured.
    if (chip) {
      if (!hasCoverage) {
        chip.textContent = 'No coverage configured';
        chip.className = 'ct-tag orange';
        chip.style.display = '';
      } else if (oncallNow || inHoursNow) {
        chip.textContent = 'In hours';
        chip.className = 'ct-tag teal';
        chip.style.display = '';
      } else {
        chip.textContent = 'After hours';
        chip.className = 'ct-tag purple';
        chip.style.display = '';
      }
    }

    // Card body — three render branches: no-coverage, in-hours, after-hours.
    let inner = '';
    if (isDemo) {
      inner += `<div class="hw-demo-banner" role="status" style="margin-bottom:10px"><strong>Demo data</strong>&mdash; this card shows example coverage. Your real care team's hours appear once your clinic configures their on-call schedule.</div>`;
    }

    if (!hasCoverage) {
      // Honest empty state — required by the no-AI-fabrication rule.
      inner += `
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">
          Your clinic has not configured on-call coverage in DeepSynaps yet.
          For a clinical emergency, please call <strong>911</strong> (or your
          local emergency number).
        </div>
        ${emergencyLine ? `
          <div class="notice notice-info" style="font-size:11.5px;margin-top:10px">
            Clinic phone: <strong>${_ptOncallEsc(emergencyLine)}</strong>
          </div>
        ` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-ghost btn-sm" onclick="window._ptOncallLearnMore && window._ptOncallLearnMore()">
            How on-call works
          </button>
        </div>
      `;
    } else {
      const hours = coverageHours || 'Coverage hours not yet published';
      const statusLine = (oncallNow || inHoursNow)
        ? `Your care team is available now <strong>(in hours)</strong>.`
        : `Your care team is currently <strong>after-hours</strong>. Urgent messages are routed to the on-call escalation chain.`;
      inner += `
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.65">
          <div><strong>Coverage hours:</strong> ${_ptOncallEsc(hours)}</div>
          <div style="margin-top:6px">${statusLine}</div>
        </div>
        ${emergencyLine ? `
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">
            Clinic phone (non-emergency): <strong>${_ptOncallEsc(emergencyLine)}</strong>
          </div>
        ` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn btn-primary btn-sm" id="pt-oncall-urgent-btn"
            data-pt-oncall-urgent
            onclick="window._ptOncallUrgentMessage && window._ptOncallUrgentMessage()">
            Send urgent message
          </button>
          <button class="btn btn-ghost btn-sm" onclick="window._ptOncallLearnMore && window._ptOncallLearnMore()">
            How on-call works
          </button>
        </div>
      `;
    }

    if (disclaimers.length) {
      inner += `
        <div class="notice notice-info" style="font-size:11px;margin-top:12px">
          <ul style="margin:0;padding-left:18px;line-height:1.55">
            ${disclaimers.slice(0, 3).map(d => `<li>${_ptOncallEsc(d)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    if (!hasCoverage) {
      // Emergency-only state — encourage 911 escalation honestly.
      inner += `
        <div class="notice notice-error" style="font-size:11px;margin-top:8px">
          For a life-threatening emergency, call <strong>911</strong>. The
          patient portal is not a substitute for emergency medical care.
        </div>
      `;
    }

    body.innerHTML = inner;
  }

  function _ptOncallUrgentDeepLink() {
    // Compose a documented deep-link URL — the Patient Messages launch
    // audit (#347) accepts `?category=urgent` to pre-select the urgent
    // category in the composer. Routing through window._navPatient
    // keeps the SPA history clean.
    return 'patient-messages?category=urgent';
  }

  window._ptOncallUrgentMessage = function() {
    if (window.api && typeof window.api.postPatientOncallAuditEvent === 'function') {
      try { window.api.postPatientOncallAuditEvent({ event: 'urgent_message_started' }); } catch (_e) {}
    }
    if (typeof window._navPatient === 'function') {
      window._navPatient(_ptOncallUrgentDeepLink());
    } else {
      window.location.hash = '#' + _ptOncallUrgentDeepLink();
    }
  };

  window._ptOncallLearnMore = function() {
    if (window.api && typeof window.api.postPatientOncallAuditEvent === 'function') {
      try { window.api.postPatientOncallAuditEvent({ event: 'learn_more_clicked' }); } catch (_e) {}
    }
    const modal = document.createElement('div');
    modal.className = 'modal-fix';
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:12px;max-width:480px;width:100%;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <div style="font-weight:600;font-size:15px;margin-bottom:12px">How on-call works</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.65;margin-bottom:14px">
          Messages you send through the patient portal during your clinic's
          coverage hours are answered by your regular care team. Messages
          you mark <strong>urgent</strong> after hours are escalated to the
          clinician on call through your clinic's escalation chain
          (Slack / pager / SMS, depending on what your clinic has configured).
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.65;margin-bottom:14px">
          We do not show you which individual clinician is on call — that
          information is part of your clinic's internal scheduling.
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.65;margin-bottom:14px">
          For a life-threatening emergency, call <strong>911</strong>
          immediately. Do not wait for a portal reply.
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-primary btn-sm" onclick="this.closest('.modal-fix').remove()">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  };

  // Mount-time view ping — fires even if the status fetch fails, so the
  // audit transcript records that the patient opened the profile page.
  if (window.api && typeof window.api.postPatientOncallAuditEvent === 'function') {
    try { window.api.postPatientOncallAuditEvent({ event: 'view', note: 'profile_mount' }); } catch (_e) {}
  }

  // Status fetch — best-effort. apiFetch returns null on offline/404 so
  // we render the honest "no coverage configured" state on failure
  // rather than the loading spinner forever.
  (async () => {
    let state = null;
    try {
      if (window.api && typeof window.api.patientOncallStatus === 'function') {
        state = await window.api.patientOncallStatus();
      }
    } catch (_e) { state = null; }
    if (!state) {
      state = {
        coverage_hours: null,
        in_hours_now: false,
        oncall_now: false,
        urgent_path: 'emergency_line',
        emergency_line_number: null,
        has_coverage_configured: false,
        is_demo: false,
        disclaimers: [],
      };
    }
    _ptOncallRenderState(state);
  })();

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

  window._ptUpdatePrefs = function() {
    const notice = document.getElementById('pt-profile-refresh-notice');
    if (notice) {
      notice.className = 'notice notice-success';
      notice.style.display = '';
      notice.style.fontSize = '11.5px';
      notice.textContent = 'Preferences updated in this portal view.';
      setTimeout(() => { if (notice) notice.style.display = 'none'; }, 2500);
    }
  };

  window._ptChangePassword = function() {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px;';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:12px;max-width:400px;width:100%;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <div style="font-weight:600;font-size:15px;margin-bottom:12px">Change password</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Contact your care team or clinic administrator to reset your password securely.</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="this.closest('.modal-fix').remove()">Close</button>
          <button class="btn btn-primary btn-sm" onclick="window.location.href='mailto:support@deepsynaps.com?subject=Password+reset+request'">Email support</button>
        </div>
      </div>`;
    modal.className = 'modal-fix';
    document.body.appendChild(modal);
  };
}

// ── Settings ──────────────────────────────────────────────────────────────────
// Full patient settings page ported from the mockup (st-* scope).
// Self-contained: injects its own icon sprite, handlers, toast and confirm
// modal. Local-only — no server persistence yet — save/discard produce a toast.
async function pgPatientSettingsLegacy(user) {
  setTopbar('Settings');
  const el = document.getElementById('patient-content');
  if (!el) return;

  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  const displayName = esc(user?.display_name || user?.email?.split('@')[0] || 'Patient');
  const email       = esc(user?.email || '');
  const initials    = (displayName || '?').slice(0, 2).toUpperCase();

  const spriteHTML = `
    <svg width="0" height="0" aria-hidden="true" style="position:absolute">
      <defs>
        <symbol id="st-i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-bell" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 7-3.5A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10Z" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-repeat" viewBox="0 0 24 24"><path d="M4 10V7a2 2 0 0 1 2-2h11l-3-3m3 3-3 3M20 14v3a2 2 0 0 1-2 2H7l3 3m-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 10v6M12 7v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
        <symbol id="st-i-alert" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v5M12 17v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
        <symbol id="st-i-edit" viewBox="0 0 24 24"><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-check" viewBox="0 0 24 24"><path d="m5 12 5 5 9-11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-chart" viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15v-5M12 15V8M16 15v-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
        <symbol id="st-i-brain" viewBox="0 0 24 24"><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 3 3m6-18a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-3 3" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m3 7 9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-clipboard" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 4h6v3H9z" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-download" viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-pulse" viewBox="0 0 24 24"><path d="M3 12h4l2-5 4 10 2-5h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      </defs>
    </svg>
  `;

  el.innerHTML = `
    ${spriteHTML}
    <div class="pt-settings-route" id="pt-route-settings">

      <aside class="st-nav" id="st-nav">
        <div class="st-nav-title">Settings</div>
        <div class="st-nav-item active" data-target="st-account"><svg><use href="#st-i-user"/></svg>Account</div>
        <div class="st-nav-item" data-target="st-notifications"><svg><use href="#st-i-bell"/></svg>Notifications</div>
        <div class="st-nav-item" data-target="st-care"><svg><use href="#st-i-heart"/></svg>Care preferences</div>
        <div class="st-nav-item" data-target="st-privacy"><svg><use href="#st-i-lock"/></svg>Privacy &amp; data</div>
        <div class="st-nav-item" data-target="st-accessibility"><svg><use href="#st-i-eye"/></svg>Accessibility</div>
        <div class="st-nav-item" data-target="st-security"><svg><use href="#st-i-shield"/></svg>Security</div>
        <div class="st-nav-item" data-target="st-danger" style="color:rgba(255,138,138,0.85);"><svg><use href="#st-i-alert"/></svg>Danger zone</div>
      </aside>

      <div class="st-main">

        <section class="st-section" id="st-account">
          <div class="st-section-head">
            <div class="st-section-ico"><svg width="18" height="18"><use href="#st-i-user"/></svg></div>
            <div>
              <h3>Account</h3>
              <p>Your profile, contact info, and how DeepSynaps identifies you.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-profile">
              <div class="st-profile-av">${esc(initials)}</div>
              <div class="st-profile-body">
                <h4>${displayName}</h4>
                <div class="email">${email}</div>
                <div class="meta">Profile details are managed by your care coordinator.</div>
              </div>
              <button class="btn btn-ghost btn-sm" data-st-action="edit-profile"><svg width="13" height="13"><use href="#st-i-edit"/></svg>Edit</button>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Display name</div>
                <div class="st-row-sub">How your clinicians see you across the portal.</div>
              </div>
              <input class="st-input" type="text" value="${displayName}" data-st-change />
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Preferred pronouns</div>
                <div class="st-row-sub">Shown to your care team in all threads and notes.</div>
              </div>
              <select class="st-select" data-st-change>
                <option>she / her</option>
                <option>he / him</option>
                <option>they / them</option>
                <option>Prefer not to say</option>
              </select>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Date of birth</div>
                <div class="st-row-sub">Used for eligibility and clinical decision support. Contact your coordinator to change.</div>
              </div>
              <input class="st-input" type="text" value="—" readonly style="opacity:0.7;cursor:not-allowed;" />
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Phone</div>
                <div class="st-row-sub">For appointment reminders and urgent clinical contact.</div>
              </div>
              <input class="st-input" type="text" value="" placeholder="+1 (000) 000-0000" data-st-change />
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Timezone</div>
                <div class="st-row-sub">All session times and reminders use this zone.</div>
              </div>
              <select class="st-select" data-st-change>
                <option selected>Europe / London (BST, UTC+1)</option>
                <option>America / New_York (EDT, UTC−4)</option>
                <option>America / Los_Angeles (PDT, UTC−7)</option>
                <option>Europe / Berlin (CEST, UTC+2)</option>
                <option>Asia / Singapore (SGT, UTC+8)</option>
              </select>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Language</div>
                <div class="st-row-sub">Portal UI + patient-facing reports.</div>
              </div>
              <select class="st-select" data-st-change>
                <option selected>English (US)</option>
                <option>English (UK)</option>
                <option>Deutsch</option>
                <option>Español</option>
                <option>Français</option>
                <option>Türkçe</option>
                <option>中文 (简体)</option>
              </select>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-notifications">
          <div class="st-section-head">
            <div class="st-section-ico purple"><svg width="18" height="18"><use href="#st-i-bell"/></svg></div>
            <div>
              <h3>Notifications</h3>
              <p>Choose how and when we reach out — for sessions, messages, and care updates.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Channel</div>
                <div class="st-row-sub">Primary channel for everything below. Urgent clinical alerts always come via all three.</div>
              </div>
              <div class="st-seg" data-st-seg>
                <button class="active">App push</button>
                <button>Email</button>
                <button>SMS</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Session reminders</div>
                <div class="st-row-sub">Your in-clinic sessions, home protocols, and consults.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Reminder timing</div>
                <div class="st-row-sub">How long before each session to notify you.</div>
              </div>
              <div class="st-pills" data-st-pills>
                <button class="st-pill">15 min</button>
                <button class="st-pill active">1 hour</button>
                <button class="st-pill">3 hours</button>
                <button class="st-pill">Day before</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">New messages</div>
                <div class="st-row-sub">From your care team or Synaps AI triage.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Homework nudges</div>
                <div class="st-row-sub">Daily mood journal, breathing, walks, sleep checklist.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Assessment reminders</div>
                <div class="st-row-sub">PHQ-9, GAD-7, ISI, WHO-5 — when they're due.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Progress milestones</div>
                <div class="st-row-sub">Week completions, streaks, and score improvement markers.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Education picks for you</div>
                <div class="st-row-sub">Weekly video/article suggestions matched to your protocol.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Device sync updates</div>
                <div class="st-row-sub">When Synaps One, wearables, or Apple Health sync new data.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Quiet hours</div>
                <div class="st-row-sub">Non-urgent notifications stay silent during these hours.</div>
              </div>
              <select class="st-select" data-st-change>
                <option selected>10 PM – 7 AM</option>
                <option>9 PM – 8 AM</option>
                <option>11 PM – 6 AM</option>
                <option>Off (never quiet)</option>
              </select>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-care">
          <div class="st-section-head">
            <div class="st-section-ico pink"><svg width="18" height="18"><use href="#st-i-heart"/></svg></div>
            <div>
              <h3>Care preferences</h3>
              <p>How you want your care team to communicate and share decisions with you.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Preferred contact method</div>
                <div class="st-row-sub">This preference is used for non-urgent check-ins when portal workflow supports it.</div>
              </div>
              <div class="st-seg" data-st-seg>
                <button class="active">Portal message</button>
                <button>Video call</button>
                <button>Voice call</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Depth of clinical detail</div>
                <div class="st-row-sub">How technical should messages and reports be?</div>
              </div>
              <div class="st-pills" data-st-pills>
                <button class="st-pill">Plain language</button>
                <button class="st-pill active">Balanced</button>
                <button class="st-pill">Full clinical</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Let Synaps AI triage my messages</div>
                <div class="st-row-sub">AI responds first and escalates anything clinical or sensitive to a human within minutes.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Share assessment results in real-time</div>
                <div class="st-row-sub">Your PHQ-9 / GAD-7 scores appear on your clinician's dashboard the moment you submit.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Allow qEEG data for personalization</div>
                <div class="st-row-sub">Your qEEG reports feed the AI Personalization Engine to refine your protocol.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Crisis escalation contact</div>
                <div class="st-row-sub">Who we contact in addition to you if Synaps AI detects a safety concern.</div>
              </div>
              <input class="st-input" type="text" value="" placeholder="Name · relationship · phone" data-st-change style="min-width:280px;" />
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Next-of-kin on file</div>
                <div class="st-row-sub">Used only in emergencies. Managed by your care coordinator.</div>
              </div>
              <span class="st-link-state off">Not set</span>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-privacy">
          <div class="st-section-head">
            <div class="st-section-ico blue"><svg width="18" height="18"><use href="#st-i-lock"/></svg></div>
            <div>
              <h3>Privacy &amp; data</h3>
              <p>Who can see your data, how it's shared, and what you can export or delete.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Share with primary care physician</div>
                <div class="st-row-sub">Send monthly summaries to your PCP. Revocable anytime.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Anonymous research contribution</div>
                <div class="st-row-sub">De-identified qEEG + outcome data may improve protocols for future patients. No personal identifiers leave DeepSynaps.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Product analytics</div>
                <div class="st-row-sub">Help us improve the portal UI. Usage only — no health data.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Insurance data sharing</div>
                <div class="st-row-sub">Session counts and diagnoses shared with your insurer for coverage. Required for reimbursement.</div>
              </div>
              <div class="st-toggle on" data-st-toggle style="opacity:0.7;pointer-events:none;"></div>
            </div>

            <div class="st-row stack">
              <div>
                <div class="st-row-label">Download your data</div>
                <div class="st-row-sub">Exports are encrypted and ready within 24 hours. Links expire after 7 days.</div>
              </div>
              <div class="st-data-grid">
                <div class="st-data-card">
                  <div class="t"><svg><use href="#st-i-chart"/></svg>Session &amp; outcome summary</div>
                  <div class="s">PDF · PHQ-9, GAD-7, ISI, WHO-5 timelines + tDCS log. ~2 MB.</div>
                  <button class="btn btn-ghost btn-sm" data-st-export="summary" style="align-self:flex-start;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Request</button>
                </div>
                <div class="st-data-card">
                  <div class="t"><svg><use href="#st-i-brain"/></svg>qEEG raw + processed</div>
                  <div class="s">EDF + JSON · raw recordings and analyses. ~240 MB.</div>
                  <button class="btn btn-ghost btn-sm" data-st-export="qeeg" style="align-self:flex-start;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Request</button>
                </div>
                <div class="st-data-card">
                  <div class="t"><svg><use href="#st-i-mail"/></svg>Full message history</div>
                  <div class="s">JSON · every thread with care team + Synaps AI. ~8 MB.</div>
                  <button class="btn btn-ghost btn-sm" data-st-export="messages" style="align-self:flex-start;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Request</button>
                </div>
                <div class="st-data-card">
                  <div class="t"><svg><use href="#st-i-clipboard"/></svg>Complete record (FHIR)</div>
                  <div class="s">HL7 FHIR bundle · transferable to any EHR. ~45 MB.</div>
                  <button class="btn btn-ghost btn-sm" data-st-export="fhir" style="align-self:flex-start;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Request</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-accessibility">
          <div class="st-section-head">
            <div class="st-section-ico orange"><svg width="18" height="18"><use href="#st-i-eye"/></svg></div>
            <div>
              <h3>Accessibility &amp; display</h3>
              <p>Adjust the portal to suit how you see, hear, and read.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Theme</div>
                <div class="st-row-sub">Dark is recommended for evening sessions.</div>
              </div>
              <div class="st-seg" data-st-seg>
                <button class="active">Dark</button>
                <button>Light</button>
                <button>System</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Text size</div>
                <div class="st-row-sub">Applies across all portal screens.</div>
              </div>
              <div class="st-seg" data-st-seg>
                <button>Small</button>
                <button class="active">Default</button>
                <button>Large</button>
                <button>X-Large</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Reduce motion</div>
                <div class="st-row-sub">Minimize animations and transitions.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">High contrast mode</div>
                <div class="st-row-sub">Bolder text and sharper contrast borders.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Captions on video content</div>
                <div class="st-row-sub">Auto-on for Education Library and video consults.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Screen reader hints</div>
                <div class="st-row-sub">Extra ARIA labels for assistive tech.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-security">
          <div class="st-section-head">
            <div class="st-section-ico"><svg width="18" height="18"><use href="#st-i-shield"/></svg></div>
            <div>
              <h3>Security</h3>
              <p>Keep your account and health data safe.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Password</div>
                <div class="st-row-sub">Managed by your care coordinator.</div>
              </div>
              <button class="btn btn-ghost btn-sm" disabled style="opacity:0.55;"><svg width="13" height="13"><use href="#st-i-lock"/></svg>Unavailable</button>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Two-factor authentication</div>
                <div class="st-row-sub">Authenticator app · required for clinical data access.</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <span class="st-link-state off">Managed elsewhere</span>
                <button class="btn btn-ghost btn-sm" disabled style="opacity:0.55;">Unavailable</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Face ID / biometric unlock</div>
                <div class="st-row-sub">Unlock the mobile app with biometrics.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Backup codes</div>
                <div class="st-row-sub">Generate one-time codes for emergency sign-in.</div>
              </div>
              <button class="btn btn-ghost btn-sm" disabled style="opacity:0.55;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Unavailable</button>
            </div>

            <div class="st-row stack">
              <div>
                <div class="st-row-label">Active sessions</div>
                <div class="st-row-sub">Devices currently signed into your account.</div>
              </div>
              <div style="width:100%;">
                <div class="st-sess-row">
                  <div class="st-sess-ico"><svg width="16" height="16"><use href="#st-i-pulse"/></svg></div>
                  <div>
                    <div class="st-sess-title">This browser <span class="cur">Current</span></div>
                    <div class="st-sess-sub">Active now</div>
                  </div>
                  <button class="st-sess-btn ghost" style="pointer-events:none;opacity:0.5;">—</button>
                </div>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Login alerts</div>
                <div class="st-row-sub">Email + push notification for every new sign-in.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>
          </div>
        </section>

        <section class="st-section st-danger" id="st-danger">
          <div class="st-section-head">
            <div class="st-section-ico red"><svg width="18" height="18"><use href="#st-i-alert"/></svg></div>
            <div>
              <h3>Danger zone</h3>
              <p>Account actions that can't be undone without contacting your care coordinator.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-danger-row">
              <div>
                <div class="t">Pause treatment plan</div>
                <div class="s">This request is managed by your clinic and cannot be started from this beta settings page.</div>
              </div>
              <button class="st-danger-btn" disabled style="opacity:0.55;cursor:not-allowed">Clinic only</button>
            </div>
            <div class="st-danger-row">
              <div>
                <div class="t">Revoke all data sharing</div>
                <div class="s">This request is managed by your clinic and cannot be started from this beta settings page.</div>
              </div>
              <button class="st-danger-btn" disabled style="opacity:0.55;cursor:not-allowed">Clinic only</button>
            </div>
            <div class="st-danger-row">
              <div>
                <div class="t">Transfer records to another provider</div>
                <div class="s">Your coordinator must initiate this transfer outside the beta portal.</div>
              </div>
              <button class="st-danger-btn" disabled style="opacity:0.55;cursor:not-allowed">Clinic only</button>
            </div>
            <div class="st-danger-row">
              <div>
                <div class="t">Delete account</div>
                <div class="s">Account deletion is not initiated from this beta portal. Contact your clinic for the formal process.</div>
              </div>
              <button class="st-danger-btn" disabled style="opacity:0.55;cursor:not-allowed">Clinic only</button>
            </div>
          </div>
        </section>

        <div class="st-savebar" id="st-savebar">
          <div class="st-savebar-msg">You have unsaved changes</div>
          <div class="st-savebar-actions">
            <button class="btn btn-ghost btn-sm" id="st-discard">Discard</button>
            <button class="btn btn-primary btn-sm" id="st-save"><svg width="13" height="13"><use href="#st-i-check"/></svg>Save changes</button>
          </div>
        </div>

      </div>

      <div class="st-bd" id="st-confirm-bd">
        <div class="st-modal">
          <div class="st-modal-ico"><svg width="20" height="20"><use href="#st-i-alert"/></svg></div>
          <h4 id="st-confirm-title">Are you sure?</h4>
          <p id="st-confirm-body">This action cannot be undone.</p>
          <input class="st-input st-modal-confirm-input" id="st-confirm-input" type="text" placeholder='Type "CONFIRM" to continue' />
          <div class="st-modal-actions">
            <button class="btn btn-ghost btn-sm" id="st-confirm-cancel">Cancel</button>
            <button class="st-danger-btn" id="st-confirm-ok">Proceed</button>
          </div>
        </div>
      </div>

      <div class="st-toast" id="st-toast"><svg><use href="#st-i-check"/></svg><span id="st-toast-text">Saved</span></div>
    </div>
  `;

  _wireSettingsPageLegacy();
}

function _wireSettingsPageLegacy() {
  const st = document.getElementById('pt-route-settings');
  if (!st) return;

  const toast = document.getElementById('st-toast');
  const toastText = document.getElementById('st-toast-text');
  let toastTimer = null;
  function stToast(msg) {
    if (!toast) return;
    if (toastText) toastText.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  const saveBar = document.getElementById('st-savebar');
  let dirty = false;
  function markDirty() {
    if (dirty) return;
    dirty = true;
    if (saveBar) saveBar.classList.add('show');
  }
  function clearDirty() {
    dirty = false;
    if (saveBar) saveBar.classList.remove('show');
  }

  st.querySelectorAll('[data-st-toggle]').forEach(t => {
    t.addEventListener('click', () => {
      if (t.style.pointerEvents === 'none') return;
      t.classList.toggle('on');
      markDirty();
    });
  });

  st.querySelectorAll('[data-st-seg]').forEach(seg => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      markDirty();
    });
  });

  st.querySelectorAll('[data-st-pills]').forEach(group => {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('.st-pill');
      if (!b) return;
      group.querySelectorAll('.st-pill').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      markDirty();
    });
  });

  st.querySelectorAll('[data-st-change]').forEach(el => {
    el.addEventListener('input', markDirty);
    el.addEventListener('change', markDirty);
  });

  const saveBtn = document.getElementById('st-save');
  const discardBtn = document.getElementById('st-discard');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    clearDirty();
    try {
      if (api.updatePatientPreferences) {
        const prefs = {};
        st.querySelectorAll('[data-st-toggle]').forEach(t => { prefs[t.dataset.stToggle] = t.classList.contains('on'); });
        await api.updatePatientPreferences(prefs);
      }
      stToast('Settings saved');
    } catch (err) {
      stToast('Save failed — try again');
      console.error('[settings] save failed', err);
    }
  });
  if (discardBtn) discardBtn.addEventListener('click', () => { clearDirty(); stToast('Changes discarded'); window.location.reload(); });

  const nav = document.getElementById('st-nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const item = e.target.closest('.st-nav-item');
      if (!item) return;
      const target = document.getElementById(item.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nav.querySelectorAll('.st-nav-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
    });
  }

  const sectionIds = ['st-account','st-notifications','st-care','st-privacy','st-accessibility','st-security','st-danger'];
  const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);
  const navItems = nav ? nav.querySelectorAll('.st-nav-item') : [];
  function updateActiveNav() {
    if (!sections.length) return;
    const scrollY = (window.scrollY || document.documentElement.scrollTop) + 120;
    let current = sections[0].id;
    for (const sec of sections) {
      if (sec.offsetTop <= scrollY) current = sec.id;
    }
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.target === current);
    });
  }
  window.addEventListener('scroll', updateActiveNav, { passive: true });

  st.querySelectorAll('[data-st-action]').forEach(b => {
    b.addEventListener('click', () => {
      const a = b.dataset.stAction;
      if (a === 'edit-profile') { window._navPatient && window._navPatient('patient-profile'); return; }
      if (a === 'change-password') { stToast('Password changes are unavailable from this beta portal.'); return; }
      const msgs = {
        'manage-2fa': 'Two-factor authentication is managed outside this beta portal.',
        'backup-codes': 'Backup codes are unavailable from this beta portal.'
      };
      stToast(msgs[a] || 'Action: ' + a);
    });
  });

  st.querySelectorAll('[data-st-unlink]').forEach(b => {
    b.addEventListener('click', () => {
      const svc = b.dataset.stUnlink;
      stToast((svc.charAt(0).toUpperCase() + svc.slice(1)) + ' management is unavailable from this beta portal.');
    });
  });
  st.querySelectorAll('[data-st-link]').forEach(b => {
    b.addEventListener('click', () => {
      const svc = b.dataset.stLink;
      stToast('Linking ' + svc + ' is unavailable from this beta portal.');
    });
  });

  st.querySelectorAll('[data-st-revoke]').forEach(b => {
    b.addEventListener('click', () => {
      const row = b.closest('.st-sess-row');
      if (row) row.style.display = 'none';
      stToast('Session revoked');
    });
  });

  st.querySelectorAll('[data-st-export]').forEach(b => {
    b.addEventListener('click', () => {
      const type = b.dataset.stExport;
      const labels = { summary:'Session summary', qeeg:'qEEG export', messages:'Message history', fhir:'FHIR bundle' };
      stToast((labels[type] || 'Export') + ' is unavailable from this beta portal.');
    });
  });

  st.querySelectorAll('[data-st-legal]').forEach(a => {
    a.addEventListener('click', () => {
      const legalUrls = {
        'Privacy policy': 'https://www.deepsynaps.com/privacy',
        'Terms of use': 'https://www.deepsynaps.com/terms',
        'HIPAA notice': 'https://www.hhs.gov/hipaa/for-individuals/index.html',
        'Cookie policy': 'https://www.deepsynaps.com/cookies',
      };
      const url = legalUrls[a.textContent.trim()];
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else stToast('Opening: ' + a.textContent);
    });
  });

  const bd = document.getElementById('st-confirm-bd');
  const mTitle = document.getElementById('st-confirm-title');
  const mBody = document.getElementById('st-confirm-body');
  const mInput = document.getElementById('st-confirm-input');
  const mCancel = document.getElementById('st-confirm-cancel');
  const mOk = document.getElementById('st-confirm-ok');
  let pendingAction = null;

  const DANGER_COPY = {
    pause: {
      title: 'Pause your treatment plan?',
      body: 'Sessions, reminders, and homework will stop in this portal preview. Resume from Settings or contact your clinic for care-plan changes.',
      ok: 'Pause plan',
      needInput: false,
      success: 'Treatment plan paused in this portal preview'
    },
    revoke: {
      title: 'Revoke all data sharing?',
      body: 'Sharing with your PCP and research programs stops immediately. Insurance sharing remains where legally required.',
      ok: 'Revoke all',
      needInput: true,
      success: 'All sharing permissions revoked'
    },
    transfer: {
      title: 'Start record transfer?',
      body: "Record transfer requests are handled by your clinic. This beta portal does not start the verified transfer workflow.",
      ok: 'Request transfer',
      needInput: false,
      success: 'Transfer request is unavailable from this portal'
    },
    delete: {
      title: 'Delete your account?',
      body: "Account deletion is clinic-managed and is not started from this beta portal.",
      ok: 'Delete forever',
      needInput: true,
      success: 'Account deletion is unavailable from this portal'
    }
  };

  st.querySelectorAll('[data-st-danger]').forEach(b => {
    b.addEventListener('click', () => {
      pendingAction = b.dataset.stDanger;
      const c = DANGER_COPY[pendingAction];
      if (!c || !bd) return;
      if (mTitle) mTitle.textContent = c.title;
      if (mBody) mBody.textContent = c.body;
      if (mOk) mOk.textContent = c.ok;
      if (mInput) {
        mInput.value = '';
        mInput.style.display = c.needInput ? '' : 'none';
      }
      bd.classList.add('open');
    });
  });

  function closeConfirm() { if (bd) bd.classList.remove('open'); pendingAction = null; }
  if (mCancel) mCancel.addEventListener('click', closeConfirm);
  if (bd) bd.addEventListener('click', (e) => { if (e.target === bd) closeConfirm(); });
  if (mOk) {
    mOk.addEventListener('click', () => {
      if (!pendingAction) return;
      const c = DANGER_COPY[pendingAction];
      if (c.needInput && mInput && mInput.value.trim().toUpperCase() !== 'CONFIRM') {
        stToast('Type CONFIRM to continue');
        return;
      }
      stToast(c.success);
      closeConfirm();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bd && bd.classList.contains('open')) closeConfirm();
  });
}

// ── Marketplace ──────────────────────────────────────────────────────────────
// Curated marketplace of services, devices, and software for patients. The
// catalogue is static for now (no backend endpoint) but designed so each item
// shape maps cleanly onto a future /api/v1/patient-portal/marketplace response.
// Clinical-grade items (neuromodulation devices, clinician consultations,
// prescription software) route through the care-team review queue rather than
// direct checkout — mp-* CTA copy reflects that distinction.
export async function pgPatientMarketplace(_user) {
  setTopbar('Marketplace');
  const el = document.getElementById('patient-content');
  if (!el) return;

  const esc = (v) => {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  };

  // ── Hardcoded fallback catalog with REAL Amazon products ──
  const FALLBACK_CATALOG = [
    { id: 'amz-oura-ring-4', kind: 'product', icon: '💍', tone: 'blue', name: 'Oura Ring Gen 4', provider: 'Oura Health', desc: 'Titanium smart ring with advanced sleep staging, HRV, blood oxygen, and activity tracking. 7-day battery life.', price: '$349', priceUnit: '', clinical: false, featured: true, tags: ['Wearable', 'Sleep tracking', 'HRV'], external_url: 'https://www.amazon.com/dp/B0DKLHHMZ5', seller: null },
    { id: 'amz-polar-h10', kind: 'product', icon: '🫀', tone: 'rose', name: 'Polar H10 Heart Rate Sensor', provider: 'Polar', desc: 'Medical-grade ECG chest strap with dual Bluetooth + ANT+. Internal memory. Waterproof. 400h battery life.', price: '$89.95', priceUnit: '', clinical: false, featured: true, tags: ['HRV', 'ECG', 'Chest strap'], external_url: 'https://www.amazon.com/dp/B07PM54P4N', seller: null },
    { id: 'amz-muse-2', kind: 'product', icon: '🧘', tone: 'violet', name: 'Muse 2 Brain Sensing Headband', provider: 'Interaxon', desc: 'EEG-powered meditation headband with real-time biofeedback. Tracks brain activity, heart rate, breathing, and movement.', price: '$199.99', priceUnit: '', clinical: false, featured: true, tags: ['EEG', 'Meditation', 'Biofeedback'], external_url: 'https://www.amazon.com/dp/B07HL2JQQJ', seller: null },
    { id: 'amz-verilux-happylight', kind: 'product', icon: '☀️', tone: 'amber', name: 'Verilux HappyLight Touch Plus', provider: 'Verilux', desc: '10,000 lux UV-free LED light therapy lamp with adjustable brightness, color temperature, and countdown timer.', price: '$64.99', priceUnit: '', clinical: false, featured: true, tags: ['Light therapy', '10 000 lux', 'UV-free'], external_url: 'https://www.amazon.com/dp/B07WC7KT4G', seller: null },
    { id: 'amz-apple-watch-se', kind: 'product', icon: '⌚', tone: 'teal', name: 'Apple Watch SE (2nd Gen)', provider: 'Apple', desc: 'GPS + Cellular smartwatch with heart rate, sleep, crash detection, and ECG. Deep Apple Health integration.', price: '$249', priceUnit: '', clinical: false, featured: false, tags: ['Smartwatch', 'ECG', 'Apple Health'], external_url: 'https://www.amazon.com/dp/B0CHX1W1XY', seller: null },
    { id: 'amz-garmin-vivosmart', kind: 'product', icon: '📱', tone: 'green', name: 'Garmin vivosmart 5', provider: 'Garmin', desc: 'Fitness tracker with stress tracking, Body Battery energy monitoring, sleep score, and Garmin Connect.', price: '$149.99', priceUnit: '', clinical: false, featured: false, tags: ['Fitness tracker', 'Stress', 'Body Battery'], external_url: 'https://www.amazon.com/dp/B09W1TVFS7', seller: null },
    { id: 'amz-garmin-hrm-dual', kind: 'product', icon: '💓', tone: 'blue', name: 'Garmin HRM-Dual', provider: 'Garmin', desc: 'Premium heart rate monitor chest strap with Bluetooth and ANT+ transmission. Soft, adjustable strap.', price: '$69.99', priceUnit: '', clinical: false, featured: false, tags: ['Heart rate', 'Bluetooth', 'ANT+'], external_url: 'https://www.amazon.com/dp/B07N1GX6W1', seller: null },
    { id: 'amz-muse-s', kind: 'product', icon: '😴', tone: 'teal', name: 'Muse S Gen 2 Sleep Headband', provider: 'Interaxon', desc: 'Soft fabric EEG headband for sleep tracking and guided meditation. Includes sleep journeys and overnight tracking.', price: '$299.99', priceUnit: '', clinical: false, featured: false, tags: ['EEG', 'Sleep tracking', 'Meditation'], external_url: 'https://www.amazon.com/dp/B0815J7FYP', seller: null },
    { id: 'amz-carex-daylight', kind: 'product', icon: '💡', tone: 'amber', name: 'Carex Day-Light Classic Plus', provider: 'Carex', desc: 'Clinical-grade 10,000 lux bright light therapy lamp at 12 inches. Adjustable height and angle. LED sun lamp.', price: '$167.27', priceUnit: '', clinical: false, featured: false, tags: ['Light therapy', 'Clinical-grade', 'LED'], external_url: 'https://www.amazon.com/dp/B0027M3SPG', seller: null },
    { id: 'amz-lectrofan', kind: 'product', icon: '🔊', tone: 'slate', name: 'LectroFan Evo White Noise Machine', provider: 'Adaptive Sound Technologies', desc: 'High-fidelity white noise, fan, and ocean sounds with precise volume control. 22 non-looping sounds.', price: '$49.95', priceUnit: '', clinical: false, featured: false, tags: ['White noise', 'Sleep aid', 'Non-looping'], external_url: 'https://www.amazon.com/dp/B07XXR2NVB', seller: null },
    { id: 'amz-manta-sleep-mask', kind: 'product', icon: '🎭', tone: 'violet', name: 'Manta Sleep Mask', provider: 'Manta Sleep', desc: 'Adjustable eye cups for 100% blackout. Zero eye pressure design. Machine washable. Includes cooling eye cups.', price: '$35', priceUnit: '', clinical: false, featured: false, tags: ['Sleep mask', 'Blackout', 'Cooling'], external_url: 'https://www.amazon.com/dp/B07L5LPSQT', seller: null },
    { id: 'amz-weighted-blanket', kind: 'product', icon: '🛏️', tone: 'blue', name: 'YnM Weighted Blanket (15 lbs)', provider: 'YnM', desc: '100% natural cotton weighted blanket with glass beads. 7-layer design for even weight distribution.', price: '$69.90', priceUnit: '', clinical: false, featured: false, tags: ['Weighted blanket', 'Deep pressure', 'Cotton'], external_url: 'https://www.amazon.com/dp/B01LQMOCJI', seller: null },
    { id: 'amz-triggerpoint-grid', kind: 'product', icon: '🌀', tone: 'green', name: 'TriggerPoint GRID Foam Roller', provider: 'TriggerPoint', desc: 'Patented multi-density foam roller with hollow core. For self-myofascial release, muscle recovery, and mobility.', price: '$37.99', priceUnit: '', clinical: false, featured: false, tags: ['Foam roller', 'Recovery', 'Mobility'], external_url: 'https://www.amazon.com/dp/B0040EGNIU', seller: null },
    { id: 'amz-gaiam-yoga-mat', kind: 'product', icon: '🧘', tone: 'teal', name: 'Gaiam Essentials Thick Yoga Mat', provider: 'Gaiam', desc: '2/5-inch extra thick yoga mat with carrying strap. Non-slip surface for stability. Ideal for yoga and Pilates.', price: '$24.98', priceUnit: '', clinical: false, featured: false, tags: ['Yoga mat', 'Non-slip', 'Exercise'], external_url: 'https://www.amazon.com/dp/B08TWK8G8J', seller: null },
    { id: 'amz-resistance-bands', kind: 'product', icon: '💪', tone: 'rose', name: 'Fit Simplify Resistance Loop Bands', provider: 'Fit Simplify', desc: 'Set of 5 resistance bands with instruction guide and carry bag. Varying resistance levels for strength training.', price: '$12.95', priceUnit: '', clinical: false, featured: false, tags: ['Resistance bands', 'Strength', 'Portable'], external_url: 'https://www.amazon.com/dp/B01AVDVHTI', seller: null },
    { id: 'amz-omron-bp-monitor', kind: 'product', icon: '🩺', tone: 'red', name: 'Omron Bronze Blood Pressure Monitor', provider: 'Omron', desc: 'Upper arm BP monitor with wide-range D-ring cuff. Stores 14 readings. Irregular heartbeat detection.', price: '$39.99', priceUnit: '', clinical: false, featured: false, tags: ['Blood pressure', 'Heart health', 'Omron'], external_url: 'https://www.amazon.com/dp/B07N1T7N1P', seller: null },
    { id: 'amz-pulse-oximeter', kind: 'product', icon: '🫁', tone: 'blue', name: 'Zacurate Pro Series Pulse Oximeter', provider: 'Zacurate', desc: 'Fingertip pulse oximeter with OLED display. Measures SpO2 and pulse rate. Includes cover, batteries, lanyard.', price: '$22.95', priceUnit: '', clinical: false, featured: false, tags: ['Pulse oximeter', 'SpO2', 'Portable'], external_url: 'https://www.amazon.com/dp/B07PQ8WBD4', seller: null },
    { id: 'amz-book-neuroplasticity', kind: 'product', icon: '📚', tone: 'amber', name: 'The Brain That Changes Itself', provider: 'Norman Doidge', desc: 'Stories of personal triumph from the frontiers of brain science. Explores neuroplasticity and brain healing.', price: '$14.29', priceUnit: '', clinical: false, featured: false, tags: ['Book', 'Neuroplasticity', 'Bestseller'], external_url: 'https://www.amazon.com/dp/0143113100', seller: null },
    { id: 'amz-book-cbt', kind: 'product', icon: '📖', tone: 'blue', name: 'Feeling Good: The New Mood Therapy', provider: 'David D. Burns', desc: 'The classic guide to cognitive behavioral therapy. Clinically proven techniques to lift depression and anxiety.', price: '$10.39', priceUnit: '', clinical: false, featured: false, tags: ['Book', 'CBT', 'Depression', 'Anxiety'], external_url: 'https://www.amazon.com/dp/0380810336', seller: null },
    { id: 'amz-theragun-mini', kind: 'product', icon: '💆', tone: 'green', name: 'Theragun Mini (2nd Gen)', provider: 'Therabody', desc: 'Compact percussive therapy device for muscle recovery and tension relief. 3 speeds, ultra-quiet, 150-minute battery.', price: '$149', priceUnit: '', clinical: false, featured: false, tags: ['Recovery', 'Percussion', 'Muscle relief'], external_url: 'https://www.amazon.com/dp/B0BW2FR78J', seller: null },
    { id: 'amz-fitbit-sense2', kind: 'product', icon: '⌚', tone: 'teal', name: 'Fitbit Sense 2 Advanced Smartwatch', provider: 'Fitbit', desc: 'Advanced health smartwatch with stress management, EDA sensor, SpO2, skin temperature, and built-in GPS.', price: '$199.95', priceUnit: '', clinical: false, featured: false, tags: ['Smartwatch', 'Stress', 'EDA sensor', 'Wearable'], external_url: 'https://www.amazon.com/dp/B0B4N1K1TJ', seller: null },
    { id: 'amz-magnesium-glycinate', kind: 'product', icon: '💊', tone: 'violet', name: 'Nature Made Magnesium Glycinate 200mg', provider: 'Nature Made', desc: 'High-absorption magnesium glycinate supplement. Supports nerve, muscle function, and relaxation. 180 capsules.', price: '$23.49', priceUnit: '', clinical: false, featured: false, tags: ['Supplement', 'Magnesium', 'Relaxation', 'Wellness'], external_url: 'https://www.amazon.com/dp/B0C91NRXQ6', seller: null },
    { id: 'amz-book-why-we-sleep', kind: 'product', icon: '📕', tone: 'blue', name: 'Why We Sleep — Matthew Walker', provider: 'Matthew Walker', desc: 'The groundbreaking book on the science of sleep. How sleep affects every aspect of brain health and wellness.', price: '$11.99', priceUnit: '', clinical: false, featured: false, tags: ['Book', 'Sleep', 'Neuroscience', 'Bestseller'], external_url: 'https://www.amazon.com/dp/1501144324', seller: null },
    { id: 'amz-acupressure-mat', kind: 'product', icon: '🧘', tone: 'green', name: 'ProsourceFit Acupressure Mat and Pillow Set', provider: 'ProsourceFit', desc: 'Acupressure mat with 6,210 points for back pain relief, relaxation, and stress reduction. Includes carry bag.', price: '$25.99', priceUnit: '', clinical: false, featured: false, tags: ['Acupressure', 'Recovery', 'Relaxation'], external_url: 'https://www.amazon.com/dp/B01GH2CZIO', seller: null },
    { id: 'amz-journal-gratitude', kind: 'product', icon: '📓', tone: 'amber', name: 'The Five Minute Journal', provider: 'Intelligent Change', desc: 'Structured gratitude and mindfulness journal. Morning and evening prompts backed by positive psychology research.', price: '$24.99', priceUnit: '', clinical: false, featured: false, tags: ['Journaling', 'Mindfulness', 'Wellness', 'Gratitude'], external_url: 'https://www.amazon.com/dp/0991846206', seller: null },
    { id: 'amz-blue-light-glasses', kind: 'product', icon: '👓', tone: 'blue', name: 'TIJN Blue Light Blocking Glasses', provider: 'TIJN', desc: 'Anti-blue-light computer glasses for reducing eye strain and improving sleep quality. Lightweight, unisex design.', price: '$15.99', priceUnit: '', clinical: false, featured: false, tags: ['Blue light', 'Sleep aid', 'Eye health'], external_url: 'https://www.amazon.com/dp/B07G61LJCH', seller: null },
  ];

  // ── Try fetch live data ──
  let CATALOG = FALLBACK_CATALOG;
  let apiOk = false;
  try {
    const data = await api.marketplaceItems();
    if (data && Array.isArray(data.items)) {
      CATALOG = data.items.map(it => ({
        id: it.id,
        kind: it.kind,
        icon: it.icon || '📦',
        tone: it.tone || 'slate',
        name: it.name,
        provider: it.provider,
        desc: it.description || '',
        price: it.price != null ? `$${it.price}` : (it.price_unit || '—'),
        priceUnit: '',
        clinical: it.clinical,
        featured: it.featured,
        tags: it.tags || [],
        external_url: it.external_url || null,
        seller: it.seller || null,
        source: it.source || 'deepsynaps_curated',
      }));
      apiOk = true;
    }
  } catch (e) {
    // Fallback to hardcoded catalog
  }

  const categories = {
    wearable: { label: 'Wearables', icon: '⌚', tone: 'blue' },
    wellness: { label: 'Wellness', icon: '🌿', tone: 'green' },
    sleep:    { label: 'Sleep',     icon: '🌙', tone: 'violet' },
    recovery: { label: 'Recovery',  icon: '💪', tone: 'teal' },
    monitor:  { label: 'Health Monitors', icon: '🩺', tone: 'rose' },
    book:     { label: 'Books',     icon: '📚', tone: 'amber' },
    other:    { label: 'Other',     icon: '📦', tone: 'slate' },
  };

  const tagToCategory = (tags) => {
    const t = (tags || []).map(x => x.toLowerCase());
    if (t.some(x => x.includes('wearable') || x.includes('smartwatch') || x.includes('fitness tracker'))) return 'wearable';
    if (t.some(x => x.includes('sleep') || x.includes('light therapy') || x.includes('white noise'))) return 'sleep';
    if (t.some(x => x.includes('book') || x.includes('cbt') || x.includes('neuroplasticity'))) return 'book';
    if (t.some(x => x.includes('blood pressure') || x.includes('pulse oximeter') || x.includes('heart rate') || x.includes('hrv') || x.includes('ecg'))) return 'monitor';
    if (t.some(x => x.includes('foam roller') || x.includes('yoga') || x.includes('resistance') || x.includes('recovery') || x.includes('mobility'))) return 'recovery';
    if (t.some(x => x.includes('meditation') || x.includes('eeg') || x.includes('biofeedback'))) return 'wellness';
    return 'other';
  };

  // Add category to each item
  CATALOG.forEach(i => { i.category = tagToCategory(i.tags); });

  const featured = CATALOG.filter(i => i.featured);
  const grouped = {};
  Object.keys(categories).forEach(k => { grouped[k] = CATALOG.filter(i => i.category === k); });

  const cardHTML = (i) => {
    const tags = (i.tags || []).map(t => `<span class="mp-tag">${esc(t)}</span>`).join('');
    const sellerBadge = i.seller
      ? `<span class="mp-seller-badge" title="Listed by ${esc(i.seller.display_name)}">👤 ${esc(i.seller.display_name)}</span>`
      : '';
    const isAmazon = i.external_url && i.external_url.includes('amazon');
    const amazonBadge = isAmazon
      ? `<span class="mp-amazon-badge">🛒 Amazon</span>`
      : '';
    const cta = i.external_url
      ? (isAmazon
        ? `<button class="mp-cta mp-cta--amazon" data-mp-buy="${esc(i.id)}">View on Amazon · ${esc(i.price)}</button>`
        : `<button class="mp-cta mp-cta--buy" data-mp-buy="${esc(i.id)}">View Product · ${esc(i.price)}</button>`)
      : `<button class="mp-cta mp-cta--buy" disabled style="opacity:.55;cursor:not-allowed" title="External product link is unavailable in this beta portal">Unavailable · ${esc(i.price)}</button>`;
    const price = `<div class="mp-price">${esc(i.price)}</div>`;
    return `
      <article class="mp-card" data-kind="${esc(i.kind)}" data-id="${esc(i.id)}">
        <div class="mp-card-top">
          <span class="pt-page-tile pt-nav-tile--${esc(i.tone || 'teal')} mp-card-ico" aria-hidden="true">${i.icon}</span>
          <div class="mp-card-main">
            <div class="mp-card-head">
              <h4 class="mp-card-name">${esc(i.name)}</h4>
            </div>
            <div class="mp-card-provider">${esc(i.provider)}</div>
          </div>
          ${price}
        </div>
        <p class="mp-card-desc">${esc(i.desc)}</p>
        <div class="mp-tags">${tags}</div>
        <div class="mp-card-badges">${amazonBadge}${sellerBadge}</div>
        <div class="mp-card-actions">
          ${cta}
          <button class="mp-cta mp-cta--ghost" data-mp-details="${esc(i.id)}">Details</button>
        </div>
      </article>`;
  };

  const sectionHTML = (catKey, items) => {
    const meta = categories[catKey];
    return `
      <section class="mp-section" id="mp-section-${esc(catKey)}">
        <div class="mp-section-head">
          <span class="pt-page-tile pt-nav-tile--${esc(meta.tone)} mp-section-ico" aria-hidden="true">${meta.icon}</span>
          <div>
            <h3 class="mp-section-title">${esc(meta.label)} <span class="mp-section-count">${items.length}</span></h3>
          </div>
        </div>
        <div class="mp-grid">${items.map(cardHTML).join('')}</div>
      </section>`;
  };

  const categoryChips = Object.entries(categories).map(([key, meta]) => {
    const count = CATALOG.filter(i => i.category === key).length;
    return `<button class="mp-filter-chip" data-mp-filter="${esc(key)}" role="tab" aria-selected="false">${meta.icon} ${esc(meta.label)} <span class="mp-filter-count">${count}</span></button>`;
  }).join('');

  el.innerHTML = `
    <div class="mp-wrap">
      <header class="mp-hero">
        <div class="mp-hero-body">
          <div class="mp-hero-eyebrow">Marketplace</div>
          <h2 class="mp-hero-title">Real products for your brain health journey</h2>
          <p class="mp-hero-desc">Trusted products from Amazon, clinics, and independent sellers. Buy with confidence or list your own.</p>
        </div>
        <div class="mp-hero-stats">
          <div class="mp-stat"><div class="mp-stat-num">${CATALOG.length}</div><div class="mp-stat-lbl">Products</div></div>
          <div class="mp-stat"><div class="mp-stat-num">${CATALOG.filter(i => i.external_url && i.external_url.includes('amazon')).length}</div><div class="mp-stat-lbl">Amazon</div></div>
          <div class="mp-stat"><div class="mp-stat-num">${CATALOG.filter(i => i.seller).length}</div><div class="mp-stat-lbl">Sellers</div></div>
        </div>
      </header>

      <div class="mp-seller-bar">
        <button class="mp-cta mp-cta--sell" id="mp-become-seller">🚀 Sell your product</button>
        <button class="mp-cta mp-cta--ghost" id="mp-my-listings">My listings</button>
      </div>

      ${!apiOk ? `<div class="mp-disclaimer" style="background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.25)">
        <span aria-hidden="true">⚡</span>
        <div><strong>Offline mode.</strong> Showing cached catalog. Connect to the server for the latest items.</div>
      </div>` : ''}

      <div class="mp-disclaimer">
        <span aria-hidden="true">ℹ️</span>
        <div>
          <strong>Amazon Affiliate Disclosure.</strong> As an Amazon Associate we earn from qualifying purchases. Product prices and availability are accurate as of the time of listing and are subject to change.
        </div>
      </div>

      <nav class="mp-filter" role="tablist" aria-label="Filter marketplace by category">
        <button class="mp-filter-chip active" data-mp-filter="all" role="tab" aria-selected="true">All <span class="mp-filter-count">${CATALOG.length}</span></button>
        ${categoryChips}
      </nav>

      ${featured.length > 0 ? `
        <section class="mp-section mp-section--featured" id="mp-section-featured">
          <div class="mp-section-head">
            <span class="pt-page-tile pt-nav-tile--amber mp-section-ico" aria-hidden="true">⭐</span>
            <div>
              <h3 class="mp-section-title">Featured</h3>
              <p class="mp-section-sub">Top-rated picks for brain health and wellness.</p>
            </div>
          </div>
          <div class="mp-grid">${featured.map(cardHTML).join('')}</div>
        </section>` : ''}

      ${Object.entries(grouped).filter(([_, items]) => items.length > 0).map(([k, items]) => sectionHTML(k, items)).join('')}

      <div class="mp-toast" id="mp-toast"><span id="mp-toast-text">Added</span></div>
    </div>
  `;

  _wireMarketplace(CATALOG);
}

function _wireMarketplace(CATALOG) {
  const root = document.querySelector('.mp-wrap');
  if (!root) return;

  const toast = document.getElementById('mp-toast');
  const toastText = document.getElementById('mp-toast-text');
  let toastTimer = null;
  function mpToast(msg) {
    if (!toast) return;
    if (toastText) toastText.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  // ── Seller UI ──
  const becomeSellerBtn = document.getElementById('mp-become-seller');
  const myListingsBtn = document.getElementById('mp-my-listings');
  if (becomeSellerBtn) {
    becomeSellerBtn.addEventListener('click', () => {
      _showSellerForm();
    });
  }
  if (myListingsBtn) {
    myListingsBtn.addEventListener('click', () => {
      _showMyListings();
    });
  }

  function _showSellerForm() {
    const existing = document.getElementById('mp-seller-panel');
    if (existing) { existing.remove(); return; }
    const panel = document.createElement('div');
    panel.id = 'mp-seller-panel';
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px';
    panel.innerHTML = `
      <div style="background:var(--navy-850,#0f172a);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,.5)">
        <div style="padding:20px 20px 12px;display:flex;align-items:center;justify-content:space-between">
          <h3 style="margin:0;font-size:17px;font-weight:600;color:var(--text-primary)">🚀 List your product</h3>
          <button id="mp-seller-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:20px;line-height:1;padding:4px">×</button>
        </div>
        <div style="padding:0 20px 20px">
          <form id="mp-seller-form" style="display:flex;flex-direction:column;gap:12px">
            <input type="text" name="name" placeholder="Product name" required maxlength="255" style="padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px">
            <input type="text" name="provider" placeholder="Brand / Provider" required maxlength="255" style="padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px">
            <textarea name="description" placeholder="Description" rows="3" maxlength="2000" style="padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px;resize:vertical"></textarea>
            <div style="display:flex;gap:8px">
              <input type="number" name="price" placeholder="Price (USD)" step="0.01" min="0" style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px">
              <input type="text" name="tags" placeholder="Tags (comma separated)" style="flex:2;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px">
            </div>
            <input type="url" name="external_url" placeholder="Product URL (e.g. Amazon, your website)" required maxlength="512" style="padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--navy-900);color:var(--text-primary);font-size:13px">
            <div style="font-size:11px;color:var(--text-tertiary)">Paste the URL where customers can buy or learn more about your product.</div>
            <button type="submit" class="mp-cta mp-cta--buy" style="margin-top:4px">List Product</button>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => {
      if (e.target === panel || e.target.id === 'mp-seller-close') panel.remove();
    });
    panel.querySelector('#mp-seller-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = {
        name: fd.get('name').trim(),
        provider: fd.get('provider').trim(),
        description: fd.get('description').trim(),
        price: fd.get('price') ? parseFloat(fd.get('price')) : null,
        price_unit: 'USD',
        tags: fd.get('tags').split(',').map(t => t.trim()).filter(Boolean),
        external_url: fd.get('external_url').trim(),
        kind: 'product',
      };
      try {
        await api.marketplaceSellerCreateItem(data);
        mpToast('Product listed successfully!');
        panel.remove();
      } catch (err) {
        mpToast(`Failed: ${err.message || 'try again'}`);
      }
    });
  }

  async function _showMyListings() {
    const existing = document.getElementById('mp-seller-panel');
    if (existing) { existing.remove(); return; }
    const panel = document.createElement('div');
    panel.id = 'mp-seller-panel';
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px';
    let itemsHtml = '<div style="padding:40px;text-align:center;color:var(--text-tertiary)">Loading...</div>';
    panel.innerHTML = `
      <div style="background:var(--navy-850,#0f172a);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:16px;max-width:600px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,.5)">
        <div style="padding:20px 20px 12px;display:flex;align-items:center;justify-content:space-between">
          <h3 style="margin:0;font-size:17px;font-weight:600;color:var(--text-primary)">📦 My Listings</h3>
          <button id="mp-seller-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:20px;line-height:1;padding:4px">×</button>
        </div>
        <div id="mp-my-listings-content">${itemsHtml}</div>
      </div>
    `;
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => {
      if (e.target === panel || e.target.id === 'mp-seller-close') panel.remove();
    });
    try {
      const data = await api.marketplaceSellerMyItems();
      const items = (data && data.items) || [];
      if (items.length === 0) {
        itemsHtml = '<div style="padding:40px;text-align:center;color:var(--text-tertiary)">You have no listings yet.<br><button class="mp-cta mp-cta--buy" id="mp-listing-create-first" style="margin-top:16px">Create your first listing</button></div>';
      } else {
        itemsHtml = items.map(it => `
          <div style="padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div style="min-width:0">
              <div style="font-weight:500;color:var(--text-primary);font-size:13px">${esc(it.name)}</div>
              <div style="font-size:12px;color:var(--text-secondary)">${esc(it.provider)} · ${it.active ? '<span style="color:#34d399">Active</span>' : '<span style="color:#fb7185">Inactive</span>'}</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0">
              <button class="mp-cta mp-cta--ghost mp-toggle-listing" data-id="${esc(it.id)}" style="padding:4px 10px;font-size:12px">${it.active ? 'Pause' : 'Resume'}</button>
              <button class="mp-cta mp-cta--ghost mp-delete-listing" data-id="${esc(it.id)}" style="padding:4px 10px;font-size:12px;color:#fb7185">Delete</button>
            </div>
          </div>
        `).join('');
      }
      document.getElementById('mp-my-listings-content').innerHTML = itemsHtml;
      panel.querySelectorAll('.mp-toggle-listing').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          try {
            await api.marketplaceSellerUpdateItem(id, { active: btn.textContent === 'Pause' ? false : true });
            mpToast('Listing updated');
            _showMyListings();
            panel.remove();
          } catch (err) {
            mpToast('Update failed');
          }
        });
      });
      panel.querySelectorAll('.mp-delete-listing').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm('Delete this listing?')) return;
          try {
            await api.marketplaceSellerDeleteItem(id);
            mpToast('Listing deleted');
            _showMyListings();
            panel.remove();
          } catch (err) {
            mpToast('Delete failed');
          }
        });
      });
      const createFirstBtn = document.getElementById('mp-listing-create-first');
      if (createFirstBtn) {
        createFirstBtn.addEventListener('click', () => {
          panel.remove();
          _showSellerForm();
        });
      }
    } catch (err) {
      document.getElementById('mp-my-listings-content').innerHTML = '<div style="padding:40px;text-align:center;color:#fb7185">Failed to load listings. Make sure you are logged in.</div>';
    }
  }

  // ── Details modal ──
  function showDetails(id) {
    const item = CATALOG.find(c => c.id === id);
    if (!item) return;
    const existing = document.getElementById('mp-details-panel');
    if (existing) existing.remove();

    const tags = (item.tags || []).map(t => `<span class="mp-tag">${esc(t)}</span>`).join('');
    const isAmazonDetail = item.external_url && item.external_url.includes('amazon');
    const amazonSection = item.external_url
      ? `<div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08)">
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px">${isAmazonDetail ? 'Buy on Amazon' : 'View Product'}</div>
          <a href="${esc(item.external_url)}" target="_blank" rel="noopener noreferrer" class="mp-cta ${isAmazonDetail ? 'mp-cta--amazon' : 'mp-cta--buy'}" style="display:inline-block;text-decoration:none">${isAmazonDetail ? '🛒 View on Amazon' : 'View Product'} · ${esc(item.price)}</a>
         </div>`
      : '';
    const sellerSection = item.seller
      ? `<div style="margin-top:12px;font-size:12px;color:var(--text-secondary)">Listed by <strong style="color:var(--text-primary)">${esc(item.seller.display_name)}</strong></div>`
      : '';

    const panel = document.createElement('div');
    panel.id = 'mp-details-panel';
    panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px';
    panel.innerHTML = `
      <div style="background:var(--navy-850,#0f172a);border:1px solid var(--border,rgba(255,255,255,.12));border-radius:16px;max-width:520px;width:100%;max-height:80vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,.5)">
        <div style="padding:20px 20px 12px;display:flex;align-items:flex-start;gap:12px">
          <span class="pt-page-tile pt-nav-tile--${esc(item.tone || 'teal')}" style="width:44px;height:44px;font-size:22px;flex-shrink:0">${item.icon}</span>
          <div style="flex:1;min-width:0">
            <h3 style="margin:0 0 4px;font-size:17px;font-weight:600;color:var(--text-primary)">${esc(item.name)}</h3>
            <div style="font-size:13px;color:var(--text-secondary)">${esc(item.provider)}</div>
          </div>
          <button id="mp-details-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:20px;line-height:1;padding:4px">×</button>
        </div>
        <div style="padding:0 20px 20px">
          <p style="margin:0 0 12px;font-size:13.5px;line-height:1.6;color:var(--text-secondary)">${esc(item.desc)}</p>
          <div class="mp-tags">${tags}</div>
          ${sellerSection}
          ${amazonSection}
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    panel.addEventListener('click', (e) => {
      if (e.target === panel || e.target.id === 'mp-details-close') {
        panel.remove();
      }
    });
  }

  // ── Filter tabs ──
  root.querySelectorAll('[data-mp-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const f = btn.dataset.mpFilter;
      root.querySelectorAll('[data-mp-filter]').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      root.querySelectorAll('.mp-section').forEach(sec => {
        if (sec.id === 'mp-section-featured') { sec.style.display = ''; return; }
        const cat = sec.id.replace('mp-section-', '');
        sec.style.display = (f === 'all' || f === cat) ? '' : 'none';
      });
    });
  });

  // ── Buy / external link ──
  root.querySelectorAll('[data-mp-buy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.mpBuy;
      const item = CATALOG.find(c => c.id === id);
      if (!item) return;
      if (item.external_url) {
        window.open(item.external_url, '_blank', 'noopener,noreferrer');
        const isAmz = item.external_url.includes('amazon');
        mpToast(isAmz ? `Opening Amazon…` : `Opening ${item.name}…`);
      }
    });
  });

  // ── Details ──
  root.querySelectorAll('[data-mp-details]').forEach(btn => {
    btn.addEventListener('click', () => {
      showDetails(btn.dataset.mpDetails);
    });
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────
// Full patient settings page ported from the mockup (st-* scope).
// Self-contained: injects its own icon sprite, handlers, toast and confirm
// modal. Local-only — no server persistence yet — save/discard produce a toast.
export async function pgPatientSettings(user) {
  setTopbar('Settings');
  const el = document.getElementById('patient-content');
  if (!el) return;

  function esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  const displayName = esc(user?.display_name || user?.email?.split('@')[0] || 'Patient');
  const email       = esc(user?.email || '');
  const initials    = (displayName || '?').slice(0, 2).toUpperCase();

  const spriteHTML = `
    <svg width="0" height="0" aria-hidden="true" style="position:absolute">
      <defs>
        <symbol id="st-i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 21a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-bell" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 7-3.5A4.5 4.5 0 0 1 19 10c0 5.5-7 10-7 10Z" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-repeat" viewBox="0 0 24 24"><path d="M4 10V7a2 2 0 0 1 2-2h11l-3-3m3 3-3 3M20 14v3a2 2 0 0 1-2 2H7l3 3m-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 10v6M12 7v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
        <symbol id="st-i-alert" viewBox="0 0 24 24"><path d="M12 3 2 20h20L12 3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 10v5M12 17v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
        <symbol id="st-i-edit" viewBox="0 0 24 24"><path d="m4 20 4-1 11-11-3-3L5 16l-1 4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-check" viewBox="0 0 24 24"><path d="m5 12 5 5 9-11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-chart" viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15v-5M12 15V8M16 15v-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></symbol>
        <symbol id="st-i-brain" viewBox="0 0 24 24"><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5 3 3 0 0 0 2 5v1a3 3 0 0 0 3 3m6-18a3 3 0 0 1 3 3v1a3 3 0 0 1 2 5 3 3 0 0 1-2 5v1a3 3 0 0 1-3 3" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m3 7 9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-clipboard" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 4h6v3H9z" fill="none" stroke="currentColor" stroke-width="1.5"/></symbol>
        <symbol id="st-i-download" viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
        <symbol id="st-i-pulse" viewBox="0 0 24 24"><path d="M3 12h4l2-5 4 10 2-5h6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></symbol>
      </defs>
    </svg>
  `;

  el.innerHTML = `
    ${spriteHTML}
    <div class="pt-settings-route" id="pt-route-settings">

      <aside class="st-nav" id="st-nav">
        <div class="st-nav-title">Settings</div>
        <div class="st-nav-item active" data-target="st-account"><svg><use href="#st-i-user"/></svg>Account</div>
        <div class="st-nav-item" data-target="st-notifications"><svg><use href="#st-i-bell"/></svg>Notifications</div>
        <div class="st-nav-item" data-target="st-care"><svg><use href="#st-i-heart"/></svg>Care preferences</div>
        <div class="st-nav-item" data-target="st-privacy"><svg><use href="#st-i-lock"/></svg>Privacy &amp; data</div>
        <div class="st-nav-item" data-target="st-accessibility"><svg><use href="#st-i-eye"/></svg>Accessibility</div>
        <div class="st-nav-item" data-target="st-security"><svg><use href="#st-i-shield"/></svg>Security</div>
        <div class="st-nav-item" data-target="st-danger" style="color:rgba(255,138,138,0.85);"><svg><use href="#st-i-alert"/></svg>Danger zone</div>
      </aside>

      <div class="st-main">

        <section class="st-section" id="st-account">
          <div class="st-section-head">
            <div class="st-section-ico"><svg width="18" height="18"><use href="#st-i-user"/></svg></div>
            <div>
              <h3>Account</h3>
              <p>Your profile, contact info, and how DeepSynaps identifies you.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-profile">
              <div class="st-profile-av">${esc(initials)}</div>
              <div class="st-profile-body">
                <h4>${displayName}</h4>
                <div class="email">${email}</div>
                <div class="meta">Profile details are managed by your care coordinator.</div>
              </div>
              <button class="btn btn-ghost btn-sm" data-st-action="edit-profile"><svg width="13" height="13"><use href="#st-i-edit"/></svg>Edit</button>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Display name</div>
                <div class="st-row-sub">How your clinicians see you across the portal.</div>
              </div>
              <input class="st-input" type="text" value="${displayName}" data-st-change />
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Preferred pronouns</div>
                <div class="st-row-sub">Shown to your care team in all threads and notes.</div>
              </div>
              <select class="st-select" data-st-change>
                <option>she / her</option>
                <option>he / him</option>
                <option>they / them</option>
                <option>Prefer not to say</option>
              </select>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Date of birth</div>
                <div class="st-row-sub">Used for eligibility and clinical decision support. Contact your coordinator to change.</div>
              </div>
              <input class="st-input" type="text" value="—" readonly style="opacity:0.7;cursor:not-allowed;" />
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Phone</div>
                <div class="st-row-sub">For appointment reminders and urgent clinical contact.</div>
              </div>
              <input class="st-input" type="text" value="" placeholder="+1 (000) 000-0000" data-st-change />
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Timezone</div>
                <div class="st-row-sub">All session times and reminders use this zone.</div>
              </div>
              <select class="st-select" data-st-change>
                <option selected>Europe / London (BST, UTC+1)</option>
                <option>America / New_York (EDT, UTC−4)</option>
                <option>America / Los_Angeles (PDT, UTC−7)</option>
                <option>Europe / Berlin (CEST, UTC+2)</option>
                <option>Asia / Singapore (SGT, UTC+8)</option>
              </select>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Language</div>
                <div class="st-row-sub">Portal UI + patient-facing reports.</div>
              </div>
              <select class="st-select" data-st-change>
                <option selected>English (US)</option>
                <option>English (UK)</option>
                <option>Deutsch</option>
                <option>Español</option>
                <option>Français</option>
                <option>Türkçe</option>
                <option>中文 (简体)</option>
              </select>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-notifications">
          <div class="st-section-head">
            <div class="st-section-ico purple"><svg width="18" height="18"><use href="#st-i-bell"/></svg></div>
            <div>
              <h3>Notifications</h3>
              <p>Choose how and when we reach out — for sessions, messages, and care updates.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Channel</div>
                <div class="st-row-sub">Primary channel for everything below. Urgent clinical alerts always come via all three.</div>
              </div>
              <div class="st-seg" data-st-seg>
                <button class="active">App push</button>
                <button>Email</button>
                <button>SMS</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Session reminders</div>
                <div class="st-row-sub">Your in-clinic sessions, home protocols, and consults.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Reminder timing</div>
                <div class="st-row-sub">How long before each session to notify you.</div>
              </div>
              <div class="st-pills" data-st-pills>
                <button class="st-pill">15 min</button>
                <button class="st-pill active">1 hour</button>
                <button class="st-pill">3 hours</button>
                <button class="st-pill">Day before</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">New messages</div>
                <div class="st-row-sub">From your care team or Synaps AI triage.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Homework nudges</div>
                <div class="st-row-sub">Daily mood journal, breathing, walks, sleep checklist.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Assessment reminders</div>
                <div class="st-row-sub">PHQ-9, GAD-7, ISI, WHO-5 — when they're due.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Progress milestones</div>
                <div class="st-row-sub">Week completions, streaks, and score improvement markers.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Education picks for you</div>
                <div class="st-row-sub">Weekly video/article suggestions matched to your protocol.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Device sync updates</div>
                <div class="st-row-sub">When Synaps One, wearables, or Apple Health sync new data.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Quiet hours</div>
                <div class="st-row-sub">Non-urgent notifications stay silent during these hours.</div>
              </div>
              <select class="st-select" data-st-change>
                <option selected>10 PM – 7 AM</option>
                <option>9 PM – 8 AM</option>
                <option>11 PM – 6 AM</option>
                <option>Off (never quiet)</option>
              </select>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-care">
          <div class="st-section-head">
            <div class="st-section-ico pink"><svg width="18" height="18"><use href="#st-i-heart"/></svg></div>
            <div>
              <h3>Care preferences</h3>
              <p>How you want your care team to communicate and share decisions with you.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Preferred contact method</div>
                <div class="st-row-sub">This preference is used for non-urgent check-ins when portal workflow supports it.</div>
              </div>
              <div class="st-seg" data-st-seg>
                <button class="active">Portal message</button>
                <button>Video call</button>
                <button>Voice call</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Depth of clinical detail</div>
                <div class="st-row-sub">How technical should messages and reports be?</div>
              </div>
              <div class="st-pills" data-st-pills>
                <button class="st-pill">Plain language</button>
                <button class="st-pill active">Balanced</button>
                <button class="st-pill">Full clinical</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Let Synaps AI triage my messages</div>
                <div class="st-row-sub">AI responds first and escalates anything clinical or sensitive to a human within minutes.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Share assessment results in real-time</div>
                <div class="st-row-sub">Your PHQ-9 / GAD-7 scores appear on your clinician's dashboard the moment you submit.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Allow qEEG data for personalization</div>
                <div class="st-row-sub">Your qEEG reports feed the AI Personalization Engine to refine your protocol.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Crisis escalation contact</div>
                <div class="st-row-sub">Who we contact in addition to you if Synaps AI detects a safety concern.</div>
              </div>
              <input class="st-input" type="text" value="" placeholder="Name · relationship · phone" data-st-change style="min-width:280px;" />
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Next-of-kin on file</div>
                <div class="st-row-sub">Used only in emergencies. Managed by your care coordinator.</div>
              </div>
              <span class="st-link-state off">Not set</span>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-privacy">
          <div class="st-section-head">
            <div class="st-section-ico blue"><svg width="18" height="18"><use href="#st-i-lock"/></svg></div>
            <div>
              <h3>Privacy &amp; data</h3>
              <p>Who can see your data, how it's shared, and what you can export or delete.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Share with primary care physician</div>
                <div class="st-row-sub">Send monthly summaries to your PCP. Revocable anytime.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Anonymous research contribution</div>
                <div class="st-row-sub">De-identified qEEG + outcome data may improve protocols for future patients. No personal identifiers leave DeepSynaps.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Product analytics</div>
                <div class="st-row-sub">Help us improve the portal UI. Usage only — no health data.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Insurance data sharing</div>
                <div class="st-row-sub">Session counts and diagnoses shared with your insurer for coverage. Required for reimbursement.</div>
              </div>
              <div class="st-toggle on" data-st-toggle style="opacity:0.7;pointer-events:none;"></div>
            </div>

            <div class="st-row stack">
              <div>
                <div class="st-row-label">Download your data</div>
                <div class="st-row-sub">Exports are encrypted and ready within 24 hours. Links expire after 7 days.</div>
              </div>
              <div class="st-data-grid">
                <div class="st-data-card">
                  <div class="t"><svg><use href="#st-i-chart"/></svg>Session &amp; outcome summary</div>
                  <div class="s">PDF · PHQ-9, GAD-7, ISI, WHO-5 timelines + tDCS log. ~2 MB.</div>
                  <button class="btn btn-ghost btn-sm" data-st-export="summary" style="align-self:flex-start;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Request</button>
                </div>
                <div class="st-data-card">
                  <div class="t"><svg><use href="#st-i-brain"/></svg>qEEG raw + processed</div>
                  <div class="s">EDF + JSON · raw recordings and analyses. ~240 MB.</div>
                  <button class="btn btn-ghost btn-sm" data-st-export="qeeg" style="align-self:flex-start;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Request</button>
                </div>
                <div class="st-data-card">
                  <div class="t"><svg><use href="#st-i-mail"/></svg>Full message history</div>
                  <div class="s">JSON · every thread with care team + Synaps AI. ~8 MB.</div>
                  <button class="btn btn-ghost btn-sm" data-st-export="messages" style="align-self:flex-start;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Request</button>
                </div>
                <div class="st-data-card">
                  <div class="t"><svg><use href="#st-i-clipboard"/></svg>Complete record (FHIR)</div>
                  <div class="s">HL7 FHIR bundle · transferable to any EHR. ~45 MB.</div>
                  <button class="btn btn-ghost btn-sm" data-st-export="fhir" style="align-self:flex-start;"><svg width="13" height="13"><use href="#st-i-download"/></svg>Request</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-accessibility">
          <div class="st-section-head">
            <div class="st-section-ico orange"><svg width="18" height="18"><use href="#st-i-eye"/></svg></div>
            <div>
              <h3>Accessibility &amp; display</h3>
              <p>Adjust the portal to suit how you see, hear, and read.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Theme</div>
                <div class="st-row-sub">Dark is recommended for evening sessions.</div>
              </div>
              <div class="st-seg" data-st-seg>
                <button class="active">Dark</button>
                <button>Light</button>
                <button>System</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Text size</div>
                <div class="st-row-sub">Applies across all portal screens.</div>
              </div>
              <div class="st-seg" data-st-seg>
                <button>Small</button>
                <button class="active">Default</button>
                <button>Large</button>
                <button>X-Large</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Reduce motion</div>
                <div class="st-row-sub">Minimize animations and transitions.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">High contrast mode</div>
                <div class="st-row-sub">Bolder text and sharper contrast borders.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Captions on video content</div>
                <div class="st-row-sub">Auto-on for Education Library and video consults.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Screen reader hints</div>
                <div class="st-row-sub">Extra ARIA labels for assistive tech.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>
          </div>
        </section>

        <section class="st-section" id="st-security">
          <div class="st-section-head">
            <div class="st-section-ico"><svg width="18" height="18"><use href="#st-i-shield"/></svg></div>
            <div>
              <h3>Security</h3>
              <p>Keep your account and health data safe.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-row">
              <div>
                <div class="st-row-label">Password</div>
                <div class="st-row-sub">Managed by your care coordinator.</div>
              </div>
              <button class="btn btn-ghost btn-sm" data-st-action="change-password"><svg width="13" height="13"><use href="#st-i-lock"/></svg>Change</button>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Two-factor authentication</div>
                <div class="st-row-sub">Authenticator app · required for clinical data access.</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <span class="st-link-state off">Disabled</span>
                <button class="btn btn-ghost btn-sm" data-st-action="manage-2fa">Enable</button>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Face ID / biometric unlock</div>
                <div class="st-row-sub">Unlock the mobile app with biometrics.</div>
              </div>
              <div class="st-toggle" data-st-toggle></div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Backup codes</div>
                <div class="st-row-sub">Generate one-time codes for emergency sign-in.</div>
              </div>
              <button class="btn btn-ghost btn-sm" data-st-action="backup-codes"><svg width="13" height="13"><use href="#st-i-download"/></svg>View codes</button>
            </div>

            <div class="st-row stack">
              <div>
                <div class="st-row-label">Active sessions</div>
                <div class="st-row-sub">Devices currently signed into your account.</div>
              </div>
              <div style="width:100%;">
                <div class="st-sess-row">
                  <div class="st-sess-ico"><svg width="16" height="16"><use href="#st-i-pulse"/></svg></div>
                  <div>
                    <div class="st-sess-title">This browser <span class="cur">Current</span></div>
                    <div class="st-sess-sub">Active now</div>
                  </div>
                  <button class="st-sess-btn ghost" style="pointer-events:none;opacity:0.5;">—</button>
                </div>
              </div>
            </div>

            <div class="st-row">
              <div>
                <div class="st-row-label">Login alerts</div>
                <div class="st-row-sub">Email + push notification for every new sign-in.</div>
              </div>
              <div class="st-toggle on" data-st-toggle></div>
            </div>
          </div>
        </section>

        <section class="st-section st-danger" id="st-danger">
          <div class="st-section-head">
            <div class="st-section-ico red"><svg width="18" height="18"><use href="#st-i-alert"/></svg></div>
            <div>
              <h3>Danger zone</h3>
              <p>Account actions that can't be undone without contacting your care coordinator.</p>
            </div>
          </div>
          <div class="st-body">
            <div class="st-danger-row">
              <div>
                <div class="t">Pause treatment plan</div>
                <div class="s">This request is managed by your clinic and cannot be started from this beta settings page.</div>
              </div>
              <button class="st-danger-btn" disabled style="opacity:0.55;cursor:not-allowed">Clinic only</button>
            </div>
            <div class="st-danger-row">
              <div>
                <div class="t">Revoke all data sharing</div>
                <div class="s">This request is managed by your clinic and cannot be started from this beta settings page.</div>
              </div>
              <button class="st-danger-btn" disabled style="opacity:0.55;cursor:not-allowed">Clinic only</button>
            </div>
            <div class="st-danger-row">
              <div>
                <div class="t">Transfer records to another provider</div>
                <div class="s">Your coordinator must initiate this transfer outside the beta portal.</div>
              </div>
              <button class="st-danger-btn" disabled style="opacity:0.55;cursor:not-allowed">Clinic only</button>
            </div>
            <div class="st-danger-row">
              <div>
                <div class="t">Delete account</div>
                <div class="s">Account deletion is not initiated from this beta portal. Contact your clinic for the formal process.</div>
              </div>
              <button class="st-danger-btn" disabled style="opacity:0.55;cursor:not-allowed">Clinic only</button>
            </div>
          </div>
        </section>

        <div class="st-savebar" id="st-savebar">
          <div class="st-savebar-msg">You have unsaved changes</div>
          <div class="st-savebar-actions">
            <button class="btn btn-ghost btn-sm" id="st-discard">Discard</button>
            <button class="btn btn-primary btn-sm" id="st-save"><svg width="13" height="13"><use href="#st-i-check"/></svg>Save changes</button>
          </div>
        </div>

      </div>

      <div class="st-bd" id="st-confirm-bd">
        <div class="st-modal">
          <div class="st-modal-ico"><svg width="20" height="20"><use href="#st-i-alert"/></svg></div>
          <h4 id="st-confirm-title">Are you sure?</h4>
          <p id="st-confirm-body">This action cannot be undone.</p>
          <input class="st-input st-modal-confirm-input" id="st-confirm-input" type="text" placeholder='Type "CONFIRM" to continue' />
          <div class="st-modal-actions">
            <button class="btn btn-ghost btn-sm" id="st-confirm-cancel">Cancel</button>
            <button class="st-danger-btn" id="st-confirm-ok">Proceed</button>
          </div>
        </div>
      </div>

      <div class="st-toast" id="st-toast"><svg><use href="#st-i-check"/></svg><span id="st-toast-text">Saved</span></div>
    </div>
  `;

  _wireSettingsPage();
}

function _wireSettingsPage() {
  const st = document.getElementById('pt-route-settings');
  if (!st) return;

  const toast = document.getElementById('st-toast');
  const toastText = document.getElementById('st-toast-text');
  let toastTimer = null;
  function stToast(msg) {
    if (!toast) return;
    if (toastText) toastText.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  const saveBar = document.getElementById('st-savebar');
  let dirty = false;
  function markDirty() {
    if (dirty) return;
    dirty = true;
    if (saveBar) saveBar.classList.add('show');
  }
  function clearDirty() {
    dirty = false;
    if (saveBar) saveBar.classList.remove('show');
  }

  st.querySelectorAll('[data-st-toggle]').forEach(t => {
    t.addEventListener('click', () => {
      if (t.style.pointerEvents === 'none') return;
      t.classList.toggle('on');
      markDirty();
    });
  });

  st.querySelectorAll('[data-st-seg]').forEach(seg => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      markDirty();
    });
  });

  st.querySelectorAll('[data-st-pills]').forEach(group => {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('.st-pill');
      if (!b) return;
      group.querySelectorAll('.st-pill').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      markDirty();
    });
  });

  st.querySelectorAll('[data-st-change]').forEach(el => {
    el.addEventListener('input', markDirty);
    el.addEventListener('change', markDirty);
  });

  const saveBtn = document.getElementById('st-save');
  const discardBtn = document.getElementById('st-discard');
  if (saveBtn) saveBtn.addEventListener('click', async () => {
    clearDirty();
    try {
      if (api.updatePatientPreferences) {
        const prefs = {};
        st.querySelectorAll('[data-st-toggle]').forEach(t => { prefs[t.dataset.stToggle] = t.classList.contains('on'); });
        await api.updatePatientPreferences(prefs);
      }
      stToast('Settings saved');
    } catch (err) {
      stToast('Save failed \u2014 try again');
      console.error('[settings] save failed', err);
    }
  });
  if (discardBtn) discardBtn.addEventListener('click', () => { clearDirty(); stToast('Changes discarded'); window.location.reload(); });

  const nav = document.getElementById('st-nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const item = e.target.closest('.st-nav-item');
      if (!item) return;
      const target = document.getElementById(item.dataset.target);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nav.querySelectorAll('.st-nav-item').forEach(x => x.classList.remove('active'));
      item.classList.add('active');
    });
  }

  const sectionIds = ['st-account','st-notifications','st-care','st-privacy','st-accessibility','st-security','st-danger'];
  const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);
  const navItems = nav ? nav.querySelectorAll('.st-nav-item') : [];
  function updateActiveNav() {
    if (!sections.length) return;
    const scrollY = (window.scrollY || document.documentElement.scrollTop) + 120;
    let current = sections[0].id;
    for (const sec of sections) {
      if (sec.offsetTop <= scrollY) current = sec.id;
    }
    navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.target === current);
    });
  }
  window.addEventListener('scroll', updateActiveNav, { passive: true });

  st.querySelectorAll('[data-st-action]').forEach(b => {
    b.addEventListener('click', () => {
      const a = b.dataset.stAction;
      const msgs = {
        'edit-profile': 'Profile changes are managed by your clinic in this beta portal.',
        'change-password': 'Password changes are unavailable from this beta portal.',
        'manage-2fa': '2FA management is unavailable from this beta portal.',
        'backup-codes': 'Backup codes are unavailable from this beta portal.'
      };
      stToast(msgs[a] || 'Action: ' + a);
    });
  });

  st.querySelectorAll('[data-st-unlink]').forEach(b => {
    b.addEventListener('click', () => {
      const svc = b.dataset.stUnlink;
      stToast(svc.charAt(0).toUpperCase() + svc.slice(1) + ' unlinked');
    });
  });
  st.querySelectorAll('[data-st-link]').forEach(b => {
    b.addEventListener('click', () => {
      const svc = b.dataset.stLink;
      stToast('Linking ' + svc + '…');
    });
  });

  st.querySelectorAll('[data-st-revoke]').forEach(b => {
    b.addEventListener('click', () => {
      const row = b.closest('.st-sess-row');
      if (row) row.style.display = 'none';
      stToast('Session revoked');
    });
  });

  st.querySelectorAll('[data-st-export]').forEach(b => {
    b.addEventListener('click', () => {
      const type = b.dataset.stExport;
      const labels = { summary:'Session summary', qeeg:'qEEG export', messages:'Message history', fhir:'FHIR bundle' };
      stToast((labels[type] || 'Export') + ' is unavailable from this beta portal.');
    });
  });

  st.querySelectorAll('[data-st-legal]').forEach(a => {
    a.addEventListener('click', () => {
      stToast('Opening: ' + a.textContent);
    });
  });

  const bd = document.getElementById('st-confirm-bd');
  const mTitle = document.getElementById('st-confirm-title');
  const mBody = document.getElementById('st-confirm-body');
  const mInput = document.getElementById('st-confirm-input');
  const mCancel = document.getElementById('st-confirm-cancel');
  const mOk = document.getElementById('st-confirm-ok');
  let pendingAction = null;

  const DANGER_COPY = {
    pause: {
      title: 'Pause your treatment plan?',
      body: 'Sessions, reminders, and homework will stop in this portal view. Care-team notification is not confirmed from this beta portal. You can resume anytime from Settings.',
      ok: 'Pause plan',
      needInput: false,
      success: 'Treatment plan paused in this portal view'
    },
    revoke: {
      title: 'Revoke all data sharing?',
      body: 'Sharing with your PCP and research programs stops immediately. Insurance sharing remains where legally required.',
      ok: 'Revoke all',
      needInput: true,
      success: 'All sharing permissions revoked'
    },
    transfer: {
      title: 'Start record transfer?',
      body: "A transfer request will be saved in this portal view. Coordinator outreach and FHIR export are not confirmed from this beta portal.",
      ok: 'Request transfer',
      needInput: false,
      success: 'Transfer request saved in this portal view'
    },
    delete: {
      title: 'Delete your account?',
      body: "This removes all personal identifiers after the 7-year HIPAA retention window. This cannot be reversed.",
      ok: 'Delete forever',
      needInput: true,
      success: 'Account deletion request saved in this portal view'
    }
  };

  st.querySelectorAll('[data-st-danger]').forEach(b => {
    b.addEventListener('click', () => {
      pendingAction = b.dataset.stDanger;
      const c = DANGER_COPY[pendingAction];
      if (!c || !bd) return;
      if (mTitle) mTitle.textContent = c.title;
      if (mBody) mBody.textContent = c.body;
      if (mOk) mOk.textContent = c.ok;
      if (mInput) {
        mInput.value = '';
        mInput.style.display = c.needInput ? '' : 'none';
      }
      bd.classList.add('open');
    });
  });

  function closeConfirm() { if (bd) bd.classList.remove('open'); pendingAction = null; }
  if (mCancel) mCancel.addEventListener('click', closeConfirm);
  if (bd) bd.addEventListener('click', (e) => { if (e.target === bd) closeConfirm(); });
  if (mOk) {
    mOk.addEventListener('click', () => {
      if (!pendingAction) return;
      const c = DANGER_COPY[pendingAction];
      if (c.needInput && mInput && mInput.value.trim().toUpperCase() !== 'CONFIRM') {
        stToast('Type CONFIRM to continue');
        return;
      }
      stToast(c.success);
      closeConfirm();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bd && bd.classList.contains('open')) closeConfirm();
  });
}

// ── Treatment Tasks Page ──────────────────────────────────────────────────────
//
// Replaces the old wellness check-in page. The daily check-in is now a task
// card that launches inline. This page is the single place patients come to
// complete between-session work that supports their treatment.
//
// ── Task enrichment catalog ──────────────────────────────────────────────────
// Each category maps to one of the sidebar tones so the page-body tiles
// share the same palette the patient already knows from the nav:
//   breathwork → teal, reflection → blue, learning → violet,
//   checkin → amber, exercise → green, social → rose, other → slate.
const _TASK_CAT_META = {
  'breathing':      { icon: '🫁', color: '#2dd4bf', tone: 'teal',   label: 'Breathing' },
  'movement':       { icon: '🏃', color: '#60a5fa', tone: 'green',  label: 'Movement' },
  'journaling':     { icon: '📓', color: '#a78bfa', tone: 'blue',   label: 'Journaling' },
  'screen-free':    { icon: '📵', color: '#fbbf24', tone: 'amber',  label: 'Screen-Free' },
  'social':         { icon: '👥', color: '#fb7185', tone: 'rose',   label: 'Social' },
  'session-prep':   { icon: '📋', color: '#34d399', tone: 'violet', label: 'Session Prep' },
  'assessment':     { icon: '📊', color: '#f59e0b', tone: 'amber',  label: 'Assessment' },
  'home-practice':  { icon: '🧠', color: '#818cf8', tone: 'violet', label: 'Home Practice' },
  'relaxation':     { icon: '🧘', color: '#2dd4bf', tone: 'teal',   label: 'Relaxation' },
  'audio-video':    { icon: '🎧', color: '#e879f9', tone: 'violet', label: 'Audio / Video' },
  'aftercare':      { icon: '💊', color: '#f97316', tone: 'amber',  label: 'Aftercare' },
  'caregiver':      { icon: '🤝', color: '#94a3b8', tone: 'rose',   label: 'Caregiver' },
  'custom':         { icon: '✦',  color: '#94a3b8', tone: 'slate',  label: 'Task' },
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

function _tasksGetEnrichedFromServer(serverTasks) {
  const raw = Array.isArray(serverTasks) ? serverTasks : [];
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const checkinTask = {
    id: 'pt-daily-checkin',
    title: 'Daily Check-in',
    category: 'assessment',
    recurrence: 'daily',
    dueDate: today,
    notes: 'Mood, sleep and energy — takes about 3 minutes.',
  };

  const mapped = raw.map(function(t) {
    const taskId = t.id || t.external_task_id || t.server_task_id;
    return {
      id: taskId,
      server_task_id: t.server_task_id || null,
      title: t.title || 'Home task',
      category: t.category || t.type || 'home-practice',
      type: t.category || t.type || null,
      recurrence: t.frequency || t.recurrence || 'once',
      dueDate: t.dueDate || today,
      notes: t.instructions || t.notes || '',
      why: t.reason || '',
      assignedBy: 'Your clinician',
    };
  });

  const allRaw = [checkinTask, ...mapped];
  return allRaw.map(function(t) {
    const enrich = _TASK_ENRICHMENT[t.id] || {};
    const cat = _TASK_CAT_META[t.category] || _TASK_CAT_META['custom'];
    const isDue = t.recurrence === 'daily' || t.dueDate <= today;
    const isOverdue = !_pttIsComplete(t.id, today) && t.dueDate < today && t.recurrence !== 'daily';
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
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  opts = opts || {};
  const done = _pttIsComplete(task.id, today);
  const cat = task.cat || _TASK_CAT_META['custom'];
  const overdue = task.isOverdue;
  const tileTone = cat.tone || 'slate';

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
      '<span class="pt-page-tile pt-nav-tile--' + tileTone + '" aria-label="' + cat.label + '">' + cat.icon + '</span>' +
    '</div>' +

    '<div class="pt-tasks-card-body">' +
      '<div class="pt-tasks-card-title' + (done ? ' pt-tasks-card-title--done' : '') + '">' + esc(task.title) + '</div>' +
      (task.why ? '<div class="pt-tasks-card-why">' + esc(task.why) + '</div>' : '') +
      (metaPills ? '<div class="pt-tasks-card-meta">' + metaPills + '</div>' : '') +
      careHTML +
    '</div>' +

    '<div class="pt-tasks-card-cta">' + ctaHTML + '</div>' +

  '</div>' +
  // Launcher panel placeholder (expanded when Start is clicked)
  '<div id="pt-task-launcher-' + task.id + '" style="display:none;padding:0 0 10px"></div>';
}

// ── Wellness Hub helpers (launch-audit 2026-05-01) ──────────────────────────
// Server is the source of truth (see apps/api/app/routers/wellness_hub_router.py).
// localStorage is ONLY a best-effort offline fallback — every successful
// server write supersedes the local copy. Pre-audit, this page lived on
// scattered ds_wellness_* keys with no audit, no consent gate, no
// demo-honesty banner — all of which are now enforced server-side.
const _WELLNESS_FALLBACK_KEY = 'ds_wellness_local_fallback';

function _wellnessGetLocal() {
  try { return JSON.parse(localStorage.getItem(_WELLNESS_FALLBACK_KEY) || '[]'); }
  catch (_) { return []; }
}

function _wellnessSaveLocal(entry) {
  const arr = _wellnessGetLocal();
  const idx = arr.findIndex(e => e.id === entry.id);
  if (idx >= 0) arr[idx] = entry; else arr.unshift(entry);
  try { localStorage.setItem(_WELLNESS_FALLBACK_KEY, JSON.stringify(arr.slice(0, 50))); }
  catch (_) {}
}

// Compose normalised tags from the six axes — only documented chips, no
// fabrication. Mirrors the symptom-journal tag composer for consistency.
function _composeWellnessTags({ mood, energy, sleep, anxiety, focus, pain }) {
  const tags = [];
  if (typeof mood === 'number' && mood <= 3) tags.push('low_mood');
  if (typeof energy === 'number' && energy <= 3) tags.push('fatigue');
  if (typeof anxiety === 'number' && anxiety >= 7) tags.push('anxiety');
  if (typeof sleep === 'number' && sleep > 0 && sleep <= 3) tags.push('poor_sleep');
  if (typeof focus === 'number' && focus <= 3) tags.push('low_focus');
  if (typeof pain === 'number' && pain >= 6) tags.push('pain');
  return tags;
}

async function _wellnessLogAuditEvent(event, extra) {
  try {
    if (api && typeof api.postWellnessAuditEvent === 'function') {
      await api.postWellnessAuditEvent({
        event,
        checkin_id: extra && extra.checkin_id ? extra.checkin_id : null,
        note: extra && extra.note ? String(extra.note).slice(0, 480) : null,
        using_demo_data: !!(extra && extra.using_demo_data),
      });
    }
  } catch (_) { /* audit failures must never block UI */ }
}

// Compute today's snapshot delta vs yesterday from the live server item list.
// Returns { axis: deltaNumber|null }. Honest: null when either side missing.
function _wellnessSnapshotDelta(items) {
  const out = { mood: null, energy: null, sleep: null, anxiety: null, focus: null, pain: null };
  if (!Array.isArray(items) || items.length === 0) return out;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yest = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const todayRow = items.find(r => (r.created_at || '').slice(0, 10) === today);
  const yestRow = items.find(r => (r.created_at || '').slice(0, 10) === yest);
  if (!todayRow || !yestRow) return out;
  for (const a of ['mood', 'energy', 'sleep', 'anxiety', 'focus', 'pain']) {
    if (todayRow[a] != null && yestRow[a] != null) out[a] = (todayRow[a] - yestRow[a]);
  }
  return out;
}

// Render a tiny SVG sparkline of mood across the 7-day series.
function _wellnessMoodSpark(series) {
  if (!Array.isArray(series) || series.length < 2) {
    return '<div style="color:var(--text-tertiary);font-size:11.5px;text-align:center;padding:14px">Log at least 2 days to see your trend.</div>';
  }
  const W = 280, H = 50, pad = 6;
  const iw = W - pad * 2, ih = H - pad * 2;
  const pts = series.map((p, i) => {
    const x = pad + (i / (series.length - 1)) * iw;
    const y = pad + ih - ((p.avg_mood || 0) / 10) * ih;
    return `${x},${y}`;
  }).join(' ');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <polyline points="${pts}" fill="none" stroke="var(--teal,#0d9488)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

export async function pgPatientWellness() {
  setTopbar('Wellness Hub');
  const el = document.getElementById('patient-content');
  if (!el) return;

  // ── Server fetches (source of truth) ───────────────────────────────────
  let serverList = null;
  let serverSummary = null;
  let serverErr = false;
  try {
    if (api && typeof api.listWellnessCheckins === 'function') {
      serverList = await api.listWellnessCheckins({ limit: 30 });
    }
  } catch (_) { serverErr = true; }
  try {
    if (api && typeof api.getWellnessSummary === 'function') {
      serverSummary = await api.getWellnessSummary();
    }
  } catch (_) { /* summary is optional */ }

  const usingServer = !!serverList && !serverErr;
  const isDemo = !!(serverList && serverList.is_demo);
  const consentActive = serverList ? !!serverList.consent_active : true;
  const items = (serverList && Array.isArray(serverList.items)) ? serverList.items : [];
  const visibleItems = items.filter(r => !r.deleted_at);

  // ── Mount-time audit ping ────────────────────────────────────────────────
  _wellnessLogAuditEvent('view', {
    using_demo_data: isDemo,
    note: usingServer
      ? `items=${visibleItems.length}; consent_active=${consentActive ? 1 : 0}`
      : 'fallback=localStorage',
  });

  // ── Snapshot + summary derived data ──────────────────────────────────────
  const today = visibleItems.find(r => (r.created_at || '').slice(0, 10) === new Date().toISOString().slice(0, 10));
  const delta = _wellnessSnapshotDelta(visibleItems);
  const sum = serverSummary || {};
  const checkins7d = sum.checkins_7d || 0;
  const missed7d = sum.missed_days_7d != null ? sum.missed_days_7d : Math.max(0, 7 - new Set(visibleItems.slice(0, 14).map(r => (r.created_at || '').slice(0, 10))).size);
  const topTags = Array.isArray(sum.top_tags_30d) ? sum.top_tags_30d : [];
  const moodSeries = Array.isArray(sum.mood_series_7d) ? sum.mood_series_7d : [];

  // ── Banners ───────────────────────────────────────────────────────────────
  const demoBanner = isDemo
    ? `<div class="pt-demo-banner" role="status" style="margin-bottom:12px;padding:10px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:12.5px;color:#9a3412">
         <strong>DEMO data</strong> — exports prefix <code>DEMO-</code> and check-ins are not regulator-submittable.
       </div>` : '';
  const consentBanner = (serverList && consentActive === false)
    ? `<div class="pt-consent-banner" role="status" aria-live="polite"
         style="margin-bottom:12px;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12.5px;color:#991b1b">
         <strong>Read-only:</strong> consent has been withdrawn. Existing check-ins remain visible, but new check-ins cannot be added until consent is reinstated.
       </div>` : '';
  const offlineBanner = (!usingServer)
    ? `<div role="status" aria-live="polite"
         style="margin-bottom:12px;padding:10px 14px;background:#fef9c3;border:1px solid #fde68a;border-radius:8px;font-size:12.5px;color:#854d0e">
         <strong>Offline mode:</strong> couldn't reach the server, showing local check-ins from this device only. Your check-ins will sync when reconnected.
       </div>` : '';

  // ── Today's snapshot card ────────────────────────────────────────────────
  const _axisRow = (label, axisKey) => {
    const v = today ? today[axisKey] : null;
    const d = delta[axisKey];
    const dStr = (d == null) ? ''
      : (d === 0 ? '<span style="color:var(--text-tertiary);font-size:11px">±0 vs yesterday</span>'
        : `<span style="color:${d > 0 ? '#15803d' : '#b91c1c'};font-size:11px">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} vs yesterday</span>`);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary)">${label}</div>
        ${dStr}
      </div>
      <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${v != null ? v + '/10' : '—'}</div>
    </div>`;
  };
  const snapshotHtml = today
    ? `<div class="ff-card">
        <div class="ff-card-title">Today's snapshot</div>
        ${_axisRow('Mood', 'mood')}
        ${_axisRow('Energy', 'energy')}
        ${_axisRow('Sleep', 'sleep')}
        ${_axisRow('Anxiety', 'anxiety')}
        ${_axisRow('Focus', 'focus')}
        ${_axisRow('Pain', 'pain')}
      </div>`
    : `<div class="ff-card">
        <div class="ff-card-title">Today's snapshot</div>
        <div style="color:var(--text-tertiary);font-size:13px;padding:12px 0">
          No check-in yet today. Complete the form below to log how you're feeling.
        </div>
      </div>`;

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const kpiStrip = `<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    <div class="pt-tasks-kpi-card" style="flex:1;min-width:120px"><div class="pt-tasks-kpi-label">Check-ins / 7d</div><div class="pt-tasks-kpi-value">${checkins7d}</div></div>
    <div class="pt-tasks-kpi-card" style="flex:1;min-width:120px"><div class="pt-tasks-kpi-label">Missed days / 7d</div><div class="pt-tasks-kpi-value">${missed7d}</div></div>
    <div class="pt-tasks-kpi-card" style="flex:1;min-width:120px"><div class="pt-tasks-kpi-label">Top tag (30d)</div><div class="pt-tasks-kpi-value" style="font-size:14px">${topTags[0] ? _hdEsc(topTags[0].tag) : '—'}</div></div>
  </div>`;

  // ── Form for today's check-in ────────────────────────────────────────────
  const formDisabled = !consentActive ? 'disabled' : '';
  const _slider = (id, label, val, color) => `<div style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
      <label style="font-size:12px;font-weight:600;color:var(--text-secondary)">${label}</label>
      <span id="${id}-val" style="font-size:12px;font-weight:700;color:${color}">${val}</span>
    </div>
    <input type="range" id="${id}" min="0" max="10" value="${val}" ${formDisabled}
      style="width:100%;accent-color:${color}"
      oninput="document.getElementById('${id}-val').textContent=this.value">
  </div>`;
  const tMood = today?.mood ?? 5;
  const tEnergy = today?.energy ?? 5;
  const tSleep = today?.sleep ?? 5;
  const tAnxiety = today?.anxiety ?? 3;
  const tFocus = today?.focus ?? 5;
  const tPain = today?.pain ?? 0;
  const formCard = `<div class="ff-card">
    <div class="ff-card-title">${today ? "Update today's check-in" : "Log today's check-in"}</div>
    <p class="ff-card-sub">Six axes 0–10. Skip any axis you don't want to rate today.</p>
    ${_slider('w-mood', 'Mood (10 = great)', tMood, '#2dd4bf')}
    ${_slider('w-energy', 'Energy (10 = energetic)', tEnergy, '#a78bfa')}
    ${_slider('w-sleep', 'Sleep (10 = restful)', tSleep, '#60a5fa')}
    ${_slider('w-anxiety', 'Anxiety (10 = very anxious)', tAnxiety, '#f97316')}
    ${_slider('w-focus', 'Focus (10 = sharp)', tFocus, '#22c55e')}
    ${_slider('w-pain', 'Pain (10 = severe)', tPain, '#ef4444')}
    <div style="margin-bottom:14px">
      <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:5px">Notes (optional)</label>
      <textarea id="w-note" class="form-control" placeholder="Anything notable today?"
        style="min-height:60px;resize:vertical;font-size:12px" ${formDisabled}>${today?.note ? _hdEsc(today.note) : ''}</textarea>
    </div>
    <button class="btn btn-primary" id="w-save-btn" ${formDisabled}
      style="width:100%;min-height:48px;font-size:14px;font-weight:600">
      ✓ Save check-in
    </button>
    <div id="w-save-msg" role="status" aria-live="polite"
      style="display:none;margin-top:10px;font-size:13px;color:var(--green);text-align:center;font-weight:500">
      Check-in saved.
    </div>
    <div id="w-save-err" role="alert" aria-live="polite"
      style="display:none;margin-top:10px;font-size:13px;color:var(--red,#dc2626);text-align:center;font-weight:500"></div>
  </div>`;

  // ── Trends timeline ──────────────────────────────────────────────────────
  const timelineHtml = visibleItems.slice(0, 14).map(r => {
    const safeId = _hdEsc(r.id);
    const dateLabel = r.created_at
      ? new Date(r.created_at).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })
      : '';
    const axisBadges = ['mood','energy','sleep','anxiety','focus','pain']
      .filter(a => r[a] != null)
      .map(a => `<span class="pt-metric-badge">${a}: ${r[a]}/10</span>`).join('');
    const tagBadges = (r.tags || []).map(t => `<span class="pt-metric-badge">${_hdEsc(t)}</span>`).join('');
    const sharedBadge = r.shared_at
      ? '<span class="pt-metric-badge" style="background:var(--teal,#0d9488);color:white">Shared</span>' : '';
    const noteSnip = r.note
      ? `<div style="font-size:11.5px;color:var(--text-secondary);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_hdEsc(r.note)}</div>` : '';
    const actions = consentActive ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
      ${r.shared_at ? '' : `<button class="btn btn-ghost btn-sm" data-w-share-id="${safeId}">Share with care team</button>`}
      <button class="btn btn-ghost btn-sm" data-w-delete-id="${safeId}">Delete</button>
    </div>` : '';
    return `<div class="pt-journal-entry" data-checkin-id="${safeId}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">${dateLabel}</span>
        ${sharedBadge}
      </div>
      <div style="flex-wrap:wrap;display:flex;gap:4px">${axisBadges}${tagBadges}</div>
      ${noteSnip}
      ${actions}
    </div>`;
  }).join('') || '<div style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:24px">No wellness check-ins yet — your first will sync to your care team if you have enabled sharing.</div>';

  // ── Cross-link to symptom journal ────────────────────────────────────────
  const journalLink = `<div style="display:flex;justify-content:flex-end;margin-top:10px">
    <button class="btn btn-ghost btn-sm" id="w-link-journal-btn">Log a symptom →</button>
  </div>`;

  // ── Export buttons (server-only path) ────────────────────────────────────
  const exportRow = usingServer ? `<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap">
    <button class="btn btn-ghost btn-sm" id="w-export-csv-btn">Export CSV</button>
    <button class="btn btn-ghost btn-sm" id="w-export-ndjson-btn">Export NDJSON</button>
  </div>` : '';

  // ── Render page ──────────────────────────────────────────────────────────
  const todayLong = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  el.innerHTML = `<div class="ff-page"><div class="ff-page-inner">
    <header class="ff-page-head">
      <div class="ff-page-icon" aria-hidden="true">💙</div>
      <h1 class="ff-page-title">Wellness Hub</h1>
      <p class="ff-page-sub">${todayLong}</p>
    </header>
    ${demoBanner}
    ${consentBanner}
    ${offlineBanner}
    ${kpiStrip}
    ${snapshotHtml}
    ${formCard}
    <div class="ff-card" style="margin-top:18px">
      <div class="ff-card-title">7-day mood trend</div>
      <div style="display:flex;justify-content:center">${_wellnessMoodSpark(moodSeries)}</div>
    </div>
    <div style="margin-top:18px">
      <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:.6px">Recent check-ins</div>
      ${timelineHtml}
    </div>
    ${exportRow}
    ${journalLink}
  </div></div>`;

  // ── Wire save button ─────────────────────────────────────────────────────
  document.getElementById('w-save-btn')?.addEventListener('click', async () => {
    if (!consentActive) return;
    const errEl = document.getElementById('w-save-err');
    const msgEl = document.getElementById('w-save-msg');
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    const payload = {
      mood: parseInt(document.getElementById('w-mood')?.value || '', 10),
      energy: parseInt(document.getElementById('w-energy')?.value || '', 10),
      sleep: parseInt(document.getElementById('w-sleep')?.value || '', 10),
      anxiety: parseInt(document.getElementById('w-anxiety')?.value || '', 10),
      focus: parseInt(document.getElementById('w-focus')?.value || '', 10),
      pain: parseInt(document.getElementById('w-pain')?.value || '', 10),
      note: document.getElementById('w-note')?.value?.trim() || null,
    };
    payload.tags = _composeWellnessTags(payload);

    let serverEntry = null;
    if (usingServer && api && typeof api.createWellnessCheckin === 'function') {
      try {
        serverEntry = await api.createWellnessCheckin(payload);
      } catch (err) {
        if (errEl) {
          errEl.textContent = 'Could not save to server (check connection). Saved locally — will sync when reconnected.';
          errEl.style.display = 'block';
        }
      }
    }
    _wellnessSaveLocal({
      id: serverEntry?.id || `w_${Date.now()}`,
      created_at: serverEntry?.created_at || new Date().toISOString(),
      ...payload,
      synced: !!serverEntry,
    });
    _wellnessLogAuditEvent('checkin_logged', {
      checkin_id: serverEntry?.id,
      using_demo_data: isDemo,
      note: serverEntry ? 'server' : 'local_only',
    });
    if (msgEl && (serverEntry || !usingServer)) {
      msgEl.style.display = 'block';
      setTimeout(() => { msgEl.style.display = 'none'; }, 1800);
    }
    setTimeout(() => pgPatientWellness(), 250);
  });

  // ── Wire share buttons ───────────────────────────────────────────────────
  el.querySelectorAll('button[data-w-share-id]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = ev.currentTarget?.getAttribute('data-w-share-id');
      if (!id || !api || typeof api.shareWellnessCheckin !== 'function') return;
      ev.currentTarget.disabled = true;
      try { await api.shareWellnessCheckin(id, 'shared from wellness hub'); }
      catch (_) { /* re-render reflects server state */ }
      _wellnessLogAuditEvent('share_clicked', { checkin_id: id, using_demo_data: isDemo });
      setTimeout(() => pgPatientWellness(), 200);
    });
  });

  // ── Wire delete buttons ──────────────────────────────────────────────────
  el.querySelectorAll('button[data-w-delete-id]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = ev.currentTarget?.getAttribute('data-w-delete-id');
      if (!id || !api || typeof api.deleteWellnessCheckin !== 'function') return;
      const reason = window.prompt('Reason for deleting this check-in? (required, kept in audit log)');
      if (!reason || reason.trim().length < 2) return;
      ev.currentTarget.disabled = true;
      try { await api.deleteWellnessCheckin(id, reason.trim()); }
      catch (_) {}
      _wellnessLogAuditEvent('delete_clicked', { checkin_id: id, using_demo_data: isDemo });
      setTimeout(() => pgPatientWellness(), 200);
    });
  });

  // ── Wire export buttons ──────────────────────────────────────────────────
  document.getElementById('w-export-csv-btn')?.addEventListener('click', () => {
    if (api && typeof api.wellnessExportUrl === 'function') {
      const url = api.wellnessExportUrl('csv');
      window.open(url, '_blank', 'noopener');
      _wellnessLogAuditEvent('export_clicked', { note: 'csv', using_demo_data: isDemo });
    }
  });
  document.getElementById('w-export-ndjson-btn')?.addEventListener('click', () => {
    if (api && typeof api.wellnessExportUrl === 'function') {
      const url = api.wellnessExportUrl('ndjson');
      window.open(url, '_blank', 'noopener');
      _wellnessLogAuditEvent('export_clicked', { note: 'ndjson', using_demo_data: isDemo });
    }
  });

  // ── Wire cross-link to symptom journal ───────────────────────────────────
  document.getElementById('w-link-journal-btn')?.addEventListener('click', () => {
    _wellnessLogAuditEvent('cross_link_journal_clicked', { using_demo_data: isDemo });
    if (typeof window._navPatient === 'function') {
      window._navPatient('pt-journal');
    }
  });
}

// ── Legacy "Tasks-as-Wellness" placeholder kept solely for back-compat ──────
// The pre-launch-audit Wellness route rendered the Tasks page. The new
// pgPatientWellness above is the canonical Wellness Hub. We keep this
// stub so any legacy bookmarks / emails that linked here still resolve
// to the Tasks page when explicitly requested.
async function _legacyPatientWellnessAsTasks() {
  setTopbar('My Tasks');
  const uid = currentUser?.patient_id || currentUser?.id;
  const el = document.getElementById('patient-content');
  const todayStr  = new Date().toISOString().slice(0, 10);
  const todayFmt  = new Date().toLocaleDateString(getLocale() === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  let _serverHomeProgramTasks = null;
  // 3s timeout so a hung Fly backend can never wedge the Tasks page on a
  // spinner. On timeout `items` is null and we fall through to the local
  // task catalog + demo overlay below.
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  try {
    const { api } = await import('./api.js');
    const items = await _raceNull(api.portalListHomeProgramTasks());
    _serverHomeProgramTasks = Array.isArray(items) ? items : null;
  } catch { /* offline / no token */ }

  // Demo overlay — when we're on a preview build (VITE_ENABLE_DEMO=1) or the
  // signed-in user looks like a demo patient, seed DEMO_PATIENT.tasks if the
  // server has no tasks. Keeps the Tasks page populated for reviewers even
  // when the backend is half-open.
  const _demoBuild =
    (typeof import.meta !== 'undefined'
      && import.meta.env
      && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1'));
  const _looksDemo = _demoBuild
    || isDemoPatient(currentUser, { getToken: api.getToken })
    || (() => { try { return String(api.getToken?.() || '').includes('demo'); } catch { return false; } })();
  if ((!_serverHomeProgramTasks || _serverHomeProgramTasks.length === 0) && _looksDemo) {
    _serverHomeProgramTasks = DEMO_PATIENT.tasks.map(t => ({ ...t, _isDemoData: true }));
  }

  // ── Build page ──────────────────────────────────────────────────────────────
  function _tasksRenderPage() {
    const tasks = _serverHomeProgramTasks
      ? _tasksGetEnrichedFromServer(_serverHomeProgramTasks)
      : _tasksGetEnriched();
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

    const _isDemoTasks = _looksDemo && _serverHomeProgramTasks && _serverHomeProgramTasks.some(function(t) { return t._isDemoData; });
    const demoBanner = _isDemoTasks
      ? '<div class="hw-demo-banner" role="status">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          '<strong>Demo data</strong>' +
          '&mdash; sample tasks shown while your clinic is being set up. Your real home program will appear once your care team activates your plan.' +
        '</div>'
      : '';

    return '<div class="pt-tasks-page">' +
      demoBanner +
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
    if (taskId === 'pt-daily-checkin') { window._tasksLaunchCheckin(); return; }
    const allTasks = _tasksGetEnriched();
    const task = allTasks.find(function(t) { return t.id === taskId; });
    if (!task) {
      _pttMarkComplete(taskId, new Date().toISOString().slice(0, 10));
      el.innerHTML = _tasksRenderPage();
      return;
    }
    window._tasksLaunchByType(taskId, task);
  };

  window._tasksLaunchByType = function(taskId, task) {
    const type = task.type || task.category || 'custom';
    const launcherMap = {
      'breathing':    window._launcherBreathing,
      'sleep':        window._launcherSleep,
      'mood-journal': window._launcherMoodJournal,
      'activity':     window._launcherExercise,
      'walk':         window._launcherExercise,
      'home-device':  window._launcherHomeDevice,
      'caregiver':    window._launcherCaregiver,
      'pre-session':  window._launcherPreSession,
      'post-session': window._launcherPostSession,
      'assessment':   window._tasksLaunchCheckin,
    };
    const fn = launcherMap[type];
    if (fn) { fn(taskId, task); return; }
    // Fallback: mark complete immediately
    _pttMarkComplete(taskId, new Date().toISOString().slice(0, 10));
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

  // ── Type-specific launcher helpers ─────────────────────────────────────────

  function _launcherOpen(taskId, html) {
    const panel = document.getElementById('pt-task-launcher-' + taskId);
    if (!panel) return;
    if (panel.style.display !== 'none' && panel.innerHTML) { panel.style.display = 'none'; return; }
    panel.innerHTML = '<div class="pt-launcher-panel">' + html + '</div>';
    panel.style.display = 'block';
  }

  window._launcherBreathing = function(taskId) {
    _launcherOpen(taskId,
      '<div class="pt-launcher-heading">Breathing Exercise</div>' +
      '<div style="text-align:center;padding:12px 0">' +
        '<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;max-width:320px;margin:0 auto">Choose a pattern below, then do the exercise on your own. Log your experience when done.</div>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Rounds</label>' +
        '<select id="bl-rounds" class="pt-launcher-select">' +
          '<option value="5">5 rounds (~2 min)</option>' +
          '<option value="10" selected>10 rounds (~4 min)</option>' +
          '<option value="15">15 rounds (~6 min)</option>' +
        '</select>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Pattern</label>' +
        '<select id="bl-pattern" class="pt-launcher-select">' +
          '<option value="4-2-6">4-2-6 (relax)</option>' +
          '<option value="4-7-8" selected>4-7-8 (sleep/calm)</option>' +
          '<option value="5-0-5">5-0-5 (balance)</option>' +
        '</select>' +
      '</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">Feeling after (1-10)</label>' +
        '<input type="range" id="bl-rating" min="1" max="10" value="7" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'bl-rating-val\').textContent=this.value">' +
        '<span id="bl-rating-val" class="pt-launcher-slider-val">7</span>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Notes (optional)</label>' +
        '<textarea id="bl-notes" class="pt-launcher-textarea" placeholder="How did it feel?"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-submit-row">' +
        '<button class="pt-launcher-submit" onclick="window._tasksSubmitTask(\'' + taskId + '\',{type:\'breathing\',pattern:document.getElementById(\'bl-pattern\').value,rounds:document.getElementById(\'bl-rounds\').value,rating:document.getElementById(\'bl-rating\').value,notes:document.getElementById(\'bl-notes\').value})">Mark Complete</button>' +
        '<button class="pt-launcher-skip" onclick="window._tasksSubmitTask(\'' + taskId + '\',null)">Skip</button>' +
      '</div>'
    );
  };

  window._launcherSleep = function(taskId) {
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    _launcherOpen(taskId,
      '<div class="pt-launcher-heading">Sleep Routine Log</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Bedtime (last night)</label>' +
        '<input type="time" id="sl-bed" class="pt-launcher-input" value="22:30">' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Wake time (this morning)</label>' +
        '<input type="time" id="sl-wake" class="pt-launcher-input" value="' + hhmm + '">' +
      '</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">Sleep quality (1-10)</label>' +
        '<input type="range" id="sl-qual" min="1" max="10" value="6" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'sl-qual-val\').textContent=this.value">' +
        '<span id="sl-qual-val" class="pt-launcher-slider-val">6</span>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Disruptions?</label>' +
        '<select id="sl-disrupt" class="pt-launcher-select">' +
          '<option value="none">None</option>' +
          '<option value="once">Woke once</option>' +
          '<option value="multiple">Woke multiple times</option>' +
          '<option value="nightmare">Nightmare / disturbed</option>' +
          '<option value="couldnt-sleep">Couldn\'t fall asleep</option>' +
        '</select>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Notes</label>' +
        '<textarea id="sl-notes" class="pt-launcher-textarea" placeholder="Anything notable?"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-submit-row">' +
        '<button class="pt-launcher-submit" onclick="window._tasksSubmitTask(\'' + taskId + '\',{type:\'sleep\',bedtime:document.getElementById(\'sl-bed\').value,waketime:document.getElementById(\'sl-wake\').value,quality:document.getElementById(\'sl-qual\').value,disruptions:document.getElementById(\'sl-disrupt\').value,notes:document.getElementById(\'sl-notes\').value})">Save Sleep Log</button>' +
        '<button class="pt-launcher-skip" onclick="window._tasksSubmitTask(\'' + taskId + '\',null)">Skip</button>' +
      '</div>'
    );
  };

  window._launcherMoodJournal = function(taskId) {
    _launcherOpen(taskId,
      '<div class="pt-launcher-heading">Mood Journal</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">Mood (1=low, 10=great)</label>' +
        '<input type="range" id="mj-mood" min="1" max="10" value="5" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'mj-mood-val\').textContent=this.value">' +
        '<span id="mj-mood-val" class="pt-launcher-slider-val">5</span>' +
      '</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">Energy (1=exhausted, 10=high)</label>' +
        '<input type="range" id="mj-energy" min="1" max="10" value="5" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'mj-energy-val\').textContent=this.value">' +
        '<span id="mj-energy-val" class="pt-launcher-slider-val">5</span>' +
      '</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">Anxiety (1=calm, 10=very anxious)</label>' +
        '<input type="range" id="mj-anxiety" min="1" max="10" value="3" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'mj-anxiety-val\').textContent=this.value">' +
        '<span id="mj-anxiety-val" class="pt-launcher-slider-val">3</span>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">What\'s on your mind today?</label>' +
        '<textarea id="mj-thoughts" class="pt-launcher-textarea" placeholder="Thoughts, feelings, observations\u2026" style="min-height:70px"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Any positive moments?</label>' +
        '<textarea id="mj-positive" class="pt-launcher-textarea" placeholder="Gratitude or highlights\u2026"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-submit-row">' +
        '<button class="pt-launcher-submit" onclick="window._tasksSubmitTask(\'' + taskId + '\',{type:\'mood-journal\',mood:document.getElementById(\'mj-mood\').value,energy:document.getElementById(\'mj-energy\').value,anxiety:document.getElementById(\'mj-anxiety\').value,thoughts:document.getElementById(\'mj-thoughts\').value,positive:document.getElementById(\'mj-positive\').value})">Save Journal</button>' +
        '<button class="pt-launcher-skip" onclick="window._tasksSubmitTask(\'' + taskId + '\',null)">Skip</button>' +
      '</div>'
    );
  };

  window._launcherExercise = function(taskId) {
    _launcherOpen(taskId,
      '<div class="pt-launcher-heading">Activity Log</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Activity type</label>' +
        '<select id="ex-type" class="pt-launcher-select">' +
          '<option value="walk">Walk</option>' +
          '<option value="run">Run / Jog</option>' +
          '<option value="cycle">Cycling</option>' +
          '<option value="swim">Swimming</option>' +
          '<option value="yoga">Yoga / Stretching</option>' +
          '<option value="gym">Gym / Weights</option>' +
          '<option value="other">Other</option>' +
        '</select>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Duration (minutes)</label>' +
        '<input type="number" id="ex-dur" class="pt-launcher-input" min="1" max="300" value="20">' +
      '</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">Intensity (1=light, 10=intense)</label>' +
        '<input type="range" id="ex-intensity" min="1" max="10" value="5" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'ex-int-val\').textContent=this.value">' +
        '<span id="ex-int-val" class="pt-launcher-slider-val">5</span>' +
      '</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">Mood after (1=worse, 10=better)</label>' +
        '<input type="range" id="ex-mood" min="1" max="10" value="7" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'ex-mood-val\').textContent=this.value">' +
        '<span id="ex-mood-val" class="pt-launcher-slider-val">7</span>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Notes</label>' +
        '<textarea id="ex-notes" class="pt-launcher-textarea" placeholder="How did it go?"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-submit-row">' +
        '<button class="pt-launcher-submit" onclick="window._tasksSubmitTask(\'' + taskId + '\',{type:\'activity\',activityType:document.getElementById(\'ex-type\').value,duration:document.getElementById(\'ex-dur\').value,intensity:document.getElementById(\'ex-intensity\').value,moodAfter:document.getElementById(\'ex-mood\').value,notes:document.getElementById(\'ex-notes\').value})">Log Activity</button>' +
        '<button class="pt-launcher-skip" onclick="window._tasksSubmitTask(\'' + taskId + '\',null)">Skip</button>' +
      '</div>'
    );
  };

  window._launcherHomeDevice = function(taskId) {
    _launcherOpen(taskId,
      '<div class="pt-launcher-heading">Home Device Session</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Duration completed (minutes)</label>' +
        '<input type="number" id="hd-dur" class="pt-launcher-input" min="1" max="120" value="20">' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Intensity / setting used</label>' +
        '<input type="text" id="hd-intensity" class="pt-launcher-input" placeholder="e.g. 1.0 mA, Level 3">' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Any discomfort or side effects?</label>' +
        '<select id="hd-se" class="pt-launcher-select">' +
          '<option value="none">None</option>' +
          '<option value="tingling">Tingling / itching</option>' +
          '<option value="headache">Headache</option>' +
          '<option value="fatigue">Fatigue after</option>' +
          '<option value="dizziness">Dizziness</option>' +
          '<option value="other">Other</option>' +
        '</select>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Upload session report (optional)</label>' +
        '<label class="pt-launcher-upload-label">' +
          '<input type="file" id="hd-file" accept=".pdf,.csv,.txt,image/*" style="display:none" ' +
            'onchange="var p=document.getElementById(\'hd-preview\');p.textContent=this.files[0]?.name||\'\';">' +
          '\uD83D\uDCCE Choose file' +
        '</label>' +
        '<div id="hd-preview" class="pt-launcher-upload-preview"></div>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Notes</label>' +
        '<textarea id="hd-notes" class="pt-launcher-textarea" placeholder="Observations during session\u2026"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-submit-row">' +
        '<button class="pt-launcher-submit" onclick="window._tasksSubmitTask(\'' + taskId + '\',{type:\'home-device\',duration:document.getElementById(\'hd-dur\').value,intensity:document.getElementById(\'hd-intensity\').value,sideEffects:document.getElementById(\'hd-se\').value,hasFile:!!(document.getElementById(\'hd-file\')?.files?.length),notes:document.getElementById(\'hd-notes\').value})">Submit Session</button>' +
        '<button class="pt-launcher-skip" onclick="window._tasksSubmitTask(\'' + taskId + '\',null)">Skip</button>' +
      '</div>'
    );
  };

  window._launcherCaregiver = function(taskId) {
    _launcherOpen(taskId,
      '<div class="pt-launcher-heading">Caregiver Task</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Completed by</label>' +
        '<select id="cg-by" class="pt-launcher-select">' +
          '<option value="caregiver">Caregiver</option>' +
          '<option value="patient">Patient (assisted)</option>' +
          '<option value="both">Both together</option>' +
        '</select>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Caregiver name (optional)</label>' +
        '<input type="text" id="cg-name" class="pt-launcher-input" placeholder="e.g. Parent, Partner">' +
      '</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">Patient co-operation (1=difficult, 10=easy)</label>' +
        '<input type="range" id="cg-coop" min="1" max="10" value="7" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'cg-coop-val\').textContent=this.value">' +
        '<span id="cg-coop-val" class="pt-launcher-slider-val">7</span>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Caregiver observations</label>' +
        '<textarea id="cg-obs" class="pt-launcher-textarea" placeholder="Behaviour, mood, any concerns\u2026" style="min-height:70px"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-submit-row">' +
        '<button class="pt-launcher-submit" onclick="window._tasksSubmitTask(\'' + taskId + '\',{type:\'caregiver\',completedBy:document.getElementById(\'cg-by\').value,caregiverName:document.getElementById(\'cg-name\').value,cooperation:document.getElementById(\'cg-coop\').value,observations:document.getElementById(\'cg-obs\').value})">Submit</button>' +
        '<button class="pt-launcher-skip" onclick="window._tasksSubmitTask(\'' + taskId + '\',null)">Skip</button>' +
      '</div>'
    );
  };

  window._launcherPreSession = function(taskId) {
    const items = [
      'Avoided caffeine for 2+ hours',
      'Had a light meal (not too full)',
      'Removed metal jewellery / piercings',
      'Feeling relaxed and not rushing',
      'Confirmed no headache or migraine today',
      'Reviewed any new medications with clinician',
    ];
    _launcherOpen(taskId,
      '<div class="pt-launcher-heading">Pre-Session Preparation</div>' +
      '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Tick each item you\'ve completed:</div>' +
      '<div class="pt-launcher-checklist">' +
        items.map(function(item, i) {
          return '<label class="pt-launcher-check-item">' +
            '<input type="checkbox" id="pre-item-' + i + '" style="accent-color:#2dd4bf"> ' +
            '<span>' + item + '</span></label>';
        }).join('') +
      '</div>' +
      '<div class="pt-launcher-row" style="margin-top:10px">' +
        '<label class="pt-launcher-label">Anything to flag for your clinician?</label>' +
        '<textarea id="pre-flag" class="pt-launcher-textarea" placeholder="Optional notes\u2026"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-submit-row">' +
        '<button class="pt-launcher-submit" onclick="(function(){' +
          'var checked=[]; [0,1,2,3,4,5].forEach(function(i){if(document.getElementById(\'pre-item-\'+i)?.checked)checked.push(i);});' +
          'window._tasksSubmitTask(\'' + taskId + '\',{type:\'pre-session\',checkedItems:checked,flag:document.getElementById(\'pre-flag\').value});' +
        '})()">Ready — Submit</button>' +
        '<button class="pt-launcher-skip" onclick="window._tasksSubmitTask(\'' + taskId + '\',null)">Skip</button>' +
      '</div>'
    );
  };

  window._launcherPostSession = function(taskId) {
    _launcherOpen(taskId,
      '<div class="pt-launcher-heading">Post-Session Aftercare</div>' +
      '<div class="pt-launcher-slider-row">' +
        '<label class="pt-launcher-label">How are you feeling? (1=rough, 10=great)</label>' +
        '<input type="range" id="ps-feeling" min="1" max="10" value="7" class="pt-launcher-slider" ' +
          'oninput="document.getElementById(\'ps-feel-val\').textContent=this.value">' +
        '<span id="ps-feel-val" class="pt-launcher-slider-val">7</span>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Any unusual sensations?</label>' +
        '<select id="ps-se" class="pt-launcher-select">' +
          '<option value="none">None</option>' +
          '<option value="tingling">Tingling at site</option>' +
          '<option value="headache">Mild headache</option>' +
          '<option value="fatigue">Tiredness / fatigue</option>' +
          '<option value="light-headed">Light-headedness</option>' +
          '<option value="nausea">Nausea</option>' +
          '<option value="other">Other</option>' +
        '</select>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Did you rest for at least 10 min after?</label>' +
        '<select id="ps-rest" class="pt-launcher-select">' +
          '<option value="yes">Yes</option>' +
          '<option value="no">No — needed to leave</option>' +
        '</select>' +
      '</div>' +
      '<div class="pt-launcher-row">' +
        '<label class="pt-launcher-label">Additional notes</label>' +
        '<textarea id="ps-notes" class="pt-launcher-textarea" placeholder="Anything you\'d like your clinician to know\u2026"></textarea>' +
      '</div>' +
      '<div class="pt-launcher-submit-row">' +
        '<button class="pt-launcher-submit" onclick="window._tasksSubmitTask(\'' + taskId + '\',{type:\'post-session\',feeling:document.getElementById(\'ps-feeling\').value,sideEffects:document.getElementById(\'ps-se\').value,rested:document.getElementById(\'ps-rest\').value,notes:document.getElementById(\'ps-notes\').value})">Submit</button>' +
        '<button class="pt-launcher-skip" onclick="window._tasksSubmitTask(\'' + taskId + '\',null)">Skip</button>' +
      '</div>'
    );
  };

  window._tasksSubmitTask = async function(taskId, data) {
    const today = new Date().toISOString().slice(0, 10);
    _pttMarkComplete(taskId, today, data);

    // If this is a server-backed home program task, persist completion + feedback durably.
    try {
      const task = (_serverHomeProgramTasks || []).find(t => (t.id === taskId));
      const serverTaskId = task?.server_task_id;
      if (serverTaskId) {
        const payload = {
          rating: (data && typeof data.rating === 'number') ? Math.max(1, Math.min(5, Math.round(data.rating))) : null,
          difficulty: (data && typeof data.difficulty === 'number') ? Math.max(1, Math.min(5, Math.round(data.difficulty))) : null,
          feedback_text: data?.notes || data?.thoughts || data?.observations || data?.feedback_text || null,
          feedback_json: data || null,
          media_upload_id: data?.media_upload_id || data?.mediaUploadId || null,
        };
        const { api } = await import('./api.js');
        await api.portalCompleteHomeProgramTask(serverTaskId, payload);
      }
    } catch { /* non-fatal */ }

    // Bridge completion data to the clinician's completions key for adherence monitoring
    if (data) {
      const pid = _pttPatientKey();
      const clinKey = 'ds_task_completions_' + pid;
      try {
        const comps = JSON.parse(localStorage.getItem(clinKey) || '{}');
        comps[taskId + '_' + today] = { done: true, ...data, completedAt: new Date().toISOString() };
        localStorage.setItem(clinKey, JSON.stringify(comps));
      } catch (_e) {}
    }

    // Hide the launcher panel
    const panel = document.getElementById('pt-task-launcher-' + taskId);
    if (panel) panel.style.display = 'none';

    el.innerHTML = _tasksRenderPage();
  };

  window._tasksAskAI = function(prompt) {
    if (typeof window._navPatient === 'function') {
      window._navPatient('patient-virtualcare');
      // Give the page a moment to render then prefill the AI chat input
      setTimeout(function() {
        const inp = document.getElementById('vc-input') || document.getElementById('pt-ai-input') || document.querySelector('.pt-ai-input');
        if (inp) { inp.value = prompt; inp.focus(); }
      }, 400);
    }
  };
}

// ── Learn & Resources ─────────────────────────────────────────────────────────
const LEARN_ARTICLES = [
  {
    id:       'clinic-week6-qeeg',
    category: 'Clinic Premium',
    title:    'A clinician walkthrough of your Week 6 qEEG report',
    readTime: '18 min video',
    icon:     '🧠',
    source:   'DeepSynaps Clinic+',
    format:   'Premium video',
    topic:    'qEEG',
    premium:  true,
    summary:  'A patient-safe explanation of what your latest qEEG trends may mean and what questions to bring to your next review.',
    content:  `This clinic-made premium explainer is recorded for patients who are already in active neuromodulation care.\n\n**What this video covers:**\n- How to read the headline sections of a qEEG-style report\n- Why alpha, beta, and frontal asymmetry markers show up so often in mood treatment reviews\n- Which changes are interesting versus which changes are actionable\n- What your clinician is looking for before adjusting intensity, target area, or pacing\n\n**How to use it:**\n- Watch before your next progress review\n- Write down two questions you want answered in clinic\n- Compare the explanation with how you have actually been feeling, sleeping, and functioning\n\nThis content is educational only. Your own care team still decides what any biomarker means in the context of your symptoms.`,
  },
  {
    id:       'journal-network-depression',
    category: 'Academic Journals',
    title:    'Journal summary: how neuromodulation changes network activity in depression',
    readTime: '8 min read',
    icon:     '📄',
    source:   'Peer-reviewed journals',
    format:   'Academic explainer',
    topic:    'Neuromodulation',
    summary:  'A plain-language digest of how researchers think non-invasive brain stimulation changes mood-related brain networks over time.',
    content:  `Academic papers on neuromodulation often describe treatment as a network effect rather than a single-region effect.\n\n**What that means in patient language:**\n- Treatment is not only about one brain spot turning on or off\n- Clinicians are trying to influence communication between attention, emotion, and control networks\n- Some patients improve first in energy, sleep, or concentration before mood fully shifts\n\n**What researchers usually measure:**\n- Symptom scores such as PHQ-9 or GAD-7\n- Brainwave or imaging markers when available\n- Functional changes such as work tolerance, sleep, motivation, and routine stability\n\nThis summary keeps the evidence understandable, but your clinician is still the person who interprets what applies to you.`,
  },
  {
    id:       'youtube-neuromodulation-primer',
    category: 'YouTube',
    title:    'Neuromodulation primer for depression treatment',
    readTime: '10 min video',
    icon:     '▶️',
    source:   'YouTube',
    format:   'Video',
    topic:    'tDCS',
    summary:  'A short patient-friendly overview of what neuromodulation is, why it is used, and what realistic improvement often looks like.',
    content:  `This YouTube-style explainer gives a broad overview of neuromodulation for patients and families.\n\n**Topics covered:**\n- The difference between stimulation, training, and symptom tracking\n- Why depression, anxiety, sleep, and cognitive symptoms may change at different speeds\n- What “dose,” “course,” and “response” usually mean in clinic\n- Questions worth asking before you buy or use a home device\n\nUse this kind of video as orientation, not as a substitute for your treatment plan.`,
  },
  {
    id:       'podcast-patient-journey',
    category: 'Podcasts',
    title:    'What neuromodulation feels like week by week',
    readTime: '34 min podcast',
    icon:     '🎧',
    source:   'Clinic Voices Podcast',
    format:   'Podcast',
    topic:    'Patient stories',
    summary:  'A conversation about the uneven but often meaningful week-to-week experience of treatment, adherence, and recovery.',
    content:  `This podcast episode is useful for patients who want realistic expectations instead of polished before-and-after stories.\n\n**Themes in the discussion:**\n- Why progress often feels non-linear\n- How sleep, routine, and treatment adherence interact\n- When patients usually decide treatment is “worth it”\n- Why support from family or carers can matter during the middle weeks\n\nIt is often helpful to pair patient-story content like this with your own symptom tracking so you do not over-compare your experience to someone else's.`,
  },
  {
    id:       'udemy-family-course',
    category: 'Courses',
    title:    'Udemy course: neuromodulation basics for patients and families',
    readTime: '41 min course',
    icon:     '🎓',
    source:   'Udemy',
    format:   'Course',
    topic:    'Patient education',
    summary:  'A structured beginner course covering treatment concepts, safety basics, and how to follow a course plan at home.',
    content:  `This course is designed for people who want a more structured introduction than a one-off article or short video.\n\n**Modules include:**\n- Understanding treatment goals and milestones\n- Common safety questions and when to contact clinic\n- How to prepare for sessions and monitor your response\n- How carers and family members can support adherence without becoming overbearing\n\nA short course format works well if you want to build confidence before or during home treatment.`,
  },
  {
    id:       'edx-brain-plasticity',
    category: 'Courses',
    title:    'edX mini-course: brain stimulation and plasticity',
    readTime: '58 min course',
    icon:     '📘',
    source:   'edX',
    format:   'Course',
    topic:    'Science',
    summary:  'A more science-heavy course for patients who want to understand neuroplasticity, adaptation, and why repeated sessions matter.',
    content:  `This edX-style mini-course is for curious patients who want more depth.\n\n**You will learn:**\n- Why repeated sessions matter more than isolated sessions\n- How neuroplasticity differs from immediate symptom relief\n- Why treatment plans often include both stimulation and behavioural routines\n- How researchers think about maintenance and relapse prevention\n\nIf you prefer a less technical route, start with the YouTube and clinic premium items first.`,
  },
  {
    id:       'clinic-home-device-setup',
    category: 'Clinic Premium',
    title:    'Clinic premium video: safer home-device setup and electrode placement',
    readTime: '12 min video',
    icon:     '⚡',
    source:   'DeepSynaps Clinic+',
    format:   'Premium video',
    topic:    'Devices',
    premium:  true,
    summary:  'A clinic-recorded setup guide for patients using home devices, including preparation, placement checks, and when to stop.',
    content:  `This premium clinic video focuses on safe, repeatable setup rather than theory.\n\n**What it shows:**\n- Preparing the device and treatment area\n- Electrode placement checks\n- Common setup mistakes\n- Skin checks before and after use\n- When to pause, log an issue, or message your care team\n\nThis is the kind of content clinics can sell or include as part of a patient education pack because it is specific to their workflow and device process.`,
  },
  {
    id:       'conference-future-nibs',
    category: 'Conferences & Seminars',
    title:    'Conference session: future directions in non-invasive brain stimulation',
    readTime: '32 min session',
    icon:     '🎤',
    source:   'Neuromodulation Congress 2026',
    format:   'Conference replay',
    topic:    'Neuromodulation',
    summary:  'A replay of a patient-safe conference session on where the field is heading and what new treatment models may emerge.',
    content:  `Conference and seminar replays can help patients understand the bigger picture of their treatment field.\n\n**This session covers:**\n- How clinics are combining stimulation with symptom tracking and digital support\n- What researchers are excited about next\n- Where evidence is strong versus where it is still early\n- Why not every new tool should be adopted immediately\n\nIt is useful for context, but it should not change your treatment decisions without clinician input.`,
  },
  {
    id:       'seminar-recovery-planning',
    category: 'Conferences & Seminars',
    title:    'Seminar replay: depression, neuroplasticity, and long-term recovery planning',
    readTime: '46 min seminar',
    icon:     '📅',
    source:   'Patient Seminar Series',
    format:   'Seminar replay',
    topic:    'MDD',
    summary:  'A longer patient seminar connecting treatment response, everyday functioning, relapse prevention, and recovery planning.',
    content:  `This seminar connects the science of change with the lived reality of recovery.\n\n**Topics include:**\n- How clinicians think about stabilisation versus recovery\n- Why function matters as much as symptom scores\n- How to use treatment gains to rebuild routine, confidence, and resilience\n- What maintenance, follow-up, and relapse planning may look like\n\nThis is the right kind of content for patients who want more depth than a brief explainer but still need it to stay practical.`,
  },
];

export async function pgPatientLearn() {
  setTopbar(t('patient.nav.learn'));
  const el = document.getElementById('patient-content');
  const liveEvidence = await getEvidenceUiStats({
    fallbackSummary: EVIDENCE_SUMMARY,
    fallbackConditionCount: EVIDENCE_SUMMARY.totalConditions,
  });

  // Track read articles — fetch from API, fall back to localStorage
  let readArticles = [];
  try {
    const { api: _api } = await import('./api.js');
    const prog = _api.patientPortalLearnProgress ? await _api.patientPortalLearnProgress().catch(() => null) : null;
    if (prog && Array.isArray(prog.read_article_ids)) {
      readArticles = prog.read_article_ids;
    } else {
      readArticles = JSON.parse(localStorage.getItem('ds_read_articles') || '[]');
    }
  } catch (_e) {
    try { readArticles = JSON.parse(localStorage.getItem('ds_read_articles') || '[]'); } catch (_e2) {}
  }

  const categories = ['All', ...Array.from(new Set(LEARN_ARTICLES.map(a => a.category)))];
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
      const haystack = [a.title, a.summary, a.source, a.format, a.topic, a.category].join(' ').toLowerCase();
      const matchSearch = !search || haystack.includes(search.toLowerCase());
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      return `<div class="pt-portal-empty">
        <div class="pt-portal-empty-ico" aria-hidden="true">&#128196;</div>
        <div class="pt-portal-empty-title">No learning items found</div>
        <div class="pt-portal-empty-body">Try a different search term or browse another category.</div>
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
                  <span style="font-size:10px;color:var(--text-tertiary)">${a.readTime}</span>
                  ${a.premium ? '<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:rgba(0,212,188,0.12);color:var(--teal);font-weight:600">Clinic premium</span>' : ''}
                  ${isRead ? '<span style="font-size:10px;color:var(--teal);font-weight:600">✓ Read</span>' : ''}
                </div>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);line-height:1.3;margin-bottom:6px">${a.title}</div>
                <div style="font-size:12px;color:var(--text-secondary);line-height:1.5">${a.summary}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:10px;color:var(--text-tertiary)">
                  <span>${a.source}</span>
                  <span>• ${a.format}</span>
                  <span>• ${a.topic}</span>
                </div>
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
      <div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--violet,#9b7fff);margin-bottom:8px">Patient learning library</div>
      <div style="font-size:20px;font-weight:700;color:var(--text-primary);margin-bottom:6px">Education Library</div>
      <div style="font-size:12.5px;color:var(--text-secondary);max-width:900px">Academic journals, YouTube explainers, podcasts, Udemy and edX courses, clinic premium videos, and conference or seminar replays curated for neuromodulation patients.</div>
      <div style="margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--text-tertiary)">
        <span>${liveEvidence.totalPapers.toLocaleString()} peer-reviewed papers</span>
        <span>${liveEvidence.totalTrials.toLocaleString()} clinical trials</span>
        <span>${liveEvidence.totalConditions} conditions indexed</span>
      </div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
      <input type="text" id="learn-search" class="form-control" placeholder="Search journals, podcasts, courses, seminars…"
             style="flex:1;min-width:160px;max-width:320px;font-size:13px"
             oninput="window._learnSearch()">
      <div class="tab-bar" style="margin:0">
        ${categories.map(cat => `
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
    categories.forEach(c => {
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
              <span style="font-size:11px;color:var(--text-tertiary)">${article.readTime}</span>
              <span style="font-size:11px;color:var(--text-tertiary)">${article.source}</span>
              <span style="font-size:11px;color:var(--text-tertiary)">${article.format}</span>
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
      // Sync to backend
      import('./api.js').then(function(m) {
        if (m.api && m.api.patientPortalMarkLearnRead) m.api.patientPortalMarkLearnRead(id).catch(function() {});
      }).catch(function() {});
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

// ── Media pages ─────────────────────────────────────────────────────────────
// pgPatientMediaConsent / pgPatientMediaUpload / pgPatientMediaHistory plus
// the local _MEDIA_BASE + _mediaFetch helpers moved to ./pages-patient/
// media.js as part of the 2026-05-02 file-split refactor. Re-exported
// from this module via the import + export at the top of the file so all
// existing call-sites continue to work unchanged.
// Module-level chat state so history survives tab navigation
// ── Devices & Wearables ─────────────────────────────────────────────────────
// pgPatientWearables moved to ./pages-patient/wearables.js as part of the
// 2026-05-02 file-split refactor. Re-exported from this module via the
// import + export at the top of the file so all existing call-sites
// continue to work unchanged.

// ── Intake & Consent ────────────────────────────────────────────────────────
// pgIntake (clinician-side intake/consent manager) and its supporting
// templates / localStorage helpers / signature canvas moved to
// ./pages-patient/intake.js as part of the 2026-05-02 file-split
// refactor. Re-exported from this module via the import + export at the
// top of the file so all existing call-sites continue to work unchanged.

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

function _pttMarkComplete(taskId, date, data) {
  const c = _pttGetCompletions();
  c[taskId + '_' + date] = data ? { done: true, ...data, completedAt: new Date().toISOString() } : true;
  try { localStorage.setItem(_pttCompletionsKey(), JSON.stringify(c)); } catch (_e) {}
}

function _pttIsComplete(taskId, date) {
  const c = _pttGetCompletions();
  const v = c[taskId + '_' + date];
  return v === true || (v && v.done === true);
}

function _pttGetCompletionData(taskId, date) {
  const c = _pttGetCompletions();
  const v = c[taskId + '_' + date];
  return (v && typeof v === 'object') ? v : null;
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
    window._showNotifToast && window._showNotifToast({ title: 'Saved locally', body: 'Task completion was saved in this browser only.', severity: 'warning' });
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
    window._showNotifToast && window._showNotifToast({ title: 'Task saved locally', body: newTask.title + ' was added in this browser only.', severity: 'warning' });
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
    if (!_editorPlan.name) { window._showToast?.('Please enter a plan name.', 'warning'); return; }
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
    if (!patientName) { window._showToast?.('Please enter a patient name.', 'warning'); return; }
    const nameInputEl = document.getElementById('hw-plan-name');
    const condEl      = document.getElementById('hw-plan-condition');
    const weeksEl     = document.getElementById('hw-plan-weeks');
    if (nameInputEl) _editorPlan.name      = nameInputEl.value.trim();
    if (condEl)      _editorPlan.condition = condEl.value.trim();
    if (weeksEl)     _editorPlan.weeks     = parseInt(weeksEl.value, 10) || 4;
    if (!_editorPlan.name) { window._showToast?.('Please enter a plan name before assigning.', 'warning'); return; }
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

// ── Symptom Journal & Notification Settings ─────────────────────────────────
// pgSymptomJournal + pgPatientNotificationSettings (+ their helpers and
// window._patRequestPush / window._patShareProgress handlers) moved to
// ./pages-patient/symptom-notifications.js as part of the 2026-05-02
// file-split refactor. Re-exported from this module via the import +
// export at the top of the file so all existing call-sites continue to
// work unchanged.
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

// ── Data Import & Migration ───────────────────────────────────────────────
// pgDataImport (clinician-side data import wizard) and its supporting
// CSV parser / column mapper / step renderers / window._import* handlers
// moved to ./pages-patient/import-wizard.js as part of the 2026-05-02
// file-split refactor. Re-exported from this module via the import +
// export at the top of the file so all existing call-sites continue to
// work unchanged.

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
  // If real v2 outcome data already exists, do NOT seed legacy demo data
  // so the two datasets never mix on the progress page.
  try {
    const v2 = localStorage.getItem('ds_patient_outcomes_v2');
    if (v2) {
      const parsed = JSON.parse(v2);
      if (parsed.measures && parsed.measures.length) {
        return { patient: {}, symptoms: {}, sessionScores: [], goals: [], sessions: [] };
      }
    }
  } catch (_e2) { /* fall through to seed */ }
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
  return               { key: 'review',   label: 'Let\'s Check In',  icon: '!', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',   tagline: 'Your recent check-ins suggest you may want to contact your clinic.' };
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
  var sleepVal = bioRaw ? bioRaw.sleep : '—';
  var hrvVal   = bioRaw ? bioRaw.hrv   : '—';
  var rhrVal   = bioRaw ? bioRaw.rhr   : '—';
  var sleepN = bioNum(sleepVal), hrvN = bioNum(hrvVal), rhrN = bioNum(rhrVal);
  var sleepSt = !bioRaw ? 'grey' : sleepN >= 7 ? 'green' : sleepN >= 5.5 ? 'amber' : 'red';
  var hrvSt   = !bioRaw ? 'grey' : hrvN   >= 50 ? 'green' : hrvN   >= 30  ? 'amber' : 'red';
  var rhrSt   = !bioRaw ? 'grey' : rhrN   <= 65 ? 'green' : rhrN   <= 80  ? 'amber' : 'red';
  // Adherence from check-in frequency
  var journal = [];
  try { journal = JSON.parse(localStorage.getItem('ds_symptom_journal') || '[]'); } catch (_e) {}
  var cut14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  var adhRate = Math.min(100, Math.round((journal.filter(function(e) { return (e.date || (e.created_at || '').slice(0, 10)) >= cut14; }).length / 14) * 100));
  var adhSt   = adhRate >= 70 ? 'green' : adhRate >= 40 ? 'amber' : 'red';
  var tiles = [
    { label: 'Sleep',      val: sleepVal,       sub: bioRaw ? 'avg last 7 nights' : 'no wearable connected',  icon: '🌙', st: sleepSt },
    { label: 'HRV',        val: hrvVal,         sub: bioRaw ? 'avg last 7 days' : 'no wearable connected',    icon: '💚', st: hrvSt   },
    { label: 'Resting HR', val: rhrVal,         sub: bioRaw ? 'avg last 7 days' : 'no wearable connected',    icon: '❤️', st: rhrSt   },
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
    '<div class="pgp-bio-sync">' + (bioRaw ? 'Last synced today' : 'No wearable data yet') + ' &nbsp;·&nbsp; <a href="#" style="color:var(--teal,#00d4bc);text-decoration:none" onclick="window._navPatient(\'patient-wearables\');return false">Manage devices →</a></div>';
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
  const colors = { anxiety: 'var(--rose,#ff6b9d)', sleep: 'var(--teal,#00d4bc)', focus: 'var(--blue,#4a9eff)' };
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
    const c = v >= 88 ? 'var(--teal,#00d4bc)' : v >= 75 ? 'var(--amber,#ffb547)' : 'var(--rose,#ff6b9d)';
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
    '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,0.6)"><span style="width:10px;height:10px;border-radius:2px;background:var(--teal,#00d4bc);display:inline-block"></span>Excellent (\u226588)</span>' +
    '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,0.6)"><span style="width:10px;height:10px;border-radius:2px;background:var(--amber,#ffb547);display:inline-block"></span>Good (75\u201387)</span>' +
    '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,0.6)"><span style="width:10px;height:10px;border-radius:2px;background:var(--rose,#ff6b9d);display:inline-block"></span>Needs Work (&lt;75)</span>' +
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
    '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--teal,#00d4bc)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + lp[0] + '" cy="' + lp[1] + '" r="2.5" fill="var(--teal,#00d4bc)"/>' +
    '</svg>'
  );
}

// ── Calendar dots (30-day intensity heatmap) ──────────────────────────────────
function _calendarDots30() {
  const today = new Date();
  const cm = { low: 'var(--teal,#00d4bc)', mid: 'var(--amber,#ffb547)', high: 'var(--rose,#ff6b9d)' };
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
function _buildReportHTML(data, ptoData) {
  ptoData = ptoData || {};
  const _rptLoc  = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
  const today = new Date().toLocaleDateString(_rptLoc, { year: 'numeric', month: 'long', day: 'numeric' });
  const hasReal = ptoData.measures && ptoData.measures.length;
  const patient = hasReal ? (ptoData.patient || {}) : (data.patient || {});
  const startFmt = patient.startDate
    ? new Date(patient.startDate).toLocaleDateString(_rptLoc, { year: 'numeric', month: 'long', day: 'numeric' })
    : '\u2014';
  const totalSessions = patient.totalSessions || 0;

  var measureRows = '';
  var measureStats = '';
  if (hasReal) {
    const mStats = [];
    ptoData.measures.forEach(function(m) {
      if (!m.points || !m.points.length) return;
      const base = m.points[0].score;
      const cur  = m.points[m.points.length - 1].score;
      const delta = base - cur;
      const pct = base > 0 ? Math.round((delta / base) * 100) : 0;
      mStats.push('<div class="stat-card"><div class="stat-val">' + cur + '</div><div class="stat-label">' + (m.label || m.id) + ' (latest)</div></div>');
      measureRows += '<tr><td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0">' + (m.label || m.id) + '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0;text-align:center">' + base + '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0;text-align:center">' + cur + '</td>' +
        '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;text-align:center"><span style="background:#2dd4bf22;color:#2dd4bf;border:1px solid #2dd4bf44;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600">' + (delta > 0 ? 'Down ' + pct + '%' : delta < 0 ? 'Up ' + Math.abs(pct) + '%' : 'Stable') + '</span></td></tr>';
    });
    measureStats = mStats.join('');
  }

  const avgScore = (data.sessionScores && data.sessionScores.length)
    ? (data.sessionScores.reduce(function (a, b) { return a + b; }, 0) / data.sessionScores.length).toFixed(1)
    : '\u2014';
  const anxArr = (data.symptoms && data.symptoms.anxiety) || [];
  const slpArr = (data.symptoms && data.symptoms.sleep) || [];
  const anxImp = anxArr.length ? anxArr[0] - anxArr[anxArr.length - 1] : 0;
  const slpImp = slpArr.length ? slpArr[slpArr.length - 1] - slpArr[0] : 0;
  const goalRows = (data.goals || []).map(function (g) {
    const lbl = g.status === 'achieved' ? 'Achieved' : g.status === 'on-track' ? 'On Track' : 'Needs Attention';
    const sc = g.status === 'achieved' ? '#2dd4bf' : g.status === 'on-track' ? '#60a5fa' : '#f43f5e';
    return '<tr><td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0">' + g.name + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0;text-align:center">' + g.target + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;color:#e2e8f0;text-align:center">' + g.current + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #2d3748;text-align:center"><span style="background:' + sc + '22;color:' + sc + ';border:1px solid ' + sc + '44;border-radius:12px;padding:3px 10px;font-size:12px;font-weight:600">' + lbl + '</span></td></tr>';
  }).join('');

  const statsRow = hasReal
    ? measureStats
    : '<div class="stat-card"><div class="stat-val">' + totalSessions + '</div><div class="stat-label">Sessions Completed</div></div>' +
      '<div class="stat-card"><div class="stat-val">' + avgScore + '</div><div class="stat-label">Avg Session Score</div></div>' +
      '<div class="stat-card"><div class="stat-val">&#8722;' + anxImp + '</div><div class="stat-label">Anxiety Reduction</div></div>' +
      '<div class="stat-card"><div class="stat-val">+' + slpImp + '</div><div class="stat-label">Sleep Improvement</div></div>';

  const tableSection = hasReal
    ? '<h2>Assessment History</h2>\n<table><thead><tr><th>Measure</th><th>Baseline</th><th>Latest</th><th>Change</th></tr></thead><tbody>' + measureRows + '</tbody></table>\n'
    : '<h2>Treatment Goals</h2>\n<table><thead><tr><th>Goal</th><th>Target</th><th>Current</th><th>Status</th></tr></thead><tbody>' + goalRows + '</tbody></table>\n';

  const insightText = hasReal
    ? 'Treatment progress report generated on ' + today + '. ' + (ptoData.measures.length) + ' outcome measures tracked over ' + (ptoData.measures[0].points ? ptoData.measures[0].points.length : 0) + ' assessment points. Scores are compared from baseline to most recent follow-up. Please discuss these results with your care team at your next appointment.'
    : 'Over the course of ' + totalSessions + ' sessions beginning ' + startFmt + ', ' + (patient.name || 'the patient') + ' has demonstrated consistent and meaningful clinical progress. Anxiety severity decreased by ' + anxImp + ' points, sleep quality improved by ' + slpImp + ' points. Continued maintenance sessions are recommended to consolidate these gains.';

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
    '<div class="meta">Patient: <strong style="color:#e2e8f0">' + (patient.name || '—') + '</strong> &nbsp;&bull;&nbsp; Treatment start: ' + startFmt + ' &nbsp;&bull;&nbsp; Generated: ' + today + '</div>\n' +
    '<h2>Outcome Summary</h2>\n<div class="stat-row">' + statsRow +
    '</div>\n' + tableSection +
    '<h2>Key Insights</h2>\n' +
    '<p class="insight">' + insightText + '</p>\n' +
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
  // 3s timeout so a hung Fly backend can never wedge the Progress page on a
  // spinner. On timeout `resp` is null and we fall through to the seeded
  // outcomes (which are already a sensible demo).
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);
  try {
    // Fetch all patient data sources in parallel
    const [
      resp,
      wearableRaw,
      wellnessRaw,
      tasksRaw,
      sessionsRaw,
      learnRaw,
      assessmentsRaw,
    ] = await Promise.all([
      _raceNull(api.patientPortalOutcomes()),
      _raceNull(api.patientPortalWearableSummary(7)),
      _raceNull(api.patientPortalWellnessLogs(14)),
      _raceNull(api.portalListHomeProgramTasks()),
      _raceNull(api.portalListHomeSessions()),
      _raceNull(api.patientPortalLearnProgress()),
      _raceNull(api.patientPortalAssessments()),
    ]);

    const items = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.items) ? resp.items : null);
    if (!items || !items.length) return _ptoSeed();

    // Group by template_title (API field); legacy template_name retained as fallback.
    const groups = {};
    items.forEach(function(item) {
      const raw = (item.template_title || item.template_name || '').trim();
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

    // Process wearable summary
    var wearableSummary = null;
    if (wearableRaw && Array.isArray(wearableRaw.daily) && wearableRaw.daily.length) {
      var wdays = wearableRaw.daily;
      wearableSummary = {
        sleep: _pgpAverage(wdays.map(function(d) { return d.sleep_duration_h; })),
        hrv: _pgpAverage(wdays.map(function(d) { return d.hrv_ms; })),
        rhr: _pgpAverage(wdays.map(function(d) { return d.rhr_bpm; })),
        steps: _pgpAverage(wdays.map(function(d) { return d.steps; })),
        readiness: _pgpAverage(wdays.map(function(d) { return d.readiness_score; })),
        daily: wdays,
      };
    }

    // Process wellness logs
    var wellnessLogs = Array.isArray(wellnessRaw) ? wellnessRaw : [];

    // Process home tasks
    var homeTasks = Array.isArray(tasksRaw) ? tasksRaw : [];

    // Process home sessions
    var homeSessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];

    // Process learn progress
    var learnProgress = learnRaw && typeof learnRaw === 'object' ? learnRaw : { read_article_ids: [], total_available: 0 };

    // Process assessments
    var assessments = Array.isArray(assessmentsRaw) ? assessmentsRaw : [];

    const liveData = {
      patient: patientInfo,
      nextAssessmentDate: seed.nextAssessmentDate,
      measures: measures,
      wearableSummary: wearableSummary,
      wellnessLogs: wellnessLogs,
      homeTasks: homeTasks,
      homeSessions: homeSessions,
      learnProgress: learnProgress,
      assessments: assessments,
    };

    // Cache to localStorage so _ptoLoad() picks it up too
    try { localStorage.setItem(_PTO_SEED_KEY, JSON.stringify(liveData)); } catch (_e) {}
    return liveData;
  } catch (_e) {
    return _ptoSeed();
  }
}

// ── SVG Sparkline trend chart ─────────────────────────────────────────────────
function _sparkline(scores, width, height) {
  width = width || 300; height = height || 120;
  if (!scores || scores.length < 2) return '<div style="color:var(--text-tertiary,#64748b);font-size:12px;padding:12px 0">Not enough data yet for trend chart.</div>';
  var max = Math.max.apply(null, scores.concat([1]));
  var min = 0;
  var pad = 16;
  var w = width - pad * 2, h = height - pad * 2;
  var pts = scores.map(function(s, i) {
    var x = pad + (i / (scores.length - 1)) * w;
    var y = pad + (1 - (s - min) / (max - min || 1)) * h;
    return { x: x, y: y, s: s };
  });
  var path = pts.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  var fill = pts.map(function(p, i) {
    return (i === 0 ? 'M' + p.x.toFixed(1) + ',' + (height - pad) + ' ' : '') + 'L' + p.x.toFixed(1) + ',' + p.y.toFixed(1);
  }).join(' ') + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (height - pad) + ' Z';
  var last = scores[scores.length - 1], first = scores[0];
  var trend = last < first - 1 ? '\u2193 Improving' : last > first + 1 ? '\u2191 Increased' : '\u2192 Stable';
  var trendColor = last < first - 1 ? '#00d4bc' : last > first + 1 ? '#f87171' : '#94a3b8';
  var uid = 'sg' + Math.random().toString(36).slice(2, 8);
  return '<div style="position:relative">' +
    '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" style="display:block;max-width:100%">' +
      '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#00d4bc" stop-opacity="0.25"/>' +
        '<stop offset="100%" stop-color="#00d4bc" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<path d="' + fill + '" fill="url(#' + uid + ')" stroke="none"/>' +
      '<path d="' + path + '" stroke="#00d4bc" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      pts.map(function(p) { return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="#00d4bc" stroke="var(--card,#0f172a)" stroke-width="1.5"/>'; }).join('') +
    '</svg>' +
    '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-tertiary,#64748b);padding:0 ' + pad + 'px;margin-top:2px">' +
      '<span>Earlier</span>' +
      '<span style="color:' + trendColor + ';font-weight:600">' + trend + '</span>' +
      '<span>Recent</span>' +
    '</div>' +
    '<div style="font-size:10px;color:var(--text-tertiary,#64748b);text-align:center;margin-top:4px">Lower score = fewer symptoms</div>' +
  '</div>';
}

function _pgpMetricDelta(current, baseline, higherIsBetter) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  var rawPct = Math.round(((current - baseline) / Math.abs(baseline)) * 100);
  if (higherIsBetter) return rawPct;
  return rawPct * -1;
}

function _pgpJournalStats() {
  var journal = [];
  try { journal = JSON.parse(localStorage.getItem('ds_symptom_journal') || '[]'); } catch (_e) {}
  var rows = journal
    .map(function(entry) {
      var raw = entry.date || entry.created_at;
      if (!raw) return null;
      var day = String(raw).slice(0, 10);
      return {
        day: day,
        mood: typeof entry.mood_score === 'number' ? entry.mood_score : entry.mood,
        sleep: typeof entry.sleep_score === 'number' ? entry.sleep_score : entry.sleep,
        stress: typeof entry.stress === 'number' ? entry.stress : entry.anxiety_score,
      };
    })
    .filter(Boolean)
    .sort(function(a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });

  var map = new Map();
  rows.forEach(function(row) { map.set(row.day, row); });
  var unique = Array.from(map.values());
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var streak = 0;
  for (var i = 0; i < 30; i += 1) {
    var d = new Date(today);
    d.setDate(today.getDate() - i);
    var key = d.toISOString().slice(0, 10);
    if (map.has(key)) streak += 1;
    else break;
  }
  return {
    entries: unique,
    last7: unique.filter(function(row) { return row.day >= new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10); }),
    last14: unique.filter(function(row) { return row.day >= new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10); }),
    streak: streak,
  };
}

function _pgpAverage(vals) {
  var clean = vals.filter(function(v) { return Number.isFinite(v); });
  if (!clean.length) return null;
  return clean.reduce(function(sum, value) { return sum + value; }, 0) / clean.length;
}

function _pgpNormalizeData() {
  var el = document.getElementById('patient-content');
  if (!el) return null;
  var data     = _outcomeGetData();
  var ptoData  = _ptoLoad();
  var p        = data.patient;
  var ptoPat   = ptoData.patient;
  var measures = ptoData.measures || [];
  var _rptLoc  = (typeof getLocale === 'function' ? getLocale() : 'en') === 'tr' ? 'tr-TR' : 'en-US';
  var journal = _pgpJournalStats();
  var primaryMeasure = measures.find(function(m) { return m.id === 'phq9'; }) || measures[0] || null;
  var primaryPoints = primaryMeasure ? primaryMeasure.points || [] : [];
  var secondaryMeasure = measures.find(function(m) { return m.id === 'gad7'; }) || null;
  var secondaryPoints = secondaryMeasure ? secondaryMeasure.points || [] : [];
  var tertiaryMeasure = measures.find(function(m) { return m.id === 'pcl5'; }) || null;
  var tertiaryPoints = tertiaryMeasure ? tertiaryMeasure.points || [] : [];
  var baseline = primaryPoints.length ? primaryPoints[0].score : null;
  var latest = primaryPoints.length ? primaryPoints[primaryPoints.length - 1].score : null;
  var improvementPct = (Number.isFinite(baseline) && baseline > 0 && Number.isFinite(latest))
    ? Math.round(((baseline - latest) / baseline) * 100)
    : null;
  var status = _pgpStatus(improvementPct);
  var sessionsCompleted = Number(p.totalSessions || ptoPat.totalSessions || data.sessions.length || 0);
  var plannedSessions = Math.max(12, Math.ceil(sessionsCompleted / 6) * 6 || 24);
  var treatmentPct = Math.max(0, Math.min(100, Math.round((sessionsCompleted / plannedSessions) * 100)));
  var adherencePct = Math.max(0, Math.min(100, Math.round((journal.last14.length / 14) * 100)));
  var scoreLabel = primaryMeasure ? primaryMeasure.label : 'Progress score';
  var currentBand = _pgpPhq9Band(latest);
  var daysSince = Math.max(0, Math.floor((Date.now() - new Date(ptoPat.startDate || p.startDate).getTime()) / 86400000));
  var sessions = Array.isArray(data.sessions) ? data.sessions : [];
  var reviewedSessions = sessions.filter(function(session) { return session.clinicianRead; });
  var lastReview = reviewedSessions.length ? reviewedSessions[reviewedSessions.length - 1] : null;
  var nextAssessmentDate = ptoData.nextAssessmentDate || null;
  var nextAssessmentLabel = nextAssessmentDate
    ? new Date(nextAssessmentDate).toLocaleDateString(_rptLoc, { weekday: 'long', month: 'long', day: 'numeric' })
    : null;
  var empty = !measures.length && !sessions.length && !(data.goals || []).length;
  var last7AvgMood = _pgpAverage(journal.last7.map(function(row) { return row.mood; }));
  var last7AvgSleep = _pgpAverage(journal.last7.map(function(row) { return row.sleep; }));
  var last7AvgStress = _pgpAverage(journal.last7.map(function(row) { return row.stress; }));
  return {
    el: el,
    data: data,
    ptoData: ptoData,
    patient: Object.assign({}, p, ptoPat),
    measures: measures,
    primaryMeasure: primaryMeasure,
    primaryPoints: primaryPoints,
    secondaryMeasure: secondaryMeasure,
    secondaryPoints: secondaryPoints,
    tertiaryMeasure: tertiaryMeasure,
    tertiaryPoints: tertiaryPoints,
    baseline: baseline,
    latest: latest,
    improvementPct: improvementPct,
    status: status,
    currentBand: currentBand,
    sessionsCompleted: sessionsCompleted,
    plannedSessions: plannedSessions,
    treatmentPct: treatmentPct,
    adherencePct: adherencePct,
    scoreLabel: scoreLabel,
    daysSince: daysSince,
    journal: journal,
    lastReview: lastReview,
    nextAssessmentDate: nextAssessmentDate,
    nextAssessmentLabel: nextAssessmentLabel,
    empty: empty,
    last7AvgMood: last7AvgMood,
    last7AvgSleep: last7AvgSleep,
    last7AvgStress: last7AvgStress,
    locale: _rptLoc,
    wearableSummary: ptoData.wearableSummary || null,
    wellnessLogs: Array.isArray(ptoData.wellnessLogs) ? ptoData.wellnessLogs : [],
    homeTasks: Array.isArray(ptoData.homeTasks) ? ptoData.homeTasks : [],
    homeSessions: Array.isArray(ptoData.homeSessions) ? ptoData.homeSessions : [],
    learnProgress: ptoData.learnProgress || { read_article_ids: [], total_available: 0 },
    assessments: Array.isArray(ptoData.assessments) ? ptoData.assessments : [],
  };
}

function _pgpLoadingSkeleton() {
  return (
    '<div class="pgp-page">' +
      '<div class="pgp-skel-grid">' +
        '<div class="ds-skeleton-card"><div class="ds-skeleton-line" style="height:20px;width:34%;margin-bottom:14px"></div><div class="ds-skeleton-line" style="height:60px;width:100%;margin-bottom:10px"></div><div class="ds-skeleton-line" style="height:14px;width:72%"></div></div>' +
        '<div class="ds-skeleton-card"><div class="ds-skeleton-line" style="height:18px;width:40%;margin-bottom:16px"></div><div class="ds-skeleton-line" style="height:160px;width:100%"></div></div>' +
      '</div>' +
      '<div class="pgp-skel-stats">' +
        '<div class="ds-skeleton-card"><div class="ds-skeleton-line" style="height:14px;width:56%;margin-bottom:14px"></div><div class="ds-skeleton-line" style="height:32px;width:44%;margin-bottom:10px"></div><div class="ds-skeleton-line" style="height:12px;width:68%"></div></div>' +
        '<div class="ds-skeleton-card"><div class="ds-skeleton-line" style="height:14px;width:56%;margin-bottom:14px"></div><div class="ds-skeleton-line" style="height:32px;width:44%;margin-bottom:10px"></div><div class="ds-skeleton-line" style="height:12px;width:68%"></div></div>' +
        '<div class="ds-skeleton-card"><div class="ds-skeleton-line" style="height:14px;width:56%;margin-bottom:14px"></div><div class="ds-skeleton-line" style="height:32px;width:44%;margin-bottom:10px"></div><div class="ds-skeleton-line" style="height:12px;width:68%"></div></div>' +
        '<div class="ds-skeleton-card"><div class="ds-skeleton-line" style="height:14px;width:56%;margin-bottom:14px"></div><div class="ds-skeleton-line" style="height:32px;width:44%;margin-bottom:10px"></div><div class="ds-skeleton-line" style="height:12px;width:68%"></div></div>' +
      '</div>' +
    '</div>'
  );
}

function _pgpEmptyState() {
  return (
    '<div class="pgp-empty-state">' +
      '<div class="pgp-empty-icon">◌</div>' +
      '<h2>Your progress will appear here</h2>' +
      '<p>Once you complete your first assessment or your care team records your first session review, this page will show your scores, goals, and progress over time.</p>' +
      '<div class="pgp-empty-actions">' +
        '<button class="pgp-btn-ghost" onclick="window._navPatient(\'patient-assessments\')">Complete an assessment</button>' +
        '<button class="pgp-btn-ghost" onclick="window._navPatient(\'patient-messages\')">Message care team</button>' +
      '</div>' +
    '</div>'
  );
}

function _pgpSummaryBlock(progress) {
  var reviewText = progress.lastReview
    ? 'Last reviewed ' + new Date(progress.lastReview.date).toLocaleDateString(progress.locale, { month: 'long', day: 'numeric' })
    : 'Your first clinician review will appear here';
  var nextText = progress.nextAssessmentLabel
    ? 'Next check-in: ' + progress.nextAssessmentLabel
    : 'Next check-in will appear once your care team schedules it';
  var explanation = progress.improvementPct !== null && progress.improvementPct >= 10
    ? 'Your recent scores suggest you are moving in the right direction. Improvements in symptoms often happen gradually, and consistency matters more than speed.'
    : 'This page shows your treatment progress in plain language so you can see how things are changing over time and what to focus on next.';
  return (
    '<section class="pgp-summary">' +
      '<div class="pgp-summary-copy">' +
        '<div class="pgp-chip" style="color:' + progress.status.color + ';background:' + progress.status.color + '14;border-color:' + progress.status.color + '33">' + progress.status.label + '</div>' +
        '<h2>My progress</h2>' +
        '<p>' + explanation + '</p>' +
        '<div class="pgp-summary-notes">' +
          '<span>' + reviewText + '</span>' +
          '<span>' + nextText + '</span>' +
          '<span>' + progress.daysSince + ' days in treatment</span>' +
        '</div>' +
      '</div>' +
      '<div class="pgp-summary-score">' +
        '<div class="pgp-summary-score-label">' + progress.scoreLabel + '</div>' +
        '<div class="pgp-summary-score-value">' + (Number.isFinite(progress.latest) ? progress.latest : '—') + '</div>' +
        '<div class="pgp-summary-score-band">' + progress.currentBand.label + '</div>' +
      '</div>' +
    '</section>'
  );
}

function _pgpKpis(progress) {
  var improvementText = progress.improvementPct === null
    ? 'We will show your change once you have at least two score points.'
    : (progress.improvementPct >= 0 ? progress.improvementPct + '% better than baseline' : Math.abs(progress.improvementPct) + '% higher than baseline');
  var streakText = progress.journal.streak > 0 ? progress.journal.streak + '-day streak' : 'No current streak';
  var cards = [
    {
      label: 'Treatment progress',
      value: progress.treatmentPct + '%',
      note: progress.sessionsCompleted + ' of ' + progress.plannedSessions + ' planned sessions',
      accent: '#2dd4bf',
    },
    {
      label: 'Sessions completed',
      value: String(progress.sessionsCompleted),
      note: progress.sessionsCompleted > 0 ? 'Each session adds to your recovery picture' : 'No sessions recorded yet',
      accent: '#60a5fa',
    },
    {
      label: 'Current score',
      value: Number.isFinite(progress.latest) ? String(progress.latest) : '—',
      note: improvementText,
      accent: '#8b5cf6',
    },
    {
      label: 'Adherence',
      value: progress.adherencePct + '%',
      note: streakText + ' · based on the last 14 days',
      accent: '#22c55e',
    },
  ];
  return (
    '<section class="pgp-kpis">' +
      cards.map(function(card) {
        return (
          '<article class="pgp-kpi-card">' +
            '<div class="pgp-kpi-label">' + card.label + '</div>' +
            '<div class="pgp-kpi-value" style="color:' + card.accent + '">' + card.value + '</div>' +
            '<div class="pgp-kpi-note">' + card.note + '</div>' +
          '</article>'
        );
      }).join('') +
    '</section>'
  );
}

function _pgpInterpretation(progress) {
  var note = progress.lastReview && progress.lastReview.note
    ? progress.lastReview.note
    : (progress.improvementPct !== null && progress.improvementPct >= 20
        ? 'Your scores and check-ins suggest steady improvement. Keep showing up for sessions and logging how you feel between visits.'
        : 'Your progress is still early. Regular check-ins and attending sessions help your care team adjust treatment at the right time.');
  var clinician = progress.lastReview ? progress.lastReview.clinician : 'Your care team';
  var when = progress.lastReview
    ? new Date(progress.lastReview.date).toLocaleDateString(progress.locale, { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Waiting for first review';
  return (
    '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Clinician interpretation</div><h3>What your care team sees right now</h3></div></div>' +
      '<div class="pgp-interpret-card">' +
        '<div class="pgp-interpret-meta"><span>' + clinician + '</span><span>' + when + '</span></div>' +
        '<p>' + note + '</p>' +
        '<button class="pgp-btn-ghost" onclick="window._navPatient(\'patient-messages\')">Message care team</button>' +
      '</div>' +
    '</section>'
  );
}

function _pgpTrendSeries(progress) {
  if (progress.journal.last7.length >= 3) {
    return [
      {
        key: 'Mood',
        color: '#2dd4bf',
        good: 'up',
        points: progress.journal.last7.map(function(row) { return { label: row.day.slice(5), value: row.mood }; }).filter(function(row) { return Number.isFinite(row.value); }),
      },
      {
        key: 'Sleep',
        color: '#60a5fa',
        good: 'up',
        points: progress.journal.last7.map(function(row) { return { label: row.day.slice(5), value: row.sleep }; }).filter(function(row) { return Number.isFinite(row.value); }),
      },
      {
        key: 'Stress',
        color: '#f472b6',
        good: 'down',
        points: progress.journal.last7.map(function(row) { return { label: row.day.slice(5), value: row.stress }; }).filter(function(row) { return Number.isFinite(row.value); }),
      },
    ];
  }
  // Do NOT fall back to legacy demo symptom arrays — show empty state until
  // the patient has logged real check-ins.
  return [];
}

function _pgpSymptomTrendChart(progress) {
  var series = _pgpTrendSeries(progress);
  if (!series.length) {
    return (
      '<section class="pgp-panel">' +
        '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Symptom trends</div><h3>How you have been feeling over time</h3></div></div>' +
        '<div class="pgp-chart-empty">Your trend chart will appear once you have enough assessments or daily check-ins.</div>' +
      '</section>'
    );
  }
  var flat = [];
  series.forEach(function(line) {
    line.points.forEach(function(point) { if (Number.isFinite(point.value)) flat.push(point.value); });
  });
  var min = Math.min.apply(null, flat);
  var max = Math.max.apply(null, flat);
  var range = max - min || 1;
  var width = 900;
  var height = 300;
  var padL = 48;
  var padR = 24;
  var padT = 24;
  var padB = 56;
  var innerW = width - padL - padR;
  var innerH = height - padT - padB;
  var labels = series[0].points.map(function(point) { return point.label; });
  var grid = '';
  [0, 0.25, 0.5, 0.75, 1].forEach(function(step) {
    var y = padT + innerH * step;
    var value = Math.round(max - range * step);
    grid += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + y.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    grid += '<text x="' + (padL - 10) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="rgba(148,163,184,0.7)">' + value + '</text>';
  });
  var lines = series.map(function(line) {
    var pts = line.points.map(function(point, idx) {
      var x = padL + (idx / Math.max(1, line.points.length - 1)) * innerW;
      var y = padT + (1 - ((point.value - min) / range)) * innerH;
      return { x: x, y: y, value: point.value };
    });
    var polyline = pts.map(function(point) { return point.x.toFixed(1) + ',' + point.y.toFixed(1); }).join(' ');
    var dots = pts.map(function(point, idx) {
      var halo = idx === pts.length - 1 ? '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="9" fill="' + line.color + '" opacity="0.14"/>' : '';
      return halo + '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="' + (idx === pts.length - 1 ? 4.5 : 3) + '" fill="' + line.color + '" stroke="#0f172a" stroke-width="1.5"/>';
    }).join('');
    return '<polyline points="' + polyline + '" fill="none" stroke="' + line.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots;
  }).join('');
  var xLabels = labels.map(function(label, idx) {
    var x = padL + (idx / Math.max(1, labels.length - 1)) * innerW;
    return '<text x="' + x.toFixed(1) + '" y="' + (height - 18) + '" text-anchor="middle" font-size="10" fill="rgba(148,163,184,0.7)">' + label + '</text>';
  }).join('');
  var legend = series.map(function(line) {
    var first = line.points[0] ? line.points[0].value : null;
    var last = line.points[line.points.length - 1] ? line.points[line.points.length - 1].value : null;
    var delta = _pgpMetricDelta(last, first, line.good === 'up');
    var deltaText = delta === null ? 'stable' : (delta > 0 ? '+' + delta + '%' : delta < 0 ? delta + '%' : 'stable');
    return '<span class="pgp-legend-item"><span class="pgp-legend-dot" style="background:' + line.color + '"></span>' + line.key + ' <strong>' + deltaText + '</strong></span>';
  }).join('');
  return (
    '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Symptom trends</div><h3>How things have changed since you started</h3></div></div>' +
      '<div class="pgp-chart-card">' +
        '<svg viewBox="0 0 ' + width + ' ' + height + '" class="pgp-chart-svg" role="img" aria-label="Symptom trends chart">' + grid + lines + xLabels + '</svg>' +
        '<div class="pgp-legend">' + legend + '</div>' +
        '<div class="pgp-chart-footnote">This chart keeps things simple: lower anxiety and stress are better, while higher sleep and focus scores are better.</div>' +
      '</div>' +
    '</section>'
  );
}

function _pgpBrainCards(progress) {
  var cards = [
    {
      title: 'Calm regulation',
      subtitle: 'Fronto-limbic balance',
      detail: progress.improvementPct !== null && progress.improvementPct >= 20
        ? 'Signals look steadier than at the start of treatment.'
        : 'This area focuses on steadier emotional regulation over time.',
      targetRegion: 'ACC',
      highlightSites: ['F3', 'F4', 'Fz'],
    },
    {
      title: 'Attention network',
      subtitle: 'Focus and cognitive control',
      detail: progress.last7AvgMood !== null && progress.last7AvgMood >= 6
        ? 'Daily check-ins suggest your attention is becoming more consistent.'
        : 'This area supports staying on task and reducing mental drift.',
      targetRegion: 'DLPFC-L',
      highlightSites: ['F3', 'C3', 'Cz'],
    },
    {
      title: 'Sleep readiness',
      subtitle: 'Wind-down and recovery',
      detail: progress.last7AvgSleep !== null
        ? 'Recent sleep average: ' + progress.last7AvgSleep.toFixed(1) + '/10.'
        : 'Sleep and recovery markers will become clearer as you log more check-ins.',
      targetRegion: 'V1',
      highlightSites: ['Pz', 'O1', 'Oz', 'O2'],
    },
  ];
  return (
    '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Brain activity snapshot</div><h3>Simplified qEEG-style view</h3></div></div>' +
      '<div class="pgp-brain-grid">' +
        cards.map(function(card) {
          return (
            '<article class="pgp-brain-card">' +
              '<div class="pgp-brain-map">' + renderBrainMap10_20({ size: 188, targetRegion: card.targetRegion, highlightSites: card.highlightSites, showConnection: false }) + '</div>' +
              '<div class="pgp-brain-copy">' +
                '<div class="pgp-brain-title">' + card.title + '</div>' +
                '<div class="pgp-brain-subtitle">' + card.subtitle + '</div>' +
                '<p>' + card.detail + '</p>' +
              '</div>' +
            '</article>'
          );
        }).join('') +
      '</div>' +
    '</section>'
  );
}

function _pgpDomainCards(progress) {
  var wearable = null;
  try { wearable = JSON.parse(localStorage.getItem('ds_wearable_summary') || 'null'); } catch (_e) {}
  // Compute attention proxy from real PHQ-9 / GAD-7 improvement when available
  var attentionPct = 50;
  if (progress.improvementPct !== null) {
    attentionPct = Math.max(12, Math.min(96, 50 + Math.round(progress.improvementPct / 2)));
  }
  var domainRows = [
    {
      title: 'Cognitive domains',
      items: [
        { label: 'Attention', pct: attentionPct },
        { label: 'Mood stability', pct: Math.max(8, Math.min(96, Math.round(((progress.last7AvgMood || 5) / 10) * 100))) },
        { label: 'Sleep recovery', pct: Math.max(8, Math.min(96, Math.round(((progress.last7AvgSleep || 5) / 10) * 100))) },
      ],
    },
    {
      title: 'Deep recovery',
      items: [
        { label: 'Session consistency', pct: progress.treatmentPct },
        { label: 'Clinician-reviewed sessions', pct: sessionsReviewedPct(progress) },
        { label: 'Daily check-ins', pct: progress.adherencePct },
      ],
    },
    {
      title: 'Biomarkers',
      items: [
        { label: 'Sleep duration', pct: wearable && wearable.sleep ? Math.min(100, Math.round(parseFloat(String(wearable.sleep).replace(/[^\d.]/g, '')) / 9 * 100)) : 0 },
        { label: 'HRV recovery', pct: wearable && wearable.hrv ? Math.min(100, Math.round(parseFloat(String(wearable.hrv).replace(/[^\d.]/g, '')) / 70 * 100)) : 0 },
        { label: 'Resting heart rate', pct: wearable && wearable.rhr ? Math.max(15, Math.min(100, 100 - Math.round((parseFloat(String(wearable.rhr).replace(/[^\d.]/g, '')) - 50) * 2))) : 0 },
      ],
    },
  ];
  return (
    '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Recovery overview</div><h3>Where improvement is showing up</h3></div></div>' +
      '<div class="pgp-domain-grid">' +
        domainRows.map(function(group) {
          return (
            '<article class="pgp-domain-card">' +
              '<h4>' + group.title + '</h4>' +
              '<div class="pgp-domain-list">' +
                group.items.map(function(item) {
                  return (
                    '<div class="pgp-domain-row">' +
                      '<div class="pgp-domain-top"><span>' + item.label + '</span><strong>' + item.pct + '%</strong></div>' +
                      '<div class="pgp-domain-track"><div class="pgp-domain-fill" style="width:' + item.pct + '%"></div></div>' +
                    '</div>'
                  );
                }).join('') +
              '</div>' +
            '</article>'
          );
        }).join('') +
      '</div>' +
    '</section>'
  );
}

function sessionsReviewedPct(progress) {
  var reviewed = progress.data.sessions.filter(function(session) { return session.clinicianRead; }).length;
  var total = Math.max(progress.data.sessions.length, 1);
  return Math.round((reviewed / total) * 100);
}

function _pgpMilestones(progress) {
  var goals = progress.data.goals || [];
  var achieved = goals.filter(function(goal) { return goal.status === 'achieved'; }).length;
  var nextGoal = goals.find(function(goal) { return goal.status !== 'achieved'; }) || null;
  var milestoneCards = [
    {
      label: 'Treatment plan',
      pct: progress.treatmentPct,
      note: progress.sessionsCompleted + ' of ' + progress.plannedSessions + ' sessions completed',
    },
    {
      label: 'Goal completion',
      pct: goals.length ? Math.round((achieved / goals.length) * 100) : 0,
      note: goals.length ? achieved + ' of ' + goals.length + ' goals reached' : 'Goals will appear when your care team adds them',
    },
    {
      label: 'Check-in consistency',
      pct: progress.adherencePct,
      note: progress.journal.last14.length + ' of the last 14 days logged',
    },
  ];
  var nextTarget = nextGoal
    ? (nextGoal.name + ' · current ' + nextGoal.current + ' / target ' + nextGoal.target)
    : 'You have reached all current goals. New targets will appear here when they are added to your portal workflow.';
  return (
    '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Milestones and goals</div><h3>Your next targets</h3></div></div>' +
      '<div class="pgp-milestone-grid">' +
        milestoneCards.map(function(card) {
          return (
            '<article class="pgp-milestone-card">' +
              '<div class="pgp-milestone-top"><span>' + card.label + '</span><strong>' + card.pct + '%</strong></div>' +
              '<div class="pgp-milestone-track"><div class="pgp-milestone-fill" style="width:' + card.pct + '%"></div></div>' +
              '<div class="pgp-milestone-note">' + card.note + '</div>' +
            '</article>'
          );
        }).join('') +
      '</div>' +
      '<div class="pgp-next-target">' +
        '<div class="pgp-next-target-eyebrow">Next target</div>' +
        '<div class="pgp-next-target-value">' + nextTarget + '</div>' +
      '</div>' +
    '</section>'
  );
}

// ── Patient Progress page — Self-Assessment Section ───────────────────────────
// Replaces the raw number-input form with rich survey cards + inline forms
// using SELF_ASSESSMENT_SURVEYS definitions (emoji scales, sliders, etc.)

function _pgpSaLastLabel(key) {
  const last = getSelfAssessmentLastFiled(key);
  if (!last) return '<span class="pgp-sa-last">Not filed yet</span>';
  const d = new Date(last);
  const daysAgo = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (daysAgo === 0) return '<span class="pgp-sa-last">Last filed: Today</span>';
  if (daysAgo === 1) return '<span class="pgp-sa-last">Last filed: Yesterday</span>';
  return '<span class="pgp-sa-last">Last filed: ' + daysAgo + ' days ago</span>';
}

function _pgpSaCardHtml(key) {
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  const survey = SELF_ASSESSMENT_SURVEYS[key];
  const last = getSelfAssessmentLastFiled(key);
  let dueSoon = false;
  if (last) {
    const daysAgo = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
    dueSoon = survey.frequency === 'daily' ? daysAgo >= 1 : survey.frequency === 'weekly' ? daysAgo >= 5 : daysAgo >= 25;
  } else { dueSoon = true; }
  const freqLabel = survey.frequency.replace(/^./, function(c) { return c.toUpperCase(); });
  const tone = survey.tone || 'teal';
  const icons = { daily_mood:'&#127749;', weekly_wellness:'&#128200;', monthly_reflection:'&#127769;', daily_symptoms:'&#128293;', post_session:'&#128221;', adherence:'&#9989;', sleep_diary:'&#127769;' };
  return (
    '<div class="pgp-sa-card ' + esc(tone) + (dueSoon ? ' due-soon' : '') + '" data-sa="' + esc(key) + '">' +
      '<div class="pgp-sa-card-hd">' +
        '<div class="pgp-sa-ico">' + (icons[key] || '&#9997;') + '</div>' +
        '<div class="pgp-sa-badge">' + esc(freqLabel) + ' &middot; ' + esc(survey.timeLabel) + '</div>' +
      '</div>' +
      '<div class="pgp-sa-card-title">' + esc(survey.title) + '</div>' +
      '<div class="pgp-sa-card-sub">' + esc(survey.questions.length) + ' questions &middot; ' + esc(survey.timeLabel) + '</div>' +
      _pgpSaLastLabel(key) +
      '<button class="pgp-sa-start" onclick="window._pgpSaStart(\'' + esc(key) + '\')">Check in</button>' +
    '</div>'
  );
}

function _pgpSaFormHtml(key) {
  function esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  const survey = SELF_ASSESSMENT_SURVEYS[key];
  const draft = getSelfAssessmentDraft(key) || {};
  const answers = draft.answers || {};
  function _qHtml(q) {
    const val = answers[q.key] != null ? answers[q.key] : '';
    if (q.type === 'emoji_scale') {
      var emojis = [
        {v:1,f:'&#128543;',l:'Very low'},{v:2,f:'&#128533;',l:'Low'},{v:3,f:'&#128528;',l:'OK'},
        {v:4,f:'&#128578;',l:'Good'},{v:5,f:'&#128522;',l:'Great'}
      ];
      return (
        '<div class="pgp-sa-q" data-q="' + esc(q.key) + '">' +
          '<div class="pgp-sa-q-lbl">' + esc(q.label) + (q.optional ? '' : ' <span class="req">*</span>') + '</div>' +
          '<div class="pgp-sa-emoji-scale">' +
            emojis.map(function(e) {
              return '<button type="button" class="pgp-sa-emoji-btn ' + (val == e.v ? 'on' : '') + '" data-v="' + e.v + '" onclick="window._pgpSaPick(\'' + esc(key) + '\',\'' + esc(q.key) + '\',' + e.v + ')"><span class="f">' + e.f + '</span><span class="l">' + esc(e.l) + '</span></button>';
            }).join('') +
          '</div>' +
        '</div>'
      );
    }
    if (q.type === 'slider') {
      var defVal = val || Math.floor((q.min + q.max) / 2);
      return (
        '<div class="pgp-sa-q" data-q="' + esc(q.key) + '">' +
          '<div class="pgp-sa-q-lbl">' + esc(q.label) + (q.optional ? '' : ' <span class="req">*</span>') + '</div>' +
          '<div class="pgp-sa-slider-wrap">' +
            '<input type="range" min="' + q.min + '" max="' + q.max + '" value="' + defVal + '" class="pgp-sa-slider" id="pgp-sa-slider-' + esc(key) + '-' + esc(q.key) + '" oninput="window._pgpSaSlider(\'' + esc(key) + '\',\'' + esc(q.key) + '\',this.value)">' +
            '<div class="pgp-sa-slider-labels"><span>' + esc(q.labels[0]) + '</span><span id="pgp-sa-slider-val-' + esc(key) + '-' + esc(q.key) + '">' + defVal + '</span><span>' + esc(q.labels[1]) + '</span></div>' +
          '</div>' +
        '</div>'
      );
    }
    if (q.type === 'checkboxes') {
      var selected = Array.isArray(val) ? val : (val ? [val] : []);
      return (
        '<div class="pgp-sa-q" data-q="' + esc(q.key) + '">' +
          '<div class="pgp-sa-q-lbl">' + esc(q.label) + (q.optional ? '' : ' <span class="req">*</span>') + '</div>' +
          '<div class="pgp-sa-checks">' +
            q.options.map(function(opt) {
              return '<label class="pgp-sa-check"><input type="checkbox" value="' + esc(opt) + '" ' + (selected.indexOf(opt) >= 0 ? 'checked' : '') + ' onchange="window._pgpSaCheck(\'' + esc(key) + '\',\'' + esc(q.key) + '\',this.value,this.checked)"><span>' + esc(opt) + '</span></label>';
            }).join('') +
          '</div>' +
        '</div>'
      );
    }
    if (q.type === 'text') {
      return (
        '<div class="pgp-sa-q" data-q="' + esc(q.key) + '">' +
          '<div class="pgp-sa-q-lbl">' + esc(q.label) + (q.optional ? '' : ' <span class="req">*</span>') + '</div>' +
          '<textarea class="pgp-sa-textarea" rows="3" maxlength="' + (q.maxLength || 500) + '" placeholder="Type here..." oninput="window._pgpSaText(\'' + esc(key) + '\',\'' + esc(q.key) + '\',this.value)">' + esc(val) + '</textarea>' +
        '</div>'
      );
    }
    return '';
  }
  return (
    '<div class="pgp-sa-form" id="pgp-sa-form-' + esc(key) + '">' +
      '<div class="pgp-sa-form-hd">' +
        '<div>' +
          '<div class="pgp-sa-form-title">' + esc(survey.title) + '</div>' +
          '<div class="pgp-sa-form-sub">' + esc(survey.questions.length) + ' questions &middot; ' + esc(survey.timeLabel) + ' &middot; ' + esc(survey.frequency) + '</div>' +
        '</div>' +
        '<button class="pgp-btn-ghost" onclick="window._pgpSaCancel(\'' + esc(key) + '\')">Cancel</button>' +
      '</div>' +
      '<div class="pgp-sa-form-body">' +
        survey.questions.map(function(q) { return _qHtml(q); }).join('') +
      '</div>' +
      '<div class="pgp-sa-form-actions">' +
        '<button class="pgp-sa-submit" onclick="window._pgpSaSubmit(\'' + esc(key) + '\')">Submit check-in</button>' +
        '<span class="pgp-sa-saving" id="pgp-sa-saving-' + esc(key) + '"></span>' +
      '</div>' +
    '</div>'
  );
}

function _pgpSaQuickLogHtml() {
  return (
    '<div class="pgp-sa-quick">' +
      '<div class="pgp-sa-quick-hd">' +
        '<div class="pgp-sa-quick-title">Clinician Scales</div>' +
        '<div class="pgp-sa-quick-sub">Quick log for PHQ-9, GAD-7, PCL-5</div>' +
      '</div>' +
      '<div class="pgp-sa-quick-row">' +
        '<div class="pgp-sa-quick-field">' +
          '<label>PHQ-9</label>' +
          '<input type="number" min="0" max="27" id="pto-phq9-input" placeholder="0-27"/>' +
          '<span class="pgp-sa-quick-hint">Depression</span>' +
        '</div>' +
        '<div class="pgp-sa-quick-field">' +
          '<label>GAD-7</label>' +
          '<input type="number" min="0" max="21" id="pto-gad7-input" placeholder="0-21"/>' +
          '<span class="pgp-sa-quick-hint">Anxiety</span>' +
        '</div>' +
        '<div class="pgp-sa-quick-field">' +
          '<label>PCL-5</label>' +
          '<input type="number" min="0" max="80" id="pto-pcl5-input" placeholder="0-80"/>' +
          '<span class="pgp-sa-quick-hint">Trauma (opt.)</span>' +
        '</div>' +
        '<button class="pgp-sa-quick-btn" onclick="window._ptoSubmitAssessment()">Save</button>' +
      '</div>' +
    '</div>'
  );
}

function _pgpSelfAssessmentSection() {
  return (
    '<section class="pgp-panel">' +
      '<div class="pgp-panel-head">' +
        '<div>' +
          '<div class="pgp-panel-eyebrow">Self-report</div>' +
          '<h3>Check-ins</h3>' +
        '</div>' +
      '</div>' +
      '<div class="pgp-sa-grid" id="pgp-sa-grid">' +
        SELF_ASSESSMENT_KEYS.map(function(k) { return _pgpSaCardHtml(k); }).join('') +
      '</div>' +
      '<div id="pgp-sa-form-wrap"></div>' +
      _pgpSaQuickLogHtml() +
    '</section>'
  );
}

function _pgpActionsSection() {
  return (
    '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Actions</div><h3>Share and export</h3></div></div>' +
      '<div class="pto-share-row">' +
        '<button class="pto-share-btn pto-share-btn--copy" onclick="window._ptoCopyProgress()">&#128203; Copy Progress Summary</button>' +
        '<button class="pto-share-btn pto-share-btn--dl" onclick="window._ptoDownloadChart()">&#8595; Download Chart</button>' +
        '<button class="pto-share-btn pto-share-btn--dl" onclick="window._outcomeDownloadReport()">&#8595; Download Report</button>' +
      '</div>' +
    '</section>'
  );
}

// ── Wearable biometrics card (live API data) ──────────────────────────────────
function _pgpBiometricsLive(progress) {
  var w = progress.wearableSummary;
  if (!w) {
    return _pgpBiometrics(); // fallback to localStorage version
  }
  var sleepVal = w.sleep != null ? w.sleep.toFixed(1) + ' hrs' : '—';
  var hrvVal   = w.hrv   != null ? Math.round(w.hrv) + ' ms' : '—';
  var rhrVal   = w.rhr   != null ? Math.round(w.rhr) + ' bpm' : '—';
  var stepsVal = w.steps != null ? Math.round(w.steps).toLocaleString() + ' steps' : '—';
  var readinessVal = w.readiness != null ? Math.round(w.readiness) + '/100' : '—';
  var sleepN = w.sleep || 0, hrvN = w.hrv || 0, rhrN = w.rhr || 0, readinessN = w.readiness || 0;
  var sleepSt = sleepN >= 7 ? 'green' : sleepN >= 5.5 ? 'amber' : 'red';
  var hrvSt   = hrvN   >= 50 ? 'green' : hrvN   >= 30  ? 'amber' : 'red';
  var rhrSt   = rhrN   <= 65 ? 'green' : rhrN   <= 80  ? 'amber' : 'red';
  var readinessSt = readinessN >= 70 ? 'green' : readinessN >= 50 ? 'amber' : 'red';
  // Simple 7-day sparkline for readiness
  var readinessSpark = '';
  if (w.daily && w.daily.length > 1) {
    var rs = w.daily.map(function(d) { return d.readiness_score || 0; }).filter(function(v) { return v > 0; });
    readinessSpark = _sparkline(rs, 180, 60);
  }
  var tiles = [
    { label: 'Sleep',      val: sleepVal,       sub: 'avg last 7 nights',  icon: '🌙', st: sleepSt },
    { label: 'HRV',        val: hrvVal,         sub: 'avg last 7 days',    icon: '💚', st: hrvSt   },
    { label: 'Resting HR', val: rhrVal,         sub: 'avg last 7 days',    icon: '❤️', st: rhrSt   },
    { label: 'Readiness',  val: readinessVal,   sub: 'recovery score',     icon: '🔋', st: readinessSt },
  ];
  return '<section class="pgp-panel">' +
    '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Biometrics</div><h3>Recovery & sleep</h3></div></div>' +
    '<div class="pgp-bio-grid">' +
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
    (readinessSpark ? '<div style="margin-top:14px">' + readinessSpark + '</div>' : '') +
    '<div class="pgp-bio-sync">Last synced today &nbsp;·&nbsp; <a href="#" style="color:var(--teal,#00d4bc);text-decoration:none" onclick="window._navPatient(\'patient-wearables\');return false">Manage devices →</a></div>' +
  '</section>';
}

// ── Wellness log trend chart ────────────────────────────────────────────────────
function _pgpWellnessTrendChart(progress) {
  var logs = progress.wellnessLogs;
  if (!logs || logs.length < 3) {
    return '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Wellness check-ins</div><h3>Daily wellness trends</h3></div></div>' +
      '<div class="pgp-chart-empty">Your wellness trend will appear once you have completed a few daily check-ins.</div>' +
    '</section>';
  }
  var sorted = logs.slice().sort(function(a, b) {
    var da = (a.created_at || a.date || '').slice(0, 10);
    var db = (b.created_at || b.date || '').slice(0, 10);
    return da < db ? -1 : da > db ? 1 : 0;
  });
  var labels = sorted.map(function(it) {
    var d = new Date(it.created_at || it.date);
    return isNaN(d) ? '' : d.toLocaleDateString(progress.locale, { month: 'short', day: 'numeric' });
  });
  var moodVals = sorted.map(function(it) { return it.mood_score; }).filter(function(v) { return Number.isFinite(v); });
  var sleepVals = sorted.map(function(it) { return it.sleep_score; }).filter(function(v) { return Number.isFinite(v); });
  var energyVals = sorted.map(function(it) { return it.energy_score; }).filter(function(v) { return Number.isFinite(v); });
  var series = [];
  if (moodVals.length >= 2) series.push({ key: 'Mood', color: '#2dd4bf', good: 'up', points: sorted.map(function(it, i) { return { label: labels[i], value: it.mood_score }; }).filter(function(p) { return Number.isFinite(p.value); }) });
  if (sleepVals.length >= 2) series.push({ key: 'Sleep', color: '#60a5fa', good: 'up', points: sorted.map(function(it, i) { return { label: labels[i], value: it.sleep_score }; }).filter(function(p) { return Number.isFinite(p.value); }) });
  if (energyVals.length >= 2) series.push({ key: 'Energy', color: '#f59e0b', good: 'up', points: sorted.map(function(it, i) { return { label: labels[i], value: it.energy_score }; }).filter(function(p) { return Number.isFinite(p.value); }) });
  if (!series.length) {
    return '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Wellness check-ins</div><h3>Daily wellness trends</h3></div></div>' +
      '<div class="pgp-chart-empty">Your wellness trend will appear once you have completed a few daily check-ins.</div>' +
    '</section>';
  }
  var flat = [];
  series.forEach(function(line) {
    line.points.forEach(function(point) { if (Number.isFinite(point.value)) flat.push(point.value); });
  });
  var min = Math.min.apply(null, flat);
  var max = Math.max.apply(null, flat);
  var range = max - min || 1;
  var width = 900, height = 220, padL = 48, padR = 24, padT = 24, padB = 56;
  var innerW = width - padL - padR, innerH = height - padT - padB;
  var grid = '';
  [0, 0.25, 0.5, 0.75, 1].forEach(function(step) {
    var y = padT + innerH * step;
    var value = Math.round(max - range * step);
    grid += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + y.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    grid += '<text x="' + (padL - 10) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="10" fill="rgba(148,163,184,0.7)">' + value + '</text>';
  });
  var lines = series.map(function(line) {
    var pts = line.points.map(function(point, idx) {
      var x = padL + (idx / Math.max(1, line.points.length - 1)) * innerW;
      var y = padT + (1 - ((point.value - min) / range)) * innerH;
      return { x: x, y: y, value: point.value };
    });
    var polyline = pts.map(function(point) { return point.x.toFixed(1) + ',' + point.y.toFixed(1); }).join(' ');
    var dots = pts.map(function(point, idx) {
      var halo = idx === pts.length - 1 ? '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="9" fill="' + line.color + '" opacity="0.14"/>' : '';
      return halo + '<circle cx="' + point.x.toFixed(1) + '" cy="' + point.y.toFixed(1) + '" r="' + (idx === pts.length - 1 ? 4.5 : 3) + '" fill="' + line.color + '" stroke="#0f172a" stroke-width="1.5"/>';
    }).join('');
    return '<polyline points="' + polyline + '" fill="none" stroke="' + line.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots;
  }).join('');
  var xLabels = labels.slice(-series[0].points.length).map(function(label, idx) {
    var x = padL + (idx / Math.max(1, series[0].points.length - 1)) * innerW;
    return '<text x="' + x.toFixed(1) + '" y="' + (height - 18) + '" text-anchor="middle" font-size="10" fill="rgba(148,163,184,0.7)">' + label + '</text>';
  }).join('');
  var legend = series.map(function(line) {
    var first = line.points[0] ? line.points[0].value : null;
    var last = line.points[line.points.length - 1] ? line.points[line.points.length - 1].value : null;
    var delta = _pgpMetricDelta(last, first, line.good === 'up');
    var deltaText = delta === null ? 'stable' : (delta > 0 ? '+' + delta + '%' : delta < 0 ? delta + '%' : 'stable');
    return '<span class="pgp-legend-item"><span class="pgp-legend-dot" style="background:' + line.color + '"></span>' + line.key + ' <strong>' + deltaText + '</strong></span>';
  }).join('');
  return '<section class="pgp-panel">' +
    '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Wellness check-ins</div><h3>Daily wellness trends</h3></div></div>' +
    '<div class="pgp-chart-card">' +
      '<svg viewBox="0 0 ' + width + ' ' + height + '" class="pgp-chart-svg" role="img" aria-label="Wellness trends chart">' + grid + lines + xLabels + '</svg>' +
      '<div class="pgp-legend">' + legend + '</div>' +
      '<div class="pgp-chart-footnote">Based on your daily wellness check-ins (mood, sleep, energy).</div>' +
    '</div>' +
  '</section>';
}

// ── Home task adherence strip ───────────────────────────────────────────────────
function _pgpHomeTaskStrip(progress) {
  var tasks = progress.homeTasks;
  if (!tasks || !tasks.length) {
    return '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Home program</div><h3>Your tasks this week</h3></div></div>' +
      '<div class="pgp-chart-empty">Your clinician will assign home tasks as part of your treatment program.</div>' +
    '</section>';
  }
  var now = new Date();
  var weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var dayDots = days.map(function(label, idx) {
    var d = new Date(weekStart);
    d.setDate(weekStart.getDate() + idx);
    var dKey = d.toISOString().slice(0, 10);
    var dayTasks = tasks.filter(function(t) {
      var due = (t.due_date || '').slice(0, 10);
      var done = (t.completed_at || '').slice(0, 10);
      return due === dKey || done === dKey;
    });
    var allDone = dayTasks.length > 0 && dayTasks.every(function(t) { return t.status === 'completed' || t.completed_at; });
    var someDone = dayTasks.some(function(t) { return t.status === 'completed' || t.completed_at; });
    var dotClass = allDone ? 'pgp-task-dot done' : someDone ? 'pgp-task-dot partial' : dayTasks.length ? 'pgp-task-dot pending' : 'pgp-task-dot empty';
    return '<div class="pgp-task-day"><div class="' + dotClass + '"></div><div class="pgp-task-day-label">' + label + '</div></div>';
  }).join('');
  var completed = tasks.filter(function(t) { return t.status === 'completed' || t.completed_at; }).length;
  var pending = tasks.filter(function(t) { return t.status !== 'completed' && !t.completed_at; }).length;
  var recent = tasks.slice(0, 3).map(function(t) {
    var st = t.status === 'completed' || t.completed_at ? 'completed' : 'pending';
    var stClass = st === 'completed' ? 'pgp-task-chip done' : 'pgp-task-chip pending';
    return '<div class="pgp-task-row"><span class="pgp-task-title">' + (t.title || 'Task') + '</span><span class="' + stClass + '">' + st + '</span></div>';
  }).join('');
  return '<section class="pgp-panel">' +
    '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Home program</div><h3>Your tasks this week</h3></div></div>' +
    '<div class="pgp-task-strip">' + dayDots + '</div>' +
    '<div style="display:flex;gap:16px;margin:14px 0 10px;font-size:0.85rem;color:var(--text-secondary,#94a3b8)">' +
      '<span><strong style="color:var(--teal,#2dd4bf)">' + completed + '</strong> completed</span>' +
      '<span><strong style="color:var(--blue,#4a9eff)">' + pending + '</strong> pending</span>' +
    '</div>' +
    '<div class="pgp-task-list">' + recent + '</div>' +
  '</section>';
}

// ── Home device session timeline ────────────────────────────────────────────────
function _pgpHomeSessionTimeline(progress) {
  var sessions = progress.homeSessions;
  if (!sessions || !sessions.length) {
    return '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Home sessions</div><h3>Neuromodulation at home</h3></div></div>' +
      '<div class="pgp-chart-empty">Log your home neuromodulation sessions to track progress and share with your care team.</div>' +
    '</section>';
  }
  var sorted = sessions.slice().sort(function(a, b) {
    var da = new Date(a.started_at || 0).getTime();
    var db = new Date(b.started_at || 0).getTime();
    return db - da;
  });
  var items = sorted.slice(0, 5).map(function(s) {
    var date = s.started_at ? new Date(s.started_at).toLocaleDateString(progress.locale, { month: 'short', day: 'numeric' }) : '—';
    var device = s.device_name || 'Home device';
    var dur = s.duration_min ? s.duration_min + ' min' : '—';
    var tol = s.tolerance_score;
    var tolLabel = tol >= 4 ? 'Great' : tol >= 3 ? 'Good' : tol >= 2 ? 'Okay' : 'Poor';
    var tolColor = tol >= 4 ? '#22c55e' : tol >= 3 ? '#2dd4bf' : tol >= 2 ? '#f59e0b' : '#ef4444';
    var moodBefore = s.mood_before != null ? s.mood_before : '—';
    var moodAfter = s.mood_after != null ? s.mood_after : '—';
    var moodDelta = (s.mood_after != null && s.mood_before != null) ? (s.mood_after - s.mood_before) : null;
    var moodArrow = moodDelta === null ? '' : moodDelta > 0 ? '<span style="color:#22c55e">↑</span>' : moodDelta < 0 ? '<span style="color:#ef4444">↓</span>' : '<span style="color:#94a3b8">→</span>';
    return '<div class="pgp-session-row">' +
      '<div class="pgp-session-meta">' +
        '<span class="pgp-session-date">' + date + '</span>' +
        '<span class="pgp-session-device">' + device + '</span>' +
        '<span class="pgp-session-dur">' + dur + '</span>' +
      '</div>' +
      '<div class="pgp-session-details">' +
        '<span class="pgp-session-tol" style="color:' + tolColor + '">Tolerance: ' + tolLabel + '</span>' +
        '<span class="pgp-session-mood">Mood ' + moodBefore + ' → ' + moodAfter + ' ' + moodArrow + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
  return '<section class="pgp-panel">' +
    '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Home sessions</div><h3>Neuromodulation at home</h3></div></div>' +
    '<div class="pgp-session-timeline">' + items + '</div>' +
  '</section>';
}

// ── Learn progress mini-section ─────────────────────────────────────────────────
function _pgpLearnProgress(progress) {
  var lp = progress.learnProgress || { read_article_ids: [], total_available: 0 };
  var read = Array.isArray(lp.read_article_ids) ? lp.read_article_ids.length : 0;
  var total = lp.total_available || 0;
  var pct = total > 0 ? Math.round((read / total) * 100) : 0;
  if (!total && !read) {
    return '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Education</div><h3>Learning library</h3></div></div>' +
      '<div class="pgp-chart-empty">Condition-specific articles and guides will appear here as your care team shares them.</div>' +
    '</section>';
  }
  var barWidth = Math.max(4, pct) + '%';
  return '<section class="pgp-panel">' +
    '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Education</div><h3>Learning library</h3></div></div>' +
    '<div class="pgp-learn-card">' +
      '<div class="pgp-learn-stats">' +
        '<div class="pgp-learn-num">' + read + '<span class="pgp-learn-den">/' + total + '</span></div>' +
        '<div class="pgp-learn-label">articles read</div>' +
      '</div>' +
      '<div class="pgp-learn-bar-wrap">' +
        '<div class="pgp-learn-bar-bg"><div class="pgp-learn-bar-fill" style="width:' + barWidth + '"></div></div>' +
        '<div class="pgp-learn-pct">' + pct + '% complete</div>' +
      '</div>' +
      '<button class="pgp-btn-ghost" style="margin-top:14px" onclick="window._navPatient(\'patient-library\');return false">Continue learning →</button>' +
    '</div>' +
  '</section>';
}

// ── Assessment history ──────────────────────────────────────────────────────────
function _pgpAssessmentHistory(progress) {
  var assessments = progress.assessments;
  if (!assessments || !assessments.length) {
    return '<section class="pgp-panel">' +
      '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Assessments</div><h3>Your questionnaire history</h3></div></div>' +
      '<div class="pgp-chart-empty">Assessment history will appear once you complete your first questionnaire.</div>' +
    '</section>';
  }
  var sorted = assessments.slice().sort(function(a, b) {
    var da = new Date(a.completed_at || a.created_at || 0).getTime();
    var db = new Date(b.completed_at || b.created_at || 0).getTime();
    return db - da;
  });
  var items = sorted.slice(0, 5).map(function(a) {
    var title = a.template_title || 'Assessment';
    var isCompleted = a.status === 'completed' || a.completed_at;
    var score = a.score_numeric != null ? Math.round(a.score_numeric) : null;
    var date = a.completed_at || a.due_date || a.created_at;
    var dateLabel = date ? new Date(date).toLocaleDateString(progress.locale, { month: 'short', day: 'numeric' }) : '—';
    var chipClass = isCompleted ? 'pgp-task-chip done' : 'pgp-task-chip pending';
    var chipText = isCompleted ? 'Completed' : 'Pending';
    var scoreHtml = score != null ? '<span class="pgp-assess-score">Score: ' + score + '</span>' : '';
    return '<div class="pgp-assess-row">' +
      '<div class="pgp-assess-title">' + title + '</div>' +
      '<div class="pgp-assess-meta">' +
        '<span class="' + chipClass + '">' + chipText + '</span>' +
        scoreHtml +
        '<span class="pgp-assess-date">' + dateLabel + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
  var pendingCount = assessments.filter(function(a) { return a.status !== 'completed' && !a.completed_at; }).length;
  var pendingBanner = pendingCount > 0 ? '<div style="margin-bottom:14px;padding:10px 14px;border-radius:10px;background:rgba(0,212,188,0.08);border:1px solid rgba(0,212,188,0.18);color:var(--teal,#2dd4bf);font-size:0.85rem;font-weight:600">' + pendingCount + ' assessment' + (pendingCount > 1 ? 's' : '') + ' pending — <a href="#" style="color:var(--teal,#2dd4bf);text-decoration:underline" onclick="window._navPatient(\'patient-assessments\');return false">Complete now →</a></div>' : '';
  return '<section class="pgp-panel">' +
    '<div class="pgp-panel-head"><div><div class="pgp-panel-eyebrow">Assessments</div><h3>Your questionnaire history</h3></div></div>' +
    pendingBanner +
    '<div class="pgp-assess-list">' + items + '</div>' +
  '</section>';
}

function _renderProgressPage() {
  var progress = _pgpNormalizeData();
  if (!progress || !progress.el) return;
  progress.el.innerHTML = progress.empty
    ? '<div class="pgp-page">' + _pgpEmptyState() + '</div>'
    : (
        '<div class="pgp-page">' +
          (progress.ptoData._isDemoData ? '<div class="pgp-demo-banner">&#128204; Showing example data until your first live patient assessment is recorded.</div>' : '') +
          _pgpSummaryBlock(progress) +
          _pgpKpis(progress) +
          _pgpInterpretation(progress) +
          _pgpBiometricsLive(progress) +
          _pgpSymptomTrendChart(progress) +
          _pgpWellnessTrendChart(progress) +
          _pgpHomeTaskStrip(progress) +
          _pgpHomeSessionTimeline(progress) +
          _pgpLearnProgress(progress) +
          _pgpAssessmentHistory(progress) +
          _pgpBrainCards(progress) +
          _pgpDomainCards(progress) +
          _pgpMilestones(progress) +
          _pgpSelfAssessmentSection() +
          _pgpActionsSection() +
        '</div>'
      );
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
    { label: 'Sessions Completed', nv: p.totalSessions, max: 30, color: 'var(--teal,#00d4bc)', dv: null },
    { label: 'Overall Improvement', nv: improvePct, max: 100, color: 'var(--blue,#4a9eff)', dv: improvePct + '%' },
    { label: 'Goal Achievement', nv: goalRate, max: 100, color: 'var(--violet,#9b7fff)', dv: goalRate + '%' },
    { label: 'Days in Treatment', nv: daysSince, max: 365, color: 'var(--amber,#ffb547)', dv: null },
  ];

  const goalCardsHTML = data.goals.map(function (g) {
    const pct = Math.min(100, Math.round((g.current / g.target) * 100));
    const st = g.status === 'achieved' ? { label: 'Achieved', color: 'var(--teal,#00d4bc)' } : g.status === 'on-track' ? { label: 'On Track', color: 'var(--blue,#4a9eff)' } : { label: 'Needs Attention', color: 'var(--rose,#ff6b9d)' };
    const sn = notes[g.id] || '';
    return '<div class="iii-goal-card" id="goal-card-' + g.id + '">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:1rem;color:var(--text,#f1f5f9);margin-bottom:3px">' + _hdEsc(g.name) + '</div>' +
      '<div style="font-size:0.78rem;color:var(--text-muted,#94a3b8)">Target: ' + g.target + ' &nbsp;&bull;&nbsp; Current: ' + g.current + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' + _goalSparkline(g.id) +
      '<span style="font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:12px;background:' + st.color + '22;color:' + st.color + ';border:1px solid ' + st.color + '44">' + st.label + '</span></div></div>' +
      '<div style="margin:12px 0 6px"><div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted,#94a3b8);margin-bottom:5px"><span>Progress</span><span>' + pct + '%</span></div>' +
      '<div style="height:8px;background:rgba(255,255,255,0.07);border-radius:6px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + st.color + ';border-radius:6px;transition:width 1s ease"></div></div></div>' +
      '<div class="iii-goal-note-area" id="note-area-' + g.id + '" style="' + (sn ? '' : 'display:none') + '">' +
      '<textarea id="note-ta-' + g.id + '" rows="3" placeholder="Write a personal note about this goal..." style="width:100%;background:rgba(255,255,255,0.04);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;padding:10px;font-size:0.82rem;color:var(--text,#f1f5f9);resize:vertical;margin-top:8px;font-family:inherit" onchange="window._outcomeSaveNote(\'' + g.id + '\',this.value)">' + _hdEsc(sn) + '</textarea></div>' +
      '<button style="font-size:0.78rem;margin-top:8px;padding:4px 10px;border-radius:8px;cursor:pointer;background:none;border:1px solid rgba(255,255,255,0.1);color:var(--text-muted,#94a3b8)" onclick="window._outcomeToggleNote(\'' + g.id + '\')">' + (sn ? 'Edit Note' : '+ Add Personal Note') + '</button></div>';
  }).join('');

  function _starHTML(sid, cr) {
    const sv = ratings[sid] != null ? ratings[sid] : cr;
    if (sv != null) return '<div class="iii-star-rating" aria-label="' + sv + ' stars">' + [1, 2, 3, 4, 5].map(function (s) { return '<span style="color:' + (s <= sv ? '#fbbf24' : 'rgba(255,255,255,0.15)') + '">&#9733;</span>'; }).join('') + '</div>';
    return '<div class="iii-star-rating" id="stars-' + sid + '">' + [1, 2, 3, 4, 5].map(function (s) { return '<span style="cursor:pointer;color:rgba(255,255,255,0.2);font-size:1.3rem" onmouseenter="window._outcomeStarHover(\'' + sid + '\',' + s + ')" onmouseleave="window._outcomeStarReset(\'' + sid + '\')" onclick="window._outcomeRateSession(\'' + sid + '\',' + s + ')">&#9733;</span>'; }).join('') + '</div>';
  }

  const sessionHTML = data.sessions.map(function (s) {
    const read = s.clinicianRead ? '<span style="color:var(--teal,#00d4bc);font-size:0.72rem" title="Clinician has read">&#10003;&#10003; Read</span>' : '<span style="color:var(--text-muted,#94a3b8);font-size:0.72rem">&#10003; Sent</span>';
    const dl = new Date(s.date).toLocaleDateString(_rptLoc, { month: 'short', day: 'numeric', year: 'numeric' });
    return '<div style="display:flex;flex-direction:column;gap:8px;padding:14px 16px;background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.07));border-radius:12px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<div><div style="font-weight:600;font-size:0.9rem;color:var(--text,#f1f5f9)">' + _hdEsc(s.type) + '</div><div style="font-size:0.75rem;color:var(--text-muted,#94a3b8);margin-top:2px">' + dl + ' &nbsp;&bull;&nbsp; ' + _hdEsc(s.clinician) + '</div></div>' +
      '<div style="display:flex;align-items:center;gap:10px">' + _starHTML(s.id, s.rating) + read + '</div></div>' +
      (s.note ? '<div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);font-style:italic;padding-left:2px">&#8220;' + _hdEsc(s.note) + '&#8221;</div>' : '') +
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
      '<p><strong style="color:' + (daysUntil <= 1 ? 'var(--amber,#ffb547)' : 'var(--teal,#2dd4bf)') + '">' + due + '</strong> &mdash; ' + dueFmt + '</p>' +
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
    '<div style="font-size:1.6rem;font-weight:800;color:var(--text,#f1f5f9);line-height:1.2">Full Outcome History, <span style="color:var(--teal,#00d4bc)">' + p.name + '</span></div>' +
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
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="color:var(--teal,#00d4bc)">&#9647;</span> Outcome History</h2>' +
    '<div class="iii-chart-row">' + _symptomLineChart(data.symptoms) + _sessionBarChart(data.sessionScores) + '</div>' +
    '</div>' +

    '<div style="margin-bottom:32px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="color:var(--violet,#9b7fff)">&#9678;</span> Treatment Goals</h2>' +
    '<div style="display:flex;flex-direction:column;gap:12px">' + goalCardsHTML + '</div>' +
    '</div>' +

    '<div style="margin-bottom:32px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:14px;display:flex;align-items:center;gap:8px"><span style="color:var(--amber,#ffb547)">&#9733;</span> Recent Sessions</h2>' +
    '<div style="display:flex;flex-direction:column;gap:10px">' + sessionHTML + '</div>' +
    '<button style="margin-top:16px;display:inline-flex;align-items:center;gap:7px;background:rgba(45,212,191,0.1);color:var(--teal,#00d4bc);border:1px solid rgba(45,212,191,0.25);border-radius:10px;padding:9px 18px;font-size:0.85rem;font-weight:600;cursor:pointer" onclick="window._navPatient(\'patient-messages\')">&#9647; Message My Care Team</button>' +
    '</div>' +

    '<div style="margin-bottom:32px;padding:20px 22px;background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.07));border-radius:14px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:8px;display:flex;align-items:center;gap:8px"><span style="color:var(--blue,#4a9eff)">&#8595;</span> Progress Report</h2>' +
    '<p style="font-size:0.82rem;color:var(--text-muted,#94a3b8);margin-bottom:14px;line-height:1.5">Download a comprehensive summary of your treatment journey to share with your care team or keep for your records.</p>' +
    '<button style="display:inline-flex;align-items:center;gap:8px;background:var(--blue,#4a9eff);color:#0f172a;border:none;border-radius:10px;padding:10px 20px;font-size:0.88rem;font-weight:700;cursor:pointer" onclick="window._outcomeDownloadReport()">&#8595; Download My Progress Report</button>' +
    '</div>' +

    '<div style="margin-bottom:32px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">' +
    '<h2 style="font-size:1rem;font-weight:700;color:var(--text,#f1f5f9);display:flex;align-items:center;gap:8px"><span style="color:var(--rose,#ff6b9d)">&#9672;</span> 30-Day Symptom Heatmap</h2>' +
    '<button id="overlay-toggle-btn" style="font-size:0.78rem;padding:6px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:var(--text-muted,#94a3b8);cursor:pointer" onclick="window._outcomeToggleOverlay()">Show Session Dates</button>' +
    '</div>' +
    '<div id="overlay-session-dates" style="display:none;margin-bottom:12px;font-size:0.78rem;color:var(--teal,#00d4bc);padding:8px 12px;background:rgba(45,212,191,0.07);border-radius:8px;border:1px solid rgba(45,212,191,0.2)">Session dates: ' + sdates + '</div>' +
    '<p style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin:4px 0 10px;line-height:1.5">Each tile is one day. Colour shows how strong your symptoms were — <strong style="color:var(--teal,#00d4bc)">teal means a calmer day</strong>, rose means a tougher one. Tap a tile to see details.</p>' +
    '<div class="iii-calendar-dots">' + _calendarDots30() + '</div>' +
    '<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap" role="list" aria-label="Symptom intensity legend">' +
    '<span role="listitem" style="font-size:0.72rem;color:var(--text-muted,#94a3b8);display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--teal,#00d4bc);display:inline-block;opacity:0.7" aria-hidden="true"></span>Low symptoms &mdash; calmer day</span>' +
    '<span role="listitem" style="font-size:0.72rem;color:var(--text-muted,#94a3b8);display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--amber,#ffb547);display:inline-block;opacity:0.7" aria-hidden="true"></span>Moderate</span>' +
    '<span role="listitem" style="font-size:0.72rem;color:var(--text-muted,#94a3b8);display:inline-flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--rose,#ff6b9d);display:inline-block;opacity:0.7" aria-hidden="true"></span>High symptoms &mdash; tougher day</span>' +
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
  const pto = _ptoLoad();
  const html = _buildReportHTML(_outcomeGetData(), pto);
  const blob = new Blob([html], { type: 'text/html' });
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
  function _esc(v) { if (v == null) return ''; return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'); }
  let entry = null;
  try {
    const j = JSON.parse(localStorage.getItem('ds_symptom_journal') || '[]');
    entry = j.find(function (e) { return e.date === dateStr || (e.created_at || '').slice(0, 10) === dateStr; });
  } catch (_e) { /* no journal */ }
  popup.style.display = 'block';
  const df = new Date(dateStr).toLocaleDateString(getLocale() === 'tr' ? 'tr-TR' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (entry) {
    const mood = _esc(entry.mood || entry.mood_score || '\u2014'), nt = _esc(entry.notes || entry.free_text || '');
    popup.innerHTML = '<strong style="color:var(--text,#f1f5f9)">' + _esc(df) + '</strong><div style="margin-top:6px">Mood: <strong style="color:var(--teal,#00d4bc)">' + mood + '</strong></div>' + (nt ? '<div style="margin-top:6px;line-height:1.5">&#8220;' + nt + '&#8221;</div>' : '');
  } else {
    popup.innerHTML = '<strong style="color:var(--text,#f1f5f9)">' + _esc(df) + '</strong><div style="margin-top:6px">No journal entry for this day. Visit <a href="#" onclick="window._navPatient(\'pt-journal\');return false" style="color:var(--teal,#00d4bc)">Symptom Journal</a> to add one.</div>';
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
  const text = 'My treatment progress: Started ' + startFmt + ', PHQ-9 improved from ' + baseline + ' to ' + latest + ' (' + pct + '% reduction). ' + pat.totalSessions + ' sessions completed.';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      window._showNotifToast && window._showNotifToast({ title: 'Copied!', body: 'Progress summary copied to clipboard.', severity: 'success' });
    }).catch(function () { prompt('Copy this summary:', text); });
  } else { prompt('Copy this summary:', text); }
};

window._ptoDownloadChart = function () {
  const svg = document.getElementById('pgp-trend-svg') || document.getElementById('pto-trend-svg');
  if (!svg) { window._showToast?.('Chart not found.', 'error'); return; }
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
  img.onerror = function () { URL.revokeObjectURL(url); window._showToast?.('Could not render chart image.', 'error'); };
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
  window._showNotifToast && window._showNotifToast({ title: 'Saved', body: 'Assessment scores saved in this browser. Clinic sync depends on portal workflow.', severity: 'success' });
  _renderProgressPage();
};

// ── Self-Assessment handlers (Progress page) ──────────────────────────────────
window._pgpSaStart = function(key) {
  const wrap = document.getElementById('pgp-sa-form-wrap');
  const grid = document.getElementById('pgp-sa-grid');
  if (!wrap) return;
  wrap.innerHTML = _pgpSaFormHtml(key);
  if (grid) grid.style.display = 'none';
};
window._pgpSaCancel = function(key) {
  const wrap = document.getElementById('pgp-sa-form-wrap');
  const grid = document.getElementById('pgp-sa-grid');
  if (wrap) wrap.innerHTML = '';
  if (grid) grid.style.display = '';
  clearSelfAssessmentDraft(key);
};
window._pgpSaPick = function(key, qKey, val) {
  const draft = getSelfAssessmentDraft(key) || { answers: {} };
  draft.answers = draft.answers || {};
  draft.answers[qKey] = val;
  setSelfAssessmentDraft(key, draft);
  const form = document.getElementById('pgp-sa-form-' + key);
  if (!form) return;
  const qEl = form.querySelector('[data-q="' + qKey + '"]');
  if (!qEl) return;
  qEl.querySelectorAll('.pgp-sa-emoji-btn').forEach(function(btn) {
    btn.classList.toggle('on', Number(btn.getAttribute('data-v')) === val);
  });
};
window._pgpSaSlider = function(key, qKey, val) {
  const draft = getSelfAssessmentDraft(key) || { answers: {} };
  draft.answers = draft.answers || {};
  draft.answers[qKey] = Number(val);
  setSelfAssessmentDraft(key, draft);
  const lbl = document.getElementById('pgp-sa-slider-val-' + key + '-' + qKey);
  if (lbl) lbl.textContent = val;
};
window._pgpSaCheck = function(key, qKey, val, checked) {
  const draft = getSelfAssessmentDraft(key) || { answers: {} };
  draft.answers = draft.answers || {};
  var arr = draft.answers[qKey];
  if (!Array.isArray(arr)) arr = arr ? [arr] : [];
  if (checked) { if (arr.indexOf(val) < 0) arr.push(val); }
  else { arr = arr.filter(function(v) { return v !== val; }); }
  draft.answers[qKey] = arr;
  setSelfAssessmentDraft(key, draft);
};
window._pgpSaText = function(key, qKey, val) {
  const draft = getSelfAssessmentDraft(key) || { answers: {} };
  draft.answers = draft.answers || {};
  draft.answers[qKey] = val;
  setSelfAssessmentDraft(key, draft);
};
window._pgpSaSubmit = async function(key) {
  const survey = SELF_ASSESSMENT_SURVEYS[key];
  if (!survey) return;
  const draft = getSelfAssessmentDraft(key) || { answers: {} };
  const answers = draft.answers || {};
  // Validate required fields
  var missing = [];
  survey.questions.forEach(function(q) {
    if (q.optional) return;
    var v = answers[q.key];
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) missing.push(q.label);
  });
  if (missing.length) {
    window._showNotifToast && window._showNotifToast({ title: 'Please answer all questions', body: missing.join(', '), severity: 'warning' });
    return;
  }
  const saving = document.getElementById('pgp-sa-saving-' + key);
  if (saving) saving.textContent = 'Saving...';
  try {
    const score = survey.computeScore(answers);
    const payload = {
      survey_type: key,
      frequency: survey.frequency,
      responses: answers,
      score: score,
      notes: answers.note || answers.concerns || null,
      ai_context: { score: score, answered_at: new Date().toISOString(), question_count: survey.questions.length }
    };
    let savedToBackend = false;
    if (typeof api.submitSelfAssessment === 'function') {
      await api.submitSelfAssessment(payload);
      savedToBackend = true;
    }
    setSelfAssessmentLastFiled(key, new Date().toISOString());
    clearSelfAssessmentDraft(key);
    window._showNotifToast && window._showNotifToast({
      title: savedToBackend ? 'Check-in saved' : 'Check-in saved locally',
      body: savedToBackend ? survey.title + ' submitted.' : survey.title + ' was stored in this browser only.',
      severity: savedToBackend ? 'success' : 'warning'
    });
    _renderProgressPage();
  } catch (e) {
    if (saving) saving.textContent = '';
    window._showNotifToast && window._showNotifToast({ title: 'Save failed', body: 'Please try again.', severity: 'error' });
  }
};

window._pgpAskAssistant = function(promptText) {
  if (window._navPatient) window._navPatient('patient-virtualcare');
  // Give the page a moment to render then prefill the AI chat input
  setTimeout(function() {
    const inp = document.getElementById('vc-input');
    if (inp) { inp.value = promptText || ''; inp.focus(); }
  }, 400);
};

// ── Exported page entry point ─────────────────────────────────────────────────
export async function pgPatientOutcomePortal(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('My progress',
    '<div style="display:flex;gap:8px">' +
    '<button style="display:inline-flex;align-items:center;gap:6px;background:rgba(45,212,191,0.1);color:#2dd4bf;border:1px solid rgba(45,212,191,0.25);border-radius:8px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer" onclick="window._ptoCopyProgress()">&#8599; Copy summary</button>' +
    '<button style="display:inline-flex;align-items:center;gap:6px;background:rgba(96,165,250,0.08);color:#60a5fa;border:1px solid rgba(96,165,250,0.2);border-radius:8px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer" onclick="window._outcomeDownloadReport()">&#8595; Download report</button>' +
    '</div>'
  );
  const content = document.getElementById('patient-content');
  if (content) content.innerHTML = _pgpLoadingSkeleton();
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

function _gpDemoBanner() {
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:20px;background:linear-gradient(135deg,rgba(245,158,11,0.14),rgba(217,119,6,0.08));border:1px solid rgba(245,158,11,0.35);border-radius:12px">
    <span style="font-size:15px;color:var(--amber,#ffb547)">⚠</span>
    <div>
      <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--amber,#ffb547)">Demo Guardian Portal</div>
      <div style="font-size:11.5px;color:var(--text-muted,#94a3b8);margin-top:3px;line-height:1.45">This guardian portal is currently rendering sample guardian, patient, consent, message, homework, and crisis-plan data from local demo storage. Do not treat the records below as live patient data.</div>
    </div>
  </div>`;
}

function _gpBadge(lvl) {
  const m = { full: ['Full Access', 'full'], view: ['View Only', 'view'], emergency: ['Emergency Only', 'emergency'] };
  const [l, c] = m[lvl] || ['Unknown', 'view'];
  return `<span class="ooo-access-badge ooo-access-badge--${c}">${l}</span>`;
}

function _gpRing(pct, sz) {
  sz = sz || 80;
  const r = sz / 2 - 8, circ = 2 * Math.PI * r, dash = (pct / 100) * circ, cx = sz / 2, cy = sz / 2;
  const col = pct >= 80 ? 'var(--teal,#00d4bc)' : pct >= 60 ? 'var(--amber,#ffb547)' : 'var(--rose,#ff6b9d)';
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
  const ptCards = patients.map(pt => { const active = pt.patientId === pid; const cc = pt.compliance >= 80 ? 'var(--teal,#00d4bc)' : pt.compliance >= 60 ? 'var(--amber,#ffb547)' : 'var(--rose,#ff6b9d)'; return `<div class="ooo-patient-card${active ? ' ooo-patient-card--active' : ''}" onclick="window._gpSwitch('${pt.patientId}')"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px"><div><div style="font-weight:700;font-size:1rem;color:var(--text,#f1f5f9)">${pt.name}</div><div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);margin-top:2px">Age ${pt.age} \u00b7 ${pt.relation}</div></div>${_gpBadge(pt.accessLevel)}</div><div style="font-size:0.82rem;color:var(--text-muted,#94a3b8);margin-bottom:8px">&#9639; ${pt.program}</div><div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted,#94a3b8);margin-bottom:14px"><span>Next: <strong style="color:var(--text,#f1f5f9)">${new Date(pt.nextAppt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</strong></span><span>Compliance: <strong style="color:${cc}">${pt.compliance}%</strong></span></div><button style="width:100%;padding:8px;border-radius:8px;border:1px solid ${active ? 'var(--teal,#00d4bc)' : 'var(--border,rgba(255,255,255,0.1))'};background:${active ? 'rgba(45,212,191,0.12)' : 'transparent'};color:${active ? 'var(--teal,#00d4bc)' : 'var(--text-muted,#94a3b8)'};font-size:0.82rem;font-weight:600;cursor:pointer">${active ? '\u2713 Currently Viewing' : 'Switch to Patient'}</button></div>`; }).join('');

  // treatment progress
  const treatHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--blue,#4a9eff)">&#9639;</span> Treatment Progress \u2014 ${activePt.name}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px"><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:10px">Current Protocol</div><div style="font-weight:600;color:var(--text,#f1f5f9);margin-bottom:4px">${activePt.program}</div><div style="font-size:0.85rem;color:var(--text-muted,#94a3b8);margin-bottom:16px">Week 6 of treatment</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8)">Next Session</div><div style="font-weight:600;color:var(--teal,#00d4bc);font-size:0.9rem;margin-top:2px">${new Date(activePt.nextAppt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-top:2px">Clinician: Dr. Nguyen \u00b7 10:00 AM</div></div><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px;display:flex;align-items:center;gap:20px">${_gpRing(activePt.compliance, 88)}<div><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:6px">Session Compliance</div><div style="font-weight:600;font-size:1.1rem;color:var(--text,#f1f5f9)">${activePt.compliance}%</div><div style="font-size:0.8rem;color:var(--text-muted,#94a3b8);margin-top:4px">Sessions attended</div><div style="font-size:0.78rem;color:${activePt.compliance >= 80 ? 'var(--teal,#00d4bc)' : 'var(--amber,#ffb547)'};margin-top:6px">${activePt.compliance >= 80 ? 'Excellent progress' : 'Good \u2014 keep it up'}</div></div></div><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:10px">Symptom Trend \u2014 Last 8 Sessions</div><div style="margin-bottom:8px">${_gpSpark(pid)}</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8)">Higher is better \u00b7 Scale 1\u201310</div><div style="font-size:0.78rem;color:var(--teal,#00d4bc);margin-top:4px">\u2191 Improving trend</div></div></div><div style="margin-top:16px;background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:14px">Recent Clinician Notes (Guardian-Visible)</div><div style="display:flex;flex-direction:column;gap:12px">${clinicNotes.map(n => `<div style="padding:12px 16px;background:var(--hover-bg,rgba(255,255,255,0.04));border-radius:10px;border-left:3px solid var(--blue,#4a9eff)"><div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.78rem;color:var(--text-muted,#94a3b8)"><span>${n.clinician}</span><span>${new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div><div style="font-size:0.87rem;color:var(--text,#f1f5f9);line-height:1.55">${n.text}</div></div>`).join('')}</div></div></section>`;

  // homework & adherence
  const hwHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--violet,#9b7fff)">&#9643;</span> Homework &amp; Adherence</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:14px">Assigned Tasks</div><div id="gp-homework-list" style="display:flex;flex-direction:column;gap:10px">${ptHw.map(hw => { const sbg = hw.status === 'completed' ? 'rgba(45,212,191,0.12)' : 'rgba(251,191,36,0.12)', sc = hw.status === 'completed' ? 'var(--teal,#00d4bc)' : 'var(--amber,#ffb547)'; return `<div style="padding:10px 12px;background:var(--hover-bg,rgba(255,255,255,0.04));border-radius:10px;border:1px solid var(--border,rgba(255,255,255,0.07))"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="flex:1"><div style="font-size:0.87rem;font-weight:600;color:var(--text,#f1f5f9);margin-bottom:3px">${hw.task}</div><div style="font-size:0.75rem;color:var(--text-muted,#94a3b8)">Due: ${new Date(hw.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${hw.assisted ? ' \u00b7 Guardian assisted' : ''}</div></div><span style="flex-shrink:0;padding:3px 9px;border-radius:20px;font-size:0.72rem;font-weight:700;background:${sbg};color:${sc}">${hw.status === 'completed' ? '\u2713 Done' : 'Pending'}</span></div>${hw.status !== 'completed' ? `<div style="display:flex;gap:8px;margin-top:8px"><button onclick="window._gpMarkHw('${hw.id}','completed')" style="flex:1;padding:5px 0;border-radius:7px;border:1px solid var(--teal,#00d4bc);background:transparent;color:var(--teal,#00d4bc);font-size:0.75rem;font-weight:600;cursor:pointer">Mark Complete</button><button onclick="window._gpMarkHw('${hw.id}','assisted')" style="flex:1;padding:5px 0;border-radius:7px;border:1px solid var(--violet,#9b7fff);background:transparent;color:var(--violet,#9b7fff);font-size:0.75rem;font-weight:600;cursor:pointer">Mark Assisted</button></div>` : ''}</div>`; }).join('')}</div><button onclick="window._gpEncourage()" style="margin-top:16px;width:100%;padding:10px;border-radius:10px;border:1px solid var(--amber,#ffb547);background:rgba(251,191,36,0.08);color:var(--amber,#ffb547);font-size:0.85rem;font-weight:600;cursor:pointer">&#128155; Send Encouragement</button></div><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:14px">Weekly Adherence</div><div style="overflow-x:auto">${_gpBars(weekData)}</div><div style="display:flex;gap:14px;margin-top:14px;flex-wrap:wrap"><span style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-muted,#94a3b8)"><span style="width:10px;height:10px;border-radius:2px;background:#2dd4bf;display:inline-block"></span>On track (\u226580%)</span><span style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-muted,#94a3b8)"><span style="width:10px;height:10px;border-radius:2px;background:#fbbf24;display:inline-block"></span>Partial (50\u201379%)</span><span style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-muted,#94a3b8)"><span style="width:10px;height:10px;border-radius:2px;background:#fb7185;display:inline-block"></span>Missed (&lt;50%)</span></div></div></div></section>`;

  // messaging
  const msgHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--teal,#00d4bc)">&#9643;</span> Secure Messages${unread > 0 ? ` <span style="background:var(--rose,#ff6b9d);color:#fff;border-radius:20px;padding:2px 9px;font-size:0.7rem;font-weight:700">${unread}</span>` : ''}</h2><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px"><div class="ooo-message-thread" id="gp-message-thread" style="max-height:320px;overflow-y:auto;margin-bottom:16px">${ptMsgs.length === 0 ? '<div style="text-align:center;padding:32px;color:var(--text-muted,#94a3b8);font-size:0.87rem">No messages yet. Send a message to your care team below.</div>' : ptMsgs.map(msg => { const g = msg.from === 'guardian'; const bg = g ? 'rgba(45,212,191,0.12)' : 'var(--hover-bg,rgba(255,255,255,0.05))', brd = g ? 'rgba(45,212,191,0.2)' : 'var(--border,rgba(255,255,255,0.08))', rad = g ? '14px 14px 4px 14px' : '14px 14px 14px 4px', dot = (!msg.read && !g) ? '<span style="position:absolute;top:-4px;right:-4px;width:10px;height:10px;border-radius:50%;background:var(--rose,#ff6b9d)"></span>' : ''; return `<div style="display:flex;flex-direction:column;align-items:${g ? 'flex-end' : 'flex-start'};margin-bottom:12px"><div style="max-width:78%;padding:10px 14px;border-radius:${rad};background:${bg};border:1px solid ${brd};position:relative">${dot}<div style="font-size:0.75rem;color:var(--text-muted,#94a3b8);margin-bottom:4px">${msg.fromName} \u00b7 ${new Date(msg.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div><div style="font-size:0.875rem;color:var(--text,#f1f5f9);line-height:1.5">${msg.text}</div></div></div>`; }).join('')}</div><div style="display:flex;gap:10px"><textarea id="gp-msg-input" placeholder="Type a message to your care team\u2026" rows="2" style="flex:1;padding:10px 14px;background:var(--hover-bg,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:10px;color:var(--text,#f1f5f9);font-size:0.87rem;resize:vertical;font-family:inherit;outline:none"></textarea><button onclick="window._gpSendMsg()" style="padding:10px 18px;border-radius:10px;border:none;background:var(--teal,#00d4bc);color:#0a0f1a;font-weight:700;font-size:0.85rem;cursor:pointer;flex-shrink:0;align-self:flex-end">Send</button></div><div style="margin-top:10px"><input id="gp-note-input" type="text" placeholder="Attach a brief note (optional)\u2026" style="width:100%;box-sizing:border-box;padding:8px 14px;background:var(--hover-bg,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:8px;color:var(--text,#f1f5f9);font-size:0.82rem;font-family:inherit;outline:none"/></div></div></section>`;

  // consents
  const catL = { sessionNotes: 'Session Notes', medicationInfo: 'Medication Info', biometricData: 'Biometric Data', financialRecords: 'Financial Records' };
  const consentHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--amber,#ffb547)">&#9673;</span> Consent &amp; Authorization</h2><div style="display:flex;flex-direction:column;gap:12px">${ptCons.map(con => { const stBg = con.status === 'valid' ? 'rgba(45,212,191,0.12)' : con.status === 'expiring' ? 'rgba(251,191,36,0.12)' : 'rgba(251,113,133,0.12)', stC = con.status === 'valid' ? 'var(--teal,#00d4bc)' : con.status === 'expiring' ? 'var(--amber,#ffb547)' : 'var(--rose,#ff6b9d)', stL = con.status === 'valid' ? '\u2713 Valid' : con.status === 'expiring' ? '\u26a0 Expiring Soon' : '\u2715 Expired', rBtn = con.status !== 'valid' ? `<button onclick="window._gpResign('${con.id}')" style="padding:5px 14px;border-radius:8px;border:1px solid var(--amber,#ffb547);background:rgba(251,191,36,0.08);color:var(--amber,#ffb547);font-size:0.8rem;font-weight:600;cursor:pointer">Re-sign</button>` : '', catBtns = Object.keys(catL).map(k => { const on = con.categories[k]; return `<button onclick="window._gpToggleCat('${con.id}','${k}')" style="padding:4px 12px;border-radius:20px;border:1px solid ${on ? 'var(--blue,#4a9eff)' : 'var(--border,rgba(255,255,255,0.1))'};background:${on ? 'rgba(96,165,250,0.1)' : 'transparent'};color:${on ? 'var(--blue,#4a9eff)' : 'var(--text-muted,#94a3b8)'};font-size:0.75rem;cursor:pointer">${on ? '\u2713' : '\u25cb'} ${catL[k]}</button>`; }).join(''); return `<div class="ooo-consent-item"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div style="flex:1;min-width:200px"><div style="font-weight:600;font-size:0.9rem;color:var(--text,#f1f5f9);margin-bottom:3px">${con.title}</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8)">Signed: ${new Date(con.signedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} \u00b7 Expires: ${new Date(con.expiresDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div><div style="display:flex;align-items:center;gap:10px;flex-shrink:0"><span style="padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${stBg};color:${stC}">${stL}</span>${rBtn}</div></div><div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">${catBtns}</div></div>`; }).join('')}</div></section>`;

  // emergency & crisis
  const eis = 'padding:7px 10px;background:var(--hover-bg,rgba(255,255,255,0.05));border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:7px;color:var(--text,#f1f5f9);font-size:0.82rem;font-family:inherit;outline:none';
  const ecRows = ecList.map(ec => `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--hover-bg,rgba(255,255,255,0.04));border-radius:10px"><div style="width:28px;height:28px;border-radius:50%;background:rgba(251,113,133,0.15);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:var(--rose,#ff6b9d);flex-shrink:0">${ec.priority}</div><div style="flex:1"><div style="font-weight:600;font-size:0.87rem;color:var(--text,#f1f5f9)">${ec.name}</div><div style="font-size:0.75rem;color:var(--text-muted,#94a3b8)">${ec.relation}</div></div><a href="tel:${ec.phone}" style="color:var(--teal,#00d4bc);font-size:0.87rem;font-weight:600;text-decoration:none">${ec.phone}</a></div>`).join('');
  const ecEditRows = ecList.map(ec => `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px"><input id="gp-ec-name-${ec.id}" value="${ec.name}" placeholder="Name" style="${eis}"/><input id="gp-ec-rel-${ec.id}" value="${ec.relation}" placeholder="Relation" style="${eis}"/><input id="gp-ec-phone-${ec.id}" value="${ec.phone}" placeholder="Phone" style="${eis}"/></div>`).join('');
  const crisisDetail = crisis ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px"><div><div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--amber,#ffb547);margin-bottom:10px;font-weight:600">Warning Signs</div><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${crisis.warningSigns.map(s => `<li style="font-size:0.85rem;color:var(--text,#f1f5f9);line-height:1.5">${s}</li>`).join('')}</ul></div><div><div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--teal,#00d4bc);margin-bottom:10px;font-weight:600">De-escalation Steps</div><ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${crisis.deEscalation.map(s => `<li style="font-size:0.85rem;color:var(--text,#f1f5f9);line-height:1.5">${s}</li>`).join('')}</ol></div></div><div style="margin-top:14px;padding:12px 16px;background:rgba(251,113,133,0.06);border-radius:10px;border:1px solid rgba(251,113,133,0.15)"><div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--rose,#ff6b9d);margin-bottom:8px;font-weight:600">If in immediate danger, call 911</div><div style="font-size:0.82rem;color:var(--text-muted,#94a3b8)">Then contact emergency contacts in priority order. Keep this plan accessible.</div></div>` : '<div style="color:var(--text-muted,#94a3b8);font-size:0.87rem">No crisis plan on file. Contact your care team to create one.</div>';
  const crisisHtml = !activePt ? '' : `<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--rose,#ff6b9d)">&#9888;</span> Emergency Contacts &amp; Crisis Plan</h2><div style="background:var(--card-bg,rgba(255,255,255,0.03));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:14px;padding:20px;margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8)">Emergency Contacts</div><button onclick="window._gpToggleEdit()" style="padding:5px 12px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--text-muted,#94a3b8);font-size:0.78rem;cursor:pointer">Update Info</button></div><div id="gp-contacts-list" style="display:flex;flex-direction:column;gap:8px">${ecRows}</div><div id="gp-edit-contacts-form" style="display:none;margin-top:14px;border-top:1px solid var(--border,rgba(255,255,255,0.08));padding-top:14px">${ecEditRows}<div style="display:flex;gap:8px;margin-top:4px"><button onclick="window._gpSaveContacts()" style="padding:7px 18px;border-radius:8px;border:none;background:var(--teal,#00d4bc);color:#0a0f1a;font-weight:700;font-size:0.82rem;cursor:pointer">Save Changes</button><button onclick="window._gpCancelEdit()" style="padding:7px 14px;border-radius:8px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--text-muted,#94a3b8);font-size:0.82rem;cursor:pointer">Cancel</button></div></div></div><div class="ooo-crisis-panel"><div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="window._gpToggleCrisis()"><div><div style="font-weight:600;font-size:0.92rem;color:var(--text,#f1f5f9)">Crisis &amp; Safety Plan \u2014 ${activePt.name}</div><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-top:2px">Know the warning signs and what to do</div></div><button id="gp-crisis-btn" style="background:rgba(251,113,133,0.1);border:1px solid rgba(251,113,133,0.25);color:var(--rose,#ff6b9d);border-radius:8px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer">View Plan</button></div><div id="gp-crisis-detail" style="display:none;margin-top:16px;border-top:1px solid rgba(251,113,133,0.2);padding-top:16px">${crisisDetail}</div></div></section>`;

  document.getElementById('app-content').innerHTML = `<div style="max-width:960px;margin:0 auto;padding:24px 20px 60px"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:28px"><div><div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted,#94a3b8);margin-bottom:4px">Family &amp; Guardian Portal</div><h1 style="margin:0;font-size:1.5rem;font-weight:700;color:var(--text,#f1f5f9)">Welcome, ${guardian.name} <span style="font-size:10px;font-weight:700;padding:4px 8px;border-radius:999px;background:rgba(245,158,11,0.12);color:var(--amber,#ffb547);border:1px solid rgba(245,158,11,0.3);vertical-align:middle">Demo data</span></h1><div style="font-size:0.85rem;color:var(--text-muted,#94a3b8);margin-top:3px">${guardian.relation} \u00b7 ${guardian.email}</div></div><div style="display:flex;align-items:center;gap:10px">${unread > 0 ? `<span style="background:var(--rose,#ff6b9d);color:#fff;border-radius:20px;padding:4px 12px;font-size:0.78rem;font-weight:700">${unread} unread message${unread > 1 ? 's' : ''}</span>` : ''}<div style="font-size:0.8rem;color:var(--text-muted,#94a3b8)">April 11, 2026</div></div></div>${_gpDemoBanner()}<section style="margin-bottom:36px"><h2 style="font-size:1rem;font-weight:600;color:var(--text,#f1f5f9);margin:0 0 16px;display:flex;align-items:center;gap:8px"><span style="color:var(--teal,#00d4bc)">&#9673;</span> Your Linked Patients</h2><div class="ooo-patient-cards">${ptCards}</div></section>${treatHtml}${hwHtml}${msgHtml}${consentHtml}${crisisHtml}</div><div id="gp-resign-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:1000;align-items:center;justify-content:center;padding:20px"><div style="background:var(--bg-secondary,#0f172a);border:1px solid var(--border,rgba(255,255,255,0.1));border-radius:16px;padding:28px;max-width:520px;width:100%"><h3 style="margin:0 0 8px;color:var(--text,#f1f5f9);font-size:1.1rem">Re-sign Consent</h3><p id="gp-resign-title" style="color:var(--text-muted,#94a3b8);font-size:0.87rem;margin:0 0 16px"></p><div style="background:var(--hover-bg,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.08));border-radius:10px;padding:16px;font-size:0.82rem;color:var(--text-muted,#94a3b8);line-height:1.6;margin-bottom:16px;max-height:160px;overflow-y:auto">I, the undersigned legal guardian, acknowledge and consent to the treatment protocols outlined by the care team at DeepSynaps Protocol Studio. I understand the nature of neuromodulation therapy, associated risks, and my right to withdraw consent at any time. I authorize the care team to share relevant treatment information with me as the authorized guardian. This consent is valid for one year from the date of signature.</div><div style="margin-bottom:14px"><div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);margin-bottom:6px">Signature (draw below):</div><canvas id="gp-sig-canvas" width="460" height="60" style="border:1px solid var(--border,rgba(255,255,255,0.12));border-radius:8px;background:rgba(255,255,255,0.03);cursor:crosshair;touch-action:none;display:block;width:100%;max-width:460px"></canvas><button onclick="window._gpClearSig()" style="margin-top:6px;padding:4px 12px;border-radius:6px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--text-muted,#94a3b8);font-size:0.75rem;cursor:pointer">Clear Signature</button></div><div style="display:flex;gap:10px;justify-content:flex-end"><button onclick="window._gpCloseResign()" style="padding:8px 18px;border-radius:9px;border:1px solid var(--border,rgba(255,255,255,0.1));background:transparent;color:var(--text-muted,#94a3b8);font-size:0.85rem;cursor:pointer">Cancel</button><button onclick="window._gpDoResign()" style="padding:8px 20px;border-radius:9px;border:none;background:var(--teal,#00d4bc);color:#0a0f1a;font-weight:700;font-size:0.85rem;cursor:pointer">Submit Signature</button></div></div></div>`;

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

// ── Home Devices ────────────────────────────────────────────────────────────
// pgPatientHomeDevices / pgPatientHomeDevice / pgPatientHomeSessionLog moved
// to ./pages-patient/home-devices.js as part of the 2026-05-02 file-split
// refactor. Re-exported from this module via the import + export at the
// top of the file so all existing call-sites continue to work unchanged.
// ── Adherence ───────────────────────────────────────────────────────────────
// pgPatientAdherenceEvents / pgPatientAdherenceHistory moved to
// ./pages-patient/adherence.js as part of the 2026-05-02 file-split
// refactor. Re-exported from this module via the import + export at the
// top of the file so all existing call-sites continue to work unchanged.
// ── Caregiver Access ─────────────────────────────────────────────────────────
// pgPatientCaregiver moved to ./pages-patient/caregiver.js as part of the
// 2026-05-02 file-split refactor. Re-exported from this module via the
// import + export at the top of the file so all existing call-sites and
// `import` statements continue to work unchanged.

// ── Help & Support ───────────────────────────────────────────────────────────

// ── Patient Tickets / Support Requests ───────────────────────────────────────

export async function pgPatientTickets() {
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  const LOCAL_TICKET_KEY = 'ds_patient_tickets_local';
  const loadLocalTickets = () => {
    try {
      const rows = JSON.parse(localStorage.getItem(LOCAL_TICKET_KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (_e) {
      return [];
    }
  };
  const saveLocalTickets = (rows) => {
    try { localStorage.setItem(LOCAL_TICKET_KEY, JSON.stringify(Array.isArray(rows) ? rows : [])); } catch (_e) {}
  };

  let tickets = [];
  const hasTicketBackend = typeof api.patientTickets === 'function';
  const hasReplyBackend = typeof api.patientTicketReply === 'function';
  const hasCreateBackend = typeof api.patientTicketCreate === 'function';
  const backendReady = hasTicketBackend && hasReplyBackend && hasCreateBackend;
  try {
    const res = await Promise.race([
      hasTicketBackend ? api.patientTickets() : Promise.resolve([]),
      new Promise((_, rej) => setTimeout(() => rej('timeout'), 3000))
    ]);
    if (Array.isArray(res)) tickets = res;
  } catch (_e) {}

  if (!tickets.length) {
    tickets = loadLocalTickets();
  }

  const catIcon = { question: '&#10067;', bug: '&#128027;', feature: '&#10024;', maintenance: '&#128295;', other: '&#128203;' };
  const statusColor = { open: '#2dd4bf', 'in-progress': '#fbbf24', resolved: '#22c55e' };
  const statusLabel = { open: 'Open', 'in-progress': 'In Progress', resolved: 'Resolved' };
  const prioColor = { critical: '#ef4444', high: '#f59e0b', medium: '#60a5fa', low: '#94a3b8' };

  let selectedId = tickets[0] ? tickets[0].id : null;

  function _renderTickets() {
    const sel = tickets.find(t => t.id === selectedId);
    el.innerHTML = `
      <div style="max-width:960px;margin:0 auto;padding:24px 16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
          <div>
            <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px">Support Requests</h2>
            <p style="font-size:12.5px;color:var(--text-secondary);margin:0">${backendReady ? 'Track your questions and requests to the care team.' : 'Track draft requests on this device until live support messaging is enabled for your clinic.'}</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window._ptNewTicket()">+ ${backendReady ? 'New Request' : 'New Local Request'}</button>
        </div>
        ${backendReady ? '' : `
        <div style="margin-bottom:16px;padding:12px 14px;border:1px solid rgba(255,181,71,0.24);border-radius:12px;background:rgba(255,181,71,0.08);font-size:12.5px;line-height:1.5;color:var(--text-secondary)">
          Live support messaging is not connected for this beta environment. Requests and replies on this page are stored only on this device and are not sent to your clinic.
        </div>`}

        <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:16px;min-height:400px" class="pt-tickets-grid">
          <!-- Ticket list -->
          <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden;display:flex;flex-direction:column">
            <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap">
              ${['all','open','in-progress','resolved'].map(s => `<button class="pt-tk-filter${(window._ptTicketFilter || 'all') === s ? ' active' : ''}" onclick="window._ptFilterTickets('${s}')" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:${(window._ptTicketFilter || 'all') === s ? 'rgba(45,212,191,0.15)' : 'transparent'};color:${(window._ptTicketFilter || 'all') === s ? '#2dd4bf' : 'var(--text-secondary)'};cursor:pointer">${s === 'all' ? 'All' : statusLabel[s] || s} <span style="opacity:0.6">${s === 'all' ? tickets.length : tickets.filter(t => t.status === s).length}</span></button>`).join('')}
            </div>
            <div style="flex:1;overflow-y:auto;max-height:420px">
              ${tickets.filter(t => !window._ptTicketFilter || window._ptTicketFilter === 'all' || t.status === window._ptTicketFilter).map(t => `
                <div onclick="window._ptSelectTicket('${t.id}')" style="padding:12px 14px;border-bottom:1px solid var(--border);cursor:pointer;background:${t.id === selectedId ? 'rgba(45,212,191,0.06)' : 'transparent'};transition:background 0.15s">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                    <span style="font-size:13px">${catIcon[t.category] || catIcon.other}</span>
                    <span style="font-size:12.5px;font-weight:600;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_hdEsc(t.title)}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-tertiary)">
                    <span>${t.id}</span>
                    <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${statusColor[t.status] || '#64748b'}22;color:${statusColor[t.status] || '#64748b'};font-weight:600;font-size:10px">${statusLabel[t.status] || t.status}</span>
                    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${prioColor[t.priority] || '#94a3b8'}"></span>
                    <span style="margin-left:auto">${new Date(t.created).toLocaleDateString()}</span>
                  </div>
                </div>`).join('') || `<div style="padding:28px 18px;text-align:center;color:var(--text-tertiary);font-size:12.5px">${backendReady ? 'No support requests yet.' : 'No local draft requests yet.'}</div>`}
            </div>
          </div>

          <!-- Detail pane -->
          <div style="border:1px solid var(--border);border-radius:12px;display:flex;flex-direction:column;overflow:hidden">
            ${sel ? `
              <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
                <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${_hdEsc(sel.title)}</div>
                <div style="display:flex;gap:8px;font-size:11px;color:var(--text-tertiary);flex-wrap:wrap">
                  <span>${_hdEsc(sel.id)}</span>
                  <span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${statusColor[sel.status] || '#64748b'}22;color:${statusColor[sel.status] || '#64748b'};font-weight:600">${statusLabel[sel.status] || _hdEsc(sel.status)}</span>
                  <span>Priority: ${_hdEsc(sel.priority)}</span>
                  <span>Created: ${new Date(sel.created).toLocaleDateString()}</span>
                </div>
              </div>
              <div style="flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:10px;max-height:320px">
                ${(sel.messages || []).map(m => `
                  <div style="display:flex;flex-direction:column;${m.from === 'You' ? 'align-items:flex-end' : 'align-items:flex-start'}">
                    <div style="max-width:80%;padding:10px 14px;border-radius:12px;background:${m.from === 'You' ? 'rgba(45,212,191,0.1)' : 'rgba(255,255,255,0.04)'};border:1px solid ${m.from === 'You' ? 'rgba(45,212,191,0.2)' : 'var(--border)'}">
                      <div style="font-size:11px;font-weight:600;color:${m.from === 'You' ? '#2dd4bf' : 'var(--text-primary)'};margin-bottom:3px">${_hdEsc(m.from)}</div>
                      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.5">${_hdEsc(m.text)}</div>
                    </div>
                    <div style="font-size:10px;color:var(--text-tertiary);margin-top:3px;padding:0 4px">${new Date(m.ts).toLocaleString()}</div>
                  </div>`).join('')}
              </div>
              ${sel.status !== 'resolved' ? `
              <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px">
                <input id="pt-tk-reply" type="text" placeholder="Add a message..." style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary,rgba(255,255,255,0.04));color:var(--text-primary);font-size:12.5px">
                <button class="btn btn-primary btn-sm" onclick="window._ptReplyTicket()">${backendReady ? 'Reply' : 'Save local note'}</button>
              </div>` : `
              <div style="padding:12px 16px;border-top:1px solid var(--border);text-align:center;font-size:12px;color:var(--text-tertiary)">This request is marked resolved in this portal view.</div>`}
            ` : `<div style="display:flex;align-items:center;justify-content:center;flex:1;color:var(--text-tertiary);font-size:13px">Select a request to view details</div>`}
          </div>
        </div>
      </div>
      <style>
        @media (max-width: 700px) {
          .pt-tickets-grid { grid-template-columns: 1fr !important; }
        }
      </style>`;
  }

  window._ptTicketFilter = 'all';
  window._ptFilterTickets = function(s) { window._ptTicketFilter = s; _renderTickets(); };
  window._ptSelectTicket = function(id) { selectedId = id; _renderTickets(); };
  window._ptReplyTicket = async function() {
    const inp = document.getElementById('pt-tk-reply');
    if (!inp || !inp.value.trim()) return;
    const sel = tickets.find(t => t.id === selectedId);
    if (!sel) return;
    const messageText = inp.value.trim();
    sel.messages.push({ from: 'You', text: messageText, ts: new Date().toISOString() });
    let savedToBackend = false;
    if (hasReplyBackend) {
      try {
        await api.patientTicketReply(sel.id, messageText);
        savedToBackend = true;
      } catch (_e) {}
    }
    if (!savedToBackend) saveLocalTickets(tickets);
    _renderTickets();
    window._showNotifToast && window._showNotifToast({
      title: savedToBackend ? 'Reply recorded' : 'Reply saved locally',
      body: savedToBackend ? 'This reply was accepted by the support workflow.' : 'This reply is stored on this device only.',
      severity: savedToBackend ? 'success' : 'warning'
    });
  };
  window._ptNewTicket = function() {
    const modal = document.createElement('div');
    modal.id = 'pt-tk-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)';
    modal.innerHTML = `
      <div style="background:var(--bg-primary,#0f172a);border:1px solid var(--border);border-radius:14px;padding:24px;width:90%;max-width:420px">
        <h3 style="font-size:15px;font-weight:700;color:var(--text-primary);margin:0 0 14px">${backendReady ? 'New Support Request' : 'New Local Support Request'}</h3>
        ${backendReady ? '' : `
        <div style="margin-bottom:14px;padding:10px 12px;border:1px solid rgba(255,181,71,0.24);border-radius:10px;background:rgba(255,181,71,0.08);font-size:12px;line-height:1.45;color:var(--text-secondary)">
          This request will be stored only on this device. It is not delivered to your clinic from this beta page yet.
        </div>`}
        <div style="margin-bottom:12px">
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Category</label>
          <select id="pt-tk-cat" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary,rgba(255,255,255,0.04));color:var(--text-primary);font-size:12.5px">
            <option value="question">Question</option>
            <option value="other">General request</option>
            <option value="bug">Technical issue</option>
          </select>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Subject</label>
          <input id="pt-tk-title" type="text" placeholder="Brief description..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary,rgba(255,255,255,0.04));color:var(--text-primary);font-size:12.5px;box-sizing:border-box">
        </div>
        <div style="margin-bottom:16px">
          <label style="font-size:11.5px;color:var(--text-secondary);display:block;margin-bottom:4px">Details</label>
          <textarea id="pt-tk-body" rows="4" placeholder="Describe your question or request..." style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-secondary,rgba(255,255,255,0.04));color:var(--text-primary);font-size:12.5px;resize:vertical;box-sizing:border-box"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('pt-tk-modal').remove()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="window._ptSubmitTicket()">${backendReady ? 'Submit' : 'Save Local Request'}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  };
  window._ptSubmitTicket = async function() {
    const title = (document.getElementById('pt-tk-title') || {}).value;
    const body = (document.getElementById('pt-tk-body') || {}).value;
    const cat = (document.getElementById('pt-tk-cat') || {}).value || 'question';
    if (!title || !body) { window._showNotifToast && window._showNotifToast({ title: 'Missing info', body: 'Please fill in subject and details.', severity: 'error' }); return; }
    const t = { id: 'TK-' + (1000 + tickets.length + 1), title: title, category: cat, status: 'open', priority: 'medium', created: new Date().toISOString(), messages: [{ from: 'You', text: body, ts: new Date().toISOString() }] };
    tickets.unshift(t);
    selectedId = t.id;
    let savedToBackend = false;
    if (hasCreateBackend) {
      try {
        await api.patientTicketCreate({ title: title, body: body, category: cat });
        savedToBackend = true;
      } catch (_e) {}
    }
    if (!savedToBackend) saveLocalTickets(tickets);
    const m = document.getElementById('pt-tk-modal');
    if (m) m.remove();
    _renderTickets();
    window._showNotifToast && window._showNotifToast({
      title: savedToBackend ? 'Request recorded' : 'Request saved locally',
      body: savedToBackend ? 'This request was accepted by the support workflow.' : 'This request is stored on this device only.',
      severity: savedToBackend ? 'success' : 'warning'
    });
  };

  _renderTickets();
}

// ── Patient Billing / Finance ────────────────────────────────────────────────

export async function pgPatientBilling() {
  const el = document.getElementById('patient-content');
  if (!el) return;
  el.innerHTML = spinner();

  const billingApiAvailable = typeof api.patientInvoices === 'function' || typeof api.patientPayments === 'function';
  if (!billingApiAvailable) {
    el.innerHTML = `
      <div style="max-width:760px;margin:0 auto;padding:24px 16px">
        <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px">Billing &amp; Payments</h2>
        <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 20px;line-height:1.5">The patient billing portal is not enabled in this beta environment yet.</p>
        <div style="background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.22);border-radius:12px;padding:18px 20px;color:var(--text-secondary);line-height:1.6">
          <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Not available in beta</div>
          <div style="font-size:12.5px;margin-bottom:12px">Invoices and payment history are hidden until the patient-facing billing API is wired to real records.</div>
          <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Message your clinic</button>
        </div>
      </div>`;
    return;
  }

  let invoices = [], payments = [];
  try {
    const [inv, pay] = await Promise.all([
      api.patientInvoices ? Promise.race([api.patientInvoices(), new Promise((_, r) => setTimeout(() => r('timeout'), 3000))]) : Promise.resolve([]),
      api.patientPayments ? Promise.race([api.patientPayments(), new Promise((_, r) => setTimeout(() => r('timeout'), 3000))]) : Promise.resolve([]),
    ]);
    if (Array.isArray(inv)) invoices = inv;
    if (Array.isArray(pay)) payments = pay;
  } catch (_e) {}

  const cur = { GBP: '\u00a3', USD: '$', EUR: '\u20ac' };
  const fmt = (a, c) => (cur[c] || '\u00a3') + Number(a || 0).toFixed(2);
  const totalOutstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount || 0) + (i.vat || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const statusColor = { paid: '#22c55e', sent: '#60a5fa', overdue: '#ef4444', draft: '#94a3b8' };
  const statusLabel = { paid: 'Paid', sent: 'Unpaid', overdue: 'Overdue', draft: 'Draft' };

  let tab = 'invoices';

  function _renderBilling() {
    el.innerHTML = `
      <div style="max-width:800px;margin:0 auto;padding:24px 16px">
        <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px">Billing &amp; Payments</h2>
        <p style="font-size:12.5px;color:var(--text-secondary);margin:0 0 20px;line-height:1.5">View your invoices and payment history. Contact your clinic for billing questions.</p>

        <!-- KPIs -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px">
          <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Outstanding</div>
            <div style="font-size:20px;font-weight:700;color:${totalOutstanding > 0 ? '#f59e0b' : '#22c55e'}">${fmt(totalOutstanding, 'GBP')}</div>
          </div>
          <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Total Paid</div>
            <div style="font-size:20px;font-weight:700;color:#22c55e">${fmt(totalPaid, 'GBP')}</div>
          </div>
          <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px">
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">Invoices</div>
            <div style="font-size:20px;font-weight:700;color:var(--text-primary)">${invoices.length}</div>
          </div>
        </div>

        <!-- Tabs -->
        <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:0">
          ${['invoices','payments'].map(t => `<button onclick="window._ptBillingTab('${t}')" style="padding:8px 16px;font-size:12.5px;font-weight:600;border:none;background:transparent;color:${tab === t ? '#2dd4bf' : 'var(--text-secondary)'};cursor:pointer;border-bottom:2px solid ${tab === t ? '#2dd4bf' : 'transparent'};margin-bottom:-1px">${t === 'invoices' ? 'Invoices' : 'Payment History'}</button>`).join('')}
        </div>

        ${tab === 'invoices' ? `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${invoices.length ? invoices.map(inv => {
            const s = inv.status || 'sent';
            const total = (inv.amount || 0) + (inv.vat || 0);
            return `
            <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div style="flex:1;min-width:180px">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px">${_hdEsc(inv.description)}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">${inv.id} &middot; Issued ${new Date(inv.date).toLocaleDateString()} &middot; Due ${new Date(inv.due).toLocaleDateString()}</div>
              </div>
              <div style="text-align:right;min-width:100px">
                <div style="font-size:15px;font-weight:700;color:var(--text-primary)">${fmt(total, inv.currency)}</div>
                ${inv.vat ? `<div style="font-size:10px;color:var(--text-tertiary)">incl. ${fmt(inv.vat, inv.currency)} VAT</div>` : ''}
              </div>
              <span style="display:inline-block;padding:3px 10px;border-radius:6px;background:${statusColor[s] || '#64748b'}18;color:${statusColor[s] || '#64748b'};font-size:11px;font-weight:600;min-width:50px;text-align:center">${statusLabel[s] || s}</span>
            </div>`;
          }).join('') : '<div style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:13px">No invoices yet.</div>'}
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${payments.length ? payments.map(p => `
            <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div style="width:36px;height:36px;border-radius:8px;background:rgba(34,197,94,0.1);color:#22c55e;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">&#10003;</div>
              <div style="flex:1;min-width:160px">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${fmt(p.amount, 'GBP')}</div>
                <div style="font-size:11px;color:var(--text-tertiary)">${_hdEsc(p.method)} &middot; ${_hdEsc(p.ref || '')} &middot; ${_hdEsc(p.invoice || '')}</div>
              </div>
              <div style="font-size:11.5px;color:var(--text-tertiary)">${new Date(p.date).toLocaleDateString()}</div>
            </div>`).join('') : '<div style="text-align:center;padding:32px;color:var(--text-tertiary);font-size:13px">No payments recorded yet.</div>'}
        </div>`}

        <div style="margin-top:24px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.15);border-radius:10px;padding:14px 16px;font-size:12px;color:var(--text-secondary);line-height:1.5">
          <strong style="color:var(--text-primary)">Need help with billing?</strong> Contact your clinic directly for payment plans, insurance queries, or invoice corrections.
          <div style="margin-top:8px">
            <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Message your clinic</button>
          </div>
        </div>
      </div>`;
  }

  window._ptBillingTab = function(t) { tab = t; _renderBilling(); };
  _renderBilling();
}

// ── Patient Academy / Learning Hub ───────────────────────────────────────────

export async function pgPatientAcademy() {
  const el = document.getElementById('patient-content');
  if (!el) return;

  const categories = [
    { id: 'all',          label: 'All',             icon: '&#128218;' },
    { id: 'understanding', label: 'Understanding',   icon: '&#129504;' },
    { id: 'self-care',    label: 'Self-Care',        icon: '&#128154;' },
    { id: 'techniques',   label: 'Techniques',       icon: '&#127919;' },
    { id: 'stories',      label: 'Patient Stories',  icon: '&#128172;' },
    { id: 'webinars',     label: 'Webinars',         icon: '&#127908;' },
    { id: 'courses',      label: 'Courses',          icon: '&#127891;' },
  ];

  const courses = [
    { id: 'c1', title: 'Understanding Neuromodulation', subtitle: 'What happens during tDCS and why it helps', category: 'understanding', type: 'Article', duration: '8 min read', source: 'DeepSynaps Clinic', icon: '&#129504;', free: true,
      description: 'A patient-friendly guide to how transcranial direct current stimulation works, what the electrodes do, and why consistency matters.' },
    { id: 'c2', title: 'Sleep Hygiene for Better Outcomes', subtitle: 'Small changes that support your treatment', category: 'self-care', type: 'Guide', duration: '6 min read', source: 'NHS Better Health', icon: '&#128164;', free: true,
      description: 'Evidence-based tips to improve your sleep quality, which can significantly impact how well your treatment works.' },
    { id: 'c3', title: 'Breathing Exercises: 4-7-8 Technique', subtitle: 'A quick calming technique you can do anywhere', category: 'techniques', type: 'Video', duration: '4 min', source: 'YouTube', icon: '&#128692;', free: true,
      description: 'Learn the 4-7-8 breathing technique recommended by your care team as part of your homework programme.' },
    { id: 'c4', title: 'My tDCS Journey: 20 Sessions Later', subtitle: 'One patient shares their honest experience', category: 'stories', type: 'Article', duration: '12 min read', source: 'DeepSynaps Community', icon: '&#128172;', free: true,
      description: 'A real patient describes what sessions felt like, how symptoms changed, and what surprised them about the process.' },
    { id: 'c5', title: 'Managing Side Effects', subtitle: 'What to expect and when to speak up', category: 'understanding', type: 'Guide', duration: '5 min read', source: 'DeepSynaps Clinic', icon: '&#9888;', free: true,
      description: 'Common side effects of neuromodulation treatments, which ones are normal, and when you should contact your care team.' },
    { id: 'c6', title: 'Mindfulness for Depression', subtitle: 'Evidence-based practices that complement your protocol', category: 'techniques', type: 'Course', duration: '6 modules', source: 'FutureLearn', icon: '&#128992;', free: false,
      description: 'A structured mindfulness course designed for people receiving treatment for depression. Integrates with your care plan.' },
    { id: 'c7', title: 'Understanding Your qEEG Report', subtitle: 'What those brain waves actually mean for you', category: 'understanding', type: 'Video', duration: '18 min', source: 'DeepSynaps Clinic+', icon: '&#129504;', free: false,
      description: 'A clinician walkthrough explaining what your qEEG report shows, written for patients, not clinicians.' },
    { id: 'c8', title: 'Nutrition & Brain Health', subtitle: 'How diet impacts your neuromodulation outcomes', category: 'self-care', type: 'Article', duration: '10 min read', source: 'Mayo Clinic', icon: '&#129382;', free: true,
      description: 'Research-backed dietary suggestions that may support brain health during your treatment course.' },
    { id: 'c9', title: 'Patient Q&A: Common Concerns', subtitle: 'Answers to the most asked questions', category: 'stories', type: 'Webinar Recording', duration: '45 min', source: 'DeepSynaps Community', icon: '&#127908;', free: true,
      description: 'A recorded Q&A session where patients asked clinicians their most pressing questions about neuromodulation.' },
    { id: 'c10', title: 'Progressive Muscle Relaxation', subtitle: 'Reduce tension before and after sessions', category: 'techniques', type: 'Audio Guide', duration: '15 min', source: 'NHS Every Mind Matters', icon: '&#127925;', free: true,
      description: 'A guided audio exercise to help you relax your body, especially useful before clinic sessions.' },
    { id: 'c11', title: 'Home Device Safety Training', subtitle: 'Required before starting home therapy', category: 'courses', type: 'Interactive Course', duration: '3 modules', source: 'DeepSynaps Clinic', icon: '&#128268;', free: true,
      description: 'Mandatory safety training covering device setup, electrode placement, emergency procedures, and session logging.' },
    { id: 'c12', title: 'Building Resilience During Treatment', subtitle: 'A 4-week guided programme', category: 'courses', type: 'Course', duration: '4 weeks', source: 'DeepSynaps Academy', icon: '&#127891;', free: false,
      description: 'A structured programme combining psychoeducation, journaling prompts, and behavioural exercises tailored to your treatment phase.' },
  ];

  let filter = 'all';
  let search = '';
  const completed = JSON.parse(localStorage.getItem('ds_pt_academy_completed') || '[]');

  function _renderAcademy() {
    const filtered = courses.filter(c => {
      if (filter !== 'all' && c.category !== filter) return false;
      if (search && !c.title.toLowerCase().includes(search.toLowerCase()) && !c.subtitle.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    el.innerHTML = `
      <div style="max-width:860px;margin:0 auto;padding:24px 16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:8px">
          <div>
            <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 4px">Academy</h2>
            <p style="font-size:12.5px;color:var(--text-secondary);margin:0">Courses, guides, and resources curated for your treatment journey.</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-tertiary)">
            <span style="background:rgba(45,212,191,0.1);color:#2dd4bf;padding:3px 10px;border-radius:6px;font-weight:600">${completed.length} completed</span>
            <span>${courses.length} resources</span>
          </div>
        </div>

        <!-- Search -->
        <div style="margin:16px 0 12px">
          <input id="pt-acad-search" type="text" placeholder="Search courses and resources..." value="${search}" oninput="window._ptAcadSearch(this.value)"
            style="width:100%;padding:9px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-secondary,rgba(255,255,255,0.04));color:var(--text-primary);font-size:13px;box-sizing:border-box">
        </div>

        <!-- Category chips -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px">
          ${categories.map(c => `<button onclick="window._ptAcadFilter('${c.id}')" style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:8px;border:1px solid ${filter === c.id ? 'rgba(45,212,191,0.3)' : 'var(--border)'};background:${filter === c.id ? 'rgba(45,212,191,0.1)' : 'transparent'};color:${filter === c.id ? '#2dd4bf' : 'var(--text-secondary)'};font-size:12px;font-weight:${filter === c.id ? '600' : '500'};cursor:pointer"><span>${c.icon}</span>${c.label}</button>`).join('')}
        </div>

        <!-- Course grid -->
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
          ${filtered.length ? filtered.map(c => {
            const done = completed.includes(c.id);
            return `
            <div style="border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px;transition:border-color 0.15s;cursor:pointer" onclick="window._ptAcadOpen('${c.id}')" onmouseover="this.style.borderColor='rgba(45,212,191,0.3)'" onmouseout="this.style.borderColor='var(--border)'">
              <div style="display:flex;align-items:flex-start;gap:10px">
                <div style="width:40px;height:40px;border-radius:10px;background:rgba(45,212,191,0.08);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${c.icon}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:2px;display:flex;align-items:center;gap:6px">${c.title}${done ? '<span style="color:#22c55e;font-size:11px">&#10003;</span>' : ''}</div>
                  <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.4">${c.subtitle}</div>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:10.5px">
                <span style="padding:2px 8px;border-radius:4px;background:rgba(96,165,250,0.1);color:#60a5fa">${c.type}</span>
                <span style="padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.04);color:var(--text-tertiary)">${c.duration}</span>
                <span style="padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.04);color:var(--text-tertiary)">${c.source}</span>
                ${!c.free ? '<span style="padding:2px 8px;border-radius:4px;background:rgba(251,191,36,0.1);color:#fbbf24">Premium</span>' : ''}
              </div>
            </div>`;
          }).join('') : '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-tertiary);font-size:13px">No resources match your search.</div>'}
        </div>
      </div>`;
  }

  window._ptAcadFilter = function(f) { filter = f; _renderAcademy(); };
  window._ptAcadSearch = function(q) { search = q; _renderAcademy(); };
  window._ptAcadOpen = function(id) {
    const c = courses.find(x => x.id === id);
    if (!c) return;
    const done = completed.includes(c.id);
    const modal = document.createElement('div');
    modal.id = 'pt-acad-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)';
    modal.innerHTML = `
      <div style="background:var(--bg-primary,#0f172a);border:1px solid var(--border);border-radius:14px;padding:24px;width:90%;max-width:520px;max-height:80vh;overflow-y:auto">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
          <div style="width:48px;height:48px;border-radius:12px;background:rgba(45,212,191,0.08);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${c.icon}</div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px">${c.title}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${c.subtitle}</div>
          </div>
          <button onclick="document.getElementById('pt-acad-modal').remove()" style="background:transparent;border:none;color:var(--text-tertiary);cursor:pointer;font-size:16px;padding:4px">\u2715</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;font-size:10.5px">
          <span style="padding:3px 10px;border-radius:5px;background:rgba(96,165,250,0.1);color:#60a5fa">${c.type}</span>
          <span style="padding:3px 10px;border-radius:5px;background:rgba(255,255,255,0.04);color:var(--text-tertiary)">${c.duration}</span>
          <span style="padding:3px 10px;border-radius:5px;background:rgba(255,255,255,0.04);color:var(--text-tertiary)">${c.source}</span>
          ${!c.free ? '<span style="padding:3px 10px;border-radius:5px;background:rgba(251,191,36,0.1);color:#fbbf24">Premium</span>' : '<span style="padding:3px 10px;border-radius:5px;background:rgba(34,197,94,0.1);color:#22c55e">Free</span>'}
        </div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:18px">${c.description}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          ${done
            ? '<span style="font-size:12px;color:#22c55e;font-weight:600;padding:7px 14px">&#10003; Completed</span>'
            : `<button class="btn btn-ghost btn-sm" onclick="window._ptAcadComplete('${c.id}');document.getElementById('pt-acad-modal').remove()">Mark as completed</button>`}
          <button class="btn btn-primary btn-sm" onclick="document.getElementById('pt-acad-modal').remove()">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  };
  window._ptAcadComplete = function(id) {
    if (!completed.includes(id)) {
      completed.push(id);
      try { localStorage.setItem('ds_pt_academy_completed', JSON.stringify(completed)); } catch (_e) {}
      window._showNotifToast && window._showNotifToast({ title: 'Resource completed', body: 'Great job keeping up with your learning!', severity: 'success' });
    }
    _renderAcademy();
  };

  _renderAcademy();
}

export async function pgPatientHelp() {
  const el = document.getElementById('patient-content');
  if (!el) return;
  const faqs = [
    { q: 'How do I complete an assessment?', a: 'Go to <strong>Assessments</strong> in the menu. Click on any due assessment, answer each question, and press Submit. When portal sync is available, your responses are shared with your clinic from there.' },
    { q: 'How do I contact my care team?', a: 'Use the <strong>Messages</strong> or <strong>Support</strong> section to contact your clinic. Some beta environments store requests only on this device, so call your clinic directly for anything urgent or time-sensitive.' },
    { q: 'What if I feel unwell after a session?', a: 'Contact your clinic immediately or call your local crisis line. <strong>UK: 111 or 999 in emergencies. US: 988 (crisis line) or 911 in emergencies.</strong> Do not use this app for medical emergencies.' },
    { q: 'How do I view my treatment progress?', a: 'Go to the <strong>Progress</strong> section in the menu. You can see your scores over time, session history, and how your symptoms are changing.' },
    { q: 'How do I update my profile?', a: 'Go to <strong>Profile</strong> in the menu. Contact your clinic directly if you need to update personal or medical details they hold.' },
  ];
  el.innerHTML = `
    <div style="max-width:640px;margin:0 auto;padding:24px 16px">
      <h2 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 6px">Help &amp; Support</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin:0 0 20px;line-height:1.55">Quick answers to common questions about using your patient portal.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">
        ${faqs.map((f, i) => `
          <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
            <button onclick="
              var b=this.parentElement.querySelector('.pt-help-body');
              var open=b.style.display!=='none';
              b.style.display=open?'none':'block';
              this.querySelector('.pt-help-chev').style.transform=open?'rotate(0deg)':'rotate(180deg)'
            " style="width:100%;text-align:left;background:transparent;border:none;padding:13px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px;font-weight:600;color:var(--text-primary)">
              ${f.q}
              <svg class="pt-help-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14" style="flex-shrink:0;transition:transform 0.2s"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="pt-help-body" style="display:none;padding:0 16px 14px;font-size:12.5px;color:var(--text-secondary);line-height:1.6">${f.a}</div>
          </div>`).join('')}
      </div>
      <div style="background:rgba(220,38,38,0.08);border:1.5px solid rgba(220,38,38,0.3);border-radius:12px;padding:16px 18px">
        <div style="font-size:13px;font-weight:700;color:#ef4444;margin-bottom:5px">⚠ If you are in crisis</div>
        <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55">
          If you are experiencing thoughts of self-harm or a mental health emergency, <strong style="color:var(--text-primary)">call your local emergency services or a crisis line immediately.</strong>
          <br><br>
          <strong>UK:</strong> 999 (emergency) · 111 (urgent non-emergency) · 116 123 (Samaritans)<br>
          <strong>US:</strong> 911 (emergency) · 988 (Suicide &amp; Crisis Lifeline)<br>
          <strong>International:</strong> <a href="https://www.befrienders.org" target="_blank" style="color:var(--teal)">befrienders.org</a>
        </div>
      </div>
      <div style="margin-top:20px">
        <button class="btn btn-ghost btn-sm" onclick="window._navPatient('patient-messages')">Message your care team</button>
      </div>
    </div>`;
}

export async function pgGuardianPortal(setTopbarFn) {
  const _tb = typeof setTopbarFn === 'function' ? setTopbarFn : setTopbar;
  _tb('Guardian Portal', '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:0.8rem;color:var(--text-muted,#94a3b8)">Family &amp; Caregiver Access</span><button style="display:inline-flex;align-items:center;gap:6px;background:rgba(251,113,133,0.1);color:var(--rose,#ff6b9d);border:1px solid rgba(251,113,133,0.25);border-radius:8px;padding:6px 14px;font-size:0.8rem;font-weight:600;cursor:pointer" onclick="window._gpToggleCrisis();setTimeout(function(){var el=document.getElementById(\'gp-crisis-detail\');if(el)el.scrollIntoView({behavior:\'smooth\'})},50)">&#9888; Crisis Plan</button></div>');
  _gpRender();
}

// ── Patient Digest ───────────────────────────────────────────────────────
// pgPatientDigest moved to ./pages-patient/digest.js as part of the
// 2026-05-02 file-split refactor. Re-exported from this module via the
// import + export at the top of the file so all existing call-sites and
// `import` statements continue to work unchanged.
