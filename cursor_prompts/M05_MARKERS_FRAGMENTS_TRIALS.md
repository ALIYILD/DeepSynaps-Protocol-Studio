# M5 — Markers, fragments, trials

## Scope

**Markers** (point labels), **fragments** (epoch spans), **trials** (ERP-related segments with stimulus/response metadata). Persist via recordings API; hydrate viewer overlays.

## File targets (primary)

- `apps/web/src/studio/events/` (dialogs, `useRecordingTimeline`, `eventApi.ts`)
- `apps/web/src/studio/viewer/MarkerLayer.tsx`, `FragmentBar.tsx`, `TrialBar.tsx`
- `apps/api/app/routers/recording_eeg_events_router.py` (or current name)
- `apps/web/src/studio/stores/eegViewer.ts` (markers, fragments, trials slices)

## Data contracts

- **Time**: seconds, inclusive/exclusive rules documented for fragments.
- **trial**: `stimulusClass`, `included`, windows aligned to recording timeline.
- Events API uses **`analysis_id`** = recording/analysis uuid consistent with studio.

## Acceptance criteria

- [ ] Create/edit/delete marker and see overlay sync.
- [ ] Fragments list drives spectra / ERP epoch selection where integrated.
- [ ] Trials sync respects reload after save; no duplicate ids on rapid edit.
- [ ] `eventsChanged` emitted to **AI store** for M13 when counts change.

## Tests

- Pytest: CRUD round-trip for events/trials on a test recording.
- Playwright (optional): add marker → reload → marker visible.

## Dependencies

M2–M4.
