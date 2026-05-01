// ─────────────────────────────────────────────────────────────────────────────
// eeg-signal-renderer.js — Canvas2D multi-channel EEG signal viewer
//
// Clinical-grade EEG waveform renderer built on open standards
// (10-20 system, IFCN guidelines, MNE-Python conventions). Supports:
//   - 19–256 channel simultaneous display with per-channel lanes
//   - Region-based channel coloring (frontal/central/temporal/parietal/occipital)
//   - Time ruler with second/subsecond markers
//   - Clickable channel labels (toggle bad channel)
//   - Click-drag bad segment annotation
//   - Minimap overview bar showing position in full recording
//   - Cursor crosshair with time/amplitude readout
//   - Amplitude scale calibration bar
//   - Scroll / zoom via mouse wheel
//   - Overlay mode for raw vs cleaned comparison
//   - Montage support (referential, bipolar, average)
// ─────────────────────────────────────────────────────────────────────────────

// ── 10-20 channel → brain region mapping ────────────────────────────────────
const REGION_MAP = {
  Fp1: 'frontal', Fp2: 'frontal', Fpz: 'frontal',
  F7: 'frontal',  F3: 'frontal',  Fz: 'frontal', F4: 'frontal', F8: 'frontal',
  AF3: 'frontal', AF4: 'frontal', AF7: 'frontal', AF8: 'frontal',
  F1: 'frontal',  F2: 'frontal',  F5: 'frontal',  F6: 'frontal',
  T3: 'temporal', T4: 'temporal', T5: 'temporal', T6: 'temporal',
  T7: 'temporal', T8: 'temporal', FT7: 'temporal', FT8: 'temporal',
  TP7: 'temporal', TP8: 'temporal', FT9: 'temporal', FT10: 'temporal',
  C3: 'central',  Cz: 'central',  C4: 'central',
  C1: 'central',  C2: 'central',  C5: 'central',  C6: 'central',
  FC1: 'central', FC2: 'central', FC3: 'central', FC4: 'central',
  FC5: 'central', FC6: 'central', CP1: 'central', CP2: 'central',
  CP3: 'central', CP4: 'central', CP5: 'central', CP6: 'central',
  CPz: 'central', FCz: 'central',
  P3: 'parietal', Pz: 'parietal', P4: 'parietal',
  P1: 'parietal', P2: 'parietal', P5: 'parietal', P6: 'parietal',
  P7: 'parietal', P8: 'parietal',
  O1: 'occipital', O2: 'occipital', Oz: 'occipital',
  PO3: 'occipital', PO4: 'occipital', PO7: 'occipital', PO8: 'occipital',
};

const REGION_COLORS = {
  frontal:   { signal: '#42a5f5', label: '#64b5f6', dim: 'rgba(66,165,245,0.15)' },
  central:   { signal: '#66bb6a', label: '#81c784', dim: 'rgba(102,187,106,0.15)' },
  temporal:  { signal: '#ffa726', label: '#ffb74d', dim: 'rgba(255,167,38,0.15)' },
  parietal:  { signal: '#ab47bc', label: '#ba68c8', dim: 'rgba(171,71,188,0.15)' },
  occipital: { signal: '#ef5350', label: '#e57373', dim: 'rgba(239,83,80,0.15)' },
  _default:  { signal: '#00d4bc', label: '#80cbc4', dim: 'rgba(0,212,188,0.15)' },
};

function _regionOf(chName) {
  return REGION_MAP[chName] || REGION_MAP[chName.replace(/[0-9]/g, '')] || '_default';
}

// ── Bipolar montage definitions ─────────────────────────────────────────────
const BIPOLAR_LONGITUDINAL = [
  // Left temporal chain
  ['Fp1','F7'], ['F7','T3'], ['T3','T5'], ['T5','O1'],
  // Left parasagittal chain
  ['Fp1','F3'], ['F3','C3'], ['C3','P3'], ['P3','O1'],
  // Midline chain
  ['Fz','Cz'], ['Cz','Pz'],
  // Right parasagittal chain
  ['Fp2','F4'], ['F4','C4'], ['C4','P4'], ['P4','O2'],
  // Right temporal chain
  ['Fp2','F8'], ['F8','T4'], ['T4','T6'], ['T6','O2'],
];

const BIPOLAR_TRANSVERSE = [
  ['F7','Fp1'], ['Fp1','Fp2'], ['Fp2','F8'],
  ['F7','F3'], ['F3','Fz'], ['Fz','F4'], ['F4','F8'],
  ['T3','C3'], ['C3','Cz'], ['Cz','C4'], ['C4','T4'],
  ['T5','P3'], ['P3','Pz'], ['Pz','P4'], ['P4','T6'],
  ['O1','O2'],
];

