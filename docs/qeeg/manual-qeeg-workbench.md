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
