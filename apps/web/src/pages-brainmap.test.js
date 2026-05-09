// pages-brainmap.test.js — public export + internal helper pins for pages-brainmap.js
// Wave-6 coverage (PR 91/N)
//
// Strategy: exercise the exported pure-logic helpers (_bmZBand, _bmZColor,
// _bmGroupDKByLobe) and the async page entry-point (pgBrainMapPlanner) via
// a minimal DOM stub. No rendering assertions — only safety/schema invariants.

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
const _makeEl = () => ({
  innerHTML: '',
  style: {},
  id: '',
  setAttribute: () => {},
  appendChild: () => {},
  remove: () => {},
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
});

globalThis.window = globalThis.window || {};
globalThis.document = {
  getElementById: (id) => {
    if (id === 'content') return _makeEl();
    return null;
  },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (tag) => _makeEl(),
  body: { appendChild: () => {}, removeChild: () => {} },
};

// Stub fetch so api calls don't throw
globalThis.fetch = () => Promise.resolve(
  new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
);

import {
  pgBrainMapPlanner,
  _bmZBand,
  _bmZColor,
  _bmGroupDKByLobe,
  buildQeegAnnotationsCreatePayload,
  groupQeegAnnotationsByKind,
  canEditQeegAnnotation,
  canDeleteQeegAnnotation,
  evidenceGapBadgeTone,
  qeegAnn2OutcomeTrackerEmpty,
  buildQeegAnn2BacklogRowMarkup,
  buildQeegAnn2TopCreators,
  buildQeegAnn2TopResolvers,
  qeegAnn2WindowOptions,
} from './pages-brainmap.js';

// ── pgBrainMapPlanner ─────────────────────────────────────────────────────────

describe('pgBrainMapPlanner', () => {
  it('is an async function', () => {
    assert.strictEqual(typeof pgBrainMapPlanner, 'function');
    const result = pgBrainMapPlanner(() => {}, () => {});
    assert.ok(result instanceof Promise);
    result.catch(() => {}); // swallow rejection in case api fails
  });
});

// ── _bmZBand ──────────────────────────────────────────────────────────────────

describe('_bmZBand', () => {
  it('returns null for null/NaN', () => {
    assert.strictEqual(_bmZBand(null), null);
    assert.strictEqual(_bmZBand(NaN), null);
    assert.strictEqual(_bmZBand(undefined), null);
  });

  it('returns severe_excess for z >= 2.58', () => {
    assert.strictEqual(_bmZBand(2.58), 'severe_excess');
    assert.strictEqual(_bmZBand(3.0), 'severe_excess');
    assert.strictEqual(_bmZBand(10), 'severe_excess');
  });

  it('returns excess for 1.96 <= z < 2.58', () => {
    assert.strictEqual(_bmZBand(1.96), 'excess');
    assert.strictEqual(_bmZBand(2.0), 'excess');
    assert.strictEqual(_bmZBand(2.57), 'excess');
  });

  it('returns severe_deficit for z <= -2.58', () => {
    assert.strictEqual(_bmZBand(-2.58), 'severe_deficit');
    assert.strictEqual(_bmZBand(-3.0), 'severe_deficit');
  });

  it('returns deficit for -2.58 < z <= -1.96', () => {
    assert.strictEqual(_bmZBand(-1.96), 'deficit');
    assert.strictEqual(_bmZBand(-2.0), 'deficit');
    assert.strictEqual(_bmZBand(-2.57), 'deficit');
  });

  it('returns typical for |z| < 1.96', () => {
    assert.strictEqual(_bmZBand(0), 'typical');
    assert.strictEqual(_bmZBand(1.5), 'typical');
    assert.strictEqual(_bmZBand(-1.5), 'typical');
    assert.strictEqual(_bmZBand(1.95), 'typical');
  });
});

// ── _bmZColor ─────────────────────────────────────────────────────────────────

describe('_bmZColor', () => {
  it('returns red for severe_excess', () => {
    const color = _bmZColor(3);
    assert.ok(color.startsWith('#'), `expected hex, got ${color}`);
    assert.strictEqual(color, '#b91c1c');
  });

  it('returns blue-ish for severe_deficit', () => {
    assert.strictEqual(_bmZColor(-3), '#1d4ed8');
  });

  it('returns green for typical', () => {
    assert.strictEqual(_bmZColor(0), '#10b981');
  });

  it('returns gray for null', () => {
    assert.strictEqual(_bmZColor(null), '#6b7280');
  });

  it('returns lighter red for excess', () => {
    assert.strictEqual(_bmZColor(2.0), '#ef4444');
  });

  it('returns lighter blue for deficit', () => {
    assert.strictEqual(_bmZColor(-2.0), '#3b82f6');
  });
});

