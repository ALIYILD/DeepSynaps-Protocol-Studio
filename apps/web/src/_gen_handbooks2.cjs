// Generator Part 2: neurological + other conditions + protocols
const fs = require('fs');
const OUT = 'C:/Users/yildi/DeepSynaps-Protocol-Studio/apps/web/src/handbooks-data.js';

function cond(id, o) {
  return `  ${JSON.stringify(id)}: ${JSON.stringify(o, null, 2).replace(/^/gm, '  ').trimStart()},\n\n`;
}

function proto(id, o) {
  return `  ${JSON.stringify(id)}: ${JSON.stringify(o, null, 2).replace(/^/gm, '  ').trimStart()},\n\n`;
}

// Read existing content and strip the closing comment + closing brace
let existing = fs.readFileSync(OUT, 'utf8');
existing = existing.replace(/\n\s*\/\/ ── TO BE CONTINUED[\s\S]*$/, '\n');

let out = '';

// ── NEUROLOGICAL ─────────────────────────────────────────────────────────────

out += cond('stroke-mtr', {
  epidemiology: 'Stroke is the second leading cause of death and third leading cause of disability globally; ~15 million strokes per year; motor deficits affect 80% of survivors.',
  neuroBasis: 'Post-stroke motor recovery involves inter-hemispheric competition; HF-TMS to ipsilesional M1 enhances excitability while LF-TMS to contralesional M1 reduces competitive inhibition.',
  responseData: 'Evidence level A; multiple RCTs show TMS + physiotherapy produces greater motor recovery than physiotherapy alone; effect size d~0.5-0.8 for upper limb function.',
  patientExplain: 'Stroke damages a part of the brain controlling movement; brain stimulation helps the brain reorganise and build new connections to restore movement, especially when combined with physiotherapy.',
  timeline: 'Motor improvements measurable from sessions 5-10; 10 sessions in acute/subacute phase or 20 sessions in chronic phase; physiotherapy must be concurrent for best outcomes.',
  selfCare: ['Attend all physiotherapy sessions - TMS without active movement practice produces minimal lasting benefit', 'Practice assigned home exercises twice daily between sessions', 'Track movement quality with your therapist using functional goals (e.g. reach, grip, cup lifting)'],
  escalation: 'Escalate if seizure occurs, new neurological deficit emerges, or agitation/confusion develops during sessions.',
  homeNote: null,
  techSetup: 'Ipsilesional M1 target (C3 for left hemisphere stroke, C4 for right hemisphere stroke); hotspot for relevant muscle group; HF 10 Hz; 1200-2000 pulses/session; confirm no metal in skull before first session.',
  faq: [
    {q:'Will TMS work even years after my stroke?',a:'Yes; TMS can improve motor function in both acute and chronic (years post-stroke) phases, though earlier treatment generally yields better outcomes.'},
    {q:'Does TMS replace physiotherapy?',a:'No; TMS is most effective as a primer before physiotherapy - the stimulation makes the brain more receptive to movement relearning.'},
    {q:'Can TMS help speech after stroke?',a:'There is a separate protocol for aphasia (speech difficulties after stroke) - discuss this with your clinician if speech is affected.'}
  ]
});

out += cond('stroke-aph', {
  epidemiology: 'Aphasia affects ~30% of acute stroke survivors; persistent aphasia at 6 months affects ~250,000 new patients per year in the US.',
  neuroBasis: 'Post-stroke aphasia involves left perisylvian damage with compensatory right hemisphere activation; LF-TMS to right inferior frontal gyrus (F8) suppresses maladaptive right hemispheric dominance, promoting left hemisphere recovery.',
  responseData: 'Evidence level B; LF-TMS to right hemisphere with concurrent speech therapy: significant improvement in naming and fluency in RCTs (Naeser 2010, Barwood 2012).',
  patientExplain: 'After a stroke affects the speech area, the brain\'s right side can over-compensate in an unhelpful way; brain stimulation quiets this over-compensation, helping the damaged speech area recover.',
  timeline: 'Language improvements may begin within 2 weeks; 10-20 sessions concurrent with speech and language therapy (SLT); SLT must be concurrent for meaningful language gains.',
  selfCare: ['Attend all speech and language therapy sessions - TMS without SLT concurrent produces minimal language improvement', 'Practice speech exercises between sessions using your SLT home programme', 'Use communication aids (letter boards, apps) to reduce frustration during recovery'],
  escalation: 'Escalate if seizure occurs, new language regression emerges suddenly, or significant mood deterioration (aphasia-related depression is common).',
  homeNote: null,
  techSetup: 'Right inferior frontal gyrus (F8 area); LF 1 Hz inhibitory; 900 pulses/session; SLT session should follow TMS within 30 minutes while cortical plasticity window is open; document language scoring at baseline and every 5 sessions.',
  faq: [
    {q:'Will my speech return to normal?',a:'Recovery varies enormously; many patients achieve significant functional communication improvement even if full pre-stroke language does not return.'},
    {q:'Why stimulate the right side if my stroke was on the left?',a:'After a left-sided stroke, the right hemisphere can over-activate and actually interfere with left-side recovery; calming it helps the damaged side recover better.'},
    {q:'How long should I continue speech therapy?',a:'Speech therapy benefits continue for months to years post-stroke; TMS is one component of a longer-term rehabilitation programme.'}
  ]
});

out += cond('tbi', {
  epidemiology: 'TBI affects ~69 million people per year globally; leading cause of death and disability in adults under 45; cognitive and mood sequelae persist in ~50% beyond 12 months.',
  neuroBasis: 'TBI causes diffuse axonal injury and disrupted frontoparietal network connectivity; low-intensity TMS and tDCS applied to prefrontal regions support neuroplasticity and network reconnection during recovery.',
  responseData: 'Evidence level B; TMS and tDCS for TBI: improvements in attention, working memory, and depression in trials; metal fragment contraindication mandatory screen before initiation.',
  patientExplain: 'A brain injury disrupts connections between brain regions; gentle brain stimulation supports the brain\'s natural healing and reconnection process, improving cognitive symptoms and mood.',
  timeline: 'TMS introduced at sub-acute to chronic phase (>3 months post-TBI); 20 sessions initial course; cognitive improvements often gradual and cumulative.',
  selfCare: ['Follow cognitive load guidelines from your neuropsychologist - avoiding cognitive overload during recovery is essential', 'Sleep consistently - sleep is the primary window for TBI brain repair', 'Use compensatory cognitive strategies (notebooks, calendar apps, alarms) recommended by your neuropsychologist'],
  escalation: 'Escalate immediately if headaches worsen significantly during a course, seizure activity emerges, or new cognitive or behavioural regression occurs.',
  homeNote: null,
  techSetup: 'Metal fragment screen MANDATORY (skull X-ray if any doubt); low-intensity TMS preferred (80-90% MT); bilateral F3/F4 or frontoparietal approach; cognitive test (MoCA) at baseline and mid-course.',
  faq: [
    {q:'Is TMS safe after a brain injury?',a:'Yes, with appropriate safety screening including metal fragment exclusion; low-intensity protocols are used for added safety in TBI.'},
    {q:'Will TMS fix my brain injury?',a:'TMS supports neuroplasticity and recovery; the brain has significant capacity for compensation and repair which TMS helps facilitate.'},
    {q:'How long does TBI recovery take?',a:'Recovery continues for years post-TBI; the most rapid improvements occur in the first 2 years but meaningful gains are possible much later.'}
  ]
});

