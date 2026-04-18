// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-hubs.js — Hub/container pages (code-split)
// Patient Hub · Clinical Hub · Protocol Hub · Scheduling Hub · etc.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js';
import { tag, spinner, emptyState } from './helpers.js';
import { currentUser } from './auth.js';
import { renderBrainMap10_20 } from './brain-map-svg.js';
import { DOCUMENT_TEMPLATES, renderTemplate } from './documents-templates.js';

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

  // ── PATIENTS TAB ─────────────────────────────────────────────────────────
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

    // Enrich with course data
    const coursesByPat = {};
    courses.forEach(c => { if (c.patient_id) (coursesByPat[c.patient_id] = coursesByPat[c.patient_id] || []).push(c); });

    function patAttention(p) {
      if (p.outcome_trend === 'worsened' || p.has_adverse_event)  return { label:'⚠ Alert',      color:'var(--red)' };
      if (p.needs_review || p.review_overdue)                      return { label:'◉ Review',     color:'var(--amber)' };
      if (p.assessment_overdue || p.missing_assessment)            return { label:'✎ Assess Due', color:'var(--amber)' };
      if (p.home_adherence != null && p.home_adherence < 0.5)     return { label:Math.round(p.home_adherence*100)+'% adh', color:'var(--amber)' };
      return null;
    }

    const statusLabels = { active:'Active', paused:'Paused', completed:'Completed', discharged:'Discharged', inactive:'Inactive' };
    const statusColors = { active:'var(--teal)', paused:'var(--amber)', completed:'var(--green)', discharged:'var(--text-tertiary)', inactive:'var(--text-tertiary)' };

    const active  = patients.filter(p=>p.status==='active').length;
    const review  = patients.filter(p=>p.needs_review||p.review_overdue).length;
    const alerts  = patients.filter(p=>p.has_adverse_event||p.outcome_trend==='worsened').length;
    const assess  = patients.filter(p=>p.assessment_overdue||p.missing_assessment).length;

    // Cohorts
    const COHORTS = [
      { id:'all',     label:'All Patients',   fn: ()=>patients },
      { id:'active',  label:'Active',         fn: ()=>patients.filter(p=>p.status==='active') },
      { id:'review',  label:'Needs Review',   fn: ()=>patients.filter(p=>p.needs_review||p.review_overdue) },
      { id:'alerts',  label:'Alerts',         fn: ()=>patients.filter(p=>p.has_adverse_event||p.outcome_trend==='worsened') },
      { id:'assess',  label:'Assessment Due', fn: ()=>patients.filter(p=>p.assessment_overdue||p.missing_assessment) },
      { id:'inactive',label:'Inactive',       fn: ()=>patients.filter(p=>p.status==='inactive'||p.status==='paused') },
    ];

    window._phCohort = window._phCohort || 'all';
    window._phSearch = '';

    function renderPatientList(cohortId) {
      const cohort = COHORTS.find(c=>c.id===cohortId) || COHORTS[0];
      let list = cohort.fn();
      const q = (document.getElementById('ph-search')?.value||'').toLowerCase();
      if (q) list = list.filter(p=>((p.first_name||'')+' '+(p.last_name||'')).toLowerCase().includes(q)||(p.condition_slug||'').toLowerCase().includes(q));
      const out = document.getElementById('ph-list');
      if (!out) return;
      if (!list.length) { out.innerHTML = '<div class="ch-empty">No patients found.</div>'; return; }
      out.innerHTML = list.map(p => {
        const name = ((p.first_name||'') + ' ' + (p.last_name||'')).trim() || 'Unknown';
        const ini  = ((p.first_name||'')[0]||'') + ((p.last_name||'')[0]||'');
        const cond = (p.condition_slug||'').replace(/-/g,' ') || '—';
        const mod  = (p.primary_modality||'').replace(/-/g,' ') || '—';
        const attn = patAttention(p);
        const pcs  = coursesByPat[p.id] || [];
        const actC = pcs.filter(c=>c.status==='active').length;
        const stColor = statusColors[p.status] || 'var(--text-tertiary)';
        return '<div class="ph-patient-row" onclick="window._selectedPatientId=\'' + p.id + '\';window._profilePatientId=\'' + p.id + '\';window._nav(\'patient-profile\')">' +
          '<div class="ph-avatar">' + (ini||'?') + '</div>' +
          '<div class="ph-info">' +
            '<div class="ph-name">' + name + '</div>' +
            '<div class="ph-meta">' + cond + (mod&&mod!=='—'?' · '+mod:'') + '</div>' +
          '</div>' +
          '<div class="ph-badges">' +
            (actC ? '<span class="ph-badge ph-badge--course">' + actC + ' course' + (actC>1?'s':'') + '</span>' : '') +
            (attn ? '<span class="ph-badge" style="background:rgba(255,255,255,0.06);color:' + attn.color + ';border-color:' + attn.color + '20">' + attn.label + '</span>' : '') +
          '</div>' +
          '<span class="ph-status" style="color:' + stColor + '">' + (statusLabels[p.status]||p.status||'—') + '</span>' +
          '<svg class="ph-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>' +
        '</div>';
      }).join('');
    }

    window._phSetCohort = id => {
      window._phCohort = id;
      document.querySelectorAll('.ph-cohort-item').forEach(el => el.classList.toggle('active', el.dataset.cohort === id));
      renderPatientList(id);
    };

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ph-layout">
        <div class="ph-rail">
          <div class="ph-rail-label">Cohorts</div>
          ${COHORTS.map(c => '<div class="ph-cohort-item' + (window._phCohort===c.id?' active':'') + '" data-cohort="' + c.id + '" onclick="window._phSetCohort(\'' + c.id + '\')">' +
            '<span>' + c.label + '</span>' +
            '<span class="ph-cohort-count">' + c.fn().length + '</span>' +
          '</div>').join('')}
        </div>
        <div class="ph-main">
          <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
            <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${active}</div><div class="ch-kpi-label">Active</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${review}</div><div class="ch-kpi-label">Needs Review</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--red)"><div class="ch-kpi-val">${alerts}</div><div class="ch-kpi-label">Alerts</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${assess}</div><div class="ch-kpi-label">Assess Due</div></div>
          </div>
          <div class="ch-card" style="margin-bottom:0">
            <div class="ch-card-hd">
              <span class="ch-card-title">Patient Roster</span>
              <div style="position:relative;flex:1;max-width:280px">
                <input id="ph-search" type="text" placeholder="Search patients…" class="ph-search-input" oninput="window._phSetCohort(window._phCohort)">
                <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
            </div>
            <div id="ph-list"></div>
          </div>
        </div>
      </div>
    </div>`;

    renderPatientList(window._phCohort);
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

  // ── ASSESSMENTS TAB ──────────────────────────────────────────────────────
  if (tab === 'assessments') {
    setTopbar('Clinical Hub', '<button class="btn btn-primary btn-sm" onclick="window._chOpenAssignModal()">+ Assign Assessment</button>');
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

    const SCALE_DOMAINS = [
      { domain: 'Depression', color: 'var(--blue)',   scales: ['PHQ-9','PHQ-2','MADRS','HAM-D','QIDS-SR'] },
      { domain: 'Anxiety',    color: 'var(--teal)',   scales: ['GAD-7','GAD-2','HAM-A','PSWQ','SPIN'] },
      { domain: 'Trauma',     color: 'var(--violet)', scales: ['PCL-5','CAPS-5','IES-R'] },
      { domain: 'Psychosis',  color: 'var(--red)',    scales: ['PANSS','BPRS','CGI'] },
      { domain: 'Cognitive',  color: 'var(--amber)',  scales: ['MoCA','MMSE'] },
      { domain: 'Sleep',      color: 'var(--green)',  scales: ['ISI','PSQI','ESS'] },
      { domain: 'Safety',     color: 'var(--red)',    scales: ['C-SSRS','SBQ-R'] },
      { domain: 'Neuromod',   color: 'var(--teal)',   scales: ['TMS-SE','tDCS-CS'] },
    ];

    const patOpts = patients.map(p =>
      '<option value="' + p.id + '">' + ((p.first_name||'') + ' ' + (p.last_name||'')).trim() + ' — ' + ((p.condition_slug||'').replace(/-/g,' ')||'No condition') + '</option>'
    ).join('') || '<option value="">No patients found</option>';

    const _seedA = [
      { scale:'PHQ-9', phase:'Weekly',      status:'due',       due:'Today',      score:null },
      { scale:'GAD-7', phase:'Baseline',    status:'completed', due:'3 days ago', score:12   },
      { scale:'C-SSRS',phase:'Pre-session', status:'due',       due:'Tomorrow',   score:null },
      { scale:'MoCA',  phase:'Milestone',   status:'upcoming',  due:'In 5 days',  score:null },
      { scale:'PCL-5', phase:'Baseline',    status:'completed', due:'1 week ago', score:38   },
    ];

    const sPill = s => '<span class="ch-assess-pill ch-pill--' + (s==='due'?'due':s==='completed'?'done':'upcoming') + '">' + (s==='due'?'Due':s==='completed'?'Done':'Upcoming') + '</span>';

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="ch-kpi-strip">
          <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${_seedA.filter(a=>a.status==='due').length}</div><div class="ch-kpi-label">Due Now</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${_seedA.filter(a=>a.status==='completed').length}</div><div class="ch-kpi-label">Completed</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${patients.length}</div><div class="ch-kpi-label">Patients</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${courses.filter(c=>c.status==='active').length}</div><div class="ch-kpi-label">Active Courses</div></div>
        </div>
        <div class="ch-two-col">
          <div class="ch-card">
            <div class="ch-card-hd">
              <span class="ch-card-title">Assessment Queue</span>
              <select class="ch-select" id="ch-pat-filter"><option value="">All Patients</option>${patOpts}</select>
            </div>
            <div id="ch-queue-list">
              ${_seedA.map(a => `<div class="ch-assess-row">
                <div class="ch-assess-info">
                  <span class="ch-assess-scale">${a.scale}</span>
                  <span class="ch-assess-phase">${a.phase}</span>
                  ${a.score!=null ? '<span class="ch-assess-score">Score: <strong>'+a.score+'</strong></span>' : ''}
                </div>
                <div class="ch-assess-meta">
                  <span class="ch-assess-date">${a.due}</span>
                  ${sPill(a.status)}
                  ${a.status!=='completed' ? '<button class="ch-btn-sm ch-btn-teal">Start</button>' : '<button class="ch-btn-sm">View</button>'}
                </div>
              </div>`).join('')}
            </div>
          </div>
          <div class="ch-card">
            <div class="ch-card-hd">
              <span class="ch-card-title">Scale Library</span>
              <button class="ch-btn-sm ch-btn-teal" onclick="window._chOpenAssignModal()">+ Assign</button>
            </div>
            <div class="ch-scale-domains">
              ${SCALE_DOMAINS.map(d => `<div class="ch-domain-row">
                <div class="ch-domain-label" style="--domain-color:${d.color}">${d.domain}</div>
                <div class="ch-domain-scales">${d.scales.map(s=>'<span class="ch-scale-chip">'+s+'</span>').join('')}</div>
              </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="ch-assign-modal" class="ch-modal-overlay ch-hidden">
      <div class="ch-modal">
        <div class="ch-modal-hd"><span>Assign Assessment</span><button class="ch-modal-close" onclick="document.getElementById('ch-assign-modal').classList.add('ch-hidden')">✕</button></div>
        <div class="ch-modal-body">
          <div class="ch-form-group"><label class="ch-label">Patient</label><select class="ch-select ch-select--full" id="ch-assign-patient">${patOpts}</select></div>
          <div class="ch-form-group"><label class="ch-label">Scale</label>
            <select class="ch-select ch-select--full" id="ch-assign-scale">${SCALE_DOMAINS.flatMap(d=>d.scales).map(s=>'<option>'+s+'</option>').join('')}</select>
          </div>
          <div class="ch-form-group"><label class="ch-label">Phase</label>
            <select class="ch-select ch-select--full" id="ch-assign-phase"><option>Baseline</option><option>Weekly</option><option>Pre-session</option><option>Post-session</option><option>Milestone</option><option>Discharge</option></select>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px">
            <button class="btn btn-primary" onclick="window._chAssign()">Assign</button>
            <button class="btn" onclick="document.getElementById('ch-assign-modal').classList.add('ch-hidden')">Cancel</button>
          </div>
        </div>
      </div>
    </div>`;

    window._chOpenAssignModal = () => document.getElementById('ch-assign-modal')?.classList.remove('ch-hidden');
    window._chAssign = () => {
      const scale = document.getElementById('ch-assign-scale')?.value;
      const phase = document.getElementById('ch-assign-phase')?.value;
      window._dsToast?.({ title: 'Assigned', body: scale + ' (' + phase + ') assigned.', severity: 'success' });
      document.getElementById('ch-assign-modal')?.classList.add('ch-hidden');
    };
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
// pgProtocolHub — Protocol Intelligence: Search · Brain Map · Registry · Handbooks · Builder
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgProtocolHub(setTopbar, navigate) {
  // Legacy redirect: the old standalone "Brain Map" tab was merged into Registry.
  if (window._protocolHubTab === 'brainmap') window._protocolHubTab = 'registry';

  // Legacy redirect: Personalised + Brain Scan AI + Builder merged into a
  // single "Protocol Designer" tab with a 3-mode segmented control. Preserve
  // which mode the user was on so deep links still land in the right place.
  if (['personalized', 'brainscan', 'builder'].includes(window._protocolHubTab)) {
    window._designerMode = (
      window._protocolHubTab === 'personalized' ? 'patient' :
      window._protocolHubTab === 'brainscan'    ? 'brainscan' : 'scratch'
    );
    window._protocolHubTab = 'designer';
  }

  const tab = window._protocolHubTab || 'search';
  window._protocolHubTab = tab;

  // Lazy-load protocol data
  let _protos = [], _conditions = [], _devices = [], _searchFn = null;
  try {
    const pd = await import('./protocols-data.js');
    _protos     = pd.PROTOCOL_LIBRARY || [];
    _conditions = pd.CONDITIONS       || [];
    _devices    = pd.DEVICES          || [];
    _searchFn   = pd.searchProtocols  || null;
  } catch {}

  // Standard 10-20 electrode IDs — distinguishes real sites from region
  // labels like "mPFC" (those become target-region overlays instead).
  const STD_10_20 = ['Fp1','Fp2','F7','F3','Fz','F4','F8','T7','C3','Cz','C4','T8','P7','P3','Pz','P4','P8','O1','Oz','O2'];

  // Featured montages (quick-picks) rendered at the top of the merged
  // Registry & Brain Map tab. Kept in sync with the old brain map tab.
  const MONTAGES = [
    { id:'tms-mdd-l',    label:'TMS — Left DLPFC Depression',        anode:'F3', cathode:'',   targetRegion:'DLPFC-L', condition:'MDD',  device:'TMS',  ev:'A', notes:'Left DLPFC (F3 approximation). 10 Hz, 120% MT, 3000 pulses/session. 30 sessions.' },
    { id:'tms-mdd-ithf', label:'TMS — Theta Burst (iTBS) Depression', anode:'F3', cathode:'',   targetRegion:'DLPFC-L', condition:'TRD',  device:'TMS',  ev:'A', notes:'Intermittent TBS. 600 pulses in 3 min. 10× faster than standard TMS.' },
    { id:'tms-ocd',      label:'TMS — Deep TMS OCD',                  anode:'Fz', cathode:'',   targetRegion:'mPFC',    condition:'OCD',  device:'TMS',  ev:'A', notes:'Deep TMS H7 coil, medial PFC. FDA-cleared for OCD.' },
    { id:'tdcs-mdd',     label:'tDCS — Anodal DLPFC Depression',      anode:'F3', cathode:'F4', targetRegion:'DLPFC-L', condition:'MDD',  device:'tDCS', ev:'B', notes:'Anode F3, Cathode F4. 2 mA, 30 min. 20 sessions.' },
    { id:'tdcs-ptsd',    label:'tDCS — Prefrontal PTSD',              anode:'F3', cathode:'F4', targetRegion:'DLPFC-L', condition:'PTSD', device:'tDCS', ev:'B', notes:'Bilateral prefrontal. 2 mA, 20 min.' },
    { id:'nfb-alpha',    label:'Neurofeedback — Alpha/Theta Anxiety', anode:'Pz', cathode:'',   targetRegion:null,      condition:'GAD',  device:'EEG',  ev:'B', notes:'Alpha/theta uptraining at Pz. 30-40 sessions.' },
    { id:'nfb-smr',      label:'Neurofeedback — SMR ADHD',            anode:'C3', cathode:'',   targetRegion:null,      condition:'ADHD', device:'EEG',  ev:'B', notes:'SMR uptraining at C3/Cz. 40 sessions.' },
  ];

  // Heuristic electrode inference for registry protocols (not in MONTAGES).
  // Scans protocol name + summary for common 10-20 patterns, with a device-
  // based fallback.
  function inferElectrodes(p) {
    const name = (p?.name || '').toLowerCase();
    const summary = (p?.summary || '').toLowerCase();
    const blob = name + ' ' + summary;
    if (/anode\s*f3[\s\S]*cathode\s*f4/i.test(blob)) return { anode:'F3', cathode:'F4', targetRegion:'DLPFC-L' };
    if (/left dlpfc|\bf3\b/i.test(blob)) return { anode:'F3', targetRegion:'DLPFC-L' };
    if (/right dlpfc|\bf4\b/i.test(blob)) return { anode:'F4', targetRegion:'DLPFC-R' };
    if (/vertex|\bcz\b/i.test(blob))      return { anode:'Cz' };
    if (/occipital|\bo1\b|\bo2\b|\boz\b/i.test(blob)) return { anode:'Oz', targetRegion:'V1' };
    if (/alpha.?theta|\bpz\b/i.test(blob)) return { anode:'Pz' };
    if (/\bsmr\b|\bc3\b|\bc4\b/i.test(blob)) return { anode:'C3' };
    if (/mpfc|medial pfc|\bfz\b/i.test(blob)) return { anode:'Fz', targetRegion:'mPFC' };
    // Device-based fallback
    if (p?.device === 'tms' || p?.device === 'deep_tms') return { anode:'F3', targetRegion:'DLPFC-L' };
    if (p?.device === 'tdcs') return { anode:'F3', cathode:'F4', targetRegion:'DLPFC-L' };
    if (p?.device === 'eeg')  return { anode:'Cz' };
    return { anode: null };
  }

  const TAB_META = {
    search:       { label: 'Protocol Search',      color: 'var(--teal)'   },
    registry:     { label: 'Registry & Brain Map', color: 'var(--blue)'   },
    handbooks:    { label: 'Handbooks',             color: 'var(--amber)'  },
    designer:     { label: 'Protocol Designer',     color: 'var(--violet)' },
  };

  const el = document.getElementById('content');

  function tabBar() {
    return Object.entries(TAB_META).map(([id, m]) =>
      '<button class="ch-tab' + (tab === id ? ' ch-tab--active' : '') + '"' +
      (tab === id ? ' style="--tab-color:' + m.color + '"' : '') +
      ' onclick="window._protocolHubTab=\'' + id + '\';window._nav(\'protocol-hub\')">' + m.label + '</button>'
    ).join('');
  }

  // ── PROTOCOL SEARCH TAB ─────────────────────────────────────────────────
  if (tab === 'search') {
    setTopbar('Protocols', '<button class="btn btn-sm ch-btn-teal" onclick="window._nav(\'protocol-search-full\')">Full View ↗</button>');
    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    window._phSearchQ    = window._phSearchQ    || '';
    window._phSearchCond = window._phSearchCond || '';
    window._phSearchDev  = window._phSearchDev  || '';
    window._phSearchEv   = window._phSearchEv   || '';

    // Cross-page context handoff (one-shot). Library Find Protocol sets
    // window._protocolHubCondition = { id, name }. Registry IDs do not
    // match protocols-data slugs, so we reconcile by label/shortLabel and
    // fall back to a free-text query. The handoff is consumed on first
    // read so later revisits do not silently re-filter.
    let _preselectLabel = null;
    const _handoff = window._protocolHubCondition;
    if (_handoff && (_handoff.id || _handoff.name)) {
      const needle = String(_handoff.name || '').toLowerCase().trim();
      const match = _conditions.find(c =>
        (c.label || '').toLowerCase() === needle ||
        (c.shortLabel || '').toLowerCase() === needle ||
        (c.id || '').toLowerCase() === String(_handoff.id || '').toLowerCase()
      );
      if (match) { window._phSearchCond = match.id; _preselectLabel = match.label || match.id; }
      else if (_handoff.name) { window._phSearchQ = _handoff.name; _preselectLabel = _handoff.name + ' (name match)'; }
      window._protocolHubCondition = null;
    }

    const condOpts = ['', ..._conditions.map(c => c.id)].map(id =>
      '<option value="' + id + '"' + (id === window._phSearchCond ? ' selected' : '') + '>' +
      (id ? (_conditions.find(c=>c.id===id)?.label||id) : 'All Conditions') + '</option>'
    ).join('');
    const devOpts = ['', ..._devices.map(d => d.id)].map(id =>
      '<option value="' + id + '"' + (id === window._phSearchDev ? ' selected' : '') + '>' +
      (id ? (_devices.find(d=>d.id===id)?.label||id) : 'All Devices') + '</option>'
    ).join('');

    const evColors = { A:'var(--teal)', B:'var(--blue)', C:'var(--amber)', D:'var(--text-tertiary)', E:'var(--text-tertiary)' };

    function runSearch() {
      const q    = document.getElementById('ph-search-q')?.value    || '';
      const cond = document.getElementById('ph-search-cond')?.value || '';
      const dev  = document.getElementById('ph-search-dev')?.value  || '';
      const ev   = document.getElementById('ph-search-ev')?.value   || '';
      window._phSearchQ = q; window._phSearchCond = cond; window._phSearchDev = dev; window._phSearchEv = ev;

      let results = _protos;
      if (_searchFn && q) {
        try { results = _searchFn(q) || results; } catch {}
      }
      if (q && !_searchFn) results = results.filter(p => (p.name||'').toLowerCase().includes(q.toLowerCase()) || (p.conditionId||'').toLowerCase().includes(q.toLowerCase()));
      if (cond) results = results.filter(p => p.conditionId === cond);
      if (dev)  results = results.filter(p => p.device === dev);
      if (ev)   results = results.filter(p => p.evidenceGrade === ev);

      const out = document.getElementById('ph-search-results');
      if (!out) return;
      const cnt = document.getElementById('ph-search-count');
      if (cnt) cnt.textContent = results.length + ' protocols';

      if (!results.length) { out.innerHTML = '<div class="ch-empty">No protocols match. Try different filters.</div>'; return; }

      out.innerHTML = results.slice(0, 40).map(p => {
        const cond = _conditions.find(c=>c.id===p.conditionId);
        const dev  = _devices.find(d=>d.id===p.device);
        const evC  = evColors[p.evidenceGrade] || 'var(--text-tertiary)';
        return '<div class="ph-proto-card" onclick="window._protDetailId=\'' + (p.id||'') + '\';window._nav(\'protocol-detail\')">' +
          '<div class="ph-proto-top">' +
            '<span class="ph-proto-name">' + (p.name||'Protocol') + '</span>' +
            '<span class="ph-proto-ev" style="color:' + evC + ';border-color:' + evC + '44">Ev. ' + (p.evidenceGrade||'?') + '</span>' +
          '</div>' +
          '<div class="ph-proto-meta">' +
            '<span class="ph-proto-cond">' + (cond?.label||p.conditionId||'—') + '</span>' +
            '<span class="ph-proto-sep">·</span>' +
            '<span class="ph-proto-dev">' + (dev?.label||p.device||'—') + '</span>' +
            (p.sessions ? '<span class="ph-proto-sep">·</span><span class="ph-proto-sessions">' + p.sessions + ' sessions</span>' : '') +
          '</div>' +
          (p.summary ? '<div class="ph-proto-summary">' + p.summary.slice(0,120) + (p.summary.length>120?'…':'') + '</div>' : '') +
        '</div>';
      }).join('');
    }

    window._phRunSearch = runSearch;
    window._phClearCondHandoff = () => { window._phSearchCond = ''; window._phSearchQ = ''; window._nav('protocol-hub'); };
    const _escPh = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const preselectBanner = _preselectLabel
      ? '<div class="ph-preselect" role="note" style="margin:0 0 10px;padding:8px 12px;border-radius:6px;background:rgba(0,212,188,0.08);border:1px solid rgba(0,212,188,0.25);font-size:12px;color:var(--text-secondary);display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<span>Filtered to <b>' + _escPh(_preselectLabel) + '</b> from Library</span>' +
        '<button class="ch-btn-sm" onclick="window._phClearCondHandoff()" style="margin-left:auto">Clear</button>' +
      '</div>'
      : '';

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        ${preselectBanner}
        <div class="ph-search-bar">
          <div style="position:relative;flex:1;min-width:200px">
            <input id="ph-search-q" type="text" placeholder="Search protocols, conditions, devices…" class="ph-search-input" style="padding-left:32px" value="${_escPh(window._phSearchQ)}" oninput="window._phRunSearch()">
            <svg viewBox="0 0 24 24" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:14px;height:14px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <select id="ph-search-cond" class="ch-select" onchange="window._phRunSearch()">${condOpts}</select>
          <select id="ph-search-dev"  class="ch-select" onchange="window._phRunSearch()">${devOpts}</select>
          <select id="ph-search-ev"   class="ch-select" onchange="window._phRunSearch()">
            <option value="">All Evidence</option>
            <option value="A"${window._phSearchEv==="A"?" selected":""}>Grade A</option>
            <option value="B"${window._phSearchEv==="B"?" selected":""}>Grade B</option>
            <option value="C"${window._phSearchEv==="C"?" selected":""}>Grade C</option>
          </select>
          <span id="ph-search-count" style="font-size:12px;color:var(--text-tertiary);white-space:nowrap">${_protos.length} protocols</span>
        </div>
        <div id="ph-search-results" class="ph-proto-grid"></div>
      </div>
    </div>`;

    runSearch();
  }

  // ── REGISTRY & BRAIN MAP TAB (merged) ─────────────────────────────────────
  else if (tab === 'registry') {
    setTopbar('Protocols', '<button class="btn btn-sm" onclick="window._nav(\'protocol-search-full\')">Full Search ↗</button>');

    const MODS = ['All', ...new Set(_protos.map(p=>p.device).filter(Boolean).map(id=>_devices.find(d=>d.id===id)?.label||id))];
    window._regProtoMod = window._regProtoMod || 'All';
    window._regProtoQ   = window._regProtoQ   || '';
    window._regSelectedId = window._regSelectedId || MONTAGES[0].id;
    window._regElectrodeFilter = window._regElectrodeFilter || null;

    const evC = { A:'var(--teal)', B:'var(--blue)', C:'var(--amber)', D:'var(--text-tertiary)', E:'var(--text-tertiary)' };
    const _esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    // Build a "selection descriptor" for either a montage or a registry protocol.
    function getSelection(id) {
      const m = MONTAGES.find(x => x.id === id);
      if (m) {
        return {
          kind: 'montage',
          id: m.id,
          name: m.label,
          condition: m.condition,
          device: m.device,
          evidenceGrade: m.ev,
          sessions: null,
          anode: m.anode || null,
          cathode: m.cathode || null,
          targetRegion: m.targetRegion || null,
          summary: m.notes || '',
          protoId: null,
        };
      }
      const p = _protos.find(x => x.id === id);
      if (p) {
        const cond = _conditions.find(c=>c.id===p.conditionId);
        const dev  = _devices.find(d=>d.id===p.device);
        const inferred = inferElectrodes(p);
        return {
          kind: 'protocol',
          id: p.id,
          name: p.name || 'Protocol',
          condition: cond?.label || p.conditionId || '—',
          device: dev?.label || p.device || '—',
          evidenceGrade: p.evidenceGrade || '?',
          sessions: p.sessions || null,
          anode: inferred.anode || null,
          cathode: inferred.cathode || null,
          targetRegion: inferred.targetRegion || null,
          summary: p.summary || '',
          protoId: p.id,
        };
      }
      // Fallback to first montage if id unknown (e.g. after filter clears list).
      const f = MONTAGES[0];
      return {
        kind: 'montage', id: f.id, name: f.label, condition: f.condition,
        device: f.device, evidenceGrade: f.ev, sessions: null,
        anode: f.anode || null, cathode: f.cathode || null,
        targetRegion: f.targetRegion || null, summary: f.notes || '', protoId: null,
      };
    }

    function renderBrainPanel() {
      const sel = getSelection(window._regSelectedId);
      const anode   = sel.anode   && STD_10_20.indexOf(sel.anode)   !== -1 ? sel.anode   : null;
      const cathode = sel.cathode && STD_10_20.indexOf(sel.cathode) !== -1 ? sel.cathode : null;
      const svgHtml = renderBrainMap10_20({
        anode,
        cathode,
        targetRegion: sel.targetRegion || null,
        size: 360,
        showZones: true,
        showConnection: true,
        showEarsAndNose: true,
      });
      const wrap = document.getElementById('reg-bmp-svg');
      if (wrap) {
        wrap.innerHTML = svgHtml;
        // Electrode-click → filter registry by that site.
        wrap.querySelectorAll('[data-site]').forEach(el => {
          el.style.cursor = 'pointer';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            window._regSetSiteFilter(el.dataset.site);
          });
        });
        // Reflect current filter with a subtle outline on the filtered chip.
        if (window._regElectrodeFilter) {
          const fSite = wrap.querySelector('[data-site="' + window._regElectrodeFilter + '"] .ds-bm-chip');
          if (fSite) {
            fSite.setAttribute('stroke', '#4a9eff');
            fSite.setAttribute('stroke-width', '3');
          }
        }
      }

      const evc = evC[sel.evidenceGrade] || 'var(--text-tertiary)';
      const detail = document.getElementById('reg-bmp-detail');
      if (detail) {
        const fullDetailBtn = sel.protoId
          ? `<button class="ch-btn-sm" onclick="window._protDetailId='${_esc(sel.protoId)}';window._nav('protocol-detail')">Full detail ↗</button>`
          : '';
        detail.innerHTML = `
          <div class="bmp-montage-name">${_esc(sel.name)}</div>
          <div class="bmp-badges">
            <span class="bmp-badge">${_esc(sel.condition)}</span>
            <span class="bmp-badge">${_esc(sel.device)}</span>
            <span class="bmp-badge" style="color:${evc}">Evidence ${_esc(sel.evidenceGrade)}</span>
            ${sel.sessions ? '<span class="bmp-badge">'+_esc(sel.sessions)+' sessions</span>' : ''}
            ${sel.anode   ? '<span class="bmp-badge bmp-badge--anode">+ '+_esc(sel.anode)+'</span>' : ''}
            ${sel.cathode ? '<span class="bmp-badge bmp-badge--cathode">− '+_esc(sel.cathode)+'</span>' : ''}
            ${sel.targetRegion ? '<span class="bmp-badge">◎ '+_esc(sel.targetRegion)+'</span>' : ''}
          </div>
          ${sel.summary ? '<div class="bmp-notes">'+_esc(sel.summary)+'</div>' : ''}
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="ch-btn-sm ch-btn-teal" onclick="window._patientHubTab='prescriptions';window._nav('patients-hub')">Prescribe →</button>
            ${fullDetailBtn}
          </div>`;
      }

      // Reflect active state on list rows and featured montages.
      document.querySelectorAll('.reg-bmp-row').forEach(r =>
        r.classList.toggle('active', r.dataset.id === window._regSelectedId));
      document.querySelectorAll('.bmp-montage-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.id === window._regSelectedId));
    }

    function renderProtoReg() {
      const q   = (document.getElementById('reg-proto-q')?.value || '').toLowerCase();
      const mod = window._regProtoMod;
      const siteFilter = window._regElectrodeFilter;
      window._regProtoQ = q;
      const filtered = _protos.filter(p => {
        const devLabel = _devices.find(d=>d.id===p.device)?.label||p.device||'';
        const matchM = mod==='All' || devLabel===mod;
        const matchQ = !q || (p.name||'').toLowerCase().includes(q) || (p.conditionId||'').toLowerCase().includes(q);
        if (!matchM || !matchQ) return false;
        if (siteFilter) {
          const inf = inferElectrodes(p);
          if (inf.anode !== siteFilter && inf.cathode !== siteFilter) return false;
        }
        return true;
      });

      const out = document.getElementById('reg-proto-list');
      if (!out) return;
      const cnt = document.getElementById('reg-proto-count');
      if (cnt) cnt.textContent = filtered.length + ' protocols' + (siteFilter ? ' @ ' + siteFilter : '');

      const chipEl = document.getElementById('reg-site-filter-chip');
      if (chipEl) chipEl.innerHTML = siteFilter
        ? '<span class="reg-site-chip">◉ Site: <b>' + _esc(siteFilter) + '</b>'
          + '<button class="reg-site-chip-clear" onclick="window._regSetSiteFilter(null)" aria-label="Clear electrode filter" title="Clear filter">×</button></span>'
        : '';

      out.innerHTML = filtered.slice(0,50).map(p => {
        const cond = _conditions.find(c=>c.id===p.conditionId);
        const dev  = _devices.find(d=>d.id===p.device);
        const evc  = evC[p.evidenceGrade]||'var(--text-tertiary)';
        const active = p.id === window._regSelectedId ? ' active' : '';
        return '<div class="reg-row reg-bmp-row' + active + '" data-id="' + _esc(p.id||'') + '" onclick="window._regSelect(\'' + _esc(p.id||'') + '\')" style="cursor:pointer">' +
          '<div class="reg-row-top">' +
            '<span class="reg-name">' + _esc(p.name||'Protocol') + '</span>' +
            '<span class="reg-ev" style="color:'+evc+';border-color:'+evc+'44">Ev. '+_esc(p.evidenceGrade||'?')+'</span>' +
            '<span class="reg-type">'+_esc(dev?.label||p.device||'—')+'</span>' +
            '<span class="reg-domain" style="margin-left:auto">'+_esc(cond?.label||p.conditionId||'—')+'</span>' +
          '</div>' +
          (p.summary ? '<div class="reg-full">' + _esc(p.summary.slice(0,120)) + (p.summary.length>120?'…':'') + '</div>' : '') +
          '<div class="reg-meta">' +
            (p.sessions ? '<span>'+_esc(p.sessions)+' sessions</span>' : '') +
            (p.governance?.length ? '<span>⚖ Governance</span>' : '') +
          '</div>' +
        '</div>';
      }).join('') || '<div class="ch-empty">No protocols found.</div>';
    }

    window._regSelect = id => {
      window._regSelectedId = id;
      renderBrainPanel();
    };
    window._regSetSiteFilter = site => {
      window._regElectrodeFilter = (site === window._regElectrodeFilter) ? null : (site || null);
      renderProtoReg();
      renderBrainPanel();
    };
    window._regProtoSetMod = m => {
      window._regProtoMod = m;
      document.querySelectorAll('.reg-mod-pill').forEach(b=>b.classList.toggle('active', b.dataset.mod===m));
      renderProtoReg();
      renderBrainPanel();
    };
    window._regProtoSearch = () => { renderProtoReg(); renderBrainPanel(); };

    const featuredHtml = MONTAGES.map(m =>
      '<button class="bmp-montage-btn ph-cohort-item' + (m.id===window._regSelectedId?' active':'') + '" data-id="' + _esc(m.id) + '" onclick="window._regSelect(\'' + _esc(m.id) + '\')">' + _esc(m.label) + '</button>'
    ).join('');

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body">
        <div class="reg-bmp-layout">
          <div class="reg-bmp-left">
            <div class="ch-card">
              <div class="ch-card-hd" style="flex-wrap:wrap;gap:10px">
                <span class="ch-card-title">Protocol Registry</span>
                <span id="reg-proto-count" style="font-size:11.5px;color:var(--text-tertiary)">${_protos.length} protocols</span>
                <div style="position:relative;flex:1;max-width:260px;margin-left:auto">
                  <input id="reg-proto-q" type="text" placeholder="Search…" class="ph-search-input" value="${_esc(window._regProtoQ)}" oninput="window._regProtoSearch()">
                  <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                </div>
              </div>
              <div style="padding:10px 16px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border)">
                ${MODS.map(m=>'<button class="reg-mod-pill reg-domain-pill'+(m===window._regProtoMod?' active':'')+'" data-mod="'+_esc(m)+'" onclick="window._regProtoSetMod(\''+_esc(m)+'\')">'+_esc(m)+'</button>').join('')}
              </div>
              <div style="padding:12px 16px 4px;display:flex;align-items:center;gap:8px">
                <span class="ph-rail-label" style="margin:0">Featured Montages</span>
                <span style="flex:1;height:1px;background:rgba(255,255,255,0.05)"></span>
              </div>
              <div style="padding:0 12px 10px;display:flex;flex-wrap:wrap;gap:6px">
                ${featuredHtml}
              </div>
              <div style="padding:8px 16px 4px;display:flex;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,0.04)">
                <span class="ph-rail-label" style="margin:0">Full Registry</span>
                <span style="flex:1;height:1px;background:rgba(255,255,255,0.05)"></span>
                <span style="font-size:10.5px;color:var(--text-tertiary);letter-spacing:0.3px">◉ Tip: click an electrode on the map to filter</span>
              </div>
              <div id="reg-site-filter-chip" style="padding:0 16px"></div>
              <div id="reg-proto-list" style="max-height:calc(100vh - 380px);overflow-y:auto"></div>
            </div>
          </div>
          <div class="reg-bmp-right">
            <div class="ch-card" style="padding:16px;display:flex;flex-direction:column;align-items:center;gap:10px">
              <div id="reg-bmp-svg" class="bmp-svg-wrap-new" style="width:100%;display:flex;justify-content:center"></div>
              <div class="bmp-legend">
                <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--teal);margin-right:5px"></span>Anode</span>
                <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff6b9d;margin-right:5px"></span>Cathode</span>
                <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(74,158,255,0.25);border:1px dashed #4a9eff;margin-right:5px"></span>Target</span>
              </div>
            </div>
            <div class="ch-card bmp-detail-panel" id="reg-bmp-detail" style="margin-top:12px;padding:16px"></div>
          </div>
        </div>
      </div>
    </div>`;
    renderProtoReg();
    renderBrainPanel();
  }

  // ── HANDBOOKS TAB ─────────────────────────────────────────────────────────
  else if (tab === 'handbooks') {
    setTopbar('Protocols', '<button class="btn btn-sm" onclick="window._nav(\'handbooks-full\')">Full Handbooks ↗</button>');

    const HB_CONDITIONS = [
      { id:'mdd',    label:'Major Depressive Disorder', modality:'TMS / tDCS' },
      { id:'trd',    label:'Treatment-Resistant Depression', modality:'TMS' },
      { id:'gad',    label:'Generalized Anxiety Disorder', modality:'Neurofeedback / tDCS' },
      { id:'ptsd',   label:'Post-Traumatic Stress Disorder', modality:'TMS / tDCS' },
      { id:'ocd',    label:'OCD', modality:'Deep TMS' },
      { id:'adhd',   label:'ADHD', modality:'Neurofeedback' },
      { id:'insomnia', label:'Insomnia', modality:'tDCS / Neurofeedback' },
      { id:'pain',   label:'Chronic Pain', modality:'tDCS / TMS' },
    ];

    const HB_SECTIONS = {
      overview:   { label:'Overview & Rationale',    icon:'◎' },
      assessment: { label:'Assessment Protocol',     icon:'✓' },
      parameters: { label:'Protocol Parameters',     icon:'⊟' },
      safety:     { label:'Safety & Contraindications', icon:'⚠' },
      evidence:   { label:'Evidence Summary',        icon:'↗' },
      monitoring: { label:'Session Monitoring',      icon:'◉' },
      outcomes:   { label:'Expected Outcomes',       icon:'◈' },
    };

    const HB_CONTENT = {
      mdd: {
        overview:   'MDD is a leading cause of disability globally. Neuromodulation (TMS/tDCS) is indicated for moderate-to-severe MDD (PHQ-9 ≥10) with inadequate medication response. Left DLPFC stimulation increases prefrontal activity and normalises limbic dysregulation.',
        assessment: 'Baseline: PHQ-9, MADRS, HAM-D, QIDS-SR, C-SSRS, ISI. Weekly: PHQ-9, QIDS-SR, C-SSRS. Milestone: Full battery at sessions 10, 20, 30. Discharge: Full battery + WHODAS + SF-36.',
        parameters: 'TMS: Left DLPFC (F3 site), 10 Hz, 120% MT, 4-second trains, 26-second ITI, 75 trains, 3000 pulses/session, 37 min. OR iTBS: 600 pulses in 3 min.\ntDCS: Anode F3, Cathode F4, 2 mA, 30 min, 20 sessions.',
        safety:     'Contraindications: Seizure history, metal implants near head, pacemaker, pregnancy (relative). Pre-screen with MoCA if cognitive concerns. C-SSRS before every session.',
        evidence:   'TMS for MDD: Evidence Grade A. Multiple RCTs, FDA-cleared since 2008. Response rate ~50-60%, remission ~30%. iTBS non-inferior to standard TMS (FOUR trial, 2018).',
        monitoring: 'Pre-session: PHQ-9 + C-SSRS. Log MT at each session. Record side effects (headache, scalp discomfort). Escalate if seizure, syncope, or worsening suicidality.',
        outcomes:   'Responder: ≥50% PHQ-9 reduction. Remitter: PHQ-9 <5. Typical onset: improvement by session 10-15. Durability: 6-12 months, maintenance protocols available.',
      },
    };

    window._hbCond    = window._hbCond    || 'mdd';
    window._hbSection = window._hbSection || 'overview';

    function renderHandbook() {
      const cond   = HB_CONDITIONS.find(c=>c.id===window._hbCond)||HB_CONDITIONS[0];
      const sec    = HB_SECTIONS[window._hbSection];
      const content = (HB_CONTENT[window._hbCond]||{})[window._hbSection] ||
        'Detailed handbook content for ' + cond.label + ' — ' + sec.label + '.\n\nThis section covers clinical guidance, protocol parameters, safety considerations, and evidence-based recommendations for ' + cond.modality + ' treatment.';

      const out = document.getElementById('hb-content');
      if (!out) return;
      out.innerHTML = '<div class="hb-content-body">' +
        '<div class="hb-content-title">' + sec.icon + ' ' + sec.label + '</div>' +
        '<div class="hb-content-text">' + content.split('\n').map(line => '<p>' + line + '</p>').join('') + '</div>' +
      '</div>';
    }

    window._hbSetCond = id => { window._hbCond=id; document.querySelectorAll('.hb-cond-btn').forEach(b=>b.classList.toggle('active',b.dataset.id===id)); renderHandbook(); };
    window._hbSetSec  = id => { window._hbSection=id; document.querySelectorAll('.hb-sec-btn').forEach(b=>b.classList.toggle('active',b.dataset.id===id)); renderHandbook(); };

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar">${tabBar()}</div>
      <div class="ch-body" style="padding:0">
        <div class="hb-layout">
          <div class="hb-cond-rail">
            <div class="ph-rail-label">Conditions</div>
            ${HB_CONDITIONS.map(c=>'<button class="hb-cond-btn ph-cohort-item'+(c.id===window._hbCond?' active':'')+'" data-id="'+c.id+'" onclick="window._hbSetCond(\''+c.id+'\')">'+c.label+'</button>').join('')}
          </div>
          <div class="hb-sec-rail">
            <div class="ph-rail-label" style="padding-top:16px">Sections</div>
            ${Object.entries(HB_SECTIONS).map(([id,s])=>'<button class="hb-sec-btn ph-cohort-item'+(id===window._hbSection?' active':'')+'" data-id="'+id+'" onclick="window._hbSetSec(\''+id+'\')"><span style="margin-right:6px;opacity:0.6">'+s.icon+'</span>'+s.label+'</button>').join('')}
          </div>
          <div class="hb-main">
            <div id="hb-content"></div>
          </div>
        </div>
      </div>
    </div>`;
    renderHandbook();
  }

  // ── PROTOCOL DESIGNER TAB (merged: Patient · Brain Scan · Scratch) ────────
  else if (tab === 'designer') {
    // Mode state — drives the whole tab. 'patient' | 'brainscan' | 'scratch'.
    window._designerMode    = window._designerMode    || 'patient';
    window._designerOutput  = window._designerOutput  || null;
    window._designerHistory = window._designerHistory || [];

    // AI badge topbar ornament is shown when the user is in a mode that
    // produces AI-derived output (Patient chart, Brain Scan rules). In
    // Scratch mode we surface a Full Builder shortcut instead.
    const _topbarAiBadge = (window._designerMode !== 'scratch')
      ? '<span class="ph-ai-badge">AI</span>'
      : '<button class="btn btn-sm" onclick="window._nav(\'protocol-builder-full\')">Full Builder ↗</button>';
    setTopbar('Protocol Designer', _topbarAiBadge);

    el.innerHTML = '<div class="ch-shell">' + spinner() + '</div>';

    const _escD = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const evColorsD = { A:'var(--teal)', B:'var(--blue)', C:'var(--amber)', D:'var(--text-tertiary)', E:'var(--text-tertiary)' };

    // Fetch patient context once — same fields as the old Personalised tab.
    let patients = [], courses = [], outcomes = [];
    try {
      const [pRes, cRes, oRes] = await Promise.all([
        api.listPatients().catch(() => ({ items: [] })),
        (api.listCourses ? api.listCourses({}) : Promise.resolve({ items: [] })).catch(() => ({ items: [] })),
        (api.listOutcomes ? api.listOutcomes() : Promise.resolve({ items: [] })).catch(() => ({ items: [] })),
      ]);
      patients = pRes?.items || [];
      courses  = cRes?.items || [];
      outcomes = oRes?.items || [];
    } catch {}

    window._designerPatientId = window._designerPatientId || (patients[0]?.id || '');

    // ── Patient mode: build rich context (ported from personalized tab) ──
    function buildPatientContext(patId) {
      const p = patients.find(x => x.id === patId) || patients[0];
      if (!p) return null;
      const patCourses  = courses.filter(c => c.patient_id === patId);
      const patOutcomes = outcomes.filter(o => o.patient_id === patId || o.course_id === patCourses[0]?.id);
      const activeCourse = patCourses.find(c => c.status === 'active');
      const mhData = (() => { try { return JSON.parse(localStorage.getItem('ds_ph_mh_safety')||'null'); } catch { return null; } })();
      return {
        name:            ((p.first_name||'') + ' ' + (p.last_name||'')).trim() || 'Patient',
        condition:       (p.condition_slug||'').replace(/-/g,' ') || p.primary_condition || 'Unknown',
        modality:        (p.primary_modality||'').replace(/-/g,' ') || 'Not specified',
        age:             p.date_of_birth ? Math.floor((Date.now()-new Date(p.date_of_birth))/31557600000) : null,
        phq9:            patOutcomes.filter(o=>(o.template_id||'').toLowerCase().includes('phq')).slice(-1)[0]?.total_score ?? null,
        activeCourse:    activeCourse ? (activeCourse.condition_slug||'') + ' — ' + (activeCourse.modality_slug||'') : 'None',
        sessionsToDate:  patCourses.reduce((n,c)=>n+(c.sessions_delivered||0),0),
        priorTreatments: p.prior_treatments || p.clinician_notes || 'Not recorded',
        medications:     mhData?.notes || p.medications || 'Not recorded',
        safetyFlags:     p.has_adverse_event ? 'Adverse event recorded' : 'None flagged',
        contraindications: p.seizure_history ? 'Seizure history — TMS caution' : 'None documented',
        needsReview:     p.needs_review || false,
        outcomes:        patOutcomes.slice(-3).map(o=>o.template_id+': '+o.total_score).join(', ') || 'No outcomes recorded',
      };
    }

    // ── Brain Scan mode: rule-engine on qEEG z-scores (ported) ──────────
    // Z-score inputs are more clinically explicit than raw μV² levels.
    const QEEG_FIELDS = [
      { id:'alpha_asym', label:'Alpha Asymmetry (L–R)',    help:'Negative = left deficit (depression marker)'  },
      { id:'alpha_z',    label:'Alpha Power (z)',           help:'Global alpha z-score (−2…+2)'                 },
      { id:'theta_z',    label:'Theta Frontal (z)',         help:'Frontal theta z-score — elevated in MDD/ADHD' },
      { id:'beta_z',     label:'Beta Frontal (z)',          help:'Low beta at F3 → hypoarousal; high → anxiety' },
      { id:'smr_z',      label:'SMR (12–15 Hz) at C3 (z)',  help:'Low SMR → ADHD impulsivity'                   },
      { id:'tbr',        label:'Theta/Beta Ratio',          help:'>3 = ADHD indicator'                          },
    ];

    // qEEG → (targetRegion, anode, cathode) rule. Picks the strongest single
    // recommendation; users can stack alternates via the history panel.
    function brainScanRecommend(vals) {
      const asym   = parseFloat(vals.alpha_asym);
      const thetaZ = parseFloat(vals.theta_z);
      const betaZ  = parseFloat(vals.beta_z);
      const smrZ   = parseFloat(vals.smr_z);
      const tbr    = parseFloat(vals.tbr);

      if (!isNaN(tbr) && tbr > 3) {
        return {
          name: 'SMR Neurofeedback — ADHD',
          condition: 'ADHD', device: 'EEG',
          evidenceGrade: 'B', sessions: 40,
          anode: 'C3', cathode: null, targetRegion: null,
          summary: 'TBR > 3 (value: ' + tbr.toFixed(1) + ') — classic ADHD marker. Theta suppression + SMR uptraining at C3/Cz.',
          params: { frequency_band:'12–15 Hz (SMR)', protocol:'Uptrain SMR, downtrain theta', sessions_per_week:'2–3' },
        };
      }
      if (!isNaN(smrZ) && smrZ < -1) {
        return {
          name: 'SMR Neurofeedback — C3 Deficit',
          condition: 'ADHD', device: 'EEG',
          evidenceGrade: 'B', sessions: 40,
          anode: 'C3', cathode: null, targetRegion: null,
          summary: 'SMR z = ' + smrZ.toFixed(2) + ' → sensorimotor rhythm deficit. Uptrain SMR at C3.',
          params: { frequency_band:'12–15 Hz', protocol:'Uptrain SMR at C3', sessions_per_week:'2–3' },
        };
      }
      if (!isNaN(asym) && asym < -0.1) {
        return {
          name: 'Left DLPFC TMS — Depression',
          condition: 'MDD', device: 'TMS',
          evidenceGrade: 'A', sessions: 30,
          anode: 'F3', cathode: null, targetRegion: 'DLPFC-L',
          summary: 'Left alpha deficit (asymmetry: ' + asym.toFixed(2) + ') → left hypoactivation. Standard indicator for left DLPFC TMS.',
          params: { frequency:'10 Hz', intensity:'120% MT', pulses_per_session:3000, sessions_per_week:5 },
        };
      }
      if (!isNaN(thetaZ) && thetaZ > 1) {
        return {
          name: 'Anodal tDCS — Left DLPFC',
          condition: 'MDD', device: 'tDCS',
          evidenceGrade: 'B', sessions: 20,
          anode: 'F3', cathode: 'F4', targetRegion: 'DLPFC-L',
          summary: 'Frontal theta z = ' + thetaZ.toFixed(2) + ' → prefrontal hypoactivation. Anodal tDCS F3 / cathodal F4.',
          params: { current:'2 mA', duration:'30 min', sessions_per_week:5 },
        };
      }
      if (!isNaN(betaZ) && betaZ < -1) {
        return {
          name: 'Prefrontal tDCS — Cognitive Support',
          condition: 'Cognitive impairment', device: 'tDCS',
          evidenceGrade: 'C', sessions: 15,
          anode: 'F3', cathode: 'F4', targetRegion: 'DLPFC-L',
          summary: 'Low frontal beta (z = ' + betaZ.toFixed(2) + ') → prefrontal hypoactivation.',
          params: { current:'2 mA', duration:'20 min' },
        };
      }
      return null;
    }

    // ── Scratch mode: target-site metadata ──────────────────────────────
    const SCRATCH_SITES = [
      { id:'F3', label:'F3 — Left DLPFC',         anode:'F3', cathode:null, targetRegion:'DLPFC-L' },
      { id:'F4', label:'F4 — Right DLPFC',        anode:'F4', cathode:null, targetRegion:'DLPFC-R' },
      { id:'Fz', label:'Fz — Medial PFC',         anode:'Fz', cathode:null, targetRegion:'mPFC'    },
      { id:'Cz', label:'Cz — Vertex / SMA',       anode:'Cz', cathode:null, targetRegion:'SMA'     },
      { id:'C3', label:'C3 — Left Motor Cortex',  anode:'C3', cathode:null, targetRegion:'M1-L'    },
      { id:'C4', label:'C4 — Right Motor Cortex', anode:'C4', cathode:null, targetRegion:'M1-R'    },
      { id:'T7', label:'T7 — Left Temporal',      anode:'T7', cathode:null, targetRegion:'TEMPORAL-L' },
      { id:'T8', label:'T8 — Right Temporal',     anode:'T8', cathode:null, targetRegion:'TEMPORAL-R' },
      { id:'P3', label:'P3 — Left Parietal',      anode:'P3', cathode:null, targetRegion:null      },
      { id:'P4', label:'P4 — Right Parietal',     anode:'P4', cathode:null, targetRegion:null      },
      { id:'Pz', label:'Pz — Parietal Midline',   anode:'Pz', cathode:null, targetRegion:null      },
      { id:'Oz', label:'Oz — Occipital',          anode:'Oz', cathode:null, targetRegion:'V1'      },
    ];

    // ── Output render helpers ───────────────────────────────────────────
    function renderBrainPanel(output) {
      const wrap = document.getElementById('design-bmp-svg');
      if (!wrap) return;
      wrap.innerHTML = renderBrainMap10_20({
        anode:        output?.anode        || null,
        cathode:      output?.cathode      || null,
        targetRegion: output?.targetRegion || null,
        size: 340,
        showZones: true,
        showConnection: true,
        showEarsAndNose: true,
      });
    }

    function renderOutputCard(output) {
      const host = document.getElementById('design-output-card');
      if (!host) return;
      if (!output) {
        const modeHint = {
          patient:   'Pick a patient on the left, then click <b>Generate AI Recommendations</b> to produce a protocol from the chart.',
          brainscan: 'Enter qEEG metrics on the left, then click <b>Analyse &amp; Recommend</b> to generate a rule-based protocol and update the brain map.',
          scratch:   'Fill in the form on the left — the brain map updates live as you change the target site. Click <b>Build Protocol</b> to materialise the output.',
        }[window._designerMode] || '';
        host.innerHTML = '<div class="design-output-card"><div class="bmp-montage-name">No output yet</div>' +
          '<div class="bmp-notes">' + modeHint + '</div></div>';
        return;
      }
      const evc = evColorsD[output.evidenceGrade] || 'var(--text-tertiary)';
      const params = output.params || {};
      const paramRows = Object.keys(params).length
        ? Object.entries(params).map(([k,v]) =>
            '<div class="design-param"><span class="design-param-label">' + _escD(k.replace(/_/g,' ')) + '</span>' +
            '<span class="design-param-value">' + _escD(v) + '</span></div>'
          ).join('')
        : '';
      host.innerHTML =
        '<div class="design-output-card">' +
          '<div class="bmp-montage-name">' + _escD(output.name || 'Protocol') + '</div>' +
          '<div class="bmp-badges">' +
            (output.condition     ? '<span class="bmp-badge">' + _escD(output.condition) + '</span>' : '') +
            (output.device        ? '<span class="bmp-badge">' + _escD(output.device)    + '</span>' : '') +
            (output.evidenceGrade ? '<span class="bmp-badge" style="color:' + evc + '">Evidence ' + _escD(output.evidenceGrade) + '</span>' : '') +
            (output.sessions      ? '<span class="bmp-badge">' + _escD(output.sessions) + ' sessions</span>' : '') +
            (output.anode         ? '<span class="bmp-badge bmp-badge--anode">+ ' + _escD(output.anode) + '</span>' : '') +
            (output.cathode       ? '<span class="bmp-badge bmp-badge--cathode">− ' + _escD(output.cathode) + '</span>' : '') +
            (output.targetRegion  ? '<span class="bmp-badge">◎ ' + _escD(output.targetRegion) + '</span>' : '') +
          '</div>' +
          (output.summary ? '<div class="bmp-notes">' + _escD(output.summary) + '</div>' : '') +
          (paramRows ? '<div class="design-params-grid">' + paramRows + '</div>' : '') +
          '<div class="design-actions">' +
            '<button class="ch-btn-sm ch-btn-teal" onclick="window._prescribeFromDesigner()">Prescribe →</button>' +
            '<button class="ch-btn-sm" onclick="window._saveDesignerPreset()">Save as preset</button>' +
            '<button class="ch-btn-sm" onclick="window._exportDesignerResult()">Export</button>' +
          '</div>' +
        '</div>';
    }

    function renderHistory() {
      const host = document.getElementById('design-history');
      if (!host) return;
      const hist = (window._designerHistory || []).slice(-3).reverse();
      if (!hist.length) { host.innerHTML = ''; return; }
      host.innerHTML =
        '<div class="design-history-label">Recent Generations</div>' +
        hist.map((h, i) =>
          '<div class="design-history-row" onclick="window._loadDesignerHistory(' + i + ')">' +
            '<span style="color:var(--text-secondary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escD(h.name || 'Protocol') + '</span>' +
            (h.condition ? '<span style="color:var(--text-tertiary);font-size:11px">' + _escD(h.condition) + '</span>' : '') +
            (h.anode     ? '<span class="bmp-badge bmp-badge--anode">+ ' + _escD(h.anode) + '</span>' : '') +
          '</div>'
        ).join('');
    }

    function setOutput(out, { pushHistory = true } = {}) {
      window._designerOutput = out;
      if (pushHistory && out) {
        window._designerHistory.push(out);
        if (window._designerHistory.length > 10) window._designerHistory.shift();
      }
      renderBrainPanel(out);
      renderOutputCard(out);
      renderHistory();
    }

    // ── Left-pane renderers (mode-specific) ─────────────────────────────
    function renderPatientLeft() {
      const patOpts = patients.map(p =>
        '<option value="' + p.id + '"' + (p.id === window._designerPatientId ? ' selected' : '') + '>' +
          _escD(((p.first_name||'') + ' ' + (p.last_name||'')).trim()) + ' — ' +
          _escD((p.condition_slug||'').replace(/-/g,' ')||'No condition') +
        '</option>'
      ).join('') || '<option value="">No patients loaded</option>';

      const ctx = buildPatientContext(window._designerPatientId);
      const severityBand = ctx && ctx.phq9 != null
        ? ctx.phq9 >= 20 ? { label:'Severe' }
          : ctx.phq9 >= 15 ? { label:'Mod. Severe' }
          : ctx.phq9 >= 10 ? { label:'Moderate' }
          : ctx.phq9 >= 5  ? { label:'Mild' }
          : { label:'Minimal' }
        : null;
      const profile = ctx
        ? '<div class="pp-patient-header">' +
            '<div class="ph-avatar" style="width:44px;height:44px;font-size:14px">' + _escD(ctx.name.split(' ').map(w=>w[0]||'').join('').slice(0,2).toUpperCase()) + '</div>' +
            '<div>' +
              '<div style="font-size:15px;font-weight:700;color:var(--text-primary)">' + _escD(ctx.name) + '</div>' +
              '<div style="font-size:12px;color:var(--text-tertiary)">' + _escD(ctx.condition) + (ctx.age?' · Age '+ctx.age:'') + '</div>' +
            '</div>' +
            (ctx.safetyFlags!=='None flagged'?'<span class="ph-badge ph-badge--alert">⚠ AE</span>':'') +
          '</div>' +
          '<div class="pp-profile-grid">' +
            [
              ['Condition', ctx.condition],
              ['Modality', ctx.modality],
              ['PHQ-9', ctx.phq9!=null ? ctx.phq9+(severityBand?' — '+severityBand.label:'') : 'Not recorded'],
              ['Active Course', ctx.activeCourse],
              ['Sessions Done', ctx.sessionsToDate || '0'],
              ['Contraindications', ctx.contraindications],
              ['Safety Flags', ctx.safetyFlags],
              ['Prior Outcomes', ctx.outcomes],
            ].map(([k,v]) => '<div class="pp-profile-row"><span class="pp-profile-key">' + _escD(k) + '</span><span class="pp-profile-val">' + _escD(v) + '</span></div>').join('') +
          '</div>'
        : '<div style="padding:16px;font-size:12px;color:var(--text-tertiary);text-align:center">Pick a patient to begin.</div>';

      return '<div class="ch-card">' +
        '<div class="ch-card-hd"><span class="ch-card-title">Select Patient</span></div>' +
        '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">' +
          '<select class="ch-select ch-select--full" id="design-pat-select" onchange="window._designerSelectPatient(this.value)">' + patOpts + '</select>' +
          profile +
          '<button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="window._designerGeneratePatient()">' +
            '<span style="margin-right:6px">✦</span> Generate AI Recommendations' +
          '</button>' +
          '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;line-height:1.5">AI analyses condition, severity, prior treatments,<br>medications and contraindications.</div>' +
        '</div></div>';
    }

    function renderBrainscanLeft() {
      const vals = window._designerBsVals || {};
      return '<div class="ch-card">' +
        '<div class="ch-card-hd"><span class="ch-card-title">qEEG Metrics</span></div>' +
        '<div style="padding:14px 16px">' +
          '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px">Enter available qEEG z-scores (or values). Leave blank if not measured. Rules engine matches dysregulation patterns to the most appropriate protocol.</div>' +
          QEEG_FIELDS.map(f =>
            '<div class="ch-form-group" style="margin-bottom:10px">' +
              '<label class="ch-label">' + _escD(f.label) + '</label>' +
              '<input id="design-bs-' + f.id + '" type="number" step="0.01" placeholder="' + _escD(f.help) + '" class="ch-select ch-select--full" value="' + _escD(vals[f.id] || '') + '">' +
            '</div>'
          ).join('') +
          '<button class="btn btn-primary" style="width:100%;margin-top:4px" onclick="window._designerGenerateBrainScan()">' +
            '<span style="margin-right:6px">◉</span> Analyse &amp; Recommend' +
          '</button>' +
        '</div></div>';
    }

    function renderScratchLeft() {
      const selSite = window._designerScratchSite || 'F3';
      return '<div class="design-stat-row">' +
          '<div class="design-stat-card"><div class="design-stat-value">' + _protos.length + '</div><div class="design-stat-label">Protocols in Library</div></div>' +
          '<div class="design-stat-card"><div class="design-stat-value" style="color:var(--blue)">' + _conditions.length + '</div><div class="design-stat-label">Conditions Covered</div></div>' +
          '<div class="design-stat-card"><div class="design-stat-value" style="color:var(--violet)">' + _devices.length + '</div><div class="design-stat-label">Device Types</div></div>' +
          '<div class="design-stat-card"><div class="design-stat-value" style="color:var(--green)">' + _protos.filter(p=>p.evidenceGrade==='A').length + '</div><div class="design-stat-label">Grade A Evidence</div></div>' +
        '</div>' +
        '<div class="ch-card">' +
          '<div class="ch-card-hd"><span class="ch-card-title">Quick Protocol Builder</span></div>' +
          '<div style="padding:16px;display:flex;flex-direction:column;gap:12px">' +
            '<div class="ch-form-group">' +
              '<label class="ch-label">Condition</label>' +
              '<select class="ch-select ch-select--full" id="design-sc-condition">' +
                _conditions.slice(0,30).map(c=>'<option value="'+_escD(c.id)+'">'+_escD(c.label)+'</option>').join('') +
              '</select>' +
            '</div>' +
            '<div class="ch-form-group">' +
              '<label class="ch-label">Modality</label>' +
              '<select class="ch-select ch-select--full" id="design-sc-device">' +
                _devices.map(d=>'<option value="'+_escD(d.id)+'">'+_escD(d.label)+'</option>').join('') +
              '</select>' +
            '</div>' +
            '<div class="ch-form-group">' +
              '<label class="ch-label">Target Site</label>' +
              '<select class="ch-select ch-select--full" id="design-sc-site" onchange="window._designerScratchSitePreview(this.value)">' +
                SCRATCH_SITES.map(s => '<option value="'+s.id+'"' + (s.id===selSite?' selected':'') + '>'+_escD(s.label)+'</option>').join('') +
              '</select>' +
            '</div>' +
            '<div class="ch-form-group">' +
              '<label class="ch-label">Sessions</label>' +
              '<input type="number" class="ch-select ch-select--full" id="design-sc-sessions" value="30" min="1" max="60">' +
            '</div>' +
            '<button class="btn btn-primary" onclick="window._designerBuildScratch()">Build Protocol</button>' +
          '</div>' +
        '</div>' +
        '<details class="ch-card" style="padding:0">' +
          '<summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text-primary);list-style:none">Recently Used Templates ▾</summary>' +
          '<div style="padding:0 0 8px">' +
            _protos.filter(p=>p.evidenceGrade==='A').slice(0,6).map(p => {
              const cond = _conditions.find(c=>c.id===p.conditionId);
              const dev  = _devices.find(d=>d.id===p.device);
              return '<div class="ph-patient-row" onclick="window._protDetailId=\'' + _escD(p.id||'') + '\';window._nav(\'protocol-detail\')">' +
                '<div class="ph-info"><div class="ph-name">' + _escD(p.name||'Protocol') + '</div>' +
                '<div class="ph-meta">' + _escD(cond?.label||'—') + ' · ' + _escD(dev?.label||'—') + '</div></div>' +
                '<span class="ph-badge ph-badge--course">Ev. A</span>' +
                '<svg class="ph-chevron" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></div>';
            }).join('') +
          '</div>' +
        '</details>';
    }

    function leftPaneHtml() {
      if (window._designerMode === 'patient')   return renderPatientLeft();
      if (window._designerMode === 'brainscan') return renderBrainscanLeft();
      return renderScratchLeft();
    }

    function rerenderLeft() {
      const left = document.getElementById('design-left');
      if (left) left.innerHTML = leftPaneHtml();
      document.querySelectorAll('.design-mode').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === window._designerMode);
      });
    }

    function rerenderAll() {
      rerenderLeft();
      // In scratch mode with no committed output, seed a live preview from
      // the currently selected target site so the brain map is never empty.
      if (window._designerMode === 'scratch' && !window._designerOutput) {
        window._designerScratchSitePreview(window._designerScratchSite || 'F3');
      } else {
        renderBrainPanel(window._designerOutput);
      }
      renderOutputCard(window._designerOutput);
      renderHistory();
    }
    window._designerRerender = rerenderAll;

    // ── Event handlers (exposed on window for inline onclick) ────────────
    window._designerSetMode = m => {
      window._designerMode = m;
      const _badge = (m !== 'scratch')
        ? '<span class="ph-ai-badge">AI</span>'
        : '<button class="btn btn-sm" onclick="window._nav(\'protocol-builder-full\')">Full Builder ↗</button>';
      setTopbar('Protocol Designer', _badge);
      rerenderAll();
    };

    window._designerSelectPatient = id => {
      window._designerPatientId = id;
      rerenderLeft();
    };

    window._designerGeneratePatient = async () => {
      const patId = document.getElementById('design-pat-select')?.value || window._designerPatientId;
      const ctx = buildPatientContext(patId);
      if (!ctx) { window._dsToast?.({ title:'No patient selected', body:'Pick a patient to begin.', severity:'warn' }); return; }

      // Rule-based shortlist (ported from old personalized tab)
      const conditionKey = ctx.condition.toLowerCase();
      const ruleMatches = _protos.filter(p => {
        const pcond = (p.conditionId||'').toLowerCase();
        if (conditionKey.includes('depress') && (pcond.includes('mdd')||pcond.includes('depress'))) return true;
        if (conditionKey.includes('anxiet') && (pcond.includes('gad')||pcond.includes('anxiet'))) return true;
        if (conditionKey.includes('ptsd')  && pcond.includes('ptsd')) return true;
        if (conditionKey.includes('ocd')   && pcond.includes('ocd'))  return true;
        if (conditionKey.includes('adhd')  && pcond.includes('adhd')) return true;
        if (conditionKey.includes('pain')  && pcond.includes('pain')) return true;
        if (conditionKey.includes('insomn')&& (pcond.includes('insomn')||pcond.includes('sleep'))) return true;
        return false;
      }).slice(0, 5);

      const hasSeizure = ctx.contraindications.toLowerCase().includes('seizure');
      const safeMatches = hasSeizure ? ruleMatches.filter(p => !['TMS','tDCS'].includes(p.device)) : ruleMatches;

      // Try AI call (unchanged from personalized tab)
      let aiRecs = null;
      try {
        const sysPrompt = 'You are a clinical neuromodulation expert. Given a patient profile and a shortlist of matching protocols, return personalised recommendations as a JSON array. Each item: { protocol_name, rationale, confidence: "High"|"Medium"|"Low", contraindication_check, expected_response, priority: 1|2|3 }. Return only valid JSON, no other text.';
        const userMsg = 'Patient: ' + JSON.stringify(ctx, null, 2) + '\n\nMatching protocols:\n' + safeMatches.map(p=>p.name+' ('+p.evidenceGrade+' evidence, '+p.device+')').join('\n') + '\n\nProvide ranked recommendations with rationale specific to this patient\'s profile.';
        const res = await api.chatClinician(
          [{ role:'system', content: sysPrompt }, { role:'user', content: userMsg }],
          ctx
        );
        const raw = res?.message || res?.content || res?.reply || '';
        const jsonStr = raw.match(/\[[\s\S]*\]/)?.[0];
        if (jsonStr) aiRecs = JSON.parse(jsonStr);
      } catch {}

      // Collapse to a single top-ranked output object (unified designer schema).
      let output = null;
      if (aiRecs && aiRecs.length) {
        const top = aiRecs[0];
        const matched = safeMatches.find(p => p.name === top.protocol_name) || safeMatches[0] || null;
        const inf = matched ? inferElectrodes(matched) : { anode: null };
        output = {
          name: top.protocol_name || matched?.name || 'AI Recommendation',
          condition: ctx.condition,
          device: matched ? (_devices.find(d=>d.id===matched.device)?.label || matched.device) : '—',
          evidenceGrade: matched?.evidenceGrade || '?',
          sessions: matched?.sessions || null,
          anode: inf.anode || null,
          cathode: inf.cathode || null,
          targetRegion: inf.targetRegion || null,
          summary: top.rationale || matched?.summary || '',
          params: {
            confidence: top.confidence || '—',
            contraindication_check: top.contraindication_check || 'No specific concern',
            expected_response: top.expected_response || '—',
          },
        };
      } else if (safeMatches.length) {
        const m = safeMatches[0];
        const inf = inferElectrodes(m);
        output = {
          name: m.name || 'Protocol',
          condition: ctx.condition,
          device: _devices.find(d=>d.id===m.device)?.label || m.device || '—',
          evidenceGrade: m.evidenceGrade || '?',
          sessions: m.sessions || null,
          anode: inf.anode || null,
          cathode: inf.cathode || null,
          targetRegion: inf.targetRegion || null,
          summary: m.summary || 'Protocol matched to patient condition.',
          params: { match_source: 'rule-based (AI offline)' },
        };
      }
      if (!output) { window._dsToast?.({ title:'No matching protocols', body:'No library protocols match this condition.', severity:'warn' }); return; }
      setOutput(output);
    };

    window._designerGenerateBrainScan = () => {
      const vals = {};
      QEEG_FIELDS.forEach(f => { vals[f.id] = document.getElementById('design-bs-'+f.id)?.value || ''; });
      window._designerBsVals = vals;
      const out = brainScanRecommend(vals);
      if (!out) {
        window._dsToast?.({ title:'No rule triggered', body:'Enter z-scores/TBR that hit thresholds (e.g. TBR > 3 or alpha asym < −0.1).', severity:'warn' });
        return;
      }
      setOutput(out);
    };

    window._designerScratchSitePreview = siteId => {
      window._designerScratchSite = siteId;
      const s = SCRATCH_SITES.find(x => x.id === siteId) || SCRATCH_SITES[0];
      // Live preview — just update the brain map, don't commit an output.
      const wrap = document.getElementById('design-bmp-svg');
      if (wrap) {
        wrap.innerHTML = renderBrainMap10_20({
          anode: s.anode, cathode: s.cathode, targetRegion: s.targetRegion,
          size: 340, showZones: true, showConnection: true, showEarsAndNose: true,
        });
      }
    };

    window._designerBuildScratch = () => {
      const condId  = document.getElementById('design-sc-condition')?.value || '';
      const devId   = document.getElementById('design-sc-device')?.value   || '';
      const siteId  = document.getElementById('design-sc-site')?.value     || (window._designerScratchSite || 'F3');
      const sessions = parseInt(document.getElementById('design-sc-sessions')?.value, 10) || 30;
      const cond = _conditions.find(c=>c.id===condId);
      const dev  = _devices.find(d=>d.id===devId);
      const site = SCRATCH_SITES.find(s=>s.id===siteId) || SCRATCH_SITES[0];
      const out = {
        name: 'Custom — ' + (dev?.label || devId || 'Protocol') + ' @ ' + site.id,
        condition: cond?.label || condId || '—',
        device: dev?.label || devId || '—',
        evidenceGrade: 'C',
        sessions,
        anode: site.anode,
        cathode: site.cathode,
        targetRegion: site.targetRegion,
        summary: 'User-built protocol: ' + (dev?.label || devId) + ' targeting ' + site.label + ' for ' + (cond?.label || condId) + '.',
        params: { target_site: site.id, sessions_total: sessions },
      };
      setOutput(out);
    };

    window._loadDesignerHistory = idx => {
      const hist = (window._designerHistory || []).slice(-3).reverse();
      const out = hist[idx];
      if (out) setOutput(out, { pushHistory: false });
    };

    window._prescribeFromDesigner = () => {
      if (!window._designerOutput) return;
      window._patientHubTab = 'prescriptions';
      window._nav('patients-hub');
    };

    window._saveDesignerPreset = () => {
      if (!window._designerOutput) return;
      try {
        const key = 'ds_designer_presets';
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        list.push({ ts: Date.now(), ...window._designerOutput });
        localStorage.setItem(key, JSON.stringify(list.slice(-20)));
        window._dsToast?.({ title:'Preset saved', body: window._designerOutput.name, severity:'ok' });
      } catch {}
    };

    window._exportDesignerResult = () => {
      if (!window._designerOutput) return;
      try {
        const blob = new Blob([JSON.stringify(window._designerOutput, null, 2)], { type:'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'protocol-' + (window._designerOutput.name || 'output').replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(url), 2000);
      } catch {}
    };

    // ── Shell render ────────────────────────────────────────────────────
    el.innerHTML =
      '<div class="ch-shell">' +
        '<div class="ch-tab-bar">' + tabBar() + '</div>' +
        '<div class="ch-body">' +
          '<div class="design-modes" role="tablist" aria-label="Input source">' +
            '<button class="design-mode' + (window._designerMode==='patient'?' active':'')   + '" data-mode="patient"   onclick="window._designerSetMode(\'patient\')"><span class="mode-icon">◉</span>From Patient</button>' +
            '<button class="design-mode' + (window._designerMode==='brainscan'?' active':'') + '" data-mode="brainscan" onclick="window._designerSetMode(\'brainscan\')"><span class="mode-icon">◎</span>From Brain Scan</button>' +
            '<button class="design-mode' + (window._designerMode==='scratch'?' active':'')   + '" data-mode="scratch"   onclick="window._designerSetMode(\'scratch\')"><span class="mode-icon">⊟</span>From Scratch</button>' +
          '</div>' +
          '<div class="design-layout">' +
            '<div class="design-left" id="design-left">' + leftPaneHtml() + '</div>' +
            '<div class="design-right">' +
              '<div class="ch-card">' +
                '<div class="ch-card-hd"><span class="ch-card-title">Brain Map &amp; Output</span></div>' +
                '<div style="padding:12px 12px 4px;display:flex;justify-content:center" id="design-bmp-svg"></div>' +
                '<div style="padding:0 14px 14px" id="design-output-card"></div>' +
              '</div>' +
              '<div class="design-history" id="design-history"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Initial paint — scratch pre-seeds a live preview; other modes show
    // either prior output or the empty-state hint card.
    if (window._designerMode === 'scratch' && !window._designerOutput) {
      window._designerScratchSitePreview(window._designerScratchSite || 'F3');
    } else {
      renderBrainPanel(window._designerOutput);
    }
    renderOutputCard(window._designerOutput);
    renderHistory();
  }

}

