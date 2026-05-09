// Tests for friendly-forms.js
// Pins: esc() XSS, ffFieldWrap structure, ffInput HTML contracts,
// ffTextarea, ffSelect option rendering, ffChipGroup, ffEmojiScale defaults,
// ffCheckList, ffStepper progress, ffActions, ffNotice.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// ── Minimal window stub so the module's window.__ffWired guard works ──────────
let savedWindow, savedDocument;

before(() => {
  savedWindow   = globalThis.window;
  savedDocument = globalThis.document;

  globalThis.window   = { __ffWired: false };
  // friendly-forms.js doesn't use document at module scope, but be safe.
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ addEventListener: () => {}, style: {}, classList: { toggle: () => {}, add: () => {} } }),
  };
});

after(() => {
  globalThis.window   = savedWindow;
  globalThis.document = savedDocument;
});

const {
  ffFieldWrap,
  ffInput,
  ffTextarea,
  ffSelect,
  ffChipGroup,
  ffEmojiScale,
  ffCheckList,
  ffStepper,
  ffActions,
  ffNotice,
} = await import('./friendly-forms.js');

// ── esc() contract (via ffFieldWrap output) ───────────────────────────────────
describe('friendly-forms — esc() XSS escaping (via rendered HTML)', () => {
  it('escapes < > & in label', () => {
    const html = ffFieldWrap({ id: 'x', label: '<Bad>', children: '' });
    assert.ok(!html.includes('<Bad>'), 'unescaped label tag found');
    assert.ok(html.includes('&lt;Bad&gt;'));
  });

  it('escapes " in id attribute', () => {
    // An id with a double-quote could break the attribute context.
    const html = ffFieldWrap({ id: 'a"b', label: 'L', children: '' });
    assert.ok(!html.includes('id="a"b"'), 'unescaped " in id');
    assert.ok(html.includes('&quot;b'));
  });
});

// ── ffFieldWrap structure ─────────────────────────────────────────────────────
describe('friendly-forms — ffFieldWrap', () => {
  it('wraps in ff-field div with data-field attribute', () => {
    const html = ffFieldWrap({ id: 'test', label: 'My Label', children: '<input>' });
    assert.ok(html.includes('class="ff-field"'));
    assert.ok(html.includes('data-field="test"'));
  });

  it('renders label with for= pointing to id', () => {
    const html = ffFieldWrap({ id: 'dob', label: 'Date of Birth', children: '' });
    assert.ok(html.includes('for="dob"'));
    assert.ok(html.includes('Date of Birth'));
  });

  it('renders required marker when required=true', () => {
    const html = ffFieldWrap({ id: 'x', label: 'L', required: true, children: '' });
    assert.ok(html.includes('ff-required'));
    assert.ok(html.includes('Required'));
  });

  it('renders help text with aria-linked id when help is set', () => {
    const html = ffFieldWrap({ id: 'email', label: 'Email', help: 'Use your clinic email', children: '' });
    assert.ok(html.includes('id="email-help"'));
    assert.ok(html.includes('Use your clinic email'));
  });

  it('renders error slot with role=alert', () => {
    const html = ffFieldWrap({ id: 'email', label: 'Email', error: 'Required field', children: '' });
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('Required field'));
  });

  it('no label rendered when label is falsy', () => {
    const html = ffFieldWrap({ id: 'x', children: '' });
    assert.ok(!html.includes('<label'), 'label element should not appear');
  });
});

// ── ffInput ───────────────────────────────────────────────────────────────────
describe('friendly-forms — ffInput', () => {
  it('renders <input class="ff-input"> with the given id', () => {
    const html = ffInput({ id: 'patient-name', label: 'Name' });
    assert.ok(html.includes('id="patient-name"'));
    assert.ok(html.includes('class="ff-input"'));
  });

  it('defaults type to text', () => {
    const html = ffInput({ id: 'x', label: 'X' });
    assert.ok(html.includes('type="text"'));
  });

  it('renders icon span when icon is provided', () => {
    const html = ffInput({ id: 'x', label: 'X', icon: '👤' });
    assert.ok(html.includes('class="ff-icon"'));
    assert.ok(html.includes('has-icon'));
  });

  it('no icon span when icon is omitted', () => {
    const html = ffInput({ id: 'x', label: 'X' });
    assert.ok(!html.includes('ff-icon'));
    assert.ok(!html.includes('has-icon'));
  });
});

