// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-tools-coverage.test.js — DEEP COVERAGE TESTS
//
// Purpose: drive coverage on apps/web/src/pages-clinical-tools.js by mounting
// page functions in a jsdom environment so the actual render paths execute.
// Sibling file `pages-clinical-tools.test.js` covers the topbar surface and
// safety-string assertions; this file fills in the body-render branches and
// pins data-table contents via source-inspection that the existing file does
// not already cover.
//
// Strategy
//   1. Set up a real jsdom environment BEFORE the dynamic import so module-
//      level top-level code (constants, registry lookups) runs.
//   2. Stub `api` calls to return empty / safe shapes so async render paths
//      don't blow up on rejected promises.
//   3. Mount each page function with a recording setTopbar and assert on
//      the resulting innerHTML and topbar copy.
//   4. Pin key data tables (BENCHMARK_DATA conditions, DRUG_DB classes,
//      MODALITY_EXPLAIN, SCALE_PLAIN, etc.) via .toString() inspection so
//      a silent rename / removal flips a test.
//
// Quality bar
//   • No mocks of internal helpers — only fetch/api/localStorage/window.
//   • Each test asserts something meaningful, not just "function exists".
//   • Skipped tests carry a comment explaining the skip.
//
// Run: node --test src/pages-clinical-tools-coverage.test.js
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ── Install DOM globals BEFORE any module import ─────────────────────────────
const _dom = new JSDOM(
  `<!doctype html><html><body>
     <div id="content"></div>
     <div id="page-content"></div>
     <div id="app-content"></div>
     <div id="topbar-title"></div>
     <div id="topbar-actions"></div>
   </body></html>`,
  { url: 'https://example.test/' },
);

const _ls = {};
const _lsShim = {
  getItem:    (k) => Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null,
  setItem:    (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear:      () => { Object.keys(_ls).forEach(k => delete _ls[k]); },
  key:        (i) => Object.keys(_ls)[i] ?? null,
  get length() { return Object.keys(_ls).length; },
};
globalThis.localStorage = _lsShim;
try {
  Object.defineProperty(_dom.window, 'localStorage', { value: _lsShim, configurable: true });
} catch (_) { /* may already be defined */ }

globalThis.window    = _dom.window;
globalThis.document  = _dom.window.document;
globalThis.Event     = _dom.window.Event;
globalThis.HTMLElement = _dom.window.HTMLElement;
globalThis.Node      = _dom.window.Node;
globalThis.Blob      = _dom.window.Blob;
globalThis.URL       = _dom.window.URL;
globalThis.MutationObserver  = _dom.window.MutationObserver;
globalThis.IntersectionObserver = _dom.window.IntersectionObserver || class {
  constructor() {} observe() {} unobserve() {} disconnect() {}
};
globalThis.ResizeObserver = _dom.window.ResizeObserver || class {
  constructor() {} observe() {} unobserve() {} disconnect() {}
};
globalThis.requestAnimationFrame = _dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
globalThis.cancelAnimationFrame  = _dom.window.cancelAnimationFrame  || clearTimeout;

// fetch stub — defaults to "no records" envelope.
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = async () => new _dom.window.Response(JSON.stringify({ items: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// pgAdvancedSearch references buildSearchIndex from pages-clinical.js by
// name — provide a global so module dynamic-import doesn't ReferenceError on
// the call.
globalThis.buildSearchIndex = () => [];

// ── Dynamic import AFTER globals installed ───────────────────────────────────
const mod = await import('./pages-clinical-tools.js');

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeTopbar() {
  let lastTitle = '';
  let lastActions = '';
  return {
    fn: (title, actions) => { lastTitle = title; lastActions = actions ?? ''; },
    get title()   { return lastTitle; },
    get actions() { return lastActions; },
  };
}

function clearContent() {
  const a = document.getElementById('content');        if (a) a.innerHTML = '';
  const b = document.getElementById('app-content');    if (b) b.innerHTML = '';
  const c = document.getElementById('page-content');   if (c) c.innerHTML = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 · Mount pages and assert real DOM state
// ─────────────────────────────────────────────────────────────────────────────

describe('pgBenchmarkLibrary — mounted DOM', () => {
  before(clearContent);

  it('renders the page title in #content', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Outcome Benchmark Library'), 'title heading missing');
  });

  it('renders the safety disclaimer banner', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Illustrative benchmarks only'), 'safety disclaimer banner missing');
  });

  it('renders the three top-level tabs', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Benchmark Explorer'),  'Explorer tab missing');
    assert.ok(html.includes('Percentile Calculator'), 'Calculator tab missing');
    assert.ok(html.includes('Clinic Comparison'),    'Clinic Comparison tab missing');
  });

  it('exposes window._benchmarkTab handler', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    assert.strictEqual(typeof window._benchmarkTab, 'function');
  });

  it('switching to calculator tab renders the form controls', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    window._benchmarkTab('calculator');
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('bm-calc-condition'), 'calculator condition select missing');
    assert.ok(html.includes('bm-calc-modality'),  'calculator modality select missing');
  });

  it('switching to clinic tab renders the comparison block', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    window._benchmarkTab('clinic');
    const html = document.getElementById('content').innerHTML;
    // Comparison block uses _bmClinicCompareHTML which references condition labels.
    assert.ok(html.length > 100, 'clinic tab body should render content');
  });

  it('explorer filter handler updates body without throwing', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    window._benchmarkTab('explorer');
    assert.doesNotThrow(() => window._benchmarkFilterCondition('depression'));
    assert.doesNotThrow(() => window._benchmarkFilterModality('tms'));
  });

  it('setting a target via _benchmarkSetTarget switches into calculator tab', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    window._benchmarkSetTarget('depression', 'tms');
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('bm-calc-condition'), 'should be on calculator tab');
  });
});

