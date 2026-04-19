/**
 * Home program task templates aligned with the 53 clinical condition bundles (CON-001 … CON-053).
 * Instructions are educational placeholders for clinicians to tailor; not medical advice.
 *
 * Resolution uses a traceable confidence model (see mergeMatchesByConditionId, buildRankedHomeSuggestions).
 */

export const CONDITION_HOME_TEMPLATES = [
  { id: 'chp-CON-001', conditionId: 'CON-001', conditionName: 'Major Depressive Disorder', category: 'Mood', title: 'Behavioural activation — one valued activity', type: 'activity', frequency: 'daily', instructions: 'Schedule one small meaningful activity (e.g. 15–20 min walk, call a friend, light hobby). Note mood 0–10 before and after. Start modest; increase only if tolerated.', reason: 'Behavioural activation supports mood recovery (evidence-based for depression).' },
  { id: 'chp-CON-002', conditionId: 'CON-002', conditionName: 'Treatment-Resistant Depression', category: 'Mood', title: 'Mood & energy log with activity plan', type: 'mood-journal', frequency: 'daily', instructions: 'Track mood, sleep, and side effects. Pair each day with one planned pleasant or mastery activity. Share changes with your clinician.', reason: 'Supports monitoring while advanced treatments are optimised.' },
  { id: 'chp-CON-003', conditionId: 'CON-003', conditionName: 'Bipolar I Disorder', category: 'Mood', title: 'Sleep & rhythm stabilisation', type: 'sleep', frequency: 'daily', instructions: 'Fixed wake time daily. Limit late-night light. Note sleep duration and any reduced need for sleep. Report manic symptoms promptly.', reason: 'Sleep regularity supports mood stability in bipolar spectrum conditions.' },
  { id: 'chp-CON-004', conditionId: 'CON-004', conditionName: 'Bipolar II Disorder', category: 'Mood', title: 'Mood spectrum diary', type: 'mood-journal', frequency: 'daily', instructions: 'Brief daily entry: mood, irritability, energy, sleep. Flag hypomanic patterns (decreased sleep with increased energy) for your team.', reason: 'Early detection of mood shifts guides care.' },
  { id: 'chp-CON-005', conditionId: 'CON-005', conditionName: 'Persistent Depressive Disorder', category: 'Mood', title: 'Weekly goal + daily check-in', type: 'mood-journal', frequency: 'daily', instructions: 'Set one realistic weekly behavioural goal. Daily: did you move toward it? One sentence on what helped or blocked progress.', reason: 'Sustained small steps address chronic low mood.' },
  { id: 'chp-CON-006', conditionId: 'CON-006', conditionName: 'Seasonal Affective Disorder', category: 'Mood', title: 'Daylight movement block', type: 'activity', frequency: 'daily', instructions: 'Spend 20–30 minutes outdoors in morning light when possible, or bright light per clinician guidance. Note energy and mood.', reason: 'Light exposure and activity commonly support seasonal depression.' },
  { id: 'chp-CON-007', conditionId: 'CON-007', conditionName: 'Postpartum Depression', category: 'Mood', title: 'Rest & support check-in', type: 'caregiver', frequency: 'daily', instructions: 'Coordinate with your partner/support for one protected rest period. Log feeding/sleep stressors. Reach out if thoughts of harm arise.', reason: 'Sleep and support reduce risk and aid recovery (use crisis services if needed).' },
  { id: 'chp-CON-008', conditionId: 'CON-008', conditionName: 'Premenstrual Dysphoric Disorder', category: 'Mood', title: 'Cycle-linked symptom tracker', type: 'mood-journal', frequency: 'daily', instructions: 'Note cycle day, mood, irritability, sleep, and physical symptoms. Patterns help time interventions.', reason: 'Symptom timing informs treatment planning.' },
  { id: 'chp-CON-009', conditionId: 'CON-009', conditionName: 'Depression with Psychotic Features', category: 'Mood', title: 'Medication & routine adherence log', type: 'assessment', frequency: 'daily', instructions: 'Record medication as prescribed, sleep, and any unusual experiences. Do not change meds without your psychiatrist.', reason: 'Stability and accurate reporting guide antipsychotic and mood care.' },
  { id: 'chp-CON-010', conditionId: 'CON-010', conditionName: 'Suicidality and Crisis Management', category: 'Mood', title: 'Safety plan review', type: 'assessment', frequency: 'daily', instructions: 'Read your written safety plan: warning signs, coping steps, supports, crisis numbers. If imminent risk, call local emergency or crisis line immediately.', reason: 'Structured safety planning is standard in suicide prevention care.' },
  { id: 'chp-CON-011', conditionId: 'CON-011', conditionName: 'Generalized Anxiety Disorder', category: 'Anxiety', title: 'Worry time + breathing', type: 'breathing', frequency: 'daily', instructions: 'Reserve 15 minutes for “worry time.” Outside that window, defer worries to the next slot. Add 5 minutes slow breathing (longer exhale).', reason: 'Limits worry generalisation; breathing lowers autonomic arousal.' },
  { id: 'chp-CON-012', conditionId: 'CON-012', conditionName: 'Panic Disorder', category: 'Anxiety', title: 'Interoceptive homework (as prescribed)', type: 'breathing', frequency: '3x-week', instructions: 'Complete the brief exposure exercises agreed with your therapist (e.g. light exertion). Log peak anxiety 0–10 and duration. No avoidance of safe activities.', reason: 'Graded exposure reduces panic cycle.' },
  { id: 'chp-CON-013', conditionId: 'CON-013', conditionName: 'Social Anxiety Disorder', category: 'Anxiety', title: 'Graded social micro-step', type: 'activity', frequency: '3x-week', instructions: 'One small social step (greeting, question, short call). Note predicted vs actual anxiety. Celebrate completion, not perfection.', reason: 'Behavioural experiments reduce avoidance.' },
  { id: 'chp-CON-014', conditionId: 'CON-014', conditionName: 'Specific Phobia', category: 'Anxiety', title: 'Hierarchy practice step', type: 'activity', frequency: '3x-week', instructions: 'Complete the next step on your exposure hierarchy from therapy. Log SUDS before/after. Stop if not agreed with clinician.', reason: 'Graded exposure is first-line for specific phobia.' },
  { id: 'chp-CON-015', conditionId: 'CON-015', conditionName: 'Adjustment Disorder with Anxiety', category: 'Anxiety', title: 'Problem-solving worksheet', type: 'mood-journal', frequency: 'weekly', instructions: 'Identify one stressor. List controllable parts, one action for this week, and who can help. Note mood impact.', reason: 'Structured coping supports adjustment.' },
  { id: 'chp-CON-016', conditionId: 'CON-016', conditionName: 'Obsessive-Compulsive Disorder', category: 'OCD Spectrum', title: 'ERP practice log', type: 'mood-journal', frequency: 'daily', instructions: 'Complete agreed exposure and limit rituals per your therapist. Log urge strength and ritual delay time.', reason: 'Exposure with response prevention reduces OCD symptoms.' },
  { id: 'chp-CON-017', conditionId: 'CON-017', conditionName: 'Body Dysmorphic Disorder', category: 'OCD Spectrum', title: 'Mirror & reassurance limits', type: 'mood-journal', frequency: 'daily', instructions: 'Set fixed mirror time (e.g. hygiene only). Log urges to check or seek reassurance and use agreed alternative behaviours.', reason: 'Reduces maintenance cycles common in BDD.' },
  { id: 'chp-CON-018', conditionId: 'CON-018', conditionName: 'Hoarding Disorder', category: 'OCD Spectrum', title: 'Timed declutter session', type: 'activity', frequency: '3x-week', instructions: '15-minute session in one zone. Sort “keep / discard / decide later” per clinician plan. Photo progress.', reason: 'Graded sorting is core to hoarding treatment.' },
  { id: 'chp-CON-019', conditionId: 'CON-019', conditionName: 'Post-Traumatic Stress Disorder', category: 'Trauma', title: 'Grounding after triggers', type: 'breathing', frequency: 'daily', instructions: 'Practice 5-4-3-2-1 grounding or slow breathing when activated. Note triggers and what helped. Continue trauma-focused therapy homework as assigned.', reason: 'Stabilisation skills complement evidence-based PTSD therapies.' },
  { id: 'chp-CON-020', conditionId: 'CON-020', conditionName: 'Complex PTSD Developmental Trauma', category: 'Trauma', title: 'Emotion regulation skill practice', type: 'mood-journal', frequency: 'daily', instructions: 'Use one skill from therapy (TIPP, self-soothing, boundaries). Log intensity before/after and context.', reason: 'Skills training supports complex trauma recovery.' },
  { id: 'chp-CON-021', conditionId: 'CON-021', conditionName: 'ADHD Inattentive Type', category: 'ADHD', title: 'Externalised daily plan', type: 'pre-session', frequency: 'daily', instructions: 'Write three priorities on paper or phone. Use timers for 25-minute blocks. Check off completed items.', reason: 'External structure improves ADHD task follow-through.' },
  { id: 'chp-CON-022', conditionId: 'CON-022', conditionName: 'ADHD Combined Type', category: 'ADHD', title: 'Movement break + focus block', type: 'activity', frequency: 'daily', instructions: 'Alternate 25 min focus with 5 min movement. Note distractibility. Align with medication timing if prescribed.', reason: 'Movement and structure support attention and hyperactivity.' },
  { id: 'chp-CON-023', conditionId: 'CON-023', conditionName: 'Schizophrenia', category: 'Psychotic', title: 'Routine & sleep stability', type: 'sleep', frequency: 'daily', instructions: 'Regular sleep/wake schedule. Note voices or unusual thoughts without judgement. Take medications as prescribed; report changes to your team.', reason: 'Routine and adherence support recovery in psychotic disorders.' },
  { id: 'chp-CON-024', conditionId: 'CON-024', conditionName: 'Schizoaffective Disorder', category: 'Psychotic', title: 'Mood & psychosis symptom log', type: 'mood-journal', frequency: 'daily', instructions: 'Brief note on mood, energy, sleep, and any perceptual changes. Share with psychiatrist for medication tuning.', reason: 'Separating mood and psychosis patterns guides treatment.' },
  { id: 'chp-CON-025', conditionId: 'CON-025', conditionName: 'Insomnia Disorder', category: 'Sleep', title: 'CBT-I stimulus control basics', type: 'sleep', frequency: 'daily', instructions: 'Bed only for sleep; if awake >20 min, leave bed until sleepy. Fixed wake time. Limit naps per clinician. Avoid clock-watching.', reason: 'Stimulus control and sleep scheduling are core CBT-I elements.' },
  { id: 'chp-CON-026', conditionId: 'CON-026', conditionName: 'Sleep-Related Anxiety', category: 'Sleep', title: 'Wind-down without performance pressure', type: 'breathing', frequency: 'daily', instructions: 'Last hour: dim lights, no news, gentle reading or audio. Use relaxation audio; goal is rest, not “forcing sleep.”', reason: 'Reduces sleep effort and anxiety.' },
  { id: 'chp-CON-027', conditionId: 'CON-027', conditionName: 'Chronic Pain General', category: 'Pain', title: 'Activity pacing', type: 'activity', frequency: 'daily', instructions: 'Plan activity/rest to stay below flare threshold. Short walks or tasks with breaks. Log pain 0–10 and what you did.', reason: 'Pacing improves function without boom-bust cycles.' },
  { id: 'chp-CON-028', conditionId: 'CON-028', conditionName: 'Fibromyalgia', category: 'Pain', title: 'Gentle movement + symptom log', type: 'activity', frequency: '3x-week', instructions: 'Low-impact movement (walking, water, gentle yoga) within comfort. Note fatigue and pain; adjust dose next time.', reason: 'Graded exercise helps many with fibromyalgia when paced.' },
  { id: 'chp-CON-029', conditionId: 'CON-029', conditionName: 'Chronic Low Back Pain', category: 'Pain', title: 'McKenzie-style extensions (if cleared)', type: 'activity', frequency: 'daily', instructions: 'Only if approved by your clinician/PT: repeated gentle extension or flexion drills as taught. Stop if new leg weakness or numbness—seek care.', reason: 'Targeted movement supports many mechanical low-back cases.' },
  { id: 'chp-CON-030', conditionId: 'CON-030', conditionName: 'Neuropathic Pain', category: 'Pain', title: 'Sensory self-care + flare plan', type: 'mood-journal', frequency: 'daily', instructions: 'Note burning/tingling patterns. Gentle non-aggravating movement. Protect skin and feet if diabetes-related. Follow medication plan.', reason: 'Monitoring guides neuropathic pain management.' },
  { id: 'chp-CON-031', conditionId: 'CON-031', conditionName: 'Migraine and Headache Disorders', category: 'Pain', title: 'Headache trigger & sleep diary', type: 'mood-journal', frequency: 'daily', instructions: 'Log sleep, stress, meals, caffeine, menses, and headaches (intensity, duration, meds used).', reason: 'Identifies triggers and treatment response.' },
  { id: 'chp-CON-032', conditionId: 'CON-032', conditionName: 'Complex Regional Pain Syndrome', category: 'Pain', title: 'Graded desensitisation (as taught)', type: 'activity', frequency: 'daily', instructions: 'Perform the gentle desensitisation or motor tasks from your pain team. Log pain and tolerance; do not push into severe flare.', reason: 'Graded exposure is used in CRPS rehabilitation.' },
  { id: 'chp-CON-033', conditionId: 'CON-033', conditionName: 'Epilepsy Seizure Disorder', category: 'Neurology', title: 'Seizure & sleep diary', type: 'assessment', frequency: 'daily', instructions: 'Regular sleep, avoid skipped doses. Log seizures, auras, triggers, and rescue med use as directed.', reason: 'Sleep and adherence reduce seizure risk; data guide therapy.' },
  { id: 'chp-CON-034', conditionId: 'CON-034', conditionName: "Parkinson's Disease", category: 'Neurology', title: 'BIG movement home practice', type: 'activity', frequency: 'daily', instructions: 'Amplitude-based exercises as taught by PT (large steps, arm swings). Use support as needed; stop if falls risk.', reason: 'LSVT-BIG-style training supports mobility in PD.' },
  { id: 'chp-CON-035', conditionId: 'CON-035', conditionName: "Alzheimer's Disease and Dementia", category: 'Neurology', title: 'Structured routine + cognitive engagement', type: 'caregiver', frequency: 'daily', instructions: 'Consistent daily schedule. 20 min of conversation, music, or simple puzzles. Caregiver notes confusion or safety issues.', reason: 'Routine and stimulation support quality of life.' },
  { id: 'chp-CON-036', conditionId: 'CON-036', conditionName: 'Mild Cognitive Impairment', category: 'Neurology', title: 'Aerobic walk + cognitive challenge', type: 'activity', frequency: '3x-week', instructions: 'Brisk walk as cleared by your doctor. Add one novel task (route, puzzle, language practice). Note subjective memory concerns.', reason: 'Exercise and cognitive engagement may support brain health.' },
  { id: 'chp-CON-037', conditionId: 'CON-037', conditionName: 'Traumatic Brain Injury', category: 'Neurology', title: 'Energy pacing & symptom diary', type: 'mood-journal', frequency: 'daily', instructions: 'Plan cognitive breaks before symptoms spike. Log headaches, dizziness, irritability, and sleep. Increase activity gradually.', reason: 'Pacing reduces post-concussion boom-bust.' },
  { id: 'chp-CON-038', conditionId: 'CON-038', conditionName: 'Stroke Rehabilitation', category: 'Neurology', title: 'Home exercise program reps', type: 'activity', frequency: 'daily', instructions: 'Complete repetitions exactly as your therapist prescribed (strength, balance, speech drills). Log pain or new neurological signs.', reason: 'Repetition drives neuroplastic recovery after stroke.' },
  { id: 'chp-CON-039', conditionId: 'CON-039', conditionName: 'Multiple Sclerosis', category: 'Neurology', title: 'Fatigue pacing & cooling', type: 'activity', frequency: 'daily', instructions: 'Break tasks; cool environment if heat worsens symptoms. Light activity within limits. Note relapses or new deficits.', reason: 'Energy management is central in MS.' },
  { id: 'chp-CON-040', conditionId: 'CON-040', conditionName: 'ALS Motor Neuron Disease', category: 'Neurology', title: 'Breathing & communication practice', type: 'breathing', frequency: 'daily', instructions: 'Breathing exercises per respiratory therapist. Practice augmentative communication tools. Report new weakness or breathing change urgently.', reason: 'Supports respiratory and communication function in ALS.' },
  { id: 'chp-CON-041', conditionId: 'CON-041', conditionName: 'Essential Tremor', category: 'Neurology', title: 'Stress reduction + caffeine check', type: 'breathing', frequency: 'daily', instructions: 'Limit caffeine if it worsens tremor. Brief relaxation before fine motor tasks. Note tremor severity and medication timing.', reason: 'Stress and stimulants often modulate tremor.' },
  { id: 'chp-CON-042', conditionId: 'CON-042', conditionName: 'Tourette Syndrome Tic Disorders', category: 'Neurology', title: 'Habit reversal awareness', type: 'mood-journal', frequency: 'daily', instructions: 'Log premonitory urges and competing responses taught by your clinician. Note situational triggers.', reason: 'Behavioural therapies are first-line for tics.' },
  { id: 'chp-CON-043', conditionId: 'CON-043', conditionName: 'Tinnitus', category: 'Sensory', title: 'Sound enrichment & relaxation', type: 'media', frequency: 'daily', instructions: 'Use low-level neutral sound in quiet settings. Practice relaxation to reduce vigilance. Avoid silence that spikes awareness.', reason: 'Sound therapy and habituation approaches support tinnitus care.' },
  { id: 'chp-CON-044', conditionId: 'CON-044', conditionName: 'Alcohol Use Disorder', category: 'Substance', title: 'Urge diary & coping menu', type: 'mood-journal', frequency: 'daily', instructions: 'Note urges (0–10), triggers (HALT), and coping actions used. Attend mutual-help or counselling as planned.', reason: 'Self-monitoring supports recovery behaviours.' },
  { id: 'chp-CON-045', conditionId: 'CON-045', conditionName: 'Substance Use Disorder Other', category: 'Substance', title: 'Recovery routine check-in', type: 'assessment', frequency: 'daily', instructions: 'Track substance-free days, cravings, and support contacts. Use crisis plan if relapse risk is high.', reason: 'Structure and accountability aid SUD recovery.' },
  { id: 'chp-CON-046', conditionId: 'CON-046', conditionName: 'Gambling Behavioural Addiction', category: 'Substance', title: 'Urge surfing + block tools', type: 'mood-journal', frequency: 'daily', instructions: 'Log urges, money not spent, and alternative activities. Use site blockers and self-exclusion as agreed.', reason: 'Behavioural monitoring and barriers reduce gambling episodes.' },
  { id: 'chp-CON-047', conditionId: 'CON-047', conditionName: 'Anorexia Nervosa', category: 'Eating', title: 'Meal plan adherence log (team-directed)', type: 'assessment', frequency: 'daily', instructions: 'Follow the meal plan from your eating-disorder team only. Log meals/snacks as agreed—no calorie counting unless prescribed. Report medical red flags to your team.', reason: 'Structured nutrition must be supervised in anorexia care.' },
  { id: 'chp-CON-048', conditionId: 'CON-048', conditionName: 'Bulimia Binge Eating Disorder', category: 'Eating', title: 'Regular eating schedule', type: 'mood-journal', frequency: 'daily', instructions: 'Eat meals/snacks at planned times every 3–4 hours while awake. Note binge urges and skills used. Follow your dietitian’s plan.', reason: 'Regular eating reduces binge cycles in BED/BN treatment.' },
  { id: 'chp-CON-049', conditionId: 'CON-049', conditionName: 'Cognitive Decline Unspecified', category: 'Cognitive', title: 'Social & cognitive stimulation', type: 'activity', frequency: '3x-week', instructions: 'Short social contact, reading aloud, or simple games. Note memory or orientation changes for your clinician.', reason: 'Engagement may support cognition and mood.' },
  { id: 'chp-CON-050', conditionId: 'CON-050', conditionName: 'Executive Function Deficits', category: 'Cognitive', title: 'Planning checklist', type: 'pre-session', frequency: 'daily', instructions: 'Write tomorrow’s top three tasks with time estimates. Use alarms. Review what worked at day end.', reason: 'External planning compensates for executive weaknesses.' },
  { id: 'chp-CON-051', conditionId: 'CON-051', conditionName: 'TMS Protocol General', category: 'Neuromod', title: 'TMS session preparation', type: 'pre-session', frequency: 'before-session', instructions: 'Sleep adequately. Avoid excess caffeine if it worsens anxiety. Remove metallic objects as instructed. Report seizures, severe headache, or mania immediately.', reason: 'Standard TMS session readiness and safety monitoring.' },
  { id: 'chp-CON-052', conditionId: 'CON-052', conditionName: 'tDCS Protocol General', category: 'Neuromod', title: 'tDCS skin & session log', type: 'home-device', frequency: 'daily', instructions: 'Clean skin per protocol; ensure correct pad placement. Log session time, sensation, and skin checks. Stop if skin breakdown or unusual symptoms—contact your team.', reason: 'Skin care and logging support safe home or clinic tDCS.' },
  { id: 'chp-CON-053', conditionId: 'CON-053', conditionName: 'Neurofeedback Protocol', category: 'Neuromod', title: 'Home relaxation / HRV practice', type: 'breathing', frequency: 'daily', instructions: '10–15 minutes coherent breathing or HRV biofeedback if provided. Practice between neurofeedback sessions to reinforce regulation skills.', reason: 'Self-regulation practice complements neurofeedback training.' },
];

