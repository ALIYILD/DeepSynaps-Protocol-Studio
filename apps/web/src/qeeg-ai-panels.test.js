// Tests for qeeg-ai-panels.js
// Pins exported renderers against known payloads. All renderers are pure
// (no DOM I/O required) and return HTML strings, so tests run under plain Node.

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

// Minimal DOM stub so the module doesn't crash on import-time side-effects.
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ innerHTML: '', appendChild: () => {}, style: {} }),
    body: { appendChild: () => {} },
  };
  globalThis.window = {};
  globalThis.WebSocket = undefined; // force offline mode
}

let renderBrainAgeCard,
    renderRiskScoreBars,
    renderCentileCurves,
    renderExplainabilityOverlay,
    renderSimilarCases,
    renderProtocolRecommendationCard,
    renderLongitudinalSparklines,
    renderAiUpgradePanels,
    mountCopilotWidget;

before(async () => {
  const mod = await import('./qeeg-ai-panels.js');
  renderBrainAgeCard             = mod.renderBrainAgeCard;
  renderRiskScoreBars            = mod.renderRiskScoreBars;
  renderCentileCurves            = mod.renderCentileCurves;
  renderExplainabilityOverlay    = mod.renderExplainabilityOverlay;
  renderSimilarCases             = mod.renderSimilarCases;
  renderProtocolRecommendationCard = mod.renderProtocolRecommendationCard;
  renderLongitudinalSparklines   = mod.renderLongitudinalSparklines;
  renderAiUpgradePanels          = mod.renderAiUpgradePanels;
  mountCopilotWidget             = mod.mountCopilotWidget;
});

// ── renderBrainAgeCard ────────────────────────────────────────────────────────
describe('renderBrainAgeCard', () => {
  it('returns empty string when analysis has no brain_age field', () => {
    assert.strictEqual(renderBrainAgeCard({}), '');
    assert.strictEqual(renderBrainAgeCard(null), '');
  });

  it('renders "Brain age (research)" title for valid payload', () => {
    const html = renderBrainAgeCard({
      brain_age: { predicted_years: 38, chronological_years: 35, gap_years: 3, gap_percentile: 72, confidence: 'moderate' }
    });
    assert.ok(html.includes('Brain age (research)'), 'expected section title');
  });

  it('renders predicted years in stats', () => {
    const html = renderBrainAgeCard({
      brain_age: { predicted_years: 38, chronological_years: 35, gap_years: 3, gap_percentile: 72, confidence: 'moderate' }
    });
    assert.ok(html.includes('38.0 y'), 'expected predicted age');
  });

  it('renders the regulatory footnote about research/wellness use', () => {
    const html = renderBrainAgeCard({
      brain_age: { predicted_years: 42, gap_percentile: 50 }
    });
    assert.ok(html.includes('Research/wellness use'), 'expected regulatory footnote');
  });

  it('renders stub badge when brain_age.is_stub === true', () => {
    const html = renderBrainAgeCard({
      brain_age: { predicted_years: 38, gap_percentile: 50, is_stub: true }
    });
    assert.ok(html.includes('Model not available'), 'expected stub badge text');
    assert.ok(html.includes('do not clinically use'), 'expected safety string');
  });

  it('renders gap sign correctly for positive gap', () => {
    const html = renderBrainAgeCard({
      brain_age: { predicted_years: 38, chronological_years: 35, gap_percentile: 72 }
    });
    assert.ok(html.includes('+3.0 y'), 'expected positive gap with sign');
  });
});

// ── renderRiskScoreBars ────────────────────────────────────────────────────────
describe('renderRiskScoreBars', () => {
  it('returns empty string when analysis has no risk_scores', () => {
    assert.strictEqual(renderRiskScoreBars({}), '');
    assert.strictEqual(renderRiskScoreBars(null), '');
  });

  it('renders "Similarity indices" title', () => {
    const html = renderRiskScoreBars({
      risk_scores: { mdd_like: { score: 0.71, ci95: [0.63, 0.79] } }
    });
    assert.ok(html.includes('Similarity indices'), 'expected section title');
  });

  it('renders the correct score percentage for mdd_like', () => {
    const html = renderRiskScoreBars({
      risk_scores: { mdd_like: { score: 0.71 } }
    });
    assert.ok(html.includes('71.0%'), 'expected score as percent');
  });

  it('renders CI text when ci95 present', () => {
    const html = renderRiskScoreBars({
      risk_scores: { mdd_like: { score: 0.71, ci95: [0.63, 0.79] } }
    });
    assert.ok(html.includes('CI 63'), 'expected CI lower bound');
    assert.ok(html.includes('79'), 'expected CI upper bound');
  });

  it('renders the "not establish any medical condition" disclaimer', () => {
    const html = renderRiskScoreBars({
      risk_scores: { adhd_like: { score: 0.4 } }
    });
    assert.ok(
      html.includes('not establish any medical condition') ||
      html.includes('neurophysiological similarity indices'),
      'expected disclaimer text'
    );
  });

  it('returns empty string when all risk_scores entries are absent from _RISK_ORDER', () => {
    const html = renderRiskScoreBars({ risk_scores: { unknown_key: { score: 0.5 } } });
    assert.strictEqual(html, '');
  });
});

