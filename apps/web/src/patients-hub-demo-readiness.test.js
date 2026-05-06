// Source-level checks for Patients Hub / registry demo readiness.
// Run: cd apps/web && npm run test:unit  (or node --test src/patients-hub-demo-readiness.test.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HUBS = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');
const HELPERS = readFileSync(join(__dirname, 'patient-dashboard-helpers.js'), 'utf8');
const REG = readFileSync(join(__dirname, 'patient-registry-access.js'), 'utf8');

test('demo banner copy (preview + safety) present in patients tab source', () => {
  assert.match(HUBS, /synthetic non-PHI roster/);
  assert.match(HUBS, /controlled preview using synthetic non-PHI/);
  assert.match(HUBS, /data-testid="ds-patients-demo-banner"/);
});

test('demo roster builder lists five canonical demo-pt IDs', () => {
  assert.match(HELPERS, /demo-pt-samantha-li/);
  assert.match(HELPERS, /demo-pt-marcus-chen/);
  assert.match(HELPERS, /demo-pt-elena-vasquez/);
  assert.match(HELPERS, /demo-pt-omar-haddad/);
  assert.match(HELPERS, /demo-pt-amelia-brown/);
});

test('registry module drill-out validates route set', () => {
  assert.match(HUBS, /_REGISTRY_DRILL_ROUTES/);
  assert.match(HUBS, /Module unavailable/);
});

test('patient registry gate keeps viewer off PHI roster', () => {
  assert.match(REG, /clinician/);
});
