/**
 * Shared assessment scale metadata for Clinical OS (Assessments Hub, Enter Scores,
 * future reports / protocols / patient education). Registry-driven; conservative
 * licensing notes; no over-claiming of redistribution rights.
 */

/** @typedef {'item_checklist' | 'numeric_only' | 'clinician_entry'} EntryMode */

/**
 * @typedef {Object} ScaleRecord
 * @property {string} id - Canonical id (matches ASSESS_REGISTRY id where applicable)
 * @property {string} display_name
 * @property {string[]} [aliases]
 * @property {EntryMode} entry_mode
 * @property {boolean} supported_in_app - Item-level UI available in this product when true
 * @property {string} [scoring_note]
 * @property {string} [licensing_note]
 * @property {{ title: string, url: string }[]} [official_links]
 */

/** @type {Record<string, ScaleRecord>} */
export const SCALE_REGISTRY = {
  'PHQ-9': {
    id: 'PHQ-9',
    display_name: 'PHQ-9',
    aliases: [],
    entry_mode: 'item_checklist',
    supported_in_app: true,
    scoring_note: 'Sum of 9 items (0–27).',
    licensing_note: 'PHQ is widely used in public-domain contexts; follow current Pfizer/author attribution guidance for your setting.',
    official_links: [{ title: 'PHQ-9 instrument information (AHRQ)', url: 'https://www.ahrq.gov/prevention/guidelines/toolbox/behavioral/phq9.html' }],
  },
  'GAD-7': {
    id: 'GAD-7',
    display_name: 'GAD-7',
    aliases: [],
    entry_mode: 'item_checklist',
    supported_in_app: true,
    scoring_note: 'Sum of 7 items (0–21).',
    licensing_note: 'Follow author/publisher terms for your jurisdiction.',
    official_links: [{ title: 'GAD-7 overview (AHRQ)', url: 'https://www.ahrq.gov/prevention/guidelines/toolbox/behavioral/gad7.html' }],
  },
  ISI: {
    id: 'ISI',
    display_name: 'Insomnia Severity Index (ISI)',
    aliases: [],
    entry_mode: 'item_checklist',
    supported_in_app: true,
    scoring_note: 'Sum of 7 items (0–28).',
    licensing_note: 'ISI is copyrighted; obtain permission for commercial or large-scale use as required.',
    official_links: [{ title: 'ISI — University of Pittsburgh (author site)', url: 'https://www.sleep.pitt.edu/instruments/' }],
  },
  'PCL-5': {
    id: 'PCL-5',
    display_name: 'PTSD Checklist for DSM-5 (PCL-5)',
    aliases: [],
    entry_mode: 'item_checklist',
    supported_in_app: true,
    scoring_note: 'Sum of 20 items (0–80); interpret per VA/NCPTSD guidance.',
    licensing_note: 'Use per VA National Center for PTSD and publisher terms; not a standalone diagnosis.',
    official_links: [{ title: 'VA National Center for PTSD — PCL-5', url: 'https://www.ptsd.va.gov/professional/assessment/adult-sr/ptsd-checklist.asp' }],
  },
  MDQ: {
    id: 'MDQ',
    display_name: 'Mood Disorder Questionnaire (MDQ)',
    aliases: [],
    entry_mode: 'item_checklist',
    supported_in_app: true,
    scoring_note: 'In-app: Part 1 symptom count only (0–13). Full MDQ adds clustering and impairment items; interpret per original rules.',
    licensing_note: 'MDQ is copyrighted; academic/clinical use subject to author/publisher terms.',
    official_links: [{ title: 'MDQ — development paper (PMC)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC314375/' }],
  },
  ESS: {
    id: 'ESS',
    display_name: 'Epworth Sleepiness Scale (ESS)',
    aliases: ['EPWORTH'],
    entry_mode: 'item_checklist',
    supported_in_app: true,
    scoring_note: 'Sum of 8 items (0–24). Bundles may list EPWORTH; same instrument.',
    licensing_note: 'ESS is widely reproduced for clinical use; verify terms for your setting.',
    official_links: [{ title: 'Epworth Sleepiness Scale — Johns Hopkins', url: 'https://www.hopkinsmedicine.org/neurology/sleepcenter/patient_information/epworth-sleepiness-scale.pdf' }],
  },
  'HAM-D17': {
    id: 'HAM-D17',
    display_name: 'Hamilton Depression Rating Scale (HAM-D / HDRS)',
    aliases: ['HAM-D', 'HDRS-17'],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Clinician-rated total; scoring trained rater only.',
    licensing_note: 'Proprietary in many contexts; training required.',
    official_links: [{ title: 'Hamilton Depression Rating Scale — original publication (PubMed)', url: 'https://pubmed.ncbi.nlm.nih.gov/6020429/' }],
  },
  MADRS: {
    id: 'MADRS',
    display_name: 'Montgomery–Åsberg Depression Rating Scale (MADRS)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Clinician-rated 10 items.',
    licensing_note: 'Copyrighted; use only with appropriate license/training.',
    official_links: [{ title: 'Montgomery–Åsberg Depression Rating Scale — original publication (PubMed)', url: 'https://pubmed.ncbi.nlm.nih.gov/7184995/' }],
  },
  YMRS: {
    id: 'YMRS',
    display_name: 'Young Mania Rating Scale (YMRS)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Clinician-rated mania severity.',
    licensing_note: 'Copyrighted instrument; trained administration.',
    official_links: [{ title: 'Young Mania Rating Scale — original publication (PubMed)', url: 'https://pubmed.ncbi.nlm.nih.gov/6725622/' }],
  },
  'Y-BOCS': {
    id: 'Y-BOCS',
    display_name: 'Yale–Brown Obsessive Compulsive Scale (Y-BOCS)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Clinician-rated OCD severity; this app stores numeric totals only.',
    licensing_note: 'Copyrighted; clinical use requires appropriate permissions and training.',
    official_links: [{ title: 'IOCDF — Assessment (context)', url: 'https://iocdf.org/about-ocd/related-disorders/assessment/' }],
  },
  WHODAS: {
    id: 'WHODAS',
    display_name: 'WHO Disability Assessment Schedule (WHODAS)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Enter computed total per WHO scoring rules (not item UI here).',
    licensing_note: 'WHO materials — follow WHO terms of use.',
    official_links: [{ title: 'WHO — WHODAS', url: 'https://www.who.int/standards/classifications/international-classification-of-functioning-disability-and-health' }],
  },
  'EDE-Q': {
    id: 'EDE-Q',
    display_name: 'Eating Disorder Examination Questionnaire (EDE-Q)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Enter subscale/total per manual; item UI not provided in-app.',
    licensing_note: 'Copyrighted; purchase/license through rights holder.',
    official_links: [{ title: 'NEDA — Eating disorders assessment (context)', url: 'https://www.nationaleatingdisorders.org/tools-evaluation' }],
  },
  'DAST-10': {
    id: 'DAST-10',
    display_name: 'Drug Abuse Screening Test (DAST-10)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Weighted scoring per original publication; numeric entry only here.',
    licensing_note: 'Verify reproduction rights for your organization.',
    official_links: [{ title: 'SAMHSA — Screening tools', url: 'https://www.samhsa.gov/' }],
  },
  AUDIT: {
    id: 'AUDIT',
    display_name: 'Alcohol Use Disorders Identification Test (AUDIT)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: '10-item summed score per WHO scoring; numeric entry only here.',
    licensing_note: 'WHO AUDIT — follow WHO reproduction guidance.',
    official_links: [{ title: 'WHO — AUDIT', url: 'https://www.who.int/publications/i/item/9789241549390' }],
  },
  PANSS: {
    id: 'PANSS',
    display_name: 'Positive and Negative Syndrome Scale (PANSS)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Structured clinical interview; trained raters only.',
    licensing_note: 'Commercially controlled; do not redistribute proprietary text without license.',
    official_links: [{ title: 'Positive and Negative Syndrome Scale (PANSS) — original publication (PubMed)', url: 'https://pubmed.ncbi.nlm.nih.gov/2654374/' }],
  },
  'QIDS-SR': {
    id: 'QIDS-SR',
    display_name: 'QIDS-SR',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Enter total per scoring rules; item checklist not implemented in-app.',
    licensing_note: 'Copyrighted (Rush / Trivedi); obtain appropriate use rights.',
    official_links: [{ title: 'IDS / QIDS — publication context (PMC)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC314395/' }],
  },
  'C-SSRS': {
    id: 'C-SSRS',
    display_name: 'Columbia Suicide Severity Rating Scale (C-SSRS)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Use official C-SSRS scoring; numeric entry in this workflow.',
    licensing_note: 'Columbia protocols — use only with authorized training/materials.',
    official_links: [{ title: 'C-SSRS — Columbia Lighthouse Project', url: 'https://cssrs.columbia.edu/' }],
  },
  PSS: {
    id: 'PSS',
    display_name: 'Perceived Stress Scale (PSS)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Reverse-scored items per manual; numeric total entry only.',
    licensing_note: 'Copyrighted; permission may be required for some uses.',
    official_links: [{ title: 'Perceived Stress Scale — Stanford SPARQ', url: 'https://sparqtools.stanford.edu/stress-health/perceived-stress-scale/' }],
  },
  PSQI: {
    id: 'PSQI',
    display_name: 'Pittsburgh Sleep Quality Index (PSQI)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Multi-component score; enter total per manual.',
    licensing_note: 'Copyrighted instrument.',
    official_links: [{ title: 'PSQI — University of Pittsburgh (instruments)', url: 'https://www.sleep.pitt.edu/instruments/' }],
  },
  PSWQ: {
    id: 'PSWQ',
    display_name: 'Penn State Worry Questionnaire (PSWQ)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Numeric total entry.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'Penn State Worry Questionnaire — publication record', url: 'https://pubmed.ncbi.nlm.nih.gov/2250700/' }],
  },
  'SF-36': {
    id: 'SF-36',
    display_name: 'SF-36 Health Survey',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Norm-based scoring per manual; numeric entry only.',
    licensing_note: 'Commercially licensed; use authorized forms.',
    official_links: [{ title: 'RAND — SF-36 / MOS surveys', url: 'https://www.rand.org/health-care/surveys_tools/mos/health-survey-2.html' }],
  },
  SPIN: {
    id: 'SPIN',
    display_name: 'Social Phobia Inventory (SPIN)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Numeric total.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'SPIN — psychometric overview (PMC)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3237088/' }],
  },
  'OCI-R': {
    id: 'OCI-R',
    display_name: 'Obsessive–Compulsive Inventory — Revised (OCI-R)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Numeric total entry.',
    licensing_note: 'Copyrighted self-report; verify terms.',
    official_links: [{ title: 'OCI-R — validation (PMC)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1857726/' }],
  },
  'CAPS-5': {
    id: 'CAPS-5',
    display_name: 'CAPS-5 (PTSD)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Structured clinical interview; trained administration only.',
    licensing_note: 'Proprietary; requires training and license.',
    official_links: [{ title: 'PTSD.va.gov — CAPS', url: 'https://www.ptsd.va.gov/professional/assessment/adult-int/caps.asp' }],
  },
  DERS: {
    id: 'DERS',
    display_name: 'Difficulties in Emotion Regulation Scale (DERS)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Subscales/total per publication; numeric entry only.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'DERS — APA PsycNet record', url: 'https://psycnet.apa.org/record/2004-00923-007' }],
  },
  'TMS-SE': {
    id: 'TMS-SE',
    display_name: 'TMS Side-Effects (local / composite)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Enter composite per clinic protocol.',
    licensing_note: 'No standard public license; follow local SOP.',
    official_links: [{ title: 'NINDS — transcranial magnetic stimulation', url: 'https://www.ninds.nih.gov/health-information/disorders/transcranial-magnetic-stimulation' }],
  },
  'tDCS-CS': {
    id: 'tDCS-CS',
    display_name: 'tDCS Comfort / Side-Effects (local)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Numeric entry per clinic form.',
    licensing_note: 'Instrument may be adapted; document source.',
    official_links: [{ title: 'NINDS — brain stimulation research', url: 'https://www.ninds.nih.gov/health-information/topic/brain-stimulation' }],
  },
  BPI: {
    id: 'BPI',
    display_name: 'Brief Pain Inventory (BPI)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Pain severity/interference indices per manual.',
    licensing_note: 'Copyrighted (MD Anderson); permission for use as required.',
    official_links: [{ title: 'MD Anderson — Brief Pain Inventory (dictionary)', url: 'https://www.mdanderson.org/cancer-center/cancer-information/cancer-terms/dictionary/b/brief-pain-inventory.html' }],
  },
  PCS: {
    id: 'PCS',
    display_name: 'Pain Catastrophizing Scale (PCS)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Numeric total.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'Pain Catastrophizing Scale — publication (PMC)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC109876/' }],
  },
  MMSE: {
    id: 'MMSE',
    display_name: 'Mini-Mental State Examination (MMSE)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Trained administration; proprietary in many settings.',
    licensing_note: 'Psychological Assessment Resources / rights holder — restricted reproduction.',
    official_links: [{ title: 'MedlinePlus — cognitive screening overview', url: 'https://medlineplus.gov/ency/article/007396.htm' }],
  },
  MoCA: {
    id: 'MoCA',
    display_name: 'Montreal Cognitive Assessment (MoCA)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Certified administration per MoCA protocol.',
    licensing_note: 'MoCA is trademarked; official materials via mocatest.org.',
    official_links: [{ title: 'MoCA official', url: 'https://www.mocatest.org/' }],
  },
  'HAM-A': {
    id: 'HAM-A',
    display_name: 'Hamilton Anxiety Rating Scale (HAM-A)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Clinician-rated.',
    licensing_note: 'Copyrighted; trained raters.',
    official_links: [{ title: 'Hamilton Anxiety Rating Scale — original publication (PubMed)', url: 'https://pubmed.ncbi.nlm.nih.gov/4179630/' }],
  },
  PDSS: {
    id: 'PDSS',
    display_name: 'Panic Disorder Severity Scale (PDSS)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Clinician-rated 7 items.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'PDSS — validation (PMC)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2880327/' }],
  },
  BPRS: {
    id: 'BPRS',
    display_name: 'Brief Psychiatric Rating Scale (BPRS)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Trained rater.',
    licensing_note: 'Copyrighted instrument.',
    official_links: [{ title: 'Brief Psychiatric Rating Scale — original publication (PubMed)', url: 'https://pubmed.ncbi.nlm.nih.gov/511065/' }],
  },
  'CGI-S': {
    id: 'CGI-S',
    display_name: 'Clinical Global Impression — Severity (CGI-S)',
    aliases: ['CGI'],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Single-item clinician global severity (1–7).',
    licensing_note: 'Often used with industry trials; follow protocol definitions.',
    official_links: [{ title: 'FDA — clinical outcome assessments', url: 'https://www.fda.gov/drugs/development-resources-clinical-trials/clinical-outcome-assessment-coa-fda' }],
  },
  BINGE: {
    id: 'BINGE',
    display_name: 'Binge eating frequency (composite / local)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Enter per clinic definition (episodes/week etc.).',
    licensing_note: 'Not a single licensed form in-app; document methodology.',
    official_links: [{ title: 'NIDDK — binge eating disorder', url: 'https://www.niddk.nih.gov/health-information/weight-management/binge-eating-disorder' }],
  },
  THI: {
    id: 'THI',
    display_name: 'Tinnitus Handicap Inventory (THI)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Numeric total.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'THI — psychometric paper (PMC)', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1638114/' }],
  },
  FSS: {
    id: 'FSS',
    display_name: 'Fatigue Severity Scale (FSS)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Mean score × etc. per publication.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'National MS Society — fatigue', url: 'https://www.nationalmssociety.org/Symptoms-Diagnosis/MS-Symptoms/Fatigue' }],
  },
  'SF-12': {
    id: 'SF-12',
    display_name: 'SF-12',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Norm-based scoring; numeric entry.',
    licensing_note: 'Commercially licensed.',
    official_links: [{ title: 'RAND — SF-12', url: 'https://www.rand.org/health-care/surveys_tools/mos/short-form-health-survey-12.html' }],
  },
  'ADHD-RS-5': {
    id: 'ADHD-RS-5',
    display_name: 'ADHD Rating Scale',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Clinician/teacher forms per manual.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'ADHD Rating Scale — IV (PubMed)', url: 'https://pubmed.ncbi.nlm.nih.gov/8586218/' }],
  },
  'DASS-21': {
    id: 'DASS-21',
    display_name: 'DASS-21',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Subscale sums; numeric entry.',
    licensing_note: 'Copyright held by authors; free for research in many cases — verify.',
    official_links: [{ title: 'DASS — University of New South Wales', url: 'https://www2.psy.unsw.edu.au/dass/' }],
  },
  'NRS-Pain': {
    id: 'NRS-Pain',
    display_name: 'Numeric Pain Rating (NRS)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: '0–10 single rating.',
    licensing_note: 'Public domain concept.',
    official_links: [{ title: 'MedlinePlus — pain overview', url: 'https://medlineplus.gov/pain.html' }],
  },
  'NRS-SE': {
    id: 'NRS-SE',
    display_name: 'Side-effect severity (NRS)',
    aliases: [],
    entry_mode: 'numeric_only',
    supported_in_app: false,
    scoring_note: 'Local scale.',
    licensing_note: 'Document clinic source.',
    official_links: [{ title: 'FDA — understanding medication side effects', url: 'https://www.fda.gov/consumers/consumer-updates/trying-understand-side-effects-prescription-medicines' }],
  },
  'UPDRS-III': {
    id: 'UPDRS-III',
    display_name: 'UPDRS Part III (motor)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Trained motor examination.',
    licensing_note: 'MDS / movement disorders society materials — follow terms.',
    official_links: [{ title: 'MDS — rating scales', url: 'https://www.movementdisorders.org/Resources/MDS-Rating-Scales/' }],
  },
  LSAS: {
    id: 'LSAS',
    display_name: 'Liebowitz Social Anxiety Scale (LSAS)',
    aliases: [],
    entry_mode: 'clinician_entry',
    supported_in_app: false,
    scoring_note: 'Clinician-rated.',
    licensing_note: 'Copyrighted.',
    official_links: [{ title: 'Liebowitz Social Anxiety Scale — publication record', url: 'https://pubmed.ncbi.nlm.nih.gov/2839706/' }],
  },
};

