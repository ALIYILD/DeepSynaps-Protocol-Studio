/**
 * Virtual Care / Live Session — governance strings and routing hooks stay stable for clinic preview.
 */
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(__dirname, 'pages-virtualcare.js'), 'utf8');
const APP = readFileSync(join(__dirname, 'app.js'), 'utf8');

test('Notes persistence warning (exact EHR sentence)', () => {
  assert.ok(
    SRC.includes('Session notes are local/export-only until saved to the clinical record/EHR.'),
    'required notes persistence warning',
  );
});

test('Video provider honesty (Jitsi / clinic-managed, not private medical-grade)', () => {
  assert.ok(SRC.includes('Clinic-managed video room'), 'heading');
  assert.ok(SRC.includes('Third-party meeting (Jitsi Meet)'), 'jitsi honesty');
  assert.ok(
    SRC.includes('not a private medical-grade telehealth appliance'),
    'not implying HIPAA appliance',
  );
  assert.ok(
    SRC.includes('Video room link generated for this session'),
    'session-generated room wording',
  );
  assert.ok(
    SRC.includes('Do not embed identifiable patient information in room names or URLs'),
    'PHI room/url warning',
  );
});

test('Empty state: no timer/video implication + navigation links', () => {
  assert.ok(SRC.includes('No active or upcoming session'), 'empty heading');
  assert.ok(SRC.includes('no appointment loaded from the clinic schedule'), 'no fake session honesty');
  assert.ok(SRC.includes('session timer') && SRC.includes('video room'), 'explicit no timer/room');
  assert.ok(SRC.includes("window._nav('schedule-v2')"), 'schedule link');
  assert.ok(SRC.includes("window._nav('patients-v2')"), 'patients link');
  assert.ok(SRC.includes("window._nav('clinician-inbox')"), 'inbox link');
});

test('Demo fixture gated by isDemoSession + banner wording', () => {
  assert.ok(SRC.includes('allowDemoFixture = isDemoSession()'), 'demo gate');
  assert.ok(SRC.includes('Demo session — not real patient data.'), 'demo banner text');
  assert.match(SRC, /_lsDemoVcSessionFixture|demo-vc-fixture/, 'demo fixture id');
});

test('No fake default session when API empty and not demo', () => {
  assert.ok(SRC.includes('_lsRenderEmptyVirtualCare'), 'empty-state renderer');
  const lsStart = SRC.indexOf('export async function pgLiveSession');
  const lsEnd = SRC.indexOf('\nfunction _lsInitials', lsStart);
  assert.ok(lsStart > 0 && lsEnd > lsStart, 'pgLiveSession block bounds');
  const pgLS = SRC.slice(lsStart, lsEnd);
  const idxApi = pgLS.indexOf('api.getCurrentSession');
  const idxEmpty = pgLS.indexOf('_lsRenderEmptyVirtualCare');
  const idxFixture = pgLS.indexOf('_lsDemoVcSessionFixture');
  assert.ok(idxApi > 0 && idxEmpty > idxApi, 'getCurrentSession before empty render');
  assert.ok(idxFixture > idxApi, 'demo fixture only after API attempt');
});

test('Clinician live-session path: no virtualCare* calls in pgLiveSession function body', () => {
  const lsStart = SRC.indexOf('export async function pgLiveSession');
  const lsEnd = SRC.indexOf('\nfunction _lsInitials', lsStart);
  assert.ok(lsStart > 0 && lsEnd > lsStart);
  const pgLS = SRC.slice(lsStart, lsEnd);
  assert.doesNotMatch(pgLS, /api\.virtualCare\w+/, 'no api.virtualCare* in pgLiveSession');
});

test('pgLiveSession file comment: patient virtual-care API boundary', () => {
  assert.ok(SRC.includes('virtualCareCreateSession'), 'CRUD names in comment');
  assert.ok(SRC.includes('patient auth'), 'role hint');
});

test('Route: live-session opens livesession tab', () => {
  const m = APP.match(/case 'live-session':\s*\{[^}]+/);
  assert.ok(m, 'live-session case');
  assert.ok(m[0].includes("_vcUnifiedDefaultTab = 'livesession'"), 'default tab livesession');
  assert.ok(m[0].includes('loadVirtualCare'), 'loads virtual care module');
});

test('Live Session workspace governance strings', () => {
  assert.ok(SRC.includes('decision support'), 'governance wording');
  assert.ok(SRC.includes('Clinical readiness checklist') || SRC.includes('Governance'), 'checklist / governance');
});
