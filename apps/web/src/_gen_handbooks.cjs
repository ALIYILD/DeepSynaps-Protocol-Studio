// Generator: writes handbooks-data.js in full
const fs = require('fs');
const OUT = 'C:/Users/yildi/DeepSynaps-Protocol-Studio/apps/web/src/handbooks-data.js';

// Helper: write a condition entry
function cond(id, o) {
  return `  ${JSON.stringify(id)}: ${JSON.stringify(o, null, 2).replace(/^/gm, '  ').trimStart()},\n\n`;
}

let out = '// DeepSynaps Handbook Content Data\n';
out += '// Per-condition handbook fragments used by pages-handbooks.js template engine.\n';
out += 'export const HANDBOOK_DATA = {\n\n';

// ── MOOD ─────────────────────────────────────────────────────────────────────

out += cond('mdd', {
  epidemiology: 'MDD affects ~280 million globally (WHO 2023); lifetime prevalence 15-20%; leading cause of disability worldwide.',
  neuroBasis: 'L-DLPFC is hypometabolic in MDD; HF-TMS to F3 restores excitability and normalises DLPFC-sgACC network connectivity.',
  responseData: '50-60% response, 30-35% remission after 30 sessions (OReardon 2007, George 2010); iTBS non-inferior to HF-TMS (Blumberger 2018).',
  patientExplain: 'Depression reduces activity in a frontal brain area that regulates mood; TMS re-activates this area without medication side effects.',
  timeline: 'Mood lift typically begins sessions 10-15; full response assessed at session 30; improvement can continue 4-6 weeks post-course.',
  selfCare: ['Keep consistent sleep and wake times throughout the course', 'Light aerobic exercise 3x/week enhances TMS response', 'Maintain a mood diary and bring it to weekly reviews'],
  escalation: 'Escalate if PHQ-9 item 9 scores >=2, suicidal plan emerges, or worsening agitation occurs after sessions.',
  homeNote: 'Flow Neuroscience tDCS (F3 anode, Fp2 cathode, 2mA, 30 min, 5x/wk) suitable as home maintenance adjunct.',
  techSetup: 'Confirm F3 via 10-20 measurement; hotspot APB at 100% MSO; document MT at baseline before first session.',
  faq: [
    {q:'Will TMS change my personality?',a:'No; it targets mood regulation circuits only, not personality traits.'},
    {q:'Can I drive after sessions?',a:'Yes; TMS does not impair driving ability.'},
    {q:'What if I feel worse before better?',a:'Some fluctuation is normal in week 1; contact your clinician if it persists past session 10.'}
  ]
});

out += cond('trd', {
  epidemiology: 'TRD (>=2 failed antidepressant trials) affects ~30% of MDD patients; associated with 4x greater disability and healthcare costs.',
  neuroBasis: 'Persistent sgACC hyperactivity and DLPFC hypoconnectivity underlie resistance; bilateral TMS or DBS targets address network-level pathology.',
  responseData: 'Bilateral TMS yields ~45-55% response (Carpenter 2012); SAINT accelerated iTBS achieved 79% remission (Cole 2020).',
  patientExplain: 'Treatment-resistant depression means standard medications have not helped enough; brain stimulation bypasses medication pathways to retune mood circuits directly.',
  timeline: 'TRD often requires 36-40 sessions; do not judge response before session 20; a second course may be needed.',
  selfCare: ['Do not discontinue current medications without psychiatric review', 'Record symptoms weekly and share at every session', 'Sleep consistency is especially important during extended courses'],
  escalation: 'Escalate if no response signal by session 20 (consider protocol change) or suicidality intensifies (ECT referral consideration).',
  homeNote: 'Home tDCS maintenance may be considered after TMS course completion.',
  techSetup: 'Bilateral protocols require independent MT for each hemisphere; document both baseline MTs.',
  faq: [
    {q:'Is ECT a better option?',a:'ECT has higher remission rates but more side effects; your clinician will weigh this based on your history.'},
    {q:'How many TMS courses can I have?',a:'Repeat courses are safe; many patients benefit from two or more courses over years.'},
    {q:'Should I stop antidepressants during TMS?',a:'No; continuing medications during TMS is standard and may enhance outcomes.'}
  ]
});

out += cond('bpd', {
  epidemiology: 'Bipolar disorder affects ~2.4% of the population; depressive phases account for ~50% of illness time and carry highest suicide risk.',
  neuroBasis: 'Bipolar depression involves DLPFC hypoactivation within a dynamic network instability context; mood-switching risk requires careful protocol selection.',
  responseData: 'TMS for bipolar depression ~40-50% response; right-sided or bilateral protocols may reduce mood-switching risk versus L-DLPFC HF alone.',
  patientExplain: 'Bipolar disorder causes mood cycles; brain stimulation is used carefully during depressive phases to lift mood without triggering a manic episode.',
  timeline: 'Improvement may appear from session 10; weekly monitoring for mood elevation is mandatory throughout.',
  selfCare: ['Take mood stabilisers exactly as prescribed', 'Use a mood chart app daily and share at every session', 'Avoid sleep deprivation - the most common mood switching trigger'],
  escalation: 'Escalate if MADRS improves >10 points in <1 week (possible hypomania) or patient reports decreased sleep need and elevated energy.',
  homeNote: null,
  techSetup: 'Default to right-sided or bilateral LF protocol; L-DLPFC HF only with explicit psychiatrist approval.',
  faq: [
    {q:'Can TMS trigger mania?',a:'Rare but possible; the protocol minimises this risk and weekly monitoring watches for early signs.'},
    {q:'Should I take my mood stabiliser on session days?',a:'Yes; take all medications as prescribed on session days.'},
    {q:'What if I feel unusually energetic?',a:'Contact your clinician immediately; increased energy or reduced sleep may signal mood switching.'}
  ]
});

out += cond('ppd', {
  epidemiology: 'Postpartum depression affects 10-15% of new mothers; onset typically within 4 weeks of delivery; frequently under-recognised.',
  neuroBasis: 'Rapid oestrogen withdrawal disrupts HPA axis and prefrontal-limbic connectivity; L-DLPFC TMS reactivates mood circuits without systemic drug exposure.',
  responseData: '~50-60% TMS response in PPD trials (Kim 2011); preferred when medication avoidance is prioritised for breastfeeding mothers.',
  patientExplain: 'Postpartum depression is caused by hormonal changes after birth that affect brain chemistry; TMS improves mood without medication passing into breast milk.',
  timeline: 'Many mothers notice improvement within 2-3 weeks; infant care coordination for all session days is essential for consistent attendance.',
  selfCare: ['Arrange reliable childcare for session days', 'Sleep whenever the baby sleeps - deprivation significantly worsens PPD', 'Ask your health visitor about additional support services'],
  escalation: 'Escalate immediately if postpartum psychosis symptoms emerge (confusion, hallucinations, extreme agitation) - psychiatric emergency.',
  homeNote: null,
  techSetup: 'Standard L-DLPFC; confirm patient is not acutely sleep-deprived before proceeding; keep session environment calm and private.',
  faq: [
    {q:'Is TMS safe while breastfeeding?',a:'Yes; TMS is non-systemic and does not affect breast milk or infant safety.'},
    {q:'Will I have to stop breastfeeding?',a:'No; TMS is specifically chosen to avoid medications that might require stopping breastfeeding.'},
    {q:'What if I miss sessions because of the baby?',a:'Contact the clinic early to reschedule; some clinics offer early morning slots.'}
  ]
});

out += cond('sad', {
  epidemiology: 'SAD affects 3-5% of the general population; more common at higher latitudes; onset typically October-November, remission March-April.',
  neuroBasis: 'SAD involves circadian rhythm disruption and serotonergic dysregulation; DLPFC TMS reinforces frontal inhibitory control over limbic mood circuits.',
  responseData: 'Evidence level B; extrapolated from MDD; early-season treatment (October) before full symptom onset improves outcomes.',
  patientExplain: 'Seasonal depression is triggered by reduced sunlight affecting brain chemistry; brain stimulation combined with light therapy can reset mood circuits.',
  timeline: 'Start at first sign of seasonal decline; 20-25 sessions; annual preventive courses are appropriate for consistent seasonal patterns.',
  selfCare: ['Use a 10,000 lux light therapy lamp 30 min each morning from September', 'Keep wake time consistent even on weekends through winter', 'Outdoor exercise in natural daylight supports circadian function'],
  escalation: 'Escalate if PHQ-9 reaches >=20 or active suicidality emerges; consider antidepressant augmentation.',
  homeNote: 'Light therapy (10,000 lux lamp, 30 min/morning) is first-line adjunct - provide lamp prescription at intake.',
  techSetup: 'Standard L-DLPFC; note seasonal timing in records; consider preventive autumn booster for prior responders.',
  faq: [
    {q:'Should I start TMS every year?',a:'Repeat autumn courses are reasonable for patients with consistent seasonal patterns who have responded before.'},
    {q:'Can I use a light lamp at the same time?',a:'Yes; combining light therapy with TMS is safe and may enhance outcomes.'},
    {q:'Will TMS work for mild SAD?',a:'For mild SAD, light therapy alone may be sufficient; discuss severity with your clinician.'}
  ]
});

