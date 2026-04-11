import { api } from './api.js';
import { setCurrentUser, showApp, showPatient, updateUserBar, updatePatientBar } from './auth.js';
import { t, getLocale, setLocale, LOCALES } from './i18n.js';

// ── Shared: public topbar ─────────────────────────────────────────────────────
function _pubLangMenu() {
  const cur = getLocale();
  const opts = Object.entries(LOCALES).map(([code, label]) =>
    `<button class="pub-lang-opt${code === cur ? ' active' : ''}" onclick="window._pubSetLocale('${code}')">${label}</button>`
  ).join('');
  return `
    <div class="pub-lang-picker" id="pub-lang-picker">
      <button class="pub-lang-btn" id="pub-lang-toggle-btn" onclick="window._pubLangToggle()"
              aria-label="${t('pub.lang')}" aria-haspopup="listbox" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>
        <span class="pub-lang-cur">${LOCALES[cur] || cur.toUpperCase()}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="pub-lang-menu" id="pub-lang-menu" role="listbox" aria-label="${t('pub.lang')}">${opts}</div>
    </div>`;
}

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
        <button class="pub-nav-link" onclick="(function(){const s=document.getElementById('public-shell');const e=s&&s.querySelector('#modalities-section');const off=window.innerWidth<=768?116:80;if(s&&e)s.scrollTo({top:Math.max(0,e.getBoundingClientRect().top+s.scrollTop-off),behavior:'smooth'});})()">
          ${t('pub.nav.modalities')}</button>
        <button class="pub-nav-link" onclick="(function(){const s=document.getElementById('public-shell');const e=s&&s.querySelector('.pub-ev-section');const off=window.innerWidth<=768?116:80;if(s&&e)s.scrollTo({top:Math.max(0,e.getBoundingClientRect().top+s.scrollTop-off),behavior:'smooth'});})()">
          ${t('pub.nav.conditions')}</button>
        <button class="pub-nav-link" onclick="(function(){const s=document.getElementById('public-shell');const e=s&&s.querySelector('.pub-pricing-section');const off=window.innerWidth<=768?116:80;if(s&&e)s.scrollTo({top:Math.max(0,e.getBoundingClientRect().top+s.scrollTop-off),behavior:'smooth'});})()">
          ${t('pub.nav.pricing')}</button>
        <div style="width:1px;height:20px;background:var(--border);margin:0 6px"></div>
        <button class="pub-nav-link" onclick="window._navPublic('signup-patient')" title="Patient portal access">${t('pub.nav.patients')}</button>
        ${_pubLangMenu()}
        <button class="pub-nav-link" onclick="window._showSignIn()">${t('pub.nav.signin')}</button>
        <button class="btn btn-primary btn-sm" onclick="window._navPublic('signup-professional')" style="margin-left:4px">${t('pub.nav.trial')}</button>
      </div>
      <!-- Mobile CTA strip (hidden on desktop via CSS) -->
      <div class="pub-topbar-mobile-ctas">
        <button class="pub-mobile-cta-sign-in" onclick="window._showSignIn()">Sign In</button>
        <button class="pub-mobile-cta-trial" onclick="window._navPublic('signup-professional')">Free Trial</button>
      </div>
    </div>
    <!-- Mobile sticky patient CTA bar -->
    <div class="pub-mobile-patient-bar">
      <span style="font-size:11px;color:var(--text-tertiary)">◉ Patient?</span>
      <button onclick="window._navPublic('signup-patient')" style="font-size:12px;font-weight:600;color:var(--blue);background:rgba(74,158,255,0.1);border:1px solid var(--border-blue);border-radius:8px;padding:6px 14px;cursor:pointer;font-family:var(--font-body)">Activate Patient Portal &rarr;</button>
    </div>
  `;
}

// expose locale switching globally so onclick handlers work
window._pubSetLocale = function(code) {
  setLocale(code);
  document.getElementById('pub-lang-menu')?.classList.remove('open');
  document.getElementById('pub-lang-toggle-btn')?.setAttribute('aria-expanded', 'false');
};
window._pubLangToggle = function() {
  const menu = document.getElementById('pub-lang-menu');
  const btn  = document.getElementById('pub-lang-toggle-btn');
  if (!menu) return;
  const opening = !menu.classList.contains('open');
  menu.classList.toggle('open', opening);
  btn?.setAttribute('aria-expanded', String(opening));
};
// Close public lang menu on outside click (register once)
if (!window._pubLangClickBound) {
  window._pubLangClickBound = true;
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#pub-lang-picker')) {
      document.getElementById('pub-lang-menu')?.classList.remove('open');
      document.getElementById('pub-lang-toggle-btn')?.setAttribute('aria-expanded', 'false');
    }
  });
}

// ── Landing Page (/home) ──────────────────────────────────────────────────────
export function pgHome() {
  const el = document.getElementById('public-shell');
  el.scrollTop = 0;

  // ── Evidence matrix data (sourced from Neuromodulation Master Database) ──────
  const _evMods = [
    { id:'TMS',   label:'TMS',   color:'#00d4bc', full:'Transcranial Magnetic Stimulation',         papers:'1,000+', papersFull:'1,000+ published studies' },
    { id:'tDCS',  label:'tDCS',  color:'#4a9eff', full:'Transcranial Direct Current Stimulation',   papers:'400+',   papersFull:'400+ published studies'    },
    { id:'tACS',  label:'tACS',  color:'#7c3aed', full:'Transcranial Alternating Current Stim.',    papers:'150+',   papersFull:'150+ published studies'    },
    { id:'CES',   label:'CES',   color:'#0284c7', full:'Cranial Electrotherapy Stimulation',         papers:'80+',    papersFull:'80+ published studies'     },
    { id:'taVNS', label:'taVNS', color:'#d97706', full:'Transcranial Auricular Vagus Nerve Stim.',   papers:'60+',    papersFull:'60+ published studies'     },
    { id:'TPS',   label:'TPS',   color:'#c026d3', full:'Transcranial Pulse Stimulation',             papers:'30+',    papersFull:'30+ published studies'     },
    { id:'PBM',   label:'PBM',   color:'#fb923c', full:'Photobiomodulation (tPBM)',                  papers:'80+',    papersFull:'80+ published studies'     },
    { id:'PEMF',  label:'PEMF',  color:'#f59e0b', full:'Pulsed Electromagnetic Field Therapy',       papers:'100+',   papersFull:'100+ published studies'    },
    { id:'NF',    label:'NF',    color:'#059669', full:'Neurofeedback',                              papers:'300+',   papersFull:'300+ published studies'    },
    { id:'LIFU',  label:'LIFU',  color:'#64748b', full:'Low-Intensity Focused Ultrasound',           papers:'40+',    papersFull:'40+ published studies'     },
    { id:'tRNS',  label:'tRNS',  color:'#94a3b8', full:'Transcranial Random Noise Stimulation',      papers:'50+',    papersFull:'50+ published studies'     },
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

  // ── Study counts — sourced from peer-reviewed meta-analyses & RCTs ──────────
  // Format: 'Condition name|ModID' → 'N RCTs' or 'N studies' (cited from sources)
  const _evN = {
    // TMS sources
    'Depression (MDD)|TMS':                   '100+ RCTs',   // APA/CANMAT/NICE guidelines 2023
    'Treatment-Resistant Depression|TMS':      '20+ RCTs',   // THREE-D trial + BRIGhTMIND + others
    'OCD|TMS':                                 '8 RCTs',     // BrainsWay De Novo + SMA meta-analyses
    'PTSD|TMS':                                '15 RCTs',    // PMC 2025 meta-analysis, n=760
    'Parkinson\'s Disease|TMS':                '27 RCTs',    // JAMA Neurology 2015 meta-analysis
    'Stroke Rehabilitation|TMS':               '22+ RCTs',   // PubMed 2024 meta-analysis (FMA-UE)
    'Tinnitus|TMS':                            '16 RCTs',    // PMC 2025 meta-analysis, n=1105
    'Chronic Pain|TMS':                        '12 RCTs',    // IFCN Level B (Lefaucheur 2020)
    'Fibromyalgia|TMS':                        '10 RCTs',    // IFCN Level B meta-analysis
    'Schizophrenia|TMS':                       '20 RCTs',    // auditory hallucinations meta-analyses
    'Auditory Hallucinations|TMS':             '15 RCTs',    // IFCN Level A recommendation
    // tDCS sources
    'Depression (MDD)|tDCS':                   '32 studies', // Nature 2024 meta-analysis, SMD=−0.355
    'Chronic Pain|tDCS':                       '11 RCTs',    // Sage 2024 home-based meta-analysis
    'Fibromyalgia|tDCS':                       '10 RCTs',    // IFCN Level B, SMD=−0.95
    'Stroke Rehabilitation|tDCS':              '14 RCTs',    // IFCN Level B motor recovery
    // CES sources
    'Generalised Anxiety Disorder|CES':        '11 RCTs',    // PubMed 2022 meta-analysis, n=794
    'Insomnia|CES':                            '10 studies', // PMC 2021 critical review
    'Fibromyalgia|CES':                        '6 RCTs',     // Cambridge meta-analysis
    // taVNS sources
    'Depression (MDD)|taVNS':                  '12 studies', // PubMed 2023 meta-analysis, n=838
    'PTSD|taVNS':                              '5 RCTs',     // emerging evidence base
    'Epilepsy|taVNS':                          '8 RCTs',     // VNS meta-analysis (PMC 2022)
    // NF sources
    'ADHD — Adult|NF':                         '38 RCTs',    // Cortese 2024 (JAMA Psychiatry), n=2,472
    'ADHD — Paediatric|NF':                    '13 RCTs',    // Cortese 2016 original blinded analysis
    'PTSD|NF':                                 '6 RCTs',     // emerging RCT base
    // tDCS additional
    'Alcohol Use Disorder|tDCS':               '8 RCTs',     // meta-analysis craving outcomes
    'ADHD — Adult|tDCS':                       '8 RCTs',     // multiple RCTs
  };

  function _buildEvMatrix() {
    const evLabel = { S:'Strong — RCT + Meta-analysis', M:'Moderate — RCT', E:'Emerging — Open-label / Pilot' };
    const cats = [...new Set(_evConds.map(c => c.cat))];
    const totalConds   = _evConds.length;
    const totalEntries = _evConds.reduce((n, c) => n + Object.keys(c.ev).length, 0);
    const strongCount  = _evConds.reduce((n, c) => n + Object.values(c.ev).filter(v => v === 'S').length, 0);
    const withCounts   = Object.keys(_evN).length;

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
            const ev  = c.ev[m.id] || null;
            const key = `${c.name}|${m.id}`;
            const nStudies = _evN[key] || null;
            const tip = ev
              ? `${evLabel[ev]} · ${m.full}${nStudies ? ' · ' + nStudies : ''}`
              : `No evidence · ${m.label}`;
            return `<td class="pub-ev-cell" data-mod="${m.id}" data-ev="${ev||''}" title="${tip}">
              ${ev
                ? `<div class="pub-ev-cell-inner">
                    <span class="pub-ev-dot pub-ev-${ev.toLowerCase()}" style="--ev-col:${m.color}"></span>
                    ${nStudies ? `<span class="pub-ev-n">${nStudies.replace(/ ?(RCTs?|studies?)/i,'')}</span>` : ''}
                  </div>`
                : '<span class="pub-ev-none">—</span>'}
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
          ${_evMods.map(m => `<button class="pub-ev-filter-btn" data-mod="${m.id}" style="--ev-col:${m.color}" onclick="window._evFilter('${m.id}')" title="${m.full} · ${m.papersFull}">${m.label}<span class="pub-ev-filter-count">${m.papers}</span></button>`).join('')}
        </div>
        <div class="pub-ev-legend">
          <span class="pub-ev-legend-item"><span class="pub-ev-dot pub-ev-s" style="--ev-col:#00d4bc"></span>Strong</span>
          <span class="pub-ev-legend-item"><span class="pub-ev-dot pub-ev-m" style="--ev-col:#4a9eff"></span>Moderate</span>
          <span class="pub-ev-legend-item"><span class="pub-ev-dot pub-ev-e" style="--ev-col:#94a3b8"></span>Emerging</span>
          <span class="pub-ev-legend-divider"></span>
          <span style="font-size:10.5px;color:var(--text-tertiary)">${totalConds} conditions · ${strongCount} strong findings · <span style="color:var(--teal)">${withCounts} cited</span></span>
        </div>
      </div>
      <div class="pub-ev-layout">
        <nav class="pub-ev-tabs" id="ev-tabs" aria-label="Condition categories">${tabs}</nav>
        <div class="pub-ev-panels" id="ev-panels">${panels}</div>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px;text-align:right">
        ${totalEntries} condition–modality associations · ${withCounts} entries cite specific trial counts · Sources: CANMAT 2023, IFCN 2020, JAMA Psychiatry 2024, and 26 additional meta-analyses
      </div>`;
  }

  // ── Comparison table cell renderer (must be before el.innerHTML) ──────────
  function _cmpCell(v) {
    if (v === 'Purpose-built')    return `<span class="pub-cmp-yes">Purpose-built</span>`;
    if (v === 'Integrated')       return `<span class="pub-cmp-yes">Integrated</span>`;
    if (v === 'Structured queue') return `<span class="pub-cmp-yes">Structured queue</span>`;
    if (v === 'Integrated registry') return `<span class="pub-cmp-yes">Integrated registry</span>`;
    if (v === 'Course-level trail')  return `<span class="pub-cmp-yes">Course-level trail</span>`;
    if (v === 'Modality-specific')   return `<span class="pub-cmp-yes">Modality-specific</span>`;
    if (v === 'Hours')               return `<span class="pub-cmp-yes">Hours</span>`;
    if (v === 'Not available')    return `<span class="pub-cmp-no">Not available</span>`;
    if (v === '✗')                return `<span class="pub-cmp-no">✗</span>`;
    return `<span class="pub-cmp-partial">${v}</span>`;
  }

  el.innerHTML = `
    ${pubTopbar()}

    <!-- ─── COMMERCIAL HERO ───────────────────────────────────────────────── -->
    <section class="phome-hero">
      <div class="phome-hero-overline">Neuromodulation Clinic Software</div>
      <h1 class="phome-hero-headline">Run your TMS &amp; neurofeedback clinic &mdash;<br>from first session to proven outcome</h1>
      <p class="phome-hero-sub">Today&rsquo;s Queue. Quick Outcome Capture. Course Completion Reports. Built for TMS, Neurofeedback, and multi-modal practices.</p>
      <div class="phome-hero-ctas">
        <button class="phome-cta-primary" onclick="window._startDemoTour()">Start Demo Tour &rarr;</button>
        <button class="phome-cta-secondary" onclick="window._nav('pricing')">View Pricing &rarr;</button>
      </div>
      <div class="phome-trust-strip">Used by neuromodulation clinics &nbsp;&middot;&nbsp; HIPAA-aligned &nbsp;&middot;&nbsp; Evidence-mapped protocols</div>
    </section>

    <!-- ─── 3 FEATURE CARDS ───────────────────────────────────────────────── -->
    <section class="phome-features-section">
      <div class="phome-features-eyebrow">Why clinics choose DeepSynaps</div>
      <div class="phome-features-grid">

        <div class="phome-feature-card">
          <div class="phome-feature-icon">&#9335;</div>
          <div class="phome-feature-title">Today&rsquo;s Queue</div>
          <div class="phome-feature-desc">See every patient, session status, overdue assessment, and missed homework in one screen. Start sessions in one click.</div>
          <ul class="phome-feature-bullets">
            <li>Waiting &middot; In Session &middot; Done status at a glance</li>
            <li>Protocol adherence alerts surfaced automatically</li>
            <li>Walk-in patients added in seconds</li>
          </ul>
          <button class="phome-feature-link" onclick="window._nav('patient-queue')">Open Queue &rarr;</button>
        </div>

        <div class="phome-feature-card">
          <div class="phome-feature-icon">&#9649;</div>
          <div class="phome-feature-title">Outcome Proof. In 30 Seconds.</div>
          <div class="phome-feature-desc">Record PHQ-9, GAD-7, MADRS, and 6 other validated scales during or after sessions. Auto-generate a printable treatment summary with trend charts, responder status, and SOAP notes.</div>
          <ul class="phome-feature-bullets">
            <li>9 validated outcome measures built in</li>
            <li>Responder / Partial Responder / Non-Responder classification</li>
            <li>Export PDF for insurance and EMR documentation</li>
          </ul>
          <button class="phome-feature-link" onclick="window._nav('outcomes')">View Outcome Reports &rarr;</button>
        </div>

        <div class="phome-feature-card">
          <div class="phome-feature-icon">&#9671;</div>
          <div class="phome-feature-title">Clinical Scoring Calculator</div>
          <div class="phome-feature-desc">Compute PHQ-9, GAD-7, PCL-5, HAM-D, MADRS, MoCA, and more with live scoring, severity interpretation, and crisis flagging.</div>
          <ul class="phome-feature-bullets">
            <li>All 12 validated scales &mdash; full item entry</li>
            <li>PHQ-9 item 9 crisis flag with 988 Lifeline prompt</li>
            <li>Decision support &mdash; not autonomous diagnosis</li>
          </ul>
          <button class="phome-feature-link" onclick="window._nav('scoring-calc')">Open Calculator &rarr;</button>
        </div>

      </div>
    </section>

    <!-- ─── POSITIONING STRIP ──────────────────────────────────────────────── -->
    <div class="phome-proof-strip">
      <div class="phome-proof-headline">Purpose-built for neuromodulation &mdash; not adapted from generic EHR software.</div>
      <div class="phome-proof-points">
        <div class="phome-proof-point">TMS + Neurofeedback + tDCS + 8 more modalities</div>
        <div class="phome-proof-sep">|</div>
        <div class="phome-proof-point">PHQ-9, GAD-7, PCL-5, HAM-D, MADRS &mdash; validated and scored</div>
        <div class="phome-proof-sep">|</div>
        <div class="phome-proof-point">Treatment courses, sessions, outcomes &mdash; all connected</div>
      </div>
    </div>

    <!-- ─── EVIDENCE MATRIX (Section 4) ───────────────────────────────────── -->
    <section id="evidence-matrix" class="pub-section pub-ev-section phome-ev-section">
      <div class="phome-ev-header">
        <div class="phome-ev-title">Evidence Base: What the research shows by modality</div>
        <div class="phome-ev-subtitle">Sourced from peer-reviewed RCTs and meta-analyses. For reference &mdash; not a clinical recommendation.</div>
      </div>
      ${_buildEvMatrix()}
    </section>

    <!-- ─── PAGE FOOTER STRIP ─────────────────────────────────────────────── -->
    <div class="phome-footer-strip">
      <span class="phome-footer-copy">DeepSynaps Protocol Studio &nbsp;&middot;&nbsp; Questions? <a href="mailto:team@deepsynaps.com" class="phome-footer-link">team@deepsynaps.com</a></span>
      <div class="phome-footer-actions">
        <button class="phome-footer-btn" onclick="window._nav('login')">Sign In &rarr;</button>
        <button class="phome-footer-btn" onclick="window._nav('pricing')">Pricing &rarr;</button>
      </div>
    </div>
  `;

  // ── FAQ accordion ──────────────────────────────────────────────────────────
  window._faqToggle = function(i) {
    const a    = document.getElementById(`faq-a-${i}`);
    const chev = document.getElementById(`faq-chev-${i}`);
    if (!a) return;
    const open = a.style.display !== 'none';
    a.style.display    = open ? 'none' : 'block';
    chev.style.transform = open ? '' : 'rotate(180deg)';
    chev.style.color     = open ? '' : 'var(--teal)';
  };

  // ── Demo Tour ─────────────────────────────────────────────────────────────
  window._startDemoTour = function() {
    window._seedDemoData?.();
    window._demoTour = {
      step: 0,
      steps: [
        {
          route: 'patient-queue',
          label: 'Step 1 of 5',
          title: "Today\u2019s Queue",
          desc: "6 patients, 3 protocol alerts, all managed from one screen. Click \u2018Start Session\u2019 on any waiting patient.",
          hint: null,
        },
        {
          route: 'course-completion-report',
          label: 'Step 2 of 5',
          title: "Course Completion Report",
          desc: "Auto-generated treatment summary with responder status and trend chart. Click \u2018Record Outcome\u2019 in the topbar to capture a score right now.",
          hint: 'record-outcome',
        },
        {
          route: 'outcomes',
          label: 'Step 3 of 5',
          title: "Outcome Tracking",
          desc: "Every scale recorded from any screen lands here. PHQ-9 trend showing an 18 \u2192 8 arc \u2014 50% reduction, Responder status.",
          hint: null,
        },
        {
          route: 'scoring-calc',
          label: 'Step 4 of 5',
          title: "Clinical Scoring Calculator",
          desc: "PHQ-9 active. Click \u2018Load demo scores\u2019 in the top right to watch live severity scoring in action.",
          hint: 'load-demo-scores',
        },
        {
          route: 'pricing',
          label: 'Step 5 of 5',
          title: "Ready to start?",
          desc: "14-day free trial, no credit card required. Clinic Starter covers solo practices; Clinic Pro for multi-clinician teams.",
          hint: null,
        },
      ]
    };
    window._demoNextStep();
  };

  window._demoNextStep = async function() {
    const tour = window._demoTour;
    if (!tour) return;
    const step = tour.steps[tour.step];
    if (!step) return;

    // Resolve a valid course ID before navigating to course-completion-report
    if (step.route === 'course-completion-report') {
      try {
        const { api: _api } = await import('./api.js');
        const courses = await _api.listCourses().catch(() => null);
        const firstCourse = Array.isArray(courses) && courses.length ? courses[0] : null;
        if (firstCourse) {
          window._selectedCourseId = firstCourse.id || firstCourse.course_id || 'crs001';
        } else {
          // Fall back to localStorage seeded courses
          const lsSeeded = (() => { try { return JSON.parse(localStorage.getItem('ds_courses') || '[]'); } catch { return []; } })();
          window._selectedCourseId = (lsSeeded[0]?.id) || 'crs001';
        }
      } catch {
        window._selectedCourseId = window._selectedCourseId || 'crs001';
      }
    }

    window._nav(step.route);

    const totalSteps = tour.steps.length;
    const pct = Math.round(((tour.step + 1) / totalSteps) * 100);
    const isLast = tour.step === totalSteps - 1;
    const nextLabel = isLast ? 'Start Free Trial \u2192' : 'Next \u2192';
    const nextAction = isLast ? 'window._demoEndTour()' : 'window._demoTour.step++;window._demoNextStep()';

    // Hint button: step-specific shortcut (e.g. open outcome capture, load demo scores)
    let hintBtn = '';
    if (step.hint === 'record-outcome') {
      hintBtn = '<button class="demo-tour-hint" onclick="window._openQuickOutcomeCapture?.(window._selectedCourseId,null,\'Demo Patient\')">&#9654; Open Outcome Capture</button>';
    } else if (step.hint === 'load-demo-scores') {
      hintBtn = '<button class="demo-tour-hint" onclick="window._scalLoadDemo?.()">&#9654; Load demo scores</button>';
    }

    const bannerHTML = `
      <div class="demo-tour-progress-bar"><div class="demo-tour-progress-fill" style="width:${pct}%"></div></div>
      <div class="demo-tour-inner">
        <div class="demo-tour-meta">
          <span class="demo-tour-label">${step.label}</span>
          <span class="demo-tour-title">${step.title}</span>
          <span class="demo-tour-desc">${step.desc}</span>
          ${hintBtn}
        </div>
        <div class="demo-tour-actions">
          <button class="demo-tour-next" onclick="${nextAction}">${nextLabel}</button>
          <button class="demo-tour-end" onclick="window._demoEndTour()">End &#10005;</button>
        </div>
      </div>`;

    let banner = document.getElementById('demo-tour-banner');
    if (banner) {
      banner.innerHTML = bannerHTML;
    } else {
      banner = document.createElement('div');
      banner.id = 'demo-tour-banner';
      banner.className = 'demo-tour-banner';
      banner.innerHTML = bannerHTML;
      document.body.appendChild(banner);
    }
  };

  window._demoEndTour = function() {
    const banner = document.getElementById('demo-tour-banner');
    if (banner) banner.remove();
    window._demoTour = null;
    window._nav('pricing');
    if (typeof window._showNotifToast === 'function') {
      window._showNotifToast({ title: 'Tour complete', body: '14-day free trial \u2014 no credit card required.', severity: 'success' });
    }
  };

  el.insertAdjacentHTML('beforeend', `

    <!-- ─── Specialty trust bar ───────────────────────────────────────────── -->
    <div class="pub-specialties-bar">
      <span class="pub-specialties-label">Built for</span>
      ${['Neurologists','Psychiatrists','Psychologists','Neuropsychologists','Neuromodulation Technicians','Clinical Researchers','Clinic Administrators','Neurofeedback Practitioners'].map(s =>
        `<span class="pub-specialty-tag">${s}</span>`
      ).join('')}
    </div>

    <div class="pub-divider"></div>

    <!-- ─── Audience split ────────────────────────────────────────────────── -->
    <div style="padding:72px 0 80px">
      <div style="text-align:center;margin-bottom:44px;padding:0 48px">
        <div class="pub-eyebrow">Two separate experiences</div>
        <div class="pub-section-title" style="text-align:center;margin-bottom:10px">
          A clinical workspace for your team.<br>A clear portal for your patients.
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:520px;margin:0 auto;line-height:1.7">
          Clinical and patient interfaces are completely separate &mdash;
          different depth, different language, different purpose.
          Patients never encounter clinical complexity.
        </div>
      </div>
      <div class="pub-audience-grid">
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
            not appointments. Each course holds a protocol, a session schedule,
            a governance trail, and patient outcomes in one structured record.
          </div>
          <ul class="pub-audience-features">
            <li>Evidence-graded protocol design across TMS, tDCS, tACS, PEMF, PBM, neurofeedback, and more</li>
            <li>Course lifecycle: protocol &rarr; approval &rarr; sessions &rarr; deviations &rarr; outcomes</li>
            <li>Device-aware session runner with real-time deviation flagging</li>
            <li>qEEG integration and per-patient brain region mapping</li>
            <li>Adverse event registry, approval queue, and full audit trail per course</li>
            <li>Role-scoped access: clinician, technician, reviewer, administrator</li>
          </ul>
          <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')"
            style="width:100%;font-size:13px;padding:12px;margin-top:auto">
            Start Free Trial &rarr;
          </button>
        </div>
        <div class="pub-audience-card secondary">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
            <div class="pub-audience-icon" style="margin:0;width:44px;height:44px">◉</div>
            <div>
              <div class="pub-eyebrow blue" style="margin:0 0 2px">For patients</div>
              <div class="pub-audience-title" style="margin:0">Patient Portal</div>
            </div>
          </div>
          <div class="pub-audience-desc">
            A calm, clear view of your treatment journey &mdash; without clinical complexity.
            Provisioned by your clinic. No jargon, no unnecessary detail.
          </div>
          <ul class="pub-audience-features">
            <li>Upcoming and completed session schedule from your clinic</li>
            <li>Treatment summary &mdash; what you&rsquo;re being treated for and why</li>
            <li>Symptom tracking and assessments before and after sessions</li>
            <li>Clinical documents and reports shared by your care team</li>
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

    <!-- ─── Where generic tools fall short ───────────────────────────────── -->
    <section class="pub-section" style="padding-bottom:60px">
      <div style="text-align:center;margin-bottom:44px">
        <div class="pub-eyebrow">Why clinicians switch</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          Built for how neuromodulation actually works
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:540px;margin:0 auto;line-height:1.7">
          Every feature addresses a specific limitation in how neuromodulation clinics
          currently manage protocols, sessions, and patient records.
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
    <section id="modalities-section" class="pub-section" style="padding-bottom:60px">
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

    <!-- ─── Device compatibility bar ───────────────────────────────────────── -->
    <div class="pub-device-bar">
      <span class="pub-device-bar-label">Compatible devices</span>
      <div class="pub-device-list">
        ${[
          { name:'NeuroStar',     sub:'TMS / iTBS',    logo:'N' },
          { name:'BrainsWay',     sub:'Deep TMS',       logo:'B' },
          { name:'MagVenture',    sub:'TMS / iTBS',    logo:'M' },
          { name:'Nexstim',       sub:'Navigated TMS', logo:'Nx' },
          { name:'Alpha-Stim',    sub:'CES',           logo:'α' },
          { name:'Flow FL-100',   sub:'tDCS (PMA)',    logo:'F' },
          { name:'Neurolith TPS', sub:'TPS',           logo:'T' },
          { name:'gammaCore',     sub:'nVNS',          logo:'G' },
          { name:'LivaNova VNS',  sub:'VNS Therapy',  logo:'L' },
          { name:'Medtronic DBS', sub:'DBS',           logo:'Md' },
          { name:'Vielight',      sub:'PBM',           logo:'V' },
          { name:'Neurosity',     sub:'Neurofeedback', logo:'NF' },
        ].map(d => `
          <div class="pub-device-chip" title="${d.name} · ${d.sub}">
            <span class="pub-device-logo">${d.logo}</span>
            <span class="pub-device-name">${d.name}</span>
            <span class="pub-device-sub">${d.sub}</span>
          </div>
        `).join('')}
      </div>
      <span class="pub-device-bar-note">Device-aware parameter fields, not generic forms</span>
    </div>

    <div class="pub-divider"></div>

    <!-- ─── Testimonials ──────────────────────────────────────────────────── -->
    <section class="pub-section" style="padding-bottom:60px">
      <div style="text-align:center;margin-bottom:44px">
        <div class="pub-eyebrow">From practitioners in the field</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          What clinicians report after switching
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

    <!-- ─── Comparison table ────────────────────────────────────────────────── -->
    <section class="pub-section" style="padding-bottom:64px">
      <div style="text-align:center;margin-bottom:44px">
        <div class="pub-eyebrow">Purpose-built, not adapted</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          Generic tools were not designed<br>for neuromodulation
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:520px;margin:0 auto;line-height:1.7">
          Most clinics cobble together spreadsheets, general EHRs, and paper forms.
          Here is what that approach misses.
        </div>
      </div>

      <div class="pub-compare-wrap">
        <table class="pub-compare-table">
          <thead>
            <tr>
              <th class="pub-compare-feature-col">Capability</th>
              <th class="pub-compare-th">Spreadsheets &amp;<br>Paper records</th>
              <th class="pub-compare-th">General-purpose EHR</th>
              <th class="pub-compare-th pub-compare-th--us">DeepSynaps</th>
            </tr>
          </thead>
          <tbody>
            ${[
              { feature:'Neuromodulation-specific protocol structure', s:'Manual / unstructured',  e:'Generic templates only',       d:'Purpose-built' },
              { feature:'Device-aware parameter fields',               s:'Not available',           e:'Not available',                d:'Purpose-built' },
              { feature:'Evidence grading on every protocol',          s:'Manual literature lookup', e:'Not available',              d:'Purpose-built' },
              { feature:'Step-by-step session execution runner',       s:'Not available',           e:'Appointment notes only',       d:'Purpose-built' },
              { feature:'Real-time deviation flagging',                s:'Not available',           e:'Not available',                d:'Purpose-built' },
              { feature:'Structured protocol approval workflow',       s:'Informal / manual',       e:'Basic sign-off at best',       d:'Structured queue' },
              { feature:'Adverse event registry',                      s:'Manual log / spreadsheet', e:'Incident reporting module',  d:'Integrated registry' },
              { feature:'Full audit trail per treatment course',       s:'Not available',           e:'Partial — visit-level only',   d:'Course-level trail' },
              { feature:'qEEG and brain data integration',             s:'External tools only',     e:'Not available',                d:'Integrated' },
              { feature:'Separated patient-facing portal',             s:'Not available',           e:'Some EHRs offer patient view', d:'Purpose-built' },
              { feature:'Role-scoped neuromodulation workflows',       s:'Not available',           e:'General RBAC only',            d:'Modality-specific' },
              { feature:'Time to set up for a neuromodulation clinic', s:'Days of configuration',   e:'Weeks to months',              d:'Hours' },
            ].map((r, i) => `
              <tr class="pub-compare-row${i % 2 === 0 ? ' pub-compare-row--even' : ''}">
                <td class="pub-compare-feature">${r.feature}</td>
                <td class="pub-compare-cell">${_cmpCell(r.s)}</td>
                <td class="pub-compare-cell">${_cmpCell(r.e)}</td>
                <td class="pub-compare-cell pub-compare-cell--us">${_cmpCell(r.d)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="text-align:center;margin-top:32px">
        <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')"
          style="font-size:13px;padding:13px 32px">
          Try free for 14 days &rarr;
        </button>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px">No credit card required · Full access during trial</div>
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Platform capabilities ──────────────────────────────────────────── -->
    <section class="pub-section">
      <div style="display:flex;gap:48px;align-items:flex-start">

        <!-- Left: intro -->
        <div style="width:280px;flex-shrink:0;padding-top:4px">
          <div class="pub-eyebrow">What the platform covers</div>
          <div class="pub-section-title" style="font-size:26px;margin-bottom:14px">
            Protocol to outcome.<br>One system.
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.75;margin-bottom:24px">
            DeepSynaps covers the full operational stack &mdash; from evidence-graded
            protocol design through to long-term outcome tracking &mdash; without
            requiring separate tools for each discipline.
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

    <!-- ─── Compliance & security strip ─────────────────────────────────────── -->
    <div class="pub-compliance-strip">
      <div class="pub-compliance-title">Built with clinical data responsibility in mind.</div>
      <div class="pub-compliance-grid">
        ${[
          { icon:'🔒', label:'HIPAA-Aligned Design',   sub:'PHI handling follows HIPAA-aligned practices; BAA available on request' },
          { icon:'🇪🇺', label:'GDPR-Conscious Design',  sub:'Built with EU data privacy requirements in mind; data processing agreements available' },
          { icon:'🔐', label:'TLS 1.3 Encryption',     sub:'All data encrypted in transit; AES-256 at rest' },
          { icon:'🗄',  label:'Audited Cloud Hosting',  sub:'Hosted on enterprise-grade, audited cloud infrastructure' },
          { icon:'👤', label:'Role-Based Access',      sub:'Clinician · Technician · Reviewer · Admin scopes' },
          { icon:'📋', label:'Full Audit Trail',       sub:'Every protocol change, session, and approval is timestamped and attributed' },
        ].map(c => `
          <div class="pub-compliance-card">
            <div class="pub-compliance-icon">${c.icon}</div>
            <div class="pub-compliance-label">${c.label}</div>
            <div class="pub-compliance-sub">${c.sub}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="pub-divider"></div>

    <!-- ─── FAQ ─────────────────────────────────────────────────────────────── -->
    <section class="pub-section" style="padding-bottom:64px">
      <div style="text-align:center;margin-bottom:44px">
        <div class="pub-eyebrow">FAQ</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          Questions we hear often
        </div>
      </div>
      <div class="pub-faq-grid" id="pub-faq">
        ${[
          {
            q: 'Is DeepSynaps an EHR?',
            a: 'No. DeepSynaps is a clinical operations platform for neuromodulation practices. It is not a general-purpose EHR. It is purpose-built around treatment courses, evidence-graded protocols, session execution, and neuromodulation-specific governance — tasks that generic EHRs handle poorly or not at all. Many clinics use DeepSynaps alongside their existing EHR.',
          },
          {
            q: 'Do I need to replace my current devices?',
            a: 'No. DeepSynaps is device-agnostic. It supports NeuroStar, BrainsWay, MagVenture, Nexstim, Alpha-Stim, Flow FL-100, Neurolith TPS, and others. Device-aware parameter fields adapt to the modality and device you select. Your existing hardware stays; you gain structure around it.',
          },
          {
            q: 'How long does onboarding take?',
            a: 'Most solo practitioners are live within half a day. Clinic teams typically complete onboarding within one to two days, including role setup and protocol configuration. We provide structured onboarding documentation and direct support during the trial period.',
          },
          {
            q: 'How does DeepSynaps handle patient data and privacy?',
            a: 'All patient data is encrypted at rest (AES-256) and in transit (TLS 1.3). The platform is hosted on enterprise-grade, audited cloud infrastructure. PHI access is role-scoped — technicians cannot access data outside their assigned patients. A full audit trail is maintained for all PHI access events. DeepSynaps follows HIPAA-aligned data handling practices; a Business Associate Agreement (BAA) is available on request for covered entities.',
          },
          {
            q: 'Can I use DeepSynaps for research protocols?',
            a: 'Yes. The platform supports off-label and investigational protocol configurations, flagged as EV-C (emerging) or EV-D (experimental). These require mandatory clinician review before activation and cannot be exported to patient-facing outputs. IRB documentation can be attached to the course record.',
          },
          {
            q: 'What happens after the 14-day trial?',
            a: 'At the end of your trial, you choose a plan or contact us for a custom quote. All data created during the trial is retained. No protocols, patients, or session records are lost when you transition to a paid plan. If you choose not to continue, you can export your data in standard formats.',
          },
          {
            q: 'Is there a patient-facing mobile app?',
            a: 'The patient portal is a responsive web application accessible on any device — phone, tablet, or desktop — without requiring an app download. Patients access it via a secure link provisioned by the clinic. A native mobile app is on the product roadmap.',
          },
          {
            q: 'Can multiple clinicians share the same clinic account?',
            a: 'Yes. The Clinic Team plan (from $699/mo) supports up to 5 professional seats with shared review queues, a team audit trail, and role-scoped access. The Enterprise plan supports unlimited seats across multiple sites.',
          },
        ].map((faq, i) => `
          <div class="pub-faq-item" id="faq-${i}">
            <button class="pub-faq-q" onclick="window._faqToggle(${i})">
              <span>${faq.q}</span>
              <span class="pub-faq-chevron" id="faq-chev-${i}">▾</span>
            </button>
            <div class="pub-faq-a" id="faq-a-${i}" style="display:none">${faq.a}</div>
          </div>
        `).join('')}
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── How it works ────────────────────────────────────────────────────── -->
    <section class="pub-section" style="padding-bottom:72px">
      <div style="text-align:center;margin-bottom:52px">
        <div class="pub-eyebrow">How it works</div>
        <div class="pub-section-title" style="text-align:center;font-size:28px;margin-bottom:10px">
          From first protocol to long-term outcome
        </div>
        <div style="font-size:14px;color:var(--text-secondary);max-width:500px;margin:0 auto;line-height:1.7">
          Four stages. Every clinical operation in one place.
        </div>
      </div>
      <div class="pub-hiw-grid">
        ${[
          {
            step: '01',
            title: 'Configure your clinic',
            desc: 'Add your clinical team and assign roles — clinician, technician, reviewer, or administrator. Register the devices your clinic uses. Set up your standard protocol library with evidence grades.',
            detail: 'Most clinics are fully configured within a few hours.',
            icon: '◱',
          },
          {
            step: '02',
            title: 'Create a treatment course',
            desc: 'Select a patient and a condition. Choose a protocol from your library or design one — parameters, montage, and session count pre-structured for the modality. Submit for clinician approval before the first session.',
            detail: 'Approval queue is built in. Nothing runs without sign-off.',
            icon: '⬡',
          },
          {
            step: '03',
            title: 'Run device-aware sessions',
            desc: 'The session runner pre-loads protocol parameters for your specific device. Confirm delivery, log any deviations in real time, complete the post-session record. Full documentation in under two minutes.',
            detail: 'No separate documentation step. Sessions write the record.',
            icon: '◧',
          },
          {
            step: '04',
            title: 'Track outcomes and patient engagement',
            desc: 'Outcomes are logged against the protocol that produced them. Patients track their own progress in the portal. The governance trail — approvals, deviations, adverse events — builds automatically.',
            detail: 'Long-term outcome data stays connected to the protocol.',
            icon: '◫',
          },
        ].map(s => `
          <div class="pub-hiw-card">
            <div class="pub-hiw-step">${s.step}</div>
            <div class="pub-hiw-icon">${s.icon}</div>
            <div class="pub-hiw-title">${s.title}</div>
            <div class="pub-hiw-desc">${s.desc}</div>
            <div class="pub-hiw-detail">${s.detail}</div>
          </div>
        `).join('')}
      </div>
      <div style="text-align:center;margin-top:40px">
        <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')"
          style="font-size:13px;padding:13px 32px">
          Start your 14-day trial &rarr;
        </button>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:10px">No credit card required &middot; Full access during trial &middot; Data retained if you continue</div>
      </div>
    </section>

    <div class="pub-divider"></div>

    <!-- ─── Pricing ─────────────────────────────────────────────────────────── -->
    <section class="pub-section pub-pricing-section">

      <div style="text-align:center;margin-bottom:52px">
        <div class="pub-eyebrow">Pricing</div>
        <div class="pub-section-title" style="text-align:center;font-size:30px;margin-bottom:12px">
          Straightforward pricing for neuromodulation practices
        </div>
        <div style="font-size:14px;color:var(--text-secondary);line-height:1.7;max-width:520px;margin:0 auto">
          Start as a solo practitioner or roll out across a full clinic team.
          The patient portal is included in every paid plan.
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
            <li>Up to 25 active patients</li>
            <li>Evidence-graded protocol intelligence</li>
            <li>Treatment courses &amp; session execution</li>
            <li>Assessments &amp; basic reports</li>
            <li>Patient portal access (clinic-provisioned)</li>
            <li>EV-A / EV-B evidence grades</li>
            <li>Email support</li>
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
            <li>Full treatment-course workflows</li>
            <li>Device-aware session execution runner</li>
            <li>Evidence-graded protocol intelligence</li>
            <li>Patient portal (clinic-provisioned)</li>
            <li>Outcomes tracking &amp; assessments</li>
            <li>qEEG &amp; brain data integration</li>
            <li>DOCX / PDF report exports</li>
            <li>EV-C override &amp; off-label governance</li>
            <li>Priority email support</li>
          </ul>
          <button class="pub-plan-cta pub-plan-cta--featured" onclick="window._navPublic('signup-professional')">
            Start Free Trial &rarr;
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
            <li>Clinician + Technician + Reviewer roles</li>
            <li>Shared protocol &amp; review queue</li>
            <li>Device-aware session execution</li>
            <li>Evidence-graded protocol intelligence</li>
            <li>Team audit trail &amp; governance</li>
            <li>Clinic outcomes dashboard</li>
            <li>Patient portal for all patients</li>
            <li>Light white-labelling</li>
            <li>Dedicated onboarding support</li>
          </ul>
          <button class="pub-plan-cta" onclick="window._navPublic('signup-professional')" title="Start with a 14-day trial or contact us for a guided demo">
            Start Trial or Book Demo &rarr;
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
      <!-- Support strip -->
      <div class="pub-pricing-support-strip">
        <div class="pub-pricing-support-item">
          <span class="pub-pricing-support-icon">◉</span>
          <span>Patient portal included in every paid plan</span>
        </div>
        <div class="pub-pricing-support-sep"></div>
        <div class="pub-pricing-support-item">
          <span class="pub-pricing-support-icon">◈</span>
          <span>Audit trail &amp; role-based access on all plans</span>
        </div>
        <div class="pub-pricing-support-sep"></div>
        <div class="pub-pricing-support-item">
          <span class="pub-pricing-support-icon">◧</span>
          <span>Device-aware session workflows included</span>
        </div>
        <div class="pub-pricing-support-sep"></div>
        <div class="pub-pricing-support-item">
          <span class="pub-pricing-support-icon">◇</span>
          <span>Save 15% with annual billing &nbsp;·&nbsp; No setup fees. Cancel anytime.</span>
        </div>
      </div>

      <div style="text-align:center;margin-top:20px;font-size:12.5px;color:var(--text-tertiary)">
        Need help choosing a plan? &nbsp;<button class="pub-pricing-inline-link" onclick="window._navPublic('signup-professional')">Talk to our team &rarr;</button>
      </div>

    </section>

    <div class="pub-divider"></div>

    <!-- ─── Final CTA ──────────────────────────────────────────────────────── -->
    <div class="pub-cta-section">
      <div class="pub-eyebrow" style="display:block;text-align:center;margin-bottom:16px">Get started</div>
      <div class="pub-cta-title">Ready to run a structured neuromodulation clinic?</div>
      <div class="pub-cta-sub">
        Not a generic EHR. DeepSynaps is built for treatment courses, protocol governance,
        device-aware session execution, and patient progress — all in one place.
      </div>

      <div class="pub-cta-trio">

        <div class="pub-cta-card primary-cta">
          <div class="pub-cta-card-icon" style="color:var(--teal)">⚕</div>
          <div class="pub-cta-card-title">Start as a Professional</div>
          <div class="pub-cta-card-sub">
            Clinicians, technicians, researchers, and administrators.
            Full access for 14 days, no commitment.
          </div>
          <button class="btn-hero-primary" onclick="window._navPublic('signup-professional')"
            style="width:100%;font-size:12.5px;padding:10px">
            Start Free Trial &rarr;
          </button>
          <div style="margin-top:8px;font-size:11px;color:var(--text-tertiary);text-align:center">
            No credit card required
          </div>
        </div>

        <div class="pub-cta-card secondary-cta">
          <div class="pub-cta-card-icon" style="color:var(--blue)">◉</div>
          <div class="pub-cta-card-title">Patient Portal</div>
          <div class="pub-cta-card-sub">
            Track sessions, review progress notes, and stay connected with your clinic.
            Requires an invitation code from your practitioner.
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
            Already have an account? Access your existing professional or patient session.
          </div>
          <button class="btn-hero-ghost" onclick="window._showSignIn()"
            style="width:100%;font-size:12.5px;padding:10px">
            Sign In to Your Account
          </button>
          <div style="margin-top:12px;font-size:11.5px;color:var(--text-tertiary);text-align:center">
            Need help choosing a plan?<br>
            <button class="pub-pricing-inline-link" onclick="window._navPublic('signup-professional')" style="font-size:11.5px">
              Talk to our team &rarr;
            </button>
          </div>
        </div>

      </div>

      <div style="margin-top:36px;font-size:11.5px;color:var(--text-tertiary);text-align:center;line-height:1.7">
        DeepSynaps is a clinical operations platform for qualified neuromodulation practitioners.<br>
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
  `);

  // ── FAQ accordion ──────────────────────────────────────────────────────────
  window._faqToggle = function(i) {
    const a    = document.getElementById(`faq-a-${i}`);
    const chev = document.getElementById(`faq-chev-${i}`);
    const open = a.style.display !== 'none';
    a.style.display    = open ? 'none' : 'block';
    chev.style.transform = open ? '' : 'rotate(180deg)';
    chev.style.color     = open ? '' : 'var(--teal)';
  };

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

  // ── Inject unified contact launcher ───────────────────────────────────────
  _initContactLauncher();

  // Re-render page when locale changes
  _registerPubLocaleListener(pgHome);
}

// ── Unified contact launcher ──────────────────────────────────────────────────
const WA_NUMBER = '447429910079';
const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

// Contextual WhatsApp prefill — locale-aware, updates as user scrolls
function _waContextMsg(key) {
  const keyMap = {
    pricing: 'pub.wa.msg.pricing', modalities: 'pub.wa.msg.modalities',
    conditions: 'pub.wa.msg.conditions', features: 'pub.wa.msg.features',
    signup: 'pub.wa.msg.signup', default: 'pub.wa.msg.default',
  };
  return t(keyMap[key] || 'pub.wa.msg.default');
}

function _aiStarters() {
  return [
    t('pub.chat.starter.modalities'),
    t('pub.chat.starter.cost'),
    t('pub.chat.starter.hipaa'),
    t('pub.chat.starter.start'),
  ];
}

let _pubChatHistory = [];
let _pubChatBusy = false;
let _launcherOpen = false;
let _chatOpen = false;
let _waContext = 'default';
let _waObserver = null;

function _initWaContextObserver() {
  if (_waObserver) _waObserver.disconnect();
  const sections = [
    { selector: '.pub-pricing-grid',   key: 'pricing'    },
    { selector: '.pub-modality-grid',  key: 'modalities' },
    { selector: '.pub-condition-grid', key: 'conditions' },
    { selector: '.pub-feature-grid',   key: 'features'   },
    { selector: '.pub-cta-section',    key: 'signup'     },
  ];
  _waObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const hit = sections.find(s => e.target.matches(s.selector));
        if (hit) { _waContext = hit.key; _updateWaLink(); }
      }
    });
  }, { threshold: 0.25 });
  sections.forEach(({ selector }) =>
    document.querySelectorAll(selector).forEach(el => _waObserver.observe(el))
  );
}

function _waHref() {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(_waContextMsg(_waContext))}`;
}

function _updateWaLink() {
  const link = document.getElementById('pub-wa-link');
  if (link) link.href = _waHref();
}

function _initContactLauncher() {
  document.getElementById('pub-launcher')?.remove();
  _pubChatHistory = [];
  _launcherOpen = false;
  _chatOpen = false;
  _waContext = 'default';

  const el = document.createElement('div');
  el.id = 'pub-launcher';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'Contact options');
  el.innerHTML = `
    <!-- Option menu -->
    <div class="pub-launcher-menu" id="pub-launcher-menu" aria-hidden="true" role="menu">

      <a class="pub-launcher-option" id="pub-wa-link" href="${_waHref()}"
         target="_blank" rel="noopener noreferrer" role="menuitem"
         onclick="window._launcherClose()">
        <span class="pub-launcher-option-icon pub-launcher-option-icon--wa">${WA_SVG}</span>
        <div class="pub-launcher-option-text">
          <div class="pub-launcher-option-title">${t('pub.chat.wa.title')}</div>
          <div class="pub-launcher-option-sub">${t('pub.chat.wa.sub')}</div>
        </div>
        <span class="pub-launcher-option-arrow">\u2192</span>
      </a>

      <div class="pub-launcher-divider"></div>

      <button class="pub-launcher-option" onclick="window._launcherOpenChat()" role="menuitem">
        <span class="pub-launcher-option-icon pub-launcher-option-icon--ai">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><circle cx="9" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/></svg>
        </span>
        <div class="pub-launcher-option-text">
          <div class="pub-launcher-option-title">${t('pub.chat.ai.title')}</div>
          <div class="pub-launcher-option-sub">${t('pub.chat.ai.sub')}</div>
        </div>
        <span class="pub-launcher-option-arrow">\u2192</span>
      </button>

    </div>

    <!-- AI chat panel -->
    <div class="pub-chat-panel" id="pub-chat-panel" style="display:none" role="dialog" aria-label="DeepSynaps AI chat">
      <div class="pub-chat-header">
        <button class="pub-chat-back" onclick="window._launcherBackToMenu()" aria-label="Back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px;line-height:1.2">DeepSynaps AI</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.6);margin-top:1px">${t('pub.chat.header.sub')}</div>
        </div>
        <button class="pub-chat-close" onclick="window._launcherClose()" aria-label="Close">\u2715</button>
      </div>
      <div style="padding:6px 14px;background:rgba(255,181,71,0.08);border-bottom:1px solid rgba(255,181,71,0.2);font-size:10.5px;color:rgba(255,181,71,0.9);display:flex;align-items:center;gap:6px">
        <span style="font-size:11px">⚠</span>
        <span>General platform enquiries only &mdash; not clinical advice. Consult your clinician for all medical decisions.</span>
      </div>

      <div class="pub-chat-messages" id="pub-chat-messages">
        <div class="pub-chat-msg pub-chat-msg--agent">
          <div class="pub-chat-bubble-msg">
            ${t('pub.chat.ai.greeting')}
          </div>
        </div>
        <div class="pub-chat-starters" id="pub-chat-starters">
          ${_aiStarters().map(p => `<button class="pub-chat-starter-btn" onclick="window._pubChatStarter(${JSON.stringify(p)})">${p}</button>`).join('')}
        </div>
      </div>

      <div class="pub-chat-typing" id="pub-chat-typing" style="display:none" aria-live="polite">
        <div class="pub-chat-dot"></div><div class="pub-chat-dot"></div><div class="pub-chat-dot"></div>
      </div>

      <div class="pub-chat-input-row">
        <input id="pub-chat-input" class="pub-chat-input" type="text"
          placeholder="${t('pub.chat.placeholder')}" autocomplete="off"
          onkeydown="if(event.key==='Enter')window._pubChatSend()">
        <button class="pub-chat-send" id="pub-chat-send-btn" onclick="window._pubChatSend()" aria-label="Send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
      </div>
    </div>

    <!-- FAB -->
    <button class="pub-fab" id="pub-fab" onclick="window._launcherToggle()" aria-label="Contact us" aria-expanded="false">
      <span class="pub-fab-icon" id="pub-fab-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      </span>
      <span class="pub-fab-icon" id="pub-fab-close-icon" style="display:none">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </span>
    </button>
  `;
  document.body.appendChild(el);

  _initWaContextObserver();

  window._launcherToggle = function() {
    if (_chatOpen) { window._launcherClose(); return; }
    _launcherOpen = !_launcherOpen;
    const menu = document.getElementById('pub-launcher-menu');
    menu.classList.toggle('open', _launcherOpen);
    menu.setAttribute('aria-hidden', String(!_launcherOpen));
    document.getElementById('pub-fab').setAttribute('aria-expanded', String(_launcherOpen));
    _setFabState(_launcherOpen ? 'open' : 'closed');
  };

  window._launcherClose = function() {
    _launcherOpen = false; _chatOpen = false;
    document.getElementById('pub-launcher-menu').classList.remove('open');
    document.getElementById('pub-launcher-menu').setAttribute('aria-hidden', 'true');
    document.getElementById('pub-chat-panel').style.display = 'none';
    document.getElementById('pub-fab').setAttribute('aria-expanded', 'false');
    _setFabState('closed');
  };

  window._launcherOpenChat = function() {
    _launcherOpen = false; _chatOpen = true;
    document.getElementById('pub-launcher-menu').classList.remove('open');
    document.getElementById('pub-launcher-menu').setAttribute('aria-hidden', 'true');
    document.getElementById('pub-chat-panel').style.display = 'flex';
    document.getElementById('pub-fab').setAttribute('aria-expanded', 'true');
    _setFabState('open');
    setTimeout(() => document.getElementById('pub-chat-input')?.focus(), 150);
  };

  window._launcherBackToMenu = function() {
    _chatOpen = false; _launcherOpen = true;
    document.getElementById('pub-chat-panel').style.display = 'none';
    const menu = document.getElementById('pub-launcher-menu');
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    _setFabState('open');
  };

  window._pubChatStarter = function(prompt) {
    document.getElementById('pub-chat-starters')?.remove();
    const input = document.getElementById('pub-chat-input');
    if (input) input.value = prompt;
    window._pubChatSend();
  };

  window._pubChatSend = async function() {
    if (_pubChatBusy) return;
    const input = document.getElementById('pub-chat-input');
    const text = (input?.value || '').trim();
    if (!text) return;
    input.value = '';
    document.getElementById('pub-chat-starters')?.remove();

    _pubChatHistory.push({ role: 'user', content: text });
    _appendPubMsg('user', text);

    _pubChatBusy = true;
    const sendBtn = document.getElementById('pub-chat-send-btn');
    if (sendBtn) sendBtn.disabled = true;
    document.getElementById('pub-chat-typing').style.display = 'flex';
    _scrollPubChat();

    try {
      const result = await api.chatPublic(_pubChatHistory);
      const reply = result?.reply || t('pub.chat.api_error');
      _pubChatHistory.push({ role: 'assistant', content: reply });
      _appendPubMsg('agent', reply);
    } catch {
      _appendPubMsg('agent', t('pub.chat.error'));
    } finally {
      _pubChatBusy = false;
      if (sendBtn) sendBtn.disabled = false;
      document.getElementById('pub-chat-typing').style.display = 'none';
      _scrollPubChat();
      document.getElementById('pub-chat-input')?.focus();
    }
  };
}

