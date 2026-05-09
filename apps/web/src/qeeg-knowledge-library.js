export const QEEG_LOCAL_KNOWLEDGE_LIBRARY = [
  {
    id: 'ds-qeeg-course',
    title: 'DeepSynaps qEEG Certificate Course Bundle',
    summary:
      'Structured courseware bundle distilled from local qEEG training materials, including advanced delta/theta interpretation, anti-automation raw-review guardrails, and curriculum-confirmed psychopharmacology coverage.',
    analyzerUse:
      'Use this as internal context when explaining qEEG concepts, delta/theta findings, artifact-aware interpretation, and medication-confound reasoning.',
    rawUse:
      'Use this to ground raw-review workflow, especially oscillation counting, manual artifact editing, and the bridge between waveform review and qEEG interpretation.',
    status: 'Ready in repo',
    source: 'data/courseware/knowledge-kb/qeeg-certificate-course.json',
  },
  {
    id: 'ds-qeeg-library',
    title: 'DeepSynaps qEEG Reference Library',
    summary:
      'Indexed OneDrive qEEG resource set containing books, handbook PDFs, drafts, EDF/EEG recordings, and image references. Some assets may still require hydration before deeper extraction.',
    analyzerUse:
      'Use the library manifest to know which qEEG books, drafts, and references exist and which ones still need hydration before deeper extraction.',
    rawUse:
      'Use the sample-session inventory to plan parser fixtures, raw-workbench demos, and EDF/EEG ingestion tests.',
    status: 'Indexed in repo',
    source: 'data/courseware/knowledge-kb/qeeg-reference-library.json',
  },
  {
    id: 'ds-qeeg-session-library',
    title: 'DeepSynaps qEEG Session Library',
    summary:
      'Live registry of multi-file qEEG recording sessions imported from the current OneDrive Germany session tree, including EDF, EEG, DOCX, and acquisition support files.',
    analyzerUse:
      'Use this as provenance context when linking qEEG analyses back to known session folders, acquisition sets, and reusable sample datasets.',
    rawUse:
      'Use this directly for raw-workbench fixtures, parser testing, and reusable sample-session navigation across EDF and EEG assets.',
    status: 'Ready in repo',
    source: 'data/courseware/knowledge-kb/qeeg-germany-session-library.json',
  },
  {
    id: 'ds-qeeg-course-research',
    title: 'DeepSynaps qEEG Course Research Library',
    summary:
      'Repo-native paper library extracted from the local USA qEEG course folder, including psychopharmacology, connectivity, artifact, dementia, ADHD, and neurofeedback references.',
    analyzerUse:
      'Use this when the analyzer or copilot needs local evidence support for qEEG interpretation patterns before falling back to external paper search.',
    rawUse:
      'Use this when raw-review notes need literature support for artifact, source-separation, medication-confound, or waveform-context decisions.',
    status: 'Ready in repo',
    source: 'data/courseware/knowledge-kb/qeeg-course-research-library.json',
  },
];

export const QEEG_COURSEWARE_GUIDANCE = {
  analyzer: [
    'Do not escalate an abnormality from computed output alone before checking raw morphology, montage, and artifact burden.',
    'Use delta/theta findings as context-dependent patterns and integrate age, state, and localization before calling them pathological.',
    'Check medication, caffeine, nicotine, alcohol, and stimulant exposure before interpreting slowing, beta excess, or altered arousal as intrinsic dysfunction.',
    'Frame topographic maps and report language as downstream summaries of reviewed raw data, not standalone evidence.',
  ],
  raw: [
    'Review suspicious segments manually before rejecting them; distinguish artifact from cerebral signal using morphology, spread, and state context.',
    'Count oscillations directly in the trace when frequency identity is unclear so delta/theta labels match the waveform.',
    'Inspect frontocentral theta for state, familial, or artifact context before treating it as an abnormal training target.',
    'When a tracing shows generalized beta, attenuation, or slowing, verify medication and substance confounds before annotating pathology.',
  ],
  agents: [
    'Use repo-native qEEG courseware as first-line context for psychopharmacology, artifact review, waveform interpretation, and reporting boundaries.',
    'Search the local qEEG course research library before external literature when the question matches imported course papers or article summaries.',
    'Keep regulatory posture cautious: qEEG guidance is decision support and must stay tied to reviewed signal quality and clinical context.',
    'Prefer local courseware guardrails before falling back to external educational summaries or unsupported inference.',
  ],
};

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderQEEGCoursewareGuidanceCard(options) {
  const opts = options || {};
  const audience = opts.audience === 'raw' ? 'raw' : opts.audience === 'agents' ? 'agents' : 'analyzer';
  const items = QEEG_COURSEWARE_GUIDANCE[audience] || [];
  if (!items.length) return '';
  const title = opts.title || 'Local qEEG Courseware Guardrails';
  const intro = opts.intro || 'Repo-native guidance distilled from the imported qEEG teaching bundle. Use these rules before trusting derived metrics or AI summaries.';
  return '<div class="ds-card">'
    + '<div class="ds-card__header"><h3>' + esc(title) + '</h3></div>'
    + '<div class="ds-card__body">'
    + '<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px">' + esc(intro) + '</div>'
    + '<div style="display:grid;gap:10px">'
    + items.map(function (item) {
      return '<div style="padding:12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);font-size:12px;line-height:1.6;color:var(--text-secondary)">' + esc(item) + '</div>';
    }).join('')
    + '</div>'
    + '</div></div>';
}
