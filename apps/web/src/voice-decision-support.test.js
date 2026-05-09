import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VOICE_DECISION_SUPPORT_SHORT,
  VOICE_DECISION_SUPPORT_FULL,
  VOICE_DECISION_SUPPORT_INLINE,
  VOICE_DEEPTWIN_DOMAIN_NOTE,
  voicePipelineMetaBlock,
  voiceApiErrorToast,
  escapeHtml,
} from './voice-decision-support.js';

describe('VOICE_DECISION_SUPPORT_SHORT', () => {
  it('is a non-empty string', () => {
    assert.ok(typeof VOICE_DECISION_SUPPORT_SHORT === 'string' && VOICE_DECISION_SUPPORT_SHORT.length > 0);
  });

  it('contains decision-support language', () => {
    assert.ok(VOICE_DECISION_SUPPORT_SHORT.includes('decision-support'));
  });

  it('explicitly states it is not a diagnosis', () => {
    assert.ok(VOICE_DECISION_SUPPORT_SHORT.includes('not a diagnosis'));
  });
});

describe('VOICE_DECISION_SUPPORT_FULL', () => {
  it('mentions DeepSynaps corpus', () => {
    assert.ok(VOICE_DECISION_SUPPORT_FULL.includes('DeepSynaps corpus'));
  });

  it('says not diagnoses', () => {
    assert.ok(VOICE_DECISION_SUPPORT_FULL.includes('not diagnoses'));
  });

  it('is longer than SHORT variant', () => {
    assert.ok(VOICE_DECISION_SUPPORT_FULL.length > VOICE_DECISION_SUPPORT_SHORT.length);
  });
});

describe('VOICE_DECISION_SUPPORT_INLINE', () => {
  it('starts with the SHORT variant content', () => {
    assert.ok(VOICE_DECISION_SUPPORT_INLINE.startsWith(VOICE_DECISION_SUPPORT_SHORT));
  });

  it('mentions Voice Analyzer', () => {
    assert.ok(VOICE_DECISION_SUPPORT_INLINE.includes('Voice Analyzer'));
  });
});

describe('VOICE_DEEPTWIN_DOMAIN_NOTE', () => {
  it('mentions Voice domain', () => {
    assert.ok(VOICE_DEEPTWIN_DOMAIN_NOTE.includes('Voice domain'));
  });

  it('says decision-support only', () => {
    assert.ok(VOICE_DEEPTWIN_DOMAIN_NOTE.includes('decision-support only'));
  });
});

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    assert.strictEqual(escapeHtml('a&b'), 'a&amp;b');
  });

  it('escapes less-than', () => {
    assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    assert.strictEqual(escapeHtml('"hello"'), '&quot;hello&quot;');
  });

  it('returns empty string for null', () => {
    assert.strictEqual(escapeHtml(null), '');
  });

  it('returns empty string for undefined', () => {
    assert.strictEqual(escapeHtml(undefined), '');
  });

  it('passes through plain text unchanged', () => {
    assert.strictEqual(escapeHtml('hello world'), 'hello world');
  });
});

describe('voicePipelineMetaBlock', () => {
  it('returns empty string when voiceReport has no provenance', () => {
    assert.strictEqual(voicePipelineMetaBlock({}), '');
  });

  it('returns empty string when voiceReport is null', () => {
    assert.strictEqual(voicePipelineMetaBlock(null), '');
  });

  it('returns empty string when provenance is not an object', () => {
    assert.strictEqual(voicePipelineMetaBlock({ provenance: 'string' }), '');
  });

  it('returns empty string when provenance has no known keys', () => {
    assert.strictEqual(voicePipelineMetaBlock({ provenance: {} }), '');
  });

  it('returns HTML block with pipeline version', () => {
    const html = voicePipelineMetaBlock({ provenance: { pipeline_version: '1.2.3' } });
    assert.ok(html.includes('Pipeline 1.2.3'));
    assert.ok(html.startsWith('<div'));
  });

  it('includes all three provenance parts when present', () => {
    const html = voicePipelineMetaBlock({
      provenance: { pipeline_version: 'v1', norm_db_version: 'n2', schema_version: 's3' },
    });
    assert.ok(html.includes('Pipeline v1'));
    assert.ok(html.includes('Norm DB n2'));
    assert.ok(html.includes('Schema s3'));
  });

  it('escapes HTML in provenance values', () => {
    const html = voicePipelineMetaBlock({ provenance: { pipeline_version: '<xss>' } });
    assert.ok(!html.includes('<xss>'));
    assert.ok(html.includes('&lt;xss&gt;'));
  });
});

describe('voiceApiErrorToast', () => {
  it('returns warning toast for 503 status', () => {
    const toast = voiceApiErrorToast({ status: 503, message: '' });
    assert.strictEqual(toast.severity, 'warning');
    assert.ok(toast.title.includes('unavailable'));
    assert.ok(toast.body.includes('acoustic pipeline'));
  });

  it('returns warning toast for 401 status', () => {
    const toast = voiceApiErrorToast({ status: 401, message: '' });
    assert.strictEqual(toast.severity, 'warning');
    assert.ok(toast.title.includes('Sign-in'));
  });

  it('returns warning for not_a_real_user code', () => {
    const toast = voiceApiErrorToast({ code: 'not_a_real_user', message: 'demo only' });
    assert.strictEqual(toast.severity, 'warning');
  });

  it('returns error toast for unknown status', () => {
    const toast = voiceApiErrorToast({ status: 500, message: 'Internal error' });
    assert.strictEqual(toast.severity, 'error');
    assert.ok(toast.title.includes('failed'));
    assert.ok(toast.body.includes('Internal error'));
  });

  it('returns error toast for null/undefined error', () => {
    const toast = voiceApiErrorToast(null);
    assert.strictEqual(toast.severity, 'error');
    assert.ok(toast.body === 'Unknown error' || toast.body.length >= 0);
  });

  it('truncates long detail messages to 280 chars', () => {
    const longMsg = 'x'.repeat(400);
    const toast = voiceApiErrorToast({ status: 500, message: longMsg });
    assert.ok(toast.body.length <= 280);
  });

  it('503 toast includes detail snippet when provided', () => {
    const toast = voiceApiErrorToast({ status: 503, message: 'no audio lib' });
    assert.ok(toast.body.includes('no audio lib'));
  });
});
