import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_PASSTHROUGH,
  DEMO_TOKEN_SUFFIX,
  isDemoSession,
  isDemoPassthroughPath,
} from './demo-session.js';

describe('DEMO_TOKEN_SUFFIX', () => {
  it('is the literal string -demo-token', () => {
    assert.strictEqual(DEMO_TOKEN_SUFFIX, '-demo-token');
  });
});

describe('DEMO_PASSTHROUGH regex', () => {
  it('matches /api/v1/auth/demo-login', () => {
    assert.ok(DEMO_PASSTHROUGH.test('/api/v1/auth/demo-login'));
  });

  it('matches /api/v1/auth/refresh', () => {
    assert.ok(DEMO_PASSTHROUGH.test('/api/v1/auth/refresh'));
  });

  it('matches /api/v1/auth/me', () => {
    assert.ok(DEMO_PASSTHROUGH.test('/api/v1/auth/me'));
  });

  it('matches /api/v1/auth/reset-password', () => {
    assert.ok(DEMO_PASSTHROUGH.test('/api/v1/auth/reset-password'));
  });

  it('does NOT match /api/v1/patients', () => {
    assert.ok(!DEMO_PASSTHROUGH.test('/api/v1/patients'));
  });

  it('does NOT match /api/v1/auth/unknown-endpoint', () => {
    assert.ok(!DEMO_PASSTHROUGH.test('/api/v1/auth/unknown-endpoint'));
  });
});

describe('isDemoPassthroughPath', () => {
  it('returns true for demo-login path', () => {
    assert.strictEqual(isDemoPassthroughPath('/api/v1/auth/demo-login'), true);
  });

  it('returns true for /api/v1/auth/me', () => {
    assert.strictEqual(isDemoPassthroughPath('/api/v1/auth/me'), true);
  });

  it('returns false for non-auth path', () => {
    assert.strictEqual(isDemoPassthroughPath('/api/v1/courses'), false);
  });

  it('returns false for empty string', () => {
    assert.strictEqual(isDemoPassthroughPath(''), false);
  });

  it('returns false for non-string input', () => {
    assert.strictEqual(isDemoPassthroughPath(null), false);
    assert.strictEqual(isDemoPassthroughPath(undefined), false);
    assert.strictEqual(isDemoPassthroughPath(42), false);
  });
});

describe('isDemoSession', () => {
  it('returns false when flag is off regardless of token', () => {
    const result = isDemoSession({ token: 'abc-demo-token', env: { DEV: false, VITE_ENABLE_DEMO: '0' } });
    assert.strictEqual(result, false);
  });

  it('returns false when flag is on but token does not end with -demo-token', () => {
    const result = isDemoSession({ token: 'real-jwt-xyz', env: { DEV: true } });
    assert.strictEqual(result, false);
  });

  it('returns true when DEV=true and token ends with -demo-token', () => {
    const result = isDemoSession({ token: 'clinician-demo-token', env: { DEV: true } });
    assert.strictEqual(result, true);
  });

  it('returns true when VITE_ENABLE_DEMO=1 and token ends with -demo-token', () => {
    const result = isDemoSession({ token: 'patient-demo-token', env: { VITE_ENABLE_DEMO: '1' } });
    assert.strictEqual(result, true);
  });

  it('returns false when token is null even with flag on', () => {
    const result = isDemoSession({ token: null, env: { DEV: true } });
    assert.strictEqual(result, false);
  });

  it('returns false when token is empty string with flag on', () => {
    const result = isDemoSession({ token: '', env: { DEV: true } });
    assert.strictEqual(result, false);
  });
});
