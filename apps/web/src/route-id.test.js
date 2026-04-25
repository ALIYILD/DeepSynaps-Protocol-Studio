import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRouteId } from './route-id.js';

test('normalizeRouteId canonicalizes legacy brain-twin route to deeptwin', () => {
  assert.equal(normalizeRouteId('brain-twin'), 'deeptwin');
});

test('normalizeRouteId leaves canonical deeptwin route unchanged', () => {
  assert.equal(normalizeRouteId('deeptwin'), 'deeptwin');
});

test('normalizeRouteId leaves unrelated route ids unchanged', () => {
  assert.equal(normalizeRouteId('patients-v2'), 'patients-v2');
});
