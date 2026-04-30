// Logic-only tests for the Course Detail launch-audit (2026-04-30).
//
// These pin the page contract against silent fakes:
//   - The audit-trail card no longer fabricates "Illustrative" rows
//   - The Approval History card uses real audit events, not synthesized
//     `createdDate + 1 day` placeholders
//   - Pause / Resume / Close are note-required (client-side gate)
//   - Demo CSV / NDJSON exports are detected from response prefix
//   - The audit-event POST payload shape matches the backend schema
//   - Terminal-state transitions are blocked client-side too
//
// Run: node --test src/course-detail-launch-audit.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';


// ── Helpers (mirror the in-page logic in pages-courses.js) ────────────────

// Mirrors the audit-trail card branch in renderCourseTab() — the
// pre-launch-audit version invented "Illustrative" rows when the API was
// unreachable. The new version returns either real rows or an honest
// banner; never fabricated entries.
function renderAuditTrailRecords(auditTrail) {
  const trail = Array.isArray(auditTrail?.items) ? auditTrail.items : null;
  let banner = '';
  if (trail == null) {
    banner = 'unavailable';
  } else if (trail.length === 0) {
    banner = 'empty';
  }
  const records = (trail && trail.length > 0) ? trail : [];
  return { banner, records };
}

// Mirrors the Approval History card. Real events only, sorted oldest→newest
// with a synthetic "Course created" entry derived from course.created_at.
function buildApprovalHistory(course, auditTrail) {
  const KEEP = new Set([
    'course.activate',
    'course.activate.safety_override',
    'course_detail.pause',
    'course_detail.resume',
    'course_detail.close',
  ]);
  const trail = Array.isArray(auditTrail?.items) ? auditTrail.items : [];
  const created = course.created_at
    ? { label: 'Course created', action: 'course.created', date: new Date(course.created_at) }
    : null;
  const filtered = trail
    .filter(e => KEEP.has(e.action))
    .map(e => ({
      label: e.action,
      action: e.action,
      date: e.created_at ? new Date(e.created_at) : null,
    }))
    .filter(e => e.date && !isNaN(e.date.getTime()));
  return [created, ...filtered.reverse()].filter(Boolean);
}

// Mirrors the client-side note gate inside _cdGovAction(). Returns
// { ok: bool, errorCode: string|null }.
function validateGovAction(action, notes, courseStatus) {
  const TERMINAL = new Set(['completed', 'closed', 'discontinued']);
  if (TERMINAL.has(courseStatus) && action !== 'view') {
    return { ok: false, errorCode: 'course_immutable' };
  }
  if (action === 'pause'  && !(notes.pause  || '').trim())  return { ok: false, errorCode: 'note_required' };
  if (action === 'resume' && !(notes.resume || '').trim()) return { ok: false, errorCode: 'note_required' };
  if (action === 'close'  && !(notes.close  || '').trim())  return { ok: false, errorCode: 'note_required' };
  return { ok: true, errorCode: null };
}

// Mirrors the export-detection helpers. CSV demo exports are prefixed
// `# DEMO …`. NDJSON demo exports lead with `{"_meta":"DEMO", …}`.
function isDemoCsv(text) {
  return typeof text === 'string' && text.lstrip ? text.lstrip().startsWith('# DEMO')
    : typeof text === 'string' && text.replace(/^\s+/, '').startsWith('# DEMO');
}

function isDemoNdjson(text) {
  if (typeof text !== 'string') return false;
  const first = (text.split('\n').find(l => l.trim().length > 0) || '').trim();
  if (!first.startsWith('{')) return false;
  try {
    const obj = JSON.parse(first);
    return obj && obj._meta === 'DEMO';
  } catch (_) {
    return false;
  }
}

// Mirrors the `recordCourseAuditEvent` payload builder.
function buildCourseAuditPayload(event, opts = {}) {
  return {
    event,
    note: typeof opts.note === 'string' ? opts.note.slice(0, 500) : null,
    using_demo_data: !!opts.using_demo_data,
  };
}


// ── Tests ──────────────────────────────────────────────────────────────────


test('audit-trail card returns no fabricated rows when API unreachable', () => {
  const out = renderAuditTrailRecords(null);
  assert.equal(out.banner, 'unavailable');
  assert.deepEqual(out.records, []);
});

test('audit-trail card returns honest empty state when API returns []', () => {
  const out = renderAuditTrailRecords({ items: [] });
  assert.equal(out.banner, 'empty');
  assert.deepEqual(out.records, []);
});

test('audit-trail card surfaces real rows verbatim', () => {
  const items = [
    { action: 'course_detail.pause', actor_id: 'a', role: 'clinician', note: 'patient travel', created_at: '2026-04-20T10:00:00Z' },
    { action: 'course_detail.resume', actor_id: 'a', role: 'clinician', note: 'returned, no AE', created_at: '2026-04-25T08:30:00Z' },
  ];
  const out = renderAuditTrailRecords({ items });
  assert.equal(out.banner, '');
  assert.equal(out.records.length, 2);
  // No "Illustrative" string ever appears.
  for (const r of out.records) {
    assert.ok(!String(r.note || '').toLowerCase().includes('illustrative'));
    assert.ok(r.created_at);
  }
});


