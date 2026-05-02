// Logic-only tests for the Patient Digest launch-audit (2026-05-01).
//
// Patient-side mirror of the Clinician Digest (#366). Daily/weekly self
// summary the patient sees on demand. Pin the patient-side digest page
// against silent fakes:
//   - Range picker computes since/until ISO windows correctly
//   - Empty-state branch fires when every count is zero
//   - Delta-icon arrows render correctly across positive / negative / zero
//   - Section drill-out URL maps to a known patient-side route
//   - "DEMO" banner only renders when summary.is_demo === true
//   - api.js exposes the helpers needed by pgPatientDigest, all routed
//     under /api/v1/patient-digest/*
//   - pages-patient.js does NOT inline any cohort comparison or peer
//     percentile copy — the digest is per-patient
//   - audit-events helper builds a small JSON envelope honouring the
//     documented 480-char note ceiling
//
// Run: node --test src/patient-digest-launch-audit.test.js
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


function rangeIso(days, now = new Date('2026-04-30T12:00:00Z')) {
  const since = new Date(now.getTime() - days * 86400000);
  return { since: since.toISOString(), until: now.toISOString() };
}


function deltaIcon(d) {
  if (d == null) return '—';
  if (d > 0) return `▲ ${d.toFixed(1)}`;
  if (d < 0) return `▼ ${Math.abs(d).toFixed(1)}`;
  return '→ 0';
}


function isNoActivity(summary) {
  return (summary.sessions_completed === 0)
    && (summary.adherence_streak_days === 0)
    && (summary.symptom_entries === 0)
    && (summary.pending_messages === 0)
    && (summary.new_reports === 0)
    && Object.values(summary.wellness_axes_trends || {}).every(v => v.current == null);
}


function drillOutPage(section) {
  const map = {
    sessions: 'patient-sessions',
    adherence: 'pt-adherence-events',
    wellness: 'pt-wellness',
    symptoms: 'pt-journal',
    messages: 'patient-messages',
    reports: 'patient-reports',
  };
  return map[section] || null;
}


function buildAuditPayload(event, extra = {}) {
  return {
    event,
    note: extra.note ? String(extra.note).slice(0, 480) : null,
    using_demo_data: !!extra.using_demo_data,
  };
}


// ── 1. Range-picker windows ─────────────────────────────────────────────────


test('rangeIso(7) produces a 7-day window ending at now', () => {
  const r = rangeIso(7);
  const since = new Date(r.since);
  const until = new Date(r.until);
  const days = Math.round((until - since) / 86400000);
  assert.equal(days, 7);
});


test('rangeIso(30) produces a 30-day window ending at now', () => {
  const r = rangeIso(30);
  const since = new Date(r.since);
  const until = new Date(r.until);
  const days = Math.round((until - since) / 86400000);
  assert.equal(days, 30);
});


// ── 2. Empty-state predicate ────────────────────────────────────────────────


test('isNoActivity returns true for a fully-empty summary', () => {
  assert.equal(isNoActivity({
    sessions_completed: 0,
    adherence_streak_days: 0,
    symptom_entries: 0,
    pending_messages: 0,
    new_reports: 0,
    wellness_axes_trends: { mood: { current: null, prior: null, delta: null } },
  }), true);
});


test('isNoActivity returns false when any count is non-zero', () => {
  assert.equal(isNoActivity({
    sessions_completed: 1,
    adherence_streak_days: 0,
    symptom_entries: 0,
    pending_messages: 0,
    new_reports: 0,
    wellness_axes_trends: {},
  }), false);
});


test('isNoActivity returns false when wellness axes have current values', () => {
  assert.equal(isNoActivity({
    sessions_completed: 0,
    adherence_streak_days: 0,
    symptom_entries: 0,
    pending_messages: 0,
    new_reports: 0,
    wellness_axes_trends: { mood: { current: 6, prior: null, delta: null } },
  }), false);
});


// ── 3. Delta icons ──────────────────────────────────────────────────────────


test('deltaIcon renders up arrow for positive deltas', () => {
  assert.equal(deltaIcon(0.5), '▲ 0.5');
});


test('deltaIcon renders down arrow for negative deltas', () => {
  assert.equal(deltaIcon(-1.2), '▼ 1.2');
});


test('deltaIcon renders dash for null', () => {
  assert.equal(deltaIcon(null), '—');
});


test('deltaIcon renders flat zero', () => {
  assert.equal(deltaIcon(0), '→ 0');
});


// ── 4. Drill-out URL mapping ────────────────────────────────────────────────


test('drillOutPage returns the documented patient-side route per section', () => {
  assert.equal(drillOutPage('sessions'), 'patient-sessions');
  assert.equal(drillOutPage('adherence'), 'pt-adherence-events');
  assert.equal(drillOutPage('wellness'), 'pt-wellness');
  assert.equal(drillOutPage('symptoms'), 'pt-journal');
  assert.equal(drillOutPage('messages'), 'patient-messages');
  assert.equal(drillOutPage('reports'), 'patient-reports');
});


test('drillOutPage returns null for unknown sections', () => {
  assert.equal(drillOutPage('cohort'), null);
  assert.equal(drillOutPage(''), null);
});


