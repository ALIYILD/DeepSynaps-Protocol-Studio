// Patient pages — shared helpers.
//
// This module hosts the small helpers that need to be shared between the
// residual `pages-patient.js` and the page-files that have been extracted
// out of it (see `apps/web/src/pages-patient/*.js`).
//
// The split was performed mechanically (no behavioural change) to make the
// formerly 25k-line `pages-patient.js` smaller and reduce concurrent-session
// merge collisions. Helpers here are kept in lockstep with their original
// definitions inside `pages-patient.js` — `pages-patient.js` still defines
// the same helpers locally (for the page bodies that have not yet been
// extracted) so the two copies must NOT diverge. Once every page has been
// moved out, the in-file copies can be deleted.

import { t, getLocale } from '../i18n.js';

/**
 * Update the patient-shell topbar title and right-aligned actions.
 * `html` should be a trusted, escaped string (most callers build it from
 * static strings or data they have already escaped).
 */
export function setTopbar(title, html = '') {
  const _ttl = document.getElementById('patient-page-title');
  const _act = document.getElementById('patient-topbar-actions');
  if (_ttl) _ttl.textContent = title;
  if (_act) _act.innerHTML = html;
}

/** Lightweight loading spinner used while a patient page fetches data. */
export function spinner() {
  return '<div style="text-align:center;padding:48px;color:var(--teal);font-size:24px">◈</div>';
}

/**
 * HTML escaper used by the home-device + adherence + import pages.
 * Mirrored verbatim from the `_hdEsc` defined inside pages-patient.js.
 * Kept in lockstep with the in-file copy until every consumer page has
 * been extracted out.
 */
export function _hdEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

/** Locale-aware short date formatter. Returns `—` when no date is given. */
export function fmtDate(d) {
  if (!d) return '—';
  try {
    const loc = getLocale() === 'tr' ? 'tr-TR' : 'en-US';
    return new Date(d).toLocaleDateString(loc, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_e) { return String(d); }
}

/** Human-readable relative time ("3 minutes ago", "2 hours ago"). */
export function fmtRelative(d) {
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

/** Days remaining until a date — clamped to 0+. Returns null on invalid input. */
export function daysUntil(d) {
  if (!d) return null;
  try {
    const ms = new Date(d).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  } catch (_e) { return null; }
}

/**
 * 7-day pattern strip — small inline-SVG showing day-by-day status.
 * Visualizes adherence / wellness logging at a glance. Mirrored verbatim
 * from the original definition in pages-patient.js.
 */
export function _vizWeekStrip(days, opts) {
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
