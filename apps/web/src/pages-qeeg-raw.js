// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw.js — Clinical-Grade Raw EEG Data Viewer
//
// Professional EEG viewer inspired by Persyst, NeuroWorks, EDFbrowser, and
// MNE-Python. Features:
//   - Montage selection (Referential, Bipolar Longitudinal/Transverse, Average)
//   - Sensitivity dropdown with standard clinical values
//   - Timebase / page size control
//   - Channel region color-coding (frontal/temporal/central/parietal/occipital)
//   - Minimap overview bar
//   - Cursor crosshair with time/amplitude readout
//   - Amplitude scale calibration bar
//   - Keyboard navigation (arrow keys, +/- zoom)
//   - Bad channel marking, segment annotation, ICA review
//   - Filter controls (LFF, HFF, Notch)
//   - Page counter (Page X of Y)
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { emptyState, showToast } from './helpers.js';
import { EEGSignalRenderer } from './eeg-signal-renderer.js';
import { EEGSpectralPanel } from './eeg-spectral-panel.js';
import { EEGEventEditor, EEGMeasurementTool, EEGExporter, EEGUndoManager } from './eeg-tools.js';
import { EEGMontageEditor, EEGChannelManager, EEGRecordingInfo } from './eeg-montage-editor.js';

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Demo mode ───────────────────────────────────────────────────────────────
function _isDemoMode() {
  return Boolean(import.meta?.env?.DEV) || import.meta?.env?.VITE_ENABLE_DEMO === '1';
}

var _DEMO_CHANNELS = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T3','C3','Cz','C4','T4','T5','P3','Pz','P4','T6','O1','O2'];
var _DEMO_SFREQ = 256;
var _DEMO_DURATION = 120;

function _generateDemoSignal(nChannels, sfreq, windowSec) {
  var nSamples = Math.round(sfreq * windowSec);
  var data = [];
  for (var ch = 0; ch < nChannels; ch++) {
    var row = new Array(nSamples);
    var alphaAmp = 15 + Math.random() * 25;
    var thetaAmp = 5 + Math.random() * 12;
    var betaAmp  = 3 + Math.random() * 8;
    var noiseAmp = 2 + Math.random() * 4;
    var alphaFreq = 9 + Math.random() * 3;
    var thetaFreq = 5 + Math.random() * 2;
    var betaFreq  = 18 + Math.random() * 8;
    var phaseA = Math.random() * Math.PI * 2;
    var phaseT = Math.random() * Math.PI * 2;
    var phaseB = Math.random() * Math.PI * 2;
    // Add occasional spike artifacts for realism
    var spikeAt = Math.random() > 0.7 ? Math.floor(Math.random() * nSamples) : -1;
    for (var i = 0; i < nSamples; i++) {
      var t = i / sfreq;
      row[i] = alphaAmp * Math.sin(2 * Math.PI * alphaFreq * t + phaseA)
        + thetaAmp * Math.sin(2 * Math.PI * thetaFreq * t + phaseT)
        + betaAmp * Math.sin(2 * Math.PI * betaFreq * t + phaseB)
        + noiseAmp * (Math.random() - 0.5) * 2;
      // Spike artifact
      if (spikeAt > 0 && Math.abs(i - spikeAt) < 5) {
        row[i] += (150 + Math.random() * 100) * (i < spikeAt ? 1 : -0.6);
      }
    }
    data.push(row);
  }
  return data;
}

function _getDemoChannelInfo() {
  return {
    channels: _DEMO_CHANNELS.map(function (ch) { return { name: ch, type: 'eeg' }; }),
    sfreq: _DEMO_SFREQ,
    duration_sec: _DEMO_DURATION,
    n_samples: _DEMO_SFREQ * _DEMO_DURATION,
    n_channels: _DEMO_CHANNELS.length,
  };
}

function _getDemoSignalWindow(tStart, windowSec) {
  var data = _generateDemoSignal(_DEMO_CHANNELS.length, _DEMO_SFREQ, windowSec);
  return {
    channels: _DEMO_CHANNELS.slice(),
    data: data,
    sfreq: _DEMO_SFREQ,
    t_start: tStart,
    total_duration_sec: _DEMO_DURATION,
    annotations: tStart < 5 ? [{ onset: 2.3, duration: 0.5, description: 'BAD_artifact' }] : [],
  };
}

// ── Standard clinical sensitivity values ────────────────────────────────────
var SENSITIVITY_VALUES = [3, 5, 7, 10, 15, 20, 30, 50, 70, 100, 150, 200, 300, 500];

// ── State ───────────────────────────────────────────────────────────────────

