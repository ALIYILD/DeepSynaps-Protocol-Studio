/**
 * pages-complementary.js — Complementary & Integrative Interventions Platform
 *
 * Modules: Dashboard, Acupuncture, Neurofeedback/Biofeedback, CES, tPBM,
 *          Mind-Body, Massage, Music/Art Therapy, Therapy Library,
 *          Safety & Evidence, Protocol Builder.
 *
 * DeepSynaps Protocol Studio — clinical intervention platform pattern.
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';

const COMPLEMENTARY_ROLES = new Set(['clinician', 'admin', 'clinic-admin', 'supervisor', 'reviewer', 'technician']);

/** ------------------------------------------------------------------ */
/*  ESCAPE / UTILITIES                                                 */
/** ------------------------------------------------------------------ */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _statusKey(s) {
  return String(s || '').toLowerCase();
}

function _statusPill(status) {
  const s = _statusKey(status);
  if (s === 'active' || s === 'normal') return '<span class="pill pill-active">Active</span>';
  if (s === 'completed') return '<span class="pill" style="background:rgba(45,212,191,0.12);color:var(--teal);border:1px solid rgba(45,212,191,0.30)">Completed</span>';
  if (s === 'critical' || s === 'contraindicated') return '<span class="pill" style="background:rgba(255,107,107,0.16);color:var(--red);border:1px solid rgba(255,107,107,0.32);font-weight:700">⚠ Contraindicated</span>';
  if (s === 'high' || s === 'major') return '<span class="pill pill-pending">High</span>';
  if (s === 'monitor' || s === 'caution') return '<span class="pill" style="background:rgba(255,176,87,0.14);color:var(--amber);border:1px solid rgba(255,176,87,0.30)">Caution</span>';
  if (s === 'low') return '<span class="pill" style="background:rgba(96,165,250,0.12);color:var(--blue);border:1px solid rgba(96,165,250,0.25)">Low</span>';
  return '<span class="pill pill-inactive">—</span>';
}

function _evidenceGradePill(grade) {
  const g = String(grade || '').toUpperCase();
  if (g === 'A') return '<span class="pill" style="background:rgba(45,212,191,0.14);color:var(--teal);border:1px solid rgba(45,212,191,0.35);font-weight:700" title="Meta-analysis / Systematic Review">Grade A</span>';
  if (g === 'B') return '<span class="pill" style="background:rgba(96,165,250,0.14);color:var(--blue);border:1px solid rgba(96,165,250,0.35);font-weight:600" title="Randomized Controlled Trial">Grade B</span>';
  if (g === 'C') return '<span class="pill" style="background:rgba(155,127,255,0.14);color:var(--violet);border:1px solid rgba(155,127,255,0.35)" title="Cohort / Observational">Grade C</span>';
  if (g === 'D') return '<span class="pill" style="background:rgba(255,255,255,0.06);color:var(--text-secondary);border:1px solid var(--border)" title="Expert Opinion / Case Report">Grade D</span>';
  return '<span class="pill pill-inactive">—</span>';
}

function _safetyAlertPill(level) {
  const l = _statusKey(level);
  if (l === 'critical') return '<span class="pill" style="background:rgba(255,107,107,0.18);color:var(--red);border:1px solid rgba(255,107,107,0.40);font-weight:700;font-size:11px">🚫 STOP — Critical</span>';
  if (l === 'warning') return '<span class="pill" style="background:rgba(255,176,87,0.16);color:var(--amber);border:1px solid rgba(255,176,87,0.35);font-weight:600;font-size:11px">⚠ Warning</span>';
  if (l === 'caution') return '<span class="pill" style="background:rgba(96,165,250,0.12);color:var(--blue);border:1px solid rgba(96,165,250,0.30);font-size:11px">ℹ Caution</span>';
  return '';
}

function _todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function _nowInput() {
  const d = new Date();
  return d.toISOString().slice(0, 16);
}

function _uuid() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** ------------------------------------------------------------------ */
/*  DEMO DATA                                                          */
/** ------------------------------------------------------------------ */
const DEMO_THERAPY_TYPES = [
  { type: 'Acupuncture', count: 8, color: '#2dd4bf' },
  { type: 'Neurofeedback', count: 5, color: '#60a5fa' },
  { type: 'CES', count: 3, color: '#fbbf24' },
  { type: 'tPBM', count: 2, color: '#a78bfa' },
  { type: 'Mind-Body', count: 6, color: '#f472b6' },
  { type: 'Massage', count: 4, color: '#fb923c' },
  { type: 'Music/Art', count: 2, color: '#34d399' },
];

const DEMO_PATIENTS = [
  { patient_id: 'demo-pt-samantha-li', patient_name: 'Samantha Li', active_therapies: 2, primary_therapy: 'Acupuncture', last_session: '2026-01-14', sessions_this_week: 2, pro_score: 7.2, safety_alerts: 0 },
  { patient_id: 'demo-pt-elena-vasquez', patient_name: 'Elena Vasquez', active_therapies: 3, primary_therapy: 'Neurofeedback', last_session: '2026-01-15', sessions_this_week: 3, pro_score: 6.8, safety_alerts: 1 },
  { patient_id: 'demo-pt-marcus-chen', patient_name: 'Marcus Chen', active_therapies: 1, primary_therapy: 'CES', last_session: '2026-01-13', sessions_this_week: 1, pro_score: 5.5, safety_alerts: 0 },
  { patient_id: 'demo-pt-omar-haddad', patient_name: 'Omar Haddad', active_therapies: 2, primary_therapy: 'tPBM', last_session: '2026-01-12', sessions_this_week: 2, pro_score: 8.1, safety_alerts: 0 },
  { patient_id: 'demo-pt-amelia-brown', patient_name: 'Amelia Brown', active_therapies: 2, primary_therapy: 'Mind-Body', last_session: '2026-01-15', sessions_this_week: 2, pro_score: 7.5, safety_alerts: 1 },
  { patient_id: 'demo-pt-james-wilson', patient_name: 'James Wilson', active_therapies: 1, primary_therapy: 'Massage', last_session: '2026-01-11', sessions_this_week: 1, pro_score: 6.2, safety_alerts: 0 },
  { patient_id: 'demo-pt-linda-park', patient_name: 'Linda Park', active_therapies: 1, primary_therapy: 'Music/Art', last_session: '2026-01-10', sessions_this_week: 1, pro_score: 7.8, safety_alerts: 0 },
];

const DEMO_EVIDENCE_SUMMARY = {
  grade_a: 12,
  grade_b: 18,
  grade_c: 15,
  grade_d: 8,
};

const DEMO_ACUPUNCTURE_HISTORY = [
  { id: 'acu-1', session_date: '2026-01-14', session_number: 5, points: 'LI4, LV3, SP6, Yintang', condition: 'Generalized Anxiety', pain_vas_before: 6, pain_vas_after: 3, deqi_achieved: true, duration_min: 30, notes: 'Strong deqi at LI4. Patient relaxed well.' },
  { id: 'acu-2', session_date: '2026-01-10', session_number: 4, points: 'LI4, LV3, PC6, HT7', condition: 'Generalized Anxiety', pain_vas_before: 7, pain_vas_after: 4, deqi_achieved: true, duration_min: 30, notes: 'Added HT7 for sleep support.' },
  { id: 'acu-3', session_date: '2026-01-07', session_number: 3, points: 'LI4, LV3, SP6, ST36', condition: 'Generalized Anxiety', pain_vas_before: 6, pain_vas_after: 4, deqi_achieved: true, duration_min: 25, notes: 'Mild bruising at SP6, resolved in 2 days.' },
  { id: 'acu-4', session_date: '2026-01-03', session_number: 2, points: 'LI4, LV3, GB20', condition: 'Generalized Anxiety', pain_vas_before: 8, pain_vas_after: 5, deqi_achieved: true, duration_min: 30, notes: 'Patient reported headache relief.' },
  { id: 'acu-5', session_date: '2025-12-27', session_number: 1, points: 'LI4, LV3, SP6', condition: 'Generalized Anxiety', pain_vas_before: 7, pain_vas_after: 5, deqi_achieved: false, duration_min: 20, notes: 'First session — mild anxiety about needling.' },
];

const DEMO_NEUROFEEDBACK_HISTORY = [
  { id: 'nf-1', session_date: '2026-01-15', session_number: 12, protocol: 'SMR (12-15 Hz)', site: 'C4', duration_min: 30, threshold: 2.5, reward_ratio: 78, artifact_pct: 5, notes: 'Good focus today. Reward ratio above target.' },
  { id: 'nf-2', session_date: '2026-01-13', session_number: 11, protocol: 'SMR (12-15 Hz)', site: 'C4', duration_min: 30, threshold: 2.5, reward_ratio: 72, artifact_pct: 8, notes: 'Slightly more eye-blink artifact.' },
  { id: 'nf-3', session_date: '2026-01-10', session_number: 10, protocol: 'SMR (12-15 Hz)', site: 'C4', duration_min: 30, threshold: 2.8, reward_ratio: 65, artifact_pct: 6, notes: 'Threshold lowered — reward ratio improving.' },
  { id: 'nf-4', session_date: '2026-01-08', session_number: 9, protocol: 'Alpha-Theta', site: 'Pz', duration_min: 25, threshold: 1.8, reward_ratio: 55, artifact_pct: 4, notes: 'Deep relaxation state achieved.' },
  { id: 'nf-5', session_date: '2026-01-06', session_number: 8, protocol: 'SMR (12-15 Hz)', site: 'C4', duration_min: 30, threshold: 3.0, reward_ratio: 60, artifact_pct: 7, notes: 'Baseline assessment updated.' },
];

const DEMO_CES_HISTORY = [
  { id: 'ces-1', session_date: '2026-01-15', current_ua: 100, frequency_hz: 0.5, duration_min: 20, earclips: 'bilateral', response: 'Relaxed within 10 minutes', side_effects: 'none' },
  { id: 'ces-2', session_date: '2026-01-14', current_ua: 100, frequency_hz: 0.5, duration_min: 20, earclips: 'bilateral', response: 'Mild tingling, then calm', side_effects: 'none' },
  { id: 'ces-3', session_date: '2026-01-13', current_ua: 100, frequency_hz: 100, duration_min: 20, earclips: 'bilateral', response: 'Felt more alert post-session', side_effects: 'none' },
];

const DEMO_PBM_HISTORY = [
  { id: 'pbm-1', session_date: '2026-01-14', wavelength_nm: 810, power_density_mw_cm2: 250, dose_j_cm2: 60, site: 'Left prefrontal (F3)', duration_min: 4, before_score: 6, after_score: 4, notes: 'No adverse effects. Patient reported clarity.' },
  { id: 'pbm-2', session_date: '2026-01-12', wavelength_nm: 810, power_density_mw_cm2: 250, dose_j_cm2: 60, site: 'Right prefrontal (F4)', duration_min: 4, before_score: 5, after_score: 4, notes: 'Slight warmth at site. Resolved within 5 min.' },
];

const DEMO_MINDBODY_HISTORY = [
  { id: 'mb-1', session_date: '2026-01-15', type: 'meditation', subtype: 'mindfulness', duration_min: 20, guided: true, hrv_before: 62, hrv_after: 71, notes: 'Body scan — good engagement.' },
  { id: 'mb-2', session_date: '2026-01-13', type: 'breathing', subtype: '4-7-8', duration_min: 10, guided: false, hrv_before: 58, hrv_after: 68, notes: 'Reported calm within 3 rounds.' },
  { id: 'mb-3', session_date: '2026-01-11', type: 'yoga', subtype: 'hatha', duration_min: 45, guided: true, hrv_before: 55, hrv_after: 64, notes: 'Gentle flow — no strain.' },
  { id: 'mb-4', session_date: '2026-01-09', type: 'tai_chi', subtype: 'yang_24', duration_min: 30, guided: true, hrv_before: 60, hrv_after: 66, notes: 'Form practice — balance improved.' },
];

const DEMO_MASSAGE_HISTORY = [
  { id: 'mass-1', session_date: '2026-01-11', type: 'Swedish', duration_min: 60, areas: 'Back, neck, shoulders', pressure: 'moderate', pain_before: 7, pain_after: 4, relaxation_score: 8, rom_change: 'Improved cervical rotation', notes: 'Trigger points at upper trapezius.' },
  { id: 'mass-2', session_date: '2026-01-04', type: 'Deep Tissue', duration_min: 45, areas: 'Lower back, glutes', pressure: 'firm', pain_before: 8, pain_after: 5, relaxation_score: 7, rom_change: 'Improved lumbar flexion', notes: 'Client tolerated firm pressure well.' },
];

const DEMO_MUSIC_ART_HISTORY = [
  { id: 'ma-1', session_date: '2026-01-10', modality: 'music_receptive', type: 'active', materials: 'Headphones, curated playlist', goals: 'Mood regulation', mood_before: 4, mood_after: 7, engagement_score: 8, notes: 'Patient selected classical — reported nostalgia and comfort.' },
  { id: 'ma-2', session_date: '2026-01-08', modality: 'art_mandala', type: 'active', materials: 'Colored pencils, mandala template', goals: 'Anxiety reduction', mood_before: 5, mood_after: 7, engagement_score: 9, notes: 'High engagement — requested to continue.' },
];

const DEMO_PROTOCOLS = [
  { id: 'proto-1', name: 'Acupuncture for Depression/Anxiety', template_key: 'acupuncture_mood', weeks: 10, sessions_count: 10, description: '10-session acupuncture course targeting LI4, LV3, SP6, PC6, HT7, Yintang for depression and anxiety symptoms.', conditions: ['Major Depressive Disorder', 'Generalized Anxiety Disorder'], evidence_grade: 'A', active: true },
  { id: 'proto-2', name: 'Neurofeedback for ADHD', template_key: 'neurofeedback_adhd', weeks: 20, sessions_count: 40, description: '40-session SMR (12-15 Hz) training at C4/Cz, twice weekly, with TQ assessment at baseline, session 20, and session 40.', conditions: ['ADHD'], evidence_grade: 'B', active: true },
  { id: 'proto-3', name: 'CES for Anxiety/Insomnia', template_key: 'ces_anxiety', weeks: 4, sessions_count: 28, description: 'Daily 20-minute CES at 100 μA, 0.5 Hz, bilateral earclips for 4 weeks. Sleep diary and GAD-7 tracked weekly.', conditions: ['Generalized Anxiety Disorder', 'Insomnia'], evidence_grade: 'B', active: true },
  { id: 'proto-4', name: 'tPBM for Cognitive Support', template_key: 'pbm_cognitive', weeks: 8, sessions_count: 24, description: '24 sessions of 810 nm tPBM at 250 mW/cm², 60 J/cm², targeting bilateral prefrontal cortex. 3x weekly.', conditions: ['Mild Cognitive Impairment', 'Post-COVID Brain Fog'], evidence_grade: 'C', active: true },
  { id: 'proto-5', name: 'Yoga + Breathwork for Stress', template_key: 'yoga_stress', weeks: 6, sessions_count: 12, description: '6-week program: 2x weekly 60-min hatha yoga + pranayama. HRV, PSS-10, and cortisol salivary samples tracked.', conditions: ['Chronic Stress', 'Burnout'], evidence_grade: 'B', active: true },
  { id: 'proto-6', name: 'Music Therapy for Mood', template_key: 'music_mood', weeks: 8, sessions_count: 8, description: '8 weekly receptive and active music therapy sessions. BDI-II, STAI, and engagement scores tracked.', conditions: ['Major Depressive Disorder', 'Adjustment Disorder'], evidence_grade: 'B', active: true },
  { id: 'proto-7', name: 'Massage + HRV Biofeedback', template_key: 'massage_hrv', weeks: 6, sessions_count: 12, description: '6-week integrative protocol: weekly 60-min massage + 30-min HRV biofeedback training. Pain VAS and HRV tracked.', conditions: ['Chronic Pain', 'Tension-Type Headache'], evidence_grade: 'B', active: true },
  { id: 'proto-8', name: 'Tai Chi for Balance', template_key: 'taichi_balance', weeks: 12, sessions_count: 24, description: '12-week Yang-style tai chi (24-form), 2x weekly 45-min sessions. BBS, TUG, and fall-risk assessment tracked.', conditions: ['Fall Risk', 'Parkinsons Disease'], evidence_grade: 'A', active: true },
  { id: 'proto-9', name: 'Integrative Pain Management', template_key: 'integrative_pain', weeks: 8, sessions_count: 16, description: '8-week multimodal: acupuncture (biweekly) + massage (weekly) + mindfulness (daily home practice). Pain VAS, ODI, PCS tracked.', conditions: ['Chronic Low Back Pain', 'Fibromyalgia'], evidence_grade: 'B', active: true },
  { id: 'proto-10', name: 'Comprehensive Complementary Plan', template_key: 'comprehensive_12wk', weeks: 12, sessions_count: 24, description: '12-week personalized integrative plan combining 2-3 modalities. Weekly check-ins, biomarker tracking, PROs.', conditions: ['Multi-condition', 'Complex Chronic'], evidence_grade: 'B', active: true },
];

