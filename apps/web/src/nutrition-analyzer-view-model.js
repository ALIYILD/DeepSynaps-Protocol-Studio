/**
 * Maps Nutrition Analyzer API payloads (`NutritionAnalyzerPayload`) to the legacy
 * UI shape used by `pages-nutrition-analyzer.js`, and normalizes audit responses.
 *
 * API schema: `apps/api/app/schemas/nutrition_analyzer.py`
 */

function _safeNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _dayFromIso(iso) {
  if (!iso || typeof iso !== 'string') return '';
  return iso.slice(0, 10);
}

/**
 * @param {Record<string, unknown>} payload - GET /nutrition/analyzer/patient/{id}
 * @returns {Record<string, unknown>} shape compatible with nutrition page renderers
 */
export function mapNutritionApiPayloadToViewModel(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const patientId = String(payload.patient_id || '');
  const dataAsOf = String(payload.data_as_of || '');
  const diet = payload.diet && typeof payload.diet === 'object' ? payload.diet : {};
  const snapList = Array.isArray(payload.snapshot) ? payload.snapshot : [];

  const energyCard = snapList.find((s) => String(s?.label || '').includes('Energy'));
  const proteinCard = snapList.find((s) => String(s?.label || '').includes('Protein'));

  const avgCal = _safeNum(diet.avg_calories_kcal) ?? (energyCard?.value != null && energyCard.value !== '—' ? _safeNum(energyCard.value) : null);
  const avgProtein = _safeNum(diet.avg_protein_g) ?? (proteinCard?.value != null && proteinCard.value !== '—' ? _safeNum(proteinCard.value) : null);
  const avgCarbs = _safeNum(diet.avg_carbs_g);
  const avgFat = _safeNum(diet.avg_fat_g);
  const avgFiber = _safeNum(diet.avg_fiber_g);
  const avgSodium = _safeNum(diet.avg_sodium_mg);

  const refNote =
    'Reported/aggregated intake (7-day window where logged). '
    + 'Not a prescription. Calorie and macro targets require clinician/dietitian review per clinic policy — not inferred here.';

  const macroRow = (label, intake, unit, key) => ({
    intake,
    target: null,
    status: 'normal',
    unit: unit || '',
    _source_note: refNote,
    _metric_key: key,
  });

  const macros = {
    day: _dayFromIso(dataAsOf) || new Date().toISOString().slice(0, 10),
    calories: {
      intake: avgCal,
      target: null,
      status: 'normal',
      _source_note: refNote,
      _metric_key: 'calories',
    },
    protein: macroRow('Protein', avgProtein, 'g', 'protein'),
    carbs: macroRow('Carbs', avgCarbs, 'g', 'carbs'),
    fat: macroRow('Fat', avgFat, 'g', 'fat'),
    fiber: macroRow('Fiber', avgFiber, 'g', 'fiber'),
    sodium: macroRow('Sodium', avgSodium, 'mg', 'sodium'),
  };

  const supplements = Array.isArray(payload.supplements) ? payload.supplements : [];

  const recs = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  const reviewCues = recs.map((r) => ({
    title: String(r?.title || 'Review cue'),
    detail: String(r?.detail || ''),
    priority: String(r?.priority || 'routine'),
    confidence: typeof r?.confidence === 'number' ? r.confidence : null,
    provenance: String(r?.provenance || ''),
  }));

  return {
    patient_id: patientId,
    patient_name: payload._patient_display_name || '',
    captured_at: dataAsOf,
    computation_id: payload.computation_id,
    schema_version: payload.schema_version,
    clinical_disclaimer: payload.clinical_disclaimer,
    macros,
    micronutrients: [],
    supplements,
    interactions: [],
    daily_log: [],
    _api_payload: payload,
    _data_source: 'api',
    _review_cues: reviewCues,
    _snapshot_cards: snapList,
    _biomarker_links: Array.isArray(payload.biomarker_links) ? payload.biomarker_links : [],
    _evidence_pack: payload.evidence_pack || null,
    _ai_interpretation: Array.isArray(payload.ai_interpretation) ? payload.ai_interpretation : [],
    _audit_summary: payload.audit_events || null,
    _diet_summary: diet,
  };
}

/**
 * @param {Record<string, unknown>|null} raw - profile from API or demo fixture
 * @param {{ patientDisplayName?: string }} [opts]
 */
export function normalizeNutritionProfile(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw._data_source === 'api' || raw._api_payload) {
    const merged = { ...raw };
    if (opts.patientDisplayName) merged.patient_name = opts.patientDisplayName;
    return merged;
  }
  if (raw.snapshot !== undefined && raw.diet !== undefined && raw.patient_id) {
    const vm = mapNutritionApiPayloadToViewModel(raw);
    if (vm && opts.patientDisplayName) vm.patient_name = opts.patientDisplayName;
    return vm;
  }
  if (raw.macros && Object.prototype.hasOwnProperty.call(raw, 'daily_log')) {
    const merged = { ...raw };
    if (opts.patientDisplayName) merged.patient_name = opts.patientDisplayName;
    merged._data_source = merged._data_source || 'demo_fixture';
    return merged;
  }
  return raw;
}