out += cond('pdd', {
  epidemiology: 'PDD affects 2-3% of adults; present >=2 years by definition; frequently co-occurs with MDD (double depression).',
  neuroBasis: 'Chronic DLPFC hypoactivation and blunted reward-circuit responsivity characterise PDD; TMS response rates are lower than acute MDD due to long-standing network adaptation.',
  responseData: 'TMS response ~30-40%; longer courses (36-40 sessions) and combination with ACT or CBT-D improve outcomes.',
  patientExplain: 'Persistent depression has become the brain\'s default setting; TMS gradually re-sensitises the mood circuit over time, especially combined with therapy.',
  timeline: 'Response in PDD is slower than acute MDD; assess at session 20 and session 36; concurrent psychotherapy greatly enhances benefit.',
  selfCare: ['Behavioural activation (scheduled pleasant activities) is the most evidence-based self-care; keep an activity log', 'Limit alcohol - it worsens chronic low mood neurobiologically', 'Set one small daily goal to counter anhedonia'],
  escalation: 'Escalate if PHQ-9 rises from baseline or suicidality emerges; consider antidepressant augmentation if no TMS response at session 20.',
  homeNote: 'Home tDCS maintenance is particularly relevant in PDD as relapse prevention after a full course.',
  techSetup: 'Standard L-DLPFC HF or iTBS; iTBS preferred for patients with low motivation and attendance risk.',
  faq: [
    {q:'Will TMS cure my dysthymia?',a:'TMS alone is unlikely to be curative but can significantly lift baseline mood when combined with therapy.'},
    {q:'How long will I need treatment?',a:'Initial 36-40 session course; maintenance sessions or home device may be recommended thereafter.'},
    {q:'My mood has always been low - is that normal?',a:'No; persistent low mood is a treatable condition, not a personality trait.'}
  ]
});

// ── ANXIETY ──────────────────────────────────────────────────────────────────

out += cond('gad', {
  epidemiology: 'GAD affects 5-6% of adults; excessive uncontrollable worry for >=6 months; highly comorbid with MDD.',
  neuroBasis: 'GAD involves right DLPFC and amygdala hyperactivation; LF-TMS (1 Hz) to right DLPFC suppresses cortical excitability and reduces top-down anxiety amplification.',
  responseData: 'Evidence level B; ~40-50% response in trials; taVNS shows emerging data for GAD via vagal-amygdala inhibition.',
  patientExplain: 'Anxiety involves overactivity in the brain\'s threat-detection system; brain stimulation gently dampens this hyperactivity, making it easier to manage worry.',
  timeline: 'Anxiety relief typically begins sessions 8-12; full benefit after 20 sessions; combine with CBT worry-management for best outcome.',
  selfCare: ['Practice diaphragmatic breathing 10 minutes twice daily', 'Limit caffeine and alcohol - both worsen anxiety neurochemically', 'Use a worry-time technique to contain rumination to a scheduled 15-minute window daily'],
  escalation: 'Escalate if GAD-7 rises >5 points from baseline, panic attacks emerge, or inability to function at work/home.',
  homeNote: 'Alpha-Stim CES (ear clips, 100 uA, 20 min/day) is FDA-cleared for anxiety and suitable as a home adjunct.',
  techSetup: 'Target right DLPFC (F4); 1 Hz inhibitory protocol; confirm MT at F4; keep session environment quiet and low-stimulus.',
  faq: [
    {q:'Will TMS calm me immediately?',a:'Most patients notice gradual change over 2-3 weeks rather than immediate sedation; the effect builds with repeated sessions.'},
    {q:'Can I use CES at home as well as attending clinic?',a:'Yes; home CES can complement clinic-based TMS; discuss timing with your clinician.'},
    {q:'Does TMS work as well as medication for anxiety?',a:'CBT is first-line; TMS is used when medication and therapy alone have not produced adequate relief.'}
  ]
});

out += cond('panic', {
  epidemiology: 'Panic disorder affects 2-3% of adults; recurrent unexpected panic attacks with persistent concern about future attacks.',
  neuroBasis: 'Panic involves insula-amygdala hyperexcitability with insufficient PFC inhibitory control; right DLPFC LF-TMS augments cortical inhibition of panic circuitry.',
  responseData: 'Evidence level B; extrapolated from anxiety circuits; 15-20 sessions typical.',
  patientExplain: 'Panic attacks involve a brain alarm system that fires incorrectly; brain stimulation strengthens the control centre that regulates this alarm.',
  timeline: 'Panic frequency and intensity typically reduces from sessions 8-15; maintain a panic diary throughout.',
  selfCare: ['Learn the 5-4-3-2-1 grounding technique to interrupt panic in the moment', 'Avoid caffeine - it directly triggers the adrenergic response underlying panic', 'Gradual exposure to feared situations (with therapy guidance) prevents avoidance from worsening'],
  escalation: 'Escalate if panic frequency increases during treatment, agoraphobic avoidance expands, or emergency presentations increase.',
  homeNote: 'Alpha-Stim CES suitable for home anxiety and panic management.',
  techSetup: 'Right DLPFC (F4) LF 1 Hz; keep session room calm; brief patient on normal TMS sensations before first session to prevent session-induced panic.',
  faq: [
    {q:'Can a TMS session trigger a panic attack?',a:'Uncommon; unfamiliar sensations in early sessions can feel anxiety-provoking - a calm preparation and slow ramp-up reduces this risk.'},
    {q:'Should I continue my anxiety medication during TMS?',a:'Yes; continue medications as prescribed throughout.'},
    {q:'How long will the results last?',a:'Most patients maintain benefit 6-12 months; CBT concurrent with TMS greatly extends durability.'}
  ]
});

out += cond('social-anx', {
  epidemiology: 'Social anxiety disorder affects 7-13% of people; median onset age 13; frequently under-treated due to avoidance of help-seeking.',
  neuroBasis: 'SAD involves right DLPFC and amygdala hyperreactivity to social threat cues; LF-TMS to right DLPFC reduces social evaluation-induced prefrontal hyperactivation.',
  responseData: 'Evidence level B; 15-20 sessions LF right DLPFC; best results concurrent with CBT exposure hierarchy.',
  patientExplain: 'Social anxiety involves the brain over-predicting social threat; brain stimulation quiets the overactive part of the brain that generates fear of judgement.',
  timeline: 'Improvement often noticed from session 10; concurrent CBT exposure work amplifies TMS gains significantly.',
  selfCare: ['Schedule one low-stakes social interaction per week as behavioural exposure practice', 'Practice upcoming social scenarios mentally - visualisation activates neural rehearsal', 'Join a structured group activity to build graded social confidence'],
  escalation: 'Escalate if functional impairment worsens (inability to attend work or school) or depression scores rise during treatment.',
  homeNote: null,
  techSetup: 'Right DLPFC (F4) 1 Hz LF; schedule sessions when patient is not about to face a high-stress social event.',
  faq: [
    {q:'Will TMS reduce my social anxiety permanently?',a:'TMS reduces neural hyperreactivity; combined with CBT, improvements are often durable.'},
    {q:'Do I need therapy at the same time?',a:'Strongly recommended; TMS combined with CBT produces significantly better outcomes for social anxiety.'},
    {q:'Is social anxiety a sign of weakness?',a:'No; it is a well-characterised neurobiological condition involving measurable brain circuit differences.'}
  ]
});

out += cond('specific-ph', {
  epidemiology: 'Specific phobia affects 7-9% of adults; most common types are animal, situational, blood-injection-injury, and natural environment.',
  neuroBasis: 'Specific phobia involves amygdala hyperreactivity to fear cues with inadequate vmPFC extinction; TMS to right DLPFC augments top-down fear extinction capacity.',
  responseData: 'Evidence level C; CBT (exposure therapy) remains first-line; TMS used as augmentation when CBT alone is insufficient.',
  patientExplain: 'A specific phobia is an intense persistent fear response; brain stimulation helps the brain learn more effectively during exposure therapy that the feared thing is not actually dangerous.',
  timeline: 'TMS augments extinction learning; best used during or immediately before CBT exposure sessions; 10-15 sessions typical.',
  selfCare: ['Work through your phobia hierarchy with your therapist - TMS enhances the brain\'s ability to learn from exposure', 'Practice controlled breathing when confronting feared stimuli', 'Reward yourself after successful exposures to reinforce progress'],
  escalation: 'Escalate if phobia has expanded to new situations or depression secondary to functional impairment emerges.',
  homeNote: null,
  techSetup: 'Right DLPFC (F4) LF; coordinate session timing with therapist for maximum extinction augmentation benefit.',
  faq: [
    {q:'Will TMS cure my phobia on its own?',a:'TMS is most effective as augmentation to CBT exposure therapy rather than as a standalone treatment.'},
    {q:'Can I have TMS for blood/needle phobia?',a:'Yes; vasovagal pre-screening is recommended and supine positioning during sessions is advised.'},
    {q:'How many sessions will I need?',a:'Typically 10-15 sessions aligned with your exposure hierarchy.'}
  ]
});

out += cond('agoraphobia', {
  epidemiology: 'Agoraphobia affects 1.7% of adults; associated with fear of situations where escape is difficult; commonly co-occurs with panic disorder.',
  neuroBasis: 'Agoraphobia involves heightened interoceptive alarm (insula hyperactivity) and PFC inhibitory failure in open or crowd contexts; DLPFC TMS enhances cortical regulation of threat appraisal.',
  responseData: 'Evidence level C; best used as CBT augmentation for treatment-refractory agoraphobia.',
  patientExplain: 'Agoraphobia causes intense anxiety in open spaces or crowds; brain stimulation helps the brain\'s control centre better manage these fear signals.',
  timeline: 'Clinical improvement requires concurrent CBT with graduated exposure; TMS alone is unlikely to be sufficient; 15-20 sessions alongside therapy.',
  selfCare: ['Create a graded exposure hierarchy starting with very brief safe ventures outside', 'Use virtual reality exposure as an intermediate step before real-world exposure', 'Identify a trusted support person for early real-world exposure practices'],
  escalation: 'Escalate if the patient becomes fully housebound or suicidal ideation linked to functional impairment emerges.',
  homeNote: 'Alpha-Stim CES can be used at home before scheduled exposure exercises to reduce baseline anxiety.',
  techSetup: 'Ensure clinic environment is accessible and low-anxiety; offer telehealth pre-session check-in; right DLPFC (F4) LF protocol.',
  faq: [
    {q:'What if I cannot get to the clinic?',a:'Contact us in advance; we can arrange telehealth support and graduated attendance plans.'},
    {q:'Is it safe to attend sessions alone?',a:'You are welcome to bring a support person; we will help you build independence over the course.'},
    {q:'Will TMS help me leave my house?',a:'TMS reduces the neurobiological anxiety component; combined with exposure therapy, many patients achieve significant return of function.'}
  ]
});

