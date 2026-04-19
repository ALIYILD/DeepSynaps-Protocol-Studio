/**
 * Pure-logic tests for the Patient Dashboard helper functions.
 *
 * These mirror the helpers exported by pages-patient.js so the rendering
 * code stays thin — none of these tests touch the DOM, so they run under
 * plain `node --test`.
 *
 * Run from apps/web/:
 *   node --test src/patient-dashboard-wiring.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCountdown,
  phaseLabel,
  outcomeGoalMarker,
  groupOutcomesByTemplate,
  pickTodaysFocus,
  isDemoPatient,
  DEMO_PATIENT,
  demoOverlay,
  pickCallTier,
  demoMessagesSeed,
} from './patient-dashboard-helpers.js';

// ── computeCountdown ─────────────────────────────────────────────────────────

test('computeCountdown: null/undefined next → null', () => {
  assert.equal(computeCountdown(null), null);
  assert.equal(computeCountdown(undefined), null);
});

test('computeCountdown: invalid date → null', () => {
  assert.equal(computeCountdown('not a date'), null);
});

test('computeCountdown: "Today" when <= now', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const r = computeCountdown('2026-04-19T09:00:00Z', now);
  assert.equal(r.label, 'Today');
  assert.equal(r.days, 0);
});

test('computeCountdown: "Tomorrow" for ~1 day out', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const r = computeCountdown('2026-04-20T10:00:00Z', now);
  assert.equal(r.days, 1);
  assert.equal(r.label, 'Tomorrow');
});

test('computeCountdown: "In N days" for >1 day', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const r = computeCountdown('2026-04-25T10:00:00Z', now);
  assert.equal(r.days, 6);
  assert.equal(r.label, 'In 6 days');
});

// ── phaseLabel ───────────────────────────────────────────────────────────────

test('phaseLabel: null/0 → "Getting started"', () => {
  assert.equal(phaseLabel(null), 'Getting started');
  assert.equal(phaseLabel(0),    'Getting started');
});
test('phaseLabel: thresholds (1/20/50/80/99/100)', () => {
  assert.equal(phaseLabel(1),   'Early treatment');
  assert.equal(phaseLabel(20),  'Early treatment');
  assert.equal(phaseLabel(21),  'Active treatment');
  assert.equal(phaseLabel(50),  'Active treatment');
  assert.equal(phaseLabel(51),  'Consolidation');
  assert.equal(phaseLabel(80),  'Consolidation');
  assert.equal(phaseLabel(99),  'Final phase');
  assert.equal(phaseLabel(100), 'Complete');
});

// ── outcomeGoalMarker ────────────────────────────────────────────────────────

test('outcomeGoalMarker: PHQ-9 uses goal ≤5, down-scale', () => {
  const gm = outcomeGoalMarker({ template_name: 'PHQ-9', score_numeric: 9 });
  assert.equal(gm.goal, 5);
  assert.equal(gm.down, true);
  // fill = (27-9)/27 → 67%
  assert.equal(gm.fillPct, 67);
  // marker = (27-5)/27 → 81%
  assert.equal(gm.markerPct, 81);
});

test('outcomeGoalMarker: GAD-7 uses goal ≤4', () => {
  const gm = outcomeGoalMarker({ template_name: 'GAD-7', score_numeric: 7 });
  assert.equal(gm.goal, 4);
  assert.equal(gm.down, true);
  assert.equal(gm.maxRange, 21);
});

test('outcomeGoalMarker: PSQI uses goal ≤5', () => {
  const gm = outcomeGoalMarker({ template_name: 'Sleep PSQI', score_numeric: 8 });
  assert.equal(gm.goal, 5);
  assert.equal(gm.down, true);
});

test('outcomeGoalMarker: unknown scale derives goal from baseline (≈half)', () => {
  const gm = outcomeGoalMarker(
    { template_name: 'Homework', score_numeric: 60 },
    { template_name: 'Homework', score_numeric: 80 },
  );
  assert.equal(gm.goal, 40); // round(80 * 0.5)
});

test('outcomeGoalMarker: clamps fill to 0..100', () => {
  const gm = outcomeGoalMarker({ template_name: 'PHQ-9', score_numeric: 999 });
  assert.equal(gm.fillPct >= 0 && gm.fillPct <= 100, true);
});

// ── groupOutcomesByTemplate ──────────────────────────────────────────────────

test('groupOutcomesByTemplate: empty or non-array → []', () => {
  assert.deepEqual(groupOutcomesByTemplate(null), []);
  assert.deepEqual(groupOutcomesByTemplate([]),   []);
});

test('groupOutcomesByTemplate: groups and sorts by most-recent latest', () => {
  const outcomes = [
    { template_name: 'PHQ-9', score_numeric: 15, administered_at: '2026-03-01T10:00:00Z' },
    { template_name: 'PHQ-9', score_numeric: 12, administered_at: '2026-03-15T10:00:00Z' },
    { template_name: 'PHQ-9', score_numeric:  9, administered_at: '2026-04-10T10:00:00Z' },
    { template_name: 'GAD-7', score_numeric:  8, administered_at: '2026-04-12T10:00:00Z' },
    { template_name: 'GAD-7', score_numeric:  7, administered_at: '2026-04-18T10:00:00Z' },
    { template_name: 'PSQI',  score_numeric:  9, administered_at: '2026-04-01T10:00:00Z' },
  ];
  const groups = groupOutcomesByTemplate(outcomes, 4);
  assert.equal(groups.length, 3);
  // Most-recent-latest first: GAD-7 (4/18), PHQ-9 (4/10), PSQI (4/01)
  assert.equal(groups[0].template_name, 'GAD-7');
  assert.equal(groups[0].latest.score_numeric,   7);
  assert.equal(groups[0].baseline.score_numeric, 8);
  assert.equal(groups[1].template_name, 'PHQ-9');
  assert.equal(groups[1].latest.score_numeric,   9);
  assert.equal(groups[1].baseline.score_numeric, 15);
});

test('groupOutcomesByTemplate: respects limit', () => {
  const outcomes = [
    { template_name: 'A', score_numeric: 1, administered_at: '2026-04-01' },
    { template_name: 'B', score_numeric: 1, administered_at: '2026-04-02' },
    { template_name: 'C', score_numeric: 1, administered_at: '2026-04-03' },
    { template_name: 'D', score_numeric: 1, administered_at: '2026-04-04' },
    { template_name: 'E', score_numeric: 1, administered_at: '2026-04-05' },
  ];
  const groups = groupOutcomesByTemplate(outcomes, 2);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].template_name, 'E');
  assert.equal(groups[1].template_name, 'D');
});

test('groupOutcomesByTemplate: drops entries with no template_name', () => {
  const outcomes = [
    { template_name: '', score_numeric: 1, administered_at: '2026-04-01' },
    { template_name: 'X', score_numeric: 2, administered_at: '2026-04-02' },
  ];
  const groups = groupOutcomesByTemplate(outcomes);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].template_name, 'X');
});

// Regression: portal API returns `template_title` — group on that too.
test('groupOutcomesByTemplate: accepts API template_title field', () => {
  const outcomes = [
    { template_title: 'PHQ-9', score_numeric: 14, administered_at: '2026-03-01T10:00:00Z' },
    { template_title: 'PHQ-9', score_numeric:  9, administered_at: '2026-04-10T10:00:00Z' },
    { template_title: 'GAD-7', score_numeric:  7, administered_at: '2026-04-12T10:00:00Z' },
  ];
  const groups = groupOutcomesByTemplate(outcomes);
  assert.equal(groups.length, 2);
  const phq = groups.find(g => g.template_name === 'PHQ-9');
  assert.ok(phq, 'PHQ-9 group exists when only template_title is provided');
  assert.equal(phq.latest.score_numeric, 9);
  assert.equal(phq.baseline.score_numeric, 14);
});

// ── pickTodaysFocus ──────────────────────────────────────────────────────────

test('pickTodaysFocus: session ≤ 24h wins over every other signal', () => {
  const now = Date.parse('2026-04-19T18:00:00Z');
  const focus = pickTodaysFocus({
    now,
    nextSessionAt: '2026-04-20T09:00:00Z', // ~15h away
    nextSessionTimeLabel: '9:00 AM',
    checkedInToday: false, // would normally trigger #2
    openTasks: [{ title: 'Breathing exercise' }], // would normally trigger #3
    unreadMessage: { sender_name: 'Dr. Reyes', body: 'Hello' },
    lastNightSleepHours: 4.5,
  });
  assert.equal(focus.kind, 'session');
  assert.ok(focus.headline.includes('9:00 AM'), 'session card shows session time');
  assert.equal(focus.primary.target, 'patient-sessions');
  assert.equal(focus.secondaryLabel, 'Later');
  assert.equal(focus.eyebrow, "TODAY'S FOCUS");
});

test('pickTodaysFocus: session further than 24h does NOT trigger session card', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');
  const focus = pickTodaysFocus({
    now,
    nextSessionAt: '2026-04-25T10:00:00Z', // 6 days away
    checkedInToday: false,
  });
  assert.equal(focus.kind, 'checkin');
});

test('pickTodaysFocus: check-in not done today → checkin card', () => {
  const focus = pickTodaysFocus({
    checkedInToday: false,
    openTasks: [{ title: 'Walk 10 min' }], // lower priority
    unreadMessage: { sender_name: 'Dr. X', body: 'hi' },
  });
  assert.equal(focus.kind, 'checkin');
  assert.equal(focus.primary.target, 'pt-wellness');
  assert.ok(/2-minute/i.test(focus.headline));
});

test('pickTodaysFocus: pending task → task card with streak caption', () => {
  const focus = pickTodaysFocus({
    checkedInToday: true,
    openTasks: [{ title: 'Breathing exercise' }],
    streakDays: 5,
  });
  assert.equal(focus.kind, 'task');
  assert.ok(focus.headline.includes('Breathing exercise'));
  assert.ok(focus.caption.includes('5-day streak'));
  assert.equal(focus.primary.target, 'pt-wellness');
});

test('pickTodaysFocus: pending task with no streak → generic caption', () => {
  const focus = pickTodaysFocus({
    checkedInToday: true,
    openTasks: [{ title: 'Journal entry' }],
    streakDays: 0,
  });
  assert.equal(focus.kind, 'task');
  assert.ok(!/\d+-day streak/.test(focus.caption));
});

test('pickTodaysFocus: unread clinician message → message card with truncated preview', () => {
  const longBody = 'This is a very long clinician message body intended to exceed the sixty character soft limit for the focus card preview.';
  const focus = pickTodaysFocus({
    checkedInToday: true,
    openTasks: [],
    unreadMessage: { sender_name: 'Dr. Reyes', body: longBody },
  });
  assert.equal(focus.kind, 'message');
  assert.ok(focus.headline.includes('Dr. Reyes'));
  assert.ok(focus.caption.length <= 60);
  assert.equal(focus.primary.target, 'patient-messages');
});

test('pickTodaysFocus: low sleep (<6h) → sleep card', () => {
  const focus = pickTodaysFocus({
    checkedInToday: true,
    openTasks: [],
    unreadMessage: null,
    lastNightSleepHours: 4.8,
  });
  assert.equal(focus.kind, 'sleep');
  assert.ok(/wind-down/i.test(focus.caption));
});

test('pickTodaysFocus: fallback when nothing pending', () => {
  const focus = pickTodaysFocus({
    checkedInToday: true,
    openTasks: [],
    unreadMessage: null,
    lastNightSleepHours: 7.5,
  });
  assert.equal(focus.kind, 'fallback');
  assert.equal(focus.hide, false);
  assert.equal(focus.primary.target, 'pt-outcomes');
});

test('pickTodaysFocus: fallback is HIDDEN when snoozed for today', () => {
  const focus = pickTodaysFocus({
    checkedInToday: true,
    openTasks: [],
    unreadMessage: null,
    lastNightSleepHours: 7.5,
    snoozed: true,
  });
  assert.equal(focus.kind, 'fallback');
  assert.equal(focus.hide, true);
});

test('pickTodaysFocus: snooze does NOT hide a real actionable card', () => {
  // Snooze only hides the fallback — a real task card should still render.
  const focus = pickTodaysFocus({
    checkedInToday: true,
    openTasks: [{ title: 'Read article' }],
    snoozed: true,
  });
  assert.equal(focus.kind, 'task');
  assert.equal(focus.hide, false);
});

// ── pickTodaysFocus: icon field ──────────────────────────────────────────────

test('pickTodaysFocus: returns an icon field for every branch', () => {
  const now = Date.parse('2026-04-19T10:00:00Z');

  // session
  assert.equal(
    pickTodaysFocus({ now, nextSessionAt: '2026-04-20T09:00:00Z' }).icon,
    'calendar',
  );
  // checkin
  assert.equal(
    pickTodaysFocus({ checkedInToday: false }).icon,
    'clipboard',
  );
  // task
  assert.equal(
    pickTodaysFocus({ checkedInToday: true, openTasks: [{ title: 'Walk' }] }).icon,
    'check',
  );
  // message
  assert.equal(
    pickTodaysFocus({
      checkedInToday: true, openTasks: [],
      unreadMessage: { sender_name: 'Dr. X', body: 'hi' },
    }).icon,
    'mail',
  );
  // sleep
  assert.equal(
    pickTodaysFocus({
      checkedInToday: true, openTasks: [], unreadMessage: null,
      lastNightSleepHours: 4.5,
    }).icon,
    'moon',
  );
  // fallback
  assert.equal(
    pickTodaysFocus({
      checkedInToday: true, openTasks: [], unreadMessage: null,
      lastNightSleepHours: 8,
    }).icon,
    'sparkle',
  );
});

// ── isDemoPatient ─────────────────────────────────────────────────────────────

function _mockStorage(map = {}) {
  return { getItem: (k) => (k in map ? map[k] : null) };
}

test('isDemoPatient: null/undefined user with no token/flag → false', () => {
  assert.equal(
    isDemoPatient(null, { getToken: () => null, storage: _mockStorage() }),
    false,
  );
  assert.equal(
    isDemoPatient(undefined, { getToken: () => null, storage: _mockStorage() }),
    false,
  );
});

test('isDemoPatient: detects seeded patient-demo-token', () => {
  const r = isDemoPatient(
    { role: 'patient', email: 'real@hospital.com' },
    { getToken: () => 'patient-demo-token', storage: _mockStorage() },
  );
  assert.equal(r, true);
});

test('isDemoPatient: detects demo email (case-insensitive)', () => {
  const r = isDemoPatient(
    { role: 'patient', email: 'Demo.User@Example.com' },
    { getToken: () => 'real-token', storage: _mockStorage() },
  );
  assert.equal(r, true);
});

test('isDemoPatient: detects ds_force_demo_patient flag', () => {
  const r = isDemoPatient(
    { role: 'clinician', email: 'anyone@corp.com' },
    {
      getToken: () => 'real-token',
      storage: _mockStorage({ ds_force_demo_patient: '1' }),
    },
  );
  assert.equal(r, true);
});

test('isDemoPatient: non-patient role with normal email → false', () => {
  const r = isDemoPatient(
    { role: 'clinician', email: 'real@clinic.com' },
    { getToken: () => null, storage: _mockStorage() },
  );
  assert.equal(r, false);
});

test('isDemoPatient: patient with non-demo email → false', () => {
  const r = isDemoPatient(
    { role: 'patient', email: 'samantha@hospital.com' },
    { getToken: () => null, storage: _mockStorage() },
  );
  assert.equal(r, false);
});

// ── DEMO_PATIENT seed ─────────────────────────────────────────────────────────

test('DEMO_PATIENT: profile matches Samantha Li · MDD · tDCS', () => {
  assert.equal(DEMO_PATIENT.profile.first_name, 'Samantha');
  assert.equal(DEMO_PATIENT.profile.last_name, 'Li');
  assert.equal(DEMO_PATIENT.profile.age, 34);
  assert.equal(DEMO_PATIENT.profile.condition, 'Major Depressive Disorder');
  assert.equal(DEMO_PATIENT.profile.modality, 'tDCS');
});

test('DEMO_PATIENT: activeCourse has 20 planned / 12 done with full 3-member care team', () => {
  assert.equal(DEMO_PATIENT.activeCourse.total_sessions_planned, 20);
  assert.equal(DEMO_PATIENT.activeCourse.session_count, 12);
  assert.equal(DEMO_PATIENT.activeCourse.modality_slug, 'tDCS');
  assert.equal(DEMO_PATIENT.activeCourse.status, 'active');
  assert.equal(DEMO_PATIENT.activeCourse.care_team.length, 3);
  const roles = DEMO_PATIENT.activeCourse.care_team.map(m => m.role);
  assert.ok(roles.includes('Clinical Director'));
  assert.ok(roles.includes('Nurse Practitioner'));
  assert.ok(roles.includes('tDCS Technician'));
});

test('DEMO_PATIENT.outcomes: ≥5 dated PHQ-9 entries with non-null score_numeric', () => {
  const phq = DEMO_PATIENT.outcomes.filter(o => o.template_name === 'PHQ-9');
  assert.ok(phq.length >= 5, 'at least 5 PHQ-9 entries');
  for (const o of phq) {
    assert.ok(o.administered_at, 'each entry has administered_at');
    assert.equal(typeof o.score_numeric, 'number');
    assert.ok(o.score_numeric != null && Number.isFinite(o.score_numeric));
  }
  // Trend drops 22 → 14 over the series.
  const sorted = phq.slice().sort(
    (a, b) => new Date(a.administered_at) - new Date(b.administered_at),
  );
  assert.equal(sorted[0].score_numeric, 22);
  assert.equal(sorted[sorted.length - 1].score_numeric, 14);
});

test('DEMO_PATIENT.outcomes: GAD-7 has ≥4 dated entries dropping 15 → 10', () => {
  const gad = DEMO_PATIENT.outcomes.filter(o => o.template_name === 'GAD-7');
  assert.ok(gad.length >= 4);
  const sorted = gad.slice().sort(
    (a, b) => new Date(a.administered_at) - new Date(b.administered_at),
  );
  assert.equal(sorted[0].score_numeric, 15);
  assert.equal(sorted[sorted.length - 1].score_numeric, 10);
});

test('DEMO_PATIENT.tasks: 4 items, 2 complete + 2 pending', () => {
  assert.equal(DEMO_PATIENT.tasks.length, 4);
  const done = DEMO_PATIENT.tasks.filter(t => t.completed).length;
  assert.equal(done, 2);
  assert.equal(DEMO_PATIENT.tasks.length - done, 2);
});

test('DEMO_PATIENT.messages: 1 unread clinician message from Dr. Kolmar', () => {
  assert.equal(DEMO_PATIENT.messages.length, 1);
  const m = DEMO_PATIENT.messages[0];
  assert.equal(m.is_read, false);
  assert.ok(/Kolmar/.test(m.sender_name));
  assert.ok(/PHQ-9/.test(m.body));
});

test('DEMO_PATIENT.wearables: patient-friendly values (HRV 48, sleep 7.4h, RHR 62, 7.8k steps)', () => {
  const w = DEMO_PATIENT.wearables;
  assert.equal(w.hrv, 48);
  assert.equal(w.sleep, 7.4);
  assert.equal(w.rhr, 62);
  assert.equal(w.steps, 7800);
  assert.equal(w.sleep_trend_7d.length, 7);
});

test('DEMO_PATIENT: streak = 6 and mood_7d is a 7-day 1–10 array', () => {
  assert.equal(DEMO_PATIENT.streak, 6);
  assert.equal(DEMO_PATIENT.mood_7d.length, 7);
  for (const v of DEMO_PATIENT.mood_7d) {
    assert.ok(v >= 1 && v <= 10);
  }
});

// ── demoOverlay ────────────────────────────────────────────────────────────

test('demoOverlay: real data wins over demo when real is non-empty', () => {
  const realCourse = { id: 'real-1', status: 'active', total_sessions_planned: 6 };
  const { value, usedDemo } = demoOverlay(realCourse, DEMO_PATIENT.activeCourse);
  assert.equal(value.id, 'real-1');
  assert.equal(usedDemo, false);
});

test('demoOverlay: demo fills when real is null/undefined/empty-string/empty-array', () => {
  const d = { hello: 'world' };
  assert.deepEqual(demoOverlay(null, d),      { value: d, usedDemo: true });
  assert.deepEqual(demoOverlay(undefined, d), { value: d, usedDemo: true });
  assert.deepEqual(demoOverlay('', d),        { value: d, usedDemo: true });
  assert.deepEqual(demoOverlay([], d),        { value: d, usedDemo: true });
});

test('demoOverlay: non-empty array keeps real (does not overwrite)', () => {
  const real = [{ id: 1, is_read: false }];
  const demo = [{ id: 99, is_read: true }];
  const { value, usedDemo } = demoOverlay(real, demo);
  assert.equal(usedDemo, false);
  assert.equal(value[0].id, 1);
});

test('demoOverlay: zero-number is kept as real (not treated as empty)', () => {
  // 0 is not "empty" — it's a valid value (e.g. session_count = 0).
  const { value, usedDemo } = demoOverlay(0, 42);
  assert.equal(usedDemo, false);
  assert.equal(value, 0);
});

// ── pickCallTier (voice/video call selector) ─────────────────────────────────

test('pickCallTier: Tier A when course has a clinician_meeting_url', () => {
  const r = pickCallTier({
    activeCourse: {
      clinician_meeting_url: 'https://meet.example.com/room-abc',
      primary_clinician_name: 'Dr. Kolmar',
    },
    mode: 'video',
  });
  assert.equal(r.tier, 'A');
  assert.equal(r.mode, 'video');
  assert.equal(r.url, 'https://meet.example.com/room-abc');
  assert.equal(r.demo, false);
});

test('pickCallTier: Tier A falls back to care_team_meeting_url / meeting_url', () => {
  const r1 = pickCallTier({
    activeCourse: { care_team_meeting_url: 'https://meet.example.com/teamroom' },
    mode: 'voice',
  });
  assert.equal(r1.tier, 'A');
  assert.equal(r1.url, 'https://meet.example.com/teamroom');
  assert.equal(r1.mode, 'voice');

  const r2 = pickCallTier({
    activeCourse: { meeting_url: 'https://meet.example.com/generic' },
  });
  assert.equal(r2.tier, 'A');
  assert.equal(r2.url, 'https://meet.example.com/generic');
});

test('pickCallTier: rejects non-http(s) meeting URLs', () => {
  // Defensive — if the backend ever serves a javascript: URL we must not
  // open it. We downgrade to the next tier.
  const r = pickCallTier({
    activeCourse: {
      clinician_meeting_url: 'javascript:alert(1)',
      primary_clinician_name: 'Dr. Kolmar',
    },
  });
  assert.notEqual(r.tier, 'A');
});

test('pickCallTier: Tier B when clinician assigned but no meeting URL', () => {
  const r = pickCallTier({
    activeCourse: { primary_clinician_name: 'Dr. Kolmar' },
    mode: 'video',
  });
  assert.equal(r.tier, 'B');
  assert.equal(r.mode, 'video');
  assert.ok(/video call request/i.test(r.subject));
  assert.ok(/video call/i.test(r.body));
  assert.ok(/Recent check-in/i.test(r.body));
  assert.equal(r.demo, false);
});

test('pickCallTier: Tier B from /me clinician_id works too', () => {
  const r = pickCallTier({
    activeCourse: null,
    me: { patient_id: 'pat-1', clinician_id: 'cln-abc' },
    mode: 'voice',
  });
  assert.equal(r.tier, 'B');
  assert.equal(r.mode, 'voice');
  assert.ok(/Voice call request/i.test(r.subject));
});

test('pickCallTier: Tier C when no clinician is available anywhere', () => {
  const r = pickCallTier({
    activeCourse: { status: 'active' },
    me: { patient_id: 'pat-2' },
    mode: 'video',
  });
  assert.equal(r.tier, 'C');
  assert.equal(r.mode, 'video');
});

test('pickCallTier: demo mode always returns Tier A pointing at Jitsi', () => {
  // No activeCourse, no me, no clinician — demo mode should still resolve
  // to a real openable URL so the button never silently fails.
  const r = pickCallTier({ mode: 'video' }, { demo: true, patientId: 'demo-sam-li' });
  assert.equal(r.tier, 'A');
  assert.equal(r.demo, true);
  assert.ok(/^https:\/\/meet\.jit\.si\/deepsynaps-demo-/.test(r.url));
  assert.ok(r.url.includes('demo-sam-li'));
});

test('pickCallTier: defaults mode to video when mode param is missing/invalid', () => {
  const r = pickCallTier({ activeCourse: { primary_clinician_name: 'Dr. X' } });
  assert.equal(r.mode, 'video');
  const r2 = pickCallTier({ activeCourse: { primary_clinician_name: 'Dr. X' }, mode: 'bogus' });
  assert.equal(r2.mode, 'video');
});

// ── demoMessagesSeed ────────────────────────────────────────────────────────

test('demoMessagesSeed: returns exactly 3 messages, all tagged _demo', () => {
  const seed = demoMessagesSeed();
  assert.equal(seed.length, 3);
  for (const m of seed) {
    assert.equal(m._demo, true);
    assert.ok(m.id);
    assert.ok(m.body);
    assert.ok(m.created_at);
  }
});

test('demoMessagesSeed: alternates clinician → patient → clinician', () => {
  const seed = demoMessagesSeed();
  assert.equal(seed[0].sender_type, 'clinician');
  assert.equal(seed[1].sender_type, 'patient');
  assert.equal(seed[2].sender_type, 'clinician');
  // All three share the same thread so they render as one conversation.
  const threadIds = new Set(seed.map(m => m.thread_id));
  assert.equal(threadIds.size, 1);
});

test('demoMessagesSeed: chronology is oldest → newest; latest clinician unread', () => {
  const now = Date.parse('2026-04-19T18:00:00Z');
  const seed = demoMessagesSeed(now);
  const t0 = new Date(seed[0].created_at).getTime();
  const t1 = new Date(seed[1].created_at).getTime();
  const t2 = new Date(seed[2].created_at).getTime();
  assert.ok(t0 < t1, 'msg 0 older than msg 1');
  assert.ok(t1 < t2, 'msg 1 older than msg 2');
  // Newest (clinician) is unread so the read-receipt flow has something to do.
  assert.equal(seed[2].is_read, false);
  // Older two are already read.
  assert.equal(seed[0].is_read, true);
  assert.equal(seed[1].is_read, true);
});

test('demoMessagesSeed: content matches Dr. Kolmar / Samantha thread', () => {
  const seed = demoMessagesSeed();
  assert.ok(/Kolmar/i.test(seed[0].sender_name));
  assert.ok(/Samantha/i.test(seed[0].body));
  assert.ok(/session 10|headache|sleep/i.test(seed[1].body));
  assert.ok(/scalp|electrode|saline/i.test(seed[2].body));
});
