# M11 — Spike / IED detection

## Scope

**Detection**, review UI, optional **average**, **dipole at peak**, export to timeline events. Feature flag **`spikes.aiClassifier`** for ML assist when present.

## File targets (primary)

- `apps/web/src/studio/spikes/` (`StudioSpikeMenu`, `SpikeWindow`, `spikesApi.ts`)
- `apps/api/app/routers/studio_spikes_router.py`, `app/spikes/` models/services

## Data contracts

- Detections as `(peakSec, channel?, confidence?, kind)` aligned with **markers** / events API.
- Summaries → **AI store** `spikeDetectionChanged`.

## Acceptance criteria

- [ ] Detection run completes and lists peaks; jump-to-time scrolls viewer.
- [ ] Optional: average waveform around peak with pre/post ms.
- [ ] Golden `epilepsy_ied.edf` matches reference spike table within tolerance when bundled.

## Tests

- Pytest: detection handler returns JSON schema; count vs labeled fixture.
- FE typecheck.

## Dependencies

M2–M5.
