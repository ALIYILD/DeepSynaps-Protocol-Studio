function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LEARNING_EEG_REFERENCE = [
  {
    id: 'foundations',
    title: 'Signal foundations',
    summary: 'Use this when explaining where scalp EEG comes from: synchronized cortical activity, polarity, and why dipole orientation can distort localization.',
    analyzerUse: 'Frame spectral and localization findings as indirect scalp measures, not direct single-neuron readouts.',
    rawUse: 'Anchor manual review around polarity, morphology, and the limits of scalp localization before cleaning or annotating.',
    url: 'https://www.learningeeg.com/basic-eeg-electrophysiology',
  },
  {
    id: 'montage',
    title: '10-20 system and montages',
    summary: 'Covers electrode placement plus the practical difference between referential and bipolar views when chasing phase reversal and field.',
    analyzerUse: 'Support interpretation notes when asymmetry or focality changes with montage choice.',
    rawUse: 'Useful during raw review when switching between referential, bipolar longitudinal, and transverse views.',
    url: 'https://www.learningeeg.com/montages-and-technical-components',
  },
  {
    id: 'terminology',
    title: 'Waveform terminology',
    summary: 'Defines delta, theta, alpha, beta, amplitude, and morphology so staff can describe patterns consistently.',
    analyzerUse: 'Maps band-power outputs back to standard EEG language clinicians already use in reports.',
    rawUse: 'Helps label observed rhythms by frequency range and morphology during trace inspection.',
    url: 'https://www.learningeeg.com/terminology-and-waveforms',
  },
  {
    id: 'normal-awake',
    title: 'Normal awake background',
    summary: 'Summarizes organization, posterior dominant rhythm, symmetry, variability, and reactivity expected in a healthy awake tracing.',
    analyzerUse: 'Useful as a baseline checklist before calling slowing, asymmetry, or poor organization abnormal.',
    rawUse: 'Use as a quick pass/fail reference when deciding whether alpha, AP gradient, and reactivity look preserved.',
    url: 'https://www.learningeeg.com/normal-awake',
  },
  {
    id: 'artifacts',
    title: 'Artifacts',
    summary: 'Practical recognition guide for blinks, muscle, movement, and electrical noise so artefact is separated from cerebral signal.',
    analyzerUse: 'Reinforces why poor raw quality can inflate delta/theta burden, asymmetry, or connectivity outliers.',
    rawUse: 'Primary reference for deciding whether to annotate, reject, filter, or leave a segment untouched.',
    url: 'https://www.learningeeg.com/artifacts',
  },
  {
    id: 'epileptiform',
    title: 'Epileptiform patterns',
    summary: 'Covers spikes, sharps, rhythmic patterns, and examples such as TIRDA that raise concern for cortical hyperexcitability.',
    analyzerUse: 'Keeps the qEEG page grounded: quantitative deviation does not replace direct review for epileptiform morphology.',
    rawUse: 'Use when suspicious rhythmic or sharply contoured events need escalation rather than automatic cleaning.',
    url: 'https://www.learningeeg.com/epileptiform-activity',
  },
  {
    id: 'normal-asleep',
    title: 'Normal asleep EEG',
    summary: 'Summarizes drowsiness, stage I and II sleep, POSTS, vertex waves, spindles, K complexes, slow wave sleep, and REM patterns.',
    analyzerUse: 'Useful when a recording contains eyes-closed drowsiness or sleep and slowing should not be overcalled as pathology.',
    rawUse: 'Helps distinguish sleep architecture from artefact or epileptiform-appearing sharp transients during cleaning review.',
    url: 'https://www.learningeeg.com/normal-asleep',
  },
  {
    id: 'normal-variants',
    title: 'Normal variants',
    summary: 'Reference for benign patterns that can look concerning at first pass, such as mu rhythm, wickets, lambda waves, and related variants.',
    analyzerUse: 'Reminds users not to over-interpret benign sharply contoured activity as abnormal quantitative outlier burden.',
    rawUse: 'Helpful before annotating sharp-looking but nonevolving patterns as pathological.',
    url: 'https://www.learningeeg.com/normal-variants',
  },
  {
    id: 'non-epileptiform',
    title: 'Non-epileptiform abnormalities',
    summary: 'Covers generalized and focal slowing, disorganization, asymmetry, attenuation, breach, and other patterns of cerebral dysfunction outside epilepsy.',
    analyzerUse: 'Pairs well with diffuse slowing, asymmetry, and background-disorganization findings surfaced by qEEG metrics.',
    rawUse: 'Useful when abnormalities are real but should be categorized as dysfunction rather than seizure or artefact.',
    url: 'https://www.learningeeg.com/slowing-and-other-non-epileptiform-abnormalities',
  },
  {
    id: 'seizures',
    title: 'Seizures',
    summary: 'Emphasizes that ictal events require evolution over time or space, with practical separation from fluctuating but non-evolving rhythmic activity.',
    analyzerUse: 'Important guardrail: abnormal qEEG should not be described as seizure without direct evolving EEG evidence.',
    rawUse: 'Use when reviewing suspicious runs to decide whether they evolve enough to warrant urgent escalation.',
    url: 'https://www.learningeeg.com/seizures',
  },
  {
    id: 'neonatal',
    title: 'Neonatal EEG',
    summary: 'Explains why neonatal recordings are developmentally distinct, including expected discontinuity, asynchrony, slowing, and modified technical setup.',
    analyzerUse: 'Warns against applying adult expectations or adult quantitative assumptions to neonatal recordings.',
    rawUse: 'Useful for age-aware raw review when neonatal discontinuity or montage differences might otherwise be misread as poor quality.',
    url: 'https://www.learningeeg.com/neonatal',
  },
  {
    id: 'pediatric',
    title: 'Pediatric EEG',
    summary: 'Summarizes age-dependent maturation, especially evolving posterior dominant rhythm and normal slowing patterns across infancy and childhood.',
    analyzerUse: 'Supports age-appropriate interpretation of band power and background organization in children.',
    rawUse: 'Helps reviewers avoid calling developmentally normal pediatric slowing or sleep features abnormal.',
    url: 'https://www.learningeeg.com/pediatric',
  },
];

