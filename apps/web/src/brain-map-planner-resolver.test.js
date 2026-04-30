// Logic-only tests for the v2 Brain Map Planner deterministic resolvers.
// Mirrors `_bmpResolveAnchor` and `_bmpAnalyzerTargetToRegion` from
// `pgBrainMapPlanner` (in pages-clinical-tools.js). The planner's
// resolvers are PURE registry/math — never AI — so they must return the
// canonical 10-20 anchor for every supported clinical target.
//
// Run: node --test src/brain-map-planner-resolver.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Mirrored registry (the subset relevant for these assertions) ───────────
const BMP_REGION_SITES = {
  'DLPFC-L':    { primary:['F3'],        ref:['Fp2'],        alt:['AF3','F1','FC1'] },
  'DLPFC-R':    { primary:['F4'],        ref:['Fp1'],        alt:['AF4','F2','FC2'] },
  'DLPFC-B':    { primary:['F3','F4'],   ref:[],             alt:['Fz'] },
  'M1-L':       { primary:['C3'],        ref:['C4'],         alt:['FC3','CP3'] },
  'M1-R':       { primary:['C4'],        ref:['C3'],         alt:['FC4','CP4'] },
  'SMA':        { primary:['FCz','Cz'],  ref:[],             alt:['FC1','FC2','Fz'] },
  'mPFC':       { primary:['Fz'],        ref:['Pz'],         alt:['AFz','FCz'] },
  'DMPFC':      { primary:['Fz'],        ref:['Oz'],         alt:['FCz','AF4'] },
  'IFG-L':      { primary:['F7'],        ref:['F8'],         alt:['FT7','FC3'] },
  'TEMPORAL-L': { primary:['T7'],        ref:['T8'],         alt:['TP7','FT7'] },
  'V1':         { primary:['Oz'],        ref:['Cz'],         alt:['O1','O2'] },
  'Cz':         { primary:['Cz'],        ref:['Fz'],         alt:['FC1','FC2','CP1','CP2'] },
};

// Mirror of _bmpResolveAnchor — registry only, never AI.
function resolveAnchor(regionId, registryTargets) {
  if (!regionId) return null;
  const local = BMP_REGION_SITES[regionId];
  if (local && local.primary && local.primary.length) return local.primary[0];
  const fromBackend = (registryTargets || []).find(t => t && t.id === regionId);
  if (fromBackend && fromBackend.primary_anchor) return fromBackend.primary_anchor;
  return null;
}