/** ------------------------------------------------------------------ */
/*  SVG MINI-CHART HELPERS                                             */
/** ------------------------------------------------------------------ */
function _sparkline(history, opts = {}) {
  if (!Array.isArray(history) || history.length < 2) {
    return `<svg viewBox="0 0 120 32" width="120" height="32" style="display:block" aria-hidden="true"></svg>`;
  }
  const w = opts.width || 120;
  const h = opts.height || 32;
  const pad = 2;
  let min = Math.min(...history);
  let max = Math.max(...history);
  if (min === max) { min -= 1; max += 1; }
  const step = (w - pad * 2) / (history.length - 1);
  const coords = history.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = opts.color || 'currentColor';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;color:${color}" role="img" aria-label="Trend">
    <polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>
  </svg>`;
}

function _miniBarChart(items, opts = {}) {
  if (!Array.isArray(items) || !items.length) return '';
  const w = opts.width || 120;
  const h = opts.height || 32;
  const max = Math.max(...items.map(i => i.value || 0), 1);
  const barW = Math.max(4, (w - 4) / items.length - 2);
  const bars = items.map((it, idx) => {
    const bh = ((it.value || 0) / max) * (h - 4);
    const x = 2 + idx * (barW + 2);
    const y = h - 2 - bh;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="2" fill="${it.color || 'var(--blue)'}" opacity="0.7"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block" role="img" aria-label="Bar chart">${bars}</svg>`;
}

