// Single source of truth for "is the current browser session a demo
// session?" and which API paths must always reach the network even
// during a demo.
//
// Today the same logic is inlined in `apps/web/src/api.js` (see the
// `_DEMO_PASSTHROUGH` regex and `_isDemoSession()` helper around
// line 53). PR-A introduces the canonical helper here without touching
// any existing call sites; PR-B will migrate api.js + the other
// front-end gates to import from this module.
//
// Behaviour MUST stay byte-identical to api.js:53 — the regex and the
// truthiness rules below are mirrored. Update both in lock-step until
// PR-B completes the migration.

const TOKEN_KEY = 'ds_access_token';

/**
 * Auth endpoints that must always pass through the demo fetch shim and
 * hit the real API even during an offline demo session (so demo-login,
 * refresh, and /me work).
 *
 * Mirror of the `_DEMO_PASSTHROUGH` regex in `apps/web/src/api.js:53`.
 */
export const DEMO_PASSTHROUGH =
  /^\/api\/v1\/auth\/(demo-login|refresh|me|login|logout|register|activate-patient|forgot-password|reset-password)\b/;

/**
 * Conventional suffix for synthetic offline demo tokens. Every demo
 * persona seeded in the backend's `DEMO_ACTOR_TOKENS` registry uses a
 * token ending with this suffix.
 */
export const DEMO_TOKEN_SUFFIX = '-demo-token';

function _safeStorageGet(key) {
  try {
    return globalThis.localStorage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * Return true iff the current browser session should be treated as a
 * demo session. Behaviour mirrors `_isDemoSession()` in
 * `apps/web/src/api.js`:
 *
 * 1. The Vite build flag `VITE_ENABLE_DEMO === '1'` OR the dev server
 *    is running (`import.meta.env.DEV`).
 * 2. AND the locally stored access token ends with `-demo-token`.
 *
 * Both conditions must hold so a real production build with a real
 * JWT in localStorage is never accidentally treated as a demo session.
 *
 * @param {{ token?: string | null, env?: Record<string, unknown> }} [opts]
 *   Optional overrides — primarily for unit tests that want to inject a
 *   token / env without touching globals.
 * @returns {boolean}
 */
export function isDemoSession(opts) {
  try {
    const env =
      opts?.env ??
      (typeof import.meta !== 'undefined' ? import.meta.env : undefined);
    const flag = !!(env?.DEV || env?.VITE_ENABLE_DEMO === '1');
    if (!flag) return false;
    const token = opts && 'token' in opts ? opts.token : _safeStorageGet(TOKEN_KEY);
    return !!(token && String(token).endsWith(DEMO_TOKEN_SUFFIX));
  } catch {
    return false;
  }
}

/**
 * Return true iff *path* is one of the auth endpoints that must always
 * pass through to the real API even during a demo session.
 *
 * @param {string} path - e.g. `/api/v1/auth/demo-login`
 * @returns {boolean}
 */
export function isDemoPassthroughPath(path) {
  if (typeof path !== 'string' || path.length === 0) return false;
  return DEMO_PASSTHROUGH.test(path);
}

export default {
  DEMO_PASSTHROUGH,
  DEMO_TOKEN_SUFFIX,
  isDemoSession,
  isDemoPassthroughPath,
};
