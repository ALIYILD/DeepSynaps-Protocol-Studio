// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw.js — Raw Data Viewer & Interactive Cleaning Tab
//
// New tab for the qEEG Analyzer that lets users:
//   1. View their raw EEG data in a clinical-grade multi-channel viewer
//   2. Mark bad channels (click label) and annotate bad segments (drag)
//   3. Review ICA components with topomaps + accept/reject toggles
//   4. Adjust filter parameters (bandpass, notch)
//   5. Compare raw vs cleaned (overlay view)
//   6. Save cleaning choices and re-process with their edits
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { emptyState, showToast } from './helpers.js';
import { EEGSignalRenderer } from './eeg-signal-renderer.js';

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── State ──────────────────────────────────────────────────────────────────

function _initState() {
  if (!window._qeegRawState) {
    window._qeegRawState = {
      view: 'raw',
      tStart: 0,
      windowSec: 10,
      sensitivity: 50,
      badChannels: [],
      badSegments: [],
      excludedICA: [],
      includedICA: [],
      filterParams: { bandpass_low: 1.0, bandpass_high: 45.0, notch_hz: 50 },
      channelInfo: null,
      icaData: null,
      hasUnsavedChanges: false,
      icaExpanded: false,
    };
  }
  return window._qeegRawState;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function spinner(msg) {
  return '<div style="display:flex;align-items:center;gap:8px;padding:24px;color:var(--text-secondary)">'
    + '<span class="spinner"></span>' + esc(msg || 'Loading...') + '</div>';
}

// ── Main render function ───────────────────────────────────────────────────

export async function renderRawDataTab(tabEl, analysisId, patientId) {
  var state = _initState();

  tabEl.innerHTML = spinner('Loading raw EEG data...');

  // Load channel info first
  try {
    var info = await api.getQEEGChannelInfo(analysisId);
    state.channelInfo = info;
  } catch (err) {
    tabEl.innerHTML = emptyState('&#x26A0;', 'Failed to Load EEG Data',
      'Could not load channel information. The MNE pipeline may not be available.<br><small>' + esc(err.message || err) + '</small>');
    return;
  }

  // Also try to load any saved cleaning config
  try {
    var savedConfig = await api.getQEEGCleaningConfig(analysisId);
    if (savedConfig && savedConfig.config) {
      var cfg = savedConfig.config;
      state.badChannels = cfg.bad_channels || [];
      state.badSegments = cfg.bad_segments || [];
      state.excludedICA = cfg.excluded_ica_components || [];
      state.includedICA = cfg.included_ica_components || [];
      state.filterParams = {
        bandpass_low: cfg.bandpass_low || 1.0,
        bandpass_high: cfg.bandpass_high || 45.0,
        notch_hz: cfg.notch_hz != null ? cfg.notch_hz : 50,
      };
    }
  } catch (_) { /* no saved config yet */ }

  // Build the UI
  tabEl.innerHTML = _buildLayout(state);

  // Initialize Canvas renderer
  var canvasEl = document.getElementById('qeeg-raw-canvas');
  if (!canvasEl) return;

  var renderer = new EEGSignalRenderer(canvasEl, {
    sensitivity: state.sensitivity,
  });

  renderer.setChannelStates(state.badChannels);
  renderer.setBadSegments(state.badSegments);

  // Wire up callbacks
  renderer.onChannelClick = function (chName) {
    var idx = state.badChannels.indexOf(chName);
    if (idx >= 0) state.badChannels.splice(idx, 1);
    else state.badChannels.push(chName);
    state.hasUnsavedChanges = true;
    _updateChannelList(state);
    _updateSaveButton(state);
  };

  renderer.onSegmentSelect = function (startSec, endSec) {
    state.badSegments.push({
      start_sec: Math.round(startSec * 100) / 100,
      end_sec: Math.round(endSec * 100) / 100,
      description: 'BAD_user',
    });
    state.hasUnsavedChanges = true;
    renderer.setBadSegments(state.badSegments);
    _updateSegmentsList(state);
    _updateSaveButton(state);
    showToast('Bad segment annotated: ' + startSec.toFixed(1) + 's - ' + endSec.toFixed(1) + 's', 'info');
  };

  renderer.onTimeNavigate = function (newTStart) {
    state.tStart = newTStart;
    _loadSignalWindow(analysisId, state, renderer);
  };

  // Wire toolbar
  _wireToolbar(analysisId, state, renderer);

  // Load initial signal data
  await _loadSignalWindow(analysisId, state, renderer);
}

// ── Layout ─────────────────────────────────────────────────────────────────

function _buildLayout(state) {
  var info = state.channelInfo || {};
  var nCh = info.n_channels || 0;
  var dur = info.duration_sec || 0;
  var sfreq = info.sfreq || 0;

  return '<div class="qeeg-raw-container">'
    // Toolbar
    + '<div class="qeeg-raw-toolbar">'
    + '<div class="qeeg-raw-toolbar__group">'
    +   '<label class="qeeg-raw-toolbar__label">Sensitivity</label>'
    +   '<button class="btn btn-xs btn-outline" id="qeeg-raw-sens-down" title="Decrease sensitivity">&#x2212;</button>'
    +   '<span id="qeeg-raw-sens-val" class="qeeg-raw-toolbar__val">' + state.sensitivity + ' &micro;V</span>'
    +   '<button class="btn btn-xs btn-outline" id="qeeg-raw-sens-up" title="Increase sensitivity">+</button>'
    + '</div>'
    + '<div class="qeeg-raw-toolbar__group">'
    +   '<label class="qeeg-raw-toolbar__label">Window</label>'
    +   '<select id="qeeg-raw-window-sel" class="form-control form-control-sm">'
    +     '<option value="5"' + (state.windowSec === 5 ? ' selected' : '') + '>5s</option>'
    +     '<option value="10"' + (state.windowSec === 10 ? ' selected' : '') + '>10s</option>'
    +     '<option value="20"' + (state.windowSec === 20 ? ' selected' : '') + '>20s</option>'
    +     '<option value="30"' + (state.windowSec === 30 ? ' selected' : '') + '>30s</option>'
    +   '</select>'
    + '</div>'
    + '<div class="qeeg-raw-toolbar__group">'
    +   '<button class="btn btn-xs btn-outline" id="qeeg-raw-prev" title="Previous window">&laquo;</button>'
    +   '<button class="btn btn-xs btn-outline" id="qeeg-raw-next" title="Next window">&raquo;</button>'
    + '</div>'
    + '<div class="qeeg-raw-toolbar__group">'
    +   '<label class="qeeg-raw-toolbar__label">View</label>'
    +   '<select id="qeeg-raw-view-sel" class="form-control form-control-sm">'
    +     '<option value="raw"' + (state.view === 'raw' ? ' selected' : '') + '>Raw</option>'
    +     '<option value="cleaned"' + (state.view === 'cleaned' ? ' selected' : '') + '>Cleaned</option>'
    +     '<option value="overlay"' + (state.view === 'overlay' ? ' selected' : '') + '>Overlay</option>'
    +   '</select>'
    + '</div>'
    + '<div class="qeeg-raw-toolbar__group" style="margin-left:auto">'
    +   '<span class="qeeg-raw-toolbar__info">' + nCh + ' ch &middot; ' + sfreq + ' Hz &middot; ' + dur.toFixed(1) + 's</span>'
    +   '<button class="btn btn-sm btn-outline" id="qeeg-raw-save" title="Save cleaning config">Save</button>'
    +   '<button class="btn btn-sm btn-primary" id="qeeg-raw-reprocess" title="Re-process with your edits">Reprocess</button>'
    + '</div>'
    + '</div>'
    // Main content area
    + '<div class="qeeg-raw-main">'
    // Canvas viewer
    + '<div class="qeeg-raw-viewer">'
    + '<canvas id="qeeg-raw-canvas"></canvas>'
    + '</div>'
    // Sidebar
    + '<div class="qeeg-raw-sidebar">'
    + _buildChannelSection(state)
    + _buildFilterSection(state)
    + _buildSegmentsSection(state)
    + _buildICASection(state)
    + '</div>'
    + '</div>'
    + '</div>';
}

function _buildChannelSection(state) {
  var info = state.channelInfo || {};
  var channels = (info.channels || []).map(function (ch) { return ch.name; });
  var items = channels.map(function (ch) {
    var isBad = state.badChannels.indexOf(ch) >= 0;
    return '<label class="qeeg-raw-channel-chip' + (isBad ? ' qeeg-raw-channel-chip--bad' : '') + '">'
      + '<input type="checkbox"' + (isBad ? '' : ' checked') + ' data-ch="' + esc(ch) + '"> '
      + esc(ch) + '</label>';
  }).join('');

  return '<div class="qeeg-raw-sidebar__section">'
    + '<div class="qeeg-raw-sidebar__title">Channels (' + channels.length + ')</div>'
    + '<div class="qeeg-raw-channel-list" id="qeeg-raw-channels">' + items + '</div>'
    + '</div>';
}

function _buildFilterSection(state) {
  var fp = state.filterParams;
  return '<div class="qeeg-raw-sidebar__section">'
    + '<div class="qeeg-raw-sidebar__title">Filter Controls</div>'
    + '<div class="qeeg-raw-filter-controls">'
    + '<div class="qeeg-raw-filter-row">'
    +   '<label>Bandpass</label>'
    +   '<input type="number" id="qeeg-raw-bp-low" class="form-control form-control-sm" value="' + fp.bandpass_low + '" step="0.5" min="0.1" max="10" style="width:60px">'
    +   '<span>&ndash;</span>'
    +   '<input type="number" id="qeeg-raw-bp-high" class="form-control form-control-sm" value="' + fp.bandpass_high + '" step="1" min="10" max="100" style="width:60px">'
    +   '<span>Hz</span>'
    + '</div>'
    + '<div class="qeeg-raw-filter-row">'
    +   '<label>Notch</label>'
    +   '<input type="number" id="qeeg-raw-notch" class="form-control form-control-sm" value="' + fp.notch_hz + '" step="10" min="0" max="60" style="width:60px">'
    +   '<span>Hz</span>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function _buildSegmentsSection(state) {
  var items = state.badSegments.map(function (seg, idx) {
    return '<div class="qeeg-raw-segment-item">'
      + '<span>' + seg.start_sec.toFixed(1) + 's &ndash; ' + seg.end_sec.toFixed(1) + 's</span>'
      + '<span class="qeeg-raw-segment-label">' + esc(seg.description) + '</span>'
      + '<button class="btn btn-xs btn-outline" data-seg-idx="' + idx + '" title="Remove">&times;</button>'
      + '</div>';
  }).join('');

  return '<div class="qeeg-raw-sidebar__section">'
    + '<div class="qeeg-raw-sidebar__title">Bad Segments (' + state.badSegments.length + ')</div>'
    + '<div class="qeeg-raw-segments-list" id="qeeg-raw-segments">'
    + (items || '<div style="color:var(--text-tertiary);font-size:12px;padding:4px 0">Drag on the signal to annotate bad segments</div>')
    + '</div>'
    + '</div>';
}

function _buildICASection(state) {
  return '<div class="qeeg-raw-sidebar__section">'
    + '<div class="qeeg-raw-sidebar__title" style="cursor:pointer" id="qeeg-raw-ica-toggle">'
    + 'ICA Components '
    + '<span style="font-size:11px;color:var(--text-tertiary)">(click to ' + (state.icaExpanded ? 'collapse' : 'load & expand') + ')</span>'
    + '</div>'
    + '<div id="qeeg-raw-ica-content">'
    + (state.icaExpanded && state.icaData ? _renderICAGrid(state) : '')
    + '</div>'
    + '</div>';
}

function _renderICAGrid(state) {
  if (!state.icaData || !state.icaData.components) return '<div>No ICA data</div>';
  var comps = state.icaData.components;
  var autoExcluded = new Set(state.icaData.auto_excluded_indices || []);

  var items = comps.map(function (c) {
    var isExcluded = state.excludedICA.indexOf(c.index) >= 0 || (autoExcluded.has(c.index) && state.includedICA.indexOf(c.index) < 0);
    var isUserOverride = state.includedICA.indexOf(c.index) >= 0 || (state.excludedICA.indexOf(c.index) >= 0 && !autoExcluded.has(c.index));
    var labelClass = c.label === 'brain' ? 'ica-brain' : (c.label === 'eye' ? 'ica-eye' : (c.label === 'muscle' ? 'ica-muscle' : 'ica-other'));
    var maxProb = 0;
    var maxLabel = c.label;
    if (c.label_probabilities) {
      for (var k in c.label_probabilities) {
        if (c.label_probabilities[k] > maxProb) { maxProb = c.label_probabilities[k]; maxLabel = k; }
      }
    }

    return '<div class="qeeg-raw-ica-card' + (isExcluded ? ' qeeg-raw-ica-card--excluded' : '') + '">'
      + (c.topomap_b64 ? '<img src="' + c.topomap_b64 + '" class="qeeg-raw-ica-topo" alt="IC' + c.index + ' topomap">' : '<div class="qeeg-raw-ica-topo-placeholder">IC' + c.index + '</div>')
      + '<div class="qeeg-raw-ica-info">'
      +   '<span class="qeeg-raw-ica-badge ' + labelClass + '">IC' + c.index + ': ' + esc(maxLabel) + ' ' + (maxProb * 100).toFixed(0) + '%</span>'
      +   (isUserOverride ? '<span class="qeeg-raw-ica-override">override</span>' : '')
      + '</div>'
      + '<button class="btn btn-xs ' + (isExcluded ? 'btn-outline' : 'btn-primary') + '" data-ica-idx="' + c.index + '">'
      + (isExcluded ? 'Keep' : 'Reject') + '</button>'
      + '</div>';
  }).join('');

  return '<div class="qeeg-raw-ica-grid">' + items + '</div>';
}

// ── Data loading ───────────────────────────────────────────────────────────

async function _loadSignalWindow(analysisId, state, renderer) {
  try {
    var params = {
      t_start: state.tStart,
      window_sec: state.windowSec,
      max_points_per_channel: 2500,
    };

    if (state.view === 'raw' || state.view === 'overlay') {
      var rawData = await api.getQEEGRawSignal(analysisId, params);
      renderer.setData(
        rawData.channels, rawData.data, rawData.sfreq,
        rawData.t_start, rawData.annotations, rawData.total_duration_sec
      );

      if (state.view === 'overlay') {
        try {
          var cleanedData = await api.getQEEGCleanedSignal(analysisId, params);
          renderer.setOverlayData(rawData.data);
          renderer.setData(
            cleanedData.channels, cleanedData.data, cleanedData.sfreq,
            cleanedData.t_start, cleanedData.annotations, cleanedData.total_duration_sec
          );
        } catch (_) { renderer.clearOverlay(); }
      } else {
        renderer.clearOverlay();
      }
    } else if (state.view === 'cleaned') {
      var cleaned = await api.getQEEGCleanedSignal(analysisId, params);
      renderer.setData(
        cleaned.channels, cleaned.data, cleaned.sfreq,
        cleaned.t_start, cleaned.annotations, cleaned.total_duration_sec
      );
      renderer.clearOverlay();
    }
  } catch (err) {
    showToast('Failed to load signal: ' + (err.message || err), 'error');
  }
}

// ── Toolbar wiring ─────────────────────────────────────────────────────────

function _wireToolbar(analysisId, state, renderer) {
  // Sensitivity
  var sensDown = document.getElementById('qeeg-raw-sens-down');
  var sensUp = document.getElementById('qeeg-raw-sens-up');
  var sensVal = document.getElementById('qeeg-raw-sens-val');
  if (sensDown) sensDown.onclick = function () {
    state.sensitivity = Math.max(5, state.sensitivity - 10);
    renderer.setSensitivity(state.sensitivity);
    if (sensVal) sensVal.innerHTML = state.sensitivity + ' &micro;V';
  };
  if (sensUp) sensUp.onclick = function () {
    state.sensitivity = Math.min(500, state.sensitivity + 10);
    renderer.setSensitivity(state.sensitivity);
    if (sensVal) sensVal.innerHTML = state.sensitivity + ' &micro;V';
  };

  // Window size
  var windowSel = document.getElementById('qeeg-raw-window-sel');
  if (windowSel) windowSel.onchange = function () {
    state.windowSec = parseInt(windowSel.value, 10);
    _loadSignalWindow(analysisId, state, renderer);
  };

  // Navigation
  var prevBtn = document.getElementById('qeeg-raw-prev');
  var nextBtn = document.getElementById('qeeg-raw-next');
  if (prevBtn) prevBtn.onclick = function () {
    state.tStart = Math.max(0, state.tStart - state.windowSec);
    _loadSignalWindow(analysisId, state, renderer);
  };
  if (nextBtn) nextBtn.onclick = function () {
    var info = state.channelInfo || {};
    state.tStart = Math.min((info.duration_sec || 300) - state.windowSec, state.tStart + state.windowSec);
    _loadSignalWindow(analysisId, state, renderer);
  };

  // View mode
  var viewSel = document.getElementById('qeeg-raw-view-sel');
  if (viewSel) viewSel.onchange = function () {
    state.view = viewSel.value;
    _loadSignalWindow(analysisId, state, renderer);
  };

  // Save button
  var saveBtn = document.getElementById('qeeg-raw-save');
  if (saveBtn) saveBtn.onclick = async function () {
    try {
      await api.saveQEEGCleaningConfig(analysisId, {
        bad_channels: state.badChannels,
        bad_segments: state.badSegments,
        excluded_ica_components: state.excludedICA,
        included_ica_components: state.includedICA,
        bandpass_low: state.filterParams.bandpass_low,
        bandpass_high: state.filterParams.bandpass_high,
        notch_hz: state.filterParams.notch_hz,
        resample_hz: 250.0,
      });
      state.hasUnsavedChanges = false;
      _updateSaveButton(state);
      showToast('Cleaning config saved', 'success');
    } catch (err) {
      showToast('Failed to save: ' + (err.message || err), 'error');
    }
  };

  // Reprocess button
  var reprocessBtn = document.getElementById('qeeg-raw-reprocess');
  if (reprocessBtn) reprocessBtn.onclick = async function () {
    try {
      reprocessBtn.disabled = true;
      reprocessBtn.textContent = 'Processing...';
      await api.reprocessQEEGWithCleaning(analysisId, {
        bad_channels: state.badChannels,
        bad_segments: state.badSegments,
        excluded_ica_components: state.excludedICA,
        included_ica_components: state.includedICA,
        bandpass_low: state.filterParams.bandpass_low,
        bandpass_high: state.filterParams.bandpass_high,
        notch_hz: state.filterParams.notch_hz,
        resample_hz: 250.0,
      });
      state.hasUnsavedChanges = false;
      showToast('Re-processing started. Switch to the Analysis tab to see results when ready.', 'success');
    } catch (err) {
      showToast('Reprocess failed: ' + (err.message || err), 'error');
    } finally {
      reprocessBtn.disabled = false;
      reprocessBtn.textContent = 'Reprocess';
    }
  };

  // Channel checkboxes
  var chList = document.getElementById('qeeg-raw-channels');
  if (chList) chList.addEventListener('change', function (e) {
    var chName = e.target.dataset.ch;
    if (!chName) return;
    if (e.target.checked) {
      var idx = state.badChannels.indexOf(chName);
      if (idx >= 0) state.badChannels.splice(idx, 1);
    } else {
      if (state.badChannels.indexOf(chName) < 0) state.badChannels.push(chName);
    }
    state.hasUnsavedChanges = true;
    renderer.setChannelStates(state.badChannels);
    _updateSaveButton(state);
  });

  // Segment removal
  var segList = document.getElementById('qeeg-raw-segments');
  if (segList) segList.addEventListener('click', function (e) {
    var segIdx = e.target.dataset.segIdx;
    if (segIdx == null) return;
    state.badSegments.splice(parseInt(segIdx, 10), 1);
    state.hasUnsavedChanges = true;
    renderer.setBadSegments(state.badSegments);
    _updateSegmentsList(state);
    _updateSaveButton(state);
  });

  // Filter changes
  var bpLow = document.getElementById('qeeg-raw-bp-low');
  var bpHigh = document.getElementById('qeeg-raw-bp-high');
  var notch = document.getElementById('qeeg-raw-notch');
  if (bpLow) bpLow.onchange = function () { state.filterParams.bandpass_low = parseFloat(bpLow.value) || 1.0; state.hasUnsavedChanges = true; _updateSaveButton(state); };
  if (bpHigh) bpHigh.onchange = function () { state.filterParams.bandpass_high = parseFloat(bpHigh.value) || 45.0; state.hasUnsavedChanges = true; _updateSaveButton(state); };
  if (notch) notch.onchange = function () { state.filterParams.notch_hz = parseFloat(notch.value) || 50; state.hasUnsavedChanges = true; _updateSaveButton(state); };

  // ICA toggle
  var icaToggle = document.getElementById('qeeg-raw-ica-toggle');
  if (icaToggle) icaToggle.onclick = async function () {
    if (state.icaExpanded) {
      state.icaExpanded = false;
      var content = document.getElementById('qeeg-raw-ica-content');
      if (content) content.innerHTML = '';
      return;
    }

    var content = document.getElementById('qeeg-raw-ica-content');
    if (content) content.innerHTML = '<div style="padding:12px">' + '<span class="spinner"></span> Computing ICA components... This may take 30-60s</div>';

    try {
      state.icaData = await api.getQEEGICAComponents(analysisId);
      state.icaExpanded = true;
      // Set auto-excluded as default if user hasn't overridden
      if (!state.excludedICA.length && state.icaData.auto_excluded_indices) {
        state.excludedICA = [].concat(state.icaData.auto_excluded_indices);
      }
      if (content) content.innerHTML = _renderICAGrid(state);
      _wireICAButtons(state);
    } catch (err) {
      if (content) content.innerHTML = '<div style="color:var(--text-tertiary);padding:8px">ICA unavailable: ' + esc(err.message || err) + '</div>';
    }
  };
}

function _wireICAButtons(state) {
  var grid = document.querySelector('.qeeg-raw-ica-grid');
  if (!grid) return;
  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ica-idx]');
    if (!btn) return;
    var idx = parseInt(btn.dataset.icaIdx, 10);

    var exIdx = state.excludedICA.indexOf(idx);
    var inIdx = state.includedICA.indexOf(idx);
    var autoExcluded = state.icaData && (state.icaData.auto_excluded_indices || []).indexOf(idx) >= 0;

    if (exIdx >= 0) {
      // Currently excluded → keep it
      state.excludedICA.splice(exIdx, 1);
      if (autoExcluded && state.includedICA.indexOf(idx) < 0) {
        state.includedICA.push(idx);
      }
    } else {
      // Currently kept → exclude it
      state.excludedICA.push(idx);
      if (inIdx >= 0) state.includedICA.splice(inIdx, 1);
    }

    state.hasUnsavedChanges = true;
    var content = document.getElementById('qeeg-raw-ica-content');
    if (content) content.innerHTML = _renderICAGrid(state);
    _wireICAButtons(state);
    _updateSaveButton(state);
  });
}

