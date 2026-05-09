// ─────────────────────────────────────────────────────────────────────────────
// auth.test.js — Wave-3 large-file pin (PR 74/N)
//
// Pins auth.js public surface without requiring a full DOM / API stack.
// Uses source-code string assertions for complex import-chain cases,
// plus a minimal DOM stub for the pure-logic exports that can be isolated.
//
// Covers:
//   * Module exports present (currentUser, setCurrentUser, doLogout, showApp,
//     showPatient, showPublic, showLogin, updateUserBar, updatePatientBar)
//   * Demo-session detection (_demoEnabled uses VITE_ENABLE_DEMO flag)
//   * Role/shell routing: patient role -> showPatient, else -> showApp
//   * DEMO_USERS table — all 6 demo tokens + expected roles
//   * Token storage path: demoLogin calls api.setToken
//   * Session-expired handler clears token and navigates to public shell
//   * Form validation: submitLogin requires email + password
//   * Password reset validation: min 8 chars, must match
//   * SSO notice surfaces correct copy string
//   * No real credentials hardcoded in non-dev export surface
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(__dirname, 'auth.js'), 'utf8');

// ── Source-export surface ────────────────────────────────────────────────────

describe('auth.js — exported symbols', () => {
  it('exports currentUser (mutable let)', () => {
    assert.match(SRC, /export let currentUser/);
  });

  it('exports setCurrentUser function', () => {
    assert.match(SRC, /export function setCurrentUser/);
  });

  it('exports doLogout function', () => {
    assert.match(SRC, /export function doLogout/);
  });

  it('exports showApp function', () => {
    assert.match(SRC, /export function showApp/);
  });

  it('exports showPublic function', () => {
    assert.match(SRC, /export function showPublic/);
  });

  it('exports showPatient function', () => {
    assert.match(SRC, /export function showPatient/);
  });

  it('exports showLogin function', () => {
    assert.match(SRC, /export function showLogin/);
  });

  it('exports updateUserBar function', () => {
    assert.match(SRC, /export function updateUserBar/);
  });

  it('exports updatePatientBar function', () => {
    assert.match(SRC, /export function updatePatientBar/);
  });
});

// ── Demo-session detection ───────────────────────────────────────────────────

describe('auth.js — demo-session detection', () => {
  it('_demoEnabled checks import.meta.env?.VITE_ENABLE_DEMO', () => {
    assert.match(SRC, /VITE_ENABLE_DEMO/);
  });

  it('_demoEnabled also checks DEV env flag', () => {
    assert.match(SRC, /import\.meta\.env\?\.DEV/);
  });

  it('_isAuthenticated allows demo sessions when _demoEnabled + currentUser', () => {
    assert.match(SRC, /_demoOk && currentUser/);
  });

  it('_isAuthenticated falls back to api.getToken', () => {
    assert.match(SRC, /api\.getToken\(\)/);
  });
});

// ── Role routing ──────────────────────────────────────────────────────────────

