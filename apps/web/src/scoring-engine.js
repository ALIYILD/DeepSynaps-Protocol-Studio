/**
 * Centralized assessment scoring engine.
 *
 * Pure, stateless functions. All scale rules are defined in SCORING_RULES below.
 * Interpretation bands and raw-score calculation are separated.
 *
 * Supported behaviors:
 *   - Raw-score summation
 *   - Reverse-scored items
 *   - Named subscales with optional multipliers (DASS-21 x2, etc.)
 *   - Incomplete-response validation
 *   - Safety flags (PHQ-9 item 9, C-SSRS ideation threshold)
 *
 * Interpretation strings are plain-English severity bands for clinician display;
 * clinical decisions must still be made by a licensed clinician.
 *
 * All scale content here is metadata + derived thresholds only — no copyrighted
 * instrument item text is embedded in this module.
 */

// ── Scoring rules registry ─────────────────────────────────────────────────
// Keys: canonical scale id (uppercase, hyphenated). Values describe:
//   range:       [min, max] allowable raw total
//   items:       expected item count (for validation)
//   reverse:     1-based item indexes that must be reverse-scored before summation
//   itemScale:   [itemMin, itemMax] — used to compute reverse as (itemMax - value + itemMin)
//   subscales:   { name: { items: [1,2,...], multiplier?: 1 } }
//   safetyItems: item indexes that, if > 0, trigger a safety flag
//   bands:       [{ max, label, severity: 'minimal'|'mild'|'moderate'|'severe'|'critical' }]
//   licensing:   reuse tier for governance — 'public_domain' | 'us_gov' | 'academic' | 'licensed' | 'restricted'
//   respondent:  'self_report' | 'clinician' | 'caregiver' | 'mixed'
export const SCORING_RULES = {
  'PHQ-9': {
    range: [0, 27], items: 9, itemScale: [0, 3],
    safetyItems: [9],
    bands: [
      { max: 4, label: 'Minimal', severity: 'minimal' },
      { max: 9, label: 'Mild', severity: 'mild' },
      { max: 14, label: 'Moderate', severity: 'moderate' },
      { max: 19, label: 'Moderately Severe', severity: 'severe' },
      { max: 27, label: 'Severe', severity: 'critical' },
    ],
    licensing: 'public_domain',
    respondent: 'self_report',
  },
  'PHQ-2': {
    range: [0, 6], items: 2, itemScale: [0, 3],
    bands: [
      { max: 2, label: 'Negative screen', severity: 'minimal' },
      { max: 6, label: 'Positive screen — follow up with PHQ-9', severity: 'moderate' },
    ],
    licensing: 'public_domain',
    respondent: 'self_report',
  },
  'GAD-7': {
    range: [0, 21], items: 7, itemScale: [0, 3],
    bands: [
      { max: 4, label: 'Minimal', severity: 'minimal' },
      { max: 9, label: 'Mild', severity: 'mild' },
      { max: 14, label: 'Moderate', severity: 'moderate' },
      { max: 21, label: 'Severe', severity: 'severe' },
    ],
    licensing: 'public_domain',
    respondent: 'self_report',
  },
  'GAD-2': {
    range: [0, 6], items: 2, itemScale: [0, 3],
    bands: [
      { max: 2, label: 'Negative screen', severity: 'minimal' },
      { max: 6, label: 'Positive screen — follow up with GAD-7', severity: 'moderate' },
    ],
    licensing: 'public_domain',
    respondent: 'self_report',
  },
  'PCL-5': {
    range: [0, 80], items: 20, itemScale: [0, 4],
    subscales: {
      intrusion: { items: [1, 2, 3, 4, 5] },
      avoidance: { items: [6, 7] },
      cognitions_mood: { items: [8, 9, 10, 11, 12, 13, 14] },
      arousal: { items: [15, 16, 17, 18, 19, 20] },
    },
    bands: [
      { max: 32, label: 'Below probable PTSD threshold', severity: 'mild' },
      { max: 80, label: 'Probable PTSD', severity: 'severe' },
    ],
    licensing: 'us_gov',
    respondent: 'self_report',
  },
  'DASS-21': {
    // Each subscale is summed then doubled (x2) to approximate DASS-42.
    range: [0, 63], items: 21, itemScale: [0, 3],
    subscales: {
      depression: { items: [3, 5, 10, 13, 16, 17, 21], multiplier: 2 },
      anxiety: { items: [2, 4, 7, 9, 15, 19, 20], multiplier: 2 },
      stress: { items: [1, 6, 8, 11, 12, 14, 18], multiplier: 2 },
    },
    // Bands apply to each subscale separately after multiplier; use interpretSubscale
    subscaleBands: {
      depression: [
        { max: 9, label: 'Normal', severity: 'minimal' },
        { max: 13, label: 'Mild', severity: 'mild' },
        { max: 20, label: 'Moderate', severity: 'moderate' },
        { max: 27, label: 'Severe', severity: 'severe' },
        { max: 42, label: 'Extremely Severe', severity: 'critical' },
      ],
      anxiety: [
        { max: 7, label: 'Normal', severity: 'minimal' },
        { max: 9, label: 'Mild', severity: 'mild' },
        { max: 14, label: 'Moderate', severity: 'moderate' },
        { max: 19, label: 'Severe', severity: 'severe' },
        { max: 42, label: 'Extremely Severe', severity: 'critical' },
      ],
      stress: [
        { max: 14, label: 'Normal', severity: 'minimal' },
        { max: 18, label: 'Mild', severity: 'mild' },
        { max: 25, label: 'Moderate', severity: 'moderate' },
        { max: 33, label: 'Severe', severity: 'severe' },
        { max: 60, label: 'Extremely Severe', severity: 'critical' },
      ],
    },
    licensing: 'academic',
    respondent: 'self_report',
  },
  'ISI': {
    range: [0, 28], items: 7, itemScale: [0, 4],
    bands: [
      { max: 7, label: 'No clinically significant insomnia', severity: 'minimal' },
      { max: 14, label: 'Subthreshold insomnia', severity: 'mild' },
      { max: 21, label: 'Moderate clinical insomnia', severity: 'moderate' },
      { max: 28, label: 'Severe clinical insomnia', severity: 'severe' },
    ],
    licensing: 'licensed',
    respondent: 'self_report',
  },
  'ESS': {
    range: [0, 24], items: 8, itemScale: [0, 3],
    // ESS does not use reverse scoring — all items summed directly.
    bands: [
      { max: 10, label: 'Normal daytime sleepiness', severity: 'minimal' },
      { max: 15, label: 'Excessive daytime sleepiness', severity: 'moderate' },
      { max: 24, label: 'Severe sleepiness — clinical follow-up', severity: 'severe' },
    ],
    licensing: 'academic',
    respondent: 'self_report',
  },
  'C-SSRS': {
    // Score entry reflects highest ideation level (0–6) reached during screener.
    range: [0, 6], items: 1, itemScale: [0, 6],
    // Any score >= 2 indicates active ideation; any score >= 4 = behavior and is critical.
    safetyItems: [1],
    bands: [
      { max: 0, label: 'No Ideation', severity: 'minimal' },
      { max: 1, label: 'Passive ideation', severity: 'mild' },
      { max: 3, label: 'Active ideation', severity: 'severe' },
      { max: 6, label: 'Ideation with plan / behavior — escalate immediately', severity: 'critical' },
    ],
    licensing: 'restricted',
    respondent: 'clinician',
  },
  'HDRS-17': {
    range: [0, 52], items: 17, itemScale: [0, 4],
    bands: [
      { max: 7, label: 'Normal', severity: 'minimal' },
      { max: 13, label: 'Mild', severity: 'mild' },
      { max: 18, label: 'Moderate', severity: 'moderate' },
      { max: 22, label: 'Severe', severity: 'severe' },
      { max: 52, label: 'Very Severe', severity: 'critical' },
    ],
    licensing: 'licensed',
    respondent: 'clinician',
  },
  'MADRS': {
    range: [0, 60], items: 10, itemScale: [0, 6],
    bands: [
      { max: 6, label: 'Normal', severity: 'minimal' },
      { max: 19, label: 'Mild', severity: 'mild' },
      { max: 34, label: 'Moderate', severity: 'moderate' },
      { max: 60, label: 'Severe', severity: 'severe' },
    ],
    licensing: 'licensed',
    respondent: 'clinician',
  },
  'YMRS': {
    range: [0, 60], items: 11, itemScale: [0, 8],
    bands: [
      { max: 12, label: 'Remission', severity: 'minimal' },
      { max: 20, label: 'Mild', severity: 'mild' },
      { max: 30, label: 'Moderate', severity: 'moderate' },
      { max: 60, label: 'Severe', severity: 'severe' },
    ],
    licensing: 'licensed',
    respondent: 'clinician',
  },
  'Y-BOCS': {
    range: [0, 40], items: 10, itemScale: [0, 4],
    subscales: {
      obsessions: { items: [1, 2, 3, 4, 5] },
      compulsions: { items: [6, 7, 8, 9, 10] },
    },
    bands: [
      { max: 7, label: 'Subclinical', severity: 'minimal' },
      { max: 15, label: 'Mild', severity: 'mild' },
      { max: 23, label: 'Moderate', severity: 'moderate' },
      { max: 31, label: 'Severe', severity: 'severe' },
      { max: 40, label: 'Extreme', severity: 'critical' },
    ],
    licensing: 'licensed',
    respondent: 'clinician',
  },
  'ADHD-RS-5': {
    range: [0, 54], items: 18, itemScale: [0, 3],
    subscales: {
      inattention: { items: [1, 3, 5, 7, 9, 11, 13, 15, 17] },
      hyperactivity: { items: [2, 4, 6, 8, 10, 12, 14, 16, 18] },
    },
    bands: [
      { max: 16, label: 'Normal', severity: 'minimal' },
      { max: 32, label: 'Moderate', severity: 'moderate' },
      { max: 54, label: 'Severe', severity: 'severe' },
    ],
    licensing: 'licensed',
    respondent: 'clinician',
  },
  'PSQI': {
    // PSQI Global score (0-21); seven component scores each 0-3. Inputs
    // to this engine are the global score only — component derivation is
    // not implemented here.
    range: [0, 21], items: 1, itemScale: [0, 21],
    bands: [
      { max: 5, label: 'Good sleep quality', severity: 'minimal' },
      { max: 21, label: 'Poor sleep quality', severity: 'moderate' },
    ],
    licensing: 'academic',
    respondent: 'self_report',
  },
  'NRS-Pain': {
    range: [0, 10], items: 1, itemScale: [0, 10],
    bands: [
      { max: 3, label: 'Mild pain', severity: 'mild' },
      { max: 6, label: 'Moderate pain', severity: 'moderate' },
      { max: 10, label: 'Severe pain', severity: 'severe' },
    ],
    licensing: 'public_domain',
    respondent: 'self_report',
  },
};

