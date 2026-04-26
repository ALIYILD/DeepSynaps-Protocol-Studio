import { api } from './api.js';
import { emptyState, showToast } from './helpers.js';

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _timelinePatientId() {
  try {
    return window._patientTimelinePatientId
      || window._profilePatientId
      || sessionStorage.getItem('ds_pat_selected_id')
      || '';
  } catch (_) {
    return window._patientTimelinePatientId || window._profilePatientId || '';
  }
}

function _toDate(raw) {
  if (!raw) return null;
  try {
    var d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch (_) {
    return null;
  }
}

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
    el.innerHTML = emptyState('&#x1F4C5;', 'Patient timeline unavailable', 'We could not load the patient timeline right now. Please try again shortly.');
    return;
  }
  if (!payload || typeof payload !== 'object') {
    el.innerHTML = emptyState('&#x1F4C5;', 'Patient timeline unavailable', 'Timeline data is not available for this patient yet.');
    return;
  }
  el.innerHTML = _renderTimeline(payload);
  _wireTimelineActions(navigate, payload);
}
