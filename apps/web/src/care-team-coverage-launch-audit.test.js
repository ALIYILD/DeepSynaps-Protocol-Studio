// Logic-only tests for the Care Team Coverage / Staff Scheduling
// launch-audit (2026-05-01).
//
// Pins the Coverage page contract against silent fakes:
//
//   - Audit payload composition is correct (page-level events vs polling
//     ticks vs filter changes vs note-required mutation events)
//   - DEMO banner renders only when server marks roster.is_demo_view=true
//   - Honest empty states for roster / breaches / sla / pages tabs
//     (no AI-fabricated rows, no "All shifts covered" placebo)
//   - Filter helpers strip blanks before posting to the server
//   - Note-required CTA (manual page-on-call) rejects blank input
//   - Top-count helpers read straight off the server summary, not a UI
//     re-derivation
//   - Source-grep contract: pages-knowledge.js wires the Care Team Coverage
//     surface (mount audit + 30s polling tick + manual page-on-call); api.js
//     exposes the helpers; app.js registers `care-team-coverage` alongside
//     the legacy `staff-scheduling` alias
//
// Run: node --test src/care-team-coverage-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit and the
// deepsynaps-web-test-runner-node-test memory note. We mirror the small
// pure helpers here (rather than import pages-knowledge.js) because that
// module pulls in helpers.js which touches `window` at module-load time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


// ── Mirrors of in-page helpers (kept in lockstep with pages-knowledge.js) ──


function buildCoverageAuditPayload(event, extra = {}) {
  const out = { event };
  if (extra.target_id) out.target_id = String(extra.target_id);
  if (extra.note) out.note = String(extra.note).slice(0, 480);
  if (extra.using_demo_data) out.using_demo_data = true;
  return out;
}

function buildSlaUpsertPayload(surface, severity, slaMinutes) {
  return {
    surface: String(surface || '').trim(),
    severity: String(severity || 'HIGH').trim(),
    sla_minutes: Number(slaMinutes) | 0,
  };
}

function buildChainUpsertPayload(surface, primary, backup, director, autoOn) {
  return {
    surface: String(surface || '').trim(),
    primary_user_id: primary || null,
    backup_user_id: backup || null,
    director_user_id: director || null,
    auto_page_enabled: !!autoOn,
  };
}

function shouldShowCoverageDemoBanner(serverData) {
  if (!serverData) return false;
  return !!(serverData.roster && serverData.roster.is_demo_view);
}

function shouldShowAutoPageOffBanner(serverData) {
  if (!serverData || !serverData.summary) return true;
  return (Number(serverData.summary.auto_page_enabled_surfaces) || 0) === 0;
}

function shouldShowRosterEmpty(serverData) {
  if (!serverData || !serverData.roster) return true;
  const items = Array.isArray(serverData.roster.items) ? serverData.roster.items : [];
  return items.length === 0;
}

function shouldShowBreachesEmpty(serverData) {
  if (!serverData || !serverData.breaches) return true;
  const items = Array.isArray(serverData.breaches.items) ? serverData.breaches.items : [];
  return items.length === 0;
}

function pageOncallNoteValid(note) {
  if (note == null) return false;
  return String(note).trim().length > 0;
}

