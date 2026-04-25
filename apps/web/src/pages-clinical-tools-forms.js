// ─────────────────────────────────────────────────────────────────────────────
// pages-clinical-tools-forms.js — Medication Safety Checker + Forms Builder
// (extracted from pages-clinical-tools.js for code-splitting). Both pages
// share `_dsToast` from the shared module and the global `tag/spark/api`
// runtime helpers.
// ─────────────────────────────────────────────────────────────────────────────
import { api } from "./api.js";
import { tag, spark } from "./helpers.js";
import { _dsToast } from "./pages-clinical-tools-shared.js";

// ── Medication Interaction Checker ────────────────────────────────────────────
export async function pgMedInteractionChecker(setTopbar) {
  setTopbar('Medication Safety', `
    <button class="btn-secondary" onclick="window._micPrintSafety()" style="font-size:12px;padding:5px 12px">🖨 Print Safety Screen</button>
    <button class="btn-secondary" onclick="window._micExportCSV()" style="font-size:12px;padding:5px 12px">⬇ Export Log CSV</button>
  `);

  // ── Drug class mapping ──────────────────────────────────────────────────────
  const DRUG_CLASS_MAP = {
    ssri:            ['sertraline','fluoxetine','escitalopram','paroxetine','fluvoxamine','citalopram','zoloft','prozac','lexapro','paxil','luvox','celexa'],
    snri:            ['venlafaxine','duloxetine','desvenlafaxine','levomilnacipran','milnacipran','effexor','cymbalta','pristiq'],
    maoi:            ['phenelzine','tranylcypromine','isocarboxazid','selegiline','nardil','parnate','marplan'],
    stimulant:       ['methylphenidate','amphetamine','lisdexamfetamine','dextroamphetamine','ritalin','adderall','vyvanse','concerta','focalin','dexedrine'],
    benzodiazepine:  ['lorazepam','clonazepam','diazepam','alprazolam','temazepam','oxazepam','ativan','klonopin','valium','xanax','restoril'],
    opioid:          ['oxycodone','hydrocodone','morphine','codeine','tramadol','fentanyl','buprenorphine','methadone','percocet','vicodin'],
    antipsychotic:   ['clozapine','quetiapine','aripiprazole','risperidone','olanzapine','haloperidol','ziprasidone','lurasidone','clozaril','seroquel','abilify','risperdal','zyprexa','geodon'],
    'mood stabilizer': ['lithium','valproate','lamotrigine','carbamazepine','oxcarbazepine','lithobid','depakote','lamictal','tegretol'],
    lithium:         ['lithium','lithobid'],
    clozapine:       ['clozapine','clozaril'],
    bupropion:       ['bupropion','wellbutrin','zyban'],
    tramadol:        ['tramadol'],
    warfarin:        ['warfarin','coumadin'],
    ibuprofen:       ['ibuprofen','advil','motrin','naproxen','aleve','nsaid','celecoxib','indomethacin'],
  };

  // ── Interaction rules ───────────────────────────────────────────────────────
  const INTERACTION_RULES = [
    // Drug-Drug
    { drugs:['lithium','ibuprofen'],       severity:'major',           mechanism:'NSAIDs increase lithium levels → toxicity risk',                                     recommendation:'Monitor lithium levels; consider acetaminophen alternative' },
    { drugs:['tramadol','ssri'],           severity:'major',           mechanism:'Serotonin syndrome risk',                                                            recommendation:'Avoid combination; monitor for hyperthermia, agitation, clonus' },
    { drugs:['maoi','ssri'],              severity:'contraindicated', mechanism:'Serotonin syndrome — potentially fatal',                                              recommendation:'Do not combine; washout period required (2 weeks SSRI, 5 weeks fluoxetine)' },
    { drugs:['clozapine','ssri'],          severity:'moderate',        mechanism:'CYP1A2 inhibition raises clozapine levels',                                          recommendation:'Monitor clozapine levels; consider dose adjustment' },
    { drugs:['warfarin','ssri'],           severity:'moderate',        mechanism:'Increased bleeding risk via platelet inhibition',                                     recommendation:'Monitor INR; watch for bruising/bleeding' },
    { drugs:['stimulant','maoi'],          severity:'contraindicated', mechanism:'Hypertensive crisis risk',                                                           recommendation:'Absolute contraindication' },
    { drugs:['benzodiazepine','opioid'],   severity:'major',           mechanism:'Additive CNS/respiratory depression',                                                recommendation:'Use lowest effective doses; monitor closely' },
    { drugs:['lithium','ssri'],            severity:'moderate',        mechanism:'Increased risk of serotonin syndrome; lithium may potentiate SSRI effects',          recommendation:'Monitor for signs of serotonin toxicity; check lithium levels regularly' },
    { drugs:['stimulant','snri'],          severity:'moderate',        mechanism:'Additive cardiovascular effects — increased BP and heart rate',                      recommendation:'Monitor blood pressure and heart rate; dose carefully' },
    { drugs:['bupropion','maoi'],          severity:'contraindicated', mechanism:'Risk of hypertensive crisis and seizures',                                           recommendation:'Absolute contraindication; at least 14-day washout required' },
    { drugs:['bupropion','stimulant'],     severity:'moderate',        mechanism:'Additive CNS stimulation; increased seizure risk',                                   recommendation:'Use with caution; monitor for agitation and seizure threshold lowering' },
    { drugs:['antipsychotic','benzodiazepine'], severity:'moderate',   mechanism:'Additive CNS depression and respiratory depression risk',                            recommendation:'Monitor closely especially in elderly; use minimum effective doses' },
    // Drug-Modality
    { drug:'lithium',         modality:'TMS',           severity:'caution', mechanism:'Lithium lowers seizure threshold; may increase TMS seizure risk at therapeutic levels', recommendation:'Use conservative TMS parameters; monitor lithium levels; ensure level <0.8 mEq/L before TMS' },
    { drug:'clozapine',       modality:'TMS',           severity:'hold',    mechanism:'Clozapine significantly lowers seizure threshold — high seizure risk with TMS',          recommendation:'Consult psychiatrist before TMS; consider alternative protocols' },
    { drug:'bupropion',       modality:'TMS',           severity:'caution', mechanism:'Bupropion lowers seizure threshold in a dose-dependent manner',                          recommendation:'Use conservative TMS parameters; doses >300mg/day warrant additional caution' },
    { drug:'stimulant',       modality:'neurofeedback', severity:'note',    mechanism:'Stimulant use may affect baseline EEG and neurofeedback training targets',               recommendation:'Document stimulant timing relative to sessions; consider consistent med schedule' },
    { drug:'benzodiazepine',  modality:'neurofeedback', severity:'caution', mechanism:'Benzodiazepines suppress theta/beta ratios and alter EEG significantly',                 recommendation:'Note benzo use in session records; may reduce neurofeedback efficacy' },
    { drug:'ssri',            modality:'tDCS',          severity:'note',    mechanism:'SSRIs may modulate cortical excitability effects of tDCS',                               recommendation:'Potential enhancement of tDCS effects; monitor response carefully' },
    { drug:'benzodiazepine',  modality:'tDCS',          severity:'caution', mechanism:'Benzodiazepines may attenuate anodal tDCS-induced neuroplasticity via GABA-A channels', recommendation:'Consider scheduling tDCS sessions when benzo effect is minimal; note timing' },
    { drug:'maoi',            modality:'TMS',           severity:'caution', mechanism:'MAOIs may lower seizure threshold; cardiovascular reactivity concern during TMS',        recommendation:'Review MAOI type and dose; use conservative TMS parameters; have crash cart available' },
    { drug:'stimulant',       modality:'tDCS',          severity:'note',    mechanism:'Stimulants may enhance tDCS-induced cortical excitability additively',                   recommendation:'May potentiate tDCS effects; monitor carefully; document timing' },
    { drug:'antipsychotic',   modality:'neurofeedback', severity:'note',    mechanism:'Antipsychotics alter baseline EEG patterns; may affect neurofeedback targets',          recommendation:'Establish medication-stable EEG baseline; document medication status per session' },
    { drug:'lithium',         modality:'tDCS',          severity:'note',    mechanism:'Lithium affects intracellular signalling that tDCS modulates; uncertain interaction',    recommendation:'Monitor closely; document response; ensure lithium levels are stable' },
  ];

  // ── Drug database seed ──────────────────────────────────────────────────────
  const DRUG_DB = [
    { name:'Sertraline (Zoloft)',             class:'SSRI',                    uses:'Depression, anxiety, OCD, PTSD',                        neuroConsiderations:'May enhance tDCS cortical effects; monitor closely',                                  seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Fluoxetine (Prozac)',             class:'SSRI',                    uses:'Depression, bulimia, OCD',                              neuroConsiderations:'Long half-life; washout >5 weeks if switching to MAOI',                               seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Escitalopram (Lexapro)',          class:'SSRI',                    uses:'Depression, GAD',                                       neuroConsiderations:'Well-tolerated with most neuromodulation',                                             seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Paroxetine (Paxil)',              class:'SSRI',                    uses:'Depression, anxiety, PTSD, OCD',                        neuroConsiderations:'Short half-life; consider timing with sessions',                                       seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Citalopram (Celexa)',             class:'SSRI',                    uses:'Depression, anxiety',                                   neuroConsiderations:'Generally compatible with neuromodulation',                                            seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Venlafaxine (Effexor)',           class:'SNRI',                    uses:'Depression, anxiety, fibromyalgia',                     neuroConsiderations:'Dual mechanism; monitor BP with tDCS',                                                 seizureRisk:'low-moderate',  cnsStimRisk:'low' },
    { name:'Duloxetine (Cymbalta)',           class:'SNRI',                    uses:'Depression, pain, anxiety',                             neuroConsiderations:'Generally compatible with neuromodulation',                                            seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Lithium (Lithobid)',              class:'Mood Stabilizer',         uses:'Bipolar disorder, mania prevention',                    neuroConsiderations:'CAUTION with TMS — lowers seizure threshold; check levels',                           seizureRisk:'moderate',      cnsStimRisk:'low' },
    { name:'Valproate (Depakote)',            class:'Mood Stabilizer',         uses:'Bipolar, epilepsy, migraine',                           neuroConsiderations:'AED — actually raises seizure threshold; compatible with TMS',                        seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Lamotrigine (Lamictal)',          class:'Mood Stabilizer',         uses:'Bipolar, epilepsy, depression',                         neuroConsiderations:'AED — generally compatible; may enhance cortical stability',                          seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Carbamazepine (Tegretol)',        class:'Mood Stabilizer',         uses:'Bipolar, epilepsy, neuropathic pain',                   neuroConsiderations:'Strong CYP inducer; AED — compatible with TMS',                                       seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Clozapine (Clozaril)',            class:'Atypical Antipsychotic',  uses:'Treatment-resistant schizophrenia',                     neuroConsiderations:'HIGH seizure risk — TMS CONTRAINDICATED at standard doses',                           seizureRisk:'high',         cnsStimRisk:'low' },
    { name:'Quetiapine (Seroquel)',           class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar, depression augmentation',       neuroConsiderations:'Moderate seizure risk consideration with TMS',                                        seizureRisk:'low-moderate',  cnsStimRisk:'low' },
    { name:'Aripiprazole (Abilify)',          class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar, depression augmentation',       neuroConsiderations:'Generally well-tolerated with neuromodulation',                                       seizureRisk:'low',          cnsStimRisk:'moderate' },
    { name:'Risperidone (Risperdal)',         class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar',                                neuroConsiderations:'Monitor for EPS; EEG baseline recommended',                                           seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Olanzapine (Zyprexa)',            class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar, agitation',                     neuroConsiderations:'Sedating; note timing before sessions; EEG changes possible',                         seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Ziprasidone (Geodon)',            class:'Atypical Antipsychotic',  uses:'Schizophrenia, bipolar',                                neuroConsiderations:'QTc prolongation risk; EEG monitoring recommended',                                    seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Methylphenidate (Ritalin)',       class:'Stimulant',               uses:'ADHD, narcolepsy',                                      neuroConsiderations:'Document timing relative to neurofeedback sessions; may affect EEG targets',           seizureRisk:'low',          cnsStimRisk:'high' },
    { name:'Amphetamine salts (Adderall)',    class:'Stimulant',               uses:'ADHD, narcolepsy',                                      neuroConsiderations:'Same as methylphenidate; consistent timing recommended',                               seizureRisk:'low',          cnsStimRisk:'high' },
    { name:'Lisdexamfetamine (Vyvanse)',      class:'Stimulant',               uses:'ADHD, BED',                                             neuroConsiderations:'Longer-acting; more consistent EEG baseline vs IR stimulants',                         seizureRisk:'low',          cnsStimRisk:'high' },
    { name:'Bupropion (Wellbutrin)',          class:'NDRI',                    uses:'Depression, smoking cessation, ADHD',                   neuroConsiderations:'CAUTION with TMS — dose-dependent seizure threshold lowering',                         seizureRisk:'moderate',      cnsStimRisk:'high' },
    { name:'Mirtazapine (Remeron)',           class:'NaSSA',                   uses:'Depression, anxiety, insomnia',                         neuroConsiderations:'Sedating; may affect neurofeedback alertness',                                        seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Trazodone (Desyrel)',             class:'SARI',                    uses:'Depression, insomnia',                                  neuroConsiderations:'Sedating at low doses; generally compatible',                                          seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Lorazepam (Ativan)',              class:'Benzodiazepine',          uses:'Anxiety, panic, acute agitation',                       neuroConsiderations:'Significantly alters EEG — document use; may impair neurofeedback',                    seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Clonazepam (Klonopin)',           class:'Benzodiazepine',          uses:'Anxiety, panic disorder, seizures',                     neuroConsiderations:'AED — may reduce tDCS excitatory effects',                                            seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Diazepam (Valium)',               class:'Benzodiazepine',          uses:'Anxiety, muscle spasm, seizures',                       neuroConsiderations:'Long-acting; persistent EEG alteration',                                              seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Alprazolam (Xanax)',              class:'Benzodiazepine',          uses:'Anxiety, panic disorder',                               neuroConsiderations:'Short-acting; rapid onset EEG effect; document session timing',                        seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Phenelzine (Nardil)',             class:'MAOI',                    uses:'Depression, panic, social anxiety',                     neuroConsiderations:'Numerous interactions — comprehensive review required before any neuromodulation',     seizureRisk:'moderate',      cnsStimRisk:'high' },
    { name:'Tranylcypromine (Parnate)',       class:'MAOI',                    uses:'Depression',                                            neuroConsiderations:'High interaction risk; strict dietary + drug restrictions',                            seizureRisk:'moderate',      cnsStimRisk:'high' },
    { name:'Buspirone (Buspar)',              class:'Anxiolytic',              uses:'GAD',                                                   neuroConsiderations:'Generally compatible; non-benzodiazepine mechanism',                                   seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Hydroxyzine (Vistaril)',          class:'Antihistamine/Anxiolytic',uses:'Anxiety, itching, sedation',                            neuroConsiderations:'Sedating; note timing before sessions',                                               seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Naltrexone (Vivitrol)',           class:'Opioid Antagonist',       uses:'Alcohol/opioid use disorder',                           neuroConsiderations:'Generally compatible; may affect reward circuitry response to neurofeedback',          seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Prazosin',                        class:'Alpha-1 Blocker',         uses:'PTSD nightmares, hypertension',                         neuroConsiderations:'May cause orthostatic hypotension; note before tDCS',                                 seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Propranolol',                     class:'Beta Blocker',            uses:'Performance anxiety, PTSD, tremor',                     neuroConsiderations:'May blunt HR response; EEG alpha changes possible',                                   seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Clonidine',                       class:'Alpha-2 Agonist',         uses:'ADHD, PTSD, anxiety',                                   neuroConsiderations:'Sedating; may affect neurofeedback alertness; EEG theta increase possible',           seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Topiramate (Topamax)',            class:'Anticonvulsant',          uses:'Epilepsy, migraine, weight management',                  neuroConsiderations:'AED — raises seizure threshold; cognitive side effects may affect assessments',        seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Gabapentin (Neurontin)',          class:'Anticonvulsant/Analgesic',uses:'Neuropathic pain, anxiety, epilepsy',                   neuroConsiderations:'May increase delta/theta on EEG; generally compatible with TMS',                      seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Pregabalin (Lyrica)',             class:'Anticonvulsant/Analgesic',uses:'Neuropathic pain, GAD, fibromyalgia',                   neuroConsiderations:'Similar to gabapentin; anxiolytic properties; compatible with neuromodulation',       seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Memantine (Namenda)',             class:'NMDA Antagonist',         uses:'Alzheimer disease, treatment-augmentation',              neuroConsiderations:'NMDA antagonism may interact with tDCS glutamatergic mechanisms',                     seizureRisk:'low',          cnsStimRisk:'low' },
    { name:'Modafinil (Provigil)',            class:'Wakefulness Agent',       uses:'Narcolepsy, shift work, cognitive enhancement',         neuroConsiderations:'May enhance alertness for neurofeedback; document timing',                            seizureRisk:'low',          cnsStimRisk:'moderate' },
    { name:'N-Acetylcysteine (NAC)',          class:'Supplement/Glutamate Mod',uses:'OCD, addiction, depression augmentation',               neuroConsiderations:'Glutamate modulation may interact with tDCS effects; generally benign',               seizureRisk:'low',          cnsStimRisk:'low' },
  ];

  const MODALITIES = ['TMS', 'tDCS', 'Neurofeedback', 'EEG Biofeedback', 'PEMF', 'HEG'];

  // ── LocalStorage helpers ────────────────────────────────────────────────────
  function _lsGet(key, def = null) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  }
  function _lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }

  // Seed patients if none
  if (!localStorage.getItem('ds_patients')) {
    _lsSet('ds_patients', [
      { id:'pt-001', name:'Alex Johnson', dob:'1985-03-12', condition:'MDD' },
      { id:'pt-002', name:'Morgan Lee',   dob:'1992-07-24', condition:'PTSD + ADHD' },
      { id:'pt-003', name:'Jordan Smith', dob:'1978-11-05', condition:'Bipolar I' },
    ]);
  }

  // Seed patient medications if none
  if (!localStorage.getItem('ds_patient_medications')) {
    _lsSet('ds_patient_medications', [
      { patientId:'pt-001', meds:[
        { id:'m1', name:'Sertraline', dose:'100mg', frequency:'Daily', prescriber:'Dr. Patel', startDate:'2024-01-15' },
        { id:'m2', name:'Bupropion',  dose:'300mg', frequency:'Daily', prescriber:'Dr. Patel', startDate:'2024-03-01' },
      ]},
      { patientId:'pt-002', meds:[
        { id:'m3', name:'Methylphenidate', dose:'20mg', frequency:'BID', prescriber:'Dr. Kim', startDate:'2023-09-10' },
        { id:'m4', name:'Lorazepam',       dose:'0.5mg', frequency:'PRN', prescriber:'Dr. Kim', startDate:'2024-02-20' },
      ]},
      { patientId:'pt-003', meds:[
        { id:'m5', name:'Lithium',     dose:'600mg', frequency:'BID', prescriber:'Dr. Nguyen', startDate:'2022-05-01' },
        { id:'m6', name:'Quetiapine',  dose:'200mg', frequency:'QHS', prescriber:'Dr. Nguyen', startDate:'2023-01-18' },
        { id:'m7', name:'Lorazepam',   dose:'1mg',   frequency:'PRN', prescriber:'Dr. Nguyen', startDate:'2024-06-10' },
      ]},
    ]);
  }

  if (!localStorage.getItem('ds_interaction_alerts')) _lsSet('ds_interaction_alerts', []);
  if (!localStorage.getItem('ds_interaction_checks')) _lsSet('ds_interaction_checks', []);

  // ── Interaction engine ──────────────────────────────────────────────────────
  function _resolveClasses(drugName) {
    const lower = drugName.toLowerCase().trim();
    const classes = new Set();
    classes.add(lower);
    for (const [cls, names] of Object.entries(DRUG_CLASS_MAP)) {
      if (names.some(n => lower.includes(n) || n.includes(lower))) classes.add(cls);
    }
    return classes;
  }

  function _runInteractionCheck(meds) {
    const results = [];
    const medList = meds.filter(m => m.name && m.name.trim());

    // Drug-Drug
    for (let i = 0; i < medList.length; i++) {
      for (let j = i + 1; j < medList.length; j++) {
        const classesA = _resolveClasses(medList[i].name);
        const classesB = _resolveClasses(medList[j].name);
        for (const rule of INTERACTION_RULES) {
          if (!rule.drugs) continue;
          const [r1, r2] = rule.drugs;
          const matchFwd = classesA.has(r1) && classesB.has(r2);
          const matchRev = classesA.has(r2) && classesB.has(r1);
          if (matchFwd || matchRev) {
            // Avoid duplicates
            const key = [medList[i].name, medList[j].name, rule.mechanism].join('|');
            if (!results.some(r => r._key === key)) {
              results.push({ _key: key, type:'drug-drug', drugA: medList[i].name, drugB: medList[j].name, severity: rule.severity, mechanism: rule.mechanism, recommendation: rule.recommendation, id: 'int-' + Math.random().toString(36).slice(2), acknowledged: false, flagged: false });
            }
          }
        }
      }
    }

    // Drug-Modality
    for (const med of medList) {
      const classes = _resolveClasses(med.name);
      for (const rule of INTERACTION_RULES) {
        if (!rule.modality) continue;
        if (classes.has(rule.drug)) {
          const key = [med.name, rule.modality, rule.mechanism].join('|');
          if (!results.some(r => r._key === key)) {
            results.push({ _key: key, type:'drug-modality', drugA: med.name, drugB: rule.modality, severity: rule.severity, mechanism: rule.mechanism, recommendation: rule.recommendation, id: 'int-' + Math.random().toString(36).slice(2), acknowledged: false, flagged: false });
          }
        }
      }
    }

    // Sort by severity weight
    const sevWeight = { contraindicated:0, hold:1, major:2, moderate:3, caution:4, note:5 };
    results.sort((a,b) => (sevWeight[a.severity]??9) - (sevWeight[b.severity]??9));
    return results;
  }

  function _modalitySafetyCheck(meds) {
    const modResults = {};
    for (const mod of MODALITIES) {
      modResults[mod] = { status:'go', items:[] };
    }
    for (const med of meds.filter(m => m.name && m.name.trim())) {
      const classes = _resolveClasses(med.name);
      for (const rule of INTERACTION_RULES) {
        if (!rule.modality) continue;
        if (classes.has(rule.drug)) {
          const modKey = MODALITIES.find(m => m.toLowerCase() === rule.modality.toLowerCase()) || rule.modality;
          if (!modResults[modKey]) modResults[modKey] = { status:'go', items:[] };
          modResults[modKey].items.push({ drug: med.name, severity: rule.severity, mechanism: rule.mechanism, recommendation: rule.recommendation });
          const cur = modResults[modKey].status;
          const sev = rule.severity;
          if (sev === 'hold' || sev === 'contraindicated') modResults[modKey].status = 'hold';
          else if ((sev === 'caution' || sev === 'major' || sev === 'moderate') && cur !== 'hold') modResults[modKey].status = 'caution';
          else if (sev === 'note' && cur === 'go') modResults[modKey].status = 'go';
        }
      }
    }
    return modResults;
  }

  // ── Render helpers ──────────────────────────────────────────────────────────
  function _severityBadge(sev) {
    return `<span class="qqq-badge qqq-badge-${sev}">${sev}</span>`;
  }

  function _renderInteractionResults(interactions, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!interactions || interactions.length === 0) {
      el.innerHTML = `<div class="qqq-empty"><div class="qqq-empty-icon">✓</div><p>No interactions found for current medication list.</p></div>`;
      return;
    }
    const counts = { contraindicated:0, hold:0, major:0, moderate:0, caution:0, note:0 };
    interactions.forEach(i => { if (counts[i.severity] !== undefined) counts[i.severity]++; });
    const summaryItems = [
      { label:'Contraindicated', key:'contraindicated', color:'#f87171' },
      { label:'Hold',            key:'hold',            color:'#f87171' },
      { label:'Major',           key:'major',           color:'#fb923c' },
      { label:'Moderate',        key:'moderate',        color:'#fbbf24' },
      { label:'Caution',         key:'caution',         color:'#fde047' },
      { label:'Note',            key:'note',            color:'#60a5fa' },
    ].filter(s => counts[s.key] > 0);

    const summaryHtml = `<div class="qqq-severity-summary">${summaryItems.map(s =>
      `<div class="qqq-summary-item"><span class="qqq-summary-count" style="color:${s.color}">${counts[s.key]}</span><span style="color:var(--text-muted);font-size:12px">${s.label}</span></div>`
    ).join('<span style="color:var(--border);align-self:center">·</span>')}</div>`;

    const cardsHtml = interactions.map(int => `
      <div class="qqq-interaction-card qqq-severity-${int.severity}${int.acknowledged ? ' acknowledged' : ''}" id="intcard-${int.id}">
        <div class="qqq-card-header">
          <span class="qqq-drug-pair">${int.drugA} ↔ ${int.drugB}</span>
          ${_severityBadge(int.severity)}
          ${int.type === 'drug-modality' ? '<span style="font-size:11px;color:var(--text-muted);background:var(--hover-bg);padding:2px 7px;border-radius:10px">Drug-Modality</span>' : ''}
          ${int.flagged ? '<span style="font-size:11px;color:#fbbf24">⚑ Flagged</span>' : ''}
          ${int.acknowledged ? '<span style="font-size:11px;color:var(--text-muted)">✓ Acknowledged</span>' : ''}
        </div>
        <div class="qqq-mechanism"><strong>Mechanism:</strong> ${int.mechanism}</div>
        <div class="qqq-recommendation">💡 ${int.recommendation}</div>
        <div class="qqq-card-actions">
          ${!int.flagged ? `<button class="qqq-btn-sm flag" onclick="window._micFlagInteraction('${int.id}')">⚑ Flag for Prescriber</button>` : ''}
          ${!int.acknowledged ? `<button class="qqq-btn-sm" onclick="window._micAcknowledge('${int.id}')">✓ Acknowledge</button>` : ''}
        </div>
      </div>`).join('');

    el.innerHTML = summaryHtml + cardsHtml;
  }

  function _renderModalitySafety(modResults, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const icons = { TMS:'⚡', tDCS:'🔋', Neurofeedback:'🧠', 'EEG Biofeedback':'📡', PEMF:'🌀', HEG:'💡' };
    el.innerHTML = MODALITIES.map(mod => {
      const r = modResults[mod] || { status:'go', items:[] };
      const statusClass = `qqq-status-${r.status}`;
      const pillClass = `qqq-status-pill-${r.status}`;
      const pillLabel = r.status === 'go' ? '✓ Go' : r.status === 'caution' ? '⚠ Caution' : '✕ Hold';
      const reasoning = r.items.length
        ? r.items.map(it => `<div style="margin-top:5px;padding:5px 8px;background:var(--hover-bg);border-radius:6px;font-size:12px"><strong>${it.drug}:</strong> ${it.mechanism} — <em>${it.recommendation}</em></div>`).join('')
        : '<span style="font-size:12px;color:var(--text-muted)">No relevant drug interactions found for this modality.</span>';
      return `
        <div class="qqq-modality-status ${statusClass}">
          <div class="qqq-modality-icon">${icons[mod] || '◉'}</div>
          <div class="qqq-modality-body">
            <div class="qqq-modality-name">${mod} <span class="qqq-status-pill ${pillClass}">${pillLabel}</span></div>
            <div class="qqq-modality-reasoning">${reasoning}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ── Patients list ───────────────────────────────────────────────────────────
  const patients = _lsGet('ds_patients', []);
  const firstPt = patients[0]?.id || '';

  // ── Build page HTML ─────────────────────────────────────────────────────────
  document.getElementById('app-content').innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:0 4px">
      <div class="qqq-tabs" role="tablist" aria-label="Medication Interaction Checker tabs">
        <button class="qqq-tab-btn active" role="tab" aria-selected="true"  aria-controls="qqq-panel-0" id="qqq-tab-0" onclick="window._micTab(0)">Patient Review</button>
        <button class="qqq-tab-btn"        role="tab" aria-selected="false" aria-controls="qqq-panel-1" id="qqq-tab-1" onclick="window._micTab(1)">Protocol Safety</button>
        <button class="qqq-tab-btn"        role="tab" aria-selected="false" aria-controls="qqq-panel-2" id="qqq-tab-2" onclick="window._micTab(2)">Drug Database</button>
        <button class="qqq-tab-btn"        role="tab" aria-selected="false" aria-controls="qqq-panel-3" id="qqq-tab-3" onclick="window._micTab(3)">Interaction Log</button>
      </div>

      <!-- Tab 1: Patient Medication Review -->
      <div class="qqq-tab-panel active" id="qqq-panel-0" role="tabpanel" aria-labelledby="qqq-tab-0">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Patient</label>
            <select id="mic-patient-sel" onchange="window._micSelectPatient(this.value)"
              style="padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px;min-width:200px">
              ${patients.map(p => `<option value="${p.id}">${p.name}${p.condition ? ' — ' + p.condition : ''}</option>`).join('')}
            </select>
          </div>
          <button class="btn-primary" style="font-size:12.5px;padding:7px 16px" onclick="window._micRunCheck()">▶ Run Interaction Check</button>
          <button class="btn-secondary" style="font-size:12.5px;padding:7px 16px" onclick="window._micAddMedRow()">+ Add Medication</button>
        </div>
        <div id="mic-med-section">
          <!-- medication list rendered here -->
        </div>
        <div id="mic-results-section" style="margin-top:20px"></div>
      </div>

      <!-- Tab 2: Protocol Safety Screen -->
      <div class="qqq-tab-panel" id="qqq-panel-1" role="tabpanel" aria-labelledby="qqq-tab-1">
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:20px">
          <div>
            <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Patient</label>
            <select id="mic-safety-patient" onchange="window._micRenderSafety(this.value)"
              style="padding:7px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px;min-width:200px">
              ${patients.map(p => `<option value="${p.id}">${p.name}${p.condition ? ' — ' + p.condition : ''}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="mic-safety-results"></div>
      </div>

      <!-- Tab 3: Drug Database -->
      <div class="qqq-tab-panel" id="qqq-panel-2" role="tabpanel" aria-labelledby="qqq-tab-2">
        <div class="qqq-filter-row">
          <input id="mic-drug-search" type="search" placeholder="Search drug name or class…" oninput="window._micFilterDrugs()" />
          <select id="mic-drug-class-filter" onchange="window._micFilterDrugs()"
            style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px">
            <option value="">All Classes</option>
            ${[...new Set(DRUG_DB.map(d => d.class))].sort().map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div style="overflow-x:auto">
          <table class="qqq-drug-table" id="mic-drug-table">
            <thead>
              <tr>
                <th>Drug Name</th><th>Class</th><th>Common Uses</th>
                <th>Neuromodulation Considerations</th><th>Seizure Risk</th><th>CNS Stim Risk</th>
              </tr>
            </thead>
            <tbody id="mic-drug-tbody"></tbody>
          </table>
        </div>
        <div id="mic-drug-detail"></div>
      </div>

      <!-- Tab 4: Interaction Log -->
      <div class="qqq-tab-panel" id="qqq-panel-3" role="tabpanel" aria-labelledby="qqq-tab-3">
        <div class="qqq-filter-row">
          <select id="mic-log-sev" onchange="window._micRenderLog()"
            style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px">
            <option value="">All Severities</option>
            <option value="contraindicated">Contraindicated</option>
            <option value="hold">Hold</option>
            <option value="major">Major</option>
            <option value="moderate">Moderate</option>
            <option value="caution">Caution</option>
            <option value="note">Note</option>
          </select>
          <select id="mic-log-patient" onchange="window._micRenderLog()"
            style="padding:6px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text);font-size:13px">
            <option value="">All Patients</option>
            ${patients.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
          <button class="qqq-btn-sm primary" onclick="window._micExportCSV()">⬇ Export CSV</button>
        </div>
        <div id="mic-log-content"></div>
      </div>
    </div>`;

  // ── State ───────────────────────────────────────────────────────────────────
  let _currentPatientId = firstPt;
  let _currentInteractions = [];
  let _drugDbFiltered = [...DRUG_DB];

  // ── Tab switching ───────────────────────────────────────────────────────────
  window._micTab = function(idx) {
    document.querySelectorAll('.qqq-tab-btn').forEach((b, i) => {
      b.classList.toggle('active', i === idx);
      b.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    document.querySelectorAll('.qqq-tab-panel').forEach((p, i) => p.classList.toggle('active', i === idx));
    if (idx === 1) window._micRenderSafety(document.getElementById('mic-safety-patient')?.value || firstPt);
    if (idx === 2) window._micFilterDrugs();
    if (idx === 3) window._micRenderLog();
  };

  // ── Render medication list ──────────────────────────────────────────────────
  function _renderMedList(patientId) {
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === patientId) || { patientId, meds:[] };
    const sec = document.getElementById('mic-med-section');
    if (!sec) return;
    if (entry.meds.length === 0) {
      sec.innerHTML = `<div style="color:var(--text-muted);font-size:13px;padding:12px 0">No medications on file. Click <strong>+ Add Medication</strong> to begin.</div>`;
      return;
    }
    sec.innerHTML = `
      <div class="qqq-med-row-header">
        <span>Drug Name</span><span>Dose</span><span>Frequency</span><span>Prescriber</span><span>Start Date</span><span></span>
      </div>
      ${entry.meds.map(m => `
        <div class="qqq-med-row" id="medrow-${m.id}">
          <input type="text"  value="${m.name}"      onchange="window._micUpdateMed('${patientId}','${m.id}','name',this.value)"      placeholder="Drug name" />
          <input type="text"  value="${m.dose}"      onchange="window._micUpdateMed('${patientId}','${m.id}','dose',this.value)"      placeholder="e.g. 100mg" />
          <input type="text"  value="${m.frequency}" onchange="window._micUpdateMed('${patientId}','${m.id}','frequency',this.value)" placeholder="e.g. Daily" />
          <input type="text"  value="${m.prescriber}"onchange="window._micUpdateMed('${patientId}','${m.id}','prescriber',this.value)"placeholder="Prescriber" />
          <input type="date"  value="${m.startDate}" onchange="window._micUpdateMed('${patientId}','${m.id}','startDate',this.value)" />
          <button class="qqq-btn-sm danger" onclick="window._micDeleteMed('${patientId}','${m.id}')">✕</button>
        </div>`).join('')}`;
  }

  // ── Select patient ──────────────────────────────────────────────────────────
  window._micSelectPatient = function(pid) {
    _currentPatientId = pid;
    _currentInteractions = [];
    document.getElementById('mic-results-section').innerHTML = '';
    _renderMedList(pid);
  };

  // ── Add medication row ──────────────────────────────────────────────────────
  window._micAddMedRow = function() {
    const allMeds = _lsGet('ds_patient_medications', []);
    let entry = allMeds.find(e => e.patientId === _currentPatientId);
    if (!entry) { entry = { patientId: _currentPatientId, meds:[] }; allMeds.push(entry); }
    const newMed = { id: 'm' + Date.now(), name:'', dose:'', frequency:'', prescriber:'', startDate: new Date().toISOString().slice(0,10) };
    entry.meds.push(newMed);
    _lsSet('ds_patient_medications', allMeds);
    _renderMedList(_currentPatientId);
    // Focus first input of new row
    const row = document.getElementById(`medrow-${newMed.id}`);
    if (row) row.querySelector('input')?.focus();
  };

  // ── Update med field ────────────────────────────────────────────────────────
  window._micUpdateMed = function(pid, medId, field, value) {
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === pid);
    if (!entry) return;
    const med = entry.meds.find(m => m.id === medId);
    if (!med) return;
    med[field] = value;
    _lsSet('ds_patient_medications', allMeds);
  };

  // ── Delete medication ───────────────────────────────────────────────────────
  window._micDeleteMed = function(pid, medId) {
    if (!confirm('Remove this medication?')) return;
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === pid);
    if (!entry) return;
    entry.meds = entry.meds.filter(m => m.id !== medId);
    _lsSet('ds_patient_medications', allMeds);
    _renderMedList(pid);
  };

  // ── Run interaction check ───────────────────────────────────────────────────
  window._micRunCheck = function() {
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === _currentPatientId) || { meds:[] };
    const meds = entry.meds.filter(m => m.name && m.name.trim());
    if (meds.length === 0) {
      document.getElementById('mic-results-section').innerHTML =
        `<div class="qqq-empty"><div class="qqq-empty-icon">ℹ</div><p>Add medications above, then run the check.</p></div>`;
      return;
    }
    _currentInteractions = _runInteractionCheck(meds);

    // Save to log
    const pt = patients.find(p => p.id === _currentPatientId);
    const checks = _lsGet('ds_interaction_checks', []);
    checks.unshift({ id:'chk-'+Date.now(), patientId: _currentPatientId, patientName: pt?.name || _currentPatientId, date: new Date().toISOString(), medications: meds.map(m => m.name), interactionCount: _currentInteractions.length, severities: [...new Set(_currentInteractions.map(i => i.severity))] });
    if (checks.length > 200) checks.splice(200);
    _lsSet('ds_interaction_checks', checks);

    const sec = document.getElementById('mic-results-section');
    sec.innerHTML = `<h3 style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px">Interaction Results — ${pt?.name || ''}</h3><div id="mic-int-cards"></div>`;
    _renderInteractionResults(_currentInteractions, 'mic-int-cards');
  };

  // ── Flag interaction ────────────────────────────────────────────────────────
  window._micFlagInteraction = function(intId) {
    const int = _currentInteractions.find(i => i.id === intId);
    if (!int) return;
    int.flagged = true;
    const alerts = _lsGet('ds_interaction_alerts', []);
    const pt = patients.find(p => p.id === _currentPatientId);
    alerts.push({ id: 'alrt-'+Date.now(), interactionId: intId, patientId: _currentPatientId, patientName: pt?.name || '', drugA: int.drugA, drugB: int.drugB, severity: int.severity, mechanism: int.mechanism, recommendation: int.recommendation, date: new Date().toISOString() });
    _lsSet('ds_interaction_alerts', alerts);
    _renderInteractionResults(_currentInteractions, 'mic-int-cards');
  };

  // ── Acknowledge interaction ─────────────────────────────────────────────────
  window._micAcknowledge = function(intId) {
    const int = _currentInteractions.find(i => i.id === intId);
    if (!int) return;
    int.acknowledged = true;
    _renderInteractionResults(_currentInteractions, 'mic-int-cards');
  };

  // ── Protocol safety render ──────────────────────────────────────────────────
  window._micRenderSafety = function(pid) {
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === pid) || { meds:[] };
    const meds = entry.meds.filter(m => m.name && m.name.trim());
    const pt = patients.find(p => p.id === pid);
    const modResults = _modalitySafetyCheck(meds);
    const container = document.getElementById('mic-safety-results');
    if (!container) return;
    const medSummary = meds.length
      ? meds.map(m => `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:var(--hover-bg);font-size:12px;margin:2px">${m.name}${m.dose ? ' '+m.dose : ''}</span>`).join(' ')
      : '<span style="color:var(--text-muted);font-size:13px">No medications recorded</span>';
    container.innerHTML = `
      <div style="margin-bottom:16px;padding:12px 16px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px">
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;font-weight:600">Current Medications — ${pt?.name || pid}</div>
        <div>${medSummary}</div>
      </div>
      <div id="mic-safety-modalities"></div>`;
    _renderModalitySafety(modResults, 'mic-safety-modalities');
  };

  // ── Drug DB filter + render ─────────────────────────────────────────────────
  window._micFilterDrugs = function() {
    const q = (document.getElementById('mic-drug-search')?.value || '').toLowerCase();
    const cls = document.getElementById('mic-drug-class-filter')?.value || '';
    _drugDbFiltered = DRUG_DB.filter(d =>
      (!q || d.name.toLowerCase().includes(q) || d.class.toLowerCase().includes(q) || d.uses.toLowerCase().includes(q)) &&
      (!cls || d.class === cls)
    );
    const tbody = document.getElementById('mic-drug-tbody');
    if (!tbody) return;
    if (_drugDbFiltered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No drugs match your search.</td></tr>`;
      return;
    }
    const riskClass = r => {
      if (r === 'high') return 'qqq-risk-high';
      if (r === 'moderate') return 'qqq-risk-moderate';
      if (r === 'low-moderate') return 'qqq-risk-low-moderate';
      return 'qqq-risk-low';
    };
    tbody.innerHTML = _drugDbFiltered.map((d, i) => `
      <tr onclick="window._micShowDrugDetail(${i})" data-idx="${i}">
        <td><strong>${d.name}</strong></td>
        <td>${d.class}</td>
        <td style="max-width:200px">${d.uses}</td>
        <td style="max-width:260px">${d.neuroConsiderations}</td>
        <td class="${riskClass(d.seizureRisk)}">${d.seizureRisk}</td>
        <td class="${riskClass(d.cnsStimRisk)}">${d.cnsStimRisk}</td>
      </tr>`).join('');
    document.getElementById('mic-drug-detail').innerHTML = '';
  };

  window._micShowDrugDetail = function(filteredIdx) {
    const d = _drugDbFiltered[filteredIdx];
    if (!d) return;
    // Highlight row
    document.querySelectorAll('#mic-drug-tbody tr').forEach((tr, i) => tr.classList.toggle('selected', i === filteredIdx));
    const riskLabel = r => ({ high:'High', moderate:'Moderate', 'low-moderate':'Low-Moderate', low:'Low' }[r] || r);
    const riskColor = r => ({ high:'#f87171', moderate:'#fb923c', 'low-moderate':'#fbbf24', low:'#2dd4bf' }[r] || 'var(--text)');
    document.getElementById('mic-drug-detail').innerHTML = `
      <div class="qqq-drug-detail">
        <h3>${d.name}</h3>
        <div class="qqq-detail-class">${d.class}</div>
        <div class="qqq-detail-grid">
          <div class="qqq-detail-field"><label>Common Uses</label><p>${d.uses}</p></div>
          <div class="qqq-detail-field"><label>Neuromodulation Considerations</label><p>${d.neuroConsiderations}</p></div>
          <div class="qqq-detail-field"><label>Seizure Risk</label><p style="color:${riskColor(d.seizureRisk)};font-weight:600">${riskLabel(d.seizureRisk)}</p></div>
          <div class="qqq-detail-field"><label>CNS Stimulation Risk</label><p style="color:${riskColor(d.cnsStimRisk)};font-weight:600">${riskLabel(d.cnsStimRisk)}</p></div>
        </div>
        <div style="margin-top:14px">
          <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;font-weight:600;display:block;margin-bottom:8px">Related Interactions</label>
          ${(() => {
            const related = INTERACTION_RULES.filter(r => {
              const classes = _resolveClasses(d.name);
              if (r.drugs) return r.drugs.some(dr => classes.has(dr));
              if (r.drug)  return classes.has(r.drug);
              return false;
            });
            return related.length
              ? related.map(r => `<div style="margin-bottom:8px;padding:8px 10px;background:var(--hover-bg);border-radius:8px;font-size:12.5px">
                  <span class="qqq-badge qqq-badge-${r.severity}" style="margin-right:6px">${r.severity}</span>
                  <strong>${r.drugs ? r.drugs.join(' + ') : r.drug + ' ↔ ' + r.modality}:</strong> ${r.mechanism}
                </div>`).join('')
              : '<p style="font-size:13px;color:var(--text-muted)">No specific rules in current database.</p>';
          })()}
        </div>
      </div>`;
  };

  // ── Interaction log render ──────────────────────────────────────────────────
  window._micRenderLog = function() {
    const sev = document.getElementById('mic-log-sev')?.value || '';
    const ptFilter = document.getElementById('mic-log-patient')?.value || '';
    let checks = _lsGet('ds_interaction_checks', []);
    if (sev) checks = checks.filter(c => c.severities && c.severities.includes(sev));
    if (ptFilter) checks = checks.filter(c => c.patientId === ptFilter);
    const container = document.getElementById('mic-log-content');
    if (!container) return;
    if (checks.length === 0) {
      container.innerHTML = `<div class="qqq-empty"><div class="qqq-empty-icon">📋</div><p>No interaction checks recorded yet.</p></div>`;
      return;
    }
    const sevWeight = { contraindicated:0, hold:1, major:2, moderate:3, caution:4, note:5 };
    const sevColor = { contraindicated:'#f87171', hold:'#f87171', major:'#fb923c', moderate:'#fbbf24', caution:'#fde047', note:'#60a5fa' };
    container.innerHTML = `
      <div style="overflow-x:auto">
        <table class="qqq-log-table">
          <thead><tr><th>Date</th><th>Patient</th><th>Medications Checked</th><th>Interactions</th><th>Severities</th></tr></thead>
          <tbody>
            ${checks.map(c => {
              const worstSev = (c.severities || []).sort((a,b) => (sevWeight[a]??9)-(sevWeight[b]??9))[0] || '';
              const dateStr = new Date(c.date).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
              return `<tr>
                <td style="white-space:nowrap;font-size:12px">${dateStr}</td>
                <td><strong>${c.patientName || c.patientId}</strong></td>
                <td style="font-size:12px;max-width:240px">${(c.medications||[]).join(', ')}</td>
                <td style="text-align:center"><strong style="color:${c.interactionCount > 0 ? '#fb923c' : '#2dd4bf'}">${c.interactionCount}</strong></td>
                <td>${(c.severities||[]).sort((a,b)=>(sevWeight[a]??9)-(sevWeight[b]??9)).map(s => `<span class="qqq-badge qqq-badge-${s}" style="margin-right:3px">${s}</span>`).join('')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  };

  // ── Export CSV ──────────────────────────────────────────────────────────────
  window._micExportCSV = function() {
    const checks = _lsGet('ds_interaction_checks', []);
    if (checks.length === 0) { _dsToast('No interaction log entries to export yet.', 'info'); return; }
    const rows = [['Date','Patient','Medications','Interaction Count','Severities'].join(',')];
    checks.forEach(c => {
      rows.push([
        new Date(c.date).toISOString(),
        `"${(c.patientName || c.patientId).replace(/"/g,'""')}"`,
        `"${(c.medications||[]).join('; ').replace(/"/g,'""')}"`,
        c.interactionCount,
        `"${(c.severities||[]).join('; ')}"`,
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `interaction-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Print safety screen ─────────────────────────────────────────────────────
  window._micPrintSafety = function() {
    const pid = document.getElementById('mic-safety-patient')?.value || _currentPatientId;
    const allMeds = _lsGet('ds_patient_medications', []);
    const entry = allMeds.find(e => e.patientId === pid) || { meds:[] };
    const meds = entry.meds.filter(m => m.name && m.name.trim());
    const pt = patients.find(p => p.id === pid);
    const modResults = _modalitySafetyCheck(meds);
    const icons = { TMS:'⚡', tDCS:'🔋', Neurofeedback:'🧠', 'EEG Biofeedback':'📡', PEMF:'🌀', HEG:'💡' };
    const rows = MODALITIES.map(mod => {
      const r = modResults[mod] || { status:'go', items:[] };
      const statusLabel = r.status === 'go' ? '✓ Go' : r.status === 'caution' ? '⚠ Caution' : '✕ Hold';
      const notes = r.items.map(it => `${it.drug}: ${it.mechanism}`).join('; ') || 'No interactions found';
      return `<tr><td>${icons[mod]||''} ${mod}</td><td><strong>${statusLabel}</strong></td><td style="font-size:11px">${notes}</td></tr>`;
    }).join('');
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<!DOCTYPE html><html><head><title>Protocol Safety Screen</title><style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#111}
      h2{margin-bottom:4px}p.sub{color:#555;font-size:13px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #ccc;padding:8px 10px;text-align:left}
      th{background:#f4f4f4;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
      @media print{button{display:none}}
    </style></head><body>
      <h2>Protocol Safety Screen</h2>
      <p class="sub">Patient: <strong>${pt?.name || pid}</strong> &nbsp;|&nbsp; Date: ${new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})}</p>
      <p class="sub">Medications: ${meds.map(m => m.name + (m.dose?' '+m.dose:'')).join(', ') || '(none recorded)'}</p>
      <table><thead><tr><th>Modality</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="font-size:11px;color:#888;margin-top:16px">Generated by DeepSynaps Protocol Studio — for clinical review only, not a substitute for professional judgement.</p>
      <button onclick="window.print()" style="margin-top:12px;padding:8px 18px;font-size:13px">🖨 Print</button>
    </body></html>`);
    w.document.close();
  };

  // ── Initial render ──────────────────────────────────────────────────────────
  if (firstPt) {
    _renderMedList(firstPt);
    window._micRenderSafety(firstPt);
  }
  window._micFilterDrugs();
  window._micRenderLog();
}

// =============================================================================
// pgFormsBuilder — Dynamic Forms & Assessments Builder
// =============================================================================
export async function pgFormsBuilder(setTopbar) {
  setTopbar('Forms & Assessments', `<button class="btn btn-sm btn-primary" onclick="window._fbNewForm()">+ New Form</button><button class="btn btn-sm" onclick="window._fbExportCSV()" style="margin-left:6px">Export CSV</button>`);

  const VALIDATED_SCALES = [
    { id:'phq9', name:'PHQ-9', category:'Screening', locked:true, maxScore:27, description:'Patient Health Questionnaire — depression severity screening.', bands:[{max:4,label:'Minimal'},{max:9,label:'Mild'},{max:14,label:'Moderate'},{max:19,label:'Moderately Severe'},{max:27,label:'Severe'}], items:['Little interest or pleasure in doing things','Feeling down, depressed, or hopeless','Trouble falling or staying asleep, or sleeping too much','Feeling tired or having little energy','Poor appetite or overeating','Feeling bad about yourself or that you are a failure','Trouble concentrating on things','Moving or speaking so slowly that other people could have noticed','Thoughts that you would be better off dead, or of hurting yourself'] },
    { id:'gad7', name:'GAD-7', category:'Screening', locked:true, maxScore:21, description:'Generalised Anxiety Disorder 7-item scale.', bands:[{max:4,label:'Minimal'},{max:9,label:'Mild'},{max:14,label:'Moderate'},{max:21,label:'Severe'}], items:['Feeling nervous, anxious, or on edge','Not being able to stop or control worrying','Worrying too much about different things','Trouble relaxing','Being so restless that it is hard to sit still','Becoming easily annoyed or irritable','Feeling afraid, as if something awful might happen'] },
    { id:'vanderbilt', name:'Vanderbilt ADHD (Parent)', category:'Screening', locked:true, maxScore:null, description:'Vanderbilt Assessment Scale — Parent Informant (ADHD).', bands:[], items:['Fails to give attention to details or makes careless mistakes','Has difficulty sustaining attention to tasks or activities','Does not seem to listen when spoken to directly','Does not follow through on instructions and fails to finish schoolwork','Has difficulty organising tasks and activities','Avoids or dislikes tasks requiring sustained mental effort','Loses things necessary for tasks or activities','Is easily distracted by extraneous stimuli','Is forgetful in daily activities','Fidgets with hands or feet or squirms in seat','Leaves seat when remaining seated is expected','Runs about or climbs excessively','Has difficulty playing quietly','Is on the go or acts as if driven by a motor','Talks excessively','Blurts out answers before questions are completed','Has difficulty awaiting turn','Interrupts or intrudes on others','Academic performance: Reading','Academic performance: Mathematics','Academic performance: Written expression','Relationship with parents','Relationship with siblings','Relationship with peers','Participation in organised activities','Overall school performance'] },
    { id:'moca', name:'MoCA (Abbreviated)', category:'Screening', locked:true, maxScore:30, description:'Montreal Cognitive Assessment — abbreviated 10-item version.', bands:[{max:25,label:'Possible Impairment'},{max:30,label:'Normal'}], items:['Visuospatial/Executive — Trail-making task','Visuospatial — Copy cube','Naming — Name 3 animals','Attention — Forward digit span','Attention — Backward digit span','Language — Repeat two sentences','Fluency — Generate words starting with F','Abstraction — Identify similarity between two items','Delayed recall — Remember 5 words','Orientation — State date, month, year, day, place, city'] },
    { id:'pcl5', name:'PCL-5 PTSD Checklist', category:'Screening', locked:true, maxScore:80, description:'PTSD Checklist for DSM-5 — 20 symptom items, 0–4 scale each.', bands:[{max:31,label:'Below Threshold'},{max:80,label:'Probable PTSD'}], items:['Repeated, disturbing, and unwanted memories of the stressful experience','Repeated, disturbing dreams of the stressful experience','Feeling as if the stressful experience were actually happening again','Feeling very upset when something reminded you of the stressful experience','Having strong physical reactions to reminders','Avoiding memories, thoughts, or feelings related to the stressful experience','Avoiding external reminders of the stressful experience','Trouble remembering important parts of the stressful experience','Having strong negative beliefs about yourself, other people, or the world','Blaming yourself or someone else for the stressful experience','Having strong negative feelings such as fear, horror, anger, guilt, or shame','Loss of interest in activities you used to enjoy','Feeling distant or cut off from other people','Trouble experiencing positive feelings','Irritable behavior, angry outbursts, or acting aggressively','Taking too many risks or doing things that could cause you harm','Being superalert or watchful or on guard','Feeling jumpy or easily startled','Having difficulty concentrating','Trouble falling or staying asleep'] },
  ];

  const Q_TYPES = [
    { type:'likert',   label:'Likert Scale',  desc:'0–3 or 1–5 scale' },
    { type:'text',     label:'Short Text',    desc:'Single-line answer' },
    { type:'textarea', label:'Long Text',     desc:'Multi-line answer' },
    { type:'yesno',    label:'Yes / No',      desc:'Binary choice' },
    { type:'slider',   label:'Slider',        desc:'0–10 numeric range' },
    { type:'checkbox', label:'Checkboxes',    desc:'Multi-select options' },
    { type:'date',     label:'Date Picker',   desc:'Calendar date input' },
    { type:'number',   label:'Number',        desc:'Numeric with min/max' },
  ];

  // Storage helpers
  function _fbLoad(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } }
  function _fbSave(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // Seed data on first load
  if (!localStorage.getItem('ds_forms')) {
    const sf = VALIDATED_SCALES.map(s => ({
      id: s.id, name: s.name, description: s.description, category: s.category,
      version: '1.0', locked: true, frequency: 'weekly', autoScore: true,
      scoreFormula: s.maxScore ? 'sum' : '', maxScore: s.maxScore, bands: s.bands,
      notifyThreshold: s.maxScore ? Math.round(s.maxScore * 0.5) : null,
      assignTo: 'all', deployedTo: [], lastModified: '2026-03-10T09:00:00Z',
      questions: s.items.map((text, i) => ({
        id: s.id + '_q' + (i + 1),
        type: (s.id === 'vanderbilt' && i >= 18) ? 'number' : 'likert',
        text, required: true,
        scale: s.id === 'pcl5' ? [0,1,2,3,4] : [0,1,2,3],
        scaleLabels: s.id === 'pcl5' ? ['Not at all','A little bit','Moderately','Quite a bit','Extremely'] : ['Not at all','Several days','More than half the days','Nearly every day'],
        options: null, min: null, max: null,
      })),
    }));
    sf.push(
      { id:'custom_intake_001', name:'Initial Neurofeedback Intake', description:'Baseline intake form for new neurofeedback patients.', category:'Custom', version:'1.2', locked:false, frequency:'one-time', autoScore:false, scoreFormula:'', maxScore:null, bands:[], notifyThreshold:null, assignTo:'all', deployedTo:['pt001','pt002'], lastModified:'2026-04-01T14:22:00Z',
        questions:[
          { id:'ci1', type:'text',     text:'What is your primary reason for seeking neurofeedback treatment?', required:true,  options:null, min:null, max:null },
          { id:'ci2', type:'checkbox', text:'Which of the following symptoms concern you most?', required:false, options:['Anxiety','Depression','Poor sleep','Difficulty concentrating','Memory issues','Chronic pain','Other'], min:null, max:null },
          { id:'ci3', type:'yesno',    text:'Have you previously undergone any brain-based therapy (neurofeedback, TMS, tDCS)?', required:true,  options:null, min:null, max:null },
          { id:'ci4', type:'textarea', text:'Please describe any current medications and dosages:', required:false, options:null, min:null, max:null },
          { id:'ci5', type:'number',   text:'On a scale of 1–10, how would you rate your overall quality of life?', required:true,  options:null, min:1, max:10 },
          { id:'ci6', type:'slider',   text:'Rate your current stress level:', required:true,  options:null, min:0, max:10 },
          { id:'ci7', type:'date',     text:'When did your symptoms first begin?', required:false, options:null, min:null, max:null },
        ] },
      { id:'custom_followup_001', name:'Weekly Progress Check-in', description:'Short weekly follow-up for ongoing treatment patients.', category:'Follow-up', version:'2.0', locked:false, frequency:'weekly', autoScore:true, scoreFormula:'sum', maxScore:30, bands:[{max:10,label:'Stable'},{max:20,label:'Mild Change'},{max:30,label:'Significant Change'}], notifyThreshold:20, assignTo:'all', deployedTo:['pt001','pt003'], lastModified:'2026-04-05T10:00:00Z',
        questions:[
          { id:'fw1', type:'slider',   text:'Rate your overall mood this week (0=Very poor, 10=Excellent):', required:true, options:null, min:0, max:10 },
          { id:'fw2', type:'slider',   text:'Rate your sleep quality this week (0=Very poor, 10=Excellent):', required:true, options:null, min:0, max:10 },
          { id:'fw3', type:'slider',   text:'Rate your concentration/focus this week (0=Very poor, 10=Excellent):', required:true, options:null, min:0, max:10 },
          { id:'fw4', type:'yesno',    text:'Did you experience any side effects from your last session?', required:true, options:null, min:null, max:null },
          { id:'fw5', type:'textarea', text:'Any additional notes or concerns for your clinician:', required:false, options:null, min:null, max:null },
        ] },
      { id:'custom_discharge_001', name:'Discharge and Outcome Summary', description:'End-of-treatment patient-reported outcome measure.', category:'Discharge', version:'1.0', locked:false, frequency:'one-time', autoScore:false, scoreFormula:'', maxScore:null, bands:[], notifyThreshold:null, assignTo:'all', deployedTo:[], lastModified:'2026-04-08T16:45:00Z',
        questions:[
          { id:'dc1', type:'likert',   text:'Overall, how satisfied are you with your treatment outcomes?', required:true, scale:[1,2,3,4,5], scaleLabels:['Very dissatisfied','Dissatisfied','Neutral','Satisfied','Very satisfied'], options:null, min:null, max:null },
          { id:'dc2', type:'likert',   text:'How would you rate the improvement in your primary symptom?', required:true, scale:[1,2,3,4,5], scaleLabels:['No improvement','Slight','Moderate','Good','Full resolution'], options:null, min:null, max:null },
          { id:'dc3', type:'checkbox', text:'Which areas of your life have improved since treatment?', required:false, options:['Sleep','Mood','Focus','Relationships','Work/school performance','Physical wellbeing','Other'], min:null, max:null },
          { id:'dc4', type:'yesno',    text:'Would you recommend this treatment to others?', required:true, options:null, min:null, max:null },
          { id:'dc5', type:'textarea', text:'Please share any final feedback or comments about your experience:', required:false, options:null, min:null, max:null },
        ] }
    );
    _fbSave('ds_forms', sf);
  }
  if (!localStorage.getItem('ds_form_submissions')) {
    const _n = Date.now();
    _fbSave('ds_form_submissions', [
      { id:'sub001', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-7*86400000).toISOString(), score:12, severity:'Moderate', flagged:false, answers:[3,2,1,2,1,1,1,0,1] },
      { id:'sub002', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-14*86400000).toISOString(), score:16, severity:'Moderately Severe', flagged:false, answers:[3,3,2,2,2,1,1,1,1] },
      { id:'sub003', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-21*86400000).toISOString(), score:18, severity:'Moderately Severe', flagged:true, answers:[3,3,2,2,2,2,1,1,2] },
      { id:'sub004', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-28*86400000).toISOString(), score:20, severity:'Severe', flagged:true, answers:[3,3,3,2,2,2,2,1,2] },
      { id:'sub005', formId:'phq9', formName:'PHQ-9', patientId:'pt001', patientName:'Alexis Morgan', date:new Date(_n-35*86400000).toISOString(), score:22, severity:'Severe', flagged:true, answers:[3,3,3,3,2,2,2,2,2] },
      { id:'sub006', formId:'gad7', formName:'GAD-7', patientId:'pt002', patientName:'Jordan Blake', date:new Date(_n-3*86400000).toISOString(), score:8, severity:'Mild', flagged:false, answers:[2,1,1,2,1,0,1] },
      { id:'sub007', formId:'gad7', formName:'GAD-7', patientId:'pt002', patientName:'Jordan Blake', date:new Date(_n-10*86400000).toISOString(), score:11, severity:'Moderate', flagged:false, answers:[2,2,2,1,2,1,1] },
      { id:'sub008', formId:'custom_followup_001', formName:'Weekly Progress Check-in', patientId:'pt003', patientName:'Sam Rivera', date:new Date(_n-2*86400000).toISOString(), score:24, severity:'Significant Change', flagged:false, answers:[8,7,9,'No','Feeling much better this week'] },
    ]);
  }
  if (!localStorage.getItem('ds_form_deployments')) {
    _fbSave('ds_form_deployments', [
      { formId:'phq9', patientId:'pt001', assignedAt:'2026-03-01T10:00:00Z', frequency:'weekly' },
      { formId:'gad7', patientId:'pt002', assignedAt:'2026-03-05T10:00:00Z', frequency:'weekly' },
      { formId:'custom_followup_001', patientId:'pt003', assignedAt:'2026-04-01T09:00:00Z', frequency:'weekly' },
    ]);
  }
  if (!localStorage.getItem('ds_active_form_id')) localStorage.setItem('ds_active_form_id', 'custom_intake_001');

  // Additional validated scales for the Validated Scales tab (beyond what's already in VALIDATED_SCALES)
  const EXTRA_SCALES = [
    { id:'hamd', name:'HAM-D', condition:'Depression', range:'0–52', rater:'Clinician-rated', description:'Hamilton Depression Rating Scale — 17-item clinician-administered gold standard.', maxScore:52, bands:[{max:7,label:'None'},{max:13,label:'Mild'},{max:18,label:'Moderate'},{max:22,label:'Severe'},{max:52,label:'Very Severe'}], items:['Depressed mood (0-4)','Guilt (0-4)','Suicide ideation (0-4)','Early insomnia (0-2)','Middle insomnia (0-2)','Late insomnia (0-2)','Work and activities (0-4)','Retardation (0-4)','Agitation (0-4)','Anxiety — psychic (0-4)','Anxiety — somatic (0-4)','Somatic symptoms GI (0-2)','General somatic symptoms (0-2)','Genital symptoms (0-2)','Hypochondriasis (0-4)','Weight loss (0-2)','Insight (0-2)'], itemMax:[4,4,4,2,2,2,4,4,4,4,4,2,2,2,4,2,2] },
    { id:'madrs', name:'MADRS', condition:'Depression', range:'0–60', rater:'Clinician-rated', description:'Montgomery-Åsberg Depression Rating Scale — sensitive to antidepressant change.', maxScore:60, bands:[{max:6,label:'Normal'},{max:19,label:'Mild'},{max:34,label:'Moderate'},{max:60,label:'Severe'}], items:['Apparent sadness','Reported sadness','Inner tension','Reduced sleep','Reduced appetite','Concentration difficulties','Lassitude','Inability to feel','Pessimistic thoughts','Suicidal thoughts'], itemMax:[6,6,6,6,6,6,6,6,6,6] },
    { id:'bdiii', name:'BDI-II', condition:'Depression', range:'0–63', rater:'Self-report', description:'Beck Depression Inventory — 21-item self-report depression severity.', maxScore:63, bands:[{max:13,label:'Minimal'},{max:19,label:'Mild'},{max:28,label:'Moderate'},{max:63,label:'Severe'}], items:['Sadness','Pessimism','Past failure','Loss of pleasure','Guilty feelings','Punishment feelings','Self-dislike','Self-criticalness','Suicidal thoughts or wishes','Crying','Agitation','Loss of interest','Indecisiveness','Worthlessness','Loss of energy','Changes in sleeping pattern','Irritability','Changes in appetite','Concentration difficulty','Tiredness or fatigue','Loss of interest in sex'], itemMax:Array(21).fill(3) },
    { id:'cdss', name:'CDSS', condition:'Cognitive / Schizophrenia', range:'0–12', rater:'Clinician-rated', description:'Calgary Depression Scale for Schizophrenia — 9-item depression in psychosis.', maxScore:12, bands:[{max:5,label:'Non-depressed'},{max:12,label:'Depressed'}], items:['Depression','Hopelessness','Self-depreciation','Guilty ideas of reference','Pathological guilt','Morning depression','Early wakening','Suicide','Observed depression'], itemMax:Array(9).fill(3) },
    { id:'moca2', name:'MoCA', condition:'Cognitive', range:'0–30', rater:'Clinician-rated', description:'Montreal Cognitive Assessment — full 30-item version for cognitive screening.', maxScore:30, bands:[{max:25,label:'Possible Impairment'},{max:30,label:'Normal'}], items:['Trail-making (alternating)','Copy cube','Draw clock (contour)','Draw clock (numbers)','Draw clock (hands)','Name lion','Name rhinoceros','Name camel','Forward digit span (5-2-1-4-1)','Backward digit span (7-4-2)','Tap for letter A','Serial 7s (93)','Serial 7s (86)','Serial 7s (79)','Serial 7s (72)','Serial 7s (65)','Repeat sentence 1','Repeat sentence 2','Fluency — F words','Abstraction — train/bicycle','Abstraction — watch/ruler','Recall — Face','Recall — Velvet','Recall — Church','Recall — Daisy','Recall — Red','Orientation — date','Orientation — month','Orientation — year','Orientation — day','Orientation — place','Orientation — city'], itemMax:Array(32).fill(1) },
    { id:'briefa', name:'BRIEF-A', condition:'Executive Function', range:'Norm-referenced', rater:'Self/informant', description:'Behavior Rating Inventory of Executive Function — Adult version; T-scores normed against population.', maxScore:null, bands:[], items:['Inhibit — stop actions/impulses','Shift — move between situations','Emotional Control — modulate emotions','Self-Monitor — check own behavior','Initiate — begin tasks','Working Memory — hold information','Plan/Organize — manage future-oriented tasks','Task Monitor — check work','Organization of Materials — keep workspace orderly'], itemMax:Array(9).fill(4) },
  ];

  // Module state
  let _fbTab = 'builder';
  let _fbActiveId = localStorage.getItem('ds_active_form_id') || 'custom_intake_001';

  // Utility
  const _e = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const _fbGetForms  = () => _fbLoad('ds_forms', []);
  const _fbGetSubs   = () => _fbLoad('ds_form_submissions', []);
  const _fbGetForm   = id => _fbGetForms().find(f => f.id === id) || null;
  const _fbSaveForm  = f  => { const fs = _fbGetForms(); const i = fs.findIndex(x => x.id === f.id); if (i >= 0) fs[i] = f; else fs.push(f); _fbSave('ds_forms', fs); };
  const _fbSevClass  = label => { const l = (label || '').toLowerCase(); if (l.includes('minimal') || l.includes('normal') || l.includes('below') || l.includes('stable')) return 'ppp-sev-minimal'; if (l.includes('mild')) return 'ppp-sev-mild'; if (l.includes('moderate')) return 'ppp-sev-moderate'; return 'ppp-sev-severe'; };
  const _fbFmt       = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';

  // Question widget for canvas (disabled, preview)
  function _renderQWidget(q) {
    if (q.type === 'likert') {
      const sc = q.scale || [0,1,2,3], lb = q.scaleLabels || sc.map(String);
      return '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">' + sc.map((v,i) => '<div style="display:flex;flex-direction:column;align-items:center;gap:3px"><input type="radio" name="pw_' + q.id + '" disabled><label style="font-size:9px;color:var(--text-tertiary);max-width:64px;text-align:center">' + _e(lb[i] || String(v)) + '</label></div>').join('') + '</div>';
    }
    if (q.type === 'yesno') return '<div style="display:flex;gap:14px;margin-top:4px"><label style="font-size:12px;color:var(--text-secondary)"><input type="radio" disabled> Yes</label><label style="font-size:12px;color:var(--text-secondary)"><input type="radio" disabled> No</label></div>';
    if (q.type === 'slider') { const m = Math.round(((q.min ?? 0) + (q.max ?? 10)) / 2); return '<div style="display:flex;align-items:center;gap:6px;margin-top:4px"><input type="range" min="' + (q.min ?? 0) + '" max="' + (q.max ?? 10) + '" value="' + m + '" disabled style="flex:1;accent-color:var(--teal)"><span style="font-size:11px;color:var(--text-tertiary)">' + m + '</span></div>'; }
    if (q.type === 'checkbox') return '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">' + (q.options || ['Option 1','Option 2']).map(o => '<label style="font-size:11px;color:var(--text-secondary)"><input type="checkbox" disabled> ' + _e(o) + '</label>').join('') + '</div>';
    if (q.type === 'textarea') return '<textarea class="ppp-preview-input" disabled rows="2" style="margin-top:4px;opacity:0.5;resize:none" placeholder="Patient response\u2026"></textarea>';
    if (q.type === 'number') return '<input type="number" class="ppp-preview-input" disabled style="margin-top:4px;width:120px;opacity:0.5" placeholder="' + (q.min ?? 0) + '\u2013' + (q.max ?? 100) + '">';
    if (q.type === 'date') return '<input type="date" class="ppp-preview-input" disabled style="margin-top:4px;width:180px;opacity:0.5">';
    return '<input type="text" class="ppp-preview-input" disabled style="margin-top:4px;opacity:0.5" placeholder="Patient response\u2026">';
  }

  // Question widget for preview modal (enabled)
  function _renderPreviewWidget(q, idx) {
    const id = 'pfq_' + idx;
    if (q.type === 'likert') {
      const sc = q.scale || [0,1,2,3], lb = q.scaleLabels || sc.map(String);
      return '<div class="ppp-preview-likert-row">' + sc.map((v,i) => '<div class="ppp-preview-likert-opt"><input type="radio" id="' + id + '_' + v + '" name="' + id + '" value="' + v + '"><label for="' + id + '_' + v + '">' + _e(lb[i] || String(v)) + '</label></div>').join('') + '</div>';
    }
    if (q.type === 'yesno') return '<div style="display:flex;gap:20px"><label style="font-size:13px;cursor:pointer"><input type="radio" name="' + id + '" value="yes"> Yes</label><label style="font-size:13px;cursor:pointer"><input type="radio" name="' + id + '" value="no"> No</label></div>';
    if (q.type === 'slider') { const m = Math.round(((q.min ?? 0) + (q.max ?? 10)) / 2); return '<div style="display:flex;align-items:center;gap:10px"><input type="range" id="' + id + '" min="' + (q.min ?? 0) + '" max="' + (q.max ?? 10) + '" value="' + m + '" style="flex:1;accent-color:var(--teal)" oninput="document.getElementById(\'' + id + '_val\').textContent=this.value"><span id="' + id + '_val" style="font-size:14px;font-weight:600;color:var(--teal);min-width:24px">' + m + '</span></div>'; }
    if (q.type === 'checkbox') return '<div style="display:flex;flex-wrap:wrap;gap:8px">' + (q.options || ['Option 1','Option 2']).map(o => '<label style="font-size:12.5px;cursor:pointer"><input type="checkbox" name="' + id + '" value="' + _e(o) + '"> ' + _e(o) + '</label>').join('') + '</div>';
    if (q.type === 'textarea') return '<textarea class="ppp-preview-input" id="' + id + '" rows="3" placeholder="Enter your response\u2026"></textarea>';
    if (q.type === 'number') return '<input type="number" class="ppp-preview-input" id="' + id + '" min="' + (q.min ?? 0) + '" max="' + (q.max ?? 100) + '" style="width:180px">';
    if (q.type === 'date') return '<input type="date" class="ppp-preview-input" id="' + id + '" style="width:200px">';
    return '<input type="text" class="ppp-preview-input" id="' + id + '" placeholder="Enter your response\u2026">';
  }

  // Render question card list
  function _renderQList(questions) {
    if (!questions || !questions.length) {
      return '<div class="ppp-canvas-empty"><svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.2" style="margin-bottom:12px;opacity:0.3"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="13" x2="13" y2="13"/></svg><div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:4px">No questions yet</div><div style="font-size:11.5px">Click "+ Add Question" to begin.</div></div>';
    }
    return questions.map((q, i) => {
      let ex = '';
      if (q.type === 'checkbox') ex += '<button class="ppp-lib-btn" style="flex:none" onclick="window._fbEditOptions(' + i + ')">Edit Options</button>';
      if (q.type === 'likert')   ex += '<button class="ppp-lib-btn" style="flex:none" onclick="window._fbEditScale(' + i + ')">Edit Scale</button>';
      if (q.type === 'number' || q.type === 'slider') ex += '<button class="ppp-lib-btn" style="flex:none" onclick="window._fbEditRange(' + i + ')">Edit Range</button>';
      return '<div class="ppp-canvas-question" data-qidx="' + i + '" data-qid="' + _e(q.id) + '">' +
        '<div class="ppp-drag-handle" data-qidx="' + i + '">\u28BF</div>' +
        '<div class="ppp-q-body">' +
          '<div class="ppp-q-header"><span class="ppp-q-num">' + (i + 1) + '.</span><span class="ppp-type-badge ' + _e(q.type) + '">' + _e(q.type) + '</span>' +
          '<div class="ppp-q-text" contenteditable="true" data-placeholder="Enter question text\u2026" data-qidx="' + i + '" onblur="window._fbEditQText(' + i + ',this.textContent)">' + _e(q.text) + '</div></div>' +
          '<div>' + _renderQWidget(q) + '</div>' +
          '<div class="ppp-q-controls"><button class="ppp-required-toggle ' + (q.required ? 'on' : '') + '" onclick="window._fbToggleRequired(' + i + ')">' + (q.required ? '\u2605 Required' : '\u2606 Optional') + '</button>' + ex +
          '<button class="ppp-q-delete-btn" onclick="window._fbDeleteQ(' + i + ')">&#x2715; Remove</button></div>' +
        '</div></div>';
    }).join('');
  }

  // Library panel HTML
  function _renderLibrary() {
    const fs = _fbGetForms(), vs = fs.filter(f => f.locked), cs = fs.filter(f => !f.locked);
    const vH = vs.map(f =>
      '<div class="ppp-library-item ' + (_fbActiveId === f.id ? 'active' : '') + '" onclick="window._fbOpenForm(\'' + _e(f.id) + '\')">' +
        '<div class="ppp-library-item-name">' + _e(f.name) + '</div>' +
        '<div class="ppp-library-item-meta"><span>' + (f.questions || []).length + ' Q</span>' + (f.maxScore ? '<span>/' + f.maxScore + 'pts</span>' : '') + '<span style="color:var(--amber)">\uD83D\uDD12</span></div>' +
        '<div class="ppp-lib-actions"><button class="ppp-lib-btn" onclick="event.stopPropagation();window._fbUseScale(\'' + _e(f.id) + '\')">Use</button><button class="ppp-lib-btn deploy" onclick="event.stopPropagation();window._fbDeployForm(\'' + _e(f.id) + '\')">Deploy</button></div>' +
      '</div>'
    ).join('');
    const cH = cs.length ? cs.map(f =>
      '<div class="ppp-library-item ' + (_fbActiveId === f.id ? 'active' : '') + '" onclick="window._fbOpenForm(\'' + _e(f.id) + '\')">' +
        '<div class="ppp-library-item-name">' + _e(f.name) + '</div>' +
        '<div class="ppp-library-item-meta"><span>' + (f.questions || []).length + ' Q</span><span>' + _fbFmt(f.lastModified) + '</span></div>' +
        '<div class="ppp-lib-actions"><button class="ppp-lib-btn" onclick="event.stopPropagation();window._fbDuplicateForm(\'' + _e(f.id) + '\')">Dup</button><button class="ppp-lib-btn deploy" onclick="event.stopPropagation();window._fbDeployForm(\'' + _e(f.id) + '\')">Deploy</button><button class="ppp-lib-btn" style="color:var(--red);border-color:rgba(255,107,107,0.2)" onclick="event.stopPropagation();window._fbDeleteForm(\'' + _e(f.id) + '\')">Del</button></div>' +
      '</div>'
    ).join('') : '<div style="padding:8px 14px;font-size:11px;color:var(--text-tertiary)">No custom forms yet.</div>';
    return '<div class="ppp-library-panel"><div style="padding:10px 10px 6px;border-bottom:1px solid var(--border)"><button class="btn btn-sm btn-primary" style="width:100%;font-size:11.5px" onclick="window._fbNewForm()">+ New Form</button></div><div class="ppp-library-scroll"><div class="ppp-lib-section-header">Validated Scales</div>' + vH + '<div class="ppp-lib-section-header" style="margin-top:8px">Custom Forms</div>' + cH + '</div></div>';
  }

  // Properties panel HTML
  function _renderProperties(form) {
    if (!form) return '<div class="ppp-properties-panel"><div class="ppp-props-scroll" style="padding:20px;font-size:12px;color:var(--text-tertiary)">Select a form.</div></div>';
    const dis = form.locked ? ' disabled' : '';
    const bandsH = (form.bands || []).map((b, i) =>
      '<div class="ppp-severity-band"><input type="number" value="' + b.max + '" min="0" oninput="window._fbUpdateBand(' + i + ',\'max\',this.value)" placeholder="Max"><input type="text" value="' + _e(b.label) + '" oninput="window._fbUpdateBand(' + i + ',\'label\',this.value)" placeholder="Label"><button class="ppp-band-remove" onclick="window._fbRemoveBand(' + i + ')">&#x2715;</button></div>'
    ).join('');
    const freqO = ['one-time','weekly','monthly','before-session','after-session'].map(v => '<option value="' + v + '"' + (form.frequency === v ? ' selected' : '') + '>' + v + '</option>').join('');
    const catO  = ['Screening','Follow-up','Discharge','Custom'].map(c => '<option value="' + c + '"' + (form.category === c ? ' selected' : '') + '>' + c + '</option>').join('');
    const assO  = [{v:'all',l:'All Active Patients'},{v:'pt001',l:'Alexis Morgan'},{v:'pt002',l:'Jordan Blake'},{v:'pt003',l:'Sam Rivera'}].map(o => '<option value="' + o.v + '"' + (form.assignTo === o.v ? ' selected' : '') + '>' + o.l + '</option>').join('');
    const scoreC = form.autoScore ?
      '<div class="ppp-props-row" style="margin-top:8px"><label class="ppp-props-label">Formula</label><input class="ppp-props-input"' + dis + ' value="' + _e(form.scoreFormula || 'sum') + '" oninput="window._fbPropChange(\'scoreFormula\',this.value)" placeholder="sum / average"></div>' +
      (form.maxScore != null ? '<div class="ppp-props-row"><label class="ppp-props-label">Max Score</label><input class="ppp-props-input" type="number"' + dis + ' value="' + form.maxScore + '" oninput="window._fbPropChange(\'maxScore\',+this.value)" style="width:80px"></div>' : '') +
      '<div style="margin-top:8px"><div style="font-size:10px;color:var(--text-tertiary);margin-bottom:6px;font-weight:500">Severity Bands</div><div id="ppp-bands-list">' + bandsH + '</div>' + (!form.locked ? '<button class="ppp-lib-btn" style="margin-top:4px;flex:none" onclick="window._fbAddBand()">+ Add Band</button>' : '') + '</div>'
      : '';
    const acts = !form.locked ?
      '<div class="ppp-props-section" style="display:flex;flex-direction:column;gap:7px"><div class="ppp-props-section-title">Actions</div><button class="btn btn-sm btn-primary" onclick="window._fbSaveFormBtn()">Save Form</button><button class="btn btn-sm" style="background:rgba(0,212,188,0.1);color:var(--teal);border:1px solid rgba(0,212,188,0.3)" onclick="window._fbPublishForm()">Publish Form</button><button class="btn btn-sm" onclick="window._fbExportFormJSON()">Export JSON</button></div>'
      : '<div class="ppp-props-section"><div class="ppp-props-section-title">Actions</div><button class="btn btn-sm" onclick="window._fbUseScale(\'' + _e(form.id) + '\')">Duplicate to Custom</button><button class="btn btn-sm" style="margin-top:6px;background:rgba(0,212,188,0.1);color:var(--teal);border:1px solid rgba(0,212,188,0.3)" onclick="window._fbDeployForm(\'' + _e(form.id) + '\')">Deploy to Patients</button></div>';
    return '<div class="ppp-properties-panel"><div class="ppp-props-scroll">' +
      '<div class="ppp-props-section"><div class="ppp-props-section-title">Form Settings</div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Name</label><input class="ppp-props-input"' + dis + ' value="' + _e(form.name) + '" oninput="window._fbPropChange(\'name\',this.value)"></div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Description</label><textarea class="ppp-props-input" rows="2"' + dis + ' oninput="window._fbPropChange(\'description\',this.value)">' + _e(form.description || '') + '</textarea></div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Version</label><input class="ppp-props-input"' + dis + ' value="' + _e(form.version || '1.0') + '" oninput="window._fbPropChange(\'version\',this.value)" style="width:80px"></div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Category</label><select class="ppp-props-input"' + dis + ' onchange="window._fbPropChange(\'category\',this.value)">' + catO + '</select></div>' +
      '</div>' +
      '<div class="ppp-props-section"><div class="ppp-props-section-title">Schedule</div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Frequency</label><select class="ppp-props-input"' + dis + ' onchange="window._fbPropChange(\'frequency\',this.value)">' + freqO + '</select></div>' +
        '<div class="ppp-props-row"><label class="ppp-props-label">Assign To</label><select class="ppp-props-input" onchange="window._fbPropChange(\'assignTo\',this.value)">' + assO + '</select></div>' +
      '</div>' +
      '<div class="ppp-props-section"><div class="ppp-props-section-title">Scoring</div>' +
        '<label class="ppp-scoring-toggle"><input type="checkbox"' + (form.autoScore ? ' checked' : '') + dis + ' onchange="window._fbPropChange(\'autoScore\',this.checked)"> Enable Auto-Scoring</label>' + scoreC +
      '</div>' +
      '<div class="ppp-props-section"><div class="ppp-props-section-title">Notifications</div>' +
        '<div class="ppp-notif-row"><span style="font-size:11px;color:var(--text-secondary)">Alert when score &gt;</span><input type="number" value="' + (form.notifyThreshold != null ? form.notifyThreshold : '') + '" min="0" oninput="window._fbPropChange(\'notifyThreshold\',+this.value)" placeholder="\u2014" style="width:60px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text-primary);font-size:12px;padding:4px 6px;outline:none;font-family:var(--font-body)"></div>' +
      '</div>' + acts +
    '</div></div>';
  }

  // Canvas panel HTML
  function _renderCanvas(form) {
    if (!form) return '<div class="ppp-canvas-panel"><div class="ppp-canvas-scroll" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:13px">Select a form from the library.</div></div>';
    const autoBanner = form.autoScore ? '<div style="background:rgba(0,212,188,0.06);border:1px solid rgba(0,212,188,0.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--teal)">Auto-scoring \u2022 Formula: <strong>' + _e(form.scoreFormula || 'sum') + '</strong>' + (form.maxScore != null ? ' \u2022 Max: ' + form.maxScore + 'pts' : '') + '</div>' : '';
    const lockedNote = form.locked ? '<div style="margin-top:16px;padding:10px 14px;background:rgba(255,181,71,0.07);border:1px solid rgba(255,181,71,0.2);border-radius:8px;font-size:11.5px;color:var(--amber)">This is a validated scale. Use \u201cDuplicate to Custom\u201d to create an editable copy.</div>' : '';
    const addQ = !form.locked ? '<div class="ppp-add-q-area"><button class="btn btn-sm" onclick="window._fbShowTypePicker()" style="border-style:dashed;color:var(--teal);border-color:rgba(0,212,188,0.3)">+ Add Question</button></div>' : '';
    return '<div class="ppp-canvas-panel"><div class="ppp-canvas-scroll" id="ppp-canvas-scroll">' +
      '<div class="ppp-canvas-title-row"><input class="ppp-canvas-title" id="canvas-title" value="' + _e(form.name) + '" ' + (form.locked ? 'disabled' : '') + ' oninput="window._fbPropChange(\'name\',this.value)" placeholder="Form Title"><button class="btn btn-sm" onclick="window._fbPreviewForm()">Preview</button></div>' +
      (form.description ? '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5">' + _e(form.description) + '</div>' : '') +
      autoBanner + '<div id="ppp-q-list">' + _renderQList(form.questions) + '</div>' + addQ + lockedNote +
    '</div></div>';
  }

  // Validated Scales tab HTML
  function _renderValidatedScales() {
    const allScales = [
      { id:'phq9',  name:'PHQ-9',    condition:'Depression',        range:'0–27',         rater:'Self-report',   description:'Patient Health Questionnaire — 9-item depression severity screener.' },
      { id:'gad7',  name:'GAD-7',    condition:'Anxiety',           range:'0–21',         rater:'Self-report',   description:'Generalized Anxiety Disorder 7-item scale.' },
      { id:'pcl5',  name:'PCL-5',    condition:'PTSD',              range:'0–80',         rater:'Self-report',   description:'PTSD Checklist for DSM-5 — 20 symptom items (0–4 each).' },
      ...EXTRA_SCALES.map(s => ({ id:s.id, name:s.name, condition:s.condition, range:s.range, rater:s.rater, description:s.description })),
    ];
    const scores = _fbLoad('ds_scale_scores', []);
    const iconMap = { 'Depression':'🧠','Anxiety':'😰','PTSD':'⚡','Cognitive / Schizophrenia':'🔬','Cognitive':'💡','Executive Function':'🎯', default:'📋' };
    const scaleCards = allScales.map(s => {
      const recentScores = scores.filter(sc => sc.scaleId === s.id).sort((a,b) => new Date(b.date)-new Date(a.date));
      const latest = recentScores[0];
      const sparkHTML = recentScores.length >= 2 ? _fbSparklineSVG(recentScores.slice(0,6).reverse(), s) : '';
      const icon = iconMap[s.condition] || iconMap.default;
      return '<div class="vscale-card">' +
        '<div class="vscale-card-header">' +
          '<div class="vscale-card-icon">' + icon + '</div>' +
          '<div class="vscale-card-info">' +
            '<div class="vscale-card-name">' + _e(s.name) + '</div>' +
            '<div class="vscale-card-meta"><span class="vscale-condition-tag">' + _e(s.condition) + '</span><span class="vscale-range-tag">' + _e(s.range) + '</span><span class="vscale-rater-tag">' + _e(s.rater) + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="vscale-card-desc">' + _e(s.description) + '</div>' +
        (sparkHTML ? '<div class="vscale-spark-wrap"><div class="vscale-spark-label">Last ' + Math.min(recentScores.length,6) + ' scores</div>' + sparkHTML + (latest ? '<div class="vscale-spark-latest">Latest: <strong>' + latest.total + '</strong><span class="vscale-sev-badge vscale-sev-' + _e((latest.severity||'').toLowerCase().replace(/\s+/g,'-')) + '">' + _e(latest.severity||'') + '</span></div>' : '') + '</div>' : '') +
        '<div class="vscale-card-footer"><button class="btn btn-sm btn-primary" onclick="window._fbOpenScaleEntry(\'' + _e(s.id) + '\')">Use Scale</button>' + (recentScores.length ? '<span class="vscale-score-count">' + recentScores.length + ' score' + (recentScores.length!==1?'s':'') + ' recorded</span>' : '') + '</div>' +
      '</div>';
    }).join('');
    return '<div class="vscale-wrap"><div class="vscale-header"><div><div class="vscale-header-title">Validated Assessment Scales</div><div class="vscale-header-sub">Standardized instruments for tracking clinical outcomes. Scores are stored and trended automatically.</div></div></div><div class="vscale-grid">' + scaleCards + '</div></div>';
  }

  // SVG sparkline (200×60px) for scale score trend
  function _fbSparklineSVG(recentScores, scaleDef) {
    if (!recentScores || recentScores.length < 2) return '';
    const W = 200, H = 60, PAD = 8;
    const vals = recentScores.map(s => s.total);
    const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1;
    const xStep = (W - PAD*2) / Math.max(vals.length-1, 1);
    const pts = vals.map((v,i) => ({ x: PAD + i*xStep, y: PAD + (1 - (v-minV)/range) * (H - PAD*2) }));
    const poly = pts.map(p => p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
    const dots = pts.map((p,i) => '<circle cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="3" fill="var(--teal)" stroke="var(--bg-base)" stroke-width="1.5"><title>'+vals[i]+'</title></circle>').join('');
    return '<svg class="vscale-spark-svg" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg"><polyline points="'+poly+'" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'+dots+'</svg>';
  }

  // Full page HTML
  function _renderBuilder() {
    const form = _fbGetForm(_fbActiveId), sc = _fbGetSubs().length;
    const tabBar = '<div class="ppp-tab-bar">' +
      '<div class="ppp-tab ' + (_fbTab==='builder'?'active':'') + '" onclick="window._fbSetTab(\'builder\')">Builder</div>' +
      '<div class="ppp-tab ' + (_fbTab==='responses'?'active':'') + '" onclick="window._fbSetTab(\'responses\')">Responses <span style="font-size:10px;background:rgba(0,212,188,0.12);color:var(--teal);border-radius:8px;padding:1px 6px;margin-left:4px">' + sc + '</span></div>' +
      '<div class="ppp-tab ' + (_fbTab==='scales'?'active':'') + '" onclick="window._fbSetTab(\'scales\')" style="display:flex;align-items:center;gap:5px">Validated Scales <span style="font-size:10px;background:rgba(93,95,239,0.12);color:var(--accent-violet);border-radius:8px;padding:1px 6px">9</span></div>' +
    '</div>';
    let content;
    if (_fbTab === 'builder') content = '<div class="ppp-builder-layout" style="height:100%">' + _renderLibrary() + _renderCanvas(form) + _renderProperties(form) + '</div>';
    else if (_fbTab === 'scales') content = _renderValidatedScales();
    else content = _renderResponses();
    return '<div style="height:100%;display:flex;flex-direction:column;overflow:hidden">' + tabBar + '<div style="flex:1;min-height:0;overflow:' + (_fbTab==='scales'?'auto':'hidden') + '">' + content + '</div></div>';
  }

  // Responses view HTML
  // Submissions are stored in localStorage (ds_form_submissions) and seeded
  // with demo rows on first mount. Real patient submissions (once the backend
  // /api/v1/forms/responses endpoint is wired) would replace or augment these.
  function _renderResponses() {
    const subs = _fbGetSubs();
    const banner = '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.25);border-radius:8px;padding:8px 12px;margin:16px 24px 0;font-size:12px;color:var(--accent-amber,#ffb547)">Form submissions shown here are stored locally in this browser. Server-side responses collection is not yet wired to this view.</div>';
    if (!subs.length) return banner + '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary);font-size:13px">No submissions yet.</div>';
    const rows = subs.map(s =>
      '<tr class="' + (s.flagged ? 'flagged' : '') + '" onclick="window._fbShowSubDetail(\'' + _e(s.id) + '\')" style="cursor:pointer"><td>' + _e(s.patientName) + '</td><td>' + _e(s.formName) + '</td><td>' + _fbFmt(s.date) + '</td><td>' + (s.score != null ? s.score : '\u2014') + '</td><td>' + (s.severity ? '<span class="ppp-severity-pill ' + _fbSevClass(s.severity) + '">' + _e(s.severity) + '</span>' : '\u2014') + '</td><td>' + (s.flagged ? '<span style="color:var(--red);font-size:11px">\uD83D\uDEA9</span>' : '<button class="ppp-lib-btn" style="flex:none" onclick="event.stopPropagation();window._fbFlagSub(\'' + _e(s.id) + '\')">Flag</button>') + '</td></tr>'
    ).join('');
    return '<div style="height:100%;overflow:hidden;display:flex;flex-direction:column">' + banner + '<div style="flex:1;overflow-y:auto;padding:20px 24px"><div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px"><div style="font-size:13px;font-weight:500;color:var(--text-primary)">' + subs.length + ' submission' + (subs.length !== 1 ? 's' : '') + '</div><button class="btn btn-sm" onclick="window._fbExportCSV()">Export CSV</button></div><div style="overflow-x:auto"><table class="ppp-subs-table"><thead><tr><th>Patient</th><th>Form</th><th>Date</th><th>Score</th><th>Severity</th><th>Actions</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
  }

  // SVG score trend chart
  function _fbTrendSVG(subs) {
    if (!subs || subs.length < 2) return '';
    const W = 340, H = 90, PAD = 16, scores = subs.map(s => s.score);
    const minS = Math.min(...scores), maxS = Math.max(...scores), range = maxS - minS || 1;
    const xStep = (W - PAD * 2) / (subs.length - 1);
    const pts = subs.map((s, i) => ({ x: PAD + i * xStep, y: PAD + (1 - (s.score - minS) / range) * (H - PAD * 2), score: s.score, date: _fbFmt(s.date) }));
    const poly = pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const dots = pts.map(p => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="var(--teal)" stroke="var(--bg-base)" stroke-width="2"><title>' + p.score + ' \u2014 ' + p.date + '</title></circle>').join('');
    const lbls = pts.map(p => '<text x="' + p.x.toFixed(1) + '" y="' + (p.y - 8).toFixed(1) + '" text-anchor="middle" font-size="10" fill="var(--text-tertiary)">' + p.score + '</text>').join('');
    return '<svg class="ppp-trend-chart" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="height:' + H + 'px"><polyline points="' + poly + '" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' + dots + lbls + '</svg>';
  }

  // Inject into DOM
  const el = document.getElementById('content');
  el.style.padding = '0';
  el.style.overflow = 'hidden';
  el.innerHTML = _renderBuilder();

  // Drag-to-reorder: mousedown/mousemove/mouseup (no HTML5 drag API)
  function _fbBindDrag() {
    const list = document.getElementById('ppp-q-list');
    if (!list) return;
    const form = _fbGetForm(_fbActiveId);
    if (!form || form.locked) return;
    let dragEl = null, dragIdx = null, ghost = null, overIdx = null;
    list.addEventListener('mousedown', function(e) {
      const handle = e.target.closest('.ppp-drag-handle');
      if (!handle) return;
      e.preventDefault();
      const card = handle.closest('.ppp-canvas-question');
      if (!card) return;
      dragIdx = parseInt(card.dataset.qidx, 10);
      dragEl  = card;
      card.classList.add('dragging');
      const rect = card.getBoundingClientRect();
      ghost = card.cloneNode(true);
      ghost.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0.85;width:' + card.offsetWidth + 'px;left:' + rect.left + 'px;top:' + rect.top + 'px;box-shadow:0 8px 32px rgba(0,0,0,0.5);border-color:var(--teal);transition:none;margin:0;';
      document.body.appendChild(ghost);
      function onMM(e2) {
        if (!ghost) return;
        ghost.style.top = (parseFloat(ghost.style.top) + e2.movementY) + 'px';
        const cards = Array.from(list.querySelectorAll('.ppp-canvas-question'));
        let no = dragIdx;
        for (let i = 0; i < cards.length; i++) {
          if (i === dragIdx) continue;
          const r = cards[i].getBoundingClientRect();
          if (e2.clientY > r.top + r.height * 0.5) no = i;
        }
        if (no !== overIdx) { cards.forEach(c => c.classList.remove('drag-over')); if (cards[no]) cards[no].classList.add('drag-over'); overIdx = no; }
      }
      function onMU() {
        document.removeEventListener('mousemove', onMM);
        document.removeEventListener('mouseup', onMU);
        ghost?.remove(); ghost = null;
        dragEl?.classList.remove('dragging');
        list.querySelectorAll('.ppp-canvas-question').forEach(c => c.classList.remove('drag-over'));
        if (overIdx !== null && overIdx !== dragIdx) {
          const f = _fbGetForm(_fbActiveId);
          if (f && !f.locked) {
            const qs = [...(f.questions || [])];
            const [mv] = qs.splice(dragIdx, 1);
            qs.splice(overIdx, 0, mv);
            f.questions = qs;
            f.lastModified = new Date().toISOString();
            _fbSaveForm(f);
            list.innerHTML = _renderQList(qs);
            _fbBindDrag();
          }
        }
        dragEl = null; dragIdx = null; overIdx = null;
      }
      document.addEventListener('mousemove', onMM);
      document.addEventListener('mouseup', onMU);
    });
  }
  _fbBindDrag();

  // Window handlers
  window._fbSetTab = t => { _fbTab = t; el.innerHTML = _renderBuilder(); if (t === 'builder') _fbBindDrag(); };

  // ── Validated Scales: Score Entry Modal ──────────────────────────────────────
  window._fbOpenScaleEntry = function(scaleId) {
    // Merge all scales
    const allScaleDefs = [
      ...VALIDATED_SCALES,
      ...EXTRA_SCALES,
    ];
    const scaleDef = allScaleDefs.find(s => s.id === scaleId);
    if (!scaleDef) return;
    const pts = ['Baseline','2-week','4-week','8-week','End of Course','Follow-up'];
    const today = new Date().toISOString().slice(0,10);
    const patients = [
      { id:'pt001', name:'Alexis Morgan' },
      { id:'pt002', name:'Jordan Blake' },
      { id:'pt003', name:'Sam Rivera' },
      { id:'pt004', name:'Casey Kim' },
    ];
    // Get previous scores for comparison
    const prevScores = _fbLoad('ds_scale_scores', []).filter(s => s.scaleId === scaleId).sort((a,b) => new Date(b.date)-new Date(a.date));
    const itemsHTML = (scaleDef.items || []).map((item, i) => {
      const maxV = (scaleDef.itemMax && scaleDef.itemMax[i] != null) ? scaleDef.itemMax[i] : 3;
      const opts = Array.from({length: maxV+1}, (_,v) => '<option value="'+v+'">'+v+'</option>').join('');
      return '<div class="vscale-item-row">' +
        '<div class="vscale-item-num">' + (i+1) + '.</div>' +
        '<div class="vscale-item-text">' + _e(item) + '</div>' +
        '<select class="vscale-item-sel" id="vscale_item_'+i+'" onchange="window._fbScaleItemChange()" data-max="'+maxV+'">' + opts + '</select>' +
      '</div>';
    }).join('');
    const ptOpts = patients.map(p => '<option value="'+p.id+'">'+_e(p.name)+'</option>').join('');
    const ptSelOpts = pts.map(p => '<option value="'+_e(p)+'">'+_e(p)+'</option>').join('');
    // Previous score comparison HTML
    const prevHtml = prevScores.length
      ? '<div class="vscale-prev-scores"><div class="vscale-prev-label">Previous scores:</div>' +
        prevScores.slice(0,3).map(s => '<span class="vscale-prev-entry"><strong>'+s.total+'</strong> <span class="vscale-sev-badge vscale-sev-'+(s.severity||'').toLowerCase().replace(/\s+/g,'-')+'">'+_e(s.severity||'')+'</span> &bull; '+(_fbFmt(s.date)||'')+'</span>').join('') +
        '</div>'
      : '';
    const modal = document.createElement('div');
    modal.className = 'vscale-modal-overlay';
    modal.id = 'vscale-modal';
    modal.innerHTML = '<div class="vscale-modal" onclick="event.stopPropagation()">' +
      '<div class="vscale-modal-header">' +
        '<div><div class="vscale-modal-title">' + _e(scaleDef.name) + '</div><div class="vscale-modal-sub">' + _e(scaleDef.description || '') + '</div></div>' +
        '<button class="vscale-modal-close" onclick="document.getElementById(\'vscale-modal\').remove()">\u2715</button>' +
      '</div>' +
      '<div class="vscale-modal-body">' +
        '<div class="vscale-modal-top-row">' +
          '<div class="vscale-field-group"><label class="vscale-field-label">Patient</label><select class="vscale-field-input" id="vscale_patient">' + ptOpts + '</select></div>' +
          '<div class="vscale-field-group"><label class="vscale-field-label">Date</label><input type="date" class="vscale-field-input" id="vscale_date" value="'+today+'"></div>' +
          '<div class="vscale-field-group"><label class="vscale-field-label">Measurement Point</label><select class="vscale-field-input" id="vscale_mpoint">' + ptSelOpts + '</select></div>' +
        '</div>' +
        '<div class="vscale-score-display" id="vscale-score-display">' +
          '<div class="vscale-score-live"><span class="vscale-score-val" id="vscale-score-val">0</span>' + (scaleDef.maxScore ? '<span class="vscale-score-max"> / '+scaleDef.maxScore+'</span>' : '') + '</div>' +
          '<span class="vscale-sev-badge vscale-sev-minimal" id="vscale-sev-badge">Minimal</span>' +
        '</div>' +
        (scaleDef.maxScore ? prevHtml : '') +
        '<div class="vscale-items-list">' + itemsHTML + '</div>' +
        '<div class="vscale-field-group" style="margin-top:12px"><label class="vscale-field-label">Notes (optional)</label><textarea class="vscale-field-input" id="vscale_notes" rows="2" placeholder="Clinical notes\u2026" style="resize:vertical"></textarea></div>' +
      '</div>' +
      '<div class="vscale-modal-footer">' +
        '<button class="btn btn-sm" onclick="document.getElementById(\'vscale-modal\').remove()">Cancel</button>' +
        '<button class="btn btn-sm btn-primary" onclick="window._fbSaveScaleScore(\'' + _e(scaleId) + '\')">Save Score</button>' +
      '</div>' +
    '</div>';
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    window._fbScaleItemChange();
  };

  window._fbScaleItemChange = function() {
    // Re-calculate total from all item selects
    const items = document.querySelectorAll('.vscale-item-sel');
    let total = 0;
    items.forEach(sel => { total += parseInt(sel.value || '0', 10); });
    const valEl = document.getElementById('vscale-score-val');
    if (valEl) valEl.textContent = total;
    // Find the scale def from the modal title (we need the scaleId)
    // Get severity from current open modal's scaleId — stored in save button onclick attr
    const saveBtn = document.querySelector('#vscale-modal .btn-primary');
    if (!saveBtn) return;
    const m = saveBtn.getAttribute('onclick').match(/'([^']+)'/);
    if (!m) return;
    const scaleId = m[1];
    const allScaleDefs = [...VALIDATED_SCALES, ...EXTRA_SCALES];
    const scaleDef = allScaleDefs.find(s => s.id === scaleId);
    if (!scaleDef) return;
    const sev = _fbScoreSeverity(total, scaleDef);
    const sevEl = document.getElementById('vscale-sev-badge');
    if (sevEl) {
      sevEl.textContent = sev;
      sevEl.className = 'vscale-sev-badge vscale-sev-' + sev.toLowerCase().replace(/\s+/g,'-');
    }
  };

  window._fbSaveScaleScore = async function(scaleId) {
    const allScaleDefs = [...VALIDATED_SCALES, ...EXTRA_SCALES];
    const scaleDef = allScaleDefs.find(s => s.id === scaleId);
    if (!scaleDef) return;
    const ptSel = document.getElementById('vscale_patient');
    const dateSel = document.getElementById('vscale_date');
    const mpSel = document.getElementById('vscale_mpoint');
    const notesSel = document.getElementById('vscale_notes');
    const items = document.querySelectorAll('.vscale-item-sel');
    const answers = Array.from(items).map(sel => parseInt(sel.value||'0',10));
    const total = answers.reduce((a,b)=>a+b, 0);
    const patients = [{id:'pt001',name:'Alexis Morgan'},{id:'pt002',name:'Jordan Blake'},{id:'pt003',name:'Sam Rivera'},{id:'pt004',name:'Casey Kim'}];
    const pt = patients.find(p => p.id === (ptSel?.value||'pt001')) || patients[0];
    const sev = _fbScoreSeverity(total, scaleDef);
    const entry = {
      id: 'ss_'+Date.now(),
      scaleId, scaleName: scaleDef.name,
      patientId: pt.id, patientName: pt.name,
      date: dateSel?.value || new Date().toISOString().slice(0,10),
      measurementPoint: mpSel?.value || 'Baseline',
      answers, total, severity: sev,
      notes: notesSel?.value?.trim() || '',
      recordedAt: new Date().toISOString(),
    };
    const all = _fbLoad('ds_scale_scores', []);
    all.unshift(entry);
    if (all.length > 500) all.splice(500);
    _fbSave('ds_scale_scores', all);
    // Attempt API save
    await api.recordOutcome({ patientId: pt.id, scaleId, scaleName: scaleDef.name, score: total, severity: sev, date: entry.date }).catch(() => null);
    // Find previous score for comparison
    const prev = all.slice(1).find(s => s.scaleId === scaleId && s.patientId === pt.id);
    const delta = prev != null ? (total - prev.total) : null;
    const deltaStr = delta != null ? (delta < 0 ? ' (' + delta + ' vs previous, improved)' : delta > 0 ? ' (+' + delta + ' vs previous, worsened)' : ' (no change vs previous)') : '';
    window._showNotifToast?.({ title: scaleDef.name + ' Score Saved', body: pt.name + ' — ' + total + (scaleDef.maxScore?'/'+scaleDef.maxScore:'') + ' ' + sev + deltaStr, severity: sev.toLowerCase().includes('severe') ? 'warn' : 'info' });
    document.getElementById('vscale-modal')?.remove();
    // Re-render if on scales tab
    if (_fbTab === 'scales') { el.innerHTML = _renderBuilder(); }
  };

  function _fbScoreSeverity(total, scaleDef) {
    if (!scaleDef.bands || !scaleDef.bands.length) return '';
    const band = scaleDef.bands.find(b => total <= b.max);
    return band ? band.label : scaleDef.bands[scaleDef.bands.length-1].label;
  }
  window._fbOpenForm = id => { _fbActiveId = id; localStorage.setItem('ds_active_form_id', id); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbUseScale = id => { const src = _fbGetForm(id); if (!src) return; const c = JSON.parse(JSON.stringify(src)); c.id = 'custom_' + id + '_' + Date.now(); c.name = src.name + ' (Copy)'; c.locked = false; c.version = '1.0'; c.lastModified = new Date().toISOString(); _fbSaveForm(c); _fbActiveId = c.id; localStorage.setItem('ds_active_form_id', c.id); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbDuplicateForm = id => { const src = _fbGetForm(id); if (!src) return; const c = JSON.parse(JSON.stringify(src)); c.id = 'custom_copy_' + Date.now(); c.name = src.name + ' (Copy)'; c.locked = false; c.lastModified = new Date().toISOString(); _fbSaveForm(c); _fbActiveId = c.id; localStorage.setItem('ds_active_form_id', c.id); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbDeleteForm = id => { if (!confirm('Delete this form? This cannot be undone.')) return; const fs = _fbGetForms().filter(f => f.id !== id); _fbSave('ds_forms', fs); if (_fbActiveId === id) { _fbActiveId = fs.find(f => !f.locked)?.id || fs[0]?.id || ''; localStorage.setItem('ds_active_form_id', _fbActiveId); } el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbNewForm = () => { const id = 'custom_' + Date.now(); _fbSaveForm({ id, name:'Untitled Form', description:'', category:'Custom', version:'1.0', locked:false, frequency:'one-time', autoScore:false, scoreFormula:'sum', maxScore:null, bands:[], notifyThreshold:null, assignTo:'all', questions:[], lastModified:new Date().toISOString(), deployedTo:[] }); _fbActiveId = id; localStorage.setItem('ds_active_form_id', id); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbDeployForm = id => { const form = _fbGetForm(id); if (!form) return; const deps = _fbLoad('ds_form_deployments', []); let added = 0; ['pt001','pt002','pt003'].forEach(pid => { if (!deps.find(d => d.formId === id && d.patientId === pid)) { deps.push({ formId:id, patientId:pid, assignedAt:new Date().toISOString(), frequency:form.frequency }); added++; } }); _fbSave('ds_form_deployments', deps); _dsToast('Form "' + form.name + '" deployed to ' + (added > 0 ? added + ' patient(s)' : 'all active patients (already assigned)') + '.', 'success'); };
  window._fbPropChange = (key, val) => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; form[key] = val; form.lastModified = new Date().toISOString(); _fbSaveForm(form); if (key === 'name') { const ct = document.getElementById('canvas-title'); if (ct && ct !== document.activeElement) ct.value = val; } if (key === 'autoScore') { el.innerHTML = _renderBuilder(); _fbBindDrag(); } };
  window._fbEditQText = (idx, text) => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; form.questions[idx].text = text.trim(); form.lastModified = new Date().toISOString(); _fbSaveForm(form); };
  window._fbToggleRequired = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; form.questions[idx].required = !form.questions[idx].required; form.lastModified = new Date().toISOString(); _fbSaveForm(form); el.innerHTML = _renderBuilder(); _fbBindDrag(); };
  window._fbDeleteQ = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; if (!confirm('Remove this question?')) return; form.questions.splice(idx, 1); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); };
  window._fbEditOptions = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; const q = form.questions[idx]; const inp = prompt('Enter checkbox options (one per line):', (q.options || ['Option 1','Option 2']).join('\n')); if (inp === null) return; q.options = inp.split('\n').map(s => s.trim()).filter(Boolean); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); };
  window._fbEditScale = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; const q = form.questions[idx]; const sc = prompt('Scale values (comma-separated):', (q.scale || [0,1,2,3]).join(',')); if (sc === null) return; const lb = prompt('Labels (one per line):', (q.scaleLabels || []).join('\n')); if (lb === null) return; q.scale = sc.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)); q.scaleLabels = lb.split('\n').map(s => s.trim()).filter(Boolean); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); };
  window._fbEditRange = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.questions[idx]) return; const q = form.questions[idx]; const mn = prompt('Minimum value:', q.min ?? 0); if (mn === null) return; const mx = prompt('Maximum value:', q.max ?? 10); if (mx === null) return; q.min = parseFloat(mn); q.max = parseFloat(mx); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); };
  window._fbUpdateBand = (idx, key, val) => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked || !form.bands?.[idx]) return; form.bands[idx][key] = key === 'max' ? parseInt(val, 10) : val; form.lastModified = new Date().toISOString(); _fbSaveForm(form); };
  function _rebandHTML(form) { const el2 = document.getElementById('ppp-bands-list'); if (!el2) return; el2.innerHTML = (form.bands || []).map((b, i) => '<div class="ppp-severity-band"><input type="number" value="' + b.max + '" min="0" oninput="window._fbUpdateBand(' + i + ',\'max\',this.value)" placeholder="Max"><input type="text" value="' + _e(b.label) + '" oninput="window._fbUpdateBand(' + i + ',\'label\',this.value)" placeholder="Label"><button class="ppp-band-remove" onclick="window._fbRemoveBand(' + i + ')">&#x2715;</button></div>').join(''); }
  window._fbRemoveBand = idx => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; form.bands.splice(idx, 1); form.lastModified = new Date().toISOString(); _fbSaveForm(form); _rebandHTML(form); };
  window._fbAddBand = () => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; if (!form.bands) form.bands = []; form.bands.push({ max: form.maxScore || 10, label: 'New Band' }); form.lastModified = new Date().toISOString(); _fbSaveForm(form); _rebandHTML(form); };
  window._fbSaveFormBtn = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; form.lastModified = new Date().toISOString(); _fbSaveForm(form); window._announce?.('Form saved'); const btn = document.activeElement; if (btn && btn.tagName === 'BUTTON') { const orig = btn.textContent; btn.textContent = 'Saved \u2713'; setTimeout(() => { btn.textContent = orig; }, 1500); } };
  window._fbPublishForm = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; form.published = true; form.publishedAt = new Date().toISOString(); form.lastModified = new Date().toISOString(); _fbSaveForm(form); _dsToast('Form "' + form.name + '" published successfully.', 'success'); };
  window._fbExportFormJSON = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; const blob = new Blob([JSON.stringify(form, null, 2)], { type:'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = form.id + '_v' + (form.version || '1') + '.json'; a.click(); URL.revokeObjectURL(url); };
  window._fbShowTypePicker = () => { const ov = document.createElement('div'); ov.className = 'ppp-type-picker-overlay'; ov.innerHTML = '<div class="ppp-type-picker" onclick="event.stopPropagation()"><div class="ppp-type-picker-title">Choose Question Type</div><div class="ppp-type-grid">' + Q_TYPES.map(t => '<div class="ppp-type-option" onclick="window._fbAddQuestion(\'' + t.type + '\');document.querySelector(\'.ppp-type-picker-overlay\').remove()"><div class="ppp-type-option-label"><span class="ppp-type-badge ' + t.type + '">' + t.type + '</span> ' + t.label + '</div><div class="ppp-type-option-desc">' + t.desc + '</div></div>').join('') + '</div><div style="margin-top:14px;text-align:right"><button class="btn btn-sm" onclick="document.querySelector(\'.ppp-type-picker-overlay\').remove()">Cancel</button></div></div>'; ov.addEventListener('click', () => ov.remove()); document.body.appendChild(ov); };
  window._fbAddQuestion = type => { const form = _fbGetForm(_fbActiveId); if (!form || form.locked) return; const defs = { likert:{scale:[0,1,2,3],scaleLabels:['Not at all','Several days','More than half the days','Nearly every day'],options:null,min:null,max:null}, text:{scale:null,scaleLabels:null,options:null,min:null,max:null}, textarea:{scale:null,scaleLabels:null,options:null,min:null,max:null}, yesno:{scale:null,scaleLabels:null,options:null,min:null,max:null}, slider:{scale:null,scaleLabels:null,options:null,min:0,max:10}, checkbox:{scale:null,scaleLabels:null,options:['Option A','Option B','Option C'],min:null,max:null}, date:{scale:null,scaleLabels:null,options:null,min:null,max:null}, number:{scale:null,scaleLabels:null,options:null,min:0,max:100} }; const q = Object.assign({ id:'q_' + Date.now(), type, text:'', required:false }, defs[type] || {}); if (!form.questions) form.questions = []; form.questions.push(q); form.lastModified = new Date().toISOString(); _fbSaveForm(form); document.getElementById('ppp-q-list').innerHTML = _renderQList(form.questions); _fbBindDrag(); const cards = document.querySelectorAll('.ppp-canvas-question'); const last = cards[cards.length - 1]; if (last) { last.scrollIntoView({ behavior:'smooth', block:'nearest' }); last.querySelector('.ppp-q-text')?.focus(); } };
  window._fbPreviewForm = () => { const form = _fbGetForm(_fbActiveId); if (!form) return; const qs = form.questions || []; const qH = qs.length === 0 ? '<div style="color:var(--text-tertiary);font-size:13px;padding:20px 0">No questions added yet.</div>' : qs.map((q, i) => '<div class="ppp-preview-q"><div class="ppp-preview-q-text">' + (i + 1) + '. ' + _e(q.text || '(No question text)') + (q.required ? '<span class="required-star">*</span>' : '') + '</div>' + _renderPreviewWidget(q, i) + '</div>').join(''); const modal = document.createElement('div'); modal.className = 'ppp-preview-modal'; modal.innerHTML = '<div class="ppp-preview-modal-inner"><button onclick="document.querySelector(\'.ppp-preview-modal\').remove()" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-tertiary);font-size:20px;cursor:pointer;line-height:1">\u2715</button><div style="font-size:10px;color:var(--teal);letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-bottom:6px">Patient Preview</div><div class="ppp-preview-form-title">' + _e(form.name) + '</div>' + (form.description ? '<div class="ppp-preview-form-desc">' + _e(form.description) + '</div>' : '') + qH + (qs.length ? '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end"><button class="btn btn-sm btn-primary" onclick="document.querySelector(\'.ppp-preview-modal\').remove()">Submit</button></div>' : '') + '</div>'; modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); }); document.body.appendChild(modal); };
  window._fbShowSubDetail = subId => { const subs = _fbGetSubs(); const sub = subs.find(s => s.id === subId); if (!sub) return; const form = _fbGetForm(sub.formId); const trend = subs.filter(s => s.formId === sub.formId && s.patientId === sub.patientId && s.score != null).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-5); document.querySelector('.ppp-sub-detail')?.remove(); const qs = form?.questions || []; const ansH = (sub.answers || []).map((a, i) => '<div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)"><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:3px">' + _e(qs[i]?.text || 'Question ' + (i + 1)) + '</div><div style="font-size:12.5px;color:var(--text-primary);font-weight:500">' + _e(String(a)) + '</div></div>').join(''); const panel = document.createElement('div'); panel.className = 'ppp-sub-detail'; panel.innerHTML = '<div class="ppp-sub-detail-header"><div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-primary)">' + _e(sub.formName) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">' + _e(sub.patientName) + ' &bull; ' + _fbFmt(sub.date) + '</div></div><button onclick="document.querySelector(\'.ppp-sub-detail\').remove()" style="background:none;border:none;color:var(--text-tertiary);font-size:18px;cursor:pointer">\u2715</button></div><div class="ppp-sub-detail-scroll"><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 14px;background:var(--bg-surface);border-radius:8px"><div><div style="font-size:24px;font-weight:700;color:var(--teal)">' + (sub.score != null ? sub.score : '\u2014') + '</div><div style="font-size:10px;color:var(--text-tertiary)">Score' + (form?.maxScore ? ' / ' + form.maxScore : '') + '</div></div>' + (sub.severity ? '<span class="ppp-severity-pill ' + _fbSevClass(sub.severity) + '" style="font-size:12px;padding:4px 12px">' + _e(sub.severity) + '</span>' : '') + (sub.flagged ? '<span style="color:var(--red);font-size:12px">\uD83D\uDEA9 Flagged</span>' : '') + '</div>' + (trend.length > 1 ? '<div style="margin-bottom:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:6px">Score Trend (Last ' + trend.length + ')</div>' + _fbTrendSVG(trend) + '</div>' : '') + '<div style="margin-bottom:16px"><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.8px;font-weight:500;margin-bottom:10px">Response Detail</div>' + (ansH || '<div style="color:var(--text-tertiary);font-size:12px">No detailed answers recorded.</div>') + '</div><div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border)">' + (!sub.flagged ? '<button class="btn btn-sm" style="color:var(--red);border-color:rgba(255,107,107,0.3)" onclick="window._fbFlagSub(\'' + _e(subId) + '\');document.querySelector(\'.ppp-sub-detail\').remove()">\uD83D\uDEA9 Flag for Review</button>' : '<span style="font-size:12px;color:var(--red)">\uD83D\uDEA9 Already Flagged</span>') + '</div></div>'; document.body.appendChild(panel); };
  window._fbFlagSub = subId => { const subs = _fbGetSubs(); const sub = subs.find(s => s.id === subId); if (!sub) return; sub.flagged = true; _fbSave('ds_form_submissions', subs); el.innerHTML = _renderBuilder(); if (_fbTab === 'builder') _fbBindDrag(); };
  window._fbExportCSV = () => { const subs = _fbGetSubs(); if (!subs.length) { alert('No submissions to export.'); return; } const hdr = ['ID','Patient','Form','Date','Score','Severity','Flagged']; const rows = subs.map(s => [s.id, s.patientName, s.formName, _fbFmt(s.date), s.score != null ? s.score : '', s.severity || '', s.flagged ? 'Yes' : 'No'].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')); const blob = new Blob([[hdr.join(','), ...rows].join('\n')], { type:'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'form_submissions_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(url); };
}

// ── NNN-C: Evidence Builder ───────────────────────────────────────────────────

const EVIDENCE_SEED_PAPERS = [
  { id:'ev1', title:'High-frequency rTMS of left DLPFC for MDD', authors:'George et al.', year:2010, journal:'Arch Gen Psychiatry', modality:'TMS', condition:'Depression', effectSize:0.55, ci:'[0.38–0.72]', n:190, design:'RCT', outcome:'HDRS-17' },
  { id:'ev2', title:'iTBS vs 10Hz rTMS equivalence trial', authors:'Blumberger et al.', year:2018, journal:'Lancet', modality:'TMS', condition:'Depression', effectSize:0.51, ci:'[0.35–0.67]', n:414, design:'RCT', outcome:'MADRS' },
  { id:'ev3', title:'Neurofeedback for ADHD: meta-analysis', authors:'Arns et al.', year:2009, journal:'Clinical EEG & Neuroscience', modality:'Neurofeedback', condition:'ADHD', effectSize:0.59, ci:'[0.44–0.74]', n:1194, design:'Meta-analysis', outcome:'ADHD rating scale' },
  { id:'ev4', title:'Alpha/theta neurofeedback for PTSD', authors:'Peniston & Kulkosky', year:1991, journal:'Medical Psychotherapy', modality:'Neurofeedback', condition:'PTSD', effectSize:1.12, ci:'[0.71–1.53]', n:29, design:'RCT', outcome:'MMPI scales' },
  { id:'ev5', title:'Anodal tDCS M1/SO for depression', authors:'Brunoni et al.', year:2013, journal:'JAMA Psychiatry', modality:'tDCS', condition:'Depression', effectSize:0.37, ci:'[0.14–0.60]', n:120, design:'RCT', outcome:'MADRS' },
  { id:'ev6', title:'tDCS for fibromyalgia pain', authors:'Fregni et al.', year:2006, journal:'Pain', modality:'tDCS', condition:'Chronic Pain', effectSize:0.68, ci:'[0.31–1.05]', n:32, design:'RCT', outcome:'VAS pain score' },
  { id:'ev7', title:'Neurofeedback for insomnia: pilot RCT', authors:'Cortoos et al.', year:2010, journal:'Applied Psychophysiology', modality:'Neurofeedback', condition:'Insomnia', effectSize:0.72, ci:'[0.22–1.22]', n:17, design:'Pilot RCT', outcome:'Sleep diary + PSG' },
  { id:'ev8', title:'Deep TMS for OCD: multicenter trial', authors:'Carmi et al.', year:2019, journal:'Am J Psychiatry', modality:'TMS', condition:'OCD', effectSize:0.64, ci:'[0.38–0.90]', n:99, design:'RCT', outcome:'Y-BOCS' },
];

const SEED_PATIENT_OUTCOMES = [
  { id:'po1', condition:'Depression', modality:'TMS',          n:28, meanChange:-9.4,  sdChange:3.1, pctImproved:71 },
  { id:'po2', condition:'ADHD',       modality:'Neurofeedback', n:14, meanChange:-6.2,  sdChange:2.8, pctImproved:64 },
  { id:'po3', condition:'Anxiety',    modality:'Neurofeedback', n:11, meanChange:-7.1,  sdChange:3.5, pctImproved:73 },
  { id:'po4', condition:'PTSD',       modality:'Neurofeedback', n:8,  meanChange:-10.3, sdChange:4.2, pctImproved:75 },
  { id:'po5', condition:'Insomnia',   modality:'Neurofeedback', n:9,  meanChange:-5.8,  sdChange:2.6, pctImproved:67 },
  { id:'po6', condition:'Depression', modality:'tDCS',          n:12, meanChange:-6.5,  sdChange:3.8, pctImproved:58 },
  { id:'po7', condition:'Chronic Pain',modality:'tDCS',         n:10, meanChange:-4.3,  sdChange:2.9, pctImproved:60 },
  { id:'po8', condition:'OCD',        modality:'TMS',           n:7,  meanChange:-8.2,  sdChange:3.3, pctImproved:71 },
];

function _ebLoad(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function _ebSave(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function _ebEsc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}

function _ebGetLiterature() {
  const ext = _ebLoad('ds_literature', null);
  if (ext && Array.isArray(ext) && ext.length > 0) return ext;
  if (!localStorage.getItem('ds_literature_seeded')) {
    _ebSave('ds_literature', EVIDENCE_SEED_PAPERS);
    localStorage.setItem('ds_literature_seeded', '1');
  }
  return _ebLoad('ds_literature', EVIDENCE_SEED_PAPERS);
}

function _ebGetProtocols() {
  return _ebLoad('ds_protocols', [
    { id:'proto1', name:'TMS for Depression (Standard)', modality:'TMS', condition:'Depression', description:'10 Hz rTMS protocol targeting left DLPFC for MDD treatment.', notes:'' },
    { id:'proto2', name:'Neurofeedback ADHD Alpha/Beta', modality:'Neurofeedback', condition:'ADHD', description:'Alpha/beta neurofeedback targeting frontal midline theta suppression.', notes:'' },
    { id:'proto3', name:'tDCS for Chronic Pain', modality:'tDCS', condition:'Chronic Pain', description:'Anodal M1 tDCS for fibromyalgia and central sensitization.', notes:'' },
    { id:'proto4', name:'Neurofeedback PTSD Alpha/Theta', modality:'Neurofeedback', condition:'PTSD', description:'Alpha/theta downtraining with heart rate variability integration.', notes:'' },
    { id:'proto5', name:'Deep TMS OCD Protocol', modality:'TMS', condition:'OCD', description:'H7 coil dTMS protocol for OCD based on multicenter RCT.', notes:'' },
  ]);
}

function _ebGetPatientOutcomes() {
  if (!localStorage.getItem('ds_patient_outcomes_seeded')) {
    _ebSave('ds_patient_outcomes', SEED_PATIENT_OUTCOMES);
    localStorage.setItem('ds_patient_outcomes_seeded', '1');
  }
  return _ebLoad('ds_patient_outcomes', SEED_PATIENT_OUTCOMES);
}

function _ebRelevanceScore(paper, protocol) {
  let score = 0;
  if (paper.modality === protocol.modality) score += 40;
  if (paper.condition === protocol.condition) score += 40;
  const currentYear = 2026;
  if (currentYear - paper.year <= 5) score += 20;
  return score;
}

function _ebMatchPapers(protocol) {
  const lit = _ebGetLiterature();
  return lit
    .filter(p => p.modality === protocol.modality || p.condition === protocol.condition)
    .map(p => ({ ...p, relevance: _ebRelevanceScore(p, protocol) }))
    .sort((a, b) => b.relevance - a.relevance);
}

function _ebEvidenceLevel(design) {
  if (!design) return 'Level IV';
  const d = design.toLowerCase();
  if (d.includes('meta')) return 'Level I';
  if (d.includes('rct') || d.includes('randomized')) return 'Level II';
  if (d.includes('pilot')) return 'Level III';
  return 'Level IV';
}

function _ebLevelColor(level) {
  if (level === 'Level I')   return 'var(--accent-teal)';
  if (level === 'Level II')  return 'var(--accent-blue)';
  if (level === 'Level III') return 'var(--accent-amber)';
  return 'var(--accent-rose)';
}

function _ebDesignBadge(design) {
  const level = _ebEvidenceLevel(design);
  return `<span class="nnnc-ev-level-badge" style="background:${_ebLevelColor(level)}22;color:${_ebLevelColor(level)};border:1px solid ${_ebLevelColor(level)}44;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.4px">${_ebEsc(level)}</span>`;
}

function _ebRenderMatchCard(paper) {
  const rel = paper.relevance ?? 0;
  const barW = Math.min(rel, 100);
  return `<div class="nnnc-match-card">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">${_ebEsc(paper.title)}</div>
        <div style="font-size:11.5px;color:var(--text-muted)">${_ebEsc(paper.authors)} (${paper.year}) — <em>${_ebEsc(paper.journal)}</em></div>
      </div>
      ${_ebDesignBadge(paper.design)}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--text-muted)">
      <span><strong style="color:var(--text)">Effect size:</strong> d = ${paper.effectSize} ${_ebEsc(paper.ci)}</span>
      <span><strong style="color:var(--text)">N:</strong> ${paper.n}</span>
      <span><strong style="color:var(--text)">Outcome:</strong> ${_ebEsc(paper.outcome)}</span>
      <span><strong style="color:var(--text)">Modality:</strong> ${_ebEsc(paper.modality)}</span>
      <span><strong style="color:var(--text)">Condition:</strong> ${_ebEsc(paper.condition)}</span>
    </div>
    <div style="margin-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:10.5px;color:var(--text-muted);letter-spacing:0.4px;text-transform:uppercase">Relevance</span>
        <span style="font-size:11px;font-weight:600;color:var(--accent-teal)">${rel}/100</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
        <div class="nnnc-effect-bar" style="height:100%;width:${barW}%;background:var(--accent-teal);border-radius:3px;transition:width 0.4s"></div>
      </div>
    </div>
    <div style="margin-top:10px;display:flex;justify-content:flex-end">
      <button class="btn btn-sm" onclick="window._ebAddCitation('${_ebEsc(paper.id)}')" style="font-size:11px">+ Add to Protocol Notes</button>
    </div>
  </div>`;
}

function _ebBuildComparisonSVG(pubES, pubCILow, pubCIHigh, clinicES, clinicSD) {
  const W = 480, H = 120, PL = 120, PR = 20, PT = 18, PB = 28;
  const innerW = W - PL - PR;
  const maxVal = Math.max(pubCIHigh + 0.1, clinicES + clinicSD + 0.1, 1.4);
  const scale = innerW / maxVal;
  const rowH = (H - PT - PB) / 2;
  const barH = 22;
  const pubY  = PT + rowH * 0 + (rowH - barH) / 2;
  const clinY = PT + rowH * 1 + (rowH - barH) / 2;
  const pubBarW  = Math.max(pubES  * scale, 2);
  const cliBarW  = Math.max(clinicES * scale, 2);
  const ciLowX   = PL + pubCILow  * scale;
  const ciHighX  = PL + pubCIHigh * scale;
  const cliLowX  = PL + Math.max(clinicES - clinicSD, 0) * scale;
  const cliHighX = PL + (clinicES + clinicSD) * scale;
  const midY1    = pubY  + barH / 2;
  const midY2    = clinY + barH / 2;
  return `<svg class="nnnc-comparison-chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;height:auto;display:block">
    <text x="${PL - 8}" y="${midY1 + 4}" text-anchor="end" font-size="12" fill="var(--text-muted)">Published</text>
    <text x="${PL - 8}" y="${midY2 + 4}" text-anchor="end" font-size="12" fill="var(--text-muted)">Your Clinic</text>
    <rect x="${PL}" y="${pubY}" width="${pubBarW}" height="${barH}" rx="4" fill="var(--accent-blue)" opacity="0.8"/>
    <rect x="${PL}" y="${clinY}" width="${cliBarW}" height="${barH}" rx="4" fill="var(--accent-teal)" opacity="0.85"/>
    <line x1="${ciLowX}" y1="${midY1 - 8}" x2="${ciLowX}" y2="${midY1 + 8}" stroke="var(--accent-blue)" stroke-width="2"/>
    <line x1="${ciHighX}" y1="${midY1 - 8}" x2="${ciHighX}" y2="${midY1 + 8}" stroke="var(--accent-blue)" stroke-width="2"/>
    <line x1="${ciLowX}" y1="${midY1}" x2="${ciHighX}" y2="${midY1}" stroke="var(--accent-blue)" stroke-width="1.5" stroke-dasharray="3,2"/>
    <line x1="${cliLowX}" y1="${midY2 - 8}" x2="${cliLowX}" y2="${midY2 + 8}" stroke="var(--accent-teal)" stroke-width="2"/>
    <line x1="${cliHighX}" y1="${midY2 - 8}" x2="${cliHighX}" y2="${midY2 + 8}" stroke="var(--accent-teal)" stroke-width="2"/>
    <line x1="${cliLowX}" y1="${midY2}" x2="${cliHighX}" y2="${midY2}" stroke="var(--accent-teal)" stroke-width="1.5" stroke-dasharray="3,2"/>
    <text x="${PL + pubBarW + 6}" y="${midY1 + 4}" font-size="11" fill="var(--text)">d=${pubES.toFixed(2)}</text>
    <text x="${PL + cliBarW + 6}" y="${midY2 + 4}" font-size="11" fill="var(--text)">d=${clinicES.toFixed(2)}</text>
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="var(--border)" stroke-width="1"/>
    <text x="${PL}" y="${H - PB + 12}" font-size="9" fill="var(--text-muted)">0</text>
    <text x="${PL + innerW / 2}" y="${H - PB + 12}" text-anchor="middle" font-size="9" fill="var(--text-muted)">Cohen's d</text>
    <text x="${W - PR}" y="${H - PB + 12}" text-anchor="end" font-size="9" fill="var(--text-muted)">${maxVal.toFixed(1)}</text>
  </svg>`;
}

function _ebParseCI(ciStr) {
  if (!ciStr) return { low: 0, high: 0 };
  const m = ciStr.match(/([\d.]+)[–\-]([\d.]+)/);
  if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) };
  return { low: 0, high: 0 };
}

