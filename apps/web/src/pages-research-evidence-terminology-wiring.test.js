import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PAGE_PATH = resolve(ROOT, 'pages-research-evidence.js');

test('pages-research-evidence imports the terminology expansion panel', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    source,
    /import\s*{\s*renderTerminologyExpansionPanel\s*}\s*from\s*['"]\.\/diagnosis-coding-expansion\.js['"]/,
    'pages-research-evidence.js must import renderTerminologyExpansionPanel from ./diagnosis-coding-expansion.js'
  );
});

test('search flow calls the terminology expansion panel after federated search', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    source,
    /renderTerminologyExpansionPanel\s*\(\s*api\s*,/,
    'Search flow must invoke renderTerminologyExpansionPanel(api, ...) so the panel renders with the live api object'
  );
});

test('terminology expansion container is mounted with a stable id', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  assert.match(
    source,
    /['"]re-ev-terminology-expansion['"]/,
    'Container id must be a stable selector (#re-ev-terminology-expansion) so downstream E2E + a11y tests can target it'
  );
});

test('terminology expansion call passes the search query and targetWorkflow=evidence', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  // The call site uses the search-tab rawQ variable and tags the workflow.
  assert.match(
    source,
    /renderTerminologyExpansionPanel\(\s*api\s*,\s*termContainer\s*,\s*\{[^}]*condition:\s*rawQ[^}]*targetWorkflow:\s*['"]evidence['"][^}]*\}\s*\)/s,
    'Wiring must pass condition: rawQ and targetWorkflow: "evidence" so /query-expansion gets the user-typed query, not a fixture'
  );
});

test('terminology expansion is wrapped in defensive try/catch (no UI breakage on 404)', () => {
  const source = readFileSync(PAGE_PATH, 'utf8');
  // Look for the panel call sitting inside a try block.
  const idx = source.indexOf('renderTerminologyExpansionPanel(api');
  assert.notEqual(idx, -1, 'panel call not found');
  const before = source.slice(Math.max(0, idx - 500), idx);
  assert.match(
    before,
    /try\s*\{/,
    'panel invocation must be inside a try/catch so a missing /query-expansion endpoint or transport failure does not break the rest of the search flow'
  );
});
