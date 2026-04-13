/**
 * Registry widget help content (high-signal, clinician-facing).
 * Keep transport-agnostic: pure content + a tiny renderer for modal HTML.
 */

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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
      { label: 'What is a clinical registry? (NCBI)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK208643/' },
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
      { label: 'PHQ-9 vs HAM-D measurement notes (Frontiers)', url: 'https://www.frontiersin.org/journals/psychiatry/articles/10.3389/fpsyt.2021.747139/full' },
      { label: 'Validity of outcome measures (NCBI Bookshelf)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK409740/' },
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
      { label: 'rTMS overview (StatPearls/NCBI)', url: 'https://www.ncbi.nlm.nih.gov/books/NBK568715/' },
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
      { label: 'FDA: De Novo classification request', url: 'https://www.fda.gov/medical-devices/premarket-submissions/de-novo-classification-request' },
      { label: 'FDA: 510(k) process overview', url: 'https://www.fda.gov/medical-devices/510k-clearances/medical-device-safety-and-510k-clearance-process' },
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
      { label: '10–20 system overview', url: 'https://en.wikipedia.org/wiki/10%E2%80%9320_system_(EEG)' },
      { label: 'F3 localization for prefrontal TMS (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2882797/' },
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
      { label: 'VHA Handbook: Informed consent (clinical)', url: 'https://www.ethics.va.gov/docs/policy/VHA_Handbook_1004_01_Clinical_IC.pdf' },
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
      { label: 'Progress note formats & best practices (overview)', url: 'https://www.autonotes.ai/documentation/how-to-write-a-progress-note-best-practices/' },
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
      { label: 'Creating patient education documents (UW)', url: 'https://healthonline.washington.edu/sites/default/files/record_pdfs/Creating-Patient-Education-Documents_02-2025.pdf' },
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
      { label: 'Therapy homework & adherence strategies (overview)', url: 'https://positivepsychology.com/homework-in-cbt/' },
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
      { label: 'Electronic messaging tips (AAFP)', url: 'https://www.aafp.org/pubs/fpm/issues/2022/1100/electronic-messaging-tips.html' },
      { label: 'Texting boundaries & policies (Paubox)', url: 'https://www.paubox.com/blog/creating-ethical-boundaries-with-text-messaging-policies-in-healthcare' },
    ],
  },
});

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