function _initState() {
  if (!window._qeegRawState) {
    window._qeegRawState = {
      view: 'raw',
      montage: 'referential',
      tStart: 0,
      windowSec: 10,
      sensitivity: 50,
      badChannels: [],
      badSegments: [],
      excludedICA: [],
      includedICA: [],
      filterParams: { lff: 1.0, hff: 45.0, notch: 50 },
      channelInfo: null,
      icaData: null,
      hasUnsavedChanges: false,
      icaExpanded: false,
      cursorInfo: null,
      // v2 features
      interactionMode: 'select',
      spectralMode: 'psd',
      spectralVisible: false,
      eventEditor: new EEGEventEditor(),
      measurementTool: new EEGMeasurementTool(),
      undoManager: new EEGUndoManager(),
      channelManager: null,
      montageEditor: null,
      recordingInfo: new EEGRecordingInfo(),
      measurePointCount: 0,
    };
  }
  return window._qeegRawState;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function spinner(msg) {
  return '<div style="display:flex;align-items:center;gap:8px;padding:48px;justify-content:center;color:var(--text-secondary)">'
    + '<span class="spinner"></span>' + esc(msg || 'Loading...') + '</div>';
}

function _pageInfo(state) {
  var dur = (state.channelInfo || {}).duration_sec || 0;
  var currentPage = Math.floor(state.tStart / state.windowSec) + 1;
  var totalPages = Math.max(1, Math.ceil(dur / state.windowSec));
  return { current: currentPage, total: totalPages };
}

// ── Main render ─────────────────────────────────────────────────────────────

export async function renderRawDataTab(tabEl, analysisId, patientId) {
  var state = _initState();
  var isDemo = _isDemoMode() && analysisId === 'demo';

  tabEl.innerHTML = spinner('Initializing EEG viewer...');

  // Inject CSS if not present
  _injectCSS();

  // Load channel info
  try {
    var info;
    if (isDemo) {
      info = _getDemoChannelInfo();
    } else {
      info = await api.getQEEGChannelInfo(analysisId);
    }
    state.channelInfo = info;
  } catch (err) {
    tabEl.innerHTML = emptyState('&#x26A0;', 'Failed to Load EEG Data',
      'Could not load channel information.<br><small>' + esc(err.message || err) + '</small>');
    return;
  }

  // Load saved cleaning config
  if (!isDemo) {
    try {
      var savedConfig = await api.getQEEGCleaningConfig(analysisId);
      if (savedConfig && savedConfig.config) {
        var cfg = savedConfig.config;
        state.badChannels = cfg.bad_channels || [];
        state.badSegments = cfg.bad_segments || [];
        state.excludedICA = cfg.excluded_ica_components || [];
        state.includedICA = cfg.included_ica_components || [];
        state.filterParams = {
          lff: cfg.bandpass_low || 1.0,
          hff: cfg.bandpass_high || 45.0,
          notch: cfg.notch_hz != null ? cfg.notch_hz : 50,
        };
      }
    } catch (_) {}
  }

  // Build layout
  tabEl.innerHTML = _buildLayout(state, isDemo);

  // Initialize renderer
  var canvasEl = document.getElementById('qeeg-raw-canvas');
  if (!canvasEl) return;

  var renderer = new EEGSignalRenderer(canvasEl, {
    sensitivity: state.sensitivity,
  });

  renderer.setChannelStates(state.badChannels);
  renderer.setBadSegments(state.badSegments);
  renderer.setMontage(state.montage);

  // ── Initialize v2 modules ──────────────────────────────────────────────
  var chNames = (state.channelInfo.channels || []).map(function (c) { return c.name || c; });
  state.channelManager = new EEGChannelManager(chNames);
  state.montageEditor = new EEGMontageEditor(chNames);
  state.recordingInfo.setMetadata(state.channelInfo);

  // Initialize spectral panel
  var spectralWrap = document.getElementById('eeg-spectral-wrap');
  var spectralPanel = null;
  if (spectralWrap) {
    spectralPanel = new EEGSpectralPanel(spectralWrap);
    EEGSpectralPanel.createTabBar(spectralWrap, spectralPanel);
  }

  // Pass measurement tool reference to renderer
  renderer.setMeasurementTool(state.measurementTool);

  // Compute initial channel quality
  // (will be updated after first signal load)

  // ── Wire callbacks ─────────────────────────────────────────────────────
  renderer.onChannelClick = function (chName) {
    var idx = state.badChannels.indexOf(chName);
    var wasBad = idx >= 0;
    if (wasBad) state.badChannels.splice(idx, 1);
    else state.badChannels.push(chName);
    state.hasUnsavedChanges = true;
    // Undo support
    state.undoManager.push({
      type: wasBad ? 'remove_bad_channel' : 'add_bad_channel',
      data: chName,
      undo: function () {
        if (wasBad) { state.badChannels.push(chName); }
        else { var i = state.badChannels.indexOf(chName); if (i >= 0) state.badChannels.splice(i, 1); }
        renderer.setChannelStates(state.badChannels);
        _updateChannelList(state);
        _updateSaveIndicator(state);
      },
      redo: function () {
        if (wasBad) { var i = state.badChannels.indexOf(chName); if (i >= 0) state.badChannels.splice(i, 1); }
        else { state.badChannels.push(chName); }
        renderer.setChannelStates(state.badChannels);
        _updateChannelList(state);
        _updateSaveIndicator(state);
      },
    });
    _updateChannelList(state);
    _updateSaveIndicator(state);
    _updateUndoButtons(state);
  };

  renderer.onSegmentSelect = function (startSec, endSec) {
    var seg = {
      start_sec: Math.round(startSec * 100) / 100,
      end_sec: Math.round(endSec * 100) / 100,
      description: 'BAD_user',
    };
    state.badSegments.push(seg);
    state.hasUnsavedChanges = true;
    renderer.setBadSegments(state.badSegments);
    // Undo support
    state.undoManager.push({
      type: 'add_bad_segment',
      data: seg,
      undo: function () {
        var i = state.badSegments.indexOf(seg);
        if (i >= 0) state.badSegments.splice(i, 1);
        renderer.setBadSegments(state.badSegments);
        _updateSegmentsList(state);
        _updateSaveIndicator(state);
      },
      redo: function () {
        state.badSegments.push(seg);
        renderer.setBadSegments(state.badSegments);
        _updateSegmentsList(state);
        _updateSaveIndicator(state);
      },
    });
    _updateSegmentsList(state);
    _updateSaveIndicator(state);
    _updateUndoButtons(state);
    showToast('Segment marked: ' + startSec.toFixed(1) + 's \u2013 ' + endSec.toFixed(1) + 's', 'info');
  };

  renderer.onTimeNavigate = function (newTStart) {
    state.tStart = newTStart;
    _loadSignalWindow(analysisId, state, renderer, spectralPanel);
    _updatePageCounter(state);
  };

  renderer.onCursorMove = function (info) {
    state.cursorInfo = info;
    _updateCursorReadout(info);
  };

  // Measurement mode callback
  renderer.onMeasurementPoint = function (timeSec, ampUV, chName) {
    state.measurePointCount++;
    var ptNum = ((state.measurePointCount - 1) % 2) + 1;
    state.measurementTool.setPoint(ptNum, timeSec, ampUV, chName);
    renderer.render();
    var m = state.measurementTool.getMeasurement();
    if (m) {
      _updateMeasurementReadout(m);
    }
  };

  // Event placement callback
  renderer.onEventPlace = function (timeSec) {
    var picker = document.getElementById('eeg-event-type-sel');
    var eventTypeIdx = picker ? parseInt(picker.value, 10) : 0;
    var evtType = EEGEventEditor.EVENT_TYPES[eventTypeIdx] || EEGEventEditor.EVENT_TYPES[0];
    var evt = state.eventEditor.addEvent(timeSec, evtType.label, evtType.color);
    renderer.setEventMarkers(state.eventEditor.getEvents());
    _updateEventList(state);
    state.undoManager.push({
      type: 'add_event',
      data: evt,
      undo: function () { state.eventEditor.removeEvent(evt.id); renderer.setEventMarkers(state.eventEditor.getEvents()); _updateEventList(state); },
      redo: function () { state.eventEditor.addEvent(timeSec, evtType.label, evtType.color); renderer.setEventMarkers(state.eventEditor.getEvents()); _updateEventList(state); },
    });
    _updateUndoButtons(state);
    showToast('Event: ' + evtType.label + ' at ' + timeSec.toFixed(2) + 's', 'info');
  };

  // Wire toolbar + keyboard + v2 tools
  _wireToolbar(analysisId, state, renderer, spectralPanel);
  _wireKeyboard(analysisId, state, renderer, tabEl, spectralPanel);
  _wireV2Tools(analysisId, state, renderer, spectralPanel);

  // Load initial data
  await _loadSignalWindow(analysisId, state, renderer, spectralPanel);
  _updatePageCounter(state);
}

// ── Layout ──────────────────────────────────────────────────────────────────

function _buildLayout(state, isDemo) {
  var info = state.channelInfo || {};
  var nCh = info.n_channels || 0;
  var dur = info.duration_sec || 0;
  var sfreq = info.sfreq || 0;
  var pi = _pageInfo(state);

  var html = '<div class="eeg-viewer" tabindex="0">';

  // ── Demo banner
  if (isDemo) {
    html += '<div class="eeg-viewer__demo-banner">'
      + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
      + ' Demo mode \u2014 displaying synthetic EEG data'
      + '</div>';
  }

  // ── Recording info bar
  html += '<div class="eeg-viewer__info-bar">'
    + '<div class="eeg-viewer__info-item"><span class="eeg-viewer__info-label">Channels</span><span class="eeg-viewer__info-value">' + nCh + '</span></div>'
    + '<div class="eeg-viewer__info-item"><span class="eeg-viewer__info-label">Sample Rate</span><span class="eeg-viewer__info-value">' + sfreq + ' Hz</span></div>'
    + '<div class="eeg-viewer__info-item"><span class="eeg-viewer__info-label">Duration</span><span class="eeg-viewer__info-value">' + _formatDuration(dur) + '</span></div>'
    + '<div class="eeg-viewer__info-item"><span class="eeg-viewer__info-label">Montage</span><span class="eeg-viewer__info-value" id="eeg-info-montage">Referential</span></div>'
    + '<div class="eeg-viewer__info-spacer"></div>'
    + '<div class="eeg-viewer__cursor-readout" id="eeg-cursor-readout">'
    + '<span id="eeg-cursor-time">--:--</span>'
    + '<span id="eeg-cursor-ch">---</span>'
    + '<span id="eeg-cursor-amp">--- \u00B5V</span>'
    + '</div>'
    + '</div>';

  // ── Main toolbar
  html += '<div class="eeg-viewer__toolbar">';

  // Montage
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Montage</label>'
    + '<select id="eeg-montage-sel" class="eeg-tb__select">'
    + '<option value="referential"' + (state.montage === 'referential' ? ' selected' : '') + '>Referential</option>'
    + '<option value="bipolar_long"' + (state.montage === 'bipolar_long' ? ' selected' : '') + '>Bipolar (Longitudinal)</option>'
    + '<option value="bipolar_trans"' + (state.montage === 'bipolar_trans' ? ' selected' : '') + '>Bipolar (Transverse)</option>'
    + '<option value="average"' + (state.montage === 'average' ? ' selected' : '') + '>Average Reference</option>'
    + '<option value="laplacian"' + (state.montage === 'laplacian' ? ' selected' : '') + '>Laplacian</option>'
    + '</select>'
    + '</div>';

  // Sensitivity
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Sensitivity</label>'
    + '<select id="eeg-sens-sel" class="eeg-tb__select eeg-tb__select--narrow">';
  for (var si = 0; si < SENSITIVITY_VALUES.length; si++) {
    var sv = SENSITIVITY_VALUES[si];
    html += '<option value="' + sv + '"' + (state.sensitivity === sv ? ' selected' : '') + '>' + sv + ' \u00B5V</option>';
  }
  html += '</select></div>';

  // Timebase
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Timebase</label>'
    + '<select id="eeg-timebase-sel" class="eeg-tb__select eeg-tb__select--narrow">'
    + '<option value="5"' + (state.windowSec === 5 ? ' selected' : '') + '>5 sec</option>'
    + '<option value="10"' + (state.windowSec === 10 ? ' selected' : '') + '>10 sec</option>'
    + '<option value="15"' + (state.windowSec === 15 ? ' selected' : '') + '>15 sec</option>'
    + '<option value="20"' + (state.windowSec === 20 ? ' selected' : '') + '>20 sec</option>'
    + '<option value="30"' + (state.windowSec === 30 ? ' selected' : '') + '>30 sec</option>'
    + '</select></div>';

  // Separator
  html += '<div class="eeg-tb__sep"></div>';

  // Filters
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">LFF</label>'
    + '<select id="eeg-lff-sel" class="eeg-tb__select eeg-tb__select--mini">'
    + _filterOpts([0.1, 0.3, 0.5, 1.0, 1.5, 2.0, 5.0, 10.0], state.filterParams.lff, 'Hz')
    + '</select></div>'
    + '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">HFF</label>'
    + '<select id="eeg-hff-sel" class="eeg-tb__select eeg-tb__select--mini">'
    + _filterOpts([15, 20, 25, 30, 35, 40, 45, 50, 70, 100], state.filterParams.hff, 'Hz')
    + '</select></div>'
    + '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Notch</label>'
    + '<select id="eeg-notch-sel" class="eeg-tb__select eeg-tb__select--mini">'
    + '<option value="0"' + (state.filterParams.notch === 0 ? ' selected' : '') + '>Off</option>'
    + '<option value="50"' + (state.filterParams.notch === 50 ? ' selected' : '') + '>50 Hz</option>'
    + '<option value="60"' + (state.filterParams.notch === 60 ? ' selected' : '') + '>60 Hz</option>'
    + '</select></div>';

  // Separator
  html += '<div class="eeg-tb__sep"></div>';

  // View mode
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">View</label>'
    + '<select id="eeg-view-sel" class="eeg-tb__select eeg-tb__select--narrow">'
    + '<option value="raw"' + (state.view === 'raw' ? ' selected' : '') + '>Raw</option>'
    + '<option value="cleaned"' + (state.view === 'cleaned' ? ' selected' : '') + '>Cleaned</option>'
    + '<option value="overlay"' + (state.view === 'overlay' ? ' selected' : '') + '>Overlay</option>'
    + '</select></div>';

  // Separator
  html += '<div class="eeg-tb__sep"></div>';

  // Tool mode selector (v2)
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Tool</label>'
    + '<select id="eeg-tool-sel" class="eeg-tb__select eeg-tb__select--narrow">'
    + '<option value="select"' + (state.interactionMode === 'select' ? ' selected' : '') + '>Select</option>'
    + '<option value="measure"' + (state.interactionMode === 'measure' ? ' selected' : '') + '>Measure</option>'
    + '<option value="event"' + (state.interactionMode === 'event' ? ' selected' : '') + '>Event</option>'
    + '</select></div>';

  // Event type picker (shown when tool=event)
  html += '<div class="eeg-tb__group" id="eeg-event-picker-wrap" style="display:' + (state.interactionMode === 'event' ? 'flex' : 'none') + '">'
    + '<select id="eeg-event-type-sel" class="eeg-tb__select eeg-tb__select--narrow">';
  var evtTypes = EEGEventEditor.EVENT_TYPES;
  for (var eti = 0; eti < evtTypes.length; eti++) {
    html += '<option value="' + eti + '">' + esc(evtTypes[eti].label) + '</option>';
  }
  html += '</select></div>';

  // Separator
  html += '<div class="eeg-tb__sep"></div>';

  // Undo / Redo (v2)
  html += '<div class="eeg-tb__group">'
    + '<button class="eeg-tb__nav-btn" id="eeg-undo-btn" title="Undo (Ctrl+Z)" disabled>'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.08-11.37L1 10"/></svg>'
    + '</button>'
    + '<button class="eeg-tb__nav-btn" id="eeg-redo-btn" title="Redo (Ctrl+Y)" disabled>'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-5.08-11.37L23 10"/></svg>'
    + '</button>'
    + '</div>';

  // Spacer
  html += '<div class="eeg-tb__spacer"></div>';

  // Page navigation
  html += '<div class="eeg-tb__group eeg-tb__nav">'
    + '<button class="eeg-tb__nav-btn" id="eeg-nav-first" title="First page (Home)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="11 17 6 12 11 7"/><line x1="7" y1="12" x2="18" y2="12"/><line x1="6" y1="4" x2="6" y2="20"/></svg>'
    + '</button>'
    + '<button class="eeg-tb__nav-btn" id="eeg-nav-prev" title="Previous page (\u2190)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>'
    + '</button>'
    + '<span class="eeg-tb__page-counter" id="eeg-page-counter">' + pi.current + ' / ' + pi.total + '</span>'
    + '<button class="eeg-tb__nav-btn" id="eeg-nav-next" title="Next page (\u2192)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>'
    + '</button>'
    + '<button class="eeg-tb__nav-btn" id="eeg-nav-last" title="Last page (End)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="13 17 18 12 13 7"/><line x1="6" y1="12" x2="17" y2="12"/><line x1="18" y1="4" x2="18" y2="20"/></svg>'
    + '</button>'
    + '</div>';

  // Actions
  html += '<div class="eeg-tb__group">'
    + '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-export-btn" title="Export (CSV/PNG)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    + ' Export</button>'
    + '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-spectral-toggle" title="Toggle Spectral Panel">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'
    + ' Spectral</button>'
    + '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-save-btn" title="Save cleaning config">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
    + ' Save</button>'
    + '<button class="eeg-tb__action-btn eeg-tb__action-btn--primary" id="eeg-reprocess-btn" title="Re-process with edits">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2.5 12A10 10 0 0119 5.6"/><path d="M21.5 12A10 10 0 015 18.4"/></svg>'
    + ' Reprocess</button>'
    + '</div>';

  html += '</div>'; // toolbar

  // ── Measurement readout bar (v2)
  html += '<div class="eeg-viewer__measure-bar" id="eeg-measure-bar" style="display:none">'
    + '<span class="eeg-measure__label">Measurement:</span>'
    + '<span id="eeg-measure-dt">\u0394t: ---</span>'
    + '<span id="eeg-measure-damp">\u0394amp: ---</span>'
    + '<span id="eeg-measure-freq">Freq: ---</span>'
    + '<button class="eeg-measure__clear" id="eeg-measure-clear">Clear</button>'
    + '</div>';

  // ── Main content area
  html += '<div class="eeg-viewer__body">';

  // Canvas + spectral panel stack
  html += '<div class="eeg-viewer__main-stack">';
  html += '<div class="eeg-viewer__canvas-wrap">'
    + '<canvas id="qeeg-raw-canvas"></canvas>'
    + '</div>';

  // Spectral panel (v2 - hidden by default)
  html += '<div class="eeg-viewer__spectral-wrap" id="eeg-spectral-wrap" style="display:' + (state.spectralVisible ? 'block' : 'none') + '"></div>';
  html += '</div>'; // main-stack

  // Right sidebar
  html += '<div class="eeg-viewer__sidebar" id="eeg-sidebar">';
  html += _buildRecordingInfoSection(state);
  html += _buildChannelSection(state);
  html += _buildSegmentsSection(state);
  html += _buildEventsSection(state);
  html += _buildICASection(state);
  html += '</div>';

  html += '</div>'; // body

  // ── Status bar
  html += '<div class="eeg-viewer__statusbar">'
    + '<span>Scroll: navigate \u00B7 Ctrl+Scroll: zoom \u00B7 Click label: toggle bad \u00B7 Drag: annotate \u00B7 Ctrl+Z/Y: undo/redo</span>'
    + '<span id="eeg-save-indicator"></span>'
    + '</div>';

  html += '</div>'; // eeg-viewer

  return html;
}

function _filterOpts(values, selected, unit) {
  return values.map(function (v) {
    return '<option value="' + v + '"' + (Math.abs(selected - v) < 0.01 ? ' selected' : '') + '>' + v + ' ' + unit + '</option>';
  }).join('');
}

function _formatDuration(sec) {
  if (sec < 60) return sec.toFixed(1) + 's';
  var m = Math.floor(sec / 60);
  var s = Math.round(sec % 60);
  return m + 'm ' + (s < 10 ? '0' : '') + s + 's';
}

function _buildChannelSection(state) {
  var info = state.channelInfo || {};
  var channels = (info.channels || []).map(function (ch) { return ch.name; });

  // Group channels by region
  var regionMap = { frontal: [], central: [], temporal: [], parietal: [], occipital: [], other: [] };
  var REGION_LOOKUP = {
    Fp1:'frontal',Fp2:'frontal',Fpz:'frontal',F7:'frontal',F3:'frontal',Fz:'frontal',F4:'frontal',F8:'frontal',
    T3:'temporal',T4:'temporal',T5:'temporal',T6:'temporal',T7:'temporal',T8:'temporal',
    C3:'central',Cz:'central',C4:'central',
    P3:'parietal',Pz:'parietal',P4:'parietal',
    O1:'occipital',O2:'occipital',Oz:'occipital',
  };
  var REGION_COLORS_MAP = {
    frontal: '#42a5f5', central: '#66bb6a', temporal: '#ffa726',
    parietal: '#ab47bc', occipital: '#ef5350', other: '#00d4bc',
  };

  channels.forEach(function (ch) {
    var r = REGION_LOOKUP[ch] || 'other';
    regionMap[r].push(ch);
  });

  var html = '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Channels <span class="eeg-sb__count">' + channels.length + '</span></div>'
    + '<div class="eeg-sb__channel-list" id="eeg-channels">';

  var regionOrder = ['frontal', 'temporal', 'central', 'parietal', 'occipital', 'other'];
  regionOrder.forEach(function (r) {
    if (!regionMap[r].length) return;
    var color = REGION_COLORS_MAP[r];
    html += '<div class="eeg-sb__region-group">'
      + '<div class="eeg-sb__region-label" style="color:' + color + '">'
      + '<span class="eeg-sb__region-dot" style="background:' + color + '"></span>'
      + r.charAt(0).toUpperCase() + r.slice(1)
      + '</div>';
    regionMap[r].forEach(function (ch) {
      var isBad = state.badChannels.indexOf(ch) >= 0;
      html += '<label class="eeg-sb__ch-chip' + (isBad ? ' eeg-sb__ch-chip--bad' : '') + '">'
        + '<input type="checkbox"' + (isBad ? '' : ' checked') + ' data-ch="' + esc(ch) + '">'
        + '<span class="eeg-sb__ch-name">' + esc(ch) + '</span>'
        + '</label>';
    });
    html += '</div>';
  });

  html += '</div></div>';
  return html;
}

function _buildSegmentsSection(state) {
  var items = state.badSegments.map(function (seg, idx) {
    return '<div class="eeg-sb__seg-item">'
      + '<span class="eeg-sb__seg-range">' + seg.start_sec.toFixed(1) + 's \u2013 ' + seg.end_sec.toFixed(1) + 's</span>'
      + '<span class="eeg-sb__seg-label">' + esc(seg.description) + '</span>'
      + '<button class="eeg-sb__seg-remove" data-seg-idx="' + idx + '" title="Remove">\u00D7</button>'
      + '</div>';
  }).join('');

  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Bad Segments <span class="eeg-sb__count">' + state.badSegments.length + '</span></div>'
    + '<div class="eeg-sb__seg-list" id="eeg-segments">'
    + (items || '<div class="eeg-sb__hint">Drag on waveform to annotate</div>')
    + '</div></div>';
}

function _buildICASection(state) {
  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title eeg-sb__title--click" id="eeg-ica-toggle">'
    + 'ICA Components '
    + '<span class="eeg-sb__hint-inline">' + (state.icaExpanded ? 'collapse' : 'expand') + '</span>'
    + '</div>'
    + '<div id="eeg-ica-content">'
    + (state.icaExpanded && state.icaData ? _renderICAGrid(state) : '')
    + '</div></div>';
}

function _renderICAGrid(state) {
  if (!state.icaData || !state.icaData.components) return '<div class="eeg-sb__hint">No ICA data</div>';
  var comps = state.icaData.components;
  var autoExcluded = new Set(state.icaData.auto_excluded_indices || []);

  var items = comps.map(function (c) {
    var isExcluded = state.excludedICA.indexOf(c.index) >= 0 || (autoExcluded.has(c.index) && state.includedICA.indexOf(c.index) < 0);
    var labelClass = c.label === 'brain' ? 'ica-brain' : (c.label === 'eye' ? 'ica-eye' : (c.label === 'muscle' ? 'ica-muscle' : 'ica-other'));
    var maxProb = 0; var maxLabel = c.label;
    if (c.label_probabilities) {
      for (var k in c.label_probabilities) {
        if (c.label_probabilities[k] > maxProb) { maxProb = c.label_probabilities[k]; maxLabel = k; }
      }
    }
    return '<div class="eeg-sb__ica-card' + (isExcluded ? ' eeg-sb__ica-card--excluded' : '') + '">'
      + (c.topomap_b64 ? '<img src="' + c.topomap_b64 + '" class="eeg-sb__ica-topo">' : '<div class="eeg-sb__ica-topo-ph">IC' + c.index + '</div>')
      + '<div class="eeg-sb__ica-info">'
      + '<span class="eeg-sb__ica-badge ' + labelClass + '">IC' + c.index + ': ' + esc(maxLabel) + ' ' + (maxProb * 100).toFixed(0) + '%</span>'
      + '</div>'
      + '<button class="eeg-sb__ica-btn" data-ica-idx="' + c.index + '">' + (isExcluded ? 'Keep' : 'Reject') + '</button>'
      + '</div>';
  }).join('');

  return '<div class="eeg-sb__ica-grid">' + items + '</div>';
}

// ── v2 section builders ─────────────────────────────────────────────────────

function _buildRecordingInfoSection(state) {
  var info = state.channelInfo || {};
  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Recording Info</div>'
    + '<div class="eeg-sb__rec-info">'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Channels</span><span class="eeg-sb__rec-val">' + (info.n_channels || 0) + '</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Sfreq</span><span class="eeg-sb__rec-val">' + (info.sfreq || 0) + ' Hz</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Duration</span><span class="eeg-sb__rec-val">' + _formatDuration(info.duration_sec || 0) + '</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Samples</span><span class="eeg-sb__rec-val">' + (info.n_samples || 0).toLocaleString() + '</span></div>'
    + '</div></div>';
}

function _buildEventsSection(state) {
  var events = state.eventEditor ? state.eventEditor.getEvents() : [];
  var items = events.map(function (evt, idx) {
    return '<div class="eeg-sb__evt-item">'
      + '<span class="eeg-sb__evt-dot" style="background:' + (evt.color || '#4caf50') + '"></span>'
      + '<span class="eeg-sb__evt-time">' + evt.time.toFixed(2) + 's</span>'
      + '<span class="eeg-sb__evt-label">' + esc(evt.label) + '</span>'
      + '<button class="eeg-sb__evt-remove" data-evt-id="' + evt.id + '">\u00D7</button>'
      + '</div>';
  }).join('');

  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Events <span class="eeg-sb__count">' + events.length + '</span></div>'
    + '<div class="eeg-sb__evt-list" id="eeg-events">'
    + (items || '<div class="eeg-sb__hint">Set tool to Event, click waveform to mark</div>')
    + '</div></div>';
}

// ── Data loading ────────────────────────────────────────────────────────────

async function _loadSignalWindow(analysisId, state, renderer, spectralPanel) {
  var isDemo = _isDemoMode() && analysisId === 'demo';
  try {
    if (isDemo) {
      var demoData = _getDemoSignalWindow(state.tStart, state.windowSec);
      renderer.setData(demoData.channels, demoData.data, demoData.sfreq, demoData.t_start, demoData.annotations, demoData.total_duration_sec);
      if (state.view === 'overlay') {
        var cleanedDemo = _getDemoSignalWindow(state.tStart, state.windowSec);
        renderer.setOverlayData(demoData.data);
        renderer.setData(cleanedDemo.channels, cleanedDemo.data, cleanedDemo.sfreq, cleanedDemo.t_start, cleanedDemo.annotations, cleanedDemo.total_duration_sec);
      } else { renderer.clearOverlay(); }
      // Feed spectral panel
      if (spectralPanel) spectralPanel.setData(demoData.channels, demoData.data, demoData.sfreq, demoData.t_start);
      // Compute channel quality
      _computeChannelQuality(state, demoData.channels, demoData.data, demoData.sfreq, renderer);
      return;
    }

    var params = { tStart: state.tStart, windowSec: state.windowSec, maxPoints: 2500 };
    var _lastChannels = null, _lastData = null, _lastSfreq = 250, _lastTStart = 0;

    if (state.view === 'raw' || state.view === 'overlay') {
      var rawData = await api.getQEEGRawSignal(analysisId, params);
      renderer.setData(rawData.channels, rawData.data, rawData.sfreq, rawData.t_start, rawData.annotations, rawData.total_duration_sec);
      _lastChannels = rawData.channels; _lastData = rawData.data; _lastSfreq = rawData.sfreq; _lastTStart = rawData.t_start;
      if (state.view === 'overlay') {
        try {
          var cleanedData = await api.getQEEGCleanedSignal(analysisId, params);
          renderer.setOverlayData(rawData.data);
          renderer.setData(cleanedData.channels, cleanedData.data, cleanedData.sfreq, cleanedData.t_start, cleanedData.annotations, cleanedData.total_duration_sec);
          _lastChannels = cleanedData.channels; _lastData = cleanedData.data; _lastSfreq = cleanedData.sfreq; _lastTStart = cleanedData.t_start;
        } catch (_) { renderer.clearOverlay(); }
      } else { renderer.clearOverlay(); }
    } else if (state.view === 'cleaned') {
      var cleaned = await api.getQEEGCleanedSignal(analysisId, params);
      renderer.setData(cleaned.channels, cleaned.data, cleaned.sfreq, cleaned.t_start, cleaned.annotations, cleaned.total_duration_sec);
      _lastChannels = cleaned.channels; _lastData = cleaned.data; _lastSfreq = cleaned.sfreq; _lastTStart = cleaned.t_start;
      renderer.clearOverlay();
    }
    // Feed spectral panel
    if (spectralPanel && _lastChannels) spectralPanel.setData(_lastChannels, _lastData, _lastSfreq, _lastTStart);
    // Compute channel quality
    if (_lastChannels) _computeChannelQuality(state, _lastChannels, _lastData, _lastSfreq, renderer);
  } catch (err) {
    showToast('Signal load failed: ' + (err.message || err), 'error');
  }
}

// ── Toolbar wiring ──────────────────────────────────────────────────────────

function _wireToolbar(analysisId, state, renderer, spectralPanel) {
  var isDemo = _isDemoMode() && analysisId === 'demo';
  var MONTAGE_LABELS = { referential: 'Referential', bipolar_long: 'Bipolar (Long)', bipolar_trans: 'Bipolar (Trans)', average: 'Average Ref', laplacian: 'Laplacian' };

  // Montage
  var montageSel = document.getElementById('eeg-montage-sel');
  if (montageSel) montageSel.onchange = function () {
    state.montage = montageSel.value;
    renderer.setMontage(state.montage);
    var lbl = document.getElementById('eeg-info-montage');
    if (lbl) lbl.textContent = MONTAGE_LABELS[state.montage] || state.montage;
    _loadSignalWindow(analysisId, state, renderer, spectralPanel);
  };

  // Sensitivity
  var sensSel = document.getElementById('eeg-sens-sel');
  if (sensSel) sensSel.onchange = function () {
    state.sensitivity = parseInt(sensSel.value, 10);
    renderer.setSensitivity(state.sensitivity);
  };

  // Timebase
  var tbSel = document.getElementById('eeg-timebase-sel');
  if (tbSel) tbSel.onchange = function () {
    state.windowSec = parseInt(tbSel.value, 10);
    _loadSignalWindow(analysisId, state, renderer, spectralPanel);
    _updatePageCounter(state);
  };

  // View
  var viewSel = document.getElementById('eeg-view-sel');
  if (viewSel) viewSel.onchange = function () {
    state.view = viewSel.value;
    _loadSignalWindow(analysisId, state, renderer, spectralPanel);
  };

  // Filters
  var lffSel = document.getElementById('eeg-lff-sel');
  var hffSel = document.getElementById('eeg-hff-sel');
  var notchSel = document.getElementById('eeg-notch-sel');
  if (lffSel) lffSel.onchange = function () { state.filterParams.lff = parseFloat(lffSel.value); state.hasUnsavedChanges = true; _updateSaveIndicator(state); };
  if (hffSel) hffSel.onchange = function () { state.filterParams.hff = parseFloat(hffSel.value); state.hasUnsavedChanges = true; _updateSaveIndicator(state); };
  if (notchSel) notchSel.onchange = function () { state.filterParams.notch = parseFloat(notchSel.value); state.hasUnsavedChanges = true; _updateSaveIndicator(state); };

  // Navigation buttons
  function _navTo(tStart) {
    state.tStart = tStart;
    _loadSignalWindow(analysisId, state, renderer, spectralPanel);
    _updatePageCounter(state);
  }
  var dur = (state.channelInfo || {}).duration_sec || 0;
  document.getElementById('eeg-nav-first')?.addEventListener('click', function () { _navTo(0); });
  document.getElementById('eeg-nav-prev')?.addEventListener('click', function () { _navTo(Math.max(0, state.tStart - state.windowSec)); });
  document.getElementById('eeg-nav-next')?.addEventListener('click', function () { _navTo(Math.min(dur - state.windowSec, state.tStart + state.windowSec)); });
  document.getElementById('eeg-nav-last')?.addEventListener('click', function () { _navTo(Math.max(0, dur - state.windowSec)); });

  // Save
  document.getElementById('eeg-save-btn')?.addEventListener('click', async function () {
    if (isDemo) { state.hasUnsavedChanges = false; _updateSaveIndicator(state); showToast('Demo \u2014 config saved locally', 'success'); return; }
    try {
      await api.saveQEEGCleaningConfig(analysisId, {
        bad_channels: state.badChannels, bad_segments: state.badSegments,
        excluded_ica_components: state.excludedICA, included_ica_components: state.includedICA,
        bandpass_low: state.filterParams.lff, bandpass_high: state.filterParams.hff,
        notch_hz: state.filterParams.notch, resample_hz: 250.0,
      });
      state.hasUnsavedChanges = false; _updateSaveIndicator(state); showToast('Config saved', 'success');
    } catch (err) { showToast('Save failed: ' + (err.message || err), 'error'); }
  });

  // Reprocess
  document.getElementById('eeg-reprocess-btn')?.addEventListener('click', async function () {
    var btn = document.getElementById('eeg-reprocess-btn');
    if (isDemo) {
      btn.disabled = true; btn.innerHTML = '<span class="spinner spinner--sm"></span> Processing...';
      setTimeout(function () { btn.disabled = false; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2.5 12A10 10 0 0119 5.6"/><path d="M21.5 12A10 10 0 015 18.4"/></svg> Reprocess'; showToast('Demo \u2014 reprocessing simulated', 'success'); }, 1500);
      return;
    }
    try {
      btn.disabled = true; btn.textContent = 'Processing...';
      await api.reprocessQEEGWithCleaning(analysisId, {
        bad_channels: state.badChannels, bad_segments: state.badSegments,
        excluded_ica_components: state.excludedICA, included_ica_components: state.includedICA,
        bandpass_low: state.filterParams.lff, bandpass_high: state.filterParams.hff,
        notch_hz: state.filterParams.notch, resample_hz: 250.0,
      });
      state.hasUnsavedChanges = false; showToast('Re-processing started', 'success');
    } catch (err) { showToast('Reprocess failed: ' + (err.message || err), 'error'); }
    finally { btn.disabled = false; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2.5 12A10 10 0 0119 5.6"/><path d="M21.5 12A10 10 0 015 18.4"/></svg> Reprocess'; }
  });

  // Channel checkboxes
  var chList = document.getElementById('eeg-channels');
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
    _updateSaveIndicator(state);
  });

  // Segment removal
  var segList = document.getElementById('eeg-segments');
  if (segList) segList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-seg-idx]');
    if (!btn) return;
    state.badSegments.splice(parseInt(btn.dataset.segIdx, 10), 1);
    state.hasUnsavedChanges = true;
    renderer.setBadSegments(state.badSegments);
    _updateSegmentsList(state);
    _updateSaveIndicator(state);
  });

  // ICA toggle
  var icaToggle = document.getElementById('eeg-ica-toggle');
  if (icaToggle) icaToggle.onclick = async function () {
    if (state.icaExpanded) {
      state.icaExpanded = false;
      var content = document.getElementById('eeg-ica-content');
      if (content) content.innerHTML = '';
      return;
    }
    var content = document.getElementById('eeg-ica-content');
    if (content) content.innerHTML = '<div class="eeg-sb__loading"><span class="spinner spinner--sm"></span> Computing ICA...</div>';
    try {
      var icaResult;
      if (isDemo) {
        var demoComps = [];
        var labels = ['brain','brain','eye','brain','muscle','brain','brain','brain','brain','brain','brain','brain','brain','brain','brain','brain','brain','brain','brain'];
        for (var ci = 0; ci < _DEMO_CHANNELS.length; ci++) {
          var lbl = labels[ci] || 'brain';
          var probs = {}; probs[lbl] = 0.7 + Math.random() * 0.25; probs['other'] = 1 - probs[lbl];
          demoComps.push({ index: ci, topomap_b64: '', label: lbl, label_probabilities: probs, is_excluded: lbl !== 'brain', variance_explained_pct: (15 - ci * 0.6 + Math.random() * 2) });
        }
        icaResult = { n_components: _DEMO_CHANNELS.length, method: 'fastica', components: demoComps, auto_excluded_indices: [2, 4], iclabel_available: true };
      } else { icaResult = await api.getQEEGICAComponents(analysisId); }
      state.icaData = icaResult; state.icaExpanded = true;
      if (!state.excludedICA.length && state.icaData.auto_excluded_indices) state.excludedICA = [].concat(state.icaData.auto_excluded_indices);
      if (content) content.innerHTML = _renderICAGrid(state);
      _wireICAButtons(state);
    } catch (err) {
      if (content) content.innerHTML = '<div class="eeg-sb__hint">ICA unavailable: ' + esc(err.message || err) + '</div>';
    }
  };
}

