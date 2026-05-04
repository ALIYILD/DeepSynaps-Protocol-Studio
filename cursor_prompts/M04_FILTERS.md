# M4 — Filters (global + per-channel)

## Scope

**IIR / FIR** high-pass, low-pass, notch, baseline; optional **per-channel** overrides. Filter parameters sent with EEG stream requests and reflected in UI state.

## File targets (primary)

- `apps/web/src/studio/filters/FiltersBar.tsx`, `BandrangeMenu.tsx`, `BandrangeDialog.tsx`, `BandrangeEditor.tsx`
- `apps/web/src/studio/stores/filters.ts`
- `apps/api` studio endpoints applying filters to streamed data (document filter_json contract)

## Data contracts

- Frequencies in **Hz**; time constants in **seconds** where used for high-pass.
- **notch**: enum or string (`50`, `60`, `off`).
- Serialize overrides for API as stable JSON (see existing `serializeOverridesForApi`).

## Acceptance criteria

- [ ] Changing global filters updates trace within one page refresh cycle.
- [ ] Per-channel overrides show badge / indicator when active.
- [ ] Filter state integrates with **AI store** `filtersChanged` payload for M13 (shape in `stores/ai.ts`).

## Tests

- Golden: known sine calibration → passband behavior within tolerance (backend preferred).
- FE typecheck; optional Playwright: change notch → network payload contains expected fields.

## Dependencies

M2–M3.
