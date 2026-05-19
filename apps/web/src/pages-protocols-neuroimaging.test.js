// Tests for Category 4 PR-4 — neuroimaging evidence affordance in
// the Protocol Builder surface. Exercises the helper module
// (protocol-neuroimaging-evidence.js) directly so we don't have to
// boot the full pages-protocols.js DOM tree just to assert behaviour.
//
// Test runner: node:test (see deepsynaps-web-test-runner-node-test.md).

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  DECISION_SUPPORT_DISCLAIMER,
  resolveDefaultMode,
  buildSearchPayload,
  runNeuroimagingSearch,
  toEvidenceRef,
  attachReferenceToProtocol,
  renderNeuroimagingEvidencePanel,
  createNeuroimagingEvidenceController,
} from './protocol-neuroimaging-evidence.js';

// ── resolveDefaultMode ────────────────────────────────────────────────────────

describe('resolveDefaultMode', () => {
  it('defaults to anonymous when no patient_id', () => {
    assert.strictEqual(resolveDefaultMode({}), 'anonymous');
  });
  it('defaults to anonymous when patient_id present but not in personalized routing', () => {
    assert.strictEqual(resolveDefaultMode({ patientId: 'p-1' }), 'anonymous');
  });
  it('defaults to patient-linked when patient_id + personalized routing', () => {
    assert.strictEqual(
      resolveDefaultMode({ patientId: 'p-1', wizardMode: 'personalized' }),
      'patient-linked',
    );
  });
});

// ── buildSearchPayload ────────────────────────────────────────────────────────

describe('buildSearchPayload', () => {
  it('strips empty/null fields', () => {
    const payload = buildSearchPayload({ condition: '', modality: 'fMRI-BOLD' });
    assert.deepStrictEqual(payload, { limit: 10, modality: 'fMRI-BOLD' });
  });
  it('honours coordinate triples only', () => {
    const ok = buildSearchPayload({ coordinate: [1, 2, 3] });
    assert.deepStrictEqual(ok.coordinate, [1, 2, 3]);
    const bad = buildSearchPayload({ coordinate: [1, 2] });
    assert.ok(!('coordinate' in bad), 'incomplete coordinate must be dropped');
  });
  it('passes through limit', () => {
    const payload = buildSearchPayload({ limit: 25 });
    assert.strictEqual(payload.limit, 25);
  });
});

// ── runNeuroimagingSearch ─────────────────────────────────────────────────────

describe('runNeuroimagingSearch', () => {
  it('calls neuroimagingSearch when mode is anonymous', async () => {
    const calls = [];
    const fakeClient = {
      neuroimagingSearch: (body) => {
        calls.push(['anon', body]);
        return Promise.resolve({ results: [], source_status: [], warnings: [] });
      },
      neuroimagingSearchForPatient: () => {
        throw new Error('must not be called in anonymous mode');
      },
    };
    await runNeuroimagingSearch({
      mode: 'anonymous',
      query: { condition: 'MDD' },
      apiClient: fakeClient,
    });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0], 'anon');
    assert.strictEqual(calls[0][1].condition, 'MDD');
  });

  it('calls neuroimagingSearchForPatient when mode is patient-linked', async () => {
    const calls = [];
    const fakeClient = {
      neuroimagingSearch: () => {
        throw new Error('must not be called in patient-linked mode');
      },
      neuroimagingSearchForPatient: (pid, body) => {
        calls.push(['patient', pid, body]);
        return Promise.resolve({ results: [], source_status: [], warnings: [] });
      },
    };
    await runNeuroimagingSearch({
      mode: 'patient-linked',
      patientId: 'pat-42',
      query: { condition: 'MDD' },
      apiClient: fakeClient,
    });
    assert.deepStrictEqual(calls, [['patient', 'pat-42', { limit: 10, condition: 'MDD' }]]);
  });

  it('throws when patient-linked mode is requested without a patientId', async () => {
    let threw = false;
    try {
      await runNeuroimagingSearch({
        mode: 'patient-linked',
        query: { condition: 'MDD' },
        apiClient: { neuroimagingSearch: () => {}, neuroimagingSearchForPatient: () => {} },
      });
    } catch (e) {
      threw = true;
      assert.match(e.message, /patient/i);
    }
    assert.ok(threw, 'patient-linked + no patientId must throw');
  });
});

