import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = new Map();
const byId = new Map();

function node(id = '') {
  return {
    id,
    innerHTML: '',
    className: '',
    style: {},
    dataset: {},
    children: [],
    value: '',
    addEventListener(type, cb) { listeners.set(`${id}:${type}`, cb); },
    appendChild(child) { this.children.push(child); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    remove() {},
  };
}

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, node(id));
      return byId.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement(tag) { return node(tag); },
    body: node('body'),
  };
}
// Node 25+ exposes a built-in `localStorage` getter that throws SecurityError
// unless --localstorage-file is set. Detect that and replace with an in-memory
// stub. Defer the access check inside try/catch since the getter throws.
{
  let needsStub = true;
  try {
    // Touch the property; built-in throws DOMException, which means we still
    // need to stub. If it returns a usable object (browser jsdom), keep it.
    needsStub = !globalThis.localStorage;
  } catch {
    needsStub = true;
  }
  if (needsStub) {
    const store = {};
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      },
    });
  }
}

const mod = await import('./evidence-intelligence.js');

test('EvidenceChip renders query payload and count label', () => {
  const query = mod.createEvidenceQueryForTarget({ patientId: 'pat-1', targetName: 'depression_risk' });
  const html = mod.EvidenceChip({ count: 27, evidenceLevel: 'high', label: 'High evidence', query });
  assert.match(html, /data-evidence-target="depression_risk"/);
  assert.match(html, /High evidence/);
});

test('EvidenceChip shows 0 papers explicitly', () => {
  const html = mod.EvidenceChip({ count: 0, evidenceLevel: 'low', label: 'No evidence yet' });
  assert.match(html, /0 papers/);
});

test('PatientEvidenceTab renders filters and empty loading state', () => {
  const html = mod.PatientEvidenceTab({ patientId: 'pat-1' });
  assert.match(html, /Evidence workspace/);
  assert.match(html, /data-evidence-search/);
  assert.match(html, /No evidence summaries yet/);
});

test('PatientEvidenceTab renders contradictory findings explicitly', () => {
  const html = mod.PatientEvidenceTab({
    patient_id: 'pat-1',
    highlights: [],
    by_score: [],
    by_protocol: [],
    by_modality: {},
    contradictory_findings: [
      {
        finding_id: 'f-contradict',
        label: 'Frontal Alpha Asymmetry',
        claim: 'Mixed literature signals in depression cohorts',
        target_name: 'frontal_alpha_asymmetry',
        context_type: 'biomarker',
        paper_count: 4,
        evidence_level: 'moderate',
      },
    ],
    saved_citations: [],
    compare_with_literature_phenotype: { summary: '', matched_tags: [] },
    evidence_used_in_report: [],
  });
  assert.match(html, /Conflicting evidence/);
  assert.match(html, /Frontal Alpha Asymmetry/);
  assert.match(html, /Mixed literature signals in depression cohorts/);
});

test('patient evidence workspace search keeps working after rerender', async () => {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  globalThis.setTimeout = (cb) => { cb(); return 1; };
  globalThis.clearTimeout = () => {};

  const host = {
    _html: '',
    _currentSearch: null,
    _currentChip: null,
    querySelectorAll(selector) {
      if (selector === '[data-evidence-target]') return this._currentChip ? [this._currentChip] : [];
      return [];
    },
    querySelector(selector) {
      if (selector === '[data-evidence-search]') return this._currentSearch;
      return null;
    },
  };

  const overview = {
    patient_id: 'pat-1',
    highlights: [
      { finding_id: 'f1', label: 'Depression Risk', claim: 'PHQ-9 support', target_name: 'depression_risk', context_type: 'risk_score', paper_count: 2, evidence_level: 'high' },
      { finding_id: 'f2', label: 'Hippocampal Atrophy', claim: 'MRI volume support', target_name: 'hippocampal_atrophy', context_type: 'biomarker', paper_count: 1, evidence_level: 'moderate' },
    ],
    by_score: [],
    by_protocol: [],
    by_modality: {},
    saved_citations: [],
    compare_with_literature_phenotype: { summary: '', matched_tags: [] },
    evidence_used_in_report: [],
  };

  const renderSearchNode = () => {
    const handlers = {};
    return {
      value: '',
      addEventListener(type, cb) { handlers[type] = cb; },
      dispatch(type) { handlers[type]?.(); },
    };
  };
  const renderChipNode = () => {
    return {
      getAttribute(name) { return name === 'data-evidence-target' ? 'depression_risk' : ''; },
      addEventListener() {},
    };
  };

  let renderCount = 0;
  Object.defineProperty(host, 'innerHTML', {
    configurable: true,
    get() { return this._html || ''; },
    set(v) {
      this._html = String(v);
      renderCount += 1;
      this._currentSearch = renderSearchNode();
      this._currentChip = renderChipNode();
    },
  });

  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/v1/evidence/patient/pat-1/overview')) {
      return { ok: true, status: 200, json: async () => overview };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    await mod.renderPatientEvidenceWorkspace('pat-1', host, {});
    const settledRenderCount = renderCount;
    assert.ok(settledRenderCount >= 2);

    const firstSearch = host._currentSearch;
    firstSearch.value = 'depression';
    firstSearch.dispatch('input');
    assert.equal(renderCount, settledRenderCount + 1);
    assert.match(host.innerHTML, /Depression Risk/);

    const secondSearch = host._currentSearch;
    secondSearch.value = 'hippocampal';
    secondSearch.dispatch('input');
    assert.equal(renderCount, settledRenderCount + 2);
    assert.match(host.innerHTML, /Hippocampal Atrophy/);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
});

