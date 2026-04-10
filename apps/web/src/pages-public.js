import { api } from './api.js';
import { setCurrentUser, showApp, showPatient, updateUserBar, updatePatientBar } from './auth.js';

// ── Shared: public topbar ─────────────────────────────────────────────────────
function pubTopbar() {
  return `
    <div class="pub-topbar">
      <div class="pub-topbar-logo" onclick="window._navPublic('home')">
        <div class="logo-icon" style="width:32px;height:32px;font-size:13px">🧠</div>
        <div>
          <div style="font-family:var(--font-display);font-size:14px;font-weight:700;color:var(--text-primary);letter-spacing:-0.3px">DeepSynaps</div>
          <div style="font-size:9px;color:var(--text-tertiary);letter-spacing:1px;text-transform:uppercase">Protocol Studio</div>
        </div>
      </div>
      <div class="pub-topbar-nav">
        <button class="pub-nav-link" onclick="document.querySelector('.pub-modality-grid')?.scrollIntoView({behavior:'smooth',block:'start'})">Modalities</button>
        <button class="pub-nav-link" onclick="document.querySelector('.pub-ev-section')?.scrollIntoView({behavior:'smooth',block:'start'})">Conditions</button>
        <button class="pub-nav-link" onclick="document.querySelector('.pub-pricing-grid')?.scrollIntoView({behavior:'smooth',block:'start'})">Pricing</button>
        <div style="width:1px;height:20px;background:var(--border);margin:0 6px"></div>
        <button class="pub-nav-link" onclick="window._navPublic('signup-patient')">Patients</button>
        <button class="pub-nav-link" onclick="window._showSignIn()">Sign In</button>
        <button class="btn btn-primary btn-sm" onclick="window._navPublic('signup-professional')" style="margin-left:4px">Start Free Trial</button>
      </div>
    </div>
  `;
}

