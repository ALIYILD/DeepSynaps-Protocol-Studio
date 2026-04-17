/**
 * Unit tests: scale registry, aliases, badges, partitioning (Node built-in test runner).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveScaleCanonical,
  getScaleMeta,
  partitionScalesByEntryMode,
  scaleStatusBadge,
  formatScaleWithBadgeHtml,
  SCALE_REGISTRY,
} from './scale-assessment-registry.js';
import { COND_HUB_META } from './condition-assessment-hub-meta.js';
import { ASSESS_REGISTRY } from './assess-instruments-registry.js';
import { validateScaleRegistryAgainstAssess } from './scale-registry-alignment.js';
import { extractCondHubBundleScaleTokensFromSource } from './cond-hub-bundle-tokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('EPWORTH alias resolves to ESS canonical id', () => {
  assert.equal(resolveScaleCanonical('EPWORTH'), 'ESS');
  assert.equal(resolveScaleCanonical('ESS'), 'ESS');
  const m = getScaleMeta('EPWORTH');
  assert.equal(m.canonical_id, 'ESS');
  assert.equal(m.raw_token, 'EPWORTH');
});

test('HAM-D and CGI map to registry canonical ids', () => {
  assert.equal(resolveScaleCanonical('HAM-D'), 'HAM-D17');
  assert.equal(resolveScaleCanonical('CGI'), 'CGI-S');
});

test('MDQ is item checklist with Part 1 scoring note only in app', () => {
  const m = getScaleMeta('MDQ');
  assert.equal(m.entry_mode, 'item_checklist');
  assert.equal(m.supported_in_app, true);
  assert.match(m.scoring_note || '', /Part 1/i);
});

test('partitionScalesByEntryMode separates in-app, numeric, clinician, unknown', () => {
  const p = partitionScalesByEntryMode(['PHQ-9', 'MADRS', 'AUDIT', 'NOT_IN_REGISTRY']);
  assert.ok(p.inApp.includes('PHQ-9'));
  assert.ok(p.clinician.includes('MADRS'));
  assert.ok(p.numeric.includes('AUDIT'));
  assert.ok(p.unknown.includes('NOT_IN_REGISTRY'));
});

test('partition deduplicates repeated tokens', () => {
  const p = partitionScalesByEntryMode(['PHQ-9', 'PHQ-9', 'GAD-7']);
  assert.equal(p.inApp.filter(x => x === 'PHQ-9').length, 1);
});

test('unknown abbreviation yields safe meta', () => {
  const m = getScaleMeta('ZZZ_UNKNOWN_999');
  assert.equal(m.unknown, true);
  assert.equal(m.entry_mode, 'numeric_only');
  const b = scaleStatusBadge(m);
  assert.equal(b.variant, 'unknown');
});

test('formatScaleWithBadgeHtml does not throw for unknown', () => {
  const h = formatScaleWithBadgeHtml('UNKNOWN_SCALE');
  assert.match(h, /UNKNOWN_SCALE/);
  assert.match(h, /ah2-sb/);
});

test('PANSS badge indicates clinician', () => {
  const b = scaleStatusBadge(getScaleMeta('PANSS'));
  assert.match(b.short, /Clinician/i);
});

test('COND_HUB_META has vetted links for each expected bundle id', () => {
  for (let i = 1; i <= 53; i++) {
    const id = 'CON-' + String(i).padStart(3, '0');
    const row = COND_HUB_META[id];
    assert.ok(row, 'missing ' + id);
    assert.ok(Array.isArray(row.links) && row.links.length >= 1, id + ' has no links');
    for (const L of row.links) {
      assert.ok(L.title && L.url, id + ' link title/url');
      assert.match(L.url, /^https:\/\//);
    }
  }
});

test('SCALE_REGISTRY minimum required ids exist', () => {
  const req = ['PHQ-9', 'GAD-7', 'ISI', 'PCL-5', 'MDQ', 'ESS', 'Y-BOCS', 'WHODAS', 'EDE-Q', 'DAST-10', 'AUDIT', 'PANSS'];
  for (const id of req) {
    assert.ok(SCALE_REGISTRY[id], id);
  }
});

test('SCALE_REGISTRY aligns with ASSESS_REGISTRY (metadata vs inline UI)', () => {
  const { errors } = validateScaleRegistryAgainstAssess(ASSESS_REGISTRY);
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('every scale listed in COND_BUNDLES (pages-clinical) resolves in SCALE_REGISTRY', () => {
  const src = fs.readFileSync(path.join(__dirname, '../pages-clinical-tools.js'), 'utf8');
  const tokens = extractCondHubBundleScaleTokensFromSource(src);
  assert.ok(tokens.length >= 35, 'expected phase-array tokens from COND_BUNDLES');
  for (const raw of tokens) {
    const m = getScaleMeta(raw);
    assert.equal(m.unknown, false, 'bundle references unknown scale token: ' + raw);
  }
});

test('every COND_BUNDLES scale has at least one https official_links entry', () => {
  const src = fs.readFileSync(path.join(__dirname, '../pages-clinical-tools.js'), 'utf8');
  const tokens = extractCondHubBundleScaleTokensFromSource(src);
  for (const raw of tokens) {
    const m = getScaleMeta(raw);
    assert.ok(
      Array.isArray(m.official_links) && m.official_links.length >= 1,
      'add official_links for bundle scale: ' + raw,
    );
    for (const L of m.official_links) {
      assert.ok(L.title && L.url, raw);
      assert.match(L.url, /^https:\/\//);
    }
  }
});