// ── 5. Audit payload envelope ───────────────────────────────────────────────


test('buildAuditPayload truncates note at 480 chars', () => {
  const long = 'x'.repeat(600);
  const p = buildAuditPayload('view', { note: long });
  assert.equal(p.event, 'view');
  assert.equal(p.note.length, 480);
  assert.equal(p.using_demo_data, false);
});


test('buildAuditPayload coerces using_demo_data into a boolean', () => {
  const p = buildAuditPayload('demo_banner_shown', { using_demo_data: 1 });
  assert.equal(p.using_demo_data, true);
});


// ── 6. api.js helper coverage ───────────────────────────────────────────────


test('api.js exposes the patient-digest helpers needed by pgPatientDigest', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  assert.match(apiSrc, /patientDigestSummary\s*:/);
  assert.match(apiSrc, /patientDigestSections\s*:/);
  assert.match(apiSrc, /patientDigestSendEmail\s*:/);
  assert.match(apiSrc, /patientDigestShareCaregiver\s*:/);
  assert.match(apiSrc, /patientDigestExportCsvUrl\s*:/);
  assert.match(apiSrc, /patientDigestExportNdjsonUrl\s*:/);
  assert.match(apiSrc, /postPatientDigestAuditEvent\s*:/);
});


test('all patient-digest API helpers route under /api/v1/patient-digest/', () => {
  const apiSrc = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  // Capture every URL mentioned alongside a patientDigest helper. Each
  // must live under the documented prefix.
  const block = apiSrc.split('Patient Digest launch-audit')[1] || '';
  // Match string literals inside the block until the next "// ──" divider.
  const slice = block.split('// ──')[0] || block;
  const urls = slice.match(/['"`]\/api\/v1\/[^'"`]+/g) || [];
  assert.ok(urls.length >= 5, 'expected at least 5 URLs in the block');
  for (const u of urls) {
    assert.match(u, /\/api\/v1\/patient-digest\//);
  }
});


// ── 7. pages-patient.js wiring ──────────────────────────────────────────────


test('pgPatientDigest is exported from pages-patient.js', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8'));
  assert.match(src, /export async function pgPatientDigest\b/);
});


test('pgPatientDigest emits a mount-time audit ping', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8'));
  // The mount ping must be the documented `view` event posted via the
  // patient_digest audit-events helper.
  assert.match(src, /postPatientDigestAuditEvent\(\s*\{\s*event:\s*['"]view['"]/);
});


test('pgPatientDigest does NOT include peer-comparison / cohort copy', () => {
  // PHI / regulatory regression — the patient digest must never compare
  // the actor to other patients. Catch any wording that signals a
  // cohort percentile / peer rank crept into the page.
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8'));
  // Look only at the digest function body to keep this test deterministic.
  const start = src.indexOf('export async function pgPatientDigest');
  assert.ok(start > 0, 'pgPatientDigest must be defined');
  const slice = src.slice(start, start + 12000);
  assert.doesNotMatch(slice, /percentile/i);
  assert.doesNotMatch(slice, /\bcohort\b/i);
  assert.doesNotMatch(slice, /\bpeer(?:s|\b)/i);
  assert.doesNotMatch(slice, /\branked against\b/i);
  assert.doesNotMatch(slice, /better than \d+%/i);
});


test('pgPatientDigest renders the honest empty state copy', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8'));
  assert.match(src, /No activity to summarise yet for this period/);
});


// ── 8. Sidebar entry ────────────────────────────────────────────────────────


test('My Digest is registered in the patient sidebar nav', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8'));
  // The sidebar nav entry must reference the documented page id and
  // the human-readable label.
  assert.match(src, /id:\s*['"]pt-digest['"]\s*,\s*label:\s*['"]My Digest['"]/);
});


test('app.js routes pt-digest and patient-digest aliases to pgPatientDigest', () => {
  const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert.match(src, /case\s+['"]pt-digest['"][^\n]+pgPatientDigest/);
  assert.match(src, /case\s+['"]patient-digest['"][^\n]+pgPatientDigest/);
});


// ── 9. CTA wording is honest ───────────────────────────────────────────────


test('Send-email + share-caregiver CTAs disclose queued status honestly', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8'));
  // The disclosure text MUST mention "queued" and "audit" so the
  // patient is not lied to about delivery state.
  const start = src.indexOf('export async function pgPatientDigest');
  const slice = src.slice(start, start + 12000);
  assert.match(slice, /queued/i);
  assert.match(slice, /audit/i);
});


// ── 10. Demo banner is server-driven ────────────────────────────────────────


test('Demo banner is server-driven (gated on summary.is_demo)', () => {
  const src = (fs.readFileSync(path.join(__dirname, 'pages-patient.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'caregiver.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, 'pages-patient', 'digest.js'), 'utf8'));
  const start = src.indexOf('export async function pgPatientDigest');
  const slice = src.slice(start, start + 12000);
  // Catches both `summary.is_demo` and the in-page guard. Must not
  // be hardcoded true.
  assert.match(slice, /summary\.is_demo/);
  assert.doesNotMatch(slice, /is_demo\s*=\s*true/i);
});
