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

test('Research Evidence unified search uses honest empty, auth messaging, and corpus wiring', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /_libUnifiedEvidenceSearch/);
  assert.match(src, /searchEvidencePapers/);
  assert.match(src, /renderEvidenceResultCard/);
  assert.match(src, /No verified results found for this query in the connected evidence sources/);
  assert.match(src, /Sign in as clinical staff to search the evidence service/);
  assert.match(src, /Indexed evidence corpus available/);
  assert.match(src, /Example queries:/);
  assert.match(src, /depression rTMS/);
  assert.match(src, /re-ev-search-source/);
  assert.match(src, /Indexed evidence corpus unavailable in this preview environment/);
  assert.match(src, /No direct link available from this record/);
});

test('Degraded banner hides when indexed corpus flag set; status drives Indexed DB badge', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /indexedCorpusAvailable/);
  assert.match(src, /Indexed DB/);
  assert.match(src, /Indexed evidence corpus unavailable in this preview environment/);
});

test('Bundled evidence dataset does not ship illustrative DOI links for condition drill-down', () => {
  const ds = read('./evidence-dataset.js');
  assert.match(ds, /recentHighImpact.*length = 0/s);
  assert.match(ds, /topPublishingJournals: \[\]/);
});
