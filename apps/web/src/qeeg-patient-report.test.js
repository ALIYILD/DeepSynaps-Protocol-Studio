// Tests for qeeg-patient-report.js — renderPatientReport public contract.
//
// Pure function — no DOM required.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderPatientReport } from './qeeg-patient-report.js';

describe('renderPatientReport — null / empty input', () => {
  it('returns emptyState with clinician-share message when report is null', () => {
    const html = renderPatientReport(null);
    assert.ok(
      html.includes('No brain map') || html.includes('clinician will share'),
      `unexpected: ${html.slice(0, 200)}`
    );
  });

  it('returns emptyState HTML when report is undefined', () => {
    const html = renderPatientReport(undefined);
    assert.ok(html.includes('No brain map'));
  });

  it('renders disclaimer-only card when report has only a disclaimer field', () => {
    const html = renderPatientReport({ disclaimer: 'For wellness use only.' });
    assert.ok(html.includes('For wellness use only.'));
    assert.ok(html.includes('Patient Report'));
  });

  it('returns generating message when payload has no usable keys', () => {
    const html = renderPatientReport({});
    assert.ok(
      html.includes('being generated') || html.includes('Refresh'),
      `unexpected: ${html.slice(0, 200)}`
    );
  });
});

describe('renderPatientReport — legacy shape', () => {
  it('renders executive summary from legacy content object', () => {
    const report = {
      content: { executive_summary: 'Your brain patterns look healthy.' },
    };
    const html = renderPatientReport(report);
    assert.ok(html.includes('Your brain patterns look healthy.'));
  });

  it('renders "What we observed" heading for legacy findings', () => {
    const report = {
      content: {
        executive_summary: 'ok',
        findings: [{ description: 'Alpha reactivity within normal range.' }],
      },
    };
    const html = renderPatientReport(report);
    assert.ok(html.includes('What we observed'));
    assert.ok(html.includes('Alpha reactivity within normal range.'));
  });

  it('renders "Suggested next steps" for legacy protocol_recommendations', () => {
    const report = {
      content: {
        protocol_recommendations: ['Discuss with your neurologist'],
      },
    };
    const html = renderPatientReport(report);
    assert.ok(html.includes('Suggested next steps'));
    assert.ok(html.includes('Discuss with your neurologist'));
  });

  it('escapes XSS in legacy executive_summary', () => {
    const report = {
      content: { executive_summary: '<script>alert(1)</script>' },
    };
    const html = renderPatientReport(report);
    assert.ok(!html.includes('<script>'), 'raw <script> must be escaped');
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('includes non-diagnostic disclaimer in legacy rendering', () => {
    const report = {
      content: { executive_summary: 'summary' },
    };
    const html = renderPatientReport(report);
    assert.ok(
      html.includes('does not constitute a medical diagnosis') ||
      html.includes('not a medical diagnosis') ||
      html.includes('informational'),
      `disclaimer not found in: ${html.slice(-300)}`
    );
  });
});

describe('renderPatientReport — structured (Phase 1) payload', () => {
  const minimalPayload = {
    header: { client_name: 'Jane Doe', eeg_acquisition_date: '2024-03-15' },
    indicators: { tbr: { value: 2.1, band: 'high', percentile: 92 } },
    dk_atlas: [],
  };

  it('wraps output in article with data-variant="patient"', () => {
    const html = renderPatientReport(minimalPayload);
    assert.ok(html.includes('data-variant="patient"'));
  });

  it('renders "Brain Function Mapping" title (patient variant)', () => {
    const html = renderPatientReport(minimalPayload);
    assert.ok(html.includes('Brain Function Mapping'));
  });

  it('strips clinician-only findings from patient output', () => {
    const payload = {
      indicators: {},
      ai_narrative: {
        findings: [
          { description: 'Public finding.', patient_safe: true },
          { description: 'Clinician-only advisory.', clinician_only: true },
          { description: 'Hidden by audience.', audience: 'clinician' },
        ],
      },
    };
    const html = renderPatientReport(payload);
    assert.ok(html.includes('Public finding.'));
    assert.ok(!html.includes('Clinician-only advisory.'), 'clinician_only finding must be stripped');
    assert.ok(!html.includes('Hidden by audience.'), 'audience=clinician finding must be stripped');
  });

  it('does not expose clinician-only keys in patient output', () => {
    const payload = {
      patient_facing_report: {
        indicators: {},
        local_grounding: 'Internal grounding text',
        claim_governance: [{ finding_text: 'hidden claim' }],
      },
    };
    const html = renderPatientReport(payload);
    assert.ok(!html.includes('Internal grounding text'), 'local_grounding must not appear in patient output');
  });

  it('escapes XSS in client_name field', () => {
    const payload = {
      header: { client_name: '<img src=x onerror=alert(1)>' },
      indicators: {},
    };
    const html = renderPatientReport(payload);
    assert.ok(!html.includes('<img src=x'), 'raw XSS must not appear');
  });

  it('includes "Decision-support" or wellness disclaimer', () => {
    const html = renderPatientReport(minimalPayload);
    assert.ok(
      html.includes('Decision-support') ||
      html.includes('not replace') ||
      html.includes('support'),
      `disclaimer missing: ${html.slice(-400)}`
    );
  });
});