// ── Keyboard shortcuts ──────────────────────────────────────────────────────

function _wireKeyboard(analysisId, state, renderer, tabEl, spectralPanel) {
  var dur = (state.channelInfo || {}).duration_sec || 0;
  function _navTo(tStart) {
    state.tStart = tStart;
    _loadSignalWindow(analysisId, state, renderer, spectralPanel);
    _updatePageCounter(state);
  }

  var handler = function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        _navTo(Math.min(dur - state.windowSec, state.tStart + (e.shiftKey ? state.windowSec * 5 : state.windowSec)));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        _navTo(Math.max(0, state.tStart - (e.shiftKey ? state.windowSec * 5 : state.windowSec)));
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Decrease sensitivity (zoom in)
        var idx = SENSITIVITY_VALUES.indexOf(state.sensitivity);
        if (idx > 0) {
          state.sensitivity = SENSITIVITY_VALUES[idx - 1];
          renderer.setSensitivity(state.sensitivity);
          var sel = document.getElementById('eeg-sens-sel');
          if (sel) sel.value = state.sensitivity;
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        // Increase sensitivity (zoom out)
        var idx2 = SENSITIVITY_VALUES.indexOf(state.sensitivity);
        if (idx2 < SENSITIVITY_VALUES.length - 1) {
          state.sensitivity = SENSITIVITY_VALUES[idx2 + 1];
          renderer.setSensitivity(state.sensitivity);
          var sel2 = document.getElementById('eeg-sens-sel');
          if (sel2) sel2.value = state.sensitivity;
        }
        break;
      case 'Home':
        e.preventDefault();
        _navTo(0);
        break;
      case 'End':
        e.preventDefault();
        _navTo(Math.max(0, dur - state.windowSec));
        break;
      case 'z':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); state.undoManager.undo(); _updateUndoButtons(state); }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); state.undoManager.redo(); _updateUndoButtons(state); }
        break;
    }
  };

  // Attach to the viewer container so it catches focus
  var viewer = tabEl.querySelector('.eeg-viewer');
  if (viewer) {
    viewer.addEventListener('keydown', handler);
    viewer.focus();
  }
}

