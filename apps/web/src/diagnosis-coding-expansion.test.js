import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stand-in: only the surface the renderer actually touches.
function makeContainer() {
  return {
    innerHTML: '',
    dataset: {},
  };
}

const FIXTURE_PAYLOAD = Object.freeze({
  condition: 'depression',
  normalized_terms: ['depression', 'major depressive disorder'],
  synonyms: ['Mood Disorders'],
  mappings: {
    icd10: [{ code: 'F33.2', display: 'Major depressive disorder, severe' }],
    snomedct: [],
    mesh: [{ code: 'D003863', display: 'Depression' }],
    umls: [],
    ols: [{ code: 'MONDO:0002050', display: 'depressive disorder' }],
  },
  source_status: {
    icd10: { status: 'ok', available: true },
    snomedct: { status: 'degraded', available: false, reason: 'missing_license', message: 'SNOMED CT adapter requires a licensed Snowstorm endpoint. Set SNOMEDCT_SNOWSTORM_URL to enable.' },
    mesh: { status: 'ok', available: true },
    umls: { status: 'degraded', available: false, reason: 'missing_license', message: 'UMLS adapter requires a UTS API key. Set UMLS_API_KEY to enable.' },
    ols: { status: 'ok', available: true },
  },
  evidence_search_terms: ['depression', 'major depressive disorder', 'Mood Disorders'],
  warnings: [
    "Codes may not reflect the patient's actual diagnosis — coder review required.",
  ],
  decision_support_disclaimer:
    'Terminology expansion returns synonyms and source-backed cross-mappings to help literature and evidence search.',
});

test('renders empty state when condition is blank', async () => {
  const { renderTerminologyExpansionPanel } = await import('./diagnosis-coding-expansion.js');
  const c = makeContainer();
  await renderTerminologyExpansionPanel({ diagnosisQueryExpansion: async () => FIXTURE_PAYLOAD }, c, { condition: '' });
  assert.equal(c.dataset.state, 'empty');
  assert.match(c.innerHTML, /Enter a condition/);
});

test('renders ready state with mappings, statuses, evidence terms, and disclaimer', async () => {
  const { renderTerminologyExpansionPanel } = await import('./diagnosis-coding-expansion.js');
  const c = makeContainer();
  let captured = null;
  const fakeApi = {
    diagnosisQueryExpansion: async (payload) => {
      captured = payload;
      return FIXTURE_PAYLOAD;
    },
  };
  await renderTerminologyExpansionPanel(fakeApi, c, { condition: 'depression', targetWorkflow: 'evidence', limit: 3 });
  assert.deepEqual(captured, { condition: 'depression', target_workflow: 'evidence', limit: 3 });
  assert.equal(c.dataset.state, 'ready');
  assert.match(c.innerHTML, /Terminology expansion/);
  // Mappings:
  assert.match(c.innerHTML, /F33\.2/);
  assert.match(c.innerHTML, /Major depressive disorder, severe/);
  assert.match(c.innerHTML, /MONDO:0002050/);
  // Statuses:
  assert.match(c.innerHTML, /SNOMEDCT/);
  assert.match(c.innerHTML, /License required/);
  assert.match(c.innerHTML, /SNOMEDCT_SNOWSTORM_URL/);
  // Evidence search terms:
  assert.match(c.innerHTML, /Evidence search terms/);
  // Warnings:
  assert.match(c.innerHTML, /Codes may not reflect/);
  // Disclaimer pinning — must be present and rendered with the testid hook.
  assert.match(c.innerHTML, /data-testid="ds-terminology-disclaimer"/);
  assert.match(c.innerHTML, /Terminology expansion returns synonyms/);
});

test('renders error state when the API throws', async () => {
  const { renderTerminologyExpansionPanel } = await import('./diagnosis-coding-expansion.js');
  const c = makeContainer();
  const fakeApi = {
    diagnosisQueryExpansion: async () => {
      throw new Error('fetch failed');
    },
  };
  await renderTerminologyExpansionPanel(fakeApi, c, { condition: 'depression' });
  assert.equal(c.dataset.state, 'error');
  assert.match(c.innerHTML, /Terminology expansion failed/);
  assert.match(c.innerHTML, /fetch failed/);
});

test('escapes HTML in display text to prevent injection', async () => {
  const { renderTerminologyExpansionPanel } = await import('./diagnosis-coding-expansion.js');
  const c = makeContainer();
  const fakeApi = {
    diagnosisQueryExpansion: async () => ({
      ...FIXTURE_PAYLOAD,
      mappings: {
        ...FIXTURE_PAYLOAD.mappings,
        icd10: [{ code: 'F33.2', display: '<img src=x onerror=alert(1)>' }],
      },
    }),
  };
  await renderTerminologyExpansionPanel(fakeApi, c, { condition: 'depression' });
  assert.equal(c.innerHTML.includes('<img src=x'), false);
  assert.match(c.innerHTML, /&lt;img/);
});

test('does NOT introduce forbidden language beyond what the API returns', async () => {
  const { renderTerminologyExpansionPanel } = await import('./diagnosis-coding-expansion.js');
  const c = makeContainer();
  await renderTerminologyExpansionPanel(
    { diagnosisQueryExpansion: async () => FIXTURE_PAYLOAD },
    c,
    { condition: 'depression' }
  );
  const forbidden = [
    'is eligible',
    'is covered',
    'guaranteed reimbursement',
    'approved indication',
    'approved for treatment',
  ];
  for (const phrase of forbidden) {
    assert.equal(
      c.innerHTML.toLowerCase().includes(phrase),
      false,
      `Forbidden phrase '${phrase}' found in rendered panel HTML`
    );
  }
});
