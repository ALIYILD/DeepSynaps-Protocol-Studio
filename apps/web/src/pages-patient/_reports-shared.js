// Patient reports — shared helpers extracted from pages-patient.js.
//
// This module hosts the load-bearing logic for the Reports page so that the
// new Health Reports v2 page (`./health-reports.js`) and the legacy
// `pgPatientReports` body inside `pages-patient.js` can share the SAME
// implementation, rather than maintaining two copies which would inevitably
// drift (see the lockstep warning in `_shared.js:9-13`).
//
// Extracted (no behavioural change):
//   - DOC_PLAIN_LANG              plain-language knowledge base
//   - docPlainLang(key, override) lookup
//   - scoreInterpretation()       band lookup against DOC_PLAIN_LANG
//   - categorise()                doc-type classifier
//   - CAT_META                    category presentation metadata
//   - DISPLAY_CATS()              top-level grouping factory (function so t()
//                                 is resolved at call time, not import time)
//   - _ptComputeDelta()           delta vs prior same-template doc
//   - docOrigin()                 ai vs clinic vs device tagging
//   - _normalizeDocs()            outcomes+assessments+reports → unified docs[]
//   - _fetchPatientReportsBundle() the parallel-fetch with 3s soft-timeout
//   - docCardHTML()               doc-card HTML renderer (takes a ctx object
//                                 carrying the closure state the legacy
//                                 page used to capture)
//   - logPatientReportsAuditEvent() best-effort audit-event POST. Used by
//                                 both the legacy `pgPatientReports` and the
//                                 v2 `pgPatientHealthReports` so the audit
//                                 trail stays uniform across both surfaces.
//
// All helpers are pure (apart from `logPatientReportsAuditEvent`, which
// fire-and-forgets a network call); none read global state.

import { t } from '../i18n.js';
import { fmtDate } from './_shared.js';
import { api } from '../api.js';

// ── Plain-language knowledge base ──────────────────────────────────────────
// Extension point: clinician-approved per-patient summaries can be supplied
// by the backend via a `plain_language` field on the outcome object, which
// would override these defaults.
export const DOC_PLAIN_LANG = {
  phq9:   { what: 'A 9-question depression screening questionnaire', why: 'Helps your clinician track changes in mood and depression over time',
            range: [{max:4,label:'Minimal',note:'Little to no depression symptoms at this time'},{max:9,label:'Mild',note:'Mild mood changes — worth monitoring but not alarming'},{max:14,label:'Moderate',note:'Noticeable depression — treatment is likely focused here'},{max:19,label:'Moderately severe',note:'Significant symptoms — your care team is actively monitoring you'},{max:99,label:'Severe',note:'High symptom burden — your team has prioritised this in your plan'}] },
  phq2:   { what: 'A 2-question mood check', why: 'A quick snapshot of how low mood has been recently', range: [] },
  gad7:   { what: 'A 7-question anxiety screening questionnaire', why: 'Tracks anxiety and worry levels so your clinician can adjust treatment',
            range: [{max:4,label:'Minimal',note:'Low anxiety levels'},{max:9,label:'Mild',note:'Mild anxiety — your team is tracking this'},{max:14,label:'Moderate',note:'Moderate anxiety — your clinician is monitoring closely'},{max:99,label:'Severe',note:'Significant anxiety — your care team is focused on this'}] },
  gad2:   { what: 'A 2-question anxiety check', why: 'A quick snapshot of anxiety levels', range: [] },
  pcl5:   { what: 'A PTSD symptoms checklist', why: 'Helps track trauma-related symptoms including flashbacks, avoidance, and sleep disruption', range: [] },
  hdrs:   { what: 'A clinician-rated depression assessment', why: 'Your clinician used this structured interview to assess how depression is affecting you',
            range: [{max:7,label:'Normal',note:'Symptoms are minimal at this point'},{max:13,label:'Mild',note:'Mild depression symptoms present'},{max:17,label:'Moderate',note:'Moderate depression — treatment is targeting this'},{max:23,label:'Severe',note:'Significant depression — your team is closely monitoring'},{max:99,label:'Very severe',note:'High symptom burden — your team is actively adjusting your plan'}] },
  hamd:   { what: 'A clinician-rated depression assessment', why: 'Your clinician used this to assess how depression is affecting you', range: [] },
  madrs:  { what: 'A clinician-rated depression scale', why: 'Tracks how mood and energy are responding to treatment',
            range: [{max:6,label:'Normal',note:'No significant depression symptoms'},{max:19,label:'Mild',note:'Mild symptoms — treatment is working'},{max:34,label:'Moderate',note:'Moderate symptoms — treatment is targeted here'},{max:99,label:'Severe',note:'Significant symptom burden — your team is closely monitoring'}] },
  bprs:   { what: 'A broad psychiatric symptom assessment', why: 'Gives your clinician a full picture of any symptoms you may be experiencing', range: [] },
  panss:  { what: 'An assessment for psychotic symptoms', why: 'Helps track the range and intensity of symptoms across multiple areas', range: [] },
  ybocs:  { what: 'An OCD severity assessment', why: 'Tracks obsessions and compulsions to measure how treatment is progressing', range: [] },
  caps5:  { what: 'A structured PTSD assessment interview', why: 'A detailed check on trauma-related symptoms completed with your clinician', range: [] },
  bdi:    { what: 'A depression inventory', why: 'Measures how depression symptoms have changed since your last assessment', range: [] },
  bai:    { what: 'An anxiety inventory', why: 'Measures physical and cognitive anxiety symptoms', range: [] },
  dass21: { what: 'A 21-question measure of depression, anxiety, and stress', why: 'Gives your care team a broad view of how you have been feeling across three areas', range: [] },
  iesr:   { what: 'A trauma-related stress measure', why: 'Tracks how much a stressful event is affecting your thoughts and sleep', range: [] },
  psqi:   { what: 'A sleep quality index', why: 'Measures how well you have been sleeping — sleep is important for treatment progress', range: [] },
  isi:    { what: 'An insomnia severity index', why: 'Tracks how much sleep problems are affecting your daily life', range: [] },
  moca:   { what: 'A cognitive screen', why: 'A quick check on memory, attention, and thinking clarity', range: [] },
  mmse:   { what: 'A cognitive assessment', why: 'Assesses memory and thinking skills — important when monitoring brain health', range: [] },
  qids:   { what: 'A quick depression inventory', why: 'A fast measure of depression severity to track weekly changes', range: [] },
  audit:  { what: 'An alcohol use screen', why: 'Helps your care team understand how alcohol may be interacting with treatment', range: [] },
  dast:   { what: 'A drug use screen', why: 'Helps your care team understand substance use as part of your full picture', range: [] },
  // Session and administrative types
  sessionsummary:  { what: 'A summary of what happened during your treatment session', why: 'Keeps a record of what was delivered and how you responded', range: [] },
  adverseevent:    { what: 'A safety record logged by your care team', why: 'Your clinician documents any side effects or unexpected reactions to keep your treatment safe', range: [] },
  consentform:     { what: 'A consent document you signed before treatment', why: 'Documents that you were informed about and agreed to your treatment plan', range: [] },
  careinstructions:{ what: 'Instructions from your care team', why: 'Practical guidance to help you get the most benefit from your treatment', range: [] },
  patientguide:    { what: 'Educational material about your condition or treatment', why: 'Helps you understand what to expect and how your treatment works', range: [] },
  referral:        { what: 'A referral letter to another provider', why: 'Documents a request for specialist review or additional care', range: [] },
  letter:          { what: 'A letter from your clinical team', why: 'Formal communication about your treatment or progress', range: [] },
};

