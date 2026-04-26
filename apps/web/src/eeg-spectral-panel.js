// ─────────────────────────────────────────────────────────────────────────────
// eeg-spectral-panel.js — Canvas2D Spectral Analysis Panel for Clinical EEG
//
// Renders three modes inside a single Canvas element:
//   1. PSD (Power Spectral Density) — frequency-domain power plot per channel
//      or averaged by brain region, with clinical band annotations.
//   2. Spectrogram — time-frequency heatmap (STFT) with viridis-like colormap.
//   3. Amplitude Statistics — per-channel RMS, peak-to-peak, std dev bars
//      plus a mini histogram for the selected channel.
//
// No external dependencies. Pure Canvas2D, DPR-aware, dark-themed.
// ─────────────────────────────────────────────────────────────────────────────

// ── Region mapping (mirrors eeg-signal-renderer.js) ─────────────────────────
var REGION_MAP = {
  Fp1: 'frontal', Fp2: 'frontal', Fpz: 'frontal',
  F7: 'frontal',  F3: 'frontal',  Fz: 'frontal', F4: 'frontal', F8: 'frontal',
  AF3: 'frontal', AF4: 'frontal', AF7: 'frontal', AF8: 'frontal',
  F1: 'frontal',  F2: 'frontal',  F5: 'frontal',  F6: 'frontal',
  T3: 'temporal', T4: 'temporal', T5: 'temporal', T6: 'temporal',
  T7: 'temporal', T8: 'temporal', FT7: 'temporal', FT8: 'temporal',
  TP7: 'temporal', TP8: 'temporal',
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

var REGION_COLORS = {
  frontal:   '#42a5f5',
  central:   '#66bb6a',
  temporal:  '#ffa726',
  parietal:  '#ab47bc',
  occipital: '#ef5350',
  _default:  '#00d4bc',
};

// Clinical EEG frequency bands (Hz)
var BANDS = [
  { name: 'delta', lo: 1, hi: 4,  color: 'rgba(171,71,188,0.12)' },
  { name: 'theta', lo: 4, hi: 8,  color: 'rgba(66,165,245,0.10)' },
  { name: 'alpha', lo: 8, hi: 13, color: 'rgba(102,187,106,0.10)' },
  { name: 'beta',  lo: 13, hi: 30, color: 'rgba(255,167,38,0.08)' },
  { name: 'gamma', lo: 30, hi: 60, color: 'rgba(239,83,80,0.08)' },
];

var FONT_MONO = '10px "JetBrains Mono","SF Mono",monospace';
var FONT_LABEL = '11px "JetBrains Mono","SF Mono",monospace';
var BG_COLOR      = '#080c14';
var GRID_COLOR    = 'rgba(255,255,255,0.06)';
var TEXT_DIM      = '#94a3b8';
var TEXT_BRIGHT   = '#e2e8f0';
var ACCENT        = '#00d4bc';

function _regionOf(ch) {
  return REGION_MAP[ch] || REGION_MAP[ch.replace(/[0-9]/g, '')] || '_default';
}

function _colorOf(ch) {
  return REGION_COLORS[_regionOf(ch)] || REGION_COLORS._default;
}

// ── Viridis-like colormap (64 stops, dark blue → green → yellow) ────────────
var _VIRIDIS = null;
function _viridisLUT() {
  if (_VIRIDIS) return _VIRIDIS;
  // Simplified viridis key colors at t = 0, 0.25, 0.5, 0.75, 1
  var keys = [
    [68, 1, 84],     // dark purple-blue
    [59, 82, 139],   // blue
    [33, 145, 140],  // teal-green
    [94, 201, 98],   // green
    [253, 231, 37],  // yellow
  ];
  _VIRIDIS = new Array(256);
  for (var i = 0; i < 256; i++) {
    var t = i / 255;
    var seg = t * (keys.length - 1);
    var idx = Math.min(Math.floor(seg), keys.length - 2);
    var f = seg - idx;
    var a = keys[idx], b = keys[idx + 1];
    _VIRIDIS[i] = [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f),
    ];
  }
  return _VIRIDIS;
}

// ── FFT implementation (Cooley-Tukey radix-2, in-place) ─────────────────────

/**
 * In-place radix-2 FFT. `re` and `im` are Float64Arrays of length N (must
 * be a power of 2). After the call they contain the DFT coefficients.
 */
