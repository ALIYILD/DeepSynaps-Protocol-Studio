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
