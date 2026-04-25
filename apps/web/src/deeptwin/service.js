// DeepTwin frontend service layer.
//
// Wraps api.* calls and falls back to deterministic demo data when the
// API errors or is unreachable. This mirrors the codebase's existing
// "seed on empty roster" pattern in pages-clinical-hubs.js so demo mode
// renders the page fully even without a live backend.

import { api } from '../api.js';
import {
  demoSummary, demoSignals, demoTimeline, demoCorrelations,
  demoHypotheses, demoPrediction, demoSimulation, getDemoPatientHeader,
} from './mockData.js';

const DEMO_FORCED = (import.meta?.env?.VITE_ENABLE_DEMO === '1');

async function withFallback(fn, fallback) {
  if (DEMO_FORCED) {
    try {
      const v = await fn();
      // some shapes may be empty even on success; trust if non-empty
      return (v && (Array.isArray(v) ? v.length : Object.keys(v).length)) ? v : fallback();
    } catch {
      return fallback();
    }
  }
  try { return await fn(); } catch { return fallback(); }
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
  return withFallback(() => api.runTwinSimulation(patientId, payload), () => demoSimulation(patientId, payload));
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

export function getDemoPatient(patientId) {
  return getDemoPatientHeader(patientId);
}
