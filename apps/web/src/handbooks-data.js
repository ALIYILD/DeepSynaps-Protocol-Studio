// DeepSynaps Handbook Content Data
// Per-condition handbook fragments used by pages-handbooks.js template engine.
export const HANDBOOK_DATA = {

  "mdd": {
    "epidemiology": "MDD affects ~280 million globally (WHO 2023); lifetime prevalence 15-20%; leading cause of disability worldwide.",
    "neuroBasis": "L-DLPFC is hypometabolic in MDD; HF-TMS to F3 restores excitability and normalises DLPFC-sgACC network connectivity.",
    "responseData": "50-60% response, 30-35% remission after 30 sessions (OReardon 2007, George 2010); iTBS non-inferior to HF-TMS (Blumberger 2018).",
    "patientExplain": "Depression reduces activity in a frontal brain area that regulates mood; TMS re-activates this area without medication side effects.",
    "timeline": "Mood lift typically begins sessions 10-15; full response assessed at session 30; improvement can continue 4-6 weeks post-course.",
    "selfCare": [
      "Keep consistent sleep and wake times throughout the course",
      "Light aerobic exercise 3x/week enhances TMS response",
      "Maintain a mood diary and bring it to weekly reviews"
    ],
    "escalation": "Escalate if PHQ-9 item 9 scores >=2, suicidal plan emerges, or worsening agitation occurs after sessions.",
    "homeNote": "Flow Neuroscience tDCS (F3 anode, Fp2 cathode, 2mA, 30 min, 5x/wk) suitable as home maintenance adjunct.",
    "techSetup": "Confirm F3 via 10-20 measurement; hotspot APB at 100% MSO; document MT at baseline before first session.",
    "faq": [
      {
        "q": "Will TMS change my personality?",
        "a": "No; it targets mood regulation circuits only, not personality traits."
      },
      {
        "q": "Can I drive after sessions?",
        "a": "Yes; TMS does not impair driving ability."
      },
      {
        "q": "What if I feel worse before better?",
        "a": "Some fluctuation is normal in week 1; contact your clinician if it persists past session 10."
      }
    ]
  },

  "trd": {
    "epidemiology": "TRD (>=2 failed antidepressant trials) affects ~30% of MDD patients; associated with 4x greater disability and healthcare costs.",
    "neuroBasis": "Persistent sgACC hyperactivity and DLPFC hypoconnectivity underlie resistance; bilateral TMS or DBS targets address network-level pathology.",
    "responseData": "Bilateral TMS yields ~45-55% response (Carpenter 2012); SAINT accelerated iTBS achieved 79% remission (Cole 2020).",
    "patientExplain": "Treatment-resistant depression means standard medications have not helped enough; brain stimulation bypasses medication pathways to retune mood circuits directly.",
    "timeline": "TRD often requires 36-40 sessions; do not judge response before session 20; a second course may be needed.",
    "selfCare": [
      "Do not discontinue current medications without psychiatric review",
      "Record symptoms weekly and share at every session",
      "Sleep consistency is especially important during extended courses"
    ],
    "escalation": "Escalate if no response signal by session 20 (consider protocol change) or suicidality intensifies (ECT referral consideration).",
    "homeNote": "Home tDCS maintenance may be considered after TMS course completion.",
    "techSetup": "Bilateral protocols require independent MT for each hemisphere; document both baseline MTs.",
    "faq": [
      {
        "q": "Is ECT a better option?",
        "a": "ECT has higher remission rates but more side effects; your clinician will weigh this based on your history."
      },
      {
        "q": "How many TMS courses can I have?",
        "a": "Repeat courses are safe; many patients benefit from two or more courses over years."
      },
      {
        "q": "Should I stop antidepressants during TMS?",
        "a": "No; continuing medications during TMS is standard and may enhance outcomes."
      }
    ]
  },

  "bpd": {
    "epidemiology": "Bipolar disorder affects ~2.4% of the population; depressive phases account for ~50% of illness time and carry highest suicide risk.",
    "neuroBasis": "Bipolar depression involves DLPFC hypoactivation within a dynamic network instability context; mood-switching risk requires careful protocol selection.",
    "responseData": "TMS for bipolar depression ~40-50% response; right-sided or bilateral protocols may reduce mood-switching risk versus L-DLPFC HF alone.",
    "patientExplain": "Bipolar disorder causes mood cycles; brain stimulation is used carefully during depressive phases to lift mood without triggering a manic episode.",
    "timeline": "Improvement may appear from session 10; weekly monitoring for mood elevation is mandatory throughout.",
    "selfCare": [
      "Take mood stabilisers exactly as prescribed",
      "Use a mood chart app daily and share at every session",
      "Avoid sleep deprivation - the most common mood switching trigger"
    ],
    "escalation": "Escalate if MADRS improves >10 points in <1 week (possible hypomania) or patient reports decreased sleep need and elevated energy.",
    "homeNote": null,
    "techSetup": "Default to right-sided or bilateral LF protocol; L-DLPFC HF only with explicit psychiatrist approval.",
    "faq": [
      {
        "q": "Can TMS trigger mania?",
        "a": "Rare but possible; the protocol minimises this risk and weekly monitoring watches for early signs."
      },
      {
        "q": "Should I take my mood stabiliser on session days?",
        "a": "Yes; take all medications as prescribed on session days."
      },
      {
        "q": "What if I feel unusually energetic?",
        "a": "Contact your clinician immediately; increased energy or reduced sleep may signal mood switching."
      }
    ]
  },

  "ppd": {
    "epidemiology": "Postpartum depression affects 10-15% of new mothers; onset typically within 4 weeks of delivery; frequently under-recognised.",
    "neuroBasis": "Rapid oestrogen withdrawal disrupts HPA axis and prefrontal-limbic connectivity; L-DLPFC TMS reactivates mood circuits without systemic drug exposure.",
    "responseData": "~50-60% TMS response in PPD trials (Kim 2011); preferred when medication avoidance is prioritised for breastfeeding mothers.",
    "patientExplain": "Postpartum depression is caused by hormonal changes after birth that affect brain chemistry; TMS improves mood without medication passing into breast milk.",
    "timeline": "Many mothers notice improvement within 2-3 weeks; infant care coordination for all session days is essential for consistent attendance.",
    "selfCare": [
      "Arrange reliable childcare for session days",
      "Sleep whenever the baby sleeps - deprivation significantly worsens PPD",
      "Ask your health visitor about additional support services"
    ],
    "escalation": "Escalate immediately if postpartum psychosis symptoms emerge (confusion, hallucinations, extreme agitation) - psychiatric emergency.",
    "homeNote": null,
    "techSetup": "Standard L-DLPFC; confirm patient is not acutely sleep-deprived before proceeding; keep session environment calm and private.",
    "faq": [
      {
        "q": "Is TMS safe while breastfeeding?",
        "a": "Yes; TMS is non-systemic and does not affect breast milk or infant safety."
      },
      {
        "q": "Will I have to stop breastfeeding?",
        "a": "No; TMS is specifically chosen to avoid medications that might require stopping breastfeeding."
      },
      {
        "q": "What if I miss sessions because of the baby?",
        "a": "Contact the clinic early to reschedule; some clinics offer early morning slots."
      }
    ]
  },

  "sad": {
    "epidemiology": "SAD affects 3-5% of the general population; more common at higher latitudes; onset typically October-November, remission March-April.",
    "neuroBasis": "SAD involves circadian rhythm disruption and serotonergic dysregulation; DLPFC TMS reinforces frontal inhibitory control over limbic mood circuits.",
    "responseData": "Evidence level B; extrapolated from MDD; early-season treatment (October) before full symptom onset improves outcomes.",
    "patientExplain": "Seasonal depression is triggered by reduced sunlight affecting brain chemistry; brain stimulation combined with light therapy can reset mood circuits.",
    "timeline": "Start at first sign of seasonal decline; 20-25 sessions; annual preventive courses are appropriate for consistent seasonal patterns.",
    "selfCare": [
      "Use a 10,000 lux light therapy lamp 30 min each morning from September",
      "Keep wake time consistent even on weekends through winter",
      "Outdoor exercise in natural daylight supports circadian function"
    ],
    "escalation": "Escalate if PHQ-9 reaches >=20 or active suicidality emerges; consider antidepressant augmentation.",
    "homeNote": "Light therapy (10,000 lux lamp, 30 min/morning) is first-line adjunct - provide lamp prescription at intake.",
    "techSetup": "Standard L-DLPFC; note seasonal timing in records; consider preventive autumn booster for prior responders.",
    "faq": [
      {
        "q": "Should I start TMS every year?",
        "a": "Repeat autumn courses are reasonable for patients with consistent seasonal patterns who have responded before."
      },
      {
        "q": "Can I use a light lamp at the same time?",
        "a": "Yes; combining light therapy with TMS is safe and may enhance outcomes."
      },
      {
        "q": "Will TMS work for mild SAD?",
        "a": "For mild SAD, light therapy alone may be sufficient; discuss severity with your clinician."
      }
    ]
  },

  "pdd": {
    "epidemiology": "PDD affects 2-3% of adults; present >=2 years by definition; frequently co-occurs with MDD (double depression).",
    "neuroBasis": "Chronic DLPFC hypoactivation and blunted reward-circuit responsivity characterise PDD; TMS response rates are lower than acute MDD due to long-standing network adaptation.",
    "responseData": "TMS response ~30-40%; longer courses (36-40 sessions) and combination with ACT or CBT-D improve outcomes.",
    "patientExplain": "Persistent depression has become the brain's default setting; TMS gradually re-sensitises the mood circuit over time, especially combined with therapy.",
    "timeline": "Response in PDD is slower than acute MDD; assess at session 20 and session 36; concurrent psychotherapy greatly enhances benefit.",
    "selfCare": [
      "Behavioural activation (scheduled pleasant activities) is the most evidence-based self-care; keep an activity log",
      "Limit alcohol - it worsens chronic low mood neurobiologically",
      "Set one small daily goal to counter anhedonia"
    ],
    "escalation": "Escalate if PHQ-9 rises from baseline or suicidality emerges; consider antidepressant augmentation if no TMS response at session 20.",
    "homeNote": "Home tDCS maintenance is particularly relevant in PDD as relapse prevention after a full course.",
    "techSetup": "Standard L-DLPFC HF or iTBS; iTBS preferred for patients with low motivation and attendance risk.",
    "faq": [
      {
        "q": "Will TMS cure my dysthymia?",
        "a": "TMS alone is unlikely to be curative but can significantly lift baseline mood when combined with therapy."
      },
      {
        "q": "How long will I need treatment?",
        "a": "Initial 36-40 session course; maintenance sessions or home device may be recommended thereafter."
      },
      {
        "q": "My mood has always been low - is that normal?",
        "a": "No; persistent low mood is a treatable condition, not a personality trait."
      }
    ]
  },

  "gad": {
    "epidemiology": "GAD affects 5-6% of adults; excessive uncontrollable worry for >=6 months; highly comorbid with MDD.",
    "neuroBasis": "GAD involves right DLPFC and amygdala hyperactivation; LF-TMS (1 Hz) to right DLPFC suppresses cortical excitability and reduces top-down anxiety amplification.",
    "responseData": "Evidence level B; ~40-50% response in trials; taVNS shows emerging data for GAD via vagal-amygdala inhibition.",
    "patientExplain": "Anxiety involves overactivity in the brain's threat-detection system; brain stimulation gently dampens this hyperactivity, making it easier to manage worry.",
    "timeline": "Anxiety relief typically begins sessions 8-12; full benefit after 20 sessions; combine with CBT worry-management for best outcome.",
    "selfCare": [
      "Practice diaphragmatic breathing 10 minutes twice daily",
      "Limit caffeine and alcohol - both worsen anxiety neurochemically",
      "Use a worry-time technique to contain rumination to a scheduled 15-minute window daily"
    ],
    "escalation": "Escalate if GAD-7 rises >5 points from baseline, panic attacks emerge, or inability to function at work/home.",
    "homeNote": "Alpha-Stim CES (ear clips, 100 uA, 20 min/day) is FDA-cleared for anxiety and suitable as a home adjunct.",
    "techSetup": "Target right DLPFC (F4); 1 Hz inhibitory protocol; confirm MT at F4; keep session environment quiet and low-stimulus.",
    "faq": [
      {
        "q": "Will TMS calm me immediately?",
        "a": "Most patients notice gradual change over 2-3 weeks rather than immediate sedation; the effect builds with repeated sessions."
      },
      {
        "q": "Can I use CES at home as well as attending clinic?",
        "a": "Yes; home CES can complement clinic-based TMS; discuss timing with your clinician."
      },
      {
        "q": "Does TMS work as well as medication for anxiety?",
        "a": "CBT is first-line; TMS is used when medication and therapy alone have not produced adequate relief."
      }
    ]
  },

  "panic": {
    "epidemiology": "Panic disorder affects 2-3% of adults; recurrent unexpected panic attacks with persistent concern about future attacks.",
    "neuroBasis": "Panic involves insula-amygdala hyperexcitability with insufficient PFC inhibitory control; right DLPFC LF-TMS augments cortical inhibition of panic circuitry.",
    "responseData": "Evidence level B; extrapolated from anxiety circuits; 15-20 sessions typical.",
    "patientExplain": "Panic attacks involve a brain alarm system that fires incorrectly; brain stimulation strengthens the control centre that regulates this alarm.",
    "timeline": "Panic frequency and intensity typically reduces from sessions 8-15; maintain a panic diary throughout.",
    "selfCare": [
      "Learn the 5-4-3-2-1 grounding technique to interrupt panic in the moment",
      "Avoid caffeine - it directly triggers the adrenergic response underlying panic",
      "Gradual exposure to feared situations (with therapy guidance) prevents avoidance from worsening"
    ],
    "escalation": "Escalate if panic frequency increases during treatment, agoraphobic avoidance expands, or emergency presentations increase.",
    "homeNote": "Alpha-Stim CES suitable for home anxiety and panic management.",
    "techSetup": "Right DLPFC (F4) LF 1 Hz; keep session room calm; brief patient on normal TMS sensations before first session to prevent session-induced panic.",
    "faq": [
      {
        "q": "Can a TMS session trigger a panic attack?",
        "a": "Uncommon; unfamiliar sensations in early sessions can feel anxiety-provoking - a calm preparation and slow ramp-up reduces this risk."
      },
      {
        "q": "Should I continue my anxiety medication during TMS?",
        "a": "Yes; continue medications as prescribed throughout."
      },
      {
        "q": "How long will the results last?",
        "a": "Most patients maintain benefit 6-12 months; CBT concurrent with TMS greatly extends durability."
      }
    ]
  },

  "social-anx": {
    "epidemiology": "Social anxiety disorder affects 7-13% of people; median onset age 13; frequently under-treated due to avoidance of help-seeking.",
    "neuroBasis": "SAD involves right DLPFC and amygdala hyperreactivity to social threat cues; LF-TMS to right DLPFC reduces social evaluation-induced prefrontal hyperactivation.",
    "responseData": "Evidence level B; 15-20 sessions LF right DLPFC; best results concurrent with CBT exposure hierarchy.",
    "patientExplain": "Social anxiety involves the brain over-predicting social threat; brain stimulation quiets the overactive part of the brain that generates fear of judgement.",
    "timeline": "Improvement often noticed from session 10; concurrent CBT exposure work amplifies TMS gains significantly.",
    "selfCare": [
      "Schedule one low-stakes social interaction per week as behavioural exposure practice",
      "Practice upcoming social scenarios mentally - visualisation activates neural rehearsal",
      "Join a structured group activity to build graded social confidence"
    ],
    "escalation": "Escalate if functional impairment worsens (inability to attend work or school) or depression scores rise during treatment.",
    "homeNote": null,
    "techSetup": "Right DLPFC (F4) 1 Hz LF; schedule sessions when patient is not about to face a high-stress social event.",
    "faq": [
      {
        "q": "Will TMS reduce my social anxiety permanently?",
        "a": "TMS reduces neural hyperreactivity; combined with CBT, improvements are often durable."
      },
      {
        "q": "Do I need therapy at the same time?",
        "a": "Strongly recommended; TMS combined with CBT produces significantly better outcomes for social anxiety."
      },
      {
        "q": "Is social anxiety a sign of weakness?",
        "a": "No; it is a well-characterised neurobiological condition involving measurable brain circuit differences."
      }
    ]
  },

  "specific-ph": {
    "epidemiology": "Specific phobia affects 7-9% of adults; most common types are animal, situational, blood-injection-injury, and natural environment.",
    "neuroBasis": "Specific phobia involves amygdala hyperreactivity to fear cues with inadequate vmPFC extinction; TMS to right DLPFC augments top-down fear extinction capacity.",
    "responseData": "Evidence level C; CBT (exposure therapy) remains first-line; TMS used as augmentation when CBT alone is insufficient.",
    "patientExplain": "A specific phobia is an intense persistent fear response; brain stimulation helps the brain learn more effectively during exposure therapy that the feared thing is not actually dangerous.",
    "timeline": "TMS augments extinction learning; best used during or immediately before CBT exposure sessions; 10-15 sessions typical.",
    "selfCare": [
      "Work through your phobia hierarchy with your therapist - TMS enhances the brain's ability to learn from exposure",
      "Practice controlled breathing when confronting feared stimuli",
      "Reward yourself after successful exposures to reinforce progress"
    ],
    "escalation": "Escalate if phobia has expanded to new situations or depression secondary to functional impairment emerges.",
    "homeNote": null,
    "techSetup": "Right DLPFC (F4) LF; coordinate session timing with therapist for maximum extinction augmentation benefit.",
    "faq": [
      {
        "q": "Will TMS cure my phobia on its own?",
        "a": "TMS is most effective as augmentation to CBT exposure therapy rather than as a standalone treatment."
      },
      {
        "q": "Can I have TMS for blood/needle phobia?",
        "a": "Yes; vasovagal pre-screening is recommended and supine positioning during sessions is advised."
      },
      {
        "q": "How many sessions will I need?",
        "a": "Typically 10-15 sessions aligned with your exposure hierarchy."
      }
    ]
  },

  "agoraphobia": {
    "epidemiology": "Agoraphobia affects 1.7% of adults; associated with fear of situations where escape is difficult; commonly co-occurs with panic disorder.",
    "neuroBasis": "Agoraphobia involves heightened interoceptive alarm (insula hyperactivity) and PFC inhibitory failure in open or crowd contexts; DLPFC TMS enhances cortical regulation of threat appraisal.",
    "responseData": "Evidence level C; best used as CBT augmentation for treatment-refractory agoraphobia.",
    "patientExplain": "Agoraphobia causes intense anxiety in open spaces or crowds; brain stimulation helps the brain's control centre better manage these fear signals.",
    "timeline": "Clinical improvement requires concurrent CBT with graduated exposure; TMS alone is unlikely to be sufficient; 15-20 sessions alongside therapy.",
    "selfCare": [
      "Create a graded exposure hierarchy starting with very brief safe ventures outside",
      "Use virtual reality exposure as an intermediate step before real-world exposure",
      "Identify a trusted support person for early real-world exposure practices"
    ],
    "escalation": "Escalate if the patient becomes fully housebound or suicidal ideation linked to functional impairment emerges.",
    "homeNote": "Alpha-Stim CES can be used at home before scheduled exposure exercises to reduce baseline anxiety.",
    "techSetup": "Ensure clinic environment is accessible and low-anxiety; offer telehealth pre-session check-in; right DLPFC (F4) LF protocol.",
    "faq": [
      {
        "q": "What if I cannot get to the clinic?",
        "a": "Contact us in advance; we can arrange telehealth support and graduated attendance plans."
      },
      {
        "q": "Is it safe to attend sessions alone?",
        "a": "You are welcome to bring a support person; we will help you build independence over the course."
      },
      {
        "q": "Will TMS help me leave my house?",
        "a": "TMS reduces the neurobiological anxiety component; combined with exposure therapy, many patients achieve significant return of function."
      }
    ]
  },

  "ocd": {
    "epidemiology": "OCD affects 2-3% of the population; mean onset age ~20; intrusive obsessions and compulsions causing significant functional impairment.",
    "neuroBasis": "OCD involves hyperactivity of the cortico-striato-thalamo-cortical (CSTC) loop, particularly OFC-caudate; deep TMS (H7 coil) to SMA/ACC disrupts this hyperactive loop.",
    "responseData": "FDA-cleared BrainsWay H7 deep TMS: 38% responder rate (Y-BOCS reduction >=30%) vs 11% sham (Carmi 2019); 29 sessions with symptom provocation protocol.",
    "patientExplain": "OCD involves a stuck loop in the brain generating distressing thoughts and compulsive urges; deep brain stimulation disrupts this loop, giving you more control over your responses.",
    "timeline": "Y-BOCS improvement typically begins weeks 3-4; symptom provocation before each session is essential for optimal outcomes.",
    "selfCare": [
      "Practice ERP homework daily as directed by your therapist - TMS enhances extinction learning",
      "Resist compulsions for a set period after each session while the brain is receptive",
      "Keep an obsession and compulsion log to track patterns"
    ],
    "escalation": "Escalate if Y-BOCS rises >5 points from baseline, depression worsens significantly, or patient disengages from ERP therapy.",
    "homeNote": null,
    "techSetup": "BrainsWay H7 coil; 20 Hz deep TMS; administer OCD symptom provocation (personalised imagery script or object) 30 min before each session; document provocation anxiety VAS.",
    "faq": [
      {
        "q": "What is the provocation before my session?",
        "a": "We briefly expose you to your OCD trigger before TMS to activate the OCD circuit so stimulation targets it more precisely."
      },
      {
        "q": "Do I need to stop my SSRI?",
        "a": "No; continuing your SSRI during TMS is standard and may enhance overall response."
      },
      {
        "q": "How is this different from regular TMS?",
        "a": "We use a deep-penetrating H7 coil reaching the SMA and ACC - the key OCD circuit areas."
      }
    ]
  },

  "bdd": {
    "epidemiology": "BDD affects 1.7-2.4% of adults; preoccupation with perceived physical defects causing significant distress; high suicide risk.",
    "neuroBasis": "BDD shares CSTC loop hyperactivity with OCD but involves greater right hemisphere visual processing hyperactivation; TMS to R-DLPFC/SMA modulates both circuits.",
    "responseData": "Evidence level C; limited TMS trials; best combined with CBT-BDD (mirror exposure, cognitive restructuring); Y-BOCS-BDD monitoring.",
    "patientExplain": "BDD causes the brain to magnify and distort perceived physical flaws; brain stimulation reduces the intensity of these preoccupations, making therapy more accessible.",
    "timeline": "Improvement in BDD requires concurrent CBT; 20-30 TMS sessions alongside weekly therapy recommended.",
    "selfCare": [
      "Limit mirror-checking to agreed times as part of CBT homework",
      "When the urge to check increases, delay the behaviour by 20 minutes",
      "Share BDD thought records with your therapist each week"
    ],
    "escalation": "Escalate if suicide risk rises, delusional intensity increases, or patient becomes unable to leave home due to appearance concerns.",
    "homeNote": null,
    "techSetup": "Right DLPFC (F4) and/or SMA (Cz); coordinate provocation with therapist; use Y-BOCS-BDD at every session.",
    "faq": [
      {
        "q": "Will TMS change how I look?",
        "a": "No; TMS targets how the brain processes appearance-related thoughts, not physical appearance."
      },
      {
        "q": "Is BDD just vanity?",
        "a": "No; BDD is a well-defined neurobiological condition involving distorted perceptual processing."
      },
      {
        "q": "Why do I need therapy as well as TMS?",
        "a": "TMS reduces neurobiological drive; CBT-BDD provides skills to change long-standing thought and behaviour patterns."
      }
    ]
  },

  "hoarding": {
    "epidemiology": "Hoarding disorder affects 2-5% of adults; persistent difficulty discarding possessions causing significant functional impairment.",
    "neuroBasis": "Hoarding involves L-DLPFC hypoactivation during decision-making tasks and ACC dysfunction in conflict monitoring; L-DLPFC TMS enhances executive decision-making capacity.",
    "responseData": "Evidence level C; L-DLPFC HF-TMS combined with CBT-Hoarding (exposure and sorting tasks) is the most studied approach.",
    "patientExplain": "Hoarding disorder involves difficulty with decision-making and letting go; brain stimulation strengthens the brain's decision-making and impulse control systems.",
    "timeline": "Progress measured by functional improvement (room accessibility, safety) over 20-30 sessions combined with active sorting assignments.",
    "selfCare": [
      "Complete weekly sorting homework as assigned - small daily amounts are better than infrequent large efforts",
      "Photograph objects before discarding to reduce distress associated with loss",
      "Identify a trusted support person who can assist with sorting without triggering shame"
    ],
    "escalation": "Escalate if living conditions present a safety or fire risk, or if depression deteriorates.",
    "homeNote": null,
    "techSetup": "L-DLPFC (F3) HF-TMS; coordinate with therapist for weekly sorting sessions ideally on same days as TMS.",
    "faq": [
      {
        "q": "Do I have to throw everything away?",
        "a": "No; therapy works through graded sorting goals - you remain in control of all decisions."
      },
      {
        "q": "Is hoarding disorder related to OCD?",
        "a": "Hoarding shares some features with OCD but is a distinct condition with different brain circuits."
      },
      {
        "q": "Why is it so hard to throw things away?",
        "a": "Hoarding involves genuine differences in the brain's decision-making and emotional attachment circuits."
      }
    ]
  },

  "trich": {
    "epidemiology": "Trichotillomania affects 1-2% of adults; more common in females; classified in the OCD spectrum.",
    "neuroBasis": "Trichotillomania involves SMA/motor cortex hyperactivity generating habitual motor sequences; TMS to SMA disrupts automatic hair-pulling motor patterns.",
    "responseData": "Evidence level C; SMA TMS (1 Hz LF) combined with habit reversal training (HRT) shows promising small-trial data.",
    "patientExplain": "Hair-pulling becomes an automatic habit driven by motor brain circuits; brain stimulation interrupts these automatic movement patterns to give you more control.",
    "timeline": "Motor habit reduction typically requires 20-30 sessions combined with HRT; pulling frequency diary essential throughout.",
    "selfCare": [
      "Habit reversal training: identify triggers and practise a competing response (e.g. clenching fist) when urge arises",
      "Wear barrier gloves or a hair covering during high-risk periods",
      "Note pulling locations, times, and emotional states to identify your personal pattern"
    ],
    "escalation": "Escalate if self-injury extends beyond hair-pulling or if depression and shame lead to social withdrawal.",
    "homeNote": null,
    "techSetup": "SMA target (Cz, FCz); LF 1 Hz inhibitory; document pulling frequency from weekly diary at each visit.",
    "faq": [
      {
        "q": "Will TMS stop me pulling entirely?",
        "a": "TMS reduces automatic urge and frequency; habit reversal training alongside gives the best results for lasting change."
      },
      {
        "q": "Is this a habit or an illness?",
        "a": "Both; an automatic habit entrenched via a neurobiological process - TMS addresses the brain circuit component."
      },
      {
        "q": "Can children have this treatment?",
        "a": "TMS is generally used in adults (18+); discuss paediatric options with a specialist."
      }
    ]
  },

  "ptsd": {
    "epidemiology": "PTSD affects 3.9% of adults globally; lifetime prevalence up to 10-20% in high-risk populations (veterans, emergency workers, assault survivors).",
    "neuroBasis": "PTSD involves amygdala hyperreactivity, vmPFC/hippocampal hypoactivation, and DLPFC inhibitory failure; bilateral DLPFC TMS restores top-down fear regulation and extinction consolidation.",
    "responseData": "TMS for PTSD: 40-60% PCL-5 response with 20 sessions (Philip 2019); evidence strongest for L-DLPFC HF; combine with PE or CPT therapy for best outcomes.",
    "patientExplain": "PTSD keeps the brain's emergency alarm in constant activation; brain stimulation helps restore the ability to process and move past traumatic memories safely.",
    "timeline": "PCL-5 improvement often begins week 3-4; trauma-focused therapy concurrent with TMS produces significantly better and more durable outcomes.",
    "selfCare": [
      "Use your safety/grounding plan if trauma memories are activated between sessions",
      "Limit alcohol and cannabis, which impair trauma memory reconsolidation",
      "Maintain regular sleep - it is when trauma memory processing consolidates"
    ],
    "escalation": "Escalate immediately if acute suicidality, self-harm, or dissociative crisis emerges; pause TMS and conduct safety assessment before resuming.",
    "homeNote": null,
    "techSetup": "Trauma-informed environment mandatory: patient controls room entry/exit, no sudden sounds, clinician trained in grounding; bilateral DLPFC; document PCL-5 every session.",
    "faq": [
      {
        "q": "Will TMS make me relive my trauma?",
        "a": "TMS does not directly trigger trauma memories; sessions focus on brain stimulation, not trauma processing."
      },
      {
        "q": "Do I need to talk about what happened?",
        "a": "TMS sessions do not involve trauma processing; your therapist handles trauma-focused work between sessions if appropriate."
      },
      {
        "q": "Can I have TMS if I am still having nightmares?",
        "a": "Yes; TMS can be helpful even while active PTSD symptoms are present."
      }
    ]
  },

  "cptsd": {
    "epidemiology": "cPTSD (ICD-11 6B41) involves PTSD core symptoms plus disturbances in self-organisation; associated with childhood and prolonged interpersonal trauma.",
    "neuroBasis": "cPTSD involves more pervasive neural circuit disruption than PTSD, including interoceptive hyperarousal (insula); stabilisation must precede intensive trauma-focused approaches.",
    "responseData": "Limited cPTSD-specific TMS RCT data; extrapolated from PTSD evidence; higher dropout risk requires flexible scheduling and strong therapeutic alliance.",
    "patientExplain": "Complex trauma creates deeply ingrained patterns of hyperarousal and self-doubt; brain stimulation supports the brain's ability to feel safer and more regulated, making therapy more accessible.",
    "timeline": "TMS in cPTSD is delivered in a stabilisation-focused phase; extended course of 30-40 sessions often required.",
    "selfCare": [
      "Ground yourself using your personalised toolkit before and after each session",
      "Communicate distress signals to your clinician immediately",
      "Maintain self-compassion practices - cPTSD heals through consistent small steps"
    ],
    "escalation": "Escalate if dissociation occurs during sessions, self-harm emerges, or patient cannot maintain safety between sessions.",
    "homeNote": null,
    "techSetup": "Extended consent and psychoeducation phase; patient veto over all session environment aspects; bilateral DLPFC; always debrief after sessions.",
    "faq": [
      {
        "q": "How is complex PTSD different from regular PTSD?",
        "a": "cPTSD involves additional difficulties with emotional regulation, relationships, and self-worth beyond core trauma symptoms."
      },
      {
        "q": "Will TMS be too intense?",
        "a": "Your protocol is carefully titrated; you can stop immediately at any point and your clinician will adjust the approach."
      },
      {
        "q": "I have been through many treatments - why would this be different?",
        "a": "TMS works on a different level to talking therapies and medications, directly influencing the neural circuits maintaining survival-state activation."
      }
    ]
  },

  "asd-trauma": {
    "epidemiology": "Acute Stress Disorder occurs within 3-30 days of a traumatic event; 50-80% of ASD cases progress to PTSD without treatment.",
    "neuroBasis": "ASD involves acute amygdala hyperactivation and PFC inhibitory failure; early intervention may prevent chronic PTSD network consolidation.",
    "responseData": "Evidence level C; TMS not first-line for ASD (CBT is); brief TMS course considered if transition toward chronic PTSD is detected.",
    "patientExplain": "After a traumatic event, the brain's alarm system can get stuck on high; brief brain stimulation may help calm this response early before it becomes a longer-term problem.",
    "timeline": "Brief course of 10 sessions if indicated; assessment at session 5 determines if acute symptoms are resolving or progressing toward PTSD.",
    "selfCare": [
      "Maintain daily routine as much as possible - structure is protective against trauma chronification",
      "Accept support from trusted people without pressure to recount the event until ready",
      "Avoid alcohol and sedating medications as primary coping in the acute phase"
    ],
    "escalation": "Escalate if PTSD diagnostic criteria are met (>30 days), suicidality emerges, or severe functional impairment.",
    "homeNote": null,
    "techSetup": "Standard bilateral DLPFC; trauma-informed environment; consider delaying TMS if patient is in acute crisis and cannot consent meaningfully.",
    "faq": [
      {
        "q": "I just went through something traumatic - do I need brain stimulation?",
        "a": "Not necessarily; psychological first aid and CBT are first-line; TMS is considered if acute symptoms are severe or not responding."
      },
      {
        "q": "How soon after a trauma can TMS start?",
        "a": "Not within the first 48-72 hours; a clinical assessment determines readiness."
      },
      {
        "q": "Does TMS help with acute shock reactions?",
        "a": "TMS is more appropriate for sub-acute or chronic post-trauma symptoms than the immediate shock response."
      }
    ]
  },

  "schizo": {
    "epidemiology": "Schizophrenia affects 0.3-0.7% of the population; first episode typically in late adolescence to mid-20s.",
    "neuroBasis": "Auditory verbal hallucinations (AVH) are associated with left superior temporal gyrus hyperactivity; LF-TMS to bilateral TPJ disrupts aberrant auditory-verbal activation; L-DLPFC HF targets negative symptoms.",
    "responseData": "LF-TMS for AVH: ~40-50% reduction in hallucination severity in responders (Hoffman 2005, 2013); negative symptoms show ~20-30% improvement with L-DLPFC HF-TMS.",
    "patientExplain": "Brain stimulation for schizophrenia is used to reduce voices or negative feelings; it calms the overactive auditory brain area or activates the under-active motivational brain area.",
    "timeline": "AVH reduction typically begins within 10 sessions; antipsychotic medication must remain stable throughout the course.",
    "selfCare": [
      "Continue all prescribed antipsychotic medications without changes during TMS",
      "Report any increase in hearing voices, paranoia, or confusion immediately",
      "Maintain a regular daily routine - structure supports stable mental state during treatment"
    ],
    "escalation": "Escalate if positive symptoms worsen, agitation increases, or patient lacks capacity to consent to ongoing sessions.",
    "homeNote": null,
    "techSetup": "Confirm antipsychotic medication stable (no changes in past 4 weeks) before starting; LF 1 Hz bilateral TPJ for AVH; HF 10 Hz L-DLPFC for negative symptoms; do not combine both targets in same session without explicit protocol.",
    "faq": [
      {
        "q": "Will TMS affect my antipsychotic medication?",
        "a": "TMS does not interact with medications; your medication regimen should remain unchanged."
      },
      {
        "q": "Can TMS cure schizophrenia?",
        "a": "TMS is not a cure but can meaningfully reduce specific symptoms such as voices or negative symptoms when medication alone is insufficient."
      },
      {
        "q": "Is it safe to have TMS with schizophrenia?",
        "a": "Yes; with stable antipsychotic medication and confirmed absence of seizure history, TMS is safe."
      }
    ]
  },

  "schizo-aff": {
    "epidemiology": "Schizoaffective disorder affects ~0.3% of adults; combines features of schizophrenia and mood disorder (depressive or bipolar type).",
    "neuroBasis": "Schizoaffective disorder involves both DLPFC mood-regulation deficits and temporal cortex hyperactivation; TMS protocol selection depends on predominant symptom cluster at time of treatment.",
    "responseData": "Evidence level B; limited schizoaffective-specific TMS RCT data; outcomes extrapolated from schizophrenia and MDD evidence.",
    "patientExplain": "Schizoaffective disorder involves both mood and psychosis symptoms; brain stimulation can target whichever symptom cluster is most affecting you at this time.",
    "timeline": "Protocol adjusted at mid-course review based on treatment response; 20-30 sessions initial course; both mood and psychosis monitoring throughout.",
    "selfCare": [
      "Keep a symptom diary tracking both mood scores and voice/belief intensity daily",
      "Do not adjust antipsychotic or mood stabiliser medications without psychiatric review",
      "Sleep consistency is crucial - disrupted sleep triggers both mood and psychosis components"
    ],
    "escalation": "Escalate if psychosis symptoms worsen, mood destabilises, or patient loses capacity for meaningful consent.",
    "homeNote": null,
    "techSetup": "Confirm which symptom cluster to target with prescribing psychiatrist before first session; document baseline PANSS and MADRS separately; monitor both throughout.",
    "faq": [
      {
        "q": "Which symptoms is TMS targeting for me?",
        "a": "Your clinician selects the protocol based on your predominant symptoms - this is discussed at the planning appointment."
      },
      {
        "q": "Can TMS help my mood and the voices at the same time?",
        "a": "Different protocols target different symptoms; sometimes a staged approach addresses one cluster before the other."
      },
      {
        "q": "What happens if my mood changes during treatment?",
        "a": "Both mood and psychosis scores are monitored at every session; protocols can be adjusted rapidly if either shifts."
      }
    ]
  },

  "fep": {
    "epidemiology": "First episode psychosis typically occurs ages 15-30; early intensive treatment in the critical period dramatically improves long-term outcomes.",
    "neuroBasis": "FEP involves progressive grey matter reduction and DLPFC connectivity disruption in the critical post-onset period; low-intensity tDCS may provide neuroprotective modulation.",
    "responseData": "Evidence level C; tDCS in FEP showing preliminary positive results for negative symptoms and cognition; antipsychotic stabilisation must precede neuromodulation.",
    "patientExplain": "After a first psychosis episode, gentle brain stimulation may support recovery by improving communication between brain regions affected by the episode.",
    "timeline": "Neuromodulation begins only after acute episode stabilises with antipsychotic medication (typically 4-8 weeks post-crisis); 20 sessions tDCS initial course.",
    "selfCare": [
      "Take antipsychotic medication consistently - stopping is the leading cause of relapse",
      "Avoid cannabis and substances which strongly increase psychosis risk",
      "Engage with the early intervention team's full programme including family sessions if offered"
    ],
    "escalation": "Escalate if positive symptoms return or worsen, cannabis use is detected, or family expresses concerns about behavioural change.",
    "homeNote": null,
    "techSetup": "Low-intensity tDCS (1-2 mA) bilateral F3/F4; confirm PANSS stability before each session; do not proceed if patient appears acutely unwell on arrival.",
    "faq": [
      {
        "q": "Is my brain permanently changed after a psychotic episode?",
        "a": "Not permanently; early treatment protects brain structure and early intervention programmes produce excellent recovery rates."
      },
      {
        "q": "Do I have to take medication forever?",
        "a": "Your psychiatrist will guide duration of antipsychotic treatment; many people with a single episode achieve full recovery with time-limited medication."
      },
      {
        "q": "Why is brain stimulation being used so early?",
        "a": "Early stimulation may help the brain recover normal connectivity faster during the window when the brain is most responsive to intervention."
      }
    ]
  },

  "adhd-i": {
    "epidemiology": "ADHD inattentive type affects 3-5% of adults; characterised by sustained attention deficits, distractibility, and organisational impairment without hyperactivity.",
    "neuroBasis": "Inattentive ADHD involves deficient top-down prefrontal control over posterior attentional networks; bilateral tDCS to DLPFC enhances prefrontal catecholaminergic signalling and attentional regulation.",
    "responseData": "tDCS evidence level B for ADHD; ~30-40% CGI-I response; neurofeedback (theta/beta at Cz) shows similar effect sizes; combined tDCS + NFB may be additive.",
    "patientExplain": "ADHD inattentive type involves a prefrontal brain network that struggles to sustain attention; tDCS gently boosts this network's activity to improve focus and organisation.",
    "timeline": "Cognitive improvements typically emerge from sessions 10-15; 20-30 sessions standard; combine with ADHD coaching for sustained benefit.",
    "selfCare": [
      "Use the Pomodoro technique (25 min focus, 5 min break) during cognitive work",
      "Minimise phone notifications and open-plan distractions during work hours",
      "Brief aerobic exercise immediately before cognitively demanding tasks potentiates tDCS effects"
    ],
    "escalation": "Escalate if depression emerges (common comorbidity in adult ADHD) or functional deterioration occurs despite treatment.",
    "homeNote": null,
    "techSetup": "tDCS bilateral F3 anode/F4 cathode; 2 mA, 20-30 min; combine with working memory cognitive training task during stimulation for enhanced benefit.",
    "faq": [
      {
        "q": "Can TMS replace my ADHD medication?",
        "a": "tDCS is not a replacement for stimulant medication; it is used alongside or when medication is not tolerated."
      },
      {
        "q": "Will my attention improve immediately after sessions?",
        "a": "Some acute session-related focus improvements occur; sustained benefits accumulate over the course."
      },
      {
        "q": "Should I do cognitive training alongside treatment?",
        "a": "Yes; performing attention tasks during tDCS sessions enhances the neuromodulation effect."
      }
    ]
  },

  "adhd-hi": {
    "epidemiology": "ADHD hyperactive-impulsive type is less common than combined type in adults; primarily presents as impulsivity, restlessness, and difficulty inhibiting responses.",
    "neuroBasis": "Hyperactive-impulsive ADHD involves inferior frontal gyrus and SMA inhibitory circuit dysfunction; bilateral prefrontal tDCS targets both impulsive responding and motor inhibition circuits.",
    "responseData": "Evidence level B; tDCS and neurofeedback for impulsivity show 30-40% CGI-I response; inhibitory control tasks during stimulation enhance specificity.",
    "patientExplain": "Hyperactive ADHD involves a brain that has difficulty braking impulsive thoughts and actions; brain stimulation strengthens the neural braking system.",
    "timeline": "Impulsivity reduction may be noticed by others (family, teachers) before the patient notices self-improvement; 20-30 sessions standard.",
    "selfCare": [
      "Pause for 10 seconds before responding in high-stakes situations",
      "Use structured task lists to reduce impulsive task-switching",
      "Aerobic exercise twice daily significantly reduces hyperactive symptoms neurobiologically"
    ],
    "escalation": "Escalate if impulsivity leads to risk-taking behaviour or mood instability emerges.",
    "homeNote": null,
    "techSetup": "tDCS bilateral prefrontal; 2 mA; consider Go/No-Go inhibitory control task during stimulation; document impulsivity rating at each session.",
    "faq": [
      {
        "q": "Can brain stimulation calm me down?",
        "a": "tDCS strengthens inhibitory control circuits rather than sedating you; think of it as improving the brain's own braking system."
      },
      {
        "q": "Should my family know about this treatment?",
        "a": "Informing family is helpful - they often notice behaviour changes before you do and can provide valuable feedback."
      },
      {
        "q": "Will this help at work?",
        "a": "Many patients report improved impulse control and decision-making at work; the combination with coaching produces the most occupational impact."
      }
    ]
  },

  "adhd-c": {
    "epidemiology": "ADHD combined type is the most common adult ADHD presentation (~60-70% of adult ADHD cases); involves both inattention and hyperactivity-impulsivity.",
    "neuroBasis": "Combined ADHD involves both DLPFC (attention) and inferior frontal/SMA (inhibition) circuit deficits; combined tDCS + theta-beta neurofeedback addresses both circuits.",
    "responseData": "Combined tDCS + NFB shows ~35-45% CGI-I response; theta-beta NFB alone has evidence level B with meta-analytic effect sizes comparable to non-stimulant medication.",
    "patientExplain": "Combined ADHD affects both focus and impulse control; two complementary brain stimulation approaches can target both circuits together.",
    "timeline": "Theta-beta neurofeedback requires 40 sessions (3x/week over 13 weeks) for sustained effects; tDCS used as a concurrent booster 2-3x/week.",
    "selfCare": [
      "Maintain a consistent daily structure - ADHD brains benefit enormously from predictable routines",
      "Implement body doubling (working alongside another person) for tasks requiring sustained attention",
      "Track ADHD symptoms with a validated app; share weekly summaries with your clinician"
    ],
    "escalation": "Escalate if comorbid depression or anxiety worsens, substance use emerges, or occupational functioning deteriorates.",
    "homeNote": "Muse 2 home neurofeedback (4-channel EEG) provides affordable theta-beta training at home as an adjunct - available with app guidance.",
    "techSetup": "tDCS bilateral DLPFC concurrent with cognitive task; NFB at Cz theta suppression / beta enhancement; document session EEG metrics at each NFB visit.",
    "faq": [
      {
        "q": "Why do I need both tDCS and neurofeedback?",
        "a": "tDCS boosts the DLPFC directly while neurofeedback trains you to self-regulate your own brain activity - the two approaches reinforce each other."
      },
      {
        "q": "Can I do neurofeedback at home?",
        "a": "A supervised home neurofeedback programme (Muse 2 + app) can complement clinic sessions; your clinician will advise when ready."
      },
      {
        "q": "Is 40 sessions of neurofeedback really necessary?",
        "a": "Research shows 40 sessions produces the most durable results; shorter courses show effects but they tend to fade faster."
      }
    ]
  },

  "asd": {
    "epidemiology": "ASD affects 1-2% of the population (CDC 2023: 1 in 36 children in the US); characterised by social communication differences and restricted/repetitive behaviours.",
    "neuroBasis": "ASD involves atypical long-range cortical connectivity; tDCS to bilateral prefrontal and parietal regions targets social cognition and executive function circuits.",
    "responseData": "Evidence level C; tDCS in ASD showing preliminary benefit for social responsiveness and repetitive behaviours (Schneider 2022 review); seizure risk elevated requiring careful screening.",
    "patientExplain": "Brain stimulation in autism targets specific circuits involved in social communication and repetitive thoughts - it is not about changing who you are but reducing distressing symptoms if requested.",
    "timeline": "tDCS course of 20 sessions with gradual intensity titration; autistic patients may require longer acclimatisation before reaching full protocol intensity.",
    "selfCare": [
      "Communicate sensory sensitivities to your care team before the first session so the environment can be tailored",
      "Bring preferred sensory items (headphones, fidget, blanket) to sessions",
      "Rate session comfort 1-5 after each visit to help your team optimise the experience"
    ],
    "escalation": "Escalate if seizure activity is suspected, sensory overwhelm occurs, or patient withdraws consent non-verbally.",
    "homeNote": null,
    "techSetup": "Sensory-adapted environment mandatory (dimmed lighting, low noise, clear instructions); start at 0.5-1 mA with gradual titration; AAC-capable communication support if needed; seizure pre-screen at every visit.",
    "faq": [
      {
        "q": "Will brain stimulation change who I am?",
        "a": "No; the goal is to reduce specific distressing symptoms you have identified - your identity and character are not targets."
      },
      {
        "q": "Can I stop if it feels uncomfortable?",
        "a": "Absolutely; sessions can be paused or stopped at any time without consequence."
      },
      {
        "q": "Who decides what symptoms to target?",
        "a": "You do, in collaboration with your clinician - we only target symptoms you identify as distressing and wish to address."
      }
    ]
  },

  "anorexia": {
    "epidemiology": "Anorexia nervosa has the highest mortality rate of any psychiatric condition (~5-10% long-term); lifetime prevalence 0.9-2%; predominantly affects females aged 15-25.",
    "neuroBasis": "Anorexia involves right DLPFC hyperactivation in response to food cues (overcognitive control) and aberrant reward circuit responses; right DLPFC TMS modulates food cue reactivity.",
    "responseData": "Evidence level C; BMI threshold >=15 required before TMS initiation; small trials show TMS reduces food-related anxiety and restrictive cognitions as adjunct to refeeding.",
    "patientExplain": "Anorexia affects a part of the brain that has become overcontrolling about food and body image; brain stimulation gently reduces this overactive control, supporting recovery from the brain level.",
    "timeline": "TMS is an adjunct to medical and nutritional stabilisation; initiated only once a medically safe weight is achieved; 20 sessions alongside specialist eating disorder team.",
    "selfCare": [
      "Nutritional rehabilitation and weight restoration remain the medical priority; TMS supports but does not replace this",
      "Attend all dietetic appointments alongside TMS sessions",
      "Communicate food-related anxiety levels at every session"
    ],
    "escalation": "Escalate if BMI falls below threshold, cardiac complications emerge, or patient expresses inability to maintain safety.",
    "homeNote": null,
    "techSetup": "Medical clearance required before each course (minimum BMI, cardiac screen, electrolytes); right DLPFC (F4); coordinate with specialist eating disorder team throughout.",
    "faq": [
      {
        "q": "Can TMS make me gain weight?",
        "a": "TMS does not directly cause weight changes; it targets cognitive control circuits involved in food restriction."
      },
      {
        "q": "Is brain stimulation safe when I am underweight?",
        "a": "TMS is only initiated above a minimum safe BMI threshold; medical clearance is required."
      },
      {
        "q": "Why do I need a team of specialists?",
        "a": "Anorexia affects the whole body and mind; TMS addresses the brain circuit component while the team addresses medical, nutritional, and psychological aspects."
      }
    ]
  },

  "bulimia": {
    "epidemiology": "Bulimia nervosa affects 1-2% of young women; characterised by binge-purge cycles; associated with shame, secrecy, and electrolyte abnormalities.",
    "neuroBasis": "Bulimia involves impaired inhibitory control over binge urges (R-DLPFC hypoactivation) and hyperreactive reward response to binge cues; R-DLPFC HF-TMS strengthens food-urge inhibition.",
    "responseData": "Evidence level C; R-DLPFC HF-TMS reduces binge frequency in small RCTs (Van den Eynde 2013); combine with CBT-Enhanced (CBT-E) for best outcomes.",
    "patientExplain": "Bulimia involves the brain's control centre struggling to override powerful binge urges; brain stimulation strengthens that control centre.",
    "timeline": "Binge frequency reduction typically begins within 2-3 weeks; binge/purge diary essential throughout the 20-session course.",
    "selfCare": [
      "Complete daily binge/purge diary - honesty is more important than the numbers",
      "Identify high-risk binge triggers (times, emotions, foods) and develop a circuit-breaker plan",
      "Do not isolate between sessions - social support reduces binge-purge urges significantly"
    ],
    "escalation": "Escalate if purging frequency increases, electrolyte results indicate dangerous levels, or suicidal ideation linked to shame emerges.",
    "homeNote": null,
    "techSetup": "Right DLPFC (F4) HF 10 Hz; monitor PHQ-9 and binge diary at each session; electrolyte check monthly for purging patients.",
    "faq": [
      {
        "q": "Will TMS stop the urges to binge?",
        "a": "TMS strengthens the inhibitory system making urges easier to manage; most effective combined with CBT-E skills practice."
      },
      {
        "q": "I feel ashamed - does the team know?",
        "a": "Your team is trained in eating disorder care and treats all patients with complete confidentiality and non-judgement."
      },
      {
        "q": "Are there physical checks during treatment?",
        "a": "Monthly electrolyte blood tests are recommended for patients who are still purging during the TMS course."
      }
    ]
  },

  "bed": {
    "epidemiology": "Binge eating disorder is the most common eating disorder (~3.5% lifetime prevalence in women, 2% in men); associated with obesity, diabetes, and mood disorders.",
    "neuroBasis": "BED involves deficient right DLPFC impulse control and elevated dopaminergic responsivity to high-calorie food cues; R-DLPFC TMS reduces food-cue reactivity and binge impulse.",
    "responseData": "Evidence level C; R-DLPFC TMS reduces binge frequency ~30-50% in small trials; DBT skills concurrent training significantly enhances outcome.",
    "patientExplain": "Binge eating disorder involves a powerful pull toward overeating that feels out of control; brain stimulation reduces this pull by strengthening the ability to pause and choose.",
    "timeline": "Binge frequency typically reduces weeks 2-3; DBT emotion regulation skills concurrent with TMS greatly extend treatment gains; 20 sessions standard.",
    "selfCare": [
      "Use the STOP acronym (Stop, Take a breath, Observe, Proceed) when the binge urge arises",
      "Avoid skipping meals - regular eating patterns reduce binge triggers neurobiologically",
      "Build a list of alternative coping activities for emotional binge triggers and keep it visible"
    ],
    "escalation": "Escalate if binge frequency worsens, weight complications require medical management, or mood disorder deteriorates.",
    "homeNote": null,
    "techSetup": "Right DLPFC (F4) HF 10 Hz; binge diary review at each session; track CGI-I and PHQ-9 alongside binge frequency; coordinate with dietitian.",
    "faq": [
      {
        "q": "Is BED just a lack of willpower?",
        "a": "No; BED involves measurable differences in brain circuit function related to impulse control and reward processing."
      },
      {
        "q": "Will TMS help with my weight?",
        "a": "TMS targets the eating behaviour circuit; binge reduction often leads to improved weight management as a secondary benefit."
      },
      {
        "q": "What is DBT and why do I need it?",
        "a": "DBT provides emotion regulation skills that complement what TMS does neurobiologically - the two together work better than either alone."
      }
    ]
  },

  "aud": {
    "epidemiology": "Alcohol use disorder affects ~240 million people globally (WHO 2022); a leading cause of preventable death and disability worldwide.",
    "neuroBasis": "AUD involves L-DLPFC hypoactivation (reduced top-down craving control) and R-DLPFC hyperactivation (approach bias); bilateral DLPFC TMS targets both circuits.",
    "responseData": "DLPFC TMS for AUD: meta-analysis shows ~35-50% craving reduction (Tik 2017); best outcomes combined with motivational interviewing or CBT relapse prevention.",
    "patientExplain": "Alcohol use disorder involves brain circuit changes that generate powerful cravings and reduce the ability to resist them; brain stimulation rebalances these circuits to support recovery.",
    "timeline": "Craving reduction often measurable from sessions 8-12; 20 sessions standard; combine with motivational interviewing and relapse prevention therapy.",
    "selfCare": [
      "Record craving intensity (0-10) daily and before each session - craving data guides protocol adjustments",
      "Identify three highest-risk relapse situations and develop specific plans for each",
      "Attend mutual support groups (AA, SMART Recovery) alongside TMS - social support doubles success rates"
    ],
    "escalation": "Escalate if active heavy drinking continues during TMS (seizure risk from alcohol withdrawal + TMS), or Wernicke encephalopathy risk is identified.",
    "homeNote": null,
    "techSetup": "Confirm patient is not acutely intoxicated before proceeding; document craving VAS before and after each session; bilateral DLPFC; seizure risk elevated in active heavy drinking.",
    "faq": [
      {
        "q": "Do I have to be completely sober before starting TMS?",
        "a": "We require you to attend sessions sober; heavy active drinking during TMS increases seizure risk and reduces effectiveness."
      },
      {
        "q": "Can TMS replace AA or SMART Recovery?",
        "a": "TMS addresses brain biology while group support addresses social and psychological aspects; combining them significantly improves recovery rates."
      },
      {
        "q": "Will my cravings disappear after treatment?",
        "a": "TMS reduces craving intensity and frequency; significant reduction in craving power is achievable for most patients."
      }
    ]
  },

  "nic-dep": {
    "epidemiology": "Nicotine dependence affects ~1 billion smokers globally; standard cessation therapies have 6-month success rates of 15-35%.",
    "neuroBasis": "Nicotine dependence involves DLPFC hypoactivation during craving and insula-mediated interoceptive craving signals; L-DLPFC + insula TMS targets both cognitive control and interoceptive craving networks.",
    "responseData": "TMS for smoking: ~30-40% point-prevalence abstinence at 6 months in best trials (Amiaz 2009); insula targeting adds ~10-15% abstinence benefit over DLPFC alone.",
    "patientExplain": "Nicotine changes the brain to generate powerful cravings; brain stimulation reduces these cravings by strengthening decision-making and quieting the craving signal itself.",
    "timeline": "Craving reduction and initial quit attempts emerge weeks 2-3; 15 sessions standard; CO breathalyser monitoring confirms abstinence progress.",
    "selfCare": [
      "Set a specific quit date within the first week of TMS and share it with your clinician",
      "Use CO breathalyser results at sessions as objective motivation feedback",
      "Identify smoking cues (coffee, stress, breaks) and prepare a specific replacement behaviour for each"
    ],
    "escalation": "Escalate if patient resumes heavy smoking after initial cessation or depression emerges post-cessation.",
    "homeNote": null,
    "techSetup": "L-DLPFC (F3) HF-TMS primary; insula targeting if coil available (FT7/T7 region); CO breathalyser at each visit; document cigarettes/day weekly.",
    "faq": [
      {
        "q": "Is TMS better than nicotine patches?",
        "a": "TMS targets brain circuits rather than nicotine receptors - a different mechanism effective for those who have not succeeded with patches."
      },
      {
        "q": "What if I slip and smoke during treatment?",
        "a": "Slips are common in recovery; your clinician will help you understand the trigger and adjust the plan - do not stop attending sessions."
      },
      {
        "q": "How long does the benefit last?",
        "a": "Best evidence shows continued abstinence at 6 months in ~30-40% of patients; relapse prevention strategies extend this significantly."
      }
    ]
  },

  "oud": {
    "epidemiology": "Opioid use disorder affects >16 million people globally; fentanyl contamination of illicit supply has dramatically increased overdose mortality.",
    "neuroBasis": "OUD involves profound disruption of prefrontal executive control over craving and opioid-induced reward circuit sensitisation; bilateral DLPFC TMS targets craving circuitry as a MAT augmentation.",
    "responseData": "Evidence level C; DLPFC TMS for OUD craving: promising small trials (Li 2020); best evidence is for TMS as MAT (buprenorphine/naltrexone) augmentation rather than standalone.",
    "patientExplain": "Opioid use disorder changes the brain's reward and control circuits profoundly; brain stimulation supports recovery by strengthening circuits that resist cravings while your medication manages physical dependency.",
    "timeline": "TMS course initiated after medical stabilisation on MAT (minimum 2 weeks); 20 sessions; concurrent psychosocial support essential.",
    "selfCare": [
      "Take MAT (buprenorphine/naltrexone) as prescribed without exception - missing doses markedly increases relapse risk",
      "Avoid contact with people, places, and things associated with opioid use during the TMS course",
      "Keep a naloxone kit and ensure a trusted person knows how to use it"
    ],
    "escalation": "Escalate if signs of withdrawal emerge during the course, patient discloses active illicit use, or overdose risk is identified.",
    "homeNote": null,
    "techSetup": "Confirm MAT stability (minimum 2 weeks) before first session; craving VAS at each session; document withdrawal symptom score; have emergency protocols in place.",
    "faq": [
      {
        "q": "Can TMS replace my buprenorphine?",
        "a": "No; TMS is an adjunct to MAT, not a replacement - both work on different parts of the opioid dependency problem."
      },
      {
        "q": "Is TMS safe with buprenorphine?",
        "a": "Yes; TMS does not interact with buprenorphine or naltrexone."
      },
      {
        "q": "Will this help with cravings?",
        "a": "TMS specifically targets craving circuits and has shown craving reduction in trials; results are most consistent when combined with MAT and counselling."
      }
    ]
  },

  "cud": {
    "epidemiology": "Cannabis use disorder affects 1-3% of adults globally; increasing with legalisation; presents with tolerance, withdrawal (irritability, sleep disruption), and loss of control.",
    "neuroBasis": "CUD involves DLPFC hypoactivation during cognitive control tasks and CB1 receptor downregulation in prefrontal circuits; L-DLPFC TMS targets cognitive control deficits associated with cannabis cue reactivity.",
    "responseData": "Evidence level C; limited TMS RCT data for CUD; craving diary and motivational interviewing recommended alongside.",
    "patientExplain": "Cannabis use disorder affects the brain's motivation and decision-making circuits; brain stimulation aims to restore the ability to make choices independently of cannabis cravings.",
    "timeline": "TMS starting at week 2 of abstinence is recommended (after acute withdrawal peaks at days 2-7); 15-20 sessions.",
    "selfCare": [
      "Plan for the first 2 weeks of abstinence - withdrawal symptoms are real and temporary",
      "Replace cannabis use time with specific planned activities (exercise, creative projects)",
      "Avoid social situations where cannabis is present during the TMS course"
    ],
    "escalation": "Escalate if anxiety disorder emerges, psychosis-spectrum symptoms appear, or cannabis use level prevents accurate craving circuit assessment.",
    "homeNote": null,
    "techSetup": "L-DLPFC (F3) HF-TMS; craving VAS at each session; document days since last use; psychosis screen before and during course (cannabis can precipitate psychosis).",
    "faq": [
      {
        "q": "Is cannabis use disorder a real diagnosis?",
        "a": "Yes; it is a clinically recognised condition with measurable brain changes, not simply a lack of willpower."
      },
      {
        "q": "How long does cannabis affect the brain after stopping?",
        "a": "Cannabinoid receptor normalisation takes approximately 4-6 weeks; TMS during this window can support brain recovery."
      },
      {
        "q": "Will TMS make withdrawal easier?",
        "a": "Some patients report TMS reduces the irritability and cognitive fog of withdrawal; your clinician will monitor and provide support."
      }
    ]
  },

  "insomnia": {
    "epidemiology": "Insomnia disorder affects 10-15% of adults chronically; ~30-35% experience occasional insomnia; leading complaint in primary care mental health.",
    "neuroBasis": "Insomnia involves cortical hyperarousal (elevated frontal beta power) and impaired slow-wave sleep generation; tDCS F3 anode promotes slow oscillation generation; CES reduces cortical arousal via alpha entrainment.",
    "responseData": "tDCS for insomnia: ISI reduction ~5-8 points in responders; CES meta-analysis shows significant sleep quality improvement (Kavirajan 2014); CBT-I concurrent is essential for durable outcomes.",
    "patientExplain": "Insomnia involves the brain getting stuck on when it should wind down; tDCS and CES gently shift the brain toward the calmer brainwave state associated with deep sleep.",
    "timeline": "Sleep improvements vary - some patients notice changes within 2 weeks; 20 sessions tDCS combined with sleep restriction therapy (CBT-I) produces strongest outcomes.",
    "selfCare": [
      "Maintain a fixed wake time every day (even weekends) - the single most effective behavioural insomnia intervention",
      "Restrict time in bed to actual sleep time initially (CBT-I sleep restriction) and expand only as sleep consolidates",
      "Eliminate all screen light for 90 minutes before target sleep time"
    ],
    "escalation": "Escalate if sleep deprivation causes dangerous impairment (driving, operating machinery) or depression emerges as a consequence of chronic insomnia.",
    "homeNote": "Alpha-Stim AID (ear clips, CES, 100 uA, 20 min evening) is FDA-cleared for insomnia and suitable as a daily home adjunct.",
    "techSetup": "tDCS F3 anode, Cz cathode; 2 mA, 20-30 min; schedule sessions late afternoon to align with sleep pressure window; document ISI at each session.",
    "faq": [
      {
        "q": "Should I take sleeping tablets during TMS?",
        "a": "Discuss with your prescriber; gradual dose reduction is often planned during a successful TMS/CBT-I course."
      },
      {
        "q": "Can I use the Alpha-Stim every night?",
        "a": "Yes; nightly use is appropriate and supported by evidence - ear clip application for 20 minutes before bed is the standard protocol."
      },
      {
        "q": "What is sleep restriction and will it make things worse first?",
        "a": "Sleep restriction temporarily increases sleep pressure to consolidate fragmented sleep - it can feel worse for 1 week before improving significantly."
      }
    ]
  },

  "hypersomn": {
    "epidemiology": "Hypersomnia disorders affect ~0.5-1% of the population; associated with significant occupational and social impairment.",
    "neuroBasis": "Idiopathic hypersomnia involves blunted arousal system activation and impaired prefrontal wakefulness-promoting network activity; excitatory tDCS to F3 targets prefrontal arousal regulation.",
    "responseData": "Evidence level C; small case-series only; sleep apnoea and narcolepsy must be excluded before tDCS; Epworth Sleepiness Scale monitoring throughout.",
    "patientExplain": "Hypersomnia involves the brain's wake-promoting system not activating adequately; tDCS gently stimulates the frontal region to support normal alertness levels.",
    "timeline": "Alertness improvements may be noticed from sessions 5-10; 20 sessions initial course; sleep medicine evaluation required before and during treatment.",
    "selfCare": [
      "Maintain a structured sleep schedule with consistent bed and wake times",
      "Strategic napping (20-min nap before 2pm) can reduce sleepiness without disrupting night sleep",
      "Avoid alcohol and sedating medications during treatment"
    ],
    "escalation": "Escalate if Epworth score worsens, occupational safety is at risk (patient drives heavy machinery while excessively sleepy), or new sleep disorder symptoms emerge.",
    "homeNote": null,
    "techSetup": "Excitatory tDCS anode F3; 2 mA; morning session timing preferred; document Epworth Sleepiness Scale at each session; confirm sleep apnoea exclusion.",
    "faq": [
      {
        "q": "Have I been tested for sleep apnoea?",
        "a": "A sleep study to exclude sleep apnoea is required before starting tDCS for hypersomnia."
      },
      {
        "q": "Will brain stimulation keep me awake at night?",
        "a": "Sessions are scheduled in the morning to support daytime alertness without disrupting night-time sleep."
      },
      {
        "q": "Is this the same as narcolepsy?",
        "a": "Narcolepsy and idiopathic hypersomnia are different conditions - your neurologist will confirm your diagnosis."
      }
    ]
  },

  "pain-neuro": {
    "epidemiology": "Neuropathic pain affects 7-10% of the general population; caused by lesion or disease of the somatosensory system; among the most difficult pain types to treat pharmacologically.",
    "neuroBasis": "Neuropathic pain involves central sensitisation and reduced cortical inhibitory tone; HF-TMS or tDCS to M1 (C3/C4 contralateral to pain) restores descending inhibitory modulation of pain signals.",
    "responseData": "M1 TMS for neuropathic pain: NRS reduction 30-50% in responders; effect size d~0.7 (Lefaucheur meta-analysis 2020); 10-20 sessions; monthly maintenance may be required.",
    "patientExplain": "Neuropathic pain involves overactive pain signals in the nervous system; brain stimulation activates the brain's own pain control system to turn down this overactivity.",
    "timeline": "Pain reduction typically begins sessions 5-10; NRS tracking before every session guides protocol adjustment.",
    "selfCare": [
      "Track pain NRS (0-10) morning and evening using a diary app - baseline variability data helps interpret treatment response",
      "Gentle graded physical activity (as tolerated by your physio) enhances neuromodulation pain benefits",
      "Pain neuroscience education alongside TMS significantly improves outcomes by reducing pain catastrophisation"
    ],
    "escalation": "Escalate if pain intensity consistently above baseline NRS across 3+ sessions, new neurological deficit appears, or medication side effects worsen.",
    "homeNote": "Alpha-Stim CES (100-500 uA) can provide adjunct home pain relief for neuropathic pain and is FDA-cleared for this indication.",
    "techSetup": "M1 contralateral to pain (C3 or C4); identify hotspot for relevant muscle contralateral to pain; HF 10 Hz or iTBS; document pain NRS before and 30 min after each session.",
    "faq": [
      {
        "q": "How does TMS reduce my nerve pain?",
        "a": "TMS activates the motor cortex which stimulates the brain's own descending pain-control pathways, reducing the intensity of pain signals reaching consciousness."
      },
      {
        "q": "Will I be able to reduce my pain medication?",
        "a": "If TMS produces good pain relief, your prescriber may consider gradual medication reduction - never do this without medical supervision."
      },
      {
        "q": "How long does the pain relief last?",
        "a": "Initial sessions last hours to days; with a full course, effect can extend weeks to months; some patients require monthly maintenance sessions."
      }
    ]
  },

  "pain-msk": {
    "epidemiology": "Musculoskeletal chronic pain affects ~20% of adults globally; leading cause of disability; includes chronic low back pain, osteoarthritis, and shoulder/neck conditions.",
    "neuroBasis": "Chronic MSK pain involves central sensitisation in M1 and insular cortex; TMS/tDCS to M1 modulates cortical pain representations and reduces central sensitisation via corticospinal descending inhibitory tracts.",
    "responseData": "Evidence level B; M1 TMS meta-analysis shows significant NRS reduction in chronic MSK pain; PBM adjunct shows additive anti-inflammatory effects at peripheral tissue level.",
    "patientExplain": "Chronic musculoskeletal pain becomes a brain problem as well as a body problem; brain stimulation addresses the brain's contribution to ongoing pain, making physiotherapy more effective.",
    "timeline": "NRS reduction typically measurable from sessions 5-8; physiotherapy concurrently essential for functional improvement.",
    "selfCare": [
      "Engage with your physiotherapy programme - TMS makes the brain more receptive to movement rehabilitation",
      "Pace activity using the 10% rule (increase activity 10% per week maximum)",
      "Cold/heat therapy at the pain site before sessions reduces peripheral input that confounds central pain assessment"
    ],
    "escalation": "Escalate if NRS consistently above 8 during and after sessions, new neurological deficit appears, or imaging reveals new structural change.",
    "homeNote": null,
    "techSetup": "M1 contralateral (C3/C4); PBM to pain site before TMS if available; document pain NRS before and after session; physiotherapy report review at 5-session intervals.",
    "faq": [
      {
        "q": "Will TMS fix my back/knee/shoulder?",
        "a": "TMS addresses the brain's pain-amplification component; combined with physiotherapy, many patients achieve significant functional improvement."
      },
      {
        "q": "Is TMS better than TENS for my pain?",
        "a": "TMS works centrally (on the brain) while TENS works peripherally (on nerves) - they target different mechanisms and can be complementary."
      },
      {
        "q": "Do I need to stop my pain medications?",
        "a": "No; continue all prescribed medications; your prescriber will advise on adjustments based on treatment response."
      }
    ]
  },

  "fibro": {
    "epidemiology": "Fibromyalgia affects 2-4% of the population (predominantly women); characterised by widespread pain, fatigue, sleep disturbance, and cognitive difficulties.",
    "neuroBasis": "Fibromyalgia involves diffuse central sensitisation, reduced descending pain inhibition (DNIC), and altered M1 cortical excitability; M1 TMS restores inhibitory tone.",
    "responseData": "M1 TMS for fibromyalgia: NRS and FIQ improvements in RCTs (Boyer 2014); bilateral protocol adds ~15% benefit; CES (Alpha-Stim) has independent RCT support for fibromyalgia pain.",
    "patientExplain": "Fibromyalgia involves the brain's pain thermostat set too high across the whole body; brain stimulation turns this thermostat back down, reducing whole-body pain sensitivity.",
    "timeline": "Pain and fatigue improvements typically begin weeks 2-3; FIQ tracked monthly; graded aerobic exercise is the most evidence-based self-care adjunct and enhances TMS outcomes.",
    "selfCare": [
      "Begin a graded aerobic exercise programme (starting 10 min gentle walking, increasing weekly) - the most evidence-based fibromyalgia self-management",
      "Use sleep hygiene strategies and maintain consistent sleep times to support deep sleep quality",
      "Record flare-ups, triggers, and sleep scores in a diary between sessions"
    ],
    "escalation": "Escalate if widespread pain significantly worsens from baseline, new neurological symptoms appear, or depression component deteriorates.",
    "homeNote": "Alpha-Stim AID (CES) is FDA-cleared for fibromyalgia pain and can be used at home daily alongside clinic TMS sessions.",
    "techSetup": "M1 bilateral (C3 and C4 sequential); HF 10 Hz; document FIQ and NRS at baseline and every 5 sessions; CES prescription for home use.",
    "faq": [
      {
        "q": "Is fibromyalgia a real condition?",
        "a": "Yes; it is a well-characterised neurobiological condition involving measurable central nervous system pain-processing differences."
      },
      {
        "q": "Why is exercise recommended when I am in pain?",
        "a": "Graded aerobic exercise specifically reduces central sensitisation in fibromyalgia - starting very gently produces significant pain reduction over 8-12 weeks."
      },
      {
        "q": "How many courses of TMS will I need?",
        "a": "Initial course 20-30 sessions; monthly maintenance sessions are recommended for sustained benefit in this chronic condition."
      }
    ]
  },

  "migraine": {
    "epidemiology": "Migraine affects 12-15% of adults globally; second leading cause of disability worldwide; up to 3% progress to chronic migraine (>=15 headache days/month).",
    "neuroBasis": "Migraine with aura involves spreading cortical depolarisation from V1; single-pulse TMS to occipital cortex (Oz) at aura onset disrupts this spreading depolarisation wave before the pain phase.",
    "responseData": "SpringTMS FDA-cleared for migraine with aura: 39% pain-free at 2 hours vs. 22% sham (Lipton 2010); preventive protocol reduces monthly migraine days ~2.75 more than sham.",
    "patientExplain": "Migraine with aura starts with a spreading electrical wave in the brain's vision area; a single TMS pulse at the first sign of aura can stop this wave before it triggers the headache.",
    "timeline": "For acute treatment, device must be applied at aura onset; preventive protocol produces monthly headache reduction over 3 months of daily use.",
    "selfCare": [
      "Keep a detailed headache diary (timing, aura type, triggers, medications) to identify your patterns",
      "Apply TMS within 20 minutes of aura onset for best acute effect",
      "Work with your neurologist on trigger identification (sleep, hydration, hormonal, dietary)"
    ],
    "escalation": "Escalate if migraine frequency increases to >=15 days/month, new neurological symptoms emerge with headache, or medication overuse headache is suspected.",
    "homeNote": "SpringTMS device is prescribed for home/self-use; train patient in device application at Oz, aura recognition, and preventive protocol timing.",
    "techSetup": "Patient training session: demonstrate Oz placement, single-pulse delivery, and aura recognition; provide written home-use protocol card; document headache diary baseline; coordinate with neurologist.",
    "faq": [
      {
        "q": "Do I carry the device with me all the time?",
        "a": "Yes; the SpringTMS is a portable handheld device designed to be with you so you can treat at aura onset wherever you are."
      },
      {
        "q": "What if I do not get aura?",
        "a": "Single-pulse TMS is FDA-cleared for migraine with aura; a preventive daily protocol can be used for migraine without aura - discuss with your neurologist."
      },
      {
        "q": "Can I use TMS and my sumatriptan?",
        "a": "Yes; TMS and triptans can be used in the same attack; some patients use TMS first and only take a triptan if headache develops despite TMS."
      }
    ]
  },

  "tinnitus": {
    "epidemiology": "Tinnitus affects ~15% of adults globally; 1-2% have severely bothersome tinnitus; commonly associated with hearing loss, noise exposure, and stress.",
    "neuroBasis": "Tinnitus involves auditory cortex (STG/T7-T8) hyperactivity with de-afferentation-induced maladaptive plasticity; LF-TMS (1 Hz) to bilateral auditory cortex suppresses this hyperactivity to reduce phantom sound perception.",
    "responseData": "LF-TMS bilateral auditory cortex: ~40-50% of patients experience clinically meaningful TFI or THI reduction; 10 sessions initial; monthly maintenance sustains benefit (Langguth 2014).",
    "patientExplain": "Tinnitus is caused by overactive brain auditory cells creating phantom sounds; brain stimulation calms this overactivity, reducing the volume and intrusiveness of the ringing.",
    "timeline": "TFI/THI improvement typically begins weeks 2-3; 10 sessions initial; monthly maintenance sessions sustain benefit for most responders; sound therapy concurrent enhances outcomes.",
    "selfCare": [
      "Use sound enrichment (soft background noise at bedtime) - silence worsens tinnitus by increasing auditory cortex gain",
      "Practice mindfulness-based tinnitus management to reduce distress response to tinnitus sounds",
      "Wear ear protection at concerts and noisy workplaces to prevent further cochlear damage"
    ],
    "escalation": "Escalate if pulsatile tinnitus develops (possible vascular cause requiring investigation), sudden onset or unilateral tinnitus arises, or associated vertigo and hearing loss suggest Meniere's disease.",
    "homeNote": null,
    "techSetup": "MANDATORY cochlear implant check before any session (absolute contraindication); hearing aid removal before session; bilateral T7/T8 LF 1 Hz; document TFI before first session and at sessions 5 and 10.",
    "faq": [
      {
        "q": "Will TMS cure my tinnitus?",
        "a": "TMS reduces tinnitus volume and distress in ~40-50% of patients; complete elimination is less common but significant reduction is achievable."
      },
      {
        "q": "I have hearing aids - is TMS still safe?",
        "a": "Remove hearing aids before each session; cochlear implants are a contraindication - confirm your implant status before treatment."
      },
      {
        "q": "What is sound therapy and why use it with TMS?",
        "a": "Sound therapy provides background acoustic enrichment preventing silence-induced auditory cortex gain that worsens tinnitus; it enhances and extends TMS benefits."
      }
    ]
  },
  "stroke-mtr": {
    "epidemiology": "Stroke is the second leading cause of death and third leading cause of disability globally; ~15 million strokes per year; motor deficits affect 80% of survivors.",
    "neuroBasis": "Post-stroke motor recovery involves inter-hemispheric competition; HF-TMS to ipsilesional M1 enhances excitability while LF-TMS to contralesional M1 reduces competitive inhibition.",
    "responseData": "Evidence level A; multiple RCTs show TMS + physiotherapy produces greater motor recovery than physiotherapy alone; effect size d~0.5-0.8 for upper limb function.",
    "patientExplain": "Stroke damages a part of the brain controlling movement; brain stimulation helps the brain reorganise and build new connections to restore movement, especially when combined with physiotherapy.",
    "timeline": "Motor improvements measurable from sessions 5-10; 10 sessions in acute/subacute phase or 20 sessions in chronic phase; physiotherapy must be concurrent for best outcomes.",
    "selfCare": [
      "Attend all physiotherapy sessions - TMS without active movement practice produces minimal lasting benefit",
      "Practice assigned home exercises twice daily between sessions",
      "Track movement quality with your therapist using functional goals (e.g. reach, grip, cup lifting)"
    ],
    "escalation": "Escalate if seizure occurs, new neurological deficit emerges, or agitation/confusion develops during sessions.",
    "homeNote": null,
    "techSetup": "Ipsilesional M1 target (C3 for left hemisphere stroke, C4 for right hemisphere stroke); hotspot for relevant muscle group; HF 10 Hz; 1200-2000 pulses/session; confirm no metal in skull before first session.",
    "faq": [
      {
        "q": "Will TMS work even years after my stroke?",
        "a": "Yes; TMS can improve motor function in both acute and chronic (years post-stroke) phases, though earlier treatment generally yields better outcomes."
      },
      {
        "q": "Does TMS replace physiotherapy?",
        "a": "No; TMS is most effective as a primer before physiotherapy - the stimulation makes the brain more receptive to movement relearning."
      },
      {
        "q": "Can TMS help speech after stroke?",
        "a": "There is a separate protocol for aphasia (speech difficulties after stroke) - discuss this with your clinician if speech is affected."
      }
    ]
  },

  "stroke-aph": {
    "epidemiology": "Aphasia affects ~30% of acute stroke survivors; persistent aphasia at 6 months affects ~250,000 new patients per year in the US.",
    "neuroBasis": "Post-stroke aphasia involves left perisylvian damage with compensatory right hemisphere activation; LF-TMS to right inferior frontal gyrus (F8) suppresses maladaptive right hemispheric dominance, promoting left hemisphere recovery.",
    "responseData": "Evidence level B; LF-TMS to right hemisphere with concurrent speech therapy: significant improvement in naming and fluency in RCTs (Naeser 2010, Barwood 2012).",
    "patientExplain": "After a stroke affects the speech area, the brain's right side can over-compensate in an unhelpful way; brain stimulation quiets this over-compensation, helping the damaged speech area recover.",
    "timeline": "Language improvements may begin within 2 weeks; 10-20 sessions concurrent with speech and language therapy (SLT); SLT must be concurrent for meaningful language gains.",
    "selfCare": [
      "Attend all speech and language therapy sessions - TMS without SLT concurrent produces minimal language improvement",
      "Practice speech exercises between sessions using your SLT home programme",
      "Use communication aids (letter boards, apps) to reduce frustration during recovery"
    ],
    "escalation": "Escalate if seizure occurs, new language regression emerges suddenly, or significant mood deterioration (aphasia-related depression is common).",
    "homeNote": null,
    "techSetup": "Right inferior frontal gyrus (F8 area); LF 1 Hz inhibitory; 900 pulses/session; SLT session should follow TMS within 30 minutes while cortical plasticity window is open; document language scoring at baseline and every 5 sessions.",
    "faq": [
      {
        "q": "Will my speech return to normal?",
        "a": "Recovery varies enormously; many patients achieve significant functional communication improvement even if full pre-stroke language does not return."
      },
      {
        "q": "Why stimulate the right side if my stroke was on the left?",
        "a": "After a left-sided stroke, the right hemisphere can over-activate and actually interfere with left-side recovery; calming it helps the damaged side recover better."
      },
      {
        "q": "How long should I continue speech therapy?",
        "a": "Speech therapy benefits continue for months to years post-stroke; TMS is one component of a longer-term rehabilitation programme."
      }
    ]
  },

  "tbi": {
    "epidemiology": "TBI affects ~69 million people per year globally; leading cause of death and disability in adults under 45; cognitive and mood sequelae persist in ~50% beyond 12 months.",
    "neuroBasis": "TBI causes diffuse axonal injury and disrupted frontoparietal network connectivity; low-intensity TMS and tDCS applied to prefrontal regions support neuroplasticity and network reconnection during recovery.",
    "responseData": "Evidence level B; TMS and tDCS for TBI: improvements in attention, working memory, and depression in trials; metal fragment contraindication mandatory screen before initiation.",
    "patientExplain": "A brain injury disrupts connections between brain regions; gentle brain stimulation supports the brain's natural healing and reconnection process, improving cognitive symptoms and mood.",
    "timeline": "TMS introduced at sub-acute to chronic phase (>3 months post-TBI); 20 sessions initial course; cognitive improvements often gradual and cumulative.",
    "selfCare": [
      "Follow cognitive load guidelines from your neuropsychologist - avoiding cognitive overload during recovery is essential",
      "Sleep consistently - sleep is the primary window for TBI brain repair",
      "Use compensatory cognitive strategies (notebooks, calendar apps, alarms) recommended by your neuropsychologist"
    ],
    "escalation": "Escalate immediately if headaches worsen significantly during a course, seizure activity emerges, or new cognitive or behavioural regression occurs.",
    "homeNote": null,
    "techSetup": "Metal fragment screen MANDATORY (skull X-ray if any doubt); low-intensity TMS preferred (80-90% MT); bilateral F3/F4 or frontoparietal approach; cognitive test (MoCA) at baseline and mid-course.",
    "faq": [
      {
        "q": "Is TMS safe after a brain injury?",
        "a": "Yes, with appropriate safety screening including metal fragment exclusion; low-intensity protocols are used for added safety in TBI."
      },
      {
        "q": "Will TMS fix my brain injury?",
        "a": "TMS supports neuroplasticity and recovery; the brain has significant capacity for compensation and repair which TMS helps facilitate."
      },
      {
        "q": "How long does TBI recovery take?",
        "a": "Recovery continues for years post-TBI; the most rapid improvements occur in the first 2 years but meaningful gains are possible much later."
      }
    ]
  },

  "alzheimer": {
    "epidemiology": "Alzheimer's disease affects ~55 million people globally; leading cause of dementia; estimated to triple by 2050 with aging populations.",
    "neuroBasis": "Alzheimer's involves progressive disruption of posterior cortical networks, hippocampal-prefrontal connectivity, and default mode network (DMN); TMS to bilateral DLPFC and parietal cortex targets cognitive-reserve circuits.",
    "responseData": "Evidence level B; bilateral DLPFC TMS: improvements in cognitive function (ADAS-Cog, MMSE) in several RCTs (Rabey 2013, Bentwich 2011); TPS (NEUROLITH) showing emerging evidence; effects are modest and require maintenance.",
    "patientExplain": "Alzheimer's disease gradually affects memory and thinking by disrupting connections in the brain; brain stimulation supports the remaining healthy connections and may slow cognitive decline.",
    "timeline": "Cognitive improvements may appear from sessions 10-20; 30 sessions initial course; maintenance sessions (monthly) are important to sustain benefits.",
    "selfCare": [
      "Engage in mentally stimulating activities daily (reading, puzzles, social engagement) - the most evidence-based cognitive reserve strategy",
      "Physical exercise 3-5x/week has the strongest evidence base for slowing Alzheimer's progression",
      "Mediterranean diet is associated with reduced cognitive decline and supports brain health"
    ],
    "escalation": "Escalate if behavioural symptoms (agitation, wandering) worsen, safety at home is compromised, or caregiver distress reaches crisis level.",
    "homeNote": null,
    "techSetup": "Bilateral DLPFC (F3/F4) and parietal targets; MoCA at baseline and every 5 sessions; caregiver present at sessions is helpful for safety monitoring; confirm no cardiac device or metal implants.",
    "faq": [
      {
        "q": "Can TMS reverse Alzheimer's disease?",
        "a": "TMS cannot reverse existing neurodegeneration but may slow decline and improve daily function by supporting remaining brain circuits."
      },
      {
        "q": "Should family members be involved in treatment?",
        "a": "Yes; carer involvement is encouraged - they can provide valuable observations about day-to-day function and safety."
      },
      {
        "q": "Are there any medications that should not be taken with TMS?",
        "a": "Continue all prescribed medications; your clinician will review any potential interactions at the assessment appointment."
      }
    ]
  },

  "vasc-dem": {
    "epidemiology": "Vascular dementia is the second most common dementia type (~20-30% of all dementia); caused by cerebrovascular disease; strong overlap with Alzheimer's disease (mixed dementia).",
    "neuroBasis": "Vascular dementia involves focal and multi-focal ischaemic damage to white matter and cortical circuits; tDCS and TMS target residual functional prefrontal networks to support cognitive compensation.",
    "responseData": "Evidence level C; extrapolated from Alzheimer's evidence and stroke rehabilitation; cardiac check mandatory given high cardiovascular comorbidity in vascular dementia.",
    "patientExplain": "Vascular dementia is caused by reduced blood flow to the brain; brain stimulation supports the remaining healthy brain circuits to improve thinking and daily functioning.",
    "timeline": "Response in vascular dementia may be slower than Alzheimer's due to focal lesion patterns; 20-30 sessions initial course; cardiovascular risk management concurrent is essential.",
    "selfCare": [
      "Manage blood pressure, cholesterol, and blood sugar consistently - preventing further vascular events is the most important long-term strategy",
      "Physical exercise supports both cardiovascular health and brain reserve",
      "Cognitive stimulation activities and social engagement slow functional decline"
    ],
    "escalation": "Escalate if new stroke symptoms occur (FAST criteria: Face drooping, Arm weakness, Speech difficulty, Time to call emergency services), cardiac arrhythmia is detected, or rapid cognitive deterioration occurs.",
    "homeNote": null,
    "techSetup": "Cardiac clearance required before initiation (high cardiovascular comorbidity); tDCS bilateral prefrontal; start at 1 mA with gradual titration; MoCA baseline and monitoring; document vascular risk factor management status.",
    "faq": [
      {
        "q": "How is vascular dementia different from Alzheimer's?",
        "a": "Vascular dementia is caused by reduced blood flow (often from strokes or small vessel disease) while Alzheimer's is caused by protein accumulation; many people have both."
      },
      {
        "q": "Will managing my blood pressure help my memory?",
        "a": "Yes; blood pressure control is one of the most important treatments for preventing further vascular dementia progression."
      },
      {
        "q": "Is TMS safe if I have had a stroke?",
        "a": "Yes; TMS is safe after stroke with appropriate neurological assessment and metal implant screening."
      }
    ]
  },

  "parkinsons": {
    "epidemiology": "Parkinson's disease affects ~10 million people globally; the second most common neurodegenerative condition; prevalence doubling by 2040.",
    "neuroBasis": "Parkinson's involves degeneration of substantia nigra dopaminergic neurons with resulting basal ganglia-motor cortex circuit disruption; DBS (FDA-cleared) restores circuit function; TMS adjunct targets motor cortex and SMA for motor and mood symptoms.",
    "responseData": "DBS evidence level A (FDA-cleared) for motor symptoms; TMS adjunct: improvements in tremor, rigidity, and gait in several trials; rTMS to M1/SMA also improves depression in PD (comorbidity in 40%).",
    "patientExplain": "Parkinson's disease affects brain circuits controlling movement and mood; brain stimulation can help reduce tremor, stiffness, and low mood as part of a comprehensive management plan.",
    "timeline": "TMS adjunct course of 10-20 sessions; DBS requires neurosurgical referral and is a separate pathway; rTMS for PD depression follows standard antidepressant TMS course length.",
    "selfCare": [
      "Take levodopa and other medications at exactly prescribed times - timing consistency significantly affects motor performance",
      "Engage in regular exercise (cycling, tai chi, boxing) which has the strongest evidence for slowing PD motor progression",
      "Work with your physiotherapist on gait and fall prevention strategies"
    ],
    "escalation": "Escalate if DBS device malfunction is suspected (sudden motor deterioration), implant infection signs occur, or medication-related psychosis emerges.",
    "homeNote": null,
    "techSetup": "Check for existing DBS device before any TMS (potential DBS-TMS interaction - consult device manufacturer guidelines); M1 and SMA targets for motor symptoms; L-DLPFC HF for depression comorbidity; document UPDRS at baseline.",
    "faq": [
      {
        "q": "Can I have TMS if I already have a DBS device?",
        "a": "You must inform your clinician and the TMS team about your DBS device before any session; special precautions are required and manufacturer guidelines must be followed."
      },
      {
        "q": "Will TMS cure my Parkinson's?",
        "a": "TMS is not a cure but can provide meaningful symptom relief for motor and mood symptoms as part of a comprehensive management plan."
      },
      {
        "q": "Is exercise really that important?",
        "a": "Yes; regular aerobic exercise, particularly cycling and boxing, is the most evidence-based intervention for slowing Parkinson's motor symptom progression."
      }
    ]
  },

  "ms": {
    "epidemiology": "Multiple sclerosis affects ~2.8 million people globally; typically diagnosed ages 20-40; characterised by demyelinating lesions causing relapsing or progressive neurological deficits.",
    "neuroBasis": "MS involves focal demyelination and diffuse neuroinflammation disrupting corticospinal and corticocortical tracts; TMS to M1 targets residual motor circuit plasticity; tDCS may support cognition via diffuse network modulation.",
    "responseData": "Evidence level B; TMS for MS spasticity and fatigue: significant improvement in several RCTs; motor cortex excitability changes are biomarkers of disease state and TMS response.",
    "patientExplain": "MS affects the brain's electrical wiring by stripping insulation from nerve fibres; brain stimulation supports the brain's ability to reroute signals around damaged areas.",
    "timeline": "TMS course of 10-20 sessions for spasticity or fatigue; effect duration variable; maintenance courses appropriate during stable disease phases (not during active relapse).",
    "selfCare": [
      "Never start TMS during an acute MS relapse - wait for neurological stability",
      "Monitor fatigue levels daily and adjust activity accordingly (energy conservation strategies)",
      "Heat sensitivity is common in MS - keep session room cool and report any symptom worsening during sessions"
    ],
    "escalation": "Escalate if new neurological deficit emerges during TMS course (possible relapse), heat-related symptom exacerbation occurs, or fatigue deteriorates significantly.",
    "homeNote": null,
    "techSetup": "Do not treat during active MS relapse; M1 (C3/C4) or bilateral approach; keep session room cool (MS patients are sensitive to heat); document EQ-5D and fatigue scores at baseline and monthly.",
    "faq": [
      {
        "q": "Is TMS safe during a relapse?",
        "a": "No; TMS should not be performed during an active MS relapse; treatment resumes once neurological stability is confirmed."
      },
      {
        "q": "Will TMS slow my MS?",
        "a": "TMS does not modify the underlying MS disease process but can improve specific symptoms such as spasticity, fatigue, and mood."
      },
      {
        "q": "Can I have TMS if I am on disease-modifying therapy?",
        "a": "Yes; TMS is compatible with disease-modifying MS therapies; continue all medications as prescribed."
      }
    ]
  },

  "epilepsy": {
    "epidemiology": "Epilepsy affects ~50 million people globally; ~30% have drug-resistant epilepsy (DRE) uncontrolled with medications; DRE carries high mortality and morbidity.",
    "neuroBasis": "Drug-resistant epilepsy involves persistent hyperexcitable focal or network seizure circuits; taVNS activates vagal afferents to suppress seizure activity via NTS-thalamic-cortical inhibitory pathways; DBS to ANT is FDA-cleared for DRE.",
    "responseData": "taVNS FDA-cleared for DRE: ~30-40% seizure frequency reduction in pivotal trials; DBS ANT: ~50-75% seizure reduction in SANTE trial; LF-TMS to seizure focus: emerging evidence for focal DRE.",
    "patientExplain": "Drug-resistant epilepsy means standard medications have not fully controlled your seizures; brain stimulation works through a different pathway to reduce seizure activity without adding more medications.",
    "timeline": "taVNS requires 3-6 months of consistent use (2 hours on, 4 hours off daily cycle) before full benefit assessment; DBS is a surgical procedure with a separate pathway.",
    "selfCare": [
      "Use taVNS device exactly as prescribed - consistent daily use is essential for seizure reduction benefit",
      "Maintain a detailed seizure diary; share it with your neurologist at every appointment",
      "Avoid known seizure triggers (sleep deprivation, alcohol, stress) consistently throughout treatment"
    ],
    "escalation": "Escalate if seizure frequency increases, seizure duration lengthens, or status epilepticus risk emerges; ensure patient and carers know emergency seizure management plan.",
    "homeNote": "taVNS device (NEMOS/tVNS) is a home-based device requiring daily self-application; ear electrode training session essential before home use begins.",
    "techSetup": "taVNS device training session; left auricular electrode (cymba conchae); 25 Hz, 0.2 ms pulse width, sensory threshold intensity; 2 hours on/4 hours off cycle; seizure diary review at every clinic visit.",
    "faq": [
      {
        "q": "Is taVNS the same as the surgical VNS?",
        "a": "No; taVNS stimulates the auricular (ear) branch of the vagus nerve non-invasively while surgical VNS requires an implanted device; taVNS is a non-surgical alternative."
      },
      {
        "q": "Can I drive while using taVNS?",
        "a": "Driving restrictions depend on your seizure control status and are governed by your local driving authority regulations - your neurologist will advise."
      },
      {
        "q": "How do I know if taVNS is working?",
        "a": "Seizure diary data is the primary outcome measure; reduction in seizure frequency of >=30% is considered a meaningful response."
      }
    ]
  },

  "essential-t": {
    "epidemiology": "Essential tremor affects ~5% of adults over 65; the most common movement disorder; characterised by action tremor of hands, head, and voice.",
    "neuroBasis": "Essential tremor involves cerebellar-thalamo-cortical circuit oscillation (Vim nucleus); DBS to Vim is FDA-cleared; MRI-guided focused ultrasound (MRgFUS) ablates the Vim; TMS modulates tremor circuits non-invasively.",
    "responseData": "DBS and MRgFUS (FUS) provide the strongest evidence for essential tremor (>70% tremor reduction); TMS evidence level B as non-surgical option; rTMS to cerebellum and M1 provides modest tremor reduction.",
    "patientExplain": "Essential tremor is caused by abnormal oscillating signals in a brain circuit controlling movement; brain stimulation can calm this oscillation, reducing the tremor.",
    "timeline": "TMS for tremor: 10-20 sessions initial course; DBS/FUS are separate surgical/procedural pathways requiring specialist referral; discuss all options with your neurologist.",
    "selfCare": [
      "Avoid caffeine and alcohol on assessment days to get accurate tremor ratings",
      "Adaptive equipment (weighted utensils, special cups) significantly improves daily function while treatment proceeds",
      "Inform your clinician of all medications as several drugs can both worsen and improve tremor"
    ],
    "escalation": "Escalate if DBS implant complication signs emerge (infection, device malfunction), tremor severity prevents safe self-care, or new neurological symptoms develop.",
    "homeNote": null,
    "techSetup": "Cerebellum (Iz area) and M1 (Cz) targets; LF 1 Hz primary approach; confirm DBS device absence before TMS; document tremor severity scale at baseline and every 5 sessions.",
    "faq": [
      {
        "q": "Should I consider DBS or focused ultrasound?",
        "a": "DBS and MRgFUS provide much stronger tremor reduction than TMS; your neurologist will guide this discussion based on severity and suitability."
      },
      {
        "q": "Is essential tremor the same as Parkinson's tremor?",
        "a": "No; essential tremor is a separate condition primarily causing action tremor, while Parkinson's tremor occurs at rest - they are treated differently."
      },
      {
        "q": "Will TMS stop my tremor completely?",
        "a": "TMS provides modest tremor reduction and is generally not as powerful as surgical options; it is used when surgery is not appropriate or preferred."
      }
    ]
  },

  "dystonia": {
    "epidemiology": "Dystonia affects ~1-2% of the population; characterised by involuntary muscle contractions causing repetitive movements or abnormal postures.",
    "neuroBasis": "Dystonia involves basal ganglia dysfunction and abnormal surround inhibition of M1; DBS to GPi is FDA-cleared for generalised dystonia; TMS modulates cortical excitability as a non-surgical adjunct.",
    "responseData": "Evidence level C for TMS in dystonia; DBS GPi provides strongest evidence (FDA-cleared) for generalised dystonia; TMS to SMA and M1 shows modest benefit as an adjunct.",
    "patientExplain": "Dystonia is caused by abnormal signals in brain circuits controlling movement; brain stimulation aims to retune these circuits, reducing involuntary contractions.",
    "timeline": "TMS for dystonia: 20 sessions initial; DBS requires neurosurgical referral and is a separate pathway; botulinum toxin injections are first-line for focal dystonia.",
    "selfCare": [
      "Work with your physiotherapist on sensory trick techniques (geste antagoniste) to temporarily relieve dystonic postures",
      "Fatigue and stress worsen dystonia - include rest periods in daily planning",
      "Occupational therapy for adaptive strategies to maintain function in affected body areas"
    ],
    "escalation": "Escalate if DBS device malfunction is suspected, swallowing is affected (oromandibular dystonia emergency), or falls risk increases due to gait dystonia.",
    "homeNote": null,
    "techSetup": "Check for existing DBS device before TMS; M1 (C3/C4) and SMA (Cz) targets; LF 1 Hz primary approach; coordinate with movement disorder specialist; document dystonia severity scale at baseline.",
    "faq": [
      {
        "q": "Is TMS as effective as botulinum toxin for dystonia?",
        "a": "Botulinum toxin remains first-line for focal dystonia; TMS is used as an adjunct or when toxin is not suitable."
      },
      {
        "q": "What is a sensory trick?",
        "a": "A sensory trick (geste antagoniste) is a touch or movement that temporarily reduces dystonic muscle contractions - your physiotherapist can help identify yours."
      },
      {
        "q": "Is DBS suitable for my dystonia?",
        "a": "DBS is most suitable for generalised or segmental dystonia that has not responded to other treatments; your movement disorder specialist will advise on eligibility."
      }
    ]
  },

  "tourette": {
    "epidemiology": "Tourette syndrome affects ~1% of school-age children; characterised by multiple motor and vocal tics; onset typically 5-7 years; often improves in adulthood.",
    "neuroBasis": "Tourette syndrome involves hyperactivity of cortico-striato-thalamo-cortical (CSTC) loops driving involuntary tic sequences; TMS to SMA suppresses excessive motor preparation signals.",
    "responseData": "Evidence level C; SMA TMS for tic reduction: small trial positive results; TMS is used as adjunct to behavioural therapy (CBIT) when pharmacological treatment is insufficient.",
    "patientExplain": "Tourette syndrome involves the brain sending automatic movement and sound signals involuntarily; brain stimulation calms the overactive motor preparation area that generates these tics.",
    "timeline": "Tic reduction over 20 sessions; CBIT (Comprehensive Behavioral Intervention for Tics) concurrent strongly recommended; tic frequency/severity diary essential.",
    "selfCare": [
      "Practise CBIT competing response strategies as prescribed by your therapist",
      "Stress management is particularly important as stress is a major tic trigger",
      "Educate family and school/work about Tourette syndrome to reduce shame and social pressure that worsen tics"
    ],
    "escalation": "Escalate if OCD or ADHD comorbidities (common in Tourette) worsen, self-injurious tics emerge, or social and educational impact becomes severe.",
    "homeNote": null,
    "techSetup": "SMA target (Cz, FCz); LF 1 Hz inhibitory; document tic frequency and YGTSS score at each session; CBIT therapist coordination essential.",
    "faq": [
      {
        "q": "Will my tics get worse before they get better?",
        "a": "TMS does not typically cause tic worsening; some fluctuation is normal, but consistent worsening should be reported immediately."
      },
      {
        "q": "Will Tourette syndrome go away on its own?",
        "a": "Many people experience significant improvement in tics in late adolescence and early adulthood; TMS and CBIT support tic management in the meantime."
      },
      {
        "q": "Is Tourette syndrome linked to OCD and ADHD?",
        "a": "Yes; approximately 50-60% of people with Tourette syndrome have comorbid OCD and/or ADHD; your clinician will assess and address these if present."
      }
    ]
  },

  "long-covid": {
    "epidemiology": "Long COVID affects ~10-20% of people post-acute SARS-CoV-2 infection; characterised by persistent fatigue, cognitive impairment (brain fog), and dysautonomia.",
    "neuroBasis": "Long COVID cognitive symptoms involve neuroinflammation, microglial activation, and prefrontal-hippocampal connectivity disruption; tDCS and TMS to bilateral DLPFC target cognitive fatigue and attention circuits.",
    "responseData": "Evidence level C; emerging data from small trials; tDCS bilateral DLPFC showing improvement in cognitive fatigue and attention in post-COVID cohorts; neurological recovery continues for 12-24 months in most patients.",
    "patientExplain": "Long COVID brain fog involves persistent inflammation affecting the brain's attention and memory circuits; gentle brain stimulation supports these circuits' recovery.",
    "timeline": "tDCS course of 20 sessions with gradual intensity titration; cognitive improvements often slow and cumulative over 6-12 months; pacing strategies essential.",
    "selfCare": [
      "Implement post-exertional malaise management - avoid over-exertion and pace activity carefully using heart rate monitoring",
      "Prioritise sleep; disrupted sleep dramatically worsens long COVID cognitive symptoms",
      "Cognitive pacing (strategic mental activity scheduling with rest intervals) is the most evidence-based cognitive fatigue management strategy"
    ],
    "escalation": "Escalate if post-exertional malaise worsens after sessions, cardiovascular symptoms emerge (POTS-like), or depression secondary to long COVID disability develops.",
    "homeNote": null,
    "techSetup": "Low-intensity tDCS start (1 mA); bilateral F3/F4; monitor for post-exertional symptom worsening after each session; document cognitive fatigue scale at each visit.",
    "faq": [
      {
        "q": "Will TMS cure my long COVID?",
        "a": "TMS supports brain recovery; the underlying long COVID process requires time and multi-system management; TMS targets the cognitive brain circuit component."
      },
      {
        "q": "Is it normal to feel more tired after sessions?",
        "a": "Some fatigue after sessions is common, especially in long COVID; if persistent worsening occurs, session intensity or frequency will be adjusted."
      },
      {
        "q": "How long will long COVID last?",
        "a": "Most patients with long COVID show gradual improvement over 12-24 months; early intervention and careful management improve trajectory."
      }
    ]
  },

  "fnd": {
    "epidemiology": "Functional Neurological Disorder (FND) affects ~5-16 per 100,000 per year; the second most common neurological outpatient diagnosis; includes functional tremor, weakness, and seizures.",
    "neuroBasis": "FND involves altered predictive processing in motor control circuits and disconnection between intention and movement; TMS to M1 and SMA provides non-specific neurobiological reinforcement of normal motor circuit function.",
    "responseData": "Evidence level C; small TMS trials in FND showing motor symptom improvement when combined with physiotherapy; psychological therapy (physiotherapy-led) is the primary evidence-based treatment.",
    "patientExplain": "Functional neurological disorder is a genuine brain condition where the software controlling movement is disrupted rather than the hardware being damaged; brain stimulation can help reset these control signals.",
    "timeline": "TMS as adjunct to physiotherapy; 15-20 sessions; psychoeducation that FND is real, treatable, and not caused by psychological weakness is essential before and during treatment.",
    "selfCare": [
      "Understand that FND is a real condition involving genuine brain circuit disruption - it is not feigned or \"all in your head\"",
      "Physiotherapy is the primary evidence-based treatment; TMS enhances physiotherapy outcomes",
      "Avoid over-reassurance-seeking and illness-focus behaviours that can inadvertently maintain FND symptoms"
    ],
    "escalation": "Escalate if non-epileptic attacks (functional seizures) increase in frequency, or if patient is distressed by the FND diagnosis.",
    "homeNote": null,
    "techSetup": "M1 and SMA targets; psychoeducation about FND nature essential before first session; coordinate closely with FND-specialist physiotherapist; avoid framing TMS as a \"cure\" which can be counterproductive in FND.",
    "faq": [
      {
        "q": "Is FND the same as being stressed or anxious?",
        "a": "No; FND is a specific neurological condition with distinct brain circuit features; although stress can contribute as a trigger, it is not simply a psychological condition."
      },
      {
        "q": "Will TMS fix my functional symptoms?",
        "a": "TMS is an adjunct to physiotherapy and psychoeducation; meaningful improvement is achievable but requires active engagement with the full treatment programme."
      },
      {
        "q": "Why does no one seem to know what FND is?",
        "a": "FND is a relatively recently characterised condition; medical understanding has advanced significantly in recent years and specialist FND clinics are increasingly available."
      }
    ]
  },

  "bpd-psy": {
    "epidemiology": "Borderline Personality Disorder affects ~1-2% of the population; characterised by emotional dysregulation, unstable relationships, impulsivity, and identity disturbance.",
    "neuroBasis": "BPD involves amygdala hyperreactivity and deficient prefrontal inhibitory control; bilateral DLPFC TMS targets emotional dysregulation circuits by enhancing PFC-amygdala top-down regulation.",
    "responseData": "Evidence level C; limited TMS RCT data for BPD specifically; TMS for comorbid depression in BPD has level B evidence; combined with DBT gives most complete treatment.",
    "patientExplain": "BPD involves a brain that is highly sensitive to emotions and struggles with the brakes on emotional reactions; brain stimulation strengthens those emotional brakes alongside therapy.",
    "timeline": "TMS most relevant for comorbid depression component in BPD; 20-30 sessions; DBT (Dialectical Behaviour Therapy) is the primary evidence-based treatment and must run concurrently.",
    "selfCare": [
      "Attend all DBT sessions - DBT is the primary treatment for BPD and TMS is an adjunct",
      "Use your distress tolerance skills from DBT between sessions; note which work best for you",
      "Use the mood diary consistently to identify emotional triggers and patterns"
    ],
    "escalation": "Escalate if active suicidality with intent or plan emerges, self-harm escalates in severity, or dissociation occurs during sessions.",
    "homeNote": null,
    "techSetup": "Bilateral DLPFC (F3/F4); document PHQ-9 and GAD-7 at each session; coordinate with DBT therapist; safety plan confirmed at every visit given suicide risk in BPD.",
    "faq": [
      {
        "q": "Can TMS treat BPD itself?",
        "a": "TMS primarily helps with the depression component of BPD; DBT is the primary treatment for the core BPD features."
      },
      {
        "q": "Is BPD a character flaw?",
        "a": "No; BPD is a well-characterised neurobiological condition involving measurable brain circuit differences, often with roots in early life adversity."
      },
      {
        "q": "Will TMS help with emotional outbursts?",
        "a": "TMS may reduce the frequency and intensity of emotional dysregulation as it strengthens prefrontal control circuits; this works best in combination with DBT skills."
      }
    ]
  },

  "tms-mdd-dlpfc-hf": {
    "name": "L-DLPFC HF-TMS for MDD",
    "modality": "TMS/rTMS",
    "condition": "MDD",
    "target": "F3 (L-DLPFC)",
    "setup": [
      "Obtain written informed consent for TMS treatment.",
      "Determine motor threshold (MT): place figure-8 coil over M1 (C3), increase pulse intensity in 5% steps until visible APB contraction in >5/10 trials; record as resting MT (rMT).",
      "Measure 5.5 cm anterior to the motor hotspot along a parasagittal line to locate L-DLPFC (F3).",
      "Mark the target site with washable marker; photograph for reproducibility across sessions.",
      "Set treatment parameters: 10 Hz, 4-second trains, 26-second inter-train interval, 120% rMT, 3000 total pulses per session.",
      "Document MT and coil angle in session log before proceeding."
    ],
    "sessionWorkflow": [
      "Patient seated comfortably in reclining chair; remove metal items from head area.",
      "Reposition coil to marked F3 site; confirm handle angle (typically 45 degrees from midline).",
      "Confirm MT from prior session; remeasure if >1 week gap or clinical change.",
      "Begin treatment at 120% rMT; monitor patient response during first train.",
      "Complete 75 trains of 40 pulses each (3000 total pulses, ~37 minutes).",
      "Post-session: document tolerability (VAS 0-10), headache, and mood rating; complete session log.",
      "Administer PHQ-9 weekly (every session 5).",
      "Schedule next session within 24 hours for 5-day/week protocol."
    ],
    "contraindications": [
      "Metal in skull (cochlear implant, DBS, aneurysm clip, surgical staples near target)",
      "History of seizure or epilepsy (relative - requires neurologist clearance)",
      "Cardiac pacemaker or implantable cardiac device",
      "Active psychosis or manic episode",
      "Pregnancy (relative - risk-benefit discussion required)",
      "Brain tumour or significant structural abnormality near target site",
      "Increased intracranial pressure"
    ],
    "expectedResponse": "Response (>=50% PHQ-9 reduction) expected in 50-60% of patients; remission (PHQ-9 <5) in 30-35%; onset typically session 10-15; full assessment at session 30. Absence of any response signal (PHQ-9 movement) by session 15 warrants protocol review.",
    "monitoring": "PHQ-9 at every 5th session; CGI-S/I weekly; tolerability VAS after each session; MT reassessment every 2 weeks or after >1 week gap; adverse event log at every session; suicidality screening at every session.",
    "followUp": "Review 4 weeks post-course; consider 6-session maintenance course at 1 month if partial response; booster course at first sign of relapse; home tDCS maintenance prescription if appropriate; psychotherapy referral if not already in place."
  },

  "tms-mdd-itbs": {
    "name": "iTBS (Intermittent Theta-Burst Stimulation) for MDD",
    "modality": "iTBS",
    "condition": "MDD / TRD",
    "target": "F3 (L-DLPFC)",
    "setup": [
      "Obtain informed consent; explain that iTBS sessions are shorter than conventional TMS (3 min vs 37 min).",
      "Determine active motor threshold (aMT): burst of 3 pulses at 50 Hz during voluntary contraction; identify minimum intensity producing consistent motor response; document aMT.",
      "Locate L-DLPFC at F3 using 10-20 method or 5.5 cm anterior to motor hotspot.",
      "Set parameters: 80% aMT, burst pattern (3 pulses at 50 Hz, 200 ms inter-burst at 5 Hz), 2-second trains, 8-second inter-train intervals, 600 total pulses per session.",
      "For accelerated protocols (SAINT-style): 10 sessions per day over 5 days; MRI-guided targeting preferred."
    ],
    "sessionWorkflow": [
      "Standard single iTBS session: patient seated; coil positioned at F3 at previously documented angle.",
      "Confirm aMT (remeasure if >1 week gap).",
      "Deliver 600 pulses in approximately 3 minutes and 9 seconds.",
      "Post-session: document tolerability and mood rating; complete session log.",
      "For accelerated protocol: ensure minimum 50-minute gap between daily sessions; schedule 10 sessions across the day (08:00, 09:00, 10:00, 11:00, 12:30, 13:30, 14:30, 15:30, 16:30, 17:00).",
      "Monitor for headache (most common side effect with high-density accelerated protocols).",
      "PHQ-9 at baseline and post-course (daily monitoring in accelerated protocol)."
    ],
    "contraindications": [
      "All standard TMS contraindications apply.",
      "For accelerated SAINT protocol: cardiac conditions requiring clearance; MRI eligibility required for neuronavigated version.",
      "History of seizure - higher cumulative dose in accelerated protocols requires neurologist clearance."
    ],
    "expectedResponse": "iTBS non-inferior to conventional 10 Hz TMS for MDD (Blumberger 2018); SAINT accelerated protocol: 79% remission in small trial (Cole 2020); standard iTBS course: 50-60% response at 20 sessions. Faster onset possible with accelerated protocols.",
    "monitoring": "PHQ-9 every 5 sessions (standard) or daily (accelerated); aMT at each session; headache and tolerability VAS; suicidality screening every session; monitoring intensity increased in accelerated protocols due to higher cumulative dose.",
    "followUp": "Same as standard TMS for MDD; accelerated protocol may require earlier post-course review (1-2 weeks) due to rapid response trajectory; booster single iTBS sessions can be used for maintenance."
  },

  "tms-trd-bilateral": {
    "name": "Bilateral TMS for Treatment-Resistant Depression",
    "modality": "TMS/rTMS",
    "condition": "TRD",
    "target": "F3 (L-DLPFC) + F4 (R-DLPFC)",
    "setup": [
      "Independent MT determination for each hemisphere: L-DLPFC hotspot via right APB (C3 coil position); R-DLPFC hotspot via left APB (C4 coil position); document both MTs.",
      "Typical bilateral sequence: HF-TMS left DLPFC (10 Hz, 120% MT, 1500 pulses) followed immediately by LF-TMS right DLPFC (1 Hz, 110% MT, 1200 pulses).",
      "Session duration approximately 40-50 minutes; coil repositioning between hemispheres required.",
      "Mark both target sites; photograph for reproducibility."
    ],
    "sessionWorkflow": [
      "Seat patient; position coil at L-DLPFC (F3); confirm MT.",
      "Deliver HF-TMS left DLPFC (1500 pulses, 10 Hz, 120% MT).",
      "Reposition coil to R-DLPFC (F4); confirm MT.",
      "Deliver LF-TMS right DLPFC (1200 pulses, 1 Hz, 110% MT).",
      "Post-session tolerability and mood documentation.",
      "PHQ-9 and MADRS every 5 sessions.",
      "Monitor for mood switching (bipolar history screen mandatory before first session)."
    ],
    "contraindications": [
      "All standard TMS contraindications apply.",
      "Active bipolar mania (not bipolar depression - discuss with psychiatrist).",
      "Prior mania induced by antidepressant or TMS (requires careful monitoring if TMS is indicated).",
      "Active psychosis."
    ],
    "expectedResponse": "Bilateral TMS for TRD: ~45-55% response; superior to unilateral for severe/melancholic depression in some studies; response assessment at session 20 and session 36. For non-responders at 36 sessions, consider ECT referral.",
    "monitoring": "PHQ-9 and MADRS every 5 sessions; CGI weekly; full suicidality screen every session; monitor for bipolar switching (sudden elation, decreased sleep need, grandiosity); document both L and R MT at each session.",
    "followUp": "Review 4-6 weeks post-course; booster course at first sign of relapse; ECT referral if two full TMS courses (including bilateral) fail to produce response; antidepressant augmentation review with psychiatrist."
  },

  "tms-ocd-sma": {
    "name": "BrainsWay H7 Deep TMS for OCD",
    "modality": "Deep TMS (H7 coil)",
    "condition": "OCD",
    "target": "SMA / ACC",
    "setup": [
      "Patient must hold DSM-5 OCD diagnosis confirmed by licensed clinician; Y-BOCS score >=20 (moderate-severe).",
      "Obtain specific deep TMS consent explaining H7 coil differences from standard TMS.",
      "Determine MT using H7 coil in standard protocol; document deep TMS MT separately from any prior standard TMS MT.",
      "Prepare personalised symptom provocation script: identify patient's primary obsession/compulsion theme; create 2-minute imagery script or select provocation object.",
      "Set parameters: 20 Hz, 2-second trains, 20-second inter-train intervals, 120% MT, 1800 total pulses per session.",
      "Session duration approximately 20 minutes of stimulation."
    ],
    "sessionWorkflow": [
      "Administer Y-BOCS before each session.",
      "Administer personalised symptom provocation 30 minutes before TMS: present imagery script or provocation object; confirm anxiety VAS elevation (target: patient reports anxiety >4/10).",
      "Patient seated in H7 coil helmet device; confirm fit.",
      "Deliver 1800 pulses per 20 Hz protocol.",
      "Post-session: document anxiety VAS, tolerability, and any AEs.",
      "Anxiety VAS should return toward baseline within 30 minutes post-session; do not discharge patient if still highly anxious.",
      "Sessions 5 times per week for approximately 6 weeks (29 sessions FDA-cleared protocol)."
    ],
    "contraindications": [
      "All standard TMS contraindications apply.",
      "Active psychotic episode.",
      "Significant cognitive impairment affecting ability to participate in provocation protocol.",
      "Y-BOCS <16 (mild OCD; evidence base is for moderate-severe).",
      "Active suicidality requiring immediate intervention."
    ],
    "expectedResponse": "Pivotal RCT (Carmi 2019): 38% responder rate (Y-BOCS reduction >=30%) vs 11% sham at 6-week endpoint; response often continues improving post-course; ERP therapy concurrent markedly enhances and sustains outcomes.",
    "monitoring": "Y-BOCS at every session; anxiety VAS before provocation, after provocation, and after TMS; PHQ-9 every 5 sessions (depression frequent OCD comorbidity); tolerability VAS; AE log.",
    "followUp": "Y-BOCS at 4 and 12 weeks post-course; booster sessions (1x/week for 4 weeks) appropriate for partial responders; ERP therapy should continue independently of TMS course; assess need for second course at 12-week review."
  },

  "tms-ptsd-dlpfc": {
    "name": "DLPFC TMS for PTSD",
    "modality": "TMS/rTMS",
    "condition": "PTSD",
    "target": "F3/F4 (Bilateral DLPFC)",
    "setup": [
      "Trauma-informed consent process: explain procedure, patient controls session termination at any time, no trauma content required during sessions.",
      "PCL-5 and CAPS-5 (if available) at baseline.",
      "Determine MT at L-DLPFC standard method.",
      "Protocol: L-DLPFC HF-TMS (10 Hz, 120% MT, 1500-2000 pulses) primary; some protocols add R-DLPFC LF (1 Hz, 110% MT, 600 pulses) bilateral approach.",
      "Session environment: patient controls room entry/exit; no sudden sounds; grounding materials available (blanket, squeeze object)."
    ],
    "sessionWorkflow": [
      "Pre-session check: confirm patient safety (no active suicidality) and brief grounding exercise.",
      "Patient seated; coil positioned; trauma-informed briefing before first stimulus.",
      "Deliver L-DLPFC HF protocol; monitor for dissociative responses during session.",
      "If patient signals distress: pause immediately; provide grounding before deciding whether to resume.",
      "Post-session: brief grounding check-in; confirm patient is oriented and safe before discharge.",
      "PCL-5 every 5 sessions; PHQ-9 every 5 sessions.",
      "Avoid scheduling sessions immediately before known trauma-related events (anniversaries, court dates, therapy sessions involving trauma processing)."
    ],
    "contraindications": [
      "All standard TMS contraindications apply.",
      "Active psychotic episode or severe dissociative disorder requiring stabilisation first.",
      "Active suicidality requiring immediate intervention.",
      "Intoxication or active substance use at session time."
    ],
    "expectedResponse": "PCL-5 response (>=10 point reduction): 40-60% of patients at 20 sessions; clinically meaningful improvement in hyperarousal and avoidance symptom clusters; trauma-focused concurrent therapy (PE, CPT) markedly improves outcomes.",
    "monitoring": "PCL-5 every 5 sessions; PHQ-9 every 5 sessions; suicidality screen every session; dissociation check post-session; trauma-informed safety check at beginning of each appointment.",
    "followUp": "PCL-5 at 4 and 12 weeks post-course; booster 10-session course at first sign of relapse; trauma-focused therapy should continue independently of TMS; coordinate discharge summary with mental health team."
  },

  "tms-stroke-m1-hf": {
    "name": "M1 HF-TMS for Stroke Motor Rehabilitation",
    "modality": "TMS/rTMS",
    "condition": "Stroke - Motor",
    "target": "C3/C4 (Ipsilesional M1)",
    "setup": [
      "Neurological clearance: no active seizure disorder, no metal in skull, imaging reviewed for haemorrhagic component, >=2 weeks post-acute stroke before TMS initiation.",
      "Determine ipsilesional M1 hotspot for the affected muscle group (C3 for left hemisphere, C4 for right hemisphere).",
      "MT determination may require higher stimulus intensity post-stroke due to cortical hypoexcitability; document carefully.",
      "Protocol: HF 10 Hz, 90-110% MT, 1200-2000 pulses per session, ipsilesional hemisphere primary; some protocols add contralesional LF 1 Hz (suppression) second.",
      "Confirm physiotherapy is scheduled within 30 minutes post-TMS (plasticity window)."
    ],
    "sessionWorkflow": [
      "Confirm neurological stability before each session (no new stroke symptoms, no seizure).",
      "Position affected side up for muscle activation task concurrent with TMS if able.",
      "Deliver ipsilesional M1 HF-TMS protocol.",
      "Immediate physiotherapy session following TMS within the neuroplasticity window (within 30 minutes).",
      "Document motor function assessment (Fugl-Meyer upper limb score, grip strength) at baseline and every 5 sessions.",
      "AE monitoring: headache, fatigue, seizure vigilance."
    ],
    "contraindications": [
      "Active seizure or epilepsy post-stroke (requires neurologist clearance and lower protocol intensity).",
      "Metal fragments near stimulation site (skull X-ray required if any doubt from injury mechanism).",
      "Acute phase (<2 weeks) post-stroke.",
      "Haemorrhagic stroke: consult neurology before TMS initiation.",
      "DBS device present."
    ],
    "expectedResponse": "Evidence level A; TMS + physiotherapy superior to physiotherapy alone for upper limb motor recovery; Fugl-Meyer improvement of 5-10 points over 10-20 sessions; early intervention (<6 months post-stroke) yields better outcomes; chronic stroke also responds but typically less dramatically.",
    "monitoring": "Fugl-Meyer upper limb score and grip dynamometer at baseline and every 5 sessions; NIHSS review every 5 sessions; seizure vigilance throughout; fatigue and headache VAS post-session.",
    "followUp": "Fugl-Meyer at 4 and 12 weeks post-course; booster course at 3-6 months if plateau reached; ongoing physiotherapy essential; coordinate with stroke rehabilitation team for long-term plan."
  },

  "tdcs-mdd-dlpfc": {
    "name": "tDCS for MDD (F3 Anode / Fp2 Cathode)",
    "modality": "tDCS",
    "condition": "MDD",
    "target": "F3 (anode) / Fp2 (cathode)",
    "setup": [
      "Obtain informed consent specific to tDCS (explain tingling/itching sensations normal, rare skin irritation).",
      "Electrode placement: 5x5 cm sponge electrodes soaked in saline; anode at F3 (target: L-DLPFC excitation), cathode at Fp2 (right supraorbital) or right shoulder (extracephalic).",
      "Parameters: 2 mA direct current, 30 minutes per session, 1 mA/sec ramp-up and ramp-down.",
      "Impedance check before delivering current (most devices have automated impedance monitoring).",
      "Optional: concurrent cognitive task (emotional word recall, working memory) during stimulation enhances functional specificity."
    ],
    "sessionWorkflow": [
      "Check electrode placement and impedance.",
      "Begin ramp-up to 2 mA over 30 seconds.",
      "Patient engaged in cognitive task or passive rest during 30-minute stimulation.",
      "Post-session: check skin at electrode sites for irritation; document tolerability.",
      "PHQ-9 every 5 sessions.",
      "Sessions 5x/week for 4 weeks (20 sessions) standard; home tDCS protocol after clinical course can extend benefit."
    ],
    "contraindications": [
      "Metal in or on head (cochlear implants, DBS, skull plate near electrode sites).",
      "Open wounds or skin lesions at electrode sites.",
      "Unstable epilepsy.",
      "Pregnancy (relative contraindication; risk-benefit discussion).",
      "Recent TMS course at same site (wait >=48 hours before combining TMS and tDCS)."
    ],
    "expectedResponse": "ISI reduction ~5-8 points in depression with insomnia overlap; PHQ-9 improvement ~4-6 points over 20 sessions; lower effect size than TMS but lower cost and home use potential; evidence level B for MDD.",
    "monitoring": "PHQ-9 every 5 sessions; skin inspection at electrode sites every session; impedance log; tolerability VAS; electrode gel/saline moistness check at each session.",
    "followUp": "PHQ-9 at 4 and 8 weeks post-course; home tDCS maintenance prescription appropriate for partial responders or chronic/recurrent depression; coordinate with prescribing psychiatrist for medication review."
  },

  "tdcs-pain-m1": {
    "name": "M1 tDCS for Chronic Pain",
    "modality": "tDCS",
    "condition": "Neuropathic / Chronic Pain",
    "target": "C3/C4 (M1 anode, contralateral to pain)",
    "setup": [
      "Confirm pain type and laterality; anode placed at M1 contralateral to primary pain site (C3 for right-sided pain, C4 for left-sided pain).",
      "Cathode at ipsilateral supraorbital (Fp1 or Fp2) or extracephalic (shoulder).",
      "Parameters: 2 mA, 20-30 minutes, 1 mA/sec ramp.",
      "Pain NRS (0-10) documented before each session."
    ],
    "sessionWorkflow": [
      "Pain NRS at session start.",
      "Electrode placement and impedance check.",
      "Deliver 2 mA for 20-30 minutes.",
      "Pain NRS 30 minutes post-session.",
      "Document net NRS change; >1.5 point reduction considered clinically meaningful.",
      "Sessions 5x/week for 2-4 weeks (10-20 sessions) standard."
    ],
    "contraindications": [
      "Metal at electrode sites.",
      "Active skin conditions at electrode sites.",
      "Unstable seizure disorder.",
      "Implanted devices near stimulation site."
    ],
    "expectedResponse": "M1 tDCS for neuropathic pain: 30-50% NRS reduction in responders; evidence level B; effect may last days to weeks after a session; monthly maintenance appropriate for chronic pain.",
    "monitoring": "NRS before and 30 min after each session; EQ-5D at baseline and end of course; skin inspection each session; pain medication diary review weekly.",
    "followUp": "NRS at 4 weeks post-course; monthly maintenance sessions appropriate for chronic pain conditions; combine with pain neuroscience education and graded activity programme."
  },

  "tavns-epilepsy": {
    "name": "taVNS for Drug-Resistant Epilepsy",
    "modality": "taVNS",
    "condition": "Drug-Resistant Epilepsy",
    "target": "Left auricular (cymba conchae)",
    "setup": [
      "Patient must meet DRE criteria (>=2 failed appropriate antidepressant trials at adequate doses and duration).",
      "Cardiac clearance: taVNS activates vagal afferents; baseline ECG and cardiology review if bradycardia or arrhythmia history.",
      "NEMOS/tVNS device setup: left ear electrode specifically targets cymba conchae (not tragus) for maximal vagal branch density.",
      "Starting parameters: 25 Hz, 0.2 ms pulse width, sensory threshold intensity (patient reports tingling, no pain).",
      "Daily cycle: 2 hours on, 4 hours off; patient self-administers at home after training session."
    ],
    "sessionWorkflow": [
      "Training session at clinic: demonstrate electrode placement at cymba conchae; confirm correct sensation (tingling, not pain); confirm no bradycardia response with 5-minute supervised use.",
      "Home use: device worn for 2-hour blocks on/off daily cycle.",
      "Clinic review appointments: every 4 weeks initially; seizure diary review at each visit.",
      "Seizure diary: document seizure frequency, duration, and severity at every clinic visit.",
      "ECG monitoring at first clinic visit and if cardiac symptoms emerge."
    ],
    "contraindications": [
      "Vagotomy (prior surgical vagal nerve sectioning).",
      "Active ear infection or skin condition in left ear.",
      "Severe bradycardia or sick sinus syndrome.",
      "Bilateral cervical vagotomy.",
      "Implanted cardiac device sensitive to vagal activation (consult cardiologist)."
    ],
    "expectedResponse": "FDA-cleared for DRE; ~30-40% seizure frequency reduction at 6 months; >=50% reduction (responder rate) in ~30% of patients; seizure diary is primary outcome measure; full benefit assessment requires minimum 3 months of consistent use.",
    "monitoring": "Seizure diary at every appointment; ECG at first and if cardiac symptoms; ear skin inspection each visit; tolerability and adverse effect documentation; epilepsy quality of life scale (QOLIE-31) at baseline and 6 months.",
    "followUp": "Seizure diary review monthly for first 3 months, then quarterly; if >=50% seizure reduction maintained at 6 months, continue indefinitely; if no response at 6 months, reassess with epileptologist for surgical options."
  },

  "nfb-adhd-theta-beta": {
    "name": "Theta-Beta Neurofeedback for ADHD",
    "modality": "Neurofeedback (EEG)",
    "condition": "ADHD (Combined/Inattentive)",
    "target": "Cz (theta suppression / beta enhancement)",
    "setup": [
      "Baseline qEEG: at minimum, record Cz electrode 5 minutes eyes-open, 5 minutes eyes-closed; confirm elevated theta/beta ratio (normal <2.5; ADHD typically >3).",
      "EEG electrode at Cz (vertex); reference at earlobes (A1/A2) or mastoids.",
      "Threshold setting: theta inhibit band 4-8 Hz; beta reward band 15-20 Hz (or 12-15 Hz for sensorimotor rhythm approach).",
      "Initial thresholds set so patient achieves reward tone approximately 50-60% of the time.",
      "Session duration: 30-40 minutes of active neurofeedback per session.",
      "Computer-based game or animation provides real-time feedback (reward tone/visual cue when theta decreases and beta increases simultaneously)."
    ],
    "sessionWorkflow": [
      "Apply EEG electrode at Cz with conductive gel; impedance check (<10 kOhm).",
      "Baseline 2-minute recording to set session thresholds.",
      "Begin neurofeedback protocol: patient focuses on achieving reward cue by self-regulating brainwaves.",
      "Clinician monitors EEG trace and adjusts thresholds each 10 minutes to maintain ~60% reward rate.",
      "Document EEG metrics (mean theta power, mean beta power, theta/beta ratio) each session.",
      "End of session: print session EEG summary; review progress with patient.",
      "40-session protocol, 3x/week over 13-14 weeks for durable outcome."
    ],
    "contraindications": [
      "Active scalp infection or open wound at Cz electrode site.",
      "Photosensitive epilepsy (if visual feedback modality used; audio-only feedback is an alternative).",
      "Cognitive impairment severe enough to prevent engagement with feedback task.",
      "Significant comorbid psychiatric crisis requiring stabilisation first."
    ],
    "expectedResponse": "Evidence level B; meta-analytic effect sizes comparable to non-stimulant ADHD medication; most durable results require 40 sessions; theta/beta ratio normalisation correlates with clinical improvement; home neurofeedback (Muse 2) can extend gains post-clinical protocol.",
    "monitoring": "EEG metrics (theta/beta ratio) at each session; CGI-I and ADHD symptom rating scale at baseline, session 20, and session 40; parent/teacher rating for children; occupational/academic functioning review monthly.",
    "followUp": "CGI-I at 4 and 12 weeks post-course; home neurofeedback programme (Muse 2) prescribed for maintenance; ADHD coaching concurrent for occupational/academic skill building; reassess medication if response insufficient."
  },

  "tms-migraine-occ": {
    "name": "Single-Pulse TMS for Migraine with Aura (SpringTMS)",
    "modality": "TMS (single-pulse)",
    "condition": "Migraine with Aura",
    "target": "Oz (occipital cortex)",
    "setup": [
      "Patient training session: neurologist or TMS-trained clinician confirms migraine with aura diagnosis.",
      "Demonstrate SpringTMS device placement: device held firmly against the back of the head (occipital region, Oz).",
      "Deliver 2 test single pulses to confirm device function and patient tolerance.",
      "Patient education: aura recognition, optimal window for acute treatment (within 20 minutes of aura onset), preventive protocol timing.",
      "Provide written home-use instructions card; document device serial number.",
      "Baseline headache diary established (minimum 4-week baseline before assessing treatment response)."
    ],
    "sessionWorkflow": [
      "ACUTE use: at first sign of visual or other aura, hold device to occiput, deliver 4 pulses (2 immediately, repeat after 15 minutes if aura persists or headache begins).",
      "PREVENTIVE use: 2 pulses to occiput every morning regardless of symptoms.",
      "Document each use in headache diary (date, time, symptoms before, response at 2 hours).",
      "Clinic review: headache diary data review every 4-6 weeks.",
      "Assess response: acute (pain-free at 2 hours); preventive (reduction in monthly migraine days vs baseline)."
    ],
    "contraindications": [
      "Migraine without aura (acute indication is specifically for aura; preventive protocol may be used).",
      "Metal in the head (DBS, cochlear implant, aneurysm clips).",
      "History of seizure (single-pulse TMS is very low risk; relative contraindication).",
      "Cardiac pacemaker or implantable device.",
      "Pregnancy (relative; discuss risk-benefit with neurologist)."
    ],
    "expectedResponse": "FDA-cleared for migraine with aura; 39% pain-free at 2 hours vs 22% sham (Lipton 2010); preventive protocol: ~2.75 fewer monthly migraine days vs sham; response assessment at 3 months of consistent use.",
    "monitoring": "Headache diary review at every clinic visit; monthly migraine days, acute treatment use frequency, pain-free at 2 hours rate; medication overuse assessment (headache on >10-15 days/month requires medication overuse headache evaluation).",
    "followUp": "Quarterly clinic review; headache diary data shared with neurologist; device prescription renewal annually; escalate to preventive pharmacological therapy if monthly migraine days remain >=8 despite TMS preventive protocol."
  },

  "dbs-parkinsons-stn": {
    "name": "STN DBS for Parkinson's Disease",
    "modality": "DBS",
    "condition": "Parkinson's Disease",
    "target": "Subthalamic Nucleus (STN)",
    "setup": [
      "DBS is a neurosurgical procedure; all pre-surgical assessment is conducted by the neurology/neurosurgery DBS team.",
      "Eligibility criteria: PD confirmed with good levodopa response; UPDRS Part III >=30% on-off fluctuation; dyskinesia significantly impacting quality of life; no cognitive impairment (MoCA >=26); no significant psychiatric comorbidity.",
      "Pre-surgical work-up: brain MRI, neuropsychological assessment, psychiatric evaluation, UPDRS off and on medications, quality of life scales.",
      "Surgical implantation: bilateral STN electrode placement under stereotactic guidance; pulse generator implanted subcutaneously in chest.",
      "Programming begins 2-4 weeks post-implant."
    ],
    "sessionWorkflow": [
      "DBS programming appointment: neurologist or clinical specialist performs monopolar/bipolar impedance measurement; UPDRS Part III in medication-off state.",
      "Initial stimulation: start low amplitude (1-2 V), increase gradually while monitoring for benefit and side effects.",
      "Parameter optimisation: adjust contact, polarity, amplitude, pulse width, and frequency to achieve maximal motor benefit with minimal side effects.",
      "Medication review: levodopa dose typically reduced after effective DBS programming; medication-device titration is ongoing.",
      "Document programming parameters, UPDRS score, and side effects at each visit.",
      "Device battery monitoring: primary cell replacement every 3-5 years; rechargeable systems require regular charging."
    ],
    "contraindications": [
      "Significant cognitive impairment (MoCA <26) - DBS may worsen cognition.",
      "Active psychiatric illness (depression, psychosis) not optimally managed.",
      "Advanced age with significant medical comorbidity increasing surgical risk.",
      "Parkinson's variant (PSP, MSA) which does not respond to DBS.",
      "Atypical parkinsonian syndromes.",
      "MRI-incompatible body metal if MRI follow-up anticipated."
    ],
    "expectedResponse": "Evidence level A (FDA-cleared); UPDRS Part III improvement 40-60% in off-medication state; dyskinesia reduction 70-90%; levodopa equivalent dose reduction 50-60%; motor benefit sustained >10 years in most patients; gait, speech, and swallowing respond less predictably.",
    "monitoring": "UPDRS Part III off and on medications at each programming visit; monthly for first 3 months, then quarterly; device impedance check; battery status monitoring; neuropsychological reassessment at 12 months; mood screening (depression common post-DBS in some patients).",
    "followUp": "Lifelong DBS management by specialist DBS team; quarterly clinic visits once stable; emergency DBS plan provided to patient (what to do if device malfunctions or is lost); emergency MRI protocol if scan required; patient carries DBS device card at all times."
  },

};
