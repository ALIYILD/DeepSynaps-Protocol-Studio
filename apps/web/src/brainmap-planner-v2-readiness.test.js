// Source checks for Brain Map Planner (`brainmap-v2` route → pgBrainMapPlanner).
// Run: node --test src/brainmap-planner-v2-readiness.test.js
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

test('Brain Map Planner exports pgBrainMapPlanner with navigate support', () => {
  const tools = read('./pages-clinical-tools.js');
  assert.match(tools, /export async function pgBrainMapPlanner\(setTopbar, navigate\)/);
});

test('Brain Map Planner documents demo banner for unlinked context', () => {
  const tools = read('./pages-clinical-tools.js');
  assert.match(tools, /data-testid="bmp-demo-banner"/);
  assert.match(tools, /Sample \/ unlinked context/);
});

test('Brain Map Planner exposes clinical shortcut strip', () => {
  const tools = read('./pages-clinical-tools.js');
  assert.match(tools, /data-testid="bmp-quick-nav"/);
  assert.match(tools, /data-testid="bmp-data-checklist"/);
});

test('app.js gates brainmap-v2 from patient portal role', () => {
  const app = read('./app.js');
  assert.match(app, /currentPage === 'brainmap-v2'/);
  assert.match(app, /currentUser\?\.role === 'patient'/);
});

test('app.js hides brainmap-v2 for same roles as legacy brain-map-planner', () => {
  const app = read('./app.js');
  assert.match(app, /'brainmap-v2'/);
  assert.ok(app.includes("'brain-map-planner', 'brainmap-v2'"));
});
