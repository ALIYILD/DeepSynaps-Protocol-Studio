# Cursor prompts — DeepSynaps EEG Studio modules

## Required context (every implementation chat)

Attach **all** of the following to the Cursor chat before module work:

1. `cursor_prompts/00_MASTER_SPEC.md`
2. `cursor_prompts/01_ARCHITECTURE.md`
3. The **specific module** file for your sprint task, e.g. `cursor_prompts/M08_SPECTRA_QEEG.md`

## Instruction to paste

> Implement the prompt in the attached module file. Adhere strictly to file targets, data contracts, and acceptance criteria. After implementation, write tests and run them (`pytest` / `npm run typecheck` / Playwright as applicable).

## Module index (execution order)

| File | Module | Sprint |
|------|--------|--------|
| `M01_STUDIO_SHELL.md` | Shell, routing, studio entry | 1 |
| `M02_PAGED_EEG_VIEWER.md` | Paging, stream, cursors | 1 |
| `M03_MONTAGE.md` | Montage swap, bad channels | 1 |
| `M04_FILTERS.md` | IIR / notch / baseline | 2 |
| `M05_MARKERS_FRAGMENTS_TRIALS.md` | Timeline, events API | 2 |
| `M06_DATABASE.md` | EEG database browser | 3 |
| `M07_ARTIFACT_PIPELINE.md` | Mark artifacts, ICA / templates | 3 |
| `M08_SPECTRA_QEEG.md` | Spectra, indices, norms | 4 |
| `M09_ERP_SUITE.md` | ERP, ERD, wavelet, PFA | 5 |
| `M10_SOURCE_LOCALIZATION.md` | LORETA, dipole | 6 |
| `M11_SPIKE_DETECTION.md` | Detection, review | 6 |
| `M12_FINAL_REPORT.md` | Final report generator | 7 |
| `M13_AI_ASSISTANT.md` | AI assistant overlay | 8 |

Cross-cutting validation: sprint **9** uses `tests/fixtures/eeg_studio/` golden EDFs and WinEEG reference outputs (see that README).
