// Tests for pages-inbox.js — pure exported helpers only (no DOM required).
// Pins: routing/category logic, filter param builders, audit payload builder,
// demo-banner/empty-state predicates, note validation, group-by logic,
// unread count, drill-out URL, and export CSV path.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  inboxSurfaceCategory,
  inboxItemMatchesCategory,
  inboxItemMatchesSearch,
  buildInboxAuditPayload,
  buildInboxFilterParams,
  shouldShowInboxDemoBanner,
  shouldShowInboxEmptyState,
  inboxNoteRequiredValid,
  inboxSummaryHonestUnreadCount,
  inboxHasUsableLoadedState,
  inboxDrillOutPageFor,
  inboxBuildDrillOutUrl,
  inboxExportCsvPath,
  groupInboxItemsByPatient,
} from './pages-inbox.js';

// Minimal DOM stub so the module doesn't crash on import
let _origDoc;
before(() => {
  if (typeof globalThis.document === 'undefined') {
    _origDoc = undefined;
    globalThis.document = {
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: (tag) => ({
        style: {},
        dataset: {},
        appendChild: () => {},
        addEventListener: () => {},
        insertBefore: () => {},
        firstChild: null,
        textContent: '',
      }),
    };
  }
});
after(() => {
  if (_origDoc === undefined) delete globalThis.document;
});

describe('pages-inbox — inboxSurfaceCategory', () => {
  it('patient_messages → messages', () => {
    assert.strictEqual(inboxSurfaceCategory('patient_messages'), 'messages');
  });

  it('adherence_events → adherence', () => {
    assert.strictEqual(inboxSurfaceCategory('adherence_events'), 'adherence');
  });

  it('home_program_tasks → adherence', () => {
    assert.strictEqual(inboxSurfaceCategory('home_program_tasks'), 'adherence');
  });

  it('wearables → wearables', () => {
    assert.strictEqual(inboxSurfaceCategory('wearables'), 'wearables');
  });

  it('wearables_workbench → wearables', () => {
    assert.strictEqual(inboxSurfaceCategory('wearables_workbench'), 'wearables');
  });

  it('adverse_events_hub → safety', () => {
    assert.strictEqual(inboxSurfaceCategory('adverse_events_hub'), 'safety');
  });

  it('course_detail → protocol', () => {
    assert.strictEqual(inboxSurfaceCategory('course_detail'), 'protocol');
  });

  it('quality_assurance → protocol', () => {
    assert.strictEqual(inboxSurfaceCategory('quality_assurance'), 'protocol');
  });

  it('patient_profile → intake', () => {
    assert.strictEqual(inboxSurfaceCategory('patient_profile'), 'intake');
  });

  it('unknown surface → other', () => {
    assert.strictEqual(inboxSurfaceCategory('some_unknown_surface'), 'other');
  });
});

describe('pages-inbox — inboxItemMatchesCategory', () => {
  it('all category always matches', () => {
    assert.strictEqual(inboxItemMatchesCategory({ surface: 'wearables' }, 'all'), true);
  });

  it('item in correct bucket matches', () => {
    assert.strictEqual(inboxItemMatchesCategory({ surface: 'adherence_events' }, 'adherence'), true);
  });

  it('item in wrong bucket does not match', () => {
    assert.strictEqual(inboxItemMatchesCategory({ surface: 'patient_messages' }, 'safety'), false);
  });
});

describe('pages-inbox — inboxItemMatchesSearch', () => {
  it('empty query always matches', () => {
    assert.strictEqual(inboxItemMatchesSearch({ note: 'anything' }, ''), true);
  });

  it('matches note text (case insensitive)', () => {
    const item = { note: 'Patient missed session', surface: 'adherence_events' };
    assert.strictEqual(inboxItemMatchesSearch(item, 'MISSED'), true);
  });

  it('no match when query not found', () => {
    const item = { note: 'HRV alert', surface: 'wearables', patient_name: 'Alice' };
    assert.strictEqual(inboxItemMatchesSearch(item, 'xyzzy123'), false);
  });
});

describe('pages-inbox — buildInboxAuditPayload', () => {
  it('event key is set correctly', () => {
    const p = buildInboxAuditPayload('view');
    assert.strictEqual(p.event, 'view');
  });

  it('item_event_id is stringified', () => {
    const p = buildInboxAuditPayload('item_acknowledged_via_modal', { item_event_id: 42 });
    assert.strictEqual(p.item_event_id, '42');
  });

  it('note is included and truncated to 480 chars', () => {
    const long = 'x'.repeat(600);
    const p = buildInboxAuditPayload('export', { note: long });
    assert.strictEqual(p.note.length, 480);
  });

  it('using_demo_data is included when true', () => {
    const p = buildInboxAuditPayload('bulk_acknowledged', { using_demo_data: true });
    assert.strictEqual(p.using_demo_data, true);
  });
});

describe('pages-inbox — buildInboxFilterParams', () => {
  it('returns only provided keys', () => {
    const p = buildInboxFilterParams({ surface: 'wearables', status: 'unread' });
    assert.strictEqual(p.surface, 'wearables');
    assert.strictEqual(p.status, 'unread');
    assert.strictEqual('patient_id' in p, false);
  });

  it('empty filters returns empty object', () => {
    assert.deepStrictEqual(buildInboxFilterParams({}), {});
  });

  it('null/undefined filters returns empty object', () => {
    assert.deepStrictEqual(buildInboxFilterParams(null), {});
  });
});

