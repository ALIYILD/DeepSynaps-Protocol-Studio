import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal, logic-only tests. Keep UI out of scope.
// These mirror the behavior implemented in `pgBrainMapPlanner`.

function inferRegionFromSite(site, regionSites) {
  if (!site) return '';
  for (const k of Object.keys(regionSites || {})) {
    const rs = regionSites[k];
    if (rs?.primary?.includes(site)) return k;
  }
  return '';
}

test('inferRegionFromSite picks region by primary site', () => {
  const BMP_REGION_SITES = {
    'DLPFC-L': { primary: ['F3'], ref: ['Fp2'], alt: [] },
    'M1-L': { primary: ['C3'], ref: ['C4'], alt: [] },
  };
  assert.equal(inferRegionFromSite('F3', BMP_REGION_SITES), 'DLPFC-L');
  assert.equal(inferRegionFromSite('C3', BMP_REGION_SITES), 'M1-L');
  assert.equal(inferRegionFromSite('Fp2', BMP_REGION_SITES), ''); // only primary sites infer region
});

test('planner state can roundtrip via JSON', () => {
  const state = {
    region: 'DLPFC-L',
    modality: 'TMS/rTMS',
    lat: 'left',
    freq: '10',
    intensity: '120',
    pulses: '3000',
    duration: '37.5',
    sessions: '36',
    notes: 'F3 hotspot',
    selectedSite: 'F3',
    view: 'clinical',
    protoId: 'tms-mdd-hf-standard',
  };
  const s2 = JSON.parse(JSON.stringify(state));
  assert.deepEqual(s2, state);
});

