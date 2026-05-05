// Source-level checks for Reports v2 clinical workspace (pages-clinical-hubs pgReportsHubNew).
// Run: node --test src/reports-v2-source.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return readFileSync(resolve(__dirname, rel), 'utf8');
}

test('pgReportsHubNew includes required clinical safety copy', () => {
  const src = read('./pages-clinical-hubs.js');
  assert.match(
    src,
    /Reports may contain AI-assisted or source-derived drafts/,
    'required disclaimer sentence must be present',
  );
  assert.match(
    src,
    /Final status requires a real governed sign-off workflow/,
    'sign-off workflow copy must be present',
  );
});

test('pgReportsHubNew gates non-clinical roles via canAccessClinicalReportsWorkspace', () => {
  const src = read('./pages-clinical-hubs.js');
  assert.ok(src.includes('canAccessClinicalReportsWorkspace'));
  assert.ok(/Clinical reports workspace/.test(src));
});

test('reports hub navigation preserves route page (reports-v2) not only reports-hub', () => {
  const src = read('./pages-clinical-hubs.js');
  assert.ok(src.includes('getReportsHubRoutePage'));
  assert.ok(src.includes('repNavLit'));
  assert.match(src, /const repPage = getReportsHubRoutePage\(\);/);
  assert.match(src, /const repNavLit = JSON\.stringify\(repPage\);/);
});
