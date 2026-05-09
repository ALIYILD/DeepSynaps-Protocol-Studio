// Tests for brain-map-svg.js
//
// Exports:
//   SITES_10_20            — Array of 20 standard 10-20 electrode site objects
//   renderBrainMap10_20    — returns SVG HTML string
//   renderTopoHeatmap      — Canvas IDW heatmap (falls back to SVG in Node)
//   renderConnectivityMatrix     — NxN color-coded SVG grid
//   renderConnectivityBrainMap   — brain map SVG with connection lines
//   renderConnectivityChordLite  — chord diagram SVG
//
// NOTE: renderTopoHeatmap attempts Canvas/OffscreenCanvas rendering and falls
// back to the pure-SVG path in Node (no Canvas available). We test the SVG
// fallback path only; the Canvas branch requires a real browser context.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  SITES_10_20,
  renderBrainMap10_20,
  renderTopoHeatmap,
  renderConnectivityMatrix,
  renderConnectivityBrainMap,
  renderConnectivityChordLite,
  renderICAComponents,
  renderWaveletHeatmap,
  renderChannelQualityMap,
  renderAsymmetryMap,
  renderPowerBarChart,
  renderTBRBarChart,
  renderSignalDeviationChart,
  renderBiomarkerGauges,
  renderBrodmannTable,
  render3DBrainMap,
  render3DBrainMapMini,
} from './brain-map-svg.js';

// ── SITES_10_20 constant ──────────────────────────────────────────────────────

describe('SITES_10_20 constant', () => {
  it('exports exactly 20 sites', () => {
    assert.strictEqual(SITES_10_20.length, 20, 'must have exactly 20 10-20 sites');
  });

  it('every site has id, x, y, and lobe fields', () => {
    for (const site of SITES_10_20) {
      assert.ok(typeof site.id === 'string' && site.id.length > 0, `site.id missing on: ${JSON.stringify(site)}`);
      assert.ok(typeof site.x === 'number', `site.x must be a number for ${site.id}`);
      assert.ok(typeof site.y === 'number', `site.y must be a number for ${site.id}`);
      assert.ok(typeof site.lobe === 'string' && site.lobe.length > 0, `site.lobe missing on ${site.id}`);
    }
  });

  it('coordinates are in the [-1, +1] range', () => {
    for (const site of SITES_10_20) {
      assert.ok(site.x >= -1 && site.x <= 1, `${site.id}.x=${site.x} out of [-1,1]`);
      assert.ok(site.y >= -1 && site.y <= 1, `${site.id}.y=${site.y} out of [-1,1]`);
    }
  });

  it('includes canonical sites: Fz, Cz, Pz, Oz (midline)', () => {
    const ids = SITES_10_20.map(s => s.id);
    for (const mid of ['Fz', 'Cz', 'Pz', 'Oz']) {
      assert.ok(ids.includes(mid), `midline site ${mid} must be in SITES_10_20`);
    }
  });

  it('includes T7 and T8 (new 10-20 naming) not T3/T4', () => {
    const ids = SITES_10_20.map(s => s.id);
    assert.ok(ids.includes('T7'), 'T7 must be present (new naming)');
    assert.ok(ids.includes('T8'), 'T8 must be present (new naming)');
    assert.ok(!ids.includes('T3'), 'T3 should not be in SITES_10_20 (old naming)');
    assert.ok(!ids.includes('T4'), 'T4 should not be in SITES_10_20 (old naming)');
  });
});

// ── renderBrainMap10_20 ───────────────────────────────────────────────────────

