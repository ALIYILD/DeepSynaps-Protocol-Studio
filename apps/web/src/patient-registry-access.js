/**
 * Patient registry (Patients v2 / pgPatientHub) — role gate helpers.
 * Pure functions for unit tests and a single source of truth for who may
 * view the clinic patient roster.
 */

/** Roles that may open the clinician patient registry (PHI). */
const REGISTRY_ALLOWED_ROLES = new Set([
  'clinician',
  'admin',
  'clinic-admin',
  'supervisor',
  'technician',
  'reviewer',
]);

/**
 * @param {{ role?: string } | null | undefined} user  currentUser from auth
 * @returns {boolean}
 */
export function canAccessPatientRegistry(user) {
  const r = user?.role;
  return typeof r === 'string' && REGISTRY_ALLOWED_ROLES.has(r);
}
