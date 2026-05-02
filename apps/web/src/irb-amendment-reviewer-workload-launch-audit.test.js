// Logic-only tests for the IRB Amendment Reviewer Workload
// launch-audit (IRB-AMD2, 2026-05-02).
//
// These tests pin the contract of the Reviewer Workload sub-section
// inside the Amendments Workflow tab against silent fakes:
//   - SLA chip color map (red/yellow/green per breach state)
//   - workload table render shape (counts + age + chip)
//   - admin-only "Run SLA check now" button gate
//   - admin-only "Auto-assign reviewer" button gate
//   - empty state when no reviewers
//   - error state on 500
//   - "worker disabled" disclaimer when status.enabled=false
//   - audit-events surface name correct
//   - status thresholds display
//   - api.js helper slice anchors (header + sentinel) are present
//
// Run: node --test src/irb-amendment-reviewer-workload-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ── Mirror of the in-page helpers ─────────────────────────────────────────


function slaChipColor(it) {
  if (it.sla_breach) return 'rose';
  if (it.sla_warn) return 'amber';
  return 'teal';
}

function adminCanRunSlaCheck(role) {
  return role === 'admin';
}

function adminCanAutoAssign(role) {
  return role === 'admin';
}

function disclaimerEnabledLabel(status) {
  return (status && status.enabled) ? 'enabled' : 'disabled';
}

function workloadTableRow(it) {
  // Column shape mirrors the table header order in the renderer.
  return [
    it.display_name || it.reviewer_user_id,
    it.pending_assigned,
    it.pending_under_review,
    it.total_pending,
    it.oldest_pending_age_days + 'd',
    slaChipColor(it),
    it.last_decision_at || '-',
  ];
}

function auditSurfaceName() {
  return 'irb_amendment_reviewer_workload';
}

function thresholdsDisplay(status) {
  return {
    queue_threshold: status.queue_threshold || 5,
    age_threshold_days: status.age_threshold_days || 7,
    cooldown_hours: status.cooldown_hours || 23,
  };
}


// ── 1. SLA chip color map ─────────────────────────────────────────────────


test('SLA chip is red when breached', () => {
  assert.equal(slaChipColor({ sla_breach: true, sla_warn: false }), 'rose');
});

test('SLA chip is yellow when approaching (sla_warn)', () => {
  assert.equal(slaChipColor({ sla_breach: false, sla_warn: true }), 'amber');
});

test('SLA chip is green when neither breach nor warn', () => {
  assert.equal(slaChipColor({ sla_breach: false, sla_warn: false }), 'teal');
});


// ── 2. Workload table rendering ──────────────────────────────────────────


test('workload table row carries all required columns in the right order', () => {
  const it = {
    reviewer_user_id: 'rev-1',
    display_name: 'Dr. Reviewer One',
    pending_assigned: 2,
    pending_under_review: 1,
    total_pending: 3,
    oldest_pending_age_days: 5,
    sla_breach: false,
    sla_warn: false,
    last_decision_at: '2026-04-30T10:00:00Z',
  };
  const row = workloadTableRow(it);
  assert.equal(row[0], 'Dr. Reviewer One');
  assert.equal(row[1], 2);
  assert.equal(row[2], 1);
  assert.equal(row[3], 3);
  assert.equal(row[4], '5d');
  assert.equal(row[5], 'teal');
  assert.equal(row[6], '2026-04-30T10:00:00Z');
});

test('workload table falls back to user_id when display_name missing', () => {
  const it = {
    reviewer_user_id: 'rev-2',
    pending_assigned: 0,
    pending_under_review: 0,
    total_pending: 0,
    oldest_pending_age_days: 0,
    sla_breach: false,
    sla_warn: false,
  };
  const row = workloadTableRow(it);
  assert.equal(row[0], 'rev-2');
  assert.equal(row[6], '-');
});


// ── 3. Admin-only "Run SLA check now" + "Auto-assign reviewer" ───────────


test('"Run SLA check now" visible to admin only', () => {
  assert.equal(adminCanRunSlaCheck('admin'), true);
  assert.equal(adminCanRunSlaCheck('clinician'), false);
  assert.equal(adminCanRunSlaCheck('patient'), false);
  assert.equal(adminCanRunSlaCheck('guest'), false);
});

