/**
 * Barrel for clinical assessment metadata (scales + condition bundles).
 * Import from here for Enter Scores, reports, protocols, or patient education UIs.
 */
export {
  SCALE_REGISTRY,
  SCALE_ALIAS_TO_CANONICAL,
  resolveScaleCanonical,
  getScaleMeta,
  scaleStatusBadge,
  formatScaleWithBadgeHtml,
  enumerateBundleScales,
  partitionScalesByEntryMode,
} from './scale-assessment-registry.js';

export { COND_HUB_META } from './condition-assessment-hub-meta.js';

export {
  getAssessmentImplementationStatus,
  hasImplementedInlineChecklist,
  findAssessInstrumentRow,
  routeLegacyRunAssessment,
  formatScaleWithImplementationBadgeHtml,
  partitionScalesByImplementationTruth,
  checklistImplementationReport,
  buildChecklistAlignmentErrors,
} from './assessment-implementation-status.js';

export { validateScaleRegistryAgainstAssess } from './scale-registry-alignment.js';
