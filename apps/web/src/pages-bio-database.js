import { api } from './api.js';
import { currentUser } from './auth.js';
import { emptyState, showToast } from './helpers.js';

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

const MILLIS_PER_DAY = 86400000;
const STALE_LABS_DAYS = 180;
const STALE_SUBSTANCE_DAYS = 180;
const ACTIVE_STATUSES = new Set(['active', 'current']);
const BASELINE_LABS = ['TSH', 'Ferritin', 'Vitamin D'];
const FINDING_SEVERITY_RANK = Object.freeze({ critical: 0, major: 1, monitor: 2, stable: 3 });
const SEDATING_TERMS = ['clonazepam', 'diazepam', 'lorazepam', 'alprazolam', 'temazepam', 'benzodiazepine', 'quetiapine', 'olanzapine'];
const ACTIVATING_TERMS = ['methylphenidate', 'amphetamine', 'lisdexamfetamine', 'modafinil', 'armodafinil', 'bupropion', 'dexmethylphenidate'];
const ELECTROLYTE_TERMS = ['magnesium', 'sodium', 'potassium', 'calcium'];
const THYROID_TERMS = ['tsh', 'free t4', 'free t3', 'thyroid'];
const ANALYTE_UNIT_EXPECTATIONS = Object.freeze({
  tsh: ['miu/l', 'uiu/ml', 'mu/l'],
  ferritin: ['ng/ml', 'ug/l'],
  'vitamin d': ['ng/ml', 'nmol/l'],
  magnesium: ['mg/dl', 'mmol/l'],
  'hs-crp': ['mg/l'],
  crp: ['mg/l'],
  b12: ['pg/ml', 'pmol/l'],
});
const SEVERITY_LABEL = Object.freeze({ critical: 'Critical', major: 'Major', monitor: 'Monitor', stable: 'Stable' });

export function bioResolvePatientId() {
  try {
    return window._selectedPatientId
      || window._profilePatientId
      || sessionStorage.getItem('ds_pat_selected_id')
      || '';
  } catch (_) {
    return window._selectedPatientId || window._profilePatientId || '';
  }
}

export function bioNormalizeArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function _canSeedCatalog() {
  const role = String(currentUser?.role || '').toLowerCase();
  return role === 'admin' || role === 'clinician' || role === 'supervisor';
}

function _contentEl() {
  return document.getElementById('content') || document.getElementById('main-content');
}

function _injectStylesOnce() {
  if (window.__bioDatabaseStylesInjected) return;
  window.__bioDatabaseStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .bio-db-page{max-width:1380px;margin:0 auto;padding:18px 18px 40px}
    .bio-db-stack{display:grid;gap:14px}
    .bio-db-context,.bio-db-card,.bio-db-panel{background:var(--surface-1);border:1px solid var(--border);border-radius:16px}
    .bio-db-context,.bio-db-card{padding:16px 18px}
    .bio-db-panel{padding:16px}
    .bio-db-eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);margin-bottom:8px}
    .bio-db-title{font-size:26px;font-weight:750;color:var(--text);margin:0}
    .bio-db-subtitle{font-size:13px;line-height:1.7;color:var(--text-secondary);margin-top:8px}
    .bio-db-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .bio-db-stat{padding:14px 16px}
    .bio-db-stat-value{font-size:28px;font-weight:800;color:var(--text)}
    .bio-db-stat-label{font-size:12px;color:var(--text-secondary);margin-top:6px}
    .bio-db-layout{display:grid;grid-template-columns:minmax(340px,.96fr) minmax(0,1.04fr);gap:14px;align-items:start}
    .bio-db-data-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .bio-db-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
    .bio-db-panel-title{font-size:17px;font-weight:700;color:var(--text);margin:0}
    .bio-db-panel-note{font-size:12px;color:var(--text-secondary);margin-top:4px;line-height:1.6}
    .bio-db-form{display:grid;gap:10px;margin-bottom:14px}
    .bio-db-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .bio-db-field{display:grid;gap:6px}
    .bio-db-field span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary)}
    .bio-db-input,.bio-db-select,.bio-db-textarea{width:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;color:var(--text);padding:10px 12px;font-size:13px}
    .bio-db-textarea{min-height:78px;resize:vertical}
    .bio-db-list,.bio-db-findings{display:grid;gap:10px}
    .bio-db-row,.bio-db-finding,.bio-db-note-box,.bio-db-trend{padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.02)}
    .bio-db-row-flagged,.bio-db-finding[data-severity="major"]{border-color:rgba(255,181,71,.24);background:rgba(255,181,71,.06)}
    .bio-db-row-critical,.bio-db-finding[data-severity="critical"]{border-color:rgba(255,107,107,.28);background:rgba(255,107,107,.06)}
    .bio-db-finding[data-severity="monitor"]{border-color:rgba(96,165,250,.24);background:rgba(96,165,250,.06)}
    .bio-db-row-head,.bio-db-finding-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
    .bio-db-row-title,.bio-db-finding-title{font-size:14px;font-weight:700;color:var(--text)}
    .bio-db-row-sub,.bio-db-mini,.bio-db-finding-body{font-size:12px;color:var(--text-secondary);line-height:1.6}
    .bio-db-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
    .bio-db-pill{font-size:11px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,0.06);color:var(--text-secondary);border:1px solid rgba(255,255,255,0.08)}
    .bio-db-pill-critical{background:rgba(255,107,107,.12);color:var(--red);border-color:rgba(255,107,107,.24)}
    .bio-db-pill-major{background:rgba(255,181,71,.12);color:var(--amber);border-color:rgba(255,181,71,.24)}
    .bio-db-pill-monitor{background:rgba(96,165,250,.12);color:var(--blue);border-color:rgba(96,165,250,.24)}
    .bio-db-warning{padding:12px 14px;border-radius:12px;border:1px solid rgba(255,181,71,.2);background:rgba(255,181,71,.08);color:var(--amber);font-size:12.5px;line-height:1.6}
    .bio-db-error{padding:12px 14px;border-radius:12px;border:1px solid rgba(255,107,107,.22);background:rgba(255,107,107,.08);color:var(--red);font-size:12.5px;line-height:1.6}
    .bio-db-empty{padding:20px 10px;text-align:center;color:var(--text-tertiary);font-size:12.5px}
    .bio-db-actions{display:flex;gap:8px;flex-wrap:wrap}
    .bio-db-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary)}
    .bio-db-inline-grid,.bio-db-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .bio-db-trend-chart{display:flex;align-items:flex-end;gap:6px;height:52px;margin-top:10px}
    .bio-db-trend-bar{flex:1;min-width:14px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,rgba(96,165,250,.95),rgba(96,165,250,.35))}
    .bio-db-note-stamp{font-size:11px;color:var(--text-tertiary);margin-top:8px}
    .bio-db-finding-foot{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px}
    @media (max-width:1180px){.bio-db-layout,.bio-db-data-grid,.bio-db-summary,.bio-db-form-grid,.bio-db-inline-grid,.bio-db-split{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

const STATE = {
  patientId: '',
  patient: null,
  summary: null,
  catalog: [],
  substances: [],
  labs: [],
  editingLabId: '',
  reviewNotes: { note: '', updatedAt: '' },
  findingAcks: {},
  loadError: '',
  busy: false,
};

let _navigateRef = null;
let _setTopbarRef = null;

function _normalizedText(value) {
  return String(value || '').trim().toLowerCase();
}

function _normalizeUnit(value) {
  return _normalizedText(value).replace(/\s+/g, '');
}

function _dateValue(...values) {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function _daysSince(value) {
  const date = _dateValue(value);
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / MILLIS_PER_DAY);
}

function _extractNumericTokens(text) {
  return String(text || '').match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
}

function _extractLabName(item) {
  return item?.name || item?.test_name || item?.biomarker_name || item?.catalog_name || '';
}

function _extractSubstanceName(item) {
  return item?.name || item?.substance_name || item?.catalog_name || '';
}

function _isActiveSubstance(item) {
  return ACTIVE_STATUSES.has(_normalizedText(item?.status || item?.state));
}

function _matchTerm(value, terms) {
  const text = _normalizedText(value);
  return terms.some((term) => text.includes(term));
}

function _parseReferenceRange(referenceText) {
  const text = String(referenceText || '').trim();
  if (!text) return null;
  const compact = text.replace(/\s+/g, ' ');
  const range = compact.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to|–|—)\s*(-?\d+(?:\.\d+)?)/i);
  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) return { low: Math.min(low, high), high: Math.max(low, high), raw: text };
  }
  const lt = compact.match(/(?:<=?|less than|below)\s*(-?\d+(?:\.\d+)?)/i);
  if (lt) {
    const high = Number(lt[1]);
    if (Number.isFinite(high)) return { low: null, high, raw: text };
  }
  const gt = compact.match(/(?:>=?|greater than|above)\s*(-?\d+(?:\.\d+)?)/i);
  if (gt) {
    const low = Number(gt[1]);
    if (Number.isFinite(low)) return { low, high: null, raw: text };
  }
  const nums = _extractNumericTokens(compact);
  if (nums.length === 2) return { low: Math.min(nums[0], nums[1]), high: Math.max(nums[0], nums[1]), raw: text };
  return null;
}