describe('pages-inbox — shouldShowInboxDemoBanner', () => {
  it('returns true when is_demo_view is truthy', () => {
    assert.strictEqual(shouldShowInboxDemoBanner({ is_demo_view: true }), true);
  });

  it('returns false when is_demo_view is falsy', () => {
    assert.strictEqual(shouldShowInboxDemoBanner({ is_demo_view: false }), false);
  });

  it('returns false for null response', () => {
    assert.strictEqual(shouldShowInboxDemoBanner(null), false);
  });
});

describe('pages-inbox — shouldShowInboxEmptyState', () => {
  it('returns true for null response', () => {
    assert.strictEqual(shouldShowInboxEmptyState(null), true);
  });

  it('returns true for empty items array', () => {
    assert.strictEqual(shouldShowInboxEmptyState({ items: [] }), true);
  });

  it('returns false when items array has entries', () => {
    assert.strictEqual(shouldShowInboxEmptyState({ items: [{ event_id: '1' }] }), false);
  });
});

describe('pages-inbox — inboxNoteRequiredValid', () => {
  it('returns false for null', () => {
    assert.strictEqual(inboxNoteRequiredValid(null), false);
  });

  it('returns false for whitespace-only string', () => {
    assert.strictEqual(inboxNoteRequiredValid('   '), false);
  });

  it('returns true for non-empty string', () => {
    assert.strictEqual(inboxNoteRequiredValid('Review completed'), true);
  });
});

describe('pages-inbox — inboxSummaryHonestUnreadCount', () => {
  it('returns 0 for null', () => {
    assert.strictEqual(inboxSummaryHonestUnreadCount(null), 0);
  });

  it('returns the server count directly', () => {
    assert.strictEqual(inboxSummaryHonestUnreadCount({ high_priority_unread: 7 }), 7);
  });

  it('returns 0 for negative values', () => {
    assert.strictEqual(inboxSummaryHonestUnreadCount({ high_priority_unread: -3 }), 0);
  });
});

describe('pages-inbox — inboxHasUsableLoadedState', () => {
  it('true when loaded and no error', () => {
    assert.strictEqual(inboxHasUsableLoadedState({ loaded: true, error: null }), true);
  });

  it('false when not yet loaded', () => {
    assert.strictEqual(inboxHasUsableLoadedState({ loaded: false, error: null }), false);
  });

  it('false when error is present', () => {
    assert.strictEqual(inboxHasUsableLoadedState({ loaded: true, error: 'timeout' }), false);
  });
});

describe('pages-inbox — inboxDrillOutPageFor', () => {
  it('patient_messages → patient-messages', () => {
    assert.strictEqual(inboxDrillOutPageFor('patient_messages'), 'patient-messages');
  });

  it('wearables_workbench → monitor', () => {
    assert.strictEqual(inboxDrillOutPageFor('wearables_workbench'), 'monitor');
  });

  it('unknown surface → null', () => {
    assert.strictEqual(inboxDrillOutPageFor('no_such_surface'), null);
  });
});

describe('pages-inbox — inboxBuildDrillOutUrl', () => {
  it('builds url with page and patient_id', () => {
    const url = inboxBuildDrillOutUrl({ surface: 'wearables', patient_id: 'p42' });
    assert.ok(url.includes('page=patient-wearables'), `url: ${url}`);
    assert.ok(url.includes('patient_id=p42'), `url: ${url}`);
  });

  it('returns null for unknown surface', () => {
    assert.strictEqual(inboxBuildDrillOutUrl({ surface: 'unknown_surface' }), null);
  });
});

describe('pages-inbox — inboxExportCsvPath', () => {
  it('returns the canonical export path', () => {
    assert.strictEqual(inboxExportCsvPath(), '/api/v1/clinician-inbox/export.csv');
  });
});

describe('pages-inbox — groupInboxItemsByPatient', () => {
  const items = [
    { event_id: '1', patient_id: 'pA', patient_name: 'Alice', surface: 'wearables', is_acknowledged: false, is_demo: false },
    { event_id: '2', patient_id: 'pA', patient_name: 'Alice', surface: 'adherence_events', is_acknowledged: true, is_demo: false },
    { event_id: '3', patient_id: 'pB', patient_name: 'Bob',   surface: 'patient_messages', is_acknowledged: false, is_demo: true },
  ];

  it('groups by patient_id — 2 patients', () => {
    const grouped = groupInboxItemsByPatient(items);
    assert.strictEqual(grouped.length, 2);
  });

  it('patient with more unread appears first', () => {
    const grouped = groupInboxItemsByPatient(items);
    // pA has 1 unread, pB has 1 unread — sorted alphabetically as tie-break
    // pA: unread=1, pB: unread=1 → alphabet: A before B
    const names = grouped.map(g => g.patient_name);
    assert.deepStrictEqual(names, ['Alice', 'Bob']);
  });

  it('item_count is accurate per group', () => {
    const grouped = groupInboxItemsByPatient(items);
    const alice = grouped.find(g => g.patient_id === 'pA');
    assert.strictEqual(alice.item_count, 2);
  });

  it('is_demo flag set when any item in group is demo', () => {
    const grouped = groupInboxItemsByPatient(items);
    const bob = grouped.find(g => g.patient_id === 'pB');
    assert.strictEqual(bob.is_demo, true);
  });

  it('returns empty array for null/empty input', () => {
    assert.deepStrictEqual(groupInboxItemsByPatient(null), []);
    assert.deepStrictEqual(groupInboxItemsByPatient([]), []);
  });
});
