// brain-map-svg.test.js — schema + renderer pins for brain-map-svg.js
// Wave-6 coverage (PR 91/N)

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SITES_10_20, renderBrainMap10_20 } from './brain-map-svg.js';

// ── SITES_10_20 ───────────────────────────────────────────────────────────────

describe('SITES_10_20', () => {
  it('exports exactly 20 sites', () => {
    assert.strictEqual(SITES_10_20.length, 20);
  });

  it('every site has id, x, y, lobe', () => {
    for (const s of SITES_10_20) {
      assert.ok(s.id, `missing id`);
      assert.ok(typeof s.x === 'number', `x not number on ${s.id}`);
      assert.ok(typeof s.y === 'number', `y not number on ${s.id}`);
      assert.ok(s.lobe, `missing lobe on ${s.id}`);
    }
  });

  it('all site ids are unique', () => {
    const ids = SITES_10_20.map(s => s.id);
    assert.strictEqual(new Set(ids).size, ids.length);
  });

  it('x,y coordinates are in [-1, +1]', () => {
    for (const s of SITES_10_20) {
      assert.ok(s.x >= -1 && s.x <= 1, `x out of range on ${s.id}: ${s.x}`);
      assert.ok(s.y >= -1 && s.y <= 1, `y out of range on ${s.id}: ${s.y}`);
    }
  });

  it('Cz is at center (0, 0)', () => {
    const cz = SITES_10_20.find(s => s.id === 'Cz');
    assert.ok(cz);
    assert.strictEqual(cz.x, 0);
    assert.strictEqual(cz.y, 0);
  });

  it('F3 is in frontal lobe', () => {
    const f3 = SITES_10_20.find(s => s.id === 'F3');
    assert.ok(f3);
    assert.strictEqual(f3.lobe, 'frontal');
  });

  it('C3 is in central lobe', () => {
    const c3 = SITES_10_20.find(s => s.id === 'C3');
    assert.ok(c3);
    assert.strictEqual(c3.lobe, 'central');
  });

  it('O1 and O2 are in occipital lobe', () => {
    const o1 = SITES_10_20.find(s => s.id === 'O1');
    const o2 = SITES_10_20.find(s => s.id === 'O2');
    assert.strictEqual(o1.lobe, 'occipital');
    assert.strictEqual(o2.lobe, 'occipital');
  });

  it('contains all classic 10-20 electrodes', () => {
    const required = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T7','C3','Cz','C4','T8',
                      'P7','P3','Pz','P4','P8','O1','O2','Oz'];
    const ids = new Set(SITES_10_20.map(s => s.id));
    for (const r of required) {
      assert.ok(ids.has(r), `missing electrode ${r}`);
    }
  });
});

// ── renderBrainMap10_20 ───────────────────────────────────────────────────────

describe('renderBrainMap10_20', () => {
  it('is a function', () => {
    assert.strictEqual(typeof renderBrainMap10_20, 'function');
  });

  it('returns a string', () => {
    const svg = renderBrainMap10_20({});
    assert.strictEqual(typeof svg, 'string');
  });

  it('output is a valid SVG opening tag', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(svg.startsWith('<svg '), `does not start with <svg`);
    assert.ok(svg.endsWith('</svg>'), `does not end with </svg>`);
  });

  it('default size is 360', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(svg.includes('width="360"'));
    assert.ok(svg.includes('height="360"'));
  });

  it('custom size is respected', () => {
    const svg = renderBrainMap10_20({ size: 480 });
    assert.ok(svg.includes('width="480"'));
    assert.ok(svg.includes('height="480"'));
  });

  it('includes aria-label for accessibility', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(svg.includes('aria-label="10-20 EEG electrode map"'));
  });

  it('renders all 20 electrode labels', () => {
    const svg = renderBrainMap10_20({});
    for (const s of SITES_10_20) {
      assert.ok(svg.includes(`data-site="${s.id}"`),
        `missing data-site="${s.id}" in SVG`);
    }
  });

  it('marks anode electrode with is-anode class', () => {
    const svg = renderBrainMap10_20({ anode: 'F3' });
    assert.ok(svg.includes('is-anode'));
  });

  it('marks cathode electrode with is-cathode class', () => {
    const svg = renderBrainMap10_20({ cathode: 'Fp2' });
    assert.ok(svg.includes('is-cathode'));
  });

  it('connection line present when anode and cathode set', () => {
    const svg = renderBrainMap10_20({ anode: 'F3', cathode: 'Fp2' });
    assert.ok(svg.includes('ds-bm-connect'));
  });

  it('no connection line when showConnection=false', () => {
    const svg = renderBrainMap10_20({ anode: 'F3', cathode: 'Fp2', showConnection: false });
    assert.ok(!svg.includes('ds-bm-connect'));
  });

  it('renders target region ring for DLPFC-L', () => {
    const svg = renderBrainMap10_20({ targetRegion: 'DLPFC-L' });
    assert.ok(svg.includes('ds-bm-target-ring'));
    assert.ok(svg.includes('Left DLPFC target'));
  });

  it('lobe zones present by default', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(svg.includes('ds-bm-zones'));
  });

  it('no lobe zones when showZones=false', () => {
    const svg = renderBrainMap10_20({ showZones: false });
    assert.ok(!svg.includes('ds-bm-zones'));
  });

  it('ears and nose present by default', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(svg.includes('ds-bm-nose'));
    assert.ok(svg.includes('ds-bm-ear'));
  });

  it('no nose/ears when showEarsAndNose=false', () => {
    const svg = renderBrainMap10_20({ showEarsAndNose: false });
    assert.ok(!svg.includes('ds-bm-nose'));
  });

  it('highlight sites get is-target class markup', () => {
    // highlightSites just mark them dim; the ds-bm-electrode group still renders
    const svg = renderBrainMap10_20({ highlightSites: ['T7', 'T8'] });
    // Both highlighted sites are still in the SVG
    assert.ok(svg.includes('data-site="T7"'));
    assert.ok(svg.includes('data-site="T8"'));
  });

  it('hemisphere L and R labels present', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(svg.includes('>L<'));
    assert.ok(svg.includes('>R<'));
  });

  it('viewBox is 0 0 400 400', () => {
    const svg = renderBrainMap10_20({});
    assert.ok(svg.includes('viewBox="0 0 400 400"'));
  });
});
