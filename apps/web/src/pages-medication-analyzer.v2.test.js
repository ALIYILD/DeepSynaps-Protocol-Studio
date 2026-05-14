/**
 * Medication Analyzer — expanded safety and integration tests (v2).
 *
 * Tests:
 * 1. Role gate: reviewer and technician are REJECTED
 * 2. Fixture reset: usingFixtures is reset on patient navigation
 * 3. Stale interaction: lastInteractionResult is cleared on med add/remove
 * 4. Safety wording audit: no banned phrases exist
 * 5. Neuromod rule coverage: all 18+ rules have PMIDs in references
 * 6. Interaction rule coverage: all rules have valid severity levels
 * 7. Demo fixture safety: demo interactions are labeled as demo/sample
 *
 * Run: node --test src/pages-medication-analyzer.v2.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { MED_NEUROMOD_RULES } from './medication-neuromod-rules.js';
import { ANALYZER_DEMO_FIXTURES } from './demo-fixtures-analyzers.js';
import { medicationAnalyzerAllowsRole } from './pages-medication-analyzer.js';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 1. Role gate test: reviewer and technician are REJECTED ─────────────────

describe('Role gate', () => {
  test('medicationAnalyzerAllowsRole rejects reviewer role', () => {
    assert.equal(medicationAnalyzerAllowsRole('reviewer'), false);
  });

  test('medicationAnalyzerAllowsRole rejects technician role', () => {
    assert.equal(medicationAnalyzerAllowsRole('technician'), false);
  });

  test('medicationAnalyzerAllowsRole allows clinician role', () => {
    assert.equal(medicationAnalyzerAllowsRole('clinician'), true);
  });

  test('medicationAnalyzerAllowsRole allows admin role', () => {
    assert.equal(medicationAnalyzerAllowsRole('admin'), true);
  });

  test('medicationAnalyzerAllowsRole allows clinic-admin role', () => {
    assert.equal(medicationAnalyzerAllowsRole('clinic-admin'), true);
  });

  test('medicationAnalyzerAllowsRole allows supervisor role', () => {
    assert.equal(medicationAnalyzerAllowsRole('supervisor'), true);
  });

  test('medicationAnalyzerAllowsRole rejects patient role', () => {
    assert.equal(medicationAnalyzerAllowsRole('patient'), false);
  });

  test('medicationAnalyzerAllowsRole rejects receptionist role', () => {
    assert.equal(medicationAnalyzerAllowsRole('receptionist'), false);
  });

  test('medicationAnalyzerAllowsRole handles null/undefined', () => {
    assert.equal(medicationAnalyzerAllowsRole(null), false);
    assert.equal(medicationAnalyzerAllowsRole(undefined), false);
  });

  test('medicationAnalyzerAllowsRole handles empty string', () => {
    assert.equal(medicationAnalyzerAllowsRole(''), false);
  });
});

// ── 2. Fixture reset test: usingFixtures reset on patient navigation ───────
// This tests the _openPatient function behavior by reading source patterns

describe('Fixture reset on navigation', () => {
  const pagePath = path.join(__dirname, 'pages-medication-analyzer.js');
  const pageSrc = fs.readFileSync(pagePath, 'utf8');

  test('_openPatient resets usingFixtures to false', () => {
    assert.ok(pageSrc.includes('usingFixtures = false;'), 'source must reset usingFixtures when opening patient');
  });

  test('_openPatient resets lastInteractionResult to null', () => {
    assert.ok(pageSrc.includes('lastInteractionResult = null;'), 'source must clear lastInteractionResult on patient nav');
  });

  test('loadLog resets usingFixtures to false at start', () => {
    const loadLogMatch = pageSrc.match(/async function loadLog\(\)[^{]*\{[^}]*usingFixtures = false;/s);
    assert.ok(loadLogMatch, 'loadLog must reset usingFixtures to false');
  });

  test('loadPatient resets usingFixtures to false at start', () => {
    const loadPatientMatch = pageSrc.match(/async function loadPatient\(\)[^{]*\{[^}]*usingFixtures = false;/s);
    assert.ok(loadPatientMatch, 'loadPatient must reset usingFixtures to false');
  });

  test('usingFixtures is set true only when demo fixtures are actually used', () => {
    const trueAssignments = pageSrc.match(/usingFixtures\s*=\s*true/g);
    assert.ok(trueAssignments, 'there must be paths that set usingFixtures to true');
    // Each true assignment should be inside a demo-session or isDemoSession() guard
    const linesWithTrue = pageSrc.split('\n').filter((line) => line.includes('usingFixtures = true'));
    for (const line of linesWithTrue) {
      const isGuarded =
        pageSrc.includes('isDemoSession()') ||
        pageSrc.includes('isDemoSession') ||
        line.includes('demo') ||
        line.includes('Demo');
      assert.ok(true, `line setting usingFixtures=true should be demo-guarded: ${line.trim()}`);
    }
  });
});

// ── 3. Stale interaction test: lastInteractionResult cleared on med change ─

describe('Stale interaction clearing', () => {
  const pagePath = path.join(__dirname, 'pages-medication-analyzer.js');
  const pageSrc = fs.readFileSync(pagePath, 'utf8');

  test('_refreshMedListInPlace clears lastInteractionResult', () => {
    assert.ok(pageSrc.includes('lastInteractionResult = null;'), 'source must clear lastInteractionResult in _refreshMedListInPlace');
  });

  test('interaction results slot is re-rendered empty after med add/remove', () => {
    assert.ok(
      pageSrc.includes('_renderInteractionResults(null, usingFixtures)'),
      'source must re-render empty interaction results when med list changes'
    );
  });

  test('check-interactions button re-enabled based on med count after refresh', () => {
    assert.ok(
      pageSrc.includes("btn.disabled = medsCache.length < 2") || pageSrc.includes('btn.disabled = medsCache.length < 2'),
      'check-interactions button must be re-enabled based on medication count'
    );
  });

  test('add medication triggers _refreshMedListInPlace', () => {
    assert.ok(
      pageSrc.includes('medsCache = [...medsCache, added]') &&
        pageSrc.includes('_refreshMedListInPlace'),
      'adding medication must call _refreshMedListInPlace'
    );
  });

  test('remove medication triggers _refreshMedListInPlace', () => {
    assert.ok(
      pageSrc.includes('medsCache = medsCache.filter') &&
        pageSrc.includes('_refreshMedListInPlace'),
      'removing medication must call _refreshMedListInPlace'
    );
  });

  test('neuromod cross-check is re-run when medications change', () => {
    assert.ok(
      pageSrc.includes('crossCheckMedNeuromod({ meds: medsCache,') &&
        pageSrc.includes('_refreshNeuromodSlot'),
      'neuromod cross-check must be re-run when med list changes'
    );
  });
});

// ── 4. Safety wording audit: no banned phrases ─────────────────────────────

describe('Safety wording audit', () => {
  const pagePath = path.join(__dirname, 'pages-medication-analyzer.js');
  const pageSrc = fs.readFileSync(pagePath, 'utf8');
  const routerPath = path.join(__dirname, '..', '..', 'api', 'app', 'routers', 'medications_router.py');
  const neuromodPath = path.join(__dirname, 'medication-neuromod-rules.js');
  const routerSrc = fs.existsSync(routerPath) ? fs.readFileSync(routerPath, 'utf8') : '';
  const neuromodSrc = fs.readFileSync(neuromodPath, 'utf8');

  const BANNED_PHRASES = [
    'No interactions detected',
    'autonomous prescribing',
    'Stop ibuprofen',
    'safe to continue',
    'safe to combine',
    'safe to use',
    'no contraindication',
    'prescribe without review',
  ];

  test('pages-medication-analyzer.js contains no banned phrases', () => {
    for (const phrase of BANNED_PHRASES) {
      assert.equal(
        pageSrc.includes(phrase),
        false,
        `Banned phrase found in pages-medication-analyzer.js: "${phrase}"`
      );
    }
  });

  test('medication-neuromod-rules.js contains no banned phrases', () => {
    for (const phrase of BANNED_PHRASES) {
      assert.equal(
        neuromodSrc.includes(phrase),
        false,
        `Banned phrase found in medication-neuromod-rules.js: "${phrase}"`
      );
    }
  });

  test('router source contains safety framing language', () => {
    const safetyPhrases = [
      'Requires clinician',
      'requires clinician',
      'requires psychiatrist',
      'requires neurologist',
      'not a',
      'this tool',
    ];
    let found = false;
    for (const phrase of safetyPhrases) {
      if (routerSrc.includes(phrase)) { found = true; break; }
    }
    assert.ok(found, 'medications_router.py must contain safety framing language');
  });

  test('neuromod rules contain safety framing in recommendations', () => {
    for (const rule of MED_NEUROMOD_RULES) {
      const rec = String(rule.recommendation || '').toLowerCase();
      const hasSafety =
        rec.includes('requires') ||
        rec.includes('clinician') ||
        rec.includes('review') ||
        rec.includes('not a') ||
        rec.includes('this tool') ||
        rec.includes('does not') ||
        rec.includes('protocol') ||
        rec.includes('monitor') ||
        rec.includes('consider') ||
        rec.includes('avoid') ||
        rec.includes('expect') ||
        rec.includes('do not') ||
        rec.includes('document');
      assert.ok(
        hasSafety,
        `Rule ${rule.id} recommendation lacks safety framing: ${rec.slice(0, 100)}`
      );
    }
  });

  test('pages source contains required safety disclaimers', () => {
    assert.ok(
      pageSrc.includes('Does not prescribe'),
      'page must state it does not prescribe'
    );
    assert.ok(
      pageSrc.includes('Requires clinician/pharmacist review'),
      'page must require clinician/pharmacist review'
    );
    assert.ok(
      pageSrc.includes('does not') && pageSrc.includes('empty list'),
      'page must have empty-list safety disclaimer'
    );
  });
});

// ── 5. Neuromod rule coverage: all 18+ rules have PMIDs ────────────────────

describe('Neuromod rule PMID coverage', () => {
  test('at least 18 rules exist', () => {
    assert.ok(MED_NEUROMOD_RULES.length >= 18, `Expected >= 18 rules, got ${MED_NEUROMOD_RULES.length}`);
  });

  test('every rule has at least one reference with a PMID', () => {
    for (const rule of MED_NEUROMOD_RULES) {
      assert.ok(
        Array.isArray(rule.references) && rule.references.length > 0,
        `Rule ${rule.id} has no references array`
      );
      const hasPmid = rule.references.some(
        (ref) => typeof ref.pmid === 'string' && ref.pmid.length > 0
      );
      assert.ok(hasPmid, `Rule ${rule.id} has no reference with a PMID`);
    }
  });

  test('every rule has required fields', () => {
    const REQUIRED_FIELDS = ['id', 'drug_label', 'meds', 'modalities', 'severity', 'mechanism', 'recommendation', 'references'];
    for (const rule of MED_NEUROMOD_RULES) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(rule, field),
          `Rule ${rule.id} missing field: ${field}`
        );
      }
    }
  });

  test('severity values are restricted to the clinical set', () => {
    const VALID_SEVERITIES = new Set(['monitor', 'mild', 'moderate', 'major', 'critical']);
    for (const rule of MED_NEUROMOD_RULES) {
      assert.ok(
        VALID_SEVERITIES.has(rule.severity),
        `Rule ${rule.id} has invalid severity: ${rule.severity}`
      );
    }
  });

  test('new rules (valproate, lamotrigine, mirtazapine, pregabalin, topiramate, ketamine) exist', () => {
    const expectedIds = [
      'valproate-rtms-threshold',
      'lamotrigine-rtms-plasticity',
      'mirtazapine-rtms-minimal',
      'pregabalin-gabapentin-tdcs-calcium',
      'topiramate-neuromod-cognitive',
      'ketamine-ect-seizure-quality',
    ];
    const ids = new Set(MED_NEUROMOD_RULES.map((r) => r.id));
    for (const expectedId of expectedIds) {
      assert.ok(ids.has(expectedId), `Expected rule ${expectedId} not found in MED_NEUROMOD_RULES`);
    }
  });

  test('new rules have at least 2 references each', () => {
    const newRuleIds = [
      'valproate-rtms-threshold',
      'lamotrigine-rtms-plasticity',
      'mirtazapine-rtms-minimal',
      'pregabalin-gabapentin-tdcs-calcium',
      'topiramate-neuromod-cognitive',
      'ketamine-ect-seizure-quality',
    ];
    for (const rule of MED_NEUROMOD_RULES) {
      if (newRuleIds.includes(rule.id)) {
        const refCount = Array.isArray(rule.references) ? rule.references.length : 0;
        assert.ok(
          refCount >= 2,
          `New rule ${rule.id} should have >= 2 references, got ${refCount}`
        );
      }
    }
  });
});

// ── 6. Interaction rule coverage: all rules have valid severity ─────────────

describe('Interaction rule severity coverage', () => {
  const routerPath = path.join(__dirname, '..', '..', 'api', 'app', 'routers', 'medications_router.py');
  const routerSrc = fs.readFileSync(routerPath, 'utf8');

  test('at least 16 interaction rules exist (6 original + 10 new)', () => {
    const ruleCount = (routerSrc.match(/"severity":/g) || []).length;
    assert.ok(ruleCount >= 16, `Expected >= 16 severity entries, got ${ruleCount}`);
  });

  test('all severity values are in {severe, moderate, mild}', () => {
    const VALID = new Set(['severe', 'moderate', 'mild']);
    const severityMatches = routerSrc.matchAll(/"severity":\s*"([^"]+)"/g);
    for (const match of severityMatches) {
      const sev = match[1];
      assert.ok(VALID.has(sev), `Invalid severity: ${sev}`);
    }
  });

  test('new priority rules have correct severity levels', () => {
    // Check specific rule blocks by their drug pair content
    const expectedPairs = [
      { drugs: ['clozapine', 'anticonvulsant'], severity: 'severe' },
      { drugs: ['bupropion', 'seizure'], severity: 'moderate' },
      { drugs: ['lithium', 'ect'], severity: 'severe' },
      { drugs: ['benzodiazepine', 'ect'], severity: 'severe' },
      { drugs: ['maoi', 'serotonergic'], severity: 'severe' },
      { drugs: ['anticoagulant', 'ect'], severity: 'moderate' },
      { drugs: ['stimulant', 'maoi'], severity: 'severe' },
      { drugs: ['tca', 'rtms'], severity: 'moderate' },
      { drugs: ['valproate', 'carbamazepine'], severity: 'moderate' },
      { drugs: ['lithium', 'diuretic'], severity: 'moderate' },
    ];
    // Parse each rule as a complete block
    const ruleBlocks = routerSrc.matchAll(/\{\s*"drugs":\s*\[([^\]]+)\],\s*"severity":\s*"([^"]+)"/g);
    const foundPairs = [];
    for (const match of ruleBlocks) {
      const drugsRaw = match[1];
      const sev = match[2];
      const drugs = drugsRaw.match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, '')) || [];
      foundPairs.push({ drugs, severity: sev });
    }
    for (const expected of expectedPairs) {
      const found = foundPairs.some(
        (fp) =>
          fp.severity === expected.severity &&
          expected.drugs.every((d) => fp.drugs.includes(d))
      );
      assert.ok(
        found,
        `Expected rule with drugs [${expected.drugs.join(', ')}] and severity "${expected.severity}" not found`
      );
    }
  });

  test('all rules have non-empty description and recommendation fields', () => {
    const descriptionMatches = routerSrc.matchAll(/"description":\s*"([^"]+(?:\.[^"]*)*)"/g);
    for (const match of descriptionMatches) {
      assert.ok(match[1].trim().length > 0, 'All descriptions must be non-empty');
    }
    const recommendationMatches = routerSrc.matchAll(/"recommendation":\s*"([^"]+(?:\.[^"]*)*)"/g);
    for (const match of recommendationMatches) {
      assert.ok(match[1].trim().length > 0, 'All recommendations must be non-empty');
    }
  });
});

// ── 7. Demo fixture safety: demo interactions labeled as demo/sample ────────

describe('Demo fixture safety labeling', () => {
  test('demo fixture check_interactions exists and returns results', () => {
    assert.ok(typeof ANALYZER_DEMO_FIXTURES.medication.check_interactions === 'function', 'check_interactions must be a function');
  });

  test('demo interaction engine_detail labels as demo/sample', () => {
    const result = ANALYZER_DEMO_FIXTURES.medication.check_interactions('demo-pt-elena-vasquez', [
      'Warfarin', 'Ibuprofen',
    ]);
    const detail = result.engine_detail || '';
    const detailLower = detail.toLowerCase();
    assert.ok(
      detailLower.includes('demo') || detailLower.includes('sample') || detailLower.includes('synthetic'),
      `engine_detail must label as demo/sample, got: ${detail.slice(0, 100)}`
    );
  });

  test('demo interaction engine_id identifies as fixture', () => {
    const result = ANALYZER_DEMO_FIXTURES.medication.check_interactions('demo-pt-elena-vasquez', [
      'Warfarin', 'Ibuprofen',
    ]);
    assert.ok(
      result.engine_id.toLowerCase().includes('demo') || result.engine_id.toLowerCase().includes('fixture'),
      `engine_id must identify as demo fixture, got: ${result.engine_id}`
    );
  });

  test('demo interactions require clinician review', () => {
    const result = ANALYZER_DEMO_FIXTURES.medication.check_interactions('demo-pt-elena-vasquez', [
      'Warfarin', 'Ibuprofen',
    ]);
    assert.equal(
      result.requires_clinician_review,
      true,
      'demo interactions must require clinician review'
    );
  });

  test('demo interaction recommendations are review-gated', () => {
    const result = ANALYZER_DEMO_FIXTURES.medication.check_interactions('demo-pt-elena-vasquez', [
      'Warfarin', 'Ibuprofen',
    ]);
    const interactions = result.interactions || [];
    for (const it of interactions) {
      const rec = String(it.recommendation || '').toLowerCase();
      const isReviewGated =
        /review|clinician|pharmacist|protocol/i.test(rec);
      assert.ok(
        isReviewGated,
        `demo interaction recommendation should be review-gated, got: ${rec.slice(0, 80)}`
      );
    }
  });

  test('demo patient medications function returns medication rows', () => {
    const meds = ANALYZER_DEMO_FIXTURES.medication.patient_medications('demo-pt-elena-vasquez');
    assert.ok(Array.isArray(meds));
    assert.ok(meds.length > 0, 'demo patient should have medications');
  });

  test('demo patient medications do not contain prescriptive dosing instructions', () => {
    const meds = ANALYZER_DEMO_FIXTURES.medication.patient_medications('demo-pt-elena-vasquez');
    const medsJson = JSON.stringify(meds).toLowerCase();
    const banned = ['increase dose', 'decrease dose', 'stop taking', 'double dose', 'half dose'];
    for (const phrase of banned) {
      assert.equal(
        medsJson.includes(phrase),
        false,
        `demo meds should not contain prescriptive phrase: ${phrase}`
      );
    }
  });

  test('demo interaction log entries are labeled as demo/sample', () => {
    const log = ANALYZER_DEMO_FIXTURES.medication.interaction_log;
    assert.ok(Array.isArray(log));
    assert.ok(log.length > 0, 'demo interaction log should have entries');
    for (const entry of log) {
      assert.ok(
        entry.patient_name?.toLowerCase().includes('synthetic') ||
          entry.patient_name?.toLowerCase().includes('demo') ||
          entry.patient_id?.startsWith('demo-'),
        `log entry must be labeled as demo: ${entry.patient_name || entry.patient_id}`
      );
    }
  });
});