out += cond('alzheimer', {
  epidemiology: 'Alzheimer\'s disease affects ~55 million people globally; leading cause of dementia; estimated to triple by 2050 with aging populations.',
  neuroBasis: 'Alzheimer\'s involves progressive disruption of posterior cortical networks, hippocampal-prefrontal connectivity, and default mode network (DMN); TMS to bilateral DLPFC and parietal cortex targets cognitive-reserve circuits.',
  responseData: 'Evidence level B; bilateral DLPFC TMS: improvements in cognitive function (ADAS-Cog, MMSE) in several RCTs (Rabey 2013, Bentwich 2011); TPS (NEUROLITH) showing emerging evidence; effects are modest and require maintenance.',
  patientExplain: 'Alzheimer\'s disease gradually affects memory and thinking by disrupting connections in the brain; brain stimulation supports the remaining healthy connections and may slow cognitive decline.',
  timeline: 'Cognitive improvements may appear from sessions 10-20; 30 sessions initial course; maintenance sessions (monthly) are important to sustain benefits.',
  selfCare: ['Engage in mentally stimulating activities daily (reading, puzzles, social engagement) - the most evidence-based cognitive reserve strategy', 'Physical exercise 3-5x/week has the strongest evidence base for slowing Alzheimer\'s progression', 'Mediterranean diet is associated with reduced cognitive decline and supports brain health'],
  escalation: 'Escalate if behavioural symptoms (agitation, wandering) worsen, safety at home is compromised, or caregiver distress reaches crisis level.',
  homeNote: null,
  techSetup: 'Bilateral DLPFC (F3/F4) and parietal targets; MoCA at baseline and every 5 sessions; caregiver present at sessions is helpful for safety monitoring; confirm no cardiac device or metal implants.',
  faq: [
    {q:'Can TMS reverse Alzheimer\'s disease?',a:'TMS cannot reverse existing neurodegeneration but may slow decline and improve daily function by supporting remaining brain circuits.'},
    {q:'Should family members be involved in treatment?',a:'Yes; carer involvement is encouraged - they can provide valuable observations about day-to-day function and safety.'},
    {q:'Are there any medications that should not be taken with TMS?',a:'Continue all prescribed medications; your clinician will review any potential interactions at the assessment appointment.'}
  ]
});

out += cond('vasc-dem', {
  epidemiology: 'Vascular dementia is the second most common dementia type (~20-30% of all dementia); caused by cerebrovascular disease; strong overlap with Alzheimer\'s disease (mixed dementia).',
  neuroBasis: 'Vascular dementia involves focal and multi-focal ischaemic damage to white matter and cortical circuits; tDCS and TMS target residual functional prefrontal networks to support cognitive compensation.',
  responseData: 'Evidence level C; extrapolated from Alzheimer\'s evidence and stroke rehabilitation; cardiac check mandatory given high cardiovascular comorbidity in vascular dementia.',
  patientExplain: 'Vascular dementia is caused by reduced blood flow to the brain; brain stimulation supports the remaining healthy brain circuits to improve thinking and daily functioning.',
  timeline: 'Response in vascular dementia may be slower than Alzheimer\'s due to focal lesion patterns; 20-30 sessions initial course; cardiovascular risk management concurrent is essential.',
  selfCare: ['Manage blood pressure, cholesterol, and blood sugar consistently - preventing further vascular events is the most important long-term strategy', 'Physical exercise supports both cardiovascular health and brain reserve', 'Cognitive stimulation activities and social engagement slow functional decline'],
  escalation: 'Escalate if new stroke symptoms occur (FAST criteria: Face drooping, Arm weakness, Speech difficulty, Time to call emergency services), cardiac arrhythmia is detected, or rapid cognitive deterioration occurs.',
  homeNote: null,
  techSetup: 'Cardiac clearance required before initiation (high cardiovascular comorbidity); tDCS bilateral prefrontal; start at 1 mA with gradual titration; MoCA baseline and monitoring; document vascular risk factor management status.',
  faq: [
    {q:'How is vascular dementia different from Alzheimer\'s?',a:'Vascular dementia is caused by reduced blood flow (often from strokes or small vessel disease) while Alzheimer\'s is caused by protein accumulation; many people have both.'},
    {q:'Will managing my blood pressure help my memory?',a:'Yes; blood pressure control is one of the most important treatments for preventing further vascular dementia progression.'},
    {q:'Is TMS safe if I have had a stroke?',a:'Yes; TMS is safe after stroke with appropriate neurological assessment and metal implant screening.'}
  ]
});

out += cond('parkinsons', {
  epidemiology: 'Parkinson\'s disease affects ~10 million people globally; the second most common neurodegenerative condition; prevalence doubling by 2040.',
  neuroBasis: 'Parkinson\'s involves degeneration of substantia nigra dopaminergic neurons with resulting basal ganglia-motor cortex circuit disruption; DBS (FDA-cleared) restores circuit function; TMS adjunct targets motor cortex and SMA for motor and mood symptoms.',
  responseData: 'DBS evidence level A (FDA-cleared) for motor symptoms; TMS adjunct: improvements in tremor, rigidity, and gait in several trials; rTMS to M1/SMA also improves depression in PD (comorbidity in 40%).',
  patientExplain: 'Parkinson\'s disease affects brain circuits controlling movement and mood; brain stimulation can help reduce tremor, stiffness, and low mood as part of a comprehensive management plan.',
  timeline: 'TMS adjunct course of 10-20 sessions; DBS requires neurosurgical referral and is a separate pathway; rTMS for PD depression follows standard antidepressant TMS course length.',
  selfCare: ['Take levodopa and other medications at exactly prescribed times - timing consistency significantly affects motor performance', 'Engage in regular exercise (cycling, tai chi, boxing) which has the strongest evidence for slowing PD motor progression', 'Work with your physiotherapist on gait and fall prevention strategies'],
  escalation: 'Escalate if DBS device malfunction is suspected (sudden motor deterioration), implant infection signs occur, or medication-related psychosis emerges.',
  homeNote: null,
  techSetup: 'Check for existing DBS device before any TMS (potential DBS-TMS interaction - consult device manufacturer guidelines); M1 and SMA targets for motor symptoms; L-DLPFC HF for depression comorbidity; document UPDRS at baseline.',
  faq: [
    {q:'Can I have TMS if I already have a DBS device?',a:'You must inform your clinician and the TMS team about your DBS device before any session; special precautions are required and manufacturer guidelines must be followed.'},
    {q:'Will TMS cure my Parkinson\'s?',a:'TMS is not a cure but can provide meaningful symptom relief for motor and mood symptoms as part of a comprehensive management plan.'},
    {q:'Is exercise really that important?',a:'Yes; regular aerobic exercise, particularly cycling and boxing, is the most evidence-based intervention for slowing Parkinson\'s motor symptom progression.'}
  ]
});

out += cond('ms', {
  epidemiology: 'Multiple sclerosis affects ~2.8 million people globally; typically diagnosed ages 20-40; characterised by demyelinating lesions causing relapsing or progressive neurological deficits.',
  neuroBasis: 'MS involves focal demyelination and diffuse neuroinflammation disrupting corticospinal and corticocortical tracts; TMS to M1 targets residual motor circuit plasticity; tDCS may support cognition via diffuse network modulation.',
  responseData: 'Evidence level B; TMS for MS spasticity and fatigue: significant improvement in several RCTs; motor cortex excitability changes are biomarkers of disease state and TMS response.',
  patientExplain: 'MS affects the brain\'s electrical wiring by stripping insulation from nerve fibres; brain stimulation supports the brain\'s ability to reroute signals around damaged areas.',
  timeline: 'TMS course of 10-20 sessions for spasticity or fatigue; effect duration variable; maintenance courses appropriate during stable disease phases (not during active relapse).',
  selfCare: ['Never start TMS during an acute MS relapse - wait for neurological stability', 'Monitor fatigue levels daily and adjust activity accordingly (energy conservation strategies)', 'Heat sensitivity is common in MS - keep session room cool and report any symptom worsening during sessions'],
  escalation: 'Escalate if new neurological deficit emerges during TMS course (possible relapse), heat-related symptom exacerbation occurs, or fatigue deteriorates significantly.',
  homeNote: null,
  techSetup: 'Do not treat during active MS relapse; M1 (C3/C4) or bilateral approach; keep session room cool (MS patients are sensitive to heat); document EQ-5D and fatigue scores at baseline and monthly.',
  faq: [
    {q:'Is TMS safe during a relapse?',a:'No; TMS should not be performed during an active MS relapse; treatment resumes once neurological stability is confirmed.'},
    {q:'Will TMS slow my MS?',a:'TMS does not modify the underlying MS disease process but can improve specific symptoms such as spasticity, fatigue, and mood.'},
    {q:'Can I have TMS if I am on disease-modifying therapy?',a:'Yes; TMS is compatible with disease-modifying MS therapies; continue all medications as prescribed.'}
  ]
});

