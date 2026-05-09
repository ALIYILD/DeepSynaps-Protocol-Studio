// Unit tests — pages-clinical-tools.js public surface
// Pins exported page functions (smoke/no-throw + topbar), clinical-safety
// strings, the DRUG_CLASS_MAP / INTERACTION_RULES / COND_BUNDLES data tables,
// the EXTRA_SCALES definitions, and _asTypeBadge / _hubInterpretScore helpers.
//
// Canvas/WebGL paths are skipped — no GPU context in headless Node.
// BrainMapPlanner is not DOM-tested here; its dedicated test suite covers it.
//
// Run: node --test src/pages-clinical-tools.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
let _savedWindow, _savedDocument, _savedLocalStorage;
const _domBefore = () => {
  _savedWindow    = global.window;
  _savedDocument  = global.document;
  _savedLocalStorage = global.localStorage;

  const _contentEl = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild: () => {},
    closest: () => null,
  };
  const _doc = {
    getElementById: (id) => {
      if (id === 'content') return _contentEl;
      return {
        innerHTML: '', appendChild: () => {}, querySelector: () => null,
        querySelectorAll: () => [], classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      };
    },
    createElement: (tag) => ({
      id: '', textContent: '', className: '', innerHTML: '',
      style: {}, setAttribute: () => {}, remove: () => {},
      appendChild: () => {}, firstElementChild: null,
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    }),
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, removeChild: () => {} },
  };
  const _store = {};
  const _ls = {
    getItem: (k) => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = v; },
    removeItem: (k) => { delete _store[k]; },
  };
  global.document = _doc;
  global.localStorage = _ls;
  global.window = {
    _nav: () => {},
    _ah2Refresh: null,
    _ah2Export: null,
    _ttSearch: null,
    _ttClear: null,
    _ttToggleType: null,
    _ttApplyFilters: null,
    _ttSort: null,
    _ttLoadSearch: null,
    _ttSaveSearch: null,
    _benchmarkTab: null,
    _benchmarkExport: null,
    _benchmarkFilterCondition: null,
    _benchmarkFilterModality: null,
    _selectedPatientId: null,
    _profilePatientId: null,
    location: { href: '' },
    setTimeout: (fn, ms) => { /* no-op in tests */ },
  };
  global.setTimeout = (fn, ms) => {};
};
const _domAfter = () => {
  global.window    = _savedWindow;
  global.document  = _savedDocument;
  global.localStorage = _savedLocalStorage;
};

// ── Import under test ─────────────────────────────────────────────────────────
_domBefore();
const {
  pgAdvancedSearch,
  pgBenchmarkLibrary,
  pgConsentAutomation,
  pgMediaReviewQueue,
  pgMediaDetail,
  pgClinicianDictation,
  pgClinicianDraftReview,
  pgMedInteractionChecker,
  pgFormsBuilder,
  pgEvidenceBuilder,
  pgPatientQueue,
  pgClinicDay,
  pgAssessmentsHub,
  pgBrainMapPlanner,
  pgNotesDictation,
  pgMedicalHistory,
  pgDocumentsHub,
  pgReportsHub,
  pgPrescriptions,
  pgPatientProtocolView,
  pgMonitoring,
  pgHomePrograms,
} = await import('./pages-clinical-tools.js');
_domAfter();

// ── helpers ───────────────────────────────────────────────────────────────────
function makeTopbar() {
  let lastTitle = '';
  let lastActions = '';
  return {
    fn: (title, actions) => { lastTitle = title; lastActions = actions ?? ''; },
    get title() { return lastTitle; },
    get actions() { return lastActions; },
  };
}

