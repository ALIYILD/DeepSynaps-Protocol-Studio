// Source-level checks for the new Patient Health Reports v2 page.
//
// Run: cd apps/web && node --test src/pages-patient-health-reports.test.js
//
// Style mirrors `patients-hub-demo-readiness.test.js` — fast regex assertions
// against the source files, no DOM. The point is to fail loudly if a future
// refactor accidentally severs one of the locked-decision contracts:
//   - the central dispatcher in app.js routes `patient-health-reports`
//   - `pages-patient.js` re-exports `pgPatientHealthReports`
//   - `health-reports.js` actually renders all 4 tab buttons
//   - the shared module exports the load-bearing helpers
//   - the demo-mode "Coming soon" surface lists every planned analyzer

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP        = readFileSync(join(__dirname, 'app.js'), 'utf8');
const PAGE       = readFileSync(join(__dirname, 'pages-patient.js'), 'utf8');
const HR_PAGE    = readFileSync(join(__dirname, 'pages-patient', 'health-reports.js'), 'utf8');
const SHARED     = readFileSync(join(__dirname, 'pages-patient', '_reports-shared.js'), 'utf8');
const I18N       = readFileSync(join(__dirname, 'i18n.js'), 'utf8');

test('pages-patient.js re-exports pgPatientHealthReports', () => {
  assert.match(PAGE, /export\s*\{\s*pgPatientHealthReports\s*\}/);
});

test('health-reports.js source carries all 4 tab ids (outcomes / analyzers / biometrics / documents)', () => {
  // The tab ids are template-interpolated into `data-tab="${esc(tab.id)}"`,
  // so we assert on the source-level string presence of each id and on the
  // tab-defs factory shape, not on the rendered attribute literal.
  assert.match(HR_PAGE, /id:\s*'outcomes'/);
  assert.match(HR_PAGE, /id:\s*'analyzers'/);
  assert.match(HR_PAGE, /id:\s*'biometrics'/);
  assert.match(HR_PAGE, /id:\s*'documents'/);
  assert.match(HR_PAGE, /data-tab=/);
});

test('health-reports.js mounts the as-tabs container with the locked id', () => {
  assert.match(HR_PAGE, /class="as-tabs"\s+id="pt-hr-tabs"/);
});

test('_reports-shared.js exports DOC_PLAIN_LANG, categorise, docCardHTML', () => {
  assert.match(SHARED, /export\s+const\s+DOC_PLAIN_LANG\b/);
  assert.match(SHARED, /export\s+function\s+categorise\b/);
  assert.match(SHARED, /export\s+function\s+docCardHTML\b/);
});

test('_reports-shared.js exports the bundle helpers used by the v2 page', () => {
  assert.match(SHARED, /export\s+function\s+_normalizeDocs\b/);
  assert.match(SHARED, /export\s+async\s+function\s+_fetchPatientReportsBundle\b/);
});

test('app.js has a `case \'patient-health-reports\':` dispatch', () => {
  assert.match(APP, /case\s+'patient-health-reports':\s*await\s+m\.pgPatientHealthReports\(\)/);
});

test('Coming-soon tile copy is present (regex on the chip row)', () => {
  // The default Advanced Analyzers state lists every planned analyzer as
  // a chip. If any of them get dropped or renamed silently, the page
  // becomes a different surface than the eng-review locked.
  assert.match(HR_PAGE, /qEEG/);
  assert.match(HR_PAGE, /MRI/);
  assert.match(HR_PAGE, /Voice/);
  assert.match(HR_PAGE, /Text/);
  assert.match(HR_PAGE, /Movement/);
  assert.match(HR_PAGE, /pt-hr-analyzer-chips/);
});

test('demo-mode preview cards no-op + carry the post-launch tooltip', () => {
  assert.match(HR_PAGE, /isDemoSession\(\)/);
  assert.match(HR_PAGE, /Demo preview\s*—\s*wires to live/);
  assert.match(HR_PAGE, /cursor:\s*not-allowed/);
});

