// ─────────────────────────────────────────────────────────────────────────────
// pages-patient-timeline.js — per-patient timeline aggregator (CONTRACT_V3 §6)
//
// Arrives at this page via a deep link:
//   ?page=patient-timeline&patient_id=...
// or via the command palette (Agent R) / a patient-profile button.
//
// Reads the aggregated events list from
//   GET /api/v1/patient-timeline/{patient_id}
// and paints 4 horizontal swim-lanes (qEEG / MRI / Assessments / Sessions)
// on a shared date axis with cross-lane arrows for event[].connects_to.
//
// Demo fallback: when the API is unreachable we synthesise 6 events (the
// same 6 that the backend demo path produces) so the preview Netlify deploy
// renders a full page even when Fly is offline.
//
// Export: pgPatientTimeline(setTopbar, navigate)
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { showToast } from './helpers.js';

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 4 canonical swim-lanes. The backend may emit 5 ("outcome"); we render
// outcome events inside the "session" lane as a secondary dot kind.
var LANES = [
  { id: 'qeeg',       label: 'qEEG',        color: '#60a5fa' },
  { id: 'mri',        label: 'MRI',         color: '#c026d3' },
  { id: 'assessment', label: 'Assessments', color: '#22c55e' },
  { id: 'session',    label: 'Sessions',    color: '#f59e0b' },
];

var REGULATORY_FOOTER =
  'Decision-support tool. Not a medical device. Multi-modal convergent '
  + 'findings are research/wellness indicators only.';

// Demo synthetic events — mirror the backend's _synth_demo_events shape.
// Used only as a fallback when the API is unreachable.
function _demoEvents(patientId) {
  var now = Date.now();
  function iso(daysAgo) {
    return new Date(now - daysAgo * 24 * 3600 * 1000).toISOString();
  }
  return [
    { type: 'qeeg_analysis', at: iso(85), summary: 'Baseline qEEG: elevated frontal theta; low alpha PAF',
      ref_id: 'demo-qeeg-1-' + patientId, lane: 'qeeg', connects_to: [] },
    { type: 'assessment',    at: iso(80), summary: 'PHQ-9 baseline: score 18 (moderately severe)',
      ref_id: 'demo-phq9-1-' + patientId, lane: 'assessment', connects_to: [] },
    { type: 'mri_analysis',  at: iso(70), summary: 'MRI structural + rs-fMRI: sgACC–DLPFC anticorrelation z=-2.6',
      ref_id: 'demo-mri-1-' + patientId, lane: 'mri', connects_to: [] },
    { type: 'session',       at: iso(60), summary: 'rTMS session #1 (left DLPFC, 10 Hz) — well tolerated',
      ref_id: 'demo-sess-1-' + patientId, lane: 'session', connects_to: ['demo-mri-1-' + patientId] },
    { type: 'session',       at: iso(30), summary: 'rTMS session #20 (mid-course) — protocol adherence 95%',
      ref_id: 'demo-sess-20-' + patientId, lane: 'session', connects_to: ['demo-mri-1-' + patientId] },
    { type: 'qeeg_analysis', at: iso(10), summary: 'Follow-up qEEG: frontal theta normalising; PAF +0.8 Hz',
      ref_id: 'demo-qeeg-2-' + patientId, lane: 'qeeg', connects_to: [] },
  ];
}

function _resolvePatientId() {
  if (typeof window !== 'undefined' && window._timelinePatientId) {
    return String(window._timelinePatientId);
  }
  try {
    var p = new URLSearchParams(window.location.search);
    var pid = p.get('patient_id');
    if (pid) return pid;
  } catch (_e) { /* no window.location in tests */ }
  return 'demo-patient';
}

// ── Layout computation (exported for testing) ──────────────────────────────

/**
 * Project an event's ``at`` string onto a [0,1] position along the axis,
 * given the min/max times seen. Null-safe.
 */
export function _eventXPct(ev, tMin, tMax) {
  if (!ev || !ev.at) return 0;
  var t = Date.parse(ev.at);
  if (!isFinite(t)) return 0;
  if (tMax <= tMin) return 0.5;
  var pct = (t - tMin) / (tMax - tMin);
  if (pct < 0) return 0;
  if (pct > 1) return 1;
  return pct;
}

/**
 * Build a lookup map from ref_id → {lane, xPct} so cross-lane arrows know
 * where to anchor their start/end points.
 */
