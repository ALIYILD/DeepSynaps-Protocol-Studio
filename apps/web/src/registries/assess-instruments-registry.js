/**
 * Inline and score-entry instruments available in Clinical OS (Enter Scores, Assessments Hub).
 * Kept separate from SCALE_REGISTRY so metadata vs. UI can be cross-checked (see scale-registry-alignment.js).
 *
 * Licensing fields on each entry:
 *   licensing.tier: 'public_domain' | 'us_gov' | 'academic' | 'licensed' | 'restricted'
 *   licensing.embedded_text_allowed: whether item text is permitted inline
 *   licensing.attribution / licensing.url / licensing.source: provenance for UI footer
 *
 * Entries whose `inline: true` MUST have `embedded_text_allowed: true`. Any
 * entry with full item text must carry source + attribution. Entries without
 * permission fall back to score-entry mode and display the licensing note.
 */

// Public-domain and US-Gov entries: safe to embed full items.
const LIC_PHQ = { tier: 'public_domain', source: 'Kroenke et al., J Gen Intern Med. 2001', url: 'https://www.phqscreeners.com/', attribution: '© Pfizer Inc. — unrestricted use.', embedded_text_allowed: true };
const LIC_GAD = { tier: 'public_domain', source: 'Spitzer et al., Arch Intern Med. 2006', url: 'https://www.phqscreeners.com/', attribution: '© Pfizer Inc. — unrestricted use.', embedded_text_allowed: true };
const LIC_PCL5 = { tier: 'us_gov', source: 'Weathers et al., NCPTSD 2013', url: 'https://www.ptsd.va.gov/professional/assessment/adult-sr/ptsd-checklist.asp', attribution: 'PCL-5 — US National Center for PTSD (public domain).', embedded_text_allowed: true };
const LIC_ESS = { tier: 'academic', source: 'Johns MW, Sleep 1991', url: 'https://epworthsleepinessscale.com/', attribution: 'ESS © Murray W. Johns. Academic use permitted.', embedded_text_allowed: true };
const LIC_MDQ = { tier: 'academic', source: 'Hirschfeld et al., Am J Psychiatry 2000', url: 'https://www.sadag.org/images/pdf/mdq.pdf', attribution: 'MDQ © Hirschfeld; free clinical use.', embedded_text_allowed: true };
// Licensed / restricted entries: keep metadata only.
const LIC_ISI = { tier: 'licensed', source: 'Morin CM, 1993', url: 'https://eprovide.mapi-trust.org/instruments/insomnia-severity-index', attribution: '© Charles M. Morin. License required for item-text redistribution.', embedded_text_allowed: false };
const LIC_ADHD_RS5 = { tier: 'licensed', source: 'DuPaul et al., Guilford Press 2016', url: 'https://www.guilford.com/', attribution: '© Guilford Publications.', embedded_text_allowed: false };
const LIC_UPDRS = { tier: 'licensed', source: 'MDS, 2008', url: 'https://www.movementdisorders.org/', attribution: '© International Parkinson and MDS.', embedded_text_allowed: false };
const LIC_SF12 = { tier: 'licensed', source: 'Ware et al., 1996', url: 'https://www.qualitymetric.com/', attribution: '© QualityMetric/Optum. Commercial licence required.', embedded_text_allowed: false };
const LIC_DASS = { tier: 'academic', source: 'Lovibond & Lovibond, UNSW 1995', url: 'http://www2.psy.unsw.edu.au/dass/', attribution: 'DASS © Lovibond. Free for research and clinical use with attribution.', embedded_text_allowed: true };
const LIC_YBOCS = { tier: 'licensed', source: 'Goodman et al., 1989', url: 'https://www.mcmaster.ca/', attribution: 'Y-BOCS © Goodman. License required.', embedded_text_allowed: false };
const LIC_CSSRS = { tier: 'restricted', source: 'Posner et al., 2008', url: 'https://cssrs.columbia.edu/', attribution: 'C-SSRS © Research Foundation for Mental Hygiene. Training required.', embedded_text_allowed: false };
const LIC_MADRS = { tier: 'licensed', source: 'Montgomery & Åsberg 1979', url: 'https://www.mdcalc.com/madrs', attribution: '© Montgomery & Åsberg. Clinician-rated.', embedded_text_allowed: false };
const LIC_HDRS = { tier: 'licensed', source: 'Hamilton 1960', url: 'https://en.wikipedia.org/wiki/Hamilton_Rating_Scale_for_Depression', attribution: 'HAM-D © Hamilton.', embedded_text_allowed: false };
const LIC_GENERIC = { tier: 'licensed', source: 'Proprietary', url: null, attribution: 'Licensed instrument; administer via authorized form.', embedded_text_allowed: false };
const LIC_PD = { tier: 'public_domain', source: 'Public domain', url: null, attribution: 'Public-domain scale.', embedded_text_allowed: true };