/** Nutrition/labs-adjacent keywords — surface for dietitian review, not autonomous interpretation. */
const _NUTRITION_LAB_KEYWORDS = [
  'glucose', 'hba1c', 'hemoglobin a1c', 'a1c', 'lipid', 'cholesterol',
  'ldl', 'hdl', 'triglyceride', 'triglycerides', 'apob',
  'b12', 'cobalamin', 'folate', 'vitamin d', '25-hydroxy', '25-oh',
  'ferritin', 'iron', 'tibc', 'tsat', 'thyroid', 'tsh', 'free t4',
  'alt', 'ast', 'bilirubin', 'albumin', 'creatinine', 'egfr', 'gfr',
  'sodium', 'potassium', 'inr', 'pt', 'platelet', 'hemoglobin',
];

function _analyteMatchesNutritionContext(analyte) {
  const a = String(analyte || '').toLowerCase();
  return _NUTRITION_LAB_KEYWORDS.some((k) => a.includes(k));
}

/**
 * Pull nutrition-adjacent analytes from Labs Analyzer profile for cross-check (units + refs require clinician review).
 */
export function extractNutritionRelevantLabRows(labsProfile) {
  const panels = Array.isArray(labsProfile?.panels) ? labsProfile.panels : [];
  const flat = [];
  panels.forEach((pn) => {
    const name = String(pn?.name || '');
    (Array.isArray(pn.results) ? pn.results : []).forEach((r) => {
      if (_analyteMatchesNutritionContext(r?.analyte)) flat.push({ ...r, _panel_name: name });
    });
  });
  const byKey = new Map();
  for (const r of flat) {
    const key = String(r.analyte || '').trim().toLowerCase();
    if (!key) continue;
    const prev = byKey.get(key);
    const t = String(r.captured_at || '');
    if (!prev || String(prev.captured_at || '') < t) byKey.set(key, r);
  }
  const rows = [...byKey.values()].sort((a, b) => String(a.analyte).localeCompare(String(b.analyte)));
  return {
    rows: rows.slice(0, 36),
    labs_captured_at: labsProfile?.captured_at || null,
  };
}

/**
 * One row for the clinic summary table (sortable columns).
 */
export function summarizeNutritionForClinic(p) {
  if (!p || typeof p !== 'object') return null;
  const flags = [];
  (p.micronutrients || []).forEach((m) => {
    if (m.status === 'low') flags.push({ label: `${m.label} low`, status: 'low' });
    if (m.status === 'high') flags.push({ label: `${m.label} high`, status: 'high' });
  });
  const macros = p.macros || {};
  ['fiber', 'sodium'].forEach((k) => {
    const v = macros[k];
    if (v && v.status === 'low') flags.push({ label: `${k} low`, status: 'low' });
    if (v && v.status === 'high') flags.push({ label: `${k} high`, status: 'high' });
  });
  const supplementCount = Array.isArray(p.supplements)
    ? p.supplements.filter((s) => s.active !== false).length
    : 0;
  const log = Array.isArray(p.daily_log) ? p.daily_log : [];
  const diet = p._diet_summary && typeof p._diet_summary === 'object' ? p._diet_summary : {};
  const coverage = typeof diet.logging_coverage_pct === 'number' ? diet.logging_coverage_pct : null;

  let lastLogDay = log[0]?.day || null;
  if (!lastLogDay && p.captured_at) lastLogDay = String(p.captured_at).slice(0, 10);

  let adherencePct = 0;
  if (log.length) {
    adherencePct = Math.min(100, Math.round((log.length / 3) * 100));
  } else if (coverage != null) {
    adherencePct = Math.min(100, Math.round(coverage));
  }

  const critical = Array.isArray(p.interactions) && p.interactions.some((i) => i.severity === 'critical');
  const urgentCue = Array.isArray(p._review_cues) && p._review_cues.some((c) => c.priority === 'urgent');

  let worst_severity = 'none';
  if (critical) worst_severity = 'critical';
  else if (urgentCue) worst_severity = 'high';
  else if (flags.length) worst_severity = 'monitor';

  return {
    patient_id: p.patient_id,
    patient_name: p.patient_name || p.patient_id,
    last_log_day: lastLogDay,
    flags: flags.slice(0, 6),
    supplement_count: supplementCount,
    adherence_pct: adherencePct,
    worst_severity,
  };
}

export function normalizeNutritionAudit(auditResponse) {
  const items = Array.isArray(auditResponse?.items) ? auditResponse.items : [];
  const mapped = items.map((it) => {
    const eventType = String(it.event_type || it.kind || 'event');
    const kindMap = {
      recompute: 'recompute',
      diet_log: 'diet-log',
      supplement_add: 'supplement-add',
      review_note: 'annotation',
    };
    const kind = kindMap[eventType] || eventType;
    const actor = it.actor_id || it.actor || '—';
    return {
      id: String(it.id || ''),
      kind,
      actor: typeof actor === 'string' ? actor : String(actor || '—'),
      message: String(it.message || ''),
      created_at: String(it.created_at || ''),
    };
  });
  return { items: mapped, total: auditResponse?.total ?? mapped.length };
}
