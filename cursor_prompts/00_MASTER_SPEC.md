# Master specification — DeepSynaps EEG Studio (modular build)

## Purpose

This document defines **cross-cutting rules** for all EEG Studio modules (M1–M13). Module-specific prompts add file targets and acceptance tests.

Clinical safety: the product is **decision-support**, not autonomous diagnosis. AI outputs are drafts for clinician review.

---

## Units and representations

| Quantity | Rule |
|----------|------|
| EEG amplitude | **µV** in UI and API payloads surfaced to clinicians |
| Time | **Seconds** for display, interaction, and viewer cursors; **sample indices** only at storage / IO boundaries |
| Frequency | Hz; band edges documented per analysis |
| Coherence | **∈ [0, 1]** |
| Phase | Radians or wrapped degrees; document convention per endpoint |

---

## Color maps (visualization)

| Use case | Colormap |
|----------|----------|
| Z-scores vs norm | **Diverging RdBu_r** (or clinical-approved equivalent) |
| Power / magnitude | **Sequential viridis** |
| ICA / categorical labels | **Categorical** palette with legend |

---

## Normative references

- Norm database style: **HBI-like** bundled norms and/or **user-uploaded** cohorts.
- Every **z-score** or norm-relative output MUST record:
  - **norm_set_id** (or version string)
  - **cohort** descriptor (age band, region, device class if applicable)
- Surfaces: analysis metadata, report blocks, and `RunRecord` (see logging).

---

## Logging and RunRecord

Every analysis run that mutates derived data MUST emit a structured **RunRecord** (JSON), including:

- `inputs_hash` — hash of canonical inputs (recording id, epoch defs, params)
- `pipeline` — pipeline id / version
- `params` — resolved parameters (filter freqs, norm id, etc.)
- `outputs_hash` — hash of primary numerical outputs
- `derived_files[]` — list of artifact URIs or storage keys

Use structured JSON logging elsewhere; correlate with `request_id` / `analysis_id`.

---

## Feature flags (rollout)

Configurable per deployment (env or config service):

| Flag | Purpose |
|------|---------|
| `ai.autopilot` | Suggest next analysis steps (off by default in clinical) |
| `ai.voice` | Voice UI for AI (optional) |
| `source.dipole` | Enable dipole / advanced source features |
| `spikes.aiClassifier` | ML-assisted spike classification |

Gate UI and API routes; never silently enable clinical‑critical paths without config.

---

## Internationalization

- **No user-visible raw strings** in feature code — use **i18n keys**.
- Maintain **English (`en`)** and **Turkish (`tr`)** bundles at minimum.
- Clinical disclaimers and regulatory phrases come from approved translation tables where required.

---

## Accessibility

- **Keyboard-first**: core workflows operable without a mouse.
- **Filters bar**: full adjustability via keyboard and visible focus order.
- Prefer Radix / native semantics; document shortcut keys in module specs.

---

## Testing strategy

| Layer | Tool | Scope |
|-------|------|--------|
| Backend | **pytest** | Routers, services, golden numeric checks |
| Frontend unit | **Vitest** (where configured) or component tests | Pure logic, hooks |
| E2E | **Playwright** | Critical studio flows |
| Golden data | **One EDF + WinEEG reference** per module family | `tests/fixtures/eeg_studio/` |

Tolerance: define per-metric (e.g. max abs diff for z-scores, SNR for ERP peaks).

---

## QA validation EDFs (bundle in repo when licensed)

| Fixture | Use |
|---------|-----|
| `routine_eyes_open_eyes_closed.edf` | Spectra, indices, asymmetry |
| `oddball_p300.edf` | ERP P300, peak pick, source |
| `gonogo_tova.edf` | Go/NoGo, ERP groups |
| `epilepsy_ied.edf` | IED / spike detection vs labels |
| `pediatric_adhd_qeeg.edf` | Theta/beta, pediatric norms |
| `pre_post_tms.edf` | Cross-recording comparison |

Each ships with **WinEEG-generated reference report / metrics** for diff or threshold checks.

---

## Module dependency graph (high level)

```
M1 Shell → M2 Viewer → M3 Montage
              ↓
         M4 Filters → M5 Timeline
              ↓
    M6 Database    M7 Artifacts
              ↓
         M8 Spectra → M9 ERP
              ↓
    M10 Source     M11 Spikes
              ↓
         M12 Report → M13 AI (consumes all signals)
```

Implement modules in order unless a prompt explicitly allows a narrow integration-only change.

---

## Review checklist (every PR touching EEG Studio)

- [ ] Units and time base documented in API or code comments
- [ ] Norm version surfaced where z-scores appear
- [ ] No PHI in logs; structured fields only
- [ ] Feature flags respected for optional modalities
- [ ] i18n keys for new strings (en + tr)
- [ ] Keyboard path verified for new interactive surfaces
- [ ] Tests added or updated; golden fixture referenced if applicable