const DEFAULT_OPTIONS = {
  channelHeight: 48,
  labelWidth: 80,
  timeRulerHeight: 26,
  minimapHeight: 32,
  scaleBarWidth: 48,
  sensitivity: 50,
  colors: {
    background: '#080c14',
    backgroundAlt: '#0b1120',
    grid: 'rgba(255,255,255,0.04)',
    gridMajor: 'rgba(255,255,255,0.10)',
    gridMinor: 'rgba(255,255,255,0.025)',
    label: '#e2e8f0',
    labelBad: '#ef6b6b',
    badSegment: 'rgba(239,107,107,0.14)',
    badSegmentBorder: 'rgba(239,107,107,0.45)',
    cursor: 'rgba(0,212,188,0.5)',
    cursorLine: 'rgba(0,212,188,0.35)',
    ruler: '#94a3b8',
    rulerBg: '#0c1222',
    minimapBg: '#0a0f1a',
    minimapThumb: 'rgba(0,212,188,0.4)',
    minimapWave: 'rgba(0,212,188,0.25)',
    minimapPosition: 'rgba(0,212,188,0.6)',
    scaleBar: '#64748b',
    overlaySignal: 'rgba(255,255,255,0.20)',
    annotationLine: '#f59e0b',
    annotationBg: 'rgba(245,158,11,0.08)',
    selectionDrag: 'rgba(0,212,188,0.18)',
  },
};

export class EEGSignalRenderer {
  constructor(canvas, options) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;

    // Data
    this.channels = [];
    this.data = [];
    this.overlayData = null;
    this.sfreq = 250;
    this.tStart = 0;
    this.totalDuration = 0;
    this.annotations = [];

    // Montage
    this.montage = 'referential'; // 'referential' | 'bipolar_long' | 'bipolar_trans' | 'average' | 'laplacian'
    this._montageChannels = [];
    this._montageData = [];

    // Channel visibility & quality
    this.hiddenChannels = new Set();
    this.channelQuality = {}; // {chName: {grade: 'good'|'moderate'|'bad'|'flat'}}

    // Event markers (from EEGEventEditor)
    this.eventMarkers = []; // [{time, label, color}]

    // Measurement tool ref (from EEGMeasurementTool)
    this.measurementTool = null;

    // Zoom range (for zoom-to-selection)
    this.zoomRange = null; // {tStart, tEnd} or null

    // Interaction
    this.badChannels = new Set();
    this.badSegments = [];
    this.sensitivity = opts.sensitivity;
    this._scrollY = 0;

    // Drag selection
    this._dragging = false;
    this._dragStartX = 0;
    this._dragCurrentX = 0;

    // Cursor
    this._cursorX = -1;
    this._cursorY = -1;
    this._showCursor = false;

    // Callbacks
    this.onChannelClick = null;
    this.onSegmentSelect = null;
    this.onTimeNavigate = null;
    this.onCursorMove = null;
    this.onMeasurementPoint = null; // (timeSec, amplitudeUV, chName)
    this.onEventPlace = null; // (timeSec)

    // Interaction mode: 'select' (default drag-annotate) | 'measure' | 'event'
    this.interactionMode = 'select';

    // Events
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onResize = this._onResize.bind(this);

    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('mouseleave', this._onMouseLeave);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(canvas.parentElement || canvas);

    this._sizeCanvas();
    this._rafId = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  setData(channels, data, sfreq, tStart, annotations, totalDuration) {
    this.channels = channels || [];
    this.data = data || [];
    this.sfreq = sfreq || 250;
    this.tStart = tStart || 0;
    this.annotations = annotations || [];
    this.totalDuration = totalDuration || 0;
    this._applyMontage();
    this.render();
  }

  setOverlayData(data) { this.overlayData = data; this.render(); }
  clearOverlay() { this.overlayData = null; this.render(); }

  setChannelStates(badChannels) {
    this.badChannels = new Set(badChannels || []);
    this.render();
  }

  setBadSegments(segments) { this.badSegments = segments || []; this.render(); }

  setSensitivity(uvPerDiv) {
    this.sensitivity = Math.max(1, uvPerDiv);
    this.render();
  }

  setMontage(montageType) {
    this.montage = montageType;
    this._applyMontage();
    this.render();
  }

  getVisibleTimeRange() {
    const nSamples = this._montageData.length && this._montageData[0] ? this._montageData[0].length : 0;
    const windowSec = nSamples / this.sfreq;
    return { tStart: this.tStart, tEnd: this.tStart + windowSec };
  }

