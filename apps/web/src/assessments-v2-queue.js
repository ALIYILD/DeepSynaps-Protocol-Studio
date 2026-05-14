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
 * @param {(row: any, index: number) => any} [args.mapRow] — optional row mapper (e.g., mapApiAssessmentToQueueRow)
 * @param {boolean} [args.fetchFailed] — caller passes this flag
 * @param {boolean} [args.emptyOk] — caller passes this flag
 * @param {number} [args.maxRows] — cap on returned rows
 * @returns {Promise<{ source: 'v2'|'legacy'|'demo', rows: any[], demo: boolean, warnings: string[], errors: string[], fetchFailed: boolean, emptyOk: boolean }>}
 */
export async function hydrateAssessmentsQueueV2({
  loadV2Queue,
  loadLegacyQueue,
  loadDemoRows,
  allowDemoFallback,
  mapRow,
  fetchFailed,
  emptyOk,
  maxRows,
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
    let rows = v2.rows;
    if (rows.length > 0) {
      // BUG-FIX-001: apply row mapper if provided
      if (mapRow) rows = rows.map((r, i) => mapRow(r, i));
      if (maxRows && maxRows > 0) rows = rows.slice(0, maxRows);
      return { source: 'v2', rows, demo: false, warnings, errors, fetchFailed: fetchFailed || false, emptyOk: emptyOk || false };
    }
    warnings.push('v2_empty');
  }

  // 2) legacy fallback
  const legacy = await tryLoad('legacy', loadLegacyQueue);
  if (legacy.ok) {
    let rows = legacy.rows;
    if (rows.length > 0) {
      if (mapRow) rows = rows.map((r, i) => mapRow(r, i));
      if (maxRows && maxRows > 0) rows = rows.slice(0, maxRows);
      return { source: 'legacy', rows, demo: false, warnings, errors, fetchFailed: fetchFailed || false, emptyOk: emptyOk || false };
    }
    warnings.push('legacy_empty');
  }

  // 3) demo fallback (only when allowed)
  if (allowDemoFallback) {
    const demoRows = await Promise.resolve(loadDemoRows ? loadDemoRows() : []);
    let rows = Array.isArray(demoRows) ? demoRows : [];
    if (mapRow) rows = rows.map((r, i) => mapRow(r, i));
    if (maxRows && maxRows > 0) rows = rows.slice(0, maxRows);
    return { source: 'demo', rows, demo: true, warnings: [...warnings, 'demo_fallback'], errors, fetchFailed: fetchFailed || false, emptyOk: emptyOk || false };
  }

  // No demo allowed: return empty with warnings.
  warnings.push('no_demo_fallback');
  return { source: 'legacy', rows: [], demo: false, warnings, errors, fetchFailed: fetchFailed || false, emptyOk: emptyOk || true };
}

// Backward-compatible export name used by pgAssessmentsHub.
export const hydrateAssessmentsV2Queue = hydrateAssessmentsQueueV2;