// ── _bmGroupDKByLobe ──────────────────────────────────────────────────────────

describe('_bmGroupDKByLobe', () => {
  it('returns empty object for empty input', () => {
    assert.deepStrictEqual(_bmGroupDKByLobe([]), {});
    assert.deepStrictEqual(_bmGroupDKByLobe(null), {});
    assert.deepStrictEqual(_bmGroupDKByLobe(undefined), {});
  });

  it('groups rows by lobe', () => {
    const input = [
      { roi: 'fusiform', code: 'L001', name: 'Fusiform', lobe: 'Temporal', hemisphere: 'lh', lt_percentile: 30, z_score: 0.5 },
      { roi: 'superior_frontal', code: 'F001', name: 'Superior Frontal', lobe: 'Frontal', hemisphere: 'lh', lt_percentile: 70, z_score: -0.3 },
    ];
    const result = _bmGroupDKByLobe(input);
    assert.ok('Temporal' in result);
    assert.ok('Frontal' in result);
    assert.strictEqual(result['Temporal'].length, 1);
    assert.strictEqual(result['Frontal'].length, 1);
  });

  it('aggregates left and right hemisphere percentiles for same roi', () => {
    const input = [
      { roi: 'fusiform', code: 'L001', name: 'Fusiform', lobe: 'Temporal', hemisphere: 'lh', lt_percentile: 30, z_score: 0.5 },
      { roi: 'fusiform', code: 'L001', name: 'Fusiform', lobe: 'Temporal', hemisphere: 'rh', rt_percentile: 40, z_score: 1.2 },
    ];
    const result = _bmGroupDKByLobe(input);
    const row = result['Temporal'][0];
    assert.strictEqual(row.lt_pct, 30);
    assert.strictEqual(row.rt_pct, 40);
  });

  it('tracks max absolute z_score', () => {
    const input = [
      { roi: 'fusiform', code: 'L001', name: 'F', lobe: 'Temporal', hemisphere: 'lh', z_score: 0.5 },
      { roi: 'fusiform', code: 'L001', name: 'F', lobe: 'Temporal', hemisphere: 'rh', z_score: -2.1 },
    ];
    const result = _bmGroupDKByLobe(input);
    const row = result['Temporal'][0];
    assert.strictEqual(row.max_abs_z, 2.1);
    assert.strictEqual(row.z_score, -2.1);
  });

  it('skips rows with missing roi', () => {
    const input = [
      { code: 'X', name: 'No ROI', lobe: 'Frontal', hemisphere: 'lh', z_score: 1 },
    ];
    const result = _bmGroupDKByLobe(input);
    assert.deepStrictEqual(result, {});
  });

  it('sorts rows by code within each lobe', () => {
    const input = [
      { roi: 'b_region', code: 'F002', name: 'B Region', lobe: 'Frontal', hemisphere: 'lh', z_score: 0 },
      { roi: 'a_region', code: 'F001', name: 'A Region', lobe: 'Frontal', hemisphere: 'lh', z_score: 0 },
    ];
    const result = _bmGroupDKByLobe(input);
    assert.strictEqual(result['Frontal'][0].code, 'F001');
    assert.strictEqual(result['Frontal'][1].code, 'F002');
  });
});

// ── Annotation helpers ────────────────────────────────────────────────────────

describe('groupQeegAnnotationsByKind', () => {
  it('is a function', () => {
    assert.strictEqual(typeof groupQeegAnnotationsByKind, 'function');
  });

  it('returns object with margin_note, region_tag, flag keys for empty array', () => {
    const result = groupQeegAnnotationsByKind([]);
    assert.ok(Array.isArray(result['margin_note']));
    assert.ok(Array.isArray(result['region_tag']));
    assert.ok(Array.isArray(result['flag']));
  });

  it('groups by annotation_kind', () => {
    const items = [
      { id: '1', annotation_kind: 'flag', body: 'A' },
      { id: '2', annotation_kind: 'margin_note', body: 'B' },
      { id: '3', annotation_kind: 'flag', body: 'C' },
    ];
    const result = groupQeegAnnotationsByKind(items);
    assert.strictEqual(result['flag'].length, 2);
    assert.strictEqual(result['margin_note'].length, 1);
  });
});

