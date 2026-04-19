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

// Mirrors the modality mapping in pgBrainMapPlanner — keeps registry protocols
// rendering with the right map rings (iTBS glow vs tDCS polarity markers).
function devToModality(dev, subtype) {
  const s = String(subtype || '').toLowerCase();
  if (dev === 'tms' || dev === 'deep_tms') {
    if (s.indexOf('itbs') !== -1) return 'iTBS';
    if (s.indexOf('ctbs') !== -1) return 'cTBS';
    if (s.indexOf('deep') !== -1 || s.indexOf('h-coil') !== -1) return 'Deep TMS';
    return 'TMS/rTMS';
  }
  const M = { tdcs:'tDCS', tacs:'tACS', ces:'CES', tavns:'taVNS', tps:'TPS',
              pbm:'PBM', pemf:'PBM', nf:'Neurofeedback', tus:'TPS' };
  return M[dev] || 'TMS/rTMS';
}

test('devToModality routes tms subtypes correctly', () => {
  assert.equal(devToModality('tms', 'HF-rTMS (10Hz)'), 'TMS/rTMS');
  assert.equal(devToModality('tms', 'iTBS'),           'iTBS');
  assert.equal(devToModality('tms', 'cTBS'),           'cTBS');
  assert.equal(devToModality('tms', 'Deep TMS (H-coil)'), 'Deep TMS');
  assert.equal(devToModality('tdcs'), 'tDCS');
  assert.equal(devToModality('nf'),   'Neurofeedback');
});

// Mirrors the filter logic applied to the unified protocol catalog.
function filterCatalog(catalog, f) {
  const q = (f.q || '').toLowerCase();
  return catalog.filter(p => {
    if (f.cond && p.conditionId !== f.cond) return false;
    if (f.ev   && (p.evidenceGrade || '?') !== f.ev) return false;
    if (f.site && p.anode !== f.site && p.cathode !== f.site) return false;
    if (q) {
      const blob = (p.name + ' ' + (p.summary||'') + ' ' + (p.conditionId||'')).toLowerCase();
      if (blob.indexOf(q) === -1) return false;
    }
    return true;
  });
}

test('filterCatalog narrows by condition, evidence, and electrode site', () => {
  const cat = [
    { id:'a', name:'DLPFC-L MDD',  conditionId:'mdd',    evidenceGrade:'A', anode:'F3', cathode:null, summary:'Left DLPFC' },
    { id:'b', name:'M1 Pain tDCS', conditionId:'pain',   evidenceGrade:'B', anode:'C3', cathode:'FP2', summary:'Motor cortex' },
    { id:'c', name:'OCD DMPFC',    conditionId:'ocd',    evidenceGrade:'A', anode:'Fz', cathode:null, summary:'Deep TMS' },
  ];
  assert.equal(filterCatalog(cat, { cond:'mdd' }).length, 1);
  assert.equal(filterCatalog(cat, { ev:'A' }).length, 2);
  assert.equal(filterCatalog(cat, { site:'C3' }).length, 1);
  assert.equal(filterCatalog(cat, { q:'mdd' }).length, 1);
  assert.equal(filterCatalog(cat, { site:'FP2' }).length, 1);
});

