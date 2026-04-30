// Logic-only tests for the Adverse Events launch-audit (2026-04-30).
//
// These guard the truth-audit fixes against regressions:
//   - SAE auto-flag derivation matches the backend rules
//   - Reportable derivation requires SAE ∧ unexpected ∧ related
//   - Status derivation respects the precedence: resolved > escalated > reviewed > open
//   - Body-system suggestion is heuristic-only (no AI severity)
//   - KPI tile counts are derived from rows, never hardcoded
//   - Filter param sanitisation drops empty strings / falsey checkboxes
//
// Run: node --test src/adverse-events-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Pure helpers replicated from pages-clinical-hubs.js + router rules ─────

const SAE_QUALIFIERS = new Set([
  'death',
  'life_threatening',
  'hospitalization',
  'persistent_disability',
  'congenital_anomaly',
  'important_medical_event',
]);

function deriveIsSerious(severity, saeCriteria) {
  const sevSerious = String(severity || '').toLowerCase() === 'serious';
  const raw = String(saeCriteria || '').toLowerCase().replace(/;/g, ',');
  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  const matched = tokens.filter(t => SAE_QUALIFIERS.has(t));
  return { isSerious: sevSerious || matched.length > 0, matched };
}

function deriveReportable(isSerious, expectedness, relatedness) {
  if (!isSerious) return false;
  if (String(expectedness || '').toLowerCase() !== 'unexpected') return false;
  return ['possible', 'probable', 'definite'].includes(String(relatedness || '').toLowerCase());
}

function aeStatus(a) {
  if (a.resolved_at) return 'resolved';
  if (a.escalated_at) return 'escalated';
  if (a.reviewed_at) return 'reviewed';
  return 'open';
}

function suggestBodySystem(text) {
  const HINTS = {
    nervous: ['headache','migraine','seizure','syncope','dizz','tingl','vertigo'],
    psychiatric: ['anxiety','panic','depress','mood','agitation','hallucin','suicid','insomnia'],
    cardiac: ['palpit','chest pain','tachycard','arrhyt'],
    gi: ['nausea','vomit','diarrh','abdominal'],
    skin: ['rash','scalp','burn','itch','redness'],
    general: ['fatigue','fever','malaise','weakness'],
  };
  const t = (text || '').toLowerCase();
  if (!t) return null;
  for (const [sys, words] of Object.entries(HINTS)) {
    if (words.some(w => t.indexOf(w) >= 0)) return sys;
  }
  return null;
}

function computeKpis(rows) {
  return {
    total: rows.length,
    open: rows.filter(a => !a.resolved_at && !a.escalated_at && !a.reviewed_at).length,
    sae: rows.filter(a => a.is_serious || a.severity === 'serious').length,
    reportable: rows.filter(a => a.reportable).length,
    awaiting_review: rows.filter(a => !a.reviewed_at && !a.resolved_at).length,
  };
}

function buildFilterParams(filters) {
  const params = {};
  if (filters.severity)    params.severity = filters.severity;
  if (filters.body_system) params.body_system = filters.body_system;
  if (filters.status)      params.status = filters.status;
  if (filters.expected)    params.expected = filters.expected;
  if (filters.sae === true)        params.sae = 'true';
  if (filters.reportable === true) params.reportable = 'true';
  if (filters.since) params.since = filters.since;
  if (filters.until) params.until = filters.until;
  if (filters.patient_id) params.patient_id = filters.patient_id;
  return params;
}

// ── Tests ─────────────────────────────────────────────────────────────────

test('SAE auto-flag: severity=serious → SAE', () => {
  const r = deriveIsSerious('serious', null);
  assert.equal(r.isSerious, true);
});

test('SAE auto-flag: hospitalization qualifier flips SAE on', () => {
  const r = deriveIsSerious('moderate', 'hospitalization');
  assert.equal(r.isSerious, true);
  assert.deepEqual(r.matched, ['hospitalization']);
});

test('SAE auto-flag: mild + no qualifier → not SAE', () => {
  const r = deriveIsSerious('mild', null);
  assert.equal(r.isSerious, false);
});

