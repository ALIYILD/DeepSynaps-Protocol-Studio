// pgIntake — Patient Intake & Consent (clinician-side). Extracted from
// `pages-patient.js` on 2026-05-02 as part of the file-split refactor (see
// `pages-patient/_shared.js`). NO behavioural change: code below is the
// verbatim intake block from the original file, with imports rewired.
//
// The intake module is fully self-contained — no other patient page
// references its templates / localStorage helpers / signature canvas.
// `_hdEsc` is the only external symbol it pulls in (HTML escaper used
// throughout the consent form rendering).
import { _hdEsc } from './_shared.js';

// ─────────────────────────────────────────────────────────────────────────────
// INTAKE & CONSENT MANAGER  (clinician-side)
// ─────────────────────────────────────────────────────────────────────────────

const INTAKE_FIELD_TYPES = ['text', 'email', 'phone', 'date', 'select', 'checkbox', 'textarea', 'signature'];

const INTAKE_TEMPLATES = [
  {
    id: 'new-patient',
    name: 'New Patient Intake',
    fields: [
      { id: 'np-name',      label: 'Full Name',           type: 'text',      required: true },
      { id: 'np-dob',       label: 'Date of Birth',       type: 'date',      required: true },
      { id: 'np-email',     label: 'Email Address',       type: 'email',     required: true },
      { id: 'np-phone',     label: 'Phone Number',        type: 'phone',     required: true },
      { id: 'np-gender',    label: 'Gender',              type: 'select',    required: false, options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] },
      { id: 'np-referral',  label: 'Referred By',         type: 'text',      required: false },
      { id: 'np-insurance', label: 'Insurance Provider',  type: 'text',      required: false },
      { id: 'np-notes',     label: 'Additional Notes',    type: 'textarea',  required: false },
    ],
  },
  {
    id: 'hipaa-consent',
    name: 'HIPAA Consent',
    fields: [
      { id: 'hc-name',  label: 'Patient Full Name',   type: 'text',      required: true },
      { id: 'hc-dob',   label: 'Date of Birth',       type: 'date',      required: true },
      { id: 'hc-agree', label: 'I have read and agree to the HIPAA Notice of Privacy Practices', type: 'checkbox', required: true },
      { id: 'hc-auth',  label: 'I authorize the use of my health information as described',      type: 'checkbox', required: true },
      { id: 'hc-sig',   label: 'Patient Signature',   type: 'signature', required: true },
    ],
  },
  {
    id: 'treatment-consent',
    name: 'Treatment Consent',
    fields: [
      { id: 'tc-name',      label: 'Patient Full Name',                              type: 'text',      required: true },
      { id: 'tc-treatment', label: 'Treatment / Procedure',                          type: 'text',      required: true },
      { id: 'tc-risks',     label: 'I understand the risks explained to me',          type: 'checkbox',  required: true },
      { id: 'tc-benefits',  label: 'I understand the expected benefits',              type: 'checkbox',  required: true },
      { id: 'tc-withdraw',  label: 'I understand I may withdraw consent at any time', type: 'checkbox',  required: true },
      { id: 'tc-sig',       label: 'Patient Signature',                              type: 'signature', required: true },
    ],
  },
  {
    id: 'symptom-checklist',
    name: 'Symptom Checklist',
    fields: [
      { id: 'sc-headache',   label: 'Headaches',               type: 'checkbox', required: false },
      { id: 'sc-anxiety',    label: 'Anxiety',                 type: 'checkbox', required: false },
      { id: 'sc-depression', label: 'Depression',              type: 'checkbox', required: false },
      { id: 'sc-insomnia',   label: 'Insomnia / Sleep issues', type: 'checkbox', required: false },
      { id: 'sc-fatigue',    label: 'Fatigue',                 type: 'checkbox', required: false },
      { id: 'sc-focus',      label: 'Difficulty concentrating',type: 'checkbox', required: false },
      { id: 'sc-memory',     label: 'Memory problems',         type: 'checkbox', required: false },
      { id: 'sc-mood',       label: 'Mood swings',             type: 'checkbox', required: false },
      { id: 'sc-pain',       label: 'Chronic pain',            type: 'checkbox', required: false },
      { id: 'sc-tinnitus',   label: 'Tinnitus / ringing',      type: 'checkbox', required: false },
    ],
  },
];

