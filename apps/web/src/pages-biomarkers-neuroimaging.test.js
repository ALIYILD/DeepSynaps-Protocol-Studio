// Tests for Category 4 PR-5 — biomarker → neuroimaging catalog cross-wire.
//
// Exercises the helper module (biomarker-neuroimaging-evidence.js) directly
// so we don't have to boot the full pages-biomarkers.js DOM tree just to
// assert behaviour. Mirrors the test pattern used in PR-4 for the
// Protocol Builder cross-wire.
//
// Test runner: node:test (see deepsynaps-web-test-runner-node-test.md).

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  DECISION_SUPPORT_DISCLAIMER,
  biomarkerToCondition,
  biomarkerToModality,
  biomarkerToRegion,
  buildBiomarkerSearchPayload,
  runBiomarkerNeuroimagingSearch,
  renderBiomarkerNeuroimagingPanel,
  createBiomarkerNeuroimagingController,
} from './biomarker-neuroimaging-evidence.js';

// ── Trivial mappers ───────────────────────────────────────────────────────────

describe('biomarkerToCondition', () => {
  it('returns first non-empty linked condition', () => {
    assert.strictEqual(
      biomarkerToCondition({ conditions: ['MDD', 'Anxiety'] }),
      'MDD',
    );
  });
  it('strips parenthetical qualifiers', () => {
    assert.strictEqual(
      biomarkerToCondition({ conditions: ['ADHD (inattentive)'] }),
      'ADHD',
    );
  });
  it('returns empty string when no conditions', () => {
    assert.strictEqual(biomarkerToCondition({ conditions: [] }), '');
    assert.strictEqual(biomarkerToCondition({}), '');
    assert.strictEqual(biomarkerToCondition(null), '');
  });
});

describe('biomarkerToModality', () => {
  it('maps qEEG groups to EEG', () => {
    assert.strictEqual(biomarkerToModality({ id: 'spectral-asymmetry' }), 'EEG');
    assert.strictEqual(biomarkerToModality({ id: 'erp' }), 'EEG');
    assert.strictEqual(biomarkerToModality({ id: 'tms-eeg' }), 'EEG');
  });
  it('returns null for non-imaging groups', () => {
    assert.strictEqual(biomarkerToModality({ id: 'inflammatory-endocrine' }), null);
    assert.strictEqual(biomarkerToModality({ id: 'autonomic-cardiac' }), null);
  });
  it('returns null for unknown group ids', () => {
    assert.strictEqual(biomarkerToModality({ id: 'made-up' }), null);
    assert.strictEqual(biomarkerToModality(null), null);
  });
});

describe('biomarkerToRegion', () => {
  it('maps recognisable 10-20 sites to anatomical region hints', () => {
    assert.strictEqual(
      biomarkerToRegion({ site: 'F3, F4 (linked-mastoid or average reference)' }),
      'left dorsolateral prefrontal cortex',
    );
  });
  it('returns null when no site token recognised', () => {
    assert.strictEqual(biomarkerToRegion({ site: 'Serum fasting' }), null);
    assert.strictEqual(biomarkerToRegion({}), null);
  });
});

// ── buildBiomarkerSearchPayload ──────────────────────────────────────────────

describe('buildBiomarkerSearchPayload', () => {
  it('strips empty fields and defaults limit', () => {
    const payload = buildBiomarkerSearchPayload(
      { conditions: [], site: '' },
      { id: 'inflammatory-endocrine' },
    );
    assert.deepStrictEqual(payload, { limit: 10 });
  });
  it('passes condition + modality + region together for qEEG markers', () => {
    const payload = buildBiomarkerSearchPayload(
      { conditions: ['MDD'], site: 'F3, F4' },
      { id: 'spectral-asymmetry' },
    );
    assert.deepStrictEqual(payload, {
      limit: 10,
      condition: 'MDD',
      modality: 'EEG',
      region: 'left dorsolateral prefrontal cortex',
    });
  });
});

// ── runBiomarkerNeuroimagingSearch ───────────────────────────────────────────

