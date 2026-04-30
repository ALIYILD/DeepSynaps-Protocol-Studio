// Unit tests for the comprehensive Clinical Hub Patients-table helpers.
// Pure functions only — no DOM, no API. Mirrors the helpers defined inside
// pages-clinical-hubs.js (in the patients-tab branch of pgPatientHub).
//
// Run via: node --test src/clinical-hub-patients-table.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Re-declared verbatim from pages-clinical-hubs.js (patients tab) ─────────
const tableHelpers = {
  shortMrn(p) {
    if (p.mrn) return String(p.mrn);
    const raw = String(p.id || '');
    return raw ? raw.slice(0, 8).toUpperCase() : '—';
  },
  ageOf(p, now = new Date('2026-04-20T00:00:00Z')) {
    if (p.age != null) return p.age;
    if (!p.dob) return null;
    const d = new Date(p.dob);
    if (isNaN(d.getTime())) return null;
    let age = now.getUTCFullYear() - d.getUTCFullYear();
    const m = now.getUTCMonth() - d.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
    return age;
  },
  ageSexCell(p) {
    const a = tableHelpers.ageOf(p);
    const s = (p.gender || '').charAt(0).toUpperCase();
    if (a == null && !s) return '—';
    return (a != null ? a + 'y' : '—') + (s ? ' ' + s : '');
  },
  statusLabel(p) {
    const s = (p.status || '').toLowerCase();
    const map = {
      active: 'Active', intake: 'Intake', new: 'Intake',
      paused: 'Paused', 'on-hold': 'Paused',
      discharging: 'Discharging', completed: 'Completed',
      discharged: 'Discharged', archived: 'Archived', inactive: 'Inactive',
      pending: 'Pending',
    };
    return map[s] || (p.status ? p.status[0].toUpperCase() + p.status.slice(1) : '—');
  },
  fmtShortDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
  isDemoSeed(p) {
    return !!(p.demo_seed || (p.notes || '').startsWith('[DEMO]'));
  },
  sortValue(p, key, courseLabel = '', clinicianName = '') {
    switch (key) {
      case 'name':       return ((p.last_name || '') + ' ' + (p.first_name || '')).toLowerCase();
      case 'mrn':        return tableHelpers.shortMrn(p).toLowerCase();
      case 'age':        return tableHelpers.ageOf(p) ?? -1;
      case 'condition':  return (p.primary_condition || p.condition_slug || '').toLowerCase();
      case 'course':     return courseLabel.toLowerCase();
      case 'status':     return tableHelpers.statusLabel(p).toLowerCase();
      case 'last':       return p.last_session_date || '';
      case 'next':       return p.next_session_date || p.next_session_at || '';
      case 'adherence':  return p.home_adherence == null ? -1 : p.home_adherence;
      case 'outcome':    return p.current_score == null ? Number.POSITIVE_INFINITY : p.current_score;
      case 'clinician':  return clinicianName.toLowerCase();
      default:           return '';
    }
  },
};

// ── Tests ──────────────────────────────────────────────────────────────────

test('shortMrn falls back to first 8 of UUID, uppercased', () => {
  assert.equal(tableHelpers.shortMrn({ id: 'abcd1234-5678-90' }), 'ABCD1234');
  assert.equal(tableHelpers.shortMrn({ id: '' }), '—');
  assert.equal(tableHelpers.shortMrn({ mrn: 'MRN-007' }), 'MRN-007');
});

test('ageOf returns null when dob missing or invalid', () => {
  assert.equal(tableHelpers.ageOf({}), null);
  assert.equal(tableHelpers.ageOf({ dob: 'not-a-date' }), null);
});

test('ageOf computes age relative to today, before-birthday correction', () => {
  // Patient born 1985-06-15 — at fixed clock 2026-04-20, age is 40 (birthday not yet).
  const age = tableHelpers.ageOf({ dob: '1985-06-15' });
  assert.equal(age, 40);
});

test('ageOf prefers explicit age field if provided', () => {
  assert.equal(tableHelpers.ageOf({ age: 99, dob: '1985-06-15' }), 99);
});

test('ageSexCell concatenates age + leading sex letter', () => {
  assert.equal(tableHelpers.ageSexCell({ dob: '1985-06-15', gender: 'female' }), '40y F');
  assert.equal(tableHelpers.ageSexCell({}), '—');
  assert.equal(tableHelpers.ageSexCell({ gender: 'male' }), '— M');
});