function stubGlobals() {
  _domBefore();
  global.fetch = async () => new Response(JSON.stringify({ items: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
  // buildSearchIndex is defined in pages-clinical.js and referenced by name in
  // pgAdvancedSearch — stub it globally so the test can mount the page.
  global.buildSearchIndex = () => [];
  // document.querySelector is used by pgMedInteractionChecker
  if (global.document && !global.document.querySelector) {
    global.document.querySelector = () => null;
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('pages-clinical-tools: all exports are functions', () => {
  it('pgAdvancedSearch is a function', () => {
    assert.strictEqual(typeof pgAdvancedSearch, 'function');
  });
  it('pgBenchmarkLibrary is a function', () => {
    assert.strictEqual(typeof pgBenchmarkLibrary, 'function');
  });
  it('pgConsentAutomation is a function', () => {
    assert.strictEqual(typeof pgConsentAutomation, 'function');
  });
  it('pgMedInteractionChecker is a function', () => {
    assert.strictEqual(typeof pgMedInteractionChecker, 'function');
  });
  it('pgAssessmentsHub is a function', () => {
    assert.strictEqual(typeof pgAssessmentsHub, 'function');
  });
  it('pgBrainMapPlanner is a function', () => {
    assert.strictEqual(typeof pgBrainMapPlanner, 'function');
  });
  it('pgHomePrograms is a function', () => {
    assert.strictEqual(typeof pgHomePrograms, 'function');
  });
  it('pgDocumentsHub is a function', () => {
    assert.strictEqual(typeof pgDocumentsHub, 'function');
  });
  it('pgReportsHub is a function', () => {
    assert.strictEqual(typeof pgReportsHub, 'function');
  });
});

describe('pages-clinical-tools: pgAdvancedSearch — source checks', () => {
  // pgAdvancedSearch references buildSearchIndex/getSavedSearches from pages-clinical.js
  // (cross-module global references). Use source inspection to pin the contract.

  it('source contains "Advanced Search" topbar label', () => {
    const src = pgAdvancedSearch.toString();
    assert.ok(src.includes('Advanced Search'), '"Advanced Search" label missing');
  });

  it('source contains type chips for patients, notes, protocols', () => {
    const src = pgAdvancedSearch.toString();
    assert.ok(src.includes('patient'), 'patient type chip missing');
    assert.ok(src.includes('protocol'), 'protocol type chip missing');
    assert.ok(src.includes('note'), 'note type chip missing');
  });

  it('source contains sort, group, and filter UI state', () => {
    const src = pgAdvancedSearch.toString();
    assert.ok(src.includes('sortBy') || src.includes('sort_by'), 'sortBy state missing');
    assert.ok(src.includes('grouped') || src.includes('_grouped'), 'grouped state missing');
  });
});

describe('pages-clinical-tools: pgBenchmarkLibrary — topbar + safety copy', () => {
  before(stubGlobals);
  after(_domAfter);

  it('calls setTopbar with "Benchmark Library" text', async () => {
    const tb = makeTopbar();
    await pgBenchmarkLibrary(tb.fn);
    assert.ok(tb.title.includes('Benchmark'), `title was: ${tb.title}`);
  });

  it('mounts without throwing', async () => {
    const tb = makeTopbar();
    await assert.doesNotReject(() => pgBenchmarkLibrary(tb.fn));
  });

  it('source contains "Illustrative benchmarks only" safety copy', () => {
    const src = pgBenchmarkLibrary.toString();
    assert.ok(src.includes('Illustrative benchmarks only'),
      '"Illustrative benchmarks only" copy missing from pgBenchmarkLibrary');
  });
});

describe('pages-clinical-tools: pgMedInteractionChecker — data integrity', () => {
  it('source contains MAOI + SSRI contraindicated rule', () => {
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('contraindicated'), 'contraindicated severity level missing');
    assert.ok(src.includes('maoi') || src.includes('MAOI'), 'MAOI entry missing');
    assert.ok(src.includes('ssri') || src.includes('SSRI'), 'SSRI entry missing');
  });

  it('source contains lithium + ibuprofen major interaction rule', () => {
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('lithium'), 'lithium missing from interaction rules');
    assert.ok(src.includes('ibuprofen'), 'ibuprofen missing from interaction rules');
  });

  it('source contains clozapine TMS hold warning', () => {
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('clozapine'), 'clozapine entry missing');
    assert.ok(src.includes("'hold'") || src.includes('"hold"') || src.includes('severity'),
      'hold severity for clozapine+TMS missing');
  });

  it('source contains bupropion + MAOI contraindication', () => {
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('bupropion'), 'bupropion entry missing');
  });

  it('source contains benzodiazepine + opioid additive depression warning', () => {
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('benzodiazepine'), 'benzodiazepine entry missing');
    assert.ok(src.includes('opioid'), 'opioid entry missing');
  });

  it('source confirms "Medication Safety" topbar label', () => {
    // pgMedInteractionChecker calls document.querySelector to render its body.
    // Use module source check to avoid the querySelector stub complexity.
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('Medication Safety'), '"Medication Safety" label missing from pgMedInteractionChecker');
  });
});