// ── OCD SPECTRUM ─────────────────────────────────────────────────────────────

out += cond('ocd', {
  epidemiology: 'OCD affects 2-3% of the population; mean onset age ~20; intrusive obsessions and compulsions causing significant functional impairment.',
  neuroBasis: 'OCD involves hyperactivity of the cortico-striato-thalamo-cortical (CSTC) loop, particularly OFC-caudate; deep TMS (H7 coil) to SMA/ACC disrupts this hyperactive loop.',
  responseData: 'FDA-cleared BrainsWay H7 deep TMS: 38% responder rate (Y-BOCS reduction >=30%) vs 11% sham (Carmi 2019); 29 sessions with symptom provocation protocol.',
  patientExplain: 'OCD involves a stuck loop in the brain generating distressing thoughts and compulsive urges; deep brain stimulation disrupts this loop, giving you more control over your responses.',
  timeline: 'Y-BOCS improvement typically begins weeks 3-4; symptom provocation before each session is essential for optimal outcomes.',
  selfCare: ['Practice ERP homework daily as directed by your therapist - TMS enhances extinction learning', 'Resist compulsions for a set period after each session while the brain is receptive', 'Keep an obsession and compulsion log to track patterns'],
  escalation: 'Escalate if Y-BOCS rises >5 points from baseline, depression worsens significantly, or patient disengages from ERP therapy.',
  homeNote: null,
  techSetup: 'BrainsWay H7 coil; 20 Hz deep TMS; administer OCD symptom provocation (personalised imagery script or object) 30 min before each session; document provocation anxiety VAS.',
  faq: [
    {q:'What is the provocation before my session?',a:'We briefly expose you to your OCD trigger before TMS to activate the OCD circuit so stimulation targets it more precisely.'},
    {q:'Do I need to stop my SSRI?',a:'No; continuing your SSRI during TMS is standard and may enhance overall response.'},
    {q:'How is this different from regular TMS?',a:'We use a deep-penetrating H7 coil reaching the SMA and ACC - the key OCD circuit areas.'}
  ]
});

out += cond('bdd', {
  epidemiology: 'BDD affects 1.7-2.4% of adults; preoccupation with perceived physical defects causing significant distress; high suicide risk.',
  neuroBasis: 'BDD shares CSTC loop hyperactivity with OCD but involves greater right hemisphere visual processing hyperactivation; TMS to R-DLPFC/SMA modulates both circuits.',
  responseData: 'Evidence level C; limited TMS trials; best combined with CBT-BDD (mirror exposure, cognitive restructuring); Y-BOCS-BDD monitoring.',
  patientExplain: 'BDD causes the brain to magnify and distort perceived physical flaws; brain stimulation reduces the intensity of these preoccupations, making therapy more accessible.',
  timeline: 'Improvement in BDD requires concurrent CBT; 20-30 TMS sessions alongside weekly therapy recommended.',
  selfCare: ['Limit mirror-checking to agreed times as part of CBT homework', 'When the urge to check increases, delay the behaviour by 20 minutes', 'Share BDD thought records with your therapist each week'],
  escalation: 'Escalate if suicide risk rises, delusional intensity increases, or patient becomes unable to leave home due to appearance concerns.',
  homeNote: null,
  techSetup: 'Right DLPFC (F4) and/or SMA (Cz); coordinate provocation with therapist; use Y-BOCS-BDD at every session.',
  faq: [
    {q:'Will TMS change how I look?',a:'No; TMS targets how the brain processes appearance-related thoughts, not physical appearance.'},
    {q:'Is BDD just vanity?',a:'No; BDD is a well-defined neurobiological condition involving distorted perceptual processing.'},
    {q:'Why do I need therapy as well as TMS?',a:'TMS reduces neurobiological drive; CBT-BDD provides skills to change long-standing thought and behaviour patterns.'}
  ]
});

out += cond('hoarding', {
  epidemiology: 'Hoarding disorder affects 2-5% of adults; persistent difficulty discarding possessions causing significant functional impairment.',
  neuroBasis: 'Hoarding involves L-DLPFC hypoactivation during decision-making tasks and ACC dysfunction in conflict monitoring; L-DLPFC TMS enhances executive decision-making capacity.',
  responseData: 'Evidence level C; L-DLPFC HF-TMS combined with CBT-Hoarding (exposure and sorting tasks) is the most studied approach.',
  patientExplain: 'Hoarding disorder involves difficulty with decision-making and letting go; brain stimulation strengthens the brain\'s decision-making and impulse control systems.',
  timeline: 'Progress measured by functional improvement (room accessibility, safety) over 20-30 sessions combined with active sorting assignments.',
  selfCare: ['Complete weekly sorting homework as assigned - small daily amounts are better than infrequent large efforts', 'Photograph objects before discarding to reduce distress associated with loss', 'Identify a trusted support person who can assist with sorting without triggering shame'],
  escalation: 'Escalate if living conditions present a safety or fire risk, or if depression deteriorates.',
  homeNote: null,
  techSetup: 'L-DLPFC (F3) HF-TMS; coordinate with therapist for weekly sorting sessions ideally on same days as TMS.',
  faq: [
    {q:'Do I have to throw everything away?',a:'No; therapy works through graded sorting goals - you remain in control of all decisions.'},
    {q:'Is hoarding disorder related to OCD?',a:'Hoarding shares some features with OCD but is a distinct condition with different brain circuits.'},
    {q:'Why is it so hard to throw things away?',a:'Hoarding involves genuine differences in the brain\'s decision-making and emotional attachment circuits.'}
  ]
});

out += cond('trich', {
  epidemiology: 'Trichotillomania affects 1-2% of adults; more common in females; classified in the OCD spectrum.',
  neuroBasis: 'Trichotillomania involves SMA/motor cortex hyperactivity generating habitual motor sequences; TMS to SMA disrupts automatic hair-pulling motor patterns.',
  responseData: 'Evidence level C; SMA TMS (1 Hz LF) combined with habit reversal training (HRT) shows promising small-trial data.',
  patientExplain: 'Hair-pulling becomes an automatic habit driven by motor brain circuits; brain stimulation interrupts these automatic movement patterns to give you more control.',
  timeline: 'Motor habit reduction typically requires 20-30 sessions combined with HRT; pulling frequency diary essential throughout.',
  selfCare: ['Habit reversal training: identify triggers and practise a competing response (e.g. clenching fist) when urge arises', 'Wear barrier gloves or a hair covering during high-risk periods', 'Note pulling locations, times, and emotional states to identify your personal pattern'],
  escalation: 'Escalate if self-injury extends beyond hair-pulling or if depression and shame lead to social withdrawal.',
  homeNote: null,
  techSetup: 'SMA target (Cz, FCz); LF 1 Hz inhibitory; document pulling frequency from weekly diary at each visit.',
  faq: [
    {q:'Will TMS stop me pulling entirely?',a:'TMS reduces automatic urge and frequency; habit reversal training alongside gives the best results for lasting change.'},
    {q:'Is this a habit or an illness?',a:'Both; an automatic habit entrenched via a neurobiological process - TMS addresses the brain circuit component.'},
    {q:'Can children have this treatment?',a:'TMS is generally used in adults (18+); discuss paediatric options with a specialist.'}
  ]
});

// ── TRAUMA ───────────────────────────────────────────────────────────────────

out += cond('ptsd', {
  epidemiology: 'PTSD affects 3.9% of adults globally; lifetime prevalence up to 10-20% in high-risk populations (veterans, emergency workers, assault survivors).',
  neuroBasis: 'PTSD involves amygdala hyperreactivity, vmPFC/hippocampal hypoactivation, and DLPFC inhibitory failure; bilateral DLPFC TMS restores top-down fear regulation and extinction consolidation.',
  responseData: 'TMS for PTSD: 40-60% PCL-5 response with 20 sessions (Philip 2019); evidence strongest for L-DLPFC HF; combine with PE or CPT therapy for best outcomes.',
  patientExplain: 'PTSD keeps the brain\'s emergency alarm in constant activation; brain stimulation helps restore the ability to process and move past traumatic memories safely.',
  timeline: 'PCL-5 improvement often begins week 3-4; trauma-focused therapy concurrent with TMS produces significantly better and more durable outcomes.',
  selfCare: ['Use your safety/grounding plan if trauma memories are activated between sessions', 'Limit alcohol and cannabis, which impair trauma memory reconsolidation', 'Maintain regular sleep - it is when trauma memory processing consolidates'],
  escalation: 'Escalate immediately if acute suicidality, self-harm, or dissociative crisis emerges; pause TMS and conduct safety assessment before resuming.',
  homeNote: null,
  techSetup: 'Trauma-informed environment mandatory: patient controls room entry/exit, no sudden sounds, clinician trained in grounding; bilateral DLPFC; document PCL-5 every session.',
  faq: [
    {q:'Will TMS make me relive my trauma?',a:'TMS does not directly trigger trauma memories; sessions focus on brain stimulation, not trauma processing.'},
    {q:'Do I need to talk about what happened?',a:'TMS sessions do not involve trauma processing; your therapist handles trauma-focused work between sessions if appropriate.'},
    {q:'Can I have TMS if I am still having nightmares?',a:'Yes; TMS can be helpful even while active PTSD symptoms are present.'}
  ]
});