const SEVERITY_ORDER = {
  minimal: 0, mild: 1, moderate: 2, severe: 3, critical: 4,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalize a scale id for lookup: upper-case, strip trailing revisions. */
export function normalizeScaleId(id) {
  if (!id) return '';
  const s = String(id).trim().toUpperCase();
  // Accept both 'PHQ9' and 'PHQ-9'; prefer hyphenated canonical form.
  if (s === 'PHQ9') return 'PHQ-9';
  if (s === 'GAD7') return 'GAD-7';
  if (s === 'GAD2') return 'GAD-2';
  if (s === 'PHQ2') return 'PHQ-2';
  if (s === 'PCL5') return 'PCL-5';
  if (s === 'DASS21') return 'DASS-21';
  return s;
}

/** Returns the rule object or null. */
export function getScoringRule(scaleId) {
  return SCORING_RULES[normalizeScaleId(scaleId)] || null;
}

/** Reverse a single item value within the rule's itemScale. */
function reverseItem(value, itemScale) {
  const [lo, hi] = itemScale;
  return hi - value + lo;
}

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Compute raw total score, subscales, validation state, and safety flags
 * from an array of item responses.
 *
 * @param {string} scaleId
 * @param {number[]} itemValues - 1-indexed responses; itemValues[0] corresponds to item 1.
 *   Use `null` or `undefined` for unanswered items. Do not use 0 to mean skipped.
 * @returns {{
 *   raw: number|null,
 *   complete: boolean,
 *   missingItems: number[],
 *   subscales: Record<string, number>,
 *   warnings: string[],
 *   safety: { flagged: boolean, severity: string, message: string }[]
 * }}
 */
export function computeRawScore(scaleId, itemValues) {
  const rule = getScoringRule(scaleId);
  if (!rule) {
    return {
      raw: null, complete: false, missingItems: [], subscales: {},
      warnings: [`Unknown scale: ${scaleId}`], safety: [],
    };
  }
  const items = rule.items;
  const values = Array.isArray(itemValues) ? itemValues : [];
  const missingItems = [];
  const warnings = [];
  const safety = [];

  // Validation: missing items
  for (let i = 0; i < items; i++) {
    const v = values[i];
    if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) {
      missingItems.push(i + 1);
    }
  }
  const complete = missingItems.length === 0;

  // Item-scale clamping for out-of-range values
  const [lo, hi] = rule.itemScale || [0, 0];
  const clean = values.slice(0, items).map((v, i) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (Number.isNaN(n)) {
      warnings.push(`Item ${i + 1} is not a number; treated as missing.`);
      return null;
    }
    if (n < lo || n > hi) {
      warnings.push(`Item ${i + 1} out of range [${lo},${hi}]; clamped.`);
      return Math.max(lo, Math.min(hi, n));
    }
    return n;
  });

  // Reverse scoring
  const reverseSet = new Set(rule.reverse || []);
  const scored = clean.map((v, i) => {
    if (v === null) return null;
    return reverseSet.has(i + 1) ? reverseItem(v, rule.itemScale) : v;
  });

  // Raw total (null if incomplete — clinician may still see partial subscales)
  const sum = (arr) => arr.reduce((a, b) => a + (b == null ? 0 : b), 0);
  const raw = complete ? sum(scored) : null;

  // Subscales
  const subscales = {};
  if (rule.subscales) {
    for (const [name, def] of Object.entries(rule.subscales)) {
      const itemIdx = def.items || [];
      const vals = itemIdx.map((ix) => scored[ix - 1]);
      const subMissing = vals.some((v) => v == null);
      if (!subMissing) {
        const s = sum(vals) * (def.multiplier || 1);
        subscales[name] = s;
      } else {
        subscales[name] = null;
      }
    }
  }

  // Safety flags
  if (rule.safetyItems) {
    for (const idx of rule.safetyItems) {
      const v = scored[idx - 1];
      if (v != null && v >= 1) {
        if (normalizeScaleId(scaleId) === 'PHQ-9' && idx === 9) {
          safety.push({
            flagged: true,
            severity: v >= 2 ? 'critical' : 'warn',
            message: `PHQ-9 item 9 (thoughts of self-harm) = ${v}. Follow suicide-safety protocol and document response.`,
          });
        } else if (normalizeScaleId(scaleId) === 'C-SSRS') {
          const sev = v >= 4 ? 'critical' : v >= 2 ? 'warn' : 'info';
          safety.push({
            flagged: v >= 2,
            severity: sev,
            message: v >= 4
              ? 'C-SSRS indicates suicidal behavior — escalate immediately per crisis protocol.'
              : v >= 2
                ? 'C-SSRS indicates active ideation — clinician review required before session.'
                : 'C-SSRS screen negative.',
          });
        } else {
          safety.push({ flagged: true, severity: 'warn', message: `Safety item ${idx} non-zero on ${scaleId}.` });
        }
      }
    }
  }

  return { raw, complete, missingItems, subscales, warnings, safety };
}

