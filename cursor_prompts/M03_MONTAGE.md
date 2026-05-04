# M3 — Montage swap & bad channels

## Scope

User can switch **montage** (referential, bipolar grids, custom) and toggle **bad channels**. Montage affects derived channel list passed to stream and downstream modules.

## File targets (primary)

- `apps/web/src/studio/montage/MontagePicker.tsx`, `MontageEditor.tsx`, `MontageEditorTrigger.tsx`
- `apps/web/src/studio/montage/useMontage.ts` or `useMontageStore`
- `apps/api/app/routers/montages_router.py` (if present)
- `apps/api` montage resolution tied to `studio_eeg` stream

## Data contracts

- **montageId**: string; must resolve to an ordered list of **derivation labels** (e.g. `F3-F4`) with underlying `(+, −)` channel sets where applicable.
- **badChannels**: list of logical channel ids to zero or exclude per policy.

## Acceptance criteria

- [ ] Switching montage refetches or recomputes channel list; viewer updates labels.
- [ ] Bad channel toggles persist for the session and affect stream request.
- [ ] Montage warnings (if any) surface in UI without blocking silently.

## Tests

- API: montage application returns deterministic channel list for a fixture recording.
- FE: typecheck; smoke that montage change triggers new stream parameters.

## Dependencies

M2 viewer / stream.