out += cond('epilepsy', {
  epidemiology: 'Epilepsy affects ~50 million people globally; ~30% have drug-resistant epilepsy (DRE) uncontrolled with medications; DRE carries high mortality and morbidity.',
  neuroBasis: 'Drug-resistant epilepsy involves persistent hyperexcitable focal or network seizure circuits; taVNS activates vagal afferents to suppress seizure activity via NTS-thalamic-cortical inhibitory pathways; DBS to ANT is FDA-cleared for DRE.',
  responseData: 'taVNS FDA-cleared for DRE: ~30-40% seizure frequency reduction in pivotal trials; DBS ANT: ~50-75% seizure reduction in SANTE trial; LF-TMS to seizure focus: emerging evidence for focal DRE.',
  patientExplain: 'Drug-resistant epilepsy means standard medications have not fully controlled your seizures; brain stimulation works through a different pathway to reduce seizure activity without adding more medications.',
  timeline: 'taVNS requires 3-6 months of consistent use (2 hours on, 4 hours off daily cycle) before full benefit assessment; DBS is a surgical procedure with a separate pathway.',
  selfCare: ['Use taVNS device exactly as prescribed - consistent daily use is essential for seizure reduction benefit', 'Maintain a detailed seizure diary; share it with your neurologist at every appointment', 'Avoid known seizure triggers (sleep deprivation, alcohol, stress) consistently throughout treatment'],
  escalation: 'Escalate if seizure frequency increases, seizure duration lengthens, or status epilepticus risk emerges; ensure patient and carers know emergency seizure management plan.',
  homeNote: 'taVNS device (NEMOS/tVNS) is a home-based device requiring daily self-application; ear electrode training session essential before home use begins.',
  techSetup: 'taVNS device training session; left auricular electrode (cymba conchae); 25 Hz, 0.2 ms pulse width, sensory threshold intensity; 2 hours on/4 hours off cycle; seizure diary review at every clinic visit.',
  faq: [
    {q:'Is taVNS the same as the surgical VNS?',a:'No; taVNS stimulates the auricular (ear) branch of the vagus nerve non-invasively while surgical VNS requires an implanted device; taVNS is a non-surgical alternative.'},
    {q:'Can I drive while using taVNS?',a:'Driving restrictions depend on your seizure control status and are governed by your local driving authority regulations - your neurologist will advise.'},
    {q:'How do I know if taVNS is working?',a:'Seizure diary data is the primary outcome measure; reduction in seizure frequency of >=30% is considered a meaningful response.'}
  ]
});

out += cond('essential-t', {
  epidemiology: 'Essential tremor affects ~5% of adults over 65; the most common movement disorder; characterised by action tremor of hands, head, and voice.',
  neuroBasis: 'Essential tremor involves cerebellar-thalamo-cortical circuit oscillation (Vim nucleus); DBS to Vim is FDA-cleared; MRI-guided focused ultrasound (MRgFUS) ablates the Vim; TMS modulates tremor circuits non-invasively.',
  responseData: 'DBS and MRgFUS (FUS) provide the strongest evidence for essential tremor (>70% tremor reduction); TMS evidence level B as non-surgical option; rTMS to cerebellum and M1 provides modest tremor reduction.',
  patientExplain: 'Essential tremor is caused by abnormal oscillating signals in a brain circuit controlling movement; brain stimulation can calm this oscillation, reducing the tremor.',
  timeline: 'TMS for tremor: 10-20 sessions initial course; DBS/FUS are separate surgical/procedural pathways requiring specialist referral; discuss all options with your neurologist.',
  selfCare: ['Avoid caffeine and alcohol on assessment days to get accurate tremor ratings', 'Adaptive equipment (weighted utensils, special cups) significantly improves daily function while treatment proceeds', 'Inform your clinician of all medications as several drugs can both worsen and improve tremor'],
  escalation: 'Escalate if DBS implant complication signs emerge (infection, device malfunction), tremor severity prevents safe self-care, or new neurological symptoms develop.',
  homeNote: null,
  techSetup: 'Cerebellum (Iz area) and M1 (Cz) targets; LF 1 Hz primary approach; confirm DBS device absence before TMS; document tremor severity scale at baseline and every 5 sessions.',
  faq: [
    {q:'Should I consider DBS or focused ultrasound?',a:'DBS and MRgFUS provide much stronger tremor reduction than TMS; your neurologist will guide this discussion based on severity and suitability.'},
    {q:'Is essential tremor the same as Parkinson\'s tremor?',a:'No; essential tremor is a separate condition primarily causing action tremor, while Parkinson\'s tremor occurs at rest - they are treated differently.'},
    {q:'Will TMS stop my tremor completely?',a:'TMS provides modest tremor reduction and is generally not as powerful as surgical options; it is used when surgery is not appropriate or preferred.'}
  ]
});

out += cond('dystonia', {
  epidemiology: 'Dystonia affects ~1-2% of the population; characterised by involuntary muscle contractions causing repetitive movements or abnormal postures.',
  neuroBasis: 'Dystonia involves basal ganglia dysfunction and abnormal surround inhibition of M1; DBS to GPi is FDA-cleared for generalised dystonia; TMS modulates cortical excitability as a non-surgical adjunct.',
  responseData: 'Evidence level C for TMS in dystonia; DBS GPi provides strongest evidence (FDA-cleared) for generalised dystonia; TMS to SMA and M1 shows modest benefit as an adjunct.',
  patientExplain: 'Dystonia is caused by abnormal signals in brain circuits controlling movement; brain stimulation aims to retune these circuits, reducing involuntary contractions.',
  timeline: 'TMS for dystonia: 20 sessions initial; DBS requires neurosurgical referral and is a separate pathway; botulinum toxin injections are first-line for focal dystonia.',
  selfCare: ['Work with your physiotherapist on sensory trick techniques (geste antagoniste) to temporarily relieve dystonic postures', 'Fatigue and stress worsen dystonia - include rest periods in daily planning', 'Occupational therapy for adaptive strategies to maintain function in affected body areas'],
  escalation: 'Escalate if DBS device malfunction is suspected, swallowing is affected (oromandibular dystonia emergency), or falls risk increases due to gait dystonia.',
  homeNote: null,
  techSetup: 'Check for existing DBS device before TMS; M1 (C3/C4) and SMA (Cz) targets; LF 1 Hz primary approach; coordinate with movement disorder specialist; document dystonia severity scale at baseline.',
  faq: [
    {q:'Is TMS as effective as botulinum toxin for dystonia?',a:'Botulinum toxin remains first-line for focal dystonia; TMS is used as an adjunct or when toxin is not suitable.'},
    {q:'What is a sensory trick?',a:'A sensory trick (geste antagoniste) is a touch or movement that temporarily reduces dystonic muscle contractions - your physiotherapist can help identify yours.'},
    {q:'Is DBS suitable for my dystonia?',a:'DBS is most suitable for generalised or segmental dystonia that has not responded to other treatments; your movement disorder specialist will advise on eligibility.'}
  ]
});

