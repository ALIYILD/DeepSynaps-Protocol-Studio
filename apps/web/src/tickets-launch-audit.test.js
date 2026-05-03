// Logic-only contract tests for the Tickets / operational support workspace
// (2026-05-03). Run: node --test src/tickets-launch-audit.test.js
//
// Pins honest labelling, demo gating, and source-grep invariants without
// executing pages-practice.js in Node (it imports browser-only modules).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PAGES_PRACTICE = path.join(__dirname, 'pages-practice.js');
const APP_JS = path.join(__dirname, 'app.js');

const src = fs.readFileSync(PAGES_PRACTICE, 'utf8');
const appSrc = fs.readFileSync(APP_JS, 'utf8');

test('pgTickets: required scope-of-use copy is present', () => {
  assert.match(
    src,
    /Tickets are for operational support and workflow issues/,
    'must include product scope disclaimer'
  );
  assert.match(
    src,
    /not emergency triage, adverse-event submission, clinical review, treatment approval, or a substitute for clinic safety protocols/,
    'must distinguish from emergency/AE/clinical sign-off'
  );
});

test('pgTickets: no fake support or agent reply simulation', () => {
  assert.ok(!/OpenClaw Agent/.test(src), 'must not fabricate OpenClaw agent replies');
  assert.ok(!/DevOps Bot/.test(src), 'must not fabricate DevOps bot replies');
  assert.ok(!/Simulate|Agent Note|_tkAgentReport/.test(src), 'must remove agent-note simulation');
});

test('pgTickets: demo examples only when VITE_ENABLE_DEMO', () => {
  assert.match(
    src,
    /tickets\.length === 0 && _demoEnabled/,
    'demo seed must be gated on demo flag'
  );
  assert.match(
    src,
    /VITE_ENABLE_DEMO/,
    'must read VITE_ENABLE_DEMO for preview behaviour'
  );
  assert.match(src, /\[Demo\]/, 'demo rows must be visibly labelled in title');
});

test('pgTickets: local storage honesty + no fake notification', () => {
  assert.match(src, /local to this browser|LOCAL|local-browser/i);
  assert.match(src, /Not sent to a server|not sent to support|Nothing here notifies/i);
});

test('pgTickets: safety categories show protocol warning in modal', () => {
  assert.match(src, /patient_safety_concern/);
  assert.match(src, /adverse_event/);
  assert.match(src, /_tkModalCat/);
  assert.match(src, /adverse-event protocol|safety \/ escalation protocol/i);
});

test('app.js: tickets route blocks patient/guest at render', () => {
  assert.match(appSrc, /currentPage === 'tickets'/);
  assert.match(appSrc, /tr === 'patient'/);
  assert.match(appSrc, /tr === 'guest'/);
});

test('NAV: guest cannot see tickets in sidebar', () => {
  assert.match(
    appSrc,
    /guest:\s*\[[^\]]*'tickets'/,
    'tickets should be in ROLE_NAV_HIDE for guest'
  );
});

test('pgTickets: linked module strip includes core routes', () => {
  for (const id of ['clinician-inbox', 'schedule-v2', 'mri-analysis', 'protocol-studio', 'finance-v2', 'ai-agent-v2']) {
    assert.ok(src.includes(`'${id}'`), `MODULE_LINKS should include ${id}`);
  }
});

test('pgTickets: attachment / escalation are disabled with explanation', () => {
  assert.match(src, /Uploads are disabled/);
  assert.match(src, /No outbound email/);
});
