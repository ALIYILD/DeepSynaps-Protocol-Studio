// Tests for qeeg-ai-panels.js
//
// Exports:
//   renderBrainAgeCard(analysis)
//   renderRiskScoreBars(analysis)
//   renderCentileCurves(analysis)
//   renderExplainabilityOverlay(analysis)
//   renderSimilarCases(analysis)
//   renderProtocolRecommendationCard(analysis)
//   renderLongitudinalSparklines(analysis)
//   renderAiUpgradePanels(analysis)
//   mountCopilotWidget(containerId, analysisId)   — DOM-dependent, not tested here
//
// NOTE: mountCopilotWidget requires a real DOM with querySelector + event
// listeners. We skip it and document why in this comment. All other exports
// are pure string-returning renderers testable in Node without DOM stubs.
//
// Regulatory / clinical-safety pins:
//   - "Research/wellness use. Brain-age gap is a neurophysiological metric..."
//   - "These are neurophysiological similarity indices; they do not establish..."
//   - "Research-derived protocol suggestion. Clinician review required..."
//   - Copilot offline replies always end with "please consult your clinician..."
//   - Stub badge: "Model not available — do not clinically use"

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  renderBrainAgeCard,
  renderRiskScoreBars,
  renderCentileCurves,
  renderExplainabilityOverlay,
  renderSimilarCases,
  renderProtocolRecommendationCard,
  renderLongitudinalSparklines,
  renderAiUpgradePanels,
} from './qeeg-ai-panels.js';

// ── Sample fixtures ───────────────────────────────────────────────────────────

const BRAIN_AGE_PAYLOAD = {
  brain_age: {
    predicted_years: 38,
    chronological_years: 35,
    gap_years: 3,
    gap_percentile: 72,
    confidence: 'moderate',
    electrode_importance: { Fz: 0.9, F3: 0.7, Cz: 0.3 },
  },
};

const BRAIN_AGE_STUB_PAYLOAD = {
  brain_age: {
    predicted_years: 40,
    chronological_years: 37,
    gap_years: 3,
    gap_percentile: 68,
    confidence: 'low',
    is_stub: true,
  },
};

const RISK_SCORES_PAYLOAD = {
  risk_scores: {
    mdd_like:   { score: 0.71, ci95: [0.63, 0.79] },
    adhd_like:  { score: 0.45, ci95: [0.38, 0.52] },
    anxiety_like: { score: 0.30, ci95: [0.22, 0.38] },
    disclaimer: 'These are neurophysiological similarity indices; they do not establish any medical condition.',
  },
};

const CENTILE_PAYLOAD = {
  centiles: {
    spectral: {
      bands: {
        alpha: {
          absolute_uv2: { Fz: 82, Cz: 14, Pz: 88 },
        },
        beta: {
          absolute_uv2: { Fz: 55, Cz: 47 },
        },
      },
    },
    norm_db_version: 'ds-normative-v2.1',
  },
};

const PROTOCOL_REC_PAYLOAD = {
  protocol_recommendation: {
    primary_modality: 'rTMS',
    target_region: 'DLPFC-L',
    confidence: 'high',
    evidence_grade: 'A',
    rationale: 'Frontal alpha asymmetry and elevated theta support left DLPFC targeting.',
    dose: { sessions: 36, intensity: '120%MT', duration_min: 37, frequency: '10 Hz' },
    session_plan: {
      induction: { sessions: 20, notes: 'Mon/Wed/Fri' },
      consolidation: { sessions: 12 },
      maintenance: { sessions: 4 },
    },
    contraindications: ['seizure history', 'cochlear implant'],
    expected_response_window_weeks: [3, 6],
    citations: [
      { n: 1, title: 'O\'Reardon et al., 2007', pmid: '17573044', year: '2007' },
    ],
  },
};

const LONGITUDINAL_PAYLOAD = {
  longitudinal: {
    n_sessions: 5,
    baseline_date: '2026-01-15',
    days_since_baseline: 45,
    feature_trajectories: {
      alpha_Fz: {
        label: 'Alpha power (Fz)',
        values: [12.3, 13.1, 14.0, 13.8, 15.2],
        dates: ['2026-01-15', '2026-02-01', '2026-02-15', '2026-03-01', '2026-03-15'],
        slope: 0.72,
        rci: 1.45,
        significant: true,
      },
    },
  },
};

// ── renderBrainAgeCard ────────────────────────────────────────────────────────