out += cond('cptsd', {
  epidemiology: 'cPTSD (ICD-11 6B41) involves PTSD core symptoms plus disturbances in self-organisation; associated with childhood and prolonged interpersonal trauma.',
  neuroBasis: 'cPTSD involves more pervasive neural circuit disruption than PTSD, including interoceptive hyperarousal (insula); stabilisation must precede intensive trauma-focused approaches.',
  responseData: 'Limited cPTSD-specific TMS RCT data; extrapolated from PTSD evidence; higher dropout risk requires flexible scheduling and strong therapeutic alliance.',
  patientExplain: 'Complex trauma creates deeply ingrained patterns of hyperarousal and self-doubt; brain stimulation supports the brain\'s ability to feel safer and more regulated, making therapy more accessible.',
  timeline: 'TMS in cPTSD is delivered in a stabilisation-focused phase; extended course of 30-40 sessions often required.',
  selfCare: ['Ground yourself using your personalised toolkit before and after each session', 'Communicate distress signals to your clinician immediately', 'Maintain self-compassion practices - cPTSD heals through consistent small steps'],
  escalation: 'Escalate if dissociation occurs during sessions, self-harm emerges, or patient cannot maintain safety between sessions.',
  homeNote: null,
  techSetup: 'Extended consent and psychoeducation phase; patient veto over all session environment aspects; bilateral DLPFC; always debrief after sessions.',
  faq: [
    {q:'How is complex PTSD different from regular PTSD?',a:'cPTSD involves additional difficulties with emotional regulation, relationships, and self-worth beyond core trauma symptoms.'},
    {q:'Will TMS be too intense?',a:'Your protocol is carefully titrated; you can stop immediately at any point and your clinician will adjust the approach.'},
    {q:'I have been through many treatments - why would this be different?',a:'TMS works on a different level to talking therapies and medications, directly influencing the neural circuits maintaining survival-state activation.'}
  ]
});

out += cond('asd-trauma', {
  epidemiology: 'Acute Stress Disorder occurs within 3-30 days of a traumatic event; 50-80% of ASD cases progress to PTSD without treatment.',
  neuroBasis: 'ASD involves acute amygdala hyperactivation and PFC inhibitory failure; early intervention may prevent chronic PTSD network consolidation.',
  responseData: 'Evidence level C; TMS not first-line for ASD (CBT is); brief TMS course considered if transition toward chronic PTSD is detected.',
  patientExplain: 'After a traumatic event, the brain\'s alarm system can get stuck on high; brief brain stimulation may help calm this response early before it becomes a longer-term problem.',
  timeline: 'Brief course of 10 sessions if indicated; assessment at session 5 determines if acute symptoms are resolving or progressing toward PTSD.',
  selfCare: ['Maintain daily routine as much as possible - structure is protective against trauma chronification', 'Accept support from trusted people without pressure to recount the event until ready', 'Avoid alcohol and sedating medications as primary coping in the acute phase'],
  escalation: 'Escalate if PTSD diagnostic criteria are met (>30 days), suicidality emerges, or severe functional impairment.',
  homeNote: null,
  techSetup: 'Standard bilateral DLPFC; trauma-informed environment; consider delaying TMS if patient is in acute crisis and cannot consent meaningfully.',
  faq: [
    {q:'I just went through something traumatic - do I need brain stimulation?',a:'Not necessarily; psychological first aid and CBT are first-line; TMS is considered if acute symptoms are severe or not responding.'},
    {q:'How soon after a trauma can TMS start?',a:'Not within the first 48-72 hours; a clinical assessment determines readiness.'},
    {q:'Does TMS help with acute shock reactions?',a:'TMS is more appropriate for sub-acute or chronic post-trauma symptoms than the immediate shock response.'}
  ]
});

// ── PSYCHOSIS ─────────────────────────────────────────────────────────────────

out += cond('schizo', {
  epidemiology: 'Schizophrenia affects 0.3-0.7% of the population; first episode typically in late adolescence to mid-20s.',
  neuroBasis: 'Auditory verbal hallucinations (AVH) are associated with left superior temporal gyrus hyperactivity; LF-TMS to bilateral TPJ disrupts aberrant auditory-verbal activation; L-DLPFC HF targets negative symptoms.',
  responseData: 'LF-TMS for AVH: ~40-50% reduction in hallucination severity in responders (Hoffman 2005, 2013); negative symptoms show ~20-30% improvement with L-DLPFC HF-TMS.',
  patientExplain: 'Brain stimulation for schizophrenia is used to reduce voices or negative feelings; it calms the overactive auditory brain area or activates the under-active motivational brain area.',
  timeline: 'AVH reduction typically begins within 10 sessions; antipsychotic medication must remain stable throughout the course.',
  selfCare: ['Continue all prescribed antipsychotic medications without changes during TMS', 'Report any increase in hearing voices, paranoia, or confusion immediately', 'Maintain a regular daily routine - structure supports stable mental state during treatment'],
  escalation: 'Escalate if positive symptoms worsen, agitation increases, or patient lacks capacity to consent to ongoing sessions.',
  homeNote: null,
  techSetup: 'Confirm antipsychotic medication stable (no changes in past 4 weeks) before starting; LF 1 Hz bilateral TPJ for AVH; HF 10 Hz L-DLPFC for negative symptoms; do not combine both targets in same session without explicit protocol.',
  faq: [
    {q:'Will TMS affect my antipsychotic medication?',a:'TMS does not interact with medications; your medication regimen should remain unchanged.'},
    {q:'Can TMS cure schizophrenia?',a:'TMS is not a cure but can meaningfully reduce specific symptoms such as voices or negative symptoms when medication alone is insufficient.'},
    {q:'Is it safe to have TMS with schizophrenia?',a:'Yes; with stable antipsychotic medication and confirmed absence of seizure history, TMS is safe.'}
  ]
});

out += cond('schizo-aff', {
  epidemiology: 'Schizoaffective disorder affects ~0.3% of adults; combines features of schizophrenia and mood disorder (depressive or bipolar type).',
  neuroBasis: 'Schizoaffective disorder involves both DLPFC mood-regulation deficits and temporal cortex hyperactivation; TMS protocol selection depends on predominant symptom cluster at time of treatment.',
  responseData: 'Evidence level B; limited schizoaffective-specific TMS RCT data; outcomes extrapolated from schizophrenia and MDD evidence.',
  patientExplain: 'Schizoaffective disorder involves both mood and psychosis symptoms; brain stimulation can target whichever symptom cluster is most affecting you at this time.',
  timeline: 'Protocol adjusted at mid-course review based on treatment response; 20-30 sessions initial course; both mood and psychosis monitoring throughout.',
  selfCare: ['Keep a symptom diary tracking both mood scores and voice/belief intensity daily', 'Do not adjust antipsychotic or mood stabiliser medications without psychiatric review', 'Sleep consistency is crucial - disrupted sleep triggers both mood and psychosis components'],
  escalation: 'Escalate if psychosis symptoms worsen, mood destabilises, or patient loses capacity for meaningful consent.',
  homeNote: null,
  techSetup: 'Confirm which symptom cluster to target with prescribing psychiatrist before first session; document baseline PANSS and MADRS separately; monitor both throughout.',
  faq: [
    {q:'Which symptoms is TMS targeting for me?',a:'Your clinician selects the protocol based on your predominant symptoms - this is discussed at the planning appointment.'},
    {q:'Can TMS help my mood and the voices at the same time?',a:'Different protocols target different symptoms; sometimes a staged approach addresses one cluster before the other.'},
    {q:'What happens if my mood changes during treatment?',a:'Both mood and psychosis scores are monitored at every session; protocols can be adjusted rapidly if either shifts.'}
  ]
});

out += cond('fep', {
  epidemiology: 'First episode psychosis typically occurs ages 15-30; early intensive treatment in the critical period dramatically improves long-term outcomes.',
  neuroBasis: 'FEP involves progressive grey matter reduction and DLPFC connectivity disruption in the critical post-onset period; low-intensity tDCS may provide neuroprotective modulation.',
  responseData: 'Evidence level C; tDCS in FEP showing preliminary positive results for negative symptoms and cognition; antipsychotic stabilisation must precede neuromodulation.',
  patientExplain: 'After a first psychosis episode, gentle brain stimulation may support recovery by improving communication between brain regions affected by the episode.',
  timeline: 'Neuromodulation begins only after acute episode stabilises with antipsychotic medication (typically 4-8 weeks post-crisis); 20 sessions tDCS initial course.',
  selfCare: ['Take antipsychotic medication consistently - stopping is the leading cause of relapse', 'Avoid cannabis and substances which strongly increase psychosis risk', 'Engage with the early intervention team\'s full programme including family sessions if offered'],
  escalation: 'Escalate if positive symptoms return or worsen, cannabis use is detected, or family expresses concerns about behavioural change.',
  homeNote: null,
  techSetup: 'Low-intensity tDCS (1-2 mA) bilateral F3/F4; confirm PANSS stability before each session; do not proceed if patient appears acutely unwell on arrival.',
  faq: [
    {q:'Is my brain permanently changed after a psychotic episode?',a:'Not permanently; early treatment protects brain structure and early intervention programmes produce excellent recovery rates.'},
    {q:'Do I have to take medication forever?',a:'Your psychiatrist will guide duration of antipsychotic treatment; many people with a single episode achieve full recovery with time-limited medication.'},
    {q:'Why is brain stimulation being used so early?',a:'Early stimulation may help the brain recover normal connectivity faster during the window when the brain is most responsive to intervention.'}
  ]
});

