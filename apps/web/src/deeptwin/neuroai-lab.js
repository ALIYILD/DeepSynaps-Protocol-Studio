// DeepTwin NeuroAI Lab — research-only UI sections (not diagnostic).
import { currentUser } from '../auth.js';
import { escHtml } from './safety.js';
import { api } from '../api.js';

const KIND_TO_MODALITY = {
  session: 'intervention',
  assessment: 'assessment',
  qeeg: 'qeeg',
  symptom: 'outcome_score',
  biometric: 'biometric',
};

function _timelineToLabEvents(timeline, patientId) {
  const rows = Array.isArray(timeline) ? timeline : [];
  return rows.map((ev, i) => {
    const kind = ev.kind || 'observation';
    const modality = KIND_TO_MODALITY[kind] || 'other';
    const ts = ev.ts || new Date().toISOString();
    const eventType = kind === 'session' ? 'intervention_session' : 'observation';
    return {
      event_id: ev.ref || `tl-${i}`,
      patient_id: patientId || undefined,
      event_type: eventType,
      modality,
      timestamp: ts,
      source: 'deeptwin_timeline_map',
      payload: { label: ev.label || '', severity: ev.severity },
      metadata: { mapped_from_kind: kind },
      research_only: true,
    };
  });
}

function _completenessCard(timeline, dataSources) {
  const kinds = new Set((timeline || []).map(e => e.kind));
  const src = dataSources?.sources || {};
  const row = (label, ok) =>
    `<div class="dt-src ${ok ? 'dt-src-on' : 'dt-src-off'}" style="min-height:auto;padding:10px 12px">
      <div class="dt-src-label">${escHtml(label)}</div>
      <div class="dt-src-meta">${ok ? 'present in window / sources' : 'missing / not linked'}</div>
    </div>`;
  const qeegOk = kinds.has('qeeg') || !!src.qeeg?.available;
  const mriOk = !!src.mri?.available;
  const assessOk = kinds.has('assessment') || !!src.assessments?.available;
  const bioOk = kinds.has('biometric') || !!src.wearables?.available;
  const intervOk = kinds.has('session') || !!src.sessions?.available;
  const outcomeOk = kinds.has('symptom') || !!src.outcomes?.available;
  return `
    <section class="card dt-section" role="region" aria-label="NeuroAI Lab data completeness">
      <header class="dt-section-h"><h3>Data completeness</h3>
        <span class="dt-section-sub">Research-only coverage hints — not a readiness diagnosis.</span>
      </header>
      <div class="dt-src-grid">
        ${row('EEG / qEEG', qeegOk)}
        ${row('MRI reference', mriOk)}
        ${row('Assessments', assessOk)}
        ${row('Biometrics / wearables', bioOk)}
        ${row('Intervention timeline', intervOk)}
        ${row('Outcome scores / symptom checkpoints', outcomeOk)}
      </div>
    </section>`;
}

