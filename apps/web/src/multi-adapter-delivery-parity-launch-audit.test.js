// Logic-only tests for the Multi-Adapter Delivery Parity launch-audit
// (2026-05-01).
//
// Closes the adapter-parity gap from #381 (SendGrid) + #383 (Caregiver
// Delivery Ack). The dispatch row was only being written for SendGrid
// — so the bidirectional ack loop silently failed to close on
// Twilio / Slack / PagerDuty wins. This PR wires the audit emitter to
// the dispatch loop (one helper, four adapters, one note format) and
// surfaces the channel chip on the patient + caregiver UIs.
//
// Pin the front-end against silent fakes:
//   - pgPatientCaregiver renders an "via {channel}" chip on the
//     Recent landed digests subsection (sourced from
//     LastAcknowledgement.latest_landed_channel).
//   - pgPatientDigest "Caregiver delivery confirmations" subsection
//     renders an "via {channel}" chip per delivered row (sourced from
//     CaregiverDeliverySummaryRow.last_delivered_channel).
//   - The "Last confirmed" stamp stays channel-agnostic — only its
//     placement is preserved (no parallel per-channel ack).
//   - The Recent landed digests subsection's helper text mentions
//     channels other than SendGrid (proves the copy was updated).
//   - NO PHI of caregiver beyond first name in the rendered HTML.
//   - Test file is registered in apps/web/package.json::test:unit.
//
// Run: node --test src/multi-adapter-delivery-parity-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


function readSrc(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}


// ── 1. pgPatientCaregiver renders the channel chip ─────────────────────────


test('pgPatientCaregiver reads latest_landed_channel from the last-ack lookup', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  assert.ok(
    src.includes('latest_landed_channel'),
    'page must read latest_landed_channel from the last-acknowledgement lookup',
  );
});


test('pgPatientCaregiver renders an "via {channel}" chip on the Recent landed digests row', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  // Anchor on the unique channel-chip testid we added.
  const idx = src.indexOf('data-testid="pt-cg-channel-chip"');
  assert.notEqual(
    idx, -1,
    'pgPatientCaregiver must include the pt-cg-channel-chip testid',
  );
  // Slice forward + render assertion.
  const slice = src.slice(idx, idx + 600);
  assert.ok(
    slice.includes('via'),
    'channel chip must include "via" prefix',
  );
});


test('pgPatientCaregiver helper copy mentions channels beyond SendGrid', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  // The Recent landed digests subsection's helper text was updated to
  // mention sms / Slack / inbox so the caregiver knows the chip is
  // cross-channel.
  const idx = src.indexOf('data-testid="pt-cg-recent-digests"');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx, idx + 1800);
  // Must mention at least one non-email channel in the copy so the UX
  // is honest about what "via {channel}" can mean.
  const mentionsSlack = slice.includes('Slack');
  const mentionsPhone = slice.includes('phone');
  const mentionsInbox = slice.includes('inbox');
  assert.ok(
    mentionsSlack || mentionsPhone,
    'helper copy must mention Slack or phone (cross-channel honesty)',
  );
  assert.ok(
    mentionsInbox,
    'helper copy must still mention inbox (email channel still wired)',
  );
});


test('pgPatientCaregiver preserves channel chip on ack click re-render', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  // After a successful ack POST, the in-memory grantAckMap entry must
  // carry latest_landed_channel forward so the re-render still shows
  // the chip. Anchor on the assignment after the ack call.
  const idx = src.indexOf('caregiverPortalAcknowledgeDelivery(gid)');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx, idx + 800);
  assert.ok(
    slice.includes('latest_landed_channel'),
    'ack click handler must preserve latest_landed_channel in the cache',
  );
});


// ── 2. pgPatientDigest renders the per-row channel chip ────────────────────


test('pgPatientDigest reads last_delivered_channel on each caregiver row', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  assert.ok(
    src.includes('last_delivered_channel'),
    'page must read last_delivered_channel from the caregiver-delivery summary',
  );
});


test('pgPatientDigest renders "via {channel}" chip per caregiver row', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  const idx = src.indexOf('data-testid="pd-cg-channel-chip"');
  assert.notEqual(
    idx, -1,
    'pgPatientDigest must include the pd-cg-channel-chip testid',
  );
  const slice = src.slice(idx, idx + 400);
  assert.ok(
    slice.includes('via'),
    'channel chip must include "via" prefix',
  );
});


