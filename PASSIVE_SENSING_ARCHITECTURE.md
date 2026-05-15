# Passive Sensing Architecture for Behavioural Health Monitoring

> **Research Synthesis Document**
> **Domain:** Passive Smartphone & Wearable Sensing, Digital Phenotyping, Privacy-Preserving Behavioural Monitoring
> **Date:** July 2025
> **Purpose:** Decision-support research for the design of ethical, technically sound passive sensing systems in mental health and psychiatric monitoring contexts.

---

## 1. Executive Summary

Passive sensing -- the continuous, unobtrusive collection of behavioural and physiological data from smartphones and wearable devices -- represents one of the most transformative developments in modern psychiatry. Former NIMH director Thomas Insel predicted its impact could surpass genomics by 2050. This document synthesises the current evidence base across sensor modalities, privacy-preserving architectures, consent frameworks, signal quality factors, false positive risks, clinical validation status, and anti-surveillance safeguards. It is intended as a decision-support reference for researchers, clinicians, and system architects designing passive sensing deployments.

---

## 2. Sensor Types: Evidence Base and Clinical Associations

### 2.1 Accelerometer

The accelerometer is the most widely studied smartphone sensor in mental health passive sensing. It captures physical movement, activity intensity, and device motion patterns that serve as proxies for psychomotor activity, sleep-wake cycles, and circadian rhythm regularity.

**Key Findings:**
- Accelerometer-derived movement indices are collected in approximately 60% of passive sensing mental health studies (25/42 studies in the largest scoping review to date).
- Physical activity features extracted from accelerometer data consistently show inverse associations with depression severity -- reduced step count and lower activity variance correlate with higher depression scores.
- Accelerometer displacement (measured as the root-mean-square of x, y, z axis displacement) was positively correlated with Hamilton Depression Rating Scale (HDRS) scores in a BiAffect study of bipolar disorder participants, suggesting psychomotor agitation rather than retardation in the studied cohort.
- Accelerometer-based activity features are central to circadian rhythm inference. Wu et al. (2022) demonstrated that accelerometer activity follows an intradaily distribution that starts earlier and winds down later than GPS-derived activity, exhibiting higher circadian rhythm strength but lower conformity to sinusoidal wave patterns.
- The combination of accelerometer and GPS data enables more robust circadian rhythm characterisation than either sensor alone, as each captures different facets of human activity.

**Clinical Validation Status:** Moderate -- supported by multiple independent studies but subject to device heterogeneity (different smartphone models produce different noise floors and sampling rates). Most studies use wrist-worn devices (76% of reviewed studies) rather than phone-based accelerometry.

### 2.2 GPS (Global Positioning System)

GPS data provide spatial mobility patterns including distance travelled, locations visited, time spent at home, and entropy (variety of location usage). These metrics serve as powerful digital biomarkers for negative symptoms, depression severity, and social withdrawal.

**Key Findings:**
- **Schizophrenia:** GPS mobility is a validated digital biomarker of negative symptoms. Participants with schizophrenia spent significantly more time at home, travelled shorter distances overall, and shorter distances from home compared to healthy controls, with medium to large effect sizes. Reduced GPS mobility was specifically associated with diminished motivation (rho = -0.341, p = 0.001) as measured by the CAINS motivation subscale. Notably, positive symptoms, depression, and neurocognition were not associated with GPS mobility, suggesting specificity to motivational deficits.
- **Bipolar Disorder vs. Major Depressive Disorder:** Fourier transform analysis of GPS-derived mobility patterns revealed diagnostic differences. BP patients exhibited greater periodicity and intensity in mobility patterns (1-day, 4-day, and 9-day cycles) that were absent in MDD. Entropy frequency data over one month effectively distinguished BP from MDD diagnoses.
- **Daily vs. Weekly Aggregation:** Daily GPS data showed stronger correlations with ecological momentary assessment (EMA)-reported mood states compared to weekly or monthly aggregations. Depressive states were associated with reduced location variance (OR 0.975, p = 0.008) and transition time (OR 0.048, p < 0.001) on weekdays, and lower entropy (OR 0.662, p = 0.001) on weekends.
- **Circadian Rhythm:** GPS-derived circadian rhythm metrics were associated with social support network size (r = 0.22, p = 0.03) and predicted changes in anxiety in bipolar disorder participants over a 10-week study period.