function _inferLabStatus(item) {
  const explicit = _normalizedText(item?.flag || item?.status || item?.abnormal_flag);
  if (explicit === 'critical') return 'critical';
  if (explicit === 'high' || explicit === 'low' || explicit === 'abnormal' || explicit === 'out_of_range') return explicit;
  const numeric = Number(item?.value_numeric);
  const ref = _parseReferenceRange(item?.reference_range || item?.reference || item?.reference_range_text);
  if (!Number.isFinite(numeric) || !ref) return explicit || 'unknown';
  if (ref.low != null && numeric < ref.low) return 'low';
  if (ref.high != null && numeric > ref.high) return 'high';
  return explicit || 'normal';
}

function _isFlaggedLab(item) {
  const flag = _normalizedText(_inferLabStatus(item));
  return flag === 'abnormal' || flag === 'high' || flag === 'low' || flag === 'critical' || flag === 'out_of_range';
}

function _isCriticalLab(item) {
  return _normalizedText(_inferLabStatus(item)) === 'critical';
}

function _inferLabRangeReason(item, inferredStatus) {
  const numeric = Number(item?.value_numeric);
  const ref = _parseReferenceRange(item?.reference_range || item?.reference || item?.reference_range_text);
  if (!Number.isFinite(numeric) || !ref) return '';
  if (inferredStatus === 'low' && ref.low != null) return `${numeric} below reference low ${ref.low}`;
  if (inferredStatus === 'high' && ref.high != null) return `${numeric} above reference high ${ref.high}`;
  return '';
}

function _checkUnitMismatch(item) {
  const analyte = _normalizedText(_extractLabName(item));
  const unit = _normalizeUnit(item?.unit);
  if (!analyte || !unit) return false;
  const expected = Object.entries(ANALYTE_UNIT_EXPECTATIONS).find(([key]) => analyte.includes(key))?.[1];
  return !!expected && !expected.includes(unit);
}

function _buildThresholdSignal(item) {
  const name = _normalizedText(_extractLabName(item));
  const value = Number(item?.value_numeric);
  if (!Number.isFinite(value)) return null;
  if (name.includes('ferritin') && value < 30) return { id: 'ferritin-low', severity: 'major', title: 'Low ferritin reserve', summary: `Ferritin ${value} suggests low iron reserve that may confound fatigue, cognition, and mood interpretation.` };
  if (name.includes('vitamin d') && value < 20) return { id: 'vitamin-d-deficient', severity: 'major', title: 'Vitamin D deficiency signal', summary: `Vitamin D ${value} is in a deficient range and may confound fatigue, pain, and low mood interpretation.` };
  if (name.includes('vitamin d') && value < 30) return { id: 'vitamin-d-insufficient', severity: 'monitor', title: 'Vitamin D insufficiency signal', summary: `Vitamin D ${value} is below common sufficiency targets.` };
  if ((name.includes('hs-crp') || name === 'crp' || name.includes(' c-reactive protein')) && value > 3) return { id: 'inflammation-elevated', severity: 'major', title: 'Inflammatory biomarker elevation', summary: `CRP marker ${value} suggests elevated inflammatory burden that may complicate symptom attribution.` };
  if ((name.includes('b12') || name.includes('vitamin b12')) && value < 300) return { id: 'b12-low', severity: 'monitor', title: 'Low B12 reserve signal', summary: `B12 ${value} is below a conservative reserve threshold and may confound cognitive or fatigue symptoms.` };
  if (name === 'tsh' && value > 4.5) return { id: 'tsh-high', severity: 'major', title: 'Elevated TSH signal', summary: `TSH ${value} suggests thyroid review is warranted before over-interpreting neuropsychiatric symptoms.` };
  if (name === 'tsh' && value < 0.4) return { id: 'tsh-low', severity: 'monitor', title: 'Low TSH signal', summary: `TSH ${value} is below the common reference floor and may reflect thyroid-related symptom confounding.` };
  return null;
}

function _buildLabInsights(labs) {
  return labs.map((lab) => {
    const inferredStatus = _inferLabStatus(lab);
    return {
      id: _labId(lab) || `${_normalizedText(_extractLabName(lab))}:${lab?.collected_at || ''}`,
      name: _extractLabName(lab),
      inferredStatus,
      rangeReason: _inferLabRangeReason(lab, inferredStatus),
      referenceRange: lab?.reference_range || lab?.reference || lab?.reference_range_text || '',
      sourceLab: lab?.source_lab || '',
      hasReferenceRange: !!_parseReferenceRange(lab?.reference_range || lab?.reference || lab?.reference_range_text),
      unitMismatch: _checkUnitMismatch(lab),
      thresholdSignal: _buildThresholdSignal(lab),
      raw: lab,
    };
  });
}

function _buildRepeatedLabTrends(labs) {
  const byAnalyte = new Map();
  for (const lab of labs) {
    const analyte = _extractLabName(lab);
    const numeric = Number(lab?.value_numeric);
    if (!analyte || !Number.isFinite(numeric)) continue;
    const key = _normalizedText(analyte);
    if (!byAnalyte.has(key)) byAnalyte.set(key, []);
    byAnalyte.get(key).push({
      analyte,
      collectedAt: lab?.collected_at || lab?.updated_at || lab?.created_at || '',
      value: numeric,
      unit: lab?.unit || '',
    });
  }
  return [...byAnalyte.values()].map((samples) => samples.sort((a, b) => (_dateValue(a.collectedAt)?.getTime() || 0) - (_dateValue(b.collectedAt)?.getTime() || 0)))
    .filter((samples) => samples.length > 1)
    .map((samples) => {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const direction = last.value > first.value ? 'up' : last.value < first.value ? 'down' : 'flat';
      const max = Math.max(...samples.map((item) => item.value));
      const min = Math.min(...samples.map((item) => item.value));
      const span = Math.max(max - min, 1);
      const spark = samples.map((item) => Math.max(14, Math.round(((item.value - min) / span) * 38) + 14));
      return { id: `trend:${_normalizedText(last.analyte)}`, analyte: last.analyte, samples, direction, unit: last.unit || first.unit || '', latestValue: last.value, spark };
    })
    .sort((a, b) => String(a.analyte).localeCompare(String(b.analyte)));
}

function _severityPill(severity) {
  const key = String(severity || 'stable').toLowerCase();
  const label = SEVERITY_LABEL[key] || 'Review';
  return `<span class="bio-db-pill bio-db-pill-${key}">${esc(label)}</span>`;
}

function _sortBySeverity(items) {
  return [...items].sort((a, b) => {
    const sevA = FINDING_SEVERITY_RANK[a?.severity] ?? 99;
    const sevB = FINDING_SEVERITY_RANK[b?.severity] ?? 99;
    if (sevA !== sevB) return sevA - sevB;
    const ackA = a?.acknowledged ? 1 : 0;
    const ackB = b?.acknowledged ? 1 : 0;
    if (ackA !== ackB) return ackA - ackB;
    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });
}

function _sortByPriority(items) {
  return [...items].sort((a, b) => {
    const sevA = FINDING_SEVERITY_RANK[a?.priority || a?.severity] ?? 99;
    const sevB = FINDING_SEVERITY_RANK[b?.priority || b?.severity] ?? 99;
    if (sevA !== sevB) return sevA - sevB;
    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });
}

function _noteKey(patientId) {
  return `ds:bio-review-notes:${patientId || ''}`;
}

function _ackKey(patientId) {
  return `ds:bio-finding-acks:${patientId || ''}`;
}