export function renderLearningEEGReferenceCard(options) {
  const opts = options || {};
  const audience = opts.audience === 'raw' ? 'raw' : 'analyzer';
  const title = opts.title || 'Learning EEG Reference';
  const intro = opts.intro || 'External educational material, summarized for in-app decision support. Open the source site for full examples and original figures.';
  const items = LEARNING_EEG_REFERENCE.map(function (entry) {
    const useText = audience === 'raw' ? entry.rawUse : entry.analyzerUse;
    return '<div class="qeeg-learning-ref__item">'
      + '<div class="qeeg-learning-ref__title">' + esc(entry.title) + '</div>'
      + '<div class="qeeg-learning-ref__summary">' + esc(entry.summary) + '</div>'
      + '<div class="qeeg-learning-ref__use"><strong>Use here:</strong> ' + esc(useText) + '</div>'
      + '<div class="qeeg-learning-ref__link"><a href="' + esc(entry.url) + '" target="_blank" rel="noopener noreferrer">Open source</a></div>'
      + '</div>';
  }).join('');

  return '<div class="ds-card qeeg-learning-ref">'
    + '<div class="ds-card__header"><h3>' + esc(title) + '</h3></div>'
    + '<div class="ds-card__body">'
    + '<div class="qeeg-learning-ref__intro">' + esc(intro) + '</div>'
    + '<div class="qeeg-learning-ref__note">Source: Learning EEG by David Valentine MD. This product stores only brief reference summaries and links, not a mirrored copy of the site.</div>'
    + '<div class="qeeg-learning-ref__grid">' + items + '</div>'
    + '</div></div>';
}

export function renderLearningEEGCompactList(options) {
  const opts = options || {};
  const audience = opts.audience === 'raw' ? 'raw' : 'analyzer';
  return '<div class="qwb-side-section">'
    + '<div style="font-weight:600;font-size:13px;margin-bottom:8px">Learning EEG Reference</div>'
    + '<div style="font-size:11px;color:#6b6660;margin-bottom:10px">Short summaries with source links only. Open the original site for full educational content and figures.</div>'
    + LEARNING_EEG_REFERENCE.map(function (entry) {
      var useText = audience === 'raw' ? entry.rawUse : entry.analyzerUse;
      return '<div class="qwb-card">'
        + '<div style="font-weight:600;font-size:12px;margin-bottom:4px">' + esc(entry.title) + '</div>'
        + '<div style="font-size:11px;line-height:1.4;margin-bottom:6px">' + esc(entry.summary) + '</div>'
        + '<div style="font-size:10px;line-height:1.5;color:#3a3633;margin-bottom:6px"><strong>Use here:</strong> ' + esc(useText) + '</div>'
        + '<a href="' + esc(entry.url) + '" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:#2851a3">Open source</a>'
        + '</div>';
    }).join('')
    + '</div>';
}