function _fft(re, im) {
  var n = re.length;
  // Bit-reversal permutation
  for (var i = 1, j = 0; i < n; i++) {
    var bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      var tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  // Butterfly passes
  for (var len = 2; len <= n; len <<= 1) {
    var halfLen = len >> 1;
    var angle = -2 * Math.PI / len;
    var wRe = Math.cos(angle);
    var wIm = Math.sin(angle);
    for (var i = 0; i < n; i += len) {
      var curRe = 1, curIm = 0;
      for (var k = 0; k < halfLen; k++) {
        var evenIdx = i + k;
        var oddIdx  = i + k + halfLen;
        var tRe = curRe * re[oddIdx] - curIm * im[oddIdx];
        var tIm = curRe * im[oddIdx] + curIm * re[oddIdx];
        re[oddIdx] = re[evenIdx] - tRe;
        im[oddIdx] = im[evenIdx] - tIm;
        re[evenIdx] += tRe;
        im[evenIdx] += tIm;
        var nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Next power of 2 >= n.
 */
function _nextPow2(n) {
  var p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Compute one-sided PSD from a 1-D real signal.
 * @param {number[]} signal  - time-domain samples
 * @param {number}   sfreq   - sampling frequency (Hz)
 * @param {number}   [nfft]  - FFT size (default: next power of 2 of signal length)
 * @returns {{ freqs: Float64Array, power: Float64Array }}
 */
function _computePSD(signal, sfreq, nfft) {
  var N = signal.length;
  if (!nfft) nfft = _nextPow2(N);
  var re = new Float64Array(nfft);
  var im = new Float64Array(nfft);

  // Apply Hanning window and copy into real buffer (zero-padded)
  for (var i = 0; i < N; i++) {
    var w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
    re[i] = signal[i] * w;
  }

  _fft(re, im);

  // One-sided power spectrum (0 .. nfft/2)
  var half = (nfft >> 1) + 1;
  var freqs = new Float64Array(half);
  var power = new Float64Array(half);
  var scale = 2.0 / (sfreq * N); // PSD scaling: µV²/Hz

  for (var k = 0; k < half; k++) {
    freqs[k] = k * sfreq / nfft;
    power[k] = (re[k] * re[k] + im[k] * im[k]) * scale;
  }
  // DC and Nyquist are not doubled
  power[0] *= 0.5;
  if (half > 1) power[half - 1] *= 0.5;

  return { freqs: freqs, power: power };
}

/**
 * Compute STFT spectrogram for a 1-D real signal.
 * @param {number[]} signal     - time-domain samples
 * @param {number}   sfreq      - sampling frequency (Hz)
 * @param {number}   windowSize - samples per STFT window
 * @param {number}   hopSize    - hop between successive windows (samples)
 * @returns {{ times: Float64Array, freqs: Float64Array, power2D: Float64Array[] }}
 */
function _computeSpectrogram(signal, sfreq, windowSize, hopSize) {
  var N = signal.length;
  var nfft = _nextPow2(windowSize);
  var half = (nfft >> 1) + 1;

  var nFrames = Math.max(1, Math.floor((N - windowSize) / hopSize) + 1);
  var times = new Float64Array(nFrames);
  var freqs = new Float64Array(half);
  var power2D = [];

  for (var k = 0; k < half; k++) {
    freqs[k] = k * sfreq / nfft;
  }

  for (var f = 0; f < nFrames; f++) {
    var offset = f * hopSize;
    times[f] = (offset + windowSize * 0.5) / sfreq;
    var re = new Float64Array(nfft);
    var im = new Float64Array(nfft);
    for (var i = 0; i < windowSize; i++) {
      var w = 0.5 * (1 - Math.cos(2 * Math.PI * i / (windowSize - 1)));
      re[i] = (offset + i < N) ? signal[offset + i] * w : 0;
    }
    _fft(re, im);
    var pwr = new Float64Array(half);
    var scale = 2.0 / (sfreq * windowSize);
    for (var k = 0; k < half; k++) {
      pwr[k] = (re[k] * re[k] + im[k] * im[k]) * scale;
    }
    pwr[0] *= 0.5;
    if (half > 1) pwr[half - 1] *= 0.5;
    power2D.push(pwr);
  }

  return { times: times, freqs: freqs, power2D: power2D };
}

// ── Utility drawing helpers ─────────────────────────────────────────────────

function _drawDashedLine(ctx, x1, y1, x2, y2, dash, color) {
  ctx.save();
  ctx.setLineDash(dash);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
// EEGSpectralPanel class
// ═════════════════════════════════════════════════════════════════════════════

export class EEGSpectralPanel {

  /**
   * @param {HTMLElement} containerEl - parent div; panel creates its own canvas
   * @param {object}      [options]
   * @param {number}      [options.padTop=32]
   * @param {number}      [options.padRight=20]
   * @param {number}      [options.padBottom=40]
   * @param {number}      [options.padLeft=60]
   * @param {number}      [options.maxFreq=60]    - upper frequency bound (Hz)
   */
  constructor(containerEl, options) {
    var opts = options || {};
    this._container = containerEl;
    this._mode = 'psd';               // 'psd' | 'spectrogram' | 'stats'
    this._regionView = false;          // true → average by region
    this._selectedChannel = null;

    // Padding (CSS pixels)
    this._padTop    = opts.padTop    || 32;
    this._padRight  = opts.padRight  || 20;
    this._padBottom = opts.padBottom || 40;
    this._padLeft   = opts.padLeft   || 60;
    this._maxFreq   = opts.maxFreq   || 60;

    // Data (set via setData)
    this._channels = [];
    this._data     = [];   // number[][]  — one row per channel
    this._sfreq    = 256;
    this._tStart   = 0;

    // Cached analysis results (recomputed on setData)
    this._psdCache         = null;  // { region/ch → {freqs, power} }
    this._spectrogramCache = null;
    this._statsCache       = null;

    // Create canvas
    this._canvas = document.createElement('canvas');
    this._canvas.style.display = 'block';
    this._canvas.style.width   = '100%';
    this._canvas.style.height  = '100%';
    this._canvas.style.background = BG_COLOR;
    this._container.appendChild(this._canvas);
    this._ctx = this._canvas.getContext('2d');

    // Resize observer for responsive layout
    this._resizeObs = new ResizeObserver(this._onResize.bind(this));
    this._resizeObs.observe(this._container);
    this._syncSize();
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Supply EEG data. Triggers recomputation of cached spectra.
   * @param {string[]}   channels - channel names, e.g. ['Fp1','Fp2',...]
   * @param {number[][]} data     - 2-D array [nChannels][nSamples]
   * @param {number}     sfreq    - sampling rate in Hz
   * @param {number}     [tStart] - start time of this data window (seconds)
   */
  setData(channels, data, sfreq, tStart) {
    this._channels = channels || [];
    this._data     = data     || [];
    this._sfreq    = sfreq    || 256;
    this._tStart   = tStart   || 0;
    this._invalidateCaches();
    this.render();
  }

  /**
   * Switch the active mode.
   * @param {'psd'|'spectrogram'|'stats'} mode
   */
  setMode(mode) {
    if (mode !== this._mode) {
      this._mode = mode;
      this.render();
    }
  }

  /** Highlight a specific channel in the current view. */
  setSelectedChannel(chName) {
    this._selectedChannel = chName;
    this.render();
  }

  /** Toggle per-channel vs region-averaged PSD display. */
  setRegionView(enabled) {
    this._regionView = !!enabled;
    this._psdCache = null;
    this.render();
  }

  /** Full redraw of the active mode. */
  render() {
    this._syncSize();
    var ctx = this._ctx;
    var w = this._canvas.width;
    var h = this._canvas.height;
    var dpr = window.devicePixelRatio || 1;

    // Clear
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    if (this._channels.length === 0 || this._data.length === 0) {
      ctx.fillStyle = TEXT_DIM;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data — load an EEG recording', w / (2 * dpr), h / (2 * dpr));
      return;
    }

    if (this._mode === 'psd')          this._renderPSD();
    else if (this._mode === 'spectrogram') this._renderSpectrogram();
    else if (this._mode === 'stats')   this._renderStats();
  }

  /** Clean up resources. */
  destroy() {
    if (this._resizeObs) { this._resizeObs.disconnect(); this._resizeObs = null; }
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    this._canvas = null;
    this._ctx = null;
  }

  // ── Tab bar factory ─────────────────────────────────────────────────────

  /**
   * Create a styled tab bar and wire it to the panel's setMode method.
   * @param {HTMLElement}       containerEl - parent div (tabs placed at top)
   * @param {EEGSpectralPanel}  panel       - panel instance
   * @returns {HTMLElement} the tab bar element
   */
  static createTabBar(containerEl, panel) {
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:0;background:#0b1120;border-bottom:1px solid rgba(255,255,255,0.08);user-select:none;';

    var tabs = [
      { key: 'psd',         label: 'PSD' },
      { key: 'spectrogram', label: 'Spectrogram' },
      { key: 'stats',       label: 'Statistics' },
    ];

    var buttons = [];

    function setActive(activeKey) {
      for (var i = 0; i < buttons.length; i++) {
        var isActive = buttons[i].dataset.key === activeKey;
        buttons[i].style.background = isActive ? 'rgba(0,212,188,0.15)' : 'transparent';
        buttons[i].style.borderBottom = isActive ? '2px solid #00d4bc' : '2px solid transparent';
        buttons[i].style.color = isActive ? '#e2e8f0' : '#94a3b8';
      }
    }

    for (var i = 0; i < tabs.length; i++) {
      var btn = document.createElement('button');
      btn.textContent = tabs[i].label;
      btn.dataset.key = tabs[i].key;
      btn.style.cssText =
        'padding:6px 16px;font:11px "JetBrains Mono","SF Mono",monospace;' +
        'border:none;cursor:pointer;outline:none;transition:background 0.15s,color 0.15s;';
      btn.addEventListener('click', (function (key) {
        return function () {
          panel.setMode(key);
          setActive(key);
        };
      })(tabs[i].key));
      buttons.push(btn);
      bar.appendChild(btn);
    }

    setActive(panel._mode);
    containerEl.insertBefore(bar, containerEl.firstChild);
    return bar;
  }

  // ── Internal helpers ────────────────────────────────────────────────────

  _syncSize() {
    var dpr = window.devicePixelRatio || 1;
    var rect = this._container.getBoundingClientRect();
    var w = Math.round(rect.width)  || 400;
    var h = Math.round(rect.height) || 300;
    if (this._canvas.width !== w * dpr || this._canvas.height !== h * dpr) {
      this._canvas.width  = w * dpr;
      this._canvas.height = h * dpr;
      this._canvas.style.width  = w + 'px';
      this._canvas.style.height = h + 'px';
      this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  _onResize() { this.render(); }

  _invalidateCaches() {
    this._psdCache = null;
    this._spectrogramCache = null;
    this._statsCache = null;
  }

  /** Plot area bounds in CSS pixels. */
  _plotArea() {
    var rect = this._container.getBoundingClientRect();
    var w = Math.round(rect.width)  || 400;
    var h = Math.round(rect.height) || 300;
    return {
      x: this._padLeft,
      y: this._padTop,
      w: w - this._padLeft - this._padRight,
      h: h - this._padTop - this._padBottom,
    };
  }

  // ── PSD computation & caching ─────────────────────────────────────────

  _ensurePSD() {
    if (this._psdCache) return this._psdCache;
    var cache = {};
    var nfft = _nextPow2(Math.max(256, this._data[0] ? this._data[0].length : 256));

    if (this._regionView) {
      // Average PSDs by region
      var regionSums = {};
      var regionCounts = {};
      for (var ci = 0; ci < this._channels.length; ci++) {
        var rgn = _regionOf(this._channels[ci]);
        var psd = _computePSD(this._data[ci], this._sfreq, nfft);
        if (!regionSums[rgn]) {
          regionSums[rgn] = new Float64Array(psd.power.length);
          regionCounts[rgn] = 0;
        }
        for (var k = 0; k < psd.power.length; k++) regionSums[rgn][k] += psd.power[k];
        regionCounts[rgn]++;
        if (!cache._freqs) cache._freqs = psd.freqs;
      }
      var regionNames = Object.keys(regionSums);
      for (var ri = 0; ri < regionNames.length; ri++) {
        var rn = regionNames[ri];
        var avg = new Float64Array(regionSums[rn].length);
        for (var k = 0; k < avg.length; k++) avg[k] = regionSums[rn][k] / regionCounts[rn];
        cache[rn] = { freqs: cache._freqs, power: avg, color: REGION_COLORS[rn] || REGION_COLORS._default, label: rn };
      }
    } else {
      // Per-channel PSD
      for (var ci = 0; ci < this._channels.length; ci++) {
        var psd = _computePSD(this._data[ci], this._sfreq, nfft);
        cache[this._channels[ci]] = { freqs: psd.freqs, power: psd.power, color: _colorOf(this._channels[ci]), label: this._channels[ci] };
        if (!cache._freqs) cache._freqs = psd.freqs;
      }
    }

    this._psdCache = cache;
    return cache;
  }

  // ── PSD Rendering ─────────────────────────────────────────────────────

  _renderPSD() {
    var ctx = this._ctx;
    var area = this._plotArea();
    var cache = this._ensurePSD();

    // Determine data range (log scale Y)
    var freqs = cache._freqs;
    var maxFreq = this._maxFreq;
    var allPower = [];
    var keys = Object.keys(cache).filter(function (k) { return k !== '_freqs'; });
    for (var ki = 0; ki < keys.length; ki++) {
      var pwr = cache[keys[ki]].power;
      for (var j = 0; j < pwr.length; j++) {
        if (freqs[j] > 0.5 && freqs[j] <= maxFreq && pwr[j] > 0) allPower.push(pwr[j]);
      }
    }
    if (allPower.length === 0) return;
    allPower.sort(function (a, b) { return a - b; });
    var pMin = Math.log10(allPower[Math.floor(allPower.length * 0.01)] || 1e-4);
    var pMax = Math.log10(allPower[Math.floor(allPower.length * 0.99)] || 1);
    var pRange = pMax - pMin || 1;
    // Expand a bit for headroom
    pMin -= pRange * 0.05;
    pMax += pRange * 0.1;
    pRange = pMax - pMin;

    // Map helpers
    var xOf = function (freq) { return area.x + (freq / maxFreq) * area.w; };
    var yOf = function (pwr) {
      var lp = Math.log10(Math.max(pwr, 1e-12));
      return area.y + area.h - ((lp - pMin) / pRange) * area.h;
    };

    // ── Band shading & boundaries ────────────────────────────────────────
    ctx.save();
    for (var bi = 0; bi < BANDS.length; bi++) {
      var band = BANDS[bi];
      var bx1 = xOf(band.lo), bx2 = xOf(band.hi);
      // Subtle fill
      ctx.fillStyle = band.color;
      ctx.fillRect(bx1, area.y, bx2 - bx1, area.h);
      // Dashed boundary lines
      _drawDashedLine(ctx, bx1, area.y, bx1, area.y + area.h, [4, 4], 'rgba(255,255,255,0.12)');
      // Band label at top
      ctx.fillStyle = TEXT_DIM;
      ctx.font = FONT_MONO;
      ctx.textAlign = 'center';
      ctx.fillText(band.name, (bx1 + bx2) / 2, area.y - 6);
    }
    // Right boundary of last band
    var lastBx2 = xOf(BANDS[BANDS.length - 1].hi);
    _drawDashedLine(ctx, lastBx2, area.y, lastBx2, area.y + area.h, [4, 4], 'rgba(255,255,255,0.12)');
    ctx.restore();

    // ── Grid lines ───────────────────────────────────────────────────────
    ctx.save();
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    // Horizontal grid (log scale, 1 per decade)
    var decadeMin = Math.floor(pMin);
    var decadeMax = Math.ceil(pMax);
    ctx.font = FONT_MONO;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'right';
    for (var d = decadeMin; d <= decadeMax; d++) {
      var gy = yOf(Math.pow(10, d));
      if (gy < area.y || gy > area.y + area.h) continue;
      ctx.beginPath(); ctx.moveTo(area.x, gy); ctx.lineTo(area.x + area.w, gy); ctx.stroke();
      ctx.fillText('1e' + d, area.x - 6, gy + 3);
    }
    // Vertical grid (every 10 Hz)
    ctx.textAlign = 'center';
    for (var fv = 0; fv <= maxFreq; fv += 10) {
      var gx = xOf(fv);
      ctx.beginPath(); ctx.moveTo(gx, area.y); ctx.lineTo(gx, area.y + area.h); ctx.stroke();
      ctx.fillText(fv + ' Hz', gx, area.y + area.h + 14);
    }
    ctx.restore();

    // ── Draw traces ──────────────────────────────────────────────────────
    for (var ki = 0; ki < keys.length; ki++) {
      var entry = cache[keys[ki]];
      var isSelected = (this._selectedChannel && keys[ki] === this._selectedChannel);
      var alpha = isSelected ? 1.0 : (this._selectedChannel ? 0.2 : 0.7);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = entry.color;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      var started = false;
      for (var j = 0; j < entry.freqs.length; j++) {
        if (entry.freqs[j] < 0.5 || entry.freqs[j] > maxFreq) continue;
        var px = xOf(entry.freqs[j]);
        var py = yOf(entry.power[j]);
        if (!started) { ctx.moveTo(px, py); started = true; }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // ── Peak alpha frequency marker ──────────────────────────────────────
    var peakAlpha = this._findPeakAlpha(cache, keys);
    if (peakAlpha !== null) {
      var pax = xOf(peakAlpha);
      _drawDashedLine(ctx, pax, area.y, pax, area.y + area.h, [2, 3], ACCENT);
      ctx.save();
      ctx.fillStyle = ACCENT;
      ctx.font = FONT_MONO;
      ctx.textAlign = 'center';
      ctx.fillText('PAF ' + peakAlpha.toFixed(1) + ' Hz', pax, area.y + area.h + 28);
      ctx.restore();
    }

    // ── Axis titles ──────────────────────────────────────────────────────
    ctx.save();
    ctx.fillStyle = TEXT_DIM;
    ctx.font = FONT_LABEL;
    ctx.textAlign = 'center';
    ctx.fillText('Frequency (Hz)', area.x + area.w / 2, area.y + area.h + 36);
    // Y-axis label (rotated)
    ctx.save();
    ctx.translate(14, area.y + area.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Power (\u00B5V\u00B2/Hz)', 0, 0);
    ctx.restore();
    ctx.restore();

    // ── Legend (top-right) ───────────────────────────────────────────────
    this._drawLegend(ctx, area, keys, cache);
  }

  /** Find peak alpha frequency (8-13 Hz) across all traces. */
  _findPeakAlpha(cache, keys) {
    var bestFreq = null, bestPow = -1;
    for (var ki = 0; ki < keys.length; ki++) {
      var entry = cache[keys[ki]];
      for (var j = 0; j < entry.freqs.length; j++) {
        if (entry.freqs[j] >= 8 && entry.freqs[j] <= 13 && entry.power[j] > bestPow) {
          bestPow = entry.power[j];
          bestFreq = entry.freqs[j];
        }
      }
    }
    return bestFreq;
  }

  _drawLegend(ctx, area, keys, cache) {
    if (keys.length > 12) return; // skip legend when too many traces
    var x0 = area.x + area.w - 10;
    var y0 = area.y + 8;
    ctx.save();
    ctx.font = FONT_MONO;
    ctx.textAlign = 'right';
    for (var i = 0; i < keys.length; i++) {
      var entry = cache[keys[i]];
      ctx.fillStyle = entry.color;
      ctx.fillRect(x0 + 2, y0 + i * 14 - 5, 8, 8);
      ctx.fillStyle = TEXT_DIM;
      ctx.fillText(entry.label, x0 - 2, y0 + i * 14 + 3);
    }
    ctx.restore();
  }

  // ── Spectrogram rendering ─────────────────────────────────────────────

  _ensureSpectrogram() {
    if (this._spectrogramCache) return this._spectrogramCache;

    // Use the selected channel, or first channel, or average all
    var chIdx = 0;
    if (this._selectedChannel) {
      var idx = this._channels.indexOf(this._selectedChannel);
      if (idx >= 0) chIdx = idx;
    }
    var signal = this._data[chIdx];
    var winSize = Math.min(256, signal.length);
    var hop = Math.max(1, Math.floor(winSize / 4));
    this._spectrogramCache = _computeSpectrogram(signal, this._sfreq, winSize, hop);
    this._spectrogramCache._chIdx = chIdx;
    return this._spectrogramCache;
  }

  _renderSpectrogram() {
    var ctx = this._ctx;
    var area = this._plotArea();
    var spec = this._ensureSpectrogram();
    var maxFreq = this._maxFreq;

    var times = spec.times;
    var freqs = spec.freqs;
    var power2D = spec.power2D;
    var nFrames = times.length;

    // Find frequency index range (0 .. maxFreq)
    var maxFreqIdx = 0;
    for (var fi = 0; fi < freqs.length; fi++) {
      if (freqs[fi] <= maxFreq) maxFreqIdx = fi;
    }
    maxFreqIdx = Math.min(maxFreqIdx + 1, freqs.length);

    // Find power range for color mapping (use log scale)
    var pMin = Infinity, pMax = -Infinity;
    for (var f = 0; f < nFrames; f++) {
      for (var k = 1; k < maxFreqIdx; k++) {
        var lp = Math.log10(Math.max(power2D[f][k], 1e-12));
        if (lp < pMin) pMin = lp;
        if (lp > pMax) pMax = lp;
      }
    }
    var pRange = pMax - pMin || 1;

    // Render as an ImageData for speed
    var lut = _viridisLUT();
    var pixW = Math.max(1, Math.round(area.w));
    var pixH = Math.max(1, Math.round(area.h));
    var imgData = ctx.createImageData(pixW, pixH);
    var buf = imgData.data;

    for (var py = 0; py < pixH; py++) {
      // Frequency: bottom = 0 Hz, top = maxFreq
      var freqRatio = 1 - py / pixH;
      var freqIdx = Math.min(Math.floor(freqRatio * maxFreqIdx), maxFreqIdx - 1);
      for (var px = 0; px < pixW; px++) {
        var frameIdx = Math.min(Math.floor((px / pixW) * nFrames), nFrames - 1);
        var lp = Math.log10(Math.max(power2D[frameIdx][freqIdx], 1e-12));
        var norm = Math.max(0, Math.min(1, (lp - pMin) / pRange));
        var ci = Math.round(norm * 255);
        var rgb = lut[ci];
        var off = (py * pixW + px) * 4;
        buf[off]     = rgb[0];
        buf[off + 1] = rgb[1];
        buf[off + 2] = rgb[2];
        buf[off + 3] = 255;
      }
    }

    // Draw the image at the DPR-correct position
    var dpr = window.devicePixelRatio || 1;
    // We need to put the image data at physical pixels, so temporarily reset transform
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(imgData, Math.round(area.x * dpr), Math.round(area.y * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.restore();

    // ── Axis labels ──────────────────────────────────────────────────────
    ctx.save();
    ctx.fillStyle = TEXT_DIM;
    ctx.font = FONT_MONO;

    // Y-axis: frequency labels
    ctx.textAlign = 'right';
    for (var fv = 0; fv <= maxFreq; fv += 10) {
      var yy = area.y + area.h - (fv / maxFreq) * area.h;
      ctx.fillText(fv + ' Hz', area.x - 6, yy + 3);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(area.x, yy); ctx.lineTo(area.x + area.w, yy); ctx.stroke();
    }

    // X-axis: time labels
    ctx.textAlign = 'center';
    var tMin = this._tStart + times[0];
    var tMax = this._tStart + times[nFrames - 1];
    var tSpan = tMax - tMin || 1;
    var nTicks = Math.min(8, nFrames);
    for (var ti = 0; ti <= nTicks; ti++) {
      var tVal = tMin + (ti / nTicks) * tSpan;
      var tx = area.x + (ti / nTicks) * area.w;
      ctx.fillText(tVal.toFixed(1) + 's', tx, area.y + area.h + 14);
    }

    // Axis titles
    ctx.font = FONT_LABEL;
    ctx.textAlign = 'center';
    ctx.fillText('Time (s)', area.x + area.w / 2, area.y + area.h + 32);
    ctx.save();
    ctx.translate(14, area.y + area.h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Frequency (Hz)', 0, 0);
    ctx.restore();

    // Channel indicator
    var chName = this._channels[spec._chIdx] || '?';
    ctx.font = FONT_LABEL;
    ctx.fillStyle = TEXT_BRIGHT;
    ctx.textAlign = 'left';
    ctx.fillText('Ch: ' + chName, area.x + 6, area.y - 8);

    ctx.restore();

    // ── Colorbar legend ──────────────────────────────────────────────────
    this._drawColorbar(ctx, area, pMin, pMax);
  }

  /** Draw a vertical colorbar at the right edge of the plot area. */
  _drawColorbar(ctx, area, logMin, logMax) {
    var barW = 12;
    var barH = area.h;
    var barX = area.x + area.w + 4;
    var barY = area.y;
    var lut = _viridisLUT();

    for (var py = 0; py < barH; py++) {
      var norm = 1 - py / barH;
      var ci = Math.round(norm * 255);
      var rgb = lut[ci];
      ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      ctx.fillRect(barX, barY + py, barW, 1);
    }

    // Labels
    ctx.save();
    ctx.font = FONT_MONO;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'left';
    ctx.fillText('1e' + Math.round(logMax), barX + barW + 3, barY + 8);
    ctx.fillText('1e' + Math.round(logMin), barX + barW + 3, barY + barH);
    ctx.fillText('\u00B5V\u00B2/Hz', barX + barW + 3, barY + barH / 2 + 3);
    ctx.restore();
  }

  // ── Amplitude statistics rendering ────────────────────────────────────

  _ensureStats() {
    if (this._statsCache) return this._statsCache;
    var stats = [];
    for (var ci = 0; ci < this._channels.length; ci++) {
      var sig = this._data[ci];
      var n = sig.length;
      var sum = 0, sumSq = 0, mn = Infinity, mx = -Infinity;
      for (var i = 0; i < n; i++) {
        sum += sig[i];
        sumSq += sig[i] * sig[i];
        if (sig[i] < mn) mn = sig[i];
        if (sig[i] > mx) mx = sig[i];
      }
      var mean = sum / n;
      var rms = Math.sqrt(sumSq / n);
      var variance = (sumSq / n) - mean * mean;
      var std = Math.sqrt(Math.max(0, variance));
      var ptp = mx - mn;
      stats.push({
        channel: this._channels[ci],
        rms: rms,
        ptp: ptp,
        std: std,
        min: mn,
        max: mx,
        color: _colorOf(this._channels[ci]),
        region: _regionOf(this._channels[ci]),
        signal: sig,
      });
    }
    this._statsCache = stats;
    return stats;
  }

  _renderStats() {
    var ctx = this._ctx;
    var area = this._plotArea();
    var stats = this._ensureStats();
    var nCh = stats.length;
    if (nCh === 0) return;

    // Layout: horizontal bar chart with 3 metrics per channel
    var barAreaW = area.w * 0.65;    // left 65% for bars
    var histAreaX = area.x + barAreaW + 30; // right side for histogram
    var histAreaW = area.w - barAreaW - 40;

    // Find max values for scaling
    var maxRms = 0, maxPtp = 0, maxStd = 0;
    for (var i = 0; i < nCh; i++) {
      if (stats[i].rms > maxRms) maxRms = stats[i].rms;
      if (stats[i].ptp > maxPtp) maxPtp = stats[i].ptp;
      if (stats[i].std > maxStd) maxStd = stats[i].std;
    }

    var rowH = Math.min(22, area.h / nCh);
    var barH = Math.max(3, rowH * 0.28);
    var metrics = [
      { key: 'rms', label: 'RMS',  max: maxRms, alpha: 0.9 },
      { key: 'ptp', label: 'P-P',  max: maxPtp, alpha: 0.6 },
      { key: 'std', label: 'SD',   max: maxStd, alpha: 0.4 },
    ];

    // Column header
    ctx.save();
    ctx.font = FONT_MONO;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'left';
    var colLabelX = area.x + 70;
    for (var mi = 0; mi < metrics.length; mi++) {
      ctx.fillText(metrics[mi].label, colLabelX + mi * (barAreaW / 3 - 10), area.y - 6);
    }

    // Rows
    for (var i = 0; i < nCh; i++) {
      var y0 = area.y + i * rowH;
      var isSelected = (this._selectedChannel && stats[i].channel === this._selectedChannel);

      // Channel label
      ctx.fillStyle = isSelected ? TEXT_BRIGHT : TEXT_DIM;
      ctx.font = FONT_MONO;
      ctx.textAlign = 'right';
      ctx.fillText(stats[i].channel, area.x + 60, y0 + rowH * 0.5 + 3);

      // Highlight row background
      if (isSelected) {
        ctx.fillStyle = 'rgba(0,212,188,0.06)';
        ctx.fillRect(area.x + 64, y0, barAreaW, rowH);
      }

      // Draw 3 stacked bars
      for (var mi = 0; mi < metrics.length; mi++) {
        var val = stats[i][metrics[mi].key];
        var maxVal = metrics[mi].max || 1;
        var bw = (val / maxVal) * (barAreaW / 3 - 20);
        var bx = area.x + 70 + mi * (barAreaW / 3 - 10);
        var by = y0 + (rowH - barH) / 2;

        ctx.globalAlpha = metrics[mi].alpha;
        ctx.fillStyle = stats[i].color;
        ctx.fillRect(bx, by, Math.max(1, bw), barH);

        // Value text
        ctx.globalAlpha = 1;
        ctx.fillStyle = isSelected ? TEXT_BRIGHT : TEXT_DIM;
        ctx.font = FONT_MONO;
        ctx.textAlign = 'left';
        ctx.fillText(val.toFixed(1), bx + Math.max(1, bw) + 4, by + barH - 1);
      }
    }
    ctx.restore();

    // ── Mini histogram for selected channel ──────────────────────────────
    var selIdx = -1;
    if (this._selectedChannel) {
      for (var i = 0; i < nCh; i++) {
        if (stats[i].channel === this._selectedChannel) { selIdx = i; break; }
      }
    }
    if (selIdx < 0 && nCh > 0) selIdx = 0;
    this._drawHistogram(ctx, stats[selIdx], histAreaX, area.y, histAreaW, area.h);
  }

  /** Draw a mini amplitude histogram for one channel. */
  _drawHistogram(ctx, stat, x0, y0, w, h) {
    if (!stat || !stat.signal || stat.signal.length === 0) return;

    var nBins = 30;
    var sig = stat.signal;
    var lo = stat.min, hi = stat.max;
    var range = hi - lo || 1;
    var bins = new Array(nBins);
    for (var b = 0; b < nBins; b++) bins[b] = 0;
    for (var i = 0; i < sig.length; i++) {
      var bi = Math.min(nBins - 1, Math.floor(((sig[i] - lo) / range) * nBins));
      bins[bi]++;
    }
    var maxBin = 0;
    for (var b = 0; b < nBins; b++) { if (bins[b] > maxBin) maxBin = bins[b]; }

    // Title
    ctx.save();
    ctx.font = FONT_LABEL;
    ctx.fillStyle = TEXT_BRIGHT;
    ctx.textAlign = 'left';
    ctx.fillText('Histogram: ' + stat.channel, x0, y0 - 6);

    // Bars (vertical — y-axis = bins, x-axis = count)
    var barH = Math.max(1, (h - 20) / nBins);
    for (var b = 0; b < nBins; b++) {
      var bw = maxBin > 0 ? (bins[b] / maxBin) * (w - 20) : 0;
      var by = y0 + b * barH;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = stat.color;
      ctx.fillRect(x0, by, bw, Math.max(1, barH - 1));
    }
    ctx.globalAlpha = 1;

    // Amplitude range labels
    ctx.font = FONT_MONO;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'left';
    ctx.fillText(lo.toFixed(0) + ' \u00B5V', x0, y0 + h - 4);
    ctx.fillText(hi.toFixed(0) + ' \u00B5V', x0, y0 + 10);

    // Mean line
    var meanBin = ((stat.rms - lo) / range) * nBins; // approximate position
    var meanY = y0 + meanBin * barH;
    if (meanY >= y0 && meanY <= y0 + h) {
      _drawDashedLine(ctx, x0, meanY, x0 + w - 20, meanY, [3, 3], ACCENT);
      ctx.fillStyle = ACCENT;
      ctx.fillText('RMS', x0 + w - 18, meanY + 3);
    }

    ctx.restore();
  }
}

export { _fft, _computePSD, _computeSpectrogram };
