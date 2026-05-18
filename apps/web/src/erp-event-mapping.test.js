// Tests for erp-event-mapping.js
// Pins: erpResolveBidsUploadMeta priority logic, erpFormatBidsSummaryHtml HTML contracts,
//       erpApplyTrialMappingRows parsing, erpValidateEventMapping warning messages.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  erpResolveBidsUploadMeta,
  erpFormatBidsSummaryHtml,
  erpApplyTrialMappingRows,
  erpValidateEventMapping,
} from './erp-event-mapping.js';

describe('erpResolveBidsUploadMeta', () => {
  it('returns sessionUpload when analysisId matches', () => {
    const su = { analysisId: 'a1', row_count: 100, trial_types: ['target'], warnings: [], normalized: true };
    const result = erpResolveBidsUploadMeta('a1', null, su);
    assert.strictEqual(result, su);
  });

  it('ignores sessionUpload when analysisId does not match', () => {
    const su = { analysisId: 'other', row_count: 100, trial_types: [], warnings: [] };
    const currentAnalysis = {
      id: 'a1',
      advanced_analyses: { erp: { bids_upload_summary: { row_count: 50, trial_types: ['x'], warnings: [], normalized: false } } },
    };
    const result = erpResolveBidsUploadMeta('a1', currentAnalysis, su);
    assert.strictEqual(result?.row_count, 50, 'should fall back to persisted summary');
  });

  it('extracts from currentAnalysis.advanced_analyses.erp.bids_upload_summary when sessionUpload is null', () => {
    const currentAnalysis = {
      id: 'a2',
      advanced_analyses: {
        erp: {
          bids_upload_summary: {
            row_count: 42,
            trial_types: ['standard', 'deviant'],
            warnings: ['one warning'],
            normalized: true,
            sidecar_ref: 'ref-abc',
            bytes_written: 1024,
            uploaded_at: '2025-01-01T00:00:00Z',
          },
        },
      },
    };
    const result = erpResolveBidsUploadMeta('a2', currentAnalysis, null);
    assert.strictEqual(result?.row_count, 42);
    assert.deepStrictEqual(result?.trial_types, ['standard', 'deviant']);
    assert.deepStrictEqual(result?.warnings, ['one warning']);
    assert.strictEqual(result?.normalized, true);
    assert.strictEqual(result?.sidecar_ref, 'ref-abc');
    assert.strictEqual(result?.analysisId, 'a2');
  });

  it('returns null when no session upload and no persisted summary', () => {
    const result = erpResolveBidsUploadMeta('a3', null, null);
    assert.strictEqual(result, null);
  });

  it('returns null when currentAnalysis id does not match erpAnalysisId', () => {
    const currentAnalysis = { id: 'different', advanced_analyses: { erp: { bids_upload_summary: { row_count: 10 } } } };
    const result = erpResolveBidsUploadMeta('a3', currentAnalysis, null);
    assert.strictEqual(result, null);
  });
});

