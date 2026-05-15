# Virtual Care Video Assessment Design: A Research Report on Remote Neurological and Movement Assessment via Telehealth

## Executive Summary

This report synthesizes current evidence on remote neurological and movement assessment using telehealth video technologies. The COVID-19 pandemic dramatically accelerated the adoption of telemedicine for movement disorders, stroke assessment, and rehabilitation services. Research demonstrates that many validated clinical assessments can be administered remotely with acceptable to excellent reliability, though important limitations exist for certain examination components. This report covers six major domains: remote neurological assessment, remote movement assessment, virtual rehabilitation, home video monitoring, asynchronous video review, and clinical validation studies. The findings support a hybrid model combining synchronous and asynchronous video assessment with emerging wearable and smartphone-based technologies.

---

## 1. Remote Neurological Assessment

### 1.1 Tele-NIH Stroke Scale (tNIHSS)

The National Institutes of Health Stroke Scale (NIHSS) is the most widely recommended tool for quantifying neurological impairment in acute stroke. Multiple validation studies have examined its remote administration via video.

**Key Validation Evidence:**

A multi-center prospective study by Shafqat et al. (2022) involving 95 patients at two centers (Vall d'Hebron, Barcelona and Rambam, Israel) found an overall intraclass correlation coefficient (ICC) of 0.936 between remote and bedside NIHSS assessments. The ICC was 0.991 at Vall d'Hebron and 0.847 at Rambam, indicating excellent and good reliability respectively. The study used a smartphone-based telestroke system that captures full NIHSS video segments, transmits them securely to cloud storage, and enables offline assessment by a distant neurologist.

Individual subscale weighted Kappa (wK) scores ranged from 0.285 (limb ataxia) to 0.646 (level of consciousness questions), with most items showing moderate agreement. The lowest reliability was consistently observed for limb ataxia (wK = 0.285), which aligns with prior telemedicine studies. Language aphasia (wK = 0.499) and motor arm assessments (wK = 0.355-0.503) showed moderate agreement. Notably, the total NIHSS scores determined remotely did not differ significantly from bedside scores by more than two points (p = 0.325).

Demaerschalk et al. (2012) demonstrated high total NIHSS score correlation (r = 0.949; p < 0.001) between bedside and smartphone videoconferencing assessments in 100 stroke patients. Eight categories showed high agreement (level of consciousness questions/commands, visual fields, motor arm/leg, best language), while ataxia again showed poor agreement. Six categories showed moderate agreement.

**Development of Modified Remote NIHSS (rNIHSS):**

Ning Wei et al. (2025) developed a modified remote NIHSS for caregiver-assisted telestroke assessments. The rNIHSS excludes items with poor reliability during remote administration: visual field, facial palsy, extinction/inattention, and ataxia. In mild stroke patients, 98.2% of subjects had total rNIHSS scores within 2 points of bedside assessment. However, reliability was more limited in moderate (93.1% agreement) and severe strokes (77.8% agreement). Correlation coefficients between rNIHSS and bedside NIHSS were 0.97, with 90-day and 1-year modified Rankin scale correlations of 0.88 and 0.86 respectively (p < 0.01).

**Technical Considerations for tNIHSS:**
- Smartphone-based capture at 60 fps with 1080p resolution is sufficient
- Dual camera systems (wide angle and zoom) may improve motor item reliability
- Secure HIPAA-compliant cloud transmission is essential
- Offline (asynchronous) assessment is comparable to real-time video
- Future integration with AI decision support is anticipated

### 1.2 Virtual MDS-UPDRS Assessment

The Movement Disorder Society Unified Parkinson's Disease Rating Scale (MDS-UPDRS) is the gold standard for assessing Parkinson's disease symptoms. Remote administration presents unique challenges because rigidity testing and postural stability assessment require physical contact.

**Validation Status:**

The feasibility of a modified MDS-UPDRS motor examination (excluding rigidity and postural stability) has been demonstrated across multiple studies. Stillerova et al. (2016) found that between zero and seven items could not be completed per participant (median 2.0, IQR 1.0-4.0), with a median score difference of 3.0 (IQR 1.5-9.0) between face-to-face and videoconference assessments. Critically, lower extremity tremor could not be assessed in 10 of 11 participants.

Schneider et al. (AT-HOME PD study) reported a moderate correlation (ICC = 0.51) between remote and in-person MDS-UPDRS Part III scores in 38 participants, with lower correlations partly attributable to different examiners conducting the assessments. The MDS assembled an international working group during COVID-19 to develop and validate a patient guide for remote MDS-UPDRS Part III administration.

**Resource-Limited Setting Feasibility:**

A critical study from Southern Brazil (34 patients from the public healthcare system) found that complete MDS-UPDRS Part III evaluation was only possible in 41.2% of patients. The least assessable parameters were:
- Freezing of gait (52.9% ratable)
- Gait (70.6% ratable)
- Leg agility and rest tremor (76.5% ratable each)

Incomplete evaluations were directly associated with disability level (p = 0.048, r = 0.34) and inversely associated with available physical space (p = 0.003, r = 0.55). This highlights the importance of adequate space and caregiver assistance for remote motor examinations.

**Modified MDS-UPDRS Reliability:**

Abdolahi et al. (2013) demonstrated potential reliability and validity of a modified UPDRS that could be administered remotely. A secondary analysis of CALM-PD clinical trial data concluded that the modified version would be cross-sectionally and longitudinally reliable. This modified approach excludes items requiring direct physical contact while retaining the majority of motor assessment components.

### 1.3 Remote MoCA Administration

The Montreal Cognitive Assessment (MoCA) is widely used for cognitive screening in movement disorders. Remote administration requires adaptations for videoconference delivery.

**Adapted Administration Protocol:**

A French-language study demonstrated successful remote MoCA administration via videoconference (Zoom) with the following adaptations:
- **Trail-making test**: Administered orally via screen sharing; participants verbalize the sequence
- **Cube copy**: Model shown via screen share; participants display their drawing to the camera
- **Clock drawing**: Participants draw and show to the camera for scoring
- **Naming**: Low-familiarity animal figures shown via screen sharing
- **Attention**: Digit span, letter tapping, and serial 7s administered verbally
- **Language**: Sentence repetition and phonemic fluency conducted verbally
- **Memory**: Delayed recall of five-word list conducted verbally
- **Abstraction**: Similarity items administered verbally

Pre-session technology tutorials with a research assistant ensured adequate internet connection and tool mastery. Screen sharing functionality was critical for visuospatial items.

**Validation Evidence:**

MoCA remote administration has been shown feasible in movement disorder populations, though formal psychometric validation studies comparing remote and in-person scores remain limited. The Movement Disorder Society recognizes remote MoCA as a feasible approach for cognitive screening in telemedicine practice.

### 1.4 Telehealth Movement Disorder Society Rating

The Movement Disorder Society has established a Telemedicine Study Group led by Nicholas Galifianakis and Alexander Pantelyat. A 2015 global survey of 549 MDS members from 83 countries found that half used telemedicine for clinical care, with video visits conducted to outpatient clinics (54%), patient homes (31%), and other settings.

**Telemedicine for Atypical Parkinsonian Disorders:**

Research has explored telemedicine-based delivery of multidisciplinary palliative care for patients with atypical parkinsonian disorders (MSA, DLB, CBS, PSP). These rapidly progressive conditions create severe motor and non-motor disability that presents major barriers to in-person multidisciplinary care. Virtual home visits have shown feasibility and preliminary efficacy for improving quality of life by prioritizing symptom relief.

**Validated Rating Scales for Remote Use:**
- UPDRS/MDS-UPDRS: Validated in modified form (excluding rigidity and postural stability)
- UHDRS (Unified Huntington's Disease Rating Scale): Blinded video rating used for clinical trials; real-time evaluation considered feasible
- MoCA: Demonstrated feasibility in movement disorder populations
- Essential tremor rating scales: Substantial agreement between remote and in-person video

---

## 2. Remote Movement Assessment

### 2.1 Home-Based Gait Analysis Using Smartphones

VisionMD-Gait represents a breakthrough in scalable clinical gait assessment from smartphone videos. This platform addresses the critical barriers of traditional gait analysis, which requires costly sensors, controlled environments, and highly trained personnel.

**Technical Implementation:**

Data acquisition uses a standard smartphone (iPhone 12) at 60 fps with 1080 x 1920 pixel resolution. Validation was performed against the Noraxon Ultium Motion IMU system with sensors placed bilaterally on feet, shanks, thighs, and the lower back. Participants walked an 8-meter walkway while the smartphone recorded from a fixed frontal-view position.

**Validation Results:**

The system demonstrated high correlation and agreement between video-derived and wearable sensor measures across multiple populations (healthy controls and persons with dizziness) for key gait parameters:
- Gait speed
- Cadence
- Step duration and stride duration
- Stance time and swing time
- Double support time
- Step length

Mean absolute errors were lower than 10% of sensor-based estimates for all measures. The clinical analysis demonstrated that VisionMD-Gait can identify significant gait alterations in individuals with dizziness, including slower gait speed, reduced cadence, increased step duration, and prolonged stance and double support time -- consistent with a cautious gait strategy recognized as a predictor of fall risk.

**Key Advantages:**
- Requires only a smartphone with frontal-view video
- Works in standard clinical settings (no controlled laboratory needed)
- Can identify subclinical gait impairments before overt complaints
- Suitable for large-scale screening in community or primary care settings
- Enables longitudinal monitoring of intervention effectiveness

### 2.2 Remote Finger Tapping Assessment

Smartphone-based finger tapping tests have emerged as objective markers of bradykinesia in Parkinson's disease.

**Key Research Findings:**

A smartphone tapping test study (Cincinnati Cohort Biomarker Program, 2021-2023) with 295 PD patients and 62 healthy controls found that inter-tap variability (dysrhythmia), rather than tapping speed, is the most distinctive feature of PD-associated bradykinesia. At baseline, PD subjects showed higher inter-tap variability than controls (CV: 37 ms vs. 26 ms, p = 0.007). Over one year, only PD patients showed decreased tapping speed (p = 0.036), supporting the sensitivity of the measure to disease progression.

A proof-of-concept study using the cloudUPDRS smartphone tapping task demonstrated feasibility for discriminating ON-OFF medication fluctuations in the home setting. Thirty-two PD patients performed the task before medication intake and at 1 and 3 hours post-dose, repeated for 7 days. Key findings:
- Average compliance: 97.0%
- 50% of patients needed remote assistance
- Self-reported ON-OFF scores correlated with objective tapping measures (p < 0.0005)
- Good to excellent test-retest reliability for ON-state (ICC: 0.707-0.975)
- Discriminative accuracy for ON-OFF was AUC = 0.72-0.80 for right-hand tapping
- Seven-day learning effects were observed but ON-OFF differences remained significant

**Clinical Implications:**
Smartphone tapping tests offer scalable, objective monitoring of bradykinesia and medication response in naturalistic home settings, complementing traditional in-clinic assessments.

### 2.3 Telehealth Tremor Evaluation

Remote tremor assessment via video has been validated for essential tremor with promising results.

**Validation Study:**

An observational study by Smit et al. compared remote and in-person videotaped tremor examinations in 11 ET patients and 15 healthy controls. Two movement disorders specialists reviewed and rated both video sets. Results showed:
- Substantial agreement between remote and in-person tremor ratings (composite weighted kappa = 0.67)
- High mean Gwet's AC2 score (0.92)
- Mean percent agreement of 63.7%
- High diagnostic validity compared to intake diagnosis for both video types
- Lower agreement for less severe tremor cases (p = 0.008)

**Limitations Identified:**
- 48.1% of remote videos were rated as low quality, making scoring more difficult
- 4 ET cases had unavailable videos and could not be included in analysis
- Video quality differed significantly between remote and in-person recordings
- Raters were able to compensate for quality challenges, maintaining diagnostic accuracy

**Recommendations for Remote Tremor Assessment:**
- Guide patients/caregivers on proper filming techniques
- Ensure adequate lighting and stable camera positioning
- Provide clear uploading instructions, especially for older cohorts
- Use trained personnel for videotaping when possible
- Consider slow-motion review capability for accurate rating

### 2.4 Home Balance Assessment

The Berg Balance Scale (BBS) is the most commonly used balance outcome measure in stroke rehabilitation. Multiple studies have validated its remote administration.

**Synchronous vs. Asynchronous Tele-Assessment:**

A landmark study by Onal et al. (2023) with 36 stroke patients compared synchronous (real-time Zoom) and asynchronous (patient-recorded video) BBS administration against face-to-face assessment:

Interrater reliability results:
- Synchronous tele-assessment: ICC = 0.989 (95% CI: 0.978-0.994)
- Asynchronous tele-assessment: ICC = 0.997 (95% CI: 0.994-0.998)
- Both methods demonstrated excellent reliability

Intrarater reliability:
- Synchronous: ICC = 0.986-0.997 across raters
- Asynchronous: ICC = 0.982-0.995 across raters

Concurrent validity:
- Synchronous BBS vs. face-to-face BBS: r = 0.970
- Asynchronous BBS vs. face-to-face BBS: r = 0.945
- Both showed strong correlations with Tinetti Balance Test (r = 0.885-0.901)
- Moderate correlations with postural sway parameters (r = -0.40 to -0.54)

**Optimal Video Conditions for BBS:**

Venkataraman et al. found that reliable remote BBS rating requires:
- Frontal and lateral views for each assessment item
- High-definition video with high bandwidth
- Slow-motion review capability
- Proper camera positioning at safe distance (2.1-3.0 meters)
- A therapy assistant or caregiver present for safety and camera management

**Key Messages for Clinical Implementation:**
- Both synchronous and asynchronous BBS tele-assessment are viable alternatives to face-to-face
- Asynchronous assessment offers advantages for patients with limited internet connectivity
- The BBS is more suitable than the Tinetti Balance Test for patients with mediolateral balance problems
- Caregiver-mediated setup and safety spotting are essential for home-based balance assessment

---

## 3. Virtual Rehabilitation

### 3.1 Telerehabilitation Platforms

Post-stroke telerehabilitation has been extensively studied, with an umbrella review including 28 systematic reviews (n = 245 primary studies) demonstrating either significant effects or no significant differences compared to conventional rehabilitation across motor function, balance, gait, ADLs, and quality of life outcomes.

**Key Platform Features:**
- Internet-enabled computers with webcam and audio
- Smartphone/tablet-based mobile health applications
- Gaming input devices for interactive exercises
- Messaging and virtual reality systems
- Remote patient monitoring via wearable sensors
- Cloud-based data archiving and analysis

**Systematic Review Findings:**

The umbrella review found moderate- to high-quality evidence showing that telerehabilitation approaches produce outcomes comparable to conventional therapy:
- Upper limb motor function: Most studied outcome (20 systematic reviews)
- Activities of daily living: 18 systematic reviews
- Balance: 14 systematic reviews
- Gait: 7 systematic reviews
- Quality of life: 8 systematic reviews

Importantly, both simple approaches (telephone calls) and complex interventions (virtual reality, robot-assisted devices) showed effectiveness, suggesting that technology complexity is not the primary determinant of outcomes.

### 3.2 Home Exercise Program Tracking

Remote Therapeutic Monitoring (RTM) CPT codes, introduced in January 2022, enable digital monitoring of home exercise program adherence and therapeutic health data.

**Adherence Statistics:**
- Traditional home exercise programs: Only 35-50% of patients fully adhere
- 80% of information told to patients is immediately forgotten
- Patients receiving RTM check-ins: 94% more likely to adhere to home exercise programs
- RTM enables real-time data on adherence, pain levels, and functional changes

**Case Study: Remote Aerobic Exercise Monitoring in Parkinson's Disease:**

The CYCLE-II randomized clinical trial monitored 123 people with PD completing 22,000+ exercise sessions on a home-based commercial cycling platform. Results showed:
- 79% of participants were adherent (2-4 sessions/week)
- 8% were over-adherent (>4 sessions/week)
- 13% were under-adherent (<2 sessions/week)
- 87% achieved adherence or over-adherence with asynchronous PT supervision
- Shared decision-making using objective performance data guided exercise prescription
- The model was critical for continuing the project during the COVID-19 pandemic

**Physitrack and Commercial Platforms:**

Platforms like Physitrack offer 17,000+ exercises for creating personalized home exercise programs with patient-facing apps that track adherence, pain levels, and progress. Over 80,000 care providers use these tools, with features including exercise videos, pain tracking, outcome measures, and telehealth integration.

### 3.3 Remote Physiotherapy Supervision

Remote physiotherapy supervision combines real-time video conferencing with asynchronous video review to provide comprehensive rehabilitation support.

**Three-Phase Tele-Rehab Intervention Model:**

1. **Capture**: Patient films movement/exercise and sends video to the practitioner
2. **Analysis**: Specialist conducts video analysis using slow-motion, annotation, and comparison tools
3. **Sharing**: Consultation via live video face-to-face or shared presentation

**Dartfish Solution for Video Analysis:**
- Drawing tools and angle measurements
- Side-by-side and overlay comparison
- Slow-motion review capability
- Cloud-based video management
- Personalized video exercise programs
- Progress tracking over time

**Benefits of Video-Enhanced Tele-Rehabilitation:**
- Patients gain awareness of improper movement through video feedback
- Personalized data overlays increase engagement and understanding
- Practitioners can design customized video exercise programs
- Longitudinal progress tracking increases motivation and effectiveness
- Approximately 50-70% of physiotherapy treatment consists of applicable exercise protocols

### 3.4 Post-Stroke Remote Rehabilitation

Post-stroke telerehabilitation has demonstrated comparable effectiveness to in-clinic therapy across multiple high-quality trials.

**LANDMARK TRIAL: Cramer et al. (2019)**

This multi-center trial (11 US centers, n = 124) compared home-based telerehabilitation to in-clinic therapy for upper limb motor deficits:
- 36 treatment sessions over 6 weeks (70 min each)
- TR group completed 98.3% of assigned sessions; IC group completed 93.3%
- Mean Fugl-Meyer score change: TR = +7.86 points; IC = +8.36 points (p < 0.001 for both)
- Covariance-adjusted difference: 0.06 points (95% CI: -2.14 to 2.26; p = 0.96)
- Noninferiority margin of 2.47 fell outside the 95% CI, proving comparable effectiveness
- Stroke knowledge improved by 11% (TR) vs. 8.3% (IC)
- Key: 1,031 upper limb repetitions per day in telerehabilitation vs. ~32 per session in conventional therapy

**Meta-Analysis of Balance Outcomes:**

A meta-analysis of telerehabilitation for stroke balance (2023) found:
- Significant but small improvement in balance (SMD = 0.33; low-quality evidence)
- Significant but small improvement in functional mobility (SMD = 0.27; low-quality evidence)
- Telerehabilitation was associated with improved Berg Balance Scale scores
- Mini-BESTest improvements were significant within telerehabilitation groups
- No significant between-group differences in most studies, suggesting comparable effectiveness

**Collaborative Care Model (Wu et al., 2020):**

A Chinese study (n = 61) examined a collaborative telerehabilitation model involving neurologists, physiotherapists, nurses, counselors, and caregivers using the TCMeeting v6.0 videoconferencing system. Both intervention and control groups showed significant improvement in Fugl-Meyer, Berg Balance Scale, Timed Up and Go, and 6-Minute Walk Test over 12 weeks.

**Key Factors for Post-Stroke Telerehabilitation Success:**
- Exercise intensity: Telerehabilitation enables much higher repetition counts
- Patient motivation: Tele systems provide external and internal motivation
- Flexibility: Reduced transportation barriers improve adherence
- Social interaction: Video contact reduces isolation and depression
- Caregiver involvement: Essential for safety and exercise assistance
- Progress tracking: Objective monitoring of functional gains

---

## 4. Home Video Monitoring

### 4.1 Wearable and Video Fusion for Movement Monitoring

Multimodal approaches combining wearable sensors with video capture offer comprehensive movement monitoring capabilities for neurological conditions.

**Inertial Sensor Fusion:**

Wearable IMUs (Inertial Measurement Units) integrate accelerometers, gyroscopes, and magnetometers to provide comprehensive motion analysis. When sensor data is combined with video capture, the fused data eliminates individual sensor errors and provides a more complete representation of movement:

- **Accelerometers**: Measure linear movements (steps, jumps, activity counts)
- **Gyroscopes**: Track angular velocity and rotational movements
- **Magnetometers**: Determine orientation relative to Earth's magnetic field
- **Video**: Provides visual context, movement quality assessment, and spatial reference

**TelePark Multimodal Study:**

A pilot study evaluated a comprehensive telemedical intervention for PD including:
- Camera-system for movement recording
- Wearable sensors for continuous monitoring
- TelePark smartphone app for medication confirmation and self-reports
- Video consultations with movement disorder specialists
- Digitized Hauser diary for motor fluctuations

The system collected objective motor data while enabling remote clinical oversight, representing an integrated approach to home monitoring.

### 4.2 Passive Home Monitoring Ethics

The increasing use of continuous home monitoring for movement disorders raises important ethical considerations:

**Key Ethical Concerns:**
- **Privacy**: Continuous video recording in the home captures sensitive personal activities
- **Consent**: Patients must understand what data is collected, how it is used, and who has access
- **Data security**: Home video data requires HIPAA-compliant encryption and storage
- **Autonomy**: Passive monitoring may reduce patient agency in their own care
- **Dignity**: Video capture of impaired movements may affect patient dignity
- **Third-party exposure**: Family members and visitors may be inadvertently recorded
- **Data ownership**: Questions about who owns and controls recorded health data

**Ethical Best Practices:**
- Explicit informed consent for all recording types
- Clear data retention and deletion policies
- Transparent data use and sharing agreements
- Patient-initiated recording options alongside passive monitoring
- Ability to pause or disable monitoring at any time
- Secure, encrypted transmission and storage
- Limited access to authorized clinical personnel only

### 4.3 Patient Adherence to Home Recordings

**vTUG Study (App-Assisted Home-Based Video):**

A 12-week pilot study of the video Timed Up and Go test (vTUG) in 28 PD patients demonstrated:
- 19 patients completed the full 12-week study
- 17 of 19 recorded 10 or more videos
- 706 vTUGs with complete timings recorded overall
- Random Forest analysis identified "time to walk up" as the most important segment for predicting total time
- Variance was significantly higher between weeks than between consecutive tests (F = 6.50, p < 0.001)
- Patient-reported motor status significantly affected vTUG total time
- Model improved with additional variables (UPDRS gait subscore, footwear, chair type)

**Strategies to Improve Adherence:**
- Study-specific smartphone apps with guided instructions
- Reference evaluation videos demonstrating proper setup
- Safety instructions and caregiver involvement
- Weekly scheduled recordings with reminders
- System Usability Scale assessment of the technology
- Regular feedback and support from research/clinical teams
- Remote troubleshooting assistance as needed

### 4.4 Data Quality from Home Environments

**Challenges:**
- 48.1% of remote videos in one study were rated as low quality
- Inadequate lighting affects movement visibility
- Insufficient physical space limits assessment tasks
- Camera positioning errors obscure important movements
- Internet connectivity issues interrupt synchronous assessments
- Background clutter and household distractions
- Inconsistent flooring surfaces affect gait and balance assessment

**Mitigation Strategies:**
- Pre-session technology tutorials
- Reference videos demonstrating proper setup
- Written instructions for camera positioning and lighting
- Caregiver training for equipment setup and safety
- Quality check protocols before clinical rating
- Multiple video submissions to ensure usable data
- Adaptive assessment protocols for limited spaces

---

## 5. Asynchronous Video Review

### 5.1 Store-and-Forward Video in Neurology

Store-and-forward telehealth, in which patients transmit recorded video to providers for asynchronous review, is particularly valuable in neurology for paroxysmal events and movement disorder assessment.

**Applications in Neurology:**
- **Paroxysmal event diagnosis**: Recorded videos of seizure-like episodes enable retrospective expert review
- **Movement disorder assessment**: Video recordings allow frame-by-frame analysis of abnormal movements
- **Longitudinal monitoring**: Serial recordings track disease progression or treatment response
- **Clinical trial endpoint adjudication**: Blinded video review for consistent rating
- **Education and training**: Video libraries for rater certification and training

**Advantages of Asynchronous Review:**
- No requirement for real-time internet connectivity during recording
- Enables expert review by multiple specialists
- Allows slow-motion, frame-by-frame, and repeated viewing
- Facilitates consultation across time zones
- Reduces scheduling burden for patients and clinicians
- Enables higher-quality assessment through unhurried review

### 5.2 Clinician Video Annotation Workflows

Professional video analysis tools enhance the clinical utility of recorded movement assessments:

**Dartfish for Clinical Video Annotation:**
- Drawing tools for angle measurements and movement tracing
- Side-by-side comparison of different time points
- Overlay comparison for detecting subtle changes
- Slow-motion and frame-by-frame review
- Key position marking and event tagging
- Cloud-based organization and sharing

**Clinical Annotation Best Practices:**
- Standardized scoring rubrics applied consistently
- Blinded review to reduce bias in research settings
- Multiple independent raters with adjudication for disagreements
- Timestamped annotations linked to specific movement features
- Integration with electronic health records
- Secure cloud storage with access controls

### 5.3 Video Assessment Scheduling

**Optimal Scheduling Approaches:**
- **Medication-timed recordings**: Capture ON and OFF states at specific intervals
- **Symptom-triggered recordings**: Patient-initiated when symptoms worsen
- **Scheduled periodic recordings**: Weekly or monthly standardized assessments
- **Event-triggered recordings**: Automatic capture when wearable sensors detect events
- **Pre/post intervention recordings**: Before and after medication or therapy changes

**Considerations for Assessment Timing:**
- Time of day effects on motor symptoms (morning OFF states in PD)
- Post-medication timing for ON-state assessment
- Fatigue effects on gait and balance measures
- Postural blood pressure effects on balance
- Environmental factors (lighting, floor surface, footwear)

### 5.4 Patient-Initiated vs. Clinician-Assigned Recordings

**Patient-Initiated Recordings:**
- Capture symptoms at their most representative or severe
- Higher patient engagement and empowerment
- Useful for paroxysmal events that cannot be scheduled
- Risk of inconsistent quality and timing
- May miss important baseline or comparison data

**Clinician-Assigned Recordings:**
- Standardized timing and conditions enable longitudinal comparison
- Controlled assessment protocol improves reliability
- Can specify medication timing and environmental conditions
- Requires more patient compliance and scheduling coordination
- Reference videos ensure proper setup and task performance

**Recommended Hybrid Approach:**
- Clinician-assigned periodic standardized assessments for longitudinal tracking
- Patient-initiated recordings for symptom fluctuations and events of concern
- Both types integrated into a unified clinical dashboard
- Automated quality checks and feedback on submitted videos

---

## 6. Clinical Validation

### 6.1 Agreement Between In-Person and Video Assessments

**Summary of Agreement Statistics Across Assessments:**

| Assessment | Study | ICC/Correlation | Agreement Level |
|------------|-------|----------------|----------------|
| NIHSS Total | Shafqat et al. | ICC = 0.936 | Excellent |
| NIHSS Total | Demaerschalk et al. | r = 0.949 | Excellent |
| MDS-UPDRS Part III | Schneider et al. | ICC = 0.51 | Moderate |
| BBS Synchronous | Onal et al. | ICC = 0.989 | Excellent |
| BBS Asynchronous | Onal et al. | ICC = 0.997 | Excellent |
| Tremor Rating | Smit et al. | wK = 0.67 | Substantial |
| MoCA Remote | Adapted French | TBD | Feasible |
| Gait Parameters | VisionMD-Gait | MAE < 10% | High |
| Tapping Test | cloudUPDRS | ICC = 0.71-0.98 | Good-Excellent |
| PANESS Motor | Svingos et al. | ICC > 0.90 | Excellent |

### 6.2 Inter-Rater Reliability of Video-Based Ratings

**Key Inter-Rater Reliability Findings:**

The Berg Balance Scale via tele-assessment shows excellent inter-rater reliability:
- Synchronous: ICC = 0.989
- Asynchronous: ICC = 0.997
- SEM values are low (0.051-0.187), indicating minimal measurement error
- SDC95% values (0.141-0.526) support clinical utility for detecting change

For tremor ratings in essential tremor:
- Composite weighted kappa: 0.67 (substantial agreement)
- Mean Gwet's AC2: 0.92 (excellent)
- Lower agreement for less severe tremor cases

For the NIHSS subscales:
- Individual wK range: 0.285 (ataxia) to 0.646 (LOC questions)
- Most items show moderate agreement
- Total score reliability is consistently higher than individual items

For PANESS motor examination in youth:
- Timed Motor portion: ICC > 0.90 (excellent)
- Overall moderate to excellent reliability across subscores
- Particularly suited for video-based scoring

### 6.3 Feasibility Studies for Home Video Assessment

**Factors Affecting Feasibility:**

1. **Patient factors**: Age, disability level, cognitive function, technology literacy
2. **Technology factors**: Internet connectivity, device quality, software usability
3. **Environment factors**: Available physical space, lighting, flooring, ambient noise
4. **Caregiver factors**: Availability, willingness, technical capability
5. **Clinical factors**: Disease severity, symptom variability, safety considerations

**Feasibility Outcomes:**

- Telerehabilitation completion rates: 93-98% of assigned sessions
- Patient satisfaction: Consistently high across studies (80-95%)
- Adherence to home exercise programs: Improved from ~35% to ~87% with RTM
- Video assessment completion: 70-100% depending on patient population
- Need for technical assistance: 50% of patients in some studies

**Barriers to Implementation:**
- Administrative and licensing requirements
- Medicolegal ambiguity around remote assessment
- Financial sustainability and reimbursement
- Technology infrastructure limitations (especially in low-income countries)
- Educational level and technology literacy of patients
- Absence of standardized protocols for many assessments

---

## 7. Design Recommendations for Virtual Care Video Assessment

### 7.1 Technology Infrastructure
- Use standard smartphones (60 fps, 1080p minimum) for video capture
- Implement HIPAA-compliant cloud storage and transmission
- Support both iOS and Android platforms
- Design for variable internet connectivity (offline capture, later upload)
- Include quality check algorithms to flag inadequate recordings
- Provide reference videos and guided setup instructions

### 7.2 Assessment Protocol Design
- Develop modified assessment versions that exclude items requiring physical contact
- Create detailed patient/caregiver instruction guides for each assessment
- Include safety protocols and emergency procedures for home testing
- Build in quality assurance checks (lighting, distance, view angles)
- Support both synchronous (real-time) and asynchronous (recorded) modes
- Enable clinician annotation, slow-motion review, and comparison tools

### 7.3 Clinical Workflow Integration
- Integrate video assessments with electronic health records
- Create dashboards for monitoring patient adherence and data quality
- Establish schedules for periodic standardized and event-triggered assessments
- Design shared decision-making workflows using objective performance data
- Enable multi-rater review and adjudication workflows
- Implement automated alerts for clinically significant changes

### 7.4 Patient Experience Optimization
- Provide pre-session technology tutorials
- Include reference videos demonstrating proper setup and task performance
- Offer caregiver training materials for assistance with assessments
- Design for usability by older adults with limited technology experience
- Include remote troubleshooting support
- Gather and incorporate patient feedback iteratively

### 7.5 Ethical and Privacy Framework
- Obtain explicit informed consent for all recording types
- Implement end-to-end encryption for video data
- Establish clear data retention and deletion policies
- Ensure patient control over recording initiation and cessation
- Protect third parties inadvertently captured in recordings
- Comply with HIPAA and local health data regulations
- Provide transparency about AI/ML use in video analysis

---

## 8. Conclusions

Remote video assessment of neurological and movement disorders has matured significantly, accelerated by the COVID-19 pandemic and validated by numerous clinical studies. Key conclusions include:

1. **Many assessments translate well to video**: The NIHSS, Berg Balance Scale, MoCA (adapted), and tremor ratings demonstrate excellent to good reliability when administered remotely with proper protocols.

2. **Some examination components remain challenging**: Rigidity testing, postural stability assessment, and lower extremity tremor evaluation remain difficult or impossible via video. Modified assessment versions that acknowledge these limitations are needed.

3. **Asynchronous assessment is viable**: Store-and-forward video review offers excellent reliability for many assessments and provides important advantages for scheduling, quality of review, and access in resource-limited settings.

4. **Smartphone-based objective measures complement video**: Gait analysis, finger tapping, and wearable sensor fusion add quantitative data that enhances qualitative video assessment.

5. **Telerehabilitation is non-inferior to in-clinic therapy**: High-quality trials demonstrate comparable outcomes for motor function, balance, and quality of life, with the added benefits of increased exercise repetition and reduced transportation barriers.

6. **Implementation success depends on context**: Patient factors, technology infrastructure, physical environment, and caregiver availability all affect feasibility and data quality. Protocols must be adaptable to local contexts.

7. **Ethical frameworks must evolve with technology**: Privacy, consent, data security, and patient autonomy require careful attention as passive and continuous monitoring becomes more prevalent.

The evidence supports a hybrid model combining synchronous video visits, asynchronous video review, smartphone-based objective measures, and wearable sensor monitoring to deliver comprehensive remote neurological care. As AI-powered video analysis matures, the scalability and clinical utility of remote movement assessment will continue to improve.

---

## References (Key Studies)

1. Shafqat S, et al. Validation of a cloud-based tele-stroke system: reliability in determining NIHSS scores. Frontiers in Neurology, 2022.
2. Ning Wei, et al. Development and validation of a remote NIH stroke scale (rNIHSS). Clinical Neurology and Neurosurgery, 2025.
3. Demaerschalk BM, et al. Reliability of real-time video smartphone for assessing NIHSS scores in acute stroke. Stroke, 2012.
4. Schneider RB, et al. Design of a virtual longitudinal observational study in Parkinson's disease (AT-HOME PD). Annals of Clinical and Translational Neurology, 2021.
5. Stillerova T, et al. Remotely assessing symptoms of Parkinson's disease using videoconferencing: a feasibility study. Neurology Research International, 2016.
6. Onal B, et al. Validity and reliability of the Berg Balance Scale in different tele-assessment methods in patients with stroke. PM&R, 2023.
7. Venkataraman V, et al. Tele-assessment of the Berg Balance Scale. Journal of Neurologic Physical Therapy, 2020.
8. Cramer SC, et al. Efficacy of home-based telerehabilitation vs in-clinic therapy for adults after stroke. JAMA Neurology, 2019.
9. Smit MA, et al. Remote versus in-person videotaped neurologic examination for essential tremor. Movement Disorders Clinical Practice, 2021.
10. VisionMD-Gait. Scalable clinical gait assessment from smartphone videos. Scientific Reports, 2025.
11. cloudUPDRS smartphone tapping task study. Journal of Neural Transmission, 2023.
12. Finger tapping variability study. Journal of the Neurological Sciences, 2025.
13. Telerehabilitation and its impact following stroke: An umbrella review. PMC, 2023.
14. Effectiveness of telerehabilitation on balance and functional mobility in stroke survivors. PMC, 2023.
15. Home-based vTUG feasibility study for Parkinson disease. Journal of Clinical Medicine, 2025.
16. Abdolahi A, et al. Potential reliability and validity of a modified version of the UPDRS that could be administered remotely. Parkinsonism and Related Disorders, 2013.
17. Feasibility of multimodal telemedical intervention for Parkinson's disease. Journal of Clinical Medicine, 2022.
18. Svingos AM, et al. Inter-rater reliability of the revised PANESS scored using video review. Child Neuropsychology, 2023.
19. Telerehabilitation of post-stroke patients as a therapeutic solution. PMC, 2021.
20. Remote aerobic exercise monitoring in Parkinson disease. PMC, 2024.

---

*Report compiled from systematic literature review of peer-reviewed studies, clinical trials, and systematic reviews published 2012-2025.*

*Document version: 1.0*
*Last updated: July 2025*