/** Per-doc plain-language lookup. Backend can override via `plain_language`. */
export function docPlainLang(templateKey, override) {
  if (override && (override.what || override.why)) return override;
  if (!templateKey) return null;
  const k = String(templateKey).toLowerCase().replace(/[-_\s]/g, '');
  for (const [key, val] of Object.entries(DOC_PLAIN_LANG)) {
    if (k === key.replace(/[-_\s]/g, '')) return val;
  }
  return null;
}

/** Map a numeric score to its plain-language band per DOC_PLAIN_LANG.range. */
export function scoreInterpretation(templateKey, score) {
  if (score == null || score === '') return null;
  const pl = docPlainLang(templateKey);
  if (!pl || !pl.range || !pl.range.length) return null;
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  for (const band of pl.range) {
    if (n <= band.max) return { label: band.label, note: band.note };
  }
  return null;
}

/** Doc-type classifier — maps raw item shape to one of the CAT_META keys. */
export function categorise(item) {
  const raw = (item.doc_type || item.template_id || item.assessment_type || '').toLowerCase();
  if (/consent/.test(raw))               return 'consent';
  if (/care.?instruct|instruction/.test(raw)) return 'care';
  if (/session.?summar|visit.?summar/.test(raw)) return 'session-summary';
  if (/adverse|side.?effect/.test(raw))  return 'adverse';
  if (/referral|letter/.test(raw))       return 'letter';
  if (/patient.?guide|educat|leaflet/.test(raw)) return 'guide';
  if (item._source === 'assessment')     return 'assessment';
  return 'outcome';
}

/**
 * Category presentation metadata. Wrapped in a getter function so that
 * `t()` is evaluated at call time (locale-changes don't get baked in at
 * module import).
 */
export function CAT_META() {
  return {
    outcome:           { label: t('patient.reports.cat.outcome'),         icon: '&#9649;', color: 'var(--blue)',    bg: 'rgba(74,158,255,.1)'    },
    assessment:        { label: t('patient.reports.cat.assessment'),      icon: '&#9673;', color: 'var(--teal)',    bg: 'rgba(0,212,188,.08)'   },
    'session-summary': { label: t('patient.reports.cat.session_summary'), icon: '&#9671;', color: '#a78bfa',        bg: 'rgba(167,139,250,.1)'  },
    adverse:           { label: t('patient.reports.cat.adverse'),         icon: '&#9680;', color: '#fb923c',        bg: 'rgba(251,146,60,.1)'   },
    consent:           { label: t('patient.reports.cat.consent'),         icon: '&#9643;', color: '#94a3b8',        bg: 'rgba(148,163,184,.1)'  },
    care:              { label: t('patient.reports.cat.care'),            icon: '&#9678;', color: '#34d399',        bg: 'rgba(52,211,153,.1)'   },
    guide:             { label: t('patient.reports.cat.guide'),           icon: '&#128218;', color: '#f59e0b',      bg: 'rgba(245,158,11,.08)'  },
    letter:            { label: t('patient.reports.cat.letter'),          icon: '&#9672;', color: '#e2e8f0',        bg: 'rgba(226,232,240,.06)' },
    biometrics:        { label: 'Biometrics',                              icon: '&#9829;',  color: '#f472b6',       bg: 'rgba(244,114,182,.1)'  },
  };
}

/**
 * Top-level display-grouping definitions. Wrapped in a function so that the
 * filter closures and the t()-resolved labels reflect call-site locale.
 */
