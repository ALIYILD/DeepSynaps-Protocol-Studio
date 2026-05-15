// ─────────────────────────────────────────────────────────────────────────────
// pages-rehab.js — Rehab / Physiotherapy Intervention Platform
// DeepSynaps Protocol Studio
//
// Pages:
//   pgRehabDashboard      — KPIs, patient list, alerts, trends
//   pgRehabPatientProfile — Diagnosis, timeline, progress charts, ROM
//   pgRehabAssessments    — FMA, BBS, TUG, 6MWT, 10MWT, MAS, ROM, MMT
//   pgRehabExercises      — Exercise library (130+ exercises), search/filter
//   pgRehabProtocolBuilder — Protocol templates, drag-drop, exercise builder
//   pgRehabSessions       — Session logging, adherence, pain/fatigue tracking
//   pgRehabIntegration    — Links to biomarkers, qEEG, MRI, medications, DeepTwin
//
// Clinical safety: All content includes evidence grades and disclaimers.
// ─────────────────────────────────────────────────────────────────────────────

import { api } from './api.js';

const REHAB_ROLES = new Set(['clinician', 'admin', 'clinic-admin', 'supervisor', 'therapist']);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function rehabAllowsRole(role) {
  return REHAB_ROLES.has(String(role || '').trim().toLowerCase());
}

// ──────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────

function _statusPill(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'critical' || s === 'acute') return '<span class="pill" style="background:rgba(255,107,107,0.16);color:var(--red);border:1px solid rgba(255,107,107,0.32);font-weight:700">⚠ Critical</span>';
  if (s === 'active') return '<span class="pill pill-active">Active</span>';
  if (s === 'achieved') return '<span class="pill" style="background:rgba(74,222,128,0.14);color:var(--green);border:1px solid rgba(74,222,128,0.30)">Achieved</span>';
  if (s === 'on_hold') return '<span class="pill pill-pending">On Hold</span>';
  if (s === 'subacute') return '<span class="pill" style="background:rgba(96,165,250,0.12);color:var(--blue);border:1px solid rgba(96,165,250,0.25)">Subacute</span>';
  if (s === 'chronic' || s === 'maintenance') return '<span class="pill" style="background:rgba(167,139,250,0.12);color:#a78bfa;border:1px solid rgba(167,139,250,0.25)">Maintenance</span>';
  if (s === 'warning' || s === 'plateau') return '<span class="pill" style="background:rgba(255,176,87,0.14);color:var(--amber);border:1px solid rgba(255,176,87,0.30)">⚠ Warning</span>';
  if (s === 'overdue') return '<span class="pill" style="background:rgba(255,107,107,0.14);color:var(--red);border:1px solid rgba(255,107,107,0.30);font-weight:700">Overdue</span>';
  return '<span class="pill pill-inactive">—</span>';
}

function _phaseColor(phase) {
  const p = String(phase || '').toLowerCase();
  if (p === 'acute') return 'var(--red)';
  if (p === 'subacute') return 'var(--blue)';
  if (p === 'chronic' || p === 'maintenance') return 'var(--green)';
  if (p === 'strengthening' || p === 'functional') return 'var(--amber)';
  if (p === 'prehab') return '#a78bfa';
  return 'var(--text-secondary)';
}

function _sparkline(data, color = 'var(--text-secondary)') {
  if (!Array.isArray(data) || data.length < 2) {
    return '<svg viewBox="0 0 120 32" width="120" height="32" style="display:block" aria-hidden="true"></svg>';
  }
  const w = 120, h = 32, pad = 2;
  let min = Math.min(...data), max = Math.max(...data);
  if (min === max) { min -= 1; max += 1; }
  const step = (w - pad * 2) / (data.length - 1);
  const coords = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastIdx = data.length - 1;
  const lx = pad + lastIdx * step;
  const ly = h - pad - ((data[lastIdx] - min) / (max - min)) * (h - pad * 2);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="display:block;color:${color}" role="img">
    <polyline fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" points="${coords}"/>
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="1.8" fill="currentColor"/>
  </svg>`;
}

function _barChart(categories, values, maxVal, colors) {
  if (!categories.length) return '<div style="color:var(--text-tertiary);font-size:12px">No data</div>';
  const bars = categories.map((cat, i) => {
    const v = values[i] || 0;
    const pct = maxVal > 0 ? Math.min(100, (v / maxVal) * 100) : 0;
    const color = colors?.[i] || 'var(--blue)';
    return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0">
      <div style="width:100px;font-size:10px;color:var(--text-secondary);text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cat)}</div>
      <div style="flex:1;height:18px;background:rgba(255,255,255,0.04);border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;display:flex;align-items:center;padding-left:6px">
          <span style="font-size:9px;color:#fff;font-weight:600">${v}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  return `<div style="display:flex;flex-direction:column;gap:2px">${bars}</div>`;
}

function _kpiCard(label, value, subtext, color = 'var(--blue)') {
  return `<div class="ch-card" style="flex:1;min-width:180px;padding:16px">
    <div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">${esc(label)}</div>
    <div style="font-size:28px;font-weight:700;color:${color};font-variant-numeric:tabular-nums">${esc(value)}</div>
    <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${esc(subtext)}</div>
  </div>`;
}

function _sectionHeader(title, subtitle = '') {
  return `<div style="margin-bottom:12px">
    <div style="font-size:15px;font-weight:600">${esc(title)}</div>
    ${subtitle ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(subtitle)}</div>` : ''}
  </div>`;
}

function _alertBanner(level, message) {
  const colors = {
    critical: { bg: 'rgba(255,107,107,0.10)', border: 'rgba(255,107,107,0.35)', text: 'var(--red)' },
    warning: { bg: 'rgba(255,176,87,0.10)', border: 'rgba(255,176,87,0.30)', text: 'var(--amber)' },
    info: { bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.25)', text: 'var(--blue)' },
  };
  const c = colors[level] || colors.info;
  return `<div style="padding:10px 14px;border-radius:10px;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:12px;margin-bottom:10px;display:flex;align-items:center;gap:8px">
    <span style="font-size:14px">${level === 'critical' ? '⚠' : level === 'warning' ? '⚡' : 'ℹ'}</span>
    <span>${esc(message)}</span>
  </div>`;
}

function _clinicalDisclaimer() {
  return `<div style="padding:10px 14px;border-radius:10px;background:rgba(255,176,87,0.06);border:1px solid rgba(255,176,87,0.20);margin-top:16px;font-size:11px;color:var(--text-secondary);line-height:1.5">
    <strong>Clinical disclaimer:</strong> This platform provides decision-support only. All exercise prescriptions and assessments must be reviewed by a licensed physiotherapist or physician. Contraindications listed are not exhaustive. Monitor for adverse events.
  </div>`;
}

function _renderRestrictedCard() {
  return `<div role="region" aria-label="Rehab access restricted" style="max-width:560px;margin:48px auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);text-align:center">
    <div style="font-size:15px;font-weight:600;margin-bottom:8px">Rehabilitation Platform</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">
      Rehabilitation intervention tools are restricted to clinical accounts because they include exercise prescriptions, assessment scoring, and patient-specific protocols that require licensed oversight.
    </div>
  </div>`;
}

function _loadingSkeleton(count = 4) {
  return Array.from({ length: count }, () =>
    `<div style="height:80px;border-radius:10px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.08),rgba(255,255,255,.04));background-size:200% 100%;animation:dh2AttnPulse 1.6s ease-in-out infinite;margin-bottom:8px"></div>`
  ).join('');
}

// ──────────────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────────────

const _state = {
  patients: [],
  selectedPatientId: null,
  exercises: [],
  exerciseFilters: { category: '', bodyPart: '', equipment: '', difficulty: '', q: '' },
  protocolTemplates: [],
  currentProtocol: null,
  assessmentHistory: {},
  sessionHistory: [],
  goals: [],
  alerts: [],
  page: 'dashboard',
};

// ──────────────────────────────────────────────────────────────────────────
// API helpers
// ──────────────────────────────────────────────────────────────────────────

async function _fetchPatients(clinicId) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/patients?clinic_id=${esc(clinicId || '')}`, {
      headers: api.authHeaders?.() || {},
    });
    if (!res.ok) return _state.patients;
    const data = await res.json();
    _state.patients = data.patients || [];
    return _state.patients;
  } catch {
    // Demo fallback
    _state.patients = _demoPatients();
    return _state.patients;
  }
}

async function _fetchPatientProfile(patientId) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/patients/${esc(patientId)}`, {
      headers: api.authHeaders?.() || {},
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return _demoProfile(patientId);
  }
}

async function _fetchExercises(filters = {}) {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.bodyPart) params.set('body_part', filters.bodyPart);
  if (filters.equipment) params.set('equipment', filters.equipment);
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.q) params.set('q', filters.q);
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/exercises?${params.toString()}`, {
      headers: api.authHeaders?.() || {},
    });
    if (!res.ok) return _demoExercises(filters);
    const data = await res.json();
    _state.exercises = data.exercises || [];
    return _state.exercises;
  } catch {
    _state.exercises = _demoExercises(filters);
    return _state.exercises;
  }
}

async function _fetchTemplates() {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/templates`, {
      headers: api.authHeaders?.() || {},
    });
    if (!res.ok) return _demoTemplates();
    const data = await res.json();
    _state.protocolTemplates = data || [];
    return _state.protocolTemplates;
  } catch {
    _state.protocolTemplates = _demoTemplates();
    return _state.protocolTemplates;
  }
}

async function _submitAssessment(patientId, type, scores, metadata) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(api.authHeaders?.() || {}) },
      body: JSON.stringify({ patient_id: patientId, assessment_type: type, scores, metadata }),
    });
    if (!res.ok) return { error: 'Submission failed' };
    return await res.json();
  } catch {
    return _demoScoreAssessment(type, scores);
  }
}

async function _logSession(sessionData) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(api.authHeaders?.() || {}) },
      body: JSON.stringify(sessionData),
    });
    if (!res.ok) return { error: 'Session log failed' };
    return await res.json();
  } catch {
    return { session_id: `rs-${Date.now()}`, ...sessionData, adherence_pct: Math.round((sessionData.exercises_completed?.length || 0) / Math.max(sessionData.total_exercises_prescribed || 1, 1) * 100) };
  }
}

async function _fetchProgress(patientId) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/progress/${esc(patientId)}`, {
      headers: api.authHeaders?.() || {},
    });
    if (!res.ok) return _demoProgress(patientId);
    return await res.json();
  } catch {
    return _demoProgress(patientId);
  }
}

async function _fetchGoals(patientId) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/goals/${esc(patientId)}`, {
      headers: api.authHeaders?.() || {},
    });
    if (!res.ok) return _demoGoals();
    return await res.json();
  } catch {
    return _demoGoals();
  }
}

async function _createProtocol(protocolData) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/protocols`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(api.authHeaders?.() || {}) },
      body: JSON.stringify(protocolData),
    });
    if (!res.ok) return { error: 'Protocol creation failed' };
    return await res.json();
  } catch {
    return { protocol_id: `rp-${Date.now()}`, ...protocolData, created_at: new Date().toISOString(), status: 'active' };
  }
}

async function _fetchAssessmentForm(type) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/assessment-form/${esc(type)}`, {
      headers: api.authHeaders?.() || {},
    });
    if (!res.ok) return _demoFormSchema(type);
    return await res.json();
  } catch {
    return _demoFormSchema(type);
  }
}

