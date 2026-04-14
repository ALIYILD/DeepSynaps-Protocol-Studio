/**
 * Registry widget help content (high-signal, clinician-facing).
 * Transport-agnostic: pure content + renderers for modal HTML.
 */

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** @typedef {{ title: string, summary: string, bullets?: string[], links?: { label: string, url: string }[] }} RegistryInfoBlock */

export const REGISTRY_WIDGET_INFO = Object.freeze({
  conditions: {
    title: 'Condition Registry',
    summary: 'A curated catalog of conditions with IDs, ICD-10, modality/target coverage, and evidence tiering used across protocols and templates.',
    bullets: [
      'Use it to standardize condition labels across the app (courses, protocols, exports).',
      'Evidence tiers are a quick “strength-of-support” signal; confirm with primary sources when making clinical decisions.',
      'Keep modality/target coverage aligned with your protocol templates and device capabilities.',
    ],
    links: [
      { label: 'What is a clinical registry? (NCBI Bookshelf)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK208643/' },
      { label: 'WHO: International Clinical Trials Registry Platform', url: 'https://www.who.int/clinical-trials-registry-platform' },
    ],
  },
  assessments: {
    title: 'Assessment Registry',
    summary: 'A library of validated instruments (self-report and clinician-rated) with domains, scoring notes, and recommended cadence.',
    bullets: [
      'Pick brief screeners for routine monitoring; use clinician-rated scales for depth or when reliability matters.',
      'Prefer consistent cadence so outcome trends are interpretable (baseline → weekly/biweekly → discharge).',
      'If an instrument requires structured administration (e.g., HAM-D), ensure staff training to reduce variability.',
    ],
    links: [
      { label: 'Outcome measurement validity (NCBI Bookshelf)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK409740/' },
      { label: 'PHQ-9 instrument information (PHQ Screeners)', url: 'https://www.phqscreeners.com/' },
    ],
  },
  protocols: {
    title: 'Protocol Templates',
    summary: 'Parameterized treatment templates (target, laterality, frequency, intensity, dose) that you can use as a starting point for courses.',
    bullets: [
      'Frequency and pattern determine excitatory/inhibitory effects (e.g., high-frequency vs low-frequency rTMS).',
      'Intensity is typically set relative to an individual calibration (e.g., % motor threshold in TMS).',
      'Session count and cadence drive total dose and adherence planning.',
    ],
    links: [
      { label: 'rTMS overview (StatPearls / NCBI Bookshelf)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK568715/' },
      { label: 'NIH: ClinicalTrials.gov (study design context)', url: 'https://clinicaltrials.gov/' },
    ],
  },
  devices: {
    title: 'Device Registry',
    summary: 'A catalog of devices with settings, use constraints, and regulatory notes to support safe selection and documentation.',
    bullets: [
      'Use regulatory pathway notes (510(k)/PMA/De Novo/HDE) as context, not a substitute for indications and labeling.',
      'Cross-check modality + target compatibility before assigning a protocol or home program device.',
      'Record constraints (contraindications, monitoring requirements) close to the point of care.',
    ],
    links: [
      { label: 'FDA: Establishment registration & device listing', url: 'https://www.fda.gov/medical-devices/device-registration-and-listing' },
      { label: 'FDA: 510(k) clearance process overview', url: 'https://www.fda.gov/medical-devices/premarket-submissions/selecting-correct-premarket-submission' },
    ],
  },
  targets: {
    title: 'Brain Targets',
    summary: 'A reference for stimulation/recording targets (regions, laterality, and locator conventions) used by protocols and device setup.',
    bullets: [
      'Targets can be specified by EEG 10–20/10–10 positions, anatomical landmarks, or neuronavigation coordinates.',
      'Laterality matters; ensure the target matches the protocol intent (e.g., left vs right DLPFC).',
      'When precision matters, prefer neuronavigation and document the method used.',
    ],
    links: [
      { label: '10–20 system (overview)', url: 'https://en.wikipedia.org/wiki/10%E2%80%9320_system_(EEG)' },
      { label: 'PMC: TMS coil placement & prefrontal localization', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2882797/' },
    ],
  },
  consent: {
    title: 'Consent & Documents',
    summary: 'Consent record templates and document controls for clinical workflow: signing, withdrawal/revocation, expiration, and auditability.',
    bullets: [
      'Use consistent document references and versioning so the active consent is unambiguous.',
      'Model “withdrawn/expired” states explicitly; keep an audit trail for governance and QA.',
      'Make patient expectations clear (scope, risks, alternatives, and what happens if they withdraw consent).',
    ],
    links: [
      { label: 'HHS: HIPAA Privacy Rule standards (professional)', url: 'https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/standards-privacy-individually-identifiable-health-information/index.html' },
      { label: 'HHS OHRP: consent form writing checklist', url: 'https://www.hhs.gov/ohrp/regulations-and-policy/guidance/checklist-of-strategies-for-writing-and-reviewing-consent-forms/index.html' },
    ],
  },
  reports: {
    title: 'Report Templates',
    summary: 'Reusable note/report structures (SOAP/DAP/BIRP variants) to keep documentation consistent, complete, and reviewable.',
    bullets: [
      'Use a standardized structure to reduce omissions and support clinical communication.',
      'Keep summaries concise; include key parameters, response, adverse events, and plan changes.',
      'Templates should help you document medical necessity and next steps without extra clicks.',
    ],
    links: [
      { label: 'AHRQ: Clinical documentation (Health IT)', url: 'https://digital.ahrq.gov/technology/clinical-documentation' },
      { label: 'AHRQ: Team approach to EHR documentation', url: 'https://www.ahrq.gov/evidencenow/tools/team-documentation.html' },
    ],
  },
  handbooks: {
    title: 'Handbook Templates',
    summary: 'Patient-facing education packs: plain-language explanations, how-to steps, safety guidance, and adherence supports.',
    bullets: [
      'Aim for clear, accessible language (often ~5th–6th grade reading level) and concrete next steps.',
      'Include “when to seek help” guidance and avoid ambiguous instructions.',
      'Treat handbooks as living documents—review periodically as evidence and practice change.',
    ],
    links: [
      { label: 'NIH MedlinePlus: understanding medical words', url: 'https://medlineplus.gov/understandingmedicalwords.html' },
      { label: 'Creating patient education documents (UW Health Online)', url: 'https://healthonline.washington.edu/sites/default/files/record_pdfs/Creating-Patient-Education-Documents_02-2025.pdf' },
    ],
  },
  'home-programs': {
    title: 'Home Program Templates',
    summary: 'Between-session assignments (“homework”) designed to improve adherence and extend therapeutic gains outside the clinic.',
    bullets: [
      'Align tasks to the session’s key takeaway and make the rationale explicit.',
      'Collaboratively set difficulty/effort to avoid non-adherence spirals; review completion at the next session.',
      'Track completion and barriers; adjust tasks rather than repeating assignments that aren’t working.',
    ],
    links: [
      { label: 'MedlinePlus: cognitive behavioral therapy for depression', url: 'https://medlineplus.gov/ency/patientinstructions/000415.htm' },
      { label: 'PositivePsychology.com: homework in CBT (overview)', url: 'https://positivepsychology.com/homework-in-cbt/' },
    ],
  },
  'virtual-care': {
    title: 'Virtual Care Templates',
    summary: 'Clinician-to-patient messaging templates and flows for follow-up, adherence nudges, check-ins, and boundaries.',
    bullets: [
      'Set response-time expectations and escalation pathways (this is not emergency care).',
      'Keep messages brief; route sensitive details through secure channels and document clinically relevant exchanges.',
      'Use templates as starting points—personalize without introducing unnecessary PHI into plain text.',
    ],
    links: [
      { label: 'HHS: Telehealth privacy & security (HIPAA)', url: 'https://www.hhs.gov/hipaa/for-professionals/special-topics/telehealth/index.html' },
      { label: 'AAFP: electronic messaging in practice', url: 'https://www.aafp.org/pubs/fpm/issues/2022/1100/electronic-messaging-tips.html' },
    ],
  },
});

/** Cross-registry context: how each registry type relates to the rest of the product. */
const CROSSWALK = Object.freeze({
  conditions: [
    { t: 'Clinical recommendations & evidence', d: 'Pair this diagnosis label with current specialty society and regulatory indications for neuromodulation. The Ev badge is a catalog shorthand—not a substitute for chart-level reasoning or payer policy.' },
    { t: 'Assessments', d: 'Use the Assessment Registry to match screeners and rating scales to this condition’s domain (see suggested instrument IDs on the card when present). Consistent timing makes before/after comparisons meaningful.' },
    { t: 'Protocols', d: 'Protocol Templates are filtered by condition and modality; pick a template that matches the intended neuromodulation approach, then individualize dose and session plan.' },
    { t: 'Devices', d: 'Device Registry entries list clearance context and clinic/home suitability. Verify device–modality fit and labeling before assigning hardware to this condition.' },
    { t: 'Brain targets', d: 'Suggested 10–20/10–10 sites on the condition card align with common montages—confirm against your protocol and neuronavigation workflow.' },
    { t: 'Consent & documents', d: 'Ensure informed consent and any addenda reflect procedure, risks, alternatives, and whether treatment is on- or off-label for this condition.' },
    { t: 'Reports', d: 'Document diagnosis, rationale for neuromodulation, response metrics tied to the assessments you use, and adverse events in your report templates.' },
    { t: 'Handbooks', d: 'Patient education should reflect this condition name, warning signs, and what to expect across the treatment course.' },
    { t: 'Home program', d: 'Between-session tasks should reinforce the same functional goals and safety checks relevant to this condition (e.g., seizure precautions when flagged).' },
    { t: 'Virtual care', d: 'Async messages can reinforce adherence and safety monitoring appropriate to this diagnosis without replacing urgent or emergent care.' },
  ],
  assessments: [
    { t: 'Clinical recommendations & evidence', d: 'Choose instruments that are valid for the population and setting; prefer widely used tools when you need normative interpretation or interoperability.' },
    { t: 'Conditions', d: 'Condition Registry links (when listed on an instrument) show where a scale is commonly applied—verify fit for your patient’s presentation.' },
    { t: 'Protocols', d: 'Outcome measures should align with protocol endpoints (e.g., depression scales for antidepressant neuromodulation trials).' },
    { t: 'Devices', d: 'Some scales capture device-tolerance or side effects; pair with structured session checks when your workflow requires.' },
    { t: 'Brain targets', d: 'Symptom domains may inform which network-level outcomes you emphasize, but targets themselves come from Protocol/Device registries.' },
    { t: 'Consent & documents', d: 'Document who administered clinician-rated scales and that patients understood self-report instructions when applicable.' },
    { t: 'Reports', d: 'Pull score summaries and interpretation into progress notes using your Report Template Registry structures.' },
    { t: 'Handbooks', d: 'Explain in plain language what a score means for the patient’s plan—not raw numbers alone.' },
    { t: 'Home program', d: 'Use brief repeated measures where homework targets the same symptom domain you are tracking.' },
    { t: 'Virtual care', d: 'Short PROMs can be referenced in secure messages to guide titration or follow-up timing.' },
  ],
  protocols: [
    { t: 'Clinical recommendations & evidence', d: 'Compare template parameters to current evidence summaries and device labeling; templates are starting points, not orders.' },
    { t: 'Conditions', d: 'Each template names an intended condition context—keep diagnosis alignment when copying into a patient course.' },
    { t: 'Assessments', d: 'Define which outcomes will demonstrate response for this protocol’s goals and at what cadence they are collected.' },
    { t: 'Devices', d: 'Confirm the stimulator class and accessories support the waveform, intensity limits, and coil implied by the template.' },
    { t: 'Brain targets', d: 'Laterality, frequency, and target label must agree with your montage plan and any imaging-guided placement.' },
    { t: 'Consent & documents', d: 'Protocols with higher burden or off-label elements may need explicit documentation in consent and institutional policy.' },
    { t: 'Reports', d: 'Session logs should mirror the protocol’s parameter fields for auditability and handoffs.' },
    { t: 'Handbooks', d: 'Give patients a simplified explanation of session structure, expected timeline, and side effects tied to this protocol family.' },
    { t: 'Home program', d: 'Assign homework that supports the same neurobehavioral targets the in-clinic protocol emphasizes.' },
    { t: 'Virtual care', d: 'Use messaging templates to set expectations for session frequency, side-effect reporting, and escalation.' },
  ],
  devices: [
    { t: 'Clinical recommendations & evidence', d: 'Regulatory clearance and indications are device-specific—cross-check summaries in peer-reviewed literature and labeling.' },
    { t: 'Conditions', d: 'Match indication statements to the patient’s working diagnosis and institutional formulary for neuromodulation devices.' },
    { t: 'Assessments', d: 'Select monitoring scales appropriate to the adverse-effect profile of the device class you deploy.' },
    { t: 'Protocols', d: 'Only apply protocol templates that the hardware can deliver (coil type, waveform, intensity ceilings, channel count).' },
    { t: 'Brain targets', d: 'Coil geometry and target entry may constrain which sites are practical—coordinate with Brain Target Registry conventions.' },
    { t: 'Consent & documents', d: 'Include device name, risks from labeling, and alternatives; update if firmware or accessories change materially.' },
    { t: 'Reports', d: 'Record device identifiers, settings, and site for traceability and safety audits.' },
    { t: 'Handbooks', d: 'Patient materials should cover operation basics, hygiene, and when to stop use and call the clinic.' },
    { t: 'Home program', d: 'Home-capable devices link directly to take-home assignments; clinic-only devices should not appear in unsupervised homework.' },
    { t: 'Virtual care', d: 'Remote check-ins can verify correct device use and adherence when supported by policy.' },
  ],
  targets: [
    { t: 'Clinical recommendations & evidence', d: 'Anatomical labels are educational; stimulation plans should follow specialty guidance and individual anatomy.' },
    { t: 'Conditions', d: 'Targets are chosen because networks implicated in the disorder overlap these regions—validate against your clinical indication.' },
    { t: 'Assessments', d: 'Pick outcomes that reflect functions mediated by the stimulated network (e.g., mood, attention, motor).' },
    { t: 'Protocols', d: 'Protocol templates reference targets by label; reconcile with your neuronavigation or landmark-based approach.' },
    { t: 'Devices', d: 'Coil size, focality, and depth capability determine whether a named target is achievable in practice.' },
    { t: 'Consent & documents', d: 'Document how targets were localized (cap, frameless nav, ultrasound, etc.) when precision affects risk/benefit discussion.' },
    { t: 'Reports', d: 'Include target, method of localization, and any adjustments across the treatment course.' },
    { t: 'Handbooks', d: 'Use patient-friendly diagrams or descriptions when educating about stimulation location and sensations.' },
    { t: 'Home program', d: 'Homework should not contradict positioning or safety implied by stimulation at this target.' },
    { t: 'Virtual care', d: 'Clarify in messages that patients cannot self-adjust targets outside supervised settings.' },
  ],
  consent: [
    { t: 'Clinical recommendations & evidence', d: 'Follow institutional policy and applicable law; templates here organize fields—not legal advice.' },
    { t: 'Conditions', d: 'Consent text should name the condition(s) being treated and how diagnosis was established when relevant.' },
    { t: 'Assessments', d: 'State what data collection patients authorize (scores, recordings) and how results may be used.' },
    { t: 'Protocols', d: 'Describe planned procedures at a level consistent with what will appear in the medical record.' },
    { t: 'Devices', d: 'Name devices or device classes, known risks from labeling, and training required for home use if applicable.' },
    { t: 'Brain targets', d: 'When stimulation location affects risk profile, disclose general anatomical approach as your practice requires.' },
    { t: 'Reports', d: 'Note consent version and date in documentation templates tied to the episode of care.' },
    { t: 'Handbooks', d: 'Patient-facing summaries should mirror consent themes without replacing signed documents.' },
    { t: 'Home program', d: 'Authorize homework data sharing if you track completion in the record.' },
    { t: 'Virtual care', d: 'Cover asynchronous communication scope, hours, and emergency instructions.' },
  ],
  reports: [
    { t: 'Clinical recommendations & evidence', d: 'Notes should support medical necessity and continuity; align wording with payer or institutional standards where required.' },
    { t: 'Conditions', d: 'Tie narrative to active problems and how neuromodulation addresses them.' },
    { t: 'Assessments', d: 'Embed score changes longitudinally; cite instrument names and timepoints.' },
    { t: 'Protocols', d: 'Reference delivered parameters or link to structured session data when available.' },
    { t: 'Devices', d: 'Identify hardware and settings used during the reporting interval.' },
    { t: 'Brain targets', d: 'State montage/target when it affects interpretation or comparison across visits.' },
    { t: 'Consent & documents', d: 'Reference consent for procedures performed in the encounter window.' },
    { t: 'Handbooks', d: 'Point patients to education materials issued alongside documented interventions.' },
    { t: 'Home program', d: 'Summarize adherence and barriers to between-session work.' },
    { t: 'Virtual care', d: 'Document clinically relevant secure messages or telehealth contacts per policy.' },
  ],
  handbooks: [
    { t: 'Clinical recommendations & evidence', d: 'Education should reflect consensus care paths; cite institution-specific pathways when they differ.' },
    { t: 'Conditions', d: 'Use the same condition language as the chart to avoid confusion.' },
    { t: 'Assessments', d: 'Explain what questionnaires mean and why patients complete them on a schedule.' },
    { t: 'Protocols', d: 'Describe what a typical in-clinic session feels like without promising individual outcomes.' },
    { t: 'Devices', d: 'Cover basic operation, charging, hygiene, and manufacturer hotlines where appropriate.' },
    { t: 'Brain targets', d: 'Use simple diagrams; avoid implying patients self-adjust stimulation location.' },
    { t: 'Consent & documents', d: 'Remind patients that handbooks supplement, not replace, signed consent.' },
    { t: 'Reports', d: 'Clinicians can note which handbook version was provided for traceability.' },
    { t: 'Home program', d: 'Handbooks and homework should tell a single coherent story about goals and safety.' },
    { t: 'Virtual care', d: 'Set expectations for how patients may message the team between visits.' },
  ],
  'home-programs': [
    { t: 'Clinical recommendations & evidence', d: 'Between-session work should be evidence-informed and feasible; escalate if homework becomes a barrier.' },
    { t: 'Conditions', d: 'Tasks should match functional limitations and precautions for the active diagnoses.' },
    { t: 'Assessments', d: 'Choose outcome tools that reflect skills practiced at home.' },
    { t: 'Protocols', d: 'Home assignments should reinforce targets and themes from the in-clinic neuromodulation plan.' },
    { t: 'Devices', d: 'Only assign home device drills when the patient has training, support, and cleared hardware.' },
    { t: 'Brain targets', d: 'Motor or cognitive homework should be consistent with stimulation goals without unsupervised parameter changes.' },
    { t: 'Consent & documents', d: 'Authorize collection of homework completion data if stored in the chart.' },
    { t: 'Reports', d: 'Summarize adherence, barriers, and adjustments to assignments.' },
    { t: 'Handbooks', d: 'Cross-link to patient education that explains why homework matters.' },
    { t: 'Virtual care', d: 'Use secure messaging for quick troubleshooting of homework—not emergency care.' },
  ],
  'virtual-care': [
    { t: 'Clinical recommendations & evidence', d: 'Asynchronous care extends continuity; it does not replace evaluation when symptoms worsen.' },
    { t: 'Conditions', d: 'Triage messages with the active problem list in mind; escalate when red flags appear.' },
    { t: 'Assessments', d: 'Prompt validated scales through secure workflows when remote monitoring is part of the plan.' },
    { t: 'Protocols', d: 'Reinforce session schedule, side-effect checks, and preparation steps between visits.' },
    { t: 'Devices', d: 'Offer troubleshooting within scope; direct to urgent care for device-related injury or malfunction per policy.' },
    { t: 'Brain targets', d: 'Do not coach patients to change montage; defer to in-person visits for hardware changes.' },
    { t: 'Consent & documents', d: 'Ensure patients agreed to electronic communication boundaries and privacy practices.' },
    { t: 'Reports', d: 'Copy or summarize message content into the record when it affects clinical decisions.' },
    { t: 'Handbooks', d: 'Point to education for self-management topics raised in threads.' },
    { t: 'Home program', d: 'Use messages to nudge homework completion and problem-solve obstacles.' },
  ],
});

function dlRow(label, value) {
  if (value === undefined || value === null || value === '') return '';
  const v = Array.isArray(value) ? value.join(', ') : String(value);
  if (!v.trim()) return '';
  return `<div class="ds-modal-dl-row"><span class="ds-modal-dl-k">${esc(label)}</span><span class="ds-modal-dl-v">${esc(v)}</span></div>`;
}

/**
 * @param {string} kind
 * @param {Record<string, unknown>} item
 */
function formatItemSnapshot(kind, item) {
  const rows = [];
  if (kind === 'conditions') {
    rows.push(dlRow('Registry ID', item.id), dlRow('ICD-10', item.icd10), dlRow('Category', item.cat), dlRow('Evidence tier', item.ev));
    rows.push(dlRow('Modalities', item.modalities), dlRow('Suggested targets', item.targets), dlRow('On-label modalities (catalog)', item.onLabel));
    rows.push(dlRow('Suggested assessments (IDs)', item.assessments), dlRow('Flags', item.flags), dlRow('Notes', item.notes));
  } else if (kind === 'assessments') {
    rows.push(dlRow('ID', item.id), dlRow('Domain', item.domain), dlRow('Type', item.type), dlRow('Evidence tier', item.ev));
    rows.push(dlRow('Items', item.items), dlRow('Duration (min)', item.mins), dlRow('Scoring', item.scoring));
    rows.push(dlRow('Typical cadence', item.freq), dlRow('Condition links (IDs)', item.conditions));
    if (item.link) rows.push(dlRow('External reference', item.link));
  } else if (kind === 'protocols') {
    rows.push(dlRow('Name', item.name), dlRow('Modality', item.modality), dlRow('Condition context', item.condition), dlRow('Evidence tier', item.ev));
    rows.push(dlRow('Target', item.target), dlRow('Laterality', item.laterality), dlRow('Frequency', item.freq), dlRow('Intensity', item.intensity));
    rows.push(dlRow('Sessions', item.sessions), dlRow('Per week', item.sessPerWeek), dlRow('Duration', item.duration), dlRow('Notes', item.notes));
  } else if (kind === 'devices') {
    rows.push(dlRow('Device', item.name), dlRow('Manufacturer', item.mfr), dlRow('Modality', item.modality), dlRow('Type', item.type));
    rows.push(dlRow('Regulatory clearance', item.clearance), dlRow('Indication (catalog)', item.indication), dlRow('Clinic / home', item.homeClinic));
    rows.push(dlRow('Channels', item.channels), dlRow('Notes', item.notes));
  } else if (kind === 'targets') {
    rows.push(dlRow('Label', item.label), dlRow('Region', item.region), dlRow('Lobe', item.lobe));
    rows.push(dlRow('10–20 site', item.site10_20), dlRow('10–10 site', item.site10_10), dlRow('Brodmann (BA)', item.ba));
    rows.push(dlRow('Function', item.function), dlRow('Clinical use', item.clinical));
  } else if (kind === 'consent') {
    rows.push(dlRow('Document', item.name), dlRow('Version', item.version), dlRow('Category', item.cat), dlRow('Required', item.required ? 'Yes' : 'No'));
    rows.push(dlRow('Description', item.desc), dlRow('Fields', item.fields));
  } else if (kind === 'reports') {
    rows.push(dlRow('Template', item.name), dlRow('Category', item.cat), dlRow('Cadence', item.freq), dlRow('Auto-generated', item.auto ? 'Yes' : 'No'));
    rows.push(dlRow('Description', item.desc), dlRow('Sections', item.sections));
  } else if (kind === 'handbooks') {
    rows.push(dlRow('Handbook', item.name), dlRow('Category', item.cat), dlRow('Pages', item.pages), dlRow('Format', item.format));
    rows.push(dlRow('Condition focus', item.condition), dlRow('Description', item.desc));
  } else if (kind === 'home-programs') {
    rows.push(dlRow('Program', item.name), dlRow('Category', item.cat), dlRow('Condition', item.condition), dlRow('Evidence tier', item.ev));
    rows.push(dlRow('Frequency', item.freq), dlRow('Duration', item.duration), dlRow('Device', item.device), dlRow('Task types', item.tasks));
    rows.push(dlRow('Description', item.desc));
  } else if (kind === 'virtual-care') {
    rows.push(dlRow('Template', item.name), dlRow('Category', item.cat), dlRow('Modality', item.modality), dlRow('Duration (min)', item.duration));
    rows.push(dlRow('Staffing', item.staffing), dlRow('Tasks', item.tasks), dlRow('Description', item.desc));
  }
  return rows.filter(Boolean).join('');
}

export function renderRegistryInfoModal(kind) {
  const info = REGISTRY_WIDGET_INFO[kind];
  if (!info) return '';
  const links = (info.links || [])
    .map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--teal)">${esc(l.label)}</a>`)
    .join('<br>');

  return `
    <div class="ds-modal-backdrop" onclick="window._closeRegistryInfo?.(true)">
      <div class="ds-modal" role="dialog" aria-modal="true" aria-label="${esc(info.title)}" onclick="event.stopPropagation()">
        <div class="ds-modal-hdr">
          <div style="min-width:0">
            <div class="ds-modal-title">${esc(info.title)}</div>
            <div class="ds-modal-sub">${esc(info.summary)}</div>
          </div>
          <button class="ds-modal-x" type="button" onclick="window._closeRegistryInfo?.(false)" aria-label="Close">×</button>
        </div>
        <div class="ds-modal-body">
          <ul class="ds-modal-ul">
            ${(info.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}
          </ul>
          ${links ? `<div class="ds-modal-links"><div style="font-weight:700;margin-bottom:6px">References</div>${links}</div>` : ''}
        </div>
        <div class="ds-modal-ftr">
          <button class="btn btn-sm" type="button" onclick="window._closeRegistryInfo?.(false)">Close</button>
        </div>
      </div>
    </div>
  `;
}

