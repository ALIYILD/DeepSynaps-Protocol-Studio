// ─────────────────────────────────────────────────────────────────────────────
// eeg-filter-preview.test.js — Phase 3
//
// Verifies the EEGFilterPreview canvas renderer:
//  * update() with empty arrays must not throw
//  * update() with realistic 2-channel signal + freq response renders
//  * constructor handles canvas without getContext gracefully
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

// ── Fake 2-D context that records calls ─────────────────────────────────────
function makeFakeCtx() {
  const calls = { fillRect: 0, beginPath: 0, moveTo: 0, lineTo: 0, stroke: 0, fillText: 0 };
  return {
    _calls: calls,
    fillRect: () => { calls.fillRect++; },
    beginPath: () => { calls.beginPath++; },
    moveTo: () => { calls.moveTo++; },
    lineTo: () => { calls.lineTo++; },
    stroke: () => { calls.stroke++; },
    fillText: () => { calls.fillText++; },
    setLineDash: () => {},
    set fillStyle(_v) {}, get fillStyle() { return ''; },
    set strokeStyle(_v) {}, get strokeStyle() { return ''; },
    set lineWidth(_v) {}, get lineWidth() { return 1; },
    set font(_v) {}, get font() { return ''; },
    set textBaseline(_v) {}, get textBaseline() { return ''; },
  };
}

class FakeCanvas {
  constructor(w = 480, h = 240) {
    this.width = w;
    this.height = h;
    this.clientWidth = w;
    this.clientHeight = h;
    this._ctx = makeFakeCtx();
  }
  getContext() { return this._ctx; }
}

const mod = await import('./eeg-filter-preview.js');
const { EEGFilterPreview } = mod;

// ── Tests ────────────────────────────────────────────────────────────────────

test('constructor binds the 2-D context', () => {
  const c = new FakeCanvas();
  const p = new EEGFilterPreview(c);
  assert.ok(p.ctx);
  assert.equal(p.canvas, c);
});

test('constructor with a canvas missing getContext is safe', () => {
  const fake = { width: 100, height: 50 };
  const p = new EEGFilterPreview(fake);
  assert.equal(p.ctx, null);
  // update() must not throw on a null ctx.
  assert.doesNotThrow(() => p.update([], [], { hz: [], magnitude_db: [] }));
});

test('update() with empty arrays does not throw', () => {
  const c = new FakeCanvas();
  const p = new EEGFilterPreview(c);
  assert.doesNotThrow(() => p.update([], [], { hz: [], magnitude_db: [] }));
});

test('update() with null freqResponse does not throw', () => {
  const c = new FakeCanvas();
  const p = new EEGFilterPreview(c);
  assert.doesNotThrow(() => p.update([], [], null));
});

test('update() with realistic 2-channel signal calls drawing primitives', () => {
  const c = new FakeCanvas();
  const p = new EEGFilterPreview(c);
  const N = 64;
  const raw = [new Array(N), new Array(N)];
  const filt = [new Array(N), new Array(N)];
  for (let i = 0; i < N; i++) {
    raw[0][i] = 25 * Math.sin(2 * Math.PI * 10 * i / 256);
    raw[1][i] = 15 * Math.cos(2 * Math.PI * 12 * i / 256);
    filt[0][i] = raw[0][i] * 0.8;
    filt[1][i] = raw[1][i] * 0.8;
  }
  const fr = {
    hz: Array.from({ length: 64 }, (_, i) => (i + 1) * 1.5),
    magnitude_db: Array.from({ length: 64 }, (_, i) => -i * 0.5),
  };
  p.update(raw, filt, fr);
  // At least some traces should have been stroked.
  assert.ok(c._ctx._calls.beginPath > 0, 'beginPath called');
  assert.ok(c._ctx._calls.stroke >= 2, 'stroke called for traces (raw + filtered + freq)');
  assert.ok(c._ctx._calls.fillText >= 1, 'header label drawn');
});

test('update() handles non-finite values without throwing', () => {
  const c = new FakeCanvas();
  const p = new EEGFilterPreview(c);
  const raw = [[NaN, Infinity, -Infinity, 1, 2, 3]];
  const filt = [[1, 2, 3, 4, 5, 6]];
  const fr = { hz: [1, 2, 3], magnitude_db: [-10, -20, NaN] };
  assert.doesNotThrow(() => p.update(raw, filt, fr));
});

test('update() respects canvas dimensions when set explicitly', () => {
  const c = new FakeCanvas(320, 200);
  const p = new EEGFilterPreview(c);
  p.update([[1, 2, 3]], [[1.1, 1.9, 3.1]], { hz: [1, 2, 3], magnitude_db: [0, -3, -10] });
  assert.equal(c.width, 320);
  assert.equal(c.height, 200);
});

test('update() stores last update for re-renders', () => {
  const c = new FakeCanvas();
  const p = new EEGFilterPreview(c);
  const fr = { hz: [1, 2], magnitude_db: [0, -3] };
  p.update([[1, 2]], [[2, 3]], fr);
  assert.ok(p._lastUpdate);
  assert.equal(p._lastUpdate.freqResponse.hz[0], 1);
});
