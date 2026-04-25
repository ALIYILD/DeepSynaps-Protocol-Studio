// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-tools-shared.js — Helpers shared between the split clinical
// tool modules (advanced-search, assessments-hub, home-programs, etc.).
//
// Hoisted out of pages-clinical-tools.js so sub-page modules can import them
// without re-introducing a circular import on the parent file.
// ─────────────────────────────────────────────────────────────────────────────
import { ASSESS_REGISTRY } from './registries/assess-instruments-registry.js';
import { resolveScaleCanonical } from './registries/scale-assessment-registry.js';

export function _dsToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `ds-toast ds-toast--${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Assessments-hub helpers — referenced by pgAssessmentsHub. Mirror the sibling
// copy in pages-clinical.js; both intentionally share the same semantics.
export function _hubResolveRegistryScale(scaleId) {
  const mapped = resolveScaleCanonical(scaleId);
  return ASSESS_REGISTRY.find(r => r.id === mapped || r.id === scaleId) || null;
}

export function _hubEscHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function _hubInterpretScore(scaleId, score, extraScalesMap) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '';
  const n = Number(score);
  const reg = _hubResolveRegistryScale(scaleId);
  if (reg && typeof reg.interpret === 'function') {
    const o = reg.interpret(n);
    return (o && o.label) || '';
  }
  const canon = resolveScaleCanonical(scaleId);
  const ex = (extraScalesMap || {})[scaleId] || (extraScalesMap || {})[canon];
  if (ex && Array.isArray(ex.interpretation)) {
    for (const r of ex.interpretation) {
      if (n <= r.max) return r.label;
    }
  }
  return '';
}

export const _TYPE_COLORS = {
  patient:           { bg: '#0d9488', text: '#fff' },
  note:              { bg: '#2563eb', text: '#fff' },
  protocol:          { bg: '#7c3aed', text: '#fff' },
  session:           { bg: '#d97706', text: '#fff' },
  invoice:           { bg: '#e11d48', text: '#fff' },
  'qa-review':       { bg: '#0891b2', text: '#fff' },
  referral:          { bg: '#059669', text: '#fff' },
  'homework-plan':   { bg: '#9333ea', text: '#fff' },
  intake:            { bg: '#ca8a04', text: '#fff' },
};

export function _asTypeBadge(type) {
  const c = _TYPE_COLORS[type] || { bg: 'var(--border)', text: 'var(--text)' };
  const label = type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return '<span style="background:' + c.bg + ';color:' + c.text + ';font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:12px;text-transform:uppercase;flex-shrink:0">' + label + '</span>';
}