/** Renders NeuroAI Lab panels on the DeepTwin overview tab. */
export function renderNeuroAiLabSection({ patientId, timeline, dataSources }) {
  const badge =
    `<span class="dt-chip" style="background:rgba(120,140,200,.15);border:1px solid rgba(120,140,200,.35)">research-only</span>`;
  return `
    <section class="card dt-section" id="dt-neuroai-root" role="region" aria-label="DeepTwin NeuroAI Lab">
      <header class="dt-section-h">
        <h3>NeuroAI Lab ${badge}</h3>
        <span class="dt-section-sub">Optional multimodal analytics preview — clinician review required.</span>
      </header>
      <p id="dt-neuroai-status" class="dt-muted" style="margin:0 0 12px;font-size:12px;line-height:1.45">
        Loading module status…
      </p>
      <p id="dt-neuroai-audit-trail" class="dt-muted" style="display:none;margin:0 0 12px;font-size:11px;line-height:1.45;border-left:3px solid rgba(100,140,200,.35);padding-left:10px">
        Preview attempts may be written to the clinic audit trail as <strong>counts and safety flags only</strong>.
        Raw multimodal event payloads are not stored in audit notes.
      </p>
      ${_completenessCard(timeline, dataSources)}
      <div class="dt-src-grid" style="margin-top:12px">
        <div class="card" style="padding:12px 14px;margin:0">
          <div style="font-weight:600;margin-bottom:6px">Patient timeline (mapped)</div>
          <p class="dt-muted" style="margin:0 0 8px;font-size:12px">
            Chronological markers derived from the DeepTwin timeline filter — wording reflects temporal pattern / association, not causation.
          </p>
          <button type="button" class="btn btn-sm btn-primary" id="dt-neuroai-refresh">Refresh NeuroAI timeline preview</button>
          <pre id="dt-neuroai-tl-out" class="dt-muted" style="margin:10px 0 0;font-size:11px;white-space:pre-wrap;max-height:160px;overflow:auto;background:var(--bg-surface);padding:8px;border-radius:8px"></pre>
        </div>
        <div class="card" style="padding:12px 14px;margin:0">
          <div style="font-weight:600;margin-bottom:6px">Multimodal feature preview</div>
          <p class="dt-muted" style="margin:0 0 8px;font-size:12px">Deterministic summaries from supplied payload fields only.</p>
          <button type="button" class="btn btn-sm" id="dt-neuroai-features">Run feature preview</button>
          <pre id="dt-neuroai-feat-out" class="dt-muted" style="margin:10px 0 0;font-size:11px;white-space:pre-wrap;max-height:160px;overflow:auto;background:var(--bg-surface);padding:8px;border-radius:8px"></pre>
        </div>
      </div>
      <div class="card" style="padding:12px 14px;margin-top:12px">
        <div style="font-weight:600;margin-bottom:6px">Correlation sandbox</div>
        <p class="dt-muted" style="margin:0;font-size:12px;line-height:1.45">
          Observed associations may reflect temporal co-occurrence; insufficient evidence for causal conclusion without structured study design.
        </p>
      </div>
      <div class="card" style="padding:12px 14px;margin-top:12px;border:1px dashed rgba(180,140,60,.45);background:rgba(180,140,60,.06)">
        <div style="font-weight:600;margin-bottom:6px">Simulation preview (guarded)</div>
        <p class="dt-muted" style="margin:0 0 8px;font-size:12px;line-height:1.45">
          This is a research-grade scenario preview. It is not diagnostic, not prescriptive, and cannot replace clinician judgement.
        </p>
        <button type="button" class="btn btn-sm" id="dt-neuroai-sim" disabled title="Unlocks after a successful timeline preview against the API (clinician/admin sessions only for simulation).">
          Load hypothesis-style simulation stub
        </button>
        <pre id="dt-neuroai-sim-out" class="dt-muted" style="margin:10px 0 0;font-size:11px;white-space:pre-wrap;max-height:140px;overflow:auto;background:var(--bg-surface);padding:8px;border-radius:8px"></pre>
      </div>
      <div class="card" style="padding:12px 14px;margin-top:12px">
        <div style="font-weight:600;margin-bottom:6px">Safety & evidence</div>
        <ul class="dt-muted" style="margin:0;padding-left:18px;font-size:12px;line-height:1.45">
          <li>Clinician review is required for all decisions.</li>
          <li>No normative labels unless validated pipelines supply them.</li>
          <li>Off-label or extreme parameters require explicit evidence review.</li>
        </ul>
      </div>
    </section>`;
}

export async function wireNeuroAiLab(patientId, timeline, _dataSources) {
  const auditTrail = document.getElementById('dt-neuroai-audit-trail');
  const role = currentUser?.role;
  if (auditTrail && (role === 'clinician' || role === 'admin')) {
    auditTrail.style.display = 'block';
  }

  const stEl = document.getElementById('dt-neuroai-status');
  try {
    const st = await api.deeptwinNeuroAiStatus();
    if (stEl) {
      stEl.textContent = `${st.note || ''} (${st.module || 'deeptwin_neuroai_lab'})`;
    }
  } catch (e) {
    if (stEl) stEl.textContent = 'Status unavailable offline — demo shim may still apply.';
  }

  document.getElementById('dt-neuroai-refresh')?.addEventListener('click', async () => {
    const out = document.getElementById('dt-neuroai-tl-out');
    if (out) out.textContent = 'Loading…';
    try {
      const events = _timelineToLabEvents(timeline, patientId);
      const preview = await api.deeptwinNeuroAiTimelinePreview({
        patient_id: patientId,
        events,
      });
      if (out) out.textContent = JSON.stringify(preview.summary || preview, null, 2);
      document.getElementById('dt-neuroai-sim')?.removeAttribute('disabled');
    } catch (e) {
      if (out) out.textContent = 'Preview failed: ' + (e.message || e);
    }
  });

  document.getElementById('dt-neuroai-features')?.addEventListener('click', async () => {
    const out = document.getElementById('dt-neuroai-feat-out');
    if (out) out.textContent = 'Loading…';
    try {
      const events = _timelineToLabEvents(timeline, patientId);
      const res = await api.deeptwinNeuroAiFeaturesPreview({ events });
      if (out) out.textContent = JSON.stringify(res.results || res, null, 2);
    } catch (e) {
      if (out) out.textContent = 'Feature preview failed: ' + (e.message || e);
    }
  });

  document.getElementById('dt-neuroai-sim')?.addEventListener('click', async () => {
    const out = document.getElementById('dt-neuroai-sim-out');
    if (out) out.textContent = 'Loading…';
    try {
      const res = await api.deeptwinNeuroAiSimulationPreview({
        patient_id: patientId,
        baseline_events: _timelineToLabEvents(timeline, patientId),
        proposed_intervention: {
          intervention_type: 'tDCS',
          target: 'context_only',
          duration_minutes: 20,
          clinician_approved: false,
        },
      });
      if (out) out.textContent = JSON.stringify(res.result || res, null, 2);
    } catch (e) {
      const msg = (e.message || '') + '';
      if (e.status === 403 || /403/.test(msg)) {
        if (out) {
          out.textContent =
            'Blocked for this session role — simulation preview requires clinician or administrator access.';
        }
      } else if (out) {
        out.textContent = 'Simulation preview unavailable: ' + msg;
      }
    }
  });
}
