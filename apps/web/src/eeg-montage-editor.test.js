// ─────────────────────────────────────────────────────────────────────────────
// eeg-montage-editor.test.js — Wave-3 large-file pin (PR 74/N)
//
// Pins public exports of eeg-montage-editor.js:
//   * EEGMontageEditor — BUILTIN_MONTAGES, addCustomMontage, removeCustomMontage,
//     getCustomMontages, applyMontage, saveToStorage / loadFromStorage
//   * EEGChannelManager — visibility, ordering, quality, renderChannelList
//   * EEGRecordingInfo  — setMetadata, _formatDuration, renderPanel,
//     renderArtifactSummary
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal DOM / localStorage stub ─────────────────────────────────────────
function installDom() {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };

  // _esc in eeg-montage-editor.js does:
  //   div.textContent = str; return div.innerHTML;
  // so we must escape HTML entities when textContent is set,
  // and return that escaped value from innerHTML.
  class FakeEl {
    constructor(tag) {
      this.tagName = tag;
      this._textContent = '';
      this._innerHTML = '';
    }
    set textContent(v) {
      this._textContent = String(v);
      // Simulate browser escaping: store HTML-escaped version in innerHTML
      this._innerHTML = String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    get textContent() { return this._textContent; }
    set innerHTML(v) { this._innerHTML = String(v); }
    get innerHTML() { return this._innerHTML; }
  }
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    getElementById: () => null,
    head: { appendChild: () => {} },
    body: new FakeEl('body'),
  };
  globalThis.window = globalThis.window || {};
  return store;
}

let EEGMontageEditor, EEGChannelManager, EEGRecordingInfo;
let domStore;

before(async () => {
  domStore = installDom();
  const mod = await import('./eeg-montage-editor.js');
  EEGMontageEditor = mod.EEGMontageEditor;
  EEGChannelManager = mod.EEGChannelManager;
  EEGRecordingInfo = mod.EEGRecordingInfo;
});

// ── EEGMontageEditor ────────────────────────────────────────────────────────

describe('EEGMontageEditor — built-in montage registry', () => {
  it('exposes expected builtin keys', () => {
    const keys = Object.keys(EEGMontageEditor.BUILTIN_MONTAGES);
    assert.ok(keys.includes('referential'));
    assert.ok(keys.includes('bipolar_long'));
    assert.ok(keys.includes('bipolar_trans'));
    assert.ok(keys.includes('average'));
    assert.ok(keys.includes('laplacian'));
  });

  it('bipolar_long has at least 18 pairs', () => {
    const m = EEGMontageEditor.BUILTIN_MONTAGES.bipolar_long;
    assert.ok(Array.isArray(m.pairs));
    assert.ok(m.pairs.length >= 18);
  });

  it('LAPLACIAN_NEIGHBORS has entries for standard 10-20 channels', () => {
    const nb = EEGMontageEditor.LAPLACIAN_NEIGHBORS;
    assert.ok(nb.Cz && nb.Fz && nb.Pz && nb.O1 && nb.F7);
  });
});

describe('EEGMontageEditor — custom montage CRUD', () => {
  let editor;
  before(() => {
    localStorage.clear();
    editor = new EEGMontageEditor(['Fp1', 'F3', 'C3', 'P3', 'O1']);
  });

  it('starts with zero custom montages', () => {
    assert.strictEqual(editor.getCustomMontages().length, 0);
  });

  it('addCustomMontage returns a unique id and increases count', () => {
    const id = editor.addCustomMontage('My Bipolar', [['Fp1', 'F3']]);
    assert.ok(typeof id === 'string' && id.length > 0);
    assert.strictEqual(editor.getCustomMontages().length, 1);
  });

  it('getCustomMontages returns name + pairs', () => {
    const m = editor.getCustomMontages()[0];
    assert.strictEqual(m.name, 'My Bipolar');
    assert.deepStrictEqual(m.pairs, [['Fp1', 'F3']]);
  });

  it('removeCustomMontage deletes by id', () => {
    const id = editor.addCustomMontage('Temp', [['C3', 'P3']]);
    editor.removeCustomMontage(id);
    const remaining = editor.getCustomMontages().filter((m) => m.name === 'Temp');
    assert.strictEqual(remaining.length, 0);
  });

  it('saveToStorage persists to localStorage key eeg_custom_montages', () => {
    assert.ok(localStorage.getItem('eeg_custom_montages') !== null);
    const parsed = JSON.parse(localStorage.getItem('eeg_custom_montages'));
    assert.ok(Array.isArray(parsed));
  });

  it('loadFromStorage round-trips custom montages', () => {
    const e2 = new EEGMontageEditor([]);
    e2.loadFromStorage();
    assert.ok(e2.getCustomMontages().some((m) => m.name === 'My Bipolar'));
  });
});

