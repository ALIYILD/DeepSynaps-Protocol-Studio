// Tests for patient-dashboard-helpers.js
// All exports are pure (no DOM, no global side-effects), so these run
// directly under `node --test` without any stub infrastructure.

import { describe, it } from 'node:test';
import assert from 'node:assert';

// localStorage stub (needed only by draft / self-assessment helpers)
if (typeof globalThis.localStorage === 'undefined') {
  const _s = {};
  globalThis.localStorage = {
    getItem:    k => _s[k] ?? null,
    setItem:    (k, v) => { _s[k] = String(v); },
    removeItem: k => { delete _s[k]; },
  };
}

import {
  computeCountdown,
  phaseLabel,
  outcomeGoalMarker,
  pickTodaysFocus,
  isDemoPatient,
  demoOverlay,
  groupOutcomesByTemplate,
  classifyAssessmentStatus,
  scoreContext,
  draftStorageKey,
  loadDraft,
  saveDraft,
  clearDraft,
  demoAssessmentSeed,
  pickCallTier,
  demoMessagesSeed,
  SELF_ASSESSMENT_SURVEYS,
  SELF_ASSESSMENT_KEYS,
  getSelfAssessmentLastFiled,
  setSelfAssessmentLastFiled,
  getSelfAssessmentDraft,
  setSelfAssessmentDraft,
  clearSelfAssessmentDraft,
  demoSelfAssessmentSeed,
  sparklineSVG,
  DEMO_PATIENT,
  DEMO_CLINICIAN_DASHBOARD,
} from './patient-dashboard-helpers.js';

// ── computeCountdown ──────────────────────────────────────────────────────────
describe('computeCountdown', () => {
  const NOW = new Date('2026-01-10T12:00:00Z').getTime();

  it('returns null for null input', () => {
    assert.strictEqual(computeCountdown(null, NOW), null);
  });

  it('returns null for undefined input', () => {
    assert.strictEqual(computeCountdown(undefined, NOW), null);
  });

  it('returns { days: 0, label: "Today" } for a past or same-time date', () => {
    const pastDate = new Date(NOW - 1000).toISOString();
    const result = computeCountdown(pastDate, NOW);
    assert.deepStrictEqual(result, { days: 0, label: 'Today' });
  });

  it('returns "Tomorrow" for exactly 1 day ahead', () => {
    const tomorrow = new Date(NOW + 86400000).toISOString();
    const result = computeCountdown(tomorrow, NOW);
    assert.strictEqual(result.label, 'Tomorrow');
    assert.strictEqual(result.days, 1);
  });

  it('returns "In N days" for dates further out', () => {
    const future = new Date(NOW + 3 * 86400000).toISOString();
    const result = computeCountdown(future, NOW);
    assert.ok(result.label.startsWith('In '));
    assert.ok(result.days >= 2); // ceil of 3 days should be 3
  });
});

// ── phaseLabel ────────────────────────────────────────────────────────────────
describe('phaseLabel', () => {
  it('returns "Getting started" for 0%', () => {
    assert.strictEqual(phaseLabel(0), 'Getting started');
  });

  it('returns "Getting started" for null', () => {
    assert.strictEqual(phaseLabel(null), 'Getting started');
  });

  it('returns "Early treatment" for 15%', () => {
    assert.strictEqual(phaseLabel(15), 'Early treatment');
  });

  it('returns "Active treatment" for 40%', () => {
    assert.strictEqual(phaseLabel(40), 'Active treatment');
  });

  it('returns "Consolidation" for 70%', () => {
    assert.strictEqual(phaseLabel(70), 'Consolidation');
  });

  it('returns "Final phase" for 90%', () => {
    assert.strictEqual(phaseLabel(90), 'Final phase');
  });

  it('returns "Complete" for 100%', () => {
    assert.strictEqual(phaseLabel(100), 'Complete');
  });
});