function _ebInterpretation(clinicES, pubCILow, pubCIHigh, condition, modality) {
  let pos = 'within';
  if (clinicES > pubCIHigh) pos = 'above';
  else if (clinicES < pubCILow) pos = 'below';
  const posLabel = { above: 'above', within: 'within', below: 'below' }[pos];
  const posColor = { above: 'var(--accent-teal)', within: 'var(--accent-blue)', below: 'var(--accent-amber)' }[pos];
  return `<div style="padding:12px 16px;border-radius:8px;border:1px solid ${posColor}33;background:${posColor}0d;font-size:13px;line-height:1.6">
    <strong style="color:${posColor}">Your clinic's outcomes are ${posLabel} the published range</strong> for <em>${_ebEsc(condition)}</em> treated with <em>${_ebEsc(modality)}</em>.
    Published benchmark: d = ${pubCILow.toFixed(2)}–${pubCIHigh.toFixed(2)} (95% CI). Your clinic: d ≈ ${clinicES.toFixed(2)}.
    ${pos === 'above' ? 'Excellent outcome — consider documenting your protocol parameters for dissemination.' :
      pos === 'below' ? 'Review session adherence, patient selection criteria, and protocol parameters.' :
      'Your real-world results align well with the published evidence base.'}
  </div>`;
}

