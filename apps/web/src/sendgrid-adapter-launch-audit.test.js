// Logic-only tests for the SendGrid Adapter launch-audit (2026-05-01).
//
// Covers the patient-side caregiver delivery confirmations subsection on
// the Patient Digest page (#376). Backend wiring (SendGridEmailAdapter,
// caregiver-delivery-summary endpoint) is exercised in
// apps/api/tests/test_sendgrid_adapter_launch_audit.py — these tests pin
// the renderer behaviour:
//   - rows render with first name + count + last delivered date
//   - empty state renders when there are zero active grants
//   - NO PHI of caregivers leaks: never email, never full name
//   - count display reflects total_delivered_count for the period
//   - audit composition: the page's existing patient_digest.view ping
//     covers the section mount; no new audit surface is introduced
//   - api.js exposes the helper, routed under /api/v1/patient-digest/
//
// Run: node --test src/sendgrid-adapter-launch-audit.test.js
//
// Note: apps/web tests use Node's built-in `node --test`, NOT vitest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';


const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ── Mirrors of in-page helpers (kept in lockstep with pages-patient.js) ────


function pdEsc(s) {
  return String(s == null ? '' : s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


// Renderer for the Caregiver delivery confirmations subsection. Mirrors
// the inline string template in pages-patient.js so we can exercise the
// branches without spinning up a DOM.
function renderCaregiverDeliveryConfirmations(caregiverDelivery) {
  if (!caregiverDelivery) return '';
  const rows = Array.isArray(caregiverDelivery.rows) ? caregiverDelivery.rows : [];
  const total = caregiverDelivery.total_delivered_count || 0;
  const emptyHtml = `<div class="empty">No caregivers with active consent grants. Use Share with caregiver above to mint a consent grant first.</div>`;
  const rowsHtml = rows.map(r => {
    const name = r.caregiver_first_name ? pdEsc(r.caregiver_first_name) : 'Caregiver';
    const last = r.last_delivered_at ? pdEsc(String(r.last_delivered_at).slice(0, 10)) : '—';
    return `<div class="row" data-cg="${pdEsc(r.caregiver_user_id)}">
      <div>
        <div class="cg-name">${name}</div>
        <div class="cg-last">Last delivered: ${last}</div>
      </div>
      <div class="cg-count">${r.digests_delivered_count || 0}</div>
    </div>`;
  }).join('');
  return `<section data-section="caregiver-delivery-confirmations" data-total="${total}">
    <h3>Caregiver delivery confirmations</h3>
    ${rows.length === 0 ? emptyHtml : rowsHtml}
  </section>`;
}


// ── 1. Renderer covers the empty-state branch ──────────────────────────────


test('renders empty-state when caregiverDelivery has zero rows', () => {
  const html = renderCaregiverDeliveryConfirmations({ rows: [], total_delivered_count: 0 });
  assert.match(html, /No caregivers with active consent grants/);
  assert.match(html, /Use Share with caregiver/);
});


test('returns empty string when caregiverDelivery is null', () => {
  // Network failure → api helper returns null → renderer is no-op.
  assert.equal(renderCaregiverDeliveryConfirmations(null), '');
});


test('returns empty string when caregiverDelivery is undefined', () => {
  assert.equal(renderCaregiverDeliveryConfirmations(undefined), '');
});


// ── 2. Renderer covers populated rows ──────────────────────────────────────


test('renders one row per caregiver with first name + count + date', () => {
  const html = renderCaregiverDeliveryConfirmations({
    rows: [
      {
        caregiver_user_id: 'cg-001',
        caregiver_first_name: 'Alice',
        digests_delivered_count: 3,
        last_delivered_at: '2026-05-01T08:00:00+00:00',
      },
    ],
    total_delivered_count: 3,
  });
  assert.match(html, /Alice/);
  assert.match(html, /class="cg-count">3</);
  // Date is sliced to YYYY-MM-DD only.
  assert.match(html, /2026-05-01/);
  assert.doesNotMatch(html, /T08:00:00/);
});


test('renders multiple caregiver rows', () => {
  const html = renderCaregiverDeliveryConfirmations({
    rows: [
      { caregiver_user_id: 'cg-1', caregiver_first_name: 'Alice', digests_delivered_count: 2, last_delivered_at: '2026-04-30' },
      { caregiver_user_id: 'cg-2', caregiver_first_name: 'Bob', digests_delivered_count: 1, last_delivered_at: '2026-04-28' },
    ],
    total_delivered_count: 3,
  });
  assert.match(html, /Alice/);
  assert.match(html, /Bob/);
  // Both row markers present.
  const rowMatches = html.match(/data-cg=/g) || [];
  assert.equal(rowMatches.length, 2);
});


test('falls back to "Caregiver" when first name is null', () => {
  const html = renderCaregiverDeliveryConfirmations({
    rows: [
      {
        caregiver_user_id: 'cg-no-name',
        caregiver_first_name: null,
        digests_delivered_count: 1,
        last_delivered_at: null,
      },
    ],
    total_delivered_count: 1,
  });
  assert.match(html, /class="cg-name">Caregiver</);
  // Last delivered placeholder when null.
  assert.match(html, /Last delivered: —/);
});


// ── 3. NO-PHI assertions ────────────────────────────────────────────────────


test('renderer never emits a caregiver email', () => {
  // The shape we receive from the backend has NO email field. Even if
  // someone tries to slip one in, the renderer ignores it.
  const html = renderCaregiverDeliveryConfirmations({
    rows: [
      {
        caregiver_user_id: 'cg-1',
        caregiver_first_name: 'Charlie',
        // These extra fields should NEVER make it to the template even if
        // the backend regresses.
        caregiver_email: 'leaked@example.com',
        caregiver_full_name: 'Charlie Sensitive',
        digests_delivered_count: 1,
        last_delivered_at: '2026-04-30',
      },
    ],
    total_delivered_count: 1,
  });
  assert.doesNotMatch(html, /leaked@example.com/);
  assert.doesNotMatch(html, /Sensitive/);
  assert.match(html, /Charlie/);
});


test('renderer escapes potentially-malicious caregiver names', () => {
  const html = renderCaregiverDeliveryConfirmations({
    rows: [
      {
        caregiver_user_id: 'cg-1',
        caregiver_first_name: '<script>alert(1)</script>',
        digests_delivered_count: 1,
        last_delivered_at: '2026-04-30',
      },
    ],
    total_delivered_count: 1,
  });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});


// ── 4. Total-delivered count surfaced ──────────────────────────────────────


test('total_delivered_count rendered as data attribute', () => {
  const html = renderCaregiverDeliveryConfirmations({
    rows: [
      { caregiver_user_id: 'cg-1', caregiver_first_name: 'A', digests_delivered_count: 4, last_delivered_at: '2026-04-30' },
    ],
    total_delivered_count: 4,
  });
  assert.match(html, /data-total="4"/);
});


test('total_delivered_count defaults to 0 when missing', () => {
  const html = renderCaregiverDeliveryConfirmations({ rows: [] });
  assert.match(html, /data-total="0"/);
});


// ── 5. api.js exposes the helper ───────────────────────────────────────────


test('api.js exposes patientDigestCaregiverDeliverySummary helper', () => {
  const apiPath = path.join(__dirname, 'api.js');
  const src = fs.readFileSync(apiPath, 'utf8');
  assert.match(src, /patientDigestCaregiverDeliverySummary/);
  assert.match(src, /\/api\/v1\/patient-digest\/caregiver-delivery-summary/);
});


test('api helper returns null on network failure (no thrown errors leak to UI)', () => {
  const apiPath = path.join(__dirname, 'api.js');
  const src = fs.readFileSync(apiPath, 'utf8');
  // The helper must wrap with .catch(() => null) so the renderer's
  // "if (!caregiverDelivery) return ''" branch fires honestly.
  const slice = src.split('patientDigestCaregiverDeliverySummary')[1] || '';
  // First 400 chars of the helper definition must contain the catch.
  assert.match(slice.slice(0, 400), /catch\(\(\)\s*=>\s*null\)/);
});


// ── 6. pgPatientDigest mounts the section ──────────────────────────────────


test('pgPatientDigest fetches caregiver-delivery-summary in parallel', () => {
  const pagesPath = path.join(__dirname, 'pages-patient.js');
  const src = (fs.readFileSync(pagesPath, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  // The Promise.all that fans out the digest requests must include
  // patientDigestCaregiverDeliverySummary.
  assert.match(src, /api\.patientDigestCaregiverDeliverySummary\(range\)/);
});


test('pgPatientDigest renders the caregiver delivery confirmations subsection', () => {
  const pagesPath = path.join(__dirname, 'pages-patient.js');
  const src = (fs.readFileSync(pagesPath, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  assert.match(src, /Caregiver delivery confirmations/);
  assert.match(src, /caregiverDeliveryHtml/);
});


test('pgPatientDigest does NOT introduce a new audit surface', () => {
  // Audit composition: mount audit ping is the existing
  // patient_digest.view event. We must NOT have added a new postAudit
  // call specifically for caregiver-delivery-summary on the frontend.
  const pagesPath = path.join(__dirname, 'pages-patient.js');
  const src = (fs.readFileSync(pagesPath, 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'home-devices.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'adherence.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'intake.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'import-wizard.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'media.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'wearables.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'symptom-notifications.js'), 'utf8'));
  assert.doesNotMatch(src, /caregiver_delivery_summary_viewed/);
  // The existing mount audit ping is still present.
  assert.match(src, /pgPatientDigest mount/);
});


// ── 7. Anonymisation contract documented ───────────────────────────────────


test('rendered HTML never includes the substring "@" from a caregiver row', () => {
  const html = renderCaregiverDeliveryConfirmations({
    rows: [
      {
        caregiver_user_id: 'cg-1',
        caregiver_first_name: 'Alice',
        digests_delivered_count: 2,
        last_delivered_at: '2026-04-30',
      },
    ],
    total_delivered_count: 2,
  });
  assert.doesNotMatch(html, /@/);
});


// ── 8. Failed/queued dispatches excluded from count ────────────────────────


test('count uses digests_delivered_count verbatim (never adds queued/failed)', () => {
  // The backend already filters delivery_status=sent only. The renderer
  // surfaces the count verbatim. No client-side aggregation that could
  // accidentally include failed dispatches.
  const html = renderCaregiverDeliveryConfirmations({
    rows: [
      {
        caregiver_user_id: 'cg-1',
        caregiver_first_name: 'Alice',
        digests_delivered_count: 3,  // Backend already excluded failed/queued
        last_delivered_at: '2026-04-30',
      },
    ],
    total_delivered_count: 3,
  });
  assert.match(html, /class="cg-count">3</);
});
