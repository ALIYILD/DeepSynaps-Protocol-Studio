// ─────────────────────────────────────────────────────────────────────────────
// pages-qeeg-analysis-ai-upgrades.test.js
//
// Tests for the Contract V2 AI upgrade renderers shipped in qeeg-ai-panels.js
// plus the extended DEMO_QEEG_ANALYSIS payload in pages-qeeg-analysis.js.
//
// Run: npm run test:unit
// ─────────────────────────────────────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
globalThis.DEEPSYNAPS_ENABLE_AI_UPGRADES = true;
globalThis.DEEPSYNAPS_ENABLE_MNE = true;

const panels = await import('./qeeg-ai-panels.js');
const pagesMod = await import('./pages-qeeg-analysis.js');
const {
  renderBrainAgeCard,
  renderRiskScoreBars,
  renderCentileCurves,
  renderExplainabilityOverlay,
  renderSimilarCases,
  renderProtocolRecommendationCard,
  renderLongitudinalSparklines,
  renderAiUpgradePanels,
  _copilotOfflineReplyForTest,
} = panels;

// Pull the demo analysis object out of the page module via renderAiUpgradePanels.
// We don't export DEMO_QEEG_ANALYSIS directly, so build a fixture that mirrors
// the shape (mirrors the Contract V2 §1 demo additions).
const DEMO = {
  id: 'demo',
  brain_age: {
    predicted_years: 38, chronological_years: 35, gap_years: 3.0,
    gap_percentile: 72, confidence: 'moderate',
    electrode_importance: { Fp1: 0.38, Fz: 0.82, Pz: 0.68, O1: 0.72, O2: 0.71 },
  },
  risk_scores: {
    mdd_like:               { score: 0.71, ci95: [0.63, 0.79] },
    adhd_like:              { score: 0.42, ci95: [0.34, 0.50] },
    anxiety_like:           { score: 0.58, ci95: [0.50, 0.66] },
    cognitive_decline_like: { score: 0.22, ci95: [0.14, 0.30] },
    tbi_residual_like:      { score: 0.18, ci95: [0.10, 0.26] },
    insomnia_like:          { score: 0.34, ci95: [0.26, 0.42] },
    disclaimer: 'These are neurophysiological similarity indices; they do not establish any medical condition.',
  },
  centiles: {
    spectral: { bands: {
      theta: { absolute_uv2: { Fz: 92, Cz: 88 }, relative: { Fz: 75, Cz: 70 } },
      alpha: { absolute_uv2: { Pz: 99, O1: 99 }, relative: { Pz: 85, O1: 85 } },
    } },
    norm_db_version: 'gamlss-v1',
  },
  explainability: {
    per_risk_score: {
      mdd_like: {
        channel_importance: { F3: { alpha: 0.82, theta: 0.1 }, F4: { alpha: 0.74 } },
        top_channels: [
          { ch: 'F3', band: 'alpha', score: 0.82 },
          { ch: 'F4', band: 'alpha', score: 0.74 },
          { ch: 'Fz', band: 'theta', score: 0.55 },
        ],
      },
    },
    ood_score: { percentile: 32, distance: 0.41, interpretation: 'within training distribution' },
    adebayo_sanity_pass: true,
    method: 'integrated_gradients',
  },
  similar_cases: [
    { similarity: 0.94, age_bucket: '30–39', sex: 'F',
      flagged_conditions: ['MDD'], outcome: 'responder', summary: 'Example case 1.' },
    { similarity: 0.87, age_bucket: '20–29', sex: 'M',
      flagged_conditions: ['MDD', 'ADHD'], outcome: 'non-responder', summary: 'Example case 2.' },
  ],
  protocol_recommendation: {
    primary_modality: 'rtms_10hz',
    target_region: 'L_DLPFC',
    rationale: 'Demo rationale.',
    dose: { sessions: 20, intensity: '120% RMT', duration_min: 37, frequency: '5x / week' },
    session_plan: {
      induction:     { sessions: 8,  notes: 'Induction notes.' },
      consolidation: { sessions: 12, notes: 'Consolidation notes.' },
      maintenance:   { sessions: 1,  notes: 'Monthly booster.' },
    },
    contraindications: ['pacemaker'],
    expected_response_window_weeks: [3, 6],
    citations: [
      { n: 1, pmid: '21890290', title: 'Frontal EEG theta and inattention', year: 2011,
        url: 'https://pubmed.ncbi.nlm.nih.gov/21890290/' },
    ],
    confidence: 'moderate',
    alternative_protocols: [],
  },
  longitudinal: {
    n_sessions: 3,
    baseline_date: '2026-02-10',
    days_since_baseline: 72,
    feature_trajectories: {
      fz_theta: {
        label: 'Fz theta (z)', values: [2.1, 1.72, 1.38],
        dates: ['2026-02-10', '2026-03-15', '2026-04-20'],
        slope: -0.36, rci: 1.92, significant: true,
      },
    },
    normative_distance_trajectory: {
      values: [0.62, 0.51, 0.41],
      dates: ['2026-02-10', '2026-03-15', '2026-04-20'],
    },
  },
};

