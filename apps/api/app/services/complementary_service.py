"""
complementary_service.py — Complementary & Integrative Interventions Service Layer

Provides: patient therapy management, session logging, therapy library queries,
protocol creation, safety/contraindication checking, evidence summaries,
and progress analytics.

DeepSynaps Protocol Studio — clinical intervention platform.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CONSTANTS & DATA REGISTRY
# ---------------------------------------------------------------------------

EVIDENCE_GRADE_WEIGHTS = {"A": 4, "B": 3, "C": 2, "D": 1}

THERAPY_CATEGORIES = [
    "acupuncture",
    "biofeedback",
    "ces",
    "pbm",
    "massage",
    "mind-body",
    "music-art",
    "naturopathic",
    "other",
]

# ---------------------------------------------------------------------------
# 50+ THERAPY DATABASE ENTRIES
# ---------------------------------------------------------------------------

THERAPY_LIBRARY_DB: List[Dict[str, Any]] = [
    {
        "id": "t-001",
        "name": "Acupuncture",
        "category": "acupuncture",
        "description": "Insertion of fine needles at specific points to modulate qi/energy flow and stimulate endogenous pain modulation pathways.",
        "mechanism": "Gate control theory, endogenous opioid release (beta-endorphin, enkephalin), autonomic modulation via vagal afferents, anti-inflammatory cytokine modulation",
        "conditions": ["Chronic low back pain", "Osteoarthritis knee", "Migraine prophylaxis", "Tension headache", "Generalized anxiety", "Major depression", "Insomnia", "Chemotherapy-induced nausea", "Allergic rhinitis", "Chronic neck pain"],
        "evidence_grade": "A",
        "contraindications": ["Severe bleeding disorders (hemophilia)", "Anticoagulant therapy without monitoring", "Local infection at needle site", "Severe needle phobia (vasovagal risk)", "Pregnancy (specific points: LI4, SP6, BL60, GB21, UB67)"],
        "practitioner_requirements": "Licensed acupuncturist (LAc, DOM, or equivalent state licensure); NCCAOM certification recommended",
    },
    {
        "id": "t-002",
        "name": "Electroacupuncture",
        "category": "acupuncture",
        "description": "Acupuncture with low-frequency electrical stimulation between paired needles for enhanced neuromodulation.",
        "mechanism": "Enhanced neuromodulation via rhythmic electrical impulses; greater beta-endorphin and dynorphin release than manual acupuncture",
        "conditions": ["Chronic pain (refractory)", "Post-stroke hemiplegia", "Sciatica", "Trigeminal neuralgia", "Functional constipation"],
        "evidence_grade": "B",
        "contraindications": ["Implanted pacemaker or ICD", "Epilepsy/seizure disorder", "Pregnancy", "Local infection"],
        "practitioner_requirements": "Licensed acupuncturist with documented electroacupuncture training",
    },
    {
        "id": "t-003",
        "name": "Auricular Acupuncture",
        "category": "acupuncture",
        "description": "Needling, seeding, or electrostimulation of specific points on the auricle corresponding to body organs and functions.",
        "mechanism": "Vagal nerve stimulation via auricular branch (Arnold's nerve), somato-autonomic reflex",
        "conditions": ["Substance use withdrawal", "Anxiety", "Obesity", "Chronic pain", "Insomnia"],
        "evidence_grade": "B",
        "contraindications": ["Ear infection or dermatitis", "Skin lesions on ear", "Cartilage trauma"],
        "practitioner_requirements": "Licensed acupuncturist or NADA-certified practitioner",
    },
    {
        "id": "t-004",
        "name": "Scalp Acupuncture",
        "category": "acupuncture",
        "description": "Needling along specific lines or zones on the scalp corresponding to cortical functional areas.",
        "mechanism": "Direct CNS modulation via scalp-cortical projections; improved regional cerebral blood flow",
        "conditions": ["Stroke recovery", "Spastic paralysis", "Parkinson's disease", "Multiple sclerosis", "Cerebral palsy"],
        "evidence_grade": "C",
        "contraindications": ["Head trauma with open wound", "Scalp infection", "Severe uncontrolled hypertension", "Cranial sutures in infants"],
        "practitioner_requirements": "Licensed acupuncturist with neurological acupuncture training",
    },
    {
        "id": "t-005",
        "name": "Moxibustion",
        "category": "acupuncture",
        "description": "Thermal stimulation by burning dried mugwort (Artemisia vulgaris) on or near acupuncture points.",
        "mechanism": "Heat therapy, infrared radiation, immune modulation (NK cell activity), improved microcirculation",
        "conditions": ["Breech presentation (32-36 weeks)", "Knee osteoarthritis", "Chronic digestive complaints", "Primary dysmenorrhea"],
        "evidence_grade": "B",
        "contraindications": ["Heat-sensitive conditions", "Open wounds", "Respiratory conditions (smoke exposure)", "Diabetic neuropathy (burn risk)", "Pregnancy (avoid abdominal points)"],
        "practitioner_requirements": "Licensed acupuncturist trained in moxibustion technique",
    },
    {
        "id": "t-006",
        "name": "Cupping Therapy",
        "category": "acupuncture",
        "description": "Application of suction cups to skin for myofascial decompression and increased local circulation.",
        "mechanism": "Negative pressure increases local blood and lymphatic flow; myofascial decompression; mechanical nociceptor stimulation",
        "conditions": ["Musculoskeletal pain", "Respiratory congestion", "Chronic fatigue", "Herpes zoster pain"],
        "evidence_grade": "C",
        "contraindications": ["Bleeding disorders", "Skin ulcers or open wounds", "Pregnancy (abdomen and lumbar region)", "Severe edema", "Active dermatosis"],
        "practitioner_requirements": "Licensed practitioner with cupping training",
    },
    {
        "id": "t-007",
        "name": "SMR Neurofeedback",
        "category": "biofeedback",
        "description": "Operant conditioning to enhance 12-15 Hz sensorimotor rhythm over sensorimotor cortex for attention and seizure regulation.",
        "mechanism": "Thalamocortical loop stabilization via operant conditioning; increased SMR is associated with reduced motor excitability and improved attention",
        "conditions": ["ADHD", "Epilepsy (absence)", "Sleep-onset insomnia", "Anxiety", "TBI cognitive sequelae"],
        "evidence_grade": "B",
        "contraindications": ["Severe psychiatric instability", "Active psychosis", "Inability to tolerate electrode placement"],
        "practitioner_requirements": "BCIA-certified neurofeedback practitioner (BCN or BCB-N)",
    },
    {
        "id": "t-008",
        "name": "Alpha-Theta Neurofeedback",
        "category": "biofeedback",
        "description": "Training to increase the ratio of alpha to theta waves, facilitating deep relaxation and subconscious access.",
        "mechanism": "Limbic system modulation via entrainment of hippocampal-cortical theta-alpha coupling; state-dependent learning",
        "conditions": ["PTSD", "Substance use disorder", "Performance anxiety", "Creativity enhancement", "Chronic stress"],
        "evidence_grade": "B",
        "contraindications": ["Epilepsy (theta can trigger seizures in susceptible individuals)", "Dissociative disorders", "Severe trauma without stabilization"],
        "practitioner_requirements": "BCIA-certified neurofeedback practitioner with advanced training",
    },
    {
        "id": "t-009",
        "name": "SCP Neurofeedback",
        "category": "biofeedback",
        "description": "Slow Cortical Potential training for self-regulation of cortical excitability thresholds.",
        "mechanism": "Direct cortical excitability modulation; SCP reflects depolarization/hyperpolarization of cortical dendrites",
        "conditions": ["ADHD", "Epilepsy", "Migraine prophylaxis"],
        "evidence_grade": "A",
        "contraindications": ["Severe psychiatric instability"],
        "practitioner_requirements": "BCIA-certified neurofeedback practitioner with SCP specialization",
    },
    {
        "id": "t-010",
        "name": "HRV Biofeedback",
        "category": "biofeedback",
        "description": "Training to increase heart rate variability through resonant frequency breathing and vagal tone enhancement.",
        "mechanism": "Vagal nerve strengthening, sympathovagal balance restoration, baroreflex sensitivity improvement, HPA axis modulation",
        "conditions": ["Generalized anxiety", "Essential hypertension", "Chronic pain", "Major depression", "Asthma", "Fibromyalgia", "IBS", "Performance stress"],
        "evidence_grade": "B",
        "contraindications": ["Severe cardiac arrhythmia", "Unstable angina", "Recent myocardial infarction (<6 weeks)", "Bradycardia (<50 bpm without conditioning)"],
        "practitioner_requirements": "BCIA-certified or HeartMath-certified practitioner; clinical oversight for cardiac patients",
    },
    {
        "id": "t-011",
        "name": "EMG Biofeedback",
        "category": "biofeedback",
        "description": "Surface electromyography feedback for awareness and voluntary control of muscle tension.",
        "mechanism": "Motor unit action potential visualization; enhanced proprioceptive awareness and motor learning",
        "conditions": ["Tension-type headache", "Temporomandibular disorder", "Chronic musculoskeletal pain", "Muscle re-education post-stroke", "Pelvic floor dysfunction"],
        "evidence_grade": "B",
        "contraindications": ["Skin breakdown at electrode sites", "Severe dermatological conditions at site", "Open wounds at electrode placement"],
        "practitioner_requirements": "BCIA-certified or physical therapist with EMG biofeedback training",
    },
    {
        "id": "t-012",
        "name": "GSR / SCL Biofeedback",
        "category": "biofeedback",
        "description": "Galvanic skin response feedback for stress arousal awareness and control.",
        "mechanism": "Sympathetic autonomic arousal monitoring via eccrine sweat gland conductance changes",
        "conditions": ["Stress management", "Performance anxiety", "Hyperhidrosis", "Substance use craving monitoring"],
        "evidence_grade": "C",
        "contraindications": ["Skin conditions affecting conductance (eczema, psoriasis at electrode site)", "Peripheral neuropathy affecting sweating"],
        "practitioner_requirements": "BCIA-certified practitioner",
    },
    {
        "id": "t-013",
        "name": "Thermal Biofeedback",
        "category": "biofeedback",
        "description": "Peripheral temperature feedback to train vasodilation and autonomic relaxation.",
        "mechanism": "Sympathetic vasoconstriction control; increased peripheral temperature indicates reduced sympathetic tone",
        "conditions": ["Migraine prophylaxis", "Raynaud's phenomenon", "Hypertension", "Anxiety", "Insomnia"],
        "evidence_grade": "C",
        "contraindications": ["Peripheral vascular disease", "Diabetic neuropathy with impaired sensation", "Cold injury history"],
        "practitioner_requirements": "BCIA-certified practitioner",
    },
    {
        "id": "t-014",
        "name": "Cranial Electrotherapy Stimulation (CES)",
        "category": "ces",
        "description": "Application of microcurrent (<1 mA) to the head via earclip electrodes for CNS modulation.",
        "mechanism": "Modulation of brainstem neurotransmitter systems (serotonin, GABA, norepinephrine); cortical excitability modification",
        "conditions": ["Generalized anxiety disorder", "Insomnia", "Major depressive disorder (adjunct)", "PTSD", "Chronic pain"],
        "evidence_grade": "B",
        "contraindications": ["Implanted pacemaker, ICD, or insulin pump", "Pregnancy", "Epilepsy/seizure disorder", "Active skin lesions at electrode site"],
        "practitioner_requirements": "Prescription device (US-FDA Class III); clinician oversight required; patient training on proper use",
    },
    {
        "id": "t-015",
        "name": "Transcranial Direct Current Stimulation (tDCS)",
        "category": "ces",
        "description": "Application of weak constant direct current (1-2 mA) via scalp electrodes to modulate cortical excitability.",
        "mechanism": "Anodal stimulation increases neuronal excitability (depolarization); cathodal decreases excitability (hyperpolarization); neuroplasticity via long-term potentiation/depression",
        "conditions": ["Major depression (anode F3, cathode Fp2)", "Chronic pain", "Cognitive enhancement (working memory)", "Stroke motor rehabilitation", "Fibromyalgia"],
        "evidence_grade": "B",
        "contraindications": ["Metal cranial implants near electrodes", "Skin lesions at electrode site", "Epilepsy or seizure history", "Pregnancy", "Cardiac pacemaker"],
        "practitioner_requirements": "Clinician supervision required; investigational device exemption for some indications; trained operator",
    },
    {
        "id": "t-016",
        "name": "Transcranial Alternating Current Stimulation (tACS)",
        "category": "ces",
        "description": "Application of oscillating current to entrain cortical rhythms at specific frequencies.",
        "mechanism": "Neural oscillation entrainment; phase-dependent modulation of cortical excitability",
        "conditions": ["Major depression", "Working memory enhancement", "Tinnitus", "Chronic pain", "Cognitive decline"],
        "evidence_grade": "C",
        "contraindications": ["Metal cranial implants", "Epilepsy", "Pregnancy", "Skin lesions at electrode site"],
        "practitioner_requirements": "Research/clinical specialist; typically investigational",
    },
    {
        "id": "t-017",
        "name": "Transcranial Random Noise Stimulation (tRNS)",
        "category": "ces",
        "description": "Application of random-frequency alternating current for stochastic resonance enhancement of neural activity.",
        "mechanism": "Stochastic resonance — random electrical noise enhances weak signal detection and synaptic efficacy",
        "conditions": ["Cognitive enhancement", "Major depression", "Chronic pain", "Learning disabilities"],
        "evidence_grade": "C",
        "contraindications": ["Metal cranial implants", "Epilepsy", "Pregnancy", "Skin lesions"],
        "practitioner_requirements": "Research specialist; investigational device",
    },
    {
        "id": "t-018",
        "name": "Transcranial Photobiomodulation (tPBM)",
        "category": "pbm",
        "description": "Near-infrared light (810-1064 nm) applied to the head for neuronal metabolic enhancement and neuroprotection.",
        "mechanism": "Cytochrome c oxidase activation in mitochondria (complex IV), increased ATP synthesis, reduced oxidative stress, nitric oxide release improving cerebral blood flow, anti-inflammatory cytokine modulation",
        "conditions": ["Major depressive disorder (adjunct)", "Traumatic brain injury", "Mild cognitive impairment / early dementia", "Chronic traumatic encephalopathy", "Anxiety disorders", "Post-COVID cognitive symptoms"],
        "evidence_grade": "B",
        "contraindications": ["Photosensitizing medications (tetracyclines, psoralens, amiodarone, doxycycline)", "Active skin cancer at treatment site", "Pregnancy (insufficient safety data)", "History of retinal disease (eye protection mandatory)"],
        "practitioner_requirements": "Trained clinician in photobiomodulation protocols; eye protection equipment required",
    },
    {
        "id": "t-019",
        "name": "Peripheral Low-Level Laser Therapy (LLLT)",
        "category": "pbm",
        "description": "Low-level laser or LED light applied to peripheral tissues for pain relief, anti-inflammatory effects, and tissue repair.",
        "mechanism": "Photochemical (not thermal) tissue interaction; increased fibroblast activity, collagen synthesis, microcirculation; reduced prostaglandin and cytokine production",
        "conditions": ["Osteoarthritis (knee, hip, hand)", "Chronic neck and back pain", "Tendinopathy", "Wound healing (diabetic ulcers)", "Carpal tunnel syndrome", "Muscle strain/sprain"],
        "evidence_grade": "A",
        "contraindications": ["Photosensitizing medications", "Direct thyroid exposure", "Eyes (without protection)", "Active cancer at treatment site", "Pregnancy (over uterus)"],
        "practitioner_requirements": "Trained clinician; laser safety certification recommended",
    },
    {
        "id": "t-020",
        "name": "LED Red/NIR Light Therapy",
        "category": "pbm",
        "description": "Light-emitting diode arrays delivering red (630-660 nm) and near-infrared (810-850 nm) light for superficial tissue treatment.",
        "mechanism": "Similar to LLLT but with broader beam profile; suitable for larger treatment areas; cytochrome c oxidase activation",
        "conditions": ["Skin rejuvenation", "Wound healing", "Muscle recovery", "Joint pain", "Oral mucositis"],
        "evidence_grade": "B",
        "contraindications": ["Photosensitizing medications", "Eye exposure (without protection)", "Active skin cancer", "Thyroid direct exposure"],
        "practitioner_requirements": "Trained operator; eye protection required",
    },
    {
        "id": "t-021",
        "name": "Mindfulness-Based Stress Reduction (MBSR)",
        "category": "mind-body",
        "description": "8-week structured program combining mindfulness meditation, body awareness, and gentle yoga developed by Jon Kabat-Zinn.",
        "mechanism": "Prefrontal-amygdala functional connectivity modulation; reduced HPA axis reactivity; increased insular cortex gray matter; decreased default mode network rumination activity",
        "conditions": ["Chronic stress", "Generalized anxiety", "Recurrent depression relapse prevention", "Chronic pain (fibromyalgia)", "Cancer-related distress", "Hypertension", "IBS"],
        "evidence_grade": "A",
        "contraindications": ["Untreated psychosis", "Active suicidal ideation", "Recent severe trauma without stabilization (may surface traumatic material)"],
        "practitioner_requirements": "MBSR-certified instructor (CFM/UMASS or equivalent); minimum 2-year teacher training pathway",
    },
    {
        "id": "t-022",
        "name": "Mindfulness-Based Cognitive Therapy (MBCT)",
        "category": "mind-body",
        "description": "Adaptation of MBSR specifically for depression relapse prevention integrating cognitive therapy techniques.",
        "mechanism": "Decentering from ruminative thought patterns; metacognitive awareness; disruption of depression-cognition feedback loops",
        "conditions": ["Recurrent major depressive disorder", "Residual depressive symptoms", "Anxiety comorbid with depression", "Bipolar depression maintenance"],
        "evidence_grade": "A",
        "contraindications": ["Current acute severe depression (may not benefit until stabilized)", "Active psychosis", "Severe personality disorder without concurrent therapy"],
        "practitioner_requirements": "MBCT-certified therapist; typically a licensed mental health professional",
    },
    {
        "id": "t-023",
        "name": "Dialectical Behavior Therapy (DBT) Skills",
        "category": "mind-body",
        "description": "Structured skills training in mindfulness, distress tolerance, emotion regulation, and interpersonal effectiveness.",
        "mechanism": "Emotion regulation neural circuitry strengthening; prefrontal-limbic integration; behavioral activation and exposure principles",
        "conditions": ["Borderline personality disorder", "Emotion dysregulation", "Self-harm behaviors", "Eating disorders", "Substance use", "PTSD"],
        "evidence_grade": "A",
        "contraindications": ["Severe intellectual disability precluding skills learning", "Active psychosis interfering with group participation"],
        "practitioner_requirements": "Intensively trained DBT therapist; team consultation group participation required",
    },
    {
        "id": "t-024",
        "name": "Yoga Therapy (Various Styles)",
        "category": "mind-body",
        "description": "Therapeutic application of yoga postures, breathwork, meditation, and lifestyle principles for health outcomes.",
        "mechanism": "Vagal tone enhancement, GABAergic activity increase (prefrontal cortex), HPA axis downregulation, parasympathetic activation, anti-inflammatory cytokine modulation",
        "conditions": ["Anxiety disorders", "Major depression", "Chronic low back pain", "Hypertension", "Insomnia", "Rheumatoid arthritis", "Cancer-related fatigue", "COPD"],
        "evidence_grade": "B",
        "contraindications": ["Uncontrolled hypertension (inversions contraindicated)", "Glaucoma (inversions)", "Recent spinal surgery (<6 months)", "Acute disc herniation", "Pregnancy (modified practice required)"],
        "practitioner_requirements": "Certified yoga therapist (IAYT-CYT); registered yoga teacher (RYT-500) with therapeutic training",
    },
    {
        "id": "t-025",
        "name": "Tai Chi Chuan",
        "category": "mind-body",
        "description": "Chinese martial art characterized by slow, flowing movements, deep breathing, and meditation.",
        "mechanism": "Proprioceptive training, vestibular system strengthening, autonomic regulation (parasympathetic shift), weight-bearing exercise for bone density, immune function enhancement",
        "conditions": ["Fall prevention in older adults", "Parkinson's disease", "Hypertension", "Osteoarthritis", "Fibromyalgia", "Heart failure", "Chronic obstructive pulmonary disease", "Anxiety", "Cognitive decline"],
        "evidence_grade": "A",
        "contraindications": ["Severe balance impairment without supervision", "Acute joint injury", "Unstable cardiovascular condition", "Acute musculoskeletal pain"],
        "practitioner_requirements": "Certified tai chi instructor; Tai Chi for Health Institute certification for clinical populations",
    },
    {
        "id": "t-026",
        "name": "Qigong (Medical)",
        "category": "mind-body",
        "description": "Coordinated body posture, movement, breathing, and meditation practiced for health maintenance and healing.",
        "mechanism": "Bioenergy regulation through meridian system; autonomic nervous system balance; mind-body integration; gentle aerobic exercise",
        "conditions": ["Hypertension", "Chronic pain", "Cancer-related fatigue", "Anxiety", "Depression", "Insomnia", "Immune modulation"],
        "evidence_grade": "C",
        "contraindications": ["Severe cardiovascular instability", "Acute psychosis", "Severe osteoporosis without modification"],
        "practitioner_requirements": "Certified medical qigong practitioner or instructor",
    },
    {
        "id": "t-027",
        "name": "Pranayama / Therapeutic Breathwork",
        "category": "mind-body",
        "description": "Controlled breathing techniques for physiological and psychological regulation.",
        "mechanism": "Vagal nerve stimulation, HRV enhancement, chemoreceptor sensitivity modification, baroreflex optimization, CO2/O2 balance modulation",
        "conditions": ["Generalized anxiety", "Panic disorder", "Hypertension", "Asthma", "Insomnia", "Chronic pain", "PTSD hyperarousal", "Performance stress"],
        "evidence_grade": "B",
        "contraindications": ["Severe COPD with CO2 retention (caution with breath retention)", "Unstable cardiovascular disease", "Acute asthma exacerbation", "Panic disorder (some techniques may initially trigger symptoms)"],
        "practitioner_requirements": "Certified breathwork instructor, yoga therapist, or health professional with respiratory therapy training",
    },
    {
        "id": "t-028",
        "name": "Progressive Muscle Relaxation (PMR)",
        "category": "mind-body",
        "description": "Systematic tensing and releasing of muscle groups to achieve deep physical relaxation.",
        "mechanism": "Neuromuscular tension awareness and voluntary release; reciprocal inhibition; parasympathetic activation cascade",
        "conditions": ["Generalized anxiety", "Insomnia", "Hypertension", "Chronic pain", "Tension headache", "Pre-surgical anxiety"],
        "evidence_grade": "B",
        "contraindications": ["Acute muscle injury (modified approach needed)", "Severe osteoporosis (avoid forceful contraction)", "Myofascial pain syndrome (gentle approach)"],
        "practitioner_requirements": "Trained clinician, therapist, or certified relaxation instructor",
    },
    {
        "id": "t-029",
        "name": "Autogenic Training",
        "category": "mind-body",
        "description": "Self-relaxation technique using verbal formulas to induce physical and mental relaxation.",
        "mechanism": "Autonomic self-regulation via self-suggestion; shift from sympathetic to parasympathetic dominance",
        "conditions": ["Anxiety", "Insomnia", "Hypertension", "Stress-related disorders", "Migraine prophylaxis", "Bruxism"],
        "evidence_grade": "B",
        "contraindications": ["Severe depression", "Dissociative disorders", "Severe trauma without stabilization"],
        "practitioner_requirements": "Certified autogenic training instructor (typically 9-month certification)",
    },
    {
        "id": "t-030",
        "name": "Guided Imagery / Visualization",
        "category": "mind-body",
        "description": "Therapeutic use of mental visualization for healing, symptom control, and performance enhancement.",
        "mechanism": "Psychoneuroimmunology pathways; activation of brain regions involved in sensory-motor simulation; stress response modulation via hypothalamic-pituitary axis",
        "conditions": ["Pain management", "Anxiety", "Pre-surgical preparation", "Cancer treatment support", "Insomnia", "Athletic performance", "Chronic illness coping"],
        "evidence_grade": "B",
        "contraindications": ["Severe PTSD (imagery may trigger flashbacks)", "Psychosis", "Dissociative disorders"],
        "practitioner_requirements": "Trained clinician, certified guided imagery practitioner, or mental health professional",
    },
    {
        "id": "t-031",
        "name": "Biofeedback-Assisted Relaxation",
        "category": "mind-body",
        "description": "Integration of multiple biofeedback modalities for comprehensive autonomic self-regulation training.",
        "mechanism": "Multimodal autonomic awareness (EMG, GSR, temperature, HRV, respiration); operant conditioning of physiological self-regulation",
        "conditions": ["Stress-related disorders", "Hypertension", "Migraine", "Tension headache", "Anxiety", "Chronic pain", "Raynaud's phenomenon"],
        "evidence_grade": "B",
        "contraindications": ["Severe psychiatric instability", "Inability to attend to feedback signals"],
        "practitioner_requirements": "BCIA-certified biofeedback practitioner (BCB or BCN)",
    },
    {
        "id": "t-032",
        "name": "Swedish / Relaxation Massage",
        "category": "massage",
        "description": "Long, flowing strokes, kneading, friction, and rhythmic tapping on superficial muscle layers.",
        "mechanism": "Increased circulation and lymphatic drainage, parasympathetic activation (vagal tone increase), oxytocin release, reduced cortisol",
        "conditions": ["Stress reduction", "Muscle tension", "Mild pain", "Anxiety", "Insomnia", "Depression"],
        "evidence_grade": "B",
        "contraindications": ["Open wounds", "Acute infection", "Deep vein thrombosis", "Severe osteoporosis", "Uncontrolled hypertension", "Fever"],
        "practitioner_requirements": "Licensed massage therapist (LMT) or equivalent state credential",
    },
    {
        "id": "t-033",
        "name": "Deep Tissue / Therapeutic Massage",
        "category": "massage",
        "description": "Focused pressure on deeper muscle layers and connective tissue to release chronic tension patterns.",
        "mechanism": "Myofascial release, trigger point deactivation, mechanical pressure-induced vasodilation, pain-gate modulation",
        "conditions": ["Chronic musculoskeletal pain", "Postural dysfunction", "Overuse injuries", "Whiplash", "Adhesions/scar tissue"],
        "evidence_grade": "B",
        "contraindications": ["Osteoporosis", "Recent surgery (<6 weeks)", "Bleeding disorders", "Active cancer at treatment site", "Acute inflammation", "Anticoagulant therapy (bruising risk)"],
        "practitioner_requirements": "Licensed massage therapist with advanced deep tissue/therapeutic training",
    },
    {
        "id": "t-034",
        "name": "Trigger Point Therapy",
        "category": "massage",
        "description": "Sustained compression on hyperirritable nodules within taut muscle bands to deactivate referred pain patterns.",
        "mechanism": "Neuromuscular reset via sustained ischemic compression; local twitch response; restoration of sarcomere length",
        "conditions": ["Myofascial pain syndrome", "Tension-type headache", "Referred pain patterns", "Chronic regional pain", "TMJ dysfunction"],
        "evidence_grade": "B",
        "contraindications": ["Acute inflammation at site", "Neuropathy at compression site", "Recent surgical incision", "Anticoagulation"],
        "practitioner_requirements": "Licensed massage therapist or physical therapist with myofascial trigger point training",
    },
    {
        "id": "t-035",
        "name": "Myofascial Release",
        "category": "massage",
        "description": "Gentle, sustained pressure and stretching of fascial restrictions to restore tissue mobility.",
        "mechanism": "Piezoelectric effect in fascia initiates mechanotransduction; collagen remodeling; thixotropic change in ground substance",
        "conditions": ["Chronic pain", "Fibromyalgia", "Restricted range of motion", "TMJ dysfunction", "Adhesions", "Post-surgical scarring"],
        "evidence_grade": "C",
        "contraindications": ["Acute inflammation", "Open wounds", "Malignancy at treatment site", "Unstable fractures", "Rheumatoid arthritis (acute flare)"],
        "practitioner_requirements": "Licensed massage therapist, physical therapist, or John F. Barnes-trained myofascial release practitioner",
    },
    {
        "id": "t-036",
        "name": "Craniosacral Therapy",
        "category": "massage",
        "description": "Gentle manual manipulation assessing and treating craniosacral rhythm and fascial restrictions.",
        "mechanism": "Cerebrospinal fluid dynamics optimization; fascial release; parasympathetic activation through vagal stimulation; proposed subtle cranial bone mobility effects",
        "conditions": ["Migraine", "TMJ dysfunction", "Chronic neck/back pain", "Stress", "Insomnia", "Colic (infants)", "Sinus issues"],
        "evidence_grade": "D",
        "contraindications": ["Arnold-Chiari malformation", "Increased intracranial pressure", "Severe head trauma (acute)", "Cerebral aneurysm", "Recent skull fracture"],
        "practitioner_requirements": "Upledger Institute CST certification or Biodynamic craniosacral therapy training",
    },
    {
        "id": "t-037",
        "name": "Manual Lymphatic Drainage (MLD)",
        "category": "massage",
        "description": "Gentle, rhythmic skin-stretching techniques to stimulate lymphatic vessel contraction and drainage.",
        "mechanism": "Mechanical stimulation of lymphangion contraction; increased lymphatic flow velocity; reduced tissue interstitial fluid",
        "conditions": ["Lymphedema (primary and secondary)", "Post-surgical swelling", "Chronic venous insufficiency", "Fibromyalgia", "Chronic fatigue syndrome"],
        "evidence_grade": "B",
        "contraindications": ["Active infection/cellulitis", "Congestive heart failure", "Active cancer without oncology clearance", "Acute deep vein thrombosis", "Renal failure"],
        "practitioner_requirements": "Certified lymphedema therapist (CLT-LANA or Vodder/MLD certified)",
    },
    {
        "id": "t-038",
        "name": "Reflexology",
        "category": "massage",
        "description": "Pressure applied to specific zones on feet, hands, and ears corresponding to body organs and systems.",
        "mechanism": "Zone theory and meridian-based reflex responses; autonomic modulation through cutaneous-visceral reflexes; relaxation response",
        "conditions": ["Stress", "Anxiety", "Chronic pain", "Insomnia", "Premenstrual syndrome", "Digestive complaints"],
        "evidence_grade": "C",
        "contraindications": ["Foot ulcers", "Recent foot surgery", "Severe peripheral edema", "Active gout (affected foot)", "Deep vein thrombosis (lower extremity)"],
        "practitioner_requirements": "Certified reflexologist (ARC or equivalent national certification)",
    },
    {
        "id": "t-039",
        "name": "Shiatsu",
        "category": "massage",
        "description": "Japanese bodywork using finger pressure, palm pressure, stretches, and rotations along meridian lines.",
        "mechanism": "Meridian energy balancing; acupressure point stimulation; fascial stretching; autonomic regulation",
        "conditions": ["Stress", "Muscle tension", "Digestive complaints", "Fatigue", "Insomnia", "Mild anxiety"],
        "evidence_grade": "C",
        "contraindications": ["Pregnancy (certain pressure points)", "Acute inflammation", "Fractures", "Recent surgery", "Contagious skin conditions"],
        "practitioner_requirements": "Certified shiatsu practitioner (AOBTA or NCCAOM Asian Bodywork Therapy)",
    },
    {
        "id": "t-040",
        "name": "Thai Massage / Thai Yoga Therapy",
        "category": "massage",
        "description": "Assisted yoga-like stretching combined with compression along energy lines (Sen).",
        "mechanism": "Passive stretching, joint mobilization, energy line (Sen) compression, myofascial release",
        "conditions": ["Flexibility limitations", "Chronic pain", "Stress", "Muscle tension", "Postural imbalance"],
        "evidence_grade": "C",
        "contraindications": ["Joint hypermobility/instability", "Recent surgery", "Osteoporosis", "Herniated disc (acute)", "Pregnancy (modified approach)"],
        "practitioner_requirements": "Certified Thai massage practitioner from recognized Thai massage school",
    },
    {
        "id": "t-041",
        "name": "Receptive Music Therapy",
        "category": "music-art",
        "description": "Therapeutic listening to live or recorded music selected for specific clinical goals.",
        "mechanism": "Auditory cortex-limbic pathway activation; entrainment of physiological rhythms (heart rate, respiration); dopamine and oxytocin release; emotional memory processing",
        "conditions": ["Depression", "Anxiety", "Pain", "Dementia/Alzheimer's", "Autism spectrum", "Substance use disorder", "Palliative care", "Post-stroke aphasia"],
        "evidence_grade": "B",
        "contraindications": ["Hyperacusis (volume-controlled approach needed)", "Music-triggered PTSD (specific genres/associations)", "Hearing impairment (without amplification)"],
        "practitioner_requirements": "Board-certified music therapist (MT-BC); CBMT credential required",
    },
    {
        "id": "t-042",
        "name": "Active Music Therapy",
        "category": "music-art",
        "description": "Playing instruments, singing, songwriting, and improvisation for therapeutic goals.",
        "mechanism": "Emotional expression through nonverbal channel; motor coordination and rehabilitation; social engagement and turn-taking; identity reconstruction",
        "conditions": ["Depression", "Autism spectrum", "Neurological rehabilitation (stroke, TBI)", "Substance use", "Schizophrenia", "Developmental disabilities"],
        "evidence_grade": "B",
        "contraindications": ["None significant; modifications available for all functional levels"],
        "practitioner_requirements": "Board-certified music therapist (MT-BC)",
    },
    {
        "id": "t-043",
        "name": "Art Therapy",
        "category": "music-art",
        "description": "Use of art media and the creative process for psychological exploration, expression, and healing.",
        "mechanism": "Nonverbal emotional processing; bilateral brain engagement (creative and analytical hemispheres); projection and sublimation; sensory modulation",
        "conditions": ["PTSD", "Depression", "Anxiety", "Trauma", "Autism", "Eating disorders", "Grief", "Chronic illness", "Cognitive decline"],
        "evidence_grade": "B",
        "contraindications": ["None significant; media selection should account for motor limitations and sensory sensitivities"],
        "practitioner_requirements": "Registered art therapist (ATR-BC) with master's degree in art therapy",
    },
    {
        "id": "t-044",
        "name": "Dance/Movement Therapy (DMT)",
        "category": "music-art",
        "description": "Psychotherapeutic use of movement to promote emotional, social, cognitive, and physical integration.",
        "mechanism": "Body-mind integration; proprioceptive and interoceptive awareness enhancement; nonverbal communication and expression; neuroplasticity through novel movement patterns",
        "conditions": ["Depression", "Trauma", "Autism spectrum", "Body image disorders", "Parkinson's disease", "Dementia", "Social anxiety"],
        "evidence_grade": "C",
        "contraindications": ["Severe mobility limitations (adapted approach available)", "Acute injury", "Unstable cardiovascular status"],
        "practitioner_requirements": "Board-certified dance/movement therapist (BC-DMT); master's degree required",
    },
    {
        "id": "t-045",
        "name": "Drama Therapy",
        "category": "music-art",
        "description": "Use of theatrical techniques (role-play, storytelling, performance) for therapeutic growth.",
        "mechanism": "Role distance allows exploration of difficult emotions safely; narrative reconstruction; social skills practice through embodied interaction; projective identification",
        "conditions": ["Trauma", "Autism spectrum", "Social anxiety", "Substance use", "Behavioral issues", "Developmental disabilities"],
        "evidence_grade": "C",
        "contraindications": ["Active psychosis", "Severe dissociation", "Extreme social withdrawal precluding group participation"],
        "practitioner_requirements": "Registered drama therapist (RDT) with NADTA credential; master's degree",
    },
    {
        "id": "t-046",
        "name": "Poetry / Bibliotherapy",
        "category": "music-art",
        "description": "Therapeutic use of poems, literature, and written expression for insight and emotional processing.",
        "mechanism": "Narrative processing, metaphorical thinking, emotional distancing through literary identification, validation of experience through shared human themes",
        "conditions": ["Depression", "Grief", "Identity issues", "Terminal illness existential distress", "Social isolation"],
        "evidence_grade": "D",
        "contraindications": ["None significant"],
        "practitioner_requirements": "Certified poetry therapist (CPT) or licensed mental health professional",
    },
    {
        "id": "t-047",
        "name": "Horticultural Therapy",
        "category": "other",
        "description": "Therapeutic engagement in gardening and plant-based activities for physical and psychological benefits.",
        "mechanism": "Biophilia hypothesis (human-nature connection), sensory engagement, purposeful activity with tangible outcomes, gentle physical activity, microbiome exposure",
        "conditions": ["Depression", "Dementia", "Rehabilitation (stroke, TBI)", "PTSD", "Autism", "Substance use recovery", "Intellectual disabilities"],
        "evidence_grade": "C",
        "contraindications": ["Severe plant allergies", "Severe mobility limitations (container gardening adaptations available)"],
        "practitioner_requirements": "Registered horticultural therapist (HTR) with AHTA credential",
    },
    {
        "id": "t-048",
        "name": "Animal-Assisted Therapy",
        "category": "other",
        "description": "Structured therapeutic interventions incorporating trained animals as part of the treatment process.",
        "mechanism": "Oxytocin release through human-animal bond, social engagement scaffolding, emotional regulation through tactile interaction, reduced cortisol, increased motivation",
        "conditions": ["Anxiety", "PTSD", "Autism spectrum", "Depression", "Cardiovascular rehabilitation", "Chronic pain", "Substance use", "Behavioral issues"],
        "evidence_grade": "B",
        "contraindications": ["Animal allergies", "Animal phobia (specific)", "Immunocompromised status (zoonosis risk)", "History of animal cruelty"],
        "practitioner_requirements": "Certified AAT handler with clinical team; animal must be registered therapy animal through Pet Partners or equivalent",
    },
    {
        "id": "t-049",
        "name": "Forest Bathing (Shinrin-yoku)",
        "category": "other",
        "description": "Immersive exposure to forest/natural environments with mindful engagement of the senses.",
        "mechanism": "Phytoncide (tree volatile organic compound) inhalation with NK cell enhancement; attention restoration theory; parasympathetic activation; vitamin D synthesis",
        "conditions": ["Chronic stress", "Hypertension", "Immune dysfunction", "Mood disorders", "Attention fatigue", "Burnout"],
        "evidence_grade": "B",
        "contraindications": ["Severe mobility limitations (modified accessible trails available)", "Severe environmental allergies", "Photosensitivity disorders"],
        "practitioner_requirements": "Certified forest therapy guide (ANFT or Forest Therapy Hub)",
    },
    {
        "id": "t-050",
        "name": "Floatation-REST Therapy",
        "category": "other",
        "description": "Sensory deprivation in a buoyant Epsom salt solution tank for relaxation and introspection.",
        "mechanism": "Reduced sensory input decreases amygdala activity; magnesium absorption through skin (proposed); theta brain state induction; GABAergic tone enhancement",
        "conditions": ["Anxiety", "Chronic pain", "Insomnia", "Stress", "Creativity blocks", "Athletic recovery", "PTSD hyperarousal"],
        "evidence_grade": "C",
        "contraindications": ["Open wounds or skin infections", "Epilepsy", "Severe claustrophobia", "Kidney disease (magnesium absorption)", "Low blood pressure (post-float dizziness)"],
        "practitioner_requirements": "Trained float center operator; first aid certification required",
    },
    {
        "id": "t-051",
        "name": "Halotherapy (Dry Salt Therapy)",
        "category": "other",
        "description": "Inhalation of micronized dry salt particles in a controlled environment (salt room or halogenerator).",
        "mechanism": "Mucolytic effect of salt particles; anti-inflammatory action on respiratory mucosa; antimicrobial properties; ciliary function enhancement",
        "conditions": ["Asthma", "Allergic rhinitis", "Chronic bronchitis", "COPD", "Cystic fibrosis", "Sinusitis", "Smoker's cough"],
        "evidence_grade": "C",
        "contraindications": ["Hyperthyroidism (iodine content in some salts)", "Tuberculosis", "Hemoptysis", "Severe hypertension", "Acute infectious disease", "Open tuberculosis"],
        "practitioner_requirements": "Trained halotherapy technician; facility should have halogenerator certification",
    },
    {
        "id": "t-052",
        "name": "Aromatherapy",
        "category": "other",
        "description": "Therapeutic use of essential oils via inhalation, topical application, or diffusion for physical and psychological effects.",
        "mechanism": "Olfactory-limbic pathway direct access (amygdala, hippocampus); pharmacological effects of volatile compounds on neurotransmitter systems; topical anti-inflammatory effects",
        "conditions": ["Anxiety", "Insomnia", "Nausea (ginger, peppermint)", "Mild pain (lavender, peppermint)", "Stress", "Cognitive support (rosemary)", "Depression (citrus oils)"],
        "evidence_grade": "C",
        "contraindications": ["Skin sensitivity/allergy to specific oil", "Asthma (some oils may trigger bronchospasm: eucalyptus in sensitive individuals)", "Pregnancy (specific oils: sage, rosemary, jasmine in high doses)", "Pets in environment (toxicity to cats: tea tree, peppermint)", "Photosensitivity (citrus oils + UV exposure)", "Hormone-sensitive conditions (lavender/tea tree prepubertal gynecomastia concern)"],
        "practitioner_requirements": "Certified aromatherapist (NAHA Level 2 or equivalent); essential oils should be analytical tested (GC/MS)",
    },
    {
        "id": "t-053",
        "name": "Naturopathic Medicine (General)",
        "category": "naturopathic",
        "description": "System of primary healthcare using natural therapeutics including nutrition, herbal medicine, homeopathy, physical medicine, and lifestyle counseling.",
        "mechanism": "Holistic systems-based approach; varies by specific modality used; emphasis on vis medicatrix naturae (healing power of nature)",
        "conditions": ["Chronic disease prevention", "Digestive disorders", "Fatigue", "Hormonal imbalance", "Allergies", "Mental health (integrative)"],
        "evidence_grade": "C",
        "contraindications": ["Should not replace emergency or acute evidence-based care", "Herb-drug interaction potential", "Variable quality of naturopathic education by jurisdiction"],
        "practitioner_requirements": "Licensed naturopathic doctor (ND) from accredited program (CNME); state licensure where applicable",
    },
    {
        "id": "t-054",
        "name": "Traditional Chinese Medicine (TCM) Herbal",
        "category": "naturopathic",
        "description": "Individualized herbal formulas based on TCM pattern differentiation (zheng) and classical formula modification.",
        "mechanism": "Multi-component, multi-target pharmacological action through synergistic herb combinations; anti-inflammatory, immunomodulatory, adaptogenic effects",
        "conditions": ["IBS", "Allergic rhinitis", "Menopausal symptoms", "Chronic fatigue", "Immune support", "Fertility support"],
        "evidence_grade": "C",
        "contraindications": ["Herb-drug interactions", "Heavy metal contamination risk in some products (lead, mercury, arsenic)", "Pregnancy (many herbs contraindicated)", "Liver disease (hepatotoxic herbs)"],
        "practitioner_requirements": "Licensed TCM practitioner (LAc with herbal certification or Dipl. OM from NCCAOM)",
    },
    {
        "id": "t-055",
        "name": "Chiropractic Manipulation",
        "category": "other",
        "description": "Manual adjustment of the spine and joints using high-velocity low-amplitude thrusts.",
        "mechanism": "Neuro-mechanical joint function restoration; proprioceptive input modification; segmental pain modulation; improved range of motion",
        "conditions": ["Acute and chronic low back pain", "Neck pain", "Tension headache", "Migraine", "Joint dysfunction", "Sciatica"],
        "evidence_grade": "B",
        "contraindications": ["Osteoporosis (severe)", "Spinal cord compression", "Vertebral artery dissection risk factors", "Unstable fractures", "Inflammatory arthropathy (active)", "Cauda equina syndrome", "Anticoagulation (cervical manipulation)"],
        "practitioner_requirements": "Doctor of Chiropractic (DC) from CCE-accredited program; state licensure",
    },
    {
        "id": "t-056",
        "name": "Osteopathic Manipulative Medicine (OMM)",
        "category": "other",
        "description": "Hands-on techniques including myofascial release, muscle energy, counterstrain, and high-velocity thrusts.",
        "mechanism": "Somatic dysfunction correction; fascial release; lymphatic and venous drainage enhancement; autonomic balance restoration",
        "conditions": ["Back pain", "Neck pain", "Migraine", "Respiratory conditions (pneumonia, asthma)", "Edema", "Pregnancy-related pain", "Colic (infants)"],
        "evidence_grade": "B",
        "contraindications": ["Fractures", "Bone cancer", "Joint infection", "Osteoporosis (high-velocity techniques)", "Severe osteoporosis", "Bleeding disorders"],
        "practitioner_requirements": "Doctor of Osteopathic Medicine (DO) or osteopathic manipulative medicine specialist",
    },
    {
        "id": "t-057",
        "name": "Feldenkrais Method",
        "category": "other",
        "description": "Gentle movement lessons designed to improve posture, flexibility, and coordination through awareness.",
        "mechanism": "Neuroplasticity via differentiated motor learning; proprioceptive re-education; reduction of habitual compensatory patterns",
        "conditions": ["Chronic pain", "Movement disorders", "Neurological rehabilitation", "Performance improvement (musicians, athletes)", "Postural dysfunction"],
        "evidence_grade": "C",
        "contraindications": ["Acute injury (gentle approach only)"],
        "practitioner_requirements": "Guild Certified Feldenkrais Practitioner (GCFP)",
    },
    {
        "id": "t-058",
        "name": "Alexander Technique",
        "category": "other",
        "description": "Postural re-education through conscious awareness and inhibition of habitual movement and tension patterns.",
        "mechanism": "Motor control re-patterning; postural reflex optimization; kinesthetic awareness enhancement; head-neck-back relationship restoration",
        "conditions": ["Chronic back pain", "Neck pain", "Repetitive strain injury", "Voice disorders", "Posture improvement", "Parkinson's disease (gait/balance)", "Performance anxiety"],
        "evidence_grade": "B",
        "contraindications": ["None significant; gentle approach suitable for all ages and conditions"],
        "practitioner_requirements": "Certified Alexander Technique teacher (STAT, AmSAT, or equivalent society membership)",
    },
    {
        "id": "t-059",
        "name": "Clinical Hypnotherapy",
        "category": "other",
        "description": "Therapeutic use of hypnosis for behavioral and symptom change through focused attention and suggestibility.",
        "mechanism": "Altered state of consciousness (highly focused attention with peripheral awareness reduction); enhanced suggestibility; access to subconscious processing; top-down modulation of pain perception",
        "conditions": ["Pain management (acute and chronic)", "Anxiety", "Phobias", "IBS", "Smoking cessation", "PTSD", "Pre-surgical preparation", "Labor pain", "Sleep disorders"],
        "evidence_grade": "B",
        "contraindications": ["Severe mental illness (active psychosis)", "Dissociative disorders", "Substance intoxication", "Severe cognitive impairment", "Personality disorders (caution)"],
        "practitioner_requirements": "Licensed clinician with ASCH-approved hypnotherapy training; ASCH certification preferred",
    },
    {
        "id": "t-060",
        "name": "Integrative Health Coaching",
        "category": "other",
        "description": "Patient-centered coaching for sustainable lifestyle behavior change using motivational interviewing.",
        "mechanism": "Self-determination theory (autonomy, competence, relatedness); motivational interviewing (change talk amplification); goal-setting theory; social cognitive theory",
        "conditions": ["Chronic disease self-management", "Weight management", "Stress reduction", "Adherence support", "Diabetes self-management", "Lifestyle modification"],
        "evidence_grade": "B",
        "contraindications": ["None; coaching complements but does not replace clinical care"],
        "practitioner_requirements": "NBHWC National Board Certified Health and Wellness Coach (NBC-HWC)",
    },
    {
        "id": "t-061",
        "name": "Functional Medicine",
        "category": "other",
        "description": "Systems-biology approach addressing root causes of disease through personalized lifestyle, nutrition, and targeted interventions.",
        "mechanism": "Personalized systems medicine; gut-brain axis optimization; metabolic restoration; detoxification support; hormonal balance; nutrient repletion",
        "conditions": ["Chronic complex conditions", "Autoimmune disease", "GI disorders (SIBO, leaky gut, IBD)", "Chronic fatigue", "Thyroid dysfunction", "Metabolic syndrome"],
        "evidence_grade": "C",
        "contraindications": ["Should not replace emergency or acute evidence-based medical care", "Extensive (and expensive) testing may be burdensome without clear clinical benefit"],
        "practitioner_requirements": "IFM (Institute for Functional Medicine) certified practitioner; licensed healthcare provider",
    },
]

# ---------------------------------------------------------------------------
# CONTRAINDICATION RULES ENGINE
# ---------------------------------------------------------------------------

CONTRAINDICATION_RULES: Dict[str, List[Dict[str, Any]]] = {
    "pregnancy": [
        {"therapy_pattern": "electroacupuncture", "level": "critical", "message": "Electroacupuncture contraindicated in pregnancy — electrical stimulation risk to fetus."},
        {"therapy_pattern": "tDCS", "level": "critical", "message": "tDCS contraindicated in pregnancy — insufficient safety data for fetal exposure."},
        {"therapy_pattern": "tACS", "level": "critical", "message": "tACS contraindicated in pregnancy."},
        {"therapy_pattern": "tPBM", "level": "warning", "message": "tPBM — insufficient safety data in pregnancy; avoid abdominal/direct uterine exposure."},
        {"therapy_pattern": "CES", "level": "critical", "message": "CES contraindicated in pregnancy — fetal safety unknown."},
        {"therapy_pattern": "deep_tissue", "level": "warning", "message": "Deep tissue massage — avoid abdominal pressure; modify positioning after first trimester."},
        {"therapy_pattern": "acupuncture", "level": "warning", "message": "Avoid points LI4, SP6, BL60, GB21, UB67 during pregnancy."},
    ],
    "pacemaker_icd": [
        {"therapy_pattern": "electroacupuncture", "level": "critical", "message": "Electroacupuncture contraindicated with pacemaker/ICD — electrical interference risk."},
        {"therapy_pattern": "CES", "level": "critical", "message": "CES contraindicated with implanted cardiac device."},
        {"therapy_pattern": "tDCS", "level": "warning", "message": "tDCS — consult cardiology; risk of device interference."},
        {"therapy_pattern": "tACS", "level": "warning", "message": "tACS — consult cardiology before use."},
    ],
    "bleeding_disorder": [
        {"therapy_pattern": "acupuncture", "level": "warning", "message": "Acupuncture — increased bruising/bleeding risk; use finer needles, avoid aggressive needling."},
        {"therapy_pattern": "deep_tissue", "level": "warning", "message": "Deep tissue massage — increased bruising risk; use light to moderate pressure only."},
        {"therapy_pattern": "cupping", "level": "warning", "message": "Cupping — high risk of hematoma and bruising in coagulopathy."},
    ],
    "epilepsy": [
        {"therapy_pattern": "alpha_theta", "level": "warning", "message": "Alpha-theta neurofeedback — theta training may lower seizure threshold in susceptible individuals."},
        {"therapy_pattern": "CES", "level": "warning", "message": "CES — theoretical seizure risk; use with caution and medical oversight."},
        {"therapy_pattern": "tDCS", "level": "warning", "message": "tDCS — consult neurologist; current may affect seizure threshold."},
        {"therapy_pattern": "tACS", "level": "warning", "message": "tACS — rhythmic stimulation may entrain epileptic activity; avoid."},
        {"therapy_pattern": "floatation", "level": "warning", "message": "Floatation-REST — sensory deprivation may trigger seizures in photosensitive epilepsy."},
    ],
    "severe_depression": [
        {"therapy_pattern": "homeopathy", "level": "critical", "message": "Homeopathy should not replace evidence-based treatment for severe depression."},
        {"therapy_pattern": "MBCT", "level": "warning", "message": "MBCT indicated for recurrent depression but not during acute severe episode — stabilize first."},
    ],
    "cancer_active": [
        {"therapy_pattern": "massage", "level": "warning", "message": "Avoid massage directly over tumor site or lymph nodes at risk of lymphedema."},
        {"therapy_pattern": "acupuncture", "level": "warning", "message": "Use sterile disposable needles; avoid immunosuppressive points during chemotherapy."},
        {"therapy_pattern": "herbal", "level": "critical", "message": "Many herbal supplements interact with chemotherapy — mandatory oncology consultation."},
    ],
    "glaucoma": [
        {"therapy_pattern": "yoga", "level": "warning", "message": "Avoid inverted poses (head below heart) — increases intraocular pressure."},
    ],
    "osteoporosis_severe": [
        {"therapy_pattern": "chiropractic", "level": "critical", "message": "High-velocity spinal manipulation contraindicated with severe osteoporosis."},
        {"therapy_pattern": "deep_tissue", "level": "warning", "message": "Deep pressure contraindicated — risk of fracture."},
    ],
    "liver_disease": [
        {"therapy_pattern": "herbal", "level": "warning", "message": "Many herbs are hepatotoxic (kava, comfrey, black cohosh, chaparral) — verify liver safety."},
    ],
    "immunosuppressed": [
        {"therapy_pattern": "herbal", "level": "warning", "message": "Echinacea, astragalus, and other immunostimulants may counteract immunosuppression."},
    ],
}

# ---------------------------------------------------------------------------
# EVIDENCE SUMMARIES BY THERAPY TYPE
# ---------------------------------------------------------------------------

EVIDENCE_SUMMARIES: Dict[str, List[Dict[str, Any]]] = {
    "acupuncture": [
        {"condition": "Chronic low back pain", "grade": "A", "key_reference": "Vickers et al. 2018 Archives of Internal Medicine (meta-analysis, n=20,827)", "effect_summary": "Moderate effect vs sham; clinically meaningful for chronic pain"},
        {"condition": "Knee osteoarthritis", "grade": "A", "key_reference": "Corbett et al. 2013 Osteoarthritis and Cartilage (meta-analysis)", "effect_summary": "Significant pain reduction vs sham at 3-6 months"},
        {"condition": "Migraine prophylaxis", "grade": "B", "key_reference": "Linde et al. 2016 Cochrane Database (n=4,985)", "effect_summary": "Moderate reduction in headache frequency"},
        {"condition": "Tension-type headache", "grade": "A", "key_reference": "Linde et al. 2009 Cochrane Database", "effect_summary": "Small but significant reduction in headache frequency and intensity"},
        {"condition": "Generalized anxiety disorder", "grade": "B", "key_reference": "Goyata et al. 2016 Revista Brasileira de Enfermagem (RCT, n=120)", "effect_summary": "Significant reduction in HAM-A scores"},
        {"condition": "Major depressive disorder", "grade": "B", "key_reference": "MacPherson et al. 2013 PLOS Medicine (n=755)", "effect_summary": "Acupuncture + counseling showed benefit over usual care alone"},
        {"condition": "Chemotherapy-induced nausea/vomiting", "grade": "A", "key_reference": "Ezzo et al. 2006 JCO (Cochrane review)", "effect_summary": "Effective for acute chemotherapy-induced vomiting"},
        {"condition": "Allergic rhinitis", "grade": "A", "key_reference": "Brinkhaus et al. 2013 Annals of Internal Medicine", "effect_summary": "Statistically significant improvement in RQLQ scores"},
        {"condition": "Insomnia", "grade": "C", "key_reference": "Cao et al. 2019 Sleep Medicine (systematic review)", "effect_summary": "Moderate effect on sleep quality; limited high-quality RCTs"},
        {"condition": "Neck pain", "grade": "A", "key_reference": "Trinh et al. 2016 Cochrane Database", "effect_summary": "Moderate evidence for short-term pain relief"},
    ],
    "neurofeedback": [
        {"condition": "ADHD (SMR training)", "grade": "B", "key_reference": "Arns et al. 2014 EEG and Clinical Neuroscience", "effect_summary": "Enduring effects at 6-month follow-up; medium effect size"},
        {"condition": "ADHD (SCP training)", "grade": "A", "key_reference": "Strehl et al. 2006 Journal of Clinical Neurophysiology", "effect_summary": "Comparable to methylphenidate at 6 months; sustained at 2 years"},
        {"condition": "Epilepsy (SMR)", "grade": "B", "key_reference": "Sterman & Egner 2006 Applied Psychophysiology & Biofeedback", "effect_summary": "Seizure reduction in 82% of patients in early trials"},
        {"condition": "PTSD (alpha-theta)", "grade": "B", "key_reference": "Peniston & Kulkosky 1991 Medical Psychotherapy", "effect_summary": "Significant reduction in PTSD symptoms vs control"},
        {"condition": "Depression (alpha asymmetry)", "grade": "C", "key_reference": "Choi et al. 2011 Neuroscience Letters", "effect_summary": "Mixed results; some positive RCTs"},
        {"condition": "Anxiety (alpha enhancement)", "grade": "C", "key_reference": "Hammond 2005 Journal of Neurotherapy", "effect_summary": "Small positive effect; more research needed"},
        {"condition": "Substance use disorder", "grade": "C", "key_reference": "Sokhadze et al. 2008 (pilot studies)", "effect_summary": "Promising preliminary data"},
    ],
    "ces": [
        {"condition": "Generalized anxiety disorder", "grade": "B", "key_reference": "Bystritsky et al. 2008 Journal of Clinical Psychiatry (double-blind RCT)", "effect_summary": "Significant reduction in HAM-A scores vs sham at 4-6 weeks"},
        {"condition": "Insomnia", "grade": "B", "key_reference": "Lande & Gragnani 2013 Journal of Rehabilitation R&D", "effect_summary": "Improved sleep latency and quality; effect sizes moderate"},
        {"condition": "Major depressive disorder", "grade": "C", "key_reference": "Shealy et al. 1989 pilot studies", "effect_summary": "Some positive open-label trials; limited RCT evidence"},
        {"condition": "PTSD", "grade": "C", "key_reference": "Rohan et al. 2014 open-label trial", "effect_summary": "Modest improvement in CAPS scores"},
        {"condition": "Dental anxiety", "grade": "B", "key_reference": "Ghxase et al. 2019 RCT", "effect_summary": "Effective pre-procedure anxiety reduction"},
    ],
    "pbm": [
        {"condition": "Major depressive disorder (adjunct)", "grade": "B", "key_reference": "Cassano et al. 2018 Psychiatry Research: Neuroimaging (sham-controlled RCT)", "effect_summary": "Significant HAM-D reduction with 810 nm tPBM to left DLPFC"},
        {"condition": "Traumatic brain injury", "grade": "B", "key_reference": "Naeser et al. 2014 Photomedicine and Laser Surgery (case series)", "effect_summary": "Improved cognition, sleep, and PTSD symptoms in chronic TBI"},
        {"condition": "Mild cognitive impairment", "grade": "C", "key_reference": "Saltmarche et al. 2017 Photobiomodulation, Photomedicine, and Laser Surgery", "effect_summary": "Improved cognitive scores and cerebral perfusion"},
        {"condition": "Knee osteoarthritis (LLLT)", "grade": "A", "key_reference": "Bjordal et al. 2007 The Lancet (meta-analysis)", "effect_summary": "Significant pain reduction and functional improvement"},
        {"condition": "Chronic neck pain", "grade": "A", "key_reference": "Chow et al. 2009 The Lancet (LLLT meta-analysis)", "effect_summary": "Immediate and short-term pain reduction"},
        {"condition": "Wound healing (diabetic ulcers)", "grade": "A", "key_reference": "Houreld 2014 Wound Repair and Regeneration", "effect_summary": "Accelerated healing rate and improved granulation tissue"},
    ],
    "mind-body": [
        {"condition": "Chronic stress (MBSR)", "grade": "A", "key_reference": "Goyal et al. 2014 JAMA Internal Medicine (meta-analysis, n=3,515)", "effect_summary": "Moderate evidence for stress reduction; small but consistent effects on anxiety/depression"},
        {"condition": "Recurrent depression (MBCT)", "grade": "A", "key_reference": "Kuyken et al. 2016 The Lancet (RCT, n=424)", "effect_summary": "Non-inferior to maintenance antidepressants for relapse prevention"},
        {"condition": "ADHD (mindfulness)", "grade": "C", "key_reference": "Cairncross & Miller 2020 JAACAP (meta-analysis)", "effect_summary": "Small effect on attention and executive function"},
        {"condition": "Anxiety (yoga)", "grade": "B", "key_reference": "Cramer et al. 2018 Deutsches Arzteblatt International (meta-analysis)", "effect_summary": "Moderate anxiety reduction vs control"},
        {"condition": "Low back pain (yoga)", "grade": "A", "key_reference": "Cramer et al. 2013 Clinical Journal of Pain (meta-analysis)", "effect_summary": "Short-term improvement in pain and disability"},
        {"condition": "Fall prevention (tai chi)", "grade": "A", "key_reference": "Wayne et al. 2014 Journal of Gerontology (meta-analysis)", "effect_summary": "43% reduction in fall rate; improved balance measures"},
        {"condition": "Fibromyalgia (tai chi)", "grade": "B", "key_reference": "Wang et al. 2010 New England Journal of Medicine (RCT)", "effect_summary": "Significant improvement in FIQ scores vs wellness education"},
        {"condition": "Parkinson's disease (tai chi)", "grade": "B", "key_reference": "Li et al. 2012 New England Journal of Medicine (RCT)", "effect_summary": "Improved balance and reduced falls; reduced PDQ-39 scores"},
        {"condition": "Hypertension (breathwork)", "grade": "B", "key_reference": "Zaccaro et al. 2018 Frontiers in Psychology", "effect_summary": "Slow breathing reduces systolic BP by 5-10 mmHg"},
        {"condition": "Asthma (pranayama)", "grade": "C", "key_reference": "Saxena & Saxena 2009 (systematic review)", "effect_summary": "Modest improvement in FEV1 and symptom scores"},
    ],
    "massage": [
        {"condition": "Chronic low back pain", "grade": "A", "key_reference": "Cherkin et al. 2011 Annals of Internal Medicine (RCT, n=401)", "effect_summary": "Structural and relaxation massage both effective at 10 weeks; sustained at 26 weeks"},
        {"condition": "Chronic neck pain", "grade": "A", "key_reference": "Sherman et al. 2009 Spine Journal (RCT)", "effect_summary": "10 massage sessions over 10 weeks provided significant pain reduction"},
        {"condition": "Anxiety", "grade": "B", "key_reference": "Moyer et al. 2004 Journal of Applied Psychology (meta-analysis)", "effect_summary": "Single sessions reduce state anxiety; multiple sessions reduce trait anxiety"},
        {"condition": "Tension headache", "grade": "B", "key_reference": "Quinn et al. 2002 American Journal of Public Health", "effect_summary": "Reduced frequency, intensity, and duration"},
        {"condition": "Cancer-related pain", "grade": "B", "key_reference": "Wilkinson et al. 2008 Cochrane Database", "effect_summary": "Some evidence for short-term pain relief"},
        {"condition": "Post-operative pain", "grade": "B", "key_reference": "Adams et al. 2010 Complementary Therapies in Clinical Practice", "effect_summary": "Reduced opioid requirement in some surgical populations"},
        {"condition": "Lymphedema (MLD)", "grade": "B", "key_reference": "Vignes et al. 2011 Lymphology", "effect_summary": "Effective as adjunct to compression therapy"},
        {"condition": "Preterm infant weight gain", "grade": "B", "key_reference": "Field et al. 2010 Infant Behavior and Development", "effect_summary": "Moderate pressure massage increases weight gain in preterm infants"},
    ],
    "music-art": [
        {"condition": "Depression (music therapy)", "grade": "B", "key_reference": "Erkkila et al. 2011 British Journal of Psychiatry (RCT, n=79)", "effect_summary": "Short-term improvement in depression scores vs standard care"},
        {"condition": "Autism (music therapy)", "grade": "B", "key_reference": "Geretsegger et al. 2014 Cochrane Database", "effect_summary": "Improved social interaction and communication skills"},
        {"condition": "Dementia (receptive music)", "grade": "B", "key_reference": "Sarkamo et al. 2008 Brain (RCT)", "effect_summary": "Improved cognition, mood, and quality of life"},
        {"condition": "Perioperative pain (music)", "grade": "A", "key_reference": "Hole et al. 2015 The Lancet (meta-analysis, n=7,000)", "effect_summary": "Significant reduction in postoperative pain, anxiety, and opioid use"},
        {"condition": "PTSD (art therapy)", "grade": "C", "key_reference": "Schouten et al. 2015 Trauma, Violence & Abuse", "effect_summary": "Preliminary evidence for trauma symptom reduction"},
        {"condition": "Cancer distress (art therapy)", "grade": "B", "key_reference": "Wood et al. 2011 Cancer Nursing", "effect_summary": "Reduction in anxiety and depression scores"},
        {"condition": "Schizophrenia (art therapy)", "grade": "C", "key_reference": "Patterson et al. 2011 Cochrane Database", "effect_summary": "Limited evidence; may improve negative symptoms modestly"},
        {"condition": "Chronic illness coping (drama therapy)", "grade": "C", "key_reference": "Rousseau et al. 2013 Arts in Psychotherapy", "effect_summary": "Preliminary evidence for improved coping and self-efficacy"},
    ],
}

# ---------------------------------------------------------------------------
# 10 PROTOCOL TEMPLATES
# ---------------------------------------------------------------------------

PROTOCOL_TEMPLATES: List[Dict[str, Any]] = [
    {
        "id": "proto-001",
        "template_key": "acupuncture_mood",
        "name": "Acupuncture for Depression/Anxiety",
        "description": "10-session acupuncture course targeting standard and supplemental points for depression and anxiety symptom management.",
        "weeks": 10,
        "sessions_count": 10,
        "frequency": "1x per week",
        "modalities": ["acupuncture"],
        "conditions": ["Major Depressive Disorder", "Generalized Anxiety Disorder", "Mixed anxiety-depressive disorder"],
        "evidence_grade": "B",
        "primary_points": ["LI4", "LV3", "SP6", "PC6", "HT7", "Yintang", "DU20", "ST36"],
        "outcome_measures": ["HAM-D", "HAM-A", "PHQ-9", "GAD-7", "VAS (distress)", "Pittsburgh Sleep Quality Index"],
        "session_structure": {
            "1-2": "Intake assessment, baseline outcome measures, point sensitivity testing, establish needling tolerance",
            "3-5": "Core treatment phase; focus on deqi achievement; begin tracking symptom changes",
            "6-8": "Mid-course assessment; adjust point selection based on response; add individualized points",
            "9-10": "Final assessment; outcome measures repeated; transition plan to maintenance or discharge",
        },
        "contraindication_check": ["Bleeding disorders", "Pregnancy (SP6, LI4 contraindicated)", "Pacemaker (if electroacupuncture considered)"],
        "safety_monitoring": ["Bruising at needle sites", "Vasovagal response (first session)", "Symptom worsening"],
        "notes": "Based on MacPherson et al. 2013 (ACUDep trial). Maintenance sessions (monthly) may reduce relapse.",
    },
    {
        "id": "proto-002",
        "template_key": "neurofeedback_adhd",
        "name": "Neurofeedback for ADHD",
        "description": "40-session SMR (12-15 Hz) training at C4/Cz with TQ neurofeedback assessment at baseline, mid-course, and completion.",
        "weeks": 20,
        "sessions_count": 40,
        "frequency": "2x per week",
        "modalities": ["neurofeedback"],
        "conditions": ["ADHD (combined, inattentive, hyperactive types)"],
        "evidence_grade": "B",
        "protocol_details": {
            "primary_protocol": "SMR enhancement (12-15 Hz) at C4",
            "secondary_protocol": "Theta suppression (4-8 Hz) at Cz",
            "site": "C4 (primary), Cz (secondary)",
            "threshold_method": "Dynamic threshold at 85th percentile of baseline",
            "reward": "Auditory and visual feedback (game or animation)",
        },
        "outcome_measures": ["TQ Assessment (neurofeedback qEEG)", "CAARS (Conners)", "CGI-S/I", "Test of Variables of Attention (TOVA)", "Academic performance tracking"],
        "session_structure": {
            "1-2": "Baseline QEEG/TQ, symptom assessment, threshold setting, patient orientation",
            "3-20": "Acute training phase; twice weekly; threshold adjusted every 5 sessions; parent/teacher reports at week 10",
            "21-30": "Consolidation phase; reduce to 1-2x weekly if improving; introduce transfer trials (eyes-open, no feedback)",
            "31-40": "Maintenance phase; weekly; fading feedback ratio; post-TQ at session 40; booster plan",
        },
        "contraindication_check": ["Severe psychiatric comorbidity", "Active substance use", "Intellectual disability precluding task engagement"],
        "safety_monitoring": ["Headache post-session", "Fatigue", "Mood changes (monitor for irritability)", "Seizure history (screen before SMR)"],
        "notes": "Based on Arns et al. 2014 meta-analysis. SCP protocol may be used as alternative/addition per Strehl protocol. Booster sessions recommended at 3, 6, 12 months.",
    },
    {
        "id": "proto-003",
        "template_key": "ces_anxiety",
        "name": "CES for Anxiety and Insomnia",
        "description": "4-week daily Cranial Electrotherapy Stimulation protocol for anxiety reduction and sleep quality improvement.",
        "weeks": 4,
        "sessions_count": 28,
        "frequency": "Daily (1-2x per day)",
        "modalities": ["ces"],
        "conditions": ["Generalized Anxiety Disorder", "Insomnia", "Mixed anxiety-insomnia"],
        "evidence_grade": "B",
        "protocol_details": {
            "current": "100-200 μA",
            "frequency": "0.5 Hz (primary) or 100 Hz (alternative)",
            "duration_per_session": "20-60 minutes",
            "electrode_placement": "Bilateral earclips (mastoid or earlobe)",
            "progression": "Start at 100 μA, 20 min; increase to 30-60 min by week 2; adjust frequency based on response",
        },
        "outcome_measures": ["GAD-7", "ISI (Insomnia Severity Index)", "PSQI", "HRV (morning resting)", "Daily anxiety/sleep diary"],
        "session_structure": {
            "Week 1": "100 μA, 0.5 Hz, 20 min daily; establish tolerance; sleep diary initiation; baseline GAD-7, ISI",
            "Week 2": "If partial response: increase to 200 μA or extend to 30-45 min; continue daily; consider 100 Hz if no anxiety response",
            "Week 3": "Optimize settings based on week 2 response; continue daily; GAD-7 and ISI repeated",
            "Week 4": "Final assessment; GAD-7, ISI, PSQI; plan: taper to 3-5x/week for maintenance or discontinue if remitted",
        },
        "contraindication_check": ["Implanted pacemaker/ICD", "Pregnancy", "Epilepsy"],
        "safety_monitoring": ["Skin irritation at electrode sites", "Dizziness", "Headache", "Excessive sedation (timing: avoid morning if sedating)"],
        "notes": "Based on Bystritsky 2008 and Lande & Gragnani 2013. Some patients require 6-8 weeks for full effect. Device: Alpha-Stim, Fisher Wallace, or CES Ultra.",
    },
    {
        "id": "proto-004",
        "template_key": "pbm_cognitive",
        "name": "tPBM for Cognitive Support",
        "description": "8-week transcranial photobiomodulation protocol targeting bilateral prefrontal cortex for cognitive enhancement.",
        "weeks": 8,
        "sessions_count": 24,
        "frequency": "3x per week (Mon/Wed/Fri)",
        "modalities": ["tPBM"],
        "conditions": ["Mild Cognitive Impairment", "Post-COVID brain fog", "Chronic fatigue with cognitive symptoms", "TBI post-acute cognitive symptoms"],
        "evidence_grade": "C",
        "protocol_details": {
            "wavelength": "810 nm (near-infrared)",
            "power_density": "250 mW/cm²",
            "dose_per_site": "60 J/cm²",
            "duration_per_site": "4 minutes",
            "sites": ["Left prefrontal (F3, near AF3)", "Right prefrontal (F4, near AF4)"],
            "total_session_time": "~10 minutes (both sites + setup)",
        },
        "outcome_measures": ["CANTAB cognitive battery", "MoCA", "CVLT-II", "Trail Making A/B", "Patient-reported cognitive symptom scale", "HRV (autonomic function)"],
        "session_structure": {
            "Weeks 1-2": "Establish baseline MoCA/CANTAB; 810 nm, 250 mW/cm², 60 J/cm²; 4 min per site; 3x/week",
            "Weeks 3-4": "Mid-course MoCA; continue 3x/week; monitor for skin reaction; patient cognitive diary",
            "Weeks 5-6": "Continue treatment; if response plateau, consider adding vertex (Cz) for 4 min",
            "Weeks 7-8": "Post-treatment MoCA/CANTAB; repeat Trail Making; plan: 2x/week maintenance or 1x/week taper",
        },
        "contraindication_check": ["Photosensitizing medications", "Active skin cancer at site", "Pregnancy", "Retinal disease (ensure eye protection)"],
        "safety_monitoring": ["Skin warmth or redness (transient)", "Headache", "Eye discomfort (verify eye protection)", "Photosensitivity reactions"],
        "notes": "Based on Saltmarche 2017 and Naeser 2014 case series. Eye protection mandatory. Consider combining with cognitive training for synergistic effect.",
    },
    {
        "id": "proto-005",
        "template_key": "yoga_stress",
        "name": "Yoga + Breathwork for Stress",
        "description": "6-week integrated yoga and pranayama program for stress reduction and autonomic balance.",
        "weeks": 6,
        "sessions_count": 12,
        "frequency": "2x per week in-person + daily home practice",
        "modalities": ["yoga", "breathwork"],
        "conditions": ["Chronic stress", "Burnout", "Anxiety", "Mild depression", "Hypertension (stage 1)"],
        "evidence_grade": "B",
        "protocol_details": {
            "style": "Gentle hatha with restorative elements",
            "session_duration": "60 minutes",
            "structure": "10 min centering/breath awareness → 30 min gentle asana → 10 min pranayama → 10 min guided relaxation/yoga nidra",
            "pranayama": "Week 1-2: diaphragmatic breathing; Week 3-4: 4-7-8 breathing; Week 5-6: alternate nostril (nadi shodhana)",
            "home_practice": "20 min daily (15 min asana + 5 min breathwork)",
        },
        "outcome_measures": ["PSS-10 (Perceived Stress Scale)", "GAD-7", "PHQ-9", "Resting HRV", "Salivary cortisol (morning sample)", "PSQI"],
        "session_structure": {
            "Weeks 1-2": "Establish baseline PSS-10, GAD-7, salivary cortisol; focus on diaphragmatic breathing; foundational poses",
            "Weeks 3-4": "Add 4-7-8 breathing; expand pose repertoire; introduce standing sequences; PSS-10 repeated",
            "Weeks 5-6": "Full program with nadi shodhana; home practice diary review; final assessments; maintenance plan",
        },
        "contraindication_check": ["Uncontrolled hypertension (avoid inversions)", "Glaucoma (no inversions)", "Recent spinal surgery", "Pregnancy (modify supine and inversion poses)", "Acute disc herniation"],
        "safety_monitoring": ["Muscle soreness", "Dizziness during breath retention", "Joint pain", "Exacerbation of anxiety (rare)"],
        "notes": "Based on Cramer et al. 2018 and Pascoe et al. 2017 meta-analyses. Certified yoga therapist (IAYT-CYT) preferred for clinical populations.",
    },
    {
        "id": "proto-006",
        "template_key": "music_mood",
        "name": "Music Therapy for Mood Dysregulation",
        "description": "8-week music therapy program combining receptive and active music therapy for mood improvement.",
        "weeks": 8,
        "sessions_count": 8,
        "frequency": "1x per week",
        "modalities": ["music therapy"],
        "conditions": ["Major Depressive Disorder (adjunct)", "Persistent Depressive Disorder", "Adjustment Disorder with depressed mood", "Bipolar II depression (stable phase only)"],
        "evidence_grade": "B",
        "protocol_details": {
            "session_duration": "45-60 minutes",
            "structure": "5 min check-in → 20 min active intervention (improvisation, songwriting, instrument play) → 20 min receptive (live or recorded music listening with guided reflection) → 5 min closing",
            "active_interventions": ["Rhythm-based improvisation (drumming)", "Songwriting (lyric substitution)", "Instrument learning (ukulele/guitar)", "Singing/vocal expression"],
            "receptive_interventions": ["Music-assisted relaxation", "Song lyric analysis", "Personal playlist curation for mood regulation"],
        },
        "outcome_measures": ["BDI-II", "STAI", "Visual Analog Mood Scale (VAMS)", "Music Engagement Scale", "Session evaluation (client)", "Quality of Life Enjoyment and Satisfaction (Q-LES-Q)"],
        "session_structure": {
            "Sessions 1-2": "Assessment; establish therapeutic relationship; musical preferences inventory; baseline BDI-II, STAI",
            "Sessions 3-5": "Core treatment; active music-making focus; begin songwriting or improvisation; weekly mood tracking",
            "Sessions 6-7": "Deepening work; receptive music for emotional processing; integrate home listening assignments",
            "Session 8": "Review; BDI-II and STAI repeated; termination; booster plan (monthly)",
        },
        "contraindication_check": ["Active suicidal ideation (address safety first)", "Bipolar mania/hypomania (active phase)", "Severe hearing impairment"],
        "safety_monitoring": ["Mood worsening (screen each session)", "Suicidal ideation emergence", "Emotional flooding during receptive music"],
        "notes": "Board-certified music therapist (MT-BC) required. Based on Erkkila et al. 2011 RCT. Home listening assignments between sessions enhance outcomes.",
    },
    {
        "id": "proto-007",
        "template_key": "massage_hrv",
        "name": "Massage + HRV Biofeedback for Pain",
        "description": "6-week integrative protocol combining weekly massage with HRV biofeedback training for chronic pain and autonomic dysregulation.",
        "weeks": 6,
        "sessions_count": 12,
        "frequency": "Massage 1x/week + HRV biofeedback 1x/week (can be same day)",
        "modalities": ["massage", "HRV biofeedback"],
        "conditions": ["Chronic tension-type headache", "Fibromyalgia", "Chronic neck/back pain with autonomic dysregulation", "TMD"],
        "evidence_grade": "B",
        "protocol_details": {
            "massage": {
                "type": "Swedish with myofascial and trigger point elements as indicated",
                "duration": "60 minutes",
                "areas": "Full back, neck, shoulders, and symptomatic areas",
                "pressure": "Moderate to firm (patient tolerance)",
            },
            "hrv_biofeedback": {
                "duration": "30 minutes",
                "device": "HRV biofeedback system (e.g., emWave, HeartMath Pro)",
                "technique": "Resonant frequency breathing at 5-6 breaths/minute",
                "coherence_target": "Low coherence → High coherence progression",
            },
        },
        "outcome_measures": ["Pain VAS", "MPQ (McGill Pain Questionnaire)", "HRV coherence score", "Resting HRV (SDNN, RMSSD)", "PROMIS Pain Interference", "PCS (Pain Catastrophizing Scale)", "PSQI"],
        "session_structure": {
            "Week 1": "Baseline VAS, MPQ, HRV; 60-min massage; 30-min HRV orientation; identify resonant frequency",
            "Weeks 2-3": "Massage + HRV; establish home HRV practice (10 min daily); weekly VAS",
            "Weeks 4-5": "Massage + HRV; increase home practice to 15 min; repeat MPQ at week 5; adjust massage focus",
            "Week 6": "Final VAS, MPQ, HRV assessment; massage + final HRV session; home practice plan; booster schedule",
        },
        "contraindication_check": ["Bleeding disorders (deep work)", "Recent surgery at massage site", "Unstable cardiac condition (HRV training)", "Severe osteoporosis"],
        "safety_monitoring": ["Post-massage soreness", "HRV training-induced anxiety (rare)", "Skin reaction to massage lotion"],
        "notes": "Based on Sherman et al. 2011 and Lehrer & Gevirtz 2014. Home HRV practice is essential for durable effects. Consider extending to 8-10 weeks for fibromyalgia.",
    },
    {
        "id": "proto-008",
        "template_key": "taichi_balance",
        "name": "Tai Chi for Balance and Fall Prevention",
        "description": "12-week Yang-style tai chi program (24-form) for balance improvement, fall risk reduction, and functional mobility.",
        "weeks": 12,
        "sessions_count": 24,
        "frequency": "2x per week in-person + 3x per week home practice",
        "modalities": ["tai chi"],
        "conditions": ["Fall risk (older adults)", "Parkinson's disease", "Vestibular dysfunction", "Peripheral neuropathy with balance deficit", "Post-stroke balance impairment"],
        "evidence_grade": "A",
        "protocol_details": {
            "style": "Yang 24-form (simplified standard form)",
            "session_duration": "45-60 minutes",
            "structure": "10 min warm-up (joint mobilization, weight shifting) → 20-30 min form practice → 10 min standing meditation/cool-down",
            "progression": "Weeks 1-3: first 8 movements; Weeks 4-6: movements 9-16; Weeks 7-9: full 24-form; Weeks 10-12: refinement and continuous flow",
            "home_practice": "20 min daily, following instructional video",
        },
        "outcome_measures": ["Berg Balance Scale (BBS)", "Timed Up and Go (TUG)", "Functional Reach Test", "Falls Efficacy Scale (FES-I)", "Activities-specific Balance Confidence (ABC)", "Number of falls (self-reported diary)", "PDQ-39 (for Parkinson's)"],
        "session_structure": {
            "Weeks 1-3": "Baseline BBS, TUG, FES-I; learn movements 1-8; weight shifting fundamentals; establish home practice",
            "Weeks 4-6": "Learn movements 9-16; introduce Tai Chi walking; balance challenge progression; FES-I repeated",
            "Weeks 7-9": "Complete 24-form; focus on weight transfer precision; introduce gentle turns; continue home practice",
            "Weeks 10-12": "Refinement of full form; continuous flowing practice; final BBS, TUG, FES-I; falls diary review; maintenance plan",
        },
        "contraindication_check": ["Severe balance impairment requiring assistive device (supervision only)", "Acute joint injury", "Unstable cardiovascular disease", "Recent lower limb surgery"],
        "safety_monitoring": ["Falls during class", "Joint pain or strain", "Dizziness", "Fatigue"],
        "notes": "Based on Li et al. 2012 (NEJM) and Wayne et al. 2014 meta-analysis. Tai Chi for Arthritis/Fall Prevention (Dr. Lam) certification preferred for older adult populations.",
    },
    {
        "id": "proto-009",
        "template_key": "integrative_pain",
        "name": "Integrative Pain Management",
        "description": "8-week multimodal pain management combining acupuncture, massage, and mindfulness for comprehensive chronic pain care.",
        "weeks": 8,
        "sessions_count": 16,
        "frequency": "Acupuncture 2x/week + Massage 1x/week + Daily mindfulness home practice",
        "modalities": ["acupuncture", "massage", "mindfulness"],
        "conditions": ["Chronic low back pain", "Fibromyalgia", "Chronic neck pain", "Osteoarthritis", "Myofascial pain syndrome"],
        "evidence_grade": "B",
        "protocol_details": {
            "acupuncture": {
                "frequency": "2x per week for 4 weeks, then 1x per week",
                "points": "Standard local and distal points for pain; individualized Ashi points",
                "technique": "Manual needling with deqi; consider electroacupuncture for neuropathic pain",
            },
            "massage": {
                "frequency": "1x per week",
                "type": "Swedish with deep tissue/myofascial elements as indicated",
                "duration": "60 minutes",
            },
            "mindfulness": {
                "type": "Body scan and breath awareness (MBSR-based)",
                "home_practice": "20 min daily using guided audio",
                "weekly_theme": "Pain acceptance, non-judgmental awareness, responding vs reacting",
            },
        },
        "outcome_measures": ["Pain VAS", "ODI or NDI (disability index)", "FIQ (for fibromyalgia)", "PCS (Pain Catastrophizing Scale)", "PAIN CATASTROPHIZING", "CPAQ (Chronic Pain Acceptance)", "SF-36"],
        "session_structure": {
            "Weeks 1-2": "Baseline all measures; begin acupuncture 2x/week; first massage; mindfulness orientation; daily pain diary",
            "Weeks 3-4": "Continue acupuncture 2x/week; weekly massage; home mindfulness practice established; ODI repeated at week 4",
            "Weeks 5-6": "Acupuncture reduces to 1x/week; continue massage; deepen mindfulness (pain-specific body scan); introduce mindful movement",
            "Weeks 7-8": "Final assessments (all measures); acupuncture 1x/week; final massage; review progress; maintenance plan (acupuncture 1x/2 weeks, massage 1x/2 weeks, mindfulness ongoing)",
        },
        "contraindication_check": ["Bleeding disorders (acupuncture, massage)", "Pacemaker (electroacupuncture)", "Recent surgery", "Skin conditions precluding massage"],
        "safety_monitoring": ["Pain flare after acupuncture (common, transient)", "Bruising", "Post-massage soreness", "Mindfulness-induced emotional distress"],
        "notes": "Based on Cherkin 2011 (massage), Vickers 2018 (acupuncture), and Goyal 2014 (mindfulness) meta-analyses. Multimodal approach addresses pain through different mechanisms. Pacing is critical — avoid over-treatment in fibromyalgia.",
    },
    {
        "id": "proto-010",
        "template_key": "comprehensive_12wk",
        "name": "Comprehensive Complementary Plan",
        "description": "12-week personalized integrative plan combining 2-3 complementary modalities with weekly check-ins, biomarker tracking, and patient-reported outcomes.",
        "weeks": 12,
        "sessions_count": 24,
        "frequency": "2 in-person sessions per week + daily home practice",
        "modalities": ["acupuncture", "neurofeedback", "mind-body", "massage", "music therapy", "HRV biofeedback"],
        "conditions": ["Complex chronic conditions", "Multi-system dysfunction", "Treatment-resistant depression/anxiety", "Functional neurological disorder", "Chronic fatigue syndrome"],
        "evidence_grade": "B",
        "protocol_details": {
            "initial_assessment": "Comprehensive intake: medical history, current medications, previous treatments, goals, contraindications, qEEG (if neurofeedback included), baseline biomarkers",
            "modality_selection": "Based on: evidence grade for primary condition, patient preference, practitioner availability, cost/access constraints, contraindication screen",
            "core_modalities": "Select 2-3 from: acupuncture, neurofeedback, HRV biofeedback, massage, yoga/mind-body, music therapy, tPBM, CES",
            "weekly_structure": "Primary modality session (45-60 min) + Secondary modality (30-45 min) or group class",
            "home_practice": "Daily 15-20 min: breathwork, mindfulness, gentle movement, or self-massage",
        },
        "outcome_measures": ["Patient Global Impression of Change (PGIC)", "PROMIS-29", "SF-36", "Custom symptom tracker", "HRV (weekly)", "Sleep quality (daily diary)", "Mood (PHQ-9, GAD-7 every 4 weeks)", "Functional capacity (6MWT or FSS)"],
        "session_structure": {
            "Weeks 1-3 (Foundation)": "Complete baseline assessments; establish rapport and trust; begin primary modality; introduce home practice; identify early responders",
            "Weeks 4-6 (Building)": "Add secondary modality; refine primary based on response; repeat outcome measures; address adherence barriers; adjust as needed",
            "Weeks 7-9 (Integration)": "Combine modalities in sessions where appropriate; deepen home practice; group component if available; mid-course review with all measures",
            "Weeks 10-12 (Consolidation)": "Final assessment battery; develop self-management plan; establish maintenance schedule; discharge or transition to wellness program",
        },
        "contraindication_check": ["All modality-specific contraindications apply", "Polypharmacy interactions", "Implanted devices (affects neurofeedback, CES, tDCS, tPBM)", "Pregnancy", "Active substance use"],
        "safety_monitoring": ["Adverse events from any modality", "Symptom worsening", "Herb-drug interactions (if herbs included)", "Inter-modality fatigue/overload", "Patient burden/burnout from multiple appointments"],
        "notes": "This template is intentionally flexible. Evidence base: multimodal approaches are common in integrative medicine clinics but have less RCT evidence than single-modality trials. Weekly team communication (case conference) strongly recommended. Budget 2-3 hours/week of patient contact time plus daily home practice.",
    },
]

# ---------------------------------------------------------------------------
# SERVICE FUNCTIONS
# ---------------------------------------------------------------------------

def get_complementary_patients(session: Session, clinic_id: str) -> List[Dict[str, Any]]:
    """Return patients with active complementary therapy enrollments for a clinic.

    This queries the database for patients linked to the clinic who have at least
    one active complementary therapy assignment. If no database results, returns
    a structured empty response with metadata.
    """
    try:
        # Query patients with active complementary therapies via the patient
        # therapy assignment join table (assumed schema)
        from app.persistence.models import Patient, PatientComplementaryTherapy

        results = (
            session.query(
                Patient.id.label("patient_id"),
                Patient.name.label("patient_name"),
                func.count(PatientComplementaryTherapy.id).label("active_therapies"),
                func.max(PatientComplementaryTherapy.started_at).label("last_start_date"),
            )
            .join(
                PatientComplementaryTherapy,
                Patient.id == PatientComplementaryTherapy.patient_id,
            )
            .filter(
                Patient.clinic_id == clinic_id,
                PatientComplementaryTherapy.status == "active",
            )
            .group_by(Patient.id, Patient.name)
            .order_by(desc(func.count(PatientComplementaryTherapy.id)))
            .all()
        )

        if results:
            return [
                {
                    "patient_id": str(r.patient_id),
                    "patient_name": r.patient_name or "Unknown",
                    "active_therapies": r.active_therapies,
                    "last_start_date": r.last_start_date.isoformat() if r.last_start_date else None,
                }
                for r in results
            ]
    except Exception as exc:
        logger.warning("get_complementary_patients query failed: %s — returning empty", exc)

    return []


def get_patient_profile(session: Session, patient_id: str) -> Dict[str, Any]:
    """Return the complete complementary therapy profile for a patient.

    Includes active therapies, recent sessions, safety flags, outcome summaries,
    and current protocol assignments.
    """
    profile: Dict[str, Any] = {
        "patient_id": patient_id,
        "active_therapies": [],
        "recent_sessions": [],
        "safety_flags": [],
        "current_protocols": [],
        "outcome_summary": {},
        "evidence_summary": {},
    }

    try:
        from app.persistence.models import (
            Patient,
            PatientComplementaryTherapy,
            AcupunctureSession,
            NeurofeedbackSession,
            CESSession,
            PBMSession,
            MindBodySession,
            MassageSession,
            MusicArtSession,
            ComplementaryProtocol,
        )

        patient = session.query(Patient).filter(Patient.id == patient_id).first()
        if patient:
            profile["patient_name"] = patient.name

        # Active therapies
        active = (
            session.query(PatientComplementaryTherapy)
            .filter(
                PatientComplementaryTherapy.patient_id == patient_id,
                PatientComplementaryTherapy.status == "active",
            )
            .order_by(desc(PatientComplementaryTherapy.started_at))
            .all()
        )
        profile["active_therapies"] = [
            {
                "id": str(t.id),
                "therapy_type": t.therapy_type,
                "status": t.status,
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "notes": t.notes,
            }
            for t in active
        ]

        # Recent sessions across modalities (last 10 total)
        session_types = [
            ("acupuncture", AcupunctureSession),
            ("neurofeedback", NeurofeedbackSession),
            ("ces", CESSession),
            ("pbm", PBMSession),
            ("mindbody", MindBodySession),
            ("massage", MassageSession),
            ("music-art", MusicArtSession),
        ]
        recent = []
        for mod_name, model in session_types:
            try:
                rows = (
                    session.query(model)
                    .filter(model.patient_id == patient_id)
                    .order_by(desc(model.session_date))
                    .limit(5)
                    .all()
                )
                for r in rows:
                    recent.append({"modality": mod_name, "session_date": str(r.session_date), "data": _session_to_dict(r)})
            except Exception:
                continue
        recent.sort(key=lambda x: x["session_date"], reverse=True)
        profile["recent_sessions"] = recent[:10]

        # Current protocols
        protocols = (
            session.query(ComplementaryProtocol)
            .filter(
                ComplementaryProtocol.patient_id == patient_id,
                ComplementaryProtocol.status.in_(["active", "planned"]),
            )
            .order_by(desc(ComplementaryProtocol.created_at))
            .all()
        )
        profile["current_protocols"] = [
            {
                "id": str(p.id),
                "name": p.name,
                "template_key": p.template_key,
                "status": p.status,
                "progress": p.progress,
                "started_at": p.started_at.isoformat() if p.started_at else None,
            }
            for p in protocols
        ]

    except Exception as exc:
        logger.warning("get_patient_profile query failed: %s — returning partial", exc)

    return profile


def log_acupuncture(session: Session, patient_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Log an acupuncture session and return the created record."""
    try:
        from app.persistence.models import AcupunctureSession

        record = AcupunctureSession(
            id=uuid.uuid4(),
            patient_id=patient_id,
            session_date=session_data.get("session_date"),
            session_number=session_data.get("session_number", 1),
            points=session_data.get("points", ""),
            condition_treated=session_data.get("condition", ""),
            pain_vas_before=session_data.get("pain_vas_before"),
            pain_vas_after=session_data.get("pain_vas_after"),
            deqi_achieved=session_data.get("deqi_achieved", False),
            duration_min=session_data.get("duration_min", 30),
            notes=session_data.get("notes", ""),
            created_at=datetime.now(timezone.utc),
        )
        session.add(record)
        session.commit()
        return {"success": True, "session_id": str(record.id), "modality": "acupuncture"}
    except Exception as exc:
        session.rollback()
        logger.error("log_acupuncture failed: %s", exc)
        return {"success": False, "error": str(exc)}


