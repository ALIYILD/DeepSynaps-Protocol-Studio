# Raw EEG Cleaning Workbench

A full-screen clinical EEG workstation for inspecting raw recordings,
applying manual cleaning, reviewing AI-assisted artefact suggestions,
saving cleaning versions, and re-running qEEG analysis — while keeping
the original raw EEG immutable.

> **Decision-support only.** The workbench does not diagnose. AI
> suggestions require clinician confirmation before any cleaning is
> applied. Original raw EEG is preserved at all times.

---

## Route

The workbench is a full-screen page reachable from the qEEG Analyzer
"Raw Data" tab via prominent buttons:

- **Open Raw EEG Workbench**
- **Review & Clean Signal**
- **Compare Raw vs Cleaned**
- **Re-run Analysis After Cleaning**

URL form (hash-routed):

```
#/qeeg-raw-workbench/<analysisId>
#/qeeg-raw-workbench/<analysisId>?mode=compare
```

PHI safety: no patient names appear in the URL, hash, browser title,
or document title. The workbench shows recording shape (sample rate,
duration, channels) only — never patient identifiers or filenames.

---

## How to load data

1. Land on the qEEG Analyzer.
2. Select an analysis (or use **demo** in development).
3. Click **Open Raw EEG Workbench**.
4. The metadata panel shows: recording date, duration, sample rate,
   channel count, montage hint, eyes-condition, equipment, and a
   "metadata complete" indicator.
5. If metadata is incomplete the loader displays a clinical message
   (`Metadata incomplete — clinician review required`) and the user
   can still inspect traces but is asked to verify before
   interpretation.

Supported file formats parsed by the upstream `qeeg_analysis_router`:
EDF, BDF, BrainVision (`.vhdr`), EEGLAB (`.set`). Future-ready for
CSV / MAT once the parser is extended.

---

## Inspect raw EEG

- Top toolbar: speed (15 / 30 / 60 mm/s), gain (25–200 µV/cm),
  baseline reset, low-cut, high-cut, notch (Off / 50 / 60 / 45–55 Hz),
  montage (Referential, Bipolar long/transverse, Average, Laplacian),
  view mode (Raw / Cleaned / Overlay), timebase (5/10/15/30 sec/page).
- Channel rail: 20-channel list with bad-channel state and selected
  highlight. Click a row to select; right-side keyboard arrows step.
- Trace canvas: grid + second markers, vertical time cursor, rejected
  segment shading, AI suggestion ticks at the top.
- Status bar: recording time | window | selected channel | bad count |
  rejected count | retained-data % | cleaning version | save status.

When no real signal is available the canvas renders realistic
synthetic EEG traces clearly labelled as **DEMO DATA** with embedded
artefact archetypes (eye blink, muscle, line noise).

---

## Mark artefacts (manual)

| Action                  | Shortcut | API kind             |
|-------------------------|----------|----------------------|
| Mark bad channel        | `B`      | `bad_channel`        |
| Mark bad segment        | `S`      | `bad_segment`        |
| Reject epoch            | —        | `rejected_epoch`     |
| Interpolate channel     | —        | `interpolated_channel` |
| Add annotation          | `A`      | `note`               |

Every mutation writes a row to `qeeg_cleaning_annotations` and an
immutable audit row to `qeeg_cleaning_audit_events`. The original raw
EDF bytes and the parent `qeeg_analyses` row's source columns are not
touched.

---

## AI Artefact Assistant

`POST /api/v1/qeeg-raw/{analysis_id}/ai-artefact-suggestions` returns
canonical artefact archetypes (eye blink, muscle, line noise, flat
channel, electrode pop, ECG contamination, movement). Each suggestion
is persisted as an annotation with `source='ai'` and
`decision_status='suggested'`, includes a confidence score, an
explanation, and a suggested action.

Clinicians act on each suggestion with **Accept / Reject / Needs
review**. Acceptance writes a sibling annotation (`source='clinician'`,
`decision_status='accepted'`) and, when the suggested action is
`mark_bad_segment`, applies the corresponding rejected segment to the
working state. Until then, **no cleaning is applied**.

Every suggestion is shipped with the literal banner:

> AI-assisted suggestion only. Clinician confirmation required.

---

## Save cleaning version → re-run qEEG

