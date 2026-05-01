// ─────────────────────────────────────────────────────────────────────────────
// eeg-filter-preview.js  —  Phase 3
//
// EEGFilterPreview: renders three small stacked plots into a single canvas:
//   row 1 — raw signal (overlay of first N channels)
//   row 2 — filtered signal (same channels, after LFF/HFF/notch)
//   row 3 — frequency response curve (Hz on X, dB on Y)
//
// Pure 2-D canvas drawing. No deps. Safe to call update() with empty arrays
// (renders an empty placeholder rather than throwing).
// ─────────────────────────────────────────────────────────────────────────────

const _BG = '#0d1b2a';
const _AXIS = 'rgba(255,255,255,0.08)';
const _TEXT = '#94a3b8';
const _TRACE_COLORS = ['#00d4bc', '#7dd3fc', '#fbbf24', '#f472b6', '#a78bfa', '#34d399'];
const _FREQ_COLOR = '#00d4bc';

export class EEGFilterPreview {
  /** @param {HTMLCanvasElement} canvasEl */
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl && typeof canvasEl.getContext === 'function'
      ? canvasEl.getContext('2d')
      : null;
    this._lastUpdate = null;
  }

  /**
   * Render one update.
   *
   * @param {number[][]} rawSignal       channels × samples (μV)
   * @param {number[][]} filteredSignal  channels × samples (μV)
   * @param {{ hz: number[], magnitude_db: number[] }} freqResponse
   */
  update(rawSignal, filteredSignal, freqResponse) {
    if (!this.canvas || !this.ctx) return;
    this._lastUpdate = { rawSignal, filteredSignal, freqResponse };

    const w = this.canvas.width || this.canvas.clientWidth || 480;
    const h = this.canvas.height || this.canvas.clientHeight || 240;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    const ctx = this.ctx;
    ctx.fillStyle = _BG;
    ctx.fillRect(0, 0, w, h);

    const headerH = 14;
    const rowH = (h - headerH * 3) / 3;

    // Row 1 — raw
    this._drawHeader(ctx, 0, w, 'Raw', _TEXT);
    this._drawTraces(ctx, 0 + headerH, w, rowH, rawSignal);

    // Row 2 — filtered
    const y2 = headerH + rowH;
    this._drawHeader(ctx, y2, w, 'Filtered', _TEXT);
    this._drawTraces(ctx, y2 + headerH, w, rowH, filteredSignal);

    // Row 3 — frequency response
    const y3 = (headerH + rowH) * 2;
    this._drawHeader(ctx, y3, w, 'Frequency Response (dB)', _TEXT);
    this._drawFreqResponse(ctx, y3 + headerH, w, rowH, freqResponse);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _drawHeader(ctx, y, w, label, color) {
    ctx.fillStyle = color;
    ctx.font = '10px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(label, 6, y + 2);
    ctx.fillStyle = _AXIS;
    ctx.fillRect(0, y + 13, w, 1);
  }

  _drawTraces(ctx, y, w, h, signal) {
    if (!Array.isArray(signal) || signal.length === 0) {
      ctx.fillStyle = _TEXT;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('(no data)', 8, y + h / 2);
      return;
    }
    // Find global min/max for scaling.
    let minV = Infinity, maxV = -Infinity;
    for (let c = 0; c < signal.length; c++) {
      const row = signal[c];
      if (!Array.isArray(row)) continue;
      for (let i = 0; i < row.length; i++) {
        const v = row[i];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }
    if (!isFinite(minV) || !isFinite(maxV)) {
      ctx.fillStyle = _TEXT;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText('(no data)', 8, y + h / 2);
      return;
    }
    if (maxV === minV) { maxV += 1; minV -= 1; }
    const range = maxV - minV;

    const padX = 30;
    const drawW = w - padX - 8;
    if (drawW <= 0) return;

    // Y-axis scale label
    ctx.fillStyle = _TEXT;
    ctx.font = '9px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(maxV.toFixed(0) + ' µV', 2, y + 1);
    ctx.textBaseline = 'bottom';
    ctx.fillText(minV.toFixed(0) + ' µV', 2, y + h - 1);

    // Trace lines.
    for (let c = 0; c < signal.length; c++) {
      const row = signal[c];
      if (!Array.isArray(row) || row.length === 0) continue;
      const color = _TRACE_COLORS[c % _TRACE_COLORS.length];
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = row.length;
      const dx = drawW / Math.max(1, n - 1);
      for (let i = 0; i < n; i++) {
        const v = row[i];
        const yy = y + h - ((v - minV) / range) * (h - 2) - 1;
        const xx = padX + i * dx;
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
  }

  _drawFreqResponse(ctx, y, w, h, fr) {
    if (!fr || !Array.isArray(fr.hz) || !Array.isArray(fr.magnitude_db) || fr.hz.length === 0) {
      ctx.fillStyle = _TEXT;
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText('(no response)', 8, y + h / 2);
      return;
    }

    const padX = 30;
    const drawW = w - padX - 8;
    if (drawW <= 0) return;

    const xs = fr.hz;
    const ys = fr.magnitude_db;
    let xMax = 0;
    for (let i = 0; i < xs.length; i++) if (xs[i] > xMax) xMax = xs[i];
    if (!isFinite(xMax) || xMax <= 0) xMax = 1;
    let dbMin = Infinity, dbMax = -Infinity;
    for (let i = 0; i < ys.length; i++) {
      const v = ys[i];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      if (v < dbMin) dbMin = v;
      if (v > dbMax) dbMax = v;
    }
    if (!isFinite(dbMin) || !isFinite(dbMax)) { dbMin = -60; dbMax = 5; }
    if (dbMin === dbMax) { dbMin -= 1; dbMax += 1; }
    const dbRange = dbMax - dbMin;

    // Reference line at 0 dB
    if (dbMin <= 0 && 0 <= dbMax) {
      ctx.strokeStyle = _AXIS;
      ctx.lineWidth = 1;
      const yZero = y + h - ((0 - dbMin) / dbRange) * (h - 2) - 1;
      ctx.beginPath();
      ctx.moveTo(padX, yZero);
      ctx.lineTo(padX + drawW, yZero);
      ctx.stroke();
    }

    ctx.fillStyle = _TEXT;
    ctx.font = '9px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(dbMax.toFixed(0) + 'dB', 2, y + 1);
    ctx.textBaseline = 'bottom';
    ctx.fillText(dbMin.toFixed(0) + 'dB', 2, y + h - 1);
    ctx.textBaseline = 'bottom';
    ctx.fillText('0', padX, y + h);
    ctx.fillText(xMax.toFixed(0) + ' Hz', padX + drawW - 30, y + h);

    // Curve
    ctx.strokeStyle = _FREQ_COLOR;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const xv = xs[i];
      const yv = ys[i];
      const xx = padX + (xv / xMax) * drawW;
      const yy = y + h - ((yv - dbMin) / dbRange) * (h - 2) - 1;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
  }
}

export default EEGFilterPreview;