describe('renderBrainMap10_20', () => {
  it('returns a non-empty SVG string', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(typeof svg === 'string' && svg.length > 0, 'must return a non-empty string');
    assert.ok(svg.includes('<svg'), 'must start with SVG element');
  });

  it('includes ARIA label for accessibility', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(
      svg.includes('aria-label="10-20 EEG electrode map"'),
      'must include aria-label for the electrode map'
    );
  });

  it('renders all 20 electrode labels', () => {
    const svg = renderBrainMap10_20({});
    for (const site of SITES_10_20) {
      assert.ok(
        svg.includes('data-site="' + site.id + '"'),
        `electrode group for ${site.id} must be in SVG`
      );
    }
  });

  it('marks anode electrode with is-anode class and teal fill', () => {
    const svg = renderBrainMap10_20({ anode: 'F3' });
    assert.ok(svg.includes('is-anode'), 'F3 should have is-anode class');
    assert.ok(svg.includes('#00d4bc'), 'anode should use teal (#00d4bc) fill');
  });

  it('marks cathode electrode with is-cathode class and pink fill', () => {
    const svg = renderBrainMap10_20({ cathode: 'F4' });
    assert.ok(svg.includes('is-cathode'), 'F4 should have is-cathode class');
    assert.ok(svg.includes('#ff6b9d'), 'cathode should use pink (#ff6b9d) fill');
  });

  it('renders connection line between anode and cathode', () => {
    const svg = renderBrainMap10_20({ anode: 'F3', cathode: 'F4', showConnection: true });
    assert.ok(svg.includes('bm-connect'), 'connection line with class bm-connect should be present');
    assert.ok(
      svg.includes('bm-connect-grad'),
      'connection line gradient (bm-connect-grad) should be referenced'
    );
  });

  it('renders target region ring for DLPFC-L', () => {
    const svg = renderBrainMap10_20({ targetRegion: 'DLPFC-L' });
    assert.ok(
      svg.includes('ds-bm-target-ring'),
      'target ring element should be present for DLPFC-L'
    );
    assert.ok(
      svg.includes('Left DLPFC target'),
      'caption "Left DLPFC target" should appear in the SVG'
    );
  });

  it('omits connection line when showConnection=false', () => {
    const svg = renderBrainMap10_20({ anode: 'C3', cathode: 'C4', showConnection: false });
    assert.ok(!svg.includes('bm-connect"'), 'connection line should be omitted when showConnection=false');
  });

  it('omits nose/ears when showEarsAndNose=false', () => {
    const svgWith = renderBrainMap10_20({ showEarsAndNose: true });
    const svgWithout = renderBrainMap10_20({ showEarsAndNose: false });
    assert.ok(svgWith.includes('ds-bm-nose'), 'nose should render when showEarsAndNose=true');
    assert.ok(!svgWithout.includes('ds-bm-nose'), 'nose should be absent when showEarsAndNose=false');
  });

  it('accepts custom size parameter', () => {
    const svg = renderBrainMap10_20({ size: 480 });
    assert.ok(
      svg.includes('width="480"') && svg.includes('height="480"'),
      'custom size should appear in SVG width/height attributes'
    );
  });

  it('omits zones when disabled and skips invalid overlays', () => {
    const svg = renderBrainMap10_20({ showZones: false, anode: 'BAD', cathode: 'F4', targetRegion: 'UNKNOWN' });
    assert.ok(!svg.includes('ds-bm-zones'));
    assert.ok(!svg.includes('class="ds-bm-connect"'));
    assert.ok(!svg.includes('ds-bm-target-ring'));
  });

  it('renders highlighted sites and right-side target captions', () => {
    const svg = renderBrainMap10_20({ targetRegion: 'DLPFC-R', highlightSites: ['Cz', 'Oz'] });
    assert.ok(svg.includes('Right DLPFC target'));
    assert.ok(svg.includes('text-anchor="end"'));
    assert.ok(svg.includes('rgba(74,158,255,0.18)'));
  });
});

// ── renderTopoHeatmap (SVG fallback in Node) ──────────────────────────────────
// Canvas is not available in Node; the function falls back to the pure-SVG
// renderer (_renderTopoHeatmapSvgFallback). We test the SVG fallback path.

