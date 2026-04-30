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

// ── Doctor-polish 2026-04-30: chip-count truthfulness, queue sort by time,
//    search hint, chip aria-label, density first-paint persistence.

test('chip "today" count derives from todaysQueueEntries (single source of truth)', async () => {
  const src = await _readPgSrc();
  // Chip count = the right-panel queue length, by construction.
  assert.ok(/today\s*=\s*todaysQueueEntries\(\)\.length/.test(src),
    'today chip count must be derived from todaysQueueEntries()');
  // Predicate helpers exist and are used in both quickFilterCounts + applyQuickFilter.
  assert.ok(src.includes('function isTodayPatient(p)'), 'isTodayPatient helper must exist');
  assert.ok(src.includes('function hasAdverseEvent(p)'), 'hasAdverseEvent helper must exist');
  assert.ok(src.includes('items.filter(hasAdverseEvent)'),
    'adverse chip count must use hasAdverseEvent predicate');
  assert.ok(src.includes('items.filter(isTodayPatient)'),
    'queue + applyQuickFilter must use isTodayPatient predicate');
});

test("Today's Queue sorts by start time ascending, name as tiebreak", () => {
  // Re-declare the sort helper verbatim from pages-clinical-hubs.js so the
  // logic is unit-testable without a DOM.
  function _sortQueueByTime(rows) {
    return rows.slice().sort((a, b) => {
      const t = String(a.time || '').localeCompare(String(b.time || ''));
      if (t !== 0) return t;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }
  const sorted = _sortQueueByTime([
    { time:'15:45', name:'James Okonkwo' },
    { time:'09:00', name:'Aisha Rahman' },
    { time:'13:15', name:'Marcus Chen' },
    { time:'09:00', name:'Aaron Zheng' },     // same time as Aisha — alpha tiebreak
  ]);
  // Earliest time first.
  assert.ok(sorted[0].time <= sorted[1].time, 'first row time must be <= second row time');
  // Tiebreak by name: Aaron < Aisha at 09:00.
  assert.equal(sorted[0].name, 'Aaron Zheng');
  assert.equal(sorted[1].name, 'Aisha Rahman');
  // Last row is the latest scheduled session.
  assert.equal(sorted[sorted.length - 1].time, '15:45');
});

test('search input placeholder hints at the / shortcut and exposes aria-keyshortcuts', async () => {
  const src = await _readPgSrc();
  assert.ok(src.includes('placeholder="Search patients · / to focus"'),
    'search input placeholder must mention the / shortcut');
  assert.ok(/placeholder="Search patients[^"]*\//.test(src),
    'placeholder must contain a literal "/"');
  assert.ok(src.includes('aria-keyshortcuts="/"'),
    'search input must declare aria-keyshortcuts="/"');
});

test('quick-filter chips emit a non-empty aria-label that includes the count', async () => {
  const src = await _readPgSrc();
  // The aria-label is built per-chip from "<label>: <n> patient(s)".
  assert.ok(/const ariaLabel = ch\.label \+ ': ' \+ ch\.n \+ ' patient'/.test(src),
    'chip aria-label must concatenate label + count + "patient(s)"');
  assert.ok(/aria-label="' \+ esc\(ariaLabel\) \+ '"/.test(src),
    'chip must render aria-label attribute');
});

test('density default persists on first init when localStorage is null', async () => {
  const src = await _readPgSrc();
  assert.ok(/if \(localStorage\.getItem\('ds\.patients\.density'\) == null\)/.test(src),
    'init block must check for null localStorage value');
  assert.ok(/localStorage\.setItem\('ds\.patients\.density', 'compact'\)/.test(src),
    'init block must write "compact" as the first-paint default');
});

test('chip count and right-panel queue length use the SAME source — todaysQueueEntries', async () => {
  const src = await _readPgSrc();
  // Find the queue HTML builder — it must call todaysQueueEntries().
  assert.ok(/function todaysQueueHtml\([^)]*\) \{[\s\S]*?todaysQueueEntries\(\)/.test(src),
    "todaysQueueHtml must call todaysQueueEntries()");
  // The count chip must call the same function (asserted above).
  // Together this guarantees chip count === queue length.
});

// ── One-click Analytics tab (2026-04-30): the tab bar must not trigger a
//    route hop. Each tab button calls window._phSwitchTab(id) which sets
//    window._patientHubTab + history.replaceState (?tab=) + re-renders the
//    body in place. URL pathname stays put; ?page= param is unchanged.

test('Analytics tab button has the spec testid and data-tab attribute', async () => {
  const src = await _readPgSrc();
  assert.ok(src.includes('data-testid="ds-patients-tab-analytics"'),
    'Analytics tab must expose data-testid="ds-patients-tab-analytics"');
  // tabBar() emits data-tab attributes for all four tabs so QA / e2e can target them.
  assert.ok(src.includes(" data-tab=\"' + id + '\""),
    'tabBar() must emit a data-tab attribute per button');
});

test('tab bar uses _phSwitchTab (in-place) and NOT _nav("patients-hub")', async () => {
  const src = await _readPgSrc();
  // The new in-place switcher must exist and be wired on every tab button.
  assert.ok(src.includes("window._phSwitchTab = function _phSwitchTab"),
    "_phSwitchTab handler must be defined on window");
  // The handler is wired via string concat: `onclick="window._phSwitchTab('` + id + `')"`.
  assert.ok(src.includes("window._phSwitchTab(\\'"),
    'tab bar onclick must call window._phSwitchTab — not the legacy _nav route hop');
  // Sanity-check: the old in-tabBar route-hop pattern is GONE. The tab bar's
  // own onclick handlers must not call _nav('patients-hub') (alert/report
  // list "View" buttons may still use that pattern — they're out of scope).
  // We grep for the specific old pattern that was inside tabBar() before:
  //   `window._patientHubTab='` + id + `';window._nav('patients-hub')`.
  assert.ok(!/window\._patientHubTab=\\'\s*\+\s*id\s*\+\s*\\'\s*;\s*window\._nav/.test(src),
    "tabBar() must not emit `window._patientHubTab='+id+';window._nav(...)` anymore");
});

test('switching tabs uses history.replaceState (no route hop, no pushState)', async () => {
  const src = await _readPgSrc();
  // _phSwitchTab must call replaceState — that's how the URL gets ?tab=…
  // updated without a history entry or a route hop.
  assert.ok(/_phSwitchTab[\s\S]{0,800}history\.replaceState/.test(src),
    '_phSwitchTab must use history.replaceState to update the URL in place');
  // And it must NOT pushState, which would create a navigation entry.
  const switcherBlock = src.match(/window\._phSwitchTab = function _phSwitchTab[\s\S]*?^\s\s\};/m);
  if (switcherBlock) {
    assert.ok(!/history\.pushState/.test(switcherBlock[0]),
      '_phSwitchTab must not use pushState');
  }
});

