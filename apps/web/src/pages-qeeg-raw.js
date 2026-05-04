// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-raw.js — Clinical-Grade Raw EEG Data Viewer
//
// Professional EEG viewer built on open standards (10-20 system, IFCN
// guidelines, MNE-Python conventions). Features:
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
//   - Band power dashboard (Delta/Theta/Alpha/Beta/Gamma)
//   - Per-channel quality indicator dots
//   - Recording timeline overview strip
//   - Keyboard shortcuts help overlay (? key)
//   - Snapshot PNG export
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { emptyState, showToast } from './helpers.js';
import { EEGSignalRenderer } from './eeg-signal-renderer.js';
import { renderBrainMap10_20 } from './brain-map-svg.js';
import { EEGSpectralPanel, _computePSD } from './eeg-spectral-panel.js';
import { EEGEventEditor, EEGMeasurementTool, EEGExporter, EEGUndoManager } from './eeg-tools.js';
import { EEGMontageEditor, EEGChannelManager, EEGRecordingInfo } from './eeg-montage-editor.js';
import { EEGCustomMontageBuilder, EEG_MONTAGE_BUILDER_CSS } from './eeg-montage-builder.js';
import { EEGFilterPreview } from './eeg-filter-preview.js';
import { EEGDecompositionStudio, EEG_DS_CSS } from './eeg-decomposition-studio.js';
import { EEGAutoScanModal, EEG_ASM_CSS } from './eeg-auto-scan-modal.js';
import { EEGSpikeList, EEG_SL_CSS } from './eeg-spike-list.js';
import { EEGExportModal, EEG_EXPORT_MODAL_CSS } from './eeg-export-modal.js';
import { EEGHelpDrawer, EEG_HELP_DRAWER_CSS } from './eeg-help-drawer.js';
import { RAW_HELP_TOPICS } from './raw-help-content.js';
import { RAW_KEYBOARD_SHORTCUTS, renderShortcutSheet, RAW_KEYBOARD_SHORTCUTS_CSS } from './raw-keyboard-shortcuts.js';

const _PHASE4_REASONS = [
  { key: 'blink',         label: 'Eye blink' },
  { key: 'lateral_eye',   label: 'Lateral eye' },
  { key: 'sweat',         label: 'Sweat' },
  { key: 'movement',      label: 'Movement' },
  { key: 'emg',           label: 'Muscle (EMG)' },
  { key: 'ecg',           label: 'Heart (ECG)' },
  { key: 'electrode_pop', label: 'Electrode pop' },
  { key: 'line_noise',    label: 'Line noise' },
  { key: 'flatline',      label: 'Flatline' },
  { key: 'other',         label: 'Other' },
];

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Demo mode ───────────────────────────────────────────────────────────────
function _isDemoMode() {
  try {
    return !!(import.meta.env && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === '1'));
  } catch (_e) {
    return false;
  }
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
//
// Phase 2 migration path:
//   The state shape is now sliced into four logical buckets — display,
//   processing, ai, ui — to make ownership obvious and to reserve space for
//   Phase 5's AI co-pilot overlay without polluting unrelated code paths.
//
//   Existing call sites still read `state.montage`, `state.badChannels`,
//   `state.interactionMode` etc. directly. To avoid a giant rename in this
//   phase, the top-level object exposes flat-name getter/setter pairs that
//   forward to the right slice. New code SHOULD prefer the slice form
//   (e.g. `state.display.montage`); legacy code keeps working unchanged.
//   Each subsequent phase can opt into the slice form gradually.

function _flatLegacyMap() {
  // flat-name -> slice path. The slice keys here mirror the structured
  // state literal in _initState() exactly.
  return {
    // display slice
    montage:               ['display', 'montage'],
    tStart:                ['display', 'tStart'],
    windowSec:             ['display', 'windowSec'],
    sensitivity:           ['display', 'sensitivity'],
    view:                  ['display', 'view'],
    channelOrdering:       ['display', 'channelOrdering'],
    regionTogglesByRegion: ['display', 'regionTogglesByRegion'],
    // processing slice
    badChannels:        ['processing', 'badChannels'],
    badSegments:        ['processing', 'badSegments'],
    excludedICA:        ['processing', 'excludedICA'],
    includedICA:        ['processing', 'includedICA'],
    filterParams:       ['processing', 'filterParams'],
    channelInfo:        ['processing', 'channelInfo'],
    icaData:            ['processing', 'icaData'],
    hasUnsavedChanges:  ['processing', 'hasUnsavedChanges'],
    icaExpanded:        ['processing', 'icaExpanded'],
    icaMethod:          ['processing', 'icaMethod'],
    icaSeed:            ['processing', 'icaSeed'],
    // ui slice
    interactionMode:    ['ui', 'interactionMode'],
    spectralMode:       ['ui', 'spectralMode'],
    spectralVisible:    ['ui', 'spectralVisible'],
    notepad:            ['ui', 'notepad'],
    cursorInfo:         ['ui', 'cursorInfo'],
    eventEditor:        ['ui', 'eventEditor'],
    measurementTool:    ['ui', 'measurementTool'],
    undoManager:        ['ui', 'undoManager'],
    channelManager:     ['ui', 'channelManager'],
    montageEditor:      ['ui', 'montageEditor'],
    recordingInfo:      ['ui', 'recordingInfo'],
    measurePointCount:  ['ui', 'measurePointCount'],
  };
}

function _installLegacyFlatShim(state) {
  var map = _flatLegacyMap();
  Object.keys(map).forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(state, key)) return; // never shadow real keys
    var path = map[key];
    Object.defineProperty(state, key, {
      configurable: true,
      enumerable: false,
      get: function () { return state[path[0]][path[1]]; },
      set: function (v) { state[path[0]][path[1]] = v; },
    });
  });
}

function _initState() {
  if (!window._qeegRawState) {
    var s = {
      display: {
        montage: 'referential',
        tStart: 0,
        windowSec: 10,
        sensitivity: 50,
        view: 'raw',
        channelOrdering: '10-20',
        regionTogglesByRegion: {
          frontal: true, central: true, temporal: true,
          parietal: true, occipital: true, other: true,
        },
        // Phase 3 — display-only additions for filter preview + custom montages.
        filterPreviewEnabled: false,
        savedMontages: [],          // [{ id, name, pairs: [{anode, cathode}, …] }]
        activeCustomMontageId: null,
        bandPreset: 'broadband',
        customBands: [],            // [{ id, name, low, high }]
      },
      processing: {
        badChannels: [],
        badSegments: [],
        excludedICA: [],
        includedICA: [],
        filterParams: { lff: 1.0, hff: 45.0, notch: 50 },
        channelInfo: null,
        icaData: null,
        hasUnsavedChanges: false,
        icaExpanded: false,
        icaMethod: 'picard',
        icaSeed: 42,
      },
      ai: {
        qualityScore: null,
        qualityNarrative: null,
        suggestions: [],
        lastAutoCleanRunId: null,
        suggestionsLoading: false,
      },
      ui: {
        interactionMode: 'select',
        spectralMode: 'psd',
        spectralVisible: false,
        notepad: '',
        cursorInfo: null,
        eventEditor: new EEGEventEditor(),
        measurementTool: new EEGMeasurementTool(),
        undoManager: new EEGUndoManager(),
        channelManager: null,
        montageEditor: null,
        recordingInfo: new EEGRecordingInfo(),
        measurePointCount: 0,
      },
    };
    _installLegacyFlatShim(s);
    window._qeegRawState = s;
  }
  return window._qeegRawState;
}