// ── toEvidenceRef ─────────────────────────────────────────────────────────────

describe('toEvidenceRef', () => {
  it('stamps the decision-support disclaimer on every reference', () => {
    const ref = toEvidenceRef({
      source_id: 'neurovault',
      source_name: 'NeuroVault',
      record: { title: 'WM contrast', modality: 'fMRI-BOLD', source_id: '42' },
      provenance: { lifecycle_state: 'healthy' },
    });
    assert.strictEqual(ref.decision_support_disclaimer, DECISION_SUPPORT_DISCLAIMER);
    assert.strictEqual(ref.kind, 'neuroimaging');
    assert.strictEqual(ref.lifecycle_state, 'healthy');
  });
  it('returns null for malformed input', () => {
    assert.strictEqual(toEvidenceRef(null), null);
  });
});

// ── attachReferenceToProtocol ────────────────────────────────────────────────

describe('attachReferenceToProtocol', () => {
  it('appends a reference to neuroimagingRefs', () => {
    const ref = { source: 'neurovault', source_id: '42', title: 'WM' };
    const next = attachReferenceToProtocol({}, ref);
    assert.strictEqual(next.neuroimagingRefs.length, 1);
    assert.strictEqual(next.neuroimagingRefs[0], ref);
  });
  it('dedupes by (source, source_id)', () => {
    const ref = { source: 'neurovault', source_id: '42', title: 'WM' };
    const once = attachReferenceToProtocol({}, ref);
    const twice = attachReferenceToProtocol(once, ref);
    assert.strictEqual(twice.neuroimagingRefs.length, 1);
  });
  it('does not mutate the input state', () => {
    const seed = { neuroimagingRefs: [] };
    const ref = { source: 'openneuro', source_id: 'ds-x', title: 'X' };
    const next = attachReferenceToProtocol(seed, ref);
    assert.strictEqual(seed.neuroimagingRefs.length, 0, 'original must be unchanged');
    assert.strictEqual(next.neuroimagingRefs.length, 1);
  });
});

// ── renderNeuroimagingEvidencePanel ──────────────────────────────────────────

describe('renderNeuroimagingEvidencePanel', () => {
  it('renders the "Search neuroimaging evidence" button', () => {
    const html = renderNeuroimagingEvidencePanel({ mode: 'anonymous' });
    assert.ok(html.includes('Search neuroimaging evidence'), 'button label must render');
    assert.ok(html.includes('data-testid="neuro-search-btn"'));
  });
  it('inlines the decision-support disclaimer', () => {
    const html = renderNeuroimagingEvidencePanel({ mode: 'anonymous' });
    assert.ok(html.includes(DECISION_SUPPORT_DISCLAIMER));
    assert.ok(html.includes('data-testid="neuro-disclaimer"'));
  });
  it('shows the patient-linked badge when in patient-linked mode', () => {
    const html = renderNeuroimagingEvidencePanel({
      mode: 'patient-linked',
      patientId: 'p-1',
    });
    assert.ok(html.includes('PATIENT-LINKED'));
    assert.ok(html.includes('Search for this patient'));
  });
  it('shows the anonymous badge when in anonymous mode', () => {
    const html = renderNeuroimagingEvidencePanel({ mode: 'anonymous' });
    assert.ok(html.includes('ANONYMOUS'));
  });
  it('does not show the mode toggle when no patientId is in scope', () => {
    const html = renderNeuroimagingEvidencePanel({ mode: 'anonymous' });
    assert.ok(!html.includes('neuro-mode-toggle'));
  });
  it('renders result rows with lifecycle badges + attach buttons', () => {
    const html = renderNeuroimagingEvidencePanel({
      mode: 'anonymous',
      status: 'success',
      results: [
        {
          source_id: 'neurovault',
          source_name: 'NeuroVault',
          record: { title: 'WM contrast', modality: 'fMRI-BOLD', source_id: '42' },
          provenance: { lifecycle_state: 'healthy' },
        },
      ],
    });
    assert.ok(html.includes('WM contrast'));
    assert.ok(html.includes('Attach to protocol'));
    assert.ok(html.includes('data-testid="neuro-attach-0"'));
    assert.ok(html.includes('data-testid="neuro-lifecycle-0"'));
  });
  it('shows a clear empty state on success with no rows', () => {
    const html = renderNeuroimagingEvidencePanel({ mode: 'anonymous', status: 'success', results: [] });
    assert.ok(html.includes('data-testid="neuro-status-empty"'));
  });
});