test('filter summaries matches text and modality', () => {
  const rows = [
    { label: 'Depression Risk', claim: 'PHQ-9 and HRV support', target_name: 'depression_risk', context_type: 'risk_score', evidence_level: 'high' },
    { label: 'Hippocampal Atrophy', claim: 'MRI volume support', target_name: 'hippocampal_atrophy', context_type: 'biomarker', evidence_level: 'moderate' },
  ];
  const filtered = mod.filterEvidenceSummaries(rows, { search: 'hrv' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].target_name, 'depression_risk');
});

test('drawer rendering includes papers and save action', () => {
  const result = {
    finding_id: 'f1',
    claim: 'Decision support only claim',
    claim_type: 'prediction',
    target_name: 'depression_risk',
    patient_context_summary: 'PHQ-9 increased',
    confidence_score: 0.81,
    evidence_strength: 'high',
    literature_summary: 'Retrieved systematic review evidence.',
    recommended_caution: 'Decision support only.',
    top_drivers: [{ source_modality: 'Assessment', label: 'PHQ-9', value: '14', contribution_text: 'PHQ-9 increased' }],
    applicability: { overall_match: 'strongly_matched', score: 0.84, dimensions: [{ label: 'Diagnosis fit', match: 'strongly_matched', rationale: 'depression' }] },
    supporting_papers: [{ paper_id: 'p1', title: 'Depression biomarkers review', year: 2024, journal: 'J Test', study_type: 'systematic review', evidence_quality: 'high', abstract_snippet: 'PHQ-9 HRV EEG', relevance_note: 'Matches concepts', score_breakdown: { total: 0.9 } }],
    conflicting_papers: [],
    export_citations: [{ finding_id: 'f1', paper_id: 'p1', title: 'Depression biomarkers review', inline_citation: '(A, 2024)', reference: 'A. paper.', evidence_quality: 'high' }],
    provenance: { corpus: 'test', generated_at: 'now', source_paper_ids: ['p1'] },
  };
  const html = mod.EvidenceDrawer(result);
  assert.match(html, /Depression biomarkers review/);
  assert.match(html, /data-evidence-save="p1"/);
  assert.match(html, /Decision support only/);
  assert.match(html, /Source: test/);
});

test('PatientEvidenceTab renders source provenance label', () => {
  const html = mod.PatientEvidenceTab({
    patient_id: 'pat-1',
    highlights: [],
    by_score: [],
    by_protocol: [],
    by_modality: {},
    contradictory_findings: [],
    saved_citations: [],
    provenance: { corpus: 'bundled_fallback' },
    compare_with_literature_phenotype: { summary: '', matched_tags: [] },
    evidence_used_in_report: [],
  });
  assert.match(html, /Source: Bundled\/offline evidence snapshot/);
});