// ── outcomeGoalMarker ──────────────────────────────────────────────────────────
describe('outcomeGoalMarker', () => {
  it('sets goal=5 and down=true for PHQ-9', () => {
    const r = outcomeGoalMarker({ template_name: 'PHQ-9', score_numeric: 14 });
    assert.strictEqual(r.goal, 5);
    assert.strictEqual(r.down, true);
    assert.strictEqual(r.maxRange, 27);
  });

  it('sets goal=4 and down=true for GAD-7', () => {
    const r = outcomeGoalMarker({ template_name: 'GAD-7', score_numeric: 10 });
    assert.strictEqual(r.goal, 4);
    assert.strictEqual(r.down, true);
    assert.strictEqual(r.maxRange, 21);
  });

  it('sets goal=5 and down=true for PSQI', () => {
    const r = outcomeGoalMarker({ template_name: 'PSQI', score_numeric: 8 });
    assert.strictEqual(r.goal, 5);
    assert.strictEqual(r.down, true);
  });

  it('fillPct is 0 when PHQ-9 score equals max range (worst case)', () => {
    const r = outcomeGoalMarker({ template_name: 'PHQ-9', score_numeric: 27 });
    assert.strictEqual(r.fillPct, 0);
  });

  it('fillPct is 100 when PHQ-9 score is 0 (best case)', () => {
    const r = outcomeGoalMarker({ template_name: 'PHQ-9', score_numeric: 0 });
    assert.strictEqual(r.fillPct, 100);
  });

  it('supports template_title alias', () => {
    const r = outcomeGoalMarker({ template_title: 'PHQ-9', score_numeric: 10 });
    assert.strictEqual(r.goal, 5);
  });
});

// ── pickTodaysFocus ───────────────────────────────────────────────────────────
describe('pickTodaysFocus', () => {
  const NOW = Date.now();

  it('returns session kind when session is within 24h', () => {
    const result = pickTodaysFocus({
      nextSessionAt: new Date(NOW + 2 * 3600 * 1000).toISOString(),
      now: NOW,
    });
    assert.strictEqual(result.kind, 'session');
    assert.strictEqual(result.primary.target, 'patient-sessions');
  });

  it('returns checkin kind when not checked in today', () => {
    const result = pickTodaysFocus({ checkedInToday: false, now: NOW });
    assert.strictEqual(result.kind, 'checkin');
    assert.strictEqual(result.primary.target, 'pt-wellness');
  });

  it('returns task kind when open tasks exist', () => {
    const result = pickTodaysFocus({
      checkedInToday: true,
      openTasks: [{ title: 'Read: tDCS chapter' }],
      now: NOW,
    });
    assert.strictEqual(result.kind, 'task');
    assert.ok(result.headline.includes('Read: tDCS chapter'));
  });

  it('returns message kind for unread message', () => {
    const result = pickTodaysFocus({
      checkedInToday: true,
      openTasks: [],
      unreadMessage: { sender_name: 'Dr. Test', body: 'Hello there' },
      now: NOW,
    });
    assert.strictEqual(result.kind, 'message');
    assert.ok(result.headline.includes('Dr. Test'));
  });

  it('returns sleep kind when lastNightSleepHours < 6', () => {
    const result = pickTodaysFocus({
      checkedInToday: true,
      openTasks: [],
      lastNightSleepHours: 4.5,
      now: NOW,
    });
    assert.strictEqual(result.kind, 'sleep');
  });

  it('returns fallback kind when nothing is pending', () => {
    const result = pickTodaysFocus({ checkedInToday: true, now: NOW });
    assert.strictEqual(result.kind, 'fallback');
  });

  it('fallback hides when snoozed=true', () => {
    const result = pickTodaysFocus({ checkedInToday: true, snoozed: true, now: NOW });
    assert.strictEqual(result.kind, 'fallback');
    assert.strictEqual(result.hide, true);
  });

  it('always returns eyebrow "TODAY\'S FOCUS"', () => {
    const result = pickTodaysFocus({ now: NOW });
    assert.strictEqual(result.eyebrow, "TODAY'S FOCUS");
  });
});

