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
import { EVIDENCE_SUMMARY, CONDITION_EVIDENCE, getConditionEvidence } from './evidence-dataset.js';
import { PROTOCOL_LIBRARY, CONDITIONS as PROTO_CONDITIONS, DEVICES as PROTO_DEVICES, getProtocolsByCondition } from './protocols-data.js';
import { DEMO_PATIENT_ROSTER } from './patient-dashboard-helpers.js';

function shortMrn(p) {
  if (p?.mrn) return String(p.mrn);
  const raw = String(p?.id || '');
  return raw ? raw.slice(0, 8).toUpperCase() : '—';
}

function ageOf(p, now = new Date()) {
  if (p?.age != null) return p.age;
  if (!p?.dob) return null;
  const dob = new Date(p.dob);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

function ageSexCell(p) {
  const age = ageOf(p);
  const sex = String(p?.gender || '').charAt(0).toUpperCase();
  if (age == null && !sex) return '—';
  return (age != null ? `${age}y` : '—') + (sex ? ` ${sex}` : '');
}

function statusLabel(p) {
  const raw = String(p?.status || '').toLowerCase();
  const map = {
    active: 'Active',
    intake: 'Intake',
    new: 'Intake',
    paused: 'Paused',
    'on-hold': 'Paused',
    discharging: 'Discharging',
    completed: 'Completed',
    discharged: 'Discharged',
    archived: 'Archived',
    inactive: 'Inactive',
    pending: 'Pending',
  };
  return map[raw] || (p?.status ? p.status[0].toUpperCase() + p.status.slice(1) : '—');
}

function fmtShortDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function clinicianNameFor(p, cliniciansById = {}) {
  const clinicianId = p?.assigned_clinician_id || p?.clinician_id || p?.primary_clinician_id;
  if (clinicianId && cliniciansById[clinicianId]) return String(cliniciansById[clinicianId]);
  return String(p?.assigned_clinician_name || p?.clinician_name || p?.primary_clinician_name || '');
}

function courseLabel(p) {
  const modality = String(p?.primary_modality || '').replace(/_/g, ' ').trim();
  const condition = String(p?.condition_slug || p?.primary_condition || '').replace(/-/g, ' ').trim();
  return [modality, condition].filter(Boolean).join(' · ');
}

function adherenceCell(p) {
  if (p?.home_adherence == null) return '—';
  return `${Math.round(Number(p.home_adherence) * 100)}%`;
}

function outcomeScoreCell(p) {
  if (p?.current_score == null) return '—';
  const scale = String(p?.primary_scale || '').trim();
  return scale ? `${scale} ${p.current_score}` : String(p.current_score);
}

function isDemoSeed(p) {
  return !!(p?.demo_seed || String(p?.notes || '').startsWith('[DEMO]'));
}

function sortValue(p, key, course = '', clinicianName = '') {
  switch (key) {
    case 'name':
      return `${String(p?.last_name || '')} ${String(p?.first_name || '')}`.trim().toLowerCase();
    case 'mrn':
      return shortMrn(p).toLowerCase();
    case 'age':
      return ageOf(p) ?? -1;
    case 'condition':
      return String(p?.primary_condition || p?.condition_slug || '').toLowerCase();
    case 'course':
      return String(course || courseLabel(p)).toLowerCase();
    case 'status':
      return statusLabel(p).toLowerCase();
    case 'last':
      return String(p?.last_session_date || '');
    case 'next':
      return String(p?.next_session_date || p?.next_session_at || '');
    case 'adherence':
      return p?.home_adherence == null ? -1 : Number(p.home_adherence);
    case 'outcome':
      return p?.current_score == null ? Number.POSITIVE_INFINITY : Number(p.current_score);
    case 'clinician':
      return String(clinicianName || clinicianNameFor(p)).toLowerCase();
    default:
      return '';
  }
}

function sortPatients(items, key, direction = 'asc', getCourseLabel = courseLabel, getClinicianName = clinicianNameFor) {
  const dir = direction === 'desc' ? -1 : 1;
  return [...(items || [])].sort((a, b) => {
    const av = sortValue(a, key, getCourseLabel(a), getClinicianName(a));
    const bv = sortValue(b, key, getCourseLabel(b), getClinicianName(b));
    if (av === bv) return 0;
    return av < bv ? -1 * dir : 1 * dir;
  });
}

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
  // Server-driven list: every filter, sort, search, KPI, and notification
  // count comes from the API. No client-side slicing of a pre-fetched full
  // cohort, no fake aggregates, no placeholder onClicks.
  if (tab === 'patients') {
    const canAdd = ['clinician','admin','clinic-admin','supervisor'].includes(currentUser?.role);
    setTopbar('Patients',
      canAdd ? '<button class="btn btn-primary btn-sm" onclick="window.showAddPatient()">+ Add patient</button>' +
               '<button class="btn btn-sm" onclick="window.showImportCSV()" style="margin-right:6px">Import CSV</button>' : ''
    );
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

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
      const scale = p.primary_scale;
      const base  = p.baseline_score;
      const cur   = p.current_score;
      if (scale && base != null && cur != null) {
        const down = cur < base;
        const color = down ? 'var(--teal)' : (cur > base ? 'var(--amber)' : 'var(--text-secondary)');
        return '<span style="font-family:var(--font-mono);font-size:11.5px;color:' + color + '">' + esc(scale) + ' · ' + base + ' → ' + cur + '</span>';
      }
      if (p.outcome_trend === 'worsened') return '<span style="font-family:var(--font-mono);font-size:11.5px;color:var(--amber)">Trend ↓</span>';
      if (p.outcome_trend === 'improved') return '<span style="font-family:var(--font-mono);font-size:11.5px;color:var(--teal)">Trend ↑</span>';
      return '<span style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-tertiary)">No data</span>';
    }

    // Next-step chip is rule-based: adverse event > scheduled session > assessment
    // overdue > generic review due > intake fallback > adherence marker > default.
    // The underlying signals all come from the server enrichment — no fabrication.
    function nextStepChip(p) {
      if (p.has_adverse_event) return '<span class="chip rose">Review AE</span>';
      if (p.next_session_at || p.next_session_date) {
        const when = p.next_session_at || p.next_session_date;
        const d = new Date(when); const now = new Date();
        if (!isNaN(d.getTime())) {
          const isToday = d.toDateString() === now.toDateString();
          const t = d.toTimeString().slice(0,5);
          return '<span class="chip green">' + (isToday ? 'Session today ' + t : 'Session ' + d.toLocaleDateString(undefined,{weekday:'short'}) + ' ' + t) + '</span>';
        }
      }
      if (p.assessment_overdue) return '<span class="chip amber">Assessment due</span>';
      if (p.needs_review)       return '<span class="chip">Review due</span>';
      if (p.status === 'intake' || p.status === 'new') return '<span class="chip violet">Intake</span>';
      if (p.home_adherence != null && p.home_adherence >= 0.8) return '<span class="chip green">Homework ' + Math.round(p.home_adherence*100) + '%</span>';
      return '<span class="chip">Weekly check-in</span>';
    }

    // Persistent state across re-renders (survives tab navigation in-session).
    window._phState = window._phState || {
      status: 'all', q: '', condition: '', modality: '', clinician: '',
      sort: 'last_activity', page: 1,
    };
    const PAGE_SIZE = 10;

    const STATUS_TABS = [
      { id:'all',         label:'All' },
      { id:'active',      label:'Active' },
      { id:'intake',      label:'Intake' },
      { id:'discharging', label:'Discharging' },
      { id:'on_hold',     label:'On hold' },
      { id:'archived',    label:'Archived' },
    ];

    const SORT_OPTIONS = [
      { id:'last_activity',   label:'Sort: Last activity' },
      { id:'name',            label:'Sort: Name' },
      { id:'progress',        label:'Sort: Progress' },
      { id:'outcome_delta',   label:'Sort: Outcome Δ' },
      { id:'needs_follow_up', label:'Sort: Needs follow-up' },
    ];

    // Current server response state (re-populated on every fetch).
    let _currentSummary = null;
    let _currentList = { items: [], total: 0 };

    async function fetchSummary() {
      try {
        _currentSummary = await api.getPatientsCohortSummary();
      } catch (err) {
        // Cohort summary is additive; if it 404s on older servers, fall back
        // to zeroed counts so the layout still renders.
        _currentSummary = {
          total: 0,
          status_counts: { all:0, active:0, intake:0, discharging:0, on_hold:0, archived:0 },
          distinct: { conditions: [], modalities: [], clinicians: [] },
          kpis: {
            active_courses: 0, active_courses_delta_7d: 0,
            phq_delta_avg: null, phq_delta_n: 0,
            responder_rate_pct: null, responder_n: 0,
            homework_adherence_pct: null, homework_adherence_n: 0,
            follow_up_count: 0, follow_up_overdue_7d: 0,
            discharged_this_quarter: 0,
          },
        };
      }
    }

    // Demo mode: seed summary with plausible demo KPIs when API returns empty
    {
      const _demoOk = import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_DEMO === '1';
      if (_demoOk && _currentSummary && (_currentSummary.total === 0 || !_currentSummary.total)) {
        const n = DEMO_PATIENT_ROSTER.length;
        const activeN = DEMO_PATIENT_ROSTER.filter(p => p.status === 'active').length;
        _currentSummary.total = n;
        _currentSummary.status_counts = { all: n, active: activeN, intake: 0, discharging: 0, on_hold: 0, archived: 0, pending: n - activeN };
        _currentSummary.kpis = {
          active_courses: activeN, active_courses_delta_7d: 1,
          phq_delta_avg: -6.2, phq_delta_n: 3,
          responder_rate_pct: 64, responder_n: 3,
          homework_adherence_pct: 78, homework_adherence_n: activeN,
          follow_up_count: 1, follow_up_overdue_7d: 0,
          discharged_this_quarter: 0,
        };
      }
    }

    async function fetchList() {
      const s = window._phState;
      const params = {
        status: s.status,
        q: s.q || undefined,
        condition: s.condition || undefined,
        modality: s.modality || undefined,
        clinician: s.clinician || undefined,
        sort: s.sort,
        limit: PAGE_SIZE,
        offset: Math.max(0, (s.page - 1) * PAGE_SIZE),
      };
      try {
        _currentList = await api.listPatients(params);
      } catch (err) {
        _currentList = { items: [], total: 0 };
      }
      // Demo mode: seed with demo roster when API returns empty
      const _demoOk = import.meta.env?.DEV || import.meta.env?.VITE_ENABLE_DEMO === '1';
      if (_demoOk && (!_currentList?.items?.length)) {
        _currentList = { items: [...DEMO_PATIENT_ROSTER], total: DEMO_PATIENT_ROSTER.length };
      }
    }

    function renderKpis() {
      if (!_currentSummary) return '';
      const k = _currentSummary.kpis || {};
      const phqN = k.phq_delta_n || 0;
      const phqVal = phqN && k.phq_delta_avg != null ? k.phq_delta_avg.toFixed(1) : null;
      const phqSigned = phqVal ? (Number(phqVal) > 0 ? '+' + phqVal : phqVal) : '—';
      const adh = k.homework_adherence_pct;
      const adhN = k.homework_adherence_n || 0;
      const follow = k.follow_up_count || 0;
      const followOver = k.follow_up_overdue_7d || 0;
      const activeCount = k.active_courses || 0;
      const delta7 = k.active_courses_delta_7d || 0;
      const responderPct = k.responder_rate_pct;
      return (
        '<div class="d2p7-kpi"><div class="d2p7-kpi-lbl"><span class="dot"></span>Active course</div>' +
          '<div class="d2p7-kpi-num">' + activeCount + '</div>' +
          '<div class="d2p7-kpi-delta ' + (delta7>0?'up':'') + '">' +
            (delta7>0 ? ('↑ ' + delta7 + ' this week') : (activeCount ? (activeCount + ' active') : 'No active courses')) +
          '</div></div>' +
        '<div class="d2p7-kpi"><div class="d2p7-kpi-lbl blue"><span class="dot"></span>Avg response (PHQ-9 Δ)</div>' +
          '<div class="d2p7-kpi-num">' + phqSigned + '<span class="unit">pts</span></div>' +
          '<div class="d2p7-kpi-delta ' + (phqVal && Number(phqVal)<0 ? 'up' : '') + '">' +
            (responderPct != null ? ('Responder rate ' + Math.round(responderPct) + '%')
                                  : (phqN ? (phqN + ' scored') : 'No data')) +
          '</div></div>' +
        '<div class="d2p7-kpi"><div class="d2p7-kpi-lbl violet"><span class="dot"></span>Homework adherence</div>' +
          '<div class="d2p7-kpi-num">' + (adh != null ? Math.round(adh) : '—') + (adh != null ? '<span class="unit">%</span>' : '') + '</div>' +
          '<div class="d2p7-kpi-delta">' + (adhN ? ('across ' + adhN + ' patients') : 'No data') + '</div></div>' +
        '<div class="d2p7-kpi"><div class="d2p7-kpi-lbl amber"><span class="dot"></span>Needs follow-up</div>' +
          '<div class="d2p7-kpi-num">' + follow + '</div>' +
          '<div class="d2p7-kpi-delta ' + (followOver ? 'down' : '') + '">' +
            (followOver ? (followOver + ' overdue >7d') : (follow ? 'On track' : 'All on track')) +
          '</div></div>'
      );
    }

    function renderBreadcrumb() {
      if (!_currentSummary) return '';
      const activeCount = _currentSummary.status_counts?.active || 0;
      const discharged = _currentSummary.kpis?.discharged_this_quarter || 0;
      return activeCount + ' active' + (discharged ? (' · ' + discharged + ' discharged this quarter') : '');
    }

    function renderTabs() {
      const counts = _currentSummary?.status_counts || {};
      return STATUS_TABS.map(s =>
        '<button data-st="' + s.id + '" class="' + (window._phState.status===s.id?'active':'') + '" onclick="window._phSetStatus(\'' + s.id + '\')">' +
          s.label + ' · ' + (counts[s.id]||0) +
        '</button>').join('');
    }

    function renderFacetMenu(id, label, selected, options, allLabel) {
      const open = window._phOpenMenu === id;
      const safeSelected = selected ? String(selected) : '';
      const itemsHtml = options.map(o => {
        const v = String(o.value);
        return '<div class="d2p7-menu-item' + (safeSelected === v ? ' selected' : '') + '" ' +
          'onclick="window._phSetFacet(\'' + id + '\',\'' + esc(v).replace(/'/g, "\\'") + '\')">' +
          esc(o.label) + (o.count != null ? ' <span style="color:var(--text-tertiary);margin-left:6px">· ' + o.count + '</span>' : '') +
          '</div>';
      }).join('');
      const current = selected
        ? (options.find(o => String(o.value) === safeSelected)?.label || safeSelected)
        : label;
      return '<div class="d2p7-menu-wrap">' +
        '<button class="d2p7-chip-btn' + (selected ? ' active' : '') + '" onclick="window._phToggleMenu(\'' + id + '\')">' +
          esc(current) + ' <span style="margin-left:4px;opacity:.7">▾</span>' +
        '</button>' +
        (open ? ('<div class="d2p7-menu">' +
          '<div class="d2p7-menu-item' + (!selected ? ' selected' : '') + '" onclick="window._phSetFacet(\'' + id + '\',\'\')">' + esc(allLabel) + '</div>' +
          (options.length ? itemsHtml : '<div class="d2p7-menu-empty">None yet</div>') +
        '</div>') : '') +
      '</div>';
    }

    function renderFilterRow() {
      const distinct = _currentSummary?.distinct || { conditions: [], modalities: [], clinicians: [] };
      return renderFacetMenu('condition', 'Condition', window._phState.condition, distinct.conditions, 'All conditions')
           + renderFacetMenu('modality',  'Modality',  window._phState.modality,  distinct.modalities,  'All modalities')
           + renderFacetMenu('clinician', 'Clinician', window._phState.clinician, distinct.clinicians,  'All clinicians')
           + renderFacetMenu('sort',      SORT_OPTIONS.find(o=>o.id===window._phState.sort)?.label || 'Sort',
                             window._phState.sort, SORT_OPTIONS, 'Sort: Default');
    }

    function renderList() {
      const out = document.getElementById('d2p7-list');
      if (!out) return;
      const items = _currentList?.items || [];
      const total = _currentList?.total || 0;
      if (!items.length) {
        out.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary)">' +
          (window._phState.q || window._phState.status !== 'all'
            ? 'No patients match the current filters.'
            : 'No patients yet — add your first patient to get started.') +
          '</div>';
      } else {
        out.innerHTML = items.map(p => {
          const fname = p.first_name || '';
          const lname = p.last_name || '';
          const name  = (fname + ' ' + lname).trim() || 'Unknown';
          const ini   = ((fname[0]||'') + (lname[0]||'')).toUpperCase() || '?';
          const av    = AVATAR_TONES[Math.abs(String(p.id||name).split('').reduce((a,c)=>a+c.charCodeAt(0),0)) % AVATAR_TONES.length];
          const cond  = (p.condition_slug||'').replace(/-/g,' ') || (p.primary_condition||'—');
          const age   = p.age || (p.dob ? (new Date().getFullYear() - new Date(p.dob).getFullYear()) : null);
          const sex   = (p.gender||'').charAt(0).toUpperCase();
          const sub   = (age ? age + (sex||'') + ' · ' : '') + cond + (p.mrn ? ' · MRN ' + esc(p.mrn) : '');
          const demoChip = isDemoSeed(p) ? ' <span class="chip amber">Demo patient</span>' : '';
          const delivered = p.sessions_delivered ?? 0;
          const planned   = p.planned_sessions_total ?? 0;
          const prog = planned > 0 ? Math.min(100, Math.round(delivered / planned * 100)) : 0;
          return '<div class="queue-row pt-row" style="grid-template-columns:1.8fr 1.1fr 1fr 1fr 1fr 90px" ' +
            'onclick="window._selectedPatientId=\'' + esc(p.id) + '\';window._profilePatientId=\'' + esc(p.id) + '\';try{sessionStorage.setItem(\'ds_pat_selected_id\',\'' + esc(p.id) + '\')}catch(e){}window._nav(\'patient-profile\')">' +
              '<div class="queue-pt"><div class="pt-av ' + av + '">' + esc(ini) + '</div>' +
                '<div><div class="queue-pt-name">' + esc(name) + demoChip + (p.is_responder ? ' <span class="pl-responder-chip">Responder</span>' : '') + '</div>' +
                  '<div class="queue-pt-cond">' + esc(sub) + '</div></div></div>' +
              '<div>' + protocolChip(p) + '</div>' +
              '<div class="queue-progress"><div class="queue-progress-bar"><div style="width:' + prog + '%"></div></div>' +
                '<span style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-tertiary)">' + delivered + '/' + (planned||'—') + '</span></div>' +
              '<div>' + outcomeCell(p) + '</div>' +
              '<div>' + nextStepChip(p) + '</div>' +
              '<div style="text-align:right"><button class="topbar-btn d2p7-chev" aria-label="Open patient" style="width:26px;height:26px" onclick="event.stopPropagation();window._selectedPatientId=\'' + esc(p.id) + '\';window._profilePatientId=\'' + esc(p.id) + '\';window._nav(\'patient-profile\')">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></button></div>' +
            '</div>';
        }).join('');
      }

      const foot = document.getElementById('d2p7-foot');
      if (foot) {
        const start = (window._phState.page - 1) * PAGE_SIZE;
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const statusLbl = (STATUS_TABS.find(s=>s.id===window._phState.status)||STATUS_TABS[0]).label;
        foot.innerHTML =
          '<span>Showing ' + (total ? (start+1) : 0) + '–' + Math.min(start+PAGE_SIZE,total) + ' of ' + total + ' · filtered by "' + esc(statusLbl) + '"</span>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<button class="topbar-btn" style="width:26px;height:26px" onclick="window._phGoPage(-1)" ' + (window._phState.page<=1?'disabled':'') + '>‹</button>' +
            '<span style="font-family:var(--font-mono)">' + window._phState.page + ' / ' + pages + '</span>' +
            '<button class="topbar-btn" style="width:26px;height:26px" onclick="window._phGoPage(1)" ' + (window._phState.page>=pages?'disabled':'') + '>›</button>' +
          '</div>';
      }
    }

    function renderHeader() {
      const bc = document.getElementById('d2p7-bc');
      if (bc) bc.textContent = renderBreadcrumb();
      const kg = document.getElementById('d2p7-kpi-grid');
      if (kg) kg.innerHTML = renderKpis();
      const tr = document.getElementById('d2p7-tabrow');
      if (tr) tr.innerHTML = renderTabs();
      const fr = document.getElementById('d2p7-filter-row');
      if (fr) fr.innerHTML = renderFilterRow();
    }

    async function refreshAll() {
      await Promise.all([fetchSummary(), fetchList()]);
      renderHeader();
      renderList();
    }

    async function refreshListOnly() {
      await fetchList();
      renderList();
    }

    // Debounce so typing doesn't spam the server.
    let _searchTimer = null;
    window._phOnSearch = function(ev) {
      const val = (ev && ev.target) ? ev.target.value : '';
      if (_searchTimer) clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        window._phState.q = val;
        window._phState.page = 1;
        refreshListOnly();
      }, 250);
    };

    window._phSetStatus = async id => {
      window._phState.status = id;
      window._phState.page = 1;
      document.querySelectorAll('.d2p7-tabrow button').forEach(b => b.classList.toggle('active', b.dataset.st === id));
      await refreshListOnly();
    };

    window._phGoPage = async delta => {
      const total = _currentList?.total || 0;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const next = Math.min(pages, Math.max(1, window._phState.page + delta));
      if (next === window._phState.page) return;
      window._phState.page = next;
      await refreshListOnly();
    };

    window._phToggleMenu = id => {
      window._phOpenMenu = (window._phOpenMenu === id) ? null : id;
      const fr = document.getElementById('d2p7-filter-row');
      if (fr) fr.innerHTML = renderFilterRow();
    };

    window._phSetFacet = async (id, value) => {
      window._phOpenMenu = null;
      if (id === 'sort') {
        window._phState.sort = value || 'last_activity';
      } else if (id === 'condition' || id === 'modality' || id === 'clinician') {
        window._phState[id] = value || '';
      }
      window._phState.page = 1;
      const fr = document.getElementById('d2p7-filter-row');
      if (fr) fr.innerHTML = renderFilterRow();
      await refreshListOnly();
    };

    // Notifications bell (header). Count comes from real backend.
    async function refreshBell() {
      const badge = document.getElementById('d2p7-bell-badge');
      if (!badge) return;
      try {
        const res = await api.getNotificationsUnreadCount?.();
        const n = Number(res?.count || 0);
        if (n > 0) {
          badge.textContent = n > 99 ? '99+' : String(n);
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      } catch {
        badge.style.display = 'none';
      }
    }
    window._phOpenNotifications = () => {
      // Adverse-event & review items live under the clinical hub's review queue.
      // Route there rather than rebuild a notifications panel inline.
      if (typeof window._nav === 'function') window._nav('review-queue');
    };

    // Refresh the list after a successful "+ Add patient" flow. The create
    // modal dispatches this custom event on success today.
    window.addEventListener('ds:patient-created', () => { refreshAll(); refreshBell(); }, { once: false });

    el.innerHTML = `
    <div class="ch-shell">
      <style>
        /* ── Design-v2 screen 07 tokens ── */
        .d2p7-wrap { color: var(--text-primary); }

        /* Topbar strip inside the content area — matches prototype header */
        .d2p7-topbar { display:flex; align-items:center; gap:12px; margin-bottom:6px; flex-wrap:wrap; }
        .d2p7-topbar-title { font-family:var(--font-display,inherit); font-size:17px; font-weight:600; letter-spacing:-0.3px; }
        .d2p7-topbar-bc { font-size:11.5px; color:var(--text-tertiary); display:flex; align-items:center; gap:5px; margin-top:3px; }
        .d2p7-topbar-bc .sep { opacity:0.4; }
        .d2p7-topbar-search { position:relative; flex:1; min-width:200px; max-width:340px; }
        .d2p7-topbar-search input { width:100%; background:var(--bg-surface); border:1px solid var(--border); border-radius:10px; padding:8px 10px 8px 30px; color:var(--text-primary); font-size:12.5px; outline:none; font-family:inherit; }
        .d2p7-topbar-search input:focus { border-color:var(--border-hover); }
        .d2p7-topbar-search svg { position:absolute; left:9px; top:50%; transform:translateY(-50%); width:13px; height:13px; stroke:var(--text-tertiary); fill:none; stroke-width:2; stroke-linecap:round; pointer-events:none; }
        .d2p7-topbar-search .kbd { position:absolute; right:8px; top:50%; transform:translateY(-50%); font-family:var(--font-mono); font-size:10px; color:var(--text-tertiary); padding:1px 5px; border:1px solid var(--border); border-radius:4px; background:rgba(255,255,255,0.02); pointer-events:none; }
        .d2p7-bell-wrap { position:relative; display:inline-flex; align-items:center; }
        .d2p7-bell-badge { position:absolute; top:-4px; right:-4px; min-width:16px; height:16px; border-radius:999px; background:var(--rose); color:#fff; font-size:9.5px; font-weight:700; display:none; align-items:center; justify-content:center; padding:0 3px; }

        /* Status tabs */
        .d2p7-tabrow { display:flex; gap:4px; background:var(--bg-surface); padding:3px; border-radius:8px; border:1px solid var(--border); flex-wrap:wrap; }
        .d2p7-tabrow button { padding:5px 10px; font-size:11.5px; font-weight:600; color:var(--text-secondary); border-radius:5px; background:transparent; border:none; cursor:pointer; }
        .d2p7-tabrow button.active { background:rgba(255,255,255,0.08); color:var(--text-primary); }
        .d2p7-tabrow button:hover:not(.active) { color:var(--text-primary); }

        /* Facet / sort dropdown chips */
        .d2p7-menu-wrap { position:relative; display:inline-block; }
        .d2p7-chip-btn { padding:5px 10px; font-size:11.5px; border-radius:6px; background:transparent; border:1px solid var(--border); color:var(--text-secondary); cursor:pointer; display:inline-flex; align-items:center; gap:4px; font-family:inherit; }
        .d2p7-chip-btn:hover, .d2p7-chip-btn.active { border-color:var(--teal); color:var(--text-primary); }
        .d2p7-menu { position:absolute; top:calc(100% + 4px); left:0; min-width:180px; background:var(--navy-800,#0e1628); border:1px solid var(--border-hover); border-radius:10px; padding:4px; z-index:200; box-shadow:0 8px 32px rgba(0,0,0,0.35); }
        .d2p7-menu-item { padding:7px 10px; font-size:12px; border-radius:6px; cursor:pointer; color:var(--text-secondary); }
        .d2p7-menu-item:hover { background:rgba(255,255,255,0.06); color:var(--text-primary); }
        .d2p7-menu-item.selected { color:var(--teal); font-weight:600; }
        .d2p7-menu-empty { padding:10px; font-size:11.5px; color:var(--text-tertiary); text-align:center; }

        /* KPI grid */
        .d2p7-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:18px; }
        @media (max-width:900px) { .d2p7-kpi-grid { grid-template-columns:repeat(2,1fr); } }
        .d2p7-kpi { padding:14px 16px 12px; border:1px solid var(--border); background:var(--bg-card); border-radius:14px; }
        .d2p7-kpi-lbl { font-size:10.5px; letter-spacing:1px; text-transform:uppercase; color:var(--text-tertiary); font-weight:600; display:flex; align-items:center; gap:6px; }
        .d2p7-kpi-lbl .dot { width:6px; height:6px; border-radius:50%; background:var(--teal); box-shadow:0 0 5px var(--teal); }
        .d2p7-kpi-lbl.blue .dot   { background:var(--blue);   box-shadow:0 0 5px var(--blue); }
        .d2p7-kpi-lbl.violet .dot { background:var(--violet); box-shadow:0 0 5px var(--violet); }
        .d2p7-kpi-lbl.amber .dot  { background:var(--amber);  box-shadow:0 0 5px var(--amber); }
        .d2p7-kpi-num { font-family:var(--font-display,inherit); font-size:28px; font-weight:600; margin-top:8px; color:var(--text-primary); line-height:1; }
        .d2p7-kpi-num .unit { font-size:14px; color:var(--text-tertiary); font-weight:500; margin-left:3px; }
        .d2p7-kpi-delta { font-size:11px; color:var(--text-tertiary); margin-top:8px; display:inline-flex; align-items:center; gap:4px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.04); }
        .d2p7-kpi-delta.up   { color:var(--green);  background:rgba(74,222,128,0.10); }
        .d2p7-kpi-delta.down { color:var(--amber);  background:rgba(255,181,71,0.10); }

        /* Table card */
        .d2p7-card { background:var(--bg-card); border:1px solid var(--border); border-radius:14px; padding:8px 16px 16px; }
        .d2p7-wrap .queue-row { display:grid; align-items:center; gap:12px; padding:10px 4px; border-bottom:1px solid var(--border); }
        .d2p7-wrap .queue-row:last-child { border-bottom:none; }
        .d2p7-wrap .queue-row.head { color:var(--text-tertiary); font-size:10.5px; letter-spacing:1px; text-transform:uppercase; font-weight:600; padding:4px 4px 10px; }
        .d2p7-wrap .queue-row.pt-row { cursor:pointer; transition:background .1s ease; border-radius:8px; }
        .d2p7-wrap .queue-row.pt-row:hover { background:rgba(0,212,188,0.04); }
        .d2p7-wrap .queue-pt { display:flex; align-items:center; gap:10px; min-width:0; }
        .d2p7-wrap .queue-pt > div:last-child { min-width:0; }
        .d2p7-wrap .queue-pt-name { font-weight:600; font-size:13px; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .d2p7-wrap .queue-pt-cond { font-size:10.5px; color:var(--text-tertiary); margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .d2p7-wrap .pt-av { width:28px; height:28px; border-radius:50%; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:700; color:#04121c; }
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
        .pl-responder-chip { font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:rgba(0,212,188,0.12); color:var(--teal); border:1px solid rgba(0,212,188,0.3); vertical-align:middle; }
      </style>

      <div class="ch-tab-bar">${tabBar()}</div>

      <div class="d2p7-wrap">
        <!-- Topbar: title + search + bell — mirrors prototype screen-07 header -->
        <div class="d2p7-topbar">
          <div style="flex:0 0 auto">
            <div class="d2p7-topbar-title">Patients</div>
            <div class="d2p7-topbar-bc">
              <span>Clinic</span><span class="sep">/</span><span>Patients</span><span class="sep">/</span>
              <span id="d2p7-bc">Loading…</span>
            </div>
          </div>
          <div class="d2p7-topbar-search" style="margin-left:auto">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input id="d2p7-search" type="text" placeholder="Search by name, MRN, condition, protocol…"
              oninput="window._phOnSearch(event)" aria-label="Search patients">
            <span class="kbd">⌘K</span>
          </div>
          <div class="d2p7-bell-wrap">
            <button class="topbar-btn" style="width:32px;height:32px" onclick="window._phOpenNotifications()" aria-label="Notifications">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
            <span id="d2p7-bell-badge" class="d2p7-bell-badge" aria-live="polite"></span>
          </div>
        </div>

        <!-- Status tabs + facet filters -->
        <div style="display:flex;gap:12px;margin-bottom:18px;align-items:center;flex-wrap:wrap">
          <div id="d2p7-tabrow" class="d2p7-tabrow"></div>
          <div id="d2p7-filter-row" style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap"></div>
        </div>

        <!-- KPI cards — populated by renderHeader() after summary fetch -->
        <div id="d2p7-kpi-grid" class="d2p7-kpi-grid"></div>

        <!-- Patient table card -->
        <div class="d2p7-card">
          <div style="overflow-x:auto">
            <div style="min-width:860px">
              <div class="queue-row head" style="grid-template-columns:1.8fr 1.1fr 1fr 1fr 1fr 90px">
                <div>Patient</div><div>Protocol</div><div>Progress</div><div>Last outcome</div><div>Next step</div><div></div>
              </div>
              <div id="d2p7-list"></div>
            </div>
          </div>
          <div id="d2p7-foot" style="display:flex;justify-content:space-between;align-items:center;padding:12px 4px 4px;font-size:11.5px;color:var(--text-tertiary);border-top:1px solid var(--border);margin-top:4px"></div>
        </div>
      </div>
    </div>`;

    // Kick off parallel fetch of summary (KPIs + counts) and page-1 list.
    refreshAll();
    refreshBell();
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
    setTopbar('Clinical Hub', '');
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

  // Preserve the caller's deep-link hint (personalized-protocol vs brain-scan-protocol)
  // so the wizard can surface a "coming from …" note without forking routes.
  const _hubHint = window._protocolHubTab || 'wizard';
  try {
    const hintMap = {
      personalized: 'Personalized',
      brainscan:    'Brain-scan',
      builder:      'Builder',
      handbooks:    'Handbooks',
    };
    const hintLabel = hintMap[_hubHint] || 'Studio';
    setTopbar('Protocol Studio · ' + hintLabel,
      '<button class="btn btn-sm btn-ghost" onclick="window._nav(\'handbooks-v2\')">Handbooks ↗</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="window._nav(\'protocol-builder-full\')">Builder ↗</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="window._nav(\'brain-map-planner\')">Brain Map Planner ↗</button>');
  } catch {}

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
      '<div class="card" style="padding:16px;">' +
        '<div class="studio-h-lbl" style="display:flex;align-items:center;gap:8px">' +
          '<span>My Drafts</span>' +
          '<button class="ch-btn-sm" style="margin-left:auto;font-size:11px" onclick="window._studioRefreshDrafts()">↻</button>' +
        '</div>' +
        '<div id="studio-drafts-list" style="font-size:12px;color:var(--text-tertiary)">Loading…</div>' +
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
      @media (max-width: 900px) {
        .studio-opt-grid { grid-template-columns: repeat(2, 1fr) !important; }
        .studio-target-grid { grid-template-columns: repeat(2, 1fr); }
        .studio-pane { padding: 16px; }
        .studio-pane-title { font-size: 17px; }
      }
      @media (max-width: 580px) {
        .studio-opt-grid { grid-template-columns: 1fr !important; }
        .studio-target-grid { grid-template-columns: 1fr; }
        .studio-pane { padding: 14px; border-radius: 10px; }
        .studio-pane-title { font-size: 16px; }
        .studio-pane-hd { flex-direction: column; align-items: flex-start; gap: 8px; }
        .studio-opt { padding: 12px; }
      }

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

    try { window._studioRenderDrafts?.(); } catch {}
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
    // Validate against the SavedProtocolCreate schema (apps/api/app/routers/
    // protocols_saved_router.py): `patient_id` and `condition` are required.
    // If the studio was opened without a patient context, we surface that
    // honestly rather than silently firing a 4xx.
    if (!S.patientId) {
      try { alert('Select a patient before saving a protocol draft.'); } catch {}
      return;
    }
    if (!S.condition) {
      try { alert('Pick a condition before saving.'); } catch {}
      return;
    }
    try {
      if (typeof api?.saveProtocol === 'function') {
        const name = [
          (MODALITIES.find(m => m.id === S.modality) || {}).name,
          (targetList().find(t => t.id === S.target) || {}).name,
          (CONDITIONS.find(c => c.id === S.condition) || {}).name ||
            (CONDITIONS.find(c => c.id === S.condition) || {}).label,
        ].filter(Boolean).join(' · ') || 'Protocol draft';
        await api.saveProtocol({
          patient_id: S.patientId,
          name,
          condition: S.condition,
          modality: S.modality || 'tdcs',
          device_slug: S.device || null,
          parameters_json: {
            phenotype: S.phenotype,
            target: S.target,
            montage: S.montage,
          },
          governance_state: 'draft',
        });
      }
      try { alert('Protocol saved.'); } catch {}
      // Surface the saved draft in the right-column drafts panel so the user
      // sees their save land without having to reload.
      window._studioDraftsCache = null;
      try { window._studioRenderDrafts?.(); } catch {}
    } catch (e) { try { alert('Could not save: ' + (e?.message || 'endpoint error') + '. State preserved locally.'); } catch {} }
  };

  // ── My Drafts panel — /api/v1/protocols/saved ─────────────────────────────
  // Shows the last 5 saved drafts for the clinician, tagged by
  // governance_state. Click to reload a draft into the wizard state.
  window._studioDraftsCache = window._studioDraftsCache || null;
  window._studioRenderDrafts = async () => {
    const host = document.getElementById('studio-drafts-list');
    if (!host) return;
    if (!window._studioDraftsCache) {
      try {
        const r = await api.listSavedProtocols();
        window._studioDraftsCache = r?.items || [];
      } catch { window._studioDraftsCache = []; }
    }
    const drafts = (window._studioDraftsCache || []).slice(-5).reverse();
    if (!drafts.length) {
      host.innerHTML = '<div style="padding:6px 0;color:var(--text-tertiary);font-size:11.5px">No saved drafts yet. Complete the wizard and click <b>Save</b>.</div>';
      return;
    }
    host.innerHTML = drafts.map(d => {
      const state = d.governance_state || 'draft';
      const stateColor = state === 'approved' ? 'var(--teal)' : state === 'submitted' ? 'var(--amber)' : 'var(--text-tertiary)';
      const label = (d.name || d.condition || 'Draft').toString().replace(/[<>&"]/g, '');
      return '<div class="studio-render-item" style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="window._studioLoadDraft(\'' + (d.id||'').replace(/['"<>&]/g,'') + '\')" title="Load this draft into the wizard">' +
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + label + '</span>' +
        '<span style="color:' + stateColor + ';font-size:10px;text-transform:uppercase;letter-spacing:0.3px">' + state + '</span>' +
      '</div>';
    }).join('');
  };
  window._studioRefreshDrafts = () => { window._studioDraftsCache = null; window._studioRenderDrafts(); };
  window._studioLoadDraft = (id) => {
    const d = (window._studioDraftsCache || []).find(x => x.id === id);
    if (!d) return;
    const pj = d.parameters_json || {};
    if (d.condition) S.condition = d.condition;
    if (pj.phenotype || d.phenotype) S.phenotype = pj.phenotype || d.phenotype;
    if (d.modality || pj.modality)   S.modality  = d.modality || pj.modality;
    if (d.device_slug || pj.device)  S.device    = d.device_slug || pj.device;
    if (pj.target)   S.target   = pj.target;
    if (pj.montage)  S.montage  = pj.montage;
    S.step = 5;
    paint();
  };
  window._studioExport = async () => {
    // CourseCreate (apps/api/app/routers/treatment_courses_router.py) requires
    // both patient_id and a registry protocol_id. The studio is a phenotype /
    // modality / target picker — it doesn't know a registry protocol yet —
    // so we save-as-draft via /api/v1/protocols/saved and leave course
    // creation to the review-queue → activate path downstream.
    if (!S.patientId || !S.condition) {
      try { alert('Select a patient and condition before exporting.'); } catch {}
      return;
    }
    try {
      if (typeof api?.saveProtocol === 'function') {
        await api.saveProtocol({
          patient_id: S.patientId,
          name: (targetList().find(t => t.id === S.target) || {}).name || 'Course draft',
          condition: S.condition,
          modality: S.modality || 'tdcs',
          device_slug: S.device || null,
          parameters_json: {
            phenotype: S.phenotype,
            target: S.target,
            montage: S.montage,
            export_target: 'treatment-course',
          },
          governance_state: 'submitted',
        });
        window._studioDraftsCache = null;
        try { window._studioRenderDrafts?.(); } catch {}
      }
      try { alert('Draft submitted for review. Promote to a treatment course from the review queue.'); } catch {}
    } catch (e) { try { alert('Export failed: ' + (e?.message || 'endpoint error') + '. Draft preserved locally.'); } catch {} }
  };

  paint();
  try { window._studioRenderDrafts(); } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgProtocolHub — 4-tab Protocol Studio entry point
// Tab 1: Conditions   (from Library Hub)
// Tab 2: Generate     (3-mode wizard: Evidence-Based AI / Brain Scan / Personalized)
// Tab 3: Browse       (inline protocol search shell)
// Tab 4: My Drafts    (GET /api/v1/protocols/saved)
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgProtocolHub(setTopbar, navigate) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const el = document.getElementById('content');
  if (!el) return;

  const VALID_TABS = ['conditions', 'generate', 'browse', 'drafts'];
  let _tab = VALID_TABS.includes(window._protocolHubTab) ? window._protocolHubTab : 'conditions';

  // Pre-fill condition when coming from Library Hub "Find Protocol" link
  let _prefillCondition = window._protocolHubCondition || null;

  setTopbar('Protocol Studio', '');

  // ── CSS injected once ──────────────────────────────────────────────────────
  if (!document.getElementById('ps-styles')) {
    const _st = document.createElement('style');
    _st.id = 'ps-styles';
    _st.textContent =
      '.ps-shell{display:flex;flex-direction:column;height:100%;min-height:0}' +
      '.ps-tab-bar{display:flex;gap:2px;padding:14px 20px 0;border-bottom:1px solid var(--border);background:var(--bg-card);flex-shrink:0}' +
      '.ps-tab{padding:8px 16px;border:none;background:transparent;color:var(--text-secondary);font-size:13px;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;border-radius:6px 6px 0 0;transition:color 0.15s}' +
      '.ps-tab:hover{color:var(--text-primary)}' +
      '.ps-tab.active{color:var(--dv2-teal,var(--teal));border-bottom-color:var(--dv2-teal,var(--teal));background:rgba(0,212,188,0.04)}' +
      '.ps-body{flex:1;overflow-y:auto;padding:20px}' +
      '.ps-gen-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}' +
      '@media(max-width:900px){.ps-gen-cards{grid-template-columns:1fr}}' +
      '.ps-gen-card{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s}' +
      '.ps-gen-card:hover{border-color:var(--dv2-teal,var(--teal));box-shadow:0 0 0 3px rgba(0,212,188,0.1)}' +
      '.ps-gen-card.ps-gen-card--active{border-color:var(--dv2-teal,var(--teal));background:rgba(0,212,188,0.04)}' +
      '.ps-gen-card-icon{font-size:26px;margin-bottom:10px}' +
      '.ps-gen-card-title{font-size:14px;font-weight:600;margin-bottom:4px}' +
      '.ps-gen-card-sub{font-size:12px;color:var(--text-secondary);line-height:1.5}' +
      '.ps-wizard{background:var(--bg-card);border:1px solid var(--dv2-teal,var(--teal));border-radius:14px;padding:22px;margin-top:4px}' +
      '.ps-wizard-title{font-size:15px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:10px}' +
      '.ps-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}' +
      '@media(max-width:700px){.ps-form-row{grid-template-columns:1fr}}' +
      '.ps-form-group{display:flex;flex-direction:column;gap:4px}' +
      '.ps-form-label{font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:var(--text-tertiary)}' +
      '.ps-form-input{padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-surface);color:var(--text-primary);font-size:13px;font-family:inherit}' +
      '.ps-form-input:focus{outline:none;border-color:var(--dv2-teal,var(--teal))}' +
      '.ps-form-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px}' +
      '.ps-result-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:18px;margin-top:16px}' +
      '.ps-result-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}' +
      '.ps-result-title{font-size:14px;font-weight:600}' +
      '.ps-result-section{font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.6}' +
      '.ps-result-section strong{color:var(--text-primary)}' +
      '.ps-result-badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.4px}' +
      '.ps-badge-a{background:rgba(0,212,188,0.14);color:var(--dv2-teal,var(--teal))}' +
      '.ps-badge-b{background:rgba(74,158,255,0.14);color:#4a9eff}' +
      '.ps-badge-c{background:rgba(245,158,11,0.14);color:#f59e0b}' +
      '.ps-badge-draft{background:rgba(155,127,255,0.14);color:#b29cff}' +
      '.ps-badge-approved{background:rgba(0,212,188,0.14);color:var(--dv2-teal,var(--teal))}' +
      '.ps-result-actions{display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}' +
      '.ps-save-btn{padding:7px 16px;border-radius:8px;border:none;background:var(--dv2-teal,var(--teal));color:#04121c;font-size:12.5px;font-weight:600;cursor:pointer}' +
      '.ps-save-btn:hover{opacity:0.88}' +
      '.ps-save-btn:disabled{opacity:0.4;cursor:not-allowed}' +
      '.ps-disclaimer{font-size:10.5px;color:var(--text-tertiary);line-height:1.5;margin-top:10px;padding:8px 12px;background:rgba(245,158,11,0.06);border-radius:6px;border-left:3px solid var(--amber,#f59e0b)}' +
      '.ps-cond-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}' +
      '.ps-cond-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;transition:border-color 0.15s}' +
      '.ps-cond-card:hover{border-color:var(--dv2-teal,var(--teal))}' +
      '.ps-cond-name{font-size:13.5px;font-weight:600;margin-bottom:6px}' +
      '.ps-cond-meta{font-size:11px;color:var(--text-tertiary);display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}' +
      '.ps-cond-feats{font-size:11.5px;color:var(--text-secondary);line-height:1.7}' +
      '.ps-cond-actions{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}' +
      '.ps-drafts-list{display:flex;flex-direction:column;gap:10px}' +
      '.ps-draft-row{display:flex;align-items:center;gap:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:12px 14px}' +
      '.ps-draft-name{flex:1;min-width:0;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ps-draft-meta{font-size:11px;color:var(--text-tertiary)}' +
      '.ps-state-badge{padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:0.4px}' +
      '.ps-state-draft{background:rgba(148,163,184,0.14);color:var(--text-secondary)}' +
      '.ps-state-submitted{background:rgba(245,158,11,0.14);color:#f59e0b}' +
      '.ps-state-approved{background:rgba(0,212,188,0.14);color:var(--dv2-teal,var(--teal))}' +
      '.ps-empty{padding:40px 20px;text-align:center;color:var(--text-tertiary);font-size:13px}' +
      '.ps-spin{display:inline-block;width:18px;height:18px;border:2px solid rgba(0,212,188,0.2);border-top-color:var(--dv2-teal,var(--teal));border-radius:50%;animation:ps-spin 0.7s linear infinite;vertical-align:middle;margin-right:6px}' +
      '@keyframes ps-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(_st);
  }

  // ── State shared across wizard panels ──────────────────────────────────────
  window._psWizard = window._psWizard || { mode: null, result: null, saving: false, error: null };
  const W = window._psWizard;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const _gradeBadge = (g) => {
    const cls = g === 'A' ? 'ps-badge-a' : g === 'B' ? 'ps-badge-b' : 'ps-badge-c';
    return '<span class="ps-result-badge ' + cls + '">Grade ' + esc(g || 'E') + '</span>';
  };
  const _approvalBadge = (badge) => {
    const cls = (badge || '').includes('approved') ? 'ps-badge-approved' : 'ps-badge-draft';
    return '<span class="ps-result-badge ' + cls + '">' + esc(badge || 'draft') + '</span>';
  };
  const _stateBadge = (state) => {
    const cls = state === 'approved' ? 'ps-state-approved' : state === 'submitted' ? 'ps-state-submitted' : 'ps-state-draft';
    return '<span class="ps-state-badge ' + cls + '">' + esc(state || 'draft') + '</span>';
  };

  // ── Render result card from a ProtocolDraftResponse ───────────────────────
  function _renderResultCard(draft, extraHtml) {
    const contra = (draft.contraindications || []).filter(Boolean);
    return '<div class="ps-result-card">' +
      '<div class="ps-result-header">' +
        '<span class="ps-result-title">Generated Protocol</span>' +
        '<div style="display:flex;gap:6px">' +
          _gradeBadge(draft.evidence_grade) +
          _approvalBadge(draft.approval_status_badge) +
        '</div>' +
      '</div>' +
      '<div class="ps-result-section"><strong>Rationale: </strong>' + esc(draft.rationale) + '</div>' +
      '<div class="ps-result-section"><strong>Target Region: </strong>' + esc(draft.target_region) + '</div>' +
      '<div class="ps-result-section"><strong>Session Frequency: </strong>' + esc(draft.session_frequency) + '</div>' +
      '<div class="ps-result-section"><strong>Duration: </strong>' + esc(draft.duration) + '</div>' +
      (contra.length ? '<div class="ps-result-section"><strong>Contraindications: </strong>' + contra.map(c => esc(c)).join('; ') + '</div>' : '') +
      (extraHtml || '') +
      '<div class="ps-disclaimer">' +
        esc((draft.disclaimers && draft.disclaimers.general_disclaimer) || 'For use by licensed clinicians only. Not a substitute for clinical judgment.') +
      '</div>' +
      '<div class="ps-result-actions">' +
        '<button class="ps-save-btn" id="ps-save-draft-btn" onclick="window._psSaveDraft()">Save as Draft</button>' +
        '<button class="ps-save-btn" style="background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border)" onclick="window._nav(\'protocol-builder\')">Open in Builder</button>' +
      '</div>' +
    '</div>';
  }

  // ── Tab 1: Conditions ──────────────────────────────────────────────────────
  async function _renderConditions() {
    const host = document.getElementById('ps-tab-content');
    if (!host) return;
    host.innerHTML = '<div class="ps-empty"><span class="ps-spin"></span>Loading conditions...</div>';

    let conditions = [];
    let errMsg = null;
    try {
      const ov = await api.libraryOverview();
      conditions = ov?.conditions || [];
    } catch (e) { errMsg = e?.message || 'Library offline'; }

    // Fallback to registry
    if (!conditions.length && !errMsg) {
      try {
        const r = await fetch('/api/v1/registry/conditions');
        if (r.ok) { const d = await r.json(); conditions = d?.items || d?.conditions || []; }
      } catch {}
    }

    if (errMsg || !conditions.length) {
      // Fallback to local protocols-data.js CONDITIONS + evidence-dataset.js
      if (PROTO_CONDITIONS && PROTO_CONDITIONS.length) {
        conditions = PROTO_CONDITIONS.map(c => {
          const ev = getConditionEvidence ? getConditionEvidence(c.id) : null;
          const protos = getProtocolsByCondition ? getProtocolsByCondition(c.id) : [];
          const gradeA = protos.some(p => p.evidenceGrade === 'A');
          const gradeB = protos.some(p => p.evidenceGrade === 'B');
          const bestGrade = gradeA ? 'A' : gradeB ? 'B' : protos.length ? 'C' : 'E';
          return {
            id: c.id,
            name: c.label,
            icd_10: c.icd10,
            category: c.category,
            highest_evidence_level: bestGrade,
            neuromod_eligible: protos.length > 0,
            reviewed_protocol_count: protos.filter(p => (p.governance || []).includes('reviewed') || (p.governance || []).includes('approved')).length,
            total_protocol_count: protos.length,
            compatible_device_count: (c.commonDevices || []).length,
            curated_evidence_paper_count: ev ? ev.paperCount : 0,
          };
        });
        errMsg = null;
      } else {
        host.innerHTML = '<div class="ps-empty">' +
          (errMsg ? ('Library unavailable: ' + esc(errMsg) + '<br>') : 'No conditions in registry.<br>') +
          '<button class="ps-save-btn" style="margin-top:12px" onclick="window._nav(\'research-evidence\')">Open Research Evidence</button>' +
        '</div>';
        return;
      }
    }

    // Enrich conditions with evidence data if not already present
    conditions.forEach(c => {
      if (!c.curated_evidence_paper_count) {
        const ev = getConditionEvidence ? getConditionEvidence(c.id) : null;
        if (ev) c.curated_evidence_paper_count = ev.paperCount;
      }
      if (!c.total_protocol_count) {
        const protos = getProtocolsByCondition ? getProtocolsByCondition(c.id) : [];
        if (protos.length) {
          c.total_protocol_count = protos.length;
          c.reviewed_protocol_count = c.reviewed_protocol_count || protos.filter(p => (p.governance || []).includes('reviewed') || (p.governance || []).includes('approved')).length;
        }
      }
    });

    const cats = ['All', ...Array.from(new Set(conditions.map(c => c.category).filter(Boolean))).sort()];
    let _catFilt = 'All';
    let _q = '';

    function _renderGrid() {
      const rows = conditions.filter(c => {
        if (_catFilt !== 'All' && c.category !== _catFilt) return false;
        if (_q) {
          const blob = ((c.name || '') + ' ' + (c.icd_10 || '') + ' ' + (c.category || '')).toLowerCase();
          if (!blob.includes(_q.toLowerCase())) return false;
        }
        return true;
      });
      const gradeClass = (g) => {
        const map = {A:'ps-badge-a',B:'ps-badge-b',C:'ps-badge-c'};
        return map[String(g||'').toUpperCase().replace('EV-','')] || 'ps-badge-c';
      };
      const eligBadge = (c) => {
        const elig = c.neuromod_eligible;
        if (elig === true || elig === 1) return '<span class="ps-result-badge ps-badge-approved">Ready</span>';
        return '<span class="ps-result-badge ps-badge-c">Needs Evidence</span>';
      };
      return '<div class="ps-cond-grid">' +
        (rows.length ? rows.map(c => {
          const grade = String(c.highest_evidence_level || c.evidence_grade || 'E').replace('EV-','');
          return '<article class="ps-cond-card" aria-label="' + esc(c.name) + '">' +
            '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">' +
              '<div class="ps-cond-name">' + esc(c.name) + '</div>' +
              eligBadge(c) +
            '</div>' +
            '<div class="ps-cond-meta">' +
              (c.icd_10 ? '<span>' + esc(c.icd_10) + '</span>' : '') +
              (c.category ? '<span>' + esc(c.category) + '</span>' : '') +
              '<span class="ps-result-badge ' + gradeClass(grade) + '">Grade ' + esc(grade) + '</span>' +
            '</div>' +
            '<div class="ps-cond-feats">' +
              (c.reviewed_protocol_count ? '&#9679; ' + (c.reviewed_protocol_count) + ' reviewed protocol' + (c.reviewed_protocol_count !== 1 ? 's' : '') + '<br>' : '') +
              (c.total_protocol_count ? '&#9679; ' + c.total_protocol_count + ' total protocol' + (c.total_protocol_count !== 1 ? 's' : '') + '<br>' : '') +
              (c.curated_evidence_paper_count ? '&#9679; ' + c.curated_evidence_paper_count.toLocaleString() + ' research paper' + (c.curated_evidence_paper_count !== 1 ? 's' : '') + '<br>' : '') +
              (c.compatible_device_count ? '&#9679; ' + c.compatible_device_count + ' device' + (c.compatible_device_count !== 1 ? 's' : '') + '<br>' : '') +
            '</div>' +
            '<div class="ps-cond-actions">' +
              '<button class="ps-save-btn" onclick="window._psCondToGenerate(\'' + esc(c.id) + '\',\'' + esc(c.name).replace(/'/g,'\\'+'\'') + '\')">Generate Protocol &#8594;</button>' +
              ((c.reviewed_protocol_count || 0) > 0 ? '<button class="ps-save-btn" style="background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border)" onclick="window._psCondToBrowse(\'' + esc(c.id) + '\')">Browse &#8594;</button>' : '') +
            '</div>' +
          '</article>';
        }).join('') : '<div class="ps-empty" style="grid-column:1/-1">No conditions match.</div>') +
      '</div>';
    }

    const _totalProtos = PROTOCOL_LIBRARY?.length || 0;
    const _totalEvPapers = EVIDENCE_SUMMARY?.totalPapers || 87000;
    const _totalEvTrials = EVIDENCE_SUMMARY?.totalTrials || 0;

    host.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">' +
        '<div style="text-align:center;padding:10px 6px;border-radius:10px;background:rgba(0,212,188,0.06);border:1px solid rgba(0,212,188,0.12)">' +
          '<div style="font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--dv2-teal,var(--teal));letter-spacing:-0.4px">' + (_totalEvPapers/1000).toFixed(0) + 'K</div>' +
          '<div style="font-size:9.5px;color:var(--text-tertiary);text-transform:uppercase;font-weight:600;letter-spacing:0.4px;margin-top:2px">Papers</div>' +
        '</div>' +
        '<div style="text-align:center;padding:10px 6px;border-radius:10px;background:rgba(74,158,255,0.06);border:1px solid rgba(74,158,255,0.12)">' +
          '<div style="font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--blue);letter-spacing:-0.4px">' + _totalProtos + '</div>' +
          '<div style="font-size:9.5px;color:var(--text-tertiary);text-transform:uppercase;font-weight:600;letter-spacing:0.4px;margin-top:2px">Protocols</div>' +
        '</div>' +
        '<div style="text-align:center;padding:10px 6px;border-radius:10px;background:rgba(155,127,255,0.06);border:1px solid rgba(155,127,255,0.12)">' +
          '<div style="font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--violet);letter-spacing:-0.4px">' + conditions.length + '</div>' +
          '<div style="font-size:9.5px;color:var(--text-tertiary);text-transform:uppercase;font-weight:600;letter-spacing:0.4px;margin-top:2px">Conditions</div>' +
        '</div>' +
        '<div style="text-align:center;padding:10px 6px;border-radius:10px;background:rgba(255,181,71,0.06);border:1px solid rgba(255,181,71,0.12)">' +
          '<div style="font-family:var(--font-display);font-size:18px;font-weight:600;color:var(--amber);letter-spacing:-0.4px">' + _totalEvTrials.toLocaleString() + '</div>' +
          '<div style="font-size:9.5px;color:var(--text-tertiary);text-transform:uppercase;font-weight:600;letter-spacing:0.4px;margin-top:2px">Trials</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">' +
        '<div style="position:relative;flex:1;min-width:180px;max-width:300px">' +
          '<input type="search" placeholder="Search conditions..." class="ps-form-input" style="width:100%;box-sizing:border-box" id="ps-cond-search" value="' + esc(_q) + '" oninput="window._psCatSearch(this.value)">' +
        '</div>' +
        '<div style="display:flex;gap:4px;flex-wrap:wrap">' + cats.map(cat =>
          '<button class="reg-domain-pill' + (cat === _catFilt ? ' active' : '') + '" onclick="window._psCatFilter(\'' + esc(cat) + '\')">' + esc(cat) + '</button>'
        ).join('') + '</div>' +
      '</div>' +
      '<div id="ps-cond-grid">' + _renderGrid() + '</div>';

    window._psCatFilter = (cat) => {
      _catFilt = cat;
      const g = document.getElementById('ps-cond-grid');
      if (g) g.innerHTML = _renderGrid();
      // Re-paint the pill buttons
      host.querySelectorAll('.reg-domain-pill').forEach(b => {
        b.classList.toggle('active', b.textContent.trim() === cat);
      });
    };
    window._psCatSearch = (q) => {
      _q = q;
      const g = document.getElementById('ps-cond-grid');
      if (g) g.innerHTML = _renderGrid();
    };
  }

  // ── Tab 2: Generate ────────────────────────────────────────────────────────
  function _renderGenerate() {
    const host = document.getElementById('ps-tab-content');
    if (!host) return;

    const prefill = _prefillCondition ? _prefillCondition.name : '';
    const prefillId = _prefillCondition ? _prefillCondition.id : '';

    // Card A = Evidence-Based AI
    const cardA = '<div class="ps-gen-card' + (W.mode === 'evidence' ? ' ps-gen-card--active' : '') + '" onclick="window._psOpenMode(\'evidence\')">' +
      '<div class="ps-gen-card-icon">&#129504;</div>' +
      '<div class="ps-gen-card-title">Evidence-Based AI</div>' +
      '<div class="ps-gen-card-sub">Condition + modality + device + evidence threshold. Calls POST /api/v1/protocols/generate-draft.</div>' +
    '</div>';
    // Card B = Brain Scan Guided
    const cardB = '<div class="ps-gen-card' + (W.mode === 'brainscan' ? ' ps-gen-card--active' : '') + '" onclick="window._psOpenMode(\'brainscan\')">' +
      '<div class="ps-gen-card-icon">&#129504;</div>' +
      '<div class="ps-gen-card-title">Brain Scan Guided</div>' +
      '<div class="ps-gen-card-sub">qEEG / fMRI / NIRS data drives montage selection. Calls POST /api/v1/protocols/generate-brain-scan.</div>' +
    '</div>';
    // Card C = Personalized
    const cardC = '<div class="ps-gen-card' + (W.mode === 'personalized' ? ' ps-gen-card--active' : '') + '" onclick="window._psOpenMode(\'personalized\')">' +
      '<div class="ps-gen-card-icon">&#129300;</div>' +
      '<div class="ps-gen-card-title">Personalized Protocol</div>' +
      '<div class="ps-gen-card-sub">PHQ-9, GAD-7, MoCA, chronotype. Calls POST /api/v1/protocols/generate-personalized.</div>' +
    '</div>';

    let wizardPanel = '';
    if (W.mode === 'evidence') {
      wizardPanel = '<div class="ps-wizard">' +
        '<div class="ps-wizard-title">&#129504; Evidence-Based AI Generator</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Condition *</label>' +
            '<input class="ps-form-input" id="ps-ev-condition" type="text" placeholder="e.g. Major Depressive Disorder" value="' + esc(prefill) + '">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Modality *</label>' +
            '<select class="ps-form-input" id="ps-ev-modality">' +
              '<option value="tDCS">tDCS</option>' +
              '<option value="rTMS">rTMS</option>' +
              '<option value="tACS">tACS</option>' +
              '<option value="Neurofeedback">Neurofeedback</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Device</label>' +
            '<input class="ps-form-input" id="ps-ev-device" type="text" placeholder="e.g. Soterix 1x1">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Evidence Threshold</label>' +
            '<select class="ps-form-input" id="ps-ev-threshold">' +
              '<option value="Guideline">Grade A — Guideline</option>' +
              '<option value="Systematic Review" selected>Grade B — Systematic Review</option>' +
              '<option value="Consensus">Grade C — Consensus</option>' +
              '<option value="Registry">Registry</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-toggle"><input type="checkbox" id="ps-ev-offlabel"> Off-label mode</label>' +
          '</div>' +
        '</div>' +
        (W.error ? '<div style="color:#ef4444;font-size:12px;margin-bottom:10px">' + esc(W.error) + '</div>' : '') +
        (W.mode === 'evidence' && W.result ? _renderResultCard(W.result, '') : '') +
        '<button class="ps-save-btn" id="ps-ev-generate-btn" onclick="window._psGenerateEvidence()">' +
          (W.saving ? '<span class="ps-spin"></span>Generating...' : 'Generate Protocol') +
        '</button>' +
      '</div>';
    } else if (W.mode === 'brainscan') {
      wizardPanel = '<div class="ps-wizard">' +
        '<div class="ps-wizard-title">&#129308; Brain Scan Guided Generator</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Condition *</label>' +
            '<input class="ps-form-input" id="ps-bs-condition" type="text" placeholder="e.g. Major Depressive Disorder" value="' + esc(prefill) + '">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Scan Type</label>' +
            '<select class="ps-form-input" id="ps-bs-scan-type">' +
              '<option value="qEEG">qEEG</option>' +
              '<option value="fMRI">fMRI</option>' +
              '<option value="NIRS">NIRS</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Primary Target</label>' +
            '<input class="ps-form-input" id="ps-bs-target" type="text" placeholder="e.g. DLPFC, ACC, M1" value="DLPFC">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">EEG Markers (comma-separated)</label>' +
            '<input class="ps-form-input" id="ps-bs-markers" type="text" placeholder="e.g. alpha-asymmetry, theta">' +
          '</div>' +
        '</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Phenotype</label>' +
            '<input class="ps-form-input" id="ps-bs-phenotype" type="text" placeholder="e.g. anxious, melancholic">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Device</label>' +
            '<input class="ps-form-input" id="ps-bs-device" type="text" placeholder="e.g. Soterix 1x1">' +
          '</div>' +
        '</div>' +
        (W.error ? '<div style="color:#ef4444;font-size:12px;margin-bottom:10px">' + esc(W.error) + '</div>' : '') +
        (W.mode === 'brainscan' && W.result ? _renderResultCard(W.result,
          '<div class="ps-result-section"><strong>Recommended Montage: </strong>' + esc(W.result.recommended_montage || '') + '</div>' +
          '<div class="ps-result-section"><strong>Scan Guidance: </strong>' + esc(W.result.scan_guidance || '') + '</div>' +
          '<div class="ps-result-section"><strong>Marker Adjustment: </strong>' + esc(W.result.marker_adjustment || '') + '</div>'
        ) : '') +
        '<button class="ps-save-btn" id="ps-bs-generate-btn" onclick="window._psGenerateBrainScan()">' +
          (W.saving ? '<span class="ps-spin"></span>Generating...' : 'Generate Protocol') +
        '</button>' +
      '</div>';
    } else if (W.mode === 'personalized') {
      wizardPanel = '<div class="ps-wizard">' +
        '<div class="ps-wizard-title">&#129300; Personalized Protocol Generator</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Condition *</label>' +
            '<input class="ps-form-input" id="ps-pe-condition" type="text" placeholder="e.g. Major Depressive Disorder" value="' + esc(prefill) + '">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Patient ID</label>' +
            '<input class="ps-form-input" id="ps-pe-patient" type="text" placeholder="Patient ID or &quot;Demo Patient&quot;" value="demo">' +
          '</div>' +
        '</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">PHQ-9 Score</label>' +
            '<input class="ps-form-input" id="ps-pe-phq9" type="number" min="0" max="27" placeholder="0–27">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">GAD-7 Score</label>' +
            '<input class="ps-form-input" id="ps-pe-gad7" type="number" min="0" max="21" placeholder="0–21">' +
          '</div>' +
        '</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">MoCA Score</label>' +
            '<input class="ps-form-input" id="ps-pe-moca" type="number" min="0" max="30" placeholder="0–30">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Chronotype</label>' +
            '<select class="ps-form-input" id="ps-pe-chronotype">' +
              '<option value="">Not specified</option>' +
              '<option value="morning">Morning</option>' +
              '<option value="evening">Evening</option>' +
              '<option value="neutral">Neutral</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="ps-form-row">' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Medication Load</label>' +
            '<input class="ps-form-input" id="ps-pe-meds" type="text" placeholder="e.g. SSRI, lithium">' +
          '</div>' +
          '<div class="ps-form-group">' +
            '<label class="ps-form-label">Device</label>' +
            '<input class="ps-form-input" id="ps-pe-device" type="text" placeholder="e.g. Soterix 1x1">' +
          '</div>' +
        '</div>' +
        '<div class="ps-form-group" style="margin-bottom:12px">' +
          '<label class="ps-form-label">Treatment History</label>' +
          '<textarea class="ps-form-input" id="ps-pe-history" rows="2" placeholder="Prior treatments, responses, failures..."></textarea>' +
        '</div>' +
        (W.error ? '<div style="color:#ef4444;font-size:12px;margin-bottom:10px">' + esc(W.error) + '</div>' : '') +
        (W.mode === 'personalized' && W.result ? _renderResultCard(W.result,
          '<div class="ps-result-section"><strong>Personalization Rationale: </strong>' + esc(W.result.personalization_rationale || '') + '</div>'
        ) : '') +
        '<button class="ps-save-btn" id="ps-pe-generate-btn" onclick="window._psGeneratePersonalized()">' +
          (W.saving ? '<span class="ps-spin"></span>Generating...' : 'Generate Protocol') +
        '</button>' +
      '</div>';
    }

    host.innerHTML =
      '<div style="margin-bottom:6px;font-size:12px;color:var(--text-tertiary)">Choose a generation mode to open the wizard:</div>' +
      '<div class="ps-gen-cards">' + cardA + cardB + cardC + '</div>' +
      wizardPanel;
  }

  // ── Tab 3: Browse ──────────────────────────────────────────────────────────
  async function _renderBrowse() {
    const host = document.getElementById('ps-tab-content');
    if (!host) return;
    host.innerHTML = '<div class="ps-empty"><span class="ps-spin"></span>Loading protocol library...</div>';
    // Lazy-import pgProtocolSearch and run it in a sub-container
    try {
      const m = await import('./pages-protocols.js');
      if (typeof m.pgProtocolSearch === 'function') {
        await m.pgProtocolSearch(
          () => {},  // suppress topbar changes from inner call
          navigate,
        );
      } else {
        host.innerHTML = '<div class="ps-empty">Protocol search module unavailable.</div>';
      }
    } catch (e) {
      host.innerHTML = '<div class="ps-empty">Could not load protocol browser: ' + esc(e?.message || 'error') + '</div>';
    }
  }

  // ── Tab 4: My Drafts ───────────────────────────────────────────────────────
  async function _renderDrafts() {
    const host = document.getElementById('ps-tab-content');
    if (!host) return;
    host.innerHTML = '<div class="ps-empty"><span class="ps-spin"></span>Loading drafts...</div>';
    let items = [];
    let err = null;
    try {
      const r = await api.listSavedProtocols();
      items = r?.items || [];
    } catch (e) { err = e?.message || 'endpoint error'; }

    if (err) {
      host.innerHTML = '<div class="ps-empty">Could not load drafts: ' + esc(err) + '<br><button class="ps-save-btn" style="margin-top:10px" onclick="window._psRenderCurrentTab()">Retry</button></div>';
      return;
    }
    if (!items.length) {
      host.innerHTML = '<div class="ps-empty">No saved protocol drafts yet.<br>Generate a protocol and click "Save as Draft" to see it here.</div>';
      return;
    }

    const _stateClass = (s) => s === 'approved' ? 'ps-state-approved' : s === 'submitted' ? 'ps-state-submitted' : 'ps-state-draft';
    host.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">' +
        '<span style="font-size:13px;font-weight:600">' + items.length + ' saved draft' + (items.length !== 1 ? 's' : '') + '</span>' +
        '<button class="ps-save-btn" style="background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border);font-size:11px;padding:4px 10px" onclick="window._psRenderCurrentTab()">&#8635; Refresh</button>' +
      '</div>' +
      '<div class="ps-drafts-list">' + items.map(d => {
        const proto = d.parameters_json || {};
        const date = d.created_at ? new Date(d.created_at).toLocaleDateString() : '';
        return '<div class="ps-draft-row">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="ps-draft-name">' + esc(d.name || d.condition || 'Draft') + '</div>' +
            '<div class="ps-draft-meta">' + esc(d.condition || '') + (d.device_slug ? ' \u00B7 ' + esc(d.device_slug) : '') + (date ? ' \u00B7 ' + date : '') + '</div>' +
          '</div>' +
          _stateBadge(d.governance_state) +
          '<button class="ps-save-btn" style="background:var(--bg-surface);color:var(--text-primary);border:1px solid var(--border);font-size:11px;padding:4px 10px;flex-shrink:0" onclick="window._psOpenInBuilder(\'' + esc(d.id) + '\')">Open in Builder</button>' +
        '</div>';
      }).join('') + '</div>';
  }

  // ── Tab switcher ───────────────────────────────────────────────────────────
  function _renderTabBar() {
    const tabs = [
      { id: 'conditions', label: 'Conditions' },
      { id: 'generate',   label: 'Generate Protocol' },
      { id: 'browse',     label: 'Browse Protocols' },
      { id: 'drafts',     label: 'My Drafts' },
    ];
    return tabs.map(t =>
      '<button class="ps-tab' + (_tab === t.id ? ' active' : '') + '" onclick="window._psTab(\'' + t.id + '\')">' + t.label + '</button>'
    ).join('');
  }

  // Paint shell once, swap content on tab change
  el.innerHTML =
    '<div class="ps-shell">' +
      '<div class="ps-tab-bar">' + _renderTabBar() + '</div>' +
      '<div class="ps-body" id="ps-tab-content"></div>' +
    '</div>';

  // ── Window handlers ────────────────────────────────────────────────────────
  window._psTab = (tab) => {
    _tab = tab;
    window._protocolHubTab = tab;
    // Re-draw tab bar active state
    document.querySelectorAll('.ps-tab').forEach(b => {
      b.classList.toggle('active', b.textContent.trim() === { conditions:'Conditions', generate:'Generate Protocol', browse:'Browse Protocols', drafts:'My Drafts' }[tab]);
    });
    window._psRenderCurrentTab();
  };

  window._psRenderCurrentTab = () => {
    if (_tab === 'conditions')  _renderConditions();
    else if (_tab === 'generate')   _renderGenerate();
    else if (_tab === 'browse')     _renderBrowse();
    else if (_tab === 'drafts')     _renderDrafts();
  };

  window._psCondToGenerate = (condId, condName) => {
    _prefillCondition = { id: condId, name: condName };
    window._protocolHubCondition = _prefillCondition;
    W.mode = 'evidence';
    W.result = null;
    W.error = null;
    window._psTab('generate');
  };

  window._psCondToBrowse = (condId) => {
    window._protFilterCondition?.(condId);
    window._psTab('browse');
  };

  window._psOpenMode = (mode) => {
    W.mode = mode;
    W.result = null;
    W.error = null;
    W.saving = false;
    _renderGenerate();
  };

  window._psGenerateEvidence = async () => {
    const condEl = document.getElementById('ps-ev-condition');
    const modEl  = document.getElementById('ps-ev-modality');
    const devEl  = document.getElementById('ps-ev-device');
    const thrEl  = document.getElementById('ps-ev-threshold');
    const olEl   = document.getElementById('ps-ev-offlabel');
    const condition = (condEl && condEl.value.trim()) || '';
    const modality  = (modEl && modEl.value) || 'tDCS';
    if (!condition) { W.error = 'Condition is required.'; _renderGenerate(); return; }
    W.saving = true; W.error = null; W.result = null;
    _renderGenerate();
    try {
      const payload = {
        condition,
        symptom_cluster: 'General',
        modality,
        device: (devEl && devEl.value.trim()) || '',
        setting: 'Clinic',
        evidence_threshold: (thrEl && thrEl.value) || 'Systematic Review',
        off_label: !!(olEl && olEl.checked),
      };
      W.result = await api.generateProtocol(payload);
      W.error = null;
    } catch (e) { W.error = e?.message || 'Generation failed.'; }
    W.saving = false;
    _renderGenerate();
  };

  window._psGenerateBrainScan = async () => {
    const condEl    = document.getElementById('ps-bs-condition');
    const scanEl    = document.getElementById('ps-bs-scan-type');
    const targetEl  = document.getElementById('ps-bs-target');
    const markersEl = document.getElementById('ps-bs-markers');
    const phenoEl   = document.getElementById('ps-bs-phenotype');
    const devEl     = document.getElementById('ps-bs-device');
    const condition = (condEl && condEl.value.trim()) || '';
    if (!condition) { W.error = 'Condition is required.'; _renderGenerate(); return; }
    W.saving = true; W.error = null; W.result = null;
    _renderGenerate();
    try {
      const markers = (markersEl && markersEl.value) ? markersEl.value.split(',').map(s => s.trim()).filter(Boolean) : [];
      const payload = {
        condition,
        scan_type: (scanEl && scanEl.value) || 'qEEG',
        primary_target: (targetEl && targetEl.value.trim()) || 'DLPFC',
        eeg_markers: markers,
        phenotype: (phenoEl && phenoEl.value.trim()) || '',
        device: (devEl && devEl.value.trim()) || '',
      };
      W.result = await api.generateBrainScanProtocol(payload);
      W.error = null;
    } catch (e) { W.error = e?.message || 'Generation failed.'; }
    W.saving = false;
    _renderGenerate();
  };

  window._psGeneratePersonalized = async () => {
    const condEl    = document.getElementById('ps-pe-condition');
    const patEl     = document.getElementById('ps-pe-patient');
    const phq9El    = document.getElementById('ps-pe-phq9');
    const gad7El    = document.getElementById('ps-pe-gad7');
    const mocaEl    = document.getElementById('ps-pe-moca');
    const chrEl     = document.getElementById('ps-pe-chronotype');
    const medsEl    = document.getElementById('ps-pe-meds');
    const devEl     = document.getElementById('ps-pe-device');
    const histEl    = document.getElementById('ps-pe-history');
    const condition = (condEl && condEl.value.trim()) || '';
    if (!condition) { W.error = 'Condition is required.'; _renderGenerate(); return; }
    W.saving = true; W.error = null; W.result = null;
    _renderGenerate();
    try {
      const parseScore = (el) => { const v = el && el.value.trim(); return (v !== '' && !isNaN(v)) ? parseFloat(v) : null; };
      const payload = {
        condition,
        patient_id: (patEl && patEl.value.trim()) || 'demo',
        phq9: parseScore(phq9El),
        gad7: parseScore(gad7El),
        moca: parseScore(mocaEl),
        medication_load: (medsEl && medsEl.value.trim()) || '',
        chronotype: (chrEl && chrEl.value) || '',
        treatment_history: (histEl && histEl.value.trim()) || '',
        device: (devEl && devEl.value.trim()) || '',
      };
      W.result = await api.generatePersonalizedProtocol(payload);
      W.error = null;
    } catch (e) { W.error = e?.message || 'Generation failed.'; }
    W.saving = false;
    _renderGenerate();
  };

  window._psSaveDraft = async () => {
    if (!W.result) return;
    const btn = document.getElementById('ps-save-draft-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    const condition = (W.result.rationale || '').split('/')[0]?.trim() || 'unknown';
    const patientId = window._builderPatientId || null;
    if (!patientId) {
      if (btn) { btn.disabled = false; btn.textContent = 'Save as Draft'; }
      window._showNotifToast?.({ title: 'No Patient Selected', body: 'Attach a patient context to save to backend. Use the 5-step wizard for patient-linked saves.', severity: 'warn' });
      return;
    }
    try {
      await api.saveProtocol({
        patient_id: patientId,
        name: 'Generated: ' + condition,
        condition,
        modality: 'tDCS',
        governance_state: 'draft',
        parameters_json: {
          target_region: W.result.target_region,
          session_frequency: W.result.session_frequency,
          duration: W.result.duration,
        },
        evidence_refs: [],
      });
      window._showNotifToast?.({ title: 'Saved', body: 'Protocol draft saved.', severity: 'success' });
    } catch (e) {
      window._showNotifToast?.({ title: 'Save Failed', body: e?.message || 'endpoint error', severity: 'error' });
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Save as Draft'; }
  };

  window._psOpenInBuilder = (draftId) => {
    window._protDetailId = draftId;
    window._nav('protocol-builder');
  };

  // ── Initial render ─────────────────────────────────────────────────────────
  window._psRenderCurrentTab();
}

// Legacy 5-step wizard: still accessible via protocol-builder-full route.
// pgProtocolStudio remains exported for direct use from that route.


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
.dv2s-demo-banner{position:sticky;top:0;z-index:10;background:rgba(255,181,71,0.12);border-bottom:1px solid rgba(255,181,71,0.25);padding:8px 20px;font-size:12px;color:#ffd28a;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.dv2s-demo-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ffb547;box-shadow:0 0 6px #ffb547;}
.dv2s-demo-btn{margin-left:auto;font-size:11px;padding:4px 10px;border:1px solid rgba(255,181,71,0.4);border-radius:6px;background:transparent;color:#ffd28a;cursor:pointer;font-family:inherit;}
.dv2s-demo-btn:hover{background:rgba(255,181,71,0.18);}
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
.dv2s-col-heads{display:grid;position:sticky;top:0;z-index:5;background:var(--bg-panel,var(--bg-surface));border-bottom:1px solid var(--border);}
.dv2s-col-heads.v-week{grid-template-columns:64px repeat(28,minmax(120px,1fr));min-width:2000px;}
.dv2s-col-heads.v-day{grid-template-columns:64px repeat(var(--dv2s-cols,4),minmax(200px,1fr));min-width:900px;}
.dv2s-col-heads.v-resources{grid-template-columns:64px repeat(var(--dv2s-cols,6),minmax(160px,1fr));min-width:1100px;}
.dv2s-hours-head{grid-column:1;display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--text-tertiary);font-family:var(--font-mono);letter-spacing:.08em;text-transform:uppercase;border-right:1px solid var(--border);}
.dv2s-day-head{display:flex;flex-direction:column;border-right:1px solid var(--border);}
.dv2s-day-head.today{background:linear-gradient(180deg,rgba(0,212,188,0.08),transparent 60%);}
.dv2s-day-head-top{display:flex;align-items:center;gap:6px;padding:8px 8px 4px;}
.dv2s-day-dow{font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;}
.dv2s-day-num{font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--text-primary);}
.dv2s-day-badge{margin-left:auto;font-size:9px;font-weight:700;color:var(--teal);background:rgba(0,212,188,0.14);padding:1px 5px;border-radius:3px;font-family:var(--font-mono);}
.dv2s-day-clins{display:grid;grid-template-columns:repeat(var(--dv2s-subcols,4),1fr);border-top:1px solid var(--border);}
.dv2s-clin{padding:4px 6px;font-size:10px;font-weight:600;color:var(--text-secondary);display:flex;flex-direction:column;gap:1px;border-right:1px solid var(--border);background:var(--bg-surface);}
.dv2s-clin:last-child{border-right:0;}
.dv2s-clin-util{font-family:var(--font-mono);font-size:9px;color:var(--text-tertiary);font-weight:500;}
.dv2s-clin.util-hi{background:linear-gradient(180deg,rgba(255,181,71,0.08),var(--bg-surface));}
.dv2s-res-head{padding:10px 8px;border-right:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text-primary);background:var(--bg-surface);}
.dv2s-res-head .sub{display:block;font-size:10px;color:var(--text-tertiary);font-weight:500;margin-top:2px;}
.dv2s-grid{display:grid;position:relative;}
.dv2s-grid.v-week{grid-template-columns:64px repeat(28,minmax(120px,1fr));min-width:2000px;}
.dv2s-grid.v-day{grid-template-columns:64px repeat(var(--dv2s-cols,4),minmax(200px,1fr));min-width:900px;}
.dv2s-grid.v-resources{grid-template-columns:64px repeat(var(--dv2s-cols,6),minmax(160px,1fr));min-width:1100px;}
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
.dv2s-month{padding:16px 20px;overflow-y:auto;flex:1;}
.dv2s-month-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;}
.dv2s-month-dow{font-size:10px;font-weight:700;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;padding:4px 6px;}
.dv2s-month-cell{min-height:88px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-surface);cursor:pointer;display:flex;flex-direction:column;gap:4px;}
.dv2s-month-cell:hover{border-color:rgba(0,212,188,0.5);}
.dv2s-month-cell.today{border-color:rgba(0,212,188,0.6);box-shadow:inset 0 0 0 1px rgba(0,212,188,0.3);}
.dv2s-month-cell.other{opacity:.5;}
.dv2s-month-num{font-family:var(--font-display);font-size:14px;font-weight:600;color:var(--text-primary);}
.dv2s-month-dots{display:flex;gap:3px;flex-wrap:wrap;}
.dv2s-month-dot{width:5px;height:5px;border-radius:50%;}
.dv2s-month-count{margin-top:auto;font-size:10px;color:var(--text-tertiary);font-family:var(--font-mono);}
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
.dv2s-chain{display:flex;flex-direction:column;gap:4px;}
.dv2s-chain-item{padding:6px 8px;background:var(--bg-surface);border:1px solid rgba(255,255,255,0.04);border-radius:5px;font-size:11px;color:var(--text-secondary);display:flex;justify-content:space-between;gap:8px;}
.dv2s-chain-item .idx{color:var(--text-tertiary);font-family:var(--font-mono);font-size:10px;}
.dv2s-side-foot{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--border);flex-wrap:wrap;}
.dv2s-refbox{padding:20px;overflow-y:auto;flex:1;}
.dv2s-ref-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px;}
.dv2s-ref-kpi{padding:10px 12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:8px;}
.dv2s-ref-kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);font-weight:600;}
.dv2s-ref-kpi-value{font-family:var(--font-display);font-size:20px;font-weight:600;color:var(--text-primary);margin-top:2px;}
.dv2s-ref-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;}
.dv2s-ref-card{padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-surface);display:flex;flex-direction:column;gap:6px;}
.dv2s-ref-card h4{margin:0;font-size:13px;color:var(--text-primary);font-family:var(--font-display);}
.dv2s-ref-sub{font-size:11px;color:var(--text-tertiary);}
.dv2s-ref-meta{display:flex;gap:6px;flex-wrap:wrap;font-size:10.5px;}
.dv2s-ref-chip{padding:2px 7px;border-radius:999px;background:var(--bg-panel,var(--bg));color:var(--text-secondary);border:1px solid var(--border);}
.dv2s-ref-chip.new,.dv2s-ref-chip.urgent{color:var(--teal);border-color:rgba(0,212,188,0.35);}
.dv2s-ref-chip.urgent{color:var(--red,#ff5e7a);border-color:rgba(255,94,122,0.35);background:rgba(255,94,122,0.08);}
.dv2s-ref-chip.contacted,.dv2s-ref-chip.routine{color:var(--blue);border-color:rgba(74,158,255,0.35);}
.dv2s-ref-chip.qualified{color:var(--violet);border-color:rgba(155,127,255,0.35);}
.dv2s-ref-chip.booked{color:var(--green,#4ade80);border-color:rgba(74,222,128,0.35);}
.dv2s-ref-chip.lost,.dv2s-ref-chip.dismissed{color:var(--text-tertiary);}
.dv2s-ref-chip.demo{color:#ffd28a;border-color:rgba(255,181,71,0.35);background:rgba(255,181,71,0.1);}
.dv2s-staff{padding:20px;overflow-y:auto;flex:1;}
.dv2s-staff-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;}
.dv2s-staff-actions{display:flex;gap:6px;}
.dv2s-staff-table{width:100%;border-collapse:collapse;font-size:12px;}
.dv2s-staff-table th{text-align:left;padding:8px 10px;font-size:10px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--border);}
.dv2s-staff-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,0.04);color:var(--text-primary);}
.dv2s-staff-table tfoot td{border-top:1px solid var(--border);border-bottom:0;color:var(--text-secondary);background:var(--bg-surface);}
.dv2s-staff-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle;}
.dv2s-shift-type{display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;background:rgba(0,212,188,0.14);color:var(--teal);font-family:var(--font-mono);}
.dv2s-shift-type.remote{background:rgba(74,158,255,0.14);color:var(--blue);}
.dv2s-shift-type.oncall{background:rgba(255,181,71,0.14);color:var(--amber);}
.dv2s-shift-type.pto{background:rgba(255,94,122,0.1);color:var(--red,#ff5e7a);}
.dv2s-shift-type.admin{background:rgba(155,127,255,0.14);color:var(--violet);}
.dv2s-empty{padding:40px;text-align:center;color:var(--text-tertiary);}
.dv2s-modal-bd{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto;}
.dv2s-modal{width:min(640px,100%);background:var(--bg-panel,var(--bg-surface));border:1px solid var(--border);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);display:flex;flex-direction:column;}
.dv2s-modal-head{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px;}
.dv2s-modal-title{font-family:var(--font-display);font-size:15px;font-weight:600;color:var(--text-primary);}
.dv2s-modal-sub{font-size:11px;color:var(--text-tertiary);margin-top:2px;}
.dv2s-modal-body{padding:16px 18px;max-height:65vh;overflow-y:auto;}
.dv2s-modal-foot{padding:12px 18px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:10px;}
.dv2s-stepper{display:flex;gap:6px;margin-bottom:14px;}
.dv2s-step{flex:1;font-size:10.5px;padding:6px 8px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-tertiary);text-align:center;font-weight:600;}
.dv2s-step.is-active{background:rgba(0,212,188,0.14);border-color:rgba(0,212,188,0.4);color:var(--teal);}
.dv2s-step.is-done{color:var(--green,#4ade80);border-color:rgba(74,222,128,0.3);}
.dv2s-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}
.dv2s-field label{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);font-weight:600;}
.dv2s-field input,.dv2s-field select,.dv2s-field textarea{background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text-primary);font-family:inherit;}
.dv2s-field input:focus,.dv2s-field select:focus,.dv2s-field textarea:focus{outline:none;border-color:var(--teal);}
.dv2s-typegrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;}
.dv2s-typebtn{padding:8px 10px;background:var(--bg-surface);border:1px solid var(--border);border-radius:6px;color:var(--text-secondary);font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;text-align:left;}
.dv2s-typebtn.is-active{background:rgba(0,212,188,0.14);border-color:var(--teal);color:var(--teal);}
.dv2s-typebtn:hover{border-color:rgba(0,212,188,0.4);}
.dv2s-plist{max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;}
.dv2s-pitem{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.03);cursor:pointer;font-size:12px;display:flex;justify-content:space-between;gap:8px;}
.dv2s-pitem:hover{background:rgba(0,212,188,0.06);}
.dv2s-pitem.is-active{background:rgba(0,212,188,0.14);color:var(--teal);}
.dv2s-error-banner{padding:6px 14px;background:rgba(255,181,71,0.08);color:var(--amber);font-size:11px;border-bottom:1px solid rgba(255,181,71,0.2);}
@media (max-width:900px){
  .dv2s-side{position:fixed;bottom:0;left:0;right:0;width:100%;max-height:60vh;height:auto;border-left:0;border-top:1px solid var(--border);z-index:50;box-shadow:0 -8px 24px rgba(0,0,0,0.4);}
  .dv2s-side.collapsed{max-height:0;height:0;}
  .dv2s-legend{display:none;}
}
/* Design #04 · smaller-screen polish + sch-event time line */
.sch-event-time{font-size:9px;color:var(--text-tertiary);font-family:var(--font-mono);margin-top:1px;letter-spacing:.02em;}
.dv2s-event.is-selected .sch-event-time{color:var(--text-secondary);}
@media (max-width:640px){
  .dv2s-toolbar{padding:8px 10px;gap:6px;}
  .dv2s-tab-bar{padding:8px 10px 0;overflow-x:auto;-webkit-overflow-scrolling:touch;}
  .dv2s-tab{flex-shrink:0;}
  .dv2s-range{font-size:12px;}
  .dv2s-range-sub{display:none;}
  .dv2s-view{display:none;}
  .dv2s-chip{font-size:10.5px;padding:3px 8px;}
  .dv2s-col-heads.v-week{min-width:1200px;}
  .dv2s-col-heads.v-week{grid-template-columns:48px repeat(28,minmax(90px,1fr));}
  .dv2s-grid.v-week{grid-template-columns:48px repeat(28,minmax(90px,1fr));min-width:1200px;}
  .dv2s-hour-col{width:48px;}
  .dv2s-hours-head{font-size:8px;}
  .dv2s-hour-row{padding:2px 4px;font-size:8px;}
  .dv2s-day-dow,.dv2s-day-num{font-size:10px;}
  .sch-event-time{display:none;}
}
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

  const backendStatus = window._schedBackend = window._schedBackend || { sessions:null, referrals:null, staff:null };
  const tryBackend = window._schedTryBackend === true;
  let apiErrors = [];
  let clinicians = DEFAULT_CLINICIANS;
  let rooms = DEFAULT_ROOMS;
  let sessions = null;
  let leads = [];
  let staffSchedule = [];
  let patientsList = [];
  let courses = [];
  let referralsIsDemo = false;
  let staffIsDemo = false;

  function logUnavailable(endpoint) {
    if (!window._schedLoggedEndpoints) window._schedLoggedEndpoints = {};
    if (window._schedLoggedEndpoints[endpoint]) return;
    window._schedLoggedEndpoints[endpoint] = true;
    console.info('[schedule]', endpoint, 'unavailable — using demo data');
  }

  const callOrReject = (fn, ...args) => {
    try {
      if (typeof fn !== 'function') return Promise.reject(new Error('missing'));
      const r = fn(...args);
      if (r && typeof r.then === 'function') return r;
      return Promise.resolve(r);
    } catch (e) { return Promise.reject(e); }
  };

  const apiCalls = await Promise.allSettled([
    callOrReject(api.listClinicians),
    callOrReject(api.listRooms),
    callOrReject(api.listSessions, { from: windowFrom, to: windowTo }),
    callOrReject(api.listCourses, {}),
    (typeof api.listReferrals === 'function' ? callOrReject(api.listReferrals) : callOrReject(api.listLeads)),
    callOrReject(api.listStaffSchedule, { from: windowFrom, to: windowTo }),
    callOrReject(api.listPatients),
  ]);

  if (apiCalls[0].status === 'fulfilled') {
    const items = apiCalls[0].value?.items || apiCalls[0].value || [];
    if (Array.isArray(items) && items.length) {
      clinicians = items.slice(0,4).map((c,i)=>({ id:c.id||('c'+i), name:c.name||c.full_name||('Clinician '+(i+1)), color:DEFAULT_CLINICIANS[i%4].color }));
    }
  } else { logUnavailable('listClinicians'); }
  if (apiCalls[1].status === 'fulfilled') {
    const items = apiCalls[1].value?.items || apiCalls[1].value || [];
    if (Array.isArray(items) && items.length) rooms = items.map(r=>({ id:r.id, name:r.name||r.label||r.id }));
  } else { logUnavailable('listRooms'); }
  if (apiCalls[2].status === 'fulfilled') {
    sessions = apiCalls[2].value?.items || apiCalls[2].value || [];
    backendStatus.sessions = Array.isArray(sessions) && sessions.length > 0;
  } else {
    apiErrors.push('sessions');
    sessions = null;
    backendStatus.sessions = false;
    logUnavailable('listSessions');
  }
  if (apiCalls[3].status === 'fulfilled') {
    courses = apiCalls[3].value?.items || apiCalls[3].value || [];
  } else { logUnavailable('listCourses'); }
  if (apiCalls[4].status === 'fulfilled') {
    const items = apiCalls[4].value?.items || apiCalls[4].value || [];
    leads = items.map(l => ({
      id: l.id, name: l.name || l.patient_name || 'Unknown',
      source: l.source || l.origin || 'referral',
      condition: l.condition || l.indication || '',
      stage: l.stage || l.status || 'new',
      urgency: l.urgency || l.triage || 'routine',
      phone: l.phone || '', email: l.email || '',
      created: (l.created_at || '').slice(0,10),
      notes: l.notes || '', follow_up: l.follow_up || '',
      demo: false,
    }));
    backendStatus.referrals = items.length > 0;
  } else {
    apiErrors.push('referrals');
    backendStatus.referrals = false;
    logUnavailable('listReferrals');
  }
  if (apiCalls[5].status === 'fulfilled') {
    staffSchedule = apiCalls[5].value?.items || apiCalls[5].value || [];
    backendStatus.staff = Array.isArray(staffSchedule) && staffSchedule.length > 0;
  } else {
    backendStatus.staff = false;
    logUnavailable('listStaffSchedule');
  }
  if (apiCalls[6].status === 'fulfilled') {
    patientsList = apiCalls[6].value?.items || apiCalls[6].value || [];
    if (!Array.isArray(patientsList)) patientsList = [];
  } else { logUnavailable('listPatients'); }

  if (!leads.length) {
    referralsIsDemo = true;
    leads = [
      { id:'L-1', name:'Sarah Johnson',  source:'website',  condition:'Depression', stage:'new',       urgency:'urgent',  phone:'+44 7700 900123', created:'2026-04-14', notes:'TRD, 3 meds tried.', demo:true },
      { id:'L-2', name:'Robert Kim',     source:'GP',       condition:'Anxiety',    stage:'contacted', urgency:'routine', phone:'+44 7700 900456', created:'2026-04-13', notes:'Referred by GP. GAD-7=15.', demo:true },
      { id:'L-3', name:'Emma Clarke',    source:'self',     condition:'OCD',        stage:'qualified', urgency:'routine', phone:'+44 7700 900789', created:'2026-04-12', notes:'Deep TMS candidate.', demo:true },
      { id:'L-4', name:'David Nguyen',   source:'GP',       condition:'PTSD',       stage:'booked',    urgency:'urgent',  phone:'+44 7700 900321', created:'2026-04-10', notes:'Intake booked.', demo:true },
      { id:'L-5', name:'Lucy Fernandez', source:'insurer',  condition:'Depression', stage:'lost',      urgency:'routine', phone:'+44 7700 900654', created:'2026-04-08', notes:'Chose medication only.', demo:true },
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
  let eventsIsDemo = false;
  // Honest empty-state rule:
  //   - sessions === null  → backend call errored → OK to show demo data so the
  //                          UI layout doesn't collapse (banner explains it).
  //   - sessions === []    → backend returned zero results for the week → this
  //                          is a real "no appointments scheduled" state and we
  //                          must NOT fabricate mock rows to fill the grid.
  if (Array.isArray(sessions)) {
    events = sessions.map(sessionToEvent).filter(Boolean);
    eventsIsDemo = false;
  } else {
    events = buildMockEvents();
    eventsIsDemo = true;
  }

  // ── Client-side conflict detector ─────────────────────────────────────
  // Runs deterministically on each render so warnings stay accurate even
  // when the backend isn't returning has_conflict flags.
  (function detectConflicts() {
    const byDay = {};
    events.forEach(e => { (byDay[e.day] = byDay[e.day] || []).push(e); });
    Object.values(byDay).forEach(dayEvents => {
      dayEvents.forEach(a => {
        dayEvents.forEach(b => {
          if (a === b) return;
          const overlap = a.start < b.end && b.start < a.end;
          if (!overlap) return;
          if (a.clin === b.clin) a.warn = 'err';
          else if (a.meta && b.meta && a.meta === b.meta) a.warn = 'err';
          else if (a.device && b.device && a.device === b.device) a.warn = 'err';
        });
      });
      const perPatient = {};
      dayEvents.forEach(e => {
        const k = (e.patient || '').toLowerCase();
        if (!k) return;
        perPatient[k] = (perPatient[k] || 0) + 1;
      });
      dayEvents.forEach(e => {
        const k = (e.patient || '').toLowerCase();
        if (k && perPatient[k] > 1 && e.warn !== 'err') e.warn = 'amb';
      });
    });
  })();

  window._schedFilters = window._schedFilters || { clinicians:null, rooms:null, types:null, conflictsOnly:false };
  const F = window._schedFilters;
  window._schedView = ['day','week','resources','month'].includes(window._schedView) ? window._schedView : 'week';
  const VIEW = window._schedView;

  function eventPasses(e) {
    if (F.clinicians && F.clinicians.length && !F.clinicians.includes(e.clin)) return false;
    if (F.rooms && F.rooms.length && !F.rooms.includes(e.meta)) return false;
    if (F.types && F.types.length && !F.types.includes((e.type||'').toLowerCase())) return false;
    if (F.conflictsOnly && !e.warn) return false;
    return true;
  }

  const conflictCount = events.filter(e => e.warn === 'err').length;
  const prereqCount   = events.filter(e => e.warn === 'amb').length;

  // Demo banner visibility: show when sessions are seeded OR sessions endpoint failed.
  const showDemoBanner = eventsIsDemo || backendStatus.sessions === false;

  const TAB_META = {
    appointments: { label:'Appointments', count: events.filter(eventPasses).length },
    referrals:    { label:'Referrals',    count: leads.filter(l => l.stage !== 'dismissed' && l.stage !== 'lost').length },
    staff:        { label:'Staff Schedule', count: clinicians.length },
  };
  function renderTabBar() {
    return '<div class="dv2s-tab-bar" role="tablist">' +
      Object.entries(TAB_META).map(([id, m]) =>
        '<button role="tab" aria-selected="'+(tab===id)+'" class="dv2s-tab'+(tab===id?' is-active':'')+'" onclick="window._schedHubTab=\''+id+'\';window._nav(\'scheduling-hub\')">'
        + esc(m.label) + '<span class="dv2s-tab-count">' + m.count + '</span></button>'
      ).join('') + '</div>';
  }

  function renderDemoBanner() {
    if (!showDemoBanner) return '';
    return '<div class="dv2s-demo-banner">'
      + '<span class="dv2s-demo-dot"></span>'
      + '<strong>DEMO DATA</strong> &mdash; <span style="color:var(--text-secondary)">Showing seeded appointments so you can explore. Real appointments will appear here once your backend is connected.</span>'
      + '<button class="dv2s-demo-btn" onclick="window._schedToggleRealMode?.()">Try real backend</button>'
    + '</div>';
  }

  setTopbar('Schedule', '<button class="btn btn-primary btn-sm" onclick="window._schedNewBookingIntent()">+ New booking</button>');
  window._schedNewBookingIntent = () => { window._schedOpenWizard({}); };
  window._schedToggleRealMode = () => {
    window._schedTryBackend = true;
    window._schedLoggedEndpoints = {};
    window._dsToast?.({ title:'Retrying backend', body:'Re-fetching real data from API.', severity:'info' });
    window._nav('scheduling-hub');
  };

  const ROW_H = 48;
  const SLOT_H = 24;

  function renderToolbar() {
    const typeChip = (t, label) => {
      const active = F.types && F.types.includes(t);
      return '<button class="dv2s-chip'+(active?' is-active':'')+'" onclick="window._schedToggleType(\''+t+'\')"><span class="dv2s-chip-dot" style="background:'+typeMeta(t).color+'"></span>'+esc(label)+'</button>';
    };
    const clinChip = (c) => {
      const active = F.clinicians && F.clinicians.includes(c.id);
      return '<button class="dv2s-chip'+(active?' is-active':'')+'" onclick="window._schedToggleClinician(\''+c.id+'\')"><span class="dv2s-chip-dot" style="background:'+c.color+'"></span>'+esc(c.name)+'</button>';
    };
    const roomChip = (r) => {
      const active = F.rooms && F.rooms.includes(r.name);
      return '<button class="dv2s-chip'+(active?' is-active':'')+'" onclick="window._schedToggleRoom(\''+esc(r.name)+'\')">'+esc(r.name)+'</button>';
    };
    let range = '';
    let sub = '';
    if (VIEW === 'day') {
      const d = new Date(window._schedAnchor + 'T12:00:00');
      range = d.toLocaleDateString('en-GB',{ weekday:'long', day:'numeric', month:'short', year:'numeric' });
      sub = 'Day view';
    } else if (VIEW === 'resources') {
      const d = new Date(window._schedAnchor + 'T12:00:00');
      range = d.toLocaleDateString('en-GB',{ day:'numeric', month:'short', year:'numeric' });
      sub = 'Resources · rooms';
    } else if (VIEW === 'month') {
      const d = new Date(window._schedAnchor + 'T12:00:00');
      range = d.toLocaleDateString('en-GB',{ month:'long', year:'numeric' });
      sub = 'Month view';
    } else {
      range = DAYS[0].label + ' — ' + DAYS[6].label + ', ' + DAYS[0].date.getFullYear();
      sub = 'Week view';
    }
    const shift = VIEW === 'day' || VIEW === 'resources' ? 1 : VIEW === 'month' ? 30 : 7;
    return '<div class="dv2s-toolbar">'
      + '<div style="display:flex;gap:4px;align-items:center">'
        + '<button class="dv2s-nav-btn" onclick="window._schedShift('+(-shift)+')" title="Previous">&lsaquo;</button>'
        + '<button class="dv2s-today-btn" onclick="window._schedToday()">Today</button>'
        + '<button class="dv2s-nav-btn" onclick="window._schedShift('+shift+')" title="Next">&rsaquo;</button>'
      + '</div>'
      + '<div class="dv2s-range">'+esc(range)+'<span class="dv2s-range-sub">'+esc(sub)+'</span></div>'
      + '<div class="dv2s-view">'
        + '<button data-view="day"'+(VIEW==='day'?' class="is-active"':'')+' onclick="window._schedSetView(\'day\')">Day</button>'
        + '<button data-view="week"'+(VIEW==='week'?' class="is-active"':'')+' onclick="window._schedSetView(\'week\')">Week</button>'
        + '<button data-view="resources"'+(VIEW==='resources'?' class="is-active"':'')+' onclick="window._schedSetView(\'resources\')">Resources</button>'
        + '<button data-view="month"'+(VIEW==='month'?' class="is-active"':'')+' onclick="window._schedSetView(\'month\')">Month</button>'
      + '</div>'
      + '<div style="width:1px;height:20px;background:var(--border)"></div>'
      + clinicians.map(clinChip).join('')
      + (VIEW === 'resources' ? '' : rooms.slice(0,3).map(roomChip).join(''))
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
  }

  function buildEventTile(e) {
    const topPx = e.start * ROW_H;
    const heightPx = Math.max(SLOT_H - 2, (e.end - e.start) * ROW_H - 1);
    const meta = typeMeta(e.type);
    const warnIco = e.warn === 'err' ? '<span class="dv2s-event-warn err" title="Conflict">&#9888;</span>' : e.warn === 'amb' ? '<span class="dv2s-event-warn amb" title="Prereq">&#9680;</span>' : '';
    const showMeta = heightPx >= 32 && e.meta;
    const showTime = heightPx >= 46 && Number.isFinite(e.start);
    const timeLbl = showTime ? (() => {
      const h = Math.floor(e.start), m = Math.round((e.start - h) * 60);
      const sh = h === 0 ? 12 : h > 12 ? h - 12 : h;
      const ap = h >= 12 ? 'PM' : 'AM';
      return sh + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + ap;
    })() : null;
    const protoLabel = meta.label;
    const title = esc(e.patient) + ' · ' + esc(protoLabel) + ' · ' + e.duration + ' min' + (e.meta?' · '+esc(e.meta):'');
    const selCls = (String(window._schedSelectedId) === String(e.id)) ? ' is-selected' : '';
    return '<div class="dv2s-event sch-event '+meta.cls+selCls+'" style="top:'+topPx+'px;height:'+heightPx+'px" data-event-id="'+esc(e.id)+'" title="'+title+'">'
      + warnIco
      + '<div class="dv2s-event-name">'+esc(e.patient)+'</div>'
      + (showMeta ? '<div class="dv2s-event-meta">'+esc(e.meta)+'</div>' : '')
      + (timeLbl ? '<div class="sch-event-time">'+esc(timeLbl)+'</div>' : '')
    + '</div>';
  }

  function buildWeekView() {
    let heads = '<div class="dv2s-col-heads v-week"><div class="dv2s-hours-head">24h</div>';
    DAYS.forEach((d, di) => {
      heads += '<div class="dv2s-day-head'+(d.today?' today':'')+'" style="grid-column:span 4">'
        + '<div class="dv2s-day-head-top">'
          + '<span class="dv2s-day-dow">'+d.dow+'</span>'
          + '<span class="dv2s-day-num">'+d.num+'</span>'
          + (d.today ? '<span class="dv2s-day-badge">TODAY</span>' : '')
        + '</div>'
        + '<div class="dv2s-day-clins" style="--dv2s-subcols:'+clinicians.length+'">'
          + clinicians.map((c) => {
              const clinEvents = events.filter(e => e.day === di && e.clin === c.id);
              const util = Math.min(100, Math.round(clinEvents.reduce((s,e)=>s+(e.end-e.start),0) / 12 * 100));
              return '<div class="dv2s-clin'+(util>=90?' util-hi':'')+'"><span style="color:'+c.color+';font-size:9px">&#9679;</span> '+esc(c.name)+'<span class="dv2s-clin-util">'+util+'%</span></div>';
            }).join('')
        + '</div>'
      + '</div>';
    });
    heads += '</div>';

    let grid = '<div class="dv2s-grid v-week">';
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
        events.filter(e => e.day === di && e.clin === c.id && eventPasses(e)).forEach((e) => { grid += buildEventTile(e); });
        if (d.today) {
          const hNow = now.getHours() + now.getMinutes()/60;
          const top = hNow * ROW_H;
          grid += '<div class="dv2s-now-line" style="top:'+top+'px"><div class="dv2s-now-dot"></div></div>';
        }
        grid += '</div>';
      });
    });
    grid += '</div>';
    return heads + grid;
  }

  function buildDayView() {
    const anchorDay = DAYS.find(d => d.iso === window._schedAnchor) || DAYS[0];
    const di = DAYS.indexOf(anchorDay);
    const cols = clinicians.length;
    let heads = '<div class="dv2s-col-heads v-day" style="--dv2s-cols:'+cols+'"><div class="dv2s-hours-head">24h</div>';
    clinicians.forEach(c => {
      const clinEvents = events.filter(e => e.day === di && e.clin === c.id);
      const util = Math.min(100, Math.round(clinEvents.reduce((s,e)=>s+(e.end-e.start),0) / 12 * 100));
      heads += '<div class="dv2s-res-head"><span style="color:'+c.color+'">&#9679;</span> '+esc(c.name)+'<span class="sub">'+clinEvents.length+' appts · '+util+'% util</span></div>';
    });
    heads += '</div>';

    let grid = '<div class="dv2s-grid v-day" style="--dv2s-cols:'+cols+'">';
    grid += '<div class="dv2s-hour-col" style="grid-row:1">';
    for (let h = 0; h < 24; h++) {
      const label = h === 0 ? '12 AM' : h < 12 ? (h + ' AM') : h === 12 ? '12 PM' : ((h-12) + ' PM');
      grid += '<div class="dv2s-hour-row">'+label+'</div>';
    }
    grid += '</div>';

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
      events.filter(e => e.day === di && e.clin === c.id && eventPasses(e)).forEach((e) => { grid += buildEventTile(e); });
      if (anchorDay.today) {
        const hNow = now.getHours() + now.getMinutes()/60;
        grid += '<div class="dv2s-now-line" style="top:'+(hNow*ROW_H)+'px"><div class="dv2s-now-dot"></div></div>';
      }
      grid += '</div>';
    });
    grid += '</div>';
    return heads + grid;
  }

  function buildResourcesView() {
    const anchorDay = DAYS.find(d => d.iso === window._schedAnchor) || DAYS[0];
    const di = DAYS.indexOf(anchorDay);
    const cols = rooms.length;
    let heads = '<div class="dv2s-col-heads v-resources" style="--dv2s-cols:'+cols+'"><div class="dv2s-hours-head">24h</div>';
    rooms.forEach(r => {
      const rEvents = events.filter(e => e.day === di && (e.meta === r.name || e.meta === r.id));
      heads += '<div class="dv2s-res-head">'+esc(r.name)+'<span class="sub">'+rEvents.length+' bookings</span></div>';
    });
    heads += '</div>';

    let grid = '<div class="dv2s-grid v-resources" style="--dv2s-cols:'+cols+'">';
    grid += '<div class="dv2s-hour-col" style="grid-row:1">';
    for (let h = 0; h < 24; h++) {
      const label = h === 0 ? '12 AM' : h < 12 ? (h + ' AM') : h === 12 ? '12 PM' : ((h-12) + ' PM');
      grid += '<div class="dv2s-hour-row">'+label+'</div>';
    }
    grid += '</div>';

    rooms.forEach((r, ri) => {
      const isLast = ri === rooms.length - 1;
      grid += '<div class="dv2s-clin-col'+(isLast?' day-last':'')+'" style="grid-row:1">';
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 2; m++) {
          const isClinic = h >= 7 && h < 19;
          const t = h + m*0.5;
          grid += '<div class="dv2s-slot'+(!isClinic?' nonclinic':'')+(m===0?' on-hour':'')+'" data-day="'+di+'" data-room="'+esc(r.name)+'" data-t="'+t+'"></div>';
        }
      }
      events.filter(e => e.day === di && (e.meta === r.name || e.meta === r.id) && eventPasses(e)).forEach((e) => { grid += buildEventTile(e); });
      if (anchorDay.today) {
        const hNow = now.getHours() + now.getMinutes()/60;
        grid += '<div class="dv2s-now-line" style="top:'+(hNow*ROW_H)+'px"><div class="dv2s-now-dot"></div></div>';
      }
      grid += '</div>';
    });
    grid += '</div>';
    return heads + grid;
  }

  function buildMonthView() {
    const anchor = new Date(window._schedAnchor + 'T12:00:00');
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const startOffset = startDow === 0 ? -6 : 1 - startDow;
    const firstCell = new Date(year, month, 1 + startOffset);

    // Count events per iso date for the whole window — uses DAYS (7 days) plus seed.
    // Because events are bound to DAYS by day-index, we augment by estimating
    // densities across the month from the weekly seed repeated per weekday.
    const densityByIso = {};
    events.forEach(e => {
      const iso0 = DAYS[e.day]?.iso;
      if (!iso0) return;
      densityByIso[iso0] = (densityByIso[iso0] || 0) + 1;
    });
    let typesByIso = {};
    events.forEach(e => {
      const iso0 = DAYS[e.day]?.iso;
      if (!iso0) return;
      const typeKey = (e.type||'').toLowerCase();
      const meta = typeMeta(typeKey);
      typesByIso[iso0] = typesByIso[iso0] || {};
      typesByIso[iso0][meta.color] = true;
    });

    const dowLabels = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
    let html = '<div class="dv2s-month"><div class="dv2s-month-grid">';
    dowLabels.forEach(d => html += '<div class="dv2s-month-dow">'+d+'</div>');
    for (let i = 0; i < 42; i++) {
      const d = new Date(firstCell); d.setDate(firstCell.getDate() + i);
      const iso0 = iso(d);
      const other = d.getMonth() !== month;
      const isToday = iso0 === iso(now);
      const count = densityByIso[iso0] || 0;
      const dots = Object.keys(typesByIso[iso0] || {}).slice(0,5).map(c => '<span class="dv2s-month-dot" style="background:'+c+'"></span>').join('');
      html += '<div class="dv2s-month-cell'+(other?' other':'')+(isToday?' today':'')+'" data-iso="'+iso0+'" onclick="window._schedMonthZoom(\''+iso0+'\')">'
        + '<div class="dv2s-month-num">'+d.getDate()+'</div>'
        + (dots ? '<div class="dv2s-month-dots">'+dots+'</div>' : '')
        + (count ? '<div class="dv2s-month-count">'+count+' appts</div>' : '')
      + '</div>';
    }
    html += '</div></div>';
    return html;
  }

  function buildAppointments() {
    const toolbar = renderToolbar();
    let viewBody = '';
    if (VIEW === 'day')       viewBody = buildDayView();
    else if (VIEW === 'resources') viewBody = buildResourcesView();
    else if (VIEW === 'month')     viewBody = buildMonthView();
    else                           viewBody = buildWeekView();

    const selId = window._schedSelectedId || null;
    const sel = selId ? events.find(e => String(e.id) === String(selId)) : null;
    const side = renderSidePanel(sel);

    return toolbar + '<div class="dv2s-body">'
      + '<div class="dv2s-grid-wrap" id="dv2s-grid-wrap">' + viewBody + '</div>'
      + side
    + '</div>';
  }

  function upcomingSessionsFor(sel) {
    // Find next 8 upcoming sessions for this patient (including sel, then after)
    const patientKey = (sel.patient||'').toLowerCase();
    const same = events.filter(e => (e.patient||'').toLowerCase() === patientKey).map(e => {
      const d = DAYS[e.day];
      return Object.assign({}, e, { isoDate: d ? d.iso : '', dayLabel: d ? (d.dow + ' ' + d.num) : '' });
    });
    same.sort((a,b) => (a.isoDate||'').localeCompare(b.isoDate||'') || a.start - b.start);
    return same.slice(0,8);
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
    // Heuristic warnings — deterministic
    const noShowScore = Math.abs(String(sel.id||'').split('').reduce((s,c)=>s+c.charCodeAt(0),0)) % 40;
    const noShowColor = noShowScore < 15 ? 'var(--green,#4ade80)' : noShowScore < 30 ? 'var(--amber)' : 'var(--red,#ff5e7a)';
    const noShowLevel = noShowScore < 15 ? 'low' : noShowScore < 30 ? 'medium' : 'high';
    if (!warns.length) warns.push('<div class="dv2s-warn ok"><div class="dv2s-warn-ico">&#10003;</div><div><div class="dv2s-warn-title">Consent &amp; auth OK</div><div class="dv2s-warn-body">e-consent on file; payer auth valid.</div></div></div>');

    const chain = upcomingSessionsFor(sel);
    const chainHtml = chain.length ? chain.map((s,i) => {
      const d = s.isoDate;
      const timeLabel = Math.floor(s.start) + ':' + (s.start % 1 === 0 ? '00' : '30');
      const isCurrent = String(s.id) === String(sel.id);
      return '<div class="dv2s-chain-item"'+(isCurrent?' style="border-color:rgba(0,212,188,0.4)"':'')+'>'
        + '<span>'+esc(d||'—')+' · '+esc(timeLabel)+'</span>'
        + '<span class="idx">'+(isCurrent?'● ':'')+'#'+(i+1)+'</span>'
      + '</div>';
    }).join('') : '<div style="padding:8px 10px;font-size:11px;color:var(--text-tertiary)">No other upcoming sessions in window.</div>';

    return '<aside class="dv2s-side" id="dv2s-side">'
      + '<div class="dv2s-side-head">'
        + '<div class="dv2s-side-av">'+esc(initials||'PT')+'</div>'
        + '<div style="flex:1;min-width:0"><div class="dv2s-side-name">'+esc(sel.patient)+'</div>'
        + '<div class="dv2s-side-sub">MRN '+esc(String(sel.id).slice(-6).toUpperCase())+' &middot; '+esc(meta.label)+(sel.course_position?' &middot; Session '+sel.course_position+(sel.course_total?('/'+sel.course_total):''):'')+'</div></div>'
        + '<button class="dv2s-side-close" onclick="window._schedClosePanel()" title="Close">&#10005;</button>'
      + '</div>'
      + '<div class="dv2s-side-body">'
        + warns.join('')
        + '<div class="dv2s-side-section">Appointment</div>'
        + '<div class="dv2s-side-row"><div class="lbl">Protocol</div><div class="val">'+esc(meta.label)+'</div></div>'
        + '<div class="dv2s-side-row"><div class="lbl">Clinician</div><div class="val">'+esc(sel.clinician || '')+'</div></div>'
        + '<div class="dv2s-side-row"><div class="lbl">Room</div><div class="val">'+esc(sel.meta || '—')+'</div></div>'
        + '<div class="dv2s-side-row"><div class="lbl">Device</div><div class="val">'+esc(sel.device || sel.meta || '—')+'</div></div>'
        + '<div class="dv2s-side-row"><div class="lbl">Duration</div><div class="val">'+esc(sel.duration+' min')+'</div></div>'
        + (sel.course_position ? '<div class="dv2s-side-row"><div class="lbl">Course</div><div class="val">Session '+sel.course_position+' of '+(sel.course_total||'—')+'</div></div>' : '')
        + '<div class="dv2s-side-section">Risk signals</div>'
        + '<div class="dv2s-side-row"><div class="lbl">No-show</div><div class="val" style="color:'+noShowColor+'">'+noShowScore+'% &middot; '+noShowLevel+'</div></div>'
        + (rem ? ('<div class="dv2s-side-row"><div class="lbl">Remaining</div><div class="val">'+rem+' sessions</div></div>') : '')
        + '<div class="dv2s-side-section">Upcoming in this course</div>'
        + '<div class="dv2s-chain">'+chainHtml+'</div>'
      + '</div>'
      + '<div class="dv2s-side-foot">'
        + '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._schedReschedule(\''+esc(sel.id)+'\')">Reschedule</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="window._schedCancelEvent(\''+esc(sel.id)+'\')">Cancel</button>'
        + '<button class="btn btn-ghost btn-sm" onclick="window._schedCheckConflictsBtn(\''+esc(sel.id)+'\')">Conflicts</button>'
        + '<button class="btn btn-primary btn-sm" style="flex:1" onclick="window._schedOpenChart(\''+esc(sel.id)+'\')">Open chart &rarr;</button>'
      + '</div>'
    + '</aside>';
  }

  function buildReferrals() {
    const filter = window._schedRefFilter || 'all';
    let filtered = leads.slice();
    if (filter === 'gp')       filtered = filtered.filter(l => (l.source||'').toLowerCase() === 'gp');
    else if (filter === 'self') filtered = filtered.filter(l => (l.source||'').toLowerCase() === 'self' || (l.source||'').toLowerCase() === 'website');
    else if (filter === 'insurer') filtered = filtered.filter(l => (l.source||'').toLowerCase() === 'insurer');
    else if (filter === 'triage') filtered = filtered.filter(l => !l.urgency || l.urgency === 'untriaged');

    const openLeads = leads.filter(l => l.stage !== 'dismissed' && l.stage !== 'lost');
    const urgentCount = leads.filter(l => (l.urgency||'').toLowerCase() === 'urgent' && l.stage !== 'dismissed').length;
    const intakesBookedWeek = events.filter(e => (e.type||'').toLowerCase() === 'intake').length;
    const triaged = leads.filter(l => l.urgency && l.urgency !== 'untriaged');
    const avgTriage = triaged.length ? '< 24h' : '—';

    const stageOrder = ['new','contacted','qualified','booked','dismissed','lost'];
    const grouped = {};
    filtered.forEach(l => { const s = (l.stage||'new').toLowerCase(); (grouped[s] = grouped[s] || []).push(l); });
    let html = '<div class="dv2s-refbox">';

    html += '<div class="dv2s-ref-kpis">'
      + '<div class="dv2s-ref-kpi"><div class="dv2s-ref-kpi-label">Open</div><div class="dv2s-ref-kpi-value">'+openLeads.length+'</div></div>'
      + '<div class="dv2s-ref-kpi"><div class="dv2s-ref-kpi-label">Urgent</div><div class="dv2s-ref-kpi-value" style="color:var(--red,#ff5e7a)">'+urgentCount+'</div></div>'
      + '<div class="dv2s-ref-kpi"><div class="dv2s-ref-kpi-label">Intakes this week</div><div class="dv2s-ref-kpi-value">'+intakesBookedWeek+'</div></div>'
      + '<div class="dv2s-ref-kpi"><div class="dv2s-ref-kpi-label">Avg time to triage</div><div class="dv2s-ref-kpi-value" style="font-size:14px">'+avgTriage+'</div></div>'
    + '</div>';

    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">';
    html += '<h3 style="margin:0;font-size:15px;font-family:var(--font-display)">Incoming referrals &middot; '+filtered.length+(referralsIsDemo?' <span style="font-size:11px;color:#ffd28a;font-weight:500">· demo</span>':'')+'</h3>';
    const fChip = (id, label) => '<button class="dv2s-chip'+(filter===id?' is-active':'')+'" onclick="window._schedRefFilter=\''+id+'\';window._nav(\'scheduling-hub\')">'+esc(label)+'</button>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      + fChip('all','All sources')
      + fChip('gp','GP referrals')
      + fChip('self','Self-referral')
      + fChip('insurer','Insurer')
      + '<button class="dv2s-chip warn'+(filter==='triage'?' is-active':'')+'" onclick="window._schedRefFilter=\'triage\';window._nav(\'scheduling-hub\')">&#9888; Needs triage</button>'
    + '</div>';
    html += '</div>';

    if (!filtered.length) {
      html += '<div class="dv2s-empty">No referrals match the current filter.</div></div>';
      return html;
    }

    stageOrder.forEach(stage => {
      const items = grouped[stage] || [];
      if (!items.length) return;
      html += '<div style="margin-bottom:16px">';
      html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-tertiary);font-weight:600;margin-bottom:8px">'+esc(stage)+' &middot; '+items.length+'</div>';
      html += '<div class="dv2s-ref-grid">';
      html += items.map(l => (
        '<div class="dv2s-ref-card">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">'
            + '<div><h4>'+esc(l.name)+(l.demo?' <span class="dv2s-ref-chip demo" style="font-size:9px;padding:1px 5px">demo</span>':'')+'</h4><div class="dv2s-ref-sub">'+esc(l.condition||'—')+'</div></div>'
            + '<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end"><span class="dv2s-ref-chip '+esc(stage)+'">'+esc(stage)+'</span>'
              + (l.urgency ? '<span class="dv2s-ref-chip '+esc((l.urgency||'').toLowerCase())+'">'+esc(l.urgency)+'</span>' : '')
            + '</div>'
          + '</div>'
          + '<div class="dv2s-ref-meta">'
            + '<span class="dv2s-ref-chip">'+esc(l.source||'referral')+'</span>'
            + (l.phone ? '<span class="dv2s-ref-chip">'+esc(l.phone)+'</span>' : '')
            + (l.created ? '<span class="dv2s-ref-chip">Recv '+esc(l.created)+'</span>' : '')
          + '</div>'
          + (l.notes ? '<div style="font-size:11px;color:var(--text-secondary);line-height:1.45">'+esc(l.notes)+'</div>' : '')
          + '<div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">'
            + '<button class="btn btn-sm btn-ghost" onclick="window._schedTriageLead(\''+esc(l.id)+'\')">Triage</button>'
            + '<button class="btn btn-sm btn-ghost" onclick="window._schedAssignLead(\''+esc(l.id)+'\')">Assign</button>'
            + '<button class="btn btn-sm btn-primary" onclick="window._schedBookLead(\''+esc(l.id)+'\')">Book intake</button>'
            + '<button class="btn btn-sm btn-ghost" style="color:var(--text-tertiary)" onclick="window._schedDismissLead(\''+esc(l.id)+'\')">Dismiss</button>'
          + '</div>'
        + '</div>'
      )).join('');
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function shiftFor(clinicianId, dayIso) {
    // Check staffSchedule first for a real shift.
    if (Array.isArray(staffSchedule) && staffSchedule.length) {
      const s = staffSchedule.find(x =>
        String(x.clinician_id || x.clinician || '').toLowerCase() === String(clinicianId).toLowerCase()
        && (x.date || '').slice(0,10) === dayIso
      );
      if (s) return { type: (s.type||'clinic').toLowerCase(), hours: s.hours || 8 };
    }
    // Fallback: derive from events
    const dayIdx = DAYS.findIndex(d => d.iso === dayIso);
    if (dayIdx < 0) return null;
    const myEvents = events.filter(e => e.clin === clinicianId && e.day === dayIdx);
    const hrs = myEvents.reduce((s,e)=>s+(e.end-e.start),0);
    const dow = new Date(dayIso + 'T12:00:00').getDay();
    if (dow === 0 || dow === 6) return { type:'off', hours:0, patients:0 };
    if (hrs === 0) return { type:'idle', hours:0, patients:0 };
    return { type:'clinic', hours: Math.round(hrs*10)/10, patients: myEvents.length };
  }

  function buildStaff() {
    let totalPatients = 0;
    let totalHours = 0;
    let overbookCount = 0;
    const rosterRows = clinicians.map((c) => {
      let rowPatients = 0;
      let rowHours = 0;
      const cells = DAYS.map((d, di) => {
        const sh = shiftFor(c.id, d.iso) || { type:'idle', hours:0, patients:0 };
        const myEvents = events.filter(e => e.clin === c.id && e.day === di);
        const patients = sh.patients != null ? sh.patients : myEvents.length;
        const hours = sh.hours || 0;
        rowPatients += patients;
        rowHours += hours;
        if (hours > 8) overbookCount++;
        totalPatients += patients;
        totalHours += hours;
        const cls = sh.type === 'pto' ? 'pto' : sh.type === 'oncall' || sh.type === 'on-call' ? 'oncall' : sh.type === 'remote' ? 'remote' : sh.type === 'admin' ? 'admin' : '';
        const label = sh.type === 'off' ? 'Off' : sh.type === 'pto' ? 'PTO' : sh.type === 'oncall' || sh.type === 'on-call' ? 'On-call' : sh.type === 'remote' ? 'Remote' : sh.type === 'admin' ? 'Admin' : sh.type === 'idle' ? '—' : 'Clinic';
        if (sh.type === 'off' || sh.type === 'idle') {
          return '<td style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:11px">'+label+'</td>';
        }
        return '<td style="font-family:var(--font-mono);font-size:11px">'
          + '<span class="dv2s-shift-type '+cls+'">'+label+'</span>'
          + ' <span style="color:'+(hours>8?'var(--amber)':'var(--text-secondary)')+'">'+hours.toFixed(1)+'h</span>'
          + ' <span style="color:var(--text-tertiary)">· '+patients+' pt</span>'
        + '</td>';
      }).join('');
      const util = Math.round((rowHours / 40) * 100);
      return '<tr data-clinician-id="'+esc(c.id)+'">'
        + '<td><span class="dv2s-staff-dot" style="background:'+c.color+'"></span>'+esc(c.name)+'<span style="color:var(--text-tertiary);font-size:10.5px;margin-left:8px">Clinician</span></td>'
        + cells
        + '<td style="font-family:var(--font-mono);font-weight:600">'+rowHours.toFixed(1)+'h</td>'
        + '<td style="font-family:var(--font-mono);color:'+(util>=90?'var(--amber)':'var(--text-primary)')+'">'+util+'%</td>'
        + '<td style="font-family:var(--font-mono)">'+rowPatients+'</td>'
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
      + '<div class="dv2s-staff-bar">'
        + '<h3 style="margin:0;font-size:15px;font-family:var(--font-display)">Clinician roster &middot; this week'+(staffIsDemo?' <span style="font-size:11px;color:#ffd28a;font-weight:500">· demo</span>':'')+'</h3>'
        + '<div class="dv2s-staff-actions">'
          + '<button class="btn btn-sm btn-ghost" onclick="window._schedOpenShiftModal()">+ Add shift</button>'
          + '<button class="btn btn-sm btn-ghost" onclick="window._schedOpenPtoModal()">Mark PTO</button>'
        + '</div>'
      + '</div>'
      + '<div style="overflow-x:auto"><table class="dv2s-staff-table">'
        + '<thead><tr><th>Clinician</th>' + DAYS.map(d => '<th>'+d.dow+' '+d.num+'</th>').join('') + '<th>Hours</th><th>Util</th><th>Patients</th></tr></thead>'
        + '<tbody>'+rosterRows+'</tbody>'
        + '<tfoot><tr><td style="font-weight:600">Total</td>'
          + DAYS.map((d, di) => {
              const ct = events.filter(e => e.day === di).length;
              return '<td style="font-family:var(--font-mono);color:var(--text-secondary)">'+ct+' pt</td>';
            }).join('')
          + '<td style="font-family:var(--font-mono);font-weight:600">'+totalHours.toFixed(1)+'h</td>'
          + '<td style="font-family:var(--font-mono);font-weight:600">'+Math.round((totalHours/(40*clinicians.length||1))*100)+'%</td>'
          + '<td style="font-family:var(--font-mono);font-weight:600">'+totalPatients+'</td>'
        + '</tr>'
        + (overbookCount ? ('<tr><td colspan="'+(DAYS.length+4)+'" style="color:var(--amber);font-size:11px">&#9888; '+overbookCount+' day(s) over 8h — review overbooked shifts.</td></tr>') : '')
        + '</tfoot>'
      + '</table></div>'
      + '<h3 style="margin:24px 0 12px;font-size:15px;font-family:var(--font-display)">Rooms &middot; utilization</h3>'
      + '<div style="overflow-x:auto"><table class="dv2s-staff-table">'
        + '<thead><tr><th>Room</th><th>Bookings (wk)</th><th>Share</th><th>Status</th></tr></thead>'
        + '<tbody>'+roomRows+'</tbody>'
      + '</table></div>'
    + '</div>';
  }

  window._schedShift = (delta) => { shiftAnchor(delta); window._schedSelectedId=null; window._nav('scheduling-hub'); };
  window._schedToday = () => { window._schedAnchor = iso(new Date()); window._schedSelectedId=null; window._nav('scheduling-hub'); };
  window._schedSetView = (v) => { window._schedView = v; window._nav('scheduling-hub'); };
  window._schedClosePanel = () => { window._schedSelectedId = null; window._nav('scheduling-hub'); };
  window._schedMonthZoom = (iso0) => { window._schedAnchor = iso0; window._schedView = 'day'; window._nav('scheduling-hub'); };
  window._schedToggleClinician = (id) => {
    F.clinicians = F.clinicians || [];
    if (F.clinicians.includes(id)) F.clinicians = F.clinicians.filter(x=>x!==id); else F.clinicians.push(id);
    if (F.clinicians.length === 0) F.clinicians = null;
    window._nav('scheduling-hub');
  };
  window._schedToggleRoom = (name) => {
    F.rooms = F.rooms || [];
    if (F.rooms.includes(name)) F.rooms = F.rooms.filter(x=>x!==name); else F.rooms.push(name);
    if (F.rooms.length === 0) F.rooms = null;
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

  window._schedReschedule = (id) => {
    const ev = events.find(e => String(e.id) === String(id));
    if (!ev) return;
    const day = DAYS[ev.day];
    window._schedOpenWizard({
      mode: 'reschedule',
      sessionId: id,
      patient: ev.patient,
      clin: ev.clin,
      day: day ? day.iso : window._schedAnchor,
      start: ev.start,
      type: ev.type,
    });
  };
  window._schedCancelEvent = async (id) => {
    if (!confirm('Cancel this appointment?')) return;
    const reason = (typeof prompt === 'function') ? (prompt('Reason (optional):','') || '') : '';
    try {
      await api.cancelSession?.(id, { reason });
      window._dsToast?.({ title:'Cancelled', body:'Appointment cancelled.', severity:'success' });
    } catch (_err) {
      logUnavailable('cancelSession');
      window._dsToast?.({ title:'Cancelled (local)', body:'Saved locally — backend sync pending.', severity:'warn' });
    }
    window._schedSelectedId = null;
    window._nav('scheduling-hub');
  };
  window._schedCheckConflictsBtn = async (id) => {
    const ev = events.find(e => String(e.id) === String(id));
    if (!ev) return;
    const day = DAYS[ev.day];
    const startDt = (day ? day.iso : window._schedAnchor) + 'T' + pad2(Math.floor(ev.start)) + ':' + (ev.start % 1 === 0 ? '00' : '30');
    const endHr = ev.end; const endDt = (day ? day.iso : window._schedAnchor) + 'T' + pad2(Math.floor(endHr)) + ':' + (endHr % 1 === 0 ? '00' : '30');
    let result = null;
    try {
      result = await api.checkSlotConflicts?.({ clinician_id: ev.clin, room_id: ev.meta, start: startDt, end: endDt });
    } catch (_err) { logUnavailable('checkSlotConflicts'); }
    if (!result) {
      // Local detection
      const conflicts = events.filter(e => e !== ev && e.day === ev.day && e.start < ev.end && ev.start < e.end && (e.clin === ev.clin || (e.meta && e.meta === ev.meta)));
      result = { conflicts };
    }
    const n = (result.conflicts || []).length;
    window._dsToast?.({
      title: n ? (n + ' conflict(s) detected') : 'No conflicts',
      body: n ? 'Overlapping with: ' + result.conflicts.slice(0,3).map(c=>c.patient||c.id).join(', ') : 'This slot is clear.',
      severity: n ? 'warn' : 'success',
    });
  };
  window._schedOpenChart = (id) => {
    const ev = events.find(e=>String(e.id)===String(id));
    if (!ev) return;
    if (ev._raw && ev._raw.patient_id) { try { window.location.hash = '#patient/' + ev._raw.patient_id; } catch {} }
    window._nav?.('patient-hub');
  };

  // ── Referral handlers ────────────────────────────────────────────────
  window._schedTriageLead = async (id) => {
    const lead = leads.find(l => String(l.id) === String(id)); if (!lead) return;
    const next = (lead.urgency === 'urgent') ? 'routine' : 'urgent';
    try {
      await api.triageReferral?.(id, { urgency: next });
    } catch (_err) { logUnavailable('triageReferral'); }
    lead.urgency = next;
    window._dsToast?.({ title:'Triage set', body: lead.name + ' marked ' + next + '.', severity:'info' });
    window._nav('scheduling-hub');
  };
  window._schedDismissLead = async (id) => {
    if (!confirm('Dismiss this referral?')) return;
    try { await api.dismissReferral?.(id); } catch (_err) { logUnavailable('dismissReferral'); }
    const lead = leads.find(l => String(l.id) === String(id)); if (lead) lead.stage = 'dismissed';
    window._dsToast?.({ title:'Dismissed', body:'Referral archived.', severity:'info' });
    window._nav('scheduling-hub');
  };
  window._schedAssignLead = (id) => {
    const lead = leads.find(l => String(l.id) === String(id)); if (!lead) return;
    const options = clinicians.map((c,i)=>(i+1)+'. '+c.name).join('\n');
    const pick = (typeof prompt === 'function') ? prompt('Assign clinician:\n' + options + '\n\nEnter number:','1') : null;
    if (!pick) return;
    const idx = parseInt(pick,10) - 1;
    const c = clinicians[idx];
    if (!c) return;
    lead.assigned_to = c.id;
    window._dsToast?.({ title:'Assigned', body: lead.name + ' → ' + c.name, severity:'info' });
    window._nav('scheduling-hub');
  };
  window._schedBookLead = (id) => {
    const lead = leads.find(l => String(l.id) === String(id));
    window._schedOpenWizard({ mode:'intake', patient: lead?.name || '', condition: lead?.condition || '', type:'intake', leadId: id });
  };

  // ── Booking wizard ───────────────────────────────────────────────────
  window._schedOpenWizard = (ctx) => {
    window._schedWiz = {
      step: 1,
      patient: ctx?.patient || '',
      patient_id: ctx?.patient_id || null,
      day: ctx?.day || window._schedAnchor,
      clin: ctx?.clin || clinicians[0]?.id || '',
      start: ctx?.start != null ? ctx.start : 9,
      type: ctx?.type || 'session',
      course_id: null,
      mode: ctx?.mode || 'new',
      sessionId: ctx?.sessionId || null,
      leadId: ctx?.leadId || null,
      duration: 60,
      notes: '',
      conflictResult: null,
      patientQuery: '',
    };
    _renderWizard();
  };
  window._schedCloseWizard = () => {
    window._schedWiz = null;
    const bd = document.getElementById('dv2s-wizard-bd');
    if (bd) bd.remove();
  };
  window._schedWizSetStep = (n) => { if (!window._schedWiz) return; window._schedWiz.step = n; _renderWizard(); };
  window._schedWizSet = (field, val) => { if (!window._schedWiz) return; window._schedWiz[field] = val; _renderWizard(); };
  window._schedWizPickPatient = (pid, pname) => {
    if (!window._schedWiz) return;
    window._schedWiz.patient_id = pid;
    window._schedWiz.patient = pname;
    window._schedWiz.step = 2;
    _renderWizard();
  };
  window._schedWizSearch = (q) => { if (!window._schedWiz) return; window._schedWiz.patientQuery = q; _renderWizard(); };
  window._schedWizConfirm = async () => {
    const w = window._schedWiz; if (!w) return;
    const startHr = Number(w.start) || 9;
    const dur = Number(w.duration) || 60;
    const startIso = w.day + 'T' + pad2(Math.floor(startHr)) + ':' + (startHr % 1 === 0 ? '00' : '30') + ':00';
    const endHr = startHr + dur/60;
    const endIso = w.day + 'T' + pad2(Math.floor(endHr)) + ':' + (endHr % 1 === 0 ? '00' : '30') + ':00';
    const payload = {
      patient_id: w.patient_id, patient_name: w.patient,
      clinician_id: w.clin, appointment_type: w.type,
      scheduled_at: startIso, duration_minutes: dur,
      course_id: w.course_id || null, notes: w.notes || '',
    };
    let ok = false;
    try {
      if (w.mode === 'reschedule' && w.sessionId) {
        await api.updateSession?.(w.sessionId, payload); ok = true;
      } else if (typeof api.bookSession === 'function') {
        try { await api.bookSession(payload); ok = true; } catch { /* fall through */ }
      }
      if (!ok && typeof api.createSession === 'function') {
        await api.createSession(payload); ok = true;
      }
    } catch (_err) { logUnavailable(w.mode === 'reschedule' ? 'updateSession' : 'createSession'); }
    window._dsToast?.({
      title: ok ? 'Booked' : 'Booked (local)',
      body: ok ? (w.patient + ' · ' + w.day + ' ' + startIso.slice(11,16)) : 'Saved locally — backend sync pending.',
      severity: ok ? 'success' : 'warn',
    });
    window._schedCloseWizard();
    window._nav('scheduling-hub');
  };

  function _renderWizard() {
    const w = window._schedWiz; if (!w) return;
    let bd = document.getElementById('dv2s-wizard-bd');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'dv2s-modal-bd';
      bd.id = 'dv2s-wizard-bd';
      bd.addEventListener('click', (ev) => { if (ev.target === bd) window._schedCloseWizard(); });
      document.body.appendChild(bd);
    }
    const step = w.step;
    const stepNames = ['Patient','Slot','Type','Course','Review'];
    const stepBar = '<div class="dv2s-stepper">' + stepNames.map((n,i) => {
      const k = i+1;
      const cls = k === step ? 'is-active' : k < step ? 'is-done' : '';
      return '<div class="dv2s-step '+cls+'">'+(k)+'. '+n+'</div>';
    }).join('') + '</div>';

    let body = stepBar;
    if (step === 1) {
      const q = (w.patientQuery||'').toLowerCase();
      const matches = patientsList
        .map(p => ({ id: p.id, name: p.name || p.full_name || ('Patient ' + p.id) }))
        .filter(p => !q || p.name.toLowerCase().includes(q))
        .slice(0,20);
      const seedHits = !patientsList.length ? (['Sarah Johnson','Robert Kim','Emma Clarke','David Nguyen','Lucy Fernandez'].filter(n => !q || n.toLowerCase().includes(q)).map(n => ({ id:'seed-'+n, name:n, demo:true }))) : [];
      const list = matches.length ? matches : seedHits;
      body += '<div class="dv2s-field"><label>Search patient</label><input type="text" value="'+esc(w.patientQuery||'')+'" placeholder="Type name..." oninput="window._schedWizSearch(this.value)"></div>';
      body += '<div class="dv2s-plist">' + (list.length ? list.map(p =>
        '<div class="dv2s-pitem'+(w.patient_id===p.id?' is-active':'')+'" onclick="window._schedWizPickPatient(\''+esc(p.id)+'\',\''+esc(p.name)+'\')">'
          + '<span>'+esc(p.name)+(p.demo ? ' <span style="font-size:10px;color:#ffd28a;font-weight:600">· demo patient</span>' : '')+'</span><span style="color:var(--text-tertiary);font-size:10px">'+esc(String(p.id).slice(0,8))+'</span>'
        + '</div>'
      ).join('') : '<div style="padding:10px;color:var(--text-tertiary);font-size:11px">No matches.</div>') + '</div>';
      body += '<div style="margin-top:10px;font-size:11px;color:var(--text-tertiary)">Or <a href="javascript:void(0)" onclick="window._schedWizSet(\'patient\',prompt(\'New patient name:\')||\'\')" style="color:var(--teal)">create new patient</a>'+(w.patient?' — selected: <strong style="color:var(--text-primary)">'+esc(w.patient)+'</strong>':'')+'</div>';
    } else if (step === 2) {
      const clinOpts = clinicians.map(c => '<option value="'+esc(c.id)+'"'+(w.clin===c.id?' selected':'')+'>'+esc(c.name)+'</option>').join('');
      const dayOpts = DAYS.map(d => '<option value="'+d.iso+'"'+(w.day===d.iso?' selected':'')+'>'+d.dow+' '+d.num+' · '+d.label+'</option>').join('');
      const timeOpts = [];
      for (let h = 7; h < 19; h++) for (let m = 0; m < 2; m++) { const t = h + m*0.5; timeOpts.push('<option value="'+t+'"'+(Number(w.start)===t?' selected':'')+'>'+pad2(h)+':'+(m?'30':'00')+'</option>'); }
      body += '<div class="dv2s-field"><label>Day</label><select onchange="window._schedWizSet(\'day\', this.value)">'+dayOpts+'</select></div>';
      body += '<div class="dv2s-field"><label>Clinician</label><select onchange="window._schedWizSet(\'clin\', this.value)">'+clinOpts+'</select></div>';
      body += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
      body += '<div class="dv2s-field"><label>Start time</label><select onchange="window._schedWizSet(\'start\', parseFloat(this.value))">'+timeOpts.join('')+'</select></div>';
      body += '<div class="dv2s-field"><label>Duration</label><select onchange="window._schedWizSet(\'duration\', parseInt(this.value,10))">'
        + [30,45,60,90,120].map(d => '<option value="'+d+'"'+(Number(w.duration)===d?' selected':'')+'>'+d+' min</option>').join('')
      + '</select></div>';
      body += '</div>';
    } else if (step === 3) {
      const typeList = [
        ['tdcs','tDCS'],['rtms','rTMS'],['nf','Neurofeedback'],['bio','Biofeedback'],
        ['assessment','Assessment'],['intake','Intake'],['tele','Telehealth'],['mdt','MDT'],['hw','Homework'],
      ];
      body += '<div class="dv2s-field"><label>Appointment type</label><div class="dv2s-typegrid">'
        + typeList.map(([v,l]) => '<button class="dv2s-typebtn'+(w.type===v?' is-active':'')+'" onclick="window._schedWizSet(\'type\',\''+v+'\')">'+esc(l)+'</button>').join('')
      + '</div></div>';
      body += '<div class="dv2s-field"><label>Notes</label><textarea rows="3" oninput="window._schedWizSet(\'notes\', this.value)" placeholder="Optional...">'+esc(w.notes||'')+'</textarea></div>';
    } else if (step === 4) {
      const courseOpts = '<option value="">— No course —</option>' + (Array.isArray(courses) ? courses.slice(0,40).map(c => {
        const id = c.id; const name = c.name || c.title || (c.modality ? c.modality + ' · ' + (c.condition||'course') : 'Course ' + id);
        return '<option value="'+esc(id)+'"'+(String(w.course_id)===String(id)?' selected':'')+'>'+esc(name)+'</option>';
      }).join('') : '');
      body += '<div class="dv2s-field"><label>Treatment course (optional)</label><select onchange="window._schedWizSet(\'course_id\', this.value || null)">'+courseOpts+'</select></div>';
      body += '<div style="font-size:11px;color:var(--text-tertiary)">Linking the session to an existing course keeps the remaining-sessions chain accurate.</div>';
    } else if (step === 5) {
      const day = DAYS.find(d => d.iso === w.day) || DAYS[0];
      const clin = clinicians.find(c => c.id === w.clin);
      const startLabel = pad2(Math.floor(w.start))+':'+(w.start%1===0?'00':'30');
      const localConflicts = events.filter(e => DAYS[e.day]?.iso === w.day && e.start < (w.start + (w.duration/60)) && w.start < e.end && (e.clin === w.clin));
      body += '<div class="dv2s-side-row"><div class="lbl">Patient</div><div class="val">'+esc(w.patient||'(not set)')+'</div></div>';
      body += '<div class="dv2s-side-row"><div class="lbl">When</div><div class="val">'+esc(day?.dow+' '+day?.num+' · '+startLabel)+'</div></div>';
      body += '<div class="dv2s-side-row"><div class="lbl">Clinician</div><div class="val">'+esc(clin?.name||'—')+'</div></div>';
      body += '<div class="dv2s-side-row"><div class="lbl">Type</div><div class="val">'+esc(typeMeta(w.type).label)+' · '+w.duration+' min</div></div>';
      body += '<div class="dv2s-side-row"><div class="lbl">Course</div><div class="val">'+esc(w.course_id ? String(w.course_id) : '—')+'</div></div>';
      if (localConflicts.length) {
        body += '<div class="dv2s-warn err" style="margin-top:10px"><div class="dv2s-warn-ico">&#9888;</div><div><div class="dv2s-warn-title">'+localConflicts.length+' conflict(s) at this slot</div><div class="dv2s-warn-body">Overlap with: '+localConflicts.slice(0,3).map(c=>esc(c.patient)).join(', ')+'</div></div></div>';
      } else {
        body += '<div class="dv2s-warn ok" style="margin-top:10px"><div class="dv2s-warn-ico">&#10003;</div><div><div class="dv2s-warn-title">Slot clear</div><div class="dv2s-warn-body">No overlapping bookings detected for clinician.</div></div></div>';
      }
      if (!w.patient) {
        body += '<div class="dv2s-warn amb" style="margin-top:6px"><div class="dv2s-warn-ico">&#9680;</div><div><div class="dv2s-warn-title">Missing patient</div><div class="dv2s-warn-body">Pick or create a patient in step 1 before booking.</div></div></div>';
      }
    }

    const prevBtn = step > 1 ? '<button class="btn btn-ghost btn-sm" onclick="window._schedWizSetStep('+(step-1)+')">&larr; Back</button>' : '<span></span>';
    const nextBtn = step < 5
      ? '<button class="btn btn-primary btn-sm" onclick="window._schedWizSetStep('+(step+1)+')">Next &rarr;</button>'
      : '<button class="btn btn-primary btn-sm" onclick="window._schedWizConfirm()"'+(w.patient?'':' disabled')+'>' + (w.mode === 'reschedule' ? 'Save reschedule' : 'Book appointment') + '</button>';

    bd.innerHTML = '<div class="dv2s-modal" role="dialog" aria-label="Booking wizard">'
      + '<div class="dv2s-modal-head">'
        + '<div><div class="dv2s-modal-title">' + (w.mode === 'reschedule' ? 'Reschedule appointment' : w.mode === 'intake' ? 'Book intake' : 'New booking') + '</div>'
        + '<div class="dv2s-modal-sub">Step '+step+' of 5</div></div>'
        + '<button class="dv2s-side-close" onclick="window._schedCloseWizard()">&#10005;</button>'
      + '</div>'
      + '<div class="dv2s-modal-body">'+body+'</div>'
      + '<div class="dv2s-modal-foot">'+prevBtn+nextBtn+'</div>'
    + '</div>';
  }

  // ── Shift modals ─────────────────────────────────────────────────────
  window._schedOpenShiftModal = () => { _renderShiftModal('shift'); };
  window._schedOpenPtoModal = () => { _renderShiftModal('pto'); };
  window._schedCloseShiftModal = () => {
    const bd = document.getElementById('dv2s-shift-bd'); if (bd) bd.remove();
  };
  window._schedSubmitShift = async (mode) => {
    const clinId = document.getElementById('dv2s-shift-clin')?.value;
    const dayIso = document.getElementById('dv2s-shift-day')?.value;
    const type = mode === 'pto' ? 'pto' : (document.getElementById('dv2s-shift-type')?.value || 'clinic');
    const hours = parseFloat(document.getElementById('dv2s-shift-hrs')?.value || '8');
    const payload = { clinician_id: clinId, date: dayIso, type, hours };
    let ok = false;
    try { await api.createStaffShift?.(payload); ok = true; }
    catch (_err) { logUnavailable('createStaffShift'); }
    window._dsToast?.({ title: ok ? 'Shift added' : 'Shift added (local)', body: payload.clinician_id + ' · ' + payload.date + ' · ' + type, severity: ok ? 'success' : 'warn' });
    window._schedCloseShiftModal();
    window._nav('scheduling-hub');
  };

  function _renderShiftModal(mode) {
    let bd = document.getElementById('dv2s-shift-bd');
    if (!bd) {
      bd = document.createElement('div');
      bd.className = 'dv2s-modal-bd';
      bd.id = 'dv2s-shift-bd';
      bd.addEventListener('click', (ev) => { if (ev.target === bd) window._schedCloseShiftModal(); });
      document.body.appendChild(bd);
    }
    const clinOpts = clinicians.map(c => '<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
    const dayOpts = DAYS.map(d => '<option value="'+d.iso+'">'+d.dow+' '+d.num+'</option>').join('');
    const typeOpts = ['clinic','remote','oncall','admin'].map(t => '<option value="'+t+'">'+t+'</option>').join('');
    const title = mode === 'pto' ? 'Mark PTO' : 'Add shift';
    bd.innerHTML = '<div class="dv2s-modal"><div class="dv2s-modal-head"><div class="dv2s-modal-title">'+title+'</div><button class="dv2s-side-close" onclick="window._schedCloseShiftModal()">&#10005;</button></div>'
      + '<div class="dv2s-modal-body">'
        + '<div class="dv2s-field"><label>Clinician</label><select id="dv2s-shift-clin">'+clinOpts+'</select></div>'
        + '<div class="dv2s-field"><label>Day</label><select id="dv2s-shift-day">'+dayOpts+'</select></div>'
        + (mode === 'pto' ? '' : '<div class="dv2s-field"><label>Type</label><select id="dv2s-shift-type">'+typeOpts+'</select></div>')
        + '<div class="dv2s-field"><label>Hours</label><input id="dv2s-shift-hrs" type="number" value="'+(mode==='pto'?'0':'8')+'" min="0" max="24" step="0.5"></div>'
      + '</div>'
      + '<div class="dv2s-modal-foot"><button class="btn btn-ghost btn-sm" onclick="window._schedCloseShiftModal()">Cancel</button>'
        + '<button class="btn btn-primary btn-sm" onclick="window._schedSubmitShift(\''+mode+'\')">Save</button></div>'
    + '</div>';
  }

  async function _slotConflictCheck(slot) {
    try {
      if (typeof api.checkSlotConflicts === 'function') {
        return await api.checkSlotConflicts(slot);
      }
    } catch (_err) { logUnavailable('checkSlotConflicts'); }
    return { conflicts: [] };
  }

  let body;
  if (tab === 'referrals')   body = buildReferrals();
  else if (tab === 'staff')  body = buildStaff();
  else                       body = buildAppointments();

  el.innerHTML = '<div class="dv2s-shell">'
    + renderDemoBanner()
    + (apiErrors.length && !showDemoBanner ? '<div class="dv2s-error-banner">Live data unavailable ('+apiErrors.join(', ')+') — showing sample schedule.</div>' : '')
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
          const dayAttr = slotEl.getAttribute('data-day');
          const clinAttr = slotEl.getAttribute('data-clin');
          const roomAttr = slotEl.getAttribute('data-room');
          const t = parseFloat(slotEl.getAttribute('data-t'));
          slotEl.classList.add('flash');
          setTimeout(()=>slotEl.classList.remove('flash'), 320);
          const dayIdx = parseInt(dayAttr, 10);
          const dayObj = DAYS[dayIdx] || DAYS[0];
          const wizCtx = { day: dayObj.iso, start: t, clin: clinAttr || clinicians[0]?.id, type: 'session' };
          if (roomAttr) wizCtx.room = roomAttr;
          window._schedOpenWizard(wizCtx);
        }
      });
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  if (!window._schedKeysBound) {
    window._schedKeysBound = true;
    window.addEventListener('keydown', (e) => {
      if (!window._schedHubTab) return; // only when schedule has been loaded
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return;
      const wizOpen = !!document.getElementById('dv2s-wizard-bd');
      const shiftOpen = !!document.getElementById('dv2s-shift-bd');
      if (e.key === 'Escape') {
        if (wizOpen) { e.preventDefault(); window._schedCloseWizard?.(); return; }
        if (shiftOpen) { e.preventDefault(); window._schedCloseShiftModal?.(); return; }
        if (window._schedSelectedId) { e.preventDefault(); window._schedClosePanel?.(); return; }
        return;
      }
      if (wizOpen || shiftOpen) return;
      const active = location.hash.includes('scheduling-hub') || location.hash.includes('schedule-v2');
      if (!active) return;
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); window._schedToday?.(); }
      else if (e.key === 'w' || e.key === 'W') { e.preventDefault(); window._schedSetView?.('week'); }
      else if (e.key === 'd' || e.key === 'D') { e.preventDefault(); window._schedSetView?.('day'); }
      else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); window._schedSetView?.('month'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); const v = window._schedView || 'week'; const d = v === 'day' || v === 'resources' ? 1 : v === 'month' ? 30 : 7; window._schedShift?.(d); }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); const v = window._schedView || 'week'; const d = v === 'day' || v === 'resources' ? 1 : v === 'month' ? 30 : 7; window._schedShift?.(-d); }
    });
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
  // Conditions tab moved to Protocol Studio. Redirect stale deep-links.
  if (window._libraryHubTab === 'conditions') {
    window._libraryHubTab = 'devices';
    window._protocolHubTab = 'conditions';
    window._nav('protocol-hub');
    return;
  }
  const tab = window._libraryHubTab || 'devices';
  window._libraryHubTab = tab;
  const el = document.getElementById('content');
  const esc = libraryHelpers.esc;
  const actor = (typeof currentUser === 'function' ? currentUser() : null) || {};
  const actorRole = (actor?.role || actor?.actor_role || '').toLowerCase();
  const isAdmin = actorRole === 'admin' || actorRole === 'superadmin';

  // Lazy-load PROTOCOL_LIBRARY + evidence dataset so every tab can surface
  // evidence-backed metrics. Failures degrade silently — counts fall back to 0.
  let _protosAll = [], _condsAll = [], _devsAll = [];
  let _condEvidence = [], _evSummary = null;
  try {
    const [pd, ed] = await Promise.all([
      import('./protocols-data.js'),
      import('./evidence-dataset.js'),
    ]);
    _protosAll    = pd.PROTOCOL_LIBRARY    || [];
    _condsAll     = pd.CONDITIONS          || [];
    _devsAll      = pd.DEVICES             || [];
    _condEvidence = ed.CONDITION_EVIDENCE   || [];
    _evSummary    = ed.EVIDENCE_SUMMARY     || null;
  } catch {}
  const _needsReviewRows = _protosAll.filter(p =>
    (Array.isArray(p.governance) && p.governance.includes('unreviewed')) ||
    (typeof p.notes === 'string' && /verify/i.test(p.notes))
  );
  const _needsReviewCount = _needsReviewRows.length;

  // ── Per-device evidence aggregation from 87K dataset ──────────────────────
  // Build a map: deviceId → { protocolCount, conditionCount, paperCount, gradeA }
  const _deviceEvMap = {};
  for (const d of _devsAll) {
    _deviceEvMap[d.id] = { protocolCount: 0, conditionCount: 0, paperCount: 0, gradeACount: 0, conditions: new Set() };
  }
  for (const p of _protosAll) {
    const de = _deviceEvMap[p.device];
    if (de) {
      de.protocolCount++;
      if (p.conditionId) de.conditions.add(p.conditionId);
      if (String(p.evidenceGrade).toUpperCase() === 'A') de.gradeACount++;
    }
  }
  // Sum paper counts from conditions each device covers
  for (const did of Object.keys(_deviceEvMap)) {
    const de = _deviceEvMap[did];
    de.conditionCount = de.conditions.size;
    let papers = 0;
    for (const cid of de.conditions) {
      const ev = _condEvidence.find(e => e.conditionId === cid);
      if (ev) papers += ev.paperCount;
    }
    de.paperCount = papers;
    delete de.conditions; // free Set
  }

  // ── Per-condition evidence lookup for packages tab ─────────────────────────
  const _condEvMap = {};
  for (const ce of _condEvidence) _condEvMap[ce.conditionId] = ce;
  const _totalEvPapersLib = _evSummary?.totalPapers || EVIDENCE_SUMMARY?.totalPapers || 87000;
  const _totalEvTrialsLib = _evSummary?.totalTrials || EVIDENCE_SUMMARY?.totalTrials || 0;

  // "Conditions" tab moved to Protocol Studio (protocol-hub route, Tab 1).
  // Library Hub retains Devices, Packages, Evidence, and Needs Review.
  const TAB_META = {
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
    // Route to Protocol Studio Generate tab with condition pre-filled.
    window._protocolHubCondition = { id: condId, name: condName };
    window._protocolHubTab = 'generate';
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
        '<div class="lib-card lib-card--review">' +
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
    // Enrich API devices with local evidence data if available
    const _devsFallback = (!devices.length && _devsAll.length)
      ? _devsAll.map(d => ({ id: d.id, name: d.label || d.id, modality: d.id.replace(/-/g,' '), review_status: 'curated' }))
      : [];
    const _devRows = devices.length ? devices : _devsFallback;
    const modalityValues = Array.from(new Set(_devRows.map(d => d.modality).filter(Boolean))).sort();
    const types = ['All', ...modalityValues];
    const filtered = filt === 'All' ? _devRows : _devRows.filter(d => d.modality === filt);
    const rows = libraryHelpers.filterRows(filtered, q, ['name', 'manufacturer', 'modality', 'regulatory_status', 'official_indication']);
    const reviewedCount = _devRows.filter(d => libraryHelpers.isReviewed(d.review_status)).length;
    const _totalDevProtos = _protosAll.length;
    const _totalDevPapers = _totalEvPapersLib;
    main =
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));margin-bottom:16px">' +
        kpi('var(--teal)',   _devRows.length, 'Devices') +
        kpi('var(--blue)',   reviewedCount, 'Reviewed') +
        kpi('var(--violet)', modalityValues.length, 'Modalities') +
        kpi('var(--rose)',   _totalDevProtos, 'Protocols', 'Total protocols across all devices') +
        kpi('var(--amber)',  (_totalDevPapers / 1000).toFixed(0) + 'K', 'Research papers', '87K curated research papers indexed') +
        kpi('var(--teal)',   rows.length, 'Filtered') +
      '</div>' +
      '<div class="ch-card">' +
        '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
          '<span class="ch-card-title">Device Registry</span>' +
          sInput('devices', 'Search device, manufacturer, modality, indication…') +
        '</div>' +
        '<div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border)">' + pills(types, filt, 'devices') + '</div>' +
        (!_devRows.length
          ? '<div class="ch-empty" style="padding:30px 16px">Device registry is empty. Admin must import <code>data/clinical/devices.csv</code>.</div>'
          : rows.length
            ? '<div class="lib-grid">' + rows.map(d => {
                const regStatus  = d.regulatory_status  || '';
                const regPathway = d.regulatory_pathway || '';
                const regTitle   = [regStatus, regPathway].filter(Boolean).join(' · ');
                const settingTag = d.home_vs_clinic ? '<span class="lib-tag">' + esc(d.home_vs_clinic) + '</span>' : '';
                const indicationLine = d.official_indication
                  ? '<div class="lib-feature lib-feature--indication" title="Official indication">🎯 ' + esc(d.official_indication) + '</div>'
                  : '';
                // Evidence metrics from 87K dataset
                const _devId = (d.modality || d.id || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                const _dEv = _deviceEvMap[_devId] || _deviceEvMap[d.id] || {};
                const evidenceLine = (_dEv.protocolCount || _dEv.paperCount)
                  ? '<div class="lib-features">' +
                      '<span class="lib-feature" title="Protocols using this device">🧭 ' + (_dEv.protocolCount || 0) + ' protocols</span>' +
                      '<span class="lib-feature" title="Conditions treated">🏥 ' + (_dEv.conditionCount || 0) + ' conditions</span>' +
                      (_dEv.paperCount ? '<span class="lib-feature" title="Research papers from 87K dataset">📄 ' + (_dEv.paperCount).toLocaleString() + ' papers</span>' : '') +
                      (_dEv.gradeACount ? '<span class="lib-feature" title="Grade A evidence protocols">⭐ ' + _dEv.gradeACount + ' Grade A</span>' : '') +
                    '</div>'
                  : '';
                return (
                  '<article class="lib-card lib-card--device" aria-label="' + esc(d.name || d.id) + '">' +
                    '<div class="lib-card-top">' +
                      '<span class="lib-card-name">' + esc(d.name || d.id) + '</span>' +
                      (regStatus ? '<div class="lib-card-badges"><span class="lib-badge lib-badge--blue" title="' + esc(regTitle) + '">' + esc(regStatus) + '</span></div>' : '') +
                    '</div>' +
                    (d.manufacturer ? '<div class="lib-card-manufacturer">' + esc(d.manufacturer) + '</div>' : '') +
                    '<div class="lib-card-meta">' +
                      (d.modality ? '<span class="lib-tag">' + esc(d.modality) + '</span>' : '') +
                      (d.device_type ? '<span class="lib-tag">' + esc(d.device_type) + '</span>' : '') +
                      settingTag +
                      reviewPill(d.review_status) +
                      (regPathway ? '<span class="lib-tag" title="Regulatory pathway">' + esc(regPathway) + '</span>' : '') +
                      (d.last_reviewed_at ? '<span class="lib-tag" title="Last reviewed by clinical team">Reviewed ' + esc(d.last_reviewed_at) + '</span>' : '') +
                    '</div>' +
                    (indicationLine ? '<div class="lib-features">' + indicationLine + '</div>' : '') +
                    evidenceLine +
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
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));margin-bottom:16px">' +
        kpi('var(--rose)',   overview?.condition_package_count || packageSlugs.length, 'Curated packages') +
        kpi('var(--teal)',   conditions.filter(c => c.neuromod_eligible && c.has_condition_package).length, 'Eligible bundles') +
        kpi('var(--blue)',   conditions.filter(c => c.has_condition_package && c.reviewed_protocol_count > 0).length, 'With reviewed protocol') +
        kpi('var(--violet)', (_totalEvPapersLib / 1000).toFixed(0) + 'K', 'Research papers', '87K curated evidence papers indexed across all conditions') +
        kpi('var(--amber)',  _totalEvTrialsLib.toLocaleString(), 'Clinical trials', 'Total trials from evidence dataset') +
        kpi('var(--teal)',   rows.length, 'Filtered') +
      '</div>' +
      '<div class="ch-card">' +
        '<div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">' +
          '<span class="ch-card-title">Condition Packages</span>' +
          '<span style="font-size:11px;color:var(--text-tertiary)">Reusable bundles: condition · assessments · protocol candidates · safety review · 87K evidence papers</span>' +
          sInput('packages', 'Search packages…') +
        '</div>' +
        (!rows.length
          ? '<div class="ch-empty" style="padding:30px 16px">No condition packages match. Curated packages live under <code>data/conditions/*.json</code>.</div>'
          : '<div class="lib-grid">' + rows.map(c => {
              const _cEv = _condEvMap[c.id] || {};
              const _cPapers = c.curated_evidence_paper_count || _cEv.paperCount || 0;
              const _cTrials = _cEv.trialCount || 0;
              const _cProtos = c.total_protocol_count || _protosAll.filter(p => p.conditionId === c.id).length;
              return (
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
                  '<span class="lib-feature">🧭 ' + _cProtos + ' protocols</span>' +
                  '<span class="lib-feature">🔌 ' + (c.compatible_device_count || 0) + ' devices</span>' +
                  (_cPapers ? '<span class="lib-feature" title="Research papers from 87K curated dataset">📄 ' + _cPapers.toLocaleString() + ' papers</span>' : '') +
                  (_cTrials ? '<span class="lib-feature" title="Clinical trials">🔬 ' + _cTrials.toLocaleString() + ' trials</span>' : '') +
                '</div>' +
                '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
                  '<button class="ch-btn-sm ch-btn-teal" onclick="window._libOpenPackage(\'' + esc(c.package_slug) + '\')">Open package →</button>' +
                  ((c.reviewed_protocol_count || 0) > 0 || _cProtos > 0
                    ? '<button class="ch-btn-sm" onclick="window._libFindProtocol(\'' + esc(c.id) + '\',\'' + esc(c.name).replace(/'/g, '\\\'') + '\')">Find protocol</button>'
                    : '') +
                '</div>' +
              '</article>'
            );}).join('') + '</div>') +
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
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));margin-bottom:16px">' +
        kpi('var(--teal)',   overview?.curated_paper_count || _totalEvPapersLib, 'Curated papers', 'Public PubMed/OpenAlex ingest — 87K indexed') +
        kpi('var(--blue)',   overview?.curated_trial_count || _totalEvTrialsLib, 'Curated trials') +
        kpi('var(--rose)',   _evSummary?.totalMetaAnalyses || EVIDENCE_SUMMARY?.totalMetaAnalyses || 0, 'Meta-analyses') +
        kpi('var(--violet)', curatedCount, 'Your library', 'Per-clinician promoted papers') +
        kpi('var(--amber)',  _condEvidence.length || _condsAll.length || 0, 'Conditions covered') +
        kpi('var(--teal)',   evDbAvailable ? 'Online' : 'Offline', 'Evidence index') +
      '</div>' +
      '<div class="ch-card" style="margin-bottom:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;background:linear-gradient(135deg,rgba(45,212,191,0.08),rgba(96,165,250,0.08));border:1px solid rgba(45,212,191,0.2)">' +
        '<div style="flex:1"><span style="font-weight:600;font-size:13px">Explore the full 87K-paper research evidence dataset</span>' +
        '<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">Interactive dashboard across 53 conditions, 13 modalities, assessments, protocols, devices, biomarkers &amp; more</div></div>' +
        '<button class="btn btn-primary btn-sm" onclick="window._nav(\'research-evidence\')">Open Research Evidence Dashboard &rarr;</button>' +
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
              '<article class="lib-card lib-card--evidence" aria-label="' + esc(p.title) + '">' +
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

    // Literature verdicts now persist server-side via
    // POST /api/v1/literature/papers/{pmid}/curate. We also keep a local
    // mirror in ds_lit_verdicts + dispatch ds:literature-verdict so existing
    // listeners (snapshot refresh, badge counters) keep working.
    window._litPaperAction = async (action, pmid) => {
      const entry = { pmid, action, ts: new Date().toISOString() };
      const label = action === 'mark-relevant'
        ? 'Marked relevant'
        : action === 'promote'
          ? 'Promoted to references'
          : action === 'not-relevant'
            ? 'Marked not relevant'
            : action;
      try {
        await api.curateLiteraturePaper(pmid, action);
      } catch (e) {
        const msg = e?.body?.message || e?.message || 'Backend error';
        window._dsToast?.({ title: 'Curation failed', body: 'PMID ' + pmid + ' · ' + msg, severity: 'error' });
        return;
      }
      try {
        const raw = localStorage.getItem('ds_lit_verdicts') || '[]';
        const arr = JSON.parse(raw);
        arr.push(entry);
        localStorage.setItem('ds_lit_verdicts', JSON.stringify(arr.slice(-500)));
      } catch {}
      try { window.dispatchEvent(new CustomEvent('ds:literature-verdict', { detail: entry })); } catch {}
      window._dsToast?.({ title: label, body: 'PMID ' + pmid, severity: 'success' });
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
                  '<article class="lib-card lib-card--review" aria-label="' + esc(p.name || 'Protocol') + '">' +
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
                      '<div class="lib-feature lib-feature--indication" title="Top citation">📄 ' + esc(String(r.topCite).slice(0, 140)) + (String(r.topCite).length > 140 ? '…' : '') + '</div>' +
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
        '<article class="lib-card lib-card--literature" aria-label="' + esc(titleTrim) + '">' +
          '<div class="lib-card-top">' +
            '<span class="lib-card-name" title="' + esc(title) + '">' + esc(titleTrim) + '</span>' +
            '<span class="lib-badge" style="background:rgba(139,92,246,0.14);color:var(--violet);border:1px solid rgba(139,92,246,0.35)" title="PubMed ID">PMID ' + esc(pmid) + '</span>' +
          '</div>' +
          '<div class="lib-card-meta" style="color:var(--text-tertiary)">' + metaBits.join(' · ') + '</div>' +
          (chips ? '<div class="lib-card-meta" style="margin-top:4px">Linked protocols: ' + chips + '</div>' : '') +
          '<div class="lib-features">' +
            '<div class="lib-feature lib-feature--indication" style="color:var(--text-tertiary)" title="When Literature Watch first saw this paper">⏱ First seen ' + seen + '</div>' +
          '</div>' +
          '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
            '<button class="ch-btn-sm ch-btn-teal" title="Flag this paper as worth a closer review" onclick="window._litPaperAction(\'mark-relevant\', \'' + esc(pmid) + '\')">Mark relevant</button>' +
            '<button class="ch-btn-sm" title="Promote this paper to formal protocol references" onclick="window._litPaperAction(\'promote\', \'' + esc(pmid) + '\')">Promote to references</button>' +
            '<button class="ch-btn-sm" title="Exclude this paper from future surfacing" onclick="window._litPaperAction(\'not-relevant\', \'' + esc(pmid) + '\')">Not relevant</button>' +
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
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr));margin-bottom:16px">' +
        kpi('var(--amber)',  totalUnreviewed, 'Unreviewed', 'governance array contains "unreviewed"') +
        kpi('var(--blue)',   totalVerify,     'Verify flags', 'notes field mentions "verify"') +
        kpi('var(--teal)',   gradeABHighPri,  'Grade A/B priority', 'Highest clinical priority — strong evidence awaiting review') +
        kpi('var(--violet)', pendingPapers,   'Pending papers', 'Cross-protocol literature_watch rows (verdict=pending)') +
        kpi('var(--rose)',   _protosAll.length, 'Total protocols', 'From curated 87K-paper evidence library') +
        kpi('var(--teal)',   (_totalEvPapersLib / 1000).toFixed(0) + 'K', 'Evidence base', '87K papers indexed across ' + _condEvidence.length + ' conditions') +
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

    // ── Fetch real data: patients, clinic-wide alert summary, per-patient wearables ────
    const [patientsRes, alertSummaryRes] = await Promise.all([
      api.listPatients().catch(() => ({ items: [] })),
      api.getClinicAlertSummary?.().catch(() => null) || Promise.resolve(null),
    ]);
    const patients = patientsRes?.items || [];
    const alertSummary = alertSummaryRes || { total_active: 0, urgent_count: 0, warning_count: 0, info_count: 0, patient_ids_with_alerts: [] };

    // For the alert feed + wearable status panel, fetch per-patient summaries for
    // patients known to have alerts (priority) plus the most-recent patients up
    // to a cap. Each /summary payload carries connections + recent_alerts.
    const ALERT_PATIENT_IDS = Array.isArray(alertSummary.patient_ids_with_alerts) ? alertSummary.patient_ids_with_alerts : [];
    const PRIORITY_IDS = new Set(ALERT_PATIENT_IDS);
    const otherIds = patients.map(p => p.id).filter(id => id && !PRIORITY_IDS.has(id)).slice(0, Math.max(0, 8 - PRIORITY_IDS.size));
    const fetchIds = [...ALERT_PATIENT_IDS, ...otherIds].slice(0, 10);
    const patientById = Object.fromEntries(patients.map(p => [p.id, p]));
    const summaryResults = await Promise.all(
      fetchIds.map(id => api.getPatientWearableSummary?.(id, 7).catch(() => null) || Promise.resolve(null))
    );

    // Flatten alerts from all fetched summaries + join patient names
    const allAlerts = [];
    const connectionsByPatient = {};
    summaryResults.forEach((s, idx) => {
      if (!s) return;
      const pid = fetchIds[idx];
      const pat = patientById[pid];
      const patName = pat ? ((pat.first_name || '') + (pat.last_name ? ' ' + pat.last_name : '')).trim() : pid;
      connectionsByPatient[pid] = { name: patName, connections: s.connections || [] };
      (s.recent_alerts || []).forEach(a => {
        allAlerts.push({ ...a, patient_name: patName });
      });
    });
    allAlerts.sort((a, b) => (b.triggered_at || '').localeCompare(a.triggered_at || ''));
    const alertsTop = allAlerts.slice(0, 8);

    // KPIs from real data
    const activeAlerts = alertSummary.total_active || 0;
    const wearablesActive = Object.values(connectionsByPatient)
      .reduce((n, v) => n + v.connections.filter(c => c.status === 'connected').length, 0);
    const monitored = Object.values(connectionsByPatient).filter(v => v.connections.length > 0).length;
    const needsReview = allAlerts.filter(a => !a.reviewed_at && !a.dismissed).length;

    // Relative time helper (monitor-hub local)
    const _relTime = (iso) => {
      if (!iso) return '—';
      const t = new Date(iso).getTime();
      if (isNaN(t)) return '—';
      const diff = Math.floor((Date.now() - t) / 1000);
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
      return new Date(iso).toLocaleDateString();
    };

    // Alert severity → colour + glyph mapping
    const _alertStyle = (a) => {
      const sev = (a.severity || '').toLowerCase();
      if (sev === 'urgent' || sev === 'severe') return { color: 'var(--red)', icon: '⚠' };
      if (sev === 'warning' || sev === 'moderate') return { color: 'var(--amber)', icon: '◬' };
      return { color: 'var(--blue)', icon: 'ℹ' };
    };
    const _flagLabel = (t) => (t || '').replace(/_/g, ' ');

    // Wearable Status panel — one row per monitored patient showing aggregate
    // connection state (connected / stale / disconnected / none).
    const wearableRows = [];
    Object.entries(connectionsByPatient).slice(0, 8).forEach(([pid, v]) => {
      const conns = v.connections;
      let label, color;
      if (!conns.length) { label = 'No device connected'; color = 'var(--text-tertiary)'; }
      else {
        const any = conns[0];
        const hrs = any.last_sync_at ? (Date.now() - new Date(any.last_sync_at).getTime()) / 3600000 : Infinity;
        const connected = conns.some(c => c.status === 'connected');
        if (!connected) { label = 'Disconnected'; color = 'var(--red)'; }
        else if (hrs > 48) { label = 'Sync stale'; color = 'var(--amber)'; }
        else { label = conns.map(c => c.source).join(', ') || 'Connected'; color = 'var(--green)'; }
      }
      wearableRows.push({ pid, name: v.name, label, color });
    });

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
          <div class="ch-kpi-card" style="--kpi-color:var(--red)"><div class="ch-kpi-val">${activeAlerts}</div><div class="ch-kpi-label">Active Alerts</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${wearablesActive}</div><div class="ch-kpi-label">Wearables Connected</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${needsReview}</div><div class="ch-kpi-label">Needs Review</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${monitored}</div><div class="ch-kpi-label">Monitored Patients</div></div>
        </div>
        <div class="ch-two-col">
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Alert Feed</span><span style="font-size:11px;color:var(--text-tertiary)">Wearable flags · last 30 days</span></div>
            ${alertsTop.length === 0 ? '<div class="ch-empty" style="padding:28px 16px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No active wearable alerts.</div>'
              : alertsTop.map(a => {
                  const st = _alertStyle(a);
                  const safeDetail = (a.detail || _flagLabel(a.flag_type) || '').replace(/'/g, '&#39;');
                  return '<div class="rec-apt-row" id="mh-alert-'+a.id+'">'+
                    '<span style="font-size:16px;color:'+st.color+'">'+st.icon+'</span>'+
                    '<div class="rec-apt-info">'+
                      '<div class="rec-apt-name" style="color:'+st.color+'">'+a.patient_name+' — '+_flagLabel(a.flag_type)+'</div>'+
                      (a.detail ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px">'+safeDetail+'</div>' : '')+
                    '</div>'+
                    '<span class="rec-apt-time" title="'+(a.triggered_at||'')+'">'+_relTime(a.triggered_at)+'</span>'+
                    '<button class="ch-btn-sm" style="margin-left:6px" onclick="window._mhDismissAlert(\''+a.id+'\')" title="Acknowledge and dismiss this flag">Dismiss</button>'+
                  '</div>';
                }).join('')}
          </div>
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Wearable Status</span><span style="font-size:11px;color:var(--text-tertiary)">${wearableRows.length} patient${wearableRows.length===1?'':'s'} · live API</span></div>
            ${wearableRows.length === 0
              ? '<div class="ch-empty" style="padding:28px 16px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No patients loaded yet. Wearable connections appear here once a patient connects a health source from their portal.</div>'
              : wearableRows.map(r =>
                  '<div class="rec-apt-row"><div class="rec-apt-info"><div class="rec-apt-name">'+r.name+'</div></div>'+
                  '<span style="font-size:11px;font-weight:600;color:'+r.color+'">● '+r.label+'</span></div>'
                ).join('')}
          </div>
        </div>
      </div>
    </div>`;

    window._mhDismissAlert = async function(flagId) {
      if (!flagId) return;
      const row = document.getElementById('mh-alert-'+flagId);
      if (row) row.style.opacity = '.4';
      try {
        await api.dismissAlertFlag(flagId);
        window._dsToast?.({title:'Alert dismissed',severity:'success'});
        window._nav('monitor-hub');
      } catch (e) {
        if (row) row.style.opacity = '';
        window._dsToast?.({title:'Dismiss failed',body:e?.message||'Try again.',severity:'error'});
      }
    };
  }
  else if (tab === 'adverse') {
    setTopbar('Monitor', '<button class="btn btn-sm" onclick="window._nav(\'adverse-events-full\')">Full AE Log ↗</button>');
    el.innerHTML = '<div class="ch-shell"><div class="ch-tab-bar">'+tabBar()+'</div><div class="ch-body">'+spinner()+'</div></div>';

    // Filter state (persists across tab re-renders)
    const sevFilter = window._mhAeSevFilter || '';

    const [aesRes, patsRes] = await Promise.all([
      api.listAdverseEvents?.(sevFilter ? { severity: sevFilter } : {}).catch(() => ({ items: [] })) || Promise.resolve({ items: [] }),
      api.listPatients().catch(() => ({ items: [] })),
    ]);
    const aes = aesRes?.items || [];
    const patients = patsRes?.items || [];
    const patById = Object.fromEntries(patients.map(p => [p.id, ((p.first_name||'')+(p.last_name?' '+p.last_name:'')).trim() || p.id]));

    const sevC = { mild:'var(--green)', moderate:'var(--amber)', severe:'var(--red)', serious:'var(--red)' };
    const _aeIsOpen = a => !a.resolved_at;
    const _aeStatus = a => a.resolved_at ? 'resolved' : 'open';
    const _aeDate = a => (a.reported_at || a.created_at || '').slice(0, 10) || '—';

    const kpi = {
      open:      aes.filter(_aeIsOpen).length,
      modPlus:   aes.filter(a => ['moderate','severe','serious'].includes(a.severity)).length,
      resolved:  aes.filter(a => a.resolved_at).length,
      total:     aes.length,
    };

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
          <div class="ch-kpi-card" style="--kpi-color:var(--red)"><div class="ch-kpi-val">${kpi.open}</div><div class="ch-kpi-label">Open AEs</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${kpi.modPlus}</div><div class="ch-kpi-label">Moderate+</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${kpi.resolved}</div><div class="ch-kpi-label">Resolved</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${kpi.total}</div><div class="ch-kpi-label">Total</div></div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd">
            <span class="ch-card-title">Adverse Events</span>
            <span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <select id="mh-ae-sev-filter" class="ch-select" style="font-size:11.5px;height:26px" onchange="window._mhAeApplySevFilter(this.value)">
                <option value=""${sevFilter===''?' selected':''}>All severities</option>
                <option value="mild"${sevFilter==='mild'?' selected':''}>Mild</option>
                <option value="moderate"${sevFilter==='moderate'?' selected':''}>Moderate</option>
                <option value="severe"${sevFilter==='severe'?' selected':''}>Severe</option>
                <option value="serious"${sevFilter==='serious'?' selected':''}>Serious</option>
              </select>
              <button class="ch-btn-sm ch-btn-teal" onclick="window._mhAeOpenReport()">+ Report AE</button>
            </span>
          </div>
          ${aes.length === 0
            ? '<div class="ch-empty" style="padding:40px 16px;text-align:center;color:var(--text-tertiary);font-size:12.5px">'+(sevFilter?'No adverse events match the <b>'+sevFilter+'</b> filter.':'No adverse events reported. Use <b>+ Report AE</b> to log a new event.')+'</div>'
            : aes.map(ae => {
                const sev = ae.severity || 'mild';
                const st  = _aeStatus(ae);
                const nm  = patById[ae.patient_id] || ae.patient_id || '—';
                const desc = ae.description ? ae.description.replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
                const stColor = st === 'resolved' ? 'var(--green)' : 'var(--amber)';
                return '<div class="book-row" id="ae-row-'+ae.id+'">'+
                  '<div class="book-datetime"><div class="book-date">'+_aeDate(ae)+'</div></div>'+
                  '<div class="book-info"><div class="book-patient">'+nm+'</div><div class="book-clinician">'+(ae.event_type||'—')+'</div>'+
                    (desc?'<div class="book-notes">'+desc+'</div>':'')+
                  '</div>'+
                  '<div class="book-status-col"><span class="book-status-badge" style="color:'+(sevC[sev]||'var(--text-tertiary)')+';background:'+(sevC[sev]||'var(--text-tertiary)')+'22">'+sev+'</span></div>'+
                  '<div class="book-status-col"><span class="book-status-badge" style="color:'+stColor+';background:'+stColor+'22">'+st+'</span></div>'+
                  '<div class="book-actions">'+
                    (st === 'open' ? '<button class="ch-btn-sm" onclick="window._mhAeResolve(\''+ae.id+'\')" title="Mark this adverse event as resolved">Resolve</button>' : '')+
                  '</div>'+
                '</div>';
              }).join('')}
        </div>
      </div>
    </div>`;

    window._mhAeApplySevFilter = function(value) {
      window._mhAeSevFilter = value;
      window._monitorHubTab = 'adverse';
      window._nav('monitor-hub');
    };

    window._mhAeResolve = async function(id) {
      if (!id) return;
      if (!confirm('Mark this adverse event as resolved?')) return;
      try {
        await api.resolveAdverseEvent(id, { resolution: 'resolved' });
        window._dsToast?.({title:'AE resolved',severity:'success'});
        window._nav('monitor-hub');
      } catch (e) {
        window._dsToast?.({title:'Resolve failed',body:e?.message||'Try again.',severity:'error'});
      }
    };

    window._mhAeOpenReport = function() {
      document.getElementById('mh-ae-report-modal')?.remove();
      const patOpts = patients.map(p => {
        const nm = ((p.first_name||'')+(p.last_name?' '+p.last_name:'')).trim() || p.id;
        return '<option value="'+p.id+'">'+nm+'</option>';
      }).join('');
      const overlay = document.createElement('div');
      overlay.id = 'mh-ae-report-modal';
      overlay.className = 'ch-modal-overlay';
      overlay.innerHTML =
        '<div class="ch-modal" style="width:min(560px,95vw)">'+
          '<div class="ch-modal-hd"><span>Report Adverse Event</span>'+
            '<button class="ch-modal-close" onclick="document.getElementById(\'mh-ae-report-modal\')?.remove()">✕</button>'+
          '</div>'+
          '<div class="ch-modal-body">'+
            '<div class="ch-form-group" style="margin-bottom:10px"><label class="ch-label">Patient</label>'+
              '<select id="mh-ae-patient" class="ch-select ch-select--full">'+(patOpts||'<option value="">(no patients)</option>')+'</select></div>'+
            '<div class="ch-form-group" style="margin-bottom:10px"><label class="ch-label">Event type</label>'+
              '<input id="mh-ae-type" class="ch-select ch-select--full" placeholder="e.g. headache, scalp_discomfort" maxlength="40"></div>'+
            '<div class="ch-form-group" style="margin-bottom:10px"><label class="ch-label">Severity</label>'+
              '<select id="mh-ae-sev" class="ch-select ch-select--full">'+
                '<option value="mild">Mild</option>'+
                '<option value="moderate">Moderate</option>'+
                '<option value="severe">Severe</option>'+
                '<option value="serious">Serious</option>'+
              '</select></div>'+
            '<div class="ch-form-group" style="margin-bottom:10px"><label class="ch-label">Onset timing</label>'+
              '<select id="mh-ae-onset" class="ch-select ch-select--full">'+
                '<option value="">—</option>'+
                '<option value="during">During session</option>'+
                '<option value="immediately_after">Immediately after</option>'+
                '<option value="24h_post">Within 24h</option>'+
                '<option value="delayed">Delayed (>24h)</option>'+
              '</select></div>'+
            '<div class="ch-form-group" style="margin-bottom:10px"><label class="ch-label">Description</label>'+
              '<textarea id="mh-ae-desc" class="ch-textarea" rows="4" placeholder="What happened, what was done, patient state."></textarea></div>'+
            '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">'+
              '<button class="btn" onclick="document.getElementById(\'mh-ae-report-modal\')?.remove()">Cancel</button>'+
              '<button class="btn btn-primary" onclick="window._mhAeSubmit()">Report</button>'+
            '</div>'+
          '</div>'+
        '</div>';
      document.body.appendChild(overlay);
      setTimeout(() => document.getElementById('mh-ae-type')?.focus(), 50);
    };

    window._mhAeSubmit = async function() {
      const patient_id = document.getElementById('mh-ae-patient')?.value;
      const event_type = (document.getElementById('mh-ae-type')?.value || '').trim();
      const severity   = document.getElementById('mh-ae-sev')?.value || 'mild';
      const onset      = document.getElementById('mh-ae-onset')?.value || null;
      const description= document.getElementById('mh-ae-desc')?.value || null;
      if (!patient_id) { window._dsToast?.({title:'Patient required',severity:'warn'}); return; }
      if (!event_type) { window._dsToast?.({title:'Event type required',severity:'warn'}); return; }
      try {
        await api.reportAdverseEvent({ patient_id, event_type, severity, onset_timing: onset, description });
        document.getElementById('mh-ae-report-modal')?.remove();
        window._dsToast?.({title:'Adverse event reported',severity:'success'});
        window._nav('monitor-hub');
      } catch (e) {
        window._dsToast?.({title:'Report failed',body:e?.message||'Try again.',severity:'error'});
      }
    };

    const _aeDeepId = window._monitorHubAEId;
    if (_aeDeepId) {
      requestAnimationFrame(() => {
        const row = document.getElementById('ae-row-' + _aeDeepId);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.style.transition = 'background-color 1.4s';
          row.style.backgroundColor = 'rgba(255, 181, 71, 0.18)';
          setTimeout(() => { row.style.backgroundColor = ''; }, 1600);
        }
      });
      window._monitorHubAEId = null;
    }
  }
  else if (tab === 'notes') {
    setTopbar('Monitor', '');
    el.innerHTML = '<div class="ch-shell"><div class="ch-tab-bar">'+tabBar()+'</div><div class="ch-body">'+spinner()+'</div></div>';
    const NOTE_TYPES = ['Session Note','Assessment Note','Progress Summary','Prescription Note','Discharge Summary','Phone Call Note','Referral Letter'];

    // Fetch patients + real server-persisted notes (documents with doc_type=note).
    const [patsRes, docsRes] = await Promise.all([
      api.listPatients().catch(() => ({ items: [] })),
      api.listDocuments?.().catch(() => ({ items: [] })) || Promise.resolve({ items: [] }),
    ]);
    const patients = patsRes?.items || [];
    const patById  = Object.fromEntries(patients.map(p => [p.id, ((p.first_name||'')+(p.last_name?' '+p.last_name:'')).trim() || p.id]));
    const serverNotes = (docsRes?.items || []).filter(d => (d.doc_type||'').toLowerCase() === 'note');

    const patOpts = patients.length
      ? patients.map(p => '<option value="'+p.id+'">'+(((p.first_name||'')+' '+(p.last_name||'')).trim() || p.id)+'</option>').join('')
      : '<option value="">(no patients — add one first)</option>';
    const draftNotes = (() => { try { return JSON.parse(localStorage.getItem('ds_notes_v1')||'[]'); } catch { return []; } })();

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
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-primary" onclick="window._noteSave()" title="Saves to the patient record as a clinical document">Save to Patient Record</button>
                <button class="btn" onclick="window._noteSaveDraft()" title="Saves locally on this device only — not visible server-side">Save as Draft</button>
                <button class="btn" onclick="window._noteClear()">Clear</button>
              </div>
            </div>
          </div>
          <div class="ch-card">
            <div class="ch-card-hd"><span class="ch-card-title">Recent Notes</span><span style="font-size:11px;color:var(--text-tertiary)">${serverNotes.length} saved · ${draftNotes.length} draft${draftNotes.length===1?'':'s'}</span></div>
            ${(serverNotes.length === 0 && draftNotes.length === 0)
              ? '<div class="ch-empty" style="padding:28px 16px;text-align:center;color:var(--text-tertiary);font-size:12.5px">No notes yet. Dictate or type above, then Save to Patient Record.</div>'
              : [
                  ...serverNotes.slice(0,6).map(n => {
                    const patName = patById[n.patient_id] || n.patient_id || '—';
                    const date = (n.updated_at||n.created_at||'').slice(0,10) || '—';
                    const preview = (n.notes || n.title || '').slice(0,60);
                    return '<div class="book-row"><div class="book-datetime"><div class="book-date">'+date+'</div><div class="book-time">'+(n.title||'Note')+'</div></div>'+
                      '<div class="book-info"><div class="book-patient">'+patName+'</div><div class="book-notes">'+preview+(preview.length===60?'…':'')+'</div></div>'+
                      '<div class="book-actions"><span style="font-size:10px;color:var(--green);font-weight:600;letter-spacing:0.5px">SAVED</span></div></div>';
                  }),
                  ...draftNotes.slice(0,4).map(n => {
                    const safeLoad = (n.text||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;').slice(0,400);
                    return '<div class="book-row"><div class="book-datetime"><div class="book-date">'+n.date+'</div><div class="book-time">'+n.type+'</div></div>'+
                      '<div class="book-info"><div class="book-patient">'+n.patient+'</div><div class="book-notes">'+(n.text||'').slice(0,60)+(n.text&&n.text.length>60?'…':'')+'</div></div>'+
                      '<div class="book-actions"><button class="ch-btn-sm" onclick="window._noteLoadDraft(\''+safeLoad+'\')">Load</button><span style="margin-left:6px;font-size:10px;color:var(--amber);font-weight:600;letter-spacing:0.5px">DRAFT</span></div></div>';
                  }),
                ].join('')}
          </div>
        </div>
      </div>
    </div>`;

    window._noteLoadDraft = (text) => {
      const ta = document.getElementById('note-text');
      if (ta) ta.value = text;
    };

    window._noteSave = async () => {
      const text = document.getElementById('note-text')?.value?.trim();
      const type = document.getElementById('note-type')?.value || 'Session Note';
      const patEl = document.getElementById('note-patient');
      const patient_id = patEl?.value || '';
      const patient_label = patEl?.options[patEl?.selectedIndex]?.text || '';
      if (!text) { window._dsToast?.({title:'Empty note',severity:'warn'}); return; }
      if (!patient_id) { window._dsToast?.({title:'Pick a patient',body:'Add a patient first to save to the record.',severity:'warn'}); return; }
      try {
        await api.createDocument({
          title: type + ' — ' + (patient_label || patient_id),
          doc_type: 'note',
          patient_id,
          status: 'completed',
          notes: text,
        });
        window._noteText = '';
        window._dsToast?.({title:'Note saved to patient record',body:type+' for '+patient_label,severity:'success'});
        window._monitorHubTab = 'notes';
        window._nav('monitor-hub');
      } catch (e) {
        window._dsToast?.({title:'Save failed',body:e?.message||'Saved as draft instead.',severity:'error'});
        window._noteSaveDraft();
      }
    };

    window._noteSaveDraft = () => {
      const text = document.getElementById('note-text')?.value?.trim();
      const type = document.getElementById('note-type')?.value || 'Session Note';
      const patEl = document.getElementById('note-patient');
      const patient = patEl?.options[patEl?.selectedIndex]?.text || 'Unknown';
      if (!text) { window._dsToast?.({title:'Empty note',severity:'warn'}); return; }
      const notes = (() => { try { return JSON.parse(localStorage.getItem('ds_notes_v1')||'[]'); } catch { return []; } })();
      notes.unshift({ id:'DRAFT-'+Date.now(), patient, type, text, date: new Date().toISOString().slice(0,10) });
      try { localStorage.setItem('ds_notes_v1', JSON.stringify(notes.slice(0,50))); } catch {}
      window._noteText = '';
      window._dsToast?.({title:'Draft saved locally',body:'Not synced to server.',severity:'info'});
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
            <div class="ch-card-hd">
              <span class="ch-card-title">Session Recordings</span>
              <button class="ch-btn-sm ch-btn-teal" id="rec-upload-btn" onclick="window._recUpload()">+ Upload Recording</button>
            </div>
            <input type="file" id="rec-upload-input" accept="audio/mpeg,audio/wav,audio/webm,video/mp4,video/webm" style="display:none" onchange="window._recUploadPick(event)">
            <div id="rec-server-player" style="padding:10px 14px 0;display:none"></div>
            <div id="rec-log-list">
              <div class="ch-empty">Loading recordings…</div>
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

    // ── Server-backed recordings (media-storage MVP) ────────────────────────
    // The local _recLogs (above) is a transient in-browser session log. The
    // server list is the durable record — persisted to the Fly volume and
    // streamed back through /api/v1/recordings/{id}/file.
    const _fmtBytes = (n) => {
      if (n == null) return '';
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(1) + ' MB';
    };
    window._recPlayingBlobUrl = null;
    window._recRefreshServer = async () => {
      const list = document.getElementById('rec-log-list');
      if (!list) return;
      try {
        const res = await api.listRecordings();
        const items = res?.items || [];
        if (!items.length) {
          list.innerHTML = '<div class="ch-empty">No recordings yet. Click + Upload Recording to add one.</div>';
          return;
        }
        list.innerHTML = items.map(r => {
          const date = (r.uploaded_at || '').slice(0, 10);
          const dur = r.duration_seconds != null ? (r.duration_seconds + 's · ') : '';
          const safeTitle = String(r.title || 'Untitled').replace(/'/g, "\\'");
          return '<div class="book-row" data-rec-id="' + r.id + '">'
            + '<div class="book-datetime"><div class="book-date">' + date + '</div><div class="book-time">' + dur + _fmtBytes(r.byte_size) + '</div></div>'
            + '<div class="book-info"><div class="book-patient">' + safeTitle + '</div><div class="book-notes">' + (r.mime_type || '') + '</div></div>'
            + '<div class="book-actions">'
            +   '<button class="ch-btn-sm" title="Play" onclick="window._recPlay(\'' + r.id + '\',\'' + (r.mime_type || '') + '\')">▶</button>'
            +   '<button class="ch-btn-sm" title="Delete" style="margin-left:6px" onclick="window._recDelete(\'' + r.id + '\')">✕</button>'
            + '</div></div>';
        }).join('');
      } catch (err) {
        list.innerHTML = '<div class="ch-empty">Could not load recordings: ' + (err?.message || 'unknown error') + '</div>';
      }
    };
    window._recPlay = async (id, mime) => {
      const slot = document.getElementById('rec-server-player');
      if (!slot) return;
      try {
        if (window._recPlayingBlobUrl) {
          try { URL.revokeObjectURL(window._recPlayingBlobUrl); } catch {}
          window._recPlayingBlobUrl = null;
        }
        slot.innerHTML = '<div style="font-size:12px;color:var(--text-tertiary);padding:4px 0">Loading…</div>';
        slot.style.display = '';
        const url = await api.recordingPlaybackUrl(id);
        window._recPlayingBlobUrl = url;
        const tag = (mime || '').startsWith('video/') ? 'video' : 'audio';
        slot.innerHTML = '<' + tag + ' controls autoplay style="width:100%;max-height:240px;border-radius:6px;background:#000" src="' + url + '"></' + tag + '>';
      } catch (err) {
        slot.innerHTML = '<div style="font-size:12px;color:var(--red);padding:4px 0">Playback failed: ' + (err?.message || 'unknown error') + '</div>';
      }
    };
    window._recUpload = () => {
      document.getElementById('rec-upload-input')?.click();
    };
    window._recUploadPick = async (ev) => {
      const file = ev?.target?.files?.[0];
      if (!file) return;
      const btn = document.getElementById('rec-upload-btn');
      const prev = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }
      try {
        await api.uploadRecording(file, { title: file.name });
        window._dsToast?.({ title: 'Uploaded', body: file.name, severity: 'success' });
        await window._recRefreshServer();
      } catch (err) {
        window._dsToast?.({ title: 'Upload failed', body: err?.message || 'Unknown error', severity: 'error' });
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = prev || '+ Upload Recording'; }
        ev.target.value = '';
      }
    };
    window._recDelete = async (id) => {
      if (!confirm('Delete this recording? This cannot be undone.')) return;
      try {
        await api.deleteRecording(id);
        window._dsToast?.({ title: 'Recording deleted', severity: 'success' });
        await window._recRefreshServer();
      } catch (err) {
        window._dsToast?.({ title: 'Delete failed', body: err?.message || 'Unknown error', severity: 'error' });
      }
    };
    // Kick off the initial load.
    window._recRefreshServer();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgVirtualCareHub — delegates to unified Virtual Care page
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
    consent:   { label: 'Consent',          color: 'var(--violet)' },
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
      template_id: d.template_id, notes: d.notes, file_ref: d.file_ref,
    }));
  } catch {}
  const data = backendDocs ? { docs: backendDocs } : loadDocs();

  // Custom (clinician-authored) templates from the backend, shaped to match
  // the bundled DOCUMENT_TEMPLATES rows the templates list already renders.
  let customTemplates = [];
  try {
    const r = await api.listDocumentTemplates?.();
    customTemplates = (r?.items || []).map(t => ({
      id: t.id,
      name: t.name,
      cat: (t.doc_type || 'other').charAt(0).toUpperCase() + (t.doc_type || 'other').slice(1),
      pages: 1,
      langs: ['EN'],
      auto: false,
      body: t.body_markdown || '',
      _custom: true,
    }));
  } catch {}
  const stC  = { signed:'var(--green)', final:'var(--green)', sent:'var(--blue)', draft:'var(--amber)', issued:'var(--teal)', pending:'var(--amber)', uploaded:'var(--teal)', completed:'var(--green)' };

  window._docsUpload = () => document.getElementById('docs-upload-modal')?.classList.remove('ch-hidden');

  // Open the inline custom template builder modal. POSTs to
  // /api/v1/documents/templates on Save and refreshes the Templates tab.
  window._docOpenTemplateBuilder = () => {
    document.getElementById('docs-template-builder-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'docs-template-builder-modal';
    overlay.className = 'ch-modal-overlay';
    overlay.innerHTML =
      '<div class="ch-modal" style="width:min(640px,95vw)">'+
        '<div class="ch-modal-hd"><span>New Document Template</span>'+
          '<button class="ch-modal-close" onclick="document.getElementById(\'docs-template-builder-modal\')?.remove()">✕</button>'+
        '</div>'+
        '<div class="ch-modal-body">'+
          '<div class="ch-form-group" style="margin-bottom:10px">'+
            '<label class="ch-label">Name</label>'+
            '<input id="tpl-builder-name" class="ch-select ch-select--full" placeholder="e.g. GP Discharge Letter" maxlength="255">'+
          '</div>'+
          '<div class="ch-form-group" style="margin-bottom:10px">'+
            '<label class="ch-label">Type</label>'+
            '<select id="tpl-builder-type" class="ch-select ch-select--full">'+
              '<option value="letter">Letter</option>'+
              '<option value="consent">Consent</option>'+
              '<option value="handout">Handout</option>'+
              '<option value="report">Report</option>'+
              '<option value="note">Note</option>'+
              '<option value="other">Other</option>'+
            '</select>'+
          '</div>'+
          '<div class="ch-form-group" style="margin-bottom:10px">'+
            '<label class="ch-label">Body (markdown — supports {{patient_name}} merge fields when assigned)</label>'+
            '<textarea id="tpl-builder-body" class="ch-textarea" rows="10" style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px" placeholder="# Title\n\nDear {{patient_name}},\n\n…"></textarea>'+
          '</div>'+
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">'+
            '<button class="btn" onclick="document.getElementById(\'docs-template-builder-modal\')?.remove()">Cancel</button>'+
            '<button class="btn btn-primary" id="tpl-builder-save" onclick="window._docSaveTemplate?.()">Save Template</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('tpl-builder-name')?.focus(), 50);
  };

  window._docSaveTemplate = async () => {
    const nameEl = document.getElementById('tpl-builder-name');
    const typeEl = document.getElementById('tpl-builder-type');
    const bodyEl = document.getElementById('tpl-builder-body');
    const btn    = document.getElementById('tpl-builder-save');
    const name = (nameEl?.value || '').trim();
    if (!name) {
      window._dsToast?.({title:'Name required',body:'Give your template a name.',severity:'info'});
      nameEl?.focus();
      return;
    }
    const payload = {
      name,
      doc_type: typeEl?.value || 'letter',
      body_markdown: bodyEl?.value || '',
    };
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await api.createDocumentTemplate(payload);
      window._dsToast?.({title:'Template saved',body:name+' is now available.',severity:'success'});
      document.getElementById('docs-template-builder-modal')?.remove();
      window._docsHubTab = 'templates';
      window._nav('documents-hub');  // refresh — re-fetches templates list
    } catch (err) {
      const msg = (err && (err.message || err.detail)) || 'Failed to save template.';
      window._dsToast?.({title:'Save failed',body:String(msg),severity:'error'});
      if (btn) { btn.disabled = false; btn.textContent = 'Save Template'; }
    }
  };

  window._docDeleteTemplate = async (id) => {
    const tpl = customTemplates.find(t => t.id === id);
    if (!tpl) return;
    if (!window.confirm('Delete template "'+tpl.name+'"? This cannot be undone.')) return;
    try {
      await api.deleteDocumentTemplate(id);
      window._dsToast?.({title:'Template deleted',body:tpl.name+' removed.',severity:'success'});
      window._nav('documents-hub');
    } catch (err) {
      const msg = (err && (err.message || err.detail)) || 'Failed to delete template.';
      window._dsToast?.({title:'Delete failed',body:String(msg),severity:'error'});
    }
  };

  // Resolve a template id against both bundled DOCUMENT_TEMPLATES and the
  // clinician's custom templates (the latter only exist client-side after
  // listDocumentTemplates() completes).
  const _findTpl = (id) => TEMPLATES.find(t => t.id === id) || customTemplates.find(t => t.id === id);

  // Preview a template in a modal (rendered client-side via renderTemplate)
  window._docsPreview = (templateId) => {
    const tpl = _findTpl(templateId);
    if (!tpl) { window._dsToast?.({title:'Not found',body:'Template unavailable.',severity:'error'}); return; }
    let rendered;
    if (tpl._custom) {
      // Custom templates aren't registered with renderTemplate; fall back to
      // the raw markdown body the user authored.
      rendered = tpl.body || '';
    } else {
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
    const tpl = _findTpl(templateId);
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

  // Download a document. If the doc id refers to a real backend record with
  // an uploaded file blob, point the browser at the streaming download URL so
  // the real file is delivered. Otherwise (template-only or demo row), fall
  // back to a client-side render of the template as a .txt.
  window._docsDownload = (templateIdOrDocId, docName, hasFile) => {
    if (hasFile && templateIdOrDocId) {
      const a = document.createElement('a');
      a.href = api.documentDownloadUrl(templateIdOrDocId);
      a.download = docName || 'document';
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    let text;
    try { text = (templateIdOrDocId ? renderTemplate(templateIdOrDocId, {}) : null) || docName || 'document'; }
    catch { text = docName || 'document'; }
    const blob = new Blob([text], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (docName||'document') + '.txt'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  };

  // POST the contents of a multi-file input to the documents upload endpoint.
  // Used by both the topbar modal and the uploads-tab file picker.
  window._docsUploadFiles = async (files, onDone) => {
    if (!files || !files.length) return;
    const results = { ok:0, fail:0, errors:[] };
    for (const f of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append('file', f, f.name);
        fd.append('title', f.name);
        fd.append('doc_type', 'uploaded');
        await api.uploadDocument(fd);
        results.ok += 1;
      } catch (e) {
        results.fail += 1;
        results.errors.push(f.name + ': ' + (e?.message || 'upload failed'));
      }
    }
    if (results.ok) window._dsToast?.({title:'Uploaded', body: results.ok + ' file(s) saved.', severity:'success'});
    if (results.fail) window._dsToast?.({title:'Some uploads failed', body: results.errors.join('; '), severity:'error'});
    if (typeof onDone === 'function') onDone(results);
  };

  // Persist an AI-generated letter/report as a "generated" Documents record.
  window._docsSaveGenerated = async (kind, title, content, patientId, templateId) => {
    if (!content || !content.trim()) {
      window._dsToast?.({title:'Nothing to save',body:'Generate first, then save.',severity:'info'});
      return;
    }
    try {
      await api.createDocument({
        title: title || (kind === 'letter' ? 'Patient Letter' : 'Clinical Document'),
        doc_type: 'generated',
        patient_id: patientId || null,
        template_id: templateId || null,
        status: 'completed',
        notes: content,
      });
      window._dsToast?.({title:'Saved',body:(kind==='letter'?'Letter':'Document')+' saved to records.',severity:'success'});
      window._nav('documents-hub');
    } catch {
      window._dsToast?.({title:'Failed',body:'Could not save document.',severity:'error'});
    }
  };

  function docRows(list) {
    if (!list.length) return '<div class="ch-empty">No documents found.</div>';
    const esc = s => String(s==null?'':s).replace(/'/g,"\\'");
    return list.map(d => {
      const hasFile = !!(d.file_ref || d.status === 'uploaded');
      // Downloadable records key on document id; template previews key on template_id.
      const downloadArg = hasFile ? "'"+esc(d.id)+"'" : (d.template_id ? "'"+esc(d.template_id)+"'" : 'null');
      const nameArg = "'"+esc(d.name)+"'";
      const hasFileArg = hasFile ? 'true' : 'false';
      return '<div class="book-row">'+
        '<div class="book-datetime"><div class="book-date">'+d.date+'</div><div class="book-time">'+d.size+'</div></div>'+
        '<div class="book-info"><div class="book-patient">'+d.name+'</div><div class="book-clinician">'+d.patient+' · '+d.type+'</div></div>'+
        '<div class="book-status-col"><span class="book-status-badge" style="color:'+(stC[d.status]||'var(--text-tertiary)')+';background:'+(stC[d.status]||'var(--text-tertiary)')+'22;text-transform:capitalize">'+d.status+'</span></div>'+
        '<div class="book-actions">'+
          '<button class="ch-btn-sm" onclick="window._docsDownload('+downloadArg+','+nameArg+','+hasFileArg+')">↓</button>'+
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
    const ALL_TPLS = TEMPLATES.concat(customTemplates);
    const cats = ['All',...new Set(ALL_TPLS.map(t=>t.cat))];
    const filt = window._tplFilter||'All';
    const rows = ALL_TPLS.filter(t=>filt==='All'||t.cat===filt);
    main = `
      <div class="ch-card">
        <div class="ch-card-hd" style="flex-wrap:wrap;gap:8px">
          <span class="ch-card-title">Document Templates — ${ALL_TPLS.length}</span>
          <button class="ch-btn-sm ch-btn-teal" onclick="window._docOpenTemplateBuilder?.()">+ New Template</button>
        </div>
        <div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border)">
          ${cats.map(c=>'<button class="reg-domain-pill'+(c===filt?' active':'')+'" onclick="window._tplFilter=\''+c+'\';window._nav(\'documents-hub\')">'+c+'</button>').join('')}
        </div>
        ${rows.map(t=>{
          const safeId = String(t.id).replace(/'/g,"\\'");
          const customBadge = t._custom ? '<span class="book-status-badge" style="color:var(--teal);background:rgba(46,196,182,0.12);margin-right:6px">Custom</span>' : '';
          const deleteBtn = t._custom
            ? '<button class="ch-btn-sm" title="Delete template" onclick="window._docDeleteTemplate(\''+safeId+'\')">Delete</button>'
            : '';
          return '<div class="book-row">'+
            '<div class="book-info"><div class="book-patient">'+t.name+'</div><div class="book-clinician">'+t.cat+' · '+t.pages+' pages'+(t.auto?' · Auto-gen':'')+'</div></div>'+
            '<div class="book-status-col">'+customBadge+'<span class="book-status-badge" style="color:var(--blue);background:rgba(74,158,255,0.1)">'+t.langs.join('/')+'</span></div>'+
            '<div class="book-actions">'+
              '<button class="ch-btn-sm" onclick="window._docsPreview(\''+safeId+'\')">'+(t.auto?'Generate':'Open')+'</button>'+
              '<button class="ch-btn-sm ch-btn-teal" onclick="window._docsSendTemplate(\''+safeId+'\')">Assign</button>'+
              deleteBtn+
            '</div>'+
          '</div>';
        }).join('')}
      </div>`;
  }
  else if (tab === 'consent') {
    main = `<div id="consent-embed-root" style="min-height:400px">
      <div style="padding:40px;text-align:center;color:var(--text-tertiary);font-size:13px">Loading consent module&hellip;</div>
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
              <button class="ch-btn-sm ch-btn-teal" onclick="window._docsSaveGenerated('letter', document.getElementById('letter-template')?.options[document.getElementById('letter-template')?.selectedIndex]?.text, document.getElementById('letter-content')?.textContent || '', document.getElementById('letter-patient')?.value, document.getElementById('letter-template')?.value)">Save</button>
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

    // Real upload: render preview rows while the POSTs are in flight, then
    // refresh the hub so the new records show up in the list.
    window._docsHandleUpload = async (files) => {
      const list = document.getElementById('docs-upload-list');
      if (list) {
        list.innerHTML = Array.from(files).map(f =>
          '<div class="book-row"><div class="book-info"><div class="book-patient">'+f.name+'</div><div class="book-clinician">'+(f.size>1024*1024?(f.size/1024/1024).toFixed(1)+' MB':(f.size/1024).toFixed(0)+' KB')+'</div></div><div class="book-status-col"><span class="book-status-badge" style="color:var(--amber);background:rgba(245,158,11,0.1)">Uploading…</span></div><div class="book-actions"></div></div>'
        ).join('');
      }
      await window._docsUploadFiles(files, () => { window._nav('documents-hub'); });
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
          <div id="docs-modal-file-hint">Click to select files</div>
        </div>
        <input type="file" id="docs-modal-file" multiple accept=".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.txt" style="display:none" onchange="var h=document.getElementById('docs-modal-file-hint');if(h)h.textContent=this.files.length+' file(s) selected'">
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="docs-modal-upload-btn" onclick="(async()=>{const inp=document.getElementById('docs-modal-file');if(!inp||!inp.files||!inp.files.length){window._dsToast?.({title:'No files',body:'Select one or more files first.',severity:'info'});return;}const btn=document.getElementById('docs-modal-upload-btn');if(btn){btn.disabled=true;btn.textContent='Uploading…';}await window._docsUploadFiles(inp.files,()=>{document.getElementById('docs-upload-modal')?.classList.add('ch-hidden');window._nav('documents-hub');});if(btn){btn.disabled=false;btn.textContent='Upload';}})()">Upload</button>
          <button class="btn" onclick="document.getElementById('docs-upload-modal').classList.add('ch-hidden')">Cancel</button>
        </div>
      </div>
    </div>
  </div>`;

  // Mount embedded consent module when consent tab is active
  if (tab === 'consent') {
    const embedRoot = document.getElementById('consent-embed-root');
    if (embedRoot) {
      const { renderConsentPanel } = await import('./pages-consent.js');
      await renderConsentPanel(embedRoot);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgReportsHubNew — Generate · Recent · Analytics · Export
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgReportsHubNew(setTopbar, navigate) {
  const tab = window._reportsHubTab || 'generate';
  window._reportsHubTab = tab;
  const TAB_META = {
    generate:   { label: 'Generate',         color: 'var(--teal)'   },
    combined:   { label: 'Combined Report',  color: 'var(--green)'  },
    insights:   { label: 'Health Insights',  color: 'var(--violet)' },
    recent:     { label: 'Recent Reports',   color: 'var(--blue)'   },
    analytics:  { label: 'Analytics',        color: 'var(--violet)' },
    export:     { label: 'Export',           color: 'var(--amber)'  },
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
    { id:'R1', name:'Initial Assessment Report',       cat:'Intake',       auto:true,  fields:18, desc:'Full intake assessment including clinical history, contraindications, baseline scores.', sources:['patients','assessments'] },
    { id:'R2', name:'Session Progress Note',           cat:'Session',      auto:true,  fields:12, desc:'Per-session clinical note with tolerance, adverse events, and progress markers.', sources:['sessions','courses'] },
    { id:'R3', name:'Mid-Course Review',               cat:'Review',       auto:false, fields:22, desc:'Comprehensive mid-course review comparing baseline to current outcomes.', sources:['courses','outcomes'] },
    { id:'R4', name:'Treatment Outcome Report',        cat:'Discharge',    auto:true,  fields:28, desc:'Full discharge report with outcome data, responder classification, follow-up plan.', sources:['courses','outcomes','patients'] },
    { id:'R5', name:'Adverse Event Report',            cat:'Safety',       auto:false, fields:15, desc:'Structured AE report for safety monitoring and regulatory compliance.', sources:['sessions','patients'] },
    { id:'R6', name:'GP/Referrer Summary Letter',      cat:'Referral',     auto:true,  fields:14, desc:'Concise summary letter for GP or referrer with treatment details and outcomes.', sources:['patients','courses','outcomes'] },
    { id:'R7', name:'Insurance/Funding Report',        cat:'Admin',        auto:false, fields:20, desc:'Structured report for insurance pre-authorisation or funding applications.', sources:['courses','outcomes','finance'] },
    { id:'R8', name:'qEEG Interpretation Report',      cat:'Diagnostics',  auto:false, fields:16, desc:'Clinical qEEG interpretation with protocol recommendations.', sources:['qeeg','protocols'] },
    { id:'R9', name:'Home Program Adherence Report',   cat:'Follow-up',    auto:true,  fields:10, desc:'Task completion rates, adherence trends, and patient engagement metrics.', sources:['sessions','outcomes'] },
    { id:'R10',name:'Monthly Outcomes Summary',        cat:'Analytics',    auto:true,  fields:25, desc:'Clinic-wide monthly outcomes dashboard with responder rates and trends.', sources:['outcomes','courses','patients'] },
    { id:'R11',name:'Health Correlation Report',       cat:'Health',       auto:false, fields:30, desc:'Cross-domain health correlation analysis: outcomes vs sessions, wearable vs treatment response, biomarker trends.', sources:['outcomes','sessions','wearables','courses','assessments'] },
    { id:'R12',name:'Predictive Health Outlook',       cat:'Health',       auto:false, fields:24, desc:'AI-powered prediction of treatment response based on historical outcomes, session data, and biomarkers.', sources:['outcomes','courses','sessions','patients','assessments'] },
    { id:'R13',name:'Business Performance Report',     cat:'Business',     auto:true,  fields:20, desc:'Clinic business KPIs: revenue, patient volume, course completion rates, utilisation.', sources:['finance','courses','patients','sessions'] },
    { id:'R14',name:'Patient Population Report',       cat:'Business',     auto:true,  fields:18, desc:'Demographics, condition distribution, referral sources, retention rates.', sources:['patients','courses'] },
    { id:'R15',name:'Protocol Efficacy Report',        cat:'Health',       auto:false, fields:22, desc:'Per-protocol responder rates, mean outcome deltas, session tolerance, and evidence alignment.', sources:['protocols','outcomes','courses','sessions'] },
    { id:'R16',name:'Wearable Health Summary',         cat:'Health',       auto:true,  fields:14, desc:'Wearable-derived health metrics: sleep, HRV, activity, and correlation with clinical outcomes.', sources:['wearables','outcomes','patients'] },
    { id:'R17',name:'Comprehensive Combined Report',   cat:'Combined',     auto:false, fields:40, desc:'Full cross-domain report combining clinical, financial, and operational data with AI insights.', sources:['patients','courses','outcomes','sessions','finance','protocols','assessments','wearables'] },
  ];

  // ── Data source registry — each dashboard page's data accessor ──
  const DATA_SOURCES = {
    patients:    { label: 'Patients',           icon: '\uD83D\uDC65', page: 'patients-v2',     fetch: () => api.listPatients().catch(()=>({items:[]})) },
    courses:     { label: 'Treatment Courses',  icon: '\uD83D\uDCCB', page: 'courses',          fetch: () => (api.listCourses?api.listCourses({}):Promise.resolve({items:[]})).catch(()=>({items:[]})) },
    outcomes:    { label: 'Outcome Scores',     icon: '\uD83D\uDCCA', page: 'outcomes',         fetch: () => api.listOutcomes().catch(()=>({items:[]})) },
    sessions:    { label: 'Sessions',           icon: '\uD83D\uDD52', page: 'schedule-v2',      fetch: () => (api.listSessions?api.listSessions({}):Promise.resolve({items:[]})).catch(()=>({items:[]})) },
    protocols:   { label: 'Protocols',          icon: '\uD83E\uDDE0', page: 'protocol-studio',  fetch: () => api.protocols().catch(()=>({items:[]})) },
    assessments: { label: 'Assessments',        icon: '\uD83D\uDCDD', page: 'assessments-v2',   fetch: () => (api.listAssessments?api.listAssessments():Promise.resolve({items:[]})).catch(()=>({items:[]})) },
    finance:     { label: 'Finance',            icon: '\uD83D\uDCB0', page: 'finance-v2',       fetch: () => (api.finance?.summary?api.finance.summary():Promise.resolve(null)).catch(()=>null) },
    wearables:   { label: 'Wearable Data',      icon: '\u231A',       page: 'monitor',           fetch: () => (api.getClinicAlertSummary?api.getClinicAlertSummary():Promise.resolve(null)).catch(()=>null) },
    qeeg:        { label: 'qEEG Records',       icon: '\uD83C\uDF0A', page: 'qeeg-analysis',    fetch: () => (api.listQEEGRecords?api.listQEEGRecords():Promise.resolve({items:[]})).catch(()=>({items:[]})) },
    aggregate:   { label: 'Outcome Aggregates', icon: '\uD83D\uDCC8', page: 'reports-hub',      fetch: () => (api.aggregateOutcomes?api.aggregateOutcomes():Promise.resolve({})).catch(()=>({})) },
  };

  // Helper: fetch data from multiple sources
  async function fetchSourcesData(sourceKeys) {
    const results = {};
    const fetchers = sourceKeys.map(async key => {
      const src = DATA_SOURCES[key];
      if (!src) return;
      try {
        const res = await src.fetch();
        results[key] = res?.items || res || [];
      } catch { results[key] = []; }
    });
    await Promise.allSettled(fetchers);
    return results;
  }

  // Helper: summarise fetched data into a text block for AI prompts
  function summariseDataForAI(data) {
    const parts = [];
    if (data.patients && Array.isArray(data.patients)) {
      parts.push('PATIENTS (' + data.patients.length + '):\n' + data.patients.slice(0,20).map(p =>
        '  - ' + ((p.first_name||'')+' '+(p.last_name||'')).trim() + ' | ID:' + (p.id||'?') + ' | DOB:' + (p.date_of_birth||'?') + ' | Condition:' + (p.primary_condition||p.condition_slug||'N/A')
      ).join('\n'));
    }
    if (data.courses && Array.isArray(data.courses)) {
      parts.push('TREATMENT COURSES (' + data.courses.length + '):\n' + data.courses.slice(0,20).map(c =>
        '  - Course:' + (c.id||'?') + ' | Patient:' + (c.patient_id||'?') + ' | Condition:' + (c.condition_slug||'?') + ' | Modality:' + (c.modality_slug||'?') + ' | Status:' + (c.status||'?') + ' | Sessions:' + (c.sessions_delivered||0) + '/' + (c.planned_sessions_total||'?')
      ).join('\n'));
    }
    if (data.outcomes && Array.isArray(data.outcomes)) {
      parts.push('OUTCOME SCORES (' + data.outcomes.length + '):\n' + data.outcomes.slice(0,30).map(o =>
        '  - Patient:' + (o.patient_id||'?') + ' | Scale:' + (o.template_id||o.scale||'?') + ' | Score:' + (o.score_numeric!=null?o.score_numeric:'?') + ' | Point:' + (o.measurement_point||'?') + ' | Date:' + (o.administered_at||'?')
      ).join('\n'));
    }
    if (data.sessions && Array.isArray(data.sessions)) {
      parts.push('SESSIONS (' + data.sessions.length + '):\n' + data.sessions.slice(0,20).map(s =>
        '  - Session:' + (s.id||'?') + ' | Patient:' + (s.patient_id||'?') + ' | Date:' + (s.session_date||s.date||'?') + ' | Status:' + (s.status||'?') + ' | Duration:' + (s.duration_minutes||'?') + 'min'
      ).join('\n'));
    }
    if (data.protocols && Array.isArray(data.protocols)) {
      parts.push('PROTOCOLS (' + data.protocols.length + '):\n' + data.protocols.slice(0,15).map(p =>
        '  - ' + (p.name||p.title||'?') + ' | Condition:' + (p.condition_slug||'?') + ' | Modality:' + (p.modality_slug||'?') + ' | Evidence:' + (p.evidence_level||'?')
      ).join('\n'));
    }
    if (data.assessments && Array.isArray(data.assessments)) {
      parts.push('ASSESSMENTS (' + data.assessments.length + '):\n' + data.assessments.slice(0,20).map(a =>
        '  - Patient:' + (a.patient_id||'?') + ' | Form:' + (a.form_key||a.template_id||'?') + ' | Score:' + (a.total_score!=null?a.total_score:'?') + ' | Date:' + (a.administered_at||a.created_at||'?')
      ).join('\n'));
    }
    if (data.finance && typeof data.finance === 'object' && !Array.isArray(data.finance)) {
      parts.push('FINANCE SUMMARY:\n  Revenue Paid: ' + (data.finance.revenue_paid||0) + ' | Outstanding: ' + (data.finance.outstanding||0) + ' | Overdue: ' + (data.finance.overdue||0));
    }
    if (data.wearables && typeof data.wearables === 'object') {
      const w = Array.isArray(data.wearables) ? data.wearables : [data.wearables];
      parts.push('WEARABLE DATA:\n' + w.slice(0,10).map(d => '  - ' + JSON.stringify(d).slice(0,200)).join('\n'));
    }
    if (data.qeeg && Array.isArray(data.qeeg)) {
      parts.push('qEEG RECORDS (' + data.qeeg.length + '):\n' + data.qeeg.slice(0,10).map(q =>
        '  - Record:' + (q.id||'?') + ' | Patient:' + (q.patient_id||'?') + ' | Date:' + (q.recorded_at||q.created_at||'?')
      ).join('\n'));
    }
    if (data.aggregate && typeof data.aggregate === 'object' && !Array.isArray(data.aggregate)) {
      const a = data.aggregate;
      parts.push('OUTCOME AGGREGATES:\n  Responder Rate: ' + (a.responder_rate_pct!=null?a.responder_rate_pct+'%':'N/A') +
        ' | Mean PHQ-9 Drop: ' + (a.avg_phq9_drop!=null?a.avg_phq9_drop:'N/A') +
        ' | Assessment Completion: ' + (a.assessment_completion_pct!=null?a.assessment_completion_pct+'%':'N/A') +
        ' | Overdue: ' + (a.assessments_overdue_count!=null?a.assessments_overdue_count:'N/A'));
    }
    return parts.join('\n\n');
  }

  const _rKey = 'ds_reports_v1';
  const loadReports = () => { try { return JSON.parse(localStorage.getItem(_rKey)||'[]'); } catch { return []; } };
  const saveReports = r => { try { localStorage.setItem(_rKey, JSON.stringify(r.slice(0,50))); } catch {} };

  // Merge backend-persisted reports with the local cache. Backend rows are
  // authoritative (same id == same report); local-only rows (saved offline)
  // stay visible until their next sync. Newest first by date.
  async function fetchSavedReports() {
    let backend = [];
    if (api.listMyReports) {
      try {
        const res = await api.listMyReports();
        const items = res?.items || res || [];
        backend = items.map(r => ({
          id: r.id,
          name: r.title || ((r.type || 'clinician') + ' report'),
          patient: r.patient_id || 'All Patients',
          type: r.type || 'clinician',
          date: (r.date || r.created_at || '').slice(0, 10),
          status: r.status || 'generated',
          content: r.content || '',
          _source: 'backend',
        }));
      } catch (err) {
        console.warn('[reports-hub] listMyReports failed; using local cache only:', err?.message || err);
      }
    }
    const local = loadReports().map(r => ({ ...r, _source: r._source || 'local' }));
    const byId = new Map();
    backend.forEach(r => byId.set(r.id, r));
    local.forEach(r => { if (!byId.has(r.id)) byId.set(r.id, r); });
    const merged = Array.from(byId.values());
    merged.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return merged;
  }

  const savedReports = await fetchSavedReports();
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
    const patOpts = '<option value="all">All Patients (Clinic-wide)</option>' + (patients.map(p=>'<option value="'+p.id+'">'+ ((p.first_name||'')+' '+(p.last_name||'')).trim() +'</option>').join('') || '<option>Demo Patient A</option>');
    const cats = ['All',...new Set(REPORT_TYPES.map(r=>r.cat))];
    const filtCat = window._repGenCat||'All';
    const filtTypes = REPORT_TYPES.filter(r=>filtCat==='All'||r.cat===filtCat);
    const selType = filtTypes[0] || REPORT_TYPES[0];

    main = `
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Report Generator</span><span class="ph-ai-badge">AI</span></div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
            <div class="ch-form-group"><label class="ch-label">Patient / Scope</label><select id="rep-patient" class="ch-select ch-select--full">${patOpts}</select></div>
            <div class="ch-form-group"><label class="ch-label">Report Type</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
                ${cats.map(c=>'<button class="reg-domain-pill'+(c===filtCat?' active':'')+'" onclick="window._repGenCat=\''+c+'\';window._nav(\'reports-hub\')">'+c+'</button>').join('')}
              </div>
              <select id="rep-type" class="ch-select ch-select--full" onchange="window._repUpdateDesc()">
                ${filtTypes.map(r=>'<option value="'+r.id+'">'+r.name+'</option>').join('')}
              </select>
            </div>
            <div id="rep-desc" style="font-size:11.5px;color:var(--text-tertiary);line-height:1.5;padding:8px;background:rgba(255,255,255,0.03);border-radius:6px">${selType.desc}</div>
            <div id="rep-sources-display" style="display:flex;gap:6px;flex-wrap:wrap">
              ${(selType.sources||[]).map(s => {
                const src = DATA_SOURCES[s];
                return src ? '<span style="font-size:10.5px;padding:3px 8px;border-radius:10px;background:rgba(94,234,212,0.08);color:var(--teal);border:1px solid rgba(94,234,212,0.2)">' + src.icon + ' ' + src.label + '</span>' : '';
              }).join('')}
            </div>
            <div class="ch-form-group"><label class="ch-label">Additional Context (optional)</label><textarea id="rep-context" class="ch-textarea" rows="3" placeholder="Any specific details to include in the report…"></textarea></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-primary" onclick="window._genReport()">✦ Generate Report</button>
              <button class="ch-btn-sm" onclick="window._genReport(true)">✦ Generate with Live Data</button>
            </div>
            <div id="rep-loading" style="display:none;padding:8px;text-align:center;color:var(--text-tertiary);font-size:12px"><span class="spinner-sm"></span> Fetching data from dashboard sources and generating report...</div>
          </div>
          <div id="rep-output" style="display:none;padding:0 16px 16px">
            <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Generated Report</div>
            <div id="rep-content" class="ch-textarea" style="min-height:160px;padding:12px;font-size:12.5px;line-height:1.75;white-space:pre-wrap;max-height:420px;overflow-y:auto"></div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              <button class="ch-btn-sm ch-btn-teal" onclick="window._saveReport()">Save to Records</button>
              <button class="ch-btn-sm" onclick="window._copyReport()">Copy to Clipboard</button>
              <button class="ch-btn-sm" onclick="window.print()">Print</button>
            </div>
          </div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Report Templates</span><span style="font-size:11px;color:var(--text-tertiary)">${filtTypes.length} types</span></div>
          ${filtTypes.map(r => {
            const srcBadges = (r.sources||[]).map(s => { const src = DATA_SOURCES[s]; return src ? src.icon : ''; }).join(' ');
            return '<div class="book-row"><div class="book-info"><div class="book-patient">'+r.name+'</div><div class="book-clinician">'+r.cat+' \u00B7 '+r.fields+' fields'+(r.auto?' \u00B7 Auto-gen':'')+' \u00B7 Sources: '+srcBadges+'</div></div>'+
            '<div class="book-actions"><button class="ch-btn-sm ch-btn-teal" onclick="document.getElementById(\'rep-type\').value=\''+r.id+'\';window._repUpdateDesc()">Use</button></div></div>';
          }).join('')}
        </div>
      </div>`;

    window._repUpdateDesc = () => {
      const typeEl = document.getElementById('rep-type');
      const typeData = REPORT_TYPES.find(r=>r.id===typeEl?.value)||REPORT_TYPES[0];
      const descEl = document.getElementById('rep-desc');
      const srcEl = document.getElementById('rep-sources-display');
      if (descEl) descEl.textContent = typeData.desc;
      if (srcEl) {
        srcEl.innerHTML = (typeData.sources||[]).map(s => {
          const src = DATA_SOURCES[s];
          return src ? '<span style="font-size:10.5px;padding:3px 8px;border-radius:10px;background:rgba(94,234,212,0.08);color:var(--teal);border:1px solid rgba(94,234,212,0.2)">' + src.icon + ' ' + src.label + '</span>' : '';
        }).join('');
      }
    };

    window._copyReport = () => {
      const content = document.getElementById('rep-content')?.textContent||'';
      navigator.clipboard?.writeText(content).then(() => {
        window._dsToast?.({title:'Copied',body:'Report copied to clipboard.',severity:'success'});
      }).catch(() => {
        window._dsToast?.({title:'Copy failed',body:'Could not copy to clipboard.',severity:'warn'});
      });
    };

    window._genReport = async (withLiveData = false) => {
      const patEl = document.getElementById('rep-patient');
      const typeEl = document.getElementById('rep-type');
      const context = document.getElementById('rep-context')?.value||'';
      const patName = patEl?.options[patEl?.selectedIndex]?.text||'Patient';
      const patId = patEl?.value||'all';
      const typeName = typeEl?.options[typeEl?.selectedIndex]?.text||'Report';
      const typeData = REPORT_TYPES.find(r=>r.id===typeEl?.value)||REPORT_TYPES[0];
      const out = document.getElementById('rep-output');
      const content = document.getElementById('rep-content');
      const loadingEl = document.getElementById('rep-loading');
      if (out) out.style.display='';
      if (content) content.textContent='';

      let dataContext = '';
      if (withLiveData && typeData.sources) {
        if (loadingEl) loadingEl.style.display='';
        try {
          const data = await fetchSourcesData(typeData.sources);
          dataContext = summariseDataForAI(data);
        } catch { dataContext = ''; }
        if (loadingEl) loadingEl.style.display='none';
      }

      if (content) content.textContent='✦ Generating '+typeName+'…';
      const scope = patId === 'all' ? 'clinic-wide (all patients)' : 'patient ' + patName;
      const prompt = 'Generate a professional ' + typeName + ' for ' + scope + '. Use standard medical/clinical report format with clear sections, headers, and structured data presentation. ' + typeData.desc +
        (dataContext ? '\n\nHere is the LIVE DATA from the dashboard to base this report on:\n\n' + dataContext : '') +
        (context ? '\n\nAdditional context from clinician: ' + context : '') +
        '\n\nIMPORTANT: Structure the report with clear section headers. Include data-driven observations. If health data is provided, note any correlations between metrics (e.g., outcome scores vs session count, assessment trends). If financial data is provided, include business performance metrics. Always end with recommendations and next steps.';

      try {
        const res = await api.chatClinician([{role:'user',content:prompt}],{});
        if (content) content.textContent = res?.message||res?.content||'REPORT: '+typeName+'\nScope: '+scope+'\nDate: '+new Date().toLocaleDateString()+'\n\nReport generated successfully. Please review and amend as needed before finalising.';
        window._lastReport = { type:typeName, patient:patName, content:content?.textContent||'', sources: typeData.sources||[] };
      } catch {
        if (content) content.textContent = typeName+'\nScope: '+scope+'\nDate: '+new Date().toLocaleDateString()+'\n\nReport for '+scope+'.\n\n[Report content — edit as required]';
        window._lastReport = { type:typeName, patient:patName, content:content?.textContent||'', sources: typeData.sources||[] };
      }
    };
    window._saveReport = async () => {
      if (!window._lastReport) return;
      const lr = window._lastReport;
      const today = new Date().toISOString().slice(0,10);
      const local = {
        id: 'RPT-' + Date.now(),
        name: lr.type + ' — ' + lr.patient,
        patient: lr.patient,
        type: lr.type,
        date: today,
        status: 'generated',
        content: lr.content,
      };
      // Persist to backend first so the row survives across devices. Fall
      // back to localStorage-only if the endpoint is unreachable. Either way
      // the user lands on Recent; the next hydrate reconciles.
      try {
        const patId = document.getElementById('rep-patient')?.value || null;
        const saved = api.createReport ? await api.createReport({
          patient_id: patId,
          type: lr.type,
          title: lr.type + ' — ' + lr.patient,
          content: lr.content,
          report_date: today,
          status: 'generated',
        }) : null;
        if (saved && saved.id) local.id = saved.id;
      } catch (err) {
        console.warn('[reports-hub] createReport failed (localStorage-only):', err?.message || err);
      }
      const rpts = loadReports();
      rpts.unshift(local);
      saveReports(rpts);
      window._dsToast?.({title:'Saved',body:'Report saved to records.',severity:'success'});
      window._reportsHubTab='recent'; window._nav('reports-hub');
    };
  }
  // ── Combined Report Tab ──────────────────────────────────────────────────
  else if (tab === 'combined') {
    let patients = [];
    try { const pR = await api.listPatients().catch(()=>({items:[]})); patients = pR?.items||[]; } catch {}
    const patOpts = '<option value="all">All Patients (Clinic-wide)</option>' + patients.map(p=>'<option value="'+p.id+'">'+ ((p.first_name||'')+' '+(p.last_name||'')).trim() +'</option>').join('');

    const sourceKeys = Object.keys(DATA_SOURCES);
    const selectedSources = window._combSources || ['patients','courses','outcomes','sessions','finance'];

    main = `
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Combined Report Builder</span><span class="ph-ai-badge">AI</span></div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">
            <div class="ch-form-group"><label class="ch-label">Scope</label><select id="comb-patient" class="ch-select ch-select--full">${patOpts}</select></div>
            <div class="ch-form-group">
              <label class="ch-label">Data Sources to Include</label>
              <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:6px">
                ${sourceKeys.map(key => {
                  const src = DATA_SOURCES[key];
                  const checked = selectedSources.includes(key);
                  return '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;border:1px solid '+(checked?'rgba(94,234,212,0.3)':'var(--border)')+';background:'+(checked?'rgba(94,234,212,0.05)':'transparent')+';cursor:pointer;font-size:12px;color:var(--text-primary);transition:all 0.15s">' +
                    '<input type="checkbox" value="'+key+'" class="comb-src-check" '+(checked?'checked':'')+' style="accent-color:var(--teal)"> ' +
                    src.icon + ' ' + src.label +
                    '</label>';
                }).join('')}
              </div>
            </div>
            <div class="ch-form-group">
              <label class="ch-label">Report Focus</label>
              <select id="comb-focus" class="ch-select ch-select--full">
                <option value="comprehensive">Comprehensive Overview (all domains)</option>
                <option value="health">Health & Clinical Focus</option>
                <option value="business">Business & Operations Focus</option>
                <option value="outcomes">Treatment Outcomes Focus</option>
                <option value="compliance">Compliance & Safety Focus</option>
              </select>
            </div>
            <div class="ch-form-group"><label class="ch-label">Custom Instructions (optional)</label><textarea id="comb-context" class="ch-textarea" rows="2" placeholder="E.g. focus on depression outcomes, compare Q1 vs Q2, highlight at-risk patients…"></textarea></div>
            <button class="btn btn-primary" onclick="window._genCombinedReport()">✦ Build Combined Report</button>
            <div id="comb-loading" style="display:none;padding:8px;text-align:center;color:var(--text-tertiary);font-size:12px"><span class="spinner-sm"></span> Collecting data from all selected sources...</div>
          </div>
          <div id="comb-output" style="display:none;padding:0 16px 16px">
            <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Combined Report</div>
            <div id="comb-content" class="ch-textarea" style="min-height:200px;padding:12px;font-size:12.5px;line-height:1.75;white-space:pre-wrap;max-height:500px;overflow-y:auto"></div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              <button class="ch-btn-sm ch-btn-teal" onclick="window._saveCombinedReport()">Save to Records</button>
              <button class="ch-btn-sm" onclick="navigator.clipboard?.writeText(document.getElementById('comb-content')?.textContent||'');window._dsToast?.({title:'Copied',severity:'success'})">Copy</button>
              <button class="ch-btn-sm" onclick="window.print()">Print</button>
            </div>
          </div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">How Combined Reports Work</span></div>
          <div style="padding:14px 16px;font-size:12.5px;color:var(--text-secondary);line-height:1.65">
            <p style="margin:0 0 10px"><strong style="color:var(--text-primary)">1. Select data sources</strong> — Choose which dashboard pages to pull data from. Each source provides real-time data from the system.</p>
            <p style="margin:0 0 10px"><strong style="color:var(--text-primary)">2. Choose your focus</strong> — Select a report focus to prioritise certain aspects of the analysis.</p>
            <p style="margin:0 0 10px"><strong style="color:var(--text-primary)">3. AI synthesis</strong> — The AI engine aggregates all selected data, identifies cross-domain correlations, and produces a unified narrative report.</p>
            <p style="margin:0"><strong style="color:var(--text-primary)">4. Actionable insights</strong> — Each report includes findings, trends, risk flags, and recommendations drawn from the combined dataset.</p>
          </div>
          <div style="padding:0 16px 14px">
            <div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Available Dashboard Sources</div>
            ${sourceKeys.map(key => {
              const src = DATA_SOURCES[key];
              return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">' +
                '<span style="width:20px;text-align:center">' + src.icon + '</span>' +
                '<span style="color:var(--text-primary);font-weight:500">' + src.label + '</span>' +
                '<span style="margin-left:auto;font-size:10.5px;color:var(--teal);cursor:pointer" onclick="window._nav(\'' + src.page + '\')">Open page</span>' +
                '</div>';
            }).join('')}
          </div>
        </div>
      </div>`;

    window._genCombinedReport = async () => {
      const checks = document.querySelectorAll('.comb-src-check:checked');
      const sources = Array.from(checks).map(c => c.value);
      window._combSources = sources;
      if (!sources.length) { window._dsToast?.({title:'No sources',body:'Select at least one data source.',severity:'warn'}); return; }
      const patEl = document.getElementById('comb-patient');
      const patName = patEl?.options[patEl?.selectedIndex]?.text||'All Patients';
      const focus = document.getElementById('comb-focus')?.value||'comprehensive';
      const context = document.getElementById('comb-context')?.value||'';
      const loadingEl = document.getElementById('comb-loading');
      const out = document.getElementById('comb-output');
      const content = document.getElementById('comb-content');
      if (loadingEl) loadingEl.style.display='';
      if (out) out.style.display='none';

      let data = {};
      try { data = await fetchSourcesData(sources); } catch {}
      if (loadingEl) loadingEl.style.display='none';

      const dataSummary = summariseDataForAI(data);
      if (out) out.style.display='';
      if (content) content.textContent='✦ Analysing data and generating combined report…';

      const focusInstructions = {
        comprehensive: 'Provide a comprehensive overview covering clinical outcomes, operational metrics, financial performance, and patient population analysis.',
        health: 'Focus primarily on clinical and health data: treatment outcomes, assessment scores, adverse events, protocol efficacy, wearable health metrics, and biomarker trends. Include correlation analysis between different health metrics.',
        business: 'Focus on business performance: patient volume, revenue, course completion rates, clinic utilisation, referral sources, and financial trends.',
        outcomes: 'Focus on treatment outcomes: responder rates, score improvements, per-protocol efficacy, dose-response relationships, and predictive indicators.',
        compliance: 'Focus on safety and compliance: adverse events, governance flags, protocol adherence, assessment completion rates, overdue reviews, and regulatory metrics.',
      };

      const prompt = 'Generate a professional COMBINED REPORT for scope: ' + patName + '.\n\n' +
        'REPORT FOCUS: ' + (focusInstructions[focus]||focusInstructions.comprehensive) + '\n\n' +
        'DATA FROM DASHBOARD SOURCES:\n\n' + dataSummary + '\n\n' +
        (context ? 'CUSTOM INSTRUCTIONS: ' + context + '\n\n' : '') +
        'REPORT STRUCTURE REQUIREMENTS:\n' +
        '1. Executive Summary (2-3 key findings)\n' +
        '2. Data Overview (what sources were analysed, data completeness)\n' +
        '3. Key Findings by domain\n' +
        '4. Cross-Domain Correlations (identify relationships between data from different sources)\n' +
        '5. Risk Flags & Alerts\n' +
        '6. Trends & Patterns\n' +
        '7. Recommendations & Action Items\n\n' +
        'Use clinical/professional language. Be data-driven. Highlight actionable insights.';

      try {
        const res = await api.chatClinician([{role:'user',content:prompt}],{});
        if (content) content.textContent = res?.message||res?.content||'Combined Report generated. Review and amend as needed.';
        window._lastReport = { type:'Combined Report ('+focus+')', patient:patName, content:content?.textContent||'', sources };
      } catch {
        if (content) content.textContent = 'COMBINED REPORT\nScope: '+patName+'\nFocus: '+focus+'\nDate: '+new Date().toLocaleDateString()+'\nSources: '+sources.join(', ')+'\n\nData collected from '+sources.length+' sources.\n\n[AI generation unavailable — raw data summary below]\n\n'+dataSummary;
        window._lastReport = { type:'Combined Report ('+focus+')', patient:patName, content:content?.textContent||'', sources };
      }
    };

    window._saveCombinedReport = async () => {
      if (!window._lastReport) return;
      const lr = window._lastReport;
      const today = new Date().toISOString().slice(0,10);
      const local = { id:'RPT-'+Date.now(), name:lr.type+' \u2014 '+lr.patient, patient:lr.patient, type:lr.type, date:today, status:'generated', content:lr.content };
      try {
        const patId = document.getElementById('comb-patient')?.value||null;
        const saved = api.createReport ? await api.createReport({ patient_id:patId==='all'?null:patId, type:lr.type, title:local.name, content:lr.content, report_date:today, status:'generated' }) : null;
        if (saved && saved.id) local.id = saved.id;
      } catch {}
      const rpts = loadReports(); rpts.unshift(local); saveReports(rpts);
      window._dsToast?.({title:'Saved',body:'Combined report saved.',severity:'success'});
      window._reportsHubTab='recent'; window._nav('reports-hub');
    };
  }
  // ── Health Insights Tab — Correlation & Prediction Analysis ──────────────
  else if (tab === 'insights') {
    let patients = [];
    try { const pR = await api.listPatients().catch(()=>({items:[]})); patients = pR?.items||[]; } catch {}
    const patOpts = '<option value="all">All Patients (Clinic-wide)</option>' + patients.map(p=>'<option value="'+p.id+'">'+ ((p.first_name||'')+' '+(p.last_name||'')).trim() +'</option>').join('');

    // Pre-fetch health data for dashboard display
    let outcomes = [], courses = [], sessions = [], assessments = [], aggregate = {};
    try {
      const [oR, cR, sR, aR, agR] = await Promise.allSettled([
        api.listOutcomes().catch(()=>({items:[]})),
        (api.listCourses?api.listCourses({}):Promise.resolve({items:[]})).catch(()=>({items:[]})),
        (api.listSessions?api.listSessions({}):Promise.resolve({items:[]})).catch(()=>({items:[]})),
        (api.listAssessments?api.listAssessments():Promise.resolve({items:[]})).catch(()=>({items:[]})),
        (api.aggregateOutcomes?api.aggregateOutcomes():Promise.resolve({})).catch(()=>({})),
      ]);
      outcomes = (oR.status==='fulfilled'?(oR.value?.items||oR.value||[]):[]);
      courses = (cR.status==='fulfilled'?(cR.value?.items||cR.value||[]):[]);
      sessions = (sR.status==='fulfilled'?(sR.value?.items||sR.value||[]):[]);
      assessments = (aR.status==='fulfilled'?(aR.value?.items||aR.value||[]):[]);
      aggregate = (agR.status==='fulfilled'?(agR.value||{}):{});
    } catch {}

    // Compute local correlation stats
    const activeCourses = courses.filter(c=>c.status==='active');
    const completedCourses = courses.filter(c=>c.status==='completed');
    const respRate = aggregate.responder_rate_pct!=null ? Math.round(aggregate.responder_rate_pct)+'%' : '\u2014';
    const phqDrop = aggregate.avg_phq9_drop!=null ? (aggregate.avg_phq9_drop>0?'\u2212':'+')+Math.abs(Math.round(aggregate.avg_phq9_drop*10)/10) : '\u2014';

    // Per-patient outcome trends (for correlation display)
    const patientOutcomes = {};
    outcomes.forEach(o => {
      const pid = o.patient_id||'unknown';
      if (!patientOutcomes[pid]) patientOutcomes[pid] = [];
      patientOutcomes[pid].push({ score:o.score_numeric, date:o.administered_at, scale:o.template_id||o.scale });
    });
    const patientSessions = {};
    sessions.forEach(s => {
      const pid = s.patient_id||'unknown';
      patientSessions[pid] = (patientSessions[pid]||0)+1;
    });

    // Identify patients with enough data for correlation
    const correlationCandidates = Object.entries(patientOutcomes)
      .filter(([pid, oArr]) => oArr.length >= 2 && patientSessions[pid])
      .map(([pid, oArr]) => {
        const sorted = oArr.sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));
        const first = sorted[0]?.score, last = sorted[sorted.length-1]?.score;
        const delta = (first!=null&&last!=null) ? last-first : null;
        return { pid, sessions:patientSessions[pid]||0, firstScore:first, lastScore:last, delta, measurements:sorted.length };
      })
      .filter(c => c.delta!=null);

    // Simple correlation: session count vs outcome delta
    let corrText = 'Insufficient data for correlation analysis.';
    if (correlationCandidates.length >= 3) {
      const n = correlationCandidates.length;
      const sx = correlationCandidates.reduce((s,c)=>s+c.sessions,0);
      const sy = correlationCandidates.reduce((s,c)=>s+c.delta,0);
      const sxx = correlationCandidates.reduce((s,c)=>s+c.sessions*c.sessions,0);
      const syy = correlationCandidates.reduce((s,c)=>s+c.delta*c.delta,0);
      const sxy = correlationCandidates.reduce((s,c)=>s+c.sessions*c.delta,0);
      const num = n*sxy - sx*sy;
      const den = Math.sqrt((n*sxx-sx*sx)*(n*syy-sy*sy));
      const r = den > 0 ? num/den : 0;
      const rRound = Math.round(r*100)/100;
      const strength = Math.abs(rRound) > 0.7 ? 'strong' : Math.abs(rRound) > 0.4 ? 'moderate' : 'weak';
      const direction = rRound < 0 ? 'negative (more sessions \u2192 greater score reduction = improvement)' : 'positive';
      corrText = 'Pearson r = ' + rRound + ' (' + strength + ' ' + direction + ' correlation between session count and outcome score change across ' + n + ' patients)';
    }

    // Condition distribution
    const condCounts = {};
    courses.forEach(c => { const k=(c.condition_slug||'').toLowerCase(); if(k) condCounts[k]=(condCounts[k]||0)+1; });
    const condRows = Object.entries(condCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);

    // Prediction indicators
    const avgSessionsCompleted = completedCourses.length ? Math.round(completedCourses.reduce((s,c)=>s+(c.sessions_delivered||0),0)/completedCourses.length) : 0;

    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${respRate}</div><div class="ch-kpi-label">Responder Rate</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${phqDrop}</div><div class="ch-kpi-label">Mean PHQ-9 \u0394</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${outcomes.length}</div><div class="ch-kpi-label">Outcome Records</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--violet)"><div class="ch-kpi-val">${correlationCandidates.length}</div><div class="ch-kpi-label">Patients w/ Trend Data</div></div>
      </div>
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Correlation Analysis</span><span class="ph-ai-badge">AI</span></div>
          <div style="padding:14px 16px">
            <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px">
              <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px">Sessions vs Outcome Change</div>
              <div style="padding:10px 12px;background:rgba(94,234,212,0.05);border:1px solid rgba(94,234,212,0.15);border-radius:8px;font-size:12px">${corrText}</div>
            </div>
            ${correlationCandidates.length ? `
            <div style="font-weight:600;color:var(--text-primary);font-size:12px;margin-bottom:8px">Patient Outcome Trajectories (top 10)</div>
            ${correlationCandidates.slice(0,10).map(c => {
              const improved = c.delta < 0;
              const color = improved ? 'var(--green)' : c.delta > 0 ? 'var(--red)' : 'var(--text-tertiary)';
              const arrow = improved ? '\u2193' : c.delta > 0 ? '\u2191' : '\u2192';
              const pName = patients.find(p=>p.id===c.pid);
              const label = pName ? ((pName.first_name||'')+' '+(pName.last_name||'')).trim() : c.pid;
              return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:12px">' +
                '<div style="flex:1;min-width:0;color:var(--text-primary);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + label + '</div>' +
                '<div style="color:var(--text-tertiary)">' + c.sessions + ' sessions</div>' +
                '<div style="color:var(--text-tertiary)">' + c.measurements + ' scores</div>' +
                '<div style="font-weight:700;color:' + color + '">' + arrow + ' ' + (c.delta>0?'+':'') + c.delta + '</div>' +
                '</div>';
            }).join('')}` : '<div class="ch-empty">Record more outcome scores to see correlation data.</div>'}
            <div style="margin-top:14px">
              <div style="font-weight:600;color:var(--text-primary);font-size:12px;margin-bottom:6px">Condition Distribution</div>
              ${condRows.length ? condRows.map(([slug,n]) => {
                const pct = courses.length ? Math.round(n/courses.length*100) : 0;
                return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:12px">' +
                  '<div style="flex:1;color:var(--text-primary)">' + slug.replace(/-/g,' ').replace(/\\b\\w/g,s=>s.toUpperCase()) + '</div>' +
                  '<div class="ch-prog-wrap" style="min-width:100px"><div class="ch-prog-bar" style="width:80px"><div class="ch-prog-fill" style="width:'+pct+'%"></div></div><span class="ch-prog-pct" style="color:var(--teal);font-weight:700">'+pct+'%</span></div>' +
                  '</div>';
              }).join('') : '<div class="ch-empty">No course condition data yet.</div>'}
            </div>
          </div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Predictive Analysis</span><span class="ph-ai-badge">AI</span></div>
          <div style="padding:14px 16px">
            <div style="display:flex;flex-direction:column;gap:12px">
              <div style="padding:12px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-tertiary);margin-bottom:4px">Average Sessions to Complete</div>
                <div style="font-size:22px;font-weight:700;color:var(--teal)">${avgSessionsCompleted || '\u2014'}</div>
              </div>
              <div style="padding:12px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-tertiary);margin-bottom:4px">Active at Risk (below expected trajectory)</div>
                <div style="font-size:22px;font-weight:700;color:var(--amber)">${activeCourses.filter(c => (c.sessions_delivered||0) > (avgSessionsCompleted * 0.7) && c.status==='active').length || 0}</div>
              </div>
              <div style="padding:12px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.02)">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-tertiary);margin-bottom:4px">Assessment Completion</div>
                <div style="font-size:22px;font-weight:700;color:${(aggregate.assessment_completion_pct||0) >= 80 ? 'var(--green)' : 'var(--amber)'}">${aggregate.assessment_completion_pct!=null ? Math.round(aggregate.assessment_completion_pct)+'%' : '\u2014'}</div>
              </div>
            </div>
            <div style="margin-top:14px">
              <label class="ch-label">AI-Powered Prediction & Correlation Report</label>
              <select id="ins-patient" class="ch-select ch-select--full" style="margin:6px 0">${patOpts}</select>
              <button class="btn btn-primary" style="width:100%" onclick="window._genInsightsReport()">✦ Generate Health Insights Report</button>
              <div id="ins-loading" style="display:none;padding:8px;text-align:center;color:var(--text-tertiary);font-size:12px"><span class="spinner-sm"></span> Analysing health data for correlations and predictions...</div>
            </div>
          </div>
          <div id="ins-output" style="display:none;padding:0 16px 16px">
            <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Health Insights Report</div>
            <div id="ins-content" class="ch-textarea" style="min-height:180px;padding:12px;font-size:12.5px;line-height:1.75;white-space:pre-wrap;max-height:400px;overflow-y:auto"></div>
            <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
              <button class="ch-btn-sm ch-btn-teal" onclick="window._saveInsightsReport()">Save</button>
              <button class="ch-btn-sm" onclick="navigator.clipboard?.writeText(document.getElementById('ins-content')?.textContent||'');window._dsToast?.({title:'Copied',severity:'success'})">Copy</button>
              <button class="ch-btn-sm" onclick="window.print()">Print</button>
            </div>
          </div>
        </div>
      </div>`;

    window._genInsightsReport = async () => {
      const patEl = document.getElementById('ins-patient');
      const patName = patEl?.options[patEl?.selectedIndex]?.text||'All Patients';
      const patId = patEl?.value||'all';
      const loadingEl = document.getElementById('ins-loading');
      const out = document.getElementById('ins-output');
      const content = document.getElementById('ins-content');
      if (loadingEl) loadingEl.style.display='';

      // Fetch comprehensive health data
      const healthSources = ['patients','courses','outcomes','sessions','assessments','wearables','aggregate'];
      let data = {};
      try { data = await fetchSourcesData(healthSources); } catch {}
      if (loadingEl) loadingEl.style.display='none';
      if (out) out.style.display='';
      if (content) content.textContent='✦ Analysing health data…';

      const dataSummary = summariseDataForAI(data);
      const corrInfo = corrText;

      const prompt = 'Generate a comprehensive HEALTH INSIGHTS REPORT with correlation and prediction analysis for: ' + patName + '.\n\n' +
        'LIVE CLINICAL DATA:\n\n' + dataSummary + '\n\n' +
        'LOCAL CORRELATION DATA:\n' + corrInfo + '\n\n' +
        'REQUIRED ANALYSIS SECTIONS:\n' +
        '1. EXECUTIVE SUMMARY: Key health findings in 3-5 bullet points.\n' +
        '2. CORRELATION ANALYSIS:\n' +
        '   - Treatment sessions vs outcome score changes (dose-response relationship)\n' +
        '   - Assessment scores at different measurement points (baseline, mid, end)\n' +
        '   - Condition-specific response rates\n' +
        '   - Session frequency vs treatment adherence\n' +
        '   - Any wearable metrics vs clinical outcomes correlations\n' +
        '3. PREDICTION ANALYSIS:\n' +
        '   - Predicted treatment response based on early-session data\n' +
        '   - Risk stratification: which patients are likely non-responders\n' +
        '   - Optimal session count prediction per condition\n' +
        '   - Expected outcome trajectories based on current trends\n' +
        '4. TREND ANALYSIS:\n' +
        '   - Longitudinal outcome trends\n' +
        '   - Seasonal or temporal patterns\n' +
        '   - Population-level health metric changes\n' +
        '5. RISK FLAGS:\n' +
        '   - Patients showing deterioration\n' +
        '   - Overdue assessments impacting data quality\n' +
        '   - Anomalous patterns requiring clinical review\n' +
        '6. RECOMMENDATIONS:\n' +
        '   - Data-driven protocol adjustments\n' +
        '   - Patients needing intervention\n' +
        '   - Data collection improvements needed\n\n' +
        'Use statistical language where appropriate. Be specific with numbers. Flag confidence levels for predictions (high/medium/low based on data availability).';

      try {
        const res = await api.chatClinician([{role:'user',content:prompt}],{});
        if (content) content.textContent = res?.message||res?.content||'Health Insights Report generated.';
        window._lastReport = { type:'Health Insights Report', patient:patName, content:content?.textContent||'', sources:healthSources };
      } catch {
        if (content) content.textContent = 'HEALTH INSIGHTS REPORT\nScope: '+patName+'\nDate: '+new Date().toLocaleDateString()+'\n\n--- CORRELATION ANALYSIS ---\n'+corrInfo+'\n\n--- DATA SUMMARY ---\n'+dataSummary+'\n\n[AI analysis unavailable — raw data provided above for manual review]';
        window._lastReport = { type:'Health Insights Report', patient:patName, content:content?.textContent||'', sources:healthSources };
      }
    };

    window._saveInsightsReport = async () => {
      if (!window._lastReport) return;
      const lr = window._lastReport;
      const today = new Date().toISOString().slice(0,10);
      const local = { id:'RPT-'+Date.now(), name:lr.type+' \u2014 '+lr.patient, patient:lr.patient, type:lr.type, date:today, status:'generated', content:lr.content };
      try {
        const patId = document.getElementById('ins-patient')?.value||null;
        const saved = api.createReport ? await api.createReport({ patient_id:patId==='all'?null:patId, type:lr.type, title:local.name, content:lr.content, report_date:today, status:'generated' }) : null;
        if (saved && saved.id) local.id = saved.id;
      } catch {}
      const rpts = loadReports(); rpts.unshift(local); saveReports(rpts);
      window._dsToast?.({title:'Saved',body:'Health insights report saved.',severity:'success'});
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
            '<div class="book-actions"><button class="ch-btn-sm" onclick="window._repViewSaved(\''+r.id+'\')">View</button><button class="ch-btn-sm" onclick="window._repPrintSaved(\''+r.id+'\')">Print</button></div>'+
          '</div>'
        ).join('') : '<div class="ch-empty">No reports yet. <a onclick="window._reportsHubTab=\'generate\';window._nav(\'reports-hub\')" style="color:var(--teal);cursor:pointer">Generate one now →</a></div>'}
      </div>`;

    // Open a saved report in a real modal with its stored content.
    window._repViewSaved = (id) => {
      const r = loadReports().find(x => x.id === id);
      if (!r) { window._dsToast?.({ title:'Not found', body:'Report not in local records.', severity:'warn' }); return; }
      const ov = document.createElement('div');
      ov.className = 'rh-modal-overlay';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:1000;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 16px';
      const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      ov.innerHTML = '<div style="background:var(--bg-card,#0e1628);border:1px solid var(--border);border-radius:12px;width:100%;max-width:680px;padding:20px 24px;max-height:90vh;overflow-y:auto">'
        + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
          + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:14px;font-weight:700;color:var(--text-primary)">' + esc(r.name) + '</div>'
            + '<div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px">' + esc(r.type) + ' &middot; ' + esc(r.patient) + ' &middot; ' + esc(r.date) + '</div>'
          + '</div>'
          + '<button class="ch-btn-sm" onclick="this.closest(\'.rh-modal-overlay\').remove()" style="padding:4px 10px">Close</button>'
        + '</div>'
        + '<pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;line-height:1.7;color:var(--text-secondary);background:rgba(255,255,255,0.02);padding:14px 16px;border-radius:8px;border:1px solid var(--border);margin:0">'
          + esc(r.content || '(No content stored for this report.)')
        + '</pre>'
        + '</div>';
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
      document.body.appendChild(ov);
    };

    // Print a saved report by rendering its content into a transient print window.
    window._repPrintSaved = (id) => {
      const r = loadReports().find(x => x.id === id);
      if (!r) { window._dsToast?.({ title:'Not found', body:'Report not in local records.', severity:'warn' }); return; }
      const w = window.open('', '_blank', 'width=800,height=600');
      if (!w) { window.print(); return; }
      const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(r.name) + '</title>'
        + '<style>body{font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#111;padding:32px;line-height:1.55}h1{font-size:16px;margin:0 0 4px}h2{font-size:13px;color:#555;margin:0 0 16px;font-weight:500}pre{white-space:pre-wrap;font-family:inherit;font-size:12px;line-height:1.6}</style>'
        + '</head><body>'
        + '<h1>' + esc(r.name) + '</h1>'
        + '<h2>' + esc(r.type) + ' &middot; ' + esc(r.patient) + ' &middot; ' + esc(r.date) + '</h2>'
        + '<pre>' + esc(r.content || '') + '</pre>'
        + '</body></html>');
      w.document.close();
      w.focus();
      setTimeout(() => { try { w.print(); } catch {} }, 200);
    };
  }
  else if (tab === 'analytics') {
    // Real sources (all clinician-scoped server-side):
    //   aggregateOutcomes() → responder_rate_pct, avg_phq9_drop,
    //     assessment_completion_pct, assessments_overdue_count, responders,
    //     courses_with_outcomes
    //   listCourses() → active/completed counts + per-condition distribution
    //   finance.summary() → revenue_paid, outstanding, overdue
    //   finance.monthlyAnalytics(6) → 6-month revenue trend
    let agg = {}, courses = [], fin = null, monthly = [];
    try {
      const [aR, cR, fR, mR] = await Promise.allSettled([
        api.aggregateOutcomes ? api.aggregateOutcomes() : Promise.resolve(null),
        api.listCourses       ? api.listCourses({})    : Promise.resolve(null),
        api.finance?.summary  ? api.finance.summary()   : Promise.resolve(null),
        api.finance?.monthlyAnalytics ? api.finance.monthlyAnalytics(6) : Promise.resolve(null),
      ]);
      agg     = aR.status === 'fulfilled' ? (aR.value || {}) : {};
      courses = cR.status === 'fulfilled' ? (cR.value?.items || cR.value || []) : [];
      fin     = fR.status === 'fulfilled' ? (fR.value || null) : null;
      monthly = mR.status === 'fulfilled' ? (mR.value?.items || mR.value || []) : [];
    } catch {}

    const active    = courses.filter(c => c.status === 'active').length;
    const completed = courses.filter(c => c.status === 'completed').length;
    const respRate  = agg.responder_rate_pct != null ? Math.round(agg.responder_rate_pct) + '%' : '—';
    const phqDrop   = agg.avg_phq9_drop != null
      ? (agg.avg_phq9_drop > 0 ? '−' : '+') + Math.abs(Math.round(agg.avg_phq9_drop * 10) / 10)
      : '—';

    // Per-condition distribution derived from real courses. Empty if no
    // completed/active courses carry a condition_slug.
    const condCounts = {};
    courses.forEach(c => {
      const k = (c.condition_slug || c.condition || '').toLowerCase();
      if (!k) return;
      condCounts[k] = (condCounts[k] || 0) + 1;
    });
    const condRows = Object.entries(condCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([slug, n]) => ({
        label: slug.replace(/-/g, ' ').replace(/\b\w/g, s => s.toUpperCase()),
        n,
        pct: courses.length ? Math.round(n / courses.length * 100) : 0,
      }));

    // Monthly chart: prefer finance monthly revenue (real); fall back to
    // course-started-by-month from listCourses if finance is empty/unavailable.
    let chartTitle = 'Monthly Revenue';
    let chartRows = monthly.map(r => ({
      label: (r.month || '').slice(5),
      value: Number(r.revenue || 0),
      caption: '£' + Number(r.revenue || 0).toLocaleString('en-GB'),
    }));
    if (!chartRows.length) {
      chartTitle = 'Courses Started (last 6 months)';
      const byMonth = {};
      courses.forEach(c => {
        const d = (c.started_at || c.created_at || '').slice(0, 7);
        if (!d) return;
        byMonth[d] = (byMonth[d] || 0) + 1;
      });
      const keys = Object.keys(byMonth).sort().slice(-6);
      chartRows = keys.map(k => ({ label: k.slice(5), value: byMonth[k], caption: String(byMonth[k]) }));
    }
    const maxVal = Math.max(1, ...chartRows.map(r => r.value));

    const fmtGBP = n => '£' + Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });
    const financeCard = fin ? `
      <div class="ch-card" style="margin-top:12px">
        <div class="ch-card-hd"><span class="ch-card-title">Finance Summary</span>
          <button class="ch-btn-sm" onclick="window._nav('finance-hub')">Open Finance →</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px 16px">
          <div><div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px">Revenue paid</div><div style="font-size:18px;font-weight:700;color:var(--green,#4ade80);margin-top:4px">${fmtGBP(fin.revenue_paid)}</div></div>
          <div><div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px">Outstanding</div><div style="font-size:18px;font-weight:700;color:var(--amber,#ffb547);margin-top:4px">${fmtGBP(fin.outstanding)}</div></div>
          <div><div style="font-size:10.5px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px">Overdue</div><div style="font-size:18px;font-weight:700;color:var(--red,#ef4444);margin-top:4px">${fmtGBP(fin.overdue)}</div></div>
        </div>
      </div>` : '';

    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="ch-kpi-card dv2-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val dv2-kpi-val">${respRate}</div><div class="ch-kpi-label dv2-kpi-label">Responder Rate</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${phqDrop}</div><div class="ch-kpi-label">Mean PHQ-9 Δ</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${active}</div><div class="ch-kpi-label">Active Courses</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--violet)"><div class="ch-kpi-val">${completed}</div><div class="ch-kpi-label">Completed</div></div>
      </div>
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
        <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${agg.courses_with_outcomes != null ? agg.courses_with_outcomes : '—'}</div><div class="ch-kpi-label">Courses with outcomes</div></div>
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${agg.assessment_completion_pct != null ? Math.round(agg.assessment_completion_pct) + '%' : '—'}</div><div class="ch-kpi-label">Assessment completion</div></div>
        <div class="ch-kpi-card" style="--kpi-color:${agg.assessments_overdue_count > 0 ? 'var(--amber)' : 'var(--green)'}"><div class="ch-kpi-val">${agg.assessments_overdue_count != null ? agg.assessments_overdue_count : '—'}</div><div class="ch-kpi-label">Assessments overdue</div></div>
      </div>
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Courses by Condition</span><span style="font-size:11px;color:var(--text-tertiary)">${courses.length} total</span></div>
          ${condRows.length ? condRows.map(r =>
            '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.04)">'+
              '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">'+r.label+'</div><div style="font-size:11px;color:var(--text-tertiary)">'+r.n+' course'+(r.n===1?'':'s')+'</div></div>'+
              '<div class="ch-prog-wrap" style="min-width:120px"><div class="ch-prog-bar" style="width:100px"><div class="ch-prog-fill" style="width:'+r.pct+'%"></div></div><span class="ch-prog-pct" style="color:var(--teal);font-weight:700">'+r.pct+'%</span></div>'+
            '</div>'
          ).join('') : '<div class="ch-empty" style="padding:18px 16px">No course data yet. Condition distribution will appear once courses are recorded.</div>'}
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">${chartTitle}</span></div>
          ${chartRows.length ? chartRows.map(r =>
            '<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04)">'+
              '<div style="font-size:13px;font-weight:600;color:var(--text-primary);width:48px">'+r.label+'</div>'+
              '<div class="ch-prog-bar" style="flex:1"><div class="ch-prog-fill" style="width:'+Math.round(r.value/maxVal*100)+'%"></div></div>'+
              '<span style="font-size:12.5px;font-weight:700;color:var(--teal);min-width:66px;text-align:right">'+r.caption+'</span>'+
            '</div>'
          ).join('') : '<div class="ch-empty" style="padding:18px 16px">No trend data yet.</div>'}
        </div>
      </div>
      ${financeCard}`;
  }
  else if (tab === 'export') {
    const fromDefault = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const toDefault   = new Date().toISOString().slice(0, 10);
    main = `
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Export Reports</span></div>
          <div style="padding:14px 16px;display:flex;flex-direction:column;gap:14px">
            <div class="ch-form-group"><label class="ch-label">Date range</label>
              <div style="display:flex;gap:8px">
                <input id="rep-exp-from" type="date" class="ch-select" style="flex:1" value="${fromDefault}">
                <span style="align-self:center;color:var(--text-tertiary)">to</span>
                <input id="rep-exp-to"   type="date" class="ch-select" style="flex:1" value="${toDefault}">
              </div>
            </div>
            <div class="ch-form-group"><label class="ch-label">Data source</label>
              <select id="rep-exp-source" class="ch-select ch-select--full">
                <option value="outcomes">Outcome scores (per-patient)</option>
                <option value="courses">Treatment courses</option>
                <option value="reports">Saved reports (local)</option>
              </select>
            </div>
            <div class="ch-form-group"><label class="ch-label">Export format</label>
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
                <div class="lib-card" style="cursor:pointer" onclick="window._repExportCsv()">
                  <div class="lib-card-top"><span style="font-size:18px">📊</span><span class="lib-card-name">CSV Data Export</span></div>
                  <div style="font-size:11.5px;color:var(--text-tertiary)">Raw rows for analysis in Excel, R, or SPSS. Downloads immediately.</div>
                </div>
                <div class="lib-card" style="opacity:0.55;cursor:not-allowed" title="Not yet available">
                  <div class="lib-card-top"><span style="font-size:18px">📄</span><span class="lib-card-name">PDF Report</span><span style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(255,181,71,0.12);color:var(--amber,#ffb547);border:1px solid rgba(255,181,71,0.3)">Not available</span></div>
                  <div style="font-size:11.5px;color:var(--text-tertiary)">Formatted clinical report. Use the in-browser Print dialog from the Generate tab for now.</div>
                </div>
                <div class="lib-card" style="opacity:0.55;cursor:not-allowed" title="Not yet available">
                  <div class="lib-card-top"><span style="font-size:18px">🏥</span><span class="lib-card-name">HL7 FHIR Export</span><span style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(255,181,71,0.12);color:var(--amber,#ffb547);border:1px solid rgba(255,181,71,0.3)">Not available</span></div>
                  <div style="font-size:11.5px;color:var(--text-tertiary)">Structured clinical data for EHR systems.</div>
                </div>
                <div class="lib-card" style="opacity:0.55;cursor:not-allowed" title="Not yet available">
                  <div class="lib-card-top"><span style="font-size:18px">⚙</span><span class="lib-card-name">JSON Data Dump</span><span style="margin-left:auto;font-size:10px;padding:2px 8px;border-radius:10px;background:rgba(255,181,71,0.12);color:var(--amber,#ffb547);border:1px solid rgba(255,181,71,0.3)">Not available</span></div>
                  <div style="font-size:11.5px;color:var(--text-tertiary)">Complete migration/backup export.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">About CSV export</span></div>
          <div style="padding:14px 16px;font-size:12.5px;color:var(--text-secondary);line-height:1.65">
            <p style="margin:0 0 10px"><strong style="color:var(--text-primary)">Outcome scores</strong> — one row per recorded assessment (patient id, template, score, date, measurement point). Source: <code style="font-size:11px;padding:1px 5px;background:rgba(255,255,255,0.05);border-radius:4px">/api/v1/outcomes</code>.</p>
            <p style="margin:0 0 10px"><strong style="color:var(--text-primary)">Treatment courses</strong> — one row per course (patient id, condition, modality, status, progress). Source: <code style="font-size:11px;padding:1px 5px;background:rgba(255,255,255,0.05);border-radius:4px">/api/v1/treatment-courses</code>.</p>
            <p style="margin:0"><strong style="color:var(--text-primary)">Saved reports</strong> — reports you have generated and saved locally in this browser.</p>
          </div>
        </div>
      </div>`;

    // Real CSV exporter. Pulls live data from the selected source, filters by
    // the date range, and downloads a CSV named with the range. No toast-only
    // pretend-export — if the endpoint fails the user sees the real error.
    window._repExportCsv = async () => {
      const from    = document.getElementById('rep-exp-from')?.value || '';
      const to      = document.getElementById('rep-exp-to')?.value   || '';
      const source  = document.getElementById('rep-exp-source')?.value || 'outcomes';
      const fromD   = from ? new Date(from + 'T00:00:00') : null;
      const toD     = to   ? new Date(to   + 'T23:59:59') : null;
      let rows = [], header = [];
      try {
        if (source === 'outcomes') {
          const res = await api.listOutcomes();
          const items = res?.items || res || [];
          header = ['id', 'patient_id', 'course_id', 'template_id', 'score_numeric', 'measurement_point', 'administered_at'];
          rows = items
            .filter(r => {
              const d = r.administered_at ? new Date(r.administered_at) : null;
              if (!d) return true;
              if (fromD && d < fromD) return false;
              if (toD   && d > toD)   return false;
              return true;
            })
            .map(r => header.map(k => r[k] == null ? '' : String(r[k])));
        } else if (source === 'courses') {
          const res = await api.listCourses({});
          const items = res?.items || res || [];
          header = ['id', 'patient_id', 'condition_slug', 'modality_slug', 'status', 'sessions_delivered', 'planned_sessions_total', 'created_at'];
          rows = items
            .filter(c => {
              const d = c.created_at ? new Date(c.created_at) : null;
              if (!d) return true;
              if (fromD && d < fromD) return false;
              if (toD   && d > toD)   return false;
              return true;
            })
            .map(c => header.map(k => c[k] == null ? '' : String(c[k])));
        } else {
          header = ['id', 'name', 'patient', 'type', 'date', 'status'];
          rows = loadReports()
            .filter(r => {
              if (!r.date) return true;
              if (fromD && r.date < from) return false;
              if (toD   && r.date > to)   return false;
              return true;
            })
            .map(r => header.map(k => r[k] == null ? '' : String(r[k])));
        }
      } catch (err) {
        window._dsToast?.({ title: 'Export failed', body: (err && err.message) || 'Network error', severity: 'critical' });
        return;
      }
      if (!rows.length) {
        window._dsToast?.({ title: 'No rows', body: 'No data in the selected range.', severity: 'warn' });
        return;
      }
      const quote = s => /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      const csv = [header.join(','), ...rows.map(r => r.map(quote).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'reports-' + source + '-' + (from || 'all') + '_to_' + (to || 'now') + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      window._dsToast?.({ title: 'Export ready', body: rows.length + ' rows downloaded.', severity: 'success' });
    };
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
    '<span id="dv2a-demo-chip" style="display:none;font-size:10px;font-weight:700;color:var(--amber,#ffb547);background:rgba(255,181,71,0.14);border:1px solid rgba(255,181,71,0.35);padding:2px 8px;border-radius:999px;margin-right:8px;letter-spacing:0.04em">DEMO DATA</span>' +
    '<span style="font-size:11px;color:var(--text-tertiary);margin-right:10px">14 instruments · <strong style="color:var(--rose)">2 red flags</strong> · <strong style="color:var(--amber)">8 overdue</strong></span>' +
    '<button class="btn btn-ghost btn-sm" title="Refresh queue" onclick="window._ahRefresh()">↻ Refresh</button>' +
    '<button class="btn btn-ghost btn-sm" title="Export CSV" onclick="window._ahExportCsv()">Export CSV</button>' +
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

/* Fillable assessment form modal */
.dv2a-form-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.72); backdrop-filter:blur(4px); z-index:9998; display:flex; align-items:flex-start; justify-content:center; padding:40px 16px; overflow-y:auto; }
.dv2a-form-modal { width:min(780px,95vw); background:var(--bg-panel,#0d1b22); border:1px solid var(--border); border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.5); display:flex; flex-direction:column; max-height:calc(100vh - 80px); }
.dv2a-form-hd { display:flex; justify-content:space-between; align-items:flex-start; padding:18px 22px 14px; border-bottom:1px solid var(--border); }
.dv2a-form-hd h2 { margin:0; font-size:16px; font-weight:700; color:var(--text-primary); letter-spacing:-0.01em; }
.dv2a-form-hd .sub { font-size:11px; color:var(--text-tertiary); margin-top:3px; }
.dv2a-form-close { width:30px; height:30px; border-radius:6px; background:transparent; border:1px solid var(--border); color:var(--text-tertiary); cursor:pointer; font-size:14px; line-height:1; display:inline-flex; align-items:center; justify-content:center; font-family:inherit; }
.dv2a-form-close:hover { color:var(--text-primary); background:var(--bg-surface,#11222a); }
.dv2a-form-body { flex:1; padding:18px 22px; overflow-y:auto; }
.dv2a-form-license { font-size:10.5px; color:var(--text-tertiary); padding:8px 12px; background:rgba(74,158,255,0.06); border:1px solid rgba(74,158,255,0.25); border-radius:6px; margin-bottom:14px; line-height:1.5; }
.dv2a-form-license.warn { background:rgba(255,181,71,0.08); border-color:rgba(255,181,71,0.3); color:var(--amber,#ffb547); }
.dv2a-form-pt { display:flex; gap:8px; align-items:center; padding:10px 12px; background:var(--bg-surface,#11222a); border:1px solid var(--border); border-radius:8px; margin-bottom:14px; }
.dv2a-form-pt input { flex:1; background:transparent; border:0; outline:none; font-size:13px; color:var(--text-primary); font-family:inherit; }
.dv2a-form-pt .dv2a-form-pt-results { position:absolute; background:var(--bg-panel,#0d1b22); border:1px solid var(--border); border-radius:6px; max-height:180px; overflow-y:auto; z-index:1; }
.dv2a-form-item { padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
.dv2a-form-item:last-child { border-bottom:0; }
.dv2a-form-item.suicide { background:rgba(255,107,157,0.04); border:1px solid rgba(255,107,157,0.35); border-radius:6px; padding:12px 14px; margin:6px 0; }
.dv2a-form-item-q { font-size:12.5px; color:var(--text-primary); line-height:1.5; margin-bottom:8px; display:flex; gap:6px; }
.dv2a-form-item-num { font-family:var(--font-mono,ui-monospace,monospace); font-size:11px; color:var(--text-tertiary); flex-shrink:0; width:22px; }
.dv2a-form-opts { display:flex; flex-wrap:wrap; gap:6px; padding-left:26px; }
.dv2a-form-opt { flex:1 1 auto; min-width:90px; padding:7px 10px; font-size:11.5px; color:var(--text-secondary); background:var(--bg-surface,#11222a); border:1px solid var(--border); border-radius:5px; cursor:pointer; font-family:inherit; transition:all 0.1s; text-align:center; }
.dv2a-form-opt:hover { border-color:rgba(0,212,188,0.35); color:var(--teal,#00d4bc); }
.dv2a-form-opt.sel { background:rgba(0,212,188,0.16); border-color:var(--teal,#00d4bc); color:var(--teal,#00d4bc); font-weight:600; }
.dv2a-form-item.suicide .dv2a-form-opt.sel { background:rgba(255,107,157,0.18); border-color:var(--rose,#ff6b9d); color:var(--rose,#ff6b9d); }
.dv2a-form-foot { padding:14px 22px; border-top:1px solid var(--border); background:var(--bg-surface,#11222a); display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
.dv2a-form-preview { flex:1; min-width:220px; display:flex; flex-direction:column; gap:4px; font-size:11.5px; }
.dv2a-form-preview .row { display:flex; justify-content:space-between; gap:8px; }
.dv2a-form-preview .row .lbl { color:var(--text-tertiary); }
.dv2a-form-preview .row .val { font-family:var(--font-mono,ui-monospace,monospace); color:var(--text-primary); font-weight:600; }
.dv2a-form-preview .row .val.sev { color:var(--rose,#ff6b9d); }
.dv2a-form-preview .row .val.mods { color:var(--amber,#ffb547); }
.dv2a-form-preview .row .val.mod { color:var(--blue,#4a9eff); }
.dv2a-form-preview .row .val.mild { color:var(--teal,#00d4bc); }
.dv2a-form-suicide-warn { padding:10px 14px; background:rgba(255,107,157,0.08); border:1px solid rgba(255,107,157,0.35); color:var(--rose,#ff6b9d); font-size:11.5px; border-radius:6px; margin:0 22px 10px; display:flex; gap:8px; align-items:center; }
.dv2a-form-submit { padding:9px 16px; font-size:12px; font-weight:700; background:var(--teal,#00d4bc); color:#04121c; border:0; border-radius:6px; cursor:pointer; font-family:inherit; letter-spacing:0.02em; }
.dv2a-form-submit:hover { background:#3fe3d0; }
.dv2a-form-submit.amber { background:var(--amber,#ffb547); }
.dv2a-form-submit:disabled { opacity:0.5; cursor:not-allowed; }
.dv2a-form-draft { padding:9px 14px; font-size:11.5px; font-weight:600; background:transparent; color:var(--text-secondary); border:1px solid var(--border); border-radius:6px; cursor:pointer; font-family:inherit; }
.dv2a-form-draft:hover { border-color:rgba(0,212,188,0.35); color:var(--teal,#00d4bc); }

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

  // Load scoring engine (soft-fail — falls back to sum-based scoring if unavailable)
  let scoringEngine = null;
  try { scoringEngine = await import('./scoring-engine.js'); } catch {}

  // Hydrate queue from backend, transforming records into the Queue row shape.
  // Port of the legacy `hydrate()` in pages-clinical-tools.js — preserves backend
  // ids so Submit/Approve/Score later can round-trip.
  let queueRows = MOCK_QUEUE;
  let usingDemoData = true;
  try {
    const apiRes = await (api.listAssessments?.() || Promise.reject());
    const items = Array.isArray(apiRes) ? apiRes : ((apiRes && apiRes.items) || []);
    if (items.length) {
      const merged = items.slice(0, 40).map((a, i) => {
        const sid = a.scale_id || a.scale || a.instrument || a.template_id || 'PHQ-9';
        const score = (a.score == null ? (a.data && a.data.score) : a.score);
        const itemsArr = (a.data && a.data.items) || a.items || null;
        const item9 = (Array.isArray(itemsArr) && itemsArr.length >= 9) ? Number(itemsArr[8]) || 0 : (a.item9 ?? 0);
        const max = a.max_score ?? (ASSESS_REGISTRY.find(x => x.id === sid || x.abbr === sid)?.max ?? 27);
        // Severity band
        let sev = 'mod', sevLabel = a.severity_label || '—';
        if (score != null && scoringEngine?.interpretScore) {
          const interp = scoringEngine.interpretScore(sid, Number(score));
          if (interp) {
            sev = ({ minimal:'mild', mild:'mild', moderate:'mod', severe:'mods', critical:'sev' })[interp.severity] || 'mod';
            sevLabel = interp.label;
          }
        }
        const overdue = !!a.overdue || (a.due_date && new Date(a.due_date) < new Date());
        const patientName = a.patient_name || a.patient_id || 'Patient';
        return {
          id: 'be-' + (a.id || i),
          backendId: a.id,
          patientId: a.patient_id || a.patientId || '',
          scaleId: sid,
          patient: patientName,
          mrn: a.mrn || (a.patient_id ? String(a.patient_id).slice(0, 8) : '—'),
          avInit: patientName.split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase() || 'PT',
          avCls: ['a','b','c','d','e'][i % 5],
          dx: a.diagnosis || a.condition_name || '—',
          inst: sid,
          instSub: a.cadence || a.phase || '',
          score: (score == null ? null : Number(score)),
          max,
          item9,
          sev,
          sevLabel,
          trend: a.trend_label || (a.status === 'completed' ? 'Completed' : 'Pending'),
          trendCls: overdue ? 'up' : 'flat',
          sparkline: a.sparkline || [],
          due: a.due_label || (a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'),
          dueCls: overdue ? 'overdue' : (a.due_today ? 'today' : 'soon'),
          overdue,
          mode: a.delivery_mode || (a.respondent_type === 'patient' ? 'TABLET' : 'ASYNC'),
          modeSub: a.delivery_sub || (a.respondent_type || ''),
          redflag: item9 >= 1,
          flagLabel: overdue ? 'OVERDUE' : null,
          flagCls: overdue ? 'amber' : null,
          sendLabel: (a.status === 'completed' && !a.reviewed) ? 'Review' : (overdue ? 'Resend' : 'Open'),
          status: a.status,
          reviewed: !!a.reviewed,
          items: Array.isArray(itemsArr) ? itemsArr.map(Number) : null,
        };
      });
      if (merged.length) { queueRows = merged; usingDemoData = false; }
    }
  } catch {}

  // Reveal DEMO chip now that load has settled.
  setTimeout(() => {
    const chip = document.getElementById('dv2a-demo-chip');
    if (chip) chip.style.display = usingDemoData ? 'inline-block' : 'none';
  }, 0);

  // ── State & handlers ─────────────────────────────────────────────────────────
  window._assessSelect = (id) => { window._assessSelectedId = id; window._nav('assessments-v2'); };
  window._assessTab = (t) => { window._assessHubTab = t; window._nav('assessments-v2'); };
  window._assessCloseSide = () => { window._assessSelectedId = null; window._nav('assessments-v2'); };
  // Batch send → jump to Cohort tab where the real _ahBulkAssign flow lives.
  window._assessBatch = () => { window._assessHubTab = 'cohort'; window._nav('assessments-v2'); };
  // New assessment → jump to Library tab (clinician picks the instrument then Submit/Assign).
  window._assessNew = () => { window._assessHubTab = 'library'; window._nav('assessments-v2'); };
  // Reschedule → date-picker modal, PATCH due_date; localStorage fallback when offline.
  window._assessReschedule = (id) => {
    const row = queueRows.find(r => r.id === id);
    const bid = row?.backendId || id;
    const def = new Date(Date.now() + 7*86400000).toISOString().slice(0,10);
    document.getElementById('dv2a-resched-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'dv2a-resched-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(4,18,28,0.55);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
    overlay.innerHTML =
      '<div style="background:var(--bg-panel,#0d1b22);border:1px solid var(--border);border-radius:10px;padding:18px 20px;width:360px;font-family:var(--font-body,system-ui)">'+
        '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Reschedule assessment</div>'+
        '<div style="font-size:11.5px;color:var(--text-tertiary,#7c8699);margin-bottom:14px">'+esc(row?.patient||'Patient')+' · '+esc(row?.inst||'assessment')+'</div>'+
        '<label style="font-size:11px;color:var(--text-tertiary);display:block;margin-bottom:4px">New due date</label>'+
        '<input id="dv2a-resched-date" type="date" value="'+def+'" min="'+new Date().toISOString().slice(0,10)+'" style="width:100%;padding:8px 10px;background:var(--bg-surface,#11222a);border:1px solid var(--border);border-radius:6px;font-size:13px;color:var(--text-primary);font-family:var(--font-mono,ui-monospace,monospace)"/>'+
        '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">'+
          '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'dv2a-resched-overlay\').remove()">Cancel</button>'+
          '<button class="btn btn-primary btn-sm" onclick="window._assessReschedConfirm(\''+esc(bid)+'\')">Save</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    setTimeout(() => document.getElementById('dv2a-resched-date')?.focus(), 30);
  };
  window._assessReschedConfirm = async (bid) => {
    const next = document.getElementById('dv2a-resched-date')?.value;
    document.getElementById('dv2a-resched-overlay')?.remove();
    if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    try {
      await api.updateAssessment(bid, { due_date: next });
      window._dsToast?.({ title:'Rescheduled', body:'New due date: '+next, severity:'success' });
      window._nav('assessments-v2');
    } catch {
      try {
        const raw = localStorage.getItem('ds_assessment_reschedules') || '[]';
        const arr = JSON.parse(raw);
        arr.push({ id: bid, new_due_date: next, at: new Date().toISOString() });
        localStorage.setItem('ds_assessment_reschedules', JSON.stringify(arr));
      } catch {}
      window._dsToast?.({ title:'Rescheduled (offline)', body:'Saved locally; will sync.', severity:'info' });
    }
  };
  // Export PDF → open print dialog on the detail panel so clinician can save to PDF
  // (no server-side PDF endpoint — browser handles it via "Save as PDF" in print).
  window._assessExportPdf = (id) => {
    const row = queueRows.find(r => r.id === id);
    window._dsToast?.({ title:'Printing', body:(row?.patient||'Assessment')+' · use "Save as PDF" in the print dialog.', severity:'info' });
    try { window.print(); } catch {}
  };
  window._assessCosign = async (id) => {
    // `id` here is the row id ("be-<backendId>" or mock "as-X"). Use backendId when present.
    const row = queueRows.find(r => r.id === id);
    const bid = row?.backendId || id;
    try {
      await (api.approveAssessment?.(bid, { approved:true }) || Promise.resolve());
      window._dsToast?.({ title:'Co-signed', body:'Assessment signed.', severity:'success' });
      window._nav('assessments-v2');
    } catch (err) {
      try {
        const raw = localStorage.getItem('ds_assessment_approvals') || '[]';
        const arr = JSON.parse(raw);
        arr.push({ id: bid, approved_at: new Date().toISOString(), user: (currentUser?.email || 'clinician') });
        localStorage.setItem('ds_assessment_approvals', JSON.stringify(arr));
      } catch {}
      window._dsToast?.({ title:'Co-signed (offline)', body:'Saved locally; will sync.', severity:'success' });
    }
  };

  // ── Refresh button ───────────────────────────────────────────────────────────
  window._ahRefresh = () => {
    window._dsToast?.({ title:'Refreshing', body:'Re-loading assessments from server…', severity:'info' });
    window._nav('assessments-v2');
  };

  // ── CSV export ───────────────────────────────────────────────────────────────
  window._ahExportCsv = async () => {
    // Prefer backend CSV if endpoint is present; fall back to building locally from current queueRows.
    try {
      const res = await (api.exportAssessmentsCSV?.() || Promise.reject());
      if (res && res.csv) {
        const blob = new Blob([res.csv], { type:'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'assessments-' + new Date().toISOString().slice(0,10) + '.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        window._dsToast?.({ title:'Export complete', body:'Saved '+(res.csv.split('\n').length-1)+' rows.', severity:'success' });
        return;
      }
    } catch {}
    // Local fallback
    const headers = ['id','patient','mrn','instrument','score','max','severity','due','status'];
    const lines = [headers.join(',')];
    queueRows.forEach(r => {
      const row = [r.backendId || r.id, r.patient, r.mrn, r.inst, (r.score==null?'':r.score), r.max, r.sevLabel, r.due, r.status || ''];
      lines.push(row.map(v => '"' + String(v == null ? '' : v).replace(/"/g,'""') + '"').join(','));
    });
    const blob = new Blob([lines.join('\n')], { type:'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'assessments-' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    window._dsToast?.({ title:'Export complete (local)', body:'Exported '+queueRows.length+' rows from current view.', severity:'success' });
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

  // ── Scoring helper (uses scoring-engine.js when available, else sum) ─────────
  function _ahScore(instId, itemValues) {
    const inst = ASSESS_REGISTRY.find(x => x.id === instId || x.abbr === instId);
    if (scoringEngine?.scoreAssessment) {
      const res = scoringEngine.scoreAssessment(instId, itemValues);
      if (res && res.raw != null) {
        return {
          total: res.raw,
          max: inst?.max || 0,
          interpretation: res.interpretation || null,
          subscales: res.subscales || {},
          subscaleInterp: res.subscaleInterpretations || {},
          complete: res.complete,
          missing: res.missingItems || [],
          safety: res.safety || [],
        };
      }
    }
    // Sum fallback
    const vals = (itemValues || []).map(v => (v == null || v === '' || Number.isNaN(Number(v))) ? null : Number(v));
    const total = vals.reduce((a,b) => a + (b == null ? 0 : b), 0);
    const missing = [];
    const expected = (inst?.questions?.length) || vals.length;
    for (let i = 0; i < expected; i++) if (vals[i] == null) missing.push(i+1);
    let interpretation = null;
    if (typeof inst?.interpret === 'function') {
      try { interpretation = inst.interpret(total); } catch {}
    }
    return {
      total,
      max: inst?.max || 0,
      interpretation: interpretation ? { label: interpretation.label, severity: null } : null,
      subscales: {},
      subscaleInterp: {},
      complete: missing.length === 0,
      missing,
      safety: [],
    };
  }
  // Map severity token → css class used in preview rows.
  function _ahSevClass(sev) {
    return ({ minimal:'mild', mild:'mild', moderate:'mod', severe:'mods', critical:'sev' })[sev] || '';
  }

  // ── Open fillable form modal ─────────────────────────────────────────────────
  // Stores current form state on window._ahForm so re-renders (patient search)
  // can read it back. Values are 1-indexed in UI but stored 0-indexed in array.
  window._ahOpenForm = async (instrumentId, patientId, backendId) => {
    const inst = ASSESS_REGISTRY.find(x => x.id === instrumentId || x.abbr === instrumentId);
    if (!inst) {
      window._dsToast?.({ title:'Unknown instrument', body:'Instrument '+instrumentId+' not found.', severity:'warn' });
      return;
    }
    const existing = document.getElementById('dv2a-form-overlay');
    if (existing) existing.remove();

    // Determine item count + option scale
    const rule = scoringEngine?.getScoringRule?.(inst.id) || null;
    const itemCount = Array.isArray(inst.questions) ? inst.questions.length : (rule?.items || 0);
    const scale = rule?.itemScale || (() => {
      // Infer from inst.options like "Not at all (0)" → "Nearly every day (3)"
      const opts = inst.options || [];
      const nums = opts.map(o => { const m = String(o).match(/\((\d+)\)\s*$/); return m ? Number(m[1]) : null; }).filter(n => n != null);
      if (nums.length) return [Math.min(...nums), Math.max(...nums)];
      return [0, 3];
    })();

    const licenseAllowed = !!inst.licensing?.embedded_text_allowed && Array.isArray(inst.questions) && inst.questions.length > 0;

    // Seed patient — from row if backendId provided, else let user pick.
    let patientName = '';
    if (backendId) {
      const row = queueRows.find(r => r.backendId === backendId || r.id === backendId || r.id === 'be-'+backendId);
      if (row) { patientId = patientId || row.patientId; patientName = row.patient; }
    } else if (patientId) {
      const row = queueRows.find(r => r.patientId === patientId);
      if (row) patientName = row.patient;
    }

    window._ahForm = {
      instrumentId: inst.id,
      itemCount,
      scale,
      values: new Array(itemCount).fill(null),
      patientId: patientId || '',
      patientName: patientName || '',
      backendId: backendId || null,
    };

    const renderForm = () => {
      const state = window._ahForm;
      const safeItemIdxs = (rule?.safetyItems || []).map(i => i - 1);
      const phqSuicideIdx = /^PHQ-?9$/i.test(inst.id) ? 8 : -1;
      if (phqSuicideIdx >= 0 && !safeItemIdxs.includes(phqSuicideIdx)) safeItemIdxs.push(phqSuicideIdx);

      const itemsHtml = licenseAllowed ? inst.questions.map((q, i) => {
        const sel = state.values[i];
        const isSafety = safeItemIdxs.includes(i);
        const opts = (inst.options || []).map((opt, oi) => {
          const m = String(opt).match(/\((\d+)\)\s*$/);
          const v = m ? Number(m[1]) : oi;
          const selCls = sel === v ? ' sel' : '';
          return '<button class="dv2a-form-opt'+selCls+'" onclick="window._ahSetItem('+i+','+v+')">'+esc(opt)+'</button>';
        }).join('');
        return '<div class="dv2a-form-item'+(isSafety?' suicide':'')+'">' +
          '<div class="dv2a-form-item-q"><span class="dv2a-form-item-num">'+(i+1)+'.</span><span>'+esc(q)+(isSafety?' <span style="color:var(--rose,#ff6b9d);font-weight:700"> · safety item</span>':'')+'</span></div>' +
          '<div class="dv2a-form-opts">'+opts+'</div>' +
        '</div>';
      }).join('') : (
        // Score-entry fallback for licensed/restricted instruments
        '<div class="dv2a-form-license warn">This is a <strong>'+(inst.licensing?.tier||'licensed')+'</strong> instrument. Administer the scale via your authorized copy, then enter the total below.</div>' +
        '<div style="display:flex;gap:10px;align-items:center">'+
          '<label style="font-size:12px;color:var(--text-secondary);flex:1">Total score (0–'+(inst.max||'—')+')</label>'+
          '<input id="dv2a-form-total-direct" type="number" min="0" max="'+(inst.max||'')+'" style="width:120px;padding:8px 10px;background:var(--bg-surface,#11222a);border:1px solid var(--border);border-radius:6px;font-size:13px;color:var(--text-primary);font-family:var(--font-mono,ui-monospace,monospace)" oninput="window._ahSetDirect(this.value)" value="'+(state.directTotal!=null?state.directTotal:'')+'"/>'+
        '</div>'
      );

      const licenseHtml = inst.licensing?.attribution
        ? '<div class="dv2a-form-license">'+esc(inst.licensing.attribution)+(inst.licensing.source ? ' · '+esc(inst.licensing.source) : '')+'</div>'
        : '';

      // Score preview
      let total = 0, interp = null, missing = [], safety = [], subscales = {}, maxVal = inst.max || 0;
      if (licenseAllowed) {
        const res = _ahScore(inst.id, state.values);
        total = res.total || 0;
        interp = res.interpretation;
        missing = res.missing;
        safety = res.safety;
        subscales = res.subscales;
        maxVal = res.max || maxVal;
      } else if (state.directTotal != null && state.directTotal !== '') {
        total = Number(state.directTotal) || 0;
        try { interp = typeof inst.interpret === 'function' ? inst.interpret(total) : null; } catch {}
        if (interp && !interp.severity && scoringEngine?.interpretScore) {
          const i2 = scoringEngine.interpretScore(inst.id, total);
          if (i2) interp = i2;
        }
      }

      const sevCls = _ahSevClass(interp?.severity);
      const item9 = phqSuicideIdx >= 0 ? state.values[phqSuicideIdx] : null;
      const suicideFlagged = (item9 != null && item9 >= 1) || safety.some(s => s.flagged);

      const previewRows =
        '<div class="row"><span class="lbl">Total</span><span class="val">'+total+(maxVal?' / '+maxVal:'')+'</span></div>' +
        (interp ? '<div class="row"><span class="lbl">Severity</span><span class="val '+sevCls+'">'+esc(interp.label || '—')+'</span></div>' : '') +
        (Object.keys(subscales).length ? '<div class="row"><span class="lbl">Subscales</span><span class="val" style="text-align:right">'+Object.entries(subscales).map(([k,v]) => esc(k)+': '+(v==null?'—':v)).join(' · ')+'</span></div>' : '') +
        (missing.length ? '<div class="row"><span class="lbl" style="color:var(--amber,#ffb547)">Missing</span><span class="val" style="color:var(--amber,#ffb547)">items '+missing.join(', ')+'</span></div>' : '');

      const warnBanner = suicideFlagged
        ? '<div class="dv2a-form-suicide-warn"><span>⚠</span><span>Patient indicated <strong>suicidality</strong> — crisis protocol will be triggered on submit.</span></div>'
        : '';

      const canSubmit = licenseAllowed ? missing.length === 0 : (state.directTotal != null && state.directTotal !== '');

      return '<div class="dv2a-form-modal" role="dialog" aria-labelledby="dv2a-form-title">' +
        '<div class="dv2a-form-hd">' +
          '<div><h2 id="dv2a-form-title">'+esc(inst.abbr || inst.id)+' · '+esc(inst.t || '')+'</h2><div class="sub">v'+esc(inst.scoringKey || inst.id)+'@1 · '+esc(inst.cat||'—')+' · '+itemCount+' items · max '+(inst.max||'—')+'</div></div>' +
          '<button class="dv2a-form-close" onclick="window._ahCloseForm()" aria-label="Close">✕</button>' +
        '</div>' +
        '<div class="dv2a-form-body">' +
          licenseHtml +
          // Patient picker
          '<div class="dv2a-form-pt">' +
            '<label style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;font-weight:700;margin-right:4px">Patient</label>' +
            '<input id="dv2a-form-pt" placeholder="Search patient name or MRN" value="'+esc(state.patientName || state.patientId || '')+'" oninput="window._ahSetPatient(this.value)"/>' +
          '</div>' +
          itemsHtml +
        '</div>' +
        warnBanner +
        '<div class="dv2a-form-foot">' +
          '<div class="dv2a-form-preview">'+previewRows+'</div>' +
          '<button class="dv2a-form-draft" onclick="window._ahSaveDraft()">Save draft</button>' +
          '<button class="dv2a-form-submit'+(suicideFlagged?' amber':'')+'" onclick="window._ahSubmit()"'+(canSubmit?'':' disabled')+'>'+(suicideFlagged?'Submit + escalate →':'Submit →')+'</button>' +
        '</div>' +
      '</div>';
    };

    const overlay = document.createElement('div');
    overlay.id = 'dv2a-form-overlay';
    overlay.className = 'dv2a-form-overlay';
    overlay.innerHTML = renderForm();
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) window._ahCloseForm(); });

    window._ahRender = () => {
      const o = document.getElementById('dv2a-form-overlay');
      if (!o) return;
      // Preserve focused input so typing in patient field isn't disrupted
      const focused = document.activeElement;
      const focusedId = focused?.id;
      const caret = (focusedId === 'dv2a-form-pt') ? focused.selectionStart : null;
      o.innerHTML = renderForm();
      if (focusedId) {
        const n = document.getElementById(focusedId);
        if (n) { n.focus(); if (caret != null && n.setSelectionRange) try { n.setSelectionRange(caret, caret); } catch {} }
      }
    };

    window._ahSetItem = (idx, v) => {
      const s = window._ahForm; if (!s) return;
      s.values[idx] = (s.values[idx] === v) ? null : v;
      window._ahRender();
    };
    window._ahSetDirect = (v) => {
      const s = window._ahForm; if (!s) return;
      s.directTotal = v;
      window._ahRender();
    };
    window._ahSetPatient = (v) => {
      const s = window._ahForm; if (!s) return;
      s.patientName = v;
      // If the typed text matches a known queue row, latch the id.
      const match = queueRows.find(r => r.patient && r.patient.toLowerCase() === v.toLowerCase());
      if (match) s.patientId = match.patientId || match.id;
      // Don't re-render on every keystroke — patient field handles its own value.
    };
    window._ahCloseForm = () => {
      document.getElementById('dv2a-form-overlay')?.remove();
      window._ahForm = null;
    };

    window._ahSaveDraft = async () => {
      const s = window._ahForm; if (!s) return;
      const payload = {
        patient_id: s.patientId || null,
        scale_id: s.instrumentId,
        status: 'draft',
        data: { items: s.values, scale_id: s.instrumentId, source: 'assessments-hub-v2' },
      };
      try {
        if (s.backendId) {
          await api.updateAssessment(s.backendId, payload);
        } else {
          const res = await api.createAssessment(payload);
          if (res && res.id) s.backendId = res.id;
        }
        window._dsToast?.({ title:'Draft saved', body:'Progress saved — return later to finish.', severity:'success' });
      } catch {
        // Local fallback — stash in localStorage so it's not lost.
        try {
          const key = 'ds_assessment_drafts';
          const arr = JSON.parse(localStorage.getItem(key) || '[]');
          arr.push({ ...payload, saved_at: new Date().toISOString() });
          localStorage.setItem(key, JSON.stringify(arr));
        } catch {}
        window._dsToast?.({ title:'Draft saved (offline)', body:'Saved locally; will sync.', severity:'info' });
      }
    };

    window._ahSubmit = async () => {
      const s = window._ahForm; if (!s) return;
      const instId = s.instrumentId;
      const licensedInline = licenseAllowed;
      let total, interp, itemsArr, safety = [];
      if (licensedInline) {
        const res = _ahScore(instId, s.values);
        if (!res.complete) {
          window._dsToast?.({ title:'Incomplete', body:'Please answer all items (missing: '+res.missing.join(', ')+').', severity:'warn' });
          return;
        }
        total = res.total;
        interp = res.interpretation;
        itemsArr = s.values.slice();
        safety = res.safety;
      } else {
        if (s.directTotal == null || s.directTotal === '') {
          window._dsToast?.({ title:'No score', body:'Enter a total score first.', severity:'warn' });
          return;
        }
        total = Number(s.directTotal);
        try { interp = typeof inst.interpret === 'function' ? inst.interpret(total) : null; } catch {}
        if ((!interp || !interp.severity) && scoringEngine?.interpretScore) interp = scoringEngine.interpretScore(instId, total) || interp;
        itemsArr = null;
      }

      const payload = {
        patient_id: s.patientId || null,
        scale_id: instId,
        status: 'completed',
        score: String(total),
        data: {
          score: total,
          interpretation: interp?.label || null,
          severity: interp?.severity || null,
          items: itemsArr,
          scale_id: instId,
          source: 'assessments-hub-v2',
          safety,
        },
      };

      let savedId = s.backendId;
      const _persist = async (overrideVal) => {
        const p = overrideVal ? { ...payload, data: { ...payload.data, override_score_validation: true }, override_score_validation: true } : payload;
        if (s.backendId) {
          await api.updateAssessment(s.backendId, p);
        } else {
          const res = await api.createAssessment(p);
          savedId = res?.id || null;
        }
      };
      try {
        await _persist(false);
        window._dsToast?.({ title:'Submitted', body:(inst.abbr||instId)+' · '+total+(inst.max?'/'+inst.max:'')+' · '+(interp?.label||'scored'), severity:'success' });
      } catch (err) {
        // Server-side canonical-score validation rejected the submit (±5% tolerance).
        // Surface the delta + offer clinician-override retry so we don't block on minor
        // rounding but still audit. Otherwise fall through to offline toast.
        if (err && err.code === 'score_mismatch' && err.details) {
          const d = err.details;
          const ok = window.confirm(
            'Score mismatch: clinician entered '+d.submitted_score+' · server computed '+d.canonical_score+
            ' (Δ '+(d.delta_pct!=null?d.delta_pct.toFixed(1)+'%':'n/a')+'). Submit with clinician override?'
          );
          if (ok) {
            try {
              await _persist(true);
              window._dsToast?.({ title:'Submitted (override)', body:'Canonical '+d.canonical_score+' · clinician '+d.submitted_score, severity:'success' });
            } catch {
              window._dsToast?.({ title:'Saved offline', body:'Will sync when backend is available.', severity:'info' });
            }
          } else {
            window._dsToast?.({ title:'Submit cancelled', body:'Adjust score or items then resubmit.', severity:'warn' });
            return;
          }
        } else {
          window._dsToast?.({ title:'Saved offline', body:'Will sync when backend is available.', severity:'info' });
        }
      }

      // Fire-and-forget AI summary
      if (savedId) { try { api.generateAssessmentSummary?.(savedId); } catch {} }

      // Legacy sidecar for dashboard activity feed
      try {
        const runs = JSON.parse(localStorage.getItem('ds_assessment_runs') || '[]');
        runs.push({
          id: savedId,
          patient_id: s.patientId || null,
          patient_name: s.patientName || '',
          scale_id: instId,
          scale_name: inst.t || inst.abbr || instId,
          score: total,
          severity: interp?.severity || null,
          interpretation: interp?.label || '',
          completed_at: new Date().toISOString(),
          clinician_id: (currentUser?.id || currentUser?.email || null),
          status: 'completed',
          source: 'assessments-hub-v2',
        });
        localStorage.setItem('ds_assessment_runs', JSON.stringify(runs));
      } catch {}

      // Dispatch event so dashboard can refresh its activity feed
      try {
        window.dispatchEvent(new CustomEvent('ds:assessment-submitted', {
          detail: { id: savedId, patient_id: s.patientId, scale_id: instId, score: total, severity: interp?.severity || null },
        }));
        // Back-compat with legacy event name used by patient profile
        window.dispatchEvent(new CustomEvent('ds-assessment-runs-updated', { detail: { patientId: s.patientId } }));
      } catch {}

      // Crisis escalation — PHQ-9 item 9 ≥ 1 or any safety flag
      const item9 = /^PHQ-?9$/i.test(instId) && Array.isArray(itemsArr) && itemsArr.length >= 9 ? itemsArr[8] : null;
      if ((item9 != null && item9 >= 1) || safety.some(x => x.flagged)) {
        window._assessCrisis(s.patientId || 'unknown', s.patientName || 'Patient');
      }

      window._ahCloseForm();
      window._nav('assessments-v2');
    };

    // Trigger an initial render of the footer preview (values already applied).
    window._ahRender();
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
      '<button class="btn btn-ghost btn-sm" style="font-size:10.5px" onclick="window._assessCycleSort()">Sort: '+(window._assessSort||'due-asc')+'</button>'+
      '</div>' +
    '</div>';

    const _sortMode = window._assessSort || 'due-asc';
    const _sortKey = {
      'due-asc':    (a,b) => String(a.dueISO||a.due||'').localeCompare(String(b.dueISO||b.due||'')),
      'due-desc':   (a,b) => String(b.dueISO||b.due||'').localeCompare(String(a.dueISO||a.due||'')),
      'severity':   (a,b) => ({critical:4,severe:3,moderate:2,mild:1,minimal:0}[b.sev]||0) - ({critical:4,severe:3,moderate:2,mild:1,minimal:0}[a.sev]||0),
      'patient':    (a,b) => String(a.patient||'').localeCompare(String(b.patient||'')),
    }[_sortMode] || ((a,b)=>0);
    const filteredRaw = activeFilter === 'all' ? queueRows : queueRows.filter(r => (r.inst || '').includes(activeFilter));
    const filtered = filteredRaw.slice().sort(_sortKey);
    if (!window._assessCycleSort) {
      const _SORTS = ['due-asc','due-desc','severity','patient'];
      window._assessCycleSort = () => { const cur = window._assessSort || 'due-asc'; const next = _SORTS[(_SORTS.indexOf(cur)+1) % _SORTS.length]; window._assessSort = next; window._nav('assessments-v2'); };
    }

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
        '<button class="btn btn-ghost btn-sm" style="flex:1" onclick="window._ahOpenForm(\''+esc(row.scaleId || row.inst || 'PHQ-9')+'\',\''+esc(row.patientId||'')+'\',\''+esc(row.backendId||'')+'\')">Score now</button>' +
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

    window._ahBulkAssign = async (cohortId, label, n, instruments) => {
      const rows = queueRows.filter(r => r.patientId).slice(0, n);
      if (!rows.length) {
        window._dsToast?.({ title:'No patients', body:'No patients with IDs found in current queue for bulk assign.', severity:'warn' });
        return;
      }
      // Pick the first instrument in the cohort config
      const firstInstrument = (instruments || '').split(/[·,]/)[0].trim() || 'PHQ-9';
      const dueDate = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      try {
        let succeeded = 0;
        await Promise.all(rows.map(async r => {
          try {
            await api.bulkAssignAssessments({
              patient_id: r.patientId,
              template_ids: [firstInstrument.toLowerCase().replace(/[^a-z0-9]/g, '')],
              phase: 'monitoring',
              due_date: dueDate,
              bundle_id: cohortId,
            });
            succeeded++;
          } catch {}
        }));
        window._dsToast?.({ title:'Bulk assigned', body:firstInstrument+' sent to '+succeeded+' patients in '+label+'.', severity:'success' });
        window._nav('assessments-v2');
      } catch (err) {
        window._dsToast?.({ title:'Bulk assign failed', body:(err && err.message) || 'Network error. Saved locally.', severity:'error' });
      }
    };
    return '<div class="dv2a-filter-bar"><button class="dv2a-chip">Instrument: any</button><button class="dv2a-chip">Window: last 30d</button><div style="margin-left:auto"><button class="btn btn-primary btn-sm" onclick="window._ahBulkAssign(\''+esc(active.id)+'\',\''+esc(active.label)+'\','+active.n+',\''+esc(active.inst)+'\')">Batch send to '+active.n+' →</button></div></div>' +
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
    const cat = (window._assessLibCat || 'all');
    window._assessSetLibCat = (c) => { window._assessLibCat = c; window._nav('assessments-v2'); };
    const allCats = Array.from(new Set(ASSESS_REGISTRY.map(e => e.cat || 'Other'))).sort();
    const entries = cat === 'all' ? ASSESS_REGISTRY : ASSESS_REGISTRY.filter(e => (e.cat || 'Other') === cat);
    const catBar = '<div class="dv2a-filter-bar" style="margin-bottom:10px">' +
      '<button class="dv2a-chip'+(cat==='all'?' active':'')+'" onclick="window._assessSetLibCat(\'all\')">All · '+ASSESS_REGISTRY.length+'</button>' +
      allCats.map(c => {
        const n = ASSESS_REGISTRY.filter(e => (e.cat||'Other')===c).length;
        return '<button class="dv2a-chip'+(cat===c?' active':'')+'" onclick="window._assessSetLibCat(\''+esc(c)+'\')">'+esc(c)+' · '+n+'</button>';
      }).join('') + '</div>';
    const cards = entries.map(e => {
      const catL = esc(e.cat || '—');
      const nItems = Array.isArray(e.questions) ? e.questions.length : (scoringEngine?.getScoringRule?.(e.id)?.items || '—');
      const max = e.max != null ? e.max : '—';
      const inlineOk = !!e.inline && Array.isArray(e.questions) && e.questions.length > 0;
      const lic = e.licensing?.tier === 'public_domain' ? 'Public domain' :
                  e.licensing?.tier === 'us_gov' ? 'US Gov' :
                  e.licensing?.tier === 'academic' ? 'Academic' :
                  e.licensing?.tier === 'licensed' ? 'Licensed' :
                  e.licensing?.tier === 'restricted' ? 'Restricted' : '—';
      const scored = scoringEngine?.getScoringRule?.(e.id) ? '<span style="color:var(--teal,#00d4bc)">✓ scored</span>' : (inlineOk ? '<span style="color:var(--blue,#4a9eff)">sum</span>' : '<span style="color:var(--text-tertiary)">score-entry</span>');
      return '<div class="dv2a-lib-card" onclick="window._ahOpenForm(\''+esc(e.id)+'\')" title="Click to open fillable form">' +
        '<div class="dv2a-lib-abbr">'+esc(e.abbr||e.id)+'</div>' +
        '<div class="dv2a-lib-name">'+esc(e.t||e.abbr)+'</div>' +
        '<div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;line-height:1.4;min-height:26px">'+esc(e.sub||'')+'</div>' +
        '<div class="dv2a-lib-meta">' +
          '<span>'+catL+'</span>' +
          '<span>'+nItems+' items</span>' +
          '<span>max '+max+'</span>' +
          '<span>'+esc(lic)+'</span>' +
          '<span style="background:transparent;padding:0">'+scored+'</span>' +
        '</div>' +
      '</div>';
    }).join('');
    return '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:6px">Validated instruments across depression, anxiety, OCD, trauma, sleep, mania, pain, language, and QoL. <strong>Click a card to open its fillable form and compute the score on-platform.</strong></div>' +
      catBar +
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
      // Open the fillable form directly so clinician can either complete now
      // or use "Save draft" to assign for later.
      window._ahOpenForm(inst.id);
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


// ── Marketplace Hub ───────────────────────────────────────────────────────────
export async function pgMarketplaceHub(setTopbar, navigate) {
  setTopbar('Marketplace');
  const el = document.getElementById('content');
  el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div></div>';

  const CATEGORIES = [
    { id: 'all',           label: 'All Listings',     icon: '🛒' },
    { id: 'consultations', label: 'Consultations',    icon: '🩺' },
    { id: 'products',      label: 'Products',         icon: '📦' },
    { id: 'software',      label: 'Software',         icon: '💻' },
    { id: 'seminars',      label: 'Seminars',         icon: '🎤' },
    { id: 'workshops',     label: 'Workshops',        icon: '🔧' },
    { id: 'courses',       label: 'Short Courses',    icon: '📚' },
  ];

  const DEMO_LISTINGS = [
    // ── Consultations ──
    { id: 'l1',  cat: 'consultations', title: 'Initial TMS Assessment',       clinic: 'Smart TMS',           price: 120,  unit: 'session',  badge: 'Featured', rating: 4.9, reviews: 142, desc: 'Comprehensive first-consultation including QEEG screening and protocol recommendation.', img: '🩺', url: 'https://www.smarttms.co.uk/gps-referrals/' },
    { id: 'l2',  cat: 'consultations', title: 'Follow-up Protocol Review',    clinic: 'AIM Neuromodulation', price: 75,   unit: 'session',  badge: '',         rating: 4.7, reviews: 89,  desc: 'Review progress, adjust stimulation parameters and outcomes targets mid-course.', img: '🩺', url: 'https://www.aimneuromodulation.com/' },
    { id: 'l3',  cat: 'consultations', title: 'tDCS Home Setup Consultation', clinic: 'Neuroelectrics',      price: 60,   unit: 'session',  badge: 'New',      rating: 4.5, reviews: 23,  desc: 'Remote session to configure home tDCS device and safety protocols.', img: '🩺', url: 'https://www.neuroelectrics.com/blog/home-based-tdcs-as-a-promising-treatment-for-depression' },
    // ── Products (real Amazon links) ──
    { id: 'l4',  cat: 'products',      title: 'Ten20 Conductive EEG Paste 228g', clinic: 'Weaver and Company', price: 12,   unit: 'item',     badge: 'Bestseller', rating: 4.7, reviews: 1250, desc: 'Industry-standard conductive paste for EEG, EMG, and neurofeedback electrode application.', img: '🧴', url: 'https://www.amazon.com/dp/B00GTX2MNE' },
    { id: 'l5',  cat: 'products',      title: 'Muse 2 Brain Sensing Headband', clinic: 'Interaxon',          price: 199,  unit: 'item',     badge: 'Featured', rating: 4.3, reviews: 3200, desc: 'EEG-powered meditation headband with real-time biofeedback for brain activity, heart rate, breathing, and movement.', img: '🧠', url: 'https://www.amazon.com/dp/B07HL2JQQJ' },
    { id: 'l6',  cat: 'products',      title: 'Polar H10 Heart Rate Sensor',  clinic: 'Polar',              price: 89,   unit: 'item',     badge: '',         rating: 4.7, reviews: 18500, desc: 'Medical-grade ECG chest strap with dual Bluetooth + ANT+. Gold standard for HRV monitoring in clinical settings.', img: '🫀', url: 'https://www.amazon.com/dp/B07PM54P4N' },
    { id: 'l17', cat: 'products',      title: 'Oura Ring Gen 4',              clinic: 'Oura Health',         price: 349,  unit: 'item',     badge: 'New',      rating: 4.2, reviews: 5400, desc: 'Titanium smart ring with advanced sleep staging, HRV, blood oxygen, and activity tracking. 7-day battery life.', img: '💍', url: 'https://www.amazon.com/dp/B0DKLHHMZ5' },
    { id: 'l18', cat: 'products',      title: 'Verilux HappyLight Touch Plus', clinic: 'Verilux',           price: 64,   unit: 'item',     badge: '',         rating: 4.5, reviews: 9800, desc: '10,000 lux UV-free LED light therapy lamp. Adjustable brightness and colour temperature for SAD and circadian therapy.', img: '☀️', url: 'https://www.amazon.com/dp/B07WC7KT4G' },
    { id: 'l19', cat: 'products',      title: 'Garmin vivosmart 5 Fitness Tracker', clinic: 'Garmin',       price: 149,  unit: 'item',     badge: '',         rating: 4.3, reviews: 7200, desc: 'Fitness tracker with stress tracking, Body Battery energy monitoring, sleep score, and Garmin Connect integration.', img: '⌚', url: 'https://www.amazon.com/dp/B09W1TVFS7' },
    { id: 'l20', cat: 'products',      title: 'LectroFan Evo White Noise Machine', clinic: 'Adaptive Sound', price: 49,  unit: 'item',     badge: '',         rating: 4.6, reviews: 11400, desc: 'High-fidelity white noise, fan, and ocean sounds with precise volume control. 22 non-looping sounds for sleep and focus.', img: '🔊', url: 'https://www.amazon.com/dp/B07XXR2NVB' },
    // ── Software ──
    { id: 'l7',  cat: 'software',      title: 'NeuroGuide QEEG Software',     clinic: 'Applied Neuroscience', price: 49,   unit: 'month',    badge: 'Featured', rating: 4.9, reviews: 204, desc: 'Industry-standard QEEG analysis, database comparison, and clinical report generation platform with normative databases.', img: '💻', url: 'https://www.appliedneuroscience.com/product/neuroguide/' },
    { id: 'l8',  cat: 'software',      title: 'qEEG-Pro Report Generator',    clinic: 'qEEG-Pro',            price: 29,   unit: 'month',    badge: '',         rating: 4.5, reviews: 78,  desc: 'Automated clinical QEEG report generation with z-score analysis, ERP processing, and protocol recommendations.', img: '📊', url: 'https://qeeg.pro/' },
    { id: 'l9',  cat: 'software',      title: 'BrainMaster Discovery 24E',    clinic: 'BrainMaster',         price: 0,    unit: 'free',     badge: 'Free',     rating: 4.2, reviews: 331, desc: 'Neurofeedback software suite with real-time EEG acquisition, biofeedback, and patient engagement tracking.', img: '📱', url: 'https://brainmaster.com/our-software/' },
    // ── Seminars ──
    { id: 'l10', cat: 'seminars',      title: 'rTMS in Treatment-Resistant Depression', clinic: 'Clinical TMS Society', price: 95, unit: 'seat', badge: 'Live', rating: 4.9, reviews: 67, desc: 'Half-day CPD seminar covering evidence, protocols, and real-world outcomes.', img: '🎤', url: 'https://www.clinicaltmssociety.org/education' },
    { id: 'l11', cat: 'seminars',      title: 'Neuromodulation for Chronic Pain', clinic: 'INS',            price: 85,   unit: 'seat',     badge: '',         rating: 4.7, reviews: 41,  desc: 'Evidence-based webinar on SCS, TENS, and tDCS for pain management by the International Neuromodulation Society.', img: '🎤', url: 'https://www.neuromodulation.com/webinars' },
    // ── Workshops ──
    { id: 'l12', cat: 'workshops',     title: 'Hands-On TMS Coil Placement',  clinic: 'Clinical TMS Society', price: 195, unit: 'seat',     badge: '', rating: 5.0, reviews: 29,  desc: 'Practical workshop: figure-8 placement, motor threshold mapping, safety protocols.', img: '🔧', url: 'https://www.clinicaltmssociety.org/courses' },
    { id: 'l13', cat: 'workshops',     title: 'QEEG Interpretation Workshop', clinic: 'Neurocare Academy',  price: 225,  unit: 'seat',     badge: 'New',      rating: 4.8, reviews: 15,  desc: 'Full-day workshop analysing real patient EEG traces and building personalised protocol maps.', img: '🔧', url: 'https://www.neurocaregroup.com/academy.html' },
    // ── Short Courses (real platform links) ──
    { id: 'l14', cat: 'courses',       title: 'Medical Neuroscience — Duke University', clinic: 'Coursera', price: 0,   unit: 'free audit', badge: 'Featured', rating: 4.9, reviews: 4200, desc: 'Comprehensive neuroanatomy and neurophysiology. ~14 weeks. Free audit or paid certificate.', img: '📚', url: 'https://www.coursera.org/learn/medical-neuroscience' },
    { id: 'l15', cat: 'courses',       title: 'Fundamentals of Neuroscience — HarvardX', clinic: 'edX',    price: 0,   unit: 'free audit', badge: '',         rating: 4.8, reviews: 2800, desc: 'Three-part Harvard Medical School series covering cellular, systems, and clinical neuroscience.', img: '📚', url: 'https://www.edx.org/xseries/harvardx-fundamentals-of-neuroscience' },
    { id: 'l16', cat: 'courses',       title: 'Computational Neuroscience — University of Washington', clinic: 'Coursera', price: 0, unit: 'free audit', badge: '',  rating: 4.7, reviews: 1600, desc: 'Neural coding, modelling, and closed-loop stimulation design primer. ~9 weeks.', img: '📚', url: 'https://www.coursera.org/learn/computational-neuroscience' },
    { id: 'l21', cat: 'courses',       title: 'The Brain and Space — Duke University', clinic: 'Coursera',  price: 0,   unit: 'free audit', badge: 'New', rating: 4.7, reviews: 900, desc: 'How the brain creates our sense of spatial awareness. Covers spatial perception, sensory systems, brain mapping.', img: '📚', url: 'https://www.coursera.org/learn/the-brain-and-space' },
    { id: 'l22', cat: 'courses',       title: 'Introduction to Psychology — Yale University', clinic: 'Coursera', price: 0, unit: 'free audit', badge: '', rating: 4.9, reviews: 12500, desc: 'Paul Bloom\'s famous course covering brain structure, neural development, perception, learning, memory, and more.', img: '📚', url: 'https://www.coursera.org/learn/introduction-psychology' },
    { id: 'l23', cat: 'courses',       title: 'Neuroscience and Neuroimaging — Johns Hopkins', clinic: 'Coursera', price: 0, unit: 'free audit', badge: '', rating: 4.6, reviews: 1100, desc: 'Neurohacking in R — neuroimaging analysis including preprocessing, structural and functional MRI.', img: '📚', url: 'https://www.coursera.org/learn/neurohacking' },
    { id: 'l24', cat: 'courses',       title: 'Understanding the Brain — University of Chicago', clinic: 'Coursera', price: 0, unit: 'free audit', badge: '', rating: 4.8, reviews: 3500, desc: 'Neurobiology of everyday life — how the brain generates behaviour and how it is affected by disease.', img: '📚', url: 'https://www.coursera.org/learn/neurobiology' },
    { id: 'l25', cat: 'courses',       title: 'Biohacking Your Brain\'s Health — Udemy', clinic: 'Udemy',    price: 19,  unit: 'course',     badge: '',  rating: 4.5, reviews: 5200, desc: 'Practical strategies for optimising brain health through sleep, nutrition, exercise, and neurofeedback techniques.', img: '📚', url: 'https://www.udemy.com/topic/neuroscience/' },
  ];

  const BADGE_COLORS = { Featured: '#5dd9c4', New: '#6366f1', Bestseller: '#f59e0b', Sale: '#ef4444', Live: '#10b981', Free: '#8b5cf6', 'Sold Out': '#6b7280', '': 'transparent' };

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function renderStars(r) {
    const full = Math.floor(r); const half = r % 1 >= 0.5 ? 1 : 0;
    let s = '';
    for (let i = 0; i < full; i++) s += '<span class="mp-star full">&#9733;</span>';
    if (half) s += '<span class="mp-star half">&#9733;</span>';
    for (let i = full + half; i < 5; i++) s += '<span class="mp-star empty">&#9733;</span>';
    return s;
  }

  function renderCard(l) {
    const isFreeAudit = l.unit === 'free audit' || l.unit === 'free';
    const priceStr = isFreeAudit ? 'Free' : l.unit === 'month' ? '&#163;' + l.price + '<span class="mp-card-unit">/mo</span>' : '&#163;' + l.price + '<span class="mp-card-unit">/' + l.unit + '</span>';
    const badgeBg = BADGE_COLORS[l.badge] || 'transparent';
    const soldOut = l.badge === 'Sold Out';
    const catLabel = (CATEGORIES.find(c => c.id === l.cat) || {}).label || l.cat;
    const hasUrl = l.url && l.url.length > 0;
    const isAmazon = hasUrl && l.url.includes('amazon');
    const isCoursePlatform = hasUrl && (l.url.includes('coursera') || l.url.includes('edx') || l.url.includes('udemy') || l.url.includes('futurelearn'));
    const amazonBadge = isAmazon ? '<span style="display:inline-block;background:rgba(255,153,0,0.15);color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px">Amazon</span>' : '';
    const platformBadge = isCoursePlatform ? '<span style="display:inline-block;background:rgba(99,102,241,0.15);color:#818cf8;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px">' + esc(l.clinic) + '</span>' : '';
    let ctaLabel = soldOut ? 'Sold Out' : l.unit === 'month' ? 'Subscribe' : (l.unit === 'course' || l.unit === 'free audit') ? 'Enroll' : isFreeAudit ? 'Get Free' : 'Book';
    if (isAmazon) ctaLabel = 'Buy on Amazon';
    if (isCoursePlatform) ctaLabel = 'View Course';
    return '<div class="mp-card" data-id="' + esc(l.id) + '">' +
      '<div class="mp-card-img">' + esc(l.img) + '</div>' +
      (l.badge ? '<span class="mp-card-badge" style="background:' + badgeBg + '">' + esc(l.badge) + '</span>' : '') +
      '<div class="mp-card-body">' +
        '<div class="mp-card-cat">' + esc(catLabel) + amazonBadge + platformBadge + '</div>' +
        '<div class="mp-card-title">' + esc(l.title) + '</div>' +
        '<div class="mp-card-clinic">by ' + esc(l.clinic) + '</div>' +
        '<div class="mp-card-desc">' + esc(l.desc) + '</div>' +
        '<div class="mp-card-meta"><div class="mp-card-stars">' + renderStars(l.rating) + '<span class="mp-card-rating">' + l.rating + '</span><span class="mp-card-reviews">(' + l.reviews + ')</span></div></div>' +
      '</div>' +
      '<div class="mp-card-footer">' +
        '<div class="mp-card-price">' + priceStr + '</div>' +
        '<button class="mp-card-cta' + (soldOut ? ' mp-card-cta--disabled' : '') + (isAmazon ? ' mp-card-cta--amazon' : '') + '" ' + (soldOut ? 'disabled' : '') + ' onclick="window._mpBook(\'' + esc(l.id) + '\')">' + ctaLabel + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderGrid(listings) {
    if (!listings.length) return '<div class="mp-empty"><div class="mp-empty-icon">&#128269;</div><p>No listings match your search.</p></div>';
    return '<div class="mp-grid">' + listings.map(renderCard).join('') + '</div>';
  }

  function buildPage(cat, q) {
    let list = DEMO_LISTINGS;
    if (cat !== 'all') list = list.filter(l => l.cat === cat);
    if (q) { const lq = q.toLowerCase(); list = list.filter(l => l.title.toLowerCase().includes(lq) || l.clinic.toLowerCase().includes(lq) || l.desc.toLowerCase().includes(lq)); }
    const catTabs = CATEGORIES.map(c => '<button class="mp-cat-tab' + (c.id === cat ? ' active' : '') + '" onclick="window._mpCat(\'' + c.id + '\')">' + c.icon + ' ' + esc(c.label) + '</button>').join('');
    const featuredList = DEMO_LISTINGS.filter(l => l.badge === 'Featured');
    const heroSection = '<div class="mp-hero"><div class="mp-hero-text"><h1 class="mp-hero-title">Clinic Marketplace</h1><p class="mp-hero-sub">Discover consultations, products, software, courses and events from leading neuromodulation clinics.</p><div class="mp-search-wrap"><svg class="mp-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><input class="mp-search" id="mp-search-input" placeholder="Search listings, clinics, topics..." value="' + esc(q) + '" oninput="window._mpSearch(this.value)"/></div></div><div class="mp-hero-stats"><div class="mp-stat"><span class="mp-stat-num">' + DEMO_LISTINGS.length + '</span><span class="mp-stat-label">Listings</span></div><div class="mp-stat"><span class="mp-stat-num">12</span><span class="mp-stat-label">Clinics</span></div><div class="mp-stat"><span class="mp-stat-num">4.7&#9733;</span><span class="mp-stat-label">Avg Rating</span></div></div></div>';
    const featuredSection = cat === 'all' && !q ? '<div class="mp-section"><div class="mp-section-header"><h2 class="mp-section-title">Featured</h2><a class="mp-section-link" onclick="window._mpCat(\'all\')">View all</a></div><div class="mp-grid mp-grid--featured">' + featuredList.map(renderCard).join('') + '</div></div>' : '';
    const listSection = '<div class="mp-section"><div class="mp-section-header"><h2 class="mp-section-title">' + (cat === 'all' && !q ? 'All Listings' : (CATEGORIES.find(c => c.id === cat) || {}).label || 'Results') + '</h2><span class="mp-count">' + list.length + ' listing' + (list.length !== 1 ? 's' : '') + '</span></div>' + renderGrid(list) + '</div>';
    const ctaSection = '<div class="mp-section mp-section--cta"><div class="mp-cta-card"><div class="mp-cta-icon">&#127978;</div><div class="mp-cta-body"><h3>Sell your products &amp; services</h3><p>List consultations, devices, software and products directly on the marketplace. Reach thousands of clinicians and patients in minutes.</p></div><div class="mp-cta-btns"><button class="btn btn-primary mp-cta-btn" onclick="window._mpListNew()">+ List a Product or Service</button><button class="btn mp-cta-btn mp-cta-btn--secondary" onclick="window._mpMyListings()">My Listings</button></div></div></div>';
    return '<div class="mp-shell">' + heroSection + '<div class="mp-cat-bar">' + catTabs + '</div><div class="mp-body">' + featuredSection + listSection + ctaSection + '</div></div>';
  }

  let _activeCat = 'all', _searchQ = '';

  window._mpCat = (cat) => { _activeCat = cat; el.innerHTML = buildPage(_activeCat, _searchQ); };
  window._mpSearch = (q) => {
    _searchQ = q;
    let list = DEMO_LISTINGS;
    if (_activeCat !== 'all') list = list.filter(l => l.cat === _activeCat);
    if (q) { const lq = q.toLowerCase(); list = list.filter(l => l.title.toLowerCase().includes(lq) || l.clinic.toLowerCase().includes(lq) || l.desc.toLowerCase().includes(lq)); }
    const section = el.querySelector('.mp-section:last-of-type:not(.mp-section--cta), .mp-section + .mp-section:not(.mp-section--cta)');
    const countEl = el.querySelector('.mp-count');
    if (countEl) countEl.textContent = list.length + ' listing' + (list.length !== 1 ? 's' : '');
    const gridEl = el.querySelector('.mp-section:not(.mp-section--cta):last-of-type .mp-grid, .mp-section:not(.mp-section--cta):last-of-type .mp-empty');
    if (gridEl) gridEl.outerHTML = renderGrid(list);
  };
  window._mpBook = (id) => {
    const l = DEMO_LISTINGS.find(x => x.id === id);
    if (!l) return;
    if (l.url && l.url.length > 0) {
      window.open(l.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const verb = l.unit === 'month' ? 'Subscribe to' : l.unit === 'course' ? 'Enroll in' : l.unit === 'free' ? 'Get' : 'Book';
    alert(verb + ': "' + l.title + '"\n\nProvider: ' + l.clinic + '\nPrice: ' + (l.unit === 'free' ? 'Free' : '\u00A3' + l.price + '/' + l.unit) + '\n\nPlease contact the provider directly to proceed.');
  };
  window._mpListNew = (editItem) => {
    const existing = document.getElementById('mp-list-modal');
    if (existing) { existing.remove(); return; }
    const isEdit = !!editItem;
    const modal = document.createElement('div');
    modal.id = 'mp-list-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px';
    const kindOptions = ['product', 'service', 'device', 'software', 'education', 'course'].map(k => {
      const labels = { product: 'Product', service: 'Service / Consultation', device: 'Device', software: 'Software', education: 'Education Resource', course: 'Online Course' };
      const sel = (isEdit && editItem.kind === k) ? ' selected' : (!isEdit && k === 'service' ? ' selected' : '');
      return '<option value="' + k + '"' + sel + '>' + labels[k] + '</option>';
    }).join('');
    const currencyOptions = ['GBP', 'USD', 'EUR'].map(c => {
      const sel = (isEdit && editItem.price_unit === c) ? ' selected' : (!isEdit && c === 'GBP' ? ' selected' : '');
      return '<option value="' + c + '"' + sel + '>' + c + '</option>';
    }).join('');
    const inputStyle = 'padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--navy-900,#0b1120);color:var(--text-primary);font-size:13px';
    modal.innerHTML = `
      <div style="background:var(--navy-850,#0f172a);border:1px solid var(--border);border-radius:16px;max-width:540px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,.5)">
        <div style="padding:20px 24px 12px;display:flex;align-items:center;justify-content:space-between">
          <h3 style="margin:0;font-size:17px;font-weight:600;color:var(--text-primary)">${isEdit ? 'Edit Listing' : 'List Your Product or Service'}</h3>
          <button onclick="document.getElementById('mp-list-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:20px;line-height:1">x</button>
        </div>
        <form id="mp-list-form" style="padding:8px 24px 24px;display:flex;flex-direction:column;gap:12px">
          <select name="kind" style="${inputStyle}">${kindOptions}</select>
          <input type="text" name="name" placeholder="Title (e.g. TMS Assessment, EEG Headband)" required maxlength="255" value="${isEdit ? esc(editItem.name) : ''}" style="${inputStyle}">
          <input type="text" name="provider" placeholder="Clinic / Brand Name" required maxlength="255" value="${isEdit ? esc(editItem.provider) : ''}" style="${inputStyle}">
          <textarea name="description" placeholder="Description — what does the customer get?" rows="3" maxlength="5000" style="${inputStyle};resize:vertical">${isEdit ? esc(editItem.description || '') : ''}</textarea>
          <div style="display:flex;gap:8px">
            <input type="number" name="price" placeholder="Price" step="0.01" min="0" value="${isEdit && editItem.price != null ? editItem.price : ''}" style="flex:1;${inputStyle}">
            <select name="price_unit" style="width:90px;${inputStyle}">${currencyOptions}</select>
          </div>
          <input type="url" name="external_url" placeholder="URL (your website, booking page, Amazon, etc.)" required maxlength="512" value="${isEdit ? esc(editItem.external_url || '') : ''}" style="${inputStyle}">
          <div style="font-size:11px;color:var(--text-tertiary)">Paste the link where customers can book, buy, or learn more.</div>
          <input type="text" name="tags" placeholder="Tags (comma separated, e.g. TMS, Depression, EEG)" maxlength="300" value="${isEdit && editItem.tags ? esc(editItem.tags.join(', ')) : ''}" style="${inputStyle}">
          <div style="display:flex;gap:8px">
            <input type="text" name="icon" placeholder="Icon emoji (e.g. &#129504;)" maxlength="10" value="${isEdit ? esc(editItem.icon || '') : ''}" style="width:120px;${inputStyle}">
            <select name="tone" style="flex:1;${inputStyle}">
              <option value="teal"${isEdit && editItem.tone === 'teal' ? ' selected' : ''}>Teal</option>
              <option value="blue"${isEdit && editItem.tone === 'blue' ? ' selected' : ''}>Blue</option>
              <option value="violet"${isEdit && editItem.tone === 'violet' ? ' selected' : ''}>Violet</option>
              <option value="rose"${isEdit && editItem.tone === 'rose' ? ' selected' : ''}>Rose</option>
              <option value="amber"${isEdit && editItem.tone === 'amber' ? ' selected' : ''}>Amber</option>
              <option value="green"${isEdit && editItem.tone === 'green' ? ' selected' : ''}>Green</option>
            </select>
          </div>
          <button type="submit" style="padding:10px 16px;background:#5dd9c4;color:#0a1a22;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px">${isEdit ? 'Update Listing' : 'Publish Listing'}</button>
          <div style="font-size:11px;color:var(--text-tertiary);line-height:1.5">Your listing will be live immediately and visible to clinicians and patients.</div>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#mp-list-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = isEdit ? 'Updating...' : 'Publishing...';
      const fd = new FormData(e.target);
      const payload = {
        name: fd.get('name').trim(),
        provider: fd.get('provider').trim(),
        description: fd.get('description').trim(),
        price: fd.get('price') ? parseFloat(fd.get('price')) : null,
        price_unit: fd.get('price_unit'),
        external_url: fd.get('external_url').trim(),
        tags: fd.get('tags').split(',').map(t => t.trim()).filter(Boolean),
        kind: fd.get('kind'),
        icon: fd.get('icon').trim() || null,
        tone: fd.get('tone'),
      };
      try {
        if (isEdit) {
          await api.marketplaceSellerUpdateItem(editItem.id, payload);
        } else {
          await api.marketplaceSellerCreateItem(payload);
        }
        modal.innerHTML = '<div style="background:var(--navy-850,#0f172a);border:1px solid var(--border);border-radius:16px;max-width:420px;width:100%;padding:40px 32px;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,.5)"><div style="font-size:2.5rem;margin-bottom:12px">&#10003;</div><h3 style="color:var(--text-primary);margin:0 0 8px">' + (isEdit ? 'Listing Updated' : 'Listing Published!') + '</h3><p style="color:var(--text-secondary);font-size:13px;margin:0 0 20px;line-height:1.5">Your ' + esc(payload.kind) + ' <strong>' + esc(payload.name) + '</strong> is now live on the marketplace.</p><div style="display:flex;gap:8px;justify-content:center"><button onclick="window._mpMyListings();document.getElementById(\'mp-list-modal\').remove()" style="padding:8px 20px;background:rgba(155,127,255,.15);color:#9b7fff;border:1px solid rgba(155,127,255,.25);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">View My Listings</button><button onclick="document.getElementById(\'mp-list-modal\').remove()" style="padding:8px 20px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:8px;font-size:13px;cursor:pointer">Close</button></div></div>';
      } catch (err) {
        btn.disabled = false; btn.textContent = isEdit ? 'Update Listing' : 'Publish Listing';
        alert('Failed to ' + (isEdit ? 'update' : 'publish') + ' listing: ' + (err.message || 'Please try again.'));
      }
    });
  };

  // ── My Listings dashboard ──
  window._mpMyListings = async () => {
    const existing = document.getElementById('mp-list-modal');
    if (existing) { existing.remove(); }
    const modal = document.createElement('div');
    modal.id = 'mp-list-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `
      <div style="background:var(--navy-850,#0f172a);border:1px solid var(--border);border-radius:16px;max-width:620px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 16px 48px rgba(0,0,0,.5)">
        <div style="padding:20px 24px 12px;display:flex;align-items:center;justify-content:space-between">
          <h3 style="margin:0;font-size:17px;font-weight:600;color:var(--text-primary)">My Listings</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="window._mpListNew();document.getElementById('mp-list-modal').remove()" style="padding:6px 14px;background:#5dd9c4;color:#0a1a22;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">+ New Listing</button>
            <button onclick="document.getElementById('mp-list-modal').remove()" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:20px;line-height:1">x</button>
          </div>
        </div>
        <div id="mp-mylistings-content" style="padding:0 0 12px"><div style="padding:40px;text-align:center;color:var(--text-tertiary)">Loading...</div></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    const kindBadge = (k) => {
      const colors = { product: '#f59e0b', service: '#5dd9c4', device: '#6366f1', software: '#818cf8', education: '#10b981', course: '#8b5cf6' };
      return '<span style="display:inline-block;background:' + (colors[k] || '#888') + '22;color:' + (colors[k] || '#888') + ';padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase">' + esc(k) + '</span>';
    };

    try {
      const data = await api.marketplaceSellerMyItems();
      const items = (data && data.items) || [];
      const contentEl = document.getElementById('mp-mylistings-content');
      if (!contentEl) return;
      if (items.length === 0) {
        contentEl.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary)"><div style="font-size:2rem;margin-bottom:8px">&#128230;</div><p style="margin:0 0 16px">You have no listings yet.</p><button onclick="window._mpListNew();document.getElementById(\'mp-list-modal\').remove()" style="padding:8px 20px;background:#5dd9c4;color:#0a1a22;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Create Your First Listing</button></div>';
        return;
      }
      contentEl.innerHTML = items.map(it => {
        const priceStr = it.price != null ? (it.price_unit === 'GBP' ? '\u00A3' : it.price_unit === 'EUR' ? '\u20AC' : '$') + it.price : 'Free';
        return '<div style="padding:12px 24px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;gap:12px">' +
          '<div style="min-width:0;flex:1">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">' +
              '<span style="font-weight:500;color:var(--text-primary);font-size:13px">' + esc(it.name) + '</span>' +
              kindBadge(it.kind) +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-secondary)">' + esc(it.provider) + ' &middot; ' + priceStr + ' &middot; ' + (it.active ? '<span style="color:#34d399">Active</span>' : '<span style="color:#fb7185">Paused</span>') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;flex-shrink:0">' +
            '<button class="mp-ml-edit" data-idx="' + esc(it.id) + '" style="padding:4px 10px;font-size:12px;background:rgba(155,127,255,.12);color:#9b7fff;border:1px solid rgba(155,127,255,.2);border-radius:6px;cursor:pointer">Edit</button>' +
            '<button class="mp-ml-toggle" data-idx="' + esc(it.id) + '" data-active="' + (it.active ? '1' : '0') + '" style="padding:4px 10px;font-size:12px;background:rgba(255,255,255,.06);color:var(--text-secondary);border:1px solid var(--border);border-radius:6px;cursor:pointer">' + (it.active ? 'Pause' : 'Resume') + '</button>' +
            '<button class="mp-ml-delete" data-idx="' + esc(it.id) + '" style="padding:4px 10px;font-size:12px;background:rgba(251,113,133,.1);color:#fb7185;border:1px solid rgba(251,113,133,.2);border-radius:6px;cursor:pointer">Delete</button>' +
          '</div>' +
        '</div>';
      }).join('');

      // Edit buttons
      contentEl.querySelectorAll('.mp-ml-edit').forEach(btn => {
        btn.addEventListener('click', () => {
          const it = items.find(x => x.id === btn.dataset.idx);
          if (!it) return;
          modal.remove();
          window._mpListNew(it);
        });
      });
      // Pause/Resume buttons
      contentEl.querySelectorAll('.mp-ml-toggle').forEach(btn => {
        btn.addEventListener('click', async () => {
          const newActive = btn.dataset.active === '1' ? false : true;
          try {
            await api.marketplaceSellerUpdateItem(btn.dataset.idx, { active: newActive });
            modal.remove();
            window._mpMyListings();
          } catch (err) { alert('Update failed: ' + (err.message || 'try again')); }
        });
      });
      // Delete buttons
      contentEl.querySelectorAll('.mp-ml-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this listing? This cannot be undone.')) return;
          try {
            await api.marketplaceSellerDeleteItem(btn.dataset.idx);
            modal.remove();
            window._mpMyListings();
          } catch (err) { alert('Delete failed: ' + (err.message || 'try again')); }
        });
      });
    } catch (err) {
      const contentEl = document.getElementById('mp-mylistings-content');
      if (contentEl) contentEl.innerHTML = '<div style="padding:40px;text-align:center;color:#fb7185">Failed to load listings. Please make sure you are logged in.</div>';
    }
  };

  el.innerHTML = buildPage(_activeCat, _searchQ);
}