**Clinical Validation Status:** Moderate-to-Strong -- GPS mobility has been validated against EMA self-reports, clinician-rated scales (CAINS, SANS, BPRS), and case-control designs. However, GPS signal quality is highly dependent on environmental factors (urban canyons, indoor locations) and battery availability.

### 2.3 Microphone

Microphone-based sensing captures ambient audio, conversation frequency, and acoustic environment features. While powerful, it is the most privacy-sensitive sensor.

**Key Findings:**
- Conversation frequency extracted from microphone data has been used as an input to Social Rhythm Metric (SRM) inference models for bipolar disorder monitoring.
- Non-stationary duration (time spent in motion vs. stationary) combined with conversation frequency from microphone data achieved RMSE of 1.40 in predicting SRM scores (range 0-7), with personalised models improving to RMSE 0.92.
- Microphone-based speech analysis (prosodic features, vocal biomarkers) has been explored as an indicator of mood state and stress levels, though this requires careful handling to avoid recording conversation content.
- Most clinical implementations use acoustic feature extraction on-device to avoid transmitting raw audio, capturing only spectral features, voice activity detection, or conversation duration.

**Clinical Validation Status:** Weak-to-Moderate -- Limited independent replication. The primary barrier is privacy concern rather than technical limitation. Most microphone-based features are used as supplementary inputs to multimodal models rather than standalone biomarkers.

### 2.4 Keyboard / Keystroke Dynamics

Keystroke metadata captures typing speed, interkey delay, backspace rate, autocorrect rate, session length, session count, and circadian baseline similarity. These features reflect psychomotor speed, cognitive state, and diurnal activity patterns.

**Key Findings:**
- The BiAffect study demonstrated that keystroke metadata alone predicted depression severity (HDRS-17) with marginal R-squared = 0.41 and conditional R-squared = 0.63. Mania severity (YMRS log scores) was predicted with R-squared = 0.34.
- **Significant predictors of depression:** Accelerometer displacement (beta = 3.20, p = 0.002), average interkey delay (beta = 2.88, p = 0.02), session count (beta = 2.18, p = 0.003), and autocorrect rate (beta = 2.67, p = 0.004).
- **Significant predictors of mania:** Accelerometer displacement (positive correlation, p = 0.003) and backspace rate (negative correlation, p = 0.01).
- Typing speed has been identified as a predictor of attention and processing skills, correlating with depressive symptoms across multiple studies. The BiAffect app demonstrated that time, quality, and duration of typing sessions could forecast depression scores in BD participants.
- Session count was positively correlated with depression (counter to the initial hypothesis), possibly reflecting passive social media consumption patterns rather than active social engagement.

**Clinical Validation Status:** Moderate -- supported by several independent studies but limited by small sample sizes (median 60.5 participants across reviewed studies) and the requirement for custom keyboard installation, which introduces selection bias.

### 2.5 Screen Time / Screen State

Screen on/off patterns, screen unlock frequency, and app usage duration are among the simplest yet most informative smartphone-derived digital biomarkers.

**Key Findings:**
- Screen time shows statistically significant differences between depressed and non-depressed participants. People with depression show increased frequency and duration of phone usage (Saeb et al., 2015).
- Screen usage patterns have been successfully used in ML models to predict depression severity, with positive correlations between screen activity patterns and depressive symptoms.
- In a digital phenotyping study of depression variability, morning screen usage was a significant within-person predictor of higher depression severity (beta = 0.35, 95% CI = [0.04-0.65], p = 0.027).
- The Carat app study successfully predicted depression severity based on screen and internet connectivity metrics.
- Screen-on patterns provide circadian rhythm information, capturing wake/sleep boundaries and nighttime awakenings.

**Clinical Validation Status:** Moderate -- large effect sizes in multiple studies but confounded by occupation, device type, and cultural norms around smartphone use.

### 2.6 Calls / SMS

Communication metadata (call frequency, duration, SMS sent/received counts) captures social connectedness and social withdrawal patterns.

**Key Findings:**
- In a digital phenotyping study of depression, morning incoming SMS count was associated with higher depression severity (beta = 0.36, p = 0.022), while daily outgoing SMS count was associated with lower depression severity (beta = -0.36, p = 0.022), suggesting that the directionality of communication is clinically meaningful.
- Nighttime communication app usage was a significant within-person predictor of depression severity (beta = 0.31, p = 0.042).
- Call and SMS metadata have been used as proxy measures for social support network size.
- Communication patterns are standard inputs to multimodal depression prediction models in the SWARTS-DA and similar protocols.