function _wireICAButtons(state) {
  var grid = document.querySelector('.eeg-sb__ica-grid');
  if (!grid) return;
  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-ica-idx]');
    if (!btn) return;
    var idx = parseInt(btn.dataset.icaIdx, 10);
    var exIdx = state.excludedICA.indexOf(idx);
    var inIdx = state.includedICA.indexOf(idx);
    var autoExcluded = state.icaData && (state.icaData.auto_excluded_indices || []).indexOf(idx) >= 0;
    if (exIdx >= 0) {
      state.excludedICA.splice(exIdx, 1);
      if (autoExcluded && state.includedICA.indexOf(idx) < 0) state.includedICA.push(idx);
    } else {
      state.excludedICA.push(idx);
      if (inIdx >= 0) state.includedICA.splice(inIdx, 1);
    }
    state.hasUnsavedChanges = true;
    var content = document.getElementById('eeg-ica-content');
    if (content) content.innerHTML = _renderICAGrid(state);
    _wireICAButtons(state);
    _updateSaveIndicator(state);
  });
}

// ── V2 tools wiring ─────────────────────────────────────────────────────────

function _wireV2Tools(analysisId, state, renderer, spectralPanel) {
  // Tool mode selector
  var toolSel = document.getElementById('eeg-tool-sel');
  if (toolSel) toolSel.onchange = function () {
    state.interactionMode = toolSel.value;
    renderer.setInteractionMode(toolSel.value);
    var evtPicker = document.getElementById('eeg-event-picker-wrap');
    if (evtPicker) evtPicker.style.display = toolSel.value === 'event' ? 'flex' : 'none';
    var measureBar = document.getElementById('eeg-measure-bar');
    if (measureBar) measureBar.style.display = toolSel.value === 'measure' ? 'flex' : 'none';
    if (toolSel.value !== 'measure') {
      state.measurementTool.clear();
      state.measurePointCount = 0;
      renderer.render();
    }
  };

  // Undo/Redo buttons
  var undoBtn = document.getElementById('eeg-undo-btn');
  var redoBtn = document.getElementById('eeg-redo-btn');
  if (undoBtn) undoBtn.onclick = function () { state.undoManager.undo(); _updateUndoButtons(state); };
  if (redoBtn) redoBtn.onclick = function () { state.undoManager.redo(); _updateUndoButtons(state); };

  // Export button
  var exportBtn = document.getElementById('eeg-export-btn');
  if (exportBtn) exportBtn.onclick = function () {
    var canvas = document.getElementById('qeeg-raw-canvas');
    if (!canvas) return;
    EEGExporter.exportPNG(canvas, 'eeg-raw-view.png');
    showToast('PNG exported', 'success');
  };

  // Spectral toggle
  var spectralBtn = document.getElementById('eeg-spectral-toggle');
  if (spectralBtn) spectralBtn.onclick = function () {
    state.spectralVisible = !state.spectralVisible;
    var wrap = document.getElementById('eeg-spectral-wrap');
    if (wrap) wrap.style.display = state.spectralVisible ? 'block' : 'none';
    spectralBtn.classList.toggle('eeg-tb__action-btn--active', state.spectralVisible);
  };

  // Measurement clear button
  var measureClear = document.getElementById('eeg-measure-clear');
  if (measureClear) measureClear.onclick = function () {
    state.measurementTool.clear();
    state.measurePointCount = 0;
    renderer.render();
    var dtEl = document.getElementById('eeg-measure-dt');
    var dAmpEl = document.getElementById('eeg-measure-damp');
    var freqEl = document.getElementById('eeg-measure-freq');
    if (dtEl) dtEl.textContent = '\u0394t: ---';
    if (dAmpEl) dAmpEl.textContent = '\u0394amp: ---';
    if (freqEl) freqEl.textContent = 'Freq: ---';
  };

  // Event list delete buttons (delegated)
  var evtList = document.getElementById('eeg-events');
  if (evtList) evtList.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-evt-id]');
    if (!btn) return;
    var evtId = btn.dataset.evtId;
    state.eventEditor.removeEvent(evtId);
    renderer.setEventMarkers(state.eventEditor.getEvents());
    _updateEventList(state);
  });
}