test('happy path opens drawer and saves citation into tab state', async () => {
  globalThis.fetch = async (url, opts = {}) => {
    if (String(url).includes('/api/v1/evidence/query')) {
      return { ok: true, status: 200, json: async () => ({
        finding_id: 'f1',
        claim: 'Decision support only depression risk claim',
        claim_type: 'prediction',
        target_name: 'depression_risk',
        patient_context_summary: 'PHQ-9 context',
        confidence_score: 0.8,
        evidence_strength: 'high',
        literature_summary: 'Top evidence summary.',
        recommended_caution: 'Decision support only.',
        top_drivers: [],
        applicability: { overall_match: 'partially_matched', score: 0.7, dimensions: [] },
        supporting_papers: [{ paper_id: 'p1', title: 'Top paper', evidence_quality: 'high', study_type: 'review', score_breakdown: { total: 0.9 } }],
        conflicting_papers: [],
        export_citations: [{ finding_id: 'f1', paper_id: 'p1', title: 'Top paper', inline_citation: '(A, 2024)', reference: 'A. Top paper.', evidence_quality: 'high' }],
        provenance: { corpus: 'test', generated_at: 'now', source_paper_ids: ['p1'] },
      }) };
    }
    if (String(url).includes('/api/v1/evidence/save-citation')) {
      assert.equal(opts.method, 'POST');
      return { ok: true, status: 201, json: async () => ({ id: 'saved-1', paper_id: 'p1', paper_title: 'Top paper' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  mod.initEvidenceDrawer({ patientId: 'pat-1' });
  await mod.openEvidenceDrawer(mod.createEvidenceQueryForTarget({ patientId: 'pat-1', targetName: 'depression_risk' }));
  assert.match(byId.get('ds-evidence-host').innerHTML, /Top paper/);
  await globalThis.fetch('/api/v1/evidence/save-citation', {
    method: 'POST',
    body: JSON.stringify({ patient_id: 'pat-1', finding_id: 'f1', paper_id: 'p1' }),
  });
});

test('save button failure restores button state and toasts error', async () => {
  let saveClick;
  const saveNode = {
    textContent: 'Save',
    disabled: false,
    getAttribute(name) { return name === 'data-evidence-save' ? 'p1' : ''; },
    addEventListener(type, cb) {
      if (type === 'click') saveClick = cb;
    },
  };
  const host = {
    id: 'ds-evidence-host',
    innerHTML: '',
    className: '',
    dataset: {},
    classList: { add() {}, remove() {} },
    querySelectorAll(selector) {
      if (selector === '[data-evidence-save]') return [saveNode];
      return [];
    },
    querySelector() { return null; },
  };
  byId.set('ds-evidence-host', host);

  const toasts = [];
  globalThis._dsToast = (payload) => { toasts.push(payload); };
  globalThis.fetch = async (url) => {
    if (String(url).includes('/api/v1/evidence/query')) {
      return { ok: true, status: 200, json: async () => ({
        finding_id: 'f1',
        claim: 'Decision support only depression risk claim',
        target_name: 'depression_risk',
        patient_context_summary: 'PHQ-9 context',
        confidence_score: 0.8,
        evidence_strength: 'high',
        literature_summary: 'Top evidence summary.',
        recommended_caution: 'Decision support only.',
        top_drivers: [],
        applicability: { overall_match: 'partially_matched', score: 0.7, dimensions: [] },
        supporting_papers: [{ paper_id: 'p1', title: 'Top paper', evidence_quality: 'high', study_type: 'review', score_breakdown: { total: 0.9 } }],
        conflicting_papers: [],
        export_citations: [{ finding_id: 'f1', paper_id: 'p1', title: 'Top paper', inline_citation: '(A, 2024)' }],
        provenance: { corpus: 'test', generated_at: 'now', source_paper_ids: ['p1'] },
      }) };
    }
    if (String(url).includes('/api/v1/evidence/save-citation')) {
      throw new Error('save failed');
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  try {
    mod.initEvidenceDrawer({ patientId: 'pat-1' });
    await mod.openEvidenceDrawer(mod.createEvidenceQueryForTarget({ patientId: 'pat-1', targetName: 'depression_risk' }));
    assert.equal(typeof saveClick, 'function');
    await saveClick();
    assert.equal(saveNode.disabled, false);
    assert.equal(saveNode.textContent, 'Save');
    assert.equal(toasts.at(-1)?.title, 'Evidence save failed');
  } finally {
    delete globalThis._dsToast;
  }
});
