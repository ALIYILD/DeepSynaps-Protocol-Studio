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

test('evidence-ui-live exports cache reset and distinguishes live corpus signals', () => {
  const src = read('./evidence-ui-live.js');
  assert.match(src, /export function resetEvidenceUiStatsCache/);
  assert.match(src, /liveEvidenceService/);
  assert.match(src, /evidenceDbHasRows/);
});