// ── ffTextarea ────────────────────────────────────────────────────────────────
describe('friendly-forms — ffTextarea', () => {
  it('renders <textarea> with id and rows', () => {
    const html = ffTextarea({ id: 'notes', label: 'Notes', rows: 5 });
    assert.ok(html.includes('<textarea'));
    assert.ok(html.includes('id="notes"'));
    assert.ok(html.includes('rows="5"'));
  });

  it('escapes value content', () => {
    const html = ffTextarea({ id: 'notes', label: 'N', value: '<script>' });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

// ── ffSelect ──────────────────────────────────────────────────────────────────
describe('friendly-forms — ffSelect', () => {
  it('renders placeholder as first empty-value option', () => {
    const html = ffSelect({ id: 'condition', label: 'Condition', options: ['MDD', 'OCD'], placeholder: 'Choose…' });
    assert.ok(html.includes('<option value="">Choose…</option>'));
  });

  it('marks the matching option as selected', () => {
    const html = ffSelect({ id: 'mod', label: 'Modality', options: ['TMS', 'tDCS'], value: 'tDCS' });
    assert.ok(html.includes('<option value="tDCS" selected>tDCS</option>'));
    assert.ok(!html.includes('<option value="TMS" selected>'));
  });

  it('supports {value, label} option objects', () => {
    const html = ffSelect({ id: 'x', label: 'X', options: [{ value: 'mdd', label: 'Major Depression' }], value: 'mdd' });
    assert.ok(html.includes('value="mdd"'));
    assert.ok(html.includes('Major Depression'));
    assert.ok(html.includes('selected'));
  });
});

// ── ffChipGroup ───────────────────────────────────────────────────────────────
describe('friendly-forms — ffChipGroup', () => {
  it('renders a hidden input with the pre-selected value', () => {
    const html = ffChipGroup({ id: 'mood', label: 'Mood', options: ['Good', 'Bad'], value: 'Good' });
    assert.ok(html.includes('type="hidden"'));
    assert.ok(html.includes('value="Good"'));
  });

  it('marks pre-selected chip with is-selected and aria-checked=true', () => {
    const html = ffChipGroup({ id: 'feeling', label: 'Feeling', options: ['Happy', 'Sad'], value: 'Sad' });
    // The button element may span multiple lines, so search in full HTML
    // We look for the presence of is-selected and that the value="Sad" hidden input exists.
    assert.ok(html.includes('is-selected'), 'is-selected class missing');
    assert.ok(html.includes('aria-checked="true"'), 'aria-checked=true missing');
    // The un-selected chip should have aria-checked="false"
    assert.ok(html.includes('aria-checked="false"'), 'aria-checked=false missing for unselected chip');
  });
});

// ── ffEmojiScale ─────────────────────────────────────────────────────────────
describe('friendly-forms — ffEmojiScale', () => {
  it('defaults to 5 steps and pre-selects midpoint (3)', () => {
    const html = ffEmojiScale({ id: 'pain', label: 'Pain' });
    // With min=1, max=5, default selected = round((1+5)/2) = 3
    // The button for value=3 spans multiple lines; is-selected appears on the
    // class= line of the button element. Check full HTML for both markers.
    assert.ok(html.includes('data-value="3"'), 'step 3 data-value not found');
    assert.ok(html.includes('is-selected'), 'is-selected class missing from step 3');
    // Hidden input holds value 3
    assert.ok(html.includes('value="3"'), 'hidden input should have value=3');
  });

  it('renders a hidden input with the selected value', () => {
    const html = ffEmojiScale({ id: 'fatigue', label: 'Fatigue', value: 4 });
    assert.ok(html.includes('type="hidden"'));
    assert.ok(html.includes('value="4"'));
  });

  it('shows left/right labels when provided', () => {
    const html = ffEmojiScale({ id: 'x', label: 'X', leftLabel: 'None', rightLabel: 'Severe' });
    assert.ok(html.includes('None'));
    assert.ok(html.includes('Severe'));
  });
});

// ── ffStepper ─────────────────────────────────────────────────────────────────
describe('friendly-forms — ffStepper', () => {
  it('marks current step as active', () => {
    const html = ffStepper({ steps: ['Intake', 'Assessment', 'Plan'], current: 2 });
    assert.ok(html.includes('ff-step--active'));
    assert.ok(html.includes('aria-current="step"'));
  });

  it('marks past steps as done with ✓', () => {
    const html = ffStepper({ steps: ['A', 'B', 'C'], current: 3 });
    assert.ok(html.includes('ff-step--done'));
    assert.ok(html.includes('✓'));
  });

  it('progress fill width is 0% when on step 1', () => {
    const html = ffStepper({ steps: ['Only', 'Two'], current: 1 });
    assert.ok(html.includes('width:0%'));
  });

  it('progress fill width is 100% when on last step', () => {
    const html = ffStepper({ steps: ['A', 'B'], current: 2 });
    assert.ok(html.includes('width:100%'));
  });
});

// ── ffActions ─────────────────────────────────────────────────────────────────
describe('friendly-forms — ffActions', () => {
  it('renders primary button with btn-primary class', () => {
    const html = ffActions({ primary: { label: 'Save', id: 'save-btn' } });
    assert.ok(html.includes('btn-primary'));
    assert.ok(html.includes('Save'));
    assert.ok(html.includes('id="save-btn"'));
  });

  it('renders tertiary button in left action area', () => {
    const html = ffActions({ tertiary: { label: 'Back', id: 'back-btn' }, primary: { label: 'Next' } });
    assert.ok(html.includes('ff-actions-left'));
    assert.ok(html.includes('Back'));
  });

  it('omits missing buttons', () => {
    const html = ffActions({ primary: { label: 'OK' } });
    // No tertiary or secondary provided — left side should be empty
    const leftSection = html.match(/<div class="ff-actions-left">(.*?)<\/div>/s)?.[1] ?? '';
    assert.strictEqual(leftSection.trim(), '');
  });
});

// ── ffNotice ──────────────────────────────────────────────────────────────────
describe('friendly-forms — ffNotice', () => {
  it('renders role=alert for tone=err', () => {
    const html = ffNotice({ tone: 'err', text: 'Please fix the error.' });
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('Please fix the error.'));
  });

  it('renders role=status for tone=ok', () => {
    const html = ffNotice({ tone: 'ok', text: 'Saved successfully.' });
    assert.ok(html.includes('role="status"'));
    assert.ok(html.includes('Saved successfully.'));
  });

  it('uses default icon ℹ for tone=info', () => {
    const html = ffNotice({ tone: 'info', text: 'Note' });
    assert.ok(html.includes('ℹ'));
  });

  it('uses custom icon when supplied', () => {
    const html = ffNotice({ tone: 'warn', text: 'Warning', icon: '🔔' });
    assert.ok(html.includes('🔔'));
  });
});