function _miniPieChart(segments, size = 48) {
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  if (!total) return '';
  let startAngle = 0;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) - 2;
  const slices = segments.map((seg) => {
    const angle = ((seg.value || 0) / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(startAngle + angle);
    const y2 = cy + r * Math.sin(startAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${seg.color || '#60a5fa'}" stroke="var(--bg-body)" stroke-width="1"/>`;
    startAngle += angle;
    return path;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">${slices}</svg>`;
}

/** ------------------------------------------------------------------ */
/*  SAFETY STRIP                                                       */
/** ------------------------------------------------------------------ */
function _safetyStrip() {
  return `<div role="note" style="padding:10px 12px;border-radius:10px;border:1px solid rgba(255,176,87,0.35);background:rgba(255,176,87,0.06);font-size:11px;line-height:1.5;color:var(--text-secondary);margin-bottom:14px">
    <strong style="color:var(--amber)">Clinical safety note.</strong> Complementary interventions are intended as adjuncts to — not replacements for — standard medical care. Contraindication checking, evidence grading, and practitioner qualification requirements are advisory only. Require clinician oversight, informed consent, and coordination with the patient's primary care team.
  </div>`;
}

function _qualifiedPractitionerWarning(therapy) {
  return `<div role="note" style="padding:8px 10px;border-radius:8px;border:1px solid rgba(96,165,250,0.30);background:rgba(96,165,250,0.08);font-size:11px;line-height:1.4;color:var(--text-secondary);margin-top:8px">
    <strong style="color:var(--blue)">Practitioner requirement:</strong> ${esc(therapy)} should only be administered by a qualified, licensed practitioner. This platform supports documentation and tracking — not treatment delivery.
  </div>`;
}

/** ------------------------------------------------------------------ */
/*  NAVIGATION                                                         */
/** ------------------------------------------------------------------ */
const _MODULE_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'acupuncture', label: 'Acupuncture' },
  { key: 'neurofeedback', label: 'Neurofeedback' },
  { key: 'ces', label: 'CES' },
  { key: 'pbm', label: 'tPBM' },
  { key: 'mindbody', label: 'Mind-Body' },
  { key: 'massage', label: 'Massage' },
  { key: 'music-art', label: 'Music/Art' },
  { key: 'library', label: 'Therapy Library' },
  { key: 'safety', label: 'Safety & Evidence' },
  { key: 'protocols', label: 'Protocol Builder' },
];

function _tabBar(activeTab) {
  const tabs = _MODULE_TABS.map(t => {
    const isActive = t.key === activeTab;
    const style = isActive
      ? 'background:var(--primary);color:#fff;border-color:var(--primary)'
      : 'background:transparent;color:var(--text-secondary);border-color:var(--border)';
    return `<button type="button" class="btn btn-sm" data-tab="${t.key}" style="min-height:36px;font-size:11px;padding:4px 12px;border-radius:8px;border:1px solid ${isActive ? 'var(--primary)' : 'var(--border)'};${style}">${esc(t.label)}</button>`;
  }).join('');
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">${tabs}</div>`;
}

/** ------------------------------------------------------------------ */
/*  PAGE RENDER DISPATCH                                               */
/** ------------------------------------------------------------------ */
export function complementaryInterventionsAllowsRole(role) {
  return COMPLEMENTARY_ROLES.has(String(role || '').trim().toLowerCase());
}

export function renderPage(state, pageId) {
  if (pageId !== 'complementary-interventions') return null;
  const user = state?.user || {};
  if (!complementaryInterventionsAllowsRole(user.role)) {
    return _renderRestrictedCard();
  }
  const container = document.createElement('div');
  container.id = 'complementary-page';
  container.innerHTML = _renderPageInner(state);
  _wireComplementaryPage(container, state);
  return container;
}

function _renderRestrictedCard() {
  return `<div role="region" aria-label="Complementary interventions access restricted" style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">Clinician workspace</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">
      Complementary and integrative intervention management is restricted to clinician-facing accounts because it links patient-specific therapy documentation, safety checks, and evidence-graded protocols.
    </div>
  </div>`;
}

function _renderPageInner(state) {
  const tab = state?._complementaryTab || 'dashboard';
  return `<div style="padding:16px;max-width:1400px;margin:0 auto">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px">
      <div>
        <div style="font-size:20px;font-weight:700">Complementary &amp; Integrative Interventions</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Documentation, safety checking, evidence review, and protocol templates for complementary therapies.</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button type="button" class="btn btn-ghost btn-sm" data-action="ci-help" style="min-height:36px">Help</button>
      </div>
    </div>
    ${_safetyStrip()}
    ${_tabBar(tab)}
    <div data-tab-content>${_renderTabContent(tab, state)}</div>
  </div>`;
}

function _renderTabContent(tab, state) {
  switch (tab) {
    case 'dashboard': return _renderDashboard(state);
    case 'acupuncture': return _renderAcupuncture(state);
    case 'neurofeedback': return _renderNeurofeedback(state);
    case 'ces': return _renderCES(state);
    case 'pbm': return _renderPBM(state);
    case 'mindbody': return _renderMindBody(state);
    case 'massage': return _renderMassage(state);
    case 'music-art': return _renderMusicArt(state);
    case 'library': return _renderTherapyLibrary(state);
    case 'safety': return _renderSafetyEvidence(state);
    case 'protocols': return _renderProtocolBuilder(state);
    default: return _renderDashboard(state);
  }
}

/** ================================================================== */
/*  1. DASHBOARD                                                       */
/** ================================================================== */
function _renderDashboard(state) {
  const patients = DEMO_PATIENTS;
  const totalActive = patients.reduce((s, p) => s + (p.active_therapies || 0), 0);
  const sessionsWeek = patients.reduce((s, p) => s + (p.sessions_this_week || 0), 0);
  const avgPro = patients.length ? (patients.reduce((s, p) => s + (p.pro_score || 0), 0) / patients.length).toFixed(1) : '—';
  const safetyAlerts = patients.reduce((s, p) => s + (p.safety_alerts || 0), 0);

  const kpiCards = [
    { label: 'Active Therapies', value: totalActive, sub: `${patients.length} patients enrolled', color: 'var(--teal)' },
    { label: 'Sessions This Week', value: sessionsWeek, sub: 'Across all modalities', color: 'var(--blue)' },
    { label: 'Avg. Patient-Reported Outcome', value: avgPro, sub: '0–10 scale', color: 'var(--violet)' },
    { label: 'Safety Alerts', value: safetyAlerts, sub: safetyAlerts === 0 ? 'All clear' : 'Requires review', color: safetyAlerts > 0 ? 'var(--red)' : 'var(--green)' },
  ];

  const kpis = kpiCards.map(k => `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;flex:1;min-width:180px;border-left:3px solid ${k.color}">
      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px">${esc(k.label)}</div>
      <div style="font-size:24px;font-weight:700;margin-top:6px;font-variant-numeric:tabular-nums;color:${k.color}">${esc(String(k.value))}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${esc(k.sub)}</div>
    </div>
  `).join('');

  const evidenceSummary = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Evidence Summary</div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;border-radius:8px;background:rgba(45,212,191,0.08)">
          <div style="font-size:20px;font-weight:700;color:var(--teal)">${DEMO_EVIDENCE_SUMMARY.grade_a}</div>
          <div style="font-size:10px;color:var(--text-secondary)">Grade A</div>
        </div>
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;border-radius:8px;background:rgba(96,165,250,0.08)">
          <div style="font-size:20px;font-weight:700;color:var(--blue)">${DEMO_EVIDENCE_SUMMARY.grade_b}</div>
          <div style="font-size:10px;color:var(--text-secondary)">Grade B</div>
        </div>
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;border-radius:8px;background:rgba(155,127,255,0.08)">
          <div style="font-size:20px;font-weight:700;color:var(--violet)">${DEMO_EVIDENCE_SUMMARY.grade_c}</div>
          <div style="font-size:10px;color:var(--text-secondary)">Grade C</div>
        </div>
        <div style="flex:1;min-width:100px;text-align:center;padding:10px;border-radius:8px;background:rgba(255,255,255,0.03)">
          <div style="font-size:20px;font-weight:700;color:var(--text-secondary)">${DEMO_EVIDENCE_SUMMARY.grade_d}</div>
          <div style="font-size:10px;color:var(--text-secondary)">Grade D</div>
        </div>
      </div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:10px">
        Grade A = Meta-analysis / Systematic Review &nbsp;|&nbsp; Grade B = RCT &nbsp;|&nbsp; Grade C = Cohort/Observational &nbsp;|&nbsp; Grade D = Expert Opinion
      </div>
    </div>
  `;

  const pieChart = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Therapy Type Distribution</div>
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div>${_miniPieChart(DEMO_THERAPY_TYPES, 80)}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${DEMO_THERAPY_TYPES.map(t => `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px">
              <span style="width:10px;height:10px;border-radius:50%;background:${t.color};display:inline-block"></span>
              <span style="color:var(--text-secondary)">${esc(t.type)}</span>
              <span style="color:var(--text-tertiary);font-variant-numeric:tabular-nums">(${t.count})</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  const patientRows = patients.map(p => {
    const sevTint = (p.safety_alerts || 0) > 0
      ? 'border-left:3px solid var(--red)' : 'border-left:3px solid var(--green)';
    return `<tr data-patient-id="${esc(p.patient_id)}" tabindex="0" role="button" style="cursor:pointer;${sevTint}"
      onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background='transparent'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500;font-size:12px">${esc(p.patient_name)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;text-align:center">${p.active_therapies}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px">${esc(p.primary_therapy)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(p.last_session)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;text-align:center;font-variant-numeric:tabular-nums">${p.sessions_this_week}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:12px;text-align:center;font-variant-numeric:tabular-nums">${p.pro_score}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">${p.safety_alerts > 0 ? `<span style="color:var(--red);font-weight:700">${p.safety_alerts}</span>` : '<span style="color:var(--green)">✓</span>'}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);text-align:right">
        <button type="button" class="btn btn-ghost btn-sm" data-action="open-patient" data-patient-id="${esc(p.patient_id)}" style="min-height:36px">View</button>
      </td>
    </tr>`;
  }).join('');

  const patientTable = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto;margin-top:14px">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Patients with Active Complementary Therapies</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Patient</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Active</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Primary Therapy</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Last Session</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">This Week</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">PRO Score</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)">Alerts</th>
            <th style="padding:8px 10px;text-align:right;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border)"></th>
          </tr>
        </thead>
        <tbody>${patientRows}</tbody>
      </table>
    </div>
  `;

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;flex-wrap:wrap;gap:12px">${kpis}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      ${pieChart}
      ${evidenceSummary}
    </div>
    ${patientTable}
  </div>`;
}

/** ================================================================== */
/*  2. ACUPUNCTURE MODULE                                              */
/** ================================================================== */
function _renderAcupuncture(state) {
  const patientSelect = _renderPatientSelect('acu-patient');
  const history = DEMO_ACUPUNCTURE_HISTORY;

  const bodyMap = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Point Reference (Anterior View)</div>
      <pre style="font-size:10px;line-height:1.4;color:var(--text-secondary);overflow:auto;background:rgba(255,255,255,.02);padding:10px;border-radius:8px;border:1px solid var(--border)">
        Yintang (EX-HN3)
            ●
           / \\
    LI20 ●     ● LI20
         |  DU24  |
    ST1  ●   |    ● ST1
         |   |    |
    ---LU1 ●  |   ● LU1---
        /   CV17    \\
    LU2 ●    ●     ● LU2
       /     |      \\
   LI15 ●  CV14  ● LI15
      /      |       \\
  LI14 ●   CV12    ● LI14
     /       |        \\
  PC1 ●    CV10     ● PC1
    /        |         \\
   HT1 ●   CV6       ● HT1
       \\     ● CV4    /
    SP15 ●    |      ● SP15
        \\   CV3     /
     ST30 ●   |    ● ST30
          \\  ● CV2 /
           \\ | | /
            SP6 LR8
           ●     ●
            \\\\ | //
             \\|/
             LR1
              ●
      </pre>
      <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px">
        Common points: LI4 (Hegu), LV3 (Taichong), SP6 (Sanyinjiao), PC6 (Neiguan), HT7 (Shenmen), ST36 (Zusanli), GB20 (Fengchi), Yintang (EX-HN3).<br>
        <strong>Meridians:</strong> LU = Lung, LI = Large Intestine, ST = Stomach, SP = Spleen, HT = Heart, PC = Pericardium, LR = Liver, GB = Gallbladder, CV = Conception Vessel, DU = Governing Vessel.
      </div>
    </div>
  `;

  const sessionForm = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Log Acupuncture Session</div>
      <form data-form="acupuncture" style="display:flex;flex-direction:column;gap:12px">
        ${patientSelect}
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Date
            <input type="date" name="session_date" class="form-control" value="${_todayInput()}" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Number
            <input type="number" name="session_number" class="form-control" value="1" min="1" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Points Used (comma-separated)
          <input type="text" name="points" class="form-control" placeholder="e.g., LI4, LV3, SP6, Yintang" style="min-height:40px">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Condition Treated
          <input type="text" name="condition" class="form-control" placeholder="e.g., Generalized Anxiety" style="min-height:40px">
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Pain VAS Before (0-10)
            <input type="number" name="pain_vas_before" class="form-control" min="0" max="10" value="5" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Pain VAS After (0-10)
            <input type="number" name="pain_vas_after" class="form-control" min="0" max="10" value="3" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Duration (min)
            <input type="number" name="duration_min" class="form-control" value="30" min="5" style="min-height:40px">
          </label>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:12px">
          <input type="checkbox" name="deqi_achieved" id="deqi-check" checked style="width:16px;height:16px">
          <label for="deqi-check" style="color:var(--text-secondary);cursor:pointer">Deqi achieved</label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Notes
          <textarea name="notes" class="form-control" rows="3" placeholder="Needling notes: depth, sensation, response..." style="resize:vertical"></textarea>
        </label>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Log Session</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-form" style="min-height:40px">Clear</button>
        </div>
      </form>
      ${_qualifiedPractitionerWarning('Acupuncture')}
    </div>
  `;

  const contraindications = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Contraindication Checker</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="padding:8px;border-radius:6px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.20)">
          <strong style="color:var(--red)">Absolute:</strong> Severe bleeding disorder (hemophilia), anticoagulant therapy without monitoring, local infection at needle site
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,176,87,0.08);border:1px solid rgba(255,176,87,0.20)">
          <strong style="color:var(--amber)">Caution:</strong> Pregnancy (avoid LI4, SP6, BL60), pacemaker, seizure disorder, needle phobia
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.18)">
          <strong style="color:var(--blue)">Relative:</strong> Diabetes (slow healing), immunocompromised, history of vasovagal response
        </div>
      </div>
    </div>
  `;

  const evidenceDisplay = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Evidence by Condition</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Condition</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Key Trials</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Chronic Low Back Pain</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('A')}</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Vickers et al. 2018 Arch Int Med (n=20,827)</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Generalized Anxiety</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Goyata et al. 2016, RCT (n=120)</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Migraine Prophylaxis</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Linde et al. 2016 Cochrane (n>4,000)</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Depression</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">MacPherson et al. 2013 PLOS Medicine</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Insomnia</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('C')}</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Cao et al. 2019, systematic review</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Osteoarthritis Knee</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('A')}</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Corbett et al. 2013 meta-analysis</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  const historyTable = history.length ? `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto;margin-top:14px">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Session History</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:700px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Date</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">#</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Points</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Condition</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">VAS ↓</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Deqi</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${history.map(h => {
            const vasChange = (h.pain_vas_before || 0) - (h.pain_vas_after || 0);
            const vasColor = vasChange >= 3 ? 'var(--green)' : vasChange >= 1 ? 'var(--teal)' : 'var(--amber)';
            return `<tr>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.session_date)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.session_number}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px">${esc(h.points)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.condition)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;font-variant-numeric:tabular-nums;color:${vasColor}">${h.pain_vas_before}→${h.pain_vas_after}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.deqi_achieved ? '✓' : '✗'}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.notes)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${sessionForm}
      ${bodyMap}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      ${contraindications}
      ${evidenceDisplay}
    </div>
    ${historyTable}
  </div>`;
}

/** ================================================================== */
/*  3. NEUROFEEDBACK / BIOFEEDBACK MODULE                              */
/** ================================================================== */
function _renderNeurofeedback(state) {
  const patientSelect = _renderPatientSelect('nf-patient');
  const protocols = [
    { key: 'smr', label: 'SMR (12-15 Hz)', site: 'C4', condition: 'ADHD, Epilepsy', evidence: 'B' },
    { key: 'alpha_theta', label: 'Alpha-Theta', site: 'Pz', condition: 'PTSD, Addiction', evidence: 'B' },
    { key: 'scp', label: 'SCP (Slow Cortical Potential)', site: 'Cz', condition: 'ADHD, Epilepsy', evidence: 'A' },
    { key: 'beta_up', label: 'Beta Up / Theta Down', site: 'C3', condition: 'ADHD', evidence: 'B' },
    { key: 'alpha_asym', label: 'Alpha Asymmetry', site: 'Fp1/Fp2', condition: 'Depression', evidence: 'C' },
    { key: 'hrv', label: 'HRV Biofeedback', site: '—', condition: 'Anxiety, Hypertension', evidence: 'B' },
  ];

  const protocolOptions = protocols.map(p =>
    `<option value="${esc(p.key)}">${esc(p.label)} — ${esc(p.site)} — ${esc(p.condition)} — Evidence: ${p.evidence}</option>`
  ).join('');

  const eegBandsSim = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Simulated EEG Display (Live Training View)</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${[
          { band: 'Delta (0.5-4 Hz)', amp: 45, color: '#60a5fa' },
          { band: 'Theta (4-8 Hz)', amp: 32, color: '#a78bfa' },
          { band: 'Alpha (8-13 Hz)', amp: 18, color: '#34d399' },
          { band: 'SMR / Low Beta (12-15 Hz)', amp: 8, color: '#fbbf24' },
          { band: 'High Beta (15-30 Hz)', amp: 12, color: '#f472b6' },
          { band: 'Gamma (30-50 Hz)', amp: 3, color: '#fb923c' },
        ].map(b => `
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:140px;font-size:10px;color:var(--text-secondary);text-align:right">${esc(b.band)}</div>
            <div style="flex:1;height:16px;border-radius:4px;background:rgba(255,255,255,.04);overflow:hidden">
              <div style="height:100%;width:${b.amp}%;background:${b.color};border-radius:4px;opacity:0.8;transition:width 0.5s"></div>
            </div>
            <div style="width:40px;font-size:10px;color:var(--text-tertiary);font-variant-numeric:tabular-nums">${b.amp} μV</div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:10px;padding:8px;border-radius:6px;background:rgba(45,212,191,0.08);font-size:11px;color:var(--text-secondary)">
        <strong style="color:var(--teal)">Reward zone:</strong> When SMR amplitude exceeds threshold, auditory/visual reward is delivered. This is a simulated display for documentation purposes.
      </div>
    </div>
  `;

  const sessionForm = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Log Neurofeedback Session</div>
      <form data-form="neurofeedback" style="display:flex;flex-direction:column;gap:12px">
        ${patientSelect}
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Date
            <input type="date" name="session_date" class="form-control" value="${_todayInput()}" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Number
            <input type="number" name="session_number" class="form-control" value="1" min="1" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Protocol
          <select name="protocol" class="form-control" style="min-height:40px">
            <option value="">Select protocol...</option>
            ${protocolOptions}
          </select>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Electrode Site
            <input type="text" name="site" class="form-control" placeholder="e.g., C4" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Duration (min)
            <input type="number" name="duration_min" class="form-control" value="30" min="5" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Threshold (μV)
            <input type="number" name="threshold" class="form-control" value="2.5" step="0.1" style="min-height:40px">
          </label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Reward Ratio (%)
            <input type="number" name="reward_ratio" class="form-control" value="65" min="0" max="100" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Artifact (%)
            <input type="number" name="artifact_pct" class="form-control" value="5" min="0" max="100" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Notes
          <textarea name="notes" class="form-control" rows="3" placeholder="Session observations..." style="resize:vertical"></textarea>
        </label>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Log Session</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-form" style="min-height:40px">Clear</button>
        </div>
      </form>
    </div>
  `;

  const trainingPlan = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Standard Training Plan Template (40-Session)</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Phase</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Sessions</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Frequency</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Focus</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Assessment</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Initial</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">1-2</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">1x / week</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Baseline QEEG, symptom scales, threshold setting</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">TQ, CAARS, CGI-S</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Acute</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">3-20</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">2x / week</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Core training, threshold adjustment, skill acquisition</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Every 5 sessions</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Consolidation</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">21-30</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">1-2x / week</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Generalization, fading feedback</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Session 20, 30</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Maintenance</td>
            <td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">31-40</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">1x / week → 1x / 2wk</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Transfer, booster planning</td>
            <td style="padding:8px;border-bottom:1px solid var(--border)">Session 40 (post-TQ)</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  const progressChart = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Progress Overview (Demo)</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Reward Ratio Trend (last 12 sessions)</div>
          ${_sparkline([55, 58, 52, 60, 63, 61, 65, 68, 70, 72, 65, 78], { color: 'var(--teal)' })}
        </div>
        <div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Artifact % (lower is better)</div>
          ${_sparkline([12, 10, 9, 8, 7, 8, 6, 7, 5, 6, 8, 5], { color: 'var(--blue)' })}
        </div>
      </div>
    </div>
  `;

  const evidenceDisplay = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Evidence by Protocol</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Protocol</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Key Reference</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">SMR for ADHD</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Arns et al. 2014 EEG &amp; Clin Neuro</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">SCP for ADHD</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('A')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Strehl et al. 2006 J Clin Neurophys</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Alpha-Theta for PTSD</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Peniston &amp; Kulkosky 1991</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">HRV Biofeedback</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Lehrer &amp; Gevirtz 2014 Biofeedback</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Alpha Asymmetry for Depression</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('C')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Choi et al. 2011 Neurosci Lett</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const historyTable = DEMO_NEUROFEEDBACK_HISTORY.length ? `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto;margin-top:14px">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Session History</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:700px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Date</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">#</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Protocol</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Site</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Dur.</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Reward</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Artifact</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${DEMO_NEUROFEEDBACK_HISTORY.map(h => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.session_date)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.session_number}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.protocol)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${esc(h.site)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.duration_min}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;font-variant-numeric:tabular-nums;color:${(h.reward_ratio || 0) >= 70 ? 'var(--green)' : (h.reward_ratio || 0) >= 55 ? 'var(--teal)' : 'var(--amber)'}">${h.reward_ratio}%</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.artifact_pct}%</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.notes)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${sessionForm}
      ${eegBandsSim}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      ${trainingPlan}
      ${progressChart}
    </div>
    ${evidenceDisplay}
    ${historyTable}
  </div>`;
}

/** ================================================================== */
/*  4. CRANIAL ELECTROTHERAPY STIMULATION (CES)                        */
/** ================================================================== */
function _renderCES(state) {
  const patientSelect = _renderPatientSelect('ces-patient');

  const sessionForm = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Log CES Session</div>
      <form data-form="ces" style="display:flex;flex-direction:column;gap:12px">
        ${patientSelect}
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Date
            <input type="date" name="session_date" class="form-control" value="${_todayInput()}" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Time
            <input type="time" name="session_time" class="form-control" value="20:00" style="min-height:40px">
          </label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Current (μA)
            <select name="current_ua" class="form-control" style="min-height:40px">
              <option value="100">100 μA (standard)</option>
              <option value="200">200 μA</option>
              <option value="400">400 μA</option>
              <option value="600">600 μA</option>
            </select>
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Frequency (Hz)
            <select name="frequency_hz" class="form-control" style="min-height:40px">
              <option value="0.5">0.5 Hz (delta)</option>
              <option value="100">100 Hz</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Duration (min)
            <select name="duration_min" class="form-control" style="min-height:40px">
              <option value="20">20 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
            </select>
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Electrode Placement
          <select name="earclips" class="form-control" style="min-height:40px">
            <option value="bilateral">Bilateral earclips</option>
            <option value="bilateral_lobes">Bilateral earlobes (clip)</option>
            <option value="mastoid">Mastoid placement</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Patient Response
          <textarea name="response" class="form-control" rows="2" placeholder="How did the patient respond?" style="resize:vertical"></textarea>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Side Effects
          <textarea name="side_effects" class="form-control" rows="2" placeholder="Any side effects?" style="resize:vertical"></textarea>
        </label>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Log Session</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-form" style="min-height:40px">Clear</button>
        </div>
      </form>
    </div>
  `;

  const deviceSettings = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Device Reference</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <tbody>
          <tr><td style="padding:6px 0;border-bottom:1px solid var(--border);color:var(--text-secondary);width:50%">FDA Classification</td><td style="padding:6px 0;border-bottom:1px solid var(--border);font-weight:500">Class III (prescription)</td></tr>
          <tr><td style="padding:6px 0;border-bottom:1px solid var(--border);color:var(--text-secondary)">Typical Current</td><td style="padding:6px 0;border-bottom:1px solid var(--border);font-weight:500">100 – 600 μA</td></tr>
          <tr><td style="padding:6px 0;border-bottom:1px solid var(--border);color:var(--text-secondary)">Frequencies</td><td style="padding:6px 0;border-bottom:1px solid var(--border);font-weight:500">0.5 Hz or 100 Hz</td></tr>
          <tr><td style="padding:6px 0;border-bottom:1px solid var(--border);color:var(--text-secondary)">Session Duration</td><td style="padding:6px 0;border-bottom:1px solid var(--border);font-weight:500">20 – 60 min daily</td></tr>
          <tr><td style="padding:6px 0;border-bottom:1px solid var(--border);color:var(--text-secondary)">Onset of Effect</td><td style="padding:6px 0;border-bottom:1px solid var(--border);font-weight:500">1 – 2 weeks</td></tr>
          <tr><td style="padding:6px 0;color:var(--text-secondary)">Course Duration</td><td style="padding:6px 0;font-weight:500">2 – 6 weeks</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const contraindications = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Contraindications &amp; Warnings</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="padding:8px;border-radius:6px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.20)">
          <strong style="color:var(--red)">Contraindicated:</strong> Implanted pacemaker/ICD, insulin pump, implanted defibrillator — current may interfere with device function.
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,176,87,0.08);border:1px solid rgba(255,176,87,0.20)">
          <strong style="color:var(--amber)">Caution:</strong> Pregnancy (insufficient safety data), epilepsy, active skin lesions at electrode site.
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.18)">
          <strong style="color:var(--blue)">Monitor:</strong> Concurrent use with CNS-active medications (benzodiazepines, SSRIs) — additive sedative effects possible.
        </div>
      </div>
    </div>
  `;

  const evidenceDisplay = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Evidence Summary</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Condition</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Key Reference</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Generalized Anxiety</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Bystritsky et al. 2008 J Clin Psychiatry</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Insomnia</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Lande &amp; Gragnani 2013 JRRD</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Depression</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('C')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Shealy et al. 1989 (pilot studies)</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">PTSD</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('C')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Rohan et al. 2014 (open-label)</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const dailyProtocol = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Daily Use Protocol (4-Week)</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">
        <strong>Week 1:</strong> 20 min daily at 100 μA, 0.5 Hz, bilateral earclips. Patient keeps sleep diary and anxiety log.<br>
        <strong>Week 2:</strong> Continue daily. If no improvement, consider increasing to 200 μA or switching to 100 Hz.<br>
        <strong>Week 3:</strong> If partial response, increase to 30-45 min. Maintain daily consistency.<br>
        <strong>Week 4:</strong> Assess with GAD-7 and ISI. Plan taper or continuation based on response. Many patients benefit from ongoing maintenance (3-5x/week).
      </div>
    </div>
  `;

  const historyTable = DEMO_CES_HISTORY.length ? `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto;margin-top:14px">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Session History</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:650px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Date</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Current</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Freq</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Dur</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Placement</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Response</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Side Effects</th>
          </tr>
        </thead>
        <tbody>
          ${DEMO_CES_HISTORY.map(h => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.session_date)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.current_ua} μA</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.frequency_hz} Hz</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.duration_min}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.earclips)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.response)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.side_effects)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${sessionForm}
      ${deviceSettings}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      ${contraindications}
      ${evidenceDisplay}
      ${dailyProtocol}
    </div>
    ${historyTable}
  </div>`;
}

/** ================================================================== */
/*  5. PHOTOBIOMODULATION (tPBM)                                       */
/** ================================================================== */
function _renderPBM(state) {
  const patientSelect = _renderPatientSelect('pbm-patient');

  const brainSites = [
    { label: 'Left Prefrontal (F3)', target: 'Left DLPFC', note: 'Mood, executive function' },
    { label: 'Right Prefrontal (F4)', target: 'Right DLPFC', note: 'Anxiety, approach motivation' },
    { label: 'Vertex (Cz)', target: 'SMA', note: 'Motor planning, fatigue' },
    { label: 'Left Temporal (T3)', target: 'Left temporal', note: 'Memory, language' },
    { label: 'Right Temporal (T4)', target: 'Right temporal', note: 'Memory, auditory processing' },
    { label: 'Occipital (Oz)', target: 'Visual cortex', note: 'Sleep, headache' },
  ];

  const sessionForm = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Log tPBM Session</div>
      <form data-form="pbm" style="display:flex;flex-direction:column;gap:12px">
        ${patientSelect}
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Date
            <input type="date" name="session_date" class="form-control" value="${_todayInput()}" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Wavelength (nm)
            <select name="wavelength_nm" class="form-control" style="min-height:40px">
              <option value="810">810 nm (near-IR)</option>
              <option value="1064">1064 nm (near-IR)</option>
              <option value="630">630 nm (red)</option>
              <option value="660">660 nm (red)</option>
            </select>
          </label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Power Density (mW/cm²)
            <input type="number" name="power_density" class="form-control" value="250" min="10" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Dose (J/cm²)
            <input type="number" name="dose" class="form-control" value="60" min="1" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Duration (min)
            <input type="number" name="duration_min" class="form-control" value="4" min="1" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Treatment Site
          <select name="site" class="form-control" style="min-height:40px">
            <option value="">Select site...</option>
            ${brainSites.map(s => `<option value="${esc(s.label)}">${esc(s.label)} — ${esc(s.target)} — ${esc(s.note)}</option>`).join('')}
          </select>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Symptom Score Before (0-10)
            <input type="number" name="before_score" class="form-control" min="0" max="10" value="5" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Symptom Score After (0-10)
            <input type="number" name="after_score" class="form-control" min="0" max="10" value="4" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Notes
          <textarea name="notes" class="form-control" rows="2" placeholder="Patient response, any observations..." style="resize:vertical"></textarea>
        </label>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Log Session</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-form" style="min-height:40px">Clear</button>
        </div>
      </form>
    </div>
  `;

  const sitesReference = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Treatment Sites Reference</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Site</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Target</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Indication</th>
          </tr>
        </thead>
        <tbody>
          ${brainSites.map(s => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid var(--border);font-weight:500">${esc(s.label)}</td>
              <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-secondary)">${esc(s.target)}</td>
              <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">${esc(s.note)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const safetyPanel = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Safety Protocols</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="padding:8px;border-radius:6px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.20)">
          <strong style="color:var(--red)">Eye Protection:</strong> Patient and operator must wear appropriate wavelength-specific protective goggles during all tPBM sessions.
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,176,87,0.08);border:1px solid rgba(255,176,87,0.20)">
          <strong style="color:var(--amber)">Thyroid Avoidance:</strong> Do not direct near-IR light over the thyroid gland (anterior neck). Use cervical collar protection if treating nearby sites.
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,176,87,0.08);border:1px solid rgba(255,176,87,0.20)">
          <strong style="color:var(--amber)">Photosensitivity:</strong> Caution with photosensitizing medications (tetracyclines, psoralens, some chemotherapeutics).
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.18)">
          <strong style="color:var(--blue)">Tumor Precaution:</strong> Do not treat over known malignancies. Use caution in patients with history of skin cancer at treatment site.
        </div>
      </div>
    </div>
  `;

  const evidenceDisplay = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Evidence Summary</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Condition</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Key Reference</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Major Depression</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Cassano et al. 2018 Psych Res &amp; Neuro</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">TBI / Post-concussion</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Naeser et al. 2014 PBM</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Cognitive Decline / MCI</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('C')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Saltmarche et al. 2017 PBM</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Anxiety Disorders</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('C')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Disner et al. 2016 pilot</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Chronic Pain</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Chow et al. 2009 Lancet (LLLT)</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const historyTable = DEMO_PBM_HISTORY.length ? `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto;margin-top:14px">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Session History</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:650px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Date</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">λ (nm)</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Power</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Dose</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Site</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Score ↓</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${DEMO_PBM_HISTORY.map(h => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.session_date)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.wavelength_nm}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.power_density_mw_cm2}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.dose_j_cm2}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.site)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.before_score}→${h.after_score}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.notes)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${sessionForm}
      ${sitesReference}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      ${safetyPanel}
      ${evidenceDisplay}
    </div>
    ${historyTable}
  </div>`;
}

/** ================================================================== */
/*  6. MIND-BODY PRACTICES MODULE                                      */
/** ================================================================== */
function _renderMindBody(state) {
  const patientSelect = _renderPatientSelect('mb-patient');
  const meditationTypes = ['mindfulness', 'body_scan', 'loving_kindness', 'transcendental', 'guided_imagery', 'zen', 'other'];
  const yogaStyles = ['hatha', 'vinyasa', 'yin', 'restorative', 'iyengar', 'kundalini', 'gentle'];
  const taiChiForms = ['yang_24', 'yang_108', 'chen', 'sun', 'wu', 'simplified_8'];
  const breathingTypes = ['4-7-8', 'box', 'coherent_5.5', 'alternate_nostril', 'buteyko', 'wim_hof', 'paced'];

  const sessionForm = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Log Mind-Body Session</div>
      <form data-form="mindbody" style="display:flex;flex-direction:column;gap:12px">
        ${patientSelect}
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Practice Type
          <select name="type" class="form-control" id="mb-type-select" style="min-height:40px">
            <option value="">Select type...</option>
            <option value="meditation">Meditation</option>
            <option value="yoga">Yoga</option>
            <option value="tai_chi">Tai Chi</option>
            <option value="breathing">Breathing Exercise</option>
            <option value="mindfulness">General Mindfulness</option>
            <option value="qigong">Qigong</option>
          </select>
        </label>
        <div id="mb-subtype-container" style="display:none">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            <span id="mb-subtype-label">Subtype</span>
            <select name="subtype" class="form-control" id="mb-subtype-select" style="min-height:40px">
              <option value="">Select...</option>
            </select>
          </label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Date
            <input type="date" name="session_date" class="form-control" value="${_todayInput()}" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Duration (min)
            <input type="number" name="duration_min" class="form-control" value="20" min="1" style="min-height:40px">
          </label>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:12px">
          <input type="checkbox" name="guided" id="mb-guided" style="width:16px;height:16px">
          <label for="mb-guided" style="color:var(--text-secondary);cursor:pointer">Guided / Instructor-led</label>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            HRV Before (if measured)
            <input type="number" name="hrv_before" class="form-control" placeholder="RMSSD" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            HRV After (if measured)
            <input type="number" name="hrv_after" class="form-control" placeholder="RMSSD" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Notes
          <textarea name="notes" class="form-control" rows="2" placeholder="Patient experience, observations..." style="resize:vertical"></textarea>
        </label>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Log Session</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-form" style="min-height:40px">Clear</button>
        </div>
      </form>
    </div>
  `;

  const weeklyTracker = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Weekly Mindfulness Minutes</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => {
          const mins = [20, 30, 0, 45, 20, 60, 30][i];
          const barW = Math.min(100, (mins / 60) * 100);
          return `<div style="display:flex;align-items:center;gap:8px">
            <div style="width:36px;font-size:11px;color:var(--text-secondary)">${day}</div>
            <div style="flex:1;height:18px;border-radius:4px;background:rgba(255,255,255,.04);overflow:hidden">
              <div style="height:100%;width:${barW}%;background:${mins > 0 ? 'var(--teal)' : 'transparent'};border-radius:4px;opacity:0.7"></div>
            </div>
            <div style="width:40px;font-size:11px;color:var(--text-tertiary);text-align:right;font-variant-numeric:tabular-nums">${mins > 0 ? mins + '\'' : '—'}</div>
          </div>`;
        }).join('')}
        <div style="margin-top:6px;padding-top:8px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--text-secondary)">Weekly Total: <strong style="color:var(--teal)">205 minutes</strong></span>
          <span style="color:var(--text-tertiary)">Trend: ↑ 12% vs last week</span>
        </div>
      </div>
    </div>
  `;

  const evidenceDisplay = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Evidence by Modality</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Modality</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Key Reference</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Mindfulness Meditation (MBSR)</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('A')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Goyal et al. 2014 JAMA Int Med meta-analysis</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Yoga for Anxiety/Depression</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Cramer et al. 2013 Dtsch Arztebl Int</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Tai Chi for Fall Prevention</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('A')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Wayne et al. 2014 J Gerontol A</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Breathwork for Stress</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Zaccaro et al. 2018 Front Psych</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Tai Chi for Fibromyalgia</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Wang et al. 2010 NEJM</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Qigong for Hypertension</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('C')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Lee et al. 2007 J Hypertens</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const historyTable = DEMO_MINDBODY_HISTORY.length ? `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto;margin-top:14px">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Session History</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:650px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Date</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Type</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Subtype</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Dur</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Guided</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">HRV ↑</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${DEMO_MINDBODY_HISTORY.map(h => {
            const hrvChange = (h.hrv_after || 0) - (h.hrv_before || 0);
            return `<tr>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.session_date)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-transform:capitalize">${esc(h.type)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">${esc(h.subtype)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.duration_min}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.guided ? '✓' : '✗'}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;color:${hrvChange > 5 ? 'var(--green)' : 'var(--teal)'}">${h.hrv_before}→${h.hrv_after}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.notes)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${sessionForm}
      ${weeklyTracker}
    </div>
    ${evidenceDisplay}
    ${historyTable}
  </div>`;
}

/** ================================================================== */
/*  7. MASSAGE & BODYWORK MODULE                                       */
/** ================================================================== */
function _renderMassage(state) {
  const patientSelect = _renderPatientSelect('mass-patient');
  const massageTypes = ['Swedish', 'Deep Tissue', 'Myofascial Release', 'Trigger Point', 'Sports', 'Craniosacral', 'Lymphatic Drainage', 'Reflexology', 'Hot Stone', 'Shiatsu'];
  const bodyAreas = ['Full body', 'Back', 'Neck & shoulders', 'Lower back', 'Legs', 'Arms', 'Head & face', 'Feet'];
  const pressureLevels = ['very_light', 'light', 'moderate', 'firm', 'deep'];

  const sessionForm = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Log Massage / Bodywork Session</div>
      <form data-form="massage" style="display:flex;flex-direction:column;gap:12px">
        ${patientSelect}
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Date
            <input type="date" name="session_date" class="form-control" value="${_todayInput()}" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Duration (min)
            <input type="number" name="duration_min" class="form-control" value="60" min="5" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Massage Type
          <select name="type" class="form-control" style="min-height:40px">
            <option value="">Select type...</option>
            ${massageTypes.map(t => `<option value="${esc(t.toLowerCase().replace(/\s/g, '_'))}">${esc(t)}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Areas Worked
          <select name="areas" class="form-control" multiple size="3" style="min-height:60px">
            ${bodyAreas.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}
          </select>
          <span style="font-size:10px;color:var(--text-tertiary)">Hold Ctrl/Cmd to select multiple</span>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Pressure Level
          <select name="pressure" class="form-control" style="min-height:40px">
            ${pressureLevels.map(p => `<option value="${esc(p)}">${esc(p.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()))}</option>`).join('')}
          </select>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Pain Before (0-10)
            <input type="number" name="pain_before" class="form-control" min="0" max="10" value="5" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Pain After (0-10)
            <input type="number" name="pain_after" class="form-control" min="0" max="10" value="3" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:120px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Relaxation (1-10)
            <input type="number" name="relaxation_score" class="form-control" min="1" max="10" value="7" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Range of Motion Changes
          <textarea name="rom_change" class="form-control" rows="2" placeholder="e.g., Improved cervical rotation bilaterally" style="resize:vertical"></textarea>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Treatment Goals
          <textarea name="goals" class="form-control" rows="2" placeholder="Short-term and long-term goals..." style="resize:vertical"></textarea>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Notes
          <textarea name="notes" class="form-control" rows="2" placeholder="Session observations..." style="resize:vertical"></textarea>
        </label>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Log Session</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-form" style="min-height:40px">Clear</button>
        </div>
      </form>
      ${_qualifiedPractitionerWarning('Massage and bodywork therapy')}
    </div>
  `;

  const contraindications = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Contraindications</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="padding:8px;border-radius:6px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.20)">
          <strong style="color:var(--red)">Absolute:</strong> Acute thrombosis, severe osteoporosis (spinal), open wounds, acute infection, uncontrolled hypertension (deep tissue)
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,176,87,0.08);border:1px solid rgba(255,176,87,0.20)">
          <strong style="color:var(--amber)">Caution:</strong> Pregnancy (positioning, pressure points), recent surgery, anticoagulant therapy, cancer (lymphedema risk)
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.18)">
          <strong style="color:var(--blue)">Area-Specific:</strong> Avoid deep abdominal work in pregnancy; avoid direct pressure over acute inflammation, varicose veins, or pacemaker site.
        </div>
      </div>
    </div>
  `;

  const evidenceDisplay = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Evidence Summary</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Condition</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Key Reference</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Chronic Low Back Pain</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('A')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Cherkin et al. 2011 Ann Int Med</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Neck Pain</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('A')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Sherman et al. 2009 PLOS One</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Anxiety / Relaxation</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Moyer et al. 2004 JAP</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Cancer-related Pain</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Wilkinson et al. 2008 Cochrane</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Headache / Migraine</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Chaibi et al. 2011 Eur J Neurol</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const historyTable = DEMO_MASSAGE_HISTORY.length ? `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto;margin-top:14px">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Session History</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:650px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Date</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Type</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Dur</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Areas</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Pressure</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Pain ↓</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${DEMO_MASSAGE_HISTORY.map(h => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.session_date)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.type)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.duration_min}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px">${esc(h.areas)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;text-transform:capitalize">${esc(h.pressure)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.pain_before}→${h.pain_after}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.notes)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${sessionForm}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      ${contraindications}
      ${evidenceDisplay}
    </div>
    ${historyTable}
  </div>`;
}

/** ================================================================== */
/*  8. MUSIC & ART THERAPY MODULE                                      */
/** ================================================================== */
function _renderMusicArt(state) {
  const patientSelect = _renderPatientSelect('ma-patient');
  const modalities = ['music_receptive', 'music_active', 'art_drawing', 'art_painting', 'art_clay', 'art_mandala', 'art_collage', 'drama', 'movement', 'mixed'];
  const goals = ['Mood regulation', 'Anxiety reduction', 'Social engagement', 'Emotional expression', 'Cognitive stimulation', 'Pain distraction', 'Identity exploration', 'Trauma processing'];

  const sessionForm = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Log Music / Art Therapy Session</div>
      <form data-form="music-art" style="display:flex;flex-direction:column;gap:12px">
        ${patientSelect}
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Date
            <input type="date" name="session_date" class="form-control" value="${_todayInput()}" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Duration (min)
            <input type="number" name="duration_min" class="form-control" value="45" min="5" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Modality
          <select name="modality" class="form-control" style="min-height:40px">
            <option value="">Select modality...</option>
            ${modalities.map(m => `<option value="${esc(m)}">${esc(m.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</option>`).join('')}
          </select>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Session Type
            <select name="type" class="form-control" style="min-height:40px">
              <option value="active">Active (creating/participating)</option>
              <option value="receptive">Receptive (listening/viewing)</option>
            </select>
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Mood Score Before (1-10)
            <input type="number" name="mood_before" class="form-control" min="1" max="10" value="4" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Mood Score After (1-10)
            <input type="number" name="mood_after" class="form-control" min="1" max="10" value="7" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Materials / Instruments Used
          <input type="text" name="materials" class="form-control" placeholder="e.g., Acoustic guitar, watercolor, clay" style="min-height:40px">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Therapeutic Goals
          <select name="goals" class="form-control" multiple size="3" style="min-height:60px">
            ${goals.map(g => `<option value="${esc(g.toLowerCase().replace(/\s/g, '_'))}">${esc(g)}</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Engagement Score (1-10)
          <input type="number" name="engagement_score" class="form-control" min="1" max="10" value="8" style="min-height:40px">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Progress Notes
          <textarea name="notes" class="form-control" rows="3" placeholder="Therapeutic observations, patient responses, themes..." style="resize:vertical"></textarea>
        </label>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Log Session</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-form" style="min-height:40px">Clear</button>
        </div>
      </form>
      ${_qualifiedPractitionerWarning('Music and art therapy')}
    </div>
  `;

  const evidenceDisplay = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Evidence Summary</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Modality / Condition</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Key Reference</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Music Therapy for Depression</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Erkkila et al. 2011 BJPsych</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Music Therapy for Autism</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Geretsegger et al. 2014 Cochrane</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Art Therapy for PTSD</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('C')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Schouten et al. 2015 Trauma Violence Abuse</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Music for Pain (perioperative)</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('A')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Hole et al. 2015 Lancet</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Art Therapy for Cancer Patients</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Wood et al. 2011 Cancer Nurs</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid var(--border)">Active Music for Dementia</td><td style="padding:8px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill('B')}</td><td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-tertiary)">Sarkamo et al. 2008 Brain</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const historyTable = DEMO_MUSIC_ART_HISTORY.length ? `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto;margin-top:14px">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Session History</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:600px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Date</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Modality</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Type</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Dur</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Mood ↑</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Engage</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${DEMO_MUSIC_ART_HISTORY.map(h => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(h.session_date)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px">${esc(h.modality.replace(/_/g, ' '))}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center;text-transform:capitalize">${esc(h.type)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.duration_min}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.mood_before}→${h.mood_after}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${h.engagement_score}/10</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.notes)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${sessionForm}
      ${evidenceDisplay}
    </div>
    ${historyTable}
  </div>`;
}

/** ================================================================== */
/*  9. THERAPY LIBRARY                                                 */
/** ================================================================== */
const THERAPY_DATABASE = [
  { name: 'Acupuncture', category: 'acupuncture', description: 'Insertion of fine needles at specific points to modulate qi/energy flow.', mechanism: 'Gate control theory, endogenous opioid release, autonomic modulation', conditions: ['Chronic pain', 'Anxiety', 'Depression', 'Migraine', 'Insomnia', 'Nausea', 'Osteoarthritis'], evidence_grade: 'A', contraindications: ['Bleeding disorders', 'Pacemaker (electroacupuncture)', 'Pregnancy (specific points)', 'Local infection'], practitioner_req: 'Licensed acupuncturist (LAc) or equivalent' },
  { name: 'Electroacupuncture', category: 'acupuncture', description: 'Acupuncture with electrical stimulation between needle pairs.', mechanism: 'Enhanced neuromodulation via electrical impulses', conditions: ['Chronic pain', 'Post-stroke recovery', 'Sciatica'], evidence_grade: 'B', contraindications: ['Pacemaker/ICD', 'Epilepsy', 'Pregnancy'], practitioner_req: 'Licensed acupuncturist with electroacupuncture training' },
  { name: 'Auricular Acupuncture', category: 'acupuncture', description: 'Needling or seeding specific points on the ear corresponding to body organs.', mechanism: 'Vagal nerve stimulation via auricular branches', conditions: ['Addiction', 'Anxiety', 'Pain', 'Obesity'], evidence_grade: 'B', contraindications: ['Ear infection', 'Skin lesions on ear'], practitioner_req: 'Licensed acupuncturist' },
  { name: 'Scalp Acupuncture', category: 'acupuncture', description: 'Needling along specific lines on the scalp corresponding to CNS functions.', mechanism: 'Direct CNS modulation via scalp-neuro-axis', conditions: ['Stroke recovery', 'Paralysis', 'Parkinsons', 'MS'], evidence_grade: 'C', contraindications: ['Head trauma', 'Scalp infection', 'Severe hypertension'], practitioner_req: 'Licensed acupuncturist with neurological training' },
  { name: 'Moxibustion', category: 'acupuncture', description: 'Burning of mugwort (Artemisia) near acupuncture points for thermal stimulation.', mechanism: 'Heat therapy, immune modulation, circulation enhancement', conditions: ['Breech presentation', 'Osteoarthritis', 'Digestive disorders'], evidence_grade: 'B', contraindications: ['Heat-sensitive conditions', 'Open wounds', 'Respiratory conditions (smoke)'], practitioner_req: 'Licensed acupuncturist' },
  { name: 'Cupping Therapy', category: 'acupuncture', description: 'Application of suction cups to skin for myofascial decompression.', mechanism: 'Increased local blood flow, myofascial release', conditions: ['Muscle pain', 'Respiratory conditions', 'Inflammation'], evidence_grade: 'C', contraindications: ['Bleeding disorders', 'Skin ulcers', 'Pregnancy (abdomen/lumbar)'], practitioner_req: 'Licensed practitioner' },
  { name: 'SMR Neurofeedback', category: 'biofeedback', description: 'Training to enhance sensorimotor rhythm (12-15 Hz) over sensorimotor cortex.', mechanism: 'Operant conditioning of EEG activity, thalamocortical loop stabilization', conditions: ['ADHD', 'Epilepsy', 'Sleep-onset insomnia'], evidence_grade: 'B', contraindications: ['Severe psychiatric instability', 'Active psychosis'], practitioner_req: 'BCIA-certified neurofeedback practitioner' },
  { name: 'Alpha-Theta Training', category: 'biofeedback', description: 'Training to increase alpha/theta ratio for deep relaxation and access to subconscious.', mechanism: 'Limbic system modulation, state-dependent learning', conditions: ['PTSD', 'Addiction', 'Performance anxiety', 'Creativity blocks'], evidence_grade: 'B', contraindications: ['Epilepsy (theta can trigger)', 'Dissociative disorders'], practitioner_req: 'BCIA-certified neurofeedback practitioner' },
  { name: 'SCP Neurofeedback', category: 'biofeedback', description: 'Slow cortical potential training for self-regulation of cortical excitability.', mechanism: 'Direct cortical excitability modulation', conditions: ['ADHD', 'Epilepsy', 'Migraine'], evidence_grade: 'A', contraindications: ['Severe psychiatric instability'], practitioner_req: 'BCIA-certified neurofeedback practitioner' },
  { name: 'HRV Biofeedback', category: 'biofeedback', description: 'Training to increase heart rate variability via paced breathing.', mechanism: 'Vagal nerve strengthening, autonomic balance restoration', conditions: ['Anxiety', 'Hypertension', 'Chronic pain', 'Depression', 'Asthma'], evidence_grade: 'B', contraindications: ['Severe cardiac arrhythmia', 'Unstable angina'], practitioner_req: 'BCIA-certified or trained clinician' },
  { name: 'EMG Biofeedback', category: 'biofeedback', description: 'Surface electromyography feedback for muscle tension awareness and control.', mechanism: 'Muscle tension awareness, motor learning', conditions: ['Tension headache', 'TMD', 'Chronic pain', 'Muscle re-education'], evidence_grade: 'B', contraindications: ['Skin breakdown at electrode sites'], practitioner_req: 'BCIA-certified or trained clinician' },
  { name: 'GSR Biofeedback', category: 'biofeedback', description: 'Galvanic skin resistance feedback for stress response training.', mechanism: 'Sympathetic arousal awareness and modulation', conditions: ['Stress', 'Anxiety', 'Hyperhidrosis'], evidence_grade: 'C', contraindications: ['Skin conditions affecting conductance'], practitioner_req: 'BCIA-certified or trained clinician' },
  { name: 'Cranial Electrotherapy Stimulation (CES)', category: 'ces', description: 'Microcurrent applied to the head via earclip electrodes.', mechanism: 'Modulation of brainstem neurotransmitter systems', conditions: ['Anxiety', 'Insomnia', 'Depression', 'PTSD'], evidence_grade: 'B', contraindications: ['Implanted pacemaker/ICD', 'Insulin pump', 'Pregnancy', 'Epilepsy'], practitioner_req: 'Prescription device; clinician oversight recommended' },
  { name: 'Transcranial Direct Current Stimulation (tDCS)', category: 'ces', description: 'Low-intensity direct current applied via scalp electrodes.', mechanism: 'Neuronal membrane polarization (anodal excitation, cathodal inhibition)', conditions: ['Depression', 'Chronic pain', 'Cognitive enhancement', 'Stroke rehab'], evidence_grade: 'B', contraindications: ['Metal implants near electrodes', 'Skin lesions', 'Epilepsy', 'Pregnancy'], practitioner_req: 'Clinician supervision; research-grade device for investigational uses' },
  { name: 'Transcranial Alternating Current Stimulation (tACS)', category: 'ces', description: 'Oscillating current applied to entrain cortical rhythms.', mechanism: 'Neural oscillation entrainment', conditions: ['Depression', 'Cognitive enhancement', 'Tinnitus'], evidence_grade: 'C', contraindications: ['Metal implants', 'Skin lesions', 'Epilepsy'], practitioner_req: 'Research/clinical specialist' },
  { name: 'Transcranial Photobiomodulation (tPBM)', category: 'pbm', description: 'Near-infrared light applied to the head for neuronal metabolic enhancement.', mechanism: 'Cytochrome c oxidase activation, increased ATP, reduced oxidative stress', conditions: ['Depression', 'TBI', 'Cognitive decline', 'Anxiety'], evidence_grade: 'B', contraindications: ['Photosensitizing medications', 'Skin cancer at site', 'Pregnancy (insufficient data)'], practitioner_req: 'Trained clinician' },
  { name: ' Peripheral Photobiomodulation', category: 'pbm', description: 'Low-level laser/light therapy applied to peripheral tissues (joints, muscles).', mechanism: 'Anti-inflammatory, tissue repair acceleration', conditions: ['Osteoarthritis', 'Muscle pain', 'Wound healing', 'Neuropathy'], evidence_grade: 'A', contraindications: ['Photosensitizing medications', 'Thyroid direct exposure', 'Eyes (without protection)'], practitioner_req: 'Trained clinician' },
  { name: 'Mindfulness-Based Stress Reduction (MBSR)', category: 'mind-body', description: '8-week structured program combining mindfulness meditation and yoga.', mechanism: 'Prefrontal-amygdala regulation, reduced HPA axis activity', conditions: ['Stress', 'Anxiety', 'Chronic pain', 'Depression relapse prevention'], evidence_grade: 'A', contraindications: ['Untreated psychosis', 'Recent trauma (may surface)'], practitioner_req: 'MBSR-certified instructor' },
  { name: 'Mindfulness-Based Cognitive Therapy (MBCT)', category: 'mind-body', description: 'MBSR adapted for depression relapse prevention with cognitive therapy elements.', mechanism: 'Decentering from ruminative thought patterns', conditions: ['Recurrent depression', 'Anxiety', 'Stress'], evidence_grade: 'A', contraindications: ['Current severe depression'], practitioner_req: 'MBCT-trained therapist' },
  { name: 'Yoga (Various Styles)', category: 'mind-body', description: 'Physical postures, breath control, and meditation practices.', mechanism: 'Autonomic regulation, vagal tone enhancement, GABA increase', conditions: ['Anxiety', 'Depression', 'Chronic pain', 'Hypertension', 'Insomnia'], evidence_grade: 'B', contraindications: ['Uncontrolled hypertension (inversions)', 'Glaucoma (inversions)', 'Recent surgery'], practitioner_req: 'Certified yoga instructor; therapeutic yoga for clinical populations' },
  { name: 'Tai Chi', category: 'mind-body', description: 'Slow, flowing martial art movements with deep breathing.', mechanism: 'Balance training, proprioception, autonomic regulation', conditions: ['Fall prevention', 'Parkinsons', 'Hypertension', 'Fibromyalgia', 'Osteoarthritis'], evidence_grade: 'A', contraindications: ['Severe balance impairment without supervision', 'Acute joint injury'], practitioner_req: 'Certified tai chi instructor' },
  { name: 'Qigong', category: 'mind-body', description: 'Coordinated body posture, movement, breathing, and meditation.', mechanism: 'Bioenergy regulation, autonomic balance', conditions: ['Hypertension', 'Chronic pain', 'Anxiety', 'Cancer-related fatigue'], evidence_grade: 'C', contraindications: ['Severe cardiovascular instability', 'Acute psychosis'], practitioner_req: 'Certified qigong instructor' },
  { name: 'Pranayama / Breathwork', category: 'mind-body', description: 'Controlled breathing techniques for physiological regulation.', mechanism: 'Vagal nerve stimulation, CO2/O2 balance, HRV enhancement', conditions: ['Anxiety', 'Stress', 'Hypertension', 'Asthma'], evidence_grade: 'B', contraindications: ['Severe COPD (caution with breath retention)', 'Unstable cardiovascular disease'], practitioner_req: 'Certified breathwork instructor or yoga therapist' },
  { name: 'Progressive Muscle Relaxation', category: 'mind-body', description: 'Systematic tensing and releasing of muscle groups.', mechanism: 'Neuromuscular tension awareness and release', conditions: ['Anxiety', 'Insomnia', 'Chronic pain', 'Hypertension'], evidence_grade: 'B', contraindications: ['Muscle injury (gentle approach needed)'], practitioner_req: 'Trained clinician or therapist' },
  { name: 'Autogenic Training', category: 'mind-body', description: 'Self-hypnosis-based relaxation technique using verbal formulas.', mechanism: 'Autonomic self-regulation via self-suggestion', conditions: ['Anxiety', 'Insomnia', 'Hypertension', 'Stress'], evidence_grade: 'B', contraindications: ['Severe depression', 'Dissociative disorders'], practitioner_req: 'Certified autogenic training instructor' },
  { name: 'Guided Imagery', category: 'mind-body', description: 'Therapeutic use of mental visualization for healing and symptom control.', mechanism: 'Psychoneuroimmunology, stress response modulation', conditions: ['Pain', 'Anxiety', 'Pre-surgical preparation', 'Cancer support'], evidence_grade: 'B', contraindications: ['Severe PTSD (imagery may trigger)', 'Psychosis'], practitioner_req: 'Trained clinician or certified practitioner' },
  { name: 'Swedish Massage', category: 'massage', description: 'Long, flowing strokes, kneading, and circular movements on superficial muscle layers.', mechanism: 'Increased circulation, parasympathetic activation, oxytocin release', conditions: ['Stress', 'Muscle tension', 'Mild pain', 'Anxiety'], evidence_grade: 'B', contraindications: ['Open wounds', 'Acute infection', 'Deep vein thrombosis'], practitioner_req: 'Licensed massage therapist (LMT)' },
  { name: 'Deep Tissue Massage', category: 'massage', description: 'Focused pressure on deeper muscle layers and connective tissue.', mechanism: 'Myofascial release, trigger point deactivation', conditions: ['Chronic pain', 'Muscle injuries', 'Postural dysfunction'], evidence_grade: 'B', contraindications: ['Osteoporosis', 'Recent surgery', 'Bleeding disorders', 'Cancer (site-specific)'], practitioner_req: 'Licensed massage therapist with advanced training' },
  { name: 'Trigger Point Therapy', category: 'massage', description: 'Sustained pressure on hyperirritable nodules in muscle tissue.', mechanism: 'Neuromuscular reset, local blood flow increase', conditions: ['Myofascial pain syndrome', 'Tension headache', 'Referred pain'], evidence_grade: 'B', contraindications: ['Acute inflammation', 'Neuropathy at site'], practitioner_req: 'Licensed massage therapist or physical therapist' },
  { name: 'Myofascial Release', category: 'massage', description: 'Gentle, sustained pressure on fascial restrictions.', mechanism: 'Fascial tissue remodeling, mechanoreceptor stimulation', conditions: ['Chronic pain', 'Fibromyalgia', 'Restricted ROM', 'TMJ dysfunction'], evidence_grade: 'C', contraindications: ['Acute inflammation', 'Open wounds', 'Malignancy'], practitioner_req: 'Licensed massage therapist or physical therapist' },
  { name: 'Craniosacral Therapy', category: 'massage', description: 'Gentle manipulation of craniosacral rhythm and fascial system.', mechanism: 'Cerebrospinal fluid dynamics, fascial release', conditions: ['Migraine', 'TMJ', 'Chronic pain', 'Stress'], evidence_grade: 'D', contraindications: ['Severe trauma history', 'Arnold-Chiari malformation', 'Increased intracranial pressure'], practitioner_req: 'Upledger or Biodynamic CST certified practitioner' },
  { name: 'Lymphatic Drainage', category: 'massage', description: 'Gentle rhythmic strokes to stimulate lymphatic circulation.', mechanism: 'Lymphatic flow enhancement, edema reduction', conditions: ['Lymphedema', 'Post-surgical swelling', 'Detoxification support'], evidence_grade: 'B', contraindications: ['Active infection', 'Congestive heart failure', 'Active cancer (without clearance)'], practitioner_req: 'Certified lymphedema therapist (CLT)' },
  { name: 'Reflexology', category: 'massage', description: 'Pressure applied to specific points on feet/hands corresponding to body organs.', mechanism: 'Zone theory, autonomic reflex response', conditions: ['Stress', 'Anxiety', 'Pain', 'Insomnia'], evidence_grade: 'C', contraindications: ['Foot ulcers', 'Recent foot surgery', 'Severe edema'], practitioner_req: 'Certified reflexologist' },
  { name: 'Shiatsu', category: 'massage', description: 'Japanese finger-pressure therapy along meridian lines.', mechanism: 'Meridian energy balancing, acupressure points', conditions: ['Stress', 'Muscle tension', 'Digestive issues', 'Fatigue'], evidence_grade: 'C', contraindications: ['Pregnancy (certain points)', 'Acute inflammation', 'Fractures'], practitioner_req: 'Certified shiatsu practitioner' },
  { name: 'Thai Massage', category: 'massage', description: 'Assisted stretching and compression along energy lines.', mechanism: 'Passive stretching, energy line (Sen) stimulation', conditions: ['Flexibility issues', 'Stress', 'Muscle tension'], evidence_grade: 'C', contraindications: ['Joint hypermobility', 'Recent surgery', 'Osteoporosis'], practitioner_req: 'Certified Thai massage practitioner' },
  { name: 'Music Therapy (Receptive)', category: 'music-art', description: 'Listening to live or recorded music for therapeutic purposes.', mechanism: 'Auditory cortex-limbic pathway activation, entrainment', conditions: ['Depression', 'Anxiety', 'Pain', 'Dementia', 'Autism'], evidence_grade: 'B', contraindications: ['Hyperacusis (volume control)', 'Music-triggered PTSD'], practitioner_req: 'Board-certified music therapist (MT-BC)' },
  { name: 'Music Therapy (Active)', category: 'music-art', description: 'Playing instruments, singing, songwriting for therapeutic expression.', mechanism: 'Emotional expression, motor coordination, social engagement', conditions: ['Depression', 'Autism', 'Neurological rehab', 'Substance use'], evidence_grade: 'B', contraindications: ['None significant'], practitioner_req: 'Board-certified music therapist (MT-BC)' },
  { name: 'Art Therapy', category: 'music-art', description: 'Use of art materials for emotional expression and psychological processing.', mechanism: 'Nonverbal emotional processing, bilateral brain engagement', conditions: ['PTSD', 'Depression', 'Anxiety', 'Trauma', 'Autism'], evidence_grade: 'B', contraindications: ['None significant'], practitioner_req: 'Registered art therapist (ATR-BC)' },
  { name: 'Dance/Movement Therapy', category: 'music-art', description: 'Psychotherapeutic use of movement for emotional integration.', mechanism: 'Body-mind integration, proprioceptive awareness, expression', conditions: ['Depression', 'Trauma', 'Autism', 'Body image issues', 'Parkinsons'], evidence_grade: 'C', contraindications: ['Severe mobility limitations', 'Acute injury'], practitioner_req: 'Board-certified dance/movement therapist (BC-DMT)' },
  { name: 'Drama Therapy', category: 'music-art', description: 'Use of theatrical techniques for personal growth and healing.', mechanism: 'Role-play distance, narrative reconstruction, social skills', conditions: ['Trauma', 'Autism', 'Social anxiety', 'Substance use'], evidence_grade: 'C', contraindications: ['Active psychosis', 'Severe dissociation'], practitioner_req: 'Registered drama therapist (RDT)' },
  { name: 'Poetry Therapy', category: 'music-art', description: 'Use of poems and literary materials for therapeutic insight.', mechanism: 'Narrative processing, metaphorical thinking, emotional distance', conditions: ['Depression', 'Grief', 'Identity issues', 'Terminal illness'], evidence_grade: 'D', contraindications: ['None significant'], practitioner_req: 'Certified poetry therapist (CPT)' },
  { name: 'Horticultural Therapy', category: 'other', description: 'Therapeutic engagement in gardening and plant-based activities.', mechanism: 'Biophilia hypothesis, sensory engagement, purposeful activity', conditions: ['Depression', 'Dementia', 'Rehabilitation', 'PTSD', 'Autism'], evidence_grade: 'C', contraindications: ['Plant allergies', 'Severe mobility limitations'], practitioner_req: 'Registered horticultural therapist (HTR)' },
  { name: 'Animal-Assisted Therapy', category: 'other', description: 'Structured therapeutic interactions with trained animals.', mechanism: 'Oxytocin release, social engagement, emotional regulation', conditions: ['Anxiety', 'PTSD', 'Autism', 'Depression', 'Cardiovascular rehab'], evidence_grade: 'B', contraindications: ['Animal allergies', 'Phobia', 'Immunocompromised (zoonosis risk)'], practitioner_req: 'Certified AAT handler with clinical team' },
  { name: 'Nature/Forest Bathing (Shinrin-yoku)', category: 'other', description: 'Immersive exposure to forest/natural environments for health benefits.', mechanism: 'Phytoncide inhalation, attention restoration, stress reduction', conditions: ['Stress', 'Hypertension', 'Immune dysfunction', 'Mood disorders'], evidence_grade: 'B', contraindications: ['Severe mobility limitations', 'Allergies'], practitioner_req: 'Certified forest therapy guide' },
  { name: 'Floatation-REST Therapy', category: 'other', description: 'Sensory deprivation in buoyant salt-water tank.', mechanism: 'Reduced sensory input, magnesium absorption, theta state induction', conditions: ['Anxiety', 'Chronic pain', 'Insomnia', 'Stress', 'Creativity blocks'], evidence_grade: 'C', contraindications: ['Open wounds', 'Epilepsy', 'Severe claustrophobia', 'Kidney disease'], practitioner_req: 'Trained facility operator' },
  { name: 'Halotherapy (Salt Therapy)', category: 'other', description: 'Inhalation of micronized dry salt particles in controlled environment.', mechanism: 'Mucolytic, anti-inflammatory, antimicrobial airway effects', conditions: ['Asthma', 'COPD', 'Allergic rhinitis', 'Bronchitis'], evidence_grade: 'C', contraindications: ['Hyperthyroidism', 'Tuberculosis', 'Hemoptysis', 'Severe hypertension'], practitioner_req: 'Trained halotherapy technician' },
  { name: 'Aromatherapy', category: 'other', description: 'Therapeutic use of essential oils via inhalation or topical application.', mechanism: 'Olfactory-limbic pathway, pharmacological effects of volatile compounds', conditions: ['Anxiety', 'Insomnia', 'Nausea', 'Mild pain', 'Stress'], evidence_grade: 'C', contraindications: ['Skin sensitivity', 'Asthma (some oils)', 'Pregnancy (specific oils)', 'Pets in environment (toxicity)'], practitioner_req: 'Certified aromatherapist' },
  { name: 'Homeopathy', category: 'naturopathic', description: 'Treatment with highly diluted substances based on "like cures like" principle.', mechanism: 'Not established; controversial — may involve placebo and consultation effects', conditions: ['Allergies', 'Anxiety', 'Minor injuries', 'Digestive complaints'], evidence_grade: 'D', contraindications: ['Serious acute conditions', 'Replacement for evidence-based treatments'], practitioner_req: 'Licensed homeopath (varies by jurisdiction)' },
  { name: 'Naturopathic Herbal Medicine', category: 'naturopathic', description: 'Use of plant-based preparations for therapeutic effects.', mechanism: 'Varies by herb — receptor modulation, anti-inflammatory, adaptogenic', conditions: ['Mild-moderate conditions per herb'], evidence_grade: 'B', contraindications: ['Herb-drug interactions', 'Pregnancy/lactation', 'Liver/kidney disease'], practitioner_req: 'Licensed naturopathic doctor (ND) or herbalist' },
  { name: 'Ayurveda', category: 'naturopathic', description: 'Traditional Indian system using diet, herbs, yoga, and lifestyle modifications.', mechanism: 'Individualized constitutional (dosha) balancing', conditions: ['Digestive disorders', 'Stress', 'Chronic disease prevention'], evidence_grade: 'C', contraindications: ['Heavy metal contamination in some preparations', 'Unregulated quality'], practitioner_req: 'Qualified Ayurvedic practitioner' },
  { name: 'Traditional Chinese Medicine (TCM) Herbal', category: 'naturopathic', description: 'Individualized herbal formulas based on TCM pattern differentiation.', mechanism: 'Multi-component, multi-target pharmacological effects', conditions: ['Various chronic conditions per formula'], evidence_grade: 'C', contraindications: ['Herb-drug interactions', 'Heavy metal risk in some products', 'Pregnancy'], practitioner_req: 'Licensed TCM practitioner' },
  { name: 'Chiropractic Manipulation', category: 'other', description: 'Manual adjustment of the spine and joints for alignment and function.', mechanism: 'Neuro-mechanical joint function, proprioceptive input', conditions: ['Low back pain', 'Neck pain', 'Headache', 'Joint dysfunction'], evidence_grade: 'B', contraindications: ['Osteoporosis', 'Spinal cord compression', 'Arterial dissection risk', 'Unstable fractures'], practitioner_req: 'Licensed Doctor of Chiropractic (DC)' },
  { name: 'Osteopathic Manipulative Medicine', category: 'other', description: 'Hands-on techniques to diagnose, treat, and prevent illness/injury.', mechanism: 'Fascial release, lymphatic drainage, joint mobilization', conditions: ['Back pain', 'Migraine', 'Respiratory conditions', 'Edema'], evidence_grade: 'B', contraindications: ['Fractures', 'Bone cancer', 'Joint infection'], practitioner_req: 'Licensed Doctor of Osteopathic Medicine (DO)' },
  { name: 'Feldenkrais Method', category: 'other', description: 'Gentle movement lessons to improve posture, flexibility, and coordination.', mechanism: 'Neuroplasticity, motor learning, proprioceptive re-education', conditions: ['Chronic pain', 'Movement disorders', 'Rehabilitation', 'Performance improvement'], evidence_grade: 'C', contraindications: ['Acute injury'], practitioner_req: 'Certified Feldenkrais practitioner' },
  { name: 'Alexander Technique', category: 'other', description: 'Postural re-education through conscious awareness of movement habits.', mechanism: 'Motor control re-patterning, postural reflex optimization', conditions: ['Back pain', 'Neck pain', 'Voice disorders', 'Posture improvement', 'Parkinsons'], evidence_grade: 'B', contraindications: ['None significant'], practitioner_req: 'Certified Alexander Technique teacher' },
  { name: 'Kinesiology / Muscle Testing', category: 'other', description: 'Use of manual muscle testing for assessment and treatment guidance.', mechanism: 'Controversial — not scientifically validated as diagnostic', conditions: ['Not recommended as standalone diagnostic'], evidence_grade: 'D', contraindications: ['Should not replace medical diagnosis'], practitioner_req: 'Varies widely; not standardized' },
  { name: 'Reiki', category: 'other', description: 'Hands-on or hands-off energy healing technique.', mechanism: 'Biofield modulation, relaxation response, therapeutic presence', conditions: ['Stress', 'Anxiety', 'Pain', 'Cancer support', 'Palliative care'], evidence_grade: 'C', contraindications: ['None significant'], practitioner_req: 'Reiki master/level 2 practitioner' },
  { name: 'Healing Touch / Therapeutic Touch', category: 'other', description: 'Energy-based therapy using hand techniques to balance energy fields.', mechanism: 'Relaxation response, biofield interaction', conditions: ['Anxiety', 'Pain', 'Wound healing', 'Cancer support'], evidence_grade: 'C', contraindications: ['None significant'], practitioner_req: 'Certified Healing Touch practitioner' },
  { name: 'Biofield Tuning', category: 'other', description: 'Use of tuning forks in the biofield for therapeutic effect.', mechanism: 'Vibrational/sound-based, relaxation response', conditions: ['Stress', 'Anxiety', 'Pain'], evidence_grade: 'D', contraindications: ['Pregnancy', 'Pacemaker', 'Fractures'], practitioner_req: 'Certified biofield tuning practitioner' },
  { name: 'Chelation Therapy', category: 'naturopathic', description: 'IV administration of chelating agents to remove heavy metals.', mechanism: 'Metal ion binding and urinary excretion', conditions: ['Heavy metal poisoning (FDA-approved)', 'Atherosclerosis (investigational)'], evidence_grade: 'B', contraindications: ['Kidney disease', 'Hypocalcemia', 'Congestive heart failure'], practitioner_req: 'Physician with chelation therapy training' },
  { name: 'Functional Medicine (General)', category: 'other', description: 'Systems-biology approach addressing root causes of disease.', mechanism: 'Personalized lifestyle, nutrition, and targeted interventions', conditions: ['Chronic complex conditions', 'Autoimmune disease', 'GI disorders'], evidence_grade: 'C', contraindications: ['Should not replace emergency or acute care'], practitioner_req: 'IFM-certified practitioner' },
  { name: 'Integrative Health Coaching', category: 'other', description: 'Patient-centered coaching for lifestyle behavior change.', mechanism: 'Motivational interviewing, goal-setting, accountability', conditions: ['Chronic disease self-management', 'Weight management', 'Stress reduction', 'Adherence support'], evidence_grade: 'B', contraindications: ['None'], practitioner_req: 'NBHWC-certified health coach' },
  { name: 'Clinical Hypnotherapy', category: 'other', description: 'Therapeutic use of hypnosis for behavioral and symptom change.', mechanism: 'Altered state of consciousness enhancing suggestibility, accessing subconscious', conditions: ['Pain', 'Anxiety', 'Phobias', 'IBS', 'Smoking cessation', 'PTSD'], evidence_grade: 'B', contraindications: ['Severe mental illness', 'Dissociative disorders', 'Substance intoxication'], practitioner_req: 'Licensed clinician with hypnotherapy certification' },
  { name: 'NLP (Neuro-Linguistic Programming)', category: 'other', description: 'Techniques to change thought and behavioral patterns through language.', mechanism: 'Not scientifically validated; mixed evidence', conditions: ['Not recommended as primary clinical intervention'], evidence_grade: 'D', contraindications: ['Should not replace evidence-based therapy'], practitioner_req: 'Certified NLP practitioner (non-clinical)' },
];

function _renderTherapyLibrary(state) {
  const categories = ['all', 'acupuncture', 'biofeedback', 'ces', 'pbm', 'massage', 'mind-body', 'music-art', 'naturopathic', 'other'];
  const evidenceGrades = ['all', 'A', 'B', 'C', 'D'];

  const categoryOptions = categories.map(c =>
    `<option value="${esc(c)}">${esc(c === 'all' ? 'All Categories' : c.replace(/-/g, ' ').replace(/\b\w/g, x => x.toUpperCase()))}</option>`
  ).join('');

  const gradeOptions = evidenceGrades.map(g =>
    `<option value="${esc(g)}">${g === 'all' ? 'All Grades' : `Grade ${g}`}</option>`
  ).join('');

  const filters = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--bg-card)">
      <label style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
        Category
        <select id="lib-category" class="form-control" style="min-height:40px">${categoryOptions}</select>
      </label>
      <label style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
        Evidence Grade
        <select id="lib-grade" class="form-control" style="min-height:40px">${gradeOptions}</select>
      </label>
      <label style="flex:2;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
        Search
        <input type="text" id="lib-search" class="form-control" placeholder="Therapy name, condition, mechanism..." style="min-height:40px">
      </label>
    </div>
  `;

  const renderRows = (therapies) => therapies.map((t, idx) => `
    <tr data-library-row="${idx}" style="cursor:pointer" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background='transparent'"
      onclick="const el=document.getElementById('lib-detail-${idx}');el.style.display=el.style.display==='none'?'table-row':'none'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500;font-size:12px">${esc(t.name)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;text-transform:capitalize">${esc(t.category.replace(/-/g, ' '))}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(t.description.substring(0, 60))}...</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary)">${esc(t.conditions.slice(0, 3).join(', '))}${t.conditions.length > 3 ? '...' : ''}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill(t.evidence_grade)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">${t.contraindications.length > 0 ? `<span style="color:var(--amber);font-size:11px">${t.contraindications.length} listed</span>` : '<span style="color:var(--green);font-size:11px">None</span>'}</td>
    </tr>
    <tr id="lib-detail-${idx}" style="display:none">
      <td colspan="6" style="padding:12px 16px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)">
        <div style="font-size:12px;line-height:1.6">
          <div style="font-weight:600;margin-bottom:4px">${esc(t.name)}</div>
          <div style="color:var(--text-secondary);margin-bottom:6px">${esc(t.description)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px">
            <span style="font-size:10px;color:var(--text-tertiary)"><strong>Mechanism:</strong> ${esc(t.mechanism)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">
            <span style="font-size:10px;color:var(--text-tertiary)"><strong>Conditions:</strong></span>
            ${t.conditions.map(c => `<span class="pill" style="font-size:10px;padding:1px 6px">${esc(c)}</span>`).join('')}
          </div>
          <div style="padding:6px;border-radius:4px;background:rgba(255,176,87,0.06);border:1px solid rgba(255,176,87,0.15);font-size:10px;color:var(--amber);margin-bottom:6px">
            <strong>Contraindications:</strong> ${esc(t.contraindications.join('; '))}
          </div>
          <div style="font-size:10px;color:var(--blue)">
            <strong>Practitioner requirement:</strong> ${esc(t.practitioner_req)}
          </div>
        </div>
      </td>
    </tr>
  `).join('');

  const table = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span>Therapy Database</span>
        <span style="font-size:11px;color:var(--text-tertiary)">${THERAPY_DATABASE.length} therapies catalogued</span>
      </div>
      <table id="lib-table" style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Name</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Category</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Description</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Conditions</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Contra</th>
          </tr>
        </thead>
        <tbody>${renderRows(THERAPY_DATABASE)}</tbody>
      </table>
    </div>
  `;

  return `<div style="display:flex;flex-direction:column;gap:14px">
    ${filters}
    ${table}
  </div>`;
}

/** ================================================================== */
/*  10. SAFETY & EVIDENCE PANEL                                        */
/** ================================================================== */
function _renderSafetyEvidence(state) {
  const herbs = [
    { name: "St. John's Wort (Hypericum)", interactions: 'SSRIs/SNRIs (serotonin syndrome), warfarin (reduced INR), cyclosporine, oral contraceptives, digoxin, antiretrovirals', evidence: 'A', note: 'Potent CYP3A4 and P-gp inducer — many drug interactions' },
    { name: 'Ginkgo Biloba', interactions: 'Anticoagulants (bleeding risk), antiplatelets, SSRIs (rare case reports of serotonin syndrome)', evidence: 'B', note: 'May increase bleeding risk at high doses' },
    { name: 'Ginseng (Panax)', interactions: 'Warfarin (reduced INR), MAOIs, hypoglycemic agents (additive effect), stimulants', evidence: 'B', note: 'Different species have different interaction profiles' },
    { name: 'Echinacea', interactions: 'Immunosuppressants (may antagonize), hepatotoxic drugs (rare hepatic metabolism interactions)', evidence: 'C', note: 'Short-term use recommended' },
    { name: 'Kava Kava', interactions: 'CNS depressants (additive sedation), hepatotoxic drugs, levodopa', evidence: 'B', note: 'Hepatotoxicity risk — banned in some countries' },
    { name: 'Valerian Root', interactions: 'CNS depressants, alcohol, sedatives', evidence: 'B', note: 'Additive sedative effects' },
    { name: 'Turmeric / Curcumin', interactions: 'Anticoagulants (high doses), antacids (may interfere), chemotherapy agents', evidence: 'B', note: 'Generally safe at culinary doses; supplement doses require monitoring' },
    { name: 'Ashwagandha', interactions: 'Sedatives, thyroid medications, immunosuppressants, antidiabetic agents', evidence: 'B', note: 'Thyroid hormone augmentation effect documented' },
    { name: 'Rhodiola Rosea', interactions: 'MAOIs, stimulants, SSRIs (theoretical serotonin syndrome)', evidence: 'C', note: 'Adaptogen with stimulating properties' },
    { name: 'CBD (Cannabidiol)', interactions: 'CYP2C19, CYP3A4 substrates (clobazam, warfarin, valproate), CNS depressants', evidence: 'B', note: 'Potent CYP inhibitor — significant interaction potential' },
    { name: 'Melatonin', interactions: 'Anticoagulants, immunosuppressants, CNS depressants, fluvoxamine (increases melatonin levels)', evidence: 'A', note: 'Generally safe short-term; caution with sedatives' },
    { name: 'Omega-3 (Fish Oil)', interactions: 'Anticoagulants (high dose >3g/day may increase bleeding), antihypertensives (additive BP lowering)', evidence: 'A', note: 'Generally safe at standard doses (1-2g/day)' },
  ];

  const interactionChecker = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Herb-Drug Interaction Checker</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px">
        <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Herb / Supplement
          <select id="herb-select" class="form-control" style="min-height:40px">
            <option value="">Select herb...</option>
            ${herbs.map((h, i) => `<option value="${i}">${esc(h.name)}</option>`).join('')}
          </select>
        </label>
        <label style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Medication (optional)
          <input type="text" id="med-input" class="form-control" placeholder="e.g., Sertraline, Warfarin" style="min-height:40px">
        </label>
      </div>
      <div id="interaction-result" style="display:none;padding:10px;border-radius:8px;background:rgba(255,176,87,0.06);border:1px solid rgba(255,176,87,0.20);font-size:12px;line-height:1.5"></div>
    </div>
  `;

  const herbTable = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;overflow:auto">
      <div style="padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--border)">Common Herb-Drug Interactions</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:650px">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Herb</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Key Interactions</th>
            <th style="padding:8px 10px;text-align:center;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Evidence</th>
            <th style="padding:8px 10px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;border-bottom:1px solid var(--border)">Clinical Note</th>
          </tr>
        </thead>
        <tbody>
          ${herbs.map(h => `
            <tr>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:500">${esc(h.name)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-secondary)">${esc(h.interactions)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill(h.evidence)}</td>
              <td style="padding:8px 10px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary)">${esc(h.note)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const evidenceLegend = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Evidence Grade Legend</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;background:rgba(45,212,191,0.06)">
          ${_evidenceGradePill('A')}
          <span style="color:var(--text-secondary)">Meta-analysis or systematic review of high-quality RCTs</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;background:rgba(96,165,250,0.06)">
          ${_evidenceGradePill('B')}
          <span style="color:var(--text-secondary)">Randomized Controlled Trial (RCT) with adequate power and methodology</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;background:rgba(155,127,255,0.06)">
          ${_evidenceGradePill('C')}
          <span style="color:var(--text-secondary)">Cohort study, case-control, or uncontrolled trial</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;background:rgba(255,255,255,0.03)">
          ${_evidenceGradePill('D')}
          <span style="color:var(--text-secondary)">Expert opinion, case report, or historical practice</span>
        </div>
      </div>
      <div style="margin-top:10px;padding:8px;border-radius:6px;background:rgba(255,176,87,0.06);border:1px solid rgba(255,176,87,0.18);font-size:11px;color:var(--text-secondary)">
        <strong style="color:var(--amber)">Important:</strong> Evidence grades reflect the strength of research methodology, not clinical efficacy. A "D" grade may still reflect valuable clinical traditions. Grades are periodically reviewed as new research emerges.
      </div>
    </div>
  `;

  const contraindicationDB = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Contraindication Flags by Condition</div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px">
        <div style="padding:8px;border-radius:6px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.20)">
          <strong style="color:var(--red)">Pregnancy:</strong> Avoid electroacupuncture (LI4, SP6), high-dose herbs, retinoid-containing topical treatments, deep abdominal massage, X-ray exposure (thermography), hot stone therapy (overheating risk).
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.20)">
          <strong style="color:var(--red)">Pacemaker/ICD:</strong> Contraindicated: Electroacupuncture, CES, tDCS, tACS, biofield tuning. Caution: Any electrical device near implant site.
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,176,87,0.08);border:1px solid rgba(255,176,87,0.20)">
          <strong style="color:var(--amber)">Bleeding Disorders / Anticoagulants:</strong> Caution: Acupuncture, deep tissue massage, cupping, high-dose fish oil, Ginkgo, turmeric supplements. Monitor INR with herbal supplements.
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(255,176,87,0.08);border:1px solid rgba(255,176,87,0.20)">
          <strong style="color:var(--amber)">Epilepsy:</strong> Caution: Alpha-theta neurofeedback, CES, stroboscopic light therapy, some essential oils (rosemary, fennel, hyssop).
        </div>
        <div style="padding:8px;border-radius:6px;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.18)">
          <strong style="color:var(--blue)">Cancer:</strong> Lymphedema risk — avoid massage on affected limb. Consult oncology team before herbal supplements due to immunomodulatory effects.
        </div>
      </div>
    </div>
  `;

  const safetyAlerts = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:10px">Safety Alerts Based on Medications</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">
        <p>Select a medication class to see relevant complementary therapy alerts:</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
          ${['SSRIs/SNRIs', 'Anticoagulants', 'Benzodiazepines', 'Immunosuppressants', 'Hypoglycemics', 'Antihypertensives'].map(med =>
            `<button type="button" class="btn btn-sm btn-ghost" data-med-alert="${esc(med)}" style="min-height:32px;font-size:11px">${esc(med)}</button>`
          ).join('')}
        </div>
        <div id="med-alert-output" style="display:none;padding:10px;border-radius:8px;background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.20);font-size:12px"></div>
      </div>
    </div>
  `;

  return `<div style="display:flex;flex-direction:column;gap:14px">
    ${interactionChecker}
    ${herbTable}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">
      ${evidenceLegend}
      ${contraindicationDB}
    </div>
    ${safetyAlerts}
  </div>`;
}

/** ================================================================== */
/*  11. PROTOCOL BUILDER                                               */
/** ================================================================== */
function _renderProtocolBuilder(state) {
  const patientSelect = _renderPatientSelect('proto-patient');

  const protocolList = DEMO_PROTOCOLS.map(p => `
    <div style="padding:12px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.02);display:flex;flex-direction:column;gap:6px"
      data-protocol-id="${esc(p.id)}"
      onmouseover="this.style.borderColor='var(--primary)'"
      onmouseout="this.style.borderColor='var(--border)'">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div style="font-weight:600;font-size:12px">${esc(p.name)}</div>
        <div style="display:flex;gap:6px">
          ${_evidenceGradePill(p.evidence_grade)}
          ${p.active ? '<span class="pill pill-active" style="font-size:10px">Active</span>' : ''}
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);line-height:1.4">${esc(p.description)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:10px;color:var(--text-tertiary)">
        <span>${p.weeks} weeks</span> · <span>${p.sessions_count} sessions</span> · <span>${p.conditions.map(c => esc(c)).join(', ')}</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button type="button" class="btn btn-primary btn-sm" data-action="select-protocol" data-protocol="${esc(p.id)}" style="min-height:32px;font-size:11px">Select Template</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="view-protocol-detail" data-protocol="${esc(p.id)}" style="min-height:32px;font-size:11px">Details</button>
      </div>
    </div>
  `).join('');

  const createForm = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Create Custom Protocol</div>
      <form data-form="protocol" style="display:flex;flex-direction:column;gap:12px">
        ${patientSelect}
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Protocol Name
          <input type="text" name="name" class="form-control" placeholder="e.g., Personalized Integrative Plan" style="min-height:40px">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Based on Template
          <select name="template_key" class="form-control" style="min-height:40px">
            <option value="">None (custom)</option>
            ${DEMO_PROTOCOLS.map(p => `<option value="${esc(p.template_key)}">${esc(p.name)}</option>`).join('')}
          </select>
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Duration (weeks)
            <input type="number" name="weeks" class="form-control" value="8" min="1" max="52" style="min-height:40px">
          </label>
          <label style="flex:1;min-width:140px;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
            Total Sessions
            <input type="number" name="sessions_count" class="form-control" value="16" min="1" style="min-height:40px">
          </label>
        </div>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Modalities Included
          <select name="modalities" class="form-control" multiple size="4" style="min-height:80px">
            <option value="acupuncture">Acupuncture</option>
            <option value="neurofeedback">Neurofeedback</option>
            <option value="ces">CES</option>
            <option value="pbm">tPBM</option>
            <option value="mind-body">Mind-Body Practices</option>
            <option value="massage">Massage / Bodywork</option>
            <option value="music-art">Music / Art Therapy</option>
          </select>
          <span style="font-size:10px;color:var(--text-tertiary)">Hold Ctrl/Cmd to select multiple modalities</span>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Target Conditions
          <input type="text" name="conditions" class="form-control" placeholder="e.g., Chronic Pain, Anxiety" style="min-height:40px">
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Protocol Description
          <textarea name="description" class="form-control" rows="3" placeholder="Detailed protocol description..." style="resize:vertical"></textarea>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Session Schedule Notes
          <textarea name="schedule_notes" class="form-control" rows="2" placeholder="Frequency, duration per session, progression..." style="resize:vertical"></textarea>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
          Outcome Measures
          <input type="text" name="outcome_measures" class="form-control" placeholder="e.g., VAS, GAD-7, PSQI, HRV" style="min-height:40px">
        </label>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Create Protocol</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="clear-form" style="min-height:40px">Clear</button>
        </div>
      </form>
    </div>
  `;

  const protocolGallery = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px">
      <div style="font-weight:600;font-size:13px;margin-bottom:12px">Protocol Templates (${DEMO_PROTOCOLS.length})</div>
      <div style="display:flex;flex-direction:column;gap:10px;max-height:600px;overflow:auto">
        ${protocolList}
      </div>
    </div>
  `;

  return `<div style="display:flex;flex-direction:column;gap:14px">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">
      ${createForm}
      ${protocolGallery}
    </div>
  </div>`;
}

/** ================================================================== */
/*  SHARED COMPONENTS                                                  */
/** ================================================================== */
function _renderPatientSelect(name) {
  const opts = DEMO_PATIENTS.map(p => `<option value="${esc(p.patient_id)}">${esc(p.patient_name)}</option>`).join('');
  return `<label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-secondary)">
    Select Patient
    <select name="${esc(name)}" class="form-control" style="min-height:40px">
      <option value="">Choose patient...</option>
      ${opts}
    </select>
  </label>`;
}

/** ================================================================== */
/*  EVENT WIRING                                                       */
/** ================================================================== */
function _wireComplementaryPage(container, state) {
  /* Tab switching */
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (window.dispatchEvent) {
        window.history.pushState({}, '', `#complementary-interventions?tab=${tab}`);
      }
      const content = container.querySelector('[data-tab-content]');
      if (content) content.innerHTML = _renderTabContent(tab, state);
      _rewireDynamicContent(container, state);
      /* Update active tab visual */
      container.querySelectorAll('[data-tab]').forEach(b => {
        const isActive = b.getAttribute('data-tab') === tab;
        b.style.cssText = isActive
          ? 'min-height:36px;font-size:11px;padding:4px 12px;border-radius:8px;border:1px solid var(--primary);background:var(--primary);color:#fff'
          : 'min-height:36px;font-size:11px;padding:4px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text-secondary)';
      });
    });
  });

  _rewireDynamicContent(container, state);
}

function _rewireDynamicContent(container, state) {
  /* Form submissions */
  container.querySelectorAll('form[data-form]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const formType = form.getAttribute('data-form');
      const data = new FormData(form);
      const payload = {};
      data.forEach((val, key) => {
        if (payload[key] !== undefined) {
          if (!Array.isArray(payload[key])) payload[key] = [payload[key]];
          payload[key].push(val);
        } else {
          payload[key] = val;
        }
      });
      _handleFormSubmit(formType, payload, form);
    });
  });

  /* Clear form buttons */
  container.querySelectorAll('[data-action="clear-form"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = btn.closest('form');
      if (form) form.reset();
    });
  });

  /* Open patient buttons */
  container.querySelectorAll('[data-action="open-patient"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.getAttribute('data-patient-id');
      alert(`Opening patient profile: ${esc(pid)}\n\n(This would navigate to the patient detail view in production.)`);
    });
  });

  /* Help button */
  const helpBtn = container.querySelector('[data-action="ci-help"]');
  if (helpBtn) {
    helpBtn.addEventListener('click', () => {
      alert('Complementary Interventions Platform\n\nThis module supports documentation, safety checking, evidence review, and protocol management for complementary and integrative therapies.\n\nAll entries require clinician oversight and should not replace professional clinical judgment.');
    });
  }

  /* Protocol selection */
  container.querySelectorAll('[data-action="select-protocol"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-protocol');
      const protocol = DEMO_PROTOCOLS.find(p => p.id === pid);
      if (protocol) {
        alert(`Selected protocol template:\n${esc(protocol.name)}\n${protocol.weeks} weeks · ${protocol.sessions_count} sessions\n\nThe template has been copied to the custom protocol form (in production).`);
      }
    });
  });

  /* Protocol detail view */
  container.querySelectorAll('[data-action="view-protocol-detail"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = btn.getAttribute('data-protocol');
      const protocol = DEMO_PROTOCOLS.find(p => p.id === pid);
      if (protocol) {
        alert(`Protocol: ${esc(protocol.name)}\n\nDescription: ${esc(protocol.description)}\n\nConditions: ${protocol.conditions.map(c => esc(c)).join(', ')}\nEvidence: ${protocol.evidence_grade}\nDuration: ${protocol.weeks} weeks, ${protocol.sessions_count} sessions`);
      }
    });
  });

  /* Herb-drug interaction checker */
  const herbSelect = container.querySelector('#herb-select');
  if (herbSelect) {
    herbSelect.addEventListener('change', () => {
      const idx = parseInt(herbSelect.value, 10);
      const result = container.querySelector('#interaction-result');
      if (!isNaN(idx) && THERAPY_DATABASE.length > 0) {
        /* Use the herbs array from Safety panel */
        const herbs = [
          { name: "St. John's Wort", interactions: 'SSRIs/SNRIs (serotonin syndrome), warfarin, cyclosporine, oral contraceptives', severity: 'critical' },
          { name: 'Ginkgo Biloba', interactions: 'Anticoagulants (bleeding risk), antiplatelets', severity: 'warning' },
          { name: 'Ginseng (Panax)', interactions: 'Warfarin, MAOIs, hypoglycemic agents', severity: 'warning' },
          { name: 'Echinacea', interactions: 'Immunosuppressants (may antagonize)', severity: 'caution' },
          { name: 'Kava Kava', interactions: 'CNS depressants, hepatotoxic drugs', severity: 'critical' },
          { name: 'Valerian Root', interactions: 'CNS depressants, alcohol, sedatives', severity: 'warning' },
          { name: 'Turmeric/Curcumin', interactions: 'Anticoagulants (high doses)', severity: 'caution' },
          { name: 'Ashwagandha', interactions: 'Sedatives, thyroid medications', severity: 'warning' },
          { name: 'Rhodiola Rosea', interactions: 'MAOIs, stimulants, SSRIs', severity: 'caution' },
          { name: 'CBD', interactions: 'CYP2C19/CYP3A4 substrates, CNS depressants', severity: 'warning' },
          { name: 'Melatonin', interactions: 'Anticoagulants, CNS depressants, fluvoxamine', severity: 'caution' },
          { name: 'Omega-3', interactions: 'Anticoagulants (high dose), antihypertensives', severity: 'caution' },
        ];
        const herb = herbs[idx];
        if (herb && result) {
          result.style.display = 'block';
          result.innerHTML = `<strong style="color:var(--amber)">${esc(herb.name)}</strong><br>${_safetyAlertPill(herb.severity)}<br><strong>Key interactions:</strong> ${esc(herb.interactions)}<br><br><em style="font-size:11px;color:var(--text-tertiary)">Always verify against current medication list and consult a pharmacist or physician before combining herbs with prescription medications.</em>`;
        }
      } else if (result) {
        result.style.display = 'none';
      }
    });
  }

  /* Medication alert buttons */
  container.querySelectorAll('[data-med-alert]').forEach(btn => {
    btn.addEventListener('click', () => {
      const medClass = btn.getAttribute('data-med-alert');
      const output = container.querySelector('#med-alert-output');
      if (!output) return;
      const alerts = {
        'SSRIs/SNRIs': '⚠ <strong>St. John\'s Wort:</strong> Risk of serotonin syndrome — avoid concurrent use.<br>⚠ <strong>Tramadol, Triptans:</strong> Serotonin syndrome risk with SSRIs.<br>ℹ <strong>Omega-3:</strong> May have synergistic antidepressant effects — monitor.',
        'Anticoagulants': '🚫 <strong>Ginkgo, High-dose fish oil, Turmeric supplements:</strong> Increased bleeding risk — monitor INR.<br>⚠ <strong>Acupuncture, deep tissue massage, cupping:</strong> Bleeding/bruising risk — use caution.<br>⚠ <strong>Vitamin E, Garlic supplements:</strong> Potential anticoagulant effect.',
        'Benzodiazepines': '⚠ <strong>Valerian, Kava, CBD, Ashwagandha:</strong> Additive sedation — monitor for excessive drowsiness.<br>⚠ <strong>CES:</strong> May enhance GABAergic activity — additive effects possible.',
        'Immunosuppressants': '⚠ <strong>Echinacea, Astragalus:</strong> May stimulate immune system — could antagonize immunosuppression.<br>⚠ <strong>Ashwagandha:</strong> Immunomodulatory — use with caution.',
        'Hypoglycemics': '⚠ <strong>Ginseng, Cinnamon supplements:</strong> May lower blood glucose — monitor for hypoglycemia.<br>⚠ <strong>Chromium, Alpha-lipoic acid:</strong> May enhance glucose lowering.',
        'Antihypertensives': '⚠ <strong>CoQ10, Omega-3, L-arginine:</strong> May lower blood pressure — monitor for hypotension.<br>ℹ <strong>HRV biofeedback, yoga, tai chi:</strong> May reduce BP — positive adjunct.',
      };
      output.style.display = 'block';
      output.innerHTML = alerts[medClass] || 'No specific alerts for this medication class.';
    });
  });

  /* Mind-body subtype selector */
  const mbTypeSelect = container.querySelector('#mb-type-select');
  if (mbTypeSelect) {
    const subtypeData = {
      meditation: ['mindfulness', 'body_scan', 'loving_kindness', 'transcendental', 'guided_imagery', 'zen', 'other'],
      yoga: ['hatha', 'vinyasa', 'yin', 'restorative', 'iyengar', 'kundalini', 'gentle'],
      tai_chi: ['yang_24', 'yang_108', 'chen', 'sun', 'wu', 'simplified_8'],
      breathing: ['4-7-8', 'box', 'coherent_5.5', 'alternate_nostril', 'buteyko', 'wim_hof', 'paced'],
    };
    mbTypeSelect.addEventListener('change', () => {
      const type = mbTypeSelect.value;
      const container2 = container.querySelector('#mb-subtype-container');
      const label = container.querySelector('#mb-subtype-label');
      const select = container.querySelector('#mb-subtype-select');
      if (subtypeData[type]) {
        if (container2) container2.style.display = 'block';
        if (label) label.textContent = type === 'breathing' ? 'Breathing Technique' : type.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Style/Form';
        if (select) {
          select.innerHTML = '<option value="">Select...</option>' +
            subtypeData[type].map(s => `<option value="${esc(s)}">${esc(s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</option>`).join('');
        }
      } else {
        if (container2) container2.style.display = 'none';
      }
    });
  }

  /* Library search/filter */
  const libSearch = container.querySelector('#lib-search');
  const libCategory = container.querySelector('#lib-category');
  const libGrade = container.querySelector('#lib-grade');
  if (libSearch) {
    const filterLibrary = () => {
      const q = (libSearch.value || '').toLowerCase();
      const cat = libCategory?.value || 'all';
      const grade = libGrade?.value || 'all';
      const filtered = THERAPY_DATABASE.filter(t => {
        const matchesQ = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.conditions.some(c => c.toLowerCase().includes(q));
        const matchesCat = cat === 'all' || t.category === cat;
        const matchesGrade = grade === 'all' || t.evidence_grade === grade;
        return matchesQ && matchesCat && matchesGrade;
      });
      const tbody = container.querySelector('#lib-table tbody');
      if (tbody) tbody.innerHTML = _renderLibraryRows(filtered);
    };
    libSearch.addEventListener('input', filterLibrary);
    if (libCategory) libCategory.addEventListener('change', filterLibrary);
    if (libGrade) libGrade.addEventListener('change', filterLibrary);
  }
}

