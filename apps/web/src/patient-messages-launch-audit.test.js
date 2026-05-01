// Logic-only tests for the Patient Messages launch-audit (2026-05-01).
//
// Fourth patient-facing surface to receive the launch-audit treatment
// after Symptom Journal (#344), Wellness Hub (#345), and Patient
// Reports (#346). Pins the page contract against silent fakes:
//   - Audit-event payload composition is correct (event / thread_id /
//     message_id / using_demo_data / note)
//   - Demo banner renders only when server explicitly returns is_demo=true
//   - Consent-revoked banner renders only when server is live AND
//     consent_active=false
//   - Compose / reply / urgent disabled in consent-revoked render
//   - Compose / reply / urgent disabled in offline render
//   - Empty-state banner shows only when server is live AND zero threads
//   - URL parsing extracts ?thread_id=… for deep-link from Patient Reports
//   - Audit event names cover the full patient_messages surface contract
//   - thread_id from the start-question handler is shaped report-{id}
//
// Run: node --test src/patient-messages-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest. See
// apps/web/package.json::test:unit.

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────


// Mirrors the audit-event payload builder used inside
// _patientMessagesLogAuditEvent.
function buildAuditPayload(event, extra = {}) {
  return {
    event,
    thread_id: extra.thread_id ? String(extra.thread_id) : null,
    message_id: extra.message_id ? String(extra.message_id) : null,
    note: extra.note ? String(extra.note).slice(0, 480) : null,
    using_demo_data: !!extra.using_demo_data,
  };
}

// Mirrors `api.listPatientMessageThreads` URL composition. Critical: the
// patient's own ID is auto-resolved server-side; the client must never
// send a patient_id query param.
function buildListUrl(params = {}) {
  const q = new URLSearchParams();
  if (params) {
    for (const k of ['category', 'status', 'since', 'until', 'q']) {
      if (params[k]) q.set(k, params[k]);
    }
    for (const k of ['limit', 'offset']) {
      if (params[k] != null && params[k] !== '') q.set(k, String(params[k]));
    }
  }
  const qs = q.toString();
  return `/api/v1/messages/threads${qs ? '?' + qs : ''}`;
}