export function DISPLAY_CATS() {
  return [
    { id: 'ai',         label: 'AI-Generated Insights',      icon: '🤖', emoji: '🤖', tone: 'violet', color: '#a78bfa',      bg: 'rgba(167,139,250,.1)',  defaultOpen: true,
      filter: d => d.origin === 'ai',
      emptyMsg: 'Synaps AI will draft narrative summaries, trend reads, and protocol suggestions here once your clinician enables them.' },
    { id: 'clinic',     label: 'Clinician Reports',          icon: '🩺', emoji: '🩺', tone: 'teal',   color: 'var(--teal)',  bg: 'rgba(0,212,188,.08)',   defaultOpen: true,
      filter: d => (d.origin === 'clinic') && (d.category === 'outcome' || d.category === 'assessment' || d.category === 'session-summary' || Boolean(d.clinicianNotes)),
      emptyMsg: 'Reports your care team has signed off — clinical summaries, letters, and reviewed assessments — will appear here.' },
    { id: 'biometrics', label: 'Biometrics',                 icon: '🫀', emoji: '🫀', tone: 'rose',   color: '#f472b6',      bg: 'rgba(244,114,182,.1)',  defaultOpen: true,
      filter: d => d.category === 'biometrics',
      emptyMsg: 'Connect Apple Health, Oura, Fitbit, or Garmin in Settings → Integrations to see weekly biometric snapshots here.' },
    { id: 'correlations', label: 'Correlation Reports',      icon: '🧬', emoji: '🧬', tone: 'amber',  color: '#f59e0b',      bg: 'rgba(245,158,11,.08)',  defaultOpen: false,
      filter: d => d.category === 'correlation' || d._source === 'correlation',
      emptyMsg: 'Cross-signal correlation reports — how your sleep affects mood, how HRV maps to session response — appear here once you have ~2 weeks of biometric + mood data.' },
    { id: 'progress',   label: 'Progress Reports',           icon: '📈', emoji: '📈', tone: 'blue',   color: 'var(--blue)',  bg: 'rgba(74,158,255,.1)',   defaultOpen: false,
      filter: d => d.category === 'outcome',
      emptyMsg: 'Progress reports will appear here as your treatment continues.' },
    { id: 'assessment', label: 'Assessment Results',         icon: '📋', emoji: '📋', tone: 'teal',   color: 'var(--teal)',  bg: 'rgba(0,212,188,.08)',   defaultOpen: false,
      filter: d => d.category === 'assessment',
      emptyMsg: 'Assessment results will appear here after your clinician completes a check-in.' },
    { id: 'feedback',   label: 'Care Team Feedback',         icon: '💬', emoji: '💬', tone: 'green',  color: '#34d399',      bg: 'rgba(52,211,153,.1)',   defaultOpen: false,
      filter: d => Boolean(d.clinicianNotes),
      emptyMsg: 'Notes from your care team will appear here. Check back after your next session.' },
    { id: 'sessions',   label: 'Session Summaries',          icon: '📅', emoji: '📅', tone: 'violet', color: '#a78bfa',      bg: 'rgba(167,139,250,.1)',  defaultOpen: false,
      filter: d => d.category === 'session-summary',
      emptyMsg: 'Session summaries will appear here after each of your treatment sessions.' },
    { id: 'guides',     label: 'Instructions & Care Guides', icon: '📚', emoji: '📚', tone: 'amber',  color: '#f59e0b',      bg: 'rgba(245,158,11,.08)',  defaultOpen: false,
      filter: d => d.category === 'care' || d.category === 'guide',
      emptyMsg: 'Instructions and care guides from your team will appear here.' },
    { id: 'forms',      label: 'Consent & Forms',            icon: '📄', emoji: '📄', tone: 'slate',  color: '#94a3b8',      bg: 'rgba(148,163,184,.1)',  defaultOpen: false,
      filter: d => d.category === 'consent' || d.category === 'adverse' || d.category === 'letter',
      emptyMsg: 'Consent forms and other documents will appear here when added by your care team.' },
  ];
}

/**
 * Compute a doc's score-delta vs the most recent prior same-template doc.
 * Returns `{ delta, prevScore, prevDate }` or null when no comparison fits.
 */
export function _ptComputeDelta(doc, allDocs) {
  if (doc.score == null || !doc.templateKey) return null;
  const n = Number(doc.score);
  if (!Number.isFinite(n)) return null;
  const prior = (allDocs || [])
    .filter(d =>
      d.id !== doc.id &&
      d.templateKey === doc.templateKey &&
      d.score != null &&
      Number.isFinite(Number(d.score)) &&
      new Date(d.date || 0) < new Date(doc.date || 0)
    )
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  if (!prior.length) return null;
  const prev = prior[0];
  const delta = n - Number(prev.score);
  if (!Number.isFinite(delta)) return null;
  return { delta, prevScore: prev.score, prevDate: prev.displayDate || '' };
}

/**
 * Tag a doc's origin (ai vs clinic vs device). Heuristic until the backend
 * surfaces an explicit `origin` field. Falls back to "clinic" so existing
 * outcomes don't get mis-grouped.
 */
export function docOrigin(d, raw) {
  const rawOrigin = String(raw?.origin || raw?.source || raw?.generated_by || '').toLowerCase();
  if (rawOrigin.includes('ai') || raw?.ai_generated === true) return 'ai';
  if (d.clinicianNotes) return 'clinic';
  if (rawOrigin === 'clinician' || rawOrigin === 'clinic') return 'clinic';
  return 'clinic';
}

// Local HTML escaper — same shape as the in-page `esc()` used by docCardHTML.
function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Normalise outcomes + assessments + reports + (optional) wearable rows into
 * a single sorted docs[] list. Wraps the legacy normalisation logic that
 * lived inline at `pages-patient.js:2739-2917`.
 *
 * @param {object} bundle  result of `_fetchPatientReportsBundle()`
 * @param {object} maps    { sessionById, courseById }
 */