function buildAliasMap() {
  /** @type {Record<string, string>} */
  const m = {};
  for (const row of Object.values(SCALE_REGISTRY)) {
    m[row.id] = row.id;
    for (const a of row.aliases || []) {
      m[a] = row.id;
    }
  }
  return m;
}

export const SCALE_ALIAS_TO_CANONICAL = buildAliasMap();

/**
 * @param {string | null | undefined} raw
 * @returns {string} Canonical id, or trimmed raw if unknown alias
 */
export function resolveScaleCanonical(raw) {
  if (raw == null) return '';
  const k = String(raw).trim();
  if (!k) return '';
  return SCALE_ALIAS_TO_CANONICAL[k] || k;
}

const FALLBACK = {
  id: '_UNKNOWN',
  display_name: 'Unlisted scale',
  aliases: [],
  entry_mode: /** @type {EntryMode} */ ('numeric_only'),
  supported_in_app: false,
  scoring_note: 'No registry entry — enter a numeric total if your protocol uses this abbreviation.',
  licensing_note: 'Verify correct instrument, scoring, and licensing before clinical use.',
  official_links: [],
};

/**
 * Resolved scale metadata for UI and flows.
 * @typedef {ScaleRecord & { canonical_id: string, unknown: boolean, raw_token?: string }} ResolvedScaleMeta
 */