// Reset for tests / hot reloads. Not called in production.
function _resetStateForTest() {
  delete window._qeegRawState;
  return _initState();
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
  var isDemo = analysisId === 'demo';

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
      'Could not load channel information.<br><small>' + esc(String(err && err.message ? err.message : err || "Unknown error")) + '</small>');
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
    } catch (_) {
      showToast('Could not load saved cleaning config — starting with defaults', 'warning');
    }
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
    // Phase 4 \u2014 wrap the manual mark with a reason picker (10 reasons drawn
    // from the Phase 1 reason vocabulary). Picker resolves to null when the
    // clinician hits "Skip (mark unspecified)" \u2014 the segment is still saved
    // but with reason=null so legacy behavior is preserved.
    var seg = {
      start_sec: Math.round(startSec * 100) / 100,
      end_sec: Math.round(endSec * 100) / 100,
      description: 'BAD_user',
      reason: null,
      source: 'user',
      confidence: null,
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
    // Asynchronously prompt for the reason; mutating ``seg`` in-place updates
    // the same object already in state.badSegments and the undo manager.
    try {
      _promptBadSegmentReason().then(function (r) {
        if (r) {
          seg.reason = r;
          state.hasUnsavedChanges = true;
          _updateSegmentsList(state);
          _updateSaveIndicator(state);
        }
      });
    } catch (_e) { /* picker is best-effort */ }
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

  // Phase 7 — install drawer CSS, wire `?` help icons, ensure shortcuts modal
  _installPhase7Css();
  _wireHelpIcons(tabEl);

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

  // ── Group 1: DISPLAY ─────────────────────
  html += '<div class="toolbar-group" data-group="display">'
    + '<span class="toolbar-group-label">Display' + _PHASE7_HELP_BUTTON_HTML('montage') + '</span>'
    + '<div class="toolbar-group__controls">';

  // Montage  (Phase 3: linked-mastoid / CSD / REST + custom + saved-montages)
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Montage</label>'
    + '<select id="eeg-montage-sel" class="eeg-tb__select">'
    + '<option value="referential"' + (state.montage === 'referential' ? ' selected' : '') + '>Referential</option>'
    + '<option value="bipolar_long"' + (state.montage === 'bipolar_long' ? ' selected' : '') + '>Bipolar (Longitudinal)</option>'
    + '<option value="bipolar_trans"' + (state.montage === 'bipolar_trans' ? ' selected' : '') + '>Bipolar (Transverse)</option>'
    + '<option value="average"' + (state.montage === 'average' ? ' selected' : '') + '>Average Reference</option>'
    + '<option value="laplacian"' + (state.montage === 'laplacian' ? ' selected' : '') + '>Laplacian</option>'
    + '<option value="linked_mastoid"' + (state.montage === 'linked_mastoid' ? ' selected' : '') + '>Linked Mastoid (A1/A2)</option>'
    + '<option value="csd"' + (state.montage === 'csd' ? ' selected' : '') + '>CSD (Current Source Density)</option>'
    + '<option value="rest"' + (state.montage === 'rest' ? ' selected' : '') + '>REST</option>'
    + _renderSavedMontageOptions(state)
    + '<option value="__custom__">Custom Montage…</option>'
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

  // View
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">View</label>'
    + '<select id="eeg-view-sel" class="eeg-tb__select eeg-tb__select--narrow">'
    + '<option value="raw"' + (state.view === 'raw' ? ' selected' : '') + '>Raw</option>'
    + '<option value="cleaned"' + (state.view === 'cleaned' ? ' selected' : '') + '>Cleaned</option>'
    + '<option value="overlay"' + (state.view === 'overlay' ? ' selected' : '') + '>Overlay</option>'
    + '</select></div>';

  // Channel ordering (Phase 2)
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Order</label>'
    + '<select id="eeg-chord-sel" class="eeg-tb__select eeg-tb__select--narrow" title="Channel ordering">'
    + '<option value="10-20"' + (state.channelOrdering === '10-20' ? ' selected' : '') + '>10-20</option>'
    + '<option value="10-10"' + (state.channelOrdering === '10-10' ? ' selected' : '') + '>10-10</option>'
    + '<option value="alphabetical"' + (state.channelOrdering === 'alphabetical' ? ' selected' : '') + '>Alphabetical</option>'
    + '<option value="anatomical"' + (state.channelOrdering === 'anatomical' ? ' selected' : '') + '>Anatomical</option>'
    + '<option value="custom"' + (state.channelOrdering === 'custom' ? ' selected' : '') + '>Custom</option>'
    + '</select></div>';

  html += '</div></div>'; // /toolbar-group display

  // Visible vertical divider
  html += '<div class="toolbar-group-divider" aria-hidden="true"></div>';

  // ── Group 2: FILTERS ─────────────────────
  html += '<div class="toolbar-group" data-group="filters">'
    + '<span class="toolbar-group-label">Filters' + _PHASE7_HELP_BUTTON_HTML('bandpass') + '</span>'
    + '<div class="toolbar-group__controls">';

  // LFF
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">LFF</label>'
    + '<select id="eeg-lff-sel" class="eeg-tb__select eeg-tb__select--mini">'
    + _filterOpts([0.1, 0.3, 0.5, 1.0, 1.5, 2.0, 5.0, 10.0], state.filterParams.lff, 'Hz')
    + '</select></div>';
  // HFF
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">HFF</label>'
    + '<select id="eeg-hff-sel" class="eeg-tb__select eeg-tb__select--mini">'
    + _filterOpts([15, 20, 25, 30, 35, 40, 45, 50, 70, 100], state.filterParams.hff, 'Hz')
    + '</select></div>';
  // Notch
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Notch</label>'
    + '<select id="eeg-notch-sel" class="eeg-tb__select eeg-tb__select--mini">'
    + '<option value="0"' + (state.filterParams.notch === 0 ? ' selected' : '') + '>Off</option>'
    + '<option value="50"' + (state.filterParams.notch === 50 ? ' selected' : '') + '>50 Hz</option>'
    + '<option value="60"' + (state.filterParams.notch === 60 ? ' selected' : '') + '>60 Hz</option>'
    + '</select></div>';
  // Band preset (Phase 3 — built-in + user custom bands)
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Band</label>'
    + '<select id="eeg-band-preset-sel" class="eeg-tb__select eeg-tb__select--narrow" title="Band preset">'
    + _renderBandPresetOptions(state)
    + '</select></div>';

  // Filter Preview toggle (Phase 3)
  var fpOn = !!(state.display && state.display.filterPreviewEnabled);
  html += '<button class="eeg-tb__action-btn ' + (fpOn ? 'eeg-tb__action-btn--primary' : 'eeg-tb__action-btn--outline')
    + '" id="eeg-filter-preview-toggle" data-active="' + (fpOn ? '1' : '0') + '"'
    + ' title="Toggle filter preview" aria-pressed="' + (fpOn ? 'true' : 'false') + '">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    + ' Preview</button>';

  // Custom-band library button (Phase 3)
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-bands-btn" title="Custom band library">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>'
    + ' Bands ▾</button>';

  html += '</div></div>'; // /toolbar-group filters

  html += '<div class="toolbar-group-divider" aria-hidden="true"></div>';

  // ── Group 3: ARTIFACTS ────────────────────
  // Decomposition button toggles the existing ICA panel; the other three are
  // placeholders for Phase 4 (Auto Scan, Templates, Spike List).
  html += '<div class="toolbar-group" data-group="artifacts">'
    + '<span class="toolbar-group-label">Artifacts' + _PHASE7_HELP_BUTTON_HTML('auto_scan') + '</span>'
    + '<div class="toolbar-group__controls">'
    + '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-artifacts-autoscan-btn" data-phase="4" title="Auto-scan for artifacts (Phase 4)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    + ' Auto Scan</button>'
    + '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-artifacts-templates-btn" data-phase="4" title="Artifact templates (Phase 4)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
    + ' Templates</button>'
    + '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-artifacts-decomp-btn" title="Toggle ICA decomposition panel">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18"/><path d="M3 12h18"/><circle cx="12" cy="12" r="9"/></svg>'
    + ' Decomposition</button>'
    + '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-artifacts-spikes-btn" data-phase="4" title="Spike list (Phase 4)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
    + ' Spike List</button>'
    + '</div></div>'; // /toolbar-group artifacts

  html += '<div class="toolbar-group-divider" aria-hidden="true"></div>';

  // ── Group 4: TOOLS ──────────────────────
  html += '<div class="toolbar-group" data-group="tools">'
    + '<span class="toolbar-group-label">Tools' + _PHASE7_HELP_BUTTON_HTML('caliper') + '</span>'
    + '<div class="toolbar-group__controls">';
  // Cursor / Caliper / Event tool selector — preserves the existing eeg-tool-sel id
  html += '<div class="eeg-tb__group">'
    + '<label class="eeg-tb__label">Tool</label>'
    + '<select id="eeg-tool-sel" class="eeg-tb__select eeg-tb__select--narrow">'
    + '<option value="select"' + (state.interactionMode === 'select' ? ' selected' : '') + '>Cursor</option>'
    + '<option value="measure"' + (state.interactionMode === 'measure' ? ' selected' : '') + '>Caliper</option>'
    + '<option value="event"' + (state.interactionMode === 'event' ? ' selected' : '') + '>Event</option>'
    + '</select></div>';
  // Event-type picker (only visible when tool=event)
  html += '<div class="eeg-tb__group" id="eeg-event-picker-wrap" style="display:' + (state.interactionMode === 'event' ? 'flex' : 'none') + '">'
    + '<select id="eeg-event-type-sel" class="eeg-tb__select eeg-tb__select--narrow">';
  var evtTypes = EEGEventEditor.EVENT_TYPES;
  for (var eti = 0; eti < evtTypes.length; eti++) {
    html += '<option value="' + eti + '">' + esc(evtTypes[eti].label) + '</option>';
  }
  html += '</select></div>';
  // Find / Jump (Phase 2 placeholder — opens timeline jump prompt; wired below)
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-find-btn" title="Find / jump to time (G)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    + ' Find</button>';
  // Bookmark — adds a bookmark event at current window start
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-bookmark-btn" title="Bookmark current location">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>'
    + ' Bookmark</button>';
  // Export
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-export-btn" title="Export (CSV/PNG)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    + ' Export</button>';
  // Spectral toggle
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-spectral-toggle" title="Toggle Spectral Panel">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'
    + ' Spectral</button>';
  // Save
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-save-btn" title="Save cleaning config">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
    + ' Save</button>';
  // Reprocess
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--primary" id="eeg-reprocess-btn" title="Re-process with edits">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6"/><path d="M2.5 22v-6h6"/><path d="M2.5 12A10 10 0 0119 5.6"/><path d="M21.5 12A10 10 0 015 18.4"/></svg>'
    + ' Reprocess</button>';
  // Undo / Redo
  html += '<button class="eeg-tb__nav-btn" id="eeg-undo-btn" title="Undo (Ctrl+Z)" disabled>'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 105.08-11.37L1 10"/></svg>'
    + '</button>'
    + '<button class="eeg-tb__nav-btn" id="eeg-redo-btn" title="Redo (Ctrl+Y)" disabled>'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-5.08-11.37L23 10"/></svg>'
    + '</button>';
  // Snapshot
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-snapshot-btn" title="Snapshot PNG (S)">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    + ' Snapshot</button>';
  // Workbench (full-screen)
  html += '<button class="eeg-tb__action-btn eeg-tb__action-btn--outline" id="eeg-workbench-btn" title="Open full-screen workbench">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>'
    + ' Workbench</button>';
  html += '</div></div>'; // /toolbar-group tools

  // Page navigation lives outside the four named clusters (cross-cutting).
  html += '<div class="eeg-tb__spacer"></div>';
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

  // Timeline overview strip
  html += _buildTimelineOverview(state);

  // Right sidebar
  html += '<div class="eeg-viewer__sidebar" id="eeg-sidebar">';
  // Phase 2: Quality Scorecard sits above Recording Info.
  html += _buildQualityScorecardSection(state);
  html += _buildRecordingInfoSection(state);
  html += _buildBandPowerSection(state);
  html += _buildEpochStatsSection(state);
  html += _buildMontageDiagramSection(state);
  html += _buildCorrelationSection(state);
  html += _buildChannelSection(state);
  html += _buildSegmentsSection(state);
  html += _buildEventsSection(state);
  html += _buildNotepadSection(state);
  html += _buildICASection(state);
  html += '</div>';

  html += '</div>'; // body

  // ── Status bar
  html += '<div class="eeg-viewer__statusbar">'
    + '<span>Scroll: navigate \u00B7 Ctrl+Scroll: zoom \u00B7 Click label: toggle bad \u00B7 Drag: annotate \u00B7 Ctrl+Z/Y: undo/redo \u00B7 ?: shortcuts</span>'
    + '<span id="eeg-save-indicator"></span>'
    + '</div>';

  // ── Shortcuts help overlay (hidden by default)
  html += _buildShortcutsHelp();

  html += '</div>'; // eeg-viewer

  return html;
}

function _filterOpts(values, selected, unit) {
  return values.map(function (v) {
    return '<option value="' + v + '"' + (Math.abs(selected - v) < 0.01 ? ' selected' : '') + '>' + v + ' ' + unit + '</option>';
  }).join('');
}

// ── Phase 3 helpers — saved montages, custom bands, persistence ─────────────

var _BUILTIN_BANDS = [
  { id: 'broadband', name: 'Broadband', low: null, high: null },
  { id: 'delta', name: 'Delta',  low: 1,  high: 4 },
  { id: 'theta', name: 'Theta',  low: 4,  high: 8 },
  { id: 'alpha', name: 'Alpha',  low: 8,  high: 13 },
  { id: 'beta',  name: 'Beta',   low: 13, high: 30 },
  { id: 'gamma', name: 'Gamma',  low: 30, high: 80 },
];

function _qeegStorageKey(prefix) {
  var uid = 'anon';
  try {
    if (typeof window !== 'undefined') {
      uid = (window._qeegUserId || (window.localStorage && window.localStorage.getItem('userId')) || 'anon');
    }
  } catch (_e) { uid = 'anon'; }
  return prefix + '_' + uid;
}

function _loadSavedMontages() {
  try {
    var raw = window.localStorage.getItem(_qeegStorageKey('qeegSavedMontages'));
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) { return []; }
}

function _persistSavedMontages(arr) {
  try {
    window.localStorage.setItem(_qeegStorageKey('qeegSavedMontages'), JSON.stringify(arr || []));
  } catch (_e) { /* localStorage unavailable */ }
}

function _loadCustomBands() {
  try {
    var raw = window.localStorage.getItem('qeegCustomBands');
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_e) { return []; }
}

function _persistCustomBands(arr) {
  try {
    window.localStorage.setItem('qeegCustomBands', JSON.stringify(arr || []));
  } catch (_e) { /* noop */ }
}

function _renderSavedMontageOptions(state) {
  var saved = (state.display && Array.isArray(state.display.savedMontages))
    ? state.display.savedMontages : [];
  if (!saved.length) return '';
  var s = '<optgroup label="Saved montages">';
  for (var i = 0; i < saved.length; i++) {
    var m = saved[i];
    if (!m || !m.id) continue;
    var key = 'saved:' + m.id;
    var sel = (state.display.activeCustomMontageId === m.id) ? ' selected' : '';
    s += '<option value="' + esc(key) + '"' + sel + '>' + esc(m.name || ('Custom ' + (i + 1))) + '</option>';
  }
  s += '</optgroup>';
  return s;
}

function _allBands(state) {
  var custom = (state.display && Array.isArray(state.display.customBands))
    ? state.display.customBands : [];
  return _BUILTIN_BANDS.concat(custom);
}

function _renderBandPresetOptions(state) {
  var bands = _allBands(state);
  var current = (state.display && state.display.bandPreset) || 'broadband';
  var html = '';
  for (var i = 0; i < bands.length; i++) {
    var b = bands[i];
    if (!b || !b.id) continue;
    html += '<option value="' + esc(b.id) + '"' + (current === b.id ? ' selected' : '') + '>' + esc(b.name || b.id) + '</option>';
  }
  return html;
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
    + '<div class="eeg-sb__title">Channels <span class="eeg-sb__count">' + channels.length + '</span>' + _PHASE7_HELP_BUTTON_HTML('bad_channel_marking') + '</div>'
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
        + '<span class="eeg-sb__ch-quality" data-ch-q="' + esc(ch) + '"></span>'
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
    + '<div class="eeg-sb__title">Bad Segments <span class="eeg-sb__count">' + state.badSegments.length + '</span>' + _PHASE7_HELP_BUTTON_HTML('bad_segment_marking') + '</div>'
    + '<div class="eeg-sb__seg-list" id="eeg-segments">'
    + (items || '<div class="eeg-sb__hint">Drag on waveform to annotate</div>')
    + '</div></div>';
}

function _buildICASection(state) {
  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title eeg-sb__title--click" id="eeg-ica-toggle">'
    + 'ICA Components '
    + '<span class="eeg-sb__hint-inline">' + (state.icaExpanded ? 'collapse' : 'expand') + '</span>'
    + _PHASE7_HELP_BUTTON_HTML('ica_review')
    + '</div>'
    + '<div id="eeg-ica-content">'
    + (state.icaExpanded && state.icaData ? _renderICAGrid(state) : '')
    + '</div></div>';
}

// ── Band Power section ──────────────────────────────────────────────────────
// Clinical EEG frequency bands
var BAND_DEFS = [
  { name: 'Delta',  lo: 1,  hi: 4,  color: '#ab47bc', desc: '1–4 Hz \u2014 deep sleep, infants' },
  { name: 'Theta',  lo: 4,  hi: 8,  color: '#42a5f5', desc: '4–8 Hz \u2014 drowsiness, meditation' },
  { name: 'Alpha',  lo: 8,  hi: 13, color: '#66bb6a', desc: '8–13 Hz \u2014 relaxed awareness' },
  { name: 'Beta',   lo: 13, hi: 30, color: '#ffa726', desc: '13–30 Hz \u2014 active thinking' },
  { name: 'Gamma',  lo: 30, hi: 60, color: '#ef5350', desc: '30–60 Hz \u2014 high-level cognition' },
];

function _buildBandPowerSection(state) {
  var bars = BAND_DEFS.map(function (b) {
    return '<div class="eeg-sb__bp-row" data-band="' + b.name.toLowerCase() + '">'
      + '<div class="eeg-sb__bp-label">'
      + '<span class="eeg-sb__bp-dot" style="background:' + b.color + '"></span>'
      + b.name + '</div>'
      + '<div class="eeg-sb__bp-bar-wrap">'
      + '<div class="eeg-sb__bp-bar" style="width:0%;background:' + b.color + '"></div>'
      + '</div>'
      + '<div class="eeg-sb__bp-val">--%</div>'
      + '</div>';
  }).join('');

  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Band Power <span class="eeg-sb__hint-inline">visible window</span></div>'
    + '<div class="eeg-sb__bp-list" id="eeg-bandpower">' + bars + '</div>'
    + '<div class="eeg-sb__bp-legend">Relative power across all channels</div>'
    + '</div>';
}

