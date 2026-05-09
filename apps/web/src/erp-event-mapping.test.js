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
});
