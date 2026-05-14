/**
 * Single source of truth for Voice / acoustic biomarker decision-support copy and error UX.
 * Research / adjunct-to-judgment positioning — not a regulated diagnostic claim.
 */

/** Short line for chips, cards, and secondary banners */
export const VOICE_DECISION_SUPPORT_SHORT =
  'Voice acoustic outputs are decision-support signals for clinician review — not a diagnosis, staging tool, or treatment directive.';

/** Full paragraph for primary analyzer surfaces */
export const VOICE_DECISION_SUPPORT_FULL =
  'These outputs are clinical decision-support signals derived from acoustic heuristics and literature retrieval from the DeepSynaps corpus. '
  + 'They are not diagnoses, FDA-cleared tests, or treatment recommendations. '
  + 'Interpret with full clinical context and standardized speech–language assessment when indicated.';

/** Strip suitable for inline amber boxes (~2 sentences) */
export const VOICE_DECISION_SUPPORT_INLINE =
  `${VOICE_DECISION_SUPPORT_SHORT} Full acoustic biomarker reports with literature links run via Voice Analyzer or Recording Studio “Analyze.”`;

/**
 * Non-empty HTML snippet with pipeline provenance when present on stored report payload.
 */
export function voicePipelineMetaBlock(voiceReport) {
  const prov = voiceReport?.provenance;
  if (!prov || typeof prov !== 'object') return '';
  const pv = prov.pipeline_version;
  const nv = prov.norm_db_version;
  const sv = prov.schema_version;
  const parts = [];
  if (pv) parts.push(`Pipeline ${escapeHtml(pv)}`);
  if (nv) parts.push(`Norm DB ${escapeHtml(nv)}`);
  if (sv) parts.push(`Schema ${escapeHtml(sv)}`);
  if (!parts.length) return '';
  return `<div style="font-size:11px;color:var(--text-tertiary);margin-top:8px;font-family:var(--font-mono,monospace)">${parts.join(' · ')}</div>`;
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Evidence-graded voice biomarker research matrix (2023-2025 literature) ──

export const VOICE_BIOMARKER_EVIDENCE = {
  depression: {
    cpp: { grade: 'B', direction: 'decreased', strength: 'strong', note: 'Best single predictor; ~50% decrease (p<0.001)' },
    speech_rate: { grade: 'A', direction: 'decreased', strength: 'strong', note: 'Meta-analytic support; psychomotor retardation marker' },
    pause_duration: { grade: 'A', direction: 'increased', strength: 'strong', note: '3x longer in depression (p<0.001)' },
    f0: { grade: 'A', direction: 'nonsignificant', strength: 'none', note: 'NOT significant in meta-analysis (p=0.56); do not rely on pitch alone' },
    jitter: { grade: 'C', direction: 'mixed', strength: 'weak', note: 'Inconsistent across studies' },
    shimmer: { grade: 'C', direction: 'mixed', strength: 'weak', note: 'Inconsistent across studies' },
    hnr: { grade: 'C', direction: 'mixed', strength: 'weak', note: 'Inconsistent across studies' },
  },
  parkinsons: {
    vowel_articulation: { grade: 'B', direction: 'decreased', strength: 'strong', note: 'Progressive impairment over disease course' },
    shimmer: { grade: 'B', direction: 'increased', strength: 'strong', note: 'Increases over ~33 months' },
    nhr: { grade: 'B', direction: 'increased', strength: 'strong', note: 'Noise-to-harmonics ratio increases' },
    speech_rate: { grade: 'B', direction: 'decreased', strength: 'moderate', note: 'Progressive decline' },
    pause_ratio: { grade: 'B', direction: 'increased', strength: 'moderate', note: 'Correlates with disease stage' },
  },
  alzheimers: {
    speech_rate: { grade: 'A', direction: 'decreased', strength: 'strong', note: 'MD=0.64 faster in controls (p=0.01)' },
    articulation_rate: { grade: 'A', direction: 'decreased', strength: 'strong', note: 'MD=0.30 faster in controls (p=0.0002)' },
    voice_breaks: { grade: 'A', direction: 'increased', strength: 'strong', note: 'MD=11.58% less in controls (p<0.0001)' },
    npvi: { grade: 'A', direction: 'increased', strength: 'strong', note: 'Rhythm variability increased (p<0.0001)' },
  },
  schizophrenia: {
    pause_duration: { grade: 'A', direction: 'increased', strength: 'strong', note: 'Meta-analytic support' },
    speech_rate: { grade: 'A', direction: 'decreased', strength: 'strong', note: 'Meta-analytic support' },
    spoken_time_proportion: { grade: 'A', direction: 'decreased', strength: 'strong', note: 'Meta-analytic support' },
  },
  anxiety: {
    f0_slope: { grade: 'C', direction: 'reduced', strength: 'moderate', note: 'Reduced in males; sex-specific approaches essential' },
    pitch_range: { grade: 'C', direction: 'narrower', strength: 'moderate', note: 'Narrower in males; sex-specific approaches essential' },
  },
};

/**
 * Render a colour-coded evidence grade badge for a given letter grade.
 * @param {'A'|'B'|'C'|'D'} grade
 * @returns {string} HTML string
 */
export function renderEvidenceGradeBadge(grade) {
  const colors = {
    A: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', text: '#16a34a', label: 'A — Meta-analysis/SR' },
    B: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)', text: '#2563eb', label: 'B — Controlled trial' },
    C: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#d97706', label: 'C — Observational' },
    D: { bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.35)', text: '#6b7280', label: 'D — Expert opinion' },
  };
  const c = colors[grade] || colors.D;
  return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;background:${c.bg};border:1px solid ${c.border};color:${c.text};font-size:11px;font-weight:600;white-space:nowrap">${escapeHtml(c.label)}</span>`;
}

