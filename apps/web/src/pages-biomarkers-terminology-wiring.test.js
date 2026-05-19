import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = resolve(ROOT, 'pages-biomarkers.js');

test('pages-biomarkers imports the terminology expansion panel', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    source,
    /import\s*{\s*renderTerminologyExpansionPanel\s*}\s*from\s*['"]\.\/diagnosis-coding-expansion\.js['"]/,
    'pages-biomarkers.js must import renderTerminologyExpansionPanel from ./diagnosis-coding-expansion.js'
  );
});

test('terminology expansion container is mounted with a stable id', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    source,
    /id=['"]bm-terminology-expansion['"]/,
    'Container id must be a stable selector (#bm-terminology-expansion)'
  );
});

test('panel call is debounced and gated to queries of length >= 3', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    source,
    /term\.length\s*<\s*3/,
    'Debounce gate must skip queries shorter than 3 chars to avoid noisy /query-expansion calls'
  );
  assert.match(
    source,
    /setTimeout\(\s*\(\s*\)\s*=>\s*\{[\s\S]*renderTerminologyExpansionPanel/,
    'Panel call must run inside a setTimeout-based debounce, not synchronously on every keystroke'
  );
});

test('_bmRefSearch invokes the terminology trigger before its filter loop', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  // The trigger call name pins the wiring contract.
  assert.match(
    source,
    /window\._bmRefSearch\s*=\s*function\(query\)\s*\{[\s\S]*_bmTriggerTerminologyExpansion\(query\)/,
    'Reference search handler must call _bmTriggerTerminologyExpansion(query) so the panel updates alongside the local filter'
  );
});

test('panel invocation passes targetWorkflow=biomarkers', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    source,
    /renderTerminologyExpansionPanel\(\s*api\s*,\s*container\s*,\s*\{[^}]*targetWorkflow:\s*['"]biomarkers['"][^}]*\}/s,
    'Wiring must tag the query with targetWorkflow: "biomarkers" so the backend knows the consumer'
  );
});

test('panel invocation is wrapped in defensive try/catch', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  const idx = source.indexOf('renderTerminologyExpansionPanel(api');
  assert.notEqual(idx, -1, 'panel call not found');
  const before = source.slice(Math.max(0, idx - 200), idx);
  assert.match(
    before,
    /try\s*\{/,
    'Panel invocation must be inside try/catch so a missing /query-expansion endpoint cannot break the biomarker filter UI'
  );
});