// ── createNeuroimagingEvidenceController — drawer + fetch lifecycle ──────────

describe('createNeuroimagingEvidenceController', () => {
  function makeHost() {
    return { innerHTML: '' };
  }
  function makeFakeApi(results) {
    return {
      neuroimagingSearch: (body) =>
        Promise.resolve({ results, source_status: [], warnings: [], _calledWith: body, _endpoint: 'anonymous' }),
      neuroimagingSearchForPatient: (pid, body) =>
        Promise.resolve({ results, source_status: [], warnings: [], _calledWith: body, _endpoint: 'patient', _patient: pid }),
    };
  }

  it('mounts, renders idle state, then renders results after a search', async () => {
    const host = makeHost();
    const captured = { calls: [] };
    const ctrl = createNeuroimagingEvidenceController({
      patientId: null,
      wizardMode: null,
      getQuery: () => ({ condition: 'MDD' }),
      onAttach: () => {},
      apiClient: {
        neuroimagingSearch: (body) => {
          captured.calls.push(['anon', body]);
          return Promise.resolve({
            results: [
              {
                source_id: 'neurovault',
                source_name: 'NeuroVault',
                record: { title: 'MDD rTMS contrast', source_id: '7' },
                provenance: { lifecycle_state: 'healthy' },
              },
            ],
            source_status: [],
            warnings: [],
          });
        },
        neuroimagingSearchForPatient: () => {
          throw new Error('must not be called');
        },
      },
    });
    ctrl.mount(host);
    assert.ok(host.innerHTML.includes('data-testid="neuro-evidence-panel"'));
    assert.ok(host.innerHTML.includes('Search neuroimaging evidence'));

    await ctrl.runSearch();
    assert.ok(host.innerHTML.includes('MDD rTMS contrast'), 'result must render after search');
    assert.strictEqual(captured.calls.length, 1);
    assert.strictEqual(captured.calls[0][1].condition, 'MDD');
  });

  it('persists attached references into protocol state via onAttach', async () => {
    const host = makeHost();
    const attached = [];
    let state = { neuroimagingRefs: [] };
    const ctrl = createNeuroimagingEvidenceController({
      patientId: null,
      getQuery: () => ({ condition: 'MDD' }),
      onAttach: (ref) => {
        attached.push(ref);
        state = attachReferenceToProtocol(state, ref);
      },
      apiClient: makeFakeApi([
        {
          source_id: 'neurovault',
          source_name: 'NeuroVault',
          record: { title: 'attach-me', source_id: '99' },
          provenance: { lifecycle_state: 'healthy' },
        },
      ]),
    });
    ctrl.mount(host);
    await ctrl.runSearch();
    ctrl.attach(0);
    assert.strictEqual(attached.length, 1);
    assert.strictEqual(state.neuroimagingRefs.length, 1);
    assert.strictEqual(
      state.neuroimagingRefs[0].decision_support_disclaimer,
      DECISION_SUPPORT_DISCLAIMER,
      'attached reference MUST carry the disclaimer',
    );
  });

  it('renders an error message when the API call rejects', async () => {
    const host = makeHost();
    const ctrl = createNeuroimagingEvidenceController({
      patientId: null,
      getQuery: () => ({ condition: 'MDD' }),
      onAttach: () => {},
      apiClient: {
        neuroimagingSearch: () => Promise.reject(new Error('boom')),
        neuroimagingSearchForPatient: () => Promise.reject(new Error('boom')),
      },
    });
    ctrl.mount(host);
    await ctrl.runSearch();
    assert.ok(host.innerHTML.includes('data-testid="neuro-status-error"'));
    assert.ok(host.innerHTML.includes('boom'));
  });
});