/** @typedef {'explicit_id'|'field_extract'|'slug_match'|'display_name_match'|'text_inference'} MatchMethod */
/**
 * @typedef {object} ConditionMatch
 * @property {string} conditionId — CON-001 … CON-053
 * @property {MatchMethod} matchMethod
 * @property {number} confidenceScore — 0–100, comparable within resolver only
 * @property {string} [matchedField]
 * @property {string} [matchedValue]
 */

/**
 * Confidence scale 0–100 (higher = stronger evidence). Same method may use different scores by field.
 * explicit_id > field_extract (primary) > slug (canonical) > slug (alias) > display_name > field_extract (secondary) > text_inference
 */
export const CONFIDENCE = {
  explicit_id: 100,
  field_extract_primary: 90,
  field_extract_secondary: 74,
  slug_canonical: 84,
  slug_alias: 72,
  display_name: 68,
  text_inference: 41,
};

const METHOD_RANK = /** @type {Record<MatchMethod, number>} */ ({
  explicit_id: 5,
  field_extract: 4,
  slug_match: 3,
  display_name_match: 2,
  text_inference: 1,
});

/** Bundle-id fields that are expected to hold a bare CON-xxx id */
const EXPLICIT_KEYS = [
  'condition_bundle_id', 'bundle_id', 'cond_id', 'condition_id',
  'assessment_condition_id', 'clinical_condition_id', 'condId',
];