describe('runBiomarkerNeuroimagingSearch', () => {
  it('routes to /search (anonymous) when no patientId', async () => {
    const calls = [];
    const fakeFetch = (path, opts) => {
      calls.push([path, JSON.parse(opts.body)]);
      return Promise.resolve({ results: [], source_status: [], warnings: [] });
    };
    await runBiomarkerNeuroimagingSearch({
      marker: { conditions: ['MDD'], site: 'F3' },
      group: { id: 'spectral-asymmetry' },
      fetchImpl: fakeFetch,
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0], '/api/v1/neuroimaging/search');
    assert.strictEqual(calls[0][1].condition, 'MDD');
    assert.strictEqual(calls[0][1].modality, 'EEG');
    assert.ok(!('patient_id' in calls[0][1]), 'anonymous body must not carry patient_id');
  });

  it('routes to /search-for-patient and embeds patient_id when in scope', async () => {
    const calls = [];
    const fakeFetch = (path, opts) => {
      calls.push([path, JSON.parse(opts.body)]);
      return Promise.resolve({ results: [], source_status: [], warnings: [] });
    };
    await runBiomarkerNeuroimagingSearch({
      marker: { conditions: ['MDD'], site: 'F3' },
      group: { id: 'spectral-asymmetry' },
      patientId: 'pat-42',
      fetchImpl: fakeFetch,
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0], '/api/v1/neuroimaging/search-for-patient');
    assert.strictEqual(calls[0][1].patient_id, 'pat-42');
  });
});

// ── renderBiomarkerNeuroimagingPanel ─────────────────────────────────────────

describe('renderBiomarkerNeuroimagingPanel', () => {
  const marker = { name: 'FAA', conditions: ['MDD'], site: 'F3, F4' };
  const group = { id: 'spectral-asymmetry' };

  it('renders the search affordance and disclaimer in idle state', () => {
    const html = renderBiomarkerNeuroimagingPanel({ marker, group });
    assert.match(html, /data-testid="bm-neuro-evidence-panel"/);
    assert.match(html, /data-testid="bm-neuro-search-btn"/);
    assert.match(html, />Find related imaging</);
    assert.match(html, new RegExp(DECISION_SUPPORT_DISCLAIMER));
    // Single disclaimer per panel.
    const matches = html.match(new RegExp(DECISION_SUPPORT_DISCLAIMER, 'g')) || [];
    assert.strictEqual(matches.length, 1);
  });

  it('surfaces ANONYMOUS badge when no patient in scope', () => {
    const html = renderBiomarkerNeuroimagingPanel({ marker, group });
    assert.match(html, /data-testid="bm-neuro-mode-badge"[^>]*>ANONYMOUS</);
    assert.match(html, /Mode: Anonymous catalog/);
  });

  it('surfaces PATIENT-LINKED badge when patient in scope', () => {
    const html = renderBiomarkerNeuroimagingPanel({ marker, group, patientId: 'pat-42' });
    assert.match(html, /data-testid="bm-neuro-mode-badge"[^>]*>PATIENT-LINKED</);
    assert.match(html, /Mode: Patient-linked/);
  });

  it('exposes the resolved query chips so clinician can verify the search', () => {
    const html = renderBiomarkerNeuroimagingPanel({ marker, group });
    assert.match(html, /condition: MDD/);
    assert.match(html, /modality: EEG/);
    assert.match(html, /region: left dorsolateral prefrontal cortex/);
  });

  it('renders empty-state cleanly when success + no results', () => {
    const html = renderBiomarkerNeuroimagingPanel({
      marker, group, status: 'success', results: [],
    });
    assert.match(html, /data-testid="bm-neuro-empty"/);
    assert.match(html, /No related neuroimaging found/);
  });

  it('renders lifecycle badge + provenance per result row on success', () => {
    const html = renderBiomarkerNeuroimagingPanel({
      marker, group, status: 'success',
      results: [
        {
          source_name: 'Neurosynth',
          source_id: 'neurosynth',
          provenance: { lifecycle_state: 'healthy' },
          record: {
            title: 'MDD alpha asymmetry map',
            modality: 'fMRI-BOLD',
            coordinates: [-42.0, 18.5, 24.0],
            doi_or_pmid: '10.1000/x.y',
          },
        },
      ],
    });
    assert.match(html, /data-testid="bm-neuro-result-0"/);
    assert.match(html, /data-testid="bm-neuro-lifecycle-0"/);
    assert.match(html, />healthy</);
    assert.match(html, /MDD alpha asymmetry map/);
    assert.match(html, /MNI \[-42\.0, 18\.5, 24\.0\]/);
    assert.match(html, /Neurosynth/);
    assert.match(html, /10\.1000\/x\.y/);
  });

  it('surfaces error copy when status is error', () => {
    const html = renderBiomarkerNeuroimagingPanel({
      marker, group, status: 'error', errorMessage: 'adapter offline',
    });
    assert.match(html, /data-testid="bm-neuro-error"/);
    assert.match(html, /adapter offline/);
  });
});