describe('canEditQeegAnnotation', () => {
  it('returns true when actor_id matches created_by_user_id', () => {
    const item = { created_by_user_id: 'user1' };
    assert.strictEqual(canEditQeegAnnotation(item, { actor_id: 'user1', role: 'clinician' }), true);
  });

  it('returns false when actor does not match', () => {
    const item = { created_by_user_id: 'user1' };
    assert.strictEqual(canEditQeegAnnotation(item, { actor_id: 'user2', role: 'clinician' }), false);
  });

  it('returns false for null item', () => {
    assert.strictEqual(canEditQeegAnnotation(null, { actor_id: 'user1' }), false);
  });
});

describe('canDeleteQeegAnnotation', () => {
  it('returns true for admin role regardless of authorship', () => {
    const item = { created_by_user_id: 'user1' };
    assert.strictEqual(canDeleteQeegAnnotation(item, { actor_id: 'user2', role: 'admin' }), true);
  });

  it('returns true when actor matches author', () => {
    const item = { created_by_user_id: 'user1' };
    assert.strictEqual(canDeleteQeegAnnotation(item, { actor_id: 'user1', role: 'clinician' }), true);
  });

  it('returns false for non-admin non-author', () => {
    const item = { created_by_user_id: 'user1' };
    assert.strictEqual(canDeleteQeegAnnotation(item, { actor_id: 'user2', role: 'clinician' }), false);
  });
});

describe('evidenceGapBadgeTone', () => {
  it('returns muted for count 0', () => {
    assert.strictEqual(evidenceGapBadgeTone(0), 'muted');
  });

  it('returns rose for positive count', () => {
    assert.strictEqual(evidenceGapBadgeTone(5), 'rose');
    assert.strictEqual(evidenceGapBadgeTone(1), 'rose');
  });

  it('returns muted for non-number', () => {
    assert.strictEqual(evidenceGapBadgeTone('x'), 'muted');
    assert.strictEqual(evidenceGapBadgeTone(null), 'muted');
  });
});

describe('qeegAnn2OutcomeTrackerEmpty', () => {
  it('returns true for null summary', () => {
    assert.strictEqual(qeegAnn2OutcomeTrackerEmpty(null), true);
  });

  it('returns true when total_annotations is 0 or missing', () => {
    assert.strictEqual(qeegAnn2OutcomeTrackerEmpty({}), true);
    assert.strictEqual(qeegAnn2OutcomeTrackerEmpty({ total_annotations: 0 }), true);
  });

  it('returns false when total_annotations > 0', () => {
    assert.strictEqual(qeegAnn2OutcomeTrackerEmpty({ total_annotations: 3 }), false);
  });
});

describe('qeegAnn2WindowOptions', () => {
  it('returns a non-empty array', () => {
    const opts = qeegAnn2WindowOptions();
    assert.ok(Array.isArray(opts) && opts.length > 0);
  });

  it('each option is a positive number', () => {
    for (const o of qeegAnn2WindowOptions()) {
      assert.ok(typeof o === 'number' && o > 0,
        `expected positive number, got ${o}`);
    }
  });

  it('includes standard window sizes (30, 90)', () => {
    const opts = qeegAnn2WindowOptions();
    assert.ok(opts.includes(30), 'missing 30-day window');
    assert.ok(opts.includes(90), 'missing 90-day window');
  });
});

describe('buildQeegAnn2TopCreators', () => {
  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(buildQeegAnn2TopCreators([]), []);
  });

  it('returns empty for non-array', () => {
    assert.deepStrictEqual(buildQeegAnn2TopCreators(null), []);
  });

  it('caps at requested limit', () => {
    const items = [
      { user_id: 'u1', total_created: 10 },
      { user_id: 'u2', total_created: 8 },
      { user_id: 'u3', total_created: 6 },
      { user_id: 'u4', total_created: 4 },
    ];
    const result = buildQeegAnn2TopCreators(items, 2);
    assert.strictEqual(result.length, 2);
  });

  it('sorts by total_created descending', () => {
    const items = [
      { user_id: 'u1', total_created: 3 },
      { user_id: 'u2', total_created: 9 },
    ];
    const result = buildQeegAnn2TopCreators(items, 5);
    assert.strictEqual(result[0].user_id, 'u2');
  });
});

describe('buildQeegAnn2BacklogRowMarkup', () => {
  it('returns a non-empty string for a valid item', () => {
    const item = {
      annotation_id: 'ann-1',
      flag_type: 'finding',
      body: 'Test finding',
      creator_name: 'Alice',
      created_at: '2026-04-01T10:00:00Z',
      days_open: 3,
    };
    const html = buildQeegAnn2BacklogRowMarkup(item);
    assert.ok(typeof html === 'string' && html.length > 0);
    assert.ok(html.includes('dv2bm-ann2-backlog-row'));
  });
});
