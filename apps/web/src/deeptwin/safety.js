// DeepTwin safety / governance language helpers.
//
// These centralise the evidence-grade badges, the "decision-support only"
// disclaimers, and the correlation/causation language. Components import
// from this module so the safety stamps are consistent across the page
// and easy to audit.

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const GRADE_COLORS = {
  high:     { bg: 'rgba(0,212,188,.12)',  border: 'rgba(0,212,188,.45)',  fg: 'var(--teal)' },
  moderate: { bg: 'rgba(74,158,255,.12)', border: 'rgba(74,158,255,.45)', fg: 'var(--blue)' },
  low:      { bg: 'rgba(255,179,71,.12)', border: 'rgba(255,179,71,.45)', fg: 'var(--amber)' },
};

export function evidenceGradeBadge(grade) {
  const g = (grade || 'low').toLowerCase();
  const c = GRADE_COLORS[g] || GRADE_COLORS.low;
  return `<span class="dt-grade dt-grade-${escHtml(g)}" style="background:${c.bg};border-color:${c.border};color:${c.fg}">Evidence: ${escHtml(g)}</span>`;
}

export function simulationOnlyBadge() {
  return `<span class="dt-stamp dt-stamp-sim" title="Predictions are model-estimated, not prescriptions.">Simulation only</span>`;
}

export function notAPrescriptionStamp() {
  return `<span class="dt-stamp dt-stamp-notrx" title="Not a prescription.">Not a prescription</span>`;
}

export function modelEstimatedStamp() {
  return `<span class="dt-stamp dt-stamp-model">Model-estimated</span>`;
}

export function approvalRequiredBadge() {
  return `<span class="dt-stamp dt-stamp-approve">Clinician approval required</span>`;
}

export function correlationVsCausationNotice() {
  return `<div class="dt-notice dt-notice-amber">Correlation does not imply causation. Findings are hypotheses for clinician interpretation.</div>`;
}

export function dataCompletenessWarning(missingItems = []) {
  if (!missingItems || !missingItems.length) return '';
  const list = missingItems.map(m => escHtml(typeof m === 'string' ? m : (m.label || m.key || ''))).join(', ');
  return `<div class="dt-notice dt-notice-amber">Data completeness warning: missing ${list}. Predictions in those domains carry higher uncertainty.</div>`;
}

export function safetyFooter() {
  return `<div class="dt-safety-footer">
    <strong>Decision-support only.</strong> DeepTwin outputs are model-estimated hypotheses, not prescriptions. Every prediction, simulation and report requires clinician review before clinical use.
  </div>`;
}

export function completenessGauge(pct) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const color = clamped >= 75 ? 'var(--teal)' : clamped >= 50 ? 'var(--blue)' : 'var(--amber)';
  return `<svg class="dt-gauge" viewBox="0 0 70 70" width="70" height="70" aria-label="Twin completeness ${clamped}%">
    <circle cx="35" cy="35" r="${r}" stroke="rgba(255,255,255,.08)" stroke-width="6" fill="none"/>
    <circle cx="35" cy="35" r="${r}" stroke="${color}" stroke-width="6" fill="none"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 35 35)" stroke-linecap="round"/>
    <text x="35" y="40" text-anchor="middle" fill="var(--text)" font-size="14" font-weight="650">${clamped}%</text>
  </svg>`;
}

export function riskChip(status) {
  const s = (status || 'unknown').toLowerCase();
  const m = {
    stable:   { fg: 'var(--teal)',  bg: 'rgba(0,212,188,.10)',  label: 'Stable' },
    watch:    { fg: 'var(--blue)',  bg: 'rgba(74,158,255,.10)', label: 'Watch' },
    elevated: { fg: 'var(--amber)', bg: 'rgba(255,179,71,.12)', label: 'Elevated risk' },
    unknown:  { fg: 'var(--text-tertiary)', bg: 'rgba(255,255,255,.04)', label: 'Unknown' },
  }[s] || { fg: 'var(--text-tertiary)', bg: 'rgba(255,255,255,.04)', label: s };
  return `<span class="dt-chip" style="background:${m.bg};color:${m.fg}">${escHtml(m.label)}</span>`;
}

export function reviewStatusChip(status) {
  const map = {
    awaiting_clinician_review: 'Awaiting clinician review',
    clinician_reviewed: 'Clinician reviewed',
    in_review: 'In review',
  };
  const label = map[status] || status || 'Awaiting clinician review';
  return `<span class="dt-chip dt-chip-muted">${escHtml(label)}</span>`;
}
