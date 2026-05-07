import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBrainTwinAnalysisState,
  buildBrainTwinSimulationState,
  renderBrainTwinAnalysisNotice,
  renderBrainTwinCorrelationPairs,
  renderBrainTwinSimulationNotice,
} from './pages-brain-twin.js';

test('legacy brain-twin surfaces explicit withheld analysis states for clinician payloads', () => {
  const analysis = {
    prediction: {
      available: false,
      status: 'not_implemented',
      reason: 'no_validated_prediction_model',
      summary: 'Prediction output is withheld until a validated DeepTwin model is connected.',
    },
    correlation: {
      available: false,
      status: 'withheld',
      reason: 'persisted_analysis_required',
      summary: 'Correlation ranking is withheld until persisted analysis rows are available.',
      priority_pairs: [],
    },
    causation: {
      available: false,
      status: 'withheld',
      reason: 'persisted_analysis_required',
      summary: 'Causal hypothesis output is withheld until persisted analysis rows are available.',
      hypotheses: [],
    },
  };

  const state = buildBrainTwinAnalysisState(analysis);
  assert.equal(state?.kind, 'unavailable');
  assert.deepEqual(state?.sections, ['prediction', 'correlation', 'causation']);

  const noticeHtml = renderBrainTwinAnalysisNotice(analysis);
  assert.match(noticeHtml, /DeepTwin analysis output withheld/i);
  assert.match(noticeHtml, /validated DeepTwin model is connected/i);
  assert.match(noticeHtml, /status: not_implemented/i);
  assert.match(noticeHtml, /reason: no_validated_prediction_model/i);

  const corrHtml = renderBrainTwinCorrelationPairs([], analysis);
  assert.match(corrHtml, /Correlation pair ranking unavailable/i);
  assert.match(corrHtml, /persisted analysis rows are available/i);
  assert.equal(corrHtml.includes('Correlation pairs will appear after analysis runs.'), false);
});

test('legacy brain-twin preserves normal stub content when analysis output is available', () => {
  const analysis = {
    prediction: {
      key_predictions: [{ title: 'Predicted response', summary: 'Improvement expected' }],
    },
    correlation: {
      priority_pairs: [
        { left: 'qEEG theta/beta', right: 'Assessment burden', score: 0.72, interpretation: 'moves together' },
      ],
    },
    causation: {
      hypotheses: [{ title: 'Mechanism', summary: 'Observed trend', confidence: 0.61 }],
    },
  };

  assert.equal(buildBrainTwinAnalysisState(analysis), null);
  assert.equal(renderBrainTwinAnalysisNotice(analysis), '');

  const corrHtml = renderBrainTwinCorrelationPairs(analysis.correlation.priority_pairs, analysis);
  assert.match(corrHtml, /qEEG theta\/beta/i);
  assert.match(corrHtml, /\+0\.72/);
  assert.equal(corrHtml.includes('Correlation pair ranking unavailable.'), false);
});

test('legacy brain-twin surfaces explicit withheld simulation states for clinician payloads', () => {
  const simulation = {
    available: false,
    status: 'withheld',
    reason: 'no_validated_simulation_engine',
    summary: 'DeepTwin simulation output is withheld for real patient rows until a validated simulation engine is connected.',
    outputs: {
      clinical_forecast: {
        available: false,
        status: 'withheld',
        reason: 'no_validated_simulation_engine',
        summary: 'DeepTwin simulation output is withheld for real patient rows until a validated simulation engine is connected.',
      },
      biomarker_forecast: [],
      timecourse: [],
    },
  };

  const state = buildBrainTwinSimulationState(simulation);
  assert.equal(state?.kind, 'unavailable');
  assert.equal(state?.reason, 'no_validated_simulation_engine');

  const noticeHtml = renderBrainTwinSimulationNotice(simulation);
  assert.match(noticeHtml, /Simulation output withheld/i);
  assert.match(noticeHtml, /validated simulation engine is connected/i);
  assert.match(noticeHtml, /status: withheld/i);
  assert.match(noticeHtml, /reason: no_validated_simulation_engine/i);
});