// ── Critical safety disclaimer ──

export const VOICE_CRITICAL_SAFETY_DISCLAIMER =
  'IMPORTANT SAFETY LIMITATIONS: (1) No voice biomarker is FDA-approved or CE-marked '
  + 'for clinical diagnosis as of 2025. (2) Suicide risk prediction from voice is NOT '
  + 'clinically validated (AUC 0.62-0.67 with severe methodological limitations). '
  + '(3) All outputs require clinician oversight and should serve as adjuncts, not '
  + 'replacements for clinical examination. (4) Gender, age, accent, and language '
  + 'bias may affect generalizability.';

/**
 * Render a condition-specific feature card showing each feature with evidence grade.
 * @param {string} condition - Key from VOICE_BIOMARKER_EVIDENCE (e.g. 'depression')
 * @param {string[]} features - Optional subset of feature keys to show; defaults to all
 * @returns {string} HTML string
 */
export function renderConditionFeatureCard(condition, features) {
  const cfg = VOICE_BIOMARKER_EVIDENCE[condition];
  if (!cfg) return '';
  const keys = Array.isArray(features) && features.length ? features : Object.keys(cfg);
  const titleMap = {
    depression: 'Depression voice markers',
    parkinsons: "Parkinson's voice markers",
    alzheimers: 'Cognitive decline markers',
    schizophrenia: 'Schizophrenia speech markers',
    anxiety: 'Anxiety voice markers',
  };
  const directionIcon = (d) => {
    if (d === 'decreased' || d === 'reduced' || d === 'narrower') return '\u2193';
    if (d === 'increased') return '\u2191';
    if (d === 'nonsignificant' || d === 'mixed') return '\u2194';
    return '';
  };
  const rows = keys
    .filter((k) => cfg[k])
    .map((k) => {
      const f = cfg[k];
      const icon = directionIcon(f.direction);
      const dirLabel = f.direction === 'nonsignificant'
        ? 'Not significant (meta-analysis)'
        : f.direction === 'mixed'
          ? 'Inconsistent across studies'
          : `${icon} ${f.direction}`;
      return `<tr>
        <td style="padding:5px 6px;border-bottom:1px solid var(--border);font-size:11px">${escapeHtml(k.replace(/_/g, ' '))}</td>
        <td style="padding:5px 6px;border-bottom:1px solid var(--border)">${renderEvidenceGradeBadge(f.grade)}</td>
        <td style="padding:5px 6px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-secondary)">${escapeHtml(dirLabel)}</td>
        <td style="padding:5px 6px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text-tertiary);max-width:240px">${escapeHtml(f.note)}</td>
      </tr>`;
    })
    .join('');

  return `<article style="margin-bottom:12px;padding:12px;border-radius:10px;border:1px solid var(--border);background:rgba(255,255,255,.02)" aria-label="${escapeHtml(titleMap[condition] || condition)}">
    <h5 style="margin:0 0 8px;font-size:12px;font-weight:600">${escapeHtml(titleMap[condition] || condition)}</h5>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr>
        <th style="text-align:left;padding:5px 6px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:10px">Feature</th>
        <th style="text-align:left;padding:5px 6px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:10px">Grade</th>
        <th style="text-align:left;padding:5px 6px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:10px">Direction</th>
        <th style="text-align:left;padding:5px 6px;border-bottom:1px solid var(--border);color:var(--text-tertiary);font-size:10px">Note</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </article>`;
}

/**
 * Map apiFetch errors (status + FastAPI detail) to clinician-facing toast copy.
 */
export function voiceApiErrorToast(err) {
  const status = err?.status;
  const detail = String(err?.message || err?.body?.detail || '').trim();
  if (status === 503) {
    return {
      title: 'Voice analyzer unavailable',
      body:
        'The acoustic pipeline is not installed on this API worker (install deepsynaps-audio with [acoustic]). '
        + (detail ? `Detail: ${detail.slice(0, 160)}` : ''),
      severity: 'warning',
    };
  }
  if (status === 401 || err?.code === 'not_a_real_user') {
    return {
      title: 'Sign-in required',
      body: detail || 'Use a full clinician account for voice analysis.',
      severity: 'warning',
    };
  }
  return {
    title: 'Voice analysis failed',
    body: detail.slice(0, 280) || 'Unknown error',
    severity: 'error',
  };
}

/** Extra DeepTwin strip when user navigates with voice domain hint */
export const VOICE_DEEPTWIN_DOMAIN_NOTE =
  'Voice domain: acoustic biomarker counts reflect Voice Analyzer / virtual-care uploads — decision-support only; confirm findings clinically.';
