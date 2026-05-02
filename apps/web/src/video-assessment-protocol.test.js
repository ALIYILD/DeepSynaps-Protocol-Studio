import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_ASSESSMENT_TASKS,
  createEmptySession,
  summarizeSession,
} from './video-assessment-protocol.js';

test('MVP task library has 16 ordered tasks', () => {
  assert.equal(VIDEO_ASSESSMENT_TASKS.length, 16);
  const orders = VIDEO_ASSESSMENT_TASKS.map((t) => t.task_order).sort((a, b) => a - b);
  assert.deepEqual(orders, orders.slice().sort((a, b) => a - b));
  for (let i = 0; i < orders.length; i++) assert.equal(orders[i], i + 1);
});

test('createEmptySession returns tasks with clinician_review null', () => {
  const s = createEmptySession({ id: 't1' });
  assert.equal(s.id, 't1');
  assert.equal(s.tasks.length, 16);
  assert.equal(s.tasks[0].clinician_review, null);
  assert.ok(s.future_ai_metrics_placeholder);
});

test('summarizeSession counts skipped and completed', () => {
  const s = createEmptySession();
  s.tasks[0].recording_status = 'accepted';
  s.tasks[1].recording_status = 'skipped';
  s.tasks[1].skip_reason = 'unsafe';
  s.tasks[1].unsafe_flag = true;
  const sum = summarizeSession(s);
  assert.equal(sum.tasks_completed, 1);
  assert.equal(sum.tasks_skipped, 1);
  assert.ok(sum.safety_task_ids.includes(s.tasks[1].task_id));
});
