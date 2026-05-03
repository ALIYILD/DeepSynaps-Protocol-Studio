/** Clinic Academy (`page=academy`) — pure constants for UI + unit tests. */

/** Required clinic-use disclaimer (hero banner). */
export const ACADEMY_GOVERNANCE_DISCLAIMER =
  'Academy content is training and reference material. It does not diagnose, prescribe, approve treatment, certify clinical competence, or replace local governance, supervision, and clinician judgement.';

/** In-app module shortcuts on the clinic Academy page (nav targets match sidebar). */
export const ACADEMY_CLINIC_LINKED_MODULES = [
  { page: 'dashboard', label: 'Dashboard' },
  { page: 'protocol-studio', label: 'Protocol Studio' },
  { page: 'research-evidence', label: 'Research Evidence' },
  { page: 'handbooks-v2', label: 'Handbooks' },
  { page: 'documents-v2', label: 'Documents' },
  { page: 'qeeg-analysis', label: 'qEEG' },
  { page: 'mri-analysis', label: 'MRI' },
  { page: 'deeptwin', label: 'DeepTwin' },
  { page: 'labs-analyzer', label: 'Labs' },
  { page: 'biomarkers', label: 'Biomarkers' },
  { page: 'monitor', label: 'Devices' },
  { page: 'risk-analyzer', label: 'Risk' },
  { page: 'medication-analyzer', label: 'Medication' },
  { page: 'treatment-sessions-analyzer', label: 'Sessions' },
  { page: 'marketplace', label: 'Marketplace' },
  { page: 'ai-agent-v2', label: 'AI Agents' },
  { page: 'schedule-v2', label: 'Schedule' },
  { page: 'clinician-inbox', label: 'Inbox' },
];

/** Per-section labels shown on curated external-link cards (bundled library). */
export function academySectionCardMeta(sectionId) {
  const map = {
    research:       { audience: 'Clinician, staff, researcher', ctype: 'Reference', src: 'Curated link (bundled)' },
    publications:   { audience: 'Clinician, staff, researcher', ctype: 'Reference', src: 'Curated link (bundled)' },
    seminars:       { audience: 'Clinician, staff', ctype: 'Training / events', src: 'Curated link (bundled)' },
    workshops:      { audience: 'Clinician, staff', ctype: 'Training / events', src: 'Curated link (bundled)' },
    courses:        { audience: 'Clinician, staff, learner', ctype: 'Self-paced (external site)', src: 'Curated link (bundled)' },
    certifications: { audience: 'Clinician, staff', ctype: 'External credential path', src: 'Curated link (bundled)' },
  };
  return map[sectionId] || { audience: 'Clinician, staff', ctype: 'Reference', src: 'Curated link (bundled)' };
}
