// ─────────────────────────────────────────────────────────────────────────────
// eeg-signal-renderer.js — Canvas2D multi-channel EEG signal viewer
//
// Clinical-grade EEG waveform renderer supporting:
//   - 19–64 channel simultaneous display with per-channel lanes
//   - Time ruler with second markers
//   - Clickable channel labels (toggle bad channel)
//   - Click-drag bad segment annotation
//   - Scroll / zoom via mouse wheel
//   - Overlay mode for raw vs cleaned comparison
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  channelHeight: 56,
  labelWidth: 72,
  timeRulerHeight: 28,
  scrollbarHeight: 18,
  sensitivity: 50,        // µV per division (half channel height)
  colors: {
    background: '#0d1b2a',
    signal: '#00d4bc',
    signalOverlay: 'rgba(255,255,255,0.25)',
    grid: 'rgba(255,255,255,0.06)',
    gridMajor: 'rgba(255,255,255,0.12)',
    label: '#e2e8f0',
    labelBad: '#ef6b6b',
    badSegment: 'rgba(239,107,107,0.18)',
    badSegmentBorder: 'rgba(239,107,107,0.55)',
    cursor: 'rgba(0,212,188,0.35)',
    ruler: '#94a3b8',
    rulerBg: '#131c2b',
    scrollbar: 'rgba(255,255,255,0.18)',
    scrollbarThumb: 'rgba(0,212,188,0.5)',
  },
};

