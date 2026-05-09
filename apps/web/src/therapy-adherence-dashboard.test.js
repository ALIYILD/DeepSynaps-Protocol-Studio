// Tests for therapy-adherence-dashboard.js
// Pins public exports (renderAdherenceDashboard, bindAdherenceActions) plus
// the module-internal logic reachable from outside via rendered HTML.
// DOM-dependent rendering: stubbed with minimal document/window fakes.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { renderAdherenceDashboard, bindAdherenceActions } from './therapy-adherence-dashboard.js';

// ── Minimal DOM stub (renderAdherenceDashboard returns HTML string, no real DOM needed) ──
let _origDoc, _origWin;
before(() => {
  if (typeof globalThis.document === 'undefined') {
    _origDoc = undefined;
    globalThis.document = {
      getElementById: () => null,
      querySelectorAll: () => ({ forEach: () => {} }),
      createElement: () => ({ style: {}, appendChild: () => {}, textContent: '' }),
    };
  }
  if (typeof globalThis.window === 'undefined') {
    _origWin = undefined;
    globalThis.window = { _dsToast: undefined };
  }
});
after(() => {
  if (_origDoc === undefined) delete globalThis.document;
  if (_origWin === undefined) delete globalThis.window;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal api stub that resolves to empty arrays for all list methods */
function emptyApi() {
  return {
    listHomeAssignments: async () => [],
    listHomeSessionLogs: async () => [],
    listHomeAdherenceEvents: async () => [],
  };
}

/** Build a completed session log */
function makeLog(dateStr, completed = true, durationMinutes = 30) {
  return {
    session_date: dateStr,
    completed,
    duration_minutes: durationMinutes,
    device_name: 'tDCS',
    device_category: 'tDCS',
    assignment_id: 'a1',
  };
}

/** Build a simple active assignment */
function makeAssignment(startDate, freq = 3, planned = 12) {
  return {
    id: 'a1',
    status: 'active',
    session_frequency_per_week: freq,
    planned_total_sessions: planned,
    start_date: startDate,
    device_name: 'tDCS',
    device_category: 'tDCS',
  };
}

describe('therapy-adherence-dashboard — renderAdherenceDashboard returns HTML', () => {
  it('returns a non-empty HTML string for empty data', async () => {
    const html = await renderAdherenceDashboard('pt-001', emptyApi());
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.length > 100, 'HTML should be non-trivial');
  });

  it('contains adh-wrap wrapper element', async () => {
    const html = await renderAdherenceDashboard('pt-002', emptyApi());
    assert.ok(html.includes('adh-wrap'), 'should contain adh-wrap class');
  });

  it('contains style block for adherence styles', async () => {
    const html = await renderAdherenceDashboard('pt-003', emptyApi());
    assert.ok(html.includes('<style'), 'should contain embedded <style>');
    assert.ok(html.includes('adh-styles'), 'style should have adh-styles id');
  });

  it('shows 0% adherence for no completed sessions', async () => {
    const html = await renderAdherenceDashboard('pt-004', emptyApi());
    assert.ok(html.includes('0%'), 'should show 0% adherence');
  });

  it('no-alerts message appears when no events and no recent misses', async () => {
    const html = await renderAdherenceDashboard('pt-005', emptyApi());
    assert.ok(html.includes('No adherence alerts'), 'should show no-alerts message');
  });

  it('renders session count in the timeline section', async () => {
    const api = {
      listHomeAssignments: async () => [makeAssignment('2026-04-01', 3, 12)],
      listHomeSessionLogs: async () => [
        makeLog('2026-04-02', true),
        makeLog('2026-04-05', true),
        makeLog('2026-04-07', false),
      ],
      listHomeAdherenceEvents: async () => [],
    };
    const html = await renderAdherenceDashboard('pt-006', api);
    assert.ok(html.includes('3 sessions'), 'should show session count');
  });

  it('contains donut SVG element', async () => {
    const html = await renderAdherenceDashboard('pt-007', emptyApi());
    assert.ok(html.includes('adh-donut-svg'), 'should contain donut SVG');
  });
});

describe('therapy-adherence-dashboard — adherence percentage computation', () => {
  it('shows 100% when all planned sessions are completed', async () => {
    const api = {
      listHomeAssignments: async () => [makeAssignment('2026-01-01', 1, 3)],
      listHomeSessionLogs: async () => [
        makeLog('2026-01-07', true),
        makeLog('2026-01-14', true),
        makeLog('2026-01-21', true),
      ],
      listHomeAdherenceEvents: async () => [],
    };
    const html = await renderAdherenceDashboard('pt-008', api);
    assert.ok(html.includes('100%'), 'should show 100% when fully completed');
  });

  it('completed and partial counts appear in stats', async () => {
    const api = {
      listHomeAssignments: async () => [],
      listHomeSessionLogs: async () => [
        makeLog('2026-03-01', true),
        makeLog('2026-03-02', false),
      ],
      listHomeAdherenceEvents: async () => [],
    };
    const html = await renderAdherenceDashboard('pt-009', api);
    // donut stats should mention "1 done" and "1 partial"
    assert.ok(html.includes('1</b> done'), 'should show 1 done');
    assert.ok(html.includes('1</b> partial'), 'should show 1 partial');
  });
});

describe('therapy-adherence-dashboard — streak tracker in HTML', () => {
  it('streak card is present in rendered output', async () => {
    const html = await renderAdherenceDashboard('pt-010', emptyApi());
    assert.ok(html.includes('adh-streak-card'), 'streak card missing');
  });

  it('renders Current streak label', async () => {
    const html = await renderAdherenceDashboard('pt-011', emptyApi());
    assert.ok(html.includes('Current streak'), 'should show Current streak label');
  });
});

describe('therapy-adherence-dashboard — device usage rendering', () => {
  it('renders device usage section when assignment has a device', async () => {
    const api = {
      listHomeAssignments: async () => [makeAssignment('2026-03-01', 3, 12)],
      listHomeSessionLogs: async () => [makeLog('2026-03-03', true)],
      listHomeAdherenceEvents: async () => [],
    };
    const html = await renderAdherenceDashboard('pt-012', api);
    assert.ok(html.includes('adh-dev-row') || html.includes('tDCS'), 'device section expected');
  });

  it('empty device usage shows placeholder text', async () => {
    const html = await renderAdherenceDashboard('pt-013', emptyApi());
    assert.ok(html.includes('adh-device-empty') || html.includes('No device usage'), 'empty device state expected');
  });
});

describe('therapy-adherence-dashboard — bindAdherenceActions', () => {
  it('bindAdherenceActions does not throw', () => {
    assert.doesNotThrow(() => bindAdherenceActions());
  });
});

describe('therapy-adherence-dashboard — API failures handled gracefully', () => {
  it('returns valid HTML even when all API calls reject', async () => {
    const failApi = {
      listHomeAssignments: async () => { throw new Error('API down'); },
      listHomeSessionLogs: async () => { throw new Error('API down'); },
      listHomeAdherenceEvents: async () => { throw new Error('API down'); },
    };
    const html = await renderAdherenceDashboard('pt-014', failApi);
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.includes('adh-wrap'), 'should still render wrapper');
  });

  it('returns HTML when api object is missing methods', async () => {
    const html = await renderAdherenceDashboard('pt-015', {});
    assert.strictEqual(typeof html, 'string');
    assert.ok(html.includes('adh-wrap'));
  });
});