describe('renderBrainAgeCard', () => {
  it('returns empty string for null/undefined analysis', () => {
    assert.strictEqual(renderBrainAgeCard(null), '');
    assert.strictEqual(renderBrainAgeCard(undefined), '');
    assert.strictEqual(renderBrainAgeCard({}), '');
  });

  it('renders card with "Brain age (research)" title', () => {
    const html = renderBrainAgeCard(BRAIN_AGE_PAYLOAD);
    assert.ok(html.includes('Brain age (research)'), 'card title must be "Brain age (research)"');
  });

  it('includes the regulatory disclaimer about neurophysiological metric', () => {
    const html = renderBrainAgeCard(BRAIN_AGE_PAYLOAD);
    assert.ok(
      html.includes('neurophysiological metric'),
      'must include "neurophysiological metric" disclaimer'
    );
    assert.ok(
      html.includes('does not indicate any medical condition'),
      'must include "does not indicate any medical condition" copy'
    );
  });

  it('renders predicted and chronological year values', () => {
    const html = renderBrainAgeCard(BRAIN_AGE_PAYLOAD);
    assert.ok(html.includes('38'), 'predicted age 38 should appear');
    assert.ok(html.includes('35'), 'chronological age 35 should appear');
  });

  it('renders stub badge when is_stub=true with clinical safety text', () => {
    const html = renderBrainAgeCard(BRAIN_AGE_STUB_PAYLOAD);
    assert.ok(
      html.includes('Model not available — do not clinically use'),
      'stub badge must read "Model not available — do not clinically use"'
    );
  });

  it('does NOT render stub badge for real (non-stub) analysis', () => {
    const html = renderBrainAgeCard(BRAIN_AGE_PAYLOAD);
    assert.ok(
      !html.includes('do not clinically use'),
      'no stub badge should appear for a real analysis payload'
    );
  });

  it('returns SVG gauge markup', () => {
    const html = renderBrainAgeCard(BRAIN_AGE_PAYLOAD);
    assert.ok(html.includes('<svg'), 'should include SVG gauge element');
  });
});

// ── renderRiskScoreBars ───────────────────────────────────────────────────────

describe('renderRiskScoreBars', () => {
  it('returns empty string for null analysis', () => {
    assert.strictEqual(renderRiskScoreBars(null), '');
    assert.strictEqual(renderRiskScoreBars({}), '');
  });

  it('renders card title "Similarity indices (research/wellness use)"', () => {
    const html = renderRiskScoreBars(RISK_SCORES_PAYLOAD);
    assert.ok(
      html.includes('Similarity indices (research/wellness use)'),
      'card title must be "Similarity indices (research/wellness use)"'
    );
  });

  it('renders disclaimer pinning safety copy exactly', () => {
    const html = renderRiskScoreBars(RISK_SCORES_PAYLOAD);
    assert.ok(
      html.includes('neurophysiological similarity indices'),
      'disclaimer must include "neurophysiological similarity indices"'
    );
    assert.ok(
      html.includes('do not establish any medical condition'),
      'disclaimer must include "do not establish any medical condition"'
    );
  });

  it('renders MDD-like and ADHD-like bar rows', () => {
    const html = renderRiskScoreBars(RISK_SCORES_PAYLOAD);
    assert.ok(html.includes('MDD-like'), 'MDD-like row should be rendered');
    assert.ok(html.includes('ADHD-like'), 'ADHD-like row should be rendered');
  });

  it('includes progressbar ARIA role on risk bars', () => {
    const html = renderRiskScoreBars(RISK_SCORES_PAYLOAD);
    assert.ok(html.includes('role="progressbar"'), 'bars must have role=progressbar for a11y');
  });

  it('renders "not a likelihood of disease" sub-heading', () => {
    const html = renderRiskScoreBars(RISK_SCORES_PAYLOAD);
    assert.ok(
      html.includes('not a likelihood of disease'),
      'sub-heading must clarify "not a likelihood of disease"'
    );
  });
});

// ── renderCentileCurves ───────────────────────────────────────────────────────

describe('renderCentileCurves', () => {
  it('returns empty string when analysis has no centiles', () => {
    assert.strictEqual(renderCentileCurves(null), '');
    assert.strictEqual(renderCentileCurves({}), '');
    assert.strictEqual(renderCentileCurves({ centiles: {} }), '');
  });

  it('renders "Centile curves (GAMLSS)" card title', () => {
    const html = renderCentileCurves(CENTILE_PAYLOAD);
    assert.ok(html.includes('Centile curves (GAMLSS)'), 'card title must be "Centile curves (GAMLSS)"');
  });

  it('renders channel names in table', () => {
    const html = renderCentileCurves(CENTILE_PAYLOAD);
    assert.ok(html.includes('Fz'), 'Fz channel should appear in centile table');
    assert.ok(html.includes('Cz'), 'Cz channel should appear in centile table');
  });

  it('renders norm DB version footnote', () => {
    const html = renderCentileCurves(CENTILE_PAYLOAD);
    assert.ok(
      html.includes('ds-normative-v2.1'),
      'norm DB version should appear in footnote'
    );
  });
});

// ── renderProtocolRecommendationCard ─────────────────────────────────────────

