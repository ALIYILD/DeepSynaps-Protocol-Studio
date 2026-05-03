/**
 * Phenotype Analyzer — safety copy and absence-of-data wording regressions.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'pages-phenotype-analyzer.js'), 'utf8');

test('phenotype analyzer avoids autonomous diagnosis and treatment-selection claims', () => {
  assert.match(SRC, /hypothesis/i);
  assert.match(SRC, /not a confirmed diagnosis|not a system-confirmed diagnosis/i);
  assert.ok(!/best protocol/i.test(SRC));
  assert.ok(!/eligible for (tms|tdcs|treatment)/i.test(SRC));
});

test('empty clinic state does not imply no clinical concern', () => {
  assert.match(SRC, /does\s+<strong>not<\/strong>\s+mean[\s\S]*no clinical concern/i);
});

test('page documents backend scope (assignments router)', () => {
  assert.match(SRC, /phenotype-assignments/);
});

test('registry panel reframes modality lists as non-prescriptive', () => {
  assert.match(SRC, /Modality families sometimes discussed in literature/);
  assert.match(SRC, /non-prescriptive/);
});
