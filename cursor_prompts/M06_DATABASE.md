# M6 — EEG database (patients & recordings)

## Scope

**Patient** list, search, patient drawer, **recording** table, open recording in studio viewer (`studio.html?id=…`). Supports merge/export hooks as per product spec.

## File targets (primary)

- `apps/web/src/studio/database/DatabasePage.tsx`, `PatientDrawer.tsx`, `RecordingTable.tsx`, `PatientCard.tsx`
- `apps/web/src/studio/database/databaseApi.ts`
- `apps/api/app/routers/studio_eeg_database_router.py` and patients/recordings routers as wired

## Data contracts

- **Patient**: id, demographics fields per schema (PHI handling per HIPAA governance).
- **Recording**: id, linkage to patient, modality metadata.

## Acceptance criteria

- [ ] Search returns rows; selecting opens drawer with consistent data.
- [ ] “Open in viewer” navigates with correct recording id.
- [ ] Errors surfaced (network, 404) without silent failure.
- [ ] Setup links (e.g. Final Report Templates) do not break database layout.

## Tests

- API pytest: list patients / recordings with auth fixture.
- FE typecheck; smoke navigation.

## Dependencies

M1 (routing). PHI: never log raw identifiers at INFO in shared logs.