test('legacy patient-reports nav entry is marked legacy and route still wired', () => {
  // Sidebar hides the legacy entry but `app.js` keeps the dispatcher case
  // so direct URLs still resolve.
  assert.match(PAGE, /id:\s*'patient-reports'[\s\S]*?group:\s*'legacy'/);
  assert.match(APP,  /case\s+'patient-reports':\s*await\s+m\.pgPatientReports\(\)/);
});

test('legacy pgPatientReports surfaces the moved-to-Health-Reports banner', () => {
  assert.match(PAGE, /data-testid="pt-reports-legacy-moved"/);
  assert.match(PAGE, /window\._navPatient\s*&&\s*window\._navPatient\('patient-health-reports'\)/);
});

test('all 10 health-reports i18n keys land in BOTH en and tr blocks', () => {
  const keys = [
    'patient.health_reports.title',
    'patient.health_reports.tab.outcomes',
    'patient.health_reports.tab.analyzers',
    'patient.health_reports.tab.biometrics',
    'patient.health_reports.tab.documents',
    'patient.health_reports.empty.analyzers',
    'patient.health_reports.empty.documents',
    'patient.health_reports.legacy_banner',
    'patient.health_reports.legacy_banner_cta',
    'patient.health_reports.coming_soon',
  ];
  for (const k of keys) {
    // Each key should appear at least twice — once in the EN block and
    // once in the TR block.
    const occurrences = (I18N.match(new RegExp(`'${k.replace(/\./g, '\\.')}'`, 'g')) || []).length;
    assert.ok(occurrences >= 2, `i18n key ${k} should appear in EN and TR blocks (saw ${occurrences})`);
  }
});

test('shared module is the source of truth for the legacy page (no in-file copy)', () => {
  // The eng-review explicitly forbids a pure-copy of the helpers in the
  // legacy file. Verify the legacy page imports from the shared module.
  assert.match(PAGE, /from\s+'\.\/pages-patient\/_reports-shared\.js'/);
});

test('_reports-shared.js exports the CTA handler installer + module-level handlers (commit 9 fix)', () => {
  // Commit 9 — lift CTA click handlers (acknowledge/share-back/question/view/
  // ask/toggle-pl/report-opened/report-downloaded) to module level so they
  // exist from JS-eval time. Otherwise a patient landing on v2 directly hits
  // a silent no-op because the legacy `pgPatientReports` closure never runs.
  assert.match(SHARED, /export\s+function\s+installPatientReportsCtaHandlers\b/);
  assert.match(SHARED, /export\s+function\s+ptToggleDocPl\b/);
  assert.match(SHARED, /export\s+function\s+ptViewDoc\b/);
  assert.match(SHARED, /export\s+function\s+ptReportOpened\b/);
  assert.match(SHARED, /export\s+function\s+ptReportDownloaded\b/);
  assert.match(SHARED, /export\s+function\s+ptAskAbout\b/);
  assert.match(SHARED, /export\s+async\s+function\s+ptAcknowledgeReport\b/);
  assert.match(SHARED, /export\s+async\s+function\s+ptShareBackReport\b/);
  assert.match(SHARED, /export\s+async\s+function\s+ptStartQuestionForReport\b/);
  // The installer must wire every CTA the doc-card template references.
  assert.match(SHARED, /window\._ptAcknowledgeReport\s*=/);
  assert.match(SHARED, /window\._ptShareBackReport\s*=/);
  assert.match(SHARED, /window\._ptStartQuestionForReport\s*=/);
});

test('both patient-report pages call installPatientReportsCtaHandlers at mount (commit 9 fix)', () => {
  // Both the legacy page and v2 health-reports must install the handlers so
  // the CTAs work from either entry point.
  assert.match(PAGE,    /_sharedInstallPatientReportsCtaHandlers\s*\(/);
  assert.match(HR_PAGE, /installPatientReportsCtaHandlers\s*\(/);
});