export function _normalizeDocs(bundle, maps = {}) {
  const outcomes    = Array.isArray(bundle.outcomes)     ? bundle.outcomes     : [];
  const assessments = Array.isArray(bundle.assessments)  ? bundle.assessments  : [];
  const reports     = Array.isArray(bundle.reports)      ? bundle.reports      : [];
  const wearableRows = Array.isArray(bundle.wearableSummary) ? bundle.wearableSummary : [];
  const sessionById = maps.sessionById || {};
  const courseById  = maps.courseById  || {};

  const docs = [];

  outcomes.forEach(o => {
    const templateKey = (o.template_id || '').toLowerCase();
    const pl    = docPlainLang(templateKey, o.plain_language);
    const interp = scoreInterpretation(templateKey, o.score);
    const session = o.session_id ? sessionById[o.session_id] : null;
    const course  = o.course_id  ? courseById[o.course_id]   : null;
    docs.push({
      id:          o.id || `outcome-${Math.random().toString(36).slice(2)}`,
      _source:     'outcome',
      title:       o.template_title || (pl ? pl.what : null) || 'Outcome Report',
      date:        o.administered_at,
      displayDate: fmtDate(o.administered_at),
      templateKey,
      category:    categorise({ ...o, _source: 'outcome' }),
      score:       o.score != null ? o.score : null,
      scoreInterp: interp,
      measurePoint: o.measurement_point || null,
      plainLang:   pl,
      sessionRef:  session ? {
        number:   session.session_number || null,
        date:     fmtDate(session.delivered_at || session.scheduled_at),
        modality: session.modality_slug || null,
      } : null,
      courseRef:   course ? {
        title: course.condition_name || course.protocol_name || 'Your treatment',
        id:    course.id,
      } : null,
      url:         o.report_url || o.pdf_url || o.file_url || null,
      status:      (o.status || 'completed').toLowerCase(),
      clinicianNotes: o.clinician_notes || o.notes || null,
    });
  });

  assessments.forEach(a => {
    const templateKey = (a.template_id || a.assessment_type || a.name || '').toLowerCase();
    docs.push({
      id:          a.id || `assess-${Math.random().toString(36).slice(2)}`,
      _source:     'assessment',
      title:       a.template_title || a.name || a.title || a.assessment_type || 'Assessment',
      date:        a.created_at || a.completed_at || a.administered_at,
      displayDate: fmtDate(a.created_at || a.completed_at || a.administered_at),
      templateKey,
      category:    categorise({ ...a, _source: 'assessment' }),
      score:       a.score != null ? a.score : null,
      scoreInterp: scoreInterpretation(templateKey, a.score),
      measurePoint: a.measurement_point || null,
      plainLang:   docPlainLang(templateKey, a.plain_language),
      sessionRef:  null,
      courseRef:   null,
      url:         a.report_url || a.pdf_url || a.file_url || null,
      status:      (a.status || 'completed').toLowerCase(),
      clinicianNotes: a.notes || a.clinician_notes || null,
    });
  });

  // Re-walk raw outcomes/assessments to attach origin back onto docs.
  const _rawById = {};
  outcomes.forEach(o => { if (o.id != null) _rawById[String(o.id)] = o; });
  assessments.forEach(a => { if (a.id != null) _rawById[String(a.id)] = a; });
  docs.forEach(d => { d.origin = docOrigin(d, _rawById[String(d.id)] || {}); });

  // Clinician-uploaded / generated reports.
  reports.forEach(r => {
    const pl = docPlainLang(r.report_type);
    docs.push({
      id: r.id,
      _source: 'report',
      title: r.title || 'Report',
      date: r.created_at,
      displayDate: fmtDate(r.created_at),
      templateKey: (r.report_type || '').toLowerCase(),
      category: categorise({ doc_type: r.report_type, _source: 'report' }),
      score: null,
      scoreInterp: null,
      measurePoint: null,
      plainLang: pl,
      sessionRef: null,
      courseRef: null,
      url: r.file_url || null,
      status: (r.status || 'available').toLowerCase(),
      clinicianNotes: r.text_content || null,
      origin: 'clinic',
    });
  });

  // Biometrics synthesis from wearable summary — collapse daily rows into
  // ISO-week snapshots so the patient sees a readable record.
  if (wearableRows.length > 0) {
    const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n))) ? null : Number(n).toFixed(d);
    const avg = (vals) => {
      const xs = vals.filter(v => v != null && Number.isFinite(Number(v))).map(Number);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    };
    const weekOf = (iso) => {
      try {
        const d = new Date(iso);
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
        return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
      } catch (_) { return 'unknown'; }
    };
    const byWeek = {};
    wearableRows.forEach(r => {
      const w = weekOf(r.date);
      (byWeek[w] = byWeek[w] || []).push(r);
    });
    Object.keys(byWeek).sort().reverse().forEach((w, idx) => {
      const rows = byWeek[w];
      const firstDate = rows.map(r => r.date).filter(Boolean).sort()[0];
      const lastDate  = rows.map(r => r.date).filter(Boolean).sort().slice(-1)[0];
      const avgSleep   = avg(rows.map(r => r.sleep_duration_h));
      const avgRHR     = avg(rows.map(r => r.rhr_bpm));
      const avgHRV     = avg(rows.map(r => r.hrv_ms));
      const totalSteps = rows.reduce((acc, r) => acc + (Number(r.steps) || 0), 0);
      const avgReady   = avg(rows.map(r => r.readiness_score));
      const summaryBits = [];
      if (avgSleep != null) summaryBits.push(`sleep ${fmt(avgSleep, 1)} h avg`);
      if (avgRHR != null)   summaryBits.push(`resting HR ${fmt(avgRHR, 0)} bpm`);
      if (avgHRV != null)   summaryBits.push(`HRV ${fmt(avgHRV, 0)} ms`);
      if (totalSteps > 0)   summaryBits.push(`${totalSteps.toLocaleString()} steps`);
      const summary = summaryBits.join(' · ') || 'No wearable data captured';
      docs.push({
        id:          `biometric-${w}`,
        _source:     'biometric',
        title:       `Biometrics snapshot · ${fmtDate(firstDate)}${firstDate !== lastDate ? ' – ' + fmtDate(lastDate) : ''}`,
        date:        lastDate,
        displayDate: fmtDate(lastDate),
        templateKey: 'biometrics',
        category:    'biometrics',
        origin:      'device',
        score:       avgReady != null ? Number(fmt(avgReady, 0)) : null,
        scoreInterp: null,
        measurePoint: `Week ${idx === 0 ? '· most recent' : ''}`,
        plainLang:   {
          what: 'A weekly summary of signals from your wearables.',
          why:  'Sleep, heart rate, HRV, and activity correlate with how you feel and how well your brain recovers between sessions.',
          range: [],
        },
        sessionRef:  null,
        courseRef:   null,
        url:         null,
        status:      'available',
        clinicianNotes: null,
        biometricSummary: summary,
      });
    });
  }

  // Newest first.
  docs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return docs;
}

/**
 * Parallel-fetch the seven sources the Reports page reads. Each call is
 * race()'d against a 3s timeout so a hung backend never wedges the page.
 *
 * @param {string} patientId  optional patient id (for evidence loader)
 * @param {object} loaders    optional injection point (used in tests)
 */