// Banned words per CONTRACT_V2.md §7. Risk scores are "similarity indices".
const BANNED = /\b(diagnose|diagnostic|diagnosis|treatment recommendation|probability of disease)\b/i;

function assertNoBanned(html, where) {
  assert.ok(!BANNED.test(html),
    'banned word detected in ' + where + ': ' + (html.match(BANNED) || [''])[0]);
}

// ── Brain-age card ──────────────────────────────────────────────────────────
test('renderBrainAgeCard shows predicted, chronological, gap and percentile', () => {
  const html = renderBrainAgeCard(DEMO);
  assert.ok(html.includes('Brain age'));
  assert.ok(html.includes('38.0 y'));      // predicted
  assert.ok(html.includes('35 y'));         // chronological
  assert.ok(html.includes('+3.0 y'));       // gap
  assert.ok(html.includes('72th pct'));     // percentile
  assert.ok(html.includes('moderate'));
  assert.ok(html.includes('Electrode importance'));
  assertNoBanned(html, 'renderBrainAgeCard');
});

test('renderBrainAgeCard returns empty string for missing brain_age', () => {
  assert.equal(renderBrainAgeCard({}), '');
  assert.equal(renderBrainAgeCard(null), '');
  assert.equal(renderBrainAgeCard({ id: 'x' }), '');
});

// ── Risk-score bars ─────────────────────────────────────────────────────────
test('renderRiskScoreBars uses similarity-index language and shows disclaimer', () => {
  const html = renderRiskScoreBars(DEMO);
  assert.ok(html.includes('Similarity indices'),
    'panel title must use similarity-index wording');
  assert.ok(html.includes('MDD-like'));
  assert.ok(html.includes('ADHD-like'));
  assert.ok(html.includes('Anxiety-like'));
  assert.ok(html.includes('71.0%')); // mdd score
  // Required disclaimer: similarity indices do not establish a condition
  // (regulatory-safe wording per CONTRACT_V2 §7).
  assert.ok(html.includes('do not establish any medical condition'));
  assert.ok(html.includes('similarity indices'));
  assertNoBanned(html, 'renderRiskScoreBars');
});

test('renderRiskScoreBars returns empty string for missing risk_scores', () => {
  assert.equal(renderRiskScoreBars({}), '');
  assert.equal(renderRiskScoreBars(null), '');
});

// ── Centile curves ──────────────────────────────────────────────────────────
test('renderCentileCurves renders per-channel pills with centile values', () => {
  const html = renderCentileCurves(DEMO);
  assert.ok(html.includes('Centile curves'));
  assert.ok(html.includes('qeeg-ai-centile-pill'));
  assert.ok(html.includes('gamlss-v1'));
  assertNoBanned(html, 'renderCentileCurves');
});

test('renderCentileCurves returns empty string for missing centiles', () => {
  assert.equal(renderCentileCurves({}), '');
  assert.equal(renderCentileCurves(null), '');
});

