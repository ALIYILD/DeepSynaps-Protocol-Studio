/**
 * Nutrition Analyzer view-model — maps API payloads for UI consumption.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapNutritionApiPayloadToViewModel,
  normalizeNutritionProfile,
  normalizeNutritionAudit,
  summarizeNutritionForClinic,
  extractNutritionRelevantLabRows,
} from './nutrition-analyzer-view-model.js';

test('mapNutritionApiPayloadToViewModel exposes macros without prescribing targets', () => {
  const vm = mapNutritionApiPayloadToViewModel({
    patient_id: 'p1',
    computation_id: 'c1',
    data_as_of: '2026-05-01T12:00:00Z',
    diet: {
      avg_calories_kcal: 1800,
      avg_protein_g: 70,
      logging_coverage_pct: 40,
      confidence: 0.5,
      provenance: 'clinic_diet_log',
      notes: 'Merged',
    },
    snapshot: [],
    supplements: [],
    biomarker_links: [],
    recommendations: [],
    evidence_pack: { items: [] },
    ai_interpretation: [],
    audit_events: {},
  });
  assert.ok(vm);
  assert.equal(vm.macros.calories.target, null);
  assert.equal(vm.macros.calories.intake, 1800);
});

test('normalizeNutritionAudit maps event_type to kind', () => {
  const out = normalizeNutritionAudit({
    items: [
      {
        id: 'a1',
        patient_id: 'p1',
        event_type: 'review_note',
        message: 'hello',
        actor_id: 'u1',
        created_at: '2026-05-01T00:00:00Z',
      },
    ],
    total: 1,
  });
  assert.equal(out.items[0].kind, 'annotation');
});

test('summarizeNutritionForClinic does not imply green safety when no flags', () => {
  const row = summarizeNutritionForClinic({
    patient_id: 'p1',
    patient_name: 'Test',
    macros: {},
    micronutrients: [],
    supplements: [],
    interactions: [],
    daily_log: [],
    captured_at: '2026-05-01',
    _diet_summary: { logging_coverage_pct: 0 },
  });
  assert.equal(row.worst_severity, 'none');
});

test('extractNutritionRelevantLabRows picks glucose and vitamin D', () => {
  const out = extractNutritionRelevantLabRows({
    captured_at: '2026-01-01',
    panels: [
      {
        name: 'Metabolic',
        results: [
          { analyte: 'Glucose', value: 99, unit: 'mg/dL', ref_low: 70, ref_high: 99, status: 'normal', captured_at: '2026-01-01' },
          { analyte: 'Obscure Marker X', value: 1, unit: 'U', status: 'normal', captured_at: '2026-01-01' },
        ],
      },
      {
        name: 'Vitamins',
        results: [
          { analyte: 'Vitamin D', value: 22, unit: 'ng/mL', ref_low: 30, ref_high: 100, status: 'low', captured_at: '2026-01-02' },
        ],
      },
    ],
  });
  const names = out.rows.map((r) => r.analyte);
  assert.ok(names.includes('Glucose'));
  assert.ok(names.includes('Vitamin D'));
  assert.ok(!names.includes('Obscure Marker X'));
});

test('normalizeNutritionProfile maps API payload shape', () => {
  const n = normalizeNutritionProfile({
    patient_id: 'p1',
    computation_id: 'x',
    data_as_of: '2026-05-01T00:00:00Z',
    diet: { avg_calories_kcal: 100 },
    snapshot: [],
    supplements: [],
    biomarker_links: [],
    recommendations: [],
    evidence_pack: { items: [] },
    ai_interpretation: [],
    audit_events: {},
  }, { patientDisplayName: 'Jane Doe' });
  assert.equal(n._data_source, 'api');
  assert.equal(n.patient_name, 'Jane Doe');
});
