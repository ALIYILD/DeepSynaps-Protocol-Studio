// ── Friendly form primitives ─────────────────────────────────────────────────
// Reusable builders that produce HTML strings consistent with the DeepSynaps
// design language. They are intentionally role-agnostic: the same helpers are
// used for clinician-facing workflows (intake, onboarding, protocol setup) and
// patient-facing workflows (check-ins, journals, self-report).
//
// Design goals:
//   * Generous touch targets (≥ 44px) for phone/tablet bedside use
//   * Helper text + inline error slot on every field
//   * Icon affordance so fields read as intention, not label soup
//   * All fields render an element with the exact `id` passed in, so existing
//     handlers that query by id keep working without modification.

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attrs(map = {}) {
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ');
}

// ── Field wrapper ────────────────────────────────────────────────────────────
// Every friendly field has the same outer shell so spacing and error state
// stay uniform across the app.
export function ffFieldWrap({ id, label, help, required, optional, error, children }) {
  const reqMark = required
    ? `<span class="ff-required" aria-hidden="true" title="Required">*</span>`
    : '';
  const optMark = optional
    ? `<span class="ff-optional">(optional)</span>`
    : '';
  const helpHtml = help
    ? `<div class="ff-help" id="${esc(id)}-help">${esc(help)}</div>`
    : '';
  const errId = `${esc(id)}-err`;
  const errHtml = `<div class="ff-err" id="${errId}" role="alert" aria-live="polite"${error ? '' : ' hidden'}>${esc(error || '')}</div>`;
  return `<div class="ff-field" data-field="${esc(id)}">
    ${label ? `<label class="ff-label" for="${esc(id)}">${esc(label)} ${reqMark}${optMark}</label>` : ''}
    ${children}
    ${helpHtml}
    ${errHtml}
  </div>`;
}

// ── Text-like input ──────────────────────────────────────────────────────────
// Supports: text, email, tel, date, number, password, search. Icon is optional
// and renders as a left adornment inside the control so users scan meaning
// before content.
export function ffInput({
  id,
  label,
  type = 'text',
  value = '',
  placeholder = '',
  icon = '',
  help = '',
  required = false,
  optional = false,
  autocomplete,
  inputmode,
  pattern,
  min,
  max,
  step,
  maxlength,
  error = '',
}) {
  const inputAttrs = attrs({
    id,
    type,
    value,
    placeholder,
    autocomplete,
    inputmode,
    pattern,
    min,
    max,
    step,
    maxlength,
    'aria-describedby': help ? `${id}-help` : undefined,
    'aria-required': required ? 'true' : undefined,
  });
  const iconHtml = icon ? `<span class="ff-icon" aria-hidden="true">${icon}</span>` : '';
  const control = `<div class="ff-control${icon ? ' has-icon' : ''}">
    ${iconHtml}
    <input class="ff-input" ${inputAttrs} />
  </div>`;
  return ffFieldWrap({ id, label, help, required, optional, error, children: control });
}

// ── Textarea ─────────────────────────────────────────────────────────────────
export function ffTextarea({
  id,
  label,
  value = '',
  placeholder = '',
  rows = 3,
  help = '',
  required = false,
  optional = false,
  maxlength,
  error = '',
}) {
  const ta = `<textarea class="ff-input ff-textarea" ${attrs({
    id,
    rows,
    placeholder,
    maxlength,
    'aria-describedby': help ? `${id}-help` : undefined,
    'aria-required': required ? 'true' : undefined,
  })}>${esc(value)}</textarea>`;
  return ffFieldWrap({ id, label, help, required, optional, error, children: ta });
}

// ── Select ───────────────────────────────────────────────────────────────────
// Accepts either an array of strings or array of {value,label}.
export function ffSelect({
  id,
  label,
  options = [],
  value = '',
  placeholder = 'Select…',
  help = '',
  required = false,
  optional = false,
  error = '',
}) {
  const opts = options.map((o) => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    return `<option value="${esc(v)}"${value === v ? ' selected' : ''}>${esc(l)}</option>`;
  }).join('');
  const sel = `<div class="ff-control ff-select-wrap">
    <select class="ff-input ff-select" ${attrs({
      id,
      'aria-describedby': help ? `${id}-help` : undefined,
      'aria-required': required ? 'true' : undefined,
    })}>
      <option value="">${esc(placeholder)}</option>
      ${opts}
    </select>
    <span class="ff-caret" aria-hidden="true">▾</span>
  </div>`;
  return ffFieldWrap({ id, label, help, required, optional, error, children: sel });
}

