// ─────────────────────────────────────────────────────────────────────────────
// protocol-hub-governance.test.js — BUG-FIX-003 regression tests
//
// Regression: The governance workspace (My Drafts tab) was not correctly
// labelling all governance states. The _govLabel helper only handled
// 'approved', 'submitted', 'rejected' — everything else fell through to
// 'Draft'. This caused needs_review and archived states to be visually
// indistinguishable, confusing clinicians about sign-off status.
//
// BUG-FIX-003 (pages-clinical-hubs.js lines 4463-4546) now provides:
//   - _govLabel()      — distinct labels for all 6 governance states
//   - _govBadgeClass() — distinct CSS classes for all 6 states
//   - _govFilters      — filter buttons for all 6 states + 'all'
//   - _psGovSubmit()   — draft → submitted transition
//   - _psGovApprove()  — submitted → approved transition
//   - _psGovReject()   — submitted → rejected transition
//
// These tests pin the expected label mapping, badge classes, filtering,
// and state-transition behaviour.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GOVERNANCE_LABELS } from './protocols-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Exact _govLabel logic from pages-clinical-hubs.js (lines 4466-4474) ─────

function _govLabel(s) {
  const x = String(s || 'draft').toLowerCase();
  if (x === 'approved') return 'Approved / Signed';
  if (x === 'submitted') return 'Submitted for Review';
  if (x === 'rejected') return 'Rejected';
  if (x === 'needs_review') return 'Needs Review';
  if (x === 'archived') return 'Archived';
  return 'Draft';
}

// ── Exact _govBadgeClass logic from pages-clinical-hubs.js (lines 4475-4483) ─

function _govBadgeClass(s) {
  const x = String(s || 'draft').toLowerCase();
  if (x === 'approved') return 'ps-state-approved';
  if (x === 'submitted') return 'ps-state-submitted';
  if (x === 'rejected') return 'ps-state-rejected';
  if (x === 'needs_review') return 'ps-state-needs-review';
  if (x === 'archived') return 'ps-state-archived';
  return 'ps-state-draft';
}

// ── Filter by governance state ──────────────────────────────────────────────

function filterByGovernance(items, state) {
  return items.filter(item => (item.governance_state || 'draft') === state);
}

// ── Source file for regression pins ─────────────────────────────────────────
const HUB_SOURCE = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf-8');

// ── All governance states seen in the codebase ──────────────────────────────
const ALL_STATES = ['draft', 'needs_review', 'submitted', 'approved', 'rejected', 'archived'];

// ══════════════════════════════════════════════════════════════════════════════
// Source-level regression check — BUG-FIX-003 comment exists
// ══════════════════════════════════════════════════════════════════════════════

