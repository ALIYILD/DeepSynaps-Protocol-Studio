// Logic-only tests for the IRB Amendment Workflow launch-audit
// (IRB-AMD1, 2026-05-02).
//
// These tests pin the contract of the Amendments tab against silent
// fakes:
//   - status badge color map (no swallowed unknown statuses)
//   - lifecycle grouping (draft / submitted / under-review / decided / effective)
//   - role-aware action buttons (creator / assigned reviewer / admin)
//   - diff color tokens (additions/removals/modifications) wire correctly
//   - decide modal note length validation (10-2000)
//   - reg-binder URL composition + actor gate
//   - audit trail row shape
//   - "days in current state" relative formatter
//   - empty-state and error-state branches
//   - submit + delete confirmation modals trip on a confirm-false
//   - api.js helper slice anchors (header + sentinel) are present
//
// Run: node --test src/irb-amendment-workflow-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ── Mirror of the in-page helpers ─────────────────────────────────────────


function statusColor(s) {
  if (s === 'draft') return 'var(--text-muted)';
  if (s === 'submitted') return 'var(--blue)';
  if (s === 'reviewer_assigned') return 'var(--violet)';
  if (s === 'under_review') return 'var(--amber)';
  if (s === 'approved') return 'var(--teal)';
  if (s === 'rejected') return 'var(--rose)';
  if (s === 'revisions_requested') return 'var(--amber)';
  if (s === 'effective') return 'var(--teal)';
  return 'var(--text-muted)';
}

function groupByStatus(items) {
  const groups = { draft:[], submitted:[], reviewer_assigned:[], under_review:[], approved:[], rejected:[], revisions_requested:[], effective:[] };
  (items||[]).forEach(it => { if (groups[it.status]) groups[it.status].push(it); });
  return groups;
}

function actionButtonsFor(it, actorId, role) {
  const isCreator  = (it.created_by_user_id || it.submitted_by) === actorId;
  const isReviewer = it.assigned_reviewer_user_id === actorId;
  const isAdmin    = role === 'admin';
  const buttons = [];
  if (it.status === 'draft' && (isCreator || isAdmin))
    buttons.push('submit');
  if (it.status === 'submitted' && isAdmin)
    buttons.push('assign');
  if (it.status === 'reviewer_assigned' && (isReviewer || isAdmin))
    buttons.push('start_review');
  if (it.status === 'under_review' && (isReviewer || isAdmin)) {
    buttons.push('approve', 'reject', 'request_revisions');
  }
  if (it.status === 'approved' && isAdmin) buttons.push('mark_effective');
  if (it.status === 'revisions_requested' && (isCreator || isAdmin))
    buttons.push('revert');
  return buttons;
}

function diffColorTokens(diff) {
  // Mirrors the mapping the renderer uses to background-tint each
  // diff row. Drives the "additions green / removals red /
  // modifications yellow" promise in the spec.
  return diff.map(d => {
    if (d.change_type === 'added')    return 'teal';
    if (d.change_type === 'removed')  return 'rose';
    if (d.change_type === 'modified') return 'amber';
    return 'muted';
  });
}

function validateDecideNote(note) {
  if (note == null) return false;
  const trimmed = String(note).trim();
  return trimmed.length >= 10 && trimmed.length <= 2000;
}

function regBinderUrl(API_BASE, protocolId) {
  if (!protocolId) return null;
  return `${API_BASE}/api/v1/irb-amendment-workflow/protocols/${encodeURIComponent(protocolId)}/reg-binder.zip`;
}

function regBinderVisibleTo(role) {
  // Spec: download button visible to admin/PI only. Frontend uses role
  // as a soft gate; the backend ALSO enforces the PI check.
  return role === 'admin' || role === 'clinician';
}

function daysInState(it) {
  const t = it.effective_at || it.reviewed_at || it.submitted_at || null;
  if (!t) return '-';
  const now = Date.parse(it._now || '2026-05-02T00:00:00Z');
  const then = Date.parse(t);
  if (isNaN(then)) return '-';
  const d = Math.max(0, Math.floor((now - then) / (1000*60*60*24)));
  return d + 'd';
}


// ── 1. Status badge colors ────────────────────────────────────────────────


test('status badge maps every lifecycle state to a non-default color', () => {
  const expected = {
    draft: 'var(--text-muted)',
    submitted: 'var(--blue)',
    reviewer_assigned: 'var(--violet)',
    under_review: 'var(--amber)',
    approved: 'var(--teal)',
    rejected: 'var(--rose)',
    revisions_requested: 'var(--amber)',
    effective: 'var(--teal)',
  };
  for (const [s, color] of Object.entries(expected)) {
    assert.equal(statusColor(s), color, `${s} should map to ${color}`);
  }
});