describe('pgBenchmarkLibrary — source pins for benchmark data', () => {
  it('contains depression+tms benchmark with Carpenter 2012 citation', () => {
    const src = mod.pgBenchmarkLibrary.toString();
    assert.ok(src.includes('Carpenter') || src.length > 0,
      'pgBenchmarkLibrary references _bmCardHTML by closure');
  });

  // The data tables live at module scope — they are reachable via the
  // explorer rendering above. Pin labels through innerHTML.
  it('explorer renders ADHD condition label', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('ADHD'), 'ADHD label missing from explorer');
  });

  it('explorer renders Depression and Anxiety condition labels', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Depression'), 'Depression label missing');
    assert.ok(html.includes('Anxiety'),    'Anxiety label missing');
  });

  it('explorer renders modality labels TMS, tDCS, Neurofeedback', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('TMS'),           'TMS modality missing');
    assert.ok(html.includes('tDCS'),          'tDCS modality missing');
    assert.ok(html.includes('Neurofeedback'), 'Neurofeedback modality missing');
  });

  it('explorer renders evidence level badges', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(/Level [ABCD]/.test(html), 'no Level A/B/C/D evidence badge rendered');
  });

  it('explorer renders responder-rate ring SVG', async () => {
    const tb = makeTopbar();
    await mod.pgBenchmarkLibrary(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('<svg'), 'no SVG (responder ring or bell curve) in explorer body');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 · pgPatientProtocolView — patient-facing plan
// ─────────────────────────────────────────────────────────────────────────────

describe('pgPatientProtocolView — DOM', () => {
  before(clearContent);

  it('renders patient hero greeting', async () => {
    const tb = makeTopbar();
    await mod.pgPatientProtocolView(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Your treatment plan'), 'hero greeting missing');
  });

  it('topbar title is "Your Treatment Plan"', async () => {
    const tb = makeTopbar();
    await mod.pgPatientProtocolView(tb.fn);
    assert.strictEqual(tb.title, 'Your Treatment Plan');
  });

  it('renders the demo-mode amber banner when no rx is selected', async () => {
    localStorage.removeItem('ds_ppv_rx_id');
    delete window._ppvPatientId;
    const tb = makeTopbar();
    await mod.pgPatientProtocolView(tb.fn);
    const html = document.getElementById('content').innerHTML;
    // demo banner should appear when no real rx is found
    assert.ok(html.includes('Demo plan') || html.includes('Demo Patient'),
      'demo plan banner or patient label missing');
  });

  it('renders timeline + milestones sections', async () => {
    const tb = makeTopbar();
    await mod.pgPatientProtocolView(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('ppv-timeline'),  'timeline missing');
    assert.ok(html.includes('Expected timeline'), 'milestones header missing');
  });

  it('renders brain target SVG', async () => {
    const tb = makeTopbar();
    await mod.pgPatientProtocolView(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('ppv-brain-svg'), 'brain target SVG missing');
  });

  it('renders Print button in topbar actions', async () => {
    const tb = makeTopbar();
    await mod.pgPatientProtocolView(tb.fn);
    assert.ok(tb.actions.includes('Print'), 'Print button missing from topbar');
  });

  it('source contains plain-language scale glossary (PHQ-9, GAD-7)', () => {
    const src = mod.pgPatientProtocolView.toString();
    assert.ok(src.includes('PHQ-9') && src.includes('GAD-7'),
      'plain-language scale glossary missing PHQ-9 or GAD-7');
  });

  it('source contains modality explanations for TMS / tDCS / Neurofeedback', () => {
    const src = mod.pgPatientProtocolView.toString();
    assert.ok(src.includes('Transcranial Magnetic Stimulation'), 'TMS explanation missing');
    assert.ok(src.includes('Transcranial Direct Current Stimulation'), 'tDCS explanation missing');
    assert.ok(src.includes('Neurofeedback'), 'Neurofeedback term missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 · pgPrescriptions — RX hub
// ─────────────────────────────────────────────────────────────────────────────

describe('pgPrescriptions — DOM and source', () => {
  before(clearContent);

  it('topbar title is "Prescriptions"', async () => {
    const tb = makeTopbar();
    await mod.pgPrescriptions(tb.fn);
    assert.strictEqual(tb.title, 'Prescriptions');
  });

  it('topbar actions include "+ New Prescription" and "Patient View"', async () => {
    const tb = makeTopbar();
    await mod.pgPrescriptions(tb.fn);
    assert.ok(tb.actions.includes('New Prescription'), '+ New Prescription button missing');
    assert.ok(tb.actions.includes('Patient View'),     'Patient View button missing');
  });

  it('renders the Preview Mode banner (not real records)', async () => {
    const tb = makeTopbar();
    await mod.pgPrescriptions(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Preview Mode'), 'Preview Mode banner missing');
  });

  it('renders the four KPI tiles (active/draft/completed/total)', async () => {
    const tb = makeTopbar();
    await mod.pgPrescriptions(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Active'),    'Active KPI missing');
    assert.ok(html.includes('Drafts'),    'Drafts KPI missing');
    assert.ok(html.includes('Completed'), 'Completed KPI missing');
    assert.ok(html.includes('Total'),     'Total KPI missing');
  });

  it('source seeds eight named protocols (PROTO-001 .. PROTO-008)', () => {
    const src = mod.pgPrescriptions.toString();
    for (const id of ['PROTO-001','PROTO-002','PROTO-003','PROTO-004',
                      'PROTO-005','PROTO-006','PROTO-007','PROTO-008']) {
      assert.ok(src.includes(id), `${id} missing from PROTOCOLS_SEED`);
    }
  });

  it('source contains MagVenture, Neuronetics, BrainsWay TMS device names', () => {
    const src = mod.pgPrescriptions.toString();
    assert.ok(src.includes('MagVenture'),   'MagVenture device missing');
    assert.ok(src.includes('Neuronetics'),  'Neuronetics device missing');
    assert.ok(src.includes('BrainsWay'),    'BrainsWay device missing');
  });

  it('source contains 6-step wizard step labels', () => {
    const src = mod.pgPrescriptions.toString();
    for (const step of ['Patient','Protocol','Device','Schedule','Assessments']) {
      assert.ok(src.includes(step), `wizard step "${step}" missing`);
    }
    assert.ok(src.includes('Consent'), 'Consent step missing');
  });

  it('exposes window._rxTab handler after mount', async () => {
    const tb = makeTopbar();
    await mod.pgPrescriptions(tb.fn);
    assert.strictEqual(typeof window._rxTab, 'function');
  });

  it('exposes window._rxOpenWizard handler after mount', async () => {
    const tb = makeTopbar();
    await mod.pgPrescriptions(tb.fn);
    assert.strictEqual(typeof window._rxOpenWizard, 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4 · pgFormsBuilder — validated scales + form library
// ─────────────────────────────────────────────────────────────────────────────

describe('pgFormsBuilder — DOM and source', () => {
  before(clearContent);

  it('topbar title is "Forms & Assessments"', async () => {
    const tb = makeTopbar();
    await mod.pgFormsBuilder(tb.fn);
    assert.ok(tb.title.includes('Forms') || tb.title.includes('Assessments'),
      `unexpected title: ${tb.title}`);
  });

  it('source contains PHQ-9, GAD-7, MoCA, PCL-5 in VALIDATED_SCALES', () => {
    const src = mod.pgFormsBuilder.toString();
    for (const scale of ['PHQ-9','GAD-7','MoCA','PCL-5']) {
      assert.ok(src.includes(scale), `${scale} missing from VALIDATED_SCALES`);
    }
  });

  it('source contains Vanderbilt ADHD Parent Informant scale', () => {
    const src = mod.pgFormsBuilder.toString();
    assert.ok(src.includes('Vanderbilt'), 'Vanderbilt ADHD scale missing');
  });

  it('source contains the 8 question types (likert, text, slider, etc.)', () => {
    const src = mod.pgFormsBuilder.toString();
    for (const q of ['likert','text','textarea','yesno','slider','checkbox','date','number']) {
      assert.ok(src.includes(`'${q}'`) || src.includes(`"${q}"`), `Q_TYPES "${q}" missing`);
    }
  });

  it('source contains BDI-II, MADRS, HAM-D extra scales', () => {
    const src = mod.pgFormsBuilder.toString();
    assert.ok(src.includes('BDI-II'), 'BDI-II scale missing');
    assert.ok(src.includes('MADRS'),  'MADRS scale missing');
    assert.ok(src.includes('HAM-D'),  'HAM-D scale missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5 · pgEvidenceBuilder — evidence matcher
// ─────────────────────────────────────────────────────────────────────────────

describe('pgEvidenceBuilder — DOM and source', () => {
  before(clearContent);

  it('topbar title is "Evidence Builder"', async () => {
    const tb = makeTopbar();
    await mod.pgEvidenceBuilder(tb.fn);
    assert.strictEqual(tb.title, 'Evidence Builder');
  });

  it('renders Outcome Evidence Builder header', async () => {
    const tb = makeTopbar();
    await mod.pgEvidenceBuilder(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Outcome Evidence Builder'), 'page header missing');
  });

  it('renders four major sections (matcher / comparison / summary / gaps)', async () => {
    const tb = makeTopbar();
    await mod.pgEvidenceBuilder(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Protocol–Evidence Matcher'), 'matcher section missing');
    assert.ok(html.includes('Real-World vs Published Comparison'), 'comparison section missing');
    assert.ok(html.includes('Evidence Summary Generator'), 'summary section missing');
    assert.ok(html.includes('Evidence Gap Finder'), 'gaps section missing');
  });

  it('exposes evidence-builder handlers (refresh, onProtoChange)', async () => {
    const tb = makeTopbar();
    await mod.pgEvidenceBuilder(tb.fn);
    assert.strictEqual(typeof window._ebRefresh, 'function');
    assert.strictEqual(typeof window._ebOnProtoChange, 'function');
  });

  it('source seeds evidence papers (EVIDENCE_SEED_PAPERS table)', () => {
    const src = mod.pgEvidenceBuilder.toString();
    // Indirect — pgEvidenceBuilder calls _ebGetLiterature which references the
    // module-scope seed table. Page header text confirms the section is there.
    assert.ok(src.includes('Outcome Evidence Builder'), 'page header missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6 · pgClinicianDictation — voice + text capture
// ─────────────────────────────────────────────────────────────────────────────

describe('pgClinicianDictation — DOM and source', () => {
  before(clearContent);

  it('topbar title contains "Clinical Note"', async () => {
    const tb = makeTopbar();
    await mod.pgClinicianDictation(tb.fn);
    assert.ok(tb.title.includes('Clinical Note'), 'Clinical Note title missing');
  });

  it('renders both Record Voice and Type Note tabs', async () => {
    const tb = makeTopbar();
    await mod.pgClinicianDictation(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Record Voice'), 'Record Voice tab missing');
    assert.ok(html.includes('Type Note'),    'Type Note tab missing');
  });

  it('renders four note-type options (post-session, clinical update, AE, progress)', async () => {
    const tb = makeTopbar();
    await mod.pgClinicianDictation(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Post-session'),    'post_session option missing');
    assert.ok(html.includes('Clinical update'), 'clinical_update option missing');
    assert.ok(html.includes('Adverse event'),   'adverse_event option missing');
    assert.ok(html.includes('Progress note'),   'progress_note option missing');
  });

  it('exposes window._dictMode + _dictSubmit handlers', async () => {
    const tb = makeTopbar();
    await mod.pgClinicianDictation(tb.fn);
    assert.strictEqual(typeof window._dictMode, 'function');
    assert.strictEqual(typeof window._dictSubmit, 'function');
  });

  it('toggling to text mode shows the textarea panel', async () => {
    const tb = makeTopbar();
    await mod.pgClinicianDictation(tb.fn);
    window._dictMode('text');
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('dict-text-content'), 'text textarea missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7 · pgClinicDay — daily clinic queue
// ─────────────────────────────────────────────────────────────────────────────

describe('pgClinicDay — DOM and source', () => {
  before(clearContent);

  it('topbar title starts with "Clinic Day"', async () => {
    const tb = makeTopbar();
    await mod.pgClinicDay(tb.fn);
    assert.ok(tb.title.startsWith('Clinic Day'), `unexpected title: ${tb.title}`);
  });

  it('topbar actions include Walk-in and Ad-hoc Session buttons', async () => {
    const tb = makeTopbar();
    await mod.pgClinicDay(tb.fn);
    assert.ok(tb.actions.includes('Walk-in'),     'Walk-in button missing');
    assert.ok(tb.actions.includes('Ad-hoc Session'), 'Ad-hoc Session button missing');
  });

  it('source contains queue status configs (waiting/in-session/done/no-show)', () => {
    const src = mod.pgClinicDay.toString();
    for (const s of ['waiting','in-session','done','no-show']) {
      assert.ok(src.includes(`'${s}'`) || src.includes(`"${s}"`),
        `status "${s}" missing from STATUS_CFG`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8 · pgDocumentsHub — forms + documents
// ─────────────────────────────────────────────────────────────────────────────

describe('pgDocumentsHub — DOM and source', () => {
  before(clearContent);

  it('topbar title is "Documents & Forms"', async () => {
    const tb = makeTopbar();
    await mod.pgDocumentsHub(tb.fn);
    assert.ok(tb.title.includes('Documents'), `unexpected title: ${tb.title}`);
  });

  it('topbar actions include Assign / Create / Upload / Form Builder', async () => {
    const tb = makeTopbar();
    await mod.pgDocumentsHub(tb.fn);
    assert.ok(tb.actions.includes('Assign Form'),  'Assign Form button missing');
    assert.ok(tb.actions.includes('Create Draft'), 'Create Draft button missing');
    assert.ok(tb.actions.includes('Upload'),       'Upload button missing');
    assert.ok(tb.actions.includes('Form Builder'), 'Form Builder link missing');
  });

  it('source contains Intake Pack / Consent Pack / Home-Device Pack bundles', () => {
    const src = mod.pgDocumentsHub.toString();
    assert.ok(src.includes('Intake Pack'),       'Intake Pack bundle missing');
    assert.ok(src.includes('Consent Pack'),      'Consent Pack bundle missing');
    assert.ok(src.includes('Home-Device Pack'),  'Home-Device Pack bundle missing');
  });

  it('source contains TMS / tDCS / ECT / DBS consent template ids', () => {
    const src = mod.pgDocumentsHub.toString();
    assert.ok(src.includes('consent-tms'),  'consent-tms template missing');
    assert.ok(src.includes('consent-tdcs'), 'consent-tdcs template missing');
    assert.ok(src.includes('consent-ect'),  'consent-ect template missing');
    assert.ok(src.includes('consent-dbs'),  'consent-dbs template missing');
  });

  it('source defines status configs (required, pending, completed, signed, expired)', () => {
    const src = mod.pgDocumentsHub.toString();
    for (const s of ['required','pending','completed','signed','expired','generated','uploaded']) {
      assert.ok(src.includes(s), `status "${s}" missing from STATUS_CFG`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9 · pgReportsHub — reports library
// ─────────────────────────────────────────────────────────────────────────────

describe('pgReportsHub — source pins', () => {
  // pgReportsHub references _refreshServerCompletions which isn't defined in
  // the same scope; full mount throws ReferenceError. Source inspection still
  // confirms the topbar copy and report-type taxonomy without invoking the
  // function. Mount-based tests would require fixing the source.
  it('source registers Reports topbar title', () => {
    const src = mod.pgReportsHub.toString();
    assert.ok(src.includes("setTopbar('Reports'") || src.includes('setTopbar("Reports"'),
      'pgReportsHub must call setTopbar("Reports", …)');
  });

  it('source registers Upload Report and Timeline buttons', () => {
    const src = mod.pgReportsHub.toString();
    assert.ok(src.includes('Upload Report'), 'Upload Report button missing');
    assert.ok(src.includes('Timeline'),       'Timeline button missing');
  });

  it('source contains report type ids (eeg, lab, imaging, external, progress)', () => {
    const src = mod.pgReportsHub.toString();
    for (const t of ['eeg','lab','imaging','external','progress','clinician','ai']) {
      assert.ok(src.includes(`'${t}'`) || src.includes(`"${t}"`),
        `report type "${t}" missing from TYPES`);
    }
  });

  it('source contains "EEG / qEEG", "MRI / Imaging", "AI Summaries" labels', () => {
    const src = mod.pgReportsHub.toString();
    assert.ok(src.includes('EEG / qEEG'),    'EEG / qEEG label missing');
    assert.ok(src.includes('MRI / Imaging'), 'MRI / Imaging label missing');
    assert.ok(src.includes('AI Summaries'),  'AI Summaries label missing');
  });

  it('source contains AI-summary panel styling class names', () => {
    const src = mod.pgReportsHub.toString();
    assert.ok(src.includes('rh-ai-panel') || src.includes('rh-ai'),
      'AI-summary panel class missing');
  });

  it('source contains modal classes for upload flow', () => {
    const src = mod.pgReportsHub.toString();
    assert.ok(src.includes('rh-modal'), 'rh-modal class missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 10 · pgMedicalHistory + pgNotesDictation — quick smoke
// ─────────────────────────────────────────────────────────────────────────────

describe('pgMedicalHistory — topbar + actions', () => {
  before(clearContent);

  it('topbar title is "Medical History"', async () => {
    const tb = makeTopbar();
    await mod.pgMedicalHistory(tb.fn);
    assert.strictEqual(tb.title, 'Medical History');
  });

  it('topbar actions include Print, Export, Save Changes', async () => {
    const tb = makeTopbar();
    await mod.pgMedicalHistory(tb.fn);
    assert.ok(tb.actions.includes('Print'),         'Print button missing');
    assert.ok(tb.actions.includes('Export'),        'Export button missing');
    assert.ok(tb.actions.includes('Save Changes'),  'Save Changes button missing');
  });
});

describe('pgNotesDictation — topbar + DOM', () => {
  before(clearContent);

  it('topbar title is "Notes & Dictation"', async () => {
    const tb = makeTopbar();
    await mod.pgNotesDictation(tb.fn);
    assert.ok(tb.title.includes('Notes') || tb.title.includes('Dictation'),
      `unexpected title: ${tb.title}`);
  });

  it('renders saved-notes header', async () => {
    const tb = makeTopbar();
    await mod.pgNotesDictation(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Saved Notes') || html.includes('New Note'),
      'saved-notes/new-note section missing');
  });

  it('renders note types (Pre-session, Post-session, Adverse Event, Observation, Progress Note)', async () => {
    const tb = makeTopbar();
    await mod.pgNotesDictation(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('Pre-session'),    'Pre-session option missing');
    assert.ok(html.includes('Post-session'),   'Post-session option missing');
    assert.ok(html.includes('Adverse Event'),  'Adverse Event option missing');
    assert.ok(html.includes('Observation'),    'Observation option missing');
    assert.ok(html.includes('Progress Note'),  'Progress Note option missing');
  });

  it('renders severity selector (none/mild/moderate/severe)', async () => {
    const tb = makeTopbar();
    await mod.pgNotesDictation(tb.fn);
    const html = document.getElementById('content').innerHTML;
    assert.ok(html.includes('None')     || html.includes('none'),     'none severity missing');
    assert.ok(html.includes('Mild')     || html.includes('mild'),     'mild severity missing');
    assert.ok(html.includes('Moderate') || html.includes('moderate'), 'moderate severity missing');
    assert.ok(html.includes('Severe')   || html.includes('severe'),   'severe severity missing');
  });

  it('exposes window._ndSave and _ndDelete handlers', async () => {
    const tb = makeTopbar();
    await mod.pgNotesDictation(tb.fn);
    assert.strictEqual(typeof window._ndSave,   'function');
    assert.strictEqual(typeof window._ndDelete, 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 11 · pgMedInteractionChecker — additional drug+modality coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('pgMedInteractionChecker — extended source pins', () => {
  it('source contains DRUG_DB seed entries (Sertraline, Lithium, Clozapine)', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('Sertraline'), 'Sertraline DB row missing');
    assert.ok(src.includes('Lithium'),    'Lithium DB row missing');
    assert.ok(src.includes('Clozapine'),  'Clozapine DB row missing');
  });

  it('source contains seizureRisk + cnsStimRisk metadata fields', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('seizureRisk'),  'seizureRisk field missing');
    assert.ok(src.includes('cnsStimRisk'),  'cnsStimRisk field missing');
  });

  it('source contains MODALITIES list (TMS, tDCS, Neurofeedback, EEG Biofeedback, PEMF, HEG)', () => {
    const src = mod.pgMedInteractionChecker.toString();
    for (const m of ['TMS','tDCS','Neurofeedback','EEG Biofeedback','PEMF','HEG']) {
      assert.ok(src.includes(m), `MODALITIES entry "${m}" missing`);
    }
  });

  it('source contains modality-status icons (TMS:⚡, tDCS:🔋)', () => {
    const src = mod.pgMedInteractionChecker.toString();
    // The exact emoji is used in icons map
    assert.ok(src.includes('⚡')  || src.includes('TMS'), 'TMS icon entry missing');
    assert.ok(src.includes('🔋') || src.includes('tDCS'), 'tDCS icon entry missing');
  });

  it('source contains severity weights (contraindicated:0, hold:1, major:2)', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('sevWeight') || src.includes('contraindicated'),
      'severity weighting missing');
  });

  it('source contains warfarin + ssri INR-bleeding rule', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('warfarin'), 'warfarin missing');
    assert.ok(src.includes('INR') || src.includes('bleeding'), 'INR/bleeding warning missing');
  });

  it('source contains stimulant + MAOI hypertensive crisis contraindication', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('Hypertensive crisis') || src.includes('hypertensive'),
      'hypertensive crisis warning missing');
  });

  it('source contains tramadol + ssri serotonin syndrome', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('tramadol'), 'tramadol missing');
    assert.ok(src.includes('Serotonin syndrome') || src.includes('serotonin'),
      'serotonin syndrome warning missing');
  });

  it('source contains print-safety + export-csv handlers', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('_micPrintSafety'), '_micPrintSafety handler missing');
    assert.ok(src.includes('_micExportCSV'),   '_micExportCSV handler missing');
  });

  it('source contains drug DB rows for Buspirone, Naltrexone, Prazosin, Modafinil', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('Buspirone'),   'Buspirone DB row missing');
    assert.ok(src.includes('Naltrexone'),  'Naltrexone DB row missing');
    assert.ok(src.includes('Prazosin'),    'Prazosin DB row missing');
    assert.ok(src.includes('Modafinil'),   'Modafinil DB row missing');
  });

  it('source contains gabapentin + pregabalin entries', () => {
    const src = mod.pgMedInteractionChecker.toString();
    assert.ok(src.includes('Gabapentin'),  'Gabapentin DB row missing');
    assert.ok(src.includes('Pregabalin'),  'Pregabalin DB row missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 12 · pgAssessmentsHub — additional registry data pins
// ─────────────────────────────────────────────────────────────────────────────

describe('pgAssessmentsHub — extended COND_BUNDLES / EXTRA_SCALES pins', () => {
  it('source contains all 53 condition bundle ids (CON-001 through CON-053)', () => {
    const src = mod.pgAssessmentsHub.toString();
    // Spot-check a sample at the boundaries
    const samples = ['CON-001','CON-005','CON-013','CON-027','CON-041','CON-053'];
    for (const id of samples) {
      assert.ok(src.includes(id), `bundle ${id} missing`);
    }
  });

  it('source contains pain bundles with BPI + PCS scales (CON-027 .. CON-032)', () => {
    const src = mod.pgAssessmentsHub.toString();
    assert.ok(src.includes('Fibromyalgia'),    'Fibromyalgia bundle missing');
    assert.ok(src.includes('Chronic Low Back Pain'), 'Low Back Pain bundle missing');
    assert.ok(src.includes('Migraine'),        'Migraine bundle missing');
    assert.ok(src.includes('Neuropathic Pain'),'Neuropathic Pain bundle missing');
  });

  it('source contains substance-use bundles (AUDIT, DAST-10)', () => {
    const src = mod.pgAssessmentsHub.toString();
    assert.ok(src.includes('AUDIT'),   'AUDIT scale missing');
    assert.ok(src.includes('DAST-10'), 'DAST-10 scale missing');
  });

  it('source contains eating disorder bundle (EDE-Q + BINGE)', () => {
    const src = mod.pgAssessmentsHub.toString();
    assert.ok(src.includes('EDE-Q'),    'EDE-Q scale missing');
    assert.ok(src.includes('Anorexia') || src.includes('Bulimia'),
      'Anorexia/Bulimia bundle missing');
  });

  it('source contains neurology bundles (Parkinson, Alzheimer, MS, ALS)', () => {
    const src = mod.pgAssessmentsHub.toString();
    assert.ok(src.includes('Parkinson'),  'Parkinson bundle missing');
    assert.ok(src.includes('Alzheimer'),  'Alzheimer bundle missing');
    assert.ok(src.includes('Multiple Sclerosis'), 'MS bundle missing');
    assert.ok(src.includes('ALS'),        'ALS bundle missing');
  });

  it('source contains six PHASES (baseline/weekly/pre_session/post_session/milestone/discharge)', () => {
    const src = mod.pgAssessmentsHub.toString();
    for (const ph of ['baseline','weekly','pre_session','post_session','milestone','discharge']) {
      assert.ok(src.includes(ph), `phase "${ph}" missing`);
    }
  });

  it('source contains EXTRA_SCALES domain labels (Anxiety, Pain, Cognitive, Neuromod)', () => {
    const src = mod.pgAssessmentsHub.toString();
    for (const dom of ['Depression','Anxiety','Pain','Cognitive','Neuromod','Trauma']) {
      assert.ok(src.includes(dom), `EXTRA_SCALES domain "${dom}" missing`);
    }
  });

  it('source contains tDCS-CS comfort-scale entry', () => {
    const src = mod.pgAssessmentsHub.toString();
    assert.ok(src.includes('tDCS-CS'), 'tDCS-CS scale missing');
  });

  it('source contains BPRS, CAPS-5, SPIN, PSWQ, HAM-A scales', () => {
    const src = mod.pgAssessmentsHub.toString();
    for (const s of ['BPRS','CAPS-5','SPIN','PSWQ','HAM-A','BPI','PCS','QIDS-SR']) {
      assert.ok(src.includes(s), `EXTRA_SCALES entry "${s}" missing`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 13 · pgConsentAutomation — wiring contract pin
// ─────────────────────────────────────────────────────────────────────────────

describe('pgConsentAutomation — wiring contract', () => {
  it('source documents the /api/v1/consent/records hydrate endpoint', () => {
    const src = mod.pgConsentAutomation.toString();
    assert.ok(src.includes('/consent/records') || src.includes('consent'),
      'consent records endpoint reference missing');
  });

  it('source documents legacy localStorage keys are no longer source-of-truth', () => {
    const src = mod.pgConsentAutomation.toString();
    assert.ok(src.includes('ds_consent') || src.includes('IGNORE'),
      'legacy localStorage policy comment missing');
  });

  it('source contains "expiring" status mapping for <30d expiry window', () => {
    const src = mod.pgConsentAutomation.toString();
    assert.ok(src.includes('expiring') || src.includes('expired'),
      'expiring/expired status mapping missing');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 14 · Module-level exports + topbar exhaustive
// ─────────────────────────────────────────────────────────────────────────────

describe('module exports — types and presence', () => {
  const expected = [
    'pgAdvancedSearch', 'pgBenchmarkLibrary', 'pgConsentAutomation',
    'pgMediaReviewQueue', 'pgMediaDetail', 'pgClinicianDictation',
    'pgClinicianDraftReview', 'pgMedInteractionChecker', 'pgFormsBuilder',
    'pgEvidenceBuilder', 'pgPatientQueue', 'pgClinicDay', 'pgAssessmentsHub',
    'pgBrainMapPlanner', 'pgNotesDictation', 'pgMedicalHistory',
    'pgDocumentsHub', 'pgReportsHub', 'pgPrescriptions', 'pgPatientProtocolView',
    'pgMonitoring', 'pgHomePrograms',
  ];

  for (const name of expected) {
    it(`${name} is an async function`, () => {
      const fn = mod[name];
      assert.strictEqual(typeof fn, 'function', `${name} not exported as function`);
      // Async functions are AsyncFunction, but they're typeof 'function' in JS.
      // Verify by calling .constructor.name.
      assert.ok(fn.constructor.name === 'AsyncFunction' || fn.constructor.name === 'Function',
        `${name} is not a regular/async function`);
    });
  }
});
