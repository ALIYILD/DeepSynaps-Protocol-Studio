// DeepTwin → AI Agent handoff.
//
// Stashes a structured handoff context in sessionStorage and navigates
// to the existing AI Agents page (pages-agents.js). The agent page can
// look for `ds_agent_handoff_context` and prefill its prompt.

import { postTwinAgentHandoff } from './service.js';

const STORAGE_KEY = 'ds_agent_handoff_context';
const AUDIT_LOG_KEY = 'ds_twin_audit_log';

const HANDOFF_KINDS = {
  send_summary: 'Send DeepTwin summary',
  draft_protocol_update: 'Draft protocol update',
  review_risks: 'Review risks',
  create_followup_tasks: 'Create follow-up tasks',
};

function pushAudit(entry) {
  try {
    const cur = JSON.parse(sessionStorage.getItem(AUDIT_LOG_KEY) || '[]');
    cur.push({ ts: new Date().toISOString(), ...entry });
    sessionStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(cur.slice(-50)));
  } catch {
    /* sessionStorage unavailable — ignore */
  }
}

export async function startHandoff(patientId, kind, note) {
  if (!patientId) {
    if (window._showToast) window._showToast('Pick a patient before sending to the agent.', 'warning');
    return;
  }
  const result = await postTwinAgentHandoff(patientId, { kind, note: note || null });
  const ctx = {
    kind,
    label: HANDOFF_KINDS[kind] || kind,
    patient_id: patientId,
    summary_markdown: result.summary_markdown,
    audit_ref: result.audit_ref,
    submitted_at: result.submitted_at,
    requires_approval: result.approval_required,
  };
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx)); } catch { /* ignore */ }
  pushAudit({ patient_id: patientId, kind, audit_ref: result.audit_ref });
  if (window._showToast) {
    window._showToast(`Handoff "${ctx.label}" prepared. Opening agent...`, 'success');
  }
  if (window._nav) window._nav('ai-agents');
  return ctx;
}

export function readHandoffContext() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}

export function clearHandoffContext() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export function listAuditLog() {
  try { return JSON.parse(sessionStorage.getItem(AUDIT_LOG_KEY) || '[]'); }
  catch { return []; }
}

export const HANDOFF_KINDS_LIST = Object.entries(HANDOFF_KINDS).map(([id, label]) => ({ id, label }));
