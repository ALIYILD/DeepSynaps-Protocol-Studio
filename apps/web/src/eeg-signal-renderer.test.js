// Tests for eeg-signal-renderer.js
//
// Canvas2D/WebGL render paths are SKIPPED — they require a real GPU context
// and are untestable in Node.js without a full browser environment.
// We stub the Canvas API minimally to test constructor, data management,
// montage processing, and public query methods that are pure JS.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { EEGSignalRenderer } from './eeg-signal-renderer.js';

// ── Minimal Canvas / DOM stub ─────────────────────────────────────────────────
let originalDocument;
let originalWindow;
let originalRequestAnimationFrame;
let originalCancelAnimationFrame;
let originalResizeObserver;
let originalPerformance;

function makeCanvasStub() {
  const ctx2d = {
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    strokeText() {},
    measureText() { return { width: 8 }; },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    rect() {},
    clip() {},
    save() {},
    restore() {},
    scale() {},
    translate() {},
    setTransform() {},
    drawImage() {},
    setLineDash() {},
    roundRect() {},
    arc() {},
    arcTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    closePath() {},
    isPointInPath() { return false; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return null; },
    getImageData() { return { data: new Uint8ClampedArray(0) }; },
    putImageData() {},
    textAlign: 'left',
    textBaseline: 'alphabetic',
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: 10,
  };
  const canvas = {
    getContext(type) { return type === '2d' ? ctx2d : null; },
    addEventListener() {},
    removeEventListener() {},
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    parentElement: {
      clientWidth: 800,
      clientHeight: 600,
    },
    style: {},
  };
  return canvas;
}

before(() => {
  originalDocument = globalThis.document;
  originalWindow = globalThis.window;
  originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  originalResizeObserver = globalThis.ResizeObserver;
  originalPerformance = globalThis.performance;

  // Use a no-op RAF so _draw is never invoked in tests — avoids ctx.roundRect etc.
  globalThis.requestAnimationFrame = (_cb) => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.window = globalThis.window || {};
  globalThis.devicePixelRatio = 1;
  globalThis.performance = { now: () => Date.now() };

  const styleTag = { id: '', textContent: '' };
  globalThis.document = {
    createElement: (tag) => tag === 'style' ? styleTag : {},
    head: { appendChild() {} },
    getElementById: () => null,
    querySelector: () => null,
  };
});

after(() => {
  globalThis.document = originalDocument;
  if (originalWindow !== undefined) globalThis.window = originalWindow;
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.performance = originalPerformance;
});

// ── Constructor ───────────────────────────────────────────────────────────────

describe('EEGSignalRenderer constructor', () => {
  it('initialises with empty channels and data', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    assert.deepStrictEqual(r.channels, []);
    assert.deepStrictEqual(r.data, []);
    r.destroy();
  });

  it('defaults sfreq to 250, tStart to 0', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    assert.strictEqual(r.sfreq, 250);
    assert.strictEqual(r.tStart, 0);
    r.destroy();
  });

  it('defaults montage to "referential"', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    assert.strictEqual(r.montage, 'referential');
    r.destroy();
  });

  it('defaults interactionMode to "select"', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    assert.strictEqual(r.interactionMode, 'select');
    r.destroy();
  });

  it('accepts custom sensitivity option', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, { sensitivity: 100 });
    assert.strictEqual(r.sensitivity, 100);
    r.destroy();
  });
});

// ── setData ───────────────────────────────────────────────────────────────────

describe('EEGSignalRenderer.setData', () => {
  it('stores channels and data passed in', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    const ch = ['Fp1', 'Fp2', 'Fz'];
    const d = [new Float32Array(100), new Float32Array(100), new Float32Array(100)];
    r.setData(ch, d, 256, 5, [], 300);
    assert.deepStrictEqual(r.channels, ch);
    assert.strictEqual(r.sfreq, 256);
    assert.strictEqual(r.tStart, 5);
    assert.strictEqual(r.totalDuration, 300);
    r.destroy();
  });

  it('accepts null arrays gracefully (falls back to empty)', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setData(null, null, null, null, null, null);
    assert.deepStrictEqual(r.channels, []);
    assert.deepStrictEqual(r.data, []);
    r.destroy();
  });
});

// ── getVisibleTimeRange ───────────────────────────────────────────────────────

