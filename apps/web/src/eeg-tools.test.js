// tests for eeg-tools.js
// Tests EEGEventEditor, EEGMeasurementTool, EEGExporter, EEGUndoManager.
// No DOM needed for core logic tests; a minimal shim is provided for
// EEGExporter._download and EEGExporter.exportSummary (which touches navigator).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

let savedDocument;
// navigator is a read-only property in Node — we patch clipboard directly
let savedClipboard;

before(() => {
  savedDocument = globalThis.document;

  // Minimal DOM shim for EEGExporter._download
  const mockAnchor = {
    href: '', download: '', style: { display: '' },
    click() {},
    tag: 'a',
  };
  globalThis.document = {
    createElement: (tag) => tag === 'a' ? mockAnchor : { tag },
    body: { appendChild() {}, removeChild() {} },
    head: { appendChild() {} },
  };

  // Patch navigator.clipboard if accessible; otherwise install a minimal stub.
  // Node 20 does not define `navigator` at all; bare `navigator` in source code
  // throws ReferenceError unless we add it to globalThis first.
  try {
    savedClipboard = globalThis.navigator?.clipboard;
    if (!globalThis.navigator) {
      // Node 20: navigator is completely absent — install a minimal stub so that
      // `if (navigator.clipboard && navigator.clipboard.writeText)` in the
      // production source doesn't throw ReferenceError.
      globalThis.navigator = { clipboard: { writeText: () => Promise.resolve() } };
    } else if (!globalThis.navigator.clipboard) {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: { writeText: () => Promise.resolve() },
        configurable: true,
        writable: true,
      });
    }
  } catch { /* read-only navigator — exportSummary will just skip clipboard */ }

  // URL shim
  if (!globalThis.URL || !globalThis.URL.createObjectURL) {
    globalThis.URL = globalThis.URL || {};
    globalThis.URL.createObjectURL = () => 'blob:mock';
    globalThis.URL.revokeObjectURL = () => {};
  }
  globalThis.Blob = globalThis.Blob || class MockBlob {
    constructor(parts, opts) { this.parts = parts; this.type = opts?.type || ''; }
  };
});

after(() => {
  globalThis.document = savedDocument;
  // Restore navigator: if we installed a full stub, remove it; otherwise restore clipboard only.
  try {
    if (savedClipboard === undefined && globalThis.navigator && globalThis.navigator.clipboard) {
      // We injected the entire navigator object — remove it
      delete globalThis.navigator;
    } else if (globalThis.navigator && savedClipboard !== undefined) {
      Object.defineProperty(globalThis.navigator, 'clipboard', {
        value: savedClipboard,
        configurable: true,
        writable: true,
      });
    }
  } catch { /* ignore */ }
});

const { EEGEventEditor, EEGMeasurementTool, EEGExporter, EEGUndoManager } = await import('./eeg-tools.js');

// ── EEGEventEditor ────────────────────────────────────────────────────────────

