# Clinician Inbox — live readiness

Operational note for **PR #473** and follow-ups. Scope: **`?page=clinician-inbox`** only.

## UI behaviour (hardening)

- **Search** and **category tabs** filter the **last loaded** item list in the browser (no extra API round-trip).
- **Surface** and **status** dropdowns re-fetch from the server (server-side filters).
- If a **background refresh** fails but data was already loaded, a **stale** banner appears with **Retry refresh**; acknowledgements still require API connectivity.

## Route and entry

| Item | Location |
|------|-----------|
| URL | `?page=clinician-inbox` (alias: `?page=inbox`) |
| Router | `apps/web/src/app.js` — `case 'clinician-inbox'` / `case 'inbox'` → `pgClinicianInbox` |
| Page module | `apps/web/src/pages-inbox.js` |
| Auth | Not in `_PUBLIC_ROUTES`; requires signed-in session (`window._isAuthenticated`) |

## API client (`apps/web/src/api.js`)

Relevant exports / `api` methods:

- `isDemoSession()` — preview/demo-login synthetic `*-demo-token` when `VITE_ENABLE_DEMO` / dev.
- `clinicianInboxListItems(params)` — `GET /api/v1/clinician-inbox/items`
- `clinicianInboxSummary()` — `GET /api/v1/clinician-inbox/summary`
- `clinicianInboxAcknowledge`, `clinicianInboxBulkAcknowledge` — POST acknowledge flows
- `clinicianInboxExportCsvBlob()` — authenticated CSV download (Bearer header), preferred over raw cross-origin `href`
- `clinicianInboxExportCsvUrl()` — URL helper only
- `postClinicianInboxAuditEvent` — page-level audit pings

## Backend

| Item | Location |
|------|-----------|
| Router | `apps/api/app/routers/clinician_inbox_router.py` |
| Data source | **`audit_events`** aggregation (HIGH-priority predicate); acknowledgements as additional audit rows — **no dedicated inbox table** |

## Demo behaviour

1. **`apiFetch` demo shim** (`_isDemoSession()`): For Netlify preview + demo token, inbox GETs can be satisfied **without a network call** via `_demoSyntheticResponse` — labelled `is_demo_view: true`.
2. **`pages-inbox.js` fallback**: If demo session **and** list/summary fail or are unusable, **labelled sample rows** from `_buildDemoInboxResponse()` are shown. **Real clinician JWT sessions never use this path** — they get error + Retry instead.

## Production build requirement

- **Vite 7** expects **Node.js `^20.19.0` or `>=22.12.0`**.  
- Local/CI **Node 18** may fail `npm run build` (e.g. `crypto.hash` / engine warnings). **Do not “fix” global toolchain in the inbox PR** — run production build on **Node 20+**.

## Validation notes (agent / constrained environments)

| Check | Result |
|-------|--------|
| `node --test apps/web/src/clinician-inbox-launch-audit.test.js` | **Pass** (run in repo) |
| `npm run typecheck` | May fail on **pre-existing** missing types/deps (vitest, React types, etc.) — **not inbox-specific** |
| `npm run build` on Node 18 | **Expected failure** vs Vite 7 engine — use **Node 20+** for authoritative build |

## Known product gaps (not in this PR)

- No **assign / snooze / archive** workflow model beyond **acknowledge** (audit-row semantics).
- No **dedicated MRI / qEEG / video / biometric job queue** in this inbox unless those modules emit qualifying **audit/activity** rows into the same feed, or a **future unified queue** is implemented.
- No separate **`inbox_items` table** — aggregation is read-only over `audit_events` (+ ack audit rows).

## Merge checklist

- [ ] Route mapped (`clinician-inbox` / `inbox`)
- [ ] Auth guard confirmed (private clinical route)
- [ ] Demo-only synthetic data only for demo session / server `is_demo_view`
- [ ] Real-token API failure does **not** show fake inbox rows
- [ ] CSV export uses **authenticated** fetch (`clinicianInboxExportCsvBlob`)
- [ ] Acknowledge / bulk acknowledge call POST endpoints with required notes
- [ ] Source drill navigates to mapped surface pages; wearables workbench sets monitor tab
- [ ] Clinical decision-support wording visible; **no** autonomous diagnosis/prescribing claims
- [ ] Unit test (`clinician-inbox-launch-audit.test.js`) passes
- [ ] **Node 20.19+** used for final production build in CI