export class EEGSignalRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} options
   */
  constructor(canvas, options) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;

    // Data state
    this.channels = [];
    this.data = [];           // [nCh][nSamples] in µV
    this.overlayData = null;  // optional second dataset for overlay mode
    this.sfreq = 250;
    this.tStart = 0;
    this.totalDuration = 0;
    this.annotations = [];

    // Interaction state
    this.badChannels = new Set();
    this.badSegments = [];    // [{startSec, endSec, description}]
    this.sensitivity = opts.sensitivity;
    this._scrollY = 0;        // vertical scroll offset (px) for many channels

    // Selection state (for drag-to-annotate)
    this._dragging = false;
    this._dragStartX = 0;
    this._dragCurrentX = 0;

    // Callbacks
    this.onChannelClick = null;      // (channelName) => void
    this.onSegmentSelect = null;     // (startSec, endSec) => void
    this.onTimeNavigate = null;      // (newTStart) => void

    // Bind methods for event listeners
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onResize = this._onResize.bind(this);

    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('mouseleave', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(canvas.parentElement || canvas);

    this._sizeCanvas();
    this._rafId = null;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Load signal data into the renderer.
   */
  setData(channels, data, sfreq, tStart, annotations, totalDuration) {
    this.channels = channels || [];
    this.data = data || [];
    this.sfreq = sfreq || 250;
    this.tStart = tStart || 0;
    this.annotations = annotations || [];
    this.totalDuration = totalDuration || 0;
    this.render();
  }

  /** Set overlay data for comparison mode (raw in gray, cleaned in teal). */
  setOverlayData(data) {
    this.overlayData = data;
    this.render();
  }

  /** Clear overlay data. */
  clearOverlay() {
    this.overlayData = null;
    this.render();
  }

  setChannelStates(badChannels) {
    this.badChannels = new Set(badChannels || []);
    this.render();
  }

  setBadSegments(segments) {
    this.badSegments = segments || [];
    this.render();
  }

  setSensitivity(uvPerDiv) {
    this.sensitivity = Math.max(1, uvPerDiv);
    this.render();
  }

  getVisibleTimeRange() {
    const windowSec = this.data.length && this.data[0].length
      ? this.data[0].length / this.sfreq
      : 10;
    return { tStart: this.tStart, tEnd: this.tStart + windowSec };
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('mouseleave', this._onMouseUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._rafId) cancelAnimationFrame(this._rafId);
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

    if (!this.channels.length || !this.data.length) {
      ctx.fillStyle = o.colors.label;
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No signal data loaded', W / 2, H / 2);
      return;
    }

    const nCh = this.channels.length;
    const nSamples = this.data[0] ? this.data[0].length : 0;
    const signalW = W - o.labelWidth;
    const signalTop = o.timeRulerHeight;
    const signalH = H - o.timeRulerHeight - o.scrollbarHeight;
    const windowSec = nSamples / this.sfreq;
    const pxPerSec = signalW / windowSec;

    // ── Time ruler ───────────────────────────────────────────────────
    ctx.fillStyle = o.colors.rulerBg;
    ctx.fillRect(o.labelWidth, 0, signalW, o.timeRulerHeight);
    ctx.strokeStyle = o.colors.ruler;
    ctx.lineWidth = 0.5;
    ctx.fillStyle = o.colors.ruler;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    const secStep = this._calcTimeStep(windowSec, signalW);
    for (var t = Math.ceil(this.tStart / secStep) * secStep; t <= this.tStart + windowSec; t += secStep) {
      var x = o.labelWidth + (t - this.tStart) * pxPerSec;
      ctx.beginPath();
      ctx.moveTo(x, o.timeRulerHeight - 6);
      ctx.lineTo(x, o.timeRulerHeight);
      ctx.stroke();
      ctx.fillText(this._formatTime(t), x, o.timeRulerHeight - 9);
    }

    // ── Vertical grid lines ──────────────────────────────────────────
    ctx.strokeStyle = o.colors.grid;
    ctx.lineWidth = 0.5;
    for (t = Math.ceil(this.tStart / secStep) * secStep; t <= this.tStart + windowSec; t += secStep) {
      x = o.labelWidth + (t - this.tStart) * pxPerSec;
      ctx.beginPath();
      ctx.moveTo(x, signalTop);
      ctx.lineTo(x, signalTop + signalH);
      ctx.stroke();
    }

    // ── Bad segment overlays ─────────────────────────────────────────
    for (var si = 0; si < this.badSegments.length; si++) {
      var seg = this.badSegments[si];
      var sx = o.labelWidth + Math.max(0, (seg.startSec - this.tStart)) * pxPerSec;
      var ex = o.labelWidth + Math.min(windowSec, (seg.endSec - this.tStart)) * pxPerSec;
      if (ex > o.labelWidth && sx < W) {
        ctx.fillStyle = o.colors.badSegment;
        ctx.fillRect(sx, signalTop, ex - sx, signalH);
        ctx.strokeStyle = o.colors.badSegmentBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(sx, signalTop, ex - sx, signalH);
      }
    }

    // ── Drag selection overlay ───────────────────────────────────────
    if (this._dragging) {
      var dsx = Math.min(this._dragStartX, this._dragCurrentX);
      var dex = Math.max(this._dragStartX, this._dragCurrentX);
      ctx.fillStyle = o.colors.cursor;
      ctx.fillRect(dsx, signalTop, dex - dsx, signalH);
    }

    // ── Channel signals ──────────────────────────────────────────────
    var chH = o.channelHeight;
    var totalChH = nCh * chH;
    var scrollY = this._scrollY;
    // Clamp scroll
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

      var isBad = this.badChannels.has(this.channels[ch]);

      // Horizontal baseline for channel
      ctx.strokeStyle = o.colors.grid;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(o.labelWidth, cy);
      ctx.lineTo(W, cy);
      ctx.stroke();

      // Draw overlay signal first (gray, if present)
      if (this.overlayData && this.overlayData[ch]) {
        this._drawSignalTrace(ctx, this.overlayData[ch], o.labelWidth, signalW, cy, chH,
          o.colors.signalOverlay, isBad ? 0.3 : 0.6);
      }

      // Draw main signal
      var sigColor = isBad ? o.colors.labelBad : o.colors.signal;
      var sigAlpha = isBad ? 0.45 : 1.0;
      this._drawSignalTrace(ctx, this.data[ch], o.labelWidth, signalW, cy, chH, sigColor, sigAlpha);
    }
    ctx.restore();

    // ── Channel labels ───────────────────────────────────────────────
    ctx.fillStyle = o.colors.background;
    ctx.fillRect(0, signalTop, o.labelWidth, signalH);

    for (ch = 0; ch < nCh; ch++) {
      cy = signalTop + ch * chH + chH / 2 - scrollY;
      if (cy + chH / 2 < signalTop || cy - chH / 2 > signalTop + signalH) continue;

      isBad = this.badChannels.has(this.channels[ch]);
      ctx.fillStyle = isBad ? o.colors.labelBad : o.colors.label;
      ctx.font = (isBad ? 'bold ' : '') + '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.channels[ch], o.labelWidth - 8, cy + 4);

      if (isBad) {
        // Strike-through
        var tw = ctx.measureText(this.channels[ch]).width;
        ctx.strokeStyle = o.colors.labelBad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(o.labelWidth - 8 - tw, cy + 1);
        ctx.lineTo(o.labelWidth - 8, cy + 1);
        ctx.stroke();
      }
    }

    // ── Scrollbar ────────────────────────────────────────────────────
    this._drawScrollbar(ctx, W, H, signalW);

    // ── Annotations in-view ──────────────────────────────────────────
    for (var ai = 0; ai < this.annotations.length; ai++) {
      var ann = this.annotations[ai];
      var ax = o.labelWidth + (ann.onset - this.tStart) * pxPerSec;
      if (ax >= o.labelWidth && ax <= W) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(ax, signalTop);
        ctx.lineTo(ax, signalTop + signalH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(ann.description || 'BAD', ax + 3, signalTop + 12);
      }
    }
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

    // Decimation for performance: if >2px per sample, draw all; else min/max
    if (pxPerSample >= 2) {
      ctx.moveTo(x0, cy - samples[0] * scale);
      for (var i = 1; i < n; i++) {
        ctx.lineTo(x0 + i * pxPerSample, cy - samples[i] * scale);
      }
    } else {
      // min-max decimation
      var samplesPerPx = n / width;
      for (var px = 0; px < width; px++) {
        var si = Math.floor(px * samplesPerPx);
        var ei = Math.min(Math.floor((px + 1) * samplesPerPx), n);
        var mn = samples[si], mx = samples[si];
        for (var j = si + 1; j < ei; j++) {
          if (samples[j] < mn) mn = samples[j];
          if (samples[j] > mx) mx = samples[j];
        }
        if (px === 0) {
          ctx.moveTo(x0 + px, cy - mx * scale);
        }
        ctx.lineTo(x0 + px, cy - mx * scale);
        ctx.lineTo(x0 + px, cy - mn * scale);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawScrollbar(ctx, W, H, signalW) {
    var o = this.opts;
    var sbY = H - o.scrollbarHeight;
    var nSamples = this.data[0] ? this.data[0].length : 0;
    var windowSec = nSamples / this.sfreq;

    ctx.fillStyle = o.colors.rulerBg;
    ctx.fillRect(o.labelWidth, sbY, signalW, o.scrollbarHeight);

    if (this.totalDuration > 0 && windowSec > 0) {
      var fraction = windowSec / this.totalDuration;
      var thumbW = Math.max(30, signalW * fraction);
      var thumbX = o.labelWidth + (this.tStart / this.totalDuration) * (signalW - thumbW);

      ctx.fillStyle = o.colors.scrollbar;
      ctx.fillRect(o.labelWidth, sbY + 2, signalW, o.scrollbarHeight - 4);

      ctx.fillStyle = o.colors.scrollbarThumb;
      ctx.beginPath();
      ctx.roundRect(thumbX, sbY + 2, thumbW, o.scrollbarHeight - 4, 4);
      ctx.fill();

      // Time labels at start/end
      ctx.fillStyle = o.colors.ruler;
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(this._formatTime(this.tStart), o.labelWidth + 4, sbY + 13);
      ctx.textAlign = 'right';
      ctx.fillText(this._formatTime(this.totalDuration), W - 4, sbY + 13);
    }
  }

  _calcTimeStep(windowSec, widthPx) {
    var minPxBetween = 60;
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
    var s = (sec % 60).toFixed(0);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ── Mouse interactions ──────────────────────────────────────────────

  _onMouseDown(e) {
    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var o = this.opts;

    // Check if clicking in the label area (toggle bad channel)
    if (mx < o.labelWidth && my > o.timeRulerHeight && my < this._height - o.scrollbarHeight) {
      var chIdx = this._getChannelAtY(my);
      if (chIdx >= 0 && chIdx < this.channels.length) {
        var chName = this.channels[chIdx];
        if (this.badChannels.has(chName)) {
          this.badChannels.delete(chName);
        } else {
          this.badChannels.add(chName);
        }
        this.render();
        if (this.onChannelClick) this.onChannelClick(chName);
      }
      return;
    }

    // Start drag for bad segment annotation
    if (mx >= o.labelWidth && my > o.timeRulerHeight && my < this._height - o.scrollbarHeight) {
      this._dragging = true;
      this._dragStartX = mx;
      this._dragCurrentX = mx;
    }
  }

  _onMouseMove(e) {
    if (!this._dragging) return;
    var rect = this.canvas.getBoundingClientRect();
    this._dragCurrentX = e.clientX - rect.left;
    this.render();
  }

  _onMouseUp(e) {
    if (!this._dragging) return;
    this._dragging = false;

    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var o = this.opts;
    var signalW = this._width - o.labelWidth;
    var nSamples = this.data[0] ? this.data[0].length : 0;
    var windowSec = nSamples / this.sfreq;

    var startX = Math.min(this._dragStartX, mx) - o.labelWidth;
    var endX = Math.max(this._dragStartX, mx) - o.labelWidth;

    // Minimum 5px drag to count as a segment
    if (endX - startX > 5) {
      var startSec = this.tStart + (startX / signalW) * windowSec;
      var endSec = this.tStart + (endX / signalW) * windowSec;
      startSec = Math.max(0, startSec);
      endSec = Math.min(this.totalDuration, endSec);
      if (this.onSegmentSelect) this.onSegmentSelect(startSec, endSec);
    }

    this.render();
  }

  _onWheel(e) {
    e.preventDefault();
    var o = this.opts;
    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;

    if (e.ctrlKey || e.metaKey) {
      // Ctrl+wheel = vertical zoom (sensitivity)
      var delta = e.deltaY > 0 ? 1.15 : 0.87;
      this.sensitivity = Math.max(1, Math.min(500, this.sensitivity * delta));
      this.render();
      return;
    }

    if (e.shiftKey || mx >= o.labelWidth) {
      // Horizontal scroll (time navigation)
      var nSamples = this.data[0] ? this.data[0].length : 0;
      var windowSec = nSamples / this.sfreq;
      var scrollSec = windowSec * 0.2 * (e.deltaY > 0 ? 1 : -1);
      var newStart = Math.max(0, Math.min(this.totalDuration - windowSec, this.tStart + scrollSec));
      if (newStart !== this.tStart) {
        this.tStart = newStart;
        if (this.onTimeNavigate) this.onTimeNavigate(newStart);
      }
      return;
    }

    // Vertical scroll (channel scroll for many channels)
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