test('clicking Analytics does NOT change the ?page= URL param (in-place tab)', () => {
  // Headless simulation of the click handler: replicate the reduced version
  // of _phSwitchTab that mutates location/history. The contract under test:
  //  • ?page= is preserved (no route hop)
  //  • ?tab= is set to the clicked tab id
  //  • history.pushState is NEVER called (no new history entry)
  const TAB_META = { patients:1, analytics:1, alerts:1, reports:1 };
  let pushed = 0, replaced = 0, lastUrl = null;
  const fakeHistory = {
    state: { page: 'patients-v2' },
    pushState() { pushed++; },
    replaceState(_state, _title, url) { replaced++; lastUrl = url; },
  };
  const fakeLocation = { href: 'https://example.com/?page=patients-v2' };
  function _phSwitchTab(id) {
    if (!Object.prototype.hasOwnProperty.call(TAB_META, id)) return;
    const u = new URL(fakeLocation.href);
    u.searchParams.set('tab', id);
    fakeHistory.replaceState({ ...(fakeHistory.state || {}), tab: id }, '', u.toString());
  }
  _phSwitchTab('analytics');

  const after = new URL(lastUrl);
  assert.equal(after.searchParams.get('page'), 'patients-v2',
    '?page= must remain "patients-v2" after Analytics click — no route hop');
  assert.equal(after.searchParams.get('tab'), 'analytics',
    '?tab= must be set to "analytics"');
  assert.equal(pushed, 0, 'pushState must NEVER be called by tab switching');
  assert.equal(replaced, 1, 'replaceState must be called exactly once');
});

test('Analytics KPI grid renders with data-testid=ds-patients-analytics-kpis', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, 'pages-patient-analytics.js'), 'utf8');
  assert.ok(src.includes('data-testid="ds-patients-analytics-kpis"'),
    'cohort KPI strip must expose data-testid="ds-patients-analytics-kpis"');
  // KPI labels must still be present (no content lost in the wiring fix).
  for (const label of ['Mean PHQ-9', 'Response rate', 'Avg adherence', 'Active patients']) {
    assert.ok(src.includes(label), 'KPI label must still render: ' + label);
  }
});

test('Analytics module is cached on window for synchronous re-render (no flash)', async () => {
  const src = await _readPgSrc();
  assert.ok(src.includes('window._phAnalyticsModule'),
    'analytics module must be cached on window._phAnalyticsModule');
  // Pre-fetch happens during initial mount, in parallel with the patient list.
  assert.ok(src.includes("import('./pages-patient-analytics.js')"),
    'module must be lazy-imported and cached');
  assert.ok(src.includes('_phAnalyticsModulePending'),
    'pre-fetch must track an in-flight promise to avoid duplicate imports');
});