describe('EEGEventEditor', () => {
  it('EVENT_TYPES contains 8 predefined types', () => {
    assert.strictEqual(EEGEventEditor.EVENT_TYPES.length, 8);
  });

  it('EVENT_TYPES includes Seizure Onset and Artifact', () => {
    const labels = EEGEventEditor.EVENT_TYPES.map(t => t.label);
    assert.ok(labels.includes('Seizure Onset'), 'Expected "Seizure Onset" event type');
    assert.ok(labels.includes('Artifact'), 'Expected "Artifact" event type');
  });

  it('addEvent inserts and returns the event with correct fields', () => {
    const editor = new EEGEventEditor();
    const evt = editor.addEvent(5.0, 'Eyes Open', '#4caf50');
    assert.strictEqual(evt.time, 5.0);
    assert.strictEqual(evt.label, 'Eyes Open');
    assert.strictEqual(evt.color, '#4caf50');
    assert.ok(typeof evt.id === 'number');
  });

  it('addEvent keeps events sorted by time', () => {
    const editor = new EEGEventEditor();
    editor.addEvent(10.0, 'B', '#fff');
    editor.addEvent(2.0, 'A', '#fff');
    editor.addEvent(7.5, 'C', '#fff');
    const times = editor.getEvents().map(e => e.time);
    assert.deepStrictEqual(times, [2.0, 7.5, 10.0]);
  });

  it('removeEvent deletes the event by id', () => {
    const editor = new EEGEventEditor();
    const evt = editor.addEvent(3.0, 'Test', '#000');
    editor.removeEvent(evt.id);
    assert.strictEqual(editor.getEvents().length, 0);
  });

  it('updateEvent patches label without changing id', () => {
    const editor = new EEGEventEditor();
    const evt = editor.addEvent(1.0, 'Old', '#aaa');
    editor.updateEvent(evt.id, { label: 'Updated' });
    const [updated] = editor.getEvents();
    assert.strictEqual(updated.label, 'Updated');
    assert.strictEqual(updated.id, evt.id);
  });

  it('getEventsInRange returns only events within the time window', () => {
    const editor = new EEGEventEditor();
    editor.addEvent(1.0, 'A', '#111');
    editor.addEvent(5.0, 'B', '#222');
    editor.addEvent(9.0, 'C', '#333');
    const inRange = editor.getEventsInRange(2.0, 7.0);
    assert.strictEqual(inRange.length, 1);
    assert.strictEqual(inRange[0].label, 'B');
  });

  it('renderEventList returns "No events" when empty', () => {
    const editor = new EEGEventEditor();
    const html = editor.renderEventList();
    assert.ok(html.includes('No events'), `Expected "No events" in empty list HTML`);
  });

  it('renderEventList includes time and label when events exist', () => {
    const editor = new EEGEventEditor();
    editor.addEvent(12.345, 'Seizure Onset', '#e91e63');
    const html = editor.renderEventList();
    assert.ok(html.includes('12.35'), `Expected time "12.35" in event list HTML`);
    assert.ok(html.includes('Seizure Onset'), `Expected label in event list HTML`);
  });
});

// ── EEGMeasurementTool ────────────────────────────────────────────────────────

describe('EEGMeasurementTool', () => {
  it('isActive returns false by default', () => {
    const tool = new EEGMeasurementTool();
    assert.strictEqual(tool.isActive(), false);
  });

  it('setActive(true) makes isActive() return true', () => {
    const tool = new EEGMeasurementTool();
    tool.setActive(true);
    assert.strictEqual(tool.isActive(), true);
  });

  it('getMeasurement returns null when no points are set', () => {
    const tool = new EEGMeasurementTool();
    assert.strictEqual(tool.getMeasurement(), null);
  });

  it('getMeasurement returns correct deltaTime and frequency', () => {
    const tool = new EEGMeasurementTool();
    tool.setPoint(1, 0.0, 10.0, 'Fp1');
    tool.setPoint(2, 0.5, 20.0, 'Fp1');
    const m = tool.getMeasurement();
    assert.ok(m !== null);
    assert.strictEqual(m.deltaTime, 0.5);
    assert.strictEqual(m.deltaAmplitude, 10.0);
    // frequency = 1/0.5 = 2 Hz
    assert.ok(Math.abs(m.frequency - 2.0) < 1e-9, `Expected freq=2.0, got ${m.frequency}`);
  });

  it('clearPoints resets getMeasurement to null', () => {
    const tool = new EEGMeasurementTool();
    tool.setPoint(1, 1.0, 5.0, 'O1');
    tool.setPoint(2, 2.0, 8.0, 'O2');
    tool.clearPoints();
    assert.strictEqual(tool.getMeasurement(), null);
  });
});

// ── EEGExporter ──────────────────────────────────────────────────────────────