/**
 * @param {string | null | undefined} raw
 * @returns {ResolvedScaleMeta}
 */
export function getScaleMeta(raw) {
  const token = raw == null ? '' : String(raw).trim();
  if (!token) {
    return { ...FALLBACK, canonical_id: '', unknown: true, display_name: '—', id: '' };
  }
  const canon = resolveScaleCanonical(token);
  const row = SCALE_REGISTRY[canon];
  if (!row) {
    return {
      ...FALLBACK,
      id: canon,
      display_name: canon,
      canonical_id: canon,
      unknown: true,
      raw_token: token,
    };
  }
  return {
    ...row,
    canonical_id: canon,
    unknown: false,
    raw_token: token !== canon ? token : undefined,
  };
}

/**
 * UI badge: conservative short label + tooltip.
 * @param {ResolvedScaleMeta} meta
 */
export function scaleStatusBadge(meta) {
  if (!meta || meta.unknown) {
    return {
      short: 'Unlisted',
      detail: 'No metadata for this token. Confirm abbreviation and instrument.',
      variant: 'unknown',
    };
  }
  const lic = !!(meta.licensing_note && meta.licensing_note.length > 12);
  if (meta.entry_mode === 'item_checklist' && meta.supported_in_app) {
    return {
      short: lic ? 'In-app · verify license' : 'In-app',
      detail: [meta.scoring_note, meta.licensing_note].filter(Boolean).join(' '),
      variant: 'in_app',
    };
  }
  if (meta.entry_mode === 'clinician_entry') {
    return {
      short: lic ? 'Clinician · restricted' : 'Clinician scored',
      detail: [meta.scoring_note, meta.licensing_note].filter(Boolean).join(' '),
      variant: 'clinician',
    };
  }
  return {
    short: lic ? 'Numeric · licensed' : 'Numeric only',
    detail: [meta.scoring_note, meta.licensing_note].filter(Boolean).join(' '),
    variant: 'numeric',
  };
}