def log_neurofeedback(session: Session, patient_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Log a neurofeedback session and return the created record."""
    try:
        from app.persistence.models import NeurofeedbackSession

        record = NeurofeedbackSession(
            id=uuid.uuid4(),
            patient_id=patient_id,
            session_date=session_data.get("session_date"),
            session_number=session_data.get("session_number", 1),
            protocol=session_data.get("protocol", ""),
            electrode_site=session_data.get("site", ""),
            duration_min=session_data.get("duration_min", 30),
            threshold_uv=session_data.get("threshold"),
            reward_ratio=session_data.get("reward_ratio"),
            artifact_pct=session_data.get("artifact_pct"),
            notes=session_data.get("notes", ""),
            created_at=datetime.now(timezone.utc),
        )
        session.add(record)
        session.commit()
        return {"success": True, "session_id": str(record.id), "modality": "neurofeedback"}
    except Exception as exc:
        session.rollback()
        logger.error("log_neurofeedback failed: %s", exc)
        return {"success": False, "error": str(exc)}


def log_ces(session: Session, patient_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Log a CES session and return the created record."""
    try:
        from app.persistence.models import CESSession

        record = CESSession(
            id=uuid.uuid4(),
            patient_id=patient_id,
            session_date=session_data.get("session_date"),
            session_time=session_data.get("session_time"),
            current_ua=session_data.get("current_ua", 100),
            frequency_hz=session_data.get("frequency_hz", "0.5"),
            duration_min=session_data.get("duration_min", 20),
            electrode_placement=session_data.get("earclips", "bilateral"),
            patient_response=session_data.get("response", ""),
            side_effects=session_data.get("side_effects", ""),
            created_at=datetime.now(timezone.utc),
        )
        session.add(record)
        session.commit()
        return {"success": True, "session_id": str(record.id), "modality": "ces"}
    except Exception as exc:
        session.rollback()
        logger.error("log_ces failed: %s", exc)
        return {"success": False, "error": str(exc)}


def log_pbm(session: Session, patient_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Log a tPBM session and return the created record."""
    try:
        from app.persistence.models import PBMSession

        record = PBMSession(
            id=uuid.uuid4(),
            patient_id=patient_id,
            session_date=session_data.get("session_date"),
            wavelength_nm=session_data.get("wavelength_nm", 810),
            power_density_mw_cm2=session_data.get("power_density", 250),
            dose_j_cm2=session_data.get("dose", 60),
            treatment_site=session_data.get("site", ""),
            duration_min=session_data.get("duration_min", 4),
            symptom_score_before=session_data.get("before_score"),
            symptom_score_after=session_data.get("after_score"),
            notes=session_data.get("notes", ""),
            created_at=datetime.now(timezone.utc),
        )
        session.add(record)
        session.commit()
        return {"success": True, "session_id": str(record.id), "modality": "pbm"}
    except Exception as exc:
        session.rollback()
        logger.error("log_pbm failed: %s", exc)
        return {"success": False, "error": str(exc)}


def log_mindbody(session: Session, patient_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Log a mind-body session and return the created record."""
    try:
        from app.persistence.models import MindBodySession

        record = MindBodySession(
            id=uuid.uuid4(),
            patient_id=patient_id,
            session_date=session_data.get("session_date"),
            practice_type=session_data.get("type", ""),
            practice_subtype=session_data.get("subtype", ""),
            duration_min=session_data.get("duration_min", 20),
            guided=session_data.get("guided", False),
            hrv_before=session_data.get("hrv_before"),
            hrv_after=session_data.get("hrv_after"),
            notes=session_data.get("notes", ""),
            created_at=datetime.now(timezone.utc),
        )
        session.add(record)
        session.commit()
        return {"success": True, "session_id": str(record.id), "modality": "mindbody"}
    except Exception as exc:
        session.rollback()
        logger.error("log_mindbody failed: %s", exc)
        return {"success": False, "error": str(exc)}


def log_massage(session: Session, patient_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Log a massage/bodywork session and return the created record."""
    try:
        from app.persistence.models import MassageSession

        record = MassageSession(
            id=uuid.uuid4(),
            patient_id=patient_id,
            session_date=session_data.get("session_date"),
            massage_type=session_data.get("type", ""),
            duration_min=session_data.get("duration_min", 60),
            areas_worked=session_data.get("areas", ""),
            pressure_level=session_data.get("pressure", ""),
            pain_before=session_data.get("pain_before"),
            pain_after=session_data.get("pain_after"),
            relaxation_score=session_data.get("relaxation_score"),
            rom_changes=session_data.get("rom_change", ""),
            goals=session_data.get("goals", ""),
            notes=session_data.get("notes", ""),
            created_at=datetime.now(timezone.utc),
        )
        session.add(record)
        session.commit()
        return {"success": True, "session_id": str(record.id), "modality": "massage"}
    except Exception as exc:
        session.rollback()
        logger.error("log_massage failed: %s", exc)
        return {"success": False, "error": str(exc)}


def log_music_art(session: Session, patient_id: str, session_data: Dict[str, Any]) -> Dict[str, Any]:
    """Log a music/art therapy session and return the created record."""
    try:
        from app.persistence.models import MusicArtSession

        record = MusicArtSession(
            id=uuid.uuid4(),
            patient_id=patient_id,
            session_date=session_data.get("session_date"),
            modality=session_data.get("modality", ""),
            session_type=session_data.get("type", ""),
            materials=session_data.get("materials", ""),
            goals=session_data.get("goals", ""),
            mood_before=session_data.get("mood_before"),
            mood_after=session_data.get("mood_after"),
            engagement_score=session_data.get("engagement_score"),
            duration_min=session_data.get("duration_min", 45),
            notes=session_data.get("notes", ""),
            created_at=datetime.now(timezone.utc),
        )
        session.add(record)
        session.commit()
        return {"success": True, "session_id": str(record.id), "modality": "music-art"}
    except Exception as exc:
        session.rollback()
        logger.error("log_music_art failed: %s", exc)
        return {"success": False, "error": str(exc)}


def get_therapy_library(
    session: Session,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    evidence_grade: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return the therapy library, optionally filtered by category, condition, or evidence grade.

    Uses the in-memory THERAPY_LIBRARY_DB registry. Database queries are used
    only to cross-reference clinic-specific annotations if available.
    """
    results = THERAPY_LIBRARY_DB.copy()

    if category and category != "all":
        results = [t for t in results if t["category"] == category]

    if condition:
        condition_lower = condition.lower()
        results = [t for t in results if any(condition_lower in c.lower() for c in t["conditions"])]

    if evidence_grade and evidence_grade != "all":
        results = [t for t in results if t["evidence_grade"] == evidence_grade.upper()]

    return results


def create_protocol(session: Session, patient_id: str, protocol_data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a complementary therapy protocol from a template or custom specification."""
    try:
        from app.persistence.models import ComplementaryProtocol

        protocol_id = uuid.uuid4()
        template_key = protocol_data.get("template_key")
        now = datetime.now(timezone.utc)

        # If template key provided, merge template defaults
        if template_key:
            template = next((p for p in PROTOCOL_TEMPLATES if p["template_key"] == template_key), None)
            if template:
                name = protocol_data.get("name") or template["name"]
                description = protocol_data.get("description") or template["description"]
                weeks = protocol_data.get("weeks") or template["weeks"]
                sessions_count = protocol_data.get("sessions_count") or template["sessions_count"]
                modalities = protocol_data.get("modalities") or template["modalities"]
                conditions = protocol_data.get("conditions") or template["conditions"]
            else:
                name = protocol_data.get("name", "Custom Protocol")
                description = protocol_data.get("description", "")
                weeks = protocol_data.get("weeks", 8)
                sessions_count = protocol_data.get("sessions_count", 16)
                modalities = protocol_data.get("modalities", [])
                conditions = protocol_data.get("conditions", [])
        else:
            name = protocol_data.get("name", "Custom Protocol")
            description = protocol_data.get("description", "")
            weeks = protocol_data.get("weeks", 8)
            sessions_count = protocol_data.get("sessions_count", 16)
            modalities = protocol_data.get("modalities", [])
            conditions = protocol_data.get("conditions", [])

        record = ComplementaryProtocol(
            id=protocol_id,
            patient_id=patient_id,
            name=name,
            template_key=template_key,
            description=description,
            weeks=weeks,
            sessions_count=sessions_count,
            modalities=modalities,
            conditions=conditions,
            schedule_notes=protocol_data.get("schedule_notes", ""),
            outcome_measures=protocol_data.get("outcome_measures", ""),
            status="active",
            progress={"sessions_completed": 0, "next_session": 1},
            started_at=now,
            created_at=now,
            updated_at=now,
        )
        session.add(record)
        session.commit()
        return {"success": True, "protocol_id": str(protocol_id), "name": name}
    except Exception as exc:
        session.rollback()
        logger.error("create_protocol failed: %s", exc)
        return {"success": False, "error": str(exc)}


def safety_check(session: Session, patient_id: str, therapy_type: str) -> Dict[str, Any]:
    """Run a contraindication safety check for a patient and therapy combination.

    Returns a structured report with any contraindication flags based on
    patient conditions and the selected therapy.
    """
    flags: List[Dict[str, Any]] = []

    # Query patient conditions and medications for cross-referencing
    patient_conditions: List[str] = []
    patient_medications: List[str] = []

    try:
        from app.persistence.models import PatientCondition, PatientMedication

        conds = (
            session.query(PatientCondition)
            .filter(PatientCondition.patient_id == patient_id)
            .all()
        )
        patient_conditions = [c.condition_name.lower() for c in conds if c.condition_name]

        meds = (
            session.query(PatientMedication)
            .filter(PatientMedication.patient_id == patient_id)
            .all()
        )
        patient_medications = [m.medication_name.lower() for m in meds if m.medication_name]

    except Exception as exc:
        logger.warning("safety_check patient data query failed: %s", exc)

    # Check contraindication rules
    for condition_key, rules in CONTRAINDICATION_RULES.items():
        # Check if patient has this condition
        has_condition = condition_key in patient_conditions
        # Also check for medication-based flags
        med_flags = _check_medication_contraindications(condition_key, patient_medications)

        if has_condition or med_flags:
            for rule in rules:
                if therapy_type.lower() in rule["therapy_pattern"].lower() or _therapy_matches(rule["therapy_pattern"], therapy_type):
                    flags.append({
                        "flag_type": rule["level"],
                        "condition_trigger": condition_key,
                        "therapy": therapy_type,
                        "message": rule["message"],
                        "recommendation": "Review with supervising clinician before proceeding." if rule["level"] in ("warning", "caution") else "DO NOT PROCEED without specialist clearance.",
                    })

    # Always add therapy-specific warnings from the library
    library_entry = next((t for t in THERAPY_LIBRARY_DB if therapy_type.lower() in t["name"].lower()), None)
    if library_entry:
        for contraindication in library_entry.get("contraindications", []):
            flags.append({
                "flag_type": "caution",
                "condition_trigger": "therapy_specific",
                "therapy": therapy_type,
                "message": contraindication,
                "recommendation": "Verify before treatment initiation.",
            })

    return {
        "patient_id": patient_id,
        "therapy_type": therapy_type,
        "cleared": len(flags) == 0,
        "flag_count": len(flags),
        "critical_flags": len([f for f in flags if f["flag_type"] == "critical"]),
        "warning_flags": len([f for f in flags if f["flag_type"] == "warning"]),
        "caution_flags": len([f for f in flags if f["flag_type"] == "caution"]),
        "flags": flags,
        "assessed_at": datetime.now(timezone.utc).isoformat(),
        "requires_practitioner": library_entry.get("practitioner_requirements", "") if library_entry else "",
    }


def get_evidence_summary(therapy_type: str, condition: Optional[str] = None) -> Dict[str, Any]:
    """Return evidence summary for a therapy type, optionally filtered by condition."""
    summary = EVIDENCE_SUMMARIES.get(therapy_type.lower(), [])

    if not summary:
        # Try to find from therapy library
        library_entries = [t for t in THERAPY_LIBRARY_DB if therapy_type.lower() in t["name"].lower() or t["category"] == therapy_type.lower()]
        if library_entries:
            return {
                "therapy_type": therapy_type,
                "evidence_entries": [
                    {
                        "condition": c,
                        "grade": entry["evidence_grade"],
                        "key_reference": "See therapy library entry",
                        "effect_summary": f"Evidence grade {entry['evidence_grade']} for {c}",
                    }
                    for entry in library_entries
                    for c in entry["conditions"][:5]
                ],
                "grade_distribution": _compute_grade_distribution(library_entries),
            }
        return {"therapy_type": therapy_type, "evidence_entries": [], "grade_distribution": {}}

    if condition:
        condition_lower = condition.lower()
        summary = [s for s in summary if condition_lower in s["condition"].lower()]

    return {
        "therapy_type": therapy_type,
        "evidence_entries": summary,
        "grade_distribution": _compute_grade_distribution_from_evidence(summary),
    }


def get_progress_summary(session: Session, patient_id: str) -> Dict[str, Any]:
    """Generate a progress summary for a patient across all complementary modalities.

    Aggregates session counts, outcome trends, and protocol completion status.
    """
    summary: Dict[str, Any] = {
        "patient_id": patient_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_sessions": 0,
        "sessions_by_modality": {},
        "outcome_trends": {},
        "active_protocols": [],
        "recommendations": [],
    }

    modality_models = {
        "acupuncture": "AcupunctureSession",
        "neurofeedback": "NeurofeedbackSession",
        "ces": "CESSession",
        "pbm": "PBMSession",
        "mindbody": "MindBodySession",
        "massage": "MassageSession",
        "music_art": "MusicArtSession",
    }

    for modality, model_name in modality_models.items():
        try:
            from app.persistence.models import (
                AcupunctureSession,
                NeurofeedbackSession,
                CESSession,
                PBMSession,
                MindBodySession,
                MassageSession,
                MusicArtSession,
            )
            model_map = {
                "AcupunctureSession": AcupunctureSession,
                "NeurofeedbackSession": NeurofeedbackSession,
                "CESSession": CESSession,
                "PBMSession": PBMSession,
                "MindBodySession": MindBodySession,
                "MassageSession": MassageSession,
                "MusicArtSession": MusicArtSession,
            }
            model = model_map.get(model_name)
            if not model:
                continue

            count = (
                session.query(model)
                .filter(model.patient_id == patient_id)
                .count()
            )
            summary["sessions_by_modality"][modality] = count
            summary["total_sessions"] += count

            # Get recent sessions for trend analysis
            recent = (
                session.query(model)
                .filter(model.patient_id == patient_id)
                .order_by(desc(getattr(model, "session_date", model.created_at)))
                .limit(6)
                .all()
            )

            if recent:
                trend = _calculate_modality_trend(modality, recent)
                if trend:
                    summary["outcome_trends"][modality] = trend

        except Exception as exc:
            logger.warning("Progress summary query for %s failed: %s", modality, exc)
            continue

    # Active protocols
    try:
        from app.persistence.models import ComplementaryProtocol
        protocols = (
            session.query(ComplementaryProtocol)
            .filter(
                ComplementaryProtocol.patient_id == patient_id,
                ComplementaryProtocol.status == "active",
            )
            .all()
        )
        summary["active_protocols"] = [
            {
                "id": str(p.id),
                "name": p.name,
                "progress": p.progress,
                "status": p.status,
            }
            for p in protocols
        ]
    except Exception as exc:
        logger.warning("Progress summary protocol query failed: %s", exc)

    # Generate recommendations based on data
    recommendations = []
    if summary["total_sessions"] == 0:
        recommendations.append("No complementary therapy sessions recorded. Consider initial assessment and protocol assignment.")
    for modality, count in summary["sessions_by_modality"].items():
        if count == 0:
            continue
        trend = summary["outcome_trends"].get(modality, {})
        if trend.get("direction") == "improving":
            recommendations.append(f"{modality.title()}: Positive trend detected. Continue current course.")
        elif trend.get("direction") == "worsening":
            recommendations.append(f"{modality.title()}: Declining trend. Consider protocol reassessment and clinical review.")
        elif trend.get("direction") == "stable":
            recommendations.append(f"{modality.title()}: Stable response. May benefit from intensity adjustment.")

    summary["recommendations"] = recommendations
    return summary


# ---------------------------------------------------------------------------
# HELPER FUNCTIONS
# ---------------------------------------------------------------------------

def _session_to_dict(record: Any) -> Dict[str, Any]:
    """Convert a session ORM record to a dictionary, handling common fields."""
    result: Dict[str, Any] = {}
    for col in record.__table__.columns:
        val = getattr(record, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        elif isinstance(val, uuid.UUID):
            val = str(val)
        result[col.name] = val
    return result


def _check_medication_contraindications(condition_key: str, medications: List[str]) -> bool:
    """Check if any patient medications trigger a contraindication rule."""
    med_contraindications = {
        "bleeding_disorder": ["warfarin", "apixaban", "rivaroxaban", "heparin", "clopidogrel", "aspirin"],
        "pregnancy": ["isotretinoin", "methotrexate", "valproate"],
        "immunosuppressed": ["prednisone", "methotrexate", "tacrolimus", "cyclosporine", "azathioprine"],
        "glaucoma": [],
        "severe_depression": [],
        "cancer_active": [],
        "epilepsy": [],
        "osteoporosis_severe": [],
        "liver_disease": ["acetaminophen"],  # High-dose concern
    }
    trigger_meds = med_contraindications.get(condition_key, [])
    return any(any(tm in med for tm in trigger_meds) for med in medications)


def _therapy_matches(pattern: str, therapy_type: str) -> bool:
    """Check if a therapy type matches a contraindication pattern.

    Supports partial matching so 'acupuncture' matches patterns containing
    the word 'acupuncture' or common abbreviations.
    """
    therapy_lower = therapy_type.lower()
    pattern_lower = pattern.lower()

    if pattern_lower in therapy_lower:
        return True

    # Category-level matching
    category_map = {
        "acupuncture": ["acupuncture", "electroacupuncture", "auricular", "scalp", "moxa", "cupping"],
        "neurofeedback": ["neurofeedback", "smr", "alpha-theta", "scp", "biofeedback"],
        "ces": ["ces", "cranial electrotherapy", "tdcs", "tacs"],
        "pbm": ["pbm", "photobiomodulation", "lllt", "laser"],
        "massage": ["massage", "swedish", "deep tissue", "myofascial", "lymphatic", "reflexology", "shiatsu", "thai"],
        "mind-body": ["mindfulness", "meditation", "yoga", "tai chi", "qigong", "breathwork", "relaxation"],
        "music-art": ["music therapy", "art therapy", "dance therapy", "drama therapy"],
    }

    for category, keywords in category_map.items():
        if pattern_lower == category:
            return any(kw in therapy_lower for kw in keywords)

    return False


def _compute_grade_distribution(entries: List[Dict[str, Any]]) -> Dict[str, int]:
    """Compute the distribution of evidence grades from library entries."""
    dist: Dict[str, int] = {}
    for entry in entries:
        grade = entry.get("evidence_grade", "D")
        dist[grade] = dist.get(grade, 0) + 1
    return dist


def _compute_grade_distribution_from_evidence(evidence_entries: List[Dict[str, Any]]) -> Dict[str, int]:
    """Compute the distribution of evidence grades from evidence summary entries."""
    dist: Dict[str, int] = {}
    for entry in evidence_entries:
        grade = entry.get("grade", "D")
        dist[grade] = dist.get(grade, 0) + 1
    return dist


def _calculate_modality_trend(modality: str, recent_sessions: List[Any]) -> Optional[Dict[str, Any]]:
    """Calculate outcome trend from recent sessions for a given modality.

    Each modality has different score fields that are analyzed for trend direction.
    """
    if not recent_sessions or len(recent_sessions) < 2:
        return None

    # Map modalities to their score fields and whether lower is better
    score_configs = {
        "acupuncture": ("pain_vas_after", False),  # lower is better
        "neurofeedback": ("reward_ratio", True),  # higher is better
        "ces": (None, False),  # no numeric score
        "pbm": ("symptom_score_after", False),  # lower is better
        "mindbody": ("hrv_after", True),  # higher is better
        "massage": ("pain_after", False),  # lower is better
        "music_art": ("mood_after", True),  # higher is better
    }

    score_field, higher_is_better = score_configs.get(modality, (None, False))
    if not score_field:
        return None

    scores = []
    for s in recent_sessions:
        val = getattr(s, score_field, None)
        if val is not None:
            try:
                scores.append(float(val))
            except (TypeError, ValueError):
                continue

    if len(scores) < 2:
        return None

    first = scores[-1]  # Most recent
    last = scores[0]  # Oldest of the batch

    if last == 0:
        pct_change = 0
    else:
        pct_change = ((first - last) / abs(last)) * 100

    if higher_is_better:
        direction = "improving" if pct_change > 5 else "worsening" if pct_change < -5 else "stable"
    else:
        direction = "improving" if pct_change < -5 else "worsening" if pct_change > 5 else "stable"

    return {
        "direction": direction,
        "recent_scores": scores,
        "percent_change": round(pct_change, 1),
        "sessions_analyzed": len(scores),
        "score_field": score_field,
    }


def get_protocols_for_patient(session: Session, patient_id: str) -> List[Dict[str, Any]]:
    """Get all protocols (active, completed, archived) for a patient."""
    try:
        from app.persistence.models import ComplementaryProtocol
        protocols = (
            session.query(ComplementaryProtocol)
            .filter(ComplementaryProtocol.patient_id == patient_id)
            .order_by(desc(ComplementaryProtocol.created_at))
            .all()
        )
        return [
            {
                "id": str(p.id),
                "name": p.name,
                "template_key": p.template_key,
                "status": p.status,
                "weeks": p.weeks,
                "sessions_count": p.sessions_count,
                "modalities": p.modalities,
                "progress": p.progress,
                "started_at": p.started_at.isoformat() if p.started_at else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in protocols
        ]
    except Exception as exc:
        logger.warning("get_protocols_for_patient failed: %s", exc)
        return []


def get_acupuncture_history(session: Session, patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return acupuncture session history for a patient."""
    try:
        from app.persistence.models import AcupunctureSession
        rows = (
            session.query(AcupunctureSession)
            .filter(AcupunctureSession.patient_id == patient_id)
            .order_by(desc(AcupunctureSession.session_date))
            .limit(limit)
            .all()
        )
        return [_session_to_dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_acupuncture_history failed: %s", exc)
        return []


def get_neurofeedback_history(session: Session, patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return neurofeedback session history for a patient."""
    try:
        from app.persistence.models import NeurofeedbackSession
        rows = (
            session.query(NeurofeedbackSession)
            .filter(NeurofeedbackSession.patient_id == patient_id)
            .order_by(desc(NeurofeedbackSession.session_date))
            .limit(limit)
            .all()
        )
        return [_session_to_dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_neurofeedback_history failed: %s", exc)
        return []


def get_ces_history(session: Session, patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return CES session history for a patient."""
    try:
        from app.persistence.models import CESSession
        rows = (
            session.query(CESSession)
            .filter(CESSession.patient_id == patient_id)
            .order_by(desc(CESSession.session_date))
            .limit(limit)
            .all()
        )
        return [_session_to_dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_ces_history failed: %s", exc)
        return []


def get_pbm_history(session: Session, patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return PBM session history for a patient."""
    try:
        from app.persistence.models import PBMSession
        rows = (
            session.query(PBMSession)
            .filter(PBMSession.patient_id == patient_id)
            .order_by(desc(PBMSession.session_date))
            .limit(limit)
            .all()
        )
        return [_session_to_dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_pbm_history failed: %s", exc)
        return []


def get_mindbody_history(session: Session, patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return mind-body session history for a patient."""
    try:
        from app.persistence.models import MindBodySession
        rows = (
            session.query(MindBodySession)
            .filter(MindBodySession.patient_id == patient_id)
            .order_by(desc(MindBodySession.session_date))
            .limit(limit)
            .all()
        )
        return [_session_to_dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_mindbody_history failed: %s", exc)
        return []


def get_massage_history(session: Session, patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return massage session history for a patient."""
    try:
        from app.persistence.models import MassageSession
        rows = (
            session.query(MassageSession)
            .filter(MassageSession.patient_id == patient_id)
            .order_by(desc(MassageSession.session_date))
            .limit(limit)
            .all()
        )
        return [_session_to_dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_massage_history failed: %s", exc)
        return []


def get_music_art_history(session: Session, patient_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return music/art therapy session history for a patient."""
    try:
        from app.persistence.models import MusicArtSession
        rows = (
            session.query(MusicArtSession)
            .filter(MusicArtSession.patient_id == patient_id)
            .order_by(desc(MusicArtSession.session_date))
            .limit(limit)
            .all()
        )
        return [_session_to_dict(r) for r in rows]
    except Exception as exc:
        logger.warning("get_music_art_history failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# ADDITIONAL SUPPORTING FUNCTIONS
# ---------------------------------------------------------------------------

def validate_protocol_data(protocol_data: Dict[str, Any]) -> List[str]:
    """Validate protocol creation data and return a list of error messages."""
    errors: List[str] = []
    if not protocol_data.get("name"):
        errors.append("Protocol name is required.")
    if not protocol_data.get("weeks") or int(protocol_data.get("weeks", 0)) < 1:
        errors.append("Duration (weeks) must be at least 1.")
    if not protocol_data.get("sessions_count") or int(protocol_data.get("sessions_count", 0)) < 1:
        errors.append("Total sessions must be at least 1.")
    modalities = protocol_data.get("modalities")
    if not modalities or (isinstance(modalities, list) and len(modalities) == 0):
        errors.append("At least one modality must be selected.")
    if not protocol_data.get("conditions"):
        errors.append("At least one target condition is required.")
    return errors


def get_herb_drug_interactions(herb_name: str, medication_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return herb-drug interaction data. Supports common herbs and medications."""
    herb_db: Dict[str, List[Dict[str, Any]]] = {
        "st. john's wort": [
            {"drug_class": "SSRIs/SNRIs", "severity": "critical", "mechanism": "Serotonin syndrome via SERT inhibition + MAOI activity", "evidence": "A"},
            {"drug_class": "Warfarin", "severity": "critical", "mechanism": "CYP3A4 and CYP2C9 induction reduces INR", "evidence": "A"},
            {"drug_class": "Oral contraceptives", "severity": "critical", "mechanism": "CYP3A4 induction reduces hormone levels", "evidence": "A"},
            {"drug_class": "Cyclosporine", "severity": "critical", "mechanism": "CYP3A4 and P-gp induction reduces immunosuppressant levels", "evidence": "A"},
            {"drug_class": "Digoxin", "severity": "warning", "mechanism": "P-gp induction reduces digoxin levels", "evidence": "B"},
            {"drug_class": "Antiretrovirals (protease inhibitors)", "severity": "critical", "mechanism": "CYP3A4 induction reduces antiviral efficacy", "evidence": "A"},
        ],
        "ginkgo biloba": [
            {"drug_class": "Anticoagulants/antiplatelets", "severity": "warning", "mechanism": "Antiplatelet-activating factor (PAF) inhibition increases bleeding risk", "evidence": "B"},
            {"drug_class": "Aspirin", "severity": "warning", "mechanism": "Additive antiplatelet effect", "evidence": "B"},
            {"drug_class": "Alprazolam", "severity": "caution", "mechanism": "May reduce drug effectiveness via CYP modulation", "evidence": "C"},
        ],
        "ginseng": [
            {"drug_class": "Warfarin", "severity": "warning", "mechanism": "May reduce INR; variable effects by species (Panax vs. Siberian)", "evidence": "B"},
            {"drug_class": "MAOIs", "severity": "warning", "mechanism": "Possible manic symptoms or serotonin syndrome", "evidence": "C"},
            {"drug_class": "Hypoglycemics", "severity": "caution", "mechanism": "Additive blood glucose lowering", "evidence": "B"},
        ],
        "echinacea": [
            {"drug_class": "Immunosuppressants", "severity": "warning", "mechanism": "Immunostimulation may counteract immunosuppressive therapy", "evidence": "C"},
        ],
        "kava kava": [
            {"drug_class": "CNS depressants", "severity": "warning", "mechanism": "Additive sedation via GABA-A modulation", "evidence": "B"},
            {"drug_class": "Hepatotoxic drugs", "severity": "critical", "mechanism": "Additive hepatotoxicity risk", "evidence": "B"},
            {"drug_class": "Levodopa", "severity": "warning", "mechanism": "Possible dopamine antagonism worsens Parkinson symptoms", "evidence": "C"},
        ],
        "valerian": [
            {"drug_class": "CNS depressants", "severity": "warning", "mechanism": "Additive GABAergic sedation", "evidence": "B"},
            {"drug_class": "Alcohol", "severity": "warning", "mechanism": "Additive CNS depression", "evidence": "B"},
        ],
        "turmeric": [
            {"drug_class": "Anticoagulants", "severity": "caution", "mechanism": "High-dose curcumin may inhibit platelet aggregation", "evidence": "C"},
            {"drug_class": "Antacids/PPIs", "severity": "caution", "mechanism": "May interfere with acid suppression (turmeric stimulates gastric acid)", "evidence": "C"},
        ],
        "ashwagandha": [
            {"drug_class": "Sedatives", "severity": "warning", "mechanism": "Additive GABAergic sedation", "evidence": "C"},
            {"drug_class": "Thyroid hormone", "severity": "warning", "mechanism": "May increase T3/T4 levels; augments thyroid function", "evidence": "B"},
            {"drug_class": "Immunosuppressants", "severity": "caution", "mechanism": "Immunomodulatory effects may interfere", "evidence": "C"},
        ],
        "cbd": [
            {"drug_class": "CYP2C19 substrates (clobazam, omeprazole)", "severity": "critical", "mechanism": "CBD inhibits CYP2C19 increasing substrate levels", "evidence": "A"},
            {"drug_class": "CYP3A4 substrates", "severity": "warning", "mechanism": "CBD inhibits CYP3A4 at high doses", "evidence": "B"},
            {"drug_class": "CNS depressants", "severity": "warning", "mechanism": "Additive sedation", "evidence": "B"},
            {"drug_class": "Valproate", "severity": "critical", "mechanism": "Increased liver enzyme elevations when combined", "evidence": "B"},
        ],
        "melatonin": [
            {"drug_class": "Fluvoxamine", "severity": "warning", "mechanism": "CYP1A2 inhibition increases melatonin levels 17-fold", "evidence": "A"},
            {"drug_class": "CNS depressants", "severity": "caution", "mechanism": "Additive sedation", "evidence": "B"},
            {"drug_class": "Anticoagulants", "severity": "caution", "mechanism": "May potentiate anticoagulant effects", "evidence": "C"},
        ],
        "omega-3": [
            {"drug_class": "Anticoagulants", "severity": "caution", "mechanism": "High doses (>3g/day) may increase bleeding time", "evidence": "B"},
            {"drug_class": "Antihypertensives", "severity": "caution", "mechanism": "Additive blood pressure lowering (3-5 mmHg)", "evidence": "B"},
        ],
    }

    interactions = herb_db.get(herb_name.lower(), [])
    if medication_name:
        med_lower = medication_name.lower()
        interactions = [i for i in interactions if med_lower in i["drug_class"].lower()]
    return interactions


def get_aggregate_evidence_stats() -> Dict[str, Any]:
    """Return aggregate evidence statistics across the entire therapy library."""
    total = len(THERAPY_LIBRARY_DB)
    grade_counts: Dict[str, int] = {}
    category_counts: Dict[str, int] = {}
    condition_coverage: Dict[str, int] = {}

    for therapy in THERAPY_LIBRARY_DB:
        grade = therapy.get("evidence_grade", "D")
        grade_counts[grade] = grade_counts.get(grade, 0) + 1

        cat = therapy.get("category", "other")
        category_counts[cat] = category_counts.get(cat, 0) + 1

        for condition in therapy.get("conditions", []):
            condition_coverage[condition] = condition_coverage.get(condition, 0) + 1

    return {
        "total_therapies": total,
        "grade_distribution": grade_counts,
        "category_distribution": category_counts,
        "top_conditions": sorted(condition_coverage.items(), key=lambda x: x[1], reverse=True)[:20],
        "average_evidence_weight": round(
            sum(EVIDENCE_GRADE_WEIGHTS.get(g, 1) * c for g, c in grade_counts.items()) / max(total, 1), 2
        ),
    }


def get_protocol_template_by_key(template_key: str) -> Optional[Dict[str, Any]]:
    """Get a protocol template by its template key."""
    return next((p for p in PROTOCOL_TEMPLATES if p["template_key"] == template_key), None)


def list_protocol_templates(
    category: Optional[str] = None,
    evidence_grade: Optional[str] = None,
    condition: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """List protocol templates with optional filtering."""
    results = PROTOCOL_TEMPLATES.copy()
    if category:
        results = [p for p in results if category in p.get("modalities", [])]
    if evidence_grade:
        results = [p for p in results if p.get("evidence_grade") == evidence_grade.upper()]
    if condition:
        condition_lower = condition.lower()
        results = [p for p in results if any(condition_lower in c.lower() for c in p.get("conditions", []))]
    return results


def update_protocol_progress(
    session: Session,
    protocol_id: str,
    sessions_completed: int,
    next_session: Optional[int] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """Update the progress tracking for a protocol."""
    try:
        from app.persistence.models import ComplementaryProtocol

        protocol = (
            session.query(ComplementaryProtocol)
            .filter(ComplementaryProtocol.id == protocol_id)
            .first()
        )
        if not protocol:
            return {"success": False, "error": "Protocol not found."}

        progress = protocol.progress or {}
        progress["sessions_completed"] = sessions_completed
        if next_session is not None:
            progress["next_session"] = next_session
        protocol.progress = progress

        if status:
            protocol.status = status

        protocol.updated_at = datetime.now(timezone.utc)
        session.commit()
        return {"success": True, "protocol_id": protocol_id, "progress": progress}
    except Exception as exc:
        session.rollback()
        logger.error("update_protocol_progress failed: %s", exc)
        return {"success": False, "error": str(exc)}


def deactivate_therapy(session: Session, patient_id: str, therapy_type: str) -> Dict[str, Any]:
    """Deactivate an active complementary therapy for a patient."""
    try:
        from app.persistence.models import PatientComplementaryTherapy

        therapies = (
            session.query(PatientComplementaryTherapy)
            .filter(
                PatientComplementaryTherapy.patient_id == patient_id,
                PatientComplementaryTherapy.therapy_type == therapy_type,
                PatientComplementaryTherapy.status == "active",
            )
            .all()
        )

        for therapy in therapies:
            therapy.status = "inactive"
            therapy.ended_at = datetime.now(timezone.utc)
            therapy.updated_at = datetime.now(timezone.utc)

        session.commit()
        return {
            "success": True,
            "deactivated_count": len(therapies),
            "patient_id": patient_id,
            "therapy_type": therapy_type,
        }
    except Exception as exc:
        session.rollback()
        logger.error("deactivate_therapy failed: %s", exc)
        return {"success": False, "error": str(exc)}


def get_clinic_summary(session: Session, clinic_id: str) -> Dict[str, Any]:
    """Generate a clinic-level summary of complementary therapy utilization.

    Returns aggregate counts, modality distribution, and outcome trends
    across all patients in the clinic.
    """
    summary: Dict[str, Any] = {
        "clinic_id": clinic_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_patients_with_therapies": 0,
        "total_active_therapies": 0,
        "sessions_this_week": 0,
        "sessions_this_month": 0,
        "modality_distribution": {},
        "evidence_summary": get_aggregate_evidence_stats(),
    }

    try:
        from app.persistence.models import PatientComplementaryTherapy

        active_count = (
            session.query(PatientComplementaryTherapy)
            .filter(
                PatientComplementaryTherapy.clinic_id == clinic_id,
                PatientComplementaryTherapy.status == "active",
            )
            .count()
        )
        summary["total_active_therapies"] = active_count

        patient_count = (
            session.query(PatientComplementaryTherapy.patient_id)
            .filter(
                PatientComplementaryTherapy.clinic_id == clinic_id,
                PatientComplementaryTherapy.status == "active",
            )
            .distinct()
            .count()
        )
        summary["total_patients_with_therapies"] = patient_count

        # Modality distribution
        modality_counts = (
            session.query(
                PatientComplementaryTherapy.therapy_type,
                func.count(PatientComplementaryTherapy.id).label("count"),
            )
            .filter(
                PatientComplementaryTherapy.clinic_id == clinic_id,
                PatientComplementaryTherapy.status == "active",
            )
            .group_by(PatientComplementaryTherapy.therapy_type)
            .all()
        )
        summary["modality_distribution"] = {m.therapy_type: m.count for m in modality_counts}

    except Exception as exc:
        logger.warning("get_clinic_summary query failed: %s", exc)

    return summary