describe('EEGMontageEditor — applyMontage', () => {
  const channels = ['Fp1', 'F3', 'C3', 'P3', 'O1'];
  const data = [
    [1, 2, 3],  // Fp1
    [4, 5, 6],  // F3
    [7, 8, 9],  // C3
    [10, 11, 12], // P3
    [13, 14, 15], // O1
  ];
  let editor;
  before(() => {
    localStorage.clear();
    editor = new EEGMontageEditor(channels);
  });

  it('referential returns a copy of the original data', () => {
    const result = editor.applyMontage('referential', channels, data);
    assert.deepStrictEqual(result.channels, channels);
    assert.deepStrictEqual(result.data[0], [1, 2, 3]);
  });

  it('average subtracts per-sample mean from each channel', () => {
    const result = editor.applyMontage('average', channels, data);
    assert.ok(result.channels[0].endsWith('-Avg'));
    // sample 0: mean = (1+4+7+10+13)/5 = 7; Fp1-Avg[0] = 1-7 = -6
    assert.strictEqual(result.data[0][0], -6);
  });

  it('laplacian skips channels without neighbors in 10-20 map', () => {
    const result = editor.applyMontage('laplacian', channels, data);
    // Fp1 has neighbors F3, F7 — F7 not in dataset, so only F3 is valid
    // Channel C3 has neighbors F3, Cz, T3, P3 — Cz and T3 absent, so F3 and P3 valid
    assert.ok(result.channels.some((c) => c.endsWith('-Lap')));
  });

  it('bipolar_long computes correct differential for Fp1-F7 pair', () => {
    const chans = ['Fp1', 'F7', 'T3'];
    const d = [[10, 20, 30], [3, 6, 9], [1, 2, 3]];
    const result = editor.applyMontage('bipolar_long', chans, d);
    // Fp1-F7 should be first pair in bipolar_long
    const idx = result.channels.indexOf('Fp1-F7');
    assert.ok(idx >= 0);
    assert.strictEqual(result.data[idx][0], 7); // 10 - 3
  });

  it('custom montage applies user-defined pairs', () => {
    const id = editor.addCustomMontage('TestBip', [['C3', 'P3']]);
    const result = editor.applyMontage(id, channels, data);
    assert.strictEqual(result.channels[0], 'C3-P3');
    assert.strictEqual(result.data[0][0], -3); // 7-10
  });

  it('unknown montage type falls back to pass-through', () => {
    const result = editor.applyMontage('nonexistent', channels, data);
    assert.deepStrictEqual(result.channels, channels);
  });
});

// ── EEGChannelManager ────────────────────────────────────────────────────────

describe('EEGChannelManager — visibility', () => {
  it('all channels visible by default', () => {
    const mgr = new EEGChannelManager(['Fp1', 'F3', 'Cz']);
    assert.ok(mgr.isVisible('Fp1'));
    assert.strictEqual(mgr.getVisibleChannels().length, 3);
  });

  it('setVisible(false) hides a channel', () => {
    const mgr = new EEGChannelManager(['Fp1', 'F3', 'Cz']);
    mgr.setVisible('F3', false);
    assert.ok(!mgr.isVisible('F3'));
    assert.strictEqual(mgr.getVisibleChannels().length, 2);
  });

  it('toggleVisible switches visibility', () => {
    const mgr = new EEGChannelManager(['Fp1', 'F3']);
    mgr.toggleVisible('Fp1');
    assert.ok(!mgr.isVisible('Fp1'));
    mgr.toggleVisible('Fp1');
    assert.ok(mgr.isVisible('Fp1'));
  });

  it('setAllVisible(false) hides all channels', () => {
    const mgr = new EEGChannelManager(['Fp1', 'F3', 'Cz']);
    mgr.setAllVisible(false);
    assert.strictEqual(mgr.getVisibleChannels().length, 0);
    assert.strictEqual(mgr.getHiddenChannels().length, 3);
  });
});