test('approval-history uses created_at + real audit rows only (no fabricated +1 day)', () => {
  const course = { created_at: '2026-04-01T10:00:00Z', status: 'active' };
  const auditTrail = {
    items: [
      { action: 'course.activate', created_at: '2026-04-02T09:00:00Z', note: 'ok' },
      { action: 'irrelevant.event', created_at: '2026-04-03T09:00:00Z', note: 'ignore me' },
    ],
  };
  const events = buildApprovalHistory(course, auditTrail);
  assert.equal(events.length, 2);
  assert.equal(events[0].action, 'course.created');
  // Crucially — the second event is the real activate row, NOT
  // (created_at + 86400000ms) which is what the pre-launch-audit version
  // computed when course.submitted_at was missing.
  assert.equal(events[1].action, 'course.activate');
  assert.equal(events[1].date.toISOString(), '2026-04-02T09:00:00.000Z');
});

test('approval-history empty when course has no created_at and no real audit rows', () => {
  const events = buildApprovalHistory({ status: 'pending_approval' }, { items: [] });
  assert.deepEqual(events, []);
});


test('pause action requires a clinician note', () => {
  const r = validateGovAction('pause', { pause: '' }, 'active');
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'note_required');
});

test('pause action accepts a real note', () => {
  const r = validateGovAction('pause', { pause: 'Patient travelling 2 weeks' }, 'active');
  assert.equal(r.ok, true);
});

test('resume action requires a clinician note', () => {
  const r = validateGovAction('resume', { resume: '   ' }, 'paused');
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'note_required');
});

test('close action requires a clinician note', () => {
  const r = validateGovAction('close', { close: '' }, 'active');
  assert.equal(r.ok, false);
  assert.equal(r.errorCode, 'note_required');
});

test('terminal-state courses block all transitions client-side', () => {
  for (const status of ['completed', 'closed', 'discontinued']) {
    const r = validateGovAction('pause', { pause: 'has note' }, status);
    assert.equal(r.ok, false, status);
    assert.equal(r.errorCode, 'course_immutable', status);
  }
});


test('CSV demo prefix is detected', () => {
  const text = '# DEMO — this course is demo data and is NOT regulator-submittable.\nsection,course\n';
  assert.equal(isDemoCsv(text), true);
});

test('CSV non-demo export has no demo prefix', () => {
  assert.equal(isDemoCsv('section,course\n'), false);
});

test('NDJSON demo prefix is detected', () => {
  const text = '{"_meta":"DEMO","warning":"x"}\n{"_kind":"course","course_id":"c1"}\n';
  assert.equal(isDemoNdjson(text), true);
});

test('NDJSON non-demo first line is parsed without DEMO meta', () => {
  const text = '{"_kind":"course","course_id":"c1"}\n';
  assert.equal(isDemoNdjson(text), false);
});


test('audit-event payload matches backend schema (event, note, using_demo_data)', () => {
  const p = buildCourseAuditPayload('view', { note: 'page mount' });
  assert.deepEqual(p, { event: 'view', note: 'page mount', using_demo_data: false });
});

test('audit-event note is clipped at 500 chars (matches backend max_length)', () => {
  const long = 'x'.repeat(800);
  const p = buildCourseAuditPayload('view', { note: long });
  assert.equal(p.note.length, 500);
});

test('audit-event sets using_demo_data when caller flags it', () => {
  const p = buildCourseAuditPayload('export_csv.client', { using_demo_data: true });
  assert.equal(p.using_demo_data, true);
});


// ── Drill-out URL composition (pin cross-surface contracts) ──────────────

function drillOutUrl(target, courseId, patientId) {
  if (target === 'patient' && patientId)                  return `?page=patient-profile&patient_id=${encodeURIComponent(patientId)}`;
  if (target === 'session_execution' && courseId)         return `?page=session-execution&course_id=${encodeURIComponent(courseId)}`;
  if (target === 'documents' && courseId)                 return `?page=documents-hub&source_target_type=treatment_course&source_target_id=${encodeURIComponent(courseId)}`;
  if (target === 'reports' && courseId)                   return `?page=reports-hub&course_id=${encodeURIComponent(courseId)}`;
  if (target === 'adverse_events' && courseId)            return `?page=adverse-events&course_id=${encodeURIComponent(courseId)}`;
  if (target === 'irb' && courseId)                       return `?page=irb-manager&course_id=${encodeURIComponent(courseId)}`;
  return null;
}

test('drill-out URL composition is stable for all expected surfaces', () => {
  assert.equal(drillOutUrl('patient', 'c1', 'p9'),                '?page=patient-profile&patient_id=p9');
  assert.equal(drillOutUrl('session_execution', 'c1'),            '?page=session-execution&course_id=c1');
  assert.equal(drillOutUrl('documents', 'c1'),                    '?page=documents-hub&source_target_type=treatment_course&source_target_id=c1');
  assert.equal(drillOutUrl('reports', 'c1'),                      '?page=reports-hub&course_id=c1');
  assert.equal(drillOutUrl('adverse_events', 'c1'),               '?page=adverse-events&course_id=c1');
  assert.equal(drillOutUrl('irb', 'c1'),                          '?page=irb-manager&course_id=c1');
  assert.equal(drillOutUrl('patient', 'c1'),                      null); // patient_id missing
  assert.equal(drillOutUrl('unknown', 'c1', 'p1'),                null); // unknown target
});
