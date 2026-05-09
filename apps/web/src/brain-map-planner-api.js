/**
 * brain-map-planner-api.js — Brain Map Planner API wiring
 *
 * Wraps backend endpoints for brain map plan persistence:
 * - POST /api/v1/brain-map/plans (create)
 * - GET /api/v1/brain-map/plans/{id} (retrieve)
 * - GET /api/v1/brain-map/plans (list)
 * - PATCH /api/v1/brain-map/plans/{id} (update status)
 * - GET /api/v1/brain-map/plans/{id}/audit (audit trail)
 *
 * All calls include auth token from localStorage.
 * Demo sessions return synthetic empty responses; production hits the API.
 * Errors are logged; callers are responsible for UI error handling.
 */

import { API_BASE, isDemoSession } from './api.js';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function getAuthToken() {
  try {
    return globalThis.localStorage?.getItem?.('ds_access_token') ?? null;
  } catch {
    return null;
  }
}

function buildHeaders(contentType = 'application/json') {
  const headers = { 'Content-Type': contentType };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function _logApiCall(method, endpoint, status, data) {
  console.log(`[BrainMapAPI] ${method} ${endpoint} → ${status}`, data);
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a brain map plan (POST /api/v1/brain-map/plans)
 * @param {Object} planData - Plan to create (patient_id, region, target_anchor, etc.)
 * @returns {Promise<{id: string, created_at: string, created_by: string, status: string} | null>}
 */
export async function createBrainMapPlan(planData) {
  if (isDemoSession()) {
    _logApiCall('POST', '/brain-map/plans', '201 (demo)', { planData });
    return {
      id: `demo-plan-${Date.now()}`,
      created_at: new Date().toISOString(),
      created_by: 'demo-user',
      status: 'draft',
      ...planData,
    };
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/brain-map/plans`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(planData),
    });

    _logApiCall('POST', '/brain-map/plans', response.status, { planData });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('createBrainMapPlan error:', error);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('createBrainMapPlan exception:', error);
    return null;
  }
}

/**
 * Retrieve a brain map plan (GET /api/v1/brain-map/plans/{id})
 * @param {string} planId
 * @returns {Promise<Object | null>}
 */
export async function getBrainMapPlan(planId) {
  if (isDemoSession()) {
    _logApiCall('GET', `/brain-map/plans/${planId}`, '200 (demo)', {});
    return {
      id: planId,
      status: 'draft',
      region: 'DLPFC-L',
      target_anchor: 'F3',
      protocol_name: 'tDCS-Standard',
    };
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/brain-map/plans/${planId}`, {
      method: 'GET',
      headers: buildHeaders(),
    });

    _logApiCall('GET', `/brain-map/plans/${planId}`, response.status, {});

    if (!response.ok) {
      console.error(`getBrainMapPlan: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('getBrainMapPlan exception:', error);
    return null;
  }
}

/**
 * List brain map plans for patient (GET /api/v1/brain-map/plans?patient_id=<id>&limit=50)
 * @param {string} patientId
 * @param {number} limit
 * @returns {Promise<{items: Array, total: number} | null>}
 */
export async function listBrainMapPlans(patientId, limit = 50) {
  if (isDemoSession()) {
    _logApiCall('GET', `/brain-map/plans?patient_id=${patientId}`, '200 (demo)', {});
    return {
      items: [
        {
          id: 'demo-plan-1',
          patient_id: patientId,
          status: 'draft',
          created_at: new Date().toISOString(),
          region: 'DLPFC-L',
          target_anchor: 'F3',
        },
      ],
      total: 1,
    };
  }

  try {
    const url = new URL(`${API_BASE}/api/v1/brain-map/plans`);
    url.searchParams.append('patient_id', patientId);
    url.searchParams.append('limit', String(limit));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: buildHeaders(),
    });

    _logApiCall('GET', `/brain-map/plans?patient_id=${patientId}&limit=${limit}`, response.status, {});

    if (!response.ok) {
      console.error(`listBrainMapPlans: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('listBrainMapPlans exception:', error);
    return null;
  }
}

/**
 * Update brain map plan status (PATCH /api/v1/brain-map/plans/{id})
 * @param {string} planId
 * @param {string} newStatus - 'draft' | 'approved' | 'archived'
 * @returns {Promise<Object | null>}
 */
export async function updateBrainMapPlanStatus(planId, newStatus) {
  if (isDemoSession()) {
    _logApiCall('PATCH', `/brain-map/plans/${planId}`, '200 (demo)', { status: newStatus });
    return { id: planId, status: newStatus };
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/brain-map/plans/${planId}`, {
      method: 'PATCH',
      headers: buildHeaders(),
      body: JSON.stringify({ status: newStatus }),
    });

    _logApiCall('PATCH', `/brain-map/plans/${planId}`, response.status, { status: newStatus });

    if (!response.ok) {
      console.error(`updateBrainMapPlanStatus: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('updateBrainMapPlanStatus exception:', error);
    return null;
  }
}

/**
 * Get audit trail for plan (GET /api/v1/brain-map/plans/{id}/audit)
 * @param {string} planId
 * @returns {Promise<{items: Array} | null>}
 */
export async function getBrainMapPlanAudit(planId) {
  if (isDemoSession()) {
    _logApiCall('GET', `/brain-map/plans/${planId}/audit`, '200 (demo)', {});
    return {
      items: [
        {
          event_id: 'demo-audit-1',
          action: 'plan_create',
          actor_id: 'demo-user',
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/brain-map/plans/${planId}/audit`, {
      method: 'GET',
      headers: buildHeaders(),
    });

    _logApiCall('GET', `/brain-map/plans/${planId}/audit`, response.status, {});

    if (!response.ok) {
      console.error(`getBrainMapPlanAudit: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('getBrainMapPlanAudit exception:', error);
    return null;
  }
}

/**
 * Health check endpoint (GET /api/v1/brain-map/health)
 * Returns { status: 'ok' | 'unavailable' }
 * @returns {Promise<{status: string} | null>}
 */
export async function checkBrainMapHealth() {
  if (isDemoSession()) {
    return { status: 'demo' };
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/brain-map/health`, {
      method: 'GET',
      headers: buildHeaders(),
    });

    if (response.ok) {
      return await response.json();
    }

    return { status: 'unavailable' };
  } catch (error) {
    console.error('checkBrainMapHealth exception:', error);
    return { status: 'unavailable' };
  }
}
