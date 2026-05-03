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
  assert.match(src, /Clinician-reviewed evidence workspace/);
  assert.match(src, /renderLiveEvidencePanel/);
  assert.match(src, /re-live-evidence-host/);
});

test('Bundled evidence dataset does not ship illustrative DOI links for condition drill-down', () => {
  const ds = read('./evidence-dataset.js');
  assert.match(ds, /recentHighImpact.*length = 0/s);
  assert.match(ds, /topPublishingJournals: \[\]/);
});