// ── Explainability overlay ──────────────────────────────────────────────────
test('renderExplainabilityOverlay shows OOD + per-risk top channels when sanity passes', () => {
  const html = renderExplainabilityOverlay(DEMO);
  assert.ok(html.includes('OOD percentile'));
  assert.ok(html.includes('32'));
  assert.ok(html.includes('within training distribution'));
  assert.ok(html.includes('Adebayo sanity check: passed'));
  // When sanity passes, the "Attribution disabled" banner must NOT render.
  assert.ok(!html.includes('Attribution disabled'),
    'Attribution disabled banner must not render when adebayo_sanity_pass=true');
  assert.ok(html.includes('integrated_gradients'));
  assertNoBanned(html, 'renderExplainabilityOverlay (pass)');
});

test('renderExplainabilityOverlay disables topomap and shows banner on Adebayo fail', () => {
  const failDemo = Object.assign({}, DEMO, {
    explainability: Object.assign({}, DEMO.explainability, { adebayo_sanity_pass: false }),
  });
  const html = renderExplainabilityOverlay(failDemo);
  assert.ok(html.includes('Attribution disabled (sanity check failed)'));
  // Mini topomap should NOT render when sanity fails — no svg topomap.
  assert.ok(!html.includes('qeeg-ai-topomap'),
    'topomap must be hidden when Adebayo sanity fails');
  assertNoBanned(html, 'renderExplainabilityOverlay (fail)');
});

test('renderExplainabilityOverlay returns empty string for missing explainability', () => {
  assert.equal(renderExplainabilityOverlay({}), '');
  assert.equal(renderExplainabilityOverlay(null), '');
});

// ── Similar cases ───────────────────────────────────────────────────────────
test('renderSimilarCases renders one card per case with outcome badge', () => {
  const html = renderSimilarCases(DEMO);
  assert.ok(html.includes('Similar cases'));
  assert.ok(html.includes('94%'));
  assert.ok(html.includes('responder'));
  assert.ok(html.includes('non-responder'));
  assert.ok(html.includes('MDD'));
  assertNoBanned(html, 'renderSimilarCases');
});

test('renderSimilarCases falls back to aggregate card when payload is {aggregate: ...}', () => {
  const html = renderSimilarCases({
    similar_cases: { aggregate: { mean_similarity: 0.82, n_cases: 3,
      common_conditions: ['MDD', 'anxiety'] } },
  });
  assert.ok(html.includes('Aggregate cohort'));
  assert.ok(html.includes('suppressed for privacy'));
});

test('renderSimilarCases returns empty string for missing similar_cases', () => {
  assert.equal(renderSimilarCases({}), '');
  assert.equal(renderSimilarCases(null), '');
  assert.equal(renderSimilarCases({ similar_cases: [] }), '');
});

// ── Protocol recommendation ─────────────────────────────────────────────────
test('renderProtocolRecommendationCard shows modality, dose, S-O-Z-O plan, and citations', () => {
  const html = renderProtocolRecommendationCard(DEMO);
  assert.ok(html.includes('rtms_10hz'));     // primary_modality literal
  assert.ok(html.includes('L_DLPFC'));
  assert.ok(html.includes('S · Induction'));
  assert.ok(html.includes('O · Consolidation'));
  assert.ok(html.includes('Z/O · Maintenance'));
  assert.ok(html.includes('8</strong> sessions'));   // induction dose
  assert.ok(html.includes('12</strong> sessions'));  // consolidation dose
  assert.ok(html.includes('pacemaker'));
  assert.ok(html.includes('21890290'));              // PubMed id in url
  assert.ok(html.includes('3–6 weeks'));
  assert.ok(html.includes('confidence: moderate'));
  assertNoBanned(html, 'renderProtocolRecommendationCard');
});

test('renderProtocolRecommendationCard returns empty string for missing protocol_recommendation', () => {
  assert.equal(renderProtocolRecommendationCard({}), '');
  assert.equal(renderProtocolRecommendationCard(null), '');
});

// ── Longitudinal sparklines ─────────────────────────────────────────────────
test('renderLongitudinalSparklines renders per-feature sparklines', () => {
  const html = renderLongitudinalSparklines(DEMO);
  assert.ok(html.includes('Longitudinal trajectory'));
  assert.ok(html.includes('Fz theta (z)'));
  assert.ok(html.includes('qeeg-ai-sparkline'));
  assert.ok(html.includes('Normative distance'));
  assertNoBanned(html, 'renderLongitudinalSparklines');
});

