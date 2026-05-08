import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return readFileSync(resolve(__dirname, rel), 'utf8');
}

test('Evidence Search doctor card renderer and wiring strings', () => {
  const src = read('./pages-research-evidence.js');
  assert.match(src, /renderEvidenceResultCard/);
  assert.match(src, /No direct link available from this record/);
  assert.match(src, /Abstract unavailable from this record/);
  assert.match(src, /Europe PMC/);
  assert.match(src, /OpenAlex/);
  assert.match(src, /Indexed DB/);
  assert.match(src, /Brokered search/);
  assert.match(src, /Curated library/);
  assert.match(src, /Expanded query terms used for retrieval/);
  assert.match(src, /Evidence relationship summary/);
  assert.match(src, /literature-index summaries, not clinical recommendations/);
  assert.match(src, /Related trials\/devices signals/);
  assert.match(src, /re-ev-filter-modality/);
  assert.match(src, /searchEvidencePapers\(/);
  assert.match(src, /libraryExternalSearch/);
  assert.match(src, /listResearchEvidenceGraph/);
  assert.match(src, /searchEvidenceTrials/);
  assert.match(src, /searchEvidenceDevices/);
  assert.match(src, /searchResearchPapers/);
  assert.match(src, /_reDedupeKey/);
});

test('API client passes indexed paper query params', () => {
  const apiSrc = read('./api.js');
  assert.match(apiSrc, /include_abstract/);
  assert.match(apiSrc, /has_abstract/);
  assert.match(apiSrc, /year_min/);
  assert.match(apiSrc, /modality/);
});