function _setFabState(state) {
  const icon  = document.getElementById('pub-fab-icon');
  const close = document.getElementById('pub-fab-close-icon');
  const fab   = document.getElementById('pub-fab');
  if (!icon || !close) return;
  const isOpen = state === 'open';
  icon.style.display  = isOpen ? 'none' : 'flex';
  close.style.display = isOpen ? 'flex' : 'none';
  fab?.classList.toggle('pub-fab--open', isOpen);
}

function _appendPubMsg(role, text) {
  const el = document.getElementById('pub-chat-messages');
  if (!el) return;
  const safe = text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\n/g,'<br>');
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

// ── Re-render public page on locale change ────────────────────────────────────
let _pubLocaleHandler = null;
function _registerPubLocaleListener(renderFn) {
  if (_pubLocaleHandler) window.removeEventListener('ds:locale-changed', _pubLocaleHandler);
  _pubLocaleHandler = () => renderFn();
  window.addEventListener('ds:locale-changed', _pubLocaleHandler);
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
        Already activated your portal? <span onclick="window._showSignIn()" style="color:var(--blue);cursor:pointer;font-weight:600">Sign in to your patient account &rarr;</span>
      </div>
      <div style="text-align:center;margin-top:8px;font-size:11px;color:var(--text-tertiary)">
        The sign-in form works for both patients and clinicians.
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

    try {
      const res = await api.activatePatient(code, email, name, pw);
      if (!res || !res.access_token) {
        err.textContent = 'Activation failed. Please check your invite code and try again.';
        err.style.display = '';
        return;
      }
      api.setToken(res.access_token);
      setCurrentUser(res.user || { email, display_name: name, role: 'patient', package_id: 'patient' });
      document.getElementById('pt-invite-form').style.display = 'none';
      document.getElementById('pt-done').style.display = '';
      setTimeout(() => { showPatient(); updatePatientBar(); window._bootPatient?.(); }, 1200);
    } catch (e) {
      err.textContent = e.message || 'Activation failed. Please check your invite code and try again.';
      err.style.display = '';
    }
  };

  window._ptEmailSend = function() {
    const email = document.getElementById('pt-email-direct').value.trim();
    const err   = document.getElementById('pt-direct-err');
    err.style.display = 'none';
    if (!email) { err.textContent = 'Email required.'; err.style.display = ''; return; }
    document.getElementById('pt-direct-form').innerHTML = `
      <div class="notice notice-ok">
        To receive an activation link for <strong>${email}</strong>, please contact your clinic directly.
        Your clinic administrator will send you an activation email.
      </div>
    `;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// pgPermissionsAdmin — Role Permissions Matrix, API Keys, Security Config, 2FA
// ═══════════════════════════════════════════════════════════════════════════════

const ALL_FEATURES = [
  { id: 'dashboard',           label: 'Dashboard',            category: 'Clinical'  },
  { id: 'patients',            label: 'Patients',             category: 'Clinical'  },
  { id: 'patient-profile',     label: 'Patient Profile',      category: 'Clinical'  },
  { id: 'intake',              label: 'Intake & Consent',     category: 'Clinical'  },
  { id: 'protocols',           label: 'Protocols',            category: 'Clinical'  },
  { id: 'protocol-builder',    label: 'Visual Builder',       category: 'Clinical'  },
  { id: 'decision-support',    label: 'Decision Support',     category: 'Clinical'  },
  { id: 'brain-data',          label: 'Brain Data',           category: 'Clinical'  },
  { id: 'messaging',           label: 'Messaging',            category: 'Clinical'  },
  { id: 'clinical-notes',      label: 'Clinical Notes',       category: 'Clinical'  },
  { id: 'homework-builder',    label: 'Homework Builder',     category: 'Clinical'  },
  { id: 'advanced-search',     label: 'Advanced Search',      category: 'Clinical'  },
  { id: 'sessions',            label: 'Sessions',             category: 'Sessions'  },
  { id: 'session-execution',   label: 'Session Execution',    category: 'Sessions'  },
  { id: 'session-monitor',     label: 'Live Monitor',         category: 'Sessions'  },
  { id: 'calendar',            label: 'Calendar',             category: 'Sessions'  },
  { id: 'review-queue',        label: 'Review Queue',         category: 'Sessions'  },
  { id: 'outcomes',            label: 'Outcomes',             category: 'Sessions'  },
  { id: 'outcome-prediction',  label: 'Outcome Prediction',   category: 'Sessions'  },
  { id: 'rules-engine',        label: 'Rules & Alerts',       category: 'Sessions'  },
  { id: 'knowledge-base',      label: 'Knowledge Base',       category: 'Knowledge' },
  { id: 'qeeg-maps',           label: 'qEEG Maps',            category: 'Knowledge' },
  { id: 'handbooks',           label: 'Handbooks',            category: 'Knowledge' },
  { id: 'audit-trail',         label: 'Audit Trail',          category: 'Knowledge' },
  { id: 'report-builder',      label: 'Report Builder',       category: 'Knowledge' },
  { id: 'quality-assurance',   label: 'Quality Assurance',    category: 'Knowledge' },
  { id: 'device-management',   label: 'Devices',              category: 'Knowledge' },
  { id: 'clinical-trials',     label: 'Clinical Trials',      category: 'Knowledge' },
  { id: 'schedule',            label: 'Schedule',             category: 'Practice'  },
  { id: 'billing',             label: 'Billing',              category: 'Practice'  },
  { id: 'referrals',           label: 'Referrals',            category: 'Practice'  },
  { id: 'telehealth',          label: 'Telehealth',           category: 'Practice'  },
  { id: 'telehealth-recorder', label: 'Session Recorder',     category: 'Practice'  },
  { id: 'admin',               label: 'Admin',                category: 'Practice'  },
  { id: 'clinic-settings',     label: 'Clinic Settings',      category: 'Practice'  },
  { id: 'settings',            label: 'Settings',             category: 'Practice'  },
  { id: 'population-analytics',label: 'Population Analytics', category: 'Analytics' },
  { id: 'clinical-reports',    label: 'Clinical Reports',     category: 'Analytics' },
];

const ROLES = ['admin','clinician','supervisor','researcher','billing_admin','receptionist','read_only'];

const DEFAULT_PERMISSIONS = {
  admin: ALL_FEATURES.map(f => f.id),
  clinician: ['dashboard','patients','patient-profile','intake','protocols','protocol-builder',
    'decision-support','brain-data','messaging','clinical-notes','homework-builder',
    'advanced-search','sessions','session-execution','session-monitor','calendar',
    'review-queue','outcomes','outcome-prediction','telehealth','telehealth-recorder',
    'handbooks','qeeg-maps','schedule','referrals','settings'],
  supervisor: ['dashboard','patients','patient-profile','protocols','sessions','review-queue',
    'outcomes','outcome-prediction','rules-engine','quality-assurance','clinical-reports',
    'audit-trail','report-builder','population-analytics','admin','settings'],
  researcher: ['dashboard','outcomes','outcome-prediction','clinical-trials','population-analytics',
    'report-builder','qeeg-maps','brain-data','audit-trail','settings'],
  billing_admin: ['dashboard','billing','schedule','settings'],
  receptionist:  ['dashboard','patients','calendar','schedule','messaging','settings'],
  read_only:     ['dashboard','patients','sessions','outcomes','settings'],
};

// ── Permissions store ──────────────────────────────────────────────────────────
function getPermissions() {
  try {
    const saved = JSON.parse(localStorage.getItem('ds_permissions') || '{}');
    const merged = {};
    for (const role of ROLES) {
      merged[role] = saved[role] ? saved[role] : [...DEFAULT_PERMISSIONS[role]];
    }
    return merged;
  } catch { return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)); }
}
function savePermissions(perms) { localStorage.setItem('ds_permissions', JSON.stringify(perms)); }
function roleCanAccess(role, featureId) {
  const p = getPermissions();
  return !!(p[role] && p[role].includes(featureId));
}
function resetPermissions() { localStorage.removeItem('ds_permissions'); }
window._roleCanAccess = roleCanAccess;

