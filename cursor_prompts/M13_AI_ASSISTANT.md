# M13 — AI assistant overlay

## Scope

**Consumes** viewer state, filters, montage, timeline stats, spectral/ERP/source/spike summaries, and report drafts. Presents overlay UI (sidebar / panel) with **non-diagnostic** language; clinician remains accountable.

## File targets (primary)

- `apps/web/src/studio/stores/ai.ts` — payloads: viewport, filters, events, spectra, ERP, source, spikes, **report draft**
- Studio shell integration point(s) for chat / suggestions panel (add under `apps/web/src/studio/` as implemented)
- `apps/api/app/routers/qeeg_ai_router.py` or dedicated studio copilot if bridged

## Data contracts

All payloads include **`analysisId`** and **`at`** ISO timestamp. Shapes:

- `ViewportPayload`, `FiltersChangedPayload`, `EventsChangedPayload`, `SpectraComputationPayload`, `ErpComputationPayload`, `SourceLocalizationPayload`, `SpikeDetectionPayload`, `ReportDraftPayload` — extend only with backward-compatible optional fields.

## Feature flags

- `ai.autopilot`, `ai.voice` — gate automation and voice.

## Acceptance criteria

- [ ] Overlay receives live updates when viewer/analysis state changes (store subscriptions).
- [ ] **ReportDraftPayload** populates M12 report blocks on demand via `reportDraftChanged`.
- [ ] No autonomous write to clinical chart without explicit user action.
- [ ] i18n for assistant strings (en + tr keys).

## Tests

- Unit: reducer/store handlers for each payload type.
- API: mock LLM/router returns structured JSON; contract test.
- E2E (optional): open studio → send prompt → expect non-empty assistant panel.

## Dependencies

M1–M12 (consumes their outputs).