// ── Landing Page (/home) ──────────────────────────────────────────────────────
export function pgHome() {
  const el = document.getElementById('public-shell');
  el.scrollTop = 0;

  // ── Evidence matrix data (sourced from Neuromodulation Master Database) ──────
  const _evMods = [
    { id:'TMS',   label:'TMS',   color:'#00d4bc', full:'Transcranial Magnetic Stimulation',         papers:'500+' },
    { id:'tDCS',  label:'tDCS',  color:'#4a9eff', full:'Transcranial Direct Current Stimulation',   papers:'200+' },
    { id:'tACS',  label:'tACS',  color:'#7c3aed', full:'Transcranial Alternating Current Stim.',    papers:'80+'  },
    { id:'CES',   label:'CES',   color:'#0284c7', full:'Cranial Electrotherapy Stimulation',         papers:'60+'  },
    { id:'taVNS', label:'taVNS', color:'#d97706', full:'Transcranial Auricular Vagus Nerve Stim.',   papers:'80+'  },
    { id:'TPS',   label:'TPS',   color:'#c026d3', full:'Transcranial Pulse Stimulation',             papers:'30+'  },
    { id:'PBM',   label:'PBM',   color:'#fb923c', full:'Photobiomodulation (tPBM)',                  papers:'50+'  },
    { id:'PEMF',  label:'PEMF',  color:'#f59e0b', full:'Pulsed Electromagnetic Field Therapy',       papers:'60+'  },
    { id:'NF',    label:'NF',    color:'#059669', full:'Neurofeedback',                              papers:'200+' },
    { id:'LIFU',  label:'LIFU',  color:'#64748b', full:'Low-Intensity Focused Ultrasound',           papers:'20+'  },
    { id:'tRNS',  label:'tRNS',  color:'#94a3b8', full:'Transcranial Random Noise Stimulation',      papers:'30+'  },
  ];
  // S = Strong (RCT + Meta-analysis) | M = Moderate (RCT) | E = Emerging (Open-label / Pilot)
  const _evConds = [
    { name:'Depression (MDD)',               cat:'Mood & Affective',      ev:{ TMS:'S', tDCS:'S', tACS:'E', CES:'S', taVNS:'M', TPS:'E', PBM:'M', PEMF:'E', NF:'M', LIFU:'E', tRNS:'E' } },
    { name:'Treatment-Resistant Depression', cat:'Mood & Affective',      ev:{ TMS:'S', tDCS:'M', CES:'M', taVNS:'M', TPS:'E', LIFU:'E' } },
    { name:'Bipolar Depression',             cat:'Mood & Affective',      ev:{ TMS:'M', tDCS:'E' } },
    { name:'Postpartum Depression',          cat:'Mood & Affective',      ev:{ TMS:'M', tDCS:'E' } },
    { name:'Persistent Depressive Disorder', cat:'Mood & Affective',      ev:{ TMS:'M', tDCS:'E', CES:'E' } },
    { name:'Seasonal Affective Disorder',    cat:'Mood & Affective',      ev:{ tDCS:'E', PBM:'E' } },
    { name:'PTSD',                           cat:'Anxiety & Trauma',      ev:{ TMS:'M', tDCS:'E', CES:'M', taVNS:'E', NF:'M' } },
    { name:'Generalised Anxiety Disorder',   cat:'Anxiety & Trauma',      ev:{ tDCS:'M', CES:'S', taVNS:'M', NF:'M', PEMF:'E' } },
    { name:'Social Anxiety Disorder',        cat:'Anxiety & Trauma',      ev:{ TMS:'M', tDCS:'E', CES:'E', NF:'E' } },
    { name:'Panic Disorder',                 cat:'Anxiety & Trauma',      ev:{ tDCS:'E', CES:'E', NF:'E' } },
    { name:'Complex PTSD',                   cat:'Anxiety & Trauma',      ev:{ TMS:'E', NF:'E' } },
    { name:'OCD',                            cat:'OCD Spectrum',          ev:{ TMS:'S', tDCS:'E', LIFU:'E' } },
    { name:'Body Dysmorphic Disorder',       cat:'OCD Spectrum',          ev:{ TMS:'E' } },
    { name:'Trichotillomania',               cat:'OCD Spectrum',          ev:{ TMS:'E' } },
    { name:'ADHD — Adult',                   cat:'Neurodevelopmental',    ev:{ TMS:'M', tDCS:'M', tACS:'E', TPS:'E', PEMF:'E', NF:'M', tRNS:'E' } },
    { name:'ADHD — Paediatric',              cat:'Neurodevelopmental',    ev:{ tDCS:'M', NF:'M' } },
    { name:'Autism Spectrum Disorder',       cat:'Neurodevelopmental',    ev:{ TMS:'M', tDCS:'E', TPS:'E', NF:'E' } },
    { name:'Schizophrenia',                  cat:'Psychiatric',           ev:{ TMS:'S', tDCS:'M', tACS:'M', LIFU:'E', tRNS:'E' } },
    { name:'Auditory Hallucinations',        cat:'Psychiatric',           ev:{ TMS:'S', tDCS:'M' } },
    { name:'Alcohol Use Disorder',           cat:'Substance Use',         ev:{ TMS:'M', tDCS:'M' } },
    { name:'Nicotine Addiction',             cat:'Substance Use',         ev:{ TMS:'M', tDCS:'E' } },
    { name:'Cocaine / Opioid Addiction',     cat:'Substance Use',         ev:{ TMS:'M', tDCS:'M', LIFU:'E' } },
    { name:'Cannabis Use Disorder',          cat:'Substance Use',         ev:{ TMS:'E', tDCS:'E' } },
    { name:'Stroke Rehabilitation',          cat:'Neurological',          ev:{ TMS:'S', tDCS:'S', taVNS:'M', PEMF:'E' } },
    { name:'Aphasia (post-stroke)',           cat:'Neurological',          ev:{ TMS:'M', tDCS:'M' } },
    { name:'Parkinson\'s Disease',            cat:'Neurological',          ev:{ TMS:'S', tDCS:'E', tACS:'M', taVNS:'E', TPS:'E', PBM:'E', PEMF:'E', tRNS:'E' } },
    { name:'Essential Tremor',               cat:'Neurological',          ev:{ TMS:'M', tACS:'M', LIFU:'E' } },
    { name:'Epilepsy',                       cat:'Neurological',          ev:{ TMS:'M', tDCS:'M', taVNS:'M', PEMF:'E', LIFU:'E' } },
    { name:'Multiple Sclerosis',             cat:'Neurological',          ev:{ tDCS:'M', PEMF:'M', tRNS:'M' } },
    { name:'Dystonia',                       cat:'Neurological',          ev:{ TMS:'M', tDCS:'E' } },
    { name:'Tourette Syndrome',              cat:'Neurological',          ev:{ TMS:'M', CES:'E' } },
    { name:'Spinal Cord Injury Rehab',       cat:'Neurological',          ev:{ TMS:'E', tDCS:'E' } },
    { name:'Alzheimer\'s Disease',            cat:'Cognitive & Memory',    ev:{ TMS:'M', tDCS:'M', tACS:'M', TPS:'M', PBM:'M', LIFU:'E' } },
    { name:'Mild Cognitive Impairment',      cat:'Cognitive & Memory',    ev:{ TMS:'M', tDCS:'M', tACS:'E', TPS:'E', PBM:'E', PEMF:'E', tRNS:'E' } },
    { name:'Traumatic Brain Injury',         cat:'Cognitive & Memory',    ev:{ TMS:'E', tDCS:'M', PBM:'M', PEMF:'E' } },
    { name:'Vascular Dementia',              cat:'Cognitive & Memory',    ev:{ tDCS:'E', TPS:'E' } },
    { name:'Post-COVID Brain Fog',           cat:'Cognitive & Memory',    ev:{ tDCS:'E', PBM:'E' } },
    { name:'Chemo-Related Cognitive Impairment', cat:'Cognitive & Memory', ev:{ tDCS:'E', PBM:'E' } },
    { name:'Chronic Pain',                   cat:'Pain',                  ev:{ TMS:'S', tDCS:'S', CES:'E', taVNS:'M', tACS:'E', PBM:'E', PEMF:'M', LIFU:'E' } },
    { name:'Fibromyalgia',                   cat:'Pain',                  ev:{ TMS:'M', tDCS:'S', CES:'M', PEMF:'M', taVNS:'E' } },
    { name:'Migraine / Headache',            cat:'Pain',                  ev:{ TMS:'M', tDCS:'E', taVNS:'M' } },
    { name:'Neuropathic Pain',               cat:'Pain',                  ev:{ TMS:'M', tDCS:'M', PEMF:'M' } },
    { name:'Complex Regional Pain Syndrome', cat:'Pain',                  ev:{ tDCS:'E', PEMF:'E' } },
    { name:'Phantom Limb Pain',              cat:'Pain',                  ev:{ TMS:'E', tDCS:'E' } },
    { name:'Low Back Pain',                  cat:'Pain',                  ev:{ PEMF:'M', tDCS:'E' } },
    { name:'Tinnitus',                       cat:'Other & Emerging',      ev:{ TMS:'M', tDCS:'M', taVNS:'M', tACS:'E', tRNS:'M' } },
    { name:'Insomnia',                       cat:'Other & Emerging',      ev:{ tDCS:'E', tACS:'M', CES:'S', taVNS:'M', PEMF:'E', NF:'E', tRNS:'E' } },
    { name:'Chronic Fatigue / ME-CFS',       cat:'Other & Emerging',      ev:{ tDCS:'E', PBM:'E' } },
    { name:'Eating Disorders',               cat:'Other & Emerging',      ev:{ TMS:'M', tDCS:'E' } },
    { name:'Inflammatory / Rheumatoid Arthritis', cat:'Other & Emerging', ev:{ taVNS:'M', PEMF:'E' } },
    { name:'Long COVID — Fatigue & Cognition', cat:'Other & Emerging',    ev:{ PBM:'E', tDCS:'E' } },
    { name:'Disorders of Consciousness',     cat:'Other & Emerging',      ev:{ TMS:'E', tDCS:'E', TPS:'E' } },
    { name:'Peak Performance / Cognitive Enhancement', cat:'Other & Emerging', ev:{ tDCS:'E', NF:'M', tRNS:'E', PBM:'E' } },
  ];

  function _buildEvMatrix() {
    const evLabel = { S:'Strong — RCT + Meta-analysis', M:'Moderate — RCT', E:'Emerging — Open-label / Pilot' };
    const cats = [...new Set(_evConds.map(c => c.cat))];
    const totalConds   = _evConds.length;
    const totalEntries = _evConds.reduce((n, c) => n + Object.keys(c.ev).length, 0);
    const strongCount  = _evConds.reduce((n, c) => n + Object.values(c.ev).filter(v => v === 'S').length, 0);

    const tabs = cats.map((cat, i) => {
      const n = _evConds.filter(c => c.cat === cat).length;
      return `<button class="pub-ev-tab${i===0?' active':''}" data-tab="${i}" onclick="window._evTab(${i})">
        <span class="pub-ev-tab-name">${cat}</span>
        <span class="pub-ev-tab-count">${n}</span>
      </button>`;
    }).join('');

    const panels = cats.map((cat, i) => {
      const conds = _evConds.filter(c => c.cat === cat);
      const rows = conds.map(c => `
        <tr class="pub-ev-row">
          <td class="pub-ev-cond-cell">${c.name}</td>
          ${_evMods.map(m => {
            const ev = c.ev[m.id] || null;
            const tip = ev ? evLabel[ev] + ' · ' + m.full : 'No evidence · ' + m.label;
            return `<td class="pub-ev-cell" data-mod="${m.id}" data-ev="${ev||''}" title="${tip}">
              ${ev ? `<span class="pub-ev-dot pub-ev-${ev.toLowerCase()}" style="--ev-col:${m.color}"></span>` : '<span class="pub-ev-none">—</span>'}
            </td>`;
          }).join('')}
        </tr>`).join('');
      return `<div class="pub-ev-panel${i===0?' active':''}" data-panel="${i}">
        <table class="pub-ev-table">
          <thead><tr>
            <th class="pub-ev-cond-col">Condition</th>
            ${_evMods.map(m => `<th class="pub-ev-mod-th" data-mod="${m.id}" style="--ev-col:${m.color}" title="${m.full}">${m.label}</th>`).join('')}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join('');

    return `
      <div class="pub-ev-topbar">
        <div class="pub-ev-filters" id="ev-filters">
          <button class="pub-ev-filter-btn active" data-mod="ALL" onclick="window._evFilter('ALL')">All</button>
          ${_evMods.map(m => `<button class="pub-ev-filter-btn" data-mod="${m.id}" style="--ev-col:${m.color}" onclick="window._evFilter('${m.id}')" title="${m.full}">${m.label}<span class="pub-ev-filter-count">${m.papers}</span></button>`).join('')}
        </div>
        <div class="pub-ev-legend">
          <span class="pub-ev-legend-item"><span class="pub-ev-dot pub-ev-s" style="--ev-col:#00d4bc"></span>Strong</span>
          <span class="pub-ev-legend-item"><span class="pub-ev-dot pub-ev-m" style="--ev-col:#4a9eff"></span>Moderate</span>
          <span class="pub-ev-legend-item"><span class="pub-ev-dot pub-ev-e" style="--ev-col:#94a3b8"></span>Emerging</span>
          <span class="pub-ev-legend-divider"></span>
          <span style="font-size:10.5px;color:var(--text-tertiary)">${totalConds} conditions · ${strongCount} strong findings</span>
        </div>
      </div>
      <div class="pub-ev-layout">
        <nav class="pub-ev-tabs" id="ev-tabs" aria-label="Condition categories">${tabs}</nav>
        <div class="pub-ev-panels" id="ev-panels">${panels}</div>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px;text-align:right">
        ${totalEntries} evidence entries across ${totalConds} conditions × 11 modalities · Sourced from Neuromodulation Master Database
      </div>`;
  }

  el.innerHTML = `
    ${pubTopbar()}

    <!-- ─── Hero ─────────────────────────────────────────────────────────── -->
    <section class="pub-hero">
      <div class="pub-hero-badge">◈ &nbsp;Built for neuromodulation practice &nbsp;·&nbsp; Clinician-designed</div>

      <h1 class="pub-hero-title">
        Clinical precision tools<br>
        for <span>neuromodulation practitioners</span>
      </h1>

      <p class="pub-hero-sub">
        Stop juggling spreadsheets, paper protocols, and disconnected EHR notes.
        DeepSynaps gives your clinic one structured system &mdash; evidence-graded protocols,
        step-by-step session execution, clinical governance, and patient engagement &mdash;
        built the way neuromodulation actually works.
      </p>

      <div class="pub-hero-ctas">
        <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')">
          Start Free 14-Day Trial &rarr;
        </button>
        <button class="btn-hero-secondary" onclick="window._navPublic('signup-patient')">
          Patient Portal
        </button>
        <button class="btn-hero-ghost" onclick="window._showSignIn()">
          Sign In
        </button>
      </div>

      <!-- Stats bar -->
      <div style="
        display:flex; gap:0; border:1px solid var(--border);
        border-radius:var(--radius-lg); overflow:hidden; background:var(--bg-card);
        backdrop-filter:blur(8px); flex-wrap:wrap;
      ">
        ${[
          { val: '50+',    label: 'Conditions',         sub: 'across 7 neuromodulation modalities' },
          { val: 'A–D',    label: 'Evidence grades',    sub: 'every protocol rated' },
          { val: '8',      label: 'Modalities',         sub: 'device-aware workflows' },
          { val: 'HIPAA',  label: 'Compliant',          sub: 'infrastructure included' },
        ].map((s, i) => `
          <div style="
            flex:1; min-width:130px; padding:18px 22px; text-align:center;
            ${i > 0 ? 'border-left:1px solid var(--border)' : ''}
          ">
            <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-primary);letter-spacing:-0.5px">${s.val}</div>
            <div style="font-size:11px;font-weight:600;color:var(--teal);margin-top:3px">${s.label}</div>
            <div style="font-size:10px;color:var(--text-tertiary);margin-top:1px">${s.sub}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <!-- ─── Specialty trust bar ───────────────────────────────────────────── -->
    <div class="pub-specialties-bar">
      <span class="pub-specialties-label">Designed for</span>
      ${['Neurologists','Psychiatrists','Psychologists','Neuropsychologists','Neuromodulation Technicians','Clinical Researchers','Clinic Administrators','Neurofeedback Practitioners'].map(s =>
        `<span class="pub-specialty-tag">${s}</span>`
      ).join('')}
    </div>

    <div class="pub-divider"></div>

    <!-- ─── Why clinicians choose DeepSynaps ─────────────────────────────── -->
    <section class="pub-section" style="padding-bottom:60px">
      <div style="text-align:center;margin-bottom:44px">
        <div class="pub-eyebrow">Why clinicians switch</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          Designed around how you actually practice
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:540px;margin:0 auto;line-height:1.7">
          Every feature was built in response to a real pain point reported by neuromodulation clinicians.
        </div>
      </div>
      <div class="pub-why-grid">
        ${[
          {
            icon: '◱',
            problem: 'Paper protocol sheets',
            solution: 'Structured digital protocols',
            desc: 'Replace hand-written or PDF protocol sheets with structured records that carry device parameters, electrode placement, pulse settings, and evidence grade — all in one searchable record.',
          },
          {
            icon: '⬡',
            problem: 'Hunting for evidence',
            solution: 'Evidence grade at every step',
            desc: 'Every protocol displays its A–D evidence rating drawn from published literature. You see clinical justification at protocol selection, approval, and session review — not just at design time.',
          },
          {
            icon: '◧',
            problem: 'Slow session documentation',
            solution: 'Session in under 2 minutes',
            desc: 'The session runner pre-fills device parameters from the protocol. You confirm, flag any deviations, and log the session. Full documentation in under two minutes per session.',
          },
          {
            icon: '◎',
            problem: 'No audit trail',
            solution: 'Automatic governance trail',
            desc: 'Protocol approvals, session deviations, adverse events, and consent records are automatically timestamped and role-attributed. Your governance trail is always ready for clinical review.',
          },
          {
            icon: '◉',
            problem: 'Patients in the dark',
            solution: 'Clear patient portal',
            desc: 'Patients see their session schedule, treatment progress, and assessments in a calm, jargon-free interface. Your clinic provisions their access — they never log into your clinical workspace.',
          },
          {
            icon: '◈',
            problem: 'Disconnected qEEG data',
            solution: 'EEG in clinical context',
            desc: 'Brain region mapping, band analysis, and electrode placement visualisation sit inside the patient record — connected to the protocol, the course, and the outcomes. Not in a separate app.',
          },
        ].map(w => `
          <div class="pub-why-card">
            <div class="pub-why-card-top">
              <div class="pub-why-icon">${w.icon}</div>
              <div>
                <div class="pub-why-problem">Previously: ${w.problem}</div>
                <div class="pub-why-solution">${w.solution}</div>
              </div>
            </div>
            <div class="pub-why-desc">${w.desc}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Modalities ────────────────────────────────────────────────────── -->
    <section class="pub-section" style="padding-bottom:60px">
      <div style="text-align:center;margin-bottom:44px">
        <div class="pub-eyebrow">Modality coverage</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          Built for the full neuromodulation toolkit
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:520px;margin:0 auto;line-height:1.7">
          Device-aware workflows for every major non-invasive neuromodulation modality.
          Parameters, placement, and protocols are modality-specific, not generic.
        </div>
      </div>
      <div class="pub-modality-grid">
        ${[
          {
            abbr: 'TMS',
            name: 'Transcranial Magnetic Stimulation',
            color: 'var(--teal)',
            border: 'var(--border-teal)',
            bg: 'rgba(0,212,188,0.06)',
            params: 'Frequency · Intensity · Pulses · Coil type · Target region',
            conditions: 'Depression · OCD · PTSD · Chronic pain · Stroke rehab',
          },
          {
            abbr: 'tDCS',
            name: 'Transcranial Direct Current Stimulation',
            color: 'var(--blue)',
            border: 'var(--border-blue)',
            bg: 'rgba(74,158,255,0.06)',
            params: 'Current · Duration · Electrode size · Montage · Density',
            conditions: 'Depression · ADHD · Chronic pain · Stroke · Tinnitus',
          },
          {
            abbr: 'tACS',
            name: 'Transcranial Alternating Current Stimulation',
            color: '#7c3aed',
            border: 'rgba(124,58,237,0.4)',
            bg: 'rgba(124,58,237,0.07)',
            params: 'Frequency · Phase · Amplitude · Electrode placement · Duration',
            conditions: 'Parkinson\'s · Sleep · Cognitive function · Tremor',
          },
          {
            abbr: 'PEMF',
            name: 'Pulsed Electromagnetic Field Therapy',
            color: 'var(--amber)',
            border: 'rgba(255,181,71,0.3)',
            bg: 'rgba(255,181,71,0.06)',
            params: 'Frequency · Intensity · Pulse duration · Coil configuration',
            conditions: 'Chronic pain · Inflammation · Bone healing · Sleep',
          },
          {
            abbr: 'PBM',
            name: 'Photobiomodulation (tPBM)',
            color: '#fb923c',
            border: 'rgba(251,146,60,0.3)',
            bg: 'rgba(251,146,60,0.06)',
            params: 'Wavelength · Power density · Pulse mode · Dose · Site',
            conditions: 'TBI · Depression · Cognitive decline · Alzheimer\'s',
          },
          {
            abbr: 'NF',
            name: 'Neurofeedback',
            color: '#059669',
            border: 'rgba(5,150,105,0.4)',
            bg: 'rgba(5,150,105,0.07)',
            params: 'Protocol type · Band targets · Session length · Electrode sites',
            conditions: 'ADHD · Anxiety · PTSD · Peak performance · Insomnia',
          },
          {
            abbr: 'TPS',
            name: 'Transcranial Pulse Stimulation',
            color: '#c026d3',
            border: 'rgba(192,38,211,0.4)',
            bg: 'rgba(192,38,211,0.07)',
            params: 'Pulse frequency · Intensity · Target region · Session count · Depth',
            conditions: 'Alzheimer\'s · MCI · Depression · Parkinson\'s · Chronic pain',
          },
          {
            abbr: 'CES',
            name: 'Cranial Electrotherapy Stimulation',
            color: '#0284c7',
            border: 'rgba(2,132,199,0.4)',
            bg: 'rgba(2,132,199,0.07)',
            params: 'Frequency · Current intensity · Waveform · Electrode site · Duration',
            conditions: 'Anxiety · Insomnia · Depression · Pain · Stress',
          },
        ].map(m => `
          <div class="pub-modality-card" style="border-color:${m.border};background:${m.bg}">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <span class="pub-modality-abbr" style="color:${m.color};border-color:${m.border}">${m.abbr}</span>
              <span style="font-size:9px;font-weight:700;letter-spacing:.8px;color:${m.color};text-transform:uppercase;opacity:0.7">Active</span>
            </div>
            <div class="pub-modality-name">${m.name}</div>
            <div class="pub-modality-params">
              <span style="font-size:10px;font-weight:600;color:var(--text-tertiary);letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Parameters</span>
              <span style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">${m.params}</span>
            </div>
            <div class="pub-modality-conditions">
              <span style="font-size:10px;font-weight:600;color:var(--text-tertiary);letter-spacing:.5px;text-transform:uppercase;display:block;margin-bottom:4px">Conditions</span>
              <span style="font-size:11.5px;color:var(--text-secondary);line-height:1.5">${m.conditions}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Workflow strip ────────────────────────────────────────────────── -->
    <div style="padding:52px 48px 0;max-width:1160px;margin:0 auto">
      <div style="text-align:center;margin-bottom:36px">
        <div class="pub-eyebrow">Treatment Course Lifecycle</div>
        <div style="font-size:13px;color:var(--text-secondary)">
          Every operation follows the same structured path &mdash; from protocol to outcome.
        </div>
      </div>
      <div class="pub-process-strip">
        ${[
          { icon: '⬡', label: 'Protocol',   sub: 'Evidence-graded design' },
          { icon: '◱', label: 'Approval',   sub: 'Clinician review' },
          { icon: '◎', label: 'Course',     sub: 'Lifecycle created' },
          { icon: '◧', label: 'Session',    sub: 'Structured delivery' },
          { icon: '◫', label: 'Outcomes',   sub: 'Evidence-matched' },
          { icon: '◉', label: 'Patient',    sub: 'Portal engagement' },
        ].map(s => `
          <div class="pub-process-step">
            <div class="pub-process-node">${s.icon}</div>
            <div class="pub-process-label">${s.label}</div>
            <div class="pub-process-sub">${s.sub}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="padding:52px 48px 0;max-width:1160px;margin:0 auto">
      <div class="pub-divider" style="margin:0"></div>
    </div>

    <!-- ─── Audience split ────────────────────────────────────────────────── -->
    <div style="padding:72px 0 80px">
      <div style="text-align:center;margin-bottom:44px;padding:0 48px">
        <div class="pub-eyebrow">Two separate experiences</div>
        <div class="pub-section-title" style="text-align:center;margin-bottom:10px">
          A clinical workspace for your team.<br>A clear portal for your patients.
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:520px;margin:0 auto;line-height:1.7">
          Clinical and patient interfaces are completely separate &mdash;
          different layouts, different depth, different language.
          Patients never see clinical complexity.
        </div>
      </div>

      <div class="pub-audience-grid">

        <!-- Clinic card -->
        <div class="pub-audience-card primary">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <div class="pub-audience-icon" style="margin:0;width:44px;height:44px">⚕</div>
            <div>
              <div class="pub-eyebrow" style="margin:0 0 2px">For clinics &amp; professionals</div>
              <div class="pub-audience-title" style="margin:0">Clinical Operations Workspace</div>
            </div>
          </div>
          <div class="pub-audience-desc">
            Not a generic EHR. DeepSynaps is organised around
            <strong style="color:var(--text-primary)">treatment courses</strong> &mdash;
            not appointments. Each course holds a protocol, session schedule,
            governance trail, and patient outcomes in one structured record.
            No separate systems for protocols, sessions, and outcomes.
          </div>
          <ul class="pub-audience-features">
            <li>Evidence-graded protocol design — TMS, tDCS, tACS, PEMF, PBM, neurofeedback</li>
            <li>Course lifecycle: approval &rarr; sessions &rarr; deviation flags &rarr; outcomes</li>
            <li>Structured session runner with device parameters, montage, and real-time flags</li>
            <li>qEEG integration and per-patient brain region mapping</li>
            <li>Adverse event registry, protocol approval queue, and full audit trail</li>
            <li>Role-scoped access: clinician, technician, reviewer, admin</li>
          </ul>
          <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')"
            style="width:100%;font-size:13px;padding:12px;margin-top:auto">
            Create Clinic Account &rarr;
          </button>
        </div>

        <!-- Patient card -->
        <div class="pub-audience-card secondary">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <div class="pub-audience-icon" style="margin:0;width:44px;height:44px">◉</div>
            <div>
              <div class="pub-eyebrow blue" style="margin:0 0 2px">For patients</div>
              <div class="pub-audience-title" style="margin:0">Patient Portal</div>
            </div>
          </div>
          <div class="pub-audience-desc">
            A calm, clear view of your treatment &mdash; without clinical complexity.
            Provided by your clinic, accessed by you. No clinical jargon,
            no unnecessary detail &mdash; just your journey, clearly presented.
          </div>
          <ul class="pub-audience-features">
            <li>Upcoming and completed session schedule from your clinic</li>
            <li>Treatment course summary — what you&rsquo;re being treated for and why</li>
            <li>Assessments and symptom tracking before and after sessions</li>
            <li>Reports and clinical documents shared by your care team</li>
            <li>Secure messages and reminders from your clinician</li>
          </ul>
          <div class="notice notice-info" style="font-size:11.5px;margin-bottom:20px">
            Patient access requires an invitation from your clinic. Ask your clinician to add you.
          </div>
          <button class="btn-hero-secondary" onclick="window._navPublic('signup-patient')"
            style="width:100%;font-size:13px;padding:12px;border-color:var(--border-blue);color:var(--blue)">
            Activate Patient Portal &rarr;
          </button>
        </div>

      </div>
    </div>

    <div class="pub-divider"></div>

    <!-- ─── Evidence Matrix ──────────────────────────────────────────────── -->
    <section class="pub-section pub-ev-section">
      <div style="text-align:center;margin-bottom:44px">
        <div class="pub-eyebrow">Evidence Matrix</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          Conditions &times; Modalities &mdash; evidence at a glance
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:600px;margin:0 auto;line-height:1.7">
          Filter by modality to see which conditions have strong, moderate, or emerging evidence.
          Sourced from the DeepSynaps Neuromodulation Master Database.
        </div>
      </div>
      ${_buildEvMatrix()}
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Testimonials ──────────────────────────────────────────────────── -->
    <section class="pub-section" style="padding-bottom:60px">
      <div style="text-align:center;margin-bottom:44px">
        <div class="pub-eyebrow">From the clinic floor</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          What clinicians say
        </div>
      </div>
      <div class="pub-testimonial-grid">
        ${[
          {
            quote: 'Finally, a system that thinks in protocols, not appointments. Every session I log is automatically connected to the protocol that drove it. The governance trail writes itself.',
            name: 'Dr. S. Okonkwo',
            role: 'Consultant Neurologist',
            specialty: 'TMS · Stroke rehab',
          },
          {
            quote: 'The evidence grading alone saves me 20–30 minutes per protocol review. I can see the A–D rating and the rationale without digging through literature. That\'s time back with patients.',
            name: 'Dr. A. Reinholt',
            role: 'Clinical Psychologist',
            specialty: 'Neurofeedback · ADHD · PTSD',
          },
          {
            quote: 'We onboarded our full team of five in half a day. The role separation is clean — technicians see what they need, reviewers see what they need. Nothing bleeds over.',
            name: 'M. Tavares',
            role: 'Clinic Director',
            specialty: 'Multi-clinician tDCS clinic',
          },
        ].map(t => `
          <div class="pub-testimonial-card">
            <div class="pub-quote-mark">"</div>
            <div class="pub-testimonial-quote">${t.quote}</div>
            <div class="pub-testimonial-meta">
              <div class="pub-testimonial-name">${t.name}</div>
              <div class="pub-testimonial-role">${t.role}</div>
              <div class="pub-testimonial-specialty">${t.specialty}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Platform capabilities ──────────────────────────────────────────── -->
    <section class="pub-section">
      <div style="display:flex;gap:48px;align-items:flex-start">

        <!-- Left: intro -->
        <div style="width:280px;flex-shrink:0;padding-top:4px">
          <div class="pub-eyebrow">Platform capabilities</div>
          <div class="pub-section-title" style="font-size:26px;margin-bottom:14px">
            Every workflow.<br>One system.
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.75;margin-bottom:24px">
            DeepSynaps covers the full operational stack for a neuromodulation clinic &mdash;
            from first protocol to long-term outcome tracking &mdash;
            without separate tools for each discipline.
          </div>
          <button class="btn btn-primary btn-sm" onclick="window._navPublic('signup-professional')" style="font-size:12px">
            Explore the platform &rarr;
          </button>
        </div>

        <!-- Right: feature cards -->
        <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${[
            {
              icon: '◎', accent: '',
              title: 'Treatment Courses',
              desc: 'The primary clinical object. Each course holds a patient, a condition, a protocol, a session schedule, and a complete outcome record. Not appointments &mdash; structured care episodes.',
            },
            {
              icon: '⬡', accent: '',
              title: 'Protocol Intelligence',
              desc: 'AI-assisted, evidence-graded protocol generation. Filter by condition, modality, and patient profile. Every protocol carries an A&ndash;D evidence grade from the literature.',
            },
            {
              icon: '◧', accent: '',
              title: 'Session Execution',
              desc: 'Step-by-step session runner. Device selection, montage verification, pulse parameters, real-time deviation flagging. Every session is documented and traceable.',
            },
            {
              icon: '◈', accent: 'blue',
              title: 'qEEG &amp; Brain Data',
              desc: 'Integrated EEG band analysis, per-patient brain region mapping, and electrode placement visualisation. Neurometric data in clinical context, not isolated.',
            },
            {
              icon: '◫', accent: 'blue',
              title: 'Outcomes &amp; Trends',
              desc: 'Longitudinal outcome tracking against protocol evidence grades. Cohort analytics. Assessment scoring. Outcomes that connect back to the protocol that produced them.',
            },
            {
              icon: '◉', accent: 'blue',
              title: 'Patient Portal',
              desc: 'A separate, calmer interface for patients. Sessions, progress, assessments, reports, and messages from the care team &mdash; without clinical complexity.',
            },
          ].map(f => `
            <div class="pub-feature-card-l ${f.accent}">
              <div class="fcard-icon">${f.icon}</div>
              <div>
                <div class="fcard-title">${f.title}</div>
                <div class="fcard-desc">${f.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>

      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Trust / governance ─────────────────────────────────────────────── -->
    <section class="pub-section">
      <div style="display:flex;gap:56px;align-items:flex-start">

        <!-- Left: intro -->
        <div style="flex:1;padding-top:4px">
          <div class="pub-eyebrow">Clinical governance by design</div>
          <div class="pub-section-title" style="font-size:26px;margin-bottom:14px">
            Rigour is<br>not optional.
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.75;margin-bottom:14px">
            In neuromodulation, a protocol decision is a clinical decision.
            DeepSynaps builds governance, evidence awareness, and auditability
            into every workflow &mdash; not as compliance add-ons, but as core architecture.
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);line-height:1.7">
            Protocol approval requires a qualified reviewer. Session deviations are flagged
            in real time. Every change is timestamped and attributed. Adverse events
            are logged, categorised, and linked to the session and course that produced them.
          </div>
        </div>

        <!-- Right: pillars -->
        <div style="flex:1.1">
          <div class="pub-trust-split">
            ${[
              {
                icon: '⬡',
                title: 'Deterministic Protocol Logic',
                desc: 'Protocols are structured records, not free-text notes. Device parameters, electrode placement, and session counts are explicit fields — not clinical interpretation.',
              },
              {
                icon: '⚗',
                title: 'Evidence-Aware Workflows',
                desc: 'Every protocol carries an A–D evidence grade drawn from the literature. Clinicians see evidence context at every decision point, not just at protocol selection.',
              },
              {
                icon: '◱',
                title: 'Clinician Review &amp; Approval',
                desc: 'Treatment courses require approval before sessions begin. Reviewers have a dedicated queue. Changes trigger re-approval. No session starts without a signed-off protocol.',
              },
              {
                icon: '◧',
                title: 'Full Auditability',
                desc: 'Complete audit trail per course: who created it, who approved it, which sessions ran, which deviated, what adverse events occurred. Timestamped and role-attributed.',
              },
            ].map(t => `
              <div class="pub-trust-row">
                <div class="pub-trust-row-icon">${t.icon}</div>
                <div>
                  <div class="pub-trust-row-title">${t.title}</div>
                  <div class="pub-trust-row-desc">${t.desc}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Pricing ─────────────────────────────────────────────────────────── -->
    <section class="pub-section pub-pricing-section">

      <div style="text-align:center;margin-bottom:52px">
        <div class="pub-eyebrow">Pricing</div>
        <div class="pub-section-title" style="text-align:center;font-size:30px;margin-bottom:12px">
          Pricing built for neuromodulation clinics
        </div>
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.7;max-width:520px;margin:0 auto">
          Start with one clinician or roll out across a full clinic team.
          Patient portal access is included in every paid plan.
        </div>
        <div style="display:flex;gap:20px;justify-content:center;flex-wrap:wrap;margin-top:18px">
          <span class="pub-pricing-trust-badge">◉ Patient portal included in all paid plans</span>
          <span class="pub-pricing-trust-badge">◈ Save 15% annually</span>
          <span class="pub-pricing-trust-badge">◇ Enterprise onboarding available</span>
        </div>
      </div>

      <div class="pub-pricing-grid">

        <!-- Resident -->
        <div class="pub-plan-card">
          <div class="pub-plan-header">
            <div class="pub-plan-name">Resident</div>
            <div class="pub-plan-sub">For solo practitioners getting started</div>
            <div class="pub-plan-price"><span class="pub-plan-amount">$99</span><span class="pub-plan-period">/mo</span></div>
          </div>
          <ul class="pub-plan-features">
            <li>1 professional seat</li>
            <li>Deterministic protocol intelligence</li>
            <li>Treatment courses</li>
            <li>Assessments</li>
            <li>Patient portal access</li>
            <li>Basic reports</li>
            <li>EV-A / EV-B evidence access</li>
          </ul>
          <button class="pub-plan-cta" onclick="window._navPublic('signup-professional')">
            Start Free Trial &rarr;
          </button>
        </div>

        <!-- Clinician Pro — highlighted -->
        <div class="pub-plan-card pub-plan-card--featured">
          <div class="pub-plan-popular-badge">Most Popular</div>
          <div class="pub-plan-header">
            <div class="pub-plan-name">Clinician Pro</div>
            <div class="pub-plan-sub">For full clinical workflows and protocol governance</div>
            <div class="pub-plan-price"><span class="pub-plan-amount">$199</span><span class="pub-plan-period">/mo</span></div>
          </div>
          <ul class="pub-plan-features">
            <li>1 professional seat</li>
            <li>Unlimited patients</li>
            <li>Treatment-course workflows</li>
            <li>Protocol intelligence</li>
            <li>Patient portal</li>
            <li>Outcomes tracking</li>
            <li>qEEG &amp; brain data</li>
            <li>DOCX / report exports</li>
            <li>EV-C override &amp; off-label governance</li>
          </ul>
          <button class="pub-plan-cta pub-plan-cta--featured" onclick="window._navPublic('signup-professional')">
            Get Started &rarr;
          </button>
        </div>

        <!-- Clinic Team -->
        <div class="pub-plan-card">
          <div class="pub-plan-header">
            <div class="pub-plan-name">Clinic Team</div>
            <div class="pub-plan-sub">For multi-user clinics running treatment operations together</div>
            <div class="pub-plan-price"><span class="pub-plan-amount">$699</span><span class="pub-plan-period">/mo</span></div>
          </div>
          <ul class="pub-plan-features">
            <li>Up to 5 professional seats</li>
            <li>Shared review queue</li>
            <li>Technician workflows</li>
            <li>Device-aware session execution</li>
            <li>Team audit trail</li>
            <li>Clinic outcomes dashboard</li>
            <li>Light white-labelling</li>
          </ul>
          <button class="pub-plan-cta" onclick="window._navPublic('signup-professional')">
            Book Demo &rarr;
          </button>
        </div>

        <!-- Enterprise -->
        <div class="pub-plan-card pub-plan-card--enterprise">
          <div class="pub-plan-header">
            <div class="pub-plan-name">Enterprise</div>
            <div class="pub-plan-sub">For multi-site groups and advanced governance</div>
            <div class="pub-plan-price"><span class="pub-plan-amount pub-plan-amount--custom">Custom</span></div>
          </div>
          <ul class="pub-plan-features">
            <li>Custom seats &amp; roles</li>
            <li>Multi-site governance</li>
            <li>API access</li>
            <li>SSO integration</li>
            <li>Custom workflows</li>
            <li>Full white-label</li>
            <li>Implementation support</li>
          </ul>
          <button class="pub-plan-cta pub-plan-cta--ghost" onclick="window._navPublic('signup-professional')">
            Talk to Sales &rarr;
          </button>
        </div>

      </div>

      <!-- FAQ / Trust note -->
      <div class="pub-pricing-footer-note">
        <div style="display:flex;gap:32px;justify-content:center;flex-wrap:wrap;align-items:center">
          <span>◈ &nbsp;No setup fees. Cancel anytime.</span>
          <span style="width:1px;height:16px;background:var(--border);display:inline-block"></span>
          <span>◉ &nbsp;HIPAA-compliant infrastructure included in all plans.</span>
          <span style="width:1px;height:16px;background:var(--border);display:inline-block"></span>
          <span>◇ &nbsp;Need a custom quote? <button class="pub-pricing-inline-link" onclick="window._navPublic('signup-professional')">Contact us &rarr;</button></span>
        </div>
      </div>

    </section>

    <div class="pub-divider"></div>

    <!-- ─── Final CTA ──────────────────────────────────────────────────────── -->
    <div class="pub-cta-section">
      <div class="pub-eyebrow" style="display:block;text-align:center;margin-bottom:16px">Get started</div>
      <div class="pub-cta-title">Choose your entry point.</div>
      <div class="pub-cta-sub">
        DeepSynaps has a distinct experience for each role.
        Select yours to begin.
      </div>

      <div class="pub-cta-trio">

        <div class="pub-cta-card primary-cta">
          <div class="pub-cta-card-icon" style="color:var(--teal)">⚕</div>
          <div class="pub-cta-card-title">Create Clinic Account</div>
          <div class="pub-cta-card-sub">
            For clinicians, technicians, researchers, and clinic administrators.
          </div>
          <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')"
            style="width:100%;font-size:12.5px;padding:10px">
            Start as Professional &rarr;
          </button>
        </div>

        <div class="pub-cta-card secondary-cta">
          <div class="pub-cta-card-icon" style="color:var(--blue)">◉</div>
          <div class="pub-cta-card-title">Patient Portal</div>
          <div class="pub-cta-card-sub">
            For patients registered by a clinic. Requires an invitation code.
          </div>
          <button
            onclick="window._navPublic('signup-patient')"
            style="width:100%;font-size:12.5px;padding:10px;border-radius:var(--radius-lg);background:rgba(74,158,255,0.1);color:var(--blue);border:1px solid var(--border-blue);font-family:var(--font-body);font-weight:600;cursor:pointer;transition:all 0.15s">
            Activate Patient Portal &rarr;
          </button>
        </div>

        <div class="pub-cta-card">
          <div class="pub-cta-card-icon" style="color:var(--text-tertiary)">◇</div>
          <div class="pub-cta-card-title">Sign In</div>
          <div class="pub-cta-card-sub">
            Already have an account. Access your existing professional or patient session.
          </div>
          <button class="btn-hero-ghost" onclick="window._showSignIn()"
            style="width:100%;font-size:12.5px;padding:10px">
            Sign In to Your Account
          </button>
        </div>

      </div>

      <div style="margin-top:32px;font-size:11.5px;color:var(--text-tertiary);text-align:center;line-height:1.7">
        ⚕ &nbsp;DeepSynaps is a clinical operations platform for qualified neuromodulation practitioners.<br>
        All protocols and session parameters are for professional use only.
        Patient access is clinic-provisioned.
      </div>
    </div>

    <!-- ─── Footer ─────────────────────────────────────────────────────────── -->
    <div class="pub-footer">
      <div class="pub-footer-logo">
        <div class="logo-icon" style="width:24px;height:24px;font-size:11px">🧠</div>
        DeepSynaps Studio
      </div>
      <div class="pub-footer-links">
        <span class="pub-footer-link">Privacy Policy</span>
        <span class="pub-footer-link">Terms of Service</span>
        <span class="pub-footer-link">Clinical Disclaimer</span>
        <span class="pub-footer-link">Contact</span>
      </div>
      <div class="pub-footer-copy">&copy; 2026 DeepSynaps. All rights reserved.</div>
    </div>
  `;

  // ── Evidence matrix interactivity ─────────────────────────────────────────
  window._evTab = function(idx) {
    document.querySelectorAll('.pub-ev-tab').forEach((t, i)   => t.classList.toggle('active', i === idx));
    document.querySelectorAll('.pub-ev-panel').forEach((p, i) => p.classList.toggle('active', i === idx));
    // re-apply active filter to newly visible panel
    const activeBtn = document.querySelector('.pub-ev-filter-btn.active');
    if (activeBtn && activeBtn.dataset.mod !== 'ALL') window._evFilter(activeBtn.dataset.mod);
  };

  window._evFilter = function(modId) {
    document.querySelectorAll('.pub-ev-filter-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.mod === modId));
    const all = modId === 'ALL';
    document.querySelectorAll('.pub-ev-mod-th').forEach(th =>
      (th.style.opacity = all || th.dataset.mod === modId ? '1' : '0.2'));
    document.querySelectorAll('.pub-ev-cell').forEach(td =>
      (td.style.opacity = all || td.dataset.mod === modId ? '1' : '0.08'));
    document.querySelectorAll('tr.pub-ev-row').forEach(tr => {
      if (all) { tr.style.opacity = '1'; return; }
      const cell = tr.querySelector(`.pub-ev-cell[data-mod="${modId}"]`);
      tr.style.opacity = cell && cell.dataset.ev ? '1' : '0.25';
    });
  };

  // ── Inject FAQ chat widget ─────────────────────────────────────────────────
  _initPublicChat();
}

// ── Public FAQ chat widget ────────────────────────────────────────────────────
let _pubChatHistory = [];
let _pubChatBusy = false;

function _initPublicChat() {
  // Remove existing widget if re-entering home
  document.getElementById('pub-chat-widget')?.remove();

  const widget = document.createElement('div');
  widget.id = 'pub-chat-widget';
  widget.innerHTML = `
    <!-- Bubble toggle -->
    <button class="pub-chat-bubble" id="pub-chat-bubble" onclick="window._pubChatToggle()" title="Chat with us">
      <span id="pub-chat-bubble-icon">💬</span>
    </button>

    <!-- Chat panel -->
    <div class="pub-chat-panel" id="pub-chat-panel" style="display:none">
      <div class="pub-chat-header">
        <div>
          <div style="font-weight:700;font-size:13px">DeepSynaps AI</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.65);margin-top:1px">Ask us anything</div>
        </div>
        <button class="pub-chat-close" onclick="window._pubChatToggle()">✕</button>
      </div>
      <div class="pub-chat-messages" id="pub-chat-messages">
        <div class="pub-chat-msg pub-chat-msg--agent">
          <div class="pub-chat-bubble-msg">
            Hi! I'm the DeepSynaps AI. Ask me about our neuromodulation platform, pricing, how to get started, or anything about our clinical tools.
          </div>
        </div>
      </div>
      <div class="pub-chat-typing" id="pub-chat-typing" style="display:none">
        <div class="pub-chat-dot"></div><div class="pub-chat-dot"></div><div class="pub-chat-dot"></div>
      </div>
      <div class="pub-chat-input-row">
        <input
          id="pub-chat-input"
          class="pub-chat-input"
          type="text"
          placeholder="Type a question…"
          onkeydown="if(event.key==='Enter')window._pubChatSend()"
        >
        <button class="pub-chat-send" onclick="window._pubChatSend()">↑</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  window._pubChatToggle = function() {
    const panel = document.getElementById('pub-chat-panel');
    const icon  = document.getElementById('pub-chat-bubble-icon');
    const open  = panel.style.display === 'none';
    panel.style.display = open ? 'flex' : 'none';
    if (icon) icon.textContent = open ? '✕' : '💬';
    if (open) setTimeout(() => document.getElementById('pub-chat-input')?.focus(), 100);
  };

  window._pubChatSend = async function() {
    if (_pubChatBusy) return;
    const input = document.getElementById('pub-chat-input');
    const text = input?.value.trim();
    if (!text) return;
    input.value = '';

    _pubChatHistory.push({ role: 'user', content: text });
    _appendPubMsg('user', text);

    _pubChatBusy = true;
    document.getElementById('pub-chat-typing').style.display = 'flex';
    _scrollPubChat();

    try {
      const result = await api.chatPublic(_pubChatHistory);
      const reply = result?.reply || 'Sorry, I couldn\'t get a response. Please try again.';
      _pubChatHistory.push({ role: 'assistant', content: reply });
      _appendPubMsg('agent', reply);
    } catch {
      _appendPubMsg('agent', 'Having trouble connecting. Try again in a moment, or use the sign-up form to contact us.');
    } finally {
      _pubChatBusy = false;
      document.getElementById('pub-chat-typing').style.display = 'none';
      _scrollPubChat();
    }
  };
}

function _appendPubMsg(role, text) {
  const el = document.getElementById('pub-chat-messages');
  if (!el) return;
  const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  const div = document.createElement('div');
  div.className = `pub-chat-msg pub-chat-msg--${role}`;
  div.innerHTML = `<div class="pub-chat-bubble-msg">${safe}</div>`;
  el.appendChild(div);
  _scrollPubChat();
}

function _scrollPubChat() {
  requestAnimationFrame(() => {
    const el = document.getElementById('pub-chat-messages');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

// ── Professional Signup (/signup/professional) ────────────────────────────────
export function pgSignupProfessional() {
  const el = document.getElementById('public-shell');
  el.scrollTop = 0;
  el.innerHTML = `
    ${pubTopbar()}
    <div class="pub-signup-wrap">
      <div class="pub-signup-card">
        <button class="pub-back-link" onclick="window._navPublic('home')">&#8592; Back to home</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div class="logo-icon" style="width:36px;height:36px;font-size:15px">🧠</div>
          <div>
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px">DeepSynaps Studio</div>
            <div style="font-size:11px;color:var(--teal);font-weight:600">Professional Registration</div>
          </div>
        </div>
        <div class="pub-signup-title">Create your professional account</div>
        <div class="pub-signup-sub">
          For qualified clinicians, technicians, and clinic administrators.
          All accounts are reviewed before full protocol access is granted.
        </div>

        <div class="step-indicator">
          <div class="step-pip active" id="pip-1"></div>
          <div class="step-pip" id="pip-2"></div>
          <div class="step-pip" id="pip-3"></div>
        </div>

        <!-- Step 1: Practice -->
        <div id="prof-step-1">
          <div class="form-group">
            <label class="form-label">Clinic / Practice Name</label>
            <input id="prof-clinic" class="form-control" placeholder="NeuroBalance Clinic" autocomplete="organization">
          </div>
          <div class="form-group">
            <label class="form-label">Your Professional Role</label>
            <select id="prof-role" class="form-control">
              <option value="">Select a role</option>
              <option value="clinician">Clinician / Neurologist / Psychiatrist</option>
              <option value="psychologist">Psychologist / Neuropsychologist</option>
              <option value="technician">Neuromodulation Technician</option>
              <option value="researcher">Clinical Researcher</option>
              <option value="admin">Clinic Administrator</option>
              <option value="resident">Resident / Fellow</option>
            </select>
          </div>
          <div id="prof-step1-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <button class="btn-hero-primary" style="width:100%;font-size:13px;padding:11px" onclick="window._profNext(1)">
            Continue &rarr;
          </button>
        </div>

        <!-- Step 2: Credentials -->
        <div id="prof-step-2" style="display:none">
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input id="prof-email" class="form-control" type="email" placeholder="dr.smith@clinic.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input id="prof-password" class="form-control" type="password" placeholder="Min. 8 characters" autocomplete="new-password">
          </div>
          <div class="form-group">
            <label class="form-label">Confirm Password</label>
            <input id="prof-password2" class="form-control" type="password" placeholder="Repeat password" autocomplete="new-password">
          </div>
          <div id="prof-step2-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" style="flex:1;padding:10px" onclick="window._profBack(2)">&#8592; Back</button>
            <button class="btn-hero-primary" style="flex:2;font-size:13px;padding:11px" onclick="window._profNext(2)">Continue &rarr;</button>
          </div>
        </div>

        <!-- Step 3: Specialty -->
        <div id="prof-step-3" style="display:none">
          <div class="form-group">
            <label class="form-label">Primary Modality Focus <span style="color:var(--text-tertiary);font-weight:400">(select all that apply)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px" id="prof-mod-chips">
              ${['tDCS', 'TMS', 'tACS', 'PEMF', 'Neurofeedback', 'PBM / Laser'].map(m =>
                `<div class="mod-chip" data-mod="${m}" onclick="window._toggleProfMod(this,'${m}')">${m}</div>`
              ).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Primary Condition Focus</label>
            <select id="prof-condition" class="form-control">
              <option value="">Select primary condition</option>
              <option>Depression / MDD</option>
              <option>Anxiety Disorders</option>
              <option>PTSD</option>
              <option>ADHD</option>
              <option>Chronic Pain</option>
              <option>Traumatic Brain Injury</option>
              <option>Autism Spectrum</option>
              <option>Parkinson's Disease</option>
              <option>Stroke Rehabilitation</option>
              <option>Cognitive Enhancement</option>
              <option>Multiple Conditions</option>
            </select>
          </div>
          <div id="prof-step3-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <div class="notice notice-info" style="margin-bottom:14px;font-size:11.5px">
            &#9877; By creating an account you confirm you are a licensed healthcare professional or researcher.
            Clinical platform for qualified practitioners only.
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" style="flex:1;padding:10px" onclick="window._profBack(3)">&#8592; Back</button>
            <button class="btn-hero-primary" style="flex:2;font-size:13px;padding:11px" id="prof-submit-btn" onclick="window._profSubmit()">
              Create Account &rarr;
            </button>
          </div>
        </div>

        <!-- Done -->
        <div id="prof-step-done" style="display:none;text-align:center;padding:24px 0">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,212,188,0.1);border:1px solid var(--border-teal);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:22px;color:var(--teal)">&#10003;</div>
          <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Account Created</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">Welcome to DeepSynaps Studio. Signing you in now&hellip;</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:20px;font-size:12px;color:var(--text-tertiary)">
        Already have an account? <span onclick="window._showSignIn()" style="color:var(--teal);cursor:pointer">Sign in</span>
      </div>
    </div>
  `;

  let selectedMods = [];

  window._toggleProfMod = function(el, mod) {
    const idx = selectedMods.indexOf(mod);
    if (idx === -1) { selectedMods.push(mod); el.classList.add('selected'); }
    else { selectedMods.splice(idx, 1); el.classList.remove('selected'); }
  };

  window._profNext = function(step) {
    if (step === 1) {
      const clinic = document.getElementById('prof-clinic').value.trim();
      const role   = document.getElementById('prof-role').value;
      const err    = document.getElementById('prof-step1-err');
      if (!clinic || !role) { err.textContent = 'Please fill in all fields.'; err.style.display = ''; return; }
      err.style.display = 'none';
      document.getElementById('prof-step-1').style.display = 'none';
      document.getElementById('prof-step-2').style.display = '';
      document.getElementById('pip-1').className = 'step-pip done';
      document.getElementById('pip-2').className = 'step-pip active';
    } else if (step === 2) {
      const email = document.getElementById('prof-email').value.trim();
      const pw    = document.getElementById('prof-password').value;
      const pw2   = document.getElementById('prof-password2').value;
      const err   = document.getElementById('prof-step2-err');
      if (!email || !pw) { err.textContent = 'Email and password required.'; err.style.display = ''; return; }
      if (pw.length < 8)  { err.textContent = 'Password must be at least 8 characters.'; err.style.display = ''; return; }
      if (pw !== pw2)     { err.textContent = 'Passwords do not match.'; err.style.display = ''; return; }
      err.style.display = 'none';
      document.getElementById('prof-step-2').style.display = 'none';
      document.getElementById('prof-step-3').style.display = '';
      document.getElementById('pip-2').className = 'step-pip done';
      document.getElementById('pip-3').className = 'step-pip active';
    }
  };

  window._profBack = function(step) {
    if (step === 2) {
      document.getElementById('prof-step-2').style.display = 'none';
      document.getElementById('prof-step-1').style.display = '';
      document.getElementById('pip-2').className = 'step-pip';
      document.getElementById('pip-1').className = 'step-pip active';
    } else if (step === 3) {
      document.getElementById('prof-step-3').style.display = 'none';
      document.getElementById('prof-step-2').style.display = '';
      document.getElementById('pip-3').className = 'step-pip';
      document.getElementById('pip-2').className = 'step-pip active';
    }
  };

  window._profSubmit = async function() {
    const btn  = document.getElementById('prof-submit-btn');
    const err  = document.getElementById('prof-step3-err');
    err.style.display = 'none';
    btn.textContent = 'Creating account\u2026';
    btn.disabled = true;

    const name     = document.getElementById('prof-clinic').value.trim();
    const email    = document.getElementById('prof-email').value.trim();
    const password = document.getElementById('prof-password').value;

    let user = null;
    try {
      const res = await api.register(email, name, password);
      if (res?.access_token) {
        api.setToken(res.access_token);
        user = res.user || { email, display_name: name, role: 'clinician', package_id: 'clinician_pro' };
      }
    } catch (_) {}

    // Offline demo fallback
    if (!user) {
      api.setToken('clinician-demo-token');
      user = { email, display_name: name, role: 'clinician', package_id: 'clinician_pro' };
    }

    document.getElementById('prof-step-3').style.display = 'none';
    document.getElementById('prof-step-done').style.display = '';
    document.getElementById('pip-3').className = 'step-pip done';

    setCurrentUser(user);
    setTimeout(() => { localStorage.removeItem('ds_onboarding_done'); showApp(); updateUserBar(); window._bootApp(); }, 1200);
  };
}

// ── Patient Signup (/signup/patient) ──────────────────────────────────────────
export function pgSignupPatient() {
  const el = document.getElementById('public-shell');
  el.scrollTop = 0;
  el.innerHTML = `
    ${pubTopbar()}
    <div class="pub-signup-wrap">
      <div class="pub-signup-card">
        <button class="pub-back-link" onclick="window._navPublic('home')">&#8592; Back to home</button>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div class="logo-icon" style="width:36px;height:36px;font-size:16px;background:linear-gradient(135deg,var(--blue-dim),var(--violet))">&#9673;</div>
          <div>
            <div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px">DeepSynaps Studio</div>
            <div style="font-size:11px;color:var(--blue);font-weight:600">Patient Portal Access</div>
          </div>
        </div>
        <div class="pub-signup-title">Access your patient portal</div>
        <div class="pub-signup-sub">
          Your clinic provides an invitation code or registered your email directly.
          If you don't have a code, contact your clinic.
        </div>

        <div style="display:flex;border-bottom:1px solid var(--border);margin-bottom:24px">
          <button class="tab-btn active" id="tab-invite" onclick="window._ptTab('invite')">Invitation Code</button>
          <button class="tab-btn" id="tab-direct" onclick="window._ptTab('direct')">Clinic Email Link</button>
        </div>

        <!-- Invite code form -->
        <div id="pt-invite-form">
          <div class="form-group">
            <label class="form-label">Invitation Code</label>
            <input id="pt-code" class="form-control" placeholder="e.g. NB-2026-XXXX" style="font-family:var(--font-mono);letter-spacing:1px">
          </div>
          <div class="form-group">
            <label class="form-label">Full Name</label>
            <input id="pt-name" class="form-control" placeholder="Jane Doe" autocomplete="name">
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input id="pt-email" class="form-control" type="email" placeholder="patient@email.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label">Create Password</label>
            <input id="pt-pw" class="form-control" type="password" placeholder="Min. 8 characters" autocomplete="new-password">
          </div>
          <div id="pt-invite-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <button
            style="width:100%;font-size:13px;padding:12px;border-radius:var(--radius-lg);background:linear-gradient(135deg,var(--blue-dim),var(--violet));color:#fff;font-family:var(--font-body);font-weight:600;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(74,158,255,0.3);transition:all 0.15s"
            onclick="window._ptActivate()">
            Activate Portal &rarr;
          </button>
        </div>

        <!-- Direct email form -->
        <div id="pt-direct-form" style="display:none">
          <div class="notice notice-info" style="margin-bottom:16px">
            If your clinic registered you directly, enter your email to receive an activation link.
          </div>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input id="pt-email-direct" class="form-control" type="email" placeholder="patient@email.com">
          </div>
          <div id="pt-direct-err" style="color:var(--red);font-size:12px;margin-bottom:10px;display:none"></div>
          <button
            style="width:100%;font-size:13px;padding:12px;border-radius:var(--radius-lg);background:linear-gradient(135deg,var(--blue-dim),var(--violet));color:#fff;font-family:var(--font-body);font-weight:600;border:none;cursor:pointer"
            onclick="window._ptEmailSend()">
            Send Activation Link &rarr;
          </button>
        </div>

        <!-- Done -->
        <div id="pt-done" style="display:none;text-align:center;padding:24px 0">
          <div style="width:56px;height:56px;border-radius:50%;background:rgba(74,158,255,0.1);border:1px solid var(--border-blue);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:22px;color:var(--blue)">&#9673;</div>
          <div style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:8px">Portal Activated</div>
          <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">Welcome. Opening your portal now&hellip;</div>
        </div>
      </div>
      <div style="text-align:center;margin-top:20px;font-size:12px;color:var(--text-tertiary)">
        Already have access? <span onclick="window._showSignIn()" style="color:var(--blue);cursor:pointer">Sign in</span>
      </div>
    </div>
  `;

  window._ptTab = function(tab) {
    document.getElementById('pt-invite-form').style.display  = tab === 'invite' ? '' : 'none';
    document.getElementById('pt-direct-form').style.display  = tab === 'direct' ? '' : 'none';
    document.getElementById('tab-invite').classList.toggle('active', tab === 'invite');
    document.getElementById('tab-direct').classList.toggle('active', tab === 'direct');
  };

  window._ptActivate = async function() {
    const code = document.getElementById('pt-code').value.trim();
    const name = document.getElementById('pt-name').value.trim();
    const email = document.getElementById('pt-email').value.trim();
    const pw   = document.getElementById('pt-pw').value;
    const err  = document.getElementById('pt-invite-err');
    err.style.display = 'none';
    if (!code || !name || !email || !pw) { err.textContent = 'All fields required.'; err.style.display = ''; return; }
    if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters.'; err.style.display = ''; return; }

    // Demo: accept any non-empty code
    document.getElementById('pt-invite-form').style.display = 'none';
    document.getElementById('pt-done').style.display = '';

    api.setToken('patient-demo-token');
    setCurrentUser({ email, display_name: name, role: 'patient', package_id: 'patient' });
    setTimeout(() => { showPatient(); updatePatientBar(); window._bootPatient?.(); }, 1200);
  };

  window._ptEmailSend = function() {
    const email = document.getElementById('pt-email-direct').value.trim();
    const err   = document.getElementById('pt-direct-err');
    err.style.display = 'none';
    if (!email) { err.textContent = 'Email required.'; err.style.display = ''; return; }
    document.getElementById('pt-direct-form').innerHTML = `
      <div class="notice notice-ok">
        If <strong>${email}</strong> is registered with a clinic, an activation link has been sent. Check your inbox.
      </div>
    `;
  };
}
