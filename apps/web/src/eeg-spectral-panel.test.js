// Tests for eeg-spectral-panel.js
// Pins: FFT correctness, PSD shape, spectrogram shape, amplitude stats,
// EEGSpectralPanel construction, setData, setMode, setRegionView, destroy.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { _fft, _computePSD, _computeSpectrogram, EEGSpectralPanel } from './eeg-spectral-panel.js';

// ── Minimal DOM + Canvas stub ─────────────────────────────────────────────────
function makeCtxStub() {
  return {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: '', fillRect: () => {}, clearRect: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    fillText: () => {}, strokeRect: () => {},
    save: () => {}, restore: () => {},
    setLineDash: () => {}, setTransform: () => {},
    translate: () => {}, rotate: () => {}, scale: () => {},
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: () => {},
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  };
}

function makeCanvasStub(ctx) {
  return {
    style: { display: '', width: '', height: '', background: '' },
    width: 800, height: 300,
    parentNode: null,
    getContext: () => ctx,
    addEventListener: () => {},
  };
}

function makeContainerStub() {
  return {
    appendChild: () => {},
    removeChild: () => {},
    insertBefore: () => {},
    firstChild: null,
    style: {},
    getBoundingClientRect: () => ({ width: 800, height: 300 }),
  };
}