// ── UI update helpers ───────────────────────────────────────────────────────

function _updatePageCounter(state) {
  var el = document.getElementById('eeg-page-counter');
  if (!el) return;
  var pi = _pageInfo(state);
  el.textContent = pi.current + ' / ' + pi.total;
}

function _updateCursorReadout(info) {
  var timeEl = document.getElementById('eeg-cursor-time');
  var chEl = document.getElementById('eeg-cursor-ch');
  var ampEl = document.getElementById('eeg-cursor-amp');
  if (!info) {
    if (timeEl) timeEl.textContent = '--:--';
    if (chEl) chEl.textContent = '---';
    if (ampEl) ampEl.textContent = '--- \u00B5V';
    return;
  }
  if (timeEl) timeEl.textContent = info.time != null ? info.time.toFixed(3) + 's' : '--:--';
  if (chEl) chEl.textContent = info.channel || '---';
  if (ampEl) ampEl.textContent = info.amplitude != null ? info.amplitude.toFixed(1) + ' \u00B5V' : '--- \u00B5V';
}

function _updateChannelList(state) {
  var el = document.getElementById('eeg-channels');
  if (!el) return;
  el.querySelectorAll('.eeg-sb__ch-chip').forEach(function (chip) {
    var inp = chip.querySelector('input');
    if (!inp) return;
    var ch = inp.dataset.ch;
    var isBad = state.badChannels.indexOf(ch) >= 0;
    inp.checked = !isBad;
    chip.classList.toggle('eeg-sb__ch-chip--bad', isBad);
  });
}

