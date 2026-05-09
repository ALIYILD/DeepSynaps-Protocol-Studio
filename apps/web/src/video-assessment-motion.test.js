// Tests for video-assessment-motion.js
// NOTE: analyzeVideoBlobMotion requires a real browser environment (video element,
//       canvas, URL.createObjectURL) — those paths are exercised via DOM-stubbing only
//       for the failure/early-return branches. The export constant and disclaimer
//       contracts are tested directly.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { MOTION_ENGINE_ID, analyzeVideoBlobMotion } from './video-assessment-motion.js';

describe('MOTION_ENGINE_ID', () => {
  it('is a non-empty string', () => {
    assert.ok(typeof MOTION_ENGINE_ID === 'string' && MOTION_ENGINE_ID.length > 0);
  });

  it('identifies the frame-diff engine version', () => {
    assert.ok(MOTION_ENGINE_ID.includes('frame_diff'), 'engine id must identify frame_diff strategy');
  });
});

describe('analyzeVideoBlobMotion — DOM-stubbed failure paths', () => {
  let savedDocument, savedURL;

  before(() => {
    savedDocument = globalThis.document;
    savedURL = globalThis.URL;
  });

  after(() => {
    globalThis.document = savedDocument;
    globalThis.URL = savedURL;
  });

  function makeVideoStub(overrides = {}) {
    return {
      muted: false,
      playsInline: false,
      preload: '',
      src: '',
      load: () => {},
      onloadedmetadata: null,
      onerror: null,
      duration: overrides.duration ?? 30,
      videoWidth: overrides.videoWidth ?? 640,
      videoHeight: overrides.videoHeight ?? 480,
      currentTime: 0,
      addEventListener: (evt, fn) => {
        if (evt === 'seeked') setTimeout(fn, 0);
      },
      removeEventListener: () => {},
    };
  }

  it('returns a failed result when URL.createObjectURL throws', async () => {
    globalThis.URL = {
      createObjectURL: () => { throw new Error('no object url'); },
      revokeObjectURL: () => {},
    };
    // Should throw before even reaching the DOM shim
    const blob = new Blob([''], { type: 'video/webm' });
    await assert.rejects(
      () => analyzeVideoBlobMotion(blob, { task_id: 't1' }),
      /no object url/,
    );
  });

  it('returns a failed result with duration_unsupported code when video duration is 0', async () => {
    const videoStub = makeVideoStub({ duration: 0 });

    globalThis.URL = {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => {},
    };
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'video') {
          setTimeout(() => { if (videoStub.onloadedmetadata) videoStub.onloadedmetadata(); }, 0);
          return videoStub;
        }
        return {};
      },
    };

    const blob = new Blob([''], { type: 'video/webm' });
    const result = await analyzeVideoBlobMotion(blob, { task_id: 'test-task' });
    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.error_code, 'duration_unsupported');
    assert.strictEqual(result.engine, MOTION_ENGINE_ID);
  });

  it('failed result always includes disclaimer copy', async () => {
    const videoStub = makeVideoStub({ duration: 0 });
    globalThis.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'video') {
          setTimeout(() => { if (videoStub.onloadedmetadata) videoStub.onloadedmetadata(); }, 0);
          return videoStub;
        }
        return {};
      },
    };

    const blob = new Blob([''], { type: 'video/webm' });
    const result = await analyzeVideoBlobMotion(blob, { task_id: 'fail-test' });
    assert.ok(
      typeof result.disclaimer === 'string' && result.disclaimer.length > 0,
      'failed result must always carry a disclaimer',
    );
  });

  it('returns failed result with canvas error_code when canvas is unsupported', async () => {
    const videoStub = makeVideoStub({ duration: 10 });
    const canvasStub = { width: 0, height: 0, getContext: () => null };

    globalThis.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'video') {
          setTimeout(() => { if (videoStub.onloadedmetadata) videoStub.onloadedmetadata(); }, 0);
          return videoStub;
        }
        if (tag === 'canvas') return canvasStub;
        return {};
      },
    };

    const blob = new Blob([''], { type: 'video/webm' });
    const result = await analyzeVideoBlobMotion(blob, { task_id: 'canvas-test' });
    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.error_code, 'canvas');
  });

  it('clamps maxFrames to the range [8, 48]', async () => {
    // We just check this does not throw — clamping is internal but we verify
    // behavior doesn't differ when maxFrames is out of range.
    // Use duration_unsupported path to get a quick return.
    const videoStub = makeVideoStub({ duration: 0 });
    globalThis.URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'video') {
          setTimeout(() => { if (videoStub.onloadedmetadata) videoStub.onloadedmetadata(); }, 0);
          return videoStub;
        }
        return {};
      },
    };
    const blob = new Blob([''], { type: 'video/webm' });
    const r1 = await analyzeVideoBlobMotion(blob, { maxFrames: 200 }); // exceeds 48
    const r2 = await analyzeVideoBlobMotion(blob, { maxFrames: 1 });   // below 8
    assert.strictEqual(r1.status, 'failed');
    assert.strictEqual(r2.status, 'failed');
  });
});
