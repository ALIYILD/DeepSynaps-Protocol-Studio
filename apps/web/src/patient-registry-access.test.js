import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessPatientRegistry } from './patient-registry-access.js';

test('canAccessPatientRegistry allows clinical staff', () => {
  assert.equal(canAccessPatientRegistry({ role: 'clinician' }), true);
  assert.equal(canAccessPatientRegistry({ role: 'technician' }), true);
  assert.equal(canAccessPatientRegistry({ role: 'reviewer' }), true);
  assert.equal(canAccessPatientRegistry({ role: 'admin' }), true);
});

test('canAccessPatientRegistry denies non-clinical roles', () => {
  assert.equal(canAccessPatientRegistry({ role: 'guest' }), false);
  assert.equal(canAccessPatientRegistry({ role: 'patient' }), false);
  assert.equal(canAccessPatientRegistry(null), false);
});