// ── OTHER ─────────────────────────────────────────────────────────────────────

out += cond('tourette', {
  epidemiology: 'Tourette syndrome affects ~1% of school-age children; characterised by multiple motor and vocal tics; onset typically 5-7 years; often improves in adulthood.',
  neuroBasis: 'Tourette syndrome involves hyperactivity of cortico-striato-thalamo-cortical (CSTC) loops driving involuntary tic sequences; TMS to SMA suppresses excessive motor preparation signals.',
  responseData: 'Evidence level C; SMA TMS for tic reduction: small trial positive results; TMS is used as adjunct to behavioural therapy (CBIT) when pharmacological treatment is insufficient.',
  patientExplain: 'Tourette syndrome involves the brain sending automatic movement and sound signals involuntarily; brain stimulation calms the overactive motor preparation area that generates these tics.',
  timeline: 'Tic reduction over 20 sessions; CBIT (Comprehensive Behavioral Intervention for Tics) concurrent strongly recommended; tic frequency/severity diary essential.',
  selfCare: ['Practise CBIT competing response strategies as prescribed by your therapist', 'Stress management is particularly important as stress is a major tic trigger', 'Educate family and school/work about Tourette syndrome to reduce shame and social pressure that worsen tics'],
  escalation: 'Escalate if OCD or ADHD comorbidities (common in Tourette) worsen, self-injurious tics emerge, or social and educational impact becomes severe.',
  homeNote: null,
  techSetup: 'SMA target (Cz, FCz); LF 1 Hz inhibitory; document tic frequency and YGTSS score at each session; CBIT therapist coordination essential.',
  faq: [
    {q:'Will my tics get worse before they get better?',a:'TMS does not typically cause tic worsening; some fluctuation is normal, but consistent worsening should be reported immediately.'},
    {q:'Will Tourette syndrome go away on its own?',a:'Many people experience significant improvement in tics in late adolescence and early adulthood; TMS and CBIT support tic management in the meantime.'},
    {q:'Is Tourette syndrome linked to OCD and ADHD?',a:'Yes; approximately 50-60% of people with Tourette syndrome have comorbid OCD and/or ADHD; your clinician will assess and address these if present.'}
  ]
});

out += cond('long-covid', {
  epidemiology: 'Long COVID affects ~10-20% of people post-acute SARS-CoV-2 infection; characterised by persistent fatigue, cognitive impairment (brain fog), and dysautonomia.',
  neuroBasis: 'Long COVID cognitive symptoms involve neuroinflammation, microglial activation, and prefrontal-hippocampal connectivity disruption; tDCS and TMS to bilateral DLPFC target cognitive fatigue and attention circuits.',
  responseData: 'Evidence level C; emerging data from small trials; tDCS bilateral DLPFC showing improvement in cognitive fatigue and attention in post-COVID cohorts; neurological recovery continues for 12-24 months in most patients.',
  patientExplain: 'Long COVID brain fog involves persistent inflammation affecting the brain\'s attention and memory circuits; gentle brain stimulation supports these circuits\' recovery.',
  timeline: 'tDCS course of 20 sessions with gradual intensity titration; cognitive improvements often slow and cumulative over 6-12 months; pacing strategies essential.',
  selfCare: ['Implement post-exertional malaise management - avoid over-exertion and pace activity carefully using heart rate monitoring', 'Prioritise sleep; disrupted sleep dramatically worsens long COVID cognitive symptoms', 'Cognitive pacing (strategic mental activity scheduling with rest intervals) is the most evidence-based cognitive fatigue management strategy'],
  escalation: 'Escalate if post-exertional malaise worsens after sessions, cardiovascular symptoms emerge (POTS-like), or depression secondary to long COVID disability develops.',
  homeNote: null,
  techSetup: 'Low-intensity tDCS start (1 mA); bilateral F3/F4; monitor for post-exertional symptom worsening after each session; document cognitive fatigue scale at each visit.',
  faq: [
    {q:'Will TMS cure my long COVID?',a:'TMS supports brain recovery; the underlying long COVID process requires time and multi-system management; TMS targets the cognitive brain circuit component.'},
    {q:'Is it normal to feel more tired after sessions?',a:'Some fatigue after sessions is common, especially in long COVID; if persistent worsening occurs, session intensity or frequency will be adjusted.'},
    {q:'How long will long COVID last?',a:'Most patients with long COVID show gradual improvement over 12-24 months; early intervention and careful management improve trajectory.'}
  ]
});

out += cond('fnd', {
  epidemiology: 'Functional Neurological Disorder (FND) affects ~5-16 per 100,000 per year; the second most common neurological outpatient diagnosis; includes functional tremor, weakness, and seizures.',
  neuroBasis: 'FND involves altered predictive processing in motor control circuits and disconnection between intention and movement; TMS to M1 and SMA provides non-specific neurobiological reinforcement of normal motor circuit function.',
  responseData: 'Evidence level C; small TMS trials in FND showing motor symptom improvement when combined with physiotherapy; psychological therapy (physiotherapy-led) is the primary evidence-based treatment.',
  patientExplain: 'Functional neurological disorder is a genuine brain condition where the software controlling movement is disrupted rather than the hardware being damaged; brain stimulation can help reset these control signals.',
  timeline: 'TMS as adjunct to physiotherapy; 15-20 sessions; psychoeducation that FND is real, treatable, and not caused by psychological weakness is essential before and during treatment.',
  selfCare: ['Understand that FND is a real condition involving genuine brain circuit disruption - it is not feigned or "all in your head"', 'Physiotherapy is the primary evidence-based treatment; TMS enhances physiotherapy outcomes', 'Avoid over-reassurance-seeking and illness-focus behaviours that can inadvertently maintain FND symptoms'],
  escalation: 'Escalate if non-epileptic attacks (functional seizures) increase in frequency, or if patient is distressed by the FND diagnosis.',
  homeNote: null,
  techSetup: 'M1 and SMA targets; psychoeducation about FND nature essential before first session; coordinate closely with FND-specialist physiotherapist; avoid framing TMS as a "cure" which can be counterproductive in FND.',
  faq: [
    {q:'Is FND the same as being stressed or anxious?',a:'No; FND is a specific neurological condition with distinct brain circuit features; although stress can contribute as a trigger, it is not simply a psychological condition.'},
    {q:'Will TMS fix my functional symptoms?',a:'TMS is an adjunct to physiotherapy and psychoeducation; meaningful improvement is achievable but requires active engagement with the full treatment programme.'},
    {q:'Why does no one seem to know what FND is?',a:'FND is a relatively recently characterised condition; medical understanding has advanced significantly in recent years and specialist FND clinics are increasingly available.'}
  ]
});

out += cond('bpd-psy', {
  epidemiology: 'Borderline Personality Disorder affects ~1-2% of the population; characterised by emotional dysregulation, unstable relationships, impulsivity, and identity disturbance.',
  neuroBasis: 'BPD involves amygdala hyperreactivity and deficient prefrontal inhibitory control; bilateral DLPFC TMS targets emotional dysregulation circuits by enhancing PFC-amygdala top-down regulation.',
  responseData: 'Evidence level C; limited TMS RCT data for BPD specifically; TMS for comorbid depression in BPD has level B evidence; combined with DBT gives most complete treatment.',
  patientExplain: 'BPD involves a brain that is highly sensitive to emotions and struggles with the brakes on emotional reactions; brain stimulation strengthens those emotional brakes alongside therapy.',
  timeline: 'TMS most relevant for comorbid depression component in BPD; 20-30 sessions; DBT (Dialectical Behaviour Therapy) is the primary evidence-based treatment and must run concurrently.',
  selfCare: ['Attend all DBT sessions - DBT is the primary treatment for BPD and TMS is an adjunct', 'Use your distress tolerance skills from DBT between sessions; note which work best for you', 'Use the mood diary consistently to identify emotional triggers and patterns'],
  escalation: 'Escalate if active suicidality with intent or plan emerges, self-harm escalates in severity, or dissociation occurs during sessions.',
  homeNote: null,
  techSetup: 'Bilateral DLPFC (F3/F4); document PHQ-9 and GAD-7 at each session; coordinate with DBT therapist; safety plan confirmed at every visit given suicide risk in BPD.',
  faq: [
    {q:'Can TMS treat BPD itself?',a:'TMS primarily helps with the depression component of BPD; DBT is the primary treatment for the core BPD features.'},
    {q:'Is BPD a character flaw?',a:'No; BPD is a well-characterised neurobiological condition involving measurable brain circuit differences, often with roots in early life adversity.'},
    {q:'Will TMS help with emotional outbursts?',a:'TMS may reduce the frequency and intensity of emotional dysregulation as it strengthens prefrontal control circuits; this works best in combination with DBT skills.'}
  ]
});

