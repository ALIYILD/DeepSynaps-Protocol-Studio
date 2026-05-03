// Documents v2 / workspace route + review badge heuristics
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentsWorkspaceRouteFromSearch } from './documents-v2-route.js';

test('documentsWorkspaceRouteFromSearch preserves documents-v2', () => {
  assert.equal(documentsWorkspaceRouteFromSearch('?page=documents-v2'), 'documents-v2');
});

test('documentsWorkspaceRouteFromSearch preserves legacy documents-hub', () => {
  assert.equal(documentsWorkspaceRouteFromSearch('?page=documents-hub'), 'documents-hub');
});

test('documentsWorkspaceRouteFromSearch defaults to documents-v2', () => {
  assert.equal(documentsWorkspaceRouteFromSearch(''), 'documents-v2');
  assert.equal(documentsWorkspaceRouteFromSearch('?page=dashboard'), 'documents-v2');
});

function dv2ReviewBadgeLike(d) {
  const t = (d.type || '').toLowerCase();
  const st = (d.status || '').toLowerCase();
  const aiDraft = t === 'generated' || (d.notes && /^\[AI-assisted draft/i.test(String(d.notes)));
  if (st === 'signed' || st === 'completed') return 'reviewed';
  if (st === 'superseded') return 'archived';
  if (aiDraft || (st === 'pending' && t === 'generated')) return 'needs_review';
  if (st === 'pending') return 'draft';
  if (st === 'uploaded') return 'attachment';
  return 'other';
}

test('review heuristic: AI-assisted prefix marks needs_review when pending', () => {
  assert.equal(dv2ReviewBadgeLike({ status: 'pending', type: 'clinical', notes: '[AI-assisted draft — x]\nhi' }), 'needs_review');
});

test('review heuristic: signed is reviewed', () => {
  assert.equal(dv2ReviewBadgeLike({ status: 'signed', type: 'generated' }), 'reviewed');
});
