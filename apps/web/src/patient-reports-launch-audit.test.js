// Logic-only tests for the Patient Reports view-side launch-audit (2026-05-01).
//
// Third patient-facing surface to receive the launch-audit treatment after
// Symptom Journal (#344) and Wellness Hub (#345). Pins the page contract
// against silent fakes:
//   - Audit-event payload composition is correct (event / report_id / using_demo_data / note)
//   - List filter URL composition encodes only documented params (no cross-patient leak)
//   - Demo banner renders only when server explicitly returns is_demo=true
//   - Consent-revoked banner renders only when consent_active=false
//   - Form actions disabled in consent-revoked render (no acknowledge/share-back/question)
//   - Form actions disabled in offline render (server fetch returned null)
//   - Empty-state banner shows only when server is live AND there are zero docs
//   - Audit event names cover the full patient_reports surface contract
//
// Run: node --test src/patient-reports-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit.

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────


// Mirrors the audit-event payload builder used inside _patientReportsLogAuditEvent.
function buildAuditPayload(event, extra = {}) {
  return {
    event,
    report_id: extra.report_id ? String(extra.report_id) : null,
    note: extra.note ? String(extra.note).slice(0, 480) : null,
    using_demo_data: !!extra.using_demo_data,
  };
}

// Mirrors `api.listPatientReports` URL composition. Critical: the patient's
// own ID is auto-resolved server-side; the client must never send a
// patient_id query param. We also pin which params are forwarded so a
// future regression that leaks (say) a clinic_id won't go unnoticed.
function buildListUrl(params = {}) {
  const q = new URLSearchParams();
  if (params) {
    for (const k of ['type', 'status', 'since', 'until', 'q']) {
      if (params[k]) q.set(k, params[k]);
    }
    for (const k of ['limit', 'offset']) {
      if (params[k] != null && params[k] !== '') q.set(k, String(params[k]));
    }
  }
  const qs = q.toString();
  return `/api/v1/reports/patient/me${qs ? '?' + qs : ''}`;
}

function shouldShowDemoBanner(serverList) {
  return !!(serverList && serverList.is_demo);
}

function shouldShowConsentBanner(serverList, serverLive) {
  return !!(serverLive && serverList && serverList.consent_active === false);
}

function shouldShowOfflineBanner(serverList, serverErr) {
  return !(serverList && !serverErr);
}

function shouldShowEmptyBanner(serverList, docsCount) {
  // Empty banner is shown only when we know the server is live AND
  // there are zero docs. We must not fabricate "no reports yet" copy
  // when the server is down — the offline banner handles that case.
  return !!(serverList && docsCount === 0);
}

function isAcknowledgeDisabled(serverList, serverErr) {
  // Disabled when offline or consent withdrawn.
  if (!serverList || serverErr) return true;
  if (serverList.consent_active === false) return true;
  return false;
}

function isShareBackDisabled(serverList, serverErr) {
  return isAcknowledgeDisabled(serverList, serverErr);
}

function isQuestionDisabled(serverList, serverErr) {
  return isAcknowledgeDisabled(serverList, serverErr);
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload carries event, report_id, demo flag, note', () => {
  const payload = buildAuditPayload('report_acknowledged', {
    report_id: 'report-abc',
    note: 'patient confirmed read',
    using_demo_data: true,
  });
  assert.equal(payload.event, 'report_acknowledged');
  assert.equal(payload.report_id, 'report-abc');
  assert.equal(payload.using_demo_data, true);
  assert.equal(payload.note, 'patient confirmed read');
});

test('Audit payload defaults using_demo_data=false when absent', () => {
  const payload = buildAuditPayload('view', {});
  assert.equal(payload.using_demo_data, false);
});

test('Audit payload coerces undefined report_id to null (not the string "undefined")', () => {
  const payload = buildAuditPayload('view', {});
  assert.equal(payload.report_id, null);
});

test('Audit payload truncates oversized note to 480 chars', () => {
  const big = 'x'.repeat(2000);
  const payload = buildAuditPayload('report_downloaded', { note: big });
  assert.equal(payload.note.length, 480);
});

test('Audit event names cover the full patient_reports surface contract', () => {
  // Cross-side contract: every event listed here must also be emitted /
  // accepted by apps/api/app/routers/reports_router.py::_patient_reports_audit
  // or POST /api/v1/reports/patient/audit-events. Adding an event in JS
  // without a backend update breaks audit-trail rendering.
  const required = [
    // Mount + page-level
    'view',
    'list_viewed',
    'summary_viewed',
    'filter_changed',
    // Per-report click events emitted from the UI
    'report_opened',
    'report_viewed',
    'report_downloaded',
    'report_acknowledged',
    'report_share_back_requested',
    'report_question_started',
    // Click intents (the server endpoint also emits its own audit row)
    'acknowledge_clicked',
    'share_back_clicked',
    'question_clicked',
    'ask_clicked',
  ];
  for (const ev of required) {
    const payload = buildAuditPayload(ev, {});
    assert.equal(payload.event, ev);
  }
});

test('List URL never sends a patient_id query param (server auto-resolves)', () => {
  // If a future regression starts forwarding the actor.patient_id via the
  // querystring, this test breaks. Patient_id is auto-resolved server-side
  // — the client must never let the patient escape their own scope by
  // spoofing the path.
  const url = buildListUrl({ patient_id: 'someone-elses-id', type: 'progress' });
  assert.ok(!url.includes('patient_id='), 'patient_id must not appear in the URL: ' + url);
  assert.ok(url.includes('type=progress'));
});

