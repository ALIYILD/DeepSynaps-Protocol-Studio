// Logic-only tests for the Reports hub backend + localStorage merge.
// Run: node --test src/reports-hub-persistence.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirrors fetchSavedReports() in pgReportsHubNew — merges backend rows with
// the local cache, dedupes by id, sorts newest-first.
function mergeSavedReports(backendItems, localItems) {
  const backend = (backendItems || []).map(r => ({
    id: r.id,
    name: r.title || ((r.type || 'clinician') + ' report'),
    patient: r.patient_id || 'All Patients',
    type: r.type || 'clinician',
    date: (r.date || r.created_at || '').slice(0, 10),
    status: r.status || 'generated',
    content: r.content || '',
    _source: 'backend',
  }));
  const local = (localItems || []).map(r => ({ ...r, _source: r._source || 'local' }));
  const byId = new Map();
  backend.forEach(r => byId.set(r.id, r));
  local.forEach(r => { if (!byId.has(r.id)) byId.set(r.id, r); });
  const merged = Array.from(byId.values());
  merged.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return merged;
}

test('backend rows win over local rows with the same id', () => {
  const backend = [{ id: 'r1', title: 'Server title', type: 'clinician', created_at: '2026-04-10T10:00:00Z' }];
  const local   = [{ id: 'r1', name: 'Local stale title', type: 'clinician', date: '2026-04-10', content: 'old' }];
  const out = mergeSavedReports(backend, local);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Server title');
  assert.equal(out[0]._source, 'backend');
});

test('local-only rows (unsynced) stay visible', () => {
  const backend = [{ id: 'r1', title: 'Server', type: 'clinician', created_at: '2026-04-10T10:00:00Z' }];
  const local   = [{ id: 'local-2', name: 'Draft offline', type: 'progress', date: '2026-04-11' }];
  const out = mergeSavedReports(backend, local);
  assert.equal(out.length, 2);
  const ids = out.map(r => r.id);
  assert.ok(ids.includes('r1'));
  assert.ok(ids.includes('local-2'));
});

test('merged list is sorted newest-first by date', () => {
  const backend = [
    { id: 'r1', title: 'Older',  type: 'clinician', created_at: '2026-01-05T10:00:00Z' },
    { id: 'r2', title: 'Newest', type: 'clinician', created_at: '2026-04-10T10:00:00Z' },
  ];
  const local = [{ id: 'r3', name: 'Mid', type: 'clinician', date: '2026-03-01' }];
  const out = mergeSavedReports(backend, local);
  assert.deepEqual(out.map(r => r.id), ['r2', 'r3', 'r1']);
});

test('empty backend + empty local returns []', () => {
  assert.deepEqual(mergeSavedReports([], []), []);
  assert.deepEqual(mergeSavedReports(null, null), []);
});

function buildCreateReportPayload(lastReport, patientId, today) {
  return {
    patient_id: patientId || null,
    type: lastReport.type,
    title: lastReport.type + ' — ' + lastReport.patient,
    content: lastReport.content,
    report_date: today,
    status: 'generated',
  };
}

test('Save flow builds a backend-compatible payload', () => {
  const p = buildCreateReportPayload(
    { type: 'Initial Assessment Report', patient: 'Jane Doe', content: 'Body …' },
    'pat-123',
    '2026-04-10',
  );
  assert.equal(p.patient_id, 'pat-123');
  assert.equal(p.type, 'Initial Assessment Report');
  assert.equal(p.title, 'Initial Assessment Report — Jane Doe');
  assert.equal(p.content, 'Body …');
  assert.equal(p.report_date, '2026-04-10');
  assert.equal(p.status, 'generated');
});

test('Save flow sends null patient_id when unselected', () => {
  const p = buildCreateReportPayload(
    { type: 'Monthly Outcomes Summary', patient: 'All Patients', content: '' },
    '',
    '2026-04-10',
  );
  assert.equal(p.patient_id, null);
});