function _updateBandPower(state, renderer) {
  var container = document.getElementById('eeg-bandpower');
  if (!container || !renderer || !renderer.data) return;

  var data = renderer.data;
  var sfreq = renderer.sfreq || 256;
  if (!data.length || !data[0] || !data[0].length) return;

  // Compute PSD for each channel and average
  var nfft = 1;
  while (nfft < data[0].length) nfft <<= 1;
  var bandSums = BAND_DEFS.map(function () { return 0; });
  var totalPower = 0;
  var validCh = 0;

  for (var ci = 0; ci < data.length; ci++) {
    if (!data[ci] || !data[ci].length) continue;
    try {
      var psd = _computePSD(data[ci], sfreq, nfft);
      var freqs = psd.freqs;
      var power = psd.power;
      var chTotal = 0;
      for (var k = 0; k < freqs.length; k++) chTotal += power[k];
      if (chTotal <= 0) continue;
      for (var bi = 0; bi < BAND_DEFS.length; bi++) {
        var b = BAND_DEFS[bi];
        var bandPow = 0;
        for (var k = 0; k < freqs.length; k++) {
          if (freqs[k] >= b.lo && freqs[k] < b.hi) bandPow += power[k];
        }
        bandSums[bi] += bandPow / chTotal;
      }
      validCh++;
    } catch (_) {}
  }

  if (validCh === 0) return;

  // Average across channels and normalise so max ≈ 100%
  var avgBands = bandSums.map(function (s) { return s / validCh; });
  var maxVal = Math.max.apply(null, avgBands);
  if (maxVal <= 0) maxVal = 1;

  // Find dominant band
  var domIdx = 0;
  for (var i = 1; i < avgBands.length; i++) if (avgBands[i] > avgBands[domIdx]) domIdx = i;

  var rows = container.querySelectorAll('.eeg-sb__bp-row');
  for (var ri = 0; ri < rows.length && ri < BAND_DEFS.length; ri++) {
    var pct = avgBands[ri];
    var bar = rows[ri].querySelector('.eeg-sb__bp-bar');
    var val = rows[ri].querySelector('.eeg-sb__bp-val');
    if (bar) bar.style.width = Math.min(100, (pct / maxVal * 100)).toFixed(1) + '%';
    if (val) val.textContent = (pct * 100).toFixed(1) + '%';
    rows[ri].style.opacity = ri === domIdx ? '1' : '0.65';
  }
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
      + (c.topomap_b64 && String(c.topomap_b64).indexOf('data:image/') === 0 ? '<img src="' + esc(c.topomap_b64) + '" class="eeg-sb__ica-topo">' : '<div class="eeg-sb__ica-topo-ph">IC' + c.index + '</div>')
      + '<div class="eeg-sb__ica-info">'
      + '<span class="eeg-sb__ica-badge ' + labelClass + '">IC' + c.index + ': ' + esc(maxLabel) + ' ' + (maxProb * 100).toFixed(0) + '%</span>'
      + '</div>'
      + '<button class="eeg-sb__ica-btn" data-ica-idx="' + c.index + '">' + (isExcluded ? 'Keep' : 'Reject') + '</button>'
      + '</div>';
  }).join('');

  return '<div class="eeg-sb__ica-grid">' + items + '</div>';
}

// ── v2 section builders ─────────────────────────────────────────────────────

function _buildCorrelationSection(state) {
  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Correlation <span class="eeg-sb__hint-inline">current window</span></div>'
    + '<div class="eeg-sb__corr" id="eeg-corr-matrix">'
    + '<div class="eeg-sb__hint">Load signal to see correlation matrix</div>'
    + '</div></div>';
}

function _updateCorrelationMatrix(state, channels, data) {
  var container = document.getElementById('eeg-corr-matrix');
  if (!container || !channels || !data || channels.length < 2) return;
  // Compute Pearson correlation for first 8 channels (to keep it small)
  var n = Math.min(channels.length, 8);
  var cors = [];
  for (var i = 0; i < n; i++) {
    cors[i] = [];
    for (var j = 0; j < n; j++) {
      if (!data[i] || !data[j] || !data[i].length || !data[j].length) { cors[i][j] = 0; continue; }
      var meanI = 0, meanJ = 0;
      for (var k = 0; k < data[i].length; k++) meanI += data[i][k];
      for (var k = 0; k < data[j].length; k++) meanJ += data[j][k];
      meanI /= data[i].length; meanJ /= data[j].length;
      var num = 0, denI = 0, denJ = 0;
      var len = Math.min(data[i].length, data[j].length);
      for (var k = 0; k < len; k++) {
        var di = data[i][k] - meanI;
        var dj = data[j][k] - meanJ;
        num += di * dj;
        denI += di * di;
        denJ += dj * dj;
      }
      var den = Math.sqrt(denI * denJ);
      cors[i][j] = den > 0 ? num / den : 0;
    }
  }
  // Build mini heatmap grid
  var cellSize = Math.max(12, Math.floor(140 / n));
  var html = '<div style="display:grid;grid-template-columns:repeat(' + n + ',' + cellSize + 'px);gap:1px;">';
  for (var i = 0; i < n; i++) {
    for (var j = 0; j < n; j++) {
      var r = cors[i][j];
      var absR = Math.abs(r);
      var hue = r >= 0 ? 160 : 0; // teal for positive, red for negative
      var sat = Math.min(100, absR * 100);
      var light = 15 + (1 - absR) * 15;
      var color = 'hsl(' + hue + ',' + sat.toFixed(0) + '%,' + light.toFixed(0) + '%)';
      var title = esc(channels[i]) + ' \u2194 ' + esc(channels[j]) + '  r=' + r.toFixed(2);
      html += '<div style="width:' + cellSize + 'px;height:' + cellSize + 'px;background:' + color + ';border-radius:2px;" title="' + title + '"></div>';
    }
  }
  html += '</div>';
  // Labels
  html += '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:8px;color:#475569;font-family:monospace">';
  for (var i = 0; i < n; i++) html += '<span style="width:' + cellSize + 'px;text-align:center;overflow:hidden;text-overflow:ellipsis">' + esc(channels[i]) + '</span>';
  html += '</div>';
  container.innerHTML = html;
}

function _buildMontageDiagramSection(state) {
  var info = state.channelInfo || {};
  var channels = (info.channels || []).map(function (ch) { return ch.name; });
  var mapHtml = '';
  try {
    mapHtml = renderBrainMap10_20({ size: 180, highlightSites: channels, showZones: false });
  } catch (_) { mapHtml = '<div class="eeg-sb__hint">Montage map unavailable</div>'; }
  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Montage <span class="eeg-sb__hint-inline">10–20</span></div>'
    + '<div class="eeg-sb__montage" id="eeg-montage-diagram">' + mapHtml + '</div>'
    + '</div>';
}

function _updateMontageDiagram(state) {
  var container = document.getElementById('eeg-montage-diagram');
  if (!container) return;
  var info = state.channelInfo || {};
  var channels = (info.channels || []).map(function (ch) { return ch.name; });
  try {
    container.innerHTML = renderBrainMap10_20({ size: 180, highlightSites: channels, showZones: false });
  } catch (_) {}
}

function _buildEpochStatsSection(state) {
  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Epoch Stats <span class="eeg-sb__hint-inline">current window</span></div>'
    + '<div class="eeg-sb__stats" id="eeg-epoch-stats">'
    + '<div class="eeg-sb__hint">Load signal to see statistics</div>'
    + '</div></div>';
}

function _updateEpochStats(state, channels, data) {
  var container = document.getElementById('eeg-epoch-stats');
  if (!container || !channels || !data) return;
  var rows = channels.map(function (ch, ci) {
    var vals = data[ci];
    if (!vals || !vals.length) return '<div class="eeg-sb__stat-row"><span class="eeg-sb__stat-ch">' + esc(ch) + '</span><span class="eeg-sb__stat-val">--</span></div>';
    var min = vals[0], max = vals[0], sum = 0;
    for (var i = 0; i < vals.length; i++) {
      if (vals[i] < min) min = vals[i];
      if (vals[i] > max) max = vals[i];
      sum += vals[i];
    }
    var mean = sum / vals.length;
    var sqSum = 0;
    for (var i = 0; i < vals.length; i++) sqSum += (vals[i] - mean) * (vals[i] - mean);
    var sd = Math.sqrt(sqSum / vals.length);
    var range = max - min;
    return '<div class="eeg-sb__stat-row" title="Mean ' + mean.toFixed(1) + ' \u00B5V  \u00B7  SD ' + sd.toFixed(1) + '">'
      + '<span class="eeg-sb__stat-ch">' + esc(ch) + '</span>'
      + '<span class="eeg-sb__stat-val">' + range.toFixed(0) + ' \u00B5V</span>'
      + '</div>';
  }).join('');
  container.innerHTML = '<div class="eeg-sb__stats-head"><span>Ch</span><span>Range</span></div>' + rows;
}

// ── Phase 2: Recording Quality scorecard ───────────────────────────────────
//
// Deterministic-only metrics — line noise, blink density, channel agreement.
// Phase 5 will extend this with AI-powered narrative + impedance + motion.
// The shell renders even before the first signal window has loaded so the
// clinician sees what is coming. _computeDeterministicQuality(state) returns
// { score, subscores, narrative } and is exported for unit tests.

function _buildQualityScorecardSection(_state) {
  return '<section class="quality-scorecard" id="quality-scorecard">'
    + '<h3>Recording Quality' + _PHASE7_HELP_BUTTON_HTML('ai_quality_score') + '</h3>'
    + '<div class="quality-score-big" id="quality-score-big">--</div>'
    + '<div class="quality-subscores">'
    + '<div data-metric="impedance">Impedance: <span>--</span></div>'
    + '<div data-metric="line_noise">Line noise: <span>--</span></div>'
    + '<div data-metric="blink_density">Blinks: <span>--</span></div>'
    + '<div data-metric="motion">Motion: <span>--</span></div>'
    + '<div data-metric="channel_agreement">Channel agreement: <span>--</span></div>'
    + '</div>'
    + '<p class="quality-narrative" id="quality-narrative">Quality assessment will compute when signal is loaded.</p>'
    + '</section>';
}

// _computePSD is imported from eeg-spectral-panel.js. We keep the math
// inline + small so quality scoring is testable in isolation.
function _qsBandPower(power, freqs, lo, hi) {
  var p = 0;
  for (var k = 0; k < freqs.length; k++) {
    if (freqs[k] >= lo && freqs[k] < hi) p += power[k];
  }
  return p;
}

function _qsLineNoiseLabel(ratio) {
  if (ratio == null || !isFinite(ratio)) return '--';
  if (ratio < 0.05) return 'Low';
  if (ratio < 0.15) return 'Med';
  return 'High';
}

function _qsLineNoiseScore(ratio) {
  if (ratio == null || !isFinite(ratio)) return 50;
  if (ratio < 0.05) return 90;
  if (ratio < 0.15) return 60;
  return 25;
}

function _qsBlinkScore(perMin) {
  if (perMin == null || !isFinite(perMin)) return 50;
  // 0–0.5/min ≈ excellent; 2/min ≈ borderline; >5/min poor.
  if (perMin < 0.5) return 90;
  if (perMin < 2) return 70;
  if (perMin < 5) return 50;
  return 25;
}

function _qsAgreementScore(fraction) {
  // Fraction of channel pairs with alpha-band correlation > 0.3.
  if (fraction == null || !isFinite(fraction)) return 50;
  // 0.3 of pairs ~ borderline; 0.6+ healthy.
  return Math.max(0, Math.min(100, fraction * 120));
}

