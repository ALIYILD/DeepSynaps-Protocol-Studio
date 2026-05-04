/**
 * SPA route id used when refreshing the documents workspace without changing
 * the user's entry URL (?page=documents-v2 vs legacy documents-hub).
 */
export function documentsWorkspaceRouteFromSearch(search) {
  try {
    const p = new URLSearchParams(search || '').get('page') || '';
    if (p === 'documents-v2' || p === 'documents-hub') return p;
  } catch (_) {
    /* test harness / SSR */
  }
  return 'documents-v2';
}
