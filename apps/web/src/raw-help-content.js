// ─────────────────────────────────────────────────────────────────────────────
// raw-help-content.js — Phase 7 in-app contextual help topics
//
// One short article per toolbar/sidebar control. All prose is original to this
// project and references only open standards (10-20 / 10-10 system, IFCN
// minimum technical requirements, MNE-Python conventions). NO product or
// vendor names — `bash scripts/check-vendor-names.sh` runs over this file.
//
// Help bodies are HTML strings. Keep them short (a few sentences each) so the
// drawer reads as a clinical refresher rather than a manual.
// ─────────────────────────────────────────────────────────────────────────────

export const RAW_HELP_TOPICS = {
  montage: {
    title: 'Montage',
    body:
      '<p>The montage controls how electrode signals are referenced before display. ' +
      'A <strong>referential</strong> montage shows each channel against a single common ' +
      'reference (linked ears, mastoids, or a single scalp electrode). A ' +
      '<strong>bipolar</strong> montage subtracts adjacent electrode pairs along a chain ' +
      '(longitudinal or transverse) — useful for localising focal abnormalities. ' +
      'An <strong>average</strong> reference subtracts the mean of all good scalp ' +
      'electrodes from each channel, which is appropriate for high-density arrays and ' +
      'most spectral analyses.</p>' +
      '<p>Channel naming follows the international 10-20 / 10-10 system. Switching the ' +
      'montage is purely a display transform and never alters the stored raw data.</p>',
  },

  sensitivity: {
    title: 'Sensitivity',
    body:
      '<p>Sensitivity is the vertical scale of each channel lane, expressed in ' +
      'µV per division. Lower numbers (e.g. 3 µV/div) make small rhythms ' +
      'visible; higher numbers (e.g. 30 µV/div) keep large slow waves on screen.</p>' +
      '<p>Per IFCN minimum technical recommendations, routine clinical recordings are ' +
      'reviewed at roughly 7–10 µV/mm equivalent. Adjust transiently to read ' +
      'specific waveforms and return to a reference value before reporting.</p>',
  },

  bandpass: {
    title: 'Bandpass filter',
    body:
      '<p>The bandpass filter combines a high-pass (low-frequency cutoff) and a ' +
      'low-pass (high-frequency cutoff). A typical clinical review band is ' +
      '0.5–70 Hz; for spectral analysis a tighter passband such as ' +
      '1–40 Hz is common.</p>' +
      '<p>Filtering is a display-time operation here. The unfiltered raw signal is ' +
      'preserved and exports always note the filter parameters used. Avoid setting ' +
      'the high-pass above 1 Hz when interpreting slow activity, and avoid setting ' +
      'the low-pass below 30 Hz when reading spike morphology.</p>',
  },

  notch: {
    title: 'Notch filter',
    body:
      '<p>The notch removes mains-frequency interference: 50 Hz in most of Europe, ' +
      'Africa, Asia, and Australia, 60 Hz in North America and parts of South America. ' +
      'It is a narrow band-stop and should be the lowest-impact way to suppress line ' +
      'noise.</p>' +
      '<p>Use the notch only when line noise is visible. Persistent contamination after ' +
      'notching usually indicates a hardware issue (loose lead, ground, or shared ' +
      'circuit) and is best resolved at the source rather than with aggressive filtering.</p>',
  },

  ica_review: {
    title: 'ICA component review',
    body:
      '<p>Independent Component Analysis decomposes the multichannel recording into ' +
      'maximally independent sources. Reviewing the topomap, time course, and power ' +
      'spectrum of each component lets you identify and exclude stereotyped artefacts ' +
      '(eye blinks, lateral eye movement, ECG, EMG, single-channel pops) without ' +
      'discarding the underlying brain signal.</p>' +
      '<p>Excluded components are subtracted on reconstruction. Track the count and ' +
      'rationale in the cleaning log so the export and report can attribute every ' +
      'rejection.</p>',
  },

  bad_channel_marking: {
    title: 'Bad channel marking',
    body:
      '<p>Bad channels are electrodes whose signal is unusable for the entire ' +
      'recording — broken leads, persistent drift, sustained EMG, or floating ' +
      'electrodes. Mark them so they are excluded from the average reference, ICA, ' +
      'spectral analysis, and any topographic display.</p>' +
      '<p>If a channel is recoverable by spherical-spline interpolation from neighbours, ' +
      'export with the Interpolate option. Otherwise export with the Drop option so the ' +
      'channel does not contaminate downstream measures.</p>',
  },

  bad_segment_marking: {
    title: 'Bad segment marking',
    body:
      '<p>Bad segments are time intervals containing artefacts that cannot be cleaned ' +
      'componentwise — movement, electrode pops, talking, or large transient ' +
      'noise. Mark them with click-and-drag on the trace.</p>' +
      '<p>Segments are excluded from epoch statistics and spectral averaging. Keep the ' +
      'total marked duration small relative to the recording: if more than roughly a ' +
      'third of the data is bad, consider re-recording rather than over-cleaning.</p>',
  },

  auto_scan: {
    title: 'Auto-scan',
    body:
      '<p>Auto-scan runs deterministic detectors over the whole recording and proposes ' +
      'bad channels and bad segments. Heuristics include flat-line detection, ' +
      'amplitude outliers, high-frequency noise, and correlation against neighbouring ' +
      'electrodes. Each suggestion includes a numeric confidence and a reason string.</p>' +
      '<p>You always review the proposals in the diff modal before they apply — ' +
      'accept, reject, or adjust each one. The decision is logged for audit alongside ' +
      'the cleaning version.</p>',
  },

  decomposition_studio: {
    title: 'Decomposition studio',
    body:
      '<p>The decomposition studio renders all ICA components in a grid: topomap, ' +
      'short time course, and a one-line summary (peak frequency, kurtosis, ' +
      'auto-classification). Click a component to inspect it full-size and exclude ' +
      'it.</p>' +
      '<p>Common stereotypes: a frontal-pole-dominant blink component, a lateral ' +
      'rectus saccade dipole, a heartbeat-locked QRS component, and tonic temporalis ' +
      'EMG. Excluding these usually accounts for the majority of cleaning gain on a ' +
      'routine waking recording.</p>',
  },

  templates: {
    title: 'Artifact templates',
    body:
      '<p>Templates are reusable cleaning recipes — e.g. "long routine, eyes ' +
      'open" or "task block, frontal blink-heavy". Selecting a template applies its ' +
      'preset filter band, montage, and detector thresholds without committing any ' +
      'specific channel or segment decisions.</p>' +
      '<p>Templates speed up triage but do not replace per-recording review. Always ' +
      'confirm channel and segment marks before signing off the cleaning version.</p>',
  },

  spike_list: {
    title: 'Spike list',
    body:
      '<p>The spike list aggregates events flagged by the spike/sharp-wave detector: ' +
      'time, peak channel, peak amplitude, classification (spike, sharp wave, ' +
      'spike-and-wave), and confidence. Click a row to jump the trace to that ' +
      'event.</p>' +
      '<p>Detector output is a starting point for review, not a diagnosis. Any ' +
      'epileptiform finding requires confirmation by a qualified electroencephalographer ' +
      'against the raw waveform on a clinical montage.</p>',
  },

  caliper: {
    title: 'Caliper / measurement tool',
    body:
      '<p>The caliper measures a span on the trace: time delta in seconds, frequency ' +
      'in Hz, and peak-to-peak amplitude in µV. Drag from one cursor position to ' +
      'another to read the values.</p>' +
      '<p>Use it to confirm that a candidate spike is shorter than 70 ms, a sharp ' +
      'wave is 70–200 ms, or a posterior dominant rhythm sits in the alpha band. ' +
      'Measurements are not stored — they are a transient inspection aid.</p>',
  },

  export: {
    title: 'Export cleaned recording',
    body:
      '<p>Export writes the cleaned recording out of the workstation. Choose a format ' +
      '(EDF for clinical interchange, FIF for MNE-Python pipelines, or BrainVision ' +
      'header + binary for downstream research tooling) and a bad-channel handling ' +
      'mode (Drop or Interpolate).</p>' +
      '<p>Every export embeds a sidecar JSON with the cleaning version, filters, ICA ' +
      'rejections, channel marks, and segment marks so the result is fully ' +
      'reproducible. The original raw recording is never overwritten.</p>',
  },

  cleaning_report: {
    title: 'Cleaning report',
    body:
      '<p>The cleaning report PDF documents what was done to the recording and why. ' +
      'It captures the cleaning version, recording metadata, filters, montage, marked ' +
      'bad channels and segments, ICA rejections, and any clinician notes from the ' +
      'sign-off step.</p>' +
      '<p>Attach the report to the patient record alongside the exported cleaned ' +
      'recording. It is the audit artefact a downstream reviewer needs to trust the ' +
      'cleaned data.</p>',
  },

  ai_quality_score: {
    title: 'AI quality score',
    body:
      '<p>The quality scorecard is a deterministic 0–100 score over the visible ' +
      'window. Subscores cover bad-channel fraction, bad-segment fraction, ' +
      'high-frequency noise, line-noise residual, and spectral plausibility.</p>' +
      '<p>Targets for a routine clinical recording are roughly: ≥90 acceptable, ' +
      '70–90 marginal, &lt;70 needs more cleaning or re-recording. The score is a ' +
      'guide, never a substitute for visual review.</p>',
  },

  ai_auto_clean: {
    title: 'AI co-pilot suggestions',
    body:
      '<p>The AI co-pilot proposes channel and segment marks plus filter adjustments ' +
      'based on the visible window. Every suggestion ships with a plain-English ' +
      'rationale and a confidence value. You accept or reject each one; the model ' +
      'never edits the cleaning state without a human action.</p>' +
      '<p>Suggestions are auditable: the prompt, model version, and your decision are ' +
      'all written to the cleaning log. Treat the co-pilot as a junior reviewer — ' +
      'helpful for triage, never authoritative.</p>',
  },
};

// Convenience: list of valid keys, exported for tests and UI wiring.
export const RAW_HELP_TOPIC_KEYS = Object.keys(RAW_HELP_TOPICS);