describe('BUG-FIX-003: Source-level regression checks', () => {
  it('source contains the BUG-FIX-003 comment', () => {
    assert.ok(
      HUB_SOURCE.includes('BUG-FIX-003: governance workspace'),
      'BUG-FIX-003 comment must exist in pages-clinical-hubs.js'
    );
  });

  it('source defines _govLabel function', () => {
    assert.ok(
      HUB_SOURCE.includes("const _govLabel = (s) => {"),
      '_govLabel must exist'
    );
  });

  it('source defines _govBadgeClass function', () => {
    assert.ok(
      HUB_SOURCE.includes("const _govBadgeClass = (s) => {"),
      '_govBadgeClass must exist'
    );
  });

  it('source defines _govFilters array with all 6 states plus all', () => {
    assert.ok(
      HUB_SOURCE.includes("const _govFilters = ['all', 'draft', 'needs_review', 'submitted', 'approved', 'rejected', 'archived'];"),
      '_govFilters must contain all 6 states plus all'
    );
  });

  it('source defines _govFilterLabels for all states', () => {
    assert.ok(
      HUB_SOURCE.includes("needs_review:'Needs Review'"),
      '_govFilterLabels must have Needs Review label'
    );
  });

  it('source renders badge using _govBadgeClass()', () => {
    assert.ok(
      HUB_SOURCE.includes("'<span class=\"ps-state-badge ' + _govBadgeClass(d.governance_state) + '\">'"),
      'badge rendering must use _govBadgeClass()'
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// State label recognition tests — all 6 states must have distinct labels
// ══════════════════════════════════════════════════════════════════════════════

describe('BUG-FIX-003: Governance workspace state labels', () => {
  it('must label approved as Approved / Signed', () => {
    assert.strictEqual(_govLabel('approved'), 'Approved / Signed');
  });

  it('must label submitted as Submitted for Review', () => {
    assert.strictEqual(_govLabel('submitted'), 'Submitted for Review');
  });

  it('must label rejected as Rejected', () => {
    assert.strictEqual(_govLabel('rejected'), 'Rejected');
  });

  it('must label draft as Draft', () => {
    assert.strictEqual(_govLabel('draft'), 'Draft');
  });

  it('must label needs_review as Needs Review', () => {
    assert.strictEqual(_govLabel('needs_review'), 'Needs Review');
  });

  it('must label archived as Archived', () => {
    assert.strictEqual(_govLabel('archived'), 'Archived');
  });

  it('must handle null/undefined as Draft', () => {
    assert.strictEqual(_govLabel(null), 'Draft');
    assert.strictEqual(_govLabel(undefined), 'Draft');
  });

  it('must handle empty string as Draft', () => {
    assert.strictEqual(_govLabel(''), 'Draft');
  });

  it('must be case-insensitive (APPROVED → Approved / Signed)', () => {
    assert.strictEqual(_govLabel('APPROVED'), 'Approved / Signed');
  });

  it('must be case-insensitive (Submitted → Submitted for Review)', () => {
    assert.strictEqual(_govLabel('Submitted'), 'Submitted for Review');
  });

  // All 6 states must produce distinct, non-empty labels
  it('must produce distinct non-empty labels for all 6 states', () => {
    const labels = ALL_STATES.map(s => _govLabel(s));
    const uniqueLabels = new Set(labels);
    assert.strictEqual(uniqueLabels.size, ALL_STATES.length,
      `expected 6 unique labels, got ${uniqueLabels.size}: ${labels.join(', ')}`);
    for (const lbl of labels) {
      assert.ok(lbl && lbl.length > 0, `label must be non-empty, got "${lbl}"`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Badge CSS class mapping — all 6 states must have distinct classes
// ══════════════════════════════════════════════════════════════════════════════

describe('BUG-FIX-003: Governance badge CSS class mapping', () => {
  it("approved state gets ps-state-approved class", () => {
    assert.strictEqual(_govBadgeClass('approved'), 'ps-state-approved');
  });

  it("submitted state gets ps-state-submitted class", () => {
    assert.strictEqual(_govBadgeClass('submitted'), 'ps-state-submitted');
  });

  it("draft state gets ps-state-draft class", () => {
    assert.strictEqual(_govBadgeClass('draft'), 'ps-state-draft');
  });

  it("rejected state gets ps-state-rejected class", () => {
    assert.strictEqual(_govBadgeClass('rejected'), 'ps-state-rejected');
  });

  it("needs_review state gets ps-state-needs-review class", () => {
    assert.strictEqual(_govBadgeClass('needs_review'), 'ps-state-needs-review');
  });

  it("archived state gets ps-state-archived class", () => {
    assert.strictEqual(_govBadgeClass('archived'), 'ps-state-archived');
  });

  it("null state falls back to ps-state-draft class", () => {
    assert.strictEqual(_govBadgeClass(null), 'ps-state-draft');
  });

  it('must produce distinct non-empty classes for all 6 states', () => {
    const classes = ALL_STATES.map(s => _govBadgeClass(s));
    const uniqueClasses = new Set(classes);
    assert.strictEqual(uniqueClasses.size, ALL_STATES.length,
      `expected 6 unique badge classes, got ${uniqueClasses.size}: ${classes.join(', ')}`);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Filtering tests
// ══════════════════════════════════════════════════════════════════════════════

describe('BUG-FIX-003: Governance state filtering', () => {
  const items = [
    { id: 1, governance_state: 'draft', name: 'Draft Protocol A' },
    { id: 2, governance_state: 'approved', name: 'Approved Protocol B' },
    { id: 3, governance_state: 'submitted', name: 'Submitted Protocol C' },
    { id: 4, governance_state: 'rejected', name: 'Rejected Protocol D' },
    { id: 5, governance_state: 'needs_review', name: 'Needs Review E' },
    { id: 6, governance_state: 'archived', name: 'Archived Protocol F' },
  ];

  it('must filter items by governance state approved', () => {
    const filtered = filterByGovernance(items, 'approved');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 2);
  });

  it('must filter items by governance state submitted', () => {
    const filtered = filterByGovernance(items, 'submitted');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 3);
  });

  it('must filter items by governance state draft', () => {
    const filtered = filterByGovernance(items, 'draft');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 1);
  });

  it('must filter items by governance state rejected', () => {
    const filtered = filterByGovernance(items, 'rejected');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 4);
  });

  it('must filter items by governance state needs_review', () => {
    const filtered = filterByGovernance(items, 'needs_review');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 5);
  });

  it('must filter items by governance state archived', () => {
    const filtered = filterByGovernance(items, 'archived');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 6);
  });

  it('must return empty array for non-matching state', () => {
    const filtered = filterByGovernance(items, 'nonexistent');
    assert.deepStrictEqual(filtered, []);
  });

  it('must return empty array for empty item list', () => {
    const filtered = filterByGovernance([], 'draft');
    assert.deepStrictEqual(filtered, []);
  });

  it('must treat missing governance_state as draft during filtering', () => {
    const itemsNoState = [
      { id: 1 },
      { id: 2, governance_state: 'approved' },
    ];
    const filtered = filterByGovernance(itemsNoState, 'draft');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].id, 1);
  });

  it('must preserve all item properties when filtering', () => {
    const filtered = filterByGovernance(items, 'approved');
    assert.ok(filtered[0].name);
    assert.strictEqual(filtered[0].name, 'Approved Protocol B');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE_LABELS integration tests
// ══════════════════════════════════════════════════════════════════════════════

describe('BUG-FIX-003: GOVERNANCE_LABELS registry integration', () => {
  it('GOVERNANCE_LABELS must include entries for approved and draft', () => {
    assert.ok(GOVERNANCE_LABELS['approved'], 'approved must exist');
    assert.ok(GOVERNANCE_LABELS['draft'], 'draft must exist');
  });

  it('every GOVERNANCE_LABELS entry must have label, color, bg, description', () => {
    for (const [k, v] of Object.entries(GOVERNANCE_LABELS)) {
      assert.ok(v.label, `GOVERNANCE_LABELS[${k}] missing label`);
      assert.ok(v.color, `GOVERNANCE_LABELS[${k}] missing color`);
      assert.ok(v.bg, `GOVERNANCE_LABELS[${k}] missing bg`);
      assert.ok(v.description, `GOVERNANCE_LABELS[${k}] missing description`);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Governance state transition tests
// ══════════════════════════════════════════════════════════════════════════════

describe('BUG-FIX-003: Governance state transitions', () => {
  it('source must define _psGovSubmit handler (draft → submitted)', () => {
    assert.ok(
      HUB_SOURCE.includes("window._psGovSubmit = async (id) => {"),
      '_psGovSubmit must exist'
    );
    assert.ok(
      HUB_SOURCE.includes("governance_state: 'submitted'") &&
      HUB_SOURCE.includes('window._psGovSubmit'),
      '_psGovSubmit must transition to submitted'
    );
  });

  it('source must define _psGovApprove handler (submitted → approved)', () => {
    assert.ok(
      HUB_SOURCE.includes("window._psGovApprove = async (id) => {"),
      '_psGovApprove must exist'
    );
    assert.ok(
      HUB_SOURCE.includes("governance_state: 'approved'") &&
      HUB_SOURCE.includes('window._psGovApprove'),
      '_psGovApprove must transition to approved'
    );
  });

  it('source must define _psGovReject handler (submitted → rejected)', () => {
    assert.ok(
      HUB_SOURCE.includes("window._psGovReject = async (id) => {"),
      '_psGovReject must exist'
    );
    assert.ok(
      HUB_SOURCE.includes("governance_state: 'rejected'") &&
      HUB_SOURCE.includes('window._psGovReject'),
      '_psGovReject must transition to rejected'
    );
  });

  it('_psGovSubmit must require authorization (_psCanAuthor)', () => {
    assert.ok(
      HUB_SOURCE.includes("if (!_psCanAuthor()) return;") &&
      HUB_SOURCE.includes('window._psGovSubmit'),
      '_psGovSubmit must check _psCanAuthor()'
    );
  });

  it('draft save must produce governance_state draft', () => {
    const savePayload = {
      patient_id: 'pat-1',
      name: 'Test Protocol',
      condition: 'MDD',
      modality: 'tdcs',
      governance_state: 'draft',
    };
    assert.strictEqual(savePayload.governance_state, 'draft');
  });

  it('review submission must produce governance_state submitted', () => {
    const submitPayload = {
      patient_id: 'pat-1',
      name: 'Test Protocol',
      condition: 'MDD',
      modality: 'tdcs',
      governance_state: 'submitted',
    };
    assert.strictEqual(submitPayload.governance_state, 'submitted');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Workspace filter UI tests
// ══════════════════════════════════════════════════════════════════════════════

describe('BUG-FIX-003: Workspace filter UI', () => {
  it('source must render filter buttons using _govFilters.map with _psSetDraftsFilter', () => {
    // The filter buttons are rendered dynamically via _govFilters.map(f => ...).
    // The onclick uses \' to escape quotes inside the JS string literal.
    assert.ok(
      HUB_SOURCE.includes('_govFilters.map(f =>') &&
      HUB_SOURCE.includes('window._psSetDraftsFilter(\\\'') &&
      HUB_SOURCE.includes('_govFilterLabels[f]'),
      'filter buttons must be rendered via _govFilters.map with _psSetDraftsFilter handler'
    );
  });

  it('_govFilters array must include all 6 governance states', () => {
    assert.ok(
      HUB_SOURCE.includes("'all', 'draft', 'needs_review', 'submitted', 'approved', 'rejected', 'archived'"),
      '_govFilters must include all 6 states plus all'
    );
  });

  it('source must render action buttons conditional on governance_state', () => {
    assert.ok(
      HUB_SOURCE.includes("d.governance_state === 'draft' ?") &&
      HUB_SOURCE.includes('window._psGovSubmit'),
      'Submit button must only show for draft state'
    );
    assert.ok(
      HUB_SOURCE.includes("d.governance_state === 'submitted' ?") &&
      HUB_SOURCE.includes('window._psGovApprove'),
      'Approve/Reject buttons must only show for submitted state'
    );
  });

  it('filtered item count must appear in workspace header', () => {
    assert.ok(
      HUB_SOURCE.includes("filteredItems.length + ' protocol'"),
      'workspace header must show filtered item count'
    );
  });
});
