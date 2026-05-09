// Tests for qeeg-clinician-review.js — renderClinicianReview public contract.
//
// Pure HTML renderer — no DOM required for the render path.
// mountClinicianReview requires DOM and is not tested here.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderClinicianReview } from './qeeg-clinician-review.js';

describe('renderClinicianReview — null / empty input', () => {
  it('returns empty string when report is null', () => {
    const html = renderClinicianReview(null);
    assert.strictEqual(html, '');
  });

  it('returns empty string when report is undefined', () => {
    const html = renderClinicianReview(undefined);
    assert.strictEqual(html, '');
  });
});

describe('renderClinicianReview — state color mapping', () => {
  it('uses green (#22c55e) pill for APPROVED state', () => {
    const html = renderClinicianReview({ report_state: 'APPROVED' });
    assert.ok(html.includes('#22c55e'), `APPROVED color not found: ${html.slice(0, 300)}`);
    assert.ok(html.includes('APPROVED'));
  });

  it('uses amber (#f59e0b) pill for NEEDS_REVIEW state', () => {
    const html = renderClinicianReview({ report_state: 'NEEDS_REVIEW' });
    assert.ok(html.includes('#f59e0b'), `NEEDS_REVIEW color not found`);
  });

  it('uses red (#ef4444) pill for REJECTED state', () => {
    const html = renderClinicianReview({ report_state: 'REJECTED' });
    assert.ok(html.includes('#ef4444'), `REJECTED color not found`);
  });

  it('uses blue (#3b82f6) pill for REVIEWED_WITH_AMENDMENTS state', () => {
    const html = renderClinicianReview({ report_state: 'REVIEWED_WITH_AMENDMENTS' });
    assert.ok(html.includes('#3b82f6'), `REVIEWED_WITH_AMENDMENTS color not found`);
  });

  it('defaults to grey (#6b7280) for unknown state', () => {
    const html = renderClinicianReview({ report_state: 'UNKNOWN_STATE' });
    assert.ok(html.includes('#6b7280'), `default grey not found`);
  });

  it('defaults to DRAFT_AI state when report_state is absent', () => {
    const html = renderClinicianReview({});
    assert.ok(html.includes('DRAFT_AI'));
  });
});

describe('renderClinicianReview — action buttons', () => {
  it('shows "Send to Review" button for DRAFT_AI state', () => {
    const html = renderClinicianReview({ report_state: 'DRAFT_AI' });
    assert.ok(html.includes('Send to Review'));
    assert.ok(html.includes('data-target="NEEDS_REVIEW"'));
  });

  it('shows Approve / Reject / Amend buttons for NEEDS_REVIEW state', () => {
    const html = renderClinicianReview({ report_state: 'NEEDS_REVIEW' });
    assert.ok(html.includes('data-target="APPROVED"'));
    assert.ok(html.includes('data-target="REJECTED"'));
    assert.ok(html.includes('data-target="REVIEWED_WITH_AMENDMENTS"'));
  });

  it('shows Sign Report button for APPROVED state', () => {
    const html = renderClinicianReview({ report_state: 'APPROVED' });
    assert.ok(html.includes('Sign Report'));
    assert.ok(html.includes('data-action="sign"'));
  });

  it('shows Sign Report button for REVIEWED_WITH_AMENDMENTS state', () => {
    const html = renderClinicianReview({ report_state: 'REVIEWED_WITH_AMENDMENTS' });
    assert.ok(html.includes('Sign Report'));
  });
});

describe('renderClinicianReview — findings table', () => {
  it('renders per-finding review table with correct columns', () => {
    const findings = [
      { id: 'f1', finding_text: 'Elevated TBR.', claim_type: 'INFERRED', status: 'PENDING', evidence_grade: 'B' },
    ];
    const html = renderClinicianReview({ report_state: 'NEEDS_REVIEW' }, findings);
    assert.ok(html.includes('Per-Finding Review'));
    assert.ok(html.includes('Elevated TBR.'));
    assert.ok(html.includes('INFERRED'));
    assert.ok(html.includes('PENDING'));
    assert.ok(html.includes('B'));
  });

  it('renders "No granular findings" when finding list is empty', () => {
    const html = renderClinicianReview({ report_state: 'DRAFT_AI' }, []);
    assert.ok(html.includes('No granular findings.'));
  });

  it('escapes XSS in finding_text', () => {
    const findings = [{ id: 'f1', finding_text: '<script>alert(1)</script>', claim_type: 'PENDING' }];
    const html = renderClinicianReview({ report_state: 'DRAFT_AI' }, findings);
    assert.ok(!html.includes('<script>'), 'raw <script> must be escaped');
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('truncates finding_text longer than 120 chars with ellipsis', () => {
    const longText = 'A'.repeat(130);
    const findings = [{ id: 'f1', finding_text: longText, claim_type: 'SUPPORTED' }];
    const html = renderClinicianReview({ report_state: 'DRAFT_AI' }, findings);
    assert.ok(html.includes('…'), 'ellipsis missing for truncated finding');
    // The original 130-char text should not appear verbatim in output
    assert.ok(!html.includes(longText), '130-char text must be truncated');
  });

  it('uses red (#ef4444) chip for BLOCKED claim_type', () => {
    const findings = [{ id: 'f1', finding_text: 'blocked claim', claim_type: 'BLOCKED' }];
    const html = renderClinicianReview({ report_state: 'DRAFT_AI' }, findings);
    assert.ok(html.includes('#ef4444'), 'BLOCKED finding must use red chip');
  });
});

describe('renderClinicianReview — raw review handoff panel', () => {
  it('renders bad channels when present in raw_review_handoff', () => {
    const report = {
      report_state: 'NEEDS_REVIEW',
      ai_narrative: {
        raw_review_handoff: {
          cleaning_version_number: 3,
          bad_channels: ['F3', 'Cz'],
        },
      },
    };
    const html = renderClinicianReview(report);
    assert.ok(html.includes('Raw Review Handoff'));
    assert.ok(html.includes('F3'));
    assert.ok(html.includes('Cz'));
  });

  it('does not render raw review panel when rawReviewHandoff is null', () => {
    const html = renderClinicianReview({ report_state: 'DRAFT_AI' });
    assert.ok(!html.includes('Raw Review Handoff'));
  });
});

describe('renderClinicianReview — signed-by display', () => {
  it('shows "Signed by" pill when report has signed_by', () => {
    const html = renderClinicianReview({ report_state: 'APPROVED', signed_by: 'Dr. Smith' });
    assert.ok(html.includes('Signed by Dr. Smith'));
  });

  it('escapes XSS in signed_by field', () => {
    const html = renderClinicianReview({ report_state: 'APPROVED', signed_by: '<b>hack</b>' });
    // Raw HTML must not appear — esc() is applied at least once (double-escape is also fine)
    assert.ok(!html.includes('<b>hack</b>'), 'raw <b> must not appear in output');
    // Either single or double-escaped form is acceptable; both are safe
    assert.ok(
      html.includes('&lt;b&gt;') || html.includes('&amp;lt;b&amp;gt;'),
      `expected escaped form in: ${html.slice(0, 300)}`
    );
  });
});