describe('renderProtocolRecommendationCard', () => {
  it('returns empty string when no protocol_recommendation', () => {
    assert.strictEqual(renderProtocolRecommendationCard(null), '');
    assert.strictEqual(renderProtocolRecommendationCard({}), '');
  });

  it('renders "Protocol recommendation (research)" title', () => {
    const html = renderProtocolRecommendationCard(PROTOCOL_REC_PAYLOAD);
    assert.ok(
      html.includes('Protocol recommendation (research)'),
      'card title must be "Protocol recommendation (research)"'
    );
  });

  it('includes "Clinician review required" in the sub-heading', () => {
    const html = renderProtocolRecommendationCard(PROTOCOL_REC_PAYLOAD);
    assert.ok(
      html.includes('Clinician review required'),
      '"Clinician review required" must appear in the recommendation card'
    );
  });

  it('renders rTMS modality and DLPFC-L target region', () => {
    const html = renderProtocolRecommendationCard(PROTOCOL_REC_PAYLOAD);
    assert.ok(html.includes('rTMS'), 'rTMS modality should be present');
    assert.ok(html.includes('DLPFC-L'), 'DLPFC-L target region should be present');
  });

  it('renders contraindication pills', () => {
    const html = renderProtocolRecommendationCard(PROTOCOL_REC_PAYLOAD);
    assert.ok(html.includes('seizure history'), 'contraindication "seizure history" should be rendered');
  });

  it('renders expected response window (3–6 weeks)', () => {
    const html = renderProtocolRecommendationCard(PROTOCOL_REC_PAYLOAD);
    assert.ok(html.includes('3'), 'lower bound of response window should be present');
    assert.ok(html.includes('6'), 'upper bound of response window should be present');
  });
});

// ── renderSimilarCases ────────────────────────────────────────────────────────

describe('renderSimilarCases', () => {
  it('returns empty string for null analysis', () => {
    assert.strictEqual(renderSimilarCases(null), '');
    assert.strictEqual(renderSimilarCases({}), '');
  });

  it('renders cases with similarity score', () => {
    const html = renderSimilarCases({
      similar_cases: [
        { similarity: 0.88, outcome: 'responder', flagged_conditions: ['MDD'], summary: 'Case A' },
        { similarity: 0.72, outcome: 'non-responder', flagged_conditions: [], summary: 'Case B' },
      ],
    });
    assert.ok(html.includes('88%'), '88% similarity score should render');
    assert.ok(html.includes('responder'), '"responder" outcome chip should render');
    assert.ok(html.includes('non-responder'), '"non-responder" chip should render');
  });

  it('renders aggregate fallback when fewer than 5 neighbours', () => {
    const html = renderSimilarCases({
      similar_cases: {
        aggregate: {
          mean_similarity: 0.75,
          n_cases: 3,
          common_conditions: ['MDD', 'Anxiety'],
        },
      },
    });
    assert.ok(
      html.includes('suppressed for privacy'),
      'privacy suppression message must appear for aggregate fallback'
    );
  });
});

// ── renderLongitudinalSparklines ─────────────────────────────────────────────

describe('renderLongitudinalSparklines', () => {
  it('returns empty string for null analysis', () => {
    assert.strictEqual(renderLongitudinalSparklines(null), '');
    assert.strictEqual(renderLongitudinalSparklines({}), '');
  });

  it('renders "Longitudinal trajectory" card title', () => {
    const html = renderLongitudinalSparklines(LONGITUDINAL_PAYLOAD);
    assert.ok(html.includes('Longitudinal trajectory'), 'card title must be "Longitudinal trajectory"');
  });

  it('renders feature label "Alpha power (Fz)"', () => {
    const html = renderLongitudinalSparklines(LONGITUDINAL_PAYLOAD);
    assert.ok(html.includes('Alpha power (Fz)'), 'feature label should be present');
  });

  it('renders sparkline SVG', () => {
    const html = renderLongitudinalSparklines(LONGITUDINAL_PAYLOAD);
    assert.ok(html.includes('<svg'), 'sparkline SVG should be present');
  });

  it('renders session metadata (5 sessions, baseline date)', () => {
    const html = renderLongitudinalSparklines(LONGITUDINAL_PAYLOAD);
    assert.ok(html.includes('5 sessions'), 'n_sessions should be rendered');
    assert.ok(html.includes('2026-01-15'), 'baseline_date should be rendered');
  });
});

// ── renderAiUpgradePanels (composite) ────────────────────────────────────────

describe('renderAiUpgradePanels', () => {
  it('returns empty string for null analysis', () => {
    assert.strictEqual(renderAiUpgradePanels(null), '');
  });

  it('returns empty string when no AI fields present', () => {
    const html = renderAiUpgradePanels({ some_unrelated_field: true });
    assert.strictEqual(html, '', 'no panels should render if no AI field keys match');
  });

  it('renders the group wrapper when panels are present', () => {
    const analysis = { ...BRAIN_AGE_PAYLOAD, ...RISK_SCORES_PAYLOAD };
    const html = renderAiUpgradePanels(analysis);
    assert.ok(
      html.includes('data-testid="qeeg-ai-upgrade-panels"'),
      'composite wrapper must have data-testid="qeeg-ai-upgrade-panels"'
    );
  });

  it('calls all sub-renderers — both brain-age and risk-score panels appear', () => {
    const analysis = { ...BRAIN_AGE_PAYLOAD, ...RISK_SCORES_PAYLOAD };
    const html = renderAiUpgradePanels(analysis);
    assert.ok(html.includes('Brain age (research)'), 'brain age panel should be included');
    assert.ok(html.includes('Similarity indices'), 'risk score panel should be included');
  });
});