// ═══════════════════════════════════════════════════════════════════════════════
// pgSchedulingHub — Calendar · Bookings · Leads · Reception
// ═══════════════════════════════════════════════════════════════════════════════
export async function pgSchedulingHub(setTopbar, navigate) {
  const tab = window._schedHubTab || 'calendar';
  window._schedHubTab = tab;

  const TAB_META = {
    calendar:  { label: 'Calendar',   color: 'var(--teal)'   },
    bookings:  { label: 'Bookings',   color: 'var(--blue)'   },
    leads:     { label: 'Leads',      color: 'var(--violet)' },
    reception: { label: 'Reception',  color: 'var(--amber)'  },
  };

  // -- Role-aware tab visibility --
  const _role = (currentUser?.role || 'admin').toLowerCase();
  const ROLE_TABS = {
    technician:   ['calendar','bookings'],
    receptionist: ['calendar','bookings','reception'],
  };
  const allowedTabs = ROLE_TABS[_role] || Object.keys(TAB_META); // clinician/admin see all

  function tabBar() {
    return Object.entries(TAB_META)
      .filter(([id]) => allowedTabs.includes(id))
      .map(([id, m]) =>
        '<button role="tab" aria-selected="' + (tab===id) + '" tabindex="' + (tab===id?'0':'-1') + '"' +
        ' class="ch-tab' + (tab===id?' ch-tab--active':'') + '"' +
        (tab===id?' style="--tab-color:'+m.color+'"':'') +
        ' onclick="window._schedHubTab=\''+id+'\';window._nav(\'scheduling-hub\')">' + m.label + '</button>'
      ).join('');
  }

  const el = document.getElementById('content');

  // ── Inject scheduling CSS (once) ────────────────────────────────────────────
  if (!document.getElementById('sched-styles')) {
    const _ss = document.createElement('style'); _ss.id = 'sched-styles';
    _ss.textContent = `
/* Scheduling — Accessibility focus rings */
.cal-cell:focus-visible, .cal-apt:focus-visible { outline:2px solid var(--teal); outline-offset:1px; border-radius:4px; }
.ch-tab:focus-visible { outline:2px solid var(--teal); outline-offset:2px; }
.ch-btn-sm:focus-visible, .btn:focus-visible { outline:2px solid var(--teal); outline-offset:2px; }
.sched-section-title { font-size:15px; font-weight:700; color:var(--text-primary); margin-bottom:12px; }
.cal-apt-name { color:var(--text-primary); }
.cal-apt-time { color:var(--text-secondary); }
/* Scheduling — Responsive */
@media (max-width:767px) {
  .cal-grid { min-width:unset; }
  .cal-row { grid-template-columns:52px 1fr; }
  .cal-row .cal-cell:not(.cal-cell--active-day),
  .cal-row .cal-day-header:not(.cal-day-header--active-day) { display:none; }
  .sched-cal-controls { flex-wrap:wrap; }
  .book-row { flex-wrap:wrap; gap:8px; }
  .book-datetime { width:auto; }
  .book-actions { width:100%; justify-content:flex-start; }
  #book-list { overflow-x:auto; }
  .leads-kanban { grid-template-columns:repeat(5, 200px) !important; overflow-x:auto; -webkit-overflow-scrolling:touch; scroll-snap-type:x mandatory; }
  .lead-col { scroll-snap-align:start; min-width:200px; }
  .ch-modal { max-width:100vw !important; margin:8px; border-radius:10px; }
  .ch-modal-body { max-height:80vh; overflow-y:auto; }
  .ch-btn-sm, .btn-sm { min-height:44px; min-width:44px; padding:10px 14px; }
  .ch-tab { min-height:44px; }
  .lead-phone { min-width:44px; min-height:44px; display:inline-flex; align-items:center; justify-content:center; }
  .rec-task-row input[type="checkbox"] { min-width:20px; min-height:20px; }
  .ch-kpi-strip { grid-template-columns:repeat(2,1fr) !important; }
  .rec-grid { grid-template-columns:1fr; }
}
@media (max-width:480px) {
  .leads-kanban { grid-template-columns:repeat(5, 170px) !important; }
  .lead-col { min-width:170px; }
}
`;
    document.head.appendChild(_ss);
  }

  // ── Shared data store ───────────────────────────────────────────────────────
  const _SK = 'ds_sched_v1';
  function _loadSched() { try { return JSON.parse(localStorage.getItem(_SK)||'null') || _seedSched(); } catch { return _seedSched(); } }
  function _saveSched(d) { try { localStorage.setItem(_SK, JSON.stringify(d)); } catch {} }
  const pad2 = n => String(n).padStart(2,'0');
  const now = new Date();
  const todayStr = now.getFullYear()+'-'+pad2(now.getMonth()+1)+'-'+pad2(now.getDate());
  function nextDay(n) { const d=new Date(now); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }

  function _seedSched() {
    const d = { appointments:[
      { id:'APT-001', patient_name:'Demo Patient A', patient_id:'P-DEMO-1', clinician:'Dr. S. Chen',   date:todayStr,    time:'09:00', duration:60,  type:'session',     status:'confirmed', notes:'Session 9 of 30.', room_id:'TMS Suite', device_id:'TMS Coil A' },
      { id:'APT-002', patient_name:'Demo Patient B', patient_id:'P-DEMO-2', clinician:'Dr. J. Patel',  date:todayStr,    time:'10:30', duration:30,  type:'assessment',  status:'confirmed', notes:'Baseline PHQ-9, GAD-7.', room_id:'Consultation Room', device_id:'' },
      { id:'APT-003', patient_name:'Demo Patient C', patient_id:'P-DEMO-3', clinician:'Dr. S. Chen',   date:todayStr,    time:'14:00', duration:60,  type:'session',     status:'pending',   notes:'tDCS session 8.', room_id:'EEG Lab', device_id:'tDCS Unit' },
      { id:'APT-004', patient_name:'Marcus Webb',    patient_id:'',         clinician:'Dr. J. Patel',  date:todayStr,    time:'15:30', duration:45,  type:'new-patient', status:'confirmed', notes:'TRD referral intake.', room_id:'Room 1', device_id:'' },
      { id:'APT-005', patient_name:'Demo Patient A', patient_id:'P-DEMO-1', clinician:'Dr. S. Chen',   date:nextDay(1),  time:'09:00', duration:60,  type:'session',     status:'confirmed', notes:'Session 10 — milestone.', room_id:'TMS Suite', device_id:'TMS Coil A' },
      { id:'APT-006', patient_name:'Anna Torres',    patient_id:'',         clinician:'Dr. K. Okafor', date:nextDay(1),  time:'11:00', duration:30,  type:'follow-up',   status:'confirmed', notes:'Post-course follow-up.', room_id:'Consultation Room', device_id:'' },
      { id:'APT-007', patient_name:'Demo Patient B', patient_id:'P-DEMO-2', clinician:'Dr. J. Patel',  date:nextDay(2),  time:'09:30', duration:60,  type:'session',     status:'confirmed', notes:'Session 3 of 30.', room_id:'TMS Suite', device_id:'TMS Coil B' },
      { id:'APT-008', patient_name:'James Mitchell', patient_id:'',         clinician:'Dr. S. Chen',   date:nextDay(3),  time:'13:00', duration:45,  type:'new-patient', status:'pending',   notes:'Referred by GP.', room_id:'Room 2', device_id:'' },
      { id:'APT-009', patient_name:'Demo Patient A', patient_id:'P-DEMO-1', clinician:'Dr. S. Chen',   date:nextDay(-1), time:'09:00', duration:60,  type:'session',     status:'completed', notes:'Session 8 — good tolerance.', room_id:'TMS Suite', device_id:'TMS Coil A' },
      { id:'APT-010', patient_name:'Demo Patient C', patient_id:'P-DEMO-3', clinician:'Dr. J. Patel',  date:nextDay(-2), time:'14:00', duration:60,  type:'session',     status:'no-show',   notes:'Did not attend.', room_id:'EEG Lab', device_id:'EEG Cap' },
    ], leads:[
      { id:'LEAD-001', name:'Sarah Johnson',  email:'sarah.j@email.com', phone:'+44 7700 900123', source:'website',  condition:'Depression', stage:'new',       notes:'TRD, tried 3 meds.', created:'2026-04-14', follow_up:todayStr },
      { id:'LEAD-002', name:'Robert Kim',     email:'rkim@email.com',    phone:'+44 7700 900456', source:'referral', condition:'Anxiety',    stage:'contacted', notes:'Referred by GP. GAD-7=15.', created:'2026-04-13', follow_up:nextDay(1) },
      { id:'LEAD-003', name:'Emma Clarke',    email:'emma.c@email.com',  phone:'+44 7700 900789', source:'phone',    condition:'OCD',        stage:'qualified', notes:'Deep TMS candidate.', created:'2026-04-12', follow_up:nextDay(2) },
      { id:'LEAD-004', name:'David Nguyen',   email:'dnguyen@email.com', phone:'+44 7700 900321', source:'referral', condition:'PTSD',       stage:'booked',    notes:'Intake booked.', created:'2026-04-10', follow_up:nextDay(5) },
      { id:'LEAD-005', name:'Lucy Fernandez', email:'lfern@email.com',   phone:'+44 7700 900654', source:'website',  condition:'Depression', stage:'lost',      notes:'Chose medication only.', created:'2026-04-08', follow_up:'' },
    ], calls:[
      { id:'CALL-001', name:'Sarah Johnson',  phone:'+44 7700 900123', direction:'inbound',  duration:8, outcome:'info-given', notes:'Explained TMS. Sending info pack.', time:'09:14', date:todayStr },
      { id:'CALL-002', name:'Demo Patient A', phone:'+44 7700 111222', direction:'outbound', duration:3, outcome:'booked',     notes:'Confirmed session 9am.', time:'10:05', date:todayStr },
      { id:'CALL-003', name:'Robert Kim',     phone:'+44 7700 900456', direction:'outbound', duration:0, outcome:'no-answer', notes:'Left voicemail.', time:'11:30', date:todayStr },
      { id:'CALL-004', name:'James Mitchell', phone:'+44 7700 333444', direction:'inbound',  duration:12,outcome:'booked',    notes:'Booked new patient intake.', time:'14:22', date:todayStr },
    ], tasks:[
      { id:'TASK-001', text:'Send info pack to Sarah Johnson',   due:todayStr,   done:false, priority:'high' },
      { id:'TASK-002', text:'Chase Robert Kim — no response',    due:todayStr,   done:false, priority:'medium' },
      { id:'TASK-003', text:'Confirm next week schedule',        due:nextDay(1), done:false, priority:'medium' },
      { id:'TASK-004', text:'Submit Marcus Webb insurance form', due:nextDay(2), done:false, priority:'high' },
      { id:'TASK-005', text:'Call back Demo Patient C',          due:todayStr,   done:true,  priority:'low' },
    ]};
    _saveSched(d); return d;
  }

  const data = _loadSched();

  // ── Backend ↔ Frontend appointment mapping ──────────────────────────────────
  const _backendToFrontend = (s) => ({
    id: s.id,
    patient_name: s.patient_name || s.patient_id || 'Unknown',
    patient_id: s.patient_id || '',
    date: s.scheduled_at?.split('T')[0] || '',
    time: s.scheduled_at?.split('T')[1]?.slice(0,5) || '',
    duration: s.duration_minutes || 60,
    type: s.appointment_type || s.modality || 'session',
    status: s.status || 'scheduled',
    clinician: s.clinician_name || s.clinician_id || '',
    notes: s.session_notes || '',
    room_id: s.room_id || '',
    device_id: s.device_id || '',
    recurrence_group: s.recurrence_group || '',
    _from_api: true,
  });

  const _frontendToBackend = (f) => ({
    patient_id: f.patient_id || f.patient_name || 'UNKNOWN',
    scheduled_at: f.date && f.time ? f.date + 'T' + f.time + ':00' : '',
    duration_minutes: parseInt(f.duration) || 60,
    modality: f.type || 'session',
    session_notes: f.notes || '',
  });

  // ── Fetch appointments, leads, calls, tasks from API (parallel) ────────────
  let _apiFetchOk = false;
  let _apiFetchErr = '';
  try {
    const [sessRes, leadsRes, callsRes, tasksRes] = await Promise.allSettled([
      api.listSessions(),
      api.listLeads(),
      api.listReceptionCalls(),
      api.listReceptionTasks(),
    ]);
    // Appointments
    if (sessRes.status === 'fulfilled') {
      const apiApts = (sessRes.value?.items || []).map(_backendToFrontend);
      if (apiApts.length > 0) { data.appointments = apiApts; }
      _apiFetchOk = true;
    } else {
      _apiFetchErr = sessRes.reason?.message || 'Could not reach scheduling API';
    }
    // Leads
    if (leadsRes.status === 'fulfilled') {
      const apiLeads = (leadsRes.value?.items || []).map(l => ({
        id: l.id, name: l.name, email: l.email || '', phone: l.phone || '',
        source: l.source || 'phone', condition: l.condition || '', stage: l.stage || 'new',
        notes: l.notes || '', created: (l.created_at || '').slice(0,10), follow_up: l.follow_up || '',
        _from_api: true,
      }));
      if (apiLeads.length > 0) { data.leads = apiLeads; }
    }
    // Calls
    if (callsRes.status === 'fulfilled') {
      const apiCalls = (callsRes.value?.items || []).map(c => ({
        id: c.id, name: c.name, phone: c.phone || '', direction: c.direction || 'inbound',
        duration: c.duration || 0, outcome: c.outcome || 'info-given', notes: c.notes || '',
        time: c.call_time || '', date: c.call_date || '', _from_api: true,
      }));
      if (apiCalls.length > 0) { data.calls = apiCalls; }
    }
    // Tasks
    if (tasksRes.status === 'fulfilled') {
      const apiTasks = (tasksRes.value?.items || []).map(t => ({
        id: t.id, text: t.text, due: t.due || '', done: !!t.done,
        priority: t.priority || 'medium', _from_api: true,
      }));
      if (apiTasks.length > 0) { data.tasks = apiTasks; }
    }
    _saveSched(data);
  } catch (err) {
    _apiFetchErr = err?.message || 'Could not reach scheduling API';
  }

  // ── Helper: update appointment status via API then local ────────────────────
  async function _apiUpdateStatus(id, newStatus, renderFn, label) {
    const a = data.appointments.find(x => x.id === id);
    if (!a) return;
    const oldStatus = a.status;
    a.status = newStatus;
    _saveSched(data);
    if (renderFn) renderFn();
    if (a._from_api) {
      try { await api.updateSession(id, { status: newStatus }); }
      catch (err) {
        a.status = oldStatus;
        _saveSched(data);
        if (renderFn) renderFn();
        window._dsToast?.({ title: 'Sync failed', body: 'Could not update ' + (label||'status') + ' on server.', severity: 'error' });
      }
    }
  }

  const APT_COLORS = {
    'session':     { bg:'rgba(0,212,188,0.15)',   border:'var(--teal)',   label:'Session' },
    'assessment':  { bg:'rgba(74,158,255,0.15)',  border:'var(--blue)',   label:'Assessment' },
    'new-patient': { bg:'rgba(155,127,255,0.15)', border:'var(--violet)', label:'New Patient' },
    'follow-up':   { bg:'rgba(255,181,71,0.15)',  border:'var(--amber)',  label:'Follow-up' },
    'phone':       { bg:'rgba(74,222,128,0.15)',  border:'var(--green)',  label:'Phone' },
  };
  const STATUS_COLORS = { confirmed:'var(--green)', pending:'var(--amber)', cancelled:'var(--red)', completed:'var(--text-tertiary)', 'no-show':'var(--red)', 'checked-in':'var(--blue)' };
  const STATUS_LABELS = { confirmed:'Confirmed', pending:'Pending', cancelled:'Cancelled', completed:'Completed', 'no-show':'No-show', 'checked-in':'Checked In' };


  // ── Shared appointment detail modal (accessible from all tabs) ──────────
  window._schedViewApt = id=>{
    const a=data.appointments.find(x=>x.id===id); if(!a)return;
    const c=APT_COLORS[a.type]||APT_COLORS.session;
    const sDot=STATUS_COLORS[a.status]||'var(--teal)';
    let existing=document.getElementById('sched-apt-detail'); if(existing)existing.remove();
    const overlay=document.createElement('div');
    overlay.id='sched-apt-detail';
    overlay.className='ch-modal-overlay';
    overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
    overlay.innerHTML='<div class="ch-modal" style="width:min(440px,95vw)">'+
      '<div class="ch-modal-hd"><span>'+a.patient_name+'</span><button class="ch-modal-close" onclick="document.getElementById(\'sched-apt-detail\')?.remove()">&#10005;</button></div>'+
      '<div class="ch-modal-body" style="display:flex;flex-direction:column;gap:10px">'+
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+
          '<span style="font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:2px 8px;border-radius:4px;background:'+c.border+'22;color:'+c.border+'">'+c.label+'</span>'+
          '<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:'+sDot+'"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+sDot+'"></span>'+(STATUS_LABELS[a.status]||a.status)+'</span>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px">'+
          '<span style="color:var(--text-tertiary)">Date</span><span>'+a.date+'</span>'+
          '<span style="color:var(--text-tertiary)">Time</span><span>'+a.time+'</span>'+
          '<span style="color:var(--text-tertiary)">Duration</span><span>'+a.duration+' min</span>'+
          '<span style="color:var(--text-tertiary)">Clinician</span><span>'+a.clinician+'</span>'+
          (a.patient_id?'<span style="color:var(--text-tertiary)">Patient ID</span><span>'+a.patient_id+'</span>':'')+
          (a.room_id?'<span style="color:var(--text-tertiary)">Room</span><span>'+a.room_id+'</span>':'')+
          (a.device_id?'<span style="color:var(--text-tertiary)">Device</span><span>'+a.device_id+'</span>':'')+
          (a.notes?'<span style="color:var(--text-tertiary)">Notes</span><span>'+a.notes+'</span>':'')+
            '<span style="color:var(--text-tertiary)">Reminder</span><span>'+(a.reminder_sent?'<span style="color:var(--green)">&#10003; Sent</span>':'<span style="color:var(--text-tertiary)">Not sent</span>')+'</span>'+
        '</div>'+
        '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">'+
          (a.status==='pending'?'<button class="btn btn-primary btn-sm" onclick="window._schedAptAction(\''+a.id+'\',\'confirmed\')">Confirm</button>':'')+
          (a.status==='confirmed'?'<button class="btn btn-primary btn-sm" onclick="window._schedAptAction(\''+a.id+'\',\'completed\')">Mark Done</button>':'')+
          (a.status==='confirmed'||a.status==='pending'?'<button class="btn btn-sm" style="color:var(--red)" onclick="window._schedAptAction(\''+a.id+'\',\'cancelled\')">Cancel</button>':'')+
          (a.status==='confirmed'||a.status==='pending'?'<button class="btn btn-sm" style="color:var(--amber)" onclick="window._schedAptAction(\''+a.id+'\',\'no-show\')">No-show</button>':'')+
          '<button class="btn btn-sm" onclick="document.getElementById(\'sched-apt-detail\')?.remove()">Close</button>'+
        '</div>'+
      '</div>'+
    '</div>';
    document.body.appendChild(overlay);
  };
  window._schedAptAction = (id,newStatus)=>{
    const a=data.appointments.find(x=>x.id===id);if(!a)return;
    a.status=newStatus;_saveSched(data);
    document.getElementById('sched-apt-detail')?.remove();
    window._dsToast?.({title:(STATUS_LABELS[newStatus]||newStatus),body:a.patient_name+' \u2014 '+a.date+' '+a.time,severity:newStatus==='cancelled'||newStatus==='no-show'?'warn':'success'});
    window._schedHubTab=tab;window._nav('scheduling-hub');
  };

  // ── CALENDAR TAB ───────────────────────────────────────────────────────────
  if (tab === 'calendar') {
    setTopbar('Scheduling', '<button class="btn btn-primary btn-sm" onclick="window._schedNewBooking()">+ Book Appointment</button>');

    window._calWeekOffset = window._calWeekOffset ?? 0;
    const HOURS = Array.from({length:13},(_,i)=>7+i);
    const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    function weekDates(offset) {
      const d = new Date(now);
      const dow = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate()-(dow===0?6:dow-1)+offset*7);
      return Array.from({length:7},(_,i)=>{
        const day=new Date(mon); day.setDate(mon.getDate()+i);
        return { date:day, str:day.getFullYear()+'-'+pad2(day.getMonth()+1)+'-'+pad2(day.getDate()), dow:i };
      });
    }

    function renderCal() {
      const wd = weekDates(window._calWeekOffset);
      const lbl = document.getElementById('cal-week-label');
      if (lbl) lbl.textContent = wd[0].date.toLocaleDateString('en-GB',{day:'numeric',month:'short'})+' — '+wd[6].date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
      const aptByDate = {};
      data.appointments.forEach(a=>{ (aptByDate[a.date]=aptByDate[a.date]||[]).push(a); });
      const grid = document.getElementById('cal-grid'); if (!grid) return;
      const hdrs = '<div class="cal-row cal-header-row"><div class="cal-time-label"></div>'+wd.map(d=>{
        const isToday=d.str===todayStr;
        const cnt=(aptByDate[d.str]||[]).filter(a=>a.status!=='cancelled').length;
        return '<div class="cal-day-header'+(isToday?' cal-day-header--today':'')+'"><div class="cal-day-label">'+DAY_LABELS[d.dow]+'</div><div class="cal-day-num'+(isToday?' cal-today-num':'')+'">'+d.date.getDate()+'</div>'+(cnt?'<div class="cal-day-count">'+cnt+'</div>':'')+'</div>';
      }).join('')+'</div>';
      const rows = HOURS.map(h=>{
        const tl = h<12?h+'am':h===12?'12pm':(h-12)+'pm';
        const cells = wd.map(d=>{
          const slotA = (aptByDate[d.str]||[]).filter(a=>parseInt(a.time)===h);
          return '<div class="cal-cell" tabindex="0" role="button" aria-label="Book slot '+d.str+' '+pad2(h)+':00" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}" onclick="window._schedSlotClick(\''+d.str+'\',\''+pad2(h)+':00\')">'+
            slotA.map(a=>{
              const c=APT_COLORS[a.type]||APT_COLORS.session;
              const sDot=a.status==='confirmed'?'var(--green)':a.status==='pending'?'var(--amber)':'var(--red)';
              const truncName=a.patient_name.length>16?a.patient_name.slice(0,15)+'...':a.patient_name;
              return '<div class="cal-apt" tabindex="0" role="button" aria-label="'+a.patient_name+' '+a.time+' '+c.label+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}" style="background:'+c.bg+';border-left:3px solid '+c.border+'" onclick="event.stopPropagation();window._schedViewApt(\''+a.id+'\')">'+
                '<div class="cal-apt-time" style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+sDot+';flex-shrink:0"></span>'+a.time+' · '+a.duration+'m</div>'+
                '<div class="cal-apt-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+a.patient_name+'">'+truncName+'</div>'+
                '<div class="cal-apt-type"><span style="font-size:9px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;padding:1px 5px;border-radius:3px;background:'+c.border+'22;color:'+c.border+'">'+c.label+'</span>'+(a.recurrence_group?'<span title="Recurring appointment" style="margin-left:4px;font-size:11px;color:var(--text-tertiary);cursor:default">\u21BB</span>':'')+'</div>'+
                ((a.room_id||a.device_id)?'<div style="font-size:9px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(a.room_id||'')+(a.room_id&&a.device_id?' · ':'')+(a.device_id||'')+'</div>':'')+
              '</div>';
            }).join('')+
          '</div>';
        }).join('');
        return '<div class="cal-row"><div class="cal-time-label">'+tl+'</div>'+cells+'</div>';
      }).join('');
      grid.innerHTML = hdrs + rows;
    }

    window._calWeekPrev  = ()=>{ window._calWeekOffset--; renderCal(); };
    window._calWeekNext  = ()=>{ window._calWeekOffset++; renderCal(); };
    window._calWeekToday = ()=>{ window._calWeekOffset=0; renderCal(); };
    window._schedSlotClick = (date,time)=>{ window._schedNewAptDate=date; window._schedNewAptTime=time; document.getElementById('sched-book-modal')?.classList.remove('ch-hidden'); const di=document.getElementById('sched-book-date'); const ti=document.getElementById('sched-book-time'); if(di)di.value=date; if(ti)ti.value=time; };
    window._schedNewBooking = ()=>{ document.getElementById('sched-book-modal')?.classList.remove('ch-hidden'); };
    function _checkConflicts(date,time,dur,clin,room,device,excludeId){
      const startMin=parseInt(time.split(':')[0])*60+parseInt(time.split(':')[1]);
      const endMin=startMin+dur;
      const conflicts=[];
      data.appointments.filter(a=>a.date===date&&a.status!=='cancelled'&&a.id!==excludeId).forEach(a=>{
        const aStart=parseInt(a.time.split(':')[0])*60+parseInt(a.time.split(':')[1]);
        const aEnd=aStart+(a.duration||60);
        if(startMin<aEnd&&endMin>aStart){
          if(clin&&a.clinician===clin)conflicts.push('Clinician '+clin+' already booked at '+a.time);
          if(room&&a.room_id===room)conflicts.push('Room "'+room+'" in use at '+a.time);
          if(device&&a.device_id===device)conflicts.push('Device "'+device+'" in use at '+a.time);
        }
      });
      return conflicts;
    }
    window._schedSaveBooking = ()=>{
      const name=document.getElementById('sched-book-patient')?.value?.trim();
      const date=document.getElementById('sched-book-date')?.value;
      const time=document.getElementById('sched-book-time')?.value;
      const type=document.getElementById('sched-book-type')?.value||'session';
      const dur=parseInt(document.getElementById('sched-book-dur')?.value||'60');
      const clin=document.getElementById('sched-book-clin')?.value?.trim()||'Dr. S. Chen';
      const room=document.getElementById('sched-book-room')?.value||'';
      const device=document.getElementById('sched-book-device')?.value||'';
      const notes=document.getElementById('sched-book-notes')?.value?.trim()||'';
      if(!name||!date||!time){window._dsToast?.({title:'Missing fields',body:'Name, date and time required.',severity:'warn'});return;}
      const conflicts=_checkConflicts(date,time,dur,clin,room,device);
      const warnEl=document.getElementById('sched-conflict-warn');
      if(conflicts.length&&warnEl&&!warnEl.dataset.overridden){
        warnEl.style.display='block';
        warnEl.innerHTML='<strong>Conflicts detected:</strong><br>'+conflicts.join('<br>')+'<br><label style="margin-top:6px;display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" onchange="document.getElementById(\'sched-conflict-warn\').dataset.overridden=this.checked?\'1\':\'\'"> Proceed despite conflicts</label>';
        return;
      }
      const recur=document.getElementById('sched-book-recur')?.value||'';
      const recurEnd=document.getElementById('sched-book-recur-end')?.value||'';
      const recurrenceGroup=recur?'RG-'+Date.now():'';
      const baseApt={patient_name:name,patient_id:'',clinician:clin,time,duration:dur,type,status:'pending',notes,room_id:room,device_id:device};
      if(!recur){
        data.appointments.push(Object.assign({id:'APT-'+Date.now(),date},baseApt));
      } else {
        const MAX_OCCUR=52;
        const endDate=recurEnd?new Date(recurEnd+'T23:59:59'):null;
        let cursor=new Date(date+'T00:00:00');
        let count=0;
        while(count<MAX_OCCUR){
          const dStr=cursor.getFullYear()+'-'+pad2(cursor.getMonth()+1)+'-'+pad2(cursor.getDate());
          if(endDate&&cursor>endDate)break;
          data.appointments.push(Object.assign({},baseApt,{id:'APT-'+Date.now()+'-'+count,date:dStr,recurrence_group:recurrenceGroup}));
          count++;
          if(recur==='daily'){cursor.setDate(cursor.getDate()+1);}
          else if(recur==='weekly'){cursor.setDate(cursor.getDate()+7);}
          else if(recur==='biweekly'){cursor.setDate(cursor.getDate()+14);}
          else if(recur==='monthly'){cursor.setMonth(cursor.getMonth()+1);}
          else break;
        }
      }
      _saveSched(data); document.getElementById('sched-book-modal')?.classList.add('ch-hidden'); if(warnEl){warnEl.style.display='none';delete warnEl.dataset.overridden;} renderCal();
      const countMsg=recur?(data.appointments.filter(a=>a.recurrence_group===recurrenceGroup).length+' recurring appointments created'):'';
      window._dsToast?.({title:'Booking created',body:name+' booked for '+date+' at '+time+(countMsg?' — '+countMsg:''),severity:'success'});
    };

    const todayApts = data.appointments.filter(a=>a.date===todayStr&&a.status!=='cancelled').sort((a,b)=>a.time.localeCompare(b.time));

    // -- Doctor-first: next upcoming appointment --
    const nowHHMM = pad2(now.getHours())+':'+pad2(now.getMinutes());
    const nextApt = todayApts.find(a=>a.time>=nowHHMM) || null;
    const pendingCount = todayApts.filter(a=>a.status==='pending').length;
    const blockers = todayApts.filter(a=>!a.patient_id);
    let upNextCountdown = '';
    if (nextApt) {
      const _sp = nextApt.time.split(':').map(Number);
      const diff = (_sp[0]*60+_sp[1]) - (now.getHours()*60+now.getMinutes());
      upNextCountdown = diff<=0 ? 'Now' : diff<60 ? diff+'min' : Math.floor(diff/60)+'h '+diff%60+'m';
    }
    const typeBreakdown = {};
    todayApts.forEach(a=>{ const c=APT_COLORS[a.type]||APT_COLORS.session; typeBreakdown[a.type]=typeBreakdown[a.type]||{count:0,label:c.label,color:c.border}; typeBreakdown[a.type].count++; });

    el.innerHTML = `
    <div class="ch-shell">
      <div class="ch-tab-bar" role="tablist" aria-label="Scheduling sections">${tabBar()}</div>
      ${!_apiFetchOk ? '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;margin:0 0 8px;border-radius:6px;background:rgba(255,181,71,0.12);border:1px solid var(--amber);font-size:12px;color:var(--amber)"><span>Could not load schedule from server. Showing cached data.</span><button class="ch-btn-sm" style="color:var(--amber);border-color:var(--amber)" onclick="window._nav(\'scheduling-hub\')">Retry</button></div>' : ''}
      <div style="display:flex;align-items:center;gap:16px;padding:10px 16px;margin-bottom:2px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border);flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:200px">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--teal);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          ${nextApt
            ? '<div><div style="font-size:11px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.6px;font-weight:600">Next Patient</div><div style="font-size:13px;font-weight:700;color:var(--text-primary)">'+nextApt.patient_name+' <span style="color:var(--text-tertiary);font-weight:400">at '+nextApt.time+'</span></div><div style="font-size:11px;color:var(--text-secondary)">'+(APT_COLORS[nextApt.type]||APT_COLORS.session).label+'</div></div>'
            : '<div style="font-size:12px;color:var(--text-tertiary)">No more appointments today</div>'}
        </div>
        <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
          <div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--teal)">${todayApts.length}</div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.4px">Today</div></div>
          ${blockers.length ? '<div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--red)">'+blockers.length+'</div><div style="font-size:10px;color:var(--red);text-transform:uppercase;letter-spacing:.4px">Blockers</div></div>' : ''}
          ${pendingCount ? '<div style="text-align:center"><div style="font-size:18px;font-weight:800;color:var(--amber)">'+pendingCount+'</div><div style="font-size:10px;color:var(--amber);text-transform:uppercase;letter-spacing:.4px">Pending</div></div>' : ''}
          ${nextApt ? '<button class="btn btn-primary btn-sm" onclick="window._dsToast?.({title:\'Session started\',body:\'Starting session now\',severity:\'success\'})">Start Session</button>' : ''}
        </div>
      </div>
      <div class="sched-cal-shell" role="tabpanel" aria-label="Calendar">
        <div class="sched-mini-sidebar">
          ${nextApt ? '<div style="padding:10px;border-radius:8px;background:rgba(0,212,188,0.07);border:1px solid rgba(0,212,188,0.2);margin-bottom:12px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--teal);font-weight:700;margin-bottom:4px">Up Next &mdash; '+upNextCountdown+'</div><div style="font-size:13px;font-weight:700;color:var(--text-primary)">'+nextApt.patient_name+'</div><div style="font-size:11px;color:var(--text-secondary)">'+nextApt.time+' &middot; '+(APT_COLORS[nextApt.type]||APT_COLORS.session).label+'</div></div>' : ''}
          <div class="sched-mini-legend-title" role="heading" aria-level="2" style="margin-bottom:8px">Today's Breakdown</div>
          ${Object.values(typeBreakdown).map(t=>'<div class="sched-legend-row" style="display:flex;align-items:center"><span class="sched-legend-dot" style="background:'+t.color+'"></span>'+t.label+' <span style="font-weight:700;margin-left:auto;color:var(--text-primary)">'+t.count+'</span></div>').join('')||'<div style="font-size:11px;color:var(--text-tertiary)">None today</div>'}
          ${pendingCount ? '<div style="margin-top:12px;padding:8px 10px;border-radius:6px;background:rgba(255,181,71,0.07);border:1px solid rgba(255,181,71,0.2);font-size:11px"><span style="font-weight:700;color:var(--amber)">'+pendingCount+' pending</span><span style="color:var(--text-secondary)"> confirmation'+(pendingCount>1?'s':'')+'</span></div>' : ''}
          ${blockers.length ? '<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:rgba(255,107,107,0.07);border:1px solid rgba(255,107,107,0.2);font-size:11px"><span style="font-weight:700;color:var(--red)">'+blockers.length+' blocker'+(blockers.length>1?'s':'')+'</span><div style="margin-top:4px;color:var(--text-secondary)">'+blockers.map(a=>a.patient_name+' &mdash; missing consent').join('<br>')+'</div></div>' : ''}
          <div class="sched-mini-legend-title" role="heading" aria-level="2" style="margin:16px 0 8px">Appointment Types</div>
          ${Object.entries(APT_COLORS).map(([,v])=>'<div class="sched-legend-row"><span class="sched-legend-dot" style="background:'+v.border+'"></span>'+v.label+'</div>').join('')}
          <div class="sched-mini-legend-title" role="heading" aria-level="2" style="margin:16px 0 8px">This Week</div>
          <div class="sched-mini-stat" style="color:var(--teal)">${data.appointments.filter(a=>a.date>=todayStr&&a.status==='confirmed').length} confirmed</div>
          <div class="sched-mini-stat" style="color:var(--amber)">${data.appointments.filter(a=>a.date>=todayStr&&a.status==='pending').length} pending</div>
          <div class="sched-mini-legend-title" style="margin:16px 0 8px;color:var(--violet)">Scheduling Hints</div>
          <div id="sched-ai-hints" style="display:flex;flex-direction:column;gap:6px"></div>
          <div style="font-size:9px;color:var(--text-tertiary);margin-top:6px;font-style:italic;line-height:1.3">AI Advisory &mdash; not auto-booked. Suggestions are advisory. All bookings require manual confirmation.</div>
        </div>
        <div class="sched-cal-main">
          <div class="sched-cal-controls">
            <button class="ch-btn-sm" aria-label="Previous week" onclick="window._calWeekPrev()">&#8249; Prev</button>
            <button class="ch-btn-sm" style="font-weight:700" aria-label="Go to current week" onclick="window._calWeekToday()">Today</button>
            <button class="ch-btn-sm" aria-label="Next week" onclick="window._calWeekNext()">Next &#8250;</button>
            <span id="cal-week-label" style="font-size:13px;font-weight:600;color:var(--text-primary);margin-left:8px"></span>
          </div>
          <div class="cal-grid-wrap"><div id="cal-grid" class="cal-grid"></div></div>
        </div>
      </div>
    </div>
    <div id="sched-book-modal" class="ch-modal-overlay ch-hidden">
      <div class="ch-modal" style="width:min(520px,95vw)">
        <div class="ch-modal-hd"><span>New Appointment</span><button class="ch-modal-close" onclick="document.getElementById('sched-book-modal').classList.add('ch-hidden')">✕</button></div>
        <div class="ch-modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Patient Name</label><input id="sched-book-patient" class="ch-select ch-select--full" placeholder="Patient name…"></div>
            <div class="ch-form-group"><label class="ch-label">Date</label><input id="sched-book-date" type="date" class="ch-select ch-select--full" value="${todayStr}"></div>
            <div class="ch-form-group"><label class="ch-label">Time</label><input id="sched-book-time" type="time" class="ch-select ch-select--full" value="09:00"></div>
            <div class="ch-form-group"><label class="ch-label">Type</label>
              <select id="sched-book-type" class="ch-select ch-select--full"><option value="session">Session</option><option value="assessment">Assessment</option><option value="new-patient">New Patient</option><option value="follow-up">Follow-up</option><option value="phone">Phone</option></select>
            </div>
            <div class="ch-form-group"><label class="ch-label">Duration</label>
              <select id="sched-book-dur" class="ch-select ch-select--full"><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>60 min</option><option value="90">90 min</option></select>
            </div>
            <div class="ch-form-group"><label class="ch-label">Repeat</label>
              <select id="sched-book-recur" class="ch-select ch-select--full">
                <option value="">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div class="ch-form-group"><label class="ch-label">Repeat Until</label>
              <input id="sched-book-recur-end" type="date" class="ch-select ch-select--full">
            </div>
            <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Clinician</label><input id="sched-book-clin" class="ch-select ch-select--full" value="Dr. S. Chen"></div>
            <div class="ch-form-group"><label class="ch-label">Room</label>
              <select id="sched-book-room" class="ch-select ch-select--full"><option value="">No room</option><option value="Room 1">Room 1</option><option value="Room 2">Room 2</option><option value="TMS Suite">TMS Suite</option><option value="EEG Lab">EEG Lab</option><option value="Consultation Room">Consultation Room</option></select>
            </div>
            <div class="ch-form-group"><label class="ch-label">Device</label>
              <select id="sched-book-device" class="ch-select ch-select--full"><option value="">None</option><option value="TMS Coil A">TMS Coil A</option><option value="TMS Coil B">TMS Coil B</option><option value="EEG Cap">EEG Cap</option><option value="tDCS Unit">tDCS Unit</option></select>
            </div>
            <div id="sched-conflict-warn" style="display:none;grid-column:1/-1;padding:8px 12px;border-radius:6px;background:rgba(255,107,107,0.1);border:1px solid var(--red);font-size:12px;color:var(--red)"></div>
            <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Notes</label><textarea id="sched-book-notes" class="ch-textarea" rows="2" placeholder="Appointment notes…"></textarea></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:4px"><button class="btn btn-primary" onclick="window._schedSaveBooking()">Book</button><button class="btn" onclick="document.getElementById('sched-book-modal').classList.add('ch-hidden')">Cancel</button></div>
        </div>
      </div>
    </div>`;
    renderCal();
    // -- AI Scheduling Hints (client-side advisory) ---------------------------
    (function computeSchedulingHints(){
      const hintsEl=document.getElementById('sched-ai-hints');if(!hintsEl)return;
      const hints=[];
      const byDate={};
      data.appointments.filter(a=>a.date>=todayStr&&a.status!=='cancelled').forEach(a=>{(byDate[a.date]=byDate[a.date]||[]).push(a);});
      // 1. Gap detection: >2h gap between same-day appointments
      Object.entries(byDate).forEach(([date,apts])=>{
        apts.sort((a,b)=>a.time.localeCompare(b.time));
        for(let i=1;i<apts.length;i++){
          const prev=apts[i-1],curr=apts[i];
          const pEnd=parseInt(prev.time.split(':')[0])*60+parseInt(prev.time.split(':')[1])+prev.duration;
          const cStart=parseInt(curr.time.split(':')[0])*60+parseInt(curr.time.split(':')[1]);
          if(cStart-pEnd>120){
            const gapStart=String(Math.floor(pEnd/60)).padStart(2,'0')+':'+String(pEnd%60).padStart(2,'0');
            const gapEnd=curr.time;
            hints.push({text:'Gap detected on '+(date===todayStr?'today':date)+': consider scheduling between '+gapStart+' and '+gapEnd,type:'gap'});
          }
        }
      });
      // 2. Follow-up overdue: completed >7 days ago with no future booking
      const patientsWithFuture=new Set(data.appointments.filter(a=>a.date>=todayStr&&a.status!=='cancelled').map(a=>a.patient_name));
      data.appointments.filter(a=>a.status==='completed').forEach(a=>{
        const daysAgo=Math.floor((new Date(todayStr)-new Date(a.date))/(86400000));
        if(daysAgo>7&&!patientsWithFuture.has(a.patient_name)){
          hints.push({text:'Follow-up overdue for '+a.patient_name+' (completed '+daysAgo+' days ago)',type:'overdue'});
        }
      });
      // 3. Heavy schedule: >=4 appointments on a single day
      Object.entries(byDate).forEach(([date,apts])=>{
        if(apts.length>=4){
          hints.push({text:'Heavy schedule on '+(date===todayStr?'today':date)+' ('+apts.length+' appointments) \u2014 consider redistribution',type:'heavy'});
        }
      });
      const show=hints.slice(0,3);
      if(!show.length){hintsEl.innerHTML='<div style="font-size:11px;color:var(--text-tertiary)">No scheduling issues detected.</div>';return;}
      const hColors={gap:'var(--amber)',overdue:'var(--red)',heavy:'var(--violet)'};
      hintsEl.innerHTML=show.map((h,i)=>'<div id="sched-hint-'+i+'" style="font-size:11px;padding:6px 8px;border-radius:5px;background:'+hColors[h.type]+'15;border-left:3px solid '+hColors[h.type]+';display:flex;justify-content:space-between;align-items:flex-start;gap:4px"><span style="flex:1">'+h.text+'</span><button style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:10px;padding:0 2px;flex-shrink:0" onclick="document.getElementById(\'sched-hint-'+i+'\')?.remove()">Dismiss</button></div>').join('');
    })();

  }

  // ── BOOKINGS TAB ───────────────────────────────────────────────────────────
  else if (tab === 'bookings') {
    setTopbar('Scheduling', '<button class="btn btn-primary btn-sm" onclick="window._schedHubTab=\'calendar\';window._nav(\'scheduling-hub\')">+ New Booking</button>');
    const APT_TYPE_LABELS = { session:'Session', assessment:'Assessment', 'new-patient':'New Patient', 'follow-up':'Follow-up', phone:'Phone' };
    const SM = { confirmed:{color:'var(--green)',bg:'rgba(74,222,128,0.12)',label:'Confirmed'}, pending:{color:'var(--amber)',bg:'rgba(255,181,71,0.12)',label:'Pending'}, completed:{color:'var(--text-tertiary)',bg:'rgba(255,255,255,0.06)',label:'Completed'}, cancelled:{color:'var(--red)',bg:'rgba(255,107,107,0.12)',label:'Cancelled'}, 'no-show':{color:'var(--red)',bg:'rgba(255,107,107,0.08)',label:'No-show'} };
    const COHORTS = [
      { id:'all',       label:'All',       fn:a=>a },
      { id:'today',     label:'Today',     fn:a=>a.filter(x=>x.date===todayStr) },
      { id:'upcoming',  label:'Upcoming',  fn:a=>a.filter(x=>x.date>=todayStr&&x.status!=='cancelled') },
      { id:'pending',   label:'Pending',   fn:a=>a.filter(x=>x.status==='pending') },
      { id:'completed', label:'Completed', fn:a=>a.filter(x=>x.status==='completed') },
      { id:'no-show',   label:'No-show',   fn:a=>a.filter(x=>x.status==='no-show') },
    ];
    window._bookCohort = window._bookCohort || 'upcoming';

    function renderBookings(cid) {
      const cohort = COHORTS.find(c=>c.id===cid)||COHORTS[0];
      const q = (document.getElementById('book-search')?.value||'').toLowerCase();
      let list = cohort.fn(data.appointments);
      if (q) list=list.filter(a=>(a.patient_name||'').toLowerCase().includes(q)||(a.clinician||'').toLowerCase().includes(q));
      list.sort((a,b)=>a.date===b.date?a.time.localeCompare(b.time):a.date.localeCompare(b.date));
      const out=document.getElementById('book-list'); if(!out)return;
      if(!list.length){out.innerHTML='<div class="ch-empty">No bookings found.</div>';return;}
      out.innerHTML=list.map(a=>{
        const sm=SM[a.status]||SM.confirmed;
        return '<div class="book-row">'+
          '<div class="book-datetime"><div class="book-date'+(a.date===todayStr?' book-date--today':'')+'">'+( a.date===todayStr?'Today':a.date)+'</div><div class="book-time">'+a.time+' · '+a.duration+'min</div></div>'+
          '<div class="book-info" style="cursor:pointer" onclick="window._schedViewApt(\''+a.id+'\')"><div class="book-patient">'+a.patient_name+'</div><div class="book-clinician">'+a.clinician+' · '+(APT_TYPE_LABELS[a.type]||a.type)+'</div>'+(a.notes?'<div class="book-notes">'+a.notes.slice(0,80)+(a.notes.length>80?'…':'')+'</div>':'')+'</div>'+
          '<div class="book-status-col"><span class="book-status-badge" style="color:'+sm.color+';background:'+sm.bg+'">'+sm.label+'</span></div>'+
          '<div class="book-actions">'+
            (a.status==='pending'?'<button class="ch-btn-sm ch-btn-teal" onclick="window._bookConfirm(\''+a.id+'\')">Confirm</button>':'')+
            (a.status==='confirmed'||a.status==='pending'?'<button class="ch-btn-sm" onclick="window._bookCancel(\''+a.id+'\')">Cancel</button>':'')+
            (a.status==='confirmed'?'<button class="ch-btn-sm" onclick="window._bookComplete(\''+a.id+'\')">Done ✓</button>':'')+
            ((a.status==='confirmed'||a.status==='pending')&&!a.reminder_sent?'<button class="ch-btn-sm" onclick="window._bookSendReminder(\''+a.id+'\')">Remind</button>':'')+
          '</div>'+
        '</div>';
      }).join('');
    }

    window._bookSetCohort = id=>{window._bookCohort=id;document.querySelectorAll('.book-cohort-btn').forEach(b=>b.classList.toggle('active',b.dataset.cohort===id));renderBookings(id);};
    window._bookSendReminder = async id=>{const a=data.appointments.find(x=>x.id===id);if(!a||a.reminder_sent)return;try{await api.sendReminderMessage({patient_id:a.patient_id||a.patient_name,channel:'email',message_body:'Reminder: You have an appointment on '+a.date+' at '+a.time+'. Please confirm or reschedule.'});}catch{}a.reminder_sent=true;_saveSched(data);renderBookings(window._bookCohort);window._dsToast?.({title:'Reminder sent',body:a.patient_name+' — '+a.date,severity:'success'});};
    window._bookConfirm   = id=>{const a=data.appointments.find(x=>x.id===id);if(a){_apiUpdateStatus(id,'confirmed',()=>renderBookings(window._bookCohort),'Confirm');window._dsToast?.({title:'Confirmed',body:a.patient_name+' confirmed.',severity:'success'});}};
    window._bookCancel    = id=>{const a=data.appointments.find(x=>x.id===id);if(a){_apiUpdateStatus(id,'cancelled',()=>renderBookings(window._bookCohort),'Cancel');window._dsToast?.({title:'Cancelled',body:a.patient_name+' cancelled.',severity:'warn'});}};
    window._bookComplete  = id=>{const a=data.appointments.find(x=>x.id===id);if(a){_apiUpdateStatus(id,'completed',()=>renderBookings(window._bookCohort),'Complete');window._dsToast?.({title:'Completed',body:'Session marked complete.',severity:'success'});}};

    el.innerHTML=`
    <div class="ch-shell">
      <div class="ch-tab-bar" role="tablist" aria-label="Scheduling sections">${tabBar()}</div>
      <div class="ph-layout" role="tabpanel" aria-label="Bookings">
        <div class="ph-rail">
          <div class="ph-rail-label">Filter</div>
          ${COHORTS.map(c=>'<div class="ph-cohort-item book-cohort-btn'+(c.id===window._bookCohort?' active':'')+'" data-cohort="'+c.id+'" onclick="window._bookSetCohort(\''+c.id+'\')">' +
            '<span>'+c.label+'</span><span class="ph-cohort-count">'+c.fn(data.appointments).length+'</span></div>').join('')}
        </div>
        <div class="ph-main">
          <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
            <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${data.appointments.filter(a=>a.date===todayStr&&a.status!=='cancelled').length}</div><div class="ch-kpi-label">Today</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${data.appointments.filter(a=>a.date>=todayStr&&a.status==='confirmed').length}</div><div class="ch-kpi-label">Confirmed</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${data.appointments.filter(a=>a.status==='pending').length}</div><div class="ch-kpi-label">Pending</div></div>
            <div class="ch-kpi-card" style="--kpi-color:var(--red)"><div class="ch-kpi-val">${data.appointments.filter(a=>a.status==='no-show').length}</div><div class="ch-kpi-label">No-shows</div></div>
          </div>
          <div class="ch-card">
            <div class="ch-card-hd">
              <span class="ch-card-title">Appointments</span>
              <div style="position:relative;flex:1;max-width:260px">
                <input id="book-search" type="text" placeholder="Search patient…" class="ph-search-input" oninput="window._bookSetCohort(window._bookCohort)">
                <svg viewBox="0 0 24 24" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:var(--text-tertiary);fill:none;stroke-width:2;stroke-linecap:round;pointer-events:none"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
            </div>
            <div id="book-list"></div>
          </div>
        </div>
      </div>
    </div>`;
    renderBookings(window._bookCohort);
  }

  // ── LEADS TAB ──────────────────────────────────────────────────────────────
  else if (tab === 'leads') {
    setTopbar('Scheduling','<button class="btn btn-primary btn-sm" onclick="window._leadAddModal()">+ New Lead</button>');
    const STAGES=[
      {id:'new',       label:'New',       color:'var(--blue)'},
      {id:'contacted', label:'Contacted', color:'var(--violet)'},
      {id:'qualified', label:'Qualified', color:'var(--amber)'},
      {id:'booked',    label:'Booked',    color:'var(--teal)'},
      {id:'lost',      label:'Lost',      color:'var(--text-tertiary)'},
    ];
    const SRC_ICONS={website:'🌐',referral:'👥',phone:'📞','walk-in':'🚶'};

    function renderLeads(){
      const out=document.getElementById('leads-kanban');if(!out)return;
      out.innerHTML=STAGES.map(stage=>{
        const cards=data.leads.filter(l=>l.stage===stage.id);
        return '<div class="lead-col">'+
          '<div class="lead-col-hd" style="border-top:3px solid '+stage.color+'"><span class="lead-col-label">'+stage.label+'</span><span class="lead-col-count" style="background:'+stage.color+'22;color:'+stage.color+'">'+cards.length+'</span></div>'+
          (cards.length?cards.map(l=>'<div class="lead-card">'+
            '<div class="lead-card-top"><div class="lead-name">'+l.name+'</div><span class="lead-source">'+( SRC_ICONS[l.source]||'📋')+'</span></div>'+
            '<div class="lead-condition">'+l.condition+'</div>'+
            (l.follow_up?'<div class="lead-followup">Follow-up: <strong>'+l.follow_up+'</strong></div>':'')+
            (l.notes?'<div class="lead-notes">'+l.notes.slice(0,80)+(l.notes.length>80?'…':'')+'</div>':'')+
            '<div class="lead-actions">'+
              '<span class="lead-phone" onclick="window._dsToast?.({title:\'Call: \'+\''+l.name+'\',body:\''+l.phone+'\',severity:\'info\'})">📞</span>'+
              (stage.id!=='booked'&&stage.id!=='lost'?'<button class="ch-btn-sm ch-btn-teal" onclick="window._leadAdvance(\''+l.id+'\')">Advance →</button>':'')+
              (stage.id==='qualified'?'<button class="ch-btn-sm" onclick="window._schedHubTab=\'calendar\';window._nav(\'scheduling-hub\')">Book</button>':'')+
            '</div>'+
          '</div>').join(''):'<div class="lead-empty">No leads</div>')+
        '</div>';
      }).join('');
    }

    window._leadAdvance = async id=>{
      const l=data.leads.find(x=>x.id===id);if(!l)return;
      const order=['new','contacted','qualified','booked'];
      const idx=order.indexOf(l.stage);
      if(idx>=0&&idx<order.length-1){
        const newStage=order[idx+1];
        l.stage=newStage;
        if(l.stage==='booked'){
          const aptDate=l.follow_up||todayStr;
          data.appointments.push({id:'APT-'+Date.now(),patient_name:l.name,patient_id:'',clinician:'Dr. S. Chen',date:aptDate,time:'10:00',duration:45,type:'new-patient',status:'pending',notes:'Converted from lead: '+(l.condition||'General')});
          window._dsToast?.({title:'Lead converted \u2014 booking created',body:l.name+' booked for '+aptDate+' at 10:00',severity:'success'});
        } else {
          window._dsToast?.({title:'Advanced',body:l.name+' \u2192 '+l.stage,severity:'success'});
        }
        _saveSched(data);renderLeads();
        try { await api.updateLead(id, { stage: newStage }); } catch(e) { console.warn('Lead advance sync failed:', e?.message); }
      }
    };
    window._leadAddModal=()=>document.getElementById('lead-add-modal')?.classList.remove('ch-hidden');
    window._leadSave=async()=>{
      const name=document.getElementById('lead-name')?.value?.trim();
      if(!name){window._dsToast?.({title:'Name required',body:'',severity:'warn'});return;}
      const newLead={id:'LEAD-'+Date.now(),name,phone:document.getElementById('lead-phone')?.value||'',email:document.getElementById('lead-email')?.value||'',source:document.getElementById('lead-source')?.value||'phone',condition:document.getElementById('lead-cond')?.value||'Not specified',stage:'new',notes:'',created:todayStr,follow_up:nextDay(1)};
      data.leads.push(newLead);
      _saveSched(data);document.getElementById('lead-add-modal')?.classList.add('ch-hidden');renderLeads();
      window._dsToast?.({title:'Lead added',body:name+' added.',severity:'success'});
      try {
        const created = await api.createLead({name:newLead.name,phone:newLead.phone,email:newLead.email,source:newLead.source,condition:newLead.condition,stage:'new',follow_up:newLead.follow_up});
        if(created?.id){newLead.id=created.id;newLead._from_api=true;_saveSched(data);}
      } catch(e) { console.warn('Lead create sync failed:', e?.message); }
    };

    el.innerHTML=`
    <div class="ch-shell">
      <div class="ch-tab-bar" role="tablist" aria-label="Scheduling sections">${tabBar()}</div>
      <div class="ch-body" role="tabpanel" aria-label="Leads">
        <div class="ch-kpi-strip" style="grid-template-columns:repeat(6,1fr);margin-bottom:16px">
          ${STAGES.map(s=>'<div class="ch-kpi-card" style="--kpi-color:'+s.color+'"><div class="ch-kpi-val">'+data.leads.filter(l=>l.stage===s.id).length+'</div><div class="ch-kpi-label">'+s.label+'</div></div>').join('')}
          <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${(()=>{const b=data.leads.filter(l=>l.stage==='booked').length;const lo=data.leads.filter(l=>l.stage==='lost').length;return (b+lo)>0?Math.round(b/(b+lo)*100)+'%':'\u2014';})()}</div><div class="ch-kpi-label">Conversion Rate</div></div>
        </div>
        <div id="leads-kanban" class="leads-kanban"></div>
      </div>
    </div>
    <div id="lead-add-modal" class="ch-modal-overlay ch-hidden">
      <div class="ch-modal" style="width:min(440px,95vw)">
        <div class="ch-modal-hd"><span>Add Lead</span><button class="ch-modal-close" onclick="document.getElementById('lead-add-modal').classList.add('ch-hidden')">✕</button></div>
        <div class="ch-modal-body">
          <div class="ch-form-group"><label class="ch-label">Full Name *</label><input id="lead-name" class="ch-select ch-select--full" placeholder="Name"></div>
          <div class="ch-form-group"><label class="ch-label">Phone</label><input id="lead-phone" class="ch-select ch-select--full" placeholder="+44 7700…"></div>
          <div class="ch-form-group"><label class="ch-label">Email</label><input id="lead-email" class="ch-select ch-select--full" type="email"></div>
          <div class="ch-form-group"><label class="ch-label">Condition / Reason</label><input id="lead-cond" class="ch-select ch-select--full" placeholder="e.g. Depression"></div>
          <div class="ch-form-group"><label class="ch-label">Source</label>
            <select id="lead-source" class="ch-select ch-select--full"><option value="phone">Phone</option><option value="website">Website</option><option value="referral">Referral</option><option value="walk-in">Walk-in</option></select>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-primary" onclick="window._leadSave()">Add Lead</button><button class="btn" onclick="document.getElementById('lead-add-modal').classList.add('ch-hidden')">Cancel</button></div>
        </div>
      </div>
    </div>`;
    renderLeads();
  }

  // ── RECEPTION TAB ─────────────────────────────────────────────────────────
  else if (tab === 'reception') {
    setTopbar('Scheduling','<button class="btn btn-primary btn-sm" onclick="window._receptionLogCall()">+ Log Call</button>');
    const OM={ booked:{color:'var(--teal)',label:'Booked'}, callback:{color:'var(--amber)',label:'Callback'}, 'no-answer':{color:'var(--text-tertiary)',label:'No Answer'}, voicemail:{color:'var(--blue)',label:'Voicemail'}, 'info-given':{color:'var(--green)',label:'Info Given'} };
    window._recCallFilter = window._recCallFilter||'today';

    window._recRenderReception = function(){ renderReception(); };
    function renderReception(){
      const out=document.getElementById('rec-content');if(!out)return;
      const todayApts=data.appointments.filter(a=>a.date===todayStr&&a.status!=='cancelled').sort((a,b)=>a.time.localeCompare(b.time));
      const tasks=data.tasks.sort((a,b)=>a.done-b.done||a.due.localeCompare(b.due));
      const cf=window._recCallFilter;
      const calls=(cf==='today'?data.calls.filter(c=>c.date===todayStr):cf==='inbound'?data.calls.filter(c=>c.direction==='inbound'):cf==='outbound'?data.calls.filter(c=>c.direction==='outbound'):data.calls);

      out.innerHTML=`
      <div class="rec-grid">
        <div class="ch-card rec-card">
          <div class="ch-card-hd"><span class="ch-card-title">Today's Schedule</span><span style="font-size:11px;color:var(--text-tertiary)">${todayApts.length} apts</span></div>
          ${todayApts.length?todayApts.map(a=>{
            const nowHHMM=pad2(new Date().getHours())+':'+pad2(new Date().getMinutes());
            const isPast=a.time<nowHHMM;
            const canCheckIn=(a.status==='confirmed'||a.status==='pending');
            const canNoShow=isPast&&(a.status==='confirmed'||a.status==='pending');
            const isCheckedIn=(a.status==='checked-in');
            const isCompleted=(a.status==='completed');
            const sLabel=a.status==='checked-in'?'Checked In':(STATUS_LABELS[a.status]||a.status);
            return '<div class="rec-apt-row" style="flex-wrap:wrap"><span class="rec-apt-time">'+a.time+'</span><div class="rec-apt-info"><div class="rec-apt-name">'+a.patient_name+'</div><div class="rec-apt-type">'+a.clinician+'</div></div><span class="rec-apt-status" style="color:'+(STATUS_COLORS[a.status]||'var(--teal)')+'">\u25cf '+sLabel+'</span>'+
              '<div style="display:flex;gap:4px;margin-left:auto;margin-top:4px">'+
              (canCheckIn?'<button class="ch-btn-sm ch-btn-teal" onclick="event.stopPropagation();window._recCheckIn(\''+a.id+'\')">Check In</button>':'')+
              (canNoShow?'<button class="ch-btn-sm" style="color:var(--red)" onclick="event.stopPropagation();window._recNoShow(\''+a.id+'\')">No Show</button>':'')+
              (isCheckedIn?'<button class="ch-btn-sm" onclick="event.stopPropagation();window._recMarkDone(\''+a.id+'\')">Complete</button>':'')+
              (isCompleted?'<button class="ch-btn-sm ch-btn-teal" onclick="event.stopPropagation();window._recFollowUp(\''+a.id+'\')">Schedule Follow-up</button>':'')+
              '</div></div>';
          }).join(''):'<div class="ch-empty" style="padding:20px">No appointments today</div>'}
        </div>
        <div class="ch-card rec-card">
          <div class="ch-card-hd"><span class="ch-card-title">Tasks</span><button class="ch-btn-sm ch-btn-teal" onclick="window._recAddTask()">+ Task</button></div>
          <div id="rec-task-list">
            ${tasks.map(t=>'<div class="rec-task-row'+(t.done?' rec-task--done':'')+'"><input type="checkbox"'+(t.done?' checked':'')+' onclick="window._recToggleTask(\''+t.id+'\')" style="cursor:pointer;accent-color:var(--teal)"><div class="rec-task-body"><div class="rec-task-text">'+t.text+'</div><div class="rec-task-meta">Due: '+t.due+' · <span style="color:'+(t.priority==='high'?'var(--red)':t.priority==='medium'?'var(--amber)':'var(--text-tertiary)')+'">'+t.priority+'</span></div></div></div>').join('')}
          </div>
        </div>
        <div class="ch-card rec-card" style="grid-column:1/-1">
          <div class="ch-card-hd">
            <span class="ch-card-title">Call Log</span>
            <div style="display:flex;gap:4px">
              ${['today','inbound','outbound','all'].map(f=>'<button class="ch-btn-sm'+(window._recCallFilter===f?' ch-btn-teal':'')+'" onclick="window._recCallFilter=\''+f+'\';window._recRenderReception()">'+f.charAt(0).toUpperCase()+f.slice(1)+'</button>').join('')}
            </div>
          </div>
          ${calls.length?calls.map(c=>{
            const om=OM[c.outcome]||OM['info-given'];
            const dirC=c.direction==='inbound'?'var(--teal)':'var(--blue)';
            return '<div class="book-row"><div class="book-datetime"><div class="book-date">'+c.date+'</div><div class="book-time">'+c.time+'</div></div><div class="book-info"><div class="book-patient">'+c.name+'</div><div class="book-clinician">'+c.phone+(c.duration?' · '+c.duration+'m':'')+'</div>'+(c.notes?'<div class="book-notes">'+c.notes+'</div>':'')+'</div><div style="flex-shrink:0"><span style="font-size:11px;font-weight:700;color:'+dirC+'">'+(c.direction==='inbound'?'↙ In':'↗ Out')+'</span></div><div class="book-status-col"><span class="book-status-badge" style="color:'+om.color+';background:'+om.color+'22">'+om.label+'</span></div></div>';
          }).join(''):'<div class="ch-empty">No calls logged.</div>'}
        </div>
      </div>`;
    }

    window._recToggleTask = async id=>{const t=data.tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;_saveSched(data);renderReception();try{await api.updateReceptionTask(id,{done:t.done});}catch(e){console.warn('Task toggle sync failed:',e?.message);}};
    window._recAddTask = async()=>{const text=prompt('Task:');if(!text)return;const newTask={id:'TASK-'+Date.now(),text,due:todayStr,done:false,priority:'medium'};data.tasks.push(newTask);_saveSched(data);renderReception();try{const created=await api.createReceptionTask({text,due:todayStr,priority:'medium'});if(created?.id){newTask.id=created.id;newTask._from_api=true;_saveSched(data);}}catch(e){console.warn('Task create sync failed:',e?.message);}};
    window._recCheckIn = id=>{const a=data.appointments.find(x=>x.id===id);if(!a)return;a.status='checked-in';a.checked_in_at=new Date().toISOString();_saveSched(data);renderReception();window._dsToast?.({title:'Patient checked in',body:a.patient_name+' at '+new Date().toLocaleTimeString(),severity:'success'});};
    window._recNoShow = id=>{const a=data.appointments.find(x=>x.id===id);if(!a)return;a.status='no-show';a.no_show_at=new Date().toISOString();_saveSched(data);renderReception();window._dsToast?.({title:'Marked no-show',body:a.patient_name,severity:'warn'});};
    window._recMarkDone = id=>{const a=data.appointments.find(x=>x.id===id);if(!a)return;a.status='completed';a.completed_at=new Date().toISOString();_saveSched(data);renderReception();window._dsToast?.({title:'Session complete',body:a.patient_name+' session complete.',severity:'success'});};
    window._recFollowUp = id=>{const a=data.appointments.find(x=>x.id===id);if(!a)return;const fuDate=nextDay(7);data.appointments.push({id:'APT-'+Date.now(),patient_name:a.patient_name,patient_id:a.patient_id||'',clinician:a.clinician,date:fuDate,time:a.time,duration:a.duration,type:'follow-up',status:'pending',notes:'Follow-up from '+todayStr});_saveSched(data);renderReception();window._dsToast?.({title:'Follow-up scheduled',body:a.patient_name+' on '+fuDate,severity:'success'});};
    window._receptionLogCall=()=>document.getElementById('rec-call-modal')?.classList.remove('ch-hidden');
    window._recSaveCall=async()=>{
      const name=document.getElementById('rc-name')?.value?.trim();if(!name){window._dsToast?.({title:'Name required',body:'',severity:'warn'});return;}
      const h=new Date();
      const callTime=pad2(h.getHours())+':'+pad2(h.getMinutes());
      const newCall={id:'CALL-'+Date.now(),name,phone:document.getElementById('rc-phone')?.value||'',direction:document.getElementById('rc-dir')?.value||'inbound',duration:parseInt(document.getElementById('rc-dur')?.value||'0'),outcome:document.getElementById('rc-outcome')?.value||'info-given',notes:document.getElementById('rc-notes')?.value||'',time:callTime,date:todayStr};
      data.calls.unshift(newCall);
      _saveSched(data);document.getElementById('rec-call-modal')?.classList.add('ch-hidden');renderReception();
      window._dsToast?.({title:'Call logged',severity:'success'});
      try{const created=await api.createReceptionCall({name:newCall.name,phone:newCall.phone,direction:newCall.direction,duration:newCall.duration,outcome:newCall.outcome,notes:newCall.notes,call_time:callTime,call_date:todayStr});if(created?.id){newCall.id=created.id;newCall._from_api=true;_saveSched(data);}}catch(e){console.warn('Call log sync failed:',e?.message);}
    };

    el.innerHTML=`
    <div class="ch-shell">
      <div class="ch-tab-bar" role="tablist" aria-label="Scheduling sections">${tabBar()}</div>
      <div class="ch-body" role="tabpanel" aria-label="Reception">
        <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
          <div class="ch-kpi-card" style="--kpi-color:var(--teal)"><div class="ch-kpi-val">${data.appointments.filter(a=>a.date===todayStr&&a.status!=='cancelled').length}</div><div class="ch-kpi-label">Today's Apts</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${data.calls.filter(c=>c.date===todayStr).length}</div><div class="ch-kpi-label">Calls Today</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--amber)"><div class="ch-kpi-val">${data.tasks.filter(t=>!t.done&&t.due<=todayStr).length}</div><div class="ch-kpi-label">Tasks Due</div></div>
          <div class="ch-kpi-card" style="--kpi-color:var(--violet)"><div class="ch-kpi-val">${data.leads.filter(l=>l.follow_up===todayStr).length}</div><div class="ch-kpi-label">Follow-ups</div></div>
        </div>
        <div id="rec-content"></div>
      </div>
    </div>
    <div id="rec-call-modal" class="ch-modal-overlay ch-hidden">
      <div class="ch-modal" style="width:min(440px,95vw)">
        <div class="ch-modal-hd"><span>Log Phone Call</span><button class="ch-modal-close" onclick="document.getElementById('rec-call-modal').classList.add('ch-hidden')">✕</button></div>
        <div class="ch-modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Name *</label><input id="rc-name" class="ch-select ch-select--full" placeholder="Patient / contact name"></div>
            <div class="ch-form-group"><label class="ch-label">Phone</label><input id="rc-phone" class="ch-select ch-select--full" placeholder="+44 7700…"></div>
            <div class="ch-form-group"><label class="ch-label">Duration (min)</label><input id="rc-dur" type="number" min="0" value="5" class="ch-select ch-select--full"></div>
            <div class="ch-form-group"><label class="ch-label">Direction</label><select id="rc-dir" class="ch-select ch-select--full"><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></div>
            <div class="ch-form-group"><label class="ch-label">Outcome</label><select id="rc-outcome" class="ch-select ch-select--full"><option value="booked">Booked</option><option value="info-given">Info Given</option><option value="callback">Callback</option><option value="voicemail">Voicemail</option><option value="no-answer">No Answer</option></select></div>
            <div class="ch-form-group" style="grid-column:1/-1"><label class="ch-label">Notes</label><textarea id="rc-notes" class="ch-textarea" rows="2" placeholder="Call summary…"></textarea></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:4px"><button class="btn btn-primary" onclick="window._recSaveCall()">Save Call</button><button class="btn" onclick="document.getElementById('rec-call-modal').classList.add('ch-hidden')">Cancel</button></div>
        </div>
      </div>
    </div>`;
    renderReception();
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
  const TAB_META = {
    conditions: { label: 'Conditions',         color: 'var(--blue)'   },
    devices:    { label: 'Devices',            color: 'var(--teal)'   },
    packages:   { label: 'Condition Packages', color: 'var(--rose)'   },
    evidence:   { label: 'Evidence & Search',  color: 'var(--violet)' },
    review:     { label: 'Needs Review',       color: 'var(--amber)'  },
  };
  const el = document.getElementById('content');
  const esc = libraryHelpers.esc;
  const actor = (typeof currentUser === 'function' ? currentUser() : null) || {};
  const actorRole = (actor?.role || actor?.actor_role || '').toLowerCase();
  const isAdmin = actorRole === 'admin' || actorRole === 'superadmin';

  function tabBar() {
    return Object.entries(TAB_META).map(([id, m]) =>
      '<button role="tab" aria-selected="' + (tab === id) + '" tabindex="' + (tab === id ? '0' : '-1') + '"' +
      ' class="ch-tab' + (tab === id ? ' ch-tab--active' : '') + '"' +
      (tab === id ? ' style="--tab-color:' + m.color + '"' : '') +
      ' onclick="window._libraryHubTab=\'' + id + '\';window._nav(\'library-hub\')">' + esc(m.label) + '</button>'
    ).join('');
  }
  // Spend gauge pill (spec §6-D). Rendered next to the admin refresh button.
  // Populated async on first paint so the topbar is never held up by a
  // literature-watch fetch failure.
  const spendPillId = 'lib-spend-pill';
  const spendPillHtml =
    '<span id="' + spendPillId + '" class="lib-spend-pill" ' +
    'title="Monthly paid literature-watch spend — PubMed is free and not counted" ' +
    'style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;' +
    'background:rgba(0,212,188,0.10);color:var(--teal);border:1px solid rgba(0,212,188,0.25);' +
    'font-size:11px;font-weight:600;margin-right:8px">Literature spend: loading…</span>';
  const adminBtn = isAdmin
    ? '<button class="btn btn-sm" onclick="window._libAdminRefresh()" title="Admin-only: rebuild curated evidence index">↻ Refresh evidence</button>'
    : '';
  setTopbar('Library', spendPillHtml + adminBtn);
  // Fire the spend query after render — colour ambers >80%, red >95%.
  setTimeout(async () => {
    try {
      const s = await api.litWatchSpend();
      const pill = document.getElementById(spendPillId);
      if (!pill) return;
      const cap = Number(s?.budget_cap_usd || 100);
      const spent = Number(s?.total_usd || 0);
      const pct = cap > 0 ? (spent / cap) * 100 : 0;
      let bg = 'rgba(0,212,188,0.10)', fg = 'var(--teal)', bd = 'rgba(0,212,188,0.25)';
      if (pct > 95) { bg = 'rgba(239,68,68,0.12)'; fg = 'var(--red)'; bd = 'rgba(239,68,68,0.35)'; }
      else if (pct > 80) { bg = 'rgba(245,158,11,0.14)'; fg = 'var(--amber)'; bd = 'rgba(245,158,11,0.35)'; }
      pill.style.background = bg; pill.style.color = fg; pill.style.borderColor = bd;
      pill.textContent = 'Literature spend this month: $' + spent.toFixed(2) + ' / $' + cap.toFixed(0) + ' limit';
    } catch {
      const pill = document.getElementById(spendPillId);
      if (pill) pill.textContent = 'Literature spend: —';
    }
  }, 0);

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

  // ── Literature Watch review handlers (spec §6-C, §7) ────────────────────
  // These wire up the Needs Review tab row actions + the per-protocol
  // "Refresh literature (PubMed)" button. All three row actions hit
  // POST /api/v1/literature-watch/{pmid}/review and re-render on success.
  window._litwReview = async (pmid, protocolId, verdict, rowEl) => {
    const safePmid = String(pmid || '');
    if (!safePmid) return;
    try {
      if (verdict === 'not-relevant' && rowEl) {
        // Optimistic hide with a short fade-out — the row stays in the DB
        // for audit (spec §7: "never deleted").
        rowEl.style.transition = 'opacity 200ms ease, transform 200ms ease';
        rowEl.style.opacity = '0';
        rowEl.style.transform = 'translateX(-8px)';
      }
      const res = await api.litWatchReview(safePmid, { verdict, protocol_id: protocolId });
      if (verdict === 'promoted') {
        window._dsToast?.({
          title: 'Queued for promotion',
          body: 'PMID ' + safePmid + ' queued for promotion to references (clinician-only; applied on next build)',
          severity: 'success',
        });
      } else if (verdict === 'relevant') {
        window._dsToast?.({ title: 'Marked relevant', body: 'PMID ' + safePmid, severity: 'success' });
      } else if (verdict === 'not-relevant') {
        window._dsToast?.({ title: 'Hidden from queue', body: 'PMID ' + safePmid, severity: 'info' });
      }
      // Re-render the queue so the row reflects the updated verdict.
      if (verdict !== 'not-relevant') {
        // short delay so the toast is visible before the redraw
        setTimeout(() => window._nav('library-hub'), 200);
      } else if (rowEl) {
        setTimeout(() => { rowEl.remove(); }, 220);
      }
      return res;
    } catch (e) {
      if (rowEl && verdict === 'not-relevant') {
        rowEl.style.opacity = ''; rowEl.style.transform = '';
      }
      window._dsToast?.({ title: 'Review failed', body: e?.message || 'Unknown error', severity: 'error' });
    }
  };

  window._litwRefreshProtocol = async (protocolId, btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Refreshing…';
    try {
      const res = await api.litWatchRefresh(protocolId, { source: 'pubmed' });
      const jobId = res?.job_id;
      if (!jobId) throw new Error('no job id returned');
      // Poll /jobs every 2s until status is not queued/running (max ~60s).
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const jl = await api.litWatchJobs(protocolId);
          const job = (jl?.items || []).find((j) => j.id === jobId);
          if (!job) continue;
          if (job.status === 'done' || job.status === 'succeeded') {
            btn.textContent = '✓ ' + (job.new_papers_count || 0) + ' new paper' + (job.new_papers_count === 1 ? '' : 's');
            window._dsToast?.({
              title: 'Refresh complete',
              body: protocolId + ' — ' + (job.new_papers_count || 0) + ' new paper(s)',
              severity: 'success',
            });
            break;
          }
          if (job.status === 'failed') {
            btn.textContent = 'Failed';
            window._dsToast?.({ title: 'Refresh failed', body: job.error || 'adapter missing', severity: 'error' });
            break;
          }
        } catch { /* keep polling */ }
      }
    } catch (e) {
      btn.textContent = 'Failed';
      window._dsToast?.({ title: 'Refresh failed', body: e?.message || 'Unknown error', severity: 'error' });
    } finally {
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 4000);
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

  // ── TAB: NEEDS REVIEW (spec §6-C) ──────────────────────────────────────
  // Cross-protocol pending queue from literature_watch. Three row actions
  // per paper: Mark relevant / Promote to references / Not relevant.
  // A "Protocols requiring review" card lists the top protocols with
  // pending items and exposes a "Refresh literature (PubMed)" button per
  // protocol (spec §5).
  else if (tab === 'review') {
    let pending = { items: [], total: 0 };
    let pendingErr = null;
    try {
      pending = await api.litWatchPending({ limit: 100, offset: 0 });
    } catch (e) {
      pendingErr = e?.message || 'Could not load review queue';
    }
    const items = Array.isArray(pending?.items) ? pending.items : [];

    // Group by protocol_id so we can surface a "requires review" list of
    // protocols and let clinicians refresh them individually.
    const byProtocol = {};
    for (const it of items) {
      for (const pid of (it.protocol_ids || [])) {
        (byProtocol[pid] = byProtocol[pid] || []).push(it);
      }
    }
    const protoEntries = Object.entries(byProtocol)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20);

    const rowHtml = items.length
      ? items.slice(0, 50).map((it, idx) => {
          const safePmid = esc(it.pmid || '');
          const firstProto = (it.protocol_ids && it.protocol_ids[0]) || '';
          const safeProto = esc(firstProto);
          const rowId = 'litw-row-' + (it.id || idx);
          const authorLine = (it.authors || []).slice(0, 3).join(', ') +
            ((it.authors || []).length > 3 ? ' et al.' : '');
          return (
            '<div id="' + rowId + '" class="lib-card" style="border-left:3px solid var(--amber)">' +
              '<div class="lib-card-top">' +
                '<span class="lib-card-name">' + esc(it.title || '(no title)') + '</span>' +
                '<span class="lib-badge" style="background:rgba(245,158,11,0.14);color:var(--amber);border:1px solid rgba(245,158,11,0.3)" title="Unreviewed — clinician must verify before clinical use">Unreviewed</span>' +
              '</div>' +
              '<div class="lib-card-meta">' +
                (it.year ? '<span class="lib-tag">' + esc(it.year) + '</span>' : '') +
                (it.journal ? '<span class="lib-tag">' + esc(it.journal) + '</span>' : '') +
                (it.source ? '<span class="lib-tag" title="Source adapter">' + esc(it.source) + '</span>' : '') +
                (it.pmid ? '<span class="lib-tag">PMID ' + esc(it.pmid) + '</span>' : '') +
                (it.protocol_ids && it.protocol_ids.length
                  ? '<span class="lib-tag" title="Protocols this paper was surfaced for">◎ ' + esc(it.protocol_ids.join(', ')) + '</span>'
                  : '') +
              '</div>' +
              (authorLine ? '<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">' + esc(authorLine) + '</div>' : '') +
              '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' +
                (it.pmid
                  ? '<a class="ch-btn-sm" target="_blank" rel="noopener noreferrer" href="https://pubmed.ncbi.nlm.nih.gov/' + esc(it.pmid) + '">PubMed ↗</a>'
                  : '') +
                '<button class="ch-btn-sm ch-btn-teal" onclick="window._litwReview(\'' + safePmid + '\',\'' + safeProto + '\',\'relevant\', document.getElementById(\'' + rowId + '\'))">Mark relevant</button>' +
                '<button class="ch-btn-sm" style="color:var(--violet);border:1px solid rgba(139,92,246,0.4)" onclick="window._litwReview(\'' + safePmid + '\',\'' + safeProto + '\',\'promoted\', document.getElementById(\'' + rowId + '\'))">Promote to references</button>' +
                '<button class="ch-btn-sm" style="color:var(--text-tertiary)" onclick="window._litwReview(\'' + safePmid + '\',\'' + safeProto + '\',\'not-relevant\', document.getElementById(\'' + rowId + '\'))">Not relevant</button>' +
              '</div>' +
            '</div>'
          );
        }).join('')
      : '<div class="ch-empty" style="padding:30px 16px">Review queue is empty. Run the nightly cron or click "Refresh literature" on a protocol below.</div>';

    const protoListHtml = protoEntries.length
      ? protoEntries.map(([pid, rows], i) => {
          const btnId = 'litw-refresh-' + i;
          return (
            '<div class="book-row">' +
              '<div class="book-info">' +
                '<div class="book-patient">' + esc(pid) + '</div>' +
                '<div class="book-notes">' + rows.length + ' pending paper' + (rows.length === 1 ? '' : 's') + ' awaiting review</div>' +
              '</div>' +
              '<div class="book-actions">' +
                '<button id="' + btnId + '" class="ch-btn-sm ch-btn-teal" onclick="window._litwRefreshProtocol(\'' + esc(pid) + '\',\'' + btnId + '\')">↻ Refresh literature (PubMed)</button>' +
              '</div>' +
            '</div>'
          );
        }).join('')
      : '<div class="ch-empty" style="padding:24px 16px">No protocols currently have pending literature. Every nightly cron pass populates the queue.</div>';

    main =
      (pendingErr
        ? '<div class="lib-trust-banner" role="alert" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:14px;color:var(--red)">Could not load review queue: ' + esc(pendingErr) + '</div>'
        : '') +
      '<div class="lib-trust-banner" role="note" style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);padding:10px 14px;border-radius:8px;font-size:12px;margin-bottom:14px">' +
        '<b style="color:var(--amber)">Unreviewed literature — clinicians must verify before clinical use.</b> ' +
        'Papers are surfaced by PubMed cron + on-demand search. Promote to references after verifying PMID + relevance.' +
      '</div>' +
      '<div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">' +
        kpi('var(--amber)', pending.total || items.length, 'Pending papers', 'Deduped by PMID across protocols') +
        kpi('var(--violet)', Object.keys(byProtocol).length, 'Protocols with pending', '') +
        kpi('var(--teal)', items.filter(i => (i.citation_count || 0) >= 10).length, 'High-impact (≥10 cites)', '') +
        kpi('var(--blue)', items.length ? (items[0].first_seen_at || '').slice(0, 10) : '—', 'Most recent', '') +
      '</div>' +
      '<div class="ch-card" style="margin-bottom:16px">' +
        '<div class="ch-card-hd"><span class="ch-card-title">Protocols requiring review</span>' +
          '<span style="font-size:11px;color:var(--text-tertiary)">Click to refresh PubMed for the top 30 most-recent papers</span>' +
        '</div>' +
        protoListHtml +
      '</div>' +
      '<div class="ch-card">' +
        '<div class="ch-card-hd"><span class="ch-card-title">Review queue (' + items.length + ')</span>' +
          '<span style="font-size:11px;color:var(--text-tertiary)">Sorted by first-seen; deduped by PMID</span>' +
        '</div>' +
        '<div class="lib-grid">' + rowHtml + '</div>' +
      '</div>';
  }

  el.innerHTML = '<div class="ch-shell"><div class="ch-tab-bar" role="tablist" aria-label="Library sections">' + tabBar() + '</div><div class="ch-body">' + main + '</div></div>';
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

  // Fetch real documents from backend; fall back to local seed so the UI still renders offline.
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

  window._docsPreview = (templateId) => {
    const tpl = DOCUMENT_TEMPLATES.find(t => t.id === templateId);
    const sample = { patient_name:'Demo Patient', clinician_name:'Dr. Example', clinic_name:'DeepSynaps Clinic', date: td };
    (tpl?.variables||[]).forEach(v => { if (!(v in sample)) sample[v] = ''; });
    let body = '';
    try { body = renderTemplate(templateId, sample) || ''; } catch {}
    if (!body) body = (tpl?.body) || 'Preview unavailable for this template.';
    const esc = (s) => String(s==null?'':s).replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
    let host = document.getElementById('docs-preview-modal');
    if (!host) { host = document.createElement('div'); host.id = 'docs-preview-modal'; document.body.appendChild(host); }
    host.className = 'ch-modal-overlay';
    host.innerHTML =
      '<div class="ch-modal" style="width:min(720px,95vw);max-height:90vh;display:flex;flex-direction:column">'+
        '<div class="ch-modal-hd"><span>'+esc(tpl?.name||'Template Preview')+'</span>'+
          '<button class="ch-modal-close" onclick="document.getElementById(\'docs-preview-modal\')?.remove()">✕</button>'+
        '</div>'+
        '<div class="ch-modal-body" style="overflow-y:auto">'+
          '<pre style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;line-height:1.6;margin:0 0 14px 0">'+esc(body)+'</pre>'+
          '<div style="display:flex;gap:8px">'+
            '<button class="btn btn-primary" onclick="document.getElementById(\'docs-preview-modal\')?.remove();window._docsSendTemplate(\''+templateId+'\')">Send to Patient</button>'+
            '<button class="btn" onclick="document.getElementById(\'docs-preview-modal\')?.remove()">Close</button>'+
          '</div>'+
        '</div>'+
      '</div>';
  };

  window._docsSendTemplate = async (templateId) => {
    const tpl = DOCUMENT_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) { window._dsToast?.({title:'Error',body:'Template not found.',severity:'error'}); return; }
    const consentCats = ['Consent','Privacy','Telehealth','AI'];
    const doc_type = consentCats.includes(tpl.cat) ? 'consent' : 'clinical';
    try {
      await api.createDocument({ title: tpl.name, doc_type, template_id: tpl.id, status: 'pending', notes: 'Sent from Documents Hub template' });
      window._dsToast?.({title:'Sent',body:tpl.name+' created.',severity:'success'});
      window._nav('documents-hub');
    } catch {
      window._dsToast?.({title:'Failed',body:'Could not create document. Try again.',severity:'error'});
    }
  };

  function docRows(list) {
    if (!list.length) return '<div class="ch-empty">No documents found.</div>';
    return list.map(d => {
      const dlTpl = d.template_id ? String(d.template_id).replace(/'/g,"\\'") : '';
      const dlName = String(d.name||'').replace(/'/g,"\\'");
      return '<div class="book-row">'+
        '<div class="book-datetime"><div class="book-date">'+d.date+'</div><div class="book-time">'+d.size+'</div></div>'+
        '<div class="book-info"><div class="book-patient">'+d.name+'</div><div class="book-clinician">'+d.patient+' · '+d.type+'</div></div>'+
        '<div class="book-status-col"><span class="book-status-badge" style="color:'+(stC[d.status]||'var(--text-tertiary)')+';background:'+(stC[d.status]||'var(--text-tertiary)')+'22;text-transform:capitalize">'+d.status+'</span></div>'+
        '<div class="book-actions">'+
          '<button class="ch-btn-sm" onclick="window._dsToast?.({title:\'View\',body:\''+dlName+'\',severity:\'info\'})">View</button>'+
          '<button class="ch-btn-sm" onclick="window._docsDownload(\''+dlTpl+'\',\''+dlName+'\')">↓</button>'+
        '</div>'+
      '</div>';
    }).join('');
  }

  window._docsDownload = (templateId, docName) => {
    let body = '';
    if (templateId) { try { body = renderTemplate(templateId, {}) || ''; } catch {} }
    if (!body) body = docName || 'document';
    const blob = new Blob([body], {type:'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = (docName||'document') + '.txt'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  };

  let main = '';

  if (tab === 'all') {
    const q = (window._docsSearch||'').toLowerCase();
    const filt = window._docsFilter||'All';
    const types = ['All',...new Set(data.docs.map(d=>d.type))];
    const rows = data.docs.filter(d=>(filt==='All'||d.type===filt)&&(!q||(d.name+d.patient).toLowerCase().includes(q)));
    main = `
      <div class="ch-kpi-strip" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
        <div class="ch-kpi-card" style="--kpi-color:var(--blue)"><div class="ch-kpi-val">${data.docs.length}</div><div class="ch-kpi-label">Total Docs</div></div>
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
        ${rows.map(t=>
          '<div class="book-row">'+
            '<div class="book-info"><div class="book-patient">'+t.name+'</div><div class="book-clinician">'+t.cat+' · '+t.pages+' pages'+(t.auto?' · Auto-gen':'')+'</div></div>'+
            '<div class="book-status-col"><span class="book-status-badge" style="color:var(--blue);background:rgba(74,158,255,0.1)">'+t.langs.join('/')+'</span></div>'+
            '<div class="book-actions">'+
              '<button class="ch-btn-sm" onclick="window._docsPreview(\''+t.id+'\')">'+(t.auto?'Generate':'Open')+'</button>'+
              '<button class="ch-btn-sm ch-btn-teal" onclick="window._docsSendTemplate(\''+t.id+'\')">Assign</button>'+
            '</div>'+
          '</div>'
        ).join('')}
      </div>`;
  }
  else if (tab === 'consent') {
    const consentTpls = TEMPLATES.filter(t=>t.cat==='Consent'||t.cat==='Privacy'||t.cat==='Telehealth'||t.cat==='AI');
    const signedDocs  = data.docs.filter(d=>d.type==='Consent'||d.type==='Privacy');
    main = `
      <div class="ch-two-col">
        <div class="ch-card">
          <div class="ch-card-hd"><span class="ch-card-title">Consent Templates</span><button class="ch-btn-sm ch-btn-teal" onclick="window._dsToast?.({title:'Assign',body:'Select patient to assign.',severity:'info'})">Assign to Patient</button></div>
          ${consentTpls.map(t=>'<div class="book-row"><div class="book-info"><div class="book-patient">'+t.name+'</div><div class="book-clinician">'+t.pages+' pages · '+t.langs.join('/')+'</div></div><div class="book-actions"><button class="ch-btn-sm" onclick="window._docsPreview(\''+t.id+'\')">Preview</button><button class="ch-btn-sm ch-btn-teal" onclick="window._docsSendTemplate(\''+t.id+'\')">Send to Sign</button></div></div>').join('')}
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
      window._docsPending = Array.from(files);
      list.innerHTML = window._docsPending.map((f,i) =>
        '<div class="book-row"><div class="book-info"><div class="book-patient">'+f.name+'</div><div class="book-clinician">'+(f.size>1024*1024?(f.size/1024/1024).toFixed(1)+' MB':(f.size/1024).toFixed(0)+' KB')+'</div></div><div class="book-status-col"><span class="book-status-badge" style="color:var(--teal);background:rgba(0,212,188,0.1)">Ready</span></div><div class="book-actions"><button class="ch-btn-sm ch-btn-teal" onclick="window._docsUploadOne('+i+')">Upload</button></div></div>'
      ).join('');
    };
    // TODO: wire to real file-upload endpoint once implemented
    window._docsUploadOne = async (idx) => {
      const f = (window._docsPending||[])[idx]; if (!f) return;
      try {
        await api.createDocument({ title: f.name, doc_type: 'uploaded', status: 'uploaded', file_ref: f.name, notes: 'File size: ' + f.size + ' bytes' });
        window._dsToast?.({title:'Uploaded',body:f.name,severity:'success'});
        window._nav('documents-hub');
      } catch {
        window._dsToast?.({title:'Upload failed',body:'Could not save '+f.name+'.',severity:'error'});
      }
    };
    window._docsUpload = () => document.getElementById('docs-file-input')?.click();
  }

  el.innerHTML = `
  <div class="ch-shell">
    <div class="ch-tab-bar">${tabBar()}</div>
    <div class="ch-body">${main}</div>
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
        <div style="display:flex;gap:8px"><button class="btn btn-primary" onclick="document.getElementById('docs-upload-modal').classList.add('ch-hidden');window._dsToast?.({title:'Uploads tab',body:'Use the Uploads tab to upload files.',severity:'info'});window._docsHubTab='uploads';window._nav('documents-hub')">Upload</button><button class="btn" onclick="document.getElementById('docs-upload-modal').classList.add('ch-hidden')">Cancel</button></div>
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
    // ── Clinical ────────────────────────────────────────────────────────────
    { id:'R1',  name:'Initial Assessment Report',    cat:'Intake',     category:'Clinical',    audience:'referring-physician', auto:true,  fields:18, desc:'Full intake assessment including clinical history, contraindications, baseline scores.' },
    { id:'R2',  name:'Session Progress Note',        cat:'Session',    category:'Clinical',    audience:'internal',            auto:true,  fields:12, desc:'Per-session clinical note with tolerance, adverse events, and progress markers.' },
    { id:'R3',  name:'Mid-Course Review',            cat:'Review',     category:'Clinical',    audience:'referring-physician', auto:false, fields:22, desc:'Comprehensive mid-course review comparing baseline to current outcomes.' },
    { id:'R4',  name:'Treatment Outcome Report',     cat:'Discharge',  category:'Clinical',    audience:'referring-physician', auto:true,  fields:28, desc:'Full discharge report with outcome data, responder classification, follow-up plan.' },
    { id:'R5',  name:'Adverse Event Report',         cat:'Safety',     category:'Regulatory',  audience:'internal',            auto:false, fields:15, desc:'Structured AE report for safety monitoring and regulatory compliance.' },
    { id:'R6',  name:'GP/Referrer Summary Letter',   cat:'Referral',   category:'Clinical',    audience:'referring-physician', auto:true,  fields:14, desc:'Concise summary letter for GP or referrer with treatment details and outcomes.' },
    { id:'R7',  name:'Insurance Pre-Auth Letter',    cat:'Admin',      category:'Financial',   audience:'insurer',             auto:false, fields:20, desc:'Medical-necessity justification letter for insurance pre-authorisation or funding applications.' },
    { id:'R8',  name:'qEEG Interpretation Report',   cat:'Diagnostics',category:'Clinical',    audience:'internal',            auto:false, fields:16, desc:'Clinical qEEG interpretation with protocol recommendations.' },
    { id:'R9',  name:'Home Program Adherence Report',cat:'Follow-up',  category:'Clinical',    audience:'internal',            auto:true,  fields:10, desc:'Task completion rates, adherence trends, and patient engagement metrics.' },
    { id:'R10', name:'Monthly Outcomes Summary',     cat:'Analytics',  category:'Clinical',    audience:'executive',           auto:true,  fields:25, desc:'Clinic-wide monthly outcomes dashboard with responder rates and trends.' },
    // ── Financial ──────────────────────────────────────────────────────────
    { id:'F1',  name:'Monthly Revenue Summary',      cat:'Finance',    category:'Financial',   audience:'executive',           auto:true,  fields:14, desc:'Revenue by modality, insurer mix, and payment method — month-over-month comparison.' },
    { id:'F2',  name:'Invoice Ageing Report',        cat:'Finance',    category:'Financial',   audience:'internal',            auto:true,  fields:10, desc:'Outstanding invoices by age bucket (0–30, 31–60, 61–90, 90+ days) with collection priorities.' },
    { id:'F3',  name:'Insurance Claim Ledger',       cat:'Finance',    category:'Financial',   audience:'internal',            auto:true,  fields:12, desc:'Pending, approved, denied claims by insurer with denial reasons and appeal status.' },
    { id:'F4',  name:'Cost-of-Care Per Course',      cat:'Finance',    category:'Financial',   audience:'executive',           auto:false, fields:16, desc:'Per-patient and per-course cost analysis: consumables, clinician time, device depreciation.' },
    { id:'F5',  name:'Annual Tax & VAT Summary',     cat:'Finance',    category:'Financial',   audience:'executive',           auto:false, fields:12, desc:'Annual revenue, VAT collected, deductible expenses — for accountant handoff.' },
    // ── Operational ────────────────────────────────────────────────────────
    { id:'O1',  name:'Clinic-Day Throughput',        cat:'Operations', category:'Operational', audience:'internal',            auto:true,  fields:10, desc:'Daily patient throughput, session duration, no-show rate, waiting-room time.' },
    { id:'O2',  name:'Staff Utilisation Report',     cat:'Operations', category:'Operational', audience:'executive',           auto:true,  fields:12, desc:'Clinician billable hours vs scheduled hours, workload distribution, overtime.' },
    { id:'O3',  name:'Equipment Maintenance Log',    cat:'Operations', category:'Operational', audience:'internal',            auto:false, fields:14, desc:'Device uptime, calibration dates, maintenance incidents, warranty status.' },
    { id:'O4',  name:'Protocol Adherence Audit',     cat:'Operations', category:'Operational', audience:'internal',            auto:true,  fields:16, desc:'% of sessions delivered per protocol spec vs deviations and reasons.' },
    { id:'O5',  name:'Supply & Consumables Usage',   cat:'Operations', category:'Operational', audience:'internal',            auto:false, fields:10, desc:'Electrode pads, gels, single-use items — usage rate, reorder thresholds.' },
    // ── Regulatory / Governance ────────────────────────────────────────────
    { id:'G1',  name:'Consent Status Audit',         cat:'Compliance', category:'Regulatory',  audience:'internal',            auto:true,  fields:10, desc:'Patient consent status, expiring consents, missing-signature queue.' },
    { id:'G2',  name:'Governance Review',            cat:'Compliance', category:'Regulatory',  audience:'executive',           auto:false, fields:20, desc:'Periodic governance review: incidents, training, equipment, complaints.' },
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
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn btn-primary" onclick="window._genReport()">✦ Generate Report</button>
              <button class="btn" onclick="window._dsToast?.({title:'Preview',body:'Template preview coming soon.',severity:'info'})">Preview Template</button>
              <span id="rep-model-badge" style="margin-left:auto;font-size:10.5px;color:var(--text-tertiary);display:inline-flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green)"></span>
                GLM-4.5-Flash · free API
              </span>
            </div>
          </div>
          <div id="rep-output" style="display:none;padding:0 16px 16px">
            <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Generated Report</div>
            <div id="rep-content" style="min-height:160px;padding:14px 16px;font-size:12.5px;line-height:1.55;max-height:460px;overflow-y:auto;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px"></div>
            <div style="display:flex;gap:8px;margin-top:10px">
              <button class="ch-btn-sm ch-btn-teal" onclick="window._saveReport()">Save to Records</button>
              <button class="ch-btn-sm" onclick="window.print()">Print</button>
              <button class="ch-btn-sm" onclick="window._exportReportPdf()">Export PDF</button>
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

    // Render a structured report into #rep-content. Stored as window._lastReport
    // so Save/Print/Export can consume it.
    function _renderReport(rep) {
      const content = document.getElementById('rep-content');
      if (!content) return;
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
      const header = `
        <div style="font-family:var(--font-display);font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:4px">${esc(rep.title||'Report')}</div>
        <div style="font-size:11.5px;color:var(--text-tertiary);margin-bottom:12px">
          ${esc(rep.patient_or_subject||'')} · ${esc(rep.date||'')} · ${esc(rep.provider||'glm-free')} (${esc(rep.model||'')})
        </div>`;
      const sections = (rep.sections||[]).map((s) => `
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:600;color:var(--teal);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${esc(s.heading||'')}</div>
          <div style="font-size:12.5px;line-height:1.6;color:var(--text-primary);white-space:pre-wrap">${esc(s.body||'')}</div>
        </div>`).join('');
      const actions = (rep.next_actions||[]).length
        ? `<div style="margin-top:12px"><div style="font-size:12px;font-weight:600;color:var(--amber);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Next Actions</div>
           <ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.6;color:var(--text-primary)">${(rep.next_actions||[]).map(a=>'<li>'+esc(a)+'</li>').join('')}</ul></div>`
        : '';
      const disclaimer = rep.disclaimer
        ? `<div style="margin-top:12px;padding:8px 10px;background:rgba(245,158,11,0.08);border-left:3px solid var(--amber);border-radius:4px;font-size:11.5px;color:var(--text-secondary)">${esc(rep.disclaimer)}</div>`
        : '';
      content.innerHTML = header + sections + actions + disclaimer;
    }

    // Convert a structured report to a plain-text blob for save/print fallback.
    function _reportToText(rep) {
      const lines = [];
      lines.push(rep.title || 'Report');
      lines.push((rep.patient_or_subject || '') + ' · ' + (rep.date || ''));
      lines.push('');
      (rep.sections||[]).forEach((s) => {
        lines.push((s.heading||'').toUpperCase());
        lines.push(s.body||'');
        lines.push('');
      });
      if ((rep.next_actions||[]).length) {
        lines.push('NEXT ACTIONS');
        rep.next_actions.forEach(a => lines.push('- ' + a));
        lines.push('');
      }
      if (rep.disclaimer) lines.push(rep.disclaimer);
      return lines.join('\n');
    }

    window._genReport = async () => {
      const patEl = document.getElementById('rep-patient');
      const typeEl = document.getElementById('rep-type');
      const context = document.getElementById('rep-context')?.value || '';
      const patName = patEl?.options[patEl?.selectedIndex]?.text || 'Patient';
      const typeName = typeEl?.options[typeEl?.selectedIndex]?.text || 'Report';
      const typeData = REPORT_TYPES.find(r => r.id === typeEl?.value) || REPORT_TYPES[0];
      const out = document.getElementById('rep-output');
      const content = document.getElementById('rep-content');
      if (out) out.style.display = '';
      if (content) content.innerHTML = '<div style="color:var(--text-tertiary);padding:12px 0">✦ Generating ' + typeName + ' via GLM-4.5-Flash…</div>';

      try {
        const rep = await api.generateReport({
          template_id: typeData.id,
          template_name: typeData.name,
          category: typeData.category || 'Clinical',
          audience: typeData.audience || 'internal',
          tone: 'professional',
          patient_name: patName,
          patient_context: null,
          additional_context: context ? (typeData.desc + '\n\n' + context) : typeData.desc,
          provider: 'glm-free',  // GLM-4.5-Flash free tier via open.bigmodel.cn
        });
        _renderReport(rep);
        window._lastReport = {
          type: typeName,
          patient: patName,
          category: typeData.category || 'Clinical',
          structured: rep,
          content: _reportToText(rep),
        };
        const badge = document.getElementById('rep-model-badge');
        if (badge && rep?.provider) {
          const isLocal = rep.provider === 'ollama';
          badge.innerHTML =
            '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + (isLocal ? 'var(--green)' : 'var(--teal)') + '"></span>' +
            (isLocal ? '🔒 Local · ' : '') + String(rep.model || rep.provider);
        }
      } catch (err) {
        // Surface configuration errors clearly (e.g. missing GLM_API_KEY).
        const msg = err?.message || String(err);
        if (content) {
          content.innerHTML =
            '<div style="color:var(--red);padding:10px 12px;background:rgba(239,68,68,0.08);border-left:3px solid var(--red);border-radius:4px;font-size:12.5px">' +
            '<strong>Report generation failed.</strong><br>' + msg.replace(/</g,'&lt;') +
            '<br><br>If you see a 503 "llm_unconfigured" error, add <code>GLM_API_KEY</code> to the API service environment. ' +
            'Get a free key at <a href="https://open.bigmodel.cn/" target="_blank" rel="noopener" style="color:var(--teal)">open.bigmodel.cn</a>.' +
            '</div>';
        }
        window._dsToast?.({ title:'Generation failed', body: msg, severity:'error' });
      }
    };

    window._saveReport = () => {
      if (!window._lastReport) return;
      const rpts = loadReports();
      rpts.unshift({
        id: 'RPT-' + Date.now(),
        name: window._lastReport.type + ' — ' + window._lastReport.patient,
        patient: window._lastReport.patient,
        type: window._lastReport.type,
        category: window._lastReport.category,
        date: new Date().toISOString().slice(0,10),
        status: 'generated',
        content: window._lastReport.content,
        structured: window._lastReport.structured,
      });
      saveReports(rpts);
      window._dsToast?.({ title:'Saved', body:'Report saved to records.', severity:'success' });
      window._reportsHubTab = 'recent'; window._nav('reports-hub');
    };

    // Print-friendly export: open a new window with just the report HTML and
    // call window.print(). User can "Save as PDF" from the browser print dialog.
    window._exportReportPdf = () => {
      const rep = window._lastReport?.structured;
      if (!rep) { window._dsToast?.({ title:'Nothing to export', body:'Generate a report first.', severity:'info' }); return; }
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
      const sectionsHtml = (rep.sections||[]).map(s =>
        '<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#0891b2;margin:18px 0 4px">' + esc(s.heading||'') + '</h2>' +
        '<p style="white-space:pre-wrap;line-height:1.55;margin:0 0 10px">' + esc(s.body||'') + '</p>'
      ).join('');
      const nextHtml = (rep.next_actions||[]).length
        ? '<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#b45309;margin:18px 0 4px">Next Actions</h2><ul>' +
          (rep.next_actions||[]).map(a=>'<li>'+esc(a)+'</li>').join('') + '</ul>'
        : '';
      const disc = rep.disclaimer
        ? '<p style="margin-top:20px;padding:10px;border-left:3px solid #b45309;background:#fef3c7;font-size:11px">' + esc(rep.disclaimer) + '</p>'
        : '';
      const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(rep.title||'Report') + '</title>' +
        '<style>body{font-family:Inter,Arial,sans-serif;max-width:800px;margin:32px auto;padding:0 24px;color:#1f2937}' +
        'h1{font-size:20px;margin:0 0 4px}.meta{color:#6b7280;font-size:12px;margin-bottom:18px}</style></head><body>' +
        '<h1>' + esc(rep.title||'Report') + '</h1>' +
        '<div class="meta">' + esc(rep.patient_or_subject||'') + ' · ' + esc(rep.date||'') + '</div>' +
        sectionsHtml + nextHtml + disc +
        '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' +
        '</body></html>';
      const w = window.open('', '_blank');
      if (!w) { window._dsToast?.({ title:'Pop-up blocked', body:'Allow pop-ups to export.', severity:'warn' }); return; }
      w.document.open(); w.document.write(html); w.document.close();
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
        <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">67%</div><div class="ch-kpi-label">Responder Rate</div></div>
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

  el.innerHTML = `<div class="ch-shell"><div class="ch-tab-bar">${tabBar()}</div><div class="ch-body">${main}</div></div>`;
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
        <div class="ch-kpi-card" style="--kpi-color:var(--green)"><div class="ch-kpi-val">${fmt(totalRev)}</div><div class="ch-kpi-label">Revenue (Paid)</div></div>
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
  <div class="ch-shell">
    <div class="ch-tab-bar">${tabBar()}</div>
    <div class="ch-body">${main}</div>
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