function _renderLibraryRows(therapies) {
  if (!therapies.length) return '<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px">No therapies match your criteria.</td></tr>';
  return therapies.map((t, idx) => `
    <tr data-library-row="${idx}" style="cursor:pointer" onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background='transparent'"
      onclick="const el=this.nextElementSibling;el.style.display=el.style.display==='none'?'table-row':'none'">
      <td style="padding:10px;border-bottom:1px solid var(--border);font-weight:500;font-size:12px">${esc(t.name)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;text-transform:capitalize">${esc(t.category.replace(/-/g, ' '))}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${esc(t.description.substring(0, 60))}...</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-tertiary)">${esc(t.conditions.slice(0, 3).join(', '))}${t.conditions.length > 3 ? '...' : ''}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">${_evidenceGradePill(t.evidence_grade)}</td>
      <td style="padding:10px;border-bottom:1px solid var(--border);text-align:center">${t.contraindications.length > 0 ? `<span style="color:var(--amber);font-size:11px">${t.contraindications.length} listed</span>` : '<span style="color:var(--green);font-size:11px">None</span>'}</td>
    </tr>
    <tr style="display:none">
      <td colspan="6" style="padding:12px 16px;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)">
        <div style="font-size:12px;line-height:1.6">
          <div style="font-weight:600;margin-bottom:4px">${esc(t.name)}</div>
          <div style="color:var(--text-secondary);margin-bottom:6px">${esc(t.description)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:6px"><strong>Mechanism:</strong> ${esc(t.mechanism)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">
            <span style="font-size:10px;color:var(--text-tertiary)"><strong>Conditions:</strong></span>
            ${t.conditions.map(c => `<span class="pill" style="font-size:10px;padding:1px 6px">${esc(c)}</span>`).join('')}
          </div>
          <div style="padding:6px;border-radius:4px;background:rgba(255,176,87,0.06);border:1px solid rgba(255,176,87,0.15);font-size:10px;color:var(--amber);margin-bottom:6px">
            <strong>Contraindications:</strong> ${esc(t.contraindications.join('; '))}
          </div>
          <div style="font-size:10px;color:var(--blue)"><strong>Practitioner requirement:</strong> ${esc(t.practitioner_req)}</div>
        </div>
      </td>
    </tr>
  `).join('');
}