test('pgPatientDigest channel chip lives next to caregiver name (channel-agnostic stamp untouched)', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  // The channel chip variable is interpolated alongside the caregiver
  // name template literal: `${name}${channelHtml}`. Verify both that
  // the chip is defined and that it's interpolated next to the name.
  assert.ok(
    src.includes('${name}${channelHtml}'),
    'channel chip must be interpolated immediately after the caregiver name in the row template',
  );
  // Last-confirmed stamp lives in a separate div BELOW the name+chip,
  // so its inclusion check is independent — the render order is name
  // → chip → confirmHtml.
  assert.ok(
    src.includes('${confirmHtml}'),
    'caregiver delivery row template must still render the confirmHtml block',
  );
});


// ── 3. Last-confirmed stamp stays channel-agnostic ─────────────────────────


test('Caregiver delivery confirmations Last-confirmed stamp does not gate on channel', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  // The patient-side "Last confirmed:" stamp logic must read the ack
  // timestamp regardless of channel. Find the testid + verify the
  // surrounding markup uses last_acknowledged_at, not channel.
  const idx = src.indexOf('data-testid="pd-cg-last-confirmed"');
  assert.notEqual(idx, -1);
  // Slice backwards to capture the conditional branch above.
  const slice = src.slice(idx - 800, idx + 200);
  assert.ok(
    slice.includes('ackIso'),
    'Last-confirmed stamp must read the ack timestamp variable',
  );
  // The stamp branch must NOT depend on the channel chip.
  const stampBranch = slice.slice(slice.indexOf('if (ackIso)'));
  assert.ok(
    !/channel/i.test(stampBranch),
    'Last-confirmed stamp branch must be channel-agnostic',
  );
});


// ── 4. NO PHI of caregiver beyond first name in the rendered HTML ──────────


test('Channel chip render does not introduce caregiver email or full-name binding', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  const idx = src.indexOf('data-testid="pd-cg-channel-chip"');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx - 200, idx + 800);
  assert.ok(
    !slice.includes('caregiver_email'),
    'channel chip render must not bind caregiver_email',
  );
  assert.ok(
    !slice.includes('caregiver_full_name'),
    'channel chip render must not bind caregiver_full_name',
  );
});


test('Caregiver Portal channel chip render does not introduce caregiver email binding', () => {
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  const idx = src.indexOf('data-testid="pt-cg-channel-chip"');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx - 200, idx + 600);
  assert.ok(
    !slice.includes('caregiver_email'),
    'caregiver-portal chip render must not bind caregiver_email',
  );
});


// ── 5. Test file is registered in the test:unit script ─────────────────────


test('apps/web/package.json::test:unit registers this file', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  );
  const cmd = (pkg.scripts && pkg.scripts['test:unit']) || '';
  assert.ok(
    cmd.includes('multi-adapter-delivery-parity-launch-audit.test.js'),
    'apps/web/package.json::test:unit must register this test file',
  );
});


// ── 6. Channel chip taxonomy stays consistent ──────────────────────────────


test('Channel chip rendering uses the channel value from the API verbatim (no client-side adapter→channel mapping)', () => {
  // Multi-Adapter Delivery Parity centralises the adapter→channel
  // taxonomy on the server (oncall_delivery.py::ADAPTER_CHANNEL). The
  // client must NOT maintain a parallel mapping — it just renders the
  // value the API returns. This test asserts the absence of a
  // client-side adapter→channel switch.
  const src = (readSrc('pages-patient.js') + '\n' + readSrc('pages-patient/caregiver.js') + '\n' + readSrc('pages-patient/digest.js') + '\n' + readSrc('pages-patient/home-devices.js') + '\n' + readSrc('pages-patient/adherence.js') + '\n' + readSrc('pages-patient/intake.js') + '\n' + readSrc('pages-patient/import-wizard.js') + '\n' + readSrc('pages-patient/media.js') + '\n' + readSrc('pages-patient/wearables.js') + '\n' + readSrc('pages-patient/symptom-notifications.js') + '\n' + readSrc('pages-patient/dashboard.js') + '\n' + readSrc('pages-patient/sessions.js'));
  // No client-side ternary turning adapter ('sendgrid' / 'twilio')
  // into a chip. Anchor on the chip render and verify the immediate
  // context has no adapter literal.
  const idx = src.indexOf('data-testid="pd-cg-channel-chip"');
  assert.notEqual(idx, -1);
  const slice = src.slice(idx - 200, idx + 400);
  assert.ok(
    !slice.includes("'sendgrid'") && !slice.includes('"sendgrid"'),
    'page must not hard-code adapter names in the channel chip render',
  );
  assert.ok(
    !slice.includes("'twilio'") && !slice.includes('"twilio"'),
    'page must not hard-code adapter names in the channel chip render',
  );
});