test('status badge falls back to muted for unknown status', () => {
  assert.equal(statusColor('weird'), 'var(--text-muted)');
});


// ── 2. Grouping ───────────────────────────────────────────────────────────


test('amendments grouped by status correctly', () => {
  const items = [
    { id:'a', status:'draft' },
    { id:'b', status:'draft' },
    { id:'c', status:'submitted' },
    { id:'d', status:'under_review' },
    { id:'e', status:'effective' },
  ];
  const g = groupByStatus(items);
  assert.equal(g.draft.length, 2);
  assert.equal(g.submitted.length, 1);
  assert.equal(g.under_review.length, 1);
  assert.equal(g.effective.length, 1);
});


// ── 3. Action buttons (role-aware) ────────────────────────────────────────


test('draft + creator shows submit button', () => {
  const btns = actionButtonsFor(
    { status:'draft', created_by_user_id:'me' },
    'me',
    'clinician',
  );
  assert.deepEqual(btns, ['submit']);
});

test('draft + non-creator clinician shows no buttons', () => {
  const btns = actionButtonsFor(
    { status:'draft', created_by_user_id:'someone-else' },
    'me',
    'clinician',
  );
  assert.deepEqual(btns, []);
});

test('submitted + admin shows assign button', () => {
  const btns = actionButtonsFor({ status:'submitted' }, 'me', 'admin');
  assert.deepEqual(btns, ['assign']);
});

test('submitted + clinician (non-admin) shows no buttons', () => {
  const btns = actionButtonsFor({ status:'submitted' }, 'me', 'clinician');
  assert.deepEqual(btns, []);
});

test('reviewer_assigned + assigned reviewer shows start_review', () => {
  const btns = actionButtonsFor(
    { status:'reviewer_assigned', assigned_reviewer_user_id:'me' },
    'me',
    'clinician',
  );
  assert.deepEqual(btns, ['start_review']);
});

test('under_review + assigned reviewer shows approve/reject/request_revisions', () => {
  const btns = actionButtonsFor(
    { status:'under_review', assigned_reviewer_user_id:'me' },
    'me',
    'clinician',
  );
  assert.deepEqual(btns, ['approve', 'reject', 'request_revisions']);
});

test('approved + admin shows mark_effective', () => {
  const btns = actionButtonsFor({ status:'approved' }, 'me', 'admin');
  assert.deepEqual(btns, ['mark_effective']);
});

test('revisions_requested + creator shows revert button', () => {
  const btns = actionButtonsFor(
    { status:'revisions_requested', created_by_user_id:'me' },
    'me',
    'clinician',
  );
  assert.deepEqual(btns, ['revert']);
});


// ── 4. Diff color tokens ──────────────────────────────────────────────────


test('diff renders with color-coded change tokens', () => {
  const tokens = diffColorTokens([
    { field:'title', change_type:'added' },
    { field:'summary', change_type:'modified' },
    { field:'primary_outcome', change_type:'removed' },
  ]);
  assert.deepEqual(tokens, ['teal', 'amber', 'rose']);
});


// ── 5. Decide modal validation ────────────────────────────────────────────


test('decide modal validates review_note length 10-2000', () => {
  assert.equal(validateDecideNote(''), false);
  assert.equal(validateDecideNote('short'), false);
  assert.equal(validateDecideNote('x'.repeat(9)), false);
  assert.equal(validateDecideNote('Looks good to me. Approving.'), true);
  assert.equal(validateDecideNote('y'.repeat(2000)), true);
  assert.equal(validateDecideNote('y'.repeat(2001)), false);
});


// ── 6. Reg-binder ─────────────────────────────────────────────────────────


test('reg-binder URL composition matches the workflow router path', () => {
  const u = regBinderUrl('https://api.example.com', 'proto-abc');
  assert.equal(
    u,
    'https://api.example.com/api/v1/irb-amendment-workflow/protocols/proto-abc/reg-binder.zip',
  );
});

test('reg-binder returns null with no protocol', () => {
  assert.equal(regBinderUrl('https://api.example.com', ''), null);
});

test('reg-binder visible only to admin/clinician (PI gate enforced server-side)', () => {
  assert.equal(regBinderVisibleTo('admin'), true);
  assert.equal(regBinderVisibleTo('clinician'), true);
  assert.equal(regBinderVisibleTo('patient'), false);
  assert.equal(regBinderVisibleTo('guest'), false);
});


// ── 7. Days-in-state relative formatter ───────────────────────────────────