// ── UI update helpers ──────────────────────────────────────────────────────

function _updateChannelList(state) {
  var el = document.getElementById('qeeg-raw-channels');
  if (!el) return;
  el.querySelectorAll('.qeeg-raw-channel-chip').forEach(function (chip) {
    var inp = chip.querySelector('input');
    if (!inp) return;
    var ch = inp.dataset.ch;
    var isBad = state.badChannels.indexOf(ch) >= 0;
    inp.checked = !isBad;
    chip.classList.toggle('qeeg-raw-channel-chip--bad', isBad);
  });
}

function _updateSegmentsList(state) {
  var el = document.getElementById('qeeg-raw-segments');
  if (!el) return;
  el.innerHTML = _buildSegmentsSection(state).replace(/<div class="qeeg-raw-sidebar__section">[\s\S]*?<div class="qeeg-raw-segments-list"[^>]*>/, '').replace(/<\/div>\s*<\/div>\s*$/, '');
}

function _updateSaveButton(state) {
  var btn = document.getElementById('qeeg-raw-save');
  if (!btn) return;
  btn.textContent = state.hasUnsavedChanges ? 'Save *' : 'Save';
  btn.classList.toggle('btn-primary', state.hasUnsavedChanges);
  btn.classList.toggle('btn-outline', !state.hasUnsavedChanges);
}