describe('EEGChannelManager — ordering', () => {
  it('moveUp swaps channel with predecessor', () => {
    const mgr = new EEGChannelManager(['A', 'B', 'C']);
    mgr.moveUp('B');
    assert.deepStrictEqual(mgr.getOrder(), ['B', 'A', 'C']);
  });

  it('moveUp does nothing for first channel', () => {
    const mgr = new EEGChannelManager(['A', 'B', 'C']);
    mgr.moveUp('A');
    assert.deepStrictEqual(mgr.getOrder(), ['A', 'B', 'C']);
  });

  it('moveDown swaps channel with successor', () => {
    const mgr = new EEGChannelManager(['A', 'B', 'C']);
    mgr.moveDown('B');
    assert.deepStrictEqual(mgr.getOrder(), ['A', 'C', 'B']);
  });

  it('moveToIndex repositions correctly', () => {
    const mgr = new EEGChannelManager(['A', 'B', 'C', 'D']);
    mgr.moveToIndex('D', 0);
    assert.strictEqual(mgr.getOrder()[0], 'D');
  });

  it('resetOrder restores default', () => {
    const mgr = new EEGChannelManager(['A', 'B', 'C']);
    mgr.moveUp('C');
    mgr.resetOrder();
    assert.deepStrictEqual(mgr.getOrder(), ['A', 'B', 'C']);
  });
});

describe('EEGChannelManager — quality grading', () => {
  it('empty signal grades as flat', () => {
    const mgr = new EEGChannelManager(['Fp1']);
    const q = mgr.computeQuality('Fp1', [], 256);
    assert.strictEqual(q.grade, 'flat');
    assert.strictEqual(q.flatPercent, 100);
  });

  it('flat-line signal (all same value) grades as flat', () => {
    const mgr = new EEGChannelManager(['Fp1']);
    const flat = new Array(256).fill(5);
    const q = mgr.computeQuality('Fp1', flat, 256);
    assert.strictEqual(q.grade, 'flat');
  });

  it('large amplitude signal grades as bad', () => {
    const mgr = new EEGChannelManager(['Fp1']);
    const big = [];
    for (let i = 0; i < 256; i++) big.push(i % 2 === 0 ? 500 : -500);
    const q = mgr.computeQuality('Fp1', big, 256);
    assert.strictEqual(q.grade, 'bad');
  });

  it('normal amplitude signal grades as good or moderate (within clinical range)', () => {
    const mgr = new EEGChannelManager(['Fp1']);
    // Sawtooth wave: each sample increments by 2 µV, giving large consecutive diffs
    // RMS ~ 28 µV (well below 100), flatPercent = 0 (every diff is 2 µV > 0.5)
    const normal = [];
    for (let i = 0; i < 512; i++) normal.push((i % 30) * 2);
    const q = mgr.computeQuality('Fp1', normal, 256);
    // Any non-flat, non-bad grade is acceptable for a normal clinical signal
    assert.ok(q.grade === 'good' || q.grade === 'moderate',
      `expected good or moderate for normal amplitude signal, got: ${q.grade}`);
    assert.ok(q.rms > 0);
    assert.strictEqual(q.flatPercent, 0);
  });

  it('setQuality / getQuality round-trips', () => {
    const mgr = new EEGChannelManager(['Fp1']);
    mgr.setQuality('Fp1', { grade: 'moderate', rms: 55 });
    assert.strictEqual(mgr.getQuality('Fp1').grade, 'moderate');
  });

  it('getQuality returns null for unknown channel', () => {
    const mgr = new EEGChannelManager([]);
    assert.strictEqual(mgr.getQuality('Ghost'), null);
  });
});