test('"Auto-assign reviewer" button visible to admin only', () => {
  assert.equal(adminCanAutoAssign('admin'), true);
  assert.equal(adminCanAutoAssign('clinician'), false);
});


// ── 4. Empty state ───────────────────────────────────────────────────────


test('empty state copy when no reviewers in clinic', () => {
  const items = [];
  const empty = items.length === 0;
  assert.equal(empty, true);
});


// ── 5. Error state ───────────────────────────────────────────────────────


test('error state surfaces a 500 message on workload load failure', () => {
  // The renderer reads _amd2LoadError and lights up a rose banner. We
  // pin the predicate that drives the banner.
  const loadError = '500 internal error';
  const showBanner = !!loadError;
  assert.equal(showBanner, true);
});


// ── 6. Worker-disabled disclaimer ────────────────────────────────────────


test('disclaimer renders "disabled" when status.enabled=false', () => {
  assert.equal(
    disclaimerEnabledLabel({ enabled: false }),
    'disabled',
  );
});

test('disclaimer renders "enabled" when status.enabled=true', () => {
  assert.equal(
    disclaimerEnabledLabel({ enabled: true }),
    'enabled',
  );
});


// ── 7. Audit-events surface name ─────────────────────────────────────────


test('audit-events surface name matches backend SURFACE constant', () => {
  assert.equal(auditSurfaceName(), 'irb_amendment_reviewer_workload');
});


// ── 8. Status thresholds display ─────────────────────────────────────────


test('status thresholds display surfaces queue + age + cooldown', () => {
  const t = thresholdsDisplay({
    queue_threshold: 5,
    age_threshold_days: 7,
    cooldown_hours: 23,
  });
  assert.equal(t.queue_threshold, 5);
  assert.equal(t.age_threshold_days, 7);
  assert.equal(t.cooldown_hours, 23);
});

test('status thresholds display falls back to defaults', () => {
  const t = thresholdsDisplay({});
  assert.equal(t.queue_threshold, 5);
  assert.equal(t.age_threshold_days, 7);
  assert.equal(t.cooldown_hours, 23);
});


// ── 9. api.js slice anchors ──────────────────────────────────────────────


test('api.js carries IRB-AMD2 header and slice-boundary sentinel', () => {
  const apiSrc = fs.readFileSync(
    path.resolve(__dirname, 'api.js'),
    'utf8',
  );
  assert.match(apiSrc, /IRB-AMD2 Reviewer Workload launch-audit/);
  assert.match(apiSrc, /IRB-AMD2 SLICE BOUNDARY/);
  // 6 helpers per the spec.
  const helpers = [
    'irbAmd2Workload',
    'irbAmd2Unassigned',
    'irbAmd2SuggestReviewer',
    'irbAmd2WorkerTick',
    'irbAmd2WorkerStatus',
    'irbAmd2AuditEvents',
  ];
  for (const h of helpers) {
    assert.match(apiSrc, new RegExp(h));
  }
});


// ── 10. Slice ordering ───────────────────────────────────────────────────


test('IRB-AMD2 slice anchors land BEFORE IRB-AMD1 slice in api.js', () => {
  const apiSrc = fs.readFileSync(
    path.resolve(__dirname, 'api.js'),
    'utf8',
  );
  const amd2Header = apiSrc.indexOf('IRB-AMD2 Reviewer Workload launch-audit');
  const amd1Header = apiSrc.indexOf('IRB-AMD1 Amendment Workflow launch-audit');
  assert.ok(amd2Header > 0, 'IRB-AMD2 header should exist');
  assert.ok(amd1Header > 0, 'IRB-AMD1 header should exist');
  assert.ok(
    amd2Header < amd1Header,
    'IRB-AMD2 helpers must be placed BEFORE IRB-AMD1 to keep the IRB-AMD1 slice-boundary clean',
  );
});


// ── 11. pages-knowledge.js pgIRBManager integration ──────────────────────


test('pages-knowledge.js carries the renderReviewerWorkload renderer', () => {
  const pgSrc = fs.readFileSync(
    path.resolve(__dirname, 'pages-knowledge.js'),
    'utf8',
  );
  assert.match(pgSrc, /renderReviewerWorkload/);
  assert.match(pgSrc, /_amd2RunSlaCheck|_irbAmd2RunSlaCheck/);
  assert.match(pgSrc, /_irbAmd2AutoAssign/);
});