function _updateSegmentsList(state) {
  var el = document.getElementById('eeg-segments');
  if (!el) return;
  if (!state.badSegments.length) {
    el.innerHTML = '<div class="eeg-sb__hint">Drag on waveform to annotate</div>';
    return;
  }
  el.innerHTML = state.badSegments.map(function (seg, idx) {
    return '<div class="eeg-sb__seg-item">'
      + '<span class="eeg-sb__seg-range">' + seg.start_sec.toFixed(1) + 's \u2013 ' + seg.end_sec.toFixed(1) + 's</span>'
      + '<span class="eeg-sb__seg-label">' + esc(seg.description) + '</span>'
      + '<button class="eeg-sb__seg-remove" data-seg-idx="' + idx + '">\u00D7</button>'
      + '</div>';
  }).join('');
}

function _updateSaveIndicator(state) {
  var el = document.getElementById('eeg-save-indicator');
  if (!el) return;
  el.textContent = state.hasUnsavedChanges ? 'Unsaved changes' : '';
  el.style.color = state.hasUnsavedChanges ? 'var(--amber, #f59e0b)' : '';
}

function _updateUndoButtons(state) {
  var undoBtn = document.getElementById('eeg-undo-btn');
  var redoBtn = document.getElementById('eeg-redo-btn');
  if (undoBtn) undoBtn.disabled = !state.undoManager.canUndo();
  if (redoBtn) redoBtn.disabled = !state.undoManager.canRedo();
}