describe('erpFormatBidsSummaryHtml', () => {
  it('returns the empty-state element when bm is null/falsy', () => {
    const html = erpFormatBidsSummaryHtml(null);
    assert.ok(html.includes('data-testid="qeeg-erp-bids-summary-empty"'), 'must render empty-state testid');
    assert.ok(html.includes('trial_type'), 'empty state must mention trial_type');
  });

  it('renders row count, trial_types, and normalization status', () => {
    const html = erpFormatBidsSummaryHtml({
      row_count: 250,
      trial_types: ['target', 'standard'],
      warnings: [],
      normalized: true,
    });
    assert.ok(html.includes('data-testid="qeeg-erp-bids-summary"'));
    assert.ok(html.includes('250'), 'row count must appear');
    assert.ok(html.includes('target') && html.includes('standard'), 'trial types must appear');
    assert.ok(html.includes('on (trim/case per upload)'), 'normalization on string must appear');
  });

  it('renders normalization as "off (strict)" when normalized is false', () => {
    const html = erpFormatBidsSummaryHtml({ row_count: 10, trial_types: [], warnings: [], normalized: false });
    assert.ok(html.includes('off (strict)'), 'normalized=false must render off label');
  });

  it('renders warnings list when present', () => {
    const html = erpFormatBidsSummaryHtml({
      row_count: 5,
      trial_types: [],
      warnings: ['missing key', 'extra key'],
      normalized: false,
    });
    assert.ok(html.includes('data-testid="qeeg-erp-bids-warnings-list"'), 'warnings list testid must be present');
    assert.ok(html.includes('missing key') && html.includes('extra key'));
  });

  it('escapes HTML-special characters in trial_types to prevent XSS', () => {
    const html = erpFormatBidsSummaryHtml({
      row_count: 1,
      trial_types: ['<script>alert(1)</script>'],
      warnings: [],
      normalized: false,
    });
    assert.ok(!html.includes('<script>'), 'raw <script> must not appear in output');
    assert.ok(html.includes('&lt;script&gt;'), 'script tag must be HTML-escaped');
  });

  it('includes sidecar_ref in output when set', () => {
    const html = erpFormatBidsSummaryHtml({
      row_count: 1,
      trial_types: [],
      warnings: [],
      normalized: false,
      sidecar_ref: 'my-sidecar-key',
    });
    assert.ok(html.includes('my-sidecar-key'), 'sidecar_ref must appear');
    assert.ok(html.includes('data-testid="qeeg-erp-bids-sidecar-ref"'));
  });
});

describe('erpApplyTrialMappingRows', () => {
  it('converts valid rows to key-code map', () => {
    const rows = [
      { conditionKey: 'target', code: '1' },
      { conditionKey: 'standard', code: '2' },
    ];
    const result = erpApplyTrialMappingRows(rows);
    assert.strictEqual(result['target'], 1);
    assert.strictEqual(result['standard'], 2);
  });

  it('skips rows with NaN or empty conditionKey', () => {
    const rows = [
      { conditionKey: '', code: '5' },
      { conditionKey: 'valid', code: 'NaN' },
      { conditionKey: 'ok', code: '3' },
    ];
    const result = erpApplyTrialMappingRows(rows);
    assert.ok(!Object.prototype.hasOwnProperty.call(result, ''), 'empty key must be skipped');
    assert.ok(!Object.prototype.hasOwnProperty.call(result, 'valid'), 'NaN code must be skipped');
    assert.strictEqual(result['ok'], 3);
  });

  it('returns empty object for non-array input', () => {
    assert.deepStrictEqual(erpApplyTrialMappingRows(null), {});
    assert.deepStrictEqual(erpApplyTrialMappingRows('not-array'), {});
  });
});