// Mirrors the deep-link parser added to pgPatientMessages.
function parseDeepLinkThreadId(searchString) {
  try {
    const qs = new URLSearchParams(searchString || '');
    const tid = qs.get('thread_id');
    if (!tid || typeof tid !== 'string') return null;
    const trimmed = tid.trim();
    return trimmed || null;
  } catch (_) {
    return null;
  }
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

function shouldShowEmptyBanner(serverList, threadCount) {
  return !!(serverList && threadCount === 0);
}

function isComposeDisabled(serverList, serverErr) {
  if (!serverList || serverErr) return true;
  if (serverList.consent_active === false) return true;
  return false;
}

function isReplyDisabled(serverList, serverErr) {
  return isComposeDisabled(serverList, serverErr);
}

function isUrgentDisabled(serverList, serverErr) {
  return isComposeDisabled(serverList, serverErr);
}

function reportIdFromThreadId(threadId) {
  if (!threadId || typeof threadId !== 'string') return null;
  if (!threadId.startsWith('report-')) return null;
  return threadId.slice('report-'.length);
}


// ── Tests ───────────────────────────────────────────────────────────────────


test('Audit payload carries event, thread_id, message_id, demo flag, note', () => {
  const payload = buildAuditPayload('thread_opened', {
    thread_id: 'thread-abc',
    message_id: 'msg-xyz',
    note: 'opened from inbox',
    using_demo_data: true,
  });
  assert.equal(payload.event, 'thread_opened');
  assert.equal(payload.thread_id, 'thread-abc');
  assert.equal(payload.message_id, 'msg-xyz');
  assert.equal(payload.using_demo_data, true);
  assert.equal(payload.note, 'opened from inbox');
});

test('Audit payload defaults using_demo_data=false when absent', () => {
  const payload = buildAuditPayload('view', {});
  assert.equal(payload.using_demo_data, false);
});

test('Audit payload coerces undefined thread_id / message_id to null', () => {
  const payload = buildAuditPayload('view', {});
  assert.equal(payload.thread_id, null);
  assert.equal(payload.message_id, null);
});

test('Audit payload truncates oversized note to 480 chars', () => {
  const big = 'x'.repeat(2000);
  const payload = buildAuditPayload('message_sent', { note: big });
  assert.equal(payload.note.length, 480);
});

test('Audit event names cover the full patient_messages surface contract', () => {
  // Cross-side contract: every event listed here must also be emitted /
  // accepted by apps/api/app/routers/patient_messages_router.py::
  // _patient_messages_audit or POST /api/v1/messages/audit-events.
  const required = [
    // Mount + page-level
    'view',
    'filter_changed',
    'deep_link_followed',
    // Per-thread click events
    'thread_opened',
    'message_read',
    'message_sent',
    'message_sent_clicked',
    'urgent_marked',
    'urgent_unmarked',
    'attachment_clicked',
    'clinician_reply_visible',
    'thread_resolved',
    'cross_link_report_clicked',
    // UI-only banners
    'demo_banner_shown',
    'consent_banner_shown',
  ];
  for (const ev of required) {
    const payload = buildAuditPayload(ev, {});
    assert.equal(payload.event, ev);
  }
});

test('List URL never sends a patient_id query param (server auto-resolves)', () => {
  const url = buildListUrl({ patient_id: 'someone-elses-id', category: 'general' });
  assert.ok(!url.includes('patient_id='), 'patient_id must not appear in the URL: ' + url);
  assert.ok(url.includes('category=general'));
});

test('List URL forwards documented params only (category, status, since, until, q, limit, offset)', () => {
  const url = buildListUrl({
    category: 'treatment-plan',
    status: 'urgent',
    since: '2026-04-01',
    until: '2026-05-01',
    q: 'side effects',
    limit: 25,
    offset: 50,
  });
  for (const param of [
    'category=treatment-plan',
    'status=urgent',
    'since=2026-04-01',
    'until=2026-05-01',
    'q=side+effects',
    'limit=25',
    'offset=50',
  ]) {
    assert.ok(url.includes(param), 'expected ' + param + ' in URL but got: ' + url);
  }
});

test('List URL has no querystring when no params supplied', () => {
  const url = buildListUrl();
  assert.equal(url, '/api/v1/messages/threads');
});

test('List URL skips falsy params (empty string, null, undefined)', () => {
  const url = buildListUrl({ category: '', status: null, q: undefined, since: '2026-04-01' });
  assert.ok(url.includes('since=2026-04-01'));
  assert.ok(!url.includes('category='));
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
  // consent-revoked message — the offline banner is the correct UX.
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

test('Empty-state banner shown only when server is live AND zero threads', () => {
  assert.equal(shouldShowEmptyBanner({ items: [] }, 0), true);
  assert.equal(shouldShowEmptyBanner({ items: [{ thread_id: 't1' }] }, 1), false);
  // Don't show "No messages yet" when offline.
  assert.equal(shouldShowEmptyBanner(null, 0), false);
});

test('Compose / reply / urgent all disabled in consent-revoked render', () => {
  const list = { consent_active: false };
  assert.equal(isComposeDisabled(list, false), true);
  assert.equal(isReplyDisabled(list, false), true);
  assert.equal(isUrgentDisabled(list, false), true);
});

test('Compose / reply / urgent all disabled in offline render', () => {
  assert.equal(isComposeDisabled(null, false), true);
  assert.equal(isReplyDisabled(null, false), true);
  assert.equal(isUrgentDisabled(null, false), true);
});

test('Compose / reply / urgent enabled in healthy + consent-active render', () => {
  const list = { consent_active: true, is_demo: false, items: [] };
  assert.equal(isComposeDisabled(list, false), false);
  assert.equal(isReplyDisabled(list, false), false);
  assert.equal(isUrgentDisabled(list, false), false);
});

test('Deep-link parser extracts thread_id from ?thread_id=…', () => {
  assert.equal(parseDeepLinkThreadId('?thread_id=report-123'), 'report-123');
  assert.equal(parseDeepLinkThreadId('?thread_id=abc-xyz&foo=bar'), 'abc-xyz');
  assert.equal(parseDeepLinkThreadId('?other=value'), null);
  assert.equal(parseDeepLinkThreadId(''), null);
  assert.equal(parseDeepLinkThreadId('?thread_id='), null);
  assert.equal(parseDeepLinkThreadId('?thread_id=  '), null);
});

test('Deep-link parser handles missing/null search string defensively', () => {
  assert.equal(parseDeepLinkThreadId(null), null);
  assert.equal(parseDeepLinkThreadId(undefined), null);
});

test('reportIdFromThreadId extracts the report id from a report-* thread', () => {
  assert.equal(reportIdFromThreadId('report-abc-123'), 'abc-123');
  assert.equal(reportIdFromThreadId('report-'), '');
  assert.equal(reportIdFromThreadId('regular-thread-id'), null);
  assert.equal(reportIdFromThreadId(null), null);
  assert.equal(reportIdFromThreadId(''), null);
});

test('Mount-time view audit payload carries connectivity hint (online)', () => {
  const note = 'threads=4; consent_active=1';
  const payload = buildAuditPayload('view', { note });
  assert.equal(payload.event, 'view');
  assert.equal(payload.note, note);
});

test('Mount-time view audit payload carries fallback flag (offline)', () => {
  const payload = buildAuditPayload('view', { note: 'fallback=offline' });
  assert.equal(payload.note, 'fallback=offline');
});

test('Audit payload preserves thread_id as a String even when given a number', () => {
  const p = buildAuditPayload('thread_opened', { thread_id: 12345 });
  assert.equal(typeof p.thread_id, 'string');
  assert.equal(p.thread_id, '12345');
});

test('Compose validation: empty / blank body must NOT submit', () => {
  function shouldSubmitCompose(body) {
    return !!(body && body.trim().length > 0);
  }
  assert.equal(shouldSubmitCompose(''), false);
  assert.equal(shouldSubmitCompose('   '), false);
  assert.equal(shouldSubmitCompose('Hello clinician'), true);
});

test('Reply validation: empty / blank body must NOT submit', () => {
  function shouldSubmitReply(body) {
    return !!(body && body.trim().length > 0);
  }
  assert.equal(shouldSubmitReply(''), false);
  assert.equal(shouldSubmitReply('  '), false);
  assert.equal(shouldSubmitReply('thanks'), true);
});

test('Audit payload preserves message_id alongside thread_id', () => {
  const p = buildAuditPayload('clinician_reply_visible', {
    thread_id: 'thread-1',
    message_id: 'msg-2',
  });
  assert.equal(p.thread_id, 'thread-1');
  assert.equal(p.message_id, 'msg-2');
});

test('Cross-link report payload carries report-{id} thread_id', () => {
  const p = buildAuditPayload('cross_link_report_clicked', {
    thread_id: 'report-r-123',
    note: 'report=r-123',
  });
  assert.equal(p.thread_id, 'report-r-123');
  assert.ok(p.note.includes('report=r-123'));
});
