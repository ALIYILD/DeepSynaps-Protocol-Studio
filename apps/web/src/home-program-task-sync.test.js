import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergePatientTasksFromServer,
  applySuccessfulSync,
  mergeParsedMutationIntoLocalTask,
  parseHomeProgramTaskMutationResponse,
  HOME_PROGRAM_MUTATION_OUTCOMES,
  markSyncFailed,
  SYNC_STATUS,
} from './home-program-task-sync.js';

test('merge: server wins when synced', () => {
  const local = [{ id: 'a', title: 'L', lastSyncedServerRevision: 1, _syncStatus: SYNC_STATUS.SYNCED }];
  const server = [{ id: 'a', title: 'S', serverRevision: 2, serverUpdatedAt: '2026-04-12T10:00:00Z' }];
  const out = mergePatientTasksFromServer(local, server);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'S');
  assert.equal(out[0].lastSyncedServerRevision, 2);
});

test('merge: pending without baseline revision keeps local', () => {
  const local = [{ id: 'a', title: 'Local', _syncStatus: SYNC_STATUS.PENDING }];
  const server = [{ id: 'a', title: 'S', serverRevision: 1, serverUpdatedAt: '2026-04-12T10:00:00Z' }];
  const out = mergePatientTasksFromServer(local, server);
  assert.equal(out[0].title, 'Local');
});

test('merge: pending with baseline and server advanced → conflict', () => {
  const local = [{
    id: 'a',
    title: 'Local',
    _syncStatus: SYNC_STATUS.PENDING,
    lastSyncedServerRevision: 1,
  }];
  const server = [{ id: 'a', title: 'Remote', serverRevision: 2, serverUpdatedAt: '2026-04-12T11:00:00Z' }];
  const out = mergePatientTasksFromServer(local, server);
  assert.equal(out[0]._syncStatus, SYNC_STATUS.CONFLICT);
  assert.ok(out[0]._conflictServerTask);
});

test('applySuccessfulSync clears pending', () => {
  const t = { id: 'x', _syncStatus: SYNC_STATUS.SYNCING };
  const res = applySuccessfulSync(t, {
    id: 'x',
    serverRevision: 3,
    serverUpdatedAt: '2026-04-12T12:00:00Z',
    title: 'OK',
  });
  assert.equal(res._syncStatus, SYNC_STATUS.SYNCED);
  assert.equal(res.lastSyncedServerRevision, 3);
});

test('applySuccessfulSync strips createDisposition (API-only)', () => {
  const t = { id: 'x', _syncStatus: SYNC_STATUS.SYNCING };
  const res = applySuccessfulSync(t, {
    id: 'x',
    serverRevision: 1,
    createDisposition: 'created',
    title: 'T',
  });
  assert.equal(res.title, 'T');
  assert.equal(res.createDisposition, undefined);
});

test('markSyncFailed', () => {
  const t = { id: 'x' };
  const f = markSyncFailed(t);
  assert.equal(f._syncStatus, SYNC_STATUS.PENDING);
});