test('renderLongitudinalSparklines returns empty string for missing longitudinal', () => {
  assert.equal(renderLongitudinalSparklines({}), '');
  assert.equal(renderLongitudinalSparklines(null), '');
});

// ── Composite renderer ──────────────────────────────────────────────────────
test('renderAiUpgradePanels composes all 7 renderers when full payload is present', () => {
  const html = renderAiUpgradePanels(DEMO);
  assert.ok(html.includes('Brain age'));
  assert.ok(html.includes('Similarity indices'));
  assert.ok(html.includes('Centile curves'));
  assert.ok(html.includes('Explainability'));
  assert.ok(html.includes('Similar cases'));
  assert.ok(html.includes('Protocol recommendation'));
  assert.ok(html.includes('Longitudinal trajectory'));
  assert.ok(html.includes('qeeg-ai-upgrade-panels'));
  assertNoBanned(html, 'renderAiUpgradePanels');
});

test('renderAiUpgradePanels returns empty string for empty analysis', () => {
  assert.equal(renderAiUpgradePanels({}), '');
  assert.equal(renderAiUpgradePanels(null), '');
});

// ── Banned-word scan across ALL renderers (per CONTRACT_V2 §7) ──────────────
test('no banned regulatory words appear in any renderer output', () => {
  const outputs = {
    brainAge:       renderBrainAgeCard(DEMO),
    riskScores:     renderRiskScoreBars(DEMO),
    centiles:       renderCentileCurves(DEMO),
    explainability: renderExplainabilityOverlay(DEMO),
    similarCases:   renderSimilarCases(DEMO),
    protocol:       renderProtocolRecommendationCard(DEMO),
    longitudinal:   renderLongitudinalSparklines(DEMO),
    composite:      renderAiUpgradePanels(DEMO),
  };
  Object.keys(outputs).forEach((name) => {
    assertNoBanned(outputs[name], name);
  });
});

// ── Copilot offline reply tail + dangerous-query refusal ────────────────────
test('copilot offline replies always end with clinician handoff line', () => {
  const queries = [
    'Explain the brain-age gap',
    'Why MDD-like?',
    'What protocol do you suggest?',
    'Show similar cases',
    'How should I manually review this qEEG?',
    'What should I check before interpreting coherence?',
    'Totally unrelated question about the weather',
  ];
  queries.forEach((q) => {
    const r = _copilotOfflineReplyForTest(q);
    assert.ok(r.includes('consult your clinician'),
      'reply to "' + q + '" missing clinician handoff: ' + r);
  });
});

test('copilot refuses dangerous queries with clinician handoff', () => {
  const r = _copilotOfflineReplyForTest('how can I kill myself?');
  assert.ok(r.toLowerCase().includes("can't help"));
  assert.ok(r.includes('consult your clinician'));
});

test('copilot manual-review helpers include workflow and clinician-review caveats', () => {
  const manual = _copilotOfflineReplyForTest('How should I manually review this qEEG?');
  assert.match(manual, /montage/i);
  assert.match(manual, /artifact/i);
  assert.match(manual, /clinician review required/i);

  const coherence = _copilotOfflineReplyForTest('What should I check before interpreting coherence?');
  assert.match(coherence, /reference choice/i);
  assert.match(coherence, /volume conduction/i);
  assert.match(coherence, /clinician review required/i);
});

// ── Feature flag plumbing ───────────────────────────────────────────────────
test('_aiUpgradesFeatureFlagEnabled defaults to true', () => {
  // Unset any override so we exercise the default branch.
  delete globalThis.window.DEEPSYNAPS_ENABLE_AI_UPGRADES;
  assert.equal(pagesMod._aiUpgradesFeatureFlagEnabled(), true);
  globalThis.window.DEEPSYNAPS_ENABLE_AI_UPGRADES = false;
  assert.equal(pagesMod._aiUpgradesFeatureFlagEnabled(), false);
  globalThis.window.DEEPSYNAPS_ENABLE_AI_UPGRADES = true;
  assert.equal(pagesMod._aiUpgradesFeatureFlagEnabled(), true);
});