// ── isDemoPatient ─────────────────────────────────────────────────────────────
describe('isDemoPatient', () => {
  it('returns false for null user', () => {
    assert.strictEqual(isDemoPatient(null), false);
  });

  it('returns false for non-patient role', () => {
    assert.strictEqual(isDemoPatient({ role: 'clinician', email: 'demo@example.com' }), false);
  });

  it('returns true when email contains "demo" and role is patient', () => {
    assert.strictEqual(isDemoPatient({ role: 'patient', email: 'patient-demo@clinic.com' }), true);
  });

  it('returns true when email contains "example" and role is patient', () => {
    assert.strictEqual(isDemoPatient({ role: 'patient', email: 'test@example.com' }), true);
  });

  it('returns false when role is patient but email is real', () => {
    assert.strictEqual(isDemoPatient({ role: 'patient', email: 'alice@hospital.org' }), false);
  });

  it('returns true when getToken returns a token containing patient-demo-token', () => {
    const result = isDemoPatient(null, {
      getToken: () => 'patient-demo-token-xyz',
      storage: { getItem: () => null },
    });
    assert.strictEqual(result, true);
  });

  it('returns true when storage ds_force_demo_patient === "1"', () => {
    const result = isDemoPatient({ role: 'clinician', email: 'x@y.com' }, {
      storage: { getItem: (k) => k === 'ds_force_demo_patient' ? '1' : null },
    });
    assert.strictEqual(result, true);
  });
});

// ── demoOverlay ───────────────────────────────────────────────────────────────
describe('demoOverlay', () => {
  it('returns { value: demo, usedDemo: true } when real is null', () => {
    const result = demoOverlay(null, 'fallback');
    assert.deepStrictEqual(result, { value: 'fallback', usedDemo: true });
  });

  it('returns { value: demo, usedDemo: true } when real is empty string', () => {
    const result = demoOverlay('', 'fallback');
    assert.deepStrictEqual(result, { value: 'fallback', usedDemo: true });
  });

  it('returns { value: demo, usedDemo: true } when real is empty array', () => {
    const result = demoOverlay([], ['item']);
    assert.deepStrictEqual(result, { value: ['item'], usedDemo: true });
  });

  it('returns { value: real, usedDemo: false } when real is a non-empty string', () => {
    const result = demoOverlay('real data', 'fallback');
    assert.deepStrictEqual(result, { value: 'real data', usedDemo: false });
  });

  it('returns { value: real, usedDemo: false } when real is a non-empty array', () => {
    const result = demoOverlay([1, 2], ['demo']);
    assert.deepStrictEqual(result, { value: [1, 2], usedDemo: false });
  });
});

// ── groupOutcomesByTemplate ───────────────────────────────────────────────────
describe('groupOutcomesByTemplate', () => {
  const outcomes = [
    { template_name: 'PHQ-9', score_numeric: 22, administered_at: '2026-01-01T00:00:00Z' },
    { template_name: 'PHQ-9', score_numeric: 18, administered_at: '2026-01-08T00:00:00Z' },
    { template_name: 'GAD-7', score_numeric: 15, administered_at: '2026-01-02T00:00:00Z' },
    { template_name: 'GAD-7', score_numeric: 12, administered_at: '2026-01-09T00:00:00Z' },
  ];

  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(groupOutcomesByTemplate([]), []);
  });

  it('groups into 2 templates', () => {
    const result = groupOutcomesByTemplate(outcomes);
    assert.strictEqual(result.length, 2);
  });

  it('each group has baseline and latest', () => {
    const result = groupOutcomesByTemplate(outcomes);
    for (const g of result) {
      assert.ok(g.baseline != null, 'expected baseline');
      assert.ok(g.latest != null, 'expected latest');
    }
  });

  it('allScores is sorted ascending by date', () => {
    const result = groupOutcomesByTemplate(outcomes);
    const phq = result.find(g => g.template_name === 'PHQ-9');
    assert.deepStrictEqual(phq.allScores, [22, 18]);
  });

  it('respects limit parameter', () => {
    const result = groupOutcomesByTemplate(outcomes, 1);
    assert.strictEqual(result.length, 1);
  });

  it('supports template_title as key', () => {
    const r = groupOutcomesByTemplate([
      { template_title: 'PHQ-9', score_numeric: 10, administered_at: '2026-01-01Z' },
    ]);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].template_name, 'PHQ-9');
  });
});

