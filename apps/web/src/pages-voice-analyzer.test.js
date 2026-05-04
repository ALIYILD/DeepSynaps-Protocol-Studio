/**
 * Voice Analyzer — renderer and demo-banner regression tests (logic-only).
 *
 * Run: node --test src/pages-voice-analyzer.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  esc,
  renderVoiceReportHtml,
  voiceAnalyzerDemoFixtureBanner,
  voiceAnalyzerPreviewBuildBanner,
} from './pages-voice-analyzer.js';
import { ANALYZER_DEMO_FIXTURES } from './demo-fixtures-analyzers.js';

test('esc escapes HTML', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
});

test('voiceAnalyzerDemoFixtureBanner mentions demo data', () => {
  const html = voiceAnalyzerDemoFixtureBanner();
  assert.ok(html.includes('Demo'), 'banner should label demo');
});

test('renderVoiceReportHtml demo fixture shows demo/sample banner', () => {
  const html = renderVoiceReportHtml(ANALYZER_DEMO_FIXTURES.voice, { demoFixture: true });
  assert.ok(html.includes('Demo/sample payload'));
  assert.ok(html.includes('Literature-linked evidence packs'));
});

test('renderVoiceReportHtml stored report shows stored banner', () => {
  const minimal = {
    ok: true,
    analysis_id: 'test-analysis-id',
    voice_report: { qc: { snr_db: 22 }, decision_support: { disclaimer: 'DS only.' } },
    clinical_disclaimer: 'Clinical decision-support only.',
  };
  const html = renderVoiceReportHtml(minimal, { storedReport: true });
  assert.ok(html.includes('Stored analysis'));
});

test('voiceAnalyzerPreviewBuildBanner is empty without vite demo env', () => {
  assert.equal(voiceAnalyzerPreviewBuildBanner(), '');
});
