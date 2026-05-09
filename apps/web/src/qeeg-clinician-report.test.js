// Tests for qeeg-clinician-report.js — renderClinicianReport public contract.
//
// Uses the module's pure renderClinicianReport() function only (no DOM).
// mountClinicianReport is a DOM function, tested separately via the
// document stub pattern.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { renderClinicianReport } from './qeeg-clinician-report.js';

describe('renderClinicianReport — null / empty input', () => {
  it('returns emptyState HTML when report is null', () => {
    const html = renderClinicianReport(null);
    assert.ok(html.includes('No brain map report available.'), `got: ${html.slice(0, 120)}`);
  });

  it('returns emptyState HTML when report is undefined', () => {
    const html = renderClinicianReport(undefined);
    assert.ok(html.includes('No brain map report available.'));
  });

  it('returns payload-not-yet-available message when report has no usable keys', () => {
    const html = renderClinicianReport({});
    assert.ok(html.includes('Brain map payload not yet available'), `got: ${html.slice(0, 180)}`);
  });
});

describe('renderClinicianReport — legacy shape', () => {
  it('renders executive summary from legacy content shape', () => {
    const report = {
      content: {
        executive_summary: 'Elevated TBR noted.',
        findings: [],
      },
    };
    const html = renderClinicianReport(report);
    assert.ok(html.includes('Elevated TBR noted.'));
  });

  it('escapes XSS in legacy executive_summary', () => {
    const report = {
      content: { executive_summary: '<script>alert(1)</script>' },
    };
    const html = renderClinicianReport(report);
    assert.ok(!html.includes('<script>'), `raw <script> must not appear: ${html.slice(0, 200)}`);
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('renders legacy protocol recommendations', () => {
    const report = {
      content: {
        protocol_recommendations: ['Neurofeedback alpha training', { name: 'SMR protocol' }],
      },
    };
    const html = renderClinicianReport(report);
    assert.ok(html.includes('Neurofeedback alpha training'));
    assert.ok(html.includes('SMR protocol'));
  });

  it('includes decision-support disclaimer for legacy variant', () => {
    const report = {
      content: { executive_summary: 'ok' },
    };
    const html = renderClinicianReport(report);
    assert.ok(
      html.includes('Decision-support') || html.includes('not a medical diagnosis'),
      `disclaimer not found in: ${html.slice(-300)}`
    );
  });
});

describe('renderClinicianReport — structured (Phase 1) payload', () => {
  const minimalPayload = {
    header: { client_name: 'Test Patient', eeg_acquisition_date: '2024-01-01' },
    indicators: { tbr: { value: 1.8, band: 'high', percentile: 90 } },
    dk_atlas: [],
  };

  it('renders clinician variant title in header', () => {
    const html = renderClinicianReport(minimalPayload);
    assert.ok(html.includes('Clinician Review'), `title not found: ${html.slice(0, 300)}`);
  });

  it('wraps output in article with data-variant="clinician"', () => {
    const html = renderClinicianReport(minimalPayload);
    assert.ok(html.includes('data-variant="clinician"'));
  });

  it('escapes XSS in client_name', () => {
    const payload = {
      header: { client_name: '<img src=x onerror=alert(1)>' },
      indicators: {},
    };
    const html = renderClinicianReport(payload);
    assert.ok(!html.includes('<img src=x'), `raw XSS must not appear`);
    assert.ok(html.includes('&lt;img'));
  });

  it('renders DK Atlas table when dk_atlas rows are provided', () => {
    const payload = {
      indicators: {},
      dk_atlas: [
        { code: 'ctx-lh-superiorfrontal', roi: 'superiorfrontal', name: 'Superior frontal gyrus', lobe: 'frontal', hemisphere: 'lh', lt_percentile: 78.2, z_score: 0.8 },
      ],
    };
    const html = renderClinicianReport(payload);
    assert.ok(html.includes('DK Atlas'), `DK Atlas table missing: ${html.slice(0, 400)}`);
    assert.ok(html.includes('Superior frontal gyrus'));
  });

  it('renders method & provenance section with schema_version', () => {
    const payload = {
      indicators: {},
      provenance: { schema_version: 'v0.3', pipeline_version: '1.2.0', norm_db_version: 'HBN-2024' },
    };
    const html = renderClinicianReport(payload);
    assert.ok(html.includes('Method'), `provenance section missing`);
    assert.ok(html.includes('v0.3'));
    assert.ok(html.includes('1.2.0'));
  });

  it('includes "Decision-support" in disclaimer', () => {
    const html = renderClinicianReport(minimalPayload);
    assert.ok(html.includes('Decision-support'), `disclaimer missing Decision-support`);
  });

  it('does not include raw <script> tags in output', () => {
    const payload = {
      indicators: {},
      ai_narrative: {
        findings: [{ description: '<script>evil()</script>', severity: 'flag' }],
      },
    };
    const html = renderClinicianReport(payload);
    assert.ok(!html.includes('<script>'), 'raw <script> must be escaped');
  });
});