function _handleFormSubmit(formType, payload, formElement) {
  const patientId = payload[`${formType === 'protocol' ? 'proto' : formType === 'mindbody' ? 'mb' : formType === 'music-art' ? 'ma' : formType === 'massage' ? 'mass' : formType === 'pbm' ? 'pbm' : formType === 'ces' ? 'ces' : formType === 'neurofeedback' ? 'nf' : 'acu'}-patient`] || payload.patient_id;
  if (!patientId) {
    alert('Please select a patient.');
    return;
  }

  console.log(`[Complementary] Logging ${formType} session for patient ${patientId}:`, payload);

  /* In production: api.post('/complementary/' + formType, payload) */
  if (!isDemoSession()) {
    api.post(`/complementary/${formType}`, payload)
      .then(() => {
        alert('Session logged successfully.');
        formElement.reset();
      })
      .catch(err => {
        console.error('Failed to log session:', err);
        alert('Failed to log session. Please try again.');
      });
  } else {
    /* Demo mode: simulate success */
    setTimeout(() => {
      alert(`[DEMO] ${formType} session logged successfully for ${DEMO_PATIENTS.find(p => p.patient_id === patientId)?.patient_name || patientId}.\n\nIn production, this would be saved to the database.`);
      formElement.reset();
    }, 300);
  }
}