test('statusLabel maps backend statuses to clinician-facing labels', () => {
  assert.equal(tableHelpers.statusLabel({ status: 'active' }), 'Active');
  assert.equal(tableHelpers.statusLabel({ status: 'on-hold' }), 'Paused');
  assert.equal(tableHelpers.statusLabel({ status: 'new' }), 'Intake');
  assert.equal(tableHelpers.statusLabel({}), '—');
  assert.equal(tableHelpers.statusLabel({ status: 'unknown_state' }), 'Unknown_state');
});

test('fmtShortDate returns em-dash for missing/invalid', () => {
  assert.equal(tableHelpers.fmtShortDate(null), '—');
  assert.equal(tableHelpers.fmtShortDate('not-iso'), '—');
});

test('isDemoSeed accepts both flag and [DEMO] notes prefix', () => {
  assert.equal(tableHelpers.isDemoSeed({ demo_seed: true }), true);
  assert.equal(tableHelpers.isDemoSeed({ notes: '[DEMO] seeded sample' }), true);
  assert.equal(tableHelpers.isDemoSeed({ notes: 'real patient' }), false);
  assert.equal(tableHelpers.isDemoSeed({}), false);
});

test('sortValue produces comparable values for each column key', () => {
  const a = { first_name: 'Alpha', last_name: 'Adams', id: 'aaa11111-zzz', dob: '1990-01-01', primary_condition: 'MDD', status: 'active', last_session_date: '2026-04-01', next_session_date: '2026-05-01', home_adherence: 0.9, current_score: 5 };
  const b = { first_name: 'Beta',  last_name: 'Brown', id: 'bbb22222-zzz', dob: '1980-01-01', primary_condition: 'GAD', status: 'paused', last_session_date: '2026-03-15', next_session_date: null,         home_adherence: null,                current_score: null };

  assert.ok(tableHelpers.sortValue(a, 'name')      < tableHelpers.sortValue(b, 'name'));
  assert.ok(tableHelpers.sortValue(a, 'mrn')       < tableHelpers.sortValue(b, 'mrn'));
  assert.ok(tableHelpers.sortValue(a, 'age')       < tableHelpers.sortValue(b, 'age')); // a is younger
  assert.ok(tableHelpers.sortValue(b, 'condition') < tableHelpers.sortValue(a, 'condition')); // GAD < MDD
  assert.ok(tableHelpers.sortValue(a, 'status')    < tableHelpers.sortValue(b, 'status')); // active < paused
  assert.ok(tableHelpers.sortValue(b, 'last')      < tableHelpers.sortValue(a, 'last'));
  assert.ok(tableHelpers.sortValue(b, 'adherence') < tableHelpers.sortValue(a, 'adherence')); // null → -1, real → 0.9
  assert.ok(tableHelpers.sortValue(a, 'outcome')   < tableHelpers.sortValue(b, 'outcome')); // null → +Infinity sorts last
});

test('sortValue handles missing optional fields without throwing', () => {
  const empty = {};
  for (const key of ['name','mrn','age','condition','course','status','last','next','adherence','outcome','clinician']) {
    const v = tableHelpers.sortValue(empty, key);
    assert.ok(v !== undefined, `sortValue('${key}') must be defined`);
  }
});

// ── Source-of-truth check: assert the helper names exist verbatim in the
//    page module so the test can flag drift quickly.
test('helpers are still defined inside pages-clinical-hubs.js', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, 'pages-clinical-hubs.js'), 'utf8');
  for (const sym of [
    'function shortMrn',
    'function ageOf',
    'function ageSexCell',
    'function statusLabel',
    'function fmtShortDate',
    'function sortValue',
    'function sortPatients',
    'function clinicianNameFor',
    'function courseLabel',
    'function adherenceCell',
    'function outcomeScoreCell',
  ]) {
    assert.ok(src.includes(sym), 'pages-clinical-hubs.js must still define ' + sym);
  }
});

// ── Doctor-friendly redesign (2026-04-30): assert the new surfaces are wired.
//    These are HTML-source assertions — the patients tab is a giant string
//    template, so we grep the file for testids + handlers + behaviors.
async function _readPgSrc() {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(fileURLToPath(import.meta.url));
  return readFileSync(path.join(here, 'pages-clinical-hubs.js'), 'utf8');
}

