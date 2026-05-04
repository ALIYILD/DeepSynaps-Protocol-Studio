# M9 — ERP / ERD / wavelet / ICA-on-ERP / PFA

## Scope

**ERP averages**, **ERD/ERS**, **time-frequency** (wavelet), **ICA on ERP**, **PFA** per product roadmap. Trial inclusion honors M5.

## File targets (primary)

- `apps/web/src/studio/erp/` (`StudioErpMenu`, dialogs, plot components)
- `apps/api/app/routers/studio_erp_router.py`
- Shared types under `apps/web/src/studio/erp/types.ts` (or equivalent)

## Data contracts

- Request includes **trial ids** / stimulus classes, baseline window, response mapping.
- Returns summaries suitable for **AI store** `erpComputationChanged`.

## Acceptance criteria

- [ ] ERP plot matches trial definitions (included/excluded).
- [ ] Peak latency/amplitude exported or displayed with units (µV, ms).
- [ ] Golden `oddball_p300.edf` / `gonogo_tova.edf` scenarios documented with tolerances.

## Tests

- Pytest: average ERP vector shape and peak within tolerance vs reference.
- FE typecheck.

## Dependencies

M5–M8.