export const ASSESS_REGISTRY = [
  // Inline questionnaires
  { id: 'PHQ-9', t: 'PHQ-9 Depression Scale', abbr: 'PHQ-9', sub: 'Patient health questionnaire, 9-item', cat: 'Depression', tags: ['depression', 'outcome'], max: 27, inline: true,
    questions: ['Little interest or pleasure in doing things','Feeling down, depressed, or hopeless','Trouble falling or staying asleep, or sleeping too much','Feeling tired or having little energy','Poor appetite or overeating','Feeling bad about yourself — or that you are a failure','Trouble concentrating on things','Moving or speaking so slowly that other people could notice (or the opposite)','Thoughts that you would be better off dead, or of hurting yourself'],
    options: ['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'],
    interpret: (s) => s<=4?{label:'Minimal',color:'var(--teal)'}:s<=9?{label:'Mild',color:'#60a5fa'}:s<=14?{label:'Moderate',color:'#f59e0b'}:s<=19?{label:'Moderately Severe',color:'#f97316'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_PHQ, scoringKey: 'PHQ-9',
  },
  { id: 'GAD-7', t: 'GAD-7 Anxiety Scale', abbr: 'GAD-7', sub: 'Generalised anxiety disorder, 7-item', cat: 'Anxiety', tags: ['anxiety', 'outcome'], max: 21, inline: true,
    questions: ['Feeling nervous, anxious, or on edge','Not being able to stop or control worrying','Worrying too much about different things','Trouble relaxing','Being so restless that it is hard to sit still','Becoming easily annoyed or irritable','Feeling afraid as if something awful might happen'],
    options: ['Not at all (0)','Several days (1)','More than half the days (2)','Nearly every day (3)'],
    interpret: (s) => s<=4?{label:'Minimal',color:'var(--teal)'}:s<=9?{label:'Mild',color:'#60a5fa'}:s<=14?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_GAD, scoringKey: 'GAD-7',
  },
  // ISI is a copyrighted instrument (© Morin). DeepSynaps stores metadata + total
  // score only. Item text must be administered via an authorized copy.
  { id: 'ISI', t: 'Insomnia Severity Index', abbr: 'ISI', sub: 'Sleep quality — licensed instrument, score entry only', cat: 'Sleep', tags: ['insomnia', 'CES'], max: 28, inline: false,
    interpret: (s) => s<=7?{label:'No clinically significant insomnia',color:'var(--teal)'}:s<=14?{label:'Subthreshold insomnia',color:'#60a5fa'}:s<=21?{label:'Moderate clinical insomnia',color:'#f59e0b'}:{label:'Severe clinical insomnia',color:'var(--red)'},
    licensing: LIC_ISI, scoringKey: 'ISI',
  },
  { id: 'MDQ', t: 'Mood Disorder Questionnaire', abbr: 'MDQ', sub: 'Part 1 only — add official clustering + impairment items for full screen', cat: 'Mood', tags: ['bipolar', 'screening'], max: 13, inline: true,
    questions: [
      'You felt so good or so hyper that other people thought you were not your normal self or you were so hyper that you got into trouble?',
      'You were so irritable that you shouted at people or started fights or arguments?',
      'You felt much more self-confident than usual?',
      'You got much less sleep than usual and found you did not really miss it?',
      'You were more talkative or spoke much faster than usual?',
      'Thoughts raced through your head or you could not slow your mind down?',
      'You were so easily distracted by things around you that you had trouble concentrating or staying on track?',
      'You had much more energy than usual?',
      'You were much more active or did many more things than usual?',
      'You were much more social or outgoing than usual — for example, you telephoned friends in the middle of the night?',
      'You were much more interested in sex than usual?',
      'You did things that were unusual for you or that other people might have thought were excessive, foolish, or risky?',
      'Spending money got you or your family in trouble?',
    ],
    options: ['No (0)','Yes (1)'],
    interpret: (s) => s<7?{label:'Below Part 1 count threshold',color:'var(--teal)'}:{label:'Part 1 threshold met — complete full MDQ + clinical interview',color:'#f59e0b'},
    licensing: LIC_MDQ, scoringKey: 'MDQ',
  },
  // Score-entry scales (licensed clinician-rated instruments: metadata + numeric entry only)
  { id: 'HAM-D17', t: 'Hamilton Depression Rating Scale', abbr: 'HAM-D', sub: 'Clinician-rated depression, 17-item', cat: 'Depression', tags: ['depression', 'clinician-rated'], max: 52, inline: false,
    interpret: (s) => s<=7?{label:'Normal',color:'var(--teal)'}:s<=13?{label:'Mild',color:'#60a5fa'}:s<=18?{label:'Moderate',color:'#f59e0b'}:s<=22?{label:'Severe',color:'#f97316'}:{label:'Very Severe',color:'var(--red)'},
    licensing: LIC_HDRS, scoringKey: 'HDRS-17' },
  { id: 'MADRS', t: 'Montgomery-Åsberg Depression Rating Scale', abbr: 'MADRS', sub: 'Clinician-rated depression, 10-item', cat: 'Depression', tags: ['depression', 'clinician-rated'], max: 60, inline: false,
    interpret: (s) => s<=6?{label:'Normal',color:'var(--teal)'}:s<=19?{label:'Mild',color:'#60a5fa'}:s<=34?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_MADRS, scoringKey: 'MADRS' },
  { id: 'YMRS', t: 'Young Mania Rating Scale', abbr: 'YMRS', sub: 'Mania symptom severity, 11-item', cat: 'Mood', tags: ['bipolar', 'mania', 'clinician-rated'], max: 60, inline: false,
    interpret: (s) => s<=12?{label:'Normal/Remission',color:'var(--teal)'}:s<=20?{label:'Mild',color:'#60a5fa'}:s<=30?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_GENERIC, scoringKey: 'YMRS' },
  { id: 'PCL-5', t: 'PTSD Checklist (PCL-5)', abbr: 'PCL-5', sub: 'PTSD symptom scale (DSM-5), 20 items, past month', cat: 'Trauma', tags: ['PTSD', 'taVNS'], max: 80, inline: true,
    questions: [
      'Repeated, disturbing, and unwanted memories of the stressful experience?',
      'Repeated, disturbing dreams of the stressful experience?',
      'Suddenly feeling or acting as if the stressful experience were actually happening again (as if you were actually back there reliving it)?',
      'Feeling very upset when something reminded you of the stressful experience?',
      'Having strong physical reactions when something reminded you of the stressful experience (for example, heart pounding, trouble breathing, sweating)?',
      'Avoiding memories, thoughts, or feelings related to the stressful experience?',
      'Avoiding external reminders of the stressful experience (for example, people, places, conversations, activities, objects, or situations)?',
      'Trouble remembering important parts of the stressful experience?',
      'Having strong negative beliefs about yourself, other people, or the world (for example, having thoughts such as: I am bad, there is something seriously wrong with me, no one can be trusted, the world is completely dangerous)?',
      'Blaming yourself or someone else for the stressful experience or what happened after it?',
      'Having strong negative feelings such as fear, horror, anger, guilt, or shame?',
      'Loss of interest in activities that you used to enjoy?',
      'Feeling distant or cut off from other people?',
      'Trouble experiencing positive feelings (for example, being unable to feel happiness or having loving feelings for people close to you)?',
      'Irritable behavior, angry outbursts, or acting aggressively?',
      'Taking too many risks or doing things that could cause you harm?',
      'Being "superalert" or watchful or on guard?',
      'Feeling jumpy or easily startled?',
      'Having difficulty concentrating?',
      'Trouble falling or staying asleep?',
    ],
    options: ['Not at all (0)','A little bit (1)','Moderately (2)','Quite a bit (3)','Extremely (4)'],
    interpret: (s) => s<33?{label:'No probable PTSD',color:'var(--teal)'}:{label:'Probable PTSD',color:'var(--red)'},
    licensing: LIC_PCL5, scoringKey: 'PCL-5' },
  { id: 'Y-BOCS', t: 'Yale-Brown OC Scale', abbr: 'Y-BOCS', sub: 'OCD severity, 10-item', cat: 'OCD', tags: ['OCD', 'anxiety'], max: 40, inline: false,
    interpret: (s) => s<=7?{label:'Subclinical',color:'var(--teal)'}:s<=15?{label:'Mild',color:'#60a5fa'}:s<=23?{label:'Moderate',color:'#f59e0b'}:s<=31?{label:'Severe',color:'#f97316'}:{label:'Extreme',color:'var(--red)'},
    licensing: LIC_YBOCS, scoringKey: 'Y-BOCS' },
  { id: 'OCI-R', t: 'OCD Inventory-Revised', abbr: 'OCI-R', sub: 'OCD self-report, 18-item', cat: 'OCD', tags: ['OCD', 'anxiety'], max: 72, inline: false,
    interpret: (s) => s<18?{label:'Below threshold',color:'var(--teal)'}:{label:'OCD likely',color:'var(--red)'},
    licensing: LIC_GENERIC, scoringKey: 'OCI-R' },
  { id: 'PDSS', t: 'Panic Disorder Severity Scale', abbr: 'PDSS', sub: 'Panic disorder, 7-item clinician-rated', cat: 'Anxiety', tags: ['panic', 'anxiety'], max: 28, inline: false,
    interpret: (s) => s<=5?{label:'Minimal',color:'var(--teal)'}:s<=10?{label:'Mild',color:'#60a5fa'}:s<=15?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_GENERIC, scoringKey: 'PDSS' },
  { id: 'LSAS', t: 'Liebowitz Social Anxiety Scale', abbr: 'LSAS', sub: 'Social anxiety, 24-item', cat: 'Anxiety', tags: ['social-anxiety'], max: 144, inline: false,
    interpret: (s) => s<30?{label:'None/Minimal',color:'var(--teal)'}:s<60?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_GENERIC, scoringKey: 'LSAS' },
  { id: 'ADHD-RS-5', t: 'ADHD Rating Scale', abbr: 'ADHD-RS', sub: 'Executive function & attention, 18-item', cat: 'ADHD', tags: ['ADHD', 'NFB'], max: 54, inline: false,
    interpret: (s) => s<=16?{label:'Normal',color:'var(--teal)'}:s<=32?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_ADHD_RS5, scoringKey: 'ADHD-RS-5' },
  { id: 'DASS-21', t: 'DASS-21', abbr: 'DASS-21', sub: 'Depression, Anxiety & Stress Scales, 21-item', cat: 'Mood', tags: ['depression', 'anxiety', 'stress'], max: 63, inline: false,
    interpret: (s) => s<=14?{label:'Normal',color:'var(--teal)'}:s<=28?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_DASS, scoringKey: 'DASS-21' },
  { id: 'UPDRS-III', t: 'UPDRS-III Motor Assessment', abbr: 'UPDRS-III', sub: "Parkinson's motor function, 27-item", cat: "Parkinson's", tags: ['PD', 'TPS', 'motor'], max: 108, inline: false,
    interpret: (s) => s<=19?{label:'Mild',color:'#60a5fa'}:s<=39?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_UPDRS, scoringKey: 'UPDRS-III' },
  { id: 'NRS-Pain', t: 'Numeric Pain Rating Scale', abbr: 'NRS', sub: 'Pain intensity 0–10', cat: 'Pain', tags: ['pain', 'tDCS'], max: 10, inline: false,
    interpret: (s) => s<=3?{label:'Mild pain',color:'#60a5fa'}:s<=6?{label:'Moderate pain',color:'#f59e0b'}:{label:'Severe pain',color:'var(--red)'},
    licensing: LIC_PD, scoringKey: 'NRS-Pain' },
  { id: 'NRS-SE', t: 'Side Effect Severity Rating', abbr: 'NRS-SE', sub: 'Neuromodulation side effects 0–10', cat: 'Safety', tags: ['side-effects', 'safety'], max: 10, inline: false,
    interpret: (s) => s<=2?{label:'Minimal',color:'var(--teal)'}:s<=5?{label:'Moderate — monitor',color:'#f59e0b'}:{label:'Significant — review',color:'var(--red)'},
    licensing: LIC_PD, scoringKey: 'NRS-SE' },
  { id: 'PSQI', t: 'Pittsburgh Sleep Quality Index', abbr: 'PSQI', sub: 'Sleep quality & disturbances, 7-component', cat: 'Sleep', tags: ['sleep', 'insomnia'], max: 21, inline: false,
    interpret: (s) => s<=5?{label:'Good sleep',color:'var(--teal)'}:{label:'Poor sleep',color:'var(--red)'},
    licensing: LIC_GENERIC, scoringKey: 'PSQI' },
  { id: 'ESS', t: 'Epworth Sleepiness Scale', abbr: 'ESS', sub: 'Likelihood of dozing in eight situations (past month)', cat: 'Sleep', tags: ['sleep', 'fatigue'], max: 24, inline: true,
    questions: [
      'Sitting and reading',
      'Watching TV',
      'Sitting inactive in a public place (e.g., a theatre or meeting)',
      'As a passenger in a car for an hour without a break',
      'Lying down to rest in the afternoon when circumstances permit',
      'Sitting and talking to someone',
      'Sitting quietly after lunch without alcohol',
      'In a car, while stopped for a few minutes in traffic',
    ],
    options: ['No chance (0)','Slight chance (1)','Moderate chance (2)','High chance (3)'],
    interpret: (s) => s<=10?{label:'Normal daytime sleepiness',color:'var(--teal)'}:s<=15?{label:'Excessive daytime sleepiness',color:'#f59e0b'}:{label:'Severe sleepiness — clinical follow-up',color:'var(--red)'},
    licensing: LIC_ESS, scoringKey: 'ESS' },
  { id: 'SF-12', t: 'Short Form Health Survey (SF-12)', abbr: 'SF-12', sub: 'Health-related quality of life — licensed, score entry only', cat: 'QoL', tags: ['quality-of-life', 'function'], max: 100, inline: false,
    interpret: (s) => s>=50?{label:'Above average QoL',color:'var(--teal)'}:{label:'Below average QoL',color:'#f59e0b'},
    licensing: LIC_SF12, scoringKey: 'SF-12' },
  { id: 'THI', t: 'Tinnitus Handicap Inventory', abbr: 'THI', sub: 'Tinnitus severity & impact, 25-item', cat: 'Sensory', tags: ['tinnitus', 'TMS'], max: 100, inline: false,
    interpret: (s) => s<=16?{label:'Slight',color:'var(--teal)'}:s<=36?{label:'Mild',color:'#60a5fa'}:s<=56?{label:'Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_GENERIC, scoringKey: 'THI' },
  { id: 'FSS', t: 'Fatigue Severity Scale', abbr: 'FSS', sub: 'Fatigue impact, 9-item', cat: 'Function', tags: ['fatigue', 'MS', 'TBI'], max: 63, inline: false,
    interpret: (s) => s<36?{label:'Normal',color:'var(--teal)'}:{label:'Clinically significant fatigue',color:'#f59e0b'},
    licensing: LIC_GENERIC, scoringKey: 'FSS' },
  { id: 'CGI-S', t: 'Clinical Global Impression — Severity', abbr: 'CGI-S', sub: 'Global severity rating 1–7', cat: 'Global', tags: ['global', 'clinician-rated'], max: 7, inline: false,
    interpret: (s) => s<=2?{label:'Normal/Borderline',color:'var(--teal)'}:s<=4?{label:'Mild–Moderate',color:'#f59e0b'}:{label:'Severe',color:'var(--red)'},
    licensing: LIC_PD, scoringKey: 'CGI-S' },
  { id: 'AUDIT', t: 'Alcohol Use Disorders Identification Test', abbr: 'AUDIT', sub: 'Alcohol misuse screening, 10-item', cat: 'Substance', tags: ['alcohol', 'substance'], max: 40, inline: false,
    interpret: (s) => s<=7?{label:'Low risk',color:'var(--teal)'}:s<=15?{label:'Medium risk',color:'#f59e0b'}:{label:'High risk',color:'var(--red)'},
    licensing: LIC_PD, scoringKey: 'AUDIT' },
  // Columbia Suicide Severity Rating Scale — restricted instrument; numeric entry only.
  { id: 'C-SSRS', t: 'Columbia Suicide Severity Rating Scale', abbr: 'C-SSRS', sub: 'Suicide risk screener — restricted, score entry only', cat: 'Safety', tags: ['suicide', 'safety', 'clinician-rated'], max: 6, inline: false,
    interpret: (s) => s<=0?{label:'No Ideation',color:'var(--teal)'}:s<=1?{label:'Passive ideation',color:'#60a5fa'}:s<=3?{label:'Active ideation — clinician review',color:'#f59e0b'}:{label:'Behavior / plan — escalate immediately',color:'var(--red)'},
    licensing: LIC_CSSRS, scoringKey: 'C-SSRS' },
];

/** Backward-compat alias (patient profile tab) */
export const ASSESS_TEMPLATES = ASSESS_REGISTRY;
