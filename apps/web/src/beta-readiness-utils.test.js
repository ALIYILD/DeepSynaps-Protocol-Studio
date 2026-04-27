import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReportFallbackContent,
  buildSchedulingSessionPayload,
  getReferralNextStage,
  getScheduleTypeSubmission,
  mergeSavedReports,
  normalizeReferralLead,
  parsePatientNameForCreate,
  summarizeReferralLeads,
} from './beta-readiness-utils.js';

test('schedule type submission maps neuromodulation sessions to backend-safe payload types', () => {
  assert.deepEqual(getScheduleTypeSubmission('tdcs'), {
    appointment_type: 'session',
    modality: 'tdcs',
    label: 'tDCS',
  });
  assert.deepEqual(getScheduleTypeSubmission('tele'), {
    appointment_type: 'consultation',
    modality: 'telehealth',
    label: 'Telehealth',
  });
  assert.deepEqual(getScheduleTypeSubmission('intake'), {
    appointment_type: 'new_patient',
    modality: null,
    label: 'Intake',
  });
});

test('buildSchedulingSessionPayload emits backend-native session fields only', () => {
  const payload = buildSchedulingSessionPayload({
    patientId: 'pt-123',
    clinicianId: 'cl-456',
    type: 'nf',
    scheduledAt: '2026-04-27T09:30:00',
    durationMinutes: 45,
    notes: 'Needs guardian present',
  });
  assert.deepEqual(payload, {
    patient_id: 'pt-123',
    clinician_id: 'cl-456',
    appointment_type: 'session',
    modality: 'neurofeedback',
    scheduled_at: '2026-04-27T09:30:00',
    duration_minutes: 45,
    session_notes: 'Needs guardian present',
  });
  assert.equal('patient_name' in payload, false);
  assert.equal('course_id' in payload, false);
});

test('parsePatientNameForCreate requires first and last name', () => {
  assert.equal(parsePatientNameForCreate('Madonna'), null);
  assert.deepEqual(parsePatientNameForCreate('Ada Lovelace'), {
    first_name: 'Ada',
    last_name: 'Lovelace',
  });
  assert.deepEqual(parsePatientNameForCreate('Jean  Luc   Picard'), {
    first_name: 'Jean',
    last_name: 'Luc Picard',
  });
});

test('normalizeReferralLead and summarizeReferralLeads keep beta-safe referral semantics', () => {
  const normalized = normalizeReferralLead({
    id: 'lead-1',
    name: ' Alex Morgan ',
    source: 'website',
    stage: 'CONTACTED',
    follow_up: '2026-04-27T09:00:00Z',
    created_at: '2026-04-20T10:00:00Z',
  });
  assert.deepEqual(normalized, {
    id: 'lead-1',
    name: 'Alex Morgan',
    email: '',
    phone: '',
    source: 'website',
    condition: '',
    stage: 'contacted',
    notes: '',
    follow_up: '2026-04-27T09:00:00Z',
    converted_appointment_id: null,
    created: '2026-04-20',
    updated: '',
  });

  const summary = summarizeReferralLeads([
    normalized,
    { id: 'lead-2', name: 'Booked', stage: 'booked' },
    { id: 'lead-3', name: 'Closed', stage: 'lost' },
  ], '2026-04-27');
  assert.deepEqual(summary, {
    open: 1,
    booked: 1,
    closed: 1,
    followUpDue: 1,
    pipeline: 1,
  });
});

test('getReferralNextStage advances only live referral pipeline stages', () => {
  assert.equal(getReferralNextStage('new'), 'contacted');
  assert.equal(getReferralNextStage('contacted'), 'qualified');
  assert.equal(getReferralNextStage('qualified'), null);
  assert.equal(getReferralNextStage('booked'), null);
});

test('buildReportFallbackContent is explicit about AI unavailability and available data', () => {
  const text = buildReportFallbackContent({
    reportType: 'Initial Assessment Report',
    scope: 'patient Jane Doe',
    date: '27/04/2026',
    clinicianContext: 'Focus on session tolerance.',
    dataSummary: 'SESSIONS (2):\n  - Session:abc',
  });
  assert.match(text, /AI-assisted report generation is currently unavailable/i);
  assert.match(text, /Clinician context:/i);
  assert.match(text, /Available source data summary:/i);
  assert.match(text, /Review the source records directly/i);
});

test('mergeSavedReports prefers backend records and keeps local-only rows', () => {
  const merged = mergeSavedReports(
    [
      { id: 'r-1', title: 'Server title', type: 'clinician', created_at: '2026-04-10T10:00:00Z', content: 'server' },
      { id: 'r-2', title: 'Newest', type: 'clinician', created_at: '2026-04-12T10:00:00Z', content: 'new' },
    ],
    [
      { id: 'r-1', name: 'Local stale title', type: 'clinician', date: '2026-04-10', content: 'old' },
      { id: 'local-3', name: 'Offline draft', type: 'clinician', date: '2026-04-11', status: 'local-only' },
    ],
  );
  assert.deepEqual(merged.map((row) => row.id), ['r-2', 'local-3', 'r-1']);
  assert.equal(merged.find((row) => row.id === 'r-1')?.name, 'Server title');
  assert.equal(merged.find((row) => row.id === 'local-3')?._source, 'local');
});