// ── Choice chip group (single-select) ────────────────────────────────────────
// Renders a big, tappable set of chips. Writes the selected value to a hidden
// input with the given id so existing form-read code can grab it with
// document.getElementById(id).value.
export function ffChipGroup({
  id,
  label,
  options = [],
  value = '',
  help = '',
  required = false,
  optional = false,
  error = '',
  columns,
}) {
  const gridStyle = columns ? ` style="grid-template-columns:repeat(${columns},minmax(0,1fr))"` : '';
  const chips = options.map((o) => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    const ic = typeof o === 'string' ? '' : (o.icon || '');
    const selected = value === v;
    return `<button type="button" class="ff-chip${selected ? ' is-selected' : ''}"
      role="radio" aria-checked="${selected ? 'true' : 'false'}"
      data-group="${esc(id)}" data-value="${esc(v)}"
      onclick="window._ffChipPick(this)">
      ${ic ? `<span class="ff-chip-icon" aria-hidden="true">${ic}</span>` : ''}
      <span class="ff-chip-label">${esc(l)}</span>
    </button>`;
  }).join('');
  const control = `<div class="ff-chip-group" role="radiogroup" aria-labelledby="${esc(id)}-label"${gridStyle}>
    ${chips}
    <input type="hidden" id="${esc(id)}" value="${esc(value)}" />
  </div>`;
  return ffFieldWrap({ id, label, help, required, optional, error, children: control });
}

// ── Emoji scale (1..N visual rating) ─────────────────────────────────────────
// Ideal for patient-friendly self-report: mood, pain, fatigue, tolerance, etc.
// Writes numeric value to hidden input #id.
export function ffEmojiScale({
  id,
  label,
  emojis = ['😫', '😟', '😐', '🙂', '😊'],
  min = 1,
  max = 5,
  value,
  help = '',
  leftLabel = '',
  rightLabel = '',
  required = false,
  error = '',
}) {
  const count = max - min + 1;
  const selectedVal = value == null ? Math.round((min + max) / 2) : value;
  const steps = [];
  for (let i = 0; i < count; i++) {
    const v = min + i;
    const emoji = emojis[Math.min(i, emojis.length - 1)] || '•';
    const sel = v === selectedVal ? ' is-selected' : '';
    steps.push(`<button type="button" class="ff-scale-step${sel}"
      data-group="${esc(id)}" data-value="${v}"
      aria-label="${esc(label || 'Rating')} ${v} of ${max}"
      onclick="window._ffScalePick(this)">
      <span class="ff-scale-emoji" aria-hidden="true">${emoji}</span>
      <span class="ff-scale-num">${v}</span>
    </button>`);
  }
  const ends = (leftLabel || rightLabel)
    ? `<div class="ff-scale-ends"><span>${esc(leftLabel)}</span><span>${esc(rightLabel)}</span></div>`
    : '';
  const control = `<div class="ff-scale">
    <div class="ff-scale-row" role="radiogroup" aria-label="${esc(label || 'Rating')}">${steps.join('')}</div>
    ${ends}
    <input type="hidden" id="${esc(id)}" value="${selectedVal}" />
  </div>`;
  return ffFieldWrap({ id, label, help, required, error, children: control });
}

