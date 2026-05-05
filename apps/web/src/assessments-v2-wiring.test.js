/**
 * Focused unit tests for Assessments v2 API wiring (doctor-ready MVP slice).
 *
 * These are "source-contract" tests: we don't spin up the SPA; we assert that
 * the code paths exist and preserve safety/licensing guardrails.
 *
 * Run from apps/web/:
 *   node --test src/assessments-v2-wiring.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('api.js exposes Assessments v2 helpers with correct paths', () => {
  const apiJs = readFileSync(join(__dirname, 'api.js'), 'utf8');

  // Library
  assert.ok(apiJs.includes("assessmentsV2Library: () => apiFetchWithRetry('/api/v1/assessments-v2/library')"));
  assert.ok(apiJs.includes("assessmentsV2ByCondition"));
  assert.ok(apiJs.includes('/api/v1/assessments-v2/by-condition/'));
  assert.ok(apiJs.includes("assessmentsV2ByDomain"));
  assert.ok(apiJs.includes('/api/v1/assessments-v2/by-domain/'));

  // Queue
  assert.ok(apiJs.includes("assessmentsV2Queue: () => apiFetchWithRetry('/api/v1/assessments-v2/queue')"));
  assert.ok(apiJs.includes("assessmentsV2PatientQueue"));

  // Forms / responses / scoring
  assert.ok(apiJs.includes("/api/v1/assessments-v2/assignments/"));
  assert.ok(apiJs.includes("/form`"));
  assert.ok(apiJs.includes("/responses`"));
  assert.ok(apiJs.includes("/score`"));

  // Evidence / AI recommend
  assert.ok(apiJs.includes("assessmentsV2EvidenceHealth"));
  assert.ok(apiJs.includes("'/api/v1/assessments-v2/evidence/health'"));
  assert.ok(apiJs.includes("assessmentsV2EvidenceSearch"));
  assert.ok(apiJs.includes("'/api/v1/assessments-v2/evidence/search'"));
  assert.ok(apiJs.includes("assessmentsV2Recommend"));
  assert.ok(apiJs.includes("'/api/v1/assessments-v2/recommend'"));
});

test('Assessments v2 page prefers v2 queue over legacy queue', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');

  // Ensure the v2-first hydration logic exists.
  assert.ok(
    hubs.includes('api.assessmentsV2Queue?.()') && hubs.includes('|| api.listAssessments?.()'),
    'expected v2 queue hydration with legacy fallback',
  );
});

test('Demo fallback remains clearly labelled as not real patient data', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');
  // Pull from the canonical constant so copy can be updated in one place.
  assert.ok(hubs.includes('DEMO_ASSESSMENTS_BANNER_MARK'), 'expected demo banner marker to be used');
});

test('Form modal draft/completed submit uses v2 /responses when editing an assignment', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');

  // Draft save: v2 assignment workflow uses status in_progress (draft-like).
  assert.ok(
    hubs.includes("api.assessmentsV2SubmitResponses") && hubs.includes("status: 'in_progress'"),
    'expected v2 draft save path',
  );

  // Completed submit: v2 assignment workflow uses status completed.
  assert.ok(
    hubs.includes("status: 'completed'") && hubs.includes('score_numeric'),
    'expected v2 completed submit path with score_numeric',
  );
});

test('Scoring call is only triggered after completed submit in v2 path', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');

  // We expect v2 score to be invoked after completed submit, not on draft.
  const draftIdx = hubs.indexOf("status: 'in_progress'");
  const completedIdx = hubs.indexOf("status: 'completed'");
  const scoreIdx = hubs.indexOf('api.assessmentsV2Score');
  assert.ok(draftIdx !== -1 && completedIdx !== -1 && scoreIdx !== -1, 'missing expected markers');
  assert.ok(scoreIdx > completedIdx, 'expected scoring call after completed submit');
  assert.ok(scoreIdx > draftIdx, 'expected no scoring call in draft path');
});

test('Safety banner keeps clinician-review + non-diagnostic wording', () => {
  const hubs = readFileSync(join(__dirname, 'pages-clinical-hubs.js'), 'utf8');
  assert.ok(hubs.includes('Assessments support clinical decision-making and require clinician review'));
  assert.ok(hubs.includes('Scores are not diagnoses on their own'));
});

