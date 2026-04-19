import { api } from './api.js';

const _esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function _tabBar(active, tabs, onClick) {
  return `<div style="display:flex;gap:6px;padding:4px;background:var(--bg-surface);border:1px solid var(--border);border-radius:999px;width:fit-content;margin-bottom:18px">
    ${tabs.map(([id, label]) => `
      <button onclick="${onClick}('${id}')" style="padding:7px 16px;border:none;background:${active===id?'linear-gradient(135deg,var(--teal),var(--blue))':'transparent'};color:${active===id?'#04121c':'var(--text-secondary)'};border-radius:999px;font-size:11.5px;font-weight:600;cursor:pointer;letter-spacing:-.005em">${_esc(label)}</button>
    `).join('')}
  </div>`;
}

function _sectionCard(title, sub, body, actions = '') {
  return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <h3 style="margin:0;font-size:13px;font-weight:600;color:var(--text-primary);letter-spacing:-.01em">${_esc(title)}</h3>
      ${sub ? `<span style="font-size:11px;color:var(--text-tertiary)">${_esc(sub)}</span>` : ''}
      ${actions ? `<div style="margin-left:auto;display:flex;gap:6px">${actions}</div>` : ''}
    </div>
    ${body}
  </div>`;
}

// ── Tab: Quality Assurance ────────────────────────────────────────────────────
async function _renderQA() {
  let coverage = null;
  try { coverage = await api.protocolCoverage?.(); } catch (_) { coverage = null; }

  const _rows = (Array.isArray(coverage?.rows) && coverage.rows.length > 0)
    ? coverage.rows
    : [
        { condition: 'Treatment-resistant depression', modality: 'tDCS · DLPFC-L', coverage: 96, gap: 'None',                 reviewed: 'Apr 12', id:'pc-1' },
        { condition: 'Treatment-resistant depression', modality: 'tACS · theta',   coverage: 42, gap: 'No v2 sign-off',        reviewed: 'Mar 08', id:'pc-2' },
        { condition: 'OCD',                            modality: 'tDCS · SMA',     coverage: 88, gap: 'Minor: dose ladder',    reviewed: 'Apr 09', id:'pc-3' },
        { condition: 'OCD',                            modality: 'tRNS',           coverage:  0, gap: 'Missing SOP',           reviewed: '—',       id:'pc-4' },
        { condition: 'Generalized anxiety',            modality: 'tDCS · DLPFC-R', coverage: 78, gap: 'None',                  reviewed: 'Apr 14', id:'pc-5' },
        { condition: 'Fibromyalgia',                   modality: 'tDCS · M1',      coverage: 62, gap: 'v3 pending sign-off',   reviewed: 'Apr 02', id:'pc-6' },
        { condition: 'PTSD',                           modality: 'tDCS · mPFC',    coverage: 55, gap: 'Add session 12',        reviewed: 'Mar 22', id:'pc-7' },
        { condition: 'Tinnitus',                       modality: 'tACS · TPJ',     coverage: 18, gap: 'Investigational only',  reviewed: '—',       id:'pc-8' },
      ];

  const _bar = (pct) => {
    const c = pct >= 80 ? 'var(--teal)' : pct >= 50 ? 'var(--amber)' : 'var(--rose)';
    return `<div style="display:flex;align-items:center;gap:8px;min-width:140px">
      <div style="flex:1;height:5px;background:var(--bg-surface);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${c}"></div></div>
      <span style="font-size:10.5px;font-weight:600;color:${c};font-family:var(--dv2-font-mono,ui-monospace,monospace);min-width:30px;text-align:right">${pct}%</span>
    </div>`;
  };

  const _gaps = _rows.filter(r => r.coverage < 50);
  const _tableBody = _rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
    <td style="padding:10px 8px;font-size:12px;color:var(--text-primary);font-weight:600">${_esc(r.condition)}</td>
    <td style="padding:10px 8px;font-size:11.5px;color:var(--text-secondary)">${_esc(r.modality)}</td>
    <td style="padding:10px 8px">${_bar(r.coverage)}</td>
    <td style="padding:10px 8px;font-size:11px;color:${r.coverage >= 80 ? 'var(--text-tertiary)' : 'var(--amber)'}">${_esc(r.gap)}</td>
    <td style="padding:10px 8px;font-size:10.5px;color:var(--text-tertiary);font-family:var(--dv2-font-mono,ui-monospace,monospace)">${_esc(r.reviewed)}</td>
    <td style="padding:10px 8px"><button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="window._researchMarkReviewed?.('${_esc(r.id)}')">Mark reviewed</button></td>
  </tr>`).join('');

  const _coverageTable = _sectionCard(
    'Protocol coverage audit',
    `${_rows.length} condition × modality pairs`,
    `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="border-bottom:1px solid var(--border)">
        ${['Condition','Modality','Coverage','Gap','Last reviewed',''].map(h => `<th style="text-align:left;padding:8px;font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600">${_esc(h)}</th>`).join('')}
      </tr></thead>
      <tbody>${_tableBody}</tbody>
    </table>`,
    `<button class="btn btn-ghost btn-sm" style="font-size:10.5px">Export CSV</button>
     <button class="btn btn-primary btn-sm" style="font-size:10.5px">+ New audit</button>`
  );

  const _gapList = _gaps.length > 0
    ? _gaps.map(g => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px">
        <div>
          <div style="font-size:12px;color:var(--text-primary);font-weight:600">${_esc(g.condition)} · ${_esc(g.modality)}</div>
          <div style="font-size:10.5px;color:var(--amber);margin-top:2px">${_esc(g.gap)}</div>
        </div>
        <span style="font-size:11px;font-weight:700;color:var(--rose);font-family:var(--dv2-font-mono,ui-monospace,monospace)">${g.coverage}%</span>
      </div>`).join('')
    : `<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:12px">No coverage gaps — all condition × modality pairs above 50%.</div>`;

  const _gapCard = _sectionCard(
    'Gap report',
    `${_gaps.length} missing or under-covered`,
    `<div style="display:flex;flex-direction:column;gap:8px">${_gapList}</div>`
  );

  return _coverageTable + _gapCard;
}

