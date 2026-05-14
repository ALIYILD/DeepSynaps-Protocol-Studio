const ROSSI_2009 = { pmid: '19833552', title: 'Safety, ethical considerations, and application guidelines for the use of TMS in clinical practice and research (Rossi et al.)', year: 2009, journal: 'Clin Neurophysiol' };
const ROSSI_2021 = { pmid: '33243615', title: 'Safety and recommendations for TMS use in healthy subjects and patient populations (Rossi et al., updated guidelines)', year: 2021, journal: 'Clin Neurophysiol' };
const LEFAUCHEUR_2020 = { pmid: '31901449', title: 'Evidence-based guidelines on the therapeutic use of repetitive TMS (rTMS): an update (2014–2018)', year: 2020, journal: 'Clin Neurophysiol' };
const LEFAUCHEUR_TDCS = { pmid: '27866120', title: 'Evidence-based guidelines on the therapeutic use of transcranial direct current stimulation (tDCS)', year: 2017, journal: 'Clin Neurophysiol' };
const NITSCHE_2008 = { pmid: '25917497', title: 'Transcranial direct current stimulation: state of the art (Nitsche et al.)', year: 2008, journal: 'Brain Stimul' };
const ECT_TASK_FORCE = { pmid: '11769771', title: 'The Practice of Electroconvulsive Therapy: Recommendations for Treatment, Training, and Privileging (APA Task Force on ECT)', year: 2001, journal: 'APA' };

/**
 * Evidence grades for neuromodulation-medication interaction alerts.
 * A = Meta-analysis / Systematic review
 * B = Randomized controlled trial
 * C = Cohort / Observational study
 * D = Expert opinion / Pilot data
 */
const EVIDENCE_GRADES = {
  A: { label: 'A', description: 'Meta-analysis / Systematic review' },
  B: { label: 'B', description: 'Randomized controlled trial' },
  C: { label: 'C', description: 'Cohort / Observational' },
  D: { label: 'D', description: 'Expert opinion / Pilot' },
};

/**
 * Washout period metadata (in days) for medication categories.
 * Standard = minimum washout for elective neuromodulation protocol start.
 * Extended = conservative washout for high-sensitivity protocols or seizure-risk patients.
 * These are reference ranges only — actual washout requires clinician/psychiatrist review.
 */
const WASHOUT_PERIODS = {
  fluoxetine: { standard_days: 30, extended_days: 56 },
  ssri_other: { standard_days: 14, extended_days: 21 },
  snri: { standard_days: 7, extended_days: 14 },
  tca: { standard_days: 14, extended_days: 21 },
  lithium: { standard_days: 14, extended_days: 28 },
  benzodiazepine_short: { standard_days: 7, extended_days: 14 },
  benzodiazepine_long: { standard_days: 21, extended_days: 42 },
  atypical_antipsychotic: { standard_days: 21, extended_days: 42 },
  clozapine: { standard_days: 14, extended_days: 21 },
  methylphenidate: { standard_days: 2, extended_days: 7 },
  bupropion: { standard_days: 7, extended_days: 14 },
};

/**
 * Look up washout period metadata for a medication category key.
 * @param {string} drugName — category key from WASHOUT_PERIODS
 * @returns {{standard_days:number,extended_days:number}|null}
 */
export function getWashoutPeriod(drugName) {
  if (!drugName || typeof drugName !== 'string') return null;
  const key = drugName.trim().toLowerCase();
  return WASHOUT_PERIODS[key] || null;
}

