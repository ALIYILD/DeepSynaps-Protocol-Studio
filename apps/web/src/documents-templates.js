// Document templates used by the Documents Hub (pgDocumentsHubNew).
// Each body is a text/markdown string with {{placeholder}} merge fields.
// Rendered via renderTemplate(id, values).
// IMPORTANT: Consent bodies are TEMPLATE text — clinics must review and adapt
// to their jurisdiction before use. They are not legal advice.

export const DOCUMENT_TEMPLATES = [
  {
    id: 'T01',
    name: 'TMS Informed Consent Form',
    cat: 'Consent',
    pages: 4,
    langs: ['EN', 'FR', 'ES'],
    auto: false,
    variables: [
      'clinic_name', 'clinician_name', 'clinician_title',
      'patient_name', 'patient_dob', 'patient_id',
      'indication', 'protocol_name', 'num_sessions',
      'consent_date', 'patient_signature', 'clinician_signature',
      'witness_name', 'witness_signature',
    ],
    body: `# Transcranial Magnetic Stimulation (TMS) — Informed Consent

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}, {{clinician_title}}
**Patient:** {{patient_name}}  |  DOB: {{patient_dob}}  |  ID: {{patient_id}}
**Indication:** {{indication}}
**Protocol:** {{protocol_name}}  |  Planned sessions: {{num_sessions}}

---

## 1. Purpose
Transcranial Magnetic Stimulation (TMS) is a non-invasive brain stimulation technique
that uses pulsed magnetic fields to modulate cortical excitability. This consent form
explains the proposed treatment so that you can make an informed decision about whether
to proceed.

## 2. Procedure
A coil is placed against your scalp. Brief magnetic pulses are delivered to targeted
brain regions. Sessions typically last 20–40 minutes. You will remain awake and seated
throughout. The number of planned sessions is {{num_sessions}}.

## 3. Anticipated Benefits
Benefits vary by individual and are not guaranteed. Potential benefits for the indicated
condition include improvements in mood, cognition, or motor function as documented in
peer-reviewed literature. Your clinician will discuss the evidence base with you.

## 4. Risks and Side-Effects
Common (>1 in 10):
- Scalp discomfort or mild headache at the stimulation site
- Transient fatigue following the session

Uncommon (1 in 100 – 1 in 1,000):
- Transient tinnitus
- Transient worsening of anxiety or mood

Rare (approximately 1 in 30,000 per course):
- Seizure. This risk is elevated if you have a personal or close family history of
  epilepsy, or if you take medications that lower seizure threshold. Inform your
  clinician of all current medications and supplements.

Rare – other:
- Syncopal episode (fainting) related to anxiety
- Hearing damage if ear protection is not worn during treatment

Unknown / long-term: Long-term effects beyond 12 months are not yet fully characterised
in the scientific literature.

## 5. Contraindications — Please Confirm
You MUST notify your clinician before proceeding if you have:
- A metallic implant in or near the skull (cochlear implant, aneurysm clip, DBS device)
- A cardiac pacemaker or implantable defibrillator
- A history of seizure or epilepsy
- Current pregnancy or possibility of pregnancy
- Significant head injury in the past 12 months

## 6. Alternatives
Alternatives may include pharmacotherapy, psychotherapy, electroconvulsive therapy (ECT),
or watchful waiting. Your clinician will discuss these with you.

## 7. Voluntariness and Right to Withdraw
Participation is entirely voluntary. You may withdraw consent at any time before or
during a session without giving a reason and without affecting the quality of any
other care you receive.

## 8. Confidentiality
Your information will be stored securely in accordance with UK GDPR and the Data
Protection Act 2018. De-identified data may be used for service evaluation unless
you opt out. See the clinic Privacy & Data Policy (T04) for full details.

## 9. Questions
Please direct any questions to {{clinician_name}} or the clinic at {{clinic_name}}.
Do not proceed until all questions are answered to your satisfaction.

---

## Signatures

I, {{patient_name}}, confirm that I have read and understood the above information,
have had the opportunity to ask questions, and consent to the proposed TMS treatment.

Patient signature: {{patient_signature}}  |  Date: {{consent_date}}

Witness name: {{witness_name}}
Witness signature: {{witness_signature}}  |  Date: {{consent_date}}

Clinician signature: {{clinician_signature}}  |  Date: {{consent_date}}
`,
  },

  {
    id: 'T02',
    name: 'tDCS Informed Consent Form',
    cat: 'Consent',
    pages: 3,
    langs: ['EN'],
    auto: false,
    variables: [
      'clinic_name', 'clinician_name', 'clinician_title',
      'patient_name', 'patient_dob', 'patient_id',
      'indication', 'montage', 'intensity_ma', 'duration_min', 'num_sessions',
      'consent_date', 'patient_signature', 'clinician_signature',
    ],
    body: `# Transcranial Direct Current Stimulation (tDCS) — Informed Consent

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}, {{clinician_title}}
**Patient:** {{patient_name}}  |  DOB: {{patient_dob}}  |  ID: {{patient_id}}
**Indication:** {{indication}}
**Montage:** {{montage}}  |  Intensity: {{intensity_ma}} mA  |  Duration: {{duration_min}} min
**Planned sessions:** {{num_sessions}}

---

## 1. Purpose
Transcranial Direct Current Stimulation (tDCS) delivers a weak, constant electrical
current through electrodes placed on the scalp to modulate cortical excitability.
This document ensures you understand the proposed treatment.

## 2. Procedure
Sponge electrodes are applied to specific scalp locations. A low-level direct current
(typically 1–2 mA) is delivered for {{duration_min}} minutes per session. You remain
fully conscious. Sessions are conducted over {{num_sessions}} visits.

## 3. Anticipated Benefits
Evidence varies by indication. Potential benefits include enhanced cognitive function,
motor learning, or mood regulation. Your clinician will explain the evidence specific
to your condition.

## 4. Risks and Side-Effects
Common (>1 in 10):
- Tingling, itching, or mild warmth beneath the electrodes during stimulation
- Transient light-headedness

Uncommon:
- Redness (erythema) at electrode sites, typically resolving within 1 hour
- Mild headache

Rare:
- Skin burns under electrodes — risk is minimised by correct electrode preparation,
  appropriate current density (<0.06 mA/cm²), and intact skin. Report any blistering
  or persistent pain immediately.
- Mood change in predisposed individuals

## 5. Contraindications — Please Confirm
You MUST inform your clinician if you have:
- Broken, inflamed, or infected skin at proposed electrode sites
- A metallic implant in the skull or within 6 cm of the electrode
- A cardiac pacemaker or implantable stimulator
- Current pregnancy

## 6. Alternatives
Pharmacotherapy, TMS, or psychotherapy may be alternatives. Discuss with your clinician.

## 7. Voluntariness and Right to Withdraw
You may withdraw consent at any time without consequence to other care.

## 8. Confidentiality
Data is held under UK GDPR. See Privacy & Data Policy (T04) for details.

---

## Signatures

I, {{patient_name}}, consent to the proposed tDCS treatment as described above.

Patient signature: {{patient_signature}}  |  Date: {{consent_date}}
Clinician signature: {{clinician_signature}}  |  Date: {{consent_date}}
`,
  },

  {
    id: 'T03',
    name: 'Neurofeedback Consent Form',
    cat: 'Consent',
    pages: 3,
    langs: ['EN', 'FR'],
    auto: false,
    variables: [
      'clinic_name', 'clinician_name', 'clinician_title',
      'patient_name', 'patient_dob', 'patient_id',
      'indication', 'protocol_type', 'num_sessions',
      'consent_date', 'patient_signature', 'clinician_signature',
    ],
    body: `# Neurofeedback — Informed Consent

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}, {{clinician_title}}
**Patient:** {{patient_name}}  |  DOB: {{patient_dob}}  |  ID: {{patient_id}}
**Indication:** {{indication}}
**Protocol type:** {{protocol_type}}  |  Planned sessions: {{num_sessions}}

---

## 1. Purpose
Neurofeedback (EEG biofeedback) trains you to self-regulate brain activity by providing
real-time feedback of your own EEG signal. This consent form describes what is involved.

## 2. Procedure
Electrodes are placed on the scalp using conductive gel. No electrical current is applied
to the brain; the system only reads signals. You observe a display and receive auditory
or visual feedback correlated with targeted brainwave frequencies. Sessions last
approximately 30–50 minutes each across {{num_sessions}} planned visits.

## 3. Anticipated Benefits
Potential benefits include improved attention, reduced anxiety, or enhanced sleep
quality, depending on the protocol and indication. Evidence quality varies by condition;
your clinician will discuss the current evidence base with you.

## 4. Risks and Side-Effects
Common:
- Fatigue or drowsiness after sessions, particularly early in the course
- Mild scalp discomfort from electrode paste

Uncommon:
- Transient worsening of target symptoms (e.g., increased irritability, disturbed sleep)
  in the first 2–4 sessions. Report these to your clinician promptly.
- Headache

Rare:
- Mood instability in predisposed individuals
- Reported but unconfirmed: exacerbation of seizure activity in epilepsy — inform your
  clinician of any seizure history before commencing.

## 5. Alternatives
Pharmacotherapy, CBT, mindfulness-based interventions, or no treatment are alternatives.

## 6. Voluntariness and Right to Withdraw
You may stop at any time without it affecting your other care.

## 7. Confidentiality
Data is stored securely under UK GDPR. See Privacy & Data Policy (T04).

---

## Signatures

I, {{patient_name}}, consent to neurofeedback treatment as described above.

Patient signature: {{patient_signature}}  |  Date: {{consent_date}}
Clinician signature: {{clinician_signature}}  |  Date: {{consent_date}}
`,
  },

  {
    id: 'T04',
    name: 'General Privacy & Data Policy',
    cat: 'Privacy',
    pages: 6,
    langs: ['EN', 'FR', 'ES', 'DE'],
    auto: false,
    variables: [
      'clinic_name', 'controller_name', 'controller_address',
      'dpo_name', 'dpo_email', 'policy_version', 'policy_date',
    ],
    body: `# Privacy & Data Policy

**Controller:** {{controller_name}}, {{controller_address}}
**DPO:** {{dpo_name}} — {{dpo_email}}
**Version:** {{policy_version}}  |  **Effective date:** {{policy_date}}

---

## 1. Who We Are
{{clinic_name}} is the data controller responsible for personal data collected in
connection with clinical services, the DeepSynaps Studio platform, and related
digital tools. This policy is issued under UK GDPR (UK General Data Protection
Regulation) and the Data Protection Act 2018.

## 2. Lawful Basis for Processing
We process your personal data under the following lawful bases:

- Article 6(1)(b) — Performance of a contract (provision of clinical services)
- Article 6(1)(c) — Legal obligation (clinical record-keeping)
- Article 9(2)(h) — Healthcare purposes (special category health data)
- Article 6(1)(a) / Article 9(2)(a) — Explicit consent (where required, e.g., research)

## 3. Data We Collect
- Identity data: name, date of birth, NHS number / patient identifier
- Contact data: address, email, telephone
- Clinical data: diagnoses (ICD-11 codes), treatment history, session notes,
  assessment scores, device usage logs, EEG / brain stimulation parameter records
- Technical data: IP address, browser type, session logs from the patient portal
- Financial / administrative data: insurance details, billing records

We do not collect data beyond what is necessary for the stated purpose.

## 4. How We Use Your Data
- Delivering and documenting clinical treatment
- Communicating with you and your referring clinician
- Submitting to insurers or commissioners where authorised
- Service improvement and anonymised audit (with opt-out available)
- Legal and regulatory compliance

## 5. Sharing Your Data
We may share data with:
- Your GP and referring clinicians (clinical necessity)
- Insurance companies or NHS commissioners (with your authority)
- Technology sub-processors (e.g., cloud hosting) under Data Processing Agreements
- Regulatory bodies (CQC, MHRA) if legally required

We do not sell personal data. We do not transfer data outside the UK/EEA unless
adequate safeguards (Standard Contractual Clauses or UK Addendum) are in place.

## 6. Retention
Clinical records are retained for a minimum of 8 years after the last clinical
contact (10 years for children's records, until age 25). Administrative records
are retained for 7 years. Research data is retained per the relevant ethics approval.

## 7. Your Rights
Under UK GDPR you have the right to:
- Access a copy of your personal data (Subject Access Request)
- Rectify inaccurate data
- Erasure ("right to be forgotten") — subject to legal retention obligations
- Restriction of processing
- Data portability
- Object to processing for direct marketing or research
- Not be subject to solely automated decisions with legal or significant effect
  (Article 22 — see also T07 AI-Assisted Treatment Consent for AI-specific rights)

To exercise any right, contact: {{dpo_email}}
We will respond within one calendar month.

## 8. Cookies and Tracking
The patient portal uses strictly necessary session cookies and, with consent,
analytics cookies. You may withdraw cookie consent at any time via the site settings.

## 9. Security
We implement appropriate technical and organisational measures including encryption
at rest and in transit, role-based access control, and regular penetration testing.

## 10. Complaints
If you believe we have handled your data unlawfully, you have the right to lodge a
complaint with the Information Commissioner's Office (ICO):
  Website: ico.org.uk  |  Helpline: 0303 123 1113

We would appreciate the opportunity to address your concern directly before you
contact the ICO.
`,
  },

  {
    id: 'T05',
    name: 'Home Device Use Agreement',
    cat: 'Consent',
    pages: 3,
    langs: ['EN'],
    auto: false,
    variables: [
      'clinic_name', 'clinician_name', 'patient_name', 'patient_dob', 'patient_id',
      'device_name', 'device_serial', 'loan_start_date', 'loan_end_date',
      'consent_date', 'patient_signature', 'clinician_signature',
    ],
    body: `# Home Device Use Agreement

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}
**Patient:** {{patient_name}}  |  DOB: {{patient_dob}}  |  ID: {{patient_id}}
**Device:** {{device_name}}  |  Serial: {{device_serial}}
**Loan period:** {{loan_start_date}} to {{loan_end_date}}

---

## 1. Purpose
This agreement governs the use of the above device for unsupervised home sessions
as part of your prescribed treatment plan. It supplements but does not replace the
device-specific consent form (T01 or T02).

## 2. Approved Use
You agree to use the device ONLY:
- For the indication and protocol specified in your treatment plan
- At the parameters set or approved by {{clinician_name}}
- On yourself only — do not use on any other person

## 3. Safe Use Requirements
Before each session you must:
- Inspect electrodes/coil and leads for damage. Do not use damaged equipment.
- Ensure skin at electrode sites is clean, intact, and free of cuts or rashes.
- Avoid sessions if you are unwell, febrile, or have consumed alcohol in the past 4 hours.
- Have a responsible adult present or contactable during the first 3 home sessions.

## 4. When to Stop and Seek Help
Stop immediately and contact {{clinic_name}} or emergency services (999) if you experience:
- Seizure or loss of consciousness
- Severe or worsening headache
- Skin burn, blistering, or persistent pain at electrode sites
- Sudden mood change, confusion, or distressing thoughts

## 5. Data and Remote Monitoring
Session data may be transmitted to {{clinic_name}} via the DeepSynaps app for
clinical review. See Privacy & Data Policy (T04) for full details.

## 6. Device Care and Return
- Store the device as instructed. Do not expose to moisture or extreme temperatures.
- Return the device in its original condition by {{loan_end_date}} or earlier if requested.
- Report any damage or malfunction immediately.

## 7. Liability
The device remains the property of {{clinic_name}}. You are responsible for reasonable
care. You are not liable for normal wear and tear.

## 8. Voluntariness
You may return the device and discontinue home sessions at any time.

---

## Signatures

I, {{patient_name}}, confirm I have received the device, read and understood this
agreement, and agree to use the device only as instructed.

Patient signature: {{patient_signature}}  |  Date: {{consent_date}}
Clinician signature: {{clinician_signature}}  |  Date: {{consent_date}}
`,
  },

  {
    id: 'T06',
    name: 'Video Consultation Consent',
    cat: 'Telehealth',
    pages: 2,
    langs: ['EN', 'FR'],
    auto: false,
    variables: [
      'clinic_name', 'clinician_name', 'patient_name', 'patient_dob',
      'platform_name', 'consent_date', 'patient_signature', 'clinician_signature',
    ],
    body: `# Video Consultation Consent

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}
**Patient:** {{patient_name}}  |  DOB: {{patient_dob}}
**Platform:** {{platform_name}}

---

## 1. Purpose
Video consultations allow you to receive clinical assessments, follow-up reviews, and
psychoeducation remotely. This form outlines your rights and the limitations of
video-based care.

## 2. How It Works
Consultations are conducted via {{platform_name}}, which uses end-to-end encryption.
You will need a device with a camera, microphone, and a stable internet connection.

## 3. Limitations
- Video consultation is not a substitute for in-person assessment when physical
  examination is clinically necessary.
- Technical failures may interrupt or prevent a consultation.
- {{clinician_name}} may determine that in-person attendance is required and will
  advise you accordingly.

## 4. Privacy and Recording
- Consultations are NOT routinely recorded unless both parties explicitly agree and
  consent is documented separately.
- Ensure you are in a private location. {{clinic_name}} is not responsible for
  breaches caused by your own environment.
- Data transmitted is subject to UK GDPR — see Privacy & Data Policy (T04).

## 5. Emergency Procedures
Video consultation is NOT suitable for emergencies. If you are in crisis, call 999
or go to your nearest A&E. Inform your clinician at the start of the call if you
have safety concerns.

## 6. Voluntariness
You may opt for in-person consultation instead. Declining video consultation will
not affect the quality of your care.

---

## Signatures

I, {{patient_name}}, consent to receive clinical consultations via video as described.

Patient signature: {{patient_signature}}  |  Date: {{consent_date}}
Clinician signature: {{clinician_signature}}  |  Date: {{consent_date}}
`,
  },

  {
    id: 'T07',
    name: 'AI-Assisted Treatment Consent',
    cat: 'AI',
    pages: 4,
    langs: ['EN'],
    auto: false,
    variables: [
      'clinic_name', 'clinician_name', 'patient_name', 'patient_dob', 'patient_id',
      'ai_system_name', 'ai_version', 'ai_function_description',
      'consent_date', 'patient_signature', 'clinician_signature',
    ],
    body: `# AI-Assisted Treatment — Informed Consent

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}
**Patient:** {{patient_name}}  |  DOB: {{patient_dob}}  |  ID: {{patient_id}}
**AI system:** {{ai_system_name}} (version {{ai_version}})
**AI function:** {{ai_function_description}}

---

## 1. Purpose
{{clinic_name}} uses AI-assisted tools to support — not replace — clinical decision-making.
This consent form explains how AI is used in your care and your rights in relation
to automated processing.

## 2. What the AI Does
The AI system ({{ai_system_name}}) analyses clinical data (e.g., assessment scores,
EEG features, treatment history) to generate suggestions such as:
- Protocol recommendations
- Outcome predictions
- Risk flag alerts

These outputs are presented as decision-support to {{clinician_name}}. No clinical
decision is made by the AI alone.

## 3. What the AI Does NOT Do
- The AI does not diagnose.
- The AI does not prescribe or administer treatment.
- The AI does not replace the clinical judgement of {{clinician_name}}.
- The AI does not access data outside the scope described above without further consent.

## 4. AI Limitations
AI systems can produce incorrect or misleading outputs. The evidence base for
AI-assisted brain stimulation planning is emerging. All AI suggestions are reviewed
by a qualified clinician before influencing your care.

## 5. Your Rights Under UK GDPR Article 22
UK GDPR Article 22 gives you the right not to be subject to a decision based solely
on automated processing where that decision produces a legal or similarly significant
effect on you.

At {{clinic_name}}, no decision with such effect is made solely by automated means.
However, you have the right to:
- Request human review of any AI-informed recommendation
- Object to the use of your data in AI processing for non-essential purposes
- Obtain an explanation of how any AI-generated recommendation was reached

To exercise these rights, contact: {{clinician_name}} at {{clinic_name}}.

## 6. Data and Model Training
Your de-identified data may be used to improve the AI system unless you opt out.
Opt-out does not affect your treatment. To opt out, notify {{clinic_name}} in writing.

## 7. Regulatory Status
{{ai_system_name}} is a clinical decision-support tool. It does not hold standalone
UKCA or CE medical device marking as a diagnostic or therapeutic device. Its outputs
are adjuncts to, not substitutes for, regulated clinical practice.

## 8. Voluntariness
You may decline AI-assisted analysis. {{clinician_name}} will provide care using
conventional assessment methods.

---

## Signatures

I, {{patient_name}}, confirm I have read and understood the above explanation of
AI-assisted tools used in my care and consent to their use as described.

Patient signature: {{patient_signature}}  |  Date: {{consent_date}}
Clinician signature: {{clinician_signature}}  |  Date: {{consent_date}}
`,
  },

  {
    id: 'T08',
    name: 'Initial Assessment Report',
    cat: 'Report',
    pages: 5,
    langs: ['EN'],
    auto: true,
    variables: [
      'clinic_name', 'clinician_name', 'clinician_title',
      'patient_name', 'patient_dob', 'patient_id',
      'assessment_date', 'referral_source',
      'presenting_complaint', 'history_of_presenting_complaint',
      'past_psychiatric_history', 'past_medical_history',
      'medications_current', 'allergies',
      'family_history', 'social_history', 'substance_use',
      'mental_state_examination', 'cognitive_screen',
      'icd11_primary_code', 'icd11_primary_label',
      'icd11_secondary_codes',
      'phq9_score', 'gad7_score', 'aims_score', 'other_measures',
      'formulation', 'risk_summary', 'plan', 'follow_up_date',
    ],
    body: `# Initial Assessment Report

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}, {{clinician_title}}
**Patient:** {{patient_name}}  |  DOB: {{patient_dob}}  |  ID: {{patient_id}}
**Date of assessment:** {{assessment_date}}
**Referral source:** {{referral_source}}

---

## S — Subjective

### Presenting Complaint
{{presenting_complaint}}

### History of Presenting Complaint
{{history_of_presenting_complaint}}

### Past Psychiatric History
{{past_psychiatric_history}}

### Past Medical History
{{past_medical_history}}

### Current Medications and Doses
{{medications_current}}

### Allergies / Adverse Drug Reactions
{{allergies}}

### Family History
{{family_history}}

### Social History
{{social_history}}

### Substance Use
{{substance_use}}

---

## O — Objective

### Mental State Examination
{{mental_state_examination}}

### Cognitive Screening
{{cognitive_screen}}

### Standardised Outcome Measures

| Measure   | Score          | Clinical cut-off / interpretation |
|-----------|----------------|-----------------------------------|
| PHQ-9     | {{phq9_score}} | ≥10 = moderate depression         |
| GAD-7     | {{gad7_score}} | ≥10 = moderate anxiety            |
| AIMS      | {{aims_score}} | Abnormal Involuntary Movement Scale|
| Other     | {{other_measures}} |                               |

---

## A — Assessment

### Primary Diagnosis (ICD-11)
Code: {{icd11_primary_code}}  |  Label: {{icd11_primary_label}}

### Secondary / Comorbid Diagnoses (ICD-11)
{{icd11_secondary_codes}}

### Formulation
{{formulation}}

### Risk Summary
{{risk_summary}}

---

## P — Plan

{{plan}}

**Follow-up date:** {{follow_up_date}}

---

*Report completed by {{clinician_name}}, {{clinician_title}}, {{assessment_date}}.*
*This document is a clinical record and is subject to standard confidentiality provisions.*
`,
  },

  {
    id: 'T09',
    name: 'Session Progress Note',
    cat: 'Report',
    pages: 2,
    langs: ['EN'],
    auto: true,
    variables: [
      'clinic_name', 'clinician_name',
      'patient_name', 'patient_id',
      'session_date', 'session_number', 'session_duration_min',
      'subjective', 'objective', 'device_parameters', 'tolerability',
      'assessment', 'plan', 'next_session_date',
    ],
    body: `# Session Progress Note

**Clinic:** {{clinic_name}}  |  **Clinician:** {{clinician_name}}
**Patient:** {{patient_name}}  |  **ID:** {{patient_id}}
**Date:** {{session_date}}  |  **Session:** {{session_number}}  |  **Duration:** {{session_duration_min}} min

---

## S — Subjective
{{subjective}}

## O — Objective

### Observed Clinical Status
{{objective}}

### Device / Stimulation Parameters This Session
{{device_parameters}}

### Tolerability
{{tolerability}}

## A — Assessment
{{assessment}}

## P — Plan
{{plan}}

**Next session:** {{next_session_date}}

---

*Signed: {{clinician_name}}  |  {{session_date}}*
`,
  },

  {
    id: 'T10',
    name: 'Treatment Outcome Report',
    cat: 'Report',
    pages: 6,
    langs: ['EN'],
    auto: true,
    variables: [
      'clinic_name', 'clinician_name', 'clinician_title',
      'patient_name', 'patient_dob', 'patient_id',
      'treatment_start_date', 'treatment_end_date', 'total_sessions',
      'modality', 'protocol_name',
      'icd11_primary_code', 'icd11_primary_label',
      'baseline_phq9', 'endpoint_phq9',
      'baseline_gad7', 'endpoint_gad7',
      'baseline_aims', 'endpoint_aims',
      'other_baseline_measures', 'other_endpoint_measures',
      'adverse_events_summary',
      'clinical_response', 'clinical_remission',
      'responder_definition', 'remission_definition',
      'formulation_summary', 'recommendations',
      'report_date',
    ],
    body: `# Treatment Outcome Report

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}, {{clinician_title}}
**Patient:** {{patient_name}}  |  DOB: {{patient_dob}}  |  ID: {{patient_id}}
**Treatment period:** {{treatment_start_date}} – {{treatment_end_date}}
**Total sessions completed:** {{total_sessions}}
**Modality / Protocol:** {{modality}} — {{protocol_name}}

---

## 1. Diagnosis
Primary (ICD-11): {{icd11_primary_code}} {{icd11_primary_label}}

## 2. Outcome Measure Summary

| Measure | Baseline | Endpoint | Change | Response criteria met |
|---------|----------|----------|--------|-----------------------|
| PHQ-9   | {{baseline_phq9}} | {{endpoint_phq9}} | — | ≥50% reduction (responder definition: {{responder_definition}}) |
| GAD-7   | {{baseline_gad7}} | {{endpoint_gad7}} | — | — |
| AIMS    | {{baseline_aims}} | {{endpoint_aims}} | — | — |
| Other   | {{other_baseline_measures}} | {{other_endpoint_measures}} | — | — |

**Clinical response:** {{clinical_response}}
**Clinical remission:** {{clinical_remission}}
*(Remission definition: {{remission_definition}})*

## 3. Tolerability and Adverse Events
{{adverse_events_summary}}

## 4. Clinical Summary
{{formulation_summary}}

## 5. Recommendations
{{recommendations}}

---

*Report prepared by {{clinician_name}}, {{clinician_title}}, {{report_date}}.*
*Outcome data are patient-reported and clinician-rated. They reflect this treatment
episode only and do not constitute a long-term prognosis.*
`,
  },

  {
    id: 'T11',
    name: 'GP Referral Letter',
    cat: 'Letter',
    pages: 2,
    langs: ['EN'],
    auto: true,
    variables: [
      'clinic_name', 'clinic_address', 'clinic_tel', 'clinic_email',
      'clinician_name', 'clinician_title',
      'gp_name', 'gp_practice', 'gp_address',
      'patient_name', 'patient_dob', 'patient_address', 'patient_nhs',
      'letter_date',
      'reason_for_referral', 'clinical_summary',
      'current_medications', 'relevant_investigations',
      'request', 'urgency',
    ],
    body: `{{clinic_name}}
{{clinic_address}}
Tel: {{clinic_tel}}  |  Email: {{clinic_email}}

{{letter_date}}

Dr {{gp_name}}
{{gp_practice}}
{{gp_address}}

---

Re: {{patient_name}}  |  DOB: {{patient_dob}}  |  NHS No: {{patient_nhs}}
Address: {{patient_address}}

Dear Dr {{gp_name}},

## Reason for Contact
{{reason_for_referral}}

## Clinical Summary
{{clinical_summary}}

## Current Medications
{{current_medications}}

## Relevant Investigations
{{relevant_investigations}}

## Request
{{request}}

**Urgency:** {{urgency}}

I would be grateful for your review and involvement in this patient's ongoing care.
Please do not hesitate to contact me if you require further information.

Yours sincerely,

{{clinician_name}}
{{clinician_title}}
{{clinic_name}}
`,
  },

  {
    id: 'T12',
    name: 'Discharge Summary Letter',
    cat: 'Letter',
    pages: 3,
    langs: ['EN'],
    auto: true,
    variables: [
      'clinic_name', 'clinic_address', 'clinic_tel', 'clinic_email',
      'clinician_name', 'clinician_title',
      'gp_name', 'gp_practice', 'gp_address',
      'patient_name', 'patient_dob', 'patient_address', 'patient_nhs',
      'letter_date', 'discharge_date',
      'icd11_primary_code', 'icd11_primary_label',
      'treatment_summary', 'outcome_summary',
      'discharge_medications', 'follow_up_plan',
      'safety_netting', 'crisis_plan',
    ],
    body: `{{clinic_name}}
{{clinic_address}}
Tel: {{clinic_tel}}  |  Email: {{clinic_email}}

{{letter_date}}

Dr {{gp_name}}
{{gp_practice}}
{{gp_address}}

---

Re: {{patient_name}}  |  DOB: {{patient_dob}}  |  NHS No: {{patient_nhs}}
Address: {{patient_address}}

Dear Dr {{gp_name}},

I am writing to inform you that {{patient_name}} has been discharged from the care
of {{clinic_name}} on {{discharge_date}}.

## Diagnosis at Discharge
ICD-11: {{icd11_primary_code}} {{icd11_primary_label}}

## Treatment Summary
{{treatment_summary}}

## Outcome at Discharge
{{outcome_summary}}

## Medications at Discharge
{{discharge_medications}}

## Follow-Up Plan
{{follow_up_plan}}

## Safety-Netting
{{safety_netting}}

## Crisis Plan
{{crisis_plan}}

Please re-refer this patient to our service if clinically indicated. Contact details
are above.

Yours sincerely,

{{clinician_name}}
{{clinician_title}}
{{clinic_name}}
`,
  },

  {
    id: 'T13',
    name: 'Insurance/Funding Report',
    cat: 'Admin',
    pages: 4,
    langs: ['EN'],
    auto: false,
    variables: [
      'clinic_name', 'clinician_name', 'clinician_title', 'clinician_reg_number',
      'patient_name', 'patient_dob', 'patient_id', 'patient_policy_number',
      'insurer_name', 'insurer_address', 'authorisation_number',
      'report_date',
      'icd11_primary_code', 'icd11_primary_label',
      'treatment_rationale', 'treatment_plan_summary',
      'sessions_requested', 'cost_per_session', 'total_cost',
      'evidence_summary', 'clinical_necessity_statement',
      'prior_treatments', 'treatment_response_history',
      'clinician_signature',
    ],
    body: `# Insurance / Funding Report

**Clinic:** {{clinic_name}}
**Clinician:** {{clinician_name}}, {{clinician_title}}
**Registration No:** {{clinician_reg_number}}
**Report date:** {{report_date}}

---

**Patient name:** {{patient_name}}
**DOB:** {{patient_dob}}  |  **Patient ID:** {{patient_id}}
**Policy / Reference No:** {{patient_policy_number}}

**Insurer / Commissioner:** {{insurer_name}}, {{insurer_address}}
**Authorisation No (if applicable):** {{authorisation_number}}

---

## Section 1 — Diagnosis
Primary ICD-11 code: {{icd11_primary_code}}
Primary ICD-11 label: {{icd11_primary_label}}

## Section 2 — Prior Treatments and Response
{{prior_treatments}}

Treatment response history:
{{treatment_response_history}}

## Section 3 — Proposed Treatment Plan
{{treatment_plan_summary}}

Sessions requested: {{sessions_requested}}
Cost per session: {{cost_per_session}}
Total estimated cost: {{total_cost}}

## Section 4 — Clinical Necessity
{{clinical_necessity_statement}}

## Section 5 — Evidence Base
{{evidence_summary}}

Note: Treatment protocols are evidence-informed. Evidence grades are estimates based
on the current literature and do not constitute a guarantee of outcome. All parameters
are subject to clinician review at each session.

## Section 6 — Clinician Declaration
I confirm that the information above is accurate to the best of my knowledge and that
the proposed treatment is clinically appropriate for this patient.

Clinician signature: {{clinician_signature}}  |  Date: {{report_date}}
`,
  },

  {
    id: 'T14',
    name: 'Intake Assessment Form',
    cat: 'Intake',
    pages: 5,
    langs: ['EN'],
    auto: false,
    variables: [
      'clinic_name', 'patient_name', 'patient_dob', 'patient_address',
      'patient_tel', 'patient_email', 'patient_nhs', 'patient_gp',
      'emergency_contact_name', 'emergency_contact_tel',
      'referral_source', 'referral_date',
      'presenting_concerns', 'symptom_duration',
      'previous_mental_health_treatment', 'previous_brain_stimulation',
      'current_medications_and_doses', 'otc_supplements',
      'allergies_and_reactions', 'significant_medical_history',
      'neurological_history', 'seizure_history',
      'cardiac_implants', 'metallic_implants',
      'pregnancy_status',
      'alcohol_units_per_week', 'substance_use_details',
      'employment_status', 'living_situation',
      'phq9_score', 'gad7_score', 'wsas_score',
      'form_date', 'patient_signature',
    ],
    body: `# Intake Assessment Form

**Clinic:** {{clinic_name}}
**Date:** {{form_date}}

---

## Section 1 — Personal Details

Full name: {{patient_name}}
Date of birth: {{patient_dob}}
Address: {{patient_address}}
Telephone: {{patient_tel}}
Email: {{patient_email}}
NHS No: {{patient_nhs}}
Registered GP: {{patient_gp}}

Emergency contact name: {{emergency_contact_name}}
Emergency contact telephone: {{emergency_contact_tel}}

## Section 2 — Referral

Referral source: {{referral_source}}
Referral date: {{referral_date}}

## Section 3 — Presenting Concerns

Please describe what has brought you to the clinic:
{{presenting_concerns}}

How long have these concerns been present?
{{symptom_duration}}

## Section 4 — Previous Treatment History

Previous mental health treatment (including medication, therapy, hospitalisation):
{{previous_mental_health_treatment}}

Previous brain stimulation treatment (TMS, tDCS, ECT, DBS):
{{previous_brain_stimulation}}

## Section 5 — Current Medications and Supplements

Prescribed medications and doses:
{{current_medications_and_doses}}

Over-the-counter medications and supplements:
{{otc_supplements}}

Known allergies / adverse drug reactions:
{{allergies_and_reactions}}

## Section 6 — Medical and Neurological History

Significant medical history:
{{significant_medical_history}}

Neurological conditions (e.g., MS, stroke, brain injury, migraine):
{{neurological_history}}

Seizure history (personal or immediate family):
{{seizure_history}}

Cardiac implants (pacemaker, ICD, DBS, cochlear implant): {{cardiac_implants}}
Metallic implants in the skull or within 6 cm of scalp: {{metallic_implants}}
Current or possible pregnancy: {{pregnancy_status}}

## Section 7 — Lifestyle

Alcohol (approximate units per week): {{alcohol_units_per_week}}
Other substance use: {{substance_use_details}}
Employment status: {{employment_status}}
Living situation: {{living_situation}}

## Section 8 — Screening Questionnaires (Clinician Completes)

| Measure | Score      |
|---------|------------|
| PHQ-9   | {{phq9_score}} |
| GAD-7   | {{gad7_score}} |
| WSAS    | {{wsas_score}} |

---

## Declaration

I confirm that the information I have provided is accurate and complete to the best of
my knowledge. I understand that this information will be used to guide my clinical care.

Patient signature: {{patient_signature}}  |  Date: {{form_date}}
`,
  },

  {
    id: 'T15',
    name: 'Home Program Instruction Sheet',
    cat: 'Home Care',
    pages: 2,
    langs: ['EN', 'FR'],
    auto: true,
    variables: [
      'patient_name', 'clinician_name', 'clinic_name', 'clinic_tel',
      'device_name', 'session_frequency', 'session_duration_min',
      'target_site', 'intensity_setting', 'programme_name',
      'start_date', 'review_date',
    ],
    body: `# Home Program Instructions

**Patient:** {{patient_name}}
**Prepared by:** {{clinician_name}}, {{clinic_name}}
**Device:** {{device_name}}
**Programme:** {{programme_name}}
**Sessions:** {{session_frequency}} per week  |  {{session_duration_min}} minutes each
**Target site:** {{target_site}}  |  **Intensity setting:** {{intensity_setting}}
**Start date:** {{start_date}}  |  **Review date:** {{review_date}}
**Clinic telephone (queries):** {{clinic_tel}}

---

## Before Every Session — Checklist

Please complete every item before switching on the device.

- [ ] I am in a comfortable, quiet seated position
- [ ] My skin at {{target_site}} is clean and dry, with no cuts, rashes, or sunburn
- [ ] I have not consumed alcohol in the past 4 hours
- [ ] I do not feel unwell, feverish, or unusually anxious today
- [ ] The device cable and electrodes/coil show no visible damage
- [ ] I have set the device to programme: {{programme_name}}, intensity: {{intensity_setting}}
- [ ] Someone is contactable (phone nearby) for the duration

## During the Session

- Sit still and relax. You may listen to calm music or an audiobook.
- Mild tingling or warmth under the electrodes/coil is expected and normal.
- Do NOT increase the intensity above {{intensity_setting}} without instruction from {{clinician_name}}.
- If you feel severe pain, strong burning, or unusual distress — stop the session immediately.

## After the Session

- Note how you felt in your session diary (app or paper log).
- Mild fatigue or a light headache for up to 1 hour is normal.
- Drink water and avoid strenuous exercise for 30 minutes after the session.

## Stop the Session and Call the Clinic if You Experience

- Seizure or loss of consciousness — call 999 first, then the clinic
- Severe headache that does not improve within 1 hour
- Skin blistering, burn, or persistent pain at the electrode site
- Sudden marked worsening of mood or distressing thoughts

**Clinic number:** {{clinic_tel}}
**Emergency:** 999 (UK)  |  NHS 111 (non-emergency)

## Frequently Asked Questions

**What if I miss a session?**
Skip it and continue on your normal schedule. Do not double up.

**Can I use the device more often than prescribed?**
No. Stick to {{session_frequency}} per week unless {{clinician_name}} advises otherwise.

**What if the device shows an error code?**
Do not attempt to fix it yourself. Note the code and contact {{clinic_name}}.

---

*These instructions are specific to your prescribed programme. Do not share
the device or programme settings with others.*
`,
  },
];

export function getTemplate(id) {
  return DOCUMENT_TEMPLATES.find(t => t.id === id) || null;
}

export function renderTemplate(id, values = {}) {
  const tpl = getTemplate(id);
  if (!tpl) return '';
  return tpl.body.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? `{{${k}}}`);
}