// ── renderCentileCurves ───────────────────────────────────────────────────────
describe('renderCentileCurves', () => {
  it('returns empty string when no centiles', () => {
    assert.strictEqual(renderCentileCurves({}), '');
    assert.strictEqual(renderCentileCurves(null), '');
  });

  it('renders the "Centile curves (GAMLSS)" title for valid payload', () => {
    const html = renderCentileCurves({
      centiles: {
        spectral: {
          bands: {
            alpha: { absolute_uv2: { Cz: 75, Fz: 62 } }
          }
        }
      }
    });
    assert.ok(html.includes('Centile curves (GAMLSS)'), 'expected title');
  });

  it('renders channel names in table', () => {
    const html = renderCentileCurves({
      centiles: {
        spectral: {
          bands: {
            theta: { absolute_uv2: { Fz: 88 } }
          }
        }
      }
    });
    assert.ok(html.includes('Fz'), 'expected channel Fz');
  });

  it('includes norm_db_version when provided', () => {
    const html = renderCentileCurves({
      centiles: {
        norm_db_version: 'v2.1.0',
        spectral: {
          bands: {
            alpha: { absolute_uv2: { Cz: 50 } }
          }
        }
      }
    });
    assert.ok(html.includes('v2.1.0'), 'expected norm db version');
  });
});

// ── renderExplainabilityOverlay ───────────────────────────────────────────────
describe('renderExplainabilityOverlay', () => {
  it('returns empty string when no explainability', () => {
    assert.strictEqual(renderExplainabilityOverlay({}), '');
    assert.strictEqual(renderExplainabilityOverlay(null), '');
  });

  it('renders "Explainability (research)" title', () => {
    const html = renderExplainabilityOverlay({
      explainability: {
        method: 'integrated_gradients',
        adebayo_sanity_pass: true,
        per_risk_score: {
          mdd_like: {
            top_channels: [{ ch: 'F3', band: 'alpha', score: 0.8 }],
            channel_importance: {}
          }
        },
        ood_score: { percentile: 75, distance: 1.2, interpretation: 'in-distribution' }
      }
    });
    assert.ok(html.includes('Explainability (research)'), 'expected title');
  });

  it('shows OOD percentile in badge when risk scores present', () => {
    const html = renderExplainabilityOverlay({
      explainability: {
        ood_score: { percentile: 45, distance: 0.5, interpretation: 'borderline' },
        per_risk_score: {
          mdd_like: {
            top_channels: [{ ch: 'F3', band: 'alpha', score: 0.8 }],
            channel_importance: { F3: { alpha: 0.8 } }
          }
        },
        adebayo_sanity_pass: true,
      }
    });
    assert.ok(html.includes('45'), 'expected OOD percentile value 45');
  });

  it('shows Adebayo sanity check passed message', () => {
    const html = renderExplainabilityOverlay({
      explainability: {
        ood_score: {},
        per_risk_score: { mdd_like: { top_channels: [], channel_importance: {} } },
        adebayo_sanity_pass: true,
      }
    });
    assert.ok(html.includes('Adebayo sanity check: passed'), 'expected sanity pass text');
  });

  it('shows sanity-fail alert when adebayo_sanity_pass is false', () => {
    const html = renderExplainabilityOverlay({
      explainability: {
        ood_score: {},
        per_risk_score: {},
        adebayo_sanity_pass: false,
      }
    });
    assert.ok(html.includes('Attribution disabled'), 'expected sanity fail text');
  });
});

// ── renderSimilarCases ────────────────────────────────────────────────────────
describe('renderSimilarCases', () => {
  it('returns empty string for missing similar_cases', () => {
    assert.strictEqual(renderSimilarCases({}), '');
    assert.strictEqual(renderSimilarCases(null), '');
  });

  it('returns empty string for empty array', () => {
    assert.strictEqual(renderSimilarCases({ similar_cases: [] }), '');
  });

  it('renders "top-K" section title with count', () => {
    const html = renderSimilarCases({
      similar_cases: [
        { similarity: 0.85, outcome: 'responder', flagged_conditions: ['MDD'] },
        { similarity: 0.72, outcome: 'non-responder', flagged_conditions: [] },
      ]
    });
    assert.ok(html.includes('Similar cases (top-2)'), 'expected top-K count');
  });

  it('renders responder outcome chip', () => {
    const html = renderSimilarCases({
      similar_cases: [{ similarity: 0.9, outcome: 'responder' }]
    });
    assert.ok(html.includes('responder'), 'expected responder label');
  });

  it('renders aggregate cohort card for K < 5 privacy fallback', () => {
    const html = renderSimilarCases({
      similar_cases: {
        aggregate: {
          mean_similarity: 0.78,
          n_cases: 3,
          common_conditions: ['MDD', 'PTSD']
        }
      }
    });
    // The renderer escapes and lowercases strings — check case-insensitively.
    assert.ok(html.toLowerCase().includes('aggregate cohort'), 'expected aggregate title');
    assert.ok(html.toLowerCase().includes('fewer than 5'), 'expected privacy suppression message');
  });
});

