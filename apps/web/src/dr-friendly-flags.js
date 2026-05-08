/**
 * Doctor-friendly flag source — turns the existing Risk Stratification API
 * into the `{ flagCount, flagSummary }` shape that drHero renders at the top
 * of each analyzer page.
 *
 * Why this lives in its own module: helpers.js is intentionally pure (no
 * side effects, no api imports). This file imports the api client and is
 * therefore async / network-bound. Pages that want a real flag count for
 * the loaded patient call this, then re-render their drHero slot.
 *
 * Shape returned:
 *   {
 *     flagCount:   number   // categories at elevated/high/critical level
 *     flagSummary: string   // up to 3, formatted "category level · category level"
 *     loaded:      boolean  // false when API failed / no patient — caller
 *                           // can fall back to the calm "no active flags"
 *                           // chip without misrepresenting unknown state
 *   }
 */
import { api as defaultApi } from './api.js';

const ELEVATED_LEVELS = new Set(['elevated', 'high', 'critical']);

function _formatCategoryLabel(c) {
  const raw = c?.category || c?.name || c?.id || '';
  return String(raw).replace(/_/g, ' ').trim();
}

/**
 * Pulls patient risk-stratification categories and reduces them to the
 * { flagCount, flagSummary } shape drHero expects. `apiClient` is overridable
 * for tests — defaults to the real api singleton.
 */
export async function loadPatientFlagSummary(patientId, apiClient = defaultApi) {
  if (!patientId) return { flagCount: 0, flagSummary: '', loaded: false };
  try {
    const profile = await apiClient.getPatientRiskProfile(patientId);
    const cats = Array.isArray(profile?.categories) ? profile.categories : [];
    const flagged = cats.filter((c) => {
      const level = String(c?.level || '').toLowerCase();
      return ELEVATED_LEVELS.has(level);
    });
    const flagCount = flagged.length;
    const flagSummary = flagged
      .slice(0, 3)
      .map((c) => {
        const label = _formatCategoryLabel(c);
        const level = String(c?.level || '').toLowerCase();
        return label && level ? `${label} ${level}` : label || level;
      })
      .filter(Boolean)
      .join(' · ');
    return { flagCount, flagSummary, loaded: true };
  } catch {
    return { flagCount: 0, flagSummary: '', loaded: false };
  }
}