/**
 * Inline HTML for a scale token with status badge (escaped).
 * @param {string} rawAbbrev
 */
export function formatScaleWithBadgeHtml(rawAbbrev) {
  const meta = getScaleMeta(rawAbbrev);
  const b = scaleStatusBadge(meta);
  const abbr = _esc(String(rawAbbrev));
  const cls = {
    in_app: 'ah2-sb ah2-sb--inapp',
    numeric: 'ah2-sb ah2-sb--num',
    clinician: 'ah2-sb ah2-sb--clin',
    unknown: 'ah2-sb ah2-sb--unk',
  }[b.variant] || 'ah2-sb ah2-sb--unk';
  return '<span class="ah2-sb-wrap"><span class="ah2-sb-abbr">' + abbr + '</span> <span class="' + cls + '" title="' + _esc(b.detail) + '">' + _esc(b.short) + '</span></span>';
}

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/**
 * Unique scale tokens across all phases, with metadata rows.
 * @param {{ phases: Record<string, string[]> }} cond
 * @param {string[]} phaseKeys
 */
export function enumerateBundleScales(cond, phaseKeys) {
  const ids = new Set();
  for (const ph of phaseKeys) {
    for (const sid of cond.phases[ph] || []) ids.add(sid);
  }
  return [...ids].sort().map(raw => ({ raw, meta: getScaleMeta(raw) }));
}

/**
 * Group scale ids for summary lists (condition modal).
 * @param {string[]} rawIds
 */
export function partitionScalesByEntryMode(rawIds) {
  const inApp = [];
  const numeric = [];
  const clinician = [];
  const unknown = [];
  const seen = new Set();
  for (const raw of rawIds) {
    const k = String(raw);
    if (seen.has(k)) continue;
    seen.add(k);
    const m = getScaleMeta(k);
    if (m.unknown) unknown.push(k);
    else if (m.entry_mode === 'item_checklist' && m.supported_in_app) inApp.push(k);
    else if (m.entry_mode === 'clinician_entry') clinician.push(k);
    else numeric.push(k);
  }
  return { inApp, numeric, clinician, unknown };
}
