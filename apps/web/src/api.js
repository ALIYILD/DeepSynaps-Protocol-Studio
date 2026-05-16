/**
 * DeepSynaps API client — all functions include auth headers.
 * Base URL configurable via VITE_API_URL env var.
 */

const API_BASE = import.meta.env?.VITE_API_URL || "/api/v1/multimodal";

function getAuthHeaders() {
  const clinicId = localStorage.getItem("x-clinic-id") || "";
  const accessToken = localStorage.getItem("x-patient-access-token") || "";
  return {
    "Content-Type": "application/json",
    "X-Clinic-ID": clinicId,
    "X-Patient-Access-Token": accessToken,
  };
}

function buildQueryString(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else {
      qs.append(key, String(value));
    }
  }
  const qsStr = qs.toString();
  return qsStr ? `?${qsStr}` : "";
}

/**
 * Handle API response with consistent error handling.
 */
async function handleResponse(response) {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
    const error = new Error(errorBody.detail || `Request failed: ${response.status}`);
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }
  return response.json();
}

/**
 * Fetch multimodal timeline for a patient.
 * @param {string} patientId
 * @param {Object} params — { clinician_id, modality[], from_date, to_date }
 */
export async function fetchTimeline(patientId, params = {}) {
  const qs = buildQueryString(params);
  const response = await fetch(
    `${API_BASE}/patients/${encodeURIComponent(patientId)}/timeline${qs}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
}

/**
 * Fetch correlation findings for a patient.
 * @param {string} patientId
 * @param {Object} params — { clinician_id, window_days, min_confidence }
 */
export async function fetchCorrelations(patientId, params = {}) {
  const qs = buildQueryString(params);
  const response = await fetch(
    `${API_BASE}/patients/${encodeURIComponent(patientId)}/correlations${qs}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
}

/**
 * Fetch confounder candidates for a patient.
 * @param {string} patientId
 * @param {Object} params — { clinician_id }
 */
export async function fetchConfounders(patientId, params = {}) {
  const qs = buildQueryString(params);
  const response = await fetch(
    `${API_BASE}/patients/${encodeURIComponent(patientId)}/confounders${qs}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
}

/**
 * Fetch data quality flags for a patient.
 * @param {string} patientId
 * @param {Object} params — { clinician_id }
 */
export async function fetchQualityFlags(patientId, params = {}) {
  const qs = buildQueryString(params);
  const response = await fetch(
    `${API_BASE}/patients/${encodeURIComponent(patientId)}/quality-flags${qs}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
}

/**
 * Request full multimodal synthesis for a patient.
 * @param {string} patientId
 * @param {Object} body — { include_modalities, date_range, focus_areas, min_confidence, max_hypotheses }
 */
export async function requestSynthesis(patientId, body = {}) {
  const clinicianId = localStorage.getItem("clinician-id") || body.clinician_id || "";
  const qs = buildQueryString({ clinician_id: clinicianId });
  const response = await fetch(
    `${API_BASE}/patients/${encodeURIComponent(patientId)}/synthesis${qs}`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    }
  );
  return handleResponse(response);
}

/**
 * Fetch clinic dashboard summary (aggregate counts, bounded payload).
 * @param {Object} params — { clinician_id }
 */
export async function fetchClinicDashboard(params = {}) {
  const qs = buildQueryString(params);
  const response = await fetch(
    `/api/v1/summary/clinic-dashboard${qs}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
}

/**
 * Fetch patient dashboard summary (aggregate counts, bounded payload).
 * @param {string} patientId
 * @param {Object} params — { clinician_id }
 */
export async function fetchPatientDashboard(patientId, params = {}) {
  const qs = buildQueryString(params);
  const response = await fetch(
    `/api/v1/summary/patients/${encodeURIComponent(patientId)}/dashboard${qs}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
}

/**
 * Fetch analyzer status summary (modality counts, freshness flags).
 * @param {Object} params — { clinician_id }
 */
export async function fetchAnalyzerStatus(params = {}) {
  const qs = buildQueryString(params);
  const response = await fetch(
    `/api/v1/summary/analyzer-status${qs}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
}

/**
 * Fetch per-patient analyzer summary (modality counts, latest dates,
 * missing modalities, risk status). Replaces N per-modality calls.
 * @param {string} patientId
 * @param {Object} params — { clinician_id }
 */
export async function fetchPatientAnalyzerSummary(patientId, params = {}) {
  const qs = buildQueryString(params);
  const response = await fetch(
    `/api/v1/summary/patients/${encodeURIComponent(patientId)}/analyzer${qs}`,
    {
      method: "GET",
      headers: getAuthHeaders(),
    }
  );
  return handleResponse(response);
}

/**
 * Health check.
 */
export async function fetchHealth() {
  const response = await fetch("/health", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return handleResponse(response);
}

/**
 * Set authentication credentials for subsequent requests.
 */
export function setAuthCredentials({ clinicId, accessToken, clinicianId }) {
  if (clinicId !== undefined) {
    localStorage.setItem("x-clinic-id", clinicId);
  }
  if (accessToken !== undefined) {
    localStorage.setItem("x-patient-access-token", accessToken);
  }
  if (clinicianId !== undefined) {
    localStorage.setItem("clinician-id", clinicianId);
  }
}

/**
 * Clear authentication credentials.
 */
export function clearAuthCredentials() {
  localStorage.removeItem("x-clinic-id");
  localStorage.removeItem("x-patient-access-token");
  localStorage.removeItem("clinician-id");
}