// ── LocalStorage helpers ──────────────────────────────────────────────────────
function getIntakeForms() {
  try { return JSON.parse(localStorage.getItem('ds_intake_forms') || '[]'); } catch (_e) { return []; }
}
function saveIntakeForm(form) {
  const forms = getIntakeForms();
  const idx = forms.findIndex(f => f.id === form.id);
  if (idx >= 0) forms[idx] = form; else forms.push(form);
  try { localStorage.setItem('ds_intake_forms', JSON.stringify(forms)); } catch (_e) {}
}
function getIntakeSubmissions() {
  try { return JSON.parse(localStorage.getItem('ds_intake_submissions') || '[]'); } catch (_e) { return []; }
}
function saveIntakeSubmission(sub) {
  const subs = getIntakeSubmissions();
  const idx = subs.findIndex(s => s.id === sub.id);
  if (idx >= 0) subs[idx] = sub; else subs.push(sub);
  try { localStorage.setItem('ds_intake_submissions', JSON.stringify(subs)); } catch (_e) {}
}
function getSubmissionsByPatient(name) {
  return getIntakeSubmissions().filter(s =>
    (s.patientName || '').toLowerCase().includes(name.toLowerCase())
  );
}

// ── Signature canvas renderer ─────────────────────────────────────────────────
function renderSignatureCanvas(fieldId) {
  return `<div class="sig-canvas-wrap" id="sig-wrap-${fieldId}">
    <canvas id="sig-canvas-${fieldId}" width="300" height="120" style="touch-action:none"></canvas>
  </div>
  <div style="margin-top:4px">
    <button type="button" class="btn-secondary" style="font-size:.75rem;padding:3px 10px"
      onclick="window._sigClear('${fieldId}')">Clear</button>
  </div>`;
}

window._sigClear = function(fieldId) {
  const canvas = document.getElementById('sig-canvas-' + fieldId);
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
};

window._sigGetDataURL = function(fieldId) {
  const canvas = document.getElementById('sig-canvas-' + fieldId);
  return canvas ? canvas.toDataURL('image/png') : '';
};

window._initSignatureCanvas = function(fieldId) {
  const canvas = document.getElementById('sig-canvas-' + fieldId);
  if (!canvas || canvas._sigInit) return;
  canvas._sigInit = true;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let drawing = false;

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    const s = e.touches ? e.touches[0] : e;
    return { x: s.clientX - r.left, y: s.clientY - r.top };
  }
  function onStart(e) { e.preventDefault(); drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function onMove(e)  { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); }
  function onEnd(e)   { e.preventDefault(); drawing = false; }

  canvas.addEventListener('mousedown',  onStart);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onEnd);
  canvas.addEventListener('mouseleave', onEnd);
  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove',  onMove,  { passive: false });
  canvas.addEventListener('touchend',   onEnd,   { passive: false });
};