/** Narrative fields: CON token extraction uses stricter confidence if primary */
const PRIMARY_TEXT_KEYS = ['condition', 'condition_name', 'protocol_name', 'name', 'title'];
const SECONDARY_TEXT_KEYS = ['notes', 'description', 'indication'];

export function slugifyConditionName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[''’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normPhrase(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeConIdToken(v) {
  if (v == null || v === '') return null;
  const m = String(v).trim().toUpperCase().match(/^CON-(\d{1,3})$/);
  return m ? `CON-${m[1].padStart(3, '0')}` : null;
}

const PRIMARY_SLUG_TO_CON = {};
for (const t of CONDITION_HOME_TEMPLATES) {
  PRIMARY_SLUG_TO_CON[slugifyConditionName(t.conditionName)] = t.conditionId;
}

/** Short registry/UI aliases → CON (only safe for slug equality or bounded text_inference) */
const SLUG_ALIAS_TO_CON = {
  mdd: 'CON-001',
  trd: 'CON-002',
  'bipolar-i': 'CON-003',
  'bipolar-ii': 'CON-004',
  'bipolar-1': 'CON-003',
  'bipolar-2': 'CON-004',
  dysthymia: 'CON-005',
  sad: 'CON-006',
  'seasonal-depression': 'CON-006',
  ppd: 'CON-007',
  postpartum: 'CON-007',
  pmdd: 'CON-008',
  gad: 'CON-011',
  panic: 'CON-012',
  'social-anxiety': 'CON-013',
  phobia: 'CON-014',
  adjustment: 'CON-015',
  ocd: 'CON-016',
  bdd: 'CON-017',
  hoarding: 'CON-018',
  ptsd: 'CON-019',
  'complex-ptsd': 'CON-020',
  cptsd: 'CON-020',
  'adhd-inattentive': 'CON-021',
  adhd: 'CON-022',
  'adhd-combined': 'CON-022',
  schizophrenia: 'CON-023',
  schizoaffective: 'CON-024',
  insomnia: 'CON-025',
  'sleep-anxiety': 'CON-026',
  'chronic-pain': 'CON-027',
  fibromyalgia: 'CON-028',
  'low-back-pain': 'CON-029',
  'back-pain': 'CON-029',
  neuropathic: 'CON-030',
  migraine: 'CON-031',
  headache: 'CON-031',
  crps: 'CON-032',
  epilepsy: 'CON-033',
  parkinsons: 'CON-034',
  parkinson: 'CON-034',
  alzheimers: 'CON-035',
  dementia: 'CON-035',
  mci: 'CON-036',
  tbi: 'CON-037',
  stroke: 'CON-038',
  ms: 'CON-039',
  als: 'CON-040',
  'essential-tremor': 'CON-041',
  tourette: 'CON-042',
  tinnitus: 'CON-043',
  aud: 'CON-044',
  alcohol: 'CON-044',
  sud: 'CON-045',
  addiction: 'CON-045',
  gambling: 'CON-046',
  anorexia: 'CON-047',
  bulimia: 'CON-048',
  bed: 'CON-048',
  'binge-eating': 'CON-048',
  'cognitive-decline': 'CON-049',
  'executive-function': 'CON-050',
  tms: 'CON-051',
  tdcs: 'CON-052',
  neurofeedback: 'CON-053',
  nf: 'CON-053',
};

/** Longer aliases allowed in slug_match (still exact slug equality, not substring) */
const LONG_SLUG_ALIASES = {
  depression: 'CON-001',
  anxiety: 'CON-011',
  pain: 'CON-027',
};

Object.assign(SLUG_ALIAS_TO_CON, LONG_SLUG_ALIASES);

/**
 * Short tokens allowed for whole-word text_inference in notes/description only (avoids "pain" in "painting").
 */
const TEXT_INFERENCE_SAFE_ALIASES = new Set([
  'mdd', 'gad', 'ptsd', 'ocd', 'adhd', 'tms', 'tdcs', 'nf', 'aud', 'sud', 'bed', 'mci', 'tbi', 'crps', 'ppd', 'pmdd', 'bdd', 'trd', 'cptsd', 'ms', 'als',
]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractConRegex(str, fieldKey, primary) {
  const out = [];
  if (typeof str !== 'string') return out;
  const re = /\bCON-(\d{1,3})\b/gi;
  let mm;
  while ((mm = re.exec(str)) !== null) {
    const conditionId = `CON-${mm[1].padStart(3, '0')}`;
    out.push({
      conditionId,
      matchMethod: /** @type {MatchMethod} */ ('field_extract'),
      confidenceScore: primary ? CONFIDENCE.field_extract_primary : CONFIDENCE.field_extract_secondary,
      matchedField: fieldKey,
      matchedValue: mm[0],
    });
  }
  return out;
}

function displayNameMatches(str, fieldKey) {
  const out = [];
  if (typeof str !== 'string') return out;
  const n = normPhrase(str);
  if (n.length < 6) return out;
  for (const t of CONDITION_HOME_TEMPLATES) {
    if (normPhrase(t.conditionName) === n) {
      out.push({
        conditionId: t.conditionId,
        matchMethod: /** @type {MatchMethod} */ ('display_name_match'),
        confidenceScore: CONFIDENCE.display_name,
        matchedField: fieldKey,
        matchedValue: str.slice(0, 120),
      });
    }
  }
  return out;
}

/**
 * Whole-word alias match in free text — only secondary fields, bounded alias list.
 */
function textInferenceFromNotes(str, fieldKey) {
  const out = [];
  if (typeof str !== 'string' || str.length < 4) return out;
  const lower = str.toLowerCase();
  for (const alias of TEXT_INFERENCE_SAFE_ALIASES) {
    const con = SLUG_ALIAS_TO_CON[alias];
    if (!con) continue;
    const rx = new RegExp(`(^|[^a-z0-9])${escapeRegex(alias)}([^a-z0-9]|$)`, 'i');
    if (rx.test(lower)) {
      out.push({
        conditionId: con,
        matchMethod: /** @type {MatchMethod} */ ('text_inference'),
        confidenceScore: CONFIDENCE.text_inference,
        matchedField: fieldKey,
        matchedValue: alias,
      });
    }
  }
  return out;
}

function slugMatches(slugRaw) {
  const out = [];
  if (!slugRaw || typeof slugRaw !== 'string') return out;
  const slug = slugRaw.toLowerCase().trim().replace(/_/g, '-');
  if (!slug) return out;

  const canonical = PRIMARY_SLUG_TO_CON[slug];
  if (canonical) {
    out.push({
      conditionId: canonical,
      matchMethod: /** @type {MatchMethod} */ ('slug_match'),
      confidenceScore: CONFIDENCE.slug_canonical,
      matchedField: 'condition_slug',
      matchedValue: slug,
    });
    return out;
  }

  const alias = SLUG_ALIAS_TO_CON[slug];
  if (alias) {
    out.push({
      conditionId: alias,
      matchMethod: /** @type {MatchMethod} */ ('slug_match'),
      confidenceScore: CONFIDENCE.slug_alias,
      matchedField: 'condition_slug',
      matchedValue: slug,
    });
  }
  return out;
}

/**
 * All candidate matches for one course object (may include duplicates per conditionId).
 */
export function resolveConditionMatchesFromCourse(course) {
  if (!course || typeof course !== 'object') return [];

  const matches = [];

  for (const k of EXPLICIT_KEYS) {
    const n = normalizeConIdToken(course[k]);
    if (n) {
      matches.push({
        conditionId: n,
        matchMethod: 'explicit_id',
        confidenceScore: CONFIDENCE.explicit_id,
        matchedField: k,
        matchedValue: String(course[k]).trim(),
      });
    }
  }

  for (const k of PRIMARY_TEXT_KEYS) extractConRegex(course[k], k, true).forEach((m) => matches.push(m));
  for (const k of SECONDARY_TEXT_KEYS) {
    extractConRegex(course[k], k, false).forEach((m) => matches.push(m));
    textInferenceFromNotes(course[k], k).forEach((m) => matches.push(m));
  }

  for (const k of ['condition', 'condition_name', 'protocol_name']) displayNameMatches(course[k], k).forEach((m) => matches.push(m));

  const slugSrc = course.condition_slug || course.slug;
  slugMatches(slugSrc).forEach((m) => matches.push(m));

  return matches;
}

/** Positive if b is stronger evidence than a. */
function compareEvidence(a, b) {
  if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
  const mr = METHOD_RANK[b.matchMethod] - METHOD_RANK[a.matchMethod];
  if (mr !== 0) return mr;
  const fa = a.matchedField || '';
  const fb = b.matchedField || '';
  if (fa !== fb) return fa < fb ? -1 : fa > fb ? 1 : 0;
  const va = a.matchedValue || '';
  const vb = b.matchedValue || '';
  if (va !== vb) return va < vb ? -1 : va > vb ? 1 : 0;
  return 0;
}

/**
 * Dedupe by conditionId keeping strongest evidence; deterministic tie-breaks.
 */
export function mergeMatchesByConditionId(matches) {
  const map = new Map();
  for (const m of matches) {
    const prev = map.get(m.conditionId);
    if (!prev || compareEvidence(prev, m) > 0) map.set(m.conditionId, m);
  }
  return [...map.values()].sort((a, b) => {
    if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
    const c = a.conditionId.localeCompare(b.conditionId);
    return c;
  });
}

/**
 * Back-compat: sorted unique ids from merged matches on this course.
 */
export function resolveConIdsFromCourse(course) {
  return mergeMatchesByConditionId(resolveConditionMatchesFromCourse(course)).map((m) => m.conditionId);
}

export function templatesForConditionIds(ids) {
  const set = new Set(ids || []);
  return CONDITION_HOME_TEMPLATES.filter((t) => set.has(t.conditionId));
}

const TERMINAL = new Set(['completed', 'discontinued']);

export function filterCoursesForSuggestions(courses) {
  return (courses || []).filter((c) => !TERMINAL.has(c.status));
}

/** Selected-course scope bonus (sorting only, not stored as clinical confidence). */
export const SELECTED_COURSE_SORT_BONUS = 6;

/** UI-only tier for confidence scores (resolver-relative, not clinical staging). */
export function confidenceTierFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return 'unknown';
  const n = Number(score);
  if (n >= 85) return 'high';
  if (n >= 60) return 'medium';
  return 'low';
}

/**
 * @typedef {object} RankedSuggestion
 * @property {typeof CONDITION_HOME_TEMPLATES[0]} template
 * @property {object} match — winning ConditionMatch for this bundle from source course
 * @property {string} [sourceCourseId]
 * @property {string} [sourceCourseLabel]
 * @property {boolean} fromSelectedCourse
 * @property {number} sortScore — confidence + scope bonus for ordering
 */

/**
 * Build ordered suggestion rows. When `selectedCourseId` is set, only that course contributes
 * (scoped mode). Otherwise unions active courses and dedupes by bundle id.
 */
export function buildRankedHomeSuggestions(pool, options = {}) {
  const { selectedCourseId, courseLabel = (c) => c.id } = options;
  const active = filterCoursesForSuggestions(pool);
  let sourceList = active;
  if (selectedCourseId) {
    const c = (pool || []).find((x) => x.id === selectedCourseId);
    sourceList = c && !TERMINAL.has(c.status) ? [c] : [];
  }

  /** @type {RankedSuggestion[]} */
  const rows = [];
  for (const c of sourceList) {
    const merged = mergeMatchesByConditionId(resolveConditionMatchesFromCourse(c));
    const label = courseLabel(c);
    for (const m of merged) {
      const template = CONDITION_HOME_TEMPLATES.find((t) => t.conditionId === m.conditionId);
      if (!template) continue;
      const fromSelected = Boolean(selectedCourseId && c.id === selectedCourseId);
      const sortScore = m.confidenceScore + (fromSelected ? SELECTED_COURSE_SORT_BONUS : 0);
      rows.push({
        template,
        match: m,
        sourceCourseId: c.id,
        sourceCourseLabel: label,
        fromSelectedCourse: fromSelected,
        sortScore,
      });
    }
  }

  if (!selectedCourseId) {
    const byBundle = new Map();
    for (const row of rows) {
      const id = row.template.conditionId;
      const prev = byBundle.get(id);
      if (!prev || row.sortScore > prev.sortScore || (row.sortScore === prev.sortScore && (row.sourceCourseId || '') < (prev.sourceCourseId || ''))) {
        byBundle.set(id, row);
      }
    }
    return [...byBundle.values()].sort((a, b) => {
      if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
      return a.template.conditionId.localeCompare(b.template.conditionId);
    });
  }

  return rows.sort((a, b) => {
    if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
    return a.template.conditionId.localeCompare(b.template.conditionId);
  });
}