function _updateMeasurementReadout(m) {
  var bar = document.getElementById('eeg-measure-bar');
  if (bar) bar.style.display = 'flex';
  var dtEl = document.getElementById('eeg-measure-dt');
  var dAmpEl = document.getElementById('eeg-measure-damp');
  var freqEl = document.getElementById('eeg-measure-freq');
  if (dtEl) dtEl.textContent = '\u0394t: ' + (m.deltaTime != null ? m.deltaTime.toFixed(3) + 's' : '---');
  if (dAmpEl) dAmpEl.textContent = '\u0394amp: ' + (m.deltaAmplitude != null ? m.deltaAmplitude.toFixed(1) + ' \u00B5V' : '---');
  if (freqEl) freqEl.textContent = 'Freq: ' + (m.frequency != null ? m.frequency.toFixed(1) + ' Hz' : '---');
}

function _updateEventList(state) {
  var el = document.getElementById('eeg-events');
  if (!el) return;
  var events = state.eventEditor ? state.eventEditor.getEvents() : [];
  if (!events.length) {
    el.innerHTML = '<div class="eeg-sb__hint">Set tool to Event, click waveform to mark</div>';
    return;
  }
  el.innerHTML = events.map(function (evt) {
    return '<div class="eeg-sb__evt-item">'
      + '<span class="eeg-sb__evt-dot" style="background:' + (evt.color || '#4caf50') + '"></span>'
      + '<span class="eeg-sb__evt-time">' + evt.time.toFixed(2) + 's</span>'
      + '<span class="eeg-sb__evt-label">' + esc(evt.label) + '</span>'
      + '<button class="eeg-sb__evt-remove" data-evt-id="' + evt.id + '">\u00D7</button>'
      + '</div>';
  }).join('');
}

function _computeChannelQuality(state, channels, data, sfreq, renderer) {
  if (!state.channelManager || !channels || !data) return;
  var qualityMap = {};
  for (var i = 0; i < channels.length; i++) {
    if (data[i]) {
      var q = state.channelManager.computeQuality(channels[i], data[i], sfreq);
      qualityMap[channels[i]] = q;
    }
  }
  renderer.setChannelQuality(qualityMap);
}

// ── CSS injection ───────────────────────────────────────────────────────────

