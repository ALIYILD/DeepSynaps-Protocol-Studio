# Home program tasks — API contract and migration notes

## Recommended client flow

1. **Create** new tasks with **`POST /api/v1/home-program-tasks`**. The server assigns **`serverTaskId`** (authoritative UUID) and **`serverRevision`** (starts at 1).
2. **Persist** `serverTaskId` and **`lastSyncedServerRevision`** (from `serverRevision`) in local state after a successful create.
3. **Update** existing tasks with **`PUT /api/v1/home-program-tasks/{id}`** (external id in the path), sending **`lastKnownServerRevision`** from the last successful sync for optimistic locking.
4. **Replay** is normal: if two tabs POST the same clinician + patient + external id, the second request returns **`createDisposition: "replay"`** with the same row — not an error.

## Response metadata

- **`createDisposition`** (JSON body, preferred):
  - **`created`** — POST inserted a new row.
  - **`replay`** — POST was idempotent (row already existed for that clinician + patient + external id).
  - **`legacy_put_create`** — deprecated path: **PUT** created a row that did not exist. Prefer POST for new tasks.
- **`X-DS-Home-Task-Create`** — legacy header mirroring create vs replay (`new` / `replay`). Prefer the body field for new code.

## Legacy PUT-create

Older clients may still **create** a task with **`PUT /api/v1/home-program-tasks/{id}`** when no row exists. That behavior remains **supported** but is **deprecated**:

- Responses include **`createDisposition: "legacy_put_create"`** when a PUT performed the insert.
- Deprecation markers may include headers such as **`X-DS-Home-Task-Legacy-Put-Create`** and **`Deprecation`**.
- The server logs an audit event (**`hp_legacy_put_create`**) for observability.

There is **no removal date** yet; clients should migrate to POST-first create when convenient.

## Other notes

- **External id** (`id`) stays stable for URLs and payloads; **`serverTaskId`** is the authoritative server identity.
- **Lookup** by server id: **`GET /api/v1/home-program-tasks/by-server-id/{uuid}`**.

## Client helper (JS)

The web bundle exposes **`parseHomeProgramTaskMutationResponse`**, **`mergeParsedMutationIntoLocalTask`**, and **`applySuccessfulSync`** from **`home-program-task-sync.js`** (re-exported from **`api.js`**). Use them to separate **transport** (`createDisposition`, optional headers) from **persisted task state** (`id`, `serverTaskId`, `serverRevision`, content fields).

Preferred entrypoint:

- **`api.mutateHomeProgramTask(task, { force? })`**: performs **POST** when `task.serverTaskId` is missing, otherwise **PUT**. It returns the **normalized mutation result** and (when present) captures transport deprecation headers such as **`Deprecation`** / **`X-DS-Home-Task-Legacy-Put-Create`** into `result.deprecation`.

Normalized shape:

- **`outcome`**: `created` | `replay` | `legacy_put_create` | `updated`
- **`task`**: response body with `createDisposition` stripped
- **`revision`**, **`serverIdentity`**, **`deprecation`**: structured metadata for logging/SDK parity

## Example responses (illustrative)

### POST — created

```json
{
  "id": "htask-abc",
  "patientId": "pt-001",
  "title": "Walk",
  "createDisposition": "created",
  "serverTaskId": "550e8400-e29b-41d4-a716-446655440000",
  "serverRevision": 1,
  "serverCreatedAt": "2026-04-12T10:00:00.000Z",
  "serverUpdatedAt": "2026-04-12T10:00:00.000Z",
  "lastSyncedAt": "2026-04-12T10:00:00.000Z"
}
```

### POST — replay (idempotent)

```json
{
  "id": "htask-abc",
  "patientId": "pt-001",
  "title": "Walk",
  "createDisposition": "replay",
  "serverTaskId": "550e8400-e29b-41d4-a716-446655440000",
  "serverRevision": 1,
  "serverUpdatedAt": "2026-04-12T10:00:00.000Z",
  "lastSyncedAt": "2026-04-12T10:00:00.000Z"
}
```

### PUT — normal update (no `createDisposition`)

```json
{
  "id": "htask-abc",
  "patientId": "pt-001",
  "title": "Walk — edited",
  "serverTaskId": "550e8400-e29b-41d4-a716-446655440000",
  "serverRevision": 2,
  "serverUpdatedAt": "2026-04-12T10:05:00.000Z",
  "lastSyncedAt": "2026-04-12T10:05:00.000Z"
}
```

### PUT — legacy create (deprecated)

```json
{
  "id": "htask-legacy",
  "patientId": "pt-001",
  "title": "Journal",
  "createDisposition": "legacy_put_create",
  "serverTaskId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "serverRevision": 1,
  "serverUpdatedAt": "2026-04-12T10:00:00.000Z",
  "lastSyncedAt": "2026-04-12T10:00:00.000Z"
}
```

Responses may also include deprecation **headers** (e.g. `X-DS-Home-Task-Legacy-Put-Create`); prefer **`createDisposition`** in the body when present.