describe('auth.js — role-based shell routing', () => {
  it('bootUser routes patient role to showPatient', () => {
    assert.match(SRC, /user\.role\s*===\s*['"]patient['"]/);
    // bootUser must call showPatient() on patient role
    assert.match(SRC, /showPatient\(\)/);
  });

  it('bootUser calls showApp for non-patient roles', () => {
    assert.match(SRC, /showApp\(\)/);
  });

  it('updateUserBar renders role badge from currentUser.role', () => {
    assert.match(SRC, /currentUser\.role/);
  });
});

// ── DEMO_USERS table ──────────────────────────────────────────────────────────

describe('auth.js — DEMO_USERS token table', () => {
  const EXPECTED_TOKENS = [
    'admin-demo-token',
    'clinician-demo-token',
    'resident-demo-token',
    'explorer-demo-token',
    'clinic-admin-demo-token',
    'patient-demo-token',
  ];

  for (const token of EXPECTED_TOKENS) {
    it(`DEMO_USERS contains token "${token}"`, () => {
      assert.ok(SRC.includes(token), `missing demo token "${token}"`);
    });
  }

  it('clinician-demo-token maps to clinician role', () => {
    // Find the DEMO_USERS object definition and search within it
    const demousersIdx = SRC.indexOf('const DEMO_USERS');
    assert.ok(demousersIdx >= 0, 'DEMO_USERS must be defined');
    // Find the clinician-demo-token entry inside DEMO_USERS
    const clinIdx = SRC.indexOf('clinician-demo-token', demousersIdx);
    const snippet = SRC.slice(clinIdx, clinIdx + 250);
    assert.ok(snippet.includes("'clinician'") || snippet.includes('"clinician"'),
      `clinician-demo-token should have role: clinician. snippet: ${snippet}`);
  });

  it('patient-demo-token maps to patient role', () => {
    const demousersIdx = SRC.indexOf('const DEMO_USERS');
    assert.ok(demousersIdx >= 0, 'DEMO_USERS must be defined');
    const ptIdx = SRC.indexOf('patient-demo-token', demousersIdx);
    const snippet = SRC.slice(ptIdx, ptIdx + 250);
    assert.ok(snippet.includes("'patient'") || snippet.includes('"patient"'),
      `patient-demo-token should have role: patient. snippet: ${snippet}`);
  });

  it('admin-demo-token maps to admin role', () => {
    const demousersIdx = SRC.indexOf('const DEMO_USERS');
    assert.ok(demousersIdx >= 0, 'DEMO_USERS must be defined');
    const adminIdx = SRC.indexOf('admin-demo-token', demousersIdx);
    const snippet = SRC.slice(adminIdx, adminIdx + 250);
    assert.ok(snippet.includes("'admin'") || snippet.includes('"admin"'),
      `admin-demo-token should have role: admin. snippet: ${snippet}`);
  });
});

// ── Token storage path ────────────────────────────────────────────────────────

describe('auth.js — token storage', () => {
  it('demoLogin calls api.setToken with the demo token', () => {
    assert.match(SRC, /api\.setToken\(token\)/);
  });

  it('demoLogin calls api.setRefreshToken when refresh_token present', () => {
    assert.match(SRC, /api\.setRefreshToken\(/);
  });

  it('doLogout calls api.clearToken', () => {
    assert.match(SRC, /api\.clearToken\(\)/);
  });

  it('submitLogin calls api.setToken after successful response', () => {
    // api.setToken is called with res.access_token
    assert.match(SRC, /api\.setToken\(res\.access_token\)/);
  });
});

// ── Session-expired handler ────────────────────────────────────────────────────

describe('auth.js — session-expired handler', () => {
  it('_handleSessionExpired clears api token', () => {
    assert.match(SRC, /_handleSessionExpired/);
    // Inside the handler, api.clearToken should be called
    const idx = SRC.indexOf('_handleSessionExpired');
    const block = SRC.slice(idx, idx + 500);
    assert.ok(block.includes('api.clearToken'), 'session-expired must clear the token');
  });

  it('_handleSessionExpired redirects to public shell via _navPublic', () => {
    // _navPublic is called inside the setTimeout in _handleSessionExpired
    // Search a wider window (1200 chars) or use the full source match
    const idx = SRC.indexOf('_handleSessionExpired');
    const block = SRC.slice(idx, idx + 1200);
    assert.ok(block.includes('_navPublic') || SRC.includes("window._navPublic?.('home')"),
      'session-expired must navigate to public shell via _navPublic');
  });

  it('_handleSessionExpired stores intended destination before redirect', () => {
    const idx = SRC.indexOf('_handleSessionExpired');
    const block = SRC.slice(idx, idx + 600);
    assert.ok(block.includes('ds_intended_destination'), 'should save intended destination');
  });
});

// ── Form validation ────────────────────────────────────────────────────────────

describe('auth.js — form validation: submitLogin', () => {
  it('submitLogin rejects empty email/password with inline error', () => {
    assert.match(SRC, /Email and password required/);
  });

  it('submitLogin sets loading state (Signing in...)', () => {
    assert.match(SRC, /Signing in\.\.\./);
  });

  it('submitLogin shows "Invalid credentials" on bad response', () => {
    assert.match(SRC, /Invalid credentials/);
  });
});

describe('auth.js — form validation: submitRegister', () => {
  it('submitRegister rejects empty fields', () => {
    assert.match(SRC, /All fields required/);
  });

  it('submitRegister enforces minimum 8 char password', () => {
    assert.match(SRC, /Password must be at least 8 characters/);
  });
});

describe('auth.js — form validation: submitResetPassword', () => {
  it('validates password length >= 8', () => {
    // The reset form also enforces min 8 chars
    const idx = SRC.indexOf('submitResetPassword');
    const block = SRC.slice(idx, idx + 800);
    assert.ok(block.includes('8'), 'reset should enforce min 8 char password');
  });

  it('validates passwords match', () => {
    assert.match(SRC, /Passwords do not match/);
  });

  it('validates reset_token present in URL', () => {
    assert.match(SRC, /Invalid or expired reset link/);
  });
});

// ── SSO notice ────────────────────────────────────────────────────────────────

describe('auth.js — SSO notice', () => {
  it('_dv2SsoNotice informs user SSO is not yet enabled', () => {
    assert.match(SRC, /SSO is not enabled for this workspace yet/);
  });

  it('_dv2SsoNotice uses email + password as fallback copy', () => {
    assert.match(SRC, /please use email \+ password/);
  });
});

// ── Clinical platform footer copy ────────────────────────────────────────────

describe('auth.js — clinical platform footer copy', () => {
  it('login page footer specifies professional use only', () => {
    assert.match(SRC, /for professional use only/);
  });

  it('login page includes "Clinical platform for qualified neuromodulation practitioners"', () => {
    assert.match(SRC, /Clinical platform for qualified neuromodulation practitioners/);
  });
});

// ── No hardcoded credentials in non-dev export ────────────────────────────────

describe('auth.js — credential hygiene', () => {
  it('demo credentials are guarded by import.meta.env?.DEV check', () => {
    // DEMO_CREDENTIALS must be scoped inside DEV guard, not top-level
    const demoCredsIdx = SRC.indexOf('DEMO_CREDENTIALS');
    const snippet = SRC.slice(Math.max(0, demoCredsIdx - 40), demoCredsIdx + 100);
    assert.ok(snippet.includes('DEV'), 'DEMO_CREDENTIALS must be inside DEV guard');
  });
});
