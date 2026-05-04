/**
 * Risk Analyzer workspace helpers — unit tests (no DOM).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRiskWorkspace,
  formatFactorLine,
  flattenAuditForUi,
} from './pages-risk-analyzer.js';

test('normalizeRiskWorkspace maps categories to safety_snapshot', () => {
  const w = normalizeRiskWorkspace({
    categories: [{ category: 'safety', level: 'green', computed_level: 'green', confidence: 'medium' }],
  });
  assert.ok(Array.isArray(w.safety_snapshot));
  assert.equal(w.safety_snapshot.length, 1);
});

test('formatFactorLine hides raw demo_fixture token', () => {
  assert.match(formatFactorLine('demo_fixture', { demoMode: true }), /sample/i);
  assert.ok(!/demo_fixture/i.test(formatFactorLine('demo_fixture', { demoMode: true })));
});

test('flattenAuditForUi maps analyzer audit_events', () => {
  const merged = flattenAuditForUi({
    audit_events: [
      {
        event_type: 'category_override',
        category: 'safety',
        previous_level: 'amber',
        new_level: 'red',
        occurred_at: '2026-01-01T12:00:00Z',
        source: 'risk_stratification_audit',
        payload_summary: 'override',
      },
    ],
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].trigger, 'category_override');
});

test('flattenAuditForUi maps legacy stratification items', () => {
  const merged = flattenAuditForUi({
    items: [
      {
        category: 'wellbeing',
        previous_level: 'green',
        new_level: 'amber',
        trigger: 'rule',
        created_at: '2026-01-02T12:00:00Z',
      },
    ],
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].category, 'wellbeing');
});

test('flattenAuditForUi merges audit_events and items, newest first', () => {
  const merged = flattenAuditForUi({
    audit_events: [
      {
        event_type: 'recompute',
        category: null,
        previous_level: null,
        new_level: '—',
        occurred_at: '2026-01-03T12:00:00Z',
        source: 'risk_analyzer',
        payload_summary: 'Full recompute',
      },
    ],
    items: [
      {
        category: 'safety',
        previous_level: 'amber',
        new_level: 'red',
        trigger: 'phq9',
        created_at: '2026-01-01T12:00:00Z',
      },
    ],
  });
  assert.equal(merged.length, 2);
  assert.equal(merged[0].trigger, 'recompute');
});