describe('renderTopoHeatmap (SVG fallback)', () => {
  const BAND_POWERS = {
    Fz: 18.5, Cz: 12.3, Pz: 22.1,
    F3: 15.0, F4: 14.8, C3: 11.0, C4: 10.8,
  };

  it('returns a non-empty string', () => {
    const result = renderTopoHeatmap(BAND_POWERS, { band: 'alpha' });
    assert.ok(typeof result === 'string' && result.length > 0, 'must return a non-empty string');
  });

  it('result contains SVG or img element', () => {
    const result = renderTopoHeatmap(BAND_POWERS, { band: 'alpha' });
    const hasSvgOrImg = result.includes('<svg') || result.includes('<img');
    assert.ok(hasSvgOrImg, 'must contain SVG or img element in output');
  });

  it('includes the band name in the output', () => {
    const result = renderTopoHeatmap(BAND_POWERS, { band: 'theta' });
    assert.ok(result.includes('theta'), 'band name "theta" should appear in output');
  });

  it('handles empty bandPowers gracefully', () => {
    const result = renderTopoHeatmap({}, { band: 'alpha' });
    assert.ok(typeof result === 'string', 'empty bandPowers should return a string without throwing');
  });

  it('supports diverging palettes and custom legend labels', () => {
    const result = renderTopoHeatmap(
      { F3: -2, F4: 2, Cz: 0 },
      {
        band: 'asymmetry',
        colorScale: 'diverging',
        valueDomain: [-4, 4],
        legendMinLabel: '-4σ',
        legendMidLabel: '0',
        legendMaxLabel: '+4σ',
      },
    );
    assert.ok(result.includes('-4σ'));
    assert.ok(result.includes('+4σ'));
    assert.ok(result.includes('asymmetry'));
  });
});

// ── renderConnectivityMatrix ──────────────────────────────────────────────────

describe('renderConnectivityMatrix', () => {
  const CH = ['Fz', 'Cz', 'Pz'];
  const MATRIX = [
    [1.0, 0.8, 0.3],
    [0.8, 1.0, 0.6],
    [0.3, 0.6, 1.0],
  ];

  it('returns SVG with connectivity matrix', () => {
    const svg = renderConnectivityMatrix(MATRIX, CH, { band: 'alpha' });
    assert.ok(svg.includes('<svg'), 'must return SVG element');
  });

  it('includes ARIA label with band name', () => {
    const svg = renderConnectivityMatrix(MATRIX, CH, { band: 'beta' });
    assert.ok(
      svg.includes('Connectivity matrix — beta'),
      'ARIA label should include band name'
    );
  });

  it('renders channel labels in the matrix', () => {
    const svg = renderConnectivityMatrix(MATRIX, CH, {});
    assert.ok(svg.includes('Fz'), 'Fz channel label should be in matrix');
    assert.ok(svg.includes('Pz'), 'Pz channel label should be in matrix');
  });

  it('returns "No data" for empty inputs', () => {
    const result = renderConnectivityMatrix([], [], {});
    assert.ok(result.includes('No data'), 'empty inputs should render "No data"');
  });
});

// ── renderConnectivityBrainMap ────────────────────────────────────────────────

describe('renderConnectivityBrainMap', () => {
  const CONNECTIONS = [
    { ch1: 'F3', ch2: 'F4', value: 0.9 },
    { ch1: 'Cz', ch2: 'Pz', value: 0.7 },
    { ch1: 'F3', ch2: 'Cz', value: 0.2 }, // below default threshold 0.3 — not drawn
  ];

  it('returns SVG string', () => {
    const svg = renderConnectivityBrainMap(CONNECTIONS, { band: 'alpha' });
    assert.ok(svg.includes('<svg'), 'must return SVG element');
  });

  it('includes ARIA label for the brain map', () => {
    const svg = renderConnectivityBrainMap(CONNECTIONS, { band: 'gamma' });
    assert.ok(
      svg.includes('Connectivity brain map — gamma'),
      'ARIA label should include band name'
    );
  });

  it('renders connection line above threshold', () => {
    const svg = renderConnectivityBrainMap(CONNECTIONS, { threshold: 0.3 });
    assert.ok(svg.includes('<line'), 'should render <line> elements for connections above threshold');
  });

  it('maps backend T3 channel name to T7 in SVG', () => {
    const conns = [{ ch1: 'T3', ch2: 'T4', value: 0.8 }];
    // Should not crash — T3→T7 / T4→T8 mapping is applied internally
    const svg = renderConnectivityBrainMap(conns, {});
    assert.ok(typeof svg === 'string' && svg.length > 0, 'T3/T4 backend names should be mapped without error');
  });

  it('filters below-threshold and unknown-channel connections', () => {
    const svg = renderConnectivityBrainMap(
      [
        { ch1: 'F3', ch2: 'Cz', value: 0.2 },
        { ch1: 'BAD', ch2: 'Cz', value: 0.9 },
      ],
      { threshold: 0.3 },
    );
    assert.ok(!svg.includes('F3-Cz: 0.20'));
    assert.ok(!svg.includes('BAD-Cz: 0.90'));
  });
});