let _origDoc, _origWindow;
before(() => {
  if (typeof globalThis.document === 'undefined') {
    _origDoc = undefined;
    const ctx = makeCtxStub();
    const canvas = makeCanvasStub(ctx);
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') {
          const c = { ...canvas };
          c.parentNode = null;
          return c;
        }
        return { style: {}, dataset: {}, appendChild: () => {}, addEventListener: () => {}, insertBefore: () => {}, firstChild: null, textContent: '' };
      },
      getElementById: () => null,
      querySelectorAll: () => [],
    };
  }
  if (typeof globalThis.window === 'undefined') {
    _origWindow = undefined;
    globalThis.window = {
      devicePixelRatio: 1,
    };
  }
  // Stub ResizeObserver
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      constructor(cb) { this._cb = cb; }
      observe() {}
      disconnect() {}
    };
  }
});
after(() => {
  if (_origDoc === undefined) delete globalThis.document;
  if (_origWindow === undefined) delete globalThis.window;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSineSignal(freq, sfreq, nSamples) {
  const sig = [];
  for (let i = 0; i < nSamples; i++) {
    sig.push(Math.sin(2 * Math.PI * freq * i / sfreq));
  }
  return sig;
}

describe('eeg-spectral-panel — _fft', () => {
  it('_fft of DC signal has all power in bin 0', () => {
    const n = 8;
    const re = new Float64Array([1, 1, 1, 1, 1, 1, 1, 1]);
    const im = new Float64Array(n);
    _fft(re, im);
    assert.ok(Math.abs(re[0] - 8) < 1e-9, `re[0] should be 8, got ${re[0]}`);
    for (let i = 1; i < n; i++) {
      assert.ok(Math.abs(re[i]) < 1e-9, `re[${i}] should be ~0, got ${re[i]}`);
    }
  });

  it('_fft of impulse at 0 has flat magnitude spectrum', () => {
    const n = 8;
    const re = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const im = new Float64Array(n);
    _fft(re, im);
    for (let i = 0; i < n; i++) {
      const mag = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      assert.ok(Math.abs(mag - 1) < 1e-9, `mag[${i}] should be 1, got ${mag}`);
    }
  });
});

describe('eeg-spectral-panel — _computePSD', () => {
  it('returns freqs and power arrays of matching length', () => {
    const signal = makeSineSignal(10, 256, 256);
    const { freqs, power } = _computePSD(signal, 256);
    assert.strictEqual(freqs.length, power.length);
    assert.ok(freqs.length > 0);
  });

  it('freqs start at 0 Hz', () => {
    const signal = makeSineSignal(10, 256, 256);
    const { freqs } = _computePSD(signal, 256);
    assert.strictEqual(freqs[0], 0);
  });

  it('peak bin is near the injected sine frequency', () => {
    const sfreq = 256, targetFreq = 10, nSamples = 256;
    const signal = makeSineSignal(targetFreq, sfreq, nSamples);
    const { freqs, power } = _computePSD(signal, sfreq);
    let maxIdx = 0;
    for (let i = 1; i < power.length; i++) {
      if (power[i] > power[maxIdx]) maxIdx = i;
    }
    const peakFreq = freqs[maxIdx];
    assert.ok(Math.abs(peakFreq - targetFreq) <= 2,
      `peak at ${peakFreq} Hz, expected ~${targetFreq} Hz`);
  });

  it('power values are non-negative', () => {
    const signal = makeSineSignal(5, 128, 128);
    const { power } = _computePSD(signal, 128);
    for (const p of power) {
      assert.ok(p >= 0, `negative power: ${p}`);
    }
  });
});

describe('eeg-spectral-panel — _computeSpectrogram', () => {
  it('returns times, freqs, power2D', () => {
    const signal = makeSineSignal(8, 256, 512);
    const spec = _computeSpectrogram(signal, 256, 64, 32);
    assert.ok(spec.times.length > 0);
    assert.ok(spec.freqs.length > 0);
    assert.ok(spec.power2D.length === spec.times.length);
  });

  it('each frame in power2D has the same length as freqs', () => {
    const signal = makeSineSignal(8, 256, 512);
    const spec = _computeSpectrogram(signal, 256, 64, 32);
    for (const frame of spec.power2D) {
      assert.strictEqual(frame.length, spec.freqs.length);
    }
  });

  it('time values are monotonically increasing', () => {
    const signal = makeSineSignal(8, 256, 512);
    const spec = _computeSpectrogram(signal, 256, 64, 32);
    for (let i = 1; i < spec.times.length; i++) {
      assert.ok(spec.times[i] > spec.times[i - 1],
        `times not monotonic at index ${i}`);
    }
  });
});

describe('eeg-spectral-panel — EEGSpectralPanel construction', () => {
  function makePanel() {
    const container = makeContainerStub();
    const ctx = makeCtxStub();
    const canvas = makeCanvasStub(ctx);
    container.appendChild = (el) => { canvas.parentNode = container; };
    // Override createElement to return our canvas stub
    const origCreate = globalThis.document.createElement;
    globalThis.document.createElement = (tag) => {
      if (tag === 'canvas') return canvas;
      return origCreate(tag);
    };
    const panel = new EEGSpectralPanel(container, {});
    globalThis.document.createElement = origCreate;
    return { panel, container, canvas };
  }

  it('panel constructs without throwing', () => {
    assert.doesNotThrow(() => makePanel());
  });

  it('default mode is psd', () => {
    const { panel } = makePanel();
    assert.strictEqual(panel._mode, 'psd');
  });

  it('default sfreq is 256', () => {
    const { panel } = makePanel();
    assert.strictEqual(panel._sfreq, 256);
  });

  it('setMode changes _mode', () => {
    const { panel } = makePanel();
    panel.setMode('spectrogram');
    assert.strictEqual(panel._mode, 'spectrogram');
  });

  it('setMode to same value does not throw', () => {
    const { panel } = makePanel();
    assert.doesNotThrow(() => panel.setMode('psd'));
  });

  it('setSelectedChannel stores value', () => {
    const { panel } = makePanel();
    panel.setSelectedChannel('Fz');
    assert.strictEqual(panel._selectedChannel, 'Fz');
  });

  it('setRegionView toggles flag', () => {
    const { panel } = makePanel();
    assert.strictEqual(panel._regionView, false);
    panel.setRegionView(true);
    assert.strictEqual(panel._regionView, true);
  });

  it('setData stores channels and sfreq', () => {
    const { panel } = makePanel();
    const channels = ['Fp1', 'Fp2'];
    const data = [makeSineSignal(10, 256, 256), makeSineSignal(8, 256, 256)];
    panel.setData(channels, data, 256, 0);
    assert.deepStrictEqual(panel._channels, channels);
    assert.strictEqual(panel._sfreq, 256);
  });

  it('destroy nullifies canvas and ctx', () => {
    const { panel } = makePanel();
    panel.destroy();
    assert.strictEqual(panel._canvas, null);
    assert.strictEqual(panel._ctx, null);
  });
});
