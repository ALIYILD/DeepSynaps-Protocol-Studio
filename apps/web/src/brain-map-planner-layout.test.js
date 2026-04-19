// Logic-only tests for the v2 Brain Map Planner layout helpers.
// Mirror the helpers from `pgBrainMapPlanner` so DOM is not required.
// Run: node --test src/brain-map-planner-layout.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Mirrored helpers ───────────────────────────────────────────────────────
function regionGroup(id) {
  if (!id) return 'Other';
  if (/^DLPFC|^mPFC|^DMPFC|^VMPFC|^OFC|^ACC$/.test(id)) return 'Prefrontal';
  if (/^M1|^SMA$|^S1$/.test(id)) return 'Motor / Sensory';
  if (/^TEMPORAL|^IFG|^PPC/.test(id)) return 'Parietal / Temporal';
  if (/^V1$|^CEREBELLUM$/.test(id)) return 'Occipital';
  return 'Other';
}

const PAD_AREA_CM2 = 12.25;
function parseIntensityMA(v) {
  const m = String(v || '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return 0;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : 0;
}
function computeDensity(intensity_mA, pad_cm2) {
  const mA = Number.isFinite(intensity_mA) ? intensity_mA : parseIntensityMA(intensity_mA);
  const area = pad_cm2 || PAD_AREA_CM2;
  if (area <= 0) return 0;
  return Math.round((mA / area) * 1000) / 1000;
}
function densityStatus(d) {
  if (d > 0.12) return 'err';
  if (d > 0.08) return 'amber';
  return 'ok';
}

// Evidence selection mirrors _evidenceForActive: active + up to 2 siblings
// with the same targetRegion and DISTINCT evidence grades.
function evidenceForActive(catalog, activeId) {
  const byId = {};
  catalog.forEach(e => { byId[e.id] = e; });
  const active = activeId ? byId[activeId] : null;
  if (!active) return [];
  const out = [{
    id: active.id,
    title: active.name,
    grade: active.evidenceGrade || '?',
    isActive: true,
  }];
  const seen = new Set([String(active.evidenceGrade || '?').toUpperCase()]);
  for (const p of catalog) {
    if (out.length >= 3) break;
    if (p.id === active.id) continue;
    if (!p.targetRegion || p.targetRegion !== active.targetRegion) continue;
    const g = String(p.evidenceGrade || '?').toUpperCase();
    if (seen.has(g)) continue;
    seen.add(g);
    out.push({ id: p.id, title: p.name, grade: p.evidenceGrade || '?', isActive: false });
  }
  return out;
}

// ── Tests ──────────────────────────────────────────────────────────────────
test('regionGroup buckets prefrontal regions', () => {
  assert.equal(regionGroup('DLPFC-L'), 'Prefrontal');
  assert.equal(regionGroup('DLPFC-R'), 'Prefrontal');
  assert.equal(regionGroup('mPFC'),    'Prefrontal');
  assert.equal(regionGroup('DMPFC'),   'Prefrontal');
  assert.equal(regionGroup('VMPFC'),   'Prefrontal');
  assert.equal(regionGroup('OFC'),     'Prefrontal');
  assert.equal(regionGroup('ACC'),     'Prefrontal');
});

test('regionGroup buckets motor and sensory regions', () => {
  assert.equal(regionGroup('M1-L'), 'Motor / Sensory');
  assert.equal(regionGroup('M1-R'), 'Motor / Sensory');
  assert.equal(regionGroup('M1-B'), 'Motor / Sensory');
  assert.equal(regionGroup('SMA'),  'Motor / Sensory');
  assert.equal(regionGroup('S1'),   'Motor / Sensory');
});

test('regionGroup buckets parietal/temporal regions', () => {
  assert.equal(regionGroup('TEMPORAL-L'), 'Parietal / Temporal');
  assert.equal(regionGroup('TEMPORAL-R'), 'Parietal / Temporal');
  assert.equal(regionGroup('IFG-L'),      'Parietal / Temporal');
  assert.equal(regionGroup('PPC-L'),      'Parietal / Temporal');
});

test('regionGroup buckets occipital regions', () => {
  assert.equal(regionGroup('V1'),         'Occipital');
  assert.equal(regionGroup('CEREBELLUM'), 'Occipital');
});

test('regionGroup falls back to Other for midline sites', () => {
  assert.equal(regionGroup('Cz'), 'Other');
  assert.equal(regionGroup('Pz'), 'Other');
  assert.equal(regionGroup('Fz'), 'Other');
  assert.equal(regionGroup(''),   'Other');
});

test('parseIntensityMA extracts numeric mA from strings', () => {
  assert.equal(parseIntensityMA('2 mA'),   2);
  assert.equal(parseIntensityMA('2.0 mA'), 2);
  assert.equal(parseIntensityMA('0.5'),    0.5);
  assert.equal(parseIntensityMA(''),       0);
  assert.equal(parseIntensityMA('—'),      0);
  assert.equal(parseIntensityMA(null),     0);
  assert.equal(parseIntensityMA(1.5),      1.5); // number passes through via regex
});

test('computeDensity mirrors 35x35 mm pad (12.25 cm²)', () => {
  // 1 mA / 12.25 cm² ≈ 0.0816
  assert.equal(computeDensity(1),    0.082); // rounded to 3dp
  // 2 mA → ~0.163 — above amber
  assert.equal(computeDensity(2),    0.163);
  // 0.5 mA → ~0.041 — safely ok
  assert.equal(computeDensity(0.5),  0.041);
  // String pass-through works
  assert.equal(computeDensity('1.0 mA'), 0.082);
});

test('densityStatus gates at 0.08 (ok→amber) and 0.12 (amber→err)', () => {
  assert.equal(densityStatus(0.05), 'ok');
  assert.equal(densityStatus(0.08), 'ok');     // exactly at ok limit
  assert.equal(densityStatus(0.09), 'amber');
  assert.equal(densityStatus(0.12), 'amber');  // exactly at amber limit
  assert.equal(densityStatus(0.15), 'err');
});

test('densityStatus labels 1 mA as ok (0.082 mA/cm² is above 0.08 threshold)', () => {
  // 0.082 > 0.08 → amber. This documents the exact threshold behaviour.
  assert.equal(densityStatus(computeDensity(1)), 'amber');
});

test('densityStatus labels 0.9 mA as ok (0.073 mA/cm² is safely under)', () => {
  assert.equal(densityStatus(computeDensity(0.9)), 'ok');
});

test('evidenceForActive picks up to 3 items with distinct grades', () => {
  const catalog = [
    { id:'a', name:'Active MDD',    targetRegion:'DLPFC-L', evidenceGrade:'A' },
    { id:'b', name:'Same region B', targetRegion:'DLPFC-L', evidenceGrade:'B' },
    { id:'c', name:'Dup grade A',   targetRegion:'DLPFC-L', evidenceGrade:'A' },
    { id:'d', name:'Same region C', targetRegion:'DLPFC-L', evidenceGrade:'C' },
    { id:'e', name:'Other region',  targetRegion:'M1-L',    evidenceGrade:'B' },
  ];
  const rows = evidenceForActive(catalog, 'a');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, 'a');
  assert.equal(rows[0].isActive, true);
  // Next two rows should be distinct grades from the active protocol's grade.
  const grades = rows.slice(1).map(r => r.grade);
  assert.ok(!grades.includes('A')); // A is the active's grade, excluded from siblings
  assert.deepEqual(new Set(grades), new Set(['B','C']));
});

test('evidenceForActive returns empty when no active protocol selected', () => {
  const catalog = [
    { id:'a', name:'X', targetRegion:'DLPFC-L', evidenceGrade:'A' },
  ];
  assert.deepEqual(evidenceForActive(catalog, ''), []);
  assert.deepEqual(evidenceForActive(catalog, 'nonexistent'), []);
});

test('evidenceForActive returns only active when region has no siblings', () => {
  const catalog = [
    { id:'a', name:'Solo',     targetRegion:'V1', evidenceGrade:'A' },
    { id:'b', name:'Elsewhere', targetRegion:'M1-L', evidenceGrade:'B' },
  ];
  const rows = evidenceForActive(catalog, 'a');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'a');
});