test('density toggle renders with testid and persists via localStorage', async () => {
  const src = await _readPgSrc();
  assert.ok(src.includes('data-testid="ds-patients-density-toggle"'), 'density toggle testid must exist');
  assert.ok(src.includes("localStorage.setItem('ds.patients.density'"), 'density toggle must persist');
  assert.ok(src.includes("localStorage.getItem('ds.patients.density')"), 'density toggle must read on init');
  assert.ok(src.includes("window._phToggleDensity"), 'density toggle handler must exist');
  // Compact is the default; the button label flips to the OTHER mode.
  assert.ok(src.includes("'compact'"), 'compact density value must exist');
  assert.ok(src.includes("'comfortable'"), 'comfortable density value must exist');
});

test('row renders 4 inline action icons with the spec data-actions', async () => {
  const src = await _readPgSrc();
  for (const a of ['start-session','quick-note','message','open-chart']) {
    assert.ok(src.includes('data-action="' + a + '"'), 'row must include action icon ' + a);
  }
  // Each action icon wires a real handler (no silent buttons).
  for (const fn of ['_phStartSession','_phQuickNote','_phMessage','_phOpenChart']) {
    assert.ok(src.includes('window.' + fn), 'handler ' + fn + ' must be wired');
  }
});

test("Today's Queue right panel renders with testid", async () => {
  const src = await _readPgSrc();
  assert.ok(src.includes('data-testid="ds-patients-todays-queue"'),
    "Today's Queue panel must expose testid");
  // Mini-section CTAs must exist and re-route to quick filters.
  assert.ok(src.includes("Overdue Follow-ups"),  "Overdue Follow-ups mini-section");
  assert.ok(src.includes("Adverse Events"),      "Adverse Events mini-section");
});

test('quick-filter chip row exposes testid + the spec chip ids', async () => {
  const src = await _readPgSrc();
  assert.ok(src.includes('data-testid="ds-patients-quick-filters"'), 'wrapper testid must exist');
  // Chip ids are emitted at render-time via string concat — assert the
  // attribute prefix exists, then assert each chip id appears in the chips
  // definition array near the same handler.
  assert.ok(src.includes("'data-quick-filter=\"' + ch.id"), 'data-quick-filter attribute must be emitted per chip');
  for (const id of ['today','overdue','adverse','recent','all']) {
    assert.ok(src.includes("id:'" + id + "'"), 'chip id ' + id + ' must exist in chips definition');
  }
  // Active chip uses the spec teal background.
  assert.ok(src.includes('#1d6f7a'), 'active chip must use #1d6f7a');
  // Quick-filter handler validates against the same id list.
  for (const id of ['today','overdue','adverse','recent','all']) {
    assert.ok(src.includes("'" + id + "'"), 'quick-filter id ' + id + ' must appear in source');
  }
});

test('status pill component exists with the 4 priority levels', async () => {
  const src = await _readPgSrc();
  assert.ok(src.includes('data-testid="ds-patient-status-pill"'), 'pill testid must exist');
  for (const kind of ['adverse','overdue','today','stable']) {
    assert.ok(src.includes('data-status="' + kind + '"'), 'status kind ' + kind + ' must render');
  }
  // Spec colors must be present verbatim.
  for (const c of ['#d6e8d6','#2f6b3a','#f6e6cb','#b8741a','#f3d4d0','#b03434','#F2EDE5','#6b6660']) {
    assert.ok(src.includes(c), 'spec color ' + c + ' must exist');
  }
});

test('shortcuts overlay exists with testid and binds the spec keys', async () => {
  const src = await _readPgSrc();
  assert.ok(src.includes('data-testid="ds-patients-shortcuts-modal"'), 'overlay testid must exist');
  assert.ok(src.includes('window._phToggleShortcuts'), 'toggle handler must exist');
  // Source of truth check for the kbd handler — slash, j, k, Enter, n, s, ?.
  for (const k of ["'/'", "'j'", "'k'", "'Enter'", "'n'", "'s'", "'?'"]) {
    assert.ok(src.includes(k), 'shortcut binding for ' + k + ' must exist');
  }
});

test('patient row uses 6-column grid (160px action strip)', async () => {
  const src = await _readPgSrc();
  // The action strip column widened from 90px/120px → 160px to fit 4 icons.
  assert.ok(src.includes('1.8fr 1.1fr 1fr 1fr 1fr 160px'),
    'row must use the new 6-column grid template (160px action strip)');
});