// ── ADHD ──────────────────────────────────────────────────────────────────────

out += cond('adhd-i', {
  epidemiology: 'ADHD inattentive type affects 3-5% of adults; characterised by sustained attention deficits, distractibility, and organisational impairment without hyperactivity.',
  neuroBasis: 'Inattentive ADHD involves deficient top-down prefrontal control over posterior attentional networks; bilateral tDCS to DLPFC enhances prefrontal catecholaminergic signalling and attentional regulation.',
  responseData: 'tDCS evidence level B for ADHD; ~30-40% CGI-I response; neurofeedback (theta/beta at Cz) shows similar effect sizes; combined tDCS + NFB may be additive.',
  patientExplain: 'ADHD inattentive type involves a prefrontal brain network that struggles to sustain attention; tDCS gently boosts this network\'s activity to improve focus and organisation.',
  timeline: 'Cognitive improvements typically emerge from sessions 10-15; 20-30 sessions standard; combine with ADHD coaching for sustained benefit.',
  selfCare: ['Use the Pomodoro technique (25 min focus, 5 min break) during cognitive work', 'Minimise phone notifications and open-plan distractions during work hours', 'Brief aerobic exercise immediately before cognitively demanding tasks potentiates tDCS effects'],
  escalation: 'Escalate if depression emerges (common comorbidity in adult ADHD) or functional deterioration occurs despite treatment.',
  homeNote: null,
  techSetup: 'tDCS bilateral F3 anode/F4 cathode; 2 mA, 20-30 min; combine with working memory cognitive training task during stimulation for enhanced benefit.',
  faq: [
    {q:'Can TMS replace my ADHD medication?',a:'tDCS is not a replacement for stimulant medication; it is used alongside or when medication is not tolerated.'},
    {q:'Will my attention improve immediately after sessions?',a:'Some acute session-related focus improvements occur; sustained benefits accumulate over the course.'},
    {q:'Should I do cognitive training alongside treatment?',a:'Yes; performing attention tasks during tDCS sessions enhances the neuromodulation effect.'}
  ]
});

out += cond('adhd-hi', {
  epidemiology: 'ADHD hyperactive-impulsive type is less common than combined type in adults; primarily presents as impulsivity, restlessness, and difficulty inhibiting responses.',
  neuroBasis: 'Hyperactive-impulsive ADHD involves inferior frontal gyrus and SMA inhibitory circuit dysfunction; bilateral prefrontal tDCS targets both impulsive responding and motor inhibition circuits.',
  responseData: 'Evidence level B; tDCS and neurofeedback for impulsivity show 30-40% CGI-I response; inhibitory control tasks during stimulation enhance specificity.',
  patientExplain: 'Hyperactive ADHD involves a brain that has difficulty braking impulsive thoughts and actions; brain stimulation strengthens the neural braking system.',
  timeline: 'Impulsivity reduction may be noticed by others (family, teachers) before the patient notices self-improvement; 20-30 sessions standard.',
  selfCare: ['Pause for 10 seconds before responding in high-stakes situations', 'Use structured task lists to reduce impulsive task-switching', 'Aerobic exercise twice daily significantly reduces hyperactive symptoms neurobiologically'],
  escalation: 'Escalate if impulsivity leads to risk-taking behaviour or mood instability emerges.',
  homeNote: null,
  techSetup: 'tDCS bilateral prefrontal; 2 mA; consider Go/No-Go inhibitory control task during stimulation; document impulsivity rating at each session.',
  faq: [
    {q:'Can brain stimulation calm me down?',a:'tDCS strengthens inhibitory control circuits rather than sedating you; think of it as improving the brain\'s own braking system.'},
    {q:'Should my family know about this treatment?',a:'Informing family is helpful - they often notice behaviour changes before you do and can provide valuable feedback.'},
    {q:'Will this help at work?',a:'Many patients report improved impulse control and decision-making at work; the combination with coaching produces the most occupational impact.'}
  ]
});

out += cond('adhd-c', {
  epidemiology: 'ADHD combined type is the most common adult ADHD presentation (~60-70% of adult ADHD cases); involves both inattention and hyperactivity-impulsivity.',
  neuroBasis: 'Combined ADHD involves both DLPFC (attention) and inferior frontal/SMA (inhibition) circuit deficits; combined tDCS + theta-beta neurofeedback addresses both circuits.',
  responseData: 'Combined tDCS + NFB shows ~35-45% CGI-I response; theta-beta NFB alone has evidence level B with meta-analytic effect sizes comparable to non-stimulant medication.',
  patientExplain: 'Combined ADHD affects both focus and impulse control; two complementary brain stimulation approaches can target both circuits together.',
  timeline: 'Theta-beta neurofeedback requires 40 sessions (3x/week over 13 weeks) for sustained effects; tDCS used as a concurrent booster 2-3x/week.',
  selfCare: ['Maintain a consistent daily structure - ADHD brains benefit enormously from predictable routines', 'Implement body doubling (working alongside another person) for tasks requiring sustained attention', 'Track ADHD symptoms with a validated app; share weekly summaries with your clinician'],
  escalation: 'Escalate if comorbid depression or anxiety worsens, substance use emerges, or occupational functioning deteriorates.',
  homeNote: 'Muse 2 home neurofeedback (4-channel EEG) provides affordable theta-beta training at home as an adjunct - available with app guidance.',
  techSetup: 'tDCS bilateral DLPFC concurrent with cognitive task; NFB at Cz theta suppression / beta enhancement; document session EEG metrics at each NFB visit.',
  faq: [
    {q:'Why do I need both tDCS and neurofeedback?',a:'tDCS boosts the DLPFC directly while neurofeedback trains you to self-regulate your own brain activity - the two approaches reinforce each other.'},
    {q:'Can I do neurofeedback at home?',a:'A supervised home neurofeedback programme (Muse 2 + app) can complement clinic sessions; your clinician will advise when ready.'},
    {q:'Is 40 sessions of neurofeedback really necessary?',a:'Research shows 40 sessions produces the most durable results; shorter courses show effects but they tend to fade faster.'}
  ]
});

// ── AUTISM ───────────────────────────────────────────────────────────────────

out += cond('asd', {
  epidemiology: 'ASD affects 1-2% of the population (CDC 2023: 1 in 36 children in the US); characterised by social communication differences and restricted/repetitive behaviours.',
  neuroBasis: 'ASD involves atypical long-range cortical connectivity; tDCS to bilateral prefrontal and parietal regions targets social cognition and executive function circuits.',
  responseData: 'Evidence level C; tDCS in ASD showing preliminary benefit for social responsiveness and repetitive behaviours (Schneider 2022 review); seizure risk elevated requiring careful screening.',
  patientExplain: 'Brain stimulation in autism targets specific circuits involved in social communication and repetitive thoughts - it is not about changing who you are but reducing distressing symptoms if requested.',
  timeline: 'tDCS course of 20 sessions with gradual intensity titration; autistic patients may require longer acclimatisation before reaching full protocol intensity.',
  selfCare: ['Communicate sensory sensitivities to your care team before the first session so the environment can be tailored', 'Bring preferred sensory items (headphones, fidget, blanket) to sessions', 'Rate session comfort 1-5 after each visit to help your team optimise the experience'],
  escalation: 'Escalate if seizure activity is suspected, sensory overwhelm occurs, or patient withdraws consent non-verbally.',
  homeNote: null,
  techSetup: 'Sensory-adapted environment mandatory (dimmed lighting, low noise, clear instructions); start at 0.5-1 mA with gradual titration; AAC-capable communication support if needed; seizure pre-screen at every visit.',
  faq: [
    {q:'Will brain stimulation change who I am?',a:'No; the goal is to reduce specific distressing symptoms you have identified - your identity and character are not targets.'},
    {q:'Can I stop if it feels uncomfortable?',a:'Absolutely; sessions can be paused or stopped at any time without consequence.'},
    {q:'Who decides what symptoms to target?',a:'You do, in collaboration with your clinician - we only target symptoms you identify as distressing and wish to address.'}
  ]
});

// ── EATING ───────────────────────────────────────────────────────────────────

out += cond('anorexia', {
  epidemiology: 'Anorexia nervosa has the highest mortality rate of any psychiatric condition (~5-10% long-term); lifetime prevalence 0.9-2%; predominantly affects females aged 15-25.',
  neuroBasis: 'Anorexia involves right DLPFC hyperactivation in response to food cues (overcognitive control) and aberrant reward circuit responses; right DLPFC TMS modulates food cue reactivity.',
  responseData: 'Evidence level C; BMI threshold >=15 required before TMS initiation; small trials show TMS reduces food-related anxiety and restrictive cognitions as adjunct to refeeding.',
  patientExplain: 'Anorexia affects a part of the brain that has become overcontrolling about food and body image; brain stimulation gently reduces this overactive control, supporting recovery from the brain level.',
  timeline: 'TMS is an adjunct to medical and nutritional stabilisation; initiated only once a medically safe weight is achieved; 20 sessions alongside specialist eating disorder team.',
  selfCare: ['Nutritional rehabilitation and weight restoration remain the medical priority; TMS supports but does not replace this', 'Attend all dietetic appointments alongside TMS sessions', 'Communicate food-related anxiety levels at every session'],
  escalation: 'Escalate if BMI falls below threshold, cardiac complications emerge, or patient expresses inability to maintain safety.',
  homeNote: null,
  techSetup: 'Medical clearance required before each course (minimum BMI, cardiac screen, electrolytes); right DLPFC (F4); coordinate with specialist eating disorder team throughout.',
  faq: [
    {q:'Can TMS make me gain weight?',a:'TMS does not directly cause weight changes; it targets cognitive control circuits involved in food restriction.'},
    {q:'Is brain stimulation safe when I am underweight?',a:'TMS is only initiated above a minimum safe BMI threshold; medical clearance is required.'},
    {q:'Why do I need a team of specialists?',a:'Anorexia affects the whole body and mind; TMS addresses the brain circuit component while the team addresses medical, nutritional, and psychological aspects.'}
  ]
});