  getCursorInfo() {
    if (!this._showCursor || this._cursorX < 0) return null;
    var o = this.opts;
    var signalW = this._width - o.labelWidth - o.scaleBarWidth;
    var nSamples = this._montageData[0] ? this._montageData[0].length : 0;
    var windowSec = nSamples / this.sfreq;
    var relX = this._cursorX - o.labelWidth;
    if (relX < 0 || relX > signalW) return null;
    var timeSec = this.tStart + (relX / signalW) * windowSec;
    var chIdx = this._getChannelAtY(this._cursorY);
    var amplitude = null;
    var chName = null;
    if (chIdx >= 0 && chIdx < this._montageChannels.length) {
      chName = this._montageChannels[chIdx];
      var sampleIdx = Math.round(relX / signalW * nSamples);
      if (this._montageData[chIdx] && sampleIdx >= 0 && sampleIdx < nSamples) {
        amplitude = this._montageData[chIdx][sampleIdx];
      }
    }
    return { time: timeSec, channel: chName, amplitude: amplitude };
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this.canvas.removeEventListener('wheel', this._onWheel);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  // ── New public API (v2 features) ────────────────────────────────────

  setHiddenChannels(hidden) {
    this.hiddenChannels = new Set(hidden || []);
    this._applyMontage();
    this.render();
  }

  toggleChannelVisibility(chName) {
    if (this.hiddenChannels.has(chName)) this.hiddenChannels.delete(chName);
    else this.hiddenChannels.add(chName);
    this._applyMontage();
    this.render();
  }

  setEventMarkers(events) {
    this.eventMarkers = events || [];
    this.render();
  }

  setMeasurementTool(tool) {
    this.measurementTool = tool;
    this.render();
  }

  setInteractionMode(mode) {
    this.interactionMode = mode || 'select';
  }

  setChannelQuality(qualityMap) {
    this.channelQuality = qualityMap || {};
    this.render();
  }

  zoomToSelection(tStart, tEnd) {
    this.zoomRange = { tStart: tStart, tEnd: tEnd };
    if (this.onTimeNavigate) this.onTimeNavigate(tStart);
  }

  clearZoom() {
    this.zoomRange = null;
  }

  getSignalDataAtTime(timeSec) {
    var nSamples = this._montageData[0] ? this._montageData[0].length : 0;
    if (!nSamples) return null;
    var windowSec = nSamples / this.sfreq;
    var idx = Math.round(((timeSec - this.tStart) / windowSec) * nSamples);
    if (idx < 0 || idx >= nSamples) return null;
    var result = {};
    for (var ch = 0; ch < this._montageChannels.length; ch++) {
      result[this._montageChannels[ch]] = this._montageData[ch] ? this._montageData[ch][idx] : 0;
    }
    return result;
  }

  // ── Montage processing ──────────────────────────────────────────────────

  _applyMontage() {
    if (this.montage === 'referential' || !this.channels.length) {
      this._montageChannels = this.channels.slice();
      this._montageData = this.data.slice();
    } else if (this.montage === 'bipolar_long' || this.montage === 'bipolar_trans') {
      var chMap = {};
      for (var i = 0; i < this.channels.length; i++) chMap[this.channels[i]] = i;
      var pairs = this.montage === 'bipolar_long' ? BIPOLAR_LONGITUDINAL : BIPOLAR_TRANSVERSE;
      this._montageChannels = [];
      this._montageData = [];
      for (var p = 0; p < pairs.length; p++) {
        var a = chMap[pairs[p][0]], b = chMap[pairs[p][1]];
        if (a !== undefined && b !== undefined && this.data[a] && this.data[b]) {
          this._montageChannels.push(pairs[p][0] + '-' + pairs[p][1]);
          var nS = Math.min(this.data[a].length, this.data[b].length);
          var diff = new Array(nS);
          for (var s = 0; s < nS; s++) diff[s] = this.data[a][s] - this.data[b][s];
          this._montageData.push(diff);
        }
      }
    } else if (this.montage === 'average') {
      var nCh = this.channels.length;
      var nSamp = this.data[0] ? this.data[0].length : 0;
      var avg = new Array(nSamp).fill(0);
      for (var ci = 0; ci < nCh; ci++) {
        if (!this.data[ci]) continue;
        for (var si = 0; si < nSamp; si++) avg[si] += this.data[ci][si];
      }
      for (si = 0; si < nSamp; si++) avg[si] /= nCh;
      this._montageChannels = this.channels.slice();
      this._montageData = [];
      for (ci = 0; ci < nCh; ci++) {
        if (!this.data[ci]) { this._montageData.push([]); continue; }
        var sub = new Array(nSamp);
        for (si = 0; si < nSamp; si++) sub[si] = this.data[ci][si] - avg[si];
        this._montageData.push(sub);
      }
    } else {
      this._montageChannels = this.channels.slice();
      this._montageData = this.data.slice();
    }

    // Filter out hidden channels (applies to all montage types)
    if (this.hiddenChannels.size > 0) {
      var visChans = [];
      var visData = [];
      for (var hi = 0; hi < this._montageChannels.length; hi++) {
        var mcName = this._montageChannels[hi];
        var baseName = mcName.split('-')[0];
        if (!this.hiddenChannels.has(mcName) && !this.hiddenChannels.has(baseName)) {
          visChans.push(mcName);
          visData.push(this._montageData[hi]);
        }
      }
      this._montageChannels = visChans;
      this._montageData = visData;
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  render() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = requestAnimationFrame(() => this._draw());
  }

  _sizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight || 600;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._width = w;
    this._height = h;
  }

  _draw() {
    const ctx = this.ctx;
    const W = this._width;
    const H = this._height;
    const o = this.opts;

    // Background
    ctx.fillStyle = o.colors.background;
    ctx.fillRect(0, 0, W, H);

    if (!this._montageChannels.length || !this._montageData.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '13px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No signal data loaded', W / 2, H / 2);
      return;
    }

    const nCh = this._montageChannels.length;
    const nSamples = this._montageData[0] ? this._montageData[0].length : 0;
    const signalW = W - o.labelWidth - o.scaleBarWidth;
    const signalTop = o.timeRulerHeight;
    const signalH = H - o.timeRulerHeight - o.minimapHeight;
    const windowSec = nSamples / this.sfreq;
    const pxPerSec = signalW / windowSec;

    // ── Time ruler ───────────────────────────────────────────────────
    this._drawTimeRuler(ctx, W, signalW, pxPerSec, windowSec);

    // ── Vertical grid ────────────────────────────────────────────────
    this._drawVerticalGrid(ctx, signalW, signalTop, signalH, pxPerSec, windowSec);

    // ── Bad segment overlays ─────────────────────────────────────────
    this._drawBadSegments(ctx, signalW, signalTop, signalH, pxPerSec, windowSec);

    // ── Drag selection ───────────────────────────────────────────────
    if (this._dragging) {
      var dsx = Math.min(this._dragStartX, this._dragCurrentX);
      var dex = Math.max(this._dragStartX, this._dragCurrentX);
      ctx.fillStyle = o.colors.selectionDrag;
      ctx.fillRect(dsx, signalTop, dex - dsx, signalH);
      // Selection time labels
      var selStartSec = this.tStart + Math.max(0, (dsx - o.labelWidth) / signalW) * windowSec;
      var selEndSec = this.tStart + Math.min(1, (dex - o.labelWidth) / signalW) * windowSec;
      ctx.fillStyle = 'rgba(0,212,188,0.9)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(selStartSec.toFixed(2) + 's', dsx, signalTop - 2);
      ctx.fillText(selEndSec.toFixed(2) + 's', dex, signalTop - 2);
    }

    // ── Channel signals ──────────────────────────────────────────────
    var chH = o.channelHeight;
    var totalChH = nCh * chH;
    var scrollY = this._scrollY;
    if (totalChH <= signalH) scrollY = 0;
    else scrollY = Math.max(0, Math.min(scrollY, totalChH - signalH));
    this._scrollY = scrollY;

    ctx.save();
    ctx.beginPath();
    ctx.rect(o.labelWidth, signalTop, signalW, signalH);
    ctx.clip();

    for (var ch = 0; ch < nCh; ch++) {
      var cy = signalTop + ch * chH + chH / 2 - scrollY;
      if (cy + chH / 2 < signalTop || cy - chH / 2 > signalTop + signalH) continue;

      var chName = this._montageChannels[ch];
      var baseChName = chName.split('-')[0];
      var isBad = this.badChannels.has(chName) || this.badChannels.has(baseChName);
      var region = _regionOf(baseChName);
      var regionColor = REGION_COLORS[region] || REGION_COLORS._default;

      // Alternating row background
      if (ch % 2 === 0) {
        ctx.fillStyle = o.colors.backgroundAlt;
        ctx.fillRect(o.labelWidth, cy - chH / 2, signalW, chH);
      }

      // Horizontal baseline
      ctx.strokeStyle = o.colors.grid;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(o.labelWidth, cy);
      ctx.lineTo(o.labelWidth + signalW, cy);
      ctx.stroke();

      // Overlay signal (gray)
      if (this.overlayData && this.overlayData[ch]) {
        this._drawSignalTrace(ctx, this.overlayData[ch], o.labelWidth, signalW, cy, chH,
          o.colors.overlaySignal, isBad ? 0.2 : 0.5);
      }

      // Main signal with region color
      var sigColor = isBad ? o.colors.labelBad : regionColor.signal;
      var sigAlpha = isBad ? 0.35 : 0.9;
      this._drawSignalTrace(ctx, this._montageData[ch], o.labelWidth, signalW, cy, chH, sigColor, sigAlpha);
    }
    ctx.restore();

    // ── Channel labels ───────────────────────────────────────────────
    this._drawChannelLabels(ctx, nCh, chH, signalTop, signalH, scrollY);

    // ── Scale bar ────────────────────────────────────────────────────
    this._drawScaleBar(ctx, W, signalTop, signalH, chH);

    // ── Annotations ──────────────────────────────────────────────────
    this._drawAnnotations(ctx, signalW, signalTop, signalH, pxPerSec, windowSec);

    // ── Event markers ─────────────────────────────────────────────────
    this._drawEventMarkers(ctx, signalW, signalTop, signalH, pxPerSec, windowSec);

    // ── Quality badges on channel labels ──────────────────────────────
    this._drawQualityBadges(ctx, nCh, chH, signalTop, scrollY);

    // ── Cursor crosshair ─────────────────────────────────────────────
    if (this._showCursor && this._cursorX > o.labelWidth && this._cursorX < W - o.scaleBarWidth
        && this._cursorY > signalTop && this._cursorY < signalTop + signalH && !this._dragging) {
      this._drawCursor(ctx, signalW, signalTop, signalH, pxPerSec, windowSec, nSamples);
    }

    // ── Measurement tool overlay ──────────────────────────────────────
    if (this.measurementTool && this.measurementTool.isActive && this.measurementTool.isActive()) {
      this.measurementTool.drawOverlay(ctx, {
        labelWidth: o.labelWidth, signalW: signalW, signalTop: signalTop, signalH: signalH,
        tStart: this.tStart, windowSec: windowSec, sensitivity: this.sensitivity,
        channelHeight: chH, channels: this._montageChannels,
      });
    }

    // ── Minimap ──────────────────────────────────────────────────────
    this._drawMinimap(ctx, W, H, signalW, windowSec);
  }