// ── classifyAssessmentStatus ──────────────────────────────────────────────────
describe('classifyAssessmentStatus', () => {
  const NOW = new Date('2026-01-10T12:00:00Z').getTime();

  it('returns "due" for null input', () => {
    assert.strictEqual(classifyAssessmentStatus(null, NOW), 'due');
  });

  it('returns "completed" when status is "done"', () => {
    assert.strictEqual(classifyAssessmentStatus({ status: 'done' }, NOW), 'completed');
  });

  it('returns "completed" when administered_at is set', () => {
    assert.strictEqual(classifyAssessmentStatus({ administered_at: '2026-01-09Z' }, NOW), 'completed');
  });

  it('returns "in-progress" for status "partial"', () => {
    assert.strictEqual(classifyAssessmentStatus({ status: 'partial' }, NOW), 'in-progress');
  });

  it('returns "upcoming" for status "scheduled"', () => {
    assert.strictEqual(classifyAssessmentStatus({ status: 'scheduled' }, NOW), 'upcoming');
  });

  it('returns "due" for past due_date', () => {
    assert.strictEqual(
      classifyAssessmentStatus({ due_date: '2026-01-01T00:00:00Z' }, NOW),
      'due'
    );
  });

  it('returns "upcoming" for future due_date', () => {
    assert.strictEqual(
      classifyAssessmentStatus({ due_date: '2026-12-01T00:00:00Z' }, NOW),
      'upcoming'
    );
  });
});

// ── scoreContext ──────────────────────────────────────────────────────────────
describe('scoreContext', () => {
  const meta = {
    scoreRanges: [
      { max: 4,  label: 'Minimal',  note: 'Minimal symptoms' },
      { max: 9,  label: 'Mild',     note: 'Mild symptoms' },
      { max: 14, label: 'Moderate', note: 'Moderate symptoms' },
      { max: 27, label: 'Severe',   note: 'Severe symptoms' },
    ]
  };

  it('returns null for null score', () => {
    assert.strictEqual(scoreContext(meta, null), null);
  });

  it('returns null for null meta', () => {
    assert.strictEqual(scoreContext(null, 5), null);
  });

  it('returns "Minimal" for score 3', () => {
    const r = scoreContext(meta, 3);
    assert.strictEqual(r.label, 'Minimal');
  });

  it('returns "Moderate" for score 14', () => {
    const r = scoreContext(meta, 14);
    assert.strictEqual(r.label, 'Moderate');
  });

  it('returns "Severe" for score 27', () => {
    const r = scoreContext(meta, 27);
    assert.strictEqual(r.label, 'Severe');
  });
});

// ── draftStorageKey / loadDraft / saveDraft / clearDraft ─────────────────────
describe('draftStorageKey', () => {
  it('returns a string with the id embedded', () => {
    const key = draftStorageKey('abc-123');
    assert.ok(key.includes('abc-123'));
  });
});

describe('saveDraft + loadDraft + clearDraft', () => {
  const mockStorage = (() => {
    const s = {};
    return {
      getItem:    k => s[k] ?? null,
      setItem:    (k, v) => { s[k] = v; },
      removeItem: k => { delete s[k]; },
    };
  })();

  it('saves and loads a draft object', () => {
    saveDraft('test-assess-1', { q1: 3, q2: 5 }, mockStorage);
    const d = loadDraft('test-assess-1', mockStorage);
    assert.ok(d !== null);
    assert.deepStrictEqual(d.answers, { q1: 3, q2: 5 });
    assert.ok(typeof d.savedAt === 'string');
  });

  it('clearDraft removes the draft', () => {
    saveDraft('test-assess-2', { a: 1 }, mockStorage);
    clearDraft('test-assess-2', mockStorage);
    const d = loadDraft('test-assess-2', mockStorage);
    assert.strictEqual(d, null);
  });

  it('loadDraft returns null when no draft exists', () => {
    const d = loadDraft('nonexistent-id', mockStorage);
    assert.strictEqual(d, null);
  });
});

// ── demoAssessmentSeed ────────────────────────────────────────────────────────
describe('demoAssessmentSeed', () => {
  const seed = demoAssessmentSeed(new Date('2026-01-10T12:00:00Z').getTime());

  it('returns an array of 3 assessments', () => {
    assert.strictEqual(seed.length, 3);
  });

  it('first assessment has status "pending"', () => {
    assert.strictEqual(seed[0].status, 'pending');
  });

  it('second assessment is completed', () => {
    assert.strictEqual(seed[1].status, 'completed');
  });

  it('third assessment is scheduled (upcoming)', () => {
    assert.strictEqual(seed[2].status, 'scheduled');
  });

  it('all rows carry _demo: true', () => {
    for (const row of seed) {
      assert.strictEqual(row._demo, true);
    }
  });
});