out += cond('bulimia', {
  epidemiology: 'Bulimia nervosa affects 1-2% of young women; characterised by binge-purge cycles; associated with shame, secrecy, and electrolyte abnormalities.',
  neuroBasis: 'Bulimia involves impaired inhibitory control over binge urges (R-DLPFC hypoactivation) and hyperreactive reward response to binge cues; R-DLPFC HF-TMS strengthens food-urge inhibition.',
  responseData: 'Evidence level C; R-DLPFC HF-TMS reduces binge frequency in small RCTs (Van den Eynde 2013); combine with CBT-Enhanced (CBT-E) for best outcomes.',
  patientExplain: 'Bulimia involves the brain\'s control centre struggling to override powerful binge urges; brain stimulation strengthens that control centre.',
  timeline: 'Binge frequency reduction typically begins within 2-3 weeks; binge/purge diary essential throughout the 20-session course.',
  selfCare: ['Complete daily binge/purge diary - honesty is more important than the numbers', 'Identify high-risk binge triggers (times, emotions, foods) and develop a circuit-breaker plan', 'Do not isolate between sessions - social support reduces binge-purge urges significantly'],
  escalation: 'Escalate if purging frequency increases, electrolyte results indicate dangerous levels, or suicidal ideation linked to shame emerges.',
  homeNote: null,
  techSetup: 'Right DLPFC (F4) HF 10 Hz; monitor PHQ-9 and binge diary at each session; electrolyte check monthly for purging patients.',
  faq: [
    {q:'Will TMS stop the urges to binge?',a:'TMS strengthens the inhibitory system making urges easier to manage; most effective combined with CBT-E skills practice.'},
    {q:'I feel ashamed - does the team know?',a:'Your team is trained in eating disorder care and treats all patients with complete confidentiality and non-judgement.'},
    {q:'Are there physical checks during treatment?',a:'Monthly electrolyte blood tests are recommended for patients who are still purging during the TMS course.'}
  ]
});

out += cond('bed', {
  epidemiology: 'Binge eating disorder is the most common eating disorder (~3.5% lifetime prevalence in women, 2% in men); associated with obesity, diabetes, and mood disorders.',
  neuroBasis: 'BED involves deficient right DLPFC impulse control and elevated dopaminergic responsivity to high-calorie food cues; R-DLPFC TMS reduces food-cue reactivity and binge impulse.',
  responseData: 'Evidence level C; R-DLPFC TMS reduces binge frequency ~30-50% in small trials; DBT skills concurrent training significantly enhances outcome.',
  patientExplain: 'Binge eating disorder involves a powerful pull toward overeating that feels out of control; brain stimulation reduces this pull by strengthening the ability to pause and choose.',
  timeline: 'Binge frequency typically reduces weeks 2-3; DBT emotion regulation skills concurrent with TMS greatly extend treatment gains; 20 sessions standard.',
  selfCare: ['Use the STOP acronym (Stop, Take a breath, Observe, Proceed) when the binge urge arises', 'Avoid skipping meals - regular eating patterns reduce binge triggers neurobiologically', 'Build a list of alternative coping activities for emotional binge triggers and keep it visible'],
  escalation: 'Escalate if binge frequency worsens, weight complications require medical management, or mood disorder deteriorates.',
  homeNote: null,
  techSetup: 'Right DLPFC (F4) HF 10 Hz; binge diary review at each session; track CGI-I and PHQ-9 alongside binge frequency; coordinate with dietitian.',
  faq: [
    {q:'Is BED just a lack of willpower?',a:'No; BED involves measurable differences in brain circuit function related to impulse control and reward processing.'},
    {q:'Will TMS help with my weight?',a:'TMS targets the eating behaviour circuit; binge reduction often leads to improved weight management as a secondary benefit.'},
    {q:'What is DBT and why do I need it?',a:'DBT provides emotion regulation skills that complement what TMS does neurobiologically - the two together work better than either alone.'}
  ]
});

// ── SUBSTANCE ─────────────────────────────────────────────────────────────────

out += cond('aud', {
  epidemiology: 'Alcohol use disorder affects ~240 million people globally (WHO 2022); a leading cause of preventable death and disability worldwide.',
  neuroBasis: 'AUD involves L-DLPFC hypoactivation (reduced top-down craving control) and R-DLPFC hyperactivation (approach bias); bilateral DLPFC TMS targets both circuits.',
  responseData: 'DLPFC TMS for AUD: meta-analysis shows ~35-50% craving reduction (Tik 2017); best outcomes combined with motivational interviewing or CBT relapse prevention.',
  patientExplain: 'Alcohol use disorder involves brain circuit changes that generate powerful cravings and reduce the ability to resist them; brain stimulation rebalances these circuits to support recovery.',
  timeline: 'Craving reduction often measurable from sessions 8-12; 20 sessions standard; combine with motivational interviewing and relapse prevention therapy.',
  selfCare: ['Record craving intensity (0-10) daily and before each session - craving data guides protocol adjustments', 'Identify three highest-risk relapse situations and develop specific plans for each', 'Attend mutual support groups (AA, SMART Recovery) alongside TMS - social support doubles success rates'],
  escalation: 'Escalate if active heavy drinking continues during TMS (seizure risk from alcohol withdrawal + TMS), or Wernicke encephalopathy risk is identified.',
  homeNote: null,
  techSetup: 'Confirm patient is not acutely intoxicated before proceeding; document craving VAS before and after each session; bilateral DLPFC; seizure risk elevated in active heavy drinking.',
  faq: [
    {q:'Do I have to be completely sober before starting TMS?',a:'We require you to attend sessions sober; heavy active drinking during TMS increases seizure risk and reduces effectiveness.'},
    {q:'Can TMS replace AA or SMART Recovery?',a:'TMS addresses brain biology while group support addresses social and psychological aspects; combining them significantly improves recovery rates.'},
    {q:'Will my cravings disappear after treatment?',a:'TMS reduces craving intensity and frequency; significant reduction in craving power is achievable for most patients.'}
  ]
});

out += cond('nic-dep', {
  epidemiology: 'Nicotine dependence affects ~1 billion smokers globally; standard cessation therapies have 6-month success rates of 15-35%.',
  neuroBasis: 'Nicotine dependence involves DLPFC hypoactivation during craving and insula-mediated interoceptive craving signals; L-DLPFC + insula TMS targets both cognitive control and interoceptive craving networks.',
  responseData: 'TMS for smoking: ~30-40% point-prevalence abstinence at 6 months in best trials (Amiaz 2009); insula targeting adds ~10-15% abstinence benefit over DLPFC alone.',
  patientExplain: 'Nicotine changes the brain to generate powerful cravings; brain stimulation reduces these cravings by strengthening decision-making and quieting the craving signal itself.',
  timeline: 'Craving reduction and initial quit attempts emerge weeks 2-3; 15 sessions standard; CO breathalyser monitoring confirms abstinence progress.',
  selfCare: ['Set a specific quit date within the first week of TMS and share it with your clinician', 'Use CO breathalyser results at sessions as objective motivation feedback', 'Identify smoking cues (coffee, stress, breaks) and prepare a specific replacement behaviour for each'],
  escalation: 'Escalate if patient resumes heavy smoking after initial cessation or depression emerges post-cessation.',
  homeNote: null,
  techSetup: 'L-DLPFC (F3) HF-TMS primary; insula targeting if coil available (FT7/T7 region); CO breathalyser at each visit; document cigarettes/day weekly.',
  faq: [
    {q:'Is TMS better than nicotine patches?',a:'TMS targets brain circuits rather than nicotine receptors - a different mechanism effective for those who have not succeeded with patches.'},
    {q:'What if I slip and smoke during treatment?',a:'Slips are common in recovery; your clinician will help you understand the trigger and adjust the plan - do not stop attending sessions.'},
    {q:'How long does the benefit last?',a:'Best evidence shows continued abstinence at 6 months in ~30-40% of patients; relapse prevention strategies extend this significantly.'}
  ]
});