async function _fetchSafetyAlerts(patientId) {
  try {
    const res = await fetch(`${api.baseUrl || ''}/api/v1/rehab/safety-alerts/${esc(patientId)}`, {
      headers: api.authHeaders?.() || {},
    });
    if (!res.ok) return { alerts: [] };
    return await res.json();
  } catch {
    return { alerts: _demoAlerts(patientId) };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Demo data (fallback when backend unavailable)
// ──────────────────────────────────────────────────────────────────────────

function _demoPatients() {
  return [
    { patient_id: 'rehab-pt-001', name: 'Elena Vasquez', age: 68, diagnosis: 'Left MCA Stroke', injury_type: 'ischemic_stroke', rehab_phase: 'subacute', sessions_this_week: 3, adherence_pct: 85, alerts: ['plateau_warning'] },
    { patient_id: 'rehab-pt-002', name: 'Marcus Chen', age: 45, diagnosis: 'ACL Reconstruction R', injury_type: 'sports_orthopedic', rehab_phase: 'strengthening', sessions_this_week: 4, adherence_pct: 92, alerts: [] },
    { patient_id: 'rehab-pt-003', name: 'Amelia Brown', age: 72, diagnosis: "Parkinson's Disease", injury_type: 'neurodegenerative', rehab_phase: 'maintenance', sessions_this_week: 2, adherence_pct: 78, alerts: ['overdue_assessment'] },
    { patient_id: 'rehab-pt-004', name: 'Omar Haddad', age: 55, diagnosis: 'Chronic Low Back Pain', injury_type: 'spine', rehab_phase: 'functional', sessions_this_week: 3, adherence_pct: 88, alerts: [] },
    { patient_id: 'rehab-pt-005', name: 'Samantha Li', age: 34, diagnosis: 'Vestibular Neuritis', injury_type: 'vestibular', rehab_phase: 'acute', sessions_this_week: 2, adherence_pct: 70, alerts: ['overdue_assessment'] },
    { patient_id: 'rehab-pt-006', name: 'James Wright', age: 62, diagnosis: 'COPD Gold III', injury_type: 'pulmonary', rehab_phase: 'stabilization', sessions_this_week: 3, adherence_pct: 82, alerts: [] },
    { patient_id: 'rehab-pt-007', name: 'Nina Patel', age: 8, diagnosis: 'CP Spastic Diplegia', injury_type: 'pediatric_neuro', rehab_phase: 'intensive', sessions_this_week: 5, adherence_pct: 95, alerts: ['plateau_warning'] },
    { patient_id: 'rehab-pt-008', name: 'Robert Kim', age: 78, diagnosis: 'Fall Risk / Balance Deficit', injury_type: 'geriatric_balance', rehab_phase: 'strengthening', sessions_this_week: 2, adherence_pct: 65, alerts: ['overdue_assessment'] },
    { patient_id: 'rehab-pt-009', name: 'Lisa Thompson', age: 51, diagnosis: 'Cardiac Rehab Post-MI', injury_type: 'cardiac', rehab_phase: 'supervised', sessions_this_week: 3, adherence_pct: 90, alerts: [] },
    { patient_id: 'rehab-pt-010', name: 'David Garcia', age: 41, diagnosis: 'Subacute Stroke', injury_type: 'hemorrhagic_stroke', rehab_phase: 'acute', sessions_this_week: 3, adherence_pct: 75, alerts: [] },
  ];
}

function _demoProfile(patientId) {
  const profiles = {
    'rehab-pt-001': {
      patient_id: 'rehab-pt-001', name: 'Elena Vasquez', age: 68, gender: 'female',
      diagnosis: 'Left MCA Ischemic Stroke', injury_type: 'ischemic_stroke',
      date_of_injury: '2024-10-15', rehab_phase: 'subacute', rehab_start_date: '2024-10-22',
      affected_side: 'left', dominant_hand: 'right', weight_kg: 68, height_cm: 162,
      timeline: [
        { date: '2024-10-15', event: 'Stroke onset', type: 'injury' },
        { date: '2024-10-16', event: 'tPA administered', type: 'intervention' },
        { date: '2024-10-22', event: 'Rehabilitation commenced', type: 'rehab_start' },
        { date: '2024-11-15', event: 'FMA-UE: 28 (moderate)', type: 'milestone' },
        { date: '2024-12-01', event: 'FMA-UE: 34 (approaching mild)', type: 'current' },
      ],
      current_goals: [
        { id: 'g-1', description: 'FMA-UE score > 40', target_date: '2024-12-15', status: 'active' },
        { id: 'g-2', description: 'Independent dressing', target_date: '2024-12-30', status: 'active' },
        { id: 'g-3', description: 'Community ambulation with stick', target_date: '2025-01-15', status: 'active' },
      ],
      medications: ['Baclofen 5mg TDS', 'Aspirin 100mg OD'],
      precautions: ['Shoulder subluxation risk - limit passive ROM > 90 deg'],
    },
  };
  return profiles[patientId] || { patient_id: patientId, name: 'Unknown', timeline: [], current_goals: [] };
}

function _demoExercises(filters) {
  let exs = [
    { id: 'ex-001', name: 'Quad Sets', category: 'strengthening', body_parts: ['knee'], equipment: ['none'], difficulty: 'beginner', description: 'Isometric quadriceps contraction with knee extended.', sets_reps: '3 x 10', frequency: 'Daily', progression: 'Add ankle weight', contraindications: ['Acute knee inflammation'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-002', name: 'Straight Leg Raise', category: 'strengthening', body_parts: ['hip', 'knee'], equipment: ['none'], difficulty: 'beginner', description: 'Supine hip flexion with knee extended.', sets_reps: '3 x 10', frequency: 'Daily', progression: 'Add ankle weight', contraindications: ['Lumbar radiculopathy'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-007', name: 'Bridging', category: 'strengthening', body_parts: ['hip', 'lumbar_spine'], equipment: ['none'], difficulty: 'beginner', description: 'Supine with knees flexed, lift pelvis to neutral.', sets_reps: '3 x 10', frequency: 'Daily', progression: 'Single leg bridge', contraindications: ['Acute lumbar disc'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-031', name: 'Hamstring Stretch Supine', category: 'stretching', body_parts: ['knee', 'hip'], equipment: ['resistance_band'], difficulty: 'beginner', description: 'Supine, band around foot, straighten knee. Hold 30s.', sets_reps: '3 x 30s', frequency: 'Daily', progression: 'Increase range', contraindications: ['Sciatica'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-049', name: 'Single Leg Stand', category: 'balance', body_parts: ['ankle', 'hip', 'knee'], equipment: ['none'], difficulty: 'beginner', description: 'Stand on one leg near support. Hold 10-30s.', sets_reps: '3 x 30s', frequency: 'Daily', progression: 'Eyes closed, foam pad', contraindications: ['Fall risk without support'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-050', name: 'Tandem Stance', category: 'balance', body_parts: ['ankle', 'hip', 'knee'], equipment: ['none'], difficulty: 'beginner', description: 'Heel-to-toe standing. Hold 30s.', sets_reps: '3 x 30s', frequency: 'Daily', progression: 'Eyes closed, on foam', contraindications: ['Severe balance deficit'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-058', name: 'Sit-to-Stand', category: 'balance', body_parts: ['knee', 'hip'], equipment: ['none'], difficulty: 'beginner', description: 'Rise from chair without using arms.', sets_reps: '3 x 10', frequency: 'Daily', progression: 'Lower chair, single leg', contraindications: ['Recent knee surgery'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-061', name: 'Treadmill Walking', category: 'gait', body_parts: ['hip', 'knee', 'ankle'], equipment: ['treadmill'], difficulty: 'beginner', description: 'Belt walking with handrails as needed.', sets_reps: '10-20 min', frequency: 'Daily', progression: 'Increase speed, reduce support', contraindications: ['Unstable cardiac'], evidence_grade: 'A', duration_min: 15 },
    { id: 'ex-071', name: 'Stationary Cycling', category: 'cardio', body_parts: ['knee', 'hip'], equipment: ['exercise_bike'], difficulty: 'beginner', description: 'Upright or recumbent cycling.', sets_reps: '10-20 min', frequency: 'Daily', progression: 'Increase resistance', contraindications: ['Recent ACL <6 weeks'], evidence_grade: 'A', duration_min: 15 },
    { id: 'ex-082', name: 'Mirror Therapy', category: 'neuromuscular', body_parts: ['hand', 'wrist'], equipment: ['none'], difficulty: 'beginner', description: 'Mirror box: observe unaffected hand reflection.', sets_reps: '15 min', frequency: 'Daily', progression: 'Complex grasp tasks', contraindications: ['Severe visual impairment'], evidence_grade: 'A', duration_min: 15 },
    { id: 'ex-084', name: 'Task-Oriented Training (Upper)', category: 'neuromuscular', body_parts: ['shoulder', 'elbow', 'wrist', 'hand'], equipment: ['none'], difficulty: 'intermediate', description: 'Repetitive practice of functional tasks.', sets_reps: '100-300 reps/task', frequency: 'Daily', progression: 'Increase complexity', contraindications: ['Severe neglect'], evidence_grade: 'A', duration_min: 30 },
    { id: 'ex-091', name: 'Finger-to-Nose', category: 'coordination', body_parts: ['elbow', 'shoulder'], equipment: ['none'], difficulty: 'beginner', description: 'Alternate touching nose and examiner finger.', sets_reps: '3 x 10', frequency: 'Daily', progression: 'Increase speed', contraindications: ['Severe ataxia'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-103', name: 'Diaphragmatic Breathing', category: 'breathing', body_parts: ['whole_body'], equipment: ['none'], difficulty: 'beginner', description: 'Belly breathing. Inhale 3s, exhale 6s.', sets_reps: '3 x 10 breaths', frequency: 'Daily', progression: 'Supine to sitting to standing', contraindications: ['None'], evidence_grade: 'A', duration_min: 5 },
    { id: 'ex-108', name: 'Brandt-Daroff Exercises', category: 'vestibular', body_parts: ['whole_body'], equipment: ['none'], difficulty: 'beginner', description: 'Seated to side-lying with head turned 45 deg.', sets_reps: '3 reps each side, 3x/day', frequency: 'Daily x 2 weeks', progression: 'Increase speed', contraindications: ['Cervical spine pathology'], evidence_grade: 'A', duration_min: 10 },
    { id: 'ex-123', name: 'LSBIG Amplitude Training', category: 'neuromuscular', body_parts: ['whole_body'], equipment: ['none'], difficulty: 'intermediate', description: 'Large amplitude movement training for PD.', sets_reps: '45 min session', frequency: 'Daily', progression: 'Complex dual-task', contraindications: ['Severe dyskinesia'], evidence_grade: 'A', duration_min: 45 },
  ];
  if (filters.category) exs = exs.filter(e => e.category === filters.category);
  if (filters.bodyPart) exs = exs.filter(e => e.body_parts.includes(filters.bodyPart));
  if (filters.equipment) exs = exs.filter(e => e.equipment.includes(filters.equipment));
  if (filters.difficulty) exs = exs.filter(e => e.difficulty === filters.difficulty);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    exs = exs.filter(e => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
  }
  return exs;
}

function _demoTemplates() {
  return [
    { id: 'tpl-stroke-ue-6w', name: 'Post-Stroke Upper Extremity (6-week)', duration_weeks: 6, condition: 'Stroke (Upper Extremity)', evidence_grade: 'A', phase_count: 3, outcome_measures: ['FMA-UE', 'WMFT', 'ARAT', 'mRS'] },
    { id: 'tpl-stroke-le-6w', name: 'Post-Stroke Lower Extremity (6-week)', duration_weeks: 6, condition: 'Stroke (Lower Extremity)', evidence_grade: 'A', phase_count: 3, outcome_measures: ['FMA-LE', 'BBS', 'TUG', '6MWT'] },
    { id: 'tpl-acl-12w', name: 'ACL Reconstruction (12-week)', duration_weeks: 12, condition: 'ACL Reconstruction', evidence_grade: 'A', phase_count: 4, outcome_measures: ['IKDC', 'KOOS', 'Single hop LSI'] },
    { id: 'tpl-clbp-8w', name: 'Chronic Low Back Pain (8-week)', duration_weeks: 8, condition: 'Chronic Low Back Pain', evidence_grade: 'A', phase_count: 3, outcome_measures: ['ODI', 'Roland-Morris', 'VAS'] },
    { id: 'tpl-parkinsons', name: "Parkinson's Disease", duration_weeks: 12, condition: "Parkinson's Disease", evidence_grade: 'A', phase_count: 3, outcome_measures: ['UPDRS-III', 'BBS', 'TUG', 'PDQ-39'] },
    { id: 'tpl-balance-8w', name: 'Balance/Fall Prevention (8-week)', duration_weeks: 8, condition: 'Fall Risk / Balance Deficit', evidence_grade: 'A', phase_count: 3, outcome_measures: ['BBS', 'TUG', 'FES-I', '6MWT'] },
    { id: 'tpl-cardiac-12w', name: 'Cardiac Rehabilitation (12-week)', duration_weeks: 12, condition: 'Cardiovascular Disease', evidence_grade: 'A', phase_count: 3, outcome_measures: ['6MWT', 'CPET', 'Duke Activity Status'] },
    { id: 'tpl-copd-8w', name: 'COPD Pulmonary Rehab (8-week)', duration_weeks: 8, condition: 'COPD', evidence_grade: 'A', phase_count: 3, outcome_measures: ['6MWT', 'CAT', 'mMRC', 'BODE'] },
    { id: 'tpl-vestibular-6w', name: 'Vestibular Rehabilitation (4-6 week)', duration_weeks: 6, condition: 'Vestibular Dysfunction', evidence_grade: 'A', phase_count: 3, outcome_measures: ['DHI', 'BBS', 'TUG', 'ABC'] },
    { id: 'tpl-cp-peds', name: 'Pediatric Cerebral Palsy', duration_weeks: 12, condition: 'Cerebral Palsy (Pediatric)', evidence_grade: 'A', phase_count: 3, outcome_measures: ['GMFM-66', 'PedsQL', 'CPCHILD'] },
  ];
}

function _demoProgress(patientId) {
  const fmaTrend = [22, 24, 28, 28, 31, 34];
  const bbsTrend = [38, 40, 42, 44, 46, 46];
  const tugTrend = [22.5, 20.1, 18.5, 16.2, 14.2, 14.0];
  const adherence = [60, 65, 70, 75, 80, 82, 85, 85, 88, 85];
  return {
    patient_id: patientId,
    generated_at: new Date().toISOString(),
    assessment_summary: {
      total_assessments: 18,
      latest_fugl_meyer_ue: fmaTrend[fmaTrend.length - 1],
      fma_trend: fmaTrend,
      latest_berg_balance: bbsTrend[bbsTrend.length - 1],
      bbs_trend: bbsTrend,
      latest_tug_seconds: tugTrend[tugTrend.length - 1],
      tug_trend: tugTrend,
    },
    session_summary: {
      total_sessions: 24,
      average_adherence_pct: 82,
      adherence_trend: adherence,
      session_dates: adherence.map((_, i) => `2024-11-${10 + i}`),
    },
    plateau_alert: {
      is_plateau: true,
      recent_scores: [31, 34, 34],
      max_change: 3,
      threshold: 3,
      message: 'FMA scores have plateaued - consider protocol modification',
    },
    milestone_projections: {
      projected_weeks: 4.5,
      current_score: 34,
      target_score: 40,
      improvement_rate_per_assessment: 2.4,
      confidence: 'medium',
    },
  };
}

function _demoGoals() {
  return [
    { goal_id: 'g-1', patient_id: 'rehab-pt-001', description: 'FMA-UE score > 40', status: 'active', target_date: '2024-12-15', progress_pct: 70 },
    { goal_id: 'g-2', patient_id: 'rehab-pt-001', description: 'Independent dressing', status: 'active', target_date: '2024-12-30', progress_pct: 40 },
    { goal_id: 'g-3', patient_id: 'rehab-pt-001', description: 'Community ambulation with stick', status: 'active', target_date: '2025-01-15', progress_pct: 25 },
    { goal_id: 'g-4', patient_id: 'rehab-pt-001', description: 'Berg Balance Scale > 45', status: 'achieved', target_date: '2024-11-20', progress_pct: 100 },
    { goal_id: 'g-5', patient_id: 'rehab-pt-001', description: 'TUG < 15 seconds', status: 'on_hold', target_date: '2025-01-30', progress_pct: 10 },
  ];
}

function _demoFormSchema(type) {
  const schemas = {
    fugl_meyer: { title: 'Fugl-Meyer Assessment', sections: { upper_extremity: { section_a: { label: 'Reflex + Flexor Synergy', items: [['ue_reflex', 'Reflexes (0-2)'], ['ue_shoulder_retraction', 'Shoulder retraction (0-2)'], ['ue_shoulder_elevation', 'Shoulder elevation (0-2)'], ['ue_shoulder_abduction', 'Shoulder abduction (0-2)'], ['ue_shoulder_ext_rotation', 'Shoulder ext rotation (0-2)'], ['ue_elbow_flexion', 'Elbow flexion (0-2)'], ['ue_forearm_supination', 'Forearm supination (0-2)']] } } } },
    berg_balance: { title: 'Berg Balance Scale', items: [['sitting_unsupported', 'Sitting unsupported'], ['sitting_to_standing', 'Sitting to standing'], ['standing_to_sitting', 'Standing to sitting'], ['transfers', 'Transfers'], ['standing_unsupported', 'Standing unsupported'], ['standing_eyes_closed', 'Standing eyes closed'], ['standing_feet_together', 'Standing feet together'], ['tandem_standing', 'Tandem standing'], ['standing_on_one_leg', 'Standing on one leg']] },
    timed_up_and_go: { title: 'Timed Up and Go', fields: [{ name: 'seconds', type: 'number', unit: 'seconds' }] },
    six_minute_walk: { title: '6-Minute Walk Test', fields: [{ name: 'metres', type: 'number', unit: 'metres' }] },
    ten_meter_walk: { title: '10-Meter Walk Test', fields: [{ name: 'seconds', type: 'number', unit: 'seconds' }, { name: 'distance_m', type: 'number', unit: 'metres' }] },
    modified_ashworth: { title: 'Modified Ashworth Scale', muscles: ['elbow_flexors', 'elbow_extensors', 'wrist_flexors', 'finger_flexors', 'hip_adductors', 'knee_extensors', 'ankle_plantarflexors'] },
    rom_goniometry: { title: 'ROM Goniometry', joints: { shoulder: ['flexion', 'extension', 'abduction', 'internal_rotation', 'external_rotation'], elbow: ['flexion', 'extension'], wrist: ['flexion', 'extension'] } },
    manual_muscle_test: { title: 'Manual Muscle Test', muscles: ['shoulder_flexion', 'shoulder_abduction', 'elbow_flexion', 'elbow_extension', 'wrist_flexion', 'hip_flexion', 'knee_extension', 'ankle_dorsiflexion'] },
  };
  return { assessment_type: type, ...(schemas[type] || { title: type, fields: [] }) };
}

function _demoScoreAssessment(type, scores) {
  const scorers = {
    fugl_meyer: () => ({ total_score: 34, upper_extremity_score: 22, upper_max: 66, lower_extremity_score: 12, lower_max: 34 }),
    berg_balance: () => ({ total_score: 46, max_score: 56, fall_risk_level: 'low' }),
    timed_up_and_go: () => ({ seconds: scores.seconds || 14.2, impairment_level: 'mild', fall_risk: true }),
    six_minute_walk: () => ({ metres: scores.metres || 320, percent_predicted: 68 }),
    ten_meter_walk: () => { const s = scores.seconds || 8.5; return { seconds: s, gait_speed_m_s: (scores.distance_m || 10) / s }; },
    modified_ashworth: () => ({ average_grade: 1.5, any_significant_spasticity: false }),
    rom_goniometry: () => ({ deficit_count: 2, significant_deficits: ['shoulder flexion deficit', 'wrist extension deficit'] }),
    manual_muscle_test: () => ({ average_grade: 3.5, functional_independence_likely: true }),
  };
  return { assessment_id: `ra-${Date.now()}`, assessment_type: type, submitted_at: new Date().toISOString(), result: (scorers[type] || scorers.fugl_meyer)() };
}

function _demoAlerts(patientId) {
  return [
    { level: 'warning', type: 'plateau', message: `Patient ${patientId}: FMA scores have plateaued over last 3 assessments. Consider protocol modification.`, action_required: 'Review protocol' },
    { level: 'info', type: 'assessment_due', message: 'Berg Balance Scale reassessment is due within 3 days.', action_required: 'Schedule assessment' },
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// Page: Dashboard
// ──────────────────────────────────────────────────────────────────────────

function renderRehabDashboard(container, ctx) {
  if (!rehabAllowsRole(ctx.role)) {
    container.innerHTML = _renderRestrictedCard();
    return;
  }

  const patients = _state.patients.length ? _state.patients : _demoPatients();
  const activeProtocols = patients.filter(p => p.adherence_pct > 0).length;
  const assessmentsThisWeek = patients.reduce((sum, p) => sum + (p.sessions_this_week || 0), 0);
  const goalsMet = patients.reduce((sum, p) => sum + (p.alerts.length === 0 ? 1 : 0), 0);
  const exercisesPrescribed = 156; // Static for demo
  const alerts = patients.flatMap(p => p.alerts.map(a => ({ patient: p.name, alert: a, patient_id: p.patient_id })));

  // Assessment score trends (mock data)
  const fmaTrend = [22, 24, 28, 28, 31, 34];
  const bbsTrend = [38, 40, 42, 44, 46, 46];

  container.innerHTML = `<div class="ch-layout" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:18px;font-weight:700">Rehabilitation Platform</div>
        <div style="font-size:11px;color:var(--text-tertiary)">Physiotherapy intervention management and exercise prescription</div>
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn btn-primary btn-sm" data-action="go-assessments">+ Assessment</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="go-sessions">+ Session</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="go-protocols">Protocol Builder</button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${_kpiCard('Active Protocols', activeProtocols, `${patients.length} patients enrolled`, 'var(--blue)')}
      ${_kpiCard('Sessions This Week', assessmentsThisWeek, 'Across all patients', 'var(--green)')}
      ${_kpiCard('Goals On Track', goalsMet, `${patients.length - goalsMet} with alerts`, 'var(--amber)')}
      ${_kpiCard('Exercises in Library', exercisesPrescribed, '130+ with evidence grades', '#a78bfa')}
    </div>

    <!-- Alerts Banner -->
    ${alerts.length ? `<div style="margin-bottom:16px">
      ${alerts.slice(0, 3).map(a => _alertBanner(
        a.alert === 'plateau_warning' ? 'warning' : 'critical',
        `${a.patient}: ${a.alert === 'plateau_warning' ? 'Progress plateau detected - FMA scores unchanged over 3 assessments' : 'Assessment overdue by >7 days'}`
      )).join('')}
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <!-- Patient List -->
      <div class="ch-card">
        ${_sectionHeader('Active Patients', 'Select a patient to view profile')}
        <div style="max-height:360px;overflow-y:auto">
          ${patients.map(p => `
            <div data-action="select-patient" data-patient-id="${esc(p.patient_id)}" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;cursor:pointer;margin-bottom:4px;border-left:3px solid ${_phaseColor(p.rehab_phase)}"
              onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
                <div style="font-size:10px;color:var(--text-tertiary)">${esc(p.diagnosis)} · ${esc(p.rehab_phase)}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:11px;font-weight:600;color:var(--green)">${p.adherence_pct}%</div>
                <div style="font-size:9px;color:var(--text-tertiary)">adherence</div>
              </div>
              <div style="flex-shrink:0">${_statusPill(p.alerts.length ? 'warning' : 'active')}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Assessment Trends -->
      <div class="ch-card">
        ${_sectionHeader('Assessment Score Trends', 'Last 6 assessments across cohort')}
        <div style="display:flex;flex-direction:column;gap:12px">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:11px;color:var(--text-secondary)">Fugl-Meyer UE (avg)</span>
              <span style="font-size:11px;font-weight:600;color:var(--blue)">${fmaTrend[fmaTrend.length - 1]}/66</span>
            </div>
            ${_sparkline(fmaTrend, 'var(--blue)')}
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:11px;color:var(--text-secondary)">Berg Balance (avg)</span>
              <span style="font-size:11px;font-weight:600;color:var(--green)">${bbsTrend[bbsTrend.length - 1]}/56</span>
            </div>
            ${_sparkline(bbsTrend, 'var(--green)')}
          </div>
          <div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(255,176,87,0.06)">
            <div style="font-size:10px;color:var(--amber);font-weight:600">⚡ Plateau Alert</div>
            <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">3 patients show no improvement in last 3 assessments. Review protocols.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions Row -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      <div class="ch-card" style="text-align:center;cursor:pointer" data-action="go-exercises" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
        <div style="font-size:24px;margin-bottom:4px">🏋️</div>
        <div style="font-size:12px;font-weight:600">Exercise Library</div>
        <div style="font-size:10px;color:var(--text-tertiary)">130+ exercises</div>
      </div>
      <div class="ch-card" style="text-align:center;cursor:pointer" data-action="go-assessments" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
        <div style="font-size:24px;margin-bottom:4px">📊</div>
        <div style="font-size:12px;font-weight:600">Assessments</div>
        <div style="font-size:10px;color:var(--text-tertiary)">8 validated tools</div>
      </div>
      <div class="ch-card" style="text-align:center;cursor:pointer" data-action="go-protocols" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
        <div style="font-size:24px;margin-bottom:4px">📋</div>
        <div style="font-size:12px;font-weight:600">Protocol Builder</div>
        <div style="font-size:10px;color:var(--text-tertiary)">10 templates</div>
      </div>
      <div class="ch-card" style="text-align:center;cursor:pointer" data-action="go-integration" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
        <div style="font-size:24px;margin-bottom:4px">🔗</div>
        <div style="font-size:12px;font-weight:600">Integration</div>
        <div style="font-size:10px;color:var(--text-tertiary)">Biomarkers, qEEG</div>
      </div>
    </div>

    ${_clinicalDisclaimer()}
  </div>`;

  _bindDashboardActions(container, ctx);
}

function _bindDashboardActions(container, ctx) {
  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', (e) => {
      const action = el.dataset.action;
      if (action === 'select-patient') {
        _state.selectedPatientId = el.dataset.patientId;
        _state.page = 'profile';
        ctx.navigate('rehab-profile');
      } else if (action === 'go-assessments') {
        _state.page = 'assessments';
        ctx.navigate('rehab-assessments');
      } else if (action === 'go-sessions') {
        _state.page = 'sessions';
        ctx.navigate('rehab-sessions');
      } else if (action === 'go-protocols') {
        _state.page = 'protocols';
        ctx.navigate('rehab-protocols');
      } else if (action === 'go-exercises') {
        _state.page = 'exercises';
        ctx.navigate('rehab-exercises');
      } else if (action === 'go-integration') {
        _state.page = 'integration';
        ctx.navigate('rehab-integration');
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Page: Patient Profile
// ──────────────────────────────────────────────────────────────────────────

function renderRehabPatientProfile(container, ctx) {
  if (!rehabAllowsRole(ctx.role)) {
    container.innerHTML = _renderRestrictedCard();
    return;
  }
  const patientId = _state.selectedPatientId || 'rehab-pt-001';
  const profile = _demoProfile(patientId);
  const progress = _demoProgress(patientId);

  container.innerHTML = `<div class="ch-layout" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" class="btn btn-ghost btn-sm" data-action="go-dashboard">← Back</button>
        <div>
          <div style="font-size:16px;font-weight:700">${esc(profile.name)} <span style="font-size:12px;font-weight:400;color:var(--text-secondary)">(${esc(profile.patient_id)})</span></div>
          <div style="font-size:11px;color:var(--text-tertiary)">${esc(profile.diagnosis)} · ${profile.age}y · ${esc(profile.gender || '')}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn btn-primary btn-sm" data-action="go-assessments">+ Assessment</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="go-sessions">+ Session</button>
        ${_statusPill(profile.rehab_phase)}
      </div>
    </div>

    <!-- Patient Info Card -->
    <div class="ch-card" style="margin-bottom:12px">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;font-size:11px">
        <div><strong style="color:var(--text-tertiary)">Injury:</strong> ${esc(profile.diagnosis)}<br/>
             <strong style="color:var(--text-tertiary)">Date:</strong> ${esc(profile.date_of_injury || 'N/A')}</div>
        <div><strong style="color:var(--text-tertiary)">Affected side:</strong> ${esc(profile.affected_side || 'N/A')}<br/>
             <strong style="color:var(--text-tertiary)">Dominant:</strong> ${esc(profile.dominant_hand || 'N/A')}</div>
        <div><strong style="color:var(--text-tertiary)">Weight:</strong> ${profile.weight_kg || 'N/A'} kg<br/>
             <strong style="color:var(--text-tertiary)">Height:</strong> ${profile.height_cm || 'N/A'} cm</div>
        <div><strong style="color:var(--text-tertiary)">Meds:</strong> ${(profile.medications || []).map(m => esc(m)).join(', ')}</div>
      </div>
      ${(profile.precautions || []).length ? `<div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:rgba(255,107,107,0.08);border:1px solid rgba(255,107,107,0.20);font-size:10px;color:var(--red)">
        <strong>Precautions:</strong> ${esc(profile.precautions.join('; '))}
      </div>` : ''}
    </div>

    <!-- Timeline -->
    <div class="ch-card" style="margin-bottom:12px">
      ${_sectionHeader('Rehabilitation Timeline')}
      <div style="position:relative;padding-left:20px">
        <div style="position:absolute;left:6px;top:0;bottom:0;width:2px;background:var(--border)"></div>
        ${(profile.timeline || []).map((t, i) => `
          <div style="position:relative;margin-bottom:10px;display:flex;align-items:flex-start;gap:10px">
            <div style="position:absolute;left:-17px;top:4px;width:10px;height:10px;border-radius:50%;background:${t.type === 'injury' ? 'var(--red)' : t.type === 'milestone' ? 'var(--green)' : 'var(--blue)'};border:2px solid var(--bg-card)"></div>
            <div style="font-size:10px;color:var(--text-tertiary);white-space:nowrap">${esc(t.date)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${esc(t.event)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Progress Charts -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="ch-card">
        ${_sectionHeader('Fugl-Meyer Upper Extremity', 'Max 66')}
        <div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin-bottom:8px">
          ${(progress.assessment_summary.fma_trend || []).map((v, i) => {
            const pct = (v / 66) * 100;
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="font-size:9px;color:var(--text-tertiary)">${v}</div>
              <div style="width:100%;height:${pct}%;background:linear-gradient(to top,var(--blue),rgba(96,165,250,0.4));border-radius:4px 4px 0 0;min-height:4px"></div>
              <div style="font-size:8px;color:var(--text-tertiary)">W${i + 1}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="font-size:10px;color:var(--text-tertiary)">MCID: 6 points · Current: ${progress.assessment_summary.latest_fugl_meyer_ue}/66</div>
      </div>
      <div class="ch-card">
        ${_sectionHeader('Berg Balance Scale', 'Max 56 · Fall risk < 45')}
        <div style="display:flex;align-items:flex-end;gap:4px;height:120px;margin-bottom:8px">
          ${(progress.assessment_summary.bbs_trend || []).map((v, i) => {
            const pct = (v / 56) * 100;
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
              <div style="font-size:9px;color:var(--text-tertiary)">${v}</div>
              <div style="width:100%;height:${pct}%;background:linear-gradient(to top,var(--green),rgba(74,222,128,0.4));border-radius:4px 4px 0 0;min-height:4px"></div>
              <div style="font-size:8px;color:var(--text-tertiary)">W${i + 1}</div>
            </div>`;
          }).join('')}
        </div>
        <div style="font-size:10px;color:var(--text-tertiary)">MCID: 4 points · Current: ${progress.assessment_summary.latest_berg_balance}/56</div>
      </div>
    </div>

    <!-- TUG + 6MWT -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="ch-card">
        ${_sectionHeader('Timed Up and Go', 'Seconds · Lower is better')}
        <div style="padding:12px 0">
          ${_sparkline(progress.assessment_summary.tug_trend || [], 'var(--amber)')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:8px">
          <span style="color:var(--text-tertiary)">Latest: <strong style="color:var(--amber)">${progress.assessment_summary.latest_tug_seconds}s</strong></span>
          <span style="color:var(--text-tertiary)">Fall risk: <strong style="color:${(progress.assessment_summary.latest_tug_seconds || 0) > 12 ? 'var(--red)' : 'var(--green)'}">${(progress.assessment_summary.latest_tug_seconds || 0) > 12 ? 'YES' : 'No'}</strong></span>
        </div>
      </div>
      <div class="ch-card">
        ${_sectionHeader('6-Minute Walk Test', 'Metres')}
        <div style="display:flex;align-items:center;gap:12px;padding:16px">
          <div style="font-size:36px;font-weight:700;color:var(--blue)">320<span style="font-size:14px;color:var(--text-tertiary)">m</span></div>
          <div style="flex:1">
            <div style="font-size:10px;color:var(--text-tertiary)">Predicted normal: 470m</div>
            <div style="font-size:10px;color:var(--text-tertiary)">% predicted: 68%</div>
            <div style="margin-top:6px;height:8px;border-radius:4px;background:rgba(255,255,255,0.05);overflow:hidden">
              <div style="width:68%;height:100%;background:linear-gradient(90deg,var(--blue),rgba(96,165,250,0.5));border-radius:4px"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Goals -->
    <div class="ch-card" style="margin-bottom:12px">
      ${_sectionHeader('Active Goals')}
      ${(profile.current_goals || []).map(g => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:12px;font-weight:500">${esc(g.description)}</div>
            <div style="font-size:10px;color:var(--text-tertiary)">Target: ${esc(g.target_date)}</div>
          </div>
          <div style="width:80px">
            <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.05);overflow:hidden">
              <div style="width:${g.status === 'achieved' ? 100 : 70}%;height:100%;background:${g.status === 'achieved' ? 'var(--green)' : 'var(--blue)'};border-radius:3px"></div>
            </div>
            <div style="font-size:9px;color:var(--text-tertiary);text-align:center;margin-top:2px">${g.status === 'achieved' ? '100%' : '70%'}</div>
          </div>
          ${_statusPill(g.status)}
        </div>
      `).join('')}
    </div>

    ${_clinicalDisclaimer()}
  </div>`;

  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'go-dashboard') { _state.page = 'dashboard'; ctx.navigate('rehab'); }
      else if (action === 'go-assessments') { _state.page = 'assessments'; ctx.navigate('rehab-assessments'); }
      else if (action === 'go-sessions') { _state.page = 'sessions'; ctx.navigate('rehab-sessions'); }
    });
  });
}


// ──────────────────────────────────────────────────────────────────────────
// Page: Assessment Tools
// ──────────────────────────────────────────────────────────────────────────

function renderRehabAssessments(container, ctx) {
  if (!rehabAllowsRole(ctx.role)) {
    container.innerHTML = _renderRestrictedCard();
    return;
  }

  const assessmentTypes = [
    { id: 'fugl_meyer', name: 'Fugl-Meyer Assessment', icon: '🧠', desc: 'Motor function (UE 0-66, LE 0-34)', color: 'var(--blue)' },
    { id: 'berg_balance', name: 'Berg Balance Scale', icon: '⚖️', desc: '14 items, 0-4 each (max 56)', color: 'var(--green)' },
    { id: 'timed_up_and_go', name: 'Timed Up and Go', icon: '⏱️', desc: 'Seconds to stand, walk 3m, return', color: 'var(--amber)' },
    { id: 'six_minute_walk', name: '6-Minute Walk Test', icon: '🚶', desc: 'Distance in metres over 6 minutes', color: 'var(--blue)' },
    { id: 'ten_meter_walk', name: '10-Meter Walk Test', icon: '🏃', desc: 'Gait speed in m/s', color: 'var(--green)' },
    { id: 'modified_ashworth', name: 'Modified Ashworth Scale', icon: '💪', desc: 'Spasticity grading 0-4 per muscle', color: 'var(--amber)' },
    { id: 'rom_goniometry', name: 'ROM Goniometry', icon: '📐', desc: 'Joint range of motion in degrees', color: '#a78bfa' },
    { id: 'manual_muscle_test', name: 'Manual Muscle Test', icon: '🔬', desc: 'Strength grading 0-5 per muscle', color: 'var(--blue)' },
  ];

  container.innerHTML = `<div class="ch-layout" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" class="btn btn-ghost btn-sm" data-action="go-dashboard">← Back</button>
        <div>
          <div style="font-size:16px;font-weight:700">Assessment Tools</div>
          <div style="font-size:11px;color:var(--text-tertiary)">8 validated outcome measures with automatic scoring</div>
        </div>
      </div>
    </div>

    <!-- Assessment Type Grid -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      ${assessmentTypes.map(at => `
        <div class="ch-card" style="cursor:pointer;transition:all 0.15s" data-action="open-assessment" data-type="${esc(at.id)}"
          onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'"
          onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='none'">
          <div style="font-size:28px;margin-bottom:6px;text-align:center">${at.icon}</div>
          <div style="font-size:12px;font-weight:600;text-align:center;margin-bottom:4px;color:${at.color}">${esc(at.name)}</div>
          <div style="font-size:10px;color:var(--text-tertiary);text-align:center">${esc(at.desc)}</div>
        </div>
      `).join('')}
    </div>

    <!-- Assessment Form Area -->
    <div id="rehab-assessment-form-area" style="margin-bottom:16px"></div>

    <!-- Recent Assessments -->
    <div class="ch-card">
      ${_sectionHeader('Recent Assessments')}
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px">
          <thead>
            <tr style="border-bottom:1px solid var(--border)">
              <th style="padding:8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase">Date</th>
              <th style="padding:8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase">Type</th>
              <th style="padding:8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase">Score</th>
              <th style="padding:8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase">Change</th>
              <th style="padding:8px;text-align:left;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
              <td style="padding:8px">2024-12-01</td>
              <td style="padding:8px;color:var(--blue)">Fugl-Meyer UE</td>
              <td style="padding:8px;font-weight:600">34/66</td>
              <td style="padding:8px;color:var(--green)">+3</td>
              <td style="padding:8px">${_statusPill('warning')}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
              <td style="padding:8px">2024-12-01</td>
              <td style="padding:8px;color:var(--green)">Berg Balance</td>
              <td style="padding:8px;font-weight:600">46/56</td>
              <td style="padding:8px;color:var(--green)">+2</td>
              <td style="padding:8px">${_statusPill('active')}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
              <td style="padding:8px">2024-11-24</td>
              <td style="padding:8px;color:var(--amber)">Timed Up and Go</td>
              <td style="padding:8px;font-weight:600">14.2s</td>
              <td style="padding:8px;color:var(--green)">-1.8s</td>
              <td style="padding:8px">${_statusPill('warning')}</td>
            </tr>
            <tr style="border-bottom:1px solid var(--border)" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
              <td style="padding:8px">2024-11-24</td>
              <td style="padding:8px;color:var(--blue)">6-Minute Walk</td>
              <td style="padding:8px;font-weight:600">320m</td>
              <td style="padding:8px;color:var(--green)">+25m</td>
              <td style="padding:8px">${_statusPill('active')}</td>
            </tr>
            <tr onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
              <td style="padding:8px">2024-11-17</td>
              <td style="padding:8px;color:#a78bfa">ROM Goniometry</td>
              <td style="padding:8px;font-weight:600">2 deficits</td>
              <td style="padding:8px;color:var(--green)">-1</td>
              <td style="padding:8px">${_statusPill('active')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    ${_clinicalDisclaimer()}
  </div>`;

  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'go-dashboard') { _state.page = 'dashboard'; ctx.navigate('rehab'); }
      else if (action === 'open-assessment') { _openAssessmentForm(container, el.dataset.type, ctx); }
    });
  });
}

async function _openAssessmentForm(container, type, ctx) {
  const formArea = container.querySelector('#rehab-assessment-form-area');
  if (!formArea) return;
  const schema = await _fetchAssessmentForm(type);

  let formHtml = '';

  if (type === 'fugl_meyer') {
    formHtml = _renderFuglMeyerForm(schema);
  } else if (type === 'berg_balance') {
    formHtml = _renderBergBalanceForm(schema);
  } else if (type === 'timed_up_and_go') {
    formHtml = _renderSimpleNumberForm(schema, 'seconds', 0, 120);
  } else if (type === 'six_minute_walk') {
    formHtml = _renderSimpleNumberForm(schema, 'metres', 0, 1000);
  } else if (type === 'ten_meter_walk') {
    formHtml = _renderTwoFieldForm(schema, [{ name: 'seconds', label: 'Time (seconds)', min: 0, max: 60 }, { name: 'distance_m', label: 'Distance (metres)', min: 0, max: 20 }]);
  } else if (type === 'modified_ashworth') {
    formHtml = _renderAshworthForm(schema);
  } else if (type === 'rom_goniometry') {
    formHtml = _renderROMForm(schema);
  } else if (type === 'manual_muscle_test') {
    formHtml = _renderMMTForm(schema);
  }

  formArea.innerHTML = `<div class="ch-card" style="border:2px solid var(--blue)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <div style="font-size:14px;font-weight:600">${esc(schema.title)}</div>
        <div style="font-size:10px;color:var(--text-tertiary)">${esc(schema.description || '')}</div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="close-form">✕</button>
    </div>
    <form id="rehab-assessment-form" data-type="${esc(type)}">
      ${formHtml}
      <div style="display:flex;gap:8px;margin-top:16px">
        <button type="submit" class="btn btn-primary btn-sm">Submit & Score</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="close-form">Cancel</button>
      </div>
    </form>
    <div id="rehab-assessment-result" style="margin-top:12px"></div>
  </div>`;

  formArea.querySelector('#rehab-assessment-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const scores = {};
    for (const [key, value] of formData.entries()) {
      const num = parseFloat(value);
      scores[key] = isNaN(num) ? value : num;
    }
    const patientId = _state.selectedPatientId || 'rehab-pt-001';
    const result = await _submitAssessment(patientId, type, scores);
    const resultDiv = formArea.querySelector('#rehab-assessment-result');
    if (resultDiv) {
      resultDiv.innerHTML = _renderAssessmentResult(type, result);
    }
  });

  formArea.querySelectorAll('[data-action="close-form"]').forEach(el => {
    el.addEventListener('click', () => { formArea.innerHTML = ''; });
  });
}

function _renderFuglMeyerForm(schema) {
  const sections = schema.sections?.upper_extremity || {};
  let html = '';
  for (const [secKey, secData] of Object.entries(sections)) {
    html += `<div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase">${esc(secData.label || secKey)}</div>
      <div style="display:grid;grid-template-columns:1fr 80px;gap:6px">`;
    for (const [itemKey, itemLabel] of (secData.items || [])) {
      html += `<div style="font-size:11px;color:var(--text-secondary);padding:4px 0">${esc(itemLabel)}</div>
        <select name="${esc(itemKey)}" class="form-control" style="min-height:32px;font-size:11px">
          <option value="0">0</option><option value="1">1</option><option value="2" selected>2</option>
        </select>`;
    }
    html += '</div></div>';
  }
  // Lower extremity simplified
  html += `<div style="margin-bottom:12px">
    <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase">Lower Extremity (Simplified - 17 items)</div>
    <div style="display:flex;gap:12px;align-items:center">
      <label style="font-size:11px;color:var(--text-secondary)">Total LE Score:</label>
      <input type="number" name="le_total" class="form-control" style="width:80px;min-height:32px;font-size:11px" min="0" max="34" value="17">
      <span style="font-size:10px;color:var(--text-tertiary)">/ 34</span>
    </div>
  </div>`;
  // Sensation, ROM, Pain
  html += `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">
    <div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Sensation (max 8)</div>
      <input type="number" name="sensation_total" class="form-control" style="min-height:32px;font-size:11px" min="0" max="8" value="4">
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Passive ROM (max 16)</div>
      <input type="number" name="prom_total" class="form-control" style="min-height:32px;font-size:11px" min="0" max="16" value="12">
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:4px">Pain (max 8)</div>
      <input type="number" name="pain_total" class="form-control" style="min-height:32px;font-size:11px" min="0" max="8" value="6">
    </div>
  </div>`;
  return html;
}

function _renderBergBalanceForm(schema) {
  const items = schema.items || [];
  let html = '<div style="display:flex;flex-direction:column;gap:6px">';
  for (const [itemKey, itemLabel] of items) {
    html += `<div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;font-size:11px;color:var(--text-secondary)">${esc(itemLabel)}</div>
      <select name="${esc(itemKey)}" class="form-control" style="width:80px;min-height:32px;font-size:11px">
        <option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4" selected>4</option>
      </select>
    </div>`;
  }
  html += '</div>';
  return html;
}

function _renderSimpleNumberForm(schema, fieldName, min, max) {
  return `<div style="display:flex;align-items:center;gap:12px">
    <label style="font-size:12px;color:var(--text-secondary)">${esc(schema.fields?.[0]?.unit || '')}:</label>
    <input type="number" name="${esc(fieldName)}" class="form-control" style="width:120px;min-height:36px" min="${min}" max="${max}" step="0.1" required>
    <span style="font-size:10px;color:var(--text-tertiary)">${esc(schema.fields?.[0]?.unit || '')}</span>
  </div>`;
}

function _renderTwoFieldForm(schema, fields) {
  return `<div style="display:flex;flex-direction:column;gap:10px">
    ${fields.map(f => `
      <div style="display:flex;align-items:center;gap:12px">
        <label style="font-size:12px;color:var(--text-secondary);width:120px">${esc(f.label)}</label>
        <input type="number" name="${esc(f.name)}" class="form-control" style="width:120px;min-height:36px" min="${f.min}" max="${f.max}" step="0.1" value="${f.name === 'distance_m' ? '10' : ''}" required>
      </div>
    `).join('')}
  </div>`;
}

function _renderAshworthForm(schema) {
  const muscles = schema.muscles || [];
  const grades = schema.scale || {};
  let html = '<div style="display:flex;flex-direction:column;gap:6px">';
  for (const muscle of muscles) {
    html += `<div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;font-size:11px;color:var(--text-secondary)">${esc(muscle.replace(/_/g, ' '))}</div>
      <select name="${esc(muscle)}" class="form-control" style="width:100px;min-height:32px;font-size:11px">
        ${Object.entries(grades).map(([g, label]) => `<option value="${esc(g)}">${esc(g)} - ${esc(label)}</option>`).join('')}
      </select>
    </div>`;
  }
  html += '</div>';
  return html;
}

function _renderROMForm(schema) {
  const joints = schema.joints || {};
  let html = '<div style="display:flex;flex-direction:column;gap:12px">';
  for (const [joint, movements] of Object.entries(joints)) {
    html += `<div>
      <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase">${esc(joint.replace(/_/g, ' '))}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">`;
    for (const movement of movements) {
      html += `<div style="display:flex;align-items:center;gap:6px">
        <label style="font-size:10px;color:var(--text-tertiary);width:70px">${esc(movement)}</label>
        <input type="number" name="${esc(joint)}_${esc(movement)}" class="form-control" style="min-height:30px;font-size:11px;width:60px" min="0" max="180" step="1" placeholder="deg">
      </div>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function _renderMMTForm(schema) {
  const muscles = schema.muscles || [];
  const grades = schema.scale || {};
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
  for (const muscle of muscles) {
    html += `<div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;font-size:11px;color:var(--text-secondary)">${esc(muscle.replace(/_/g, ' '))}</div>
      <select name="${esc(muscle)}" class="form-control" style="width:80px;min-height:32px;font-size:11px">
        ${Object.entries(grades).map(([g, label]) => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}
      </select>
    </div>`;
  }
  html += '</div>';
  return html;
}

function _renderAssessmentResult(type, result) {
  if (result.error) {
    return `<div style="padding:10px;border-radius:8px;background:rgba(255,107,107,0.10);border:1px solid rgba(255,107,107,0.30);color:var(--red);font-size:12px">${esc(result.error)}</div>`;
  }
  const r = result.result || result;
  let detail = '';
  if (type === 'fugl_meyer') {
    detail = `UE: ${r.upper_extremity_score || 'N/A'}/66 (${r.upper_percent || 'N/A'}%) · LE: ${r.lower_extremity_score || 'N/A'}/34 · Total: ${r.total_score || 'N/A'}/100 · Severity: ${r.severity_upper || 'N/A'}`;
  } else if (type === 'berg_balance') {
    detail = `Score: ${r.total_score || 'N/A'}/56 (${r.percent || 'N/A'}%) · Fall risk: ${r.fall_risk_level || 'N/A'} · MCID: ${r.mcid || 4}`;
  } else if (type === 'timed_up_and_go') {
    detail = `${r.seconds || 'N/A'} seconds · Level: ${r.impairment_level || 'N/A'} · Fall risk: ${r.fall_risk ? 'YES' : 'No'}`;
  } else if (type === 'six_minute_walk') {
    detail = `${r.metres || 'N/A'}m · Predicted: ${r.predicted_normal || 'N/A'}m · ${r.percent_predicted || 'N/A'}% predicted`;
  } else if (type === 'ten_meter_walk') {
    detail = `${r.seconds || 'N/A'}s · Gait speed: ${r.gait_speed_m_s || 'N/A'} m/s · Level: ${r.ambulation_level || 'N/A'}`;
  } else if (type === 'modified_ashworth') {
    detail = `Average grade: ${r.average_grade || 'N/A'} · Significant spasticity: ${r.any_significant_spasticity ? 'YES' : 'No'}`;
  } else if (type === 'rom_goniometry') {
    detail = `${r.deficit_count || 0} significant deficits · ${(r.significant_deficits || []).slice(0, 3).join(', ')}`;
  } else if (type === 'manual_muscle_test') {
    detail = `Average grade: ${r.average_grade || 'N/A'}/5 · Functional independence: ${r.functional_independence_likely ? 'Likely' : 'Unlikely'}`;
  }

  return `<div style="padding:12px;border-radius:10px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25)">
    <div style="font-size:12px;font-weight:600;color:var(--green);margin-bottom:4px">✓ Assessment Scored</div>
    <div style="font-size:11px;color:var(--text-secondary)">${esc(detail)}</div>
    <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Scored at ${esc(result.submitted_at || new Date().toISOString())}</div>
  </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Page: Exercise Library
// ──────────────────────────────────────────────────────────────────────────

function renderRehabExercises(container, ctx) {
  if (!rehabAllowsRole(ctx.role)) {
    container.innerHTML = _renderRestrictedCard();
    return;
  }
  const exercises = _state.exercises.length ? _state.exercises : _demoExercises(_state.exerciseFilters);
  renderRehabExercisesWithData(container, ctx, exercises);
}

function renderRehabExercisesWithData(container, ctx, exercises) {
  const categories = ['strengthening', 'stretching', 'balance', 'gait', 'cardio', 'neuromuscular', 'coordination', 'functional', 'breathing', 'vestibular', 'pediatric'];
  const bodyParts = ['shoulder', 'elbow', 'wrist', 'hand', 'hip', 'knee', 'ankle', 'foot', 'lumbar_spine', 'cervical_spine', 'whole_body'];
  const difficulties = ['beginner', 'intermediate', 'advanced'];

  container.innerHTML = `<div class="ch-layout" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" class="btn btn-ghost btn-sm" data-action="go-dashboard">← Back</button>
        <div>
          <div style="font-size:16px;font-weight:700">Exercise Library</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${exercises.length} exercises with evidence grading</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <input type="text" id="rehab-ex-search" class="form-control" placeholder="Search exercises..." style="width:200px;min-height:36px;font-size:12px" value="${esc(_state.exerciseFilters.q || '')}">
        <button type="button" class="btn btn-primary btn-sm" data-action="search-exercises">Search</button>
      </div>
    </div>

    <!-- Filters -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;padding:10px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border)">
      <select id="rehab-filter-category" class="form-control" style="min-height:36px;font-size:11px;width:140px">
        <option value="">All Categories</option>
        ${categories.map(c => `<option value="${esc(c)}" ${(_state.exerciseFilters.category === c) ? 'selected' : ''}>${esc(c.charAt(0).toUpperCase() + c.slice(1))}</option>`).join('')}
      </select>
      <select id="rehab-filter-bodypart" class="form-control" style="min-height:36px;font-size:11px;width:140px">
        <option value="">All Body Parts</option>
        ${bodyParts.map(bp => `<option value="${esc(bp)}" ${(_state.exerciseFilters.bodyPart === bp) ? 'selected' : ''}>${esc(bp.replace(/_/g, ' '))}</option>`).join('')}
      </select>
      <select id="rehab-filter-difficulty" class="form-control" style="min-height:36px;font-size:11px;width:120px">
        <option value="">All Levels</option>
        ${difficulties.map(d => `<option value="${esc(d)}" ${(_state.exerciseFilters.difficulty === d) ? 'selected' : ''}>${esc(d.charAt(0).toUpperCase() + d.slice(1))}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-ghost btn-sm" data-action="apply-filters">Apply</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="clear-filters">Clear</button>
    </div>

    <!-- Exercise Cards Grid -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      ${exercises.map(ex => `
        <div class="ch-card" style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${esc(ex.name)}</div>
            <span class="pill" style="font-size:9px;padding:1px 6px;background:${ex.evidence_grade === 'A' ? 'rgba(74,222,128,0.14)' : 'rgba(255,176,87,0.14)'};color:${ex.evidence_grade === 'A' ? 'var(--green)' : 'var(--amber)'};border:none">${esc(ex.evidence_grade)}</span>
          </div>
          <div style="font-size:10px;color:var(--text-tertiary)">${esc(ex.description?.substring(0, 80) || '')}${(ex.description?.length || 0) > 80 ? '...' : ''}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <span class="pill pill-inactive" style="font-size:9px;padding:1px 6px">${esc(ex.category)}</span>
            <span class="pill pill-inactive" style="font-size:9px;padding:1px 6px">${esc(ex.difficulty)}</span>
            ${(ex.body_parts || []).map(bp => `<span class="pill pill-inactive" style="font-size:9px;padding:1px 6px">${esc(bp)}</span>`).join('')}
          </div>
          <div style="font-size:10px;color:var(--text-secondary);margin-top:2px">
            <strong>Rx:</strong> ${esc(ex.sets_reps || '')} · ${esc(ex.frequency || '')}
          </div>
          ${(ex.contraindications || []).length ? `<div style="font-size:9px;color:var(--red);margin-top:2px">⚠ ${esc(ex.contraindications.join('; '))}</div>` : ''}
          <div style="margin-top:auto;padding-top:8px;display:flex;gap:6px">
            <button type="button" class="btn btn-primary btn-sm" style="flex:1;font-size:10px;min-height:32px" data-action="add-to-protocol" data-ex-id="${esc(ex.id)}">+ Protocol</button>
            <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;min-height:32px" data-action="view-exercise" data-ex-id="${esc(ex.id)}">Details</button>
          </div>
        </div>
      `).join('')}
    </div>

    ${exercises.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text-tertiary);font-size:13px">No exercises match your filters. Try adjusting your search criteria.</div>` : ''}

    ${_clinicalDisclaimer()}
  </div>`;

  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'go-dashboard') { _state.page = 'dashboard'; ctx.navigate('rehab'); }
      else if (action === 'search-exercises') {
        _state.exerciseFilters.q = container.querySelector('#rehab-ex-search')?.value || '';
        _applyFiltersAndReload(container, ctx);
      }
      else if (action === 'apply-filters') {
        _state.exerciseFilters.category = container.querySelector('#rehab-filter-category')?.value || '';
        _state.exerciseFilters.bodyPart = container.querySelector('#rehab-filter-bodypart')?.value || '';
        _state.exerciseFilters.difficulty = container.querySelector('#rehab-filter-difficulty')?.value || '';
        _applyFiltersAndReload(container, ctx);
      }
      else if (action === 'clear-filters') {
        _state.exerciseFilters = { category: '', bodyPart: '', equipment: '', difficulty: '', q: '' };
        renderRehabExercises(container, ctx);
      }
      else if (action === 'add-to-protocol') {
        const exId = el.dataset.exId;
        const ex = exercises.find(x => x.id === exId);
        if (ex) {
          _state.currentProtocol = _state.currentProtocol || { exercises: [] };
          if (!_state.currentProtocol.exercises.find(x => x.id === exId)) {
            _state.currentProtocol.exercises.push(ex);
          }
          _showToast(`"${ex.name}" added to protocol`, 'success');
        }
      }
    });
  });
}

async function _applyFiltersAndReload(container, ctx) {
  const exercises = await _fetchExercises(_state.exerciseFilters);
  renderRehabExercisesWithData(container, ctx, exercises);
}

function _showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--blue)', warning: 'var(--amber)' };
  toast.style.cssText = `position:fixed;bottom:20px;right:20px;padding:12px 16px;border-radius:10px;background:${colors[type] || colors.info};color:#fff;font-size:12px;z-index:10000;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:slideIn 0.3s ease`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}


// ──────────────────────────────────────────────────────────────────────────
// Page: Protocol Builder
// ──────────────────────────────────────────────────────────────────────────

function renderRehabProtocolBuilder(container, ctx) {
  if (!rehabAllowsRole(ctx.role)) {
    container.innerHTML = _renderRestrictedCard();
    return;
  }

  const templates = _state.protocolTemplates.length ? _state.protocolTemplates : _demoTemplates();
  const currentProtocol = _state.currentProtocol;

  container.innerHTML = `<div class="ch-layout" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" class="btn btn-ghost btn-sm" data-action="go-dashboard">← Back</button>
        <div>
          <div style="font-size:16px;font-weight:700">Protocol Builder</div>
          <div style="font-size:11px;color:var(--text-tertiary)">Create custom rehab protocols from evidence-based templates</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn btn-primary btn-sm" data-action="create-custom">+ Custom Protocol</button>
        <button type="button" class="btn btn-primary btn-sm" data-action="save-protocol" ${!currentProtocol ? 'disabled' : ''}>Save Protocol</button>
      </div>
    </div>

    <!-- Template Gallery -->
    <div class="ch-card" style="margin-bottom:16px">
      ${_sectionHeader('Protocol Templates', 'Select a template to customize')}
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
        ${templates.map(tpl => `
          <div class="ch-card" style="cursor:pointer;padding:12px;transition:all 0.15s" data-action="select-template" data-template-id="${esc(tpl.id)}"
            onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='var(--blue)'"
            onmouseout="this.style.transform='translateY(0)';this.style.borderColor='var(--border)'">
            <div style="font-size:11px;font-weight:600;color:var(--text-primary);margin-bottom:4px;min-height:36px">${esc(tpl.name)}</div>
            <div style="font-size:9px;color:var(--text-tertiary);margin-bottom:6px">${esc(tpl.condition)}</div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span class="pill" style="font-size:8px;padding:1px 5px;background:rgba(74,222,128,0.14);color:var(--green);border:none">${esc(tpl.evidence_grade)}</span>
              <span style="font-size:9px;color:var(--text-tertiary)">${tpl.duration_weeks}w · ${tpl.phase_count} phases</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Protocol Editor -->
    <div id="rehab-protocol-editor" style="margin-bottom:16px">
      ${currentProtocol ? _renderProtocolEditor(currentProtocol) : '<div style="text-align:center;padding:30px;color:var(--text-tertiary);font-size:13px">Select a template above or create a custom protocol to begin editing.</div>'}
    </div>

    <!-- Exercise Pool for Drag-Drop -->
    <div class="ch-card" style="margin-bottom:16px">
      ${_sectionHeader('Exercise Pool', 'Click to add exercises to the current protocol')}
      <div style="display:flex;gap:6px;flex-wrap:wrap;max-height:120px;overflow-y:auto">
        ${_demoExercises({}).slice(0, 20).map(ex => `
          <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 8px;min-height:28px" data-action="add-ex-to-editor" data-ex-id="${esc(ex.id)}">${esc(ex.name)}</button>
        `).join('')}
      </div>
    </div>

    ${_clinicalDisclaimer()}
  </div>`;

  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'go-dashboard') { _state.page = 'dashboard'; ctx.navigate('rehab'); }
      else if (action === 'select-template') { _loadTemplate(el.dataset.templateId, container, ctx); }
      else if (action === 'create-custom') { _createBlankProtocol(container, ctx); }
      else if (action === 'add-ex-to-editor') { _addExerciseToProtocol(el.dataset.exId, container, ctx); }
      else if (action === 'save-protocol') { _saveCurrentProtocol(container, ctx); }
      else if (action === 'remove-exercise') { _removeExerciseFromProtocol(parseInt(el.dataset.index), container, ctx); }
      else if (action === 'move-up') { _moveExercise(parseInt(el.dataset.index), -1, container, ctx); }
      else if (action === 'move-down') { _moveExercise(parseInt(el.dataset.index), 1, container, ctx); }
    });
  });
}

function _renderProtocolEditor(protocol) {
  const exercises = protocol.exercises || [];
  const phases = protocol.phases || [];

  return `<div class="ch-card" style="border:2px solid var(--blue)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <input type="text" id="protocol-name" class="form-control" value="${esc(protocol.name || '')}" style="font-size:14px;font-weight:600;min-height:36px;width:300px" placeholder="Protocol name">
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">
          ${protocol.template_id ? `Template: ${esc(protocol.template_id)} · ` : ''}
          Duration: <input type="number" id="protocol-duration" class="form-control" value="${protocol.duration_weeks || 4}" style="width:50px;min-height:24px;font-size:10px;display:inline"> weeks
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <span class="pill" style="font-size:9px;background:rgba(74,222,128,0.14);color:var(--green);border:none">${esc(protocol.evidence_grade || 'C')}</span>
      </div>
    </div>

    <!-- Goals -->
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase">Protocol Goals</div>
      <textarea id="protocol-goals" class="form-control" style="min-height:50px;font-size:11px" placeholder="Enter goals, one per line">${(protocol.goals || []).join('\n')}</textarea>
    </div>

    <!-- Outcome Measures -->
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase">Outcome Measures</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${(protocol.outcome_measures || []).map(om => `<span class="pill pill-active" style="font-size:9px">${esc(om)}</span>`).join('') || '<span style="font-size:10px;color:var(--text-tertiary)">No outcome measures set</span>'}
      </div>
    </div>

    <!-- Exercise List (Drag-Drop Simulated) -->
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase">
        Exercises (${exercises.length}) — Use ↑↓ to reorder
      </div>
      ${exercises.length ? `
        <div style="display:flex;flex-direction:column;gap:4px">
          ${exercises.map((ex, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,0.03);border:1px solid var(--border)">
              <span style="font-size:10px;color:var(--text-tertiary);width:20px">${i + 1}</span>
              <div style="flex:1">
                <div style="font-size:11px;font-weight:500">${esc(ex.name)}</div>
                <div style="font-size:9px;color:var(--text-tertiary)">${esc(ex.category)} · ${esc(ex.sets_reps || '')} · ${esc(ex.duration_min || '')}min</div>
              </div>
              <div style="display:flex;gap:4px">
                <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;min-height:24px;padding:2px 6px" data-action="move-up" data-index="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;min-height:24px;padding:2px 6px" data-action="move-down" data-index="${i}" ${i === exercises.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn btn-ghost btn-sm" style="font-size:10px;min-height:24px;padding:2px 6px;color:var(--red)" data-action="remove-exercise" data-index="${i}">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : '<div style="font-size:10px;color:var(--text-tertiary);padding:10px;border-radius:6px;background:rgba(255,255,255,0.02);border:1px dashed var(--border);text-align:center">No exercises added. Select from the pool below.</div>'}
    </div>

    <!-- Progression Criteria -->
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase">Progression Criteria</div>
      <textarea id="protocol-progression" class="form-control" style="min-height:40px;font-size:11px" placeholder="Criteria for advancing to next phase">${esc(protocol.progression_criteria || '')}</textarea>
    </div>

    <!-- Contraindications -->
    ${(protocol.contraindications || []).length ? `<div style="padding:8px;border-radius:6px;background:rgba(255,107,107,0.06);border:1px solid rgba(255,107,107,0.20);margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;color:var(--red);margin-bottom:4px">⚠ Contraindications</div>
      <div style="font-size:10px;color:var(--text-secondary)">${(protocol.contraindications || []).map(c => esc(c)).join(' · ')}</div>
    </div>` : ''}

    <!-- Therapist Notes -->
    <div>
      <div style="font-size:10px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px;text-transform:uppercase">Therapist Notes</div>
      <textarea id="protocol-notes" class="form-control" style="min-height:40px;font-size:11px" placeholder="Patient-specific notes and modifications">${esc(protocol.therapist_notes || '')}</textarea>
    </div>
  </div>`;
}

function _loadTemplate(templateId, container, ctx) {
  const template = _demoTemplates().find(t => t.id === templateId);
  if (!template) return;

  _state.currentProtocol = {
    name: template.name,
    template_id: templateId,
    duration_weeks: template.duration_weeks,
    condition: template.condition,
    evidence_grade: template.evidence_grade,
    outcome_measures: template.outcome_measures || [],
    contraindications: template.contraindications || [],
    phases: template.phases || [],
    exercises: [],
    goals: (template.phases || []).flatMap(p => p.goals || []),
    progression_criteria: (template.phases || []).map(p => p.progression_criteria || '').filter(Boolean).join('\n'),
    therapist_notes: '',
  };

  // Pre-populate exercises from template phases
  const exIds = (template.phases || []).flatMap(p => p.exercises || []);
  const allExs = _demoExercises({});
  _state.currentProtocol.exercises = exIds.map(id => allExs.find(e => e.id === id) || { id, name: `Exercise ${id}`, category: 'unknown', duration_min: 10 }).filter(Boolean);

  renderRehabProtocolBuilder(container, ctx);
}

function _createBlankProtocol(container, ctx) {
  _state.currentProtocol = {
    name: 'Custom Protocol',
    template_id: null,
    duration_weeks: 4,
    condition: '',
    evidence_grade: 'C',
    outcome_measures: [],
    contraindications: [],
    phases: [],
    exercises: [],
    goals: [],
    progression_criteria: '',
    therapist_notes: '',
  };
  renderRehabProtocolBuilder(container, ctx);
}

function _addExerciseToProtocol(exId, container, ctx) {
  if (!_state.currentProtocol) _createBlankProtocol(container, ctx);
  const allExs = _demoExercises({});
  const ex = allExs.find(e => e.id === exId);
  if (ex && !_state.currentProtocol.exercises.find(x => x.id === exId)) {
    _state.currentProtocol.exercises.push(ex);
    renderRehabProtocolBuilder(container, ctx);
  }
}

function _removeExerciseFromProtocol(index, container, ctx) {
  if (_state.currentProtocol?.exercises) {
    _state.currentProtocol.exercises.splice(index, 1);
    renderRehabProtocolBuilder(container, ctx);
  }
}

function _moveExercise(index, direction, container, ctx) {
  if (!_state.currentProtocol?.exercises) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= _state.currentProtocol.exercises.length) return;
  const exercises = _state.currentProtocol.exercises;
  [exercises[index], exercises[newIndex]] = [exercises[newIndex], exercises[index]];
  renderRehabProtocolBuilder(container, ctx);
}

async function _saveCurrentProtocol(container, ctx) {
  if (!_state.currentProtocol) return;

  // Sync form values
  const nameInput = container.querySelector('#protocol-name');
  const durationInput = container.querySelector('#protocol-duration');
  const goalsInput = container.querySelector('#protocol-goals');
  const progressionInput = container.querySelector('#protocol-progression');
  const notesInput = container.querySelector('#protocol-notes');

  if (nameInput) _state.currentProtocol.name = nameInput.value;
  if (durationInput) _state.currentProtocol.duration_weeks = parseInt(durationInput.value) || 4;
  if (goalsInput) _state.currentProtocol.goals = goalsInput.value.split('\n').filter(g => g.trim());
  if (progressionInput) _state.currentProtocol.progression_criteria = progressionInput.value;
  if (notesInput) _state.currentProtocol.therapist_notes = notesInput.value;

  const patientId = _state.selectedPatientId || 'rehab-pt-001';
  const result = await _createProtocol({
    patient_id: patientId,
    ..._state.currentProtocol,
  });

  _showToast(`Protocol "${_state.currentProtocol.name}" saved!`, 'success');
}

// ──────────────────────────────────────────────────────────────────────────
// Page: Session Documentation
// ──────────────────────────────────────────────────────────────────────────

function renderRehabSessions(container, ctx) {
  if (!rehabAllowsRole(ctx.role)) {
    container.innerHTML = _renderRestrictedCard();
    return;
  }

  const patientId = _state.selectedPatientId || 'rehab-pt-001';
  const profile = _demoProfile(patientId);
  const sessions = _demoSessions();

  container.innerHTML = `<div class="ch-layout" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" class="btn btn-ghost btn-sm" data-action="go-dashboard">← Back</button>
        <div>
          <div style="font-size:16px;font-weight:700">Session Documentation</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${esc(profile.name)} · ${esc(profile.diagnosis)}</div>
        </div>
      </div>
    </div>

    <!-- Adherence KPIs -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${_kpiCard('Adherence', '82%', '24/30 sessions completed', 'var(--green)')}
      ${_kpiCard('Avg Pain', '2.4/10', 'Last 5 sessions', 'var(--amber)')}
      ${_kpiCard('Avg Fatigue', '3.8/10', 'Manageable range', 'var(--blue)')}
      ${_kpiCard('This Week', '3', 'sessions completed', '#a78bfa')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <!-- New Session Form -->
      <div class="ch-card">
        ${_sectionHeader('Log New Session')}
        <form id="rehab-session-form" style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;gap:8px">
            <div style="flex:1">
              <label style="font-size:10px;color:var(--text-tertiary)">Session Date</label>
              <input type="date" name="session_date" class="form-control" style="min-height:36px;font-size:12px" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div style="flex:1">
              <label style="font-size:10px;color:var(--text-tertiary)">Duration (min)</label>
              <input type="number" name="duration_min" class="form-control" style="min-height:36px;font-size:12px" min="0" value="45">
            </div>
          </div>

          <div>
            <label style="font-size:10px;color:var(--text-tertiary)">Exercises Completed</label>
            <div id="session-exercises-check" style="display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;padding:8px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid var(--border)">
              ${_demoExercises({}).slice(0, 12).map((ex, i) => `
                <label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);cursor:pointer;padding:3px">
                  <input type="checkbox" name="ex_completed" value="${esc(ex.id)}" ${i < 6 ? 'checked' : ''} style="accent-color:var(--blue)">
                  <span>${esc(ex.name)}</span>
                  <span style="font-size:9px;color:var(--text-tertiary);margin-left:auto">${esc(ex.category)}</span>
                </label>
              `).join('')}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            <div>
              <label style="font-size:10px;color:var(--text-tertiary)">Pain (0-10)</label>
              <input type="number" name="pain_score" class="form-control" style="min-height:36px;font-size:12px" min="0" max="10" step="0.5" value="2">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text-tertiary)">Fatigue (0-10)</label>
              <input type="number" name="fatigue_score" class="form-control" style="min-height:36px;font-size:12px" min="0" max="10" step="0.5" value="3">
            </div>
            <div>
              <label style="font-size:10px;color:var(--text-tertiary)">Difficulty</label>
              <select name="difficulty_rating" class="form-control" style="min-height:36px;font-size:12px">
                <option value="easy">Easy</option>
                <option value="medium" selected>Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div>
            <label style="font-size:10px;color:var(--text-tertiary)">Clinician Notes</label>
            <textarea name="clinician_notes" class="form-control" style="min-height:50px;font-size:11px" placeholder="Session observations, modifications, plan adjustments...">Patient tolerated session well. Increased bridging hold time to 8s.</textarea>
          </div>

          <div>
            <label style="font-size:10px;color:var(--text-tertiary)">Next Session Plan</label>
            <textarea name="next_session_plan" class="form-control" style="min-height:30px;font-size:11px" placeholder="Goals for next session">Introduce single-leg bridge. Progress TUG practice.</textarea>
          </div>

          <button type="submit" class="btn btn-primary btn-sm" style="min-height:40px">Log Session</button>
        </form>
        <div id="session-result" style="margin-top:10px"></div>
      </div>

      <!-- Session History -->
      <div class="ch-card">
        ${_sectionHeader('Session History', 'Last 10 sessions')}
        <div style="max-height:520px;overflow-y:auto">
          ${sessions.map((s, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:8px;border-bottom:1px solid var(--border);${i === 0 ? 'background:rgba(96,165,250,0.04)' : ''}">
              <div style="width:60px;font-size:10px;color:var(--text-tertiary)">${esc(s.date)}</div>
              <div style="width:40px;font-size:11px;font-weight:600;text-align:center">${s.duration}m</div>
              <div style="flex:1">
                <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.05);overflow:hidden">
                  <div style="width:${s.adherence}%;height:100%;background:${s.adherence >= 80 ? 'var(--green)' : s.adherence >= 60 ? 'var(--amber)' : 'var(--red)'};border-radius:3px"></div>
                </div>
              </div>
              <div style="width:40px;font-size:10px;text-align:right;color:${s.adherence >= 80 ? 'var(--green)' : 'var(--amber)'}">${s.adherence}%</div>
              <div style="width:30px;font-size:10px;text-align:right;color:var(--text-tertiary)">P${s.pain}</div>
              <div style="width:30px;font-size:10px;text-align:right;color:var(--text-tertiary)">F${s.fatigue}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- Pain & Fatigue Trends -->
    <div class="ch-card" style="margin-bottom:16px">
      ${_sectionHeader('Pain & Fatigue Trends')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">Pain (0-10) — Lower is better</div>
          ${_sparkline(sessions.slice().reverse().map(s => s.pain), 'var(--red)')}
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px">Fatigue (0-10)</div>
          ${_sparkline(sessions.slice().reverse().map(s => s.fatigue), 'var(--amber)')}
        </div>
      </div>
    </div>

    ${_clinicalDisclaimer()}
  </div>`;

  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      if (el.dataset.action === 'go-dashboard') { _state.page = 'dashboard'; ctx.navigate('rehab'); }
    });
  });

  container.querySelector('#rehab-session-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const exerciseCheckboxes = e.target.querySelectorAll('input[name="ex_completed"]:checked');
    const sessionData = {
      patient_id: patientId,
      session_date: formData.get('session_date') || new Date().toISOString(),
      duration_min: parseInt(formData.get('duration_min') || '0'),
      exercises_completed: Array.from(exerciseCheckboxes).map(cb => ({ exercise_id: cb.value, completed: true })),
      total_exercises_prescribed: e.target.querySelectorAll('input[name="ex_completed"]').length,
      pain_score: parseFloat(formData.get('pain_score') || '0'),
      fatigue_score: parseFloat(formData.get('fatigue_score') || '0'),
      patient_difficulty_rating: formData.get('difficulty_rating'),
      clinician_notes: formData.get('clinician_notes'),
      next_session_plan: formData.get('next_session_plan'),
    };
    const result = await _logSession(sessionData);
    const resultDiv = container.querySelector('#session-result');
    if (resultDiv) {
      resultDiv.innerHTML = `<div style="padding:10px;border-radius:8px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);color:var(--green);font-size:12px">
        ✓ Session logged! Adherence: ${result.adherence_pct || 'N/A'}% · ID: ${esc(result.session_id || '')}
      </div>`;
    }
  });
}

function _demoSessions() {
  return [
    { date: 'Dec 02', duration: 45, adherence: 90, pain: 2, fatigue: 3 },
    { date: 'Nov 30', duration: 40, adherence: 85, pain: 2, fatigue: 4 },
    { date: 'Nov 28', duration: 50, adherence: 100, pain: 1, fatigue: 3 },
    { date: 'Nov 26', duration: 35, adherence: 70, pain: 3, fatigue: 5 },
    { date: 'Nov 24', duration: 45, adherence: 88, pain: 2, fatigue: 4 },
    { date: 'Nov 22', duration: 45, adherence: 92, pain: 2, fatigue: 3 },
    { date: 'Nov 20', duration: 40, adherence: 80, pain: 3, fatigue: 5 },
    { date: 'Nov 18', duration: 50, adherence: 95, pain: 1, fatigue: 2 },
    { date: 'Nov 15', duration: 45, adherence: 85, pain: 2, fatigue: 4 },
    { date: 'Nov 13', duration: 30, adherence: 65, pain: 4, fatigue: 6 },
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// Page: Integration Panel
// ──────────────────────────────────────────────────────────────────────────

function renderRehabIntegration(container, ctx) {
  if (!rehabAllowsRole(ctx.role)) {
    container.innerHTML = _renderRestrictedCard();
    return;
  }

  container.innerHTML = `<div class="ch-layout" style="padding:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" class="btn btn-ghost btn-sm" data-action="go-dashboard">← Back</button>
        <div>
          <div style="font-size:16px;font-weight:700">Integration Panel</div>
          <div style="font-size:11px;color:var(--text-tertiary)">Cross-module data links and evidence-based decision support</div>
        </div>
      </div>
    </div>

    <!-- Integration Modules Grid -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <!-- Biomarkers -->
      <div class="ch-card" style="cursor:pointer" data-action="navigate" data-page="biomarkers" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:22px;margin-bottom:6px">🧪</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">Biomarkers</div>
        <div style="font-size:10px;color:var(--text-tertiary);line-height:1.5">Inflammatory markers (CRP, IL-6), muscle enzymes (CK), nutritional status. Correlate with recovery trajectory.</div>
        <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
          <span class="pill pill-inactive" style="font-size:8px">CRP</span>
          <span class="pill pill-inactive" style="font-size:8px">IL-6</span>
          <span class="pill pill-inactive" style="font-size:8px">CK</span>
        </div>
      </div>

      <!-- qEEG -->
      <div class="ch-card" style="cursor:pointer" data-action="navigate" data-page="qeeg-analysis" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:22px;margin-bottom:6px">🧠</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">qEEG / Motor Cortex</div>
        <div style="font-size:10px;color:var(--text-tertiary);line-height:1.5">Motor cortex mapping, CMAP, MUAP analysis. Post-stroke motor recovery biomarkers. Neuroplasticity tracking.</div>
        <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
          <span class="pill pill-inactive" style="font-size:8px">Motor cortex</span>
          <span class="pill pill-inactive" style="font-size:8px">SMR</span>
          <span class="pill pill-inactive" style="font-size:8px">CMAP</span>
        </div>
      </div>

      <!-- MRI -->
      <div class="ch-card" style="cursor:pointer" data-action="navigate" data-page="mri-analysis" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:22px;margin-bottom:6px">🩻</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">MRI Lesion Mapping</div>
        <div style="font-size:10px;color:var(--text-tertiary);line-height:1.5">Structural lesion mapping, CST integrity (DTI), lesion volume correlates with motor recovery prognosis.</div>
        <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
          <span class="pill pill-inactive" style="font-size:8px">DTI</span>
          <span class="pill pill-inactive" style="font-size:8px">CST</span>
          <span class="pill pill-inactive" style="font-size:8px">Lesion vol</span>
        </div>
      </div>

      <!-- Medications -->
      <div class="ch-card" style="cursor:pointer" data-action="navigate" data-page="medications" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:22px;margin-bottom:6px">💊</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">Medications</div>
        <div style="font-size:10px;color:var(--text-tertiary);line-height:1.5">Spasticity management (baclofen, tizanidine, botox), analgesics, anti-inflammatories. Drug-exercise interactions.</div>
        <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
          <span class="pill pill-inactive" style="font-size:8px">Baclofen</span>
          <span class="pill pill-inactive" style="font-size:8px">Tizanidine</span>
          <span class="pill pill-inactive" style="font-size:8px">Botox</span>
        </div>
      </div>

      <!-- DeepTwin -->
      <div class="ch-card" style="cursor:pointer" data-action="navigate" data-page="brain-twin" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:22px;margin-bottom:6px">🤖</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">DeepTwin AI</div>
        <div style="font-size:10px;color:var(--text-tertiary);line-height:1.5">Predictive recovery modeling, personalized protocol optimization, virtual twin simulation for intervention planning.</div>
        <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
          <span class="pill pill-inactive" style="font-size:8px">Prediction</span>
          <span class="pill pill-inactive" style="font-size:8px">Simulation</span>
          <span class="pill pill-inactive" style="font-size:8px">N-of-1</span>
        </div>
      </div>

      <!-- Evidence -->
      <div class="ch-card" style="cursor:pointer" data-action="navigate" data-page="evidence" onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="font-size:22px;margin-bottom:6px">📚</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">Evidence Hub</div>
        <div style="font-size:10px;color:var(--text-tertiary);line-height:1.5">RCT database, systematic reviews, clinical practice guidelines. Exercise selection graded A-E per condition.</div>
        <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
          <span class="pill pill-inactive" style="font-size:8px">Cochrane</span>
          <span class="pill pill-inactive" style="font-size:8px">RCTs</span>
          <span class="pill pill-inactive" style="font-size:8px">CPGs</span>
        </div>
      </div>
    </div>

    <!-- Safety Alerts -->
    <div class="ch-card" style="margin-bottom:16px">
      ${_sectionHeader('Active Safety Alerts')}
      ${_alertBanner('critical', 'Baclofen dose increase may mask spasticity assessment. Consider timing MAS before AM dose.')}
      ${_alertBanner('warning', 'Patient reports dizziness with head turns during gait training — correlate with vestibular assessment.')}
      ${_alertBanner('info', 'MRI DTI shows 65% CST integrity — favorable prognosis for motor recovery with intensive training.')}
    </div>

    <!-- Evidence-Based Recommendations -->
    <div class="ch-card" style="margin-bottom:16px">
      ${_sectionHeader('Evidence-Based Exercise Recommendations')}
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="padding:10px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:12px;font-weight:600">Mirror Therapy for Stroke UE Recovery</div>
            <span class="pill" style="font-size:9px;background:rgba(74,222,128,0.14);color:var(--green);border:none">Grade A</span>
          </div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Thieme et al. 2012 Cochrane · 15 min/day · Begin subacute phase</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:12px;font-weight:600">CIMT for Chronic Stroke (>6 months)</div>
            <span class="pill" style="font-size:9px;background:rgba(74,222,128,0.14);color:var(--green);border:none">Grade A</span>
          </div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Kwakkel et al. 2017 Cochrane · 6 hrs/day x 2 weeks · FMA-UE > 20 required</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:12px;font-weight:600">LSBIG Training for Parkinson's</div>
            <span class="pill" style="font-size:9px;background:rgba(74,222,128,0.14);color:var(--green);border:none">Grade A</span>
          </div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Keus et al. 2014 ParkinsonNet · 45 min sessions · Daily amplitude-focused training</div>
        </div>
        <div style="padding:10px;border-radius:8px;background:rgba(255,255,255,0.02);border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:12px;font-weight:600">Blood Flow Restriction for Post-Op ACL</div>
            <span class="pill" style="font-size:9px;background:rgba(255,176,87,0.14);color:var(--amber);border:none">Grade B</span>
          </div>
          <div style="font-size:10px;color:var(--text-tertiary);margin-top:4px">Hughes et al. 2017 · Low-load + BFR · Accelerated strength recovery</div>
        </div>
      </div>
    </div>

    ${_clinicalDisclaimer()}
  </div>`;

  container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', () => {
      const action = el.dataset.action;
      if (action === 'go-dashboard') { _state.page = 'dashboard'; ctx.navigate('rehab'); }
      else if (action === 'navigate') { ctx.navigate(el.dataset.page); }
    });
  });
}


// ──────────────────────────────────────────────────────────────────────────
// renderPage dispatcher
// ──────────────────────────────────────────────────────────────────────────

export function renderRehabPage(pageName, container, ctx) {
  // Close any previous overlays
  const existingOverlay = document.getElementById('rehab-overlay');
  if (existingOverlay) existingOverlay.remove();

  // Set sidebar tab context if available
  if (ctx.setActiveSidebarTab) {
    const tabMap = {
      'rehab': 'rehab',
      'rehab-profile': 'rehab',
      'rehab-assessments': 'rehab',
      'rehab-exercises': 'rehab',
      'rehab-protocols': 'rehab',
      'rehab-sessions': 'rehab',
      'rehab-integration': 'rehab',
    };
    const tab = tabMap[pageName];
    if (tab) ctx.setActiveSidebarTab(tab);
  }

  const pageMap = {
    'rehab': () => renderRehabDashboard(container, ctx),
    'rehab-dashboard': () => renderRehabDashboard(container, ctx),
    'rehab-profile': () => renderRehabPatientProfile(container, ctx),
    'rehab-assessments': () => renderRehabAssessments(container, ctx),
    'rehab-exercises': () => renderRehabExercises(container, ctx),
    'rehab-protocols': () => renderRehabProtocolBuilder(container, ctx),
    'rehab-sessions': () => renderRehabSessions(container, ctx),
    'rehab-integration': () => renderRehabIntegration(container, ctx),
  };

  const renderer = pageMap[pageName];
  if (renderer) {
    renderer();
  } else {
    container.innerHTML = `<div style="padding:24px;text-align:center">
      <div style="font-size:15px;font-weight:600;margin-bottom:8px">Rehabilitation Platform</div>
      <div style="font-size:12px;color:var(--text-tertiary)">Page "${esc(pageName)}" not found. Use the sidebar to navigate.</div>
    </div>`;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Module-level exports
// ──────────────────────────────────────────────────────────────────────────

export {
  renderRehabDashboard,
  renderRehabPatientProfile,
  renderRehabAssessments,
  renderRehabExercises,
  renderRehabProtocolBuilder,
  renderRehabSessions,
  renderRehabIntegration,
};

// ──────────────────────────────────────────────────────────────────────────
// __rehabTestApi__ — for automated testing
// ──────────────────────────────────────────────────────────────────────────

export const __rehabTestApi__ = {
  // State access
  getState: () => ({ ..._state, patients: [..._state.patients], exercises: [..._state.exercises] }),
  setState: (partial) => Object.assign(_state, partial),
  resetState: () => {
    _state.patients = [];
    _state.selectedPatientId = null;
    _state.exercises = [];
    _state.exerciseFilters = { category: '', bodyPart: '', equipment: '', difficulty: '', q: '' };
    _state.protocolTemplates = [];
    _state.currentProtocol = null;
    _state.assessmentHistory = {};
    _state.sessionHistory = [];
    _state.goals = [];
    _state.alerts = [];
    _state.page = 'dashboard';
  },

  // Role check
  allowsRole: rehabAllowsRole,

  // Helpers
  statusPill: _statusPill,
  phaseColor: _phaseColor,
  sparkline: _sparkline,
  barChart: _barChart,
  kpiCard: _kpiCard,
  alertBanner: _alertBanner,
  clinicalDisclaimer: _clinicalDisclaimer,

  // Scoring (mirrors backend)
  scoreFuglMeyer: (scores) => {
    const total = Object.values(scores).reduce((a, b) => a + (parseFloat(b) || 0), 0);
    return { total_score: total, upper_extremity_score: total, severity_upper: total > 40 ? 'mild' : total > 20 ? 'moderate' : 'severe' };
  },
  scoreBergBalance: (scores) => {
    const total = Object.values(scores).reduce((a, b) => a + (parseInt(b) || 0), 0);
    return { total_score: total, fall_risk_level: total >= 45 ? 'low' : total >= 37 ? 'medium' : 'high' };
  },
  scoreTUG: (seconds) => ({
    seconds, impairment_level: seconds <= 10 ? 'normal' : seconds <= 15 ? 'mild' : seconds <= 20 ? 'moderate' : 'severe', fall_risk: seconds > 12,
  }),
  score6MWT: (metres) => ({ metres, percent_predicted: Math.round((metres / 470) * 100) }),
  score10MWT: (seconds, distance = 10) => ({
    seconds, gait_speed_m_s: Math.round((distance / seconds) * 100) / 100, ambulation_level: (distance / seconds) >= 1.2 ? 'full_community' : (distance / seconds) >= 0.8 ? 'limited_community' : 'household_ambulator',
  }),

  // Demo data
  demoPatients: _demoPatients,
  demoExercises: _demoExercises,
  demoTemplates: _demoTemplates,
  demoProgress: _demoProgress,
  demoGoals: _demoGoals,
  demoSessions: _demoSessions,

  // Filter logic
  filterExercises: (exercises, filters) => {
    let r = [...exercises];
    if (filters.category) r = r.filter(e => e.category === filters.category);
    if (filters.bodyPart) r = r.filter(e => e.body_parts?.includes(filters.bodyPart));
    if (filters.difficulty) r = r.filter(e => e.difficulty === filters.difficulty);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      r = r.filter(e => e.name.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q));
    }
    return r;
  },

  // Protocol builder logic
  protocolState: () => _state.currentProtocol,
  addExerciseToProtocol: (exId) => {
    if (!_state.currentProtocol) return false;
    const allExs = _demoExercises({});
    const ex = allExs.find(e => e.id === exId);
    if (ex && !_state.currentProtocol.exercises?.find(x => x.id === exId)) {
      _state.currentProtocol.exercises = _state.currentProtocol.exercises || [];
      _state.currentProtocol.exercises.push(ex);
      return true;
    }
    return false;
  },
  moveExerciseInProtocol: (index, direction) => {
    if (!_state.currentProtocol?.exercises) return false;
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= _state.currentProtocol.exercises.length) return false;
    const ex = _state.currentProtocol.exercises;
    [ex[index], ex[newIdx]] = [ex[newIdx], ex[index]];
    return true;
  },
  removeExerciseFromProtocol: (index) => {
    if (!_state.currentProtocol?.exercises) return false;
    _state.currentProtocol.exercises.splice(index, 1);
    return true;
  },

  // Assessment form
  getAssessmentFormSchema: (type) => _demoFormSchema(type),

  // Adherence calculation
  calculateAdherence: (completed, prescribed) => prescribed > 0 ? Math.round((completed / prescribed) * 100) : 0,

  // Normative data
  getNormativeData: () => ({
    fugl_meyer: { upper_max: 66, lower_max: 34, total_max: 100, mcid: { ue: 6, le: 4 } },
    berg_balance: { max: 56, mcid: 4, fall_risk_cutoff: 45 },
    timed_up_and_go: { fall_risk_cutoff: 12, normal: '< 10s' },
    six_minute_walk: { mcid_copd: 54, mcid_heart_failure: 45, mcid_stroke: 34 },
  }),

  // Safety
  safetyDisclaimer: () => (
    "This rehabilitation platform provides clinical decision-support only. " +
    "It does not replace clinical judgment, physical examination, or formal diagnosis. " +
    "All exercise prescriptions and protocol selections must be reviewed and approved " +
    "by a licensed physiotherapist or physician before implementation."
  ),
};

// ── Multimodal Integration Panel ─────────────────────────────────────────

function _renderRehabIntegrationPanel(patientId) {
  return `<div class="ch-card">
    <div class="ch-card-title">Multimodal Integration</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
      <a href="#/medication-analyzer?patient=${patientId}" class="ch-link">Medications</a>
      <a href="#/qeeg-analysis?patient=${patientId}" class="ch-link">qEEG</a>
      <a href="#/mri-analysis?patient=${patientId}" class="ch-link">MRI</a>
      <a href="#/biomarkers?patient=${patientId}" class="ch-link">Biomarkers</a>
      <a href="#/nutrition-analyzer?patient=${patientId}" class="ch-link">Nutrition</a>
      <a href="#/protocols?patient=${patientId}" class="ch-link">Protocols</a>
      <a href="#/deeptwin?patient=${patientId}" class="ch-link">DeepTwin</a>
      <a href="#/risk?patient=${patientId}" class="ch-link">Risk Analyzer</a>
    </div>
  </div>`;
}

// ──────────────────────────────────────────────────────────────────────────
// Default export for renderPage integration
// ──────────────────────────────────────────────────────────────────────────

export default renderRehabPage;