1. Click **Save cleaning version** (toolbar or right panel).
2. The backend writes a new row to `qeeg_cleaning_versions` with
   `version_number = previous + 1`, capturing bad channels, rejected
   segments / epochs / ICA components, interpolated channels, and a
   summary blob.
3. Click **Re-run qEEG analysis**. The workbench POSTs
   `/rerun-analysis` with the version id; the backend converts the
   cleaning version into the legacy `cleaning_config_json` shape that
   the existing reprocess pipeline already understands, marks the
   version `review_status='rerun_requested'`, and queues the
   reprocess. Original raw analysis row is **not mutated** beyond
   `cleaning_config_json` and `analysis_status`.

After the reprocess pipeline completes, the qEEG report shows the
cleaning version that produced it and the raw-vs-cleaned summary
endpoint reports retained-data %, bad channels excluded, rejected
segments / ICA components, and total rejected seconds.

---

## Best-Practice Helper

A static, local guidance panel covers:

- Bad channel detection
- Eye blink / saccade artefacts
- Line noise (50 / 60 Hz)
- When **not** to over-clean
- Why original raw EEG must be preserved

Each topic links to MNE-Python, EEGLAB, BIDS-EEG, or peer-reviewed
references. The workbench never sends PHI to internet search.

---

## Examples

A panel of canonical artefact cases with channels, "why it matters",
"suggested action", and "what clinician should check": clean
posterior alpha, eye blink, muscle, line noise, flat channel,
electrode pop, movement, ECG contamination, poor recording.

---

## Limitations / known constraints

- Demo mode renders synthetic signals; real raw signal access requires
  MNE installed (`qeeg_mne` extra).
- ICA panel shows components only when the analysis has been
  preprocessed with ICA. The empty state explains how to generate
  components by re-running the pipeline.
- Undo/redo is currently a UI affordance only; durable rollback is
  via writing a corrective annotation.
- AI suggestions are heuristic archetypes today; ICLabel + autoreject
  integration is a follow-up.

---

## Audit & data model

See [`qeeg-cleaning-audit.md`](./qeeg-cleaning-audit.md) for the full
audit-event shape and retention policy.

---

## UAT checklist (staging readiness)

Before promoting a workbench build to staging, run through this short
checklist. Each item must pass; otherwise the build is not ready.

- [ ] **Load data.** Open the qEEG Analyzer → Raw Data tab. The blue
      launcher banner is visible with all four buttons. Click *Open
      Raw EEG Workbench*; the full-screen page appears within 1s.
- [ ] **Demo mode renders.** Visit `#/qeeg-raw-workbench/demo`; the
      DEMO DATA badge is visible, traces draw, immutable-raw notice
      is displayed.
- [ ] **Toolbar functional.** Speed / Gain / Low-cut / High-cut /
      Notch / Montage / View / Timebase selectors all change UI state
      without errors.
- [ ] **Channel rail.** All 20 default channels render. Click a row
      to select; press `B` to mark bad — row turns red, status bar
      Bad count increments.
- [ ] **Mark artefacts.** Press `S` to mark current window as bad
      segment; the canvas shades red and Rejected count increments.
- [ ] **AI Assistant.** Switch to AI tab → Generate suggestions.
      Three archetypes appear, each labelled with confidence and the
      banner *AI-assisted suggestion only. Clinician confirmation
      required.* Accept / Reject / Needs review buttons all respond.
- [ ] **Save cleaning version.** Click Save; status bar shows
      `Cleaning v1 draft`. Click again — `v2` appears.
- [ ] **Re-run qEEG analysis.** Click Re-run; status bar shows
      `rerun queued · raw EEG preserved`.
- [ ] **Audit trail.** Switch to Audit tab. Every action above is
      listed with action_type, source, actor_id, timestamp.
- [ ] **PHI safety.** The browser URL contains no patient name. The
      `/metadata` response (DevTools → Network) does not include
      `original_filename` or any PHI field.
- [ ] **Cross-clinic gate.** A clinician at a different clinic
      receives 404 (not 403) on every workbench endpoint.
- [ ] **Raw immutability.** After Save + Re-run, query the database
      directly: `qeeg_analyses.file_ref` and `original_filename` are
      unchanged from the pre-test snapshot.
- [ ] **Tests pass.** `pytest apps/api/tests/test_qeeg_raw_workbench.py
      -q` → 13 passed. `npm --prefix apps/web run test:unit` →
      workbench + launcher suites pass.