**Clinical Validation Status:** Moderate -- well replicated across studies. The primary limitation is that communication metadata is increasingly incomplete as users shift to encrypted messaging platforms (WhatsApp, Signal, iMessage) that may not expose metadata at the OS level.

### 2.7 App Usage

App-level usage data provides rich behavioural signals including social media engagement, entertainment consumption, and communication patterns.

**Key Findings:**
- App usage patterns (which apps are opened, for how long, and at what times) are used in 40%+ of passive sensing mental health studies.
- Communication app usage at night was identified as a significant predictor of depression severity.
- App usage entropy (variety of app categories used) has been explored as a marker of behavioural diversity and routine.
- Combined with screen state data, app usage patterns contribute to circadian rhythm inference.

**Clinical Validation Status:** Weak-to-Moderate -- highly dependent on OS-level access (Android vs. iOS have different app usage APIs), and rapidly evolving as app ecosystems change.

### 2.8 Wearable-Derived Biomarkers

Wearable devices (smartwatches, fitness trackers) provide physiological signals not available from smartphones alone.

**Key Findings:**
- **Heart Rate:** Collected in 67% of passive sensing mental health studies (28/42), heart rate and heart rate variability (HRV) are among the strongest biomarkers for depression and anxiety.
- **Step Count:** Collected in 40% of studies (17/42), step count inversely correlates with depression severity across multiple cohorts.
- **Sleep:** Wearable-derived sleep duration and quality are significant predictors. Average sleep duration was associated with depression severity (beta = 0.39, p = 0.006) in a within-person analysis.
- **Electrodermal Activity (EDA):** Available on specialised wearables (e.g., Proteus patch), EDA captures sympathetic nervous system arousal and has been linked to mood state fluctuations in bipolar disorder.
- **Skin Temperature, SpO2, Blood Pressure:** Emerging biomarkers with preliminary evidence but limited clinical validation.

**Clinical Validation Status:** Moderate-to-Strong for heart rate and step count; Moderate for sleep; Weak for EDA and other emerging modalities.

---

## 3. Privacy-Preserving Techniques

### 3.1 Edge Processing (On-Device Computation)

Edge processing refers to performing all or most computation on the user's device before transmitting only derived features or summary statistics to central servers.

**Design Principles:**
- Raw sensor data (e.g., GPS coordinates, accelerometer time series) never leave the device.
- Only pre-computed features (e.g., total distance travelled, step count, screen unlock count) are transmitted.
- Feature extraction algorithms run locally using embedded AI accelerators or low-power co-processors.
- The computational burden is shifted from the cloud to the device, reducing both latency and privacy risk.

**Evidence:** The Delphi study on ethical digital phenotyping development (Martinez-Martin et al., 2020) found strong consensus that raw data should always be encrypted when stored or transmitted, and that edge processing is a preferred approach for minimising privacy risk. Ultra-low-power neuromorphic chips and domain-specific AI accelerators are expected to enable increasingly sophisticated on-device analytics without cloud dependency.

### 3.2 Differential Privacy

Differential privacy (DP) is a mathematical framework that ensures the output of a computation on a dataset is statistically indistinguishable whether or not any single individual's data is included.

**Application to Passive Sensing:**
- DP mechanisms add calibrated noise to aggregate statistics before publication or model training.
- The epsilon (epsilon) parameter controls the privacy-utility trade-off; smaller epsilon = stronger privacy but lower accuracy.
- Local differential privacy (LDP) applies noise at the individual device level before data aggregation, providing the strongest privacy guarantee.
- Standards and approaches to minimise reidentification risk, such as differential privacy measures, were endorsed by Delphi panel consensus in digital phenotyping ethics research.

**Limitations:** DP is primarily suited for aggregate analysis and population-level model training. Individual-level clinical monitoring requires careful calibration, as excessive noise can obscure clinically meaningful signals.

### 3.3 Data Minimisation

Data minimisation is the principle of collecting only the data strictly necessary for the stated purpose.

**Implementation Strategies:**
- **Sensor selection:** Only collect data from sensors directly relevant to the clinical question (e.g., accelerometer + GPS for depression monitoring; not microphone unless conversation features are clinically justified).
- **Temporal minimisation:** Use duty cycling (e.g., GPS sampling every 5 minutes rather than continuous) to reduce data volume and battery impact.
- **Feature-level minimisation:** Extract and transmit only validated features rather than raw sensor streams.
- **Retention limits:** Automatically delete raw data after feature extraction; retain only derived features and summary statistics.
- **Purpose limitation:** Data collected for depression monitoring should not be repurposed for other analyses without renewed consent.