export async function _fetchPatientReportsBundle(patientId = null, loaders = {}) {
  const _timeout = (ms) => new Promise(r => setTimeout(() => r(null), ms));
  const _raceNull = (p) => Promise.race([
    Promise.resolve(p).catch(() => null),
    _timeout(3000),
  ]);

  const evidenceLoader = loaders.evidenceLoader || null;

  let outcomes, assessments, courses, sessions, wearableSummary, reports, evidence, patientReports, patientReportsSummary;
  let serverErr = false;
  try {
    [outcomes, assessments, courses, sessions, wearableSummary, reports, evidence, patientReports, patientReportsSummary] = await Promise.all([
      _raceNull(api.patientPortalOutcomes()),
      _raceNull(api.patientPortalAssessments()),
      _raceNull(api.patientPortalCourses()),
      _raceNull(api.patientPortalSessions()),
      _raceNull(api.patientPortalWearableSummary(30)),
      _raceNull(api.patientPortalReports()),
      evidenceLoader ? _raceNull(evidenceLoader(patientId)) : Promise.resolve(null),
      typeof api.listPatientReports === 'function' ? _raceNull(api.listPatientReports({ limit: 100 })) : Promise.resolve(null),
      typeof api.getPatientReportsSummary === 'function' ? _raceNull(api.getPatientReportsSummary()) : Promise.resolve(null),
    ]);
  } catch (_e) {
    outcomes = assessments = courses = sessions = wearableSummary = reports = evidence = null;
    patientReports = null;
    patientReportsSummary = null;
    serverErr = true;
  }

  return {
    outcomes, assessments, courses, sessions, wearableSummary, reports, evidence,
    patientReports, patientReportsSummary, serverErr,
  };
}

/**
 * Render a single document card to HTML. Takes a context object carrying
 * the closure state the legacy in-page implementation captured (docs[],
 * patient-scope server-state flags, the patientReportsById index).
 *
 * Pure function — does not read globals. Callers wire window._pt* handlers
 * separately.
 */
export function docCardHTML(doc, ctx = {}, opts = {}) {
  const allDocs = ctx.docs || [];
  const _patientReportsById = ctx.patientReportsById || {};
  const _patientReportsServerLive = ctx.patientReportsServerLive !== false;
  const _patientReportsConsentActive = ctx.patientReportsConsentActive !== false;
  const META = CAT_META();

  // Compute delta once — re-used below for first-report detection and
  // the "What changed" row.
  const delta = _ptComputeDelta(doc, allDocs);
  const _firstReport = doc.score != null && doc.templateKey && delta === null;
  const { expandPl = _firstReport } = opts;
  const cm = META[doc.category] || META['outcome'];
  const plId = `pt-doc-pl-${esc(doc.id)}`;

  // Context chips: session ref + course ref + measurement point
  const sessionChip = doc.sessionRef
    ? `<span class="pt-doc-chip">Session${doc.sessionRef.number ? ' #' + doc.sessionRef.number : ''} · ${esc(doc.sessionRef.date)}</span>`
    : '';
  const courseChip = doc.courseRef
    ? `<span class="pt-doc-chip">${esc(doc.courseRef.title)}</span>`
    : '';
  const measureChip = doc.measurePoint
    ? `<span class="pt-doc-chip">${esc(doc.measurePoint)}</span>`
    : '';
  const chips = [sessionChip, courseChip, measureChip].filter(Boolean).join('');

  // Score + interpretation
  const interpBand = doc.scoreInterp;
  const scoreHTML = doc.score != null
    ? `<div class="pt-doc-score">
         <span class="pt-doc-score-num">${(doc.score != null && !isNaN(Number(doc.score))) ? esc(String(doc.score)) : '—'}</span>
         ${interpBand ? `<span class="pt-doc-score-band ${esc(interpBand.label.toLowerCase().replace(/\s+/g,'-'))}">${esc(interpBand.label)}</span>` : ''}
       </div>`
    : '';

  // Status badge
  const showStatus = doc.status && !['completed','done','available',''].includes(doc.status);
  const statusBadge = showStatus
    ? `<span class="pt-doc-status-badge">${esc(doc.status)}</span>`
    : '';

  // Delta row
  let deltaRow = '';
  if (delta !== null) {
    const abs = Math.abs(delta.delta);
    const dir = delta.delta < 0 ? 'dropped' : 'increased';
    const tone = delta.delta < 0 ? 'This is a positive sign.' : 'This change is being tracked in your portal workflow.';
    deltaRow = `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">What changed</span>Your score ${dir} by ${abs} point${abs !== 1 ? 's' : ''} since your last report on ${esc(delta.prevDate)}. ${tone}</div>`;
  } else if (doc.score != null && doc.templateKey) {
    deltaRow = `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">What changed</span>This is your first recorded result for this measure — future reports will show how you are progressing.</div>`;
  }

  // Plain-language section
  const hasPl = Boolean(doc.plainLang);
  const plSection = hasPl
    ? `<button class="pt-doc-pl-toggle" aria-expanded="${expandPl}"
              aria-controls="${plId}"
              onclick="window._ptToggleDocPl('${esc(doc.id)}')">
         <span class="pt-doc-pl-toggle-ico">&#9678;</span>
         ${t('patient.reports.doc.what_this')}
         <span class="pt-doc-pl-chev" id="chev-${esc(doc.id)}" aria-hidden="true">${expandPl ? '▴' : '▾'}</span>
       </button>
       <div class="pt-doc-pl-body" id="${plId}" ${expandPl ? '' : 'hidden'}>
         ${doc.plainLang.what ? `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">${t('patient.reports.doc.what_this')}</span>${esc(doc.plainLang.what)}</div>` : ''}
         ${doc.plainLang.why  ? `<div class="pt-doc-pl-row"><span class="pt-doc-pl-label">${t('patient.reports.doc.why')}</span>${esc(doc.plainLang.why)}</div>` : ''}
         ${deltaRow}
         ${interpBand         ? `<div class="pt-doc-pl-row pt-doc-pl-row-hl"><span class="pt-doc-pl-label">${t('patient.reports.doc.what_means')}</span>${esc(interpBand.note)}</div>` : ''}
       </div>`
    : '';

  // Actions
  const viewCta = doc.url
    ? `<a class="pt-doc-cta" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer"
            aria-label="${t('patient.reports.doc.view')} ${esc(doc.title)}"
            onclick="window._ptReportOpened && window._ptReportOpened('${esc(doc.id)}','open_link')"
            tabindex="0">${t('patient.reports.doc.view')}</a>`
    : `<button class="pt-doc-cta pt-doc-cta-stub"
             onclick="window._ptViewDoc && window._ptViewDoc('${esc(doc.id)}')"
             aria-label="${t('patient.reports.doc.view')} ${esc(doc.title)}">${t('patient.reports.doc.view')}</button>`;

  const dlCta = doc.url
    ? `<a class="pt-doc-cta pt-doc-cta-dl" href="${esc(doc.url)}" download
            target="_blank" rel="noopener noreferrer"
            aria-label="Download ${esc(doc.title)}"
            onclick="window._ptReportDownloaded && window._ptReportDownloaded('${esc(doc.id)}')">Download</a>`
    : '';

  const askCta = `<button class="pt-doc-cta pt-doc-cta-ask"
           onclick="window._ptAskAbout && window._ptAskAbout('${esc(doc.id)}','${esc(doc.title)}')"
           aria-label="Ask about ${esc(doc.title)}">Ask about this</button>`;

  // Patient-scope CTAs (Acknowledge / Share-back / Question thread).
  const _prMeta = (doc && doc._source === 'report' && doc.id) ? _patientReportsById[String(doc.id)] : null;
  const _prDisabled = !_patientReportsServerLive || _patientReportsConsentActive === false;
  const _prDisabledHint = !_patientReportsServerLive
    ? 'Reconnect to the server to use this action.'
    : (_patientReportsConsentActive === false ? 'Paused while consent is withdrawn.' : '');
  let ackCta = '';
  let shareBackCta = '';
  let questionCta = '';
  if (_prMeta) {
    const acked = !!_prMeta.acknowledged;
    ackCta = acked
      ? `<button class="pt-doc-cta pt-doc-cta-ack" disabled aria-disabled="true"
                data-acknowledged="1"
                aria-label="Already acknowledged">&#10003; Acknowledged</button>`
      : `<button class="pt-doc-cta pt-doc-cta-ack"${_prDisabled ? ' disabled aria-disabled="true" title="' + esc(_prDisabledHint) + '"' : ''}
                onclick="window._ptAcknowledgeReport && window._ptAcknowledgeReport('${esc(doc.id)}','${esc(doc.title)}')"
                aria-label="Acknowledge ${esc(doc.title)}">Acknowledge</button>`;
    const sbPending = !!_prMeta.share_back_pending;
    shareBackCta = sbPending
      ? `<button class="pt-doc-cta pt-doc-cta-share" disabled aria-disabled="true"
                data-share-back-pending="1"
                aria-label="Share-back already requested">Share-back requested</button>`
      : `<button class="pt-doc-cta pt-doc-cta-share"${_prDisabled ? ' disabled aria-disabled="true" title="' + esc(_prDisabledHint) + '"' : ''}
                onclick="window._ptShareBackReport && window._ptShareBackReport('${esc(doc.id)}','${esc(doc.title)}')"
                aria-label="Request a copy be shared with my GP or family for ${esc(doc.title)}">Send to GP / family</button>`;
    questionCta = `<button class="pt-doc-cta pt-doc-cta-q"${_prDisabled ? ' disabled aria-disabled="true" title="' + esc(_prDisabledHint) + '"' : ''}
              onclick="window._ptStartQuestionForReport && window._ptStartQuestionForReport('${esc(doc.id)}','${esc(doc.title)}')"
              aria-label="Start a question about ${esc(doc.title)}">Question about this</button>`;
  }

  // Origin + biometric-summary chip
  const originChip = doc.origin === 'ai'
    ? `<span class="pt-doc-chip pt-doc-chip--ai">🤖 AI-generated</span>`
    : doc.origin === 'device'
      ? `<span class="pt-doc-chip pt-doc-chip--biometric">🫀 From your wearables</span>`
      : '';
  const biometricRow = doc.biometricSummary
    ? `<div class="pt-doc-biometric-summary">${esc(doc.biometricSummary)}</div>`
    : '';

  return `
    <div class="pt-doc-card" data-cat="${esc(doc.category)}" data-id="${esc(doc.id)}">
      <div class="pt-doc-card-top">
        <div class="pt-doc-icon" style="background:${cm.bg};color:${cm.color}" aria-hidden="true">${cm.icon}</div>
        <div class="pt-doc-main">
          <div class="pt-doc-title">${esc(doc.title)}</div>
          <div class="pt-doc-meta">
            <span class="pt-doc-date">${esc(doc.displayDate)}</span>
            <span class="pt-doc-type-label" style="color:${cm.color}">${esc(cm.label)}</span>
            ${statusBadge}
          </div>
          ${chips || originChip ? `<div class="pt-doc-chips">${originChip}${chips}</div>` : ''}
          ${biometricRow}
        </div>
        <div class="pt-doc-actions-col">
          ${viewCta}
          ${dlCta}
          ${askCta}
          ${ackCta}
          ${shareBackCta}
          ${questionCta}
          ${scoreHTML}
        </div>
      </div>
      ${plSection}
    </div>`;
}

