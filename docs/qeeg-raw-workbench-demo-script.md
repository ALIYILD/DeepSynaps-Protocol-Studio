# Raw EEG Cleaning Workbench — Demo Script

A 5-minute walk-through of the workbench for clinical reviewers.

> Decision-support only. AI suggestions require clinician confirmation
> before any cleaning is applied. Original raw EEG is preserved.

---

## 0 · Prep

- Run the studio frontend: `bun --cwd apps/web dev`
- Run the API: `cd apps/api && python -m uvicorn app.main:app --reload`
- Sign in (or use demo mode).
- Land on **qEEG Analyzer** → **Raw Data** tab.

You will see a blue banner labelled **Raw EEG Cleaning Workbench**
with four buttons. Click **Open Raw EEG Workbench**.

## 1 · Loader (10 s)

Top-left of the workbench shows the recording shape: sample rate,
duration, channel count, eyes condition. In demo mode a yellow
**DEMO DATA** badge is visible. The right-side **Immutable raw EEG
preserved** banner is always present.

## 2 · Toolbar (30 s)

Walk through Speed (15/30/60 mm/s), Gain, Low cut, High cut, Notch,
Montage, View mode (Raw/Cleaned/Overlay), Timebase. Note that
changing any control redraws the trace canvas without round-tripping
to the server.

## 3 · Channel rail (15 s)

Click **Fp1-Av**. The selected row highlights blue. Press **B** to
mark it bad — the row turns red, the status bar `Bad` count
increments, and an audit row is written.

## 4 · Trace canvas (45 s)

Press → / ← to step time windows. Press + / − to zoom. Note the
synthetic eye-blink at ~2.4–3.1s on Fp1/Fp2 and muscle artefact at
~7.2s on T3.

## 5 · Manual cleaning (60 s)

Open the right panel **Cleaning** tab. Click **Mark bad segment** —
the current 10s window is marked rejected (status bar `Rejected`
increments; canvas shades red). Click **Add annotation**, type a
note. The audit tab now shows two rows.

## 6 · AI Artefact Assistant (60 s)

Switch to **AI Assistant** tab. Click **Generate suggestions** — three
canonical archetypes appear (eye blink, muscle, line noise) each with
confidence, channel/time, and a Suggested action. Click **Accept** on
the muscle suggestion. Note that the audit log records both the AI
generation and the clinician acceptance, and the muscle segment now
has shading on the canvas.

## 7 · Best-Practice Helper + Examples (45 s)

Switch to **Best-Practice**. Skim the topics — bad-channel detection,
ICA, line noise, when **not** to over-clean, immutability of raw.
Switch to **Examples** for the canonical artefact gallery.

## 8 · ICA panel (15 s)

If preprocessing has not been run, the ICA tab shows a friendly empty
state explaining how to generate components. Otherwise components are
listed with keep/reject toggles.

## 9 · Save & Re-run (60 s)

Click **Save cleaning version** in the toolbar. The status bar shows
`Cleaning v1 draft`. Click **Re-run qEEG analysis**. The status bar
shows `rerun queued · raw EEG preserved`. The audit tab shows the
`cleaning_version:save` and `cleaning_version:rerun_requested` rows.

Switch back to the qEEG Analyzer tab — the new analysis cycle will
appear in the analysis list with the cleaning version attribution.

## 10 · Raw vs Cleaned comparison (30 s)

In the **Cleaning** tab click **View Raw vs Cleaned summary**. A
modal/alert shows retained-data %, bad channels excluded, rejected
segments. The notice line reads: `Decision-support only. Original
raw EEG is unchanged.`

---

## What clinicians can do now

- Inspect raw EEG with full toolbar control.
- Mark bad channels / bad segments / rejected epochs.
- Review and confirm AI artefact suggestions.
- Save cleaning versions and re-run qEEG analysis from a chosen
  version.
- Browse best-practice references and canonical examples.
- Review a complete audit trail.

## What still needs future work

- ICLabel + autoreject integration for the AI generator.
- Real ICA topomap rendering inside the workbench (currently
  delegated to the existing `qeeg-ai-panels` flow).
- Durable undo/redo (currently expressed via corrective annotations).
- CSV / MAT loader pass-through.

---

## UAT checklist (sign-off)

The reviewer ticks every box, or the build is rejected for staging.

- [ ] **Load data** — Analyzer Raw Data tab shows the launcher banner
      with all four buttons; clicking *Open Raw EEG Workbench* lands
      on the full-screen page within 1s; metadata loader populates
      sample rate / duration / channel count.
- [ ] **Mark artefacts** — Mark a bad channel (`B`), a bad segment
      (`S`), and add a clinician annotation (`A`). The status bar
      Bad / Rejected counters update; the audit tab shows three new
      rows.
- [ ] **Save version** — Click Save; status bar shows `Cleaning v1
      draft`. Click again — `v2`. The audit tab shows two
      `cleaning_version:save` rows.
- [ ] **Re-run qEEG** — Click Re-run; status bar shows `rerun queued ·
      raw EEG preserved`; audit tab shows
      `cleaning_version:rerun_requested`.
- [ ] **Verify audit** — `SELECT * FROM qeeg_cleaning_audit_events
      WHERE analysis_id = '<id>'` returns one row per action with
      actor_id and timestamp populated. No PHI columns.
- [ ] **Verify PHI safety** — URL contains no patient name; the
      `/metadata` response contains no `original_filename`; the AI
      suggestion explanations contain no patient text.
- [ ] **Tests pass** — `pytest apps/api/tests/test_qeeg_raw_workbench.py
      -q` → 13 passed. The `pages-qeeg-raw-workbench` and
      `qeeg-raw-workbench-launcher` node tests pass.

When all boxes are ticked, the workbench is staging-ready.