/** ================================================================== */
/*  TEST API EXPORT                                                    */
/** ================================================================== */
export function __complementaryTestApi__() {
  return {
    /* Data access */
    getTherapyDatabase: () => THERAPY_DATABASE,
    getDemoPatients: () => DEMO_PATIENTS,
    getDemoProtocols: () => DEMO_PROTOCOLS,
    getEvidenceSummary: () => DEMO_EVIDENCE_SUMMARY,
    /* Render functions (for unit testing) */
    renderDashboard: () => _renderDashboard({}),
    renderAcupuncture: () => _renderAcupuncture({}),
    renderNeurofeedback: () => _renderNeurofeedback({}),
    renderCES: () => _renderCES({}),
    renderPBM: () => _renderPBM({}),
    renderMindBody: () => _renderMindBody({}),
    renderMassage: () => _renderMassage({}),
    renderMusicArt: () => _renderMusicArt({}),
    renderTherapyLibrary: () => _renderTherapyLibrary({}),
    renderSafetyEvidence: () => _renderSafetyEvidence({}),
    renderProtocolBuilder: () => _renderProtocolBuilder({}),
    /* Utility functions */
    statusPill: _statusPill,
    evidenceGradePill: _evidenceGradePill,
    safetyAlertPill: _safetyAlertPill,
    sparkline: _sparkline,
    miniPieChart: _miniPieChart,
    esc,
    /* Constants */
    MODULE_TABS: _MODULE_TABS.map(t => t.key),
    THERAPY_COUNT: THERAPY_DATABASE.length,
    PROTOCOL_COUNT: DEMO_PROTOCOLS.length,
  };
}