// ── pgIntake ──────────────────────────────────────────────────────────────────
export async function pgIntake(setTopbarFn) {
  setTopbarFn('Patient Intake & Consent',
    '<button class="btn-primary" style="font-size:.8rem;padding:5px 14px" onclick="window._nav(\'patients\')">&#8592; Patients</button>'
  );

  const el = document.getElementById('content');
  if (!el) return;

  let activeTab = 'builder';
  let editorForm = { id: '', name: '', fields: [] };
  let activeFormId = null;
  let consentFilter = 'all';

  function uid() { return 'f-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function ftLabel(type) {
    return { text:'Text', email:'Email', phone:'Phone', date:'Date', select:'Select',
             checkbox:'Checkbox', textarea:'Textarea', signature:'Signature' }[type] || type;
  }

  function statusBadge(signed) {
    return signed
      ? '<span style="background:rgba(0,188,188,.15);color:var(--teal);padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600">Signed</span>'
      : '<span style="background:rgba(245,158,11,.15);color:#d97706;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:600">Unsigned</span>';
  }

  function renderTabBar() {
    return [['builder','Form Builder'],['submissions','Submissions'],['consent','Consent Tracker']].map(([id, label]) =>
      '<button class="tab-btn ' + (activeTab === id ? 'active' : '') + '" onclick="window._intakeTab(\'' + id + '\')">' + label + '</button>'
    ).join('');
  }

  function renderFieldRow(field) {
    const lbl = field.label.replace(/"/g, '&quot;');
    const req = field.required ? 'checked' : '';
    return '<div class="intake-field-row" id="field-row-' + field.id + '">'
      + '<input type="text" value="' + lbl + '" placeholder="Field label"'
      + ' style="padding:5px 8px;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.85rem"'
      + ' onchange="window._updateIntakeFieldLabel(\'' + field.id + '\', this.value)">'
      + '<select style="padding:4px 6px;background:var(--input-bg);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:.82rem"'
      + ' onchange="window._updateIntakeFieldType(\'' + field.id + '\', this.value)">'
      + INTAKE_FIELD_TYPES.map(t => '<option value="' + t + '"' + (field.type === t ? ' selected' : '') + '>' + ftLabel(t) + '</option>').join('')
      + '</select>'
      + '<label style="display:flex;align-items:center;gap:4px;font-size:.8rem;cursor:pointer;white-space:nowrap">'
      + '<input type="checkbox" ' + req + ' onchange="window._updateIntakeFieldReq(\'' + field.id + '\', this.checked)"> Req'
      + '</label>'
      + '<button class="btn-ghost" style="padding:2px 6px;color:var(--red);font-size:.9rem"'
      + ' onclick="window._removeIntakeField(\'' + field.id + '\')" title="Remove">&times;</button>'
      + '</div>';
  }

  function allForms() {
    const saved = getIntakeForms();
    const savedIds = new Set(saved.map(f => f.id));
    return [...saved, ...INTAKE_TEMPLATES.filter(t => !savedIds.has(t.id))];
  }

  function renderFormList() {
    const forms = allForms();
    if (!forms.length) return '<p style="padding:12px;color:var(--text-muted);font-size:.85rem">No forms yet.</p>';
    return '<ul class="intake-form-list">'
      + forms.map(f => {
          const isTemplate = INTAKE_TEMPLATES.some(t => t.id === f.id) && !getIntakeForms().find(s => s.id === f.id);
          const active = f.id === activeFormId ? ' active' : '';
          return '<li class="intake-form-item' + active + '" onclick="window._loadIntakeTemplate(\'' + f.id + '\')">'
            + '<span style="font-size:.88rem">' + _hdEsc(f.name) + '</span>'
            + (isTemplate ? '<span style="font-size:.7rem;padding:1px 6px;border-radius:10px;background:rgba(0,188,188,.12);color:var(--teal)">template</span>' : '')
            + '</li>';
        }).join('')
      + '</ul>';
  }

  function renderEditor() {
    const nameVal = editorForm.name.replace(/"/g, '&quot;');
    const isNew = !editorForm.id;
    return '<div style="padding:20px">'
      + '<div style="margin-bottom:16px;display:flex;gap:10px;align-items:center">'
      + '<input id="intake-form-name" type="text" value="' + nameVal + '" placeholder="Form name&hellip;"'
      + ' style="flex:1;padding:8px 12px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:.95rem"'
      + ' oninput="window._intakeFormNameChange(this.value)">'
      + '</div>'
      + '<div id="intake-field-list">'
      + (editorForm.fields.length
          ? editorForm.fields.map(f => renderFieldRow(f)).join('')
          : '<p style="color:var(--text-muted);font-size:.85rem;padding:8px 0">No fields yet. Add one below.</p>')
      + '</div>'
      + '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<select id="intake-add-type" style="padding:6px 10px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:.85rem">'
      + INTAKE_FIELD_TYPES.map(t => '<option value="' + t + '">' + ftLabel(t) + '</option>').join('')
      + '</select>'
      + '<button class="btn-secondary" style="font-size:.82rem" onclick="window._addIntakeField(document.getElementById(\'intake-add-type\').value)">+ Add Field</button>'
      + '</div>'
      + '<div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap">'
      + '<button class="btn-primary" onclick="window._saveIntakeForm()">Save Form</button>'
      + '<button class="btn-secondary" onclick="window._sendIntakeForm(\'' + (editorForm.id || '') + '\')">Send to Patient</button>'
      + (!isNew ? '<button class="btn-ghost" style="color:var(--red);margin-left:auto" onclick="window._deleteIntakeForm(\'' + editorForm.id + '\')">Delete Form</button>' : '')
      + '</div>'
      + '</div>';
  }

  function renderBuilderTab() {
    const showEditor = editorForm.fields.length > 0 || editorForm.name;
    return '<div style="display:grid;grid-template-columns:240px 1fr;gap:0;border:1px solid var(--border);border-radius:10px;overflow:hidden;min-height:480px">'
      + '<div style="border-right:1px solid var(--border);background:var(--card-bg)">'
      + '<div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)">'
      + '<span style="font-weight:600;font-size:.85rem">Forms</span>'
      + '<button class="btn-secondary" style="font-size:.75rem;padding:3px 9px" onclick="window._intakeNewForm()">+ New</button>'
      + '</div>'
      + renderFormList()
      + '</div>'
      + '<div style="background:var(--card-bg)">'
      + (showEditor
          ? renderEditor()
          : '<div style="padding:48px;text-align:center;color:var(--text-muted)"><div style="font-size:2rem;margin-bottom:12px">&#128203;</div><p>Select a form or create a new one.</p></div>')
      + '</div>'
      + '</div>';
  }

  function renderSubmissionsTab(query) {
    query = query || '';
    const subs = query ? getSubmissionsByPatient(query) : getIntakeSubmissions();
    const rows = subs.map(s => {
      const detailPairs = Object.entries(s.data || {}).map(([k, v]) => {
        const display = (v && typeof v === 'string' && v.startsWith('data:image'))
          ? '<img src="' + v + '" style="height:36px;border:1px solid #ddd;border-radius:3px;vertical-align:middle">'
          : (v === true || v === 'true' ? '&#10003;' : (_hdEsc(v) || '&mdash;'));
        return '<dt>' + _hdEsc(k) + ':</dt><dd>' + display + '</dd>';
      }).join('');
      return '<tr id="sub-row-' + s.id + '" style="border-bottom:1px solid var(--border)">'
        + '<td style="padding:10px;font-size:.875rem">' + (_hdEsc(s.patientName) || '&mdash;') + '</td>'
        + '<td style="padding:10px;font-size:.875rem">' + (_hdEsc(s.formName) || '&mdash;') + '</td>'
        + '<td style="padding:10px;font-size:.8rem;color:var(--text-muted)">' + (s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : '&mdash;') + '</td>'
        + '<td style="padding:10px">' + statusBadge(s.signed) + '</td>'
        + '<td style="padding:10px;display:flex;gap:8px">'
        + '<button class="btn-secondary" style="font-size:.75rem;padding:3px 10px" onclick="window._viewSubmission(\'' + s.id + '\')">View</button>'
        + '<button class="btn-ghost" style="font-size:.75rem;padding:3px 10px" onclick="window._printSubmission(\'' + s.id + '\')">Print</button>'
        + '</td></tr>'
        + '<tr id="sub-detail-' + s.id + '" style="display:none"><td colspan="5">'
        + '<div class="submission-detail">' + detailPairs + '</div>'
        + '</td></tr>';
    }).join('');

    return '<div>'
      + '<div style="margin-bottom:16px;max-width:300px">'
      + '<input type="text" id="sub-search" placeholder="Search by patient name&hellip;" value="' + query.replace(/"/g, '&quot;') + '"'
      + ' style="width:100%;padding:7px 12px;background:var(--input-bg);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:.875rem"'
      + ' oninput="window._filterSubmissions(this.value)">'
      + '</div>'
      + (subs.length === 0 ? '<p style="color:var(--text-muted);padding:24px 0">No submissions found.</p>' : '')
      + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
      + '<thead><tr style="font-size:.75rem;text-transform:uppercase;color:var(--text-muted)">'
      + ['Patient','Form','Submitted','Signed','Actions'].map(h =>
          '<th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border)">' + h + '</th>'
        ).join('')
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div id="print-intake-target" class="print-intake-submission" style="display:none"></div>'
      + '</div>';
  }

  function renderConsentTab(filter) {
    filter = filter || 'all';
    const allSubs = getIntakeSubmissions();
    const consentSubs = allSubs.filter(s =>
      ['hipaa-consent', 'treatment-consent'].includes(s.formId) ||
      (s.formName || '').toLowerCase().includes('consent')
    );
    const filtered = filter === 'all'     ? consentSubs
      : filter === 'signed'  ? consentSubs.filter(s => s.signed && !s.revoked)
      : filter === 'pending' ? consentSubs.filter(s => !s.signed && !s.revoked)
      : filter === 'revoked' ? consentSubs.filter(s => s.revoked)
      : consentSubs;

    const activeCnt = consentSubs.filter(s => s.signed && !s.revoked).length;
    const totalPts  = new Set(consentSubs.map(s => s.patientName)).size;

    const filterBtns = ['all','signed','pending','revoked'].map(f => {
      const active = consentFilter === f;
      return '<button class="btn-secondary" style="font-size:.78rem;padding:4px 12px'
        + (active ? ';background:var(--teal);color:white;border-color:var(--teal)' : '') + '"'
        + ' onclick="window._filterConsent(\'' + f + '\')">' + f.charAt(0).toUpperCase() + f.slice(1) + '</button>';
    }).join('');

    const cards = filtered.map(s => {
      const sigVal = s.data ? Object.values(s.data).find(v => typeof v === 'string' && v.startsWith('data:image')) : null;
      return '<div class="consent-card">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
        + '<div><div style="font-weight:600;font-size:.9rem">' + (_hdEsc(s.patientName) || 'Unknown') + '</div>'
        + '<div style="font-size:.78rem;color:var(--text-muted);margin-top:2px">' + (_hdEsc(s.formName) || '&mdash;') + '</div></div>'
        + statusBadge(s.signed) + '</div>'
        + '<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px">'
        + (s.revoked ? '<span style="color:var(--red)">Revoked</span>' : (s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : 'Date unknown'))
        + '</div>'
        + (sigVal
            ? '<img src="' + sigVal + '" class="sig-thumb" alt="Signature preview">'
            : '<div style="height:48px;border:1px solid var(--border);border-radius:4px;background:var(--hover-bg);display:flex;align-items:center;justify-content:center;font-size:.75rem;color:var(--text-muted)">No signature</div>')
        + '<div style="margin-top:12px">'
        + (!s.revoked
            ? '<button class="btn-ghost" style="font-size:.75rem;padding:3px 10px;color:var(--red)" onclick="window._revokeConsent(\'' + s.id + '\')">Revoke</button>'
            : '<span style="font-size:.75rem;color:var(--text-muted)">Revoked</span>')
        + '</div></div>';
    }).join('');

    return '<div>'
      + '<div style="margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
      + '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:10px 18px;font-size:.875rem">'
      + '<span style="color:var(--teal);font-weight:700;font-size:1.2rem">' + activeCnt + '</span>'
      + '<span style="color:var(--text-muted)"> of </span>'
      + '<span style="font-weight:600">' + totalPts + '</span>'
      + '<span style="color:var(--text-muted)"> patients have active consent on file</span>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + filterBtns + '</div>'
      + '</div>'
      + (filtered.length === 0 ? '<p style="color:var(--text-muted);padding:24px 0">No consent records match this filter.</p>' : '')
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">' + cards + '</div>'
      + '</div>';
  }

  function fullRender() {
    el.innerHTML = '<div style="max-width:1100px;margin:0 auto;padding:24px">'
      + '<div class="tab-bar" style="margin-bottom:20px" id="intake-tabbar">' + renderTabBar() + '</div>'
      + '<div id="intake-tab-content">' + tabContent() + '</div>'
      + '</div>';
  }

  function tabContent() {
    if (activeTab === 'builder')     return renderBuilderTab();
    if (activeTab === 'submissions') return renderSubmissionsTab();
    if (activeTab === 'consent')     return renderConsentTab(consentFilter);
    return '';
  }

  function refreshContent() {
    const tc = document.getElementById('intake-tab-content');
    const tb = document.getElementById('intake-tabbar');
    if (!tc) { fullRender(); return; }
    if (tb) tb.innerHTML = renderTabBar();
    tc.innerHTML = tabContent();
  }

  function showToast(msg, color) {
    color = color || 'var(--teal)';
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:' + color + ';color:white;padding:10px 20px;border-radius:8px;font-size:.875rem;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.25);pointer-events:none';
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2800);
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  window._intakeTab = function(tab) {
    activeTab = tab;
    refreshContent();
  };

  window._intakeNewForm = function() {
    activeFormId = null;
    editorForm = { id: '', name: '', fields: [] };
    refreshContent();
  };

  window._intakeFormNameChange = function(val) {
    editorForm.name = val;
  };

  window._loadIntakeTemplate = function(id) {
    activeFormId = id;
    const saved = getIntakeForms().find(f => f.id === id);
    if (saved) {
      editorForm = JSON.parse(JSON.stringify(saved));
    } else {
      const tmpl = INTAKE_TEMPLATES.find(t => t.id === id);
      if (tmpl) editorForm = JSON.parse(JSON.stringify(tmpl));
    }
    refreshContent();
  };

  window._addIntakeField = function(type) {
    const newField = { id: uid(), label: ftLabel(type) + ' field', type: type, required: false };
    if (type === 'select') newField.options = ['Option 1', 'Option 2'];
    editorForm.fields.push(newField);
    const listEl = document.getElementById('intake-field-list');
    if (listEl) {
      const emptyMsg = listEl.querySelector('p');
      if (emptyMsg) emptyMsg.remove();
      listEl.insertAdjacentHTML('beforeend', renderFieldRow(newField));
    }
  };

  window._removeIntakeField = function(fieldId) {
    editorForm.fields = editorForm.fields.filter(function(f) { return f.id !== fieldId; });
    const row = document.getElementById('field-row-' + fieldId);
    if (row) row.remove();
    if (!editorForm.fields.length) {
      const listEl = document.getElementById('intake-field-list');
      if (listEl) listEl.innerHTML = '<p style="color:var(--text-muted);font-size:.85rem;padding:8px 0">No fields yet. Add one below.</p>';
    }
  };

  window._updateIntakeFieldLabel = function(fieldId, val) {
    const f = editorForm.fields.find(function(x) { return x.id === fieldId; });
    if (f) f.label = val;
  };

  window._updateIntakeFieldType = function(fieldId, val) {
    const f = editorForm.fields.find(function(x) { return x.id === fieldId; });
    if (f) { f.type = val; if (val === 'select' && !f.options) f.options = ['Option 1', 'Option 2']; }
  };

  window._updateIntakeFieldReq = function(fieldId, val) {
    const f = editorForm.fields.find(function(x) { return x.id === fieldId; });
    if (f) f.required = val;
  };

  window._saveIntakeForm = function() {
    const nameInput = document.getElementById('intake-form-name');
    if (nameInput) editorForm.name = nameInput.value.trim();
    if (!editorForm.name) { showToast('Please enter a form name.', '#ef4444'); return; }
    if (!editorForm.id) editorForm.id = 'form-' + Date.now().toString(36);
    if (!editorForm.createdAt) editorForm.createdAt = new Date().toISOString();
    saveIntakeForm(JSON.parse(JSON.stringify(editorForm)));
    activeFormId = editorForm.id;
    showToast('Form saved!');
    refreshContent();
  };

  window._sendIntakeForm = function(formId) {
    const id = formId || editorForm.id;
    const forms = allForms();
    const form = forms.find(function(f) { return f.id === id; });
    const name = form ? form.name : 'this form';
    showToast('Intake link sharing is not yet available \u2014 "' + name + '" saved locally only.', '#6b7280');
  };

  window._deleteIntakeForm = function(id) {
    if (!confirm('Delete this form?')) return;
    const forms = getIntakeForms().filter(function(f) { return f.id !== id; });
    try { localStorage.setItem('ds_intake_forms', JSON.stringify(forms)); } catch (_e) {}
    editorForm = { id: '', name: '', fields: [] };
    activeFormId = null;
    showToast('Form deleted.', '#6b7280');
    refreshContent();
  };

  window._viewSubmission = function(id) {
    const detailRow = document.getElementById('sub-detail-' + id);
    if (!detailRow) return;
    detailRow.style.display = detailRow.style.display === 'none' ? 'table-row' : 'none';
  };

  window._printSubmission = function(id) {
    const sub = getIntakeSubmissions().find(function(s) { return s.id === id; });
    if (!sub) return;
    const target = document.getElementById('print-intake-target');
    if (!target) return;
    const pairs = Object.entries(sub.data || {}).map(function(e) {
      const val = (e[1] && typeof e[1] === 'string' && e[1].startsWith('data:image'))
        ? '<img src="' + e[1] + '" style="height:48px;border:1px solid #ddd">'
        : (e[1] === true || e[1] === 'true' ? 'Yes' : (e[1] || '&mdash;'));
      return '<div style="margin-bottom:10px"><dt style="font-weight:600;font-size:.85rem;color:#444">' + e[0] + '</dt><dd style="margin:3px 0 0 0;font-size:.9rem">' + val + '</dd></div>';
    }).join('');
    target.style.display = 'block';
    target.innerHTML = '<div style="font-family:serif;padding:32px;max-width:700px;margin:0 auto">'
      + '<h2 style="margin-bottom:4px">' + (sub.formName || 'Intake Form') + '</h2>'
      + '<p style="color:#555;font-size:.875rem;margin-bottom:16px">Patient: ' + (sub.patientName || '&mdash;') + ' &nbsp;|&nbsp; Submitted: ' + (sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '&mdash;') + ' &nbsp;|&nbsp; Signed: ' + (sub.signed ? 'Yes' : 'No') + '</p>'
      + '<hr style="margin-bottom:16px"><dl>' + pairs + '</dl></div>';
    window.print();
    setTimeout(function() { target.style.display = 'none'; target.innerHTML = ''; }, 1000);
  };

  window._revokeConsent = function(id) {
    if (!confirm('Revoke consent for this record?')) return;
    const subs = getIntakeSubmissions();
    const sub = subs.find(function(s) { return s.id === id; });
    if (sub) {
      sub.revoked = true;
      try { localStorage.setItem('ds_intake_submissions', JSON.stringify(subs)); } catch (_e) {}
    }
    showToast('Consent marked revoked in this browser view.', '#d97706');
    refreshContent();
  };

  window._filterConsent = function(status) {
    consentFilter = status;
    refreshContent();
  };

  window._filterSubmissions = function(q) {
    const tc = document.getElementById('intake-tab-content');
    if (tc) tc.innerHTML = renderSubmissionsTab(q);
  };

  // Initial render
  fullRender();
}