// ── pickCallTier ──────────────────────────────────────────────────────────────
describe('pickCallTier', () => {
  it('returns Tier A with Jitsi URL in demo mode', () => {
    const result = pickCallTier({ mode: 'video' }, { demo: true, patientId: 'demo-pt-001' });
    assert.strictEqual(result.tier, 'A');
    assert.ok(result.url.startsWith('https://meet.jit.si/'));
    assert.strictEqual(result.demo, true);
  });

  it('returns Tier A when course has clinician_meeting_url', () => {
    const result = pickCallTier({
      activeCourse: { clinician_meeting_url: 'https://zoom.us/j/12345' }
    });
    assert.strictEqual(result.tier, 'A');
    assert.strictEqual(result.url, 'https://zoom.us/j/12345');
    assert.strictEqual(result.demo, false);
  });

  it('returns Tier B when clinician assigned but no meeting URL', () => {
    const result = pickCallTier({
      activeCourse: { primary_clinician_name: 'Dr. Test' }
    });
    assert.strictEqual(result.tier, 'B');
    assert.ok(typeof result.subject === 'string');
  });

  it('returns Tier C when no clinician assigned', () => {
    const result = pickCallTier({});
    assert.strictEqual(result.tier, 'C');
  });

  it('voice mode sets correct subject in Tier B', () => {
    const result = pickCallTier(
      { mode: 'voice', activeCourse: { primary_clinician_id: 'dr-1' } }
    );
    assert.strictEqual(result.tier, 'B');
    assert.ok(result.subject.toLowerCase().includes('voice'));
  });
});

// ── demoMessagesSeed ──────────────────────────────────────────────────────────
describe('demoMessagesSeed', () => {
  const NOW = Date.now();
  const seed = demoMessagesSeed(NOW);

  it('returns an array with at least 3 items', () => {
    assert.ok(seed.length >= 3);
  });

  it('first message is from a clinician', () => {
    assert.strictEqual(seed[0].sender_type, 'clinician');
  });

  it('all rows carry _demo: true', () => {
    for (const row of seed) {
      assert.strictEqual(row._demo, true);
    }
  });
});

// ── SELF_ASSESSMENT_SURVEYS ───────────────────────────────────────────────────
describe('SELF_ASSESSMENT_SURVEYS', () => {
  it('contains at least 6 surveys', () => {
    assert.ok(Object.keys(SELF_ASSESSMENT_SURVEYS).length >= 6);
  });

  it('daily_mood survey has computeScore function', () => {
    assert.strictEqual(typeof SELF_ASSESSMENT_SURVEYS.daily_mood.computeScore, 'function');
  });

  it('daily_mood computeScore returns 0 for minimum inputs', () => {
    const score = SELF_ASSESSMENT_SURVEYS.daily_mood.computeScore({ mood: 1, energy: 1 });
    assert.strictEqual(score, 0);
  });

  it('daily_mood computeScore returns 100 for maximum inputs', () => {
    const score = SELF_ASSESSMENT_SURVEYS.daily_mood.computeScore({ mood: 5, energy: 10 });
    assert.strictEqual(score, 100);
  });

  it('daily_symptoms computeScore returns 100 when all symptom sliders are 0', () => {
    const zero = { headache:0, nausea:0, dizziness:0, mood_swings:0, cognitive_fog:0,
                   sleep_disturbance:0, anxiety:0, fatigue:0, pain:0 };
    const score = SELF_ASSESSMENT_SURVEYS.daily_symptoms.computeScore(zero);
    assert.strictEqual(score, 100);
  });

  it('adherence computeScore returns 100 when all adherence responses are 2', () => {
    const all_yes = { medications: 2, exercises: 2, device: 2, sleep_hygiene: 2 };
    const score = SELF_ASSESSMENT_SURVEYS.adherence.computeScore(all_yes);
    assert.strictEqual(score, 100);
  });

  it('SELF_ASSESSMENT_KEYS contains at least 6 survey keys', () => {
    assert.ok(SELF_ASSESSMENT_KEYS.length >= 6);
    assert.ok(SELF_ASSESSMENT_KEYS.includes('daily_mood'));
    assert.ok(SELF_ASSESSMENT_KEYS.includes('daily_symptoms'));
  });
});