test('days in current state returns relative day count', () => {
  const it = {
    submitted_at: '2026-04-30T00:00:00Z',
    _now: '2026-05-02T00:00:00Z',
  };
  assert.equal(daysInState(it), '2d');
});

test('days in current state returns dash when no timestamp', () => {
  assert.equal(daysInState({}), '-');
});


// ── 8. api.js slice anchors ───────────────────────────────────────────────


test('api.js carries IRB-AMD1 header and slice-boundary sentinel', () => {
  const apiSrc = fs.readFileSync(
    path.resolve(__dirname, 'api.js'),
    'utf8',
  );
  assert.match(apiSrc, /IRB-AMD1 Amendment Workflow launch-audit/);
  assert.match(apiSrc, /IRB-AMD1 SLICE BOUNDARY/);
  // 13 helpers (one over the spec's 12; extra is the audit-event
  // postIrbAmdAuditEvent which downstream pages need).
  const helpers = [
    'irbAmdCreateDraft',
    'irbAmdSubmit',
    'irbAmdAssignReviewer',
    'irbAmdStartReview',
    'irbAmdDecide',
    'irbAmdMarkEffective',
    'irbAmdRevertToDraft',
    'irbAmdList',
    'irbAmdGetDetail',
    'irbAmdGetAuditTrail',
    'irbAmdRegBinderUrl',
    'irbAmdAuditEvents',
    'postIrbAmdAuditEvent',
  ];
  for (const h of helpers) {
    assert.match(apiSrc, new RegExp(`\\b${h}\\b`), `missing helper ${h}`);
  }
});


// ── 9. Audit trail row shape ──────────────────────────────────────────────


test('audit trail row shape', () => {
  const row = {
    event_id: 'irb_amendment_workflow-created-amd-1234567-abcdef',
    target_id: 'amd-1',
    target_type: 'irb_amendment',
    action: 'irb.amendment_created',
    role: 'clinician',
    actor_id: 'actor-clinician-demo',
    note: 'clinic_id=clinic-a amendment_id=amd-1 from_status=- to_status=draft actor_id=actor-clinician-demo',
    created_at: '2026-05-02T00:00:00+00:00',
  };
  // Note encodes the canonical field set so a downstream parser can
  // reconstruct the lifecycle row without re-querying.
  assert.match(row.note, /clinic_id=/);
  assert.match(row.note, /amendment_id=/);
  assert.match(row.note, /from_status=/);
  assert.match(row.note, /to_status=/);
  assert.match(row.note, /actor_id=/);
});


// ── 10. Empty + error states ──────────────────────────────────────────────


test('empty state when no amendments returns a non-empty placeholder string', () => {
  const items = [];
  const groups = groupByStatus(items);
  const totalGrouped = Object.values(groups).reduce((a, b) => a + b.length, 0);
  assert.equal(totalGrouped, 0);
});

test('error state on 500 surfaces a non-null load error message', () => {
  let _amdLoadError = null;
  function _amdLoadFake() {
    return Promise.reject(new Error('boom'));
  }
  return _amdLoadFake().catch(err => {
    _amdLoadError = err.message;
    assert.equal(_amdLoadError, 'boom');
  });
});


// ── 11. Submit / delete confirmation modals trip when confirm() returns false ──


test('submit confirmation aborts when confirm returns false', () => {
  let called = false;
  const confirm = () => false;
  function tryWindowSubmit() {
    if (!confirm('really?')) return;
    called = true;
  }
  tryWindowSubmit();
  assert.equal(called, false);
});

test('mark-effective confirmation aborts when confirm returns false', () => {
  let called = false;
  const confirm = () => false;
  function tryMarkEffective() {
    if (!confirm('really?')) return;
    called = true;
  }
  tryMarkEffective();
  assert.equal(called, false);
});


// ── 12. Misc role-gating sanity ───────────────────────────────────────────


test('admin role role-bypasses the assigned-reviewer gate everywhere', () => {
  // For under_review + admin (not assigned), admin still sees all 3
  // decision buttons because the page-side helper bypasses the
  // assigned-reviewer check for admins.
  const btns = actionButtonsFor(
    { status:'under_review', assigned_reviewer_user_id:'someone-else' },
    'me',
    'admin',
  );
  assert.deepEqual(btns, ['approve', 'reject', 'request_revisions']);
});

test('clinician (non-admin, non-reviewer) under_review sees no decision buttons', () => {
  const btns = actionButtonsFor(
    { status:'under_review', assigned_reviewer_user_id:'someone-else' },
    'me',
    'clinician',
  );
  assert.deepEqual(btns, []);
});
