import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const src = readFileSync(resolve(__dirname, './pages-research-evidence.js'), 'utf8');

test('Research Evidence page wires society resources as contextual links only', () => {
  assert.match(src, /societyResourceSources/);
  assert.match(src, /Neuroscience society resources/);
  assert.match(src, /structured search unavailable in this build/i);
  assert.match(src, /links are catalogued for awareness only/i);
  assert.match(src, /conference abstracts and society pages are not primary peer-reviewed evidence/i);
});