function _injectCSS() {
  if (document.getElementById('eeg-viewer-css-v2')) return;
  var style = document.createElement('style');
  style.id = 'eeg-viewer-css-v2';
  style.textContent = `
/* ── EEG Viewer v2 — Clinical-grade dark theme ─────────────────────────── */
.eeg-viewer { display:flex; flex-direction:column; height:calc(100vh - 180px); min-height:520px; background:#080c14; border-radius:10px; border:1px solid rgba(255,255,255,0.06); overflow:hidden; outline:none; font-family:'Inter',system-ui,sans-serif; }
.eeg-viewer:focus { border-color:rgba(0,212,188,0.25); }

/* Demo banner */
.eeg-viewer__demo-banner { display:flex; align-items:center; gap:6px; padding:5px 14px; background:rgba(245,158,11,0.08); border-bottom:1px solid rgba(245,158,11,0.15); color:#f59e0b; font-size:11px; font-weight:500; }

/* Info bar */
.eeg-viewer__info-bar { display:flex; align-items:center; gap:2px; padding:4px 10px; background:rgba(255,255,255,0.02); border-bottom:1px solid rgba(255,255,255,0.06); font-size:11px; flex-wrap:wrap; }
.eeg-viewer__info-item { display:flex; align-items:center; gap:4px; padding:2px 8px; }
.eeg-viewer__info-label { color:#64748b; font-weight:500; text-transform:uppercase; letter-spacing:.04em; font-size:9px; }
.eeg-viewer__info-value { color:#cbd5e1; font-weight:600; font-family:'JetBrains Mono','SF Mono',monospace; font-size:11px; }
.eeg-viewer__info-spacer { flex:1; }
.eeg-viewer__cursor-readout { display:flex; gap:12px; font-family:'JetBrains Mono','SF Mono',monospace; font-size:11px; color:#00d4bc; }

/* Toolbar */
.eeg-viewer__toolbar { display:flex; align-items:center; gap:6px; padding:5px 8px; background:rgba(255,255,255,0.015); border-bottom:1px solid rgba(255,255,255,0.06); flex-wrap:wrap; }
.eeg-tb__group { display:flex; align-items:center; gap:4px; }
.eeg-tb__label { font-size:9px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:.05em; white-space:nowrap; }
.eeg-tb__select { font-size:11px; padding:3px 6px; border-radius:5px; border:1px solid rgba(255,255,255,0.1); background:#0c1222; color:#e2e8f0; cursor:pointer; font-family:'JetBrains Mono','SF Mono',monospace; }
.eeg-tb__select:hover { border-color:rgba(0,212,188,0.3); }
.eeg-tb__select:focus { outline:none; border-color:rgba(0,212,188,0.5); box-shadow:0 0 0 2px rgba(0,212,188,0.15); }
.eeg-tb__select--narrow { max-width:80px; }
.eeg-tb__select--mini { max-width:70px; }
.eeg-tb__sep { width:1px; height:20px; background:rgba(255,255,255,0.08); margin:0 4px; }
.eeg-tb__spacer { flex:1; min-width:8px; }
.eeg-tb__nav { gap:2px; }
.eeg-tb__nav-btn { display:flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:5px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:#94a3b8; cursor:pointer; transition:all .12s; }
.eeg-tb__nav-btn:hover { background:rgba(255,255,255,0.05); color:#e2e8f0; border-color:rgba(255,255,255,0.15); }
.eeg-tb__nav-btn:active { background:rgba(0,212,188,0.1); }
.eeg-tb__page-counter { font-family:'JetBrains Mono','SF Mono',monospace; font-size:11px; font-weight:600; color:#94a3b8; padding:0 6px; min-width:50px; text-align:center; }
.eeg-tb__action-btn { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; transition:all .12s; border:1px solid; white-space:nowrap; }
.eeg-tb__action-btn--outline { background:transparent; border-color:rgba(255,255,255,0.12); color:#94a3b8; }
.eeg-tb__action-btn--outline:hover { background:rgba(255,255,255,0.04); color:#e2e8f0; }
.eeg-tb__action-btn--primary { background:rgba(0,212,188,0.12); border-color:rgba(0,212,188,0.3); color:#00d4bc; }
.eeg-tb__action-btn--primary:hover { background:rgba(0,212,188,0.2); }

/* Body */
.eeg-viewer__body { display:flex; flex:1; overflow:hidden; }
.eeg-viewer__canvas-wrap { flex:1; position:relative; min-width:0; background:#080c14; cursor:crosshair; }
.eeg-viewer__canvas-wrap canvas { display:block; width:100%; height:100%; }

/* Sidebar */
.eeg-viewer__sidebar { width:220px; overflow-y:auto; border-left:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.01); flex-shrink:0; }
.eeg-sb__section { padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.05); }
.eeg-sb__title { font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px; display:flex; align-items:center; gap:6px; }
.eeg-sb__title--click { cursor:pointer; }
.eeg-sb__title--click:hover { color:#e2e8f0; }
.eeg-sb__count { font-size:9px; background:rgba(255,255,255,0.06); color:#64748b; padding:1px 5px; border-radius:8px; font-weight:600; }
.eeg-sb__hint { font-size:11px; color:#475569; padding:4px 0; }
.eeg-sb__hint-inline { font-size:9px; color:#475569; font-weight:400; text-transform:none; letter-spacing:0; }
.eeg-sb__loading { display:flex; align-items:center; gap:8px; padding:8px 0; font-size:11px; color:#64748b; }
.spinner--sm { width:14px; height:14px; }

/* Channel list */
.eeg-sb__channel-list { max-height:220px; overflow-y:auto; }
.eeg-sb__region-group { margin-bottom:6px; }
.eeg-sb__region-label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:2px 0; display:flex; align-items:center; gap:4px; }
.eeg-sb__region-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.eeg-sb__ch-chip { display:inline-flex; align-items:center; gap:3px; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:500; color:#94a3b8; background:rgba(255,255,255,0.03); cursor:pointer; transition:all .1s; margin:1px; user-select:none; }
.eeg-sb__ch-chip:hover { background:rgba(255,255,255,0.06); }
.eeg-sb__ch-chip input { width:10px; height:10px; accent-color:#ef5350; }
.eeg-sb__ch-chip--bad { background:rgba(239,107,107,0.1); color:#ef5350; text-decoration:line-through; }
.eeg-sb__ch-name { font-family:'JetBrains Mono','SF Mono',monospace; font-size:10px; }

/* Segments */
.eeg-sb__seg-list { max-height:150px; overflow-y:auto; }
.eeg-sb__seg-item { display:flex; align-items:center; gap:4px; padding:3px 0; font-size:11px; border-bottom:1px solid rgba(255,255,255,0.03); }
.eeg-sb__seg-range { font-family:'JetBrains Mono','SF Mono',monospace; font-size:10px; color:#94a3b8; }
.eeg-sb__seg-label { font-size:9px; color:#64748b; flex:1; }
.eeg-sb__seg-remove { background:none; border:none; color:#64748b; cursor:pointer; font-size:14px; padding:0 2px; line-height:1; }
.eeg-sb__seg-remove:hover { color:#ef5350; }

/* ICA */
.eeg-sb__ica-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px; }
.eeg-sb__ica-card { padding:6px; border-radius:6px; border:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); text-align:center; }
.eeg-sb__ica-card--excluded { opacity:0.45; border-color:rgba(239,107,107,0.2); }
.eeg-sb__ica-topo { width:100%; aspect-ratio:1; border-radius:4px; object-fit:contain; }
.eeg-sb__ica-topo-ph { width:100%; aspect-ratio:1; display:flex; align-items:center; justify-content:center; font-size:10px; color:#475569; background:rgba(255,255,255,0.03); border-radius:4px; }
.eeg-sb__ica-info { margin:4px 0; }
.eeg-sb__ica-badge { font-size:9px; font-weight:600; padding:1px 4px; border-radius:4px; }
.eeg-sb__ica-badge.ica-brain { background:rgba(102,187,106,0.15); color:#66bb6a; }
.eeg-sb__ica-badge.ica-eye { background:rgba(66,165,245,0.15); color:#42a5f5; }
.eeg-sb__ica-badge.ica-muscle { background:rgba(255,167,38,0.15); color:#ffa726; }
.eeg-sb__ica-badge.ica-other { background:rgba(148,163,184,0.15); color:#94a3b8; }
.eeg-sb__ica-btn { font-size:9px; padding:2px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.1); background:transparent; color:#94a3b8; cursor:pointer; width:100%; }
.eeg-sb__ica-btn:hover { background:rgba(255,255,255,0.05); color:#e2e8f0; }

/* Status bar */
.eeg-viewer__statusbar { display:flex; align-items:center; justify-content:space-between; padding:4px 12px; font-size:10px; color:#475569; background:rgba(255,255,255,0.015); border-top:1px solid rgba(255,255,255,0.06); }

/* Main stack (canvas + spectral) */
.eeg-viewer__main-stack { display:flex; flex-direction:column; flex:1; min-width:0; overflow:hidden; }
.eeg-viewer__spectral-wrap { height:260px; min-height:180px; border-top:1px solid rgba(255,255,255,0.06); background:#0a0f1a; overflow:hidden; }

/* Measurement bar */
.eeg-viewer__measure-bar { display:flex; align-items:center; gap:14px; padding:4px 12px; background:rgba(0,212,188,0.04); border-bottom:1px solid rgba(0,212,188,0.12); font-size:11px; font-family:'JetBrains Mono','SF Mono',monospace; color:#00d4bc; }
.eeg-measure__label { font-weight:600; font-size:9px; text-transform:uppercase; letter-spacing:.04em; color:#64748b; }
.eeg-measure__clear { margin-left:auto; background:none; border:1px solid rgba(255,255,255,0.1); border-radius:4px; color:#94a3b8; font-size:10px; padding:2px 8px; cursor:pointer; }
.eeg-measure__clear:hover { color:#ef5350; border-color:rgba(239,83,80,0.3); }

/* Active toolbar button */
.eeg-tb__action-btn--active { background:rgba(0,212,188,0.15) !important; border-color:rgba(0,212,188,0.4) !important; color:#00d4bc !important; }

/* Recording info sidebar */
.eeg-sb__rec-info { font-size:11px; }
.eeg-sb__rec-row { display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.03); }
.eeg-sb__rec-label { color:#64748b; font-size:10px; }
.eeg-sb__rec-val { color:#cbd5e1; font-family:'JetBrains Mono','SF Mono',monospace; font-size:10px; font-weight:500; }

/* Events sidebar */
.eeg-sb__evt-list { max-height:160px; overflow-y:auto; }
.eeg-sb__evt-item { display:flex; align-items:center; gap:5px; padding:3px 0; font-size:11px; border-bottom:1px solid rgba(255,255,255,0.03); }
.eeg-sb__evt-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
.eeg-sb__evt-time { font-family:'JetBrains Mono','SF Mono',monospace; font-size:10px; color:#94a3b8; min-width:48px; }
.eeg-sb__evt-label { font-size:10px; color:#cbd5e1; flex:1; }
.eeg-sb__evt-remove { background:none; border:none; color:#64748b; cursor:pointer; font-size:14px; padding:0 2px; line-height:1; }
.eeg-sb__evt-remove:hover { color:#ef5350; }

/* Disabled nav buttons */
.eeg-tb__nav-btn:disabled { opacity:0.35; cursor:not-allowed; pointer-events:none; }

@media (max-width: 900px) {
  .eeg-viewer__sidebar { width:180px; }
  .eeg-viewer__toolbar { gap:4px; }
  .eeg-tb__label { display:none; }
}
@media (max-width: 700px) {
  .eeg-viewer__sidebar { display:none; }
}
`;
  document.head.appendChild(style);
}
