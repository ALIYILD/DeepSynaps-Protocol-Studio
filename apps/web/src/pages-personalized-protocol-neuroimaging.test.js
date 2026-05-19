// Tests for Category 4 PR-4 — neuroimaging evidence on the Personalized
// Protocol surface. The personalized-protocol route in app.js does NOT
// have its own page module; it sets window._psWizard.mode='personalized'
// and navigates into pgProtocolBuilderV2. So our contract here is:
//
//   * When window._psWizard.mode === 'personalized' AND a patient_id is
//     in scope, the neuroimaging panel defaults to patient-linked mode.
//   * In patient-linked mode the fetch hits /search-for-patient with the
//     patient_id in the body (never the URL).
//   * The patient-linked badge renders so the clinician can see at a
//     glance which endpoint the search will hit.
//
// Test runner: node:test.

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  resolveDefaultMode,
  createNeuroimagingEvidenceController,
  renderNeuroimagingEvidencePanel,
} from './protocol-neuroimaging-evidence.js';

function makeHost() {
  return { innerHTML: '' };
}

describe('personalized-protocol neuroimaging — patient-linked default', () => {
  it('resolveDefaultMode picks patient-linked when personalized routing + patientId', () => {
    const mode = resolveDefaultMode({ patientId: 'pat-7', wizardMode: 'personalized' });
    assert.strictEqual(mode, 'patient-linked');
  });

  it('panel renders the PATIENT-LINKED badge by default in personalized mode', () => {
    const html = renderNeuroimagingEvidencePanel({ mode: 'patient-linked', patientId: 'pat-7' });
    assert.ok(html.includes('PATIENT-LINKED'), 'badge must render');
    assert.ok(
      html.includes('data-testid="neuro-mode-badge"'),
      'mode badge must be addressable by test id',
    );
  });

  it('panel still exposes anonymous fallback toggle when patient-linked is default', () => {
    const html = renderNeuroimagingEvidencePanel({ mode: 'patient-linked', patientId: 'pat-7' });
    // Anonymous fallback button must remain visible per spec ("anonymous
    // mode remains available as a fallback").
    assert.ok(html.includes('Search catalog instead'));
  });

  it('controller wired with personalized routing fires /search-for-patient with patient_id in the body', async () => {
    const host = makeHost();
    const captured = { calls: [] };
    const ctrl = createNeuroimagingEvidenceController({
      patientId: 'pat-7',
      wizardMode: 'personalized',
      getQuery: () => ({ condition: 'MDD', modality: 'rTMS' }),
      onAttach: () => {},
      apiClient: {
        neuroimagingSearch: () => {
          throw new Error('anonymous endpoint must NOT be hit when default is patient-linked');
        },
        neuroimagingSearchForPatient: (pid, body) => {
          captured.calls.push({ pid, body });
          return Promise.resolve({
            results: [],
            source_status: [],
            warnings: [],
          });
        },
      },
    });
    ctrl.mount(host);

    // Assertion 1: state initialized in patient-linked mode.
    assert.strictEqual(ctrl.getState().mode, 'patient-linked');

    await ctrl.runSearch();

    // Assertion 2: exactly one patient-linked call, patient_id supplied.
    assert.strictEqual(captured.calls.length, 1);
    assert.strictEqual(captured.calls[0].pid, 'pat-7');
    assert.strictEqual(captured.calls[0].body.condition, 'MDD');
    assert.strictEqual(captured.calls[0].body.modality, 'rTMS');
  });

  it('clinician can fall back to anonymous mode and the next search hits /search', async () => {
    const host = makeHost();
    const calls = [];
    const ctrl = createNeuroimagingEvidenceController({
      patientId: 'pat-7',
      wizardMode: 'personalized',
      getQuery: () => ({ condition: 'MDD' }),
      onAttach: () => {},
      apiClient: {
        neuroimagingSearch: (body) => {
          calls.push(['anon', body]);
          return Promise.resolve({ results: [], source_status: [], warnings: [] });
        },
        neuroimagingSearchForPatient: (pid, body) => {
          calls.push(['patient', pid, body]);
          return Promise.resolve({ results: [], source_status: [], warnings: [] });
        },
      },
    });
    ctrl.mount(host);
    assert.strictEqual(ctrl.getState().mode, 'patient-linked');

    // Clinician toggles to anonymous fallback.
    ctrl.setMode('anonymous');
    assert.strictEqual(ctrl.getState().mode, 'anonymous');

    await ctrl.runSearch();
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0][0], 'anonymous'.slice(0, 4)); // 'anon'
  });

  it('attempting patient-linked mode without a patientId is a no-op on the controller', () => {
    const host = makeHost();
    const ctrl = createNeuroimagingEvidenceController({
      patientId: null,
      wizardMode: null,
      getQuery: () => ({}),
      onAttach: () => {},
      apiClient: {
        neuroimagingSearch: () => Promise.resolve({ results: [], source_status: [], warnings: [] }),
        neuroimagingSearchForPatient: () => {
          throw new Error('unreachable');
        },
      },
    });
    ctrl.mount(host);
    // Try to flip to patient-linked without a patientId — should remain anonymous.
    ctrl.setMode('patient-linked');
    assert.strictEqual(ctrl.getState().mode, 'anonymous');
  });
});
