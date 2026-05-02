// pgDataImport — Data Import & Migration wizard. Extracted from
// `pages-patient.js` on 2026-05-02 as part of the file-split refactor (see
// `pages-patient/_shared.js`). NO behavioural change: code below is the
// verbatim import block from the original file, with imports rewired.
//
// The import wizard is fully self-contained — no other patient page
// references its `_import*` / `_render*` helpers. External deps: `api`
// for the actual create-patient / log-session network calls, and
// `_hdEsc` for HTML escaping.
import { api } from '../api.js';
import { _hdEsc } from './_shared.js';

// ═══════════════════════════════════════════════════════════════════════════════
// pgDataImport — Data Import & Migration
// ═══════════════════════════════════════════════════════════════════════════════

// ── Import history store ──────────────────────────────────────────────────────
function getImportHistory() {
  try {
    const raw = localStorage.getItem('ds_import_history');
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  // Seed 3 sample records if empty
  const seed = [
    {
      id: 'imp_001', type: 'patients', fileName: 'patients_jan_2026.csv',
      rowCount: 42, successCount: 40, errorCount: 2, date: '2026-01-15T09:30:00Z',
      errors: [
        { row: 7, field: 'email', value: 'notanemail', message: 'Invalid email format' },
        { row: 23, field: 'dob', value: '13/45/1990', message: 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY' },
      ],
      status: 'partial',
    },
    {
      id: 'imp_002', type: 'sessions', fileName: 'sessions_q1_2026.csv',
      rowCount: 118, successCount: 118, errorCount: 0, date: '2026-02-01T14:10:00Z',
      errors: [], status: 'completed',
    },
    {
      id: 'imp_003', type: 'protocols', fileName: 'tms_protocol_bundle.json',
      rowCount: 5, successCount: 3, errorCount: 2, date: '2026-03-20T11:00:00Z',
      errors: [
        { row: 2, field: 'steps', value: '', message: 'steps array is required and must be non-empty' },
        { row: 4, field: 'modality', value: '', message: 'modality is required' },
      ],
      status: 'partial',
    },
  ];
  localStorage.setItem('ds_import_history', JSON.stringify(seed));
  return seed;
}

function saveImportRecord(record) {
  const history = getImportHistory();
  history.unshift(record);
  localStorage.setItem('ds_import_history', JSON.stringify(history));
}

// ── CSV parser utility ────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let cur = '';
  let inQuote = false;
  const chars = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let row = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];

    if (inQuote) {
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { row.push(cur.trim()); cur = ''; }
      else if (ch === '\n') {
        row.push(cur.trim());
        if (row.some(c => c !== '')) rows.push(row);
        row = []; cur = '';
      } else { cur += ch; }
    }
  }
  // Last cell/row
  row.push(cur.trim());
  if (row.some(c => c !== '')) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);
  return { headers, rows: dataRows };
}

function csvRowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
  return obj;
}

// ── Import schemas ────────────────────────────────────────────────────────────
const PATIENT_IMPORT_SCHEMA = {
  required: ['name', 'dob', 'condition'],
  optional: ['email', 'phone', 'clinician', 'notes', 'gender', 'address'],
  transformations: {
    name:      v => v.trim(),
    dob:       v => { const d = new Date(v); return isNaN(d) ? null : d.toISOString().split('T')[0]; },
    condition: v => v.toLowerCase().trim(),
  },
  validations: {
    name:  v => v.length >= 2 || 'Name must be at least 2 characters',
    dob:   v => v !== null || 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY',
    email: v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Invalid email format',
  },
};

const SESSION_IMPORT_SCHEMA = {
  required: ['patientName', 'date', 'modality', 'duration'],
  optional: ['amplitude', 'frequency', 'notes', 'outcome'],
  transformations: {
    patientName: v => v.trim(),
    date:        v => { const d = new Date(v); return isNaN(d) ? null : d.toISOString().split('T')[0]; },
    modality:    v => v.trim(),
    duration:    v => parseInt(v, 10) || 0,
  },
  validations: {
    patientName: v => v.length >= 2 || 'Patient name must be at least 2 characters',
    date:        v => v !== null || 'Invalid date format. Use YYYY-MM-DD or MM/DD/YYYY',
    modality:    v => v.length > 0 || 'Modality is required',
    duration:    v => v > 0 || 'Duration must be a positive number',
  },
};

// ── Column mapping engine ─────────────────────────────────────────────────────
function autoMapColumns(csvHeaders, schemaFields) {
  const mappings = {};
  const SYNONYMS = {
    name:        ['patient name', 'full name', 'patient', 'name', 'client name'],
    dob:         ['date of birth', 'dob', 'birth date', 'birthday'],
    condition:   ['condition', 'diagnosis', 'primary diagnosis', 'disorder'],
    email:       ['email', 'email address', 'e-mail'],
    phone:       ['phone', 'telephone', 'mobile', 'cell', 'phone number'],
    patientName: ['patient name', 'patient', 'full name', 'client name'],
    date:        ['date', 'session date', 'appointment date', 'dos'],
    modality:    ['modality', 'treatment type', 'treatment', 'therapy type'],
    duration:    ['duration', 'session length', 'minutes', 'length'],
    amplitude:   ['amplitude', 'intensity', 'ma', 'milliamps'],
    frequency:   ['frequency', 'hz', 'freq'],
    notes:       ['notes', 'note', 'comments', 'remarks'],
    outcome:     ['outcome', 'result', 'response'],
    clinician:   ['clinician', 'provider', 'doctor', 'therapist', 'practitioner'],
    gender:      ['gender', 'sex'],
    address:     ['address', 'street address', 'location'],
  };
  csvHeaders.forEach(header => {
    const h = header.toLowerCase().trim();
    for (const [field, synonyms] of Object.entries(SYNONYMS)) {
      if (!schemaFields.includes(field)) continue;
      if (synonyms.includes(h)) { mappings[field] = header; break; }
    }
  });
  return mappings;
}