// ── renderConnectivityChordLite ───────────────────────────────────────────────

describe('renderConnectivityChordLite', () => {
  const NODES = [
    { id: 'F3', label: 'F3' },
    { id: 'Cz', label: 'Cz' },
    { id: 'Pz', label: 'Pz' },
  ];
  const EDGES = [
    { source: 'F3', target: 'Cz', weight: 0.8, sign: 1 },
    { source: 'Cz', target: 'Pz', weight: 0.5, sign: -1 },
  ];

  it('returns SVG chord diagram', () => {
    const svg = renderConnectivityChordLite(NODES, EDGES, { title: 'Alpha coherence' });
    assert.ok(svg.includes('<svg'), 'must return SVG element');
  });

  it('returns "No connectivity nodes" for empty nodes array', () => {
    const result = renderConnectivityChordLite([], [], {});
    assert.ok(result.includes('No connectivity nodes'), '"No connectivity nodes" message expected');
  });

  it('renders node labels in the chord diagram', () => {
    const svg = renderConnectivityChordLite(NODES, EDGES, {});
    assert.ok(svg.includes('F3'), 'F3 node label should appear in chord diagram');
  });

  it('uses title from options in ARIA label', () => {
    const svg = renderConnectivityChordLite(NODES, EDGES, { title: 'Theta chord' });
    assert.ok(
      svg.includes('Theta chord'),
      'custom title should appear as ARIA label in SVG'
    );
  });

  it('filters sub-threshold edges and uses inhibitory color for negative links', () => {
    const svg = renderConnectivityChordLite(
      NODES,
      [
        { source: 'F3', target: 'Cz', weight: 0.2, sign: 1 },
        { source: 'Cz', target: 'Pz', weight: 0.6, sign: -1 },
      ],
      { threshold: 0.3 },
    );
    assert.ok(!svg.includes('F3 → Cz: 0.20'));
    assert.ok(svg.includes('rgba(96,165,250,0.55)'));
  });
});

