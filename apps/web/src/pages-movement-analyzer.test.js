/**
 * Movement Analyzer — clinician workflow and routing regression tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  applyMovementAnalyzerPatientContext,
  analyzerIdToNavPage,
  canUseMovementAnalyzerWorkspace,
  mergeMovementAuditItems,
  esc,
  pgMovementAnalyzer,
} from './pages-movement-analyzer.js';
import { api } from './api.js';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'https://example.test/movement-analyzer',
  });

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    FormData: globalThis.FormData,
    URL: globalThis.URL,
    HTMLAnchorElement: globalThis.HTMLAnchorElement,
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.FormData = dom.window.FormData;
  globalThis.HTMLAnchorElement = dom.window.HTMLAnchorElement;
  globalThis.URL = {
    ...dom.window.URL,
    createObjectURL: () => 'blob:test-movement',
    revokeObjectURL: () => {},
  };

  return {
    window: dom.window,
    restore() {
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.Event = previous.Event;
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.Node = previous.Node;
      globalThis.FormData = previous.FormData;
      globalThis.URL = previous.URL;
      globalThis.HTMLAnchorElement = previous.HTMLAnchorElement;
    },
  };
}

function stubApi(overrides = {}) {
  const saved = {
    me: api.me,
    listPatients: api.listPatients,
    getMovementProfile: api.getMovementProfile,
    getMovementAudit: api.getMovementAudit,
    addMovementAnnotation: api.addMovementAnnotation,
    ackMovementReview: api.ackMovementReview,
    recomputeMovement: api.recomputeMovement,
    exportMovementWorkspace: api.exportMovementWorkspace,
  };

  Object.assign(api, {
    me: async () => ({ role: 'clinician' }),
    listPatients: async () => ({ items: [] }),
    getMovementProfile: async () => null,
    getMovementAudit: async () => ({ items: [] }),
    addMovementAnnotation: async () => ({ ok: true }),
    ackMovementReview: async () => ({ ok: true }),
    recomputeMovement: async () => ({ ok: true }),
    exportMovementWorkspace: async () => ({ blob: new Blob(['{}'], { type: 'application/json' }), filename: 'movement.json' }),
    ...overrides,
  });

  return () => {
    Object.assign(api, saved);
  };
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function buildMovementProfile(patientId = 'pt-123') {
  return {
    patient_id: patientId,
    patient_name: 'Taylor Motion',
    schema_version: '1',
    generated_at: '2026-05-07T12:00:00Z',
    captured_at: '2026-05-07T11:30:00Z',
    clinical_disclaimer: 'Decision-support only; clinician interpretation required.',
    snapshot: {
      phenotype_summary: 'Movement cues suggest closer clinician review of gait and posture context.',
      overall_concern: 'moderate',
      overall_confidence: 0.61,
    },
    completeness: { overall: 0.72 },
    cross_modal_context: {},
    modalities: {
      bradykinesia: { score: 28, severity: 'amber', confidence: 0.62, contributing_factors: ['slowed tapping cadence'] },
      tremor: { score: 14, severity: 'green', confidence: 0.54, contributing_factors: ['no consistent tremor burst detected'] },
      gait: { score: 43, severity: 'amber', confidence: 0.67, contributing_factors: ['stride variability proxy'] },
      posture: { score: 56, severity: 'red', confidence: 0.71, contributing_factors: ['postural sway proxy'] },
      monitoring: { score: 32, severity: 'amber', confidence: 0.58, contributing_factors: ['passive movement variability'] },
    },
    prior_scores: [
      { modality: 'posture', score: 45, captured_at: '2026-05-01T10:00:00Z' },
      { modality: 'posture', score: 56, captured_at: '2026-05-07T11:30:00Z' },
    ],
    signal_sources: [
      { source_id: 'video-assessment', source_modality: 'video', last_received_at: '2026-05-07T11:30:00Z', confidence: 0.81, qc_flags: [] },
    ],
    flags: [
      { title: 'Posture cue elevated', detail: 'Review with exam and fall history.', confidence: 0.7 },
    ],
    source_video: {
      recording_id: 'rec-77',
      captured_at: '2026-05-07T11:30:00Z',
      duration_seconds: 93,
    },
    recommendations: [
      { kind: 'review', rationale: 'Correlate posture cue with exam and medication context.', priority: 'routine' },
    ],
    clinical_interpretation: {
      summary: 'Movement cues require correlation with exam findings.',
      hypotheses: [{ statement: 'Postural change may reflect medication or deconditioning.', caveat: 'Model cue only.' }],
    },
    multimodal_links: [
      { analyzer_id: 'deeptwin', label: 'DeepTwin', relation: 'Context review' },
    ],
    evidence_links: [
      { id: 'mv-rule-1', title: 'Movement governance note', source_type: 'rule', snippet: 'Review before acting.' },
    ],
    audit_tail: [],
  };
}

test('analyzerIdToNavPage maps backend analyzer ids to nav pages', () => {
  assert.equal(analyzerIdToNavPage('deeptwin'), 'deeptwin');
  assert.equal(analyzerIdToNavPage('clinician-wellness'), 'clinician-wellness');
  assert.equal(analyzerIdToNavPage('wearables'), 'wearables');
  assert.equal(analyzerIdToNavPage('unknown-module'), 'unknown-module');
});

test('mergeMovementAuditItems prefers dedicated audit GET response', () => {
  const profile = { audit_tail: [{ id: 't1', kind: 'annotation', message: 'tail' }] };
  const auditGet = { items: [{ id: 'g1', kind: 'recompute', message: 'get' }] };
  const merged = mergeMovementAuditItems(profile, auditGet);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'g1');
});

test('mergeMovementAuditItems falls back to audit_tail when GET empty', () => {
  const profile = { audit_tail: [{ id: 't1', kind: 'annotation', message: 'tail' }] };
  const merged = mergeMovementAuditItems(profile, { items: [] });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 't1');
});

test('esc escapes HTML', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
});

test('canUseMovementAnalyzerWorkspace allows clinician-like roles only', () => {
  assert.equal(canUseMovementAnalyzerWorkspace('clinician'), true);
  assert.equal(canUseMovementAnalyzerWorkspace('resident'), true);
  assert.equal(canUseMovementAnalyzerWorkspace('patient'), false);
  assert.equal(canUseMovementAnalyzerWorkspace('', { allowUnknown: true }), true);
  assert.equal(canUseMovementAnalyzerWorkspace('', { allowUnknown: false }), false);
});

test('applyMovementAnalyzerPatientContext seeds patient context for linked pages', () => {
  const win = {};
  applyMovementAnalyzerPatientContext('patient-analytics', 'pt-123', win);
  assert.equal(win._profilePatientId, 'pt-123');
  assert.equal(win._selectedPatientId, 'pt-123');
  assert.equal(win._paPatientId, 'pt-123');

  const win2 = {};
  applyMovementAnalyzerPatientContext('deeptwin', 'pt-456', win2);
  assert.equal(win2._deeptwinPatientId, 'pt-456');
});

test('pgMovementAnalyzer shows restricted workspace for non-clinician roles', async () => {
  const { restore } = installDom();
  const restoreApi = stubApi({
    me: async () => ({ role: 'patient' }),
  });

  try {
    await pgMovementAnalyzer(() => {}, () => {});
    const content = document.getElementById('content');
    assert.match(content.textContent, /clinician workspace/i);
    assert.match(content.textContent, /restricted to clinician-facing accounts/i);
  } finally {
    restoreApi();
    restore();
  }
});

test('pgMovementAnalyzer loads patient workspace and linked nav preserves patient context', async () => {
  const { window, restore } = installDom();
  const profile = buildMovementProfile('pt-123');
  const restoreApi = stubApi({
    listPatients: async () => ({ items: [{ id: 'pt-123', first_name: 'Taylor', last_name: 'Motion' }] }),
    getMovementProfile: async () => profile,
    getMovementAudit: async () => ({ patient_id: 'pt-123', items: [] }),
  });
  const navigateCalls = [];

  try {
    await pgMovementAnalyzer(() => {}, (page) => navigateCalls.push(page));
    await flush();

    const open = document.querySelector('[data-action="open-patient"]');
    assert.ok(open, 'expected clinic row open button');
    open.click();
    await flush();

    assert.match(document.getElementById('content').textContent, /clinician review acknowledgment/i);
    const deepTwinButton = document.querySelector('[data-action="nav-module"][data-nav-page="deeptwin"]');
    assert.ok(deepTwinButton, 'expected linked DeepTwin navigation button');
    deepTwinButton.click();

    assert.deepEqual(navigateCalls, ['deeptwin']);
    assert.equal(window._selectedPatientId, 'pt-123');
    assert.equal(window._profilePatientId, 'pt-123');
    assert.equal(window._deeptwinPatientId, 'pt-123');
  } finally {
    restoreApi();
    restore();
  }
});

test('pgMovementAnalyzer keeps empty annotation client-side and does not call api', async () => {
  const { restore } = installDom();
  const profile = buildMovementProfile('pt-123');
  let annotationCalls = 0;
  const restoreApi = stubApi({
    listPatients: async () => ({ items: [{ id: 'pt-123', first_name: 'Taylor', last_name: 'Motion' }] }),
    getMovementProfile: async () => profile,
    getMovementAudit: async () => ({ patient_id: 'pt-123', items: [] }),
    addMovementAnnotation: async () => {
      annotationCalls += 1;
      return { ok: true };
    },
  });

  try {
    await pgMovementAnalyzer(() => {}, () => {});
    await flush();
    document.querySelector('[data-action="open-patient"]').click();
    await flush();

    const form = document.querySelector('[data-annotation-form]');
    assert.ok(form, 'expected annotation form');
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    assert.equal(annotationCalls, 0);
    assert.match(form.textContent, /enter a clinical note before saving/i);
  } finally {
    restoreApi();
    restore();
  }
});

test('pgMovementAnalyzer review acknowledgment posts note and refreshes audit trail', async () => {
  const { restore } = installDom();
  const profile = buildMovementProfile('pt-123');
  const auditItems = [];
  const restoreApi = stubApi({
    listPatients: async () => ({ items: [{ id: 'pt-123', first_name: 'Taylor', last_name: 'Motion' }] }),
    getMovementProfile: async () => profile,
    getMovementAudit: async () => ({ patient_id: 'pt-123', items: auditItems.slice() }),
    ackMovementReview: async (_patientId, body) => {
      auditItems.unshift({
        id: 'audit-review-1',
        kind: 'review_ack',
        actor: 'Clinician Reviewer',
        message: body.note,
        created_at: '2026-05-07T12:05:00Z',
      });
      return { ok: true };
    },
  });

  try {
    await pgMovementAnalyzer(() => {}, () => {});
    await flush();
    document.querySelector('[data-action="open-patient"]').click();
    await flush();

    const form = document.querySelector('[data-review-ack-form]');
    assert.ok(form, 'expected review acknowledgement form');
    form.querySelector('textarea').value = 'Reviewed cues with exam; posture concern remains contextual only.';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    const content = document.getElementById('content').textContent;
    assert.match(content, /review ack/i);
    assert.match(content, /reviewed cues with exam/i);
  } finally {
    restoreApi();
    restore();
  }
});

test('pgMovementAnalyzer export failure shows wired retry action', async () => {
  const { window, restore } = installDom();
  const profile = buildMovementProfile('pt-123');
  let exportCalls = 0;
  const restoreApi = stubApi({
    listPatients: async () => ({ items: [{ id: 'pt-123', first_name: 'Taylor', last_name: 'Motion' }] }),
    getMovementProfile: async () => profile,
    getMovementAudit: async () => ({ patient_id: 'pt-123', items: [] }),
    exportMovementWorkspace: async () => {
      exportCalls += 1;
      throw new Error('export unavailable');
    },
  });

  try {
    await pgMovementAnalyzer(() => {}, () => {});
    await flush();
    document.querySelector('[data-action="open-patient"]').click();
    await flush();

    const exportBtn = document.querySelector('[data-action="export-json"]');
    exportBtn.click();
    await flush();

    let retry = document.querySelector('[data-inline-error="movement"] [data-action="retry"]');
    assert.ok(retry, 'expected inline retry after export failure');
    assert.match(document.getElementById('content').textContent, /export unavailable/i);
    assert.equal(exportCalls, 1);

    retry.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    await flush();

    retry = document.querySelector('[data-inline-error="movement"] [data-action="retry"]');
    assert.ok(retry, 'expected retry banner to reappear after second failure');
    assert.equal(exportCalls, 2);
  } finally {
    restoreApi();
    restore();
  }
});

test('pgMovementAnalyzer recompute failure shows wired retry action', async () => {
  const { window, restore } = installDom();
  const profile = buildMovementProfile('pt-123');
  let recomputeCalls = 0;
  const restoreApi = stubApi({
    listPatients: async () => ({ items: [{ id: 'pt-123', first_name: 'Taylor', last_name: 'Motion' }] }),
    getMovementProfile: async () => profile,
    getMovementAudit: async () => ({ patient_id: 'pt-123', items: [] }),
    recomputeMovement: async () => {
      recomputeCalls += 1;
      throw new Error('recompute unavailable');
    },
  });

  try {
    await pgMovementAnalyzer(() => {}, () => {});
    await flush();
    document.querySelector('[data-action="open-patient"]').click();
    await flush();

    const recomputeBtn = document.querySelector('[data-action="recompute"]');
    recomputeBtn.click();
    await flush();

    let retry = document.querySelector('[data-inline-error="movement"] [data-action="retry"]');
    assert.ok(retry, 'expected inline retry after recompute failure');
    assert.match(document.getElementById('content').textContent, /recompute unavailable/i);
    assert.equal(recomputeCalls, 1);

    retry.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
    await flush();

    retry = document.querySelector('[data-inline-error="movement"] [data-action="retry"]');
    assert.ok(retry, 'expected retry banner to reappear after second failure');
    assert.equal(recomputeCalls, 2);
  } finally {
    restoreApi();
    restore();
  }
});
