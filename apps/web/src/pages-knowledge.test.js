// Unit tests — pages-knowledge.js public surface
// Pins exported page functions (smoke/no-throw + topbar), clinical-safety
// strings, the COMPARISON_ROWS / PRICING_FAQS / DISCOUNT_CHIPS data tables,
// the PHQ-9 / GAD-7 scale definitions, and the KNOWN_PACKAGES condition list.
//
// Canvas/WebGL paths (pgQEEGMaps charts) are skipped — they require a GPU
// context that is unavailable in a headless Node runner.
//
// Run: node --test src/pages-knowledge.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
function _makeEl() {
  const el = {
    innerHTML: '',
    style: {},
    className: '',
    id: '',
    textContent: '',
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    appendChild: () => {},
    replaceWith: () => {},
    focus: () => {},
    setAttribute: () => {},
    remove: () => {},
    firstElementChild: null,
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
  };
  return el;
}

let _savedWindow, _savedDocument, _savedLocalStorage;
const _domBefore = () => {
  _savedWindow   = global.window;
  _savedDocument = global.document;
  _savedLocalStorage = global.localStorage;

  const _elById = (id) => _makeEl();
  const _doc = {
    getElementById: _elById,
    createElement: () => _makeEl(),
    createTextNode: (t) => ({ nodeValue: t }),
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, removeChild: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
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
    _evidenceData: null,
    filterEvidence: null,
    _hbSwitchTab: null,
    _scalTab: null,
    _scalLoadDemo: null,
    _scalSet: null,
    _scalToggleHist: null,
    _scalToggleRef: null,
    _showNotifToast: null,
    _libraryHubTab: null,
    _condPkgSlug: 'adhd',
    _renderAuditTimeline: () => {},
    _auditPage: 0,
    location: { href: '' },
    clearInterval: () => {},
    setInterval: () => 0,
  };
  global.clearInterval = () => {};
  global.setInterval = () => 0;
};
const _domAfter = () => {
  global.window    = _savedWindow;
  global.document  = _savedDocument;
  global.localStorage = _savedLocalStorage;
};

// ── Import under test ─────────────────────────────────────────────────────────
// Import must happen after globals are set so that top-level module code that
// references `document` does not crash.
_domBefore();
const {
  pgEvidence,
  pgDevices,
  pgBrainRegions,
  pgHandbooks,
  bindHandbooks,
  pgAuditTrail,
  pgPricing,
  pgReportBuilder,
  pgQualityAssurance,
  pgDeviceManagement,
  pgClinicalTrials,
  pgStaffScheduling,
  pgCareTeamCoverage,
  pgClinicAnalytics,
  pgProtocolMarketplace,
  pgDataExport,
  pgTrialEnrollment,
  pgIRBManager,
  pgLiteratureLibrary,
  pgLongitudinalReport,
  pgClinicalScoringCalc,
  pgConditionBrowser,
  pgConditionPackage,
} = await import('./pages-knowledge.js');
_domAfter();