**Evidence:** The JMIR scoping review (2025) found that only 14% of passive sensing studies (6/42) addressed anonymisation, highlighting a significant gap in data minimisation practice across the field. The m-Path framework identifies data minimisation as a core ethical requirement alongside informed consent and secure storage.

### 3.4 Federated Learning

Federated learning enables model training across decentralised devices without centralising raw data. Only model parameter updates (gradients) are shared, not individual data points.

**Benefits:**
- Raw behavioural data never leaves the user's device.
- Enables training on much larger, more diverse datasets than any single institution can collect.
- Supports transfer learning for personalised baselines while preserving privacy.

---

## 4. Consent Frameworks

### 4.1 Granular Consent

Granular consent allows users to selectively opt in to specific sensors, data types, and analysis purposes rather than providing blanket consent for all data collection.

**Design Elements:**
- Per-sensor consent toggles (e.g., "Allow GPS location tracking?" separate from "Allow accelerometer access?").
- Per-purpose consent (e.g., "Use my data for depression screening" separate from "Use my data for research").
- Sixth-grade reading level for all consent language (Delphi consensus recommendation).
- Clear disclosure of what inferences can be drawn from each sensor type, who data will be shared with, and for how long it will be retained.

**Key Evidence:** Martinez-Martin et al. (2018) found that Delphi panelists reached strong consensus that consent should be required when personal data are collected, and that consent should include information at sixth-grade level regarding types of data collected, inferences drawn, reports made, sharing recipients, risks, benefits, and limitations. Granular consent was endorsed as a mechanism to address the power asymmetry inherent in digital phenotyping.

### 4.2 Dynamic Informed Consent

Dynamic informed consent (DIC) is an ongoing consent process where participants are re-engaged and asked to re-consent as the study or clinical use evolves.

**Mechanisms:**
- Periodic re-consent prompts when new sensors are activated or new analyses are performed.
- Real-time notifications when unexpected data patterns trigger automated inferences.
- Ability to modify consent preferences at any time through a user-facing dashboard.
- Consent to data collection is separate from consent to inference generation -- participants can consent to raw data collection while declining AI-based psychometric predictions.

**Evidence:** The Belmont Report principles (respect for persons, beneficence, justice) have been applied to develop ethical frameworks for returning individual digital phenotyping results to clients in mental healthcare (Shen et al., 2024). Dynamic consent was identified as essential because the achievability of complete informed consent at a single time point is arguable given the complexity of data collection, inference generation, and downstream health implications.

### 4.3 Withdrawal Mechanisms

Robust withdrawal mechanisms must allow users to cease data collection and request deletion of previously collected data.

**Requirements:**
- **Immediate data collection stop:** A single action (e.g., toggle in app settings) must halt all passive data collection immediately.
- **Data deletion request:** Users must be able to request deletion of all raw and derived data within a specified timeframe (e.g., 30 days per GDPR requirements).
- **Right to be forgotten:** Complete removal of individual data from all databases, models, and backups.
- **Research data exception:** If data has already been included in published research datasets, the user must be informed that complete deletion may not be possible for those specific datasets.
- **No penalty withdrawal:** Withdrawal must not affect access to clinical care or other services.

**Evidence:** GDPR Article 17 (Right to Erasure) and the California Consumer Privacy Act establish legal frameworks for data deletion. The Delphi consensus study recommended that users must have an option to opt out of sharing data with third parties at any time. However, panelists noted that "consent is not needed for analysis of deidentified data by a trusted entity; but public information about the process, including return of aggregate results, is essential."

---

## 5. Signal Quality Factors

### 5.1 Battery Life

Battery drain is the most common reason for participant attrition in passive sensing studies.

**Factors:**
- GPS is the most battery-intensive sensor; continuous GPS sampling can drain a smartphone battery within 4-6 hours.
- Accelerometer sampling is relatively low-power but contributes to drain when combined with other sensors.
- Microphone activation requires significant power and is typically limited to short sampling windows.
- **Mitigation:** Adaptive sampling (reduce GPS frequency when device is stationary), low-power mode triggers, and participant education about charging habits.
- **Evidence:** Morning battery level variability was a significant within-person predictor of depression severity (beta = 0.39, p = 0.019), suggesting that battery-charging behaviour itself may be a behavioural biomarker reflecting self-care routine regularity.

