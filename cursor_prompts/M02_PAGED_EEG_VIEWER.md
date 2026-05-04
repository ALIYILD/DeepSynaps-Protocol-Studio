# M2 — Paged EEG viewer (streaming trace)

## Scope

**Paged** EEG display: horizontal time window, vertical channels, stable paging controls, left/right cursors, drag selection optional. Stream downsampled traces from API for current page.

## File targets (primary)

- `apps/web/src/studio/viewer/EegViewer.tsx`
- `apps/web/src/studio/viewer/useEegStream.ts`
- `apps/web/src/studio/viewer/EegCanvas.tsx`, `ChannelRow.tsx`, `PagingController.tsx`
- `apps/web/src/studio/stores/eegViewer.ts`, `stores/view.ts`
- `apps/api/app/routers/studio_eeg_router.py` (or equivalent stream endpoint)

## Data contracts

- **Time**: seconds (`pageStartSec`, `secondsPerPage`, window `[fromSec, toSec)`).
- **Amplitude**: µV after scaling; document gain mapping (`µV/cm` vs pixel).
- **channels**: ordered list after montage derivation (labels as returned by API).

## Acceptance criteria

- [ ] Changing page updates stream request and canvas; no desync between ruler and data.
- [ ] Duration and page label match WinEEG-style labeling (page start → end).
- [ ] Cursors (left/right) persist per session store; optional drag range.
- [ ] Loading and error states visible (no silent failure).

## Tests

- Pytest: stream endpoint returns expected shape for a **short test recording** (fixture or sqlite-seeded id).
- FE: typecheck; optional unit test for time → sample index conversion if isolated.

## Dependencies

M1 shell. Golden: `tests/fixtures/eeg_studio/routine_eyes_open_eyes_closed.edf` (when available).
