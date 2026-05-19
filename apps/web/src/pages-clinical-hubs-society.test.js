import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const src = readFileSync(resolve(__dirname, './pages-clinical-hubs.js'), 'utf8');

test('Protocol Studio page shows society resources as catalogued contextual links', () => {
  assert.match(src, /societyResources/);
  assert.match(src, /societyLifecycle/);
  assert.match(src, /_fetchSocietyResources/);
  assert.match(src, /_renderSocietyResourcesPanel/);
  assert.match(src, /protocol-society-resources-panel/);
  assert.match(src, /Contextual links only\. No fake abstracts/i);
  assert.match(src, /patient resources are not clinician guidelines/i);
  assert.match(src, /guideline-awareness/i);
  assert.match(src, /structured search is exposed in this build/i);
});