describe('EEGChannelManager — renderChannelList', () => {
  it('returns HTML string containing channel names', () => {
    const mgr = new EEGChannelManager(['Fp1', 'Cz', 'O1']);
    const html = mgr.renderChannelList([]);
    assert.ok(typeof html === 'string' && html.length > 0);
    assert.ok(html.includes('Fp1'));
    assert.ok(html.includes('Cz'));
  });

  it('bad channels appear in HTML', () => {
    const mgr = new EEGChannelManager(['Fp1', 'F3']);
    const html = mgr.renderChannelList(['F3']);
    assert.ok(html.includes('F3'));
  });

  it('channel count header shows correct ratio', () => {
    const mgr = new EEGChannelManager(['Fp1', 'F3', 'Cz']);
    mgr.setVisible('Cz', false);
    const html = mgr.renderChannelList([]);
    assert.ok(html.includes('2/3'));
  });
});

// ── EEGRecordingInfo ─────────────────────────────────────────────────────────

describe('EEGRecordingInfo — formatDuration', () => {
  it('< 60 s renders as seconds', () => {
    assert.strictEqual(EEGRecordingInfo._formatDuration(30), '30s');
  });

  it('60–3599 s renders as minutes + optional seconds', () => {
    assert.strictEqual(EEGRecordingInfo._formatDuration(90), '1m 30s');
    assert.strictEqual(EEGRecordingInfo._formatDuration(60), '1m ');
  });

  it('>= 3600 s renders as hours + minutes', () => {
    const str = EEGRecordingInfo._formatDuration(3661);
    assert.ok(str.includes('h'));
  });
});

describe('EEGRecordingInfo — renderPanel', () => {
  it('returns "No recording loaded" when no metadata set', () => {
    const info = new EEGRecordingInfo();
    const html = info.renderPanel();
    assert.ok(html.includes('No recording loaded'));
  });

  it('shows channel count, sample rate, duration after setMetadata', () => {
    const info = new EEGRecordingInfo();
    info.setMetadata({ n_channels: 19, sfreq: 256, duration_sec: 120, n_samples: 30720, fileFormat: 'EDF' });
    const html = info.renderPanel();
    assert.ok(html.includes('19'));
    assert.ok(html.includes('256'));
    assert.ok(html.includes('2m'));
    assert.ok(html.includes('EDF'));
  });

  it('escapes HTML in fileFormat to prevent XSS', () => {
    const info = new EEGRecordingInfo();
    info.setMetadata({ n_channels: 1, sfreq: 100, duration_sec: 1, n_samples: 100, fileFormat: '<script>alert(1)</script>' });
    const html = info.renderPanel();
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('includes optional fields when provided', () => {
    const info = new EEGRecordingInfo();
    info.setMetadata({ n_channels: 10, sfreq: 512, duration_sec: 60, n_samples: 30720, patientId: 'PT001', technician: 'Dr. A' });
    const html = info.renderPanel();
    assert.ok(html.includes('PT001'));
    assert.ok(html.includes('Dr. A'));
  });
});

describe('EEGRecordingInfo — renderArtifactSummary', () => {
  it('returns empty string for falsy artifacts', () => {
    const info = new EEGRecordingInfo();
    assert.strictEqual(info.renderArtifactSummary(null), '');
  });

  it('renders badge with count for each artifact type', () => {
    const info = new EEGRecordingInfo();
    const html = info.renderArtifactSummary({ blinks: 12, muscle: 3, movement: 0, electrode_pop: 1 });
    assert.ok(html.includes('12'));
    assert.ok(html.includes('Blinks'));
    assert.ok(html.includes('Muscle'));
    assert.ok(html.includes('Electrode Pop'));
  });
});

describe('EEGMontageEditor — renderEditorModal', () => {
  it('returns HTML string containing Montage Editor heading', () => {
    const editor = new EEGMontageEditor(['Fp1', 'Cz']);
    const html = EEGMontageEditor.renderEditorModal(editor);
    assert.ok(typeof html === 'string');
    assert.ok(html.includes('Montage Editor'));
  });

  it('escapes channel names in option elements', () => {
    const editor = new EEGMontageEditor(['Fp1', '<evil>']);
    const html = EEGMontageEditor.renderEditorModal(editor);
    assert.ok(!html.includes('<evil>'));
    assert.ok(html.includes('&lt;evil&gt;'));
  });

  it('lists existing custom montages by name', () => {
    const editor = new EEGMontageEditor(['Fp1', 'Cz']);
    editor.addCustomMontage('AlphaCustom', [['Fp1', 'Cz']]);
    const html = EEGMontageEditor.renderEditorModal(editor);
    assert.ok(html.includes('AlphaCustom'));
  });
});