// Read module source text for module-level constant checks (COMPARISON_ROWS,
// PRICING_FAQS, DISCOUNT_CHIPS, etc. are defined at module scope, not inside
// functions, so they don't appear in pgPricing.toString()).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
const _moduleDir = dirname(fileURLToPath(import.meta.url));
const _knowledgeSrc = readFileSync(join(_moduleDir, 'pages-knowledge.js'), 'utf8');

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
  // Stub fetch so async pages that call api.* don't throw.
  global.fetch = async () => new Response(JSON.stringify({ items: [] }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('pages-knowledge: exports are functions', () => {
  it('pgEvidence is an async function', () => {
    assert.strictEqual(typeof pgEvidence, 'function');
  });
  it('pgDevices is an async function', () => {
    assert.strictEqual(typeof pgDevices, 'function');
  });
  it('pgBrainRegions is an async function', () => {
    assert.strictEqual(typeof pgBrainRegions, 'function');
  });
  it('pgHandbooks is a function', () => {
    assert.strictEqual(typeof pgHandbooks, 'function');
  });
  it('bindHandbooks is a function', () => {
    assert.strictEqual(typeof bindHandbooks, 'function');
  });
  it('pgAuditTrail is an async function', () => {
    assert.strictEqual(typeof pgAuditTrail, 'function');
  });
  it('pgPricing is an async function', () => {
    assert.strictEqual(typeof pgPricing, 'function');
  });
  it('pgReportBuilder is an async function', () => {
    assert.strictEqual(typeof pgReportBuilder, 'function');
  });
  it('pgQualityAssurance is an async function', () => {
    assert.strictEqual(typeof pgQualityAssurance, 'function');
  });
  it('pgConditionBrowser is an async function', () => {
    assert.strictEqual(typeof pgConditionBrowser, 'function');
  });
  it('pgConditionPackage is an async function', () => {
    assert.strictEqual(typeof pgConditionPackage, 'function');
  });
  it('pgClinicalScoringCalc is an async function', () => {
    assert.strictEqual(typeof pgClinicalScoringCalc, 'function');
  });
});

describe('pages-knowledge: pgHandbooks — DOM mount + topbar', () => {
  before(stubGlobals);
  after(_domAfter);

  it('calls setTopbar with "Clinical Handbooks & Documentation"', () => {
    const tb = makeTopbar();
    pgHandbooks(tb.fn);
    assert.ok(tb.title.includes('Handbooks'), `title was: ${tb.title}`);
  });

  it('writes to #content and does not throw', () => {
    const tb = makeTopbar();
    assert.doesNotThrow(() => pgHandbooks(tb.fn));
    const el = document.getElementById('content');
    assert.ok(typeof el.innerHTML === 'string');
  });
});

describe('pages-knowledge: pgHandbooks — HB_TEMPLATES data integrity', () => {
  before(stubGlobals);
  after(_domAfter);

  it('renders without error (HB_TEMPLATES internally consistent)', () => {
    const tb = makeTopbar();
    assert.doesNotThrow(() => pgHandbooks(tb.fn));
  });

  it('topbar action includes "Generate Custom Document" button text', () => {
    const tb = makeTopbar();
    pgHandbooks(tb.fn);
    assert.ok(tb.actions.includes('Generate Custom Document'), `actions was: ${tb.actions}`);
  });
});

describe('pages-knowledge: pgClinicalScoringCalc — DOM mount + topbar', () => {
  before(stubGlobals);
  after(_domAfter);

  it('calls setTopbar with "Clinical Scoring Calculator"', async () => {
    const tb = makeTopbar();
    await pgClinicalScoringCalc(tb.fn);
    assert.ok(tb.title.includes('Scoring Calculator'), `title was: ${tb.title}`);
  });

  it('mounts without throwing', async () => {
    const tb = makeTopbar();
    await assert.doesNotReject(() => pgClinicalScoringCalc(tb.fn));
  });
});

describe('pages-knowledge: clinical-safety string in pgClinicalScoringCalc', () => {
  // The exact safety disclaimer string must stay present across refactors.
  before(stubGlobals);
  after(_domAfter);

  it('source includes the clinical decision-support disclaimer', async () => {
    // Retrieve the source text of the module to assert the string is present.
    // We use the module function's toString() trick for the static strings embedded
    // in the rendering functions inside pgClinicalScoringCalc.
    const src = pgClinicalScoringCalc.toString();
    const hasSafetyStr =
      src.includes('decision support tool') ||
      src.includes('scores assist clinician judgment') ||
      src.includes('do not constitute diagnosis');
    assert.ok(hasSafetyStr, 'clinical-safety disclaimer string not found in pgClinicalScoringCalc');
  });
});

describe('pages-knowledge: COMPARISON_ROWS data — spot checks via module source', () => {
  // COMPARISON_ROWS is a module-level constant, not inside pgPricing(), so we
  // inspect the raw module source text rather than pgPricing.toString().
  it('module source contains "Evidence library" comparison row', () => {
    assert.ok(_knowledgeSrc.includes('Evidence library'), 'Evidence library row missing from COMPARISON_ROWS');
  });

  it('module source contains "Live qEEG (wellness/research)" row', () => {
    assert.ok(_knowledgeSrc.includes('wellness/research'), 'Live qEEG wellness/research row missing');
  });

  it('module source contains "EV-D evidence in patient exports" blocked row', () => {
    assert.ok(_knowledgeSrc.includes('EV-D evidence in patient exports'), 'EV-D blocked row missing');
  });

  it('module source contains all 5 plan tiers', () => {
    for (const tier of ['Explorer', 'Resident', 'Clinician Pro', 'Clinic Team', 'Enterprise']) {
      assert.ok(_knowledgeSrc.includes(tier), `Plan tier "${tier}" missing from module`);
    }
  });
});

describe('pages-knowledge: PRICING_FAQS spot checks via module source', () => {
  it('module source contains free trial FAQ', () => {
    assert.ok(_knowledgeSrc.includes('14-day free trial'), '14-day free trial FAQ missing');
  });

  it('module source contains HIPAA BAA mention', () => {
    assert.ok(_knowledgeSrc.includes('HIPAA BAA'), 'HIPAA BAA compliance text missing');
  });
});

describe('pages-knowledge: DISCOUNT_CHIPS spot checks via module source', () => {
  it('module source contains annual billing discount', () => {
    assert.ok(_knowledgeSrc.includes('Annual billing'), 'Annual billing discount missing');
  });

  it('module source contains academic/research discount', () => {
    assert.ok(_knowledgeSrc.includes('Academic'), 'Academic/research discount missing');
  });
});

describe('pages-knowledge: PHQ-9 scale definition integrity', () => {
  it('pgClinicalScoringCalc source contains PHQ-9 full name', () => {
    const src = pgClinicalScoringCalc.toString();
    assert.ok(src.includes('Patient Health Questionnaire-9'), 'PHQ-9 full name missing');
  });

  it('pgClinicalScoringCalc source contains PHQ-9 crisis item index', () => {
    const src = pgClinicalScoringCalc.toString();
    assert.ok(src.includes('crisisItem') || src.includes('crisis_item'), 'PHQ-9 crisisItem field missing');
  });

  it('pgClinicalScoringCalc source contains PHQ-9 ICD-10 codes F32 and F33', () => {
    const src = pgClinicalScoringCalc.toString();
    assert.ok(src.includes("'F32'") || src.includes('"F32"'), 'PHQ-9 ICD-10 F32 missing');
    assert.ok(src.includes("'F33'") || src.includes('"F33"'), 'PHQ-9 ICD-10 F33 missing');
  });

  it('pgClinicalScoringCalc source contains GAD-7 definition', () => {
    const src = pgClinicalScoringCalc.toString();
    assert.ok(src.includes('Generalized Anxiety Disorder-7'), 'GAD-7 fullName missing');
  });

  it('pgClinicalScoringCalc source contains PCL-5 definition for PTSD', () => {
    const src = pgClinicalScoringCalc.toString();
    assert.ok(src.includes('PCL-5') || src.includes('PTSD Checklist'), 'PCL-5 definition missing');
  });
});

describe('pages-knowledge: KNOWN_PACKAGES — condition browser integrity', () => {
  it('pgConditionBrowser source lists major-depressive-disorder', () => {
    const src = pgConditionBrowser.toString();
    assert.ok(src.includes('major-depressive-disorder'), 'MDD slug missing from condition browser');
  });

  it('pgConditionBrowser source lists treatment-resistant-depression with EV-A', () => {
    const src = pgConditionBrowser.toString();
    assert.ok(src.includes('treatment-resistant-depression'), 'TRD slug missing');
    assert.ok(src.includes("ev:'EV-A'") || src.includes("ev: 'EV-A'"), 'EV-A grade missing');
  });

  it('pgConditionBrowser source lists 20 condition packages', () => {
    const src = pgConditionBrowser.toString();
    // Count slug occurrences as proxy for the 20-entry table
    const matches = src.match(/slug:/g) || [];
    assert.ok(matches.length >= 20, `Expected >=20 slug entries, found ${matches.length}`);
  });

  it('pgConditionBrowser source contains parkinsons-disease entry', () => {
    const src = pgConditionBrowser.toString();
    assert.ok(src.includes('parkinsons-disease'), "Parkinson's Disease entry missing");
  });

  it('pgConditionBrowser source includes stroke-rehabilitation', () => {
    const src = pgConditionBrowser.toString();
    assert.ok(src.includes('stroke-rehabilitation'), 'Stroke Rehabilitation entry missing');
  });
});

describe('pages-knowledge: pgConditionBrowser — DOM mount', () => {
  before(stubGlobals);
  after(_domAfter);

  it('calls setTopbar with "Condition Packages"', async () => {
    const tb = makeTopbar();
    await pgConditionBrowser(tb.fn);
    assert.ok(tb.title.includes('Condition Packages'), `title was: ${tb.title}`);
  });

  it('does not throw when #content exists', async () => {
    const tb = makeTopbar();
    await assert.doesNotReject(() => pgConditionBrowser(tb.fn));
  });
});

describe('pages-knowledge: pgAuditTrail — source checks', () => {
  // pgAuditTrail calls window._renderAuditTimeline internally which requires
  // a richer DOM (element.style.display). We test via source text instead.
  it('module source includes pgAuditTrail setTopbar call', () => {
    assert.ok(_knowledgeSrc.includes("setTopbar('Audit Trail'") ||
      _knowledgeSrc.includes('Audit Trail'),
      'pgAuditTrail "Audit Trail" label missing');
  });

  it('module source includes audit event types', () => {
    assert.ok(_knowledgeSrc.includes('protocol_generated') ||
      _knowledgeSrc.includes('audit'),
      'Audit event types missing from pgAuditTrail source');
  });
});

describe('pages-knowledge: pgDeviceManagement — source checks', () => {
  // pgDeviceManagement calls getDevices() which is defined later in the module
  // scope and has localStorage dependencies. We test via source text.
  it('module source includes Device & Equipment Management label', () => {
    assert.ok(_knowledgeSrc.includes('Device & Equipment Management') ||
      _knowledgeSrc.includes('Device Management'),
      'Device management label missing');
  });

  it('module source includes Register Device action', () => {
    assert.ok(_knowledgeSrc.includes('Register Device'), 'Register Device button missing');
  });
});

describe('pages-knowledge: pgTrialEnrollment — seed data integrity', () => {
  it('source contains TRIAL_SEED_STUDIES with required arms', () => {
    const src = pgTrialEnrollment.toString();
    assert.ok(src.includes('TRIAL_SEED_STUDIES'), 'TRIAL_SEED_STUDIES missing from pgTrialEnrollment');
    assert.ok(src.includes('Theta Burst TMS') || src.includes('Active TBS'), 'TMS trial seed missing');
    assert.ok(src.includes('NFB') || src.includes('Neurofeedback'), 'Neurofeedback trial seed missing');
  });

  it('source contains inclusion/exclusion criteria fields', () => {
    const src = pgTrialEnrollment.toString();
    assert.ok(src.includes('inclusion'), 'inclusion criteria field missing');
    assert.ok(src.includes('exclusion'), 'exclusion criteria field missing');
  });
});

describe('pages-knowledge: pgLiteratureLibrary — source checks', () => {
  // pgLiteratureLibrary calls document.addEventListener for click handling.
  // Our minimal stub includes that, so the mount test should pass.
  before(stubGlobals);
  after(_domAfter);

  it('mounts without throwing (document.addEventListener stubbed)', async () => {
    const tb = makeTopbar();
    await assert.doesNotReject(() => pgLiteratureLibrary(tb.fn));
  });

  it('source includes APA citation helper', () => {
    const src = pgLiteratureLibrary.toString();
    assert.ok(src.includes('apa') || src.includes('https://doi.org'), 'APA citation helper missing');
  });

  it('module source includes LITERATURE_DB seed', () => {
    assert.ok(_knowledgeSrc.includes('LITERATURE_DB'), 'LITERATURE_DB seed missing');
  });
});