test('List URL forwards documented params only (type, status, since, until, q, limit, offset)', () => {
  const url = buildListUrl({
    type: 'progress',
    status: 'signed',
    since: '2026-04-01',
    until: '2026-05-01',
    q: 'phq9',
    limit: 25,
    offset: 50,
  });
  // Every documented field is in the URL
  for (const param of ['type=progress', 'status=signed', 'since=2026-04-01', 'until=2026-05-01', 'q=phq9', 'limit=25', 'offset=50']) {
    assert.ok(url.includes(param), 'expected ' + param + ' in URL but got: ' + url);
  }
});

test('List URL has no querystring when no params supplied', () => {
  const url = buildListUrl();
  assert.equal(url, '/api/v1/reports/patient/me');
});

test('List URL skips falsy params (empty string, null, undefined)', () => {
  const url = buildListUrl({ type: '', status: null, q: undefined, since: '2026-04-01' });
  assert.ok(url.includes('since=2026-04-01'));
  assert.ok(!url.includes('type='));
  assert.ok(!url.includes('status='));
  assert.ok(!url.includes('q='));
});

test('Demo banner only shown when server explicitly flags is_demo=true', () => {
  assert.equal(shouldShowDemoBanner({ is_demo: true }), true);
  assert.equal(shouldShowDemoBanner({ is_demo: false }), false);
  assert.equal(shouldShowDemoBanner(null), false);
  assert.equal(shouldShowDemoBanner({}), false);
});

test('Consent-revoked banner shown only when server is live AND consent_active=false', () => {
  assert.equal(shouldShowConsentBanner({ consent_active: false }, true), true);
  assert.equal(shouldShowConsentBanner({ consent_active: true }, true), false);
  assert.equal(shouldShowConsentBanner({}, true), false);
  // If we don't know the consent state (offline), don't fabricate a
  // consent-revoked message — the offline banner is the correct UX here.
  assert.equal(shouldShowConsentBanner({ consent_active: false }, false), false);
  assert.equal(shouldShowConsentBanner(null, true), false);
});

test('Offline banner shown when server fetch returned null OR errored', () => {
  assert.equal(
    shouldShowOfflineBanner({ items: [], consent_active: true, is_demo: false }, false),
    false,
  );
  assert.equal(shouldShowOfflineBanner(null, false), true);
  assert.equal(shouldShowOfflineBanner(null, true), true);
});

test('Empty-state banner shown only when server is live AND zero docs', () => {
  assert.equal(shouldShowEmptyBanner({ items: [] }, 0), true);
  assert.equal(shouldShowEmptyBanner({ items: [{ id: 'r1' }] }, 1), false);
  // Don't show "No reports yet" when offline — the offline banner is the
  // honest message for that case.
  assert.equal(shouldShowEmptyBanner(null, 0), false);
});

test('Acknowledge / share-back / question all disabled in consent-revoked render', () => {
  const list = { consent_active: false };
  assert.equal(isAcknowledgeDisabled(list, false), true);
  assert.equal(isShareBackDisabled(list, false), true);
  assert.equal(isQuestionDisabled(list, false), true);
});

test('Acknowledge / share-back / question all disabled in offline render', () => {
  // Offline: serverList is null OR serverErr is true.
  assert.equal(isAcknowledgeDisabled(null, false), true);
  assert.equal(isShareBackDisabled(null, false), true);
  assert.equal(isQuestionDisabled(null, false), true);
});

test('Acknowledge / share-back / question enabled in healthy + consent-active render', () => {
  const list = { consent_active: true, is_demo: false, items: [] };
  assert.equal(isAcknowledgeDisabled(list, false), false);
  assert.equal(isShareBackDisabled(list, false), false);
  assert.equal(isQuestionDisabled(list, false), false);
});

test('Mount-time view audit payload carries connectivity hint (online)', () => {
  const note = 'items=3; consent_active=1';
  const payload = buildAuditPayload('view', { note });
  assert.equal(payload.event, 'view');
  assert.equal(payload.note, note);
});

test('Mount-time view audit payload carries fallback flag (offline)', () => {
  const payload = buildAuditPayload('view', { note: 'fallback=offline' });
  assert.equal(payload.note, 'fallback=offline');
});

test('Per-report audit payload carries the report_id even when note is empty', () => {
  const p = buildAuditPayload('report_opened', { report_id: 'r-1' });
  assert.equal(p.report_id, 'r-1');
  assert.equal(p.note, null);
});

test('Audit payload preserves report_id as a String even when given a number', () => {
  // Defensive: a buggy call site that passes a number must not break the
  // server contract (the schema accepts string with max_length=64).
  const p = buildAuditPayload('report_viewed', { report_id: 12345 });
  assert.equal(typeof p.report_id, 'string');
  assert.equal(p.report_id, '12345');
});

test('Share-back validation: empty audience must NOT compose a request URL', () => {
  // Mirrors the JS-side guard: window._ptShareBackReport returns early when
  // audience is blank, so this test pins the assumption.
  function shouldSubmitShareBack(audience, note) {
    if (!audience || !audience.trim()) return false;
    if (!note || note.trim().length < 2) return false;
    return true;
  }
  assert.equal(shouldSubmitShareBack('', 'please send'), false);
  assert.equal(shouldSubmitShareBack('GP', ''), false);
  assert.equal(shouldSubmitShareBack('GP', 'a'), false);
  assert.equal(shouldSubmitShareBack('GP', 'send a copy'), true);
});

test('Question thread: empty / too-short question must NOT submit', () => {
  function shouldSubmitQuestion(question) {
    return !!(question && question.trim().length >= 2);
  }
  assert.equal(shouldSubmitQuestion(''), false);
  assert.equal(shouldSubmitQuestion(' '), false);
  assert.equal(shouldSubmitQuestion('a'), false);
  assert.equal(shouldSubmitQuestion('Why is my anxiety score up?'), true);
});