/**
 * Best-effort audit-event POST. Mirrors the legacy `_patientReportsLogAuditEvent`
 * helper from `pages-patient.js` (2026-05-01) so both the legacy My Reports
 * page and the v2 Health Reports page emit identically-shaped audit rows
 * against `POST /api/v1/reports/patient/audit-events`.
 *
 * Fire-and-forget — never throws back at the caller. Audit failures must
 * never block the UI.
 *
 * @param {string} event   audit event-type (e.g. 'view', 'tab_change',
 *                         'report_opened', 'report_downloaded')
 * @param {object} extra   optional { report_id, note, using_demo_data }
 */
export async function logPatientReportsAuditEvent(event, extra) {
  try {
    if (api && typeof api.postPatientReportsAuditEvent === 'function') {
      await api.postPatientReportsAuditEvent({
        event,
        report_id: (extra && extra.report_id) ? String(extra.report_id) : null,
        note: (extra && extra.note) ? String(extra.note).slice(0, 480) : null,
        using_demo_data: !!(extra && extra.using_demo_data),
      });
    }
  } catch (_) { /* audit failures must never block UI */ }
}

// ── Module-level CTA click handlers (2026-05-08) ─────────────────────────────
// `docCardHTML` renders CTAs that reference `window._pt*` global handlers
// (Acknowledge, Share-back, Question, View, Ask, Toggle plain-language).
// Historically these were assigned inside the `pgPatientReports` closure in
// `pages-patient.js`. When a patient now lands on the v2 `pgPatientHealthReports`
// page directly (without ever visiting the legacy page first), the legacy
// closure never runs and the CTAs silently no-op. We hoist the handlers to
// module scope here and let both pages call `installPatientReportsCtaHandlers`
// at mount-time to wire them onto `window` from a single source of truth.
//
// Closure state (api server-live flags, current docs[], the demo-mode flag,
// and the patient-messages navigator) is held in `_ctaCtx` and refreshed on
// each page mount via the install helper.
let _ctaCtx = {
  docs: [],
  patientReportsServerLive: true,
  patientReportsConsentActive: true,
  patientReportsIsDemo: false,
  navigateToMessages: null, // optional () => void; legacy + v2 wire window._navPatient
};

