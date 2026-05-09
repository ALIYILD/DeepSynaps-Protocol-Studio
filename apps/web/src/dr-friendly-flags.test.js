import { describe, it } from 'node:test';
import assert from 'node:assert';

import { loadPatientFlagSummary } from './dr-friendly-flags.js';

function _stubApi(profile, opts = {}) {
  return {
    async getPatientRiskProfile(id) {
      if (opts.throws) throw new Error('boom');
      return profile;
    },
  };
}

describe('loadPatientFlagSummary', () => {
  it('returns calm zero-state when patientId is falsy', async () => {
    // Pin: no patientId -> { flagCount: 0, flagSummary: '', loaded: false }.
    // The drHero header relies on `loaded=false` to render the "no
    // active flags" calm chip without misrepresenting unknown state.
    const out = await loadPatientFlagSummary('', _stubApi(null));
    assert.deepEqual(out, { flagCount: 0, flagSummary: '', loaded: false });
  });

  it('counts only elevated/high/critical levels', async () => {
    // Pin: levels other than elevated/high/critical do NOT trip a flag.
    // A regression to count "moderate" or "stable" would dramatically
    // inflate the doctor-facing count.
    const profile = {
      categories: [
        { category: 'cardiac', level: 'critical' },
        { category: 'sleep', level: 'high' },
        { category: 'mood', level: 'elevated' },
        { category: 'cognitive', level: 'moderate' }, // NOT counted
        { category: 'metabolic', level: 'stable' },   // NOT counted
        { category: 'renal', level: 'low' },          // NOT counted
      ],
    };
    const { flagCount, loaded } = await loadPatientFlagSummary('p1', _stubApi(profile));
    assert.equal(flagCount, 3);
    assert.equal(loaded, true);
  });

  it('caps the flag summary at 3 categories joined by " · "', async () => {
    // Pin: drHero has limited horizontal space — summary must surface
    // at most 3 entries. A 4+ entry summary would overflow the chip.
    const profile = {
      categories: [
        { category: 'a', level: 'high' },
        { category: 'b', level: 'high' },
        { category: 'c', level: 'high' },
        { category: 'd', level: 'high' },
      ],
    };
    const { flagSummary, flagCount } = await loadPatientFlagSummary('p1', _stubApi(profile));
    assert.equal(flagCount, 4); // count is the full set
    assert.equal(flagSummary.split(' · ').length, 3); // summary is capped
  });

  it('formats category labels by replacing underscores with spaces', async () => {
    // Pin: API uses snake_case category ids; drHero renders human
    // text. Underscores must be replaced.
    const profile = {
      categories: [{ category: 'sleep_apnea_risk', level: 'high' }],
    };
    const { flagSummary } = await loadPatientFlagSummary('p1', _stubApi(profile));
    assert.match(flagSummary, /sleep apnea risk/);
    assert.ok(!flagSummary.includes('_'));
  });

  it('falls back to category.name then category.id when category is missing', async () => {
    const profile = {
      categories: [
        { name: 'Cardiac risk', level: 'high' },
        { id: 'mood_swing', level: 'elevated' },
      ],
    };
    const { flagSummary, flagCount } = await loadPatientFlagSummary('p1', _stubApi(profile));
    assert.equal(flagCount, 2);
    assert.match(flagSummary, /Cardiac risk high/);
    assert.match(flagSummary, /mood swing elevated/);
  });

  it('downgrades gracefully when API throws', async () => {
    // Pin: backend failure must not crash the doctor header. Caller
    // expects loaded=false so it can render the calm chip.
    const out = await loadPatientFlagSummary('p1', _stubApi(null, { throws: true }));
    assert.deepEqual(out, { flagCount: 0, flagSummary: '', loaded: false });
  });

  it('handles non-array categories without raising', async () => {
    // Pin: API returns {} or a string — must not throw.
    const out = await loadPatientFlagSummary('p1', _stubApi({ categories: null }));
    assert.equal(out.flagCount, 0);
    assert.equal(out.loaded, true);
  });

  it('returns level-only entry when category label is empty', async () => {
    const profile = {
      categories: [{ category: '', level: 'critical' }],
    };
    const { flagSummary } = await loadPatientFlagSummary('p1', _stubApi(profile));
    assert.equal(flagSummary, 'critical');
  });
});
