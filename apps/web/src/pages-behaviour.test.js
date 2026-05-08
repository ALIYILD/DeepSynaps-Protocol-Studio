/**
 * Behaviour workspace helpers — unit tests (no DOM).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUseBehaviourWorkspace,
  applyBehaviourPatientContext,
} from './pages-behaviour.js';

test('canUseBehaviourWorkspace allows clinician and admin', () => {
  assert.equal(canUseBehaviourWorkspace('clinician'), true);
  assert.equal(canUseBehaviourWorkspace('admin'), true);
  assert.equal(canUseBehaviourWorkspace('clinic-admin'), true);
  assert.equal(canUseBehaviourWorkspace('supervisor'), true);
  assert.equal(canUseBehaviourWorkspace('patient'), false);
  assert.equal(canUseBehaviourWorkspace(''), false);
  assert.equal(canUseBehaviourWorkspace(null), false);
});

test('canUseBehaviourWorkspace allowUnknown opts', () => {
  assert.equal(canUseBehaviourWorkspace('', { allowUnknown: true }), true);
  assert.equal(canUseBehaviourWorkspace(null, { allowUnknown: false }), false);
});

test('applyBehaviourPatientContext sets window ids', () => {
  const win = {};
  applyBehaviourPatientContext('behaviour', 'pt-123', win);
  assert.equal(win._selectedPatientId, 'pt-123');
  assert.equal(win._profilePatientId, 'pt-123');
  assert.equal(win._behaviourPatientId, 'pt-123');
});

test('applyBehaviourPatientContext no-ops with missing pid', () => {
  const win = { _selectedPatientId: 'keep' };
  applyBehaviourPatientContext('behaviour', '', win);
  assert.equal(win._selectedPatientId, 'keep');
});