describe('additional brain-map-svg exports', () => {
  it('covers ICA, wavelet, and quality/asymmetry maps', () => {
    assert.ok(renderICAComponents([], [], {}).includes('No ICA data'));
    const icaSvg = renderICAComponents([
      { label: 'IC1', type: 'eye_blink', variance_explained: 0.23, weights: { Fp1: 1.2, Fp2: 1.0, Cz: -0.4 } },
      { label: 'IC2', type: 'brain', variance_explained: 0.12, weights: { O1: 0.8, O2: 0.9 } },
    ], [], { maxComponents: 1 });
    assert.ok(icaSvg.includes('IC1'));
    assert.ok(!icaSvg.includes('IC2'));

    assert.ok(renderWaveletHeatmap(null, {}).includes('No time-frequency data'));
    const waveletSvg = renderWaveletHeatmap({
      times: [0, 0.5, 1],
      frequencies: [1, 4, 8, 16, 32],
      power: [[1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6], [5, 6, 7]],
      channel: 'Cz',
    }, { width: 420, height: 260 });
    assert.ok(waveletSvg.includes('Cz — Time-Frequency'));

    assert.ok(renderChannelQualityMap(null, [], {}).includes('No quality data'));
    const qualitySvg = renderChannelQualityMap({
      F3: { quality: 0.95, peak_to_peak: 42.3, std: 3.2, flat_pct: 0.01 },
      T3: { quality: 0.55, peak_to_peak: 12.1, std: 7.5, flat_pct: 0.1 },
    }, ['F3', 'T7'], {});
    assert.ok(qualitySvg.includes('Grade'));
    assert.ok(qualitySvg.includes('95%'));

    assert.ok(renderAsymmetryMap(null, {}).includes('No asymmetry data'));
    const asymSvg = renderAsymmetryMap({
      frontal: { index: 0.8, direction: 'left' },
      central: { index: -0.6, direction: 'right' },
      temporal: { index: 0, direction: 'left' },
      parietal: { index: 0.2, direction: 'left' },
      occipital: { index: -0.3, direction: 'right' },
    }, {});
    assert.ok(asymSvg.includes('Left dominant'));
    assert.ok(asymSvg.includes('Right dominant'));
  });

  it('covers power/TBR/deviation, biomarker, Brodmann, and 3D maps', () => {
    assert.ok(renderPowerBarChart(null, {}).includes('No band power data'));
    assert.ok(renderTBRBarChart({}, {}).includes('No TBR data'));
    assert.ok(renderSignalDeviationChart({}, {}).includes('No signal deviation data'));
    assert.ok(renderBiomarkerGauges([], {}).includes('No biomarker data'));
    assert.ok(renderBrodmannTable([], {}).includes('No Brodmann area data'));

    const powerSvg = renderPowerBarChart({
      delta: { mean: 1.2e-6, status: 'Normal' },
      theta: { mean: 2.4e-6, status: 'Elevated' },
      alpha: { mean: 1.8e-6, status: 'Reduced' },
      beta: { mean: 0.9e-6, status: 'Normal' },
      gamma: { mean: 0.5e-6, status: 'Normal' },
    }, {});
    assert.ok(powerSvg.includes('Absolute Power Spectra'));

    const tbrSvg = renderTBRBarChart({ Fp1: 1.8, Fp2: 4.5, Cz: 3.2 }, { threshold: 4.0 });
    assert.ok(tbrSvg.includes('Clinical Threshold (4.0)'));

    const devSvg = renderSignalDeviationChart({
      Fp1: { mean: 2.5e-5, std: 4.1e-6 },
      Cz: { mean: -1.2e-5, std: 7.3e-6 },
      O1: { mean: 0.6e-5, std: 2.2e-6 },
    }, {});
    assert.ok(devSvg.includes('Most Variable'));

    const biomarkerSvg = renderBiomarkerGauges([
      { name: 'ADHD', likelihood: 78, relevance: 'High relevance' },
      { name: 'Anxiety', likelihood: 35, relevance: 'Moderate relevance' },
      { name: 'None', likelihood: 0, relevance: 'Limited evidence' },
    ], { columns: 2, gaugeSize: 90 });
    assert.ok(biomarkerSvg.includes('78%'));

    const brodmannSvg = renderBrodmannTable([
      { area: 'BA9', name: 'DLPFC', z_score: 2.31, status: 'significant', channels: ['F3', 'F4'], functions: ['Executive'], clinical_relevance: 'Often implicated' },
      { area: 'BA17', name: 'Visual cortex', z_score: 0.42, status: 'normal', channels: ['O1', 'O2'], functions: ['Vision'], clinical_relevance: '' },
    ], {});
    assert.ok(brodmannSvg.includes('Clinical Relevance'));

    const brain3dSvg = render3DBrainMap({ F3: 12, F4: 8, Cz: 10, O1: 15, O2: 14 }, { band: 'beta', showElectrodes: false });
    assert.ok(brain3dSvg.includes('3D Brain Map — beta'));
    const miniSvg = render3DBrainMapMini('gamma');
    assert.ok(miniSvg.includes('animate'));
  });
});