export function _buildRefIndex(events, tMin, tMax) {
  var idx = {};
  (events || []).forEach(function (ev) {
    if (!ev || !ev.ref_id) return;
    idx[ev.ref_id] = { lane: ev.lane, xPct: _eventXPct(ev, tMin, tMax) };
  });
  return idx;
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderEmptyState() {
  return '<div class="ds-timeline-empty" role="status">'
    + '<div class="ds-timeline-empty__icon">&#x1F4C5;</div>'
    + '<div class="ds-timeline-empty__title">No events</div>'
    + '<div class="ds-timeline-empty__body">'
    + 'This patient has no qEEG, MRI, assessment, or session records yet.'
    + '</div></div>';
}

export function renderTimeline(events, patientId) {
  var ev = Array.isArray(events) ? events.slice() : [];
  if (!ev.length) {
    return '<div class="ds-timeline-shell">'
      + '<header class="ds-timeline-head">'
      + '<h1 class="ds-timeline-head__title">Patient Timeline</h1>'
      + '<div class="ds-timeline-head__sub">Patient: ' + esc(patientId) + '</div>'
      + '</header>'
      + renderEmptyState()
      + '<footer class="ds-timeline-footer">' + esc(REGULATORY_FOOTER) + '</footer>'
      + '</div>';
  }

  // Compute shared date axis.
  var timestamps = ev
    .map(function (e) { return Date.parse(e.at); })
    .filter(function (t) { return isFinite(t); });
  var tMin = Math.min.apply(null, timestamps);
  var tMax = Math.max.apply(null, timestamps);

  var refIndex = _buildRefIndex(ev, tMin, tMax);

  // Group events by lane. Outcomes fold into the "session" lane.
  var byLane = { qeeg: [], mri: [], assessment: [], session: [] };
  ev.forEach(function (e) {
    var lane = e.lane === 'outcome' ? 'session' : e.lane;
    if (byLane[lane]) byLane[lane].push(e);
  });

  var laneRows = LANES.map(function (lane, laneIdx) {
    var dots = (byLane[lane.id] || []).map(function (e, i) {
      var pct = _eventXPct(e, tMin, tMax);
      var dotKind = 'ds-timeline-dot-' + lane.id;
      return '<button type="button" class="ds-timeline-dot ' + dotKind + '" '
        + 'style="left:' + (pct * 100).toFixed(2) + '%" '
        + 'data-ref-id="' + esc(e.ref_id || '') + '" '
        + 'data-type="' + esc(e.type || '') + '" '
        + 'data-at="' + esc(e.at || '') + '" '
        + 'title="' + esc((e.at || '') + ' — ' + (e.summary || '')) + '" '
        + 'aria-label="' + esc((e.type || '') + ' ' + (e.at || '') + ' — ' + (e.summary || '')) + '">'
        + '<span class="ds-timeline-dot__label">' + esc(e.summary || '') + '</span>'
        + '</button>';
    }).join('');
    return '<div class="ds-timeline-lane" data-lane="' + lane.id + '" '
      + 'data-lane-idx="' + laneIdx + '">'
      + '<div class="ds-timeline-lane__label" style="--lane-color:' + lane.color + '">'
      + esc(lane.label) + '</div>'
      + '<div class="ds-timeline-lane__rail">'
      + '<div class="ds-timeline-lane__axis" style="background:' + lane.color + '22"></div>'
      + dots
      + '</div></div>';
  }).join('');

  // Cross-lane arrows — SVG line from connects_to[*] ref_id → current event.
  var arrows = [];
  ev.forEach(function (e) {
    if (!Array.isArray(e.connects_to) || !e.connects_to.length) return;
    var toLane = (e.lane === 'outcome' ? 'session' : e.lane);
    var toLaneIdx = LANES.findIndex(function (L) { return L.id === toLane; });
    if (toLaneIdx < 0) return;
    var toX = _eventXPct(e, tMin, tMax);
    e.connects_to.forEach(function (refId) {
      var target = refIndex[refId];
      if (!target) return;
      var fromLane = (target.lane === 'outcome' ? 'session' : target.lane);
      var fromLaneIdx = LANES.findIndex(function (L) { return L.id === fromLane; });
      if (fromLaneIdx < 0) return;
      arrows.push({
        x1: target.xPct, x2: toX,
        laneFrom: fromLaneIdx, laneTo: toLaneIdx,
        refFrom: refId, refTo: e.ref_id || '',
      });
    });
  });

  var laneHeight = 68;        // px; matches CSS --ds-timeline-lane-h
  var laneLabelOffset = 28;   // px; dots sit at lane vertical centre offset
  var svgH = laneHeight * LANES.length;
  var arrowsSvg = arrows.map(function (a) {
    // Express as % for x (the SVG spans the rail width, not the label).
    var x1 = (a.x1 * 100).toFixed(2) + '%';
    var x2 = (a.x2 * 100).toFixed(2) + '%';
    var y1 = (a.laneFrom * laneHeight + laneLabelOffset);
    var y2 = (a.laneTo   * laneHeight + laneLabelOffset);
    return '<line class="ds-timeline-arrow" '
      + 'x1="' + x1 + '" y1="' + y1 + '" '
      + 'x2="' + x2 + '" y2="' + y2 + '" '
      + 'data-from="' + esc(a.refFrom) + '" data-to="' + esc(a.refTo) + '" '
      + 'stroke="rgba(251,191,36,0.6)" stroke-width="1.4" '
      + 'stroke-dasharray="4 3" marker-end="url(#ds-timeline-arrowhead)"/>';
  }).join('');

  var arrowSvg = '<svg class="ds-timeline-arrows" aria-hidden="true" '
    + 'preserveAspectRatio="none" viewBox="0 0 100 ' + svgH + '" '
    + 'style="height:' + svgH + 'px">'
    + '<defs><marker id="ds-timeline-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" '
    + 'markerWidth="6" markerHeight="6" orient="auto-start-reverse">'
    + '<path d="M0,0 L10,5 L0,10 z" fill="rgba(251,191,36,0.7)"/></marker></defs>'
    + arrowsSvg + '</svg>';

  var minIso = isFinite(tMin) ? new Date(tMin).toISOString().slice(0, 10) : '—';
  var maxIso = isFinite(tMax) ? new Date(tMax).toISOString().slice(0, 10) : '—';

  return '<div class="ds-timeline-shell">'
    + '<header class="ds-timeline-head">'
    + '<h1 class="ds-timeline-head__title">Patient Timeline</h1>'
    + '<div class="ds-timeline-head__sub">'
    + 'Patient: <code>' + esc(patientId) + '</code> &middot; '
    + esc(ev.length) + ' events &middot; '
    + '<span class="ds-timeline-head__range">' + esc(minIso) + ' → ' + esc(maxIso) + '</span>'
    + '</div></header>'
    + '<div class="ds-timeline-axis-wrap">'
    + '<div class="ds-timeline-axis-label ds-timeline-axis-label--left">' + esc(minIso) + '</div>'
    + '<div class="ds-timeline-axis-label ds-timeline-axis-label--right">' + esc(maxIso) + '</div>'
    + '</div>'
    + '<div class="ds-timeline-lanes" data-arrow-count="' + arrows.length + '">'
    + arrowSvg
    + laneRows
    + '</div>'
    + '<footer class="ds-timeline-footer">' + esc(REGULATORY_FOOTER) + '</footer>'
    + '</div>';
}

// ── Page entrypoint ────────────────────────────────────────────────────────

export async function pgPatientTimeline(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('Patient Timeline', '');
  var el = (typeof document !== 'undefined') ? document.getElementById('content') : null;

  var patientId = _resolvePatientId();

  // Loading shim — keeps layout stable while we fetch.
  if (el) {
    el.innerHTML = '<div class="ds-timeline-shell ds-timeline-shell--loading">'
      + '<header class="ds-timeline-head">'
      + '<h1 class="ds-timeline-head__title">Patient Timeline</h1>'
      + '<div class="ds-timeline-head__sub">Loading events for ' + esc(patientId) + '…</div>'
      + '</header></div>';
  }

  var events = [];
  try {
    var res = await api.fetchPatientTimeline(patientId);
    events = (res && Array.isArray(res.events)) ? res.events : [];
  } catch (err) {
    try { if (typeof console !== 'undefined') console.warn('[timeline] fetch failed, using demo', err); } catch (_e) {}
    events = _demoEvents(patientId);
  }

  if (!el) return;
  el.innerHTML = renderTimeline(events, patientId);

  // Click → open the underlying analysis page.
  document.querySelectorAll('.ds-timeline-dot').forEach(function (dot) {
    dot.addEventListener('click', function () {
      var type = dot.getAttribute('data-type');
      var ref = dot.getAttribute('data-ref-id');
      if (!ref) return;
      if (typeof navigate !== 'function') return;
      if (type === 'qeeg_analysis') {
        try { window._qeegAnalysisId = ref; } catch (_e) {}
        navigate('qeeg-analysis');
      } else if (type === 'mri_analysis') {
        try { window._mriAnalysisId = ref; } catch (_e) {}
        navigate('mri-analysis');
      } else if (type === 'session') {
        try { window._sessionId = ref; } catch (_e) {}
        navigate('session-execution');
      } else if (type === 'assessment') {
        navigate('assessments-v2');
      } else {
        showToast('No detail view wired for ' + (type || 'event'), 'info');
      }
    });
  });
}

// ── Test-only exports ──────────────────────────────────────────────────────
export var _INTERNALS = {
  LANES: LANES,
  demoEvents: _demoEvents,
  resolvePatientId: _resolvePatientId,
  REGULATORY_FOOTER: REGULATORY_FOOTER,
};