function _readLocalJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function _writeLocalJson(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function _resolveModality(patient) {
  return _normalizedText(patient?.primary_modality || patient?.modality || patient?.recommended_modality);
}

export function buildBioAnalyzerModel({
  patient = null,
  catalog = [],
  substances = [],
  labs = [],
  reviewNotes = { note: '', updatedAt: '' },
  findingAcks = {},
} = {}) {
  const substanceRows = bioNormalizeArray(substances);
  const labRows = bioNormalizeArray(labs);
  const catalogRows = bioNormalizeArray(catalog);
  const activeSubstances = substanceRows.filter(_isActiveSubstance);
  const flaggedLabs = labRows.filter(_isFlaggedLab);
  const criticalLabs = flaggedLabs.filter(_isCriticalLab);
  const modality = _resolveModality(patient);
  const latestLabDate = labRows.map((item) => _dateValue(item?.collected_at, item?.updated_at, item?.created_at)).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
  const latestSubstanceDate = activeSubstances.map((item) => _dateValue(item?.started_at, item?.updated_at, item?.created_at)).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
  const staleLabs = !latestLabDate || _daysSince(latestLabDate) > STALE_LABS_DAYS;
  const staleSubstances = !!activeSubstances.length && (!latestSubstanceDate || _daysSince(latestSubstanceDate) > STALE_SUBSTANCE_DAYS);
  const sedating = activeSubstances.filter((item) => _matchTerm(_extractSubstanceName(item), SEDATING_TERMS));
  const activating = activeSubstances.filter((item) => _matchTerm(_extractSubstanceName(item), ACTIVATING_TERMS));
  const thyroidLabs = flaggedLabs.filter((item) => _matchTerm(_extractLabName(item), THYROID_TERMS));
  const biomarkerConfounderLabs = flaggedLabs.filter((item) => _matchTerm(_extractLabName(item), ['ferritin', 'vitamin d', 'b12', 'hs-crp', 'crp', 'folate']));
  const electrolyteLabs = flaggedLabs.filter((item) => _matchTerm(_extractLabName(item), ELECTROLYTE_TERMS));
  const repeatedLabTrends = _buildRepeatedLabTrends(labRows);
  const labInsights = _buildLabInsights(labRows);
  const thresholdSignals = labInsights.map((item) => item.thresholdSignal).filter(Boolean);
  const unitMismatchLabs = labInsights.filter((item) => item.unitMismatch);
  const missingReferenceRangeLabs = labInsights.filter((item) => _isFlaggedLab(item.raw) && !item.hasReferenceRange);
  const referenceInterpretedLabs = labInsights.filter((item) => item.rangeReason);
  const catalogLabNames = new Set(catalogRows.map((item) => _normalizedText(item?.name || item?.label || item?.title)).filter(Boolean));
  const observedLabNames = new Set(labRows.map((item) => _normalizedText(_extractLabName(item))).filter(Boolean));
  const baselineGaps = BASELINE_LABS.filter((name) => !observedLabNames.has(_normalizedText(name))).filter((name) => !catalogLabNames.size || catalogLabNames.has(_normalizedText(name)));

  const findings = [];
  const protocolCautions = [];
  const actionPlan = [];

  if (criticalLabs.length) {
    findings.push({ id: 'critical-labs', severity: 'critical', title: 'Critical lab flags need clinician confirmation', summary: `${criticalLabs.length} lab result${criticalLabs.length === 1 ? '' : 's'} marked critical. Verify source report, unit, and timing before protocol decisions.`, route: 'labs-analyzer' });
    actionPlan.push({ id: 'plan-confirm-critical-labs', priority: 'critical', title: 'Confirm critical lab data before protocol work', summary: 'Validate the original report, units, and collection date before using this page to support treatment planning.', route: 'labs-analyzer' });
  }
  if (flaggedLabs.length && thyroidLabs.length) findings.push({ id: 'thyroid-review', severity: 'major', title: 'Thyroid signal may confound response interpretation', summary: 'Abnormal thyroid-related labs can overlap with fatigue, anxiety, cognitive slowing, and treatment response noise.', route: 'labs-analyzer' });
  if (referenceInterpretedLabs.length) findings.push({ id: 'reference-range-review', severity: 'monitor', title: 'Numeric lab values exceeded stated reference ranges', summary: `${referenceInterpretedLabs.length} lab result${referenceInterpretedLabs.length === 1 ? '' : 's'} can be interpreted directly from the supplied numeric value and reference range.`, route: 'labs-analyzer' });
  if (unitMismatchLabs.length) {
    findings.push({ id: 'unit-mismatch-review', severity: 'major', title: 'Lab unit format needs confirmation', summary: `${unitMismatchLabs.length} lab result${unitMismatchLabs.length === 1 ? '' : 's'} use unit strings that do not match the expected analyte pattern, so source verification is needed.`, route: 'labs-analyzer' });
    protocolCautions.push({ id: 'lab-unit-caution', severity: 'major', title: 'Lab unit mismatch requires source verification', summary: 'One or more analytes use an unexpected unit string for that marker, so interpretation should be verified against the original report.', route: 'labs-analyzer' });
    actionPlan.push({ id: 'plan-verify-lab-units', priority: 'major', title: 'Verify lab units against the original source', summary: 'Resolve unexpected unit formats before treating numeric lab interpretation as reliable.', route: 'labs-analyzer' });
  }
  if (missingReferenceRangeLabs.length) {
    findings.push({ id: 'missing-reference-range', severity: 'monitor', title: 'Flagged labs are missing reference range detail', summary: 'Some abnormal labs were saved without a parseable reference range, limiting source-aware interpretation.', route: 'labs-analyzer' });
    protocolCautions.push({ id: 'missing-reference-caution', severity: 'monitor', title: 'Reference-range context is incomplete', summary: 'At least one flagged lab lacks a parseable reference range, which lowers confidence in the interpretation layer.', route: 'labs-analyzer' });
    actionPlan.push({ id: 'plan-add-reference-ranges', priority: 'monitor', title: 'Add missing reference ranges for flagged labs', summary: 'Reference ranges improve source-aware interpretation and reduce reliance on manual flag labels alone.', route: 'labs-analyzer' });
  }
  if (staleLabs) findings.push({ id: 'stale-labs', severity: 'major', title: 'Lab review is stale or missing', summary: 'No recent labs were found inside the last 180 days. Baseline medical context may be incomplete.', route: 'labs-analyzer' });
  if (staleSubstances) findings.push({ id: 'stale-substances', severity: 'major', title: 'Medication and supplement reconciliation is stale', summary: 'Active substance entries have not been refreshed recently. Reconcile before relying on analyzer conclusions.', route: 'patient-profile' });
  if (sedating.length) findings.push({ id: 'sedating-exposure', severity: 'monitor', title: 'Sedating exposure present', summary: `${sedating.length} active sedating agent${sedating.length === 1 ? '' : 's'} may affect fatigue, cognition, engagement, or threshold-sensitive planning.`, route: 'protocol-studio' });
  if (activating.length) findings.push({ id: 'activating-exposure', severity: 'monitor', title: 'Activating exposure present', summary: `${activating.length} active activating agent${activating.length === 1 ? '' : 's'} may affect anxiety, sleep, arousal, or symptom interpretation.`, route: 'nutrition-analyzer' });
  if (baselineGaps.length) findings.push({ id: 'baseline-gaps', severity: 'monitor', title: 'Baseline biomarker gaps detected', summary: `Missing common baseline checks: ${baselineGaps.join(', ')}.`, route: 'biomarkers' });
  if (repeatedLabTrends.length) findings.push({ id: 'lab-trends', severity: 'stable', title: 'Repeated analytes available for trend review', summary: `${repeatedLabTrends.length} analyte trend${repeatedLabTrends.length === 1 ? '' : 's'} can be reviewed inline before protocol changes.`, route: 'labs-analyzer' });

  for (const signal of thresholdSignals) {
    findings.push({ id: `threshold-${signal.id}`, severity: signal.severity, title: signal.title, summary: signal.summary, route: 'labs-analyzer' });
  }

  if (sedating.length) protocolCautions.push({ id: 'benzo-caution', severity: 'major', title: 'Sedating / benzodiazepine exposure', summary: 'Sedating agents can change alertness, symptom report, and some threshold-sensitive clinical interpretations.', route: 'protocol-studio' });
  if (activating.length) protocolCautions.push({ id: 'stimulant-caution', severity: 'monitor', title: 'Stimulant / activating exposure', summary: 'Activating agents can shift arousal, sleep, and session-day tolerance, so protocol review should consider recent use.', route: 'protocol-studio' });
  if (thyroidLabs.length) protocolCautions.push({ id: 'thyroid-caution', severity: 'major', title: 'Thyroid-related abnormality', summary: 'Thyroid abnormalities can mimic or amplify neuropsychiatric symptoms and complicate treatment response interpretation.', route: 'labs-analyzer' });
  if (biomarkerConfounderLabs.length) protocolCautions.push({ id: 'biomarker-caution', severity: 'major', title: 'Biomarker confounders present', summary: 'Iron, vitamin, or inflammatory abnormalities may reduce confidence in symptom attribution and should be reconciled.', route: 'biomarkers' });
  if (baselineGaps.length) protocolCautions.push({ id: 'missing-baseline-caution', severity: 'monitor', title: 'Missing baseline checks', summary: `Common baseline labs are absent: ${baselineGaps.join(', ')}.`, route: 'biomarkers' });
  if (thresholdSignals.some((item) => item.id === 'ferritin-low')) protocolCautions.push({ id: 'ferritin-caution', severity: 'major', title: 'Low ferritin may confound fatigue and cognition', summary: 'Iron reserve issues can complicate symptom attribution and treatment-response interpretation.', route: 'labs-analyzer' });
  if (thresholdSignals.some((item) => item.id === 'vitamin-d-deficient' || item.id === 'vitamin-d-insufficient')) protocolCautions.push({ id: 'vitamin-d-caution', severity: 'monitor', title: 'Vitamin D status may confound baseline symptoms', summary: 'Vitamin D insufficiency can overlap with fatigue, pain, and low-mood complaints.', route: 'labs-analyzer' });
  if (thresholdSignals.some((item) => item.id === 'inflammation-elevated')) protocolCautions.push({ id: 'inflammation-caution', severity: 'major', title: 'Inflammatory burden should be reviewed', summary: 'Elevated CRP can complicate symptom attribution and may signal broader medical confounding.', route: 'labs-analyzer' });
  if (thresholdSignals.some((item) => item.id === 'b12-low')) protocolCautions.push({ id: 'b12-caution', severity: 'monitor', title: 'Low B12 reserve should be reviewed', summary: 'B12 reserve issues may overlap with fatigue, cognitive slowing, or paresthesia-like complaints.', route: 'labs-analyzer' });

  if (staleLabs || baselineGaps.length) actionPlan.push({ id: 'plan-refresh-baseline-labs', priority: staleLabs ? 'major' : 'monitor', title: 'Refresh baseline medical context', summary: baselineGaps.length ? `Update missing baseline checks first: ${baselineGaps.join(', ')}.` : 'Obtain newer labs so the review is not built on stale biomarker context.', route: 'biomarkers' });
  if (staleSubstances) actionPlan.push({ id: 'plan-reconcile-substances', priority: 'major', title: 'Reconcile active medications and supplements', summary: 'Refresh the current substance list before making inferences from fatigue, sleep, activation, or cognitive symptoms.', route: 'patient-profile' });
  if (thyroidLabs.length || biomarkerConfounderLabs.length || electrolyteLabs.length || thresholdSignals.length) actionPlan.push({ id: 'plan-review-medical-confounders', priority: 'major', title: 'Review medical confounders with labs context', summary: 'Use the labs workspace to interpret thyroid, nutritional, inflammatory, or electrolyte confounders before protocol adjustment.', route: 'labs-analyzer' });
  if (sedating.length || activating.length) actionPlan.push({ id: 'plan-check-substance-confounders', priority: 'monitor', title: 'Review medication burden against symptoms and protocol', summary: 'Cross-check active sedating and activating agents against tolerability, attendance, energy, arousal, and symptom variability.', route: 'protocol-studio' });
  if (repeatedLabTrends.length) actionPlan.push({ id: 'plan-use-trends', priority: 'monitor', title: 'Use repeated analyte trends before escalating interpretation', summary: 'Repeated numeric labs are available; review directionality before treating a single sample as decisive.', route: 'labs-analyzer' });
  if (modality === 'tms' || modality === 'rtms' || modality === 'tdcs' || modality === 'neurofeedback') actionPlan.push({ id: `plan-modality-${modality || 'review'}`, priority: 'monitor', title: 'Re-check modality-specific cautions', summary: `Review the ${modality === 'tdcs' ? 'tDCS' : modality === 'neurofeedback' ? 'neurofeedback' : 'rTMS'} caution set before changing protocol assumptions.`, route: 'protocol-studio' });

  if (modality === 'tms' || modality === 'rtms') {
    if (sedating.length) protocolCautions.push({ id: 'tms-benzo-caution', severity: 'major', title: 'rTMS review: sedating exposure', summary: 'Sedating medication burden should be reviewed alongside rTMS tolerability, attendance quality, and session-day sedation.', route: 'protocol-studio' });
    if (thyroidLabs.length || biomarkerConfounderLabs.length || baselineGaps.length || thresholdSignals.length) protocolCautions.push({ id: 'tms-biomarker-caution', severity: 'major', title: 'rTMS review: medical confounders', summary: 'Medical confounders and missing baseline biomarkers should be reconciled before over-interpreting rTMS response.', route: 'labs-analyzer' });
  }
  if (modality === 'tdcs') {
    if (electrolyteLabs.length) protocolCautions.push({ id: 'tdcs-electrolyte-caution', severity: 'major', title: 'tDCS review: electrolyte abnormality', summary: 'Electrolyte abnormalities warrant review before leaning on tolerability or cognitive response conclusions.', route: 'labs-analyzer' });
    if (activating.length) protocolCautions.push({ id: 'tdcs-stimulant-caution', severity: 'monitor', title: 'tDCS review: stimulant exposure', summary: 'Recent stimulant burden can shift arousal and perceived cognitive effects during tDCS workflows.', route: 'protocol-studio' });
  }
  if (modality === 'neurofeedback') {
    if (sedating.length) protocolCautions.push({ id: 'nf-sedation-caution', severity: 'major', title: 'Neurofeedback review: sedation may blunt engagement', summary: 'Sedating agents may affect attention, learning, and training-session participation quality.', route: 'protocol-studio' });
    if (staleLabs) protocolCautions.push({ id: 'nf-stale-labs-caution', severity: 'monitor', title: 'Neurofeedback review: stale medical context', summary: 'No recent labs were found. Updated medical context may help explain energy, attention, or symptom variability.', route: 'labs-analyzer' });
  }

  const findingsWithAcks = findings.map((item) => {
    const ack = findingAcks?.[item.id] || {};
    return { ...item, acknowledged: !!ack.acknowledged, acknowledgedAt: ack.acknowledgedAt || '' };
  });
  const unacknowledgedFindings = findingsWithAcks.filter((item) => !item.acknowledged);
  const reviewSummary = {
    totalFindings: findingsWithAcks.length,
    acknowledgedFindings: findingsWithAcks.length - unacknowledgedFindings.length,
    unacknowledgedFindings: unacknowledgedFindings.length,
    criticalFindings: findingsWithAcks.filter((item) => item.severity === 'critical').length,
    majorFindings: findingsWithAcks.filter((item) => item.severity === 'major').length,
    protocolCautions: protocolCautions.length,
  };

  return {
    modality,
    staleLabs,
    staleSubstances,
    exposures: { sedating: sedating.length, activating: activating.length },
    counts: { substances: substanceRows.length, activeSubstances: activeSubstances.length, labs: labRows.length, abnormalLabs: flaggedLabs.length },
    findings: _sortBySeverity(findingsWithAcks),
    protocolCautions: _sortBySeverity(protocolCautions),
    actionPlan: _sortByPriority(actionPlan),
    reviewSummary,
    repeatedLabTrends,
    labInsights,
    thresholdSignals,
    baselineGaps,
    reviewNotes: { note: reviewNotes?.note || '', updatedAt: reviewNotes?.updatedAt || '' },
  };
}

function _patientLabel() {
  const patient = STATE.patient || {};
  const summaryPatient = STATE.summary?.patient || {};
  return patient.display_name || patient.name || summaryPatient.display_name || summaryPatient.name || STATE.patientId || 'Selected patient';
}

function _patientSubtitle() {
  const patient = STATE.patient || {};
  const summaryPatient = STATE.summary?.patient || {};
  return [patient.mrn || summaryPatient.mrn, patient.email || summaryPatient.email, patient.primary_condition || summaryPatient.primary_condition, patient.primary_modality || summaryPatient.primary_modality].filter(Boolean).join(' · ');
}

function _catalogSummary() {
  const items = bioNormalizeArray(STATE.catalog);
  return {
    total: items.length,
    substances: items.filter((item) => _matchTerm(item?.item_type || item?.type || item?.category, ['med', 'supp', 'vit', 'substance'])),
    labs: items.filter((item) => _matchTerm(item?.item_type || item?.type || item?.category, ['lab', 'bio'])),
  };
}

function _counts() {
  const summary = STATE.summary || {};
  const model = buildBioAnalyzerModel({ patient: STATE.patient, catalog: STATE.catalog, substances: STATE.substances, labs: STATE.labs, reviewNotes: STATE.reviewNotes, findingAcks: STATE.findingAcks });
  return {
    substances: Number(summary.substance_count ?? summary.substances_count ?? model.counts.substances),
    activeSubstances: Number(summary.active_substance_count ?? model.counts.activeSubstances),
    labs: Number(summary.lab_count ?? summary.labs_count ?? model.counts.labs),
    abnormalLabs: Number(summary.abnormal_lab_count ?? model.counts.abnormalLabs),
  };
}

function _catalogOptions(items) {
  return items.map((item) => {
    const id = item?.id || item?.catalog_item_id || item?.slug || item?.name;
    const label = item?.name || item?.label || item?.title || id;
    return `<option value="${esc(id)}">${esc(label)}</option>`;
  }).join('');
}

function _renderRowMeta(bits) {
  const clean = bits.filter(Boolean);
  return clean.length ? `<div class="bio-db-meta">${clean.map((bit) => `<span class="bio-db-pill">${esc(bit)}</span>`).join('')}</div>` : '';
}

function _substanceId(item) {
  return item?.id || item?.substance_id || item?.patient_substance_id || '';
}

function _labId(item) {
  return item?.id || item?.lab_id || item?.patient_lab_result_id || '';
}

function _findLabById(id) {
  return bioNormalizeArray(STATE.labs).find((item) => String(_labId(item)) === String(id)) || null;
}

function _sortSubstances(rows) {
  return [...rows].sort((a, b) => {
    const activeA = _isActiveSubstance(a) ? 0 : 1;
    const activeB = _isActiveSubstance(b) ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    return (_dateValue(b?.started_at, b?.updated_at, b?.created_at)?.getTime() || 0) - (_dateValue(a?.started_at, a?.updated_at, a?.created_at)?.getTime() || 0);
  });
}

function _sortLabs(rows) {
  return [...rows].sort((a, b) => {
    const criticalA = _isCriticalLab(a) ? 0 : 1;
    const criticalB = _isCriticalLab(b) ? 0 : 1;
    if (criticalA !== criticalB) return criticalA - criticalB;
    const flaggedA = _isFlaggedLab(a) ? 0 : 1;
    const flaggedB = _isFlaggedLab(b) ? 0 : 1;
    if (flaggedA !== flaggedB) return flaggedA - flaggedB;
    return (_dateValue(b?.collected_at, b?.updated_at, b?.created_at)?.getTime() || 0) - (_dateValue(a?.collected_at, a?.updated_at, a?.created_at)?.getTime() || 0);
  });
}

function _renderFindingCard(item) {
  return `<div class="bio-db-finding" data-severity="${esc(item.severity)}">
    <div class="bio-db-finding-head">
      <div><div class="bio-db-finding-title">${esc(item.title)}</div><div class="bio-db-finding-body">${esc(item.summary)}</div></div>
      <div>${_severityPill(item.severity)}</div>
    </div>
    <div class="bio-db-finding-foot">
      <div class="bio-db-mini">${item.acknowledged ? `Acknowledged ${esc(String(item.acknowledgedAt).slice(0, 10) || 'recently')}` : 'Not acknowledged'}</div>
      <div class="bio-db-actions">${item.route ? `<button class="btn btn-ghost btn-sm" onclick="window._bioNavigateTo('${esc(item.route)}')">Open</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="window._bioToggleFindingAck('${esc(item.id)}')">${item.acknowledged ? 'Unacknowledge' : 'Acknowledge'}</button></div>
    </div>
  </div>`;
}

function _renderActionCard(item) {
  return `<div class="bio-db-finding" data-severity="${esc(item.priority)}">
    <div class="bio-db-finding-head">
      <div><div class="bio-db-finding-title">${esc(item.title)}</div><div class="bio-db-finding-body">${esc(item.summary)}</div></div>
      <div>${_severityPill(item.priority)}</div>
    </div>
    <div class="bio-db-finding-foot"><div class="bio-db-mini">Recommended next step</div><div class="bio-db-actions">${item.route ? `<button class="btn btn-ghost btn-sm" onclick="window._bioNavigateTo('${esc(item.route)}')">Open</button>` : ''}</div></div>
  </div>`;
}

function _renderCautionCard(item) {
  return `<div class="bio-db-row bio-db-row-flagged"><div class="bio-db-row-head"><div><div class="bio-db-row-title">${esc(item.title)}</div><div class="bio-db-row-sub">${esc(item.summary)}</div></div><div>${_severityPill(item.severity)}</div></div>${item.route ? `<div class="bio-db-actions" style="margin-top:10px"><button class="btn btn-ghost btn-sm" onclick="window._bioNavigateTo('${esc(item.route)}')">Open related workspace</button></div>` : ''}</div>`;
}

function _renderTrendCard(item) {
  const points = item.samples.map((sample) => `${String(sample.collectedAt || 'undated').slice(0, 10)}: ${sample.value}${sample.unit ? ` ${sample.unit}` : ''}`).join(' · ');
  return `<div class="bio-db-trend"><div class="bio-db-row-head"><div><div class="bio-db-row-title">${esc(item.analyte)}</div><div class="bio-db-row-sub">${esc(item.direction === 'up' ? 'Trending up' : item.direction === 'down' ? 'Trending down' : 'Stable trend')} · ${esc(String(item.latestValue))}${item.unit ? ` ${esc(item.unit)}` : ''}</div></div><div>${_severityPill(item.direction === 'flat' ? 'stable' : 'monitor')}</div></div><div class="bio-db-trend-chart">${item.spark.map((height) => `<div class="bio-db-trend-bar" style="height:${height}px"></div>`).join('')}</div><div class="bio-db-note-stamp">${esc(points)}</div></div>`;
}

function _renderLabInsightCard(item) {
  const meta = [item.inferredStatus && item.inferredStatus !== 'unknown' ? `Status ${item.inferredStatus}` : '', item.referenceRange ? `Range ${item.referenceRange}` : '', item.sourceLab ? `Source ${item.sourceLab}` : '', item.unitMismatch ? 'Unit mismatch' : '', item.thresholdSignal?.title || ''].filter(Boolean);
  return `<div class="bio-db-row ${item.inferredStatus === 'critical' ? 'bio-db-row-critical' : item.inferredStatus === 'high' || item.inferredStatus === 'low' ? 'bio-db-row-flagged' : ''}"><div class="bio-db-row-head"><div><div class="bio-db-row-title">${esc(item.name || 'Lab insight')}</div><div class="bio-db-row-sub">${esc(item.rangeReason || item.thresholdSignal?.summary || 'No numeric exception detected')}</div></div><div>${_severityPill(item.unitMismatch ? 'major' : item.thresholdSignal?.severity || (item.inferredStatus === 'high' || item.inferredStatus === 'low' ? 'monitor' : 'stable'))}</div></div>${_renderRowMeta(meta)}</div>`;
}

function _renderAnalyzerPanel(model) {
  const modalityLabel = model.modality ? model.modality.toUpperCase() : 'Not set';
  return `<section class="bio-db-panel">
    <div class="bio-db-panel-head">
      <div><div class="bio-db-eyebrow">Analyzer review</div><h2 class="bio-db-panel-title">Clinician review surface</h2><div class="bio-db-panel-note">This layer interprets recency, medication burden, reference ranges, analyte thresholds, repeated analytes, and modality-specific cautions on top of the raw bio database.</div></div>
      <div><div class="bio-db-kicker">Primary modality</div><div class="bio-db-mini">${esc(modalityLabel)}</div></div>
    </div>
    <div class="bio-db-inline-grid" style="margin-bottom:12px">
      <div class="bio-db-note-box"><div class="bio-db-kicker">Exposure summary</div><div class="bio-db-mini">Sedating agents: ${esc(model.exposures.sedating)} · Activating agents: ${esc(model.exposures.activating)}</div><div class="bio-db-note-stamp">${model.staleSubstances ? 'Medication reconciliation appears stale.' : 'Medication reconciliation is present.'}</div></div>
      <div class="bio-db-note-box"><div class="bio-db-kicker">Baseline context</div><div class="bio-db-mini">${model.baselineGaps.length ? `Missing: ${esc(model.baselineGaps.join(', '))}` : 'No baseline gaps detected from common reference checks.'}</div><div class="bio-db-note-stamp">${model.staleLabs ? 'Recent lab context is missing or stale.' : 'Recent lab context is available.'}</div></div>
    </div>
    <div class="bio-db-inline-grid" style="margin-bottom:12px">
      <div class="bio-db-note-box"><div class="bio-db-kicker">Review coverage</div><div class="bio-db-mini">${esc(model.reviewSummary.acknowledgedFindings)} acknowledged · ${esc(model.reviewSummary.unacknowledgedFindings)} still open</div><div class="bio-db-note-stamp">${esc(model.reviewSummary.criticalFindings)} critical · ${esc(model.reviewSummary.majorFindings)} major · ${esc(model.reviewSummary.protocolCautions)} protocol cautions</div></div>
      <div class="bio-db-note-box"><div class="bio-db-kicker">Threshold signals</div><div class="bio-db-mini">${model.thresholdSignals.length ? `${esc(model.thresholdSignals.length)} analyte-specific threshold signal${model.thresholdSignals.length === 1 ? '' : 's'} detected.` : 'No analyte-specific threshold signals detected.'}</div><div class="bio-db-note-stamp">${model.thresholdSignals[0] ? esc(model.thresholdSignals[0].title) : 'Range parsing still applies even without threshold hits.'}</div></div>
    </div>
    <div class="bio-db-split">
      <div class="bio-db-stack"><div class="bio-db-kicker">Priority review queue</div><div class="bio-db-findings">${model.findings.length ? model.findings.map(_renderFindingCard).join('') : '<div class="bio-db-empty">No priority findings generated from the current data.</div>'}</div></div>
      <div class="bio-db-stack"><div class="bio-db-kicker">Protocol cautions</div><div class="bio-db-findings">${model.protocolCautions.length ? model.protocolCautions.map(_renderCautionCard).join('') : '<div class="bio-db-empty">No explicit protocol cautions were generated.</div>'}</div></div>
    </div>
    <div class="bio-db-split" style="margin-top:14px">
      <div class="bio-db-stack"><div class="bio-db-kicker">Repeated lab trends</div><div class="bio-db-findings">${model.repeatedLabTrends.length ? model.repeatedLabTrends.map(_renderTrendCard).join('') : '<div class="bio-db-empty">No repeated analytes with numeric values are available yet.</div>'}</div></div>
      <div class="bio-db-stack"><div class="bio-db-kicker">Suggested next steps</div><div class="bio-db-findings">${model.actionPlan.length ? model.actionPlan.map(_renderActionCard).join('') : '<div class="bio-db-empty">No sequenced review steps generated yet.</div>'}</div></div>
    </div>
    <div class="bio-db-split" style="margin-top:14px">
      <div class="bio-db-stack"><div class="bio-db-kicker">Source-aware lab interpretation</div><div class="bio-db-findings">${model.labInsights.length ? model.labInsights.map(_renderLabInsightCard).join('') : '<div class="bio-db-empty">No lab interpretation details are available yet.</div>'}</div></div>
      <div class="bio-db-stack"><div class="bio-db-kicker">Clinician notes</div><div class="bio-db-note-box"><form class="bio-db-form" onsubmit="window._bioSaveReviewNotes(event)"><label class="bio-db-field"><span>Review note</span><textarea id="bio-review-notes" class="bio-db-textarea" placeholder="Capture confounders, next checks, follow-up timing, or rationale for protocol caution.">${esc(model.reviewNotes.note || '')}</textarea></label><div class="bio-db-actions"><button class="btn btn-primary btn-sm" type="submit">Save note</button><button class="btn btn-ghost btn-sm" type="button" onclick="window._bioClearReviewNotes()">Clear</button></div></form><div class="bio-db-note-stamp">${model.reviewNotes.updatedAt ? `Last updated ${esc(String(model.reviewNotes.updatedAt).slice(0, 10))}` : 'No saved review note yet.'}</div></div></div>
    </div>
  </section>`;
}

function _renderSubstancesPanel() {
  const catalog = _catalogSummary().substances;
  const rows = _sortSubstances(bioNormalizeArray(STATE.substances));
  return `<section class="bio-db-panel">
    <div class="bio-db-panel-head"><div><h2 class="bio-db-panel-title">Substances</h2><div class="bio-db-panel-note">Medications, supplements, vitamins, and other tracked substances relevant to neuromodulation review.</div></div><div class="bio-db-actions">${_canSeedCatalog() ? `<button class="btn btn-ghost btn-sm" onclick="window._bioSeedCatalog()" ${STATE.busy ? 'disabled' : ''}>Seed catalog</button>` : ''}</div></div>
    <form class="bio-db-form" onsubmit="window._bioSubmitSubstance(event)">
      <div class="bio-db-form-grid">
        <label class="bio-db-field"><span>Catalog match</span><select id="bio-substance-catalog" class="bio-db-select"><option value="">Optional catalog item</option>${_catalogOptions(catalog)}</select></label>
        <label class="bio-db-field"><span>Type</span><select id="bio-substance-kind" class="bio-db-select"><option value="medication">Medication</option><option value="supplement">Supplement</option><option value="vitamin">Vitamin</option><option value="other">Other</option></select></label>
        <label class="bio-db-field"><span>Name</span><input id="bio-substance-name" class="bio-db-input" placeholder="Sertraline, magnesium glycinate, vitamin D3" required></label>
        <label class="bio-db-field"><span>Status</span><select id="bio-substance-status" class="bio-db-select"><option value="active">Active</option><option value="paused">Paused</option><option value="stopped">Stopped</option></select></label>
        <label class="bio-db-field"><span>Dose</span><input id="bio-substance-dose" class="bio-db-input" placeholder="50 mg daily"></label>
        <label class="bio-db-field"><span>Started at</span><input id="bio-substance-started-at" class="bio-db-input" type="date"></label>
      </div>
      <label class="bio-db-field"><span>Notes</span><textarea id="bio-substance-notes" class="bio-db-textarea" placeholder="Reason, response, adherence issues, seizure-threshold relevance"></textarea></label>
      <div class="bio-db-actions"><button class="btn btn-primary btn-sm" type="submit" ${STATE.busy ? 'disabled' : ''}>Add substance</button></div>
    </form>
    <div class="bio-db-list">
      ${rows.length ? rows.map((item) => {
        const id = _substanceId(item);
        const title = _extractSubstanceName(item) || 'Untitled substance';
        const subtitle = [item?.kind || item?.type || item?.category, item?.status || item?.state].filter(Boolean).join(' · ');
        const classes = ['bio-db-row'];
        if (_matchTerm(title, SEDATING_TERMS) || _matchTerm(title, ACTIVATING_TERMS)) classes.push('bio-db-row-flagged');
        return `<div class="${classes.join(' ')}"><div class="bio-db-row-head"><div><div class="bio-db-row-title">${esc(title)}</div><div class="bio-db-row-sub">${esc(subtitle || 'Patient substance')}</div></div><button class="btn btn-ghost btn-sm" onclick="window._bioDeleteSubstance('${esc(id)}')" ${STATE.busy || !id ? 'disabled' : ''}>Delete</button></div>${_renderRowMeta([item?.dose, item?.started_at ? `Started ${String(item.started_at).slice(0, 10)}` : '', item?.catalog_item_id ? `Catalog ${item.catalog_item_id}` : '', _matchTerm(title, SEDATING_TERMS) ? 'Sedating exposure' : '', _matchTerm(title, ACTIVATING_TERMS) ? 'Activating exposure' : ''])}${item?.notes ? `<div class="bio-db-panel-note" style="margin-top:10px">${esc(item.notes)}</div>` : ''}</div>`;
      }).join('') : '<div class="bio-db-empty">No substances recorded for this patient yet.</div>'}
    </div>
  </section>`;
}

function _renderLabsPanel() {
  const catalog = _catalogSummary().labs;
  const rows = _sortLabs(bioNormalizeArray(STATE.labs));
  const editingLab = STATE.editingLabId ? _findLabById(STATE.editingLabId) : null;
  return `<section class="bio-db-panel">
    <div class="bio-db-panel-head"><div><h2 class="bio-db-panel-title">Lab results</h2><div class="bio-db-panel-note">Track blood tests and biomarker results that may influence protocol planning, safety, or response interpretation.</div></div><div class="bio-db-actions">${_canSeedCatalog() ? `<button class="btn btn-ghost btn-sm" onclick="window._bioSeedCatalog()" ${STATE.busy ? 'disabled' : ''}>Seed catalog</button>` : ''}</div></div>
    <form class="bio-db-form" onsubmit="window._bioSubmitLab(event)">
      ${editingLab ? `<div class="bio-db-warning">Editing existing lab entry. Save to update, or cancel to return to add mode.</div>` : ''}
      <div class="bio-db-form-grid">
        <label class="bio-db-field"><span>Catalog match</span><select id="bio-lab-catalog" class="bio-db-select"><option value="">Optional catalog item</option>${_catalogOptions(catalog)}</select></label>
        <label class="bio-db-field"><span>Flag</span><select id="bio-lab-flag" class="bio-db-select"><option value="normal"${_normalizedText(editingLab?.flag || editingLab?.status || editingLab?.abnormal_flag) === 'normal' ? ' selected' : ''}>Normal</option><option value="abnormal"${_normalizedText(editingLab?.flag || editingLab?.status || editingLab?.abnormal_flag) === 'abnormal' ? ' selected' : ''}>Abnormal</option><option value="critical"${_normalizedText(editingLab?.flag || editingLab?.status || editingLab?.abnormal_flag) === 'critical' ? ' selected' : ''}>Critical</option><option value="unknown"${!editingLab || _normalizedText(editingLab?.flag || editingLab?.status || editingLab?.abnormal_flag) === 'unknown' ? ' selected' : ''}>Unknown</option></select></label>
        <label class="bio-db-field"><span>Test name</span><input id="bio-lab-name" class="bio-db-input" placeholder="Ferritin, vitamin D, TSH, hs-CRP" required value="${esc(editingLab?.name || editingLab?.test_name || editingLab?.biomarker_name || '')}"></label>
        <label class="bio-db-field"><span>Collected at</span><input id="bio-lab-collected-at" class="bio-db-input" type="date" value="${esc(String(editingLab?.collected_at || '').slice(0, 10))}"></label>
        <label class="bio-db-field"><span>Value</span><input id="bio-lab-value" class="bio-db-input" placeholder="32" value="${esc(editingLab?.value_numeric ?? editingLab?.value_text ?? editingLab?.value ?? '')}"></label>
        <label class="bio-db-field"><span>Unit</span><input id="bio-lab-unit" class="bio-db-input" placeholder="ng/mL" value="${esc(editingLab?.unit || '')}"></label>
        <label class="bio-db-field"><span>Reference range</span><input id="bio-lab-reference-range" class="bio-db-input" placeholder="0.4 - 4.5" value="${esc(editingLab?.reference_range || editingLab?.reference || editingLab?.reference_range_text || '')}"></label>
        <label class="bio-db-field"><span>Source lab</span><input id="bio-lab-source-lab" class="bio-db-input" placeholder="Quest, LabCorp, hospital lab" value="${esc(editingLab?.source_lab || '')}"></label>
      </div>
      <label class="bio-db-field"><span>Notes</span><textarea id="bio-lab-notes" class="bio-db-textarea" placeholder="Fasting status, interpretation note, specimen context, or follow-up instruction">${esc(editingLab?.notes || '')}</textarea></label>
      <div class="bio-db-actions"><button class="btn btn-primary btn-sm" type="submit" ${STATE.busy ? 'disabled' : ''}>${editingLab ? 'Save lab changes' : 'Add lab result'}</button>${editingLab ? `<button class="btn btn-ghost btn-sm" type="button" onclick="window._bioCancelLabEdit()" ${STATE.busy ? 'disabled' : ''}>Cancel</button>` : ''}</div>
    </form>
    <div class="bio-db-list">
      ${rows.length ? rows.map((item) => {
        const id = _labId(item);
        const title = _extractLabName(item) || 'Untitled lab';
        const inferredStatus = _inferLabStatus(item);
        const rangeReason = _inferLabRangeReason(item, inferredStatus);
        const classes = ['bio-db-row'];
        if (_isCriticalLab(item)) classes.push('bio-db-row-critical');
        else if (_isFlaggedLab(item)) classes.push('bio-db-row-flagged');
        return `<div class="${classes.join(' ')}"><div class="bio-db-row-head"><div><div class="bio-db-row-title">${esc(title)}</div><div class="bio-db-row-sub">${esc([inferredStatus === 'unknown' ? (item?.flag || item?.status || item?.abnormal_flag) : inferredStatus, item?.collected_at ? String(item.collected_at).slice(0, 10) : ''].filter(Boolean).join(' · ') || 'Patient lab result')}</div></div><div class="bio-db-actions"><button class="btn btn-ghost btn-sm" onclick="window._bioStartLabEdit('${esc(id)}')" ${STATE.busy || !id ? 'disabled' : ''}>Edit</button><button class="btn btn-ghost btn-sm" onclick="window._bioDeleteLab('${esc(id)}')" ${STATE.busy || !id ? 'disabled' : ''}>Delete</button></div></div>${_renderRowMeta([[item?.value_numeric ?? item?.value_text ?? item?.value, item?.unit].filter(Boolean).join(' '), item?.reference_range || item?.reference || item?.reference_range_text || '', item?.source_lab ? `Source ${item.source_lab}` : '', item?.catalog_item_id ? `Catalog ${item.catalog_item_id}` : '', _matchTerm(title, THYROID_TERMS) ? 'Thyroid-related' : '', _checkUnitMismatch(item) ? 'Unit mismatch' : '', _buildThresholdSignal(item)?.title || ''])}${rangeReason ? `<div class="bio-db-panel-note" style="margin-top:10px">${esc(rangeReason)}</div>` : ''}${item?.notes ? `<div class="bio-db-panel-note" style="margin-top:10px">${esc(item.notes)}</div>` : ''}</div>`;
      }).join('') : '<div class="bio-db-empty">No lab results recorded for this patient yet.</div>'}
    </div>
  </section>`;
}

function _renderPage() {
  const el = _contentEl();
  if (!el) return;
  const counts = _counts();
  const catalogInfo = _catalogSummary();
  const model = buildBioAnalyzerModel({ patient: STATE.patient, catalog: STATE.catalog, substances: STATE.substances, labs: STATE.labs, reviewNotes: STATE.reviewNotes, findingAcks: STATE.findingAcks });
  el.innerHTML = `<div class="bio-db-page"><div class="bio-db-stack"><section class="bio-db-context"><div class="bio-db-eyebrow">Patient bio context</div><h1 class="bio-db-title">${esc(_patientLabel())}</h1><div class="bio-db-subtitle">${esc(_patientSubtitle() || 'Use this page to capture substances and lab signals that can confound, contextualize, or support neuromodulation decisions.')}</div></section>${STATE.loadError ? `<div class="bio-db-error">${esc(STATE.loadError)}</div>` : ''}${!catalogInfo.total && _canSeedCatalog() ? '<div class="bio-db-warning">The bio catalog is empty. Seed it to preload common medications, supplements, vitamins, labs, and biomarkers.</div>' : ''}<section class="bio-db-summary"><div class="bio-db-card bio-db-stat"><div class="bio-db-stat-value">' + counts.substances + '</div><div class="bio-db-stat-label">Tracked substances</div></div><div class="bio-db-card bio-db-stat"><div class="bio-db-stat-value">' + counts.activeSubstances + '</div><div class="bio-db-stat-label">Active substances</div></div><div class="bio-db-card bio-db-stat"><div class="bio-db-stat-value">' + counts.labs + '</div><div class="bio-db-stat-label">Lab results</div></div><div class="bio-db-card bio-db-stat"><div class="bio-db-stat-value">' + counts.abnormalLabs + '</div><div class="bio-db-stat-label">Flagged labs</div></div></section><div class="bio-db-layout">${_renderAnalyzerPanel(model)}<div class="bio-db-data-grid">${_renderSubstancesPanel()}${_renderLabsPanel()}</div></div></div></div>`;
}

function _setTopbar() {
  const subtitle = STATE.patientId ? `${_patientLabel()}${STATE.patientId ? ` · ${STATE.patientId}` : ''}` : 'Open from a patient context';
  const actions = ['<button class="btn btn-ghost btn-sm" onclick="window._bioRefresh?.()">Refresh</button>'];
  if (STATE.patientId && _navigateRef) actions.push('<button class="btn btn-ghost btn-sm" onclick="window._bioOpenPatientProfile?.()">Patient Profile</button>', '<button class="btn btn-ghost btn-sm" onclick="window._bioNavigateTo?.(\'labs-analyzer\')">Labs</button>', '<button class="btn btn-ghost btn-sm" onclick="window._bioNavigateTo?.(\'biomarkers\')">Biomarkers</button>', '<button class="btn btn-ghost btn-sm" onclick="window._bioNavigateTo?.(\'protocol-studio\')">Protocol Studio</button>');
  if (_canSeedCatalog()) actions.push('<button class="btn btn-primary btn-sm" onclick="window._bioSeedCatalog?.()">Seed Catalog</button>');
  _setTopbarRef?.('Bio Database', `<span style="font-size:12px;color:var(--text-tertiary);margin-right:10px">${esc(subtitle)}</span>${actions.join('')}`);
}

function _hydrateLocalReviewState() {
  if (!STATE.patientId) return;
  STATE.reviewNotes = _readLocalJson(_noteKey(STATE.patientId), { note: '', updatedAt: '' });
  STATE.findingAcks = _readLocalJson(_ackKey(STATE.patientId), {});
}

async function _loadData() {
  STATE.loadError = '';
  _setTopbar();
  const requests = await Promise.allSettled([api.getPatient(STATE.patientId), api.getPatientBioSummary(STATE.patientId), api.listBioCatalog(), api.listPatientBioSubstances(STATE.patientId), api.listPatientBioLabs(STATE.patientId)]);
  const [patientRes, summaryRes, catalogRes, substancesRes, labsRes] = requests;
  if (patientRes.status === 'fulfilled') STATE.patient = patientRes.value || null;
  if (summaryRes.status === 'fulfilled') STATE.summary = summaryRes.value || null;
  if (catalogRes.status === 'fulfilled') STATE.catalog = bioNormalizeArray(catalogRes.value);
  if (substancesRes.status === 'fulfilled') STATE.substances = bioNormalizeArray(substancesRes.value);
  if (labsRes.status === 'fulfilled') STATE.labs = bioNormalizeArray(labsRes.value);
  const failures = requests.filter((res) => res.status === 'rejected');
  if (failures.length === requests.length) STATE.loadError = failures[0]?.reason?.message || 'Bio database could not be loaded right now.';
  else if (failures.length) STATE.loadError = 'Some bio data could not be loaded. Available sections are still shown.';
  _hydrateLocalReviewState();
  _setTopbar();
  _renderPage();
}

function _readInput(id) {
  return document.getElementById(id)?.value?.trim?.() || '';
}

async function _withBusy(work) {
  STATE.busy = true;
  _renderPage();
  try { await work(); } finally { STATE.busy = false; _renderPage(); }
}

function _navigateTo(page) {
  if (!page || !_navigateRef) return;
  if (STATE.patientId) {
    window._selectedPatientId = STATE.patientId;
    window._profilePatientId = STATE.patientId;
  }
  _navigateRef(page, STATE.patientId ? { id: STATE.patientId, patientId: STATE.patientId } : undefined);
}

function _saveReviewNotes(event) {
  event?.preventDefault?.();
  STATE.reviewNotes = { note: _readInput('bio-review-notes'), updatedAt: new Date().toISOString() };
  _writeLocalJson(_noteKey(STATE.patientId), STATE.reviewNotes);
  _renderPage();
  showToast('Review note saved.', 'success');
}

function _clearReviewNotes() {
  STATE.reviewNotes = { note: '', updatedAt: '' };
  _writeLocalJson(_noteKey(STATE.patientId), STATE.reviewNotes);
  _renderPage();
  showToast('Review note cleared.', 'success');
}

function _toggleFindingAck(id) {
  const next = { ...(STATE.findingAcks || {}) };
  if (next[id]?.acknowledged) delete next[id];
  else next[id] = { acknowledged: true, acknowledgedAt: new Date().toISOString() };
  STATE.findingAcks = next;
  _writeLocalJson(_ackKey(STATE.patientId), STATE.findingAcks);
  _renderPage();
}

async function _submitSubstance(event) {
  event?.preventDefault?.();
  if (!STATE.patientId) return;
  const name = _readInput('bio-substance-name');
  if (!name) return showToast('Substance name is required.', 'warning');
  const payload = { catalog_item_id: _readInput('bio-substance-catalog') || null, substance_type: _readInput('bio-substance-kind') || 'medication', name, status: _readInput('bio-substance-status') || 'active', dose: _readInput('bio-substance-dose') || null, started_at: _readInput('bio-substance-started-at') || null, notes: _readInput('bio-substance-notes') || null };
  await _withBusy(async () => {
    try { await api.createPatientBioSubstance(STATE.patientId, payload); showToast('Substance saved.', 'success'); await _loadData(); }
    catch (err) { showToast('Could not save substance: ' + (err?.message || 'unknown error'), 'error'); }
  });
}

async function _submitLab(event) {
  event?.preventDefault?.();
  if (!STATE.patientId) return;
  const name = _readInput('bio-lab-name');
  if (!name) return showToast('Lab test name is required.', 'warning');
  const valueText = _readInput('bio-lab-value');
  const numericValue = Number(valueText);
  const payload = {
    catalog_item_id: _readInput('bio-lab-catalog') || null,
    lab_name: name,
    value_text: valueText || null,
    value_numeric: Number.isFinite(numericValue) ? numericValue : null,
    unit: _readInput('bio-lab-unit') || null,
    abnormal_flag: _readInput('bio-lab-flag') || 'unknown',
    collected_at: _readInput('bio-lab-collected-at') || null,
    reference_range_text: _readInput('bio-lab-reference-range') || null,
    source_lab: _readInput('bio-lab-source-lab') || null,
    notes: _readInput('bio-lab-notes') || null,
  };
  await _withBusy(async () => {
    try {
      if (STATE.editingLabId) {
        await api.updatePatientBioLab(STATE.patientId, STATE.editingLabId, payload);
        STATE.editingLabId = '';
        showToast('Lab result updated.', 'success');
      } else {
        await api.createPatientBioLab(STATE.patientId, payload);
        showToast('Lab result saved.', 'success');
      }
      await _loadData();
    }
    catch (err) { showToast('Could not save lab result: ' + (err?.message || 'unknown error'), 'error'); }
  });
}

function _startLabEdit(id) {
  if (!id) return;
  STATE.editingLabId = String(id);
  _renderPage();
}

function _cancelLabEdit() {
  STATE.editingLabId = '';
  _renderPage();
}

async function _deleteSubstance(id) {
  if (!STATE.patientId || !id || !window.confirm('Delete this substance entry?')) return;
  await _withBusy(async () => {
    try { await api.deletePatientBioSubstance(STATE.patientId, id); showToast('Substance deleted.', 'success'); await _loadData(); }
    catch (err) { showToast('Could not delete substance: ' + (err?.message || 'unknown error'), 'error'); }
  });
}

async function _deleteLab(id) {
  if (!STATE.patientId || !id || !window.confirm('Delete this lab result?')) return;
  await _withBusy(async () => {
    try { await api.deletePatientBioLab(STATE.patientId, id); showToast('Lab result deleted.', 'success'); await _loadData(); }
    catch (err) { showToast('Could not delete lab result: ' + (err?.message || 'unknown error'), 'error'); }
  });
}

async function _seedCatalog() {
  if (!_canSeedCatalog()) return;
  await _withBusy(async () => {
    try { await api.seedBioCatalog(); showToast('Bio catalog seeded.', 'success'); await _loadData(); }
    catch (err) { showToast('Could not seed bio catalog: ' + (err?.message || 'unknown error'), 'error'); }
  });
}

function _installHandlers() {
  window._bioRefresh = () => _loadData();
  window._bioOpenPatientProfile = () => _navigateTo('patient-profile');
  window._bioNavigateTo = (page) => _navigateTo(page);
  window._bioSaveReviewNotes = (event) => _saveReviewNotes(event);
  window._bioClearReviewNotes = () => _clearReviewNotes();
  window._bioToggleFindingAck = (id) => _toggleFindingAck(id);
  window._bioSubmitSubstance = (event) => _submitSubstance(event);
  window._bioSubmitLab = (event) => _submitLab(event);
  window._bioStartLabEdit = (id) => _startLabEdit(id);
  window._bioCancelLabEdit = () => _cancelLabEdit();
  window._bioDeleteSubstance = (id) => _deleteSubstance(id);
  window._bioDeleteLab = (id) => _deleteLab(id);
  window._bioSeedCatalog = () => _seedCatalog();
}

export async function pgBioDatabase(setTopbar, navigate) {
  _injectStylesOnce();
  _installHandlers();
  _setTopbarRef = setTopbar;
  _navigateRef = navigate;
  STATE.patientId = bioResolvePatientId();
  STATE.patient = null;
  STATE.summary = null;
  STATE.catalog = [];
  STATE.substances = [];
  STATE.labs = [];
  STATE.editingLabId = '';
  STATE.reviewNotes = { note: '', updatedAt: '' };
  STATE.findingAcks = {};
  STATE.loadError = '';
  _setTopbar();
  const el = _contentEl();
  if (!el) return;
  if (!STATE.patientId) {
    el.innerHTML = emptyState('🧪', 'Bio Database needs a patient context', 'Open this page from a patient profile, roster, or patient-aware workspace.');
    return;
  }
  el.innerHTML = '<div style="padding:36px;text-align:center;color:var(--text-tertiary)">Loading bio database…</div>';
  await _loadData();
}