export function renderRegistryItemDetailModal(kind, item) {
  const meta = REGISTRY_WIDGET_INFO[kind];
  const title = kind === 'conditions' ? String(item.name || 'Condition')
    : kind === 'assessments' ? String(item.name || 'Assessment')
    : kind === 'protocols' ? String(item.name || 'Protocol')
    : kind === 'devices' ? String(item.name || 'Device')
    : kind === 'targets' ? String(item.label || 'Brain target')
    : kind === 'consent' ? String(item.name || 'Document')
    : kind === 'reports' ? String(item.name || 'Report template')
    : kind === 'handbooks' ? String(item.name || 'Handbook')
    : kind === 'home-programs' ? String(item.name || 'Home program')
    : kind === 'virtual-care' ? String(item.name || 'Virtual care')
    : 'Registry entry';

  const snapshot = formatItemSnapshot(kind, item);
  const rows = CROSSWALK[kind] || [];
  const crossHtml = rows.map(r => `
    <div class="ds-modal-cross-row">
      <div class="ds-modal-cross-title">${esc(r.t)}</div>
      <div class="ds-modal-cross-text">${esc(r.d)}</div>
    </div>
  `).join('');

  const refLinks = (meta?.links || [])
    .map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="ds-modal-ref-link">${esc(l.label)}</a>`)
    .join('');

  return `
    <div class="ds-modal-backdrop" onclick="window._closeRegistryItemDetail?.(true)">
      <div class="ds-modal ds-modal-wide" role="dialog" aria-modal="true" aria-label="${esc(title)}" onclick="event.stopPropagation()">
        <div class="ds-modal-hdr">
          <div style="min-width:0">
            <div class="ds-modal-title">${esc(title)}</div>
            <div class="ds-modal-sub">${esc(meta ? meta.summary : 'Registry entry details and cross-links.')}</div>
          </div>
          <button class="ds-modal-x" type="button" onclick="window._closeRegistryItemDetail?.(false)" aria-label="Close">×</button>
        </div>
        <div class="ds-modal-body ds-modal-body-scroll">
          <div class="ds-modal-section-label">This entry</div>
          <div class="ds-modal-dl">${snapshot || `<div class="ds-modal-dl-empty">${esc('No extra fields for this type.')}</div>`}</div>
          <div class="ds-modal-section-label" style="margin-top:14px">How this connects across registries</div>
          <div class="ds-modal-cross">${crossHtml}</div>
          ${refLinks ? `<div class="ds-modal-links"><div style="font-weight:700;margin-bottom:6px">References</div><div class="ds-modal-ref-stack">${refLinks}</div></div>` : ''}
        </div>
        <div class="ds-modal-ftr">
          <button class="btn btn-sm" type="button" onclick="window._closeRegistryItemDetail?.(false)">Close</button>
        </div>
      </div>
    </div>
  `;
}

export function mountRegistryItemDetailModal(kind, item) {
  try { document.getElementById('ds-registry-item-modal-root')?.remove(); } catch {}
  const root = document.createElement('div');
  root.id = 'ds-registry-item-modal-root';
  root.innerHTML = renderRegistryItemDetailModal(kind, item);
  document.body.appendChild(root);
  window._closeRegistryItemDetail = (fromBackdrop) => {
    try { document.getElementById('ds-registry-item-modal-root')?.remove(); } catch {}
    if (!fromBackdrop) return;
  };
  const onKey = (e) => {
    if (e.key === 'Escape') window._closeRegistryItemDetail?.(false);
  };
  window.addEventListener('keydown', onKey, { once: true });
}

if (typeof window !== 'undefined') {
  window._openRegItemDetail = (kind, idx) => {
    const items = window._regDetailItems;
    if (!items || idx == null || idx < 0 || idx >= items.length) return;
    mountRegistryItemDetailModal(kind, items[idx]);
  };
}
