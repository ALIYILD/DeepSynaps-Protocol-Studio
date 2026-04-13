/**
 * Cross-check SCALE_REGISTRY (metadata / badges) vs ASSESS_REGISTRY (actual item UI + score entry).
 * Run in unit tests and optionally in dev to catch drift.
 */

import { buildChecklistAlignmentErrors } from './assessment-implementation-status.js';

/**
 * @param {Array<{ id: string, inline?: boolean, questions?: string[] }>} assessRegistry
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateScaleRegistryAgainstAssess(assessRegistry) {
  const errors = buildChecklistAlignmentErrors(assessRegistry);
  return { errors, warnings: [] };
}