  _drawTimeRuler(ctx, W, signalW, pxPerSec, windowSec) {
    var o = this.opts;
    ctx.fillStyle = o.colors.rulerBg;
    ctx.fillRect(0, 0, W, o.timeRulerHeight);

    // Border bottom
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, o.timeRulerHeight - 0.5);
    ctx.lineTo(W, o.timeRulerHeight - 0.5);
    ctx.stroke();

    var secStep = this._calcTimeStep(windowSec, signalW);
    ctx.fillStyle = o.colors.ruler;
    ctx.strokeStyle = 'rgba(148,163,184,0.4)';
    ctx.lineWidth = 0.5;

    for (var t = Math.ceil(this.tStart / secStep) * secStep; t <= this.tStart + windowSec; t += secStep) {
      var x = o.labelWidth + (t - this.tStart) * pxPerSec;
      // Tick
      ctx.beginPath();
      ctx.moveTo(x, o.timeRulerHeight - 5);
      ctx.lineTo(x, o.timeRulerHeight);
      ctx.stroke();
      // Label
      ctx.font = '10px "JetBrains Mono", "SF Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this._formatTime(t), x, o.timeRulerHeight - 8);
    }

    // Sub-ticks
    var subStep = secStep / 5;
    if (subStep * pxPerSec > 8) {
      ctx.strokeStyle = 'rgba(148,163,184,0.2)';
      for (t = Math.ceil(this.tStart / subStep) * subStep; t <= this.tStart + windowSec; t += subStep) {
        x = o.labelWidth + (t - this.tStart) * pxPerSec;
        ctx.beginPath();
        ctx.moveTo(x, o.timeRulerHeight - 3);
        ctx.lineTo(x, o.timeRulerHeight);
        ctx.stroke();
      }
    }
  }

  _drawVerticalGrid(ctx, signalW, signalTop, signalH, pxPerSec, windowSec) {
    var o = this.opts;
    var secStep = this._calcTimeStep(windowSec, signalW);

    // Major grid lines
    ctx.strokeStyle = o.colors.gridMajor;
    ctx.lineWidth = 0.5;
    for (var t = Math.ceil(this.tStart / secStep) * secStep; t <= this.tStart + windowSec; t += secStep) {
      var x = o.labelWidth + (t - this.tStart) * pxPerSec;
      ctx.beginPath();
      ctx.moveTo(x, signalTop);
      ctx.lineTo(x, signalTop + signalH);
      ctx.stroke();
    }

    // Minor grid lines (every 0.2s or subStep)
    var subStep = secStep / 5;
    if (subStep * pxPerSec > 12) {
      ctx.strokeStyle = o.colors.gridMinor;
      for (t = Math.ceil(this.tStart / subStep) * subStep; t <= this.tStart + windowSec; t += subStep) {
        x = o.labelWidth + (t - this.tStart) * pxPerSec;
        ctx.beginPath();
        ctx.moveTo(x, signalTop);
        ctx.lineTo(x, signalTop + signalH);
        ctx.stroke();
      }
    }
  }

  _drawBadSegments(ctx, signalW, signalTop, signalH, pxPerSec, windowSec) {
    var o = this.opts;
    for (var si = 0; si < this.badSegments.length; si++) {
      var seg = this.badSegments[si];
      var startSec = seg.start_sec != null ? seg.start_sec : seg.startSec;
      var endSec = seg.end_sec != null ? seg.end_sec : seg.endSec;
      var sx = o.labelWidth + Math.max(0, (startSec - this.tStart)) * pxPerSec;
      var ex = o.labelWidth + Math.min(windowSec, (endSec - this.tStart)) * pxPerSec;
      if (ex > o.labelWidth && sx < o.labelWidth + signalW) {
        ctx.fillStyle = o.colors.badSegment;
        ctx.fillRect(sx, signalTop, ex - sx, signalH);
        ctx.strokeStyle = o.colors.badSegmentBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, signalTop, ex - sx, signalH);
        // Label
        ctx.fillStyle = 'rgba(239,107,107,0.7)';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(seg.description || 'BAD', sx + 3, signalTop + 11);
      }
    }
  }

  _drawChannelLabels(ctx, nCh, chH, signalTop, signalH, scrollY) {
    var o = this.opts;
    // Label background
    ctx.fillStyle = o.colors.background;
    ctx.fillRect(0, signalTop, o.labelWidth, signalH);
    // Right border
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.labelWidth - 0.5, signalTop);
    ctx.lineTo(o.labelWidth - 0.5, signalTop + signalH);
    ctx.stroke();

    for (var ch = 0; ch < nCh; ch++) {
      var cy = signalTop + ch * chH + chH / 2 - scrollY;
      if (cy + chH / 2 < signalTop || cy - chH / 2 > signalTop + signalH) continue;

      var chName = this._montageChannels[ch];
      var baseChName = chName.split('-')[0];
      var isBad = this.badChannels.has(chName) || this.badChannels.has(baseChName);
      var region = _regionOf(baseChName);
      var regionColor = REGION_COLORS[region] || REGION_COLORS._default;

      // Region color indicator bar
      ctx.fillStyle = isBad ? o.colors.labelBad : regionColor.signal;
      ctx.fillRect(0, cy - chH / 2 + 1, 3, chH - 2);

      // Label text
      ctx.fillStyle = isBad ? o.colors.labelBad : regionColor.label;
      ctx.font = (isBad ? 'bold ' : '') + '10px "JetBrains Mono", "SF Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(chName, o.labelWidth - 10, cy + 3.5);

      // Strikethrough for bad channels
      if (isBad) {
        var tw = ctx.measureText(chName).width;
        ctx.strokeStyle = o.colors.labelBad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(o.labelWidth - 10 - tw, cy + 1);
        ctx.lineTo(o.labelWidth - 10, cy + 1);
        ctx.stroke();
      }
    }
  }

  _drawScaleBar(ctx, W, signalTop, signalH, chH) {
    var o = this.opts;
    var sbX = W - o.scaleBarWidth;

    // Background
    ctx.fillStyle = o.colors.background;
    ctx.fillRect(sbX, signalTop, o.scaleBarWidth, signalH);
    // Left border
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sbX + 0.5, signalTop);
    ctx.lineTo(sbX + 0.5, signalTop + signalH);
    ctx.stroke();

    // Scale calibration
    var midY = signalTop + signalH / 2;
    var scale = (chH / 2) / this.sensitivity;
    var barUV = this.sensitivity; // 1 division = sensitivity µV
    var barPx = barUV * scale;
    if (barPx < 5) barPx = 5;
    if (barPx > signalH * 0.4) barPx = signalH * 0.4;

    var scaleX = sbX + o.scaleBarWidth / 2;
    ctx.strokeStyle = o.colors.scaleBar;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX, midY - barPx);
    ctx.lineTo(scaleX, midY + barPx);
    ctx.stroke();
    // End caps
    ctx.beginPath();
    ctx.moveTo(scaleX - 4, midY - barPx);
    ctx.lineTo(scaleX + 4, midY - barPx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(scaleX - 4, midY + barPx);
    ctx.lineTo(scaleX + 4, midY + barPx);
    ctx.stroke();
    // Label
    ctx.fillStyle = o.colors.scaleBar;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.sensitivity + ' \u00B5V', scaleX, midY + barPx + 14);
  }

  _drawAnnotations(ctx, signalW, signalTop, signalH, pxPerSec, windowSec) {
    var o = this.opts;
    for (var ai = 0; ai < this.annotations.length; ai++) {
      var ann = this.annotations[ai];
      var ax = o.labelWidth + (ann.onset - this.tStart) * pxPerSec;
      if (ax >= o.labelWidth && ax <= o.labelWidth + signalW) {
        // Annotation background band
        var adur = (ann.duration || 0.1) * pxPerSec;
        ctx.fillStyle = o.colors.annotationBg;
        ctx.fillRect(ax, signalTop, Math.max(adur, 2), signalH);
        // Line
        ctx.strokeStyle = o.colors.annotationLine;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(ax, signalTop);
        ctx.lineTo(ax, signalTop + signalH);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label
        ctx.fillStyle = o.colors.annotationLine;
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(ann.description || 'EVT', ax + 3, signalTop + 12);
      }
    }
  }

  _drawEventMarkers(ctx, signalW, signalTop, signalH, pxPerSec, windowSec) {
    if (!this.eventMarkers || !this.eventMarkers.length) return;
    var o = this.opts;
    for (var ei = 0; ei < this.eventMarkers.length; ei++) {
      var evt = this.eventMarkers[ei];
      var evtTime = evt.time != null ? evt.time : evt.timeSec;
      if (evtTime < this.tStart || evtTime > this.tStart + windowSec) continue;
      var ex = o.labelWidth + (evtTime - this.tStart) * pxPerSec;
      var color = evt.color || '#4caf50';

      // Vertical line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(ex, signalTop);
      ctx.lineTo(ex, signalTop + signalH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Triangle marker at top
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ex - 5, signalTop);
      ctx.lineTo(ex + 5, signalTop);
      ctx.lineTo(ex, signalTop + 7);
      ctx.closePath();
      ctx.fill();

      // Label pill
      var label = evt.label || 'Event';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      var lw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      ctx.beginPath();
      ctx.roundRect(ex - lw / 2 - 4, signalTop + 9, lw + 8, 14, 3);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(label, ex, signalTop + 20);
    }
  }

  _drawQualityBadges(ctx, nCh, chH, signalTop, scrollY) {
    if (!this.channelQuality || !Object.keys(this.channelQuality).length) return;
    var o = this.opts;
    var QUALITY_COLORS = { good: '#4caf50', moderate: '#ff9800', bad: '#ef5350', flat: '#9e9e9e' };

    for (var ch = 0; ch < nCh; ch++) {
      var cy = signalTop + ch * chH + chH / 2 - scrollY;
      if (cy + chH / 2 < signalTop || cy - chH / 2 > signalTop + (this._height - o.timeRulerHeight - o.minimapHeight)) continue;

      var chName = this._montageChannels[ch];
      var baseCh = chName.split('-')[0];
      var q = this.channelQuality[chName] || this.channelQuality[baseCh];
      if (!q || !q.grade) continue;

      var bColor = QUALITY_COLORS[q.grade] || QUALITY_COLORS.good;
      // Small dot badge next to label
      ctx.fillStyle = bColor;
      ctx.beginPath();
      ctx.arc(o.labelWidth - 5, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawCursor(ctx, signalW, signalTop, signalH, pxPerSec, windowSec, nSamples) {
    var o = this.opts;
    var cx = this._cursorX;
    var cy = this._cursorY;

    // Vertical line
    ctx.strokeStyle = o.colors.cursorLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(cx, signalTop);
    ctx.lineTo(cx, signalTop + signalH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(o.labelWidth, cy);
    ctx.lineTo(o.labelWidth + signalW, cy);
    ctx.stroke();

    // Time readout at top
    var relX = cx - o.labelWidth;
    var timeSec = this.tStart + (relX / signalW) * windowSec;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    var timeStr = timeSec.toFixed(3) + 's';
    var tw = ctx.measureText(timeStr).width;

    // Pill background
    ctx.beginPath();
    ctx.roundRect(cx - tw / 2 - 6, signalTop + 2, tw + 12, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#00d4bc';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(timeStr, cx, signalTop + 14);

    // Amplitude readout near cursor
    var chIdx = this._getChannelAtY(cy);
    if (chIdx >= 0 && chIdx < this._montageChannels.length && this._montageData[chIdx]) {
      var sampleIdx = Math.round(relX / signalW * nSamples);
      if (sampleIdx >= 0 && sampleIdx < nSamples) {
        var ampUV = this._montageData[chIdx][sampleIdx];
        if (ampUV != null) {
          var ampStr = ampUV.toFixed(1) + ' \u00B5V';
          var ampW = ctx.measureText(ampStr).width;
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.beginPath();
          ctx.roundRect(cx + 10, cy - 8, ampW + 10, 16, 4);
          ctx.fill();
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(ampStr, cx + 15, cy + 4);
        }
      }
    }
  }

  _drawMinimap(ctx, W, H, signalW, windowSec) {
    var o = this.opts;
    var mmY = H - o.minimapHeight;

    // Background
    ctx.fillStyle = o.colors.minimapBg;
    ctx.fillRect(0, mmY, W, o.minimapHeight);
    // Top border
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mmY + 0.5);
    ctx.lineTo(W, mmY + 0.5);
    ctx.stroke();

    if (this.totalDuration <= 0) return;

    var mmX = o.labelWidth;
    var mmW = signalW;
    var mmH = o.minimapHeight - 4;

    // Draw simplified waveform (use first channel)
    if (this._montageData.length > 0 && this._montageData[0] && this._montageData[0].length > 2) {
      var samples = this._montageData[0];
      var n = samples.length;
      var midMM = mmY + o.minimapHeight / 2;
      ctx.strokeStyle = o.colors.minimapWave;
      ctx.lineWidth = 1;
      ctx.beginPath();
      var mmScale = mmH / (4 * this.sensitivity);
      for (var i = 0; i < mmW; i++) {
        var si = Math.floor(i / mmW * n);
        var val = samples[Math.min(si, n - 1)];
        var y = midMM - val * mmScale;
        y = Math.max(mmY + 2, Math.min(mmY + o.minimapHeight - 2, y));
        if (i === 0) ctx.moveTo(mmX + i, y);
        else ctx.lineTo(mmX + i, y);
      }
      ctx.stroke();
    }

    // Position indicator
    var fraction = windowSec / this.totalDuration;
    var thumbW = Math.max(6, mmW * fraction);
    var thumbX = mmX + (this.tStart / this.totalDuration) * (mmW - thumbW);

    ctx.fillStyle = o.colors.minimapThumb;
    ctx.beginPath();
    ctx.roundRect(thumbX, mmY + 2, thumbW, mmH, 3);
    ctx.fill();

    // Edge markers
    ctx.strokeStyle = o.colors.minimapPosition;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(thumbX, mmY + 2);
    ctx.lineTo(thumbX, mmY + mmH + 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(thumbX + thumbW, mmY + 2);
    ctx.lineTo(thumbX + thumbW, mmY + mmH + 2);
    ctx.stroke();

    // Time labels
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(this._formatTime(0), mmX + 3, mmY + mmH + 1);
    ctx.textAlign = 'right';
    ctx.fillText(this._formatTime(this.totalDuration), mmX + mmW - 3, mmY + mmH + 1);
  }

  _drawSignalTrace(ctx, samples, x0, width, cy, chH, color, alpha) {
    if (!samples || samples.length < 2) return;
    var n = samples.length;
    var pxPerSample = width / n;
    var scale = (chH / 2) / this.sensitivity;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (pxPerSample >= 1.5) {
      ctx.moveTo(x0, cy - samples[0] * scale);
      for (var i = 1; i < n; i++) {
        ctx.lineTo(x0 + i * pxPerSample, cy - samples[i] * scale);
      }
    } else {
      // Min-max decimation
      var samplesPerPx = n / width;
      for (var px = 0; px < width; px++) {
        var si = Math.floor(px * samplesPerPx);
        var ei = Math.min(Math.floor((px + 1) * samplesPerPx), n);
        var mn = samples[si], mx = samples[si];
        for (var j = si + 1; j < ei; j++) {
          if (samples[j] < mn) mn = samples[j];
          if (samples[j] > mx) mx = samples[j];
        }
        if (px === 0) ctx.moveTo(x0 + px, cy - mx * scale);
        ctx.lineTo(x0 + px, cy - mx * scale);
        ctx.lineTo(x0 + px, cy - mn * scale);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  _calcTimeStep(windowSec, widthPx) {
    var minPxBetween = 70;
    var maxTicks = widthPx / minPxBetween;
    var rawStep = windowSec / maxTicks;
    var steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] >= rawStep) return steps[i];
    }
    return 60;
  }

  _formatTime(sec) {
    if (sec < 60) return sec.toFixed(1) + 's';
    var m = Math.floor(sec / 60);
    var s = Math.round(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ── Mouse interactions ──────────────────────────────────────────────

  _onMouseDown(e) {
    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var o = this.opts;

    // Minimap click → jump to position
    if (my > this._height - o.minimapHeight && this.totalDuration > 0) {
      var signalW = this._width - o.labelWidth - o.scaleBarWidth;
      var nSamples = this._montageData[0] ? this._montageData[0].length : 0;
      var windowSec = nSamples / this.sfreq;
      var relX = mx - o.labelWidth;
      var frac = relX / signalW;
      var newStart = Math.max(0, Math.min(this.totalDuration - windowSec, frac * this.totalDuration));
      if (this.onTimeNavigate) this.onTimeNavigate(newStart);
      return;
    }

    // Label area → toggle bad channel
    if (mx < o.labelWidth && my > o.timeRulerHeight && my < this._height - o.minimapHeight) {
      var chIdx = this._getChannelAtY(my);
      if (chIdx >= 0 && chIdx < this._montageChannels.length) {
        var chName = this._montageChannels[chIdx].split('-')[0];
        if (this.badChannels.has(chName)) this.badChannels.delete(chName);
        else this.badChannels.add(chName);
        this.render();
        if (this.onChannelClick) this.onChannelClick(chName);
      }
      return;
    }

    // Signal area interaction (depends on mode)
    if (mx >= o.labelWidth && mx < this._width - o.scaleBarWidth
        && my > o.timeRulerHeight && my < this._height - o.minimapHeight) {

      // Measurement mode: emit point data
      if (this.interactionMode === 'measure') {
        var signalW2 = this._width - o.labelWidth - o.scaleBarWidth;
        var nSamp2 = this._montageData[0] ? this._montageData[0].length : 0;
        var winSec2 = nSamp2 / this.sfreq;
        var relX2 = mx - o.labelWidth;
        var timeSec = this.tStart + (relX2 / signalW2) * winSec2;
        var chIdx2 = this._getChannelAtY(my);
        var ampUV = null;
        var chN = null;
        if (chIdx2 >= 0 && chIdx2 < this._montageChannels.length) {
          chN = this._montageChannels[chIdx2];
          var sIdx = Math.round(relX2 / signalW2 * nSamp2);
          if (this._montageData[chIdx2] && sIdx >= 0 && sIdx < nSamp2) {
            ampUV = this._montageData[chIdx2][sIdx];
          }
        }
        if (this.onMeasurementPoint) this.onMeasurementPoint(timeSec, ampUV, chN);
        return;
      }

      // Event mode: emit event placement
      if (this.interactionMode === 'event') {
        var signalW3 = this._width - o.labelWidth - o.scaleBarWidth;
        var nSamp3 = this._montageData[0] ? this._montageData[0].length : 0;
        var winSec3 = nSamp3 / this.sfreq;
        var relX3 = mx - o.labelWidth;
        var evtTime = this.tStart + (relX3 / signalW3) * winSec3;
        if (this.onEventPlace) this.onEventPlace(evtTime);
        return;
      }

      // Default select mode: start drag annotation
      this._dragging = true;
      this._dragStartX = mx;
      this._dragCurrentX = mx;
    }
  }

  _onMouseMove(e) {
    var rect = this.canvas.getBoundingClientRect();
    this._cursorX = e.clientX - rect.left;
    this._cursorY = e.clientY - rect.top;
    this._showCursor = true;

    if (this._dragging) {
      this._dragCurrentX = this._cursorX;
    }

    this.render();

    // Emit cursor info
    if (this.onCursorMove) {
      this.onCursorMove(this.getCursorInfo());
    }
  }

  _onMouseUp(e) {
    if (!this._dragging) return;
    this._dragging = false;

    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var o = this.opts;
    var signalW = this._width - o.labelWidth - o.scaleBarWidth;
    var nSamples = this._montageData[0] ? this._montageData[0].length : 0;
    var windowSec = nSamples / this.sfreq;

    var startX = Math.min(this._dragStartX, mx) - o.labelWidth;
    var endX = Math.max(this._dragStartX, mx) - o.labelWidth;

    if (endX - startX > 5) {
      var startSec = this.tStart + (startX / signalW) * windowSec;
      var endSec = this.tStart + (endX / signalW) * windowSec;
      startSec = Math.max(0, startSec);
      endSec = Math.min(this.totalDuration, endSec);
      if (this.onSegmentSelect) this.onSegmentSelect(startSec, endSec);
    }

    this.render();
  }

  _onMouseLeave() {
    this._showCursor = false;
    if (this._dragging) {
      this._dragging = false;
    }
    this.render();
  }

  _onWheel(e) {
    e.preventDefault();
    var o = this.opts;
    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;

    if (e.ctrlKey || e.metaKey) {
      var delta = e.deltaY > 0 ? 1.15 : 0.87;
      this.sensitivity = Math.max(1, Math.min(500, this.sensitivity * delta));
      this.render();
      return;
    }

    if (e.shiftKey || (mx >= o.labelWidth && mx < this._width - o.scaleBarWidth)) {
      var nSamples = this._montageData[0] ? this._montageData[0].length : 0;
      var windowSec = nSamples / this.sfreq;
      var scrollSec = windowSec * 0.2 * (e.deltaY > 0 ? 1 : -1);
      var newStart = Math.max(0, Math.min(this.totalDuration - windowSec, this.tStart + scrollSec));
      if (newStart !== this.tStart) {
        this.tStart = newStart;
        if (this.onTimeNavigate) this.onTimeNavigate(newStart);
      }
      return;
    }

    this._scrollY += e.deltaY * 0.5;
    this.render();
  }

  _getChannelAtY(my) {
    var o = this.opts;
    var localY = my - o.timeRulerHeight + this._scrollY;
    return Math.floor(localY / o.channelHeight);
  }

  _onResize() {
    this._sizeCanvas();
    this.render();
  }
}