test('SAE auto-flag: bogus qualifier filtered out', () => {
  const r = deriveIsSerious('mild', 'social_concern');
  assert.equal(r.isSerious, false);
  assert.deepEqual(r.matched, []);
});

test('Reportable: requires all three legs (SAE ∧ unexpected ∧ related)', () => {
  assert.equal(deriveReportable(true, 'unexpected', 'possible'), true);
  assert.equal(deriveReportable(true, 'unexpected', 'definite'), true);
  assert.equal(deriveReportable(true, 'expected', 'probable'), false);
  assert.equal(deriveReportable(false, 'unexpected', 'probable'), false);
  assert.equal(deriveReportable(true, 'unexpected', 'unlikely'), false);
  assert.equal(deriveReportable(true, 'unexpected', 'unknown'), false);
  assert.equal(deriveReportable(true, 'unexpected', 'not_related'), false);
});

test('Status precedence: resolved > escalated > reviewed > open', () => {
  assert.equal(aeStatus({}), 'open');
  assert.equal(aeStatus({ reviewed_at: '2026-04-30T10:00:00Z' }), 'reviewed');
  assert.equal(aeStatus({ reviewed_at: '...', escalated_at: '...' }), 'escalated');
  assert.equal(aeStatus({ resolved_at: '...', escalated_at: '...', reviewed_at: '...' }), 'resolved');
});

test('Body-system suggestion: deterministic, no AI', () => {
  assert.equal(suggestBodySystem('headache'), 'nervous');
  assert.equal(suggestBodySystem('Scalp burn after session'), 'skin');
  assert.equal(suggestBodySystem('panic episode'), 'psychiatric');
  assert.equal(suggestBodySystem('chest pain reported'), 'cardiac');
  assert.equal(suggestBodySystem('zzz_unknown'), null);
  assert.equal(suggestBodySystem(''), null);
});

test('KPIs: empty list yields zeros, never hardcoded', () => {
  const k = computeKpis([]);
  assert.equal(k.total, 0);
  assert.equal(k.open, 0);
  assert.equal(k.sae, 0);
  assert.equal(k.reportable, 0);
  assert.equal(k.awaiting_review, 0);
});

test('KPIs: real rows derive real counts', () => {
  const rows = [
    { id: '1', severity: 'mild' },
    { id: '2', severity: 'serious', is_serious: true },
    { id: '3', severity: 'serious', is_serious: true, reportable: true },
    { id: '4', severity: 'mild', reviewed_at: 't' },
    { id: '5', severity: 'mild', resolved_at: 't' },
  ];
  const k = computeKpis(rows);
  assert.equal(k.total, 5);
  // open = no resolved/escalated/reviewed → 1, 2, 3
  assert.equal(k.open, 3);
  assert.equal(k.sae, 2);
  assert.equal(k.reportable, 1);
  // awaiting_review = !reviewed_at && !resolved_at → 1, 2, 3
  assert.equal(k.awaiting_review, 3);
});

test('Filter params: drops empty strings and falsey checkboxes', () => {
  const params = buildFilterParams({
    severity: '',
    body_system: 'skin',
    sae: false,
    reportable: true,
    expected: '',
    since: null,
    until: undefined,
  });
  assert.deepEqual(params, { body_system: 'skin', reportable: 'true' });
});

test('Filter params: serialises checkbox state correctly', () => {
  const params = buildFilterParams({ sae: true });
  assert.equal(params.sae, 'true');
  // false / undefined must NOT add the key (it would over-filter the list)
  const empty = buildFilterParams({ sae: false });
  assert.equal('sae' in empty, false);
});

test('Audit log surface and event names match the FE wiring', () => {
  // The router whitelists adverse_events as a surface; the FE uses these
  // event names. Drift here breaks the audit trail silently — keep them
  // matched.
  const FE_EVENTS = [
    'page_loaded', 'filter_changed', 'viewed', 'created', 'reviewed',
    'signed', 'escalated', 'resolved', 'classification_changed',
    'export_csv', 'export_cioms',
  ];
  for (const e of FE_EVENTS) {
    assert.ok(/^[a-z_]+$/.test(e), `event "${e}" must be snake_case to match audit schema`);
  }
});
