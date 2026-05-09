// Tests for qeeg-timeline.js — Longitudinal qEEG Timeline
// Pins: empty-state, status colour/icon mapping, RCI formatting, confounders,
//       decision-support disclaimer, XSS escaping.

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderTimeline } from './qeeg-timeline.js';

describe('renderTimeline', () => {
  it('renders empty-state when events is null', () => {
    const html = renderTimeline(null);
    assert.ok(html.includes('No timeline events yet.'), 'expected empty-state message');
    assert.ok(html.includes('Timeline'), 'expected section header');
  });

  it('renders empty-state when events is an empty array', () => {
    const html = renderTimeline([]);
    assert.ok(html.includes('No timeline events yet.'), 'expected empty-state message');
  });

  it('includes the decision-support disclaimer when events are present', () => {
    const html = renderTimeline([{ date: '2024-01', title: 'Baseline', status: 'improved', summary: 'Good' }]);
    assert.ok(
      html.includes('decision-support information'),
      'expected the clinical decision-support disclaimer',
    );
    assert.ok(
      html.includes('clinician review'),
      'expected "clinician review" in disclaimer',
    );
  });

  it('renders the event title and date', () => {
    const html = renderTimeline([{ date: '2024-03-15', title: 'Session 3', status: 'unchanged', summary: 'Stable' }]);
    assert.ok(html.includes('Session 3'), 'expected event title');
    assert.ok(html.includes('2024-03-15'), 'expected event date');
  });

  it('maps "improved" status to green colour #22c55e and up-arrow icon', () => {
    const html = renderTimeline([{ date: '2024-01', title: 'T1', status: 'improved', summary: '' }]);
    assert.ok(html.includes('#22c55e'), '"improved" must use green colour');
    assert.ok(html.includes('↑'), '"improved" must include up-arrow icon');
  });

  it('maps "worsened" status to red colour #ef4444 and down-arrow icon', () => {
    const html = renderTimeline([{ date: '2024-01', title: 'T1', status: 'worsened', summary: '' }]);
    assert.ok(html.includes('#ef4444'), '"worsened" must use red colour');
    assert.ok(html.includes('↓'), '"worsened" must include down-arrow icon');
  });

  it('maps "unchanged" status to grey colour #6b7280 and right-arrow icon', () => {
    const html = renderTimeline([{ date: '2024-01', title: 'T1', status: 'unchanged', summary: '' }]);
    assert.ok(html.includes('#6b7280'), '"unchanged" must use grey colour');
    assert.ok(html.includes('→'), '"unchanged" must include right-arrow icon');
  });

  it('maps unknown status to amber colour #f59e0b and question-mark icon', () => {
    const html = renderTimeline([{ date: '2024-01', title: 'T1', status: 'pending', summary: '' }]);
    assert.ok(html.includes('#f59e0b'), 'unknown status must use amber colour');
    assert.ok(html.includes('?'), 'unknown status must include question-mark icon');
  });

  it('formats RCI value to 2 decimal places when provided', () => {
    const html = renderTimeline([{ date: '2024-01', title: 'T1', status: 'improved', summary: '', rci: 1.9999 }]);
    assert.ok(html.includes('RCI 2.00'), 'expected RCI formatted to 2 decimal places');
  });

  it('omits RCI section when rci is null', () => {
    const html = renderTimeline([{ date: '2024-01', title: 'T1', status: 'improved', summary: '', rci: null }]);
    assert.ok(!html.includes('RCI'), 'no RCI section when rci is null');
  });

  it('renders confounders when present', () => {
    const html = renderTimeline([{
      date: '2024-01',
      title: 'T1',
      status: 'improved',
      summary: '',
      confounders: ['medication change', 'sleep deprivation'],
    }]);
    assert.ok(html.includes('Confounders:'), 'expected "Confounders:" label');
    assert.ok(html.includes('medication change'), 'expected confounder text');
    assert.ok(html.includes('sleep deprivation'), 'expected second confounder');
  });

  it('escapes XSS in title, summary and confounders', () => {
    const html = renderTimeline([{
      date: '2024-01',
      title: '<script>alert(1)</script>',
      status: 'improved',
      summary: '<b>bold</b>',
      confounders: ['<evil>'],
    }]);
    assert.ok(!html.includes('<script>'), 'title must be HTML-escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'title must use HTML entity');
    assert.ok(!html.includes('<evil>'), 'confounders must be escaped');
  });
});