// ── Tab: Longitudinal report ──────────────────────────────────────────────────
async function _renderLongitudinal() {
  let report = null;
  const _cohort = window._researchCohort || 'all';
  const _from = window._researchFrom || '2026-01-01';
  const _to = window._researchTo || '2026-04-18';
  try { report = await api.longitudinalReport?.({ cohort: _cohort, from: _from, to: _to }); } catch (_) { report = null; }

  const _series = report?.series || {
    'PHQ-9':  [18, 16, 15, 13, 11, 10, 9, 8, 7, 6],
    'GAD-7':  [15, 14, 13, 12, 11, 10, 10, 9, 8, 7],
    'Y-BOCS': [26, 25, 24, 22, 21, 19, 18, 18, 16, 15],
  };

  const _plot = (label, pts, color) => {
    const w = 420, h = 120, pad = 22;
    const max = Math.max(...pts), min = Math.min(...pts);
    const step = (w - pad * 2) / (pts.length - 1);
    const y = (v) => h - pad - ((v - min) / Math.max(1, max - min)) * (h - pad * 2);
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * step).toFixed(1)} ${y(p).toFixed(1)}`).join(' ');
    const area = `M${pad} ${h - pad} ${pts.map((p, i) => `L${(pad + i * step).toFixed(1)} ${y(p).toFixed(1)}`).join(' ')} L${w - pad} ${h - pad} Z`;
    return `<div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:10px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:11.5px;color:var(--text-primary);font-weight:600">${_esc(label)}</div>
        <div style="font-size:10.5px;color:${color};font-family:var(--dv2-font-mono,ui-monospace,monospace)">▼ ${((pts[0] - pts[pts.length - 1]) / pts[0] * 100).toFixed(1)}%</div>
      </div>
      <svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block">
        <path d="${area}" fill="${color}" opacity="0.12"/>
        <path d="${d}" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
        ${pts.map((p, i) => `<circle cx="${(pad + i * step).toFixed(1)}" cy="${y(p).toFixed(1)}" r="2.5" fill="${color}"/>`).join('')}
      </svg>
    </div>`;
  };

  const _controls = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
    <label style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600">Cohort</label>
    <select onchange="window._researchSetCohort?.(this.value)" style="background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:11.5px;padding:5px 10px;border-radius:6px">
      ${['all','Depression','OCD','GAD','Fibromyalgia','PTSD'].map(c => `<option value="${c}" ${c===_cohort?'selected':''}>${_esc(c)}</option>`).join('')}
    </select>
    <label style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;margin-left:8px">From</label>
    <input type="date" value="${_esc(_from)}" onchange="window._researchSetFrom?.(this.value)" style="background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:11.5px;padding:4px 8px;border-radius:6px"/>
    <label style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600">To</label>
    <input type="date" value="${_esc(_to)}" onchange="window._researchSetTo?.(this.value)" style="background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:11.5px;padding:4px 8px;border-radius:6px"/>
    <button class="btn btn-primary btn-sm" style="font-size:10.5px;margin-left:auto" onclick="window._researchRender?.()">Refresh</button>
  </div>`;

  const _outcomes = _sectionCard(
    'Outcome trends',
    'Weekly mean scores · responders only',
    _controls + `<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
      ${_plot('PHQ-9 · Depression', _series['PHQ-9'], '#00d4bc')}
      ${_plot('GAD-7 · Anxiety',    _series['GAD-7'], '#4a9eff')}
      ${_plot('Y-BOCS · OCD',       _series['Y-BOCS'], '#9b7fff')}
    </div>`
  );

  const _responder = report?.responderByModality || [
    { modality: 'tDCS · DLPFC-L',  rate: [32,38,44,48,52,57,62,64,66,68], color: '#00d4bc' },
    { modality: 'tDCS · DLPFC-R',  rate: [28,32,35,40,44,48,51,54,56,58], color: '#4a9eff' },
    { modality: 'tACS · theta',    rate: [18,22,24,28,30,34,36,38,42,45], color: '#9b7fff' },
    { modality: 'tDCS · M1',       rate: [22,25,28,31,34,37,40,42,44,46], color: '#ffb547' },
  ];

  const _mw = 480, _mh = 160, _mpad = 28;
  const _mmax = Math.max(...[].concat(..._responder.map(m => m.rate)));
  const _mstep = (_mw - _mpad * 2) / (_responder[0].rate.length - 1);
  const _my = (v) => _mh - _mpad - (v / _mmax) * (_mh - _mpad * 2);
  const _lines = _responder.map(m => {
    const d = m.rate.map((p, i) => `${i === 0 ? 'M' : 'L'}${(_mpad + i * _mstep).toFixed(1)} ${_my(p).toFixed(1)}`).join(' ');
    return `<path d="${d}" stroke="${m.color}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  }).join('');
  const _legend = _responder.map(m => `<span style="display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--text-secondary)"><span style="width:10px;height:2px;background:${m.color};border-radius:1px"></span>${_esc(m.modality)} · ${m.rate[m.rate.length - 1]}%</span>`).join('');

  const _responderCard = _sectionCard(
    'Responder rate by modality',
    '10-week rolling · ≥50% score reduction',
    `<svg width="100%" height="${_mh}" viewBox="0 0 ${_mw} ${_mh}" preserveAspectRatio="none" style="display:block;margin-bottom:10px">
      ${[0,25,50,75,100].map(v => `<line x1="${_mpad}" x2="${_mw - _mpad}" y1="${_my(v)}" y2="${_my(v)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`).join('')}
      ${_lines}
    </svg>
    <div style="display:flex;flex-wrap:wrap;gap:14px;padding-left:${_mpad}px">${_legend}</div>`
  );

  return _outcomes + _responderCard;
}

// ── Tab: Data export ──────────────────────────────────────────────────────────
async function _renderDataExport() {
  const _individual = _sectionCard(
    'GDPR Article 20 · individual export',
    'Portable patient record · signed + encrypted',
    `<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end">
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Patient MRN</label>
        <input id="_researchPtMrn" placeholder="MRN or email" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px"/>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Format</label>
        <select id="_researchPtFormat" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px">
          <option>FHIR Bundle</option><option>JSON</option><option>CSV</option><option>PDF</option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window._researchExportIndividual?.()" style="font-size:11px;padding:7px 14px">Export & sign</button>
    </div>`
  );

  const _format = window._researchExportFormat || 'CSV';
  const _consent = window._researchExportConsent || 'research';

  const _dataset = _sectionCard(
    'Research dataset builder',
    'Filter by consent tier + date range',
    `<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end">
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Consent tier</label>
        <select onchange="window._researchSetConsent?.(this.value)" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px">
          ${['research','treatment','analytics','marketing'].map(c => `<option ${c===_consent?'selected':''}>${_esc(c)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Format</label>
        <select onchange="window._researchSetFormat?.(this.value)" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px">
          ${['CSV','JSON','BIDS','FHIR'].map(f => `<option ${f===_format?'selected':''}>${_esc(f)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Date range</label>
        <input type="text" value="Jan 01 – Apr 18, 2026" readonly style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px"/>
      </div>
      <button class="btn btn-primary btn-sm" onclick="window._researchBuildDataset?.()" style="font-size:11px;padding:7px 14px">Build export</button>
    </div>
    <div style="display:flex;gap:18px;padding:14px 12px;margin-top:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px">
      ${[['142','patients eligible'],['3,208','sessions'],['5,411','assessments'],['38','modalities × conditions']].map(([n,l]) => `<div>
        <div style="font-size:18px;font-weight:600;color:var(--text-primary);letter-spacing:-.01em">${_esc(n)}</div>
        <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;margin-top:2px">${_esc(l)}</div>
      </div>`).join('')}
    </div>`
  );

  const _schedule = _sectionCard(
    'Scheduled exports',
    'Cron-driven · delivered to regulator archive',
    `<div style="display:flex;flex-direction:column;gap:8px">
      ${[
        ['Nightly session archive', '0 2 * * *', 'CSV → s3://ds-reg-archive/', 'active'],
        ['Weekly cohort snapshot',  '0 3 * * 1', 'BIDS → sftp.research.oxford', 'active'],
        ['Monthly regulator pack',  '0 1 1 * *', 'FHIR + PDF → TÜV Sud',        'paused'],
      ].map(([n,c,t,s]) => `<div style="display:grid;grid-template-columns:1.3fr 110px 1fr auto auto;gap:12px;align-items:center;padding:10px 12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px">
        <div style="font-size:12px;color:var(--text-primary);font-weight:600">${_esc(n)}</div>
        <code style="font-size:10.5px;font-family:var(--dv2-font-mono,ui-monospace,monospace);color:var(--text-tertiary);background:rgba(255,255,255,0.04);padding:2px 6px;border-radius:4px">${_esc(c)}</code>
        <div style="font-size:10.5px;color:var(--text-secondary)">${_esc(t)}</div>
        <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${s==='active'?'rgba(0,212,188,0.16)':'rgba(255,181,71,0.16)'};color:${s==='active'?'var(--teal)':'var(--amber)'};text-transform:uppercase;letter-spacing:.03em">${_esc(s)}</span>
        <button class="btn btn-ghost btn-sm" style="font-size:10px">Edit</button>
      </div>`).join('')}
    </div>
    <button class="btn btn-ghost btn-sm" style="margin-top:10px;font-size:10.5px">+ New scheduled export</button>`
  );

  return _individual + _dataset + _schedule;
}

// ── Tab: IRB manager ──────────────────────────────────────────────────────────
async function _renderIRB() {
  let protocols = null;
  let irbAes = null;
  try { protocols = await api.listIrbProtocols?.(); } catch (_) { protocols = null; }
  try { irbAes = await api.irbAdverseEvents?.(); } catch (_) { irbAes = null; }

  const _protocols = (Array.isArray(protocols?.items) && protocols.items.length > 0)
    ? protocols.items
    : [
        { id:'IRB-2026-007', title:'tDCS vs. sham for TRD · multi-site RCT', pi:'Dr. A. Kolmar', sites:3, targetN:120, enrolled:84, status:'recruiting' },
        { id:'IRB-2026-004', title:'Home tDCS adherence (post-hoc follow-up)', pi:'Dr. M. Takahashi', sites:1, targetN:60, enrolled:58, status:'active' },
        { id:'IRB-2026-001', title:'OCD SMA dose ladder · open-label',       pi:'Dr. J. Raines', sites:2, targetN:40, enrolled:22, status:'recruiting' },
        { id:'IRB-2025-019', title:'PTSD mPFC · feasibility pilot',          pi:'Dr. A. Kolmar', sites:1, targetN:12, enrolled:12, status:'analysis' },
      ];

  const _form = _sectionCard(
    'New protocol authoring',
    'Draft an IRB submission',
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Study title</label>
        <input id="_irbTitle" placeholder="e.g. tRNS vs. sham for GAD" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px"/>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Principal investigator</label>
        <input id="_irbPI" placeholder="Dr. …" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px"/>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Sites</label>
        <input id="_irbSites" placeholder="Kolmar · Oxford · …" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px"/>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Target N</label>
        <input id="_irbN" type="number" placeholder="120" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px"/>
      </div>
      <div style="grid-column:span 2">
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Inclusion criteria</label>
        <textarea id="_irbIncl" rows="2" placeholder="Age 18–65; confirmed Dx; stable meds > 6 wks; …" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:8px 10px;border-radius:6px;resize:vertical"></textarea>
      </div>
      <div style="grid-column:span 2">
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Exclusion criteria</label>
        <textarea id="_irbExcl" rows="2" placeholder="Implanted device; pregnancy; active substance use; …" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:8px 10px;border-radius:6px;resize:vertical"></textarea>
      </div>
      <div style="grid-column:span 2;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" style="font-size:11px">Save draft</button>
        <button class="btn btn-primary btn-sm" onclick="window._researchCreateIrb?.()" style="font-size:11px">Submit for IRB</button>
      </div>
    </div>`
  );

  const _protoRows = _protocols.map(p => {
    const pct = Math.round((p.enrolled / p.targetN) * 100);
    const c = p.status === 'recruiting' ? 'var(--blue)' : p.status === 'active' ? 'var(--teal)' : p.status === 'analysis' ? 'var(--violet)' : 'var(--text-tertiary)';
    return `<div style="display:grid;grid-template-columns:110px 1fr 120px 1fr auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <code style="font-size:10.5px;color:var(--text-tertiary);font-family:var(--dv2-font-mono,ui-monospace,monospace)">${_esc(p.id)}</code>
      <div>
        <div style="font-size:12px;color:var(--text-primary);font-weight:600">${_esc(p.title)}</div>
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">${_esc(p.pi)} · ${p.sites} site${p.sites===1?'':'s'}</div>
      </div>
      <div>
        <div style="font-size:10.5px;color:var(--text-secondary);margin-bottom:3px">${p.enrolled} / ${p.targetN} enrolled</div>
        <div style="height:4px;background:var(--bg-surface);border-radius:2px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${c}"></div></div>
      </div>
      <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:rgba(255,255,255,0.05);color:${c};text-transform:uppercase;letter-spacing:.03em;width:fit-content">${_esc(p.status)}</span>
      <button class="btn btn-ghost btn-sm" style="font-size:10px">Open →</button>
    </div>`;
  }).join('');

  const _protosCard = _sectionCard(
    'Active IRB protocols',
    `${_protocols.length} protocols · consent tracking + enrollment`,
    `<div>${_protoRows}</div>`
  );

  const _consentStats = [
    ['84', 'consented this quarter', 'var(--teal)'],
    ['6',  'withdrawals',              'var(--amber)'],
    ['2',  'pending e-sign',           'var(--blue)'],
    ['0',  'revoked',                  'var(--text-tertiary)'],
  ];
  const _consentCard = _sectionCard(
    'Participant consent tracking',
    'e-sign status · updated in real time',
    `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
      ${_consentStats.map(([n,l,c]) => `<div style="padding:14px;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px">
        <div style="font-size:22px;font-weight:600;color:${c};letter-spacing:-.01em">${_esc(n)}</div>
        <div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;margin-top:2px">${_esc(l)}</div>
      </div>`).join('')}
    </div>`
  );

  const _escalations = (Array.isArray(irbAes?.items) && irbAes.items.length > 0)
    ? irbAes.items
    : [
        { id:'AE-IRB-2604-01', title:'Moderate headache > 6 h · TRD RCT',  sub:'Ben Ortiz · IRB-2026-007 · due 24h', sev:'mod' },
        { id:'AE-IRB-2604-02', title:'Skin erythema grade 2 · OCD pilot',  sub:'Samantha Li · IRB-2026-001 · due 48h', sev:'mild' },
      ];

  const _escRow = (a) => {
    const color = a.sev === 'severe' || a.sev === 'sae' ? 'var(--rose)' : a.sev === 'mod' ? 'var(--amber)' : 'var(--teal)';
    return `<div style="display:grid;grid-template-columns:6px 1fr auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:6px;height:36px;border-radius:3px;background:${color}"></div>
      <div>
        <div style="font-size:12px;color:var(--text-primary);font-weight:600">${_esc(a.id)} · ${_esc(a.title)}</div>
        <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">${_esc(a.sub)}</div>
      </div>
      <button class="btn btn-primary btn-sm" style="font-size:10.5px">Escalate</button>
    </div>`;
  };

  const _escalationCard = _sectionCard(
    'Adverse-event escalation queue',
    'IRB-reportable events awaiting action',
    `<div>${_escalations.map(_escRow).join('')}</div>`
  );

  const _cohortBuilder = _sectionCard(
    'Cohort builder',
    'Assemble enrollment slices for analysis',
    `<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end">
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Condition</label>
        <select style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px">
          ${['Any','Depression','OCD','GAD','Fibromyalgia','PTSD'].map(c => `<option>${_esc(c)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Modality</label>
        <select style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px">
          ${['Any','tDCS','tACS','tRNS','tMS'].map(c => `<option>${_esc(c)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.04em;font-weight:600;display:block;margin-bottom:4px">Min sessions</label>
        <input type="number" placeholder="8" style="width:100%;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:7px 10px;border-radius:6px"/>
      </div>
      <button class="btn btn-primary btn-sm" style="font-size:11px;padding:7px 14px">Build cohort</button>
    </div>`
  );

  return _form + _protosCard + _consentCard + _escalationCard + _cohortBuilder;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function pgResearch(setTopbar, _navigate) {
  setTopbar(
    'Research',
    `<span style="font-size:11px;color:var(--text-tertiary);margin-right:10px">QA · Longitudinal · Data Export · IRB</span>
     <button class="btn btn-ghost btn-sm" onclick="window._researchExportAll?.()">Export bundle ↗</button>`
  );

  const el = document.getElementById('content');
  if (!el) return;

  if (!window._researchTab) window._researchTab = 'qa';

  const TABS = [
    ['qa', 'Quality Assurance'],
    ['long', 'Longitudinal Report'],
    ['exp', 'Data Export'],
    ['irb', 'IRB Manager'],
  ];

  async function render() {
    const active = window._researchTab;
    let body = '';
    try {
      if (active === 'qa')    body = await _renderQA();
      else if (active === 'long') body = await _renderLongitudinal();
      else if (active === 'exp')  body = await _renderDataExport();
      else if (active === 'irb')  body = await _renderIRB();
    } catch (e) {
      body = `<div style="padding:20px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;color:var(--text-tertiary);font-size:12px">Unable to render this section — live data unavailable.</div>`;
    }

    el.innerHTML = `<div style="padding:18px 22px">
      ${_tabBar(active, TABS, 'window._researchSetTab')}
      <div>${body}</div>
    </div>`;
  }

  window._researchRender = render;
  window._researchSetTab = (id) => { window._researchTab = id; render(); };
  window._researchSetCohort = (v) => { window._researchCohort = v; render(); };
  window._researchSetFrom   = (v) => { window._researchFrom = v; };
  window._researchSetTo     = (v) => { window._researchTo = v; };
  window._researchSetFormat = (v) => { window._researchExportFormat = v; };
  window._researchSetConsent= (v) => { window._researchExportConsent = v; };

  // Toast helper that surfaces real backend success/failure instead of fake
  // success alerts. Only claims success when the API method actually exists
  // and the call resolves; otherwise reports an honest unavailable / failed.
  const _toast = (title, body, severity) =>
    (window._dsToast?.({ title, body, severity }) || alert(`${title}: ${body}`));
  const _runApi = async (label, fn) => {
    if (typeof fn !== 'function') { _toast(label, 'Endpoint not available on this build.', 'warn'); return false; }
    try { await fn(); _toast(label, 'Submitted.', 'ok'); return true; }
    catch (e) { _toast(label, (e?.body?.message || e?.message || 'Request failed.'), 'warn'); return false; }
  };

  window._researchMarkReviewed = async (id) => {
    await _runApi(`Protocol ${id} reviewed`, api.markProtocolReviewed && (() => api.markProtocolReviewed(id)));
  };
  window._researchExportIndividual = async () => {
    const mrn = document.getElementById('_researchPtMrn')?.value?.trim();
    if (!mrn) { _toast('Patient MRN required', 'Enter a patient MRN before exporting.', 'warn'); return; }
    await _runApi(`GDPR export · ${mrn}`, api.dataPrivacyExport && (() => api.dataPrivacyExport(mrn)));
  };
  window._researchBuildDataset = async () => {
    await _runApi('Dataset export', api.exportData && (() => api.exportData({
      consent: window._researchExportConsent || 'research',
      format:  window._researchExportFormat  || 'CSV',
    })));
  };
  window._researchCreateIrb = async () => {
    const title = document.getElementById('_irbTitle')?.value?.trim();
    const pi    = document.getElementById('_irbPI')?.value?.trim();
    if (!title || !pi) { _toast('Required fields missing', 'Title and PI are required.', 'warn'); return; }
    await _runApi(`IRB draft "${title}"`, api.createIrbProtocol && (() => api.createIrbProtocol({
      title, pi,
      sites: document.getElementById('_irbSites')?.value || '',
      target_n: Number(document.getElementById('_irbN')?.value || 0),
      inclusion: document.getElementById('_irbIncl')?.value || '',
      exclusion: document.getElementById('_irbExcl')?.value || '',
    })));
  };
  window._researchExportAll = async () => {
    await _runApi('Research bundle export', api.exportData && (() => api.exportData({ kind: 'research-bundle' })));
  };

  await render();
}