describe('EEGExporter', () => {
  it('exportSummary returns a string containing the montage value', () => {
    const text = EEGExporter.exportSummary({
      montage: 'Longitudinal',
      sensitivity: 100,
      timebase: 10,
      badChannels: ['T3', 'T4'],
      badSegments: [],
      filters: { lowCut: 1, highCut: 70, notch: 50 },
    });
    assert.ok(typeof text === 'string');
    assert.ok(text.includes('Longitudinal'), 'Expected montage name in summary');
    assert.ok(text.includes('T3'), 'Expected bad channels in summary');
    assert.ok(text.includes('70'), 'Expected highCut filter value in summary');
  });

  it('exportSummary includes "=== EEG Viewer Summary ===" header', () => {
    const text = EEGExporter.exportSummary({ montage: 'Bipolar', badChannels: [], badSegments: [] });
    assert.ok(text.includes('=== EEG Viewer Summary ==='));
  });

  it('exportSummary reports "none" when no bad channels', () => {
    const text = EEGExporter.exportSummary({ badChannels: [], badSegments: [] });
    assert.ok(text.includes('none'), 'Expected "none" for empty bad-channels list');
  });
});

// ── EEGUndoManager ────────────────────────────────────────────────────────────

describe('EEGUndoManager', () => {
  it('canUndo is false and canRedo is false when empty', () => {
    const mgr = new EEGUndoManager();
    assert.strictEqual(mgr.canUndo(), false);
    assert.strictEqual(mgr.canRedo(), false);
  });

  it('push makes canUndo true', () => {
    const mgr = new EEGUndoManager();
    mgr.push({ type: 'add_event', data: {}, undo() {}, redo() {} });
    assert.strictEqual(mgr.canUndo(), true);
  });

  it('undo calls the undo function and moves action to redo stack', () => {
    const mgr = new EEGUndoManager();
    let undoCalled = false;
    mgr.push({ type: 'add_event', data: { id: 1 }, undo() { undoCalled = true; }, redo() {} });
    const result = mgr.undo();
    assert.ok(undoCalled, 'undo() function should be called');
    assert.ok(result !== null);
    assert.strictEqual(mgr.canUndo(), false);
    assert.strictEqual(mgr.canRedo(), true);
  });

  it('redo calls the redo function and moves action back to undo stack', () => {
    const mgr = new EEGUndoManager();
    let redoCalled = false;
    mgr.push({ type: 'remove_event', data: {}, undo() {}, redo() { redoCalled = true; } });
    mgr.undo();
    mgr.redo();
    assert.ok(redoCalled, 'redo() function should be called');
    assert.strictEqual(mgr.canUndo(), true);
    assert.strictEqual(mgr.canRedo(), false);
  });

  it('push clears the redo stack', () => {
    const mgr = new EEGUndoManager();
    mgr.push({ type: 'a', data: {}, undo() {}, redo() {} });
    mgr.undo();
    assert.strictEqual(mgr.canRedo(), true);
    mgr.push({ type: 'b', data: {}, undo() {}, redo() {} });
    assert.strictEqual(mgr.canRedo(), false, 'New push should clear redo stack');
  });

  it('respects maxHistory depth by discarding oldest actions', () => {
    const mgr = new EEGUndoManager(3);
    for (let i = 0; i < 5; i++) {
      mgr.push({ type: `action_${i}`, data: {}, undo() {}, redo() {} });
    }
    // Only 3 actions should remain
    assert.strictEqual(mgr.getHistory().length, 3);
    // The oldest 2 are discarded, so the first kept type should be action_2
    assert.strictEqual(mgr.getHistory()[0].type, 'action_2');
  });

  it('clear resets both undo and redo stacks', () => {
    const mgr = new EEGUndoManager();
    mgr.push({ type: 'x', data: {}, undo() {}, redo() {} });
    mgr.clear();
    assert.strictEqual(mgr.canUndo(), false);
    assert.strictEqual(mgr.canRedo(), false);
  });
});
