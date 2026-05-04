# Manual qEEG Workbench

## Suggested Clinician Workflow

1. Confirm recording metadata, condition, and preservation of original raw EEG.
2. Check impedance status or document that impedance data is unavailable.
3. Confirm montage and reference before asymmetry or coherence review.
4. Review filters because filtering changes interpretation.
5. Mark artifacts manually before accepting automated suggestions.
6. Review event markers and recording labels.
7. Inspect spectra, band power, asymmetry, and coherence after quality control.
8. Add manual findings with channels, bands, confounds, and clinician note.
9. Save cleaning version and export the clinician report.

## Signal Quality Checklist

- Channel count
- Sampling rate
- Recording duration
- Bad channels
- Impedance status
- Artifact burden

## Montage Checklist

- Confirm current montage
- Confirm reference context
- Note if montage is unknown
- Use extra caution for asymmetry and coherence when montage is uncertain

## Artifact Checklist

- Eye blink
- Lateral eye movement
- Muscle tension
- Movement
- Line noise
- Electrode pop
- Flat or noisy channel
- Residual ICA/PCA uncertainty

## Spectra / Asymmetry / Coherence Review

- Spectra and topomaps are descriptive aids after cleaning review.
- Band power is not diagnostic by itself.
- Asymmetry requires montage and artifact awareness.
- Coherence and average coherence require adequate channel quality and artifact control.
- Bicoherence, bispectrum, LORETA, and sLORETA remain reference-only or future-module labels unless a validated computation path is active.

## Window spectral review

Use **Analyze window spectrum** (Manual Analysis panel) when you need a **quick Welch PSD and band-power summary** for the **currently visible window** or **drag-selected segment**—without queueing a full resting qEEG pipeline job.

**When to use**

- Exploratory frequency context during manual QC (e.g., checking alpha band presence after confirming artifact handling).
- Teaching or supervision when a descriptive spectrum supports discussion — **not** as a standalone clinical conclusion.

**Artifact and quality caveats**

- PSD shape is sensitive to eyeblink, muscle, movement, and line noise; interpret together with the trace and artifact overlays.
- Saved **bad segments** that overlap the window are surfaced as warnings when cleaning config is present.
- Very **short windows** (under ~2 s) yield poor frequency resolution; the API may add warnings.

**Minimum useful window length**

- Aim for **several seconds** of clean data; shorter clips may still compute but with degraded Welch resolution (segment length is capped by available samples and aligned with the pipeline’s nominal 4 s Welch segment where possible).

**Relation to full qEEG analysis**

- Window PSD is a **lightweight workbench helper**. It does **not** replace epoching, normative comparison, topomaps, or report-grade spectral pipelines that run via the standard analysis job.

**Clinician review**

- All responses are labeled **decision-support only** with **clinician review required**. Medication, state, montage, and filter settings remain interpretation confounds.

## Findings Builder

- Finding type
- Associated channels
- Associated bands
- Severity
- Confidence
- Possible confounds
- Clinician note
- Clinician review required

## Report Export Flow

- Save cleaning version
- Re-run analysis if needed
- Review manual findings and AI suggestions
- Complete clinician sign-off
- Export clinician-facing report
