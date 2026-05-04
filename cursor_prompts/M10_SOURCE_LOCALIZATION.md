# M10 — Source localization (LORETA / dipole)

## Scope

**sLORETA / LORETA** (spectra or ERP-locked), **dipole fit**, optional MRI/coregistration UI hooks. Feature flag **`source.dipole`** for advanced paths.

## File targets (primary)

- `apps/web/src/studio/source/` (`StudioSourceMenu`, `LoretaWindow`, `DipoleWindow`, `BrainViewer3D`, …)
- `apps/api/app/routers/studio_source_router.py`
- `apps/web/src/studio/source/sourceApi.ts`

## Data contracts

- Peak ROIs, voxel/MNI coordinates if applicable; summary objects for **AI store** `sourceLocalizationChanged`.

## Acceptance criteria

- [ ] User can run at least one LORETA path from trials + window defined in M5.
- [ ] Dipole path gated by feature flag when configured.
- [ ] Failures (missing head model, etc.) return actionable errors.

## Tests

- Pytest: dipole / loreta endpoint smoke with mocked volume or small fixture.
- FE typecheck.

## Dependencies

M5, M9 for ERP/spectral inputs.
