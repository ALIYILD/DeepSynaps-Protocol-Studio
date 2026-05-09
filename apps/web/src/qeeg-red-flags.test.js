// Tests for qeeg-red-flags.js — Red Flag Detector panel
// Pins: HTML escaping, severity colour mapping, empty-state, disclaimer, table structure.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderRedFlags } from './qeeg-red-flags.js';

describe('renderRedFlags', () => {
  it('returns empty string when flags is null', () => {
    assert.strictEqual(renderRedFlags(null), '');
  });

  it('returns empty string when flags object has no flags property', () => {
    assert.strictEqual(renderRedFlags({}), '');
  });

  it('renders "No red flags." when flags array is empty', () => {
    const html = renderRedFlags({ flags: [], flag_count: 0, high_severity_count: 0 });
    assert.ok(html.includes('No red flags.'), 'expected "No red flags." text');
    assert.ok(html.includes('Red Flag Detector'), 'expected section header');
  });

  it('renders the total flag count and high severity count in summary boxes', () => {
    const html = renderRedFlags({ flags: [], flag_count: 7, high_severity_count: 3 });
    assert.ok(html.includes('>7<'), 'expected total count 7');
    assert.ok(html.includes('>3<'), 'expected high severity count 3');
    assert.ok(html.includes('Total Flags'), 'expected "Total Flags" label');
    assert.ok(html.includes('High Severity'), 'expected "High Severity" label');
  });

  it('renders a table row for each flag', () => {
    const flags = {
      flags: [
        { severity: 'HIGH', category: 'Amplitude', message: 'Excessive delta', recommendation: 'Review raw' },
        { severity: 'MEDIUM', category: 'Frequency', message: 'Alpha slowing', recommendation: null },
      ],
      flag_count: 2,
      high_severity_count: 1,
    };
    const html = renderRedFlags(flags);
    assert.ok(html.includes('Excessive delta'), 'expected flag message');
    assert.ok(html.includes('Alpha slowing'), 'expected second flag message');
    assert.ok(html.includes('Review raw'), 'expected recommendation text');
    assert.ok(html.includes('—'), 'expected fallback dash for null recommendation');
  });

  it('maps HIGH severity to red colour #ef4444', () => {
    const flags = {
      flags: [{ severity: 'HIGH', category: 'X', message: 'Y', recommendation: 'Z' }],
      flag_count: 1,
      high_severity_count: 1,
    };
    const html = renderRedFlags(flags);
    assert.ok(html.includes('#ef4444'), 'HIGH flags must use red colour #ef4444');
  });

  it('maps MEDIUM severity to amber colour #f59e0b', () => {
    const flags = {
      flags: [{ severity: 'MEDIUM', category: 'X', message: 'Y', recommendation: 'Z' }],
      flag_count: 1,
      high_severity_count: 0,
    };
    const html = renderRedFlags(flags);
    assert.ok(html.includes('#f59e0b'), 'MEDIUM flags must use amber colour #f59e0b');
  });

  it('maps LOW (unknown) severity to grey colour #6b7280', () => {
    const flags = {
      flags: [{ severity: 'LOW', category: 'X', message: 'Y', recommendation: 'Z' }],
      flag_count: 1,
      high_severity_count: 0,
    };
    const html = renderRedFlags(flags);
    assert.ok(html.includes('#6b7280'), 'LOW/unknown flags must use grey colour #6b7280');
  });

  it('renders disclaimer text when provided', () => {
    const flags = {
      flags: [],
      flag_count: 0,
      high_severity_count: 0,
      disclaimer: 'For decision-support only.',
    };
    const html = renderRedFlags(flags);
    assert.ok(html.includes('For decision-support only.'), 'expected disclaimer text');
  });

  it('escapes XSS in flag message and category', () => {
    const flags = {
      flags: [{ severity: 'HIGH', category: '<script>', message: '<img onerror=x>', recommendation: '&evil' }],
      flag_count: 1,
      high_severity_count: 1,
    };
    const html = renderRedFlags(flags);
    assert.ok(!html.includes('<script>'), 'raw <script> must be escaped');
    assert.ok(!html.includes('<img'), 'raw <img must be escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'category must be HTML-escaped');
    assert.ok(html.includes('&amp;evil'), 'ampersand must be HTML-escaped');
  });

  it('renders table headers: Severity, Category, Message, Recommendation', () => {
    const flags = {
      flags: [{ severity: 'HIGH', category: 'A', message: 'B', recommendation: 'C' }],
      flag_count: 1,
      high_severity_count: 1,
    };
    const html = renderRedFlags(flags);
    assert.ok(html.includes('<th>Severity</th>'), 'expected Severity header');
    assert.ok(html.includes('<th>Category</th>'), 'expected Category header');
    assert.ok(html.includes('<th>Message</th>'), 'expected Message header');
    assert.ok(html.includes('<th>Recommendation</th>'), 'expected Recommendation header');
  });
});
