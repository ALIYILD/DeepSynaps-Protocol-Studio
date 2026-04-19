// ── DeepSynaps Core Registries ───────────────────────────────────────────────
// Central export for all Phase 2 registry data.
// Import individual registries for tree-shaking, or use named exports here.

export { default as CONDITIONS, CONDITION_CATEGORIES, CONDITIONS_BY_CATEGORY } from './conditions.js';
export { default as BRAIN_TARGETS, BRAIN_TARGET_BY_ID, BRAIN_TARGETS_BY_LOBE } from './brain-targets.js';
export { default as ASSESSMENTS, ASSESSMENT_BY_ID, ASSESSMENTS_BY_CONDITION } from './assessments.js';
export { default as DEVICES, DEVICE_BY_ID, DEVICES_BY_MODALITY } from './devices.js';
export { default as PROTOCOL_TEMPLATES, PROTOCOL_BY_ID, PROTOCOLS_BY_CONDITION } from './protocols.js';
export { default as CONSENT_TEMPLATES, CONSENT_BY_ID, CONSENT_CATEGORIES } from './consents.js';
export { default as REPORT_TEMPLATES, REPORT_BY_ID } from './reports.js';
export { default as HANDBOOK_TEMPLATES, HANDBOOK_BY_ID } from './handbooks.js';
export { default as HOME_PROGRAM_TEMPLATES, HOME_PROGRAM_BY_ID, HOME_PROGRAMS_BY_CATEGORY } from './home-programs.js';
export { default as VIRTUAL_CARE_TEMPLATES, VC_TEMPLATE_BY_ID } from './virtual-care.js';