// ── renderProtocolRecommendationCard ─────────────────────────────────────────
describe('renderProtocolRecommendationCard', () => {
  it('returns empty string when no protocol_recommendation', () => {
    assert.strictEqual(renderProtocolRecommendationCard({}), '');
    assert.strictEqual(renderProtocolRecommendationCard(null), '');
  });

  it('renders "Protocol recommendation (research)" title', () => {
    const html = renderProtocolRecommendationCard({
      protocol_recommendation: {
        primary_modality: 'rTMS',
        target_region: 'L-DLPFC',
        confidence: 'high',
        dose: { sessions: 30, intensity: '120% MT', duration_min: 30, frequency: '5x/week' },
        session_plan: {},
        contraindications: ['seizure history', 'pacemaker'],
        expected_response_window_weeks: [3, 6],
        citations: [],
      }
    });
    assert.ok(html.includes('Protocol recommendation (research)'), 'expected title');
  });

  it('renders primary modality name', () => {
    const html = renderProtocolRecommendationCard({
      protocol_recommendation: { primary_modality: 'rTMS', target_region: 'L-DLPFC', session_plan: {} }
    });
    assert.ok(html.includes('rTMS'), 'expected modality');
  });

  it('renders contraindication pills', () => {
    const html = renderProtocolRecommendationCard({
      protocol_recommendation: {
        primary_modality: 'TMS',
        session_plan: {},
        contraindications: ['pacemaker'],
      }
    });
    assert.ok(html.includes('pacemaker'), 'expected contraindication');
  });

  it('renders clinician-review disclaimer', () => {
    const html = renderProtocolRecommendationCard({
      protocol_recommendation: { primary_modality: 'tDCS', session_plan: {} }
    });
    assert.ok(html.includes('Clinician review'), 'expected review disclaimer');
  });
});

// ── renderLongitudinalSparklines ──────────────────────────────────────────────
describe('renderLongitudinalSparklines', () => {
  it('returns empty string when no longitudinal', () => {
    assert.strictEqual(renderLongitudinalSparklines({}), '');
    assert.strictEqual(renderLongitudinalSparklines(null), '');
  });

  it('renders "Longitudinal trajectory" section title', () => {
    const html = renderLongitudinalSparklines({
      longitudinal: {
        n_sessions: 12,
        feature_trajectories: {
          alpha_Cz: { label: 'Alpha Cz', values: [1.2, 1.5, 1.8, 2.0], significant: true }
        }
      }
    });
    assert.ok(html.includes('Longitudinal trajectory'), 'expected title');
  });

  it('renders feature label', () => {
    const html = renderLongitudinalSparklines({
      longitudinal: {
        feature_trajectories: {
          alpha_Cz: { label: 'Alpha Cz', values: [1.2, 1.5, 1.8, 2.0] }
        }
      }
    });
    assert.ok(html.includes('Alpha Cz'), 'expected feature label');
  });

  it('renders session metadata (n_sessions)', () => {
    const html = renderLongitudinalSparklines({
      longitudinal: {
        n_sessions: 8,
        feature_trajectories: {
          theta_Fz: { values: [3.1, 2.9, 2.7, 2.5] }
        }
      }
    });
    assert.ok(html.includes('8 sessions'), 'expected session count');
  });
});

// ── renderAiUpgradePanels (composite) ────────────────────────────────────────
describe('renderAiUpgradePanels', () => {
  it('returns empty string for null analysis', () => {
    assert.strictEqual(renderAiUpgradePanels(null), '');
  });

  it('returns empty string when no AI fields present', () => {
    assert.strictEqual(renderAiUpgradePanels({}), '');
  });

  it('wraps content in qeeg-ai-group when panels render', () => {
    const html = renderAiUpgradePanels({
      brain_age: { predicted_years: 38, gap_percentile: 72 }
    });
    assert.ok(html.includes('qeeg-ai-group'), 'expected wrapper class');
  });

  it('includes data-testid="qeeg-ai-upgrade-panels" on wrapper', () => {
    const html = renderAiUpgradePanels({
      brain_age: { predicted_years: 38, gap_percentile: 72 }
    });
    assert.ok(html.includes('data-testid="qeeg-ai-upgrade-panels"'), 'expected testid');
  });

  it('renders multiple sections when analysis has multiple AI fields', () => {
    const html = renderAiUpgradePanels({
      brain_age: { predicted_years: 38, gap_percentile: 72 },
      risk_scores: { mdd_like: { score: 0.71 } },
    });
    assert.ok(html.includes('Brain age'), 'expected brain-age section');
    assert.ok(html.includes('Similarity indices'), 'expected risk-score section');
  });
});

// ── mountCopilotWidget ────────────────────────────────────────────────────────
describe('mountCopilotWidget', () => {
  it('returns null when document is unavailable', () => {
    // In our stub, getElementById returns null for unknown IDs.
    const result = mountCopilotWidget('nonexistent-container', 'demo');
    assert.strictEqual(result, null);
  });
});