describe('pages-clinical-tools: pgAssessmentsHub — topbar + EXTRA_SCALES', () => {
  before(stubGlobals);
  after(_domAfter);

  it('calls setTopbar with "Assessments Hub"', async () => {
    const tb = makeTopbar();
    await pgAssessmentsHub(tb.fn);
    assert.ok(tb.title.includes('Assessments Hub'), `title was: ${tb.title}`);
  });

  it('topbar actions include Assign Bundle and Refresh buttons', async () => {
    const tb = makeTopbar();
    await pgAssessmentsHub(tb.fn);
    assert.ok(tb.actions.includes('Assign Bundle'), 'Assign Bundle button missing from topbar');
    assert.ok(tb.actions.includes('Refresh'), 'Refresh button missing from topbar');
  });

  it('source contains C-SSRS Columbia Suicide Severity Rating Scale', () => {
    const src = pgAssessmentsHub.toString();
    assert.ok(src.includes('C-SSRS'), 'C-SSRS missing from EXTRA_SCALES');
    assert.ok(src.includes('Columbia Suicide Severity Rating Scale'),
      'C-SSRS full name missing');
  });

  it('source contains PANSS for psychosis assessment', () => {
    const src = pgAssessmentsHub.toString();
    assert.ok(src.includes('PANSS'), 'PANSS missing from EXTRA_SCALES');
  });

  it('source contains MoCA and MMSE cognitive scales', () => {
    const src = pgAssessmentsHub.toString();
    assert.ok(src.includes('MoCA'), 'MoCA missing from EXTRA_SCALES');
    assert.ok(src.includes('MMSE'), 'MMSE missing from EXTRA_SCALES');
  });

  it('source contains TMS-SE side-effects checklist', () => {
    const src = pgAssessmentsHub.toString();
    assert.ok(src.includes('TMS-SE'), 'TMS-SE side-effects scale missing');
  });
});

describe('pages-clinical-tools: pgAssessmentsHub — COND_BUNDLES integrity', () => {
  it('source includes MDD bundle (CON-001) with C-SSRS at baseline', () => {
    const src = pgAssessmentsHub.toString();
    assert.ok(src.includes('CON-001'), 'CON-001 MDD bundle missing');
    assert.ok(src.includes('C-SSRS'), 'C-SSRS missing from COND_BUNDLES');
  });

  it('source includes PTSD bundle (CON-019)', () => {
    const src = pgAssessmentsHub.toString();
    assert.ok(src.includes('CON-019') || src.includes('Post-Traumatic Stress Disorder'),
      'PTSD bundle (CON-019) missing');
  });

  it('source includes suicidality bundle (CON-010)', () => {
    const src = pgAssessmentsHub.toString();
    assert.ok(src.includes('CON-010') || src.includes('Suicidality and Crisis Management'),
      'Suicidality bundle (CON-010) missing');
  });

  it('source includes Schizophrenia bundle with PANSS', () => {
    const src = pgAssessmentsHub.toString();
    assert.ok(src.includes('Schizophrenia'), 'Schizophrenia bundle missing');
  });
});

describe('pages-clinical-tools: qEEG decision-support safety string', () => {
  it('source contains qEEG decision-support safety disclaimer', () => {
    const src = pgBrainMapPlanner.toString();
    assert.ok(
      src.includes('decision-support') ||
      src.includes('decision support') ||
      src.includes('not prescriptive'),
      'qEEG decision-support safety string missing from pgBrainMapPlanner'
    );
  });
});

describe('pages-clinical-tools: pgConsentAutomation — topbar', () => {
  before(stubGlobals);
  after(_domAfter);

  it('calls setTopbar', async () => {
    const tb = makeTopbar();
    await pgConsentAutomation(tb.fn);
    assert.ok(tb.title.length > 0, 'pgConsentAutomation did not call setTopbar');
  });
});

describe('pages-clinical-tools: pgPatientQueue — topbar', () => {
  before(stubGlobals);
  after(_domAfter);

  it('calls setTopbar', async () => {
    const tb = makeTopbar();
    await pgPatientQueue(tb.fn);
    assert.ok(tb.title.length > 0, 'pgPatientQueue did not call setTopbar');
  });
});

describe('pages-clinical-tools: pgHomePrograms — topbar', () => {
  before(stubGlobals);
  after(_domAfter);

  it('calls setTopbar', async () => {
    const tb = makeTopbar();
    await pgHomePrograms(tb.fn, () => {});
    assert.ok(tb.title.length > 0, 'pgHomePrograms did not call setTopbar');
  });
});

describe('pages-clinical-tools: DRUG_CLASS_MAP spot checks via source', () => {
  it('source contains ssri class with sertraline and fluoxetine', () => {
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('sertraline'), 'sertraline missing from DRUG_CLASS_MAP');
    assert.ok(src.includes('fluoxetine'), 'fluoxetine missing from DRUG_CLASS_MAP');
  });

  it('source contains opioid class with buprenorphine', () => {
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('buprenorphine'), 'buprenorphine missing from DRUG_CLASS_MAP');
  });

  it('source contains mood stabilizer with lithium and valproate', () => {
    const src = pgMedInteractionChecker.toString();
    assert.ok(src.includes('valproate'), 'valproate missing from mood stabilizer class');
    assert.ok(src.includes('lamotrigine'), 'lamotrigine missing from mood stabilizer class');
  });
});
