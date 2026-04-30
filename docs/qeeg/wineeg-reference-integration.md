# WinEEG Reference Integration

## What Was Imported

- Workflow concepts from local WinEEG manuals were summarized into a reference-only knowledge bundle.
- The bundle covers recording setup, impedance, montage review, filters, artifact workflows, event markers, spectra, band power, asymmetry, coherence, average coherence, ERP sync terminology, source-analysis terminology, and reporting.
- The integration exposes this material to the qEEG Raw Workbench, qEEG Analyzer, and qEEG copilot as summarized JSON and UI guidance.

## What Was Not Imported

- The WinEEG installer and runtime binaries are not used by DeepSynaps.
- Proprietary manual text is not copied verbatim into product files.
- No native WinEEG file parser was added.

## Why The Installer Is Not Used

- The installer is proprietary runtime software, not reference knowledge.
- This project integrates workflow guidance only.
- No reverse engineering of WinEEG binaries or undocumented formats is performed.

## Safety Boundary

- Reference integration only.
- No native WinEEG ingestion claim.
- Decision-support only.
- Clinician review required.
- Artifact quality, medication effects, sleep/state, vigilance, and recording conditions must be considered before interpretation.

## How Clinicians Can Use Manual Analysis Mode

- Review signal quality, montage, filters, and artifact burden first.
- Add event markers and segment labels before manual interpretation.
- Use spectra, band power, asymmetry, and coherence only after quality control.
- Use the findings builder to document channels, bands, confounds, and clinician notes.
- Export clinician-facing reports only after review and sign-off.

## Future Path

- If the user provides documented WinEEG EDF or ASCII exports, add importer fixtures for those exported formats only.
- Validate any export compatibility against real sample files before claiming support.