// ── Internal state for wizard ─────────────────────────────────────────────────
const _importState = {
  patients: { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false },
  sessions: { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false },
  protocol: { step: 1, jsonData: null, fileName: '', pasteText: '' },
};

// ── Sample CSV generators ─────────────────────────────────────────────────────
window._importDownloadSample = function(type) {
  let csv = '';
  if (type === 'patients') {
    csv = 'name,dob,condition,email,phone,clinician,notes,gender,address\n' +
      'Alice Johnson,1985-03-12,depression,alice@example.com,555-1234,Dr. Smith,"Initial intake notes",Female,"123 Main St"\n' +
      'Bob Martinez,1972-07-22,anxiety,bob@example.com,555-5678,Dr. Lee,"Referred by GP",Male,"456 Oak Ave"\n' +
      'Carol White,1990-11-05,tinnitus,,,Dr. Smith,,Female,';
  } else if (type === 'sessions') {
    csv = 'patientName,date,modality,duration,amplitude,frequency,notes,outcome\n' +
      'Alice Johnson,2026-01-10,TMS,30,120,10,"Standard session","Good response"\n' +
      'Bob Martinez,2026-01-12,tDCS,20,2,,,""\n' +
      'Carol White,2026-01-15,Neurofeedback,45,,,,Improved focus';
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sample_' + type + '.csv'; a.click();
  URL.revokeObjectURL(url);
};

// ── Validation helpers ────────────────────────────────────────────────────────
function _validateAndTransformRow(rowObj, schema) {
  const errors = [];
  const transformed = {};
  const allFields = [...schema.required, ...schema.optional];
  allFields.forEach(field => {
    let val = rowObj[field] ?? '';
    if (schema.transformations && schema.transformations[field]) {
      val = schema.transformations[field](val);
    }
    transformed[field] = val;
    if (schema.validations && schema.validations[field]) {
      const result = schema.validations[field](val);
      if (result !== true) errors.push({ field, value: rowObj[field] ?? '', message: result });
    } else if (schema.required.includes(field) && !val) {
      errors.push({ field, value: '', message: field + ' is required' });
    }
  });
  return { transformed, errors };
}

function _applyMappings(csvRow, headers, mappings, schema) {
  const allFields = [...schema.required, ...schema.optional];
  const obj = {};
  allFields.forEach(field => {
    const csvCol = mappings[field];
    if (csvCol) {
      const idx = headers.indexOf(csvCol);
      obj[field] = idx >= 0 ? (csvRow[idx] ?? '') : '';
    } else {
      obj[field] = '';
    }
  });
  return obj;
}

// ── Step bar renderer ─────────────────────────────────────────────────────────
function _renderStepBar(currentStep, steps) {
  return '<div class="import-step-bar">' + steps.map((s, i) => {
    const n = i + 1;
    let cls = 'import-step';
    if (n < currentStep) cls += ' done';
    else if (n === currentStep) cls += ' active';
    const prefix = n === currentStep ? '● ' : n < currentStep ? '✓ ' : '';
    return '<div class="' + cls + '">' + prefix + s + '</div>';
  }).join('') + '</div>';
}

// ── Tab renderer ──────────────────────────────────────────────────────────────
function _renderImportTabs(activeTab) {
  const tabs = [
    { id: 'patients', label: '📄 Patient CSV' },
    { id: 'sessions', label: '🗓 Session CSV' },
    { id: 'protocol', label: '📋 Protocol JSON' },
    { id: 'history',  label: '🕒 Import History' },
  ];
  return '<div class="tab-row" style="margin-bottom:20px">' + tabs.map(t =>
    '<button class="tab-btn' + (activeTab === t.id ? ' active' : '') + '" onclick="window._importSwitchTab(\'' + t.id + '\')">' + t.label + '</button>'
  ).join('') + '</div>';
}

// ── Patient CSV import wizard steps ──────────────────────────────────────────
function _renderPatientStep1() {
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(1, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <h3 style="margin-bottom:4px">Upload Patient CSV</h3>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">Accepted formats: .csv, .txt — max 10,000 rows</p>
      <div class="import-dropzone" id="patient-dropzone"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');window._importHandleFile('patients',event.dataTransfer.files[0])">
        <div class="import-dropzone-icon">📥</div>
        <div style="font-weight:600;margin-bottom:6px">Drag &amp; drop your CSV here</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px">or click to browse</div>
        <input type="file" id="patient-file-input" accept=".csv,.txt" style="display:none" onchange="window._importHandleFile('patients',this.files[0])">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('patient-file-input').click()">Browse Files</button>
      </div>
      <div style="margin-top:16px;display:flex;align-items:center;gap:12px">
        <span style="font-size:.8rem;color:var(--text-muted)">Need a template?</span>
        <button class="btn btn-ghost btn-sm" onclick="window._importDownloadSample('patients')">&#8595; Download Sample CSV</button>
      </div>
    </div>`;
}

function _renderPatientStep2(state) {
  const { csvData, mappings } = state;
  const schema = PATIENT_IMPORT_SCHEMA;
  const allFields = [...schema.required, ...schema.optional];
  const rowsHtml = allFields.map(field => {
    const isReq = schema.required.includes(field);
    const cur = mappings[field] || '';
    const unmapped = isReq && !cur;
    const sampleVals = cur ? csvData.rows.slice(0, 3).map(r => {
      const idx = csvData.headers.indexOf(cur);
      return idx >= 0 ? (r[idx] || '—') : '—';
    }).join(', ') : '—';
    const reqStar = isReq ? '<span class="mapping-required">*</span> ' : '';
    const labelStyle = unmapped ? 'color:#ef4444;font-weight:700' : '';
    const borderColor = unmapped ? '#ef4444' : 'var(--border)';
    const opts = csvData.headers.map(h => '<option value="' + _hdEsc(h) + '"' + (cur === h ? ' selected' : '') + '>' + _hdEsc(h) + '</option>').join('');
    return '<tr>' +
      '<td><span style="' + labelStyle + '">' + reqStar + field + '</span></td>' +
      '<td><select style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid ' + borderColor + ';background:var(--input-bg);color:var(--text)" onchange="window._importSetMapping(\'patients\',\'' + field + '\',this.value)">' +
        '<option value="">— not mapped —</option>' + opts +
      '</select></td>' +
      '<td style="color:var(--text-muted);font-size:.8rem">' + _hdEsc(sampleVals) + '</td>' +
    '</tr>';
  }).join('');
  return `
    <div class="card" style="max-width:860px;margin:0 auto">
      ${_renderStepBar(2, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h3 style="margin-bottom:2px">Map Columns</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">${csvData.rows.length} rows &middot; ${csvData.headers.length} columns detected</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importReset('patients')">Reset Mapping</button>
          <button class="btn btn-primary btn-sm" onclick="window._importValidate('patients')">Validate &rarr;</button>
        </div>
      </div>
      <table class="mapping-table">
        <thead><tr><th>Schema Field</th><th>CSV Column</th><th>Sample Values</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function _renderPatientStep3(state) {
  const { validRows, errorRows, skipInvalid } = state;
  const schema = PATIENT_IMPORT_SCHEMA;
  const allFields = [...schema.required, ...schema.optional];
  const previewRows = [...validRows, ...errorRows].slice(0, 10).sort((a, b) => a._rowIndex - b._rowIndex);
  const ths = allFields.map(f => '<th>' + f + '</th>').join('');
  const trs = previewRows.map(r => {
    const hasErr = r._errors && r._errors.length > 0;
    const tds = allFields.map(f => '<td>' + _hdEsc(r[f] ?? '') + '</td>').join('');
    const status = hasErr
      ? '<span style="color:#ef4444;font-size:.75rem">' + r._errors.map(e => _hdEsc(e.message)).join('; ') + '</span>'
      : '<span style="color:#10b981">&#10003;</span>';
    return '<tr class="' + (hasErr ? 'import-row-error' : '') + '"><td>' + (r._rowIndex + 1) + '</td>' + tds + '<td>' + status + '</td></tr>';
  }).join('');
  const errSummary = errorRows.length > 0 ? `
    <div style="background:#fee2e2;border-radius:8px;padding:12px;margin-top:12px">
      <strong style="color:#b91c1c">&#9888; ${errorRows.length} row${errorRows.length > 1 ? 's' : ''} have errors</strong>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;font-size:.85rem">
        <input type="checkbox" ${skipInvalid ? 'checked' : ''} onchange="window._importToggleSkip('patients',this.checked)">
        Skip invalid rows and import ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''}
      </label>
      <p style="font-size:.78rem;color:#7f1d1d;margin-top:6px">To fix errors manually, correct your CSV and re-upload.</p>
    </div>` : '';
  const canImport = skipInvalid ? validRows.length > 0 : (validRows.length > 0 || errorRows.length === 0);
  return `
    <div class="card" style="max-width:900px;margin:0 auto">
      ${_renderStepBar(3, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h3 style="margin-bottom:2px">Preview &amp; Validation</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">
            <span style="color:#10b981;font-weight:600">${validRows.length} valid</span>
            ${errorRows.length > 0 ? ' &middot; <span style="color:#ef4444;font-weight:600">' + errorRows.length + ' errors</span>' : ''}
            (showing first 10 rows)
          </p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importGoBack('patients')">&larr; Back</button>
          <button class="btn btn-primary btn-sm" ${canImport ? '' : 'disabled'} onclick="window._importExecutePatients()">Import Now</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table class="import-preview-table">
        <thead><tr><th>#</th>${ths}<th>Status</th></tr></thead>
        <tbody>${trs}</tbody>
      </table></div>
      ${errSummary}
    </div>`;
}

function _renderPatientStep4(result) {
  const errTable = result.errors && result.errors.length > 0 ? `
    <div style="overflow-x:auto;margin-top:12px"><table class="import-preview-table">
      <thead><tr><th>Row</th><th>Field</th><th>Value</th><th>Error</th></tr></thead>
      <tbody>${result.errors.map(e => '<tr class="import-row-error"><td>' + e.row + '</td><td>' + _hdEsc(e.field) + '</td><td>' + _hdEsc(e.value) + '</td><td>' + _hdEsc(e.message) + '</td></tr>').join('')}</tbody>
    </table></div>
    <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="window._importDownloadErrors('${result.importId}')">&#8595; Download Error Report</button>` : '';
  const icon = result.errors && result.errors.length === 0 ? '✅' : '⚠️';
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(4, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:3rem;margin-bottom:8px">${icon}</div>
        <h3>Import Complete</h3>
        <p style="font-size:1rem;margin-top:4px">
          <strong style="color:#10b981">${result.successCount} patient${result.successCount !== 1 ? 's' : ''} imported successfully.</strong>
          ${result.errors && result.errors.length > 0 ? '<br><span style="color:#ef4444">' + result.errors.length + ' error' + (result.errors.length !== 1 ? 's' : '') + ' skipped.</span>' : ''}
        </p>
      </div>
      ${errTable}
      <div style="display:flex;gap:8px;margin-top:20px;justify-content:center">
        <button class="btn btn-secondary" onclick="window._importReset('patients')">Import More</button>
        <button class="btn btn-primary" onclick="window._nav('patients')">View Patients</button>
      </div>
    </div>`;
}

// ── Session CSV wizard steps ──────────────────────────────────────────────────
function _renderSessionStep1() {
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(1, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <h3 style="margin-bottom:4px">Upload Session CSV</h3>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">Required fields: patientName, date, modality, duration</p>
      <div class="import-dropzone" id="session-dropzone"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');window._importHandleFile('sessions',event.dataTransfer.files[0])">
        <div class="import-dropzone-icon">📥</div>
        <div style="font-weight:600;margin-bottom:6px">Drag &amp; drop your CSV here</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px">or click to browse</div>
        <input type="file" id="session-file-input" accept=".csv,.txt" style="display:none" onchange="window._importHandleFile('sessions',this.files[0])">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('session-file-input').click()">Browse Files</button>
      </div>
      <div style="margin-top:16px;display:flex;align-items:center;gap:12px">
        <span style="font-size:.8rem;color:var(--text-muted)">Need a template?</span>
        <button class="btn btn-ghost btn-sm" onclick="window._importDownloadSample('sessions')">&#8595; Download Sample CSV</button>
      </div>
    </div>`;
}

function _renderSessionStep2(state) {
  const { csvData, mappings } = state;
  const schema = SESSION_IMPORT_SCHEMA;
  const allFields = [...schema.required, ...schema.optional];
  const rowsHtml = allFields.map(field => {
    const isReq = schema.required.includes(field);
    const cur = mappings[field] || '';
    const unmapped = isReq && !cur;
    const sampleVals = cur ? csvData.rows.slice(0, 3).map(r => {
      const idx = csvData.headers.indexOf(cur);
      return idx >= 0 ? (r[idx] || '—') : '—';
    }).join(', ') : '—';
    const reqStar = isReq ? '<span class="mapping-required">*</span> ' : '';
    const labelStyle = unmapped ? 'color:#ef4444;font-weight:700' : '';
    const borderColor = unmapped ? '#ef4444' : 'var(--border)';
    const opts = csvData.headers.map(h => '<option value="' + _hdEsc(h) + '"' + (cur === h ? ' selected' : '') + '>' + _hdEsc(h) + '</option>').join('');
    return '<tr>' +
      '<td><span style="' + labelStyle + '">' + reqStar + field + '</span></td>' +
      '<td><select style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid ' + borderColor + ';background:var(--input-bg);color:var(--text)" onchange="window._importSetMapping(\'sessions\',\'' + field + '\',this.value)">' +
        '<option value="">— not mapped —</option>' + opts +
      '</select></td>' +
      '<td style="color:var(--text-muted);font-size:.8rem">' + _hdEsc(sampleVals) + '</td>' +
    '</tr>';
  }).join('');
  return `
    <div class="card" style="max-width:860px;margin:0 auto">
      ${_renderStepBar(2, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h3 style="margin-bottom:2px">Map Columns</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">${csvData.rows.length} rows &middot; ${csvData.headers.length} columns detected</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importReset('sessions')">Reset Mapping</button>
          <button class="btn btn-primary btn-sm" onclick="window._importValidate('sessions')">Validate &rarr;</button>
        </div>
      </div>
      <table class="mapping-table">
        <thead><tr><th>Schema Field</th><th>CSV Column</th><th>Sample Values</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
}

function _renderSessionStep3(state) {
  const { validRows, errorRows, skipInvalid } = state;
  const schema = SESSION_IMPORT_SCHEMA;
  const allFields = [...schema.required, ...schema.optional];
  const previewRows = [...validRows, ...errorRows].slice(0, 10).sort((a, b) => a._rowIndex - b._rowIndex);
  const ths = allFields.map(f => '<th>' + f + '</th>').join('');
  const trs = previewRows.map(r => {
    const hasErr = r._errors && r._errors.length > 0;
    const tds = allFields.map(f => '<td>' + _hdEsc(r[f] ?? '') + '</td>').join('');
    const status = hasErr
      ? '<span style="color:#ef4444;font-size:.75rem">' + r._errors.map(e => _hdEsc(e.message)).join('; ') + '</span>'
      : '<span style="color:#10b981">&#10003;</span>';
    return '<tr class="' + (hasErr ? 'import-row-error' : '') + '"><td>' + (r._rowIndex + 1) + '</td>' + tds + '<td>' + status + '</td></tr>';
  }).join('');
  const errSummary = errorRows.length > 0 ? `
    <div style="background:#fee2e2;border-radius:8px;padding:12px;margin-top:12px">
      <strong style="color:#b91c1c">&#9888; ${errorRows.length} row${errorRows.length > 1 ? 's' : ''} have errors</strong>
      <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;font-size:.85rem">
        <input type="checkbox" ${skipInvalid ? 'checked' : ''} onchange="window._importToggleSkip('sessions',this.checked)">
        Skip invalid rows and import ${validRows.length} valid row${validRows.length !== 1 ? 's' : ''}
      </label>
    </div>` : '';
  return `
    <div class="card" style="max-width:900px;margin:0 auto">
      ${_renderStepBar(3, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <h3 style="margin-bottom:2px">Preview &amp; Validation</h3>
          <p style="font-size:.82rem;color:var(--text-muted)">
            <span style="color:#10b981;font-weight:600">${validRows.length} valid</span>
            ${errorRows.length > 0 ? ' &middot; <span style="color:#ef4444;font-weight:600">' + errorRows.length + ' errors</span>' : ''}
          </p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importGoBack('sessions')">&larr; Back</button>
          <button class="btn btn-primary btn-sm" onclick="window._importExecuteSessions()">Import Now</button>
        </div>
      </div>
      <div style="overflow-x:auto"><table class="import-preview-table">
        <thead><tr><th>#</th>${ths}<th>Status</th></tr></thead>
        <tbody>${trs}</tbody>
      </table></div>
      ${errSummary}
    </div>`;
}

function _renderSessionStep4(result) {
  const icon = result.errors && result.errors.length === 0 ? '✅' : '⚠️';
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(4, ['Upload', 'Map Columns', 'Preview & Validate', 'Results'])}
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:3rem;margin-bottom:8px">${icon}</div>
        <h3>Import Complete</h3>
        <p style="font-size:1rem;margin-top:4px">
          <strong style="color:#10b981">${result.successCount} session${result.successCount !== 1 ? 's' : ''} imported successfully.</strong>
          ${result.errors && result.errors.length > 0 ? '<br><span style="color:#ef4444">' + result.errors.length + ' error' + (result.errors.length !== 1 ? 's' : '') + ' skipped.</span>' : ''}
        </p>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px;justify-content:center">
        <button class="btn btn-secondary" onclick="window._importReset('sessions')">Import More</button>
      </div>
    </div>`;
}

// ── Protocol JSON wizard steps ────────────────────────────────────────────────
function _renderProtocolStep1() {
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(1, ['Upload', 'Preview', 'Result'])}
      <h3 style="margin-bottom:4px">Import Protocol JSON</h3>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">Required fields: name, modality, steps (array). Accepted: .json</p>
      <div class="import-dropzone" id="protocol-dropzone"
        ondragover="event.preventDefault();this.classList.add('drag-over')"
        ondragleave="this.classList.remove('drag-over')"
        ondrop="event.preventDefault();this.classList.remove('drag-over');window._importHandleFile('protocol',event.dataTransfer.files[0])">
        <div class="import-dropzone-icon">📋</div>
        <div style="font-weight:600;margin-bottom:6px">Drag &amp; drop JSON file here</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:14px">or click to browse</div>
        <input type="file" id="protocol-file-input" accept=".json" style="display:none" onchange="window._importHandleFile('protocol',this.files[0])">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('protocol-file-input').click()">Browse Files</button>
      </div>
      <div style="margin-top:20px">
        <div style="font-size:.85rem;font-weight:600;margin-bottom:6px;color:var(--text-muted)">— or paste JSON —</div>
        <textarea id="protocol-paste-area" rows="8" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-family:monospace;font-size:.8rem;resize:vertical" placeholder='{"name":"TMS Protocol","modality":"TMS","steps":[]}'></textarea>
        <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="window._importProtocolFromPaste()">Parse &amp; Preview &rarr;</button>
      </div>
    </div>`;
}

function _renderProtocolStep2(state) {
  const p = state.jsonData;
  const stepsHtml = Array.isArray(p.steps) ? p.steps.map((s, i) =>
    '<div style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;font-size:.85rem"><strong>Step ' + (i + 1) + ':</strong> ' + _hdEsc(s.label || s.name || JSON.stringify(s)) + '</div>'
  ).join('') : '<p style="color:#ef4444">No steps array found.</p>';
  return `
    <div class="card" style="max-width:700px;margin:0 auto">
      ${_renderStepBar(2, ['Upload', 'Preview', 'Result'])}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3>Protocol Preview</h3>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="window._importReset('protocol')">&larr; Back</button>
          <button class="btn btn-primary btn-sm" onclick="window._importExecuteProtocol()">Import Protocol</button>
        </div>
      </div>
      <div style="background:var(--surface);border-radius:8px;padding:16px;margin-bottom:12px">
        <div style="font-size:.78rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">Protocol Name</div>
        <div style="font-weight:700;font-size:1.1rem">${_hdEsc(p.name || '—')}</div>
        <div style="display:flex;gap:20px;margin-top:10px;font-size:.85rem">
          <div><span style="color:var(--text-muted)">Modality: </span><strong>${_hdEsc(p.modality || '—')}</strong></div>
          <div><span style="color:var(--text-muted)">Steps: </span><strong>${Array.isArray(p.steps) ? p.steps.length : 0}</strong></div>
          ${p.description ? '<div><span style="color:var(--text-muted)">Description: </span>' + _hdEsc(p.description) + '</div>' : ''}
        </div>
      </div>
      <div style="font-size:.82rem;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase">Steps</div>
      ${stepsHtml}
    </div>`;
}

function _renderProtocolStep3(result) {
  return `
    <div class="card" style="max-width:640px;margin:0 auto">
      ${_renderStepBar(3, ['Upload', 'Preview', 'Result'])}
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:3rem;margin-bottom:8px">${result.ok ? '✅' : '❌'}</div>
        <h3>${result.ok ? 'Protocol Imported' : 'Import Failed'}</h3>
        <p style="font-size:.95rem;margin-top:4px;color:${result.ok ? '#10b981' : '#ef4444'}">${_hdEsc(result.message)}</p>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
        <button class="btn btn-secondary" onclick="window._importReset('protocol')">Import Another</button>
      </div>
    </div>`;
}

// ── Import History tab ────────────────────────────────────────────────────────
function _renderImportHistoryTab() {
  const history = getImportHistory();
  function statusBadge(s) {
    if (s === 'completed') return '<span class="badge" style="background:#0d9488;color:#fff">Completed</span>';
    if (s === 'partial')   return '<span class="badge" style="background:#d97706;color:#fff">Partial</span>';
    return '<span class="badge" style="background:#dc2626;color:#fff">Failed</span>';
  }
  const rows = history.length === 0
    ? '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">No import history</td></tr>'
    : history.map(r => {
        const detailRows = r.errors.length > 0
          ? '<table style="width:100%;font-size:.8rem;border-collapse:collapse"><thead><tr style="color:var(--text-muted)"><th style="text-align:left;padding:4px 8px">Row</th><th style="text-align:left;padding:4px 8px">Field</th><th style="text-align:left;padding:4px 8px">Value</th><th style="text-align:left;padding:4px 8px">Error</th></tr></thead><tbody>' +
            r.errors.map(e => '<tr><td style="padding:4px 8px">' + e.row + '</td><td style="padding:4px 8px">' + e.field + '</td><td style="padding:4px 8px">' + e.value + '</td><td style="padding:4px 8px;color:#ef4444">' + e.message + '</td></tr>').join('') +
            '</tbody></table>'
          : '<span style="color:var(--text-muted);font-size:.85rem">No errors in this import.</span>';
        return '<tr class="import-history-row" style="cursor:pointer" onclick="window._importToggleHistoryDetail(\'' + r.id + '\')">' +
          '<td><span style="font-size:.75rem;text-transform:uppercase;font-weight:600;color:var(--text-muted)">' + r.type + '</span></td>' +
          '<td>' + r.fileName + '</td>' +
          '<td style="font-size:.8rem;color:var(--text-muted)">' + new Date(r.date).toLocaleDateString() + '</td>' +
          '<td style="text-align:center">' + r.rowCount + '</td>' +
          '<td style="text-align:center;color:#10b981;font-weight:600">' + r.successCount + '</td>' +
          '<td style="text-align:center;color:' + (r.errorCount > 0 ? '#ef4444' : 'var(--text-muted)') + '">' + r.errorCount + '</td>' +
          '<td>' + statusBadge(r.status) + '</td>' +
          '<td style="font-size:.75rem;color:var(--text-muted)">' + (r.errors.length > 0 ? '&#9660; Details' : '') + '</td>' +
        '</tr>' +
        '<tr id="hist-detail-' + r.id + '" style="display:none"><td colspan="8" style="padding:8px 16px;background:var(--surface)">' +
          detailRows +
          '<br><button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="window._importDownloadErrors(\'' + r.id + '\')">&#8595; Download Error Report</button>' +
        '</td></tr>';
      }).join('');
  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3>Import History</h3>
        <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="window._importClearHistory()">Clear History</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="font-size:.75rem;text-transform:uppercase;color:var(--text-muted)">
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)">Type</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)">File</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)">Date</th>
            <th style="text-align:center;padding:8px 12px;border-bottom:2px solid var(--border)">Rows</th>
            <th style="text-align:center;padding:8px 12px;border-bottom:2px solid var(--border)">Success</th>
            <th style="text-align:center;padding:8px 12px;border-bottom:2px solid var(--border)">Errors</th>
            <th style="text-align:left;padding:8px 12px;border-bottom:2px solid var(--border)">Status</th>
            <th style="padding:8px 12px;border-bottom:2px solid var(--border)"></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ── Main page renderer ────────────────────────────────────────────────────────
function _renderImportPage(activeTab) {
  const el = document.getElementById('content');
  if (!el) return;
  let tabContent = '';
  if (activeTab === 'patients') {
    const s = _importState.patients;
    if (s.step === 1) tabContent = _renderPatientStep1();
    else if (s.step === 2) tabContent = _renderPatientStep2(s);
    else if (s.step === 3) tabContent = _renderPatientStep3(s);
    else tabContent = _renderPatientStep4(s.result || { successCount: 0, errors: [], importId: '' });
  } else if (activeTab === 'sessions') {
    const s = _importState.sessions;
    if (s.step === 1) tabContent = _renderSessionStep1();
    else if (s.step === 2) tabContent = _renderSessionStep2(s);
    else if (s.step === 3) tabContent = _renderSessionStep3(s);
    else tabContent = _renderSessionStep4(s.result || { successCount: 0, errors: [] });
  } else if (activeTab === 'protocol') {
    const s = _importState.protocol;
    if (s.step === 1) tabContent = _renderProtocolStep1();
    else if (s.step === 2) tabContent = _renderProtocolStep2(s);
    else tabContent = _renderProtocolStep3(s.result || { ok: false, message: '' });
  } else if (activeTab === 'history') {
    tabContent = _renderImportHistoryTab();
  }
  el.innerHTML = '<div style="max-width:1000px;margin:0 auto;padding:0 16px 40px">' +
    _renderImportTabs(activeTab) + tabContent + '</div>';
  window._currentImportTab = activeTab;
}

// ── Global handlers ───────────────────────────────────────────────────────────
window._importSwitchTab = function(tab) { _renderImportPage(tab); };

window._importHandleFile = function(type, file) {
  if (!file) return;
  // Client-side size guard: backend rejects >100MB but giving the user
  // immediate, specific feedback is much friendlier than waiting for the
  // upload to fail with a generic 413. Closes ISSUE-AUDIT-027.
  const MAX_BYTES = 100 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    window._showToast?.(`File is too large (${Math.round(file.size / 1024 / 1024)} MB). Maximum is 100 MB.`, 'error');
    return;
  }
  if (type === 'protocol') {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target.result);
        _importState.protocol.jsonData = json;
        _importState.protocol.fileName = file.name;
        _importState.protocol.step = 2;
        _renderImportPage('protocol');
      } catch (_err) {
        window._showToast?.('Invalid JSON file. Please check the file and try again.', 'error');
      }
    };
    reader.readAsText(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseCSV(e.target.result);
    const state = _importState[type];
    const schema = type === 'patients' ? PATIENT_IMPORT_SCHEMA : SESSION_IMPORT_SCHEMA;
    state.csvData = parsed;
    state.fileName = file.name;
    state.step = 2;
    state.mappings = autoMapColumns(parsed.headers, [...schema.required, ...schema.optional]);
    _renderImportPage(type === 'patients' ? 'patients' : 'sessions');
  };
  reader.readAsText(file);
};

window._importSetMapping = function(type, field, csvCol) {
  _importState[type].mappings[field] = csvCol;
};

window._importReset = function(type) {
  if (type === 'protocol') {
    _importState.protocol = { step: 1, jsonData: null, fileName: '', pasteText: '' };
    _renderImportPage('protocol');
  } else {
    _importState[type] = { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false };
    _renderImportPage(type === 'patients' ? 'patients' : 'sessions');
  }
};

window._importGoBack = function(type) {
  _importState[type].step = 2;
  _renderImportPage(type === 'patients' ? 'patients' : 'sessions');
};

window._importToggleSkip = function(type, val) {
  _importState[type].skipInvalid = val;
};

window._importValidate = function(type) {
  const state = _importState[type];
  const schema = type === 'patients' ? PATIENT_IMPORT_SCHEMA : SESSION_IMPORT_SCHEMA;
  const { csvData, mappings } = state;
  if (!csvData) return;
  const missingRequired = schema.required.filter(f => !mappings[f]);
  if (missingRequired.length > 0) {
    window._showToast?.('Please map required fields: ' + missingRequired.join(', '), 'warning');
    return;
  }
  const validRows = [];
  const errorRows = [];
  csvData.rows.forEach((row, idx) => {
    const rawObj = _applyMappings(row, csvData.headers, mappings, schema);
    const { transformed, errors } = _validateAndTransformRow(rawObj, schema);
    transformed._rowIndex = idx;
    transformed._errors = errors;
    if (errors.length === 0) validRows.push(transformed);
    else errorRows.push(transformed);
  });
  state.validRows = validRows;
  state.errorRows = errorRows;
  state.step = 3;
  _renderImportPage(type === 'patients' ? 'patients' : 'sessions');
};

window._importExecutePatients = async function() {
  const state = _importState.patients;
  const rowsToImport = state.skipInvalid ? state.validRows : state.validRows;
  const errors = [];
  let successCount = 0;
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = '<div style="max-width:500px;margin:60px auto;text-align:center">' +
      '<h3>Importing patients\u2026</h3>' +
      '<div class="import-progress" style="margin:16px 0"><div class="import-progress-fill" id="import-prog-fill" style="width:0%"></div></div>' +
      '<div id="import-prog-label" style="font-size:.85rem;color:var(--text-muted)">0 / ' + rowsToImport.length + '</div>' +
      '</div>';
  }
  const fill = document.getElementById('import-prog-fill');
  const lbl  = document.getElementById('import-prog-label');
  for (let i = 0; i < rowsToImport.length; i++) {
    const row = rowsToImport[i];
    try {
      let saved = false;
      try {
        await api.createPatient({ name: row.name, dob: row.dob, condition: row.condition, email: row.email, phone: row.phone, clinician: row.clinician, notes: row.notes, gender: row.gender, address: row.address });
        saved = true;
      } catch (_apiErr) {
        const patients = JSON.parse(localStorage.getItem('ds_patients') || '[]');
        patients.push({ id: 'pat_' + Date.now() + '_' + i, ...row, createdAt: new Date().toISOString() });
        localStorage.setItem('ds_patients', JSON.stringify(patients));
        saved = true;
      }
      if (saved) successCount++;
    } catch (err) {
      errors.push({ row: (row._rowIndex || i) + 1, field: 'general', value: '', message: String(err) });
    }
    if (fill) fill.style.width = Math.round(((i + 1) / rowsToImport.length) * 100) + '%';
    if (lbl)  lbl.textContent = (i + 1) + ' / ' + rowsToImport.length;
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const importId = 'imp_' + Date.now();
  saveImportRecord({
    id: importId, type: 'patients', fileName: state.fileName,
    rowCount: rowsToImport.length, successCount, errorCount: errors.length,
    date: new Date().toISOString(), errors: errors.slice(0, 50),
    status: errors.length === 0 ? 'completed' : successCount === 0 ? 'failed' : 'partial',
  });
  state.result = { successCount, errors, importId };
  state.step = 4;
  _renderImportPage('patients');
};

window._importExecuteSessions = async function() {
  const state = _importState.sessions;
  const rowsToImport = state.skipInvalid ? state.validRows : state.validRows;
  let successCount = 0;
  const errors = [];
  for (let i = 0; i < rowsToImport.length; i++) {
    const row = rowsToImport[i];
    try {
      try {
        await api.logSession({ patientName: row.patientName, date: row.date, modality: row.modality, duration: row.duration, amplitude: row.amplitude, frequency: row.frequency, notes: row.notes, outcome: row.outcome });
      } catch (_apiErr) {
        const sessions = JSON.parse(localStorage.getItem('ds_sessions') || '[]');
        sessions.push({ id: 'sess_' + Date.now() + '_' + i, ...row, createdAt: new Date().toISOString() });
        localStorage.setItem('ds_sessions', JSON.stringify(sessions));
      }
      successCount++;
    } catch (err) {
      errors.push({ row: (row._rowIndex || i) + 1, field: 'general', value: '', message: String(err) });
    }
    if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }
  saveImportRecord({
    id: 'imp_' + Date.now(), type: 'sessions', fileName: state.fileName,
    rowCount: rowsToImport.length, successCount, errorCount: errors.length,
    date: new Date().toISOString(), errors: errors.slice(0, 50),
    status: errors.length === 0 ? 'completed' : successCount === 0 ? 'failed' : 'partial',
  });
  state.result = { successCount, errors };
  state.step = 4;
  _renderImportPage('sessions');
};

window._importProtocolFromPaste = function() {
  const ta = document.getElementById('protocol-paste-area');
  if (!ta || !ta.value.trim()) { window._showToast?.('Please paste valid JSON first.', 'warning'); return; }
  try {
    const json = JSON.parse(ta.value.trim());
    _importState.protocol.jsonData = json;
    _importState.protocol.fileName = 'pasted-json';
    _importState.protocol.step = 2;
    _renderImportPage('protocol');
  } catch (_err) {
    window._showToast?.('Invalid JSON. Please check the syntax and try again.', 'error');
  }
};

window._importExecuteProtocol = function() {
  const state = _importState.protocol;
  const p = state.jsonData;
  const errs = [];
  if (!p || !p.name) errs.push('name is required');
  if (!p || !p.modality) errs.push('modality is required');
  if (!p || !Array.isArray(p.steps) || p.steps.length === 0) errs.push('steps array is required and must be non-empty');
  if (errs.length > 0) {
    state.result = { ok: false, message: errs.join('; ') };
    state.step = 3;
    _renderImportPage('protocol');
    return;
  }
  const protocols = JSON.parse(localStorage.getItem('ds_protocols') || '[]');
  protocols.push({ id: 'proto_' + Date.now(), ...p, importedAt: new Date().toISOString() });
  localStorage.setItem('ds_protocols', JSON.stringify(protocols));
  saveImportRecord({
    id: 'imp_' + Date.now(), type: 'protocols', fileName: state.fileName,
    rowCount: 1, successCount: 1, errorCount: 0,
    date: new Date().toISOString(), errors: [], status: 'completed',
  });
  state.result = { ok: true, message: 'Protocol "' + p.name + '" imported successfully with ' + p.steps.length + ' steps.' };
  state.step = 3;
  _renderImportPage('protocol');
};

window._importDownloadErrors = function(importId) {
  const history = getImportHistory();
  const record = history.find(r => r.id === importId);
  if (!record || record.errors.length === 0) { window._showToast?.('No errors to download.', 'info'); return; }
  const header = 'row,field,value,error\n';
  const body = record.errors.map(e =>
    e.row + ',"' + e.field + '","' + String(e.value).replace(/"/g, '""') + '","' + e.message.replace(/"/g, '""') + '"'
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'errors_' + (record.fileName || importId) + '.csv'; a.click();
  URL.revokeObjectURL(url);
};

window._importToggleHistoryDetail = function(id) {
  const row = document.getElementById('hist-detail-' + id);
  if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
};

window._importClearHistory = function() {
  if (!confirm('Clear all import history? This cannot be undone.')) return;
  localStorage.removeItem('ds_import_history');
  _renderImportPage('history');
};

// ── Exported page entry point ─────────────────────────────────────────────────
export async function pgDataImport(setTopbar) {
  setTopbar('Data Import &amp; Migration', '<button class="btn btn-ghost btn-sm" onclick="window._importSwitchTab(\'history\')">🕒 History</button>');
  _importState.patients = { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false };
  _importState.sessions = { step: 1, csvData: null, mappings: {}, fileName: '', validRows: [], errorRows: [], skipInvalid: false };
  _importState.protocol = { step: 1, jsonData: null, fileName: '', pasteText: '' };
  _renderImportPage('patients');
}