### 5.2 Permissions

Modern mobile operating systems (iOS, Android) have increasingly restrictive permission models that affect data availability.

**iOS Limitations:**
- Background location access requires "Always Allow" permission, which users may deny.
- App usage data access is restricted and requires special entitlements.
- Microphone access in background is heavily restricted and requires explicit user approval.
- iOS 17+ introduced additional privacy protections for motion sensors.

**Android Limitations:**
- Android 10+ requires "Allow all the time" permission for background location, which many users deny.
- Doze mode and App Standby can interrupt background data collection.
- Different OEMs (Samsung, Xiaomi, Huawei) implement aggressive battery optimisation that kills background processes.

### 5.3 User Habits

User behaviour significantly affects signal quality and completeness:

- **Device non-carry:** Participants may leave their phone on a desk, in a bag, or in another room, resulting in missing accelerometer and GPS data.
- **Multiple devices:** Users may switch between a work phone and personal phone, fragmenting the data stream.
- **Phone charging behaviour:** Irregular charging patterns result in periods of no data collection.
- **App uninstallation:** Passive sensing apps have higher uninstallation rates than active engagement apps due to battery and privacy concerns.
- **Seasonal and holiday effects:** Extended data aggregation can obscure meaningful variations caused by seasonal changes or holidays, diluting the significance of extreme movements.

### 5.4 Missing Data Thresholds

The JMIR scoping review found that 45% of studies (19/42) had monitoring periods of less than 7 days, which is insufficient for reliable behavioural pattern detection. Future research should prioritise monitoring windows of at least 3 months to capture the dynamic evolution of mental health states. Data quality control processes should define thresholds for acceptable missing data (e.g., at least 70% daily data completeness for valid analysis).

---

## 6. False Positive Risks

### 6.1 Context Unawareness

Passive sensing systems lack contextual awareness that is essential for accurate interpretation:

- **Work demands:** A person working a night shift will have inverted circadian rhythm patterns that could be misclassified as depression-related sleep disturbance.
- **Vacation vs. withdrawal:** Reduced mobility during a vacation could be flagged as social withdrawal; increased mobility during a manic episode could overlap with active holiday behaviour.
- **Physical illness:** Reduced step count and increased time at home may reflect physical illness (flu, injury) rather than depression onset.
- **Seasonal patterns:** Winter reduction in outdoor activity and GPS mobility is normal in many climates but could be flagged as depression.
- **Cultural context:** Communication patterns, social norms around device usage, and acceptable levels of screen time vary significantly across cultures and socioeconomic contexts.

### 6.2 Device Sharing

Device sharing introduces fundamental ambiguity in passive sensing data:

- Shared family phones mean that accelerometer, screen time, and app usage data may reflect multiple users' behaviour.
- In the Korail slum study (Bangladesh), 92% of participants had access to smartphones through family members, and only 45% owned a personal device. This pattern is common in low- and middle-income countries.
- GPS data from a device carried by multiple people cannot reliably attribute location patterns to any single individual.
- Keystroke dynamics require personal device use; if the device is shared, typing patterns are uninterpretable.

### 6.3 Technical False Positives

- **GPS dropout:** Loss of GPS signal indoors or in urban canyons may be misinterpreted as being stationary at home.
- **Sensor noise:** Different smartphone models have different accelerometer noise floors and sampling rates, introducing measurement bias.
- **OS updates:** Operating system updates can change permission models, background process behaviour, and sensor APIs, introducing discontinuities in data collection.
- **Algorithm drift:** Machine learning models trained on one population may not generalise to different demographics, devices, or contexts. 98% of features showed mixed correlations across participants in a depression variability study, being positive for some and negative for others.

### 6.4 Behavioural Variability

A landmark study on behavioural variability in digital phenotyping (medRxiv, 2025) found:

- Sample-level analysis revealed weak associations between only 3.1% (3/98) of features and depression severity.
- At the individual level, 98% of features (96/98) showed mixed correlations across participants -- positive for some, negative for others.
- Between-person differences explained 58.5% of depression severity variance, indicating that population-level models have limited individual predictive validity.
- This demonstrates that ignoring individual differences in depression symptoms and associated behaviours can lead to misleading conclusions and poor generalisation.

---

## 7. Clinical Validation Status by Sensor Type

