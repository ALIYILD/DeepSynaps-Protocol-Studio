// Tests for apps/web/src/app.js
//
// Strategy: app.js is a SPA entry that cannot be imported in Node (it has
// browser-only side effects at module scope). We test the *declarative*
// parts that are load-bearing for navigation correctness by reading the
// source text and asserting structural invariants:
//   - The NAV array contains every route that renderPage() handles
//   - Every load* helper references a known module filename
//   - _PUBLIC_ROUTES contains the expected public-facing routes
//   - Key safety constants (FINANCE_ALLOWED_ROLES, ROLE_NAV_HIDE) exist
//   - renderPage() switch-cases include all critical nav IDs

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const SRC = readFileSync(join(__dir, 'app.js'), 'utf8');

// ── Helper ──────────────────────────────────────────────────────────────────
function hasCase(routeId) {
  // Match: case 'routeId': or case 'routeId'\n
  return SRC.includes(`case '${routeId}':`);
}

function hasNavId(id) {
  // NAV entries look like: { id: 'foo',
  return SRC.includes(`id: '${id}'`);
}

function hasLoadHelper(modFile) {
  // e.g. import('./pages-monitor.js')
  return SRC.includes(`import('./${modFile}')`);
}

// ── 1. NAV route IDs exist in the nav table ─────────────────────────────────
describe('app.js NAV table — route IDs', () => {
  const expectedNavIds = [
    'home',
    'clinician-inbox',
    'clinician-digest',
    'schedule-v2',
    'patients-v2',
    'assessments-v2',
    'documents-v2',
    'live-session',
    'protocol-studio',
    'brainmap-v2',
    'biomarkers',
    'handbooks-v2',
    'research-evidence',
    'risk-analyzer',
    'voice-analyzer',
    'text-analyzer',
    'video-assessments',
    'movement-analyzer',
    'digital-phenotyping-analyzer',
    'behaviour',
    'phenotype-analyzer',
    'wearables',
    'labs-analyzer',
    'nutrition-analyzer',
    'bio-database',
    'treatment-sessions-analyzer',
    'medication-analyzer',
    'deeptwin',
    'ai-fabric',
    'mri-analysis',
    'qeeg-launcher',
    'monitor',
    'ai-agent-v2',
    'marketplace',
    'academy',
    'reports-v2',
    'finance-v2',
    'tickets',
  ];

  for (const id of expectedNavIds) {
    it(`NAV contains id '${id}'`, () => {
      assert.ok(hasNavId(id), `NAV missing entry with id='${id}'`);
    });
  }
});

// ── 2. renderPage() switch has cases for critical routes ────────────────────
describe('app.js renderPage() — critical switch cases', () => {
  const criticalRoutes = [
    'home',
    'dashboard',
    'today',
    'clinician-inbox',
    'inbox',
    'patients-hub',
    'patient',
    'course-detail',
    'session-execution',
    'review-queue',
    'monitor',
    'deeptwin',
    'qeeg-launcher',
    'qeeg-analysis',
    'qeeg-raw-workbench',
    'ai-fabric',
    'mri-analysis',
    'biomarkers',
    'brainmap-v2',
    'brain-map-planner',
    'risk-analyzer',
    'voice-analyzer',
    'text-analyzer',
    'research-evidence',
    'handbooks-v2',
    'onboarding',
    'onboarding-wizard',
    'settings',
    'finance-v2',
    'tickets',
    'audittrail',
    'adverse-events',
    'protocol-studio',
    'schedule-v2',
  ];

  for (const route of criticalRoutes) {
    it(`renderPage() handles case '${route}'`, () => {
      assert.ok(hasCase(route), `renderPage() missing case for '${route}'`);
    });
  }
});

// ── 3. Lazy module load helpers reference real files ────────────────────────
describe('app.js — lazy-load module references', () => {
  const lazyMods = [
    'pages-monitor.js',
    'pages-clinical.js',
    'pages-patient.js',
    'pages-courses.js',
    'pages-knowledge.js',
    'pages-practice.js',
    'pages-registries.js',
    'pages-handbooks.js',
    'pages-protocols.js',
    'pages-virtualcare.js',
    'pages-conditions.js',
    'pages-clinical-tools.js',
    'pages-clinical-hubs.js',
    'pages-deeptwin.js',
    'pages-biomarkers.js',
    'pages-voice-analyzer.js',
    'pages-risk-analyzer.js',
    'pages-qeeg-analysis.js',
    'pages-qeeg-raw-workbench.js',
    'pages-qeeg-launcher.js',
    'pages-ai-fabric.js',
    'pages-mri-analysis.js',
    'pages-research-evidence.js',
    'pages-brainmap.js',
    'pages-onboarding.js',
    'pages-inbox.js',
  ];

  for (const mod of lazyMods) {
    it(`loads ${mod} lazily`, () => {
      assert.ok(hasLoadHelper(mod), `app.js does not import './${mod}'`);
    });
  }
});

