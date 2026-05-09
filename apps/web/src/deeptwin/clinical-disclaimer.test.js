import { test } from 'node:test';
import assert from 'node:assert';
import {
  escHtml,
  renderCitationLink,
  renderEvidenceList,
  renderNoEvidenceNotice,
  renderEvidenceDisclaimerBanner,
  renderEvidenceSection,
  renderEvidenceDisclaimerInline,
  renderApprovalBadge,
} from './clinical-disclaimer.js';

test('escHtml: escapes HTML entities', () => {
  assert.strictEqual(escHtml('<script>alert("xss")</script>'), 
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.strictEqual(escHtml('foo & bar'), 'foo &amp; bar');
  assert.strictEqual(escHtml(null), '');
  assert.strictEqual(escHtml(undefined), '');
});

test('renderCitationLink: renders PMID links', () => {
  const cit = { pmid: '12345678', title: 'Study' };
  const html = renderCitationLink(cit);
  assert.match(html, /pubmed\.ncbi\.nlm\.nih\.gov/);
  assert.match(html, /PMID:12345678/);
  assert.match(html, /target="_blank"/);
});

test('renderCitationLink: renders DOI links', () => {
  const cit = { doi: '10.1234/example', title: 'Study' };
  const html = renderCitationLink(cit);
  assert.match(html, /doi\.org/);
  assert.match(html, /DOI:10\.1234\/example/);
});

test('renderCitationLink: returns plain text if no PMID or DOI', () => {
  const cit = { title: 'Just a Title' };
  const html = renderCitationLink(cit);
  assert.match(html, /Just a Title/);
  assert.match(html, /dt-cit-text/);
});

test('renderEvidenceList: renders multiple citations', () => {
  const citations = [
    { pmid: '111', year: '2020', authors: 'Smith et al.' },
    { doi: '10.5678', year: '2021', authors: 'Jones et al.' },
  ];
  const html = renderEvidenceList(citations);
  assert.match(html, /PMID:111/);
  assert.match(html, /DOI:10\.5678/);
  assert.match(html, /2020/);
  assert.match(html, /2021/);
  assert.match(html, /dt-cit-list/);
});

test('renderEvidenceList: returns empty string for empty array', () => {
  assert.strictEqual(renderEvidenceList([]), '');
  assert.strictEqual(renderEvidenceList(null), '');
  assert.strictEqual(renderEvidenceList(undefined), '');
});

test('renderNoEvidenceNotice: renders honest "not available" state', () => {
  const html = renderNoEvidenceNotice({
    condition: 'MDD',
    protocol_name: 'TMS 10 Hz',
    detail: 'Check external resources.',
  });
  assert.match(html, /No local evidence found/);
  assert.match(html, /TMS 10 Hz/);
  assert.match(html, /MDD/);
  assert.match(html, /Clinician judgment required/);
  assert.match(html, /dt-notice-no-evidence/);
});

test('renderEvidenceDisclaimerBanner: renders info notice', () => {
  const html = renderEvidenceDisclaimerBanner();
  assert.match(html, /Evidence is decision-support only/);
  assert.match(html, /Clinician review/);
  assert.match(html, /dt-notice-info/);
});

test('renderEvidenceSection: with citations', () => {
  const citations = [{ pmid: '123', year: '2020' }];
  const html = renderEvidenceSection('TMS Evidence', citations, { expanded: true });
  assert.match(html, /TMS Evidence/);
  assert.match(html, /PMID:123/);
  assert.match(html, /dt-evidence-section/);
  assert.match(html, /open/); // expanded
});

test('renderEvidenceSection: without citations (honest empty state)', () => {
  const html = renderEvidenceSection('TMS Evidence', [], { expanded: false });
  assert.match(html, /TMS Evidence/);
  assert.match(html, /No local evidence found/);
  assert.match(html, /dt-evidence-section/);
  assert.doesNotMatch(html, /open/); // not expanded by default
});

test('renderEvidenceDisclaimerInline: renders inline notice', () => {
  const html = renderEvidenceDisclaimerInline({
    requires_clinician_review: true,
    confidence_tier: 'moderate',
  });
  assert.match(html, /Clinician review required/);
  assert.match(html, /Confidence: moderate/);
  assert.match(html, /decision-support only/);
});

test('renderApprovalBadge: renders pending status', () => {
  const html = renderApprovalBadge('pending');
  assert.match(html, /Awaiting approval/);
  assert.match(html, /dt-approval-badge/);
});

test('renderApprovalBadge: renders approved status', () => {
  const html = renderApprovalBadge('approved');
  assert.match(html, /Approved/);
});

test('renderApprovalBadge: renders escalated status', () => {
  const html = renderApprovalBadge('escalated');
  assert.match(html, /Escalated/);
});

test('renderApprovalBadge: with evidence link', () => {
  const html = renderApprovalBadge('approved', {
    show_evidence_link: true,
    evidence_link_href: '/evidence/123',
  });
  assert.match(html, /view evidence/);
  assert.match(html, /\/evidence\/123/);
});
