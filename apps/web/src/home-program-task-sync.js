/**
 * Deterministic merge + sync helpers for clinician home program tasks (localStorage ↔ API).
 * @module home-program-task-sync
 */

export const SYNC_STATUS = {
  SYNCED: 'synced',
  PENDING: 'pending',
  SYNCING: 'syncing',
  CONFLICT: 'conflict',
};

/** Canonical mutation outcomes (aligned with API `createDisposition` + implicit PUT update). */
export const HOME_PROGRAM_MUTATION_OUTCOMES = Object.freeze({
  CREATED: 'created',
  REPLAY: 'replay',
  LEGACY_PUT_CREATE: 'legacy_put_create',
  UPDATED: 'updated',
});

/**
 * Parse a successful POST/PUT home program task mutation JSON body into transport metadata + clean task fields.
 * `createDisposition` is the authoritative signal; absence on PUT means a normal update.
 *
 * @param {object | null | undefined} responseBody — Parsed JSON body from create/upsert.
 * @param {{ legacyPutCreateHeader?: boolean, deprecationHeader?: string | null }} [transport] — Optional fetch metadata (e.g. if the caller captured response headers).
 * @returns {{
 *   outcome: 'created'|'replay'|'legacy_put_create'|'updated',
 *   task: object,
 *   revision: { serverRevision?: number },
 *   serverIdentity: { serverTaskId?: string, id?: string },
 *   deprecation: { legacyPutCreate: boolean, deprecationHeader?: string | null },
 *   isValidResponse: boolean,
 * }}
 */
export function parseHomeProgramTaskMutationResponse(responseBody, transport = {}) {
  if (responseBody == null || typeof responseBody !== 'object') {
    return {
      outcome: HOME_PROGRAM_MUTATION_OUTCOMES.UPDATED,
      task: {},
      revision: {},
      serverIdentity: {},
      deprecation: {
        legacyPutCreate: false,
        deprecationHeader: transport.deprecationHeader ?? null,
      },
      isValidResponse: false,
    };
  }

  const disp = responseBody.createDisposition;
  let outcome;
  if (
    disp === HOME_PROGRAM_MUTATION_OUTCOMES.CREATED ||
    disp === HOME_PROGRAM_MUTATION_OUTCOMES.REPLAY ||
    disp === HOME_PROGRAM_MUTATION_OUTCOMES.LEGACY_PUT_CREATE
  ) {
    outcome = disp;
  } else {
    outcome = HOME_PROGRAM_MUTATION_OUTCOMES.UPDATED;
  }

  const { createDisposition: _disp, ...taskFields } = responseBody;
  const serverRevision =
    responseBody.serverRevision != null ? Number(responseBody.serverRevision) : undefined;

  const headerLegacy =
    transport.legacyPutCreateHeader === true ||
    transport.legacyPutCreateHeader === 'true';

  return {
    outcome,
    task: taskFields,
    revision: { serverRevision },
    serverIdentity: {
      serverTaskId: responseBody.serverTaskId,
      id: responseBody.id,
    },
    deprecation: {
      legacyPutCreate: outcome === HOME_PROGRAM_MUTATION_OUTCOMES.LEGACY_PUT_CREATE || headerLegacy,
      deprecationHeader: transport.deprecationHeader ?? null,
    },
    isValidResponse: responseBody.id != null,
  };
}

/**
 * Merge a parsed mutation into local task state (no transport fields persisted).
 * @param {object} task — Local task row.
 * @param {ReturnType<typeof parseHomeProgramTaskMutationResponse>} parsed
 */
export function mergeParsedMutationIntoLocalTask(task, parsed) {
  if (!parsed.isValidResponse) {
    return { ...task, _syncStatus: SYNC_STATUS.PENDING };
  }
  const clean = parsed.task;
  return {
    ...task,
    ...clean,
    lastSyncedServerRevision: clean.serverRevision ?? task.lastSyncedServerRevision,
    lastSyncedAt: clean.serverUpdatedAt || clean.lastSyncedAt,
    _syncStatus: SYNC_STATUS.SYNCED,
    _conflictServerTask: undefined,
    _syncConflictReason: undefined,
  };
}

/**
 * Merge server list into local tasks for one patient.
 * - Pending local edits are kept when server revision has not advanced.
 * - If server revision advanced while local had pending unsynced edits → conflict (server snapshot attached).
 * - Synced rows follow server as source of truth with revision metadata.
 *
 * @param {object[]} localTasks
 * @param {object[]} serverTasks
 * @returns {object[]}
 */
export function mergePatientTasksFromServer(localTasks, serverTasks) {
  const localById = new Map((localTasks || []).map((t) => [t.id, t]));
  const serverById = new Map((serverTasks || []).map((t) => [t.id, t]));
  const out = [];
  const consumedServer = new Set();

  for (const local of localTasks || []) {
    const s = serverById.get(local.id);
    if (!s) {
      out.push(local);
      continue;
    }
    consumedServer.add(local.id);
    const st = local._syncStatus || SYNC_STATUS.SYNCED;
    const lrev = Number(local.lastSyncedServerRevision) || 0;
    const srev = Number(s.serverRevision) || 0;

    if (st === SYNC_STATUS.CONFLICT) {
      out.push(local);
      continue;
    }

    if (st === SYNC_STATUS.PENDING || st === SYNC_STATUS.SYNCING) {
      // No baseline revision yet (never synced) — keep local and retry; do not false-conflict vs server.
      if (local.lastSyncedServerRevision == null) {
        out.push(local);
        continue;
      }
      if (srev > lrev) {
        out.push({
          ...local,
          _syncStatus: SYNC_STATUS.CONFLICT,
          _conflictServerTask: s,
          _syncConflictReason: 'server_advanced_while_pending',
        });
        continue;
      }
      out.push(local);
      continue;
    }

    out.push({
      ...s,
      lastSyncedServerRevision: s.serverRevision,
      lastSyncedAt: s.serverUpdatedAt || s.lastSyncedAt,
      clientUpdatedAt: local.clientUpdatedAt || s.clientUpdatedAt,
      _syncStatus: SYNC_STATUS.SYNCED,
    });
  }

  for (const s of serverTasks || []) {
    if (consumedServer.has(s.id)) continue;
    out.push({
      ...s,
      lastSyncedServerRevision: s.serverRevision,
      lastSyncedAt: s.serverUpdatedAt || s.lastSyncedAt,
      _syncStatus: SYNC_STATUS.SYNCED,
    });
  }

  return out;
}

/**
 * Apply successful create/PUT response body onto a local task object (uses {@link parseHomeProgramTaskMutationResponse}).
 */
export function applySuccessfulSync(task, responseBody) {
  return mergeParsedMutationIntoLocalTask(task, parseHomeProgramTaskMutationResponse(responseBody));
}

/**
 * Mark task as pending sync after a failed network/API call (provenance preserved in task).
 */
export function markSyncFailed(task) {
  return { ...task, _syncStatus: SYNC_STATUS.PENDING };
}