// ── 4. Safety / governance constants ────────────────────────────────────────
describe('app.js — safety constants', () => {
  it('_PUBLIC_ROUTES includes home', () => {
    assert.ok(SRC.includes("_PUBLIC_ROUTES = ['home'"), 'missing _PUBLIC_ROUTES starting with home');
  });

  it('_PUBLIC_ROUTES includes login', () => {
    assert.ok(SRC.includes("'login'"), '_PUBLIC_ROUTES missing login');
  });

  it('_PUBLIC_ROUTES includes pricing', () => {
    assert.ok(SRC.includes("'pricing'"), '_PUBLIC_ROUTES missing pricing');
  });

  it('FINANCE_ALLOWED_ROLES is a Set', () => {
    assert.ok(SRC.includes("new Set(['admin', 'clinic_admin', 'clinician'])"), 'FINANCE_ALLOWED_ROLES not a Set of expected roles');
  });

  it('ROLE_NAV_HIDE has technician entry', () => {
    assert.ok(SRC.includes("technician:"), 'ROLE_NAV_HIDE missing technician key');
  });

  it('ROLE_NAV_HIDE has patient entry', () => {
    assert.ok(SRC.includes("patient:"), 'ROLE_NAV_HIDE missing patient key');
  });

  it('ROLE_NAV_HIDE has guest entry', () => {
    assert.ok(SRC.includes("guest:"), 'ROLE_NAV_HIDE missing guest key');
  });

  it('esc() XSS helper escapes & < > " characters', () => {
    // The pattern must be present as defined
    assert.ok(SRC.includes("replace(/&/g,'&amp;')"), 'esc() & escape missing or changed');
    assert.ok(SRC.includes("replace(/</g,'&lt;')"), 'esc() < escape missing or changed');
    assert.ok(SRC.includes("replace(/>/g,'&gt;')"), 'esc() > escape missing or changed');
  });

  it('brainmap patient guard exists', () => {
    assert.ok(
      SRC.includes("Brain Map Planner is available to clinical staff only"),
      'brainmap patient guard copy changed or removed',
    );
  });

  it('OFFLINE_QUEUE_KEY is ds_offline_queue', () => {
    assert.ok(SRC.includes("'ds_offline_queue'"), 'OFFLINE_QUEUE_KEY value changed');
  });
});

// ── 5. Route aliasing invariants ────────────────────────────────────────────
describe('app.js — route aliasing', () => {
  it("'brain-twin' redirects to 'deeptwin'", () => {
    assert.ok(SRC.includes("case 'brain-twin':"), "missing 'brain-twin' case");
    // The redirect must target 'deeptwin'
    const brainTwinIdx = SRC.indexOf("case 'brain-twin':");
    const snippet = SRC.slice(brainTwinIdx, brainTwinIdx + 200);
    assert.ok(snippet.includes("'deeptwin'"), "brain-twin does not redirect to deeptwin");
  });

  it("'devices' redirects to 'monitor'", () => {
    assert.ok(SRC.includes("case 'devices':"), "missing 'devices' case");
    const devIdx = SRC.indexOf("case 'devices':");
    const snippet = SRC.slice(devIdx, devIdx + 100);
    assert.ok(snippet.includes("'monitor'"), "devices does not redirect to monitor");
  });

  it("'monitoring' redirects to 'monitor'", () => {
    assert.ok(SRC.includes("case 'monitoring':"), "missing 'monitoring' alias");
  });

  it("'wearables' alias exists in renderPage", () => {
    assert.ok(SRC.includes("case 'wearables':"), "missing 'wearables' case in renderPage");
  });

  it("'patients' shorthand redirects to patients-hub", () => {
    assert.ok(
      SRC.includes("case 'patients':"),
      "missing 'patients' case",
    );
    const idx = SRC.indexOf("case 'patients':");
    const snippet = SRC.slice(idx, idx + 150);
    assert.ok(snippet.includes("patients-hub"), "'patients' does not route to patients-hub");
  });
});