| Sensor | Depression | Anxiety | Bipolar | Schizophrenia | Overall Status |
|--------|-----------|---------|---------|---------------|----------------|
| Accelerometer / Steps | Strong evidence | Moderate | Moderate | Limited | **Moderate-Strong** |
| GPS / Mobility | Strong evidence | Moderate | Strong (BD vs MDD) | Strong (negative symptoms) | **Moderate-Strong** |
| Heart Rate (wearable) | Strong evidence | Strong | Moderate | Limited | **Moderate-Strong** |
| Sleep (wearable) | Strong evidence | Moderate | Moderate | Limited | **Moderate** |
| Screen Time | Moderate | Limited | Limited | Limited | **Moderate** |
| Keystroke Dynamics | Moderate | Limited | Moderate | None | **Moderate** |
| Calls / SMS | Moderate | Limited | Limited | Limited | **Moderate** |
| Microphone | Limited | Limited | Limited (SRM) | None | **Weak-Moderate** |
| App Usage | Moderate | Limited | Limited | None | **Weak-Moderate** |
| EDA (wearable) | Limited | Limited | Moderate | None | **Weak** |

**Key Caveats:**
- Only 2% of reviewed studies (1/42) conducted external validation on independent datasets.
- 76% of studies used a single device type, limiting cross-platform generalisability.
- 76% of studies had fewer than 100 participants (median = 60.5, IQR = 54-99).
- Most studies are short-term (45% monitored for less than 7 days).
- Longitudinal studies of 3+ months are needed for clinical translation.

### 7.1 Regulatory Landscape

The U.S. FDA issued Digital Health Technologies (DHT) guidance in December 2023 for remote data acquisition in clinical investigations. Key requirements:

- DHT-derived measures must be "fit for purpose" -- measuring the concept of interest with sufficient accuracy and reliability.
- The Verification-Analytical Validation-Clinical Validation (V3) paradigm applies:
  - **Verification:** Do sensors meet technical specifications? (e.g., bench-testing accelerometer accuracy)
  - **Analytical Validation:** Do algorithms transform raw signals into accurate, reproducible measures? (e.g., comparing algorithm-derived step counts with gold-standard manual counts)
  - **Clinical Validation:** Does the measure answer a specific clinical question in its context of use?

The European Medicines Agency (EMA) has similar biomarker qualification programs. However, the "validation floor" does not yet exist for most passive sensing-derived digital biomarkers -- the hardware is scaling faster than the evidentiary standards required to use it in regulated clinical trials.

---

## 8. Anti-Surveillance Safeguards

### 8.1 Transparency Requirements

- All data collection, storage, and analysis practices must be documented in plain language at sixth-grade reading level.
- Users must be informed of what inferences can be drawn from their data, who will have access, and how long data will be retained.
- Regular security audits and independent ethics review must be conducted with transparent processes.
- Open-source data processing pipelines enable external validation and scrutiny of analytical choices.

### 8.2 Data Security Standards

- **Encryption:** All raw data must be encrypted both in transit (TLS 1.3+) and at rest (AES-256).
- **Surrogate identifiers:** Potential identifiers (phone numbers, IP addresses, GPS coordinates near home) must be replaced with hashed or encrypted surrogates.
- **Reidentification review:** Periodic review must be conducted to re-evaluate whether identifying information can be drawn from de-identified data, particularly when combined with other available datasets.
- **Access controls:** Role-based access control with minimum necessary privilege; access logs and audit trails for all data interactions.
- **Security audits:** Independent security reviews and audits of data practices should be implemented at least annually.

### 8.3 Bias and Fairness Protections

- Algorithmic bias detection across gender, race, age, and socioeconomic groups is essential.
- A digital phenotyping model for depression severity showed notable sex-based bias, overrepresenting female participants.
- Training data must represent diverse populations, including low- and middle-income countries where smartphone ownership patterns differ (frequent device sharing, lower personal ownership rates).
- Fairness constraints should be embedded in model training to prevent discriminatory predictions.

### 8.4 Anti-Surveillance Design Principles

