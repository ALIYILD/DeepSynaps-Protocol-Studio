/**
 * Prior finalized-session comparison coverage.
 *
 * Scenario groups:
 * - clinician read-only load and card rendering
 * - honest empty and error states
 * - selection of 1-3 prior sessions with side-by-side comparison
 * - deterministic advisory AI historical summary
 * - read-only historical comparison export
 * - patient-hidden comparison UI
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { api } from './api.js';
import { setCurrentUser } from './auth.js';
import {
  pgVideoAssessments,
  VIDEO_ASSESSMENT_SESSION_STORAGE_KEY,
} from './pages-video-assessments.js';
import { createEmptySession, VIDEO_ASSESSMENT_TASKS } from './video-assessment-protocol.js';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="content"></div></body></html>', {
    url: 'https://example.test/video-assessments',
  });

  const safeGlobal = (name) => {
    try {
      return globalThis[name];
    } catch (_) {
      return undefined;
    }
  };

  const previous = {
    window: safeGlobal('window'),
    document: safeGlobal('document'),
    sessionStorage: safeGlobal('sessionStorage'),
    localStorage: safeGlobal('localStorage'),
    requestAnimationFrame: safeGlobal('requestAnimationFrame'),
    Event: safeGlobal('Event'),
    HTMLElement: safeGlobal('HTMLElement'),
    Node: safeGlobal('Node'),
    URL: safeGlobal('URL'),
    File: safeGlobal('File'),
    Blob: safeGlobal('Blob'),
    open: safeGlobal('open'),
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.requestAnimationFrame = (cb) => cb();
  globalThis.Event = dom.window.Event;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  globalThis.URL = dom.window.URL;
  globalThis.File = dom.window.File;
  globalThis.Blob = dom.window.Blob;
  globalThis.open = dom.window.open?.bind(dom.window);

  return {
    window: dom.window,
    document: dom.window.document,
    restore() {
      setCurrentUser(null);
      dom.window.close();
      globalThis.window = previous.window;
      globalThis.document = previous.document;
      globalThis.sessionStorage = previous.sessionStorage;
      globalThis.localStorage = previous.localStorage;
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
      globalThis.Event = previous.Event;
      globalThis.HTMLElement = previous.HTMLElement;
      globalThis.Node = previous.Node;
      globalThis.URL = previous.URL;
      globalThis.File = previous.File;
      globalThis.Blob = previous.Blob;
      globalThis.open = previous.open;
    },
  };
}

function installExportWindowStub(win) {
  const written = { html: '' };
  const popup = {
    document: {
      open() {
        written.html = '';
      },
      write(chunk) {
        written.html += String(chunk);
      },
      close() {},
    },
    focus() {},
  };
  const originalOpen = win.open;
  win.open = () => popup;
  globalThis.open = win.open.bind(win);
  return {
    popup,
    written,
    restore() {
      win.open = originalOpen;
      globalThis.open = win.open?.bind(win);
    },
  };
}

function stubVideoAssessmentApi(overrides = {}) {
  const saved = {
    listPatients: api.listPatients,
    getVideoAssessmentPriorFinalizedSessions: api.getVideoAssessmentPriorFinalizedSessions,
    generateVideoAssessmentHistoricalAiSummary: api.generateVideoAssessmentHistoricalAiSummary,
    getVideoAssessmentHistoricalAiSummaryFeedback: api.getVideoAssessmentHistoricalAiSummaryFeedback,
    saveVideoAssessmentHistoricalAiSummaryFeedback: api.saveVideoAssessmentHistoricalAiSummaryFeedback,
  };

  api.listPatients = overrides.listPatients ?? (async () => ({
    items: [{ id: 'pt-1', display_name: 'Patient One' }],
  }));
  api.getVideoAssessmentPriorFinalizedSessions =
    overrides.getVideoAssessmentPriorFinalizedSessions ??
    (async () => ({ sessions: [] }));
  api.generateVideoAssessmentHistoricalAiSummary =
    overrides.generateVideoAssessmentHistoricalAiSummary ??
    (async () => makeHistoricalAiSummary({ sessionCount: 1, sourceSessionIds: ['sess-prior-1'] }));
  api.getVideoAssessmentHistoricalAiSummaryFeedback =
    overrides.getVideoAssessmentHistoricalAiSummaryFeedback ??
    (async () => ({
      has_feedback: false,
      summary_event_id: 'va-historical-summary-test',
      feedback_status: '',
      feedback_note: null,
      updated_at: null,
      actor_role: 'clinician',
    }));
  api.saveVideoAssessmentHistoricalAiSummaryFeedback =
    overrides.saveVideoAssessmentHistoricalAiSummaryFeedback ??
    (async (_, data) => makeHistoricalAiSummaryFeedback({ ...data, summaryEventId: data?.summary_event_id }));

  return () => {
    Object.assign(api, saved);
  };
}

function makeStoredPersistedSession({
  id = 'sess-current-1',
  patientId = 'pt-1',
  overallStatus = 'in_progress',
} = {}) {
  return createEmptySession({
    id,
    patient_id: patientId,
    overall_status: overallStatus,
  });
}

function makePriorSession({
  sessionId,
  occurredAt,
  severity = 'mild',
  keyFindings = 'Stable longitudinal review.',
  tasksCompleted = 8,
  tasksTotal = VIDEO_ASSESSMENT_TASKS.length,
  hasClips = true,
  finalizedBy = 'Clinician',
  finalizedAt,
  summary,
} = {}) {
  return {
    session_id: sessionId,
    occurred_at: occurredAt,
    overall_status: 'finalized',
    has_clips: hasClips,
    summary: summary ?? {
      key_findings: keyFindings,
      severity_level: severity,
      tasks_completed: tasksCompleted,
      tasks_total: tasksTotal,
    },
    finalized_by: finalizedBy,
    finalized_at: finalizedAt || occurredAt,
  };
}

function makeTrendSession({
  sessionId,
  occurredAt,
  finalizedAt,
  severityLevel = 'mild',
  tasksCompleted = 8,
  tasksTotal = VIDEO_ASSESSMENT_TASKS.length,
  hasClips = true,
} = {}) {
  return {
    session_id: sessionId,
    occurred_at: occurredAt,
    finalized_at: finalizedAt || occurredAt,
    severity_level: severityLevel,
    tasks_completed: tasksCompleted,
    tasks_total: tasksTotal,
    has_clips: hasClips,
  };
}

function makeHistoricalAiSummary({
  summaryText = 'Severity appears stable across available finalized sessions.',
  trendObservations = ['Severity appears stable across available finalized sessions.'],
  limitations = ['This summary uses compact finalized-session comparison fields only.'],
  summaryStatus = 'fresh',
  sessionCount = 2,
  hasSeverityData = true,
  hasTaskCompletionData = true,
  hasClipAvailabilityData = true,
  logicVersion = 'video_assessment_historical_summary_v2',
  sourceInputFingerprint = 'fingerprint-test-1',
  sourceSessionIds = null,
} = {}) {
  return {
    summary_status: summaryStatus,
    summary_text: summaryText,
    trend_observations: trendObservations,
    data_basis: {
      session_count: sessionCount,
      has_severity_data: hasSeverityData,
      has_task_completion_data: hasTaskCompletionData,
      has_clip_availability_data: hasClipAvailabilityData,
    },
    limitations,
    generated_at: '2026-05-07T12:00:00Z',
    provenance: {
      event_id: 'va-historical-summary-test',
      summary_logic_version: logicVersion,
      source_session_ids: sourceSessionIds || ['sess-prior-1', 'sess-prior-2'].slice(0, sessionCount),
      session_count: sessionCount,
      source_input_fingerprint: sourceInputFingerprint,
    },
  };
}

function makeHistoricalAiSummaryFeedback({
  summaryEventId = 'va-historical-summary-test',
  feedbackStatus = 'accepted',
  feedbackNote = 'Useful longitudinal framing.',
  actorRole = 'clinician',
  updatedAt = '2026-05-07T12:30:00Z',
  hasFeedback = true,
} = {}) {
  return {
    has_feedback: hasFeedback,
    summary_event_id: summaryEventId,
    feedback_status: feedbackStatus,
    feedback_note: feedbackNote,
    updated_at: updatedAt,
    actor_role: actorRole,
  };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function mountVideoPage({
  role = 'clinician',
  session = makeStoredPersistedSession(),
  apiOverrides = {},
} = {}) {
  const env = installDom();
  const restoreApi = stubVideoAssessmentApi(apiOverrides);
  setCurrentUser({
    role,
    display_name: `${role} user`,
    email: `${role}@example.test`,
  });
  if (session) {
    env.window.sessionStorage.setItem(
      VIDEO_ASSESSMENT_SESSION_STORAGE_KEY,
      JSON.stringify(session),
    );
    env.window.sessionStorage.setItem('ds_pat_selected_id', session.patient_id || 'pt-1');
  }
  await pgVideoAssessments(() => {}, () => {});
  await flush(4);
  return {
    ...env,
    restore() {
      restoreApi();
      env.restore();
    },
  };
}

test('governance copy still avoids fake demo certainty language', () => {
  const session = createEmptySession();
  assert.equal(/^vas_/.test(session.id), true);
  assert.equal(VIDEO_ASSESSMENT_TASKS.every((task) => task.demo_asset == null), true);
});

test('clinician prior finalized sessions load and render cards honestly', async () => {
  let resolveResponse;
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: () =>
        new Promise((resolve) => {
          resolveResponse = resolve;
        }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(2);
    assert.match(page.document.body.textContent, /Loading prior finalized sessions from the backend/i);

    resolveResponse({
      sessions: [
        makePriorSession({
          sessionId: 'sess-prior-1',
          occurredAt: '2026-05-07T10:00:00Z',
          severity: 'moderate',
          keyFindings: 'Moderate tremor burden with stable gait.',
        }),
      ],
      trend_sessions: [
        makeTrendSession({
          sessionId: 'sess-prior-1',
          occurredAt: '2026-05-07T10:00:00Z',
          severityLevel: 'moderate',
        }),
      ],
    });
    await flush(4);
    assert.match(page.document.body.textContent, /Prior finalized sessions \(read-only, backend data\)/i);
    assert.match(page.document.body.textContent, /Moderate tremor burden with stable gait/i);
    assert.match(page.document.body.textContent, /Clips available/i);
  } finally {
    page.restore();
  }
});

test('prior finalized session cards render newest first', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({
            sessionId: 'sess-oldest',
            occurredAt: '2026-01-01T10:00:00Z',
            finalizedAt: '2026-01-01T10:00:00Z',
          }),
          makePriorSession({
            sessionId: 'sess-newest',
            occurredAt: '2026-05-07T10:00:00Z',
            finalizedAt: '2026-05-07T10:00:00Z',
          }),
          makePriorSession({
            sessionId: 'sess-middle',
            occurredAt: '2026-03-01T10:00:00Z',
            finalizedAt: '2026-03-01T10:00:00Z',
          }),
        ],
        trend_sessions: [
          makeTrendSession({
            sessionId: 'sess-oldest',
            occurredAt: '2026-01-01T10:00:00Z',
            finalizedAt: '2026-01-01T10:00:00Z',
          }),
          makeTrendSession({
            sessionId: 'sess-newest',
            occurredAt: '2026-05-07T10:00:00Z',
            finalizedAt: '2026-05-07T10:00:00Z',
          }),
          makeTrendSession({
            sessionId: 'sess-middle',
            occurredAt: '2026-03-01T10:00:00Z',
            finalizedAt: '2026-03-01T10:00:00Z',
          }),
        ],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    const order = [...page.document.querySelectorAll('[data-va-prior-select]')].map((el) =>
      el.getAttribute('data-va-prior-select'),
    );
    assert.deepEqual(order, ['sess-newest', 'sess-middle', 'sess-oldest']);
  } finally {
    page.restore();
  }
});

test('prior finalized sessions empty and error states render honestly', async () => {
  const emptyPage = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({ sessions: [] }),
    },
  });
  try {
    emptyPage.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.match(emptyPage.document.body.textContent, /No prior finalized sessions are available for this patient and assessment context/i);
  } finally {
    emptyPage.restore();
  }

  const errorPage = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => {
        throw new Error('backend offline');
      },
    },
  });
  try {
    errorPage.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.match(errorPage.document.body.textContent, /Prior finalized sessions are temporarily unavailable\. Refresh to retry/i);
  } finally {
    errorPage.restore();
  }
});

test('clinician can select and deselect prior sessions and render side-by-side comparison', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({
            sessionId: 'sess-prior-1',
            occurredAt: '2026-05-07T10:00:00Z',
            severity: 'none',
            keyFindings: 'No meaningful progression.',
          }),
          makePriorSession({
            sessionId: 'sess-prior-2',
            occurredAt: '2026-04-01T10:00:00Z',
            severity: 'mild',
            keyFindings: 'Mild left-hand tremor.',
            hasClips: false,
          }),
          makePriorSession({
            sessionId: 'sess-prior-3',
            occurredAt: '2026-03-01T10:00:00Z',
            severity: 'moderate',
            keyFindings: 'Moderate bilateral tremor.',
          }),
        ],
        trend_sessions: [
          makeTrendSession({
            sessionId: 'sess-prior-3',
            occurredAt: '2026-03-01T10:00:00Z',
            severityLevel: 'moderate',
          }),
          makeTrendSession({
            sessionId: 'sess-prior-2',
            occurredAt: '2026-04-01T10:00:00Z',
            severityLevel: 'mild',
            hasClips: false,
          }),
          makeTrendSession({
            sessionId: 'sess-prior-1',
            occurredAt: '2026-05-07T10:00:00Z',
            severityLevel: 'none',
          }),
        ],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    const buttons = [...page.document.querySelectorAll('[data-va-prior-select]')];
    const comparisonTable = () => [...page.document.querySelectorAll('table')].at(-1);
    assert.equal(buttons.length, 3);
    buttons[0].click();
    buttons[1].click();
    await flush(2);
    assert.match(page.document.body.textContent, /Side-by-side comparison/i);
    assert.equal(comparisonTable().querySelectorAll('thead th').length, 3);
    buttons[0].click();
    await flush(2);
    assert.equal(comparisonTable().querySelectorAll('thead th').length, 2);
    assert.equal(page.document.querySelectorAll('[data-va-prior-select][aria-pressed="true"]').length, 1);
  } finally {
    page.restore();
  }
});

test('prior finalized session selection enforces max three', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-1', occurredAt: '2026-05-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-2', occurredAt: '2026-04-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-3', occurredAt: '2026-03-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-4', occurredAt: '2026-02-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-4', occurredAt: '2026-02-07T10:00:00Z' }),
          makeTrendSession({ sessionId: 'sess-3', occurredAt: '2026-03-07T10:00:00Z' }),
          makeTrendSession({ sessionId: 'sess-2', occurredAt: '2026-04-07T10:00:00Z' }),
          makeTrendSession({ sessionId: 'sess-1', occurredAt: '2026-05-07T10:00:00Z' }),
        ],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    let buttons = [...page.document.querySelectorAll('[data-va-prior-select]')];
    buttons[0].click();
    buttons[1].click();
    buttons[2].click();
    await flush(2);
    assert.equal(page.document.querySelectorAll('[data-va-prior-select][aria-pressed="true"]').length, 3);
    buttons = [...page.document.querySelectorAll('[data-va-prior-select]')];
    assert.equal(buttons[3].hasAttribute('disabled'), true);
  } finally {
    page.restore();
  }
});

test('missing summary fields render stable fallback text', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({
            sessionId: 'sess-fallback',
            occurredAt: '2026-05-07T10:00:00Z',
            summary: {},
          }),
        ],
        trend_sessions: [
          makeTrendSession({
            sessionId: 'sess-fallback',
            occurredAt: '2026-05-07T10:00:00Z',
            severityLevel: null,
            tasksCompleted: null,
            tasksTotal: null,
          }),
        ],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.match(page.document.body.textContent, /No clinician summary recorded\./i);
    assert.match(page.document.body.textContent, /Severity: not stated/i);
    page.document.querySelector('[data-va-prior-select="sess-fallback"]').click();
    await flush(2);
    assert.match(page.document.body.textContent, /No clinician summary recorded\./i);
    assert.match(page.document.body.textContent, /Tasks completed \/ total/i);
  } finally {
    page.restore();
  }
});

test('keyboard interaction toggles prior session selection controls', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-keyboard', occurredAt: '2026-05-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-keyboard', occurredAt: '2026-05-07T10:00:00Z' }),
        ],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    let button = page.document.querySelector('[data-va-prior-select="sess-keyboard"]');
    button.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush(2);
    button = page.document.querySelector('[data-va-prior-select="sess-keyboard"]');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    button.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await flush(2);
    assert.equal(
      page.document.querySelector('[data-va-prior-select="sess-keyboard"]').getAttribute('aria-pressed'),
      'false',
    );
  } finally {
    page.restore();
  }
});

test('patient does not see the prior finalized sessions comparison UI', async () => {
  const page = await mountVideoPage({
    role: 'patient',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [makePriorSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' })],
        trend_sessions: [makeTrendSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' })],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.equal(
      /Prior finalized sessions \(read-only, backend data\)/i.test(page.document.body.textContent),
      false,
    );
    assert.equal(
      /Longitudinal trend summary \(read-only, finalized sessions\)/i.test(page.document.body.textContent),
      false,
    );
    assert.equal(page.document.getElementById('va-export-history'), null);
  } finally {
    page.restore();
  }
});

test('trend section renders when oldest-to-newest data exists', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-2', occurredAt: '2026-05-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-1', occurredAt: '2026-04-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-1', occurredAt: '2026-04-07T10:00:00Z', severityLevel: 'mild' }),
          makeTrendSession({ sessionId: 'sess-2', occurredAt: '2026-05-07T10:00:00Z', severityLevel: 'mild' }),
        ],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.match(page.document.body.textContent, /Longitudinal trend summary \(read-only, finalized sessions\)/i);
    assert.match(page.document.body.textContent, /Severity trajectory/i);
    assert.match(page.document.body.textContent, /Task completion trajectory/i);
    assert.match(page.document.body.textContent, /Clip availability/i);
  } finally {
    page.restore();
  }
});

test('trend section shows insufficient-data fallback when fewer than two finalized sessions are available', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [makePriorSession({ sessionId: 'sess-single', occurredAt: '2026-05-07T10:00:00Z' })],
        trend_sessions: [makeTrendSession({ sessionId: 'sess-single', occurredAt: '2026-05-07T10:00:00Z' })],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.match(page.document.body.textContent, /Not enough finalized sessions to determine trend\./i);
  } finally {
    page.restore();
  }
});

test('trend section classifies stable and worsened severity conservatively', async () => {
  const stablePage = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-b', occurredAt: '2026-05-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-a', occurredAt: '2026-04-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-a', occurredAt: '2026-04-07T10:00:00Z', severityLevel: 'mild' }),
          makeTrendSession({ sessionId: 'sess-b', occurredAt: '2026-05-07T10:00:00Z', severityLevel: 'mild' }),
        ],
      }),
    },
  });
  try {
    stablePage.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.match(stablePage.document.body.textContent, /Severity trajectory: stable\./i);
  } finally {
    stablePage.restore();
  }

  const worsenedPage = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-d', occurredAt: '2026-05-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-c', occurredAt: '2026-04-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-c', occurredAt: '2026-04-07T10:00:00Z', severityLevel: 'mild' }),
          makeTrendSession({ sessionId: 'sess-d', occurredAt: '2026-05-07T10:00:00Z', severityLevel: 'severe' }),
        ],
      }),
    },
  });
  try {
    worsenedPage.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.match(worsenedPage.document.body.textContent, /Severity trajectory: worsened\./i);
  } finally {
    worsenedPage.restore();
  }
});

test('trend section classifies improved task completion and inconsistent clip availability', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-3', occurredAt: '2026-05-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-2', occurredAt: '2026-04-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-1', occurredAt: '2026-03-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-1', occurredAt: '2026-03-07T10:00:00Z', tasksCompleted: 4, tasksTotal: 16, hasClips: true }),
          makeTrendSession({ sessionId: 'sess-2', occurredAt: '2026-04-07T10:00:00Z', tasksCompleted: 8, tasksTotal: 16, hasClips: false }),
          makeTrendSession({ sessionId: 'sess-3', occurredAt: '2026-05-07T10:00:00Z', tasksCompleted: 12, tasksTotal: 16, hasClips: true }),
        ],
      }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.match(page.document.body.textContent, /Task completion trajectory: improved\./i);
    assert.match(page.document.body.textContent, /Clip availability: inconsistent\./i);
  } finally {
    page.restore();
  }
});

test('AI historical summary button is visible only for clinician, supervisor, and admin', async () => {
  for (const role of ['clinician', 'supervisor', 'admin']) {
    const page = await mountVideoPage({
      role,
      apiOverrides: {
        getVideoAssessmentPriorFinalizedSessions: async () => ({
          sessions: [makePriorSession({ sessionId: `sess-${role}`, occurredAt: '2026-05-07T10:00:00Z' })],
          trend_sessions: [makeTrendSession({ sessionId: `sess-${role}`, occurredAt: '2026-05-07T10:00:00Z' })],
        }),
      },
    });
    try {
      page.document.getElementById('va-mode-clinician').click();
      await flush(4);
      assert.ok(page.document.getElementById('va-generate-history-ai'));
    } finally {
      page.restore();
    }
  }

  const patientPage = await mountVideoPage({
    role: 'patient',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [makePriorSession({ sessionId: 'sess-patient', occurredAt: '2026-05-07T10:00:00Z' })],
        trend_sessions: [makeTrendSession({ sessionId: 'sess-patient', occurredAt: '2026-05-07T10:00:00Z' })],
      }),
    },
  });
  try {
    patientPage.document.getElementById('va-mode-clinician').click();
    await flush(4);
    assert.equal(patientPage.document.getElementById('va-generate-history-ai'), null);
  } finally {
    patientPage.restore();
  }
});

test('AI historical summary loading, success, and advisory panel render honestly', async () => {
  let resolveSummary;
  let requestBody = null;
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-prior-2', occurredAt: '2026-04-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-prior-2', occurredAt: '2026-04-07T10:00:00Z', severityLevel: 'mild' }),
          makeTrendSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z', severityLevel: 'mild' }),
        ],
      }),
      generateVideoAssessmentHistoricalAiSummary: (sessionId, payload) =>
        new Promise((resolve) => {
          requestBody = { sessionId, payload };
          resolveSummary = resolve;
        }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    page.document.querySelector('[data-va-prior-select="sess-prior-1"]').click();
    await flush(2);
    page.document.getElementById('va-generate-history-ai').click();
    await flush(2);
    assert.deepEqual(requestBody, {
      sessionId: 'sess-current-1',
      payload: { selected_session_ids: ['sess-prior-1'] },
    });
    assert.match(page.document.body.textContent, /Generating advisory summary from persisted finalized-session comparison data/i);
    resolveSummary(
      makeHistoricalAiSummary({
        summaryText: 'Severity appears stable across available finalized sessions.',
        trendObservations: ['Severity appears stable across available finalized sessions.'],
        limitations: ['This summary uses compact finalized-session comparison fields only.'],
        summaryStatus: 'unchanged',
        sessionCount: 1,
        sourceSessionIds: ['sess-prior-1'],
      }),
    );
    await flush(4);
    assert.match(page.document.body.textContent, /AI historical summary/i);
    assert.match(page.document.body.textContent, /Unchanged from prior generation/i);
    assert.match(page.document.body.textContent, /Trend observations/i);
    assert.match(page.document.body.textContent, /Limitations/i);
    assert.match(page.document.body.textContent, /Provenance \/ generation metadata/i);
    assert.match(page.document.body.textContent, /Logic video_assessment_historical_summary_v2/i);
    assert.match(page.document.body.textContent, /1 source session\(s\)/i);
    assert.match(page.document.body.textContent, /Not a diagnosis or treatment recommendation/i);
    assert.doesNotMatch(page.document.body.textContent, /va-historical-summary-test/i);
  } finally {
    page.restore();
  }
});

test('changing selected sessions clears the current AI summary and shows honest stale-state copy', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-prior-2', occurredAt: '2026-04-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-prior-2', occurredAt: '2026-04-07T10:00:00Z' }),
          makeTrendSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' }),
        ],
      }),
      generateVideoAssessmentHistoricalAiSummary: async () =>
        makeHistoricalAiSummary({
          summaryStatus: 'fresh',
          sessionCount: 1,
          sourceSessionIds: ['sess-prior-1'],
        }),
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    page.document.querySelector('[data-va-prior-select="sess-prior-1"]').click();
    await flush(2);
    page.document.getElementById('va-generate-history-ai').click();
    await flush(4);
    assert.match(page.document.body.textContent, /Current summary/i);
    page.document.querySelector('[data-va-prior-select="sess-prior-2"]').click();
    await flush(2);
    assert.match(
      page.document.body.textContent,
      /no longer matches the current selected prior sessions and must be regenerated/i,
    );
    assert.doesNotMatch(page.document.body.textContent, /Trend observations/i);
    assert.match(page.document.getElementById('va-generate-history-ai').textContent, /Regenerate AI historical summary/i);
  } finally {
    page.restore();
  }
});

test('regeneration updates status label and provenance metadata', async () => {
  let callCount = 0;
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' }),
          makePriorSession({ sessionId: 'sess-prior-2', occurredAt: '2026-04-07T10:00:00Z' }),
        ],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-prior-2', occurredAt: '2026-04-07T10:00:00Z' }),
          makeTrendSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' }),
        ],
      }),
      generateVideoAssessmentHistoricalAiSummary: async () => {
        callCount += 1;
        if (callCount === 1) {
          return makeHistoricalAiSummary({
            summaryStatus: 'fresh',
            sessionCount: 1,
            sourceSessionIds: ['sess-prior-1'],
            sourceInputFingerprint: 'fingerprint-a',
          });
        }
        return makeHistoricalAiSummary({
          summaryStatus: 'regenerated_selection_changed',
          sessionCount: 2,
          sourceSessionIds: ['sess-prior-1', 'sess-prior-2'],
          sourceInputFingerprint: 'fingerprint-b',
        });
      },
    },
  });
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    page.document.querySelector('[data-va-prior-select="sess-prior-1"]').click();
    await flush(2);
    page.document.getElementById('va-generate-history-ai').click();
    await flush(4);
    assert.match(page.document.body.textContent, /Current summary/i);
    page.document.querySelector('[data-va-prior-select="sess-prior-2"]').click();
    await flush(2);
    page.document.getElementById('va-generate-history-ai').click();
    await flush(4);
    assert.match(page.document.body.textContent, /Regenerated: selected sessions changed/i);
    assert.match(page.document.body.textContent, /2 source session\(s\)/i);
    assert.match(page.document.body.textContent, /sess-prior-1/i);
    assert.match(page.document.body.textContent, /sess-prior-2/i);
  } finally {
    page.restore();
  }
});

test('AI historical summary error and insufficient-data paths stay conservative', async () => {
  const errorPage = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [makePriorSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' })],
        trend_sessions: [makeTrendSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' })],
      }),
      generateVideoAssessmentHistoricalAiSummary: async () => {
        throw new Error('summary backend offline');
      },
    },
  });
  try {
    errorPage.document.getElementById('va-mode-clinician').click();
    await flush(4);
    errorPage.document.querySelector('[data-va-prior-select="sess-prior-1"]').click();
    await flush(2);
    errorPage.document.getElementById('va-generate-history-ai').click();
    await flush(4);
    assert.match(errorPage.document.body.textContent, /Historical AI summary is temporarily unavailable/i);
  } finally {
    errorPage.restore();
  }

  const sparsePage = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [makePriorSession({ sessionId: 'sess-prior-2', occurredAt: '2026-05-07T10:00:00Z' })],
        trend_sessions: [makeTrendSession({ sessionId: 'sess-prior-2', occurredAt: '2026-05-07T10:00:00Z' })],
      }),
      generateVideoAssessmentHistoricalAiSummary: async () =>
        makeHistoricalAiSummary({
          summaryText: 'Available finalized-session data are too sparse for a stronger descriptive pattern summary.',
          trendObservations: ['Available finalized-session data are too sparse for a stronger descriptive pattern summary.'],
          limitations: [
            'Fewer than two finalized sessions are available, so temporal interpretation is limited.',
            'Severity labels are not available for the selected finalized sessions.',
          ],
          sessionCount: 1,
          hasSeverityData: false,
        }),
    },
  });
  try {
    sparsePage.document.getElementById('va-mode-clinician').click();
    await flush(4);
    sparsePage.document.querySelector('[data-va-prior-select="sess-prior-2"]').click();
    await flush(2);
    sparsePage.document.getElementById('va-generate-history-ai').click();
    await flush(4);
    assert.match(sparsePage.document.body.textContent, /too sparse for a stronger descriptive pattern summary/i);
    assert.match(sparsePage.document.body.textContent, /temporal interpretation is limited/i);
  } finally {
    sparsePage.restore();
  }
});

test('historical comparison export button is visible for clinician, supervisor, and admin only', async () => {
  for (const role of ['clinician', 'supervisor', 'admin']) {
    const page = await mountVideoPage({
      role,
      apiOverrides: {
        getVideoAssessmentPriorFinalizedSessions: async () => ({
          sessions: [makePriorSession({ sessionId: `sess-${role}`, occurredAt: '2026-05-07T10:00:00Z' })],
          trend_sessions: [makeTrendSession({ sessionId: `sess-${role}`, occurredAt: '2026-05-07T10:00:00Z' })],
        }),
      },
    });
    try {
      page.document.getElementById('va-mode-clinician').click();
      await flush(4);
      assert.ok(page.document.getElementById('va-export-history'));
    } finally {
      page.restore();
    }
  }
});

test('Video Assessments source wires linked module navigation ids', () => {
  assert.match(VA_SRC, /va-link-profile/);
  assert.match(VA_SRC, /navWithPatient\('assessments-v2'/);
  assert.match(VA_SRC, /navWithPatient\('deeptwin'/);
  assert.match(VA_SRC, /protocol-studio/);
});

test('historical comparison export view includes comparison and trend sections without interactive controls', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({
            sessionId: 'sess-prior-1',
            occurredAt: '2026-05-07T10:00:00Z',
            keyFindings: 'Stable gait with mild tremor.',
          }),
          makePriorSession({
            sessionId: 'sess-prior-2',
            occurredAt: '2026-04-07T10:00:00Z',
            keyFindings: 'Moderate tremor noted.',
          }),
        ],
        trend_sessions: [
          makeTrendSession({
            sessionId: 'sess-prior-2',
            occurredAt: '2026-04-07T10:00:00Z',
            severityLevel: 'moderate',
            tasksCompleted: 8,
            tasksTotal: 16,
          }),
          makeTrendSession({
            sessionId: 'sess-prior-1',
            occurredAt: '2026-05-07T10:00:00Z',
            severityLevel: 'mild',
            tasksCompleted: 12,
            tasksTotal: 16,
          }),
        ],
      }),
      generateVideoAssessmentHistoricalAiSummary: async () =>
        makeHistoricalAiSummary({
          summaryStatus: 'regenerated_source_changed',
          summaryText: 'Severity appears stable across available finalized sessions.',
          trendObservations: ['Severity appears stable across available finalized sessions.'],
          limitations: ['This summary uses compact finalized-session comparison fields only.'],
          sessionCount: 2,
        }),
    },
  });
  const exportStub = installExportWindowStub(page.window);
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    page.document.querySelector('[data-va-prior-select="sess-prior-1"]').click();
    page.document.querySelector('[data-va-prior-select="sess-prior-2"]').click();
    await flush(2);
    page.document.getElementById('va-generate-history-ai').click();
    await flush(4);
    page.document.getElementById('va-export-history').click();
    assert.match(exportStub.written.html, /Video assessment historical comparison/i);
    assert.match(exportStub.written.html, /Selected prior finalized sessions summary/i);
    assert.match(exportStub.written.html, /Side-by-side comparison/i);
    assert.match(exportStub.written.html, /Longitudinal trend summary/i);
    assert.match(exportStub.written.html, /AI historical summary/i);
    assert.match(exportStub.written.html, /Regenerated: source data changed/i);
    assert.match(exportStub.written.html, /Provenance \/ generation metadata/i);
    assert.match(exportStub.written.html, /Logic video_assessment_historical_summary_v2/i);
    assert.match(exportStub.written.html, /Stable gait with mild tremor/i);
    assert.match(exportStub.written.html, /Severity trajectory:<\/strong>\s*improved\./i);
    assert.doesNotMatch(exportStub.written.html, /<button/i);
    assert.doesNotMatch(exportStub.written.html, /data-va-prior-select/i);
    assert.doesNotMatch(exportStub.written.html, /va-historical-summary-test/i);
  } finally {
    exportStub.restore();
    page.restore();
  }
});

test('historical comparison export handles empty selection honestly', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [makePriorSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z' })],
        trend_sessions: [
          makeTrendSession({ sessionId: 'sess-prior-1', occurredAt: '2026-05-07T10:00:00Z', severityLevel: 'mild' }),
        ],
      }),
    },
  });
  const exportStub = installExportWindowStub(page.window);
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    page.document.getElementById('va-export-history').click();
    assert.match(exportStub.written.html, /No prior finalized sessions selected for export\./i);
    assert.match(exportStub.written.html, /No prior finalized sessions selected for side-by-side comparison\./i);
    assert.doesNotMatch(exportStub.written.html, /AI historical summary/i);
  } finally {
    exportStub.restore();
    page.restore();
  }
});

test('historical comparison export uses safe fallback text when optional fields are missing', async () => {
  const page = await mountVideoPage({
    role: 'clinician',
    apiOverrides: {
      getVideoAssessmentPriorFinalizedSessions: async () => ({
        sessions: [
          makePriorSession({
            sessionId: 'sess-fallback-export',
            occurredAt: '2026-05-07T10:00:00Z',
            summary: {},
          }),
        ],
        trend_sessions: [
          makeTrendSession({
            sessionId: 'sess-fallback-export',
            occurredAt: '2026-05-07T10:00:00Z',
            severityLevel: null,
            tasksCompleted: null,
            tasksTotal: null,
          }),
        ],
      }),
    },
  });
  const exportStub = installExportWindowStub(page.window);
  try {
    page.document.getElementById('va-mode-clinician').click();
    await flush(4);
    page.document.querySelector('[data-va-prior-select="sess-fallback-export"]').click();
    await flush(2);
    page.document.getElementById('va-export-history').click();
    assert.match(exportStub.written.html, /No clinician summary recorded\./i);
    assert.match(exportStub.written.html, /not stated/i);
    assert.match(exportStub.written.html, /0 \/ 0/i);
  } finally {
    exportStub.restore();
    page.restore();
  }
});