// ── API Keys store ─────────────────────────────────────────────────────────────
function _permGenHex(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return s;
}
function getApiKeys() {
  try { const r = localStorage.getItem('ds_api_keys'); if (r) return JSON.parse(r); } catch {}
  const keys = [
    { id:'k1a2b3c4', name:'Production Integration', key:'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      permissions:['read','write'], createdAt:new Date(Date.now()-90*864e5).toISOString(),
      lastUsed:new Date(Date.now()-72e5).toISOString(), status:'active' },
    { id:'k5e6f7g8', name:'Analytics Export', key:'deadbeef1234567890abcdef12345678',
      permissions:['read'], createdAt:new Date(Date.now()-30*864e5).toISOString(),
      lastUsed:null, status:'active' },
  ];
  localStorage.setItem('ds_api_keys', JSON.stringify(keys));
  return keys;
}
function saveApiKeys(keys) { localStorage.setItem('ds_api_keys', JSON.stringify(keys)); }
function createApiKey(name, permissions) {
  const keys = getApiKeys();
  const k = { id:_permGenHex(8), name, key:_permGenHex(32), permissions,
    createdAt:new Date().toISOString(), lastUsed:null, status:'active' };
  keys.push(k); saveApiKeys(keys); return k;
}
function revokeApiKey(id) {
  saveApiKeys(getApiKeys().map(k => k.id === id ? { ...k, status:'revoked' } : k));
}