1. **No covert collection:** All passive sensing must be explicitly disclosed and consented to. No data collection should occur without ongoing user awareness.
2. **No third-party sharing without explicit opt-in:** Data sharing for research or commercial purposes requires separate, explicit consent.
3. **No behavioural profiling outside clinical purpose:** Data collected for depression monitoring must not be used for advertising, insurance risk scoring, or criminal justice purposes.
4. **User-facing dashboards:** Participants must have access to a dashboard showing what data has been collected, what inferences have been made, and how their data has been used.
5. **Clinical oversight:** All automated inferences should be reviewed by qualified clinicians before being used for treatment decisions. Passive sensing is decision-support, not diagnostic.
6. **Right to explanation:** Users have the right to meaningful explanation of any automated decision or inference affecting their care.
7. **Periodic consent renewal:** Consent must be renewed at defined intervals (e.g., every 3 months) with an opportunity for users to review and modify their preferences.
8. **No punitive use:** Data revealing missed medication, substance use, or other sensitive behaviours must not be used punitively by employers, insurers, or criminal justice systems.

### 8.5 Governance Framework

The Delphi consensus study (Martinez-Martin et al., 2020) identified five pillars for ethical digital phenotyping governance:

1. **Privacy and Data Protection:** Strongest consensus area. Raw data is not able to be "non-identifying" and consent should be a norm when using or sharing personal data with potential health implications.
2. **Transparency:** Information regarding collection, storage, and dissemination must be available to users at all times.
3. **Consent:** Dynamic informed consent with granular controls and clear withdrawal pathways.
4. **Accountability:** Independent ethics review, security audits, and clear responsibility chains.
5. **Fairness:** Bias detection, diverse training data, and equitable access to technology benefits.

---

## 9. Technical Architecture Recommendations

### 9.1 Multi-Modal Fusion Pipeline

A clinically viable passive sensing system should integrate multiple sensor streams:

```
[Smartphone Sensors]          [Wearable Sensors]
  - GPS                          - Heart Rate
  - Accelerometer                - Step Count
  - Screen State                 - Sleep Stages
  - Keyboard Metadata            - HRV
  - App Usage                    - EDA (optional)
  - Calls/SMS Metadata           - Skin Temp
         |                               |
         v                               v
   [Edge Processing]            [Edge Processing]
   - Feature Extraction          - Feature Extraction
   - Noise Filtering             - Anomaly Detection
   - Privacy Transform           - Privacy Transform
         |                               |
         +---------------+---------------+
                         |
                  [Fusion Layer]
                  - Multi-modal ML Model
                  - Temporal Context
                  - Personal Baseline
                         |
                  [Inference Layer]
                  - Risk Stratification
                  - Change Detection
                  - Anomaly Flagging
                         |
                  [Clinical Dashboard]
                  - Decision Support Output
                  - Clinician Review Queue
                  - Patient-Facing Summary
```

### 9.2 Quality Control Pipeline

1. **Data completeness check:** Flag days with <70% sensor coverage.
2. **Anomaly detection:** Identify and flag sensor malfunctions, permission denials, or device changes.
3. **Personal baseline calibration:** Establish individual behavioural baselines over 2+ weeks before generating alerts.
4. **Context enrichment:** Integrate calendar data, weather, and known events to reduce false positives.
5. **Temporal smoothing:** Apply appropriate windowing (daily > weekly > monthly for most behavioural features).
6. **Missing data imputation:** Use last-observation-carried-forward or model-based imputation for short gaps only.

---

## 10. Key Gaps and Future Directions

### 10.1 Research Gaps

1. **Large-scale longitudinal studies:** The field urgently needs studies with N > 1000 and monitoring periods of 3+ months.
2. **External validation:** Only 2% of studies conduct external validation; cross-site replication is essential.
3. **Diverse populations:** Most studies are conducted in high-income countries with predominantly educated, younger participants.
4. **Standardised protocols:** No standardised data collection, preprocessing, or feature engineering protocols exist, limiting comparability.
5. **Multimodal fusion:** While individual sensors show promise, optimal fusion strategies for combining sensor streams remain underexplored.

### 10.2 Ethical Gaps

1. **Anonymisation practices:** Only 14% of studies address anonymisation in published reports.
2. **Regulatory frameworks:** No jurisdiction has comprehensive regulations specifically addressing digital phenotyping for mental health.
3. **Device-sharing contexts:** Ethical frameworks must account for contexts where personal device ownership is not universal.
4. **Return of results:** Standards for returning individual digital phenotyping results to participants and clinicians are still emerging.
5. **Clinician education:** Most clinicians lack training in interpreting digital biomarker data; adoption barriers must be scientifically understood and addressed.

### 10.3 Technical Gaps