function _pearson(a, b) {
  var n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  var ma = 0, mb = 0;
  for (var i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  var num = 0, da = 0, db = 0;
  for (var j = 0; j < n; j++) {
    var x = a[j] - ma, y = b[j] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  var d = Math.sqrt(da * db);
  return d > 0 ? num / d : 0;
}

function _computeDeterministicQuality(state) {
  // Inputs come from state.channelInfo (sfreq) + the most-recent renderer
  // payload, which we stash in state.processing._lastSignal whenever
  // _loadSignalWindow finishes. We only score the metrics the deterministic
  // path can compute today — impedance + motion stay '--' until Phase 5
  // wires AI inputs.
  var snapshot = (state.processing && state.processing._lastSignal) || null;
  var subscores = {
    line_noise: '--',
    blink_density: '--',
    channel_agreement: '--',
    motion: '--',
    impedance: '--',
  };
  var rawScores = { line_noise: null, blink_density: null, channel_agreement: null, motion: null, impedance: null };

  // Line noise — peak around 50 Hz and 60 Hz vs total power.
  if (snapshot && snapshot.data && snapshot.data.length && snapshot.sfreq > 0) {
    var data = snapshot.data;
    var sfreq = snapshot.sfreq;
    var nfft = 1; while (nfft < data[0].length) nfft <<= 1;
    var maxRatio = 0;
    var ratios = [];
    for (var ci = 0; ci < data.length; ci++) {
      if (!data[ci] || data[ci].length < 16) continue;
      try {
        var psd = _computePSD(data[ci], sfreq, nfft);
        var freqs = psd.freqs, power = psd.power;
        var total = 0;
        for (var k = 0; k < freqs.length; k++) total += power[k];
        if (total <= 0) continue;
        var noisePow = _qsBandPower(power, freqs, 49.5, 50.5)
                     + _qsBandPower(power, freqs, 59.5, 60.5);
        var r = noisePow / total;
        ratios.push(r);
        if (r > maxRatio) maxRatio = r;
      } catch (_) {}
    }
    if (ratios.length) {
      subscores.line_noise = _qsLineNoiseLabel(maxRatio);
      rawScores.line_noise = _qsLineNoiseScore(maxRatio);
    }

    // Channel agreement — fraction of pairs with alpha-band correlation > 0.3.
    var nCh = data.length;
    if (nCh >= 2) {
      var pairCount = 0, hits = 0;
      var maxPairs = 60; // bound the work
      for (var i = 0; i < nCh && pairCount < maxPairs; i++) {
        for (var j = i + 1; j < nCh && pairCount < maxPairs; j++) {
          if (!data[i] || !data[j]) continue;
          var corr = _pearson(data[i], data[j]);
          if (corr > 0.3) hits++;
          pairCount++;
        }
      }
      if (pairCount > 0) {
        var frac = hits / pairCount;
        subscores.channel_agreement = (frac * 100).toFixed(0) + '%';
        rawScores.channel_agreement = _qsAgreementScore(frac);
      }
    }
  }

  // Blink density — count BAD_user / blink-tagged segments per minute of
  // current signal window. Conservative: only segments whose description
  // contains "blink" or starts with "BAD_user" feed the count.
  var blinkPerMin = null;
  var segs = (state.processing && state.processing.badSegments) || state.badSegments || [];
  if (segs && segs.length && snapshot && snapshot.data && snapshot.data[0] && snapshot.sfreq) {
    var winSec = snapshot.data[0].length / snapshot.sfreq;
    if (winSec > 0) {
      var blinks = 0;
      for (var s = 0; s < segs.length; s++) {
        var d = (segs[s].description || '').toLowerCase();
        if (d.indexOf('blink') >= 0 || d.indexOf('bad_user') >= 0) blinks++;
      }
      blinkPerMin = blinks / (winSec / 60);
      subscores.blink_density = blinkPerMin.toFixed(1) + '/min';
      rawScores.blink_density = _qsBlinkScore(blinkPerMin);
    }
  } else if (segs) {
    // Even without a snapshot, expose a count-based proxy for tests.
    if (segs.length === 0) subscores.blink_density = '0.0/min';
  }

  // Composite — weighted score, missing components default to 50.
  var weights = { line_noise: 25, blink_density: 20, channel_agreement: 35, motion: 10, impedance: 10 };
  var totalW = 0, totalS = 0;
  Object.keys(weights).forEach(function (key) {
    var w = weights[key];
    var s = rawScores[key] != null ? rawScores[key] : 50;
    totalS += s * w;
    totalW += w;
  });
  var composite = totalW > 0 ? Math.round(totalS / totalW) : null;

  // Narrative — a short sentence summarising the deterministic signal.
  var bits = [];
  if (subscores.line_noise !== '--') bits.push('line noise ' + subscores.line_noise.toLowerCase());
  if (subscores.channel_agreement !== '--') bits.push('channel agreement ' + subscores.channel_agreement);
  if (subscores.blink_density !== '--') bits.push('blink density ' + subscores.blink_density);
  var narrative = bits.length
    ? 'Deterministic metrics — ' + bits.join(', ') + '. Impedance and motion will populate once AI assist runs.'
    : 'Quality assessment will compute when signal is loaded.';

  return { score: composite, subscores: subscores, narrative: narrative };
}

function _updateQualityScorecard(state) {
  var q = _computeDeterministicQuality(state);
  if (state.ai) {
    state.ai.qualityScore = q.score;
    state.ai.qualityNarrative = q.narrative;
  }
  var bigEl = document.getElementById('quality-score-big');
  if (bigEl) bigEl.textContent = q.score == null ? '--' : String(q.score);
  var card = document.getElementById('quality-scorecard');
  if (card) {
    Object.keys(q.subscores).forEach(function (key) {
      var row = card.querySelector('[data-metric="' + key + '"] span');
      if (row) row.textContent = q.subscores[key];
    });
  }
  var narEl = document.getElementById('quality-narrative');
  if (narEl) narEl.textContent = q.narrative;
}

function _buildRecordingInfoSection(state) {
  var info = state.channelInfo || {};
  var fp = state.filterParams || {};
  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Recording Info</div>'
    + '<div class="eeg-sb__rec-info">'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Channels</span><span class="eeg-sb__rec-val">' + (info.n_channels || 0) + '</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Sfreq</span><span class="eeg-sb__rec-val">' + (info.sfreq || 0) + ' Hz</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Duration</span><span class="eeg-sb__rec-val">' + _formatDuration(info.duration_sec || 0) + '</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Samples</span><span class="eeg-sb__rec-val">' + (info.n_samples || 0).toLocaleString() + '</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">LFF</span><span class="eeg-sb__rec-val" id="eeg-rec-lff">' + (fp.lff != null ? fp.lff + ' Hz' : '—') + '</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">HFF</span><span class="eeg-sb__rec-val" id="eeg-rec-hff">' + (fp.hff != null ? fp.hff + ' Hz' : '—') + '</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Notch</span><span class="eeg-sb__rec-val" id="eeg-rec-notch">' + (fp.notch ? fp.notch + ' Hz' : 'Off') + '</span></div>'
    + '<div class="eeg-sb__rec-row"><span class="eeg-sb__rec-label">Montage</span><span class="eeg-sb__rec-val" id="eeg-rec-montage">' + (state.montage || 'referential') + '</span></div>'
    + '</div></div>';
}

function _buildNotepadSection(state) {
  var notes = state.notepad || '';
  return '<div class="eeg-sb__section">'
    + '<div class="eeg-sb__title">Notepad</div>'
    + '<textarea class="eeg-sb__notepad" id="eeg-notepad" placeholder="Clinical observations, impressions, notes...">' + esc(notes) + '</textarea>'
    + '<div class="eeg-sb__notepad-hint">Auto-saved to session</div>'
    + '</div>';
}

function _buildEventsSection(state) {
  var events = state.eventEditor ? state.eventEditor.getEvents() : [];
  var items = events.map(function (evt, idx) {
    return '<div class="eeg-sb__evt-item">'
      + '<span class="eeg-sb__evt-dot" style="background:' + (evt.color && /^#[0-9a-fA-F]{3,8}$/.test(evt.color) ? evt.color : '#4caf50') + '"></span>'
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

// ── Timeline overview strip ─────────────────────────────────────────────────

function _buildTimelineOverview(state) {
  var dur = (state.channelInfo || {}).duration_sec || 0;
  return '<div class="eeg-timeline" id="eeg-timeline">'
    + '<div class="eeg-timeline__track" id="eeg-timeline-track" title="Click to jump">'
    + '<div class="eeg-timeline__window" id="eeg-timeline-window"></div>'
    + '<div class="eeg-timeline__segments" id="eeg-timeline-segments"></div>'
    + '<div class="eeg-timeline__events" id="eeg-timeline-events"></div>'
    + '</div>'
    + '<div class="eeg-timeline__labels">'
    + '<span class="eeg-timeline__label" id="eeg-timeline-start">0s</span>'
    + '<span class="eeg-timeline__label" id="eeg-timeline-cur">---</span>'
    + '<span class="eeg-timeline__label" id="eeg-timeline-end">' + _formatDuration(dur) + '</span>'
    + '</div></div>';
}

function _updateTimelineOverview(state) {
  var dur = (state.channelInfo || {}).duration_sec || 0;
  if (!dur) return;
  var winEl = document.getElementById('eeg-timeline-window');
  var segContainer = document.getElementById('eeg-timeline-segments');
  var evtContainer = document.getElementById('eeg-timeline-events');
  var curLabel = document.getElementById('eeg-timeline-cur');
  if (winEl) {
    var leftPct = (state.tStart / dur) * 100;
    var widthPct = (state.windowSec / dur) * 100;
    winEl.style.left = Math.max(0, Math.min(100, leftPct)) + '%';
    winEl.style.width = Math.max(0.5, Math.min(100, widthPct)) + '%';
  }
  if (curLabel) curLabel.textContent = _formatDuration(state.tStart) + ' – ' + _formatDuration(Math.min(dur, state.tStart + state.windowSec));
  if (segContainer) {
    segContainer.innerHTML = state.badSegments.map(function (seg) {
      var left = (seg.start_sec / dur) * 100;
      var width = ((seg.end_sec - seg.start_sec) / dur) * 100;
      return '<div class="eeg-timeline__seg" style="left:' + left + '%;width:' + width + '%"></div>';
    }).join('');
  }
  if (evtContainer) {
    var events = state.eventEditor ? state.eventEditor.getEvents() : [];
    evtContainer.innerHTML = events.map(function (evt) {
      var left = (evt.time / dur) * 100;
      return '<div class="eeg-timeline__evt" style="left:' + left + '%;background:' + (evt.color && /^#[0-9a-fA-F]{3,8}$/.test(evt.color) ? evt.color : '#4caf50') + '" title="' + esc(evt.label) + ' @ ' + evt.time.toFixed(1) + 's"></div>';
    }).join('');
  }
}

// ── Shortcuts help overlay ──────────────────────────────────────────────────

function _buildShortcutsHelp() {
  var rows = [
    { key: '\u2190 / \u2192', desc: 'Previous / next page (Shift = \u00D75)' },
    { key: '\u2191 / \u2193', desc: 'Zoom in / out (sensitivity)' },
    { key: 'Home / End', desc: 'First / last page' },
    { key: 'J / K', desc: 'Previous / next event' },
    { key: 'S', desc: 'Snapshot PNG' },
    { key: 'Ctrl+Z', desc: 'Undo' },
    { key: 'Ctrl+Y', desc: 'Redo' },
    { key: '?', desc: 'Toggle this help' },
  ];
  return '<div class="eeg-help" id="eeg-help" style="display:none">'
    + '<div class="eeg-help__panel">'
    + '<div class="eeg-help__header">Keyboard Shortcuts <button class="eeg-help__close" id="eeg-help-close">\u00D7</button></div>'
    + '<div class="eeg-help__body">' + rows.map(function (r) {
      return '<div class="eeg-help__row"><kbd>' + r.key + '</kbd><span>' + esc(r.desc) + '</span></div>';
    }).join('') + '</div>'
    + '</div></div>';
}

function _showShortcutsHelp() {
  var el = document.getElementById('eeg-help');
  if (el) el.style.display = 'flex';
}
function _hideShortcutsHelp() {
  var el = document.getElementById('eeg-help');
  if (el) el.style.display = 'none';
}

// ── Data loading ────────────────────────────────────────────────────────────

async function _loadSignalWindow(analysisId, state, renderer, spectralPanel) {
  var isDemo = analysisId === 'demo';
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
      // Compute channel quality and band power
      _computeChannelQuality(state, demoData.channels, demoData.data, demoData.sfreq, renderer);
      _updateBandPower(state, renderer);
      _updateEpochStats(state, demoData.channels, demoData.data);
      _updateCorrelationMatrix(state, demoData.channels, demoData.data);
      _updateMontageDiagram(state);
      _updateTimelineOverview(state);
      // Phase 2: stash signal snapshot + recompute deterministic quality.
      state.processing._lastSignal = { channels: demoData.channels, data: demoData.data, sfreq: demoData.sfreq, tStart: demoData.t_start };
      _updateQualityScorecard(state);
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
    // Compute channel quality and band power
    if (_lastChannels) _computeChannelQuality(state, _lastChannels, _lastData, _lastSfreq, renderer);
    _updateBandPower(state, renderer);
    if (_lastChannels) _updateEpochStats(state, _lastChannels, _lastData);
    if (_lastChannels) _updateCorrelationMatrix(state, _lastChannels, _lastData);
    _updateMontageDiagram(state);
    _updateTimelineOverview(state);
    // Phase 2: stash signal snapshot + recompute deterministic quality.
    if (_lastChannels) {
      state.processing._lastSignal = { channels: _lastChannels, data: _lastData, sfreq: _lastSfreq, tStart: _lastTStart };
      _updateQualityScorecard(state);
    }
  } catch (err) {
    showToast('Signal load failed: ' + (err.message || err), 'error');
  }
}

// ── Toolbar wiring ──────────────────────────────────────────────────────────

function _wireToolbar(analysisId, state, renderer, spectralPanel) {
  var isDemo = _isDemoMode() && analysisId === 'demo';
  var MONTAGE_LABELS = {
    referential: 'Referential',
    bipolar_long: 'Bipolar (Long)',
    bipolar_trans: 'Bipolar (Trans)',
    average: 'Average Ref',
    laplacian: 'Laplacian',
    linked_mastoid: 'Linked Mastoid',
    csd: 'CSD',
    rest: 'REST',
  };

  // Montage  (Phase 3: handles __custom__, saved:<id>, and the new montages)
  var montageSel = document.getElementById('eeg-montage-sel');
  if (montageSel) montageSel.onchange = function () {
    var v = montageSel.value;
    if (v === '__custom__') {
      _openCustomMontageModal(analysisId, state, renderer, spectralPanel);
      // Restore previous selection while modal is open.
      montageSel.value = state.display.activeCustomMontageId
        ? ('saved:' + state.display.activeCustomMontageId)
        : (state.montage || 'referential');
      return;
    }
    if (v && v.indexOf('saved:') === 0) {
      var sid = v.slice('saved:'.length);
      _applySavedMontage(sid, state, renderer);
      _loadSignalWindow(analysisId, state, renderer, spectralPanel);
      return;
    }
    state.display.activeCustomMontageId = null;
    state.montage = v;
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
  if (lffSel) lffSel.onchange = function () { state.filterParams.lff = parseFloat(lffSel.value); state.hasUnsavedChanges = true; _updateSaveIndicator(state); var rl = document.getElementById('eeg-rec-lff'); if (rl) rl.textContent = state.filterParams.lff + ' Hz'; _maybeFilterPreview(analysisId, state); };
  if (hffSel) hffSel.onchange = function () { state.filterParams.hff = parseFloat(hffSel.value); state.hasUnsavedChanges = true; _updateSaveIndicator(state); var rh = document.getElementById('eeg-rec-hff'); if (rh) rh.textContent = state.filterParams.hff + ' Hz'; _maybeFilterPreview(analysisId, state); };
  if (notchSel) notchSel.onchange = function () { state.filterParams.notch = parseFloat(notchSel.value); state.hasUnsavedChanges = true; _updateSaveIndicator(state); var rn = document.getElementById('eeg-rec-notch'); if (rn) rn.textContent = state.filterParams.notch ? state.filterParams.notch + ' Hz' : 'Off'; _maybeFilterPreview(analysisId, state); };

  // Phase 3 — filter-preview toggle
  var fpToggle = document.getElementById('eeg-filter-preview-toggle');
  if (fpToggle) fpToggle.addEventListener('click', function () {
    state.display.filterPreviewEnabled = !state.display.filterPreviewEnabled;
    fpToggle.dataset.active = state.display.filterPreviewEnabled ? '1' : '0';
    fpToggle.setAttribute('aria-pressed', state.display.filterPreviewEnabled ? 'true' : 'false');
    fpToggle.classList.toggle('eeg-tb__action-btn--primary', state.display.filterPreviewEnabled);
    fpToggle.classList.toggle('eeg-tb__action-btn--outline', !state.display.filterPreviewEnabled);
    if (state.display.filterPreviewEnabled) _maybeFilterPreview(analysisId, state);
    else _hideFilterPreview();
  });

  // Phase 3 — band preset
  var bandSel = document.getElementById('eeg-band-preset-sel');
  if (bandSel) bandSel.onchange = function () {
    state.display.bandPreset = bandSel.value;
    var band = _allBands(state).find(function (b) { return b.id === bandSel.value; });
    if (band && band.low != null && band.high != null) {
      state.filterParams.lff = band.low;
      state.filterParams.hff = band.high;
      var lf = document.getElementById('eeg-lff-sel'); if (lf) lf.value = String(band.low);
      var hf = document.getElementById('eeg-hff-sel'); if (hf) hf.value = String(band.high);
      state.hasUnsavedChanges = true;
      _updateSaveIndicator(state);
    }
    _maybeFilterPreview(analysisId, state);
  };

  // Phase 3 — Bands button → custom-band library modal
  var bandsBtn = document.getElementById('eeg-bands-btn');
  if (bandsBtn) bandsBtn.addEventListener('click', function () {
    _openCustomBandsModal(state);
  });

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

  // Snapshot
  document.getElementById('eeg-snapshot-btn')?.addEventListener('click', function () { _takeSnapshot(state); });

  // Timeline click-to-navigate
  var timelineTrack = document.getElementById('eeg-timeline-track');
  if (timelineTrack) {
    timelineTrack.addEventListener('click', function (e) {
      var rect = timelineTrack.getBoundingClientRect();
      var pct = (e.clientX - rect.left) / rect.width;
      var tStart = Math.max(0, Math.min(dur - state.windowSec, pct * dur));
      _navTo(tStart);
    });
  }

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

  // Workbench
  document.getElementById('eeg-workbench-btn')?.addEventListener('click', function () {
    if (window._qeegOpenWorkbench) {
      window._qeegOpenWorkbench(analysisId);
    } else {
      window.location.hash = '#/qeeg-raw-workbench/' + encodeURIComponent(analysisId);
      if (typeof window._nav === 'function') window._nav('qeeg-raw-workbench');
    }
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
      if (content) content.innerHTML = '<div class="eeg-sb__hint">ICA unavailable: ' + esc(String(err && err.message ? err.message : err || "Unknown error")) + '</div>';
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
      case '?':
        e.preventDefault();
        // Phase 7: prefer the new shortcut sheet (richer entries). The
        // legacy overlay still works when the new modal isn't installed.
        try { _showShortcutsSheet(); }
        catch (_e) {
          var helpEl = document.getElementById('eeg-help');
          if (helpEl && helpEl.style.display === 'flex') _hideShortcutsHelp(); else _showShortcutsHelp();
        }
        break;
      case 'b':
      case 'B':
        // Phase 7: toggle bad channel for the channel under the cursor.
        e.preventDefault();
        try {
          var info = renderer && typeof renderer.getCursorInfo === 'function' ? renderer.getCursorInfo() : null;
          var ch = info && info.channel ? info.channel : (state.cursorChannel || null);
          if (ch) {
            state.badChannels = state.badChannels || [];
            var bcIdx = state.badChannels.indexOf(ch);
            if (bcIdx >= 0) state.badChannels.splice(bcIdx, 1); else state.badChannels.push(ch);
            if (typeof renderer.setChannelStates === 'function') renderer.setChannelStates(state.badChannels.slice());
            state.hasUnsavedChanges = true;
            _updateSaveIndicator(state);
            showToast((state.badChannels.indexOf(ch) >= 0 ? 'Marked bad: ' : 'Cleared bad: ') + ch, 'info');
          } else {
            showToast('Hover a channel first to toggle bad', 'warning');
          }
        } catch (_e) { /* defensive */ }
        break;
      case 'm':
      case 'M':
        // Phase 7: toggle measurement (caliper) tool.
        e.preventDefault();
        state.interactionMode = state.interactionMode === 'measure' ? 'select' : 'measure';
        var toolSel = document.getElementById('eeg-tool-sel');
        if (toolSel) toolSel.value = state.interactionMode;
        showToast('Tool: ' + (state.interactionMode === 'measure' ? 'caliper' : 'cursor'), 'info');
        break;
      case 'e':
      case 'E':
        // Phase 7: toggle event marker tool.
        e.preventDefault();
        state.interactionMode = state.interactionMode === 'event' ? 'select' : 'event';
        var toolSelE = document.getElementById('eeg-tool-sel');
        if (toolSelE) toolSelE.value = state.interactionMode;
        var picker = document.getElementById('eeg-event-picker-wrap');
        if (picker) picker.style.display = state.interactionMode === 'event' ? 'flex' : 'none';
        showToast('Tool: ' + (state.interactionMode === 'event' ? 'event marker' : 'cursor'), 'info');
        break;
      case ' ':
      case 'Spacebar':
        // Phase 7: toggle bad-segment selection mode.
        e.preventDefault();
        state.badSegmentMode = !state.badSegmentMode;
        if (typeof renderer.setBadSegmentMode === 'function') {
          renderer.setBadSegmentMode(state.badSegmentMode);
        }
        showToast('Bad-segment selection: ' + (state.badSegmentMode ? 'ON' : 'OFF'), 'info');
        break;
      case 's':
      case 'S':
        e.preventDefault();
        _takeSnapshot(state);
        break;
    }
  };

  // Attach to the viewer container so it catches focus
  var viewer = tabEl.querySelector('.eeg-viewer');
  if (viewer) {
    viewer.addEventListener('keydown', handler);
    viewer.focus();
  }

  // Help close button
  var helpClose = document.getElementById('eeg-help-close');
  if (helpClose) helpClose.addEventListener('click', _hideShortcutsHelp);

  // Notepad
  var notepad = document.getElementById('eeg-notepad');
  if (notepad) {
    notepad.addEventListener('input', function () {
      state.notepad = notepad.value;
      state.hasUnsavedChanges = true;
      _updateSaveIndicator(state);
    });
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

  // Export button — Phase 6: opens the export+report modal. Falls back to the
  // legacy PNG snapshot only when no analysis_id is in scope (pre-load state).
  var exportBtn = document.getElementById('eeg-export-btn');
  if (exportBtn) exportBtn.onclick = function () {
    if (!analysisId || analysisId === 'demo') {
      var canvas = document.getElementById('qeeg-raw-canvas');
      if (canvas) {
        EEGExporter.exportPNG(canvas, 'eeg-raw-view.png');
        showToast('PNG exported', 'success');
      }
      return;
    }
    _openExportModal(analysisId);
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

  // ── Phase 2: new toolbar buttons ──────────────────────────────────────
  // Channel ordering selector — recorded in display slice; rendering wires
  // up in Phase 3.
  var chordSel = document.getElementById('eeg-chord-sel');
  if (chordSel) chordSel.onchange = function () {
    state.channelOrdering = chordSel.value;
    state.hasUnsavedChanges = true;
    _updateSaveIndicator(state);
  };

  // Band preset (Phase 3 wires it; Phase 2 just records the choice).
  var bandPresetSel = document.getElementById('eeg-band-preset-sel');
  if (bandPresetSel) bandPresetSel.onchange = function () {
    showToast('Band preset noted (' + bandPresetSel.value + ') — wiring lands in Phase 3', 'info');
  };

  // Artifacts group — Phase 4 wiring: real auto-scan, templates dropdown,
  // decomposition studio, spike list. All four go through the new endpoints
  // and write CleaningDecision audit rows server-side.
  _installPhase4Css();

  var autoScanBtn = document.getElementById('eeg-artifacts-autoscan-btn');
  if (autoScanBtn) autoScanBtn.onclick = function () {
    _runAutoScan(analysisId, state, renderer, spectralPanel);
  };
  var templatesBtn = document.getElementById('eeg-artifacts-templates-btn');
  if (templatesBtn) templatesBtn.onclick = function (ev) {
    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
    _toggleTemplatesMenu(templatesBtn, analysisId, state, renderer, spectralPanel);
  };
  var spikesBtn = document.getElementById('eeg-artifacts-spikes-btn');
  if (spikesBtn) spikesBtn.onclick = function () {
    _openSpikeList(analysisId, state, renderer);
  };
  var decompBtn = document.getElementById('eeg-artifacts-decomp-btn');
  if (decompBtn) decompBtn.onclick = function () {
    _openDecompositionStudio(analysisId, state, renderer);
  };

  // Find / Jump — prompts for time in seconds, navigates the window there.
  var findBtn = document.getElementById('eeg-find-btn');
  if (findBtn) findBtn.onclick = function () {
    var dur = (state.channelInfo || {}).duration_sec || 0;
    var raw = window.prompt && window.prompt('Jump to time (seconds):', String(state.tStart));
    if (raw == null) return;
    var t = parseFloat(raw);
    if (!isFinite(t) || t < 0) { showToast('Invalid time', 'error'); return; }
    state.tStart = Math.max(0, Math.min(dur - state.windowSec, t));
    _loadSignalWindow(analysisId, state, renderer, spectralPanel);
    _updatePageCounter(state);
  };

  // Bookmark — adds a labelled event marker at the current window start.
  var bookmarkBtn = document.getElementById('eeg-bookmark-btn');
  if (bookmarkBtn) bookmarkBtn.onclick = function () {
    if (!state.eventEditor) return;
    var t = state.tStart || 0;
    var evt = state.eventEditor.addEvent(t, 'Bookmark', '#00d4bc');
    renderer.setEventMarkers(state.eventEditor.getEvents());
    _updateEventList(state);
    _updateTimelineOverview(state);
    state.hasUnsavedChanges = true;
    _updateSaveIndicator(state);
    state.undoManager.push({
      type: 'add_bookmark',
      data: evt,
      undo: function () { state.eventEditor.removeEvent(evt.id); renderer.setEventMarkers(state.eventEditor.getEvents()); _updateEventList(state); _updateTimelineOverview(state); },
      redo: function () { state.eventEditor.addEvent(t, 'Bookmark', '#00d4bc'); renderer.setEventMarkers(state.eventEditor.getEvents()); _updateEventList(state); _updateTimelineOverview(state); },
    });
    _updateUndoButtons(state);
    showToast('Bookmark added at ' + t.toFixed(1) + 's', 'success');
  };
}

// ── UI update helpers ───────────────────────────────────────────────────────

function _takeSnapshot(state) {
  var canvas = document.getElementById('qeeg-raw-canvas');
  if (!canvas) { showToast('No canvas to snapshot', 'error'); return; }
  try {
    var link = document.createElement('a');
    var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = 'qeeg-snapshot-' + ts + '-t' + Math.round(state.tStart) + 's.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('Snapshot saved', 'success');
  } catch (err) { showToast('Snapshot failed: ' + (err.message || err), 'error'); }
}

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
      + '<span class="eeg-sb__evt-dot" style="background:' + (evt.color && /^#[0-9a-fA-F]{3,8}$/.test(evt.color) ? evt.color : '#4caf50') + '"></span>'
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
  // Update sidebar quality dots
  var GRADE_CLASS = { good: 'eeg-sb__ch-quality--good', moderate: 'eeg-sb__ch-quality--fair', bad: 'eeg-sb__ch-quality--poor', flat: 'eeg-sb__ch-quality--poor' };
  for (var ch in qualityMap) {
    var dot = document.querySelector('.eeg-sb__ch-quality[data-ch-q="' + ch + '"]');
    if (dot) {
      var grade = qualityMap[ch] && qualityMap[ch].grade;
      dot.className = 'eeg-sb__ch-quality ' + (GRADE_CLASS[grade] || '');
    }
  }
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

/* Band Power sidebar */
.eeg-sb__bp-list { display:flex; flex-direction:column; gap:5px; }
.eeg-sb__bp-row { display:flex; align-items:center; gap:6px; }
.eeg-sb__bp-label { display:flex; align-items:center; gap:5px; font-size:10px; font-weight:600; color:#94a3b8; width:46px; flex-shrink:0; }
.eeg-sb__bp-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
.eeg-sb__bp-bar-wrap { flex:1; height:10px; background:rgba(255,255,255,0.04); border-radius:5px; overflow:hidden; }
.eeg-sb__bp-bar { height:100%; border-radius:5px; transition:width .4s ease; }
.eeg-sb__bp-val { font-family:'JetBrains Mono','SF Mono',monospace; font-size:9px; color:#cbd5e1; width:36px; text-align:right; flex-shrink:0; }
.eeg-sb__bp-legend { font-size:9px; color:#475569; margin-top:6px; text-align:center; }

/* Epoch stats sidebar */
.eeg-sb__stats { max-height:180px; overflow-y:auto; }
.eeg-sb__stats-head { display:flex; justify-content:space-between; font-size:9px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:.04em; padding:0 0 4px; border-bottom:1px solid rgba(255,255,255,0.05); margin-bottom:2px; }
.eeg-sb__stat-row { display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:10px; }
.eeg-sb__stat-ch { font-family:'JetBrains Mono','SF Mono',monospace; color:#94a3b8; }
.eeg-sb__stat-val { font-family:'JetBrains Mono','SF Mono',monospace; color:#cbd5e1; }

/* Montage diagram sidebar */
.eeg-sb__montage { display:flex; justify-content:center; padding:4px 0; }
.eeg-sb__montage svg { max-width:100%; height:auto; }

/* Notepad sidebar */
.eeg-sb__notepad { width:100%; min-height:80px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px; font-size:11px; color:#cbd5e1; resize:vertical; font-family:'Inter',system-ui,sans-serif; }
.eeg-sb__notepad:focus { outline:none; border-color:rgba(0,212,188,0.3); box-shadow:0 0 0 2px rgba(0,212,188,0.1); }
.eeg-sb__notepad::placeholder { color:#475569; }
.eeg-sb__notepad-hint { font-size:9px; color:#475569; margin-top:4px; text-align:right; }

/* Channel quality indicator */
.eeg-sb__ch-quality { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
.eeg-sb__ch-quality--good { background:#66bb6a; }
.eeg-sb__ch-quality--fair { background:#ffa726; }
.eeg-sb__ch-quality--poor { background:#ef5350; }

/* Timeline overview strip */
.eeg-timeline { padding:4px 12px 6px; background:rgba(255,255,255,0.015); border-top:1px solid rgba(255,255,255,0.06); flex-shrink:0; }
.eeg-timeline__track { position:relative; height:14px; background:rgba(255,255,255,0.04); border-radius:7px; cursor:pointer; overflow:hidden; }
.eeg-timeline__window { position:absolute; top:0; height:100%; background:rgba(0,212,188,0.25); border-radius:7px; border:1px solid rgba(0,212,188,0.4); transition:left .2s ease, width .2s ease; }
.eeg-timeline__segments { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }
.eeg-timeline__seg { position:absolute; top:0; height:100%; background:rgba(239,83,80,0.35); }
.eeg-timeline__events { position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; }
.eeg-timeline__evt { position:absolute; top:2px; width:3px; height:10px; border-radius:1px; }
.eeg-timeline__labels { display:flex; justify-content:space-between; margin-top:3px; }
.eeg-timeline__label { font-size:9px; color:#475569; font-family:'JetBrains Mono','SF Mono',monospace; }

/* Shortcuts help overlay */
.eeg-help { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); z-index:50; backdrop-filter:blur(2px); }
.eeg-help__panel { background:#0c1222; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:0; width:320px; max-width:90vw; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
.eeg-help__header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.06); font-size:12px; font-weight:700; color:#e2e8f0; }
.eeg-help__close { background:none; border:none; color:#64748b; font-size:18px; cursor:pointer; line-height:1; }
.eeg-help__close:hover { color:#ef5350; }
.eeg-help__body { padding:10px 16px 14px; }
.eeg-help__row { display:flex; align-items:center; gap:12px; padding:5px 0; font-size:11px; color:#94a3b8; border-bottom:1px solid rgba(255,255,255,0.03); }
.eeg-help__row:last-child { border-bottom:none; }
.eeg-help__row kbd { display:inline-flex; align-items:center; justify-content:center; min-width:56px; padding:2px 6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:4px; font-family:'JetBrains Mono','SF Mono',monospace; font-size:10px; color:#e2e8f0; flex-shrink:0; }

/* Disabled nav buttons */
.eeg-tb__nav-btn:disabled { opacity:0.35; cursor:not-allowed; pointer-events:none; }

/* ── Phase 2: grouped toolbar clusters ─────────────────────────────────── */
.toolbar-group { display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:0 4px; }
.toolbar-group-label { font-size:8px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.08em; padding:0 2px; line-height:1; }
.toolbar-group__controls { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.toolbar-group-divider { width:1px; align-self:stretch; min-height:32px; background:rgba(255,255,255,0.12); margin:0 4px; flex-shrink:0; }
.toolbar-group[data-group="artifacts"] .toolbar-group__controls,
.toolbar-group[data-group="tools"] .toolbar-group__controls { gap:4px; }

/* ── Phase 2: Quality Scorecard ────────────────────────────────────────── */
.quality-scorecard { padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(0,212,188,0.03); }
.quality-scorecard h3 { font-size:10px; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; margin:0 0 8px; }
.quality-score-big { font-family:'JetBrains Mono','SF Mono',monospace; font-size:34px; font-weight:700; color:#00d4bc; line-height:1; margin:0 0 8px; text-align:center; letter-spacing:-0.02em; }
.quality-subscores { display:flex; flex-direction:column; gap:3px; font-size:10px; color:#94a3b8; }
.quality-subscores > div { display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
.quality-subscores > div:last-child { border-bottom:none; }
.quality-subscores > div span { color:#cbd5e1; font-family:'JetBrains Mono','SF Mono',monospace; font-weight:500; }
.quality-narrative { font-size:10px; color:#64748b; margin:8px 0 0; line-height:1.4; font-style:italic; }

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

// ── Phase 3 — modals, popovers, custom-montage / filter-preview wiring ─────

function _mountQeegModalShell() {
  var existing = document.getElementById('qeeg-modal-shell');
  if (existing) return existing;
  var shell = document.createElement('div');
  shell.id = 'qeeg-modal-shell';
  shell.className = 'qeeg-modal-shell';
  shell.style.display = 'none';
  shell.innerHTML = ''
    + '<div class="qeeg-modal-backdrop" data-role="backdrop"></div>'
    + '<div class="qeeg-modal" role="dialog" aria-modal="true">'
    +   '<header class="qeeg-modal__hdr">'
    +     '<h3 id="qeeg-modal-title">Modal</h3>'
    +     '<button type="button" class="qeeg-modal__close" data-role="close" aria-label="Close">×</button>'
    +   '</header>'
    +   '<div class="qeeg-modal__body" id="qeeg-modal-body"></div>'
    +   '<footer class="qeeg-modal__ftr" id="qeeg-modal-footer"></footer>'
    + '</div>';
  document.body.appendChild(shell);
  shell.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.dataset && (t.dataset.role === 'backdrop' || t.dataset.role === 'close')) {
      shell.style.display = 'none';
    }
  });
  return shell;
}

function _showQeegModal(title, bodyHtmlOrEl, footerHtml) {
  var shell = _mountQeegModalShell();
  var titleEl = document.getElementById('qeeg-modal-title');
  var bodyEl = document.getElementById('qeeg-modal-body');
  var ftrEl = document.getElementById('qeeg-modal-footer');
  if (titleEl) titleEl.textContent = title || '';
  if (bodyEl) {
    bodyEl.innerHTML = '';
    if (typeof bodyHtmlOrEl === 'string') bodyEl.innerHTML = bodyHtmlOrEl;
    else if (bodyHtmlOrEl && bodyHtmlOrEl.nodeType === 1) bodyEl.appendChild(bodyHtmlOrEl);
  }
  if (ftrEl) ftrEl.innerHTML = footerHtml || '';
  shell.style.display = 'flex';
  return { shell: shell, body: bodyEl, footer: ftrEl };
}

function _closeQeegModal() {
  var shell = document.getElementById('qeeg-modal-shell');
  if (shell) shell.style.display = 'none';
}

function _injectPhase3CSS() {
  if (document.getElementById('qeeg-phase3-css')) return;
  var style = document.createElement('style');
  style.id = 'qeeg-phase3-css';
  style.textContent = ''
    + '.qeeg-modal-shell { position:fixed; inset:0; z-index:9000; display:flex; align-items:center; justify-content:center; }'
    + '.qeeg-modal-backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.55); }'
    + '.qeeg-modal { position:relative; min-width:340px; max-width:560px; max-height:80vh; background:#0d1b2a; color:#e2e8f0; border:1px solid rgba(255,255,255,0.1); border-radius:10px; display:flex; flex-direction:column; box-shadow:0 16px 48px rgba(0,0,0,0.5); }'
    + '.qeeg-modal__hdr { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid rgba(255,255,255,0.08); }'
    + '.qeeg-modal__hdr h3 { margin:0; font-size:13px; font-weight:700; color:#cbd5e1; }'
    + '.qeeg-modal__close { background:transparent; border:none; color:#94a3b8; font-size:18px; cursor:pointer; padding:0 4px; line-height:1; }'
    + '.qeeg-modal__close:hover { color:#e2e8f0; }'
    + '.qeeg-modal__body { padding:8px; overflow-y:auto; }'
    + '.qeeg-modal__ftr { padding:10px 14px; border-top:1px solid rgba(255,255,255,0.08); display:flex; justify-content:flex-end; gap:8px; }'
    + '.qeeg-modal__ftr button { padding:6px 14px; border-radius:6px; border:1px solid rgba(255,255,255,0.12); background:transparent; color:#e2e8f0; font-size:12px; cursor:pointer; }'
    + '.qeeg-modal__ftr button.qeeg-modal__btn--primary { border-color:rgba(0,212,188,0.4); background:rgba(0,212,188,0.15); color:#00d4bc; }'
    + '.qeeg-modal__ftr button:hover { background:rgba(255,255,255,0.05); }'
    + '.qeeg-bands-list { display:flex; flex-direction:column; gap:6px; padding:8px; }'
    + '.qeeg-bands-row { display:flex; align-items:center; gap:6px; padding:6px; background:rgba(255,255,255,0.02); border-radius:6px; }'
    + '.qeeg-bands-row input { padding:4px 6px; border-radius:5px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:#e2e8f0; font-size:12px; flex:1; }'
    + '.qeeg-bands-row input.qeeg-bands-row__num { max-width:64px; flex:0 0 auto; }'
    + '.qeeg-bands-row__rm { background:transparent; border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:4px; cursor:pointer; padding:2px 8px; }'
    + '.qeeg-bands-add { padding:6px 12px; border-radius:6px; border:1px dashed rgba(0,212,188,0.4); background:rgba(0,212,188,0.08); color:#00d4bc; font-size:12px; cursor:pointer; }'
    + '.qeeg-fp-popover { position:absolute; z-index:7500; padding:6px; background:#0d1b2a; border:1px solid rgba(0,212,188,0.25); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.5); }'
    + '.qeeg-fp-popover canvas { display:block; width:380px; height:260px; }'
    + EEG_MONTAGE_BUILDER_CSS;
  document.head.appendChild(style);
}

// ─── Phase 6 helpers: cleaned-signal export + Cleaning Report PDF ──────────

function _installPhase6Css() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  if (document.getElementById('eeg-phase6-css')) return;
  var styleEl = document.createElement('style');
  styleEl.id = 'eeg-phase6-css';
  styleEl.textContent = EEG_EXPORT_MODAL_CSS;
  if (document.head) document.head.appendChild(styleEl);
}

// ─── Phase 7 helpers: contextual help drawer + shortcut sheet ───────────────

function _installPhase7Css() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  if (document.getElementById('eeg-phase7-css')) return;
  var styleEl = document.createElement('style');
  styleEl.id = 'eeg-phase7-css';
  styleEl.textContent = EEG_HELP_DRAWER_CSS + '\n' + RAW_KEYBOARD_SHORTCUTS_CSS;
  if (document.head) document.head.appendChild(styleEl);
}

var _phase7HelpDrawer = null;

function _ensureHelpDrawer() {
  if (typeof document === 'undefined') return null;
  if (_phase7HelpDrawer) return _phase7HelpDrawer;
  _installPhase7Css();
  var host = document.getElementById('eeg-phase7-help-drawer-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'eeg-phase7-help-drawer-host';
    if (document.body) document.body.appendChild(host);
  }
  _phase7HelpDrawer = new EEGHelpDrawer(host, {});
  return _phase7HelpDrawer;
}

function _openHelp(topicKey) {
  var drawer = _ensureHelpDrawer();
  if (drawer) drawer.open(topicKey);
}

function _showShortcutsSheet() {
  if (typeof document === 'undefined') return;
  _installPhase7Css();
  var host = document.getElementById('eeg-phase7-shortcuts-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'eeg-phase7-shortcuts-host';
    host.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);z-index:1100;backdrop-filter:blur(2px);';
    if (document.body) document.body.appendChild(host);
  } else {
    host.style.display = 'flex';
  }
  host.innerHTML =
    '<div style="background:#0c1222;border:1px solid rgba(255,255,255,0.1);border-radius:12px;width:380px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.5);position:relative;">' +
      '<button id="eeg-phase7-shortcuts-close" type="button" aria-label="Close shortcuts" style="position:absolute;top:8px;right:10px;background:none;border:none;color:#94a3b8;font-size:20px;line-height:1;cursor:pointer;">×</button>' +
      renderShortcutSheet() +
    '</div>';
  var closeBtn = host.querySelector('#eeg-phase7-shortcuts-close');
  function _close() { host.style.display = 'none'; }
  if (closeBtn) closeBtn.addEventListener('click', _close);
  host.addEventListener('click', function (e) { if (e.target === host) _close(); });
}

// Map toolbar/sidebar control IDs to a help-topic key. Used by the
// `?` icons that get inlined next to group labels and section titles.
var _PHASE7_HELP_BUTTON_HTML = function (topicKey) {
  if (!RAW_HELP_TOPICS[topicKey]) return '';
  return ' <button class="eeg-help-icon" type="button"'
    + ' data-help-topic="' + esc(topicKey) + '"'
    + ' aria-label="Help: ' + esc(RAW_HELP_TOPICS[topicKey].title) + '"'
    + ' title="Help: ' + esc(RAW_HELP_TOPICS[topicKey].title) + '">?</button>';
};

function _wireHelpIcons(rootEl) {
  if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
  var btns = rootEl.querySelectorAll('.eeg-help-icon[data-help-topic]');
  for (var i = 0; i < btns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function (e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        var key = btn.getAttribute('data-help-topic');
        if (key) _openHelp(key);
      });
    })(btns[i]);
  }
}

function _saveBlobAs(blob, filename) {
  try {
    if (typeof window === 'undefined' || !window.URL || !window.URL.createObjectURL) return;
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { document.body.removeChild(a); } catch (_) {}
      try { window.URL.revokeObjectURL(url); } catch (_) {}
    }, 0);
  } catch (e) { /* best-effort */ }
}

function _exportFilenameForFormat(analysisId, fmt) {
  var ext = '.edf';
  if (fmt === 'bdf') ext = '.bdf';
  else if (fmt === 'fif') ext = '_raw.fif';
  return 'cleaned_' + String(analysisId) + ext;
}

function _openExportModal(analysisId) {
  _installPhase6Css();
  var container = document.getElementById('eeg-phase6-export-modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'eeg-phase6-export-modal-container';
    document.body.appendChild(container);
  }
  var modal = new EEGExportModal(container, {
    onCancel: function () { /* hide handled internally */ },
    onDownloadCleaned: async function (choice) {
      try {
        showToast('Preparing cleaned signal export…', 'info');
        var resp = await api.postQEEGExportCleaned(analysisId, {
          format: choice.format,
          interpolate_bad_channels: !!choice.interpolate_bad_channels,
        });
        var filename = (resp && resp.filename) || _exportFilenameForFormat(analysisId, choice.format);
        _saveBlobAs(resp.blob, filename);
        showToast('Cleaned signal exported', 'success');
        modal.hide();
      } catch (err) {
        showToast('Export failed: ' + (err && err.message ? err.message : err), 'error');
      }
    },
    onDownloadReport: async function () {
      try {
        showToast('Generating Cleaning Report PDF…', 'info');
        var resp = await api.postQEEGCleaningReport(analysisId);
        var filename = (resp && resp.filename) || ('cleaning_report_' + analysisId + '.pdf');
        _saveBlobAs(resp.blob, filename);
        showToast('Cleaning Report PDF generated', 'success');
        modal.hide();
      } catch (err) {
        showToast('Cleaning report failed: ' + (err && err.message ? err.message : err), 'error');
      }
    },
  });
  modal.show();
}


function _openCustomMontageModal(analysisId, state, renderer, spectralPanel) {
  _injectPhase3CSS();
  var chNames = ((state.channelInfo && state.channelInfo.channels) || []).map(function (c) { return c.name || c; });
  var builder = new EEGCustomMontageBuilder(chNames);
  // If editing the current saved montage, prefill it.
  if (state.display.activeCustomMontageId) {
    var current = (state.display.savedMontages || []).find(function (m) { return m.id === state.display.activeCustomMontageId; });
    if (current) builder.loadPreset(current);
  }
  var bodyDiv = document.createElement('div');
  builder.render(bodyDiv);

  var footer = ''
    + '<button type="button" data-role="cancel">Cancel</button>'
    + '<button type="button" class="qeeg-modal__btn--primary" data-role="save">Save montage</button>';
  var ctx = _showQeegModal('Custom Montage Builder', bodyDiv, footer);
  ctx.footer.querySelector('[data-role="cancel"]').addEventListener('click', _closeQeegModal);
  ctx.footer.querySelector('[data-role="save"]').addEventListener('click', function () {
    var serialized = builder.serialize();
    if (!serialized.pairs.length) {
      showToast('Add at least one pair before saving', 'warning');
      return;
    }
    var id = 'cm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
    var record = { id: id, name: serialized.name, pairs: serialized.pairs };
    state.display.savedMontages = (state.display.savedMontages || []).concat([record]);
    state.display.activeCustomMontageId = id;
    _persistSavedMontages(state.display.savedMontages);
    _closeQeegModal();
    showToast('Custom montage saved', 'success');
    // Re-render the montage select to include the new entry.
    var sel = document.getElementById('eeg-montage-sel');
    if (sel) {
      // Insert the new <option> into the saved-montages optgroup, or rebuild it.
      var opt = document.createElement('option');
      opt.value = 'saved:' + id;
      opt.textContent = record.name;
      opt.selected = true;
      var grp = sel.querySelector('optgroup[label="Saved montages"]');
      if (!grp) {
        grp = document.createElement('optgroup');
        grp.label = 'Saved montages';
        // Insert before the __custom__ option.
        var customOpt = sel.querySelector('option[value="__custom__"]');
        if (customOpt) sel.insertBefore(grp, customOpt);
        else sel.appendChild(grp);
      }
      grp.appendChild(opt);
      sel.value = 'saved:' + id;
    }
    _applySavedMontage(id, state, renderer);
    _loadSignalWindow(analysisId, state, renderer, spectralPanel);
  });
}

function _applySavedMontage(savedId, state, renderer) {
  var found = (state.display.savedMontages || []).find(function (m) { return m.id === savedId; });
  if (!found) return;
  state.display.activeCustomMontageId = savedId;
  // Renderer keeps treating this as 'referential' for the wire format; the
  // server returns referential data and we tag the display as a custom build.
  // Future Phase: pass the pair list to the renderer to draw bipolar diffs
  // client-side.  For now we just tag montage and update the readout.
  state.montage = 'referential';
  if (typeof renderer.setMontage === 'function') renderer.setMontage('referential');
  if (typeof renderer.setCustomMontagePairs === 'function') {
    renderer.setCustomMontagePairs(found.pairs || []);
  }
  var lbl = document.getElementById('eeg-info-montage');
  if (lbl) lbl.textContent = 'Custom: ' + (found.name || savedId);
}

function _openCustomBandsModal(state) {
  _injectPhase3CSS();
  function rowHtml(b, i) {
    return '<div class="qeeg-bands-row" data-band-i="' + i + '">'
      + '<input type="text" data-field="name" value="' + esc(b.name || '') + '" maxlength="40" placeholder="Band name" />'
      + '<input type="number" class="qeeg-bands-row__num" data-field="low" value="' + (b.low != null ? b.low : '') + '" placeholder="Low Hz" min="0" max="500" step="0.1" />'
      + '<input type="number" class="qeeg-bands-row__num" data-field="high" value="' + (b.high != null ? b.high : '') + '" placeholder="High Hz" min="0" max="500" step="0.1" />'
      + '<button type="button" class="qeeg-bands-row__rm" data-action="rm" data-band-i="' + i + '">×</button>'
      + '</div>';
  }
  function listHtml() {
    var bands = state.display.customBands || [];
    var s = '<div class="qeeg-bands-list" id="qeeg-bands-list">';
    if (!bands.length) s += '<div style="padding:12px;color:#64748b;font-size:12px;font-style:italic">No custom bands yet.</div>';
    for (var i = 0; i < bands.length; i++) s += rowHtml(bands[i], i);
    s += '</div>';
    s += '<div style="padding:8px"><button type="button" class="qeeg-bands-add" id="qeeg-bands-add">+ Add band</button></div>';
    return s;
  }
  var ctx = _showQeegModal('Custom Band Library', listHtml(),
    '<button type="button" data-role="cancel">Close</button>'
    + '<button type="button" class="qeeg-modal__btn--primary" data-role="save">Save bands</button>');

  function refresh() { ctx.body.innerHTML = listHtml(); wire(); }

  function wire() {
    var addBtn = document.getElementById('qeeg-bands-add');
    if (addBtn) addBtn.onclick = function () {
      state.display.customBands = (state.display.customBands || []).concat([{ id: 'cb_' + Date.now().toString(36), name: 'New band', low: 1, high: 4 }]);
      refresh();
    };
    var list = document.getElementById('qeeg-bands-list');
    if (list) {
      list.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.dataset && t.dataset.action === 'rm') {
          var i = parseInt(t.dataset.bandI, 10);
          if (!isNaN(i)) { state.display.customBands.splice(i, 1); refresh(); }
        }
      });
      list.addEventListener('input', function (e) {
        var t = e.target;
        if (!t || !t.dataset || !t.dataset.field) return;
        var row = t.closest && t.closest('.qeeg-bands-row');
        if (!row) return;
        var i = parseInt(row.dataset.bandI, 10);
        if (isNaN(i)) return;
        var band = state.display.customBands[i];
        if (!band) return;
        if (t.dataset.field === 'name') band.name = String(t.value || '').slice(0, 40);
        else if (t.dataset.field === 'low') band.low = t.value === '' ? null : parseFloat(t.value);
        else if (t.dataset.field === 'high') band.high = t.value === '' ? null : parseFloat(t.value);
      });
    }
  }
  wire();

  ctx.footer.querySelector('[data-role="cancel"]').addEventListener('click', _closeQeegModal);
  ctx.footer.querySelector('[data-role="save"]').addEventListener('click', function () {
    var cleaned = (state.display.customBands || []).filter(function (b) {
      return b && b.name && b.low != null && b.high != null && b.high > b.low;
    });
    state.display.customBands = cleaned;
    _persistCustomBands(cleaned);
    // Refresh the band-preset dropdown options.
    var sel = document.getElementById('eeg-band-preset-sel');
    if (sel) sel.innerHTML = _renderBandPresetOptions(_initState());
    _closeQeegModal();
    showToast('Custom bands saved', 'success');
  });
}

// Filter-preview popover (singleton).
var _fpPopoverEl = null;
var _fpPreviewInst = null;
var _fpDebounceTimer = null;

function _ensureFilterPreviewPopover() {
  _injectPhase3CSS();
  if (_fpPopoverEl && document.body.contains && document.body.contains(_fpPopoverEl)) return _fpPopoverEl;
  _fpPopoverEl = document.createElement('div');
  _fpPopoverEl.className = 'qeeg-fp-popover';
  _fpPopoverEl.id = 'qeeg-filter-preview-popover';
  _fpPopoverEl.style.display = 'none';
  var canvas = document.createElement('canvas');
  canvas.width = 380;
  canvas.height = 260;
  _fpPopoverEl.appendChild(canvas);
  document.body.appendChild(_fpPopoverEl);
  _fpPreviewInst = new EEGFilterPreview(canvas);
  return _fpPopoverEl;
}

function _hideFilterPreview() {
  if (_fpPopoverEl) _fpPopoverEl.style.display = 'none';
}

function _maybeFilterPreview(analysisId, state) {
  if (!state.display || !state.display.filterPreviewEnabled) return;
  // Debounce
  if (_fpDebounceTimer) clearTimeout(_fpDebounceTimer);
  _fpDebounceTimer = setTimeout(function () {
    _runFilterPreview(analysisId, state);
  }, 200);
}

async function _runFilterPreview(analysisId, state) {
  var pop = _ensureFilterPreviewPopover();
  // Position the popover above the toolbar Filters group.
  var anchor = document.getElementById('eeg-filter-preview-toggle');
  if (anchor && anchor.getBoundingClientRect) {
    var r = anchor.getBoundingClientRect();
    pop.style.top = (r.top + window.scrollY - 270) + 'px';
    pop.style.left = (r.left + window.scrollX) + 'px';
  }
  pop.style.display = 'block';

  var fp = state.filterParams || {};
  var t0 = state.tStart || 0;
  var win = state.windowSec || 10;
  try {
    var resp;
    if (typeof api.getQEEGFilterPreview === 'function') {
      resp = await api.getQEEGFilterPreview(analysisId, {
        t_start: t0, window_sec: win, lff: fp.lff, hff: fp.hff, notch: fp.notch,
      });
    } else if (api && typeof api.fetch === 'function') {
      resp = await api.fetch('/api/v1/qeeg-raw/' + encodeURIComponent(analysisId) + '/filter-preview', {
        method: 'POST',
        body: JSON.stringify({ t_start: t0, window_sec: win, lff: fp.lff, hff: fp.hff, notch: fp.notch }),
      });
    } else {
      // Demo fallback: synthesize a frequency response curve from filterParams.
      resp = _demoFilterPreview(fp);
    }
    if (_fpPreviewInst) _fpPreviewInst.update(resp.raw || [], resp.filtered || [], resp.freq_response || { hz: [], magnitude_db: [] });
  } catch (err) {
    if (_fpPreviewInst) {
      var demo = _demoFilterPreview(fp);
      _fpPreviewInst.update(demo.raw, demo.filtered, demo.freq_response);
    }
  }
}

function _demoFilterPreview(fp) {
  var n = 256;
  var hz = [], db = [];
  var lff = fp && fp.lff ? fp.lff : 0;
  var hff = fp && fp.hff ? fp.hff : 100;
  var notch = fp && fp.notch ? fp.notch : 0;
  for (var i = 0; i < n; i++) {
    var f = (i + 1) * (128.0 / n);
    var mag = 1;
    if (lff > 0) { var r1 = f / lff; mag *= (r1 * r1) / Math.sqrt(1 + Math.pow(r1, 4)); }
    if (hff > 0) { var r2 = f / hff; mag *= 1 / Math.sqrt(1 + Math.pow(r2, 4)); }
    if (notch > 0) { var dist = Math.abs(f - notch); if (dist < 2) mag *= dist / 2; }
    hz.push(f);
    db.push(20 * Math.log10(Math.max(mag, 1e-4)));
  }
  // Two synthetic channels: raw 10 Hz sine + filtered version (same).
  var raw = [], filtered = [];
  for (var c = 0; c < 2; c++) {
    var rawRow = [], filtRow = [];
    for (var j = 0; j < 200; j++) {
      var t = j / 100;
      var v = 25 * Math.sin(2 * Math.PI * 10 * t + c) + 6 * (Math.random() - 0.5);
      rawRow.push(v);
      filtRow.push(v * 0.85);
    }
    raw.push(rawRow); filtered.push(filtRow);
  }
  return { raw: raw, filtered: filtered, freq_response: { hz: hz, magnitude_db: db } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — Artifact tooling helpers (auto-scan, templates, decomposition,
// spike list, manual reason picker)
// ─────────────────────────────────────────────────────────────────────────────

function _installPhase4Css() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  if (document.getElementById('eeg-phase4-css')) return;
  var styleEl = document.createElement('style');
  styleEl.id = 'eeg-phase4-css';
  styleEl.textContent = ''
    + EEG_DS_CSS + '\n' + EEG_ASM_CSS + '\n' + EEG_SL_CSS + '\n'
    + '.eeg-tpl-menu{position:absolute;background:#0f172a;border:1px solid #334155;border-radius:6px;min-width:180px;padding:4px 0;z-index:1100;box-shadow:0 4px 16px rgba(2,6,23,0.5);}\n'
    + '.eeg-tpl-menu__item{display:block;width:100%;text-align:left;background:transparent;color:#e2e8f0;border:none;padding:6px 12px;cursor:pointer;font-size:13px;}\n'
    + '.eeg-tpl-menu__item:hover{background:#1e293b;}\n'
    + '.eeg-rsn-overlay{position:fixed;inset:0;z-index:1100;background:rgba(2,6,23,0.4);display:flex;align-items:center;justify-content:center;}\n'
    + '.eeg-rsn{background:#0d1b2a;border:1px solid #334155;border-radius:8px;padding:14px 16px;color:#e2e8f0;font-family:Inter,system-ui,sans-serif;width:min(360px,90vw);}\n'
    + '.eeg-rsn__t{font-weight:600;margin-bottom:8px;}\n'
    + '.eeg-rsn__opts{display:grid;grid-template-columns:1fr 1fr;gap:6px;}\n'
    + '.eeg-rsn__opt{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:6px 10px;border-radius:5px;cursor:pointer;font-size:12px;text-align:left;}\n'
    + '.eeg-rsn__opt:hover{background:#334155;}\n'
    + '.eeg-rsn__cancel{margin-top:10px;background:transparent;color:#94a3b8;border:none;cursor:pointer;font-size:12px;}\n';
  document.head && document.head.appendChild(styleEl);
}

/** Ensure a single overlay container exists for modals. */
function _getPhase4Overlay() {
  if (typeof document === 'undefined') return null;
  var el = document.getElementById('eeg-phase4-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'eeg-phase4-overlay';
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.zIndex = '1000';
    el.style.pointerEvents = 'none';
    el.innerHTML = '';
    if (document.body && document.body.appendChild) document.body.appendChild(el);
  }
  return el;
}

function _ensureOverlayChild(id) {
  var ov = _getPhase4Overlay();
  if (!ov) return null;
  var child = document.getElementById(id);
  if (!child) {
    child = document.createElement('div');
    child.id = id;
    child.style.pointerEvents = 'auto';
    ov.appendChild(child);
  }
  return child;
}

async function _runAutoScan(analysisId, state, renderer, spectralPanel) {
  if (!analysisId) return;
  showToast('Running auto-scan…', 'info');
  var resp;
  try {
    resp = await api.postQEEGAutoScan(analysisId);
  } catch (err) {
    showToast('Auto-scan failed: ' + (err && err.message ? err.message : 'unknown error'), 'error');
    return;
  }
  if (!resp || !resp.run_id) {
    showToast('Auto-scan returned no proposal', 'warn');
    return;
  }
  if (state && state.ai) state.ai.lastAutoCleanRunId = resp.run_id;
  var host = _ensureOverlayChild('eeg-asm-host');
  if (!host) return;
  var modal = new EEGAutoScanModal(host, {
    onCommit: async function (decision) {
      try {
        await api.decideQEEGAutoScan(analysisId, resp.run_id, {
          accepted_items: decision.accepted_items,
          rejected_items: decision.rejected_items,
        });
        showToast('Auto-scan decisions committed.', 'success');
        // Pull fresh cleaning config so badChannels/badSegments reflect server state.
        try {
          var cfg = await api.getQEEGCleaningConfig(analysisId);
          if (cfg && cfg.config) {
            if (state && state.processing) {
              state.processing.badChannels = cfg.config.bad_channels || state.processing.badChannels;
              state.processing.badSegments = cfg.config.bad_segments || state.processing.badSegments;
            }
            if (renderer && renderer.setBadSegments) renderer.setBadSegments(state.processing.badSegments);
            if (renderer && renderer.setChannelStates) renderer.setChannelStates(state.processing.badChannels);
          }
        } catch (_e) { /* non-fatal */ }
      } catch (err) {
        showToast('Decide failed: ' + (err && err.message ? err.message : 'unknown error'), 'error');
      }
    },
    onCancel: function () { showToast('Auto-scan dismissed.', 'info'); },
  });
  modal.show(resp.proposal || {}, resp.run_id);
}

function _toggleTemplatesMenu(anchorBtn, analysisId, state, renderer, spectralPanel) {
  if (!analysisId || typeof document === 'undefined') return;
  var existing = document.getElementById('eeg-tpl-menu');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
    return;
  }
  var menu = document.createElement('div');
  menu.id = 'eeg-tpl-menu';
  menu.className = 'eeg-tpl-menu';
  var rect = anchorBtn && anchorBtn.getBoundingClientRect ? anchorBtn.getBoundingClientRect() : { left: 100, bottom: 100 };
  menu.style.left = (rect.left || 0) + 'px';
  menu.style.top = ((rect.bottom || 0) + 4) + 'px';
  var TEMPLATES = [
    { key: 'eye_blink',     label: 'Eye blink' },
    { key: 'lateral_eye',   label: 'Lateral eye' },
    { key: 'emg',           label: 'Muscle (EMG)' },
    { key: 'ecg',           label: 'Heart (ECG)' },
    { key: 'electrode_pop', label: 'Electrode pop' },
  ];
  TEMPLATES.forEach(function (t) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eeg-tpl-menu__item';
    btn.textContent = t.label;
    btn.onclick = async function () {
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      try {
        var resp = await api.applyQEEGTemplate(analysisId, t.key);
        var n = (resp && resp.components_excluded) ? resp.components_excluded.length : 0;
        showToast('Template "' + t.label + '" excluded ' + n + ' components.', n > 0 ? 'success' : 'info');
        // Refresh ICA panel state if loaded.
        if (state && state.processing && resp && Array.isArray(resp.components_excluded)) {
          var cur = state.processing.excludedICA || [];
          resp.components_excluded.forEach(function (i) {
            if (cur.indexOf(i) < 0) cur.push(i);
          });
          state.processing.excludedICA = cur;
        }
      } catch (err) {
        showToast('Template apply failed: ' + (err && err.message ? err.message : 'unknown error'), 'error');
      }
    };
    menu.appendChild(btn);
  });
  if (document.body && document.body.appendChild) document.body.appendChild(menu);
  // Click-outside to dismiss.
  setTimeout(function () {
    function _close(ev) {
      if (menu.contains && menu.contains(ev.target)) return;
      if (menu.parentNode) menu.parentNode.removeChild(menu);
      document.removeEventListener('click', _close, true);
    }
    document.addEventListener('click', _close, true);
  }, 0);
}

async function _openSpikeList(analysisId, state, renderer) {
  if (!analysisId) return;
  var host = _ensureOverlayChild('eeg-sl-host');
  if (!host) return;
  host.style.position = 'fixed';
  host.style.right = '18px';
  host.style.top = '90px';
  var list = new EEGSpikeList(host, {
    onJump: function (tSec, channel) {
      if (state) state.tStart = Math.max(0, tSec - (state.windowSec || 10) / 2);
      // Reuse the existing time-navigation hook used by Find/Jump.
      if (renderer && typeof renderer.onTimeNavigate === 'function') {
        try { renderer.onTimeNavigate(state.tStart); } catch (_e) { /* ignore */ }
      }
      showToast('Jumped to ' + tSec.toFixed(1) + 's' + (channel ? ' on ' + channel : ''), 'info');
    },
  });
  list.setEvents([], { detectorAvailable: false });
  try {
    var resp = await api.getQEEGSpikeEvents(analysisId);
    if (resp && Array.isArray(resp.events)) {
      list.setEvents(resp.events, { detectorAvailable: !!resp.detector_available });
    } else {
      list.setEvents([], { detectorAvailable: false });
    }
  } catch (err) {
    list.setEvents([], { detectorAvailable: false });
    showToast('Spike events fetch failed: ' + (err && err.message ? err.message : 'unknown'), 'warn');
  }
}

async function _openDecompositionStudio(analysisId, state, renderer) {
  if (!analysisId) return;
  var host = _ensureOverlayChild('eeg-ds-host');
  if (!host) return;
  host.style.position = 'fixed';
  host.style.left = '50%';
  host.style.top = '50%';
  host.style.transform = 'translate(-50%, -50%)';
  host.style.zIndex = '1050';
  host.style.maxWidth = '92vw';
  host.style.width = '900px';
  var studio = new EEGDecompositionStudio(host, {
    onExclude: function (idx) {
      if (state && state.processing) {
        var cur = state.processing.excludedICA || [];
        if (cur.indexOf(idx) < 0) cur.push(idx);
        state.processing.excludedICA = cur;
        state.processing.hasUnsavedChanges = true;
      }
    },
    onInclude: function (idx) {
      if (state && state.processing) {
        var cur = state.processing.excludedICA || [];
        var i = cur.indexOf(idx);
        if (i >= 0) cur.splice(i, 1);
        state.processing.excludedICA = cur;
        state.processing.hasUnsavedChanges = true;
      }
    },
    onApplyTemplate: async function (template) {
      try {
        var resp = await api.applyQEEGTemplate(analysisId, template);
        var n = (resp && resp.components_excluded) ? resp.components_excluded.length : 0;
        showToast('Template "' + template + '" excluded ' + n + ' components.', n > 0 ? 'success' : 'info');
        // Refresh studio with updated ICA payload.
        try {
          var ica = await api.getQEEGICAComponents(analysisId);
          studio.setComponents(ica || {});
        } catch (_e) { /* ignore */ }
      } catch (err) {
        showToast('Template apply failed: ' + (err && err.message ? err.message : 'unknown'), 'error');
      }
    },
    onClose: function () { host.innerHTML = ''; },
  });
  // Show a loading state while ICA loads.
  host.innerHTML = '<div style="background:#0d1b2a;color:#94a3b8;padding:18px;border-radius:8px;">Loading ICA components…</div>';
  try {
    var ica = await api.getQEEGICAComponents(analysisId);
    studio.setComponents(ica || { components: [] });
  } catch (err) {
    host.innerHTML = '<div style="background:#0d1b2a;color:#fca5a5;padding:18px;border-radius:8px;">Failed to load ICA components: '
      + (err && err.message ? err.message : 'unknown error') + '</div>';
  }
}

/**
 * Show an inline reason picker after a manual drag-to-mark. Returns a Promise
 * that resolves with the selected reason key (one of the 10 Phase 1 reasons)
 * or `null` if cancelled.
 */
function _promptBadSegmentReason() {
  return new Promise(function (resolve) {
    if (typeof document === 'undefined' || !document.createElement) {
      resolve(null);
      return;
    }
    _installPhase4Css();
    var overlay = document.createElement('div');
    overlay.className = 'eeg-rsn-overlay';
    var inner = document.createElement('div');
    inner.className = 'eeg-rsn';
    inner.innerHTML = '<div class="eeg-rsn__t">Why is this segment bad?</div>'
      + '<div class="eeg-rsn__opts">'
      + _PHASE4_REASONS.map(function (r) {
        return '<button class="eeg-rsn__opt" type="button" data-r="' + r.key + '">' + r.label + '</button>';
      }).join('')
      + '</div>'
      + '<button class="eeg-rsn__cancel" type="button" id="eeg-rsn-cancel">Skip (mark unspecified)</button>';
    overlay.appendChild(inner);
    function _close(reason) {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(reason);
    }
    if (document.body) document.body.appendChild(overlay);
    var opts = overlay.querySelectorAll && overlay.querySelectorAll('.eeg-rsn__opt');
    if (opts && opts.length) {
      for (var i = 0; i < opts.length; i++) {
        (function (el) {
          el.onclick = function () { _close(el.dataset && el.dataset.r); };
        })(opts[i]);
      }
    }
    var cancelBtn = overlay.querySelector && overlay.querySelector('#eeg-rsn-cancel');
    if (cancelBtn) cancelBtn.onclick = function () { _close(null); };
  });
}

// Hydrate state.display.savedMontages + customBands once at module init time.
(function _hydrateLocalStorageState() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    var s = _initState();
    if (!s.display.savedMontages || !s.display.savedMontages.length) {
      s.display.savedMontages = _loadSavedMontages();
    }
    if (!s.display.customBands || !s.display.customBands.length) {
      s.display.customBands = _loadCustomBands();
    }
  } catch (_e) { /* localStorage / window stub */ }
})();

// ── Phase 2: named exports for unit tests ──────────────────────────────────
export {
  _initState,
  _resetStateForTest,
  _computeDeterministicQuality,
  _flatLegacyMap,
  _renderBandPresetOptions,
  _renderSavedMontageOptions,
  _allBands,
};
