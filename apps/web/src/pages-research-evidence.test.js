import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function read(rel) {
  return readFileSync(resolve(__dirname, rel), 'utf8');
}

test('Research Evidence page exposes governance banner and live evidence panel', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /controlled preview evidence workspace/i);
  assert.match(src, /Bundled registry rollups are for navigation and preview context/i);
  assert.match(src, /Live evidence service unavailable/i);
  assert.match(src, /Live evidence service \(aggregated counts from API\)/);
  assert.match(src, /renderLiveEvidencePanel/);
  assert.match(src, /re-live-evidence-host/);
});

test('Research Evidence external search uses honest empty and auth messaging', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /No verified results found/);
  assert.match(src, /Sign in as a clinician to run brokered external search/);
});

test('Bundled evidence dataset does not ship illustrative DOI links for condition drill-down', () => {
  const ds = read('./evidence-dataset.js');
  assert.match(ds, /recentHighImpact.*length = 0/s);
  assert.match(ds, /topPublishingJournals: \[\]/);
});
