/**
 * Unit tests: home program condition resolution & ranked suggestions.
 * Run: npm run test:unit (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIDENCE,
  SELECTED_COURSE_SORT_BONUS,
  buildRankedHomeSuggestions,
  confidenceTierFromScore,
  filterCoursesForSuggestions,
  mergeMatchesByConditionId,
  resolveConditionMatchesFromCourse,
  resolveConIdsFromCourse,
} from './home-program-condition-templates.js';

test('explicit_id on bundle field beats field_extract for same CON', () => {
  const course = {
    condition_bundle_id: 'CON-011',
    notes: 'Reference CON-011 in discharge summary',
  };
  const merged = mergeMatchesByConditionId(resolveConditionMatchesFromCourse(course));
  const m = merged.find((x) => x.conditionId === 'CON-011');
  assert.equal(m.matchMethod, 'explicit_id');
  assert.equal(m.confidenceScore, CONFIDENCE.explicit_id);
});

test('field_extract from primary text outranks secondary notes for same CON id', () => {
  const course = {
    notes: 'CON-019 mentioned',
    condition: 'CON-019 discussed in session',
  };
  const merged = mergeMatchesByConditionId(resolveConditionMatchesFromCourse(course));
  const m = merged.find((x) => x.conditionId === 'CON-019');
  assert.equal(m.matchMethod, 'field_extract');
  assert.equal(m.confidenceScore, CONFIDENCE.field_extract_primary);
  assert.equal(m.matchedField, 'condition');
});

test('slug alias maps mdd to CON-001', () => {
  const m = mergeMatchesByConditionId(resolveConditionMatchesFromCourse({ condition_slug: 'mdd' }));
  assert.deepEqual(m.map((x) => x.conditionId), ['CON-001']);
  assert.equal(m[0].matchMethod, 'slug_match');
});

test('canonical slug from full bundle title', () => {
  const slug = 'generalized-anxiety-disorder';
  const m = mergeMatchesByConditionId(resolveConditionMatchesFromCourse({ condition_slug: slug }));
  assert.equal(m[0].conditionId, 'CON-011');
  assert.equal(m[0].confidenceScore, CONFIDENCE.slug_canonical);
});

test('normalized display name match', () => {
  const m = mergeMatchesByConditionId(resolveConditionMatchesFromCourse({
    condition_name: 'Generalized Anxiety Disorder',
  }));
  assert.equal(m.find((x) => x.conditionId === 'CON-011').matchMethod, 'display_name_match');
});

test('short alias in notes does not match inside unrelated tokens (painting vs pain)', () => {
  const m = resolveConditionMatchesFromCourse({ notes: 'Enjoyed painting in art therapy' });
  assert.ok(!m.some((x) => x.conditionId === 'CON-027'));
});

test('bounded whole-word alias in notes yields text_inference', () => {
  const m = mergeMatchesByConditionId(resolveConditionMatchesFromCourse({
    notes: 'History consistent with ptsd presentation',
  }));
  const hit = m.find((x) => x.conditionId === 'CON-019');
  assert.ok(hit);
  assert.equal(hit.matchMethod, 'text_inference');
  assert.equal(hit.confidenceScore, CONFIDENCE.text_inference);
});

test('completed courses excluded from suggestion pool helper', () => {
  const pool = [{ id: 'a', status: 'completed' }, { id: 'b', status: 'active' }];
  assert.equal(filterCoursesForSuggestions(pool).length, 1);
  assert.equal(filterCoursesForSuggestions(pool)[0].id, 'b');
});

test('patient-wide scope dedupes by bundle id keeping higher confidence', () => {
  const pool = [
    { id: 'c1', status: 'active', condition_slug: 'mdd' },
    { id: 'c2', status: 'active', condition_bundle_id: 'CON-001' },
  ];
  const ranked = buildRankedHomeSuggestions(pool, { courseLabel: (c) => c.id });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].match.matchMethod, 'explicit_id');
  assert.equal(ranked[0].sourceCourseId, 'c2');
});

test('selected course scope restricts to that course only', () => {
  const pool = [
    { id: 'x', status: 'active', condition_slug: 'mdd' },
    { id: 'y', status: 'active', condition_slug: 'ptsd' },
  ];
  const ranked = buildRankedHomeSuggestions(pool, { selectedCourseId: 'y', courseLabel: (c) => c.id });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].template.conditionId, 'CON-019');
  assert.equal(ranked[0].sourceCourseId, 'y');
});

test('ordering respects confidence then bundle id', () => {
  const pool = [
    { id: 'a', status: 'active', condition_slug: 'gad' },
    { id: 'b', status: 'active', condition_bundle_id: 'CON-001' },
  ];
  const ranked = buildRankedHomeSuggestions(pool, { courseLabel: (c) => c.id });
  const ids = ranked.map((r) => r.template.conditionId);
  assert.ok(ids.indexOf('CON-001') < ids.indexOf('CON-011'));
});

test('scoped course adds sort bonus (not changing stored confidence)', () => {
  const pool = [{ id: 'z', status: 'active', condition_slug: 'mdd' }];
  const unscoped = buildRankedHomeSuggestions(pool, {})[0];
  const scoped = buildRankedHomeSuggestions(pool, { selectedCourseId: 'z' })[0];
  assert.equal(scoped.sortScore, unscoped.sortScore + SELECTED_COURSE_SORT_BONUS);
  assert.equal(scoped.match.confidenceScore, unscoped.match.confidenceScore);
});

test('resolveConIdsFromCourse returns deterministic sorted ids', () => {
  const course = { condition_slug: 'ptsd', condition_bundle_id: 'CON-001' };
  const ids = resolveConIdsFromCourse(course);
  assert.deepEqual(ids, ['CON-001', 'CON-019']);
});

test('confidenceTierFromScore maps bands', () => {
  assert.equal(confidenceTierFromScore(100), 'high');
  assert.equal(confidenceTierFromScore(70), 'medium');
  assert.equal(confidenceTierFromScore(40), 'low');
  assert.equal(confidenceTierFromScore(null), 'unknown');
});
