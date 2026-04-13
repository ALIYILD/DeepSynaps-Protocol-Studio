/**
 * Extract scale abbreviations referenced in `COND_BUNDLES` (Assessments Hub).
 * Used by unit tests so every bundle token stays covered by SCALE_REGISTRY.
 * Parser targets only `baseline|weekly|…:['…']` phase arrays — not category names.
 *
 * @param {string} jsSource Full or partial source containing `const COND_BUNDLES = [`
 * @returns {string[]} Sorted unique tokens
 */
export function extractCondHubBundleScaleTokensFromSource(jsSource) {
  const start = jsSource.indexOf('const COND_BUNDLES = [');
  if (start < 0) return [];
  const end = jsSource.indexOf('\n  ];', start);
  if (end < 0) return [];
  const block = jsSource.slice(start, end);
  const set = new Set();
  const phaseRe = /(?:baseline|weekly|pre_session|post_session|milestone|discharge):\s*\[([^\]]*)\]/g;
  let m;
  while ((m = phaseRe.exec(block))) {
    const inner = m[1];
    const tokRe = /'([^']+)'/g;
    let t;
    while ((t = tokRe.exec(inner))) set.add(t[1]);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