out += cond('oud', {
  epidemiology: 'Opioid use disorder affects >16 million people globally; fentanyl contamination of illicit supply has dramatically increased overdose mortality.',
  neuroBasis: 'OUD involves profound disruption of prefrontal executive control over craving and opioid-induced reward circuit sensitisation; bilateral DLPFC TMS targets craving circuitry as a MAT augmentation.',
  responseData: 'Evidence level C; DLPFC TMS for OUD craving: promising small trials (Li 2020); best evidence is for TMS as MAT (buprenorphine/naltrexone) augmentation rather than standalone.',
  patientExplain: 'Opioid use disorder changes the brain\'s reward and control circuits profoundly; brain stimulation supports recovery by strengthening circuits that resist cravings while your medication manages physical dependency.',
  timeline: 'TMS course initiated after medical stabilisation on MAT (minimum 2 weeks); 20 sessions; concurrent psychosocial support essential.',
  selfCare: ['Take MAT (buprenorphine/naltrexone) as prescribed without exception - missing doses markedly increases relapse risk', 'Avoid contact with people, places, and things associated with opioid use during the TMS course', 'Keep a naloxone kit and ensure a trusted person knows how to use it'],
  escalation: 'Escalate if signs of withdrawal emerge during the course, patient discloses active illicit use, or overdose risk is identified.',
  homeNote: null,
  techSetup: 'Confirm MAT stability (minimum 2 weeks) before first session; craving VAS at each session; document withdrawal symptom score; have emergency protocols in place.',
  faq: [
    {q:'Can TMS replace my buprenorphine?',a:'No; TMS is an adjunct to MAT, not a replacement - both work on different parts of the opioid dependency problem.'},
    {q:'Is TMS safe with buprenorphine?',a:'Yes; TMS does not interact with buprenorphine or naltrexone.'},
    {q:'Will this help with cravings?',a:'TMS specifically targets craving circuits and has shown craving reduction in trials; results are most consistent when combined with MAT and counselling.'}
  ]
});

out += cond('cud', {
  epidemiology: 'Cannabis use disorder affects 1-3% of adults globally; increasing with legalisation; presents with tolerance, withdrawal (irritability, sleep disruption), and loss of control.',
  neuroBasis: 'CUD involves DLPFC hypoactivation during cognitive control tasks and CB1 receptor downregulation in prefrontal circuits; L-DLPFC TMS targets cognitive control deficits associated with cannabis cue reactivity.',
  responseData: 'Evidence level C; limited TMS RCT data for CUD; craving diary and motivational interviewing recommended alongside.',
  patientExplain: 'Cannabis use disorder affects the brain\'s motivation and decision-making circuits; brain stimulation aims to restore the ability to make choices independently of cannabis cravings.',
  timeline: 'TMS starting at week 2 of abstinence is recommended (after acute withdrawal peaks at days 2-7); 15-20 sessions.',
  selfCare: ['Plan for the first 2 weeks of abstinence - withdrawal symptoms are real and temporary', 'Replace cannabis use time with specific planned activities (exercise, creative projects)', 'Avoid social situations where cannabis is present during the TMS course'],
  escalation: 'Escalate if anxiety disorder emerges, psychosis-spectrum symptoms appear, or cannabis use level prevents accurate craving circuit assessment.',
  homeNote: null,
  techSetup: 'L-DLPFC (F3) HF-TMS; craving VAS at each session; document days since last use; psychosis screen before and during course (cannabis can precipitate psychosis).',
  faq: [
    {q:'Is cannabis use disorder a real diagnosis?',a:'Yes; it is a clinically recognised condition with measurable brain changes, not simply a lack of willpower.'},
    {q:'How long does cannabis affect the brain after stopping?',a:'Cannabinoid receptor normalisation takes approximately 4-6 weeks; TMS during this window can support brain recovery.'},
    {q:'Will TMS make withdrawal easier?',a:'Some patients report TMS reduces the irritability and cognitive fog of withdrawal; your clinician will monitor and provide support.'}
  ]
});

// ── SLEEP ─────────────────────────────────────────────────────────────────────

out += cond('insomnia', {
  epidemiology: 'Insomnia disorder affects 10-15% of adults chronically; ~30-35% experience occasional insomnia; leading complaint in primary care mental health.',
  neuroBasis: 'Insomnia involves cortical hyperarousal (elevated frontal beta power) and impaired slow-wave sleep generation; tDCS F3 anode promotes slow oscillation generation; CES reduces cortical arousal via alpha entrainment.',
  responseData: 'tDCS for insomnia: ISI reduction ~5-8 points in responders; CES meta-analysis shows significant sleep quality improvement (Kavirajan 2014); CBT-I concurrent is essential for durable outcomes.',
  patientExplain: 'Insomnia involves the brain getting stuck on when it should wind down; tDCS and CES gently shift the brain toward the calmer brainwave state associated with deep sleep.',
  timeline: 'Sleep improvements vary - some patients notice changes within 2 weeks; 20 sessions tDCS combined with sleep restriction therapy (CBT-I) produces strongest outcomes.',
  selfCare: ['Maintain a fixed wake time every day (even weekends) - the single most effective behavioural insomnia intervention', 'Restrict time in bed to actual sleep time initially (CBT-I sleep restriction) and expand only as sleep consolidates', 'Eliminate all screen light for 90 minutes before target sleep time'],
  escalation: 'Escalate if sleep deprivation causes dangerous impairment (driving, operating machinery) or depression emerges as a consequence of chronic insomnia.',
  homeNote: 'Alpha-Stim AID (ear clips, CES, 100 uA, 20 min evening) is FDA-cleared for insomnia and suitable as a daily home adjunct.',
  techSetup: 'tDCS F3 anode, Cz cathode; 2 mA, 20-30 min; schedule sessions late afternoon to align with sleep pressure window; document ISI at each session.',
  faq: [
    {q:'Should I take sleeping tablets during TMS?',a:'Discuss with your prescriber; gradual dose reduction is often planned during a successful TMS/CBT-I course.'},
    {q:'Can I use the Alpha-Stim every night?',a:'Yes; nightly use is appropriate and supported by evidence - ear clip application for 20 minutes before bed is the standard protocol.'},
    {q:'What is sleep restriction and will it make things worse first?',a:'Sleep restriction temporarily increases sleep pressure to consolidate fragmented sleep - it can feel worse for 1 week before improving significantly.'}
  ]
});

out += cond('hypersomn', {
  epidemiology: 'Hypersomnia disorders affect ~0.5-1% of the population; associated with significant occupational and social impairment.',
  neuroBasis: 'Idiopathic hypersomnia involves blunted arousal system activation and impaired prefrontal wakefulness-promoting network activity; excitatory tDCS to F3 targets prefrontal arousal regulation.',
  responseData: 'Evidence level C; small case-series only; sleep apnoea and narcolepsy must be excluded before tDCS; Epworth Sleepiness Scale monitoring throughout.',
  patientExplain: 'Hypersomnia involves the brain\'s wake-promoting system not activating adequately; tDCS gently stimulates the frontal region to support normal alertness levels.',
  timeline: 'Alertness improvements may be noticed from sessions 5-10; 20 sessions initial course; sleep medicine evaluation required before and during treatment.',
  selfCare: ['Maintain a structured sleep schedule with consistent bed and wake times', 'Strategic napping (20-min nap before 2pm) can reduce sleepiness without disrupting night sleep', 'Avoid alcohol and sedating medications during treatment'],
  escalation: 'Escalate if Epworth score worsens, occupational safety is at risk (patient drives heavy machinery while excessively sleepy), or new sleep disorder symptoms emerge.',
  homeNote: null,
  techSetup: 'Excitatory tDCS anode F3; 2 mA; morning session timing preferred; document Epworth Sleepiness Scale at each session; confirm sleep apnoea exclusion.',
  faq: [
    {q:'Have I been tested for sleep apnoea?',a:'A sleep study to exclude sleep apnoea is required before starting tDCS for hypersomnia.'},
    {q:'Will brain stimulation keep me awake at night?',a:'Sessions are scheduled in the morning to support daytime alertness without disrupting night-time sleep.'},
    {q:'Is this the same as narcolepsy?',a:'Narcolepsy and idiopathic hypersomnia are different conditions - your neurologist will confirm your diagnosis.'}
  ]
});

// ── PAIN ─────────────────────────────────────────────────────────────────────

out += cond('pain-neuro', {
  epidemiology: 'Neuropathic pain affects 7-10% of the general population; caused by lesion or disease of the somatosensory system; among the most difficult pain types to treat pharmacologically.',
  neuroBasis: 'Neuropathic pain involves central sensitisation and reduced cortical inhibitory tone; HF-TMS or tDCS to M1 (C3/C4 contralateral to pain) restores descending inhibitory modulation of pain signals.',
  responseData: 'M1 TMS for neuropathic pain: NRS reduction 30-50% in responders; effect size d~0.7 (Lefaucheur meta-analysis 2020); 10-20 sessions; monthly maintenance may be required.',
  patientExplain: 'Neuropathic pain involves overactive pain signals in the nervous system; brain stimulation activates the brain\'s own pain control system to turn down this overactivity.',
  timeline: 'Pain reduction typically begins sessions 5-10; NRS tracking before every session guides protocol adjustment.',
  selfCare: ['Track pain NRS (0-10) morning and evening using a diary app - baseline variability data helps interpret treatment response', 'Gentle graded physical activity (as tolerated by your physio) enhances neuromodulation pain benefits', 'Pain neuroscience education alongside TMS significantly improves outcomes by reducing pain catastrophisation'],
  escalation: 'Escalate if pain intensity consistently above baseline NRS across 3+ sessions, new neurological deficit appears, or medication side effects worsen.',
  homeNote: 'Alpha-Stim CES (100-500 uA) can provide adjunct home pain relief for neuropathic pain and is FDA-cleared for this indication.',
  techSetup: 'M1 contralateral to pain (C3 or C4); identify hotspot for relevant muscle contralateral to pain; HF 10 Hz or iTBS; document pain NRS before and 30 min after each session.',
  faq: [
    {q:'How does TMS reduce my nerve pain?',a:'TMS activates the motor cortex which stimulates the brain\'s own descending pain-control pathways, reducing the intensity of pain signals reaching consciousness.'},
    {q:'Will I be able to reduce my pain medication?',a:'If TMS produces good pain relief, your prescriber may consider gradual medication reduction - never do this without medical supervision.'},
    {q:'How long does the pain relief last?',a:'Initial sessions last hours to days; with a full course, effect can extend weeks to months; some patients require monthly maintenance sessions.'}
  ]
});

