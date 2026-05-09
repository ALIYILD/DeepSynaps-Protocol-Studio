// Tests for qeeg-safety-cockpit.js — Clinical Safety Cockpit widget
// Pins: null guard, status colour mapping, check pass/fail icons, red-flag severity colours,
//       status banner text (underscores replaced), "No red flags" empty state, XSS escaping.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderSafetyCockpit } from './qeeg-safety-cockpit.js';

describe('renderSafetyCockpit', () => {
  it('returns empty string when cockpit is null', () => {
    assert.strictEqual(renderSafetyCockpit(null), '');
  });

  it('returns empty string when cockpit has no checks property', () => {
    assert.strictEqual(renderSafetyCockpit({}), '');
  });

  it('renders section header "Clinical Safety Cockpit"', () => {
    const html = renderSafetyCockpit({ checks: [], overall_status: 'VALID_FOR_REVIEW' });
    assert.ok(html.includes('Clinical Safety Cockpit'), 'expected section header');
  });

  it('renders VALID_FOR_REVIEW status with green colour #22c55e', () => {
    const html = renderSafetyCockpit({ checks: [], overall_status: 'VALID_FOR_REVIEW' });
    assert.ok(html.includes('#22c55e'), 'VALID_FOR_REVIEW must use green colour');
    assert.ok(html.includes('VALID FOR REVIEW'), 'status text underscores must be replaced with spaces');
  });

  it('renders LIMITED_QUALITY status with amber colour #f59e0b', () => {
    const html = renderSafetyCockpit({ checks: [], overall_status: 'LIMITED_QUALITY' });
    assert.ok(html.includes('#f59e0b'), 'LIMITED_QUALITY must use amber colour');
    assert.ok(html.includes('LIMITED QUALITY'), 'expected readable status text');
  });

  it('renders REPEAT_RECOMMENDED status with red colour #ef4444', () => {
    const html = renderSafetyCockpit({ checks: [], overall_status: 'REPEAT_RECOMMENDED' });
    assert.ok(html.includes('#ef4444'), 'REPEAT_RECOMMENDED must use red colour');
    assert.ok(html.includes('REPEAT RECOMMENDED'), 'expected readable status text');
  });

  it('renders unknown status with grey colour #6b7280', () => {
    const html = renderSafetyCockpit({ checks: [], overall_status: 'UNKNOWN_STATUS' });
    assert.ok(html.includes('#6b7280'), 'unknown status must use grey colour');
  });

  it('renders disclaimer text inside status banner when provided', () => {
    const html = renderSafetyCockpit({
      checks: [],
      overall_status: 'VALID_FOR_REVIEW',
      disclaimer: 'Review with senior clinician.',
    });
    assert.ok(html.includes('Review with senior clinician.'), 'expected disclaimer in banner');
  });

  it('renders pass check with green checkmark icon ✓', () => {
    const html = renderSafetyCockpit({
      checks: [{ name: 'Impedance', passed: true, value: '5kΩ', threshold: '<10kΩ' }],
      overall_status: 'VALID_FOR_REVIEW',
    });
    assert.ok(html.includes('✓'), 'passed check must show checkmark');
    assert.ok(html.includes('Pass'), 'passed check pill must say Pass');
  });

  it('renders fail check with red cross icon ✗', () => {
    const html = renderSafetyCockpit({
      checks: [{ name: 'Impedance', passed: false, value: '25kΩ', threshold: '<10kΩ' }],
      overall_status: 'REPEAT_RECOMMENDED',
    });
    assert.ok(html.includes('✗'), 'failed check must show cross');
    assert.ok(html.includes('Fail'), 'failed check pill must say Fail');
  });

  it('renders table headers: Check, Value, Threshold, Result', () => {
    const html = renderSafetyCockpit({
      checks: [{ name: 'X', passed: true, value: '1', threshold: '2' }],
      overall_status: 'VALID_FOR_REVIEW',
    });
    assert.ok(html.includes('<th>Check</th>'), 'expected "Check" column header');
    assert.ok(html.includes('<th>Value</th>'), 'expected "Value" column header');
    assert.ok(html.includes('<th>Threshold</th>'), 'expected "Threshold" column header');
    assert.ok(html.includes('<th>Result</th>'), 'expected "Result" column header');
  });

  it('renders "No red flags detected." when red_flags is empty', () => {
    const html = renderSafetyCockpit({
      checks: [],
      overall_status: 'VALID_FOR_REVIEW',
      red_flags: [],
    });
    assert.ok(html.includes('No red flags detected.'), 'expected empty red-flags message');
  });

  it('renders red flag rows with severity colour mapping', () => {
    const html = renderSafetyCockpit({
      checks: [],
      overall_status: 'LIMITED_QUALITY',
      red_flags: [
        { severity: 'HIGH', category: 'Amplitude', message: 'Extreme delta' },
        { severity: 'MEDIUM', category: 'Frequency', message: 'Alpha peak shift' },
      ],
    });
    assert.ok(html.includes('Extreme delta'), 'expected HIGH flag message');
    assert.ok(html.includes('Alpha peak shift'), 'expected MEDIUM flag message');
    assert.ok(html.includes('#ef4444'), 'HIGH flag must use red colour');
    assert.ok(html.includes('#f59e0b'), 'MEDIUM flag must use amber colour');
  });

  it('escapes XSS in check name and red flag message', () => {
    const html = renderSafetyCockpit({
      checks: [{ name: '<script>x</script>', passed: true, value: '1', threshold: '2' }],
      overall_status: 'VALID_FOR_REVIEW',
      red_flags: [{ severity: 'HIGH', category: '<b>cat</b>', message: '<img onerror=1>' }],
    });
    assert.ok(!html.includes('<script>'), 'check name must be HTML-escaped');
    assert.ok(!html.includes('<img onerror'), 'red flag message must be HTML-escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'expected escaped entity');
  });
});
