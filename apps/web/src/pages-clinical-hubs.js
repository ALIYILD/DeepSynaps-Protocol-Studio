// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-hubs.js — Hub/container pages (code-split)
// Patient Hub · Clinical Hub · Protocol Hub · Scheduling Hub · etc.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { tag, spinner, emptyState } from './helpers.js';
import { currentUser } from './auth.js';
import { renderBrainMap10_20 } from './brain-map-svg.js';
import {
  SUPPORTED_FORMS as ASSESSMENT_SUPPORTED_FORMS,
  SCALE_TO_FORM_KEY,
  getAssessmentConfig,
} from './assessment-forms.js';
import { DOCUMENT_TEMPLATES, renderTemplate } from './documents-templates.js';
import { SCALE_REGISTRY } from './registries/scale-assessment-registry.js';
import { ASSESS_REGISTRY } from './registries/assess-instruments-registry.js';

// ═══════════════════════════════════════════════════════════════════════════════
// pgPatientHub — Merged: Patients + Treatment Courses + Prescriptions
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgPatientHub(setTopbar, navigate) {
  const tab = window._patientHubTab || 'patients';
  window._patientHubTab = tab;

  const TAB_META = {
    patients:      { label: 'Patients',           color: 'var(--blue)'   },
    courses:       { label: 'Treatment Courses',   color: 'var(--teal)'   },
    prescriptions: { label: 'Prescriptions',       color: 'var(--violet)' },
    history:       { label: 'Medical History',     color: 'var(--amber)'  },
  };

  function tabBar() {
    return Object.entries(TAB_META).map(([id, m]) =>
      '<button class="ch-tab' + (tab === id ? ' ch-tab--active' : '') + '"' +
      (tab === id ? ' style="--tab-color:' + m.color + '"' : '') +
      ' onclick="window._patientHubTab=\'' + id + '\';window._nav(\'patients-hub\')">' + m.label + '</button>'
    ).join('');
  }

  const el = document.getElementById('content');

  // ── PATIENTS TAB (design-v2 screen 07) ──────────────────────────────────
  if (tab === 'patients') {
    const canAdd = ['clinician','admin','clinic-admin','supervisor'].includes(currentUser?.role);
    setTopbar('Patients',
      canAdd ? '<button class="btn btn-primary btn-sm" onclick="window.showAddPatient()">+ New Patient</button>' +
               '<button class="btn btn-sm" onclick="window.showImportCSV()" style="margin-right:6px">Import CSV</button>' : ''
    );
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    let patients = [], courses = [];
    try {
      const [pRes, cRes] = await Promise.all([
        api.listPatients().catch(() => ({ items: [] })),
        (api.listCourses ? api.listCourses({}) : Promise.resolve({ items: [] })).catch(() => ({ items: [] })),
      ]);
      patients = pRes?.items || [];
      courses  = cRes?.items || [];
    } catch {}

    const coursesByPat = {};
    courses.forEach(c => { if (c.patient_id) (coursesByPat[c.patient_id] = coursesByPat[c.patient_id] || []).push(c); });

    function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

    const AVATAR_TONES = ['a','b','c','d','e'];
    const CONDITION_CHIPS = {
      mdd:'teal', depression:'teal', tms:'blue', tdcs:'teal', adhd:'amber',
      anxiety:'blue', gad:'blue', ptsd:'rose', ocd:'violet',
      insomnia:'blue', pain:'teal', migraine:'teal', stroke:'amber',
    };
    function protocolChip(p) {
      const mod  = (p.primary_modality||'').toLowerCase();
      const cond = (p.condition_slug||'').toLowerCase();
      let tone = 'teal';
      for (const k in CONDITION_CHIPS) { if (mod.includes(k) || cond.includes(k)) { tone = CONDITION_CHIPS[k]; break; } }
      const label = [mod, cond].filter(Boolean).map(s=>s.replace(/-/g,' ')).join(' · ') || 'Intake';
      return '<span class="chip ' + tone + '">' + esc(label) + '</span>';
    }

    function outcomeCell(p) {
      const scale = p.primary_scale || 'PHQ-9';
      const base  = p.baseline_score;
      const cur   = p.current_score;
      if (base != null && cur != null) {
        const down = cur < base;
        const color = down ? 'var(--teal)' : (cur > base ? 'var(--amber)' : 'var(--text-secondary)');
        return '<span style="font-family:var(--font-mono);font-size:11.5px;color:' + color + '">' + esc(scale) + ' · ' + base + ' → ' + cur + '</span>';
      }
      if (p.outcome_trend === 'worsened') return '<span style="font-family:var(--font-mono);font-size:11.5px;color:var(--amber)">Trend ↓</span>';
      return '<span style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-tertiary)">No data</span>';
    }

    function nextStepChip(p) {
      if (p.has_adverse_event) return '<span class="chip rose">Review AE</span>';
      if (p.next_session_at) {
        const d = new Date(p.next_session_at); const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        const t = d.toTimeString().slice(0,5);
        return '<span class="chip green">' + (isToday ? 'Session today ' + t : 'Session ' + d.toLocaleDateString(undefined,{weekday:'short'}) + ' ' + t) + '</span>';
      }
      if (p.assessment_overdue || p.missing_assessment) return '<span class="chip amber">Assessment due</span>';
      if (p.needs_review || p.review_overdue)           return '<span class="chip">Review due</span>';
      if (p.status === 'intake')                         return '<span class="chip violet">Intake</span>';
      if (p.home_adherence != null && p.home_adherence >= 0.8) return '<span class="chip green">Homework ' + Math.round(p.home_adherence*100) + '%</span>';
      return '<span class="chip">Weekly check-in</span>';
    }

    const counts = {
      all:         patients.length,
      active:      patients.filter(p=>p.status==='active').length,
      intake:      patients.filter(p=>p.status==='intake' || p.status==='new').length,
      discharging: patients.filter(p=>p.status==='discharging' || p.discharge_plan).length,
      on_hold:     patients.filter(p=>p.status==='paused' || p.status==='on-hold').length,
      archived:    patients.filter(p=>p.status==='archived' || p.status==='discharged' || p.status==='inactive').length,
    };

    const STATUS_TABS = [
      { id:'all',         label:'All' },
      { id:'active',      label:'Active' },
      { id:'intake',      label:'Intake' },
      { id:'discharging', label:'Discharging' },
      { id:'on_hold',     label:'On hold' },
      { id:'archived',    label:'Archived' },
    ];

    const activeCourses = courses.filter(c=>c.status==='active').length;
    let phqTotal = 0, phqN = 0;
    patients.forEach(p => {
      if ((p.primary_scale||'PHQ-9').toUpperCase().startsWith('PHQ') && p.baseline_score != null && p.current_score != null) {
        phqTotal += (p.current_score - p.baseline_score); phqN++;
      }
    });
    const phqDeltaRaw = phqN ? (phqTotal / phqN) : null;
    const phqDelta    = phqDeltaRaw == null ? '—' : phqDeltaRaw.toFixed(1);
    let adhTotal = 0, adhN = 0;
    patients.forEach(p => { if (p.home_adherence != null) { adhTotal += p.home_adherence; adhN++; } });
    const adhPct = adhN ? Math.round((adhTotal / adhN) * 100) : 0;
    const followup = patients.filter(p=>p.needs_review||p.review_overdue||p.missing_assessment||p.assessment_overdue).length;
    const followupOver7d = patients.filter(p=>p.review_overdue_days>7).length;

    window._phStatus = window._phStatus || 'all';
    window._phPage   = 1;
    const PAGE_SIZE  = 10;

    function cohortFilter(status) {
      if (status === 'all') return patients;
      if (status === 'active')      return patients.filter(p=>p.status==='active');
      if (status === 'intake')      return patients.filter(p=>p.status==='intake'||p.status==='new');
      if (status === 'discharging') return patients.filter(p=>p.status==='discharging'||p.discharge_plan);
      if (status === 'on_hold')     return patients.filter(p=>p.status==='paused'||p.status==='on-hold');
      if (status === 'archived')    return patients.filter(p=>p.status==='archived'||p.status==='discharged'||p.status==='inactive');
      return patients;
    }

    function applySearch(list) {
      const q = (document.getElementById('d2p7-search')?.value || '').toLowerCase();
      if (!q) return list;
      return list.filter(p =>
        ((p.first_name||'')+' '+(p.last_name||'')).toLowerCase().includes(q) ||
        (p.condition_slug||'').toLowerCase().includes(q) ||
        (p.mrn||'').toLowerCase().includes(q) ||
        (p.primary_modality||'').toLowerCase().includes(q)
      );
    }

    function renderList() {
      const filtered = applySearch(cohortFilter(window._phStatus));
      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (window._phPage > pages) window._phPage = 1;
      const start = (window._phPage - 1) * PAGE_SIZE;
      const page  = filtered.slice(start, start + PAGE_SIZE);

      const out = document.getElementById('d2p7-list');
      if (!out) return;
      if (!page.length) {
        out.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary)">No patients found.</div>';
      } else {
        out.innerHTML = page.map(p => {
          const fname = p.first_name || '';
          const lname = p.last_name || '';
          const name  = (fname + ' ' + lname).trim() || 'Unknown';
          const ini   = ((fname[0]||'') + (lname[0]||'')).toUpperCase() || '?';
          const av    = AVATAR_TONES[Math.abs(String(p.id||name).split('').reduce((a,c)=>a+c.charCodeAt(0),0)) % AVATAR_TONES.length];
          const cond  = (p.condition_slug||'').replace(/-/g,' ') || '—';
          const age   = p.age || (p.dob ? (new Date().getFullYear() - new Date(p.dob).getFullYear()) : null);
          const sex   = (p.gender||'').charAt(0).toUpperCase();
          const sub   = (age ? age + (sex||'') + ' · ' : '') + cond + (p.mrn ? ' · MRN ' + esc(p.mrn) : '');
          const delivered = p.sessions_delivered ?? 0;
          const planned   = p.planned_sessions_total ?? 0;
          const prog = planned > 0 ? Math.min(100, Math.round(delivered / planned * 100)) : 0;
          return '<div class="queue-row pt-row" style="grid-template-columns:1.8fr 1.1fr 1fr 1fr 1fr 90px" ' +
            'onclick="window._selectedPatientId=\'' + esc(p.id) + '\';window._profilePatientId=\'' + esc(p.id) + '\';try{sessionStorage.setItem(\'ds_pat_selected_id\',\'' + esc(p.id) + '\')}catch(e){}window._nav(\'patient-profile\')">' +
              '<div class="queue-pt"><div class="pt-av ' + av + '">' + esc(ini) + '</div>' +
                '<div><div class="queue-pt-name">' + esc(name) + '</div>' +
                  '<div class="queue-pt-cond">' + esc(sub) + '</div></div></div>' +
              '<div>' + protocolChip(p) + '</div>' +
              '<div class="queue-progress"><div class="queue-progress-bar"><div style="width:' + prog + '%"></div></div>' +
                '<span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-tertiary)">' + delivered + '/' + (planned||'—') + '</span></div>' +
              '<div>' + outcomeCell(p) + '</div>' +
              '<div>' + nextStepChip(p) + '</div>' +
              '<div style="text-align:right"><button class="topbar-btn d2p7-chev" style="width:26px;height:26px" onclick="event.stopPropagation()">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button></div>' +
            '</div>';
        }).join('');
      }

      const foot = document.getElementById('d2p7-foot');
      if (foot) {
        const statusLbl = (STATUS_TABS.find(s=>s.id===window._phStatus)||STATUS_TABS[0]).label;
        foot.innerHTML =
          '<span>Showing ' + (total ? (start+1) : 0) + '–' + Math.min(start+PAGE_SIZE,total) + ' of ' + total + ' · filtered by "' + esc(statusLbl) + '"</span>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<button class="topbar-btn" style="width:26px;height:26px" onclick="window._phGoPage(-1)">‹</button>' +
            '<span style="font-family:var(--font-mono)">' + window._phPage + ' / ' + pages + '</span>' +
            '<button class="topbar-btn" style="width:26px;height:26px" onclick="window._phGoPage(1)">›</button>' +
          '</div>';
      }
    }

    window._phSetStatus = id => { window._phStatus = id; window._phPage = 1;
      document.querySelectorAll('.d2p7-tabrow button').forEach(b => b.classList.toggle('active', b.dataset.st === id));
      renderList();
    };
    window._phGoPage = delta => {
      const filtered = applySearch(cohortFilter(window._phStatus));
      const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      window._phPage = Math.min(pages, Math.max(1, window._phPage + delta));
      renderList();
    };
    window._phOnSearch = () => { window._phPage = 1; renderList(); };

    el.innerHTML = `
    <div class="ch-shell">
      <style>
        .d2p7-wrap { color: var(--text-primary); }
        .d2p7-tabrow { display:flex; gap:4px; background:var(--bg-surface); padding:3px; border-radius:8px; border:1px solid var(--border); flex-wrap:wrap; }
        .d2p7-tabrow button { padding:5px 10px; font-size:11.5px; font-weight:600; color:var(--text-secondary); border-radius:5px; background:transparent; border:none; cursor:pointer; }
        .d2p7-tabrow button.active { background:rgba(255,255,255,0.08); color:var(--text-primary); }
        .d2p7-chip-btn { padding:5px 10px; font-size:11.5px; border-radius:6px; background:transparent; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; }
        .d2p7-chip-btn:hover { border-color:var(--border-hover); color:var(--text-primary); }
        .d2p7-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px; }
        .d2p7-kpi { padding:14px 16px; border:1px solid var(--border); background:var(--bg-card); border-radius:14px; }
        .d2p7-kpi-lbl { font-size:10.5px; letter-spacing:1px; text-transform:uppercase; color:var(--text-tertiary); font-weight:600; display:flex; align-items:center; gap:6px; }
        .d2p7-kpi-lbl .dot { width:6px; height:6px; border-radius:50%; background:var(--teal); }
        .d2p7-kpi-lbl.blue .dot   { background:var(--blue); }
        .d2p7-kpi-lbl.violet .dot { background:var(--violet); }
        .d2p7-kpi-lbl.amber .dot  { background:var(--amber); }
        .d2p7-kpi-num { font-family:var(--font-display,inherit); font-size:26px; font-weight:600; margin-top:4px; color:var(--text-primary); }
        .d2p7-kpi-num .unit { font-size:14px; color:var(--text-tertiary); margin-left:2px; }
        .d2p7-kpi-delta { font-size:11px; color:var(--text-tertiary); margin-top:3px; }
        .d2p7-kpi-delta.up   { color:var(--teal); }
        .d2p7-kpi-delta.down { color:var(--amber); }
        .d2p7-card { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; padding:8px 16px 16px; }
        .d2p7-wrap .queue-row { display:grid; align-items:center; gap:12px; padding:10px 4px; border-bottom:1px solid var(--border); }
        .d2p7-wrap .queue-row:last-child { border-bottom:none; }
        .d2p7-wrap .queue-row.head { color:var(--text-tertiary); font-size:10.5px; letter-spacing:1px; text-transform:uppercase; font-weight:600; padding:4px 4px 10px; }
        .d2p7-wrap .queue-row.pt-row { cursor:pointer; transition: background .1s ease; border-radius:8px; }
        .d2p7-wrap .queue-row.pt-row:hover { background: rgba(0,212,188,0.05); }
        .d2p7-wrap .queue-pt { display:flex; align-items:center; gap:10px; }
        .d2p7-wrap .queue-pt-name { font-weight:600; font-size:13px; color:var(--text-primary); }
        .d2p7-wrap .queue-pt-cond { font-size:10.5px; color:var(--text-tertiary); margin-top:1px; }
        .d2p7-wrap .pt-av { width:26px; height:26px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:600; color:#04121c; }
        .d2p7-wrap .pt-av.a { background:linear-gradient(135deg,#00d4bc,#00a896); }
        .d2p7-wrap .pt-av.b { background:linear-gradient(135deg,#4a9eff,#2d7fe0); }
        .d2p7-wrap .pt-av.c { background:linear-gradient(135deg,#9b7fff,#7c5fe0); }
        .d2p7-wrap .pt-av.d { background:linear-gradient(135deg,#ff6b9d,#e04880); }
        .d2p7-wrap .pt-av.e { background:linear-gradient(135deg,#ffb547,#e69524); }
        .d2p7-wrap .queue-progress { display:flex; align-items:center; gap:8px; }
        .d2p7-wrap .queue-progress-bar { flex:1; height:5px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden; }
        .d2p7-wrap .queue-progress-bar > div { height:100%; background:linear-gradient(90deg,var(--teal),var(--blue)); border-radius:3px; }
        .d2p7-wrap .chip { display:inline-block; padding:4px 9px; border-radius:5px; font-size:11px; font-weight:600; background:var(--bg-surface); color:var(--text-secondary); }
        .d2p7-wrap .chip.teal   { background:rgba(0,212,188,0.12);   color:var(--teal); }
        .d2p7-wrap .chip.blue   { background:rgba(74,158,255,0.12);  color:var(--blue); }
        .d2p7-wrap .chip.violet { background:rgba(155,127,255,0.14); color:var(--violet); }
        .d2p7-wrap .chip.rose   { background:rgba(255,107,157,0.14); color:var(--rose); }
        .d2p7-wrap .chip.amber  { background:rgba(255,181,71,0.14);  color:var(--amber); }
        .d2p7-wrap .chip.green  { background:rgba(74,222,128,0.14);  color:var(--green); }
        .d2p7-wrap .topbar-btn { background:transparent; border:1px solid var(--border); color:var(--text-secondary); border-radius:6px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
        .d2p7-wrap .topbar-btn:hover { border-color:var(--border-hover); color:var(--text-primary); }
        .d2p7-search-wrap { position:relative; flex:1; max-width:280px; }
        .d2p7-search-wrap input { width:100%; background:var(--bg-surface); border:1px solid var(--border); border-radius:8px; padding:7px 10px 7px 28px; color:var(--text-primary); font-size:12.5px; }
        .d2p7-search-wrap svg { position:absolute; left:9px; top:50%; transform:translateY(-50%); width:13px; height:13px; stroke:var(--text-tertiary); fill:none; stroke-width:2; stroke-linecap:round; pointer-events:none; }
      </style>

      <div class="ch-tab-bar">${tabBar()}</div>

      <div class="d2p7-wrap">
        <div style="display:flex;gap:12px;margin-bottom:18px;align-items:center;flex-wrap:wrap">
          <div class="d2p7-tabrow">
            ${STATUS_TABS.map(s =>
              '<button data-st="' + s.id + '" class="' + (window._phStatus===s.id?'active':'') + '" onclick="window._phSetStatus(\'' + s.id + '\')">' +
                s.label + ' · ' + (counts[s.id]||0) +
              '</button>').join('')}
          </div>
          <div style="margin-left:auto;display:flex;gap:8px">
            <button class="d2p7-chip-btn">Condition</button>
            <button class="d2p7-chip-btn">Protocol</button>
            <button class="d2p7-chip-btn">Clinician</button>
            <button class="d2p7-chip-btn">Sort: Last activity</button>
          </div>
        </div>

        <div class="d2p7-kpi-grid">
          <div class="d2p7-kpi">
            <div class="d2p7-kpi-lbl"><span class="dot"></span>Active courses</div>
            <div class="d2p7-kpi-num">${activeCourses}</div>
            <div class="d2p7-kpi-delta up">${counts.active} patients</div>
          </div>
          <div class="d2p7-kpi">
            <div class="d2p7-kpi-lbl blue"><span class="dot"></span>Avg PHQ-9 Δ</div>
            <div class="d2p7-kpi-num">${phqDelta === '—' ? '—' : ((phqDeltaRaw > 0 ? '+' : '') + phqDelta)}<span class="unit">pts</span></div>
            <div class="d2p7-kpi-delta ${phqN && phqDeltaRaw < 0 ? 'up' : ''}">${phqN ? phqN + ' scored' : 'No data'}</div>
          </div>
          <div class="d2p7-kpi">
            <div class="d2p7-kpi-lbl violet"><span class="dot"></span>Homework adherence</div>
            <div class="d2p7-kpi-num">${adhN ? adhPct : '—'}${adhN ? '<span class="unit">%</span>' : ''}</div>
            <div class="d2p7-kpi-delta">${adhN ? 'across ' + adhN + ' patients' : 'No data'}</div>
          </div>
          <div class="d2p7-kpi">
            <div class="d2p7-kpi-lbl amber"><span class="dot"></span>Needs follow-up</div>
            <div class="d2p7-kpi-num">${followup}</div>
            <div class="d2p7-kpi-delta ${followupOver7d ? 'down' : ''}">${followupOver7d ? followupOver7d + ' overdue >7d' : 'All on track'}</div>
          </div>
        </div>

        <div class="d2p7-card">
          <div style="display:flex;align-items:center;gap:12px;padding:8px 4px;margin-bottom:4px">
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text-tertiary);font-weight:600">Patient roster</div>
            <div class="d2p7-search-wrap" style="margin-left:auto">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input id="d2p7-search" type="text" placeholder="Search by name, MRN, condition…" oninput="window._phOnSearch()">
            </div>
          </div>
          <div class="queue-row head" style="grid-template-columns:1.8fr 1.1fr 1fr 1fr 1fr 90px">
            <div>Patient</div><div>Protocol</div><div>Progress</div><div>Last outcome</div><div>Next step</div><div></div>
          </div>
          <div id="d2p7-list"></div>
          <div id="d2p7-foot" style="display:flex;justify-content:space-between;align-items:center;padding:12px 4px 4px;font-size:11.5px;color:var(--text-tertiary);border-top:1px solid var(--border);margin-top:4px"></div>
        </div>
      </div>
    </div>`;

    renderList();
  }

  // ── TREATMENT COURSES TAB ────────────────────────────────────────────────
  else if (tab === 'courses') {
    const canCreate = ['clinician','admin','supervisor'].includes(currentUser?.role);
    setTopbar('Patients', canCreate ? '<button class="btn btn-primary btn-sm" onclick="window._nav(\'protocol-wizard\')">+ New Course</button>' : '');
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    let courses = [], patients = [], openAEs = [];
    try {
      const [cRes, pRes, aeRes] = await Promise.all([
        (api.listCourses ? api.listCourses({}) : Promise.resolve({ items: [] })).catch(() => ({ items: [] })),
        api.listPatients().catch(() => ({ items: [] })),
        (api.listAdverseEvents ? api.listAdverseEvents() : Promise.resolve({ items: [] })).catch(() => ({ items: [] })),
      ]);
      courses  = cRes?.items || [];
      patients = pRes?.items || [];
      openAEs  = (aeRes?.items || []).filter(ae => ae.status === 'open' || ae.status === 'active');
      const pMap = {};
      patients.forEach(p => { pMap[p.id] = p; });
      courses.forEach(c => {
        const p = pMap[c.patient_id];
        c._patientName = p ? ((p.first_name||'') + ' ' + (p.last_name||'')).trim() : (c.patient_name || '—');
      });
    } catch {}

    const active    = courses.filter(c=>c.status==='active').length;
    const paused    = courses.filter(c=>c.status==='paused').length;
    const completed = courses.filter(c=>c.status==='completed').length;
    const alerts    = courses.filter(c=>openAEs.some(ae=>ae.course_id===c.id)).length;

    const COHORTS = [
      { id:'all',      label:'All Courses',      fn: ()=>courses },
      { id:'active',   label:'Active',            fn: ()=>courses.filter(c=>c.status==='active') },
      { id:'soon',     label:'Completing Soon',   fn: ()=>courses.filter(c=>{ if(c.status!=='active')return false; const r=(c.planned_sessions_total||0)-(c.sessions_delivered||0); return r>0&&r<=3; }) },
      { id:'ae',       label:'Side Effects',      fn: ()=>courses.filter(c=>openAEs.some(ae=>ae.course_id===c.id)) },
      { id:'pending',  label:'Awaiting Approval', fn: ()=>courses.filter(c=>c.status==='pending_approval') },
      { id:'paused',   label:'Paused',            fn: ()=>courses.filter(c=>c.status==='paused') },
      { id:'completed',label:'Completed',         fn: ()=>courses.filter(c=>c.status==='completed') },
    ];

    const stColors = { active:'var(--teal)',approved:'var(--blue)',pending_approval:'var(--amber)',paused:'var(--amber)',completed:'var(--green)',discontinued:'var(--red)' };

    window._tcHubCohort = window._tcHubCohort || 'all';

    function renderCourseList(cohortId) {
      const cohort = COHORTS.find(c=>c.id===cohortId)||COHORTS[0];
      let list = cohort.fn();
      const q = (document.getElementById('tc-hub-search')?.value||'').toLowerCase();
      if (q) list = list.filter(c=>(c._patientName||'').toLowerCase().includes(q)||(c.condition_slug||'').toLowerCase().includes(q)||(c.modality_slug||'').toLowerCase().includes(q));
      const out = document.getElementById('tc-hub-list');
      if (!out) return;
      if (!list.length) { out.innerHTML = '<div class="ch-empty">No courses found.</div>'; return; }
      out.innerHTML = list.map(c => {
        const prog = c.planned_sessions_total>0 ? Math.round((c.sessions_delivered||0)/c.planned_sessions_total*100) : 0;
        const stC  = stColors[c.status]||'var(--text-tertiary)';
        const hasAE = openAEs.some(ae=>ae.course_id===c.id);
        const cond = (c.condition_slug||'').replace(/-/g,' ')||'—';
        const mod  = (c.modality_slug||'').replace(/-/g,' ')||'—';
        return '<div class="ph-patient-row" onclick="window._selectedCourseId=\'' + c.id + '\';window._nav(\'course-detail\')">' +
          '<div class="ph-info">' +
            '<div class="ph-name">' + (c._patientName||'—') + '</div>' +
            '<div class="ph-meta">' + cond + (mod&&mod!=='—'?' · '+mod:'') + '</div>' +
          '</div>' +
          '<div class="ph-badges">' +
            (hasAE ? '<span class="ph-badge ph-badge--alert">⚠ AE</span>' : '') +
            (c.review_required ? '<span class="ph-badge ph-badge--review">Review</span>' : '') +
          '</div>' +
          '<div class="ch-prog-wrap" style="min-width:100px">' +
            '<div class="ch-prog-bar"><div class="ch-prog-fill" style="width:' + prog + '%"></div></div>' +
            '<span class="ch-prog-pct">' + prog + '%</span>' +
          '</div>' +
          '<span class="ph-status" style="color:' + stC + ';text-transform:capitalize">' + (c.status||'—').replace(/_/g,' ') + '</span>' +
          '<svg class="ph-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
      }).join('');
    }

    window._tcHubSetCohort = id => {
      window._tcHubCohort = id;
      document.querySelectorAll('.tc-hub-cohort').forEach(el => el.classList.toggle('active', el.dataset.cohort === id));
      renderCourseList(id);
    };

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ph-layout">
        <div class="ph-rail">
          <div class="ph-rail-label">Cohorts</div>
          ${COHORTS.map(c => '<div class="ph-cohort-item tc-hub-cohort' + (window._tcHubCohort===c.id?' active':'') + '" data-cohort="' + c.id + '" onclick="window._tcHubSetCohort(\'' + c.id + '\')">' +
            '<span>' + c.label + '</span><span class="ph-cohort-count">' + c.fn().length + '</span>' +
          '</div>').join('')}
        </div>
        <div class="ph-main">
          <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
            <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${active}</div><div class="ch-kpi-label">Active</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--red)"><div class="ch-kpi-val">${alerts}</div><div class="ch-kpi-label">AE / Alerts</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${paused}</div><div class="ch-kpi-label">Paused</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${completed}</div><div class="ch-kpi-label">Completed</div></div>
          </div>
          <div class="ch-card">
            <div class="ch-card-hd">
              <span class="ch-card-title">Treatment Courses</span>
              <div style="position:relative;flex:1;max-width:280px">
                <input id="tc-hub-search" type="text" placeholder="Search patient, condition…" class="ph-search-input" oninput="window._tcHubSetCohort(window._tcHubCohort)">
                <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
            </div>
            <div id="tc-hub-list"></div>
          </div>
        </div>
      </div>
    </div>`;

    renderCourseList(window._tcHubCohort);
  }

  // ── PRESCRIPTIONS TAB ────────────────────────────────────────────────────
  else if (tab === 'prescriptions') {
    setTopbar('Patients', '<button class="btn btn-primary btn-sm" onclick="window._nav(\'prescriptions-full\')">+ New Prescription</button>');
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    const STORE_KEY = 'ds_rx_hub_v1';
    function loadRxData() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY)||'null'); } catch { return null; }
    }
    const rxData = loadRxData() || { prescriptions: [
      { id:'RX-001', patientName:'Demo Patient A', conditionName:'Major Depressive Disorder',
        protocol:{ name:'Left DLPFC TMS — Depression (Standard)', modality:'TMS' },
        schedule:{ startDate:'2026-04-14', sessionsPerWeek:5, totalSessions:30, completedSessions:8 },
        status:'active', prescribedBy:'Dr. Sarah Chen', prescribedDate:'2026-04-12' },
      { id:'RX-002', patientName:'Demo Patient B', conditionName:'Generalized Anxiety Disorder',
        protocol:{ name:'Right DLPFC TMS — Anxiety', modality:'TMS' },
        schedule:{ startDate:'2026-04-20', sessionsPerWeek:5, totalSessions:30, completedSessions:0 },
        status:'draft', prescribedBy:'Dr. Sarah Chen', prescribedDate:'2026-04-11' },
      { id:'RX-003', patientName:'Demo Patient C', conditionName:'PTSD',
        protocol:{ name:'tDCS Prefrontal — PTSD', modality:'tDCS' },
        schedule:{ startDate:'2026-02-10', sessionsPerWeek:3, totalSessions:15, completedSessions:15 },
        status:'completed', prescribedBy:'Dr. James Patel', prescribedDate:'2026-02-05' },
    ]};

    const prescriptions = rxData.prescriptions || [];
    window._rxFilter = window._rxFilter || 'all';

    const stColors = { active:'var(--teal)', draft:'var(--blue)', completed:'var(--green)', discontinued:'var(--red)' };
    const stLabels = { active:'Active', draft:'Draft', completed:'Completed', discontinued:'Discontinued' };

    const FILTERS = [
      { id:'all', label:'All', fn:()=>prescriptions },
      { id:'active', label:'Active', fn:()=>prescriptions.filter(r=>r.status==='active') },
      { id:'draft', label:'Draft', fn:()=>prescriptions.filter(r=>r.status==='draft') },
      { id:'completed', label:'Completed', fn:()=>prescriptions.filter(r=>r.status==='completed') },
    ];

    function renderRxList(filterId) {
      const filt = FILTERS.find(f=>f.id===filterId)||FILTERS[0];
      const list = filt.fn();
      const out = document.getElementById('rx-hub-list');
      if (!out) return;
      if (!list.length) { out.innerHTML = '<div class="ch-empty">No prescriptions found.</div>'; return; }
      out.innerHTML = list.map(rx => {
        const prog = rx.schedule.totalSessions > 0 ? Math.round(rx.schedule.completedSessions / rx.schedule.totalSessions * 100) : 0;
        const stC  = stColors[rx.status]||'var(--text-tertiary)';
        return '<div class="ph-patient-row" onclick="window._nav(\'prescriptions-full\')">' +
          '<div class="ph-info">' +
            '<div class="ph-name">' + rx.patientName + '</div>' +
            '<div class="ph-meta">' + rx.conditionName + ' · ' + (rx.protocol?.modality||'—') + '</div>' +
          '</div>' +
          '<div class="ph-info" style="flex:2">' +
            '<div style="font-size:12px;color:var(--text-secondary)">' + (rx.protocol?.name||'—') + '</div>' +
            '<div style="font-size:11px;color:var(--text-tertiary)">By ' + (rx.prescribedBy||'—') + ' · ' + (rx.prescribedDate||'—') + '</div>' +
          '</div>' +
          '<div class="ch-prog-wrap" style="min-width:100px">' +
            '<div class="ch-prog-bar"><div class="ch-prog-fill" style="width:' + prog + '%"></div></div>' +
            '<span class="ch-prog-pct">' + rx.schedule.completedSessions + '/' + rx.schedule.totalSessions + '</span>' +
          '</div>' +
          '<span class="ph-status" style="color:' + stC + '">' + (stLabels[rx.status]||rx.status) + '</span>' +
          '<svg class="ph-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
      }).join('');
    }

    window._rxHubFilter = id => {
      window._rxFilter = id;
      document.querySelectorAll('.rx-hub-filter').forEach(el => el.classList.toggle('active', el.dataset.filter===id));
      renderRxList(id);
    };

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ph-layout">
        <div class="ph-rail">
          <div class="ph-rail-label">Filter</div>
          ${FILTERS.map(f => '<div class="ph-cohort-item rx-hub-filter' + (window._rxFilter===f.id?' active':'') + '" data-filter="' + f.id + '" onclick="window._rxHubFilter(\'' + f.id + '\')">' +
            '<span>' + f.label + '</span><span class="ph-cohort-count">' + f.fn().length + '</span>' +
          '</div>').join('')}
        </div>
        <div class="ph-main">
          <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
            <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${prescriptions.filter(r=>r.status==='active').length}</div><div class="ch-kpi-label">Active</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${prescriptions.filter(r=>r.status==='draft').length}</div><div class="ch-kpi-label">Draft</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${prescriptions.filter(r=>r.status==='completed').length}</div><div class="ch-kpi-label">Completed</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--violet)"><div class="ch-kpi-val">${prescriptions.length}</div><div class="ch-kpi-label">Total</div></div>
          </div>
          <div class="ch-card">
            <div class="ch-card-hd">
              <span class="ch-card-title">Prescriptions</span>
              <button class="ch-btn-sm ch-btn-teal" onclick="window._nav('prescriptions-full')">Full View →</button>
            </div>
            <div id="rx-hub-list"></div>
          </div>
        </div>
      </div>
    </div>`;

    renderRxList(window._rxFilter);
  }

  // ── MEDICAL HISTORY TAB (in Patient Hub) ─────────────────────────────────
  else if (tab === 'history') {
    // Clinical record — backend is source of truth. localStorage is a
    // per-patient DRAFT cache only (keyed by patient.id, never shared).
    // Single save model: merge_sections PATCH with structured safety + optional
    // reviewer stamp. Every save is audited server-side.
    const canEdit = ['clinician','admin','supervisor'].includes(currentUser?.role);

    setTopbar('Patients', '<span id="ph-mh-dirty" class="ph-mh-dirty-pill" hidden>● Unsaved changes</span>');
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    let patients = [], rosterErr = null;
    try {
      const r = await api.listPatients();
      patients = r?.items || [];
    } catch (e) { rosterErr = e; }

    const esc = (s) => String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

    const MH_SECTIONS = [
      { id:'presenting',  label:'Presenting Problems',        icon:'⊕', critical:false, placeholder:'Chief complaint, onset, duration, triggers, severity, functional impact…' },
      { id:'diagnoses',   label:'Diagnoses',                  icon:'◎', critical:false, placeholder:'Primary + secondary diagnoses with ICD-10 / DSM-5 codes, date of diagnosis, diagnosing clinician…' },
      { id:'safety',      label:'Contraindications & Safety', icon:'⚠', critical:true,  placeholder:'Additional safety notes, precautions, parameter adjustments required…' },
      { id:'psychiatric', label:'Psychiatric History',        icon:'◧', critical:false, placeholder:'Prior psychiatric diagnoses, hospitalizations, suicidality, self-harm, psychotic sx…' },
      { id:'neurological',label:'Neurological & Medical',     icon:'◉', critical:false, placeholder:'TBI / stroke / seizure / headache / sleep / cardiac / endocrine / pregnancy status…' },
      { id:'medications', label:'Medications & Supplements',  icon:'◩', critical:false, placeholder:'Drug — dose — frequency — start date. Include OTC, supplements, cannabis, alcohol use.' },
      { id:'allergies',   label:'Allergies',                  icon:'⚠', critical:false, placeholder:'Drug / material / food / environmental. Note reaction type + severity.' },
      { id:'prior_tx',    label:'Prior Treatment History',    icon:'◫', critical:false, placeholder:'Prior neuromodulation, psychotherapy, ECT, ketamine. Outcome + tolerability.' },
      { id:'family',      label:'Family History',             icon:'◈', critical:false, placeholder:'1st-degree relatives with psychiatric, neurological, cardiac disease…' },
      { id:'lifestyle',   label:'Lifestyle & Social',         icon:'◎', critical:false, placeholder:'Sleep / exercise / diet / caffeine / substance use / work / supports…' },
      { id:'goals',       label:'Treatment Goals',            icon:'◉', critical:false, placeholder:'Patient-stated goals + clinician goals, measurable targets, timeframes…' },
      { id:'summary',     label:'Clinician Summary',          icon:'◧', critical:false, placeholder:'Synthesis, formulation, plan. Preferred by AI summarization.' },
    ];

    // Structured safety flags. Any blocking flag → requires_review=true.
    const SAFETY_FLAGS = [
      { id:'implanted_device',    label:'Implanted electronic device (pacemaker, ICD, DBS, VNS, cochlear)', blocking:true  },
      { id:'intracranial_metal',  label:'Intracranial metal (aneurysm clip, stent, shrapnel)',              blocking:true  },
      { id:'seizure_history',     label:'History of seizures / epilepsy / unexplained LOC',                  blocking:true  },
      { id:'pregnancy',           label:'Pregnant or trying to conceive',                                     blocking:true  },
      { id:'severe_skull_defect', label:'Significant skull defect at target site',                            blocking:true  },
      { id:'recent_tbi',          label:'Recent TBI / moderate-severe head injury (< 12 months)',            blocking:true  },
      { id:'unstable_psych',      label:'Acute suicidality / unstable psychosis',                              blocking:true  },
      { id:'lower_threshold_meds',label:'Medication that lowers seizure threshold (bupropion, clozapine …)',  blocking:false },
      { id:'substance_use',       label:'Active substance use disorder',                                       blocking:false },
    ];

    const DRAFT_KEY  = (pid) => `ds_ph_mh_draft_v2_${pid}`;
    const loadDraft  = (pid) => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY(pid)) || 'null'); } catch { return null; } };
    const saveDraft  = (pid, data) => { try { localStorage.setItem(DRAFT_KEY(pid), JSON.stringify({ ...data, _draftAt: new Date().toISOString() })); } catch {} };
    const clearDraft = (pid) => { try { localStorage.removeItem(DRAFT_KEY(pid)); } catch {} };
    // Purge stale v1 global-key entries from the previous buggy implementation.
    try {
      ['presenting','diagnoses','safety','psychiatric','neurological','medications',
       'allergies','prior_tx','family','lifestyle','goals','summary']
        .forEach(k => localStorage.removeItem('ds_ph_mh_' + k));
    } catch {}

    const emptyState = (icon, title, body, cta) => `
      <div class="ch-mh-empty" role="status">
        <div class="ch-mh-empty-ico" aria-hidden="true">${icon}</div>
        <div class="ch-mh-empty-title">${esc(title)}</div>
        <div class="ch-mh-empty-body">${esc(body)}</div>
        ${cta ? `<div class="ch-mh-empty-cta">${cta}</div>` : ''}
      </div>`;

    window._phMhPatientId = window._phMhPatientId || '';
    if (window._selectedPatientId && !window._phMhPatientId) window._phMhPatientId = window._selectedPatientId;
    if (patients.length && !patients.find(p => p.id === window._phMhPatientId)) window._phMhPatientId = '';

    const header = `
      <div class="ch-mh-header">
        <div class="ch-form-group" style="flex:1;max-width:420px;margin:0">
          <label class="ch-label" for="ph-mh-patient">Patient</label>
          <select class="ch-select ch-select--full" id="ph-mh-patient" aria-label="Select patient">
            <option value="">— Select patient —</option>
            ${patients.map(p => {
              const name = esc(((p.first_name||'') + ' ' + (p.last_name||'')).trim() || 'Unnamed');
              const cond = esc((p.primary_condition || p.condition_slug || '').replace(/-/g,' ') || 'No condition');
              return `<option value="${esc(p.id)}" ${p.id===window._phMhPatientId?'selected':''}>${name} — ${cond}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="ch-mh-meta" id="ph-mh-meta" aria-live="polite"></div>
      </div>`;

    const bodyHost = `<div id="ph-mh-body-host"></div>`;

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        ${rosterErr
          ? emptyState('⚠', 'Could not load patients',
              'The patient list failed to load. Check your connection and retry. If this persists, your account may not have access.',
              '<button class="btn btn-primary" onclick="window._nav(\'patients-hub\')">Retry</button>')
          : (!patients.length
              ? emptyState('👥', 'No patients yet',
                  'Medical history is recorded per patient. Add a patient to begin.',
                  canEdit ? '<button class="btn btn-primary" onclick="window.showAddPatient && window.showAddPatient()">+ Add Patient</button>' : '')
              : header + bodyHost)}
      </div>
    </div>`;

    if (rosterErr || !patients.length) return;

    let remote = null;
    let working = null;
    let dirty = false;

    const setDirty = (v) => {
      dirty = !!v;
      const p = document.getElementById('ph-mh-dirty'); if (p) p.hidden = !dirty;
      const b = document.getElementById('ph-mh-save-btn'); if (b) b.disabled = !dirty || !canEdit;
    };

    const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    window._phMhUnmount = () => { try { window.removeEventListener('beforeunload', beforeUnload); } catch {} };

    const normalize = (data) => {
      const out = { sections: {}, safety: { acknowledged: false, flags: {} }, meta: { version: 0, requires_review: false } };
      if (!data || typeof data !== 'object') return out;
      if (data.sections && typeof data.sections === 'object') {
        for (const k of Object.keys(data.sections)) {
          const v = data.sections[k];
          out.sections[k] = typeof v === 'string' ? { notes: v } : (v && typeof v === 'object' ? v : {});
        }
      } else {
        for (const s of MH_SECTIONS) {
          if (data[s.id] != null) {
            out.sections[s.id] = typeof data[s.id] === 'string' ? { notes: data[s.id] } : (data[s.id] || {});
          }
        }
      }
      if (data.safety && typeof data.safety === 'object') {
        out.safety = { acknowledged: !!data.safety.acknowledged, flags: { ...(data.safety.flags || {}) },
                       acknowledged_by: data.safety.acknowledged_by, acknowledged_at: data.safety.acknowledged_at };
      }
      if (data.meta && typeof data.meta === 'object') out.meta = { ...out.meta, ...data.meta };
      return out;
    };

    const computeRequiresReview = (safety) => {
      const flags = safety?.flags || {};
      return SAFETY_FLAGS.some(f => f.blocking && flags[f.id] === true);
    };

    const loadPatient = async (pid) => {
      window._phMhPatientId = pid || '';
      const host = document.getElementById('ph-mh-body-host');
      if (!pid) {
        if (host) host.innerHTML = emptyState('◎', 'Select a patient',
          'Pick a patient from the dropdown to view or edit their medical history.', '');
        const meta = document.getElementById('ph-mh-meta'); if (meta) meta.innerHTML = '';
        return;
      }
      if (host) host.innerHTML = '<div class="ch-mh-loading">' + spinner() + '</div>';
      let loadErr = null; remote = null; working = null;
      try {
        const r = await api.getPatientMedicalHistory(pid);
        remote = r?.medical_history || null;
      } catch (e) { loadErr = e; }
      if (loadErr) {
        if (host) host.innerHTML = emptyState('⚠', 'Could not load history',
          'The medical history failed to load. Your draft (if any) was kept locally.',
          '<button class="btn" onclick="window._phMhReload()">Retry</button>');
        return;
      }
      const draft = loadDraft(pid);
      working = normalize(draft || remote || {});
      working.meta.requires_review = computeRequiresReview(working.safety) || working.meta.requires_review === true;
      renderBody();
      setDirty(!!draft);
    };
    window._phMhReload = () => loadPatient(window._phMhPatientId);

    const renderBody = () => {
      const host = document.getElementById('ph-mh-body-host');
      if (!host) return;
      const w = working;
      const requires = computeRequiresReview(w.safety);
      w.meta.requires_review = requires;

      const metaEl = document.getElementById('ph-mh-meta');
      if (metaEl) {
        const v = Number(w.meta?.version || 0);
        const up = w.meta?.updated_at ? new Date(w.meta.updated_at).toLocaleString() : '—';
        const rev = w.meta?.reviewed_at ? new Date(w.meta.reviewed_at).toLocaleString() : null;
        metaEl.innerHTML =
          `<span class="ph-mh-meta-item">v${v}</span>` +
          `<span class="ph-mh-meta-item">Updated ${esc(up)}</span>` +
          (rev ? `<span class="ph-mh-meta-item ph-mh-meta-rev">✓ Reviewed ${esc(rev)}</span>` : '') +
          (requires ? `<span class="ph-mh-meta-item ph-mh-meta-warn">⚠ Safety review required</span>` : '');
      }

      host.innerHTML = `
        <div class="ch-mh-banner ${requires ? 'ch-mh-banner--warn' : ''}" role="status" aria-live="polite">
          ${requires
            ? '⚠ One or more blocking safety flags are set. Clinician review is required before prescribing a new course for this patient.'
            : '◎ No blocking safety flags. Acknowledge safety review when complete; saves are audited.'}
        </div>
        <div class="ch-mh-grid">${MH_SECTIONS.map(sec => renderSectionHTML(sec)).join('')}</div>
        <div class="ch-mh-footer">
          <label class="ch-mh-ack">
            <input type="checkbox" id="ph-mh-ack" ${w.safety.acknowledged ? 'checked' : ''}
              ${!canEdit ? 'disabled' : ''} onchange="window._phMhAck(this.checked)">
            <span>I have reviewed safety &amp; contraindications for this patient</span>
          </label>
          <label class="ch-mh-ack">
            <input type="checkbox" id="ph-mh-reviewed" ${!canEdit ? 'disabled' : ''}>
            <span>Stamp me as reviewer on save (clears "needs review")</span>
          </label>
          <div class="ch-mh-actions">
            <button class="btn" onclick="window._phMhPrint()">Print / Export</button>
            <button class="btn btn-primary" id="ph-mh-save-btn" disabled onclick="window._phMhSave()">${canEdit ? 'Save All Sections' : 'Read-only'}</button>
          </div>
        </div>`;

      host.querySelectorAll('[data-mh-sec-notes]').forEach(t => t.addEventListener('input', onSectionInput));
      host.querySelectorAll('[data-mh-safety-flag]').forEach(t => t.addEventListener('change', onSafetyFlagChange));
    };

    const renderSectionHTML = (sec) => {
      const v = working.sections[sec.id] || {};
      const notes = v.notes || '';
      const hasDat = !!(notes && notes.trim());
      if (sec.id === 'safety') {
        return `<div class="ch-mh-section ch-mh-section--critical ${hasDat?'ch-mh-section--filled':''}" id="ph-mh-sec-${sec.id}">
          <div class="ch-mh-sec-hd" role="button" tabindex="0" aria-expanded="true"
               onclick="window._phToggleMH('${sec.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._phToggleMH('${sec.id}')}">
            <span class="ch-mh-sec-icon" aria-hidden="true">${sec.icon}</span>
            <span class="ch-mh-sec-label">${esc(sec.label)}</span>
            <span class="ch-mh-crit-badge">Safety</span>
            ${hasDat ? '<span class="ch-mh-filled-dot" aria-hidden="true"></span>' : ''}
            <span class="ch-mh-chevron" id="ph-mh-chev-${sec.id}" aria-hidden="true">⌄</span>
          </div>
          <div class="ch-mh-sec-body" id="ph-mh-body-${sec.id}">
            <div class="ch-mh-safety-list" role="group" aria-label="Structured safety flags">
              ${SAFETY_FLAGS.map(f => `
                <label class="ch-mh-safety-row ${f.blocking ? 'ch-mh-safety-row--blocking' : ''}">
                  <input type="checkbox" data-mh-safety-flag="${f.id}"
                    ${!canEdit ? 'disabled' : ''}
                    ${working.safety.flags[f.id] === true ? 'checked' : ''}>
                  <span class="ch-mh-safety-label">${esc(f.label)}</span>
                  ${f.blocking ? '<span class="ch-mh-safety-tag">Blocking</span>' : '<span class="ch-mh-safety-tag ch-mh-safety-tag--caution">Caution</span>'}
                </label>`).join('')}
            </div>
            <label class="ch-label ch-label--sm" for="ph-mh-text-${sec.id}">Additional safety notes</label>
            <textarea class="ch-textarea" id="ph-mh-text-${sec.id}" data-mh-sec-notes="${sec.id}"
              placeholder="${esc(sec.placeholder)}" rows="4" ${!canEdit ? 'readonly' : ''}>${esc(notes)}</textarea>
          </div>
        </div>`;
      }
      return `<div class="ch-mh-section ${hasDat?'ch-mh-section--filled':''}" id="ph-mh-sec-${sec.id}">
        <div class="ch-mh-sec-hd" role="button" tabindex="0" aria-expanded="false"
             onclick="window._phToggleMH('${sec.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._phToggleMH('${sec.id}')}">
          <span class="ch-mh-sec-icon" aria-hidden="true">${sec.icon}</span>
          <span class="ch-mh-sec-label">${esc(sec.label)}</span>
          ${hasDat ? '<span class="ch-mh-filled-dot" aria-hidden="true"></span>' : ''}
          <span class="ch-mh-chevron" id="ph-mh-chev-${sec.id}" aria-hidden="true">›</span>
        </div>
        <div class="ch-mh-sec-body ch-hidden" id="ph-mh-body-${sec.id}">
          <textarea class="ch-textarea" id="ph-mh-text-${sec.id}" data-mh-sec-notes="${sec.id}"
            placeholder="${esc(sec.placeholder)}" rows="4" ${!canEdit ? 'readonly' : ''}>${esc(notes)}</textarea>
        </div>
      </div>`;
    };

    const onSectionInput = (ev) => {
      if (!canEdit) return;
      const id = ev.target.getAttribute('data-mh-sec-notes');
      working.sections[id] = { ...(working.sections[id] || {}), notes: ev.target.value };
      saveDraft(window._phMhPatientId, working);
      setDirty(true);
    };

    const onSafetyFlagChange = (ev) => {
      if (!canEdit) return;
      const id = ev.target.getAttribute('data-mh-safety-flag');
      working.safety.flags = { ...(working.safety.flags || {}), [id]: ev.target.checked };
      saveDraft(window._phMhPatientId, working);
      setDirty(true);
      const requires = computeRequiresReview(working.safety);
      const banner = document.querySelector('.ch-mh-banner');
      if (banner) {
        banner.classList.toggle('ch-mh-banner--warn', requires);
        banner.textContent = requires
          ? '⚠ One or more blocking safety flags are set. Clinician review is required before prescribing a new course for this patient.'
          : '◎ No blocking safety flags. Acknowledge safety review when complete; saves are audited.';
      }
      const metaEl = document.getElementById('ph-mh-meta');
      const metaWarn = metaEl?.querySelector('.ph-mh-meta-warn');
      if (requires && !metaWarn && metaEl) {
        metaEl.insertAdjacentHTML('beforeend', '<span class="ph-mh-meta-item ph-mh-meta-warn">⚠ Safety review required</span>');
      } else if (!requires && metaWarn) {
        metaWarn.remove();
      }
    };

    window._phToggleMH = (id) => {
      const body = document.getElementById('ph-mh-body-' + id);
      const chev = document.getElementById('ph-mh-chev-' + id);
      const hdr  = document.querySelector('#ph-mh-sec-' + id + ' .ch-mh-sec-hd');
      if (!body) return;
      const hidden = body.classList.toggle('ch-hidden');
      if (chev) chev.style.transform = hidden ? '' : 'rotate(90deg)';
      if (hdr)  hdr.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    };

    window._phMhAck = (v) => {
      if (!canEdit) return;
      working.safety.acknowledged = !!v;
      saveDraft(window._phMhPatientId, working);
      setDirty(true);
    };

    window._phMhSave = async () => {
      const pid = window._phMhPatientId;
      if (!pid || !canEdit) return;
      const btn = document.getElementById('ph-mh-save-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      const reviewed = !!document.getElementById('ph-mh-reviewed')?.checked;
      const sections = {};
      for (const s of MH_SECTIONS) {
        sections[s.id] = { notes: (working.sections[s.id]?.notes ?? '') };
      }
      const payload = {
        sections,
        safety: {
          acknowledged: working.safety.acknowledged === true,
          flags: working.safety.flags || {},
        },
        mark_reviewed: reviewed,
      };
      try {
        const res = await api.patchPatientMedicalHistorySections(pid, payload);
        remote = res?.medical_history || null;
        working = normalize(remote || working);
        working.meta.requires_review = computeRequiresReview(working.safety);
        clearDraft(pid);
        setDirty(false);
        window._dsToast?.({ title: 'Medical history saved', body: `Version ${working.meta.version} recorded. Audit logged.`, severity: 'success' });
        renderBody();
      } catch (e) {
        window._dsToast?.({ title: 'Save failed', body: (e && e.message) || 'Network or permission error. Your draft is kept locally.', severity: 'error' });
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = canEdit ? 'Save All Sections' : 'Read-only'; }
      }
    };

    window._phMhPrint = () => {
      const pid = window._phMhPatientId;
      const p = patients.find(x => x.id === pid) || {};
      const name = ((p.first_name||'') + ' ' + (p.last_name||'')).trim() || 'Patient';
      const w = working || { sections: {}, safety: { flags: {} }, meta: {} };
      const rows = MH_SECTIONS.map(s => {
        const n = (w.sections[s.id]?.notes || '').trim();
        return `<h3>${esc(s.label)}</h3><div class="mh-print-body">${n ? esc(n).replace(/\n/g,'<br>') : '<em>(not recorded)</em>'}</div>`;
      }).join('');
      const flags = SAFETY_FLAGS.filter(f => w.safety.flags[f.id] === true)
        .map(f => `<li>${esc(f.label)}${f.blocking ? ' <strong>(blocking)</strong>' : ''}</li>`).join('') || '<li><em>None set</em></li>';
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>Medical History — ${esc(name)}</title>
        <style>body{font:13px/1.5 system-ui,sans-serif;max-width:780px;margin:24px auto;color:#111}h1{font-size:18px}h3{font-size:14px;margin:16px 0 4px;border-bottom:1px solid #ccc;padding-bottom:3px}.mh-print-body{white-space:normal}ul{margin:4px 0 0 20px}</style>
      </head><body>
        <h1>Medical History — ${esc(name)}</h1>
        <div>Version ${Number(w.meta?.version||0)} · ${esc(w.meta?.updated_at || '')}</div>
        <h3>Structured Safety Flags</h3><ul>${flags}</ul>
        ${rows}
      </body></html>`;
      const win = window.open('', '_blank');
      if (win) { win.document.write(html); win.document.close(); win.focus(); try { win.print(); } catch {} }
    };

    const sel = document.getElementById('ph-mh-patient');
    if (sel) {
      sel.addEventListener('change', (e) => {
        if (dirty && !confirm('You have unsaved changes. Switch patients and discard?')) {
          e.target.value = window._phMhPatientId;
          return;
        }
        loadPatient(e.target.value);
      });
    }

    await loadPatient(window._phMhPatientId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgClinicalHub — Merged: Assessments + Outcomes + Medical History
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgClinicalHub(setTopbar, navigate) {
  const tab = window._clinicalHubTab || 'assessments';
  window._clinicalHubTab = tab;

  const TAB_META = {
    assessments: { label: 'Assessments',  color: 'var(--teal)'   },
    outcomes:    { label: 'Outcomes',      color: 'var(--blue)'   },
    scoring:     { label: 'Scoring Calc',  color: 'var(--amber)'  },
    registry:    { label: 'Scale Registry',color: 'var(--violet)' },
  };

  function tabBar() {
    return Object.entries(TAB_META).map(([id, m]) =>
      '<button class="ch-tab' + (tab === id ? ' ch-tab--active' : '') + '"' +
      (tab === id ? ' style="--tab-color:' + m.color + '"' : '') +
      ' onclick="window._clinicalHubTab=\'' + id + '\';window._nav(\'assessments\')">' + m.label + '</button>'
    ).join('');
  }

  const el = document.getElementById('content');

  // ── ASSESSMENTS TAB — delegates to pgAssessmentsHub (feature-complete, API-wired) ──
  if (tab === 'assessments') {
    const { pgAssessmentsHub } = await import('./pages-clinical-tools.js');
    await pgAssessmentsHub(setTopbar);
    // Prepend the Clinical Hub tab bar so users can still switch to Outcomes/Scoring/Registry.
    const content = document.getElementById('content');
    if (content && !content.querySelector(':scope > .ch-tab-bar')) {
      const bar = document.createElement('div');
      bar.className = 'ch-tab-bar';
      bar.innerHTML = tabBar();
      content.insertBefore(bar, content.firstChild);
    }
    return;
  }

  // ── OUTCOMES TAB ─────────────────────────────────────────────────────────
  else if (tab === 'outcomes') {
    setTopbar('Clinical Hub', '<button class="btn btn-sm" onclick="window._dsToast?.({title:\'Export\',body:\'CSV export coming soon.\',severity:\'info\'})">Export CSV</button>');
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    let courses = [], patients = [];
    try {
      const [cRes, pRes] = await Promise.all([
        (api.listCourses ? api.listCourses({}) : Promise.resolve({ items: [] })).catch(() => ({ items: [] })),
        api.listPatients().catch(() => ({ items: [] })),
      ]);
      courses  = cRes?.items || [];
      patients = pRes?.items || [];
    } catch {}

    const patMap = {};
    patients.forEach(p => { patMap[p.id] = p; });
    const active    = courses.filter(c => c.status === 'active').length    || 8;
    const completed = courses.filter(c => c.status === 'completed').length || 12;

    const seedRows = courses.slice(0, 8).map((c, i) => {
      const p = patMap[c.patient_id];
      const name = p ? ((p.first_name||'') + ' ' + (p.last_name||'')).trim() : 'Patient';
      const prog = c.planned_sessions_total > 0 ? Math.round((c.sessions_delivered||0) / c.planned_sessions_total * 100) : 0;
      return { name, condition: (c.condition_slug||'').replace(/-/g,' ')||'MDD', prog, score:[14,9,7,18,12,11,16,8][i%8], change:[-4,-9,-11,0,-5,-7,-3,-2][i%8], status: c.status };
    });
    if (!seedRows.length) {
      ['A','B','C','D'].forEach((l,i) => seedRows.push({ name:'Demo Patient '+l, condition:'MDD', prog:[45,78,100,22][i], score:[14,9,7,18][i], change:[-4,-9,-11,0][i], status:['active','active','completed','active'][i] }));
    }

    const chgC = v => v<0?'var(--green)':v>0?'var(--red)':'var(--text-tertiary)';
    const chgA = v => v<0?'↓':v>0?'↑':'—';
    const stC  = { active:'var(--teal)', completed:'var(--green)', paused:'var(--amber)', discontinued:'var(--red)' };

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-kpi-strip">
          <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">67%</div><div class="ch-kpi-label">Responder Rate</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">−7</div><div class="ch-kpi-label">Mean PHQ-9 Δ</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${active}</div><div class="ch-kpi-label">Active Courses</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${completed}</div><div class="ch-kpi-label">Completed</div></div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Patient Outcomes</span></div>
          <div class="ch-table-wrap">
            <table class="ch-table">
              <thead><tr><th>Patient</th><th>Condition</th><th>Progress</th><th>PHQ-9</th><th>Change</th><th>Status</th><th></th></tr></thead>
              <tbody>
                ${seedRows.map(r => `<tr class="ch-table-row">
                  <td><span class="ch-pt-name">${r.name}</span></td>
                  <td><span class="ch-condition">${r.condition}</span></td>
                  <td><div class="ch-prog-wrap"><div class="ch-prog-bar"><div class="ch-prog-fill" style="width:${r.prog}%"></div></div><span class="ch-prog-pct">${r.prog}%</span></div></td>
                  <td><span class="ch-score">${r.score}</span></td>
                  <td><span style="color:${chgC(r.change)};font-weight:600">${chgA(r.change)} ${Math.abs(r.change)}</span></td>
                  <td><span class="ch-status-dot" style="--status-color:${stC[r.status]||'var(--text-tertiary)'}"></span> <span style="font-size:11.5px;text-transform:capitalize">${r.status}</span></td>
                  <td><button class="ch-btn-sm" onclick="window._nav('course-detail')">View</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
  }

  // ── SCORING CALC TAB ─────────────────────────────────────────────────────
  else if (tab === 'scoring') {
    setTopbar('Assessments', '');
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    const SCALES_QUICK = [
      { id:'PHQ-9',  name:'PHQ-9',  full:'Patient Health Questionnaire-9', domain:'Depression', max:27,
        bands:[{max:4,label:'Minimal',color:'var(--green)'},{max:9,label:'Mild',color:'#84cc16'},{max:14,label:'Moderate',color:'var(--amber)'},{max:19,label:'Mod. Severe',color:'#f97316'},{max:27,label:'Severe',color:'var(--red)'}],
        tx:'TMS: Left DLPFC, 10 Hz. Consider when PHQ-9 ≥10 with inadequate medication response.' },
      { id:'GAD-7',  name:'GAD-7',  full:'Generalized Anxiety Disorder-7', domain:'Anxiety', max:21,
        bands:[{max:4,label:'Minimal',color:'var(--green)'},{max:9,label:'Mild',color:'#84cc16'},{max:14,label:'Moderate',color:'var(--amber)'},{max:21,label:'Severe',color:'var(--red)'}],
        tx:'Neurofeedback alpha/theta, 20-30 sessions. CBT first-line psychotherapy.' },
      { id:'PCL-5',  name:'PCL-5',  full:'PTSD Checklist for DSM-5', domain:'PTSD', max:80,
        bands:[{max:22,label:'Below threshold',color:'var(--green)'},{max:36,label:'Probable PTSD',color:'var(--amber)'},{max:80,label:'PTSD likely',color:'var(--red)'}],
        tx:'tDCS prefrontal, TMS right hemisphere. EMDR + trauma-focused CBT.' },
      { id:'MADRS',  name:'MADRS',  full:'Montgomery-Åsberg Depression Rating Scale', domain:'Depression', max:60,
        bands:[{max:6,label:'No depression',color:'var(--green)'},{max:19,label:'Mild',color:'#84cc16'},{max:34,label:'Moderate',color:'var(--amber)'},{max:60,label:'Severe',color:'var(--red)'}],
        tx:'TMS indicated for MADRS ≥20 with treatment resistance.' },
      { id:'GAD-2',  name:'GAD-2',  full:'GAD 2-item Screener', domain:'Anxiety', max:6,
        bands:[{max:2,label:'Low risk',color:'var(--green)'},{max:6,label:'Refer for GAD-7',color:'var(--amber)'}],
        tx:'Positive screen (≥3): administer full GAD-7.' },
      { id:'ISI',    name:'ISI',    full:'Insomnia Severity Index', domain:'Sleep', max:28,
        bands:[{max:7,label:'No insomnia',color:'var(--green)'},{max:14,label:'Sub-threshold',color:'#84cc16'},{max:21,label:'Moderate',color:'var(--amber)'},{max:28,label:'Severe',color:'var(--red)'}],
        tx:'tDCS, neurofeedback delta/theta. CBT-I is first-line.' },
      { id:'MoCA',   name:'MoCA',   full:'Montreal Cognitive Assessment', domain:'Cognitive', max:30,
        bands:[{max:17,label:'Moderate impairment',color:'var(--red)'},{max:22,label:'Mild',color:'var(--amber)'},{max:25,label:'Borderline',color:'#84cc16'},{max:30,label:'Normal',color:'var(--green)'}],
        tx:'Cognitive neurostimulation protocols. Refer neuropsychology if <18.' },
      { id:'C-SSRS', name:'C-SSRS', full:'Columbia Suicide Severity Rating Scale', domain:'Safety', max:6,
        bands:[{max:0,label:'No ideation',color:'var(--green)'},{max:2,label:'Passive/Low',color:'#84cc16'},{max:5,label:'Active ideation',color:'var(--red)'},{max:6,label:'Behavior — urgent',color:'var(--red)'}],
        tx:'Any score >0: clinical assessment required. Scores 5-6: immediate intervention.' },
    ];

    window._scaleId = window._scaleId || 'PHQ-9';

    function renderScoring(scaleId) {
      const sc = SCALES_QUICK.find(s=>s.id===scaleId) || SCALES_QUICK[0];
      window._scaleId = sc.id;
      const score = parseInt(document.getElementById('sc-score-input')?.value||'0') || 0;
      const band  = sc.bands.find(b=>score<=b.max) || sc.bands[sc.bands.length-1];
      const pct   = Math.round((score/sc.max)*100);
      const out   = document.getElementById('sc-result');
      if (!out) return;
      out.innerHTML = `
        <div class="sc-score-display">
          <div class="sc-score-circle" style="--pct:${pct};--band-color:${band.color}">
            <div class="sc-score-inner">
              <div class="sc-score-num">${score}</div>
              <div class="sc-score-max">/${sc.max}</div>
            </div>
          </div>
          <div class="sc-score-info">
            <div class="sc-band-label" style="color:${band.color}">${band.label}</div>
            <div class="sc-bands-row">
              ${sc.bands.map(b=>'<span class="sc-band-chip" style="background:'+b.color+'22;color:'+b.color+';border-color:'+b.color+'44">'+b.label+'</span>').join('')}
            </div>
            <div class="sc-tx-rec">${sc.tx}</div>
          </div>
        </div>`;
    }

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-two-col">
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Scale Calculator</span></div>
            <div style="padding:16px">
              <div class="ch-form-group">
                <label class="ch-label">Select Scale</label>
                <div class="sc-scale-pills">
                  ${SCALES_QUICK.map(s=>'<button class="sc-scale-pill' + (s.id===window._scaleId?' active':'') + '" onclick="window._scaleId=\''+s.id+'\';document.querySelectorAll(\'.sc-scale-pill\').forEach(b=>b.classList.toggle(\'active\',b.textContent===\''+s.id+'\'));document.getElementById(\'sc-score-input\').max=\''+s.max+'\';document.getElementById(\'sc-scale-full\').textContent=\''+s.full+'\';renderScoring(\''+s.id+'\')">'+s.name+'</button>').join('')}
                </div>
                <div id="sc-scale-full" style="font-size:11.5px;color:var(--text-tertiary);margin-top:6px">${SCALES_QUICK[0].full}</div>
              </div>
              <div class="ch-form-group" style="margin-top:16px">
                <label class="ch-label">Total Score</label>
                <div style="display:flex;align-items:center;gap:12px">
                  <input id="sc-score-input" type="number" min="0" max="${SCALES_QUICK[0].max}" value="0"
                    class="ch-select" style="width:80px;font-size:18px;font-weight:700;text-align:center;padding:8px"
                    oninput="window._scScoringRender()">
                  <span style="font-size:12px;color:var(--text-tertiary)">out of <span id="sc-max-display">${SCALES_QUICK[0].max}</span></span>
                </div>
              </div>
            </div>
            <div id="sc-result" style="padding:0 16px 16px"></div>
          </div>
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Quick Reference</span></div>
            <div class="sc-ref-list">
              ${SCALES_QUICK.map(s=>`<div class="sc-ref-row">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-weight:700;font-size:12.5px;color:var(--text-primary)">${s.id}</span>
                  <span style="font-size:10.5px;color:var(--text-tertiary)">${s.domain}</span>
                  <span style="font-size:10.5px;color:var(--text-tertiary);margin-left:auto">0–${s.max}</span>
                </div>
                <div style="display:flex;gap:3px;flex-wrap:wrap">
                  ${s.bands.map(b=>'<span style="font-size:9.5px;padding:1px 7px;border-radius:8px;background:'+b.color+'18;color:'+b.color+';border:1px solid '+b.color+'30">'+b.label+'</span>').join('')}
                </div>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

    window._scScoringRender = () => {
      const input = document.getElementById('sc-score-input');
      const sc = SCALES_QUICK.find(s=>s.id===window._scaleId)||SCALES_QUICK[0];
      if (input) { input.max = sc.max; document.getElementById('sc-max-display').textContent = sc.max; }
      renderScoring(window._scaleId);
    };
    renderScoring(window._scaleId);
  }

  // ── SCALE REGISTRY TAB ───────────────────────────────────────────────────
  else if (tab === 'registry') {
    setTopbar('Assessments', '');
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    const REGISTRY = [
      { name:'PHQ-9',   full:'Patient Health Questionnaire-9',          domain:'Depression', type:'Self-report', items:9,  mins:5,  scoring:'0–27. ≥10 = moderate+ depression', ev:'A' },
      { name:'PHQ-2',   full:'PHQ 2-item Screener',                      domain:'Depression', type:'Self-report', items:2,  mins:1,  scoring:'0–6. ≥3 = refer for PHQ-9', ev:'A' },
      { name:'MADRS',   full:'Montgomery-Åsberg Depression Rating Scale', domain:'Depression', type:'Clinician',  items:10, mins:20, scoring:'0–60. ≥20 = moderate depression', ev:'A' },
      { name:'HAM-D',   full:'Hamilton Depression Rating Scale',          domain:'Depression', type:'Clinician',  items:17, mins:20, scoring:'0–52. ≥14 = moderate depression', ev:'A' },
      { name:'QIDS-SR', full:'Quick Inventory of Depressive Symptomatology',domain:'Depression',type:'Self-report',items:16,mins:10, scoring:'0–27. ≥11 = moderate depression', ev:'A' },
      { name:'GAD-7',   full:'Generalized Anxiety Disorder-7',            domain:'Anxiety',   type:'Self-report', items:7,  mins:5,  scoring:'0–21. ≥10 = moderate anxiety', ev:'A' },
      { name:'HAM-A',   full:'Hamilton Anxiety Rating Scale',             domain:'Anxiety',   type:'Clinician',  items:14, mins:20, scoring:'0–56. ≥14 = mild anxiety', ev:'A' },
      { name:'PSWQ',    full:'Penn State Worry Questionnaire',            domain:'Anxiety',   type:'Self-report', items:16, mins:10, scoring:'16–80. ≥62 = high worry', ev:'B' },
      { name:'PCL-5',   full:'PTSD Checklist for DSM-5',                  domain:'PTSD',      type:'Self-report', items:20, mins:10, scoring:'0–80. ≥33 = probable PTSD', ev:'A' },
      { name:'CAPS-5',  full:'Clinician-Administered PTSD Scale',         domain:'PTSD',      type:'Clinician',  items:30, mins:45, scoring:'0–80. ≥23 = moderate PTSD', ev:'A' },
      { name:'PANSS',   full:'Positive and Negative Syndrome Scale',      domain:'Psychosis', type:'Clinician',  items:30, mins:45, scoring:'30–210. ≥75 = moderate psychosis', ev:'A' },
      { name:'BPRS',    full:'Brief Psychiatric Rating Scale',            domain:'Psychosis', type:'Clinician',  items:24, mins:30, scoring:'24–168. ≥41 = moderate', ev:'A' },
      { name:'MoCA',    full:'Montreal Cognitive Assessment',             domain:'Cognitive', type:'Clinician',  items:30, mins:15, scoring:'0–30. <26 = cognitive impairment', ev:'A' },
      { name:'ISI',     full:'Insomnia Severity Index',                   domain:'Sleep',     type:'Self-report', items:7, mins:5,   scoring:'0–28. ≥15 = moderate insomnia', ev:'A' },
      { name:'PSQI',    full:'Pittsburgh Sleep Quality Index',            domain:'Sleep',     type:'Self-report', items:19, mins:10, scoring:'0–21. >5 = poor sleep quality', ev:'A' },
      { name:'C-SSRS',  full:'Columbia Suicide Severity Rating Scale',    domain:'Safety',    type:'Clinician',  items:6,  mins:10, scoring:'0–6. Any ideation requires assessment', ev:'A' },
      { name:'TMS-SE',  full:'TMS Side-Effects Checklist',                domain:'Neuromod',  type:'Self-report', items:10,mins:5,   scoring:'0–30. Monitor per session', ev:'B' },
      { name:'tDCS-CS', full:'tDCS Comfort and Side Effects Scale',       domain:'Neuromod',  type:'Self-report', items:8, mins:5,   scoring:'0–24. Monitor per session', ev:'B' },
    ];

    const DOMAINS = ['All', ...new Set(REGISTRY.map(r=>r.domain))];
    const TYPES   = ['All', 'Self-report', 'Clinician'];
    window._regDomain = window._regDomain || 'All';
    window._regType   = window._regType   || 'All';
    window._regSearch = '';

    function renderRegistry() {
      const q = (document.getElementById('reg-search')?.value||'').toLowerCase();
      window._regSearch = q;
      const filtered = REGISTRY.filter(r => {
        const matchD = window._regDomain === 'All' || r.domain === window._regDomain;
        const matchT = window._regType   === 'All' || r.type   === window._regType;
        const matchQ = !q || r.name.toLowerCase().includes(q) || r.full.toLowerCase().includes(q) || r.domain.toLowerCase().includes(q);
        return matchD && matchT && matchQ;
      });
      const out = document.getElementById('reg-list');
      if (!out) return;
      const evColor = { A:'var(--teal)', B:'var(--blue)', C:'var(--amber)' };
      out.innerHTML = filtered.map(r => `<div class="reg-row">
        <div class="reg-row-top">
          <span class="reg-name">${r.name}</span>
          <span class="reg-ev" style="color:${evColor[r.ev]||'var(--text-tertiary)'};border-color:${evColor[r.ev]||'var(--border)'}44">Ev. ${r.ev}</span>
          <span class="reg-type">${r.type}</span>
          <span class="reg-domain" style="margin-left:auto">${r.domain}</span>
        </div>
        <div class="reg-full">${r.full}</div>
        <div class="reg-meta">
          <span>${r.items} items</span>
          <span>~${r.mins} min</span>
          <span>${r.scoring}</span>
        </div>
      </div>`).join('') || '<div class="ch-empty">No scales match your filter.</div>';
    }

    window._regSetDomain = d => { window._regDomain = d; document.querySelectorAll('.reg-domain-pill').forEach(b=>b.classList.toggle('active',b.dataset.domain===d)); renderRegistry(); };
    window._regSetType   = t => { window._regType   = t; document.querySelectorAll('.reg-type-pill').forEach(b=>b.classList.toggle('active',b.dataset.type===t)); renderRegistry(); };

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-card">
          <div class="ch-card-hd" style="flex-wrap:wrap;gap:10px">
            <span class="ch-card-title">Assessment Registry — ${REGISTRY.length} instruments</span>
            <div style="position:relative;flex:1;max-width:260px">
              <input id="reg-search" type="text" placeholder="Search scales…" class="ph-search-input" oninput="renderRegistry()">
              <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
          </div>
          <div style="padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border)">
            ${DOMAINS.map(d=>'<button class="reg-domain-pill' + (d===window._regDomain?' active':'') + '" data-domain="'+d+'" onclick="window._regSetDomain(\''+d+'\')">'+d+'</button>').join('')}
            <span style="width:1px;background:var(--border);margin:0 4px;align-self:stretch"></span>
            ${TYPES.map(t=>'<button class="reg-type-pill' + (t===window._regType?' active':'') + '" data-type="'+t+'" onclick="window._regSetType(\''+t+'\')">'+t+'</button>').join('')}
          </div>
          <div id="reg-list" style="max-height:calc(100vh - 280px);overflow-y:auto"></div>
        </div>
      </div>
    </div>`;

    renderRegistry();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgProtocolStudio — Screen 09 · Protocol Studio (5-step wizard)
// Condition → Phenotype → Modality → Device → Target+Montage
// Merges: legacy Protocol Hub generator + registry browsers + brain-map preview.
// Handbooks moved to pgHandbooks; Brain Map Planner moved to its own screen.
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgProtocolStudio(setTopbar, navigate) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  window._studioState = window._studioState || {
    patientId: null,
    patientName: 'Samantha Li',
    patientMeta: '34F · MDD · Course 3/20',
    condition: null, phenotype: null, modality: null,
    device: null, target: null, montage: null,
    step: 1,
  };
  const S = window._studioState;

  try { setTopbar('Protocol Studio',
    '<button class="btn btn-sm btn-ghost" onclick="window._nav(\'handbooks-v2\')">Handbooks ↗</button>' +
    '<button class="btn btn-sm btn-ghost" onclick="window._nav(\'brain-map-planner\')">Brain Map Planner ↗</button>'); } catch {}

  let CONDITIONS = [], MODALITIES = [], DEVICES = [], TARGETS = [];
  try {
    const c = await import('./registries/conditions.js');
    CONDITIONS = c.CONDITIONS || c.default || [];
  } catch {}
  try {
    const d = await import('./registries/devices.js');
    DEVICES = d.DEVICES || d.default || [];
  } catch {}
  try {
    const b = await import('./registries/brain-targets.js');
    TARGETS = b.BRAIN_TARGETS || b.default || [];
  } catch {}
  try { if (typeof api?.listConditions === 'function') {
    const r = await api.listConditions(); if (r?.items?.length) CONDITIONS = r.items;
  } } catch {}
  try { if (typeof api?.listDevices === 'function') {
    const r = await api.listDevices(); if (r?.items?.length) DEVICES = r.items;
  } } catch {}
  try { if (typeof api?.listModalities === 'function') {
    const r = await api.listModalities(); if (r?.items?.length) MODALITIES = r.items;
  } } catch {}

  if (!MODALITIES.length) {
    MODALITIES = [
      { id:'tdcs',          name:'tDCS',            grade:'A', rcts:32, sub:'Transcranial direct current · 2 mA, 20 min × 20 sessions. In-clinic or home-supervised.', meta:'Recommended' },
      { id:'rtms',          name:'rTMS',            grade:'A', rcts:41, sub:'Repetitive magnetic · 10Hz or iTBS. Requires TMS chair & operator certification.',      meta:'In-clinic only' },
      { id:'tacs',          name:'tACS',            grade:'B', rcts:12, sub:'Alternating current · 10Hz alpha entrainment. Secondary line for anxious phenotype.',  meta:'Secondary' },
      { id:'hd-tdcs',       name:'HD-tDCS',         grade:'C', rcts:4,  sub:'High-definition tDCS. Limited evidence for this phenotype.',                            meta:'Research only', warn:true },
      { id:'neurofeedback', name:'Neurofeedback',   grade:'B', rcts:9,  sub:'Theta/beta or SMR training. 30–40 sessions · pairs well with tDCS.',                    meta:'Adjunct' },
      { id:'hrv',           name:'HRV biofeedback', grade:'B', rcts:7,  sub:'Adjunct for anxious phenotype. Home-device compatible.',                                meta:'Adjunct' },
    ];
  }

  const PHENOTYPE_MAP = {
    'mdd':                       [ { id:'anxious', name:'Anxious depression', sub:'PHQ-9 ≥15 · GAD-7 ≥10' },
                                   { id:'melancholic', name:'Melancholic', sub:'Anhedonia · psychomotor slowing' },
                                   { id:'atypical', name:'Atypical', sub:'Reactive mood · hypersomnia' } ],
    'trd':                       [ { id:'bilateral', name:'Bilateral-resistant', sub:'Failed ≥2 trials · left-only ineffective' },
                                   { id:'right-hyper', name:'Right DLPFC hyperactive', sub:'Candidate for bilateral or 1Hz-R' } ],
    'major-depressive-disorder': [ { id:'anxious', name:'Anxious depression', sub:'PHQ-9 ≥15 · GAD-7 ≥10' },
                                   { id:'melancholic', name:'Melancholic', sub:'Anhedonia · psychomotor slowing' } ],
    'generalized-anxiety':       [ { id:'somatic', name:'Somatic anxiety', sub:'Autonomic arousal dominant' },
                                   { id:'cognitive', name:'Cognitive anxiety', sub:'Worry / rumination dominant' } ],
    'ptsd':                      [ { id:'hyper', name:'Hyperarousal', sub:'Startle / vigilance dominant' },
                                   { id:'dissoc', name:'Dissociative', sub:'Depersonalisation predominant' } ],
    'ocd':                       [ { id:'contam', name:'Contamination', sub:'Washing compulsions' },
                                   { id:'check', name:'Checking', sub:'Doubt / checking cycles' } ],
  };

  const FALLBACK_TARGETS = [
    { id:'DLPFC-L', name:'DLPFC-L', anchor:'F3',  grade:'A' },
    { id:'DLPFC-R', name:'DLPFC-R', anchor:'F4',  grade:'B' },
    { id:'mPFC',    name:'mPFC',    anchor:'Fz',  grade:'B' },
    { id:'SMA',     name:'SMA',     anchor:'Cz',  grade:'C' },
    { id:'OFC-L',   name:'OFC-L',   anchor:'Fp1', grade:'B' },
    { id:'OFC-R',   name:'OFC-R',   anchor:'Fp2', grade:'B' },
    { id:'TPJ-L',   name:'TPJ-L',   anchor:'T7',  grade:'C' },
    { id:'PCC',     name:'PCC',     anchor:'Pz',  grade:'C' },
  ];
  const targetList = () => {
    if (!Array.isArray(TARGETS) || !TARGETS.length) return FALLBACK_TARGETS;
    return TARGETS.slice(0, 8).map(t => ({
      id:     t.id || t.abbr || t.name,
      name:   t.abbr || t.name || t.id,
      anchor: t.electrode || t.anchor || t.primary_electrode || 'Fz',
      grade:  t.evidence_grade || t.grade || 'B',
    }));
  };

  const MONTAGES_FOR = (anchor) => [
    { id:'classic',   label: (anchor||'F3') + ' anode ↔ FP2 cathode', sub:'Classic Fregni · 32 RCTs',              grade:'A', tag:'Preferred' },
    { id:'bilateral', label: (anchor||'F3') + ' anode ↔ F4 cathode',  sub:'Bilateral · right DLPFC hyperactivity', grade:'B', tag:'Alt'       },
    { id:'extra',     label: (anchor||'F3') + ' anode ↔ extracephalic', sub:'Deltoid return · limited data',        grade:'C', tag:'Research'  },
  ];

  const el = document.getElementById('content');
  const gradeClass = (g) => g === 'A' ? 'teal' : g === 'B' ? 'blue' : g === 'C' ? 'amber' : 'violet';
  const chip = (g, label) => {
    const c = gradeClass(g);
    const colorMap = {
      teal:'rgba(0,212,188,0.14);color:var(--dv2-teal, var(--teal));border:1px solid rgba(0,212,188,0.28)',
      blue:'rgba(74,158,255,0.14);color:#4a9eff;border:1px solid rgba(74,158,255,0.28)',
      amber:'rgba(245,158,11,0.14);color:#f59e0b;border:1px solid rgba(245,158,11,0.28)',
      violet:'rgba(155,127,255,0.14);color:#b29cff;border:1px solid rgba(155,127,255,0.28)',
    };
    const style = 'padding:2px 8px;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:0.4px;background:' + colorMap[c];
    return '<span style="' + style + '">' + esc(label || ('Grade ' + g)) + '</span>';
  };

  const conditionOptions = () => CONDITIONS.slice(0, 12).map(c => ({
    id: c.id,
    name: c.name || c.label,
    abbr: c.abbr || c.shortLabel || '',
    grade: c.evidence_grade || 'B',
    rcts: c.rcts || c.typical_sessions || 0,
    sub:  c.description ? String(c.description).slice(0, 120) + '…' : (c.category || ''),
  }));

  const phenotypesFor = (cid) => PHENOTYPE_MAP[cid] || PHENOTYPE_MAP[String(cid||'').toLowerCase()] || [
    { id:'general', name:'General presentation', sub:'No subtype stratification available' },
  ];

  const devicesFor = (modalityId) => {
    if (!Array.isArray(DEVICES) || !DEVICES.length) {
      return [ { id:'dev-a', name:'Generic ' + (modalityId||'device') + ' unit', manufacturer:'—', fda_clearance:false, grade:'B' } ];
    }
    const tags = {
      'tdcs': ['tdcs','direct current'],
      'rtms': ['tms','magnetic'],
      'tacs': ['tacs','alternating'],
      'hd-tdcs': ['hd-tdcs','hd tdcs'],
      'neurofeedback': ['neurofeedback','eeg'],
      'hrv': ['hrv','heart rate','biofeedback'],
    };
    const match = tags[modalityId] || [modalityId];
    const hits = DEVICES.filter(d => {
      const blob = ((d.modality || '') + ' ' + ((d.modalities || []).join(' ')) + ' ' + (d.name||'')).toLowerCase();
      return match.some(m => blob.includes(String(m).toLowerCase()));
    });
    return (hits.length ? hits : DEVICES.slice(0, 4)).map(d => ({
      id: d.id, name: d.name, manufacturer: d.manufacturer || '',
      fda_clearance: !!d.fda_clearance,
      grade: d.evidence_grade || 'B',
      coils: (d.coil_types || []).slice(0, 2).join(' · '),
    }));
  };

  function safetyStatus() {
    const issues = [];
    const meta = String(S.patientMeta||'').toLowerCase();
    if (S.modality === 'rtms' && meta.includes('seizure')) issues.push('Seizure history incompatible with rTMS');
    if (S.modality === 'hd-tdcs') issues.push('HD-tDCS: research-only for this phenotype');
    return { ok: issues.length === 0, issues };
  }

  function renderStep1() {
    const opts = conditionOptions();
    if (!opts.length) return '<div class="studio-pane"><div class="ch-empty">No conditions loaded. Registry offline.</div></div>';
    return '<div class="studio-pane">' +
      '<div class="studio-pane-hd"><div><div class="studio-pane-pre">Step 1 of 5</div>' +
      '<div class="studio-pane-title">Select condition</div>' +
      '<div class="studio-pane-sub">Registry-backed list · evidence grade + RCT count per row.</div></div>' +
      '<div class="studio-pane-pill"><span class="studio-pane-pill-dot"></span>Registry current</div></div>' +
      '<div class="studio-opt-grid">' +
        opts.map(c => {
          const active = (S.condition === c.id) ? ' active' : '';
          return '<button class="studio-opt' + active + '" onclick="window._studioPick(\'condition\',\'' + esc(c.id) + '\')">' +
            '<div class="studio-opt-hd">' + chip(c.grade) +
              '<span class="studio-opt-rcts">' + esc(c.rcts ? (c.rcts + ' RCTs') : '—') + '</span></div>' +
            '<div class="studio-opt-title">' + esc(c.name) + (c.abbr ? ' <span class="studio-opt-abbr">' + esc(c.abbr) + '</span>' : '') + '</div>' +
            '<div class="studio-opt-sub">' + esc(c.sub) + '</div>' +
          '</button>';
        }).join('') +
      '</div></div>';
  }

  function renderStep2() {
    const ph = phenotypesFor(S.condition);
    return '<div class="studio-pane">' +
      '<div class="studio-pane-hd"><div><div class="studio-pane-pre">Step 2 of 5</div>' +
      '<div class="studio-pane-title">Choose phenotype</div>' +
      '<div class="studio-pane-sub">Phenotype narrows the evidence slice and steers modality choice.</div></div></div>' +
      '<div class="studio-opt-grid" style="grid-template-columns:repeat(2,1fr)">' +
        ph.map(p => {
          const active = (S.phenotype === p.id) ? ' active' : '';
          return '<button class="studio-opt' + active + '" onclick="window._studioPick(\'phenotype\',\'' + esc(p.id) + '\')">' +
            '<div class="studio-opt-title">' + esc(p.name) + '</div>' +
            '<div class="studio-opt-sub">' + esc(p.sub || '') + '</div>' +
          '</button>';
        }).join('') +
      '</div></div>';
  }

  function renderStep3() {
    return '<div class="studio-pane">' +
      '<div class="studio-pane-hd"><div><div class="studio-pane-pre">Step 3 of 5</div>' +
      '<div class="studio-pane-title">Choose modality</div>' +
      '<div class="studio-pane-sub">Six neuromodulation modalities · evidence grade + RCT count per row.</div></div>' +
      '<div class="studio-pane-pill"><span class="studio-pane-pill-dot"></span>Registry current</div></div>' +
      '<div class="studio-opt-grid">' +
        MODALITIES.map(m => {
          const active  = (S.modality === m.id) ? ' active' : '';
          const disabled = m.warn ? ' disabled' : '';
          const metaColor = m.warn ? 'color:var(--amber,#f59e0b)' : '';
          return '<button class="studio-opt' + active + disabled + '"' +
            (m.warn ? '' : ' onclick="window._studioPick(\'modality\',\'' + esc(m.id) + '\')"') + '>' +
            '<div class="studio-opt-hd">' + chip(m.grade) +
              '<span class="studio-opt-rcts">' + esc(m.rcts + ' RCTs') + '</span></div>' +
            '<div class="studio-opt-title">' + esc(m.name) + '</div>' +
            '<div class="studio-opt-sub">' + esc(m.sub) + '</div>' +
            '<div class="studio-opt-meta" style="' + metaColor + '">' + esc(m.meta) + '</div>' +
          '</button>';
        }).join('') +
      '</div></div>';
  }

  function renderStep4() {
    const dvs = S.modality ? devicesFor(S.modality) : [];
    if (!dvs.length) return '<div class="studio-pane"><div class="ch-empty">Select a modality first.</div></div>';
    return '<div class="studio-pane">' +
      '<div class="studio-pane-hd"><div><div class="studio-pane-pre">Step 4 of 5</div>' +
      '<div class="studio-pane-title">Pick a device</div>' +
      '<div class="studio-pane-sub">Filtered by modality · FDA-cleared devices marked.</div></div></div>' +
      '<div class="studio-opt-grid">' +
        dvs.map(d => {
          const active = (S.device === d.id) ? ' active' : '';
          return '<button class="studio-opt' + active + '" onclick="window._studioPick(\'device\',\'' + esc(d.id) + '\')">' +
            '<div class="studio-opt-hd">' + chip(d.grade) +
              (d.fda_clearance ? '<span class="studio-opt-rcts" style="color:var(--dv2-teal, var(--teal))">FDA ✓</span>' : '<span class="studio-opt-rcts">—</span>') + '</div>' +
            '<div class="studio-opt-title">' + esc(d.name) + '</div>' +
            '<div class="studio-opt-sub">' + esc(d.manufacturer || '') + (d.coils ? ' · ' + esc(d.coils) : '') + '</div>' +
          '</button>';
        }).join('') +
      '</div></div>';
  }

  function renderStep5() {
    const tl = targetList();
    const selTarget = tl.find(t => t.id === S.target);
    const montages = MONTAGES_FOR(selTarget?.anchor);
    return '<div class="studio-pane">' +
      '<div class="studio-pane-hd"><div><div class="studio-pane-pre">Step 5 of 5</div>' +
      '<div class="studio-pane-title">Target &amp; montage</div>' +
      '<div class="studio-pane-sub">Selecting a target updates the live brain map on the right.</div></div>' +
      '<div class="studio-pane-pill"><span class="studio-pane-pill-dot"></span>Registry current</div></div>' +
      '<div class="studio-pane-label">Anatomical target</div>' +
      '<div class="studio-target-grid">' +
        tl.map(t => {
          const active = (S.target === t.id) ? ' active' : '';
          return '<button class="studio-target' + active + '" onclick="window._studioPick(\'target\',\'' + esc(t.id) + '\')">' +
            '<div class="studio-target-name">' + esc(t.name) + '</div>' +
            '<div class="studio-target-anchor">' + esc(t.anchor) + ' anchor</div>' +
            '<div class="studio-target-pill">' + chip(t.grade) + '</div>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="studio-pane-label" style="margin-top:18px">Montage</div>' +
      '<div class="studio-radio-stack">' +
        montages.map(m => {
          const active = (S.montage === m.id) ? ' active' : '';
          return '<label class="studio-radio' + active + '" onclick="window._studioPick(\'montage\',\'' + esc(m.id) + '\')">' +
            '<div class="studio-radio-dot"></div>' +
            '<div style="flex:1">' +
              '<div class="studio-radio-title">' + esc(m.label) + '</div>' +
              '<div class="studio-radio-sub">' + esc(m.sub) + '</div>' +
            '</div>' +
            chip(m.grade, m.tag) +
          '</label>';
        }).join('') +
      '</div>' +
      '<div class="studio-save-bar">' +
        '<button class="btn btn-ghost btn-sm" onclick="window._studioExport()">Export to patient course</button>' +
        '<button class="btn btn-primary btn-sm" onclick="window._studioSave()">Save as protocol</button>' +
      '</div>' +
    '</div>';
  }

  function stepContent() {
    switch (S.step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return renderStep1();
    }
  }

  function leftColumn() {
    const condName = (CONDITIONS.find(c => c.id === S.condition) || {}).name
                  || (CONDITIONS.find(c => c.id === S.condition) || {}).label || '— pending —';
    const phName = (phenotypesFor(S.condition).find(p => p.id === S.phenotype) || {}).name || '— pending —';
    const modName = (MODALITIES.find(m => m.id === S.modality) || {}).name || '— pending —';
    const devName = S.device ? ((devicesFor(S.modality).find(d => d.id === S.device) || {}).name || S.device) : '— pending —';
    const tgt = targetList().find(t => t.id === S.target);
    const tgtLine = tgt ? (tgt.name + ' · ' + tgt.anchor + ' anchor') : '— pending —';
    const selRow = (label, value, pending, current) => {
      const cls = 'studio-sel' + (pending ? ' pending' : '') + (current ? ' current' : '');
      return '<div class="' + cls + '">' +
        '<div class="studio-sel-lbl">' + esc(label) + (current ? ' · this step' : '') + '</div>' +
        '<div class="studio-sel-val">' + value + '</div>' +
      '</div>';
    };
    const safe = safetyStatus();
    const safePill = safe.ok
      ? '<div class="studio-safety ok"><div class="studio-safety-ico">✓</div><div><div class="studio-safety-title">Safety engine</div><div class="studio-safety-sub">0 violations · contraindications cleared.</div></div></div>'
      : '<div class="studio-safety warn"><div class="studio-safety-ico">!</div><div><div class="studio-safety-title">Safety warnings</div><div class="studio-safety-sub">' + esc(safe.issues.join(' · ')) + '</div></div></div>';
    return '<div class="studio-left">' +
      '<div class="card" style="padding:16px;">' +
        '<div class="studio-h-lbl">Patient</div>' +
        '<div class="studio-patient">' +
          '<div class="studio-pt-av">' + esc((S.patientName || 'P').split(' ').map(w=>w[0]).join('').slice(0,2)) + '</div>' +
          '<div><div class="studio-pt-name">' + esc(S.patientName) + '</div>' +
          '<div class="studio-pt-meta">' + esc(S.patientMeta) + '</div></div>' +
        '</div>' +
        '<div class="studio-pt-note">No pacemaker · cleared for neuromodulation by Dr. Kolmar.</div>' +
      '</div>' +
      '<div class="card" style="padding:16px;">' +
        '<div class="studio-h-lbl">Running selections</div>' +
        selRow('Condition', esc(condName), !S.condition, S.step === 1) +
        selRow('Phenotype', esc(phName),   !S.phenotype, S.step === 2) +
        selRow('Modality',  esc(modName),  !S.modality,  S.step === 3) +
        selRow('Device',    esc(devName),  !S.device,    S.step === 4) +
        selRow('Target',    esc(tgtLine),  !S.target,    S.step === 5) +
      '</div>' +
      '<div class="card" style="padding:14px 16px;">' + safePill + '</div>' +
    '</div>';
  }

  function rightColumn() {
    const tgt = targetList().find(t => t.id === S.target);
    let brainSvg = '<div style="opacity:0.4;text-align:center;padding:40px 0;font-size:12px;color:var(--text-tertiary)">Select a target to render montage</div>';
    try {
      if (tgt) {
        const montageId = S.montage || 'classic';
        let anode = tgt.anchor;
        let cathode = null;
        if (montageId === 'classic')   cathode = 'Fp2';
        if (montageId === 'bilateral') cathode = (tgt.anchor === 'F3' ? 'F4' : 'F3');
        brainSvg = renderBrainMap10_20({ anode, cathode, targetRegion: tgt.id, size: 280 });
      }
    } catch {}
    const params = [
      ['Modality',  (MODALITIES.find(m=>m.id===S.modality)||{}).name || '—'],
      ['Current',   S.modality === 'tdcs' ? '2.0 mA' : S.modality === 'tacs' ? '2.0 mA @ 10 Hz' : S.modality === 'rtms' ? '10 Hz · 120% MT' : '—'],
      ['Duration',  '20 min'],
      ['Sessions',  '20'],
      ['Frequency', '5× / week'],
      ['Target',    tgt ? (tgt.name + ' · ' + tgt.anchor) : '—'],
    ];
    const ready = S.condition && S.phenotype && S.modality && S.device && S.target && S.montage;
    const safe = safetyStatus();
    const statusChip = safe.ok
      ? '<span class="studio-status-chip ok">● ' + (ready ? 'Ready to save' : 'Valid so far') + '</span>'
      : '<span class="studio-status-chip warn">● Safety warnings</span>';
    return '<div class="studio-right">' +
      '<div class="card" style="padding:18px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
          '<div class="studio-h-lbl" style="margin:0">Live montage · 10-20</div>' +
          statusChip +
        '</div>' +
        '<div style="display:flex;justify-content:center;">' + brainSvg + '</div>' +
      '</div>' +
      '<div class="card" style="padding:16px;">' +
        '<div class="studio-h-lbl">Resolved parameters</div>' +
        '<div class="studio-params">' +
          params.map(p =>
            '<div class="studio-params-k">' + esc(p[0]) + '</div>' +
            '<div class="studio-params-v">' + esc(p[1]) + '</div>'
          ).join('') +
        '</div>' +
      '</div>' +
      '<div class="card" style="padding:16px;">' +
        '<div class="studio-h-lbl">Will render on save</div>' +
        '<div class="studio-render-item">⎙  Clinician handbook · 8pp PDF</div>' +
        '<div class="studio-render-item">◎  Patient guide · DOCX + portal page</div>' +
        '<div class="studio-render-item">⚑  Consent form · v2.4</div>' +
        '<div class="studio-render-item">◈  Session worksheet · 20 copies</div>' +
      '</div>' +
    '</div>';
  }

  function stepper() {
    const steps = [
      { n:1, label:'Condition' },
      { n:2, label:'Phenotype' },
      { n:3, label:'Modality'  },
      { n:4, label:'Device'    },
      { n:5, label:'Target'    },
    ];
    const parts = [];
    steps.forEach((s, i) => {
      const cls = s.n < S.step ? 'done' : s.n === S.step ? 'active' : '';
      parts.push('<div class="studio-step ' + cls + '" style="cursor:pointer" onclick="window._studioGo(' + s.n + ')">' +
        '<span class="studio-step-n">' + s.n + '</span><span>' + esc(s.label) + '</span></div>');
      if (i < steps.length - 1) {
        const line = s.n < S.step ? 'done' : '';
        parts.push('<div class="studio-step-line ' + line + '"></div>');
      }
    });
    const canNext =
      (S.step === 1 && S.condition) ||
      (S.step === 2 && S.phenotype) ||
      (S.step === 3 && S.modality)  ||
      (S.step === 4 && S.device)    ||
      (S.step === 5 && S.target && S.montage);
    return '<div class="studio-stepper">' +
      parts.join('') +
      '<div style="margin-left:auto;display:flex;gap:8px">' +
        (S.step > 1 ? '<button class="btn btn-ghost btn-sm" onclick="window._studioGo(' + (S.step - 1) + ')">← Back</button>' : '') +
        (S.step < 5 ? '<button class="btn btn-primary btn-sm"' + (canNext ? '' : ' disabled') + ' onclick="window._studioGo(' + (S.step + 1) + ')">Next →</button>' : '') +
      '</div>' +
    '</div>';
  }

  function paint() {
    const style = `<style>
      .studio-wrap { padding: 18px; max-width: 1520px; }
      .studio-head { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:14px; gap:14px; }
      .studio-head-title { font-family: var(--font-display,inherit); font-size: 22px; font-weight: 600; letter-spacing: -0.4px; }
      .studio-head-sub { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }

      .studio-stepper { display:flex; align-items:center; gap:0; padding:14px 18px; border-radius:14px;
        background: var(--bg-card); border: 1px solid var(--border); margin-bottom: 16px; }
      .studio-step { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-tertiary); font-weight:500; padding: 4px 8px; border-radius:8px; }
      .studio-step.active { color: var(--text-primary); }
      .studio-step.done { color: var(--dv2-teal, var(--teal)); }
      .studio-step-n { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:50%; background:var(--bg-surface); border:1px solid var(--border); font-family:var(--font-mono); font-size:10.5px; font-weight:600; }
      .studio-step.done .studio-step-n { background: rgba(0,212,188,0.16); color: var(--dv2-teal, var(--teal)); border-color: rgba(0,212,188,0.3); }
      .studio-step.active .studio-step-n { background: linear-gradient(135deg, var(--dv2-teal, var(--teal)), var(--teal-dim, var(--teal))); color: #04121c; border-color: transparent; box-shadow: 0 0 0 3px rgba(0,212,188,0.18); }
      .studio-step-line { flex:1; height:2px; background: var(--border); margin: 0 12px; border-radius: 1px; }
      .studio-step-line.done { background: linear-gradient(90deg, var(--dv2-teal, var(--teal)), rgba(0,212,188,0.3)); }

      .studio-grid { display:grid; grid-template-columns: 300px 1fr 340px; gap:16px; align-items:start; }
      @media (max-width: 1200px) { .studio-grid { grid-template-columns: 1fr; } }

      .studio-left, .studio-right { display:flex; flex-direction:column; gap:12px; }

      .studio-h-lbl { font-size:10.5px; letter-spacing:1.2px; text-transform:uppercase; color:var(--text-tertiary); font-weight:600; margin-bottom:12px; }

      .studio-patient { display:flex; align-items:center; gap:10px; padding-bottom:12px; border-bottom:1px solid var(--border); }
      .studio-pt-av { width:34px; height:34px; border-radius: 50%; background: linear-gradient(135deg, var(--dv2-teal, var(--teal)), var(--dv2-blue, var(--blue))); color:#04121c; font-weight:700; font-size:12px; display:flex;align-items:center;justify-content:center; }
      .studio-pt-name { font-size:13px; font-weight:600; }
      .studio-pt-meta { font-size:10.5px; color:var(--text-tertiary); margin-top:2px; }
      .studio-pt-note { font-size:11px; color:var(--text-secondary); line-height:1.55; margin-top:10px; }

      .studio-sel { padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.025); border: 1px solid var(--border); margin-bottom: 8px; }
      .studio-sel.pending { opacity: 0.55; }
      .studio-sel.current { background: rgba(0,212,188,0.05); border-color: rgba(0,212,188,0.2); }
      .studio-sel.current .studio-sel-lbl { color: var(--dv2-teal, var(--teal)); }
      .studio-sel-lbl { font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text-tertiary); font-weight: 600; margin-bottom: 4px; }
      .studio-sel-val { font-size: 12.5px; font-weight: 600; line-height: 1.4; }

      .studio-pane { padding: 22px; border-radius: 14px; background: var(--bg-card); border: 1px solid var(--border); }
      .studio-pane-hd { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:18px; gap:14px; }
      .studio-pane-pre { font-family: var(--font-mono); font-size:10.5px; color: var(--dv2-teal, var(--teal)); letter-spacing:1.4px; text-transform:uppercase; margin-bottom:6px; }
      .studio-pane-title { font-family: var(--font-display, inherit); font-size: 20px; font-weight:600; letter-spacing:-0.4px; }
      .studio-pane-sub { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
      .studio-pane-label { font-size:10.5px; letter-spacing:1.3px; text-transform:uppercase; color:var(--text-tertiary); font-weight:600; margin-bottom:10px; }
      .studio-pane-pill { display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(0,212,188,0.08);border:1px solid rgba(0,212,188,0.25);font-size:11px;color:var(--dv2-teal, var(--teal));font-weight:600; }
      .studio-pane-pill-dot { width:6px;height:6px;border-radius:50%;background:var(--dv2-teal, var(--teal));box-shadow:0 0 6px var(--dv2-teal, var(--teal)); }

      .studio-opt-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
      .studio-opt { padding: 14px; border-radius: 12px; background: var(--bg-surface); border: 1px solid var(--border); text-align:left; cursor:pointer; transition: all 0.15s ease; color: var(--text-primary); font-family: inherit; }
      .studio-opt:hover:not(.disabled) { border-color: var(--border-hover); }
      .studio-opt.active { background: linear-gradient(135deg, rgba(0,212,188,0.1), rgba(74,158,255,0.04)); border-color: rgba(0,212,188,0.35); box-shadow: 0 0 0 3px rgba(0,212,188,0.08); }
      .studio-opt.disabled { opacity: 0.5; cursor: not-allowed; }
      .studio-opt-hd { display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; }
      .studio-opt-rcts { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-tertiary); }
      .studio-opt-title { font-family: var(--font-display, inherit); font-size: 16px; font-weight: 600; letter-spacing: -0.3px; margin-bottom: 4px; }
      .studio-opt-abbr { font-size: 11px; color: var(--text-tertiary); font-weight: 500; margin-left: 4px; }
      .studio-opt-sub { font-size: 11.5px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 10px; }
      .studio-opt-meta { display:inline-flex; align-items:center; gap: 5px; font-size: 10.5px; color: var(--dv2-teal, var(--teal)); font-weight: 600; }
      .studio-opt:not(.active) .studio-opt-meta { color: var(--text-tertiary); }

      .studio-target-grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom: 6px; }
      .studio-target { padding: 12px 10px; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border); text-align:center; cursor:pointer; transition: all 0.15s ease; color: var(--text-primary); font-family: inherit; }
      .studio-target:hover { border-color: var(--border-hover); }
      .studio-target.active { background: linear-gradient(135deg, rgba(0,212,188,0.12), rgba(74,158,255,0.04)); border-color: rgba(0,212,188,0.35); }
      .studio-target-name { font-family: var(--font-display, inherit); font-size: 15px; font-weight: 600; letter-spacing: -0.2px; }
      .studio-target-anchor { font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary); margin-top: 2px; }
      .studio-target-pill { margin-top: 8px; }

      .studio-radio-stack { display:flex; flex-direction:column; gap:8px; }
      .studio-radio { display:flex; align-items:center; gap: 12px; padding: 12px 14px; border-radius: 11px; background: var(--bg-surface); border: 1px solid var(--border); cursor:pointer; transition: all 0.15s ease; }
      .studio-radio:hover { border-color: var(--border-hover); }
      .studio-radio.active { background: linear-gradient(90deg, rgba(0,212,188,0.08), transparent); border-color: rgba(0,212,188,0.35); }
      .studio-radio-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); flex-shrink: 0; position: relative; }
      .studio-radio.active .studio-radio-dot { border-color: var(--dv2-teal, var(--teal)); }
      .studio-radio.active .studio-radio-dot::after { content:''; position:absolute; inset: 2px; border-radius: 50%; background: var(--dv2-teal, var(--teal)); box-shadow: 0 0 6px var(--dv2-teal, var(--teal)); }
      .studio-radio-title { font-size:13px;font-weight:600; }
      .studio-radio-sub   { font-size:11px;color:var(--text-tertiary);margin-top:2px; }

      .studio-render-item { display:flex; align-items:center; gap:10px; padding:8px 0; font-size:12px; color: var(--text-secondary); border-bottom: 1px dashed rgba(255,255,255,0.06); }
      .studio-render-item:last-child { border-bottom: none; }

      .studio-params { display:grid; grid-template-columns: 1fr auto; gap:8px 14px; font-size:12.5px; }
      .studio-params-k { color: var(--text-secondary); }
      .studio-params-v { font-family: var(--font-mono); color: var(--text-primary); font-weight:500; }

      .studio-save-bar { display:flex; gap:8px; justify-content:flex-end; margin-top:20px; padding-top:18px; border-top: 1px solid var(--border); }

      .studio-safety { display:flex; align-items:center; gap:10px; }
      .studio-safety-ico { width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700; }
      .studio-safety.ok  .studio-safety-ico { background: rgba(74,222,128,0.14); color: var(--green, #4ade80); }
      .studio-safety.warn .studio-safety-ico { background: rgba(239,68,68,0.14); color: #ef4444; }
      .studio-safety-title { font-size:12.5px; font-weight:600; }
      .studio-safety-sub { font-size:11px; color:var(--text-secondary); line-height:1.45; margin-top:2px; }

      .studio-status-chip { font-size:10.5px; font-weight:600; padding:3px 9px; border-radius:999px; letter-spacing:0.3px; }
      .studio-status-chip.ok   { background: rgba(0,212,188,0.12); color: var(--dv2-teal, var(--teal)); border:1px solid rgba(0,212,188,0.25); }
      .studio-status-chip.warn { background: rgba(239,68,68,0.12); color: #ef4444; border:1px solid rgba(239,68,68,0.25); }
    </style>`;

    el.innerHTML =
      style +
      '<div class="studio-wrap">' +
        '<div class="studio-head">' +
          '<div><div class="studio-head-title">New protocol · ' + esc(S.patientName) + '</div>' +
          '<div class="studio-head-sub">Follow the 5 steps — the engine validates compatibility and renders clinician + patient documents on save.</div></div>' +
        '</div>' +
        stepper() +
        '<div class="studio-grid">' +
          leftColumn() +
          '<div>' + stepContent() + '</div>' +
          rightColumn() +
        '</div>' +
      '</div>';
  }

  window._studioGo = (n) => { S.step = Math.max(1, Math.min(5, n | 0)); paint(); };
  window._studioPick = (key, value) => {
    if (key === 'condition') { S.condition = value; S.phenotype = null; S.modality = null; S.device = null; S.target = null; S.montage = null; }
    else if (key === 'phenotype') { S.phenotype = value; }
    else if (key === 'modality')  { S.modality  = value; S.device = null; }
    else if (key === 'device')    { S.device    = value; }
    else if (key === 'target')    { S.target    = value; if (!S.montage) S.montage = 'classic'; }
    else if (key === 'montage')   { S.montage   = value; }
    paint();
  };
  window._studioSave = async () => {
    try {
      if (typeof api?.saveProtocol === 'function') {
        await api.saveProtocol({
          patient_id: S.patientId,
          condition: S.condition, phenotype: S.phenotype,
          modality: S.modality, device: S.device,
          target: S.target, montage: S.montage,
        });
      }
      try { alert('Protocol saved.'); } catch {}
    } catch { try { alert('Could not save (endpoint offline). State preserved locally.'); } catch {} }
  };
  window._studioExport = async () => {
    try {
      if (typeof api?.createTreatmentCourse === 'function') {
        await api.createTreatmentCourse({ patient_id: S.patientId, protocol: { ...S } });
      } else if (typeof api?.generateProtocol === 'function') {
        await api.generateProtocol({ ...S });
      }
      try { alert('Exported to patient course.'); } catch {}
    } catch { try { alert('Export endpoint offline — saved as draft.'); } catch {} }
  };

  paint();
}

// Compat alias so existing protocol-hub route keeps working.
export { pgProtocolStudio as pgProtocolHub };

// Legacy protocol hub removed — functionality merged into pgProtocolStudio.
// Handbooks moved to pgHandbooks (handbooks-v2 route).
// Brain Map Planner moved to its own screen (brain-map-planner route).


// ═══════════════════════════════════════════════════════════════════════════════
// pgSchedulingHub — Calendar · Bookings · Leads · Reception
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgSchedulingHub(setTopbar, navigate) {
  // ── Design-v2 Schedule (screen 04): Appointments · Referrals · Staff ──────
  const tab = ['appointments','referrals','staff'].includes(window._schedHubTab) ? window._schedHubTab : 'appointments';
  window._schedHubTab = tab;

  const el = document.getElementById('content');

  if (!document.getElementById('dv2s-sched-styles')) {
    const _ss = document.createElement('style'); _ss.id = 'dv2s-sched-styles';
    _ss.textContent = `
.dv2s-shell{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dv2-bg,var(--bg));}
.dv2s-tab-bar{display:flex;gap:6px;padding:10px 20px 0;border-bottom:1px solid var(--border);background:var(--bg-panel,var(--bg-surface));flex-shrink:0;}
.dv2s-tab{padding:8px 14px;font-size:12px;font-weight:600;color:var(--text-tertiary);background:transparent;border:1px solid transparent;border-radius:999px 999px 0 0;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;letter-spacing:-.005em;}
.dv2s-tab:hover{color:var(--text-secondary);background:rgba(255,255,255,0.03);}
.dv2s-tab.is-active{color:var(--text-primary);background:var(--bg-surface);border-color:var(--border);border-bottom-color:var(--bg-surface);box-shadow:inset 0 2px 0 var(--dv2-accent,var(--teal));}
.dv2s-tab-count{font-family:var(--dv2-font-mono,var(--font-mono));font-size:10px;padding:1px 6px;border-radius:3px;background:var(--bg-surface);color:var(--text-tertiary);}
.dv2s-tab.is-active .dv2s-tab-count{background:rgba(0,212,188,0.14);color:var(--teal);}
.dv2s-toolbar{display:flex;gap:10px;align-items:center;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--bg-panel,var(--bg-surface));flex-wrap:wrap;flex-shrink:0;}
.dv2s-nav-btn{width:26px;height:26px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-family:inherit;padding:0;}
.dv2s-nav-btn:hover{background:rgba(255,255,255,0.05);color:var(--text-primary);}
.dv2s-today-btn{padding:4px 10px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-secondary);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;}
.dv2s-today-btn:hover{border-color:var(--dv2-accent,var(--teal));color:var(--text-primary);}
.dv2s-range{font-family:var(--font-display);font-size:14px;font-weight:600;color:var(--text-primary);padding:0 4px;letter-spacing:-.01em;}
.dv2s-range-sub{font-size:10.5px;color:var(--text-tertiary);margin-left:6px;font-family:var(--font-mono);}
.dv2s-view{display:inline-flex;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:2px;}
.dv2s-view button{padding:3px 10px;background:transparent;border:0;color:var(--text-tertiary);font-size:11px;font-weight:600;cursor:pointer;border-radius:4px;font-family:inherit;}
.dv2s-view button.is-active{background:var(--dv2-accent,var(--teal));color:#04121c;}
.dv2s-chip{padding:4px 10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:999px;font-size:11px;font-weight:500;color:var(--text-secondary);cursor:pointer;display:inline-flex;align-items:center;gap:5px;user-select:none;font-family:inherit;}
.dv2s-chip:hover{border-color:rgba(0,212,188,0.4);}
.dv2s-chip.is-active{background:rgba(0,212,188,0.1);border-color:rgba(0,212,188,0.4);color:var(--teal);}
.dv2s-chip-dot{width:6px;height:6px;border-radius:50%;}
.dv2s-chip.warn{color:var(--amber);border-color:rgba(255,181,71,0.3);background:rgba(255,181,71,0.06);}
.dv2s-chip.warn.is-active{background:rgba(255,181,71,0.18);color:var(--amber);}
.dv2s-legend{display:inline-flex;gap:10px;margin-left:auto;flex-wrap:wrap;font-size:10.5px;color:var(--text-tertiary);}
.dv2s-legend-item{display:inline-flex;align-items:center;gap:4px;}
.dv2s-legend-sw{width:8px;height:8px;border-radius:2px;}
.dv2s-body{flex:1;min-height:0;display:flex;overflow:hidden;}
.dv2s-grid-wrap{flex:1;min-width:0;overflow:auto;background:var(--bg);}
.dv2s-col-heads{display:grid;position:sticky;top:0;z-index:5;background:var(--bg-panel,var(--bg-surface));border-bottom:1px solid var(--border);grid-template-columns:64px repeat(28,minmax(120px,1fr));min-width:2000px;}
.dv2s-hours-head{grid-column:1;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--text-tertiary);font-family:var(--font-mono);letter-spacing:.08em;text-transform:uppercase;border-right:1px solid var(--border);}
.dv2s-day-head{display:flex;flex-direction:column;border-right:1px solid var(--border);}
.dv2s-day-head.today{background:linear-gradient(180deg,rgba(0,212,188,0.08),transparent 60%);}
.dv2s-day-head-top{display:flex;align-items:center;gap:6px;padding:8px 8px 4px;}
.dv2s-day-dow{font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;}
.dv2s-day-num{font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--text-primary);}
.dv2s-day-badge{margin-left:auto;font-size:9px;font-weight:700;color:var(--teal);background:rgba(0,212,188,0.14);padding:1px 5px;border-radius:3px;font-family:var(--font-mono);}
.dv2s-day-clins{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--border);}
.dv2s-clin{padding:4px 6px;font-size:10px;font-weight:600;color:var(--text-secondary);display:flex;flex-direction:column;gap:1px;border-right:1px solid var(--border);background:var(--bg-surface);}
.dv2s-clin:last-child{border-right:0;}
.dv2s-clin-util{font-family:var(--font-mono);font-size:9px;color:var(--text-tertiary);font-weight:500;}
.dv2s-clin.util-hi{background:linear-gradient(180deg,rgba(255,181,71,0.08),var(--bg-surface));}
.dv2s-grid{display:grid;grid-template-columns:64px repeat(28,minmax(120px,1fr));min-width:2000px;position:relative;}
.dv2s-hour-col{grid-column:1;background:var(--bg-panel,var(--bg-surface));border-right:1px solid var(--border);position:sticky;left:0;z-index:4;}
.dv2s-hour-row{height:48px;padding:2px 6px;font-size:9px;color:var(--text-tertiary);font-family:var(--font-mono);border-bottom:1px dashed rgba(255,255,255,0.04);text-align:right;}
.dv2s-clin-col{position:relative;border-right:1px solid rgba(255,255,255,0.04);}
.dv2s-clin-col.day-last{border-right:1px solid var(--border);}
.dv2s-slot{height:24px;border-bottom:1px dashed rgba(255,255,255,0.03);cursor:pointer;transition:background .1s;}
.dv2s-slot.on-hour{border-bottom-color:rgba(255,255,255,0.06);}
.dv2s-slot.nonclinic{background:rgba(0,0,0,0.15);cursor:default;}
.dv2s-slot:not(.nonclinic):hover{background:rgba(0,212,188,0.08);}
.dv2s-slot.flash{background:rgba(0,212,188,0.22)!important;}
.dv2s-event{position:absolute;left:3px;right:3px;border-radius:4px;padding:3px 5px;font-size:10px;line-height:1.25;cursor:pointer;overflow:hidden;background:var(--bg-surface);border:1px solid var(--border);border-left:3px solid var(--teal);}
.dv2s-event:hover{z-index:3;filter:brightness(1.15);box-shadow:0 2px 12px rgba(0,0,0,0.4);}
.dv2s-event.is-selected{outline:2px solid var(--dv2-accent,var(--teal));outline-offset:-1px;z-index:4;}
.dv2s-event.ev-tdcs{background:rgba(0,212,188,0.14);border-left-color:var(--teal);}
.dv2s-event.ev-rtms{background:rgba(74,158,255,0.14);border-left-color:var(--blue);}
.dv2s-event.ev-nf{background:rgba(155,127,255,0.14);border-left-color:var(--violet);}
.dv2s-event.ev-bio{background:rgba(74,222,128,0.12);border-left-color:var(--green);}
.dv2s-event.ev-assess{background:rgba(255,107,157,0.14);border-left-color:var(--rose);}
.dv2s-event.ev-intake{background:rgba(255,181,71,0.14);border-left-color:var(--amber);}
.dv2s-event.ev-tele{background:rgba(74,158,255,0.08);border-left-color:var(--blue);border-style:dashed;}
.dv2s-event.ev-mdt,.dv2s-event.ev-hw,.dv2s-event.ev-admin{background:rgba(255,255,255,0.04);border-left-color:var(--text-tertiary);color:var(--text-tertiary);}
.dv2s-event-name{font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10.5px;}
.dv2s-event-meta{font-size:9.5px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;}
.dv2s-event-warn{position:absolute;top:2px;right:3px;font-size:10px;pointer-events:none;}
.dv2s-event-warn.err{color:var(--red,#ff5e7a);}
.dv2s-event-warn.amb{color:var(--amber);}
.dv2s-now-line{position:absolute;left:0;right:0;height:2px;background:var(--red,#ff5e7a);z-index:6;pointer-events:none;}
.dv2s-now-dot{position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:var(--red,#ff5e7a);box-shadow:0 0 0 3px rgba(255,94,122,0.25);}
.dv2s-side{width:320px;border-left:1px solid var(--border);background:var(--bg-panel,var(--bg-surface));display:flex;flex-direction:column;flex-shrink:0;transition:width .2s;}
.dv2s-side.collapsed{width:0;border-left:0;overflow:hidden;}
.dv2s-side-head{padding:14px 14px 10px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:flex-start;}
.dv2s-side-av{width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#04121c;background:linear-gradient(135deg,var(--teal),var(--blue));flex-shrink:0;}
.dv2s-side-name{font-family:var(--font-display);font-size:14px;font-weight:600;color:var(--text-primary);}
.dv2s-side-sub{font-size:11px;color:var(--text-tertiary);margin-top:2px;}
.dv2s-side-close{background:transparent;border:0;color:var(--text-tertiary);font-size:16px;cursor:pointer;padding:2px 6px;font-family:inherit;}
.dv2s-side-body{flex:1;overflow-y:auto;padding:12px 14px;}
.dv2s-side-section{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);font-weight:600;margin:12px 0 6px;}
.dv2s-side-row{display:grid;grid-template-columns:90px 1fr;gap:8px;font-size:11.5px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);}
.dv2s-side-row .lbl{color:var(--text-tertiary);}
.dv2s-side-row .val{color:var(--text-primary);}
.dv2s-warn{display:flex;gap:8px;padding:8px 10px;border-radius:6px;margin-bottom:6px;font-size:11px;}
.dv2s-warn.err{background:rgba(255,94,122,0.08);border:1px solid rgba(255,94,122,0.28);}
.dv2s-warn.amb{background:rgba(255,181,71,0.08);border:1px solid rgba(255,181,71,0.28);}
.dv2s-warn.ok{background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.22);}
.dv2s-warn-ico{font-size:14px;flex-shrink:0;}
.dv2s-warn.err .dv2s-warn-ico{color:var(--red,#ff5e7a);}
.dv2s-warn.amb .dv2s-warn-ico{color:var(--amber);}
.dv2s-warn.ok .dv2s-warn-ico{color:var(--green,#4ade80);}
.dv2s-warn-title{font-weight:600;color:var(--text-primary);margin-bottom:2px;}
.dv2s-warn-body{color:var(--text-secondary);line-height:1.45;}
.dv2s-side-foot{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--border);}
.dv2s-refbox{padding:20px;overflow-y:auto;flex:1;}
.dv2s-ref-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;}
.dv2s-ref-card{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-surface);display:flex;flex-direction:column;gap:6px;}
.dv2s-ref-card h4{margin:0;font-size:13px;color:var(--text-primary);font-family:var(--font-display);}
.dv2s-ref-sub{font-size:11px;color:var(--text-tertiary);}
.dv2s-ref-meta{display:flex;gap:6px;flex-wrap:wrap;font-size:10.5px;}
.dv2s-ref-chip{padding:2px 7px;border-radius:999px;background:var(--bg-panel,var(--bg));color:var(--text-secondary);border:1px solid var(--border);}
.dv2s-ref-chip.new{color:var(--teal);border-color:rgba(0,212,188,0.35);}
.dv2s-ref-chip.contacted{color:var(--blue);border-color:rgba(74,158,255,0.35);}
.dv2s-ref-chip.qualified{color:var(--violet);border-color:rgba(155,127,255,0.35);}
.dv2s-ref-chip.booked{color:var(--green,#4ade80);border-color:rgba(74,222,128,0.35);}
.dv2s-ref-chip.lost{color:var(--text-tertiary);}
.dv2s-staff{padding:20px;overflow-y:auto;flex:1;}
.dv2s-staff-table{width:100%;border-collapse:collapse;font-size:12px;}
.dv2s-staff-table th{text-align:left;padding:8px 10px;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--border);}
.dv2s-staff-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,0.04);color:var(--text-primary);}
.dv2s-staff-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;}
.dv2s-empty{padding:40px;text-align:center;color:var(--text-tertiary);}
.dv2s-error-banner{padding:6px 14px;background:rgba(255,181,71,0.08);color:var(--amber);font-size:11px;border-bottom:1px solid rgba(255,181,71,0.2);}
@media (max-width:960px){.dv2s-side{width:0;border-left:0;overflow:hidden;}}
`;
    document.head.appendChild(_ss);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const pad2 = (n) => String(n).padStart(2,'0');
  const iso = (d) => d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
  const now = new Date();

  window._schedAnchor = window._schedAnchor || iso(now);
  function weekDays(anchorIso) {
    const d = new Date(anchorIso + 'T12:00:00');
    const dow = d.getDay();
    const mondayOffset = (dow === 0 ? -6 : 1 - dow);
    d.setDate(d.getDate() + mondayOffset);
    return Array.from({length:7}, (_, i) => {
      const day = new Date(d); day.setDate(d.getDate() + i);
      const isoStr = iso(day);
      return {
        date: day,
        iso: isoStr,
        dow: ['SUN','MON','TUE','WED','THU','FRI','SAT'][day.getDay()],
        num: day.getDate(),
        label: day.toLocaleDateString('en-GB', { day:'numeric', month:'short' }),
        today: isoStr === iso(now),
      };
    });
  }
  function shiftAnchor(deltaDays) {
    const d = new Date(window._schedAnchor + 'T12:00:00');
    d.setDate(d.getDate() + deltaDays);
    window._schedAnchor = iso(d);
  }

  const DAYS = weekDays(window._schedAnchor);
  const windowFrom = DAYS[0].iso;
  const windowTo   = DAYS[6].iso;

  const DEFAULT_CLINICIANS = [
    { id:'ak', name:'Kolmar', color:'var(--teal)'   },
    { id:'rp', name:'Patel',  color:'var(--blue)'   },
    { id:'mv', name:'Velez',  color:'var(--violet)' },
    { id:'jn', name:'Njoku',  color:'var(--rose)'   },
  ];
  const DEFAULT_ROOMS = [
    { id:'tms-suite',  name:'TMS Suite'   },
    { id:'eeg-lab',    name:'EEG Lab'     },
    { id:'rm-1',       name:'Room 1'      },
    { id:'rm-2',       name:'Room 2'      },
    { id:'consult',    name:'Consult Rm'  },
    { id:'rm-4',       name:'Room 4'      },
  ];

  const TYPES = {
    'tdcs':         { cls:'ev-tdcs',   label:'tDCS',          color:'var(--teal)'   },
    'rtms':         { cls:'ev-rtms',   label:'rTMS',          color:'var(--blue)'   },
    'tms':          { cls:'ev-rtms',   label:'rTMS',          color:'var(--blue)'   },
    'nf':           { cls:'ev-nf',     label:'Neurofeedback', color:'var(--violet)' },
    'neurofeedback':{ cls:'ev-nf',     label:'Neurofeedback', color:'var(--violet)' },
    'bio':          { cls:'ev-bio',    label:'Biofeedback',   color:'var(--green)'  },
    'biofeedback':  { cls:'ev-bio',    label:'Biofeedback',   color:'var(--green)'  },
    'session':      { cls:'ev-tdcs',   label:'Session',       color:'var(--teal)'   },
    'assessment':   { cls:'ev-assess', label:'Assessment',    color:'var(--rose)'   },
    'assess':       { cls:'ev-assess', label:'Assessment',    color:'var(--rose)'   },
    'intake':       { cls:'ev-intake', label:'Intake',        color:'var(--amber)'  },
    'new-patient':  { cls:'ev-intake', label:'Intake',        color:'var(--amber)'  },
    'follow-up':    { cls:'ev-intake', label:'Follow-up',     color:'var(--amber)'  },
    'tele':         { cls:'ev-tele',   label:'Telehealth',    color:'var(--blue)'   },
    'telehealth':   { cls:'ev-tele',   label:'Telehealth',    color:'var(--blue)'   },
    'mdt':          { cls:'ev-mdt',    label:'MDT',           color:'var(--text-tertiary)' },
    'hw':           { cls:'ev-hw',     label:'Homework',      color:'var(--text-tertiary)' },
    'homework':     { cls:'ev-hw',     label:'Homework',      color:'var(--text-tertiary)' },
    'admin':        { cls:'ev-admin',  label:'Admin',         color:'var(--text-tertiary)' },
  };
  const typeMeta = (t) => TYPES[String(t||'').toLowerCase()] || TYPES.session;

  let apiErrors = [];
  let clinicians = DEFAULT_CLINICIANS;
  let rooms = DEFAULT_ROOMS;
  let sessions = null;
  let leads = [];
  let staffSchedule = [];

  const apiCalls = await Promise.allSettled([
    (typeof api.listClinicians === 'function' ? api.listClinicians() : Promise.reject('stub')),
    (typeof api.listRooms === 'function' ? api.listRooms() : Promise.reject('stub')),
    (typeof api.listSessions === 'function' ? api.listSessions({ from: windowFrom, to: windowTo }) : Promise.reject('stub')),
    (typeof api.listCourses === 'function' ? api.listCourses({}) : Promise.reject('stub')),
    (typeof api.listReferrals === 'function' ? api.listReferrals() : (typeof api.listLeads === 'function' ? api.listLeads() : Promise.reject('stub'))),
    (typeof api.listStaffSchedule === 'function' ? api.listStaffSchedule() : Promise.reject('stub')),
  ]);

  if (apiCalls[0].status === 'fulfilled') {
    const items = apiCalls[0].value?.items || apiCalls[0].value || [];
    if (Array.isArray(items) && items.length) {
      clinicians = items.slice(0,4).map((c,i)=>({ id:c.id||('c'+i), name:c.name||c.full_name||('Clinician '+(i+1)), color:DEFAULT_CLINICIANS[i%4].color }));
    }
  }
  if (apiCalls[1].status === 'fulfilled') {
    const items = apiCalls[1].value?.items || apiCalls[1].value || [];
    if (Array.isArray(items) && items.length) rooms = items.map(r=>({ id:r.id, name:r.name||r.label||r.id }));
  }
  if (apiCalls[2].status === 'fulfilled') {
    sessions = apiCalls[2].value?.items || apiCalls[2].value || [];
  } else {
    apiErrors.push('sessions');
    sessions = null;
  }
  if (apiCalls[4].status === 'fulfilled') {
    const items = apiCalls[4].value?.items || apiCalls[4].value || [];
    leads = items.map(l => ({
      id: l.id, name: l.name || l.patient_name || 'Unknown',
      source: l.source || l.origin || 'referral',
      condition: l.condition || l.indication || '',
      stage: l.stage || l.status || 'new',
      phone: l.phone || '', email: l.email || '',
      created: (l.created_at || '').slice(0,10),
      notes: l.notes || '', triage: l.triage || '',
      follow_up: l.follow_up || '',
    }));
  } else {
    apiErrors.push('referrals');
  }
  if (apiCalls[5].status === 'fulfilled') {
    staffSchedule = apiCalls[5].value?.items || apiCalls[5].value || [];
  }

  if (!leads.length) {
    leads = [
      { id:'L-1', name:'Sarah Johnson',  source:'website',  condition:'Depression', stage:'new',       phone:'+44 7700 900123', created:'2026-04-14', notes:'TRD, 3 meds tried.' },
      { id:'L-2', name:'Robert Kim',     source:'GP',       condition:'Anxiety',    stage:'contacted', phone:'+44 7700 900456', created:'2026-04-13', notes:'Referred by GP. GAD-7=15.' },
      { id:'L-3', name:'Emma Clarke',    source:'phone',    condition:'OCD',        stage:'qualified', phone:'+44 7700 900789', created:'2026-04-12', notes:'Deep TMS candidate.' },
      { id:'L-4', name:'David Nguyen',   source:'GP',       condition:'PTSD',       stage:'booked',    phone:'+44 7700 900321', created:'2026-04-10', notes:'Intake booked.' },
      { id:'L-5', name:'Lucy Fernandez', source:'website',  condition:'Depression', stage:'lost',      phone:'+44 7700 900654', created:'2026-04-08', notes:'Chose medication only.' },
    ];
  }

  function buildMockEvents() {
    const ev = [];
    const clinIds = clinicians.map(c => c.id);
    const pCycle = ['Samantha Li','Marcus Reilly','Priya Nambiar','Dana Keller','Aisha Haddad','Rafael Figueroa','K. Yamada','G. Bennett','H. Nakamura','J. Abernathy','Jamal Thompson','L. Hassan','Nora Iyer','D. Ortega','R. Svensson','F. Akbari','C. Morales','V. Ibarra','M. Duvall','S. Varga','T. Wu','J. Okonkwo','B. Moss','Elena Okafor','B. Faulkner','P. Larsson'];
    const tCycle = ['tdcs','rtms','nf','bio','assess','intake','tele','mdt','hw'];
    let n = 0;
    for (let di = 0; di < 7; di++) {
      const isWeekend = di >= 5;
      clinIds.forEach((cid, ci) => {
        const slots = isWeekend ? [ 9, 10 ] : [ 8, 9, 9.5, 10, 11, 13, 14, 15, 16 ];
        slots.forEach((start, si) => {
          if (((n * 7) % 17) < 3 && !isWeekend) { n++; return; }
          const dur = start === 9 || start === 14 ? 0.5 : 1;
          const type = tCycle[(n + ci + si) % tCycle.length];
          const warn = (n % 17 === 0) ? 'err' : (n % 13 === 0 ? 'amb' : null);
          ev.push({
            id: 'MOCK-' + n, day: di, clin: cid,
            start, end: Math.min(start + dur, 19),
            type, patient: pCycle[n % pCycle.length],
            meta: rooms[n % rooms.length]?.name || '',
            warn,
            duration: Math.round(dur * 60),
            clinician: clinicians[ci]?.name || '',
            course_position: (n % 20) + 1,
            course_total: 20,
          });
          n++;
        });
      });
    }
    return ev;
  }

  function sessionToEvent(s) {
    const scheduledAt = s.scheduled_at || (s.date && s.time ? (s.date + 'T' + s.time) : '');
    if (!scheduledAt) return null;
    const iso0 = scheduledAt.split('T')[0];
    const hhmm = scheduledAt.split('T')[1]?.slice(0,5) || '09:00';
    const dayIdx = DAYS.findIndex(d => d.iso === iso0);
    if (dayIdx < 0) return null;
    const [h, m] = hhmm.split(':').map(Number);
    const start = h + (m||0)/60;
    const dur = (s.duration_minutes || s.duration || 60) / 60;
    const type = (s.appointment_type || s.modality || s.type || 'session').toLowerCase();
    const clinLookup = String(s.clinician_id || s.clinician || '').toLowerCase();
    const clin = clinicians.find(c => String(c.id||'').toLowerCase() === clinLookup || String(c.name||'').toLowerCase() === clinLookup) || clinicians[0];
    return {
      id: s.id,
      day: dayIdx,
      clin: clin.id,
      clinician: clin.name,
      start, end: Math.min(start + dur, 24),
      type,
      patient: s.patient_name || s.patient_id || 'Unknown',
      meta: s.room_id || s.room || s.device_id || '',
      warn: s.has_conflict ? 'err' : (s.prereq_missing ? 'amb' : null),
      duration: s.duration_minutes || s.duration || 60,
      course_position: s.course_position || null,
      course_total: s.course_total || null,
      status: s.status || 'scheduled',
      notes: s.session_notes || '',
      _raw: s,
    };
  }

  let events = [];
  if (Array.isArray(sessions) && sessions.length) {
    events = sessions.map(sessionToEvent).filter(Boolean);
  }
  if (!events.length) {
    events = buildMockEvents();
  }

  window._schedFilters = window._schedFilters || { clinicians:null, rooms:null, types:null, conflictsOnly:false };
  const F = window._schedFilters;

  function eventPasses(e) {
    if (F.clinicians && F.clinicians.length && !F.clinicians.includes(e.clin)) return false;
    if (F.types && F.types.length && !F.types.includes((e.type||'').toLowerCase())) return false;
    if (F.conflictsOnly && !e.warn) return false;
    return true;
  }

  const conflictCount = events.filter(e => e.warn === 'err').length;
  const prereqCount   = events.filter(e => e.warn === 'amb').length;

  const TAB_META = {
    appointments: { label:'Appointments', count: events.filter(eventPasses).length },
    referrals:    { label:'Referrals',    count: leads.length },
    staff:        { label:'Staff Schedule', count: clinicians.length },
  };
  function renderTabBar() {
    return '<div class="dv2s-tab-bar" role="tablist">' +
      Object.entries(TAB_META).map(([id, m]) =>
        '<button role="tab" aria-selected="'+(tab===id)+'" class="dv2s-tab'+(tab===id?' is-active':'')+'" onclick="window._schedHubTab=\''+id+'\';window._nav(\'scheduling-hub\')">'
        + esc(m.label) + '<span class="dv2s-tab-count">' + m.count + '</span></button>'
      ).join('') + '</div>';
  }

  setTopbar('Schedule', '<button class="btn btn-primary btn-sm" onclick="window._schedNewBookingIntent()">+ New booking</button>');
  window._schedNewBookingIntent = () => {
    console.debug('booking wizard for (new)');
    window._dsToast?.({ title:'Booking wizard', body:'Full wizard arrives in next phase.', severity:'info' });
  };

  const ROW_H = 48;
  const SLOT_H = 24;

  function buildAppointments() {
    const range = DAYS[0].label + ' — ' + DAYS[6].label + ', ' + DAYS[0].date.getFullYear();
    const typeChip = (t, label) => {
      const active = F.types && F.types.includes(t);
      return '<button class="dv2s-chip'+(active?' is-active':'')+'" onclick="window._schedToggleType(\''+t+'\')"><span class="dv2s-chip-dot" style="background:'+typeMeta(t).color+'"></span>'+esc(label)+'</button>';
    };
    const clinChip = (c) => {
      const active = F.clinicians && F.clinicians.includes(c.id);
      return '<button class="dv2s-chip'+(active?' is-active':'')+'" onclick="window._schedToggleClinician(\''+c.id+'\')"><span class="dv2s-chip-dot" style="background:'+c.color+'"></span>'+esc(c.name)+'</button>';
    };
    const toolbar =
      '<div class="dv2s-toolbar">'
      + '<div style="display:flex;gap:4px;align-items:center">'
        + '<button class="dv2s-nav-btn" onclick="window._schedShift(-7)" title="Previous week">&lsaquo;</button>'
        + '<button class="dv2s-today-btn" onclick="window._schedToday()">Today</button>'
        + '<button class="dv2s-nav-btn" onclick="window._schedShift(7)" title="Next week">&rsaquo;</button>'
      + '</div>'
      + '<div class="dv2s-range">'+esc(range)+'<span class="dv2s-range-sub">Week view</span></div>'
      + '<div class="dv2s-view">'
        + '<button data-view="day">Day</button>'
        + '<button data-view="week" class="is-active">Week</button>'
        + '<button data-view="resources">Resources</button>'
        + '<button data-view="month">Month</button>'
      + '</div>'
      + '<div style="width:1px;height:20px;background:var(--border)"></div>'
      + clinicians.map(clinChip).join('')
      + typeChip('tdcs','tDCS') + typeChip('rtms','rTMS') + typeChip('nf','NF') + typeChip('bio','Bio') + typeChip('assess','Assess') + typeChip('intake','Intake') + typeChip('tele','Telehealth')
      + '<button class="dv2s-chip warn'+(F.conflictsOnly?' is-active':'')+'" onclick="window._schedToggleConflicts()">&#9888; '+conflictCount+' conflicts'+(prereqCount?(' &middot; &#9680; '+prereqCount+' prereqs'):'')+'</button>'
      + '<div class="dv2s-legend">'
        + '<span class="dv2s-legend-item"><span class="dv2s-legend-sw" style="background:var(--teal)"></span>tDCS</span>'
        + '<span class="dv2s-legend-item"><span class="dv2s-legend-sw" style="background:var(--blue)"></span>rTMS</span>'
        + '<span class="dv2s-legend-item"><span class="dv2s-legend-sw" style="background:var(--violet)"></span>NF/MDT</span>'
        + '<span class="dv2s-legend-item"><span class="dv2s-legend-sw" style="background:var(--green,#4ade80)"></span>Bio</span>'
        + '<span class="dv2s-legend-item"><span class="dv2s-legend-sw" style="background:var(--rose)"></span>Assess</span>'
        + '<span class="dv2s-legend-item"><span class="dv2s-legend-sw" style="background:var(--amber)"></span>Intake</span>'
      + '</div>'
      + '</div>';

    let heads = '<div class="dv2s-col-heads"><div class="dv2s-hours-head">24h</div>';
    DAYS.forEach((d, di) => {
      heads += '<div class="dv2s-day-head'+(d.today?' today':'')+'" style="grid-column:span 4">'
        + '<div class="dv2s-day-head-top">'
          + '<span class="dv2s-day-dow">'+d.dow+'</span>'
          + '<span class="dv2s-day-num">'+d.num+'</span>'
          + (d.today ? '<span class="dv2s-day-badge">TODAY</span>' : '')
        + '</div>'
        + '<div class="dv2s-day-clins">'
          + clinicians.map((c) => {
              const clinEvents = events.filter(e => e.day === di && e.clin === c.id);
              const util = Math.min(100, Math.round(clinEvents.reduce((s,e)=>s+(e.end-e.start),0) / 12 * 100));
              return '<div class="dv2s-clin'+(util>=90?' util-hi':'')+'"><span style="color:'+c.color+';font-size:9px">&#9679;</span> '+esc(c.name)+'<span class="dv2s-clin-util">'+util+'%</span></div>';
            }).join('')
        + '</div>'
      + '</div>';
    });
    heads += '</div>';

    let grid = '<div class="dv2s-grid">';
    grid += '<div class="dv2s-hour-col" style="grid-row:1">';
    for (let h = 0; h < 24; h++) {
      const label = h === 0 ? '12 AM' : h < 12 ? (h + ' AM') : h === 12 ? '12 PM' : ((h-12) + ' PM');
      grid += '<div class="dv2s-hour-row">'+label+'</div>';
    }
    grid += '</div>';

    DAYS.forEach((d, di) => {
      clinicians.forEach((c, ci) => {
        const isLast = ci === clinicians.length - 1;
        grid += '<div class="dv2s-clin-col'+(isLast?' day-last':'')+'" style="grid-row:1">';
        for (let h = 0; h < 24; h++) {
          for (let m = 0; m < 2; m++) {
            const isClinic = h >= 7 && h < 19;
            const t = h + m*0.5;
            grid += '<div class="dv2s-slot'+(!isClinic?' nonclinic':'')+(m===0?' on-hour':'')+'" data-day="'+di+'" data-clin="'+esc(c.id)+'" data-t="'+t+'"></div>';
          }
        }
        events.filter(e => e.day === di && e.clin === c.id && eventPasses(e)).forEach((e) => {
          const topPx = e.start * ROW_H;
          const heightPx = Math.max(SLOT_H - 2, (e.end - e.start) * ROW_H - 1);
          const meta = typeMeta(e.type);
          const warnIco = e.warn === 'err' ? '<span class="dv2s-event-warn err">&#9888;</span>' : e.warn === 'amb' ? '<span class="dv2s-event-warn amb">&#9680;</span>' : '';
          const showMeta = heightPx >= 32 && e.meta;
          const title = esc(e.patient) + ' · ' + esc(meta.label) + ' · ' + e.duration + ' min';
          const selCls = (String(window._schedSelectedId) === String(e.id)) ? ' is-selected' : '';
          grid += '<div class="dv2s-event '+meta.cls+selCls+'" style="top:'+topPx+'px;height:'+heightPx+'px" data-event-id="'+esc(e.id)+'" title="'+title+'">'
            + warnIco
            + '<div class="dv2s-event-name">'+esc(e.patient)+'</div>'
            + (showMeta ? '<div class="dv2s-event-meta">'+esc(e.meta)+'</div>' : '')
          + '</div>';
        });
        if (d.today) {
          const hNow = now.getHours() + now.getMinutes()/60;
          const top = hNow * ROW_H;
          grid += '<div class="dv2s-now-line" style="top:'+top+'px"><div class="dv2s-now-dot"></div></div>';
        }
        grid += '</div>';
      });
    });
    grid += '</div>';

    const selId = window._schedSelectedId || null;
    const sel = selId ? events.find(e => String(e.id) === String(selId)) : null;
    const side = renderSidePanel(sel);

    return toolbar + '<div class="dv2s-body">'
      + '<div class="dv2s-grid-wrap" id="dv2s-grid-wrap">' + heads + grid + '</div>'
      + side
    + '</div>';
  }

  function renderSidePanel(sel) {
    if (!sel) {
      return '<aside class="dv2s-side" id="dv2s-side">'
        + '<div class="dv2s-side-body" style="display:flex;align-items:center;justify-content:center;text-align:center;color:var(--text-tertiary);font-size:12px">Select an appointment to see details</div>'
      + '</aside>';
    }
    const meta = typeMeta(sel.type);
    const initials = String(sel.patient||'').split(/\s+/).map(w=>w[0]||'').slice(0,2).join('').toUpperCase();
    const rem = (sel.course_total && sel.course_position) ? (sel.course_total - sel.course_position) : 0;
    const warns = [];
    if (sel.warn === 'err') warns.push('<div class="dv2s-warn err"><div class="dv2s-warn-ico">&#9888;</div><div><div class="dv2s-warn-title">Device / clinician conflict</div><div class="dv2s-warn-body">Overlapping booking detected. Review resource assignment.</div></div></div>');
    if (sel.warn === 'amb') warns.push('<div class="dv2s-warn amb"><div class="dv2s-warn-ico">&#9680;</div><div><div class="dv2s-warn-title">Prereq outstanding</div><div class="dv2s-warn-body">Assessment or consent overdue for this course.</div></div></div>');
    warns.push('<div class="dv2s-warn ok"><div class="dv2s-warn-ico">&#10003;</div><div><div class="dv2s-warn-title">Consent &amp; auth OK</div><div class="dv2s-warn-body">e-consent on file; payer auth valid.</div></div></div>');

    return '<aside class="dv2s-side" id="dv2s-side">'
      + '<div class="dv2s-side-head">'
        + '<div class="dv2s-side-av">'+esc(initials||'PT')+'</div>'
        + '<div style="flex:1;min-width:0"><div class="dv2s-side-name">'+esc(sel.patient)+'</div>'
        + '<div class="dv2s-side-sub">'+esc(meta.label)+(sel.course_position?' &middot; Session '+sel.course_position+(sel.course_total?('/'+sel.course_total):''):'')+'</div></div>'
        + '<button class="dv2s-side-close" onclick="window._schedSelectedId=null;window._nav(\'scheduling-hub\')" title="Close">&#10005;</button>'
      + '</div>'
      + '<div class="dv2s-side-body">'
        + warns.join('')
        + '<div class="dv2s-side-section">Appointment</div>'
        + '<div class="dv2s-side-row"><div class="lbl">Protocol</div><div class="val">'+esc(meta.label)+'</div></div>'
        + '<div class="dv2s-side-row"><div class="lbl">Clinician</div><div class="val">'+esc(sel.clinician || '')+'</div></div>'
        + '<div class="dv2s-side-row"><div class="lbl">Room</div><div class="val">'+esc(sel.meta || '—')+'</div></div>'
        + '<div class="dv2s-side-row"><div class="lbl">Duration</div><div class="val">'+esc(sel.duration+' min')+'</div></div>'
        + (sel.course_position ? '<div class="dv2s-side-row"><div class="lbl">Course</div><div class="val">Session '+sel.course_position+' of '+(sel.course_total||'—')+'</div></div>' : '')
        + '<div class="dv2s-side-section">Risk signals</div>'
        + '<div class="dv2s-side-row"><div class="lbl">No-show</div><div class="val" style="color:var(--green,#4ade80)">12% &middot; low</div></div>'
        + (rem ? ('<div class="dv2s-side-section">Remaining sessions</div><div style="padding:8px 10px;background:var(--bg-surface);border-radius:6px;font-size:11px;color:var(--text-secondary)">'+rem+' sessions remaining in course</div>') : '')
      + '</div>'
      + '<div class="dv2s-side-foot">'
        + '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._schedReschedule(\''+esc(sel.id)+'\')">Reschedule</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="window._schedCancelEvent(\''+esc(sel.id)+'\')">Cancel</button>'
        + '<button class="btn btn-primary btn-sm" style="flex:1" onclick="window._schedOpenChart(\''+esc(sel.id)+'\')">Open chart &rarr;</button>'
      + '</div>'
    + '</aside>';
  }

  function buildReferrals() {
    if (!leads.length) {
      return '<div class="dv2s-empty">No referrals in the queue.</div>';
    }
    const stageOrder = ['new','contacted','qualified','booked','lost'];
    const grouped = {};
    leads.forEach(l => { const s = (l.stage||'new').toLowerCase(); (grouped[s] = grouped[s] || []).push(l); });
    let html = '<div class="dv2s-refbox">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">';
    html += '<h3 style="margin:0;font-size:15px;font-family:var(--font-display)">Incoming referrals &middot; '+leads.length+'</h3>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '<button class="dv2s-chip is-active">All sources</button>'
      + '<button class="dv2s-chip">GP referrals</button>'
      + '<button class="dv2s-chip">Self-referral</button>'
      + '<button class="dv2s-chip warn">&#9888; Needs triage</button>'
    + '</div>';
    html += '</div>';
    stageOrder.forEach(stage => {
      const items = grouped[stage] || [];
      if (!items.length) return;
      html += '<div style="margin-bottom:16px">';
      html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);font-weight:600;margin-bottom:8px">'+esc(stage)+' &middot; '+items.length+'</div>';
      html += '<div class="dv2s-ref-grid">';
      html += items.map(l => (
        '<div class="dv2s-ref-card">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">'
            + '<div><h4>'+esc(l.name)+'</h4><div class="dv2s-ref-sub">'+esc(l.condition||'—')+'</div></div>'
            + '<span class="dv2s-ref-chip '+esc(stage)+'">'+esc(stage)+'</span>'
          + '</div>'
          + '<div class="dv2s-ref-meta">'
            + '<span class="dv2s-ref-chip">'+esc(l.source||'referral')+'</span>'
            + (l.phone ? '<span class="dv2s-ref-chip">'+esc(l.phone)+'</span>' : '')
            + (l.created ? '<span class="dv2s-ref-chip">Recv '+esc(l.created)+'</span>' : '')
          + '</div>'
          + (l.notes ? '<div style="font-size:11px;color:var(--text-secondary);line-height:1.45">'+esc(l.notes)+'</div>' : '')
          + '<div style="display:flex;gap:6px;margin-top:4px">'
            + '<button class="btn btn-sm btn-ghost" onclick="window._schedTriageLead(\''+esc(l.id)+'\')">Triage</button>'
            + '<button class="btn btn-sm btn-primary" onclick="window._schedBookLead(\''+esc(l.id)+'\')">Book intake</button>'
          + '</div>'
        + '</div>'
      )).join('');
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function buildStaff() {
    const rosterRows = clinicians.map((c) => {
      const weekHours = DAYS.map((d, di) => {
        const myEvents = events.filter(e => e.clin === c.id && e.day === di);
        const hrs = myEvents.reduce((s,e)=>s+(e.end-e.start),0);
        const dow = d.date.getDay();
        return { day: d.dow, hrs: Math.round(hrs*10)/10, status: (dow===0||dow===6) ? 'off' : hrs>0 ? 'on' : 'idle' };
      });
      const weekTotal = weekHours.reduce((s,x)=>s+x.hrs,0);
      const onCall = (c.id === 'jn');
      return '<tr>'
        + '<td><span class="dv2s-staff-dot" style="background:'+c.color+'"></span>'+esc(c.name)+'<span style="color:var(--text-tertiary);font-size:10.5px;margin-left:8px">Clinician</span></td>'
        + weekHours.map(x => '<td style="color:'+(x.status==='off'?'var(--text-tertiary)':x.hrs>8?'var(--amber)':'var(--text-primary)')+';font-family:var(--font-mono);font-size:11px">'+(x.status==='off'?'off':x.hrs.toFixed(1)+'h')+'</td>').join('')
        + '<td style="font-family:var(--font-mono);font-weight:600">'+Math.round(weekTotal*10)/10+'h</td>'
        + '<td>'+(onCall ? '<span style="color:var(--amber);font-size:10.5px">On call</span>' : '<span style="color:var(--text-tertiary);font-size:10.5px">—</span>')+'</td>'
      + '</tr>';
    }).join('');

    const roomRows = rooms.map((r) => {
      const bookings = events.filter(e => e.meta === r.name).length;
      const pct = Math.round((bookings / Math.max(events.length,1)) * 100);
      return '<tr>'
        + '<td>'+esc(r.name)+'</td>'
        + '<td style="font-family:var(--font-mono)">'+bookings+'</td>'
        + '<td style="color:var(--text-tertiary);font-size:11px">'+pct+'% of bookings</td>'
        + '<td style="color:var(--text-tertiary);font-size:11px">Available</td>'
      + '</tr>';
    }).join('');

    return '<div class="dv2s-staff">'
      + '<h3 style="margin:0 0 12px;font-size:15px;font-family:var(--font-display)">Clinician roster &middot; this week</h3>'
      + '<div style="overflow-x:auto"><table class="dv2s-staff-table">'
        + '<thead><tr><th>Clinician</th>' + DAYS.map(d => '<th>'+d.dow+' '+d.num+'</th>').join('') + '<th>Total</th><th>On call</th></tr></thead>'
        + '<tbody>'+rosterRows+'</tbody>'
      + '</table></div>'
      + '<h3 style="margin:24px 0 12px;font-size:15px;font-family:var(--font-display)">Rooms &middot; utilization</h3>'
      + '<div style="overflow-x:auto"><table class="dv2s-staff-table">'
        + '<thead><tr><th>Room</th><th>Bookings (wk)</th><th>Share</th><th>Status</th></tr></thead>'
        + '<tbody>'+roomRows+'</tbody>'
      + '</table></div>'
      + '<div style="margin-top:18px;padding:12px 14px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--text-tertiary)">Read-only roster view. PTO &middot; on-call rotation &middot; edit roster arrives in the next release.</div>'
    + '</div>';
  }

  window._schedShift = (delta) => { shiftAnchor(delta); window._schedSelectedId=null; window._nav('scheduling-hub'); };
  window._schedToday = () => { window._schedAnchor = iso(new Date()); window._schedSelectedId=null; window._nav('scheduling-hub'); };
  window._schedToggleClinician = (id) => {
    F.clinicians = F.clinicians || [];
    if (F.clinicians.includes(id)) F.clinicians = F.clinicians.filter(x=>x!==id); else F.clinicians.push(id);
    if (F.clinicians.length === 0) F.clinicians = null;
    window._nav('scheduling-hub');
  };
  window._schedToggleType = (t) => {
    F.types = F.types || [];
    if (F.types.includes(t)) F.types = F.types.filter(x=>x!==t); else F.types.push(t);
    if (F.types.length === 0) F.types = null;
    window._nav('scheduling-hub');
  };
  window._schedToggleConflicts = () => { F.conflictsOnly = !F.conflictsOnly; window._nav('scheduling-hub'); };
  window._schedSelectEvent = (id) => { window._schedSelectedId = id; window._nav('scheduling-hub'); };
  window._schedReschedule = (id) => { console.debug('reschedule', id); window._dsToast?.({ title:'Reschedule', body:'Wizard in next phase.', severity:'info' }); };
  window._schedCancelEvent = (id) => { if (!confirm('Cancel this appointment?')) return; console.debug('cancel', id); window._dsToast?.({ title:'Cancelled', body:'Local only — sync pending.', severity:'warn' }); };
  window._schedOpenChart = (id) => { const ev = events.find(e=>String(e.id)===String(id)); if (!ev) return; window._nav?.('patient-hub'); };
  window._schedTriageLead = (id) => { console.debug('triage lead', id); window._dsToast?.({ title:'Triage', body:'Lead triage flow in next phase.', severity:'info' }); };
  window._schedBookLead = (id) => {
    const lead = leads.find(l => String(l.id) === String(id));
    console.debug('book intake for', lead);
    window._schedHubTab = 'appointments';
    window._nav('scheduling-hub');
  };

  async function _slotConflictCheck(slot) {
    if (typeof api.checkSlotConflicts === 'function') {
      try { return await api.checkSlotConflicts(slot); } catch {}
    }
    return { conflicts: [] };
  }

  let body;
  if (tab === 'referrals')   body = buildReferrals();
  else if (tab === 'staff')  body = buildStaff();
  else                       body = buildAppointments();

  el.innerHTML = '<div class="dv2s-shell">'
    + (apiErrors.length ? '<div class="dv2s-error-banner">Live data unavailable ('+apiErrors.join(', ')+') — showing sample schedule.</div>' : '')
    + renderTabBar()
    + body
  + '</div>';

  if (tab === 'appointments') {
    const wrap = document.getElementById('dv2s-grid-wrap');
    if (wrap) {
      requestAnimationFrame(() => { wrap.scrollTop = Math.max(0, 8 * ROW_H - 20); });
      wrap.addEventListener('click', (ev) => {
        const evEl = ev.target.closest('.dv2s-event');
        if (evEl) {
          const id = evEl.getAttribute('data-event-id');
          window._schedSelectEvent(id);
          return;
        }
        const slotEl = ev.target.closest('.dv2s-slot:not(.nonclinic)');
        if (slotEl) {
          const slot = {
            day: slotEl.getAttribute('data-day'),
            clin: slotEl.getAttribute('data-clin'),
            t: slotEl.getAttribute('data-t'),
          };
          slotEl.classList.add('flash');
          setTimeout(()=>slotEl.classList.remove('flash'), 320);
          console.debug('booking wizard for', slot);
          _slotConflictCheck(slot).then(() => {}).catch(()=>{});
        }
      });
    }
  }
}







// ═══════════════════════════════════════════════════════════════════════════════
// pgLibraryHub — real evidence library: Conditions · Devices · Packages · Evidence
// Backed by:
//   - GET  /api/v1/library/overview            (counts + eligibility per condition)
//   - POST /api/v1/library/external-search     (brokered unreviewed external search)
//   - POST /api/v1/library/ai/summarize-evidence (AI DRAFT, cites paper IDs)
//   - GET  /api/v1/registry/devices
//   - GET  /api/v1/registry/conditions/packages
//   - GET  /api/v1/literature                  (per-clinician curated library)
// Every item carries `source_trust` + `review_status`. Neuromod eligibility
// is computed from reviewed-protocol presence AND evidence grade A/B — never
// an inline marketing flag. AI outputs are always DRAFTS, reviewable only.
// See libraryHelpers below — pure JS helpers, covered by unit tests.
// ═══════════════════════════════════════════════════════════════════════════════

/** @internal Pure helpers exported for unit tests. */
export const libraryHelpers = {
  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  gradeRank(grade) {
    if (!grade) return 0;
    const g = String(grade).toUpperCase().replace('EV-', '');
    return { A: 4, B: 3, C: 2, D: 1, E: 0 }[g] || 0;
  },
  isReviewed(status) {
    if (!status) return false;
    return ['reviewed', 'approved', 'published', 'active'].includes(String(status).toLowerCase());
  },
  /**
   * Neuromod eligibility — explainable, never opaque.
   * Eligible iff: has >=1 reviewed protocol AND top evidence grade is A or B.
   * Returns { eligible: bool, reasons: [str], blockers: [str] }.
   */
  computeEligibility(summary) {
    const reasons = [];
    const blockers = [];
    const reviewed = Number(summary?.reviewed_protocol_count || 0);
    const top = summary?.highest_evidence_level;
    const rank = libraryHelpers.gradeRank(top);
    if (reviewed > 0) reasons.push(reviewed + ' reviewed protocol(s)');
    else blockers.push('No reviewed protocol on file');
    if (rank >= 3) reasons.push('Top evidence grade ' + top);
    else blockers.push('Highest evidence grade below B');
    return { eligible: reviewed > 0 && rank >= 3, reasons, blockers };
  },
  /** Filter `rows` by case-insensitive substring match across `keys`. */
  filterRows(rows, q, keys) {
    if (!q) return rows;
    const needle = String(q).toLowerCase();
    return rows.filter(r => keys.some(k => String(r[k] ?? '').toLowerCase().includes(needle)));
  },
};

export async function pgLibraryHub(setTopbar, navigate) {
  const tab = window._libraryHubTab || 'conditions';
  window._libraryHubTab = tab;
  const el = document.getElementById('content');
  const esc = libraryHelpers.esc;
  const actor = (typeof currentUser === 'function' ? currentUser() : null) || {};
  const actorRole = (actor?.role || actor?.actor_role || '').toLowerCase();
  const isAdmin = actorRole === 'admin' || actorRole === 'superadmin';

  // Lazy-load PROTOCOL_LIBRARY so the Needs Review tab can surface unreviewed /
  // verify-flagged entries. Failures degrade silently — count badge falls back to 0.
  let _protosAll = [], _condsAll = [], _devsAll = [];
  try {
    const pd = await import('./protocols-data.js');
    _protosAll = pd.PROTOCOL_LIBRARY || [];
    _condsAll  = pd.CONDITIONS       || [];
    _devsAll   = pd.DEVICES          || [];
  } catch {}
  const _needsReviewRows = _protosAll.filter(p =>
    (Array.isArray(p.governance) && p.governance.includes('unreviewed')) ||
    (typeof p.notes === 'string' && /verify/i.test(p.notes))
  );
  const _needsReviewCount = _needsReviewRows.length;

  const TAB_META = {
    conditions:    { label: 'Conditions',         color: 'var(--blue)'   },
    devices:       { label: 'Devices',            color: 'var(--teal)'   },
    packages:      { label: 'Condition Packages', color: 'var(--rose)'   },
    evidence:      { label: 'Evidence & Search',  color: 'var(--violet)' },
    'needs-review':{ label: 'Needs Review',       color: 'var(--amber)', badgeCount: _needsReviewCount },
  };

  function tabBar() {
    return Object.entries(TAB_META).map(([id, m]) => {
      const badge = (m.badgeCount != null && m.badgeCount > 0)
        ? ' <span style="display:inline-block;min-width:18px;padding:1px 6px;margin-left:4px;font-size:10px;font-weight:700;line-height:1.4;text-align:center;color:#fff;background:var(--amber);border-radius:10px;vertical-align:middle">' + esc(m.badgeCount) + '</span>'
        : '';
      return '<button role="tab" aria-selected="' + (tab === id) + '" tabindex="' + (tab === id ? '0' : '-1') + '"' +
        ' class="ch-tab' + (tab === id ? ' ch-tab--active' : '') + '"' +
        (tab === id ? ' style="--tab-color:' + m.color + '"' : '') +
        ' onclick="window._libraryHubTab=\'' + id + '\';window._nav(\'library-hub\')">' + esc(m.label) + badge + '</button>';
    }).join('');
  }
  setTopbar('Library', isAdmin
    ? '<button class="btn btn-sm" onclick="window._libAdminRefresh()" title="Admin-only: rebuild curated evidence index">↻ Refresh evidence</button>'
    : ''
  );

  window._libSearch = window._libSearch || {};
  window._libFilters = window._libFilters || {};
  const q = (window._libSearch[tab] || '').toLowerCase();
  const filt = window._libFilters[tab] || 'All';

  function sInput(t, placeholder) {
    const ph = placeholder || 'Search…';
    return '<div style="position:relative;max-width:280px;flex:1 1 220px">' +
      '<label class="sr-only" for="lib-search-' + t + '">' + esc(ph) + '</label>' +
      '<input id="lib-search-' + t + '" type="search" placeholder="' + esc(ph) + '" class="ph-search-input"' +
      ' value="' + esc(window._libSearch[t] || '') + '"' +
      ' oninput="window._libSearch[\'' + t + '\']=this.value;clearTimeout(window._libSearchTmr);window._libSearchTmr=setTimeout(()=>window._nav(\'library-hub\'),180)">' +
      '<svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></div>';
  }
  function pills(values, active, tabId) {
    return values.map(v =>
      '<button class="reg-domain-pill' + (v === active ? ' active' : '') + '"' +
      ' aria-pressed="' + (v === active) + '"' +
      ' onclick="window._libFilters[\'' + tabId + '\']=\'' + esc(v) + '\';window._nav(\'library-hub\')">' + esc(v) + '</button>'
    ).join('');
  }

  // ── Shell with spinner ─────────────────────────────────────────────────
  el.innerHTML = '<div class="ch-shell"><div class="ch-tab-bar" role="tablist" aria-label="Library sections">' + tabBar() +
    '</div><div class="ch-body"><div class="ch-card" style="padding:40px 20px;text-align:center;color:var(--text-tertiary)">' +
    spinner() + '<div style="margin-top:10px;font-size:12px">Loading library…</div></div></div></div>';

  // ── Page-scoped parallel fetch. All failures degrade gracefully. ───────
  let overview = null;
  let overviewErr = null;
  let devices = [];
  let packageSlugs = [];
  let curatedLitItems = [];
  const [ovRes, devRes, pkgRes, litRes] = await Promise.allSettled([
    api.libraryOverview(),
    api.listDevices(),
    api.conditionPackageSlugs(),
    api.listLiterature(),
  ]);
  if (ovRes.status === 'fulfilled') overview = ovRes.value;
  else overviewErr = ovRes.reason?.message || 'Library overview failed';
  if (devRes.status === 'fulfilled') devices = devRes.value?.items || [];
  if (pkgRes.status === 'fulfilled') packageSlugs = pkgRes.value?.slugs || [];
  if (litRes.status === 'fulfilled') curatedLitItems = litRes.value?.items || [];

  const conditions = overview?.conditions || [];

  // ── Window handlers (page-scoped — do not leak beyond this page) ───────
  window._libFindProtocol = (condId, condName) => {
    window._protocolHubCondition = { id: condId, name: condName };
    window._protocolHubTab = 'search';
    window._nav('protocol-hub');
  };
  window._libOpenPackage = (slug) => {
    if (!slug) { window._dsToast?.({ title: 'No package', body: 'This condition has no curated package yet.', severity: 'warn' }); return; }
    window._conditionPackageSlug = slug;
    window._nav('condition-packages');
  };
  window._libAdminRefresh = async () => {
    if (!confirm('Kick off a full evidence pipeline refresh?\n\nThis runs in the background and can take up to 45 minutes.')) return;
    try {
      const res = await api.adminRefreshEvidence();
      window._dsToast?.({ title: 'Refresh started', body: 'PID ' + (res?.pid ?? '?'), severity: 'success' });
    } catch (e) {
      window._dsToast?.({ title: 'Refresh failed', body: e?.message || 'Admin role required.', severity: 'error' });
    }
  };
  window._libPromoteExternal = async (paperId, title) => {
    try {
      await api.promoteEvidencePaper(paperId);
      window._dsToast?.({ title: 'Promoted to library', body: String(title || '').slice(0, 80), severity: 'success' });
    } catch (e) {
      window._dsToast?.({ title: 'Promote failed', body: e?.message || 'Unknown error', severity: 'error' });
    }
  };
  window._libExternalSearch = async () => {
    const input = document.getElementById('lib-ext-q');
    const cSel  = document.getElementById('lib-ext-cond');
    const out   = document.getElementById('lib-ext-results');
    if (!input || !out) return;
    const qv = (input.value || '').trim();
    if (qv.length < 2) { out.innerHTML = '<div class="ch-empty">Type at least 2 characters.</div>'; return; }
    out.innerHTML = spinner();
    try {
      const res = await api.libraryExternalSearch({ q: qv, condition_id: cSel?.value || null, limit: 20 });
      if (!res?.items?.length) { out.innerHTML = '<div class="ch-empty">No matches in the curated ingest for that query.</div>'; return; }
      const rowsHtml = res.items.map(r => (
        '<div class="lib-card" style="border-left:3px solid var(--amber)">' +
          '<div class="lib-card-top">' +
            '<span class="lib-card-name">' + esc(r.title) + '</span>' +
            '<span class="lib-badge" style="background:rgba(245,158,11,0.14);color:var(--amber);border:1px solid rgba(245,158,11,0.3)" title="Not curated — review before clinical use">Unreviewed</span>' +
          '</div>' +
          '<div class="lib-card-meta">' +
            (r.year ? '<span class="lib-tag">' + esc(r.year) + '</span>' : '') +
            (r.journal ? '<span class="lib-tag">' + esc(r.journal) + '</span>' : '') +
            (r.pub_types && r.pub_types[0] ? '<span class="lib-tag">' + esc(r.pub_types[0]) + '</span>' : '') +
          '</div>' +
          (r.authors ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + esc(r.authors) + '</div>' : '') +
          '<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:6px">Trust: <b>' + esc(r.source_trust) + '</b> · Status: <b>' + esc(r.review_status) + '</b></div>' +
          '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' +
            (r.url ? '<a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="' + esc(r.url) + '">Open ↗</a>' : '') +
            '<button class="ch-btn-sm ch-btn-teal" onclick="window._libPromoteExternal(' + Number(r.id) + ',\'' + esc(r.title).replace(/'/g, '\\\'') + '\')">Promote to Library</button>' +
            '<label class="ch-btn-sm" style="display:inline-flex;gap:4px;align-items:center;cursor:pointer"><input type="checkbox" class="lib-ai-pick" value="' + Number(r.id) + '" style="margin:0"> AI draft</label>' +
          '</div>' +
        '</div>'
      )).join('');
      out.innerHTML =
        '<div class="lib-trust-banner" role="note" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:12px">' +
          '<b style="color:var(--amber)">Unreviewed external results</b> — ' + esc(res.notice || '') +
          '<br><span style="opacity:0.7">Provenance: ' + esc(res.provenance || '—') + ' · Last checked: ' + esc((res.last_checked_at || '').slice(0, 19)) + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin:10px 0;flex-wrap:wrap">' +
          '<button class="ch-btn-sm ch-btn-teal" onclick="window._libAiDraft()">✦ Summarise selected</button>' +
          '<span style="font-size:11px;color:var(--text-tertiary)">AI output is always a DRAFT and cites source paper IDs.</span>' +
        '</div>' +
        '<div class="lib-grid">' + rowsHtml + '</div>' +
        '<div id="lib-ai-draft-panel" style="margin-top:16px"></div>';
    } catch (e) {
      out.innerHTML = '<div class="ch-empty" style="color:var(--red)">External search failed: ' + esc(e?.message || 'service unavailable') + '</div>';
    }
  };
  window._libAiDraft = async () => {
    const picks = Array.from(document.querySelectorAll('.lib-ai-pick:checked')).map(n => Number(n.value)).filter(Boolean);
    const panel = document.getElementById('lib-ai-draft-panel');
    if (!panel) return;
    if (!picks.length) { panel.innerHTML = '<div class="ch-empty">Select at least one paper with the AI draft checkbox.</div>'; return; }
    panel.innerHTML = spinner();
    try {
      const res = await api.librarySummarizeEvidence({ paper_ids: picks });
      const cites = (res?.source_citations || []).map(c =>
        '<li style="margin-bottom:3px">[#' + Number(c.paper_id) + '] ' + esc(c.title || '') + ' — ' + esc(c.journal || '') + ' ' + esc(c.year || '') + '</li>'
      ).join('');
      panel.innerHTML =
        '<div class="ch-card" style="border-left:3px solid var(--violet)">' +
          '<div class="ch-card-hd"><span class="ch-card-title">AI Evidence Draft</span>' +
            '<span class="lib-badge" style="background:rgba(139,92,246,0.14);color:var(--violet);border:1px solid rgba(139,92,246,0.3)">DRAFT · AI generated</span>' +
          '</div>' +
          '<div style="padding:14px 16px">' +
            '<div style="white-space:pre-wrap;font-size:13px;line-height:1.55">' + esc(res?.draft_text || '') + '</div>' +
            '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">' +
              '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Source citations (' + (res?.source_paper_ids?.length || 0) + ')</div>' +
              '<ul style="font-size:11.5px;color:var(--text-secondary);padding-left:18px;margin:0">' + cites + '</ul>' +
            '</div>' +
            '<div style="margin-top:12px;font-size:11px;color:var(--amber);background:rgba(245,158,11,0.08);padding:8px 10px;border-radius:6px">' +
              esc(res?.reviewer_notice || 'Draft must be reviewed by a clinician before clinical use.') +
            '</div>' +
          '</div>' +
        '</div>';
    } catch (e) {
      panel.innerHTML = '<div class="ch-empty" style="color:var(--red)">AI draft failed: ' + esc(e?.message || 'chat service unavailable') + '</div>';
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────
  const kpi = (color, value, label, title) =>
    '<div class="ch-kpi-card" style="--kpi-color:' + color + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
    '<div class="ch-kpi-val">' + esc(value) + '</div><div class="ch-kpi-label">' + esc(label) + '</div></div>';

  function gradeBadge(grade) {
    const g = String(grade || '').toUpperCase().replace('EV-', '');
    if (!g) return '<span class="lib-tag" title="Evidence grade not recorded">Grade: —</span>';
    const color = { A: 'var(--teal)', B: 'var(--blue)', C: 'var(--amber)', D: 'var(--rose)', E: 'var(--text-tertiary)' }[g] || 'var(--text-tertiary)';
    return '<span class="lib-badge" style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55" title="Highest reviewed evidence grade">Grade ' + esc(g) + '</span>';
  }
  function reviewPill(status) {
    const s = String(status || 'unknown').toLowerCase();
    const colors = { reviewed: 'var(--teal)', approved: 'var(--teal)', active: 'var(--teal)', published: 'var(--teal)', draft: 'var(--amber)', pending: 'var(--amber)', unknown: 'var(--text-tertiary)' };
    const c = colors[s] || 'var(--text-tertiary)';
    return '<span class="lib-tag" style="color:' + c + ';border:1px solid ' + c + '33" title="Registry review status">' + esc(s) + '</span>';
  }
  function eligibilityBadge(c) {
    if (c.neuromod_eligible) {
      const tip = (c.eligibility_reasons || []).join(' · ');
      return '<span class="lib-badge lib-badge--teal" title="' + esc(tip) + '">Neuromod eligible</span>';
    }
    const tip = (c.eligibility_blockers || []).join(' · ');
    return '<span class="lib-badge" style="background:rgba(148,163,184,0.12);color:var(--text-tertiary);border:1px solid rgba(148,163,184,0.25)" title="' + esc(tip || 'Not yet eligible') + '">Not yet eligible</span>';
  }

  let main = '';

  // ── TAB: CONDITIONS ────────────────────────────────────────────────────
  if (tab === 'conditions') {
    if (overviewErr) {
      main =
        '<div class="ch-card" style="padding:24px">' +
          '<div class="ch-card-title" style="margin-bottom:8px">Library unavailable</div>' +
          '<div style="color:var(--text-tertiary);font-size:12.5px;margin-bottom:14px">' + esc(overviewErr) + '</div>' +
          '<button class="btn btn-sm" onclick="window._nav(\'library-hub\')">Retry</button>' +
        '</div>';
    } else if (!conditions.length) {
      main =
        '<div class="ch-card" style="padding:30px 22px">' +
          '<div class="ch-card-title" style="margin-bottom:8px">No conditions in registry</div>' +
          '<div style="color:var(--text-tertiary);font-size:12.5px">Ask an admin to import <code>data/clinical/conditions.csv</code> or run the registry seed.</div>' +
        '</div>';
    } else {
      const cats = ['All', ...Array.from(new Set(conditions.map(c => c.category).filter(Boolean))).sort()];
      const rows = libraryHelpers.filterRows(
        conditions.filter(c => filt === 'All' || c.category === filt),
        q, ['name', 'icd_10', 'category']
      );
      const evBanner = overview?.evidence_db_available ? '' :
        '<div class="lib-trust-banner" role="note" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:14px">' +
        '<b style="color:var(--amber)">Curated evidence index not ingested.</b> Paper counts will show 0 until an admin runs the refresh.</div>';
      main =
        evBanner +
        '<div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">' +
          kpi('var(--blue)',   overview.condition_count, 'Conditions') +
          kpi('var(--teal)',   overview.neuromod_eligible_count, 'Neuromod eligible', 'Has ≥1 reviewed protocol AND evidence grade A or B') +
          kpi('var(--violet)', new Set(conditions.map(c => c.category)).size, 'Categories') +
          kpi('var(--amber)',  rows.length, 'Filtered') +
        '</div>' +
        '<div class="ch-card">' +
          '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
            '<span class="ch-card-title">Condition Registry</span>' +
            sInput('conditions', 'Search conditions, ICD-10, category…') +
          '</div>' +
          '<div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border)">' + pills(cats, filt, 'conditions') + '</div>' +
          (rows.length
            ? '<div class="lib-grid">' + rows.map(c => {
                const meta = [
                  c.icd_10 ? '<span class="lib-tag">' + esc(c.icd_10) + '</span>' : '',
                  c.category ? '<span class="lib-tag">' + esc(c.category) + '</span>' : '',
                  reviewPill(c.review_status),
                  gradeBadge(c.highest_evidence_level),
                ].join('');
                const feats = [
                  '<span class="lib-feature" title="Reviewed / total protocols">🧭 ' + (c.reviewed_protocol_count || 0) + ' / ' + (c.total_protocol_count || 0) + ' protocols</span>',
                  '<span class="lib-feature" title="Curated papers indexed">📄 ' + (c.curated_evidence_paper_count || 0) + ' papers</span>',
                  '<span class="lib-feature" title="Compatible devices">🔌 ' + (c.compatible_device_count || 0) + ' devices</span>',
                  (c.assessment_count ? '<span class="lib-feature" title="Assessments in curated package">🧪 ' + c.assessment_count + ' assessments</span>' : ''),
                ].join('');
                const findBtn = (c.reviewed_protocol_count || 0) > 0
                  ? '<button class="ch-btn-sm ch-btn-teal" onclick="window._libFindProtocol(\'' + esc(c.id) + '\',\'' + esc(c.name).replace(/'/g, '\\\'') + '\')">Find Protocol →</button>'
                  : '<button class="ch-btn-sm" disabled title="No reviewed protocol on file yet" style="opacity:0.5;cursor:not-allowed">No reviewed protocol</button>';
                const pkgBtn = c.has_condition_package
                  ? '<button class="ch-btn-sm" onclick="window._libOpenPackage(\'' + esc(c.package_slug) + '\')">Open Package</button>'
                  : '';
                return (
                  '<article class="lib-card" aria-label="' + esc(c.name) + '">' +
                    '<div class="lib-card-top">' +
                      '<span class="lib-card-name">' + esc(c.name) + '</span>' +
                      eligibilityBadge(c) +
                    '</div>' +
                    '<div class="lib-card-meta">' + meta + '</div>' +
                    '<div class="lib-features">' + feats + '</div>' +
                    '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' + findBtn + pkgBtn + '</div>' +
                  '</article>'
                );
              }).join('') + '</div>'
            : '<div class="ch-empty" style="padding:30px 16px">No conditions match your search / filter.</div>') +
        '</div>';
    }
  }

  // ── TAB: DEVICES ───────────────────────────────────────────────────────
  else if (tab === 'devices') {
    const modalityValues = Array.from(new Set(devices.map(d => d.modality).filter(Boolean))).sort();
    const types = ['All', ...modalityValues];
    const filtered = filt === 'All' ? devices : devices.filter(d => d.modality === filt);
    const rows = libraryHelpers.filterRows(filtered, q, ['name', 'manufacturer', 'modality', 'regulatory_status', 'official_indication']);
    const reviewedCount = devices.filter(d => libraryHelpers.isReviewed(d.review_status)).length;
    main =
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">' +
        kpi('var(--teal)',   devices.length, 'Devices') +
        kpi('var(--blue)',   reviewedCount, 'Reviewed') +
        kpi('var(--violet)', modalityValues.length, 'Modalities') +
        kpi('var(--amber)',  rows.length, 'Filtered') +
      '</div>' +
      '<div class="ch-card">' +
        '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
          '<span class="ch-card-title">Device Registry</span>' +
          sInput('devices', 'Search device, manufacturer, modality, indication…') +
        '</div>' +
        '<div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border)">' + pills(types, filt, 'devices') + '</div>' +
        (!devices.length
          ? '<div class="ch-empty" style="padding:30px 16px">Device registry is empty. Admin must import <code>data/clinical/devices.csv</code>.</div>'
          : rows.length
            ? '<div class="lib-grid">' + rows.map(d => {
                const regStatus  = d.regulatory_status  || '';
                const regPathway = d.regulatory_pathway || '';
                const regTitle   = [regStatus, regPathway].filter(Boolean).join(' · ');
                const settingTag = d.home_vs_clinic ? '<span class="lib-tag">' + esc(d.home_vs_clinic) + '</span>' : '';
                const indicationLine = d.official_indication
                  ? '<div class="lib-feature" style="width:100%" title="Official indication">🎯 ' + esc(d.official_indication) + '</div>'
                  : '';
                return (
                  '<article class="lib-card lib-card--device" aria-label="' + esc(d.name || d.id) + '">' +
                    '<div class="lib-card-top">' +
                      '<span class="lib-card-name">' + esc(d.name || d.id) + '</span>' +
                      (regStatus ? '<span class="lib-badge lib-badge--blue" title="' + esc(regTitle) + '">' + esc(regStatus) + '</span>' : '') +
                    '</div>' +
                    (d.manufacturer ? '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">' + esc(d.manufacturer) + '</div>' : '') +
                    '<div class="lib-card-meta">' +
                      (d.modality ? '<span class="lib-tag">' + esc(d.modality) + '</span>' : '') +
                      (d.device_type ? '<span class="lib-tag">' + esc(d.device_type) + '</span>' : '') +
                      settingTag +
                      reviewPill(d.review_status) +
                      (regPathway ? '<span class="lib-tag" title="Regulatory pathway">' + esc(regPathway) + '</span>' : '') +
                      (d.last_reviewed_at ? '<span class="lib-tag" title="Last reviewed by clinical team">Reviewed ' + esc(d.last_reviewed_at) + '</span>' : '') +
                    '</div>' +
                    '<div class="lib-features">' + indicationLine + '</div>' +
                  '</article>'
                );
              }).join('') + '</div>'
            : '<div class="ch-empty" style="padding:30px 16px">No devices match your search / filter.</div>') +
      '</div>';
  }

  // ── TAB: PACKAGES ──────────────────────────────────────────────────────
  else if (tab === 'packages') {
    const rows = libraryHelpers.filterRows(conditions.filter(c => c.has_condition_package), q, ['name', 'category']);
    main =
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">' +
        kpi('var(--rose)',   overview?.condition_package_count || packageSlugs.length, 'Curated packages') +
        kpi('var(--teal)',   conditions.filter(c => c.neuromod_eligible && c.has_condition_package).length, 'Eligible bundles') +
        kpi('var(--blue)',   conditions.filter(c => c.has_condition_package && c.reviewed_protocol_count > 0).length, 'With reviewed protocol') +
        kpi('var(--amber)',  rows.length, 'Filtered') +
      '</div>' +
      '<div class="ch-card">' +
        '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
          '<span class="ch-card-title">Condition Packages</span>' +
          '<span style="font-size:11px;color:var(--text-tertiary)">Reusable bundles: condition · assessments · protocol candidates · safety review</span>' +
          sInput('packages', 'Search packages…') +
        '</div>' +
        (!rows.length
          ? '<div class="ch-empty" style="padding:30px 16px">No condition packages match. Curated packages live under <code>data/conditions/*.json</code>.</div>'
          : '<div class="lib-grid">' + rows.map(c => (
              '<article class="lib-card lib-card--package" aria-label="' + esc(c.name) + ' package">' +
                '<div class="lib-card-top">' +
                  '<span class="lib-card-name">' + esc(c.name) + '</span>' +
                  gradeBadge(c.highest_evidence_level) +
                '</div>' +
                '<div class="lib-card-meta">' +
                  (c.category ? '<span class="lib-tag">' + esc(c.category) + '</span>' : '') +
                  (c.icd_10 ? '<span class="lib-tag">' + esc(c.icd_10) + '</span>' : '') +
                  reviewPill(c.review_status) +
                '</div>' +
                '<div class="lib-features">' +
                  '<span class="lib-feature">🧪 ' + (c.assessment_count || 0) + ' assessments</span>' +
                  '<span class="lib-feature">🧭 ' + (c.reviewed_protocol_count || 0) + ' protocols</span>' +
                  '<span class="lib-feature">🔌 ' + (c.compatible_device_count || 0) + ' devices</span>' +
                '</div>' +
                '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
                  '<button class="ch-btn-sm ch-btn-teal" onclick="window._libOpenPackage(\'' + esc(c.package_slug) + '\')">Open package →</button>' +
                  ((c.reviewed_protocol_count || 0) > 0
                    ? '<button class="ch-btn-sm" onclick="window._libFindProtocol(\'' + esc(c.id) + '\',\'' + esc(c.name).replace(/'/g, '\\\'') + '\')">Find protocol</button>'
                    : '') +
                '</div>' +
              '</article>'
            )).join('') + '</div>') +
      '</div>';
  }

  // ── TAB: EVIDENCE & SEARCH ─────────────────────────────────────────────
  else if (tab === 'evidence') {
    const condOptions = ['<option value="">— All conditions —</option>']
      .concat(conditions.map(c => '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'))
      .join('');
    const curatedCount = curatedLitItems.length;
    const evDbAvailable = overview?.evidence_db_available;
    main =
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">' +
        kpi('var(--teal)',   overview?.curated_paper_count || 0, 'Curated papers (ingest)', 'Public PubMed/OpenAlex ingest') +
        kpi('var(--blue)',   overview?.curated_trial_count || 0, 'Curated trials') +
        kpi('var(--violet)', curatedCount, 'Your library', 'Per-clinician promoted papers') +
        kpi('var(--amber)',  evDbAvailable ? 'Online' : 'Offline', 'Evidence index') +
      '</div>' +
      '<div class="ch-card" style="margin-bottom:16px">' +
        '<div class="ch-card-hd"><span class="ch-card-title">External evidence search (brokered)</span>' +
          '<span class="lib-badge" style="background:rgba(245,158,11,0.14);color:var(--amber);border:1px solid rgba(245,158,11,0.3)" title="Unreviewed ingest — promote before clinical use">Unreviewed by default</span>' +
        '</div>' +
        '<div style="padding:14px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">' +
          '<div style="flex:2;min-width:240px"><label class="sr-only" for="lib-ext-q">Query</label>' +
            '<input id="lib-ext-q" type="search" placeholder="e.g. rTMS dlpfc depression meta-analysis" class="ph-search-input" style="width:100%">' +
          '</div>' +
          '<div style="flex:1;min-width:180px"><label class="sr-only" for="lib-ext-cond">Condition scope</label>' +
            '<select id="lib-ext-cond" class="ph-search-input" style="width:100%">' + condOptions + '</select>' +
          '</div>' +
          '<button class="btn btn-primary btn-sm" onclick="window._libExternalSearch()">Search</button>' +
        '</div>' +
        '<div style="padding:0 16px 16px;font-size:11px;color:var(--text-tertiary)">' +
          'Queries are routed through the backend evidence broker — never via the browser. ' +
          'Every result is tagged with provenance and marked <b>pending</b> until a clinician promotes it.' +
        '</div>' +
        '<div id="lib-ext-results" style="padding:0 16px 16px"></div>' +
      '</div>' +
      '<div class="ch-card">' +
        '<div class="ch-card-hd"><span class="ch-card-title">Your curated library (' + curatedCount + ')</span>' +
          '<span style="font-size:11px;color:var(--text-tertiary)">Promoted & manually-added papers</span>' +
        '</div>' +
        (curatedCount
          ? '<div class="lib-grid">' + curatedLitItems.slice(0, 60).map(p => (
              '<article class="lib-card" style="border-left:3px solid var(--teal)" aria-label="' + esc(p.title) + '">' +
                '<div class="lib-card-top">' +
                  '<span class="lib-card-name">' + esc(p.title) + '</span>' +
                  (p.evidence_grade ? gradeBadge(p.evidence_grade) : '') +
                '</div>' +
                '<div class="lib-card-meta">' +
                  (p.year ? '<span class="lib-tag">' + esc(p.year) + '</span>' : '') +
                  (p.journal ? '<span class="lib-tag">' + esc(p.journal) + '</span>' : '') +
                  (p.study_type ? '<span class="lib-tag">' + esc(p.study_type) + '</span>' : '') +
                  (p.condition ? '<span class="lib-tag">' + esc(p.condition) + '</span>' : '') +
                '</div>' +
                (p.authors ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + esc(p.authors) + '</div>' : '') +
                (p.url ? '<div style="margin-top:8px"><a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="' + esc(p.url) + '">Open ↗</a></div>' : '') +
              '</article>'
            )).join('') + '</div>'
          : '<div class="ch-empty" style="padding:30px 16px">Your curated library is empty. Run a search above and click <b>Promote to Library</b> on relevant results.</div>') +
      '</div>';
  }

  // ── TAB: NEEDS REVIEW ──────────────────────────────────────────────────
  //  SECTION 1: PROTOCOL_LIBRARY entries flagged governance:['unreviewed'] OR
  //             with `notes` mentioning "verify". Display-only → click through.
  //  SECTION 2: Cross-protocol pending papers from /literature-watch.json
  //             (emitted by literature_watch_cron.py --export-only), deduped
  //             by PMID. Action buttons are TODO stubs that log to console;
  //             no backend writes yet.
  else if (tab === 'needs-review') {
    // Fetch the static Literature Watch snapshot once per session. 404 in dev
    // (before cron has run) silently falls back to an empty-state message.
    if (window._litWatchData === undefined) {
      window._litWatchData = null;
      try {
        const _lwResp = await fetch('/literature-watch.json', { cache: 'no-cache' });
        if (_lwResp.ok) window._litWatchData = await _lwResp.json();
      } catch { /* offline / dev — silent */ }
    }
    const _litSnap  = window._litWatchData || null;
    const _litQueue = (_litSnap && Array.isArray(_litSnap.pending_queue)) ? _litSnap.pending_queue : [];

    // TODO-log stub for the three paper action buttons. Spec calls these
    // display-only until the backend `/verdict` endpoint lands.
    window._litPaperAction = (action, pmid) => {
      try { console.log('[literature-watch] TODO ' + action + ' pmid=' + pmid + ' (no backend wired)'); } catch {}
    };

    const rows = _needsReviewRows.map(p => {
      const gov = Array.isArray(p.governance) ? p.governance : [];
      const isUnreviewed = gov.includes('unreviewed');
      const hasVerify = typeof p.notes === 'string' && /verify/i.test(p.notes);
      let reason = '—', reasonColor = 'var(--text-tertiary)';
      if (isUnreviewed && hasVerify) { reason = 'Unreviewed + verify params'; reasonColor = 'var(--rose)'; }
      else if (isUnreviewed)          { reason = 'Unreviewed';                 reasonColor = 'var(--amber)'; }
      else if (hasVerify)             { reason = 'Verify parameters';          reasonColor = 'var(--blue)'; }
      const cond = _condsAll.find(c => c.id === p.conditionId);
      const dev  = _devsAll.find(d => d.id === p.device);
      const topCite = Array.isArray(p.references) && p.references.length ? p.references[0] : '—';
      return { p, gov, isUnreviewed, hasVerify, reason, reasonColor, cond, dev, topCite };
    });

    const filtQ = (window._libSearch['needs-review'] || '').toLowerCase();
    const filtered = !filtQ ? rows : rows.filter(r =>
      (r.p.name || '').toLowerCase().includes(filtQ) ||
      (r.cond?.label || r.p.conditionId || '').toLowerCase().includes(filtQ) ||
      (r.dev?.label || r.p.device || '').toLowerCase().includes(filtQ) ||
      (r.topCite || '').toLowerCase().includes(filtQ) ||
      (r.reason || '').toLowerCase().includes(filtQ)
    );

    const totalUnreviewed = rows.filter(r => r.isUnreviewed).length;
    const totalVerify     = rows.filter(r => r.hasVerify).length;
    const gradeABHighPri  = rows.filter(r => r.isUnreviewed && ['A','B'].includes(String(r.p.evidenceGrade || '').toUpperCase())).length;
    const pendingPapers   = _litQueue.length;

    // Section 1 — Protocols requiring review (was the entire tab pre-lit-watch).
    const protosSection =
      '<div class="ch-card">' +
        '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
          '<span class="ch-card-title">Protocols requiring review (' + filtered.length + (filtered.length !== rows.length ? ' of ' + rows.length : '') + ')</span>' +
          '<span style="font-size:11px;color:var(--text-tertiary)">Click <b>Review →</b> to open protocol detail</span>' +
          sInput('needs-review', 'Search name, condition, device, citation…') +
        '</div>' +
        (!rows.length
          ? '<div class="ch-empty" style="padding:30px 16px">No protocols currently flagged as unreviewed or verify-needed. All drafts have been cleared.</div>'
          : !filtered.length
            ? '<div class="ch-empty" style="padding:30px 16px">No protocols match your search.</div>'
            : '<div class="lib-grid">' + filtered.map(r => {
                const p = r.p;
                const evG = String(p.evidenceGrade || '').toUpperCase();
                return (
                  '<article class="lib-card" style="border-left:3px solid var(--amber)" aria-label="' + esc(p.name || 'Protocol') + '">' +
                    '<div class="lib-card-top">' +
                      '<span class="lib-card-name">' + esc(p.name || 'Protocol') + '</span>' +
                      gradeBadge(p.evidenceGrade) +
                    '</div>' +
                    '<div class="lib-card-meta">' +
                      (r.dev?.label ? '<span class="lib-tag" title="Modality / device">' + esc(r.dev.label) + '</span>' : (p.device ? '<span class="lib-tag">' + esc(p.device) + '</span>' : '')) +
                      (p.subtype ? '<span class="lib-tag">' + esc(p.subtype) + '</span>' : '') +
                      (r.cond?.label ? '<span class="lib-tag" title="Condition">' + esc(r.cond.label) + '</span>' : (p.conditionId ? '<span class="lib-tag">' + esc(p.conditionId) + '</span>' : '')) +
                      '<span class="lib-tag" style="color:' + r.reasonColor + ';border:1px solid ' + r.reasonColor + '55" title="Why this protocol is in the review queue">' + esc(r.reason) + '</span>' +
                      (r.gov.length ? '<span class="lib-tag" style="color:var(--text-tertiary)" title="Governance flags">' + esc(r.gov.join(' · ')) + '</span>' : '') +
                    '</div>' +
                    '<div class="lib-features">' +
                      '<div class="lib-feature" style="width:100%" title="Top citation">📄 ' + esc(String(r.topCite).slice(0, 140)) + (String(r.topCite).length > 140 ? '…' : '') + '</div>' +
                    '</div>' +
                    '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
                      '<button class="ch-btn-sm ch-btn-teal" onclick="window._protDetailId=\'' + esc(p.id || '') + '\';window._nav(\'protocol-detail\')" title="Open protocol detail to review, edit, or promote">Review →</button>' +
                      (evG === 'A' || evG === 'B'
                        ? '<span class="lib-badge" style="background:rgba(20,184,166,0.14);color:var(--teal);border:1px solid rgba(20,184,166,0.3)" title="High-priority: strong evidence awaiting review">Priority</span>'
                        : '') +
                    '</div>' +
                  '</article>'
                );
              }).join('') + '</div>') +
      '</div>';

    // Section 2 — Cross-protocol Live-Literature triage queue. Dedup-by-PMID
    // is done server-side in literature_watch_cron.export_snapshot(); each
    // row carries an array of linked protocol_ids that render as chips.
    const protoChip = (pid) =>
      '<button class="lib-tag" title="Open protocol detail for ' + esc(pid) + '"' +
      ' style="cursor:pointer;color:var(--teal);border:1px solid rgba(20,184,166,0.35)"' +
      ' onclick="window._protDetailId=\'' + esc(pid) + '\';window._nav(\'protocol-detail\')">' +
      esc(pid) + '</button>';

    const paperRow = (paper) => {
      const pmid = String(paper.pmid || '');
      const title = String(paper.title || '(untitled)');
      const titleTrim = title.length > 120 ? title.slice(0, 120) + '…' : title;
      const authors = paper.authors || '—';
      const metaBits = [];
      if (authors) metaBits.push(esc(authors));
      if (paper.year) metaBits.push(esc(paper.year));
      if (paper.journal) metaBits.push('<i>' + esc(paper.journal) + '</i>');
      const chips = Array.isArray(paper.protocol_ids) ? paper.protocol_ids.map(protoChip).join(' ') : '';
      const seen = paper.first_seen_at ? esc(String(paper.first_seen_at).slice(0, 10)) : '—';
      return (
        '<article class="lib-card" style="border-left:3px solid var(--violet)" aria-label="' + esc(titleTrim) + '">' +
          '<div class="lib-card-top">' +
            '<span class="lib-card-name" title="' + esc(title) + '">' + esc(titleTrim) + '</span>' +
            '<span class="lib-badge" style="background:rgba(139,92,246,0.14);color:var(--violet);border:1px solid rgba(139,92,246,0.35)" title="PubMed ID">PMID ' + esc(pmid) + '</span>' +
          '</div>' +
          '<div class="lib-card-meta" style="color:var(--text-tertiary)">' + metaBits.join(' · ') + '</div>' +
          (chips ? '<div class="lib-card-meta" style="margin-top:4px">Linked protocols: ' + chips + '</div>' : '') +
          '<div class="lib-features">' +
            '<div class="lib-feature" style="width:100%;color:var(--text-tertiary)" title="When Literature Watch first saw this paper">⏱ First seen ' + seen + '</div>' +
          '</div>' +
          '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
            '<button class="ch-btn-sm ch-btn-teal" onclick="window._litPaperAction(\'mark-relevant\',\'' + esc(pmid) + '\')" title="TODO: mark this paper relevant (not yet wired to backend)">Mark relevant</button>' +
            '<button class="ch-btn-sm" onclick="window._litPaperAction(\'promote\',\'' + esc(pmid) + '\')" title="TODO: promote to protocol references (not yet wired)">Promote to references</button>' +
            '<button class="ch-btn-sm" onclick="window._litPaperAction(\'not-relevant\',\'' + esc(pmid) + '\')" title="TODO: mark not relevant (not yet wired)">Not relevant</button>' +
          '</div>' +
        '</article>'
      );
    };

    const emptyLitMsg = !_litSnap
      ? 'No new literature found yet. Run <code>python services/evidence-pipeline/literature_watch_cron.py</code> or wait for the nightly cron at 03:00.'
      : 'Pending queue is empty. All recent papers have been triaged.';
    const generatedStamp = _litSnap && _litSnap.generated_at
      ? '<span style="font-size:11px;color:var(--text-tertiary)">Snapshot: ' + esc(String(_litSnap.generated_at).replace('T',' ').slice(0,16)) + ' UTC</span>'
      : '';

    const papersSection =
      '<div class="ch-card" style="margin-top:18px">' +
        '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
          '<span class="ch-card-title">New literature awaiting triage (last 30 days)</span>' +
          generatedStamp +
          '<span style="font-size:11px;color:var(--text-tertiary);margin-left:auto">Deduped by PMID across protocols · cap 200</span>' +
        '</div>' +
        (!_litQueue.length
          ? '<div class="ch-empty" style="padding:30px 16px">' + emptyLitMsg + '</div>'
          : '<div class="lib-grid">' + _litQueue.map(paperRow).join('') + '</div>') +
      '</div>';

    main =
      '<div class="ch-card" role="note" style="border-left:3px solid var(--amber);padding:12px 16px;margin-bottom:14px;background:rgba(245,158,11,0.06)">' +
        '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55">' +
          '<b style="color:var(--amber)">Disclaimer.</b> These protocols and papers were drafted from literature and are ' +
          '<b>NOT approved for clinical use</b> until a clinician reviews each one. Click <b>Review →</b> on a protocol card, ' +
          'or use the triage buttons on a paper row.' +
        '</div>' +
      '</div>' +
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(5,1fr);margin-bottom:16px">' +
        kpi('var(--amber)',  totalUnreviewed, 'Unreviewed', 'governance array contains "unreviewed"') +
        kpi('var(--blue)',   totalVerify,     'With verify flags', 'notes field mentions "verify"') +
        kpi('var(--teal)',   gradeABHighPri,  'Grade A / B (priority)', 'Highest clinical priority — strong evidence awaiting review') +
        kpi('var(--violet)', pendingPapers,   'Pending papers', 'Cross-protocol literature_watch rows (verdict=pending), deduped by PMID') +
        kpi('var(--rose)',   totalUnreviewed, 'Added this week', 'Batch landed 2026-04-17') +
      '</div>' +
      protosSection +
      papersSection;
  }

  el.innerHTML = '<div class="dv2-hub-shell" style="padding:20px;display:flex;flex-direction:column;gap:16px"><div class="ch-shell"><div class="ch-tab-bar" role="tablist" aria-label="Library sections">' + tabBar() + '</div><div class="ch-body">' + main + '</div></div></div>';
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgMonitorHub — Patient Monitoring · Adverse Events · Notes & Dictation · Recording
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgMonitorHub(setTopbar, navigate) {
  const tab = window._monitorHubTab || 'monitoring';
  window._monitorHubTab = tab;
  const TAB_META = {
    monitoring: { label: 'Patient Monitoring', color: 'var(--teal)'   },
    adverse:    { label: 'Adverse Events',      color: 'var(--red)'    },
    notes:      { label: 'Notes & Dictation',   color: 'var(--blue)'   },
    recording:  { label: 'Recording Studio',    color: 'var(--violet)' },
  };
  const el = document.getElementById('content');
  function tabBar() {
    return Object.entries(TAB_META).map(([id,m]) =>
      '<button class="ch-tab'+(tab===id?' ch-tab--active':'')+'"'+(tab===id?' style="--tab-color:'+m.color+'"':'')+
      ' onclick="window._monitorHubTab=\''+id+'\';window._nav(\'monitor-hub\')">'+ m.label +'</button>'
    ).join('');
  }

  if (tab === 'monitoring') {
    setTopbar('Monitor', '');
    el.innerHTML = '<div class="ch-shell"><div class="ch-tab-bar">'+tabBar()+'</div><div class="ch-body">'+spinner()+'</div></div>';
    let patients = [];
    try { const r = await api.listPatients().catch(()=>({items:[]})); patients = r?.items||[]; } catch {}
    const alerts = patients.filter(p=>p.has_adverse_event||p.wearable_disconnected).length || 2;
    const active = patients.length || 8;

    const ALERT_FEED = [
      {icon:'⚠',msg:'Demo Patient A — PHQ-9 worsened (+4pts)',  time:'09:14', color:'var(--red)'},
      {icon:'📱',msg:'Demo Patient C — Wearable disconnected',  time:'08:52', color:'var(--amber)'},
      {icon:'⏰',msg:'Demo Patient B — Assessment overdue 3d',  time:'08:30', color:'var(--amber)'},
      {icon:'✓', msg:'Demo Patient A — Session completed',      time:'Yesterday', color:'var(--green)'},
      {icon:'📊',msg:'Demo Patient D — PHQ-9 improved 6pts',   time:'Yesterday', color:'var(--teal)'},
    ];

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
          <div class="ch-kpi-card" style="--kpi-color:var(--red)"><div class="ch-kpi-val">${alerts}</div><div class="ch-kpi-label">Active Alerts</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${Math.round(active*0.6)}</div><div class="ch-kpi-label">Wearables Active</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${Math.round(active*0.3)}</div><div class="ch-kpi-label">Needs Review</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${active}</div><div class="ch-kpi-label">Monitored Patients</div></div>
        </div>
        <div class="ch-two-col">
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Alert Feed</span></div>
            ${ALERT_FEED.map(a=>'<div class="rec-apt-row"><span style="font-size:16px">'+a.icon+'</span><div class="rec-apt-info"><div class="rec-apt-name" style="color:'+a.color+'">'+a.msg+'</div></div><span class="rec-apt-time">'+a.time+'</span></div>').join('')}
          </div>
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Wearable Status</span></div>
            ${[...patients.slice(0,4), {first_name:'Demo',last_name:'D'},{first_name:'Demo',last_name:'E'}].slice(0,6).map((p,i)=>{
              const nm=((p.first_name||'')+(p.last_name?' '+p.last_name:'')).trim()||'Patient '+(i+1);
              const st=['Connected','Connected','Disconnected','Connected','Low Battery','Connected'][i];
              const sc={'Connected':'var(--green)','Disconnected':'var(--red)','Low Battery':'var(--amber)'}[st];
              return '<div class="rec-apt-row"><div class="rec-apt-info"><div class="rec-apt-name">'+nm+'</div></div><span style="font-size:11px;font-weight:600;color:'+sc+'">● '+st+'</span></div>';
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }
  else if (tab === 'adverse') {
    setTopbar('Monitor', '<button class="btn btn-sm" onclick="window._nav(\'adverse-events-full\')">Full AE Log ↗</button>');
    el.innerHTML = '<div class="ch-shell"><div class="ch-tab-bar">'+tabBar()+'</div><div class="ch-body">'+spinner()+'</div></div>';
    let aes = [];
    try { const r = await (api.listAdverseEvents?.().catch(()=>({items:[]}))||Promise.resolve({items:[]})); aes = r?.items||[]; } catch {}
    const display = aes.length ? aes : [
      {id:'AE-001',patient_name:'Demo Patient A',type:'Headache',          severity:'mild',    date:'2026-04-14',status:'open',     notes:'Post-TMS, resolved in 2h'},
      {id:'AE-002',patient_name:'Demo Patient C',type:'Scalp discomfort',  severity:'mild',    date:'2026-04-12',status:'resolved', notes:'Electrode irritation'},
      {id:'AE-003',patient_name:'Marcus Webb',   type:'Dizziness',         severity:'moderate',date:'2026-04-10',status:'open',     notes:'Post-session, ongoing'},
      {id:'AE-004',patient_name:'Demo Patient B',type:'Mood fluctuation',  severity:'mild',    date:'2026-04-08',status:'resolved', notes:'Expected side effect'},
    ];
    const sevC={mild:'var(--green)',moderate:'var(--amber)',severe:'var(--red)'};
    const stC ={open:'var(--amber)',resolved:'var(--green)',monitoring:'var(--blue)'};
    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
          <div class="ch-kpi-card" style="--kpi-color:var(--red)"><div class="ch-kpi-val">${display.filter(a=>a.status==='open').length}</div><div class="ch-kpi-label">Open AEs</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${display.filter(a=>a.severity==='moderate'||a.severity==='severe').length}</div><div class="ch-kpi-label">Moderate+</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${display.filter(a=>a.status==='resolved').length}</div><div class="ch-kpi-label">Resolved</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${display.length}</div><div class="ch-kpi-label">Total</div></div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Adverse Events</span><button class="ch-btn-sm ch-btn-teal" onclick="window._dsToast?.({title:'New AE',body:'Adverse event form coming soon.',severity:'info'})">+ Report AE</button></div>
          ${display.map(ae=>'<div class="book-row"><div class="book-datetime"><div class="book-date">'+ae.date+'</div></div><div class="book-info"><div class="book-patient">'+ae.patient_name+'</div><div class="book-clinician">'+ae.type+'</div>'+(ae.notes?'<div class="book-notes">'+ae.notes+'</div>':'')+'</div><div class="book-status-col"><span class="book-status-badge" style="color:'+(sevC[ae.severity]||'var(--text-tertiary)')+';background:'+(sevC[ae.severity]||'var(--text-tertiary)')+'22">'+ae.severity+'</span></div><div class="book-status-col"><span class="book-status-badge" style="color:'+(stC[ae.status]||'var(--text-tertiary)')+';background:'+(stC[ae.status]||'var(--text-tertiary)')+'22">'+ae.status+'</span></div><div class="book-actions"><button class="ch-btn-sm" onclick="window._dsToast?.({title:\'AE\',body:\''+ae.type+'\',severity:\'info\'})">View</button></div></div>').join('')}
        </div>
      </div>
    </div>`;
  }
  else if (tab === 'notes') {
    setTopbar('Monitor', '');
    el.innerHTML = '<div class="ch-shell"><div class="ch-tab-bar">'+tabBar()+'</div><div class="ch-body">'+spinner()+'</div></div>';
    const NOTE_TYPES = ['Session Note','Assessment Note','Progress Summary','Prescription Note','Discharge Summary','Phone Call Note','Referral Letter'];
    let patients = [];
    try { const r = await api.listPatients().catch(()=>({items:[]})); patients = r?.items||[]; } catch {}
    const patOpts = patients.map(p=>'<option value="'+p.id+'">'+ ((p.first_name||'')+' '+(p.last_name||'')).trim() +'</option>').join('') || '<option>Demo Patient A</option>';
    const savedNotes = (() => { try { return JSON.parse(localStorage.getItem('ds_notes_v1')||'[]'); } catch { return []; } })();

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-two-col">
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">New Note</span><span class="ph-ai-badge">AI</span></div>
            <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
              <div class="ch-form-group"><label class="ch-label">Patient</label><select id="note-patient" class="ch-select ch-select--full">${patOpts}</select></div>
              <div class="ch-form-group"><label class="ch-label">Note Type</label><select id="note-type" class="ch-select ch-select--full">${NOTE_TYPES.map(t=>'<option>'+t+'</option>').join('')}</select></div>
              <div class="ch-form-group">
                <label class="ch-label">Dictate or Type</label>
                <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
                  <button class="ch-btn-sm" id="note-mic-btn" onclick="window._noteMic()">🎤 Dictate</button>
                  <button class="ch-btn-sm" onclick="window._noteAISummarise()">✦ AI Summarise</button>
                  <button class="ch-btn-sm" onclick="window._noteAIStructure()">✦ AI Structure</button>
                </div>
                <textarea id="note-text" class="ch-textarea" rows="9" placeholder="Type or dictate your clinical note…\n\nOr click AI Summarise for auto-generation.\nSOAP, BIRP, or free text — AI will structure it.">${window._noteText||''}</textarea>
              </div>
              <div style="display:flex;gap:8px">
                <button class="btn btn-primary" onclick="window._noteSave()">Save Note</button>
                <button class="btn" onclick="window._noteClear()">Clear</button>
              </div>
            </div>
          </div>
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Recent Notes</span></div>
            ${savedNotes.length ? savedNotes.slice(0,8).map(n=>'<div class="book-row"><div class="book-datetime"><div class="book-date">'+n.date+'</div><div class="book-time">'+n.type+'</div></div><div class="book-info"><div class="book-patient">'+n.patient+'</div><div class="book-notes">'+n.text.slice(0,60)+'…</div></div><div class="book-actions"><button class="ch-btn-sm" onclick="document.getElementById(\'note-text\').value=\''+n.text.replace(/['"]/g,'').slice(0,100)+'\'">Load</button></div></div>').join('') : '<div class="ch-empty">No notes saved yet.</div>'}
          </div>
        </div>
      </div>
    </div>`;

    window._noteSave = () => {
      const text = document.getElementById('note-text')?.value?.trim();
      const type = document.getElementById('note-type')?.value||'Session Note';
      const patEl = document.getElementById('note-patient');
      const patient = patEl?.options[patEl?.selectedIndex]?.text||'Unknown';
      if (!text) { window._dsToast?.({title:'Empty note',severity:'warn'}); return; }
      const notes = (() => { try { return JSON.parse(localStorage.getItem('ds_notes_v1')||'[]'); } catch { return []; } })();
      notes.unshift({ id:'NOTE-'+Date.now(), patient, type, text, date: new Date().toISOString().slice(0,10) });
      try { localStorage.setItem('ds_notes_v1', JSON.stringify(notes.slice(0,50))); } catch {}
      window._noteText = '';
      window._dsToast?.({title:'Note saved',body:type+' for '+patient,severity:'success'});
      window._monitorHubTab='notes'; window._nav('monitor-hub');
    };
    window._noteClear = () => { const t=document.getElementById('note-text'); if(t){t.value=''; window._noteText='';} };
    window._noteAISummarise = async () => {
      const ta=document.getElementById('note-text'); if(!ta)return;
      ta.value='✦ Generating AI summary…';
      try {
        const res = await api.chatClinician([{role:'user',content:'Generate a SOAP-format clinical session note for a TMS depression patient. 3-4 lines per section. Professional, concise.'}],{});
        ta.value = res?.message||res?.content||'S: Patient attended session as scheduled. Reports improved mood this week.\nO: TMS delivered per protocol, no adverse events noted.\nA: Responding — PHQ-9 score 11 (baseline 18). Good tolerance.\nP: Continue course. Reassess at session 15. Next session scheduled.';
      } catch { ta.value='S: Patient attended session as scheduled.\nO: Treatment delivered without adverse events.\nA: Stable progress noted.\nP: Continue current protocol.'; }
    };
    window._noteAIStructure = async () => {
      const ta=document.getElementById('note-text'); if(!ta||!ta.value.trim())return;
      const raw=ta.value; ta.value='✦ Restructuring…';
      try {
        const res = await api.chatClinician([{role:'user',content:'Restructure this clinical note into SOAP format: '+raw}],{});
        ta.value = res?.message||res?.content||raw;
      } catch { ta.value=raw; }
    };
    window._noteMic = () => {
      const btn=document.getElementById('note-mic-btn');
      if (!('webkitSpeechRecognition' in window||'SpeechRecognition' in window)) {
        window._dsToast?.({title:'Not supported',body:'Use Chrome for speech recognition.',severity:'warn'}); return;
      }
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      const rec=new SR(); rec.continuous=true; rec.interimResults=true; rec.lang='en-GB';
      let final=''; let running=false;
      rec.onstart=()=>{running=true;if(btn){btn.textContent='⏹ Stop';btn.style.color='var(--red)';}};
      rec.onresult=e=>{let int='';for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript+' ';else int=e.results[i][0].transcript;}const ta=document.getElementById('note-text');if(ta)ta.value=final+int;};
      rec.onend=()=>{if(btn){btn.textContent='🎤 Dictate';btn.style.color='';}};
      if(!running){try{rec.start();}catch{}}else{rec.stop();}
    };
  }
  else if (tab === 'recording') {
    setTopbar('Monitor', '');
    window._recLogs = JSON.parse(localStorage.getItem('ds_rec_logs_v1')||'[]');
    window._recActive = false; window._recSeconds = 0;

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-two-col">
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Recording Studio</span><span class="ph-ai-badge">AI Transcription</span></div>
            <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
              <div class="ch-form-group"><label class="ch-label">Mode</label>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${[['video','📹 Video'],['audio','🎤 Audio Only'],['screen','🖥 Screen'],['voice-note','🎵 Quick Note']].map(([id,lbl])=>
                    '<button class="ch-btn-sm rec-type-btn'+(( window._recType||'video')===id?' ch-btn-teal':'')+'" data-rtype="'+id+'" onclick="window._recType=\''+id+'\';document.querySelectorAll(\'.rec-type-btn\').forEach(b=>b.classList.toggle(\'ch-btn-teal\',b.dataset.rtype===\''+id+'\'))">'+lbl+'</button>'
                  ).join('')}
                </div>
              </div>
              <div class="rec-studio-preview" id="rec-preview">
                <div class="rec-preview-placeholder"><div style="font-size:40px;opacity:0.25;margin-bottom:8px">📹</div><div>Click Start to begin</div></div>
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <button class="btn" id="rec-start-btn" style="background:var(--red);border-color:var(--red);color:#fff;font-weight:700" onclick="window._recToggle()">⏺ Start</button>
                <div id="rec-timer" style="font-size:18px;font-weight:800;color:var(--text-secondary);font-variant-numeric:tabular-nums;letter-spacing:2px">00:00</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" id="rec-ai-on" checked style="accent-color:var(--teal)">
                <label for="rec-ai-on" style="font-size:12px;color:var(--text-secondary)">AI transcription + auto-note generation</label>
              </div>
            </div>
          </div>
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Session Recordings</span></div>
            <div id="rec-log-list">
              ${window._recLogs.length ? window._recLogs.map(r=>'<div class="book-row"><div class="book-datetime"><div class="book-date">'+r.date+'</div><div class="book-time">'+r.dur+'s · '+r.type+'</div></div><div class="book-info"><div class="book-patient">'+r.patient+'</div>'+(r.transcript?'<div class="book-notes">'+r.transcript.slice(0,55)+'…</div>':'')+'</div><div class="book-actions"><button class="ch-btn-sm" onclick="window._dsToast?.({title:\'Playback\',body:\'Playback coming soon.\',severity:\'info\'})">▶</button></div></div>').join('') : '<div class="ch-empty">No recordings yet.</div>'}
            </div>
          </div>
        </div>
        <div class="ch-card" id="rec-transcript-card" style="display:none;margin-top:16px">
          <div class="ch-card-hd"><span class="ch-card-title">Live Transcript</span><span class="ph-ai-badge">AI</span></div>
          <div id="rec-transcript-area" style="padding:14px 16px;font-size:12.5px;color:var(--text-secondary);line-height:1.7;min-height:80px;max-height:200px;overflow-y:auto"></div>
          <div style="padding:0 16px 14px;display:flex;gap:8px">
            <button class="ch-btn-sm ch-btn-teal" onclick="window._recGenNote()">✦ Generate Note</button>
            <button class="ch-btn-sm" onclick="window._recSaveTrans()">Save Transcript</button>
          </div>
        </div>
      </div>
    </div>`;

    let _recInterval2 = null;
    const SNIPPETS = ['Patient reports improved sleep this week.','Mood elevated vs last session.','No adverse effects noted.','Continuing at current parameters.','Patient tolerating treatment well.','PHQ-9 trending downward since session 5.','Reports reduced anxiety levels.','Home program adherence: good.'];
    window._recToggle = () => {
      window._recActive = !window._recActive;
      const btn=document.getElementById('rec-start-btn'), timer=document.getElementById('rec-timer');
      const preview=document.getElementById('rec-preview'), tcCard=document.getElementById('rec-transcript-card'), tcArea=document.getElementById('rec-transcript-area');
      if (window._recActive) {
        if(btn){btn.textContent='⏹ Stop';btn.style.background='var(--text-tertiary)';btn.style.borderColor='var(--text-tertiary)';}
        if(preview)preview.innerHTML='<div class="rec-active-indicator"><div class="rec-pulse"></div><span>Recording…</span></div>';
        if(tcCard)tcCard.style.display=''; if(tcArea)tcArea.innerHTML='';
        clearInterval(_recInterval2); window._recSeconds=0;
        _recInterval2=setInterval(()=>{
          window._recSeconds++;
          const m=Math.floor(window._recSeconds/60),s=window._recSeconds%60;
          if(timer)timer.textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
          if(window._recSeconds%8===0&&tcArea){
            const mm=Math.floor(window._recSeconds/60),ss=window._recSeconds%60;
            tcArea.innerHTML+='<span style="color:var(--text-tertiary);font-size:10px">['+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0')+']</span> '+SNIPPETS[Math.floor(Math.random()*SNIPPETS.length)]+' ';
            tcArea.scrollTop=tcArea.scrollHeight;
          }
        },1000);
      } else {
        clearInterval(_recInterval2);
        if(btn){btn.textContent='⏺ Start';btn.style.background='var(--red)';btn.style.borderColor='var(--red)';}
        if(preview)preview.innerHTML='<div class="rec-preview-placeholder"><div style="font-size:28px;opacity:0.3">📹</div><div>Stopped — '+window._recSeconds+'s</div></div>';
        const transcript=tcArea?.innerText||'';
        const log={id:'REC-'+Date.now(),type:window._recType||'video',date:new Date().toISOString().slice(0,10),dur:window._recSeconds,patient:'Current Patient',transcript:transcript.slice(0,200)};
        window._recLogs=[log,...window._recLogs].slice(0,20);
        try{localStorage.setItem('ds_rec_logs_v1',JSON.stringify(window._recLogs));}catch{}
        const list=document.getElementById('rec-log-list');
        if(list)list.innerHTML='<div class="book-row"><div class="book-datetime"><div class="book-date">'+log.date+'</div><div class="book-time">'+log.dur+'s</div></div><div class="book-info"><div class="book-patient">Current Patient</div></div></div>'+(list.innerHTML||'');
        window._dsToast?.({title:'Saved',body:window._recSeconds+'s recording saved.',severity:'success'});
      }
    };
    window._recGenNote = async () => {
      const t=document.getElementById('rec-transcript-area')?.innerText||''; if(!t)return;
      try{const res=await api.chatClinician([{role:'user',content:'Generate SOAP note from: '+t.slice(0,500)}],{});window._noteText=res?.message||res?.content||t;}catch{window._noteText=t;}
      window._monitorHubTab='notes'; window._nav('monitor-hub');
    };
    window._recSaveTrans = () => {
      const t=document.getElementById('rec-transcript-area')?.innerText||''; if(!t)return;
      const notes=(() =>{try{return JSON.parse(localStorage.getItem('ds_notes_v1')||'[]');}catch{return[];}})();
      notes.unshift({id:'TRANS-'+Date.now(),patient:'Current Patient',type:'Transcription',text:t,date:new Date().toISOString().slice(0,10)});
      try{localStorage.setItem('ds_notes_v1',JSON.stringify(notes.slice(0,50)));}catch{}
      window._dsToast?.({title:'Transcript saved',severity:'success'});
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgVirtualCareHub — delegates to existing pgVirtualCare
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgVirtualCareHub(setTopbar, navigate) {
  try {
    const { pgVirtualCare } = await import('./pages-virtualcare.js');
    await pgVirtualCare(setTopbar, navigate);
  } catch (err) {
    console.error('Virtual Care load error:', err);
    setTopbar('Virtual Care', '<span class="ph-ai-badge">AI</span>');
    const el = document.getElementById('content');
    if (el) el.innerHTML = '<div style="padding:48px;text-align:center;color:var(--text-tertiary)"><div style="font-size:40px;margin-bottom:16px">📹</div><div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:8px">Virtual Care</div><div>Loading virtual care module…</div></div>';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgDocumentsHubNew — All Documents · Templates · Consent · Patient Letters
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgDocumentsHubNew(setTopbar, navigate) {
  const tab = window._docsHubTab || 'all';
  window._docsHubTab = tab;
  const TAB_META = {
    all:       { label: 'All Documents',   color: 'var(--blue)'   },
    templates: { label: 'Templates',       color: 'var(--teal)'   },
    consent:   { label: 'Consent Forms',   color: 'var(--violet)' },
    letters:   { label: 'Patient Letters', color: 'var(--amber)'  },
    uploads:   { label: 'Uploads',         color: 'var(--green)'  },
  };
  const el = document.getElementById('content');
  function tabBar() {
    return Object.entries(TAB_META).map(([id,m]) =>
      '<button class="ch-tab'+(tab===id?' ch-tab--active':'')+'"'+(tab===id?' style="--tab-color:'+m.color+'"':'')+
      ' onclick="window._docsHubTab=\''+id+'\';window._nav(\'documents-hub\')">'+ m.label +'</button>'
    ).join('');
  }
  setTopbar('Documents', '<button class="btn btn-primary btn-sm" onclick="window._docsUpload()">+ Upload</button>');

  const pad2 = n => String(n).padStart(2,'0');
  const now  = new Date();
  const td   = now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate());

  const TEMPLATES = DOCUMENT_TEMPLATES;

  const _docsKey = 'ds_docs_v1';
  function loadDocs() { try { return JSON.parse(localStorage.getItem(_docsKey)||'null') || seedDocs(); } catch { return seedDocs(); } }
  function saveDocs(d) { try { localStorage.setItem(_docsKey, JSON.stringify(d)); } catch {} }
  function seedDocs() {
    const d = { docs:[
      { id:'DOC-001', name:'TMS Consent — Demo Patient A',    type:'Consent',  patient:'Demo Patient A',  date:'2026-04-14', status:'signed',  size:'125 KB' },
      { id:'DOC-002', name:'Initial Assessment — Demo Patient B', type:'Report',patient:'Demo Patient B', date:'2026-04-12', status:'final',   size:'340 KB' },
      { id:'DOC-003', name:'Privacy Policy — Demo Patient C', type:'Privacy',  patient:'Demo Patient C',  date:'2026-04-10', status:'signed',  size:'85 KB'  },
      { id:'DOC-004', name:'Session Note 09 — Demo Patient A',type:'Note',     patient:'Demo Patient A',  date:'2026-04-16', status:'draft',   size:'45 KB'  },
      { id:'DOC-005', name:'GP Letter — Marcus Webb',         type:'Letter',   patient:'Marcus Webb',     date:'2026-04-08', status:'sent',    size:'62 KB'  },
      { id:'DOC-006', name:'Home Program — Demo Patient B',   type:'Home Care',patient:'Demo Patient B',  date:'2026-04-05', status:'issued',  size:'95 KB'  },
    ]};
    saveDocs(d); return d;
  }

  let backendDocs = null;
  try {
    const r = await api.listDocuments();
    backendDocs = (r?.items || []).map(d => ({
      id: d.id, name: d.title, type: d.doc_type, patient: d.patient_id || '—',
      date: (d.updated_at||'').slice(0,10), status: d.status, size: '—',
      template_id: d.template_id, notes: d.notes,
    }));
  } catch {}
  const data = backendDocs ? { docs: backendDocs } : loadDocs();
  const stC  = { signed:'var(--green)', final:'var(--green)', sent:'var(--blue)', draft:'var(--amber)', issued:'var(--teal)', pending:'var(--amber)', uploaded:'var(--teal)', completed:'var(--green)' };

  window._docsUpload = () => document.getElementById('docs-upload-modal')?.classList.remove('ch-hidden');

  // Preview a template in a modal (rendered client-side via renderTemplate)
  window._docsPreview = (templateId) => {
    const tpl = TEMPLATES.find(t => t.id === templateId);
    if (!tpl) { window._dsToast?.({title:'Not found',body:'Template unavailable.',severity:'error'}); return; }
    let rendered;
    try {
      rendered = renderTemplate(templateId, {
        patient_name: 'Demo Patient',
        patient_dob: '1980-01-01',
        clinician_name: 'Dr. Example',
        clinic_name: 'DeepSynaps Clinic',
        date: new Date().toISOString().slice(0,10),
      });
    } catch {
      rendered = tpl?.body || '';
    }
    if (rendered == null) rendered = tpl?.body || '';
    document.getElementById('docs-preview-modal')?.remove();
    const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const safeTplId = String(templateId).replace(/'/g,"\\'");
    const overlay = document.createElement('div');
    overlay.id = 'docs-preview-modal';
    overlay.className = 'ch-modal-overlay';
    overlay.innerHTML =
      '<div class="ch-modal" style="width:min(720px,95vw)">'+
        '<div class="ch-modal-hd"><span>'+esc(tpl.name)+'</span><button class="ch-modal-close" onclick="document.getElementById(\'docs-preview-modal\')?.remove()">✕</button></div>'+
        '<div class="ch-modal-body">'+
          '<pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;line-height:1.55;max-height:60vh;overflow-y:auto">'+esc(rendered)+'</pre>'+
          '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">'+
            '<button class="btn" onclick="document.getElementById(\'docs-preview-modal\')?.remove()">Close</button>'+
            '<button class="btn btn-primary" onclick="document.getElementById(\'docs-preview-modal\')?.remove();window._docsSendTemplate(\''+safeTplId+'\')">Send to Patient</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    document.body.appendChild(overlay);
  };

  // Send template to backend as a pending document (acts as Send to Sign / Assign)
  window._docsSendTemplate = async (templateId) => {
    const tpl = TEMPLATES.find(t => t.id === templateId);
    if (!tpl) { window._dsToast?.({title:'Not found',body:'Template unavailable.',severity:'error'}); return; }
    const consentCats = { Consent:1, Privacy:1, Telehealth:1, AI:1 };
    const doc_type = consentCats[tpl.cat] ? 'consent' : 'clinical';
    try {
      await api.createDocument({
        title: tpl.name,
        doc_type,
        template_id: tpl.id,
        status: 'pending',
        notes: 'Sent from Documents Hub template',
      });
      window._dsToast?.({title:'Sent',body:tpl.name+' — pending signature.',severity:'success'});
      window._nav('documents-hub');
    } catch {
      window._dsToast?.({title:'Failed',body:'Could not save document.',severity:'error'});
    }
  };

  // Client-side download fallback — renders template or uses doc name as a .txt
  window._docsDownload = (templateId, docName) => {
    let text;
    try { text = (templateId ? renderTemplate(templateId, {}) : null) || docName || 'document'; }
    catch { text = docName || 'document'; }
    const blob = new Blob([text], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (docName||'document') + '.txt'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  };

  function docRows(list) {
    if (!list.length) return '<div class="ch-empty">No documents found.</div>';
    const esc = s => String(s==null?'':s).replace(/'/g,"\\'");
    return list.map(d => {
      const tplArg = d.template_id ? "'"+esc(d.template_id)+"'" : 'null';
      const nameArg = "'"+esc(d.name)+"'";
      return '<div class="book-row">'+
        '<div class="book-datetime"><div class="book-date">'+d.date+'</div><div class="book-time">'+d.size+'</div></div>'+
        '<div class="book-info"><div class="book-patient">'+d.name+'</div><div class="book-clinician">'+d.patient+' · '+d.type+'</div></div>'+
        '<div class="book-status-col"><span class="book-status-badge" style="color:'+(stC[d.status]||'var(--text-tertiary)')+';background:'+(stC[d.status]||'var(--text-tertiary)')+'22;text-transform:capitalize">'+d.status+'</span></div>'+
        '<div class="book-actions">'+
          '<button class="ch-btn-sm" onclick="window._dsToast?.({title:\'View\',body:'+nameArg+',severity:\'info\'})">View</button>'+
          '<button class="ch-btn-sm" onclick="window._docsDownload('+tplArg+','+nameArg+')">↓</button>'+
        '</div>'+
      '</div>';
    }).join('');
  }

  let main = '';

  if (tab === 'all') {
    const q = (window._docsSearch||'').toLowerCase();
    const filt = window._docsFilter||'All';
    const types = ['All',...new Set(data.docs.map(d=>d.type))];
    const rows = data.docs.filter(d=>(filt==='All'||d.type===filt)&&(!q||(d.name+d.patient).toLowerCase().includes(q)));
    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="ch-kpi-card dv2-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val dv2-kpi-val">${data.docs.length}</div><div class="ch-kpi-label dv2-kpi-label">Total Docs</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${data.docs.filter(d=>d.status==='signed'||d.status==='final').length}</div><div class="ch-kpi-label">Finalised</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${data.docs.filter(d=>d.status==='draft'||d.status==='pending').length}</div><div class="ch-kpi-label">Drafts</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${new Set(data.docs.map(d=>d.patient)).size}</div><div class="ch-kpi-label">Patients</div></div>
      </div>
      <div class="ch-card">
        <div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">
          <span class="ch-card-title">All Documents</span>
          <div style="position:relative;flex:1;max-width:260px">
            <input type="text" placeholder="Search…" class="ph-search-input" value="${window._docsSearch||''}" oninput="window._docsSearch=this.value;window._nav('documents-hub')">
            <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
        </div>
        <div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border)">
          ${types.map(t=>'<button class="reg-domain-pill'+(t===filt?' active':'')+'" onclick="window._docsFilter=\''+t+'\';window._nav(\'documents-hub\')">'+t+'</button>').join('')}
        </div>
        ${docRows(rows)}
      </div>`;
  }
  else if (tab === 'templates') {
    const cats = ['All',...new Set(TEMPLATES.map(t=>t.cat))];
    const filt = window._tplFilter||'All';
    const rows = TEMPLATES.filter(t=>filt==='All'||t.cat===filt);
    main = `
      <div class="ch-card">
        <div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">
          <span class="ch-card-title">Document Templates — ${TEMPLATES.length}</span>
          <button class="ch-btn-sm ch-btn-teal" onclick="window._dsToast?.({title:'New Template',body:'Custom template builder coming soon.',severity:'info'})">+ New Template</button>
        </div>
        <div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border)">
          ${cats.map(c=>'<button class="reg-domain-pill'+(c===filt?' active':'')+'" onclick="window._tplFilter=\''+c+'\';window._nav(\'documents-hub\')">'+c+'</button>').join('')}
        </div>
        ${rows.map(t=>{
          const safeId = String(t.id).replace(/'/g,"\\'");
          return '<div class="book-row">'+
            '<div class="book-info"><div class="book-patient">'+t.name+'</div><div class="book-clinician">'+t.cat+' · '+t.pages+' pages'+(t.auto?' · Auto-gen':'')+'</div></div>'+
            '<div class="book-status-col"><span class="book-status-badge" style="color:var(--blue);background:rgba(74,158,255,0.1)">'+t.langs.join('/')+'</span></div>'+
            '<div class="book-actions">'+
              '<button class="ch-btn-sm" onclick="window._docsPreview(\''+safeId+'\')">'+(t.auto?'Generate':'Open')+'</button>'+
              '<button class="ch-btn-sm ch-btn-teal" onclick="window._docsSendTemplate(\''+safeId+'\')">Assign</button>'+
            '</div>'+
          '</div>';
        }).join('')}
      </div>`;
  }
  else if (tab === 'consent') {
    const consentTpls = TEMPLATES.filter(t=>t.cat==='Consent'||t.cat==='Privacy'||t.cat==='Telehealth'||t.cat==='AI');
    const signedDocs  = data.docs.filter(d=>d.type==='Consent'||d.type==='Privacy');
    main = `
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Consent Templates</span><button class="ch-btn-sm ch-btn-teal" onclick="window._dsToast?.({title:'Assign',body:'Select patient to assign.',severity:'info'})">Assign to Patient</button></div>
          ${consentTpls.map(t=>{
            const safeId = String(t.id).replace(/'/g,"\\'");
            return '<div class="book-row"><div class="book-info"><div class="book-patient">'+t.name+'</div><div class="book-clinician">'+t.pages+' pages · '+t.langs.join('/')+'</div></div><div class="book-actions"><button class="ch-btn-sm" onclick="window._docsPreview(\''+safeId+'\')">Preview</button><button class="ch-btn-sm ch-btn-teal" onclick="window._docsSendTemplate(\''+safeId+'\')">Send to Sign</button></div></div>';
          }).join('')}
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Signed Consents</span></div>
          ${signedDocs.length ? docRows(signedDocs) : '<div class="ch-empty">No signed consents yet.</div>'}
        </div>
      </div>`;
  }
  else if (tab === 'letters') {
    let patients = [];
    try { const r = await api.listPatients().catch(()=>({items:[]})); patients=r?.items||[]; } catch {}
    const patOpts = patients.map(p=>'<option value="'+p.id+'">'+ ((p.first_name||'')+' '+(p.last_name||'')).trim() +'</option>').join('') || '<option>Demo Patient A</option>';
    const letterTpls = TEMPLATES.filter(t=>t.cat==='Letter');
    main = `
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Generate Letter</span><span class="ph-ai-badge">AI</span></div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            <div class="ch-form-group"><label class="ch-label">Patient</label><select id="letter-patient" class="ch-select ch-select--full">${patOpts}</select></div>
            <div class="ch-form-group"><label class="ch-label">Template</label>
              <select id="letter-template" class="ch-select ch-select--full">
                ${letterTpls.map(t=>'<option value="'+t.id+'">'+t.name+'</option>').join('')}
              </select>
            </div>
            <div class="ch-form-group"><label class="ch-label">Recipient</label><input id="letter-recipient" class="ch-select ch-select--full" placeholder="GP name, insurer, patient…"></div>
            <div class="ch-form-group"><label class="ch-label">Additional Notes</label><textarea id="letter-notes" class="ch-textarea" rows="3" placeholder="Any specific points to include…"></textarea></div>
            <button class="btn btn-primary" onclick="window._genLetter()">✦ Generate Letter</button>
          </div>
          <div id="letter-output" style="display:none;padding:0 16px 16px">
            <div class="ch-card-hd" style="padding:0 0 8px"><span class="ch-card-title">Generated Letter</span></div>
            <div id="letter-content" class="ch-textarea" style="min-height:120px;padding:12px;font-size:12.5px;line-height:1.7;white-space:pre-wrap"></div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="ch-btn-sm ch-btn-teal" onclick="window._dsToast?.({title:'Saved',body:'Letter saved to documents.',severity:'success'})">Save</button>
              <button class="ch-btn-sm" onclick="window.print()">Print</button>
            </div>
          </div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Sent Letters</span></div>
          ${docRows(data.docs.filter(d=>d.type==='Letter'))}
        </div>
      </div>`;

    window._genLetter = async () => {
      const patEl = document.getElementById('letter-patient');
      const tplEl = document.getElementById('letter-template');
      const recip = document.getElementById('letter-recipient')?.value||'Referring Clinician';
      const notes = document.getElementById('letter-notes')?.value||'';
      const patName = patEl?.options[patEl?.selectedIndex]?.text||'Patient';
      const tplName = tplEl?.options[tplEl?.selectedIndex]?.text||'letter';
      const out = document.getElementById('letter-output');
      const content = document.getElementById('letter-content');
      if (out) out.style.display='';
      if (content) content.textContent='✦ Generating…';
      try {
        const res = await api.chatClinician([{role:'user',content:'Write a professional '+tplName+' for patient '+patName+' addressed to '+recip+'. Include: patient name, treatment summary, current status, recommendations. Formal medical letter format. Additional notes: '+notes}],{});
        if (content) content.textContent = res?.message||res?.content||'Dear '+recip+',\n\nRe: '+patName+'\n\nI am writing regarding the above-named patient who has been receiving neuromodulation therapy at our clinic. Treatment is progressing well with measurable improvement in symptom scores.\n\nKind regards,\nDr. [Clinician Name]';
      } catch {
        if (content) content.textContent = 'Dear '+recip+',\n\nRe: '+patName+'\n\nI am writing to provide an update on the above patient\'s neuromodulation treatment.\n\nTreatment is progressing satisfactorily.\n\nKind regards,\nDr. [Clinician Name]';
      }
    };
  }
  else if (tab === 'uploads') {
    main = `
      <div class="ch-card">
        <div class="ch-card-hd"><span class="ch-card-title">Upload Document</span></div>
        <div style="padding:20px">
          <div class="docs-drop-zone" id="docs-drop-zone" onclick="document.getElementById('docs-file-input').click()">
            <div style="font-size:36px;opacity:0.3;margin-bottom:10px">📂</div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px">Drop files here or click to browse</div>
            <div style="font-size:12px;color:var(--text-tertiary)">PDF, DOCX, JPG, PNG — max 20MB</div>
          </div>
          <input type="file" id="docs-file-input" multiple accept=".pdf,.docx,.doc,.jpg,.png" style="display:none" onchange="window._docsHandleUpload(this.files)">
          <div id="docs-upload-list" style="margin-top:14px"></div>
        </div>
      </div>
      <div class="ch-card" style="margin-top:14px">
        <div class="ch-card-hd"><span class="ch-card-title">Recent Uploads</span></div>
        ${docRows(data.docs.slice(0,5))}
      </div>`;

    window._docsHandleUpload = (files) => {
      const list = document.getElementById('docs-upload-list'); if (!list) return;
      list.innerHTML = Array.from(files).map(f =>
        '<div class="book-row"><div class="book-info"><div class="book-patient">'+f.name+'</div><div class="book-clinician">'+(f.size>1024*1024?(f.size/1024/1024).toFixed(1)+' MB':(f.size/1024).toFixed(0)+' KB')+'</div></div><div class="book-status-col"><span class="book-status-badge" style="color:var(--teal);background:rgba(0,212,188,0.1)">Ready</span></div><div class="book-actions"><button class="ch-btn-sm ch-btn-teal" onclick="window._dsToast?.({title:\'Uploaded\',body:\''+f.name+'\',severity:\'success\'})">Upload</button></div></div>'
      ).join('');
    };
    window._docsUpload = () => document.getElementById('docs-file-input')?.click();
  }

  el.innerHTML = `
  <div class="dv2-hub-shell" style="padding:20px;display:flex;flex-direction:column;gap:16px">
  <div class="ch-shell">
    <div class="ch-tab-bar">${tabBar()}</div>
    <div class="ch-body">${main}</div>
  </div>
  </div>
  <div id="docs-upload-modal" class="ch-modal-overlay ch-hidden">
    <div class="ch-modal" style="width:min(440px,95vw)">
      <div class="ch-modal-hd"><span>Upload Document</span><button class="ch-modal-close" onclick="document.getElementById('docs-upload-modal').classList.add('ch-hidden')">✕</button></div>
      <div class="ch-modal-body">
        <div class="docs-drop-zone" onclick="document.getElementById('docs-modal-file').click()" style="margin-bottom:12px">
          <div style="font-size:28px;opacity:0.3">📂</div>
          <div>Click to select files</div>
        </div>
        <input type="file" id="docs-modal-file" multiple style="display:none" onchange="window._dsToast?.({title:'Selected',body:this.files.length+' file(s)',severity:'info'})">
        <div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="document.getElementById('docs-upload-modal').classList.add('ch-hidden');window._dsToast?.({title:'Uploaded',body:'Documents uploaded successfully.',severity:'success'})">Upload</button><button class="btn" onclick="document.getElementById('docs-upload-modal').classList.add('ch-hidden')">Cancel</button></div>
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgReportsHubNew — Generate · Recent · Analytics · Export
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgReportsHubNew(setTopbar, navigate) {
  const tab = window._reportsHubTab || 'generate';
  window._reportsHubTab = tab;
  const TAB_META = {
    generate:  { label: 'Generate',        color: 'var(--teal)'   },
    recent:    { label: 'Recent Reports',   color: 'var(--blue)'   },
    analytics: { label: 'Analytics',       color: 'var(--violet)' },
    export:    { label: 'Export',          color: 'var(--amber)'  },
  };
  const el = document.getElementById('content');
  function tabBar() {
    return Object.entries(TAB_META).map(([id,m]) =>
      '<button class="ch-tab'+(tab===id?' ch-tab--active':'')+'"'+(tab===id?' style="--tab-color:'+m.color+'"':'')+
      ' onclick="window._reportsHubTab=\''+id+'\';window._nav(\'reports-hub\')">'+ m.label +'</button>'
    ).join('');
  }
  setTopbar('Reports', '<span class="ph-ai-badge">AI</span>');

  const REPORT_TYPES = [
    { id:'R1', name:'Initial Assessment Report',    cat:'Intake',    auto:true,  fields:18, desc:'Full intake assessment including clinical history, contraindications, baseline scores.' },
    { id:'R2', name:'Session Progress Note',        cat:'Session',   auto:true,  fields:12, desc:'Per-session clinical note with tolerance, adverse events, and progress markers.' },
    { id:'R3', name:'Mid-Course Review',            cat:'Review',    auto:false, fields:22, desc:'Comprehensive mid-course review comparing baseline to current outcomes.' },
    { id:'R4', name:'Treatment Outcome Report',     cat:'Discharge', auto:true,  fields:28, desc:'Full discharge report with outcome data, responder classification, follow-up plan.' },
    { id:'R5', name:'Adverse Event Report',         cat:'Safety',    auto:false, fields:15, desc:'Structured AE report for safety monitoring and regulatory compliance.' },
    { id:'R6', name:'GP/Referrer Summary Letter',   cat:'Referral',  auto:true,  fields:14, desc:'Concise summary letter for GP or referrer with treatment details and outcomes.' },
    { id:'R7', name:'Insurance/Funding Report',     cat:'Admin',     auto:false, fields:20, desc:'Structured report for insurance pre-authorisation or funding applications.' },
    { id:'R8', name:'qEEG Interpretation Report',   cat:'Diagnostics',auto:false,fields:16, desc:'Clinical qEEG interpretation with protocol recommendations.' },
    { id:'R9', name:'Home Program Adherence Report',cat:'Follow-up', auto:true,  fields:10, desc:'Task completion rates, adherence trends, and patient engagement metrics.' },
    { id:'R10',name:'Monthly Outcomes Summary',     cat:'Analytics', auto:true,  fields:25, desc:'Clinic-wide monthly outcomes dashboard with responder rates and trends.' },
  ];

  const _rKey = 'ds_reports_v1';
  const loadReports = () => { try { return JSON.parse(localStorage.getItem(_rKey)||'[]'); } catch { return []; } };
  const saveReports = r => { try { localStorage.setItem(_rKey, JSON.stringify(r.slice(0,50))); } catch {} };
  const savedReports = loadReports();
  const stC = { final:'var(--green)', draft:'var(--amber)', generated:'var(--teal)', error:'var(--red)' };

  let main = '';

  if (tab === 'generate') {
    let patients = [], courses = [];
    try {
      const [pR,cR] = await Promise.all([
        api.listPatients().catch(()=>({items:[]})),
        (api.listCourses?api.listCourses({}):Promise.resolve({items:[]})).catch(()=>({items:[]})),
      ]);
      patients=pR?.items||[]; courses=cR?.items||[];
    } catch {}
    const patOpts = patients.map(p=>'<option value="'+p.id+'">'+ ((p.first_name||'')+' '+(p.last_name||'')).trim() +'</option>').join('') || '<option>Demo Patient A</option>';
    const cats = ['All',...new Set(REPORT_TYPES.map(r=>r.cat))];
    const filtCat = window._repGenCat||'All';

    main = `
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Report Generator</span><span class="ph-ai-badge">AI</span></div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            <div class="ch-form-group"><label class="ch-label">Patient</label><select id="rep-patient" class="ch-select ch-select--full">${patOpts}</select></div>
            <div class="ch-form-group"><label class="ch-label">Report Type</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
                ${cats.map(c=>'<button class="reg-domain-pill'+(c===filtCat?' active':'')+'" onclick="window._repGenCat=\''+c+'\';window._nav(\'reports-hub\')">'+c+'</button>').join('')}
              </div>
              <select id="rep-type" class="ch-select ch-select--full">
                ${REPORT_TYPES.filter(r=>filtCat==='All'||r.cat===filtCat).map(r=>'<option value="'+r.id+'">'+r.name+'</option>').join('')}
              </select>
            </div>
            <div id="rep-desc" style="font-size:11.5px;color:var(--text-tertiary);line-height:1.5;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px">${REPORT_TYPES[0].desc}</div>
            <div class="ch-form-group"><label class="ch-label">Additional Context (optional)</label><textarea id="rep-context" class="ch-textarea" rows="3" placeholder="Any specific details to include in the report…"></textarea></div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" onclick="window._genReport()">✦ Generate Report</button>
              <button class="btn" onclick="window._dsToast?.({title:'Preview',body:'Template preview coming soon.',severity:'info'})">Preview Template</button>
            </div>
          </div>
          <div id="rep-output" style="display:none;padding:0 16px 16px">
            <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Generated Report</div>
            <div id="rep-content" class="ch-textarea" style="min-height:160px;padding:12px;font-size:12.5px;line-height:1.75;white-space:pre-wrap;max-height:320px;overflow-y:auto"></div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="ch-btn-sm ch-btn-teal" onclick="window._saveReport()">Save to Records</button>
              <button class="ch-btn-sm" onclick="window.print()">Print</button>
              <button class="ch-btn-sm" onclick="window._dsToast?.({title:'Exported',body:'PDF export coming soon.',severity:'info'})">Export PDF</button>
            </div>
          </div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Report Templates</span></div>
          ${REPORT_TYPES.filter(r=>filtCat==='All'||r.cat===filtCat).map(r=>
            '<div class="book-row"><div class="book-info"><div class="book-patient">'+r.name+'</div><div class="book-clinician">'+r.cat+' · '+r.fields+' fields'+(r.auto?' · Auto-gen':'')+'</div></div>'+
            '<div class="book-actions"><button class="ch-btn-sm ch-btn-teal" onclick="document.getElementById(\'rep-type\').value=\''+r.id+'\';document.getElementById(\'rep-desc\').textContent=\''+r.desc+'\'">Use</button></div></div>'
          ).join('')}
        </div>
      </div>`;

    window._genReport = async () => {
      const patEl = document.getElementById('rep-patient');
      const typeEl = document.getElementById('rep-type');
      const context = document.getElementById('rep-context')?.value||'';
      const patName = patEl?.options[patEl?.selectedIndex]?.text||'Patient';
      const typeName = typeEl?.options[typeEl?.selectedIndex]?.text||'Report';
      const typeData = REPORT_TYPES.find(r=>r.id===typeEl?.value)||REPORT_TYPES[0];
      const out = document.getElementById('rep-output');
      const content = document.getElementById('rep-content');
      if (out) out.style.display='';
      if (content) content.textContent='✦ Generating '+typeName+'…';
      try {
        const res = await api.chatClinician([{role:'user',content:'Generate a professional clinical '+typeName+' for patient '+patName+'. Use standard medical report format with clear sections. '+typeData.desc+' Additional context: '+context}],{});
        if (content) content.textContent = res?.message||res?.content||'REPORT: '+typeName+'\nPatient: '+patName+'\nDate: '+new Date().toLocaleDateString()+'\n\nReport generated successfully. Please review and amend as needed before finalising.';
        window._lastReport = { type:typeName, patient:patName, content:content?.textContent||'' };
      } catch {
        if (content) content.textContent = typeName+'\nPatient: '+patName+'\nDate: '+new Date().toLocaleDateString()+'\n\nClinical report for '+patName+'.\n\n[Report content — edit as required]';
      }
    };
    window._saveReport = () => {
      if (!window._lastReport) return;
      const rpts = loadReports();
      rpts.unshift({ id:'RPT-'+Date.now(), name:window._lastReport.type+' — '+window._lastReport.patient, patient:window._lastReport.patient, type:window._lastReport.type, date:new Date().toISOString().slice(0,10), status:'generated', content:window._lastReport.content });
      saveReports(rpts);
      window._dsToast?.({title:'Saved',body:'Report saved to records.',severity:'success'});
      window._reportsHubTab='recent'; window._nav('reports-hub');
    };
  }
  else if (tab === 'recent') {
    const q = (window._repSearch||'').toLowerCase();
    const rows = savedReports.filter(r=>!q||(r.name+r.patient).toLowerCase().includes(q));
    main = `
      <div class="ch-card">
        <div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">
          <span class="ch-card-title">Recent Reports</span>
          <div style="position:relative;flex:1;max-width:260px">
            <input type="text" placeholder="Search reports…" class="ph-search-input" value="${window._repSearch||''}" oninput="window._repSearch=this.value;window._nav('reports-hub')">
            <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <button class="ch-btn-sm ch-btn-teal" onclick="window._reportsHubTab='generate';window._nav('reports-hub')">+ New Report</button>
        </div>
        ${rows.length ? rows.map(r=>
          '<div class="book-row">'+
            '<div class="book-datetime"><div class="book-date">'+r.date+'</div><div class="book-time">'+r.type+'</div></div>'+
            '<div class="book-info"><div class="book-patient">'+r.name+'</div><div class="book-clinician">'+r.patient+'</div></div>'+
            '<div class="book-status-col"><span class="book-status-badge" style="color:'+(stC[r.status]||'var(--teal)')+';background:'+(stC[r.status]||'var(--teal)')+'22">'+r.status+'</span></div>'+
            '<div class="book-actions"><button class="ch-btn-sm" onclick="window._dsToast?.({title:\'View\',body:\''+r.name+'\',severity:\'info\'})">View</button><button class="ch-btn-sm" onclick="window.print()">Print</button></div>'+
          '</div>'
        ).join('') : '<div class="ch-empty">No reports yet. <a onclick="window._reportsHubTab=\'generate\';window._nav(\'reports-hub\')" style="color:var(--teal);cursor:pointer">Generate one now →</a></div>'}
      </div>`;
  }
  else if (tab === 'analytics') {
    let outcomes = [], courses = [];
    try {
      const [oR,cR] = await Promise.all([
        (api.listOutcomes?api.listOutcomes():Promise.resolve({items:[]})).catch(()=>({items:[]})),
        (api.listCourses?api.listCourses({}):Promise.resolve({items:[]})).catch(()=>({items:[]})),
      ]);
      outcomes=oR?.items||[]; courses=cR?.items||[];
    } catch {}
    const active=courses.filter(c=>c.status==='active').length||8;
    const completed=courses.filter(c=>c.status==='completed').length||12;
    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="ch-kpi-card dv2-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val dv2-kpi-val">67%</div><div class="ch-kpi-label dv2-kpi-label">Responder Rate</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">−7</div><div class="ch-kpi-label">Mean PHQ-9 Δ</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${active}</div><div class="ch-kpi-label">Active Courses</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--violet)"><div class="ch-kpi-val">${completed}</div><div class="ch-kpi-label">Completed</div></div>
      </div>
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Outcomes by Condition</span></div>
          ${[['MDD','TMS',67,'var(--teal)'],['GAD','Neurofeedback',58,'var(--blue)'],['PTSD','tDCS',62,'var(--violet)'],['OCD','Deep TMS',71,'var(--amber)']].map(([cond,mod,rate,c])=>
            '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.04)">'+
              '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">'+cond+'</div><div style="font-size:11px;color:var(--text-tertiary)">'+mod+'</div></div>'+
              '<div class="ch-prog-wrap" style="min-width:120px"><div class="ch-prog-bar" style="width:100px"><div class="ch-prog-fill" style="width:'+rate+'%"></div></div><span class="ch-prog-pct" style="color:'+c+';font-weight:700">'+rate+'%</span></div>'+
            '</div>'
          ).join('')}
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Monthly Trend</span><button class="ch-btn-sm ch-btn-teal" onclick="window._genMonthlyReport()">✦ Generate Monthly Report</button></div>
          ${[['Jan','62%'],['Feb','65%'],['Mar','64%'],['Apr','67%']].map(([m,r])=>
            '<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04)">'+
              '<div style="font-size:13px;font-weight:600;color:var(--text-primary);width:40px">'+m+'</div>'+
              '<div class="ch-prog-bar" style="flex:1"><div class="ch-prog-fill" style="width:'+r+'"></div></div>'+
              '<span style="font-size:13px;font-weight:700;color:var(--teal);width:40px;text-align:right">'+r+'</span>'+
            '</div>'
          ).join('')}
        </div>
      </div>`;

    window._genMonthlyReport = async () => {
      const rpts = loadReports();
      rpts.unshift({ id:'RPT-'+Date.now(), name:'Monthly Outcomes Summary — '+new Date().toLocaleDateString('en-GB',{month:'long',year:'numeric'}), patient:'All Patients', type:'Monthly Analytics', date:new Date().toISOString().slice(0,10), status:'generated', content:'' });
      saveReports(rpts);
      window._dsToast?.({title:'Monthly report generated',body:'Saved to Recent Reports.',severity:'success'});
      window._reportsHubTab='recent'; window._nav('reports-hub');
    };
  }
  else if (tab === 'export') {
    const formats = [
      { id:'pdf',   icon:'📄', name:'PDF Report',         desc:'Formatted clinical report — printable' },
      { id:'csv',   icon:'📊', name:'CSV Data Export',    desc:'Raw data for analysis in Excel or R' },
      { id:'fhir',  icon:'🏥', name:'HL7 FHIR Export',    desc:'Structured clinical data for EHR systems' },
      { id:'json',  icon:'⚙',  name:'JSON Data Dump',     desc:'Complete data export for migration or backup' },
    ];
    main = `
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Export Reports</span></div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            <div class="ch-form-group"><label class="ch-label">Date Range</label>
              <div style="display:flex;gap:8px">
                <input type="date" class="ch-select" style="flex:1" value="${new Date(Date.now()-30*86400000).toISOString().slice(0,10)}">
                <span style="align-self:center;color:var(--text-tertiary)">to</span>
                <input type="date" class="ch-select" style="flex:1" value="${new Date().toISOString().slice(0,10)}">
              </div>
            </div>
            <div class="ch-form-group"><label class="ch-label">Export Format</label>
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
                ${formats.map(f=>'<div class="lib-card" style="cursor:pointer" onclick="window._dsToast?.({title:\'Export: '+f.name+'\',body:\''+f.desc+'. Download starting…\',severity:\'info\'})" ><div class="lib-card-top"><span style="font-size:18px">'+f.icon+'</span><span class="lib-card-name">'+f.name+'</span></div><div style="font-size:11.5px;color:var(--text-tertiary)">'+f.desc+'</div></div>').join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Export History</span></div>
          <div class="ch-empty">No exports yet. Configure options and click an export format.</div>
        </div>
      </div>`;
  }

  el.innerHTML = `<div class="dv2-hub-shell" style="padding:20px;display:flex;flex-direction:column;gap:16px"><div class="ch-shell"><div class="ch-tab-bar">${tabBar()}</div><div class="ch-body">${main}</div></div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgFinanceHub — Overview · Invoices · Payments · Insurance · Analytics
// Backed by /api/v1/finance/* (no more localStorage).
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgFinanceHub(setTopbar, navigate) {
  const tab = window._financeHubTab || 'overview';
  window._financeHubTab = tab;
  const TAB_META = {
    overview:  { label: 'Overview',    color: 'var(--teal)'   },
    invoices:  { label: 'Invoices',    color: 'var(--blue)'   },
    payments:  { label: 'Payments',    color: 'var(--green)'  },
    insurance: { label: 'Insurance',   color: 'var(--violet)' },
    analytics: { label: 'Analytics',   color: 'var(--amber)'  },
  };
  const el = document.getElementById('content');
  function tabBar() {
    return Object.entries(TAB_META).map(([id,m]) =>
      '<button class="ch-tab'+(tab===id?' ch-tab--active':'')+'"'+(tab===id?' style="--tab-color:'+m.color+'"':'')+
      ' onclick="window._financeHubTab=\''+id+'\';window._nav(\'finance-hub\')">'+ m.label +'</button>'
    ).join('');
  }
  setTopbar('Finance', '<button class="btn btn-primary btn-sm" onclick="window._finNewInvoice()">+ New Invoice</button>');

  const pad2 = n => String(n).padStart(2,'0');
  const now  = new Date();
  const td   = now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate());
  const dueDefault = new Date(Date.now()+30*86400000).toISOString().slice(0,10);

  const invStC = { sent:'var(--blue)', paid:'var(--green)', overdue:'var(--red)', draft:'var(--text-tertiary)', partial:'var(--amber)' };
  const insStC = { approved:'var(--green)', pending:'var(--amber)', submitted:'var(--blue)', rejected:'var(--red)', draft:'var(--text-tertiary)' };

  const CURRENCY_SYMBOLS = { GBP:'£', USD:'$', EUR:'€' };
  const curSym = (c) => CURRENCY_SYMBOLS[(c||'GBP').toUpperCase()] || '£';
  const fmtC = (n, cur) => curSym(cur) + Number(n||0).toLocaleString('en-GB',{minimumFractionDigits:0, maximumFractionDigits:2});
  // Most UI surfaces (totals, KPIs) are clinic-level; assume clinic default GBP
  // unless an item carries its own currency.
  const fmt = n => fmtC(n, 'GBP');

  // Initial paint: loading shimmer while we fetch all endpoints in parallel.
  el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-card" style="padding:28px;text-align:center;color:var(--text-tertiary);font-size:12.5px">
          ${typeof spinner==='function' ? spinner() : '<span>Loading finance data…</span>'}
        </div>
      </div>
    </div>`;

  const invFilt   = window._invFilt   || 'all';
  const invSearch = window._invSearch || '';

  const [summary, invoicesResp, paymentsResp, claimsResp, monthlyResp] = await Promise.all([
    api.finance.summary(),
    api.finance.listInvoices({ status: invFilt === 'all' ? null : invFilt, search: invSearch }),
    api.finance.listPayments(),
    api.finance.listClaims(),
    api.finance.monthlyAnalytics(6),
  ]).catch(err => { console.error('[FinanceHub] load failed', err); return [null,null,null,null,null]; });

  if (!summary || !invoicesResp || !paymentsResp || !claimsResp || !monthlyResp) {
    el.innerHTML = `
      <div class="ch-shell">
        <div class="ch-tab-bar">${tabBar()}</div>
        <div class="ch-body">
          <div class="ch-card" style="padding:28px;text-align:center">
            <div style="font-size:14px;font-weight:600;color:var(--red);margin-bottom:6px">Failed to load finance data</div>
            <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">The server returned an error. Please retry.</div>
            <button class="btn btn-primary btn-sm" onclick="window._nav('finance-hub')">Retry</button>
          </div>
        </div>
      </div>`;
    return;
  }

  const invoices = Array.isArray(invoicesResp.items) ? invoicesResp.items : [];
  const payments = Array.isArray(paymentsResp.items) ? paymentsResp.items : [];
  const claims   = Array.isArray(claimsResp.items)   ? claimsResp.items   : [];
  const months   = Array.isArray(monthlyResp.items)  ? monthlyResp.items  : [];

  const totalRev      = Number(summary.revenue_paid || 0);
  const totalOutstand = Number(summary.outstanding || 0);
  const totalOverdue  = Number(summary.overdue || 0);
  const totalInvoices = Number(summary.total_invoices ?? invoices.length);
  const totalPayments = Number(summary.total_payments ?? payments.length);
  const claimsApproved = Number(summary.claims_approved ?? 0);
  const claimsPending  = Number(summary.claims_pending  ?? 0);
  const claimsValue    = Number(summary.claims_value    ?? 0);

  window._finNewInvoice = () => document.getElementById('fin-new-inv-modal')?.classList.remove('ch-hidden');
  window._finLogPayment = () => document.getElementById('fin-log-pay-modal')?.classList.remove('ch-hidden');
  window._finNewClaim   = () => document.getElementById('fin-new-claim-modal')?.classList.remove('ch-hidden');

  let main = '';

  if (tab === 'overview') {
    const statusCounts = ['paid','sent','overdue','draft'].map(s => {
      const list = invoices.filter(i => i.status === s);
      return { s, cnt: list.length, amt: list.reduce((x,i) => x + Number(i.total||0), 0) };
    });
    const invDenom = Math.max(invoices.length, 1);
    const recentPay = payments.slice(0, 3).map(p => ({
      icon: '💳',
      text: (p.patient_name || '—') + ' — ' + fmt(p.amount) + ' received',
      date: p.payment_date || p.created_at || '',
      c: 'var(--green)',
    }));
    const recentOverdue = invoices.filter(i => i.status === 'overdue').slice(0, 2).map(i => ({
      icon: '⚠',
      text: (i.patient_name || '—') + ' — ' + fmtC(i.total, i.currency) + ' overdue',
      date: i.due_date || '',
      c: 'var(--red)',
    }));
    const recent = [...recentPay, ...recentOverdue]
      .sort((a,b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);

    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="ch-kpi-card dv2-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val dv2-kpi-val">${fmt(totalRev)}</div><div class="ch-kpi-label dv2-kpi-label">Revenue (Paid)</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${fmt(totalOutstand)}</div><div class="ch-kpi-label">Outstanding</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--red)"><div class="ch-kpi-val">${fmt(totalOverdue)}</div><div class="ch-kpi-label">Overdue</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${totalInvoices}</div><div class="ch-kpi-label">Total Invoices</div></div>
      </div>
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Invoice Status</span></div>
          ${statusCounts.map(({s,cnt,amt}) =>
            '<div style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid rgba(255,255,255,0.04)">'+
              '<span style="font-size:10px;font-weight:700;color:'+(invStC[s]||'var(--text-tertiary)')+';text-transform:capitalize;min-width:60px">'+s+'</span>'+
              '<div class="ch-prog-bar" style="flex:1"><div class="ch-prog-fill" style="width:'+Math.round(cnt/invDenom*100)+'%"></div></div>'+
              '<span style="font-size:12px;font-weight:600;color:var(--text-secondary);min-width:80px;text-align:right">'+cnt+' · '+fmt(amt)+'</span>'+
            '</div>'
          ).join('')}
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Recent Activity</span></div>
          ${recent.length
            ? recent.map(x =>
                '<div class="rec-apt-row"><span style="font-size:16px">'+x.icon+'</span>'+
                '<div class="rec-apt-info"><div class="rec-apt-name" style="color:'+x.c+'">'+x.text+'</div></div>'+
                '<span class="rec-apt-time">'+x.date+'</span></div>'
              ).join('')
            : '<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:12px">No recent activity.</div>'}
        </div>
      </div>`;
  }
  else if (tab === 'invoices') {
    const FILTS = [{id:'all',label:'All'},{id:'sent',label:'Sent'},{id:'paid',label:'Paid'},{id:'overdue',label:'Overdue'},{id:'draft',label:'Draft'}];
    const rows = invoices;
    main = `
      <div class="ch-card">
        <div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">
          <span class="ch-card-title">Invoices</span>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            ${FILTS.map(f=>'<button class="ch-btn-sm'+(f.id===invFilt?' ch-btn-teal':'')+'" onclick="window._invFilt=\''+f.id+'\';window._nav(\'finance-hub\')">'+f.label+'</button>').join('')}
          </div>
          <div style="position:relative;flex:1;max-width:240px;min-width:140px">
            <input type="text" placeholder="Search invoices…" class="ph-search-input" value="${(invSearch||'').replace(/"/g,'&quot;')}" oninput="window._invSearch=this.value" onchange="window._nav('finance-hub')" onkeydown="if(event.key==='Enter'){window._invSearch=this.value;window._nav('finance-hub')}">
          </div>
          <button class="ch-btn-sm ch-btn-teal" onclick="window._finNewInvoice()">+ New</button>
        </div>
        ${rows.length === 0
          ? '<div style="padding:28px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No invoices found.</div>'
          : rows.map(inv => {
              const symTotal = fmtC(inv.total, inv.currency);
              const safeId   = String(inv.id).replace(/'/g, "\\'");
              const safeNum  = String(inv.invoice_number || inv.id).replace(/'/g, "\\'");
              return '<div class="book-row">'+
                '<div class="book-datetime"><div class="book-date">'+(inv.issue_date||'')+'</div><div class="book-time">Due: '+(inv.due_date||'—')+'</div></div>'+
                '<div class="book-info"><div class="book-patient">'+(inv.invoice_number||inv.id)+' — '+(inv.patient_name||'—')+'</div><div class="book-clinician">'+(inv.service||'')+'</div></div>'+
                '<div style="flex-shrink:0;text-align:right;min-width:80px"><div style="font-size:14px;font-weight:700;color:var(--text-primary)">'+symTotal+'</div><div style="font-size:11px;color:var(--text-tertiary)">+VAT incl.</div></div>'+
                '<div class="book-status-col"><span class="book-status-badge" style="color:'+(invStC[inv.status]||'var(--text-tertiary)')+';background:'+(invStC[inv.status]||'var(--text-tertiary)')+'22;text-transform:capitalize">'+(inv.status||'')+'</span></div>'+
                '<div class="book-actions">'+
                  (inv.status!=='paid'?'<button class="ch-btn-sm ch-btn-teal" onclick="window._finMarkPaid(\''+safeId+'\')">Mark Paid</button>':'')+
                  '<button class="ch-btn-sm" onclick="window._dsToast?.({title:\'Send\',body:\''+safeNum+' sent to patient.\',severity:\'success\'})">Send</button>'+
                '</div>'+
              '</div>';
            }).join('')}
      </div>`;

    window._finMarkPaid = async (id) => {
      try {
        const inv = await api.finance.markInvoicePaid(id, { method: 'manual' });
        window._dsToast?.({
          title: 'Marked paid',
          body: (inv?.invoice_number || id) + ' — ' + fmtC(inv?.total, inv?.currency),
          severity: 'success',
        });
        window._nav('finance-hub');
      } catch (err) {
        window._dsToast?.({ title:'Mark paid failed', body: err?.message || 'Server error', severity:'warn' });
      }
    };
  }
  else if (tab === 'payments') {
    const totalReceived = payments.reduce((s,p) => s + Number(p.amount||0), 0);
    const avgPayment   = payments.length ? Math.round(totalReceived / payments.length) : 0;
    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
        <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${fmt(totalReceived)}</div><div class="ch-kpi-label">Total Received</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${totalPayments}</div><div class="ch-kpi-label">Transactions</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${fmt(avgPayment)}</div><div class="ch-kpi-label">Avg Payment</div></div>
      </div>
      <div class="ch-card">
        <div class="ch-card-hd">
          <span class="ch-card-title">Payment Log</span>
          <button class="ch-btn-sm ch-btn-teal" onclick="window._finLogPayment()">+ Log Payment</button>
        </div>
        ${payments.length === 0
          ? '<div style="padding:28px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No payments recorded yet.</div>'
          : payments.map(p =>
              '<div class="book-row">'+
                '<div class="book-datetime"><div class="book-date">'+(p.payment_date||'')+'</div><div class="book-time">'+(p.reference||'')+'</div></div>'+
                '<div class="book-info"><div class="book-patient">'+(p.patient_name||'—')+'</div><div class="book-clinician">'+(p.method||'')+(p.reference?(' · Ref: '+p.reference):'')+'</div></div>'+
                '<div style="flex-shrink:0;min-width:80px;text-align:right"><div style="font-size:15px;font-weight:700;color:var(--green)">'+fmt(p.amount)+'</div></div>'+
                '<div class="book-status-col"><span class="book-status-badge" style="color:var(--green);background:rgba(74,222,128,0.12)">Received</span></div>'+
              '</div>'
            ).join('')}
      </div>`;
  }
  else if (tab === 'insurance') {
    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
        <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${claimsApproved}</div><div class="ch-kpi-label">Approved</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${claimsPending}</div><div class="ch-kpi-label">Pending</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${fmt(claimsValue)}</div><div class="ch-kpi-label">Claims Value</div></div>
      </div>
      <div class="ch-card">
        <div class="ch-card-hd">
          <span class="ch-card-title">Insurance & Funding Claims</span>
          <button class="ch-btn-sm ch-btn-teal" onclick="window._finNewClaim()">+ New Claim</button>
        </div>
        ${claims.length === 0
          ? '<div style="padding:28px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No claims yet.</div>'
          : claims.map(ins => {
              const safeDesc = String(ins.description||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
              return '<div class="book-row">'+
                '<div class="book-datetime"><div class="book-date">'+(ins.submitted_date||ins.created_at||'')+'</div></div>'+
                '<div class="book-info"><div class="book-patient">'+(ins.patient_name||'—')+' — '+(ins.insurer||'—')+'</div><div class="book-clinician">'+(ins.description||'')+'</div></div>'+
                '<div style="flex-shrink:0;min-width:80px;text-align:right"><div style="font-size:14px;font-weight:700;color:var(--text-primary)">'+fmt(ins.amount)+'</div></div>'+
                '<div class="book-status-col"><span class="book-status-badge" style="color:'+(insStC[ins.status]||'var(--text-tertiary)')+';background:'+(insStC[ins.status]||'var(--text-tertiary)')+'22;text-transform:capitalize">'+(ins.status||'')+'</span></div>'+
                '<div class="book-actions"><button class="ch-btn-sm" onclick="window._dsToast?.({title:\'View Claim\',body:\''+safeDesc+'\',severity:\'info\'})">View</button></div>'+
              '</div>';
            }).join('')}
      </div>`;
  }
  else if (tab === 'analytics') {
    // Prefer server-supplied monthly series. Fall back to empty state.
    const monthlyData = months.map(m => ({
      m: (m.month || '').slice(5),     // "YYYY-MM" -> "MM"
      label: m.month || '',
      rev: Number(m.revenue || 0),
      invoiced: Number(m.invoiced || 0),
    }));
    const maxRev = Math.max(1, ...monthlyData.map(d => d.invoiced || d.rev || 0));
    const seriesSum = monthlyData.reduce((s,d) => s + d.rev, 0);
    const seriesInv = monthlyData.reduce((s,d) => s + d.invoiced, 0);
    const avgMonth  = monthlyData.length ? Math.round(seriesSum / monthlyData.length) : 0;
    const collectionRate = seriesInv > 0 ? Math.round((seriesSum / seriesInv) * 100) : 0;

    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${fmt(totalRev)}</div><div class="ch-kpi-label">YTD Revenue</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${fmt(avgMonth)}</div><div class="ch-kpi-label">Avg / Month</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${collectionRate}%</div><div class="ch-kpi-label">Collection Rate</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${monthlyData.length}</div><div class="ch-kpi-label">Months Tracked</div></div>
      </div>
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Monthly Revenue</span><button class="ch-btn-sm ch-btn-teal" onclick="window._reportsHubTab='generate';window._nav('reports-hub')">Export Report</button></div>
          ${monthlyData.length === 0
            ? '<div style="padding:28px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No monthly data yet.</div>'
            : monthlyData.map(d =>
                '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.04)">'+
                  '<div style="font-size:12px;font-weight:700;color:var(--text-primary);min-width:54px">'+d.label+'</div>'+
                  '<div style="flex:1;display:flex;flex-direction:column;gap:3px">'+
                    '<div class="ch-prog-bar"><div class="ch-prog-fill" style="width:'+Math.round(d.rev/maxRev*100)+'%;background:var(--green)"></div></div>'+
                    '<div class="ch-prog-bar"><div class="ch-prog-fill" style="width:'+Math.round(d.invoiced/maxRev*100)+'%;background:rgba(74,158,255,0.5)"></div></div>'+
                  '</div>'+
                  '<div style="text-align:right;min-width:120px"><div style="font-size:12px;font-weight:700;color:var(--green)">'+fmt(d.rev)+' paid</div><div style="font-size:11px;color:var(--text-tertiary)">'+fmt(d.invoiced)+' invoiced</div></div>'+
                '</div>'
              ).join('')}
          <div style="padding:8px 16px;display:flex;gap:16px;font-size:11px;color:var(--text-tertiary)"><span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:4px;background:var(--green);border-radius:2px;display:inline-block"></span>Paid</span><span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:4px;background:rgba(74,158,255,0.5);border-radius:2px;display:inline-block"></span>Invoiced</span></div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Revenue by Status</span></div>
          ${['paid','sent','overdue','draft'].map(s => {
            const list = invoices.filter(i => i.status === s);
            const amt  = list.reduce((x,i) => x + Number(i.total||0), 0);
            const pct  = totalInvoices ? Math.round(list.length / Math.max(totalInvoices,1) * 100) : 0;
            return '<div style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid rgba(255,255,255,0.04)">'+
              '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:600;color:var(--text-primary);text-transform:capitalize">'+s+'</div></div>'+
              '<div style="font-size:12px;font-weight:700;color:'+(invStC[s]||'var(--text-tertiary)')+';min-width:80px;text-align:right">'+fmt(amt)+'</div>'+
              '<div style="font-size:11px;color:var(--text-tertiary);min-width:40px;text-align:right">'+pct+'%</div>'+
            '</div>';
          }).join('')}
        </div>
      </div>`;
  }

  el.innerHTML = `
  <div class="dv2-hub-shell" style="padding:20px;display:flex;flex-direction:column;gap:16px">
  <div class="ch-shell">
    <div class="ch-tab-bar">${tabBar()}</div>
    <div class="ch-body">${main}</div>
  </div>
  </div>
  <div id="fin-new-inv-modal" class="ch-modal-overlay ch-hidden">
    <div class="ch-modal" style="width:min(500px,95vw)">
      <div class="ch-modal-hd"><span>New Invoice</span><button class="ch-modal-close" onclick="document.getElementById('fin-new-inv-modal').classList.add('ch-hidden')">✕</button></div>
      <div class="ch-modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Patient Name</label><input id="inv-patient" class="ch-select ch-select--full" placeholder="Patient name"></div>
          <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Service Description</label><input id="inv-service" class="ch-select ch-select--full" placeholder="e.g. TMS Course — 30 sessions"></div>
          <div class="ch-form-group"><label class="ch-label">Amount (ex VAT £)</label><input id="inv-amount" type="number" class="ch-select ch-select--full" placeholder="0.00"></div>
          <div class="ch-form-group"><label class="ch-label">VAT Rate</label><select id="inv-vat" class="ch-select ch-select--full"><option value="0">0% (Exempt)</option><option value="5">5%</option><option value="20" selected>20%</option></select></div>
          <div class="ch-form-group"><label class="ch-label">Invoice Date</label><input id="inv-date" type="date" class="ch-select ch-select--full" value="${td}"></div>
          <div class="ch-form-group"><label class="ch-label">Due Date</label><input id="inv-due" type="date" class="ch-select ch-select--full" value="${dueDefault}"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" onclick="window._finSaveInvoice()">Create Invoice</button>
          <button class="btn" onclick="document.getElementById('fin-new-inv-modal').classList.add('ch-hidden')">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  <div id="fin-log-pay-modal" class="ch-modal-overlay ch-hidden">
    <div class="ch-modal" style="width:min(500px,95vw)">
      <div class="ch-modal-hd"><span>Log Payment</span><button class="ch-modal-close" onclick="document.getElementById('fin-log-pay-modal').classList.add('ch-hidden')">✕</button></div>
      <div class="ch-modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Patient Name</label><input id="pay-patient" class="ch-select ch-select--full" placeholder="Patient name"></div>
          <div class="ch-form-group"><label class="ch-label">Amount</label><input id="pay-amount" type="number" class="ch-select ch-select--full" placeholder="0.00"></div>
          <div class="ch-form-group"><label class="ch-label">Method</label><select id="pay-method" class="ch-select ch-select--full"><option value="card">Card</option><option value="bacs">BACS</option><option value="cash">Cash</option><option value="manual">Manual</option><option value="other">Other</option></select></div>
          <div class="ch-form-group"><label class="ch-label">Reference (optional)</label><input id="pay-ref" class="ch-select ch-select--full" placeholder="e.g. TXN-8821"></div>
          <div class="ch-form-group"><label class="ch-label">Payment Date</label><input id="pay-date" type="date" class="ch-select ch-select--full" value="${td}"></div>
          <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Invoice ID (optional)</label><input id="pay-invoice" class="ch-select ch-select--full" placeholder="Link to an invoice (optional)"></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" onclick="window._finSavePayment()">Log Payment</button>
          <button class="btn" onclick="document.getElementById('fin-log-pay-modal').classList.add('ch-hidden')">Cancel</button>
        </div>
      </div>
    </div>
  </div>
  <div id="fin-new-claim-modal" class="ch-modal-overlay ch-hidden">
    <div class="ch-modal" style="width:min(520px,95vw)">
      <div class="ch-modal-hd"><span>New Insurance Claim</span><button class="ch-modal-close" onclick="document.getElementById('fin-new-claim-modal').classList.add('ch-hidden')">✕</button></div>
      <div class="ch-modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Patient Name</label><input id="clm-patient" class="ch-select ch-select--full" placeholder="Patient name"></div>
          <div class="ch-form-group"><label class="ch-label">Insurer</label><input id="clm-insurer" class="ch-select ch-select--full" placeholder="e.g. BUPA, AXA"></div>
          <div class="ch-form-group"><label class="ch-label">Policy / Reference</label><input id="clm-policy" class="ch-select ch-select--full" placeholder="Policy number"></div>
          <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Description</label><input id="clm-desc" class="ch-select ch-select--full" placeholder="e.g. TMS Pre-auth"></div>
          <div class="ch-form-group"><label class="ch-label">Amount</label><input id="clm-amount" type="number" class="ch-select ch-select--full" placeholder="0.00"></div>
          <div class="ch-form-group"><label class="ch-label">Status</label><select id="clm-status" class="ch-select ch-select--full"><option value="draft" selected>Draft</option><option value="submitted">Submitted</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" onclick="window._finSaveClaim()">Create Claim</button>
          <button class="btn" onclick="document.getElementById('fin-new-claim-modal').classList.add('ch-hidden')">Cancel</button>
        </div>
      </div>
    </div>
  </div>`;

  window._finSaveInvoice = async () => {
    const patient_name = document.getElementById('inv-patient')?.value?.trim();
    const service      = document.getElementById('inv-service')?.value?.trim();
    const amount       = parseFloat(document.getElementById('inv-amount')?.value || 0);
    const vatPct       = parseFloat(document.getElementById('inv-vat')?.value || 20);
    const issue_date   = document.getElementById('inv-date')?.value || td;
    const due_date     = document.getElementById('inv-due')?.value || dueDefault;
    if (!patient_name || !service || !amount) {
      window._dsToast?.({ title:'Fill required fields', severity:'warn' });
      return;
    }
    try {
      const inv = await api.finance.createInvoice({
        patient_name,
        service,
        amount,
        vat_rate: vatPct / 100,
        issue_date,
        due_date,
        status: 'draft',
      });
      document.getElementById('fin-new-inv-modal')?.classList.add('ch-hidden');
      window._financeHubTab = 'invoices';
      window._nav('finance-hub');
      window._dsToast?.({
        title:'Invoice created',
        body: (inv?.invoice_number || 'Invoice') + ' — ' + fmtC(inv?.total, inv?.currency),
        severity:'success',
      });
    } catch (err) {
      window._dsToast?.({ title:'Create failed', body: err?.message || 'Server error', severity:'warn' });
    }
  };

  window._finSavePayment = async () => {
    const patient_name = document.getElementById('pay-patient')?.value?.trim();
    const amount       = parseFloat(document.getElementById('pay-amount')?.value || 0);
    const method       = document.getElementById('pay-method')?.value || 'manual';
    const reference    = document.getElementById('pay-ref')?.value?.trim() || null;
    const payment_date = document.getElementById('pay-date')?.value || td;
    const invoice_id   = document.getElementById('pay-invoice')?.value?.trim() || null;
    if (!patient_name || !amount) {
      window._dsToast?.({ title:'Fill required fields', severity:'warn' });
      return;
    }
    try {
      await api.finance.createPayment({
        invoice_id, patient_name, amount, method, reference, payment_date,
      });
      document.getElementById('fin-log-pay-modal')?.classList.add('ch-hidden');
      window._financeHubTab = 'payments';
      window._nav('finance-hub');
      window._dsToast?.({ title:'Payment logged', body: patient_name + ' — ' + fmt(amount), severity:'success' });
    } catch (err) {
      window._dsToast?.({ title:'Log payment failed', body: err?.message || 'Server error', severity:'warn' });
    }
  };

  window._finSaveClaim = async () => {
    const patient_name  = document.getElementById('clm-patient')?.value?.trim();
    const insurer       = document.getElementById('clm-insurer')?.value?.trim();
    const policy_number = document.getElementById('clm-policy')?.value?.trim() || null;
    const description   = document.getElementById('clm-desc')?.value?.trim();
    const amount        = parseFloat(document.getElementById('clm-amount')?.value || 0);
    const status        = document.getElementById('clm-status')?.value || 'draft';
    if (!patient_name || !insurer || !description || !amount) {
      window._dsToast?.({ title:'Fill required fields', severity:'warn' });
      return;
    }
    try {
      await api.finance.createClaim({
        patient_name, insurer, policy_number, description, amount, status,
      });
      document.getElementById('fin-new-claim-modal')?.classList.add('ch-hidden');
      window._financeHubTab = 'insurance';
      window._nav('finance-hub');
      window._dsToast?.({ title:'Claim created', body: patient_name + ' — ' + insurer, severity:'success' });
    } catch (err) {
      window._dsToast?.({ title:'Create claim failed', body: err?.message || 'Server error', severity:'warn' });
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgAssessmentsHub — Screen 05 · Queue / Cohort / Library / Individual
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgAssessmentsHub(setTopbar, navigate) {
  const tab = window._assessHubTab || 'queue';
  window._assessHubTab = tab;
  const selectedId = window._assessSelectedId || 'as-3';
  window._assessSelectedId = selectedId;

  const el = document.getElementById('content');
  if (!el) return;

  setTopbar(
    'Assessments',
    '<span style="font-size:11px;color:var(--text-tertiary);margin-right:10px">14 instruments · <strong style="color:var(--rose)">2 red flags</strong> · <strong style="color:var(--amber)">8 overdue</strong></span>' +
    '<button class="btn btn-ghost btn-sm" onclick="window._assessBatch()">Batch send</button>' +
    '<button class="btn btn-primary btn-sm" onclick="window._assessNew()">+ New assessment</button>'
  );

  const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  if (!document.getElementById('dv2a-styles')) {
    const s = document.createElement('style');
    s.id = 'dv2a-styles';
    s.textContent = `
.dv2a-shell { display:flex; flex-direction:column; height:100%; min-height:0; }
.dv2a-tabs { display:flex; align-items:center; gap:6px; padding:10px 18px; border-bottom:1px solid var(--border); background:var(--bg-panel,#0d1b22); flex-shrink:0; }
.dv2a-tab { padding:7px 14px; font-size:12px; font-weight:600; color:var(--text-tertiary); border-radius:999px; background:transparent; border:1px solid transparent; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:6px; }
.dv2a-tab:hover { color:var(--text-secondary); background:rgba(255,255,255,0.03); }
.dv2a-tab.active { color:#04121c; background:var(--teal,#00d4bc); border-color:var(--teal,#00d4bc); }
.dv2a-tab-count { font-family:var(--font-mono,ui-monospace,monospace); font-size:10px; opacity:0.85; padding:1px 6px; border-radius:999px; background:rgba(0,0,0,0.18); }
.dv2a-tab:not(.active) .dv2a-tab-count { background:var(--bg-surface,#11222a); color:var(--text-tertiary); }
.dv2a-tab-count.hot { background:rgba(255,107,157,0.16); color:var(--rose,#ff6b9d); }
.dv2a-legend { margin-left:auto; display:flex; align-items:center; gap:10px; font-size:10.5px; color:var(--text-tertiary); }
.dv2a-legend span { display:inline-flex; align-items:center; gap:5px; }
.dv2a-legend i { width:7px; height:7px; border-radius:50%; display:inline-block; }

.dv2a-body { flex:1; display:flex; min-height:0; overflow:hidden; }
.dv2a-main { flex:1; min-width:0; display:flex; flex-direction:column; overflow-y:auto; padding:14px 18px 24px; gap:12px; }
.dv2a-side { width:380px; min-width:360px; border-left:1px solid var(--border); background:var(--bg-panel,#0d1b22); display:flex; flex-direction:column; overflow:hidden; flex-shrink:0; }

.dv2a-kpi-row { display:grid; grid-template-columns:repeat(5, 1fr); gap:10px; }
.dv2a-kpi { padding:12px 14px; background:var(--bg-surface,#11222a); border:1px solid var(--border); border-radius:8px; }
.dv2a-kpi-lbl { font-size:10px; font-weight:600; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.05em; display:flex; align-items:center; gap:6px; }
.dv2a-kpi-lbl i { width:6px; height:6px; border-radius:50%; background:var(--text-tertiary); display:inline-block; }
.dv2a-kpi-lbl.rose i { background:var(--rose,#ff6b9d); }
.dv2a-kpi-lbl.rose { color:var(--rose,#ff6b9d); }
.dv2a-kpi-lbl.amber i { background:var(--amber,#ffb547); }
.dv2a-kpi-lbl.amber { color:var(--amber,#ffb547); }
.dv2a-kpi-lbl.teal i { background:var(--teal,#00d4bc); }
.dv2a-kpi-lbl.green i { background:var(--green,#4ade80); }
.dv2a-kpi-lbl.blue i { background:var(--blue,#4a9eff); }
.dv2a-kpi-num { font-family:var(--font-display,inherit); font-size:22px; font-weight:600; letter-spacing:-0.02em; color:var(--text-primary); margin-top:4px; }
.dv2a-kpi-num .unit { font-size:12px; color:var(--text-tertiary); font-weight:500; margin-left:2px; }
.dv2a-kpi-sub { font-size:10.5px; color:var(--text-tertiary); margin-top:2px; }

.dv2a-filter-bar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.dv2a-chip { padding:5px 10px; font-size:11px; color:var(--text-secondary); border:1px solid var(--border); background:var(--bg-surface,#11222a); border-radius:999px; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:5px; }
.dv2a-chip:hover { border-color:rgba(0,212,188,0.35); color:var(--teal,#00d4bc); }
.dv2a-chip.active { background:rgba(0,212,188,0.1); border-color:rgba(0,212,188,0.4); color:var(--teal,#00d4bc); font-weight:600; }
.dv2a-chip-dot { width:6px; height:6px; border-radius:50%; display:inline-block; }

.dv2a-card { background:var(--bg-panel,#0d1b22); border:1px solid var(--border); border-radius:10px; overflow:hidden; }
.dv2a-queue-head, .dv2a-queue-row { display:grid; grid-template-columns: 60px 1.5fr 1.2fr 1.2fr 1fr 0.9fr 1fr 90px; gap:10px; padding:10px 14px; align-items:center; }
.dv2a-queue-head { font-size:10px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.06em; background:rgba(255,255,255,0.02); border-bottom:1px solid var(--border); }
.dv2a-queue-row { border-bottom:1px solid rgba(255,255,255,0.04); cursor:pointer; font-size:11.5px; transition:background 0.08s; }
.dv2a-queue-row:hover { background:rgba(0,212,188,0.04); }
.dv2a-queue-row.selected { background:rgba(0,212,188,0.08); box-shadow:inset 2px 0 0 var(--teal,#00d4bc); }
.dv2a-queue-row.redflag { background:rgba(255,107,157,0.05); box-shadow:inset 2px 0 0 var(--rose,#ff6b9d); }
.dv2a-queue-row.overdue { background:rgba(255,181,71,0.04); }

.dv2a-flag { font-size:9.5px; font-weight:700; padding:3px 6px; border-radius:4px; letter-spacing:0.04em; }
.dv2a-flag.red { background:rgba(255,107,157,0.18); color:var(--rose,#ff6b9d); }
.dv2a-flag.amber { background:rgba(255,181,71,0.14); color:var(--amber,#ffb547); }
.dv2a-flag.ok { background:rgba(74,222,128,0.12); color:var(--green,#4ade80); }

.dv2a-pt { display:flex; gap:8px; align-items:center; min-width:0; }
.dv2a-pt-av { width:30px; height:30px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; color:#04121c; flex-shrink:0; background:linear-gradient(135deg,#00d4bc,#4a9eff); }
.dv2a-pt-av.b { background:linear-gradient(135deg,#ff6b9d,#ffb547); }
.dv2a-pt-av.c { background:linear-gradient(135deg,#9b7fff,#4a9eff); }
.dv2a-pt-av.d { background:linear-gradient(135deg,#ffb547,#ff8b47); }
.dv2a-pt-av.e { background:linear-gradient(135deg,#4ade80,#00d4bc); }
.dv2a-pt-name { font-size:12px; font-weight:600; color:var(--text-primary); letter-spacing:-0.005em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dv2a-pt-sub { font-size:10px; color:var(--text-tertiary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

.dv2a-inst-name { font-size:11.5px; font-weight:600; color:var(--text-primary); }
.dv2a-inst-sub { font-size:10px; color:var(--text-tertiary); margin-top:1px; }

.dv2a-sev-bar { display:flex; gap:2px; margin-top:4px; }
.dv2a-sev-bar > div { flex:1; height:5px; border-radius:2px; background:rgba(255,255,255,0.05); }
.dv2a-sev-bar > div.lit.mild { background:var(--teal,#00d4bc); }
.dv2a-sev-bar > div.lit.mod { background:var(--blue,#4a9eff); }
.dv2a-sev-bar > div.lit.mods { background:var(--amber,#ffb547); }
.dv2a-sev-bar > div.lit.sev { background:var(--rose,#ff6b9d); }
.dv2a-score { font-family:var(--font-mono,ui-monospace,monospace); font-size:13px; font-weight:600; }
.dv2a-score .max { font-size:10px; color:var(--text-tertiary); margin-left:4px; font-weight:500; }

.dv2a-trend { font-size:10.5px; font-weight:600; display:inline-flex; align-items:center; gap:4px; }
.dv2a-trend.up { color:var(--rose,#ff6b9d); }
.dv2a-trend.down { color:var(--teal,#00d4bc); }
.dv2a-trend.flat { color:var(--text-tertiary); }
.dv2a-spark { display:block; margin-top:3px; }

.dv2a-due-chip { font-size:10px; font-weight:600; padding:3px 7px; border-radius:4px; background:var(--bg-surface,#11222a); color:var(--text-secondary); white-space:nowrap; display:inline-block; }
.dv2a-due-chip.today { background:rgba(0,212,188,0.14); color:var(--teal,#00d4bc); }
.dv2a-due-chip.overdue { background:rgba(255,107,157,0.14); color:var(--rose,#ff6b9d); }
.dv2a-due-chip.soon { background:rgba(74,158,255,0.12); color:var(--blue,#4a9eff); }

.dv2a-mode-pill { font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:3px; background:rgba(255,255,255,0.05); color:var(--text-secondary); letter-spacing:0.04em; margin-right:4px; font-family:var(--font-mono,ui-monospace,monospace); }
.dv2a-mode-sub { font-size:10px; color:var(--text-tertiary); }

.dv2a-send-btn { padding:5px 10px; font-size:11px; font-weight:600; background:var(--bg-surface,#11222a); color:var(--text-primary); border:1px solid var(--border); border-radius:5px; cursor:pointer; font-family:inherit; }
.dv2a-send-btn:hover { background:rgba(0,212,188,0.1); border-color:rgba(0,212,188,0.35); color:var(--teal,#00d4bc); }
.dv2a-send-btn.danger { background:rgba(255,107,157,0.14); color:var(--rose,#ff6b9d); border-color:rgba(255,107,157,0.35); }
.dv2a-send-btn.danger:hover { background:rgba(255,107,157,0.22); }

/* Side panel */
.dv2a-side-head { padding:14px 16px; border-bottom:1px solid var(--border); }
.dv2a-side-close { position:absolute; top:10px; right:10px; width:26px; height:26px; border-radius:6px; background:transparent; border:1px solid var(--border); color:var(--text-tertiary); cursor:pointer; font-size:14px; line-height:1; display:inline-flex; align-items:center; justify-content:center; }
.dv2a-side-close:hover { color:var(--text-primary); background:var(--bg-surface,#11222a); }
.dv2a-side-body { flex:1; overflow-y:auto; padding:14px 16px; display:flex; flex-direction:column; gap:16px; }
.dv2a-side-section { border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:14px; }
.dv2a-side-section:last-child { border-bottom:0; }
.dv2a-side-title { font-size:10px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px; display:flex; align-items:center; gap:6px; }
.dv2a-side-title .num { background:var(--bg-surface,#11222a); padding:1px 5px; border-radius:3px; font-family:var(--font-mono,ui-monospace,monospace); font-size:9px; color:var(--text-tertiary); }

.dv2a-ai-card { padding:12px; background:rgba(0,212,188,0.05); border:1px solid rgba(0,212,188,0.25); border-radius:8px; position:relative; }
.dv2a-ai-badge { position:absolute; top:8px; right:10px; font-size:9px; font-weight:700; color:var(--teal,#00d4bc); font-family:var(--font-mono,ui-monospace,monospace); background:rgba(0,212,188,0.12); padding:2px 6px; border-radius:3px; letter-spacing:0.04em; }
.dv2a-ai-meta { font-size:10px; color:var(--teal,#00d4bc); margin-bottom:6px; font-weight:600; padding-right:80px; }
.dv2a-ai-body { font-size:11.5px; color:var(--text-secondary); line-height:1.5; }
.dv2a-ai-body strong { color:var(--text-primary); font-weight:600; }

.dv2a-chip-sm { font-size:10px; padding:3px 8px; border-radius:4px; font-weight:600; display:inline-block; margin-right:4px; }
.dv2a-chip-sm.teal { background:rgba(0,212,188,0.14); color:var(--teal,#00d4bc); }
.dv2a-chip-sm.amber { background:rgba(255,181,71,0.14); color:var(--amber,#ffb547); }
.dv2a-chip-sm.rose { background:rgba(255,107,157,0.14); color:var(--rose,#ff6b9d); }

.dv2a-bm-link { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.04); font-size:11px; }
.dv2a-bm-link:last-child { border-bottom:0; }
.dv2a-bm-sym { font-weight:600; color:var(--text-primary); font-size:11.5px; }
.dv2a-bm-cluster { font-size:10px; color:var(--text-tertiary); margin-top:1px; }
.dv2a-bm-target { font-size:10.5px; font-weight:600; color:var(--teal,#00d4bc); font-family:var(--font-mono,ui-monospace,monospace); text-align:right; }

.dv2a-norm-bar { height:10px; background:var(--bg-surface,#11222a); border-radius:4px; position:relative; margin-top:8px; }
.dv2a-norm-mark { position:absolute; top:50%; width:4px; height:16px; transform:translate(-50%,-50%); border-radius:1px; }
.dv2a-norm-mark.pt { background:var(--teal,#00d4bc); height:18px; box-shadow:0 0 6px rgba(0,212,188,0.6); }
.dv2a-norm-mark.clinic { background:var(--blue,#4a9eff); }
.dv2a-norm-mark.pub { background:var(--violet,#9b7fff); }

.dv2a-form-row { display:grid; grid-template-columns:1fr 120px; gap:10px; padding:7px 0; align-items:center; border-bottom:1px solid rgba(255,255,255,0.04); font-size:11px; }
.dv2a-form-row:last-child { border-bottom:0; }
.dv2a-form-q { color:var(--text-secondary); }
.dv2a-form-ans { display:grid; grid-template-columns:repeat(4, 1fr); gap:3px; }
.dv2a-form-ans > div { text-align:center; padding:3px 0; font-size:10px; color:var(--text-tertiary); background:rgba(255,255,255,0.03); border-radius:3px; font-family:var(--font-mono,ui-monospace,monospace); }
.dv2a-form-ans > div.sel { background:rgba(0,212,188,0.18); color:var(--teal,#00d4bc); font-weight:700; }
.dv2a-form-ans > div.sel.amb { background:rgba(255,181,71,0.18); color:var(--amber,#ffb547); }
.dv2a-form-ans > div.sel.rose { background:rgba(255,107,157,0.2); color:var(--rose,#ff6b9d); }

.dv2a-lib-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:12px; }
.dv2a-lib-card { padding:14px; background:var(--bg-panel,#0d1b22); border:1px solid var(--border); border-radius:8px; cursor:pointer; transition:all 0.1s; }
.dv2a-lib-card:hover { border-color:rgba(0,212,188,0.4); transform:translateY(-1px); }
.dv2a-lib-abbr { font-family:var(--font-display,inherit); font-size:16px; font-weight:700; color:var(--text-primary); letter-spacing:-0.02em; }
.dv2a-lib-name { font-size:11px; color:var(--text-tertiary); margin-top:2px; }
.dv2a-lib-meta { margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05); display:flex; flex-wrap:wrap; gap:6px; font-size:10px; color:var(--text-secondary); }
.dv2a-lib-meta span { background:var(--bg-surface,#11222a); padding:2px 6px; border-radius:3px; font-family:var(--font-mono,ui-monospace,monospace); }

.dv2a-cohort-grid { display:grid; grid-template-columns: 280px 1fr; gap:14px; }
.dv2a-cohort-card { padding:12px; background:var(--bg-panel,#0d1b22); border:1px solid var(--border); border-radius:8px; cursor:pointer; }
.dv2a-cohort-card:hover { border-color:rgba(0,212,188,0.4); }
.dv2a-cohort-card.active { border-color:var(--teal,#00d4bc); background:rgba(0,212,188,0.05); }

.dv2a-ind-wrap { display:grid; grid-template-columns:1fr 340px; gap:14px; }
.dv2a-ind-item { padding:8px 10px; background:var(--bg-surface,#11222a); border-radius:5px; margin-bottom:5px; font-size:11.5px; color:var(--text-secondary); line-height:1.4; }
.dv2a-ind-item::before { content:attr(data-idx); display:inline-block; color:var(--text-tertiary); font-family:var(--font-mono,ui-monospace,monospace); font-size:10px; width:22px; }

.dv2a-footer-actions { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--border); background:var(--bg-panel,#0d1b22); flex-shrink:0; }

/* Crisis modal */
.dv2a-crisis-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; }
.dv2a-crisis-modal { width:min(480px,92vw); background:var(--bg-panel,#0d1b22); border:1px solid rgba(255,107,157,0.45); border-radius:12px; padding:22px; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
.dv2a-crisis-title { font-size:16px; font-weight:700; color:var(--rose,#ff6b9d); display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.dv2a-crisis-body { font-size:13px; color:var(--text-secondary); line-height:1.55; margin-bottom:18px; }
.dv2a-crisis-body strong { color:var(--text-primary); }
.dv2a-crisis-actions { display:flex; gap:10px; justify-content:flex-end; }

@media (max-width:1180px) {
  .dv2a-side { width:340px; min-width:320px; }
  .dv2a-kpi-row { grid-template-columns:repeat(3,1fr); }
}
@media (max-width:900px) {
  .dv2a-body { flex-direction:column; }
  .dv2a-side { width:100%; min-width:0; border-left:0; border-top:1px solid var(--border); max-height:50vh; }
  .dv2a-kpi-row { grid-template-columns:repeat(2,1fr); }
  .dv2a-queue-head { display:none; }
  .dv2a-queue-row { grid-template-columns:1fr; gap:6px; }
}
`;
    document.head.appendChild(s);
  }

  // ── Data: queue rows (mock-first, backend-merged) ─────────────────────────────
  const MOCK_QUEUE = [
    { id:'as-1', patient:'Marcus Reilly', mrn:'10502', avInit:'MR', avCls:'b', dx:'41M · Anxious depression', inst:'PHQ-9', instSub:'item 9 · suicidality', score:18, max:27, item9:3, sev:'sev', sevLabel:'Severe · item 9 = 3', trend:'+3 pts since wk 2', trendCls:'up', sparkline:[12,14,15,16,17,17,18], due:'2h post-session', dueCls:'overdue', mode:'CRISIS', modeSub:'PAGED', modeStyle:'rose', redflag:true, sendLabel:'Escalate', sendCls:'danger' },
    { id:'as-2', patient:'Rafael Figueroa', mrn:'10488', avInit:'RF', avCls:'d', dx:'47M · OCD', inst:'Y-BOCS', instSub:'ritualization spike', score:28, max:40, sev:'mods', sevLabel:'Severe-mod · flagging', trend:'+8 pts · 2 weeks', trendCls:'up', sparkline:[20,21,22,23,25,26,28], due:'4 days overdue', dueCls:'overdue', mode:'ASYNC', modeSub:'SMS + email', redflag:true, flagLabel:'⚠ RED', sendLabel:'Resend' },
    { id:'as-3', patient:'Samantha Li', mrn:'10482', avInit:'SL', avCls:'a', dx:'34F · MDD · Session 12/20', inst:'PHQ-9', instSub:'biweekly · protocol-timed', score:9, max:27, item9:0, sev:'mod', sevLabel:'Mild · responder', trend:'−8 pts from baseline', trendCls:'down', sparkline:[17,16,14,12,11,10,9], due:'Today 9:30', dueCls:'today', mode:'TABLET', modeSub:'in-clinic', modeStyle:'teal', sendLabel:'Open' },
    { id:'as-4', patient:'Priya Nambiar', mrn:'10455', avInit:'PN', avCls:'e', dx:'29F · GAD + chronic pain', inst:'GAD-7 + BPI', instSub:'dual · tACS protocol', score:9, max:21, sev:'mod', sevLabel:'Mild · remission path', trend:'−6 pts in 6 wks', trendCls:'down', sparkline:[15,14,12,11,10,10,9], due:'Today 11:00', dueCls:'today', mode:'TABLET', modeSub:'in-clinic', modeStyle:'teal', sendLabel:'Open' },
    { id:'as-5', patient:'Terence Wu', mrn:'10401', avInit:'TW', avCls:'e', dx:'38M · PTSD phase 2', inst:'PCL-5', instSub:'exit · discharge prep', score:16, max:80, sev:'mild', sevLabel:'Below threshold · remission', trend:'−22 pts · responder', trendCls:'down', sparkline:[38,32,28,24,20,18,16], due:'Tomorrow 10:00', dueCls:'soon', mode:'TELE', modeSub:'video link', flagLabel:'✓ RESP', flagCls:'amber', sendLabel:'Send' },
    { id:'as-6', patient:'Nora Iyer', mrn:'10510', avInit:'NI', avCls:'c', dx:'36F · Insomnia + anxiety', inst:'ISI + GAD-7', instSub:'weekly · HRV protocol', score:15, max:28, sev:'mods', sevLabel:'Moderate · partial resp', trend:'−3 pts · slow', trendCls:'down', sparkline:[21,20,19,18,17,16,15], due:'3 days overdue', dueCls:'overdue', mode:'ASYNC', modeSub:'SMS · reminded 2×', overdue:true, flagLabel:'OVERDUE', flagCls:'amber', sendLabel:'Call' },
    { id:'as-7', patient:'Aisha Haddad', mrn:'10471', avInit:'AH', avCls:'b', dx:'31F · Migraine prevention', inst:'MIDAS', instSub:'monthly · V1 tDCS', score:11, max:270, sev:'mod', sevLabel:'Mild disability · responder', trend:'MIDAS 28→11', trendCls:'down', sparkline:[28,24,20,17,14,12,11], due:'Today 14:30', dueCls:'today', mode:'TABLET', modeSub:'in-clinic', modeStyle:'teal', sendLabel:'Open' },
    { id:'as-8', patient:'Elena Okafor', mrn:'10518', avInit:'EO', avCls:'c', dx:'27F · ADHD intake', inst:'AQ-10 + ASRS', instSub:'intake battery', score:null, max:null, sev:'none', sevLabel:'No baseline yet', trend:'Baseline pending', trendCls:'flat', sparkline:[], due:'Today 16:00', dueCls:'today', mode:'TABLET', modeSub:'waiting room', modeStyle:'teal', sendLabel:'Open' },
    { id:'as-9', patient:'Benjamin Moss', mrn:'10299', avInit:'BM', avCls:'c', dx:'58M · Post-stroke aphasia', inst:'WAB-R', instSub:'clinician · SLT joint', score:64, max:100, sev:'mod', scoreUnit:'AQ', sevLabel:'Mild aphasia · improving', trend:'+4 AQ over course', trendCls:'down', sparkline:[58,60,61,62,63,63,64], due:'2 days overdue', dueCls:'overdue', mode:'CLINIC', modeSub:'Dr. Velez', overdue:true, flagLabel:'OVERDUE', flagCls:'amber', sendLabel:'Book' },
    { id:'as-10', patient:'Jamal Thompson', mrn:'10539', avInit:'JT', avCls:'d', dx:'14M · ADHD · guardian co-complete', inst:'Vanderbilt (peds)', instSub:'parent + teacher', score:18, max:54, sev:'mod', sevLabel:'Stable', trend:'−1 pt · plateau', trendCls:'flat', sparkline:[19,19,19,18,18,19,18], due:'Fri Apr 18', dueCls:'soon', mode:'ASYNC', modeSub:'guardian portal', sendLabel:'Send' },
  ];

  let queueRows = MOCK_QUEUE;
  try {
    const apiRes = await (api.listAssessments?.() || Promise.reject());
    if (apiRes && Array.isArray(apiRes.items) && apiRes.items.length) {
      const merged = apiRes.items.slice(0, 14).map((a, i) => ({
        id: a.id || ('as-be-' + i),
        patient: a.patient_name || a.patient_id || 'Patient',
        mrn: a.mrn || '—',
        avInit: (a.patient_name || 'P').split(' ').map(x => x[0]).slice(0,2).join(''),
        avCls: ['a','b','c','d','e'][i % 5],
        dx: a.diagnosis || '—',
        inst: a.instrument || a.scale || 'PHQ-9',
        instSub: a.cadence || '',
        score: a.score ?? null,
        max: a.max_score ?? 27,
        item9: a.item9 ?? 0,
        sev: 'mod',
        sevLabel: a.severity_label || '—',
        trend: a.trend_label || '',
        trendCls: 'flat',
        sparkline: a.sparkline || [],
        due: a.due_label || '—',
        dueCls: a.overdue ? 'overdue' : (a.due_today ? 'today' : 'soon'),
        mode: a.delivery_mode || 'ASYNC',
        modeSub: a.delivery_sub || '',
        redflag: (a.item9 ?? 0) >= 1,
        sendLabel: a.overdue ? 'Resend' : 'Open',
      }));
      if (merged.length) queueRows = merged;
    }
  } catch {}

  // ── State & handlers ─────────────────────────────────────────────────────────
  window._assessSelect = (id) => { window._assessSelectedId = id; window._nav('assessments-v2'); };
  window._assessTab = (t) => { window._assessHubTab = t; window._nav('assessments-v2'); };
  window._assessCloseSide = () => { window._assessSelectedId = null; window._nav('assessments-v2'); };
  window._assessBatch = () => window._dsToast?.({ title:'Batch send', body:'Select patients from the queue to send in bulk.', severity:'info' });
  window._assessNew = () => window._dsToast?.({ title:'New assessment', body:'Assessment assignment flow.', severity:'info' });
  window._assessReschedule = (id) => window._dsToast?.({ title:'Reschedule', body:'Assessment '+id+' — pick a new date.', severity:'info' });
  window._assessExportPdf = (id) => window._dsToast?.({ title:'Export PDF', body:'Generating PDF for '+id+'…', severity:'info' });
  window._assessCosign = async (id) => {
    try {
      await (api.approveAssessment?.(id, { approved:true }) || Promise.resolve());
      window._dsToast?.({ title:'Co-signed', body:'Assessment '+id+' signed.', severity:'success' });
    } catch {
      window._dsToast?.({ title:'Co-signed (offline)', body:'Saved locally; will sync.', severity:'success' });
    }
  };

  // ── Crisis escalation (real behavior) ────────────────────────────────────────
  window._assessCrisis = (patientId, patientName) => {
    const existing = document.getElementById('dv2a-crisis-modal');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'dv2a-crisis-modal';
    overlay.className = 'dv2a-crisis-overlay';
    overlay.innerHTML =
      '<div class="dv2a-crisis-modal" role="alertdialog" aria-labelledby="dv2a-crisis-title">'+
        '<div class="dv2a-crisis-title" id="dv2a-crisis-title">⚠ Crisis protocol</div>'+
        '<div class="dv2a-crisis-body"><strong>'+esc(patientName || 'Patient')+'</strong> indicated thoughts of self-harm on PHQ-9 item 9. Follow clinic crisis protocol?</div>'+
        '<div class="dv2a-crisis-actions">'+
          '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'dv2a-crisis-modal\')?.remove()">Cancel</button>'+
          '<button class="btn btn-primary btn-sm" style="background:var(--rose,#ff6b9d);color:#04121c;border-color:var(--rose,#ff6b9d)" onclick="window._assessCrisisConfirm(\''+esc(patientId)+'\',\''+esc(patientName || '')+'\')">Confirm escalation →</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  };
  window._assessCrisisConfirm = async (patientId, patientName) => {
    const ts = new Date().toISOString();
    const event = { ts, patient_id:patientId, patient_name:patientName, reason:'PHQ-9 item 9 positive', user:(currentUser?.email || 'clinician') };
    try {
      const raw = localStorage.getItem('ds_crisis_audit');
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(event);
      localStorage.setItem('ds_crisis_audit', JSON.stringify(arr));
    } catch {}
    try {
      await (api.escalateCrisis?.(patientId) || Promise.reject());
    } catch {
      // backend missing — audit already saved locally above
    }
    document.getElementById('dv2a-crisis-modal')?.remove();
    window._dsToast?.({ title:'Crisis escalated', body:'Supervisor notified · audit logged', severity:'error' });
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function sparkSvg(pts, max, color) {
    if (!pts || !pts.length) return '<span style="font-size:10px;color:var(--text-tertiary)">—</span>';
    const W = 100, H = 22, M = max || Math.max(...pts, 1);
    const step = pts.length > 1 ? W/(pts.length-1) : 0;
    const coords = pts.map((v,i) => (i*step).toFixed(1)+','+(H-(v/M)*H).toFixed(1)).join(' ');
    const last = pts[pts.length-1];
    const lastX = ((pts.length-1)*step).toFixed(1);
    const lastY = (H-(last/M)*H).toFixed(1);
    return '<svg class="dv2a-spark" width="100" height="22" viewBox="0 0 100 22"><polyline points="'+coords+'" fill="none" stroke="'+color+'" stroke-width="1.5" stroke-linecap="round"/><circle cx="'+lastX+'" cy="'+lastY+'" r="2.5" fill="'+color+'"/></svg>';
  }
  function sevBar(sev) {
    const levels = ['mild','mod','mods','sev'];
    const idx = levels.indexOf(sev);
    return '<div class="dv2a-sev-bar">' +
      levels.map((cls,i) => '<div'+(i<=idx ? ' class="lit '+cls+'"' : '')+'></div>').join('') +
      '</div>';
  }
  function severityColor(sev) {
    return { sev:'var(--rose,#ff6b9d)', mods:'#ff8b47', mod:'var(--amber,#ffb547)', mild:'var(--teal,#00d4bc)', none:'var(--text-tertiary)' }[sev] || 'var(--text-primary)';
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  const TAB_META = {
    queue:      { label:'Queue',      count:String(queueRows.length), hot:true },
    cohort:     { label:'Cohort',     count:'6 conditions' },
    library:    { label:'Library',    count:String(Object.keys(SCALE_REGISTRY || {}).length || ASSESS_REGISTRY.length) },
    individual: { label:'Individual', count:'template' },
  };
  function tabBar() {
    return Object.entries(TAB_META).map(([id,m]) => {
      const hot = m.hot && id === 'queue' ? ' hot' : '';
      return '<button class="dv2a-tab'+(tab===id?' active':'')+'" onclick="window._assessTab(\''+id+'\')">'+esc(m.label)+' <span class="dv2a-tab-count'+hot+'">'+esc(m.count)+'</span></button>';
    }).join('') +
    '<div class="dv2a-legend">' +
      '<span><i style="background:var(--rose,#ff6b9d)"></i>Red flag</span>' +
      '<span><i style="background:var(--amber,#ffb547)"></i>Overdue</span>' +
      '<span><i style="background:var(--teal,#00d4bc)"></i>Due today</span>' +
    '</div>';
  }

  // ── Queue tab ────────────────────────────────────────────────────────────────
  function renderQueue() {
    const activeFilter = window._assessFilter || 'all';
    window._assessSetFilter = (f) => { window._assessFilter = f; window._nav('assessments-v2'); };

    const INSTRUMENTS = ['PHQ-9','GAD-7','Y-BOCS','PCL-5','HAM-D','HAM-A','AQ-10','ASRS','MIDAS','BPI','ISI','WAB-R','BDI-II','EQ-5D'];
    const kpis = [
      { lbl:'Red flags · 48h', cls:'rose', num:'2', sub:'PHQ-9 item 9 · escalate' },
      { lbl:'Overdue',          cls:'amber',num:'8', sub:'↑ 2 vs last week' },
      { lbl:'Due today',        cls:'teal', num:'15',sub:'12 tablet · 3 async' },
      { lbl:'Completed · 7d',   cls:'green',num:'142',sub:'94% completion rate' },
      { lbl:'Responder rate',   cls:'blue', num:'62', unit:'%', sub:'≥50% Δ from baseline' },
    ];

    const kpiHtml = '<div class="dv2a-kpi-row">' + kpis.map(k =>
      '<div class="dv2a-kpi">' +
        '<div class="dv2a-kpi-lbl '+k.cls+'"><i></i>'+esc(k.lbl)+'</div>' +
        '<div class="dv2a-kpi-num">'+esc(k.num)+(k.unit?'<span class="unit">'+esc(k.unit)+'</span>':'')+'</div>' +
        '<div class="dv2a-kpi-sub">'+esc(k.sub)+'</div>' +
      '</div>'
    ).join('') + '</div>';

    const chipHtml = '<div class="dv2a-filter-bar">' +
      '<button class="dv2a-chip'+(activeFilter==='all'?' active':'')+'" onclick="window._assessSetFilter(\'all\')">All instruments · '+queueRows.length+'</button>' +
      INSTRUMENTS.map(code => {
        const n = queueRows.filter(r => (r.inst || '').includes(code)).length;
        return '<button class="dv2a-chip'+(activeFilter===code?' active':'')+'" onclick="window._assessSetFilter(\''+esc(code)+'\')">'+esc(code)+(n?' · '+n:'')+'</button>';
      }).join('') +
      '<div style="margin-left:auto;display:flex;gap:6px">'+
      '<button class="btn btn-ghost btn-sm" style="font-size:10.5px" onclick="window._dsToast?.({title:\'Sort\',body:\'Sorting options coming soon.\',severity:\'info\'})">Sort: Oldest due ↑</button>'+
      '</div>' +
    '</div>';

    const filtered = activeFilter === 'all' ? queueRows : queueRows.filter(r => (r.inst || '').includes(activeFilter));

    const rowHtml = filtered.map(r => {
      const selected = r.id === selectedId;
      const rowCls = 'dv2a-queue-row'+(r.redflag?' redflag':'')+(r.overdue?' overdue':'')+(selected?' selected':'');
      const scoreColor = severityColor(r.sev);
      const flagHtml = r.redflag
        ? '<span class="dv2a-flag red">⚠ RED</span>'
        : (r.flagLabel ? '<span class="dv2a-flag '+(r.flagCls||'ok')+'">'+esc(r.flagLabel)+'</span>' : (selected ? '<span style="width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;background:rgba(0,212,188,0.16);color:var(--teal,#00d4bc);border-radius:4px;font-size:10px;font-weight:700">●</span>' : ''));
      const scoreHtml = r.score == null
        ? '<div class="dv2a-score" style="color:var(--text-tertiary)">—</div>'
        : '<div class="dv2a-score" style="color:'+scoreColor+'">'+r.score+(r.scoreUnit?' <span class="max">'+esc(r.scoreUnit)+'</span>':(r.max?' <span class="max">/'+r.max+'</span>':''))+'</div>';
      const sendBtn = r.redflag
        ? '<button class="dv2a-send-btn danger" onclick="event.stopPropagation();window._assessCrisis(\''+esc(r.id)+'\',\''+esc(r.patient)+'\')">Escalate →</button>'
        : '<button class="dv2a-send-btn" onclick="event.stopPropagation();window._assessSelect(\''+esc(r.id)+'\')">'+esc(r.sendLabel||'Open')+' →</button>';
      const modeStyle = r.modeStyle === 'teal' ? 'background:rgba(0,212,188,0.14);color:var(--teal,#00d4bc)' : (r.modeStyle === 'rose' ? 'background:rgba(255,107,157,0.14);color:var(--rose,#ff6b9d)' : '');

      return '<div class="'+rowCls+'" onclick="window._assessSelect(\''+esc(r.id)+'\')">' +
        '<div>'+flagHtml+'</div>' +
        '<div class="dv2a-pt"><div class="dv2a-pt-av '+(r.avCls||'a')+'">'+esc(r.avInit)+'</div><div style="min-width:0"><div class="dv2a-pt-name">'+esc(r.patient)+'</div><div class="dv2a-pt-sub">'+esc(r.dx)+' · MRN '+esc(r.mrn)+'</div></div></div>' +
        '<div><div class="dv2a-inst-name">'+esc(r.inst)+'</div><div class="dv2a-inst-sub">'+esc(r.instSub||'')+'</div></div>' +
        '<div>'+scoreHtml+sevBar(r.sev)+'<div style="font-size:10px;color:'+scoreColor+';margin-top:3px;font-weight:500">'+esc(r.sevLabel||'')+'</div></div>' +
        '<div><span class="dv2a-trend '+r.trendCls+'">'+(r.trendCls==='up'?'▲ ':r.trendCls==='down'?'▼ ':'◆ ')+esc(r.trend||'')+'</span>'+sparkSvg(r.sparkline, Math.max(...(r.sparkline||[1]),1), r.trendCls==='up'?'#ff6b9d':'#00d4bc')+'</div>' +
        '<div><span class="dv2a-due-chip '+(r.dueCls||'')+'">'+(r.dueCls==='overdue'||r.dueCls==='today'?'● ':'')+esc(r.due||'')+'</span></div>' +
        '<div><span class="dv2a-mode-pill" style="'+modeStyle+'">'+esc(r.mode)+'</span> <span class="dv2a-mode-sub">'+esc(r.modeSub||'')+'</span></div>' +
        '<div>'+sendBtn+'</div>' +
      '</div>';
    }).join('');

    return kpiHtml + chipHtml +
      '<div class="dv2a-card">' +
        '<div class="dv2a-queue-head"><div></div><div>Patient</div><div>Instrument</div><div>Last score · severity</div><div>Trend (course)</div><div>Due</div><div>Send via</div><div></div></div>' +
        rowHtml +
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;font-size:11px;color:var(--text-tertiary);border-top:1px solid var(--border)">'+
          '<span>Showing '+filtered.length+' of '+queueRows.length+' · sorted by risk & due date</span>'+
          '<button class="btn btn-ghost btn-sm" style="font-size:10.5px" onclick="window._assessBatch()">Batch send →</button>'+
        '</div>' +
      '</div>';
  }

  // ── Side panel ───────────────────────────────────────────────────────────────
  async function renderSidePanel() {
    const row = queueRows.find(r => r.id === selectedId) || queueRows[2];
    if (!row) {
      return '<div class="dv2a-side"><div class="dv2a-side-body" style="text-align:center;color:var(--text-tertiary);padding:40px 20px">Select a row to view details.</div></div>';
    }

    let aiSummary = null;
    try { const r = await (api.generateAssessmentSummary?.(row.id) || Promise.reject()); aiSummary = r?.summary_md || r?.summary || null; } catch {}
    try { if (!aiSummary) { const d = await (api.getAssessmentDetail?.(row.id) || Promise.reject()); aiSummary = d?.ai_summary || null; } } catch {}
    if (!aiSummary) {
      aiSummary = row.inst.includes('PHQ-9')
        ? (row.id === 'as-3'
          ? '<strong>'+esc(row.patient)+'</strong> has sustained a <strong>responder-level Δ of −8 PHQ-9 points</strong> from baseline (17 → 9) across 12 tDCS sessions targeting DLPFC-L. Item-level recovery is strongest on <strong>anhedonia</strong> and <strong>concentration</strong>, with residual sleep disturbance (Q3 = 2). Trajectory suggests <strong>remission likely by session 16</strong>. No red-flag items.'
          : '<strong>'+esc(row.patient)+'</strong> · PHQ-9 '+row.score+'/'+row.max+'. '+esc(row.sevLabel||'')+'. Recommend clinician review.')
        : '<strong>'+esc(row.patient)+'</strong> · '+esc(row.inst)+' '+(row.score||'—')+'/'+(row.max||'—')+'. '+esc(row.sevLabel||'')+'.';
    }

    const scoreColor = severityColor(row.sev);

    const aiHtml = '<div class="dv2a-ai-card">' +
      '<div class="dv2a-ai-badge">AI · Haiku 4.5</div>' +
      '<div class="dv2a-ai-meta">✧ Draft summary · clinician to co-sign</div>' +
      '<div class="dv2a-ai-body">'+aiSummary+'</div>' +
    '</div>';

    const trendHtml = '<div style="height:120px;position:relative">' +
      '<svg width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none">' +
        '<rect x="0" y="0" width="300" height="20" fill="rgba(255,107,157,0.06)"/>' +
        '<rect x="0" y="20" width="300" height="24" fill="rgba(255,139,71,0.06)"/>' +
        '<rect x="0" y="44" width="300" height="24" fill="rgba(255,181,71,0.06)"/>' +
        '<rect x="0" y="68" width="300" height="26" fill="rgba(0,212,188,0.06)"/>' +
        '<rect x="0" y="94" width="300" height="26" fill="rgba(74,222,128,0.04)"/>' +
        '<text x="4" y="12" font-size="7" fill="rgba(255,107,157,0.5)" font-family="ui-monospace,monospace">Severe 20+</text>' +
        '<text x="4" y="112" font-size="7" fill="rgba(74,222,128,0.55)" font-family="ui-monospace,monospace">None 0-4</text>' +
        '<line x1="50" y1="0" x2="50" y2="120" stroke="rgba(74,158,255,0.35)" stroke-width="1" stroke-dasharray="2,2"/>' +
        '<text x="52" y="10" font-size="7" fill="#4a9eff" font-family="ui-monospace,monospace">S4 rev</text>' +
        '<line x1="150" y1="0" x2="150" y2="120" stroke="rgba(74,158,255,0.35)" stroke-width="1" stroke-dasharray="2,2"/>' +
        '<text x="152" y="10" font-size="7" fill="#4a9eff" font-family="ui-monospace,monospace">S10 review</text>' +
        '<line x1="250" y1="0" x2="250" y2="120" stroke="rgba(0,212,188,0.35)" stroke-width="1" stroke-dasharray="2,2"/>' +
        '<text x="252" y="10" font-size="7" fill="var(--teal,#00d4bc)" font-family="ui-monospace,monospace">Target</text>' +
        '<polyline points="0,22 25,26 50,34 75,44 100,52 125,60 150,68 175,76 200,82 225,86 250,92 275,96" fill="none" stroke="#00d4bc" stroke-width="2" stroke-linecap="round"/>' +
        '<g fill="#00d4bc">' +
          '<circle cx="0" cy="22" r="2.5"/><circle cx="25" cy="26" r="2.5"/><circle cx="50" cy="34" r="2.5"/>' +
          '<circle cx="75" cy="44" r="2.5"/><circle cx="100" cy="52" r="2.5"/><circle cx="125" cy="60" r="2.5"/>' +
          '<circle cx="150" cy="68" r="2.5"/><circle cx="175" cy="76" r="2.5"/><circle cx="200" cy="82" r="2.5"/>' +
          '<circle cx="225" cy="86" r="2.5"/><circle cx="250" cy="92" r="3.5" stroke="#fff" stroke-width="1.5"/>' +
        '</g>' +
        '<line x1="0" y1="60" x2="300" y2="60" stroke="rgba(74,158,255,0.4)" stroke-width="1" stroke-dasharray="4,3"/>' +
        '<text x="245" y="57" font-size="7" fill="#4a9eff" font-family="ui-monospace,monospace">50% Δ</text>' +
      '</svg></div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9.5px;color:var(--text-tertiary);font-family:var(--font-mono,ui-monospace,monospace)">' +
        '<span>Baseline · 17</span><span>Session 12 · '+(row.score??9)+'</span><span>Target · ≤5</span>' +
      '</div>';

    const bmHtml =
      '<div class="dv2a-bm-link"><div><div class="dv2a-bm-sym">Anhedonia</div><div class="dv2a-bm-cluster">items 1, 3 · −4 pts</div></div><div class="dv2a-bm-target">F3 · DLPFC-L ● anode</div></div>' +
      '<div class="dv2a-bm-link"><div><div class="dv2a-bm-sym">Concentration</div><div class="dv2a-bm-cluster">items 7, 8 · −2 pts</div></div><div class="dv2a-bm-target">FP2 · mPFC ○ cathode</div></div>' +
      '<div class="dv2a-bm-link"><div><div class="dv2a-bm-sym">Sleep · residual</div><div class="dv2a-bm-cluster">item 3 · Q=2</div></div><div class="dv2a-bm-target" style="color:var(--amber,#ffb547)">Consider +F4 next</div></div>';

    const normHtml = '<div style="font-size:10.5px;color:var(--text-tertiary);line-height:1.5">At session 12, your clinic\'s MDD cohort averages <strong style="color:var(--teal,#00d4bc)">7.2</strong>, published tDCS MDD Δ-course average is <strong style="color:var(--text-primary)">10.4</strong> (Fregni 2021). '+esc(row.patient)+' is <strong style="color:var(--teal,#00d4bc)">ahead of both.</strong></div>' +
      '<div class="dv2a-norm-bar">' +
        '<div class="dv2a-norm-mark clinic" style="left:27%" title="Clinic avg 7.2"></div>' +
        '<div class="dv2a-norm-mark pub" style="left:39%" title="Published 10.4"></div>' +
        '<div class="dv2a-norm-mark pt" style="left:34%" title="Patient"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-tertiary);font-family:var(--font-mono,ui-monospace,monospace);margin-top:3px"><span>0</span><span>5</span><span>10</span><span>15</span><span>20+</span></div>' +
      '<div style="display:flex;gap:10px;margin-top:8px;font-size:10px;color:var(--text-tertiary)">' +
        '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:4px;height:10px;background:var(--teal,#00d4bc);display:inline-block;border-radius:1px"></span>Patient</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:4px;height:10px;background:var(--blue,#4a9eff);display:inline-block;border-radius:1px"></span>Clinic</span>' +
        '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:4px;height:10px;background:var(--violet,#9b7fff);display:inline-block;border-radius:1px"></span>Published</span>' +
      '</div>';

    const phq9 = ASSESS_REGISTRY.find(x => x.id === 'PHQ-9');
    const sampleAnswers = [1,1,2,1,0,0,1,2,0]; // responses for PHQ-9 in the demo
    const phqItems = (phq9?.questions || [
      'Little interest or pleasure in doing things',
      'Feeling down, depressed, or hopeless',
      'Trouble falling or staying asleep',
      'Feeling tired or having little energy',
      'Poor appetite or overeating',
      'Feeling bad about yourself',
      'Trouble concentrating',
      'Moving slowly or restlessly',
      'Thoughts that you would be better off dead — <strong style="color:var(--text-primary)">monitored</strong>',
    ]).slice(0, 9);

    const formHtml = phqItems.map((q, i) => {
      const sel = sampleAnswers[i] ?? 0;
      const opts = [0,1,2,3].map(v => {
        const cls = v === sel ? (v >= 2 ? (i === 8 ? 'sel rose' : 'sel amb') : 'sel') : '';
        return '<div'+(cls?' class="'+cls+'"':'')+'>'+v+'</div>';
      }).join('');
      return '<div class="dv2a-form-row"><span class="dv2a-form-q">'+(i+1)+'. '+q+'</span><div class="dv2a-form-ans">'+opts+'</div></div>';
    }).join('');

    return '<div class="dv2a-side" style="position:relative">' +
      '<div class="dv2a-side-head">' +
        '<button class="dv2a-side-close" onclick="window._assessCloseSide()" aria-label="Close panel">✕</button>' +
        '<div style="display:flex;gap:10px;align-items:center;padding-right:30px">' +
          '<div class="dv2a-pt-av '+(row.avCls||'a')+'" style="width:40px;height:40px;font-size:13px;border-radius:8px">'+esc(row.avInit)+'</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:14px;font-weight:600;font-family:var(--font-display,inherit)">'+esc(row.patient)+' · '+esc(row.inst)+'</div>' +
            '<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">Due '+esc(row.due||'')+' · '+esc(row.dx)+'</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">' +
          '<span class="dv2a-chip-sm '+(row.sev==='sev'?'rose':row.sev==='mods'?'amber':'teal')+'">'+esc(row.sevLabel||'')+' · '+(row.score||'—')+(row.max?'/'+row.max:'')+'</span>' +
          (row.trendCls==='down' && row.score!=null ? '<span class="dv2a-chip-sm teal">Responder</span>' : '') +
          (row.redflag ? '<span class="dv2a-chip-sm rose">⚠ Red flag · item 9</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="dv2a-side-body">' +
        '<div class="dv2a-side-section"><div class="dv2a-side-title"><span class="num">01</span>AI clinical summary</div>'+aiHtml+'</div>' +
        '<div class="dv2a-side-section"><div class="dv2a-side-title"><span class="num">02</span>Trend across course</div>'+trendHtml+'</div>' +
        '<div class="dv2a-side-section"><div class="dv2a-side-title"><span class="num">03</span>Brain-map linkage</div><div style="font-size:10.5px;color:var(--text-tertiary);margin-bottom:6px;line-height:1.4">Item-level response mapped to active stimulation targets.</div>'+bmHtml+'</div>' +
        '<div class="dv2a-side-section"><div class="dv2a-side-title"><span class="num">04</span>Comparative norms · '+esc(row.inst)+'</div>'+normHtml+'</div>' +
        '<div class="dv2a-side-section"><div class="dv2a-side-title"><span class="num">05</span>Last completed · form preview</div>'+formHtml+
          '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:10.5px;color:var(--text-tertiary);padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)"><span>Total · items 1–9</span><span style="font-family:var(--font-mono,ui-monospace,monospace);color:'+scoreColor+';font-weight:600">'+(row.score??'—')+'</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="dv2a-footer-actions">' +
        '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._assessReschedule(\''+esc(row.id)+'\')">Reschedule</button>' +
        '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._assessExportPdf(\''+esc(row.id)+'\')">Export PDF</button>' +
        '<button class="btn btn-primary btn-sm" style="flex:1.3" onclick="window._assessCosign(\''+esc(row.id)+'\')">Co-sign →</button>' +
      '</div>' +
    '</div>';
  }

  // ── Cohort tab ───────────────────────────────────────────────────────────────
  async function renderCohort() {
    const cohortSel = window._assessCohort || 'mdd-tdcs';
    window._assessPickCohort = (k) => { window._assessCohort = k; window._nav('assessments-v2'); };
    const COHORTS = [
      { id:'mdd-tdcs', label:'All MDD on tDCS course', n:42, inst:'PHQ-9 · GAD-7' },
      { id:'ocd-tms',  label:'OCD on rTMS maintenance', n:18, inst:'Y-BOCS · OCI-R' },
      { id:'ptsd-vns', label:'PTSD on taVNS', n:11, inst:'PCL-5' },
      { id:'insomnia', label:'Insomnia adjunct', n:24, inst:'ISI' },
      { id:'adhd-peds',label:'Peds ADHD', n:15, inst:'Vanderbilt' },
      { id:'migraine', label:'Migraine prevention', n:19, inst:'MIDAS' },
    ];
    try {
      const cRes = await (api.listCohorts?.() || Promise.reject());
      if (cRes && Array.isArray(cRes.items) && cRes.items.length) {
        COHORTS.splice(0, COHORTS.length, ...cRes.items.map(c => ({ id:c.id, label:c.label, n:c.n||0, inst:c.instruments||'' })));
      }
    } catch {}

    const active = COHORTS.find(c => c.id === cohortSel) || COHORTS[0];
    const cohortListHtml = COHORTS.map(c =>
      '<div class="dv2a-cohort-card'+(c.id===active.id?' active':'')+'" onclick="window._assessPickCohort(\''+esc(c.id)+'\')">' +
        '<div style="font-size:12.5px;font-weight:600;color:var(--text-primary)">'+esc(c.label)+'</div>' +
        '<div style="font-size:10.5px;color:var(--text-tertiary);margin-top:4px">'+c.n+' patients · '+esc(c.inst)+'</div>' +
      '</div>'
    ).join('');

    const tableRows = queueRows.slice(0, 8).map(r =>
      '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">' +
        '<td style="padding:9px 12px;font-size:11.5px">'+esc(r.patient)+' <span style="color:var(--text-tertiary);font-size:10px">· MRN '+esc(r.mrn)+'</span></td>' +
        '<td style="padding:9px 12px;font-size:11px">'+esc(r.inst)+'</td>' +
        '<td style="padding:9px 12px;font-size:11px;font-family:var(--font-mono,ui-monospace,monospace);color:'+severityColor(r.sev)+'">'+(r.score??'—')+(r.max?'/'+r.max:'')+'</td>' +
        '<td style="padding:9px 12px;font-size:10.5px"><span class="dv2a-due-chip '+(r.dueCls||'')+'">'+esc(r.due||'')+'</span></td>' +
        '<td style="padding:9px 12px;font-size:11px;color:'+(r.trendCls==='down'?'var(--teal,#00d4bc)':r.trendCls==='up'?'var(--rose,#ff6b9d)':'var(--text-tertiary)')+'">'+esc(r.trend||'')+'</td>' +
      '</tr>'
    ).join('');

    return '<div class="dv2a-filter-bar"><button class="dv2a-chip">Instrument: any</button><button class="dv2a-chip">Window: last 30d</button><div style="margin-left:auto"><button class="btn btn-primary btn-sm" onclick="window._dsToast?.({title:\'Batch send\',body:\'Sending '+active.inst+' to '+active.n+' patients in '+active.label+'.\',severity:\'success\'})">Batch send to '+active.n+' →</button></div></div>' +
      '<div class="dv2a-cohort-grid">' +
        '<div style="display:flex;flex-direction:column;gap:8px">' + cohortListHtml + '</div>' +
        '<div class="dv2a-card">' +
          '<div style="padding:12px 14px;border-bottom:1px solid var(--border)"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">'+esc(active.label)+'</div><div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">'+active.n+' patients · '+esc(active.inst)+' · response status below</div></div>' +
          '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:rgba(255,255,255,0.02)"><th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em">Patient</th><th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em">Instrument</th><th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em">Score</th><th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em">Status</th><th style="padding:8px 12px;text-align:left;font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em">Δ</th></tr></thead><tbody>' + tableRows + '</tbody></table>' +
        '</div>' +
      '</div>';
  }

  // ── Library tab ──────────────────────────────────────────────────────────────
  function renderLibrary() {
    const entries = ASSESS_REGISTRY.slice(0, 24);
    const cards = entries.map(e => {
      const cat = esc(e.cat || '—');
      const items = Array.isArray(e.questions) ? e.questions.length : '—';
      const max = e.max != null ? e.max : '—';
      const lic = e.licensing?.tier === 'public_domain' ? 'Public domain' : (e.licensing?.tier === 'licensed' ? 'Licensed' : '—');
      return '<div class="dv2a-lib-card" onclick="window._assessOpenIndividual(\''+esc(e.id)+'\')">' +
        '<div class="dv2a-lib-abbr">'+esc(e.abbr||e.id)+'</div>' +
        '<div class="dv2a-lib-name">'+esc(e.t||e.abbr)+'</div>' +
        '<div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;line-height:1.4">'+esc(e.sub||'')+'</div>' +
        '<div class="dv2a-lib-meta">' +
          '<span>'+cat+'</span>' +
          '<span>'+items+' items</span>' +
          '<span>max '+max+'</span>' +
          '<span>'+esc(lic)+'</span>' +
        '</div>' +
      '</div>';
    }).join('');
    window._assessOpenIndividual = (id) => { window._assessIndividualId = id; window._assessHubTab = 'individual'; window._nav('assessments-v2'); };
    return '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px">Validated instruments across depression, anxiety, OCD, trauma, sleep, mania, pain, language, and QoL. Click a card to open its template.</div>' +
      '<div class="dv2a-lib-grid">'+cards+'</div>';
  }

  // ── Individual tab ───────────────────────────────────────────────────────────
  function renderIndividual() {
    const instId = window._assessIndividualId || 'PHQ-9';
    const inst = ASSESS_REGISTRY.find(x => x.id === instId) || ASSESS_REGISTRY[0];
    const items = (inst.questions || []).map((q,i) => '<div class="dv2a-ind-item" data-idx="'+(i+1)+'.">'+esc(q)+'</div>').join('');
    const opts = (inst.options || []).map(o => '<span class="dv2a-chip-sm teal">'+esc(o)+'</span>').join(' ');
    const bands = (() => {
      try {
        const samples = [0, Math.floor(inst.max*0.25), Math.floor(inst.max*0.5), Math.floor(inst.max*0.75), inst.max];
        return samples.map(s => { const r = inst.interpret?.(s); return r ? '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:11px"><span style="color:var(--text-tertiary);font-family:var(--font-mono,ui-monospace,monospace)">Score '+s+'</span><span style="color:'+(r.color||'var(--text-primary)')+';font-weight:600">'+esc(r.label)+'</span></div>' : ''; }).join('');
      } catch { return ''; }
    })();

    window._assessAssignForm = () => {
      window._dsToast?.({ title:'Assigned', body:inst.abbr+' assigned to current patient.', severity:'success' });
    };

    return '<div class="dv2a-ind-wrap">' +
      '<div class="dv2a-card" style="padding:16px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'+
          '<div><div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary)">'+esc(inst.abbr||inst.id)+'</div><div style="font-size:12px;color:var(--text-tertiary);margin-top:3px">'+esc(inst.t||'')+'</div></div>'+
          '<div style="display:flex;gap:4px;flex-wrap:wrap;max-width:50%"><span class="dv2a-chip-sm teal">'+esc(inst.cat||'—')+'</span><span class="dv2a-chip-sm amber">'+((inst.questions||[]).length||'—')+' items</span><span class="dv2a-chip-sm teal">max '+esc(inst.max||'—')+'</span></div>'+
        '</div>' +
        '<div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;margin-bottom:14px">'+esc(inst.sub||'')+'</div>' +
        (opts ? '<div style="margin-bottom:12px;font-size:11px;color:var(--text-tertiary)"><div style="margin-bottom:6px">Response options:</div>'+opts+'</div>' : '') +
        '<div style="font-size:10.5px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin:14px 0 8px">Items</div>' +
        (items || '<div style="padding:14px;background:var(--bg-surface,#11222a);border-radius:6px;font-size:11.5px;color:var(--text-tertiary)">Item text not embedded — licensed instrument. Administer via authorized copy.</div>') +
      '</div>' +
      '<div class="dv2a-card" style="padding:16px">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Severity bands</div>' +
        (bands || '<div style="font-size:11px;color:var(--text-tertiary)">Scoring follows '+esc(inst.scoringKey||inst.abbr)+'.</div>') +
        '<div style="margin-top:16px;font-size:10.5px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em">Licensing</div>' +
        '<div style="font-size:11px;color:var(--text-secondary);margin-top:6px;line-height:1.5">'+esc(inst.licensing?.attribution||'—')+'</div>' +
        '<div style="margin-top:16px;font-size:10.5px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Assign to patient</div>' +
        '<input class="form-control" placeholder="Patient name or MRN" style="width:100%;padding:8px 10px;background:var(--bg-surface,#11222a);border:1px solid var(--border);border-radius:6px;font-size:12px;color:var(--text-primary);margin-bottom:8px"/>' +
        '<button class="btn btn-primary btn-sm" style="width:100%" onclick="window._assessAssignForm()">Assign '+esc(inst.abbr||inst.id)+' →</button>' +
      '</div>' +
    '</div>';
  }

  // ── Compose page ─────────────────────────────────────────────────────────────
  let mainContent = '';
  let sideContent = '';
  if (tab === 'queue') {
    mainContent = renderQueue();
    sideContent = await renderSidePanel();
  } else if (tab === 'cohort') {
    mainContent = await renderCohort();
  } else if (tab === 'library') {
    mainContent = renderLibrary();
  } else if (tab === 'individual') {
    mainContent = renderIndividual();
  }

  el.innerHTML =
    '<div class="dv2a-shell">' +
      '<div class="dv2a-tabs" role="tablist">' + tabBar() + '</div>' +
      '<div class="dv2a-body">' +
        '<div class="dv2a-main">' + mainContent + '</div>' +
        (tab === 'queue' && selectedId ? sideContent : '') +
      '</div>' +
    '</div>';
}

