// pages-qeeg-analysis-pr1-safety.test.js — PR 1 qEEG analyzer safety + demo copy
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readPages = () => fs.readFileSync(path.join(__dirname, 'pages-qeeg-analysis.js'), 'utf8');

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

const pageMod = await import('./pages-qeeg-analysis.js');

// Regulatory FAIL strings from QEEG_REGULATORY_AUDIT.md — must not appear in demo source.
const AUDIT_FAIL_SNIPPETS = [
  'CLINICAL IMPRESSION',
  'Occasional focal spikes',
  'epileptiform discharges',
  'suggestive of structural lesions',
  'Treatment and Assistive Strategies',
  'Grade A evidence',
  'clinical concern threshold',
  'Clinical re-evaluation is recommended',
];

test('TAB_META lists exactly seven tab ids', () => {
  const { TAB_META } = pageMod;
  const keys = Object.keys(TAB_META).sort();
  assert.deepEqual(keys, ['analysis', 'compare', 'erp', 'learning', 'patient', 'raw', 'report'].sort());
});

test('safety footer test hook renders data-testid and canonical phrases', () => {
  const html = pageMod.renderQEEGClinicalSafetyFooterForTest();
  assert.match(html, /data-testid="qeeg-safety-footer"/);
  assert.match(html, /not autonomous diagnosis/);
  assert.match(html, /Normative Model Card/);
  assert.match(html, /draft ideas for clinician review/);
});

test('pages-qeeg-analysis imports clinical-ai-safety-copy footer bullets', () => {
  const src = readPages();
  assert.match(src, /from '\.\/clinical-ai-safety-copy\.js'/);
  assert.match(src, /QEEG_ANALYZER_SAFETY_FOOTER_BULLETS/);
});

test('demo / narrative source does not contain audit FAIL snippets', () => {
  const src = readPages();
  AUDIT_FAIL_SNIPPETS.forEach((snippet) => {
    assert.ok(
      !src.includes(snippet),
      'Banned audit snippet still present: ' + snippet,
    );
  });
});

test('MNE pipeline remains blocked for demo analysis id (string guard)', () => {
  const src = readPages();
  assert.match(src, /analysisId === 'demo'/);
  assert.match(src, /Demo analyses cannot be re-run on the MNE pipeline/);
});

test('_aiUpgradesFeatureFlagEnabled is exported and boolean-coerces', () => {
  assert.equal(typeof pageMod._aiUpgradesFeatureFlagEnabled, 'function');
  globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES = false;
  assert.equal(pageMod._aiUpgradesFeatureFlagEnabled(), false);
  globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES = true;
  assert.equal(pageMod._aiUpgradesFeatureFlagEnabled(), true);
});