out += cond('pain-msk', {
  epidemiology: 'Musculoskeletal chronic pain affects ~20% of adults globally; leading cause of disability; includes chronic low back pain, osteoarthritis, and shoulder/neck conditions.',
  neuroBasis: 'Chronic MSK pain involves central sensitisation in M1 and insular cortex; TMS/tDCS to M1 modulates cortical pain representations and reduces central sensitisation via corticospinal descending inhibitory tracts.',
  responseData: 'Evidence level B; M1 TMS meta-analysis shows significant NRS reduction in chronic MSK pain; PBM adjunct shows additive anti-inflammatory effects at peripheral tissue level.',
  patientExplain: 'Chronic musculoskeletal pain becomes a brain problem as well as a body problem; brain stimulation addresses the brain\'s contribution to ongoing pain, making physiotherapy more effective.',
  timeline: 'NRS reduction typically measurable from sessions 5-8; physiotherapy concurrently essential for functional improvement.',
  selfCare: ['Engage with your physiotherapy programme - TMS makes the brain more receptive to movement rehabilitation', 'Pace activity using the 10% rule (increase activity 10% per week maximum)', 'Cold/heat therapy at the pain site before sessions reduces peripheral input that confounds central pain assessment'],
  escalation: 'Escalate if NRS consistently above 8 during and after sessions, new neurological deficit appears, or imaging reveals new structural change.',
  homeNote: null,
  techSetup: 'M1 contralateral (C3/C4); PBM to pain site before TMS if available; document pain NRS before and after session; physiotherapy report review at 5-session intervals.',
  faq: [
    {q:'Will TMS fix my back/knee/shoulder?',a:'TMS addresses the brain\'s pain-amplification component; combined with physiotherapy, many patients achieve significant functional improvement.'},
    {q:'Is TMS better than TENS for my pain?',a:'TMS works centrally (on the brain) while TENS works peripherally (on nerves) - they target different mechanisms and can be complementary.'},
    {q:'Do I need to stop my pain medications?',a:'No; continue all prescribed medications; your prescriber will advise on adjustments based on treatment response.'}
  ]
});

out += cond('fibro', {
  epidemiology: 'Fibromyalgia affects 2-4% of the population (predominantly women); characterised by widespread pain, fatigue, sleep disturbance, and cognitive difficulties.',
  neuroBasis: 'Fibromyalgia involves diffuse central sensitisation, reduced descending pain inhibition (DNIC), and altered M1 cortical excitability; M1 TMS restores inhibitory tone.',
  responseData: 'M1 TMS for fibromyalgia: NRS and FIQ improvements in RCTs (Boyer 2014); bilateral protocol adds ~15% benefit; CES (Alpha-Stim) has independent RCT support for fibromyalgia pain.',
  patientExplain: 'Fibromyalgia involves the brain\'s pain thermostat set too high across the whole body; brain stimulation turns this thermostat back down, reducing whole-body pain sensitivity.',
  timeline: 'Pain and fatigue improvements typically begin weeks 2-3; FIQ tracked monthly; graded aerobic exercise is the most evidence-based self-care adjunct and enhances TMS outcomes.',
  selfCare: ['Begin a graded aerobic exercise programme (starting 10 min gentle walking, increasing weekly) - the most evidence-based fibromyalgia self-management', 'Use sleep hygiene strategies and maintain consistent sleep times to support deep sleep quality', 'Record flare-ups, triggers, and sleep scores in a diary between sessions'],
  escalation: 'Escalate if widespread pain significantly worsens from baseline, new neurological symptoms appear, or depression component deteriorates.',
  homeNote: 'Alpha-Stim AID (CES) is FDA-cleared for fibromyalgia pain and can be used at home daily alongside clinic TMS sessions.',
  techSetup: 'M1 bilateral (C3 and C4 sequential); HF 10 Hz; document FIQ and NRS at baseline and every 5 sessions; CES prescription for home use.',
  faq: [
    {q:'Is fibromyalgia a real condition?',a:'Yes; it is a well-characterised neurobiological condition involving measurable central nervous system pain-processing differences.'},
    {q:'Why is exercise recommended when I am in pain?',a:'Graded aerobic exercise specifically reduces central sensitisation in fibromyalgia - starting very gently produces significant pain reduction over 8-12 weeks.'},
    {q:'How many courses of TMS will I need?',a:'Initial course 20-30 sessions; monthly maintenance sessions are recommended for sustained benefit in this chronic condition.'}
  ]
});

out += cond('migraine', {
  epidemiology: 'Migraine affects 12-15% of adults globally; second leading cause of disability worldwide; up to 3% progress to chronic migraine (>=15 headache days/month).',
  neuroBasis: 'Migraine with aura involves spreading cortical depolarisation from V1; single-pulse TMS to occipital cortex (Oz) at aura onset disrupts this spreading depolarisation wave before the pain phase.',
  responseData: 'SpringTMS FDA-cleared for migraine with aura: 39% pain-free at 2 hours vs. 22% sham (Lipton 2010); preventive protocol reduces monthly migraine days ~2.75 more than sham.',
  patientExplain: 'Migraine with aura starts with a spreading electrical wave in the brain\'s vision area; a single TMS pulse at the first sign of aura can stop this wave before it triggers the headache.',
  timeline: 'For acute treatment, device must be applied at aura onset; preventive protocol produces monthly headache reduction over 3 months of daily use.',
  selfCare: ['Keep a detailed headache diary (timing, aura type, triggers, medications) to identify your patterns', 'Apply TMS within 20 minutes of aura onset for best acute effect', 'Work with your neurologist on trigger identification (sleep, hydration, hormonal, dietary)'],
  escalation: 'Escalate if migraine frequency increases to >=15 days/month, new neurological symptoms emerge with headache, or medication overuse headache is suspected.',
  homeNote: 'SpringTMS device is prescribed for home/self-use; train patient in device application at Oz, aura recognition, and preventive protocol timing.',
  techSetup: 'Patient training session: demonstrate Oz placement, single-pulse delivery, and aura recognition; provide written home-use protocol card; document headache diary baseline; coordinate with neurologist.',
  faq: [
    {q:'Do I carry the device with me all the time?',a:'Yes; the SpringTMS is a portable handheld device designed to be with you so you can treat at aura onset wherever you are.'},
    {q:'What if I do not get aura?',a:'Single-pulse TMS is FDA-cleared for migraine with aura; a preventive daily protocol can be used for migraine without aura - discuss with your neurologist.'},
    {q:'Can I use TMS and my sumatriptan?',a:'Yes; TMS and triptans can be used in the same attack; some patients use TMS first and only take a triptan if headache develops despite TMS.'}
  ]
});

out += cond('tinnitus', {
  epidemiology: 'Tinnitus affects ~15% of adults globally; 1-2% have severely bothersome tinnitus; commonly associated with hearing loss, noise exposure, and stress.',
  neuroBasis: 'Tinnitus involves auditory cortex (STG/T7-T8) hyperactivity with de-afferentation-induced maladaptive plasticity; LF-TMS (1 Hz) to bilateral auditory cortex suppresses this hyperactivity to reduce phantom sound perception.',
  responseData: 'LF-TMS bilateral auditory cortex: ~40-50% of patients experience clinically meaningful TFI or THI reduction; 10 sessions initial; monthly maintenance sustains benefit (Langguth 2014).',
  patientExplain: 'Tinnitus is caused by overactive brain auditory cells creating phantom sounds; brain stimulation calms this overactivity, reducing the volume and intrusiveness of the ringing.',
  timeline: 'TFI/THI improvement typically begins weeks 2-3; 10 sessions initial; monthly maintenance sessions sustain benefit for most responders; sound therapy concurrent enhances outcomes.',
  selfCare: ['Use sound enrichment (soft background noise at bedtime) - silence worsens tinnitus by increasing auditory cortex gain', 'Practice mindfulness-based tinnitus management to reduce distress response to tinnitus sounds', 'Wear ear protection at concerts and noisy workplaces to prevent further cochlear damage'],
  escalation: 'Escalate if pulsatile tinnitus develops (possible vascular cause requiring investigation), sudden onset or unilateral tinnitus arises, or associated vertigo and hearing loss suggest Meniere\'s disease.',
  homeNote: null,
  techSetup: 'MANDATORY cochlear implant check before any session (absolute contraindication); hearing aid removal before session; bilateral T7/T8 LF 1 Hz; document TFI before first session and at sessions 5 and 10.',
  faq: [
    {q:'Will TMS cure my tinnitus?',a:'TMS reduces tinnitus volume and distress in ~40-50% of patients; complete elimination is less common but significant reduction is achievable.'},
    {q:'I have hearing aids - is TMS still safe?',a:'Remove hearing aids before each session; cochlear implants are a contraindication - confirm your implant status before treatment.'},
    {q:'What is sound therapy and why use it with TMS?',a:'Sound therapy provides background acoustic enrichment preventing silence-induced auditory cortex gain that worsens tinnitus; it enhances and extends TMS benefits.'}
  ]
});

// Write the partial file (neurological + other + protocols will be appended in next step)
out += '\n  // ── TO BE CONTINUED: neurological + other + protocols (appended by gen step 2) ──\n\n};\n';

fs.writeFileSync(OUT, out, 'utf8');
const lines = out.split('\n').length;
console.log('Written. Lines:', lines, 'Size:', Buffer.byteLength(out, 'utf8'), 'bytes');