function _ebRenderGapSection(protocols, literature) {
  const gaps = [];
  for (const proto of protocols) {
    const matched = literature.filter(p => p.modality === proto.modality && p.condition === proto.condition);
    if (matched.length === 0) {
      gaps.push({ proto, type: 'No matched literature', action: 'Search PubMed for recent trials on this modality + condition combination', severity: 'high' });
      continue;
    }
    const hasOnlyLevelIII = matched.every(p => {
      const l = _ebEvidenceLevel(p.design);
      return l === 'Level III' || l === 'Level IV';
    });
    if (hasOnlyLevelIII) {
      gaps.push({ proto, type: 'Only Level III/IV evidence', action: 'Consider conducting a pilot study or consulting a specialist', severity: 'medium' });
    }
    const positives = matched.filter(p => p.effectSize > 0).length;
    const negatives = matched.filter(p => p.effectSize <= 0).length;
    if (positives > 0 && negatives > 0) {
      gaps.push({ proto, type: 'Contradictory findings', action: 'Review conflicting studies and identify moderating variables', severity: 'medium' });
    }
  }
  if (gaps.length === 0) {
    return `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">No evidence gaps detected across active protocols.</div>`;
  }
  return gaps.map(g => {
    const sColor = g.severity === 'high' ? 'var(--accent-rose)' : 'var(--accent-amber)';
    const irbList = _ebLoad('ds_irb_wishlist', []);
    const alreadyAdded = irbList.some(i => i.protoId === g.proto.id && i.gapType === g.type);
    return `<div class="nnnc-gap-item">
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px">${_ebEsc(g.proto.name)}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:10.5px;font-weight:600;color:${sColor};background:${sColor}18;padding:2px 8px;border-radius:4px;border:1px solid ${sColor}33">${_ebEsc(g.type)}</span>
            <span style="font-size:11px;color:var(--text-muted)">${_ebEsc(g.proto.modality)} / ${_ebEsc(g.proto.condition)}</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted)">Suggested action: ${_ebEsc(g.action)}</div>
        </div>
        <button class="btn btn-sm" ${alreadyAdded ? 'disabled style="opacity:0.5"' : ''}
          onclick="window._ebAddToIRB('${_ebEsc(g.proto.id)}','${_ebEsc(g.proto.name)}','${_ebEsc(g.type)}')"
          style="flex-shrink:0;font-size:11px;${alreadyAdded ? '' : 'border-color:var(--accent-violet);color:var(--accent-violet)'}">
          ${alreadyAdded ? 'Added to IRB ✓' : '+ IRB Wishlist'}
        </button>
      </div>
    </div>`;
  }).join('');
}
