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

function _toDate(raw) {
  if (!raw) return null;
  try {
    var d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch (_) {
    return null;
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

// ── Test-only exports ──────────────────────────────────────────────────────
export var _INTERNALS = {
  LANES: LANES,
  demoEvents: _demoEvents,
  resolvePatientId: _resolvePatientId,
  REGULATORY_FOOTER: REGULATORY_FOOTER,
};

function _laneRows(payload) {
  var lanes = payload && payload.lanes ? payload.lanes : {};
  return ['sessions', 'qeeg', 'mri', 'outcomes'].map(function (id) {
    return { id: id, label: id === 'qeeg' ? 'qEEG' : id.toUpperCase(), items: Array.isArray(lanes[id]) ? lanes[id] : [] };
  });
}

function _range(rows) {
  var values = [];
  rows.forEach(function (lane) {
    lane.items.forEach(function (item) {
      var dt = _toDate(item.at);
      if (dt) values.push(dt.getTime());
    });
  });
  if (!values.length) {
    var now = Date.now();
    return { min: now - 86400000, max: now + 86400000 };
  }
  return { min: Math.min.apply(Math, values), max: Math.max.apply(Math, values) };
}

function _leftPct(raw, range) {
  var dt = _toDate(raw);
  if (!dt) return 4;
  if (range.max <= range.min) return 50;
  return Math.max(4, Math.min(96, ((dt.getTime() - range.min) / (range.max - range.min)) * 92 + 4));
}

function _cardMeta(item) {
  var meta = item && item.meta ? item.meta : {};
  if (item.lane === 'outcomes') {
    return meta.score_numeric != null ? 'Score ' + meta.score_numeric : (meta.score || 'Outcome');
  }
  return meta.modality || meta.condition || meta.equipment || item.status || 'Event';
}

function _renderLane(lane, index, range) {
  var body = lane.items.length
    ? lane.items.map(function (item) {
        var left = _leftPct(item.at, range);
        return '<button class="ptl-item ptl-item--' + esc(lane.id) + '"'
          + ' data-lane="' + esc(lane.id) + '" data-item-id="' + esc(item.id) + '"'
          + ' style="left:' + left.toFixed(2) + '%">'
          + '<span class="ptl-item__title">' + esc(item.title || lane.label) + '</span>'
          + '<span class="ptl-item__meta">' + esc(_cardMeta({ lane: lane.id, meta: item.meta, status: item.status })) + '</span>'
          + '<span class="ptl-item__date">' + esc(String(item.at || '').slice(0, 10)) + '</span>'
          + '</button>';
      }).join('')
    : '<div class="ptl-empty-lane">No ' + esc(lane.label) + ' events</div>';
  return '<section class="ptl-lane" data-lane="' + esc(lane.id) + '" data-lane-index="' + index + '">'
    + '<div class="ptl-lane__label"><span>' + esc(lane.label) + '</span><small>' + lane.items.length + ' event(s)</small></div>'
    + '<div class="ptl-lane__track">' + body + '</div>'
    + '</section>';
}

function _renderLinks(rows, links, range) {
  if (!Array.isArray(links) || !links.length) return '';
  var laneIndex = { sessions: 0, qeeg: 1, mri: 2, outcomes: 3 };
  var index = {};
  rows.forEach(function (lane) {
    lane.items.forEach(function (item) {
      index[lane.id + ':' + item.id] = item;
    });
  });
  var svg = links.map(function (link) {
    var from = index[link.from_lane + ':' + link.from_id];
    var to = index[link.to_lane + ':' + link.to_id];
    if (!from || !to || laneIndex[link.from_lane] == null || laneIndex[link.to_lane] == null) return '';
    var x1 = _leftPct(from.at, range);
    var x2 = _leftPct(to.at, range);
    var y1 = 56 + laneIndex[link.from_lane] * 112;
    var y2 = 56 + laneIndex[link.to_lane] * 112;
    return '<path d="M ' + x1.toFixed(2) + ' ' + y1 + ' C ' + x1.toFixed(2) + ' ' + ((y1 + y2) / 2)
      + ', ' + x2.toFixed(2) + ' ' + ((y1 + y2) / 2) + ', ' + x2.toFixed(2) + ' ' + y2 + '"'
      + ' class="ptl-link ptl-link--' + esc(link.kind || 'temporal') + '" />';
  }).join('');
  return '<svg class="ptl-links" viewBox="0 0 100 392" preserveAspectRatio="none">'
    + '<defs><marker id="ptl-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">'
    + '<path d="M0,0 L6,3 L0,6 Z" fill="currentColor"></path></marker></defs>'
    + svg.replace(/" \/>/g, '" marker-end="url(#ptl-arrow)" />')
    + '</svg>';
}

function _renderTimeline(payload) {
  var rows = _laneRows(payload);
  var range = _range(rows);
  var counts = rows.map(function (lane) {
    return '<span class="ptl-kpi"><strong>' + lane.items.length + '</strong>' + esc(lane.label) + '</span>';
  }).join('');
  return '<div class="ptl-shell">'
    + '<div class="ptl-hero">'
    + '<div><div class="ptl-hero__eyebrow">Patient chronology</div>'
    + '<h2>Patient timeline · ' + esc(payload.patient_id || 'Unknown patient') + '</h2>'
    + '<p>Four-lane chronology across sessions, qEEG, MRI, and outcomes.</p></div>'
    + '<div class="ptl-kpis">' + counts + '</div>'
    + '</div>'
    + '<div class="ptl-board">'
    + _renderLinks(rows, payload.links || [], range)
    + rows.map(function (lane, index) { return _renderLane(lane, index, range); }).join('')
    + '</div>'
    + '</div>';
}

function _wireTimelineActions(navigate, payload) {
  document.querySelectorAll('.ptl-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var lane = btn.getAttribute('data-lane');
      var itemId = btn.getAttribute('data-item-id');
      if (lane === 'mri') {
        window._patientTimelinePatientId = payload.patient_id;
        navigate('mri-analysis');
        showToast('MRI timeline event selected: ' + itemId, 'info');
      }
    });
  });
}

export async function pgPatientTimeline(setTopbar, navigate) {
  if (typeof setTopbar === 'function') setTopbar('Patient Timeline', '');
  var el = document.getElementById('content');
  if (!el) return;
  var patientId = _timelinePatientId();
  if (!patientId) {
    el.innerHTML = emptyState('&#x1F4C5;', 'Patient timeline unavailable', 'Open this page from a patient or MRI context.');
    return;
  }
  el.innerHTML = '<div class="ptl-loading"><span class="spinner"></span>Loading patient timeline…</div>';
  var payload = null;
  try {
    payload = await api.getMRIPatientTimeline(patientId);
  } catch (_err) {
    payload = _demoTimeline(patientId);
  }
  el.innerHTML = _renderTimeline(payload);
  _wireTimelineActions(navigate, payload);
}