// ── createBiomarkerNeuroimagingController ────────────────────────────────────

describe('createBiomarkerNeuroimagingController', () => {
  it('idle → loading → success transitions populate results', async () => {
    const fakeFetch = () => Promise.resolve({
      results: [
        {
          source_name: 'Neurosynth',
          provenance: { lifecycle_state: 'healthy' },
          record: { title: 'r1' },
        },
      ],
    });
    const ctrl = createBiomarkerNeuroimagingController({
      marker: { conditions: ['MDD'], site: 'F3' },
      group: { id: 'spectral-asymmetry' },
      fetchImpl: fakeFetch,
    });
    assert.strictEqual(ctrl.getState().status, 'idle');
    await ctrl.runSearch();
    const s = ctrl.getState();
    assert.strictEqual(s.status, 'success');
    assert.strictEqual(s.results.length, 1);
  });

  it('captures error message on failed search', async () => {
    const fakeFetch = () => Promise.reject(new Error('boom'));
    const ctrl = createBiomarkerNeuroimagingController({
      marker: { conditions: ['MDD'], site: 'F3' },
      group: { id: 'spectral-asymmetry' },
      fetchImpl: fakeFetch,
    });
    await ctrl.runSearch();
    const s = ctrl.getState();
    assert.strictEqual(s.status, 'error');
    assert.strictEqual(s.errorMessage, 'boom');
    assert.deepStrictEqual(s.results, []);
  });

  it('search routes to patient-linked endpoint when patientId present', async () => {
    const calls = [];
    const fakeFetch = (path, opts) => {
      calls.push([path, JSON.parse(opts.body)]);
      return Promise.resolve({ results: [] });
    };
    const ctrl = createBiomarkerNeuroimagingController({
      marker: { conditions: ['MDD'], site: 'F3' },
      group: { id: 'spectral-asymmetry' },
      patientId: 'pat-99',
      fetchImpl: fakeFetch,
    });
    await ctrl.runSearch();
    assert.strictEqual(calls[0][0], '/api/v1/neuroimaging/search-for-patient');
    assert.strictEqual(calls[0][1].patient_id, 'pat-99');
  });

  it('mount populates the host with the rendered panel and wires the window handler', async () => {
    const fakeFetch = () => Promise.resolve({ results: [] });
    const ctrl = createBiomarkerNeuroimagingController({
      marker: { conditions: ['MDD'], site: 'F3' },
      group: { id: 'spectral-asymmetry' },
      fetchImpl: fakeFetch,
    });
    const host = { innerHTML: '' };
    // Stand in for window so the helper has somewhere to bolt onto.
    const previousWindow = globalThis.window;
    globalThis.window = {};
    try {
      ctrl.mount(host);
      assert.match(host.innerHTML, /bm-neuro-evidence-panel/);
      assert.strictEqual(typeof globalThis.window._bmNeuroSearch, 'function');
      // Drive the awaitable search to confirm the host re-renders into the
      // success/empty branch. The window handler is fire-and-forget by
      // design (onclick), so we drive runSearch() directly here.
      await ctrl.runSearch();
      assert.match(host.innerHTML, /bm-neuro-empty/);
    } finally {
      globalThis.window = previousWindow;
    }
  });
});