/** ================================================================== */
/*  ADDITIONAL UTILITY EXPORTS                                         */
/** ================================================================== */

/**
 * Generate a printable session summary for a given patient and modality.
 * Returns an HTML string suitable for printing or PDF export.
 */
export function generateSessionSummary(patientId, modality, sessions) {
  if (!Array.isArray(sessions) || !sessions.length) {
    return `<div style="padding:24px;color:var(--text-secondary)">No sessions recorded for ${esc(modality)}.</div>`;
  }
  const rows = sessions.map((s, i) => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd">${i + 1}</td>
      <td style="padding:8px;border:1px solid #ddd">${esc(s.session_date || '—')}</td>
      <td style="padding:8px;border:1px solid #ddd">${esc(s.session_number || '—')}</td>
      <td style="padding:8px;border:1px solid #ddd">${esc(JSON.stringify(s).slice(0, 100))}...</td>
    </tr>
  `).join('');
  return `<div style="font-family:system-ui,sans-serif;padding:24px">
    <h2 style="font-size:16px;margin-bottom:8px">Session Summary — ${esc(modality)}</h2>
    <p style="font-size:12px;color:#666;margin-bottom:16px">Patient: ${esc(patientId)} · Generated: ${new Date().toLocaleString()}</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px">
      <thead>
        <tr style="background:#f5f5f5">
          <th style="padding:8px;border:1px solid #ddd;text-align:left">#</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Date</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Session</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left">Data</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:10px;color:#999;margin-top:16px">This summary is generated for clinical documentation purposes only.</p>
  </div>`;
}

/**
 * Validate a complementary session form payload for required fields.
 * Returns an array of error messages (empty if valid).
 */
export function validateSessionPayload(modality, payload) {
  const errors = [];
  if (!payload) {
    errors.push('Payload is required.');
    return errors;
  }
  if (!payload.patient_id) {
    errors.push('Patient ID is required.');
  }
  if (!payload.session_date) {
    errors.push('Session date is required.');
  }
  switch (modality) {
    case 'acupuncture':
      if (!payload.points) errors.push('Acupuncture points are required.');
      if (!payload.condition) errors.push('Condition treated is required.');
      break;
    case 'neurofeedback':
      if (!payload.protocol) errors.push('Protocol selection is required.');
      if (!payload.site) errors.push('Electrode site is required.');
      break;
    case 'ces':
      if (!payload.current_ua) errors.push('Current (μA) is required.');
      if (!payload.frequency_hz) errors.push('Frequency is required.');
      break;
    case 'pbm':
      if (!payload.wavelength_nm) errors.push('Wavelength is required.');
      if (!payload.site) errors.push('Treatment site is required.');
      break;
    case 'mindbody':
      if (!payload.type) errors.push('Practice type is required.');
      break;
    case 'massage':
      if (!payload.type) errors.push('Massage type is required.');
      break;
    case 'music-art':
      if (!payload.modality) errors.push('Modality is required.');
      break;
    default:
      break;
  }
  return errors;
}

/**
 * Calculate progress metrics from a series of session scores.
 */
export function calculateProgressMetrics(sessions, scoreKey) {
  if (!Array.isArray(sessions) || sessions.length < 2) {
    return { trend: 'insufficient_data', percentChange: 0, sessionsAnalyzed: sessions?.length || 0 };
  }
  const scores = sessions.map(s => Number(s[scoreKey]) || 0).filter(v => !isNaN(v));
  if (scores.length < 2) {
    return { trend: 'insufficient_data', percentChange: 0, sessionsAnalyzed: scores.length };
  }
  const first = scores[0];
  const last = scores[scores.length - 1];
  const pctChange = first !== 0 ? ((last - first) / first) * 100 : 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    trend: pctChange < -10 ? 'improving' : pctChange > 10 ? 'worsening' : 'stable',
    percentChange: Number(pctChange.toFixed(1)),
    average: Number(avg.toFixed(1)),
    firstScore: first,
    lastScore: last,
    sessionsAnalyzed: scores.length,
    direction: scoreKey.includes('after') || scoreKey.includes('vas') ? 'lower_is_better' : 'higher_is_better',
  };
}

/**
 * Get evidence summary for a therapy category.
 */
export function getEvidenceSummaryForCategory(category) {
  const therapies = THERAPY_DATABASE.filter(t => t.category === category);
  if (!therapies.length) return { count: 0, averageGrade: 'N/A', gradeDistribution: {} };
  const gradeValues = { A: 4, B: 3, C: 2, D: 1 };
  const dist = therapies.reduce((acc, t) => {
    acc[t.evidence_grade] = (acc[t.evidence_grade] || 0) + 1;
    return acc;
  }, {});
  const avg = therapies.reduce((s, t) => s + (gradeValues[t.evidence_grade] || 0), 0) / therapies.length;
  const gradeLabels = { 4: 'A', 3: 'B', 2: 'C', 1: 'D' };
  return {
    count: therapies.length,
    averageGrade: gradeLabels[Math.round(avg)] || 'N/A',
    gradeDistribution: dist,
    therapies: therapies.map(t => ({ name: t.name, grade: t.evidence_grade })),
  };
}

// ── Multimodal Integration Panel ─────────────────────────────────────────

function _renderComplementaryIntegrationPanel(patientId) {
  return `<div class="ch-card">
    <div class="ch-card-title">Multimodal Integration</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
      <a href="#/medication-analyzer?patient=${patientId}" class="ch-link">Medications</a>
      <a href="#/research-evidence?topic=complementary" class="ch-link">Evidence Research</a>
      <a href="#/biomarkers?patient=${patientId}" class="ch-link">Biomarkers</a>
      <a href="#/risk?patient=${patientId}" class="ch-link">Risk Analyzer</a>
      <a href="#/genetic-analyzer?patient=${patientId}" class="ch-link">Genetic Analysis</a>
      <a href="#/nutrition-analyzer?patient=${patientId}" class="ch-link">Nutrition</a>
      <a href="#/wellness?patient=${patientId}" class="ch-link">Wellness</a>
      <a href="#/deeptwin?patient=${patientId}" class="ch-link">DeepTwin</a>
    </div>
  </div>`;
}

// Default export for module entry point
export default {
  renderPage,
  complementaryInterventionsAllowsRole,
  __complementaryTestApi__,
  generateSessionSummary,
  validateSessionPayload,
  calculateProgressMetrics,
  getEvidenceSummaryForCategory,
};