// ── PROTOCOL HANDBOOKS ────────────────────────────────────────────────────────

const PROTOCOLS = {
  'tms-mdd-dlpfc-hf': {
    name: 'L-DLPFC HF-TMS for MDD',
    modality: 'TMS/rTMS', condition: 'MDD', target: 'F3 (L-DLPFC)',
    setup: [
      'Obtain written informed consent for TMS treatment.',
      'Determine motor threshold (MT): place figure-8 coil over M1 (C3), increase pulse intensity in 5% steps until visible APB contraction in >5/10 trials; record as resting MT (rMT).',
      'Measure 5.5 cm anterior to the motor hotspot along a parasagittal line to locate L-DLPFC (F3).',
      'Mark the target site with washable marker; photograph for reproducibility across sessions.',
      'Set treatment parameters: 10 Hz, 4-second trains, 26-second inter-train interval, 120% rMT, 3000 total pulses per session.',
      'Document MT and coil angle in session log before proceeding.'
    ],
    sessionWorkflow: [
      'Patient seated comfortably in reclining chair; remove metal items from head area.',
      'Reposition coil to marked F3 site; confirm handle angle (typically 45 degrees from midline).',
      'Confirm MT from prior session; remeasure if >1 week gap or clinical change.',
      'Begin treatment at 120% rMT; monitor patient response during first train.',
      'Complete 75 trains of 40 pulses each (3000 total pulses, ~37 minutes).',
      'Post-session: document tolerability (VAS 0-10), headache, and mood rating; complete session log.',
      'Administer PHQ-9 weekly (every session 5).',
      'Schedule next session within 24 hours for 5-day/week protocol.'
    ],
    contraindications: [
      'Metal in skull (cochlear implant, DBS, aneurysm clip, surgical staples near target)',
      'History of seizure or epilepsy (relative - requires neurologist clearance)',
      'Cardiac pacemaker or implantable cardiac device',
      'Active psychosis or manic episode',
      'Pregnancy (relative - risk-benefit discussion required)',
      'Brain tumour or significant structural abnormality near target site',
      'Increased intracranial pressure'
    ],
    expectedResponse: 'Response (>=50% PHQ-9 reduction) expected in 50-60% of patients; remission (PHQ-9 <5) in 30-35%; onset typically session 10-15; full assessment at session 30. Absence of any response signal (PHQ-9 movement) by session 15 warrants protocol review.',
    monitoring: 'PHQ-9 at every 5th session; CGI-S/I weekly; tolerability VAS after each session; MT reassessment every 2 weeks or after >1 week gap; adverse event log at every session; suicidality screening at every session.',
    followUp: 'Review 4 weeks post-course; consider 6-session maintenance course at 1 month if partial response; booster course at first sign of relapse; home tDCS maintenance prescription if appropriate; psychotherapy referral if not already in place.'
  },

  'tms-mdd-itbs': {
    name: 'iTBS (Intermittent Theta-Burst Stimulation) for MDD',
    modality: 'iTBS', condition: 'MDD / TRD', target: 'F3 (L-DLPFC)',
    setup: [
      'Obtain informed consent; explain that iTBS sessions are shorter than conventional TMS (3 min vs 37 min).',
      'Determine active motor threshold (aMT): burst of 3 pulses at 50 Hz during voluntary contraction; identify minimum intensity producing consistent motor response; document aMT.',
      'Locate L-DLPFC at F3 using 10-20 method or 5.5 cm anterior to motor hotspot.',
      'Set parameters: 80% aMT, burst pattern (3 pulses at 50 Hz, 200 ms inter-burst at 5 Hz), 2-second trains, 8-second inter-train intervals, 600 total pulses per session.',
      'For accelerated protocols (SAINT-style): 10 sessions per day over 5 days; MRI-guided targeting preferred.'
    ],
    sessionWorkflow: [
      'Standard single iTBS session: patient seated; coil positioned at F3 at previously documented angle.',
      'Confirm aMT (remeasure if >1 week gap).',
      'Deliver 600 pulses in approximately 3 minutes and 9 seconds.',
      'Post-session: document tolerability and mood rating; complete session log.',
      'For accelerated protocol: ensure minimum 50-minute gap between daily sessions; schedule 10 sessions across the day (08:00, 09:00, 10:00, 11:00, 12:30, 13:30, 14:30, 15:30, 16:30, 17:00).',
      'Monitor for headache (most common side effect with high-density accelerated protocols).',
      'PHQ-9 at baseline and post-course (daily monitoring in accelerated protocol).'
    ],
    contraindications: [
      'All standard TMS contraindications apply.',
      'For accelerated SAINT protocol: cardiac conditions requiring clearance; MRI eligibility required for neuronavigated version.',
      'History of seizure - higher cumulative dose in accelerated protocols requires neurologist clearance.'
    ],
    expectedResponse: 'iTBS non-inferior to conventional 10 Hz TMS for MDD (Blumberger 2018); SAINT accelerated protocol: 79% remission in small trial (Cole 2020); standard iTBS course: 50-60% response at 20 sessions. Faster onset possible with accelerated protocols.',
    monitoring: 'PHQ-9 every 5 sessions (standard) or daily (accelerated); aMT at each session; headache and tolerability VAS; suicidality screening every session; monitoring intensity increased in accelerated protocols due to higher cumulative dose.',
    followUp: 'Same as standard TMS for MDD; accelerated protocol may require earlier post-course review (1-2 weeks) due to rapid response trajectory; booster single iTBS sessions can be used for maintenance.'
  },

  'tms-trd-bilateral': {
    name: 'Bilateral TMS for Treatment-Resistant Depression',
    modality: 'TMS/rTMS', condition: 'TRD', target: 'F3 (L-DLPFC) + F4 (R-DLPFC)',
    setup: [
      'Independent MT determination for each hemisphere: L-DLPFC hotspot via right APB (C3 coil position); R-DLPFC hotspot via left APB (C4 coil position); document both MTs.',
      'Typical bilateral sequence: HF-TMS left DLPFC (10 Hz, 120% MT, 1500 pulses) followed immediately by LF-TMS right DLPFC (1 Hz, 110% MT, 1200 pulses).',
      'Session duration approximately 40-50 minutes; coil repositioning between hemispheres required.',
      'Mark both target sites; photograph for reproducibility.'
    ],
    sessionWorkflow: [
      'Seat patient; position coil at L-DLPFC (F3); confirm MT.',
      'Deliver HF-TMS left DLPFC (1500 pulses, 10 Hz, 120% MT).',
      'Reposition coil to R-DLPFC (F4); confirm MT.',
      'Deliver LF-TMS right DLPFC (1200 pulses, 1 Hz, 110% MT).',
      'Post-session tolerability and mood documentation.',
      'PHQ-9 and MADRS every 5 sessions.',
      'Monitor for mood switching (bipolar history screen mandatory before first session).'
    ],
    contraindications: [
      'All standard TMS contraindications apply.',
      'Active bipolar mania (not bipolar depression - discuss with psychiatrist).',
      'Prior mania induced by antidepressant or TMS (requires careful monitoring if TMS is indicated).',
      'Active psychosis.'
    ],
    expectedResponse: 'Bilateral TMS for TRD: ~45-55% response; superior to unilateral for severe/melancholic depression in some studies; response assessment at session 20 and session 36. For non-responders at 36 sessions, consider ECT referral.',
    monitoring: 'PHQ-9 and MADRS every 5 sessions; CGI weekly; full suicidality screen every session; monitor for bipolar switching (sudden elation, decreased sleep need, grandiosity); document both L and R MT at each session.',
    followUp: 'Review 4-6 weeks post-course; booster course at first sign of relapse; ECT referral if two full TMS courses (including bilateral) fail to produce response; antidepressant augmentation review with psychiatrist.'
  },

  'tms-ocd-sma': {
    name: 'BrainsWay H7 Deep TMS for OCD',
    modality: 'Deep TMS (H7 coil)', condition: 'OCD', target: 'SMA / ACC',
    setup: [
      'Patient must hold DSM-5 OCD diagnosis confirmed by licensed clinician; Y-BOCS score >=20 (moderate-severe).',
      'Obtain specific deep TMS consent explaining H7 coil differences from standard TMS.',
      'Determine MT using H7 coil in standard protocol; document deep TMS MT separately from any prior standard TMS MT.',
      'Prepare personalised symptom provocation script: identify patient\'s primary obsession/compulsion theme; create 2-minute imagery script or select provocation object.',
      'Set parameters: 20 Hz, 2-second trains, 20-second inter-train intervals, 120% MT, 1800 total pulses per session.',
      'Session duration approximately 20 minutes of stimulation.'
    ],
    sessionWorkflow: [
      'Administer Y-BOCS before each session.',
      'Administer personalised symptom provocation 30 minutes before TMS: present imagery script or provocation object; confirm anxiety VAS elevation (target: patient reports anxiety >4/10).',
      'Patient seated in H7 coil helmet device; confirm fit.',
      'Deliver 1800 pulses per 20 Hz protocol.',
      'Post-session: document anxiety VAS, tolerability, and any AEs.',
      'Anxiety VAS should return toward baseline within 30 minutes post-session; do not discharge patient if still highly anxious.',
      'Sessions 5 times per week for approximately 6 weeks (29 sessions FDA-cleared protocol).'
    ],
    contraindications: [
      'All standard TMS contraindications apply.',
      'Active psychotic episode.',
      'Significant cognitive impairment affecting ability to participate in provocation protocol.',
      'Y-BOCS <16 (mild OCD; evidence base is for moderate-severe).',
      'Active suicidality requiring immediate intervention.'
    ],
    expectedResponse: 'Pivotal RCT (Carmi 2019): 38% responder rate (Y-BOCS reduction >=30%) vs 11% sham at 6-week endpoint; response often continues improving post-course; ERP therapy concurrent markedly enhances and sustains outcomes.',
    monitoring: 'Y-BOCS at every session; anxiety VAS before provocation, after provocation, and after TMS; PHQ-9 every 5 sessions (depression frequent OCD comorbidity); tolerability VAS; AE log.',
    followUp: 'Y-BOCS at 4 and 12 weeks post-course; booster sessions (1x/week for 4 weeks) appropriate for partial responders; ERP therapy should continue independently of TMS course; assess need for second course at 12-week review.'
  },

  'tms-ptsd-dlpfc': {
    name: 'DLPFC TMS for PTSD',
    modality: 'TMS/rTMS', condition: 'PTSD', target: 'F3/F4 (Bilateral DLPFC)',
    setup: [
      'Trauma-informed consent process: explain procedure, patient controls session termination at any time, no trauma content required during sessions.',
      'PCL-5 and CAPS-5 (if available) at baseline.',
      'Determine MT at L-DLPFC standard method.',
      'Protocol: L-DLPFC HF-TMS (10 Hz, 120% MT, 1500-2000 pulses) primary; some protocols add R-DLPFC LF (1 Hz, 110% MT, 600 pulses) bilateral approach.',
      'Session environment: patient controls room entry/exit; no sudden sounds; grounding materials available (blanket, squeeze object).'
    ],
    sessionWorkflow: [
      'Pre-session check: confirm patient safety (no active suicidality) and brief grounding exercise.',
      'Patient seated; coil positioned; trauma-informed briefing before first stimulus.',
      'Deliver L-DLPFC HF protocol; monitor for dissociative responses during session.',
      'If patient signals distress: pause immediately; provide grounding before deciding whether to resume.',
      'Post-session: brief grounding check-in; confirm patient is oriented and safe before discharge.',
      'PCL-5 every 5 sessions; PHQ-9 every 5 sessions.',
      'Avoid scheduling sessions immediately before known trauma-related events (anniversaries, court dates, therapy sessions involving trauma processing).'
    ],
    contraindications: [
      'All standard TMS contraindications apply.',
      'Active psychotic episode or severe dissociative disorder requiring stabilisation first.',
      'Active suicidality requiring immediate intervention.',
      'Intoxication or active substance use at session time.'
    ],
    expectedResponse: 'PCL-5 response (>=10 point reduction): 40-60% of patients at 20 sessions; clinically meaningful improvement in hyperarousal and avoidance symptom clusters; trauma-focused concurrent therapy (PE, CPT) markedly improves outcomes.',
    monitoring: 'PCL-5 every 5 sessions; PHQ-9 every 5 sessions; suicidality screen every session; dissociation check post-session; trauma-informed safety check at beginning of each appointment.',
    followUp: 'PCL-5 at 4 and 12 weeks post-course; booster 10-session course at first sign of relapse; trauma-focused therapy should continue independently of TMS; coordinate discharge summary with mental health team.'
  },

  'tms-stroke-m1-hf': {
    name: 'M1 HF-TMS for Stroke Motor Rehabilitation',
    modality: 'TMS/rTMS', condition: 'Stroke - Motor', target: 'C3/C4 (Ipsilesional M1)',
    setup: [
      'Neurological clearance: no active seizure disorder, no metal in skull, imaging reviewed for haemorrhagic component, >=2 weeks post-acute stroke before TMS initiation.',
      'Determine ipsilesional M1 hotspot for the affected muscle group (C3 for left hemisphere, C4 for right hemisphere).',
      'MT determination may require higher stimulus intensity post-stroke due to cortical hypoexcitability; document carefully.',
      'Protocol: HF 10 Hz, 90-110% MT, 1200-2000 pulses per session, ipsilesional hemisphere primary; some protocols add contralesional LF 1 Hz (suppression) second.',
      'Confirm physiotherapy is scheduled within 30 minutes post-TMS (plasticity window).'
    ],
    sessionWorkflow: [
      'Confirm neurological stability before each session (no new stroke symptoms, no seizure).',
      'Position affected side up for muscle activation task concurrent with TMS if able.',
      'Deliver ipsilesional M1 HF-TMS protocol.',
      'Immediate physiotherapy session following TMS within the neuroplasticity window (within 30 minutes).',
      'Document motor function assessment (Fugl-Meyer upper limb score, grip strength) at baseline and every 5 sessions.',
      'AE monitoring: headache, fatigue, seizure vigilance.'
    ],
    contraindications: [
      'Active seizure or epilepsy post-stroke (requires neurologist clearance and lower protocol intensity).',
      'Metal fragments near stimulation site (skull X-ray required if any doubt from injury mechanism).',
      'Acute phase (<2 weeks) post-stroke.',
      'Haemorrhagic stroke: consult neurology before TMS initiation.',
      'DBS device present.'
    ],
    expectedResponse: 'Evidence level A; TMS + physiotherapy superior to physiotherapy alone for upper limb motor recovery; Fugl-Meyer improvement of 5-10 points over 10-20 sessions; early intervention (<6 months post-stroke) yields better outcomes; chronic stroke also responds but typically less dramatically.',
    monitoring: 'Fugl-Meyer upper limb score and grip dynamometer at baseline and every 5 sessions; NIHSS review every 5 sessions; seizure vigilance throughout; fatigue and headache VAS post-session.',
    followUp: 'Fugl-Meyer at 4 and 12 weeks post-course; booster course at 3-6 months if plateau reached; ongoing physiotherapy essential; coordinate with stroke rehabilitation team for long-term plan.'
  },

  'tdcs-mdd-dlpfc': {
    name: 'tDCS for MDD (F3 Anode / Fp2 Cathode)',
    modality: 'tDCS', condition: 'MDD', target: 'F3 (anode) / Fp2 (cathode)',
    setup: [
      'Obtain informed consent specific to tDCS (explain tingling/itching sensations normal, rare skin irritation).',
      'Electrode placement: 5x5 cm sponge electrodes soaked in saline; anode at F3 (target: L-DLPFC excitation), cathode at Fp2 (right supraorbital) or right shoulder (extracephalic).',
      'Parameters: 2 mA direct current, 30 minutes per session, 1 mA/sec ramp-up and ramp-down.',
      'Impedance check before delivering current (most devices have automated impedance monitoring).',
      'Optional: concurrent cognitive task (emotional word recall, working memory) during stimulation enhances functional specificity.'
    ],
    sessionWorkflow: [
      'Check electrode placement and impedance.',
      'Begin ramp-up to 2 mA over 30 seconds.',
      'Patient engaged in cognitive task or passive rest during 30-minute stimulation.',
      'Post-session: check skin at electrode sites for irritation; document tolerability.',
      'PHQ-9 every 5 sessions.',
      'Sessions 5x/week for 4 weeks (20 sessions) standard; home tDCS protocol after clinical course can extend benefit.'
    ],
    contraindications: [
      'Metal in or on head (cochlear implants, DBS, skull plate near electrode sites).',
      'Open wounds or skin lesions at electrode sites.',
      'Unstable epilepsy.',
      'Pregnancy (relative contraindication; risk-benefit discussion).',
      'Recent TMS course at same site (wait >=48 hours before combining TMS and tDCS).'
    ],
    expectedResponse: 'ISI reduction ~5-8 points in depression with insomnia overlap; PHQ-9 improvement ~4-6 points over 20 sessions; lower effect size than TMS but lower cost and home use potential; evidence level B for MDD.',
    monitoring: 'PHQ-9 every 5 sessions; skin inspection at electrode sites every session; impedance log; tolerability VAS; electrode gel/saline moistness check at each session.',
    followUp: 'PHQ-9 at 4 and 8 weeks post-course; home tDCS maintenance prescription appropriate for partial responders or chronic/recurrent depression; coordinate with prescribing psychiatrist for medication review.'
  },

  'tdcs-pain-m1': {
    name: 'M1 tDCS for Chronic Pain',
    modality: 'tDCS', condition: 'Neuropathic / Chronic Pain', target: 'C3/C4 (M1 anode, contralateral to pain)',
    setup: [
      'Confirm pain type and laterality; anode placed at M1 contralateral to primary pain site (C3 for right-sided pain, C4 for left-sided pain).',
      'Cathode at ipsilateral supraorbital (Fp1 or Fp2) or extracephalic (shoulder).',
      'Parameters: 2 mA, 20-30 minutes, 1 mA/sec ramp.',
      'Pain NRS (0-10) documented before each session.'
    ],
    sessionWorkflow: [
      'Pain NRS at session start.',
      'Electrode placement and impedance check.',
      'Deliver 2 mA for 20-30 minutes.',
      'Pain NRS 30 minutes post-session.',
      'Document net NRS change; >1.5 point reduction considered clinically meaningful.',
      'Sessions 5x/week for 2-4 weeks (10-20 sessions) standard.'
    ],
    contraindications: [
      'Metal at electrode sites.',
      'Active skin conditions at electrode sites.',
      'Unstable seizure disorder.',
      'Implanted devices near stimulation site.'
    ],
    expectedResponse: 'M1 tDCS for neuropathic pain: 30-50% NRS reduction in responders; evidence level B; effect may last days to weeks after a session; monthly maintenance appropriate for chronic pain.',
    monitoring: 'NRS before and 30 min after each session; EQ-5D at baseline and end of course; skin inspection each session; pain medication diary review weekly.',
    followUp: 'NRS at 4 weeks post-course; monthly maintenance sessions appropriate for chronic pain conditions; combine with pain neuroscience education and graded activity programme.'
  },

  'tavns-epilepsy': {
    name: 'taVNS for Drug-Resistant Epilepsy',
    modality: 'taVNS', condition: 'Drug-Resistant Epilepsy', target: 'Left auricular (cymba conchae)',
    setup: [
      'Patient must meet DRE criteria (>=2 failed appropriate antidepressant trials at adequate doses and duration).',
      'Cardiac clearance: taVNS activates vagal afferents; baseline ECG and cardiology review if bradycardia or arrhythmia history.',
      'NEMOS/tVNS device setup: left ear electrode specifically targets cymba conchae (not tragus) for maximal vagal branch density.',
      'Starting parameters: 25 Hz, 0.2 ms pulse width, sensory threshold intensity (patient reports tingling, no pain).',
      'Daily cycle: 2 hours on, 4 hours off; patient self-administers at home after training session.'
    ],
    sessionWorkflow: [
      'Training session at clinic: demonstrate electrode placement at cymba conchae; confirm correct sensation (tingling, not pain); confirm no bradycardia response with 5-minute supervised use.',
      'Home use: device worn for 2-hour blocks on/off daily cycle.',
      'Clinic review appointments: every 4 weeks initially; seizure diary review at each visit.',
      'Seizure diary: document seizure frequency, duration, and severity at every clinic visit.',
      'ECG monitoring at first clinic visit and if cardiac symptoms emerge.'
    ],
    contraindications: [
      'Vagotomy (prior surgical vagal nerve sectioning).',
      'Active ear infection or skin condition in left ear.',
      'Severe bradycardia or sick sinus syndrome.',
      'Bilateral cervical vagotomy.',
      'Implanted cardiac device sensitive to vagal activation (consult cardiologist).'
    ],
    expectedResponse: 'FDA-cleared for DRE; ~30-40% seizure frequency reduction at 6 months; >=50% reduction (responder rate) in ~30% of patients; seizure diary is primary outcome measure; full benefit assessment requires minimum 3 months of consistent use.',
    monitoring: 'Seizure diary at every appointment; ECG at first and if cardiac symptoms; ear skin inspection each visit; tolerability and adverse effect documentation; epilepsy quality of life scale (QOLIE-31) at baseline and 6 months.',
    followUp: 'Seizure diary review monthly for first 3 months, then quarterly; if >=50% seizure reduction maintained at 6 months, continue indefinitely; if no response at 6 months, reassess with epileptologist for surgical options.'
  },

  'nfb-adhd-theta-beta': {
    name: 'Theta-Beta Neurofeedback for ADHD',
    modality: 'Neurofeedback (EEG)', condition: 'ADHD (Combined/Inattentive)', target: 'Cz (theta suppression / beta enhancement)',
    setup: [
      'Baseline qEEG: at minimum, record Cz electrode 5 minutes eyes-open, 5 minutes eyes-closed; confirm elevated theta/beta ratio (normal <2.5; ADHD typically >3).',
      'EEG electrode at Cz (vertex); reference at earlobes (A1/A2) or mastoids.',
      'Threshold setting: theta inhibit band 4-8 Hz; beta reward band 15-20 Hz (or 12-15 Hz for sensorimotor rhythm approach).',
      'Initial thresholds set so patient achieves reward tone approximately 50-60% of the time.',
      'Session duration: 30-40 minutes of active neurofeedback per session.',
      'Computer-based game or animation provides real-time feedback (reward tone/visual cue when theta decreases and beta increases simultaneously).'
    ],
    sessionWorkflow: [
      'Apply EEG electrode at Cz with conductive gel; impedance check (<10 kOhm).',
      'Baseline 2-minute recording to set session thresholds.',
      'Begin neurofeedback protocol: patient focuses on achieving reward cue by self-regulating brainwaves.',
      'Clinician monitors EEG trace and adjusts thresholds each 10 minutes to maintain ~60% reward rate.',
      'Document EEG metrics (mean theta power, mean beta power, theta/beta ratio) each session.',
      'End of session: print session EEG summary; review progress with patient.',
      '40-session protocol, 3x/week over 13-14 weeks for durable outcome.'
    ],
    contraindications: [
      'Active scalp infection or open wound at Cz electrode site.',
      'Photosensitive epilepsy (if visual feedback modality used; audio-only feedback is an alternative).',
      'Cognitive impairment severe enough to prevent engagement with feedback task.',
      'Significant comorbid psychiatric crisis requiring stabilisation first.'
    ],
    expectedResponse: 'Evidence level B; meta-analytic effect sizes comparable to non-stimulant ADHD medication; most durable results require 40 sessions; theta/beta ratio normalisation correlates with clinical improvement; home neurofeedback (Muse 2) can extend gains post-clinical protocol.',
    monitoring: 'EEG metrics (theta/beta ratio) at each session; CGI-I and ADHD symptom rating scale at baseline, session 20, and session 40; parent/teacher rating for children; occupational/academic functioning review monthly.',
    followUp: 'CGI-I at 4 and 12 weeks post-course; home neurofeedback programme (Muse 2) prescribed for maintenance; ADHD coaching concurrent for occupational/academic skill building; reassess medication if response insufficient.'
  },

  'tms-migraine-occ': {
    name: 'Single-Pulse TMS for Migraine with Aura (SpringTMS)',
    modality: 'TMS (single-pulse)', condition: 'Migraine with Aura', target: 'Oz (occipital cortex)',
    setup: [
      'Patient training session: neurologist or TMS-trained clinician confirms migraine with aura diagnosis.',
      'Demonstrate SpringTMS device placement: device held firmly against the back of the head (occipital region, Oz).',
      'Deliver 2 test single pulses to confirm device function and patient tolerance.',
      'Patient education: aura recognition, optimal window for acute treatment (within 20 minutes of aura onset), preventive protocol timing.',
      'Provide written home-use instructions card; document device serial number.',
      'Baseline headache diary established (minimum 4-week baseline before assessing treatment response).'
    ],
    sessionWorkflow: [
      'ACUTE use: at first sign of visual or other aura, hold device to occiput, deliver 4 pulses (2 immediately, repeat after 15 minutes if aura persists or headache begins).',
      'PREVENTIVE use: 2 pulses to occiput every morning regardless of symptoms.',
      'Document each use in headache diary (date, time, symptoms before, response at 2 hours).',
      'Clinic review: headache diary data review every 4-6 weeks.',
      'Assess response: acute (pain-free at 2 hours); preventive (reduction in monthly migraine days vs baseline).'
    ],
    contraindications: [
      'Migraine without aura (acute indication is specifically for aura; preventive protocol may be used).',
      'Metal in the head (DBS, cochlear implant, aneurysm clips).',
      'History of seizure (single-pulse TMS is very low risk; relative contraindication).',
      'Cardiac pacemaker or implantable device.',
      'Pregnancy (relative; discuss risk-benefit with neurologist).'
    ],
    expectedResponse: 'FDA-cleared for migraine with aura; 39% pain-free at 2 hours vs 22% sham (Lipton 2010); preventive protocol: ~2.75 fewer monthly migraine days vs sham; response assessment at 3 months of consistent use.',
    monitoring: 'Headache diary review at every clinic visit; monthly migraine days, acute treatment use frequency, pain-free at 2 hours rate; medication overuse assessment (headache on >10-15 days/month requires medication overuse headache evaluation).',
    followUp: 'Quarterly clinic review; headache diary data shared with neurologist; device prescription renewal annually; escalate to preventive pharmacological therapy if monthly migraine days remain >=8 despite TMS preventive protocol.'
  },

  'dbs-parkinsons-stn': {
    name: 'STN DBS for Parkinson\'s Disease',
    modality: 'DBS', condition: 'Parkinson\'s Disease', target: 'Subthalamic Nucleus (STN)',
    setup: [
      'DBS is a neurosurgical procedure; all pre-surgical assessment is conducted by the neurology/neurosurgery DBS team.',
      'Eligibility criteria: PD confirmed with good levodopa response; UPDRS Part III >=30% on-off fluctuation; dyskinesia significantly impacting quality of life; no cognitive impairment (MoCA >=26); no significant psychiatric comorbidity.',
      'Pre-surgical work-up: brain MRI, neuropsychological assessment, psychiatric evaluation, UPDRS off and on medications, quality of life scales.',
      'Surgical implantation: bilateral STN electrode placement under stereotactic guidance; pulse generator implanted subcutaneously in chest.',
      'Programming begins 2-4 weeks post-implant.'
    ],
    sessionWorkflow: [
      'DBS programming appointment: neurologist or clinical specialist performs monopolar/bipolar impedance measurement; UPDRS Part III in medication-off state.',
      'Initial stimulation: start low amplitude (1-2 V), increase gradually while monitoring for benefit and side effects.',
      'Parameter optimisation: adjust contact, polarity, amplitude, pulse width, and frequency to achieve maximal motor benefit with minimal side effects.',
      'Medication review: levodopa dose typically reduced after effective DBS programming; medication-device titration is ongoing.',
      'Document programming parameters, UPDRS score, and side effects at each visit.',
      'Device battery monitoring: primary cell replacement every 3-5 years; rechargeable systems require regular charging.'
    ],
    contraindications: [
      'Significant cognitive impairment (MoCA <26) - DBS may worsen cognition.',
      'Active psychiatric illness (depression, psychosis) not optimally managed.',
      'Advanced age with significant medical comorbidity increasing surgical risk.',
      'Parkinson\'s variant (PSP, MSA) which does not respond to DBS.',
      'Atypical parkinsonian syndromes.',
      'MRI-incompatible body metal if MRI follow-up anticipated.'
    ],
    expectedResponse: 'Evidence level A (FDA-cleared); UPDRS Part III improvement 40-60% in off-medication state; dyskinesia reduction 70-90%; levodopa equivalent dose reduction 50-60%; motor benefit sustained >10 years in most patients; gait, speech, and swallowing respond less predictably.',
    monitoring: 'UPDRS Part III off and on medications at each programming visit; monthly for first 3 months, then quarterly; device impedance check; battery status monitoring; neuropsychological reassessment at 12 months; mood screening (depression common post-DBS in some patients).',
    followUp: 'Lifelong DBS management by specialist DBS team; quarterly clinic visits once stable; emergency DBS plan provided to patient (what to do if device malfunctions or is lost); emergency MRI protocol if scan required; patient carries DBS device card at all times.'
  }
};

for (const [id, data] of Object.entries(PROTOCOLS)) {
  out += proto(id, data);
}

// Close the object
out += '};\n';

// Append to existing content
fs.writeFileSync(OUT, existing + out, 'utf8');

const finalContent = fs.readFileSync(OUT, 'utf8');
const lines = finalContent.split('\n').length;
console.log('Final file written. Lines:', lines, 'Size:', Buffer.byteLength(finalContent, 'utf8'), 'bytes');
