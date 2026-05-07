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
  resolveVoiceAnalyzerPatientContext,
  voiceAnalyzerAllowsLiveRole,
  voiceAnalyzerDemoFixtureBanner,
  voiceAnalyzerPreviewBuildBanner,
  voiceAnalyzerShouldAutoLoadStoredReport,
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

test('voice analyzer role gate allows clinician roles and rejects patient role', () => {
  assert.equal(voiceAnalyzerAllowsLiveRole('clinician'), true);
  assert.equal(voiceAnalyzerAllowsLiveRole('admin'), true);
  assert.equal(voiceAnalyzerAllowsLiveRole('patient'), false);
});

test('voice analyzer patient context requires selected clinic patient for live mode', () => {
  const liveBlocked = resolveVoiceAnalyzerPatientContext({
    selectedPatientId: '',
    overridePatientId: 'pt-live-123',
    demoMode: false,
    allowManualOverride: false,
  });
  assert.equal(liveBlocked.patientId, null);
  assert.match(liveBlocked.error, /clinic list|Select the patient/i);

  const liveSelected = resolveVoiceAnalyzerPatientContext({
    selectedPatientId: 'pt-123',
    overridePatientId: '',
    demoMode: false,
    allowManualOverride: false,
  });
  assert.equal(liveSelected.patientId, 'pt-123');
  assert.equal(liveSelected.error, null);
});

test('voice analyzer patient context permits demo override but rejects mismatch', () => {
  const demoOverride = resolveVoiceAnalyzerPatientContext({
    selectedPatientId: '',
    overridePatientId: 'demo-pt-1',
    demoMode: true,
    allowManualOverride: true,
  });
  assert.equal(demoOverride.patientId, 'demo-pt-1');

  const mismatch = resolveVoiceAnalyzerPatientContext({
    selectedPatientId: 'pt-a',
    overridePatientId: 'pt-b',
    demoMode: false,
    allowManualOverride: false,
  });
  assert.equal(mismatch.patientId, null);
  assert.match(mismatch.error, /must match/i);
});

test('voice analyzer stored report autoload respects patient scope', () => {
  assert.equal(voiceAnalyzerShouldAutoLoadStoredReport('pt-1', 'pt-1'), true);
  assert.equal(voiceAnalyzerShouldAutoLoadStoredReport('pt-1', 'pt-2'), false);
  assert.equal(voiceAnalyzerShouldAutoLoadStoredReport('', 'pt-2'), true);
});
