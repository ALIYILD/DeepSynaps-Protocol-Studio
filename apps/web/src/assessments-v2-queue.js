/**
 * Assessments v2 queue hydration helper (pure, injectable).
 *
 * Goal: make the v2→legacy→demo fallback behavior testable without spinning up
 * the DOM-heavy pgAssessmentsHub string-template page.
 *
 * IMPORTANT: Do not add clinical claims here. This module is transport-only.
 */
export function normalizeQueuePayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.items)) return payload.items;
    // Some callers may already pass `{ total, items }` or `{ rows }`.
    if (Array.isArray(payload.rows)) return payload.rows;
  }
  return [];
}

/**
 * @typedef {() => Promise<any>} Loader
 *
 * @param {object} args
 * @param {Loader | null | undefined} args.loadV2Queue
 * @param {Loader | null | undefined} args.loadLegacyQueue
 * @param {() => any[] | Promise<any[]>} args.loadDemoRows
 * @param {boolean} args.allowDemoFallback
 * @returns {Promise<{ source: 'v2'|'legacy'|'demo', rows: any[], demo: boolean, warnings: string[], errors: string[] }>}
 */
export async function hydrateAssessmentsQueueV2({
  loadV2Queue,
  loadLegacyQueue,
  loadDemoRows,
  allowDemoFallback,
}) {
  const warnings = [];
  const errors = [];

  const tryLoad = async (label, fn) => {
    if (!fn) return { ok: false, rows: [] };
    try {
      const payload = await fn();
      const rows = normalizeQueuePayload(payload);
      return { ok: true, rows };
    } catch (e) {
      const msg = (e && (e.message || e.code)) ? String(e.message || e.code) : 'error';
      errors.push(label + '_error:' + msg);
      return { ok: false, rows: [] };
    }
  };

  // 1) v2 first
  const v2 = await tryLoad('v2', loadV2Queue);
  if (v2.ok) {
    if (v2.rows.length > 0) return { source: 'v2', rows: v2.rows, demo: false, warnings, errors };
    warnings.push('v2_empty');
  }

  // 2) legacy fallback
  const legacy = await tryLoad('legacy', loadLegacyQueue);
  if (legacy.ok) {
    if (legacy.rows.length > 0) return { source: 'legacy', rows: legacy.rows, demo: false, warnings, errors };
    warnings.push('legacy_empty');
  }

  // 3) demo fallback (only when allowed)
  if (allowDemoFallback) {
    const demoRows = await Promise.resolve(loadDemoRows ? loadDemoRows() : []);
    const rows = Array.isArray(demoRows) ? demoRows : [];
    return { source: 'demo', rows, demo: true, warnings: [...warnings, 'demo_fallback'], errors };
  }

  // No demo allowed: return empty with warnings.
  warnings.push('no_demo_fallback');
  return { source: 'legacy', rows: [], demo: false, warnings, errors };
}

// Backward-compatible export name used by pgAssessmentsHub.
export const hydrateAssessmentsV2Queue = hydrateAssessmentsQueueV2;