// ── Security Config store ──────────────────────────────────────────────────────
function getSecurityConfig() {
  return {
    sessionTimeoutMinutes:60, requireMFA:false, mfaMethod:'totp',
    passwordMinLength:8, passwordRequireUppercase:true, passwordRequireSpecial:true, passwordRequireNumber:true,
    dataRetentionDays:2555, auditLogRetentionDays:3650, sessionRecordingRetentionDays:180,
    allowGuestAccess:false, ipWhitelist:'',
    ...JSON.parse(localStorage.getItem('ds_security_config') || '{}')
  };
}
function saveSecurityConfig(cfg) { localStorage.setItem('ds_security_config', JSON.stringify(cfg)); }

// ── 2FA state ──────────────────────────────────────────────────────────────────
function get2FAState() { try { return JSON.parse(localStorage.getItem('ds_2fa_state') || 'null'); } catch { return null; } }
function save2FAState(state) {
  if (state === null) localStorage.removeItem('ds_2fa_state');
  else localStorage.setItem('ds_2fa_state', JSON.stringify(state));
}

// ── Mock QR SVG (deterministic pixel art) ─────────────────────────────────────
function _makeQRSvg(secret) {
  const SIZE = 21, CELL = 7, dim = SIZE * CELL;
  let hash = 0;
  for (let i = 0; i < secret.length; i++) hash = (hash * 31 + secret.charCodeAt(i)) >>> 0;
  const finder = (r, c) => {
    if (r < 7 && c < 7) { if(r===0||r===6||c===0||c===6) return true; if(r>=2&&r<=4&&c>=2&&c<=4) return true; return false; }
    if (r < 7 && c >= SIZE-7) { const cc=c-(SIZE-7); if(r===0||r===6||cc===0||cc===6) return true; if(r>=2&&r<=4&&cc>=2&&cc<=4) return true; return false; }
    if (r >= SIZE-7 && c < 7) { const rr=r-(SIZE-7); if(rr===0||rr===6||c===0||c===6) return true; if(rr>=2&&rr<=4&&c>=2&&c<=4) return true; return false; }
    return null;
  };
  let rects = '';
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const fv = finder(r, c);
    const filled = fv !== null ? fv : (((hash >>> ((r*SIZE+c) % 32)) & 1) === 1);
    if (filled) rects += `<rect x="${c*CELL}" y="${r*CELL}" width="${CELL}" height="${CELL}" fill="#000"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" style="image-rendering:pixelated;background:#fff;border-radius:4px">${rects}</svg>`;
}

