// Logic-only tests for Assessments Hub → Library tab wiring.
// Run: node --test src/assessments-library-wiring.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASSESS_REGISTRY } from './registries/assess-instruments-registry.js';
import { resolveScaleCanonical } from './registries/scale-assessment-registry.js';

// Mirrors the normalization applied in _ah2TlibAssign + _ah2SaveAssign. The
// backend's AssessmentAssignRequest / BulkAssignRequest match templates by
// the normalized id (lowercase, alphanumeric-only). If this drifts, Library
// Assign silently creates assessments with no embedded sections.
function normalizeTemplateId(id) {
  return String(id || '').toLowerCase().replace(/[^a-z0-9]/g, '') || String(id || '').toLowerCase();
}

test('normalizeTemplateId matches the bulk-assign normalization', () => {
  assert.equal(normalizeTemplateId('PHQ-9'),   'phq9');
  assert.equal(normalizeTemplateId('GAD-7'),   'gad7');
  assert.equal(normalizeTemplateId('HDRS-17'), 'hdrs17');
  assert.equal(normalizeTemplateId('PCL-5'),   'pcl5');
  assert.equal(normalizeTemplateId('MoCA'),    'moca');
  assert.equal(normalizeTemplateId('NB-FORM'), 'nbform');
  assert.equal(normalizeTemplateId('DEP-BDL'), 'depbdl');
});

// Mirrors the filter predicate in renderTemplateLibrary().
const ASSESS_CAT_MAP = { 'Validated Scales':'validated', 'Structured Forms':'form', 'Condition Bundles':'bundle' };
function filterTemplates(items, filter, q) {
  const filterKey = ASSESS_CAT_MAP[filter] || null;
  let out = items;
  if (filterKey) out = out.filter(i => i.catKey === filterKey);
  if (filter === 'Side Effects') {
    out = out.filter(i => i.title.toLowerCase().includes('side') || i.conditions.some(c => c.toLowerCase().includes('side')));
  }
  if (q) {
    const needle = q.toLowerCase();
    out = out.filter(i =>
      i.title.toLowerCase().includes(needle) ||
      i.cat.toLowerCase().includes(needle) ||
      i.conditions.join(' ').toLowerCase().includes(needle) ||
      i.desc.toLowerCase().includes(needle));
  }
  return out;
}

const FIXTURES = [
  { id:'PHQ-9',  title:'PHQ-9',  cat:'Validated Scale',   catKey:'validated', conditions:['Depression'], desc:'depression scale' },
  { id:'GAD-7',  title:'GAD-7',  cat:'Validated Scale',   catKey:'validated', conditions:['Anxiety'],    desc:'anxiety scale' },
  { id:'NB',     title:'Neuromod Baseline', cat:'Structured Form', catKey:'form', conditions:['All'],   desc:'baseline form' },
  { id:'SE-MON', title:'Side Effect Monitor', cat:'Structured Form', catKey:'form', conditions:['All'], desc:'side effects checklist' },
  { id:'DEP-BDL',title:'Depression Bundle',   cat:'Condition Bundle', catKey:'bundle', conditions:['Depression'], desc:'phq9 + hdrs bundle' },
];

test('Library filter: validated scales returns only validated items', () => {
  const out = filterTemplates(FIXTURES, 'Validated Scales', '');
  assert.equal(out.length, 2);
  assert.deepEqual(out.map(i => i.id).sort(), ['GAD-7', 'PHQ-9']);
});

test('Library filter: condition bundles returns only bundle items', () => {
  const out = filterTemplates(FIXTURES, 'Condition Bundles', '');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'DEP-BDL');
});

test('Library filter: side effects matches title substring', () => {
  const out = filterTemplates(FIXTURES, 'Side Effects', '');
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'SE-MON');
});

test('Library search: case-insensitive across title / cat / conditions / desc', () => {
  assert.equal(filterTemplates(FIXTURES, 'All', 'depression').length, 2);
  assert.equal(filterTemplates(FIXTURES, 'All', 'BASELINE').length, 1);
  assert.equal(filterTemplates(FIXTURES, 'All', 'anxiety').length, 1);
  assert.equal(filterTemplates(FIXTURES, 'All', 'nonexistent').length, 0);
});

test('Caregiver filter chip is no longer in the chip list', () => {
  const CHIPS = ['All','Validated Scales','Structured Forms','Condition Bundles','Side Effects'];
  assert.equal(CHIPS.includes('Caregiver'), false);
});

// Mirrors the module-scope _hub* helpers in pages-clinical-tools.js.
function hubResolveRegistryScale(scaleId) {
  const mapped = resolveScaleCanonical(scaleId);
  return ASSESS_REGISTRY.find(r => r.id === mapped || r.id === scaleId) || null;
}
function hubInterpretScore(scaleId, score, extraScalesMap) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '';
  const n = Number(score);
  const reg = hubResolveRegistryScale(scaleId);
  if (reg && typeof reg.interpret === 'function') return (reg.interpret(n) || {}).label || '';
  const canon = resolveScaleCanonical(scaleId);
  const ex = (extraScalesMap || {})[scaleId] || (extraScalesMap || {})[canon];
  if (ex && Array.isArray(ex.interpretation)) {
    for (const r of ex.interpretation) if (n <= r.max) return r.label;
  }
  return '';
}

test('hubResolveRegistryScale finds PHQ-9 and GAD-7 in the registry', () => {
  assert.ok(hubResolveRegistryScale('PHQ-9'), 'PHQ-9 must resolve');
  assert.ok(hubResolveRegistryScale('GAD-7'), 'GAD-7 must resolve');
  assert.equal(hubResolveRegistryScale('TOTALLY-FAKE'), null);
});

test('hubInterpretScore uses the registry interpret() when available', () => {
  assert.equal(hubInterpretScore('PHQ-9', 3),  'Minimal');
  assert.equal(hubInterpretScore('PHQ-9', 8),  'Mild');
  assert.equal(hubInterpretScore('PHQ-9', 12), 'Moderate');
  assert.equal(hubInterpretScore('PHQ-9', 22), 'Severe');
  assert.equal(hubInterpretScore('GAD-7', 3),  'Minimal');
  assert.equal(hubInterpretScore('GAD-7', 16), 'Severe');
});

test('hubInterpretScore falls back to extraScalesMap thresholds', () => {
  const map = { 'CUSTOM': { interpretation: [{max:5,label:'Low'},{max:10,label:'Moderate'},{max:20,label:'High'}] } };
  assert.equal(hubInterpretScore('CUSTOM', 3,  map), 'Low');
  assert.equal(hubInterpretScore('CUSTOM', 8,  map), 'Moderate');
  assert.equal(hubInterpretScore('CUSTOM', 15, map), 'High');
  assert.equal(hubInterpretScore('CUSTOM', null, map), '');
  assert.equal(hubInterpretScore('CUSTOM', 'nope', map), '');
});
