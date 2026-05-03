/**
 * Pure helpers for the clinician Clinical Dashboard (`pgDash`).
 * Keep DOM-free so tests can run under plain `node --test`.
 */

/**
 * Resolve the patient label for risk stratification rows.
 * Prefer API `patient_name`; otherwise derive from roster `patientMap`; fall back to id.
 *
 * @param {{ patient_name?: string|null, patient_id?: string|null }} row
 * @param {Record<string, { first_name?: string|null, last_name?: string|null }>} [patientMap]
 * @returns {string}
 */
export function resolveRiskTrafficPatientName(row, patientMap) {
  const apiName = row?.patient_name != null ? String(row.patient_name).trim() : '';
  if (apiName) return apiName;
  const id = row?.patient_id;
  const pt = id && patientMap ? patientMap[id] : null;
  if (pt) {
    const n = `${pt.first_name || ''} ${pt.last_name || ''}`.trim();
    if (n) return n;
  }
  if (id) return String(id);
  return 'Patient';
}
