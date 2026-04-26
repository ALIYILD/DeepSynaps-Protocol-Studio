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
if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

const mod = await import('./evidence-intelligence.js');

test('EvidenceChip renders query payload and count label', () => {
  const query = mod.createEvidenceQueryForTarget({ patientId: 'pat-1', targetName: 'depression_risk' });
  const html = mod.EvidenceChip({ count: 27, evidenceLevel: 'high', label: 'High evidence', query });
  assert.match(html, /data-evidence-query=/);
  assert.match(html, /High evidence/);
  assert.match(html, /27 papers/);
});

test('PatientEvidenceTab renders filters and empty loading state', () => {
  const html = mod.PatientEvidenceTab({ patientId: 'pat-1' });
  assert.match(html, /Evidence workspace/);
  assert.match(html, /data-evidence-filter="modality"/);
  assert.match(html, /Loading evidence/);
});

test('filter summaries matches text and modality', () => {
  const rows = [
    { label: 'Depression Risk', claim: 'PHQ-9 and HRV support', target_name: 'depression_risk', context_type: 'risk_score', evidence_level: 'high' },
    { label: 'Hippocampal Atrophy', claim: 'MRI volume support', target_name: 'hippocampal_atrophy', context_type: 'biomarker', evidence_level: 'moderate' },
  ];
  const filtered = mod.filterEvidenceSummaries(rows, { search: 'hrv', modality: 'score' });
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
  assert.match(html, /data-evidence-save-paper="p1"/);
  assert.match(html, /Decision support only/);
});

test('happy path opens drawer and saves citation into tab state', async () => {
  byId.set('ds-evidence-drawer-root', node('ds-evidence-drawer-root'));
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
  assert.match(byId.get('ds-evidence-drawer-root').innerHTML, /Top paper/);
  await mod.saveCitationFromDrawer('p1');
  assert.match(byId.get('ds-evidence-drawer-root').innerHTML, /Saved/);
});
