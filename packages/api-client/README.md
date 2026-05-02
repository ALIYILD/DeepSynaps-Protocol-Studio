# @deepsynaps/api-client

Typed TypeScript client for the DeepSynaps Protocol Studio FastAPI backend,
generated directly from the live `/openapi.json` schema.

## Why this exists

`apps/web/src/api.js` is a 3.9k-line god-object that has been the de-facto
contract between the React frontend and the FastAPI backend. The backend has
**964 inline `BaseModel` classes** in routers, and this client mirrors them
by hand. Every backend tweak risks silent drift.

This package is the **future contract layer**. It does **not** replace
`api.js` today — it stands beside it. Pages migrate one at a time.

## What you get

- `src/openapi-types.ts` — generated types for every path, operation, and
  schema (run `npm run generate` to refresh from a fresh `openapi.json`).
- `src/client.ts` — a tiny, zero-runtime-dependency typed `fetch` wrapper.
- `src/index.ts` — public exports: `apiClient`, `createApiClient`,
  `ApiError`, plus the `paths` / `components` / `operations` types.

```ts
import { apiClient, ApiError } from '@deepsynaps/api-client';
import type { Schemas } from '@deepsynaps/api-client';

try {
  const health = await apiClient.get('/health');
  // `health` is typed from the OpenAPI schema. Auth header is added
  // automatically from the same `ds_access_token` localStorage key
  // used by apps/web/src/api.js.
} catch (err) {
  if (err instanceof ApiError && err.status === 403) { /* … */ }
}
```

## Migration strategy (page-by-page)

1. **Do not edit `apps/web/src/api.js`.** It stays as the source of truth
   for any unmigrated page.
2. To migrate a page, **add** a `apiClient.<method>(...)` call beside the
   existing `api.<helper>(...)` call (additive; old call still works).
3. Once a page's tests confirm parity, switch to the typed client and
   remove the legacy import for that page only.
4. Repeat. Eventually `api.js` shrinks to zero and we can delete it.

A demo migration is checked in: see the `_typedApiClient.get('/health')`
shadow call inside `checkBackendHealth()` in `apps/web/src/app.js`. The
legacy `api.health()` call drives the UI; the typed call runs in parallel
so production logs reveal any drift before we cut over.

## Regenerating types

You need a fresh `openapi.json`. Two ways:

```bash
# (A) From a running local FastAPI on :8000 (or :8001 in CI):
curl -sf http://127.0.0.1:8000/openapi.json \
  > packages/api-client/openapi.json

# (B) From the live Fly app:
curl -sf https://deepsynaps-studio.fly.dev/openapi.json \
  > packages/api-client/openapi.json

# Then regenerate the TS types:
cd packages/api-client && npm run generate
```

Or from the repo root:

```bash
npm run api-client:generate
```

## CI drift detection

`scripts/check-drift.mjs` regenerates `src/openapi-types.ts` from the
checked-in `openapi.json` and fails if the output differs from the
committed file. This catches the case where someone updates
`openapi.json` but forgets to regenerate the TS, or vice versa.

```bash
npm run api-client:check-drift
```

## What this is NOT

- Not a React Query / SWR wrapper. Bring your own.
- Not a runtime validator. Pydantic still validates on the server; types
  here are for compile-time safety only.
- Not a replacement for `api.js` today. See migration strategy above.
