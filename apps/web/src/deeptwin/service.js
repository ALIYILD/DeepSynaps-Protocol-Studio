// DeepTwin frontend service layer.
//
// Wraps api.* calls and only falls back to deterministic demo data for
// explicit demo/offline sessions. Real clinician sessions fail closed so
// backend errors cannot silently degrade into seeded DeepTwin outputs.

import { api } from '../api.js';
import {
  demoSummary, demoSignals, demoTimeline, demoCorrelations,
  demoPrediction, demoSimulation, getDemoPatientHeader,
} from './mockData.js';

const DEMO_FORCED = (import.meta?.env?.VITE_ENABLE_DEMO === '1');

function _readAccessToken() {
  try {
    return globalThis.localStorage?.getItem?.('ds_access_token') ?? null;
  } catch {
    return null;
  }
}

/** True when the session uses the offline demo-token shim (api.js short-circuits fetches). */
export function isDeepTwinDemoTokenSession() {
  const t = _readAccessToken();
  return !!(t && String(t).endsWith('-demo-token'));
}

function _hasAccessToken() {
  const t = _readAccessToken();
  return !!String(t || '').trim();
}

export function shouldUseDeepTwinDemoFixtures() {
  return isDeepTwinDemoTokenSession() || (DEMO_FORCED && !_hasAccessToken());
}

async function withFallback(fn, fallback) {
  // Only explicit demo/offline sessions should ever synthesize DeepTwin data.
  if (shouldUseDeepTwinDemoFixtures()) {
    try {
      return await fn();
    } catch {
      return fallback();
    }
  }
  return fn();
}

export async function getTwinSummary(patientId) {
  return withFallback(() => api.getTwinSummary(patientId), () => demoSummary(patientId));
}

export async function getTwinSignals(patientId) {
  return withFallback(() => api.getTwinSignals(patientId), () => demoSignals(patientId));
}

export async function getTwinTimeline(patientId, days = 90) {
  return withFallback(() => api.getTwinTimeline(patientId, days), () => demoTimeline(patientId, days));
}

export async function getTwinCorrelations(patientId) {
  return withFallback(() => api.getTwinCorrelations(patientId), () => demoCorrelations(patientId));
}

export async function getTwinPredictions(patientId, horizon = '6w') {
  return withFallback(() => api.getTwinPredictions(patientId, horizon), () => demoPrediction(patientId, horizon));
}

export async function runTwinSimulation(patientId, payload) {
  if (isDeepTwinDemoTokenSession() || DEMO_FORCED) {
    return withFallback(() => api.runTwinSimulation(patientId, payload), () => demoSimulation(patientId, payload));
  }
  return api.runTwinSimulation(patientId, payload);
}

export async function generateTwinReport(patientId, payload) {
  return withFallback(() => api.generateTwinReport(patientId, payload), () => ({
    patient_id: patientId,
    kind: payload.kind,
    title: 'DeepTwin Report (demo)',
    generated_at: new Date().toISOString(),
    data_sources_used: ['qeeg_features', 'assessments', 'wearables'],
    date_range_days: 90,
    audit_refs: [`twin_audit:${payload.kind}:demo`],
    limitations: ['Outputs are model-estimated and not diagnostic.', 'Limited within-patient history may inflate uncertainty.'],
    review_points: ['Verify baseline qEEG and assessments are current.', 'Confirm contraindications and medications.'],
    evidence_grade: 'moderate',
    body: { kind: payload.kind, demo: true },
  }));
}

export async function postTwinAgentHandoff(patientId, payload) {
  return withFallback(() => api.postTwinAgentHandoff(patientId, payload), () => ({
    patient_id: patientId,
    kind: payload.kind || 'send_summary',
    note: payload.note || null,
    submitted_at: new Date().toISOString(),
    audit_ref: `twin_handoff:${payload.kind || 'send_summary'}:demo`,
    summary_markdown: `# DeepTwin Summary\n- patient_id: \`${patientId}\`\n_Decision-support only. Clinician must review before any treatment action._`,
    approval_required: true,
    disclaimer: 'Agent handoff is decision-support context only. Clinician review required.',
  }));
}

export async function getDeepTwinDataSources(patientId) {
  return withFallback(() => api.getDeepTwinDataSources(patientId), () => ({
    patient_id: patientId,
    sources: {},
    completeness_score: 0,
  }));
}

export async function createAnalysisRun(patientId, payload) {
  return withFallback(() => api.createAnalysisRun(patientId, payload), () => ({
    id: 'demo-' + Date.now(), patient_id: patientId, clinician_id: 'demo', analysis_type: payload.analysis_type,
    status: 'completed', created_at: new Date().toISOString(),
  }));
}

export async function listAnalysisRuns(patientId) {
  return withFallback(() => api.listAnalysisRuns(patientId), () => []);
}

export async function reviewAnalysisRun(runId) {
  return withFallback(() => api.reviewAnalysisRun(runId), () => ({ id: runId, reviewed_at: new Date().toISOString() }));
}

export async function createSimulationRun(patientId, payload) {
  return withFallback(() => api.createSimulationRun(patientId, payload), () => ({
    id: 'demo-' + Date.now(), patient_id: patientId, clinician_id: 'demo',
    clinician_review_required: true, created_at: new Date().toISOString(),
  }));
}

export async function listSimulationRuns(patientId) {
  return withFallback(() => api.listSimulationRuns(patientId), () => []);
}

export async function reviewSimulationRun(runId) {
  return withFallback(() => api.reviewSimulationRun(runId), () => ({ id: runId, reviewed_at: new Date().toISOString() }));
}

export async function createClinicianNote(patientId, payload) {
  return withFallback(() => api.createClinicianNote(patientId, payload), () => ({
    id: 'demo-' + Date.now(), patient_id: patientId, clinician_id: 'demo',
    note_text: payload.note_text, created_at: new Date().toISOString(),
  }));
}

export async function listClinicianNotes(patientId) {
  return withFallback(() => api.listClinicianNotes(patientId), () => []);
}

export function getDemoPatient(patientId) {
  return getDemoPatientHeader(patientId);
}