describe('erpValidateEventMapping', () => {
  it('warns when sidecar has trial_types but eventIdMap is empty', () => {
    const warnings = erpValidateEventMapping(['target', 'standard'], {});
    assert.ok(warnings.length > 0);
    assert.ok(
      warnings[0].includes('event_id_map is empty'),
      'first warning must mention empty event_id_map',
    );
  });

  it('warns for each sidecar trial_type missing from eventIdMap', () => {
    const warnings = erpValidateEventMapping(['target', 'standard'], { target: 1 });
    assert.ok(warnings.some((w) => w.includes('"standard"') && w.includes('no matching key')));
  });

  it('warns for each eventIdMap key not in sidecar trial_types', () => {
    const warnings = erpValidateEventMapping(['target'], { target: 1, extra: 99 });
    assert.ok(warnings.some((w) => w.includes('"extra"') && w.includes('not among detected')));
  });

  it('returns no warnings when mapping is perfectly aligned', () => {
    const warnings = erpValidateEventMapping(['target', 'standard'], { target: 1, standard: 2 });
    assert.strictEqual(warnings.length, 0, 'perfect alignment must produce zero warnings');
  });

  it('returns no warnings when both sidecar trial_types and eventIdMap are empty', () => {
    const warnings = erpValidateEventMapping([], {});
    assert.strictEqual(warnings.length, 0);
  });

  // ── Defensive branch-coverage additions ────────────────────────────────

  it('treats a non-array sidecarTrialTypes as empty', () => {
    // Hits the Array.isArray=false branch on line 120-124.
    assert.deepStrictEqual(erpValidateEventMapping(null, {}), []);
    assert.deepStrictEqual(erpValidateEventMapping('not-array', {}), []);
    assert.deepStrictEqual(erpValidateEventMapping(undefined, { x: 1 }), [
      'event_id_map key "x" was not among detected sidecar trial_types.',
    ]);
  });

  it('treats a non-plain-object eventIdMap as empty (array, null, primitive)', () => {
    // Hits the !typeof object / Array.isArray=true branches on line 126.
    const warnings = erpValidateEventMapping(['t'], ['not', 'a', 'map']);
    assert.ok(warnings.some((w) => w.includes('event_id_map is empty')));
    const warnings2 = erpValidateEventMapping(['t'], null);
    assert.ok(warnings2.some((w) => w.includes('event_id_map is empty')));
    const warnings3 = erpValidateEventMapping(['t'], 'string');
    assert.ok(warnings3.some((w) => w.includes('event_id_map is empty')));
  });

  it('filters out null/empty entries from sidecarTrialTypes', () => {
    // Hits the filter callback returning false on line 121-122.
    const warnings = erpValidateEventMapping([null, '', 'target', undefined], { target: 1 });
    // Should not warn about empty/null entries — only the valid 'target' is considered.
    assert.strictEqual(warnings.length, 0);
  });
});

describe('erpApplyTrialMappingRows defensive branches', () => {
  it('skips null/non-object rows in the input array', () => {
    // Hits line 104: !r || typeof r !== 'object'
    const rows = [null, undefined, 'string', 42, { conditionKey: 'ok', code: '7' }];
    const result = erpApplyTrialMappingRows(rows);
    assert.deepStrictEqual(result, { ok: 7 });
  });

  it('treats a row with missing conditionKey as empty key (then skipped)', () => {
    // Hits line 105: r.conditionKey != null falsy branch
    const rows = [{ code: '3' }, { conditionKey: null, code: '4' }];
    const result = erpApplyTrialMappingRows(rows);
    assert.deepStrictEqual(result, {});
  });
});

describe('erpResolveBidsUploadMeta and erpFormatBidsSummaryHtml defensive branches', () => {
  it('falls back to [] for missing trial_types and warnings on persisted summary', () => {
    // Hits lines 33-34: summ.trial_types || [] and summ.warnings || []
    const currentAnalysis = {
      id: 'a-defensive',
      advanced_analyses: {
        erp: { bids_upload_summary: { row_count: 7 /* trial_types & warnings missing */ } },
      },
    };
    const result = erpResolveBidsUploadMeta('a-defensive', currentAnalysis, null);
    assert.deepStrictEqual(result?.trial_types, []);
    assert.deepStrictEqual(result?.warnings, []);
    assert.strictEqual(result?.normalized, false);
  });

  it('renders "?" when row_count is null/undefined', () => {
    // Hits line 72: bm.row_count != null falsy branch
    const html = erpFormatBidsSummaryHtml({
      row_count: null,
      trial_types: [],
      warnings: [],
      normalized: false,
    });
    assert.ok(html.includes('<strong>Rows:</strong> ?'));
  });

  it('renders <em>none</em> when trial_types is missing', () => {
    // Hits line 64: bm.trial_types || [] falsy branch
    const html = erpFormatBidsSummaryHtml({
      row_count: 3,
      warnings: [],
      normalized: false,
      // trial_types intentionally omitted
    });
    assert.ok(html.includes('<em>none</em>'));
  });

  it('includes uploaded_at server timestamp when set', () => {
    const html = erpFormatBidsSummaryHtml({
      row_count: 1,
      trial_types: [],
      warnings: [],
      normalized: false,
      uploaded_at: '2026-01-02T03:04:05Z',
    });
    assert.ok(html.includes('Last upload (server)'));
    assert.ok(html.includes('2026-01-02T03:04:05Z'));
  });
});