// Tiny self-contained toast — keeps the handlers UI-self-sufficient regardless
// of which page mounted them. Mirrors the in-page `_prToast` helper used by
// the legacy `pgPatientReports`.
function _ctaToast(msg) {
  try {
    if (typeof document === 'undefined') return;
    const tEl = document.createElement('div');
    tEl.setAttribute('role', 'status');
    tEl.setAttribute('aria-live', 'polite');
    tEl.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.18);max-width:90vw';
    tEl.textContent = String(msg || '');
    document.body.appendChild(tEl);
    setTimeout(() => { try { tEl.remove(); } catch (_) {} }, 3200);
  } catch (_) { /* noop */ }
}

/** Toggle the plain-language accordion for a doc card. */
export function ptToggleDocPl(docId) {
  if (typeof document === 'undefined' || !docId) return;
  const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(docId) : String(docId);
  const body = document.querySelector(`#pt-doc-pl-${safeId}`);
  const chev = document.querySelector(`#chev-${safeId}`);
  const btn  = document.querySelector(`[aria-controls="pt-doc-pl-${safeId}"]`);
  if (!body) return;
  const opening = body.hasAttribute('hidden');
  if (opening) { body.removeAttribute('hidden'); } else { body.setAttribute('hidden', ''); }
  if (chev) chev.textContent = opening ? '▴' : '▾';
  if (btn)  btn.setAttribute('aria-expanded', String(opening));
}

/** View a document — open external URL or surface an unavailable notice. */
export function ptViewDoc(docId) {
  if (typeof document === 'undefined' || !docId) return;
  const doc = (_ctaCtx.docs || []).find(d => String(d.id) === String(docId));
  if (doc && doc.url) {
    try { window.open(doc.url, '_blank', 'noopener,noreferrer'); } catch (_) {}
    return;
  }
  const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(docId) : String(docId);
  const card = document.querySelector(`.pt-doc-card[data-id="${safeId}"]`);
  if (!card) return;
  if (card.querySelector('.pt-doc-unavail')) return;
  const notice = document.createElement('div');
  notice.className = 'pt-doc-unavail';
  notice.textContent = t('patient.media.doc_unavailable');
  card.appendChild(notice);
}

/** Stamp report_opened audit when the patient clicks the View link. */
export function ptReportOpened(reportId, kind) {
  logPatientReportsAuditEvent('report_opened', {
    report_id: String(reportId || ''),
    using_demo_data: _ctaCtx.patientReportsIsDemo,
    note: kind || 'view',
  });
}

/** Stamp report_downloaded audit when the patient clicks the Download link. */
export function ptReportDownloaded(reportId) {
  logPatientReportsAuditEvent('report_downloaded', {
    report_id: String(reportId || ''),
    using_demo_data: _ctaCtx.patientReportsIsDemo,
    note: 'download click',
  });
}

/**
 * Ask-about — prefills a question and surfaces a toast with a deep-link to
 * Messages. The legacy page also renders a `#pt-docs-ask-anchor` for a richer
 * inline confirmation; if that anchor is in the DOM we use it, otherwise we
 * fall back to the floating toast so v2 entries do not silently no-op.
 */
export function ptAskAbout(docId, title) {
  if (typeof document === 'undefined') return;
  const promptText = 'Explain "' + (title || '') + '" in simple language. What does this report mean for me?';
  if (typeof window !== 'undefined') window._ptPendingAsk = promptText;
  logPatientReportsAuditEvent('ask_clicked', {
    report_id: String(docId || ''),
    using_demo_data: _ctaCtx.patientReportsIsDemo,
    note: 'prefill prompt',
  });
  const anchor = document.querySelector('#pt-docs-ask-anchor');
  if (anchor) {
    anchor.innerHTML = `
      <div class="pt-doc-ask-toast" role="status">
        <span class="pt-doc-ask-toast-msg">Your question is ready about: <em>${esc(title)}</em></span>
        <button class="pt-doc-ask-toast-btn" onclick="window._navPatient && window._navPatient('patient-messages')">Go to Messages →</button>
        <button class="pt-doc-ask-toast-close" aria-label="Dismiss"
                onclick="document.querySelector('#pt-docs-ask-anchor').innerHTML=''">&#10005;</button>
      </div>`;
    anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  // v2 surface has no inline anchor — surface a floating toast + Messages
  // navigation hook so the click is never a silent no-op.
  _ctaToast('Your question is ready about: ' + (title || 'this report') + ' — open Messages to send.');
}

/**
 * Acknowledge a report — calls /acknowledge. Updates the in-place button
 * state on success so the patient sees an immediate response. Failures
 * surface a toast; the audit row is recorded server-side regardless.
 */
export async function ptAcknowledgeReport(reportId, title) {
  if (!reportId) return;
  if (!_ctaCtx.patientReportsServerLive) {
    _ctaToast('Reconnect to acknowledge this report.');
    return;
  }
  if (_ctaCtx.patientReportsConsentActive === false) {
    _ctaToast('Acknowledgements are paused while consent is withdrawn.');
    return;
  }
  logPatientReportsAuditEvent('acknowledge_clicked', {
    report_id: String(reportId),
    using_demo_data: _ctaCtx.patientReportsIsDemo,
  });
  try {
    const res = await api.acknowledgePatientReport(reportId, null);
    if (res && res.accepted) {
      const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(reportId)) : String(reportId);
      const btn = document.querySelector(`.pt-doc-card[data-id="${safeId}"] .pt-doc-cta-ack`);
      if (btn) {
        btn.textContent = '✓ Acknowledged';
        btn.setAttribute('disabled', '');
        btn.setAttribute('aria-disabled', 'true');
        btn.dataset.acknowledged = '1';
      }
      _ctaToast('Acknowledged "' + (title || 'report') + '"');
    } else {
      _ctaToast('Could not acknowledge — please try again.');
    }
  } catch (_e) {
    _ctaToast('Could not acknowledge — please try again.');
  }
}