1. **Cross-platform standardisation:** Android vs. iOS sensor APIs produce different data quality and availability; cross-platform normalisation is unsolved.
2. **Battery optimisation:** Long-term data collection (>6 months) with acceptable battery drain remains a challenge.
3. **Personalised models:** Given the high inter-individual variability in behavioural patterns, population-level models have limited individual predictive validity. Personalised baselines and transfer learning approaches are needed.
4. **Explainable AI:** Deep learning models achieve high accuracy (e.g., 92.16% for anxiety detection using CNN-LSTM) but lack interpretability, which is essential for clinical adoption.

---

## 11. Summary Table: Sensor-Condition Matrix

| Sensor Modality | Primary Conditions | Key Features | Validation Level | Privacy Risk |
|-----------------|-------------------|--------------|-----------------|--------------|
| Accelerometer | Depression, Sleep | Step count, activity intensity, circadian rhythm | Moderate-Strong | Low |
| GPS | Depression, Schizophrenia, BD | Location variance, entropy, distance from home, transition time | Moderate-Strong | High |
| Heart Rate (wearable) | Depression, Anxiety | Resting HR, HRV, circadian phase | Moderate-Strong | Low |
| Sleep (wearable) | Depression, BD | Duration, efficiency, timing | Moderate | Low |
| Screen State | Depression | Unlock frequency, duration, circadian boundary | Moderate | Medium |
| Keystroke | BD, Depression | Interkey delay, backspace rate, session count | Moderate | High |
| Calls/SMS | Depression | Frequency, directionality, timing | Moderate | Medium |
| Microphone | BD (SRM) | Conversation frequency, voice activity | Weak-Moderate | Very High |
| App Usage | Depression | App category entropy, duration, timing | Weak-Moderate | Medium |

---

## 12. References and Sources

1. JMIR (2025). Passive Sensing for Mental Health Monitoring Using Machine Learning With Wearables and Smartphones: Scoping Review. *J Med Internet Res*, 27:e77066.
2. Wu C et al. (2022). Circadian rhythms are not captured equal: Exploring circadian metrics from smartphone accelerometer and GPS. *Digit Health*.
3. Fourier Transform Analysis of GPS Mobility Patterns for Diagnosis and Mood Monitoring of Bipolar and MDD (2025). *J Med Internet Res*, 27:e71658.
4. GPS mobility as a digital biomarker of negative symptoms in schizophrenia (2019). *PMC*.
5. Cao J et al. (2018). Predicting Mood Disturbance Severity with Mobile Phone Keystroke Metadata. *JMIR*, 20(7):e241.
6. Variability in Self-reported Depression Symptomology and Mobile-Sensed Behavioral Patterns (2025). *medRxiv*.
7. Martinez-Martin N, Insel TR et al. (2018). Data mining for health: staking out the ethical territory of digital phenotyping. *npj Digital Medicine*, 1:68.
8. Martinez-Martin N et al. (2020). Ethical Development of Digital Phenotyping Tools for Mental Health Applications: Delphi Study. *PMC*.
9. Ethical, Legal and Social Issues of Digital Phenotyping (2023). *HAL Science*.
10. Ethical Dimensions of Digital Phenotyping Within the Context of Mental Healthcare (2024). *Springer*.
11. Smartphone Sensor Data for Identifying and Monitoring Symptoms of Mood Disorders (2022). *JMIR Ment Health*, 9(5):e35549.
12. Automatic detection of social rhythms in bipolar disorder using passively-sensed smartphone data. *PMC*.
13. Measuring Daily Activity Rhythms in Young Adults at Risk of Affective Instability (2022). *Science Direct*.
14. Braund TA et al. (2022). Smartphone sensor data for mood disorder monitoring. *JMIR Ment Health*.
15. FDA (2023). Digital Health Technologies for Remote Data Acquisition in Clinical Investigations.
16. Using Smartphone-Tracked Behavioral Markers to Recognize Depression and Anxiety (2025). *PMC*.
17. The implementation of digital biomarkers in diagnosis and monitoring of mood disorders (2025). *Frontiers in Digital Health*.
18. Challenges and potential of using digital biomarkers in healthcare (2026). *Nature Communications Medicine*.
19. MDPI (2025). A Comprehensive Survey on Wearable Computing for Mental and Physical Health Monitoring. *Electronics*, 14(17):3443.
20. Investigating Awareness and Acceptance of Digital Phenotyping (2024). *PMC*.
21. Redefining and Validating Digital Biomarkers as Fluid Dynamic Patterns (2022). *PMC*.

---

*Document generated for decision-support research purposes. All clinical interpretations should be validated against peer-reviewed sources and regulatory guidance.*