// ── Backup codes ──────────────────────────────────────────────────────────────
function _genBackupCodes(count = 8) {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: count }, () => Array.from({ length: 8 }, () => ch[Math.floor(Math.random() * ch.length)]).join(''));
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function _permToast(msg, type) {
  let t = document.getElementById('perm-toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'perm-toast';
    t.style.cssText = 'position:fixed;bottom:28px;right:28px;z-index:9998;padding:12px 20px;border-radius:8px;font-size:.875rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.35);transition:opacity .3s;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = type === 'err' ? '#ef4444' : '#10b981';
  t.style.color = '#fff'; t.style.opacity = '1';
  clearTimeout(t._tmr); t._tmr = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

// ── Role badge colors ──────────────────────────────────────────────────────────
const _ROLE_COLORS = {
  admin:{ bg:'#fee2e2',color:'#991b1b' }, clinician:{ bg:'#d1fae5',color:'#065f46' },
  supervisor:{ bg:'#dbeafe',color:'#1e40af' }, researcher:{ bg:'#ede9fe',color:'#5b21b6' },
  billing_admin:{ bg:'#fef3c7',color:'#92400e' }, receptionist:{ bg:'#f3f4f6',color:'#374151' },
  read_only:{ bg:'#e5e7eb',color:'#6b7280' },
};

// ── Main page export ───────────────────────────────────────────────────────────
export async function pgPermissionsAdmin(setTopbar) {
  setTopbar('Permissions & Security Admin', []);

  let _workPerms    = getPermissions();
  let _activeTab    = 'matrix';
  let _filterCat    = 'all';
  let _hiddenRoles  = new Set();
  let _revealedKeys = new Set();
  let _twoFaStep    = 1;
  let _twoFaMethod  = 'totp';
  let _twoFaBackups = [];
  const MOCK_SECRET = 'JBSWY3DPEHPK3PXP';
  const CATEGORIES  = [...new Set(ALL_FEATURES.map(f => f.category))];
  const contentEl   = document.getElementById('content');

  const roleBadge = r => {
    const c = _ROLE_COLORS[r] || { bg:'#e5e7eb', color:'#374151' };
    return `<span class="perm-role-header" style="background:${c.bg};color:${c.color}">${r.replace('_',' ')}</span>`;
  };

  // ── Tab 1: Permissions Matrix ─────────────────────────────────────────────
  function buildMatrixTab() {
    const vis = ROLES.filter(r => !_hiddenRoles.has(r));
    const feats = _filterCat === 'all' ? ALL_FEATURES : ALL_FEATURES.filter(f => f.category === _filterCat);
    const grouped = {};
    feats.forEach(f => { if (!grouped[f.category]) grouped[f.category] = []; grouped[f.category].push(f); });

    let rows = '';
    for (const [cat, flist] of Object.entries(grouped)) {
      rows += `<tr class="perm-category-row"><td colspan="${vis.length + 1}">${cat}</td></tr>`;
      for (const feat of flist) {
        let cells = `<td style="text-align:left;padding-left:14px">${feat.label}</td>`;
        for (const role of vis) {
          const chk = (_workPerms[role] || []).includes(feat.id) ? 'checked' : '';
          cells += `<td><input type="checkbox" ${chk} onchange="window._permToggle('${role}','${feat.id}',this.checked)" title="${role}: ${feat.label}"/></td>`;
        }
        rows += `<tr>${cells}</tr>`;
      }
    }

    const roleToggles = ROLES.map(r =>
      `<button class="btn btn-xs" style="padding:2px 8px;font-size:.72rem;opacity:${_hiddenRoles.has(r)?'.45':'1'}" onclick="window._permToggleRole('${r}')">${r.replace('_',' ')}</button>`
    ).join(' ');

    return `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <label style="font-size:.8rem;color:var(--text-muted)">Category:</label>
        <select style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);font-size:.8rem" onchange="window._permFilterCategory(this.value)">
          <option value="all" ${_filterCat==='all'?'selected':''}>All</option>
          ${CATEGORIES.map(c => `<option value="${c}" ${_filterCat===c?'selected':''}>${c}</option>`).join('')}
        </select>
        <div style="margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:.72rem;color:var(--text-muted)">Hide column:</span>${roleToggles}
        </div>
      </div>
      <div style="overflow-x:auto;overflow-y:auto;max-height:calc(100vh - 280px);border:1px solid var(--border);border-radius:8px">
        <table class="perm-matrix">
          <thead><tr>
            <th class="feature-col">Feature</th>
            ${vis.map(r => `<th>${roleBadge(r)}</th>`).join('')}
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn btn-primary" onclick="window._permSave()">Save Permissions</button>
        <button class="btn btn-secondary" onclick="window._permReset()">Reset to Defaults</button>
      </div>`;
  }

  // ── Tab 2: API Keys ───────────────────────────────────────────────────────
  function buildApiKeysTab() {
    const keys = getApiKeys();
    const rows = keys.map(k => {
      const masked   = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' + k.key.slice(-6);
      const revealed = _revealedKeys.has(k.id);
      const revoked  = k.status === 'revoked';
      const keyHtml  = revealed
        ? `<span class="api-key-masked">${k.key}</span><button class="btn btn-xs" style="margin-left:6px" onclick="navigator.clipboard.writeText('${k.key}');window._permToast('Copied!')">Copy</button>`
        : `<span class="api-key-masked">${masked}</span>`;
      const actions  = revoked
        ? `<span style="color:var(--text-muted);font-size:.78rem">Revoked</span>`
        : `<button class="btn btn-xs" onclick="window._apiKeyReveal('${k.id}')">${revealed?'Hide':'Reveal'}</button>
           <button class="btn btn-xs btn-danger" style="margin-left:4px" onclick="window._apiKeyRevoke('${k.id}')">Revoke</button>`;
      return `<tr class="api-key-row${revoked?' api-key-revoked':''}">
        <td>${k.name}</td><td>${keyHtml}</td>
        <td><code style="font-size:.75rem">${(k.permissions||[]).join(', ')}</code></td>
        <td style="color:var(--text-muted);font-size:.78rem">${new Date(k.createdAt).toLocaleDateString()}</td>
        <td style="color:var(--text-muted);font-size:.78rem">${k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : 'Never'}</td>
        <td><span style="font-size:.72rem;padding:2px 8px;border-radius:10px;background:${revoked?'#fee2e2':'#d1fae5'};color:${revoked?'#991b1b':'#065f46'};font-weight:700">${k.status}</span></td>
        <td>${actions}</td>
      </tr>`;
    }).join('');

    return `
      <div class="security-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="font-size:1rem;font-weight:700">API Keys</h3>
          <button class="btn btn-primary btn-sm" onclick="window._apiKeyShowCreate()">+ Create API Key</button>
        </div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">
          <thead><tr style="font-size:.75rem;color:var(--text-muted);border-bottom:2px solid var(--border)">
            <th style="padding:6px 12px;text-align:left">Name</th>
            <th style="padding:6px 12px;text-align:left">Key</th>
            <th style="padding:6px 12px;text-align:left">Permissions</th>
            <th style="padding:6px 12px;text-align:left">Created</th>
            <th style="padding:6px 12px;text-align:left">Last Used</th>
            <th style="padding:6px 12px;text-align:left">Status</th>
            <th style="padding:6px 12px;text-align:left">Actions</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--text-muted)">No API keys.</td></tr>'}</tbody>
        </table></div>
      </div>
      <div class="security-section" id="create-key-form" style="display:none">
        <h4 style="font-size:.9rem;font-weight:700;margin-bottom:12px">Create New API Key</h4>
        <div style="display:flex;flex-direction:column;gap:10px;max-width:380px">
          <div>
            <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:4px">Key Name</label>
            <input id="new-key-name" type="text" class="form-input" placeholder="e.g. Analytics Integration" style="width:100%"/>
          </div>
          <div>
            <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:6px">Permissions</label>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer"><input type="checkbox" id="kp-read" checked> Read</label>
              <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer"><input type="checkbox" id="kp-write"> Write</label>
              <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer"><input type="checkbox" id="kp-admin"> Admin</label>
            </div>
          </div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-primary" onclick="window._apiKeyCreate()">Generate Key</button>
            <button class="btn btn-secondary" onclick="document.getElementById('create-key-form').style.display='none'">Cancel</button>
          </div>
        </div>
      </div>`;
  }

  // ── Tab 3: Security Config ────────────────────────────────────────────────
  function buildSecurityTab() {
    const cfg = getSecurityConfig();
    const presets = [15,30,60,120,480];
    return `
      <div class="security-section">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:14px">Session & Authentication</h3>
        <div style="margin-bottom:14px">
          <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:8px">Session Timeout</label>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${presets.map(p => `<button class="perm-timeout-chip${cfg.sessionTimeoutMinutes===p?' active':''}" onclick="window._secTimeoutPreset(${p})">${p<60?p+'m':p/60+'h'}</button>`).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <input id="sec-timeout" type="number" min="5" max="1440" value="${cfg.sessionTimeoutMinutes}" style="width:70px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary)" onchange="window._secTimeoutInput(this.value)"/>
              <span style="font-size:.8rem;color:var(--text-muted)">minutes</span>
            </div>
          </div>
        </div>
        <div class="perm-toggle">
          <input type="checkbox" id="sec-mfa"${cfg.requireMFA?' checked':''} onchange="window._secToggle('requireMFA',this.checked)"/>
          <div><span style="font-size:.875rem;font-weight:600">Require MFA</span>
          <span style="font-size:.78rem;color:var(--text-muted);margin-left:8px">Applies to all staff logins</span></div>
        </div>
        <div style="margin:10px 0 0 46px">
          <label style="font-size:.8rem;font-weight:600;display:block;margin-bottom:6px">MFA Method</label>
          <div style="display:flex;gap:16px">
            <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer">
              <input type="radio" name="mfa-method" value="totp"${cfg.mfaMethod==='totp'?' checked':''} onchange="window._secMfaMethod('totp')"/> TOTP (Authenticator App)
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;cursor:pointer">
              <input type="radio" name="mfa-method" value="email"${cfg.mfaMethod==='email'?' checked':''} onchange="window._secMfaMethod('email')"/> Email OTP
            </label>
          </div>
        </div>
      </div>
      <div class="security-section">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:14px">Password Policy</h3>
        <div style="margin-bottom:12px">
          <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:6px">Minimum Length: <span id="sec-pwlen-val">${cfg.passwordMinLength}</span></label>
          <input id="sec-pwlen" type="range" min="6" max="32" value="${cfg.passwordMinLength}" style="width:200px;accent-color:var(--accent-teal)" oninput="document.getElementById('sec-pwlen-val').textContent=this.value"/>
        </div>
        <div class="perm-toggle"><input type="checkbox" id="sec-upper"${cfg.passwordRequireUppercase?' checked':''} onchange="window._secToggle('passwordRequireUppercase',this.checked)"/><span style="font-size:.875rem">Require uppercase letter</span></div>
        <div class="perm-toggle"><input type="checkbox" id="sec-special"${cfg.passwordRequireSpecial?' checked':''} onchange="window._secToggle('passwordRequireSpecial',this.checked)"/><span style="font-size:.875rem">Require special character</span></div>
        <div class="perm-toggle"><input type="checkbox" id="sec-num"${cfg.passwordRequireNumber?' checked':''} onchange="window._secToggle('passwordRequireNumber',this.checked)"/><span style="font-size:.875rem">Require number</span></div>
      </div>
      <div class="security-section">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:14px">Data Retention</h3>
        <div class="retention-row">
          <span style="flex:1;font-size:.875rem">Patient Records</span>
          <select id="sec-ret-patient" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);font-size:.85rem">
            ${[1,3,5,7,10].map(y => `<option value="${y*365}"${cfg.dataRetentionDays===y*365?' selected':''}>${y} years</option>`).join('')}
          </select>
        </div>
        <div class="retention-row">
          <span style="flex:1;font-size:.875rem">Audit Logs</span>
          <select id="sec-ret-audit" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);font-size:.85rem">
            ${[5,7,10,15].map(y => `<option value="${y*365}"${cfg.auditLogRetentionDays===y*365?' selected':''}>${y} years</option>`).join('')}
          </select>
        </div>
        <div class="retention-row" style="border-bottom:none">
          <span style="flex:1;font-size:.875rem">Session Recordings</span>
          <select id="sec-ret-sessions" style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);font-size:.85rem">
            ${[1,3,6,12,24].map(m => `<option value="${m*30}"${cfg.sessionRecordingRetentionDays===m*30?' selected':''}>${m} month${m>1?'s':''}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="security-section">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:14px">Access Control</h3>
        <div class="perm-toggle" style="margin-bottom:12px">
          <input type="checkbox" id="sec-guest"${cfg.allowGuestAccess?' checked':''} onchange="window._secToggle('allowGuestAccess',this.checked)"/>
          <div><span style="font-size:.875rem;font-weight:600">Allow Guest Access</span>
          <span style="font-size:.78rem;color:var(--text-muted);margin-left:8px">Read-only unauthenticated access</span></div>
        </div>
        <div>
          <label style="font-size:.85rem;font-weight:600;display:block;margin-bottom:6px">IP Whitelist <span style="font-weight:400;color:var(--text-muted)">(comma-separated, leave blank to allow all)</span></label>
          <textarea id="sec-ip" rows="3" style="width:100%;max-width:460px;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);font-size:.85rem;resize:vertical" placeholder="192.168.1.0/24, 10.0.0.1">${cfg.ipWhitelist}</textarea>
        </div>
      </div>
      <button class="btn btn-primary" onclick="window._secConfigSave()">Save Security Config</button>`;
  }

  // ── Tab 4: 2FA Setup ──────────────────────────────────────────────────────
  function build2FATab() {
    const state = get2FAState();
    const qrSvg = _makeQRSvg(MOCK_SECRET);

    const statusCard = (state && state.enabled)
      ? `<div class="security-section" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:20px">
           <div><span style="font-size:.875rem;font-weight:700">Status:</span>
           <span style="margin-left:8px;padding:3px 12px;border-radius:12px;background:#d1fae5;color:#065f46;font-size:.8rem;font-weight:700">Active (${state.method==='totp'?'TOTP':'Email OTP'})</span></div>
           <button class="btn btn-danger btn-sm" onclick="window._2faDisable()">Disable 2FA</button>
         </div>`
      : `<div class="security-section" style="display:flex;align-items:center;margin-bottom:20px">
           <span style="font-size:.875rem;font-weight:700">Status:</span>
           <span style="margin-left:8px;padding:3px 12px;border-radius:12px;background:#fee2e2;color:#991b1b;font-size:.8rem;font-weight:700">Not Configured</span>
         </div>`;

    if (state && state.enabled) {
      return statusCard + `<p style="color:var(--text-muted);font-size:.875rem">2FA is active. Disable it first to re-configure.</p>`;
    }

    let stepContent = '';
    if (_twoFaStep === 1) {
      stepContent = `
        <div class="twofa-step">
          <h3 style="font-size:1rem;font-weight:700;margin-bottom:6px">Step 1 — Choose your 2FA method</h3>
          <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:16px">Select how you want to receive authentication codes.</p>
          <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
            <label style="display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:8px;border:2px solid ${_twoFaMethod==='totp'?'var(--accent-teal)':'var(--border)'};cursor:pointer" onclick="window._2faSelectMethod('totp')">
              <input type="radio" name="twofa-m" value="totp"${_twoFaMethod==='totp'?' checked':''} style="margin-top:2px"/>
              <div><div style="font-weight:600;font-size:.875rem">TOTP — Authenticator App</div>
              <div style="font-size:.78rem;color:var(--text-muted)">Use Google Authenticator, Authy, or any TOTP app</div></div>
            </label>
            <label style="display:flex;align-items:flex-start;gap:12px;padding:12px;border-radius:8px;border:2px solid ${_twoFaMethod==='email'?'var(--accent-teal)':'var(--border)'};cursor:pointer" onclick="window._2faSelectMethod('email')">
              <input type="radio" name="twofa-m" value="email"${_twoFaMethod==='email'?' checked':''} style="margin-top:2px"/>
              <div><div style="font-weight:600;font-size:.875rem">Email OTP</div>
              <div style="font-size:.78rem;color:var(--text-muted)">Receive a one-time code via email each login</div></div>
            </label>
          </div>
          <button class="btn btn-primary" onclick="window._2faNext()">Continue →</button>
        </div>`;
    } else if (_twoFaStep === 2) {
      if (_twoFaMethod === 'totp') {
        stepContent = `
          <div class="twofa-step">
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:6px">Step 2 — Scan QR Code</h3>
            <p style="font-size:.8rem;color:var(--text-muted);margin-bottom:16px">Scan with your authenticator app, then enter the 6-digit code.</p>
            <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;margin-bottom:16px">
              <div class="twofa-qr">${qrSvg}</div>
              <div>
                <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:6px">Or enter this secret key manually:</p>
                <code style="font-size:.85rem;letter-spacing:.15em;background:var(--hover-bg);padding:6px 12px;border-radius:6px;display:block;margin-bottom:12px">${MOCK_SECRET}</code>
                <p style="font-size:.78rem;color:var(--text-muted)">Account: deepsynaps@clinic.local</p>
              </div>
            </div>
            <div style="max-width:260px">
              <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:6px">Enter 6-digit code from your app</label>
              <div style="display:flex;gap:8px">
                <input id="twofa-code" type="text" maxlength="6" placeholder="000000" style="flex:1;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);font-size:1.1rem;letter-spacing:.2em;text-align:center"/>
                <button class="btn btn-primary" onclick="window._2faVerify()">Verify</button>
              </div>
              <div id="twofa-err" style="display:none;color:#ef4444;font-size:.78rem;margin-top:6px"></div>
            </div>
            <button class="btn btn-secondary" style="margin-top:14px" onclick="window._2faBack()">← Back</button>
          </div>`;
      } else {
        stepContent = `
          <div class="twofa-step">
            <h3 style="font-size:1rem;font-weight:700;margin-bottom:6px">Step 2 — Email Verification</h3>
            <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:16px">A code has been sent to your email address.</p>
            <div style="padding:12px;border-radius:8px;background:var(--hover-bg);margin-bottom:16px;font-size:.85rem">
              📧 <strong>demo@clinic.local</strong> — check your inbox for the 6-digit code.
            </div>
            <div style="max-width:260px">
              <label style="font-size:.8rem;color:var(--text-muted);display:block;margin-bottom:6px">Enter 6-digit code</label>
              <div style="display:flex;gap:8px">
                <input id="twofa-code" type="text" maxlength="6" placeholder="000000" style="flex:1;padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-primary);font-size:1.1rem;letter-spacing:.2em;text-align:center"/>
                <button class="btn btn-primary" onclick="window._2faVerify()">Verify</button>
              </div>
              <div id="twofa-err" style="display:none;color:#ef4444;font-size:.78rem;margin-top:6px"></div>
            </div>
            <button class="btn btn-secondary" style="margin-top:14px" onclick="window._2faBack()">← Back</button>
          </div>`;
      }
    } else if (_twoFaStep === 3) {
      stepContent = `
        <div class="twofa-step">
          <div style="text-align:center;padding:10px 0 16px">
            <div style="font-size:2.5rem;margin-bottom:6px">✓</div>
            <h3 style="font-size:1.1rem;font-weight:700;color:#10b981">2FA Enabled Successfully</h3>
            <p style="font-size:.85rem;color:var(--text-muted);margin-top:6px">Your account is now protected with ${_twoFaMethod==='totp'?'TOTP authenticator':'Email OTP'}.</p>
          </div>
          <div style="background:var(--hover-bg);border-radius:8px;padding:14px;margin-bottom:14px">
            <p style="font-size:.85rem;font-weight:700;margin-bottom:8px">Save your backup codes</p>
            <p style="font-size:.78rem;color:var(--text-muted);margin-bottom:10px">Store these somewhere safe. Each code can only be used once.</p>
            <div class="twofa-backup-grid">${_twoFaBackups.map(c => `<span class="backup-code">${c}</span>`).join('')}</div>
          </div>
          <button class="btn btn-primary" onclick="window._2faDownloadCodes()">Download Backup Codes</button>
        </div>`;
    }

    return statusCard + stepContent;
  }

  // ── Full page ─────────────────────────────────────────────────────────────
  function buildPage() {
    const tabs = [
      { id:'matrix',   label:'Permissions Matrix' },
      { id:'apikeys',  label:'API Keys'            },
      { id:'security', label:'Security Config'     },
      { id:'2fa',      label:'2FA Setup'           },
    ];
    const tabBar = tabs.map(t =>
      `<button class="perm-tab${_activeTab===t.id?' active':''}" onclick="window._permTab('${t.id}')">${t.label}</button>`
    ).join('');

    let tabContent = '';
    if      (_activeTab === 'matrix')   tabContent = buildMatrixTab();
    else if (_activeTab === 'apikeys')  tabContent = buildApiKeysTab();
    else if (_activeTab === 'security') tabContent = buildSecurityTab();
    else if (_activeTab === '2fa')      tabContent = build2FATab();

    return `
      <div style="padding:20px 24px;max-width:1300px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div style="font-size:1.5rem">🔐</div>
          <div>
            <h1 style="font-size:1.25rem;font-weight:800;margin:0">Permissions & Security Admin</h1>
            <p style="font-size:.8rem;color:var(--text-muted);margin:2px 0 0">Manage role access, API credentials, security policies, and two-factor authentication.</p>
          </div>
        </div>
        <div class="perm-tab-bar">${tabBar}</div>
        <div id="perm-tab-content">${tabContent}</div>
      </div>`;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function attachHandlers() {
    window._permTab    = tab  => { _activeTab = tab; render(); };
    window._permToggle = (role, fid, checked) => {
      if (!_workPerms[role]) _workPerms[role] = [];
      if (checked) { if (!_workPerms[role].includes(fid)) _workPerms[role].push(fid); }
      else _workPerms[role] = _workPerms[role].filter(id => id !== fid);
    };
    window._permSave   = () => { savePermissions(_workPerms); _permToast('Permissions saved.'); };
    window._permReset  = () => {
      if (!confirm('Reset all permissions to defaults? This cannot be undone.')) return;
      resetPermissions(); _workPerms = getPermissions(); render(); _permToast('Permissions reset to defaults.');
    };
    window._permFilterCategory = cat => { _filterCat = cat; render(); };
    window._permToggleRole     = role => { if (_hiddenRoles.has(role)) _hiddenRoles.delete(role); else _hiddenRoles.add(role); render(); };

    window._apiKeyReveal     = id  => { if (_revealedKeys.has(id)) _revealedKeys.delete(id); else _revealedKeys.add(id); render(); };
    window._apiKeyShowCreate = ()  => { const f = document.getElementById('create-key-form'); if (f) f.style.display = f.style.display === 'none' ? '' : 'none'; };
    window._apiKeyCreate     = ()  => {
      const name  = (document.getElementById('new-key-name')?.value || '').trim();
      if (!name) { _permToast('Key name is required.', 'err'); return; }
      const perms = [];
      if (document.getElementById('kp-read')?.checked)  perms.push('read');
      if (document.getElementById('kp-write')?.checked) perms.push('write');
      if (document.getElementById('kp-admin')?.checked) perms.push('admin');
      if (!perms.length) { _permToast('Select at least one permission.', 'err'); return; }
      const k = createApiKey(name, perms);
      _showNewKeyModal(k.key);
      render();
    };
    window._apiKeyRevoke = id => {
      if (!confirm('Revoke this API key? This cannot be undone.')) return;
      revokeApiKey(id); _revealedKeys.delete(id); render(); _permToast('API key revoked.');
    };

    window._secToggle       = (f, v)  => { const c = getSecurityConfig(); c[f] = v; saveSecurityConfig(c); };
    window._secMfaMethod    = method  => { const c = getSecurityConfig(); c.mfaMethod = method; saveSecurityConfig(c); };
    window._secTimeoutPreset= minutes => { const c = getSecurityConfig(); c.sessionTimeoutMinutes = minutes; saveSecurityConfig(c); render(); };
    window._secTimeoutInput = val     => {
      const m = parseInt(val, 10); if (isNaN(m) || m < 1) return;
      const c = getSecurityConfig(); c.sessionTimeoutMinutes = m; saveSecurityConfig(c);
    };
    window._secConfigSave = () => {
      const c = getSecurityConfig();
      c.sessionTimeoutMinutes = parseInt(document.getElementById('sec-timeout')?.value || '60', 10);
      c.requireMFA            = !!document.getElementById('sec-mfa')?.checked;
      c.passwordMinLength     = parseInt(document.getElementById('sec-pwlen')?.value || '8', 10);
      c.passwordRequireUppercase = !!document.getElementById('sec-upper')?.checked;
      c.passwordRequireSpecial   = !!document.getElementById('sec-special')?.checked;
      c.passwordRequireNumber    = !!document.getElementById('sec-num')?.checked;
      c.dataRetentionDays        = parseInt(document.getElementById('sec-ret-patient')?.value || '2555', 10);
      c.auditLogRetentionDays    = parseInt(document.getElementById('sec-ret-audit')?.value || '3650', 10);
      c.sessionRecordingRetentionDays = parseInt(document.getElementById('sec-ret-sessions')?.value || '180', 10);
      c.allowGuestAccess = !!document.getElementById('sec-guest')?.checked;
      c.ipWhitelist      = document.getElementById('sec-ip')?.value || '';
      saveSecurityConfig(c); _permToast('Security config saved.');
    };

    window._2faSelectMethod = method => { _twoFaMethod = method; render(); };
    window._2faNext  = () => { _twoFaStep = 2; render(); };
    window._2faBack  = () => { _twoFaStep = 1; render(); };
    window._2faVerify = () => {
      const code = (document.getElementById('twofa-code')?.value || '').trim();
      const err  = document.getElementById('twofa-err');
      if (!code || code.length < 6) { if (err) { err.textContent = 'Please enter the 6-digit code.'; err.style.display = ''; } return; }
      _twoFaBackups = _genBackupCodes(8);
      save2FAState({ enabled:true, method:_twoFaMethod, backupCodes:_twoFaBackups, enabledAt:new Date().toISOString() });
      _twoFaStep = 3; render();
    };
    window._2faDisable = () => {
      if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return;
      save2FAState(null); _twoFaStep = 1; _twoFaMethod = 'totp'; render(); _permToast('2FA has been disabled.');
    };
    window._2faDownloadCodes = () => {
      const state = get2FAState();
      const codes = (state?.backupCodes) || _twoFaBackups;
      if (!codes?.length) { _permToast('No backup codes available.', 'err'); return; }
      const txt = [
        'DeepSynaps Protocol Studio — 2FA Backup Codes',
        '================================================',
        `Generated: ${new Date().toLocaleString()}`,
        '',
        'Keep these codes in a safe place. Each code can only be used once.',
        '',
        ...codes.map((c, i) => `${i+1}. ${c}`),
        '',
        'Do not share these codes with anyone.',
      ].join('\n');
      const a = Object.assign(document.createElement('a'), { href:URL.createObjectURL(new Blob([txt],{type:'text/plain'})), download:'deepsynaps-backup-codes.txt' });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    window._permToast = _permToast;
  }

  // ── One-time modal for new API key ────────────────────────────────────────
  function _showNewKeyModal(key) {
    const ov = document.createElement('div');
    ov.className = 'perm-modal-overlay';
    ov.innerHTML = `
      <div class="perm-modal">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:6px">API Key Created</h3>
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:10px 12px;margin-bottom:14px;font-size:.8rem;color:#92400e;font-weight:600">
          ⚠ This key will not be shown again. Copy it now.
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <code style="flex:1;word-break:break-all;font-size:.85rem;padding:8px;background:var(--hover-bg);border-radius:6px;letter-spacing:.05em">${key}</code>
          <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${key}');document.getElementById('mcf').style.display=''">Copy</button>
        </div>
        <div id="mcf" style="display:none;color:#10b981;font-size:.8rem;margin-bottom:10px;font-weight:600">Copied to clipboard!</div>
        <button class="btn btn-secondary" onclick="this.closest('.perm-modal-overlay').remove()">Close</button>
      </div>`;
    document.body.appendChild(ov);
  }

  function render() { contentEl.innerHTML = buildPage(); attachHandlers(); }
  render();
}


// ── Multi-Site Network Dashboard ─────────────────────────────────────────────
export async function pgMultiSiteDashboard(setTopbar) {
  setTopbar('Multi-Site Network', `
    <button class="btn btn-primary btn-sm" onclick="window._hhhExportNetworkCSV()">⬇ Export CSV</button>
    <button class="btn btn-secondary btn-sm" onclick="window._hhhNewTransfer()" style="margin-left:6px">+ Transfer Request</button>
  `);

  // ── Seed data helpers ─────────────────────────────────────────────────────
  const SITES_SEED = [
    { id:'s1', name:'Downtown Clinic',  city:'New York, NY',     patients:142, sessionsMonth:287, revenue:94000, clinicians:8,  satisfaction:4.6 },
    { id:'s2', name:'Westside Center',  city:'Los Angeles, CA',  patients:98,  sessionsMonth:201, revenue:71000, clinicians:6,  satisfaction:4.4 },
    { id:'s3', name:'North Campus',     city:'Chicago, IL',      patients:76,  sessionsMonth:155, revenue:52000, clinicians:5,  satisfaction:4.7 },
    { id:'s4', name:'Harbor Branch',    city:'Miami, FL',        patients:53,  sessionsMonth:108, revenue:38000, clinicians:4,  satisfaction:4.3 },
  ];

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function _rng(seed, min, max) {
    let x = Math.sin(seed) * 10000;
    return min + (x - Math.floor(x)) * (max - min);
  }

  function seedHistory() {
    return SITES_SEED.map((s, si) => ({
      siteId: s.id,
      revenue: Array.from({length:12}, (_, m) => Math.round(_rng(si * 37 + m * 13, s.revenue * 0.7, s.revenue * 1.15))),
      sessions: Array.from({length:12}, (_, m) => Math.round(_rng(si * 19 + m * 7, s.sessionsMonth * 0.65, s.sessionsMonth * 1.2))),
      newPatients: Array.from({length:12}, (_, m) => Math.round(_rng(si * 53 + m * 11, 4, 22))),
      satisfaction: Array.from({length:12}, (_, m) => +(_rng(si * 29 + m * 17, s.satisfaction - 0.3, Math.min(5, s.satisfaction + 0.3))).toFixed(1)),
    }));
  }

  function seedTransfers() {
    return [
      { id:'t1', patient:'Marcus Webb',    from:'s1', to:'s2', reason:'Relocated', status:'Completed', date:'2026-03-14' },
      { id:'t2', patient:'Diane Cho',      from:'s3', to:'s1', reason:'Specialist access', status:'Approved',  date:'2026-04-02' },
      { id:'t3', patient:'Rodrigo Alves',  from:'s2', to:'s4', reason:'Insurance change', status:'Pending',   date:'2026-04-09' },
      { id:'t4', patient:'Alicia Torr',    from:'s4', to:'s3', reason:'Family move', status:'Pending',   date:'2026-04-10' },
      { id:'t5', patient:'Samuel Okafor',  from:'s1', to:'s3', reason:'Distance', status:'Completed', date:'2026-02-28' },
    ];
  }

  // ── LocalStorage bootstrap ────────────────────────────────────────────────
  let sites = JSON.parse(localStorage.getItem('ds_sites') || 'null');
  if (!sites) { sites = SITES_SEED; localStorage.setItem('ds_sites', JSON.stringify(sites)); }

  let history = JSON.parse(localStorage.getItem('ds_site_metrics_history') || 'null');
  if (!history) { history = seedHistory(); localStorage.setItem('ds_site_metrics_history', JSON.stringify(history)); }

  let transfers = JSON.parse(localStorage.getItem('ds_site_transfers') || 'null');
  if (!transfers) { transfers = seedTransfers(); localStorage.setItem('ds_site_transfers', JSON.stringify(transfers)); }

  // ── KPI aggregates ────────────────────────────────────────────────────────
  const totalPatients   = sites.reduce((a, s) => a + s.patients, 0);
  const totalSessions   = sites.reduce((a, s) => a + s.sessionsMonth, 0);
  const totalRevenue    = sites.reduce((a, s) => a + s.revenue, 0);
  const avgSatisfaction = (sites.reduce((a, s) => a + s.satisfaction, 0) / sites.length).toFixed(2);
  const totalClinicians = sites.reduce((a, s) => a + s.clinicians, 0);

  // "last month" deltas — approximate -8% to +12% variation per KPI
  const prevPatients   = Math.round(totalPatients * 0.94);
  const prevSessions   = Math.round(totalSessions * 0.91);
  const prevRevenue    = Math.round(totalRevenue * 0.89);
  const prevSatisf     = +(avgSatisfaction * 0.98).toFixed(2);
  const prevClinicians = totalClinicians - 1;

  function delta(now, prev, fmt) {
    const d = now - prev;
    const pct = prev ? ((d / prev) * 100).toFixed(1) : 0;
    const up = d >= 0;
    const arrow = up ? '▲' : '▼';
    return `<span class="hhh-kpi-delta ${up ? 'up' : 'down'}">${arrow} ${fmt(Math.abs(d))} (${Math.abs(pct)}%) vs last mo</span>`;
  }
  const fmtNum  = n => n.toLocaleString();
  const fmtDol  = n => '$' + n.toLocaleString();
  const fmtStar = n => n.toFixed(2);

  // ── Site tooltip breakdown ────────────────────────────────────────────────
  function siteTooltip(field) {
    return sites.map(s => `<div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:2px"><span style="color:var(--text-muted)">${s.name}</span><strong>${
      field === 'patients' ? s.patients :
      field === 'sessions' ? s.sessionsMonth :
      field === 'revenue'  ? '$' + s.revenue.toLocaleString() :
      field === 'satisfaction' ? s.satisfaction :
      s.clinicians
    }</strong></div>`).join('');
  }

  // ── KPI Banner HTML ───────────────────────────────────────────────────────
  const kpiBanner = `
  <div class="hhh-kpi-banner">
    <div class="hhh-kpi-card">
      <div class="hhh-kpi-icon">👥</div>
      <div class="hhh-kpi-label">Total Patients</div>
      <div class="hhh-kpi-value">${fmtNum(totalPatients)}</div>
      ${delta(totalPatients, prevPatients, fmtNum)}
      <div class="hhh-kpi-tooltip">${siteTooltip('patients')}</div>
    </div>
    <div class="hhh-kpi-card">
      <div class="hhh-kpi-icon">📋</div>
      <div class="hhh-kpi-label">Sessions This Month</div>
      <div class="hhh-kpi-value">${fmtNum(totalSessions)}</div>
      ${delta(totalSessions, prevSessions, fmtNum)}
      <div class="hhh-kpi-tooltip">${siteTooltip('sessions')}</div>
    </div>
    <div class="hhh-kpi-card">
      <div class="hhh-kpi-icon">💰</div>
      <div class="hhh-kpi-label">Network Revenue MTD</div>
      <div class="hhh-kpi-value">${fmtDol(totalRevenue)}</div>
      ${delta(totalRevenue, prevRevenue, fmtDol)}
      <div class="hhh-kpi-tooltip">${siteTooltip('revenue')}</div>
    </div>
    <div class="hhh-kpi-card">
      <div class="hhh-kpi-icon">⭐</div>
      <div class="hhh-kpi-label">Avg Satisfaction</div>
      <div class="hhh-kpi-value">${avgSatisfaction}</div>
      ${delta(+avgSatisfaction, prevSatisf, fmtStar)}
      <div class="hhh-kpi-tooltip">${siteTooltip('satisfaction')}</div>
    </div>
    <div class="hhh-kpi-card">
      <div class="hhh-kpi-icon">🩺</div>
      <div class="hhh-kpi-label">Active Clinicians</div>
      <div class="hhh-kpi-value">${totalClinicians}</div>
      ${delta(totalClinicians, prevClinicians, fmtNum)}
      <div class="hhh-kpi-tooltip">${siteTooltip('clinicians')}</div>
    </div>
  </div>`;

  // ── Sparkline SVG (12-point revenue trend) ────────────────────────────────
  function sparkline(points, color) {
    const w = 120, h = 30;
    const mn = Math.min(...points), mx = Math.max(...points);
    const range = mx - mn || 1;
    const xs = points.map((_, i) => (i / (points.length - 1)) * w);
    const ys = points.map(v => h - ((v - mn) / range) * (h - 4) - 2);
    const polyline = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
    const areaPath = `M${xs[0]},${ys[0]} ` + xs.map((x,i) => `L${x},${ys[i]}`).join(' ') + ` L${xs[xs.length-1]},${h} L${xs[0]},${h} Z`;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">
      <defs><linearGradient id="sg-${color.replace('#','')}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity=".25"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${areaPath}" fill="url(#sg-${color.replace('#','')})" />
      <polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>`;
  }

  // ── Site status thresholds ────────────────────────────────────────────────
  function siteStatus(s) {
    if (s.sessionsMonth >= 200 && s.satisfaction >= 4.4) return 'healthy';
    if (s.sessionsMonth >= 120 || s.satisfaction >= 4.2) return 'warning';
    return 'critical';
  }

  const SITE_COLORS = ['#00d4bc','#4a9eff','#9b7fff','#ffb547'];

  // Modality breakdown per site (seeded deterministically)
  const MODALITIES = ['Neurofeedback','TMS','tDCS','PEMF','HBOT'];
  function siteModalities(si) {
    const total = sites[si].sessionsMonth;
    const shares = [0.38, 0.25, 0.18, 0.12, 0.07];
    return MODALITIES.map((m, mi) => ({ name: m, count: Math.round(total * (shares[mi] + _rng(si*7+mi, -0.04, 0.04))) }));
  }

  // Top 3 clinicians per site
  const CLINICIAN_NAMES = [
    ['Dr. Chen','Dr. Patel','Dr. Martin'],
    ['Dr. Kim','Dr. Russo','Dr. Yilmaz'],
    ['Dr. Osei','Dr. Larson','Dr. Singh'],
    ['Dr. Torres','Dr. Black','Dr. Fong'],
  ];
  function topClinicians(si) {
    const base = [44, 37, 29];
    return CLINICIAN_NAMES[si].map((n, i) => ({ name: n, sessions: base[i] + Math.round(_rng(si*31+i, -5, 5)) }));
  }

  // Last 7 days sessions
  function last7Days(si) {
    const avg = Math.round(sites[si].sessionsMonth / 4.3);
    return Array.from({length:7}, (_, d) => Math.round(_rng(si*41+d, avg * 0.6, avg * 1.4)));
  }

  // Site alerts
  const ALERTS = [
    [{ type:'info', msg:'Equipment calibration due Fri' }],
    [{ type:'warn', msg:'3 sessions overdue for review' },{ type:'info', msg:'New clinician onboarding Tue' }],
    [{ type:'info', msg:'Utilisation rate up 8% this week' }],
    [{ type:'warn', msg:'Satisfaction dipped below 4.3' },{ type:'warn', msg:'2 pending insurance claims' }],
  ];

  // ── Site Cards ────────────────────────────────────────────────────────────
  function renderSiteCard(s, si) {
    const hist = history.find(h => h.siteId === s.id);
    const sparkPts = hist ? hist.revenue : Array.from({length:12}, (_,m) => Math.round(_rng(si*37+m*13, s.revenue*0.7, s.revenue*1.1)));
    const color = SITE_COLORS[si % SITE_COLORS.length];
    const status = siteStatus(s);
    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const modalities = siteModalities(si);
    const maxMod = Math.max(...modalities.map(m => m.count));
    const clinicians = topClinicians(si);
    const days7 = last7Days(si);
    const alerts = ALERTS[si] || [];

    const modBars = modalities.map(m => `
      <div class="hhh-modality-bar-wrap">
        <span class="hhh-modality-bar-label" title="${m.name}">${m.name}</span>
        <div class="hhh-modality-bar-bg"><div class="hhh-modality-bar-fill" style="width:${Math.round((m.count/maxMod)*100)}%;background:${color}"></div></div>
        <span class="hhh-modality-bar-count">${m.count}</span>
      </div>`).join('');

    const clinRows = clinicians.map(c => `
      <div class="hhh-clinician-row"><span>${c.name}</span><span>${c.sessions} sessions</span></div>`).join('');

    // mini bar SVG for last 7 days
    const bw = 8, gap = 3, svgW = days7.length*(bw+gap)-gap, svgH = 28;
    const maxD = Math.max(...days7);
    const dayBars = days7.map((v, i) => {
      const bh = Math.max(2, Math.round((v/maxD)*svgH));
      return `<rect x="${i*(bw+gap)}" y="${svgH-bh}" width="${bw}" height="${bh}" rx="2" fill="${color}" opacity=".75"/>`;
    }).join('');
    const daysSVG = `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${dayBars}</svg>`;

    const alertsHtml = alerts.map(a => `<div class="hhh-alert-item ${a.type}">${a.msg}</div>`).join('');

    return `
    <div class="hhh-site-card" id="hhh-site-card-${s.id}">
      <div class="hhh-site-header">
        <div>
          <div class="hhh-site-name">${s.name}</div>
          <div class="hhh-site-city">📍 ${s.city}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="hhh-status-dot ${status}" title="${statusLabel}"></div>
          <span style="font-size:.68rem;color:var(--text-muted)">${statusLabel}</span>
        </div>
      </div>
      <div style="margin:8px 0">${sparkline(sparkPts, color)}</div>
      <div class="hhh-site-metrics">
        <span class="hhh-site-metric-label">Patients</span>
        <span class="hhh-site-metric-value">${s.patients}</span>
        <span class="hhh-site-metric-label">Sessions/Mo</span>
        <span class="hhh-site-metric-value">${s.sessionsMonth}</span>
        <span class="hhh-site-metric-label">Revenue MTD</span>
        <span class="hhh-site-metric-value">$${s.revenue.toLocaleString()}</span>
        <span class="hhh-site-metric-label">Clinicians</span>
        <span class="hhh-site-metric-value">${s.clinicians}</span>
      </div>
      <div class="hhh-site-actions">
        <button class="hhh-drill-btn" onclick="window._hhhToggleDrill('${s.id}', this)">Drill Down →</button>
      </div>
      <div class="hhh-drill-panel" id="hhh-drill-${s.id}">
        <div class="hhh-drill-section-title">Sessions by Modality</div>
        ${modBars}
        <div class="hhh-drill-section-title" style="margin-top:12px">Top Clinicians</div>
        ${clinRows}
        <div class="hhh-drill-section-title" style="margin-top:12px">Last 7 Days</div>
        <div style="display:flex;align-items:flex-end;gap:4px;margin-top:4px">${daysSVG}</div>
        <div style="display:flex;justify-content:space-between;font-size:.68rem;color:var(--text-muted);margin-top:2px">
          ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<span>${d}</span>`).join('')}
        </div>
        ${alerts.length ? `<div class="hhh-drill-section-title" style="margin-top:12px">Alerts</div>${alertsHtml}` : ''}
      </div>
    </div>`;
  }

  const siteGridHTML = `
  <div class="hhh-site-grid">
    ${sites.map((s, si) => renderSiteCard(s, si)).join('')}
  </div>`;

  // ── Comparative Analysis Chart ────────────────────────────────────────────
  // Grouped bar SVG
  let _compareMetric = 'revenue';

  function buildCompareChart(metric) {
    const LABELS = { revenue:'Revenue MTD', sessions:'Sessions/Mo', satisfaction:'Avg Satisfaction', newPatients:'New Patients (Mo)' };
    const getData = (s, si) => {
      if (metric === 'revenue')      return s.revenue;
      if (metric === 'sessions')     return s.sessionsMonth;
      if (metric === 'satisfaction') return Math.round(s.satisfaction * 1000) / 1000;
      // newPatients from history last month
      const h = history.find(h => h.siteId === s.id);
      return h ? h.newPatients[h.newPatients.length - 1] : Math.round(_rng(si*53+11, 4, 22));
    };

    const vals = sites.map((s, si) => getData(s, si));
    const maxVal = Math.max(...vals);
    const W = 500, H = 160, pad = { l:50, r:10, t:14, b:30 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const groupW = plotW / sites.length;
    const barW   = Math.min(28, groupW * 0.6);
    const barOff = (groupW - barW) / 2;

    // Y axis labels (5 ticks)
    const ticks = Array.from({length:5}, (_, i) => {
      const v = (maxVal / 4) * i;
      const y = pad.t + plotH - (v / maxVal) * plotH;
      const lbl = metric === 'revenue' ? ('$' + (v >= 1000 ? Math.round(v/1000) + 'k' : Math.round(v)))
                : metric === 'satisfaction' ? v.toFixed(1)
                : Math.round(v);
      return `<text x="${pad.l - 5}" y="${y + 4}" text-anchor="end" font-size="9" fill="var(--text-muted)">${lbl}</text>
              <line x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
    });

    const bars = sites.map((s, si) => {
      const v = vals[si];
      const bh = maxVal > 0 ? Math.max(2, (v / maxVal) * plotH) : 2;
      const x = pad.l + si * groupW + barOff;
      const y = pad.t + plotH - bh;
      const lbl = metric === 'revenue' ? '$' + Math.round(v/1000) + 'k'
                : metric === 'satisfaction' ? v.toFixed(1)
                : v;
      return `<g>
        <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="3" fill="${SITE_COLORS[si]}" opacity=".85"/>
        <text x="${x + barW/2}" y="${y - 3}" text-anchor="middle" font-size="9" fill="${SITE_COLORS[si]}" font-weight="700">${lbl}</text>
        <text x="${x + barW/2}" y="${H - pad.b + 12}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${s.name.split(' ')[0]}</text>
      </g>`;
    });

    return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="max-width:${W}px;overflow:visible">
      ${ticks.join('')}
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" stroke="var(--border)" stroke-width="1"/>
      ${bars.join('')}
    </svg>`;
  }

  const compareHTML = `
  <div class="hhh-compare-chart" id="hhh-compare-section">
    <div class="hhh-compare-header">
      <div class="hhh-compare-title">Comparative Analysis</div>
      <div class="hhh-compare-toggles">
        <button class="hhh-toggle-btn active" id="hhh-cmp-revenue" onclick="window._hhhCompare('revenue')">Revenue</button>
        <button class="hhh-toggle-btn" id="hhh-cmp-sessions" onclick="window._hhhCompare('sessions')">Sessions</button>
        <button class="hhh-toggle-btn" id="hhh-cmp-satisfaction" onclick="window._hhhCompare('satisfaction')">Satisfaction</button>
        <button class="hhh-toggle-btn" id="hhh-cmp-newPatients" onclick="window._hhhCompare('newPatients')">New Patients</button>
      </div>
    </div>
    <div id="hhh-compare-chart-inner">${buildCompareChart('revenue')}</div>
    <div class="hhh-compare-legend">
      ${sites.map((s, si) => `<div class="hhh-legend-label"><div class="hhh-legend-dot" style="background:${SITE_COLORS[si]}"></div>${s.name}</div>`).join('')}
    </div>
  </div>`;

  // ── Transfers Table ───────────────────────────────────────────────────────
  function siteNameById(id) { return (sites.find(s => s.id === id) || {}).name || id; }

  function renderTransferRows(rows) {
    if (!rows.length) return `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px">No transfer requests.</td></tr>`;
    return rows.map(r => `
      <tr>
        <td>${r.patient}</td>
        <td>${siteNameById(r.from)}</td>
        <td>${siteNameById(r.to)}</td>
        <td>${r.reason}</td>
        <td><span class="hhh-status-pill ${r.status.toLowerCase()}">${r.status}</span></td>
        <td>${r.date}</td>
        <td>${r.status === 'Pending'
          ? `<button class="hhh-action-btn approve" onclick="window._hhhTransferAction('${r.id}','Approved')">Approve</button>
             <button class="hhh-action-btn deny" onclick="window._hhhTransferAction('${r.id}','Denied')">Deny</button>`
          : '<span style="font-size:.72rem;color:var(--text-muted)">—</span>'}</td>
      </tr>`).join('');
  }

  const transferHTML = `
  <div class="hhh-transfer-table">
    <div class="hhh-transfer-header">
      <div class="hhh-transfer-title">Inter-Site Patient Transfers</div>
      <button class="btn btn-secondary btn-sm" onclick="window._hhhNewTransfer()">+ New Request</button>
    </div>
    <div style="overflow-x:auto">
      <table class="hhh-table" id="hhh-transfers-table">
        <thead><tr>
          <th>Patient</th><th>From Site</th><th>To Site</th><th>Reason</th><th>Status</th><th>Date</th><th>Actions</th>
        </tr></thead>
        <tbody id="hhh-transfers-body">${renderTransferRows(transfers)}</tbody>
      </table>
    </div>
  </div>`;

  // ── Billing Summary ───────────────────────────────────────────────────────
  function ytdRevenue(si) {
    const h = history.find(h => h.siteId === sites[si].id);
    return h ? h.revenue.reduce((a, v) => a + v, 0) : sites[si].revenue * 10;
  }
  function pendingClaims(si) { return Math.round(_rng(si * 61 + 3, 3, 14)); }
  function collectedPct(si)  { return (88 + Math.round(_rng(si * 71 + 5, 0, 9))) + '%'; }

  const billingRows = sites.map((s, si) => `
    <tr>
      <td>${s.name}</td>
      <td>$${s.revenue.toLocaleString()}</td>
      <td>$${ytdRevenue(si).toLocaleString()}</td>
      <td>${pendingClaims(si)}</td>
      <td>${collectedPct(si)}</td>
    </tr>`).join('');

  const billingTotals = `
    <tr style="font-weight:700;border-top:2px solid var(--border)">
      <td>Network Total</td>
      <td>$${totalRevenue.toLocaleString()}</td>
      <td>$${sites.map((_,si) => ytdRevenue(si)).reduce((a,v) => a+v, 0).toLocaleString()}</td>
      <td>${sites.map((_,si) => pendingClaims(si)).reduce((a,v)=>a+v,0)}</td>
      <td>—</td>
    </tr>`;

  // Stacked area chart SVG — 12 months, 4 sites
  function buildAreaChart() {
    const W = 560, H = 120, pad = { l:46, r:10, t:8, b:26 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const mMax = MONTHS.length;

    // Compute stacked totals per month
    const stacks = Array.from({length:12}, (_, m) => {
      let cum = 0;
      return sites.map((s, si) => {
        const h = history.find(h => h.siteId === s.id);
        const v = h ? h.revenue[m] : Math.round(_rng(si*37+m*13, s.revenue*0.7, s.revenue*1.1));
        cum += v;
        return cum;
      });
    });

    const globalMax = Math.max(...stacks.map(s => s[s.length - 1]));

    function stackedArea(siteIdx) {
      const upper = stacks.map((col, m) => {
        const x = pad.l + (m / (mMax - 1)) * plotW;
        const y = pad.t + plotH - (col[siteIdx] / globalMax) * plotH;
        return `${x},${y}`;
      });
      const lower = siteIdx === 0
        ? stacks.map((_, m) => { const x = pad.l + (m/(mMax-1))*plotW; return `${x},${pad.t+plotH}`; }).reverse()
        : stacks.map((col, m) => {
            const x = pad.l + (m/(mMax-1))*plotW;
            const y = pad.t + plotH - (col[siteIdx-1]/globalMax)*plotH;
            return `${x},${y}`;
          }).reverse();
      return `<polygon points="${[...upper, ...lower].join(' ')}" fill="${SITE_COLORS[siteIdx]}" opacity="${0.15 + siteIdx * 0.07}"/>`;
    }

    // top line per site (topmost layer = site 3)
    const topLine = stacks.map((col, m) => {
      const x = pad.l + (m/(mMax-1))*plotW;
      const y = pad.t + plotH - (col[sites.length-1]/globalMax)*plotH;
      return `${x},${y}`;
    }).join(' ');

    // Y ticks
    const ticks = Array.from({length:4}, (_, i) => {
      const v = (globalMax / 3) * i;
      const y = pad.t + plotH - (v/globalMax)*plotH;
      return `<text x="${pad.l-5}" y="${y+4}" text-anchor="end" font-size="9" fill="var(--text-muted)">$${Math.round(v/1000)}k</text>
              <line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="var(--border)" stroke-width="0.5"/>`;
    });

    // X labels (every other month)
    const xLabels = MONTHS.map((lbl, m) => {
      if (m % 2 !== 0) return '';
      const x = pad.l + (m/(mMax-1))*plotW;
      return `<text x="${x}" y="${H-pad.b+12}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${lbl}</text>`;
    });

    return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="max-width:${W}px;overflow:visible">
      ${ticks.join('')}
      ${sites.map((_, si) => stackedArea(si)).join('')}
      <polyline points="${topLine}" fill="none" stroke="${SITE_COLORS[3]}" stroke-width="1.5" stroke-opacity=".7" stroke-linejoin="round"/>
      ${xLabels.join('')}
      <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t+plotH}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${pad.l}" y1="${pad.t+plotH}" x2="${W-pad.r}" y2="${pad.t+plotH}" stroke="var(--border)" stroke-width="1"/>
    </svg>`;
  }

  const billingHTML = `
  <div class="hhh-billing-card">
    <div class="hhh-billing-header">
      <div class="hhh-billing-title">Consolidated Billing Summary</div>
      <button class="btn btn-secondary btn-sm" onclick="window._hhhExportNetworkCSV()">⬇ Export CSV</button>
    </div>
    <div style="overflow-x:auto">
      <table class="hhh-billing-table">
        <thead><tr>
          <th>Site</th><th>MTD Revenue</th><th>YTD Revenue</th><th>Pending Claims</th><th>Collected %</th>
        </tr></thead>
        <tbody>${billingRows}${billingTotals}</tbody>
      </table>
    </div>
    <div class="hhh-area-chart">
      <div style="font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:8px">Network Revenue — 12 Months (Stacked by Site)</div>
      ${buildAreaChart()}
      <div class="hhh-compare-legend" style="margin-top:8px">
        ${sites.map((s, si) => `<div class="hhh-legend-label"><div class="hhh-legend-dot" style="background:${SITE_COLORS[si]}"></div>${s.name}</div>`).join('')}
      </div>
    </div>
  </div>`;

  // ── Assemble page ─────────────────────────────────────────────────────────
  document.getElementById('app-content').innerHTML = `
  <div style="padding:20px 24px;max-width:1280px;margin:0 auto">
    <div style="margin-bottom:20px">
      <div style="font-size:1.1rem;font-weight:800;color:var(--text);margin-bottom:3px">Multi-Site Network Dashboard</div>
      <div style="font-size:.8rem;color:var(--text-muted)">Executive overview — all 4 clinic locations &nbsp;·&nbsp; Updated April 2026</div>
    </div>
    <div class="hhh-section-title">Network KPIs</div>
    ${kpiBanner}
    <div class="hhh-section-title">Site Overview</div>
    ${siteGridHTML}
    <div class="hhh-section-title">Comparative Analysis</div>
    ${compareHTML}
    <div class="hhh-section-title">Inter-Site Transfers</div>
    ${transferHTML}
    <div class="hhh-section-title">Billing Summary</div>
    ${billingHTML}
  </div>
  `;

  // ── Transfer Modal builder ────────────────────────────────────────────────
  function buildTransferModal() {
    const patients = JSON.parse(localStorage.getItem('ds_patients') || '[]');
    const ptOptions = patients.length
      ? patients.map(p => `<option value="${p.name || p.id}">${p.name || p.id}</option>`).join('')
      : '<option value="New Patient">New Patient</option>';
    const siteOptions = sites.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    const ov = document.createElement('div');
    ov.className = 'hhh-modal-overlay';
    ov.id = 'hhh-transfer-modal';
    ov.innerHTML = `
      <div class="hhh-modal">
        <h3>New Transfer Request</h3>
        <label>Patient</label>
        <select id="hhh-tr-patient">${ptOptions}</select>
        <label>From Site</label>
        <select id="hhh-tr-from">${siteOptions}</select>
        <label>To Site</label>
        <select id="hhh-tr-to">${siteOptions}</select>
        <label>Reason</label>
        <input id="hhh-tr-reason" type="text" placeholder="e.g. Relocated, Specialist access..." />
        <div class="hhh-modal-actions">
          <button class="btn btn-secondary" onclick="document.getElementById('hhh-transfer-modal')?.remove()">Cancel</button>
          <button class="btn btn-primary" onclick="window._hhhSubmitTransfer()">Submit</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  }

  // ── Window handlers ───────────────────────────────────────────────────────
  window._hhhToggleDrill = function(siteId, btn) {
    const panel = document.getElementById('hhh-drill-' + siteId);
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    btn.textContent = isOpen ? 'Collapse ↑' : 'Drill Down →';
  };

  window._hhhCompare = function(metric) {
    _compareMetric = metric;
    ['revenue','sessions','satisfaction','newPatients'].forEach(m => {
      const b = document.getElementById('hhh-cmp-' + m);
      if (b) b.classList.toggle('active', m === metric);
    });
    const inner = document.getElementById('hhh-compare-chart-inner');
    if (inner) inner.innerHTML = buildCompareChart(metric);
  };

  window._hhhTransferAction = function(transferId, newStatus) {
    const t = transfers.find(t => t.id === transferId);
    if (!t) return;
    t.status = newStatus;
    localStorage.setItem('ds_site_transfers', JSON.stringify(transfers));
    const tbody = document.getElementById('hhh-transfers-body');
    if (tbody) tbody.innerHTML = renderTransferRows(transfers);
    window._announce?.(`Transfer ${newStatus.toLowerCase()}`);
  };

  window._hhhNewTransfer = function() {
    document.getElementById('hhh-transfer-modal')?.remove();
    buildTransferModal();
  };

  window._hhhSubmitTransfer = function() {
    const patient = document.getElementById('hhh-tr-patient')?.value || 'Unknown';
    const from    = document.getElementById('hhh-tr-from')?.value;
    const to      = document.getElementById('hhh-tr-to')?.value;
    const reason  = document.getElementById('hhh-tr-reason')?.value?.trim() || 'Not specified';
    if (from === to) { alert('From and To sites must be different.'); return; }
    const newT = {
      id: 't' + Date.now(),
      patient, from, to, reason,
      status: 'Pending',
      date: new Date().toISOString().slice(0, 10),
    };
    transfers.push(newT);
    localStorage.setItem('ds_site_transfers', JSON.stringify(transfers));
    document.getElementById('hhh-transfer-modal')?.remove();
    const tbody = document.getElementById('hhh-transfers-body');
    if (tbody) tbody.innerHTML = renderTransferRows(transfers);
    window._announce?.('Transfer request submitted');
  };

  window._hhhExportNetworkCSV = function() {
    const header = ['Site','City','Patients','Sessions/Mo','Revenue MTD','Clinicians','Satisfaction'];
    const rows = sites.map(s => [s.name, s.city, s.patients, s.sessionsMonth, s.revenue, s.clinicians, s.satisfaction]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type:'text/csv' })),
      download: 'deepsynaps-network-export.csv',
    });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    window._announce?.('CSV export downloaded');
  };
}