// ── Checkbox list (multi-select) ─────────────────────────────────────────────
// Renders accessible, touch-friendly checkbox rows. Each option id is
// `${id}-${slug}` so handlers can iterate document.querySelectorAll.
export function ffCheckList({ id, label, options = [], values = [], help = '', optional = false, error = '' }) {
  const rows = options.map((o) => {
    const v = typeof o === 'string' ? o : o.value;
    const l = typeof o === 'string' ? o : o.label;
    const desc = typeof o === 'object' ? (o.desc || '') : '';
    const slug = String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const checked = values.includes(v);
    return `<label class="ff-check-row${checked ? ' is-checked' : ''}">
      <input type="checkbox" id="${esc(id)}-${slug}" value="${esc(v)}" data-group="${esc(id)}"
        ${checked ? 'checked' : ''} onchange="window._ffCheckToggle(this)" />
      <span class="ff-check-body">
        <span class="ff-check-label">${esc(l)}</span>
        ${desc ? `<span class="ff-check-desc">${esc(desc)}</span>` : ''}
      </span>
    </label>`;
  }).join('');
  return ffFieldWrap({ id, label, help, optional, error, children: `<div class="ff-check-list" data-group="${esc(id)}">${rows}</div>` });
}

// ── Stepper (wizard header) ──────────────────────────────────────────────────
export function ffStepper({ steps = [], current = 1 }) {
  const total = steps.length || 1;
  const pct = ((current - 1) / Math.max(total - 1, 1)) * 100;
  const pips = steps.map((labelText, i) => {
    const n = i + 1;
    let state = 'upcoming';
    if (n < current) state = 'done';
    else if (n === current) state = 'active';
    const mark = state === 'done' ? '✓' : String(n);
    return `<div class="ff-step ff-step--${state}">
      <div class="ff-step-pip" aria-current="${state === 'active' ? 'step' : 'false'}">${mark}</div>
      <div class="ff-step-label">${esc(labelText)}</div>
    </div>`;
  }).join('');
  return `<div class="ff-stepper" role="navigation" aria-label="Progress">
    <div class="ff-step-track"><div class="ff-step-track-fill" style="width:${pct}%"></div></div>
    <div class="ff-step-list">${pips}</div>
  </div>`;
}

// ── Footer action row used at the bottom of a form step ──────────────────────
export function ffActions({ primary, secondary, tertiary } = {}) {
  const btn = (b, cls) => b
    ? `<button type="button" class="btn ${cls}" ${b.id ? `id="${esc(b.id)}"` : ''} ${b.onclick ? `onclick="${b.onclick}"` : ''}>${esc(b.label)}</button>`
    : '';
  return `<div class="ff-actions">
    <div class="ff-actions-left">${btn(tertiary, 'btn-ghost')}</div>
    <div class="ff-actions-right">${btn(secondary, 'btn')}${btn(primary, 'btn-primary')}</div>
  </div>`;
}

// ── Inline notice, tuned for form-level errors and success confirmations ─────
export function ffNotice({ tone = 'info', text, icon }) {
  const defaults = { info: 'ℹ', ok: '✓', warn: '⚠', err: '!' };
  const i = icon || defaults[tone] || '';
  return `<div class="ff-notice ff-notice--${esc(tone)}" role="${tone === 'err' ? 'alert' : 'status'}">
    <span class="ff-notice-icon" aria-hidden="true">${i}</span>
    <span class="ff-notice-text">${esc(text)}</span>
  </div>`;
}

// ── Window-scope event handlers (wired once per load) ────────────────────────
// Guarded so repeated imports in test runs do not double-register.
if (typeof window !== 'undefined' && !window.__ffWired) {
  window.__ffWired = true;

  window._ffChipPick = function (el) {
    const group = el?.dataset?.group;
    const value = el?.dataset?.value;
    if (!group) return;
    const container = el.parentElement;
    container.querySelectorAll('.ff-chip').forEach((c) => {
      const match = c === el;
      c.classList.toggle('is-selected', match);
      c.setAttribute('aria-checked', match ? 'true' : 'false');
    });
    const hidden = document.getElementById(group);
    if (hidden) {
      hidden.value = value;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  window._ffScalePick = function (el) {
    const group = el?.dataset?.group;
    const value = el?.dataset?.value;
    if (!group) return;
    el.parentElement.querySelectorAll('.ff-scale-step').forEach((s) => s.classList.toggle('is-selected', s === el));
    const hidden = document.getElementById(group);
    if (hidden) {
      hidden.value = value;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  window._ffCheckToggle = function (el) {
    const row = el.closest('.ff-check-row');
    if (row) row.classList.toggle('is-checked', el.checked);
  };
}