// ── getSelfAssessmentLastFiled / setSelfAssessmentLastFiled ───────────────────
describe('self-assessment last-filed helpers', () => {
  const store = (() => {
    const s = {};
    return { getItem: k => s[k] ?? null, setItem: (k, v) => { s[k] = v; }, removeItem: k => { delete s[k]; } };
  })();

  it('returns null when nothing stored', () => {
    assert.strictEqual(getSelfAssessmentLastFiled('daily_mood', store), null);
  });

  it('stores and retrieves an ISO string', () => {
    const iso = '2026-01-10T08:00:00Z';
    setSelfAssessmentLastFiled('daily_mood', iso, store);
    assert.strictEqual(getSelfAssessmentLastFiled('daily_mood', store), iso);
  });
});

// ── getSelfAssessmentDraft / setSelfAssessmentDraft ───────────────────────────
describe('self-assessment draft helpers', () => {
  const store = (() => {
    const s = {};
    return { getItem: k => s[k] ?? null, setItem: (k, v) => { s[k] = v; }, removeItem: k => { delete s[k]; } };
  })();

  it('saves and retrieves a draft object', () => {
    setSelfAssessmentDraft('weekly_wellness', { sleep: 4, anxiety: 2 }, store);
    const d = getSelfAssessmentDraft('weekly_wellness', store);
    assert.deepStrictEqual(d, { sleep: 4, anxiety: 2 });
  });

  it('clearSelfAssessmentDraft removes the draft', () => {
    setSelfAssessmentDraft('monthly_reflection', { progress: 3 }, store);
    clearSelfAssessmentDraft('monthly_reflection', store);
    assert.strictEqual(getSelfAssessmentDraft('monthly_reflection', store), null);
  });
});

// ── sparklineSVG ──────────────────────────────────────────────────────────────
describe('sparklineSVG', () => {
  it('returns empty string for fewer than 2 values', () => {
    assert.strictEqual(sparklineSVG([]), '');
    assert.strictEqual(sparklineSVG([42]), '');
  });

  it('returns SVG string for valid values', () => {
    const result = sparklineSVG([1, 2, 3, 4, 5]);
    assert.ok(result.startsWith('<svg'), 'expected SVG element');
    assert.ok(result.includes('<polyline'), 'expected polyline element');
  });

  it('accepts custom color', () => {
    const result = sparklineSVG([1, 2, 3], '#ff0000');
    assert.ok(result.includes('#ff0000'), 'expected custom color in SVG');
  });

  it('honours width and height parameters', () => {
    const result = sparklineSVG([1, 2, 3], 'var(--teal)', 120, 40);
    assert.ok(result.includes('120'), 'expected width');
    assert.ok(result.includes('40'), 'expected height');
  });
});

// ── DEMO_PATIENT constant ─────────────────────────────────────────────────────
describe('DEMO_PATIENT', () => {
  it('profile first_name is "Samantha"', () => {
    assert.strictEqual(DEMO_PATIENT.profile.first_name, 'Samantha');
  });

  it('activeCourse name references tDCS and Depression', () => {
    assert.ok(DEMO_PATIENT.activeCourse.name.includes('tDCS'));
    assert.ok(DEMO_PATIENT.activeCourse.name.toLowerCase().includes('depression'));
  });

  it('streak value is a positive number', () => {
    assert.ok(typeof DEMO_PATIENT.streak === 'number' && DEMO_PATIENT.streak > 0);
  });

  it('outcomes array contains PHQ-9 and GAD-7 entries', () => {
    const names = DEMO_PATIENT.outcomes.map(o => o.template_name || '');
    assert.ok(names.some(n => n.includes('PHQ-9')), 'expected PHQ-9');
    assert.ok(names.some(n => n.includes('GAD-7')), 'expected GAD-7');
  });
});

// ── DEMO_CLINICIAN_DASHBOARD constant ─────────────────────────────────────────
describe('DEMO_CLINICIAN_DASHBOARD', () => {
  it('has 12 demo sessions', () => {
    assert.strictEqual(DEMO_CLINICIAN_DASHBOARD.sessions.length, 12);
  });

  it('all sessions have modality "tDCS"', () => {
    for (const s of DEMO_CLINICIAN_DASHBOARD.sessions) {
      assert.strictEqual(s.modality, 'tDCS');
    }
  });

  it('assessments include PHQ-9 and GAD-7', () => {
    const names = DEMO_CLINICIAN_DASHBOARD.assessments.map(a => a.template_name);
    assert.ok(names.includes('PHQ-9'));
    assert.ok(names.includes('GAD-7'));
  });
});
