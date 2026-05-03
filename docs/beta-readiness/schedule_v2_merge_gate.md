# Schedule v2 merge gate (`?page=schedule-v2` / `pgSchedulingHub`)

Use this checklist before merging changes that touch `apps/web/src/pages-clinical-hubs.js` (`pgSchedulingHub`), scheduling API helpers, or session/schedule routers.

## 1. Commands (source of truth: CI with Node 20.19+ / 22.12+ and backend deps)

From `apps/web`:

```bash
npm run build
npm run test
```

Focused scheduling / beta-readiness unit tests (also available as a package script):

```bash
npm run test:schedule-v2-merge-gate
# equivalent:
node --test src/api-scheduling.test.js src/beta-readiness-utils.test.js src/schedule-v2-merge-gate.test.js
```

From `apps/api` (when FastAPI and test deps are installed):

```bash
pytest tests/test_sessions_clinic_scope.py tests/test_schedule_router.py -q
```

If CI differs, **follow the repo’s canonical CI workflow**.

## 2. Behaviour checklist

| Behaviour | How to confirm |
|-----------|----------------|
| Session list uses `start_date` / `end_date` | API receives mapped query (see `mapSessionsListQuery`, `api.listSessions`). Integration: network tab or unit tests in `api-scheduling.test.js`. |
| Create / update / reschedule persist | Exercise wizard against API; verify `POST/PATCH /api/v1/sessions`. |
| Cancel preserves notes | `cancelSession` sends `status` + `cancel_reason` only (does not overwrite `session_notes`). |
| Room list loads | `GET /api/v1/schedule/rooms` via `api.listRooms`. |
| Conflict check | `POST /api/v1/schedule/conflicts`; UI shows honest overlap / no-overlap messaging. |
| API failure → no fake demo grid | When `listSessions` rejects, `sessions` is `null` → **no** demo seed; error banner only. |
| Demo labels sample data | When demo seed runs (`VITE_ENABLE_DEMO` / dev + empty week), yellow demo banner and sample wording. |
| Unauthorized cannot book/edit/cancel | Non-clinician: booking control disabled + toast; mutations require API auth. |
| `schedule-v2` URL stable | `window._schedHubNavTarget` keeps `schedule-v2` when opened via `?page=schedule-v2`. |

## 3. Production warnings (not merge blockers by themselves)

- **Referrals / shift workflows**: Partial; some actions fall back to local/demo behaviour when endpoints are missing.
- **Staff roster**: Derived from loaded appointments + optional staff API — not a full persisted workforce model.
- **Time display**: Uses **browser-local** time for labels and “today”; a **clinic-wide timezone policy** is still needed for multi-site accuracy.
- **`VITE_ENABLE_DEMO`**: Must be **disabled** for real clinic deployments (preview/build flags documented separately).
- **`VITE_API_BASE_URL`**: Must point at the real Fly/clinic API in production.

## 4. Decision-support scope

Schedule v2 is **operational scheduling and clinician workflow support**. It does not auto-approve treatment, diagnose, prescribe, or replace clinician judgment.