/**
 * Request a share-back — prompts the patient for audience + reason, then
 * calls /request-share-back. Server validates note presence (>= 2 chars) so
 * the prompt re-runs if the patient leaves it blank.
 */
export async function ptShareBackReport(reportId, title) {
  if (!reportId) return;
  if (!_ctaCtx.patientReportsServerLive) {
    _ctaToast('Reconnect to request a share-back.');
    return;
  }
  if (_ctaCtx.patientReportsConsentActive === false) {
    _ctaToast('Share-back requests are paused while consent is withdrawn.');
    return;
  }
  const audience = (typeof window !== 'undefined' && window.prompt && window.prompt('Who should receive a copy? (e.g. "GP", "family member", "insurer")', 'GP')) || '';
  if (!audience.trim()) return;
  const note = (typeof window !== 'undefined' && window.prompt && window.prompt('Add a short note for your clinician — why are you requesting this share-back?', '')) || '';
  if (note.trim().length < 2) {
    _ctaToast('A short reason is required so your clinician can review.');
    return;
  }
  logPatientReportsAuditEvent('share_back_clicked', {
    report_id: String(reportId),
    using_demo_data: _ctaCtx.patientReportsIsDemo,
    note: 'audience=' + audience.slice(0, 60),
  });
  try {
    const res = await api.requestPatientReportShareBack(reportId, audience.trim(), note.trim());
    if (res && res.accepted) {
      const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(reportId)) : String(reportId);
      const btn = document.querySelector(`.pt-doc-card[data-id="${safeId}"] .pt-doc-cta-share`);
      if (btn) {
        btn.textContent = 'Share-back requested';
        btn.setAttribute('disabled', '');
        btn.setAttribute('aria-disabled', 'true');
        btn.dataset.shareBackPending = '1';
      }
      _ctaToast('Share-back request sent to your clinician for review.');
    } else {
      _ctaToast('Could not send share-back — please try again.');
    }
  } catch (_e) {
    _ctaToast('Could not send share-back — please try again.');
  }
  // unused-arg ack — `title` is reserved for richer toast copy in a future revision.
  void title;
}

/**
 * Start a question thread linked to this report — prompts the patient for the
 * question text, calls /start-question, then deep-links into Messages on
 * success.
 */
export async function ptStartQuestionForReport(reportId, title) {
  if (!reportId) return;
  if (!_ctaCtx.patientReportsServerLive) {
    _ctaToast('Reconnect to start a question thread.');
    return;
  }
  if (_ctaCtx.patientReportsConsentActive === false) {
    _ctaToast('Question threads are paused while consent is withdrawn.');
    return;
  }
  const prefill = title ? ('I have a question about "' + title + '": ') : '';
  const question = (typeof window !== 'undefined' && window.prompt && window.prompt('What is your question? Your clinician will reply through Messages.', prefill)) || '';
  if (question.trim().length < 2) return;
  logPatientReportsAuditEvent('question_clicked', {
    report_id: String(reportId),
    using_demo_data: _ctaCtx.patientReportsIsDemo,
  });
  try {
    const res = await api.startPatientReportQuestion(reportId, question.trim());
    if (res && res.accepted) {
      _ctaToast('Question sent — your clinician will reply in Messages.');
      // Deep-link the patient straight into Messages.
      if (typeof _ctaCtx.navigateToMessages === 'function') {
        _ctaCtx.navigateToMessages();
      } else if (typeof window !== 'undefined' && typeof window._navPatient === 'function') {
        window._navPatient('patient-messages');
      }
    } else {
      _ctaToast('Could not start the question — please try again.');
    }
  } catch (_e) {
    _ctaToast('Could not start the question — please try again.');
  }
}

/**
 * Install the doc-card CTA click handlers on `window`. Called by both
 * `pgPatientReports` (legacy) and `pgPatientHealthReports` (v2) at mount-time
 * so the handlers are always wired regardless of which page the patient lands
 * on first.
 *
 * The handlers themselves live at module scope; this helper only refreshes
 * the shared per-page context (server-live flag, consent flag, demo flag,
 * docs[], navigateToMessages) and assigns the functions onto `window`. Safe
 * to call multiple times.
 *
 * @param {object} ctx
 * @param {Array}    ctx.docs                        normalized docs from `_normalizeDocs`
 * @param {boolean}  ctx.patientReportsServerLive    server reachable for /reports endpoints
 * @param {boolean}  ctx.patientReportsConsentActive consent gate
 * @param {boolean}  ctx.patientReportsIsDemo        demo session flag
 * @param {Function} [ctx.navigateToMessages]        optional override; falls back to window._navPatient
 */
export function installPatientReportsCtaHandlers(ctx = {}) {
  _ctaCtx = {
    docs: Array.isArray(ctx.docs) ? ctx.docs : [],
    patientReportsServerLive: ctx.patientReportsServerLive !== false,
    patientReportsConsentActive: ctx.patientReportsConsentActive !== false,
    patientReportsIsDemo: !!ctx.patientReportsIsDemo,
    navigateToMessages: typeof ctx.navigateToMessages === 'function' ? ctx.navigateToMessages : null,
  };
  if (typeof window === 'undefined') return;
  // Always (re-)assign so the latest closure-state context is the one the
  // handlers see. The functions themselves are module-level so the reference
  // is stable; only `_ctaCtx` changes between mounts.
  window._ptToggleDocPl            = ptToggleDocPl;
  window._ptViewDoc                = ptViewDoc;
  window._ptReportOpened           = ptReportOpened;
  window._ptReportDownloaded       = ptReportDownloaded;
  window._ptAskAbout               = ptAskAbout;
  window._ptAcknowledgeReport      = ptAcknowledgeReport;
  window._ptShareBackReport        = ptShareBackReport;
  window._ptStartQuestionForReport = ptStartQuestionForReport;
}