describe('EEGSignalRenderer.getVisibleTimeRange', () => {
  it('returns tStart == tEnd when no data loaded', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    const range = r.getVisibleTimeRange();
    assert.strictEqual(range.tStart, 0);
    assert.strictEqual(range.tEnd, 0);
    r.destroy();
  });

  it('computes tEnd as tStart + nSamples/sfreq', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    const samples = 500;
    r.setData(['C3'], [new Float32Array(samples)], 250, 10, [], 600);
    const range = r.getVisibleTimeRange();
    assert.strictEqual(range.tStart, 10);
    assert.strictEqual(range.tEnd, 10 + samples / 250); // 12
    r.destroy();
  });
});

// ── setSensitivity ────────────────────────────────────────────────────────────

describe('EEGSignalRenderer.setSensitivity', () => {
  it('clamps to minimum 1', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setSensitivity(0);
    assert.strictEqual(r.sensitivity, 1);
    r.destroy();
  });

  it('sets positive value directly', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setSensitivity(75);
    assert.strictEqual(r.sensitivity, 75);
    r.destroy();
  });
});

// ── setMontage ────────────────────────────────────────────────────────────────

describe('EEGSignalRenderer.setMontage', () => {
  it('updates montage property', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setMontage('average');
    assert.strictEqual(r.montage, 'average');
    r.destroy();
  });

  it('referential montage passes channels through unchanged', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    const ch = ['Fp1', 'Fz', 'Oz'];
    r.setData(ch, ch.map(() => new Float32Array(100)), 250, 0, [], 10);
    r.setMontage('referential');
    assert.deepStrictEqual(r._montageChannels, ch);
    r.destroy();
  });
});

// ── setChannelStates / badChannels ────────────────────────────────────────────

describe('EEGSignalRenderer.setChannelStates', () => {
  it('populates badChannels set', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setChannelStates(['Fp1', 'T3']);
    assert.ok(r.badChannels.has('Fp1'));
    assert.ok(r.badChannels.has('T3'));
    r.destroy();
  });

  it('clears bad channels when empty array passed', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setChannelStates(['Fp1']);
    r.setChannelStates([]);
    assert.strictEqual(r.badChannels.size, 0);
    r.destroy();
  });
});

// ── setHiddenChannels / toggleChannelVisibility ───────────────────────────────

describe('EEGSignalRenderer hidden channels', () => {
  it('setHiddenChannels populates hiddenChannels set', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setHiddenChannels(['O1', 'O2']);
    assert.ok(r.hiddenChannels.has('O1'));
    assert.ok(r.hiddenChannels.has('O2'));
    r.destroy();
  });

  it('toggleChannelVisibility adds a channel that was not hidden', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.toggleChannelVisibility('Cz');
    assert.ok(r.hiddenChannels.has('Cz'));
    r.destroy();
  });

  it('toggleChannelVisibility removes a channel that was hidden', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setHiddenChannels(['Cz']);
    r.toggleChannelVisibility('Cz');
    assert.ok(!r.hiddenChannels.has('Cz'));
    r.destroy();
  });
});

// ── getSignalDataAtTime ───────────────────────────────────────────────────────

describe('EEGSignalRenderer.getSignalDataAtTime', () => {
  it('returns null when no data loaded', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    assert.strictEqual(r.getSignalDataAtTime(5), null);
    r.destroy();
  });

  it('returns an object keyed by channel name when data loaded', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    const ch = ['Fp1', 'Fp2'];
    const sfreq = 250;
    const samples = 250;
    const d = [new Float32Array(samples).fill(10), new Float32Array(samples).fill(20)];
    r.setData(ch, d, sfreq, 0, [], 10);
    const snapshot = r.getSignalDataAtTime(0.5);
    assert.ok(snapshot !== null);
    assert.ok('Fp1' in snapshot);
    assert.ok('Fp2' in snapshot);
    r.destroy();
  });

  it('returns null for time outside window', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.setData(['C3'], [new Float32Array(100)], 250, 0, [], 10);
    assert.strictEqual(r.getSignalDataAtTime(999), null);
    r.destroy();
  });
});

// ── zoomToSelection / clearZoom ───────────────────────────────────────────────

describe('EEGSignalRenderer zoom', () => {
  it('zoomToSelection sets zoomRange', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.zoomToSelection(2, 5);
    assert.deepStrictEqual(r.zoomRange, { tStart: 2, tEnd: 5 });
    r.destroy();
  });

  it('clearZoom resets zoomRange to null', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    r.zoomToSelection(2, 5);
    r.clearZoom();
    assert.strictEqual(r.zoomRange, null);
    r.destroy();
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('EEGSignalRenderer.destroy', () => {
  it('does not throw', () => {
    const canvas = makeCanvasStub();
    const r = new EEGSignalRenderer(canvas, {});
    assert.doesNotThrow(() => r.destroy());
  });
});