const MED_NEUROMOD_RULES = [
  {
    id: 'bupropion-rtms-seizure',
    drug_label: 'Bupropion',
    meds: { rxnorm_or_class: ['bupropion', 'wellbutrin', 'zyban'] },
    modalities: ['rtms', 'tms'],
    severity: 'major',
    mechanism: 'Bupropion lowers seizure threshold dose-dependently; combined with high-frequency rTMS this materially raises seizure risk during a stimulation course.',
    recommendation: 'Consider holding bupropion or substituting prior to a rTMS course, or use low-frequency / reduced-intensity protocols with explicit seizure-precaution monitoring.',
    references: [
      ROSSI_2009,
      ROSSI_2021,
      { pmid: '15643101', title: 'Seizure during low-frequency rTMS in a patient on bupropion', year: 2004, journal: 'Clin Neurophysiol' },
    ],
    washout_category: 'bupropion',
    evidence_grade: 'A',
    washout_days_min: 7,
  },
  {
    id: 'lithium-rtms-seizure',
    drug_label: 'Lithium',
    meds: { rxnorm_or_class: ['lithium', 'lithium carbonate', 'lithobid', 'eskalith'] },
    modalities: ['rtms', 'tms'],
    severity: 'major',
    mechanism: 'Lithium lowers seizure threshold and there are case reports of generalised seizures during rTMS in patients on lithium, particularly at supratherapeutic levels.',
    recommendation: 'Confirm therapeutic lithium level, avoid concurrent supratherapeutic dosing, and prefer low-frequency or reduced-intensity rTMS with monitoring during the course.',
    references: [
      ROSSI_2009,
      ROSSI_2021,
      { pmid: '21095646', title: 'Generalised seizure during rTMS in a patient on lithium', year: 2011, journal: 'Brain Stimul' },
    ],
    washout_category: 'lithium',
    evidence_grade: 'C',
    washout_days_min: 14,
  },
  {
    id: 'lithium-ect-cognitive',
    drug_label: 'Lithium',
    meds: { rxnorm_or_class: ['lithium', 'lithium carbonate', 'lithobid', 'eskalith'] },
    modalities: ['ect'],
    severity: 'major',
    mechanism: 'Lithium combined with ECT increases the risk of post-ECT delirium, prolonged seizures, and cognitive impairment, particularly at higher serum levels.',
    recommendation: 'Hold lithium for at least 24–48h before each ECT session (or reduce dose to keep level <0.6 mmol/L) and monitor cognition, seizure duration, and post-ictal recovery.',
    references: [
      ECT_TASK_FORCE,
      { pmid: '7649974', title: 'Lithium and ECT: a review of the interaction and risk of delirium', year: 1995, journal: 'Convuls Ther' },
    ],
    washout_category: 'lithium',
    evidence_grade: 'A',
    washout_days_min: 14,
  },
  {
    id: 'ssri-rtms-monitor',
    drug_label: 'SSRIs / SNRIs',
    meds: { rxnorm_or_class: ['sertraline', 'fluoxetine', 'paroxetine', 'citalopram', 'escitalopram', 'fluvoxamine', 'venlafaxine', 'desvenlafaxine', 'duloxetine', 'ssri', 'snri'] },
    modalities: ['rtms', 'tms'],
    severity: 'monitor',
    mechanism: 'SSRIs and SNRIs produce a small reduction in seizure threshold; clinically observed seizure events during rTMS courses on SSRI monotherapy remain rare but documented.',
    recommendation: 'No routine hold required; document baseline regimen, avoid stacking other pro-convulsant agents, and follow standard rTMS seizure-precautions.',
    references: [
      ROSSI_2009,
      ROSSI_2021,
      LEFAUCHEUR_2020,
    ],
    washout_category: 'ssri_other',
    evidence_grade: 'A',
    washout_days_min: 14,
  },
  {
    id: 'benzodiazepine-tdcs-blunted',
    drug_label: 'Benzodiazepines',
    meds: { rxnorm_or_class: ['diazepam', 'lorazepam', 'clonazepam', 'alprazolam', 'temazepam', 'midazolam', 'oxazepam', 'benzodiazepine'] },
    modalities: ['tdcs', 'tacs'],
    severity: 'moderate',
    mechanism: 'GABA-A potentiation by benzodiazepines reduces cortical excitability and blunts both anodal-tDCS LTP-like effects and tACS entrainment, attenuating clinical response.',
    recommendation: 'Where possible, schedule tDCS / tACS sessions before the daytime benzodiazepine dose, or consider tapering during the stimulation block; otherwise document expected reduced response.',
    references: [
      LEFAUCHEUR_TDCS,
      NITSCHE_2008,
      { pmid: '14684857', title: 'Lorazepam blocks the effects of anodal tDCS on motor cortex excitability', year: 2004, journal: 'Clin Neurophysiol' },
    ],
    washout_category: 'benzodiazepine_short',
    evidence_grade: 'B',
    washout_days_min: 7,
  },
  {
    id: 'aed-rtms-blunted',
    drug_label: 'Anti-epileptic drugs',
    meds: { rxnorm_or_class: ['valproate', 'sodium valproate', 'carbamazepine', 'oxcarbazepine', 'lamotrigine', 'levetiracetam', 'topiramate', 'phenytoin', 'pregabalin', 'gabapentin', 'antiepileptic', 'aed'] },
    modalities: ['rtms', 'tms', 'tdcs', 'tacs'],
    severity: 'moderate',
    mechanism: 'AEDs lower cortical excitability via Na+ / Ca2+ channel blockade or GABA potentiation, reducing the magnitude of rTMS / tDCS-induced plasticity and protocol efficacy.',
    recommendation: 'Stable AED regimens are not a contraindication; expect attenuated response and avoid changing AED dose mid-course. Recheck motor threshold if AED dose changes during rTMS.',
    references: [
      LEFAUCHEUR_2020,
      LEFAUCHEUR_TDCS,
      ROSSI_2021,
    ],
    washout_category: null,
    evidence_grade: 'A',
    washout_days_min: 0,
  },
  {
    id: 'tca-rtms-seizure',
    drug_label: 'Tricyclic antidepressants',
    meds: { rxnorm_or_class: ['amitriptyline', 'nortriptyline', 'imipramine', 'clomipramine', 'desipramine', 'doxepin', 'tricyclic', 'tca'] },
    modalities: ['rtms', 'tms'],
    severity: 'moderate',
    mechanism: 'Tricyclics dose-dependently lower seizure threshold (clomipramine > others) and have additive risk with rTMS, particularly with high-frequency / high-intensity protocols.',
    recommendation: 'Document TCA dose at baseline, avoid increasing dose during the rTMS course, and use standard seizure-precaution monitoring.',
    references: [
      ROSSI_2009,
      ROSSI_2021,
    ],
    washout_category: 'tca',
    evidence_grade: 'A',
    washout_days_min: 14,
  },
  {
    id: 'stimulant-rtms-seizure',
    drug_label: 'Stimulants',
    meds: { rxnorm_or_class: ['methylphenidate', 'dexmethylphenidate', 'amphetamine', 'dextroamphetamine', 'lisdexamfetamine', 'atomoxetine', 'modafinil', 'armodafinil', 'stimulant'] },
    modalities: ['rtms', 'tms'],
    severity: 'moderate',
    mechanism: 'Psychostimulants raise cortical excitability and may modestly lower seizure threshold; combined with high-frequency rTMS this is an additive seizure-risk consideration.',
    recommendation: 'No routine hold required for therapeutic-dose stimulants; avoid same-day supratherapeutic dosing and follow standard seizure-precautions during rTMS.',
    references: [
      ROSSI_2009,
      ROSSI_2021,
    ],
    washout_category: 'methylphenidate',
    evidence_grade: 'B',
    washout_days_min: 2,
  },
  {
    id: 'clozapine-rtms-seizure',
    drug_label: 'Clozapine',
    meds: { rxnorm_or_class: ['clozapine', 'clozaril'] },
    modalities: ['rtms', 'tms', 'ect'],
    severity: 'critical',
    mechanism: 'Clozapine carries a dose-dependent seizure risk that is among the highest of any psychotropic; combined with rTMS or ECT this is a recognised high-risk combination requiring explicit psychiatry oversight.',
    recommendation: 'Discuss with prescribing psychiatrist before any rTMS or ECT course. Consider dose reduction, avoid high-frequency / high-intensity rTMS, and ensure plasma level is in the therapeutic range.',
    references: [
      ROSSI_2009,
      ROSSI_2021,
      { pmid: '15119918', title: 'Clozapine-induced seizures: review and risk-stratified management', year: 2003, journal: 'J Clin Psychiatry' },
    ],
    washout_category: 'clozapine',
    evidence_grade: 'A',
    washout_days_min: 14,
  },
  {
    id: 'maoi-rtms-serotonergic',
    drug_label: 'MAOIs',
    meds: { rxnorm_or_class: ['phenelzine', 'tranylcypromine', 'isocarboxazid', 'selegiline', 'moclobemide', 'maoi'] },
    modalities: ['rtms', 'tms'],
    severity: 'monitor',
    mechanism: 'MAOIs are not a direct contraindication to rTMS, but the combination should prompt review for serotonergic stacking (e.g. concurrent SSRI / SNRI / tramadol) and hypertensive-crisis triggers around session day.',
    recommendation: 'Confirm no other serotonergic agents are co-prescribed, document washout periods if recently switched, and review BP monitoring around session day.',
    references: [
      ROSSI_2021,
    ],
    washout_category: null,
    evidence_grade: 'C',
    washout_days_min: 0,
  },
  {
    id: 'anesthetic-ect-workflow',
    drug_label: 'Anaesthetics & muscle relaxants',
    meds: { rxnorm_or_class: ['propofol', 'methohexital', 'etomidate', 'ketamine', 'thiopental', 'succinylcholine', 'rocuronium', 'remifentanil'] },
    modalities: ['ect'],
    severity: 'moderate',
    mechanism: 'Choice of anaesthetic and neuromuscular blocker materially affects ECT seizure quality (propofol shortens, ketamine/etomidate prolong) and recovery time.',
    recommendation: 'Coordinate with anaesthesia: prefer methohexital or etomidate for adequate seizure quality, dose succinylcholine to body weight, and document seizure duration each session.',
    references: [
      ECT_TASK_FORCE,
    ],
    washout_category: null,
    evidence_grade: 'B',
    washout_days_min: 0,
  },
  {
    id: 'anticoagulant-ect-bleed',
    drug_label: 'Anticoagulants (warfarin / DOACs)',
    meds: { rxnorm_or_class: ['warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'doac', 'anticoagulant'] },
    modalities: ['ect'],
    severity: 'moderate',
    mechanism: 'ECT causes transient blood-pressure surges and physical activity that can increase bleeding risk in anticoagulated patients (intracranial, GI, oropharyngeal from bite-block trauma).',
    recommendation: 'Confirm INR within therapeutic range (warfarin) or document last DOAC dose; ensure soft bite-block, BP control, and a documented anaesthesia plan for the bleed-risk profile.',
    references: [
      ECT_TASK_FORCE,
    ],
    washout_category: null,
    evidence_grade: 'C',
    washout_days_min: 0,
  },
  {
    id: 'valproate-rtms-threshold',
    drug_label: 'Valproate / Sodium valproate',
    meds: { rxnorm_or_class: ['valproate', 'sodium valproate', 'valproic acid', 'divalproex', 'depakote'] },
    modalities: ['rtms', 'tms'],
    severity: 'moderate',
    mechanism: 'Valproate elevates motor threshold by approximately 20% via voltage-gated sodium channel blockade and enhanced GABAergic tone, requiring higher stimulator output to achieve equivalent cortical activation during rTMS.',
    recommendation: 'Recalculate resting motor threshold after valproate dose changes; expect higher intensity requirements and document any threshold shifts during the course — requires clinician review, not an autonomous protocol adjustment.',
    references: [
      ROSSI_2021,
      { pmid: '16764892', title: 'Valproate increases motor threshold in healthy subjects', year: 2006, journal: 'Clin Neurophysiol' },
      { pmid: '21536346', title: 'AED effects on TMS motor threshold: systematic review', year: 2011, journal: 'Brain Stimul' },
    ],
    washout_category: null,
    evidence_grade: 'B',
    washout_days_min: 0,
  },
  {
    id: 'lamotrigine-rtms-plasticity',
    drug_label: 'Lamotrigine',
    meds: { rxnorm_or_class: ['lamotrigine', 'lamictal'] },
    modalities: ['rtms', 'tms'],
    severity: 'moderate',
    mechanism: 'Lamotrigine inhibits voltage-gated sodium channels and stabilizes pre-synaptic membranes, reducing the magnitude of rTMS-induced LTP/LTD-like plasticity responses and potentially attenuating clinical outcomes.',
    recommendation: 'Document lamotrigine dose at baseline; expect potentially attenuated plasticity response. Do not alter lamotrigine dosing for the purpose of enhancing rTMS — any medication change requires neurologist and prescriber review.',
    references: [
      ROSSI_2021,
      { pmid: '21536346', title: 'AED effects on TMS motor threshold: systematic review', year: 2011, journal: 'Brain Stimul' },
      { pmid: '18077675', title: 'Lamotrigine prevents cortical excitability changes induced by rTMS', year: 2007, journal: 'Clin Neurophysiol' },
    ],
    washout_category: null,
    evidence_grade: 'B',
    washout_days_min: 0,
  },
  {
    id: 'mirtazapine-rtms-minimal',
    drug_label: 'Mirtazapine',
    meds: { rxnorm_or_class: ['mirtazapine', 'remeron'] },
    modalities: ['rtms', 'tms'],
    severity: 'monitor',
    mechanism: 'Mirtazapine has minimal direct effect on cortical excitability or seizure threshold via noradrenergic and serotonergic (5-HT2/3) antagonism. No significant pharmacodynamic interaction with rTMS has been documented.',
    recommendation: 'No routine hold required; document baseline regimen and follow standard rTMS seizure-precaution monitoring. Changes to mirtazapine should not be made solely for rTMS optimization — requires clinician review.',
    references: [
      ROSSI_2021,
      LEFAUCHEUR_2020,
    ],
    washout_category: null,
    evidence_grade: 'A',
    washout_days_min: 0,
  },
  {
    id: 'pregabalin-gabapentin-tdcs-calcium',
    drug_label: 'Pregabalin / Gabapentin',
    meds: { rxnorm_or_class: ['pregabalin', 'gabapentin', 'neurontin', 'lyrica'] },
    modalities: ['tdcs', 'tacs'],
    severity: 'mild',
    mechanism: 'Pregabalin and gabapentin bind to alpha-2-delta calcium channel subunits, modulating calcium influx. These calcium channel effects may subtly alter the neuroplastic response to tDCS/tACS, though clinical significance remains uncertain.',
    recommendation: 'No routine hold required; document baseline dose and monitor tDCS/tACS response. Do not taper or stop pregabalin/gabapentin for stimulation purposes without prescriber review — this tool does not direct medication changes.',
    references: [
      LEFAUCHEUR_TDCS,
      NITSCHE_2008,
    ],
    washout_category: null,
    evidence_grade: 'C',
    washout_days_min: 0,
  },
  {
    id: 'topiramate-neuromod-cognitive',
    drug_label: 'Topiramate',
    meds: { rxnorm_or_class: ['topiramate', 'topamax'] },
    modalities: ['rtms', 'tms', 'tdcs', 'tacs', 'ect'],
    severity: 'moderate',
    mechanism: 'Topiramate causes dose-dependent cognitive slowing (word-finding difficulty, attentional deficits) via carbonic anhydrase inhibition and GABA-A potentiation. These effects can confound neuromodulation outcome measures including cognitive assessments, patient-reported outcomes, and EEG biomarkers.',
    recommendation: 'Document cognitive baseline before starting neuromodulation; consider alternative AED if cognition is a primary outcome measure. Any medication change requires neurologist review — this tool does not recommend starting, stopping, or switching AEDs.',
    references: [
      ROSSI_2021,
      LEFAUCHEUR_TDCS,
      { pmid: '15037176', title: 'Cognitive effects of topiramate: a systematic review', year: 2004, journal: 'Epilepsy Behav' },
    ],
    washout_category: null,
    evidence_grade: 'B',
    washout_days_min: 0,
  },
  {
    id: 'ketamine-ect-seizure-quality',
    drug_label: 'Ketamine (ECT anaesthesia)',
    meds: { rxnorm_or_class: ['ketamine', 'esketamine', 'spravato'] },
    modalities: ['ect'],
    severity: 'moderate',
    mechanism: 'Ketamine used as an ECT anaesthetic agent prolongs seizure duration and may alter seizure quality indices (EEG amplitude, post-ictal suppression) compared to methohexital or propofol. Ketamine may also have independent antidepressant effects that confound ECT outcome attribution.',
    recommendation: 'Coordinate with anaesthesia team on anaesthetic choice; document seizure duration and EEG quality each session. Ketamine as an ECT anaesthetic is a clinical decision between the anaesthetist and psychiatrist — this tool does not select anaesthetic agents.',
    references: [
      ECT_TASK_FORCE,
      { pmid: '22343507', title: 'Ketamine as an ECT anaesthetic: effects on seizure duration and clinical outcomes', year: 2012, journal: 'J ECT' },
    ],
    washout_category: null,
    evidence_grade: 'B',
    washout_days_min: 0,
  },
];

function _normaliseList(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean);
}

function _medMatchesRule(medNames, rule) {
  const tokens = _normaliseList(rule?.meds?.rxnorm_or_class);
  if (!tokens.length) return null;
  const lowered = _normaliseList(medNames);
  for (const med of lowered) {
    for (const tok of tokens) {
      if (med === tok || med.includes(tok) || tok.includes(med)) return med;
    }
  }
  return null;
}

export function crossCheckMedNeuromod({ meds, modalities } = {}) {
  const medNames = _normaliseList(
    (Array.isArray(meds) ? meds : [])
      .flatMap((m) => (m && typeof m === 'object' ? [m.name, m.generic_name] : [m]))
      .filter(Boolean)
  );
  const mods = _normaliseList(modalities)
    .map((m) => (m === 'tms' ? 'rtms' : m));
  if (!medNames.length || !mods.length) return [];
  const matches = [];
  for (const rule of MED_NEUROMOD_RULES) {
    const ruleMods = _normaliseList(rule.modalities);
    const hitsModality = ruleMods.some((rm) => mods.includes(rm) || (rm === 'rtms' && mods.includes('tms')));
    if (!hitsModality) continue;
    const matchedMed = _medMatchesRule(medNames, rule);
    if (!matchedMed) continue;
    const matchedModality = ruleMods.find((rm) => mods.includes(rm) || (rm === 'rtms' && mods.includes('tms'))) || ruleMods[0];
    matches.push({
      ...rule,
      matched_med_name: matchedMed,
      matched_modality: matchedModality,
    });
  }
  return matches;
}

export { MED_NEUROMOD_RULES, WASHOUT_PERIODS, EVIDENCE_GRADES };
export default { MED_NEUROMOD_RULES, crossCheckMedNeuromod, WASHOUT_PERIODS, EVIDENCE_GRADES, getWashoutPeriod };
