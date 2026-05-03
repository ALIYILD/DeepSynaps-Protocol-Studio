/**
 * Schedule v2 merge gate — source-level regressions for pgSchedulingHub + API wiring.
 * Run: node --test src/schedule-v2-merge-gate.test.js
 */
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

test('pgSchedulingHub: demo seed requires empty array, not null sessions (API failure)', () => {
  const hubs = read('./pages-clinical-hubs.js');
  assert.ok(
    /const _schedSeededFromDemo = \(Array\.isArray\(sessions\) && sessions\.length === 0 && _schedDemoEnabled\(\)\)/.test(
      hubs,
    ),
    'Demo seed must gate on Array.isArray(sessions) && length===0 so sessions===null does not seed',
  );
});

test('pgSchedulingHub: schedule-v2 navigation target preserved', () => {
  const hubs = read('./pages-clinical-hubs.js');
  assert.ok(/window\._schedHubNavTarget/.test(hubs), '_schedHubNavTarget must exist');
  assert.ok(
    /window\._nav\(window\._schedHubNavTarget \|\| \'scheduling-hub\'\)/.test(hubs),
    'Internal navigations should use _schedHubNavTarget',
  );
});

test('api.js: listSessions uses mapSessionsListQuery', () => {
  const api = read('./api.js');
  assert.ok(/mapSessionsListQuery/.test(api), 'api.js should import and use mapSessionsListQuery');
});

test('api.js: cancelSession does not set session_notes on cancel', () => {
  const api = read('./api.js');
  const m = api.match(/cancelSession:\s*\([^)]*\)\s*=>\s*\{[^}]+}/s);
  assert.ok(m, 'cancelSession block not found');
  assert.ok(
    !/session_notes.*\[Cancelled\]/.test(m[0]),
    'cancelSession must not append [Cancelled] to session_notes (preserves existing notes server-side)',
  );
});

test('api.js: listRooms and checkSlotConflicts call schedule router', () => {
  const api = read('./api.js');
  assert.ok(/\/api\/v1\/schedule\/rooms/.test(api), 'listRooms should hit /api/v1/schedule/rooms');
  assert.ok(/\/api\/v1\/schedule\/conflicts/.test(api), 'checkSlotConflicts should POST /api/v1/schedule/conflicts');
});

test('beta-readiness-utils: mapSessionsListQuery maps from/to', async () => {
  const { mapSessionsListQuery } = await import('./beta-readiness-utils.js');
  const q = mapSessionsListQuery({ from: '2026-06-01', to: '2026-06-07', limit: 10 });
  assert.equal(q.start_date, '2026-06-01');
  assert.equal(q.end_date, '2026-06-08');
  assert.equal(q.limit, 10);
});
