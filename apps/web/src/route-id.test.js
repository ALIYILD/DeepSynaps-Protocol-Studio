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

test('normalizeRouteId returns non-string input unchanged (typeof guard)', () => {
  assert.equal(normalizeRouteId(undefined), undefined);
  assert.equal(normalizeRouteId(null), null);
  assert.equal(normalizeRouteId(42), 42);
  const obj = { foo: 'bar' };
  assert.equal(normalizeRouteId(obj), obj);
});

test('normalizeRouteId canonicalizes remaining legacy aliases', () => {
  assert.equal(normalizeRouteId('video-assessments-patient'), 'video-assessments-capture');
  assert.equal(normalizeRouteId('video-assessments-clinician'), 'video-assessments-review');
  assert.equal(normalizeRouteId('onboarding'), 'onboarding-wizard');
});