test('parseMutation: created', () => {
  const p = parseHomeProgramTaskMutationResponse({
    id: 't1',
    createDisposition: 'created',
    serverTaskId: '550e8400-e29b-41d4-a716-446655440000',
    serverRevision: 1,
    title: 'Walk',
  });
  assert.equal(p.outcome, HOME_PROGRAM_MUTATION_OUTCOMES.CREATED);
  assert.equal(p.task.createDisposition, undefined);
  assert.equal(p.revision.serverRevision, 1);
  assert.equal(p.serverIdentity.serverTaskId, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(p.deprecation.legacyPutCreate, false);
  assert.equal(p.isValidResponse, true);
});

test('parseMutation: replay', () => {
  const p = parseHomeProgramTaskMutationResponse({
    id: 't1',
    createDisposition: 'replay',
    serverRevision: 1,
    serverTaskId: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.equal(p.outcome, HOME_PROGRAM_MUTATION_OUTCOMES.REPLAY);
});

test('parseMutation: legacy_put_create', () => {
  const p = parseHomeProgramTaskMutationResponse({
    id: 't1',
    createDisposition: 'legacy_put_create',
    serverRevision: 1,
    serverTaskId: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.equal(p.outcome, HOME_PROGRAM_MUTATION_OUTCOMES.LEGACY_PUT_CREATE);
  assert.equal(p.deprecation.legacyPutCreate, true);
});

test('parseMutation: normal PUT update → updated', () => {
  const p = parseHomeProgramTaskMutationResponse({
    id: 't1',
    serverRevision: 2,
    serverTaskId: '550e8400-e29b-41d4-a716-446655440000',
    title: 'v2',
  });
  assert.equal(p.outcome, HOME_PROGRAM_MUTATION_OUTCOMES.UPDATED);
});

test('parseMutation: optional header hints legacy PUT without body field', () => {
  const p = parseHomeProgramTaskMutationResponse(
    { id: 't1', serverRevision: 1, serverTaskId: '550e8400-e29b-41d4-a716-446655440000' },
    { legacyPutCreateHeader: true },
  );
  assert.equal(p.outcome, HOME_PROGRAM_MUTATION_OUTCOMES.UPDATED);
  assert.equal(p.deprecation.legacyPutCreate, true);
});

test('mergeParsed + parse roundtrip matches applySuccessfulSync', () => {
  const t = { id: 'x', patientId: 'p1', _syncStatus: SYNC_STATUS.SYNCING };
  const body = {
    id: 'x',
    patientId: 'p1',
    serverRevision: 2,
    serverUpdatedAt: '2026-04-12T12:00:00Z',
    title: 'OK',
  };
  const a = applySuccessfulSync(t, body);
  const b = mergeParsedMutationIntoLocalTask(t, parseHomeProgramTaskMutationResponse(body));
  assert.equal(a.title, b.title);
  assert.equal(a.lastSyncedServerRevision, b.lastSyncedServerRevision);
});

test('parseMutation: invalid body → merge yields pending', () => {
  const t = { id: 'x', _syncStatus: SYNC_STATUS.SYNCING };
  const p = parseHomeProgramTaskMutationResponse(null);
  assert.equal(p.isValidResponse, false);
  assert.equal(mergeParsedMutationIntoLocalTask(t, p)._syncStatus, SYNC_STATUS.PENDING);
});

// ── Branch-coverage additions for merge + parse defensive paths ───────────

test('mergePatientTasksFromServer: null/undefined local and server lists are tolerated', () => {
  // Hits the (localTasks || []) and (serverTasks || []) || branches on
  // lines 119-120 and 124, 168.
  assert.deepStrictEqual(mergePatientTasksFromServer(null, null), []);
  assert.deepStrictEqual(mergePatientTasksFromServer(undefined, undefined), []);
});

test('mergePatientTasksFromServer: server-only rows are appended as synced', () => {
  // Hits the second for-loop (line 168) when consumedServer set is empty.
  const out = mergePatientTasksFromServer([], [
    { id: 'new', title: 'fresh', serverRevision: 5, serverUpdatedAt: '2026-04-15T00:00:00Z' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]._syncStatus, SYNC_STATUS.SYNCED);
  assert.equal(out[0].lastSyncedServerRevision, 5);
});

test('mergePatientTasksFromServer: local-only rows are kept verbatim', () => {
  // Hits the `if (!s) out.push(local)` branch on line 126.
  const local = [{ id: 'local-only', title: 'mine', _syncStatus: SYNC_STATUS.PENDING }];
  const out = mergePatientTasksFromServer(local, []);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'mine');
});

test('mergePatientTasksFromServer: existing CONFLICT row sticks through merge', () => {
  // Hits the CONFLICT branch on line 135.
  const local = [{
    id: 'c',
    title: 'local',
    _syncStatus: SYNC_STATUS.CONFLICT,
    lastSyncedServerRevision: 1,
  }];
  const server = [{ id: 'c', title: 'remote', serverRevision: 9 }];
  const out = mergePatientTasksFromServer(local, server);
  assert.equal(out[0]._syncStatus, SYNC_STATUS.CONFLICT);
  assert.equal(out[0].title, 'local');
});

test('mergePatientTasksFromServer: PENDING with baseline but no server advance keeps local', () => {
  // Hits line 155: out.push(local) after `if (srev > lrev)` is false.
  const local = [{
    id: 'pending-stable',
    title: 'mine',
    _syncStatus: SYNC_STATUS.PENDING,
    lastSyncedServerRevision: 5,
  }];
  const server = [{ id: 'pending-stable', title: 'remote', serverRevision: 5 }];
  const out = mergePatientTasksFromServer(local, server);
  assert.equal(out[0]._syncStatus, SYNC_STATUS.PENDING);
  assert.equal(out[0].title, 'mine');
});

test('mergePatientTasksFromServer: default _syncStatus is SYNCED when missing', () => {
  // Hits line 131: local._syncStatus || SYNC_STATUS.SYNCED falsy branch.
  const local = [{ id: 'no-status', title: 'L' }]; // no _syncStatus
  const server = [{ id: 'no-status', title: 'S', serverRevision: 7 }];
  const out = mergePatientTasksFromServer(local, server);
  assert.equal(out[0].title, 'S');
  assert.equal(out[0]._syncStatus, SYNC_STATUS.SYNCED);
});

test('mergePatientTasksFromServer: missing serverRevision treats srev as 0', () => {
  // Hits line 133: Number(s.serverRevision) || 0 fallback.
  const local = [{
    id: 'no-srev',
    title: 'mine',
    _syncStatus: SYNC_STATUS.PENDING,
    lastSyncedServerRevision: 0,
  }];
  const server = [{ id: 'no-srev', title: 'remote' /* no serverRevision */ }];
  const out = mergePatientTasksFromServer(local, server);
  // srev (0) is not > lrev (0) → keep local pending.
  assert.equal(out[0]._syncStatus, SYNC_STATUS.PENDING);
});

test('mergePatientTasksFromServer: synced row falls back to lastSyncedAt when serverUpdatedAt missing', () => {
  // Hits line 162: s.serverUpdatedAt || s.lastSyncedAt fallback.
  const local = [{ id: 'a', _syncStatus: SYNC_STATUS.SYNCED, lastSyncedServerRevision: 1 }];
  const server = [{ id: 'a', serverRevision: 2, lastSyncedAt: '2026-04-12T09:00:00Z' /* no serverUpdatedAt */ }];
  const out = mergePatientTasksFromServer(local, server);
  assert.equal(out[0].lastSyncedAt, '2026-04-12T09:00:00Z');
});

test('mergePatientTasksFromServer: server-only row falls back to lastSyncedAt', () => {
  // Hits line 170: s.serverUpdatedAt || s.lastSyncedAt fallback in second loop.
  const out = mergePatientTasksFromServer([], [
    { id: 'srv-only', serverRevision: 3, lastSyncedAt: '2026-04-13T00:00:00Z' /* no serverUpdatedAt */ },
  ]);
  assert.equal(out[0].lastSyncedAt, '2026-04-13T00:00:00Z');
});

test('parseMutation: missing serverRevision yields undefined revision', () => {
  // Hits line 65: responseBody.serverRevision != null falsy branch.
  const p = parseHomeProgramTaskMutationResponse({ id: 't', title: 'v1' });
  assert.equal(p.revision.serverRevision, undefined);
});

test('parseMutation: legacyPutCreateHeader=\"true\" string also flips deprecation flag', () => {
  // Hits the "=== 'true'" string side of the || on line 68.
  const p = parseHomeProgramTaskMutationResponse(
    { id: 't', serverRevision: 1 },
    { legacyPutCreateHeader: 'true' },
  );
  assert.equal(p.deprecation.legacyPutCreate, true);
});

test('mergeParsedMutation: falls back to existing lastSyncedServerRevision when clean lacks serverRevision', () => {
  // Hits line 100: clean.serverRevision ?? task.lastSyncedServerRevision branch.
  const t = { id: 'x', lastSyncedServerRevision: 9, _syncStatus: SYNC_STATUS.SYNCING };
  const parsed = parseHomeProgramTaskMutationResponse({ id: 'x', title: 'v2' }); // no serverRevision
  const out = mergeParsedMutationIntoLocalTask(t, parsed);
  assert.equal(out.lastSyncedServerRevision, 9);
});
