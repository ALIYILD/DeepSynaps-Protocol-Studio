# M8 — Spectra & qEEG suite

## Scope

**Welch / spectral maps**, **band power**, **indices** (e.g. theta/beta), **asymmetry**, **coherence** in [0,1]. Z-scores vs norms with **norm version** in results and reports.

## File targets (primary)

- `apps/web/src/studio/spectra/`, `StudioSpectraMenu.tsx` and related components
- `apps/api/app/routers/studio_spectra_router.py`
- `packages/qeeg-pipeline/` if shared DSP lives there

## Data contracts

- **Coherence** ∈ [0, 1].
- **Colormaps**: RdBu_r for z-maps; viridis for power (see `00_MASTER_SPEC.md`).
- Persist **norm_set_id** / version on analysis outputs.
- Summaries → **AI store** `spectraComputationChanged` for M13.

## Acceptance criteria

- [ ] User can compute spectra for a selected epoch / fragment with clear progress and result view.
- [ ] Indices table matches API payload; missing data handled gracefully.
- [ ] Golden fixture `routine_eyes_open_eyes_closed.edf` + reference metrics within tolerance when bundled.

## Tests

- Pytest: spectral summary numeric smoke vs reference JSON (golden).
- FE typecheck.

## Dependencies

M2–M7 for timeline and selection.