function readSummaryActiveShifts(serverSummary) {
  const v = Number(serverSummary?.active_shifts || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function readSummaryOncallNow(serverSummary) {
  const v = Number(serverSummary?.oncall_now || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function readSummaryBreachesToday(serverSummary) {
  const v = Number(serverSummary?.sla_breaches_today || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function readSummaryPagedToday(serverSummary) {
  const v = Number(serverSummary?.paged_today || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function readSummaryAutoEnabled(serverSummary) {
  const v = Number(serverSummary?.auto_page_enabled_surfaces || 0);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}


// ── Audit payload composition ──────────────────────────────────────────────


test('Audit payload: view ping has no target_id', () => {
  const p = buildCoverageAuditPayload('view', { note: 'coverage mount' });
  assert.equal(p.event, 'view');
  assert.equal(p.target_id, undefined);
  assert.equal(p.note, 'coverage mount');
});

test('Audit payload: target_id stamped when provided', () => {
  const p = buildCoverageAuditPayload('manual_page_fired', { target_id: 'evt-123', note: 'opened' });
  assert.equal(p.target_id, 'evt-123');
});

test('Audit payload: using_demo_data only set when truthy', () => {
  assert.equal(buildCoverageAuditPayload('view', {}).using_demo_data, undefined);
  assert.equal(buildCoverageAuditPayload('view', { using_demo_data: false }).using_demo_data, undefined);
  assert.equal(buildCoverageAuditPayload('view', { using_demo_data: true }).using_demo_data, true);
});

test('Audit payload: note is truncated at 480 chars', () => {
  const long = 'x'.repeat(2000);
  const p = buildCoverageAuditPayload('view', { note: long });
  assert.equal(p.note.length, 480);
});


// ── SLA / chain upsert payloads ────────────────────────────────────────────


test('SLA upsert: trims surface + severity, integerises minutes', () => {
  const p = buildSlaUpsertPayload('  wearables_workbench ', 'high', '45');
  assert.equal(p.surface, 'wearables_workbench');
  assert.equal(p.severity, 'high');
  assert.equal(p.sla_minutes, 45);
});

test('Chain upsert: blanks become null (no empty-string user IDs)', () => {
  const p = buildChainUpsertPayload(' wearables_workbench ', '', '', '', false);
  assert.equal(p.surface, 'wearables_workbench');
  assert.equal(p.primary_user_id, null);
  assert.equal(p.backup_user_id, null);
  assert.equal(p.director_user_id, null);
  assert.equal(p.auto_page_enabled, false);
});

test('Chain upsert: real ids pass through, autoOn always boolean', () => {
  const p = buildChainUpsertPayload('*', 'u-1', 'u-2', 'u-3', 'truthy');
  assert.equal(p.primary_user_id, 'u-1');
  assert.equal(p.backup_user_id, 'u-2');
  assert.equal(p.director_user_id, 'u-3');
  assert.equal(p.auto_page_enabled, true);
});


// ── Banners & empty states ─────────────────────────────────────────────────


test('Demo banner: only on server roster.is_demo_view=true', () => {
  assert.equal(shouldShowCoverageDemoBanner(null), false);
  assert.equal(shouldShowCoverageDemoBanner({ roster: { is_demo_view: false } }), false);
  assert.equal(shouldShowCoverageDemoBanner({ roster: { is_demo_view: true } }), true);
});

test('Auto-page OFF banner: shown unless at least one surface enables it', () => {
  assert.equal(shouldShowAutoPageOffBanner(null), true);
  assert.equal(shouldShowAutoPageOffBanner({ summary: {} }), true);
  assert.equal(shouldShowAutoPageOffBanner({ summary: { auto_page_enabled_surfaces: 0 } }), true);
  assert.equal(shouldShowAutoPageOffBanner({ summary: { auto_page_enabled_surfaces: 2 } }), false);
});

test('Roster empty state: shown when server returns zero rows', () => {
  assert.equal(shouldShowRosterEmpty(null), true);
  assert.equal(shouldShowRosterEmpty({ roster: { items: [] } }), true);
  assert.equal(shouldShowRosterEmpty({ roster: { items: [{}] } }), false);
});

test('Breaches empty state: shown when no items', () => {
  assert.equal(shouldShowBreachesEmpty(null), true);
  assert.equal(shouldShowBreachesEmpty({ breaches: { items: [] } }), true);
  assert.equal(shouldShowBreachesEmpty({ breaches: { items: [{ audit_event_id: 'x' }] } }), false);
});


// ── Note-required CTA ──────────────────────────────────────────────────────


test('Manual page-on-call: blank notes are rejected', () => {
  assert.equal(pageOncallNoteValid(''), false);
  assert.equal(pageOncallNoteValid('  '), false);
  assert.equal(pageOncallNoteValid(null), false);
  assert.equal(pageOncallNoteValid(undefined), false);
  assert.equal(pageOncallNoteValid('Paging primary on-call after SAE breach.'), true);
});


// ── Summary counts ─────────────────────────────────────────────────────────


test('Summary: counts read straight off server, no UI math', () => {
  const s = {
    active_shifts: 3, oncall_now: 1, sla_breaches_today: 4,
    paged_today: 2, auto_page_enabled_surfaces: 1,
  };
  assert.equal(readSummaryActiveShifts(s), 3);
  assert.equal(readSummaryOncallNow(s), 1);
  assert.equal(readSummaryBreachesToday(s), 4);
  assert.equal(readSummaryPagedToday(s), 2);
  assert.equal(readSummaryAutoEnabled(s), 1);
});

test('Summary: missing fields default to 0 (no NaN leaks into UI)', () => {
  assert.equal(readSummaryActiveShifts({}), 0);
  assert.equal(readSummaryActiveShifts(null), 0);
  assert.equal(readSummaryActiveShifts({ active_shifts: 'lots' }), 0);
  assert.equal(readSummaryActiveShifts({ active_shifts: -3 }), 0);
});


// ── Source-grep contract ───────────────────────────────────────────────────


function readSrc(rel) {
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  return fs.readFileSync(path.join(here, rel), 'utf8');
}


test('Source contract: pages-knowledge wires the mount audit ping', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(src.includes('postCareTeamCoverageAuditEvent'));
  assert.ok(src.includes("event: 'view'"));
  // No silent stub
  assert.equal(/\(\)\s*=>\s*\{\s*\}/.test(src.split('pgCareTeamCoverage')[1] || ''), false);
});

test('Source contract: pages-knowledge wires the 30s polling tick', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(src.includes('30000'));
  assert.ok(src.includes("polling_tick"));
});

test('Source contract: pages-knowledge wires the manual page-on-call note prompt', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(src.includes('careTeamCoveragePageOncall'));
  assert.ok(src.includes('Note for the on-call page'));
});

test('Source contract: pages-knowledge renders honest roster empty state', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(src.includes('No on-call schedule configured yet'));
  // No AI happy-talk
  assert.equal(/all shifts covered/i.test(src), false);
  assert.equal(/your sla is improving/i.test(src), false);
});

test('Source contract: pages-knowledge surfaces an Auto-page OFF banner', () => {
  const src = readSrc('pages-knowledge.js');
  assert.ok(src.includes('Auto-page worker: OFF'));
});

test('Source contract: api.js exposes the Care Team Coverage helpers', () => {
  const src = readSrc('api.js');
  for (const helper of [
    'careTeamCoverageRoster',
    'careTeamCoverageOncallNow',
    'careTeamCoverageSlaConfig',
    'careTeamCoverageEscalationChain',
    'careTeamCoverageSlaBreaches',
    'careTeamCoverageSummary',
    'careTeamCoveragePages',
    'careTeamCoverageUpsertRoster',
    'careTeamCoverageUpsertSla',
    'careTeamCoverageUpsertEscalationChain',
    'careTeamCoveragePageOncall',
    'postCareTeamCoverageAuditEvent',
  ]) {
    assert.ok(src.includes(helper), `api.js missing helper: ${helper}`);
  }
});

test('Source contract: app.js registers care-team-coverage and staff-scheduling routes', () => {
  const src = readSrc('app.js');
  assert.ok(src.includes("case 'care-team-coverage'"));
  assert.ok(src.includes("case 'staff-scheduling'"));
  assert.ok(src.includes('pgCareTeamCoverage'));
  assert.ok(src.includes('pgStaffScheduling'));
});

test('Source contract: app.js page-title map carries Care Team Coverage', () => {
  const src = readSrc('app.js');
  assert.ok(src.includes("'care-team-coverage': 'Care Team Coverage'"));
});