/**
 * Interpret a total raw score into a severity band label.
 * Returns null if the scale is unknown or score is null.
 */
export function interpretScore(scaleId, rawScore) {
  const rule = getScoringRule(scaleId);
  if (!rule || rawScore == null) return null;
  const bands = rule.bands || [];
  for (const band of bands) {
    if (rawScore <= band.max) {
      return { label: band.label, severity: band.severity, max: band.max };
    }
  }
  // Above all bands: return the highest.
  const last = bands[bands.length - 1];
  return last ? { label: last.label, severity: last.severity, max: last.max } : null;
}

/** Interpret a subscale using its dedicated bands (DASS-21 only today). */
export function interpretSubscale(scaleId, subscaleName, value) {
  const rule = getScoringRule(scaleId);
  if (!rule || value == null) return null;
  const bands = (rule.subscaleBands && rule.subscaleBands[subscaleName]) || null;
  if (!bands) return null;
  for (const band of bands) {
    if (value <= band.max) {
      return { label: band.label, severity: band.severity, max: band.max };
    }
  }
  const last = bands[bands.length - 1];
  return last ? { label: last.label, severity: last.severity, max: last.max } : null;
}

/**
 * One-call convenience: score + interpretation + safety.
 */
export function scoreAssessment(scaleId, itemValues) {
  const result = computeRawScore(scaleId, itemValues);
  const interpretation = interpretScore(scaleId, result.raw);
  const subscaleInterpretations = {};
  for (const [name, val] of Object.entries(result.subscales)) {
    const interp = interpretSubscale(scaleId, name, val);
    if (interp) subscaleInterpretations[name] = interp;
  }
  return {
    scaleId: normalizeScaleId(scaleId),
    ...result,
    interpretation,
    subscaleInterpretations,
  };
}

/** Highest severity across all safety flags, or null. */
export function highestSafety(scoreResult) {
  if (!scoreResult || !scoreResult.safety || !scoreResult.safety.length) return null;
  let best = null;
  for (const s of scoreResult.safety) {
    const ord = SEVERITY_ORDER[s.severity] ?? 0;
    if (best == null || ord > SEVERITY_ORDER[best.severity]) best = s;
  }
  return best;
}

/** Classify a trend given a chronological array of raw scores (oldest→newest). */
export function classifyTrend(scaleId, scores) {
  if (!Array.isArray(scores) || scores.length < 2) return 'insufficient_data';
  const first = scores[0];
  const last = scores[scores.length - 1];
  if (first == null || last == null) return 'insufficient_data';
  const rule = getScoringRule(scaleId);
  // Rule-of-thumb: >= 20% reduction from baseline = responder.
  // Higher-score-is-worse for all currently supported scales.
  const delta = first - last;
  if (first === 0) {
    return last === 0 ? 'stable' : 'worsening';
  }
  const pct = delta / first;
  if (pct >= 0.5) return 'remission';
  if (pct >= 0.2) return 'improving';
  if (pct <= -0.2) return 'worsening';
  return 'stable';
}