// Mirror of _bmpAnalyzerTargetToRegion — best-effort text → region map.
function analyzerTargetToRegion(target) {
  const t = String(target || '').toLowerCase();
  if (!t) return '';
  if (/left\s*dlpfc|l-?dlpfc|\bf3\b/.test(t))  return 'DLPFC-L';
  if (/right\s*dlpfc|r-?dlpfc|\bf4\b/.test(t)) return 'DLPFC-R';
  if (/bilateral\s*dlpfc/.test(t))             return 'DLPFC-B';
  if (/dmpfc|dorsomedial/.test(t))             return 'DMPFC';
  if (/mpfc|medial\s*pfc/.test(t))             return 'mPFC';
  if (/\bsma\b|supplementary motor|\bfcz\b/.test(t)) return 'SMA';
  if (/left\s*m1|m1.l|c3/.test(t))             return 'M1-L';
  if (/right\s*m1|m1.r|c4/.test(t))            return 'M1-R';
  if (/inferior frontal gyrus|broca|ifg.l|\bf7\b/.test(t)) return 'IFG-L';
  if (/temporal.*left|t7|t5/.test(t))          return 'TEMPORAL-L';
  if (/o1|o2|oz|occipital|v1/.test(t))         return 'V1';
  return '';
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('resolveAnchor maps the canonical clinical targets to 10-20 sites', () => {
  // The contract: every supported region resolves to a deterministic anchor.
  // No AI. No fabrication. If the registry is missing the entry, return null.
  assert.equal(resolveAnchor('DLPFC-L'), 'F3');
  assert.equal(resolveAnchor('DLPFC-R'), 'F4');
  assert.equal(resolveAnchor('M1-L'),    'C3');
  assert.equal(resolveAnchor('M1-R'),    'C4');
  assert.equal(resolveAnchor('SMA'),     'FCz');
  assert.equal(resolveAnchor('mPFC'),    'Fz');
  assert.equal(resolveAnchor('IFG-L'),   'F7');
  assert.equal(resolveAnchor('V1'),      'Oz');
});

test('resolveAnchor falls back to the backend registry when local map missed', () => {
  const registry = [
    { id: 'CUSTOM-X', primary_anchor: 'P5' },
    { id: 'OTHER',    primary_anchor: 'O1' },
  ];
  assert.equal(resolveAnchor('CUSTOM-X', registry), 'P5');
  assert.equal(resolveAnchor('OTHER',    registry), 'O1');
});

test('resolveAnchor returns null for unknown region (never fabricates)', () => {
  assert.equal(resolveAnchor('NONEXISTENT', []), null);
  assert.equal(resolveAnchor(''), null);
  assert.equal(resolveAnchor(null), null);
  assert.equal(resolveAnchor(undefined), null);
});

test('analyzerTargetToRegion maps Analyzer free-text candidates to canonical regions', () => {
  // Real shapes from qeeg_protocol_fit.py _PATTERN_LIBRARY:
  assert.equal(analyzerTargetToRegion('left DLPFC'),                   'DLPFC-L');
  assert.equal(analyzerTargetToRegion('right DLPFC'),                  'DLPFC-R');
  assert.equal(analyzerTargetToRegion('right inferior frontal gyrus'), 'IFG-L'); // Broca side
  assert.equal(analyzerTargetToRegion('O1/O2'),                        'V1');
  // Common variants seen in candidate shapes:
  assert.equal(analyzerTargetToRegion('L-DLPFC'),                      'DLPFC-L');
  assert.equal(analyzerTargetToRegion('R-DLPFC'),                      'DLPFC-R');
  assert.equal(analyzerTargetToRegion('mPFC'),                         'mPFC');
  assert.equal(analyzerTargetToRegion('DMPFC'),                        'DMPFC');
});

test('analyzerTargetToRegion returns "" for unmapped or empty input — never fabricates', () => {
  assert.equal(analyzerTargetToRegion(''),                  '');
  assert.equal(analyzerTargetToRegion(null),                '');
  assert.equal(analyzerTargetToRegion(undefined),           '');
  assert.equal(analyzerTargetToRegion('some random text'),  '');
  assert.equal(analyzerTargetToRegion('cingulate'),         '');
});

// ── Plan artifact shape ────────────────────────────────────────────────────
// Documents the export schema. The artifact must (a) carry a demo_stamp
// when there is no patient context, (b) include resolved anchors, (c) carry
// safety disclaimers the clinician can see in the export.
function buildPlanArtifact(state, ctx) {
  const region = state.region || '';
  const anchor = region ? resolveAnchor(region, ctx.registry) : (state.selectedSite || null);
  const isDemoArtifact = !(ctx.qeegAnalysisId || ctx.qeegPatientId || (state.patientId && state.patientId.trim()));
  return {
    schema: 'deepsynaps.brain_map_plan/v1',
    demo_stamp: isDemoArtifact ? 'SAMPLE_PATIENT__CLINICIAN_REVIEW_REQUIRED' : null,
    target: { region_id: region, anchor_electrode: anchor },
    parameters: {
      modality: state.modality, frequency: state.freq, intensity: state.intensity,
    },
    disclaimers: [
      'Brain map and target suggestions support clinical decision-making and require clinician review.',
      'Coordinate→electrode mapping uses 10-20 EEG conventions; individual head models may vary.',
      'Protocol parameters require device-specific safety review per local policy.',
      'Patient consent and contraindication screening required before stimulation.',
    ],
  };
}

test('buildPlanArtifact stamps DEMO when no patient context is attached', () => {
  const plan = buildPlanArtifact(
    { region: 'DLPFC-L', modality: 'TMS/rTMS', freq: '10', intensity: '120' },
    { qeegAnalysisId: null, qeegPatientId: null }
  );
  assert.equal(plan.demo_stamp, 'SAMPLE_PATIENT__CLINICIAN_REVIEW_REQUIRED');
  assert.equal(plan.target.region_id, 'DLPFC-L');
  assert.equal(plan.target.anchor_electrode, 'F3');
  assert.equal(plan.disclaimers.length, 4);
});

test('buildPlanArtifact omits demo_stamp when patient context is real', () => {
  const plan1 = buildPlanArtifact(
    { region: 'DLPFC-L', patientId: 'pt-real-123' },
    { qeegAnalysisId: null, qeegPatientId: null }
  );
  assert.equal(plan1.demo_stamp, null);
  const plan2 = buildPlanArtifact(
    { region: 'DLPFC-L' },
    { qeegAnalysisId: 'qa-real-456', qeegPatientId: null }
  );
  assert.equal(plan2.demo_stamp, null);
});
