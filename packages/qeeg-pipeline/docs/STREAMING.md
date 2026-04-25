# Live qEEG streaming (monitoring)

This module provides **low-latency, real-time qEEG monitoring** intended for dashboards and clinician supervision.

**Important**: This feature is **monitoring only — not diagnostic**. Do not use language implying diagnosis or treatment recommendation.

## What it does

- Connects to an EEG source (LSL or a mock EDF replay)
- Produces overlapping **1-second windows** with **250 ms hop**
- Computes rolling features with cached filter state:
  - per-channel band power (δ/θ/α/β/γ; µV²)
  - **TBR** (θ/β at Cz, when Cz present)
  - **IAPF** (median peak alpha frequency 7–13 Hz)
  - **FAA** (ln(α_F4) − ln(α_F3), when F3/F4 present)
- Computes lightweight quality indicators:
  - flatline, clipping, line-noise ratio, channel RMS (µV)
- Computes per-window **normative z-scores** via the shared norms engine

## API endpoints

Feature-flag + tier gated:

- **Feature flag**: `DEEPSYNAPS_FEATURE_LIVE_QEEG=1`
- **Entitlement**: `Feature.LIVE_QEEG` (enabled for `clinic_team` + `enterprise`)
- **Role**: clinician+

### WebSocket

`GET /api/v1/qeeg/live/ws`

Query params:

- `source`: `lsl` (default) or `mock`
- `stream_name`: required when `source=lsl`
- `edf_path`: required when `source=mock`
- `age`: optional int (for z-scoring)
- `sex`: optional `"M"`/`"F"` (for z-scoring)
- `line_freq_hz`: optional float (default 50)

Messages: server pushes JSON frames:

```json
{
  "type": "frame",
  "seq": 12,
  "t_unix": 1760000000.123,
  "frame": { "...rolling features..." },
  "quality": { "...quality indicators..." },
  "zscores": { "...normative zscores..." },
  "disclaimer": "Monitoring only — not diagnostic."
}
```

Backpressure: server uses a bounded queue and **drops old frames** to keep latency low.

### SSE (fallback)

`GET /api/v1/qeeg/live/sse`

Same query params as WS. Emits `event: frame` SSE events with the same JSON payload in `data:`.

## Python usage (library)

- `deepsynaps_qeeg.streaming.LSLSource`: async window generator from LSL stream name
- `deepsynaps_qeeg.streaming.MockSource`: EDF replay (or in-memory `mne.Raw`) for dev/tests
- `deepsynaps_qeeg.streaming.RollingFeatures`: rolling feature engine (cached SOS filter state)

## Frontend notes

Clients should prefer WS, with SSE fallback:

- Auto-reconnect on socket close
- Apply **bounded queues / drop frames** to keep p95 latency under 500 ms
- Label the UI prominently as **monitoring only — not diagnostic**

